# Bộ tile phòng ốc

Nguồn: **Modern Interiors — bản free v2.2** của **LimeZu** — https://limezu.itch.io/moderninteriors

Tệp này là **ghi chú để lần sau còn dùng lại được tấm tile**. Mã thì nằm ở `../../phong.js`
(vẽ) và `../../game.js` (dựng nhà); ở đây ghi những thứ đã phải **đo mới biết**, và mấy cái bẫy
đã sập một lần rồi.

## Giấy phép — đọc trước khi bán bất cứ thứ gì

`LICENSE-limezu.txt`, nguyên văn, nói được ba câu và cấm ba câu. Câu cấm quan trọng nhất:

> YOU CAN'T USE THE ASSET IN COMMERCIAL PROJECTS

**Bản free chỉ dùng được cho dự án PHI THƯƠNG MẠI**, kể cả bản đã sửa. Ngày nào hub này thu tiền
thì có đúng hai lối: mua bản đầy đủ (1,20 $ ở trang itch.io trên) và thay hai tệp `.png` này, hoặc
gỡ `phong.js` ra khỏi hai trang html — game vẫn chạy, chín kiểu phòng rơi về nước sơn vẽ bằng mã
ghi trong `FLOORS` / `WALLS`, không màn nào vỡ.

Ghi công nằm ở cuối Sổ tay trong game (xem chỗ `wk-nguon` trong `game.js`) chứ không chỉ ở đây:
một ràng buộc chỉ sống trong chú thích mã nguồn là một ràng buộc sẽ bị quên.

## Hai tệp

| Tệp | Gốc | Cỡ | Nội dung |
|---|---|---|---|
| `room-builder.png` | `Interiors_free/48x48/Room_Builder_free_48x48.png` | 816×1104 (17×23 ô) | sàn và tường |
| `interiors.png` | `Interiors_free/48x48/Interiors_free_48x48.png` | 768×4272 (16×89 ô) | đồ đạc |

Nội dung giữ nguyên từng điểm ảnh, chỉ đổi tên cho ngắn.

## Vì sao lấy bản 48×48 chứ không phải 16×16

`prerenderWorld()` vẽ cả thế giới ở `SS = 2`, tức mỗi ô 24 đơn vị thế giới được **48 điểm ảnh**
để vẽ. Bản 48 dán vào đúng một đổi một: không phóng, không thu, không một điểm ảnh nào phải qua
một phép nội suy. Lấy bản 16 rồi phóng ba lần cũng ra hình đó, nhưng mọi nét chéo trong tấm gỗ
xương cá sẽ nhoè đi một nấc — mà nét chính là thứ duy nhất bộ tile này bán cho ta.

Đổi lại: hai tệp nặng 229 KB thay vì 146 KB. Đó là cái giá, và nó rẻ.

Hằng số của phép quy đổi nằm trong `veMieng()`: `k = T / O = 24 / 48 = 0,5`. **Một điểm ảnh nguồn
= nửa đơn vị thế giới.** Mọi con số dưới đây đều xoay quanh nó.

---

# 1. `room-builder.png` — sàn và tường

Hai bảng `SAN` và `TUONG` trong `phong.js` đếm bằng **Ô**, và lưới ô của bản 48 trùng khít lưới
bản 16 — nên muốn soi thì mở bản `16x16` trong bộ gốc ra đếm, số nào cũng dùng lại được y nguyên.
(Bảng `M` thì ngược lại: nó đếm bằng **điểm ảnh**. Xem phần 2.)

## Sàn — `SAN`

Cột **11..13**, mỗi kiểu chiếm 2 hàng. Bảng hiện có:

| khoá | hàng đầu | mặt sàn |
|---|---|---|
| `gach_do` | 5 | gạch đỏ |
| `men_kem` | 7 | gạch men kem |
| `men_ngoc` | 9 | gạch men ngọc |
| `be_tong` | 11 | bê tông |
| `go_xuongca` | 13 | gỗ xương cá |

Sáu ô của mỗi khối 3×2 là **sáu biến thể lát được** của cùng một mặt sàn, không phải sáu mặt sàn
khác nhau — ghép cạnh nhau kiểu gì cũng liền. `veSan()` bốc một trong sáu **theo toạ độ ô** (băm
`bam(gx, gy, ...)`, không phải theo dòng ngẫu nhiên) nên vẽ lại một ô bao giờ cũng ra đúng ô ấy.

## Tường — `TUONG`

Mỗi kiểu chiếm 2 hàng, bắt đầu ở hàng `5, 7, 9, 11, 13, 15, 17, 19`. Trong một khối:

- cột **1**, hàng dưới (`hàng đầu + 1`) = **mặt tường**, có sẵn dải chân tường ở đáy;
- cột **1**, hàng trên + một **độ lệch** = **mặt trên tường**, lát dọc bao nhiêu cũng liền.

Cái độ lệch ấy là số thứ hai trong `TUONG[...]`, và nó **phải đo, không đoán**: mỗi kiểu tường có
hoa văn ở một độ cao khác nhau, cắt sai vài điểm ảnh là hai ô chồng lên nhau lộ mối ngang. Số đo
được (24 / 24 / 24 / 27 / 27 / 27 / 31 / 31) lấy bằng cách quét cả 49 vị trí cửa sổ khả dĩ rồi
chọn chỗ mà mép trên khớp mép dưới.

### Tường dựng kiểu Soul Knight

`veTuong()` vẽ hai lượt cho **một** ô tường:

1. **mặt trên** — cắt ở độ lệch trên, rồi phủ `rgba(8,6,4,0.40)`. Đỉnh tường là mặt quay đi khỏi
   nguồn sáng nên nó phải TỐI HƠN mặt trước, thì cả bức mới đọc ra một khối có bề dày.
2. **mặt trước** — chỉ khi ô ngay dưới là chỗ trống (`mat === true`). Lấy đúng **nửa DƯỚI** của ô
   mặt tường nguồn (chỗ có dải trang trí và chân tường) dán vào nửa dưới ô game. Cắt chứ không
   thu: thu là méo, cắt là nét. Rồi kẻ một vạch `rgba(0,0,0,0.42)` dày 1 ở chỗ hai mặt gặp nhau —
   thiếu vạch ấy thì hai mảng cùng nước sơn dính vào nhau và cái gờ biến mất.

### Tường một lớp, ngoài là void

`game.js` chỉ vẽ ô tường nào có **ít nhất một trong TÁM ô quanh nó** không phải tường
(`tuongLoRa()`, kể cả bốn hướng chéo — thiếu chéo thì bốn góc trong của một phòng tròn bị thủng).
Phần tường còn lại để nguyên nền đen. Đó là thứ làm phòng tròn / phòng chữ thập đọc ra hình của
nó thay vì ra một cục bê tông có đục lỗ.

## Cột 4..16, hàng 0..3 — "room border / ceiling" — **CHƯA DÙNG**

Đây là bộ **trần trắng nhìn từ trên, có viền đen** — đúng cái look Soul Knight, và là chỗ dùng
đúng của nó trong bản này sẽ là **mặt trên của lớp tường** (hiện đang là giấy dán tường làm tối
40%). Chưa gắn vào vì cần hai việc:

1. **nhuộm màu theo từng kiểu phòng** — nó trắng tinh, dán thẳng vào thì chín phòng cùng một cái
   nóc trắng;
2. **map autotile** — viền không nằm trên biên ô mà thụt vào ~9 điểm ảnh, và bộ này là dạng blob
   nhiều trường hợp (góc, cạnh, góc lõm), không phải một tấm chín lát.

Ô đặc màu tối ở **(12, 0)** là ô bóng/void dùng chung. Ba cột **14..16** là mảng trần đặc.

Đây là việc **đổi diện mạo cả chín kiểu phòng cùng lúc**, nên đừng làm nửa vời.

---

# 2. `interiors.png` — đồ đạc

## Bảng `M` ghi bằng ĐIỂM ẢNH, không phải ô

Mỗi miếng là `[x, y, rộng, cao]` **tính bằng điểm ảnh của chính nó trên tấm nguồn**. Đây là chỗ
khác căn bản so với bản đầu, và là chỗ bản đầu sai: cắt theo lưới 48 thì cái tủ cao 111 bị xén còn
96, cây dừa cao 93 bị xén còn 48.

Số không gõ tay. Chúng do một lượt **loang vùng điểm ảnh liền nhau** trên chính tấm png sinh ra:
269 vùng, mỗi vùng một món, lấy hộp bao sát. Chỗ duy nhất phải cắt tay là mấy **dãy đồ dính liền
nhau trên tấm nguồn** (dãy quầy bar chín ô liền một vệt, dãy kệ hàng, dãy sofa) — ở đó phép loang
gộp tất cả làm một khối.

Quy ra ô:

```
rongO(m) = max(1, round(m[2] / 48))      // chân miếng chiếm mấy ô
caoO(m)  = max(1, round(m[3] / 48))
```

## Luật cắt — kiểm lại bằng máy được

Đã có một lượt soi lại cả 239 miếng bằng phép **dò vùng alpha liên thông chạm vào hộp**: bao lồi
tràn ra ngoài hộp ⇒ cắt cụt; thụt vào trong ⇒ thừa nền rỗng; có ≥2 vùng ⇒ gộp nhiều món. Lượt ấy
bắt được 49 miếng lỗi. Bảng lỗi hay gặp, theo thứ tự dễ sập:

- **một hộp ôm nhiều món** — hai cái kệ chồng nhau + khe rỗng ở giữa; cái hũ dính nguyên cái gương
  đứng; ghế lùn + ghế cao + một mảng rỗng.
- **hộp lệch, chém mất thân món** — hộp bắt đầu sớm 30 điểm ảnh nên một phần ba trên rỗng, rồi xẻ
  cụm tủ ra bốn lát **cắt đôi từng ngăn kéo**.
- **mảnh cắt ra từ món lớn hơn** — ba lát của đúng một cái quầy; ô GIỮA của một tấm thảm chín lát
  đem làm tranh treo (dựng lên chỉ là một ô màu đặc).
- **trùng y nguyên từng điểm ảnh** — một mảng khai tám phần tử mà chỉ có bốn.
- **sai họ** — cắt đúng nhưng gọi sai tên: cánh cửa nằm trong họ tủ thấp, giường nhìn từ trên nằm
  trong họ kệ, ghế đẩu nằm trong họ thùng gỗ.
- **quá nhỏ** — dưới 30 điểm ảnh thì dựng lên gần như không đọc ra hình.

Máy chỉ **gắn cờ**; quyết thì vẫn phải **dựng từng miếng ra một tấm contact sheet mà nhìn**. Cách
làm: đọc bảng `M` ra từ `phong.js` bằng regex, cắt từng miếng, xếp lưới có nhãn `họ#số WxH`, nền
kẻ caro để thấy vùng trong suốt. Nhiều lỗi chỉ lộ ra ở bước này (một "tấm ván trắng trơn" và một
"tấm thảm tím" đội lốt tủ cao, máy không thấy gì sai vì hộp khít).

## Hai luật bắt buộc

- **Không miếng nào cao 3 ô.** Miếng cao 2 chiếm ô của nó và tràn một ô lên trên — đó là cách một
  cái tủ được nhìn từ 3/4. Tràn ba ô thì nó nuốt trọn bức tường phía trên, và cái tủ khi ấy không
  dựa vào tường nữa mà THAY tường.
- **Mỗi họ đồ dùng cho một chữ trong một kiểu phòng phải có ít nhất bốn miếng, và ít nhất một
  miếng rộng đúng một ô.** Ít hơn bốn thì cả phòng ra một lưới đồ giống hệt nhau (đã sập một lần:
  họ tủ sắt có đúng một miếng, lớp học ra mười lăm cái tủ sắt y hệt). Không có miếng rộng một ô
  thì tới cuối dãy lẻ, chỗ còn lại hẹp hơn miếng hẹp nhất, `veDo()` bỏ cuộc và rơi về cái hộp xám
  vẽ bằng mã.

---

# 3. Luật NEO — cái bẫy lớn nhất

`prerenderWorld()` quét **từ trên xuống, trái sang phải**, và **mỗi ô tự tô sàn của nó ngay trước
khi vẽ đồ lên**. Nên:

> **Một miếng chỉ được phép tràn về phía ĐÃ VẼ XONG: lên TRÊN và sang TRÁI.**

Tràn sang phải hoặc xuống dưới thì bị chính mấy ô sau tô sàn đè mất — **im lặng, không lỗi nào
báo**. Đây là lỗi làm "art bị cắt": mọi món rộng hơn một ô đều mất phần đuôi bên phải, cái bảng
đen rộng hai ô hiện ra đúng một ô rồi bị cắt đứng một nhát.

Ba chỗ trong mã đều phải theo luật này, và mỗi chỗ theo một kiểu:

| hàm | neo ở đâu |
|---|---|
| `veDo()` ngang | vẽ ở **ô CUỐI** của miếng (`cuoi = min(i + r - 1, dauX + dai - 1)`), đặt tại `x - (gx - i) * T` |
| `veDo()` dọc | đáy miếng chạm **đáy ô**, phần cao thừa tràn lên trên |
| `veTham()` | neo **góc dưới-phải** một mảng sàn sạch (`sanSachTraiTren()` hỏi trước khi vẽ) |
| `veTreo()` | chỉ nhận miếng **cao ≤ 48 điểm ảnh**; cao hơn thì nó thò lên **sàn của phòng phía trên** |

---

# 4. Năm thứ một kiểu phòng khai (`KIEU`)

```
san    khoá vào SAN
tuong  khoá vào TUONG
do     { T, S, C, P, x } — mỗi chữ trong mẫu phòng ứng với một danh sách miếng
ban    những miếng trong `do` được coi là MẶT BÀN — đồ trang trí đứng lên trên
treo   tranh, gương, cửa sổ — treo lên MẶT TƯỜNG
tham   thảm trải sàn
```

Một mẫu phòng vẽ tay chạy được với MỌI kiểu: chữ `T` trong bếp ra cái quầy, cũng chữ ấy trong lớp
học ra cái bàn học sinh.

Mấy chỗ đã sập rồi, đừng sập lại:

- **`TREN_BAN` phải chia theo kiểu phòng**, không dùng chung một rổ. Dùng chung thì trên quầy của
  tiệm tạp hoá mọc ra một quả địa cầu.
- **Ghế nhìn nghiêng không được nằm trong dãy đồ.** Bộ này có ba loại ghế khác hẳn nhau: ghế đẩu
  nhìn từ trên (đặt đâu cũng được), ghế nghiêng **lưng bên trái** (người ngồi quay mặt sang phải ⇒
  ngồi bên TRÁI bàn), ghế nghiêng **lưng bên phải**. Xếp ba cái ghế nghiêng cạnh nhau thì ba cái
  lưng dựng sát vào nhau và đọc ra một món đồ gãy. Chúng nằm riêng ở `M.ghe_trai` / `M.ghe_phai`
  và chỉ được vẽ kê bên bàn.
  Trái/phải **không đoán bằng mắt**: đếm điểm ảnh đặc ở một phần tư TRÊN CÙNG của mỗi hộp — chỗ đó
  chỉ có cái lưng — rồi xem nó lệch về bên nào.
- **Hầm mộ không có trong bảng này.** Nó vẫn là kiểu vẽ bằng mã trong `game.js` (`paintStone`,
  `paintStoneInlay`, `paintStoneFrieze`, quan tài / đá vụn / vò gốm) — một kiểu ngang hàng với chín
  kiểu ở đây chứ không phải cái bị thay.

---

# 5. Nhà dựng ra sao (`game.js`)

- **Một màn một theme.** `KHO_THEME` có mười lá: chín kiểu lát tile, cộng **cả bộ hầm mộ tính là
  một lá**. Màn hầm mộ vẫn chạy bốn nước đá theo vị trí phòng vì bốn nước ấy chính là cái theme.
  Luật không lặp: theme màn này phải khác màn trước (`themeTruoc`, để ngoài `S` vì `S` bị dựng lại
  mỗi màn).
  Màn không phải hầm mộ thì **loại hẳn mẫu phòng `da`** ra khỏi bộ mẫu — một mẫu `da` là dãy quan
  tài xếp sát nhau, đặt trên nền gạch men của cái bếp thì có quan tài giữa bếp.
- **Hình phòng** — bảng `HINH`, bảy mặt nạ (vuông, tròn, bát giác, dọc, ngang, chữ thập, góc) đè
  lên mẫu phòng: ô rơi ra ngoài hình thì thành tường. **Dải chữ thập giữa phòng (cột 9–11, hàng
  6–8) luôn được miễn trừ** — cửa khoét ở giữa mỗi cạnh và xe đẩy rộng 40 điểm ảnh cần lối ba ô.
  Phòng số 0 (có xe tải) và mẫu hầm mộ giữ nguyên hình chữ nhật.
- **Làm thoáng** — bỏ theo CẢ DÃY chứ không bỏ từng ô (bỏ lẻ thì một dãy bảy ô ra bốn mảnh cụt).
  Hai mức: `BO_TUA` cho dãy chạm vách, `BO_GIUA` cho dãy đứng trơ giữa phòng.
- **Viền đồ dựa tường** (`VIEN_DO`) — mặt nạ hình phòng cắt mất cái vành mà đồ đạc của mẫu phòng
  phần lớn nằm ở đó, nên sau khi cắt hình phải **rải lại một viền theo tường MỚI**. Chỉ chữ `S`
  (đồ cao, vẽ từ đáy ô lên), và trừ dải chữ thập.

---

# 6. Cách kiểm

Mở `file:///` trên ổ đĩa **không tính** — chủ dự án xem bản trên GitHub Pages.

```
python -m http.server 8765 --directory D:\survivor-web-hub
```

rồi lái game thật bằng Playwright (chromium có sẵn ở
`~/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe`, truyền qua
`executablePath`), đợi `window.REPO_PHONG.sanSang()` — **đợi hai tấm png nạp xong rồi mới dựng
nhà**, không thì lượt vẽ rơi về nước sơn vẽ bằng mã — gọi `REPO.startLevel()`, rồi đổ
`REPO.S.worldCv` ra png mà nhìn.

Nhớ bơm `BUILD` trong `game.js` và dấu `?v=` trên thẻ `<script>` của **cả hai** trang html cho
khớp nhau, không thì Pages trả bản cũ. Pages mất khoảng 70 giây sau khi push.
