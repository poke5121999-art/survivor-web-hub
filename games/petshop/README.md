# Pet Shop Simulator (bản web, không Unity)

Làm lại *Pet Shop Simulator: Pet Games* (`com.pet.shop.simulator.games.max` 1.19, Unity 6000.0.58f2, IL2CPP arm64) bằng three.js và JavaScript thuần, không có bước build. Chơi solo, offline hoàn toàn: không server, không quảng cáo, không IAP.

- Chạy: mở `index.html`. Tham số: `?fresh` bỏ qua bản lưu (bắt đầu lại từ hướng dẫn), `?notut` bỏ hướng dẫn (dùng cho test), `?speed=N` chạy sim nhanh N lần (để test), `?cam=x,y,z,yaw,pitch` đặt camera.
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
- **Chữ gốc I2 Localization** (`data/text.json`, 182 term; Drop 3 mở rộng ra 17 ngôn ngữ): mọi chữ có term trên UI, cảnh báo, mục tiêu. Mặc định theo ngôn ngữ trình duyệt; đổi trong Settings.
- **Settings**: ngôn ngữ EN/VI, độ nhạy chuột, âm lượng SFX và nhạc (lưu `ps-settings`).
- **Bảng tên cửa hàng**: nhìn biển → "Name your Store" (15 ký tự a-z 0-9, 6 màu); biển 3D vẽ lại bằng sprite màu gốc + tên.
- **Phần thưởng**: máy ATM $50, máy tiền $30, máy energy 10 (hiện từ cấp 2), Bank Free Cash $20 / Free Energy 10, bảng Low Cash +$10 / Low Energy +10, bảng LevelReward sau khi lên cấp (danh sách `rewardDataList` gốc), tip sau khi mua dịch vụ.

## Drop 3: hướng dẫn, ngày–đêm, bảng phím

- **Hướng dẫn gốc** (`Tutorial`, `js/sim/tutorial.js`): đủ 20 mục `stepDataList` theo thứ tự gốc, chờ 2,0 s giữa các bước (`CompleteStepRoutine`):
  - chọn ngôn ngữ → màn chào Olivia (tự qua sau 5 s) → đặt tên cửa hàng → nhìn quanh → đi lại (mỗi bước xong sau 0,75 s);
  - nhặt thùng Dog Food có sẵn trong cảnh (12 món) → xếp vào ngăn 1 của Rack (chỉ ngăn này nhận) → bỏ thùng vào thùng rác → đặt giá (tay chỉ trên bảng giá) → mở biển;
  - ra quầy → khách 1 trả tiền mặt với tiền thối cố định 15,75 $ (`changeList[1]`) → khách 2 trả thẻ (sức chứa khách 2, rồi 0) → rời quầy;
  - mở laptop → ngón tay dẫn qua tab Animals → nút Buy của con thú đầu tiên → nút Buy của giỏ (số lượng khoá 1) → tăng tốc giao (sức chứa khách trả về 4) → nhặt thùng mèo → bỏ vào chuồng → xong, chuỗi nhiệm vụ bắt đầu.
  - Mỗi bước: camera tự quay về đích (0,5 s, OutQuad), mũi tên 3D gốc với offset gốc, chữ mục tiêu là term I2 trùng tên bước, icon bước gốc. Hai lượt thanh toán trong hướng dẫn không tính vào nhiệm vụ "5 checkouts"; ngón tay chỉ nút tiền/phím thẻ kế tiếp ở bước 14–15 và ở nhiệm vụ đầu.
  - Bản lưu cũ (Drop 1/2) coi như đã qua hướng dẫn.
- **17 ngôn ngữ gốc** (I2: en, pt, id, ar, ru, es, th, it, fr, nl, zh, ko, vi, ja, tr, de, uk): `data/text.json` nay có đủ 17 cột; Language Screen dùng 17 nút cờ/tên gốc (ở bước 1 của hướng dẫn và từ Settings). Mặc định theo ngôn ngữ trình duyệt.
- **Ngày–đêm** (`DayNightCycle.UpdateSkybox`, `js/view/sky.js`): bầu trời 6 mặt gốc (`Skybox/6 Sided`) với `_Tint = Lerp(dayTint, nightTint, c)` và `_Rotation = t × 360`; màu trời của ambient `Lerp(2,64 → 1,16)`. Ở đây `c = lightCurve(t)` (đường cong gốc: 0 lúc 10:00, 0,34 ở 87 % ngày, 1 lúc 21:00). Tiếng chim tắt sau 14:00 như gốc.
- **Bảng phím** (giống `games/food-gang`): chỉ trên máy có chuột; nhãn phím (E, F, G, Esc, Q, E, R) dưới các nút điều khiển trên màn hình, kèm bong bóng vàng một lần "Click để nhìn bằng chuột · đi bằng WASD". Chạm màn hình là tắt hẳn.
- **Sửa lỗi hiển thị**:
  - Bảng giá (PricePanel) trước nằm ngoài màn hình từ Drop 1; nay đúng vị trí hiện `panelShowPos` (536, −57) lấy từ mã gốc.
  - Ảnh nền bán trong suốt không còn làm ẩn chữ/ô bên trong (nút "No Thanks", ô phần thưởng cấp, danh sách ngôn ngữ).
  - Chữ mục tiêu không còn đè lên thanh tiến độ.

## Drop 11: bot chơi nhiều ngày, lỗi tìm ra khi chơi

- `test/petshop-bot.js <ngày> [notut|mid]` giờ chơi tiếp sau hướng dẫn, vẫn chỉ bằng cảm ứng. Mỗi lượt nó chọn một việc như người chơi: bảng đang mở (lên cấp, kết thúc ngày), khách chờ ở quầy (quét, nhận tiền, thối tiền ít tờ nhất hoặc gõ số thẻ), thùng đang cầm (mở, xếp lên kệ đúng loại, bỏ vỏ vào thùng rác), thùng nằm ngoài, đặt hàng theo chỗ trống trên kệ, mua giấy phép, mở cửa hàng. Mỗi việc được ghi log, và mỗi ngày, mỗi lần lên cấp, mỗi giấy phép đều được chụp lại.
  - `notut` bắt đầu từ save đã qua hướng dẫn.
  - `mid` thêm save giữa game (cấp 12, $3000, 200 năng lượng) để bot mua dịch vụ thu ngân, thuê thu ngân, mua mở rộng, mua và đặt nội thất.
  - Lúc chỉ chờ khách hay chờ xe hàng thì không tính là kẹt. Kẹt là khi bot làm cùng một việc suốt 240 s mà không có gì đổi.
- Lỗi bot tìm ra, đã sửa:
  - **Ô giấy phép 6–11 đè lên nhau**: `Content` của License không có layout group. Giấy phép 1–5 là ô 411 px xếp 3 cột, 6–11 là ô 571 px xếp 2 cột trên hàng riêng (level1). Bản web ép cả 11 ô vào lưới 3 cột. Giờ chỉ các ô hẹp dời lên chỗ của ô IAP "UnlockAll"; ô rộng giữ vị trí gốc. Expansion có `GridLayoutGroup` thật (4 cột, ô 355 × 435) nên vẫn dàn lại như cũ.
  - **Màn hình máy tính tiền nổi trên bảng LEVEL UP**: chữ "TOTAL / NEXT CUSTOMER" của màn hình quầy đè lên huy hiệu cấp và lớp tối. Giờ chữ này ẩn khi có bảng mở.
  - **Thanh cuộn đứng im**: `Scrollbar` của Unity đặt anchor cho `Handle` theo vị trí cuộn (`size` = viewport / content). Trước đây tay nắm nằm im ở rect lưu sẵn, kể cả khi đã cuộn tới cuối. Giờ áp cho mọi danh sách: cửa hàng, giấy phép, dịch vụ, ngân hàng, ngôn ngữ.
  - **Thùng rỗng vẫn đầy hàng**: prefab thùng giao hàng lưu sẵn 12 bản "(Clone)" trong `ProductHolder`. Đó chính là `BaseDeliveryBox.itemList` của bản gốc, danh sách này vơi dần khi lấy hàng ra. Bản web vẽ hàng theo số lượng nhưng để nguyên 12 bản lưu sẵn, nên xếp hết hàng rồi thùng vẫn trông đầy. Giờ các bản lưu sẵn bị ẩn. `petshop-qa3.js` đếm mesh hàng ở 12 / 5 / 0 món: bản Drop 10 ra 24 / 17 / 12, bản này ra 12 / 5 / 0.
  - [ĐỀ XUẤT] **Gợi ý dưới tâm ngắm nói đúng việc sẽ xảy ra**: cầm thùng rỗng nhắm vào kệ thì không còn hiện "Xếp hàng lên kệ" nữa. Gợi ý giờ kiểm cùng các điều kiện như `sim.place`, theo đúng thứ tự, và báo bằng chữ vàng: "Thùng đã hết hàng: bỏ vào thùng rác", "Mở thùng ra trước đã", "Kệ này đã đầy", "Mặt hàng này không xếp ở đây". Bản gốc chỉ báo lỗi (alert) sau khi đã chạm.
- Đã xét mà không đổi: thuế cuối ngày là 5% × |thu − chi|, tính cả ngày lỗ, dù nhãn ghi "Tax(-10%)". Đó là công thức của `DayEndUIHelper.SetDataOnDayEnd` bản gốc. Giới hạn cúi nhìn ±50° cũng là của bản gốc: đứng quá sát thùng thì phải lùi lại mới nhắm trúng.
- `petshop-uiaudit.js`:
  - Màn "manage-license" trước đây gọi `storeSection('Manage')`, một tên không tồn tại, nên audit đo một cửa hàng trống và vẫn báo sạch. Giờ mỗi màn phải chứng minh là đã mở (phần tử chính đang hiện), nếu không thì tính là lỗi.
  - Thêm phép kiểm "ô cùng danh sách đè nhau", tính cả ô đã cuộn khuất. Chạy trên bản Drop 10 nó báo 4 cặp ô đè; bản này báo 0.
  - Thêm màn "manage-license-end" (cuộn tới cuối danh sách giấy phép).

## Drop 10: rà giao diện, gợi ý hành động

- `test/petshop-uiaudit.js <en|vi>` mở 20 màn (HUD, các tab cửa hàng, quản lý, dịch vụ, ngân hàng, đặt giá, kết thúc ngày, lên cấp, phần thưởng, cài đặt, ngôn ngữ, đặt tên, thiếu tiền / năng lượng, dịch vụ đã mua, màn chào). Trên những gì thực sự hiện ra, nó đo chữ tràn khỏi khung, chữ đè chữ, chữ đè nút và phần bị mép màn hình cắt. Hai ngôn ngữ đều về 0 lỗi.
- **Cài đặt**: `SettingUIHelper.ShowPanel` gọi `topBarUIHelper.HidePanel`, đóng xong thì `ShowPanel` lại. Bản web trước để TopBar đè lên tiêu đề "SETTING".
- **Thanh trượt** (độ nhạy, âm lượng): `Slider` của Unity tự đặt anchor cho Fill (0..giá trị, 0..1) và Handle khi chạy. Rect lưu sẵn có chiều cao 0, nên trước đây thanh trượt trống trơn.
- **Phần thưởng lên cấp**: ô "New License" bị đẩy lên 130 px, đè vào "Store Level : 02". `Middle` lấy góc trên-trái làm gốc, nên ô phải đặt ở top 0.
- **Dịch vụ Storage / Cashier đã mua**: hai ảnh hiện cạnh nhau, chạm một lần là đóng (`successPanelButton` → `CloseCashierSuccessPanel`). Trước đây lật từng trang [GUESS sai].
- [ĐỀ XUẤT] **Thiếu tiền / năng lượng**: gói IAP bị ẩn, nên thẻ "miễn phí" dời vào giữa thay vì để nửa bảng trống.
- [ĐỀ XUẤT] **Màn chào**: "Tap for next..." nổi lên trên dải đen (dải đen trong layout gốc che nửa dưới dòng chữ).
- [ĐỀ XUẤT] **Gợi ý hành động dưới tâm ngắm** (`AimPrompt`, `js/view/keys.js`): "[E] Nhặt thùng hàng", "Xếp hàng lên kệ", "Đặt giá bán", "Cất thùng vào kệ kho", "Mở / Đóng cửa hàng", "Bỏ thùng vào thùng rác"... theo đúng việc mà `interact()` sẽ làm. Máy cảm ứng thì không có ô phím.
- **Tự chơi bằng cảm ứng** (`test/petshop-bot.js`): bot chỉ chạm và kéo qua CDP `Input.dispatchTouchEvent`, giống người chơi điện thoại. Nó chơi hết hướng dẫn 19 bước từ save mới, không kẹt lần nào. Trên đường đi, bot tìm ra ba lỗi chặn người chơi:
  - **Điện thoại không đi được và không xoay camera được**: joystick và vùng xoay lắng nghe trên `#hud` (`pointer-events: none`, là anh em chứ không phải cha của canvas), nên cú chạm trên canvas không bao giờ tới. Lỗi này có từ Drop 1. Giờ listener nằm ở `#stage`, và chỉ nhận chạm bắt đầu trên canvas.
  - **Nút trong danh sách cuộn không nhận chạm hay click thật** (Buy của tab Animals): Viewport đặt `pointer-events: auto` inline để cuộn, giá trị này di truyền xuống, và một `Content` mẫu trong layout đè lên các ô. Giờ mọi phần tử UI không phải nút đều `pointer-events: none`.
  - [ĐỀ XUẤT] **Nút đóng cửa hàng (X)**: là con đầu tiên của `Store` nên bị các bảng vẽ sau che kín. Giờ được đưa lên trên, đặt ở góc bảng.
- [ĐỀ XUẤT] **Mũi tên ở bước 11** (chạm thẻ giá trên kệ): lúc đó người chơi thường đứng ngoài, cạnh thùng rác, và bản gốc không có mũi tên cho bước này.
- `petshop-uiaudit.js` kiểm thêm "nút bị che": chạm vào tâm mọi nút đang hiện phải rơi đúng vào nút đó.
- Đã xét mà không đổi: nút "Ngày kết thúc" sát mép phải là layout gốc (anchor / pivot = 1). Số liệu bảng kết thúc ngày dùng màu gốc.

## Drop 9: QA của chủ dự án (quầy xám, khách trượt, nút "ĐƯỢC RỒI")

- **Quầy và màn hình xám trơn**: mesh `Cahsier_Table_05` có 4 submesh nhưng chỉ 3 material. Submesh thứ 4 là bản gộp của 3 cái kia (5928 + 11607 + 12 = 17547 index).
  - Unity không vẽ submesh không có material. Web cũ lấy material cuối (`lambert1`, xám 0,4) vẽ đè lên cả quầy.
  - `js/view/world.js` (`subMats`) giờ làm đúng luật của Unity: submesh thừa không vẽ, material thừa vẽ lại submesh cuối.
  - Áp cho cả mesh tĩnh và mesh có xương. Có 10 node bị ảnh hưởng (quầy, một số tủ, `ReptileBox`).
- **Khách đi trượt (moonwalk)**: mọi clip của người (khách, thu ngân) là clip Humanoid, lưu theo muscle chứ không theo Transform, nên `export_anim.py` xuất ra 0 track. Người trong game vì vậy đứng cứng một tư thế ở mọi trạng thái.
  - `tools/humanoid.py` + `tools/export_humanoid.py` đổi muscle → xoay từng xương cho mỗi Avatar:
    - SwingTwist: theo ShaderMotion.
    - PreQ / PostQ / Sgn / giới hạn: lấy từ `AvatarConstant`.
    - Khung thân (đường hông + đường vai): khớp đúng `m_RootX.q` của Avatar.
  - Mỗi clip có một biến thể cho mỗi Avatar, khoá `clip|avatarId`, tổng 123 biến thể. Rig chọn biến thể theo `m_Avatar` của Animator, và gắn xương người theo tên như Unity.
  - Đo bằng `test/petshop-walk.js`: chân trụ trượt 0,24–0,58 m/s ở tốc độ 1,25 m/s (trước là 1,25 m/s, chân không cử động).
  - Phần trượt còn lại có cả ở bản gốc: clip Walk không có tham số tốc độ, nên tốc độ sải chân không khớp hẳn tốc độ NavMesh.
  - [GUESS] Hai chỗ còn đoán:
    - Vị trí thân = trọng tâm theo khối lượng xương, cộng độ lệch đo ở T-pose.
    - Chưa chia twist cánh tay/chân theo `m_ArmTwist` / `m_LegTwist`.
- **Nút "ĐƯỢC RỒI" đè nút C**: chữ TMP auto-size được dịch khi hộp thối tiền còn ẩn, nên không đo được và giữ cỡ tối đa 118,9 px.
  - `js/view/ui.js` ghi lại các chữ chưa co được, và co lại khi `show()` chuyển một phần tử từ ẩn sang hiện.
  - Áp chung cho mọi chữ auto-size (kể cả nút "LEAVE CHECKOUT").

## Drop 8: camera gốc, thu ngân, bán kệ kho

- **Ống kính camera** đọc thẳng từ byte của `CinemachineVirtualCamera.m_Lens`, vì typetree sinh ra đọc hỏng:
  - PlayerVirtual Camera và TutorialCamera: FOV 50°, near 0,01, far 69.
  - CounterCamera: 50° / 0,1 / 100.
  - Bản web trước dùng 60° (GUESS). Skybox thu vào trong far 69 m; nó vẽ đầu tiên và không dùng depth nên kích thước không lộ ra.
- **Chuyển cảnh camera** theo `MainCameraBlends` (sharedassets1 #23542), kiểu EaseInOut = 3t² − 2t³:
  - Tutorial → người chơi: 3,5 s (trước là 1 s).
  - Người chơi → quầy: 0,75 s.
  - Quầy → người chơi: 1,0 s.
  - Trước đây quầy cắt cảnh tức thì.
- **Thu ngân** (đọc từ IL2CPP):
  - Ca 720 s trừ `Time.deltaTime` mọi lúc (`CashierWorkingState.UpdateState`), không chỉ khi ngày đang chạy.
  - Người chơi vẫn vào quầy được khi thu ngân đang làm (`CheckOutInteractable.Interact` không kiểm tra). Khi thu ngân bắt đầu thanh toán một khách mới, người chơi bị đẩy ra khỏi quầy (`AutoCheckoutHelper.StartAutoCheckout` → `ExitCheckOut`).
  - Energy làm tròn kiểu C# `Math.Round` (nửa về số chẵn). Bước ±$1 khớp mã: `min((max−min)×0,01, 1)`.
- **Bán kệ kho**: `StorageFurniture.CanSellDirectly` không xét hàng bên trong. Kệ còn thùng vẫn bán được, thùng mất theo kệ.
- **Màu đế khi đặt kệ**: `FurniturePlaceHelper` greenColor (0,38; 1; 0) / redColor (1; 0; 0), alpha 0,39.

## Drop 7: ánh sáng toàn cảnh (ambient Trilight)

- Chủ dự án báo cả cửa hàng chói trắng. Đo ảnh mặt trước tủ lạnh (`test/petshop-fridge-shot.js` ... `back`): 65% điểm ảnh có kênh cháy 255; tường trái 100%, sàn 89%.
- Hai đèn cũ (`AmbientLight(equator)` + `HemisphereLight(sky−equator, ground−equator)`, mỗi cái ×π×1,05) **không** cộng trùng, vì đèn bán cầu chỉ mang phần chênh. Nhưng nó sai ở hai chỗ:
  - Ở mặt đứng, `equator` bị triệt tiêu: tường nhận (sky+ground)/2 = 1,44 thay vì khoảng 1,0.
  - `m_AmbientIntensity` 1,05 bị nhân vào, trong khi Unity chỉ dùng nó cho nguồn Skybox (theo tài liệu Unity).
- Thay bằng một `THREE.LightProbe` (`js/view/trilight.js`) chiếu gradient trilight lên SH bậc 2. Mặt đứng nhận chủ yếu màu equator, sàn nhận màu sky kéo về equator, trần nhận màu ground. DayNightCycle dựng lại probe mỗi khung khi `ambientSkyColor` đổi.
- Số đo cùng góc chụp, trước → sau:
  - Phần ảnh cháy: 65% → 7%.
  - Tường trái: (255, 255, 186) → (208, 156, 106).
  - Sàn: (247, 208, 144) → (223, 148, 102).
  - Đế tủ lạnh: (118, 168, 229) → (77, 109, 147).
- Tone mapping: không có, vẫn là `NoToneMapping`, giống Unity Gamma không post-process. `_Exposure` của skybox chỉ đổi màu nền trời, không chiếu sáng vật nên giữ nguyên.
- [GUESS] Cách Unity nội suy gradient: tuyến tính theo y, giữ màu ở gamma. `m_AmbientProbe` trong level1 toàn số 0 vì probe được tính lúc chạy, nên không có số gốc để khớp.
- [GAP] Vẫn chưa có ảnh chụp trong game thật. Ảnh trên Google Play là tranh quảng cáo vẽ lại, không dùng làm mốc đo được.

## Drop 6: ánh sáng tủ lạnh (emission của Standard)

- **Nguyên nhân tủ lạnh trắng bệch**: shader Standard của Unity tính emission = `_EmissionColor` × `tex2D(_EmissionMap)`. Đọc lại material trong `sharedassets1` thì mọi material phát sáng có texture (27 trong pool, 10 trong store) đều dùng chính `_MainTex` làm `_EmissionMap` (Fridge_1, tường, trần, thú, khách...). Bản web cũ cộng một màu xám phẳng (Fridge_1: 0,31) lên mọi texel nên vùng tối cũng bị nâng lên và tủ thành khối trắng.
- Sửa: `tools/export_store.py` xuất `"emap"` (`"main"` khi trùng `_MainTex`), `js/view/std.js` đặt `emissiveMap`. `art/pool|store/scene.json` được vá đúng trường đó (so lại thì ngoài `emap` không đổi gì).
- Đo trên ảnh chụp mặt trước tủ (`test/petshop-fridge-shot.js`, 1280×720): đế xanh (130, 170, 230) thay vì (178, 216, 253); khung trên hết cháy trắng.
- **Chưa so được với ảnh gốc**: 6 clip YouTube tên "Pet Shop Simulator: Pet Games" đều là game khác (HUD khác), nên chưa có cặp gốc|web. Độ sáng tổng thể (ambient Trilight, trời 2,74) giữ nguyên. [GAP: cần ảnh chụp game thật]

## Drop 5: lấp các khoảng trống còn lại

- **Camera mở màn của hướng dẫn** (`Tutorial.tutorialCamera` = "TutorialCamera" trong level1, Unity (−9,57; 3,5; −2,22), quay 80°): góc nhìn ở màn chọn ngôn ngữ và màn chào, rồi chuyển về camera người chơi (Drop 8: 3,5 s EaseInOut theo `MainCameraBlends`, ống kính 50°).
- **Thanh đen màn chào** trượt vào từ 0 lên 125 px trong 1,0 s (`DOSizeDelta`).
- **"Your Delivery Arrived"** (`DeliveryUI.ShowTopAlertBar`): mỗi lần hàng tới, thanh kèm icon trượt xuống 0,5 s, đứng 1,5 s, trượt lên 0,5 s.
- **Thú ngồi trên quầy** (`AnimalProduct.OnAnimalMoveToCounter` → `Animator.Play("Sit")`), rồi chuyển sang `SitLoop` [GUESS sau 1 s].
- **Giọng sai tiền của trẻ em**: clip gốc `sharedassets0 #63` đọc ra là `11.1_CheckoutFailed`, không còn mượn giọng nam.
- **Gợi ý thanh toán sau 2 lần trả sai** (`PaymentManager.CheckPaymentStatus`, `maxFailedAttempts` 2), ngoài lúc hướng dẫn và nhiệm vụ đầu.
- **Chấm đỏ chỉ đường của nhiệm vụ** (`TaskManager.StartTaskTwo/Three/Four` → `ButtonMarkerHelper.ShowMark`):
  - Nhiệm vụ 2: giỏ, Manage, nút Buy của License 2.
  - Nhiệm vụ 3: giỏ, Store, tab Furniture.
  - Nhiệm vụ 4: giỏ, Manage, tab Expansion, nút Buy của Expansion 2.
  - Bấm nút nào thì chấm của nút đó tắt [GUESS].
- Bong bóng gợi ý WASD chỉ hiện khi người chơi đang đi lại được (không còn hiện lúc đứng quầy).

## Drop 4: FTUE đầy đủ, giọng khách, Delivery Queue

- **FTUE chạy với mọi người chơi chưa xong hướng dẫn**:
  - Save mới, và cả bản lưu Drop 1/2 không có trường `tutorialDone`: theo `GameSaveData`, cờ này mặc định 0 nên `Tutorial.CheckTutorial` chạy hướng dẫn. Drop 3 từng coi bản lưu cũ là đã xong, nên người từng chơi bản cũ không thấy hướng dẫn.
  - Thùng hướng dẫn được đặt lại.
  - Bước 9 chọn ngăn khác nếu ngăn 1 của Rack đang chứa hàng khác, để không kẹt.
  - Không có nút bỏ qua; `?notut` chỉ dành cho test.
- **Ép đúng hành động đầu tiên**: trong lúc hướng dẫn, chỉ đích của bước hiện tại phản hồi:
  - thùng hướng dẫn → ngăn được chỉ → thùng rác → bảng giá → biển → quầy → món hàng / khách → laptop → thùng giao → chuồng.
  - Nút giỏ hàng ẩn suốt hướng dẫn (cửa hàng mở từ laptop ở bước 17).
  - Nút "Leave Checkout" và Esc bị khoá khi đang phục vụ 2 khách (`CheckOutCounter.HideExitButton`).
  - Không nhấc kệ để di chuyển được.
  - Phần ép đích là [ĐỀ XUẤT] thêm vào trên nền collider bị tắt của gốc.
- **Nhắc bằng tay/mũi tên**:
  - mũi tên 3D gốc;
  - vùng "force look" gốc (`ForceTutorialStepCompleter`, node 163–167): đi vào là camera quay về đích trong 0,35 s;
  - mũi tên chỉ đích ở mép màn hình (HUD Navigation, sprite `UpUIArrow`) khi đích ra khỏi tầm nhìn;
  - ngón tay chỉ món cần quét trên quầy → chỉ tiền/thẻ trên tay khách → chỉ từng tờ tiền/đồng xu thối (lớn nhất chưa vượt) hoặc từng phím thẻ → OK; ngón tay chỉ nút Leave, laptop → Animals → Buy → Buy giỏ, nút Get It Now.
- **Thùng thú không cần mở** (`AnimalDeliveryBox` không có `IOpenBox`): thú đi thẳng từ thùng vào chuồng.
- **Giọng và phản ứng của khách** (`CustomerReactionHelper`):
  - Tại lúc bấm OK: Thanks + HeadYes; thối dư 1–100 ¢ thì FreeCash + Happy, kèm cảnh báo "You gave extra change of $x"; sai tiền thì WrongAmount + HeadNo. Giọng nam / nữ / trẻ em theo prefab khách.
  - Khách đứng lại 2 s (`processCheckOutTime`) rồi mới xách túi về; tiếng chuông thanh toán phát lúc đó.
  - Chuông quầy kêu khi khách duy nhất bỏ hàng lên quầy mà không ai đứng máy tính tiền.
  - Thú kêu khi lên kệ và khi lên quầy (`moveToRackClip` / `moveToCounterClip`).
- **Thanh giao hàng gốc** (icon, xN, thanh thời gian, mm:ss, số xe) và **Delivery Queue** (`DeliveriesCatalogUIHelper`):
  - Nút trong suốt ở thanh mở bảng (chỉ khi đã qua hướng dẫn và có hàng đang chờ).
  - Mỗi đơn chờ là một ô; ô đầu đang giao có màu và nút Get It Now / Free; các ô sau xám, kèm dòng "Previous orders needs to delivered first!". Bảng tự đóng khi hết hàng chờ.
  - Giá boost thật: `clamp(ceil(thời gian còn × 5 / tổng thời gian), 1, 5)` energy (Drop 1–3 đoán +1 mỗi lần).
  - Nút "Free" (quảng cáo trong gốc) miễn phí 1 lần/ngày [PLACEHOLDER].
- **Sửa thêm**: nút trong suốt ở thanh giao hàng trước bị nối nhầm vào boost; tên âm thanh mở thùng và hoàn thành bước hướng dẫn nay đúng file gốc (`5_BoxOpening`, `28_Tut_Step_Completed`).

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

- Hướng dẫn:
  - Thanh đen điện ảnh hiện ngay, không tween 1 s.
  - Mũi tên mép màn hình dùng sprite `UpUIArrow` vì prefab chỉ báo gốc (`IndicatorPrefab`) không có trong dữ liệu xuất; chỉ hiện khi đích ra khỏi màn hình. [GUESS hình]
  - Ngón tay ở quầy (món cần quét, tiền trên tay khách) là cách vẽ lại điểm nhấn gốc ở `SubmitProducts` / `FirstCustomerScenerio`. [GUESS hình]
  - Phần HUD bật/tắt theo bước là suy ra từ các lệnh SetActive không xuất được: ẩn HUD ở bước 1–3, chưa đi được trước bước MoveJoyStick, nút Interact/giỏ hiện từ PickUpBox. [GUESS]
  - Tải lại giữa chừng thì tiếp tục từ bước đang làm; gốc không lưu bước nên sẽ chạy lại từ đầu với thế giới đã thay đổi. [ĐỀ XUẤT]
- Giọng: id clip → tên file suy theo nhóm (nam / nữ / trẻ em). Tiếng thú: id clip → tên file suy theo loài; cá và bò sát không có clip trong gốc. [GUESS]
  - Ô ngôn ngữ đang chọn: sprite "đã chọn" không có trong dữ liệu xuất → viền sáng. [GUESS]
- Ngày–đêm: chiều quay `_Rotation` của bầu trời. [GUESS]
- Bảng phím: là phần thêm cho bản web (gốc chỉ có cảm ứng). [ĐỀ XUẤT]
- Máy thưởng / Bank / Low Cash / Low Energy là quảng cáo thưởng trong gốc, không giới hạn; bản web cho miễn phí, **mỗi nguồn 1 lần mỗi ngày**. [PLACEHOLDER chính sách]
- Discard Boxes: thẻ ghi 10 energy nhưng hàm xử lý gốc không trừ energy → bản web không trừ (theo mã).
- `AtmPanel` ($20) không dùng: bấm máy ATM nhận thẳng $50 (`AtmMachine.Reward`).
- Kho: cảnh báo "StorageBoxEmpty"/"StorageCabinetFull" không có trong bảng term (gốc sẽ hiện rỗng) → chữ tiếng Anh. [PLACEHOLDER]; gốc dùng hai key này ngược chỗ nhau, bản web hiện đúng nghĩa.
- Cửa kho mở: tween DOMove gốc, độ cao 2,6 m trong 1 s rồi ẩn. [GUESS]
- Bán kệ kho: lệnh cộng tiền không tìm thấy trong mã → cộng `SellPrice` [GUESS]; kệ còn thùng vẫn bán được (`CanSellDirectly`, Drop 8).
- Thu ngân: đã giải trong Drop 8 (ca 720 s đếm mọi lúc, bước ±$1, người chơi bị đẩy ra khi thu ngân bắt đầu thanh toán).
- Đặt kệ: khoảng cách tâm nhìn – sàn kẹp 1–4,5 m cho chuột/cảm ứng (gốc 0,135–10 m). [GUESS]; màu xanh/đỏ của đế lấy từ `FurniturePlaceHelper` (Drop 8).
- Nhiệm vụ không thưởng XP (mã `CompleteTask` không cộng gì, dù chữ hướng dẫn hứa "bonus XP") → giữ như mã.
- Bảng LevelReward dùng `rewardDataList[cấp − 1]` y nguyên dữ liệu gốc, kể cả chỗ lệch (ví dụ "New Expansion" ở cấp 3 trong khi Expansion 2 mở ở cấp 5).
- Extra Counter: tắt trong gốc → không có.
- Không làm (gốc là quảng cáo / mua trong ứng dụng / dịch vụ ngoài): StarterPanel, RemoveAdPanel, RateUsPanel, quảng cáo xen giữa, Bug Report, Discord.
- **Chăm thú: game gốc không có** (`AnimalEatState` rỗng, `AnimalHealth.AddHealth/DecreaseHealth` không có lời gọi nào). Thú là hàng trong chuồng; 2 con chó trong "Training Area" chỉ để trang trí. Bản web giữ đúng như vậy.
- Quảng cáo thưởng của gốc → nhận miễn phí: phần thưởng lên cấp ($50 + 10 energy), Tax Free (hoàn thuế). Các nút quảng cáo/IAP khác bị ẩn. [PLACEHOLDER chính sách]
- Màn POS 3D ở quầy (TextMeshPro trong không gian) được vẽ lại thành ô chữ DOM.
- Ánh sáng: level1 không có đèn và lightmap; ambient Trilight dựng thành LightProbe (Drop 7). [GUESS] cách nội suy gradient
- Độ nhạy: gốc nhân `TouchDist × RotationSpeed 10 × sensitivity (mặc định 10) × dt`; khoảng của thanh trượt không có trong dữ liệu xuất nên bản web giữ 0,25×–2× cho chuột. [GUESS]
- Boost giao hàng: giá = max(1, min(5, ceil(thời gian còn × 5 / tổng))) theo `DeliveryUI.UpdateTimerText` (Drop 4).
- Bảng ngày gốc ghi "Tax(-10%)" nhưng mã tính 5%; bản web giữ cả hai như gốc.

## Bố cục

- `tools/`: bộ xuất Python (UnityPy 1.25.4 + TypeTreeGeneratorAPI, venv `~/burger-work/.venv`, chạy `python -I`). Nguồn ở `$PS_REF` (mặc định `~/petshop-dl`).
  - `export_store.py level1 store` → `art/store` (scene, glb). `export_store.py sharedassets1.assets pool --prefabs $(cat data/pool_ids.txt)` → `art/pool` (140 prefab chạy lúc chơi; danh sách từ `pool_list.py`).
  - `export_navmesh.py store`, `export_colliders.py level1 store` (lưới va chạm của người chơi + tam giác sàn cho đặt kệ), `export_text.py` (I2 → `data/text.json`), `export_board.py` (sprite biển hiệu + icon phần thưởng cấp + icon các bước hướng dẫn), `export_sky.py` (6 mặt bầu trời), `node tools/export_rewards.mjs`, `export_anim.py`, `export_audio.py` (FSB5 → vgmstream → MP3), `export_ui.py` (toàn bộ Canvas uGUI + các ô prefab), `export_data.py` → `data/game.json` + `art/icons`, `node tools/export_layout.mjs` → `data/layout.json`, rồi `to_webp.py`.
  - `stamp.js <rev>` gắn `?v=<rev>` cho import map và ghi `version.json`.
- `js/sim/`: luật thuần (`sim.js`, `nav.js`, `place.js` = CanPlace), chạy được bằng node.
- `js/view/`: `world.js` (scene.json → three.js), `std.js` (material Standard ở Gamma space), `pool.js`, `game.js` (sim → 3D, vùng va chạm của tia), `player.js` (FPS + lưới va chạm), `ui.js` + `hud.js` (Canvas gốc → DOM), `anim.js`, `audio.js`.

## Kiểm

- `node test/petshop-sim.js`: một ngày trọn vẹn bằng số thật.
- `node test/petshop-sim2.js`: luật Drop 2 (license/expansion, nhiệm vụ, CanPlace, kho, dịch vụ, thu ngân, thưởng, tên cửa hàng, lưu/nạp).
- `node test/petshop-play4.js`: giọng/phản ứng khách, chuông thanh toán lúc +2 s, tiếng thú, thanh giao hàng, Delivery Queue.
- `node test/petshop-tutorial.js`: cả 20 bước hướng dẫn qua sim (cả bản lưu cũ); `node test/petshop-daynight.js`: số của đường cong ngày–đêm.
- `node test/petshop-play.js`, `petshop-play2.js`, `petshop-play3.js`: Chromium headless chơi bằng điều khiển thật, chụp `shots/play-*.png`, `shots/d2-*.png`, `shots/d3-*.png` (play3 = hướng dẫn từ đầu tới cuối + ngày/đêm + bảng phím).
