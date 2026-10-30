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

## Màn menu: ScrollRect, InputField, ngôn ngữ, glyph dự phòng [ĐO TRONG REPO 2026-10-31]
Kiểm: `node test/food-gang-ui-engine.js` (trang thử do chính script phục vụ, ảnh ở `shots/food-gang/ui-engine/`).
- **ScrollRect** (`ui.initScroll`, gọi từ `engine.afterComp` khi `script:'ScrollRect'`): `c.content/viewport/horizontal/vertical/
  movementType (0 tự do, 1 đàn hồi, 2 kẹp)/inertia/decelerationRate/elasticity/scrollSensitivity` lấy từ `fields`.
  `c.normalizedPosition` get/set `[x,y]` (0..1, y=1 là trên cùng như Unity; **set được hoãn tới sau lượt layout kế** để nội dung
  vừa thêm được đo trước, get đọc ngay trả giá trị đang chờ), `c.scrollTo(node)` (đưa con ra giữa, luôn kẹp theo nội dung),
  `c.onValueChanged = (v)=>…`. Kéo chuột/cảm ứng cuộn qua `anchoredPosition` (`content.rect.pos`); lăn chuột cuộn (ScrollRect
  ngang: lăn xuống = nội dung sang trái, khác Unity vốn đảo). Vật lý đàn hồi/quán tính chạy cuối `layoutCanvas`, dùng
  `engine.rawDt`.
  - Bẫy: biên tính trong **không gian cha của content** (đơn vị của `rect.pos`), không phải của viewport; content nhỏ hơn
    viewport thì biên nở ra quanh pivot content (AdjustBounds) — không nở thì pivot 0 bị đẩy về giữa.
  - Bẫy: kéo bắt đầu sau 10 px canvas (`DRAG_THRESHOLD`), khi đó nút đang bấm bị thả về `normal` và `p.button = null` nên
    nhả chuột không ra click. Nút ngoài ScrollRect vẫn click kiểu cũ. `p.dragged` báo cho `pointerHooks` biết.
  - Bẫy: sự kiện `down` dùng toạ độ **lúc bấm** (`startX/Y`); trước đây dùng `p.x` đã trôi nếu chuột di chuyển cùng khung.
  - Raycast cắt theo Mask/RectMask2D: con bị che khỏi viewport không nhận chuột.
- **TMP_InputField** (`ui.initInput`): `c.value` (getter), `c.setValue(s)` (không bắn `onEndEdit`), `c.focus()`, `c.blur()`,
  `c.onEndEdit(v)`, `c.onValueChanged(v)`, `c.uppercase`, `c.el` (thẻ `<input>` khi đang sửa). Bấm vào ô → `<input>` thật đặt đè
  lên rect của `m_TextComponent`, cỡ chữ theo canvas; trong lúc sửa, chữ TMP và placeholder TMP bị `hidden`. Enter/blur
  ghi giá trị vào text, hiện placeholder nếu rỗng rồi gọi `onEndEdit` (và các `m_OnEndEdit` có đích là đối tượng có phương thức).
  Esc trả giá trị cũ. Lọc ký tự theo `m_CharacterValidation` (nếu 0 thì theo `m_ContentType`), `m_CharacterLimit`; mã
  Alphanumeric tự IN HOA (đặt `c.uppercase=false` để giữ).
  - Bẫy: `focus()` phải chạy **trong sự kiện DOM** thì bàn phím mềm điện thoại mới bật: `input.js` quyết định ở `pointerup`
    (đồng bộ), không chờ vòng `handlePointer`. Cũng vì canvas nuốt `pointerdown`, nên nhấn ra ngoài ô phải gọi tay
    `ui.domPointerDown` để kết thúc sửa (blur không tự bắn).
  - Bẫy: `window` keydown của `Input` bỏ qua phím gõ vào `<input>`, nếu không WASD gõ tên sẽ điều khiển game.
- **Ngôn ngữ** `data/lang/<Tên>.json` = `{khoá: chữ}` của 13 tệp gốc, dựng bằng `node tools/build_lang.js` (nguồn
  `D:\foodgang-ref\export\text`; Turkish thiếu `subtitle.collection`, tra ngược English). `js/game/text.js`: `T(key[, arg])`
  (hiện tại → English → bảng EN nhúng → chính khoá; `[X]` thay bằng `arg`), `localize(root)` (nhớ root, đổi ngôn ngữ thì dịch lại
  tự động, bỏ root đã `destroyed`), `LANGUAGES`, `initText(assets)`, `getLanguage()`, `setLanguage(id)`, `onLanguageChange(fn)`.
  Chọn ngôn ngữ lưu `localStorage['fg-lang']`; lần đầu theo `navigator.language` (zh-TW/HK → ChineseTraditional).
  - Bẫy: tệp gốc có xuống dòng thật trong giá trị và thực thể `&lt; &gt;`; không có `\n` chữ.
  - Bẫy: Arabic gốc chèn RLM/LRM quanh `[X]`; layout bỏ ký tự rộng-0 (U+200B–F, 202A–E, 2066–9) nên `\u200b` của ô nhập không còn thành ô vuông.
- **Glyph dự phòng** (`text.js` cuối tệp, vẽ ở `ui.drawTextQuads`): atlas SDF Tobi chỉ có 160 ký tự (đã bake theo chữ game
  dùng, thiếu cả Р Ж М Я ñ ç ş…). Ký tự thiếu → Canvas2D vào trang atlas 1024² (hết chỗ thì thêm trang), số đo
  `measureText` quy về điểm của font (`RASTER` 64 px = 1 em) nên căn lề/autoSize/ngắt dòng như glyph SDF. Ký tự có trong
  `Tobi_Greek_Cyrillic_Regular.otf` (đọc bảng cmap ngay trong JS) vẽ bằng chính OTF đó, còn lại dùng
  `bold 'Noto Sans', 'Noto Sans JP/KR/SC/TC/Arabic/Thai', 'Segoe UI', …, sans-serif` của hệ thống (không ship Noto). Đếm ở
  `fgEngineStats.fbGlyphs / fbQuads / fbPages`. Viền (`_OutlineWidth`) và bóng (Underlay) vẽ bằng 8 bản sao tô màu viền trước mặt chữ.
  - CJK ngắt giữa hai ký tự bất kỳ (trừ kinsoku trong `LineBreaking *.txt`); Hangul vẫn ngắt theo từ như TMP.
  - Arabic: chuỗi chữ liền thành **một** glyph (canvas `direction='rtl'` nối chữ), rồi đảo thứ tự dòng kiểu bidi rút gọn
    (R = từ Arabic, L = chữ/số khác, còn lại trung tính; đảo từng mức; ngoặc ở mức lẻ được lật). Chưa làm: chữ Thái cắt từ,
    số Ả Rập trong cụm thành chữ liền, căn lề tự lật theo chiều chữ (căn giữ nguyên như cài đặt trong scene).
  - Bẫy: glyph dự phòng nặng nét khác SDF (không có `FaceDilate`), trộn trong cùng một từ thấy lệch độ đậm nhẹ.
  - Bẫy: `assets.font()` phải đợi `loadFallbackFont` (nạp OTF) trước khi layout, không thì ký tự đầu tiên bị cache bằng font hệ thống.
  - Bẫy: vòng phụ thuộc `assets.js` ↔ `text.js` (assets gọi `loadFallbackFont`, text lấy `stats`) chạy được vì cả hai chỉ dùng nhau
    trong hàm, không ở mức module.

## Menu và màn meta `js/game/screens/` [ĐO TRONG REPO 2026-10-31]
Luồng theo META §15: SceneIntro → (lần đầu, `gameCount == 0`) trận hướng dẫn 5 bia ở Kitchen → SceneTutoEnd (đặt tên) →
trận thật đầu tiên → SceneGameOver → SceneMenu; các popup chồng lên menu như `PopupSceneManager`. Mỗi màn là scene Unity đã
xuất (`MENU_SCENES` trong exporter) + một lớp JS port controller gốc; nút đi theo **tên hàm onClick lưu trong scene**
(`MenuController.Play`, `Shop.Close`…) qua `Screen.on(method)`, nút không có lời gọi lưu sẵn (ô skin, ô gói) qua `Screen.onNode`.
Kiểm: `node test/food-gang-meta-ui.js` (cả luồng, ảnh ở `shots/food-gang/ui/`), `node test/food-gang-ui-tour.js` (ảnh 1280x592 cho
skill parity-compare, ra `D:/foodgang-ref/parity-ui/web/`).

| File | Scene | Việc |
|---|---|---|
| `base.js` | — | `Screen`: nạp scene ở tầng popup (`engine.loadScene(name, layer)`; canvas xếp theo `sceneLayer` rồi `order`), `ref/text/setImage/onState`, `clone(node)` (nhân một nút có sẵn của scene), `buttons()` cho test |
| `Menu.js` | SceneMenu | MenuController: chấm đỏ §17.3, BATTLE! (sao/tủ lạnh/hồi tủ), nút league (LeagueDisplay), nút nhiệm vụ, cúp bay vào sau trận (AnimateLeaguePoint) rồi popup gói league §4.6 và popup lên league |
| `LoadingGame.js` | SceneLoadingGame | phòng chờ online "n/4" (chỉ khi Online có mạng) |
| `TutoEnd.js` | SceneTutoEnd | EditName (15 ký tự, `IsNameAllowed`), CONTINUE → trận đầu |
| `Reward.js` | SceneReward | tủ lạnh Box1/2/3 chờ chạm → bật cửa → từng phần thưởng (skin mới, token lên thanh cấp, power, vật phẩm), ITEMS REMAINING |
| `Collection.js` | SceneSkinCollection, SceneSkinStat, ScenePowerInfo, SceneBuySkin | ô skin (chưa có = bóng tối), chỉ số HP/ATTACK theo §3.4, nâng cấp, chọn, power, mua skin tuần |
| `League.js` | SceneLeague, SceneOfferLeague | đường cúp 122 dòng ảo hoá 9 ô, COLLECT! từng ô, bong bóng cúp; gói league |
| `Missions.js` | SceneMissions | 7 ô theo ngày, PLAY → trận nhiệm vụ, COLLECT! |
| `Shop.js` | SceneShop, SceneConfirmPurchase | VIP, ưu đãi skin, gói league, ưu đãi trả tiền ngày, 4 quà ngày (00:00 UTC), tủ lạnh, gói gem, gói xu |
| `Vip.js` | SceneVIP | gói tuần/tháng (KING + thời gian VIP) |
| `Settings.js` | SceneSettings, SceneDelete | âm, nhạc, rung (chỉ máy cảm ứng), FPS 60/120, tên, ngôn ngữ, xoá save |
| `Private.js` | ScenePrivateBattle/Join/Lobby/Configuration | trận riêng qua `js/net/online.js` (lối duy nhất: `js/game/net.js`) |
| `Leaderboard.js` | (DOM) | bảng xếp hạng + 43 thành tựu |

- Một chỗ chọn online/offline: `js/game/net.js`. Chỉ nạp `js/net/online.js` khi import map có nó (khỏi 404), hỏi `Online.available()`
  một lần lúc boot; `?offline=1` ép offline. Chơi nhanh offline giữ đường gốc đấu bot.
- Màn "Searching opponents..." theo clip là **bảng VS của SceneGame** (ô mình hiện, ô bot quay vòng `m_loading` tới BotFillAt 1 s,
  rồi VS), không phải nền cam của SceneLoadingGame 2.2.4; nền cam chỉ dùng cho phòng chờ online.
- Tham số `mode/map/skin/level/seed/slot` trên URL vẫn vào thẳng trận như trước (test trận dùng), bỏ qua menu.
- Cầu nối test: `fgButtons(scene)` (nút đang hiện + toạ độ trang), `fgDamage(slot, amount)` (DebugDamageCommand của sim),
  `fgDebug().ui` (màn trên cùng + `debug()` của nó).
- `?seed=N` gieo cả RNG ghép trận (slot của mình, skin/tên bot), không chỉ seed sim (từ rev 20261031b): cùng URL ra cùng đội hình.
  Trước đó seed chỉ gieo sim nên `test/food-gang-play.js` đỏ ngẫu nhiên (chỗ đứng đầu trận đổi giữa các lần chạy).
- `test/food-gang-play.js` không đo theo đồng hồ thật: lúc vừa vào trận nó đóng băng sim (`runner.timeScale = 0`) và bot
  (`state.botNoMove/botNoAction`, cờ sẵn của sim), rồi tự bước đúng n tick qua `runner.update` (`__fgStep` trong `pageHelpers`
  của test). Đi, nhảy, đánh, chiêu, đồng hồ đếm và màn hồi sinh (chết ép bằng `fgDamage` ở tick 150) đo trong tick sim; chỉ
  đoạn bot đánh nhau, kill feed và hết trận chạy thật. Bẫy đã sập: đo bằng `sleep()` trên máy bận thì bot bắn trúng giữa
  lúc giữ phím Trái (người trôi sang phải), hay cái chết ép rơi đúng cuối trận dm1v1 nên không có màn hồi sinh.

**[ĐỀ XUẤT]** (game gốc không có hoặc rip không có):
- Nút LANGUAGE trong Settings (nhân từ nút Terms of Use, ngồi chỗ Restore Purchases bị ẩn như bản Android), bấm xoay vòng 13 ngôn ngữ.
- Bảng xếp hạng/thành tựu: game gốc mở giao diện Google Play Games; web vẽ bảng DOM, người chơi xếp giữa tên bot với số cúp gieo theo tên.
- Popup "New league!": khoá `league.up` có trong file chữ nhưng không scene nào dùng; web hiện qua SceneReward (huy hiệu league + tên).
- Giá IAP: cửa hàng không có trong rip, nút giữ chữ giá giả của scene (`5$/WEEK`…); bấm là nhận.
- Rung: chỉ hiện nút khi máy có cảm ứng (`navigator.vibrate` của Chrome máy tính không rung).

Bẫy đã sập:
- `Screen.open()` là hàm mở scene: lớp con đặt tên hàm `open(id)` là ghi đè, popup mở nhầm màn khác với `id` rỗng.
- `RaycastClaim` (Graphic vô hình của game) phải nhận raycast, không thì bấm vào nhân vật ở menu hay tủ lạnh không ăn.
- `RewardBoxDisplay`/ảnh thưởng trong prefab đặt `Image.enabled = 0`, code gốc bật lên khi gán; gán sprite mà không bật là ô trống.
- `AspectRatioFitter` (nền mờ mọi popup) chưa có trong engine nên nền đen; nay `ui.js` làm đủ 4 chế độ.
- Sprite game lấy theo tên từ SpriteAtlas (`icon_skin_NN`, `icon_power_SS_P`, `icon_reward_0N`, `pack_currency_*`…) không được scene nào tham chiếu: exporter xuất theo `EXTRA_SPRITE_RE`, màn gọi `app.ensureSprites` trước khi gán.
- Skin bị animator ghi màu mỗi khung: skin chưa mở xám theo độ sáng (`SpriteRenderer.grey` = 1, shader sprite đọc `aExtra.x`)
  nhân `tint` 0,85 như Tom/Billy trong clip, giữ viền đen; ghi vào `color` thì animator xoá mất. Tô tối bằng `tint` 0,42 trông như bóng đen, sai clip.
- Ô quà ngày trong Shop: `button_shop_skin` là khung rỗng ruột, màu nằm ở `BackgroundSkin` phía sau (`bg_skin_4` vàng xu, `bg_skin_3` xanh lá gem,
  `bg_skin_1` xanh tủ lạnh, `bg_skin_5` tím Giant); tô `m_background` thôi thì ô vẫn tối.
- Màn podium cuối trận trượt vào từ phải trong ~1,5 s đầu: chụp so sánh sau 2 s, chụp sớm hơn trông như lệch bố cục.
- Layout nhiều chữ (ô skin, ô cửa hàng) làm `ContentSizeFitter` đo lại chữ mỗi khung: `layoutProps` nhớ kết quả theo chữ/cỡ/bề rộng.

So với clip (skill parity-compare, `D:/foodgang-ref/parity-ui`, tour `test/food-gang-ui-tour.js` + ảnh của `test/food-gang-meta-ui.js`)
[ĐO TRONG REPO 2026-10-31]: 11 cặp, cổng `check` thoát 0 với 12 `ok`, 12 `version`, 0 `web-bug`. Khác lớn nhất đều do bản clip khác rip 2.2.4:
nền popup (`background_blur` của rip sáng hơn clip 1,42-1,49 lần ở dải trên; profile PostProcessMenu không có vignette), trang Fighters
kiểu băng chuyền, lớp đen + tên chế độ trên bảng VS, menu không có panel tối bên phải.
