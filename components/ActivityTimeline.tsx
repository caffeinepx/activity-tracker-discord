import { Text, Tooltip, UserStore, useEffect, useMemo, useState } from "@webpack/common";

import type { ScreenshotRedactMode } from "../settings";
import { PresenceLogEntry } from "../types";
import {
    getDurationLabel,
    getPlatformLabel,
    getStatusLabel,
    redactDisplayName,
    redactMask,
} from "../utils";
import { DeviceIcons } from "./Icons";

const PLATFORMS = ["desktop", "mobile", "web"] as const;
type PlatformKey = (typeof PLATFORMS)[number];

const STATUS_COLORS: Record<string, string> = {
    online: "#23a559",
    idle: "#f0b232",
    dnd: "#f23f43",
    offline: "transparent",
    invisible: "transparent",
};

const BASE_HOUR_PX = 64;
const LABEL_W = 88;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Zoom range: 0.75 = overview, 1 = default, 3 = close-up (more horizontal scroll) */
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 3;
const ZOOM_DEFAULT = 1.25;
const ZOOM_STEP = 0.25;

function formatHourLabel(hour: number) {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

/** How often to draw hour labels based on zoom (wider hours = denser labels) */
function hourLabelEvery(hourPx: number) {
    if (hourPx >= 100) return 1;
    if (hourPx >= 70) return 2;
    return 3;
}

export type TimelineSegment = {
    start: number;
    end: number;
    status: string;
};

export type PlatformTimeline = Record<PlatformKey, TimelineSegment[]>;

function normStatus(s?: string | null) {
    const v = (s ?? "offline").toLowerCase();
    if (v === "invisible") return "offline";
    return v || "offline";
}

function isPresentStatus(s: string) {
    return s === "online" || s === "idle" || s === "dnd";
}

/**
 * Reconstruct per-platform status segments for a calendar day from presence logs.
 */
export function buildPlatformTimeline(
    dayLogs: PresenceLogEntry[],
    dayStart: number,
    dayEnd: number,
    now = Date.now()
): PlatformTimeline {
    const lastStatus: Record<PlatformKey, string> = {
        desktop: "offline",
        mobile: "offline",
        web: "offline",
    };
    const openStart: Record<PlatformKey, number | null> = {
        desktop: null,
        mobile: null,
        web: null,
    };
    const segments: PlatformTimeline = {
        desktop: [],
        mobile: [],
        web: [],
    };

    const setStatus = (device: string, status: string, ts: number) => {
        if (!PLATFORMS.includes(device as PlatformKey)) return;
        const d = device as PlatformKey;
        const s = normStatus(status);
        const prev = lastStatus[d];
        if (prev === s) return;

        if (isPresentStatus(prev) && openStart[d] != null) {
            const start = Math.max(openStart[d]!, dayStart);
            const end = Math.min(ts, dayEnd);
            if (end > start) {
                segments[d].push({ start, end, status: prev });
            }
            openStart[d] = null;
        }

        lastStatus[d] = s;
        if (isPresentStatus(s)) {
            openStart[d] = Math.max(ts, dayStart);
        }
    };

    const sorted = [...dayLogs]
        .filter(e => e.type === "presence" || e.type == null)
        .sort((a, b) => a.timestamp - b.timestamp);

    for (const log of sorted) {
        const ts = Math.min(Math.max(log.timestamp, dayStart), dayEnd);
        const changes = log.platformChanges;
        if (Array.isArray(changes) && changes.length > 0) {
            for (const c of changes) {
                setStatus(c.device, c.currentStatus, ts);
            }
            continue;
        }

        if (log.clientStatus && Object.keys(log.clientStatus).length > 0) {
            for (const d of PLATFORMS) {
                setStatus(d, log.clientStatus[d] ?? "offline", ts);
            }
            continue;
        }

        // Fallback: deviceTimings on this event that start/end here
        const timings = log.deviceTimings;
        if (Array.isArray(timings) && timings.length > 0) {
            for (const t of timings) {
                if (!PLATFORMS.includes(t.device as PlatformKey)) continue;
                if (t.start === log.timestamp && t.status) {
                    setStatus(t.device, t.status, ts);
                }
                if (t.end === log.timestamp) {
                    setStatus(t.device, "offline", ts);
                }
            }
        }
    }

    const closeAt = Math.min(Math.max(now, dayStart), dayEnd);
    for (const d of PLATFORMS) {
        if (isPresentStatus(lastStatus[d]) && openStart[d] != null) {
            const start = Math.max(openStart[d]!, dayStart);
            const end = closeAt;
            if (end > start) {
                segments[d].push({ start, end, status: lastStatus[d] });
            }
        }
    }

    return segments;
}

export type DayStats = {
    perPlatform: Record<PlatformKey, { online: number; idle: number; dnd: number; present: number }>;
    combined: { online: number; idle: number; dnd: number; present: number };
    events: {
        presence: number;
        platformFlips: number;
        messages: number;
        profile: number;
        activities: number;
        potentiallyInvisible: number;
    };
    firstSeen: number | null;
    lastSeen: number | null;
};

function emptyPlat() {
    return { online: 0, idle: 0, dnd: 0, present: 0 };
}

export function computeDayStats(
    timeline: PlatformTimeline,
    dayLogs: PresenceLogEntry[],
    dayStart: number,
    dayEnd: number
): DayStats {
    const perPlatform: DayStats["perPlatform"] = {
        desktop: emptyPlat(),
        mobile: emptyPlat(),
        web: emptyPlat(),
    };

    for (const d of PLATFORMS) {
        for (const seg of timeline[d]) {
            const ms = Math.max(0, seg.end - seg.start);
            const st = normStatus(seg.status);
            if (st === "online") perPlatform[d].online += ms;
            else if (st === "idle") perPlatform[d].idle += ms;
            else if (st === "dnd") perPlatform[d].dnd += ms;
            if (isPresentStatus(st)) perPlatform[d].present += ms;
        }
    }

    // Union of presence across platforms using 1-minute buckets
    const minutes = 24 * 60;
    const onlineB = new Uint8Array(minutes);
    const idleB = new Uint8Array(minutes);
    const dndB = new Uint8Array(minutes);
    const presentB = new Uint8Array(minutes);

    const mark = (bucket: Uint8Array, start: number, end: number) => {
        const s = Math.max(0, Math.floor((start - dayStart) / 60000));
        const e = Math.min(minutes, Math.ceil((end - dayStart) / 60000));
        for (let i = s; i < e; i++) bucket[i] = 1;
    };

    for (const d of PLATFORMS) {
        for (const seg of timeline[d]) {
            const st = normStatus(seg.status);
            if (st === "online") mark(onlineB, seg.start, seg.end);
            if (st === "idle") mark(idleB, seg.start, seg.end);
            if (st === "dnd") mark(dndB, seg.start, seg.end);
            if (isPresentStatus(st)) mark(presentB, seg.start, seg.end);
        }
    }

    const sum = (b: Uint8Array) => {
        let n = 0;
        for (let i = 0; i < b.length; i++) n += b[i];
        return n * 60000;
    };

    let platformFlips = 0;
    let activities = 0;
    let firstSeen: number | null = null;
    let lastSeen: number | null = null;

    for (const log of dayLogs) {
        if (log.timestamp < dayStart || log.timestamp >= dayEnd) continue;
        if (firstSeen == null || log.timestamp < firstSeen) firstSeen = log.timestamp;
        if (lastSeen == null || log.timestamp > lastSeen) lastSeen = log.timestamp;
        if (log.platformChanges?.length) platformFlips += log.platformChanges.length;
        if (Array.isArray(log.activities) && log.activities.length && (log.activityChange !== false)) {
            activities += log.activities.filter((a: any) => a?.type !== 4).length;
        }
    }

    return {
        perPlatform,
        combined: {
            online: sum(onlineB),
            idle: sum(idleB),
            dnd: sum(dndB),
            present: sum(presentB),
        },
        events: {
            presence: dayLogs.filter(e => (e.type === "presence" || e.type == null)).length,
            platformFlips,
            messages: dayLogs.filter(e => e.type === "message" || (!!e.guildId && e.guildId !== "@me" && e.type !== "profile" && e.type !== "presence")).length,
            profile: dayLogs.filter(e => e.type === "profile").length,
            activities,
            potentiallyInvisible: dayLogs.filter(e => e.potentiallyInvisible).length,
        },
        firstSeen,
        lastSeen,
    };
}

function formatClock(ts: number) {
    try {
        return new Date(ts).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    } catch {
        return "";
    }
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="stalker-stat-card">
            <div className="stalker-stat-card__value">{value}</div>
            <div className="stalker-stat-card__label">{label}</div>
            {hint && <div className="stalker-stat-card__hint">{hint}</div>}
        </div>
    );
}

function dur(ms: number) {
    return getDurationLabel(ms) || "0m";
}

function TimelineRow({
    device,
    segments,
    dayStart,
    hourPx,
}: {
    device: PlatformKey;
    segments: TimelineSegment[];
    dayStart: number;
    hourPx: number;
}) {
    const Icon = DeviceIcons[device] ?? DeviceIcons.desktop;
    const trackW = 24 * hourPx;
    return (
        <div className="stalker-timeline-row">
            <div className="stalker-timeline-row__label" style={{ width: LABEL_W }}>
                <span className="stalker-timeline-row__icon"><Icon /></span>
                <span>{getPlatformLabel(device)}</span>
            </div>
            <div
                className="stalker-timeline-row__track"
                style={{
                    width: trackW,
                    // Keep hour grid lines in sync with zoom
                    backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent ${hourPx}px)`,
                }}
            >
                {segments.map((seg, i) => {
                    const left = ((seg.start - dayStart) / DAY_MS) * 100;
                    // Min width in % scales with zoom so short blips stay visible
                    const minPct = Math.max(0.15, (3 / trackW) * 100);
                    const width = Math.max(((seg.end - seg.start) / DAY_MS) * 100, minPct);
                    const color = STATUS_COLORS[normStatus(seg.status)] ?? STATUS_COLORS.online;
                    const title = `${getPlatformLabel(device)} ${getStatusLabel(seg.status)}\n${formatClock(seg.start)} – ${formatClock(seg.end)}\n${dur(seg.end - seg.start)}`;
                    return (
                        <Tooltip key={`${device}-${seg.start}-${i}`} text={title}>
                            {props => (
                                <div
                                    {...props}
                                    className={`stalker-timeline-seg stalker-timeline-seg--${normStatus(seg.status)}`}
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        backgroundColor: color,
                                    }}
                                />
                            )}
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}

function RedactedTitle({
    text,
    screenshotMode,
    redactMode,
    className,
}: {
    text: string;
    screenshotMode: boolean;
    redactMode: ScreenshotRedactMode;
    className?: string;
}) {
    if (!screenshotMode) {
        return <span className={className}>{text}</span>;
    }
    if (redactMode === "redact") {
        return <span className={className}>{text.startsWith("@") ? "@user" : "User"}</span>;
    }
    return (
        <span
            className={`${className ?? ""} stalker-ss-text stalker-ss-text--${redactMode}`.trim()}
            aria-label="redacted"
            title=""
        >
            {redactMask(text, text.startsWith("@"))}
        </span>
    );
}

function defaultDiscordAvatarUrl(userId?: string) {
    let idx = 0;
    try {
        if (userId) idx = Number((BigInt(userId) >> 22n) % 6n);
    } catch { /* ignore */ }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

/** Avatar for timeline/stats header — respects screenshot mode */
function InsightsAvatar({
    userId,
    username,
    screenshotMode,
    redactMode,
}: {
    userId: string;
    username?: string | null;
    screenshotMode: boolean;
    redactMode: ScreenshotRedactMode;
}) {
    const user = UserStore.getUser(userId);
    const realUrl = user?.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=64`
        : null;

    if (screenshotMode) {
        if (redactMode === "redact") {
            return (
                <img
                    src={defaultDiscordAvatarUrl(userId)}
                    alt=""
                    className="stalker-insights-avatar stalker-ss-avatar stalker-ss-avatar--redact"
                />
            );
        }
        if (redactMode === "blackout") {
            return <div className="stalker-insights-avatar stalker-ss-avatar stalker-ss-avatar--blackout" aria-hidden />;
        }
        const src = realUrl || defaultDiscordAvatarUrl(userId);
        return (
            <img
                src={src}
                alt=""
                className="stalker-insights-avatar stalker-ss-avatar stalker-ss-avatar--blur"
            />
        );
    }

    if (realUrl) {
        return <img src={realUrl} alt="" className="stalker-insights-avatar" />;
    }
    return (
        <div className="stalker-insights-avatar stalker-insights-avatar--fallback" aria-hidden>
            {(username || "?").charAt(0).toUpperCase()}
        </div>
    );
}

export function ActivityInsightsPanel({
    userId,
    dayLogs,
    dayStart,
    dayEnd,
    dayLabel,
    screenshotMode = false,
    redactMode = "redact",
}: {
    userId: string | null;
    dayLogs: PresenceLogEntry[];
    dayStart: number;
    dayEnd: number;
    dayLabel: string;
    screenshotMode?: boolean;
    redactMode?: ScreenshotRedactMode;
}) {
    const [tab, setTab] = useState<"timeline" | "stats">("timeline");
    const [zoom, setZoom] = useState(ZOOM_DEFAULT);

    const hourPx = Math.round(BASE_HOUR_PX * zoom);
    const timelineWidth = 24 * hourPx;
    const labelEvery = hourLabelEvery(hourPx);
    const zoomPct = Math.round(zoom * 100);

    const nudgeZoom = (delta: number) => {
        setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) / ZOOM_STEP) * ZOOM_STEP)));
    };

    const candidates = useMemo(() => {
        const ids = new Set<string>();
        for (const l of dayLogs) ids.add(l.userId);
        return Array.from(ids);
    }, [dayLogs]);

    const [pickedUserId, setPickedUserId] = useState<string | null>(userId);

    useEffect(() => {
        if (userId) {
            setPickedUserId(userId);
            return;
        }
        setPickedUserId(prev => {
            if (prev && candidates.includes(prev)) return prev;
            return candidates[0] ?? null;
        });
    }, [userId, candidates]);

    const activeUserId = userId ?? pickedUserId;

    const userLogs = useMemo(
        () => (activeUserId ? dayLogs.filter(l => l.userId === activeUserId) : []),
        [dayLogs, activeUserId]
    );

    const timeline = useMemo(
        () => buildPlatformTimeline(userLogs, dayStart, dayEnd),
        [userLogs, dayStart, dayEnd]
    );

    const stats = useMemo(
        () => computeDayStats(timeline, userLogs, dayStart, dayEnd),
        [timeline, userLogs, dayStart, dayEnd]
    );

    const user = activeUserId ? UserStore.getUser(activeUserId) : null;
    const rawDisplayName =
        (user as any)?.globalName
        || (user as any)?.global_name
        || user?.username
        || (activeUserId ? "User" : "All users");
    const displayName = redactDisplayName(rawDisplayName, redactMode, screenshotMode);

    const hours = Array.from({ length: 24 }, (_, h) => h);
    // Always show Desktop + Mobile; Web only when it has activity
    const rows: PlatformKey[] = [
        "desktop",
        "mobile",
        ...(timeline.web.length > 0 ? (["web"] as PlatformKey[]) : []),
    ];
    const hasAnySeg = PLATFORMS.some(d => timeline[d].length > 0);

    if (!activeUserId) {
        return (
            <div className="stalker-insights">
                <div className="stalker-insights-empty">
                    <Text variant="text-md/semibold">No activity for this day</Text>
                    <Text variant="text-sm/normal" className="stalker-insights-empty__hint">
                        Open Presence History for a tracked user, or wait until there are logs for today.
                    </Text>
                </div>
            </div>
        );
    }

    return (
        <div className={`stalker-insights${tab === "timeline" ? " stalker-insights--timeline" : " stalker-insights--stats"}`}>
            <div className="stalker-insights-head">
                <div className="stalker-insights-head__left">
                    <div className="stalker-insights-identity">
                        <InsightsAvatar
                            userId={activeUserId}
                            username={user?.username ?? rawDisplayName}
                            screenshotMode={screenshotMode}
                            redactMode={redactMode}
                        />
                        <div className="stalker-insights-identity__text">
                            <Text variant="text-md/semibold" className="stalker-insights-title">
                                <RedactedTitle
                                    text={displayName}
                                    screenshotMode={screenshotMode}
                                    redactMode={redactMode}
                                />
                            </Text>
                            <div className="stalker-insights-head__meta">
                                <span className="stalker-insights-sub">{dayLabel}</span>
                                <span className="stalker-timeline-legend">
                                    <span><i style={{ background: STATUS_COLORS.online }} /> Online</span>
                                    <span><i style={{ background: STATUS_COLORS.idle }} /> Idle</span>
                                    <span><i style={{ background: STATUS_COLORS.dnd }} /> DND</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    {!userId && candidates.length > 1 && (
                        <select
                            className="stalker-insights-user-select"
                            value={activeUserId}
                            onChange={e => setPickedUserId(e.target.value)}
                            aria-label="User for timeline"
                        >
                            {candidates.map((id, i) => {
                                const u = UserStore.getUser(id);
                                const raw =
                                    (u as any)?.globalName
                                    || (u as any)?.global_name
                                    || u?.username
                                    || id;
                                // Select options can't blur — always use opaque placeholder in screenshot mode
                                const name = screenshotMode
                                    ? (redactMode === "redact" ? "User" : `User ${i + 1}`)
                                    : raw;
                                return (
                                    <option key={id} value={id}>{name}</option>
                                );
                            })}
                        </select>
                    )}
                </div>
                <div className="stalker-insights-tabs">
                    <button
                        type="button"
                        className={`stalker-insights-tab${tab === "timeline" ? " stalker-insights-tab--active" : ""}`}
                        onClick={() => setTab("timeline")}
                    >
                        Timeline
                    </button>
                    <button
                        type="button"
                        className={`stalker-insights-tab${tab === "stats" ? " stalker-insights-tab--active" : ""}`}
                        onClick={() => setTab("stats")}
                    >
                        Stats
                    </button>
                </div>
            </div>

            {tab === "timeline" ? (
                <div className="stalker-timeline">
                    <div className="stalker-timeline-toolbar">
                        <span className="stalker-timeline-toolbar__label">Zoom</span>
                        <button
                            type="button"
                            className="stalker-timeline-zoom-btn"
                            onClick={() => nudgeZoom(-ZOOM_STEP)}
                            disabled={zoom <= ZOOM_MIN}
                            aria-label="Zoom out"
                            title="Zoom out (more of the day at once)"
                        >
                            −
                        </button>
                        <input
                            type="range"
                            className="stalker-timeline-zoom"
                            min={ZOOM_MIN}
                            max={ZOOM_MAX}
                            step={ZOOM_STEP}
                            value={zoom}
                            onChange={e => setZoom(Number(e.target.value))}
                            aria-label="Timeline zoom"
                            title={`${zoomPct}%`}
                        />
                        <button
                            type="button"
                            className="stalker-timeline-zoom-btn"
                            onClick={() => nudgeZoom(ZOOM_STEP)}
                            disabled={zoom >= ZOOM_MAX}
                            aria-label="Zoom in"
                            title="Zoom in (wider hours, more scrolling)"
                        >
                            +
                        </button>
                        <span className="stalker-timeline-toolbar__pct">{zoomPct}%</span>
                        {zoom !== ZOOM_DEFAULT && (
                            <button
                                type="button"
                                className="stalker-timeline-zoom-reset"
                                onClick={() => setZoom(ZOOM_DEFAULT)}
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    {!hasAnySeg ? (
                        <div className="stalker-insights-empty stalker-insights-empty--inline">
                            <Text variant="text-sm/normal">
                                No platform bars yet for this day. New desktop/mobile status events will appear here.
                            </Text>
                        </div>
                    ) : null}

                    <div className="stalker-timeline-scroll">
                        <div className="stalker-timeline-inner" style={{ width: timelineWidth + LABEL_W }}>
                            <div className="stalker-timeline-hours">
                                <div className="stalker-timeline-hours__spacer" style={{ width: LABEL_W }} />
                                <div className="stalker-timeline-hours__rail" style={{ width: timelineWidth }}>
                                    {hours.map(h => (
                                        <div key={h} className="stalker-timeline-hour" style={{ width: hourPx }}>
                                            {h % labelEvery === 0 ? formatHourLabel(h) : ""}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {rows.map(d => (
                                <TimelineRow
                                    key={d}
                                    device={d}
                                    segments={timeline[d]}
                                    dayStart={dayStart}
                                    hourPx={hourPx}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="stalker-timeline-hint">
                        Scroll sideways · zoom in for detail · hover bars for exact times
                    </div>
                </div>
            ) : (
                <div className="stalker-stats">
                    <div className="stalker-stats-grid stalker-stats-grid--4">
                        <StatCard label="Present" value={dur(stats.combined.present)} hint="Any platform" />
                        <StatCard label="Online" value={dur(stats.combined.online)} />
                        <StatCard label="Idle" value={dur(stats.combined.idle)} />
                        <StatCard label="DND" value={dur(stats.combined.dnd)} />
                    </div>

                    <div className="stalker-stats-section-title">Per platform</div>
                    <div className="stalker-stats-platforms">
                        {PLATFORMS.map(d => {
                            const p = stats.perPlatform[d];
                            if (p.present <= 0 && p.online <= 0 && p.idle <= 0 && p.dnd <= 0) return null;
                            return (
                                <div key={d} className="stalker-stats-plat-card">
                                    <div className="stalker-stats-plat-card__name">{getPlatformLabel(d)}</div>
                                    <div className="stalker-stats-plat-card__vals">
                                        <span className="stalker-stats-plat-card__v stalker-stats-plat-card__v--online">
                                            <em>Online</em> {dur(p.online)}
                                        </span>
                                        <span className="stalker-stats-plat-card__v stalker-stats-plat-card__v--idle">
                                            <em>Idle</em> {dur(p.idle)}
                                        </span>
                                        <span className="stalker-stats-plat-card__v stalker-stats-plat-card__v--dnd">
                                            <em>DND</em> {dur(p.dnd)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="stalker-stats-section-title">Day activity</div>
                    <div className="stalker-stats-grid stalker-stats-grid--3">
                        <StatCard label="Presence" value={String(stats.events.presence)} />
                        <StatCard label="Platform flips" value={String(stats.events.platformFlips)} />
                        <StatCard label="Messages" value={String(stats.events.messages)} />
                        <StatCard label="Profile edits" value={String(stats.events.profile)} />
                        <StatCard label="Activities" value={String(stats.events.activities)} />
                        <StatCard label="Maybe invisible" value={String(stats.events.potentiallyInvisible)} />
                    </div>

                    {(stats.firstSeen || stats.lastSeen) && (
                        <div className="stalker-stats-span">
                            {stats.firstSeen && <span>First {formatClock(stats.firstSeen)}</span>}
                            {stats.lastSeen && <span>Last {formatClock(stats.lastSeen)}</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
