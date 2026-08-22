
import { UserStore, useState } from "@webpack/common";

import { lastKnownUsers } from "../store";
import { ProfileSnapshot } from "../types";
import {
    getAvatarDecorationUrl,
    getNameplatePaletteColors,
    getNameplateStaticUrl,
    getProfileGradientStyle,
    getThemeColorHexes,
} from "../utils";

function hashExt(hash: string) {
    return hash.startsWith("a_") ? "gif" : "png";
}

function avatarUrl(userId: string, avatar?: string | null, size = 80) {
    if (!avatar) return null;
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${hashExt(avatar)}?size=${size}`;
}

function bannerUrl(userId: string, banner?: string | null, size = 480) {
    if (!banner) return null;
    return `https://cdn.discordapp.com/banners/${userId}/${banner}.${hashExt(banner)}?size=${size}`;
}

/** Resolve live snapshot: prefer tracked lastKnown, fall back to UserStore. */
export function resolveUserCosmeticsSnapshot(userId: string): ProfileSnapshot | null {
    const tracked = lastKnownUsers.get(userId);
    const user = UserStore.getUser(userId) as any;
    if (!tracked && !user) return null;

    const base: ProfileSnapshot = {
        username: tracked?.username ?? user?.username,
        avatar: tracked?.avatar ?? user?.avatar ?? null,
        global_name: tracked?.global_name ?? user?.globalName ?? user?.global_name ?? null,
        banner: tracked?.banner ?? user?.banner ?? null,
        banner_color: tracked?.banner_color ?? user?.bannerColor ?? user?.banner_color ?? null,
        avatarDecoration: tracked?.avatarDecoration ?? user?.avatarDecorationData?.asset ?? user?.avatar_decoration_data?.asset ?? null,
        avatarDecorationData:
            tracked?.avatarDecorationData ??
            user?.avatarDecorationData ??
            user?.avatar_decoration_data ??
            null,
        theme_colors: tracked?.theme_colors ?? null,
        nameplate: tracked?.nameplate ?? null,
        nameplateData: tracked?.nameplateData ?? user?.collectibles?.nameplate ?? null,
        profileEffect: tracked?.profileEffect ?? null,
        profileEffectData: tracked?.profileEffectData ?? null,
        pronouns: tracked?.pronouns ?? null,
        customStatus: tracked?.customStatus ?? null,
    };

    if (!base.nameplateData && user?.collectibles?.nameplate) {
        base.nameplateData = user.collectibles.nameplate;
        base.nameplate = String(user.collectibles.nameplate.sku_id ?? user.collectibles.nameplate.asset ?? "nameplate");
    }
    if (!base.avatarDecorationData) {
        base.avatarDecorationData = user?.avatarDecorationData ?? user?.avatar_decoration_data ?? null;
        base.avatarDecoration = base.avatarDecorationData?.asset ?? null;
    }

    return base;
}

/**
 * Mini Discord-style profile island for the tracker sidebar.
 * Banner, avatar + decoration, theme gradient + ring, nameplate.
 * Profile frames are not tracked/rendered (reverted).
 */
export function CosmeticsUserIsland({
    userId,
    displayName,
    tag,
    screenshotMode,
    children,
}: {
    userId: string;
    displayName: React.ReactNode;
    tag: React.ReactNode;
    screenshotMode?: boolean;
    children?: React.ReactNode;
}) {
    const snap = resolveUserCosmeticsSnapshot(userId);
    const [bannerFailed, setBannerFailed] = useState(false);

    const themeStyle = getProfileGradientStyle(snap?.theme_colors);
    const hexes = getThemeColorHexes(snap?.theme_colors);
    const hasTheme = !!hexes;

    const aUrl = !screenshotMode ? avatarUrl(userId, snap?.avatar, 96) : null;
    const bUrl = !screenshotMode && !bannerFailed ? bannerUrl(userId, snap?.banner, 480) : null;
    const decoUrl = !screenshotMode && snap?.avatarDecorationData
        ? getAvatarDecorationUrl(snap.avatarDecorationData)
        : null;
    const nameplateUrl = !screenshotMode ? getNameplateStaticUrl(snap?.nameplateData) : null;
    const palette = getNameplatePaletteColors(snap?.nameplateData?.palette);
    const hasEffect = !!(snap?.profileEffectData || snap?.profileEffect);
    const bannerColor = snap?.banner_color
        ? (String(snap.banner_color).startsWith("#")
            ? String(snap.banner_color)
            : `#${Number(snap.banner_color).toString(16).padStart(6, "0")}`)
        : null;
    // Solid banner_color when no image; dark fallback — never the old rainbow / theme fill
    const bannerFallback = bannerColor || "#1e1f22";

    const shellClass = [
        "stalker-sidebar-user",
        "stalker-cosmetics-island",
        hasTheme ? "stalker-cosmetics-island--themed" : "",
        hasEffect ? "stalker-cosmetics-island--effect" : "",
    ].filter(Boolean).join(" ");

    return (
        <div className={shellClass} style={themeStyle as any}>
            <div className="stalker-cosmetics-island__ring" aria-hidden />

            <div className="stalker-cosmetics-island__inner">
                <div
                    className="stalker-cosmetics-island__banner"
                    style={!bUrl ? { background: bannerFallback } : undefined}
                >
                    {bUrl && (
                        <img
                            src={bUrl}
                            alt=""
                            className="stalker-cosmetics-island__banner-img"
                            onError={() => setBannerFailed(true)}
                            draggable={false}
                        />
                    )}
                    {hasEffect && !screenshotMode && (
                        <div className="stalker-cosmetics-island__effect" aria-hidden />
                    )}
                </div>

                <div className="stalker-cosmetics-island__avatar-wrap">
                    <div className="stalker-cosmetics-island__avatar-ring">
                        {aUrl ? (
                            <img src={aUrl} alt="" className="stalker-cosmetics-island__avatar" draggable={false} />
                        ) : (
                            <div className="stalker-cosmetics-island__avatar stalker-cosmetics-island__avatar--fallback">
                                {(snap?.username || "?").charAt(0).toUpperCase()}
                            </div>
                        )}
                        {decoUrl && (
                            <img
                                src={decoUrl}
                                alt=""
                                className="stalker-cosmetics-island__avatar-deco"
                                draggable={false}
                            />
                        )}
                    </div>
                </div>

                <div className="stalker-cosmetics-island__info">
                    <div
                        className={[
                            "stalker-cosmetics-island__nameplate",
                            nameplateUrl || palette ? "stalker-cosmetics-island__nameplate--active" : "",
                        ].filter(Boolean).join(" ")}
                        style={
                            palette && !nameplateUrl
                                ? { background: palette.bg, color: palette.fg }
                                : undefined
                        }
                    >
                        {nameplateUrl && (
                            <img
                                src={nameplateUrl}
                                alt=""
                                className="stalker-cosmetics-island__nameplate-img"
                                draggable={false}
                                onError={e => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                            />
                        )}
                        <div className="stalker-cosmetics-island__names">
                            <div className="stalker-sidebar-user__name stalker-cosmetics-island__display">
                                {displayName}
                            </div>
                            <div className="stalker-sidebar-user__tag stalker-cosmetics-island__tag">
                                {tag}
                            </div>
                        </div>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}

/**
 * @deprecated ProfileCard now renders nameplate/deco/effect inline.
 * Kept as a no-op export so older imports don't break.
 */
export function SnapshotCosmeticsExtras(_props: { snapshot: ProfileSnapshot; userId?: string; }) {
    return null;
}
