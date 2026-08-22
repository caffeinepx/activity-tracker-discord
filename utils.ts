


import { Logger } from "@utils/Logger";
import { ApplicationStore } from "@webpack/common";

import { isDebugEnabled, settings } from "./settings";

const _logger = new Logger("Stalker", "#a7d46d");

export const logger = {
    log: (...args: any[]) => {
        if (isDebugEnabled()) _logger.log(...args);
    },
    info: (...args: any[]) => {
        if (isDebugEnabled()) _logger.info(...args);
    },
    warn: (...args: any[]) => {
        if (isDebugEnabled()) _logger.warn(...args);
    },
    error: (...args: any[]) => {
        _logger.error(...args);
    },
    debug: (...args: any[]) => {
        if (isDebugEnabled()) {
            if (typeof (_logger as any).debug === "function") {
                (_logger as any).debug(...args);
            } else {
                _logger.log("[DEBUG]", ...args);
            }
        }
    }
};

export function addToWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (!items.includes(id)) items.push(id);
    settings.store.whitelistedIds = items.join(",");
}

export function removeFromWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    const index = items.indexOf(id);
    if (index !== -1) items.splice(index, 1);
    settings.store.whitelistedIds = items.join(",");
}

export function isInWhitelist(id: string) {
    const items = settings.store.whitelistedIds ? settings.store.whitelistedIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    return items.includes(id);
}
export function getAvatarDecorationUrl(decorationData: { asset: string; skuId?: string; sku_id?: string; } | null | undefined): string | null {
    if (!decorationData?.asset) return null;

    const { asset } = decorationData;
    // Discord CDN expects the full asset hash (including a_ for animated)
    return `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=240&passthrough=true`;
}

/** Convert Discord color int (or hex string) to #rrggbb. */
export function discordColorToHex(color: number | string | null | undefined): string | null {
    if (color == null || color === "") return null;
    if (typeof color === "string") {
        const s = color.trim();
        if (s.startsWith("#")) return s.length >= 7 ? s.slice(0, 7) : s;
        const n = parseInt(s, 10);
        if (Number.isFinite(n)) return discordColorToHex(n);
        return null;
    }
    const n = color >>> 0;
    return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Theme colors → [primaryHex, secondaryHex] for CSS gradients / border rings. */
export function getThemeColorHexes(themeColors?: [number, number] | number[] | null): [string, string] | null {
    if (!themeColors || !Array.isArray(themeColors) || themeColors.length < 2) return null;
    const a = discordColorToHex(themeColors[0]);
    const b = discordColorToHex(themeColors[1]);
    if (!a || !b) return null;
    return [a, b];
}

/** CSS vars / styles for Discord-style profile gradient fill + border ring. */
export function getProfileGradientStyle(themeColors?: [number, number] | number[] | null): Record<string, string> {
    const hexes = getThemeColorHexes(themeColors);
    if (!hexes) return {};
    const [c1, c2] = hexes;
    return {
        "--stalker-theme-primary": c1,
        "--stalker-theme-secondary": c2,
        "--stalker-theme-gradient": `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        "--stalker-theme-border": `linear-gradient(135deg, ${c1}, ${c2}, ${c1})`,
    };
}

/**
 * Nameplate static image URL.
 * asset looks like: "nameplates/nameplatetest/angel/"
 */
export function getNameplateStaticUrl(nameplate?: { asset?: string } | null): string | null {
    const asset = nameplate?.asset;
    if (!asset) return null;
    const path = asset.endsWith("/") ? asset : `${asset}/`;
    return `https://cdn.discordapp.com/assets/collectibles/${path}static.png`;
}

export function getNameplateAssetUrl(nameplate?: { asset?: string } | null): string | null {
    const asset = nameplate?.asset;
    if (!asset) return null;
    const path = asset.endsWith("/") ? asset : `${asset}/`;
    return `https://cdn.discordapp.com/assets/collectibles/${path}asset.png`;
}

/** Rough palette → CSS colors for nameplate tint fallback. */
export function getNameplatePaletteColors(palette?: string | null): { bg: string; fg: string } | null {
    if (!palette) return null;
    const map: Record<string, { bg: string; fg: string }> = {
        crimson: { bg: "linear-gradient(90deg,#5c1219,#a11d2a)", fg: "#fff" },
        berry: { bg: "linear-gradient(90deg,#4a154b,#9b2d8a)", fg: "#fff" },
        sky: { bg: "linear-gradient(90deg,#0b3d66,#2b8fd9)", fg: "#fff" },
        teal: { bg: "linear-gradient(90deg,#0a3d3d,#1a9e9e)", fg: "#fff" },
        forest: { bg: "linear-gradient(90deg,#14381a,#2f8f3a)", fg: "#fff" },
        bubble_gum: { bg: "linear-gradient(90deg,#8a2f5a,#f48fb1)", fg: "#fff" },
        violet: { bg: "linear-gradient(90deg,#3b1f6e,#7c4dff)", fg: "#fff" },
        cobalt: { bg: "linear-gradient(90deg,#12285c,#3d6ef5)", fg: "#fff" },
        clover: { bg: "linear-gradient(90deg,#1e4d28,#4caf50)", fg: "#fff" },
        lemon: { bg: "linear-gradient(90deg,#6b5a12,#f0d030)", fg: "#1a1a1a" },
        white: { bg: "linear-gradient(90deg,#c8c8c8,#f5f5f5)", fg: "#1a1a1a" },
        none: { bg: "linear-gradient(90deg,#2b2d31,#1e1f22)", fg: "#fff" },
    };
    return map[palette.toLowerCase()] ?? null;
}

export function fingerprintNameplate(np: any): string | null {
    if (!np) return null;
    return (np.sku_id ?? np.skuId ?? np.asset ?? null) as string | null;
}

export function fingerprintProfileEffect(effect: any): string | null {
    if (!effect) return null;
    return String(effect.id ?? effect.sku_id ?? effect.skuId ?? "") || null;
}

export type ResolvedProfileEffectPreview = {
    id: string;
    title: string;
    /** Overlay image — same role as Discord `.profileEffects img.effect`. */
    effectUrl: string | null;
    thumbnailUrl: string | null;
    accessibilityLabel: string | null;
};

/** Prefer Discord's live overlay src (`media/v1/collectibles-shop/...` or assets/content). */
export function pickEffectOverlayUrl(obj: any): string | null {
    if (!obj) return null;
    if (typeof obj.effectSrc === "string" && obj.effectSrc.startsWith("http")) return obj.effectSrc;

    const layers = Array.isArray(obj.effects) ? obj.effects : [];
    // Prefer looping/idle layer (what Discord keeps on the profile), then intro
    const loop = [...layers].reverse().find((layer: any) => layer?.loop && (layer.src || layer.url));
    if (loop) {
        const src = loop.src ?? loop.url;
        if (typeof src === "string" && src.startsWith("http")) return src;
    }
    for (const layer of layers) {
        const src = layer?.src ?? layer?.url;
        if (typeof src === "string" && src.startsWith("http")) return src;
    }

    const urls = [
        obj.reducedMotionSrc,
        obj.reduced_motion_src,
        obj.staticFrameSrc,
        obj.static_frame_src,
        obj.thumbnailPreviewSrc,
        obj.thumbnail_preview_src,
        obj.assets?.animated_image_url,
        obj.assets?.static_image_url,
    ];
    for (const u of urls) {
        if (typeof u === "string" && u.startsWith("http")) return u;
    }
    return null;
}

function pickEffectThumb(obj: any): string | null {
    if (!obj) return null;
    const urls = [
        obj.thumbnailPreviewSrc,
        obj.thumbnail_preview_src,
        obj.staticFrameSrc,
        obj.static_frame_src,
        obj.reducedMotionSrc,
        obj.reduced_motion_src,
        obj.effectSrc,
        obj.assets?.static_image_url,
        obj.assets?.animated_image_url,
    ];
    for (const u of urls) {
        if (typeof u === "string" && u.startsWith("http")) return u;
    }
    if (Array.isArray(obj.effects)) {
        for (const layer of obj.effects) {
            const src = layer?.src ?? layer?.url;
            if (typeof src === "string" && src.startsWith("http")) return src;
        }
    }
    return null;
}

function shortEffectLabel(id: string): string {
    return id.length > 6 ? `Effect …${id.slice(-4)}` : `Effect ${id}`;
}

/**
 * Resolve a displayable profile-effect preview from logged data and/or Discord shop catalog.
 * User profiles usually only carry `{ id, sku_id }` — thumbs/titles live in the catalog.
 */
export function resolveProfileEffectPreview(
    effect: {
        id?: string;
        skuId?: string;
        sku_id?: string;
        title?: string | null;
        accessibilityLabel?: string | null;
        effectSrc?: string | null;
        thumbnailPreviewSrc?: string | null;
        staticFrameSrc?: string | null;
        reducedMotionSrc?: string | null;
        effects?: Array<{ src?: string; }> | null;
    } | string | null | undefined
): ResolvedProfileEffectPreview | null {
    if (!effect) return null;
    const id = typeof effect === "string"
        ? effect
        : String(effect.id ?? effect.sku_id ?? effect.skuId ?? "");
    if (!id) return null;

    let title = typeof effect === "object" ? (effect.title ?? null) : null;
    let accessibilityLabel = typeof effect === "object" ? (effect.accessibilityLabel ?? null) : null;
    let effectUrl = typeof effect === "object" ? pickEffectOverlayUrl(effect) : null;
    let thumbnailUrl = typeof effect === "object" ? pickEffectThumb(effect) : null;

    if (!effectUrl || !thumbnailUrl || !title) {
        try {
            const catalog = lookupProfileEffectInCatalog(id)
                ?? (typeof effect === "object" && (effect.sku_id || effect.skuId)
                    ? lookupProfileEffectInCatalog(String(effect.sku_id ?? effect.skuId))
                    : null);
            if (catalog) {
                title = title || catalog.title || catalog.name || null;
                accessibilityLabel = accessibilityLabel
                    || catalog.accessibilityLabel
                    || catalog.accessibility_label
                    || null;
                effectUrl = effectUrl || pickEffectOverlayUrl(catalog);
                thumbnailUrl = thumbnailUrl || pickEffectThumb(catalog);
            }
        } catch { /* catalog unavailable */ }
    }

    return {
        id,
        title: title || accessibilityLabel || shortEffectLabel(id),
        effectUrl: effectUrl || thumbnailUrl,
        thumbnailUrl: thumbnailUrl || effectUrl,
        accessibilityLabel: accessibilityLabel || title,
    };
}

/** Best-effort lookup of PROFILE_EFFECT (type 1) collectible by id/sku in Discord stores. */
function lookupProfileEffectInCatalog(idOrSku: string): any | null {
    if (!idOrSku) return null;
    const stores: any[] = [];
    try {
        // @ts-expect-error optional webpack
        const { findStore } = require("@webpack") as any;
        if (typeof findStore === "function") {
            for (const name of [
                "CollectiblesCatalogStore",
                "CollectiblesPurchaseStore",
                "CollectiblesStore",
                "SkuStore",
            ]) {
                try {
                    const s = findStore(name);
                    if (s) stores.push(s);
                } catch { /* missing */ }
            }
        }
    } catch { /* no webpack */ }

    const matchItem = (item: any): boolean => {
        if (!item) return false;
        const ids = [
            item.id,
            item.sku_id,
            item.skuId,
            item.sku?.id,
        ].map(x => x != null ? String(x) : "");
        return ids.includes(idOrSku);
    };

    for (const store of stores) {
        try {
            const direct =
                store.getProfileEffect?.(idOrSku)
                ?? store.getProduct?.(idOrSku)
                ?? store.getCollectiblesProduct?.(idOrSku)
                ?? store.get?.(idOrSku)
                ?? store.products?.[idOrSku]
                ?? store.getState?.()?.products?.[idOrSku];
            if (direct) {
                const items = direct.items ?? direct.products ?? [];
                const effectItem = Array.isArray(items)
                    ? (items.find((i: any) => i?.type === 1 || i?.thumbnailPreviewSrc || i?.effects) ?? items[0])
                    : null;
                if (effectItem && (effectItem.type === 1 || effectItem.thumbnailPreviewSrc || effectItem.effects)) {
                    return effectItem;
                }
                if (direct.type === 1 || direct.thumbnailPreviewSrc || direct.effects) return direct;
            }

            // Scan product maps when direct key miss (id vs sku mismatch)
            const maps = [
                store.getState?.()?.products,
                store.products,
                store.getState?.()?.profileEffects,
                store.profileEffects,
            ].filter(Boolean);
            for (const map of maps) {
                const values = typeof map === "object" ? Object.values(map) : [];
                for (const product of values as any[]) {
                    if (matchItem(product) && (product.type === 1 || product.thumbnailPreviewSrc || product.effects)) {
                        return product;
                    }
                    const items = product?.items ?? product?.products;
                    if (!Array.isArray(items)) continue;
                    const hit = items.find((i: any) => matchItem(i) && (i.type === 1 || i.thumbnailPreviewSrc || i.effects));
                    if (hit) return hit;
                }
            }
        } catch { /* next store */ }
    }
    return null;
}

function objectHasKey(obj: any, key: string): boolean {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Pull cosmetics off a raw Discord user + user_profile / profile store blob.
 * Field names differ across USER_UPDATE, USER_PROFILE_FETCH_SUCCESS, and Flux stores.
 *
 * Important: when a payload does NOT include collectibles / frame fields at all,
 * we return `undefined` (unknown) so merge keeps the previous snapshot.
 * Only when collectibles are present do we set `null` for an unequipped frame.
 * That prevents false "Profile Frame removed" from partial USER_UPDATE blobs.
 */
export function extractProfileCosmetics(user: any, profile?: any) {
    const u = user ?? {};
    const p = profile ?? {};
    // Nested user_profile on fetch success payloads
    const up = p.user_profile ?? p.userProfile ?? p;

    const collectibles =
        u.collectibles ??
        p.collectibles ??
        up.collectibles ??
        null;

    const sawCollectibles =
        collectibles != null ||
        objectHasKey(u, "collectibles") ||
        objectHasKey(p, "collectibles") ||
        objectHasKey(up, "collectibles");

    const avatarDecorationData =
        up.avatarDecorationData ??
        up.avatar_decoration_data ??
        p.avatarDecorationData ??
        p.avatar_decoration_data ??
        u.avatarDecorationData ??
        u.avatar_decoration_data ??
        undefined;

    const nameplateRaw =
        collectibles?.nameplate ??
        collectibles?.namePlate ??
        up.nameplate ??
        p.nameplate ??
        u.nameplate ??
        null;

    const sawNameplateField =
        sawCollectibles ||
        nameplateRaw != null ||
        objectHasKey(u, "nameplate") ||
        objectHasKey(p, "nameplate") ||
        objectHasKey(up, "nameplate") ||
        (collectibles != null && (objectHasKey(collectibles, "nameplate") || objectHasKey(collectibles, "namePlate")));

    let profileEffectRaw =
        up.profile_effect ??
        up.profileEffect ??
        p.profile_effect ??
        p.profileEffect ??
        u.profile_effect ??
        u.profileEffect ??
        null;

    // Lean payloads often only have { id, skuId }. Full overlay layers live on
    // profile.collectibles[] / catalog — merge those in when sku matches.
    if (profileEffectRaw && !profileEffectRaw.effects && !profileEffectRaw.thumbnailPreviewSrc) {
        const sku = String(profileEffectRaw.sku_id ?? profileEffectRaw.skuId ?? profileEffectRaw.id ?? "");
        const lists = [
            Array.isArray(collectibles) ? collectibles : null,
            Array.isArray(up.collectibles) ? up.collectibles : null,
            Array.isArray(p.collectibles) ? p.collectibles : null,
            Array.isArray(collectibles?.profile_effects) ? collectibles.profile_effects : null,
            Array.isArray(collectibles?.profileEffects) ? collectibles.profileEffects : null,
        ].filter(Boolean) as any[][];
        for (const list of lists) {
            const hit = list.find((c: any) => {
                if (!c) return false;
                const ids = [c.sku_id, c.skuId, c.id].map(x => x != null ? String(x) : "");
                return sku && ids.includes(sku);
            });
            if (hit && (hit.effects || hit.thumbnailPreviewSrc || hit.title)) {
                profileEffectRaw = { ...hit, ...profileEffectRaw };
                break;
            }
        }
    }

    const sawEffectField =
        profileEffectRaw != null ||
        objectHasKey(u, "profile_effect") || objectHasKey(u, "profileEffect") ||
        objectHasKey(p, "profile_effect") || objectHasKey(p, "profileEffect") ||
        objectHasKey(up, "profile_effect") || objectHasKey(up, "profileEffect");

    const theme_colors =
        up.theme_colors ??
        up.themeColors ??
        p.theme_colors ??
        p.themeColors ??
        undefined;

    const nameplateData = nameplateRaw
        ? {
            asset: nameplateRaw.asset,
            skuId: nameplateRaw.sku_id ?? nameplateRaw.skuId,
            sku_id: nameplateRaw.sku_id ?? nameplateRaw.skuId,
            label: nameplateRaw.label,
            palette: nameplateRaw.palette,
            expires_at: nameplateRaw.expires_at ?? null,
        }
        : sawNameplateField
            ? null
            : undefined;

    const normalizeEffectLayers = (raw: any): Array<{ src?: string; loop?: boolean; height?: number; width?: number; duration?: number; start?: number; loopDelay?: number; zIndex?: number; }> | null => {
        if (!Array.isArray(raw) || !raw.length) return null;
        return raw.map((layer: any) => ({
            src: layer?.src ?? layer?.url ?? undefined,
            loop: layer?.loop,
            height: layer?.height,
            width: layer?.width,
            duration: layer?.duration,
            start: layer?.start,
            loopDelay: layer?.loopDelay ?? layer?.loop_delay,
            zIndex: layer?.zIndex ?? layer?.z_index,
        }));
    };

    let profileEffectData = profileEffectRaw
        ? {
            id: String(profileEffectRaw.id ?? profileEffectRaw.sku_id ?? profileEffectRaw.skuId ?? ""),
            skuId: profileEffectRaw.sku_id ?? profileEffectRaw.skuId,
            sku_id: profileEffectRaw.sku_id ?? profileEffectRaw.skuId,
            expires_at: profileEffectRaw.expires_at ?? null,
            title: profileEffectRaw.title ?? profileEffectRaw.name ?? null,
            accessibilityLabel:
                profileEffectRaw.accessibilityLabel
                ?? profileEffectRaw.accessibility_label
                ?? null,
            effectSrc: pickEffectOverlayUrl(profileEffectRaw),
            thumbnailPreviewSrc:
                profileEffectRaw.thumbnailPreviewSrc
                ?? profileEffectRaw.thumbnail_preview_src
                ?? null,
            staticFrameSrc:
                profileEffectRaw.staticFrameSrc
                ?? profileEffectRaw.static_frame_src
                ?? null,
            reducedMotionSrc:
                profileEffectRaw.reducedMotionSrc
                ?? profileEffectRaw.reduced_motion_src
                ?? null,
            effects: normalizeEffectLayers(profileEffectRaw.effects),
        }
        : sawEffectField
            ? null
            : undefined;

    // Enrich from shop catalog so history logs keep overlay src / title for before≠after
    if (profileEffectData?.id && (!profileEffectData.effectSrc || !profileEffectData.title || !profileEffectData.effects)) {
        try {
            const catalog = lookupProfileEffectInCatalog(profileEffectData.id)
                ?? (profileEffectData.sku_id || profileEffectData.skuId
                    ? lookupProfileEffectInCatalog(String(profileEffectData.sku_id ?? profileEffectData.skuId))
                    : null);
            if (catalog) {
                const catalogLayers = normalizeEffectLayers(catalog.effects);
                profileEffectData = {
                    ...profileEffectData,
                    title: profileEffectData.title || catalog.title || catalog.name || null,
                    accessibilityLabel:
                        profileEffectData.accessibilityLabel
                        || catalog.accessibilityLabel
                        || catalog.accessibility_label
                        || null,
                    effectSrc: profileEffectData.effectSrc || pickEffectOverlayUrl(catalog),
                    thumbnailPreviewSrc:
                        profileEffectData.thumbnailPreviewSrc
                        || catalog.thumbnailPreviewSrc
                        || catalog.thumbnail_preview_src
                        || null,
                    staticFrameSrc:
                        profileEffectData.staticFrameSrc
                        || catalog.staticFrameSrc
                        || catalog.static_frame_src
                        || null,
                    reducedMotionSrc:
                        profileEffectData.reducedMotionSrc
                        || catalog.reducedMotionSrc
                        || catalog.reduced_motion_src
                        || null,
                    effects: profileEffectData.effects || catalogLayers,
                };
            }
        } catch { /* catalog optional */ }
    }

    // Avatar decoration: only clear when we saw a decoration-related field
    const sawDecoration =
        avatarDecorationData !== undefined ||
        objectHasKey(u, "avatarDecorationData") || objectHasKey(u, "avatar_decoration_data") ||
        objectHasKey(up, "avatarDecorationData") || objectHasKey(up, "avatar_decoration_data") ||
        objectHasKey(p, "avatarDecorationData") || objectHasKey(p, "avatar_decoration_data");

    return {
        avatarDecorationData: sawDecoration ? (avatarDecorationData ?? null) : undefined,
        avatarDecoration: sawDecoration ? (avatarDecorationData?.asset ?? null) : undefined,
        nameplateData,
        nameplate: sawNameplateField ? fingerprintNameplate(nameplateData) : undefined,
        // Profile frames: not tracked (logging/overlay was unreliable)
        profileFrameData: undefined,
        profileFrame: undefined,
        profileEffectData: sawEffectField
            ? (profileEffectData?.id ? profileEffectData : null)
            : undefined,
        profileEffect: sawEffectField ? fingerprintProfileEffect(profileEffectData) : undefined,
        theme_colors: theme_colors ?? undefined,
    };
}

export function formatTimestamp(ts: number) {
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return String(ts);
    }
}

export function getDurationLabel(durationMs?: number) {
    if (!durationMs || durationMs <= 0) return null;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function getStatusLabel(status?: string | null) {
    if (!status) return "Unknown";
    switch (status.toLowerCase()) {
        case "online": return "Online";
        case "idle": return "Idle";
        case "dnd": return "DND";
        case "offline": return "Offline";
        case "invisible": return "Invisible";
        default: return status;
    }
}

/** Screenshot-mode display name (redact → "User"; blur/blackout keep layout string) */
export function redactDisplayName(
    username: string | undefined | null,
    mode: "redact" | "blur" | "blackout",
    enabled: boolean
) {
    if (!enabled) return username || "Unknown";
    if (mode === "redact") return "User";
    return username || "Unknown";
}

/** Screenshot-mode @tag */
export function redactTag(
    username: string | undefined | null,
    mode: "redact" | "blur" | "blackout",
    enabled: boolean
) {
    if (!enabled) return username ? `@${username}` : "";
    if (mode === "redact") return "@user";
    return username ? `@${username}` : "";
}

/** Visible text for blur/blackout pills (avoids leaking real name via selection) */
export function redactMask(text: string, isTag = false) {
    return isTag ? "@········" : "········";
}

export function getStatusClass(status?: string | null) {
    const normalized = status?.toLowerCase() ?? "unknown";
    return `stalker-status-badge stalker-status-badge--${normalized}`;
}

export function getPlatformLabel(device?: string | null) {
    switch ((device ?? "").toLowerCase()) {
        case "desktop": return "Desktop";
        case "mobile": return "Mobile";
        case "web": return "Web";
        case "embedded": return "Console";
        case "console": return "Console";
        case "vr": return "VR";
        default: return device ? device.charAt(0).toUpperCase() + device.slice(1) : "Unknown";
    }
}

function normalizeStatus(status?: string | null) {
    return (status ?? "").toLowerCase();
}

function isOfflineStatus(status?: string | null) {
    const s = normalizeStatus(status);
    return !s || s === "offline" || s === "invisible";
}

/** Canonical client_status keys we track (Discord: desktop/mobile/web/embedded/vr). */
export const PLATFORM_KEYS = ["desktop", "mobile", "web", "embedded", "vr"] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export type PlatformChange = {
    device: string;
    previousStatus: string;
    currentStatus: string;
};

/**
 * Diff two client-status maps into per-platform transitions.
 * Missing keys are treated as offline.
 */
export function diffClientStatuses(
    previous?: Record<string, string> | null,
    current?: Record<string, string> | null
): PlatformChange[] {
    const prev = previous ?? {};
    const curr = current ?? {};
    const keys = new Set<string>([
        ...PLATFORM_KEYS,
        ...Object.keys(prev),
        ...Object.keys(curr),
    ]);

    const changes: PlatformChange[] = [];
    for (const device of keys) {
        const previousStatus = normalizeStatus(prev[device]) || "offline";
        const currentStatus = normalizeStatus(curr[device]) || "offline";
        // Treat invisible as offline for platform diffs
        const prevNorm = previousStatus === "invisible" ? "offline" : previousStatus;
        const currNorm = currentStatus === "invisible" ? "offline" : currentStatus;
        if (prevNorm === currNorm) continue;
        // Skip both-offline (nothing useful)
        if (prevNorm === "offline" && currNorm === "offline") continue;
        changes.push({
            device,
            previousStatus: prevNorm,
            currentStatus: currNorm,
        });
    }
    return changes;
}

/** Human list of still-active platforms, e.g. "Desktop still Online, Web still Idle" */
export function formatStillActivePlatforms(
    clientStatus?: Record<string, string> | null,
    excludeDevices?: string[]
): string | undefined {
    if (!clientStatus) return undefined;
    const exclude = new Set((excludeDevices ?? []).map(d => d.toLowerCase()));
    const parts: string[] = [];
    for (const [device, status] of Object.entries(clientStatus)) {
        if (exclude.has(device.toLowerCase())) continue;
        const s = normalizeStatus(status);
        if (!s || s === "offline" || s === "invisible") continue;
        parts.push(`${getPlatformLabel(device)} still ${getStatusLabel(s)}`);
    }
    return parts.length ? parts.join(" · ") : undefined;
}

/** Build title/body for a presence notification from overall + platform changes */
export function buildPresenceNotifyCopy(opts: {
    username: string;
    previousStatus?: string | null;
    currentStatus?: string | null;
    platformChanges?: PlatformChange[];
    clientStatus?: Record<string, string> | null;
    onlineDuration?: number;
    offlineDuration?: number;
    activitySummary?: string;
    potentiallyInvisible?: boolean;
}): { title: string; body: string } {
    const {
        username,
        previousStatus,
        currentStatus,
        platformChanges = [],
        clientStatus,
        onlineDuration,
        offlineDuration,
        activitySummary,
        potentiallyInvisible,
    } = opts;

    if (potentiallyInvisible) {
        let body = "⚠️ Potentially invisible — Online → Offline on mobile without Idle (Discord mobile normally idles first)";
        if (onlineDuration) body += ` · was online ${getDurationLabel(onlineDuration)}`;
        return { title: `${username} may be invisible`, body };
    }

    // Prefer platform-scoped messaging when we know which devices flipped
    if (platformChanges.length > 0) {
        const primary = platformChanges[0];
        const plat = getPlatformLabel(primary.device);
        const to = getStatusLabel(primary.currentStatus);
        const from = getStatusLabel(primary.previousStatus);

        let title: string;
        if (primary.currentStatus === "offline") {
            title = `${username} went Offline on ${plat}`;
        } else if (primary.previousStatus === "offline") {
            title = `${username} is ${to} on ${plat}`;
        } else {
            title = `${username} is ${to} on ${plat}`;
        }

        const bodyParts: string[] = [];
        if (platformChanges.length === 1) {
            bodyParts.push(`${plat}: ${from} → ${to}`);
        } else {
            for (const c of platformChanges) {
                bodyParts.push(
                    `${getPlatformLabel(c.device)}: ${getStatusLabel(c.previousStatus)} → ${getStatusLabel(c.currentStatus)}`
                );
            }
        }

        const still = formatStillActivePlatforms(
            clientStatus,
            platformChanges.map(c => c.device)
        );
        if (still) bodyParts.push(still);

        const overall = normalizeStatus(currentStatus);
        if (isOfflineStatus(overall) && onlineDuration) {
            bodyParts.push(`Session online ${getDurationLabel(onlineDuration)}`);
        } else if (!isOfflineStatus(overall) && offlineDuration && primary.previousStatus === "offline") {
            bodyParts.push(`Was offline ${getDurationLabel(offlineDuration)}`);
        }

        if (activitySummary && activitySummary !== "typing" && !activitySummary.startsWith("profile:")) {
            bodyParts.push(activitySummary);
        }

        // Multi-platform flip: expand title slightly
        if (platformChanges.length > 1) {
            title = `${username} presence updated`;
        }

        return { title, body: bodyParts.join(" · ") };
    }

    // Overall-only fallback
    const statusLabel = getStatusLabel(currentStatus);
    let title = `${username} is ${statusLabel}`;
    let body = `Status changed to ${statusLabel}`;
    if (previousStatus) {
        body = `${getStatusLabel(previousStatus)} → ${statusLabel}`;
    }
    if (offlineDuration && !isOfflineStatus(currentStatus)) {
        body += ` (was offline for ${getDurationLabel(offlineDuration)})`;
    }
    if (onlineDuration && isOfflineStatus(currentStatus)) {
        body += ` (was online for ${getDurationLabel(onlineDuration)})`;
    }
    if (clientStatus) {
        const summary = Object.entries(clientStatus)
            .filter(([, s]) => s && !isOfflineStatus(s))
            .map(([d, s]) => `${getPlatformLabel(d)} ${getStatusLabel(s)}`)
            .join(" · ");
        if (summary) body += ` · ${summary}`;
    }
    if (activitySummary && activitySummary !== "typing" && !activitySummary.startsWith("profile:")) {
        body += ` · ${activitySummary}`;
    }
    return { title, body };
}

/** Whether a status should fire notifyOnline / Offline / Idle / Dnd toggles */
export function statusMatchesNotifyToggle(
    status: string | null | undefined,
    config: {
        notifyOnline?: boolean;
        notifyOffline?: boolean;
        notifyIdle?: boolean;
        notifyDnd?: boolean;
    }
): boolean {
    const s = normalizeStatus(status);
    if (s === "online") return config.notifyOnline !== false;
    if (s === "offline" || s === "invisible") return config.notifyOffline !== false;
    if (s === "idle") return config.notifyIdle !== false;
    if (s === "dnd") return config.notifyDnd !== false;
    // Unknown statuses: allow
    return true;
}

/**
 * Discord mobile normally transitions Online → Idle → Offline when you leave.
 * A direct Online → Offline jump on mobile (Idle/DND excluded) often means
 * the user set themselves to Invisible.
 */
export function isPotentiallyInvisibleTransition(opts: {
    previousStatus?: string | null;
    currentStatus?: string | null;
    previousClientStatus?: Record<string, string>;
    /** Whether mobile was recently seen as pure "online" without an idle/dnd step */
    mobileOnlineCandidate?: boolean;
}): boolean {
    const prev = normalizeStatus(opts.previousStatus);
    const curr = normalizeStatus(opts.currentStatus);

    // Only pure online → offline/invisible. Idle/DND are intentional custom states on mobile.
    if (prev !== "online") return false;
    if (!isOfflineStatus(curr)) return false;

    const prevMobile = normalizeStatus(opts.previousClientStatus?.mobile);
    if (prevMobile === "online") return true;
    if (opts.mobileOnlineCandidate) return true;

    return false;
}

/**
 * Update the "mobile was purely online" candidate for invisible detection.
 * Returns the next candidate value (true / false).
 *
 * Armed when mobile is pure "online". Cleared when mobile/overall hits Idle or DND
 * (natural AFK path or intentional custom status — not treated as invisible).
 * If mobile drops Online → Offline in one step, candidate stays armed so the
 * overall Online → Offline check can flag potentially-invisible.
 */
export function updateMobileOnlineCandidate(
    previousCandidate: boolean,
    previousMobileStatus?: string | null,
    currentMobileStatus?: string | null,
    overallStatus?: string | null
): boolean {
    const mobile = normalizeStatus(currentMobileStatus);
    const prevMobile = normalizeStatus(previousMobileStatus);
    const overall = normalizeStatus(overallStatus);

    // Pure online on mobile arms the candidate
    if (mobile === "online") return true;

    // Idle/DND on mobile (or overall) means a normal/custom path — not invisible
    if (mobile === "idle" || mobile === "dnd") return false;
    if (overall === "idle" || overall === "dnd") return false;

    // Mobile offline now: only keep candidate if we just left pure online
    // (or were already armed). Leaving idle/dnd → offline is not invisible.
    if (isOfflineStatus(mobile) || !mobile) {
        if (prevMobile === "idle" || prevMobile === "dnd") return false;
        if (prevMobile === "online") return true;
        return previousCandidate;
    }

    return previousCandidate;
}


export function formatActivitySummary(activities: any[]) {
    if (!activities || activities.length === 0) return undefined;

    const gameActivities = activities.filter(a => a.type !== 4);
    if (gameActivities.length === 0) return undefined;

    return gameActivities.map(activity => {
        const parts = [activity.name || "Unknown"];

        if (activity.details) parts.push(activity.details);
        if (activity.state) parts.push(activity.state);

        if (activity.type === 2 && activity.assets) {
            if (activity.assets.large_text) parts.push(activity.assets.large_text);
        }


        return parts.join(" - ");
    }).join(", ");
}

function safePlainCopy<T>(value: T): T | undefined {
    if (value == null) return undefined;
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return undefined;
    }
}

export function getActivitySnapshots(activities: any[]) {
    if (!activities) return [] as any[];

    return activities
        .filter(a => a && a.type !== 4)
        .map(a => {
            try {
                const application_id = (a as any).application_id ?? (a as any).applicationId ?? undefined;
                let applicationIcon: string | null = (a as any).applicationIcon ?? null;
                try {
                    if (!applicationIcon && application_id && ApplicationStore?.getApplication) {
                        applicationIcon = ApplicationStore.getApplication(application_id)?.icon ?? null;
                    }
                } catch {
                    applicationIcon = null;
                }

                // Only plain JSON-safe fields — Discord activity objects can throw on JSON.stringify
                return {
                    name: a.name ?? undefined,
                    type: a.type,
                    details: a.details ?? undefined,
                    state: a.state ?? undefined,
                    assets: safePlainCopy(a.assets),
                    application_id,
                    applicationId: application_id,
                    applicationIcon,
                    timestamps: a.timestamps
                        ? {
                            start: typeof a.timestamps.start === "number" ? a.timestamps.start : undefined,
                            end: typeof a.timestamps.end === "number" ? a.timestamps.end : undefined,
                        }
                        : undefined,
                    platform: typeof (a as any).platform === "string" ? (a as any).platform : undefined,
                    party: safePlainCopy(a.party),
                    emoji: a.emoji
                        ? {
                            id: a.emoji.id,
                            name: a.emoji.name,
                            animated: a.emoji.animated,
                        }
                        : undefined,
                };
            } catch {
                return {
                    name: a?.name ?? "Unknown",
                    type: a?.type,
                    application_id: (a as any)?.application_id ?? (a as any)?.applicationId,
                };
            }
        });
}

/** Safe compare for activity snapshots — never throws into the presence listener */
export function activitiesSnapshotsEqual(a: any[], b: any[]) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export function summarizeClientStatus(statusMap?: Record<string, string>) {
    if (!statusMap) return undefined;
    const entries = Object.entries(statusMap).filter(([, status]) => status && status !== "offline");
    if (!entries.length) return undefined;
    return entries.map(([device, status]) => `${device}:${status}`).join(", ");
}

