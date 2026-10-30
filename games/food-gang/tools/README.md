# Food Gang — bộ xuất Unity → web và dạng dữ liệu

Bộ xuất đọc project AssetRipper đã sửa `D:\foodgang-ref\fg-unity` (chỉ đọc, không cần mở Unity) và ghi dữ liệu gọn
cho runtime JS ở `js/engine/`. Chạy lại được bất cứ lúc nào:

```
cd /d/survivor-web-hub/games/food-gang
PYTHONIOENCODING=utf-8 py -3.12 -I tools/export_unity.py            # mặc định: scene trận + prefab trận
PYTHONIOENCODING=utf-8 py -3.12 -I tools/export_unity.py --all      # thêm mọi scene menu/popup (atlas to hơn)
```

Cần: Python 3.12 + PyYAML (CSafeLoader) + Pillow; `ffmpeg` trên PATH để ra mp3 (thiếu thì báo và bỏ âm thanh).

## Quy ước chung

- Đơn vị Unity, trục y lên. Góc quay: `r` là số (độ, quanh trục z) khi quay thuần z, còn lại là quaternion `[x,y,z,w]`.
- Tham chiếu trong cùng file: `"#<node>"` (GameObject/Transform) hoặc `"#<node>.<comp>"` (component thứ `comp` của node).
- Tham chiếu ra ngoài: `"sprite:<key>"`, `"clip:<key>"`, `"ctrl:<key>"`, `"prefab:<name>"`, `"audio:<key>"`,
  `"mat:<key>"`, `"font:<key>"`, `"mesh:<key>"`, `"asset:<đường dẫn trong Assets>"`. Không giải được: `null`.
- Màu: `[r,g,b,a]` 0..1. Đường cong: `[[t, v, inSlope, outSlope], ...]` (slope vô hạn = bậc thang, ghi `"inf"`/`"-inf"`).

## `data/project.json`
`{ sortingLayers: [{name,id}], layers: [tên theo chỉ số], colorSpace: 'gamma'|'linear' }`

## `data/scenes/<tên>.json`, `data/prefabs/<tên>.json`
```
{ name, kind:'scene'|'prefab', nodes:[Node], roots:[chỉ số node], settings?:{ambient,...} }
Node = { id, name, parent (-1 = gốc), active, layer, tag?,
         tf:{ p:[x,y,z], r:số|[x,y,z,w], s:[x,y,z] },
         rect?:{ amin:[x,y], amax:[x,y], pivot:[x,y], size:[w,h], pos:[x,y] },   // RectTransform
         comps:[Comp] }
```
`Comp` luôn có `type` (+ `enabled` nếu có). Các loại có kiểu:

| type | trường |
|---|---|
| SpriteRenderer | sprite, color, flip:[x,y], layer (id sorting layer), order, mat, drawMode, size, maskInteraction |
| SortingGroup | layer, order |
| MeshRenderer + MeshFilter | mats:[mat], mesh, layer, order (MeshFilter gộp vào MeshRenderer) |
| Animator | ctrl, speed, cull, applyRoot |
| Animation | clip, clips:[clip], auto (play on awake), wrap |
| ParticleSystem | xem dưới; renderer gộp vào `r` |
| Camera | ortho, size, fov, near, far, clear, bg, depth, mask |
| Canvas | mode (0 overlay, 1 camera, 2 world), order, layer, pixelPerfect, planeDistance, overrideSorting |
| CanvasScaler | mode, refRes:[w,h], match, scaleFactor, ppu |
| CanvasGroup | alpha, interactable, blocks, ignoreParent |
| Image | sprite, color, mat, raycast, imgType (0 simple,1 sliced,2 tiled,3 filled), preserveAspect, fillCenter, fillMethod, fillAmount, fillClockwise, fillOrigin, ppuMul |
| RawImage | tex, color, uv:[x,y,w,h] |
| Text (TMP) | text, font, size, autoSize, sizeMin, sizeMax, color, align (bitmask TMP), wrap, overflow, style, spacing:{char,word,line}, margin, mat (outline/underlay/dilate lấy từ material), richText |
| Button | interactable, transition, colors, spriteState, target, animTriggers |
| Mask / RectMask2D | showGraphic / padding, softness |
| HorizontalLayoutGroup / VerticalLayoutGroup / GridLayoutGroup | padding:[l,r,t,b], spacing, childAlign, controlW/H, forceExpandW/H, (grid) cell, constraint, count |
| LayoutElement / ContentSizeFitter | min/preferred/flexible / h, v |
| Slider | fillRect, handleRect, dir, min, max, value |
| AudioSource | clip, volume, pitch, loop, playOnAwake, spatial, mute |
| BoxCollider2D | size, offset, trigger |
| Volume | global, weight, profile:{postExposure, contrast, saturation, tonemap, bloom:{threshold,intensity,scatter}} |
| Cinemachine* | cinemachine camera/composer/confiner/brain: lens, distance, damping, deadZone, hardLimits, lookahead, bounds |
| MonoBehaviour | script:'<Lớp>', fields:{...}: field serialize của script game, tham chiếu đã đổi theo quy ước trên |

ParticleSystem (chỉ giữ module bật):
```
{ type:'ParticleSystem', dur, loop, prewarm, delay:MMC, playOnAwake, space:0 local|1 world, scaling, maxP, seed?,
  main:{ life:MMC, speed:MMC, size:MMC, size3d?, rot:MMC, color:MMG, gravity:MMC, flipRot },
  emission?:{ rate:MMC, dist:MMC, bursts:[{t, n:MMC, cycles, interval, p}] },
  shape?:{ kind, radius, thick, angle, arc, len, box:[x,y,z], pos, rot, scale, randDir, sphereDir },
  vel?:{ x,y,z:MMC, world, orbital?, radial? }, limit?:{ v:MMC, damp, drag? }, force?:{x,y,z,world},
  col?:MMG, sizeL?:MMC, sizeSpeed?, rotL?:MMC, rotSpeed?:MMC, noise?:{strength, freq, scroll, damping},
  uv?:{ tiles:[x,y], mode, frame:MMC, startFrame:MMC, cycles, rowMode, row },
  coll?:{ type, dampen, bounce, lifetimeLoss, planes },
  sub?: [...], r:{ mode (0 billboard,1 stretch,3 vertical...), mat, sortMode, layer, order, lenScale, velScale, minSize, maxSize, pivot } }
MMC = { m:0|1|2|3, s:scalar, mn:minScalar, c?:curve, c2?:curveMin }   // MinMaxCurve
MMG = { m:0..4, a:color, b:color, g?:Grad, g2?:Grad }                  // MinMaxGradient
Grad = { c:[[t,r,g,b]], a:[[t,a]], mode }
```

## `data/anim/clips.json`
```
{ <clipKey>: { len, rate, loop, wrap, events:[{t, fn, s, f, i, obj}],
               curves:[{ path, prop, cls?, keys:[[t,v,in,out]...] }],     // prop: 'p.x' 'p.y' 'p.z' 's.x'.. 'r.z' (euler, độ)
                                                                            //  'm_Color.r', 'm_IsActive', 'm_Enabled', 'm_AnchoredPosition.x' ...
               pptr:[{ path, prop:'m_Sprite', keys:[[t, 'sprite:<key>']] }] } }
```
`cls` là loại component đích: `SpriteRenderer`, `GameObject`, `Image`, `RectTransform`, `CanvasGroup`, `ParticleSystem`,
`MonoBehaviour:<Lớp>`... Đường dẫn `path_0x<crc>` của AssetRipper được giải lại bằng CRC32 các đường dẫn transform thật.

## `data/anim/controllers.json`
```
{ <ctrlKey>: { params:[{name, type:'float'|'int'|'bool'|'trigger', def}],
               layers:[{ name, weight, blend:'override'|'additive', mask?, sync?, sm:StateMachine }] },
  <overrideKey>: { base:<ctrlKey>, over:{ <clipKey gốc>: <clipKey thay> } } }
StateMachine = { def:<state>, states:[{ name, motion:<clipKey>|BlendTree, speed, speedParam?, mult?, cycleOffset, mirror,
                                        tag, trans:[Trans] }], any:[Trans], entry:[Trans], sub?:[...] }
Trans = { to:<state chỉ số>|'exit', cond:[[mode, param, threshold]], exitTime?, hasExit, dur, fixed, offset, interrupt, ordered, canSelf }
BlendTree = { kind:'1d'|'2d...', param, paramY?, children:[{motion, th, pos?, speed}] }
```
mode: 1 If (bool true / trigger), 2 IfNot, 3 Greater, 4 Less, 6 Equals, 7 NotEqual.

## `data/sprites.json` + `art/<atlas>.webp`
```
{ atlases: { <tên>: { file:'art/<tên>.webp', w, h } },
  sprites: { <key>: { a:<atlas>, x, y, w, h,           // khung trong atlas (pixel, gốc trên-trái)
                      px, py,                          // pivot theo pixel, tính từ góc dưới-trái khung
                      ppu, border?:[l,b,r,t], ow, oh,  // ow/oh: cỡ rect gốc trước khi cắt viền trong suốt
                      ox, oy } } }                     // vị trí khung đã cắt trong rect gốc (pixel, từ dưới-trái)
```
Chỉ xếp sprite có người dùng (scene/prefab/clip đã xuất + texture của material particle/mesh). Ảnh nhóm theo nơi dùng
(`common`, `skins`, `fx`, `ui`, `map_<tên>` …) để trang chỉ tải atlas cần. WebP lossless (giữ nét nguyên bản).

## `data/materials.json`
`{ <matKey>: { shader, src, dst (enum BlendMode của Unity), tex?:'sprite:<key>', color?, props:{...} } }`

## `data/meshes/<key>.json`
`{ pos:[...], nrm:[...], uv:[...], col?:[...], sub:[{ start, count }] }` — mesh 3D của map (đã gộp tĩnh = toạ độ thế giới).

## `data/fonts/`
`<font>.json` (TMP: faceInfo, glyph [x,y,w,h, bx,by, adv], bảng ký tự, atlas, padding, gradientScale) + `<font>.webp`
(atlas SDF). TTF/OTF gốc chép kèm để sau này dựng atlas chữ khác (Thái, Hàn, Ả Rập...).

## `audio/<key>.mp3` + `data/audio.json`
`{ <key>: { file, len } }`

## `data/assets/<tên>.json`
ScriptableObject game đọc lúc chạy (`Resources.Load`): `GameData` (màu đội, sprite thanh máu `m_lifebarTeam`, skin…),
`AudioDB`, `skins/<SKIN>`. Dạng `{script, name, fields}`, tham chiếu theo quy ước ở trên.

## Runtime `js/engine/` [ĐO TRONG REPO]
`engine.js` (vòng FixedUpdate 0.02 → Update → Animator → LateUpdate → camera → vẽ), `scene.js` (Node = GameObject +
Transform/RectTransform), `assets.js` (nạp + `window.fgEngineStats`), `render.js` (WebGL2: mesh toon, sprite batch,
SDF TMP, post), `anim.js` (clip Hermite, Animator, Animation cũ), `particles.js`, `ui.js` + `text.js` (uGUI/TMP),
`camera.js` (Cinemachine PositionComposer + Confiner3D), `audio.js`, `input.js`.
Trang thử: `dev.html?scene=level23|level24|level25&prefab=BRO&anim=idle|run|attack|special|jump&cam=group&x=&y=&face=left|alt&special=1&nofx=1&info=0`.
Kiểm: `node test/food-gang-render.js` (3 map, ảnh ở `shots/food-gang/`).

## Bẫy đã sập (đo trên clip `D:\foodgang-ref\clips`)
- Skin spawn thẳng ở vị trí agent, cỡ 1 (Quantum tạo entity view = prefab `skin_*`). `Agent_*/Root` scale -0.5 là
  prototype phía sim, gắn skin vào đó thì nhân vật nhỏ còn nửa. Art quay trái khi `visual_root` scale x dương.
- Clip quay máy 2.16:1 (vùng game y 64..655 trong khung 1280x720). So ảnh phải chụp web 1280x592, không 1280x720.
- Map là mesh 3D toon, không phải sprite. Shader `ToonRampUnlit` không có nguồn: màu vertex đen = nêm bóng nướng sẵn;
  mặt quay khỏi đèn tối khi N.L < -0.56 với vector đèn = -forward của `_LightDirection` lật trục x (khớp cả 3 map,
  quy ước Unity chuẩn thì Dining sai). Bóng = sáng × (0.48, 0.52, 0.54). Quad trần (`_RampValue` 0) = `_Color` × `_LightColor`.
- Post: profile có Bloom 0.66 và Contrast +20 nhưng clip khớp chỉ với exposure +0.5 (sai 2-8%); bật bloom thì tường
  sáng quá 10-20%. Đang để `engine.bloomScale = 0`, contrast tắt.
- Vòng điểm đội và nút điều khiển trong clip xanh thép, sprite bản 2.2.4 cyan: clip là bản game cũ, đừng chỉnh màu theo.
- Shader giả trong `fg-unity/Assets/Shader` ghi cứng `Blend`: exporter đọc dòng đó thay vì `_SrcBlend/_DstBlend` còn sót
  trong material (UIFlash ghi One/Zero sẽ thành ô trắng đặc).
- Thiếu: viền sáng từng đĩa trong chồng đĩa Dining; particle collision/sub-emitter chỉ xuất chưa mô phỏng; TrailRenderer
  không có trong prefab trận.

## Trận chơi được `js/game/` [ĐO TRONG REPO 2026-10-30]
`index.html` (rev qua `node tools/stamp.js`: import map + `?v=` + `data-rev` cho mọi file dữ liệu) → `js/game/app.js` (Intro →
trận → SceneGameOver → chơi lại). `match/MatchRunner.js` giữ MatchState, bước 60 Hz, nguồn input theo slot `getInput(slot, tick)`.
View chép từ bản viết lại C# `fg-unity/Assets/FG/View` + `Scripts/Assembly-CSharp` (HUD), có đối chiếu decompile chỗ nghi.
Kiểm: `node test/food-gang-play.js` (3 map × 5 mode, `FG_ONLY=kitchen:dm2v2`, `FG_URL=` cho Pages).
- `FgViewDb.asset` (prefab/FX/icon/sfx theo tên sim) xuất thành `data/assets/FgViewDb.json`; `bg_skin_N` không ai tham chiếu nên
  phải nằm trong `EXTRA_SPRITES` của exporter (LoadingCellDisplay lấy sprite theo tên `"bg_skin_" + team`).
- Decompile `OnActionStarted`: trigger `ActionMelee` theo cờ MeleeMode (bit 10), không theo loại action như bản viết lại C#.
- Headless Chromium với swiftshader kẹt ~19 fps ở 1280x720 kể cả dev.html; đo fps phải chạy `--use-angle=d3d11 --enable-gpu` (60 fps).
- `engine.realTime` phải khởi tạo 0: chờ theo `realTime + s` trước khung đầu ra NaN và treo màn Intro (chỉ sập khi tải nhanh).
- Sprite nằm dưới canvas màn hình (bục VICTORY, halo) vẽ trong lượt UI của canvas đó, theo SortingGroup; trước đây vẽ ở lượt
  thế giới bằng toạ độ pixel nên không thấy.
- Animator GameOver: trạng thái idle bật Write Defaults kéo PanelRank/TopBar về chỗ cũ; game gốc thì không, nên trước trigger
  `Reward`/`BottomBar` lấy giá trị hiện tại làm default. Nhánh tủ lạnh không qua BottomBarAppear: tự chạy đường cong thanh nút.
- Đồng hồ trận theo clip: `1:29` khi còn ≥ 1 phút, rồi `00:39`; ≤ 10 s chạy state `Focus` (đỏ, phóng to) + sfx `Time`.
