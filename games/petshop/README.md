# Pet Shop Simulator (bản web, không Unity)

Làm lại *Pet Shop Simulator: Pet Games* (`com.pet.shop.simulator.games.max` 1.19, Unity 6000.0.58f2, IL2CPP arm64) bằng three.js và JavaScript thuần, không có bước build. Chơi solo, offline hoàn toàn: không server, không quảng cáo, không IAP.

- Chạy: mở `index.html`. Tham số: `?fresh` bỏ qua bản lưu, `?speed=N` chạy sim nhanh N lần (để test), `?cam=x,y,z,yaw,pitch` đặt camera.
- Điều khiển máy tính: WASD hoặc phím mũi tên để đi; bấm vào màn hình để khoá chuột, rê chuột để nhìn; **E** hoặc click để tương tác (giữ để xếp hàng liên tục); **F** mở/đóng thùng; **G** ném thùng; **Esc** đóng panel hoặc rời quầy.
- Điều khiển cảm ứng: joystick nổi gốc ở nửa trái, kéo ở nửa phải để nhìn, các nút gốc Interact / Open / Close / Throw / Cart.
- Bản lưu: `localStorage` `ps-save-v1` (cùng các trường với `GameSaveData`), lưu mỗi 5 giây và sau mỗi lần thanh toán.

## Drop 1: một ngày bán hàng trọn vẹn

Đặt hàng trên laptop → thùng giao tới khu CARGO → bê thùng, mở, xếp đúng loại kệ → đặt giá → mở biển OPEN → khách vào, lấy hàng, xếp hàng ở quầy → quét từng món → khách đưa tiền mặt hoặc thẻ → thối tiền bằng nút tờ/xu gốc hoặc gõ số thẻ → tiền và điểm cấp → hết giờ (21:00) → End Day → bảng tổng kết + thuế → Next Day → lưu.

## Số liệu thật dùng trong bản này

Nguồn: `data/game.json` (có trường `src` cho mỗi hằng đọc từ mã máy) và `data/layout.json`.

| Luật | Giá trị | Nguồn |
|---|---|---|
| Khởi đầu | $100, 100 energy, cấp 1, có sẵn Rack + Animal Cage | `GameSavingManager.saveData` |
| Đơn vị tiền | giá hàng/kệ tính bằng cent; Cash tính bằng dollar, `ceil(cent/100)` | `CartUIHelper.ProcessPurchase`, `CheckOutCounter.<CheckOutRotine>` |
| Catalogue | 52 sản phẩm, cost/min/market/max, số món mỗi thùng, loại kệ, license | `StoreProductData.productDataList` |
| Giao hàng | mỗi dòng giỏ chờ `clamp(54 + 27·(số thùng−1) + 14·i, 54, 300)` giây, giao lần lượt | `DeliveryBuilder.Build` |
| Đặt giá | ≤ market thì miễn phí; trên market tốn `clamp(ceil((giá−market)/(max−market)·5), 1, 5)` energy mỗi lần xác nhận | `PriceCalculator.CalculateCharge`, `PricePanelHelper.HidePricePanel` |
| Khách | mỗi 5 s một khách (pool 17 model, xoay 4 đường vào); tối đa 4 khách trong tiệm; giỏ `Random.Range(2, min(cấp+1, 10))`; mỗi kệ lấy 1 món; xem kệ 2 s + 3 s; tối đa 1 con thú mỗi khách | `NpcSpawner`, `GameManager.maxCustomerCapacity`, `CustomerResetState`, `AnimalCabinet.CanPickProduct` |
| Kiên nhẫn của khách | **không có**: khách xếp hàng chờ mãi (không state nào có hẹn giờ) | các `Customer*State` |
| Thanh toán | tiền mặt: khách đưa `bill + change` (change lấy từ `changeList`); hợp lệ khi `0 ≤ đưa − change < 101¢`; thẻ: gõ đúng `bill/100` | `CashPayment`, `CardPayment`, `PaymentManager` |
| Thưởng mỗi khách | +$ceil(bill/100), +10 điểm cấp | `CheckOutCounter.<CheckOutRotine>` |
| Cấp | cần 50 / 100 / 200 điểm (cấp 1–3), 250 (4–8), 300 (từ 9), tối đa 100 | `StoreLevel.CalculatePointsToNextLevel` |
| Ngày | 10:00 → 21:00 trong 4 phút thật (8 phút × hệ số 2); từ 20:00 không nhận khách mới | `DayNightCycle.Update` |
| Thuế | 5% × \|income − supply cost\| khi sang ngày | `DayEndUIHelper.SetDataOnDayEnd` |
| License | L2 $50/cấp 2 … L11 $500/cấp 30 | `BuyProductLicense` |

## Khoảng trống có ghi nhãn

- **Chăm thú: game gốc không có** (`AnimalEatState` rỗng, `AnimalHealth.AddHealth/DecreaseHealth` không có lời gọi nào). Thú là hàng trong chuồng; 2 con chó trong "Training Area" chỉ để trang trí. Bản web giữ đúng như vậy.
- Quảng cáo thưởng của gốc → nhận miễn phí: phần thưởng lên cấp ($50 + 10 energy), Tax Free (hoàn thuế). Các nút quảng cáo/IAP khác bị ẩn. [PLACEHOLDER chính sách]
- Chữ cảnh báo: bảng I2 Localization chưa giải được, nên chữ là diễn giải từ tên key (`Alert_CabinetFull`…). [PLACEHOLDER]
- Chữ mục tiêu: chuỗi nhiệm vụ gốc (`TaskManager`) là Drop 2; tạm hiện gợi ý theo trạng thái, dùng đúng icon gốc. [PLACEHOLDER]
- Màn POS 3D ở quầy (TextMeshPro trong không gian) được vẽ lại thành ô chữ DOM.
- Ánh sáng: level1 không có đèn và lightmap; dựng lại ambient Trilight (sky/equator/ground ×1.05). [GUESS] độ sáng
- FOV camera 60° [GUESS], vì lens Cinemachine không giải được (Main Camera lưu 50°).
- Boost giao hàng: giá energy tăng 1 mỗi lần, trần `maxBoostCount` 5. [GUESS]
- Bảng ngày gốc ghi "Tax(-10%)" nhưng mã tính 5%; bản web giữ cả hai như gốc.

## Bố cục

- `tools/`: bộ xuất Python (UnityPy 1.25.4 + TypeTreeGeneratorAPI, venv `~/burger-work/.venv`, chạy `python -I`). Nguồn ở `$PS_REF` (mặc định `~/petshop-dl`).
  - `export_store.py level1 store` → `art/store` (scene, glb). `export_store.py sharedassets1.assets pool --prefabs $(cat data/pool_ids.txt)` → `art/pool` (140 prefab chạy lúc chơi; danh sách từ `pool_list.py`).
  - `export_navmesh.py store`, `export_colliders.py level1 store` (lưới va chạm của người chơi), `export_anim.py`, `export_audio.py` (FSB5 → vgmstream → MP3), `export_ui.py` (toàn bộ Canvas uGUI + các ô prefab), `export_data.py` → `data/game.json` + `art/icons`, `node tools/export_layout.mjs` → `data/layout.json`, rồi `to_webp.py`.
  - `stamp.js <rev>` gắn `?v=<rev>` cho import map và ghi `version.json`.
- `js/sim/`: luật thuần (`sim.js`, `nav.js`), chạy được bằng node.
- `js/view/`: `world.js` (scene.json → three.js), `std.js` (material Standard ở Gamma space), `pool.js`, `game.js` (sim → 3D, vùng va chạm của tia), `player.js` (FPS + lưới va chạm), `ui.js` + `hud.js` (Canvas gốc → DOM), `anim.js`, `audio.js`.

## Kiểm

- `node test/petshop-sim.js`: một ngày trọn vẹn bằng số thật (34 khẳng định).
- `node test/petshop-play.js`: Chromium headless chơi bằng điều khiển thật, chụp `shots/play-*.png`.
