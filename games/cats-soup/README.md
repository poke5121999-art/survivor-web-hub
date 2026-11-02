# Mèo & Súp (Cats&Soup, bản web, không Unity)

Làm lại Cats&Soup 5.3.0 (HIDEA, `com.hidea.cat`) bằng three.js r160 và JavaScript thuần, theo cách My Mini Mart (`games/casual-farm`). Không có bước build. Kế hoạch và tiến độ ở `brain/plans/cats-soup.md`.

- Nguồn: XAPK `Cats&Soup_+Relaxing+Cozy+Games_5.3.0_APKPure.xapk` (2,9 GB), bóc ở `D:\catsoup-ref` (ngoài git). Unity 6000.0.60f1, IL2CPP ARMv7, metadata v31.
- Asset pack là 25.308 file serialized tên hash (mỗi prefab của `Resources` một file) cộng `level0-9` và `sharedassets0-9`. Cảnh chính là `level2` (`Assets/Scenes/main.unity`).

## Bố cục

- `tools/` là các bộ xuất Python (`py -3.12 -I`, UnityPy 1.25). Mọi bộ đọc `D:\catsoup-ref` qua `D:\catsoup-ref\tools\cns.py`, nạp từng file một (nạp cả thư mục Data giữ hàng chục GB commit).
  - `export_prefabs.py <out> <root>...` ghi `art/<out>/scene.json` + `geo.glb` (meshopt) + `art/tex/*.webp`. Root là đường dẫn `Resources` (`places/place1`) hoặc `<file>:<path id>`; `@list.txt` đọc danh sách. Thêm SpriteRenderer (quad theo rect / pixelsToUnits quanh pivot, texture là ảnh sprite đã cắt) và render state của shader (`passes`, lấy từ `D:\catsoup-ref\shaders\states.json`).
  - `export_places.py` xuất prefab trạm của mọi Work rừng chính (`eventType` 0) thành `art/places<k>/`, 12 trạm một nhóm; `data/places.json` = work index -> nhóm.
  - `export_anim.py` ghi `art/anim/controllers.json` (controller `cat1`, 268 state) rồi gọi `split_clips.py` tách 245 clip ra `art/anim/clips/<n>.json` + `clip-index.json`.
  - `export_ui.py` ghi 31 atlas NGUI (`art/ui/atlases.json`) và `--layout level2` ghi `art/ui/hud.json` (cây `UI Root/mainUI`).
  - `export_audio.py` ghi `art/sfx/*.mp3` + `sfx.json` (202 clip).
  - `export_data.py` ghi `data/tables.json` (các bảng `Entity_*` cần dùng) và `data/lang-vi.json` (bảng chữ tiếng Việt chính thức, tiếng Anh lấp khoá thiếu).
- `js/view/shaders.js` port shader gốc (GLSL ES 3 lấy từ blob của Shader, `D:\catsoup-ref\shaders\*.glsl`): họ `Outline*` (bảng màu x ambient x2, viền thân lộn ngược theo pháp tuyến x `_OutlineWidth` x alpha màu đỉnh, viền sáng theo `_LightFromX` hoặc `_Lighting`), `EyeAmbient`, `SpritesDefaultModded` (premultiplied). Dự án gốc vẽ trong gamma space nên texture đọc thô (`NoColorSpace`) và renderer xuất `LinearSRGBColorSpace`, không đổi hệ màu.
- `js/view/world.js` dựng prefab từ `scene.json` + `geo.glb`; `js/view/anim.js` chạy controller với clip nạp khi cần; `js/view/ngui.js` dựng lại cây NGUI thành DOM trên màn ảo 1080x1920; `js/view/camera.js` camera chéo 135 độ, nghiêng 30 độ, trực giao.
- `viewer.html?lib=<out>[&keys=..][&anim=<state>][&bounds=1]` xem một export; `uitest.html` xem riêng HUD. Chụp bằng `node test/cats-soup-shot.js "<trang>" <out.png> [w h]`.

## Số đo

- Camera chính: trực giao, half-height 1,7, near -10, far 30, nền `(0.427, 0.557, 0.329)`; cha `cam` ở (-6, 5, 6) quay y 135 độ, `Main Camera` quay x 30 độ.
- Ô đất `tile_base` và mép `edge_base` rộng 1,5 x 1,5 đơn vị. Bản đồ là `field_color_map_0..8` (16x16, cấp 8 là 32x32): trắng là bãi cỏ, đỏ là lối vào, xanh lá/xanh dương là cầu sang bản đồ phụ.
- UIRoot: FixedSize 1080x1920, fitWidth và fitHeight.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` Giá trị trong bảng `Entity_*` là ObscuredTypes của Anti-Cheat Toolkit; giá trị thật là `fakeValue` (`fakeValueActive` 1). `hiddenValue` là giá trị XOR khoá.
- `[BẪY ĐÃ SẬP]` `py -3.12 -I` bỏ qua `PYTHONIOENCODING`, in tiếng Hàn/Việt ra console là crash cp1252. Gọi `sys.stdout.reconfigure(encoding='utf-8')`.
- `[BẪY ĐÃ SẬP]` unzip của Git Bash bỏ sót `assets/bin/Data/Managed/*` trong `base_assets.apk` (không báo lỗi khớp được ở lần đầu, báo "filename not matched" khi chỉ định). Giải bằng `zipfile` của Python.
- `[BẪY ĐÃ SẬP]` Mặt mèo thủng một lỗ màu nền: submesh mắt dùng `Custom/EyeAmbient` là `Blend SrcAlpha OneMinusSrcAlpha`, ZWrite Off. Vẽ nó như vật đục thì chỗ trong suốt của texture mắt ghi đè lông mặt. Render state giờ đi theo `passes` của từng shader.
- `[BẪY ĐÃ SẬP]` `ResourceManager` của level2 đọc bằng type tree sinh ra thì lỗi `read_int out of bounds`; đọc PPtr thô theo thứ tự field trong `dump.cs` (`D:\catsoup-ref\resourcemanager.json`).
- `[BẪY ĐÃ SẬP]` Animator trong prefab mèo có `m_Controller` rỗng (gán lúc chạy từ `ResourceManager.controller_cat`), nên runtime phải tự gắn controller `cat1`.
- `[BẪY ĐÃ SẬP]` Mèo nằm nghiêng: clip của game này lưu Euler theo thứ tự quaternion `qZ·qY·qX`, không phải `qY·qX·qZ` như My Mini Mart. Đo bằng cách quay rest pose của xương Pelvis qua cả 6 thứ tự rồi so với quaternion của Transform; Z·Y·X lệch 0,004, các thứ tự khác lệch trên 0,3. Sửa ở `export_anim.py`.
- `[BẪY ĐÃ SẬP]` Giá món ra 0: tính `10^costDigit`, `10^icpt`, `10^(L·slope)` riêng rồi nhân thì BigNumber cắt số lẻ ở bước giữa. Gộp số mũ rồi gọi `pow10` một lần (`gradeRaw` trong `js/sim/economy.js`).
- `[BẪY ĐÃ SẬP]` `gradeValue` gốc cộng thêm 400 (và cộng cấp khi dưới 1e4). Rules đánh dấu chưa chắc; clip `LdkzNl0Bv3A` xác nhận: tô súp đầu bán 446 = (5,5 + 400 + 1) x 1,1. Hệ số giá nâng cấp x10 khớp `8las9YPqbvk` ("Lv.91 18b").
- `[BẪY ĐÃ SẬP]` Đèn lồng to gấp chục lần khi bù scale của cha. Gắn thẳng vào `handLight/p` như prefab gốc, không bù.
- `[BẪY ĐÃ SẬP]` Số cấp trên biển không thấy: `text_lv` có scale 0,03, nên mặt phẳng chữ phải là 5x5 trong không gian của nó.
- `[BẪY ĐÃ SẬP]` Mèo đi giật lùi: lúc đi, hướng là `atan2(dx, dz) + π` (mặt mèo ở -z của rig). Mèo đứng ở trạm thì chép quaternion của anchor, không lật.
- `[BẪY ĐÃ SẬP]` Súp màu cam: `OutlineLightColor` nhân màu với `_MainColor` của material, không phải `_Color`.

## Deploy

- Tăng rev: `node games/cats-soup/tools/stamp.js <rev>` (ghi `?v=` vào import map, `globalThis.CS_V` cho fetch), sửa `rev:` của thẻ trong `data/games.js`.
- Cây làm việc chung có thay đổi chưa commit của agent khác, nên commit bằng `py -3.12 -I games/cats-soup/tools/deploy.py <rev> "<message>" [--stub=<feature đang dở>] [--desc=<vi>||<en>] --push` (index tạm dựng từ `origin/main`, thẻ hub sửa trên bản `data/games.js` của `origin/main`). Chạy không `--push` trước, `git archive <sha>` ra thư mục tạm và chạy test trình duyệt trên đó.
- Kiểm trên Pages: `CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-play.js`. Chụp bản online: `CS_WAIT=8000 node test/cats-soup-shot.js "<URL đầy đủ>" out.png 540 960` (HUD tải atlas qua mạng chậm hơn `__ready`).
