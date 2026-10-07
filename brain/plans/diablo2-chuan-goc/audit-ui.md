# Ác Quỷ II: soát UI/UX so với Diablo II gốc

Ngày 2026-10-07, mã ở rev `20261006g`. Chỉ đọc mã, không sửa tệp nào trong repo.

**Nhãn:** `[ĐO]` là đo trên game chạy thật (Playwright, ảnh ở `shots-ui/`) hoặc đọc mã có dòng cụ thể. `[NGUỒN]` là lấy từ tài liệu hay tệp gốc, có dẫn. `[ĐOÁN]` là trí nhớ về D2 1.14d hoặc chế độ legacy của D2R, chưa kiểm.

**Nguồn đã đọc:**
- Tệp gốc trên máy: `D:\d2r-ref\fs\data\data\global\excel\inventory.txt`, `belts.txt`, `automap.txt`, `local\lng\strings\levels.json`, `D:\d2r-ref\listing.tsv`.
- OpenDiablo2: bản clone ở `D:\d2r-tools\OpenDiablo2` **không có** `d2game/d2player` và `d2core/d2gui` (chỉ có `d2common` và `d2core/d2map`). Vì thế mình đọc trên GitHub:
  - OD-hud: https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2game/d2player/hud.go
  - OD-ctl: https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2game/d2player/game_controls.go
  - OD-key: https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2game/d2player/key_map.go
  - OD-mini: https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2game/d2player/mini_panel.go
  - OD-btn: https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2core/d2ui/button.go

**Công cụ chụp:**
- Script: `scratchpad/shots-ui.js` và `shots-ui2.js`, viewport 960×540 (canvas 1:1) và cảm ứng 932×430.
- Ghi chú số đo: `shots-ui/notes.txt`.
- Không có lỗi trang (`errors: none`).

---

## A. So từng màn hình

| # | Phần tử | Gốc (nguồn) | Bản làm lại (bằng chứng) | Kết luận |
|---|---|---|---|---|
| A1 | Khung thanh điều khiển | `800ctrlpnl7.dc6`, 6 mảnh | Đúng 6 mảnh, đặt theo `hudpanel.json` (`build_ui.py:144`). Ảnh `04-town-hud` [ĐO] | khớp |
| A2 | Cầu máu và mana | `hlthmana.dc6` cắt theo % từ đáy, kính `overlap.dc6` vẽ **đè lên** [NGUỒN: chú thích `build_ui.py:150`]. Rê chuột lên cầu hiện "Life: x / y" phía trên cầu bằng Font16 [ĐOÁN] | Cắt từ đáy đúng (`ui.js:171` setGlobe). Kính vẽ **dưới** phần cầu đầy (`ui.js:111`). Số "40/40" hiện bên trong cầu (`.orb .lab`). Không có cầu xanh khi trúng độc hay cầu lạnh, dù `globes.poison` và `globes.chill` đã bóc [ĐO: grep] | một phần |
| A3 | Thanh thể lực | Rộng 102×19 tại (273,572). Màu nâu nhạt `0xaf8848`, chuyển đỏ `0xff0000` khi dưới 25% [NGUỒN: OD-hud] | Thanh **xanh lá** gradient, không đổi màu (`index.html` `.stam i`). Ảnh `crop-hud-mid.png` [ĐO] | sai |
| A4 | Thanh XP | 120×4 tại (256,561), màu trắng [NGUỒN: OD-hud] | Gradient vàng, cao 4 px (`ui.js:122`) | một phần |
| A5 | Nút chạy/đi bộ | `runbutton.dc6` tại (255,570), 4 khung [NGUỒN: OD-hud, `build_ui.py:193`] | **Không vẽ**: ô tối trống bên trái thanh thể lực. Chỉ đổi bằng phím R (`game.js:1807`) [ĐO: ảnh và grep] | thiếu |
| A6 | Nút kỹ năng trái/phải | 48×48 tại x=117 và 635. Bấm vào thì mở bảng chọn kỹ năng [NGUỒN: layout] | Vị trí khớp (`ui.js:126`). Đánh thường hiện chữ `⚔` vì không dùng icon chung `skillIcons.GEN` [ĐO: ảnh `18b`] | một phần |
| A7 | Mini panel | **Ẩn mặc định**, mở bằng `menubutton`. Bản 1 người có 7 nút: char 0, inv 2, tree 4, automap 8, message 10, quest 12, menu 14 (party 6 chỉ có khi chơi mạng). Dịch 130 px khi mở một bảng, ẩn khi mở cả hai bên [NGUỒN: OD-mini, OD-btn] | Luôn hiện. Lấy khung `MB[0,1,2,3,5,6]` trong khi `minipanelbtn` có 18 khung xếp từng cặp (lên, xuống). Kết quả: hai nút hình nhân vật, hai nút hình kiếm, một ô đen, rồi nút bản đồ và nút party gán cho Q và Esc (`ui.js:136-138`, `crop-hud-mid.png`). Không có nút nhật ký tin nhắn, không có `menubutton` [ĐO] | sai |
| A8 | Đai | 4 ô tại (423,562), bước 31 px [NGUỒN: belts.txt `default2`]. Đai to mở ra 8/12/16 ô (`popbelt`, phím `~`) [NGUỒN: OD-key ToggleBelts] | Toạ độ khớp (`ui.js:124`). Cố định 4 ô (`game.js:915` beltFree `i<4`, `:1551`). `popbelt` đã bóc nhưng không dùng [ĐO] | một phần |
| A9 | Nút New Stats / New Skill | `level.dc6` tại (206,561) và (563,561) [NGUỒN: OD-hud] | Có, đúng hình, bấm thì mở bảng (`ui.js:142-149`). Thêm dải chữ DOM "+10 chỉ số +2 kỹ năng" mà gốc không có (`.ptsflag`, ảnh `20`) [ĐO] | khớp, có phần thừa |
| A10 | Bảng nhân vật | Bảng trái `invchar6` | Tranh gốc, ô số đặt gần đúng. Thêm dòng "Tốc đánh … khung" và "Vàng". Thiếu Attack Rating và sát thương cho từng tay (`ui.js:316-335`, ảnh `06`) [ĐO] | một phần |
| A11 | Túi đồ | Lưới 10×4 tại (419,315), ô 29 px. Ô trang bị theo inventory.txt hàng `*2`. Tab I/II đổi vũ khí bằng phím W [NGUỒN: inventory.txt, OD-key] | Lưới và ô trang bị khớp toạ độ (`ui.js:357`). Tab I/II chỉ là hình vẽ. W không làm gì, không có ô vũ khí thứ hai (grep "swap" = 0) [ĐO] | một phần |
| A12 | Cầm đồ trên con trỏ | Bấm vào đồ thì đồ dính con trỏ (hình đồ thay con trỏ). Thả vào lưới, ô trang bị, đai hay mặt đất. Chuột phải để uống hoặc dùng, Shift+bấm đưa vào đai [ĐOÁN] | Không có. Bấm chỉ **chọn** đồ, rồi một hộp DOM hiện nút "Trang bị / Dùng / Vào đai / Vứt" (`ui.js:383-398`, ảnh `22`) [ĐO] | thiếu |
| A13 | Chú thích đồ | Chữ căn giữa trên nền đen, Font16, ngay trên đồ. Dòng thuộc tính màu xanh, yêu cầu chưa đạt màu đỏ, socket và ethereal màu xám [ĐOÁN] | Hộp DOM lệch phải-dưới con trỏ. Tên có màu theo phẩm chất, mọi dòng khác màu trắng, căn trái (`ui.js:228-232`, ảnh `21`). Không có identify, socket, ethereal (`itemStats` không có trường đó, grep) [ĐO] | một phần |
| A14 | Bảng màu phẩm chất | xanh 105,105,255; vàng 255,255,100; vàng kim 199,179,119; lục 0,255,0; cam 255,168,0 [ĐOÁN, theo mã màu ÿc của D2] | `QCOL` (`ui.js:31`) gần đúng. Rare `#ffe45a` hơi cam, magic `#6e7bff` gần đúng | gần khớp |
| A15 | Cây kỹ năng | Bảng **phải**, 3 tab. Một lần bấm là cộng điểm. Kỹ năng chưa học dùng khung icon tối [NGUỒN: OD-ctl ghi tree là bảng phải] | Tranh gốc và tab đúng, nhưng bảng nằm **bên trái** (`ui.js:79`, ghi chú `skill panel side "left"`). Bấm hai lần mới cộng, có thêm bong bóng "+" và viền xanh. Mở cây thì bảng nhân vật đóng (`ui.js:259`). Ảnh `08`, `26` [ĐO] | sai vị trí |
| A16 | Chú thích kỹ năng | Hộp to: mô tả, cấp hiện tại, cấp sau [ĐOÁN] | Hộp nhỏ 4 dòng, kèm một hộp hướng dẫn DOM ở giữa màn hình (ảnh `26`) | một phần |
| A17 | Bảng chọn kỹ năng | Bấm nút kỹ năng thì hiện các hàng icon ngay trên nút, chia theo tab, có nhãn phím F. Phím S mở bảng của tay phải [NGUỒN: OD-key ToggleRightSkillSelector=S] | Hộp DOM có icon kèm tên (ảnh `12`). Phím S không làm gì (ghi chú `key KeyS: []`) [ĐO] | một phần |
| A18 | Kho đồ | D2R legacy: 10×10 với tab, inventory.txt "Big Bank Page 1". Bản 1.14d: 6×8 [NGUỒN/ĐOÁN] | Tranh 10×10 của D2R, chỉ 6×8 dùng được, phần còn lại phủ đen. Lấy đồ ra phải bấm nút (`ui.js:409-432`) [ĐO: mã] | một phần |
| A19 | Horadric Cube | Lưới 3×4 tại (118,139) [NGUỒN: inventory.txt "Transmogrify Box"], tranh `supertransmogrifier.dc6` | Không có (grep "cube" = 0) [ĐO] | thiếu |
| A20 | Hộp thoại NPC | Menu nhỏ dựng từ `boxpieces` hoặc `dialogbackground`: Talk/Trade/Hire/Gamble/Repair/Cancel, chữ trắng Font16 căn giữa, kèm tiếng chào [ĐOÁN] | Hộp DOM rộng có nút (ảnh `15`). `boxpieces` đã bóc nhưng không dùng. Không có Repair, Identify (Cain), Gamble riêng [ĐO] | một phần |
| A21 | Mua bán | Tab Armor/Weapons/Misc (`buyselltabs`). Nút Buy/Sell/Repair là các khung 2/4/6 của `buysellbtn`. Con trỏ `buysell`. Giá hiện trong chú thích [NGUỒN: OD-btn] | Tranh `buysell` có, nhưng ô nút trống, không có tab. Giá dán đè lên đồ. Bán bằng nút DOM trong túi (ảnh `16`) [ĐO] | một phần |
| A22 | Thuê lính | Bảng thuê kèm chỉ số lính. Chân dung lính ở góc trên trái, có thanh máu [ĐOÁN] | Nút DOM trong hộp thoại (`game.js:1127`). Không có chân dung hay thanh máu lính (grep `portrait` = 0) [ĐO] | thiếu |
| A23 | Bảng waypoint | 5 tab act (`waygatetabs`). Mọi waypoint của act đều liệt kê, cái chưa đi thì xám, có icon `waygateicons` | Một tab vẽ tĩnh, tiêu đề luôn ghi "Act I" (`ui.js:438`). Chỉ liệt kê chỗ đã đi, không có icon (ảnh `13`) [ĐO] | sai |
| A24 | Nhật ký nhiệm vụ | 6 icon nhiệm vụ mỗi act (`a1q1…`), tab act, chữ mô tả | Viết cứng Den of Evil, kèm dòng "Sisters' Burial Grounds … (sau MVP)" dù game đã có 27 nhiệm vụ (`ui.js:528-541`, ảnh `09`) [ĐO] | sai |
| A25 | Automap | Tab bật lớp phủ. Tường vẽ bằng nét từ `maximap.dc6` theo `automap.txt`. Không vẽ quái. Tên khu ở góc trên phải [NGUỒN: automap.txt có trên máy; ĐOÁN phần hiển thị] | Vẽ điểm ảnh theo ô đã thấy (bán kính 18 subtile), quái là chấm đỏ, tên khu ở góc trên trái bằng serif (`ui.js:584-615`, ảnh `10`). Không có minimap góc, không có phím V/Home [ĐO] | sai |
| A26 | Menu Esc | Phủ tối cả màn hình, chữ Font42: OPTIONS / SAVE AND EXIT GAME / RETURN TO GAME, hai bên có ngôi sao quay `pentspin` [ĐOÁN] | Hộp DOM "Tạm dừng" với 4 nút (ảnh `11`). Esc đóng bảng trước rồi mới mở menu, giống gốc (`ui.js:571`) [ĐO] | một phần |
| A27 | Bố cục bảng | Bảng trái: char, quest, party, waypoint, stash, trade. Bảng phải: inv, tree. Mở một bên thì khung nhìn dịch để hero ở giữa phần còn trống. Mở hai bên thì không dịch [NGUỒN: OD-ctl `ViewportToLeft/Right`] | Hero luôn ở (480,270) dù mở túi hay mở bảng nhân vật (ghi chú `hero screen pos`) [ĐO] | thiếu |
| A28 | Con trỏ | Bàn tay `ohand.dc6`. Khi bấm là `lpress`, khi cầm đồ là hình đồ [ĐOÁN] | Mũi tên của hệ điều hành (`cursor: default`) [ĐO]. Atlas `cursor` đã bóc nhưng không dùng (grep) | thiếu |
| A29 | Rê chuột lên quái | Khung trên giữa: tên (champion xanh, unique vàng kim), thanh máu đỏ, dòng loại quái và mod. Sprite sáng lên [ĐOÁN] | Tên kèm thanh đỏ rộng 300 px ở trên giữa. Mod hiện bằng chữ "(Nhà vô địch)". Có thêm vòng elip đỏ dưới chân, quái champion phát sáng xanh (`game.js:1678`, ảnh `18`, `18b`) [ĐO] | một phần |
| A30 | Rê lên NPC hoặc vật | Tên trắng Font16 trên đầu, sprite sáng lên [ĐOÁN] | Tên trắng Georgia 13 px, sprite không sáng (`game.js:1696`, ảnh `14`) [ĐO] | một phần |
| A31 | Nhãn đồ dưới đất | Giữ Alt hiện mọi nhãn, các nhãn **không bao giờ chồng nhau**. Nhãn đang trỏ đổi nền | Alt có tác dụng, nhãn tự hiện 4 giây đầu. Nhãn **chồng lên nhau** ("Rejuve Ring n Potion", ảnh `20`). Thuật toán chỉ đẩy một lượt (`game.js:1752`) [ĐO] | sai |
| A32 | Vàng | D2 1.14 phải bấm mới nhặt. Nút vàng trong túi để thả vàng | Tự nhặt trong bán kính 2,6 (`game.js:1628`). Không thả vàng được [ĐO] | một phần |
| A33 | Giữ chuột | Giữ thì lặp hành động mỗi khoảng 0,25 giây, **nhả ra thì dừng**. Shift giữ đứng yên [NGUỒN: OD-ctl `mouseBtnActionsThreshold`] | Giữ chuột trái thì đi theo con trỏ, đúng. Nhưng **bấm chuột phải một lần rồi nhả ra vẫn niệm mãi**: mana 39 → 27 trong 2,5 giây, goal vẫn `cast`. Shift+trái bấm một lần cũng đánh mãi (goal `attack` sau 2 giây) [ĐO]. Bấm một lần vào quái thì đánh tới khi quái chết (`game.js:1202`) [ĐO: mã] | sai |
| A34 | Phím tắt | A/C, B/I, T, S, Q, H, M, O, W, Tab, Alt, Z, Space, Ctrl, ~, 1-4, F1-F8, lăn chuột [NGUỒN: OD-key] | Có I C T Q Tab Esc R 1-4 F1-F8 Alt và lăn chuột. Thiếu A B S H M O W Z Space V Home, phím giữ Ctrl (ghi chú `key …: []`). Lăn chuột xoay qua mọi kỹ năng đã học, gốc chỉ xoay kỹ năng đã gán phím F (`game.js:1790`) [ĐO/ĐOÁN] | một phần |
| A35 | Chữ "Entering X" | Chữ Font30 ở (W/2, H/4) [NGUỒN: OD-hud `zoneChangeText`], chuỗi "Entering The Blood Moor" [NGUỒN: levels.json `EnteringThe…`] | Không có. Chỉ có "Chào mừng đến…" lúc tạo nhân vật (`game.js:1583`, ảnh `17`) [ĐO] | thiếu |
| A36 | Font | Atlas DC6 ở `local/font/latin/{font16,font30,font42,fontexocet10,fontformal12}.dc6` + `.tbl` | Cinzel (Google Fonts) cho tiêu đề, Palatino cho DOM, Georgia cho canvas (`index.html:10-11`, ghi chú `fonts`) [ĐO] | sai |
| A37 | Nhật ký tin nhắn | Tin hệ thống ở góc trái dưới. Phần lớn lỗi là **giọng nhân vật** nói ("I can't…") chứ không phải chữ [ĐOÁN] | Toast ở trên giữa, dòng nào cũng hiện chữ (`ui.js:247`) | một phần |
| A38 | Màn tải | `loadingscreen_eng.dc6`, có hoạt ảnh [NGUỒN: listing] | Chữ trên nền đen (ảnh `27`) | thiếu |
| A39 | Màn tiêu đề | `d2logofireleft/right` có hoạt ảnh lửa, `titlescreen.dc6` | Logo chữ Cinzel (ảnh `01`) | thiếu |
| A40 | Chọn lớp | Cảnh lửa trại: 7 nhân vật động (`frontend/<class>/*nu1-3, fw, bw`), nền `charactercreate.dc6`, `fire.dc6` [NGUỒN: listing] | Thẻ chữ, không có hình (ảnh `02`) | thiếu |
| A41 | Chọn nhân vật đã lưu | `charselectbckg` cùng các ô nhân vật | Nút "Tiếp tục · độ khó" | thiếu |
| A42 | Màn chết | "You have died… Press ESC" phủ lên khung, hero nằm chết [ĐOÁN] | Màn DOM đỏ với nút "Hồi sinh" (ảnh `23`) | một phần |
| A43 | Màn trợ giúp (H) | `800helpborder.dc6` phủ lên kèm chú thích | Không có | thiếu |
| A44 | Cảm ứng 932×430 | Gốc không có cảm ứng | Cần analog, nút tròn, nút chữ ở góc phải. Đai bị ẩn (ảnh `24`) | ngoài phạm vi |

---

## B. Danh sách lỗ hổng, xếp theo mức người chơi dễ thấy

1. **Bấm một lần rồi nhả, nhân vật vẫn niệm hoặc đánh mãi.** Cỡ **S**.
   - Bằng chứng [ĐO]: chuột phải bấm rồi nhả, mana 39 → 27 trong 2,5 giây, goal `cast` còn nguyên. Shift+trái cũng vậy.
   - Cách sửa: trong `game.js` updateHero, quanh dòng 1202, chỉ giữ `h.goal` khi `g.hold` **và** nút tương ứng còn được nhấn (`I.mouse.right` hoặc `I.mouse.left`). Ghi nút đó vào goal lúc `command()`. Nhả nút thì xong lượt đang làm rồi dừng.
   - Bấm một lần vào quái thì chỉ đánh một đòn, giữ chuột mới lặp, theo ngưỡng 0,25 giây của OD-ctl.
   - Thêm check vào suite: nhả chuột phải 1 giây sau thì mana không giảm.

2. **Không cầm đồ được trên con trỏ.** Đồ được quản lý bằng nút DOM "Trang bị / Vứt" và một hộp hướng dẫn nổi giữa màn hình. Cỡ **L**.
   - Cách sửa, phần `ui.js`:
     - Thêm `UI.hand` (món đồ đang cầm) và một phần tử con trỏ `.handitem` đi theo `pointermove` trên `#stage`, vẽ bằng `iconBox`.
     - Bấm vào ô lưới: đổi toạ độ con trỏ ra ô theo inventory.txt hàng `*2` (lưới ở (419,315), ô 29 px; kho dùng "Big Bank Page 1"; cube dùng "Transmogrify Box Page 1"). Rồi đặt đồ, hoặc đổi chỗ khi đè đúng một món.
     - Bấm vào ô trang bị (`slotRect`): trang bị và đổi chỗ.
     - Bấm lên canvas khi đang cầm đồ: thả xuống đất (`G().dropItem`).
     - Chuột phải: uống hoặc dùng. Shift+trái: đưa vào đai.
     - Bỏ hẳn `detailBox` trong `renderInv`, `renderStash`, `renderSkill`.
   - Phần `game.js`: cần `placeInv(it, x, y)` trả về món bị đổi ra.
   - Cảm ứng: chạm một lần để cầm, chạm lần nữa để thả.

3. **Mini panel sai hình và sai cách hoạt động.** Cỡ **S**.
   - Bằng chứng [ĐO]: nút I mang khung "nhân vật đang nhấn", nút Q mang icon bản đồ, có một ô đen trống.
   - Cách sửa, trong `ui.js` buildHud:
     - Dòng 138: thay `MB[b[3]]` bằng khung `2*k`. Thứ tự: char 0, inv 2, tree 4, automap 8, message 10, quest 12, menu 14 (OD-btn). Khung `+1` dùng cho lúc đang nhấn.
     - Thêm nút `menubutton` (`buttons.menu`, (312,560) theo toạ độ 640, cộng 80) để mở và ẩn panel. Mặc định ẩn.
     - Dịch ±130 px khi mở một bên, ẩn khi mở cả hai bên (OD-mini).

4. **Bảng nằm sai bên, khung nhìn không dịch.** Cỡ **M**.
   - Cây kỹ năng phải là bảng phải, cùng nhóm với túi đồ. Nhóm trái gồm char, quest, stash, shop, waypoint. Hiện cây kỹ năng nằm trái và đóng cả bảng nhân vật.
   - Trong `ui.js` UI.toggle (dòng 259):
     - Chia hai nhóm `LEFT = [char, quest, stash, shop, wp]` và `RIGHT = [inv, skill]`. Mở một bảng thì chỉ đóng bảng cùng bên.
     - Bỏ class `left` của skill (dòng 79).
   - Trong `engine.js` toScreen/toWorld: thêm `E.viewOffX`. Mở bảng trái thì +152 (nửa bề rộng bảng 304 px), mở bảng phải thì -152, mở cả hai thì 0, giống `ViewportToRight/Left` của OD-ctl.
   - `D2DBG.client` đọc chung toScreen nên test không vỡ.

5. **Nhãn đồ dưới đất chồng lên nhau.** Cỡ **S**.
   - Bằng chứng [ĐO]: ảnh `20`.
   - Cách sửa trong `game.js` render, nhãn ở dòng 1745-1756:
     - Xếp nhãn theo `sy` giảm dần.
     - Với mỗi nhãn, lặp đẩy lên 15 px tới khi không giao với **mọi** hình chữ nhật đã đặt (hiện chỉ một lượt nên vẫn chồng).
     - Nhãn đang trỏ vẽ sau cùng.
   - Thêm check: không cặp nhãn nào giao nhau khi có 10 món ở cùng một chỗ.

6. **Con trỏ vẫn là mũi tên của hệ điều hành.** Cỡ **S**.
   - Cách sửa: `#stage { cursor: none }`. Vẽ con trỏ bằng một `div` `.cur` theo `cursor.hand` (`ohand.dc6` đã có trong `ui.js`, neo theo hot spot).
   - Lúc nhấn đổi sang `lpress`. Lúc cầm đồ đổi sang hình món đồ. Ở cửa hàng đổi sang `buysell`.
   - Vẽ trên DOM để không phải vẽ lại canvas khi chỉ rê chuột.

7. **Nhật ký nhiệm vụ và waypoint còn ở mức MVP Act I.** Cỡ **M**.
   - Quest (`ui.js` renderQuest): đọc `D2DATA.quests` theo act.
     - Tab act dùng `buttons.quest_tabs`.
     - Mỗi act 6 ô `quest_aXqY` trên `quest_sockets`, khung trạng thái theo DC6: chưa nhận, đang làm, xong.
     - Bấm vào ô thì hiện mô tả.
     - Bỏ dòng "(sau MVP)".
   - Waypoint (`openWaypoints`):
     - 5 tab `waygate_tabs` (khung theo act).
     - Liệt kê **mọi** waypoint của act đang xem. Cái chưa kích hoạt thì xám và không bấm được.
     - Icon `waygate_icons` ở cột trái.
     - Tiêu đề lấy theo act.

8. **HUD thiếu nút chạy/đi bộ, màu thanh thể lực sai, đánh thường không có icon.** Cỡ **S**.
   - Nút chạy: vẽ `buttons.run` tại (255,570), khung 0/2 là đi bộ/chạy, 1/3 là đang nhấn. Bấm thì đổi `S.runOn`.
   - Thanh thể lực: màu `rgba(175,136,72,.78)`, dưới 25% thì `rgba(255,0,0,.78)` (OD-hud). Thanh XP màu trắng.
   - Đánh thường: dùng `skillIcons.GEN[0]` [ĐOÁN số khung, cần xem atlas] trong `skIconHtml` khi `id` rỗng hoặc là `attack`.
   - Cầu: vẽ `hpFrame`/`mpFrame` **sau** phần cầu đầy. Đổi `globes.poison` khi trúng độc.

9. **Không có chữ "Entering X".** Cỡ **S**.
   - Trong `game.js` enterArea, sau khi vào xong: hiện chuỗi `EnteringThe…` của levels.json qua `build_data.py` (hoặc tên khu) tại (480,135), cỡ Font30, mờ dần sau khoảng 3 giây [ĐOÁN thời lượng].

10. **Font không phải font gốc.** Cỡ **M**.
    - Viết `build_font.py` (hoặc thêm vào `build_ui.py`): đọc `local/font/latin/font16.dc6` + `.tbl`. Định dạng `.tbl` có parser ở `OpenDiablo2/d2common/d2fileformats/d2font` trên máy. Đóng atlas glyph cho font16, font30, font42, fontexocet10, fontformal12.
    - Trong `engine.js`, thêm `E.text(str, font, x, y, color)` để vẽ canvas, và một hàm dựng `span` nền ảnh cho DOM.
    - **Vướng:** DC6 latin không có dấu tiếng Việt [ĐOÁN, cần đọc `.tbl`]. Cần chủ dự án chọn:
      - (a) Font gốc chỉ cho chuỗi tiếng Anh (tên đồ, khu, quái, NPC đều đang là tiếng Anh), chữ tiếng Việt giữ web font.
      - (b) Đổi chữ UI sang chuỗi gốc tiếng Anh từ `local/lng/strings`.

11. **Tooltip đồ chưa giống gốc.** Cỡ **M**.
    - `ui.js` itemTipHtml: căn giữa, nền đen, đặt **trên** món đồ.
    - Dòng `Required …` tô đỏ khi chưa đủ (so với `S.char`).
    - Dòng affix tô xanh: `itemStats` cần trả `{text, kind: 'base'|'req'|'mod'}` (`rules.js`).
    - Bỏ dòng không có trong gốc ("Cold duration 50 frames").
    - Identify, socket, ethereal là việc lớn của luật, ngoài phạm vi UI.

12. **Esc menu, hộp thoại NPC, cửa hàng còn là nút DOM chung chung.** Cỡ **M**.
    - Esc: phủ tối toàn màn hình, 3 mục chữ to, `cursor.pentspin` quay hai bên.
    - NPC: hộp dựng từ `panels.dialog` (`boxpieces`, 9 mảnh), chữ trắng căn giữa, có mục Cancel.
    - Cửa hàng: tab `tabs_trade`, nút `buysell` ở khung 2/4/6 (`layout.npc_trade.buy/sell/repair` đã có). Giá đưa vào tooltip, bỏ nhãn giá dán lên đồ.

13. **Automap.** Cỡ **L**.
    - `automap.txt` (có trên máy) ánh xạ (LevelName, TileName, Style, Seq) ra `Cel` của `maximap.dc6` (Act 1/3/5), `act2map`, `act4map`, `extnmap`.
    - Cần lever bóc các DC6 này và bảng tra. Trong `drlg.js`, ghi `style/seq` của từng tile vào lưới đã thấy. `UI.drawMap` vẽ từng cel ở tỉ lệ 1/2.
    - Bỏ chấm quái (D2 không vẽ quái trên automap [ĐOÁN]). Tên khu đưa sang góc phải.
    - Làm nhanh hơn: giữ kiểu điểm ảnh nhưng chỉ vẽ **mép tường** và bỏ chấm quái. Cỡ S.

14. **Thiếu chân dung lính, đai mở rộng, đổi vũ khí, cube, thả vàng, phím S/H/W/Space/A/B.** Cỡ **M** mỗi mục.
    - Phím: thêm vào `bindInput` (`game.js:1802`): S gọi `UI.skillPopup('right')`, Space gọi `UI.closeAll`, A là bí danh của C, B là bí danh của I.
    - Đai: `popbelt` hiện các hàng theo `belts.txt numboxes` khi rê lên đai hoặc bấm `~`. `c.belt` lên 16 ô.

15. **Màn đầu game.** Cỡ **L**.
    - Tiêu đề: `d2logofireleft/right` là DC6 có hoạt ảnh.
    - Chọn lớp: cảnh `charactercreate.dc6` cùng 7 sprite `frontend/<class>/<cls>nu1.dc6` ở đứng yên, `fw/bw` khi được chọn.
    - Màn tải: `loadingscreen_eng.dc6`.
    - Thêm nhóm asset `m/front` nạp khi mở game.

16. **Thứ thừa so với gốc** (gỡ hoặc giấu sau tuỳ chọn, cỡ S):
    - Vòng elip đỏ dưới quái đang trỏ. Gốc làm sprite sáng lên, có thể vẽ lại sprite với `globalCompositeOperation='lighter'` ở alpha 0,25.
    - Dải `.ptsflag`.
    - Toast "Lên cấp" và chữ nổi "LÊN CẤP!".
    - Hộp hướng dẫn `.detail`.

---

## C. Asset UI: có rồi và cần bóc

### C1. Đã có trong `assets/m/ui.js`

Đo bằng cách nạp tệp qua node và grep mã. "Có dùng" nghĩa là `js/*.js` có gọi tới.

| Khoá | DC6 gốc (`data/data/global/…`) | Có dùng? |
|---|---|---|
| `panels.ctrlpanel` | `ui/panel/800ctrlpnl7.dc6` | có |
| `panels.globes` hp, mp, hpFrame, mpFrame | `ui/panel/hlthmana.dc6`, `overlap.dc6` | có (kính vẽ sai lớp) |
| `globes.poison`, `globes.chill` | `hlthmana.dc6` khung 2, 3 | **không** |
| `panels.popbelt` | `ui/panel/ctrlpnl_popbelt.dc6` | **không** |
| `panels.minipanel.single` | `ui/panel/minipanel_s.dc6` | có |
| `minipanel.multi`, `multi9` | `minipanel.dc6`, `minipanel_9.dc6` | **không** (không cần) |
| `panels.character` | `ui/panel/invchar6.dc6`, `levelsocket`, `skillpoints` | có |
| `panels.inventory` | `invchar6.dc6` khung 4+, `inv_*.dc6` | có |
| `panels.stash` | `ui/panel/bank.dc6` | **không** |
| `panels.stash_big` | `ui/panel/expandedstash.dc6` | có |
| `panels.npc_trade` | `ui/panel/buysell.dc6` | có |
| `panels.waypoint`, `panels.quest` | `ui/menu/waygatebackground.dc6`, `questbackground.dc6` | có |
| `panels.skilltree_*` | `ui/spells/skltree_?_back.dc6` | có |
| `panels.dialog` | `ui/menu/boxpieces.dc6` | **không** |
| `buttons.statup`, `skillup` | `ui/panel/level.dc6` | có |
| `buttons.minipanel` | `ui/panel/minipanelbtn.dc6` (18 khung) | có, **sai khung** |
| `buttons.run`, `buttons.menu` | `runbutton.dc6`, `menubutton.dc6` | **không** |
| `buttons.buysell`, `tabs_trade`, `refresh` | `buysellbtn.dc6`, `buyselltabs.dc6`, `refreshbtn.dc6` | **không** (`buysellbtn` khung 10 là nút đóng) |
| `buttons.gold`, `goldsmall`, `goldbar` | `goldcoinbtn`, `goldbtn`, `inv_goldbtn` | **không** |
| `buttons.gemsocket`, `scrollbar`, `clickbox` | cùng tên | **không** |
| `buttons.waygate_tabs` | `ui/menu/waygatetabs.dc6` | 1 khung |
| `buttons.waygate_icons` | `ui/menu/waygateicons.dc6` | **không** |
| `buttons.quest_*` (tabs, icons, sockets, last, a1q1…a5q6) | `ui/menu/questtabs.dc6` … `a5q6.dc6` | **không** |
| `cursor` (hand, grasp, buysell, spells, pentspin, gaunt, lpress, ppress, focus16) | `ui/cursor/*.dc6` | **không** |
| `skillIcons` (8 lớp và GEN) | `ui/spells/*skillicon.dc6` | có, trừ GEN |
| `icons` (470 icon đồ) | `items/inv*.dc6` | có |
| `layout` | toạ độ từ `layouts/*.json` + inventory.txt | có một phần |

### C2. Cần thêm vào lever `build_ui.py`

Tên tệp đã đối chiếu với `listing.tsv` [ĐO].

| Dùng cho | DC6 gốc | Ghi chú |
|---|---|---|
| Font | `local/font/latin/font16.dc6`, `font30`, `font42`, `fontexocet10`, `fontformal12`, `fontingamechat` + `.tbl` | parser `.tbl` có ở `OpenDiablo2/d2common/d2fileformats/d2font` |
| Automap | `global/ui/automap/maximap.dc6`, `act2map`, `act4map`, `extnmap` (bản `…s` là cỡ nhỏ), `units.dc6`; `global/ui/minimap/mapicons.dc6`; bảng `global/excel/automap.txt` | |
| Cube | `global/ui/panel/supertransmogrifier.dc6` | lưới theo inventory.txt "Transmogrify Box Page 1" |
| Kho 6×8 | `global/ui/panel/tradestash.dc6` | [ĐOÁN] là tranh kho 6×8 của LoD; giải mã ra để kiểm |
| Đổi vũ khí, ô slot | `global/ui/panel/invchar6tab.dc6` | tab I/II, [ĐOÁN] |
| Menu Esc, trợ giúp | `global/ui/menu/800helpborder.dc6`, `helpwhitebullet`, `helpyellowbullet`; `global/ui/cursor/pentspn2.dc6` | |
| Hộp thoại, chữ NPC | `global/ui/menu/dialogbackground.dc6`, `textslid.dc6`, `okcancelbtn.dc6` | |
| Thả vàng | `global/ui/menu/goldbtn.dc6` (hộp nhập số vàng), `ui/panel/goldcoinbtn` (đã có) | |
| Thuê lính | `global/ui/hireables/*` (106 tệp), `global/ui/panel/hilitink.dc6`? | [ĐOÁN] chỗ chứa chân dung |
| Quái đang trỏ | `global/ui/panel/healthbubble01..05.dc6`, `hostilepic.dc6` | [ĐOÁN] công dụng |
| Màn đầu | `global/ui/frontend/d2logofireleft.dc6`, `d2logofireright`, `titlescreen`, `trademarkscreenexp`, `charactercreate`, `fire`, `frontend/<class>/<cls>{nu1,nu2,nu3,fw,bw}.dc6`, `global/ui/charselect/charselectbckg.dc6`, `charselectbox`, `okaybutton`, `exitbutton`; `global/ui/loading/loadingscreen_eng.dc6` | có thể tách thành nhóm `m/front` |
| Bảng tab D2 (bigmenu) | `global/ui/bigmenu/*tab.dc6`, `*back.dc6` | không cần cho bản 1 người |

### C3. Toạ độ gốc dùng được ngay

Đều lấy theo màn 800×600.

- **Túi đồ** (inventory.txt hàng `Amazon2…Warlock2`) [ĐO]:
  - Bảng ở (400..720, 60..501), lưới ở (419..706, 315..428), ô 29.
  - Tay phải (420,107) 55×112. Áo (533,137) 56×82. Tay trái (651,107) 55×112.
  - Các ô khác ở các cột tiếp theo của cùng hàng.
- **Kho:**
  - "Bank Page 1": 6×4 tại (74,273).
  - "Big Bank Page 1": 10×10 tại (74,82) theo bảng D2R.
  - Cube: 3×4 tại (118,139).
  - Trade Page 1/2: 10×4 tại (20,41) và (20,255).
  - NPC ("Monster"): 10×10 tại (16,63).
- **Đai** (belts.txt `default2`/`belt2`): ô 1 ở (423..452, 562..591), bước 31. Số ô: sash 8, belt 12, girdle 16.
- **HUD** (OD-hud): thể lực (273,572) 102×19, XP (256,561) 120×4, nút chạy (255,570), nút stat (206,561), nút skill (563,561), chữ đổi khu ở (W/2, H/4).
