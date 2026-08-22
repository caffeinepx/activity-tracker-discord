

import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { Tooltip, useEffect, useState } from "@webpack/common";

import {
    cdnProfileAssetUrl,
    getProfileChangeLabel,
    resolveProfileAssetUrl,
    resolveProfileEffectOverlayUrl,
} from "../store";
import { MutualFriendRef, MutualGuildRef, PresenceLogEntry, ProfileChanges, ProfileSnapshot } from "../types";
import {
    discordColorToHex,
    getAvatarDecorationUrl,
    getNameplatePaletteColors,
    getNameplateStaticUrl,
    getProfileGradientStyle,
    getThemeColorHexes,
} from "../utils";

const BANNER_FALLBACK = "#1e1f22";

/** Discord connection platform icons (same module showConnections uses). */
const useLegacyPlatformType: (platform: string) => string = findByCodeLazy(".TWITTER_LEGACY:");
const connectionPlatforms: { get(type: string): { icon?: { lightSVG?: string; darkSVG?: string; }; } | null; } =
    findByPropsLazy("isSupported", "getByUrl");

function getConnectionIconUrl(type: string): string | null {
    try {
        const legacy = useLegacyPlatformType?.(type) ?? type;
        const platform = connectionPlatforms?.get?.(legacy) ?? connectionPlatforms?.get?.(type);
        return platform?.icon?.darkSVG || platform?.icon?.lightSVG || null;
    } catch {
        return null;
    }
}

/** Resolve avatar/banner: local archive first, then CDN. */
function useResolvedAssetUrl(
    userId: string,
    kind: "avatar" | "banner",
    hash: string | null | undefined,
    size: number
): string | null {
    const [url, setUrl] = useState<string | null>(() =>
        hash ? cdnProfileAssetUrl(userId, kind, hash, size) : null
    );

    useEffect(() => {
        let cancelled = false;
        if (!hash) {
            setUrl(null);
            return;
        }
        setUrl(cdnProfileAssetUrl(userId, kind, hash, size));
        resolveProfileAssetUrl(userId, kind, hash, size).then(resolved => {
            if (!cancelled && resolved) setUrl(resolved);
        });
        return () => { cancelled = true; };
    }, [userId, kind, hash, size]);

    return url;
}

function SafeAvatar({ userId, hash, username }: { userId: string; hash: string | null | undefined; username: string }) {
    const avatarUrl = useResolvedAssetUrl(userId, "avatar", hash, 80);
    const [failed, setFailed] = useState(false);

    useEffect(() => { setFailed(false); }, [avatarUrl]);

    if (!avatarUrl || failed) {
        return (
            <div className="stalker-profile-card__avatar stalker-profile-card__avatar--default">
                {username?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt="Avatar"
            className="stalker-profile-card__avatar"
            onError={() => setFailed(true)}
        />
    );
}

function SafeBanner({
    userId,
    hash,
    bannerColor,
}: {
    userId: string;
    hash: string | null | undefined;
    bannerColor: string | null;
}) {
    const bannerUrl = useResolvedAssetUrl(userId, "banner", hash, 600);
    const [failed, setFailed] = useState(false);

    useEffect(() => { setFailed(false); }, [bannerUrl]);

    if (!bannerUrl || failed) {
        const solid = discordColorToHex(bannerColor) || BANNER_FALLBACK;
        return (
            <div
                className="stalker-profile-card__banner-color"
                style={{ backgroundColor: solid }}
                title={bannerColor ? "Banner color" : "No banner"}
            />
        );
    }

    return (
        <img
            src={bannerUrl}
            alt="Banner"
            className="stalker-profile-card__banner-img"
            onError={() => setFailed(true)}
        />
    );
}

function connectionEmojiFallback(type: string): string {
    switch (type) {
        case "spotify": return "🎵";
        case "steam": return "🎮";
        case "xbox": return "🟢";
        case "playstation":
        case "psn": return "🎮";
        case "youtube": return "▶️";
        case "twitch": return "📺";
        case "github": return "💻";
        case "twitter":
        case "x": return "𝕏";
        case "reddit": return "👽";
        case "crunchyroll": return "🍙";
        case "battle.net":
        case "battlenet": return "⚔️";
        case "epicgames": return "🕹️";
        case "riotgames": return "🎯";
        case "ebay": return "🛒";
        default: return "🔗";
    }
}

/** Named chips — must be readable without nested hover (tooltip closes on mouse leave). */
function MutualChips({
    kind,
    count,
    items,
}: {
    kind: "friends" | "servers";
    count: number;
    items: Array<{ id: string; name: string; img: string | null; fallback: string }>;
}) {
    const shown = items.slice(0, 10);
    const extra = Math.max(0, (items.length || count) - shown.length);

    return (
        <div className="stalker-profile-card__mutual-row">
            <span className="stalker-profile-card__mutual-label">
                {kind === "friends" ? "Friends" : "Servers"} ({count})
            </span>
            {shown.length > 0 ? (
                <div className="stalker-profile-card__mutual-chips">
                    {shown.map(item => (
                        <div key={item.id} className="stalker-profile-card__mutual-chip">
                            {item.img
                                ? <img src={item.img} alt="" className="stalker-profile-card__mutual-chip-av" />
                                : <span className="stalker-profile-card__mutual-chip-fallback">{item.fallback}</span>}
                            <span className="stalker-profile-card__mutual-chip-name">{item.name}</span>
                        </div>
                    ))}
                    {extra > 0 && (
                        <span className="stalker-profile-card__mutual-more">+{extra} more</span>
                    )}
                </div>
            ) : (
                <span className="stalker-profile-card__mutual-empty">
                    {count === 0 ? "None" : count > 0 ? `${count} (names unavailable)` : "Unknown"}
                </span>
            )}
        </div>
    );
}

function formatDiscordTimestamp(unixSec: number, style: string | undefined): string {
    const date = new Date(unixSec * 1000);
    if (Number.isNaN(date.getTime())) return `<t:${unixSec}${style ? `:${style}` : ""}>`;

    const styleKey = style || "f";
    try {
        switch (styleKey) {
            case "t": // short time
                return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            case "T": // long time
                return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
            case "d": // short date
                return date.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
            case "D": // long date
                return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
            case "F": // long date/time
                return date.toLocaleString(undefined, {
                    year: "numeric", month: "long", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                });
            case "R":
            case "r": { // relative
                const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
                const abs = Math.abs(diffSec);
                const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
                const units: [Intl.RelativeTimeFormatUnit, number][] = [
                    ["year", 31536000],
                    ["month", 2592000],
                    ["week", 604800],
                    ["day", 86400],
                    ["hour", 3600],
                    ["minute", 60],
                    ["second", 1],
                ];
                for (const [unit, secs] of units) {
                    if (abs >= secs || unit === "second") {
                        return rtf.format(Math.trunc(diffSec / secs), unit);
                    }
                }
                return rtf.format(0, "second");
            }
            case "f":
            default:
                return date.toLocaleString(undefined, {
                    year: "numeric", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                });
        }
    } catch {
        return date.toLocaleString();
    }
}

/** Render bio: custom emoji + Discord timestamps `<t:unix:style>`. */
function BioContent({ bio }: { bio: string }) {
    const nodes: any[] = [];
    // Match emoji OR timestamp tokens
    const re = /<(a?):([a-zA-Z0-9_]{2,32}):(\d+)>|<t:(-?\d+)(?::([tTdDfFR]))?>/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = re.exec(bio)) !== null) {
        if (match.index > last) {
            nodes.push(<span key={`t${key++}`}>{bio.slice(last, match.index)}</span>);
        }
        if (match[0].startsWith("<t:")) {
            const unix = Number(match[4]);
            const style = match[5];
            const label = formatDiscordTimestamp(unix, style);
            nodes.push(
                <span
                    key={`ts${key++}`}
                    className="stalker-profile-card__bio-timestamp"
                    title={new Date(unix * 1000).toLocaleString()}
                >
                    {label}
                </span>
            );
        } else {
            const animated = match[1] === "a";
            const name = match[2];
            const id = match[3];
            nodes.push(
                <img
                    key={`e${key++}`}
                    className="stalker-profile-card__bio-emoji"
                    src={`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=48&quality=lossless`}
                    alt={`:${name}:`}
                    title={`:${name}:`}
                    draggable={false}
                />
            );
        }
        last = match.index + match[0].length;
    }
    if (last < bio.length) {
        nodes.push(<span key={`t${key++}`}>{bio.slice(last)}</span>);
    }
    return <>{nodes}</>;
}

/** Resolve archived / shop effect overlay URL for the card. */
function useEffectOverlayUrl(
    userId: string,
    effect: ProfileSnapshot["profileEffectData"] | string | null | undefined
): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        if (!effect) return;
        resolveProfileEffectOverlayUrl(userId, effect).then(resolved => {
            if (!cancelled) setUrl(resolved);
        });
        return () => { cancelled = true; };
    }, [userId, typeof effect === "string" ? effect : (effect?.id ?? effect?.sku_id ?? effect?.skuId ?? "")]);

    return url;
}

function friendChip(f: MutualFriendRef) {
    const name = f.global_name || f.username || f.id;
    let img = f.avatar
        ? `https://cdn.discordapp.com/avatars/${f.id}/${f.avatar}.png?size=32`
        : null;
    if (!img) {
        let idx = 0;
        try { idx = Number((BigInt(f.id) >> 22n) % 6n); } catch { idx = 0; }
        img = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
    return { id: f.id, name, img, fallback: (name.charAt(0) || "?").toUpperCase() };
}

function guildChip(g: MutualGuildRef) {
    const name = g.name || g.id;
    const img = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=32`
        : null;
    return { id: g.id, name, img, fallback: (name.charAt(0) || "?").toUpperCase() };
}

export function ProfileCard({
    snapshot,
    userId,
    label,
    changedFields,
    referenceSnapshot,
}: {
    snapshot: ProfileSnapshot;
    userId: string;
    label: string;
    changedFields?: string[];
    referenceSnapshot?: ProfileSnapshot;
}) {
    const bannerColor = snapshot.banner_color ?? null;
    const avatarDecorationUrl = snapshot.avatarDecorationData
        ? getAvatarDecorationUrl(snapshot.avatarDecorationData)
        : null;
    const themeStyle = getProfileGradientStyle(snapshot.theme_colors);
    const hexes = getThemeColorHexes(snapshot.theme_colors);
    const nameplateUrl = getNameplateStaticUrl(snapshot.nameplateData);
    const nameplatePalette = getNameplatePaletteColors(snapshot.nameplateData?.palette);
    const effectRef = snapshot.profileEffectData ?? snapshot.profileEffect ?? null;
    const effectOverlayUrl = useEffectOverlayUrl(userId, effectRef);
    const hasEffect = !!(effectRef && (typeof effectRef === "string" ? effectRef : (effectRef.id || effectRef.sku_id || effectRef.skuId)));
    const hasNameplate = !!(nameplateUrl || nameplatePalette);

    const isChanged = (field: string) =>
        changedFields?.includes(field) ||
        (field === "avatarDecoration" && (changedFields?.includes("avatar_decoration") || changedFields?.includes("avatarDecoration"))) ||
        (field === "profile_effect" && (changedFields?.includes("profile_effect") || changedFields?.includes("profileEffect")));

    const showCustomStatus = !!(
        snapshot.customStatus
        || snapshot.customStatusEmoji
        || referenceSnapshot?.customStatus
        || referenceSnapshot?.customStatusEmoji
    );
    const showPronouns = snapshot.pronouns || referenceSnapshot?.pronouns;
    const showBio = snapshot.bio || referenceSnapshot?.bio;
    const showConnections =
        (snapshot.connected_accounts && snapshot.connected_accounts.length > 0)
        || (referenceSnapshot?.connected_accounts && referenceSnapshot.connected_accounts.length > 0);
    const showMutuals =
        snapshot.mutual_friends_count != null
        || snapshot.mutual_guilds_count != null
        || (snapshot.mutual_friends && snapshot.mutual_friends.length > 0)
        || (snapshot.mutual_guilds && snapshot.mutual_guilds.length > 0)
        || referenceSnapshot?.mutual_friends_count != null
        || referenceSnapshot?.mutual_guilds_count != null
        || (referenceSnapshot?.mutual_friends && referenceSnapshot.mutual_friends.length > 0)
        || (referenceSnapshot?.mutual_guilds && referenceSnapshot.mutual_guilds.length > 0)
        || isChanged("mutual_friends_count")
        || isChanged("mutual_guilds")
        || isChanged("mutual_guilds_count");
    const showDivider = showBio || showConnections || showMutuals;

    const friendCount = snapshot.mutual_friends_count ?? snapshot.mutual_friends?.length ?? 0;
    const guildCount = snapshot.mutual_guilds_count ?? snapshot.mutual_guilds?.length ?? 0;

    return (
        <div
            className={[
                "stalker-profile-card",
                hexes ? "stalker-profile-card--themed" : "",
                hasEffect ? "stalker-profile-card--effect" : "",
            ].filter(Boolean).join(" ")}
            style={themeStyle as any}
        >
            <div className="stalker-profile-card__label">{label}</div>
            {hexes && <div className="stalker-profile-card__theme-ring" aria-hidden />}

            {/* Discord-style profileEffects overlay — local archive / shop media */}
            {hasEffect && effectOverlayUrl && (
                <div
                    className={[
                        "stalker-profile-card__profile-effects",
                        isChanged("profile_effect") ? "stalker-profile-card__profile-effects--changed" : "",
                    ].filter(Boolean).join(" ")}
                    role="img"
                    aria-label="Profile effect"
                >
                    <div className="stalker-profile-card__profile-effects-inner">
                        <img
                            src={effectOverlayUrl}
                            alt=""
                            aria-hidden
                            className="stalker-profile-card__profile-effects-img"
                            draggable={false}
                        />
                    </div>
                </div>
            )}

            <div
                className="stalker-profile-card__banner-section"
                style={isChanged("banner") || isChanged("banner_color")
                    ? { outline: "2px solid #5865f2" }
                    : undefined}
            >
                <SafeBanner
                    userId={userId}
                    hash={snapshot.banner}
                    bannerColor={bannerColor}
                />

                <div
                    className="stalker-profile-card__avatar-container"
                    style={isChanged("avatar") || isChanged("avatarDecoration")
                        ? { outline: "2px solid #5865f2", borderRadius: "50%" }
                        : undefined}
                >
                    <SafeAvatar
                        userId={userId}
                        hash={snapshot.avatar}
                        username={snapshot.username ?? "?"}
                    />
                    {avatarDecorationUrl && (
                        <img
                            src={avatarDecorationUrl}
                            alt="Avatar Decoration"
                            className="stalker-profile-card__avatar-decoration"
                        />
                    )}
                </div>

                {showCustomStatus && (
                    <div
                        className="stalker-profile-card__custom-status-bubble"
                        style={isChanged("customStatus") ? { outline: "2px solid #5865f2" } : undefined}
                        title={
                            [
                                snapshot.customStatusEmoji?.name ? `:${snapshot.customStatusEmoji.name}:` : "",
                                snapshot.customStatus || "",
                            ].filter(Boolean).join(" ") || "None"
                        }
                    >
                        {snapshot.customStatusEmoji?.id ? (
                            <img
                                className="stalker-profile-card__custom-status-emoji"
                                src={`https://cdn.discordapp.com/emojis/${snapshot.customStatusEmoji.id}.${snapshot.customStatusEmoji.animated ? "gif" : "png"}?size=48&quality=lossless`}
                                alt={snapshot.customStatusEmoji.name ? `:${snapshot.customStatusEmoji.name}:` : ""}
                                draggable={false}
                            />
                        ) : snapshot.customStatusEmoji?.name ? (
                            <span className="stalker-profile-card__custom-status-emoji-unicode">
                                {snapshot.customStatusEmoji.name}
                            </span>
                        ) : null}
                        {snapshot.customStatus
                            ? <span className="stalker-profile-card__custom-status-text">{snapshot.customStatus}</span>
                            : !snapshot.customStatusEmoji
                                ? <i style={{ opacity: 0.5 }}>None</i>
                                : null}
                    </div>
                )}
            </div>

            <div
                className="stalker-profile-card__body"
                style={hexes ? { background: `linear-gradient(180deg, ${hexes[0]}cc 0%, ${hexes[1]}ee 100%)` } : undefined}
            >
                <div
                    className={[
                        "stalker-profile-card__nameplate",
                        hasNameplate ? "stalker-profile-card__nameplate--active" : "",
                        isChanged("nameplate") || isChanged("profile_effect") || isChanged("theme_colors")
                            ? "stalker-profile-card__nameplate--changed"
                            : "",
                    ].filter(Boolean).join(" ")}
                    style={
                        nameplatePalette && !nameplateUrl
                            ? { background: nameplatePalette.bg, color: nameplatePalette.fg }
                            : undefined
                    }
                >
                    {nameplateUrl && (
                        <img
                            src={nameplateUrl}
                            alt=""
                            className="stalker-profile-card__nameplate-img"
                            draggable={false}
                            onError={e => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                        />
                    )}
                    <div className="stalker-profile-card__names">
                        <div
                            className="stalker-profile-card__display-name"
                            style={isChanged("global_name") || isChanged("username") || isChanged("display_name")
                                ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "2px 4px" }
                                : undefined}
                        >
                            {snapshot.global_name || snapshot.username || "Unknown"}
                            {showPronouns && (
                                <span
                                    className="stalker-profile-card__pronouns"
                                    style={isChanged("pronouns")
                                        ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "2px" }
                                        : undefined}
                                >
                                    {" "}({snapshot.pronouns || "None"})
                                </span>
                            )}
                        </div>
                        <div className="stalker-profile-card__username-tag">
                            {snapshot.username}
                            {snapshot.discriminator && snapshot.discriminator !== "0" && `#${snapshot.discriminator}`}
                        </div>
                    </div>
                </div>

                {showDivider && <div className="stalker-profile-card__divider" />}

                {showBio && (
                    <div className="stalker-profile-card__section">
                        <div className="stalker-profile-card__section-title">About Me</div>
                        <div
                            className="stalker-profile-card__bio"
                            style={isChanged("bio")
                                ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "4px" }
                                : undefined}
                        >
                            {snapshot.bio
                                ? <BioContent bio={snapshot.bio} />
                                : <i style={{ opacity: 0.5 }}>None</i>}
                        </div>
                    </div>
                )}

                {showConnections && (
                    <div className="stalker-profile-card__section">
                        <div className="stalker-profile-card__section-title">Connections</div>
                        <div
                            className={[
                                "stalker-profile-card__connections",
                                isChanged("connected_accounts") ? "stalker-profile-card__connections--changed" : "",
                            ].filter(Boolean).join(" ")}
                        >
                            {snapshot.connected_accounts && snapshot.connected_accounts.length > 0 ? (
                                snapshot.connected_accounts.map((account, i) => {
                                    const iconUrl = getConnectionIconUrl(account.type);
                                    const label = account.name
                                        || (account.type.charAt(0).toUpperCase() + account.type.slice(1));
                                    return (
                                        <div
                                            key={`${account.type}-${account.name}-${i}`}
                                            className="stalker-profile-card__mutual-chip"
                                            title={`${account.type}${account.verified ? " ✓" : ""}`}
                                        >
                                            {iconUrl ? (
                                                <img
                                                    src={iconUrl}
                                                    alt=""
                                                    className="stalker-profile-card__mutual-chip-av stalker-profile-card__connection-icon-img"
                                                />
                                            ) : (
                                                <span className="stalker-profile-card__mutual-chip-fallback">
                                                    {connectionEmojiFallback(account.type)}
                                                </span>
                                            )}
                                            <span className="stalker-profile-card__mutual-chip-name">{label}</span>
                                            {account.verified && (
                                                <span className="stalker-profile-card__connection-pill-verified" aria-label="Verified">✓</span>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="stalker-profile-card__mutual-empty">None</div>
                            )}
                        </div>
                    </div>
                )}

                {showMutuals && (
                    <div className="stalker-profile-card__section">
                        <div className="stalker-profile-card__section-title">Mutuals</div>
                        <div
                            className="stalker-profile-card__mutuals"
                            style={isChanged("mutual_friends_count") || isChanged("mutual_guilds") || isChanged("mutual_guilds_count")
                                ? { outline: "2px solid #5865f2", borderRadius: 6, padding: 6 }
                                : undefined}
                        >
                            <MutualChips
                                kind="friends"
                                count={friendCount}
                                items={(snapshot.mutual_friends ?? []).map(friendChip)}
                            />
                            <MutualChips
                                kind="servers"
                                count={guildCount}
                                items={(snapshot.mutual_guilds ?? []).map(guildChip)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProfileChangeTooltip({ profileChanges, userId }: { profileChanges: ProfileChanges; userId: string; }) {
    return (
        <div className="stalker-profile-comparison">
            <ProfileCard
                snapshot={profileChanges.before}
                userId={userId}
                label="Before"
                changedFields={profileChanges.changedFields}
                referenceSnapshot={profileChanges.after}
            />
            <div className="stalker-profile-comparison__arrow">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
            </div>
            <ProfileCard
                snapshot={profileChanges.after}
                userId={userId}
                label="After"
                changedFields={profileChanges.changedFields}
                referenceSnapshot={profileChanges.before}
            />
        </div>
    );
}

export function renderProfileChangeBadges(entry: PresenceLogEntry) {
    const profileChanges = (entry as any).profileChanges as ProfileChanges | undefined;
    if (!profileChanges || !profileChanges.changedFields?.length) {
        const { activitySummary } = entry;
        if (activitySummary?.startsWith("profile:")) {
            const fields = activitySummary.replace("profile:", "").split(",");
            return (
                <div className="stalker-profile-badges">
                    {fields.map((field, idx) => (
                        <span key={idx} className="stalker-status-badge stalker-status-badge--profile">
                            {getProfileChangeLabel(field)} Updated
                        </span>
                    ))}
                </div>
            );
        }
        return <span className="stalker-status-badge">Profile updated</span>;
    }

    return (
        <Tooltip
            text={<ProfileChangeTooltip profileChanges={profileChanges} userId={entry.userId} />}
            spacing={12}
            tooltipClassName="stalker-profile-tooltip"
        >
            {(tooltipProps: any) => (
                <div {...tooltipProps} className="stalker-profile-badges">
                    {profileChanges.changedFields.map((field, idx) => (
                        <span key={idx} className="stalker-status-badge stalker-status-badge--profile">
                            {getProfileChangeLabel(field)} Updated
                        </span>
                    ))}
                </div>
            )}
        </Tooltip>
    );
}
