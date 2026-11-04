# Pet Shop Simulator (bản web, không Unity)

Làm lại *Pet Shop Simulator: Pet Games* (`com.pet.shop.simulator.games.max` 1.19, Unity 6000.0.58f2, IL2CPP arm64) bằng three.js và JavaScript thuần, không có bước build. Chơi solo, offline hoàn toàn: không server, không quảng cáo, không IAP.

- Chạy: mở `index.html`. Tham số: `?fresh` bỏ qua bản lưu, `?speed=N` chạy sim nhanh N lần (để test), `?cam=x,y,z,yaw,pitch` đặt camera.
- Điều khiển máy tính: WASD hoặc phím mũi tên để đi; bấm vào màn hình để khoá chuột, rê chuột để nhìn; **E** hoặc click để tương tác (giữ để xếp hàng liên tục; giữ 1,25 s vào kệ để nhấc kệ lên di chuyển); **F** mở/đóng thùng (thùng kệ: mở ra là vào chế độ đặt); **G** ném thùng; khi đặt kệ: **R**/**Q** xoay ±90°, **E**/click đặt, **Esc** huỷ; **Esc** đóng panel hoặc rời quầy.
- Điều khiển cảm ứng: joystick nổi gốc ở nửa trái, kéo ở nửa phải để nhìn, các nút gốc Interact / Open / Close / Throw / Cart.
- Bản lưu: `localStorage` `ps-save-v1` (cùng các trường với `GameSaveData`), lưu mỗi 5 giây và sau mỗi lần thanh toán.

## Drop 1: một ngày bán hàng trọn vẹn

Đặt hàng trên laptop → thùng giao tới khu CARGO → bê thùng, mở, xếp đúng loại kệ → đặt giá → mở biển OPEN → khách vào, lấy hàng, xếp hàng ở quầy → quét từng món → khách đưa tiền mặt hoặc thẻ → thối tiền bằng nút tờ/xu gốc hoặc gõ số thẻ → tiền và điểm cấp → hết giờ (21:00) → End Day → bảng tổng kết + thuế → Next Day → lưu.

## Drop 2: toàn bộ game

- **License 2–11, Expansion 2–6** đúng giá/cấp gốc; chỉ tường (khối chắn) của expansion lớn nhất đang sở hữu bật lên (`StoreExpandHelper.OnExpansionUnlocked`), va chạm người chơi và kiểm tra đặt kệ đi theo.
- **Đủ 52 sản phẩm** trong laptop; tab Furniture có 7 loại kệ + 2 kệ kho (`FurnitureUIPopulate`).
- **Đặt / di chuyển kệ** (`FurniturePlaceHelper.CanPlace`, `PlayerObjectMover`): mở thùng kệ → kệ đi theo tâm nhìn trên sàn, `Pad` gốc tô xanh/đỏ; đặt được khi mọi `RaycastDetector` nằm trên sàn đúng lớp (StoreFloor 512 cho kệ, StorageFloor 1024 cho kệ kho) và hộp `BoundingBoxDetector` không chạm collider nào; xoay ±90°; giữ 1,25 s (`thresholdTime`) để nhấc kệ đã đặt, hàng trên kệ đi theo; kệ kho có nút Sell (`floor(cost/100 × 0,5)` $).
- **Kho** (`StorageSystem`): dịch vụ Storage cấp 11, 25 energy → cửa cuốn mở; kệ Big Storage có sẵn ở phòng sau; mỗi ngăn giữ 1 thùng hàng (không nhận thùng rỗng, không nhận thùng thú vì `AnimalDeliveryBox` không phải `ProductDeliveryBox`); nhặt thùng khỏi ngăn như thùng thường.
- **Thu ngân** (`CashierSystem`, `CashierUIHelper`, `AutoCheckoutHelper`): từ cấp 2 Liam Mason đứng chờ ở chỗ tuyển; dịch vụ Cashier cấp 10, 30 energy; bảng HIRE CASHIER lương 0,6×–1× $320, energy theo `CalculateEnergy` ($320 → 0, $256 → 5, $192 → 10); ca 720 s; tự quét 1,5 s/món, nhận tiền 5 s, xử lý 5 s; hết ca đi về rồi quay lại chờ tuyển.
- **Dịch vụ Discard Boxes**: bỏ mọi thùng rỗng nằm ngoài (`Alert_BoxesDiscard`).
- **Chuỗi nhiệm vụ** (`TaskManager`): 5 lần thanh toán (thanh tiến độ n/5) → mua license → mua kệ → mua expansion → "mở rộng cửa hàng"; mẹo Tip_StoreEmpty / Tip_StoreClosed / Tip_DayEnd_1..3 đúng lúc như gốc.
- **Chữ gốc I2 Localization** (`data/text.json`, 182 term, tiếng Anh + tiếng Việt): mọi chữ có term trên UI, cảnh báo, mục tiêu. Mặc định theo ngôn ngữ trình duyệt; đổi trong Settings.
- **Settings**: ngôn ngữ EN/VI, độ nhạy chuột, âm lượng SFX và nhạc (lưu `ps-settings`).
- **Bảng tên cửa hàng**: nhìn biển → "Name your Store" (15 ký tự a-z 0-9, 6 màu); biển 3D vẽ lại bằng sprite màu gốc + tên.
- **Phần thưởng**: máy ATM $50, máy tiền $30, máy energy 10 (hiện từ cấp 2), Bank Free Cash $20 / Free Energy 10, bảng Low Cash +$10 / Low Energy +10, bảng LevelReward sau khi lên cấp (danh sách `rewardDataList` gốc), tip sau khi mua dịch vụ.

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

- **Hướng dẫn 21 bước** (`Tutorial`) chưa làm; thay bằng chuỗi nhiệm vụ + mẹo gốc. [GAP]
- Máy thưởng / Bank / Low Cash / Low Energy là quảng cáo thưởng trong gốc, không giới hạn; bản web cho miễn phí, **mỗi nguồn 1 lần mỗi ngày**. [PLACEHOLDER chính sách]
- Discard Boxes: thẻ ghi 10 energy nhưng hàm xử lý gốc không trừ energy → bản web không trừ (theo mã).
- `AtmPanel` ($20) không dùng: bấm máy ATM nhận thẳng $50 (`AtmMachine.Reward`).
- Kho: cảnh báo "StorageBoxEmpty"/"StorageCabinetFull" không có trong bảng term (gốc sẽ hiện rỗng) → chữ tiếng Anh. [PLACEHOLDER]; gốc dùng hai key này ngược chỗ nhau, bản web hiện đúng nghĩa.
- Cửa kho mở: tween DOMove gốc, độ cao 2,6 m trong 1 s rồi ẩn. [GUESS]
- Bán kệ kho: lệnh cộng tiền không tìm thấy trong mã → cộng `SellPrice`; kệ còn thùng thì không cho bán. [GUESS]
- Thu ngân: ca 720 s đếm khi ngày đang chạy; nút ± lương bước $1; khi thu ngân đang làm, người chơi không vào quầy. [GUESS]
- Đặt kệ: khoảng cách tâm nhìn – sàn kẹp 1–4,5 m cho chuột/cảm ứng (gốc 0,135–10 m). [GUESS]; màu đỏ khi không đặt được. [GUESS]
- Độ nhạy 0,25×–2×. [GUESS]
- Nhiệm vụ không thưởng XP (mã `CompleteTask` không cộng gì, dù chữ hướng dẫn hứa "bonus XP") → giữ như mã.
- Bảng LevelReward dùng `rewardDataList[cấp − 1]` y nguyên dữ liệu gốc, kể cả chỗ lệch (ví dụ "New Expansion" ở cấp 3 trong khi Expansion 2 mở ở cấp 5).
- Extra Counter: tắt trong gốc → không có.
- Chưa làm: chu kỳ ngày-đêm của ánh sáng/skybox, giọng khách (MaleThanks…), bảng DeliveryCatalogue.
- **Chăm thú: game gốc không có** (`AnimalEatState` rỗng, `AnimalHealth.AddHealth/DecreaseHealth` không có lời gọi nào). Thú là hàng trong chuồng; 2 con chó trong "Training Area" chỉ để trang trí. Bản web giữ đúng như vậy.
- Quảng cáo thưởng của gốc → nhận miễn phí: phần thưởng lên cấp ($50 + 10 energy), Tax Free (hoàn thuế). Các nút quảng cáo/IAP khác bị ẩn. [PLACEHOLDER chính sách]
- Màn POS 3D ở quầy (TextMeshPro trong không gian) được vẽ lại thành ô chữ DOM.
- Ánh sáng: level1 không có đèn và lightmap; dựng lại ambient Trilight (sky/equator/ground ×1.05). [GUESS] độ sáng
- FOV camera 60° [GUESS], vì lens Cinemachine không giải được (Main Camera lưu 50°).
- Boost giao hàng: giá energy tăng 1 mỗi lần, trần `maxBoostCount` 5. [GUESS]
- Bảng ngày gốc ghi "Tax(-10%)" nhưng mã tính 5%; bản web giữ cả hai như gốc.

## Bố cục

- `tools/`: bộ xuất Python (UnityPy 1.25.4 + TypeTreeGeneratorAPI, venv `~/burger-work/.venv`, chạy `python -I`). Nguồn ở `$PS_REF` (mặc định `~/petshop-dl`).
  - `export_store.py level1 store` → `art/store` (scene, glb). `export_store.py sharedassets1.assets pool --prefabs $(cat data/pool_ids.txt)` → `art/pool` (140 prefab chạy lúc chơi; danh sách từ `pool_list.py`).
  - `export_navmesh.py store`, `export_colliders.py level1 store` (lưới va chạm của người chơi + tam giác sàn cho đặt kệ), `export_text.py` (I2 → `data/text.json`), `export_board.py` (sprite biển hiệu + icon phần thưởng cấp), `node tools/export_rewards.mjs`, `export_anim.py`, `export_audio.py` (FSB5 → vgmstream → MP3), `export_ui.py` (toàn bộ Canvas uGUI + các ô prefab), `export_data.py` → `data/game.json` + `art/icons`, `node tools/export_layout.mjs` → `data/layout.json`, rồi `to_webp.py`.
  - `stamp.js <rev>` gắn `?v=<rev>` cho import map và ghi `version.json`.
- `js/sim/`: luật thuần (`sim.js`, `nav.js`, `place.js` = CanPlace), chạy được bằng node.
- `js/view/`: `world.js` (scene.json → three.js), `std.js` (material Standard ở Gamma space), `pool.js`, `game.js` (sim → 3D, vùng va chạm của tia), `player.js` (FPS + lưới va chạm), `ui.js` + `hud.js` (Canvas gốc → DOM), `anim.js`, `audio.js`.

## Kiểm

- `node test/petshop-sim.js`: một ngày trọn vẹn bằng số thật.
- `node test/petshop-sim2.js`: luật Drop 2 (license/expansion, nhiệm vụ, CanPlace, kho, dịch vụ, thu ngân, thưởng, tên cửa hàng, lưu/nạp).
- `node test/petshop-play.js`, `node test/petshop-play2.js`: Chromium headless chơi bằng điều khiển thật, chụp `shots/play-*.png`, `shots/d2-*.png`.
