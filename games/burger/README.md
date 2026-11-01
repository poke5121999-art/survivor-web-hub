# Burger Please! (bản web, không Unity)

Làm lại Burger Please! (Supercent, `io.supercent.burgeridle` 31.8.0 / versionCode 144) bằng three.js r160 và JavaScript thuần, không có bước build, theo khuôn My Mini Mart (`games/casual-farm`). Hiện có Stage 1 (Stage01_Sprint2): khu 1 và khu 2 của nhà hàng.

- Chạy: mở `index.html`. Tham số: `?fresh` bỏ qua bản lưu, `?bot` cho máy tự chơi, `?speed=N` chạy N bước mô phỏng mỗi khung hình (để kiểm).
- Khung dọc 9:16 như bản gốc (game gốc chỉ chạy dọc). Điều khiển: kéo chuột / ngón tay ở bất kỳ đâu (joystick nổi) hoặc WASD / phím mũi tên.
- Nguồn: XAPK APKPure, bóc ở `/run/media/bui-thanh-thuong/C0E02AC6E02AC310/burger-ref` (HDD máy linux, ngoài git). Engine Unity 2022.3.62f3, IL2CPP arm64, metadata v31 không mã hoá.

## Vòng chơi đang có

Theo đúng thứ tự hướng dẫn `Stage._stageGuide` của prefab Stage01 (chữ lấy từ `Locale_128`, tiếng Anh):

1. Nhặt cọc tiền đầu (180, `MoneyArea.moneyCount`) → mua cửa (25) → bàn 1 (5) → vỉ nướng 1 (50) → quầy (100).
2. Vỉ nướng ra 1 bánh mỗi 3 s, tối đa 4 bánh ở cấp 0 (`CoffeeMachineData._maxValueLevel`, `StageObjectAbilityData` type 10). Người chơi đứng cạnh vỉ để lấy bánh (mang 2 cái ở cấp 1), thả vào quầy.
3. Khách đi theo `CustomerPath1`, xếp hàng trước quầy, gọi 1–2 bánh (`Stage.InitData`: StageItem của quầy `minCount` 1 / `maxCount` 2). Người chơi đứng ở chỗ thu ngân thì mỗi 2 s trao 1 bánh (`CounterData._workerSellTimerLevel`); đủ đơn thì khách trả giá × số bánh (giá 5, `StageData.zone_item_price_data_key` → `Stage_1_Burger_Price`) vào cọc tiền cạnh quầy.
4. Khách tìm ghế trống ở bàn sạch, ngồi ăn (5 s / bánh ở cấp 0), để lại cốc rỗng; bàn bẩn không nhận khách. Người chơi dọn cốc, bỏ vào thùng rác.
5. Ô nâng cấp quầy (100) = thuê thu ngân; bàn 2, mở khu 2 (100), phòng HR (40), văn phòng nâng cấp (60), drive-thru (50), bàn đóng hộp (25), rồi khu 3 → bàn 3 → vỉ nướng 2 → bàn 4 → khu 4...
   - Pad nào hiện, tường nào mất, khu nào mở đều chạy theo dữ liệu gốc `Stage._stageFlows` (11 flow song song, mỗi `Progress` chờ `checkObjects` được xây rồi bật `createObjects`/`upgradeAreaObjects`, tắt `disableObjects`, mở `districtAreaObjects`) và `Stage._stageGuide` (ẩn pad trong lúc hướng dẫn). Bước kiểm thuộc tính năng chưa làm (kiosk, nhà vệ sinh, phòng skin, robot dọn) được coi là đạt và các khu đó tắt hẳn. Drive-thru và bàn đóng hộp là thật: flow 2 chờ chúng được xây rồi mới hiện vỉ nướng 2.
   - Pad khu bị khoá theo cấp sao (`StarLevelData` của stage, phần thưởng `Region<k>UnLock`): khu 2 cần sao 1, khu 3 sao 2... Mỗi lần xây, nâng cấp, mua ở văn phòng/HR được 3 exp (`StarExpData`); lên cấp có tiền thưởng (cấp 1: 20, cấp 2: 50).
6. Văn phòng nâng cấp: sức mang 2→22, tốc độ 3→6, giá bánh +0→+20 theo `PlayerTotalUpgradeData` (mọi stage của bản này đặt `use_player_total_data`). HR: thuê tối đa 5 nhân viên (`WorkerData.workerMaxEmploy`), tốc độ và sức mang theo `Stage_1_Worker*`.
7. Nhân viên tự dọn bàn và chở bánh từ vỉ ra quầy, tốc độ `WorkerData._moveSpeed` m/s (1,0 ở cấp 0). Khách vào mỗi `Stage.customerSpawnTime` (3 s), tối đa `maxCustomerCount` (10) mỗi quầy.
8. Bàn đóng hộp (`PackageTableNode`, `PackageTableData`): người chơi bỏ bánh vào phía kho (tối đa 50, `_maxIngredientValue`), đứng ở chỗ làm việc của bàn thì cứ `DelayLevel` giây (1,6 / 1,1 / 0,5 theo cấp) 4 bánh thành 1 hộp (`PackageItem.tempItems[4]`, `PACKAGING_MAX_STEP` 4), tối đa `MaxItemValueLevel` hộp chờ (6 / 7 / 10). Từ cấp `_employGrade` (1) có người đóng hộp thuê sẵn, không cần đứng.
9. Drive-thru (`DriveCarCounterNode`, `DriveCarCounterData`, `DriveCarSpawner`, `Car`): xe vào mỗi `Stage.carSpawnTime` (4 s) khi hàng chưa đủ `maxCarCount` (6), mẫu xe ngẫu nhiên trong `driveCarType` (Car01–05), chạy 6 m/s theo `driveInPath`, cách nhau 3,5 m (`carSize`). Mỗi xe gọi 1–3 hộp (`Stage.InitData`), chỉ 1 hộp khi hướng dẫn chưa qua bước 20 (`Car.FoodOrderSet`). Người chơi đứng ở ô cửa sổ thì vừa bỏ hộp vào kệ (tối đa 50) vừa bán, mỗi 1,5 s một hộp (`_workerSellTimer`); đủ đơn xe trả 24 × số hộp (`Stage_1_BurgerPackage_Price`) vào cọc tiền rồi ra theo `driveOutPath`. Từ cấp 1 có thu ngân thuê.
10. Hướng dẫn chạy tiếp các bước gốc 18–25: Create_DriveThru → Create_PackageTable → nhặt bánh → bỏ vào bàn đóng hộp → nhặt hộp → bỏ vào drive-thru → bán. Bước 26–27 (nhặt bánh → bỏ vào kiosk) chờ kiosk có mặt mới hiện (`Kiosk.OnEnable` → `GuideActiveEvent`); dừng ở bước nhà vệ sinh.
10b. Kiosk tự gọi món (`KioskArea` 450, hiện khi khu 5 mở; `Kiosk`, `CustomerSpawner`): bộ đếm khách riêng `Stage.kioskCustomerSpawnTime` (5 s), 2 làn, mỗi làn tối đa `maxKioskCustomerCount` (1), khách vào làn ít người hơn, cách nhau 1,2 m. Người chơi (hoặc nhân viên) bỏ bánh vào kiosk (tối đa 50); khách đầu làn gọi món trong `orderTime` 5 s, rồi kiosk tự trao 1 bánh mỗi 0,25 s (`sellTimer`), khách trả giá bánh × số bánh vào cọc tiền kiosk và mang đi, không ngồi bàn.
10d. Mũi tên hướng dẫn: prefab gốc `Waypoint Arrow` (`GuideArrow`, màu hồng `_arrowColors[0]`) treo trên transform của bước hướng dẫn hiện tại và nhún lên xuống (độ cao, biên độ nhún là đoán; tween DOTween không nằm trong dữ liệu).
10c. Bong bóng đơn hàng (`OrderBalloonManager`): một bong bóng trên đầu người/xe đứng đầu mỗi hàng (quầy, drive-thru, mỗi làn kiosk), khung `outline_box` sliced 1,6 × 1,0 m cao 2,92 m, nội dung `<sprite=N> số` với icon của sprite asset `ItemIcon1` (1 bánh, 2 hộp bánh).
11. Âm thanh gốc (`AudioStorage`): nhạc `BGMId.USA` (bật khi đã có quầy, `Counter.OnEnable`) trên nền `Ambient`, hiệu ứng BuildComplete / Upgrade / GetMoney theo đúng chỗ gọi trong decompile; GaugeFill, GaugeMoneyFill, Trash, CarHorns gắn theo tên (chỗ gọi chưa decompile). Bật sau cú chạm đầu tiên; nút 🔊 tắt/mở, nhớ trong `localStorage` `bp-sound`.
12. Giao diện gốc: ô tiền, dòng hướng dẫn (`GuideText`), popup văn phòng nâng cấp (`PlayerTotalUpgradeUI`), popup HR (`HRUpgradeUI`), popup tiền offline dựng lại từ RectTransform/Image/TextMeshPro của `level1` bằng sprite gốc. Giá trên pad là `priceText` của chính pad, vẽ lên mặt phẳng nằm trên sàn như TextMeshPro gốc; pad khu còn khoá sao vẫn là nhãn ★N. Nút quảng cáo, nút kim cương, bong bóng boost bị ẩn vì bản web không có quảng cáo/cửa hàng.
13. Lưu tự động (`localStorage` `bp-stage1-v1`). Tiền lúc vắng theo `GameManager.CheckOfflineReward`: giây vắng / 10 × 4 (`offline_reward_plus`), trần 10 phút × 4 × 6 = 240; dưới 5 phút không có popup.

## Bố cục

- `tools/` — bộ xuất Python (UnityPy 1.25.4 + TypeTreeGeneratorAPI, venv `~/burger-work/.venv` trên máy linux). Mọi bộ đọc dữ liệu đã bóc qua `tools/mm.py` (`$BP_REF`).
  - `export_store.py <file> <out-id> [--prefabs id,...]` (pool hiện thêm `3101` = Waypoint Arrow ở cuối danh sách) (chép từ casual-farm, thêm: SkinnedMeshRenderer không xương vẽ như mesh tĩnh, bỏ qua RenderTexture, PPtr cùng file ngoài cây prefab ghi đúng tên file). Đã chạy: `f60e1eeecaf54344ebfcb50bfcda2221 stage1` (prefab Stage01), `level1 level1` (camera, đèn, ObjectPool), `sharedassets1.assets pool --prefabs 3638,3461,3458,3451,3648,3655,3520,3518,3519,3654,3660,3649,3644,3652` (tiền, cốc, bánh, hộp, khách, khách VIP, rác, xe Car01–05 = `_carObjectData[0..4]`).
  - `export_anim.py` → `art/anim/` (212/214 clip, controller).
  - `export_navmesh.py stage1` → `art/stage1/navmesh.json` (31 polygon của NavMeshData + 136 NavMeshObstacle, mỗi cái nhớ node của nó).
  - `export_skins.py` → `art/pool/skins.*` (phụ kiện khách: kính, cà vạt, mũ).
  - `export_data.py stage1` → `data/stage1.json` (vị trí thế giới của mọi pad, vỉ, quầy, bàn, đường đi, giá, hẹn giờ, chuỗi hướng dẫn, cây node để biết vật cản nào đang bật, camera/đèn của `level1`) và `data/text.json` (Locale_128 tiếng Anh; file gốc có dấu `"` không escape ở bản tiếng Pháp nên đọc theo mẫu).
  - `export_audio.py` → `art/audio/` (7 hiệu ứng, nhạc USA, ambient; FSB5 Vorbis giải bằng fmod chế độ không cần loa, mã lại MP3 bằng ffmpeg).
  - `export_ui.py` → `art/ui/ui.json` + 44 sprite PNG (cây RectTransform, Image, TextMeshPro, chữ khoá Locale, viền chữ từ material TMP).
  - `pool_list.py`, `read_mb.py` — tra cứu (danh sách prefab của ObjectPoolManager; in MonoBehaviour bất kỳ).
  - `stamp.js <rev>` — gắn `?v=<rev>` cho import map của `index.html` và ghi `version.json`. Chạy mỗi lần đổi rev.
- `js/sim/` — luật chơi thuần, chạy được bằng node. `sim.js` (trạng thái, pad, vỉ, quầy, khách, bàn, nhân viên, nâng cấp, lưu), `nav.js` (lưới 0,25 m từ navmesh gốc trừ vật cản đang bật, A*), `bot.js`.
- `js/view/` — `world.js`, `toon.js`, `anim.js` chép từ casual-farm (shader Toony Colors Pro 2, rig Animator); `game.js` bật/tắt GameObject theo trạng thái xây như CreateArea gốc, chồng bánh/hộp/tiền/cốc, khay đóng hộp, xe, khách, nhân viên; `ui.js` dựng màn uGUI gốc thành DOM (neo/pivot RectTransform, ảnh sliced, chữ TMP tự co); `hud.js` dùng các màn đó + dòng hướng dẫn, giá trên pad, nút âm thanh; `audio.js` nhạc và hiệu ứng.
- `art/level1/` không được trang tải (chỉ `export_data.py` đọc camera/đèn) nên không nằm trong tarball bàn giao.

## Nguồn luật

- Bảng JSON (`StageObjectData/Cost/Ability`, `PlayerTotalUpgradeData`, `StageData`, `StarLevelData`, `StarExpData`, `Locale_128`) và field prefab/ScriptableObject (`CoffeeMachineData`, `CounterData`, `WorkerData`, `Stage`).
- Thân method decompile bằng unity-decode-kit (Ghidra, 62 kiểu gameplay) ở `<HDD>/burger-ref/udk/code/decomp.next/Assembly-CSharp/*.c`: `CustomerSpawner.Update` (nhịp/trần khách), `Stage.WorkerMoveSpeed`, `PlayerMove`, `CoffeeMachine.GetDelayLevel`, `MoneyArea.AddMoneyCount`, `UpgradeArea.UpgradeCounterReward`, `DistrictArea`, `GameManager` (tiền offline, nguồn exp). Hai hằng `OFFLINE_REWARD_UNIT`/`MAX_UNIT` đọc từ mã máy `WorldMapManager..ctor` bằng capstone (VA 0x18D3F08, hằng ở 0x91B13C).
- Nhiều vòng lặp nằm trong coroutine (`MoveNext`) mà Ghidra chưa xuất; chỗ đó vẫn đoán, đánh dấu `[GUESS]` trong `js/sim/sim.js`.

## Kiểm (máy linux)

- `node test/burger-sim.js` — bot chơi 120 phút mô phỏng (khoảng 25 s; kiosk mở quanh phút 104) qua đúng vector joystick. Khẳng định: nhặt tiền đầu, mua pad hướng dẫn đúng thứ tự, dòng hướng dẫn chạy hết phần đã làm, vỉ nướng/thu ngân/khách trả tiền/dọn cốc có số thật, HR có nhân viên, văn phòng bán nâng cấp, lên sao 2 và qua khu 3 (bàn 3), drive-thru xây trước bàn đóng hộp, hộp được đóng và xe trả đúng 24 mỗi hộp, flow 2 qua hai bước kiểm drive-thru/bàn đóng hộp, hướng dẫn chạy tới bước kiosk, nhân viên tự làm khi người chơi đứng yên, bản lưu nạp lại đúng, tiền offline đúng công thức (1 giờ = 240, 4 phút = 0, 6 phút = 144).
- `node test/burger-play.js` — Chromium headless thật (playwright-core ở `~/.cache/pw-node`, WebGL SwiftShader): nạp không lỗi, khung hình không trống, phím W đi được, bot phục vụ khách, HUD khớp tiền, bấm nút CAPACITY trong văn phòng nâng cấp đúng cấp và trừ đúng giá, tải lại giữ tiến trình, vắng 1 giờ thì popup offline (sprite gốc) trả tiền khi bấm CLAIM, bong bóng trên đầu khách đứng đầu hàng hiện icon bánh và đúng số còn thiếu, cú chạm đầu bật âm thanh và giải mã đủ 7 hiệu ứng, bản lưu 12 phút từ sim node nạp vào trang thì xe drive-thru được vẽ và trả tiền, bấm EMPLOY trong popup HR thêm 1 nhân viên và trừ đúng giá, bản lưu phút 108 thì kiosk hiện và bán cho khách mang đi.
- `node test/shot.js '?fresh&bot&speed=6' shots/x.png 15000` chụp màn hình; `node test/shot-save.js 32 shots/x.png` chơi 32 phút trong sim node rồi nạp bản lưu đó vào trình duyệt để chụp; `node test/probe.js '<query>' '<biểu thức>'` đọc trạng thái trong trang.

## Còn hở

- Còn đoán về kiosk: khách chờ đúng `orderTime` rồi mới được trao (thân `KioskWait` chưa decompile), số bánh mỗi đơn kiosk dùng 1–2 như quầy, giá = giá bánh của quầy (`Kiosk.GetFoodPrice` chưa decompile); con số trên bong bóng giảm dần khi trao.
- Còn đoán (`[GUESS]` trong `sim.js`): nhịp nhặt/thả từng món (0,08 s), lượng tiền mỗi nhịp trả pad (nhịp `createMoneyTime` 0,05 s đã biết, lượng thì chưa; web đổ đầy trong 1,2 s), chỗ xếp hàng, thời gian ăn = giá trị bàn × số bánh, thứ tự việc của nhân viên (dọn bàn → bánh ra quầy → hộp ra drive-thru → bánh vào bàn đóng hộp), người chơi bán ở drive-thru cùng nhịp 1,5 s với thu ngân thuê, xe trả đúng 24 × số hộp (`GetFoodPrice` chưa decompile, `_sellPriceLevel` 10/12/20 chưa rõ dùng thế nào nên chưa cộng).
- Chưa làm: nhà vệ sinh, robot dọn, khách/xe VIP, phòng skin, phụ kiện ngẫu nhiên của khách (`art/pool/skins.*` đã xuất, chưa gắn), stage 2–10, hiệu ứng hạt, bong bóng "đang gọi món" của khách kiosk (`KioskBalloon`), mũi tên mép màn hình khi mục tiêu ở ngoài khung (`GuideArrowUI`), thanh tô tiến độ trên pad.
- Font: chữ TMP gốc (Bakbak One) chỉ có dạng atlas SDF, không có file TTF trong bản build, nên trang dùng font Bakbak One nếu máy có, không thì font đậm hệ thống.
