# Còn lại — bàn giao 2026-09-09

Bản vừa push: **ném đồ · đường chỉ lối trên sàn · loot vẽ lại · cửa hàng ngoài menu**.
Dấu build lên `?v=20260909e` — ba chỗ phải bằng nhau: `repo2d/index.html`, `repo-squad/index.html`,
và hằng `BUILD` trong `game.js`.

---

## 1. VIỆC CHƯA XONG — làm trước

**Chơi thử trên Pages.** Bốn thứ trong bản này đều là thứ CHỈ ĐỌC ĐƯỢC BẰNG MẮT, và bảng test
xanh không thay được chỗ này.

- poke5121999-art.github.io/survivor-web-hub/games/repo2d/ (Ca Trực Đêm)
- poke5121999-art.github.io/survivor-web-hub/games/repo-squad/ (Biệt Đội)
- Pages xây xong khoảng 70 giây sau khi push. Vẫn thấy bản cũ thì kiểm `?v=` trên thẻ script.

| Nhìn cái gì | Làm sao thấy | Câu hỏi |
|---|---|---|
| Mũi chỉ lối trên sàn | Vào ca, nhìn xuống chân | Hàng mũi nhọn có ĐỌC RA LÀ ĐƯỜNG ĐI không, hay nó chỉ là rác trên sàn? Dày quá hay thưa quá? |
| Vòng highlight quanh loot | Đứng cạnh một món to | Cái vòng còn cắt ngang người món đồ nữa không? Nằm dưới chân đọc có rõ hơn không? |
| Vết nứt | Đâm một cái bình vào tường hai lần | Đã "tinh tế" chưa, hay nay mờ quá đến mức không thấy đồ đang hỏng? |
| Ném | Ôm một món, bấm **Q** (hoặc nút Ném) vào mặt con quái | Cú ném có ĐÃ không? Số sát thương có xứng với món vừa mất? |
| Cửa hàng | Màn tiêu đề → **Cửa hàng** | Năm món có nhìn ra ngay là gì không? Giá có hợp lý không? |

---

## 2. BỐN THỨ VỪA LÀM

### 2.1. Mũi chỉ lối xuống sàn
`drawFloorRoute()` trong `game.js`. Cùng một `visibleRoute()` với bản đồ nhỏ — tức vẫn bị cắt ở
ô đầu tiên chưa khám phá, không vẽ hộ ai lối vào phòng chưa mở. Chỉnh ở bốn hằng ngay trên hàm:
`ROUTE_STEP` (thưa/dày), `ROUTE_SKIP` (chừa chân), `ROUTE_FAR` (nhìn xa bao nhiêu),
`ROUTE_FLOW` (trôi nhanh chậm).

### 2.2. Loot vẽ lại
- **Vòng highlight nằm xuống sàn** (`glowDisc`) thay vì vành tròn quanh người món đồ.
  Lý do và số đo ở chú thích `lootArt()`: sprite vẽ ĐỨNG THẲNG trong thế giới nhìn chếch, nên
  mọi vòng tròn quanh nó đều hoặc cắt ngang bụng, hoặc lơ lửng ngang đầu.
- **Vòng màu vật liệu** cũng xuống sàn thành **chân đế** (`lootPlinth`), và vẽ TRƯỚC món đồ nên
  sprite che mất nửa sau — nó đọc ra là cái bệ món đồ đang đứng trên.
- **Vết nứt** (`drawCracks`): mảnh hơn, mờ hơn, gãy hai đoạn, thêm nét sáng ở mép, và vẽ quanh
  TÂM NHÌN THẤY chứ không quanh tâm va chạm (trước đây ba vết nứt của một cái tủ nằm dưới chân nó).
- **Hàng trong trạm dịch vụ** giờ vẽ bằng `gearIcon()` — trước bản này khẩu hoa cải 26.000 và
  cuộn băng dính 4.500 là hai hình tròn giống hệt nhau.

### 2.3. Ném đồ
Bảng số, nguồn của bản gốc và lý lẽ: **RESEARCH.md mục 7**. Tóm tắt: sát thương = động lượng,
và cú va ăn ngược vào chính món đồ (ném bình gốm vào quái thì gần như chắc chắn mất phần lớn
tiền của nó; món gốm nhỏ vỡ hẳn; và ngay cả cục kim loại — thứ không vỡ bao giờ — cũng sứt 8%
mỗi cú, nhờ một cái SÀN ở `throwLand()`). Vào bằng `handUse()` khi tay không cầm đồ nghề — ô đồ
vẫn bắn được như cũ trong lúc vác, không lấy đi thứ gì.

Cái sàn ấy vá một lỗ hổng **đo được trên bản 20260909a đã lên Pages**: món to bằng kim loại ném
rất chậm nên cú va rơi dưới ngưỡng 260 của nó — ăn 200 sát thương, mất ĐÚNG 0 đồng, nhặt lên ném
lại vô hạn. `nem-shop-suite` có một phép riêng giữ chỗ này.

### 2.4. Cửa hàng ngoài menu + két sắt
`localStorage['repo2d.kho.v1']`. Tiền vào két là **12% số đã giao lên bệ** mỗi khi hết ván. Bán
đúng năm món bắn/ném được, mang tối đa MỘT món vào ca, **mang vào là mất**. Két lần đầu có sẵn
$3.200 = đúng một khẩu súng lục, để cửa hàng không mở ra là năm ô xám ngoét.

Nút "Làm lại từ màn 1" ở hai bảng kết ca đã đổi thành **"Về menu"** (`veMenu()`): nút cũ đi vòng
qua cửa hàng đúng lúc người chơi vừa được trả lương.

**Không có ở bản Biệt Đội** — `khoOn()` đọc `HOOKS.menuMode`, cờ mà bản ấy vốn đã dựng.

---

## 3. TEST

`node test/repo-suite.js` → **293–295 đạt / 15–13 hỏng, đổi theo từng lượt chạy.** Bản trước
đó: 296/12, cũng không cố định.

**Ba ca chênh lệch là CHẬP CHỜN, không phải hỏng mới.** Đã dựng `git worktree` ở HEAD cũ để đối
chứng và chạy riêng ba ca ấy bốn lượt mỗi bên: bản CŨ hỏng 2/4 lượt với đúng chữ ký ấy
(`vung 4-5 · xa 1.1 ô · fightT 4.02`), bản MỚI đạt 4/4. Ba ca đó là:

- `gặp Kẻ bắn ở chỗ thoáng thì KHÔNG đánh`
- `nó chạy, và chạy được thật`
- `và cú đánh ấy ăn máu thật`

Nguyên nhân chập chờn: cả ba đặt con bot ở **`player.x + 3 ô`** trên một căn nhà **sinh ngẫu
nhiên** (`Math.random()`, không có hạt giống). Rơi vào góc tường thì `bestScore < 0` → `fightT`
nhảy thẳng lên `MATE_FIGHT_AFTER` → bot đứng lại đánh thay vì chạy, và cả ba phép đo sập cùng
lúc. **Muốn sửa cho hết chập chờn thì phải ghim hạt giống trong ba ca ấy**, không phải sửa AI.

Mười hai ca hỏng còn lại là hỏng từ trước (đã đối chứng, y hệt danh sách cũ).

`node test/nem-shop-suite.js` → **23 đạt / 0 hỏng**. Bộ mới, chỉ đo hai cơ chế của bản này
(mở cửa hàng → mua → vào ca → ném vào quái → ném vào đồng đội → ném cái đầu → thang sát thương).
Tách khỏi `repo-suite` vì bộ kia đã dài mười mấy phút, mà hai thứ này còn đang sửa tới sửa lui.

---

## 4. HAI CÁI BẪY VỪA SẬP

**`toDataURL()` trên trang mở bằng `file://`.** Ghi đầy đủ ở `art/README.md`. Tóm: canvas nào
vẽ `gear.png` lên rồi gọi `toDataURL()` sẽ ném `SecurityError` dưới `file://`, và vì lỗi bị
`catch` nên triệu chứng là **tủ đồ và cửa hàng không còn cái hình nào, console im lặng**. Trên
Pages thì không sao — nên lỗi chỉ hiện ra ở chỗ hay mở thử nhất. Đã sửa: `gearIconURL()` thử
hai lần, lần hai vẽ bằng vector.

**Đừng `open(f,'wb')` trước khi tính xong.** Một script vá `game.js` mở tệp ở chế độ ghi rồi
mới ném lỗi ở đúng lời gọi ấy — tệp bị cắt về **0 byte**, và script chạy sau đó đọc 0 byte rồi
ghi lại 0 byte. Cứu được vì mọi thay đổi đều nằm trong script vá, `git checkout -- game.js` rồi
chạy lại là xong. Luật: tính xong toàn bộ chuỗi mới mở tệp để ghi.

---

## 5. BẪY CŨ KHI SỬA `game.js` BẰNG SCRIPT — vẫn còn nguyên

Tệp `game.js` nằm trong repo với đầu dòng **CRLF**, trong khi `core.autocrlf=true`. Sửa nó bằng
Python/script rồi `git add` bình thường là git đổi cả tệp sang LF — diff phình lên 25.000 dòng
và nuốt mất phần thay đổi thật. Nhiều agent chạy song song trên cùng cây thư mục này, nên một
diff cả tệp là một cú xung đột chắc chắn.

Cách thoát: `git -c core.autocrlf=false add games/repo2d/game.js`. Nếu git đã ghi nhầm rồi thì
phải `git rm --cached` tệp ấy trước, không thì git thấy nội dung y hệt nên không băm lại.
(`sprites.js` cũng CRLF. `index.html` thì LF — đừng đổi.)

---

## 6. VIỆC CŨ CÒN TREO (không thuộc bản này)

- **Chuyến Tàu Cuối vẫn im tiếng.** `G.onSfx` được gọi ở 14 chỗ nhưng chưa ai gán hàm vào.
- **`bot-suite` vốn đã hỏng 10 phép từ trước.** Đã đối chứng ở HEAD cũ, kết quả y hệt. Đừng mất
  buổi tối đi sửa tưởng là mình vừa làm hỏng.
- **Ba ca chập chờn ở mục 3** — ghim hạt giống là xong.

---

## 7. BẢN SAU (2026-09-09, cùng ngày) — ánh sáng trên đồ đạc, và cái menu

### 7.1. Ánh sáng cắt ngang bàn / ghế / cây dừa
Chủ dự án: *"phần ánh sáng lúc nhìn lên bàn, ghế, cây dừa chưa hợp lý"*. Số đo, cái bẫy và ba
cái chốt của bản vá: **`art/room/README.md`**, mục "Miếng đồ CAO HƠN ô của nó". Tóm tắt: lưới
đánh dấu một ô, hình chiếm hai tới ba ô; đèn đi theo lưới nên cắt ngang thân món đồ, chênh
215/255 qua một vạch rộng 1–2 đơn vị. Nay `S.propUp` ghi lại phần tràn và `themONhoDo()` nới
đường clip lên đúng chỗ ấy — chênh trung bình còn 20/255 trên 65 món.

**Không đụng `slabExit` / `marchSolid` / `WALL_DEEP`.** Ba thứ đó là đường chung của tường, và
hai phép thử độ sáng mặt tường trong `repo-suite` đo thẳng vào chúng.

### 7.2. Màn tiêu đề dựng lại thành một cái MENU
Chủ dự án: *"chưa thấy chỗ mua/xài weapon ngoài menu"* và *"bên ngoài menu thì cũng thể hiện
char rõ ràng đi đừng dùng icon nữa"*.

Nút "Cửa hàng" chưa từng bị ẩn — đo trên bốn khổ màn hình thì lần nào nó cũng nằm trong khung
nhìn. Chụp ảnh ra mới thấy vì sao không ai thấy nó: màn tiêu đề là **mười lăm dòng chữ hướng
dẫn** chảy từ trên xuống, và ba cái nút TRÔI GIỮA đống chữ ấy. *"Nằm trong khung nhìn"* và
*"nhìn thấy được"* là hai chuyện khác nhau — đáng nhớ cho lần sau.

Nay nó là một bảng (`showVeil` có `extraHtml` → lớp `.veil.panel` → hàng nút thành chân trang
dính đáy, cùng bản vá đã cứu tủ đồ), phần hướng dẫn gập lại, và **ô bên trái là chính nhân vật**
— `veCharMenu()` vẽ bộ hình người vào một `<canvas>` thật mỗi khung: đứng yên, quay mặt ra, cầm
ngọn đèn, và **cầm luôn món vừa mua ở cửa hàng**. Khối "Đang mang theo" trong cửa hàng cũng vẽ
bằng người cầm nó chứ không bằng một biểu tượng nằm trong ô.

`moManDau()` được gọi ngay trong `__boot` — thiếu dòng ấy thì menu mới chỉ hiện khi QUAY LẠI từ
cửa hàng, còn lần đầu mở game vẫn là tấm màn tĩnh trong index.html.

### 7.3. Một bẫy nữa cho lần sau
`gearIconURL()` từng trả chuỗi rỗng dưới `file://` (canvas vấy bẩn). Cùng cái bẫy ấy chặn luôn
**mọi phép đo bằng `getImageData`**: muốn đo điểm ảnh thì chạy qua một máy chủ tĩnh
(`python -m http.server`) hoặc mở Chromium với `--allow-file-access-from-files`.

---

## 8. BẢN THỨ BA CÙNG NGÀY — cửa vào cửa hàng, và đạn theo từng khẩu

### 8.1. "Chưa thấy chỗ mua weapon" — tôi đã đi tìm lỗi sai chỗ
Lần đầu tôi đo **cái nút có nhìn thấy được không**, bốn khổ màn hình kể cả 375×553 đã trừ thanh
địa chỉ — lần nào nó cũng nằm trong khung nhìn. Đo đúng, kết luận sai.

Lỗi là cái nút ấy **chỉ sống trên màn tiêu đề**, một màn hình người chơi nhìn vài giây rồi bấm
"Vào ca" là mất. Sau đó đường duy nhất quay lại là CHẾT hoặc tải lại trang. Một cửa hàng chỉ mở
được trước khi vào ca thì với người đang chơi, nó không tồn tại.

Nay có cửa thứ hai ở **thanh trên, cạnh nút Sổ tay**, luôn ở đó. Cùng bộ máy với Sổ tay: dừng
thế giới, mở bảng, đóng thì chạy tiếp — vì cùng một lý do, bảng này bấm được giữa ca. Mua giữa
ca thì bảng nói thẳng: món ấy nằm sẵn trên tay ở **ca sau**, vì luật "tối đa một món mỗi ca"
nằm ở `mangDoVaoCa()`, chạy đúng lúc một ván bắt đầu.

`khiDongCuaHang` giữ đường VỀ — hai cửa vào có hai đường về khác nhau.

### 8.2. Đạn phải ra hình khẩu súng bắn nó
Cả ba thứ người chơi bắn ra chỉ có **hai mặt**: một chấm vàng nhạt r=2,6 dùng chung cho **súng
lục VÀ súng gây mê**, một chấm cam nhỏ hơn cho hoa cải. Khẩu mê có mũi tiêm xanh trên biểu
tượng, trên nút dùng, trong tủ, trên cửa hàng — rồi bắn ra một chấm vàng y hệt khẩu lục. Nó có
ba viên cho cả ca, nên bắn nhầm khẩu là mất một phần ba số đạn ấy.

Nay `veDan()`: đầu đạn đồng có vệt sáng dài (lục) · hạt chì ngắn ngủn (hoa cải) · mũi tiêm xanh
có cánh đuôi (mê), cả ba xoay theo hướng bay. Quả **lựu đạn** đang bay vẽ bằng chính
`gearIcon('bomb')` và lăn theo đường ném — trước đây nó là một hình tròn r=5 nhấp nháy cam. Đồng
hồ ngòi lên lớp cộng sáng ở `drawHighlights`, cùng chỗ với ngòi của Bom con.

### 8.3. Đo màu của đạn thì đừng đo trên khung hình thật
Thử hai lần đều sai: điểm sáng nhất quanh viên đạn trả về `rgb(255,255,255)` vì chỗ ấy nằm
trong lõi nón đèn pin, vốn đã cháy trắng; chụp hai lần rồi trừ nhau cũng hỏng vì lớp hiệu ứng
và HUD nhúc nhích giữa hai lần chụp và át mất phần lệch của viên đạn. Cách chạy được:
`veDan()` là hàm thuần, gọi thẳng nó lên một canvas trống 60×40. `REPO.veDan` xuất ra để làm
đúng việc ấy.

## 9. BẢN THỨ TƯ CÙNG NGÀY — art Soul Knight cho viên đạn và cho ba chiếc xe

Chủ dự án, ba câu liền nhau: *"lấy trong soul knight mà nhét vào cho hợp"* · *"dùng 2 miner
cart trong soul knight để làm 2 xe của repo"* · *"lấy cart to nhất để làm cart đẩy"*.

Hai tấm mới, cùng đường ống với `gear.png` — ghép ở `~/Downloads/sk-ref` (ngoài git, **không
commit**), chỉ tấm ghép ra mới vào repo. Khuôn và luật đầy đủ ở `art/README.md`.

- `art/item/dan.png` — dải ngang 3 ô, `DAN_ORDER = ['gun','shot','tranq']`.
- `art/item/xe.png` — lưới 3 cột × 8 hàng, `XE_ORDER = ['scout','haul','day']`.

### 9.1. Xe KHÔNG xoay bằng `c.rotate` — nó có tám hàng
Đây là chỗ khác hẳn `gear.png` và `dan.png`, và là cả lý do tấm `xe.png` có hình dạng ấy.
Vũ khí với viên đạn là hình nhìn ngang, xoay bằng ma trận thì vẫn đúng. Chiếc xe là hình
nghiêng ba-phần-tư nhìn từ trên xuống: xoay nó 180° là ngửa cả mặt đáy lên trời.

Soul Knight vẽ sẵn tám hướng cho mỗi chiếc xe goòng của thợ mỏ (`miner_car_0..7`), nên ở đây
dùng đúng tám hướng ấy. `huongKhung(a)` trong `game.js` đổi góc canvas ra số hàng:

```js
function huongKhung(a){ return Math.round((a + Math.PI/2) / (Math.PI/4)) & 7; }
```

Hàng 0 quay lên, rồi theo chiều kim đồng hồ. Cách kiểm mà không cần tin ai: chiếc `haul` có
**đèn pha** — khung 0 đèn hắt lên, khung 2 hắt sang phải, khung 4 hắt xuống.

### 9.2. Tấm hình vẽ được HÌNH, không vẽ được TRẠNG THÁI
Hình vector cũ nói ba thứ cùng lúc mà tấm hình không nói được cái nào: chiếc này còn xăng
không, có ai đang ngồi không, thùng sau có gì. Nên nhánh dùng sprite phải vẽ đè lại đủ ba:
`globalAlpha 0.62` khi cạn bình · vòng ê-líp màu vành xe dưới gầm khi có người · mấy ô vuông
vàng giữa thùng khi có hàng. Với xe đẩy còn một thứ nữa, và thứ này là **luật chơi** chứ không
phải trang trí: **thanh nắm** đánh dấu mặt trước — nắm đúng mặt ấy thì đẩy khoẻ, nắm hông thì
yếu (`cartGrabMode`), nên người chơi phải nhìn ra được mặt nào là mặt đó.

Luật chung: thiếu tấm thì `dan()` / `xe()` trả `false` và cả hai chỗ rơi về hình vector cũ.
Đừng xoá nhánh vector — nó là thứ chạy trên máy nào tấm hình chưa về kịp.

### 9.3. Bẫy: đo màu bằng "điểm sáng nhất" thì sprite thật sẽ làm sập bài test
Bài test màu đạn ở `test/nem-shop-suite.js` đang lấy **điểm sáng nhất** trên canvas. Nó đúng
với hình vẽ tay, vì chỗ sáng nhất của hình vector chính là cái lõi màu. Đổi sang sprite Soul
Knight là hỏng ngay: viên đạn thật có một **chấm bắt sáng trắng tinh** ở mũi, nên phép đo trả
về `rgb(255,255,255)` — "viên đạn màu trắng". Nó đo cái chấm, không đo viên đạn.

Sửa ở phía bài test, không phải phía hình: lấy **màu trung bình của phần có mực**. Một hai
điểm trắng không lật được cả nắm điểm vàng. Đây là lần thứ ba cùng một bài học trong tệp ấy:
*đo cái đang cần khẳng định, đừng đo cái dễ lấy nhất.*

### 9.4. Chọn chiếc nào cho xe nào — và vì sao
Trong bộ `miner_car` của Soul Knight chỉ có **hai** chiếc trông ra một chiếc xe thật (goòng
gỗ ở `common`, goòng thép có gai ở `skin_5`); tám bản còn lại là skin vui mắt (cà rốt, phao
hạc, bánh kem, bong bóng, bướm, mõm quái). Mà repo cần **ba**. Nên phải có một chiếc lấy skin
vui mắt, không tránh được — chuyện là chọn chiếc nào và đưa cho ai.

- `day` ← **goòng thép** `skin_5`: chủ dự án nói thẳng *"cart to nhất"*, và 57×71 đúng là
  khung lớn nhất trong cả bộ (goòng gỗ 57×62).
- `haul` ← **goòng gỗ** `common`: nó là chiếc duy nhất còn lại **có thùng**, mà xe chở đồ thì
  cái thùng không phải trang trí.
- `scout` ← **phao hạc** `skin_3`, chọn theo ba lẽ đo được: có cái đầu nên nhìn là biết đang
  quay hướng nào (với xe trinh sát thì hướng là thứ quan trọng nhất, và bong bóng `skin_4`
  trượt đúng chỗ này — tám khung gần như một); màu hồng nên không lẫn với chiếc `haul` màu
  cam đỗ ngay cạnh; và nó nhỏ nhất trong ba chiếc, đọc ra là "nhanh".

Đổi ý chiếc nào thì sửa đúng một dòng trong `PICKS` của `sk-ref/build_xe.py` rồi chạy lại —
mã không cần đụng tới.

### 9.5. Test
`test/nem-shop-suite.js` thêm mục `xeSuite` (17 bài): tám hướng của mỗi chiếc phải là **tám
hình khác nhau** (dấu vân lưới 12×12) — bắt được cái lỗi im lặng "ghép một khung nhân tám";
ba chiếc phải ra ba màu; xe đẩy phải phủ nhiều điểm ảnh nhất trong ba chiếc (kiểm đúng câu
*"cart to nhất"*); và `huongKhung()` phải khớp bốn hướng chính cộng hai góc quá một vòng.

Cả bộ: `nem-shop-suite` 57/57 · `bike-suite` 36/36.

## 10. BẢN THỨ NĂM CÙNG NGÀY — BIỆT ĐỘI: mặt xác thật, và cửa hàng đồ nghề

Chủ dự án mở trang Biệt Đội rồi hỏi ba câu liền: *"ủa repo squad chưa update nữa hả?"* ·
*"tui thấy char vẫn đang là mấy cái icon"* · *"repo squad cũng chưa có shop weapon"*.

Câu đầu thì đúng là đã update — `?v=` của Biệt Đội lên `20260909f` cùng lúc với Ca Trực Đêm,
vì hai trang dùng chung `game.js`/`sprites.js`. Nhưng hai câu sau mới là cái thật: **hai việc
đã làm cho Ca Trực Đêm chưa từng được làm cho Biệt Đội**, mà hai bản dùng chung bộ máy nên rất
dễ tưởng là làm một lần là xong. Không phải: mọi thứ nằm ở LỚP MENU thì mỗi bản một cái.

### 10.1. Mặt xác: emoji → charset thật
`faceOf()` trong `js/ui.js` trả về một emoji cho từng xác (`bao: '🔦'`, `hue: '💉'`, ...), dùng
ở tám chỗ. Trong khi mười bốn xác **đều đã có charset thật** ở `../repo2d/art/crew/<id>.png`,
`sprites.js` đã nạp sẵn cả mười bốn, và `REPO_SKIN.crew()` chọn theo `a.charId` — mà `charId`
chính là `SQ.CHARS[].id`. Nên đây không phải việc vẽ mới, chỉ là việc gọi ra.

Nay `matHTML(id, lop)` đẻ ra một `<canvas class="mat mat-*" data-char="...">`, `veMat()` vẽ
vào đó, `chayMat()` vẽ lại cho tới khi tấm hình về **rồi tự tắt** — không có vòng rAF nào chạy
suốt phiên chỉ để canh một tấm ảnh.

Ba điều đáng nhớ:

- **Khổ vẽ lấy từ CSS.** Canvas đọc `clientWidth/clientHeight` làm khổ vẽ, nên mấy lớp
  `.mat-*` trong `index.html` là nguồn duy nhất. Đặt cỡ trong JS là có hai chỗ nói hai kiểu.
- **Ô nhỏ thì cắt lấy ĐẦU.** Chip góc trên chỉ 24px; cả người thu vào đó chỉ còn một vệt. Lớp
  `.mat-dau` xén trong ô rồi phóng to phần đầu — một cái mặt 24px đọc được, một cái người
  24px thì không.
- **Emoji chưa chết.** Chỗ nào nó nằm GIỮA MỘT DÒNG CHỮ (huy hiệu "ai đang đeo món này", danh
  sách trong Sổ tay, nút kỹ năng trong ca) thì giữ nguyên: chen một canvas vào giữa dòng chỉ
  làm chữ xô lệch. Đổi đúng chỗ nào là MỘT Ô CHÂN DUNG.

Bẫy để lại cho lần sau: bài test dễ viết nhất là "có vẽ ra cái gì không", mà cái sai dễ xảy ra
nhất lại là **vẽ được nhưng ai cũng như ai** — `charId` không tới nơi và cả lưới rơi về một xác
mặc định. Bài test lấy dấu vân từng ô rồi đếm số hình KHÁC NHAU, phải đủ 14/14.

### 10.2. Cửa hàng đồ nghề: cùng luật, ví riêng
Ca Trực Đêm có cái này từ bản trước, chạy trên một **két riêng** trong localStorage
(`repo2d.kho.v1`) với đồng tiền lương 12% của nó. Cắm nguyên cái két ấy sang Biệt Đội là hai
hệ tiền tệ cãi nhau trên cùng một màn hình — đúng lý do `khoOn()` bên kia tắt nó đi khi có
menu Biệt Đội.

Nên bên này: **cùng mặt hàng và cùng giá** (`REPO.KHO_HANG` — một bảng giá duy nhất cho cả hai
bản, chép ra là hai bảng và hai bảng thì một cái luôn cũ), nhưng trả bằng **vàng** của Biệt Đội
và cất trong chính bản lưu của nó (`M.mang`). Giá giữ nguyên vì hai bên kiếm được xấp xỉ nhau
mỗi ván: bên kia 12% số giao được (~1.000/ván), bên này 900–3.000 vàng một lần qua map cộng
nhiệm vụ ngày.

Phần lắp món lên tay tách khỏi `mangDoVaoCa()` thành `lapDoLenTay(kind, uses)` và xuất ra, để
Biệt Đội gọi thẳng trong `SD.enter()` — **sau** `REPO.startLevel()`, vì trước đó chưa có
`S.player` để mà lắp vào.

**Hai cửa vào chỗ bán, và đó là bài học của lần trước.** Lần trước tôi đo "cái nút có nhìn thấy
được không" trên bốn khổ màn hình và kết luận là ổn — trong khi lỗi thật là cái nút chỉ sống
trên một màn hình người chơi ghé vài giây. Nên ở đây: khối bán nằm **trên cùng** màn Cửa Hàng,
**và** màn chính có một dải luôn nói rõ đang mang gì, nằm ngay trên đường tới nút ĐI CA, bấm
vào là tới thẳng chỗ bán.

### 10.3. Một trang đừng ghi trạng thái nó không sở hữu
Bài test "hai cái ví tách hẳn" bắt được một thứ tôi không ngờ: mở trang **Biệt Đội** thôi cũng
đủ gieo một cái két $3.200 vào `localStorage['repo2d.kho.v1']`. Vì trang ấy cũng nạp `game.js`,
`__boot` vẫn gọi `moManDau()`, và `khoDoc()` khi không thấy két thì **ghi** một cái mới.

Không vỡ gì — trang ấy không bao giờ bày cái két ra. Nhưng nó là một trang ghi trạng thái nó
không sở hữu, và đúng loại thứ khó lần ra khi nó thành nguyên nhân thật. Nay `khoDoc()` vẫn
TRẢ VỀ két mặc định cho mọi người gọi, nhưng chỉ GHI xuống ở trang có két.

### 10.4. Test
`test/nem-shop-suite.js` thêm `matSuite` (6 bài) và `khoSquadSuite` (11 bài).
Cả bộ: `nem-shop-suite` 74/74 · `bike-suite` 36/36 · `guns-suite` 46/52 (6 bài sạc laser hỏng
sẵn từ trước, đo lại trên bản HEAD ra đúng sáu bài ấy).

