# Công cụ bóc Soul Knight

Sinh `art/sk/atlas*.png` và `data/sk-data.js` từ bản cài Soul Knight **8.6.0** nằm ngoài git:

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py            # ghi vào game
    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py --out DIR  # build thử ra DIR/art/sk + DIR/data
    node games/soulknight/tools/check_keys.js [--out DIR]                         # soát khoá, xem dưới

Chạy khoảng 2,5 phút [ĐO 2026-09-29]; trên Linux lần đầu 14 phút vì dựng chỉ mục CAB [ĐO 2026-10-09].
Gốc nguồn là biến `SK86` (`skrip.REF`); không đặt thì `D:\sk86-ref` trên Windows, `~/sk86-ref` trên máy khác.
Dựng lại nguồn từ XAPK 8.6.0 (apkpure, versionCode 80600): giải `UnityDataAssetPack.apk` vào `$SK86/UnityDataAssetPack`.
Chữ tiếng Việt chính thức: `python tools/ui/build_loc.py` đọc `localization.ab` (I2 Localization, không mã hoá, 17.794 term) ra
`$SK86/decoded/localization_en_vi.json` mà `build_ui.py` dùng. Sảnh: `python tools/hall/build_hall.py` → `art/hall/`, `data/sk-hall.js`.
Nguồn:

- `D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles\`: 2375 bundle `.ab` (523 MB) trong thư mục lồng
  nhau (`level/1/a.ab`, `boss/boss08.ab`, `skin/character/knight/skin_0.ab`...). Không chép bundle vào repo.
- `~/Downloads/sk-ref/all/`: 94.070 PNG của bản rip cũ 8.5.1. Chỉ còn là đường lùi cho `png_anims`
  khi bundle 8.6 không có đủ khung. Lượt build 2026-09-29 không cần tới nó (50/50 png_anims và 42/42 nhân
  vật đọc từ bundle).
- `~/Downloads/sk-ref/tilemap/pattern/*.json`: đường lùi của mẫu phòng; 8.6 đọc thẳng `patternroom.ab`.

Soát bằng mắt: phục vụ repo (`python -m http.server 8811`) rồi mở
`games/soulknight/tools/viewer.html?g=forest` (hoặc `heroes`, `prefabs`, `png`, `clips`, tên theme khác).
`png`/`clips` là các hoạt ảnh mà `tools/extra/*.json` xin. Chữ thập đỏ là điểm neo của khung.

## Tệp

| Tệp | Việc |
|---|---|
| `skrip.py` | Đọc bundle. Chỉ mục CAB, nạp lười, giải con trỏ chéo bundle, cây GameObject, sprite kèm điểm neo, clip hoạt ảnh, AnimatorController. |
| `pack.py` | Gói khung vào trang atlas 2048, lề 2 px. Khung trùng điểm ảnh và trùng điểm neo chỉ lưu một lần. |
| `build_sk.py` | Chọn cái gì vào game và ghi `sk-data.js`. |
| `check_keys.js` | So bản mới với bản đã commit: mọi khoá mà mã chạy dùng phải còn. |
| `viewer.html` | Trang soát hoạt ảnh, điểm neo, prefab. |

## Chỉ mục CAB và nạp lười (`skrip.Rip`)

Nạp cả 2375 bundle một lúc thì quá nặng. `Rip` làm thế này:

1. `build_index()` quét mọi `.ab`, ghi `{bundle: {size, mtime, cabs}}` vào
   `D:\sk86-ref\work\foundation\cab_index.json`. Lần đầu mất khoảng 2 phút [ĐO]: 2375 bundle, 2412 CAB.
   Lần sau chỉ đọc lại bundle nào đổi cỡ hoặc giờ sửa. Muốn dựng lại tay thì chạy `python tools/skrip.py`.
2. `Rip(bundles=[...])` chỉ nạp các họ bundle được nêu. `build_sk.py` nạp sẵn `common`, `levelcommon`,
   `levelobjects`, `level/*`, `multi_room`, `patternroom`, `scene_game`, `sprite_atlas`.
3. `resolve()` gặp CAB chưa nạp thì tra chỉ mục ra bundle rồi nạp bundle đó. Mọi bundle đều nạp vào cùng
   một `UnityPy.Environment`, nên UnityPy tự giải được texture nằm ở bundle khác.
   Lượt build [ĐO 2026-09-29] nạp tổng cộng 79 bundle. CAB duy nhất ngoài chỉ mục là
   `unity default resources`, tài nguyên dựng sẵn của Unity, không nằm trong bundle nào.

API giữ như cũ: `resolve`, `tree`, `script_name`, `roots`, `Node`, `sprite()`, `clip()`, `controller()`,
`files`, `bundle_of`. Thêm các hàm sau:

- `rip.bundles('level/*', 'boss/boss0?')`: trả tên bundle tương đối có thật. Không ghi `.ab` cũng được,
  `*` khớp cả `/`.
- `rip.load(rel)` và `rip.cabs(*mẫu)`: nạp bundle, trả danh sách CAB. Danh sách này là bản mới, nên duyệt
  xong vẫn an toàn dù con trỏ nạp thêm bundle giữa chừng.
- `rip.objects(mẫu, ('Sprite', 'AnimationClip'))`: duyệt `(cab, obj)`.
- `rip.index`, `rip.cab_bundle` (CAB → bundle), `rip.missing` (CAB không có trong chỉ mục → số lần gặp).

`bundle_of[cab]` giờ là đường dẫn tương đối kiểu `level/1/a.ab`, không còn `level__1__a.ab`. Trường
`themes[x].bundle` trong `sk-data.js` đổi theo.

## `sk-data.js` chứa gì

- `SK_ATLAS.f[tên] = [trang, x, y, w, h, ax, ay]`. `(ax, ay)` là pivot Unity tính bằng điểm ảnh từ
  góc trên-trái của ảnh đã cắt. Đặt điểm này vào vị trí thế giới của vật.
- `anims[khoá] = {f, d, loop, ev?, tr?, len?}`: khung và số giây mỗi khung, giải từ AnimationClip thật.
  `tr` là đường cong Transform của clip (`clip_xform.py`, giải bằng `ui/uiclip.py`):
  `tr["đường dẫn nút tính từ nút mang Animator"] = {p?: [[t, dx, dy]], s?: [[t, sx, sy]], r?: [[t, độ]]}`.
  `p` là px lệch so với tư thế nghỉ trong prefab (đã nhân cỡ nghỉ của nút cha), y hướng lên như Unity. `s` là cỡ
  clip chia cỡ nghỉ. `r` là góc z lệch so với góc nghỉ, tính bằng độ, ngược kim đồng hồ. Mỗi khoá là giá trị tại
  thời điểm khoá. Giữa hai khoá nội suy tuyến tính, sau khoá cuối giữ nguyên. `len` là độ dài clip. Clip chỉ có
  Transform thì `f = []`. Cùng khoá `controller/state` mà `tr` khác (prefab có tư thế nghỉ khác, hoặc hai
  controller trùng tên) thì có thêm khoá `controller/state@<prefab>`. Mã chạy đọc bằng `SK.animXform` hoặc
  `SK.animPose` (engine.js). Quái có `bodyPath` (nút thân) và `weapons[i].path`. Nhân vật có `s0.bodyPath` và
  `s0.handPath`, tính theo prefab `c<index>` trong `hero.ab`.
  Animator gốc/súng của quái và layer của nhân vật đọc với `extra` (`clip_xform.clip_tr(..., extra=True)`): `tr[nút].on =
  [[t, 0|1]]` là bật/tắt `SpriteRenderer.m_Enabled`/`GameObject.m_IsActive` (bậc thang, `SK.animOn`), `fp` là nút nhận
  đường sprite khi nút đó không phải `body` (vd `dead_tap`). Clip không có khung lẫn Transform vẫn được giữ ở state của
  súng và layer >= 1 (`{f: [], d: [], len, ev?}`), vì state rỗng vẫn là một bước của máy trạng thái.
- `ctrl[tên]`: đồ thị AnimatorController gốc [ĐO] (`skrip.controller_graph`), dùng chung theo tên controller:
  `{p: {param: [kiểu, mặc định]}, L: [{w, add, def, any: [T], st: {state: [T]}, sp?}]}`,
  `T = [state đích | null (exit), [[mode, param, ngưỡng]], exitTime | null, thời lượng chuyển]`. Kiểu param: 1 float,
  3 int, 4 bool, 9 trigger. mode: 1 If, 2 IfNot, 3 Greater, 4 Less, 6 Equals, 7 NotEqual. Tên state theo khoá anim
  (`Ln.` cho layer n, trùng tên trong một layer thì `~k`). Thực thể trỏ tới đồ thị bằng `ctrl`: `enemies[id].ctrl` (map
  state -> anim là `anims`), `weapons[i].ctrl` (map là `weapons[i].anims`), `heroes[x].s0.ctrl` (map là `s0.layers`, chỉ
  layer >= 1). Mã chạy: `SK.smNew/smSet/smTrig/smStep/smKey` trong engine.js; trigger tiêu sau khi mọi layer đã xét, chuyển
  mềm bị bỏ (đổi state tức thì). Mọi layer của controller quái là override, trọng số 1 [ĐO].
- `enemies[id].nodes[đường dẫn] = {at, f, on, o}`: nút mà clip layer >= 1 bật/tắt hoặc đổi sprite (294 quái có
  `dead_tap`: `L2.char_dizzy` chơi clip `char_atk` là dấu "!" đỏ, `L2.char_tap_dead` là hồn ma khi chết).
  `weapons[i].spr`: sprite do mã EGun đổi (EGun004/EGunEliteArcher `s_ide`/`s_atk`: cung giương khi `atk_b`).
- `enemies`: cấu hình prefab quái thật [ĐO]. Gồm `RoleAttribute` (máu, tốc độ), lớp AI `EnemyAIxx`
  kèm tham số, súng `EGunxxx` (atk, bullet_speed, deviation, count, angle), vị trí tay và nòng.
- `bullets`: prefab đạn quái (72 cái [ĐO 8.6]). Có sprite, anim, collider, MonoBehaviour.
- `themes`: 13 theme của ải 1 đến 3. Mỗi theme có màu nền camera, cấu hình từng ải
  (`map_long`, `chest_level`, `roomSpacing`), danh sách quái và bản tinh anh, bộ sàn/tường
  (`tiles`), và bảng ký hiệu mẫu phòng → prefab (`lib`, từ `RoomElementLibrary`).
  8.6 còn có `level/1/g`, `level/4/a-c` nhưng chưa được gắn tên theme.
- `patterns`: 282 mẫu phòng (`patternroom.ab`, TextAsset JSON). Mỗi mẫu có cỡ, vật cản, điểm sinh
  quái, tỉ lệ tinh anh `ex`, ngân sách điểm quái `pts`, số đợt `waves`.
- `prefabs`: rương, cửa, cổng, tiền, bình, hiệu ứng trúng/nổ, tượng buff, thương nhân, NPC sảnh.
  Mỗi phần có vị trí, thứ tự vẽ, màu nhuộm, hoạt ảnh, collider, tham số MonoBehaviour.
- `heroes[thư mục].s0 = {index, folder, idle, run, dead, pivot}`: 42 nhân vật. Dãy sprite lấy từ
  `CharacterSprites` (`common.ab`), hình lấy từ `skin/character/<thư mục>/skin_0.ab`. `pivot = [dx, dy]`
  là vị trí pivot Unity thật so với điểm neo của khung, tính bằng px màn hình (y hướng xuống). Ví dụ knight
  `[3.92, 1.2]`.
- `hud`: cây RectTransform của Canvas màn chơi (`scene_game`), gồm neo, cỡ, cỡ chữ. Bản 8.6 giải được
  sprite UI (`ui.ab`...) nên 362 nút có `f` [ĐO]. Sprite UI giữ điểm ảnh gốc, không quy về PPU 16.
- `sprites.bullets`: 140 sprite `bullet_N` của `common`/`sprite_atlas`.
- `extra`: xem phần `tools/extra` bên dưới.

## Số đo phải biết [ĐO 2026-09-29]

- 1 đơn vị Unity = 16 px (`m_PixelsToUnits`). Tốc độ trong `enemies` vẫn tính bằng đơn vị/giây.
  Sprite UI (`ui_buff_*`, `ui_skill*`) có PPU khác 16.
- Điểm neo của ảnh đã cắt: `ax = pivot.x * rect.w - offset.x`, `ay = h_cắt + offset.y - rect.h * pivot.y`.
  `offset` là `m_RD.textureRectOffset`.
- Hoạt ảnh sprite nằm trong `m_StreamedClip`: từng khung là `(time, số khoá)`, mỗi khoá gồm
  `(chỉ số đường cong, 4 float)`. Float thứ tư là chỉ số vào `pptrCurveMapping`. Khung đầu có
  `time = -FLT_MAX`, là giá trị khởi đầu.
- **Chỉ số đường sprite = tổng số đường float** (streamed `curveCount` + dense `m_CurveCount` + số phần tử
  constant) + thứ tự của nó trong các binding PPtr. Không được đếm binding: một binding vị trí/cỡ giữ tới
  3 đường float.
- Nhân vật: 8 khung đứng, 8 khung chạy, 1 khung chết, 0,0625 s/khung. Số này đọc từ clip
  `skin_0_idle`/`skin_0_run` trong bundle skin.
- Phòng đánh có bốn cỡ: 15×15, 15×21, 21×15, 21×21. Phòng rương 11×11, phòng bán hàng 25×15.
- Kích thước: atlas 1 trang 2048×~1830. `art/sk` 1,25 MB → 1,46 MB, `sk-data.js` 1,35 MB → 1,43 MB.

## 8.5.1 → 8.6: khác gì [ĐO, so bằng `check_keys.js` và bản cũ]

- Máu, tốc độ, crit, tham số AI và súng của 296 quái ở 13 theme: **không đổi**. 282 mẫu phòng giống hệt nhau.
- Súng quái có đạn thật: 182 khẩu từng có `bullet: null` vì prefab đạn nằm ở `bullet.ab` (CAB `7129e9`),
  giờ còn 0. `bullets` tăng từ 22 lên 72. Tham số AI kiểu `clip_dead`, `atk1_cilp`, `bullet01` trước là
  `?missing`, giờ trỏ tới tên thật (`@fx_dead6`, `@bullet_e_25`...).
- Bản cũ đọc sai đường sprite của clip, nên anim chạy của quái đứng yên một khung. Lỗi này đã sửa: 136/773
  anim đổi danh sách khung, chủ yếu `run`/`atk` của quái giờ có 4 khung khác nhau. Anim `dead` thường chỉ còn
  1 khung thay vì 4 khung trùng nhau.
- Nhân vật và `png_anims` xếp khung theo pivot Unity thay vì dò IoU. Khung 0 giữ nguyên điểm neo cũ, các
  khung sau lệch khoảng 1 px so với trước. Hình Captain đổi trong 8.6: khung từ 37×37 thành 35×35.
- Icon `ui_buff_*`/`ui_skill*` vẫn 32×32 như PNG cũ (giữ điểm ảnh gốc).
- Nhiều sprite hiệu ứng có hai bản khác nhau ở `common` và `sprite_atlas` (`effect_08_*`, `effect04_*`,
  `thunder 1_*`...). Bản thứ hai mang đuôi `~2`, và mã chạy đã tự bỏ các khung có `~`.

## Soát khoá: `check_keys.js`

So `data/sk-data.js` (hoặc `--out DIR`) với bản đã commit (`git show HEAD:`), hoặc với `--base <tệp>`.
Nó lấy mọi chuỗi hằng trong `js/`, `js/season/`, `data/sk-wiki.js`, `data/season-*.js` và
`tools/extra/*.json`. Chuỗi nào trùng tên khung/anim/prefab của bản cũ thì bản mới phải có. Ngoài ra nó
soát các khoá tra động: nhân vật, `extra.*` mà tệp extra còn xin, prefab kèm tên part và state, quái kèm
state, theme, mẫu phòng. Khung nào dữ liệu mới nhắc tới cũng phải có trong atlas, trang atlas không được
quá 4096. Thiếu thì thoát mã 1. Khung đổi cỡ và danh sách `extra.sprites` đổi độ dài chỉ in cảnh báo.
Lượt 2026-09-29: 435 khung được dùng, 0 thiếu.

## Mô-đun cần thêm hình: `tools/extra/<mô-đun>.json`

Mỗi mô-đun (kỹ năng, trùm, phòng...) giữ MỘT tệp riêng trong `tools/extra/`, rồi chạy lại
`build_sk.py`. Không sửa `build_sk.py` để thêm tên.

```json
{
  "bundles": ["weapon", "bullet", "boss/boss08", "escape"],
  "prefabs": ["tên prefab gốc"],
  "sprites": ["regex tên sprite"],
  "clips": ["regex tên AnimationClip"],
  "png_anims": {"khoá": {"dir": "boss/boss01", "frames": ["boss01_0", "boss01_1"], "fps": 10,
                         "loop": true, "anchor": "bottom", "register": true, "bundle": "boss/boss01"}}
}
```

- `bundles` (tuỳ chọn): mẫu tên bundle 8.6, không cần `.ab`, `*` khớp cả `/` (`"boss/*"`,
  `"skin/character/knight/*"`). Nó chỉ áp cho `prefabs`/`sprites`/`clips` của **chính tệp đó**, cộng thêm vào
  họ mặc định. Mẫu không khớp bundle nào thì build in `!`.
  - `prefabs`: tìm trước ở `common`, 13 theme, `levelcommon`, `levelobjects`, rồi mới tới `bundles`.
  - `sprites`/`clips`: dò ở `common`, 13 theme, `level/difficulty`, `levelcommon`, `levelobjects`,
    `sprite_atlas`, và thêm `bundles`.
- `png_anims`: tên gọi còn từ thời kho PNG, nhưng giờ tìm khung trong bundle 8.6 trước. Thứ tự tìm:
  `"bundle"` nếu có, rồi bundle trùng tên `dir` (`boss/boss08` → `boss/boss08.ab`, `ui` → `ui.ab`,
  `hero` → `hero.ab`), rồi `sprite_atlas`, `common`, `ui`, `hero`. Phải có đủ mọi khung thì mới dùng
  bundle, không thì đọc PNG trong `~/Downloads/sk-ref/all/<dir>` (build in `!`).
  - `anchor`: `bottom` là giữa-đáy, `center` là tâm, tính trên khung đầu.
  - `register: true`: các khung sau xếp theo pivot Unity.
  - `register: false`: mỗi khung neo riêng theo ảnh của nó (hợp với dãy icon).

Kết quả nằm ở `SK_DATA.extra`: `sprites[regex] = [khung]`, `clips[tên] = khoá anim`,
`png[khoá] = khoá anim`. Prefab vào `SK_DATA.prefabs` như thường.

- Nhiều agent chạy lever cùng lúc: `build_sk.py` giữ khoá `tools/.build_lock` (mkdir) và ghi
  atlas/`sk-data.js` qua tệp tạm rồi `os.replace`, nên lượt sau chờ lượt trước.
- `SK_ATLAS.v` là mã băm các trang atlas; `engine.js` gắn `?v=` vào đường dẫn ảnh để máy người chơi
  không giữ atlas cũ khi toạ độ khung đã đổi.
- `build_design.py` chạy SAU `build_sk.py`: nó chỉ giữ vũ khí có khung trong atlas. Bản 8.6 bóc thêm
  sprite vũ khí wiki ở `weapon.ab`, `skin/...` và `boss/boss01.ab` (446/456 khớp). Chạy lại
  `build_design.py` thì có thêm vũ khí.

## Bẫy đã sập

- **Anim quái đứng yên một khung (bản 8.5.1).** `clip()` tính chỉ số đường sprite bằng số *binding* float.
  Clip nào có thêm binding vị trí (3 đường) thì chỉ số lệch, và đọc nhầm đường float thành sprite. Xem
  "Số đo phải biết".
- **Quy PPU 16 cho sprite UI làm icon mất nét.** `ui_buff_03` có PPU 32, nên ảnh 32 px bị thu còn 16 px.
  `frame_of(..., native=True)` giữ điểm ảnh gốc, dùng cho HUD và `png_anims`.
- **Duyệt `rip.files` trong khi `resolve()` nạp thêm bundle** thì Python báo "dictionary changed size".
  Hãy duyệt `rip.cabs(...)`, `rip.objects(...)` hoặc `list(...)`.
- **Tên sprite 8.6 có vài chỗ đổi hoa/thường** so với đường dẫn trong `CharacterSprites` (`AiGirl_1_0`,
  thư mục `skin/character/aigirl`). `bundle_sprites()` thử tên đúng trước rồi mới tới tên viết thường.
  Tên bundle luôn viết thường.
- **Ảnh PNG trong `sk-ref/all` đã bị cắt viền trong suốt và mất offset.** Giờ chỉ còn là đường lùi. PNG
  được neo bằng `register()` (dò độ lệch x bằng IoU mặt nạ alpha, giữ chân chạm đáy).
- **Con trỏ Unity là cặp `(m_FileID, m_PathID)`.** FileID khác 0 thì tra `externals[FileID-1]` ra tên CAB.
  Tên CAB thường có dạng `archive:/CAB-x/CAB-x`, riêng bundle cảnh có dạng
  `archive:/BuildPlayer-Multi_Room/BuildPlayer-Multi_Room.sharedAssets`. Lấy phần sau dấu `/` cuối.
- **Sprite nằm trong SpriteAtlas thì `m_RD.texture` rỗng.** Phải tra `m_RenderDataMap` của SpriteAtlas
  bằng `m_RenderDataKey`. `sprite()` nạp `m_SpriteAtlas` của sprite trước.
- **`UISprite`, `texiao_01`, `light_01`, `portal_center` là quad màu trơn dùng blend cộng.** Vẽ kiểu
  thường thì thành mảng trắng hoặc đen. Viewer bỏ qua chúng. Game phải tự vẽ quầng sáng.
- **Tường theme Forest** trong `MapManagerBR.wall_list` là bụi cây (`wall_bush1`) cộng khối đá rêu
  (`wall504`).
- **Clip `sword_sweep` (xin trong `weapons.json`) nằm ở `common` nhưng không có đường sprite.** Nó chỉ
  động Transform, nên `extra.clips` rỗng.
- **`char_hit` không vẽ gì.** Clip `char_hit` (common.ab) rỗng, dài 0,0667 s, chỉ có sự kiện `HitBack` [ĐO 2026-09-30].
  Nháy trắng khi trúng đòn là mã (material), không phải clip. State `char_dizzy` của layer 2 cũng không phải choáng: nó
  chơi clip `char_atk` (dấu "!"), vào bằng trigger `atk`.
- **Trigger dùng ở nhiều layer.** Trigger `dead` vừa chuyển layer 0 sang `dead` vừa chuyển layer 2 sang `char_tap_dead`.
  Tiêu trigger ngay ở layer 0 thì layer 2 không bao giờ thấy nó, nên `SK.smStep` tiêu trigger sau khi xét đủ các layer.
- **Sự kiện ở cuối clip bị mất khi chuyển mềm bị bỏ.** `char_hit` của nhân vật rời state ở exitTime 0,9 với chuyển 0,1 s,
  còn `HitBack` nằm ở 1,0. `SK.smStep` vẫn bắn sự kiện của clip cũ trong khoảng thời lượng chuyển.
- `python -c "..."` trong Bash tool ở máy này hỏng khi chuỗi bắt đầu bằng xuống dòng. Dùng heredoc.
  Heredoc dài có dòng `'EOF'`/ngoặc lạ cũng có lúc vỡ; khi đó ghi tệp .py rồi chạy.
- `/tmp` của Git Bash và `/tmp` mà Python thấy là hai thư mục khác nhau. Dùng đường dẫn Windows đầy đủ.
- Bộ nhớ: một lượt build ăn khoảng 2,3 GB RAM, vì phải giữ `common.ab` 50 MB và các texture đã giải.

## Đọc mã gốc: `sk_method.py`

Dịch ngược method C# của bản 8.6 (IL2CPP, ARMv7) và chú thích sẵn. Dùng nó để đọc số thật (thời lượng, bán
kính, tốc độ, công thức sát thương) thay vì đoán.

    PY=~/.pyenv/pyenv-win/versions/3.8.10/python.exe      # gọi thẳng python.exe, xem bẫy bên dưới
    export PYTHONIOENCODING=utf-8
    $PY games/soulknight/tools/sk_method.py C28Controller.RoleSkill                     # mọi overload
    $PY games/soulknight/tools/sk_method.py 'SwordMasterFlySword.<BulletMove>d__21.MoveNext'   # lớp lồng
    $PY games/soulknight/tools/sk_method.py --find 'C28Controller\.Skill2'   # regex trên "Kiểu.Method"
    $PY games/soulknight/tools/sk_method.py --type 'SwordMaster'             # regex trên tên kiểu
    $PY games/soulknight/tools/sk_method.py --fields C28Controller           # trường, offset, const, chuỗi cha
    $PY games/soulknight/tools/sk_method.py --xref C28Controller.StopSkill   # ai gọi (BL/BLX/B + ô Method(...))
    $PY games/soulknight/tools/sk_method.py --strref 'C28QuantumPulse'       # method nào dùng chuỗi này
    $PY games/soulknight/tools/sk_method.py --addr 0xA72B6938                # địa chỉ thuộc method nào
    # thêm: -n 2000 (số lệnh tối đa), --raw (bỏ chú thích), --rebuild (dựng lại cache)

Nguồn đều nằm ngoài git, ở `D:\sk86-ref` (đổi bằng biến `SK86_REF`):

- `runtime/libil2cpp_mem.so`, `runtime/dump/dump.cs`, `runtime/dump/script.json`, `runtime/global-metadata.dat`
  (config86/README mục 8).
- `config.armeabi_v7a/lib/armeabi-v7a/libil2cpp.so`: `.so` gốc trong APK, để giải các ô metadata (bẫy thứ nhất).
- Cache ở `work/sk_method/index.pkl` (150 MB). Lần đầu dựng mất khoảng 25 s. Mỗi lần gọi sau mất 4–6 s,
  `--xref` khoảng 12 s [ĐO 2026-09-30].

Đọc chú thích:

- `this.x?`: trường đoán theo offset, có tính lớp cha. `(Kiểu).x?` là đối tượng lấy từ trường có kiểu đã biết,
  ví dụ `<>4__this` của coroutine trỏ về lớp ngoài.
- `TypeInfo(...)`, `Method(...)`, `Field(...)`, `"chuỗi"`: ô metadata usage. `Kiểu.f (static)` là đọc
  `static_fields` sau `TypeInfo`.
- `vtable[k] X.M` và `gọi ảo X.M`: gọi ảo, tên lấy theo `Slot` trong dump.cs.
- `[qua thunk]`: `bl` đi qua veneer của linker (`b X` hoặc `movw/movt ip; add ip, pc; bx ip`). `@plt` là hàm nhập
  (`memcpy`, `__cxa_throw`...).
- Tên hàm runtime il2cpp (`ThrowNullReferenceException`, `il2cpp_codegen_object_new`, `WriteBarrier`...) do mình
  đặt theo ngữ cảnh gọi, xem `RUNTIME` trong mã. Tên có `?` là đoán yếu.
- Gần như mọi method mở đầu bằng khối vá nóng IFix: `WrappersManagerImpl.IsPatched` rồi `__Gen_Wrap_N`. Thân thật
  nằm sau nhánh `beq` đầu tiên.

Đã kiểm [ĐO 2026-09-30]:

- Offset trong `libil2cpp_mem.so` chính là RVA của dump.cs, gốc VA `0xA170A000`. Cả 344.832 hàm có địa chỉ đều giải
  ra ARM. Thử Thumb thì ra rác ngay lệnh đầu.
- `SwordMasterFlySword..ctor` nạp bảng float `[35, 45, -0.2, 0.2]` rồi ghi một lượt vào `startSpeed`, `endSpeed`,
  `backSpeed`, `moveTime`. Nó cũng ghi `endMoveTime` = `backTime` = `lookOffsetY` = 0,3 và `rotateTime` = 0,18.
- `C28Controller.GetSkill2MaxFieldSideLength` đọc `this.skill2MaxLength` (0x4E4, prefab trong `decoded/mb/hero.json`
  = 15) rồi kẹp vào [0, 20]. Số 20 khớp const `Skill2MaxFieldSideLength = 20` trong dump.cs.
- Thử bộ giải ô trên các ô mà Il2CppDumper đã đặt tên thì trùng tên ở 98.209/98.214 Method, 34.310/34.330 TypeInfo,
  1.752/1.752 Field và 63.104/63.104 chuỗi. Chỗ lệch chỉ là cách viết tên generic lồng sâu.

Bẫy đã sập:

- **script.json thiếu tên của khoảng 26.100 ô metadata.** Game đã dùng các ô này trước lúc dump, nên chúng chứa con
  trỏ heap chứ không còn số mã hoá, và Il2CppDumper bỏ qua. Số mã hoá gốc (`loại<<29 | chỉ số<<1 | 1`) vẫn nằm ở
  cùng RVA trong `.so` của APK, nên tool tự giải. Ví dụ: `C28Controller.OnEnable` tạo `System.Action` qua ô
  `0xE3F30B8`, và ô này chỉ có tên nhờ bước giải đó. Loại 7 là `FieldRva`.
- **Ô metadata đi qua GOT.** `ldr rX, [pc, #lit]` rồi `ldr rX, [pc, rX]` chỉ cho *địa chỉ* ô. Phải thêm
  `ldr rX, [rX]` mới ra TypeInfo. `--strref`/`--xref` quét cả kiểu trỏ thẳng lẫn kiểu qua GOT. Quét kiểu trỏ thẳng
  thì không ra gì.
- **Mỗi nửa lấy từ một bản.** Bảng `methodSpecs` trong `.rodata` của `.so` gốc bị che từ quãng giữa trở đi, còn trong
  ảnh bộ nhớ thì sạch. Ngược lại, `Il2CppType` của lớp/struct trong bộ nhớ đã bị thay chỉ số TypeDef bằng con
  trỏ vào metadata, và vài `Il2CppType` bằng 0. Phần này phải đọc từ `.so` gốc.
- **vtable của `Il2CppClass` 32-bit ở `0xC0`**, không phải `0xBC` như cộng theo il2cpp.h. Đo bằng
  `C28Controller.RoleSkill`: nó gọi `[klass, #0x4b8]`, tức slot 127 = `RoleSkillEnd`. `static_fields` ở `0x5C`,
  `cctor_finished` ở `0x74`.
- **Offset trường lớn không vừa lệnh.** Offset > 0xFFF (hoặc > 1020 với `vldr`) được dựng bằng `movw` + `add`, rồi
  mới `vldr sN, [rX]`. Tool bắt mẫu này, ví dụ `this.skill2MaxLength` ở trên.
- **Luật "3/4 word đầu mang điều kiện AL" nhận nhầm 1.765 hàm ngắn là Thumb.** Hàm mở đầu bằng lệnh NEON
  (`vmov.i32`, điều kiện 0xF) cũng bị nhầm. Giờ tool chỉ xét word đầu (0xE/0xF, giải được ở ARM).
- **`python` của pyenv là tệp `.bat`.** cmd hiểu `<BulletMove>d__21` thành chuyển hướng tệp, nên báo "The system
  cannot find the file specified". Gọi thẳng `~/.pyenv/pyenv-win/versions/3.8.10/python.exe`. Còn `py -3.8` trỏ tới
  `D:\python3.8.10`, bản này không có capstone.
- `| head` trên Windows làm Python báo `OSError 22` khi ống đóng. Tool đã nuốt lỗi này.

Giới hạn: tool đọc tuyến tính, không theo nhánh, nên trạng thái thanh ghi có thể sai sau điểm hợp nhánh. Offset
trường struct trong dump.cs tính cả header 8 byte; truy cập qua con trỏ struct thì phải tự trừ 8. Gọi qua interface
chỉ ra `GetInterfaceInvokeData?`, chưa ra tên method.
