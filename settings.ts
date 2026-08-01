


import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const DEFAULT_HISTORY_RETENTION_DAYS = 14;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ScreenshotRedactMode = "redact" | "blur" | "blackout";

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

