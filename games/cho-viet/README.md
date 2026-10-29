# Chợ Việt

Tiệm tạp hóa chợ quê Việt Nam, chạy trên bộ máy của My Mini Mart (`games/casual-farm`). Bản này chỉ có chơi một mình và chỉ có một chợ. Nó dựng trên Store 1 (Grocer Mart): giữ nguyên cảnh, chuỗi mở ô và giá. Phần khác bản gốc là tên hàng, chữ, quần áo và đồ trang trí.

- Chạy: mở `index.html`. Tham số như My Mini Mart: `?fresh` bỏ qua bản lưu, `?bot` cho máy tự chơi.
- Kiểm: `node test/cho-viet-play.js`, thêm `MM_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cho-viet/index.html` để kiểm bản trên Pages.
- Tăng rev: `node games/casual-farm/tools/stamp.js <rev>`. Lệnh này stamp cả trang này lẫn My Mini Mart, vì hai game dùng chung module.

## Cách ghép với bộ máy

`js/boot.js` gán `window.MM_THEME` (lấy từ `js/theme.js`) rồi mới import `../casual-farm/js/main.js`. Bộ máy chỉ đọc theme ở bốn chỗ.

- `main.js` đổi khóa lưu sang `cho-viet-global-v1` và `cho-viet-store1-v1`, luôn nạp `THEME.mart` (store1), và không có mart kế nên không có xe van đi tiếp.
- `cloud.js` lưu lên tài khoản hub ở dòng `game_id = cho-viet`, tách khỏi dòng `casual-farm`.
- `THEME.data({ data, items, marts, nav })` chạy trước khi dựng cửa hàng. Nó bỏ ô `Mat_Activate_NextMart` khỏi chuỗi, đổi tên và hình hàng, đặt tên chợ, và thêm vật cản của đồ trang trí vào navmesh.
- `THEME.world({ world, store, view, looks, gltfLoader, ... })` chạy sau khi có cảnh, view và looks. Nó mặc đồ Việt cho khách, nhân viên và người chơi, đặt đồ trang trí, rồi gắn hoạt ảnh con trâu vào `world.rigs` để vòng lặp khung hình tự chạy.
- Chữ nhiệm vụ đổi qua `THEME.text`. Chữ cố định của HUD do `boot.js` dịch bằng MutationObserver: nút chữ nào khớp đúng một khóa trong `TEXT` thì được thay.

## Đổi gì so với Store 1

- Hàng (`ITEMS` trong `theme.js`): lúa mì thành Lúa (vẽ bằng bó lúa `RiceGrass` 62 của bản gốc), bánh mì ổ tròn thành Bánh mì (baguette `BreadBaguette` 126). Cà chua, bột mì, tương cà, trứng gà, sữa bò giữ hình gốc, chỉ đổi tên.
- Bánh mì gốc không có icon HUD, nên `tools/icon.js` chụp mesh trong game ra `art/icons/banh-mi.webp` (`node games/cho-viet/tools/icon.js 126 games/cho-viet/art/icons/banh-mi.webp`).
- Người (`js/vnlooks.js`): món đồ dựng bằng code, gắn vào xương Mixamo nên đi theo hoạt ảnh gốc. Gồm nón lá, quai nón, áo dài, áo bà ba, mũ bảo hiểm, khẩu trang, mũ cối, khăn đóng, khăn quàng đỏ, khăn rằn. Khách mặc thêm bộ đồ gốc đã tô lại màu.
- Đồ trang trí (`js/props.js`, bảng `PROPS`): model miễn phí của Poly Pizza vẽ lại bằng toon shader của game. Thêm cờ đỏ sao vàng và bảng TẠP HÓA CHỢ VIỆT vẽ bằng canvas. Ghi công có trong nút "Ghi công" ở góc phải.

## Bẫy

- `[BẪY ĐÃ SẬP]` Bộ đồ đã tô màu sao chép điểm ảnh của texture palette. Lúc móc `world` chạy thì texture mới có bản 16 px, hoặc chưa có ảnh, và `recolour` hỏng vì `image` là null. `theme.world` chờ tới khi ảnh rộng hơn 16 px, tối đa 15 giây; quá hạn thì khách mặc đồ gốc.
- `[BẪY ĐÃ SẬP]` Model Quaternius dùng một mesh mà nhiều vật liệu. Hàm đổi sang toon từng chỉ lấy vật liệu đầu, nên cả con trâu ra một màu. `toonify` giờ tạo một vật liệu toon cho mỗi nhóm.
- `[BẪY ĐÃ SẬP]` Màu tô (`tint`) phải là giá trị sRGB như toon shader nhận. `new THREE.Color('#…')` đổi sang linear nên ra tối hơn hẳn.
- `[BẪY ĐÃ SẬP]` Cảnh vẫn giữ ô `Mat_Activate_NextMart`, vì `buildStore` lấy ô từ scene chứ không lấy từ data. Bỏ nó khỏi `data.mats` và khỏi `activate` của lò nướng thì ô không bao giờ mở; tổng số ô vẫn đếm 40, chợ xong ở 39.
- `[BẪY ĐÃ SẬP]` Londrina Solid (font HUD gốc) không có chữ tiếng Việt, nên trang này đặt `#hud` sang Baloo 2.
- `[BẪY ĐÃ SẬP]` Lưới đi lại phủ gần hết sân. Đồ đặt trong sân mà không có vật cản thì người chơi đi xuyên thân cây, nên mỗi món trong `PROPS` có `block`. Khách vào từ phía sau (điểm sinh ở z -76, cửa ở z -43) và cửa trái (x -24), nên các lối đó để trống. Test có ca "không ai đi vào đồ trang trí".

## [ĐỀ XUẤT] Việc kế

- Đổi kệ thành sạp chợ có mái (cần chỗ đặt hàng khớp ô kệ).
- Thêm món Việt mới (phở, cà phê sữa đá, nước mía) bằng máy của mart khác: phải nạp thêm cảnh và mesh của mart đó.
- Doc so sánh model: https://claude.ai/artifact/JDi1LWkMxJzEoVnZjs3gP6
