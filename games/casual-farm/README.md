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
  - `export_store.py level1 citymap --root CORE/GameManager/ENVIRONMENT_City --drop Environment_V2,AdsBreakDropPoints` ghi `art/citymap/` (bản đồ saga 3D mà scene nào cũng mang ở x = -1000; layout mặc định `DefaultEnvironment` vì `RC_ToggleNewSagaMap.isEnabled = 0`).
  - `export_store.py level1 store1` ghi `art/store1/scene.json` (cây node, transform, MonoBehaviour field), `geo.glb` (meshopt) và `art/tex/`. Store 9–14 có thêm hai prefab ô mua dưới root ẩn `__Prefabs`.
  - `export_anim.py` ghi `art/anim/clips.json` và `controllers.json` (state machine của Animator).
  - `export_items.py` ghi `art/items/` (mesh và icon của 136 loại hàng).
  - `export_data.py Store store1` ghi `data/store1.json` (giá ô, tiền đầu, giá hàng, lấy từ `RC_MartProgression`). Store 9–14 dựng ô từ CSV `Store_N_Progression` như `ProgressionData.CreateProgressData`; với Store 9 kết quả khớp `RC_MartProgression_Store_9` 38/38 ô (in ra khi chạy).
  - `export_navmesh.py store1` ghi `art/store1/navmesh.json` (polygon Detour và NavMeshObstacle).
  - `export_audio.py` ghi `art/sfx/` (43 clip mp3 + `sfx.json` sự kiện → clip, âm lượng gốc). Cần ffmpeg và vgmstream.
  - `export_ui.py` ghi `art/ui/` (sprite HUD, layout uGUI).
  - `export_menus.py [--print]` ghi `art/ui/menus/` (prefab menu bản đồ `MartMenu_ABTEST`, `MartPrestigeMenu`, `MartPrestige_WelcomeScreen`, `Info_Prestige`, kèm sprite, màu nút `Button` và 13 icon mart `Mart_<Tên>Icon`). `--print` in cây node dạng dàn ý để đọc bố cục.
  - `stamp.js <rev>` gắn `?v=<rev>` cho mọi module trong import map của `index.html`. Chạy mỗi lần tăng `rev`.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node. Sim phát sự kiện vào `sim.events`, view đọc rồi xoá.
  - `store.js` dựng mô tả tĩnh của cửa hàng từ `scene.json`: ô mua, máy sản xuất, kệ, quầy, khách, người chơi.
  - `sim.js` giữ trạng thái: tiền, hàng mang theo, trả tiền ô, sản xuất, nâng sức mang, lưu/nạp.
  - `customers.js`, `workers.js`, `thief.js`, `cars.js` (khách đi xe đặt hàng, trả gấp 5), `tasks.js` (15 bước hướng dẫn đọc từ `TaskController`), `grid.js` + `nav.js` (tìm đường), `bot.js`.
  - Máy: cây (tự sinh), máy 1–4 đầu vào (mỗi đầu vào một ô thả riêng), ao cá, xe thu hoạch (đi 2,5 s, về 2,5 s, nhả từng món 0,2 s).
  - Nâng cấp (`Sim.upgradeOffer` / `buyUpgrade`): người chơi mang 3→7; máy tốc độ ×1,2…×1,8 và sức chứa 4/6/8; nhân viên tốc độ 9→15 và mang 3→6. Giá gốc P/W là giá ô đã mở khoá máy/nhân viên đó (suy từ `MatActivateController.c:1939`).
  - Lưu: `mmm-global-v1` (mart đang ở, tiền dùng chung, giờ lưu, sao từng mart, vàng, phần thưởng prestige đang chờ) và `mmm-<store>-v1` cho từng mart (có `demand` = `currentDemandIndex`).
  - `martmap.js`: thẻ bản đồ và prestige. Thu nhập tối đa = trunc(% hoàn thành × gốc) + gốc × hệ số sao trước đó (`MartMenuController.c:3619-3660`); tiền tích dần theo thời gian trong 3 giờ, hiện `x/max`. Prestige mở từ 80 %, tối đa 4 sao; thưởng vàng 20/30/40/50 và tiền trunc(1,5 × thu nhập tối đa); hệ số thu nhập 1/1,5/2/2,5/3 (`census-prestige.md`).
- `js/view/` vẽ: `world.js` (cảnh), `toon.js` (shader Toony Colors Pro 2 và viền), `anim.js` (rig), `game.js` (đồ chồng, khách, nhân viên, trộm, xe van, xe thu hoạch, hiệu ứng), `camera.js` (lia tới đồ vừa mở 1 s sau khi mua, 2 s mỗi mục tiêu), `sound.js` (tiếng theo sự kiện, nhạc nền), `hud.js` (DOM: tiền, vàng, joystick, nhãn giá, bong bóng khách, banner hướng dẫn, mũi tên, menu Next Mart, menu nâng cấp), `citymap.js` (bản đồ 3D sau thẻ bản đồ: cửa hàng ẩn đi, xe van của người chơi đậu ở node `Mart3DController` của mart đang xem, camera chính bám xe, lên/xuống thì xe thu nhỏ 0,1 s, nhảy sang mart kia, phóng 1,2 lần OutBack kèm khói; mart chưa tới tô đen; mart có tiền chờ thu thì lấp lánh; khách và trộm không sinh khi đang ở bản đồ), `martmenu.js` (thẻ bản đồ từng mart với nút lên/xuống, menu Prestige, màn chúc mừng, popup báo prestige khi mart đạt 100 %).

Mọi con số luật chơi có dẫn nguồn trong `D:\minimart-ref\rules\*.md`, ghi theo `Tệp.c:dòng` của bản decompile.

## Kiểm

- `node test/casual-farm-sim.js` cho bot chơi 90 phút mô phỏng. `MM_MINUTES=200` thì phải mua đủ 40/40 ô, xong 15/15 bước hướng dẫn, bản lưu nạp lại đúng. `MM_STORE=store5` chạy mart khác (bot mang sẵn tiền đủ ba ô đầu, như tiền mang từ mart trước).
- `node test/casual-farm-nav.js` kiểm tìm đường và va chạm.
- `node test/casual-farm-render.js` soi mặt hình trong trình duyệt thật: bot chơi tua nhanh, cứ 0,5 s mô phỏng đọc scene graph một lần. Kiểm người chơi, khách, nhân viên quay mặt theo hướng đi; xe đẩy chỉ có khi đơn quá 3 món và hàng nằm trong xe; mỗi lần trả tiền ô hay nhặt tiền quầy đều có cọc tiền bay; chuỗi quầy (hộp hiện, hàng nhảy vào, hộp sang tay khách, mặt cười, tiền bay về quầy); không có hộp hay mesh hàng mồ côi; bụi chân khi đi, khói khi khách biến mất, pháo giấy sau khi nâng cấp máy, vòng boost khi booster chạy; mọi texture là bản nét kể cả khi tải lại từ cache; không có nhãn giá lơ lửng; mỗi cặp vật cũ/mới chỉ hiện bộ cũ. Ảnh từng khoảnh khắc (camera dừng, zoom 2,5 lần vào chủ thể) ở `shots/casual-farm-render/` để xem bằng mắt. `MM_QUICK=1` chỉ chạy phần đầu (WASD + texture).
- `node test/casual-farm-play.js` chạy trình duyệt thật: nạp không lỗi, mờ rồi rõ, module có `?v=`, phím W đi được, bot mua ô và có khách trả tiền, tải lại giữ tiến trình, menu nâng cấp mua được, ô Next Mart chở sang Store 2 giữ nguyên tiền, thẻ bản đồ thu tiền để không và GO, prestige trọn vòng (popup 100 %, menu, xây lại, màn chúc mừng, nhận 450 tiền + 20 vàng), bản đồ 3D (xe đậu đúng mart, camera bám xe, mart khoá tô đen, đóng thẻ thì cửa hàng hiện lại), giữ khung dọc và bố cục thẻ, menu gọn trong khung ở 390x844 và 1280x720, Store 9 dựng ô từ CSV, có bảng tiếng. Thêm `MM_URL=<địa chỉ Pages>` để kiểm bản trên mạng.

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
- `[BẪY ĐÃ SẬP]` Người chơi bị giữ cách vật cản 1,2 m nên không chạm được mat dâu Store 8 (mat nằm trên luống `plant_Box03`, vật cản `m_Carve`). Unity khoét navmesh theo `agentRadius` = 0,75 của NavMeshBuildSettings (mọi mart), nên `CARVE_RADIUS` trong `sim.js` là 0,75.
- `[BẪY ĐÃ SẬP]` Bot ưu tiên giao hàng trước khi trả tiền mat, nên đang bận tay thì không bao giờ tới mat: Store 3 kẹt 19/35 với 67 nghìn trong túi. Trả tiền mat không cần tay trống nên mat đủ tiền được xét trước.
- `[BẪY ĐÃ SẬP]` Hết kiên nhẫn (3 s chờ + 10 s thanh) thì bản gốc chỉ bỏ món đang lấy rồi sang món kế (`OnPatienceTimerComplete` -> `GoToNext`), không đi thẳng ra quầy với cả đơn còn thiếu. Hàng thả lên kệ chỉ lấy được sau 0,35 s bay (`shelves[i].landing`).
- `[BẪY ĐÃ SẬP]` Store 12 có vách `NavMeshObstacleForWhenStillLocked` dưới mỗi ô Tile. Vách này do `MyNavMeshObstacleEnablerAndDisabler` trên cầu tàu cùng ô điều khiển: cầu tàu bật thì vách tắt. Chỉ xét cha của vách thì vách chặn ngay khi mua ô, nên người chơi kẹt cứng. `store.obstacleOff` lo luật này.
- `[BẪY ĐÃ SẬP]` Khi chưa có kệ nào, khách sinh ra mang đơn rỗng rồi quay về ngay, không được tính vào số khách, nên vòng `while` sinh khách treo cả trang (Store 9–14 khi quầy mở trước kệ). Chưa có hàng thì không sinh khách.
- `[BẪY ĐÃ SẬP]` Mọi rig xuất ra quay mặt về `-z` cục bộ (chỗ cầm đồ, xe đẩy, chỗ ôm hộp đều ở z âm), nên quay theo `atan2(dirX, dirZ)` là đi lùi (moonwalk). `placeAgent` cộng thêm π; test render đo tích vô hướng giữa hướng đi và hướng chỗ cầm đồ.
- `[BẪY ĐÃ SẬP]` Texture tải bản 16 px và bản đầy đủ song song. Khi bản đầy đủ có sẵn trong cache HTTP nó về trước, bản 16 px về sau đè lên và giữ luôn: cỏ thành nâu xám, tiền xám, cà chua hồng loang trắng (6/6 texture mờ khi tải lại). `toon.texture` bỏ bản 16 px nếu bản nét đã về.
- `[BẪY ĐÃ SẬP]` Nhân bản prefab khách (`cloneObject`) chép luôn hàng và hộp mà khách cũ đang cầm, nên khách mới vào đã ôm sẵn hộp dán băng keo. Gỡ những thứ view treo lên (`userData.type`, `PackagingBox`) ra trước khi chép.
- `[BẪY ĐÃ SẬP]` Ô đứng nâng cấp (`UpgradeZone_Player`, `UpgradeActionZone`) chỉ chạy khi `RC_ActionZoneRemoteConfig` bật cho scene: Store, Store_2, Store_3 là 0, chỉ Big_Store_1/2 là 1. Ở mart thường tấm sàn `mat_Gray` tắt sẵn, nên bật ô thì chỉ còn nhãn "CARRY 4→5" lơ lửng giữa sàn. Mart thường nâng sức chứa bằng menu, nút nâng cấp nhấp nháy khi hướng dẫn tới bước đó.
- `[BẪY ĐÃ SẬP]` `BoxController.packingRate` là 0,3 s (prefab PackagingBox), không phải 0,02. Lịch quầy đầy đủ ở `rules/checkout-anim.md`: hộp hiện 0,25 s, mỗi món cách 0,3 s và nhảy 0,5 s, đóng nắp ở nhịp tìm không ra món, nhấc hộp sau 0,75 s, khách đi và trả tiền ở +1,75 s.
- `[BẪY ĐÃ SẬP]` Hiệu ứng hạt của bản gốc là ParticleSystem; exporter cảnh bỏ qua chúng nên bản web từng không có bụi, khói hay pháo giấy nào. Thông số đọc thẳng từ prefab (`D:\minimart-ref\rules\particles.md`), mesh `puff_Small` và texture hiệu ứng xuất bằng `tools/export_fx.py`, vẽ bằng `js/view/fx.js`. Khách không có bụi chân (chỉ người chơi, thú cưng, trộm, xe).
- `[BẪY ĐÃ SẬP]` Camera từng thu nhỏ vùng nhìn khi màn hình ngang (nửa chiều cao 21,7 thay vì 35), nên trên PC mọi thứ to gấp 1,6 lần bản gốc. Clip gameplay 1280x720 cho thấy Unity giữ `orthographicSize` 35 là nửa chiều cao dù màn ngang hay dọc: luống cà chua dài 143 px ở cả hai.
- `[BẪY ĐÃ SẬP]` Nút HUD gốc là sprite trắng `normalButtonLarge` được tô màu lúc chạy (layout ghi màu trắng). Màu lấy từ clip: cài đặt tím `#ad8cff`, nâng cấp xanh lá `#8be773`. Cột nút nằm bên trái theo `ButtonsHolder/VerticalHolder` (Settings, Map, Upgrade), chấm đỏ `_notificationCircle` khi có nâng cấp mua được.
- `[BẪY ĐÃ SẬP]` Đo màu ảnh web so với clip (cỏ, sàn, quầy): đổi `m_AmbientSkyColor` từ sRGB sang linear như Unity làm với project Linear thì quầy khớp (102,239,185 so với 99,234,180), cỏ và sàn tối hơn 5-7%. Bỏ bước đổi thì cỏ khớp nhưng quầy sáng hơn 9%. Giữ cách của Unity; phần lệch còn lại coi như do nén video.
- `[BẪY ĐÃ SẬP]` Có hai menu nâng cấp trong mã gốc, chọn bằng remote config. Ghi chú cũ tả menu Funflare (một nút, mua track thấp trước), nhưng clip gameplay là menu legacy `UpgradeMenuController`: 3 tab Workers / Machines / Animals, mỗi hàng hai nút Stack và Speed mua độc lập, mọi máy, thú, thợ của mart đều có hàng (chưa mở là bóng đen "???"), thợ có nút tạm dừng, chấm đỏ nghĩa là "vừa mở khoá mà chưa xem tab đó" chứ không phải "đủ tiền". Luật ở `D:\minimart-ref\rules\upgrade-menu.md`, hàng và ảnh chân dung từng mart ở `art/ui/upgrade/icons.json` (`tools/export_upgrade_icons.py`). Bản web theo clip.
- `[BẪY ĐÃ SẬP]` Bán kính "người chơi đứng gần quầy" của trộm từng là 8 m đoán mò; thật ra là quả cầu `PlayerDetector` bán kính 20 quanh node quầy, và đồng hồ sinh trộm chỉ đặt lại khi có quầy đủ điều kiện (từ 11 tờ, người chơi ở ngoài cầu). Trộm vì thế hiếm hơn hẳn khi người chơi đứng quầy.
- `[BẪY ĐÃ SẬP]` Popup "WELCOME BACK" (tiền lúc vắng) chép theo `WelcomeBackController`, nhưng lớp này không có ai gọi trong bản gốc; tiền lúc vắng chỉ có qua bản đồ (thu mỗi 3 giờ). Đã bỏ popup.
- `[BẪY ĐÃ SẬP]` Test render đếm sự kiện từ một listener; sự kiện sinh ra trong khung hình thật (giữa hai lần tua) bị đếm muộn ở lần tua sau khi tờ tiền đã bay xong, thành báo "thiếu tiền bay" vài lần trên nghìn. `__ff` xoá hàng sự kiện cũ trước khi tua.
- `[BẪY ĐÃ SẬP]` Prefab menu (`MartPrestigeMenu`...) nằm trong bundle addressable `defaultlocalgroup`, còn MonoScript của chúng ở bundle `*_monoscripts_*.bundle`; thiếu bundle đó thì mọi Image/Text ra rỗng. `mm.py` nạp thêm bundle này. Thêm nữa, `mm.script` từng đọc path id MonoScript là số không dấu, nên script có id âm (như `UnityEngine.UI.Button`) không khớp; giờ đọc có dấu.
- `[BẪY ĐÃ SẬP]` Nút trong menu gốc là sprite trắng; màu thật nằm ở `ColorBlock.m_NormalColor` của component `Button` (Go xanh lá #8ce971, Prestige tím #d56dff, Collect vàng #ffc236, x150% xanh ngọc #5ef0c7, đóng đỏ #ff585d). `export_ui.py` giờ ghi màu này vào trường `button`.
- `[BẪY ĐÃ SẬP]` Class CSS mới trùng class sẵn có của HUD: `b.cash` trong menu Prestige ăn nền xám của bộ đếm tiền, ngôi sao `.next` ăn `position: absolute` của bảng NEXT MART. Đổi sang tên riêng (`vc`, `vg`, `nx`).
- `[BẪY ĐÃ SẬP]` `demandIndex` của khách từng không được lưu, nên tải lại mart là khách quay về đơn kịch bản từ đầu. Bản gốc lưu `currentDemandIndex` theo mart và đặt 100 sau prestige; giờ lưu ở `demand`.
- `[BẪY ĐÃ SẬP]` Chữ trong menu Prestige gốc ghi "needs to be 100% Completed" nhưng nút mở từ 80 % (`0x4f < completionRate`). Giữ nguyên chữ của prefab, luật theo code.
- `[BẪY ĐÃ SẬP]` Mỗi scene có cặp vật cũ/mới (`NewVisualObjectActivator`, `NewVisualMeshRendererActivator`: bàn và ghế văn phòng, thùng rác đỏ/xanh, gà, ATM, quầy...). Web từng vẽ cả hai bộ chồng lên nhau. Cấu hình gốc `RC_GeneralConfig.isNewVisualsActive = 1`, nhưng clip 9RL-61HwGzw chạy bộ cũ (ghế xám, thùng rác đỏ logo trắng), nên giữ bộ cũ (`NEW_VISUALS` ở `js/view/game.js`). Bản đồ dùng cùng quy tắc.
- `[BẪY ĐÃ SẬP]` Ở bản đồ saga, `GoIntoMapMode` đặt xe van `localScale = 1.5` (2,4 là của bản đồ meta và prefab); để nguyên 2,4 thì xe to hơn toà mart.
- `[BẪY ĐÃ SẬP]` Toà Mart02 trên bản đồ có thêm cổng torii, đèn lồng của "Asian Mart" (`SagaMapBigMartVisualOverride.bigMartObjects`), chỉ bật khi Big Mart thay Cafe Mart. Không có Big Mart thì ẩn.
- `[BẪY ĐÃ SẬP]` Game giữ khung dọc 750:1334 của điện thoại (`#stage` rộng `--sw`, giữa màn hình). Mọi chỗ đo theo cửa sổ (CSS `vw`, `window.innerWidth`, toạ độ chuột của joystick) phải đo theo khung, không thì nhãn và joystick lệch trên máy tính.
- `[BẪY ĐÃ SẬP]` Heredoc của Bash nuốt `\r` trong đường dẫn `D:\minimart-ref\rules` (thành ký tự CR). Sửa file Python có dấu `\` bằng công cụ Edit.

## Còn thiếu

- Chưa làm: hộp quảng cáo, gem, coupon, vòng quay, trang phục, mũ, thú cưng, mart theo mùa (Halloween, Giáng Sinh...), Big Mart. Vàng từ prestige chỉ được cộng và hiện ở bộ đếm, chưa có chỗ tiêu.
- Bản đồ 3D: xe van chưa lái được bằng joystick (bản gốc có `NavMeshAgent` trên bản đồ); hướng dẫn lần đầu `SagaMapFirstTutorial` và hộp quảng cáo trên bản đồ không làm. Icon mart Campsite (Store 14) không có trong bản build, dùng icon chung `martIcon`.
- Khách VIP chưa có. Khách đi xe mượn thân xe van của mart (prefab xe chưa bóc), vùng thả hàng là ô vuông 10 m quanh chỗ đỗ (đoán, `car-orders.md`).
- Hệ số tốc độ máy lấy theo bảng `S`; nhân viên cùng `workerSection` khác 0 chưa nâng cấp chung.
- Trộm mượn thân khách vì prefab trộm chưa bóc.
- Booster và mat tiền thêm (`js/sim/boosters.js`, luật ở `D:\minimart-ref\rules\vip-rv-boost.md`): bản gốc bắt xem quảng cáo, bản này bấm là nhận. Booster theo nhịp gốc: cứ 10 s không có lời mời thì hiện một nút ngẫu nhiên trong 20 s; nhận rồi thì có tác dụng 300 s (tiền x2, người chơi +10 tốc độ, nhân viên +10, máy x2, thêm 3 khách). Mat tiền thêm trả giá mat rẻ nhất đang mở, dùng nhịp của nhánh A/B `ABMiscType 2` (nghỉ 120 s, hiện 30 s), vì nhánh mặc định 8 s / 15 s vốn tính có một quảng cáo chen giữa hai lần nhận. Đây là chỗ chọn độ hào phóng, chưa có số gốc cho bản không quảng cáo.
- Số đo bot nhận mọi booster và tiền thêm (`MM_STORE=storeN MM_MINUTES=300 node test/casual-farm-sim.js`, vốn = 10% tổng giá mat, 2026-10-27): mỗi mart xong trong 34–66 phút (Store 1: 34, Store 5: 66, Store 13: 44). Riêng tiền thêm đã gánh khoảng một nửa số mat. Trước khi có booster, Store 1 xong ở phút 151, Store 4 ở phút 693, còn Store 5–14 sau 450 phút mới được 12–30 mat. Khách VIP tắt sẵn trong dữ liệu gốc (`allowVIPOnGame` = 0 ở level1/7/11) nên không làm.
