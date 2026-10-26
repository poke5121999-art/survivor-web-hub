# My Mini Mart (bản web, không Unity)

Làm lại My Mini Mart (Kiseki Games / Supersonic) bằng three.js r160 và JavaScript thuần, không có bước build: đủ 14 mart theo thứ tự `RC_MartOrder` (Grocer, Cafe, Pizza, Blueberry, Burger, Sushi, Mexican, Dessert, Cinema, Hotdog, Fairground, Seafood, Ratatouille, Campsite). Hub id vẫn là `casual-farm`.

- Chạy: mở `index.html`. Tham số: `?fresh` bỏ qua bản lưu, `?bot` cho máy tự chơi, `?mart=store9` mở thẳng một mart (để kiểm).
- Bản Unity WebGL cũ (150 MB, repo Pages riêng `poke5121999-art/my-mini-mart-web`) vẫn mở được qua `unity.html`.
- Nguồn: APK `My+Mini+Mart_1.89.5_APKPure.xapk`, bóc ra ở `D:\minimart-ref` (ngoài git). Cách bóc ghi ở `brain/plans/my-mini-mart-web.md`.

## Vì sao làm lại

Chủ dự án yêu cầu ngày 2026-10-26: nạp nhẹ hơn, lúc đầu mờ rồi rõ dần, sát bản gốc hơn, ít lỗi hơn bản Unity.

- Dung lượng [ĐO TRONG REPO]: mỗi lần mở chỉ nạp một mart, khoảng 3,9 MB chưa nén (14 mart cộng lại khoảng 22 MB trong repo; tiếng 2 MB, nhạc nền chỉ tải sau lần chạm đầu). Gồm `art/store1/scene.json` 818 KB, `art/anim/clips.json` 1,4 MB, `art/store1/geo.glb` 772 KB, `art/items/items.glb` 623 KB và texture. Bản Unity nặng 150 MB.
- Mờ rồi rõ: `main.js` đặt `filter: blur()` lên canvas theo bốn chặng. `boot` 14px, có hình khối thì `geometry` 8px, có hoạt ảnh thì `animation` 5px, có đủ texture thì `textures` 0px. Texture nạp bản 16px (`*.lq.webp`) trước rồi mới thay bản đầy đủ.

## Bố cục

- `tools/` chứa các bộ xuất Python (py -3.12, UnityPy 1.25 + TypeTreeGeneratorAPI). Mọi bộ đều đọc `D:\minimart-ref` qua `tools/mm.py`.
  - `export_marts.py [store3 ...]` chạy ba bộ dưới cho từng mart (bảng mart → scene `levelN` nằm trong file) rồi ghi `data/marts.json` (thứ tự, tên mart lấy từ `GameManager.martNameList`).
  - `export_store.py level1 store1` ghi `art/store1/scene.json` (cây node, transform, MonoBehaviour field), `geo.glb` (meshopt) và `art/tex/`. Store 9–14 có thêm hai prefab ô mua dưới root ẩn `__Prefabs`.
  - `export_anim.py` ghi `art/anim/clips.json` và `controllers.json` (state machine của Animator).
  - `export_items.py` ghi `art/items/` (mesh và icon của 136 loại hàng).
  - `export_data.py Store store1` ghi `data/store1.json` (giá ô, tiền đầu, giá hàng, lấy từ `RC_MartProgression`). Store 9–14 dựng ô từ CSV `Store_N_Progression` như `ProgressionData.CreateProgressData`; với Store 9 kết quả khớp `RC_MartProgression_Store_9` 38/38 ô (in ra khi chạy).
  - `export_navmesh.py store1` ghi `art/store1/navmesh.json` (polygon Detour và NavMeshObstacle).
  - `export_audio.py` ghi `art/sfx/` (43 clip mp3 + `sfx.json` sự kiện → clip, âm lượng gốc). Cần ffmpeg và vgmstream.
  - `export_ui.py` ghi `art/ui/` (sprite HUD, layout uGUI).
  - `stamp.js <rev>` gắn `?v=<rev>` cho mọi module trong import map của `index.html`. Chạy mỗi lần tăng `rev`.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node. Sim phát sự kiện vào `sim.events`, view đọc rồi xoá.
  - `store.js` dựng mô tả tĩnh của cửa hàng từ `scene.json`: ô mua, máy sản xuất, kệ, quầy, khách, người chơi.
  - `sim.js` giữ trạng thái: tiền, hàng mang theo, trả tiền ô, sản xuất, nâng sức mang, lưu/nạp.
  - `customers.js`, `workers.js`, `thief.js`, `tasks.js` (15 bước hướng dẫn đọc từ `TaskController`), `grid.js` + `nav.js` (tìm đường), `bot.js`.
  - Máy: cây (tự sinh), máy 1–4 đầu vào (mỗi đầu vào một ô thả riêng), ao cá, xe thu hoạch (đi 2,5 s, về 2,5 s, nhả từng món 0,2 s).
  - Nâng cấp (`Sim.upgradeOffer` / `buyUpgrade`): người chơi mang 3→7; máy tốc độ ×1,2…×1,8 và sức chứa 4/6/8; nhân viên tốc độ 9→15 và mang 3→6. Giá gốc P/W là giá ô đã mở khoá máy/nhân viên đó (suy từ `MatActivateController.c:1939`).
  - Lưu: `mmm-global-v1` (mart đang ở, tiền dùng chung, giờ lưu) và `mmm-<store>-v1` cho từng mart.
- `js/view/` vẽ: `world.js` (cảnh), `toon.js` (shader Toony Colors Pro 2 và viền), `anim.js` (rig), `game.js` (đồ chồng, khách, nhân viên, trộm, xe van, xe thu hoạch, hiệu ứng), `camera.js` (lia tới đồ vừa mở 1 s sau khi mua, 2 s mỗi mục tiêu), `sound.js` (tiếng theo sự kiện, nhạc nền), `hud.js` (DOM: tiền, joystick, nhãn giá, bong bóng khách, banner hướng dẫn, mũi tên, menu Next Mart, menu nâng cấp, tiền lúc vắng mặt).

Mọi con số luật chơi có dẫn nguồn trong `D:\minimart-ref\rules\*.md`, ghi theo `Tệp.c:dòng` của bản decompile.

## Kiểm

- `node test/casual-farm-sim.js` cho bot chơi 90 phút mô phỏng. `MM_MINUTES=200` thì phải mua đủ 40/40 ô, xong 15/15 bước hướng dẫn, bản lưu nạp lại đúng. `MM_STORE=store5` chạy mart khác (bot mang sẵn tiền đủ ba ô đầu, như tiền mang từ mart trước).
- `node test/casual-farm-nav.js` kiểm tìm đường và va chạm.
- `node test/casual-farm-play.js` chạy trình duyệt thật: nạp không lỗi, mờ rồi rõ, module có `?v=`, phím W đi được, bot mua ô và có khách trả tiền, tải lại giữ tiến trình, menu nâng cấp mua được, ô Next Mart chở sang Store 2 giữ nguyên tiền, Store 9 dựng ô từ CSV, có bảng tiếng. Thêm `MM_URL=<địa chỉ Pages>` để kiểm bản trên mạng.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` TypeTreeGenerator đọc lệch MonoBehaviour: `m_Script` ra FileID `1<<24`. Phải bật cờ align cho `m_Enabled` trước `TypeTreeNode.from_list`. Vá cây đã dựng thì không ăn (`mm.mb_node`).
- `[BẪY ĐÃ SẬP]` Có mesh nằm trong `unity default resources` và trong bundle addressable `defaultlocalgroup`. Thiếu hai nguồn này thì mất mesh.
- `[BẪY ĐÃ SẬP]` Mesh skin một xương chỉ có `BlendIndices`, trọng số ngầm là 1. Mesh nén có trọng số thứ tư đọc ra rác (-28), phải tính lại bằng `1 - tổng ba cái kia`.
- `[BẪY ĐÃ SẬP]` meshopt đổi tên node và gói ma trận dequant vào node. Tên glTF phải là `m<i>`, và ma trận ấy phải nhân vào cả bindpose.
- `[BẪY ĐÃ SẬP]` Đổi texture 16px sang bản đầy đủ mà không `dispose()` thì `texSubImage2D` tràn.
- `[BẪY ĐÃ SẬP]` `Object3D.clone` chép `userData` bằng JSON, mà `userData.rig` trỏ ngược về object nên chép vòng. Nhân bản khách phải gỡ rig ra trước (`GameView.customerObject`).
- `[BẪY ĐÃ SẬP]` Nhiều mesh trong cảnh là mốc mà code gốc tắt lúc chạy: ô xếp hàng quầy (`SlotCashierQueueController`), điểm xe RV (`SlotRVController`, `MeshDisablerController`), vợt và vòng đuổi trộm của người chơi. Danh sách nằm ở `GameView.hideDebug`.
- `[BẪY ĐÃ SẬP]` Vật cản xoay theo trục X (`shelf01.001`) và vật cản cỡ 0 (`Basket_Large`) từng hút người chơi vào tâm. `footprint()` trong `nav.js` lấy hai trục nằm ngang nhất và bỏ qua hộp suy biến.
- `[BẪY ĐÃ SẬP]` Bot chèn vào trang bằng `page.evaluate` bị joystick ghi đè mỗi khung, vì `main.js` gọi `setInput` khi không có `?bot`. Test dùng `?bot`.

- `[BẪY ĐÃ SẬP]` Mọi mart ghi texture chung `art/tex/`, mà mỗi mart có "palette" riêng, Store 9 còn có cả `Palette` (trên Windows là cùng một file). Store 2 hiện trắng bệch vì palette bị ghi đè. Tên file giờ kèm 8 ký tự md5 của điểm ảnh (`save_texture`).
- `[BẪY ĐÃ SẬP]` Navmesh mỗi scene có cả bản đồ thành phố ở x ≈ -1000; ở Store 2 vùng đó lớn hơn sàn cửa hàng nên "vùng lớn nhất" kéo người chơi sang đó. `NavMesh(json, home)` chọn vùng chứa điểm xuất phát.
- `[BẪY ĐÃ SẬP]` NavMeshData của Store 6 có position/rotation khác 0; phải áp vào toạ độ tile trước khi đổi hệ trục.
- `[BẪY ĐÃ SẬP]` Tiếng của `sharedassets0/1/12/18` nằm trong file `.resource` rời trên đĩa. UnityPy không mở nên đọc ra `FmodError: FORMAT`; đọc byte FSB5 thẳng từ file rồi giải bằng vgmstream.
- `[BẪY ĐÃ SẬP]` Heredoc của Bash nuốt `\r` trong đường dẫn `D:\minimart-ref\rules` (thành ký tự CR). Sửa file Python có dấu `\` bằng công cụ Edit.

## Còn thiếu

- Không làm phần gắn với quảng cáo và mua trong app: xe RV, boost, gem, coupon, vòng quay, trang phục, mũ, thú cưng, bản đồ thành phố, mart theo mùa (Halloween, Giáng Sinh...), Big Mart.
- Khách VIP và khách đi xe (`_ActivateCarCustomer`) chưa có: chỉ bật cờ, không sinh khách.
- Hệ số tốc độ máy lấy theo bảng `S`; nhân viên cùng `workerSection` khác 0 chưa nâng cấp chung.
- Bán kính "người chơi đứng gần quầy" khi tung xu ra trộm là đoán (8 m); trộm mượn thân khách vì prefab trộm chưa bóc.
- Store 9–14: thu nhập mỗi khách vẫn theo bảng giá chung (giá tối đa 10), nên mất nhiều giờ chơi; `pricing.md` xác nhận bản gốc không nhân thêm hệ số nào.
