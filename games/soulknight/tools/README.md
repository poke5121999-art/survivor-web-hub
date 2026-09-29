# Công cụ bóc Soul Knight

Sinh `art/sk/atlas*.png` và `data/sk-data.js` từ bản rip Soul Knight 8.5.1 nằm ngoài git:

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py

Chạy khoảng 3 phút. Đọc hai nguồn:

- `~/Downloads/sk-ref/_ab/*.ab`: 25 bundle Unity còn giữ (`common`, `level__*`, `levelcommon`,
  `levelobjects`, `sprite_atlas`, `scene_game`...). File xapk gốc đã bị xoá khỏi máy.
- `~/Downloads/sk-ref/all/`: 94.070 PNG đã bóc trước đó. Chỉ dùng cho hình nhân vật, vì bundle skin
  không còn.

Soát bằng mắt: phục vụ repo (`python -m http.server 8811`) rồi mở
`games/soulknight/tools/viewer.html?g=forest` (hoặc `heroes`, `prefabs`, tên theme khác). Chữ thập
đỏ là điểm neo của khung.

## Tệp

| Tệp | Việc |
|---|---|
| `skrip.py` | Đọc bundle. Giải con trỏ chéo tệp, cây GameObject, sprite kèm điểm neo, clip hoạt ảnh, AnimatorController. |
| `pack.py` | Gói khung vào trang atlas 2048, lề 2 px. Khung trùng điểm ảnh và trùng điểm neo chỉ lưu một lần. |
| `build_sk.py` | Chọn cái gì vào game và ghi `sk-data.js`. |
| `viewer.html` | Trang soát hoạt ảnh, điểm neo, prefab. |

## `sk-data.js` chứa gì

- `SK_ATLAS.f[tên] = [trang, x, y, w, h, ax, ay]`. `(ax, ay)` là pivot Unity tính bằng điểm ảnh từ
  góc trên-trái của ảnh đã cắt. Đặt điểm này vào vị trí thế giới của vật.
- `anims[khoá] = {f, d, loop, ev?}`: khung và số giây mỗi khung, giải từ AnimationClip thật.
- `enemies`: cấu hình prefab quái thật [ĐO]. Gồm `RoleAttribute` (máu, tốc độ), lớp AI `EnemyAIxx`
  kèm tham số, súng `EGunxxx` (atk, bullet_speed, deviation, count, angle), vị trí tay và nòng.
- `themes`: 13 theme của ải 1 đến 3. Mỗi theme có màu nền camera, cấu hình từng ải
  (`map_long`, `chest_level`, `roomSpacing`), danh sách quái và bản tinh anh, bộ sàn/tường
  (`tiles`), và bảng ký hiệu mẫu phòng → prefab (`lib`, từ `RoomElementLibrary`).
- `patterns`: 282 mẫu phòng thật (`patternroom.ab`). Mỗi mẫu có cỡ, vật cản, điểm sinh quái, tỉ lệ
  tinh anh `ex`, ngân sách điểm quái `pts`, số đợt `waves`.
- `prefabs`: rương, cửa, cổng, tiền, bình, hiệu ứng trúng/nổ, tượng buff, thương nhân, NPC sảnh.
  Mỗi phần có vị trí, thứ tự vẽ, màu nhuộm, hoạt ảnh, collider, tham số MonoBehaviour.
- `heroes[thư mục].s0 = {idle, run, dead}`: 42 nhân vật, lấy từ `CharacterSprites`.
- `hud`: cây RectTransform của Canvas màn chơi (`scene_game`), gồm neo, cỡ, cỡ chữ.
  Phần lớn sprite UI nằm ở bundle đã mất, nên chỉ có bố cục, không có hình.
- `sprites.bullets`: 140 sprite `bullet_N` của `common`/`sprite_atlas`.

## Số đo phải biết [ĐO 2026-09-29]

- 1 đơn vị Unity = 16 px (`m_PixelsToUnits`). Tốc độ trong `enemies` vẫn tính bằng đơn vị/giây.
- Điểm neo của ảnh đã cắt: `ax = pivot.x * rect.w - offset.x`, `ay = h_cắt + offset.y - rect.h * pivot.y`.
  `offset` là `m_RD.textureRectOffset`.
- Hoạt ảnh sprite nằm trong `m_StreamedClip`: từng khung là `(time, số khoá)`, mỗi khoá gồm
  `(chỉ số đường cong, 4 float)`. Float thứ tư là chỉ số vào `pptrCurveMapping`. Khung đầu có
  `time = -FLT_MAX`, là giá trị khởi đầu.
- Nhân vật: 8 khung đứng, 8 khung chạy, 1 khung chết, 16 khung/giây. Con số đo từ clip
  `npc_knight_ide`.
- Phòng đánh có bốn cỡ: 15×15, 15×21, 21×15, 21×21. Phòng rương 11×11, phòng bán hàng 25×15.

## Bẫy đã sập

- **Ảnh PNG trong `sk-ref/all` đã bị cắt viền trong suốt và mất offset.** Ghép thẳng thì khung nhảy
  lệch. Hình nào còn bundle thì đọc lại từ bundle để có pivot thật. Nhân vật không còn bundle, nên
  `register()` dò độ lệch x của từng khung so với khung đứng đầu tiên, bằng IoU mặt nạ alpha, giữ
  chân chạm đáy.
- **Con trỏ Unity là cặp `(m_FileID, m_PathID)`.** FileID khác 0 thì tra
  `externals[FileID-1]` ra tên CAB. Hai CAB mất nhiều nhất là `CAB-7129e9...` (22 lượt, chứa prefab
  đạn của quái) và `CAB-a3678d...` (21 lượt, âm thanh). Vì thế hầu hết súng quái có `bullet: '?missing'`.
- **Sprite nằm trong SpriteAtlas thì `m_RD.texture` rỗng.** Phải tra `m_RenderDataMap` của SpriteAtlas
  bằng `m_RenderDataKey`. Code ở `skrip.Rip.sprite`.
- **`UISprite`, `texiao_01`, `light_01`, `portal_center` là quad màu trơn dùng blend cộng.** Vẽ kiểu
  thường thì thành mảng trắng hoặc đen. Viewer bỏ qua chúng. Game phải tự vẽ quầng sáng.
- **Tường theme Forest** trong `MapManagerBR.wall_list` là bụi cây (`wall_bush1`) cộng khối đá rêu
  (`wall504`). Ảnh bản đồ 1-x trên wiki (trang Forest) cho thấy đúng thế: sàn xanh ngọc, tường bụi cây,
  thỉnh thoảng một khối đá.
- `python -c "..."` trong Bash tool ở máy này hỏng khi chuỗi bắt đầu bằng xuống dòng. Dùng heredoc.
- `/tmp` của Git Bash và `/tmp` mà Python thấy là hai thư mục khác nhau. Dùng đường dẫn Windows đầy đủ.

## Mô-đun cần thêm hình: `tools/extra/<mô-đun>.json`

Mỗi mô-đun (kỹ năng, trùm, phòng...) giữ MỘT tệp riêng trong `tools/extra/`, rồi chạy lại
`build_sk.py`. Không sửa `build_sk.py` để thêm tên.

```json
{
  "prefabs": ["tên prefab gốc trong common/levelcommon/levelobjects/level__*"],
  "sprites": ["regex tên sprite"],
  "clips": ["regex tên AnimationClip"],
  "png_anims": {"khoá": {"dir": "boss/boss01", "frames": ["boss01_0", "boss01_1"], "fps": 10,
                         "loop": true, "anchor": "bottom", "register": true}}
}
```

Kết quả nằm ở `SK_DATA.extra`: `sprites[regex] = [khung]`, `clips[tên] = khoá anim`,
`png[khoá] = khoá anim`. Prefab vào `SK_DATA.prefabs` như thường. `png_anims` đọc PNG trong
`~/Downloads/sk-ref/all` (bundle không còn), nên dò điểm neo bằng `register()` như nhân vật.

- Nhiều agent chạy lever cùng lúc: `build_sk.py` giữ khoá `tools/.build_lock` (mkdir) và ghi
  atlas/`sk-data.js` qua tệp tạm rồi `os.replace`, nên lượt sau chờ lượt trước.
- `SK_ATLAS.v` là mã băm các trang atlas; `engine.js` gắn `?v=` vào đường dẫn ảnh để máy người chơi
  không giữ atlas cũ khi toạ độ khung đã đổi.
- `build_design.py` chạy SAU `build_sk.py`: nó chỉ giữ vũ khí có khung trong atlas.
