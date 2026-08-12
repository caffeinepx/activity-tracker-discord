


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

/**
 * Discord profile-frame layer CDN (from real client HTML):
 *   https://cdn.discordapp.com/media/v1/collectibles-shop/{productOrSkuId}/{layerId}/static
 *
 * productOrSkuId is the first path segment (shop product / sku).
 * layerId is the layer snowflake on the PROFILE_FRAME collectible item.
 */
export function getProfileFrameLayerStaticUrl(
    productId: string | number | null | undefined,
    layerId: string | number | null | undefined
): string | null {
    if (productId == null || layerId == null) return null;
    const p = String(productId).trim();
    const l = String(layerId).trim();
    if (!p || !l) return null;
    return `https://cdn.discordapp.com/media/v1/collectibles-shop/${p}/${l}/static`;
}

/**
 * Candidate CDN URLs for a profile frame layer (try in order until one loads).
 * Prefer the official media/v1/collectibles-shop path Discord uses in the client.
 */
export function getProfileFrameLayerUrlCandidates(
    layer: {
        id?: string | number;
        asset?: string;
        src?: string;
        assets?: { static_image_url?: string; animated_image_url?: string; };
    } | null | undefined,
    productId?: string | number | null | Array<string | number | null | undefined>
): string[] {
    if (!layer) return [];
    const out: string[] = [];
    const push = (u?: string | null) => {
        if (u && !out.includes(u)) out.push(u);
    };

    const productIds = Array.isArray(productId)
        ? productId.filter(Boolean).map(String)
        : productId != null
            ? [String(productId)]
            : [];

    // Official Discord client path — highest priority
    // https://cdn.discordapp.com/media/v1/collectibles-shop/{productId}/{layerId}/static
    if (layer.id != null) {
        for (const pid of productIds) {
            push(getProfileFrameLayerStaticUrl(pid, layer.id));
        }
    }

    push(typeof layer.src === "string" && layer.src.startsWith("http") ? layer.src : null);
    push(layer.assets?.static_image_url);
    push(layer.assets?.animated_image_url);

    if (typeof layer.asset === "string") {
        if (layer.asset.startsWith("http")) push(layer.asset);
        else if (layer.asset.includes("collectibles-shop")) {
            push(layer.asset.startsWith("http") ? layer.asset : `https://cdn.discordapp.com/${layer.asset.replace(/^\//, "")}`);
        } else {
            const path = layer.asset.endsWith("/") ? layer.asset : `${layer.asset}/`;
            push(`https://cdn.discordapp.com/assets/collectibles/${path}static.png`);
            push(`https://cdn.discordapp.com/assets/collectibles/${path}asset.png`);
        }
    }

    try {
        const url = tryDiscordCollectiblesAssetUrl(layer);
        if (url) out.unshift(url);
    } catch { /* ignore */ }

    return out;
}

/** @deprecated use getProfileFrameLayerUrlCandidates */
export function getProfileFrameLayerUrl(
    layer: { id?: string | number; asset?: string; src?: string; } | null | undefined,
    productId?: string | number | null
): string | null {
    return getProfileFrameLayerUrlCandidates(layer, productId)[0] ?? null;
}

/**
 * Use Discord client helpers (when present) to resolve collectible asset URLs / products.
 * Best-effort — fails silently outside Discord.
 */
function tryDiscordCollectiblesAssetUrl(layer: any): string | null {
    const w = (globalThis as any);
    const candidates = [
        w?.Vencord?.Webpack?.Common,
        w?.findByProps?.("getCollectiblesItemAssetUrl"),
    ];
    for (const c of candidates) {
        const fn = c?.getCollectiblesItemAssetUrl;
        if (typeof fn === "function") {
            try {
                const url = fn(layer);
                if (typeof url === "string" && url.startsWith("http")) return url;
            } catch { /* try next */ }
        }
    }
    return null;
}

/**
 * Resolve the media path product id used in:
 *   /media/v1/collectibles-shop/{THIS}/{layerId}/static
 * Prefer sku_id; some products use store_listing_id / category_sku_id.
 */
/** All plausible media-path prefix ids for a frame product (try each with layer id). */
export function getProfileFrameProductIds(frame: any, product?: any): string[] {
    const raw = [
        frame?.sku_id,
        frame?.skuId,
        product?.sku_id,
        product?.skuId,
        product?.product?.sku_id,
        product?.store_listing_id,
        product?.storeListingId,
        product?.product?.store_listing_id,
        product?.category_sku_id,
        product?.categorySkuId,
        product?.product?.category_sku_id,
        frame?.store_listing_id,
        frame?.category_sku_id,
        // Sometimes the product nest is under items[0]
        product?.items?.[0]?.sku_id,
        pickItemSku(product),
    ];
    const out: string[] = [];
    for (const c of raw) {
        if (c == null) continue;
        const s = String(c).trim();
        if (s && !out.includes(s)) out.push(s);
    }
    return out;
}

function pickItemSku(product: any): string | null {
    if (!product) return null;
    const items = product.items ?? product.product?.items ?? [];
    if (!Array.isArray(items)) return null;
    const item = items.find((i: any) => i?.type === 3) ?? items[0];
    return item?.sku_id ?? item?.skuId ?? null;
}

export function getProfileFrameProductId(frame: any, product?: any): string | null {
    return getProfileFrameProductIds(frame, product)[0] ?? null;
}

/**
 * Look up full PROFILE_FRAME product (layers + overflow) from Discord collectibles catalog by SKU.
 * Equipped users often only carry `{ sku_id }` on collectibles — layers live in the shop catalog.
 */
export function resolveProfileFrameFromCatalog(frame: any): any | null {
    if (!frame) return null;
    if (Array.isArray(frame.layers) && frame.layers.length) return frame;

    const sku = String(frame.sku_id ?? frame.skuId ?? "");
    if (!sku) return frame;

    try {
        // Walk known webpack stores / maps Discord exposes for collectibles
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

        // Also scan window Flux stores if available
        const flux = (globalThis as any).DiscordFlux ?? (globalThis as any)._dispatcher;
        void flux;

        for (const store of stores) {
            const product =
                store.getProduct?.(sku) ??
                store.getCollectiblesProduct?.(sku) ??
                store.get?.(sku) ??
                store.products?.[sku] ??
                store.getState?.()?.products?.[sku];
            if (!product) continue;

            const items = product.items ?? product.products ?? [];
            const item =
                (Array.isArray(items) ? items.find((i: any) => i?.type === 3 || i?.layers) : null) ??
                (Array.isArray(items) ? items[0] : null) ??
                product;

            if (item?.layers?.length || item?.overflow_top != null || product.layers?.length) {
                return {
                    ...frame,
                    layers: item.layers ?? product.layers ?? frame.layers,
                    overflow_top: item.overflow_top ?? product.overflow_top ?? frame.overflow_top,
                    overflow_bottom: item.overflow_bottom ?? product.overflow_bottom ?? frame.overflow_bottom,
                    overflow_horizontal: item.overflow_horizontal ?? product.overflow_horizontal ?? frame.overflow_horizontal,
                    inner_width: item.inner_width ?? product.inner_width ?? frame.inner_width,
                    label: item.label ?? product.name ?? frame.label,
                    assets: item.assets ?? product.preview_assets ?? frame.assets,
                };
            }
        }
    } catch {
        /* catalog unavailable */
    }

    return frame;
}

/**
 * CSS overflow vars matching Discord's profileFrameContainer:
 *   --custom-profile-frame-container-width: 1200
 *   --custom-profile-frame-overflow-top / bottom / horizontal
 *
 * Discord designs frames at ~1200px width; we scale to the actual card width.
 */
export function getProfileFrameOverflowStyle(
    frame: any,
    cardWidthPx = 212
): Record<string, string> {
    const designW = Number(frame?.inner_width ?? frame?.container_width ?? frame?.containerWidth ?? 1200) || 1200;
    const top = Number(frame?.overflow_top ?? frame?.overflowTop ?? 298);
    const bottom = Number(frame?.overflow_bottom ?? frame?.overflowBottom ?? 107);
    const horizontal = Number(frame?.overflow_horizontal ?? frame?.overflowHorizontal ?? 56);
    const scale = Math.max(0.12, Math.min(1, cardWidthPx / designW));

    return {
        "--custom-profile-frame-container-width": String(designW),
        "--custom-profile-frame-overflow-top": String(Number.isFinite(top) ? top : 298),
        "--custom-profile-frame-overflow-bottom": String(Number.isFinite(bottom) ? bottom : 107),
        "--custom-profile-frame-overflow-horizontal": String(Number.isFinite(horizontal) ? horizontal : 56),
        "--stalker-frame-scale": String(scale),
        "--stalker-frame-overflow-top": `${(Number.isFinite(top) ? top : 298) * scale}px`,
        "--stalker-frame-overflow-bottom": `${(Number.isFinite(bottom) ? bottom : 107) * scale}px`,
        "--stalker-frame-overflow-horizontal": `${(Number.isFinite(horizontal) ? horizontal : 56) * scale}px`,
        "--stalker-frame-card-width": `${cardWidthPx}px`,
    };
}

/**
 * Discord layer placement classes: front/back × top/bottom
 * (from real DOM: profileFrameLayer front top staple, etc.)
 */
export function getProfileFrameLayerPlacement(
    layer: any,
    index: number,
    total: number
): { depth: "front" | "back"; edge: "top" | "bottom" } {
    const anchor = layer?.anchor;
    const type = layer?.type;
    const order = layer?.order;

    // String hints
    const label = `${layer?.label ?? ""} ${layer?.name ?? ""}`.toLowerCase();
    if (label.includes("bottom")) {
        return { depth: label.includes("back") ? "back" : "front", edge: "bottom" };
    }
    if (label.includes("back")) {
        return { depth: "back", edge: label.includes("bottom") ? "bottom" : "top" };
    }

    // Numeric anchor/type (best-effort from client enums)
    // Common pattern for 3-layer frames: top front, bottom front, top back
    if (anchor === 2 || type === 2) return { depth: "front", edge: "bottom" };
    if (anchor === 3 || type === 3) return { depth: "back", edge: "top" };
    if (anchor === 1 || type === 1) return { depth: "front", edge: "top" };

    if (typeof order === "number" && total >= 2) {
        if (order === 0 || order === 1) return { depth: "front", edge: "top" };
        if (order === 2) return { depth: "front", edge: "bottom" };
        if (order >= 3) return { depth: "back", edge: "top" };
    }

    // Index fallback matching the butterfly frame DOM order:
    // 0 front top, 1 front bottom, 2 back top
    if (total >= 3) {
        if (index === 0) return { depth: "front", edge: "top" };
        if (index === 1) return { depth: "front", edge: "bottom" };
        return { depth: "back", edge: "top" };
    }
    if (total === 2) {
        return index === 0
            ? { depth: "front", edge: "top" }
            : { depth: "front", edge: "bottom" };
    }
    return { depth: "front", edge: "top" };
}

/** @deprecated use getProfileFrameLayerPlacement */
export function getProfileFrameLayerAnchor(layer: any): "top" | "bottom" | "full" | "side" {
    const p = getProfileFrameLayerPlacement(layer, 0, 1);
    return p.edge;
}

/**
 * Fingerprint a profile frame for change detection.
 * SKU only — layer/overflow detail fluctuates across partial payloads and caused
 * false add/remove thrash + triple logs.
 */
export function fingerprintProfileFrame(frame: any): string | null {
    if (!frame) return null;
    const sku = frame.sku_id ?? frame.skuId ?? null;
    if (sku != null && String(sku).length > 0) return String(sku);
    return null;
}

export function fingerprintNameplate(np: any): string | null {
    if (!np) return null;
    return (np.sku_id ?? np.skuId ?? np.asset ?? null) as string | null;
}

export function fingerprintProfileEffect(effect: any): string | null {
    if (!effect) return null;
    return String(effect.id ?? effect.sku_id ?? effect.skuId ?? "") || null;
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

    const profileFrameRaw =
        collectibles?.profile_frame ??
        collectibles?.profileFrame ??
        up.profile_frame ??
        up.profileFrame ??
        p.profile_frame ??
        p.profileFrame ??
        u.profile_frame ??
        u.profileFrame ??
        null;

    const sawFrameField =
        sawCollectibles ||
        profileFrameRaw != null ||
        objectHasKey(u, "profile_frame") || objectHasKey(u, "profileFrame") ||
        objectHasKey(p, "profile_frame") || objectHasKey(p, "profileFrame") ||
        objectHasKey(up, "profile_frame") || objectHasKey(up, "profileFrame") ||
        (collectibles != null && (objectHasKey(collectibles, "profile_frame") || objectHasKey(collectibles, "profileFrame")));

    const sawNameplateField =
        sawCollectibles ||
        nameplateRaw != null ||
        objectHasKey(u, "nameplate") ||
        objectHasKey(p, "nameplate") ||
        objectHasKey(up, "nameplate") ||
        (collectibles != null && (objectHasKey(collectibles, "nameplate") || objectHasKey(collectibles, "namePlate")));

    const profileEffectRaw =
        up.profile_effect ??
        up.profileEffect ??
        p.profile_effect ??
        p.profileEffect ??
        u.profile_effect ??
        u.profileEffect ??
        null;

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

    const profileFrameData = profileFrameRaw
        ? {
            skuId: profileFrameRaw.sku_id ?? profileFrameRaw.skuId,
            sku_id: profileFrameRaw.sku_id ?? profileFrameRaw.skuId,
            label: profileFrameRaw.label,
            layers: Array.isArray(profileFrameRaw.layers)
                ? profileFrameRaw.layers.map((l: any) => ({
                    id: l?.id,
                    type: l?.type,
                    order: l?.order,
                    anchor: l?.anchor,
                    responsive: l?.responsive,
                    asset: l?.asset,
                    src: l?.src ?? l?.url,
                    assets: l?.assets,
                }))
                : undefined,
            inner_width: profileFrameRaw.inner_width ?? profileFrameRaw.innerWidth,
            overflow_top: profileFrameRaw.overflow_top ?? profileFrameRaw.overflowTop,
            overflow_bottom: profileFrameRaw.overflow_bottom ?? profileFrameRaw.overflowBottom,
            overflow_horizontal: profileFrameRaw.overflow_horizontal ?? profileFrameRaw.overflowHorizontal,
            store_listing_id: profileFrameRaw.store_listing_id ?? profileFrameRaw.storeListingId,
            category_sku_id: profileFrameRaw.category_sku_id ?? profileFrameRaw.categorySkuId,
            asset: profileFrameRaw.asset,
            expires_at: profileFrameRaw.expires_at ?? null,
        }
        : sawFrameField
            ? null
            : undefined;

    const profileEffectData = profileEffectRaw
        ? {
            id: String(profileEffectRaw.id ?? profileEffectRaw.sku_id ?? profileEffectRaw.skuId ?? ""),
            skuId: profileEffectRaw.sku_id ?? profileEffectRaw.skuId,
            sku_id: profileEffectRaw.sku_id ?? profileEffectRaw.skuId,
            expires_at: profileEffectRaw.expires_at ?? null,
        }
        : sawEffectField
            ? null
            : undefined;

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
        // Profile frames: do not extract/return — logging was too noisy/false-positive
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

const PLATFORM_KEYS = ["desktop", "mobile", "web", "embedded"] as const;

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

