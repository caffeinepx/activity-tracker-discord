


import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

import { getRetentionCutoffMs, getWhitelistedIds } from "./settings";
import { PresenceLogEntry, ProfileChanges, ProfileSnapshot, UserStalkerConfig } from "./types";
import {
    buildPresenceNotifyCopy,
    extractProfileCosmetics,
    formatTimestamp,
    getDurationLabel,
    logger,
    statusMatchesNotifyToggle,
} from "./utils";

/** Always resolve at call time — native helpers may not exist yet when the module first loads. */
export function getNativeHelper(): PluginNative<typeof import("./native")> | null {
    try {
        const helpers = typeof VencordNative !== "undefined" ? VencordNative.pluginHelpers : null;
        if (!helpers) return null;
        return (helpers.ActivityTracker
            ?? helpers["Activity Tracker"]
            ?? helpers.Activity_Tracker
            ?? null) as PluginNative<typeof import("./native")> | null;
    } catch {
        return null;
    }
}

export function isDesktopEnv() {
    return !!getNativeHelper();
}

/** Prefer isDesktopEnv() — this is updated on each loadPresenceLogs call */
export let isDesktop = false;

export async function readUserLogs(userId: string, cutoffMs?: number): Promise<PresenceLogEntry[]> {
    const native = getNativeHelper();
    if (native) {
        return await native.readLogs(userId, cutoffMs);
    }
    try {
        const logs = await DataStore.get(`stalker-logs-${userId}`) as PresenceLogEntry[] | undefined;
        if (!Array.isArray(logs)) return [];
        if (cutoffMs) {
            return logs.filter(log => log.timestamp >= cutoffMs);
        }
        return logs;
    } catch (e) {
        logger.error(`Failed to read web logs for user ${userId}`, e);
        return [];
    }
}

export async function appendUserLog(userId: string, entry: PresenceLogEntry, cutoffMs: number) {
    const native = getNativeHelper();
    if (native) {
        // Native path is append-only; cutoff only applied on read (never rewrite-wipe)
        await native.appendLog(userId, entry, cutoffMs);
        return;
    }
    try {
        // Web/DataStore: append without discarding history that failed to load
        const existing = await readUserLogs(userId); // no cutoff — keep full store
        const next = [entry, ...(Array.isArray(existing) ? existing : [])];
        // Soft cap for browser storage only (native uses jsonl files)
        const MAX_WEB_LOGS = 50_000;
        await DataStore.set(
            `stalker-logs-${userId}`,
            next.length > MAX_WEB_LOGS ? next.slice(0, MAX_WEB_LOGS) : next
        );
    } catch (e) {
        logger.error(`Failed to append web log for user ${userId}`, e);
    }
}

export async function deleteUserLogs(userId: string) {
    const native = getNativeHelper();
    if (native) {
        await native.deleteLogs(userId);
        return;
    }
    try {
        await DataStore.del(`stalker-logs-${userId}`);
    } catch (e) {
        logger.error(`Failed to delete web logs for user ${userId}`, e);
    }
}

function logEntryDedupeKey(log: PresenceLogEntry): string {
    return [
        log.userId ?? "",
        log.timestamp ?? 0,
        log.type ?? "",
        log.previousStatus ?? "",
        log.currentStatus ?? "",
        log.activitySummary ?? "",
    ].join("|");
}

/** Merge + dedupe log arrays (newest first). */
export function mergeLogEntries(...lists: PresenceLogEntry[][]): PresenceLogEntry[] {
    const byKey = new Map<string, PresenceLogEntry>();
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const log of list) {
            if (!log || typeof log.timestamp !== "number" || !log.userId) continue;
            const key = logEntryDedupeKey(log);
            if (!byKey.has(key)) byKey.set(key, log);
        }
    }
    const merged = Array.from(byKey.values());
    merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return merged;
}

/**
 * Persist a full merged log list for one user.
 * Native: writeMergedLogs (safe one-shot merge to primary jsonl).
 * Web/extension: DataStore key stalker-logs-{userId} (survives extension updates).
 */
export async function persistMergedUserLogs(userId: string, entries: PresenceLogEntry[]) {
    const merged = mergeLogEntries(entries);
    const native = getNativeHelper();
    if (native && typeof (native as any).writeMergedLogs === "function") {
        await (native as any).writeMergedLogs(userId, merged);
        return merged.length;
    }
    // Browser Equicord (e.g. Zen): IndexedDB DataStore — keep full history
    await DataStore.set(`stalker-logs-${userId}`, merged);
    return merged.length;
}

/**
 * Import an Activity Tracker export JSON (array of PresenceLogEntry, or { logs: [...] }).
 * Merges with existing history per userId — does not delete anything.
 * Adds each userId to the track whitelist so entries load on next open.
 */
export async function importPresenceLogsJson(raw: unknown): Promise<{
    entryCount: number;
    userCount: number;
    userIds: string[];
    perUser: Record<string, number>;
}> {
    let list: any[] = [];
    if (Array.isArray(raw)) {
        list = raw;
    } else if (raw && typeof raw === "object" && Array.isArray((raw as any).logs)) {
        list = (raw as any).logs;
    } else {
        throw new Error("Invalid export: expected a JSON array of log entries");
    }

    const byUser = new Map<string, PresenceLogEntry[]>();
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const userId = String((item as any).userId ?? "");
        const timestamp = Number((item as any).timestamp);
        if (!userId || !Number.isFinite(timestamp)) continue;
        const entry = { ...(item as PresenceLogEntry), userId, timestamp };
        const arr = byUser.get(userId) ?? [];
        arr.push(entry);
        byUser.set(userId, arr);
    }

    if (byUser.size === 0) {
        throw new Error("No valid log entries found (need userId + timestamp)");
    }

    const { addToWhitelist } = await import("./utils");
    const perUser: Record<string, number> = {};
    let entryCount = 0;

    for (const [userId, imported] of byUser) {
        addToWhitelist(userId);
        // Load existing without wiping — merge keeps both old import and new live logs
        const existing = await readUserLogs(userId); // may apply retention for display cutoff; 999 days ≈ keep all
        const merged = mergeLogEntries(imported, existing);
        const n = await persistMergedUserLogs(userId, merged);
        perUser[userId] = n;
        entryCount += n;
        logger.info(`Imported/merged ${imported.length} entries for ${userId} → ${n} total stored`);
    }

    await loadPresenceLogs();

    return {
        entryCount,
        userCount: byUser.size,
        userIds: Array.from(byUser.keys()),
        perUser,
    };
}

const lastOfflineStoreKey = () => "stalker-last-offline";
const profileSnapshotsStoreKey = () => "stalker-profile-snapshots";
const userConfigsStoreKey = () => "stalker-user-configs";
const notificationOverridesKey = () => "stalker-notify-ids";
export const lastOnlineTimestamps = new Map<string, number>();
export const lastOfflineTimestamps = new Map<string, number>();
export const offlineDurations = new Map<string, number>();
export const onlineDurations = new Map<string, number>();
export const recentCurrentUserMessages = new Map<string, number>();
export const lastKnownUsers = new Map<string, ProfileSnapshot>();
export const userConfigs = new Map<string, UserStalkerConfig>();
export const lastKnownStatuses = new Map<string, string | null>();
export const lastKnownActivities = new Map<string, any[]>();
export const activeDeviceTimings = new Map<string, Array<{ device: string; status: string; start: number; end?: number | null }>>();
export const lastKnownClientStatuses = new Map<string, Record<string, string>>();
/** Tracks users recently seen as pure "online" on mobile (for invisible heuristic) */
export const mobileOnlineCandidates = new Map<string, boolean>();

export function updateDeviceTimings(userId: string, currentStatus: string | null, clientStatusMap: Record<string, string>, timestamp: number) {
    const isUserOffline = !currentStatus || ["offline", "invisible"].includes(currentStatus.toLowerCase());
    
    let segments = activeDeviceTimings.get(userId);
    if (!segments) {
        segments = [];
    }

    const devices = ["desktop", "mobile", "web"];
    let changed = false;

    if (isUserOffline) {
        for (const segment of segments) {
            if (!segment.end) {
                segment.end = timestamp;
                changed = true;
            }
        }
    } else {
        for (const device of devices) {
            const currentDevStatus = clientStatusMap[device] || "offline";
            const lastSegmentIdx = segments.map(s => s.device).lastIndexOf(device);
            const lastSegment = lastSegmentIdx !== -1 ? segments[lastSegmentIdx] : null;

            if (lastSegment && !lastSegment.end) {
                if (currentDevStatus === "offline") {
                    lastSegment.end = timestamp;
                    changed = true;
                } else if (lastSegment.status !== currentDevStatus) {
                    lastSegment.end = timestamp;
                    segments.push({
                        device,
                        status: currentDevStatus,
                        start: timestamp,
                        end: null
                    });
                    changed = true;
                }
            } else {
                if (currentDevStatus !== "offline") {
                    segments.push({
                        device,
                        status: currentDevStatus,
                        start: timestamp,
                        end: null
                    });
                    changed = true;
                }
            }
        }
    }

    if (segments.length > 0) {
        activeDeviceTimings.set(userId, segments);
    } else {
        activeDeviceTimings.delete(userId);
    }

    const result = JSON.parse(JSON.stringify(segments));

    if (isUserOffline) {
        activeDeviceTimings.delete(userId);
    }

    return { result, changed };
}

export const typingCooldowns = new Map<string, number>();
export const pendingOnlineLogs = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: any; }>();
export const pendingActivityLogs = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: any; }>();
export const activityLogCooldowns = new Map<string, number>();
export const notificationOverrideIds = new Set<string>();
const DEFAULT_USER_CONFIG: Omit<UserStalkerConfig, "userId"> = {
    logPresenceChanges: true,
    logProfileChanges: true,
    logMessages: true,
    notifyPresenceChanges: false,
    notifyProfileChanges: true,
    notifyMessages: true,
    notifyTyping: true,
    typingConversationWindow: 10,
    serverFilterMode: "all",
    serverList: [],
    notifyOnline: true,
    notifyOffline: true,
    notifyIdle: true,
    notifyDnd: true,
    notifyPotentiallyInvisible: true,
    notifyUsername: true,
    notifyAvatar: true,
    notifyBanner: true,
    notifyBio: true,
    notifyPronouns: true,
    notifyGlobalName: true
};
export const presenceLogListeners = new Set<(logs: PresenceLogEntry[]) => void>();
export let presenceLogs: PresenceLogEntry[] = [];

export function setPresenceLogs(next: PresenceLogEntry[]) {
    presenceLogs = next;
    for (const listener of presenceLogListeners) listener(presenceLogs);
}

export function filterLogsByRetention(logs: PresenceLogEntry[], cutoffMs?: number) {
    const cutoff = cutoffMs ?? getRetentionCutoffMs();
    if (!cutoff) return logs;
    return logs.filter(entry => entry.timestamp >= cutoff);
}

export function addPresenceLog(entry: PresenceLogEntry & { activitySummary?: string; clientStatusSummary?: string; offlineDuration?: number; onlineDuration?: number; }) {
    const cutoffMs = getRetentionCutoffMs();
    const updatedLogs = [entry, ...filterLogsByRetention(presenceLogs, cutoffMs)];
    setPresenceLogs(updatedLogs);

    const line = `${formatTimestamp(entry.timestamp)} | ${entry.username} (${entry.userId}) | ${entry.previousStatus ?? "unknown"} -> ${entry.currentStatus}`;
    const parts = [line];
    if (entry.offlineDuration) parts.push(`Offline: ${getDurationLabel(entry.offlineDuration)}`);
    if (entry.onlineDuration) parts.push(`Online: ${getDurationLabel(entry.onlineDuration)}`);
    if (entry.activitySummary) parts.push(`Activity: ${entry.activitySummary}`);
    if (entry.clientStatusSummary) parts.push(`Clients: ${entry.clientStatusSummary}`);
    if (entry.potentiallyInvisible) parts.push("⚠️ POTENTIALLY INVISIBLE (mobile online → offline, skipped idle)");

    if (entry.platformChanges?.length) {
        parts.push(
            `Platforms: ${entry.platformChanges
                .map(c => `${c.device} ${c.previousStatus}→${c.currentStatus}`)
                .join(", ")}`
        );
    }
    logger.info(parts.join(" | "));
    appendUserLog(entry.userId, entry, cutoffMs).catch(e => logger.error("Failed to save log entry", e));

    // Notify on overall status change OR per-platform flips (even when overall stays Online)
    const platformChanges = entry.platformChanges ?? [];
    const overallStatusChanged =
        entry.previousStatus != null
        && entry.previousStatus !== entry.currentStatus;
    // Avoid false "became Online" notifs when previousStatus was omitted on device-only logs
    const hasPresenceSignal = overallStatusChanged || platformChanges.length > 0 || !!entry.potentiallyInvisible;

    if (entry.type === "presence" && hasPresenceSignal) {
        const userConfig = getUserConfig(entry.userId);
        if (userConfig.notifyPresenceChanges) {
            let shouldNotify = false;

            if (entry.potentiallyInvisible && userConfig.notifyPotentiallyInvisible !== false) {
                shouldNotify = true;
            } else if (platformChanges.length > 0) {
                // Fire if ANY changed platform's new status matches a notify toggle
                shouldNotify = platformChanges.some(c =>
                    statusMatchesNotifyToggle(c.currentStatus, userConfig)
                );
            } else if (overallStatusChanged) {
                shouldNotify = statusMatchesNotifyToggle(entry.currentStatus, userConfig);
            }

            if (shouldNotify) {
                try {
                    const { title, body } = buildPresenceNotifyCopy({
                        username: entry.username,
                        previousStatus: entry.previousStatus,
                        currentStatus: entry.currentStatus,
                        platformChanges,
                        clientStatus: entry.clientStatus,
                        onlineDuration: entry.onlineDuration,
                        offlineDuration: entry.offlineDuration,
                        activitySummary: entry.activitySummary,
                        potentiallyInvisible: entry.potentiallyInvisible,
                    });

                    let icon: string | undefined;
                    try {
                        const user = UserStore.getUser(entry.userId);
                        if (user?.avatar) {
                            icon = `https://cdn.discordapp.com/avatars/${entry.userId}/${user.avatar}.png?size=64`;
                        }
                    } catch { /* ignore */ }

                    showNotification({ title, body, icon });
                } catch { /* ignore notify errors */ }
            }
        }
    }
}
export async function loadUserConfigs() {
    try {
        const saved = await DataStore.get(userConfigsStoreKey()) as Record<string, UserStalkerConfig> | undefined;
        if (!saved) return;
        Object.entries(saved).forEach(([id, config]) => {
            if (config) {
                userConfigs.set(id, config);
            }
        });
        logger.info(`Loaded ${userConfigs.size} user configs from storage`);
    } catch (e) {
        logger.error("Failed to load user configs", e);
    }
}

export async function persistUserConfig(userId: string, config: UserStalkerConfig) {
    userConfigs.set(userId, config);
    DataStore.set(userConfigsStoreKey(), Object.fromEntries(userConfigs)).catch(e => {
        logger.error("Failed to persist user config", e);
    });
}

export function getUserConfig(userId: string): UserStalkerConfig {
    if (!userConfigs.has(userId)) {
        const newConfig: UserStalkerConfig = {
            userId,
            ...DEFAULT_USER_CONFIG
        };
        userConfigs.set(userId, newConfig);
        persistUserConfig(userId, newConfig);
        return newConfig;
    }
    const existing = userConfigs.get(userId)!;
    const merged: UserStalkerConfig = {
        ...DEFAULT_USER_CONFIG,
        ...existing,
        userId
    };
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        userConfigs.set(userId, merged);
        persistUserConfig(userId, merged);
    }
    return merged;
}
export async function loadLastOfflineTimestamps() {
    try {
        const saved = await DataStore.get(lastOfflineStoreKey()) as Record<string, number> | undefined;
        if (!saved) return;
        Object.entries(saved).forEach(([id, ts]) => {
            if (ts > 0) {
                lastOfflineTimestamps.set(id, ts);
            }
        });
    } catch (e) {
        logger.error("Failed to load last offline timestamps", e);
    }
}

export function persistLastOfflineTimestamp(userId: string, timestamp: number) {
    lastOfflineTimestamps.set(userId, timestamp);
    DataStore.set(lastOfflineStoreKey(), Object.fromEntries(lastOfflineTimestamps)).catch(e => {
        logger.error("Failed to persist last offline timestamps", e);
    });
}
export async function loadProfileSnapshots() {
    try {
        const saved = await DataStore.get(profileSnapshotsStoreKey()) as Record<string, ProfileSnapshot> | undefined;
        if (!saved) return;
        Object.entries(saved).forEach(([id, snapshot]) => {
            if (snapshot) {
                lastKnownUsers.set(id, snapshot);
            }
        });
        logger.info(`Loaded ${lastKnownUsers.size} profile snapshots from storage`);
    } catch (e) {
        logger.error("Failed to load profile snapshots", e);
    }
}

export async function persistProfileSnapshot(userId: string, snapshot: ProfileSnapshot) {
    lastKnownUsers.set(userId, snapshot);
    DataStore.set(profileSnapshotsStoreKey(), Object.fromEntries(lastKnownUsers)).catch(e => {
        logger.error("Failed to persist profile snapshot", e);
    });
}

export async function clearProfileSnapshots() {
    lastKnownUsers.clear();
    try {
        await DataStore.del(profileSnapshotsStoreKey());
        logger.info("Cleared all profile snapshots");
    } catch (e) {
        logger.error("Failed to clear profile snapshots", e);
    }
}

export function captureProfileSnapshot(user: any, profileStore?: any, activities?: any[]): ProfileSnapshot {
    const profile = profileStore?.getUserProfile?.(user.id);
    const avatar = user.avatar ?? null;
    const banner = profile ? (profile.banner ?? user.banner ?? null) : undefined;
    const banner_color = profile ? (profile.bannerColor ?? (user as any).banner_color ?? (user as any).bannerColor ?? null) : undefined;
    const customStatusActivity = activities?.find(act => act.type === 4);
    const customStatus = customStatusActivity?.state ?? null;

    const connectedAccounts = profile?.connected_accounts ? (profile.connected_accounts || []).map((acc: any) => ({
        type: acc.type,
        name: acc.name,
        verified: acc.verified
    })) : undefined;

    // Cosmetics: frames, decorations, nameplates, effects, theme gradient
    const cosmetics = extractProfileCosmetics(user, profile);

    return {
        username: user.username,
        avatar,
        discriminator: user.discriminator,
        global_name: (user as any).global_name ?? (user as any).globalName ?? null,
        bio: profile ? (profile.bio ?? null) : undefined,
        banner,
        banner_color: banner_color,
        avatarDecoration: cosmetics.avatarDecoration,
        avatarDecorationData: cosmetics.avatarDecorationData,
        customStatus,
        pronouns: profile ? (profile.pronouns ?? null) : undefined,
        theme_colors: cosmetics.theme_colors ?? profile?.theme_colors ?? undefined,
        emoji: profile?.emoji ?? undefined,
        connected_accounts: connectedAccounts,
        // profile frames intentionally not tracked (Discord payloads thrash; false change logs)
        nameplate: cosmetics.nameplate,
        nameplateData: cosmetics.nameplateData,
        profileEffect: cosmetics.profileEffect,
        profileEffectData: cosmetics.profileEffectData,
    };
}
export function mergeProfileSnapshots(prev: ProfileSnapshot | undefined, current: ProfileSnapshot): ProfileSnapshot {
    if (!prev) return current;

    const merged: ProfileSnapshot = { ...prev };
    const basicFields: (keyof ProfileSnapshot)[] = [
        "username", "avatar", "discriminator", "global_name",
        "avatarDecoration", "avatarDecorationData",
        "nameplate", "nameplateData",
        "profileEffect", "profileEffectData",
    ];

    for (const field of basicFields) {
        if (current[field] !== undefined) {
            merged[field] = current[field] as any;
        }
    }
    const profileFields: (keyof ProfileSnapshot)[] = [
        "bio", "banner", "banner_color", "pronouns",
        "theme_colors", "emoji", "connected_accounts"
    ];

    for (const field of profileFields) {
        if (current[field] !== undefined) {
            merged[field] = current[field] as any;
        }
    }
    if (current.customStatus !== undefined) merged.customStatus = current.customStatus;

    return merged;
}
function sameCosmeticId(a: any, b: any): boolean {
    // null / undefined / "" all mean "none"
    const na = a == null || a === "" ? null : String(a);
    const nb = b == null || b === "" ? null : String(b);
    return na === nb;
}

export function detectProfileChanges(prev: ProfileSnapshot, current: ProfileSnapshot): string[] {
    const changes: string[] = [];
    const simpleKeys: (keyof ProfileSnapshot)[] = [
        "username", "avatar", "discriminator", "global_name",
        "avatarDecoration", "bio", "banner", "banner_color",
        "pronouns", "customStatus",
        "nameplate", "profileEffect",
        // profileFrame deliberately omitted — Discord collectibles payloads
        // fire partial updates and produce false PROFILE FRAME UPDATED logs
    ];

    for (const key of simpleKeys) {
        if (prev[key] === undefined || current[key] === undefined) continue;

        const cosmeticKey = key === "nameplate" || key === "profileEffect" || key === "avatarDecoration";
        const differs = cosmeticKey
            ? !sameCosmeticId(prev[key], current[key])
            : prev[key] !== current[key];

        if (!differs) continue;

        if (key === "global_name") changes.push("display_name");
        else if (key === "avatarDecoration") changes.push("avatar_decoration");
        else if (key === "nameplate") changes.push("nameplate");
        else if (key === "profileEffect") changes.push("profile_effect");
        else changes.push(key);
    }

    // Complex fields — do NOT use profileFrameData / nameplateData / etc. for change
    // detection (SKU fingerprints above already cover them; data blobs thrash).
    const complexKeys: (keyof ProfileSnapshot)[] = [
        "theme_colors", "emoji", "connected_accounts",
    ];

    for (const key of complexKeys) {
        if (prev[key] !== undefined && current[key] !== undefined) {
            if (JSON.stringify(prev[key]) !== JSON.stringify(current[key])) {
                if (key === "emoji") changes.push("profile_emoji");
                else changes.push(key);
            }
        }
    }

    return changes;
}

/** Debounce window for collapsing multi-dispatch profile updates into one log. */
const PROFILE_LOG_DEBOUNCE_MS = 600;
const pendingProfileLogs = new Map<string, {
    timeout: ReturnType<typeof setTimeout>;
    before: ProfileSnapshot;
    after: ProfileSnapshot;
    userId: string;
    username: string;
    discriminator?: string;
}>();

/**
 * Queue a profile change log. Multiple rapid USER_UPDATE / PROFILE_FETCH
 * events for the same user collapse into one entry (first before → final after).
 */
export function queueProfileChangeLog(opts: {
    userId: string;
    username: string;
    discriminator?: string;
    before: ProfileSnapshot;
    after: ProfileSnapshot;
    changes: string[];
    onLog?: (entry: PresenceLogEntry) => void;
}) {
    const { userId, username, discriminator, before, after } = opts;
    const existing = pendingProfileLogs.get(userId);
    if (existing) clearTimeout(existing.timeout);

    // Keep the earliest "before" in this burst so add/remove thrash settles correctly
    const stableBefore = existing?.before ?? before;

    const timeout = setTimeout(() => {
        pendingProfileLogs.delete(userId);
        const finalChanges = detectProfileChanges(stableBefore, after);
        if (!finalChanges.length) return;

        const userConfig = getUserConfig(userId);
        if (!userConfig.logProfileChanges) return;

        const profileChanges: ProfileChanges = {
            changedFields: finalChanges,
            before: stableBefore,
            after,
        };

        const entry = {
            userId,
            username,
            discriminator,
            timestamp: Date.now(),
            previousStatus: undefined,
            currentStatus: null,
            guildId: undefined,
            clientStatus: {},
            activitySummary: `profile:${finalChanges.join(",")}`,
            clientStatusSummary: undefined,
            guildName: null,
            type: "profile" as const,
            profileChanges,
        } as PresenceLogEntry;

        addPresenceLog(entry);
        opts.onLog?.(entry);
    }, PROFILE_LOG_DEBOUNCE_MS);

    pendingProfileLogs.set(userId, {
        timeout,
        before: stableBefore,
        after,
        userId,
        username,
        discriminator,
    });
}
export async function loadPresenceLogs() {
    try {
        // Refresh desktop detection after native helpers are registered
        isDesktop = !!getNativeHelper();

        const userIds = getWhitelistedIds();
        const allLogs: PresenceLogEntry[] = [];
        const cutoffMs = getRetentionCutoffMs();
        const native = getNativeHelper();

        logger.info(`Loading presence logs for ${userIds.length} user(s); native=${!!native}`);

        for (const userId of userIds) {
            try {
                const userLogs = await readUserLogs(userId, cutoffMs);
                if (userLogs.length) {
                    logger.info(`Loaded ${userLogs.length} log(s) for ${userId}`);
                }
                allLogs.push(...userLogs);
            } catch (e) {
                logger.error(`Failed to load logs for user ${userId}`, e);
            }
        }
        allLogs.sort((a, b) => b.timestamp - a.timestamp);

        presenceLogs = allLogs;
        setPresenceLogs(presenceLogs);
        logger.info(`Loaded ${allLogs.length} presence logs total`);

        const overrides = await DataStore.get(notificationOverridesKey()) as string[] | undefined;
        if (Array.isArray(overrides)) {
            notificationOverrideIds.clear();
            overrides.forEach(id => notificationOverrideIds.add(id));
        }
    } catch (e) {
        logger.error("Failed to load presence logs", e);
    }
}


export function getProfileChangeLabel(field: string): string {
    const labels: Record<string, string> = {
        username: "Username",
        avatar: "Avatar",
        discriminator: "Discriminator",
        global_name: "Display Name",
        display_name: "Display Name",
        bio: "Bio",
        banner: "Banner",
        banner_color: "Banner Color",
        avatar_decoration: "Avatar Decoration",
        avatarDecoration: "Avatar Decoration",
        connected_accounts: "Connected Accounts",
        mutual_friends_count: "Mutual Friends",
        mutual_guilds: "Mutual Servers",
        badges: "Badges",
        pronouns: "Pronouns",
        theme_colors: "Profile Colors",
        profile_emoji: "Profile Emoji",
        customStatus: "Custom Status",
        nameplate: "Nameplate",
        profile_effect: "Profile Effect",
        profileEffect: "Profile Effect",
    };
    return labels[field] ?? field;
}

