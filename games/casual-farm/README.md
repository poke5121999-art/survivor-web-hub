# My Mini Mart (bản web, không Unity)

Làm lại cửa hàng đầu tiên (Store 1) của My Mini Mart (Kiseki Games / Supersonic) bằng three.js r160 và JavaScript thuần, không có bước build. Hub id vẫn là `casual-farm`.

- Chạy: mở `index.html`. Có thêm hai tham số: `?fresh` bỏ qua bản lưu, `?bot` cho máy tự chơi.
- Bản Unity WebGL cũ (150 MB, repo Pages riêng `poke5121999-art/my-mini-mart-web`) vẫn mở được qua `unity.html`.
- Nguồn: APK `My+Mini+Mart_1.89.5_APKPure.xapk`, bóc ra ở `D:\minimart-ref` (ngoài git). Cách bóc ghi ở `brain/plans/my-mini-mart-web.md`.

## Vì sao làm lại

Chủ dự án yêu cầu ngày 2026-10-26: nạp nhẹ hơn, lúc đầu mờ rồi rõ dần, sát bản gốc hơn, ít lỗi hơn bản Unity.

- Dung lượng [ĐO TRONG REPO]: trang nạp khoảng 3,9 MB chưa nén. Gồm `art/store1/scene.json` 818 KB, `art/anim/clips.json` 1,4 MB, `art/store1/geo.glb` 772 KB, `art/items/items.glb` 623 KB và texture. Bản Unity nặng 150 MB.
- Mờ rồi rõ: `main.js` đặt `filter: blur()` lên canvas theo bốn chặng. `boot` 14px, có hình khối thì `geometry` 8px, có hoạt ảnh thì `animation` 5px, có đủ texture thì `textures` 0px. Texture nạp bản 16px (`*.lq.webp`) trước rồi mới thay bản đầy đủ.

## Bố cục

- `tools/` chứa các bộ xuất Python (py -3.12, UnityPy 1.25 + TypeTreeGeneratorAPI). Mọi bộ đều đọc `D:\minimart-ref` qua `tools/mm.py`.
  - `export_store.py level1 store1` ghi `art/store1/scene.json` (cây node, transform, MonoBehaviour field), `geo.glb` (meshopt) và `art/tex/`.
  - `export_anim.py` ghi `art/anim/clips.json` và `controllers.json` (state machine của Animator).
  - `export_items.py` ghi `art/items/` (mesh và icon của 136 loại hàng).
  - `export_data.py Store store1` ghi `data/store1.json` (giá ô, tiền đầu, giá hàng, lấy từ `RC_MartProgression`).
  - `export_navmesh.py` ghi `art/store1/navmesh.json` (polygon Detour và NavMeshObstacle).
  - `export_ui.py` ghi `art/ui/` (sprite HUD, layout uGUI).
  - `stamp.js <rev>` gắn `?v=<rev>` cho mọi module trong import map của `index.html`. Chạy mỗi lần tăng `rev`.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node. Sim phát sự kiện vào `sim.events`, view đọc rồi xoá.
  - `store.js` dựng mô tả tĩnh của cửa hàng từ `scene.json`: ô mua, máy sản xuất, kệ, quầy, khách, người chơi.
  - `sim.js` giữ trạng thái: tiền, hàng mang theo, trả tiền ô, sản xuất, nâng sức mang, lưu/nạp.
  - `customers.js`, `workers.js`, `tasks.js` (15 bước hướng dẫn đọc từ `TaskController`), `grid.js` + `nav.js` (tìm đường), `bot.js`.
- `js/view/` vẽ: `world.js` (cảnh), `toon.js` (shader Toony Colors Pro 2 và viền), `anim.js` (rig), `game.js` (đồ chồng, khách, nhân viên, hiệu ứng), `hud.js` (DOM: tiền, joystick, nhãn giá, bong bóng khách, banner hướng dẫn, mũi tên).

Mọi con số luật chơi có dẫn nguồn trong `D:\minimart-ref\rules\*.md`, ghi theo `Tệp.c:dòng` của bản decompile.

## Kiểm

- `node test/casual-farm-sim.js` cho bot chơi 90 phút mô phỏng. `MM_MINUTES=180` thì phải mua đủ 40/40 ô, xong 15/15 bước hướng dẫn, bản lưu nạp lại đúng.
- `node test/casual-farm-nav.js` kiểm tìm đường và va chạm.
- `node test/casual-farm-play.js` chạy trình duyệt thật: nạp không lỗi, mờ rồi rõ, module có `?v=`, phím W đi được, bot mua ô và có khách trả tiền, tải lại giữ tiến trình. Thêm `MM_URL=<địa chỉ Pages>` để kiểm bản trên mạng.

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

## Còn thiếu

- Chỉ có Store 1: ô `Mat_NextMart` mua được nhưng chưa sang cửa hàng kế.
- Chưa có tiếng, chưa có camera lia tới đồ vừa mở khóa, chưa có trộm, trang phục, thú cưng.
- Giữa game chậm hơn bản gốc: bot mua `Mat_Activate_StoreTile2` ở phút 78 và nhiều khách bỏ về. Chưa rõ do bot chơi kém hay do luật sai.
