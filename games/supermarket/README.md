# Corner Mart (games/supermarket)

Game mô phỏng siêu thị nhỏ viết bằng three.js r160 và JavaScript thuần, không có bước build. Luật chơi và con số lấy từ config của APK `supermarket.store.simulator.shop.cashier.games` v1.411 ("Shop Simulator"). Tên game, hình 3D, icon và bố cục cửa hàng đều tự làm, không lấy art từ APK. Recon: `~/handoff/supermarket-RECON.md`.

- Chạy: mở `index.html`. `?fresh` bỏ qua bản lưu. Bản lưu nằm ở localStorage `supermarket-v1`.
- Điều khiển: WASD/mũi tên hoặc kéo trên màn hình để đi, `E`/nút tròn để tương tác, `Q`/nút ⬇ để đặt thùng xuống, `Esc` để đóng bảng. Ở máy POS có thể gõ số bằng bàn phím.

## Vòng chơi

1. **Mở đầu**: $0, một thùng 12 mì gói ở ô giao hàng màu vàng (`SettingConfig.InitialMoney`, `InitalItem`). Có sẵn 2 kệ trắng, quầy thu ngân, máy tính và thùng rác (chunk 101 của `SceneChunkObjectsConfig`).
2. **Xếp kệ**: bê thùng tới kệ, bấm Fill hoặc Put 1. Mỗi tầng kệ giữ một loại hàng. Sức chứa tính từ mặt tầng (`MultiLayerItemLayout.planeSize`) và `shelve_volume` của từng món: kệ trắng 92×38 cm, kệ vàng nghiêng 90×38 cm, tủ lạnh 92×38 cm. Hàng type 303 phải để tủ lạnh, type 305 (trái cây) phải để kệ vàng. Thùng rỗng bỏ vào thùng rác xanh.
3. **Đặt giá**: chỉnh trong khoảng `min_price`..`limit_price`, mặc định bằng `recommend_price` (giá thị trường).
4. **Mở cửa**: đồng hồ chạy 06:00→22:00 với `GameTimeRate 180`, tức 320 giây thật mỗi ngày. Khách tới theo đợt của graph `ShopNpcBirth`. Trần 30 khách/ngày tới ngày 7, sau đó 60. Hàng chờ tối đa 8 người.
5. **Khách mua**: mua 1–3 món ở ngày 1, nhiều hơn ở các ngày sau (`XUNGOU1`, `XUANGOU2`, `MoreShopping`). Món đắt hơn giá thị trường từ ngưỡng ngẫu nhiên 5–20 % trở lên (từ ngày 4 là 10–30 %) thì khách chê đắt. Kệ trống thì khách báo "Can't find". Khách đi vòng các dãy kệ giữa phòng qua lối bên phải. Khách **không bỏ hàng vì chờ lâu**: `NpcRunAwayFromLineNode.GetChild` @0xDA5944 chỉ chọn nhánh bỏ đi khi đang cháy.
6. **Quầy thu ngân**: quét từng món. Khách trả **thẻ** thì gõ đúng tổng tiền. Khách trả **tiền mặt** thì thối từ ngăn kéo: thối thiếu hiện "Change error" và trừ 3 satisfaction, thối dư thì mình mất phần dư. Khách đưa bao nhiêu thì theo `NpcTakeoutCashNode.CreateMoney` @0xDAB88C: chọn ngẫu nhiên một bậc `a_b` của `Npc_GiveChange`, cộng `Random.Range(a, b)` xu vào tổng, rồi làm tròn lên đô chẵn. Ngày 1: khách đầu trả tiền mặt, khách thứ hai trả thẻ. Mỗi lượt tính tiền được 5 exp.
7. **Nhập hàng** (máy tính, tab Products): giá thùng = giá vốn × `load_num` (`ItemSystem.GetAllPrice` @0xC8E648). Thùng tới sau `delivery_first` / `delivery_normal` giây. Giao nhanh tốn $30 (`DeliverySpeedUpCash`).
8. **Giấy phép** (tab Licenses): License 01–20 có giá $0–$8000, mỗi cái cần một cấp cửa hàng và giấy phép trước nó (`LicensesInfoConfig`). Mỗi giấy phép mở thêm các món trong `ShopItemConfig.license_id`, tổng cộng 84 món.
9. **Khu** (tab Sections): Section 1–7 có giá $300–$1800, mỗi khu mở rộng cửa hàng thêm 2,4 m sang trái và thêm chỗ đặt kệ.
10. **Nội thất** (tab Furniture): kệ trắng, kệ vàng, tủ lạnh, mỗi món $200 (shop 102). Mua xong, đi tới ô sáng trên sàn và bấm E để đặt. Có 3 dãy: dãy sát tường sau và 2 dãy giữa phòng.
11. **Cuối ngày**: báo cáo khách, satisfaction, không tìm thấy, chê đắt, thối thiếu, thu, chi, nâng cấp, tiền thuê, lương, lãi, số dư, cấp. Tiền thuê, lương và nợ luôn bằng 0 vì `AddRent`/`AddSalary`/`AddLoan` không có chỗ nào gọi trong libil2cpp.
12. **Cấp cửa hàng**: mỗi cấp cần đúng `pro_exp` của cấp đó, exp về 0 khi lên cấp (`CashDeskSystem.AddShopExp` @0xC60E54).

Chưa làm (Drop sau): nhân viên, nhiệm vụ, quà theo cấp (Fund), giá trôi theo ngày / price war, cháy, quầy shawarma, gian Halloween. Không làm: quảng cáo, IAP, battle pass, chat NPC online.

## Bố cục

- `tools/export_data.py <ref> data/game.json`: đọc `ref/cfg/*.json` (TextAsset của bundle `f14c…`, giải XOR 0x40) và `ref/graphs/*.json` (MicroGraph), ghi các bảng cần dùng kèm `_src`. Lệnh: `python3 -I tools/export_data.py ~/supermarket-work/ref data/game.json`.
- `tools/stamp.py <rev>`: gắn `?v=<rev>` cho mọi module qua import map, cho css và data. Chạy mỗi lần tăng rev.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node: `sim.js` (ngày, khách, kệ, đặt hàng, quầy, báo cáo) và `layout.js` (mặt bằng cửa hàng, vật cản).
- `js/view/`: `world.js` (cảnh three.js dựng hoàn toàn bằng code), `ui.js` (HUD và các bảng DOM), `icons.js` (emoji và màu cho từng món).
- `js/main.js`: input, tương tác, vòng frame, lưu.

## Kiểm

- `node test/supermarket-sim.js`: bot chơi 9 ngày qua API, đối chiếu giá, exp theo từng cấp, trần khách, hàng chờ, luật tiền mặt và save (kể cả save Drop 1). Có thêm phần giấy phép, khu, tủ lạnh, khách không đi xuyên kệ, và một bot tự mua sắm chơi 40 ngày.
- `node test/supermarket-play.js`: chơi trên Chromium bằng phím và click thật trên UI: ngày 1 trọn vẹn, sang ngày 2, mua giấy phép, mua và đặt tủ lạnh, mua khu, xếp nước vào tủ lạnh, rồi reload. Dùng `SM_VIEW=390x844` cho kích thước điện thoại, `SM_URL=<Pages>` để chạy trên bản đã deploy. Playwright đọc từ `PLAYWRIGHT` hoặc `~/.cache/pw-node/node_modules/playwright-core`.
