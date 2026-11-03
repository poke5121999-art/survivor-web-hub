# Corner Mart (games/supermarket)

Game mô phỏng siêu thị nhỏ viết bằng three.js r160 và JavaScript thuần, không có bước build. Luật chơi và con số lấy từ config của APK `supermarket.store.simulator.shop.cashier.games` v1.411 ("Shop Simulator"). Tên game, hình 3D, icon và bố cục cửa hàng đều tự làm, không lấy art từ APK. Recon: `~/handoff/supermarket-RECON.md`.

- Chạy: mở `index.html`. `?fresh` bỏ qua bản lưu. Bản lưu nằm ở localStorage `supermarket-v1`.
- Điều khiển: WASD/mũi tên hoặc kéo trên màn hình để đi, `E`/nút tròn để tương tác, `Q`/nút ⬇ để đặt thùng xuống, `Esc` để đóng bảng. Ở máy POS có thể gõ số bằng bàn phím.

## Vòng chơi (Drop 1)

1. **Mở đầu**: $0, một thùng 12 mì gói ở ô giao hàng màu vàng (`SettingConfig.InitialMoney`, `InitalItem`).
2. **Xếp kệ**: bê thùng tới kệ, bấm Fill hoặc Put 1. Mỗi tầng kệ giữ một loại hàng. Sức chứa tính từ mặt tầng 92×38 cm (prefab `S_JH_*`) và `shelve_volume` của từng món, ví dụ mì 4×3 = 12. Thùng rỗng bỏ vào thùng rác xanh.
3. **Đặt giá**: chỉnh trong khoảng `min_price`..`limit_price`, mặc định bằng `recommend_price` (giá thị trường).
4. **Mở cửa**: đồng hồ chạy 06:00→22:00 với `GameTimeRate 180`, tức 320 giây thật mỗi ngày. Khách tới theo đợt của graph `ShopNpcBirth`. Trần 30 khách/ngày tới ngày 7, sau đó 60. Hàng chờ tối đa 8 người.
5. **Khách mua**: mua 1–3 món ở ngày 1, nhiều hơn ở các ngày sau (graph `XUNGOU1`, `XUANGOU2`, `MoreShopping`). Món đắt hơn giá thị trường từ ngưỡng ngẫu nhiên 5–20 % trở lên (từ ngày 4 là 10–30 %) thì khách chê đắt. Kệ trống thì khách báo "Can't find".
6. **Quầy thu ngân**: bấm từng món trên băng chuyền để quét. Khách trả **thẻ** thì gõ đúng tổng tiền vào POS. Khách trả **tiền mặt** thì lấy tiền thối từ ngăn kéo. Thối thiếu thì hiện "Change error" và trừ 3 satisfaction. Thối dư thì mình mất phần dư. Ngày 1: khách đầu trả tiền mặt, khách thứ hai trả thẻ (graph `CheckoutAiGraph`). Mỗi lượt tính tiền được 5 exp.
7. **Nhập hàng**: đặt trên máy tính. Giá một thùng = giá vốn × `load_num`. Thùng tới sau `delivery_first` giây (lần đầu đặt món đó) hoặc `delivery_normal` giây.
8. **Cuối ngày**: sau 22:00 phục vụ nốt khách còn lại, rồi hiện báo cáo: khách, satisfaction, không tìm thấy, chê đắt, thối thiếu, thu, chi, tiền thuê, lương, lãi, số dư, cấp. Bấm để sang ngày mới. Cấp cửa hàng tính theo `ShopExpConfig`.

PLACEHOLDER (không có trong config): tiền thuê = 0, độ kiên nhẫn trong hàng chờ = 60 s. Còn ba chỗ là phỏng đoán: giá thùng = giá vốn × số món, cách đọc `Npc_GiveChange` (khách đưa tổng tiền cộng một khoản thêm theo bậc rồi làm tròn lên đô), và exp của các cấp là exp cộng dồn.

## Bố cục

- `tools/export_data.py <ref> data/game.json`: đọc `ref/cfg/*.json` (TextAsset của bundle `f14c…`, giải XOR 0x40) và `ref/graphs/*.json` (MicroGraph), ghi các bảng cần dùng kèm `_src`. Lệnh: `python3 -I tools/export_data.py ~/supermarket-work/ref data/game.json`.
- `tools/stamp.py <rev>`: gắn `?v=<rev>` cho mọi module qua import map, cho css và data. Chạy mỗi lần tăng rev.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node: `sim.js` (ngày, khách, kệ, đặt hàng, quầy, báo cáo) và `layout.js` (mặt bằng cửa hàng, vật cản).
- `js/view/`: `world.js` (cảnh three.js dựng hoàn toàn bằng code), `ui.js` (HUD và các bảng DOM), `icons.js` (emoji và màu cho từng món).
- `js/main.js`: input, tương tác, vòng frame, lưu.

## Kiểm

- `node test/supermarket-sim.js`: bot chơi 9 ngày qua API, đối chiếu giá, exp, trần khách, hàng chờ, luật thối tiền và save.
- `node test/supermarket-play.js`: chơi trên Chromium bằng phím và click thật trên UI, đi hết ngày 1 tới ngày 2 rồi reload. Dùng `SM_VIEW=390x844` cho kích thước điện thoại, `SM_URL=<Pages>` để chạy trên bản đã deploy. Playwright đọc từ `PLAYWRIGHT` hoặc `~/.cache/pw-node/node_modules/playwright-core`.
