# Robbery Bob — hồ sơ nghiên cứu cho `repo2d` và `repo-squad`

Game gốc: **Robbery Bob** (Level Eight, Thuỵ Điển; Chillingo phát hành). iOS 2012-05-03,
Android 2012-10-24. Bản hai — **Robbery Bob 2: Double Trouble** — ra 2015-06-03.
Franchise được bán cho **DECA Games** khoảng 2021 khi Level Eight đóng cửa.
Thể loại: stealth top-down, chạm để đi, một tay, phiên chơi 1–3 phút.

Tài liệu này **không** phải đề xuất làm lại Robbery Bob. Nó trả lời đúng một câu hỏi:
*trong bốn hệ thống làm nên Robbery Bob, cái nào lắp được vào luật đã có của `repo2d`
và `repo-squad`, và lắp vào đâu.*

Quy ước đánh dấu:
- không dấu — **có nguồn**, dẫn ở cuối bài.
- `[ĐỀ XUẤT]` — thiết kế do tài liệu này nghĩ ra, **không** có trong game gốc.
- `[ĐO TRONG REPO]` — số đếm trực tiếp từ mã nguồn trong repo này, ngày 2026-08-28.

Mọi tham chiếu `game.js:NNN` là `games/repo2d/game.js` tại commit `2a45561`.

---

## 1. Robbery Bob chạy bằng gì

Bốn hệ thống, không hơn:

| Hệ thống | Luật |
|---|---|
| **Nón nhìn** | NPC và camera đều có nón. NPC tuần tra theo lộ trình viết tay: đi, dừng, quay — chu kỳ đoán được nhưng khó thuộc. Camera gắn tường, quét một cung cố định, nón xanh chuyển **đỏ** khi bắt được, và nó **xoay theo Bob kể cả khi Bob đã nấp sau tường**. Camera không nhìn xuyên tường. Mặc disguise thì camera không báo động. |
| **Thanh nghi ngờ** | Bước vào nón là thanh bắt đầu đầy. Chạy khỏi tầm **trước khi** thanh đầy thì thoát. Thanh đầy = bị bắt, về checkpoint gần nhất — **không** mất cả màn. |
| **Tiếng ồn theo bậc** | Rón rén gần như không ồn; chạy thì rất ồn. Mỗi hành động có **bán kính riêng**. Quái nghe thấy thì đi về phía tiếng động và **lùng khu đó**. Cửa, sàn cọt kẹt cũng gây tiếng. |
| **Chỗ nấp** | Tủ, giỏ giặt, thùng rác, bồn cầu, thùng nước, hộp, chậu cây, khe sàn. Đến gần, bấm nút, chui vào; NPC đi ngang cũng không thấy. Đây là **van xả áp**: đang bị đuổi mà thanh chưa đầy thì vẫn kịp chui vào và thoát. |

Ngoài bốn cái đó:

- **Dấu vết.** Giẫm sơn thì để lại dấu chân trong một khoảng thời gian. NPC thấy dấu thì
  **nghi ngờ và lần theo** — dùng để nhử họ đi chỗ khác. Riêng Alien thì *bị hút* theo dấu chân,
  khác mọi NPC còn lại.
- **Ba sao cuối màn.** Chấm theo tốc độ và độ sạch. Ba sao = lấy hết loot phụ + xong mục tiêu chính
  + thoát ra mà **không bị phát hiện lần nào**.
- **Tiền.** Nhặt loot ra coin, mỗi món ra **số ngẫu nhiên** (cố ý, để chặn farm).
- **Đồ tiêu hao.** Đồ chơi lên dây (gây tiếng, làm quái rối), Noisemaker (gây tiếng — *vô dụng với
  Alien vì Alien không theo tiếng*), thuốc tàng hình (đi xuyên qua quái), mìn dịch chuyển
  (làm quái biến mất), nước tăng lực (thể lực vô hạn + chạy nhanh hơn trong chốc lát),
  bánh donut độc, chìa khoá cầu vồng, Shadow Bob.
- **Trang phục đổi luật, không chỉ đổi số.** Jailbird nâng cấp thì **tăng tầm nhặt đồ**.
  Disguise thì camera không báo động. Secret Suit mở bằng 20 token.
- **Secret Mission — map cũ + một luật lạ.** Secret Sam giao lại **màn đã chơi rồi**, gắn thêm
  đúng một luật:
  - *Sleepy Bob* — thanh năng lượng tụt liên tục, tụt nhanh hơn nếu không đứng yên hoặc nếu chạy.
  - *Booby Trap* — cầm món chính lên là để lại **dấu chân tím** và gây tiếng gọi quái tới, phải chạy thoát.
  - *Itchy Secrets* — chơi trong lúc đang cảm, hắt hơi ngoài ý muốn.

  Đủ 20 nhiệm vụ thì được Super Secret Suit.

---

## 2. `repo2d` đã có gì rồi

Đọc mã trước khi đề xuất, và hoá ra ba trong bốn hệ thống đã có mặt một phần:

| | Trạng thái trong `repo2d` |
|---|---|
| Nón nhìn | **Có, và có vẽ ra.** `FOE_CONE_HALF = 1.1` rad, cùng con số mà `stepMonsters` dùng để dò (`game.js:3072`). Nón được vẽ hổ phách khi đang nhìn, **đỏ** khi đã bắt được, clip theo đúng bức tường mà phép dò dùng (`game.js:7040-7054`, thêm 2026-08-27). Đây gần như đúng luật camera của Robbery Bob. |
| Tiếng ồn theo bậc | **Có, bốn bậc:** đứng yên 0 · rón rén 0.25 · đi 1 · chạy `RUN_NOISE = 2.6` · nước rút `RUSH_NOISE = 3.0` (`game.js:6381`). Vòng nghe được vẽ **đúng bằng tiếng đang gây ra**, không phải bằng bán kính tối đa (`game.js:7058`) — chi tiết này đúng và nên giữ. |
| Thanh nghi ngờ | **Không có.** Phát hiện là nhị phân, xem mục 3.1. |
| Chỗ nấp | **Không có.** Xem mục 4 — cả một mục riêng. |
| Trạng thái lùng | **Không có.** `hunt` tồn tại nhưng chỉ dùng cho "hết ca, đứng vòng quanh xe tải" (`game.js:3095-3101`). |
| Nguy hiểm tĩnh (camera) | **Không có.** Mọi mối đe doạ trong nhà đều biết đi. |
| Chấm sao cuối màn | **Không có.** Chỉ có đủ / không đủ chỉ tiêu. |
| Dấu vết | **Không có**, nhưng luật vỡ đồ theo xung lực đã có sẵn — xem 3.4. |

---

## 3. Bốn thứ đáng lấy, xếp theo giá trị trên công sức

### 3.1. Thanh nghi ngờ — khoảng cách lớn nhất giữa hai game

Hôm nay (`game.js:3070-3084`):

```js
let detects = false;
if (d.sight > 0 && dist < d.sight*TILE && losClear(...)){
  const a = Math.abs(angDiff(...));
  if (a < 1.1 || dist < 3*TILE) detects = true;
}
if (!detects && d.hear > 0 && p.noise > 0 && dist < d.hear*TILE*p.noise*0.6) detects = true;
if (detects){ ...; m.alert = 2.6; m.tx = p.x; m.ty = p.y; m.lost = 0; }
```

Vào nón là `alert = 2.6` **ngay lập tức**, kèm sting và rung màn hình. Không tồn tại khoảnh khắc
"suýt bị thấy" — mà đó chính là toàn bộ cảm giác chơi của Robbery Bob.

`[ĐỀ XUẤT]` Thêm `m.susp` chạy 0→1. Tốc độ đầy tỉ lệ thuận với: gần, nằm giữa nón (chứ không phải
rìa nón), và mức `p.noise`. Chạm 1 thì mới `chase`. Mất LOS thì tụt dần. Phần hiển thị gần như
miễn phí: nón đã có hai màu hổ phách/đỏ, chỉ cần một trạng thái ở giữa.

### 3.2. Cho mọi con nghe được

`[ĐO TRONG REPO]` Bảng `MONSTERS` (`game.js:829-836`):

| Con | `sight` | `hear` |
|---|---|---|
| Kẻ đi tuần | 7.5 | **0** |
| Kẻ nghe | 0 | 9.0 |
| Kẻ bám | 8.5 | **0** |
| Kẻ nổ | 6.5 | 3.0 |
| Kẻ nặng | 6.0 | 6.0 |
| Kẻ húc | 9.0 | **0** |

Ba trên sáu con **điếc hoàn toàn**. Nghĩa là ở phần lớn các phòng, chạy nước rút không tốn gì
ngoài thể lực. Robbery Bob thì mọi thứ trong nhà đều nghe, chỉ khác bán kính.

`[ĐỀ XUẤT]` Cho ba con kia `hear: 2.5–3`. Bốn bậc ồn đã dựng sẵn bỗng có giá trị ở khắp nhà chứ
không chỉ khi gặp Kẻ nghe. Đây là thay đổi **một dòng mỗi con** và có sức nặng lớn nhất trên
mỗi ký tự sửa.

### 3.3. Camera an ninh

`[ĐỀ XUẤT]` Nón quét cố định gắn tường, không gây sát thương, chỉ đẩy `susp` của mọi con trong
phòng. `repo2d` hiện không có nguy hiểm tĩnh nào. Camera là **luật đọc phòng**, đúng vai trò mà
Kẻ húc đang làm với *hành lang* — xem chú thích `STOCK_ALWAYS` ở `game.js:970-975`, nơi dự án đã
tự ghi ra nguyên tắc "một con quái đáng có là con thay đổi cách đọc một mảng hình học".

### 3.4. Vỡ đồ thì để lại vệt

Robbery Bob: giẫm sơn → để dấu → NPC lần theo. `repo2d` đã có luật vỡ đồ theo xung lực.

`[ĐỀ XUẤT]` Nối hai thứ: **món vỡ để lại mảnh trên sàn; con đi tuần đi ngang thì chuyển sang lùng
tại chỗ đó.** Hôm nay vỡ đồ chỉ mất tiền. Như vậy nó mất tiền *và* để lại dấu — và người chơi phải
quyết định có quay lại dọn không. Cần trạng thái lùng ở mục 4.3 mới làm được.

---

## 4. Chỗ nấp — đặc tả đầy đủ

### 4.0. Vì sao không dùng lại được prop có sẵn

Ý đầu tiên là gán nghĩa "chui vào được" cho `P_CRATE` / `P_SHELF` đã có (`game.js:70`). Đếm thử
thì ý đó không sống nổi.

`[ĐO TRONG REPO]` Số ô prop trong 9 template của `ROOMS`:

| Phòng | Thùng `C` | Kệ `S` |
|---|---|---|
| Nhà kho | 8 | 52 |
| Hành lang | 0 | 44 |
| Thư phòng | 0 | 24 |
| Bếp | 6 | 0 |
| Phòng khách | 0 | 8 |
| Phòng ngủ | 0 | 8 |
| Phòng ăn | 0 | 8 |
| Sân trong | 0 | 0 |
| Phòng tắm | 0 | 0 |
| **Tổng** | **14** | **144** |

Một căn nhà là lưới 3×3 dùng cả 9 template, mỗi cái đúng một lần (`game.js:1560-1576`), nên nó có
**144 ô kệ và 14 ô thùng**.

- **Kệ thì quá nhiều.** Mỗi phòng mười mấy chỗ nấp thì không phòng nào còn nguy hiểm.
- **Thùng thì quá ít *và* dồn cục.** 14 cái nằm gọn trong 2 trên 9 phòng; 7 phòng còn lại không có gì.

Điều đó hoá ra lại đúng hướng thiết kế: chỗ nấp trong Robbery Bob **luôn có hình dạng riêng** —
thùng rác, tủ quần áo, giỏ giặt — vì người chơi phải *đọc được từ xa* rằng "cái đó chui vào được".
Một cái kệ vừa là tường vừa là chỗ nấp thì không ai đọc được phòng nữa.

**Kết luận: chỗ nấp phải là một loại prop mới do generator rải, không phải một prop cũ được gán
thêm nghĩa.**

### 4.1. Sinh ra

`[ĐỀ XUẤT]` Thêm `P_LOCKER = 6` vào `game.js:70`, một nhánh vẽ trong `paintProp`
(`game.js:2170-2185`), và một pass trong generator rải **1–2 cái mỗi phòng**, đặt ở ô sàn kề tường,
tránh phòng có xe tải.

Pass đó viết đúng hai dòng như chỗ shop đang làm ở `game.js:4286-4288`:

```js
S.grid[i] = PROP; S.deco[i] = P_LOCKER;
```

Con số 1–2 là cố ý: mỗi phòng có **một** lối thoát chứ không phải hai. Chỗ nấp phải là thứ phải
chạy tới, không phải thứ luôn ở trong tầm tay.

### 4.2. Vào, ra, và luật khi đang nấp

**Không thêm nút.** `hud.grab` vốn đã là nút ngữ cảnh với 6 nhãn (`game.js:7891-7893`), và mọi
đường vào đều đi qua đúng một hàm `pickUp()` (`game.js:2661`) — bàn phím, nút HUD và test đều
gọi nó (`game.js:5817`). Thêm hai nhãn **"Nấp" / "Ra"** và một nhánh trong `pickUp`, đặt **sau**
`nearestLoot` để đứng cạnh món đồ vẫn nhặt được: chỗ nấp là thứ người chơi chủ động đi tới,
món đồ thì không.

Luật khi đang nấp `[ĐỀ XUẤT]`:

- **Không bị `detects`** (`game.js:3071-3076`), trừ các trường hợp ở 4.3.
- **Không đi được.** Đây là cái giá thật: mỗi giây nấp là một giây không khuân đồ, mà đồng hồ
  chỉ tiêu vẫn chạy.
- `p.noise = 0` — vốn đã đúng, vì `p.noise` chỉ khác 0 khi `moving` (`game.js:6381`).
- **Nón đèn co lại rất hẹp** (đang nhìn qua khe). Đây là chỗ hệ âm thanh đã dựng sẵn được dùng
  đúng vai: `FOE_HEARD_R = 7*TILE` và `FOE_BREATH_R = 3.2*TILE` (`game.js:510-511`) nghĩa là khi
  nấp, người chơi **nghe** thấy nó đi qua và nghe thấy nó thở mà không thấy nó. Đó là khoảnh khắc
  hay nhất mà cả hệ audio hiện chưa có dịp dùng tới.
- **Hồi thể lực nhanh hơn.** Cho chỗ nấp một công dụng ngoài lúc khẩn cấp; nếu không nó là nút
  chỉ bấm khi sắp chết.

**Ôm đồ thì sao — đây là quyết định thiết kế chính.** Cấm nấp khi `p.held` là dễ nhất và có tiền lệ
sẵn (leo xe máy đã cấm như vậy, `game.js:2621`), nhưng nó giết mất giá trị của tính năng: nửa nguy
hiểm của vòng lặp chính là lúc đang vác đồ về bệ.

`[ĐỀ XUẤT]` Ngược lại: **cho nấp khi đang ôm, và lấy `mass` làm mức lộ.** `carryMass(p)` đã có sẵn
(`game.js:2324`): món nhỏ thì kín, món to thì thò ra ngoài và con quái đi ngang sẽ thấy. Như vậy
"vác món hai triệu về" là một quyết định có rủi ro riêng, chứ không phải một luật cấm.

### 4.3. Cái phá được nó — phần bắt buộc phải làm cùng

Nếu chỉ làm chỗ nấp thôi thì nó là **nút thắng ván**. Đọc `game.js:3093-3116`: chỉ có `chase`
(đang thấy), `hunt` (chỉ dùng khi hết ca) và `patrol` (lang thang ngẫu nhiên). `m.alert` tụt về 0
sau 2,6 giây rồi con quái rơi thẳng vào lang thang. Nghĩa là hôm nay, **nấp 3 giây là cả nhà quên
bạn.**

Ba luật, tối thiểu `[ĐỀ XUẤT]`:

1. **Mất dấu thì đi tới chỗ thấy lần cuối.** `m.tx/m.ty` đã được ghi đúng lúc phát hiện
   (`game.js:3082`); thiếu là một trạng thái `search` giữ nguyên toạ độ đó thay vì roll lại
   `m.tx` ngẫu nhiên.
2. **Đang tìm thì mở nắp tủ.** Con ở `search` đi ngang một `P_LOCKER` trong ~1,5 ô thì kiểm tra;
   có người bên trong là lôi ra và `chase` lại.
3. **Nó phải thấy bạn chui vào.** Nếu lúc bấm nấp mà con quái đang có LOS tới cái tủ, nó đi thẳng
   tới đó. Chỉ khi cắt được tầm nhìn **trước** thì nấp mới thoát.

Luật 3 làm chỗ nấp và thanh nghi ngờ (3.1) trở thành **cùng một tính năng**: chạy khỏi nón trong
lúc thanh đang đầy, vòng qua góc, chui vào tủ. Đó đúng là câu chuyện Robbery Bob kể mỗi màn.
**Hai thứ này nên ra cùng lúc; làm riêng thì cái nào cũng nửa vời.**

### 4.4. Kẻ bám là con phá chỗ nấp

`[ĐỀ XUẤT]` Cho **Kẻ bám** (`sight:8.5, hear:0`, `game.js:832`) luôn kiểm tra tủ, kể cả khi không
ở `search`. Mỗi con quái trong game này đang vô hiệu hoá một mảng hình học — Kẻ húc làm hành lang
thành thứ không đứng vào được. Kẻ bám nên là con biến chỗ nấp thành thứ không tin được: ván có nó
là ván phải chạy thật.

### 4.5. Hai thứ hay bị quên

- **Bot.** `bot.js` có `ST.FLEE` (dòng 268, 279, 304). Nếu nhánh đó không biết chui tủ thì test tự
  động (`docs/tests/browser/test_repo2d.py`, 32 checks) sẽ không bao giờ chạm tới tính năng này,
  và nó sẽ hỏng âm thầm ở lần refactor sau.
- **Debug API.** `state()` ở `game.js:9183-9228` là mặt tiếp xúc của test. Cần thêm `hidden` cho
  player và `checking` vào mảng `foes`. Không có hai trường đó thì không viết được kiểm tra
  *"một con đã mở tủ và không tìm thấy ai"* — tức là luật quan trọng nhất của tính năng không
  được test bảo vệ.

### 4.6. Số để khởi điểm

`[ĐỀ XUẤT]` Chưa cái nào được playtest; đây là chỗ bắt đầu chỉnh, không phải kết luận.

| Tham số | Giá trị |
|---|---|
| Tủ mỗi phòng | 1–2 |
| Tầm bấm nấp | 1,2 ô |
| Thời gian chui vào | 0,45 s (đủ để một con đang đuổi kịp tới nơi) |
| `search` kéo dài | 8–12 s trước khi về `patrol` |
| Tầm quái kiểm tra tủ | 1,5 ô |
| Ngưỡng lộ khi ôm đồ | kín hoàn toàn dưới ~40% `carryMass` tối đa; lộ hẳn trên ~75% |

### 4.7. Thứ tự làm

1. Prop + generator + vẽ
2. Nhánh trong `pickUp` và nhãn nút
3. Luật khi nấp
4. **Trạng thái `search` + kiểm tra tủ**
5. Kẻ bám
6. Bot + trường debug

Bốn bước đầu là một buổi. Bước 4 là phần lớn công việc, và cũng là phần quyết định tính năng này
hay hay hỏng.

---

## 5. `repo-squad` — thứ đáng giá nhất là hệ Secret Mission

`repo-squad` có 9 map, vòng tầng 3 → 4 → 5 rồi lặp lại. Nội dung lặp lại hiện chỉ được làm mới
bằng "quái khoẻ hơn và thêm giống quái mới".

Robbery Bob 2 giải đúng bài toán đó bằng Secret Mission: **map cũ + đúng một luật lạ**, không cần
map mới. Và `repo2d` đã có sẵn cái móc để cắm vào — `S.noiseOverride` (`game.js:6383`) ép thẳng
mức ồn của người chơi, tức là *Itchy Secrets* và *Booby Trap* làm được mà **không phải sửa vòng
lặp phát hiện**.

`[ĐỀ XUẤT]` Kèm theo đó là **chấm 3 sao mỗi ca**: đủ chỉ tiêu / không vỡ món nào / không bị phát
hiện lần nào.

> **Lưu ý một điểm:** Robbery Bob chấm sao có tính **tốc độ**, nhưng map của nó viết tay nên hai
> lần chơi là như nhau. Nhà trong `repo2d`/`repo-squad` sinh ngẫu nhiên, nên tiêu chí thời gian
> **không công bằng** giữa hai ván. Ba tiêu chí trên thì an toàn.

Sao cho `repo-squad` một lý do chơi lại map đã qua, và cho hệ nhiệm vụ ngày/tuần một thứ để đo
ngoài "số ca đã chạy".

### 5.1. Trang bị nên đổi luật, không chỉ đổi số

Bảng chỉ số hiện là 8 con số phẳng (`games/repo-squad/data/content.js:21-28`: atk, hp, spd, carry,
cd, luck, eye, grit) và bộ 2/4 món cũng chỉ cộng phần trăm.

Robbery Bob thì trang phục **đổi luật**: Jailbird nâng cấp tăng *tầm nhặt đồ*; mặc disguise thì
camera không báo động.

`[ĐỀ XUẤT]` Cho vài bộ một hiệu ứng luật thay vì một con số:
- **Canh Gác** 4 món → camera không báo động.
- **Đồ Lăng** → tiếng bước chân tụt một bậc.

Bảng chỉ số nào rồi cũng giống bảng chỉ số nào; luật mới là thứ người chơi kể lại cho nhau.

---

## 6. Thứ **không** nên bê nguyên

Robbery Bob dựng map thủ công từng căn nhà, và tuần tra là **lộ trình viết tay** nên đoán được
theo chu kỳ — người chơi học thuộc nhịp rồi lách qua. `repo2d` sinh nhà theo lưới 3×3 phòng và
quái đi tuần ngẫu nhiên (`game.js:3103-3116`): không có chu kỳ nào để học.

Thanh nghi ngờ và chỗ nấp vẫn hoạt động tốt trên map ngẫu nhiên. **Lộ trình tuần tra cố định thì
không** — nó chỉ đáng nếu chuyển sang map viết tay, mà đó là một quyết định lớn hơn nhiều so với
mọi mục trong tài liệu này.

Hai thứ khác cần cân nhắc chứ không lấy thẳng:
- **Checkpoint.** Robbery Bob bị bắt thì về checkpoint, không mất cả màn. `repo2d` chết là hết ca.
  Đổi hẳn sang checkpoint sẽ làm nhẹ toàn bộ sức nặng của một ca trực; nếu muốn nhẹ tay hơn thì
  bán "hồi sinh" ở shop giữa màn là hướng ít phá luật hơn.
- **Coin ngẫu nhiên mỗi món.** Robbery Bob cố ý ngẫu nhiên hoá để chặn farm. `repo2d` thì giá món
  đồ là thông tin người chơi dùng để **quyết định vác cái nào** — ngẫu nhiên hoá sẽ phá chính cái
  quyết định đó. Không lấy.

---

## Nguồn

- [Game Mechanics — Robbery Bob Wiki (Fandom)](https://robberybob.fandom.com/wiki/Game_Mechanics)
- [Secret Mission — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Secret_Mission)
- [Security Camera — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Security_Camera)
- [Robbery Bob 2 — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Robbery_Bob_2)
- [Category: Utilities — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Category:Utilities)
- [Aliens — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Aliens)
- [Loot — Robbery Bob Wiki](https://robberybob.fandom.com/wiki/Loot)
- [Robbery Bob — Wikipedia](https://en.wikipedia.org/wiki/Robbery_Bob)
- [Robbery Bob 2: Double Trouble — Wikipedia](https://en.wikipedia.org/wiki/Robbery_Bob_2:_Double_Trouble)
- [Robbery Bob 2 — NamuWiki](https://en.namu.wiki/w/Robbery%20Bob%202)

Ghi chú về nguồn: Fandom và NamuWiki chặn truy cập trực tiếp (HTTP 402/403) tại thời điểm viết,
nên nội dung wiki ở trên lấy qua kết quả tìm kiếm chứ không phải đọc thẳng trang. Các con số
`[ĐO TRONG REPO]` thì ngược lại — đếm trực tiếp từ mã nguồn và kiểm chứng được bằng cách chạy lại.
