# UI NGUI của PokéOne: bóc, dữ liệu, vẽ lại

Chủ dự án muốn bản web giữ nguyên UI/UX gốc. UI gốc là NGUI (Tasharen, bản có `NGUIAtlas`/`NGUIFont`
ScriptableObject, tức NGUI 3.11 trở lên). Tệp này ghi cách bóc, dạng dữ liệu, cách `js/ngui.js` vẽ, danh mục
panel game cần và những chỗ còn thiếu.

## Chạy

```
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_ui.py          # ~2 phút, ghi art/ui/**, data/atlas.js, data/ui.js
python games/pokeone/tools/rip_ui_settings.py # ~4 giây, ghi data/settings.js (hoặc rip_ui.py --settings)
node test/pokeone-ui.js                        # Playwright, ảnh ở %TEMP%/pokeone-ui-shots
```

- Xem một panel bất kỳ: mở `games/pokeone/tools/ui-viewer.html?panel=BattlePanel&list=1` qua máy chủ tĩnh ở gốc repo
  (ô chọn góc trái liệt kê mọi khoá của `P1.UI` và `P1.UI_PREFABS`).
- `rip_ui.py` cũng ghi ảnh từng atlas có khung sprite (tím = khung, xanh = viền 9-slice) vào
  `%TEMP%/pokeone-ui-shots/atlas_<tên>.png` để soát toạ độ; đổi chỗ bằng `--debug-dir`.
- Chạy lại ra cùng kết quả. Script xoá sạch `art/ui/*.png` và `art/ui/tex/` trước khi ghi.

## Nguồn [ĐO TRONG REPO, 2026-09-27]

- Cây UI trong game: scene `level2`, dưới `GUI Root` (UIRoot + UIPanel). 1.923 GameObject, bóc được 2.894 nút ở
  48 panel cấp một.
- Màn đăng nhập: scene `level1`, cũng dưới `GUI Root`; 8 panel, khoá mang tiền tố `title:`.
- Prefab UI mà mã dựng lúc chạy (dòng Options, ô túi đồ, thẻ Pokémon, dòng hộp thoại...): 73 prefab gốc trong
  `sharedassets0..2` và `resources.assets`, 924 nút.
- MonoBehaviour đọc qua `ttg.py` (typetree dựng từ DummyDll). Không sửa `ttg.py`; `rip_ui.py` chỉ import nó.

### Atlas

| Khoá `P1.ATLAS` | Ảnh | Sprite | Nguồn |
|---|---|---|---|
| `GUIAtlas` | 2048×1024 | 415 | NGUIAtlas `GUIAtlas`, sharedassets0 (chứa cả glyph font bitmap Aldrich/Arial) |
| `WoodenAtlas` | 1024×512 | 37 | NGUIAtlas `Wooden Atlas`, sharedassets1 (có glyph `Arimo14`) |
| `EmoteAtlas` | 512×512 | 30 | sharedassets2 |
| `SlotAtlas` | 1024×1024 | 21 | sharedassets2 (máy đánh bạc) |
| `Streamers` | 128×128 | 2 | sharedassets2 |
| `FantasyAtlas` | 512×512 | 13 | NGUIAtlas `Fantasy Atlas`, sharedassets2 |
| `fx_normal` | 512×512 | 38 | UIAtlas trên GameObject `BattleAnim_Normal1`: cloud, eyes, notes, slash, tackle, whirlwind, smallfist |
| `fx_test` | 2048×2048 | 88 | `BattleAnimTest`: fire, acid, blatt, erde, feuerwirbel, shine1, slash, stuck, tackle, water, willpower |
| `fx_items` | 256×128 | 12 | `BattleAnim_Items1`: smallcrystal |
| `fx_statuseffects` | 256×256 | 42 | `BattleAnim_StatusEffects1`: confused, flinch, frozen, hourglass, paralyze, sleep |
| `fx_fire` | 512×256 | 24 | `BattleAnim_Fire1`: fire, firewhirl |
| `fx_rock` | 512×256 | 7 | `BattleAnim_Rock1`: rock, rockshatter |
| `fx_plant` | 128×128 | 7 | `BattleAnim_Plant1`: blatt, deprive |
| `fx_water` | 512×512 | 29 | `BattleAnim_Water1`: graywater, water, wave |
| `fx_bug` | 64×128 | 5 | `BattleAnim_Bug1`: chitinthread |
| `fx_electro` | 256×512 | 18 | `BattleAnim_Electro1`: blitz, emp |

- 10 atlas VFX không có `m_Name`. Tên lấy từ GameObject mang UIAtlas (`BattleAnim_Fire1` → `fx_fire`), không
  lấy theo tiền tố sprite: mỗi atlas gom nhiều hiệu ứng. `P1.ATLAS.fx_*.groups` đếm số khung từng hiệu ứng,
  `src` giữ tên gốc.
- **[BẪY ĐÃ SẬP]** Atlas NGUI mới để sprite ở `mSprites` (toạ độ nguyên, pixel, gốc trên-trái). Hai atlas VFX
  kiểu NGUI 2 (`fx_rock`, `fx_water`) để ở `sprites`: `outer`/`inner` là Rect số thực và padding là **tỉ lệ**
  theo cỡ sprite (0,36 chứ không phải 36 px). `rip_ui.py` đổi về cùng dạng `[x,y,w,h, bl,br,bt,bb, pl,pr,pt,pb]`.
- Hai sprite cảnh gọi nhưng atlas không có: `GUIAtlas:window_blank` (Shop, Choose Amount) và
  `GUIAtlas:Battle_VS` (Team Preview). NGUI gốc cũng không vẽ gì ở đó.
- Vài sprite có `atlas: null` (`Bright`, `Stripes 1`, `Bar_Completion_Fill`, trong nút đang tắt): tham chiếu
  atlas gãy ngay trong bản gốc; `atlasRef` ghi tệp:pathID để soát. Tên sprite có trong `FantasyAtlas`/
  `WoodenAtlas`/`GUIAtlas`, mã game có thể gán lại atlas lúc chạy (đoán).

### Font

Mọi font NGUI của game là **font bitmap** (BMFont, `NGUIFont.mFont.mSaved`), glyph nằm trong atlas. Không có
nhãn nào dùng font động (`mTrueTypeFont` rỗng ở mọi UILabel).

| NGUIFont | Glyph ở | Số nhãn | Font web | Đậm | `k` |
|---|---|---|---|---|---|
| `Aldrich 16` (mSize 20) | GUIAtlas `Aldrich16B_0` | 443 | Aldrich | 400 | 0,878 |
| `AldrichLarge` (40) | GUIAtlas `AldrichLarge_0` | 5 | Aldrich | 400 | 0,840 |
| `Arial 15` (15) | GUIAtlas `ArialBold15_0` | 601 | Arimo | 700 | 0,781 |
| `Arial15NotBold` (15) | GUIAtlas `Arial13_0.png_0` | 10 | Arimo | 400 | 0,800 |
| `Arial 14` (14) | GUIAtlas `Arial14_0` | 11 | Arimo | 400 | 0,760 |
| `Arial11` (12) | GUIAtlas `Arial11_0` | 13 | Arimo | 400 | 0,775 |
| `Arimo14` (14) | WoodenAtlas `Arimo14` | 14 | Arimo | 400 | 0,913 |

- Arimo có số đo bề ngang trùng Arial nên thay cho Arial. Hai tệp ttf và giấy phép OFL ở `art/ui/fonts/`
  (tải từ `github.com/google/fonts`, `ofl/aldrich`, `ofl/arimo`).
- Cỡ CSS = `fontSize * k`. `k` khớp tổng advance của `A-Z a-z 0-9` giữa BMFont gốc và font web (Pillow đo ttf).
- **[BẪY ĐÃ SẬP]** Khớp theo chiều cao chữ H cho `k` lớn hơn ~35% với Arial. Glyph BMFont Arial có 1 px đệm mỗi
  bên (`offsetX = -1`), còn BMFont "Arial 14" thật ra là Arial em ~10,6 px đặt trên dòng 14 px. Chữ web vì thế
  tràn khung, tab "Pokéball" trong túi đồ bị xuống dòng. Khớp theo bề ngang thì hết.
- Ký hiệu nội dòng (`NGUIFont.mSymbols`) nằm ở `P1.UI_FONTS[font].sym`: `[PD]` → `12_Pokedollar`, `[Lv]` → `Icon_Lv`,
  `[F]`/`[M]` → biểu tượng giới tính, `[SHINY]`, `[MEGA]`... `ngui.js` vẽ thành ảnh nội dòng từ atlas.

## Dữ liệu ra

### `data/atlas.js`

Theo hợp đồng ARCH.md: `P1.ATLAS[tên] = { img, w, h, src, s: { sprite: [x,y,w,h, bl,br,bt,bb, pl,pr,pt,pb] }, groups? }`.

### `data/ui.js`

```js
P1.UI_ROOT      // UIRoot level2: { style:'flexible', manualWidth:1366, manualHeight:600, minimumHeight:700,
                //   maximumHeight:3000, fitWidth, fitHeight, adjustByDPI, shrinkPortraitUI, panel, title:{...level1} }
P1.UI_FONTS     // { 'Aldrich 16': { web, weight, bitmap:true, size, base, k, atlas, glyphs, sym } }
P1.UI_WEBFONTS  // { Aldrich: { file:'fonts/Aldrich-Regular.ttf' }, Arimo: {...} }
P1.UI           // { 'BattlePanel': nút, 'Panel - Inventory': nút, ..., 'title:Panel - Login': nút }
P1.UI_DRIVERS   // MonoBehaviour ngoài cây UI có trường trỏ vào cây: { InventoryHandler: {Grid:'Panel - Inventory/...'}, ... }
P1.UI_PREFABS   // { 'prefab:Inventory Item': nút, 'prefab:Button - Setting Slider': nút, ... }
```

Nút (thêm vào hợp đồng ARCH.md; trường vắng = giá trị mặc định):

| Trường | Nghĩa |
|---|---|
| `n`, `p`, `s`, `a` | tên, `localPosition` x,y, `localScale` x,y, `activeSelf` |
| `r` | quay quanh z (độ), chỉ khi khác 0 (hiện không nút nào quay) |
| `col` | GameObject có BoxCollider: NGUI chỉ nhận chuột ở đây, và nó chặn click xuyên xuống |
| `w` | widget: `kind` sprite/label/texture/widget, `size`, `pivot` (tên enum), `depth`, `color` (`#rrggbbaa`, vắng = trắng), `off:1` khi component tắt, `anc` |
| `w.anc` | `{ l,r,b,t: [đường dẫn đích, relative, absolute], up:'enable'|'update'|'start' }`. Đích `''` = GUI Root = cả màn |
| `w` sprite | `atlas`, `sprite`, `type` simple/sliced/tiled/filled/advanced, `fill:{dir,amt,inv}`, `flip`, `center:false` |
| `w` texture | `tex` (`art/ui/tex/*.png`, hoặc `rt:<tên>` = RenderTexture mã game vẽ vào), `uv`, `border` |
| `w` label | `text` (BBCode NGUI), `font`, `fontSize`, `align` auto/left/center/right/justified, `overflow` shrink/clamp/resizeFreely/resizeHeight, `effect:{style shadow/outline/outline8, color, dist}`, `spacing`, `maxLines`, `grad` |
| `pn` | UIPanel: `depth`, `clip` none/soft/texture/constrain, `range` [cx,cy,w,h], `soft`, `off` (clipOffset), `alpha`, `anc` |
| `b` | UIButton: `target` (tweenTarget), `hover`, `pressed`, `disabled`, `dur`, `hoverSprite`..., `onClick` ['đường dẫn.Hàm'] |
| `g` | UIGrid: `arr` h/v/snap, `cw`, `ch`, `max`, `pivot`, `hide`, `sort` |
| `t` | UITable (trường gốc) |
| `x` | điều khiển NGUI khác: `UIToggle`, `UISlider`, `UIScrollBar`, `UIPopupList`, `UIInput`, `UIScrollView`, `UIPlayTween` |
| `tw` | tween: `{kind, from, to, dur, delay, style, group, on}` |
| `mb` | MonoBehaviour của game trên nút, trường đã đổi tham chiếu thành đường dẫn nút |
| `c` | con |

- **[ĐO TRONG REPO]** Enum `UILabel.Overflow` của bản này là ShrinkContent=0, ClampContent=1, **ResizeFreely=2,
  ResizeHeight=3** (ngược thứ tự tài liệu NGUI cũ). Mọi enum lấy từ `dump.cs`.
- Đường dẫn nút = tên nối bằng `/`, bắt đầu bằng khoá panel (`BattlePanel/Battle Window/FoeHealth`). Trong prefab
  bắt đầu bằng `prefab:<tên>`. Tham chiếu ra ngoài cây UI ghi `#<tên GameObject>`.
- Kích thước `data/ui.js`: ~1,4 MB (gzip trên Pages ~150 KB, đoán theo tỉ lệ JSON thường gặp).

## `js/ngui.js`

```js
P1.ngui.base = '';                                  // tiền tố tới games/pokeone/ (viewer đặt '../')
const ui = P1.ngui.build('BattlePanel', hostEl, { active, play, resize, virtualHeight, onClick });
ui.find('Battle Window/FoeHealth')                  // nút theo tên hoặc đuôi đường dẫn
ui.label(path, 'Pidgey [F]'); ui.sprite(path, 'Icon_Status_Burn'); ui.color(path, '#ff0000ff');
ui.show(path, true); ui.fill(path, 0.5); ui.value(sliderPath, 0.3); ui.enable(buttonPath, false);
ui.offset(path, dx, dy);                            // dịch thêm sau anchor (trượt thanh máu vào)
ui.texture(path, 'art/item/5.png');                 // đổi ảnh UITexture (icon vật phẩm, chân dung)
ui.scroll(clipPanelPath, dx, dy);                   // cuộn panel clip như UIScrollView (lăn chuột tự gọi)
ui.on(path, (node, ev) => ...);                     // click
ui.add(parentPath, 'prefab:Inventory Item', 'item3'); ui.remove(path);
ui.refresh(); ui.destroy(); await P1.ngui.ready();  // ready: font + ảnh đã tải
```

- Tỉ lệ như UIRoot Flexible: chiều cao ảo = chiều cao khung kẹp trong [700, 3000], nên ở 1280×720 một đơn vị
  NGUI = 1 px, ở 844×390 là 390/700 = 0,557 px. Bề ngang ảo = cao ảo × tỉ lệ khung.
- Bố cục làm lại đúng mã NGUI: ma trận transform 2D, anchor (`UIWidget.OnAnchor`, `UIPanel.OnAnchor` cho vùng
  clip), `UIGrid.ResetPosition`, `UITable.RepositionVariableSize`. Chạy hai lượt để anchor trỏ tới nút đứng sau
  cũng khớp.
- Thứ tự vẽ: mỗi UIPanel là một lớp DOM (`z-index` theo depth panel, panel con nằm trong panel cha để cắt clip
  chồng nhau), widget trong lớp xếp theo depth. Alpha panel = `opacity` lớp; alpha widget nhân dồn theo widget cha.
- Sprite và texture vẽ vào `<canvas>` riêng: simple, sliced (9 mảnh, `center:false` bỏ ô giữa), tiled, filled
  (ngang, dọc, radial), lật, trừ padding như `UISprite.drawingDimensions`, tô màu kiểu nhân màu đỉnh.
  Không dùng `border-image`/`background-position` như định hướng ban đầu vì CSS không nhân màu (tint) được lên
  ảnh, và `border-image` không cắt được một ô con trong atlas. Ký hiệu nội dòng trong chữ thì vẫn dùng
  `background-position`.
- Chữ là DOM: font web theo `P1.UI_FONTS`, căn theo pivot và `align`, `text-shadow` cho shadow/outline/outline8,
  ShrinkContent co cỡ tới khi vừa, BBCode `[rrggbb]`, `[-]`, `[b]`, `[i]`, `[u]`, `[s]`, ký hiệu font.
- Nút có collider nhận chuột: hover/pressed đổi màu hoặc sprite của `tweenTarget` như UIButton; UIToggle bật tắt
  `activeSprite`, có nhóm radio.
- Panel đang đóng có TweenAlpha 0→1 (ví dụ `Panel - Inventory` lưu alpha 0): `build` lấy giá trị cuối (`play:false` để giữ nguyên).

## Danh mục panel

Đo từ `data/ui.js` (`mb`, `P1.UI_DRIVERS`), `data/atlas.js` và `dump.cs` (số dòng là dòng trong `D:\pokeone-ref\il2cpp\dump.cs`).
Chỗ không có bằng chứng trực tiếp ghi **(đoán)**. Mở từng panel trong `ui-viewer.html` để nhìn.

### 1. Battle HUD (HUD chiến đấu) [ĐO TRONG REPO]

- Gốc: `P1.UI['BattlePanel']` (12 node con, `a:false` — panel ẩn ngoài trận). Có bản sao `P1.UI_PREFABS['prefab:BattlePanel']` (cũng 12 con, không đào sâu — có vẻ là bản gốc của prefab trước khi đặt vào scene).
- Component gắn thẳng trên node `BattlePanel`: `mb.BattleHandler` và `mb.BattleKeyHandler` (UIPanel + BattleHandler + TweenAlpha + Rigidbody + BattleKeyHandler theo outline).

#### Thanh máu địch/ta
- `BattlePanel/Battle Window/FoeHealth` (và bản sao `FoeHealth (1)`, `FoeHealth (2)` cho trận 3v3) — widget nền `sprite:Bg_HPBar` (type `simple`), có `mb.HealthBar`.
- Con của `FoeHealth`:
  - `lblPokemonname` — label, text mặc định `"[*]Charizard"` → tên Pokémon. `[*]` là ký hiệu font (`NGUIFont.mSymbols`), với `Arial 15` nó vẽ sprite `Shiny2`; `[F]`/`[M]` là biểu tượng giới tính, `[Lv]` là chữ "Lv." vàng.
  - `Healthbar` — sprite `atlas:GUIAtlas sprite:Fill_HPBar`, `type:"sliced"` (9-slice, KHÔNG phải `filled`/fillAmount) → thanh máu hiện tại co giãn bằng cách đổi **width** của sprite sliced, khớp với field `HealthBar.spriteHealthBar` (UISprite) và `HealthBar.OldSpriteTween` kiểu `TweenWidth` trong dump.cs.
  - `Healthbar Old` — sprite `Fill_HPBar_White`, màu tint `#c56564ff`, cũng `type:"sliced"` → thanh máu "cũ" chạy chậm lại phía sau để hiện lượng máu vừa mất (hiệu ứng thường thấy ở game Pokémon).
  - `Label - Level` — label font `Arial 15`, text mặc định `"[Lv]100"` → hiển thị cấp độ.
  - `Sprite - Status` — sprite atlas GUIAtlas, sprite mặc định `Icon_Status_Frozen` → icon trạng thái bất thường (đổi tên sprite lúc chạy).
  - `Label - HP` — label text mặc định `"100%"` (bên `FoeHealth`) hoặc `"40/40"` (bên `User Health Bar`) → HP dạng % cho địch, dạng số/số cho phe ta.
  - `Sprite - Caught` — sprite `pdex_list_pokeball` → icon đã bắt được loài này chưa (Pokédex owned marker) hiện trên thanh máu địch.
  - `Arrow` (inactive) — sprite `SelectedPokemon` (địch) / `SelectedEnemyPokemon` (phe ta) → mũi tên chỉ Pokémon đang được chọn làm mục tiêu.
  - `Hazard - Enemy` / `Hazard - Player` — grid chứa `Toxic Spikes`, `Spikes`, `Sticky Web`, `Stealth Rock` (texture + `Counter` label `"x3"`) → icon bẫy sân (hazards) kèm số lớp.
- `Battle Window/Foe Pokes/Grid` và `User Balls/Grid` — grid các `Sprite - Ball` dùng sprite `Icon_Pokemon_Alive` / `Icon_Pokemon_Dead` (atlas GUIAtlas có thêm `Icon_Pokemon_Empty`) → hàng bóng nhỏ hiển thị đội hình còn sống/ngất, giống dãy quả bóng trong game Pokémon chính hãng.
- Sprite trạng thái có đúng 7 icon trong `GUIAtlas.s`: `Icon_Status_BadlyPoisoned, Icon_Status_Burn, Icon_Status_Fainted, Icon_Status_Frozen, Icon_Status_Paralyzed, Icon_Status_Poisoned, Icon_Status_Sleep` — game phải tự chọn 1 trong 7 tên này để gán vào `Sprite - Status` lúc chạy.

#### Nút Fight / Bag / Pokémon / Run
- Con trực tiếp của `BattlePanel`: `Button - Attack` (`b->BattlePanel.OpenCloseAttacks`, sprite `Btn_Fight`, label `"Fight"`), `Button - Run` (`b->BattlePanel.GetRP`, sprite `Btn_Run`), `Button - Items` (`b->BattlePanel.OpenCloseItemsWindow`, sprite `Btn_Bag`), `Button - Pokemon` (`b->BattlePanel.OpenClosePokemonWindow`, sprite `Btn_PKMN`).
- `Button - Attack/Button - Shift` (inactive) — `b->BattlePanel.SendShift`, sprite `Icon_Swap` → nút đổi chỗ Pokémon (shift) trong đội hình nhiều-vs-nhiều.
- `Button - Attack/Button - Back` — `b->BattlePanel.CancelAttack`.
- `BattleHandler.ChoiceButtons` (field) = đúng 5 node trên: `Button - Pokemon, Button - Items, Button - Run, Button - Attack, Button - Attack/Button - Shift`.
- `BattleHandler.BackButton = "BattlePanel/Button - Attack/Button - Back"`.

#### Ô chọn chiêu (move buttons) + màu hệ
- Danh sách 4 nút chính: `Attacks/Attacks/Button - Attack 1..4` (mỗi cái có `mb.AttackButton` + `mb.ButtonHighlight`), và bản mở rộng (double battle) `Attacks/Button - Attack 1..2, Button - Attack (3)..(8)` — field `BattleHandler.AttackButtons` liệt kê đủ 8 đường dẫn này.
- Mỗi nút `AttackButton` (theo `mb`/dump.cs) có field: `lblMoveName`, `lblPP` (text mẫu `"24/24"`), và ở bản mở rộng còn có `lblType` + `spriteType` (`Sprite - Type` inactive, sprite placeholder `Bright`) — placeholder `Bright` là ô màu trơn, KHÔNG phải icon hệ riêng.
- **Màu hệ không lấy theo tên sprite mà lấy theo field `BattleHandler.TypeColours` (`Color[]`, đã đo đủ 18 màu hex trong `mb.BattleHandler.TypeColours`)**:
  `#a8a878, #c03028, #a890f0, #a040a0, #e0c068, #b8a038, #a8b820, #705898, #b8b8d0, #f08030, #6890f0, #78c850, #ffed00, #f85888, #98d8d8, #7038f8, #705848, #ee99ac` (18 giá trị, ff alpha).
  Thứ tự khớp đúng bảng màu hệ chuẩn phổ biến `Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel, Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark, Fairy` — **(đoán thứ tự index↔tên hệ, vì export không có enum tên, chỉ có mảng màu)**. Game phải tự tint `Sprite - Type`/label theo index hệ của chiêu.
- Ngược lại, trong tooltip mô tả chiêu (`Widget - Mouse Over Move`, `mb.BattleMoveDescription`) và trong prefab `prefab:Sprite - Move` (danh sách chiêu ở nơi khác), field `Sprite - Type`/`Sprite - Move Type` dùng **icon hệ thật theo tên hệ viết thường**: placeholder đo được là `fire` (trong `prefab:Sprite - Move`) — và `atlas.js` xác nhận `GUIAtlas.s` có đủ 18 sprite tên hệ viết thường: `normal, fire, water, electric, grass, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy`. Vậy **có 2 cơ chế khác nhau cùng tồn tại**: ô chọn chiêu trong trận = tint theo `TypeColours`; danh sách chiêu/tooltip/summary = đổi tên sprite icon hệ.
- Loại đòn (vật lý/đặc biệt): sprite `Sprite - Move Damage Type` / `Sprite - Move Type` dùng 2 sprite có thật trong atlas: `physical`, `special` (không thấy sprite "status" riêng — **(đoán)** đòn hệ trạng thái dùng lại 1 trong 2 sprite này hoặc ẩn icon).
- `BattlePanel/Attacks/Mega Button` (sprite `Btn_MegaEvolution`, có `x.UIToggle`) và `BattlePanel/Attacks/Z Moves` (`b->BattlePanel.ToggleAttacks`) → nút Mega Evolution và Z-Move.
- `Button - Rotate Left/Right` (`b->BattlePanel.RotateBattleLeft/RotateBattleRight`) → xoay vị trí Pokémon trong trận nhiều-vs-nhiều.

#### Panel chọn Pokémon để đổi (switch) và chọn mục tiêu
- `BattlePanel/Battle Screen Panel/Battle Pokemon` — cửa sổ "Select Pokémon" gồm `Grid/Button - Pokemon` × 6 (`mb.SwitchButton` + `mb.ButtonHighlight`). Mỗi nút có `Content/Label - Name` (mẫu `"Pokemon [M]"`), `Sprite - Health Back`/`Sprite - Health` (sprite `Battle_bar_hp_fill`), `Label - Level`, `Sprite - Status` (placeholder `freeze`), `Label - Health` (mẫu `"100/100"`).
  - `SwitchButton` (dump.cs) field: `lblPokemonName, lblPokemonLevel, lblPokemonHP, spriteStatus, spriteHP, battleHandler, ID`; method thấy được: `OnClick`, `Press`.
- `BattlePanel/Battle Screen Panel/Battle Select Move` — cửa sổ "Select Move" (dùng khi chọn hộ chiêu cho Pokémon vừa đổi vào): `Content/Button - Select Move 1..4` (`mb.ClickBattleMove`, label `"Move Name\nPP 10/10"`).
  - `ClickBattleMove` field: `PokeID, ItemID, MoveID`; method: `OnClick`.
- `BattlePanel/Select Target` — sprite `Bg_Window` + label `"Select a Target"` → banner chọn mục tiêu khi có nhiều đối thủ.

#### Catch / Pokéball
- `BattlePanel/Battle Screen Panel/Battle Items` — cửa sổ túi đồ trong trận, có 6 tab: `Tab - General, Tab - Pokeball, Tab - Medicine, Tab - TM, Tab - Berries, Tab - Hold` (field `BattleHandler.BattleInventoryButtons` liệt kê đủ 6 path này) + `Sprite - Search/Input - Search` + `Sprite - Background/Panel - Inventory Items/Grid` (field `BattleHandler.BattleItemGrid`, rỗng lúc export, được nạp prefab item lúc chạy).
- **Không tìm thấy** node nào trong export gắn component `PokeballClick` bên trong `BattlePanel` — bắt Pokémon trong trận thực chất đi qua việc chọn item ở tab `Tab - Pokeball` rồi gọi `BattleHandler.SelectPokeballTarget(int itemID)` / `SendItemPacket(..., pokeball:true)` (thấy tên method trong dump.cs), không có UI ném bóng riêng.
- `PokeballClick` (dump.cs, field `ID`, `_PartyFrame: PartyFrame`) thật ra được dùng ở **prefab:Party Member** (6 icon bóng của thành viên nhóm chơi chung, xem mục 2) — **không phải** UI bắt Pokémon; đây là điểm dễ nhầm nếu chỉ nhìn tên class.

#### BattleHandler — field đáng chú ý khác (từ `mb.BattleHandler`, đối chiếu dump.cs)
- `HealthBars` (6 path), `LevelLabels` (6), `StatusLabels` (6), `OpponentTeamBalls`/`TeamBalls` (mỗi bên tới 18 slot — hỗ trợ trận 6v6 nhiều Pokémon dự bị), `PrefabFieldPokemon: "prefab:3DPokemonPrefab"`, `AttackEffects: ["prefab:Default Hit"]`, `BattleTimerLength: 90`, `BattleTimer -> Progress Bar - Timer` (sprite `Bar_Completion_Fill`).
- Method public thấy trong `dump.cs` (`BattleHandler`, dòng 223239): `ShowMoves(inventoryItem item, int pokeID)`, `HideMoves()`, `OpenCloseAttacks()`, `OpenClosePokemonWindow(bool)`, `OpenCloseItemsWindow()`, `SendMoveSelection(int,int)`, `SelectAttack(string,int)`, `SendAttack(string)`, `SwitchPokemon(int)`, `SendRunPacket(string)`, `SendItemPacket(...)`, `SelectItemTarget(...)`, `SelectPokeballTarget(int)`, `UpdateGUI(bool)`, `ChangeHealth(...)` (IEnumerator), `GetHealth`, `GetMaxHealth`, `RotateBattleLeft/Right`, `ToggleAttacks`, `CancelAttack`.
- `HealthBar` (dump.cs, dòng 225064) field: `lblName, Arrow, SelectTween, spriteHealthBar, spriteHealthBarOld, CurrentHP, MaxHP, lblHP, lblOHP, Caught, OldSpriteTween`; method thấy được: `OnPress, OnTooltip, Start, Update, Finish` — **không có method `SetHP` riêng**, việc đổi máu do `BattleHandler.ChangeHealth` điều khiển trực tiếp.
- `AttackButton` (dump.cs, dòng 223180) field: `lblMoveName, lblPP, lblType, spriteType, OverridePower, OverrideType, move, ID, battleHandler, moveDesc`; method: `Press, OnClick, Hover, OnHover, OnPress`.
- `BattleKeyHandler` (dòng 227160) — điều hướng nút bằng bàn phím, field `DefaultAttackButtons[4], DefaultMenuButton, PokemonButtons[6]`; dùng chung class `ButtonHighlight` (field `UpSelect/DownSelect/LeftSelect/RightSelect/...` để build lưới điều hướng phím).

---

### 2. Party (Nhóm nhiều người + HUD 6 Pokémon tại chỗ) [ĐO TRONG REPO]

**Lưu ý quan trọng:** trong export này, "Party" (`PartyHandler`, `prefab:Party Member`) là **nhóm chơi chung nhiều người** (co-op party, giống MMO), KHÔNG phải đội hình 6 Pokémon. Đội hình 6 Pokémon tại chỗ là **HUD Pokemon** dưới đây.

#### HUD Pokémon tại chỗ (world HUD, luôn hiện góc dưới)
- Đường dẫn: `Panel - Game GUI/Container - Hide/HUD Pokemon/Table/Button - Pokemon` (và 5 bản sao `Button - Pokemon (1)`..`(5)`) — mỗi cái là `mb.PokemonHUDButton`, sprite nền `Btn_Generic_Normal`.
- Con `Sprite - Pokemon` (`mb.HUDPokemon`, sprite `Btn_Pokemon_Normal`):
  - `Sprite - EXP` / `Sprite - EXP Dark` — sprite `Bar_PokemonEXP` (2 lớp sáng/tối, chuẩn kiểu thanh EXP 2 tông của Pokémon).
  - `Sprite - Health` — sprite `Bar_PokemonHP` → thanh máu thu nhỏ.
  - `Sprite - Status` — sprite mặc định `psn` (khác với tên `Icon_Status_*` bên Battle HUD — **(đoán)** đây là quy ước rút gọn 3 chữ cái khác, chỉ thấy `psn` tồn tại thật trong atlas, chưa xác nhận có đủ bộ `brn/par/slp/frz/tox/fnt` dạng rút gọn).
  - `Label - Name` — text mẫu `"[Shiny]Charizard"`; `Label - Level` — text mẫu `"Lv100"`.
  - `Sprite - item` — sprite `HUD_pokemon_item` → icon vật cầm (held item), chỉ hiện khi Pokémon đang cầm đồ.
  - `Texture - Poke` — texture chân dung Pokémon.
  - `HUDPokemon` (dump.cs, dòng 228656) field: `Sprite, Sprites[], PokemonTexture, LevelLabel, PokemonInfo, Button, PkmnName, Position, canScrollEXP`; method: `Setup(PokemonHandler.cPkmn pkmn)`, `SplashEXPGain(int amount)` (IEnumerator — hiệu ứng EXP tăng dần khi thắng trận).
  - `PokemonHUDButton : UIDragDropItem` (dòng 233279) — cho phép kéo-thả đổi vị trí Pokémon trong đội hình; field `Position, Box, Guid`; method `OnClick, OnDragDropStart, OnDragDropEnd`.
- **Driver bên ngoài bơm dữ liệu vào HUD này là `PokemonHandler`** (`P1.UI_DRIVERS.PokemonHandler`, dump.cs dòng 232640), KHÔNG phải `PartyHandler`: field `HudPokemonButton[]` trỏ đúng 6 node `Button - Pokemon`, field `HudPokemon[]` trỏ đúng 6 node con `Sprite - Pokemon`. `PokemonHandler` còn có field `Pokeballs[]` (kiểu `UISprite[]`) trỏ tới 6 node **`Panel - Game GUI/Container - Hide/Player Information/Sprite - Pokeball`..`(5)`** — 6 icon Poké Ball nhỏ nằm cạnh tên/EXP bar của chính người chơi (khác `Grid - Party Members` và khác 6 `Button - Pokemon`), thể hiện nhanh tình trạng sống/ngất của đúng 6 Pokémon trong đội hình bản thân. Method đáng chú ý khác của `PokemonHandler`: `HandlePokemonData(PokemonData p)`, `HandleInventoryPokemon(InventoryPokemon r, bool update)`, `UpdateActivePokemon()`, `UpdateGUI()`, `HandleLearn(Learn r)`, `Reorder(Reorder r)`, `HandleRelease(Release r)`, `HandleEVPokemon(Evs r)`, `HandleIVPokemon(Ivs r)`, `TransferPokemon(int toBox, Guid guid)`.

#### Nhóm chơi chung (multiplayer party)
- `Panel - Game GUI/Container - Hide/Player Information/Grid - Party Members` — UIGrid rỗng lúc export (`arr:"v", cw:200, ch:74`), được `PartyHandler` bơm prefab `prefab:Party Member` vào lúc chạy (field `PartyHandler.FramePrefab = "prefab:Party Member"`, `Grid`/`Parent` cùng trỏ vào node này).
- `prefab:Party Member` — node `Party Frame` (`mb.PartyFrame`, sprite `Bg_Hud`): `Label - Username`, `Label - Level` (mẫu `"Lv 5"`), `Sprite - Exp Bar Dark` (`Bar_Empty`), `Texture - Body/Clothes/Hair/Hat` (`mb.GUICharacter` — render nhân vật), 6× `Sprite - Pokeball` (sprite mặc định `Icon_Pokemon_Empty`, mỗi cái `mb.PokeballClick`) → 6 ô tròn thể hiện đội hình của thành viên nhóm (rỗng/sống/ngất theo icon), `Sprite - Crown` (`crown2`) → biểu tượng trưởng nhóm.
- `PartyFrame` (dump.cs, dòng 231188) field: `Username, Crown, Level, Pokeballs[], Pokemons(List<Guid>), Char, OfflineColour`; method: `UpdatePokemon(List<Guid>)`, `Setup(username, pokemons, leader, online, level)`, `OnClick`, `ViewPokemon(int ID)`.
- `PartyHandler` (dòng 231218) — đúng nghĩa nhóm nhiều người chơi: method `HandleParty(Party p)`, `HandlePartyPokemon`, `HandlePartyRemove`, `LeaveParty(string)`, `Invite(string)`, `KickUser(string)`, `PromoteUser(string)`, `UserInParty(string)`.
- `PokeballClick` (dòng 231828) field `ID, _PartyFrame`; method `OnPress` → bấm vào 1 trong 6 ô bóng của `Party Member` để xem/chọn Pokémon đó của thành viên nhóm.

#### Cửa sổ chọn Pokémon / học chiêu ngoài trận
- `P1.UI['Panel - Select Pokemon']` — popup dùng chung "Choose a Pokemon" (`Window/PokeButton` × 6, `mb.ButtonClick`, texture chân dung) + "Choose a Move" (`MovesWindow/MoveButton` × 4, label mẫu `"Move Name\nPP 10/10"`). Driver `SelectPokemonHandler` (`P1.UI_DRIVERS`) có field `PokemonButtons[6], MoveButtons[4], MoveLabels[4], CancelButton`.
- `Panel - Team Prievew` (giữ nguyên lỗi chính tả gốc) — màn hình xếp đội trước trận PVP nhiều người: `Content/Sprite - Player (0..5)/Team Preview - Team Mate` (`mb.TeammatePreview`) mỗi cái có `Grid/Pokemon (0..5)` (`mb.ClickTeamPoke`, sprite `Btn_PokemonCircle_Hover`), `Texture - Body` (`mb.GUICharacter`), `Label - Username`, `Label - Guild`. Driver `TeamPreviewHandler`: `Members1[3]/Members2[3]` (2 đội 3 người), `TimeLabel, TypeLabel, Accept, ChoiceLabel`, và field `HideWidgets` trỏ tới `Panel - Game GUI/Container - Hide`, `Widget - Hidden During Battle Or Script`, `Panel - Cooldowns/Hot Bar and Cooldowns`, `Panel - Game GUI/Button - Quests` → xác nhận các HUD này bị ẩn khi vào Team Preview/trận đấu.

#### Panel tóm tắt Pokémon (`prefab:Panel - Pokemon Card`) — "Party summary window"
- Node gốc `Panel - Pokemon Card` (`mb.PokemonCard`), có 4 tab: `Tab - Info, Tab - Move, Tab - IV, Tab - EV`.
- `Sprite - Info Overlay` (luôn hiện, mọi tab): `Texture - Pokeball`, `Label - Pokemon Name` (mẫu `"Charizard"`), `Label - Pokemon Level` (mẫu `"[M] [Lv] 100"`), `Sprite - Type`/`Sprite - Type 2` (placeholder `rock` — icon hệ thật, xem cơ chế ở mục 1), `Label - Exp`, `Sprite - Status` (placeholder `freeze`), `Sprite - Held Item` (`b->...RemoveItem`).
- Tab **Info** (`Pokemon Information`): 3 thanh `Sprite - Bar` kiểu `Bar_Completion`/`Bar_White` cho `HP`, `EXP`, `Happiness`; các dòng text `Original Trainer`, `Ability`, `Nature`, `Caught Date`, `Caught Level`; `Label - Egg` (dòng chữ trứng chưa nở).
- Tab **Moves** (`Pokemon Moves`) — chỉ có `Grid` rỗng, item chiêu bơm lúc chạy (không thấy prefab item chiêu riêng cho tab này trong export — **(đoán)** dùng lại `prefab:Sprite - Move`).
- Tab **IVs** — 6 dòng `HP/Attack/Defense/Sp. Atk/Sp. Def/Speed` mỗi dòng có `x.UIToggle` (khoá IV) + `Sprite - Lock`; `Button - Reset IV`.
- Tab **EVs** — 6 dòng tương tự với nút `Button - Add`/`Button - Take` mỗi stat (`b->...AddEV_HP/TakeEV_HP/...`, đủ 6 cặp cho HP/ATK/DEF/SPATK/SPDEF/SPD), `Label - Total EVs` (mẫu `"(Total: 510/510)"`), `Button - Confirm EV`.
- `Texture - Pokemon` (`mb.RotateOnDrag`) → mô hình xoay được bằng kéo chuột; `Texture - Pokemon 2D` phụ.
- `PokemonCard` (dump.cs, dòng 232484) field khớp gần hết UI trên: `TabButtons[], Bars[], InfoLabels[], StatLabels[], EVLabels[], IVLabels[], Sprites[], PokemonTexture, PokemonTexture2D, LockIVToggle[], AddButton[], TakeButton[]`; method: `ClickTab(int)`, `Setup(PokemonHandler.cPkmn)`, `RemoveItem()`, `ResetIVs()`, `ResetEVs()`, `AddEV_HP/ATK/DEF/SPATK/SPDEF/SPD()`, `TakeEV_HP/ATK/DEF/SPATK/SPDEF/SPD()`.

---

### 3. Bag / Inventory [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Inventory']`. 6 tab lọc theo loại: `Tab - General, Tab - Pokeball, Tab - Medicine, Tab - TM, Tab - Berries, Tab - Hold` (label tab lần lượt `General/Pokéball/Medicine/TM-HM/Berries/Hold`).
- `Sprite - Search/Input - Search` — ô tìm kiếm tên vật phẩm.
- `Sprite - Background/Panel - Inventory Items/Grid` — grid rỗng lúc export, field `InventoryHandler.InventoryGrid` trỏ đúng vào đây; bơm prefab item lúc chạy.
- `Sprite - BG Currency` ×2 — `Label - Money` (icon `12_Pokedollar`) và `Label - Gold` (icon `12_PokeGold`) → 2 loại tiền: Pokédollar và Poké Gold (tiền nạp).
- `prefab:Inventory Item` (`mb.InventoryButton`) — `Sprite/Sprite/Texture - Icon` (icon vật phẩm), `Label - Name`, `Label - QTY` (mẫu `"x1"`).
- `prefab:Inventory Item - Clone` — bản rút gọn chỉ có `Texture - Icon` (`mb.InventoryButton`), dùng khi kéo-thả 1 icon rời khỏi lưới (ghost khi drag).
- Driver `InventoryHandler` (`P1.UI_DRIVERS`): field `MoneyLabel, GoldLabel, ShopMoneyLabel, ShopGoldLabel` (2 field cuối trỏ sang label tiền của **Panel - Shop**, cho biết Inventory và Shop cùng đồng bộ hiển thị số dư), `TabButtons[6], SearchInput, InventoryGrid, InventoryPanel, PopupPrefab: "prefab:Popup Message - No Item", PopupPrefabItem: "prefab:Popup Message - Item", PopupGrid` (trỏ vào `Panel - Game GUI/Container - Hide/Player Information/Grid - Popup Messages` — popup nhặt đồ hiện trên đầu nhân vật).
- `InventoryButton : UIDragDropItem` (dump.cs, dòng 228729) field: `nameLabel, qauntityLabel, ID, iconTexture, BorderSprite, HoverColours[]`; method: `Setup(inventoryItem)`, `OnDragDropStart/End`, `OnClick`, `OnHover`.
- `InventoryHandler` (dòng 228773) method đáng chú ý: `LoadInventory(Inventory inv)`, `HandleInventoryPacket(InventoryItem p)`, `ChangeInventory(int slot)` (đổi tab), `SearchUpdate()`, `UseItem(...)` (nhiều overload), `HoldItem(...)`, `ShowPopupMessage(string, int itemid, bool showInChat)`, `SetMoney(Money m)`, `ItemCount(int id)`, `ResetBattleInventory(UIGrid, BattleHandler)` (dùng lại lưới Inventory cho tab Items trong trận, xem mục 1).
- Vật phẩm dùng texture icon rời (`iconTexture`/`Texture - Icon`), tên texture không nằm trong `GUIAtlas` (dùng atlas/texture riêng theo item ID) → **(đoán)** game phải tự nạp texture icon theo ID vật phẩm lúc chạy, không lấy từ `GUIAtlas.s`.

---

### 4. Pokédex [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Pokedex']`.
- Cột trái: `Checkbox - Hide Unseen`, `Pokemons` (grid rỗng — chứa nút loài, bơm `prefab:DexPokemon`), `Input - Search`.
- 2 counter trên đầu: `Sprite - Seen` (icon `Icon_Seen`, `Label - Scene` — tên field bị gõ sai chính tả trong file gốc, đúng ra là "Seen") và `Sprite - Caught` (icon `Icon_Caught`, `Label - Caught`).
- Khối thông tin loài (`Content/Information`):
  - `EV Yeild/Label - EV ATK/DEF/SPATK/SPDEF/SPD/HP` — 6 label EV yield của loài.
  - `Base Stat Chart/StatChart` (`mb.ShowTip`) — 6 label `Sp ATK/ATK/HP/SPD/SPDEF/DEF` (mẫu giá trị `100`) vẽ trên `Chart Texture` → biểu đồ lục giác stat.
  - `Pokemon View/Sprite/Types`×2 (placeholder `rock` — icon hệ 1 và hệ 2), `Label - Pokemon Name` (mẫu `"#6 Charizard"`), `Pokemon Species Type` (mẫu `"Flame Pokemon"`), `Genders` (`Sprite pdex_info_gender_bar_bg` nền + `GenderMale: pdex_info_gender_bar_fill` thanh tỉ lệ giới tính, cộng 2 icon tĩnh `icon_female`/`icon_male`), `Label - Weight / Height`.
  - Tab `Tab - Description` / `Tab - Moves` / `Tab - Locations` (3 tab con).
  - `Content - Description/Description` — mô tả Pokédex dạng văn xuôi.
  - `Content - Moves` — `Panel - Pokedex Moves/Grid - Pokedex Moves` (rỗng, bơm `prefab:Pokedex Move`/`prefab:Pokedex Move 1`), cộng `Widget - Mouse Over Description` (`mb.BattleMoveDescription`, dùng lại đúng script tooltip chiêu của Battle HUD) và 3 khối `Label - Ability Title/Description` (khả năng thường 1, khả năng thường 2, khả năng ẩn — placeholder cả 3 đều là "Sheer Force/Ash-Greninja" do copy mẫu).
- `prefab:DexPokemon` (`mb.PokedexPoke`, `b->...SelectPoke`) — `Label` (mã số 3 chữ số, mẫu `"001"`), `Texture` (ảnh loài), `Highlight` (viền chọn), `Caught` (icon `Icon_CaughtMarker`).
- `prefab:Pokedex Move` / `prefab:Pokedex Move 1` (đều `mb.PoxedexMove` — tên class gõ sai chính tả trong code gốc "Poxedex") — `Label - Move Name` (mẫu `"Level 32 - Fire Blast"` / `"Title Text"`) trên nền `Bar_Completion_Brighter` / `Bar_Completion` → 2 biến thể (dòng chẵn/lẻ hoặc học được/tutor?) của 1 dòng danh sách chiêu học được.
- Driver `PokedexHandler` field: `Labels[], Chart, ChartTip, Search, Scrollbar, ShowSeen, MaleRatio, TypeSprites, PokeButtonPrefab, SeenLabel, CaughtLabel, Tabs[], gridMoves, scrollviewMoves, moveDescription, MaxPokeButtons, Grid, AbilityLabels[], TabsButton[], PokemonViewer, PokemonTexture3D, FormGrid, FormButtonPrefab` (có field `FormGrid`/`FormButtonPrefab` riêng → hỗ trợ chọn form/biến thể loài, ví dụ Alola/Mega).
- `PokedexHandler` (dump.cs, dòng 232074) method: `HandleDexPacket(Pokedex p)`, `SelectPoke(int ID)`, `ShowPokemon(int ID, string form, FormButton button)`, `ClickDescription/ClickMoves/ClickShowOnMap`, `HasSeen(int id)`, `HasCaught(int id)`, `UpdateSearch()`.
- `PokedexPoke` (dòng 232042) field `Number, Pokemon, Caught`; method `Setup(bool Evo, int Seen, int ID)`, `SelectPoke()`.
- Icon hệ dùng đúng cơ chế "đổi tên sprite theo tên hệ viết thường" đã xác nhận ở mục 1 (`GUIAtlas.s` có đủ `normal/fire/water/electric/grass/ice/fighting/poison/ground/flying/psychic/bug/rock/ghost/dragon/dark/steel/fairy`).

---

### 5. Trainer Card / Character (thẻ huấn luyện viên) [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Trainer Card']`. Driver là `StatHandler` (không phải class tên "TrainerCard...") — xác nhận bằng cách so field của `StatHandler` trong `P1.UI_DRIVERS` khớp 100% các path bên trong panel này.
- `Toggle - Private` (`b->#Handlers.TogglePrivacy`) → ẩn/hiện thẻ với người khác.
- `Sprite - Badges` — 3 hàng huy hiệu vùng: `Sprite - Badges Kanto` (8 icon `Icon_Badge_Kanto_Boulder...Earth`), `Sprite - Badges Johto` (8 icon `Icon_Badge_Johto_Zephyr...Rising`), `Sprite - Badges Unova` (8 icon `Icon_Badge_Unova_Trio...Legend`) + 2 label rỗng cho `Sinnoh:` (chưa có sprite huy hiệu tương ứng trong export này).
- `Sprite - Player Stand` — `Texture - Body/Clothes/Hair/Hat` (`mb.GUICharacter`) render nhân vật, `Sprite - Online Status`.
- `Sprite - Username` — `Label - Username`, `Label - Guild Name`, `Texture - Guild Logo`.
- `Sprite - Stats Background` — `Label - Titles` (cột nhãn, `mb.UITextList`) liệt kê đúng các dòng: `Play Time:, Steps Taken:, Times Fainted:, Pokémon Caught:, Level Ups:, Wild Encounters:, Poké Balls Thrown:, Pokédex Seen:, Pokédex Caught:, Achievement Points:, (dòng trống), Current Region:, Kanto Level:, Johto Level:, (dòng trống), PvP Wins:, PvP Losses:` ghép cột với `Label - Values` (`mb.UITextList` tương ứng) → đây là toàn bộ danh sách chỉ số hiển thị trên thẻ.
- Driver `StatHandler` field: `LoadingBall, Content, Info, Titles, Username, Guild, Badges[24], GuildLogo, PrivateToggle, Character, OnlineStatus, Panel, Tween`.
- `StatHandler` (dump.cs, dòng 235945) method: `RegionFromInt(int)`, `HandleStats(Stats s)`, `TogglePrivacy()`, `OpenClose()`, `Open(string username)`, `Close()`.

---

### 6. Options (Cài đặt) [ĐO TRONG REPO]

- Có 2 bản giống hệt nhau về cấu trúc: `P1.UI['Panel - Options']` (trong game, driver `OptionsHandler`, `_go:"#Misc Handlers"`) và `P1.UI['title:Panel - Options']` (màn login, driver `title:OptionsHandler`, `_go:"#Options Handler"`).
- 4 danh mục cố định (`Background - Catagorys/Scroll View - Catagorys/Grid/Button - Catagory` ×4, tên gõ sai "Catagory" trong file gốc): `Graphics, Audio, Game, Controls`.
- `Background - Options/Scroll View - Settings/Grid` — rỗng lúc export, mỗi dòng cài đặt được bơm từ 1 trong 4 prefab dùng chung cho cả 2 panel (field `SettingPrefabs` liệt kê y hệt ở cả `OptionsHandler` và `title:OptionsHandler`):
  - `prefab:Button - Setting Dropdown` (`mb.OptionSetting`) — `Drop Down - Setting` (`x.UIPopupList`, label mặc định `"Disabled"`) + `Label - Title`.
  - `prefab:Button - Setting Slider` (`mb.OptionSetting`) — `Slider` (`x.UISlider` + `mb.UISliderColors`, có `Foreground`/`Thumb`) + `Label - Title`.
  - `prefab:Button - Key Setting` (`mb.KeySetting`) — `Button - Set Key` (`b->...UpdateOption`), `Button - Add` (`AddKey`, inactive mặc định), `Button - Remove` (`DeleteKey`), `Button - Replace` (inactive) → gán phím tắt, cho phép gán nhiều phím/xoá từng phím.
  - `prefab:Button - Reset Keys` (`mb.ButtonSetting`) — `Button - Set Key` (`b->...UpdateOption`, label `"Set Defaults"`) → nút khôi phục phím mặc định.
- Cả 2 driver có cùng bộ field cấu hình runtime giống hệt nhau: `sCS, sFlyLimit, sFlyLookSpeed, sSFXVolume, sBumpSound, sBattleCamera, sChatFilter, sTrade, sBattle, sFriend, sUsername, sBattleFlash, sBattleKeyboard, sOverlay` — khác biệt duy nhất là `PPLayers` (trong game: `#Fly Camera, #Map Camera`; màn login: `#Main Camera`) và `listeningObject` (trỏ `Panel - Listening` khác nhau theo scene) → xác nhận 2 panel Options dùng chung 1 bộ thiết lập, chỉ khác camera áp post-processing.
- Nút `Button - Apply` (`b->...Save`), `Button - Close` (`b->...Close`).

---

### 7. Dialogue box / NPC chat (Panel - Scripts) [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Scripts']`. **Không có** node portrait/tên NPC riêng — chỉ có 1 khung thoại text chung.
- `Normal Text/Sprite - Background` (`b->#Script Handler.ClickText`, sprite `Bg_Window`) — `Sprite - Arrow` (`HUD_pokemon_arrow`) và `Sprite - NPC Arrow` (`arrow2`) là 2 icon mũi tên "bấm để tiếp tục" khác nhau (icon chung / icon khi đang nói chuyện NPC), `Sprite - Button` (nút xác nhận ẩn).
- `Label - Script Text` — `mb.TypewriterEffect` → chữ hiện dần kiểu gõ máy, đây là nơi hiển thị lời thoại.
- `Sprite - Select Container` — 4 khối lựa chọn dùng trong script/quest, đều có sẵn nhưng `inactive` mặc định:
  - `Select Pokemon` — kéo-thả Pokémon vào ô (`Script Pokemon`, `mb.PokemonDrop`), `Button - Confirm`/`Button - Close`.
  - `Select Item` — kéo-thả vật phẩm (`ScriptItem`, `mb.ScriptItemDrop`).
  - `Select Move` — 4 `Button - Select Move` (`mb.ButtonClick`, label mẫu `"Move Name\nPP 10/10"`) → script có thể bắt người chơi chọn 1 chiêu.
  - `Input` — `Input - Text` (`x.UIInput`) + `Button - Confirm` (`b->#Script Handler.AcceptInput`).
- Driver `ScriptHandler` field chính: `Panel, Blackout, FreezePlayer, ScriptExecuting, NormalTextEffect, NormalTextArrow, NormalTextMessage, TextBackground, NPCArrow, SelectTween, SelectContainer, SelectButtonPrefab, SelectGrid, InputObject, InputBox, SelectPoke, ConfirmPokeButton, SelectPokeTexture, SelectItem, ConfirmItemButton, SelectItemTexture, SelectMoveObject, MoveButtons[], MoveLabels[]`.
- `ScriptHandler` (dump.cs, dòng 234661) method: `InScript()`, `StartScript(...)`, `HandleScript(Script s)`, `ProcessScript(...)` (IEnumerator), `Show()/Hide()`, `SetText(string text, Guid npcID)`, `FinishText()`, `ClickText()`, `ClickSelect(int ID)`.
- `TypewriterEffect` class tồn tại riêng ở dòng 208853 (dùng chung, không chỉ cho NPC).
- `NPCHandler` (driver riêng, dòng 230876) không nằm trong panel này mà quản lý các bong bóng nói chuyện nổi trên đầu NPC ngoài đời (xem `Panel - Usernames` ở mục 14).

---

### 8. Main menu / Hotbar [ĐO TRONG REPO]

#### Menu chính (Esc)
- `P1.UI['Panel - Menu']` — chỉ 1 `Grid` với 5 nút: `Return to Game` (`b->#Handlers.Close`), `Change Password` (`b->#Misc Handlers.Open`), `Options` (`b->#Misc Handlers.OpenClose,#Handlers.Close`), `Logout` (`b->#Handlers.Logout`), `Exit Game` (`b->#Handlers.Quit`).
- Driver `MenuHandler` chỉ có `Panel, Tween` — menu này không cần logic riêng ngoài mở/đóng.

#### Thanh icon trên cùng (luôn hiện)
- `Panel - Game GUI/Interface Buttons` — 7 nút `ShowTip` mở panel khác: `Sprite - Battery` (chỉ hiện trên PC, `HideOnPC`), `Button - Trainer` (mở Trainer Card), `Button - Bag` (mở Inventory), `Button - Shop`, `Button - Pokedex`, `Button - Achievements`, `Button - Social`, `Button - Settings`.
- `Panel - Game GUI/Container - Hide/Button - Lootbox` (`Label - Lootbox Count`), `Button - Map`, `Button - Mount`, `Button - PVP`, `Button - Quests` (mở panel quest kèm `Container - Quests/Table - Quests`).

#### Hotbar / Cooldowns
- `P1.UI['Panel - Cooldowns']/Hot Bar and Cooldowns` — 4 ô cố định `Button - Hotkey` .. `Button - Hotkey (3)` (số hiển thị cứng `1,2,3,4`), mỗi ô `mb.HotBarItemDrop` (kéo-thả item/chiêu vào ô), có `Texture - Blur` (nền mờ khi trống) + `Texture` (icon item/chiêu đã gán).
- `Grid - Cooldowns` — grid rỗng, bơm `prefab:Cooldown` (`mb.Cooldown`, sprite `BuffIcon`, `Label` rỗng) → icon buff/debuff đang có hiệu lực, hiện timer đếm ngược.
- `prefab:Hotbar - Clone` (`mb.HotBarItemDrop`, sprite `Btn_PokemonCircle_Hover`, chỉ có `Texture - Icon`) → bản ghost khi đang kéo 1 icon ra khỏi hotbar.
- Driver `HotkeyHandler`: `ItemID[4], ItemIcons[4], ItemButtons[4]` — xác nhận hotbar chỉ có đúng 4 ô cố định (không mở rộng).
- `Cooldown` (dump.cs, dòng 226477) field: `UID, Title, Desc, Icons[], TimeLabel, Steps, CurrentBuff(BuffHandler.Buff), updateTime`; method: `OnPress, OnTooltip, Update`.

---

### 9. Shop [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Shop']`. 2 label tiền tệ (`Money Label` cạnh `12_Pokedollar`, `Gold Label` cạnh `12_PokeGold`) — trỏ đúng từ `InventoryHandler.ShopMoneyLabel/ShopGoldLabel` (đồng bộ với Inventory, xem mục 3).
- `Background - Items/Scroll View - Shop Items/Grid` — rỗng, field `ShopHandler.Grid` trỏ đúng vào đây, bơm `ShopHandler.ShopItemPrefab = "prefab:Shop Item"`.
- `Background - Purchase/Choose Amount` — `Label - Amount`, nút `Button - Add`/`Button - Take` (`mb.PressAndHold` — giữ chuột để tăng/giảm liên tục), `Label - Total Cost` (Pokédollar) và `Label - Total Cost PokeGold` (Poké Gold) → 1 món có thể có giá kép, người chơi chọn trả bằng loại tiền nào (`Button - Buy` vs `Button - Buy Poke Coin`).
- Hai prefab trùng tên `Shop Item`: `prefab:Shop Item` (`mb.SkinShopItem`, dòng Costume Shop: `Texture - Body/Clothes/Preview`, `Label - Price` mẫu `"[PD]500[PG]500"`) và `prefab:Shop Item#3985` (`mb.ShopItem`: `Sprite/Icon`, `lvlName` mẫu `"Lapras Surf Mount
[PG] 999   [PD]999,999"`, nền `Bg_InventoryOption`). `rip_ui.py` giải tham chiếu theo pathID nên `ShopHandler.ShopItemPrefab` trỏ đúng `prefab:Shop Item#3985`.
- Driver `ShopHandler` field: `ShopItemPrefab` (= `prefab:Shop Item#3985`), Grid, AmountLabel, CostLabel, TokenCostLabel, PurchaseObjects[4], ItemLabel, ItemTexture, Panel, Tween`.
- `ShopHandler` (dump.cs, dòng 235219) method: `BuyItem()`, `BuyTokenItem()`, `Setup(string[] data, Guid scriptID)`, `SelectItem(ShopItem item)`, `AddAmount()/TakeAmount()/ResetAmount()`, `Open()/Close()/Exit()`.
- `ShopItem` (dòng 235280) method: `Setup(string d)`, `OnClick`.
- Panel **Panel - Lootbox Buy** (mua hòm/donate) tách riêng, driver **`BuyButtonHandler`** (không phải `ShopHandler`) — field chỉ có `Panel: "Panel - Lootbox Buy", Tween` — xác nhận đây là 1 shop khác (nạp tiền/lootbox), không chung logic với Shop thường.

---

### 10. PC Box (Panel - Pokebox) [ĐO TRONG REPO]

- Gốc: `P1.UI['Panel - Pokebox']`.
- `Grid/PokeboxNumber` .. `(9)` — 10 nút chọn hộp (`mb.PokemonDrop,PokeboxButton`), mỗi nút có `Sprite - Box Progress` (`whitesquare`) + `Label` (mẫu `"10"` = số Pokémon trong hộp/sức chứa).
- `BoxView/Grid` — lưới ô Pokémon của hộp đang mở (rỗng, bơm `PokeboxHandler.BoxItemPrefab = "prefab:Pokebox Button"`); `Collider - Pokebox` (`mb.PokemonDrop`, inactive) là vùng thả Pokémon vào hộp.
- `Pokebox Release/ReleasePoke` (`mb.PokemonDrop`) — kéo Pokémon vào đây để thả (release), có `Label - Pokemon Info` (mẫu `"Lv 100\nCHARIZARDITE"`), `Button - Cancel`/`Button - Release` kèm `Label - Info` cảnh báo mất vĩnh viễn.
- `Sprite - Panel/Button - Upgrade Box` (`b->#Script Handler.BuySpace`) + `Label - Box Space` (`"Boxes Owned:"`) → mua thêm hộp.
- Bộ lọc tìm kiếm: `Input - Search` (gợi ý tìm theo `Name, Held Item, Type, Nature, Ability, Moves`), `Input - Level Range`/`Input - Level Range Max`, `Checkbox - Shiny`, `Checkbox - Egg`, `Button - Search`.
- `prefab:Pokebox Button` (`mb.PokeboxPokemon`, sprite `Btn_PokemonCircle`) — `Pokemon Image` (texture), `ItemIcon` (sprite `HUD_pokemon_item`), `Pokemon Name`, `Sprite/Level Label` (mẫu `"Lv 100"`).
- Driver `PokeboxHandler` field: `Tween, Panel, BoxItemPrefab, BoxGrid, DropObject, BoxNumbers[10], BoxNumber, SelectColour:"#00c901ff", ReleaseTexture, ReleaseButtons[2], ReleaseHide[], ReleaseInfo, BoxSpace, BuySpaceButton, SearchInput, ToggleShiny, ToggleEgg, LevelStart, LevelEnd`.
- `PokeboxButton` (dump.cs, dòng 231844 — đây là component gắn trên 10 nút chọn hộp, khác `PokeboxPokemon` là component trong prefab Pokémon) field: `ProgressBar, BoxNumber, boxNumber, colors[]`; method: `UpdateBox(int number, int progress)`, `OnClick`.
- `_go: "#Script Handler"` — Pokebox dùng chung GameObject Handler với `ScriptHandler/CustomizationHandler/ShopHandler/TutorHandler` (theo outline `Script Handler [ScriptHandler,CustomizationHandler,ShopHandler,TutorHandler,PokeboxHandler]`).

---

### 11. Level-up / Learn Move [ĐO TRONG REPO]

- Node lồng bên trong top-level `Widget - Hidden During Battle Or Script` (panel này chỉ có đúng 2 con): đường dẫn đầy đủ là `Widget - Hidden During Battle Or Script/Panel - Learn Move`.
- `Sprite - Info Background` — `Label - Title PP` (mẫu `"Ember\nPP 25"`), `Label - Tpe Acc PWR` (tiêu đề cột, gõ sai "Tpe"), `Label - Accuracy`, `Label - Power`, `Label - Description` (mô tả dài), `Sprite - Type` (placeholder `rock` — icon hệ thật) + `Sprite - Damage Type` (placeholder `special`) → thông tin chiêu mới.
- `Label - Learning` — câu hỏi mẫu `"Pokemon is trying to learn Ember, Should it forget another move to learn it?"`.
- `Sprite - Platform/Texture - Pokemon` — bệ + ảnh Pokémon.
- `Widget - Mouse Over Description` (`mb.BattleMoveDescription`) — dùng lại đúng script tooltip của Battle HUD/Pokédex khi rê chuột vào 1 trong 4 chiêu cũ.
- 4× `Button - Learn Move` (label mặc định `"Forget Move.."`, `mb.ButtonClick,ShowMoveDescription`) → chọn chiêu cũ để quên; `Button - Dont Learn` → từ chối học.
- Driver `LearnHandler` field: `PokemonTexture, Message, MoveScreen, Tween, MoveNames[4], Labels[4] (Title PP, Description, Accuracy, Power), Sprites[2] (Type, Damage Type)`.
- `LearnHandler` (dump.cs, dòng 228977) field runtime: `moveToLearn (cMove: Pokemon Guid, MoveID, PokeName, MoveName), chosenChoice`; method: `Hide()`, `CheckForLearning()` (bool — kiểm tra có chiêu chờ học không), `SetupLearnWindow()`, `ChooseMove(int choice)`, `ConfirmChoose()`.
- `ShowMoveDescription` (dòng 235305) field: `moveDesc (BattleMoveDescription), move (PSXUtilities.MoveInfo), Offset`; method: `OnHover(bool)`, `Hide()`.
- `prefab:EXP Gain` — chỉ là 1 label nổi `"+35 EXP"` + `Sprite` nhỏ (icon `Btn_Close_Normal` — placeholder, chắc chắn không phải icon thật dùng lúc chạy). **Đây không phải popup lên cấp đầy đủ**, chỉ là số EXP bay lên (kiểu floating text), khớp với `FloatingText`/`HUDPokemon.SplashEXPGain` — việc tăng cấp thực sự thể hiện qua `Sprite - EXP`/`Label - Level` trên HUD Pokémon tại chỗ (mục 2) chứ không có màn hình lên cấp riêng trong export này.

---

### 12. Evolution (Panel - Learn Evolution) [ĐO TRONG REPO]

- Đường dẫn đầy đủ: `Widget - Hidden During Battle Or Script/Panel - Learn Evolution`.
- `Sprite - Info Background/Button - Yes` (`b->#Handlers.Evolve`) và `Button - No` (`b->#Handlers.DontEvolve`).
- `Label - Evolving` — câu hỏi mẫu `"Pokemon is trying to evolve into Pokemon, Do you want your Pokemon to evolve?"`.
- `Sprite - Platform/Texture - Pokemon` — `mb.EvolveAnimation` → hiệu ứng chuyển ảnh từ loài cũ sang loài mới ngay trên texture này (không phải animation Unity riêng, texture tự đổi qua các frame).
- Driver `EvolutionHandler` field: `EvolutionScreen, Tween, EvoLabel, EvoAnimation`.
- `EvolutionHandler` (dump.cs, dòng 226813) field runtime: `InEvolution (static bool), pokeEvolve (cEvolve: Pokemon Guid, PokemonTo, PokemonFrom)`; method: `Hide()`, `CheckForEvolution()` (bool), `SetupEvolutionWindow()`, `Evolve()`, `DontEvolve()`.
- `EvolveAnimation` (dòng 226859) field: `Textures (UITexture), stage (private int), animationSpeed, Pokes (Texture2D[])` → xác nhận hoạt ảnh tiến hoá là chuyển đổi qua 1 mảng `Texture2D` (`Pokes[]`) theo `stage`, không phải sprite animation NGUI chuẩn.

---

### 13. Login / Title screen [ĐO TRONG REPO]

- Toàn bộ nằm trong scene level1 (`P1.UI['title:Panel - ...']`).
- `title:Panel - Login` (panel chính, đang active): `Input - Username`/`Input - Password` (`x.UIInput`, `mb.TabSelect` — Tab để nhảy giữa 2 ô), `Button - Login` (`b->#Networking.Login`), `Sprite - Response/Label - Response` (inactive — hiện lỗi đăng nhập), `Toggle - Remember Login` (`"Remember Password"`), `Label - Signup`/`Label - Signup Button` (`b->#Account Handlers.Open`), `Label - Lost Password` (`b->#Account Handlers.Open` — cùng handler mở, phân biệt bằng tham số truyền kèm, không thấy trong export), `Label - Legal` (dòng disclaimer), `Button - Quit` (`b->...CloseGame`), `Button - Options` (`b->#Options Handler.OpenClose`).
  - **Không có** label phiên bản game hay trạng thái server trong export này.
- `title:Panel - Login Queue` — `Label - Wait` (`"Logging In.. Waiting in Queue"`), `Label - Wait Time` (mẫu `"Average Wait-Time: 5 mins"`), `Texture - Loading` (`pokeballload`).
- `title:Panel - Create Account` — `Input - Username/Password/Password Confirm/Email/Email Confirm`, `Label - Terms`/`Label - Terms Button` (`b->#Account Handlers.OpenTerms`), `Button - Cancel`/`Button - Submit` (`b->#Account Handlers.Close/Submit`), `Label - Creation Feedback` (mẫu `"Creating Account.."`).
- `title:Panel - Connecting` — chỉ có `Label - Creation Feedback` (`"Connecting.."`) + `Texture - Loading` + `Sprite - Darken`.
- `title:Panel - Verify` — `Input - Code`, `Label - Terms` (giải thích cần xác minh email) + `Label - Terms Button` (`"here"`, `b->#Account Handlers.Resend`), `Button - Cancel`(`...Cancel`)/`Button - Submit`.
- `title:Panel - Password Reset` — `Input - Reset Details` (`"Enter Username or Email.."`), `Label - Terms` (hướng dẫn), `Button - Cancel`(`...Close`)/`Button - Submit`(`b->#Account Handlers.ProcessResetPassword`), `Label - Please Wait`.
- Driver `title:AccountHandler` field: `lblUsername, lblPassword, lblPasswordConfirm, lblEmail, lblEmailConfirm, lblResponse, Content[2], ConnectingObject, Panel, Tween` — toàn bộ trỏ vào `title:Panel - Create Account`, xác nhận `AccountHandler` chỉ quản lý màn tạo tài khoản + màn Connecting chung, KHÔNG quản lý Login/Verify/ResetPassword (2 màn kia có driver riêng `title:VerifyHandler`, `title:ResetPassHandler` — chỉ đọc được tên driver, chưa dò field vì không phải trọng tâm câu hỏi).
- `title:Panel - Listening` — `Sprite - Darken` + `Label`, driver `title:OptionsHandler.listeningObject` → panel chờ khi đang gán phím tắt mới (đứng chung cơ chế với Options ở mục 6).

---

### 14. Mọi panel top-level khác (tóm tắt 1 dòng/panel) [ĐO TRONG REPO]

Định dạng: `tên node` → mục đích (dựa trên tên children đo được) → driver (dò bằng cách tìm field trong `P1.UI_DRIVERS` có giá trị bắt đầu bằng đúng path panel đó).

- `Panel - Auction House` → Nhà đấu giá vật phẩm (tab Buy/Sell, danh mục, giỏ hàng, bid/buyout) → **không tìm thấy driver trong `P1.UI_DRIVERS`** (tính năng có vẻ đã ngưng dùng/chưa nối lại script).
- `PVP` → cụm PVP gồm 6 panel con: `Panel - Match Tool Tip, Panel - Most Pokemon, Panel - Most Text, PVP Handler, Panel - PVP System, Panel - PVP Queue` → driver riêng nằm trong chính node `PVP Handler` (chưa đào field, ngoài phạm vi câu hỏi).
- `Panel - Map Panel` → bản đồ thế giới (icon người chơi, icon Pokémon trên map, chế độ bay `Panel - Flying Over GUI` với 2 joystick ảo) → driver `FlyCamera`, `WorldMapHandler`.
- `Panel - Achievements` → danh sách thành tựu, 3 tab `Incomplete/Complete/All`, tiền thưởng → driver `AchievementHandler`.
- `Panel - Area Pokemon` → danh sách Pokémon xuất hiện quanh khu vực hiện tại → driver `AreaPokemonHandler`.
- `Panel - Map or Battle Fade` → màn hình đen dùng để chuyển cảnh (fade) khi đổi map/vào trận → driver `WorldMapHandler`.
- `Panel - Blackout` → màn đen toàn cục + label → driver `PlayerHandler`.
- `Panel - Usernames` → container chứa bong bóng tên/chat nổi trên đầu người chơi và NPC (`Emote Bubble, Player Chat Bubble, Player Name`) → driver `NPCHandler, PlayerHandler, WorldMapHandler`.
- `Panel - Chat Box` → khung chat chính luôn hiện góc màn hình (tab kênh, input, nút ẩn/hiện, popup loot) → driver `ChatHandler, LootHandler, SocialHandler`.
- `Panel - Chat Manager` → cửa sổ quản lý tab chat/kênh (thêm/xoá tab, join kênh) → driver `ChatHandler`.
- `Panel - Context Menus` → gốc chứa menu chuột phải/menu ngữ cảnh (rỗng lúc export, bơm `prefab:Button - Context`, `prefab:Context Menu - With/No Title`) → driver `PlayerHandler`.
- `Panel - Costume Shop` → shop trang phục/thú cưỡi, 5 tab `Clothes/Headgear/Mounts/Surf Mounts/Fly Mounts`, có nút mở Lootbox mua hòm → driver `SkinHandler`.
- `Panel - Customization` → tạo/đổi ngoại hình nhân vật (giới tính, tóc, màu tóc, da, mắt, xoay 3D) → driver `CustomizationHandler`.
- `Panel - Drag Drop` → root vô hình (`UIDragDropRoot`) chứa `Pokemon Colliders`, phục vụ hệ kéo-thả Pokémon toàn cục → driver `PokemonHandler`.
- `Panel - Emotes` → bảng chọn emote (grid gần 30 icon số `1..30`, `mb.ClickEmote`) → driver `ChatEmoteHandler`.
- `Panel - Loading Map` → màn chờ khi đổi bản đồ (`Sprite - Darken` + `Label`) → **không tìm thấy driver riêng** (có thể do `WorldMapHandler`/mã map điều khiển trực tiếp không qua field export).
- `Panel - Lootbox` → mở hòm quay thưởng (`Button - Buy`, 2 biến thể hòm `Lootbox - Normal/Small`, `Loot Items`) → driver `LootboxHandler`.
- `Panel - Lootbox Buy` → màn mua hòm bằng tiền thật/donate (`Panel - Purchase Lootbox/Container - Lootboxes`) → driver `BuyButtonHandler` (khác `ShopHandler`, xem mục 9).
- `Panel - Trade` → giao dịch trực tiếp 2 người chơi (2 bên `Sprite - Trade Side`/`Side 2`, ô nhập tiền, `Grid` thả Pokémon, `Button - Accept/Confirm/Cancel`) → driver `TradeHandler`.
- `Panel - Quests` → danh sách nhiệm vụ đang làm, mô tả, tiến độ (`Sprite - Progress` dạng slider), phần thưởng, nút nhận/huỷ/chia sẻ → driver `QuestHandler`.
- `Panel - Slot Machines` → máy đánh bạc 3 cuộn × 3 hàng, nút cược 1/2/3, nút Spin, nhãn Credits/Pay Out → driver `SlotMachineHandler`.
- `Panel - Social` → bạn bè/danh sách chặn/guild, dropdown trạng thái online, dropdown nhận tin nhắn riêng → driver `GuildHandler, SocialHandler`.
- `Panel - Tool Tip` → tooltip dùng chung toàn game (node `Tooltip`) → **không tìm thấy driver riêng** (nhiều script `ShowTip` rải khắp UI tự gọi thẳng, không qua 1 handler tập trung).
- `Panel - Battle Lobby` → phòng chờ trước trận PVP có mời bạn (`Chat Area/Chat Input`, `Team 1/Team 2`, nút `Leave/Start/Accept/Switch`) → driver `BattleLobbyHandler`.
- `Panel - Tutor` → dạy chiêu bằng tiền/Poké Gold/BP (`Sprite - Money/Pokegold/Coins/BP`, danh sách chiêu dạy được) → driver `TutorHandler`.
- `Panel - Splash` → gốc hiện thông báo splash nổi (rỗng, bơm `prefab:Splash Message`/`prefab:Message - Splash`/`prefab:Achievement - Splash`) → driver `PlayerHandler`.
- `Private Messages` → gốc chứa cửa sổ chat riêng (rỗng, bơm `prefab:Panel - PM`) → driver `PrivateMessageHandler`.
- `Panel - Change Password` → đổi mật khẩu trong game (mật khẩu hiện tại + mới + xác nhận) → driver `PasswordHandler`.
- `Panel - Behind Battle GUI` → widget rỗng, có vẻ chỉ là mốc phân lớp (layer marker) đứng sau HUD trận đấu → **không tìm thấy driver**.
- `Panel - Reconnecting` → màn chờ kết nối lại khi rớt mạng (`Sprite - Darken` + `Label`) → driver `PlayerHandler`.
- `Panel - Asteroids` → minigame bắn thiên thạch đầy đủ (`mb.Asteroids` gắn thẳng trên panel, `Label - Score/High Score`, `Game Canvas`) → driver chính là script `Asteroids` trên panel + tham chiếu từ `PlayerHandler, ScriptHandler` (mở minigame từ NPC/script).
- `Panel - Script Blackout` → màn đen riêng dùng khi đang chạy cutscene/script (khác `Panel - Blackout` chung) → driver `ScriptHandler`.
- `Panel - Listening` → màn chờ khi đang gán phím tắt mới trong Options (trong game) → driver `OptionsHandler.listeningObject`.
- `Panel - Streamer Overlay` → overlay hiện đội hình 2 người chơi (dùng cho stream/giải đấu, tên mẫu `"Shane"`/`"Siver"`) → driver `StreamerHandler`.
- `title:Panel - Listening` → bản Listening tương ứng bên màn login (Options ở màn login) → driver `title:OptionsHandler.listeningObject`.
- `Widget - Hidden During Battle Or Script` → widget cha rỗng (chỉ có `w` + 2 con), dùng để ẩn/hiện hàng loạt UI (chứa `Panel - Learn Move` và `Panel - Learn Evolution`, mục 11-12) khi vào trận/script → driver `EvolutionHandler, LearnHandler, TeamPreviewHandler` (cả 3 đều tham chiếu node này qua field `HideWidgets`/tương đương để ẩn nó lúc mở panel của chúng).

---

### Ghi chú chung

- Cơ chế icon hệ (type) có **2 đường khác nhau cùng tồn tại** trong export, đã kiểm chứng bằng `atlas.js`:
  1. Ô chọn chiêu trong trận (`AttackButton`) tint 1 sprite chip trơn theo `BattleHandler.TypeColours` (18 màu hex đo được) + text tên hệ.
  2. Mọi nơi khác hiển thị icon hệ Pokémon/chiêu dạng tooltip (Pokémon Card, Pokédex, `prefab:Sprite - Move`, tooltip mô tả chiêu) đổi tên sprite sang đúng tên hệ viết thường — `GUIAtlas.s` có đủ 18 sprite `normal, fire, water, electric, grass, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy`.
  3. Loại đòn vật lý/đặc biệt dùng 2 sprite `physical`/`special` có thật trong atlas; không thấy sprite riêng cho đòn hệ trạng thái.
- Icon trạng thái (status ailment) có đúng 7 sprite thật trong atlas: `Icon_Status_BadlyPoisoned, Icon_Status_Burn, Icon_Status_Fainted, Icon_Status_Frozen, Icon_Status_Paralyzed, Icon_Status_Poisoned, Icon_Status_Sleep` — dùng cho Battle HUD/Pokémon Card. Riêng HUD Pokémon tại chỗ dùng placeholder khác (`psn`) — **(đoán)** có thể là quy ước tên rút gọn 3 chữ cái song song, chưa đo được đủ bộ.
- 2 tiền tệ xuyên suốt toàn bộ UI: `12_Pokedollar` (tiền thường) và `12_PokeGold` (tiền nạp) — cả Inventory, Shop, Costume Shop, Tutor, Trade đều dùng chung 2 icon này.
- Nhiều panel dùng chung 1 khung sườn (`Sprite - Window` + `Sprite Title Bar/Label - Window Title` + `Button - Close`, `mb.PanelHandler`) — đáng để làm 1 component khung cửa sổ dùng chung khi port sang web thay vì lặp lại từng panel.
- Toàn bộ grid danh sách (Inventory, Shop, Pokedex, Pokebox, Cooldowns, Battle Item...) đều **rỗng lúc export** — nội dung luôn được bơm bằng prefab lúc chạy, khớp với field `*Prefab`/`*Grid` trong driver tương ứng.

### Không tìm thấy trong dữ liệu

- Component `PokeballClick` không gắn ở đâu trong `BattlePanel` — bắt Pokémon trong trận đi qua tab item `Tab - Pokeball` + `BattleHandler.SelectPokeballTarget`, không có UI ném bóng riêng như game gốc.
- `title:VerifyHandler`, `title:ResetPassHandler` (driver riêng cho Verify/Password Reset ở màn login) — chỉ xác nhận có tồn tại trong `P1.UI_DRIVERS`, chưa đào field/method vì ngoài trọng tâm câu hỏi Login.
- Không có driver rõ ràng cho: `Panel - Auction House`, `Panel - Loading Map`, `Panel - Tool Tip`, `Panel - Behind Battle GUI` — có thể các panel này không còn dùng, hoặc điều khiển trực tiếp bằng script rải rác không qua `UI_DRIVERS`.
- Không thấy label phiên bản game / trạng thái server trên màn `title:Panel - Login`.

## Menu Options

`tools/rip_ui_settings.py` → `data/settings.js`:

```js
P1.SETTINGS_CATS = [{ id:'graphics', label:'Graphics' }, { id:'audio', ... }, { id:'game', ... }, { id:'controls', ... }];
P1.SETTINGS_DEF = [{ key, label, cat, kind:'choice'|'toggle'|'slider'|'key'|'button', options, def, offline }, ...];
```

48 dòng, đúng thứ tự gốc. `def` là **chỉ số** trong `options` (dropdown lưu chỉ số lựa chọn), slider là số 0..1.

| Tab | Dòng (khoá, mặc định) |
|---|---|
| Graphics | Window Mode (`sWindowMode`, Fullscreen) · Resolution (`sResolution`, lấy `Screen.resolutions` từ 800×600 trở lên) · Vertical Sync (`sVsync`, Enabled) · Limit FPS (`sLimitFPS`: Disabled/30/60/120/144 FPS, Disabled) · Antialiasing (`sAA`: Disabled/2x/4x, 2x) · Lighting Quality (`sLighting`: Low/Medium/High, Low) · Post Processing (`sPP`, Enabled) · Fly User Limit (`sFlyLimit`: 0..25, 10) · GUI Scale (`sGUIScale`: None/600/720/768/900/1080, None) · 1v1 Overlay (`sOverlay`, Disabled) |
| Audio | Music Volume (`sMusicVolume`, 0,35) · Sound Volume (`sSFXVolume`, 0,45) · Bump Sound (`sBumpSound`, Disabled) |
| Game | Battle Camera (`sBattleCamera`: Rotate/Set, Rotate) · Chat Filter (`sChatFilter`, Enabled) · Trade Requests (`sTrade`) · Battle Requests (`sBattle`) · Friend Requests (`sFriend`) · Show Username (`sUsername`) · Battle Flash (`sBattleFlash`) · Select With Keys (`sBattleKeyboard`) · Fly Look Speed (`sFlyLookSpeed`, 0,5) |
| Controls | Set Defaults (nút) · Controller Support (`sCS`) · 22 phím: Up/Down/Left/Right (mũi tên, WASD, cần trái, D-pad), Flying Look ×4, Fly, Land, Interact (Space), Mount (Shift), Hot Key 1–4 (1–4), Inventory (I), Quest Log (L), Map (M), Social (O), PvP (P), Trainer (T), Achievements (Y), Pokedex (K) |

- `offline: true` (game ẩn đi): Fly User Limit, 1v1 Overlay, Chat Filter, Trade/Battle/Friend Requests, Show Username,
  phím Social và PvP. Show Username đánh dấu theo nhãn (đoán), chưa tìm thấy chỗ mã đọc nó.
- [ĐO TRONG REPO] `GameAssembly.dll` trên đĩa bị Themida nén: mọi section có entropy ~7,98, dịch ngược thẳng từ tệp chỉ ra rác. Il2CppDumper-x86 in "Use custom PE loader", tức là nó nạp DLL để tự giải nén. Script làm y như vậy: gọi `LoadLibraryW` trong PowerShell 32 bit (SysWOW64) rồi chép ảnh bộ nhớ ra. Ảnh nằm ở 0x58F60000, khớp VA trong dump.cs. **Việc này chạy mã của game trên máy**, nên `rip_ui.py` chỉ gọi khi có `--settings`.
- [ĐO TRONG REPO] Dịch bằng capstone rồi dò tuyến tính, giữ giá trị ký hiệu cho thanh ghi và ngăn xếp. Literal chuỗi là ô `base + address` trong stringliteral.json; hàm, kiểu và MethodInfo tra trong script.json.
- [ĐO TRONG REPO] `ClickCatagory(id)` rẽ theo id: 0 Graphics, 1 Audio, 2 Game, 3 Controls. Nhãn tab lấy từ `Tabname` trong ui.js. `Load()` cho mặc định qua `PlayerPrefs::GetInt/GetFloat(key, mặc định)`; tên icall đọc thẳng từ chuỗi C trong ảnh. Phím mặc định lấy từ `ControlActions.CreateWithDefaultBindings`.
- [ĐO TRONG REPO] Giá trị lưu của dropdown là chỉ số lựa chọn (`OptionSetting.UpdateOption`). Slider là UIProgressBar 0..1, mặc định nhạc 0,35, tiếng 0,45, tốc độ nhìn khi bay 0,5. Cách đổi 0..1 ra âm lượng thật nằm trong `Apply`/`UpdateMusicVolume`, chưa dò.
- [BẪY ĐÃ SẬP] Biến PowerShell không phân biệt hoa thường: `$M` (Marshal) đè `$m` (MBI), ảnh chép ra toàn số 0 mà không báo lỗi. Giờ script đặt `$ErrorActionPreference='Stop'` và kiểm `MZ`.
- [BẪY ĐÃ SẬP] Trình biên dịch gộp đuôi: Fly Look Speed và Bump Sound dựng đối số rồi `jmp` tới lời gọi `AddSetting` dùng chung với 1v1 Overlay. Script phải đi theo `jmp` này, nếu không sẽ sót dòng.
- [BẪY ĐÃ SẬP] Không có literal "Off"/"On". Công tắc dùng "Disabled"/"Enabled", và bốn dòng (Trade, Battle, Friend, Battle Flash) xếp Enabled trước, nên mặc định 0 là Enabled. Luôn tra theo chỉ số trong `options`.
- Dòng dựng từ 4 prefab `prefab:Button - Setting Dropdown` / `Setting Slider` / `Key Setting` / `Reset Keys` vào
  `Panel - Options/.../Scroll View - Settings/Grid` bằng `ui.add(...)`; xem cảnh `options` trong `test/pokeone-ui.js`.

## Còn thiếu

- Chữ vẽ bằng font web (Aldrich, Arimo) chứ không bằng glyph bitmap gốc: nét mịn hơn bản gốc, bề ngang khớp theo
  trung bình nên từng chữ lệch vài phần trăm. Glyph gốc có sẵn trong GUIAtlas (`P1.UI_FONTS[*].glyphs`, glyph
  ở `mFont.mSaved` chưa xuất) nếu sau này cần vẽ đúng từng điểm ảnh.
- Gradient của UILabel/UISprite (`grad`, 19 widget) chưa vẽ. Clip `texture` (mặt nạ ảnh) coi như clip chữ nhật.
- Tween (`tw`) chỉ được đọc để lấy giá trị cuối khi mở panel; chưa chạy hoạt ảnh (mũi tên chọn nhấp nháy,
  panel mờ dần 0,2 s). Nút đổi màu hover/pressed tức thì, không nội suy theo `dur`.
- UIPopupList, UIInput, UIScrollBar chỉ hiển thị trạng thái lưu; mở danh sách thả xuống, gõ chữ, kéo thanh cuộn
  là việc của mã game. Cuộn bằng lăn chuột đã có (`UIDragScrollView` → `UIScrollView`), kéo bằng tay chưa có.
- Khoảng trượt vào của thanh máu trong trận không có trong dữ liệu cảnh (BattleHandler làm trong mã). Bài kiểm
  dùng `offset(±300)` (đoán).
- Texture là RenderTexture (`rt:Pokedex Pokemon`, `rt:Chart`, `rt:Lootbox`, `rt:Animated Background`) để trống; mã
  game vẽ model 3D vào `node.el` (canvas) nếu cần.
- `Panel - Map Panel`, PVP, Auction House, Slot Machines, Asteroids... đã bóc nhưng chưa kiểm bằng mắt.
