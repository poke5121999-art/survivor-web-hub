# Darkwood — hồ sơ nghiên cứu về NỖI SỢ, cho `repo2d` và `repo-squad`

Game gốc: **Darkwood** (Acid Wizard Studio, Ba Lan). Bản đầy đủ ra 2017-08-17 trên PC;
console 2019. Thể loại: sinh tồn kinh dị **nhìn từ trên xuống**, thế giới mở, sinh ngẫu
nhiên. Đây là game nhìn-từ-trên-xuống hiếm hoi được cả giới phê bình lẫn người chơi coi là
**đáng sợ thật**, và nó cùng góc máy, cùng bài toán ánh sáng với `repo2d`.

Tài liệu này **không** đề xuất làm lại Darkwood. Nó trả lời đúng một câu:
*Darkwood dựng nỗi sợ bằng những cột nào, cột nào `repo2d` đã có sẵn, và cột nào còn thiếu
mà lắp vào được.*

Quy ước đánh dấu (giống `RESEARCH.md`):
- không dấu — **có nguồn**, dẫn ở cuối bài.
- `[ĐỀ XUẤT]` — thiết kế do tài liệu này nghĩ ra, **không** có trong Darkwood.
- `[ĐO TRONG REPO]` — số đếm trực tiếp từ mã nguồn, **ngày 2026-09-11, commit `4104ce0`**.

---

## 1. Darkwood dựng nỗi sợ bằng gì

Bảy cột. Không cột nào là cú doạ bất ngờ.

| Cột | Luật |
|---|---|
| **Nón nhìn hẹp trên góc máy từ trên xuống** | Nhân vật chỉ thấy rõ thứ ở **ngay trước mặt**; khoảng **270°** quanh người không được tính đến ở bất kỳ khoảnh khắc nào. Góc nhìn từ trên xuống — thứ lẽ ra cho ta cảm giác nắm được cả không gian — bị lật thành lời nhắc liên tục rằng vòng an toàn quanh mình nhỏ đến mức nào. |
| **Ngoài nón là ĐEN RỖNG, không phải đen mờ** | Quái và ô cửa nằm ngoài tầm nhìn **biến mất hẳn**: không thành viền, không để lại bóng, chỗ chúng vừa đứng bị lấp bằng màu đen. Không có "bóng mờ để đoán". |
| **Nghe/thấy đồ vật chuyển động mà không biết cái gì làm ra** | Lời của người làm game, Gustaw Stachaszewski: *"seeing (or hearing) objects move without knowing what caused the motion (or sound) was eerily appealing to us."* Ánh sáng trong game được dựng để **giấu ít nhất là ngang với để soi**. |
| **Không doạ bất ngờ — để trí tưởng tượng làm việc** | *"We find it much more engaging to experience horror that stimulates our imagination and lets our minds fill in the blanks."* Nỗi sợ ở đây là **biết-có-nhưng-không-biết-ở-đâu**: game nói cho bạn bằng tiếng động và bằng những xáo trộn nhỏ trong phòng rằng có thứ gì đó ở đây, cái nó không nói là **ở đâu**. |
| **Nhịp ngày/đêm cưỡng bức** | Chạng vạng 19:30, đêm 20:00. Ngày đi ra ngoài kiếm đồ; đêm bị nhốt trong hầm chống đỡ từng đợt. Đứng trong tối quá lâu thì **Bóng** hiện ra, gây sát thương và **không đánh lại được** — cách duy nhất là đứng trong sáng. |
| **Máy phát điện: thế lưỡng nan hai đầu đều sai** | Phải bật máy phát trước khi trời tối để có đèn. Nhưng **ánh sáng gọi quái tới**, trong khi chính nó lại xua được vài loại khác. Quái đằng nào cũng đến — máy phát không phải lá chắn, nó là một lựa chọn đắt cả hai đường. Ban ngày quên tắt là phí nhiên liệu. |
| **Âm thanh gần như không bao giờ im, nhạc gần như không có** | Darkwood hiếm khi dùng sự im lặng: tiếng nền luôn chạy phía sau, để người chơi **không bao giờ thấy mình một mình hẳn**. Nhạc chỉ vào bằng một lớp trầm, đều, khi đêm xuống — đúng lúc tiếng bước chân trở thành thông tin sống còn. |

Một cột thứ tám, thuộc về cách kể chứ không phải luật chơi: **game không giải thích gì cả.**
Người chơi phải tự để ý mới bắt đầu hiểu nổi thế giới này chạy bằng gì.

---

## 2. `repo2d` đã có sẵn bao nhiêu trong số đó

Đây là phần quan trọng nhất của bài, và kết quả **ngược với dự đoán ban đầu**: căn nhà này
đã đứng trên năm trong bảy cột. Đo tại `4104ce0`.

| Cột của Darkwood | `repo2d` [ĐO TRONG REPO] | Kết |
|---|---|---|
| Nón nhìn hẹp | `visPoly()` (`game.js:4231`) dựng đa giác tầm nhìn thật; `CONE_HALF = 0.62` rad → nón rộng **71°**, tức **289° quanh người không được tính** — hẹp hơn cả Darkwood. Nón là **ánh sáng thật** trong `buildLight()` (`:10497`), không phải một hình vẽ chồng lên. | **Đã có, và chặt hơn** |
| Ngoài nón là đen rỗng | Đo thật: một Kẻ bắn đứng cách 4 ô **sau lưng**, trên ô đã đi qua → thân nó đọc **0/255**, sàn ngay sau nó **0/255**. Không có viền, không có bóng. `drawMemory()` (`:11821`) chỉ vẽ ký ức ở mức `rgb(6,8,10)`–`rgb(12,15,19)`. | **Đã có** |
| Nghe thấy thứ mình không thấy | `stepFoeSound()` (`:5368`): **chỉ con GẦN NHẤT mà bạn KHÔNG nhìn thấy** mới có tiếng — `SFX.shuffle` trong `FOE_HEARD_R = 7 ô`, đổi sang `SFX.breath` trong `FOE_BREATH_R = 3,2 ô`. Cố ý **không** kêu cho con đang nhìn thấy. | **Đã có** |
| Không doạ bất ngờ | `relocateFoe()` (`:5082`) từ chối mọi chỗ người chơi nhìn thấy được — không con nào hiện ra từ hư không. `threatLevel()` (`:755`) tính căng thẳng theo **khoảng cách**, không cần nhìn thấy: `DREAD_R = 10 ô`. Nhịp tim 52→176 nhịp/phút, và nhà tự cọt kẹt (`HOUSE_GAP = [7,18]` giây) **chỉ khi** dread < 0,3. Có cả cú **hụt tiếng** khi cuộc đuổi đứt (`HUSH_FROM 0,65 → HUSH_TO 0,35`). | **Đã có, và tinh hơn** |
| Âm thanh không im, nhạc ba lớp | `SFX.score()` chồng ba lớp không bao giờ cắt: NHÀ → DRONE (có thứ ở trong này với bạn) → CỤM (nó đã THẤY bạn). Tất cả tổng hợp bằng oscillator nên drone liền mạch thật, không có mối nối như tệp lặp. | **Đã có** |
| Nhịp ngày/đêm | **Không có.** Cả ca trực là một đêm phẳng: vào nhà, khuân đủ chỉ tiêu, đạp nút, về xe. Đỉnh căng duy nhất là `EXTRACT_HOLD = 3` giây đứng trên nút. | **Thiếu** |
| Máy phát điện — đèn có giá | **Không có.** Đèn của người chơi luôn bật, không tắt được, không tốn gì. Người chơi **không có lựa chọn nào** về ánh sáng của mình. | **Thiếu** |

Và một thứ Darkwood không có mà `repo2d` có: **quái tự mang đèn**. Nón nhìn của con quái cũng
là ánh sáng thật đổ lên sàn (`buildLight`), nên một quầng đỏ cam hắt ra từ ô cửa phòng bên là
tin báo "có con Kẻ bắn ở đó" **trước khi** thấy nó. Đó là một phát minh riêng của căn nhà này,
và nó làm đúng việc mà Darkwood giao cho âm thanh.

---

## 3. Bốn khoảng trống thật, xếp theo giá trị trên công sức

### 3.1. Âm thanh KHÔNG CÓ HƯỚNG — cột lớn nhất còn thiếu

[ĐO TRONG REPO] Toàn bộ hệ tiếng đi qua đúng một đường: `env()` (`game.js:323`) nối thẳng vào
`master` → `ac.destination`. **Không có `StereoPannerNode`, không có `PannerNode`, không có một
chữ `pan` nào trong cả `game.js` lẫn `phong.js`.** Mọi tiếng động trong căn nhà phát ra **chính
giữa đầu người chơi**.

Hệ quả, và nó lớn hơn vẻ ngoài của nó: `stepFoeSound()` đã làm đúng nửa việc khó — chọn ra
**con gần nhất mà bạn không thấy**, và cho nó tiếng thở khi nó vào trong 3,2 ô. Nhưng tiếng ấy
vào hai tai bằng nhau, nên câu nó nói được chỉ là *"có thứ gì đó ở gần"*. Câu Darkwood nói là
*"nó đang ở SAU LƯNG bạn, chếch trái"* — và đó mới là câu bắt người chơi **xoay người lại**.

Cả kỹ năng chơi Darkwood là *định vị bằng tai*. `repo2d` đang có đủ mọi thứ cho kỹ năng ấy trừ
cái tai.

`[ĐỀ XUẤT]` **Một tham số `pan` cho `env()`.** Khoảng 15 dòng:

```
function env(t0, a, d, peak, pan){
  const g = ac.createGain();
  ...
  if (pan == null || !ac.createStereoPanner) { g.connect(master); return g; }
  const sp = ac.createStereoPanner();
  sp.pan.value = clamp(pan, -1, 1);
  g.connect(sp); sp.connect(master);
  return g;
}
```

rồi một hàm dịch toạ độ thế giới sang tai:

```
// Bao nhiêu phần lệch sang tai nào. KHÔNG lấy hết -1..1: một tiếng động nằm gọn trong
// một tai đọc ra là tai nghe hỏng chứ không đọc ra là "nó ở bên phải".
function tai(wx){ return clamp((wx - S.player.x) / (7*TILE), -1, 1) * 0.75; }
```

Chỉ trục **ngang** thôi. Trục dọc không có tai để nghe, và cố nhét nó vào bằng cách lọc tần số
là một thứ không ai đọc ra trên loa laptop.

Gắn vào, theo thứ tự đáng làm: `shuffle`, `breath` (hai cái này là cả lý do sửa), rồi `step` của
quái, `creak`/`drip` của nhà, `shatter`, `thud`, `gunshot`, `strain`/`splinter` của cửa.
**Không** gắn cho: nhịp tim, `score`, `hush`, `tick` của đồng hồ giao hàng, mọi tiếng của HUD —
đó là tiếng trong đầu người chơi, không phải tiếng trong nhà, và đẩy chúng lệch một bên là nói
dối về chỗ chúng phát ra.

Một dòng phải viết vào chú thích, vì nó là cái bẫy: `tai()` đọc `S.player.x`, mà lúc người chơi
đang gục thì **camera nhìn qua mắt đồng đội** (`viewer()`). Lấy sai gốc thì cả căn nhà nghe như
đang lệch, đúng lúc người chơi không làm gì được ngoài nghe.

> Rẻ nhất, ăn nhất. Nó không thêm luật chơi nào, không đụng đến cân bằng, và nó nâng cấp
> **mọi** tiếng động đã có sẵn trong nhà cùng một lúc.

### 3.2. Cái đèn KHÔNG CÓ GIÁ

Ở Darkwood, ánh sáng là thế lưỡng nan trung tâm: bật máy phát thì thấy đường và Bóng không dám
lại gần, nhưng **ánh sáng gọi quái tới**. Hai đường đều sai, và người chơi phải chọn mỗi đêm.

[ĐO TRONG REPO] Ở `repo2d` đèn là **quà tặng một chiều**: luôn bật, không tắt được, không tốn
gì. Chỗ duy nhất người chơi từng mất đèn là bị Tượng lấy (`p.blindT`) — tức là một hình phạt,
không phải một lựa chọn. Trong khi bảng quái thì đã dựng sẵn cho thế lưỡng nan ấy: **Kẻ bắn và
Kẻ húc có `hear: 0`** — chúng điếc, chỉ thấy; còn Gnome nghe 5 ô, Bom con 4,5 ô.

Nghĩa là luật "tắt đèn thì hai con to không tìm ra bạn, nhưng hai con nhỏ vẫn nghe thấy" **đã
đúng sẵn trong dữ liệu**, chỉ chưa có cái công tắc.

`[ĐỀ XUẤT]` **Tắt đèn** — máy tính bấm `G`, điện thoại thì nhập vào nút Chạy bằng một cú giữ:
- Tắt: nón nhìn co từ `LOS_R = 14 ô` xuống **2,5 ô** (đúng cái vũng sáng dưới chân, thứ `buildLight`
  đã vẽ sẵn). Không tối hẳn — một khung hình đen thui đọc ra là hỏng hình.
- Quái **nhìn** (`d.sight`) mất bạn ở ngoài 2 ô thay vì 9 ô. Quái **nghe** không đổi gì.
- Bước chân trong tối vẫn ồn y như cũ. Chạy trong tối thì `[ĐỀ XUẤT]` ồn **hơn** — không thấy
  đường mà còn chạy là đang liều, và trò này nên trả lời chuyện liều bằng hậu quả chứ không bằng
  cấm đoán.
- Tượng: đứng trong tối với nó là **thua ngay**. Đó chính là "Bóng" của Darkwood, và luật ấy
  `repo2d` đã có, chỉ cần không cho cái công tắc mới phá nó.

Thế lưỡng nan thành ra: *tắt đèn để đi qua hành lang có Kẻ bắn, nhưng đi mù thì không thấy món
đồ, không thấy cái bẫy, và nếu căn phòng ấy có Tượng thì bạn vừa tự kết liễu mình.*

### 3.3. Ván chơi PHẲNG — chưa có nhịp ngày/đêm

Nhịp của Darkwood là một cái răng cưa: **chuẩn bị → bị vây → nhẹ nhõm → chuẩn bị**. Nỗi sợ cần
cái nhẹ nhõm ấy; sợ đều một mức trong hai mươi phút thì đến phút thứ tám nó thành nền.

[ĐO TRONG REPO] `repo2d` là một đường dốc lên đều rồi hết: vào nhà → khuân → đủ chỉ tiêu → đạp
nút (`EXTRACT_HOLD = 3` giây) → về xe. Đúng **một** đỉnh, và nó nằm ở cuối.

Không bê ngày/đêm sang được — cả ca trực vốn đã là một đêm. Nhưng cái **cấu trúc** thì bê được,
và có một chỗ nối sẵn, hợp chủ đề đến mức gần như tự viết: **lòng tham**.

`[ĐỀ XUẤT]` **Căn nhà thức dậy theo số tiền bạn đã lấy.** Ba nấc, đo bằng
`pad.value / pad.quota` cộng giá trị đang ôm trên người:

| Nấc | Mốc | Nhà đổi gì |
|---|---|---|
| **Ngủ** | < 40% chỉ tiêu | Như bây giờ. Nhà cọt kẹt 7–18 giây một lần. |
| **Cựa** | 40–99% | Nhịp cọt kẹt xuống 4–9 giây. Quái tuần rộng hơn (`relocateFoe` kéo gần lại một nấc). Lớp DRONE vào sớm hơn, ở mức dread thấp hơn. |
| **Thức** | đã đạp nút / đủ chỉ tiêu | Mọi con đang ngủ dậy hết. Đây đã là luật thật rồi — `completePad()` gọi `makeNoise(pad, EXTRACT_NOISE_R, 2.2)` — chỉ chưa được **nói ra**: cần một cú hụt tiếng rồi một lớp mới vào, để người chơi NGHE thấy căn nhà vừa đổi trạng thái. |

Cái nhẹ nhõm — nửa còn lại của răng cưa — đã có sẵn và đang bị phí: **trạm dịch vụ**. Sảnh sáng
trưng giữa hai căn nhà tối chính là "ban ngày" của trò này. `[ĐỀ XUẤT]` kéo dài nó thêm vài giây
im lặng hẳn trước khi màn sau bắt đầu, thay vì cắt thẳng.

### 3.4. Nhà KHÔNG TỰ CỰA QUẬY

Câu của người làm Darkwood — *"nghe hoặc thấy đồ vật chuyển động mà không biết cái gì gây ra"* —
là cột duy nhất trong bảy cột mà `repo2d` **chưa chạm tới chút nào**.

[ĐO TRONG REPO] Nhà có tự phát tiếng (`SFX.creak`, `SFX.drip`, 7–18 giây một lần), nhưng tiếng
ấy **không phát ra từ đâu cả** — không toạ độ, không nguyên nhân, và (xem 3.1) không cả hướng.
Không có vật nào trong nhà tự chuyển động bao giờ.

`[ĐỀ XUẤT]` Ba việc, xếp theo độ rẻ:

1. **Tiếng nhà có chỗ phát.** Chọn một ô sàn **đã đi qua, đang không nhìn thấy, cách 4–9 ô**,
   phát `creak`/`drip` ở đó — có `pan` theo 3.1. Gần như miễn phí, và nó biến một tiếng ồn nền
   thành một địa điểm.
2. **Một cánh cửa tự mở.** Hệ cửa đã có sẵn cả bản lề lẫn tiếng (`SFX.hinge`). Mỗi ca một lần,
   ở một phòng đã dọn xong và đang không ai nhìn: một cánh cửa thường **tự đẩy ra**, kèm tiếng
   bản lề đúng chỗ nó đứng. Không có con nào đẩy nó cả. Đó là toàn bộ ý đồ.
3. **Đồ đổi chỗ sau lưng.** Một món `loot` chưa nhặt, trong phòng đã đi qua và đang không nhìn
   thấy, **dịch đi một ô** — hoặc đổ xuống sàn kèm `SFX.thud`. Người chơi quay lại và thấy căn
   phòng mình nhớ không còn giống thế nữa. Rủi ro: đừng để nó dịch món đồ vào chỗ không với tới
   được, và đừng đụng vào món đã đặt lên bệ.

Luật chung cho cả ba, và phải viết vào mã: **không bao giờ xảy ra trong tầm nhìn**, cùng đúng
cái luật `relocateFoe()` đã theo. Thấy cái cửa tự mở trước mắt là một lỗi đồ hoạ; nghe nó mở
sau lưng rồi quay lại thấy nó đang mở là cả cột thứ ba.

### 3.5. (nhỏ) Nhà KHÔNG NHỚ

Ở Darkwood, hầm trú của bạn bị xâm nhập: đi về thấy đồ đã đổi chỗ. Ở `repo2d` mỗi màn là một căn
nhà mới toanh, nên không có chỗ cho "nhớ" — trừ **chính chiếc xe tải**. `[ĐỀ XUẤT]` rẻ nhất trong
cả bài: một lần trong ca, khi quay về xe, **cửa thùng xe đang mở** dù bạn nhớ rõ mình đã đóng.
Không có gì trong xe mất. Không có con quái nào ở đó. Không giải thích gì cả — đúng cột thứ tám.

---

## 4. Ba thứ **không** nên bê từ Darkwood sang

1. **Sát thương do đứng trong tối (Bóng).** `repo2d` đã có Tượng, và Tượng đắt hơn: nó là một
   câu đố về ánh sáng chứ không phải một cái đồng hồ trừ máu. Thêm Bóng là hai thứ trả lời cùng
   một câu, và cái rẻ hơn sẽ nuốt cái đắt hơn.
2. **Ảo giác / thanh tỉnh táo.** Nó đòi người chơi tin vào những gì màn hình nói **rồi** phát
   hiện màn hình nói dối. Một ca trực dài 10–15 phút không đủ chỗ để dựng lòng tin ấy, và nói dối
   người chơi trong một trò mà thông tin vốn đã khan hiếm thì đọc ra là bug.
3. **Không giải thích gì cả, áp cho luật chơi.** Darkwood giấu **cốt truyện**; nó không giấu
   chuyện bấm nút nào thì mở cửa. `repo2d` có chỉ tiêu, có bệ, có đồng hồ — giấu mấy thứ đó đi
   thì không đáng sợ hơn, chỉ khó chơi hơn. Giấu **cái gì đang ở trong nhà** thì có.

---

## 5. Thứ tự làm

| # | Việc | Công | Được gì |
|---|---|---|---|
| 1 | **Âm thanh có hướng** (3.1) | ~1 buổi | Nâng cấp mọi tiếng động đã có. Không đụng luật chơi nào. |
| 2 | **Tiếng nhà có chỗ phát** (3.4.1) | vài dòng, sau khi có #1 | Tiếng ồn nền thành địa điểm. |
| 3 | **Tắt đèn** (3.2) | ~1 buổi + cân bằng | Thế lưỡng nan trung tâm. Cần chơi thử kỹ. |
| 4 | **Cửa tự mở** (3.4.2) | nửa buổi | Cột duy nhất còn trống, trả bằng đúng một sự kiện mỗi ca. |
| 5 | **Nhà thức dậy ba nấc** (3.3) | 1–2 buổi | Cho ván một cái răng cưa thay vì một cái dốc. |
| 6 | Đồ đổi chỗ (3.4.3), cửa thùng xe (3.5) | nhỏ | Gia vị. Làm sau cùng, và làm ít. |

Cả sáu việc **không cần một nút bấm mới nào** trừ việc #3 — đúng luật C2 đã ghi trong
`RESEARCH.md`: *"một giai đoạn đề xuất thêm đầu vào thứ tư thì mặc định là không"*. Việc #3 xin
một phím trên máy tính (`G`) và một cú giữ trên điện thoại; nếu không muốn trả cái giá đó thì
bỏ #3, năm việc còn lại vẫn đứng độc lập.

---

## Nguồn

- Bryant Francis, *How Darkwood's visibility mechanics create a new kind of horror*, Game Developer — https://www.gamedeveloper.com/design/how-i-darkwood-i-s-visibility-mechanics-create-a-new-kind-of-horror (hai câu trích của Gustaw Stachaszewski, Acid Wizard Studio)
- Spencer Johnson, *Darkwood and the Horror of the Top-Down View*, Medium — https://medium.com/@spencer2457/darkwood-and-the-horror-of-the-top-down-view-281a4b9c4c9f (270° không được tính đến; ngoài tầm nhìn là đen rỗng chứ không thành viền)
- Sydney Stoddard, *On Darkwood and Well-Crafted Horror Games* — https://sydneystoddard.com/blog/on-darkwood-and-well-crafted-horror-games (tầm nhìn đổi theo môi trường và giờ trong ngày; nhịp ngày/đêm; game không giải thích gì)
- *Darkwood Useful Tips and Hidden Mechanics Guide*, SteamAH — https://steamah.com/darkwood-useful-tips-and-hidden-mechanics-guide/ (chạng vạng 19:30, đêm 20:00, bật máy phát 19:40; ánh sáng lọt ra ngoài thì gọi quái)
- *How to Survive the Night in Darkwood*, Gamer Journalist — https://gamerjournalist.com/how-to-survive-the-night-in-darkwood/ (Bóng hiện ra khi đứng lâu trong tối, không đánh lại được; quái đằng nào cũng tới)
- *Darkwood is a PS4 survival horror that favours creepy atmosphere over cheap jump scares*, PlayStation.Blog — https://blog.playstation.com/archive/2019/05/01/darkwood-is-a-ps4-survival-horror-that-favours-creepy-atmosphere-over-cheap-jump-scares
- Lewis Cavallo, *Atmosphere and Tone in Darkwood*, Medium — https://medium.com/@Lewis_Cavallo/atmosphere-and-tone-in-darkwood-5ef0d0f84c94 (lớp trầm chỉ vào khi đêm xuống)
- Luận văn, *Examining the role of soundscapes for player experience*, DiVA — https://www.diva-portal.org/smash/get/diva2:1766182/FULLTEXT01.pdf (Darkwood hiếm khi dùng im lặng; tiếng nền luôn chạy để người chơi không thấy mình một mình)

Mọi số `[ĐO TRONG REPO]` đếm tại `games/repo2d/game.js`, commit `4104ce0`, ngày 2026-09-11.
Phép đo độ sáng ở mục 2 chạy bằng Chromium 900×1200, màn 3, hạt giống 777: đọc trung bình 5×5
điểm ảnh quanh thân một Kẻ bắn đứng cách 4 ô sau lưng người chơi, sau khi `m.reveal` đã tắt.
