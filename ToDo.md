# List of things I want to do So I don't forget
- ✅ ~~Make the README more readable and LESS CLUTTER~~
- ✅ ~~Better Previews for eveything (Say what's old and what's NEW)~~
- ✅ ~~MAKE SURE to KEEP the attribution to the original author and Mention this is a FORK~~

## WIP (in-order):
1.
- ✅ ~~Filtering out Users in Overall Tracking UI via the eye in toolbar (the one that's everywhere, not the one with different icon for the tracked user itself)~~
  <img width="243" height="68" alt="image" src="https://github.com/user-attachments/assets/59cc9bd2-b36e-4426-a544-bf4e7148abaa" />
2.
- ✅ ~~Add More platforms into logging (Current: Desktop, Mobile, Web; Planned: Desktop, Mobile, Web, Console, VR)~~
- ✅ ~~Logging mutual friends changes and put them under profile section? probably~~
3.
- ✅ ~~Better storage for the old avatars and banners (Phase A)~~
  - Local files under `{logsDir}/assets/{userId}/avatar|banner_{hash}.png|gif` (not embedded in jsonl)
  - Archive on baseline + on avatar/banner profile changes (old + new hashes)
  - ProfileCard prefers local data URL, CDN fallback
- ✅ ~~Better preview of profile changes when hovered over (Phase B)~~
  - Thicker theme gradient border; nameplate behind name/username (sidebar-style)
  - Avatar deco only on PFP; solid `banner_color` / dark fallback
  - Profile effects: fetch shop media via `/collectibles-products/{sku}`, archive under `assets/{userId}/effect_*.img`, overlay on preview
  - Bio renders custom emoji + `<t:unix:style>` timestamps; custom status emoji logged + shown
  - Connections use Discord platform SVGs as mutual-style chips; named mutual chips
  - Profile frames: tried + reverted (logging/overlay unreliable) — not tracked
- ✅ ~~Enhance the preview of Profile changes when hovered over~~ (covered by Phase B)


## Planned Changes (not WIP):
- Profile frames (logging + preview + sidebar) — revisit later if Discord payloads stabilize
- Calendar icon next to [Today/other dates area] and easier picking of dates with a calendar like UI in Main tracker UI
  <img width="352" height="138" alt="image" src="https://github.com/user-attachments/assets/3625e603-b422-4e5e-8ffa-604c37c50dc3" />
- Optimization
- okey my head is empty now

