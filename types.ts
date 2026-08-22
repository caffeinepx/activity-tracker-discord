


export type PresenceStatus = "online" | "idle" | "dnd" | "offline" | "invisible" | string;

/** Equipped avatar decoration (Discord shop collectible). */
export interface AvatarDecorationData {
    asset: string;
    skuId?: string;
    sku_id?: string;
    expires_at?: number | null;
}

/** Equipped nameplate collectible. */
export interface NameplateData {
    asset?: string;
    skuId?: string;
    sku_id?: string;
    label?: string;
    palette?: string;
    expires_at?: number | null;
}

/** Layer of a profile frame (decorative border around the profile card). */
export interface ProfileFrameLayer {
    id?: string | number;
    /** Discord shop: often `"staple"`; older payloads used numeric enums. */
    type?: number | string;
    /** `"front"` | `"back"` (API) or numeric order. */
    order?: number | string;
    /** `"top"` | `"bottom"` (API) or numeric anchor. */
    anchor?: number | string;
    responsive?: boolean;
    asset?: string;
    src?: string;
}

/** Equipped profile frame collectible. */
export interface ProfileFrameData {
    skuId?: string;
    sku_id?: string;
    label?: string;
    layers?: ProfileFrameLayer[];
    inner_width?: number;
    overflow_top?: number;
    overflow_bottom?: number;
    overflow_horizontal?: number;
    asset?: string;
    expires_at?: number | null;
    /** Used in media path: /media/v1/collectibles-shop/{id}/{layer}/static */
    store_listing_id?: string;
    category_sku_id?: string;
}

/** One animation layer of a profile effect (Discord overlays these on the profile card). */
export interface ProfileEffectLayer {
    src?: string;
    loop?: boolean;
    height?: number;
    width?: number;
    duration?: number;
    start?: number;
    loopDelay?: number;
    zIndex?: number;
}

/** Equipped profile effect (particle/animation on profile). */
export interface ProfileEffectData {
    id?: string;
    skuId?: string;
    sku_id?: string;
    expires_at?: number | null;
    /** Human title when available from shop catalog / rich payload. */
    title?: string | null;
    accessibilityLabel?: string | null;
    /**
     * Primary overlay image Discord uses in `.profileEffects img.effect`
     * (`cdn.discordapp.com/media/v1/collectibles-shop/{hash}`).
     */
    effectSrc?: string | null;
    /** Preview image URLs — Discord shop often includes these; user profile may only have id. */
    thumbnailPreviewSrc?: string | null;
    staticFrameSrc?: string | null;
    reducedMotionSrc?: string | null;
    /** Full effect layers when present on the profile / catalog. */
    effects?: ProfileEffectLayer[] | null;
}

export interface ProfileSnapshot {
    username?: string;
    avatar?: string | null;
    discriminator?: string;
    global_name?: string | null;
    bio?: string | null;
    banner?: string | null;
    banner_color?: string | null;
    avatarDecoration?: string | null;
    avatarDecorationData?: AvatarDecorationData | null;
    connected_accounts?: Array<{ type: string; name: string; verified: boolean; }>;
    pronouns?: string | null;
    /** Discord profile theme gradient colors (two ints → hex). */
    theme_colors?: [number, number] | number[] | null;
    emoji?: any | null;
    /** Custom status text (activity type 4 `.state`). May be null when emoji-only. */
    customStatus?: string | null;
    /** Custom status emoji (unicode name and/or custom emoji id). */
    customStatusEmoji?: { id?: string | null; name?: string | null; animated?: boolean; } | null;
    /** Profile frame (border around the profile card) — sku/layers fingerprint. */
    profileFrame?: string | null;
    profileFrameData?: ProfileFrameData | null;
    /** Nameplate behind display name. */
    nameplate?: string | null;
    nameplateData?: NameplateData | null;
    /** Profile effect collectible id. */
    profileEffect?: string | null;
    profileEffectData?: ProfileEffectData | null;
    /** Mutual friends with the current user (from profile fetch). */
    mutual_friends_count?: number | null;
    /** Mutual servers count with the current user (from profile fetch). */
    mutual_guilds_count?: number | null;
    /** Resolved mutual friends (id + display + avatar) for profile previews. */
    mutual_friends?: MutualFriendRef[] | null;
    /** Resolved mutual servers (id + name + icon) for profile previews. */
    mutual_guilds?: MutualGuildRef[] | null;
}

/** Compact mutual friend entry for profile change history. */
export interface MutualFriendRef {
    id: string;
    username?: string | null;
    global_name?: string | null;
    avatar?: string | null;
}

/** Compact mutual guild entry for profile change history. */
export interface MutualGuildRef {
    id: string;
    name?: string | null;
    icon?: string | null;
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

