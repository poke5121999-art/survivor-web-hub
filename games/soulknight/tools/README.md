# Công cụ bóc Soul Knight

Sinh `art/sk/atlas*.png` và `data/sk-data.js` từ bản cài Soul Knight **8.6.0** nằm ngoài git:

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py            # ghi vào game
    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py --out DIR  # build thử ra DIR/art/sk + DIR/data
    node games/soulknight/tools/check_keys.js [--out DIR]                         # soát khoá, xem dưới

Chạy khoảng 2,5 phút [ĐO 2026-09-29]. Nguồn:

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
- `anims[khoá] = {f, d, loop, ev?}`: khung và số giây mỗi khung, giải từ AnimationClip thật.
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
- `python -c "..."` trong Bash tool ở máy này hỏng khi chuỗi bắt đầu bằng xuống dòng. Dùng heredoc.
  Heredoc dài có dòng `'EOF'`/ngoặc lạ cũng có lúc vỡ; khi đó ghi tệp .py rồi chạy.
- `/tmp` của Git Bash và `/tmp` mà Python thấy là hai thư mục khác nhau. Dùng đường dẫn Windows đầy đủ.
- Bộ nhớ: một lượt build ăn khoảng 2,3 GB RAM, vì phải giữ `common.ab` 50 MB và các texture đã giải.
