


import { Logger } from "@utils/Logger";
import { ApplicationStore } from "@webpack/common";

import { isDebugEnabled, settings } from "./settings";

const _logger = new Logger("Stalker", "#a7d46d");

export const logger = {
    log: (...args: any[]) => {
        if (isDebugEnabled()) _logger.log(...args);
    },
    info: (...args: any[]) => {
        if (isDebugEnabled()) _logger.info(...args);
    },
    warn: (...args: any[]) => {
        if (isDebugEnabled()) _logger.warn(...args);
    },
    error: (...args: any[]) => {
        _logger.error(...args);
    },
    debug: (...args: any[]) => {
        if (isDebugEnabled()) {
            if (typeof (_logger as any).debug === "function") {
                (_logger as any).debug(...args);
            } else {
                _logger.log("[DEBUG]", ...args);
            }
        }
    }
};

export function addToWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (!items.includes(id)) items.push(id);
    settings.store.whitelistedIds = items.join(",");
}

export function removeFromWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    const index = items.indexOf(id);
    if (index !== -1) items.splice(index, 1);
    settings.store.whitelistedIds = items.join(",");
}

export function isInWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    return items.includes(id);
}
export function getAvatarDecorationUrl(decorationData: { asset: string; skuId: string; } | null): string | null {
    if (!decorationData?.asset) return null;

    const { asset } = decorationData;
    const cleanAsset = asset.startsWith("a_") ? asset.substring(2) : asset;
    return `https://cdn.discordapp.com/avatar-decoration-presets/${cleanAsset}.png?size=160`;
}

export function formatTimestamp(ts: number) {
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return String(ts);
    }
}

export function getDurationLabel(durationMs?: number) {
    if (!durationMs || durationMs <= 0) return null;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function getStatusLabel(status?: string | null) {
    if (!status) return "Unknown";
    switch (status.toLowerCase()) {
        case "online": return "Online";
        case "idle": return "Idle";
        case "dnd": return "DND";
        case "offline": return "Offline";
        case "invisible": return "Invisible";
        default: return status;
    }
}

/** Screenshot-mode display name (redact → "User"; blur/blackout keep layout string) */
export function redactDisplayName(
    username: string | undefined | null,
    mode: "redact" | "blur" | "blackout",
    enabled: boolean
) {
    if (!enabled) return username || "Unknown";
    if (mode === "redact") return "User";
    return username || "Unknown";
}

/** Screenshot-mode @tag */
export function redactTag(
    username: string | undefined | null,
    mode: "redact" | "blur" | "blackout",
    enabled: boolean
) {
    if (!enabled) return username ? `@${username}` : "";
    if (mode === "redact") return "@user";
    return username ? `@${username}` : "";
}

/** Visible text for blur/blackout pills (avoids leaking real name via selection) */
export function redactMask(text: string, isTag = false) {
    return isTag ? "@········" : "········";
}

export function getStatusClass(status?: string | null) {
    const normalized = status?.toLowerCase() ?? "unknown";
    return `stalker-status-badge stalker-status-badge--${normalized}`;
}

export function getPlatformLabel(device?: string | null) {
    switch ((device ?? "").toLowerCase()) {
        case "desktop": return "Desktop";
        case "mobile": return "Mobile";
        case "web": return "Web";
        case "embedded": return "Console";
        case "console": return "Console";
        default: return device ? device.charAt(0).toUpperCase() + device.slice(1) : "Unknown";
    }
}

function normalizeStatus(status?: string | null) {
    return (status ?? "").toLowerCase();
}

function isOfflineStatus(status?: string | null) {
    const s = normalizeStatus(status);
    return !s || s === "offline" || s === "invisible";
}

const PLATFORM_KEYS = ["desktop", "mobile", "web", "embedded"] as const;

export type PlatformChange = {
    device: string;
    previousStatus: string;
    currentStatus: string;
};

/**
 * Diff two client-status maps into per-platform transitions.
 * Missing keys are treated as offline.
 */
export function diffClientStatuses(
    previous?: Record<string, string> | null,
    current?: Record<string, string> | null
): PlatformChange[] {
    const prev = previous ?? {};
    const curr = current ?? {};
    const keys = new Set<string>([
        ...PLATFORM_KEYS,
        ...Object.keys(prev),
        ...Object.keys(curr),
    ]);

    const changes: PlatformChange[] = [];
    for (const device of keys) {
        const previousStatus = normalizeStatus(prev[device]) || "offline";
        const currentStatus = normalizeStatus(curr[device]) || "offline";
        // Treat invisible as offline for platform diffs
        const prevNorm = previousStatus === "invisible" ? "offline" : previousStatus;
        const currNorm = currentStatus === "invisible" ? "offline" : currentStatus;
        if (prevNorm === currNorm) continue;
        // Skip both-offline (nothing useful)
        if (prevNorm === "offline" && currNorm === "offline") continue;
        changes.push({
            device,
            previousStatus: prevNorm,
            currentStatus: currNorm,
        });
    }
    return changes;
}

/** Human list of still-active platforms, e.g. "Desktop still Online, Web still Idle" */
export function formatStillActivePlatforms(
    clientStatus?: Record<string, string> | null,
    excludeDevices?: string[]
): string | undefined {
    if (!clientStatus) return undefined;
    const exclude = new Set((excludeDevices ?? []).map(d => d.toLowerCase()));
    const parts: string[] = [];
    for (const [device, status] of Object.entries(clientStatus)) {
        if (exclude.has(device.toLowerCase())) continue;
        const s = normalizeStatus(status);
        if (!s || s === "offline" || s === "invisible") continue;
        parts.push(`${getPlatformLabel(device)} still ${getStatusLabel(s)}`);
    }
    return parts.length ? parts.join(" · ") : undefined;
}

/** Build title/body for a presence notification from overall + platform changes */
export function buildPresenceNotifyCopy(opts: {
    username: string;
    previousStatus?: string | null;
    currentStatus?: string | null;
    platformChanges?: PlatformChange[];
    clientStatus?: Record<string, string> | null;
    onlineDuration?: number;
    offlineDuration?: number;
    activitySummary?: string;
    potentiallyInvisible?: boolean;
}): { title: string; body: string } {
    const {
        username,
        previousStatus,
        currentStatus,
        platformChanges = [],
        clientStatus,
        onlineDuration,
        offlineDuration,
        activitySummary,
        potentiallyInvisible,
    } = opts;

    if (potentiallyInvisible) {
        let body = "⚠️ Potentially invisible — Online → Offline on mobile without Idle (Discord mobile normally idles first)";
        if (onlineDuration) body += ` · was online ${getDurationLabel(onlineDuration)}`;
        return { title: `${username} may be invisible`, body };
    }

    // Prefer platform-scoped messaging when we know which devices flipped
    if (platformChanges.length > 0) {
        const primary = platformChanges[0];
        const plat = getPlatformLabel(primary.device);
        const to = getStatusLabel(primary.currentStatus);
        const from = getStatusLabel(primary.previousStatus);

        let title: string;
        if (primary.currentStatus === "offline") {
            title = `${username} went Offline on ${plat}`;
        } else if (primary.previousStatus === "offline") {
            title = `${username} is ${to} on ${plat}`;
        } else {
            title = `${username} is ${to} on ${plat}`;
        }

        const bodyParts: string[] = [];
        if (platformChanges.length === 1) {
            bodyParts.push(`${plat}: ${from} → ${to}`);
        } else {
            for (const c of platformChanges) {
                bodyParts.push(
                    `${getPlatformLabel(c.device)}: ${getStatusLabel(c.previousStatus)} → ${getStatusLabel(c.currentStatus)}`
                );
            }
        }

        const still = formatStillActivePlatforms(
            clientStatus,
            platformChanges.map(c => c.device)
        );
        if (still) bodyParts.push(still);

        const overall = normalizeStatus(currentStatus);
        if (isOfflineStatus(overall) && onlineDuration) {
            bodyParts.push(`Session online ${getDurationLabel(onlineDuration)}`);
        } else if (!isOfflineStatus(overall) && offlineDuration && primary.previousStatus === "offline") {
            bodyParts.push(`Was offline ${getDurationLabel(offlineDuration)}`);
        }

        if (activitySummary && activitySummary !== "typing" && !activitySummary.startsWith("profile:")) {
            bodyParts.push(activitySummary);
        }

        // Multi-platform flip: expand title slightly
        if (platformChanges.length > 1) {
            title = `${username} presence updated`;
        }

        return { title, body: bodyParts.join(" · ") };
    }

    // Overall-only fallback
    const statusLabel = getStatusLabel(currentStatus);
    let title = `${username} is ${statusLabel}`;
    let body = `Status changed to ${statusLabel}`;
    if (previousStatus) {
        body = `${getStatusLabel(previousStatus)} → ${statusLabel}`;
    }
    if (offlineDuration && !isOfflineStatus(currentStatus)) {
        body += ` (was offline for ${getDurationLabel(offlineDuration)})`;
    }
    if (onlineDuration && isOfflineStatus(currentStatus)) {
        body += ` (was online for ${getDurationLabel(onlineDuration)})`;
    }
    if (clientStatus) {
        const summary = Object.entries(clientStatus)
            .filter(([, s]) => s && !isOfflineStatus(s))
            .map(([d, s]) => `${getPlatformLabel(d)} ${getStatusLabel(s)}`)
            .join(" · ");
        if (summary) body += ` · ${summary}`;
    }
    if (activitySummary && activitySummary !== "typing" && !activitySummary.startsWith("profile:")) {
        body += ` · ${activitySummary}`;
    }
    return { title, body };
}

/** Whether a status should fire notifyOnline / Offline / Idle / Dnd toggles */
export function statusMatchesNotifyToggle(
    status: string | null | undefined,
    config: {
        notifyOnline?: boolean;
        notifyOffline?: boolean;
        notifyIdle?: boolean;
        notifyDnd?: boolean;
    }
): boolean {
    const s = normalizeStatus(status);
    if (s === "online") return config.notifyOnline !== false;
    if (s === "offline" || s === "invisible") return config.notifyOffline !== false;
    if (s === "idle") return config.notifyIdle !== false;
    if (s === "dnd") return config.notifyDnd !== false;
    // Unknown statuses: allow
    return true;
}

/**
 * Discord mobile normally transitions Online → Idle → Offline when you leave.
 * A direct Online → Offline jump on mobile (Idle/DND excluded) often means
 * the user set themselves to Invisible.
 */
export function isPotentiallyInvisibleTransition(opts: {
    previousStatus?: string | null;
    currentStatus?: string | null;
    previousClientStatus?: Record<string, string>;
    /** Whether mobile was recently seen as pure "online" without an idle/dnd step */
    mobileOnlineCandidate?: boolean;
}): boolean {
    const prev = normalizeStatus(opts.previousStatus);
    const curr = normalizeStatus(opts.currentStatus);

    // Only pure online → offline/invisible. Idle/DND are intentional custom states on mobile.
    if (prev !== "online") return false;
    if (!isOfflineStatus(curr)) return false;

    const prevMobile = normalizeStatus(opts.previousClientStatus?.mobile);
    if (prevMobile === "online") return true;
    if (opts.mobileOnlineCandidate) return true;

    return false;
}

/**
 * Update the "mobile was purely online" candidate for invisible detection.
 * Returns the next candidate value (true / false).
 *
 * Armed when mobile is pure "online". Cleared when mobile/overall hits Idle or DND
 * (natural AFK path or intentional custom status — not treated as invisible).
 * If mobile drops Online → Offline in one step, candidate stays armed so the
 * overall Online → Offline check can flag potentially-invisible.
 */
export function updateMobileOnlineCandidate(
    previousCandidate: boolean,
    previousMobileStatus?: string | null,
    currentMobileStatus?: string | null,
    overallStatus?: string | null
): boolean {
    const mobile = normalizeStatus(currentMobileStatus);
    const prevMobile = normalizeStatus(previousMobileStatus);
    const overall = normalizeStatus(overallStatus);

    // Pure online on mobile arms the candidate
    if (mobile === "online") return true;

    // Idle/DND on mobile (or overall) means a normal/custom path — not invisible
    if (mobile === "idle" || mobile === "dnd") return false;
    if (overall === "idle" || overall === "dnd") return false;

    // Mobile offline now: only keep candidate if we just left pure online
    // (or were already armed). Leaving idle/dnd → offline is not invisible.
    if (isOfflineStatus(mobile) || !mobile) {
        if (prevMobile === "idle" || prevMobile === "dnd") return false;
        if (prevMobile === "online") return true;
        return previousCandidate;
    }

    return previousCandidate;
}


export function formatActivitySummary(activities: any[]) {
    if (!activities || activities.length === 0) return undefined;

    const gameActivities = activities.filter(a => a.type !== 4);
    if (gameActivities.length === 0) return undefined;

    return gameActivities.map(activity => {
        const parts = [activity.name || "Unknown"];

        if (activity.details) parts.push(activity.details);
        if (activity.state) parts.push(activity.state);

        if (activity.type === 2 && activity.assets) {
            if (activity.assets.large_text) parts.push(activity.assets.large_text);
        }


        return parts.join(" - ");
    }).join(", ");
}

function safePlainCopy<T>(value: T): T | undefined {
    if (value == null) return undefined;
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return undefined;
    }
}

export function getActivitySnapshots(activities: any[]) {
    if (!activities) return [] as any[];

    return activities
        .filter(a => a && a.type !== 4)
        .map(a => {
            try {
                const application_id = (a as any).application_id ?? (a as any).applicationId ?? undefined;
                let applicationIcon: string | null = (a as any).applicationIcon ?? null;
                try {
                    if (!applicationIcon && application_id && ApplicationStore?.getApplication) {
                        applicationIcon = ApplicationStore.getApplication(application_id)?.icon ?? null;
                    }
                } catch {
                    applicationIcon = null;
                }

                // Only plain JSON-safe fields — Discord activity objects can throw on JSON.stringify
                return {
                    name: a.name ?? undefined,
                    type: a.type,
                    details: a.details ?? undefined,
                    state: a.state ?? undefined,
                    assets: safePlainCopy(a.assets),
                    application_id,
                    applicationId: application_id,
                    applicationIcon,
                    timestamps: a.timestamps
                        ? {
                            start: typeof a.timestamps.start === "number" ? a.timestamps.start : undefined,
                            end: typeof a.timestamps.end === "number" ? a.timestamps.end : undefined,
                        }
                        : undefined,
                    platform: typeof (a as any).platform === "string" ? (a as any).platform : undefined,
                    party: safePlainCopy(a.party),
                    emoji: a.emoji
                        ? {
                            id: a.emoji.id,
                            name: a.emoji.name,
                            animated: a.emoji.animated,
                        }
                        : undefined,
                };
            } catch {
                return {
                    name: a?.name ?? "Unknown",
                    type: a?.type,
                    application_id: (a as any)?.application_id ?? (a as any)?.applicationId,
                };
            }
        });
}

/** Safe compare for activity snapshots — never throws into the presence listener */
export function activitiesSnapshotsEqual(a: any[], b: any[]) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export function summarizeClientStatus(statusMap?: Record<string, string>) {
    if (!statusMap) return undefined;
    const entries = Object.entries(statusMap).filter(([, status]) => status && status !== "offline");
    if (!entries.length) return undefined;
    return entries.map(([device, status]) => `${device}:${status}`).join(", ");
}

