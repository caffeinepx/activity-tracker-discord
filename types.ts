


export type PresenceStatus = "online" | "idle" | "dnd" | "offline" | "invisible" | string;

export interface ProfileSnapshot {
    username?: string;
    avatar?: string | null;
    discriminator?: string;
    global_name?: string | null;
    bio?: string | null;
    banner?: string | null;
    banner_color?: string | null;
    avatarDecoration?: string | null;
    avatarDecorationData?: { asset: string; skuId: string; } | null;
    connected_accounts?: Array<{ type: string; name: string; verified: boolean; }>;
    pronouns?: string | null;
    theme_colors?: [number, number] | null;
    emoji?: any | null;
    customStatus?: string | null;
}

export interface ProfileChanges {
    changedFields: string[];
    before: ProfileSnapshot;
    after: ProfileSnapshot;
}

/** One platform's status flip (e.g. mobile Online → Idle). */
export interface PlatformStatusChange {
    device: string;
    previousStatus: string;
    currentStatus: string;
    /** How long the previous status lasted on this device, if known */
    previousDurationMs?: number;
}

/** Duration chip for a platform segment (e.g. Mobile was Online 2h). */
export interface PlatformDuration {
    device: string;
    /** Status the duration applies to (usually the status that just ended, or ongoing) */
    status: string;
    durationMs: number;
    /** True when this segment is still active at log time */
    ongoing?: boolean;
}

export interface PresenceLogEntry {
    userId: string;
    username: string;
    discriminator?: string;
    timestamp: number;
    previousStatus?: PresenceStatus | null;
    currentStatus: PresenceStatus | null;
    guildId?: string;
    clientStatus?: Record<string, string>;
    /** Snapshot of client statuses before this event (when available) */
    previousClientStatus?: Record<string, string>;
    activitySummary?: string;
    clientStatusSummary?: string;
    guildName?: string | null;
    type?: "presence" | "profile" | "message" | "typing";
    profileChanges?: ProfileChanges;
    offlineDuration?: number;
    onlineDuration?: number;
    activities?: any[];
    channelId?: string;
    channelName?: string;
    messageContent?: string;
    messageId?: string;
    deviceTimings?: Array<{ device: string; status: string; start: number; end?: number | null }>;
    deviceChange?: boolean;
    activityChange?: boolean;
    /** Per-platform status transitions for this event */
    platformChanges?: PlatformStatusChange[];
    /** Per-platform duration chips (prefer these over overall onlineDuration) */
    platformDurations?: PlatformDuration[];
    /**
     * True when the user went straight from Online → Offline on mobile
     * (skipping Idle). Mobile Discord normally idles first when AFK,
     * so a direct online→offline transition often means they set Invisible.
     * Idle/DND custom statuses are excluded from this heuristic.
     */
    potentiallyInvisible?: boolean;
}


export interface UserStalkerConfig {
    userId: string;
    logPresenceChanges: boolean;
    logProfileChanges: boolean;
    logMessages: boolean;
    notifyPresenceChanges: boolean;
    notifyProfileChanges: boolean;
    notifyMessages: boolean;
    notifyTyping: boolean;
    typingConversationWindow?: number;
    serverFilterMode: "all" | "whitelist" | "blacklist";
    serverList: string[];
    notifyOnline?: boolean;
    notifyOffline?: boolean;
    notifyIdle?: boolean;
    notifyDnd?: boolean;
    /** Notify when a mobile online→offline jump suggests Invisible (default true) */
    notifyPotentiallyInvisible?: boolean;
    notifyUsername?: boolean;
    notifyAvatar?: boolean;
    notifyBanner?: boolean;
    notifyBio?: boolean;
    notifyPronouns?: boolean;
    notifyGlobalName?: boolean;
}

