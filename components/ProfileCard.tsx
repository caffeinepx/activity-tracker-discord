


import { Tooltip, UserStore, useState } from "@webpack/common";

import { getProfileChangeLabel } from "../store";
import { PresenceLogEntry, ProfileChanges, ProfileSnapshot } from "../types";
import { getAvatarDecorationUrl, getProfileGradientStyle, getThemeColorHexes } from "../utils";
import { SnapshotCosmeticsExtras } from "./ProfileCosmetics";

function SafeAvatar({ userId, avatarUrl, username, getExt }: { userId: string; avatarUrl: string | null; username: string; getExt: (hash: string) => string }) {
    const [failed, setFailed] = useState(false);

    if (!avatarUrl || failed) {
        const currentUser = UserStore.getUser(userId);
        const currentAvatar = currentUser?.avatar;
        const fallbackUrl = currentAvatar ? `https://cdn.discordapp.com/avatars/${userId}/${currentAvatar}.${getExt(currentAvatar)}?size=80` : null;

        if (fallbackUrl && !failed) {
            return (
                <img 
                    src={fallbackUrl} 
                    alt="Avatar" 
                    className="stalker-profile-card__avatar" 
                    onError={() => setFailed(true)} 
                />
            );
        }

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

function SafeBanner({ userId, bannerUrl, bannerColor, getExt }: { userId: string; bannerUrl: string | null; bannerColor: string | null; getExt: (hash: string) => string }) {
    const [failed, setFailed] = useState(false);

    if (!bannerUrl || failed) {
        const currentUser = UserStore.getUser(userId);
        const currentBanner = currentUser?.banner;
        const fallbackUrl = currentBanner ? `https://cdn.discordapp.com/banners/${userId}/${currentBanner}.${getExt(currentBanner)}?size=600` : null;

        if (fallbackUrl && !failed) {
            return (
                <img 
                    src={fallbackUrl} 
                    alt="Banner" 
                    className="stalker-profile-card__banner-img" 
                    onError={() => setFailed(true)} 
                />
            );
        }

        return bannerColor ? (
            <div className="stalker-profile-card__banner-color" style={{ backgroundColor: bannerColor }} />
        ) : (
            <div className="stalker-profile-card__banner-default" />
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

export function ProfileCard({ snapshot, userId, label, changedFields, referenceSnapshot }: { snapshot: ProfileSnapshot; userId: string; label: string; changedFields?: string[]; referenceSnapshot?: ProfileSnapshot; }) {
    const getExt = (hash: string) => hash.startsWith("a_") ? "gif" : "png";
    const avatarUrl = snapshot.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${snapshot.avatar}.${getExt(snapshot.avatar)}?size=80` : null;
    const bannerUrl = snapshot.banner ? `https://cdn.discordapp.com/banners/${userId}/${snapshot.banner}.${getExt(snapshot.banner)}?size=600` : null;
    const bannerColor = snapshot.banner_color;
    const avatarDecorationUrl = snapshot.avatarDecorationData ? getAvatarDecorationUrl(snapshot.avatarDecorationData) : null;
    const themeStyle = getProfileGradientStyle(snapshot.theme_colors);
    const hexes = getThemeColorHexes(snapshot.theme_colors);

    const isChanged = (field: string) =>
        changedFields?.includes(field) ||
        (field === "avatarDecoration" && (changedFields?.includes("avatar_decoration") || changedFields?.includes("avatarDecoration"))) ||
        (field === "profile_effect" && (changedFields?.includes("profile_effect") || changedFields?.includes("profileEffect")));

    const showCustomStatus = snapshot.customStatus || referenceSnapshot?.customStatus;
    const showPronouns = snapshot.pronouns || referenceSnapshot?.pronouns;
    const showBio = snapshot.bio || referenceSnapshot?.bio;
    const showConnections = (snapshot.connected_accounts && snapshot.connected_accounts.length > 0) || (referenceSnapshot?.connected_accounts && referenceSnapshot.connected_accounts.length > 0);
    const showDivider = showBio || showConnections;
    const hasEffect = !!(snapshot.profileEffect || snapshot.profileEffectData);

    return (
        <div
            className={[
                "stalker-profile-card",
                hexes ? "stalker-profile-card--themed" : "",
            ].filter(Boolean).join(" ")}
            style={themeStyle as any}
        >
            <div className="stalker-profile-card__label">{label}</div>
            {hexes && <div className="stalker-profile-card__theme-ring" aria-hidden />}

            <div className="stalker-profile-card__banner-section" style={{ position: "relative", ...(isChanged("banner") || isChanged("banner_color") ? { outline: "2px solid #5865f2" } : {}) }}>
                <SafeBanner
                    userId={userId}
                    bannerUrl={bannerUrl}
                    bannerColor={bannerColor}
                    getExt={getExt}
                />
                {hasEffect && <div className="stalker-profile-card__effect" title="Profile effect" aria-hidden />}

                <div className="stalker-profile-card__avatar-container" style={isChanged("avatar") || isChanged("avatarDecoration") ? { outline: "2px solid #5865f2", borderRadius: "50%" } : {}}>
                    <SafeAvatar
                        userId={userId}
                        avatarUrl={avatarUrl}
                        username={snapshot.username}
                        getExt={getExt}
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
                        style={{
                            position: "absolute",
                            bottom: "-12px",
                            left: "100px",
                            backgroundColor: "#111214",
                            color: "#ffffff",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            maxWidth: "200px",
                            boxShadow: "var(--elevation-medium)",
                            fontSize: "14px",
                            zIndex: 10,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            ...(isChanged("customStatus") ? { outline: "2px solid #5865f2" } : {})
                        }}
                        title={snapshot.customStatus || "None"}
                    >
                        {snapshot.customStatus || <i style={{ opacity: 0.5 }}>None</i>}
                    </div>
                )}
            </div>

            <div className="stalker-profile-card__body" style={hexes ? { background: `linear-gradient(180deg, ${hexes[0]}cc 0%, ${hexes[1]}ee 100%)` } : undefined}>
                <div className="stalker-profile-card__user-info" style={isChanged("nameplate") || isChanged("profile_effect") || isChanged("theme_colors") ? { outline: "2px solid #5865f2", borderRadius: 6, padding: 4 } : undefined}>
                    <div className="stalker-profile-card__display-name" style={isChanged("global_name") || isChanged("username") || isChanged("display_name") ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "2px 4px" } : {}}>
                        {snapshot.global_name || snapshot.username || "Unknown"}
                        {showPronouns && (
                            <span className="stalker-profile-card__pronouns" style={isChanged("pronouns") ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "2px" } : {}}> ({snapshot.pronouns || "None"})</span>
                        )}
                    </div>
                    <div className="stalker-profile-card__username-tag">
                        {snapshot.username}
                        {snapshot.discriminator && snapshot.discriminator !== "0" && `#${snapshot.discriminator}`}
                    </div>
                    <SnapshotCosmeticsExtras snapshot={snapshot} userId={userId} />
                </div>

                {showDivider && (
                    <div className="stalker-profile-card__divider" />
                )}

                {showBio && (
                    <div className="stalker-profile-card__section">
                        <div className="stalker-profile-card__section-title">ABOUT ME</div>
                        <div className="stalker-profile-card__bio" style={isChanged("bio") ? { backgroundColor: "rgba(88, 101, 242, 0.2)", borderRadius: "4px", padding: "4px" } : {}}>{snapshot.bio || <i style={{ opacity: 0.5 }}>None</i>}</div>
                    </div>
                )}

                {showConnections && (
                    <div className="stalker-profile-card__section">
                        <div className="stalker-profile-card__section-title">CONNECTIONS</div>
                        <div className="stalker-profile-card__connections">
                            {snapshot.connected_accounts && snapshot.connected_accounts.length > 0 ? (
                                snapshot.connected_accounts.map((account, i) => (
                                    <div key={i} className="stalker-profile-card__connection">
                                        <div className="stalker-profile-card__connection-icon">
                                            {account.type === "spotify" && "🎵"}
                                            {account.type === "steam" && "🎮"}
                                            {account.type === "xbox" && "🎮"}
                                            {account.type === "youtube" && "📺"}
                                            {account.type === "twitch" && "📺"}
                                            {account.type === "github" && "💻"}
                                            {!["spotify", "steam", "xbox", "youtube", "twitch", "github"].includes(account.type) && "🔗"}
                                        </div>
                                        <div className="stalker-profile-card__connection-name">
                                            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ opacity: 0.5, fontStyle: "italic", fontSize: "12px" }}>None</div>
                            )}
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

