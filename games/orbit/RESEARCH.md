# Factorio: Space Age — hồ sơ nghiên cứu cho một game dây chuyền trên màn hình dọc

Game gốc: **Factorio: Space Age** (Wube Software), phát hành **21/10/2024** cùng bản lõi 2.0.7.
Thêm 4 hành tinh + không gian, hệ **quality** 5 bậc, và **space platform** — tàu tự bay giữa các
hành tinh. Mục tiêu cuối: đưa một tàu ra rìa hệ mặt trời.

Tài liệu này **không** phải kế hoạch port Factorio sang điện thoại. Nó trả lời đúng ba câu:

1. Factorio Space Age thật sự chạy bằng cái gì — cái nào là hạt nhân, cái nào là trang trí.
2. Cái hạt nhân đó gãy ở đâu khi bỏ chuột + bàn phím và ép vào **màn hình dọc, một joystick giữa**.
3. Thay cái gãy đó bằng gì mà vẫn còn là game dây chuyền, chứ không tụt xuống thành game idle.

Quy ước đánh dấu, giống `games/repo2d/RESEARCH.md`:
- không dấu — **có nguồn**, dẫn ở mục 12.
- `[ĐỀ XUẤT]` — thiết kế do tài liệu này nghĩ ra, **không** có trong game gốc.
- `[ĐO TRONG REPO]` — số đếm trực tiếp từ mã nguồn trong repo này, ngày **31/8/2026**.

Thư mục `games/orbit/` và cái tên "Quỹ Đạo" là **id tạm** để có chỗ đặt tài liệu. Đổi tên là sửa
một dòng trong `data/games.js` và đổi tên thư mục.

---

## 0. Chẩn đoán — đừng hỏi "port thế nào", hỏi "cái gì sống sót"

Factorio Space Age dài **dưới 80 giờ với người chơi có kinh nghiệm** — đó là con số Wube tự đặt
làm mục tiêu thiết kế. Một phiên chơi mobile dọc, một tay, là **2–5 phút**. Chênh nhau hai bậc độ
lớn. Nên câu hỏi "làm sao nhét Factorio vào điện thoại" là câu hỏi sai; nó dẫn thẳng tới một bản
Factorio bị bóp, và bản bị bóp đó **đã tồn tại và đã hỏng** — xem mục 2.

Câu hỏi đúng: trong năm trụ của Space Age, trụ nào **không phụ thuộc vào chuột**, và trụ nào chỉ
sống được nhờ chuột. Trả lời được cái đó thì phần còn lại là thiết kế bình thường.

---

## 1. Space Age chạy bằng gì — năm trụ

| Trụ | Luật |
|---|---|
| **Đồ thị vật chất** | Mọi thứ là "vào → máy → ra", nối bằng băng chuyền/ống. Người chơi **xây bằng tay** cái đồ thị đó trên mặt đất. Đây là hạt nhân, và mọi thứ khác treo lên nó. |
| **Bốn hành tinh = bốn loại bài toán** | Wube nói thẳng: "each planet presents different problem types". Mỗi hành tinh có tài nguyên riêng, một cơ chế riêng, và **một gói khoa học riêng làm mặt hàng xuất khẩu chính** — hầu hết dây chuyền trên hành tinh đó tồn tại để ra gói đó. |
| **Thứ tự đi là lựa chọn chiến lược** | "The order in which you exploit the planets is an impactful strategic choice." Không có tuyến bắt buộc sau hành tinh đầu. |
| **Space platform** | Tàu bắt đầu là nền **10×10** với hub ở giữa, mở rộng bằng ghost đặt từ xa (không xây trực tiếp trong không gian), tối đa **200 ô** về phía bắc tính từ hub. Bay giữa các hành tinh theo **lịch trình** với **12 điều kiện chờ**. Trên đường bay: thiên thạch — hứng bằng collector, nghiền ra sắt/đồng/than/nước, và **số lượng lẫn vận tốc thiên thạch tăng tỉ lệ với tốc độ tàu**. Nhanh hơn = nguy hiểm hơn. Hub vỡ = **mất sạch** tàu và mọi thứ trên đó. Hết nhiên liệu giữa đường = trôi chậm về thiên thể gần nhất. |
| **Quality** | 5 bậc: Normal → Uncommon → Rare → Epic → Legendary. Mỗi bậc cộng **+30%** (máu, tốc chế, tầm turret…). Quality module 1 cho **+1%**, module 3 thường **+2,5%**, module 3 legendary **+6,2%**. Trúng một bậc thì **quay tiếp ở 10%** cho tới khi trượt. **Recycler thu lại 25%** đầu vào — vòng recycle-rồi-làm-lại là cách chính leo lên legendary. |

Bốn bài toán, viết gọn:

| Hành tinh | Bài toán trung tâm | Xuất khẩu |
|---|---|---|
| **Vulcanus** | Dung nham vô hạn, nhưng **đất phải giành**: Demolisher — sâu khổng lồ cỡ boss — chiếm từng chunk, giết mới mở được. Tungsten nằm sau chúng. | (khoa học kim loại) |
| **Fulgora** | **Không có mỏ.** Chỉ có scrap, đưa vào recycler ra một rổ ngẫu nhiên: 20% bánh răng sắt, 7% nhiên liệu rắn, 6% bê tông, … 1% quặng holmium. Muốn nguyên liệu cơ bản phải **tháo ngược** đồ phức tạp. Bài toán thật không phải "thiếu", mà là **nghẹt phụ phẩm** — mọi thứ rơi ra phải dùng, cất, hoặc recycle tiếp, nếu không băng chuyền tắc. Điện thì lấy từ chính cái đang doạ mình: mỗi tia sét **1 GJ**. | Electromagnetic |
| **Gleba** | **Đồ hỏng theo đồng hồ.** Timer chạy từ lúc món đồ sinh ra, hết giờ thì hoá thành spoilage; từ vài phút tới 2 giờ. Nutrient — nhiên liệu của Biochamber — hỏng trong **5 phút**. Tồn kho trở thành hành vi SAI. Pentapod đánh hơi spore của chính dây chuyền sinh học mà tới. | Agricultural |
| **Aquilo** | Băng giá: mọi thứ cần **sưởi**. Đại dương ammonia lỏng. | (khoa học lạnh) |

**Chốt mục 1**: cái làm nên Factorio là *đồ thị vật chất người chơi tự xây* (trụ 1) và *bốn ràng
buộc ép bố trí đi theo bốn hướng khác nhau* (trụ 2). Ba trụ còn lại — thứ tự, tàu, quality — là
**meta**, và ba cái đó **không cần chuột**. Ghi nhớ điểm này, mục 5 sẽ dùng.

---

## 2. Cái gãy: 80% thao tác của game dây chuyền là kéo băng chuyền

Không cần đoán, đã có một game làm đúng thí nghiệm này rồi: **Mindustry** — factory + tower
defense, ra mobile từ lâu, cùng thể loại.

Bằng chứng từ chính cộng đồng Mindustry:
- Kéo băng chuyền là **thứ chiếm khoảng 80% những gì bạn làm mỗi phút**, và là **phần ức chế nhất
  khi chơi trên điện thoại**.
- Bản mobile **không có** conveyor pathfinding (bản PC giữ CTRL rồi kéo). Trên mobile phải **giữ
  ngón 1–2 giây ở ô đầu rồi mới kéo**.
- Lời khuyên phổ biến là **chơi trên tablet**, điện thoại thì màn hình quá nhỏ.
- Có issue mở trên repo suggestion về chuyện điều khiển cảm ứng, chưa có giải pháp dứt điểm.

Đây là kết quả âm tính đắt giá nhất trong cả tài liệu này: **giữ nguyên băng chuyền tự do rồi
"tối ưu UI cảm ứng" là con đường đã có người đi và không tới nơi.** Và Mindustry còn được chơi
**ngang màn hình, hai tay**. Đề bài ở đây khắc nghiệt hơn: **dọc, một tay, một joystick giữa**.

Ba lý do vật lý, không phải lý do UI:

1. **Ngón cái che chỗ cần nhìn.** Kéo một đường từ máy A tới máy B nghĩa là ngón tay nằm đúng trên
   đoạn đường đang vẽ. Chuột không có vấn đề này.
2. **Độ chính xác một ô.** Băng chuyền sai một ô là dây chuyền chết, mà lỗi im lặng. Ô 16px trên
   màn 400px logic là dưới ngưỡng chạm tin cậy.
3. **Màn dọc cắt mất chiều ngang.** Nhà máy Factorio mọc theo **mảng vuông**. Khung dọc 9:19,5 cho
   thấy khoảng một phần ba số ô theo chiều ngang so với khung 16:9 cùng zoom. Bố trí vuông không
   đọc được trên khung dọc — muốn thấy nó phải zoom ra tới mức không còn bấm trúng gì.

---

## 3. Pickaxe King Island — cái người dùng chỉ đích danh, và cái đáng lấy

**Pickaxe King Island** (Rogue Union Games), ra 2025 trên cả hai chợ, pixel art, tycoon/farm thư
giãn. Bản App Store đo được: **4,9/5 trên 1,8K lượt đánh giá**, **318,2 MB**, phiên bản 463.2, vẫn
cập nhật (nội dung villager, mine tăng lên **500 tầng**). IAP: bỏ quảng cáo **9,99$**, "Quick Mining
Button" **1,99$**, các gói chìa khoá **0,99$**, gói alchemy **6,99–17,99$**. Quảng cáo **không ép** —
chỉ là tuỳ chọn nhân đôi phần thưởng.

Điều khiển: **kéo một d-pad ảo để điều khiển nhân vật rồi để nó tự làm phần còn lại**; mọi việc còn
lại là chạm/vuốt. Game hỗ trợ **cả dọc lẫn ngang**.

Ba thứ đáng lấy, và một thứ không:

- **Lấy: một ngón cái, một trục.** Ngón cái giữ stick gần như suốt phiên. Mọi thao tác khác là chạm
  rời rạc, làm được trong lúc *đứng yên*. Đây chính là ràng buộc mà mục 5 phải tôn trọng.
- **Lấy: "đến gần rồi nó tự làm".** Người chơi không chọn công cụ, không ngắm. Đứng đúng chỗ là
  hành động xảy ra. Tài liệu `games/stardew/README.md` trong repo này gọi đúng tên nó — "không có
  tool belt, ô trước mặt được viền, nút mang nghĩa của ô đó" [ĐO TRONG REPO].
- **Lấy: mô hình tiền không ép.** Bỏ quảng cáo một lần 9,99$ + nhân đôi tự nguyện.
- **Không lấy: art.** `games/stardew/art/CREDITS.txt` đã ghi rõ — 1.178 frame trong `art/pki/` là
  **rip từ APK bán lẻ của Pickaxe King Island, thuộc bản quyền Rogue Union Games, KHÔNG ĐƯỢC
  SHIP** [ĐO TRONG REPO]. Nó ở đó để test cảm giác. Game mới nếu dùng lại đúng bộ đó thì kế thừa
  nguyên món nợ, và lần này là món nợ thứ hai trên cùng một bộ sprite.

---

## 4. Tiền lệ đã bán được trên màn dọc: Deep Town

**Deep Town: Idle Mining Tycoon** (Rockbite Games) là bản trả lời thương mại cho "dây chuyền trên
màn dọc": đào xuống lòng đất, drilling robot ra quặng, smelter và crafting station chế tiếp, hơn 5
loại nhà xưởng (nung, chế, trang sức, nhà kính, điện), **chạy tiếp khi offline**.

Nó thắng ở đúng chỗ Mindustry thua, và cái giá phải trả rất rõ: **Deep Town bỏ đồ thị.** Máy không
nối vào nhau. Mỗi máy là một hộp độc lập rút từ kho chung và trả về kho chung. Không có băng
chuyền nên không có gì để kéo — nhưng cũng không còn nút thắt cổ chai, không còn throughput, không
còn cái khoảnh khắc "à, chỗ này thiếu một splitter". Cái còn lại là **cây nâng cấp có chủ đề khai
khoáng**.

Hai tiền lệ, hai đầu của cùng một cái thang:

```
Mindustry  ──────────────────────────────────────  Deep Town
giữ đồ thị, giữ băng chuyền                        bỏ cả hai
chơi được trên tablet, ức chế trên phone           chơi được một tay, không còn là factory game
```

**Chỗ chưa ai đứng là khoảng giữa: giữ đồ thị, bỏ băng chuyền.** Đó là chỗ tài liệu này đề xuất
đứng.

---

## 5. `[ĐỀ XUẤT]` Thiết kế: giữ đồ thị, bỏ thao tác kéo

### 5.1 Luật nền — nối bằng hai cú chạm, không kéo

Máy A → chạm → máy B → chạm. Xong. Đường ống tự sinh, tự né chướng ngại, tự vẽ. Không có ô nào
phải bấm trúng, không có ngón tay nào nằm trên đường đang vẽ, không có thao tác nào kéo dài quá
200ms.

Nhưng nếu chỉ có thế thì nó **thoái hoá thành Deep Town**: khoảng cách hết ý nghĩa, bố trí hết ý
nghĩa, và trò chơi bố cục biến mất. Nên nó cần đúng hai ràng buộc, và hai cái này là toàn bộ phần
"game" của hệ thống:

**Ràng buộc 1 — băng thông giảm theo khoảng cách.** Một liên kết chở được `N` món/giây, `N` tụt
theo độ dài đường ống. Nối gần = nhanh. Nối xa = phải nối hai đường song song, hoặc dời máy lại
gần. **Bố trí lại có ý nghĩa, mà không cần vẽ tay một mét băng chuyền.**

**Ràng buộc 2 — mỗi máy có số cổng hữu hạn.** Ví dụ 2 vào, 1 ra ở bậc đầu. Máy thứ tư cần cùng một
nguồn thì không cắm thẳng được nữa — phải dựng một **nhà trung chuyển** (chính là splitter, nhưng
là một toà nhà đặt một lần thay vì một hình vẽ). Cây phân phối vẫn phải nghĩ, vẫn phải nâng cấp,
vẫn là thứ nhìn vào biết ai chơi gọn ai chơi ẩu.

Hai ràng buộc này giữ lại: nút thắt cổ chai, throughput, sức ép bố trí, và cảm giác gỡ rối. Cái
mất đi là **thẩm mỹ của những đường băng chuyền chạy song song** — mất thật, và đó là cái giá phải
trả có ý thức, không phải sơ suất.

### 5.2 Bản đồ mọc theo chiều dọc

Đừng ép mảng vuông vào khung dọc. **Mỗi hành tinh là một cột** — mặt đất ở trên, càng xuống càng
sâu/khó, đúng cách Deep Town dùng khung dọc. Camera cuộn dọc là chuyển động tự nhiên của ngón cái.
Rộng ngang giới hạn ở khoảng **12–16 ô**, đủ để có bố trí, không đủ để lạc.

### 5.3 Luật ngón cái — luật khó nhất, và là luật phải kiểm mỗi lần

> **Việc gì diễn ra LIÊN TỤC thì nằm trên stick. Việc gì RỜI RẠC thì là một cú chạm khi đứng yên.**

- Liên tục: đi, hút quặng ở chỗ đang đứng, nhặt.
- Rời rạc: đặt máy, nối hai máy, mở bảng, chọn công thức, phóng tàu.

Nếu một tính năng nào đó bắt người chơi **vừa giữ stick vừa chạm chính xác**, tính năng đó sai
thiết kế, không phải sai UI. Đây là bài kiểm tra duy nhất áp lên mọi đề xuất về sau.

### 5.4 Layout khung dọc

```
┌─────────────────────────┐
│ tài nguyên · năng lượng │  ← thanh trạng thái, chạm được, không bao giờ che
├─────────────────────────┤
│                         │
│                         │
│      THẾ GIỚI           │  ← ~62% chiều cao; camera cuộn dọc
│      (cuộn dọc)         │
│                         │
│                         │
├─────────────────────────┤
│  [xây]   ( ◉ )   [làm]  │  ← dải ngón cái: stick GIỮA, hai nút hai bên
└─────────────────────────┘
```

Dải ngón cái dưới cùng **thuộc về stick** — chạm vào dải đó chỉ có thể là stick, không bao giờ là
nút. Luật này không phải suy đoán: nó đã được rút ra và ghi lại trong repo này ở
`games/repo2d/game.js:6340-6357` — "the sticks own a band across the bottom of the frame; every
button lives above that band" [ĐO TRONG REPO].

### 5.5 Bốn hành tinh → bốn bài toán, sau khi thu nhỏ

| Hành tinh | Bài toán gốc | `[ĐỀ XUẤT]` bản mobile | Rủi ro |
|---|---|---|---|
| Vulcanus | Dung nham vô hạn, đất phải giành từ Demolisher | Nguyên liệu **vô hạn nhưng bị khoá sau boss**. Mỗi lần mở đất là một trận đánh dùng đúng joystick — tái dùng thẳng thứ repo đã có | Thấp. Đánh boss bằng một stick là thứ `repo2d` và `dragonproj` đã làm chạy |
| Fulgora | Recycle ra rổ ngẫu nhiên, nghẹt phụ phẩm | **Bài toán hay nhất cho mobile.** Đầu vào ngẫu nhiên + kho có trần = người chơi phải quyết định vứt gì. Quyết định rời rạc, hợp một tay | Thấp. Nên là hành tinh thứ hai |
| Gleba | Đồ hỏng theo timer, nutrient hỏng trong 5 phút | **Cẩn thận.** Xem 7.1 | **Cao** — đánh nhau trực diện với offline |
| Aquilo | Mọi máy cần sưởi | Một **tiện ích thứ hai** phải kéo tới mọi máy: hệ thống ống thứ hai chồng lên hệ thứ nhất | Trung bình. Nhân đôi độ rối của lưới nối trên màn nhỏ |

### 5.6 Ba trụ meta lắp vào gần như nguyên vẹn

Đây là phần dễ nhất, và cũng là phần khiến đề bài này *hợp* mobile chứ không chỉ *chịu đựng* được
mobile:

- **Space platform → vòng lặp offline có rủi ro.** Người chơi lắp tàu, đặt lịch, đóng app. Thiên
  thạch va tàu trong lúc offline. Nhanh hơn = nhiều thiên thạch hơn, đúng luật gốc — nên "chỉnh
  thrust" trở thành **cần gạt đánh đổi giữa tốc độ và rủi ro**, do người chơi kéo trước khi tắt
  máy. Mở app ra là xem tàu về được hay không. Đây là cơ chế idle **có quyết định**, không phải
  thanh tiến trình.
- **Quality → hệ hiếm 5 bậc**, thứ người chơi mobile đọc được ngay không cần dạy. Vòng
  recycle-để-nâng-bậc (thu lại 25%) là **sink tài nguyên dài hạn** dựng sẵn, và nó tự nhiên hơn
  mọi cây nâng cấp nhân tạo.
- **Thứ tự hành tinh → nhánh chọn**, giữ nguyên. Chọn đi đâu trước là một cú chạm.

---

## 6. Vòng lặp phiên chơi 3 phút `[ĐỀ XUẤT]`

Ba trạng thái, và trò chơi phải trả lời được cả ba trong một phiên 3 phút:

| Trạng thái | Ngón cái làm gì | Thời lượng |
|---|---|---|
| **Mở app** | Đọc: tàu về chưa, dây chuyền nào tắc, kho nào đầy | 15 giây, không chạm |
| **Gỡ** | Đi tới chỗ tắc, thêm một máy, nối một dây | 60–120 giây, stick + vài cú chạm |
| **Gửi đi** | Đặt lịch tàu, kéo cần thrust, đóng app | 20 giây |

Nếu một phiên không có bước "gỡ" thì game đã tụt thành idle, và bảng ở mục 4 nói rõ nơi nó tụt về.
Đây là chỉ số kiểm tra sức khoẻ của cả thiết kế: **mỗi phiên phải có đúng một nút thắt đáng gỡ.**

---

## 7. Ba chỗ dễ chết

### 7.1 Spoilage đánh nhau với offline

Gleba là cơ chế hay nhất của Space Age và là cơ chế **nguy hiểm nhất** ở đây. Nutrient hỏng trong 5
phút. Người chơi mobile đóng app 8 tiếng. Mở lại thấy toàn bộ dây chuyền sinh học đã thành rác —
đó không phải độ khó, đó là **bị phạt vì có việc phải làm**, và nó là lý do gỡ app.

Ba lối ra, phải chọn một trước khi viết dòng code Gleba đầu tiên:
- (a) **Đóng băng khi offline** — timer chỉ chạy khi app mở. Đơn giản, nhưng mâu thuẫn với tàu bay
  offline ở 5.6, và người chơi sẽ nhận ra sự bất nhất.
- (b) **Kho lạnh là thứ phải xây** — spoilage chạy cả khi offline, nhưng kho lạnh dừng nó. Người
  chơi *chuẩn bị trước khi tắt máy*. Giữ được cơ chế, biến việc đóng app thành một hành vi trong
  game. **Đây là lối tài liệu này khuyên.**
- (c) **Bỏ Gleba.** Bốn hành tinh không phải con số thiêng.

### 7.2 Lưới nối rối mắt trên màn nhỏ

Bỏ băng chuyền để đỡ phải kéo, rồi vẽ 40 đường nối chồng nhau lên khung 400px thì đổi một vấn đề
lấy một vấn đề khác. Phòng trước: **chỉ vẽ đậm các liên kết của máy đang chọn**, phần còn lại mờ đi;
và nếu số liên kết trên một màn vượt ngưỡng (đề xuất **~12**), đó là tín hiệu ràng buộc số cổng ở
5.1 đang quá lỏng.

### 7.3 Món nợ art

Nhắc lại vì nó sẽ bị quên: bộ `art/pki/` **không ship được** (mục 3). Nếu game này lại dựng trên
đó, có hai game trong repo cùng chờ một bộ art thay thế chưa ai vẽ. `CREDITS.txt` cho biết công
việc thay thế ở `stardew` là **207 frame, không phải 1.178** [ĐO TRONG REPO] — con số đó là tin
tốt, nhưng chỉ tốt khi có người bắt đầu.

---

## 8. Cái repo đã có, dùng lại được ngay [ĐO TRONG REPO]

Đây không phải bắt đầu từ số không. Đếm ngày 31/8/2026:

| Cần gì | Đã có ở đâu | Trạng thái |
|---|---|---|
| Joystick cảm ứng đã trưởng thành | `games/repo2d/game.js` (9.551 dòng) — stick nổi, vùng chết `STICK_DEAD = 0.14`, dải ngón cái, và **các con bọ đã sửa kèm lời giải thích ngay tại chỗ** (con trỏ ma ở đáy màn hình khi chạm; alt-tab làm nhân vật tự đi mãi; nút cạnh stick bị cướp cú chạm) | Chép sang được, **đổi từ hai stick xuống một** |
| Máy → công thức → sản phẩm | `games/stardew/js/machines.js` (330 dòng) — luật keyed theo *category* của item nên "mọi loại quả thành rượu" là một luật thay vì 80 | Đúng hình dạng cần, đổi bảng dữ liệu |
| Sim + save + thời gian | `games/stardew/js/sim.js` (895 dòng) | Dùng lại kiến trúc |
| Atlas pixel + packer | `games/stardew/tools/pack_pki.py`, `js/atlas.js` | Dùng lại pipeline, thay art |
| Bộ kiểm tự động | `games/stardew/tools/regress.js` (876), `smoke.js` (403), `uicrawl.js` (283); và `test/dragonproj-*.js` ở gốc repo | Có sẵn khuôn crawl UI + regression |
| Khung web không build | Mọi game ở đây: HTML + canvas + ES5, không engine, không dependency, chạy trên `python -m http.server` | Giữ nguyên |
| Meta viewport cho khung dọc | 4 biến thể đang dùng trong `games/*/index.html`, có `viewport-fit=cover` | Chuẩn hoá lấy một |

Rẻ nhất là **rẽ nhánh từ `stardew`**: nó đã là game đảo, khung dọc, một nút, có máy móc và có bộ
kiểm — và lấy tầng điều khiển từ `repo2d`.

---

## 9. Dựng thử trước khi đụng kiến trúc

Ba mốc, mỗi mốc trả lời **đúng một câu hỏi có thể sai**, và nếu sai thì dừng chứ không đi tiếp:

**Mốc 1 — "nối bằng hai cú chạm có sướng không?"** (nhỏ nhất có thể)
3 loại máy, 1 tài nguyên, một cột dọc, một stick giữa. Không hành tinh, không tàu, không quality.
Câu hỏi: gỡ một nút thắt bằng ngón cái **có cho lại cảm giác của Factorio không**? Nếu không, cả
mục 5 sai, và không có gì cứu được ở các mốc sau.

**Mốc 2 — "ràng buộc có giữ được trò chơi bố cục không?"**
Thêm băng thông theo khoảng cách + giới hạn cổng + nhà trung chuyển. Câu hỏi: người chơi có **dời
máy lại gần nhau** không? Nếu không ai dời, ràng buộc 1 quá yếu và game đang trượt về Deep Town.

**Mốc 3 — "vòng lặp offline có kéo người quay lại không?"**
Thêm một tàu, một chuyến bay, cần gạt thrust. Câu hỏi: mở app ra **có muốn xem tàu về không**?

Mốc 1 và 2 chơi được là đủ để chốt hướng. Chỉ sau đó mới bàn tới bốn hành tinh — và lúc đó thì
mục 5.5 đã sẵn bảng.

---

## 10. Cái tài liệu này KHÔNG khuyên

- **Không** giữ băng chuyền tự do rồi hy vọng UI cảm ứng cứu được — Mindustry đã thử, mục 2.
- **Không** làm bản Factorio "đầy đủ" thu nhỏ. 80 giờ không nhét vào phiên 3 phút; ép thì ra một
  bản Factorio tệ chứ không ra một game mobile.
- **Không** ship art `pki`.
- **Không** làm cả bốn hành tinh trước khi Mốc 1 chơi được.

---

## 11. Câu cần người chốt

Ba câu, mỗi câu đổi hướng thật, và không câu nào tài liệu tự trả lời hộ được:

1. **Mốc 2 hay Deep Town?** Nếu chấp nhận bỏ luôn đồ thị (máy độc lập, không nối) thì game dễ làm
   hơn nhiều, dễ bán hơn nhiều, và **không còn là game Factorio-like**. Đây là ngã ba thật, không
   phải câu hỏi tu từ.
2. **Gleba đi lối nào** trong ba lối ở 7.1 — quyết trước khi viết code, vì nó đổi cả hệ save.
3. **Art** — vẽ mới, mua, hay dựng bằng hình khối procedural? Ràng buộc "không ship pki" đã chốt;
   thứ chưa chốt là thay bằng gì.

---

## 12. Nguồn

**Factorio: Space Age**
- Friday Facts #373 — Factorio: Space Age (công bố, mục tiêu thiết kế, "impactful strategic choice", "under 80 hours") — https://factorio.com/blog/post/fff-373
- Friday Facts #438 — Space Age wrap up (88.000 năm chơi trên Steam, 625+ bug đã sửa) — https://forums.factorio.com/122494
- Factorio Wiki — Space platform (nền 10×10, giới hạn 200 ô, 12 điều kiện chờ, thiên thạch tăng theo tốc độ, hub vỡ mất sạch) — https://wiki.factorio.com/Space_platform
- Factorio Wiki — Quality (5 bậc, +30%/bậc, +1% / +2,5% / +6,2%, quay tiếp 10%, recycler thu 25%) — https://wiki.factorio.com/Quality
- Factorio Wiki — Fulgora (tỉ lệ output recycler, nghẹt phụ phẩm, sét 1 GJ, Electromagnetic science) — https://wiki.factorio.com/Fulgora
- Factorio Wiki — Gleba (timer hỏng từ vài phút tới 2 giờ, nutrient 5 phút, pentapod theo spore, Agricultural science) — https://wiki.factorio.com/Gleba
- Factorio Wiki — Vulcanus (Demolisher khoá chunk, tungsten) — https://wiki.factorio.com/Vulcanus

**Pickaxe King Island**
- App Store (4,9/5 · 1,8K đánh giá, 318,2 MB, v463.2, bảng IAP) — https://apps.apple.com/us/app/pickaxe-king-island/id6738040300
- Google Play (Rogue Union Games, mô tả, villager) — https://play.google.com/store/apps/details?id=com.rogueuniongames.pickaxekingisland
- Indie Games Tavern — review (vòng lặp, quảng cáo không ép) — https://indiegamestavern.com/2025/09/05/pickaxe-king-island-review/
- SNAPP Attack — review (kéo d-pad ảo, cả dọc lẫn ngang) — https://snappattack.com/2025/08/15/pickaxe-king-island-ios-snapp-review/

**Mindustry — kết quả âm tính**
- Mindustry-Suggestions issue #1763 — điều khiển cảm ứng thiếu tài liệu — https://github.com/Anuken/Mindustry-Suggestions/issues/1763
- Google Play — Mindustry — https://play.google.com/store/apps/details?id=io.anuke.mindustry
- Steam Community — Deeper Understanding of Mindustry I: Transportation — https://steamcommunity.com/sharedfiles/filedetails/?id=1935045318

**Deep Town**
- Google Play — Deep Town: Idle Mining Tycoon (Rockbite Games) — https://play.google.com/store/apps/details?id=com.rockbite.deeptown
- App Store — Deep Town: Mining Idle Games — https://apps.apple.com/us/app/deep-town-mining-idle-games/id1202240058

**Trong repo này** (đọc ngày 31/8/2026, `main` @ `a6b7518`)
- `games/repo2d/game.js` — tầng joystick và các bọ đã sửa
- `games/stardew/README.md`, `js/machines.js`, `js/sim.js`, `art/CREDITS.txt`
