# EXPORT img/ + ui/ (tool: games/world-of-slime/tools/export_2d.py)

Run: `py -3.12 -I tools/export_2d.py img|ui|prefab|video|all` (about 1 min each, pool of 4/3/2; `prefab` needs `ui` run first
because it reads `cache/ui_sprite_map.json`).

## Outputs (asset repo)
- `img/<family>/<name>.webp` (+ `img/index.json`, `{count, items{name: {file,size,orig,family,bundle,kind,pivot,ppu,border}}}`).
  Families: sl 410, item 558, icon 209, npc 94, thumb 16, bufficon 9, mapicon 50, mapbackground 1, img 15 (worldmap), skillindicator 9,
  dialogue 27, introstory 13, storyillust 5 (storyillust/introstory downscaled to 1920 wide). q85 WebP, alpha kept where present.
  One name appears in two bundles: second key is `<family>/<name>`.
- `ui/<folder>/<name>.webp` lossless + `ui/index.json` (key `folder/name`, `border` = [l,b,r,t] px of the exported image, `pivot` normalized,
  `ppu`). 2223 sprites, 124 folders. Folder = last dir of the asset container path (BuySellShopUI, Common, Game, Icon...). Sprites from
  `resources.assets` go under `ui/resources/<tex>`, `sharedassets0.assets` under `ui/sharedassets0/...`, ui_view/popup/play/objects under `ui/<bundle>/...`.
  `sharedassets0/UICommon` (556) and `resources/Common` (152) duplicate sprites in ui_shared / ui_view / ui_popup (same art, ~4 MB).
- `ui/prefab/<bundle>__<prefab>.json` (247 prefabs) + `ui/prefab/index.json`: tree of {name, active, rect{anchorMin,anchorMax,pos,size,pivot,scale},
  comp[{cls, sprite(ui key), Color, text, fontSize, fontColor, Type(Image type 0 simple 1 sliced 2 tiled 3 filled), FillAmount...}], children}.
  5357 sprite refs, 69 unresolved (shown as `?<cab>:<pathid>`, they point to texture_* bundles: icons assigned at runtime).
  Custom MonoBehaviours list only their class and short string fields. RawImage textures are not captured. resources.assets prefabs are not
  dumped (player files have no typetrees).
- `img/login_bg.mp4` 648 KB (h264 crf28, audio dropped), `img/prologue.mp4` 10.6 MB (1920x1080 60fps 55 s, aac).

## Traps
- Atlas sprites are tight-packed: `Sprite.image` returns only the mesh bounding box. Paste at `textureRectOffset` on a canvas of `m_Rect`
  size or pivot/border are wrong (`sprite_full`).
- `video_prologue.bundle` has NO Prologue.json: the "Prologue" TextAsset (26 MB) is an mp4; the VideoClip is the same film as webm in an
  external `.resource` (34 MB). ASSETS.md was wrong.
- ui_view/ui_play depend on ui_shared atlases: load with `wos.load(depth=1)` and filter objects/containers by the bundle's own CABs
  (`load_main`, `mine`, `containers`). The container lives on both the BundleFile and nested SerializedFile; use the nested one.
- Script lookups in `bundle_index.json` have uppercase CAB keys, PPtr externals are lowercased; compare lowercase.
- Git Bash paths `/d/...` do not work inside `py -I -c`; use `D:/...`.
