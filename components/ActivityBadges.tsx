
import { findByPropsLazy } from "@webpack";
import { ApplicationStore, Tooltip, useEffect, useState } from "@webpack/common";

import { PresenceLogEntry } from "../types";
import { formatTimestamp, getDurationLabel } from "../utils";

// Lazy module — do NOT destructure at top level (can throw before webpack is ready)
const ApplicationUtils = findByPropsLazy("fetchApplication") as {
    fetchApplication?: (id: string) => Promise<any>;
};

/** In-memory cache of resolved application records (and in-flight fetches) */
const applicationCache = new Map<string, any | null>();
const applicationFetchers = new Map<string, Promise<any | null>>();

async function ensureApplication(appId: string): Promise<any | null> {
    if (!appId) return null;

    const fromStore = ApplicationStore?.getApplication?.(appId);
    if (fromStore) {
        applicationCache.set(appId, fromStore);
        return fromStore;
    }

    if (applicationCache.has(appId)) {
        return applicationCache.get(appId) ?? null;
    }

    let pending = applicationFetchers.get(appId);
    if (!pending) {
        pending = (async () => {
            try {
                const fetchApplication = ApplicationUtils?.fetchApplication;
                if (typeof fetchApplication === "function") {
                    const app = await fetchApplication(appId);
                    applicationCache.set(appId, app ?? null);
                    return app ?? null;
                }
            } catch {
                /* ignore */
            }
            applicationCache.set(appId, null);
            return null;
        })();
        applicationFetchers.set(appId, pending);
    }

    return pending;
}

export function getActivityStopTimestamp(
    entry: PresenceLogEntry,
    act: any,
    allUserLogs: PresenceLogEntry[]
): number | null {
    const idx = allUserLogs.findIndex(e => e.timestamp === entry.timestamp);
    if (idx === -1) return null;

    for (let i = idx - 1; i >= 0; i--) {
        const laterEntry = allUserLogs[i];
        const hasActivity = laterEntry.activities?.some(a => {
            const isSameBase = a.name === act.name ||
                ((a.application_id ?? a.applicationId) && (a.application_id ?? a.applicationId) === (act.application_id ?? act.applicationId));
            if (!isSameBase) return false;

            if (a.details !== act.details) return false;
            if (a.state !== act.state) return false;
            if (a.timestamps?.start !== act.timestamps?.start) return false;
            if (a.timestamps?.end !== act.timestamps?.end) return false;

            return true;
        });
        const wentOffline = laterEntry.currentStatus === "offline";
        if (!hasActivity || wentOffline) {
            return laterEntry.timestamp;
        }
    }
    return null;
}

function getAssetUrl(appId: string | undefined, assetId: string | undefined) {
    if (!assetId) return null;
    if (assetId.startsWith("mp:")) return assetId.replace("mp:", "https://media.discordapp.net/");
    if (assetId.includes("://")) return assetId;
    if (assetId.startsWith("spotify:")) return `https://i.scdn.co/image/${assetId.replace("spotify:", "")}`;
    // Discord media proxy paths
    if (assetId.startsWith("external/")) {
        return `https://media.discordapp.net/${assetId}`;
    }
    if (appId) {
        // Asset hashes sometimes include file extension already
        const clean = assetId.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
        return `https://cdn.discordapp.com/app-assets/${appId}/${clean}.png?size=128`;
    }
    return null;
}

function applicationIconUrl(appId: string | undefined, iconHash: string | null | undefined, size = 64) {
    if (!appId || !iconHash) return null;
    const ext = iconHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/app-icons/${appId}/${iconHash}.${ext}?size=${size}`;
}

/**
 * Resolve the best icon URL for an activity:
 * 1) rich assets (large then small)
 * 2) icon hash persisted on the snapshot
 * 3) ApplicationStore / fetched application icon
 */
function resolveActivityIconSync(activity: any): string | null {
    const appId = activity.application_id ?? activity.applicationId;

    const fromAssets =
        getAssetUrl(appId, activity.assets?.large_image ?? activity.assets?.largeImage)
        || getAssetUrl(appId, activity.assets?.small_image ?? activity.assets?.smallImage);
    if (fromAssets) return fromAssets;

    // Snapshot may already carry the icon hash from log time
    const snapIcon = activity.applicationIcon ?? activity.application_icon ?? activity.icon;
    const fromSnap = applicationIconUrl(appId, snapIcon);
    if (fromSnap) return fromSnap;

    if (appId) {
        const app = ApplicationStore?.getApplication?.(appId) ?? applicationCache.get(appId);
        const fromApp = applicationIconUrl(appId, app?.icon);
        if (fromApp) return fromApp;
    }

    // Custom status / activity emoji as image
    if (activity.emoji?.id) {
        return `https://cdn.discordapp.com/emojis/${activity.emoji.id}.${activity.emoji.animated ? "gif" : "png"}?size=64`;
    }

    return null;
}

function ActivityIcon({ activity, size = 16, className }: { activity: any; size?: number; className?: string; }) {
    const appId = activity.application_id ?? activity.applicationId;
    const [src, setSrc] = useState<string | null>(() => resolveActivityIconSync(activity));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);

        const sync = resolveActivityIconSync(activity);
        if (sync) {
            setSrc(sync);
            // Still try to fetch app if we only have a partial resolution
            if (appId && !activity.assets?.large_image && !activity.assets?.largeImage) {
                ensureApplication(appId).then(app => {
                    if (cancelled || !app?.icon) return;
                    const url = applicationIconUrl(appId, app.icon, size * 2);
                    if (url) setSrc(url);
                });
            }
            return () => { cancelled = true; };
        }

        if (!appId) {
            setSrc(null);
            return () => { cancelled = true; };
        }

        ensureApplication(appId).then(app => {
            if (cancelled) return;
            const url = applicationIconUrl(appId, app?.icon, size * 2);
            setSrc(url);
        });

        return () => { cancelled = true; };
    }, [
        appId,
        activity.assets?.large_image,
        activity.assets?.largeImage,
        activity.assets?.small_image,
        activity.assets?.smallImage,
        activity.applicationIcon,
        activity.emoji?.id,
        size,
    ]);

    if (!src || failed) {
        // Fallback letter avatar for known app name
        if (activity.name) {
            return (
                <span
                    className={className ?? "stalker-activity-icon stalker-activity-icon--fallback"}
                    style={{ width: size, height: size, fontSize: Math.max(9, size * 0.55) }}
                    aria-hidden
                >
                    {String(activity.name).charAt(0).toUpperCase()}
                </span>
            );
        }
        return null;
    }

    return (
        <img
            src={src}
            alt=""
            className={className ?? "stalker-activity-icon"}
            style={{ width: size, height: size }}
            onError={() => setFailed(true)}
        />
    );
}

function getPartyState(activity: any) {
    const size = activity.party?.size;
    if (Array.isArray(size) && size.length >= 2 && size[0] > 0) {
        return {
            long: `In a party (${size[0]} out of ${size[1] ?? "?"})`,
            short: `${size[0]}/${size[1] ?? "?"}`
        };
    }
    if (typeof size === "number" && size > 0) {
        return { long: `In a party (${size})`, short: `${size}` };
    }
    const memberCount = Array.isArray(activity.party?.members) ? activity.party.members.length : undefined;
    if (typeof memberCount === "number" && memberCount > 0) {
        return { long: `In a party (${memberCount} members)`, short: `${memberCount}` };
    }
    return null;
}

function ActivityTooltipBody({ activity, stopTime, startTime }: { activity: any; stopTime?: number | null; startTime?: number; }) {
    const appId = activity.application_id ?? activity.applicationId;
    let largeImage = getAssetUrl(appId, activity.assets?.large_image ?? activity.assets?.largeImage);
    const smallImage = getAssetUrl(appId, activity.assets?.small_image ?? activity.assets?.smallImage);

    // Prefer rich asset; fall back to app icon component for the large slot
    const largeText = activity.assets?.large_text ?? activity.assets?.largeText;
    const smallText = activity.assets?.small_text ?? activity.assets?.smallText;

    const title = activity.name ?? "Activity";
    const { details, state } = activity;
    const party = getPartyState(activity);

    return (
        <div className="stalker-activity-tooltip-body">
            <div className="stalker-activity-assets">
                {largeImage ? (
                    <img src={largeImage} alt={largeText || "Activity"} className="stalker-activity-large-image" title={largeText} />
                ) : (
                    <ActivityIcon activity={activity} size={64} className="stalker-activity-large-image stalker-activity-large-image--app" />
                )}
                {smallImage && (
                    <img src={smallImage} alt={smallText || ""} className="stalker-activity-small-image" title={smallText} />
                )}
            </div>
            <div className="stalker-activity-meta">
                <strong className="stalker-activity-name">{title}</strong>
                {details && <span className="stalker-activity-details">{details}</span>}
                {state && <span className="stalker-activity-state">{state}</span>}
                {party?.long && <span className="stalker-activity-party">{party.long}</span>}
                {startTime && (
                    <div className="stalker-activity-time" style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--background-modifier-accent)", paddingTop: 6 }}>
                        <span><strong>Started:</strong> {formatTimestamp(startTime)}</span>
                        <span><strong>Stopped:</strong> {stopTime ? formatTimestamp(stopTime) : "Ongoing"}</span>
                        <span><strong>Duration:</strong> {stopTime ? getDurationLabel(stopTime - startTime) : "Ongoing"}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function ActivityBadge({
    activity,
    badgeKey,
    entry,
    allUserLogs,
}: {
    activity: any;
    badgeKey: string;
    entry: PresenceLogEntry;
    allUserLogs?: PresenceLogEntry[];
}) {
    const party = getPartyState(activity);
    const isSpotify = activity.type === 2 && ((activity.name?.toLowerCase?.() === "spotify") || ((activity.application_id ?? activity.applicationId) === "spotify"));
    const isYouTubeMusic = activity.name === "YouTube Music";

    let labelBase = activity.name ?? "activity";
    if (isSpotify) labelBase = "spotify";
    else if (isYouTubeMusic) labelBase = "yt music";

    // Prefer activity timestamps.start when available (more accurate for games)
    const startTime = activity.timestamps?.start ?? entry.timestamp;
    const stopTime = allUserLogs ? getActivityStopTimestamp(entry, activity, allUserLogs) : null;
    const duration = stopTime ? stopTime - startTime : null;
    const durationText = duration ? getDurationLabel(duration) : (entry.currentStatus === "offline" ? null : "Ongoing");

    const label = party?.short ? `${labelBase} (${party.short})` : labelBase;
    const classNames = [
        "stalker-status-badge",
        "stalker-status-badge--activity",
        isSpotify ? "stalker-status-badge--spotify" : "",
        isYouTubeMusic ? "stalker-status-badge--ytmusic" : ""
    ].filter(Boolean).join(" ");

    return (
        <Tooltip
            key={badgeKey}
            text={<ActivityTooltipBody activity={activity} stopTime={stopTime} startTime={startTime} />}
            spacing={12}
            tooltipClassName="stalker-activity-tooltip"
        >
            {(tooltipProps: any) => (
                <span {...tooltipProps} className={classNames}>
                    <ActivityIcon activity={activity} size={15} />
                    <span className="stalker-activity-badge-label">{label}</span>
                    {durationText && <span className="stalker-badge-duration">{durationText}</span>}
                </span>
            )}
        </Tooltip>
    );
}

export function renderPresenceActivitySummary(entry: PresenceLogEntry, allUserLogs?: PresenceLogEntry[]) {
    const activities = (entry as any).activities as any[] | undefined;
    if (!activities || activities.length === 0) {
        if (entry.activitySummary) return <span>Activity: {entry.activitySummary}</span>;
        return null;
    }

    const filteredActivities = activities.filter(act => act.name !== "Hang Status");
    if (filteredActivities.length === 0) return null;
    const seen = new Set<string>();
    const uniqueActivities = filteredActivities.filter(act => {
        const key = String((act.application_id ?? act.applicationId) || act.name || Math.random().toString());
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return (
        <div className="stalker-activity-badges">
            {uniqueActivities.map((act, idx) => (
                <ActivityBadge
                    key={`${entry.userId}-${entry.timestamp}-act-${idx}`}
                    badgeKey={`${entry.userId}-${entry.timestamp}-act-${idx}`}
                    activity={act}
                    entry={entry}
                    allUserLogs={allUserLogs}
                />
            ))}
        </div>
    );
}
