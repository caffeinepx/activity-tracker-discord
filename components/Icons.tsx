
import type { SVGProps } from "react";
import { Tooltip } from "@webpack/common";
import { formatTimestamp, getPlatformLabel } from "../utils";

function makeDeviceIcon(path: string, opts?: { viewBox?: string; width?: number; height?: number; }) {
    return () => (
        <svg
            viewBox={opts?.viewBox ?? "0 0 24 24"}
            width={opts?.width ?? 20}
            height={opts?.height ?? 20}
            fill="currentColor"
        >
            <path d={path} />
        </svg>
    );
}

const consoleIcon = makeDeviceIcon("M14.8 2.7 9 3.1V47h3.3c1.7 0 6.2.3 10 .7l6.7.6V2l-4.2.2c-2.4.1-6.9.3-10 .5zm1.8 6.4c1 1.7-1.3 3.6-2.7 2.2C12.7 10.1 13.5 8 15 8c.5 0 1.2.5 1.6 1.1zM16 33c0 6-.4 10-1 10s-1-4-1-10 .4-10 1-10 1 4 1 10zm15-8v23.3l3.8-.7c2-.3 4.7-.6 6-.6H43V3h-2.2c-1.3 0-4-.3-6-.6L31 1.7V25z", { viewBox: "0 0 50 50" });
/** Simple VR headset glyph */
const vrIcon = makeDeviceIcon("M20.5 7h-17C2.67 7 2 7.67 2 8.5v7C2 16.33 2.67 17 3.5 17H8l1.5 2h5L16 17h4.5c.83 0 1.5-.67 1.5-1.5v-7C22 7.67 21.33 7 20.5 7zM7.5 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z");

export const DeviceIcons = {
    desktop: makeDeviceIcon("M4 2.5c-1.103 0-2 .897-2 2v11c0 1.104.897 2 2 2h7v2H7v2h10v-2h-4v-2h7c1.103 0 2-.896 2-2v-11c0-1.103-.897-2-2-2H4Zm16 2v9H4v-9h16Z"),
    web: makeDeviceIcon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z"),
    mobile: makeDeviceIcon("M 187 0 L 813 0 C 916.277 0 1000 83.723 1000 187 L 1000 1313 C 1000 1416.277 916.277 1500 813 1500 L 187 1500 C 83.723 1500 0 1416.277 0 1313 L 0 187 C 0 83.723 83.723 0 187 0 Z M 125 1000 L 875 1000 L 875 250 L 125 250 Z M 500 1125 C 430.964 1125 375 1180.964 375 1250 C 375 1319.036 430.964 1375 500 1375 C 569.036 1375 625 1319.036 625 1250 C 625 1180.964 569.036 1125 500 1125 Z", { viewBox: "0 0 1000 1500", width: 17, height: 17 }),
    embedded: consoleIcon,
    console: consoleIcon,
    vr: vrIcon,
};

export function StalkerIcon() {
    return (
        <svg
            stroke="currentColor"
            fill="none"
            strokeWidth="0"
            viewBox="0 0 15 15"
            height={24}
            width={24}
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="currentColor"
                d="M3 2.5C3 2.22386 3.22386 2 3.5 2H9.08579C9.21839 2 9.34557 2.05268 9.43934 2.14645L11.8536 4.56066C11.9473 4.65443 12 4.78161 12 4.91421V12.5C12 12.7761 11.7761 13 11.5 13H3.5C3.22386 13 3 12.7761 3 12.5V2.5ZM3.5 1C2.67157 1 2 1.67157 2 2.5V12.5C2 13.3284 2.67157 14 3.5 14H11.5C12.3284 14 13 13.3284 13 12.5V4.91421C13 4.51639 12.842 4.13486 12.5607 3.85355L10.1464 1.43934C9.86514 1.15804 9.48361 1 9.08579 1H3.5ZM4.5 4C4.22386 4 4 4.22386 4 4.5C4 4.77614 4.22386 5 4.5 5H7.5C7.77614 5 8 4.77614 8 4.5C8 4.22386 7.77614 4 7.5 4H4.5ZM4.5 7C4.22386 7 4 7.22386 4 7.5C4 7.77614 4.22386 8 4.5 8H10.5C10.7761 8 11 7.77614 11 7.5C11 7.22386 10.7761 7 10.5 7H4.5ZM4.5 10C4.22386 10 4 10.2239 4 10.5C4 10.7761 4.22386 11 4.5 11H10.5C10.7761 11 11 10.7761 11 10.5C11 10.2239 10.7761 10 10.5 10H4.5Z"
            />
        </svg>
    );
}

/** Compact history / logs icon for profile action buttons */
export function HistoryIcon({ size = 20, width, height }: { size?: number; width?: number; height?: number; }) {
    const w = width ?? size;
    const h = height ?? size;
    return (
        <svg width={w} height={h} viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
        </svg>
    );
}

/**
 * Discord-compatible icon props (HeaderBarIcon / context menus pass these).
 * Color comes from CSS (e.g. .clickable .icon { color: var(--icon-muted) })
 * when color is "currentColor", or from the color prop when set explicitly.
 */
type DiscordIconProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
    color?: string;
    colorClass?: string;
    foreground?: unknown;
    background?: unknown;
};

/** Eye icon — toolbar (global history) + "Track User" context menu */
export function EyeIcon({
    width = 24,
    height = 24,
    color = "currentColor",
    className,
    colorClass,
    size: _size,
    foreground: _fg,
    background: _bg,
    ...rest
}: DiscordIconProps) {
    return (
        <svg
            aria-hidden
            role="img"
            width={width}
            height={height}
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            {...rest}
        >
            <path fill={color} className={colorClass} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path
                fill={color}
                className={colorClass}
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z"
            />
        </svg>
    );
}

/**
 * Per-user eye icon — used in toolbar when viewing a tracked user's DM.
 * Same tokens/color as EyeIcon; design differs (eye + person mark) so it's
 * clear the click opens that user's history, not the combined log.
 */
export function EyeUserIcon({
    width = 24,
    height = 24,
    color = "currentColor",
    className,
    colorClass,
    size: _size,
    foreground: _fg,
    background: _bg,
    ...rest
}: DiscordIconProps) {
    return (
        <svg
            aria-hidden
            role="img"
            width={width}
            height={height}
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            {...rest}
        >
            {/* Eye (slightly shifted left/up to make room for the user mark) */}
            <path
                fill={color}
                className={colorClass}
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.2 9.9C2.55 6.15 6.1 3.5 10.2 3.5c4.05 0 7.55 2.6 8.95 6.3.1.3.1.62 0 .92-1.4 3.7-4.9 6.3-8.95 6.3-4.1 0-7.65-2.65-9-6.4a1.4 1.4 0 0 1 0-.92ZM14.4 10.35a4.2 4.2 0 1 1-8.4 0 4.2 4.2 0 0 1 8.4 0Z"
            />
            <circle fill={color} className={colorClass} cx="10.2" cy="10.35" r="2.15" />
            {/* Person mark (bottom-right) — design-only differentiator */}
            <circle fill={color} className={colorClass} cx="17.6" cy="15.2" r="2.05" />
            <path
                fill={color}
                className={colorClass}
                d="M13.4 21.2c0-2.25 1.9-4.05 4.2-4.05s4.2 1.8 4.2 4.05v.3H13.4v-.3Z"
            />
        </svg>
    );
}

/** Eye-off icon — "Stop Tracking" context menu */
export function EyeOffIcon({
    width = 24,
    height = 24,
    color = "currentColor",
    className,
    colorClass,
    size: _size,
    foreground: _fg,
    background: _bg,
    ...rest
}: DiscordIconProps) {
    return (
        <svg
            aria-hidden
            role="img"
            width={width}
            height={height}
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            {...rest}
        >
            <path fill={color} className={colorClass} d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.217 11.217 0 0 1 4.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113Z" />
            <path fill={color} className={colorClass} d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0 1 15.75 12ZM12.53 15.713l-4.243-4.244a3.75 3.75 0 0 0 4.244 4.243Z" />
            <path fill={color} className={colorClass} d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 0 0-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 0 1 6.75 12Z" />
        </svg>
    );
}

/** Clock/history icon for context menu "Presence History" */
export function CtxHistoryIcon({ width = 18, height = 18 }: { width?: number; height?: number; }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={width} height={height} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

export function PresenceIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" />
        </svg>
    );
}

export function ProfileIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
    );
}

export function MessageIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
        </svg>
    );
}

export function ActivityIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.58 16.09l-1.09-7.66A3.996 3.996 0 0 0 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
        </svg>
    );
}

export function WarningIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
        </svg>
    );
}

export function BellIcon({ enabled, onClick }: { enabled: boolean; onClick: () => void; }) {
    return (
        <Tooltip text={enabled ? "Notifications enabled" : "Notifications disabled"}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    onClick={onClick}
                    className="stalker-icon-btn"
                    style={{
                        color: enabled ? "var(--status-positive)" : "var(--interactive-muted)",
                    }}
                >
                    {enabled ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z" />
                        </svg>
                    )}
                </button>
            )}
        </Tooltip>
    );
}

const STATUS_META: Record<string, { bg: string; color: string; label: string; ring: string }> = {
    online: { bg: "#23a559", color: "#fff", label: "Online", ring: "rgba(35, 165, 89, 0.45)" },
    idle: { bg: "#f0b232", color: "#1e1e1e", label: "Idle", ring: "rgba(240, 178, 50, 0.45)" },
    dnd: { bg: "#f23f42", color: "#fff", label: "Do Not Disturb", ring: "rgba(242, 63, 66, 0.45)" },
    offline: { bg: "#80848e", color: "#fff", label: "Offline", ring: "rgba(128, 132, 142, 0.25)" },
    invisible: { bg: "#80848e", color: "#fff", label: "Invisible", ring: "rgba(128, 132, 142, 0.25)" },
};

function statusMeta(status?: string | null) {
    const key = (status ?? "offline").toLowerCase();
    return STATUS_META[key] ?? STATUS_META.offline;
}

const ALL_PLATFORMS = ["desktop", "mobile", "web", "embedded", "vr"] as const;

export function DeviceBadges({
    clientStatus,
    deviceTimings,
    entryTimestamp,
    showAll = false,
}: {
    clientStatus?: Record<string, string>;
    deviceTimings?: Array<{ device: string; status: string; start: number; end?: number | null }>;
    entryTimestamp?: number;
    /** When true, always render desktop/mobile/web so offline platforms are visible */
    showAll?: boolean;
}) {
    if (deviceTimings && deviceTimings.length > 0) {
        // Keep the latest segment per device (ongoing or most recently ended)
        const deviceMap = new Map<string, typeof deviceTimings[number]>();
        for (const timing of deviceTimings) {
            const prev = deviceMap.get(timing.device);
            if (!prev || (timing.start ?? 0) >= (prev.start ?? 0)) {
                deviceMap.set(timing.device, timing);
            }
        }

        const devices = showAll
            ? ALL_PLATFORMS.map(d => deviceMap.get(d) ?? { device: d, status: "offline", start: 0, end: null as number | null })
            : Array.from(deviceMap.values());

        return (
            <div className="stalker-device-badges">
                {devices.map(timing => {
                    const Icon = DeviceIcons[timing.device as keyof typeof DeviceIcons] ?? DeviceIcons.desktop;
                    const isChanging = entryTimestamp !== undefined && (timing.start === entryTimestamp || timing.end === entryTimestamp);
                    const offline = !timing.status || timing.status === "offline" || timing.status === "invisible";
                    const meta = statusMeta(timing.status);
                    // Ongoing = still active on this platform (segment has no end)
                    const isOngoing = !offline && timing.end == null;
                    const startedStr = timing.start ? formatTimestamp(timing.start) : "—";
                    const stoppedStr = timing.end ? formatTimestamp(timing.end) : offline ? "—" : "Ongoing";
                    const tooltipText = `${getPlatformLabel(timing.device)} · ${meta.label}\nStarted: ${startedStr}\nStopped: ${stoppedStr}`;

                    return (
                        <Tooltip key={`${timing.device}-${timing.start}`} text={tooltipText}>
                            {tooltipProps => (
                                <span
                                    {...tooltipProps}
                                    className={[
                                        "stalker-device-badge",
                                        `stalker-device-badge--${(timing.status ?? "offline").toLowerCase()}`,
                                        offline ? "stalker-device-badge--offline" : "stalker-device-badge--online",
                                        isChanging ? "stalker-device-badge--changing" : "",
                                        isOngoing ? "stalker-device-badge--ongoing" : "",
                                        !isOngoing && !offline ? "stalker-device-badge--stopped" : "",
                                    ].filter(Boolean).join(" ")}
                                    style={{
                                        backgroundColor: offline ? "var(--background-modifier-accent, #4e5058)" : meta.bg,
                                        color: offline ? "var(--text-muted, #b5bac1)" : meta.color,
                                        boxShadow: isChanging && !offline ? `0 0 0 2px ${meta.ring}` : undefined,
                                        opacity: !offline && !isOngoing ? 0.7 : undefined,
                                    }}
                                    data-status={timing.status ?? "offline"}
                                    data-device={timing.device}
                                    data-ongoing={isOngoing ? "true" : "false"}
                                >
                                    <Icon />
                                    {/* Status-colored dot under icon = this platform is still ongoing */}
                                    {isOngoing && (
                                        <span
                                            className="stalker-device-badge__dot"
                                            style={{ backgroundColor: meta.bg }}
                                            aria-hidden
                                        />
                                    )}
                                </span>
                            )}
                        </Tooltip>
                    );
                })}
            </div>
        );
    }

    if (!clientStatus && !showAll) return null;

    const statusMap = clientStatus ?? {};
    const devices = showAll
        ? ALL_PLATFORMS.map(d => [d, statusMap[d] ?? "offline"] as const)
        : Object.entries(statusMap).filter(([, status]) => status && status !== "offline");

    if (!devices.length) return null;

    return (
        <div className="stalker-device-badges">
            {devices.map(([device, status]) => {
                const Icon = DeviceIcons[device as keyof typeof DeviceIcons] ?? DeviceIcons.desktop;
                const offline = !status || status === "offline" || status === "invisible";
                const meta = statusMeta(status);
                const isOngoing = !offline;
                return (
                    <Tooltip key={`${device}-${status}`} text={`${getPlatformLabel(device)} · ${meta.label}`}>
                        {tooltipProps => (
                            <span
                                {...tooltipProps}
                                className={[
                                    "stalker-device-badge",
                                    `stalker-device-badge--${(status ?? "offline").toLowerCase()}`,
                                    offline ? "stalker-device-badge--offline" : "stalker-device-badge--online",
                                    isOngoing ? "stalker-device-badge--ongoing" : "",
                                ].filter(Boolean).join(" ")}
                                style={{
                                    backgroundColor: offline ? "var(--background-modifier-accent, #4e5058)" : meta.bg,
                                    color: offline ? "var(--text-muted, #b5bac1)" : meta.color,
                                }}
                                data-status={status ?? "offline"}
                                data-device={device}
                                data-ongoing={isOngoing ? "true" : "false"}
                            >
                                <Icon />
                                {isOngoing && (
                                    <span
                                        className="stalker-device-badge__dot"
                                        style={{ backgroundColor: meta.bg }}
                                        aria-hidden
                                    />
                                )}
                            </span>
                        )}
                    </Tooltip>
                );
            })}
        </div>
    );
}

/** Live platform presence row for profile overview cards */
export function PlatformPresenceRow({ clientStatus, overallStatus }: { clientStatus?: Record<string, string>; overallStatus?: string | null }) {
    const overall = statusMeta(overallStatus);
    return (
        <div className="stalker-platform-presence">
            <div className="stalker-platform-presence__overall">
                <span
                    className="stalker-platform-presence__dot"
                    style={{ backgroundColor: overall.bg, boxShadow: `0 0 0 3px ${overall.ring}` }}
                />
                <span className="stalker-platform-presence__label">{overall.label}</span>
            </div>
            <DeviceBadges clientStatus={clientStatus} showAll />
        </div>
    );
}
