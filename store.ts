


import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { PluginNative } from "@utils/types";
import { GuildStore, RestAPI, UserStore } from "@webpack/common";

import { getRetentionCutoffMs, getWhitelistedIds } from "./settings";
import { MutualFriendRef, MutualGuildRef, PresenceLogEntry, ProfileChanges, ProfileEffectData, ProfileSnapshot, UserStalkerConfig } from "./types";
import {
    buildPresenceNotifyCopy,
    extractProfileCosmetics,
    formatTimestamp,
    getDurationLabel,
    getPlatformLabel,
    logger,
    pickEffectOverlayUrl,
    resolveProfileEffectPreview,
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

    // Include any extra keys Discord may send, but always cover the canonical set
    const devices = Array.from(new Set([
        "desktop", "mobile", "web", "embedded", "vr",
        ...Object.keys(clientStatusMap ?? {}),
    ]));
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
                .map(c => `${getPlatformLabel(c.device)} ${c.previousStatus}→${c.currentStatus}`)
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

// ── Profile asset archive (avatars / banners beside logs) ─────────────

export type ProfileAssetKind = "avatar" | "banner";

/** CDN URL for an avatar/banner hash (ext from a_ prefix). */
export function cdnProfileAssetUrl(
    userId: string,
    kind: ProfileAssetKind,
    hash: string,
    size?: number
): string {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    if (kind === "avatar") {
        return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${size ?? 256}`;
    }
    return `https://cdn.discordapp.com/banners/${userId}/${hash}.${ext}?size=${size ?? 600}`;
}

/** Download + save one asset under logs/assets/{userId}/ (no-op without native / hash). */
export async function archiveProfileAsset(
    userId: string,
    kind: ProfileAssetKind,
    hash: string | null | undefined
): Promise<void> {
    if (!userId || !hash) return;
    const native = getNativeHelper();
    if (!native?.saveProfileAsset) return;
    try {
        await native.saveProfileAsset(userId, kind, hash);
    } catch (e) {
        logger.error("archiveProfileAsset failed", userId, kind, hash, e);
    }
}

/** Archive current avatar + banner hashes from a snapshot (idempotent). */
export async function archiveProfileAssets(userId: string, snapshot: ProfileSnapshot): Promise<void> {
    await Promise.all([
        archiveProfileAsset(userId, "avatar", snapshot.avatar),
        archiveProfileAsset(userId, "banner", snapshot.banner ?? null),
    ]);
    archiveProfileEffect(userId, snapshot);
}

/**
 * Prefer a locally archived asset (data URL); fall back to Discord CDN.
 * Web / no-native always returns the CDN URL.
 */
export async function resolveProfileAssetUrl(
    userId: string,
    kind: ProfileAssetKind,
    hash: string | null | undefined,
    size?: number
): Promise<string | null> {
    if (!userId || !hash) return null;
    const native = getNativeHelper();
    if (native?.readProfileAsset) {
        try {
            const dataUrl = await native.readProfileAsset(userId, kind, hash);
            if (dataUrl) return dataUrl;
        } catch (e) {
            logger.debug("resolveProfileAssetUrl local miss/error", userId, kind, hash, e);
        }
    }
    return cdnProfileAssetUrl(userId, kind, hash, size);
}

// ── Profile effect archive (shop media beside logs) ───────────────────

const effectProductCache = new Map<string, any | null>();

/** Fetch collectibles product JSON for a profile-effect sku/id (Discord API). */
export async function fetchCollectiblesProduct(skuOrId: string): Promise<any | null> {
    if (!skuOrId) return null;
    if (effectProductCache.has(skuOrId)) return effectProductCache.get(skuOrId) ?? null;

    try {
        const res = await RestAPI.get({ url: `/collectibles-products/${skuOrId}` });
        const body = res?.body ?? res;
        effectProductCache.set(skuOrId, body ?? null);
        return body ?? null;
    } catch (e) {
        // Public fallback (no auth) — works for shop products
        try {
            const r = await fetch(`https://discord.com/api/v9/collectibles-products/${skuOrId}`, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; ActivityTracker/1.0)" },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const body = await r.json();
            effectProductCache.set(skuOrId, body);
            return body;
        } catch (e2) {
            logger.debug("fetchCollectiblesProduct failed", skuOrId, e, e2);
            effectProductCache.set(skuOrId, null);
            return null;
        }
    }
}

/** Pull the PROFILE_EFFECT item (type 1) out of a collectibles product payload. */
function effectItemFromProduct(product: any): any | null {
    if (!product) return null;
    const items = product.items ?? product.products ?? [];
    if (Array.isArray(items)) {
        return items.find((i: any) => i?.type === 1 || i?.effects || i?.thumbnailPreviewSrc) ?? items[0] ?? null;
    }
    return product.type === 1 || product.effects ? product : null;
}

/**
 * Enrich effect data from the shop API (title, overlay src, layers) and
 * download the overlay image into assets/{userId}/effect_{id}.img
 */
export async function enrichAndArchiveProfileEffect(
    userId: string,
    effect: ProfileEffectData | string | null | undefined
): Promise<ProfileEffectData | null> {
    if (!effect || !userId) return null;
    const id = typeof effect === "string"
        ? effect
        : String(effect.id ?? effect.sku_id ?? effect.skuId ?? "");
    if (!id) return null;

    let data: ProfileEffectData = typeof effect === "string"
        ? { id, skuId: id, sku_id: id }
        : { ...effect, id };

    let overlayUrl = pickEffectOverlayUrl(data);

    if (!overlayUrl || !data.title || !data.effects?.length) {
        const product = await fetchCollectiblesProduct(id)
            ?? (data.sku_id || data.skuId
                ? await fetchCollectiblesProduct(String(data.sku_id ?? data.skuId))
                : null);
        const item = effectItemFromProduct(product);
        if (item) {
            data = {
                ...data,
                title: data.title || item.title || product?.name || null,
                accessibilityLabel:
                    data.accessibilityLabel
                    || item.accessibilityLabel
                    || item.accessibility_label
                    || null,
                thumbnailPreviewSrc: data.thumbnailPreviewSrc || item.thumbnailPreviewSrc || null,
                staticFrameSrc: data.staticFrameSrc || item.staticFrameSrc || null,
                reducedMotionSrc: data.reducedMotionSrc || item.reducedMotionSrc || null,
                effects: data.effects?.length
                    ? data.effects
                    : (Array.isArray(item.effects)
                        ? item.effects.map((layer: any) => ({
                            src: layer?.src ?? layer?.url,
                            loop: layer?.loop,
                            height: layer?.height,
                            width: layer?.width,
                            duration: layer?.duration,
                            start: layer?.start,
                            loopDelay: layer?.loopDelay ?? layer?.loop_delay,
                            zIndex: layer?.zIndex ?? layer?.z_index,
                        }))
                        : data.effects),
            };
            overlayUrl = pickEffectOverlayUrl(data) || pickEffectOverlayUrl(item);
            if (overlayUrl) data.effectSrc = overlayUrl;
        }
    }

    if (overlayUrl) {
        data.effectSrc = data.effectSrc || overlayUrl;
        const native = getNativeHelper();
        if (native?.saveUrlAsset) {
            try {
                await native.saveUrlAsset(userId, "effect", id, overlayUrl);
            } catch (e) {
                logger.error("archive profile effect failed", userId, id, e);
            }
        }
    }

    return data;
}

/** Archive effect for a snapshot if present (fire-and-forget). */
export function archiveProfileEffect(userId: string, snapshot: ProfileSnapshot): void {
    const effect = snapshot.profileEffectData ?? snapshot.profileEffect ?? null;
    if (!effect) return;
    void enrichAndArchiveProfileEffect(userId, effect);
}

/**
 * Resolve overlay image for a profile effect:
 * local archive → shop URL (and archive) → null.
 */
export async function resolveProfileEffectOverlayUrl(
    userId: string,
    effect: ProfileEffectData | string | null | undefined
): Promise<string | null> {
    if (!effect || !userId) return null;
    const id = typeof effect === "string"
        ? effect
        : String(effect.id ?? effect.sku_id ?? effect.skuId ?? "");
    if (!id) return null;

    const native = getNativeHelper();
    if (native?.readUrlAsset) {
        try {
            const local = await native.readUrlAsset(userId, "effect", id);
            if (local) return local;
        } catch { /* fall through */ }
    }

    // Enrich + download, then re-read local (or return remote URL as last resort)
    const enriched = await enrichAndArchiveProfileEffect(userId, effect);
    if (native?.readUrlAsset) {
        try {
            const local = await native.readUrlAsset(userId, "effect", id);
            if (local) return local;
        } catch { /* fall through */ }
    }
    return enriched?.effectSrc || pickEffectOverlayUrl(enriched) || null;
}

/** @deprecated use resolveProfileEffectOverlayUrl — kept for callers expecting preview meta */
export async function resolveProfileEffectDisplay(
    userId: string,
    effect: ProfileEffectData | string | null | undefined
) {
    const preview = resolveProfileEffectPreview(effect);
    const overlayUrl = await resolveProfileEffectOverlayUrl(userId, effect);
    return preview ? { ...preview, effectUrl: overlayUrl || preview.effectUrl } : null;
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

/** Normalize Discord activity emoji (custom status type 4). */
export function captureCustomStatusEmoji(activity: any): { id?: string | null; name?: string | null; animated?: boolean; } | null {
    const emoji = activity?.emoji;
    if (!emoji) return null;
    const name = emoji.name ?? null;
    const id = emoji.id ?? null;
    if (!name && !id) return null;
    return {
        id: id != null ? String(id) : null,
        name: name != null ? String(name) : null,
        animated: !!emoji.animated,
    };
}

export function customStatusEmojiFingerprint(
    emoji: { id?: string | null; name?: string | null; animated?: boolean; } | null | undefined
): string {
    if (!emoji) return "";
    return `${emoji.id ?? ""}:${emoji.name ?? ""}:${emoji.animated ? 1 : 0}`;
}

export function captureProfileSnapshot(user: any, profileStore?: any, activities?: any[]): ProfileSnapshot {
    const profile = profileStore?.getUserProfile?.(user.id);
    const avatar = user.avatar ?? null;
    const banner = profile ? (profile.banner ?? user.banner ?? null) : undefined;
    const banner_color = profile ? (profile.bannerColor ?? (user as any).banner_color ?? (user as any).bannerColor ?? null) : undefined;
    const customStatusActivity = activities?.find(act => act.type === 4);
    // Text may be null for emoji-only custom statuses — still a real status
    const customStatus = customStatusActivity
        ? (customStatusActivity.state ?? null)
        : undefined;
    const customStatusEmoji = customStatusActivity
        ? captureCustomStatusEmoji(customStatusActivity)
        : undefined;

    const connectedAccounts = profile?.connected_accounts ? (profile.connected_accounts || []).map((acc: any) => ({
        type: acc.type,
        name: acc.name,
        verified: acc.verified
    })) : undefined;

    // Cosmetics: frames, decorations, nameplates, effects, theme gradient
    const cosmetics = extractProfileCosmetics(user, profile);

    const mutuals = profile ? extractMutualsFromProfilePayload(profile) : {};

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
        customStatus: customStatusActivity ? (customStatus ?? null) : undefined,
        customStatusEmoji: customStatusActivity ? (customStatusEmoji ?? null) : undefined,
        pronouns: profile ? (profile.pronouns ?? null) : undefined,
        theme_colors: cosmetics.theme_colors ?? profile?.theme_colors ?? undefined,
        emoji: profile?.emoji ?? undefined,
        connected_accounts: connectedAccounts,
        nameplate: cosmetics.nameplate,
        nameplateData: cosmetics.nameplateData,
        profileEffect: cosmetics.profileEffect,
        profileEffectData: cosmetics.profileEffectData,
        mutual_friends_count: mutuals.mutual_friends_count,
        mutual_guilds_count: mutuals.mutual_guilds_count,
        mutual_friends: mutuals.mutual_friends,
        mutual_guilds: mutuals.mutual_guilds,
    };
}

/**
 * Only return mutuals when the payload actually includes those fields.
 * Missing keys → undefined (unknown) so merge keeps the previous snapshot.
 * Prevents "4 friends → 0" thrash from lean follow-up profile updates.
 */
export function extractMutualsFromProfilePayload(src: any): {
    mutual_friends_count?: number;
    mutual_guilds_count?: number;
    mutual_friends?: MutualFriendRef[];
    mutual_guilds?: MutualGuildRef[];
} {
    if (!src || typeof src !== "object") return {};

    const out: {
        mutual_friends_count?: number;
        mutual_guilds_count?: number;
        mutual_friends?: MutualFriendRef[];
        mutual_guilds?: MutualGuildRef[];
    } = {};

    const hasFriendList = Object.prototype.hasOwnProperty.call(src, "mutual_friends")
        || Object.prototype.hasOwnProperty.call(src, "mutualFriends");
    const hasFriendCount = Object.prototype.hasOwnProperty.call(src, "mutual_friends_count")
        || Object.prototype.hasOwnProperty.call(src, "mutualFriendsCount");
    const hasGuildList = Object.prototype.hasOwnProperty.call(src, "mutual_guilds")
        || Object.prototype.hasOwnProperty.call(src, "mutualGuilds");
    const hasGuildCount = Object.prototype.hasOwnProperty.call(src, "mutual_guilds_count")
        || Object.prototype.hasOwnProperty.call(src, "mutualGuildsCount");

    if (hasFriendList) {
        const list = src.mutual_friends ?? src.mutualFriends;
        if (Array.isArray(list)) {
            out.mutual_friends = resolveMutualFriendRefs(list);
            out.mutual_friends_count = out.mutual_friends.length;
        }
    }
    if (hasFriendCount && out.mutual_friends_count === undefined) {
        const n = src.mutual_friends_count ?? src.mutualFriendsCount;
        if (typeof n === "number" && Number.isFinite(n)) out.mutual_friends_count = n;
    }

    if (hasGuildList) {
        const list = src.mutual_guilds ?? src.mutualGuilds;
        if (Array.isArray(list)) {
            out.mutual_guilds = resolveMutualGuildRefs(list);
            out.mutual_guilds_count = out.mutual_guilds.length;
        }
    }
    if (hasGuildCount && out.mutual_guilds_count === undefined) {
        const n = src.mutual_guilds_count ?? src.mutualGuildsCount;
        if (typeof n === "number" && Number.isFinite(n)) out.mutual_guilds_count = n;
    }

    return out;
}

function resolveMutualFriendRefs(list: any[]): MutualFriendRef[] {
    const out: MutualFriendRef[] = [];
    for (const item of list) {
        const id = String(
            typeof item === "object" && item
                ? (item.id ?? item.userId ?? item.user_id ?? "")
                : item ?? ""
        );
        if (!id) continue;
        let username: string | null = null;
        let global_name: string | null = null;
        let avatar: string | null = null;
        if (typeof item === "object" && item) {
            username = item.username ?? item.user?.username ?? null;
            global_name = item.global_name ?? item.globalName ?? item.user?.global_name ?? item.user?.globalName ?? null;
            avatar = item.avatar ?? item.user?.avatar ?? null;
        }
        try {
            const u = UserStore.getUser(id);
            if (u) {
                username = username ?? u.username ?? null;
                global_name = global_name ?? (u as any).globalName ?? (u as any).global_name ?? null;
                avatar = avatar ?? u.avatar ?? null;
            }
        } catch { /* ignore */ }
        out.push({ id, username, global_name, avatar });
    }
    return out;
}

function resolveMutualGuildRefs(list: any[]): MutualGuildRef[] {
    const out: MutualGuildRef[] = [];
    for (const item of list) {
        const id = String(
            typeof item === "object" && item
                ? (item.id ?? item.guild_id ?? item.guildId ?? "")
                : item ?? ""
        );
        if (!id) continue;
        let name: string | null = null;
        let icon: string | null = null;
        if (typeof item === "object" && item) {
            name = item.name ?? item.nick ?? null;
            icon = item.icon ?? null;
        }
        try {
            const g = GuildStore.getGuild?.(id);
            if (g) {
                name = name ?? g.name ?? null;
                icon = icon ?? g.icon ?? null;
            }
        } catch { /* ignore */ }
        out.push({ id, name, icon });
    }
    return out;
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
        "theme_colors", "emoji", "connected_accounts",
    ];

    for (const field of profileFields) {
        if (current[field] !== undefined) {
            merged[field] = current[field] as any;
        }
    }
    if (current.customStatus !== undefined) merged.customStatus = current.customStatus;
    if (current.customStatusEmoji !== undefined) merged.customStatusEmoji = current.customStatusEmoji;

    // Mutuals: never clobber a known positive count with a bare 0/null from a lean update
    // unless an explicit empty friends/guilds list proves the wipe.
    mergeMutualField(merged, prev, current, "mutual_friends_count", "mutual_friends");
    mergeMutualField(merged, prev, current, "mutual_guilds_count", "mutual_guilds");

    return merged;
}

function mergeMutualField(
    merged: ProfileSnapshot,
    prev: ProfileSnapshot,
    current: ProfileSnapshot,
    countKey: "mutual_friends_count" | "mutual_guilds_count",
    listKey: "mutual_friends" | "mutual_guilds",
) {
    if (current[countKey] === undefined && current[listKey] === undefined) return;

    const nextCount = current[countKey];
    const nextList = current[listKey];
    const prevCount = prev[countKey];

    const provenEmpty = Array.isArray(nextList) && nextList.length === 0;
    if (
        typeof nextCount === "number"
        && nextCount === 0
        && typeof prevCount === "number"
        && prevCount > 0
        && !provenEmpty
    ) {
        // Ignore suspicious zero from incomplete profile payload
        return;
    }

    if (nextCount !== undefined) (merged as any)[countKey] = nextCount;
    if (nextList !== undefined) (merged as any)[listKey] = nextList;
    // Keep list/count in sync when only one side arrived
    if (nextList !== undefined && nextCount === undefined) {
        (merged as any)[countKey] = nextList.length;
    }
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
        "mutual_friends_count", "mutual_guilds_count",
    ];

    for (const key of simpleKeys) {
        // SKU/id fingerprints — missing prev means "none", so first equip still logs.
        // Only skip when CURRENT is unknown (lean payload that shouldn't clear).
        const cosmeticKey = key === "nameplate" || key === "profileEffect"
            || key === "avatarDecoration";

        if (cosmeticKey) {
            if (current[key] === undefined) continue;
            const prevVal = prev[key] === undefined ? null : prev[key];
            if (sameCosmeticId(prevVal, current[key])) continue;

            if (key === "avatarDecoration") changes.push("avatar_decoration");
            else if (key === "nameplate") changes.push("nameplate");
            else if (key === "profileEffect") changes.push("profile_effect");
            continue;
        }

        if (prev[key] === undefined || current[key] === undefined) continue;
        if (prev[key] === current[key]) continue;

        if (key === "global_name") changes.push("display_name");
        else if (key === "mutual_guilds_count") changes.push("mutual_guilds");
        else changes.push(key);
    }

    // Custom status emoji (emoji-only statuses have null text)
    if (prev.customStatusEmoji !== undefined && current.customStatusEmoji !== undefined) {
        if (customStatusEmojiFingerprint(prev.customStatusEmoji) !== customStatusEmojiFingerprint(current.customStatusEmoji)) {
            if (!changes.includes("customStatus")) changes.push("customStatus");
        }
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

    // Mutual friend/guild membership by sorted ids (richer than count alone)
    if (prev.mutual_friends !== undefined && current.mutual_friends !== undefined) {
        if (mutualIdFingerprint(prev.mutual_friends) !== mutualIdFingerprint(current.mutual_friends)) {
            if (!changes.includes("mutual_friends_count")) changes.push("mutual_friends_count");
        }
    }
    if (prev.mutual_guilds !== undefined && current.mutual_guilds !== undefined) {
        if (mutualIdFingerprint(prev.mutual_guilds) !== mutualIdFingerprint(current.mutual_guilds)) {
            if (!changes.includes("mutual_guilds")) changes.push("mutual_guilds");
        }
    }

    return changes;
}

function mutualIdFingerprint(list?: Array<{ id: string }> | null): string {
    if (!list?.length) return "";
    return [...list].map(x => x.id).sort().join(",");
}

/** Debounce window for collapsing multi-dispatch profile updates into one log. */
const PROFILE_LOG_DEBOUNCE_MS = 1500;
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
        void (async () => {
            pendingProfileLogs.delete(userId);
            const finalChanges = detectProfileChanges(stableBefore, after);
            if (!finalChanges.length) return;

            const userConfig = getUserConfig(userId);
            if (!userConfig.logProfileChanges) return;

            // Archive old + new avatar/banner so CDN expiry doesn't blank history previews
            if (finalChanges.includes("avatar") || finalChanges.includes("banner")) {
                void archiveProfileAsset(userId, "avatar", stableBefore.avatar);
                void archiveProfileAsset(userId, "banner", stableBefore.banner ?? null);
                void archiveProfileAssets(userId, after);
            }

            // Enrich + archive effect/frame shop media BEFORE writing the log
            let beforeSnap = stableBefore;
            let afterSnap = after;
            if (finalChanges.includes("profile_effect") || finalChanges.includes("profileEffect")) {
                const [beforeFx, afterFx] = await Promise.all([
                    enrichAndArchiveProfileEffect(userId, stableBefore.profileEffectData ?? stableBefore.profileEffect),
                    enrichAndArchiveProfileEffect(userId, after.profileEffectData ?? after.profileEffect),
                ]);
                if (beforeFx) {
                    beforeSnap = {
                        ...beforeSnap,
                        profileEffectData: beforeFx,
                        profileEffect: beforeFx.id ?? beforeSnap.profileEffect,
                    };
                }
                if (afterFx) {
                    afterSnap = {
                        ...afterSnap,
                        profileEffectData: afterFx,
                        profileEffect: afterFx.id ?? afterSnap.profileEffect,
                    };
                }
            }
            const profileChanges: ProfileChanges = {
                changedFields: finalChanges,
                before: beforeSnap,
                after: afterSnap,
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
        })();
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
        mutual_guilds_count: "Mutual Servers",
        badges: "Badges",
        pronouns: "Pronouns",
        theme_colors: "Profile Colors",
        profile_emoji: "Profile Emoji",
        customStatus: "Custom Status",
        nameplate: "Nameplate",
        profile_effect: "Profile Effect",
        profileEffect: "Profile Effect",
        // Kept for old logs that still contain this field — new frame events are not logged
        profile_frame: "Profile Frame",
        profileFrame: "Profile Frame",
    };
    return labels[field] ?? field;
}

