
import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { GuildStore, NavigationRouter, PresenceStore, ScrollerThin, Text, Tooltip, useEffect, useMemo, UserStore, useState } from "@webpack/common";

import { getScreenshotRedactMode, getUiModeClass, isDebugEnabled, settings, type ScreenshotRedactMode } from "../settings";
import { clearProfileSnapshots, deleteUserLogs, getNativeHelper, importPresenceLogsJson, isDesktopEnv, loadPresenceLogs, presenceLogListeners, presenceLogs } from "../store";
import { PresenceLogEntry } from "../types";
import {
    formatTimestamp,
    getDurationLabel,
    getPlatformLabel,
    getStatusClass,
    getStatusLabel,
    logger,
    redactDisplayName,
    redactMask,
    redactTag,
} from "../utils";
import { ActivityInsightsPanel } from "./ActivityTimeline";
import { renderPresenceActivitySummary } from "./ActivityBadges";
import { DeviceBadges, DeviceIcons, HistoryIcon, ProfileIcon, ActivityIcon, MessageIcon, PresenceIcon, WarningIcon } from "./Icons";
import { renderProfileChangeBadges } from "./ProfileCard";
import { CosmeticsUserIsland } from "./ProfileCosmetics";
import { openSnapshotsModal } from "./SnapshotsModal";
import { openUserStalkerSettings } from "./UserSettings";

const cl = classNameFactory("stalker-modal-");

type SectionId = "presence" | "profile" | "messages" | "rich";

const REDACT_MODES: { id: ScreenshotRedactMode; label: string; hint: string }[] = [
    { id: "redact", label: "Redact", hint: "Default Discord avatar + @user" },
    { id: "blur", label: "Blur", hint: "Soft pill blur on face & name" },
    { id: "blackout", label: "Blackout", hint: "Solid black pills" },
];

/** Discord embed default avatar (0–5) from snowflake */
function defaultDiscordAvatarUrl(userId?: string) {
    let idx = 0;
    try {
        if (userId) {
            // New username system: (id >> 22) % 6
            const n = BigInt(userId);
            idx = Number((n >> 22n) % 6n);
        }
    } catch {
        idx = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

const SECTIONS: { id: SectionId; label: string; icon: () => React.ReactNode; description: string }[] = [
    { id: "presence", label: "Presence", icon: PresenceIcon, description: "Status & platform changes" },
    { id: "profile", label: "Profile", icon: ProfileIcon, description: "Avatar, bio & cosmetics" },
    { id: "messages", label: "Messages", icon: MessageIcon, description: "Logged messages" },
    { id: "rich", label: "Activity", icon: ActivityIcon, description: "Games & rich presence" },
];

function isOffStatus(s?: string | null) {
    const v = (s ?? "").toLowerCase();
    return !v || v === "offline" || v === "invisible";
}

function chipClassForStatus(status: string) {
    const statusKey = (status ?? "online").toLowerCase();
    if (statusKey === "offline" || statusKey === "invisible") return "stalker-meta-chip--offline";
    if (statusKey === "idle") return "stalker-meta-chip--idle";
    if (statusKey === "dnd") return "stalker-meta-chip--dnd";
    return "stalker-meta-chip--online";
}

function renderDeviceBadges(entry: PresenceLogEntry) {
    const clientStatus = (entry as any).clientStatus as Record<string, string> | undefined;
    const deviceTimings = (entry as any).deviceTimings as Array<{ device: string; status: string; start: number; end?: number | null }> | undefined;
    if (!clientStatus && !deviceTimings) return null;
    return <DeviceBadges clientStatus={clientStatus} deviceTimings={deviceTimings} entryTimestamp={entry.timestamp} showAll />;
}

type DurationChip = {
    key: string;
    device?: string;
    status: string;
    durationMs: number;
    ongoing?: boolean;
};

/**
 * Build platform-specific duration chips (e.g. "Mobile Online 2h 14m").
 * Prefer real per-platform data over a vague "Session Online" label.
 */
function getPresenceDurationChips(entry: PresenceLogEntry): DurationChip[] {
    const chips: DurationChip[] = [];
    // Dedupe by what the user sees (device + status + ongoing), not by source.
    // platformDurations + platformChanges + deviceTimings used to all contribute
    // the same "Mobile Online 8s" chip three times with different internal keys.
    const seen = new Set<string>();

    const push = (chip: DurationChip) => {
        if (!chip.durationMs || chip.durationMs <= 0) return;
        const dedupe = `${(chip.device ?? "").toLowerCase()}|${(chip.status ?? "").toLowerCase()}|${chip.ongoing ? "on" : "off"}`;
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        chips.push(chip);
    };

    // Prefer explicit platformDurations from the logger when present — single source of truth
    if (Array.isArray(entry.platformDurations) && entry.platformDurations.length > 0) {
        for (const pd of entry.platformDurations) {
            push({
                key: `pd-${pd.device}-${pd.status}-${pd.ongoing ? "on" : "off"}`,
                device: pd.device,
                status: pd.status || "online",
                durationMs: pd.durationMs,
                ongoing: pd.ongoing,
            });
        }
        return chips;
    }

    // 2) platformChanges with previousDurationMs
    if (Array.isArray(entry.platformChanges)) {
        for (const c of entry.platformChanges) {
            if (c.previousDurationMs != null && c.previousDurationMs > 0 && !isOffStatus(c.previousStatus)) {
                push({
                    key: `pc-${c.device}-${c.previousStatus}`,
                    device: c.device,
                    status: c.previousStatus || "online",
                    durationMs: c.previousDurationMs,
                });
            }
        }
    }

    // 3) Derive from deviceTimings at this event (only if no platformChanges chips yet)
    const timings = entry.deviceTimings;
    if (chips.length === 0 && Array.isArray(timings) && timings.length > 0) {
        for (const t of timings) {
            if (t.end === entry.timestamp && t.start != null && !isOffStatus(t.status)) {
                push({
                    key: `dt-end-${t.device}-${t.status}`,
                    device: t.device,
                    status: t.status || "online",
                    durationMs: entry.timestamp - t.start,
                });
            }
            if (t.end == null && t.start != null && !isOffStatus(t.status)) {
                push({
                    key: `dt-on-${t.device}-${t.status}`,
                    device: t.device,
                    status: t.status,
                    durationMs: entry.timestamp - t.start,
                    ongoing: true,
                });
            }
        }
    }

    if (chips.length > 0) return chips;

    // 4) Fall back: attribute onlineDuration to a platform when we can
    const change = entry.platformChanges?.[0];
    const changedDevice =
        change?.device
        ?? (Array.isArray(timings)
            ? timings.find(t => t.start === entry.timestamp || t.end === entry.timestamp)?.device
            : undefined);

    if (entry.onlineDuration != null && entry.onlineDuration > 0) {
        // If the platform that flipped was present before, duration belongs to that platform/status
        if (change && !isOffStatus(change.previousStatus)) {
            push({
                key: `fb-${change.device}-${change.previousStatus}`,
                device: change.device,
                status: change.previousStatus,
                durationMs: entry.onlineDuration,
            });
        } else {
            // Otherwise pick an active platform from clientStatus (e.g. Desktop still Online)
            const active = entry.clientStatus
                ? Object.entries(entry.clientStatus).find(([, s]) => !isOffStatus(s))
                : undefined;
            if (active) {
                push({
                    key: `fb-active-${active[0]}-${active[1]}`,
                    device: active[0],
                    status: active[1],
                    durationMs: entry.onlineDuration,
                    ongoing: true,
                });
            } else if (changedDevice) {
                push({
                    key: `fb-dev-${changedDevice}`,
                    device: changedDevice,
                    status: "online",
                    durationMs: entry.onlineDuration,
                });
            }
            // No generic "Session Online" chip — if we can't name a platform, skip
        }
    }

    if (entry.offlineDuration != null && entry.offlineDuration > 0) {
        push({
            key: `fb-offline-${changedDevice ?? "all"}`,
            device: changedDevice,
            status: "offline",
            durationMs: entry.offlineDuration,
        });
    }

    return chips;
}

function renderPresenceStatuses(entry: PresenceLogEntry) {
    const deviceTimings = (entry as any).deviceTimings as Array<{ device: string; status: string; start: number; end?: number | null }> | undefined;

    if (Array.isArray(deviceTimings) && deviceTimings.length > 0) {
        const devices = ["desktop", "mobile", "web"];
        const transitions: React.ReactNode[] = [];

        for (const device of devices) {
            const endedSegment = deviceTimings.find(t => t.device === device && t.end === entry.timestamp);
            const startedSegment = deviceTimings.find(t => t.device === device && t.start === entry.timestamp);

            if (endedSegment || startedSegment) {
                const prevStatus = endedSegment ? endedSegment.status : "offline";
                const currStatus = startedSegment ? startedSegment.status : "offline";

                if (prevStatus !== currStatus) {
                    const Icon = DeviceIcons[device as keyof typeof DeviceIcons] ?? DeviceIcons.desktop;
                    transitions.push(
                        <div key={device} className="stalker-status-transition">
                            <span className="stalker-status-transition__device">
                                <Icon />
                                <span>{device}</span>
                            </span>
                            <span className={getStatusClass(prevStatus)}>{getStatusLabel(prevStatus)}</span>
                            <span className="stalker-log-entry__arrow">→</span>
                            <span className={getStatusClass(currStatus)}>{getStatusLabel(currStatus)}</span>
                        </div>
                    );
                }
            }
        }

        if (transitions.length > 0) {
            return (
                <div className="stalker-status-transitions">
                    {transitions}
                </div>
            );
        }
    }

    return (
        <div className="stalker-log-entry__statuses">
            {entry.previousStatus && (
                <>
                    <span className={getStatusClass(entry.previousStatus)}>{getStatusLabel(entry.previousStatus)}</span>
                    <span className="stalker-log-entry__arrow">→</span>
                </>
            )}
            <span className={getStatusClass(entry.currentStatus)}>{getStatusLabel(entry.currentStatus)}</span>
        </div>
    );
}

function UserAvatar({
    userId,
    username,
    screenshotMode,
    redactMode,
    sizeClass,
}: {
    userId: string;
    username?: string;
    screenshotMode?: boolean;
    redactMode?: ScreenshotRedactMode;
    sizeClass?: string;
}) {
    const user = UserStore.getUser(userId);
    const realUrl = user?.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=64`
        : null;
    const baseClass = sizeClass ?? "stalker-log-entry__avatar";

    if (screenshotMode) {
        const mode = redactMode ?? "redact";
        if (mode === "redact") {
            return (
                <img
                    src={defaultDiscordAvatarUrl(userId)}
                    alt=""
                    className={`${baseClass} stalker-ss-avatar stalker-ss-avatar--redact`}
                />
            );
        }
        if (mode === "blackout") {
            return <div className={`${baseClass} stalker-ss-avatar stalker-ss-avatar--blackout`} aria-hidden />;
        }
        const src = realUrl || defaultDiscordAvatarUrl(userId);
        // blur
        return (
            <img
                src={src}
                alt=""
                className={`${baseClass} stalker-ss-avatar stalker-ss-avatar--blur`}
            />
        );
    }

    if (realUrl) {
        return <img src={realUrl} alt="" className={baseClass} />;
    }
    return (
        <div className={`${baseClass} stalker-log-entry__avatar--fallback`}>
            {username?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
    );
}

function IdentityName({
    text,
    screenshotMode,
    redactMode,
    className,
    style,
}: {
    text: string;
    screenshotMode: boolean;
    redactMode: ScreenshotRedactMode;
    className?: string;
    style?: Record<string, any>;
}) {
    if (!screenshotMode) {
        return <span className={className} style={style}>{text}</span>;
    }
    if (redactMode === "redact") {
        const display = text.startsWith("@") ? "@user" : "User";
        return <span className={className} style={style}>{display}</span>;
    }
    // blur / blackout: fixed mask so real name never leaks via selection/copy
    const mask = redactMask(text, text.startsWith("@"));
    return (
        <span
            className={`${className ?? ""} stalker-ss-text stalker-ss-text--${redactMode}`.trim()}
            style={style}
            aria-label="redacted"
            title=""
        >
            {mask}
        </span>
    );
}

function ConfirmDeleteModal({ modalProps, onConfirm }: { modalProps: ModalProps; onConfirm: () => void; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold">Delete Logs?</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <Text variant="text-md/normal">
                    Are you sure you want to delete all logs for this user? This action cannot be undone.
                </Text>
            </ModalContent>
            <ModalFooter>
                <Button
                    variant="dangerPrimary"
                    onClick={() => {
                        onConfirm();
                        modalProps.onClose();
                    }}
                >
                    Delete
                </Button>
                <Button variant="secondary" onClick={modalProps.onClose}>
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function ConfirmClearSnapshotsModal({ modalProps, onConfirm }: { modalProps: ModalProps; onConfirm: () => void; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold">Clear All Snapshots?</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <Text variant="text-md/normal">
                    Are you sure you want to delete ALL profile snapshots?
                    This will reset change detection for all users. The next time you view them, a new baseline snapshot will be created.
                </Text>
            </ModalContent>
            <ModalFooter>
                <Button
                    variant="dangerPrimary"
                    onClick={() => {
                        onConfirm();
                        modalProps.onClose();
                    }}
                >
                    Clear Snapshots
                </Button>
                <Button variant="secondary" onClick={modalProps.onClose}>
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
    return (
        <div className="stalker-empty-state">
            <div className="stalker-empty-state__icon">
                <HistoryIcon />
            </div>
            <Text variant="text-md/medium" className="stalker-empty-state__text">{message}</Text>
            <Text variant="text-sm/normal" className="stalker-empty-state__hint">
                {hint ?? "Activity will appear here as it is recorded."}
            </Text>
        </div>
    );
}

function LivePlatformStrip({ userId }: { userId: string }) {
    const status = PresenceStore.getStatus(userId) as string | null;
    const clientStatus = (() => {
        const stateStatuses = (PresenceStore as any)?.getState?.()?.clientStatuses?.[userId];
        const direct = (PresenceStore as any)?.getClientStatuses?.(userId);
        return { ...(stateStatuses ?? {}), ...(direct ?? {}) } as Record<string, string>;
    })();

    return (
        <div className="stalker-live-platform-strip">
            <span className={getStatusClass(status ?? "offline")}>{getStatusLabel(status ?? "offline")}</span>
            <DeviceBadges clientStatus={clientStatus} showAll />
        </div>
    );
}

export function PresenceHistoryPanel({ modalProps, initialUserId }: { modalProps: ModalProps; initialUserId?: string; }) {
    const [logs, setLogs] = useState<PresenceLogEntry[]>(presenceLogs);
    const [loading, setLoading] = useState(true);
    const [screenshotMode, setScreenshotMode] = useState(false);
    const [redactMode, setRedactMode] = useState<ScreenshotRedactMode>(() => getScreenshotRedactMode());
    const [showSsMenu, setShowSsMenu] = useState(false);
    const filterUserId = initialUserId ?? null;
    const { uiMode } = settings.use(["uiMode"]);
    const uiModeClass = getUiModeClass(uiMode as any);

    const setRedactModePersist = (mode: ScreenshotRedactMode) => {
        setRedactMode(mode);
        try {
            settings.store.screenshotRedactMode = mode;
        } catch { /* ignore */ }
    };

    const userLogsMap = useMemo(() => {
        const map = new Map<string, PresenceLogEntry[]>();
        for (const log of logs) {
            if (!map.has(log.userId)) map.set(log.userId, []);
            map.get(log.userId)!.push(log);
        }
        return map;
    }, [logs]);

    const [selectedSection, setSelectedSection] = useState<SectionId>("presence");
    const [dayOffset, setDayOffset] = useState(0);
    const [platformFilter, setPlatformFilter] = useState<"all" | "desktop" | "mobile" | "web">("all");
    /** logs = feed · insights = day timeline + stats */
    const [mainView, setMainView] = useState<"logs" | "insights">("logs");

    const dayRange = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - dayOffset);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        return { start: start.getTime(), end: end.getTime(), label: start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) };
    }, [dayOffset]);

    const dayLabel = dayRange.label;
    const logsForDay = useMemo(
        () => logs.filter(entry => entry.timestamp >= dayRange.start && entry.timestamp < dayRange.end),
        [logs, dayRange]
    );

    const showPrevDay = () => setDayOffset(prev => prev + 1);
    const showNextDay = () => setDayOffset(prev => Math.max(0, prev - 1));
    const isToday = dayOffset === 0;

    useEffect(() => {
        const updateLogs = (newLogs: PresenceLogEntry[]) => setLogs([...newLogs]);
        presenceLogListeners.add(updateLogs);
        // Always re-load from disk when the panel opens (native may not have been ready at plugin start)
        setLoading(true);
        loadPresenceLogs()
            .then(() => setLogs([...presenceLogs]))
            .catch(e => logger.error("Failed to refresh logs on open", e))
            .finally(() => setLoading(false));
        return () => { presenceLogListeners.delete(updateLogs); };
    }, []);

    const forUser = (entry: PresenceLogEntry) => !filterUserId || entry.userId === filterUserId;

    const presenceItems = logsForDay.filter(e =>
        forUser(e)
        && (e as any).type !== "profile"
        && (e as any).type !== "message"
        && (e as any).type !== "typing"
        && (e.previousStatus !== undefined || e.currentStatus !== undefined || (e as any).deviceChange)
    );
    const basePresenceItems = presenceItems.filter(e =>
        (e.previousStatus !== undefined && e.previousStatus !== e.currentStatus) || (e as any).deviceChange
    );
    const richActivityItems = presenceItems.filter(e => {
        const hasActivities = Array.isArray((e as any).activities) && (e as any).activities.length > 0;
        if (!hasActivities) return false;
        return (e as any).activityChange === undefined || (e as any).activityChange === true;
    });
    const profileItems = logsForDay.filter(e => forUser(e) && ((e as any).type === "profile"));
    const messageItems = logsForDay.filter(e => forUser(e) && (((e as any).type === "message") || (e.guildId && e.guildId !== "@me")));

    const filteredPresenceItems = useMemo(() => {
        if (platformFilter === "all") return basePresenceItems;
        return basePresenceItems.filter(e => {
            const deviceTimings = (e as any).deviceTimings;
            if (Array.isArray(deviceTimings) && deviceTimings.length > 0) {
                return deviceTimings.some((t: any) => t.device === platformFilter && (t.start === e.timestamp || t.end === e.timestamp));
            }
            return e.clientStatus && e.clientStatus[platformFilter] && e.clientStatus[platformFilter] !== "offline";
        });
    }, [basePresenceItems, platformFilter]);

    const sectionCounts: Record<SectionId, number> = {
        presence: basePresenceItems.length,
        profile: profileItems.length,
        messages: messageItems.length,
        rich: richActivityItems.length,
    };

    const totalChanges = basePresenceItems.length + profileItems.length + messageItems.length + richActivityItems.length;
    const totalLoadedForScope = logs.filter(forUser).length;
    const filterUser = filterUserId ? UserStore.getUser(filterUserId) : null;
    const filterUsername = filterUser?.username ?? filterUserId;

    const openLogs = async () => {
        const native = getNativeHelper();
        if (!native) {
            logger.warn("Native log helpers unavailable — Open Logs needs the desktop plugin native module");
            return;
        }
        try {
            if (filterUserId) await native.openLogFile(filterUserId);
            else await native.openLogsFolder();
        } catch (e) {
            logger.error("Failed to open logs", e);
        }
    };

    const canOpenNativeLogs = isDesktopEnv() || !!getNativeHelper();

    const exportLogs = () => {
        // Only the selected user (or everyone if no user filter) — filename used to
        // claim frierenq while dumping every loaded user into the JSON.
        const toExport = filterUserId
            ? logs.filter(entry => entry.userId === filterUserId)
            : logs;
        if (!toExport.length) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(toExport, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        const nameHint = filterUserId
            ? `${filterUsername ?? filterUserId}`
            : "all";
        downloadAnchor.setAttribute("download", `${nameHint}_activity_logs.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    const [importing, setImporting] = useState(false);

    /** Merge a previously exported JSON file into storage (safe; never deletes). */
    const importLogs = () => {
        if (importing) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            setImporting(true);
            try {
                const text = await file.text();
                const raw = JSON.parse(text);
                const result = await importPresenceLogsJson(raw);
                setLogs([...presenceLogs]);
                logger.info(
                    `Import OK: ${result.entryCount} entries across ${result.userCount} user(s)`,
                    result.perUser
                );
                // Visible feedback without Toasts dependency
                alert(
                    `Imported history successfully.
` +
                    `${result.entryCount} entries · ${result.userCount} user(s)
` +
                    `Users: ${result.userIds.join(", ")}

` +
                    `Merged with existing logs (nothing deleted). Safe across extension updates.`
                );
            } catch (e: any) {
                logger.error("Failed to import logs", e);
                alert(`Import failed: ${e?.message ?? String(e)}`);
            } finally {
                setImporting(false);
            }
        };
        input.click();
    };

    const deleteAllLogs = async () => {
        if (!filterUserId) return;
        try {
            await deleteUserLogs(filterUserId);
            await loadPresenceLogs();
            setLogs([]);
        } catch (e) {
            logger.error("Failed to delete logs", e);
        }
    };

    const clearAllSnapshots = async () => {
        try {
            await clearProfileSnapshots();
            logger.log("Successfully cleared all profile snapshots.");
        } catch (e) {
            logger.error("Failed to clear profile snapshots", e);
        }
    };

    const confirmDeleteLogs = () => {
        openModal(props => (
            <ConfirmDeleteModal modalProps={props} onConfirm={deleteAllLogs} />
        ));
    };

    const confirmClearSnapshots = () => {
        openModal(props => (
            <ConfirmClearSnapshotsModal modalProps={props} onConfirm={clearAllSnapshots} />
        ));
    };

    const showDebugTools = isDebugEnabled();
    const activeSection = SECTIONS.find(s => s.id === selectedSection)!;

    const emptyHint = totalLoadedForScope > 0
        ? "Nothing for this day — use ← Previous day to browse older logs."
        : "Activity will appear here as it is recorded.";

    const renderLogList = (items: PresenceLogEntry[], emptyMessage: string, renderExtra?: (entry: PresenceLogEntry) => React.ReactNode) => {
        if (!items.length) return <EmptyState message={emptyMessage} hint={emptyHint} />;

        return (
            <ScrollerThin className="stalker-log-list">
                {items.map(entry => (
                    <div
                        key={`${entry.userId}-${entry.timestamp}-${selectedSection}`}
                        className={`stalker-log-entry${entry.potentiallyInvisible ? " stalker-log-entry--suspicious" : ""}`}
                    >
                        <div className="stalker-log-entry__header">
                            <div className="stalker-log-entry__identity">
                                <UserAvatar
                                    userId={entry.userId}
                                    username={entry.username}
                                    screenshotMode={screenshotMode}
                                    redactMode={redactMode}
                                />
                                <div className="stalker-log-entry__identity-text">
                                    <Text variant="text-md/semibold" className="stalker-log-entry__header-name">
                                        <IdentityName
                                            text={redactDisplayName(entry.username, redactMode, screenshotMode)}
                                            screenshotMode={screenshotMode}
                                            redactMode={redactMode}
                                        />
                                    </Text>
                                    <span className="stalker-log-entry__time">{formatTimestamp(entry.timestamp)}</span>
                                </div>
                            </div>
                            <div className="stalker-log-entry__header-right">
                                {entry.potentiallyInvisible && (
                                    <Tooltip text="Went Online → Offline on mobile without Idle. Discord mobile normally idles first when AFK — this often means they set Invisible.">
                                        {tooltipProps => (
                                            <span {...tooltipProps} className="stalker-invisible-badge">
                                                <WarningIcon />
                                                Potentially invisible
                                            </span>
                                        )}
                                    </Tooltip>
                                )}
                                {selectedSection === "presence" || selectedSection === "rich"
                                    ? renderPresenceStatuses(entry)
                                    : selectedSection === "profile"
                                        ? renderProfileChangeBadges(entry)
                                        : null}
                            </div>
                        </div>

                        {entry.potentiallyInvisible && (
                            <div className="stalker-invisible-banner">
                                <WarningIcon size={14} />
                                <div>
                                    <span className="stalker-invisible-banner__text">Potentially invisible</span>
                                    <span className="stalker-invisible-banner__hint">
                                        Mobile jumped Online → Offline without Idle. Custom Idle/DND are ignored for this check.
                                    </span>
                                </div>
                            </div>
                        )}

                        {selectedSection === "messages" && (() => {
                            const guild = entry.guildId ? GuildStore.getGuild(entry.guildId) : null;
                            const guildIcon = guild?.icon
                                ? `https://cdn.discordapp.com/icons/${entry.guildId}/${guild.icon}.png?size=32`
                                : null;
                            const channelName = entry.channelName ?? entry.channelId;
                            const jumpLink = entry.guildId && entry.channelId && entry.messageId
                                ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
                                : null;

                            return (
                                <>
                                    <div className="stalker-message-context">
                                        {guildIcon ? (
                                            <img src={guildIcon} alt="" className="stalker-message-context__icon" />
                                        ) : (
                                            <div className="stalker-message-context__icon stalker-message-context__icon--fallback">
                                                {entry.guildName?.charAt(0) ?? "?"}
                                            </div>
                                        )}
                                        <div className="stalker-message-context__meta">
                                            <Text variant="text-sm/semibold">{entry.guildName ?? "Unknown Server"}</Text>
                                            {channelName && (
                                                <Text variant="text-xs/normal" color="header-secondary">#{channelName}</Text>
                                            )}
                                        </div>
                                        {jumpLink && (
                                            <Button size="small" variant="primary" className="stalker-message-context__jump" onClick={() => NavigationRouter.transitionTo(jumpLink)}>
                                                Jump
                                            </Button>
                                        )}
                                    </div>
                                    {(entry as any).messageContent && (
                                        <div className="stalker-message-content">
                                            {(entry as any).messageContent}
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        <div className="stalker-log-entry__meta">
                            {selectedSection === "presence" && getPresenceDurationChips(entry).map(chip => {
                                const label = getDurationLabel(chip.durationMs);
                                if (!label) return null;
                                const plat = chip.device ? getPlatformLabel(chip.device) : null;
                                // e.g. "Mobile Online 2h 14m" or "Desktop DND 12m · ongoing"
                                const text = plat
                                    ? `${plat} ${getStatusLabel(chip.status)} ${label}`
                                    : `${getStatusLabel(chip.status)} ${label}`;
                                return (
                                    <span
                                        key={chip.key}
                                        className={`stalker-meta-chip ${chipClassForStatus(chip.status)}${chip.ongoing ? " stalker-meta-chip--ongoing" : ""}`}
                                        title={chip.ongoing
                                            ? "Still active on this platform at this time"
                                            : "How long that status lasted on this platform"}
                                    >
                                        {text}{chip.ongoing ? " · ongoing" : ""}
                                    </span>
                                );
                            })}
                            {selectedSection === "rich" && renderPresenceActivitySummary(entry, userLogsMap.get(entry.userId) || [])}
                            {selectedSection !== "messages" && renderDeviceBadges(entry)}
                            {renderExtra?.(entry)}
                        </div>
                    </div>
                ))}
            </ScrollerThin>
        );
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} className={`${cl("root")} stalker-history-root ${uiModeClass}`}>
            <div className="stalker-islands-shell">
                {/* Header island */}
                <header className="stalker-island stalker-island--header">
                    <div className="stalker-modal-title-block">
                        <Text variant="heading-lg/semibold" className="stalker-modal-title">
                            Activity Tracker
                        </Text>
                        <Text variant="text-sm/normal" className="stalker-modal-subtitle">
                            {loading
                                ? "Loading logs…"
                                : filterUserId
                                    ? `${totalChanges} today · ${totalLoadedForScope} total · ${screenshotMode ? redactTag(filterUsername, redactMode, true) : filterUsername}`
                                    : `${totalChanges} today · ${totalLoadedForScope} total · all tracked users`}
                        </Text>
                    </div>
                    <div className="stalker-modal-head-actions">
                        <Tooltip text={mainView === "insights" ? "Back to activity log" : "Day timeline & stats"}>
                            {tooltipProps => (
                                <button
                                    {...tooltipProps}
                                    type="button"
                                    className={`stalker-icon-btn stalker-insights-toggle${mainView === "insights" ? " stalker-insights-toggle--on" : ""}`}
                                    onClick={() => setMainView(v => (v === "insights" ? "logs" : "insights"))}
                                    aria-pressed={mainView === "insights"}
                                    aria-label="Day timeline and stats"
                                >
                                    {/* Chart / timeline icon */}
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3 3h2v18H3V3zm4 10h2v8H7v-8zm4-6h2v14h-2V7zm4 3h2v11h-2V10zm4-5h2v16h-2V5z" />
                                    </svg>
                                </button>
                            )}
                        </Tooltip>
                        <div className="stalker-ss-controls">
                            <Tooltip text={screenshotMode ? "Screenshot mode on — identities hidden" : "Screenshot mode — hide PFPs & names"}>
                                {tooltipProps => (
                                    <button
                                        {...tooltipProps}
                                        type="button"
                                        className={`stalker-icon-btn stalker-ss-toggle${screenshotMode ? " stalker-ss-toggle--on" : ""}`}
                                        onClick={() => {
                                            setScreenshotMode(v => !v);
                                            if (!screenshotMode) setShowSsMenu(true);
                                            else setShowSsMenu(false);
                                        }}
                                        aria-pressed={screenshotMode}
                                        aria-label="Screenshot mode"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M20 5h-3.2l-1.2-1.6c-.3-.4-.8-.4-1.2-.4H9.6c-.4 0-.9.1-1.2.4L7.2 5H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 13H4V7h4.1l1.5-2h5l1.4 2H20v11zM12 8c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
                                        </svg>
                                    </button>
                                )}
                            </Tooltip>
                            {screenshotMode && (
                                <div className="stalker-ss-mode-wrap">
                                    <button
                                        type="button"
                                        className="stalker-ss-mode-btn"
                                        onClick={() => setShowSsMenu(v => !v)}
                                    >
                                        {REDACT_MODES.find(m => m.id === redactMode)?.label ?? "Redact"}
                                        <span className="stalker-ss-mode-caret">▾</span>
                                    </button>
                                    {showSsMenu && (
                                        <div className="stalker-ss-mode-menu" role="menu">
                                            {REDACT_MODES.map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    role="menuitemradio"
                                                    aria-checked={redactMode === m.id}
                                                    className={`stalker-ss-mode-item${redactMode === m.id ? " stalker-ss-mode-item--active" : ""}`}
                                                    onClick={() => {
                                                        setRedactModePersist(m.id);
                                                        setShowSsMenu(false);
                                                    }}
                                                >
                                                    <span className="stalker-ss-mode-item__label">{m.label}</span>
                                                    <span className="stalker-ss-mode-item__hint">{m.hint}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {filterUserId && (
                            <Tooltip text="User Settings">
                                {tooltipProps => (
                                    <button
                                        {...tooltipProps}
                                        className="stalker-icon-btn"
                                        onClick={() => openUserStalkerSettings(filterUserId, UserStore, {
                                            screenshotMode,
                                            redactMode,
                                        })}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                        </svg>
                                    </button>
                                )}
                            </Tooltip>
                        )}
                        <ModalCloseButton onClick={modalProps.onClose} />
                    </div>
                </header>

                {/* Body: sidebar island + main island on shared backdrop */}
                <div className="stalker-islands-body">
                    <aside className="stalker-island stalker-island--sidebar">
                        {filterUserId && filterUser && (
                            <CosmeticsUserIsland
                                userId={filterUserId}
                                screenshotMode={screenshotMode}
                                displayName={
                                    <Text variant="text-sm/semibold" className="stalker-sidebar-user__name">
                                        <IdentityName
                                            text={redactDisplayName(
                                                (filterUser as any).globalName || (filterUser as any).global_name || filterUser.username,
                                                redactMode,
                                                screenshotMode
                                            )}
                                            screenshotMode={screenshotMode}
                                            redactMode={redactMode}
                                        />
                                    </Text>
                                }
                                tag={
                                    <Text variant="text-xs/normal" className="stalker-sidebar-user__tag">
                                        <IdentityName
                                            text={redactTag(filterUser.username, redactMode, screenshotMode)}
                                            screenshotMode={screenshotMode}
                                            redactMode={redactMode}
                                        />
                                    </Text>
                                }
                            >
                                <LivePlatformStrip userId={filterUserId} />
                            </CosmeticsUserIsland>
                        )}

                        <nav className="stalker-sidebar-nav">
                            {SECTIONS.map(section => {
                                const Icon = section.icon;
                                const count = sectionCounts[section.id];
                                const active = selectedSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        className={`stalker-sidebar-item${active ? " stalker-sidebar-item--active" : ""}`}
                                        onClick={() => setSelectedSection(section.id)}
                                    >
                                        <span className="stalker-sidebar-item__icon"><Icon /></span>
                                        <span className="stalker-sidebar-item__content">
                                            <span className="stalker-sidebar-item__label">{section.label}</span>
                                            <span className="stalker-sidebar-item__desc">{section.description}</span>
                                        </span>
                                        <span className={`stalker-sidebar-item__count${count > 0 ? " stalker-sidebar-item__count--has" : ""}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="stalker-sidebar-actions">
                            {canOpenNativeLogs && (
                                <Button size="small" variant="primary" onClick={openLogs}>
                                    {filterUserId ? "Open Logs" : "Open Logs Folder"}
                                </Button>
                            )}
                            {logs.length > 0 && (
                                <Button size="small" variant="secondary" onClick={exportLogs}>
                                    Export
                                </Button>
                            )}
                            {filterUserId && (
                                <Button size="small" variant="dangerPrimary" onClick={confirmDeleteLogs}>
                                    Delete Logs
                                </Button>
                            )}
                            {!filterUserId && (
                                <Button size="small" variant="dangerPrimary" onClick={confirmClearSnapshots}>
                                    Clear Snapshots
                                </Button>
                            )}
                            {showDebugTools && (
                                <Button
                                    size="small"
                                    variant="secondary"
                                    onClick={() => openSnapshotsModal(filterUserId ?? undefined)}
                                >
                                    {filterUserId ? "Snapshot" : "Snapshots"}
                                </Button>
                            )}
                        </div>
                    </aside>

                    <div className="stalker-island stalker-island--main">
                        <div className="stalker-main-toolbar">
                            <div className="stalker-main-toolbar__title">
                                <Text variant="heading-md/semibold">
                                    {mainView === "insights" ? "Timeline & Stats" : activeSection.label}
                                </Text>
                                <Text variant="text-sm/normal" className="stalker-main-toolbar__desc">
                                    {mainView === "insights"
                                        ? "Day overview — when they were Online / Idle / DND per platform"
                                        : activeSection.description}
                                </Text>
                            </div>

                            <div className="stalker-day-nav">
                                <Button size="small" variant="secondary" onClick={showPrevDay} className="stalker-day-nav__btn">
                                    ←
                                </Button>
                                <div className="stalker-day-nav__label">
                                    <Text variant="text-sm/semibold">{isToday ? "Today" : dayLabel}</Text>
                                    {!isToday && (
                                        <button type="button" className="stalker-day-nav__today" onClick={() => setDayOffset(0)}>
                                            Jump to today
                                        </button>
                                    )}
                                </div>
                                <Button size="small" variant="secondary" onClick={showNextDay} disabled={isToday} className="stalker-day-nav__btn">
                                    →
                                </Button>
                            </div>
                        </div>

                        {mainView === "logs" && selectedSection === "presence" && (
                            <div className="stalker-platform-filters">
                                {(["all", "desktop", "mobile", "web"] as const).map(p => {
                                    const Icon = p === "all" ? null : DeviceIcons[p];
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`stalker-platform-chip${platformFilter === p ? " stalker-platform-chip--active" : ""}`}
                                            onClick={() => setPlatformFilter(p)}
                                        >
                                            {Icon && <span className="stalker-platform-chip__icon"><Icon /></span>}
                                            {p.charAt(0).toUpperCase() + p.slice(1)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="stalker-main-body">
                            {loading ? (
                                <div className="stalker-empty-state">
                                    <Text variant="text-md/medium">Loading logs…</Text>
                                </div>
                            ) : mainView === "insights" ? (
                                <ActivityInsightsPanel
                                    userId={filterUserId}
                                    dayLogs={logsForDay.filter(forUser)}
                                    dayStart={dayRange.start}
                                    dayEnd={dayRange.end}
                                    dayLabel={dayLabel}
                                    screenshotMode={screenshotMode}
                                    redactMode={redactMode}
                                />
                            ) : (
                                <>
                                    {selectedSection === "presence" && renderLogList(filteredPresenceItems, "No presence updates for this day.")}
                                    {selectedSection === "profile" && renderLogList(profileItems, "No profile updates for this day.")}
                                    {selectedSection === "messages" && renderLogList(messageItems, "No messages recorded for this day.")}
                                    {selectedSection === "rich" && renderLogList(richActivityItems, "No rich presence updates for this day.")}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ModalRoot>
    );
}

export function openPresenceHistoryModal(targetUserId?: string) {
    openModal(modalProps => (
        <PresenceHistoryPanel modalProps={modalProps} initialUserId={targetUserId} />
    ));
}
