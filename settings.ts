


import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const DEFAULT_HISTORY_RETENTION_DAYS = 14;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ScreenshotRedactMode = "redact" | "blur" | "blackout";

/**
 * UI presentation mode:
 * - custom: Full custom island UI + plugin palette (default)
 * - customThemed: Same layout/chrome, colors follow Discord/client theme
 * - native: Flat Discord-native modal (no custom islands/mica)
 */
export type UiMode = "custom" | "customThemed" | "native";

export const settings = definePluginSettings({
    whitelistedIds: {
        default: "",
        type: OptionType.STRING,
        description: "Whitelisted user IDs to stalk"
    },
    historyRetentionDays: {
        default: DEFAULT_HISTORY_RETENTION_DAYS,
        type: OptionType.NUMBER,
        description: "How many days of presence history to retain (0 to keep everything)"
    },
    screenshotRedactMode: {
        default: "redact" as ScreenshotRedactMode,
        type: OptionType.SELECT,
        description: "How identities are hidden when Screenshot Mode is on in Activity History",
        options: [
            { label: "Redact (default avatar + @user)", value: "redact", default: true },
            { label: "Blur", value: "blur" },
            { label: "Black out", value: "blackout" },
        ]
    },
    uiMode: {
        default: "custom" as UiMode,
        type: OptionType.SELECT,
        description: "History / settings UI style",
        options: [
            {
                label: "Full custom UI (plugin colors)",
                value: "custom",
                default: true,
            },
            {
                label: "Custom UI + theme colors",
                value: "customThemed",
            },
            {
                label: "Full theme compatibility (Discord-native UI)",
                value: "native",
            },
        ]
    },
    showToolbarIcon: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Show Activity History eye button in the channel toolbar (next to call / pin / etc.)"
    },
    toolbarOnlyTrackedUsers: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Only show the toolbar button in DMs with tracked users (otherwise show on all channels)"
    },
    debug: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Enable debug logging"
    }
});

export function getScreenshotRedactMode(): ScreenshotRedactMode {
    const mode = settings.store.screenshotRedactMode as ScreenshotRedactMode;
    // Migrate removed "pixelate" option
    if (mode === "blur" || mode === "blackout" || mode === "redact") return mode;
    return "redact";
}

export function getWhitelistedIds(): string[] {
    return settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
}

export function getRetentionDays() {
    const value = settings.store.historyRetentionDays;
    if (Number.isNaN(value)) return DEFAULT_HISTORY_RETENTION_DAYS;
    return Math.max(0, value);
}

export function getRetentionCutoffMs() {
    const days = getRetentionDays();
    if (!days) return 0;
    return Date.now() - days * MS_PER_DAY;
}

export function isDebugEnabled() {
    return settings.store.debug;
}

export function getUiMode(): UiMode {
    const mode = settings.store.uiMode as UiMode;
    if (mode === "customThemed" || mode === "native" || mode === "custom") return mode;
    return "custom";
}

/** CSS class applied to history/settings modal roots */
export function getUiModeClass(mode?: UiMode): string {
    switch (mode ?? getUiMode()) {
        case "customThemed":
            return "stalker-ui-custom-themed";
        case "native":
            return "stalker-ui-native";
        default:
            return "stalker-ui-custom";
    }
}

