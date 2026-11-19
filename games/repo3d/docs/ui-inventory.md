# UI inventory - BooHaul -> web 3D reuse (2026-11-18, read-only)

## 1. WebPages vs uGUI
- D:/REPO_Topdown/Assets/Resources/WebPages = repo-squad/{index.html.txt 108KB, coop.html.txt, coop.css.txt}, repo2d/{index.html.txt 38KB, ui-kit.css.txt 5.7KB}. Total ~166KB text. Last commit 2026-11-13 (voice mic buttons; 2026-11-11 notebook arrow fixes).
- uGUI: Assets/UI/Dom last commit 2026-11-09; Assets/UI/Hud 2026-11-09; Assets/UI/Sk 2026-11-06; Assets/Resources/UI 2026-11-15.
- WebPages is NOT stale: it is still the live DOM engine for the Unity game (brain/codebase/ui-ugui.md: DOM kept as hidden "pipe" for blit canvas/input/timers/localStorage; dom-to-ugui memory 2026-11-13 choice A = player-visible UI moves to uGUI, DOM copy deleted later but core kept). Text/logic edits (voice, notebook) still land there.
- uGUI prefabs are GENERATED from the DOM: DomPrefabBake opens each DOM screen at 640x360, DomExport copies laid-out boxes, DomPrefab builds RectTransforms + 9-slice PNG backgrounds + TMP text. So WebPages HTML == source of truth for layout; prefabs are a baked, frozen copy (up to 2026-11-09). Anything changed in HTML after 11-09 is only in WebPages.
- Screen list in prefabs (Assets/UI/Dom): Screens gacha, home, maps, quest, shop, squad (6 lobby screens); Parts tabbar, toast, topbar; Overlays coop_end, coop_hall, coop_room, handbook; Popups confirm, coop_leave, coop_quit, gacha_result, quit_run, return_hub, run_end_quit, run_end_win, settings, settings_run, tutorial_done, tutorial_exit. HUD: Assets/UI/Hud/HudSlots.prefab (+ Resources/UI/HudSlots.json). Run-end board: Assets/UI/Sk/sk-ui-runend.json (atlas frames, ref 1280x720).
- The DOM has the same screens (home/squad/quest/shop/maps/gacha tabs, coop hall/room/end, handbook, settings, in-run HUD drawn on canvas). Run HUD in DOM was canvas-drawn (repo2d engine), not HTML -> HUD lives in the engine/sprites, not CSS.
- Gap: older DOM-only bits (stash/tu do overlay, minimap device, pad money HUD) were moved to uGUI after the DOM copy; check hud-slots / pad-money-hud-ugui memory before assuming parity.
- Layout design size: 640x360 stage (menu ~640x267 CSS), pixel-art, scaled up. Fonts: Pixellari-derived (Tools/Fonts), emoji from Noto.

## 2. Art PNGs and licenses
- Assets/UI/Dom/Art: 334 PNG, ~5.0 MB (hash-named 9-slice backgrounds, _manifest.tsv maps hash->file; names like b-*, co-*, wk-*, wq-*, wp-*, mat-*, touch-*, pc-*). Baked by the DOM bake from the kit, not hand-authored.
- Assets/Resources/UI/Art (+Hud, Emoji, Fonts): 399 PNG total in Resources/UI, ~35 MB Art (dir-level du). Goes into WebGL builds (~16 MB noted).
- Hub copies: D:/survivor-web-hub/games/repo2d/art/{ui,crew,foe,item,room,vfx,tools}; art/ui = 4 PNG (inv-bar/panel/select/slot) from ElvGames Free Inventory, licence file LICENSE-elvgames.txt: personal+commercial OK, modify OK, no resale of the pack, no claiming as own.
- Fonts: Resources/Fonts/Web (LICENSES.txt): Pixellari (zedseven repo says SIL OFL 1.1; source file has no licence record, DaFont "100% free") - FLAG: weak provenance. Noto Emoji OFL/Apache. Terminal 16 dropped.
- FLAGS:
  * Assets/UI/Sk/sk-ui-runend.json = atlas of the Soul Knight-styled run-end board (memory run-end-board-sk: "bang ket ca uGUI art Soul Knight"). Third-party IP, repo README of SK sources forbids release; art-sources.md says user accepted risk for public hub 2026-09-14, but 2026-11-06 IP cleanup rule says remove SK. The referenced SK PNGs are under Resources/UI (Hud/Art) - not individually audited; ~dozens of frames. Treat run-end board art as NOT reusable until replaced.
  * Gear/shop icons: painter-drawn (artist, ~/ICON, 2026-10-13) - own commissioned, OK.
  * VFX: artist sheets (23+16) plus some residual SK/HoloCure sprites in not-yet-replaced effects (HoloCure: gacha banner/chest/EXP per art-sources.md; HoloCure is also third-party IP).
  * Sfx are R.E.P.O. game clips (third party) - not UI, but note for the web port.
  * UI kit reskin (purple pixel kit from designer's mock images) = own designer work.
- Nothing found via LICENSE files in repo root (none within depth 3).

## 3. GameSpark vs local
- Unity: login, save, shop/gacha rolls, quests, md_* tables, localisation (md_localize), stage_rules, co-op rooms all via GameSpark (Assets/Scripts/Backend/*Link.cs). UI screens read only IUiSource (UiLive from SqUiApi) so UI is data-driven; art/layout are local.
- Hub web repo-squad (D:/survivor-web-hub/games/repo-squad): save = localStorage (meta.js: SAVE_KEY, repo2d.kho.v1, "localStorage la chu"), cloud sync only via hub scripts ../../js/{session,supabase-config,supabase-auth,save-sync}.js (Supabase hub account). No GameSpark in the web game. Gacha/shop are local pure-JS rules (meta.js, data/content.js).
- So for a web 3D game: UI skin is local static; data layer must be re-pointed to localStorage+Supabase hub (easy) or GameSpark HTTP (extra work, hub is static GitHub Pages; DEV/LIVE split rules apply).

## 4. survivor-web-hub/games/repo-squad now
- index.html 73,327 B (1099 lines, Nov 3 2026), js/meta.js 36 KB, js/squad.js 36 KB, js/ui.js 61 KB, data/content.js (~28 KB dir). Total 5 files ~230KB. Engine shared from ../repo2d (game.js, sprites.js, phong.js, bot.js, art/, sfx/, tu-do.css; repo2d dir 15 MB). Last git commit 2026-11-03.
- Unity WebPages repo-squad/index.html.txt is 1423 lines/108 KB vs hub 1099/73 KB: Unity copy is ~10 days newer and ~30% bigger (co-op, voice, notebook, settings). Diff 705 lines. Hub version = OLDER UI than current Unity (pre-coop/voice, pre kit reskin?), but same DOM lineage; hub engine art is the old one.

## 5. Recommendation
Options:
A) Reuse WebPages HTML/CSS (+ Art PNG + fonts) as a DOM overlay over the three.js canvas. Cheapest and most faithful: it IS the layout the uGUI was baked from; 166KB text, zero export tooling. Needs: strip Unity bridge calls (SqUi_a, DomApi), re-point to meta.js-style local save/Supabase, drop canvas HUD (re-do HUD in DOM/CSS since it was canvas-drawn). Cost: ~1-2 days to detach; ongoing: copy fresh from WebPages (now newer than hub).
B) Export uGUI prefabs to HTML: only Dom/Art PNG + manifest and prefab YAML positions; doable by script but just reproduces what the HTML already says, loses text reflow; only worth it for HUD/run-end which exist solely as uGUI (HudSlots, sk-ui-runend). Medium-high cost, fragile.
C) Reuse hub repo-squad as-is: works today with save/auth, but older UI (Nov 3), would need updating -> merge with WebPages deltas. Cheapest running baseline, not "current".
Pick: A, starting from hub repo-squad structure (js/meta.js, ui.js, Supabase bridge) and pulling updated index.html/coop.* from WebPages; render the 3D game in a canvas behind a pointer-events:none DOM layer; rebuild run HUD as DOM using Art PNGs. Blockers before shipping publicly: replace Soul Knight run-end board art, residual HoloCure/SK VFX, R.E.P.O. sfx, check Pixellari licence.
