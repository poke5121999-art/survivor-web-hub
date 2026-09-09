# Còn lại — bàn giao 2026-09-09

Bản vừa push: **ném đồ · đường chỉ lối trên sàn · loot vẽ lại · cửa hàng ngoài menu**.
Dấu build lên `?v=20260909d` — ba chỗ phải bằng nhau: `repo2d/index.html`, `repo-squad/index.html`,
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
