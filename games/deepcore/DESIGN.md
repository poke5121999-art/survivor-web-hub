# LÕI SÂU — thiết kế

> Trộn ba game. Ghi chép nghiên cứu đầy đủ kèm nguồn nằm ở `research/`
> (bốn tài liệu, ~4.000 dòng, hơn 340 nhãn `[NGUỒN]` kèm URL). Tài liệu này chỉ
> nói **đã chọn gì và vì sao**, kèm số liệu **đo được trong máy** chứ không đoán.

| lấy từ | lấy cái gì |
|---|---|
| **Deep Rock Galactic** | nhịp đi hang, nhiệm vụ có chỉ tiêu, bầy quái **có báo trước** rồi mới đổ ra, ngân sách điểm độ khó, Nitra gọi tiếp tế, Đường Đỏ cuốc vào là hồi máu, pha chạy thoát có quái **chặn đầu** |
| **DRG: Survivor** | lên cấp chọn 1 trong 3, vũ khí **tự đánh** với luật ngắm in thẳng lên thẻ, tự đào khi đứng gần, mã màu quái, HUD chia bốn góc |
| **Core Keeper** | đá đặc là mặc định và hang là thứ được **khoét** ra, vỉa quặng mọc thành cụm, **bóng tối**, paperdoll trang bị, toàn bộ art |
| **Survivor.io** | hai loại tiền tách theo *chức năng*, gacha có bảo hiểm, nâng cấp vĩnh viễn ngoài ván, bố cục màn hình kiểu game di động |
| **Path of Exile / Last Epoch** | bộ não minion: dây xích, luật ngắm, Meat Shield, nút gom quân, thẻ hy sinh |

---

## 1. Ba động từ, không hơn

Người chơi có đúng ba việc: **ĐI**, **ĐÀO**, và **ĐỨNG ĐÚNG CHỖ**.
Không có nút đánh. Không có nhắm.

Cả sát thương đến từ **linh thú** mang theo — mười con vật tự đi, tự chọn mục
tiêu, tự đánh. Đây là lớp summoner, và câu hỏi khó của lớp summoner là: *nếu
người chơi không đánh thì họ làm gì cho có chiều sâu?*

**Câu trả lời: vị trí thay cho việc ngắm.**

- Quái đứng trong **120px** quanh người chơi thì ăn thêm **25% sát thương**
  (chép thẳng Meat Shield của Path of Exile). Đứng xa cho an toàn = đánh yếu đi.
  Có một thẻ lên cấp nới vùng này ra, tức là "bao nhiêu phần trăm bạn dám đứng
  gần" trở thành một trục build thật.
- Một nút duy nhất — **GỌI** (hồi 6 giây): gom cả bầy về bên mình, hồi 25% máu
  cho chúng, và +35% sát thương trong 2 giây. Một nút thì không phải học gì, mà
  vẫn có một quyết định thật để đưa ra.
- **Đào** là nguồn kinh nghiệm chính, nên "đào hay chạy" chính là chỗ thay thế
  cho "nhắm hay không nhắm".

## 2. Mười linh thú — khác nhau ở LUẬT, không ở con số

Cái phân biệt món này với món kia **không phải** sát thương, mà là ba dòng được
**in thẳng lên thẻ** khi triệu:

```
bám    nó bám chủ kiểu gì   (chen ra trước mặt / xoay quanh / dính sát / thả rông)
ngắm   nó chọn đánh con nào (gần người / gần nó / máu thấp nhất / chỗ đông nhất / vỉa quặng)
nhịp   bao lâu ra một đòn
```

DRG:Survivor làm đúng thế với luật auto-aim của từng khẩu ("targets closest
enemy", "targets groups"), và đó là lý do người chơi phân biệt được vũ khí dù
chẳng bấm bắn bao giờ. Giấu luật ngắm đi thì mười con này chỉ còn là mười cái ảnh.

| | tên | vai | bám | ngắm |
|---|---|---|---|---|
| 1 | Rùa Đá | chặn | chen ra trước mặt | con gần **người** nhất |
| 2 | Chó Mỏ | cận chiến | xoay quanh | **kết liễu** con máu thấp nhất |
| 3 | Trụ Khoan Bay | tầm xa | dính sát | con gần **nó** nhất |
| 4 | Mọt Lửa | nổ diện | xoay quanh | chỗ **đông** quái nhất |
| 5 | Dơi Máu | hồi máu | dính sát | con gần nó nhất |
| 6 | Slime Hoàng Tử | tăng sức | dính sát | — (hào quang) |
| 7 | Gấu Nước Khoan | đào hộ | thả rông | **vỉa quặng** gần nhất |
| 8 | Slime Đèn | soi sáng | dính sát | — (hào quang) |
| 9 | Mèo Hang | khống chế | xoay quanh | chỗ đông quái nhất |
| 10 | Hồn Quặng | dây chuyền | dính sát | con gần nó nhất |

**Bậc 3 và bậc 5 cố ý KHÔNG cộng sát thương** — chúng đổi *cách hoạt động*
(Rùa Đá bậc 3 chắn được cả đạn; Chó Mỏ bậc 3 kết liễu xong lao thẳng sang con
kế). Chép hình dạng của Astral Forge trong Survivor.io: 1–2 sao cộng chỉ số,
3 sao đổi cơ chế. Người chơi nhớ bậc 3 và bậc 5; bậc 2 và 4 chỉ để đường cong
khỏi giật.

**Trần 4 con hiện hình.** Màn dọc + bầy quái + vách đá là đã kín; con thứ 5 trở
đi chuyển sang "trợ chiến" — vẫn góp hào quang, không vẽ ra. Survivor.io giải
đúng bài này bằng "1 hiện hình + 2 trợ chiến".

### Ba lỗi kinh điển của minion, và cách né

1. **"Minion bị bỏ lại."** Trong Path of Exile, dây xích chỉ được kiểm khi minion
   đang ở trạng thái *đi theo* — đang đánh nhau thì không kiểm, nên chủ chạy đi
   là nó ở lại đánh tới chết. Ở đây **dây xích kiểm ở MỌI trạng thái**, không có
   ngoại lệ. Có một bài kiểm khoá lại: nhét quái cạnh linh thú cho nó vào trạng
   thái đánh nhau, rồi bốc người chơi đi 40 ô — sau 6 giây con xa nhất còn 99px.
2. **"Minion kẹt đường."** Không có tìm đường, chỉ có lái theo hướng + trượt
   vách. Bù lại: kẹt quá 1,1 giây hoặc xa quá 1,6 lần dây xích thì **dịch chuyển
   về** bên chủ. Xấu về lý thuyết, nhưng người chơi không bao giờ mất linh thú.
3. **"Không biết con nào đang làm gì."** Mỗi con có vòng chân màu theo **vai**,
   có vạch nối tới mục tiêu khi ra đòn, và nảy to một nhịp khi vừa đánh.

## 3. Một tầng, mười phút

**Cố ý lệch DRG:Survivor:** một ván chỉ có **MỘT TẦNG**, giống DRG gốc. Một ván
mười phút trên điện thoại không chứa nổi năm đường cong độ khó chồng lên nhau.

Nhịp mượn thẳng của DRG: bầy quái **có cảnh báo trước 3,5 giây** (DRG báo trước
3,7 giây — vừa đủ để đổi chỗ đứng, không đủ để chạy mất), và giữa hai đợt có
**khoảng lặng thật sự**. DRG để 350–500 giây giữa hai đợt ở Hiểm 1; ở đây nén còn
~40–60 giây, cộng bốn **"hố thở"** đặt tay — đó là câu trả lời cho chuyện chơi
mười phút trên điện thoại mà không mệt.

17 mốc sự kiện trong ~490 giây ≈ một mốc mỗi 29 giây. Mốc **dồn vào 8 phút đầu**
chứ không rải đều 10 phút: đo trong máy, một ván thật kết thúc ở khoảng phút 5–7
(xong nhiệm vụ là gọi khoang ngay), nên rải đều tới phút 10 thì mini-boss và hai
đợt bầy cuối gần như không bao giờ được thấy. **600 giây là TRẦN, không phải độ
dài mong đợi.**

### Đoạn kết

Xong nhiệm vụ → gọi khoang → **boss** → **chạy thoát 80 giây**.

Khoang thoát hạ xuống **đúng chỗ vào**. Người chơi đã tự tay đục con đường đó,
nên lúc hoảng không phải học lại bản đồ. Trong pha chạy, quái ra **theo đường
chạy** chứ không quanh người chơi — nghĩa là chúng **chặn đầu**; đó là luật của
DRG và là cái làm đoạn cuối căng chứ không chỉ là một cái đếm ngược.

## 4. Bốn chỗ cố ý lệch bản gốc

1. **Một tầng** thay vì leo năm tầng (lý do ở trên).
2. **Quái KHÔNG rơi viên kinh nghiệm.** Kinh nghiệm cộng thẳng, và phần lớn đến
   từ **đào** chứ không từ giết. Nhờ thế cây cuốc không bao giờ là việc phụ, và
   không ai phải hút sạch sàn sau mỗi đợt bằng một ngón cái. Thang: đục vỡ một ô
   đá thường +1,2; một vỉa quặng +5…+24 tuỳ loại; một con quái +2…+34.
3. **Người chơi không tự đánh** (mục 1).
4. **Glurch tách ra slime con khi máu ≤ 50%.** Bản gốc chỉ có **một** chiêu —
   nhảy vồ, để lại vũng nhớt, cuồng nộ ở 30% máu. Đủ cho một sandbox, nhưng phẳng
   lì khi nó là cao trào đóng màn của một ván mười phút.

Boss còn lại dựng đúng bản gốc: **Mẹ Tổ** đứng yên, mưa axit mỗi 4–5 giây, đẻ
trứng ở một trong năm vị trí, trứng **nở sau 7,4 giây**. Nó không đuổi ai — nó
bắt người chơi phải chọn: diệt trứng hay đánh boss. **Mini-boss** lao thẳng, đâm
vách thì choáng và **hở sườn** — cửa sổ phản đòn là phần thưởng cho việc dụ nó
đâm vào đá.

## 5. Ngoài ván

**Hai loại tiền, tách theo CHỨC NĂNG chứ không theo độ hiếm** (Survivor.io):

- **Vàng** luôn có → nâng cấp vĩnh viễn, lên bậc linh thú
- **Ngọc** luôn thiếu → chỉ đi vào gacha

Nhờ thế người chơi không bao giờ phân vân "để dành cái nào", và cũng không có
cảm giác tiêu nhầm.

**Vì sao phải có nâng cấp vĩnh viễn:** ải khó là ải mà kỹ năng không gánh nổi.
Không có đường tiến bộ vĩnh viễn thì người chơi kẹt vĩnh viễn. Nâng ngoài ván
biến "chưa qua nổi" thành "chưa đủ mạnh, cày thêm chút nữa".

**Gacha không giấu tỉ lệ** — bảng in thẳng trên màn hình, và có bảo hiểm: mỗi 10
lần chắc chắn ra ít nhất bậc Hiếm. Trùng thì thành **mảnh** của chính con đó
(linh thú) hoặc **lên cấp món** (trang bị) — không có lần quay nào là vứt đi.

**Bể linh thú trong ván gồm CẢ MƯỜI con**, không chỉ mấy con đã sở hữu. Con đã sở
hữu vào trận ở đúng bậc đã nâng; con chưa sở hữu vẫn gọi được nhưng chỉ ở bậc 1.
Lý do: nếu bể chỉ có con đang sở hữu thì người chơi mới có đúng hai con, và hệ
thẻ "chọn 1 trong 3" không còn gì để mời — mỗi ván y hệt ván trước. Gacha vì thế
không phải cái mở khoá *việc chơi*, nó chỉ quyết định con nào vào trận **mạnh sẵn**.

**Sáu ô trang bị.** Ba ô giáp (mũ/áo/quần) **đổi luôn hình nhân vật** — không
phải hiệu ứng, mà là thật, vì paperdoll gốc làm đúng như vậy. Ba ô công cụ: cuốc
(sức đào + tốc đào), đèn (**tầm nhìn LÀ sức mạnh** trong hang tối), nhẫn (linh
tinh).

**Vào game là người trần.** Kho rỗng, sáu ô trống, mọi món phải quay ở Quầy mà
ra. Bản đầu phát sẵn một bộ gỗ và đó là một sai lầm nhỏ mà hậu quả không nhỏ:
hai ô đầu đã kín, nên món đầu tiên quay được chẳng làm nhân vật đổi gì, và thứ
đáng khoe nhất của bộ art này — mặc vào là thấy trên người — trôi qua đúng lúc
đáng lẽ nó phải xảy ra. Đổi lại, **chỉ số gốc phải tự nó đủ chơi**: 186 máu, 6%
giáp, sức đào 11, đèn 76. Trang bị là phần cộng thêm, không phải phần bắt buộc
có. (Đo được: để nguyên mức cũ 145 máu / 0 giáp thì từ ải 3 trở lên thua sạch.)

**Không có bậc cuốc.** Bản đầu bắt đá cứng phải cuốc đủ bậc, thiếu bậc thì tốc
đào còn 42%. Về lý thì hợp, về tay chơi thì đó là một cái cửa vô hình: không ai
nói cho người chơi biết vì sao cây cuốc của họ đục mãi không vỡ, và cảm giác duy
nhất còn lại là *"game này đào chậm"*. Giờ cuốc nào cũng đục được mọi loại đá,
cuốc xịn chỉ nhanh hơn — chênh lệch nằm ở hai con số nhìn thấy được.

**Ô đồ trong kho là chính mảnh sẽ hiện lên người.** Biểu tượng một món giáp
không lấy từ bảng vật phẩm mà cắt thẳng từ lớp paperdoll (`pc.helm.iron`…),
lấy khúc trên cho mũ, khúc giữa cho áo, khúc dưới cho quần. Trước đó mọi cái mũ
dùng chung một icon, nên hai bộ khác nhau nhìn y hệt nhau trong kho và chẳng ăn
nhập gì với thứ hiện ra trên nhân vật.

## 5b. Vẽ tường theo bộ ghép cạnh, và quặng phải nằm SÂU

**Bộ 20 khung tường KHÔNG phải 20 biến thể.** Vùng cắt trong tileset gốc là một
khối 5 cột × 4 hàng, và đo độ sáng từng mép của từng khung (cả chín quần thể)
cho ra cùng một cấu trúc — đây là một bộ **nine-slice 3×3 có nhân đôi biến thể**:

```
cột 0     mép TÂY           hàng 0   mép BẮC (vành trên bắt sáng)
cột 1..3  ruột, 3 biến thể  hàng 1   ngay dưới mép bắc
cột 4     mép ĐÔNG          hàng 2   ruột sâu
                            hàng 3   mép NAM (gờ dưới tối hẳn)
```

Số đo, quần thể `dirt`, trung bình 5 cột: hàng 0 `trên 82,2 / giữa 95,0 / dưới
99,9`; hàng 3 `trên 88,4 / giữa 77,2 / dưới 63,1`. Quần thể `mold`: cột 0 mép
trái `44,3` so với `98,4` của các cột giữa.

Bản đầu bốc `hash × 20`, tức là rải ngẫu nhiên cả hai mươi khung: vành sáng mép
bắc rơi vào giữa lòng đá, gờ tối mép nam nằm lửng lơ, rìa hang thì lại là ruột
đá phẳng lì. Cách chữa lúc đó là kẻ thêm viền đen 2px quanh mọi ô — càng làm cái
hang giống hình vẽ vector. Nay bỏ hẳn viền vẽ tay; chỉ giữ **bóng đổ mềm xuống
sàn**, vì đó là thứ duy nhất chạy RA NGOÀI ô đá mà một sprite 16×16 không tự làm
được. Mép nam ưu tiên cao nhất: trong góc nhìn từ trên xuống hơi chếch, mặt đứng
người chơi thật sự nhìn thấy là mặt quay xuống dưới.

*Đã tra Core Keeper làm gì [NGUỒN]:* bản thật dùng **bitmask 8 hướng với bảng
tra 256 mục** (`dir_bits_available: 0xFF`, thứ tự bit `E,SE,S,SW,W,NW,N,NE`),
nở ra từ một bộ nguồn vẽ tay 23 ô, và tách hẳn **`wallFront` — mặt đứng cao đúng
16px chỉ autotile theo Đông/Tây**. Cộng đồng hay bảo Core Keeper dùng
"dual-grid"; không phải, bài dual-grid của jess::codes không hề nhắc tới nó. Bản
này dừng ở nine-slice 4 hướng vì vùng art đã bóc không có mấy ô góc lõm; hệ quả
là góc lõm hiện ra hơi vuông. Ghi lại để lần sau bóc thêm thì nâng lên được.

**Quặng: đo trước, rồi mới sửa.** Người chơi báo *"các loại quặng toàn lộ thiên,
bên trong thì lại không có gì → không có mục đích đào vào sâu"*. Đo bản đồ đã
sinh, tính độ sâu từng ô đá bằng BFS từ mọi ô sàn:

| độ sâu | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|
| ô đá có | 1.171 | 957 | 758 | 635 | 525 | 2.571 |
| **ô quặng (bản cũ)** | **738** | 383 | 94 | 16 | 1 | **0** |
| **ô quặng (bản mới)** | 135 | 187 | 139 | 78 | 29 | 7 |

Đúng y như báo: toàn bộ ruột của mọi khối đá rỗng tuếch, men theo mép hang là
nhặt sạch. Ba luật mới, mượn thẳng của Core Keeper:

1. **Vỉa mọc từ ngoài vào.** Hạt giống nằm nông nên thấy được từ trong hang,
   nhưng khi lớn thì vỉa luôn bốc ô SÂU NHẤT đang chờ — vỉa chạy vào lòng đá
   thay vì loang dọc vách.
2. **Càng quý càng chôn sâu.** Mỗi loại có ngưỡng độ sâu tối thiểu xếp theo giá
   trị: Đường Đỏ ở ngay vách, Thiên Hà và Nhật Diệu chỉ có ở lòng khối đá.
3. **Chỉ VẼ quặng ở ô có mặt lộ ra hang.** Tài liệu mod chính chủ của Core
   Keeper cho biết trường quặng được sinh cho *mọi* vị trí kể cả trong đá đặc
   (ba bit alpha của mỗi điểm ảnh bản đồ), còn wiki thì mô tả người chơi nhận ra
   quặng nhờ "đốm lấp lánh trắng trên vách". Nhờ vậy lòng khối đá là một ẩn số
   thật. Bản trước vẽ mọi ô quặng nên chỉ cần đèn sáng là nhìn xuyên qua đá thấy
   hết vỉa.

**Hốc kín** thì nằm nguyên trong đá, ô của nó là quặng quý nhất của quần thể và
có một vầng quặng quý bán kính 2 bao quanh — mấy ô ngoài cùng chạm tới độ sâu
1-2 nên **nhìn thấy được từ trong hang**. Đó là cái mồi. (Bản đầu khoét sẵn
buồng 2-4 ô; bộ kiểm bắt ngay: *"0/11 còn kín"* — vòng sáng hiện xuyên qua đá,
mất sạch cái không biết.) Bản đồ nhỏ nhấp nháy dấu hốc trong bán kính 11 ô, đủ
gần để thành lời mời cụ thể, đủ xa để không thành danh sách việc phải làm.

Core Keeper cũng chôn rương thẳng trong khối đá đúng như vậy — *Hidden Turf
Chest* và *Hidden Clay Chest* (tối đa 3 mỗi loại), *Sand Ruins*, hai rương vàng
trong khối đền sa mạc [NGUỒN: wiki Scenes].

**Tầm với của cuốc.** Bản trước dò đúng MỘT điểm cách tâm người `bán kính + 5`
px — chưa tới một ô — nên phải dí sát mặt vào vách. Trên màn cảm ứng, nơi cần
gạt không cho đứng yên đúng một chỗ, điều đó nghĩa là cứ vài nhát lại hụt một
cái mà không hiểu vì sao. Giờ quét dọc theo hướng nhắm và lấy ô đục được đầu
tiên trong 30px (gần hai ô).

## 6. Đọc được trên màn hình dọc

Bài học đắt nhất của DRG:Survivor: *"as the dorf gets stronger the screen gets
more and more unreadable"*. Nên **trần hạt đặt cứng từ ngày đầu**: 220 hạt, vượt
trần thì hạt ưu tiên thấp bị đạp ra. Đo được: đỉnh 56–153 hạt trong một ván thật.

Bốn góc, mỗi góc một loại tin:

```
trên-trái   BẢN THÂN    máu, cấp, kinh nghiệm
trên-phải   KHÔNG GIAN  bản đồ nhỏ + đồng hồ
dưới hai    NHIỆM VỤ    ô nhiệm vụ, thanh Nitra, hàng linh thú, mách nước
giữa        ĐE DOẠ      băng cảnh báo — hiếm khi hiện, hiện thì to
dưới-phải   ĐIỀU KHIỂN  nút GỌI + nút TIẾP TẾ
còn lại     cần gạt mọc ngay chỗ ngón tay chạm
```

**Tin ở trên, nút ở dưới-phải — không có ngoại lệ.** Chơi dọc một tay thì cả
nửa dưới màn hình nằm dưới lòng bàn tay. Bản đầu để hàng linh thú, dòng mách
nước và ô "gọi tiếp tế" ở đáy màn hình, tức là đúng chỗ bị che: người chơi
không bao giờ thấy con linh thú nào sắp chết. Và ô tiếp tế thì tệ theo cả hai
chiều — nó vừa bị che, vừa nằm ở thanh Nitra tận trên cùng, xa ngón cái. Giờ
tách hẳn hai vai: nửa trên **chỉ để đọc**, góc dưới-phải **chỉ để bấm**.

**Nét ảnh.** Hai chỗ làm mờ pixel art mà không ai để ý ngay: (1) chặn `dpr` ở 2
trong khi điện thoại phổ thông có `dpr` 3, nên khung ảnh bị kéo lên 1,5 lần —
một điểm ảnh art thành một-rưỡi điểm ảnh máy; (2) gốc toạ độ máy quay là số lẻ,
nên mọi sprite rơi vào giữa hai điểm ảnh. Cả hai đều được sửa bằng cách chốt về
số nguyên: lấy đúng `dpr` (trần 3), ép khổ CSS bằng `pw/dpr`, và
`Math.round()` gốc toạ độ trước khi `setTransform`.

Và một luật: **mọi thứ nhịp nhanh là thanh hoặc vòng, không phải số.**

Ba loại nhân vật tách nhau bằng **vòng chân**: người chơi trắng + quầng ấm, linh
thú theo màu vai, quái **đỏ** — cam khi sắp nổ, vàng khi đang lên gân, tím khi là
tinh nhuệ (mã màu của DRG:Survivor). Không có nó thì Người Hang có dáng người y
hệt người chơi và giữa một đám sáu linh thú không ai kịp phân biệt bạn với thù.

Camera **phóng theo bội số nguyên** (~16 ô lọt bề ngang). Phóng 1,67 lần thì có
điểm ảnh to 2, có cái to 1 — nhìn lấm tấm rất khó chịu.

**Bóng tối là cơ chế chứ không phải lớp màu.** Độ phủ 0,86–0,96 tuỳ quần thể:
ngoài quầng đèn gần như đen đặc. Đặt 0,6–0,8 như bản đầu thì thấy cả hang kể cả
ngoài vùng đèn — và thế là ô trang bị "đèn" chẳng còn nghĩa gì, mà bóng tối cũng
thôi làm người chơi thấy bất an. Vỉa quặng trong **7 ô** thì tự hắt sáng; xa hơn
để tối, nếu không cả hang sáng trưng.

## 7. Cân bằng đo bằng máy, không đoán

`_tools/soak.js` chạy trọn một ván **không vẽ**, với một người chơi giả **cố ý
chỉ giỏi vừa đủ**: né vòng báo trước của boss và của con sắp nổ, giữ quái ở
khoảng 60px (đủ xa để không bị gõ liên tục, đủ gần để vẫn nằm trong vùng "kề
bên"), bấm GỌI khi bị vây, đi tới vỉa quặng gần nhất trong tầm đèn, và chạy về
khoang khi tới pha thoát.

> Bot đi giỏi quá thì không bao giờ chạm vào chỗ mà người thật hay chết; bot ngu
> quá thì mọi phép đo đều vô nghĩa vì nó chết vì lý do của riêng nó.

**Sáu lượt ải 1** (`node _tools/…` qua `_tools/drive.js`):

| | giây | cấp | giết | quặng | nhiệm vụ | kết quả |
|---|---|---|---|---|---|---|
| 0 | 522 | 19 | 192 | 34 | 13/27 | THẮNG (hết giờ → thoát) |
| 1 | 344 | 19 | 96 | 98 | **27/27** | thua ở boss |
| 2 | 219 | 14 | 71 | 55 | **27/27** | THẮNG |
| 3 | 523 | 22 | 220 | 60 | 20/27 | THẮNG |
| 4 | 253 | 13 | 61 | 34 | 15/27 | thua |
| 5 | 525 | 19 | 116 | 71 | 24/27 | THẮNG |

**Thắng 4/6 · ván trung bình 6 phút 38 · cấp trung bình 17,7 · đỉnh 41 quái cùng lúc.**

### Bốn lỗi nặng chỉ bị lộ nhờ bộ đo này

Không cái nào lộ ra khi chơi tay vài phút:

1. **Quặng do chính người chơi đào không được tính vào nhiệm vụ.** Chỉ quặng do
   linh thú đào hộ mới tính, nên bảng đứng 0/27 suốt ván. Ẩn được lâu vì lượt
   chạy thử nào tình cờ có con Gấu Nước trong đội thì vẫn xong.
2. **Đục vỡ đá thường không cho kinh nghiệm**, nên người chơi cấp 1 đứng đào cả
   phút vẫn cấp 1 rồi chết vì chưa gọi nổi linh thú nào — vòng tiến bộ không bao
   giờ khởi động.
3. **Mảnh linh thú rơi cho cả bể mười con** thay vì chỉ đội đã ra trận, làm việc
   chọn đội hình mất sạch ý nghĩa.
4. **60 giây chạy thoát không đủ băng qua bản đồ** — thua vì *đường xa* chứ không
   vì *đánh dở*, kiểu thua không dạy được gì. Sửa thành 80 giây + chạy nhanh hơn
   25% + mũi tên chỉ hướng về khoang.

### Hai chỗ phải chỉnh đi chỉnh lại

**Bỏ hẳn màn "LÊN CẤP — chọn 1 trong 3".** Đường cong kinh nghiệm đã chỉnh ba
lần (bậc hai → `18+6·cấp` → `34+26·cấp` → `30+17·cấp+0,8·cấp²`) và lần nào cũng
chỉ dời được cái tật đi chỗ khác. Tật thật nằm ở chính hình thức của nó:

- nó **dừng hình** — đo được có ván ngắt hai mươi bảy lần trong chín phút;
- nó **tách phần thưởng khỏi việc chơi**: một con số vô hình tự dâng lên rồi hộp
  thoại tự bật ra, đứng ở đâu trên bản đồ cũng vậy;
- và vì mọi sức mạnh đều tới từ thanh điểm ấy, **việc đục vào lòng khối đá thành
  vô nghĩa** — không có gì trong đó đáng để đi tìm.

Nên bỏ hẳn. Không còn `xp`, không còn `level`, không còn `Screens.levelUp`.
Đường sức mạnh trong ván chia làm hai, và cả hai đều gắn vào **việc đào**:

| | | |
|---|---|---|
| **Mốc quặng** | cứ 16 ô quặng | bầy lớn thêm một con, hết quân thì nâng bậc con yếu nhất |
| **Hốc kín** | 13-15 cái/bản đồ, chôn sâu | tổ linh thú / đài cổ (+2 bậc) / bùa đá / rương của |

Không dừng hình, không có gì phải chọn — chạm vào là nhận, kèm một dải băng báo.

**Đây là chỗ suýt hỏng cả game, và chỉ phép đo bắt được.** Gỡ màn chọn thẻ xong,
tỉ lệ thắng đo được rơi từ **5/8 xuống 1/8**, có ván chết ở giây thứ 49. Hoá ra
mười mấy tấm thẻ mỗi ván không chỉ là nhịp — nó LÀ toàn bộ việc bầy linh thú lớn
lên, và mười ba cái hốc kín không gánh nổi (một ván trung bình chỉ đục trúng vài
cái). Phải thêm mốc-quặng, và phải cho **cả đội hình đã sở hữu ra trận ngay từ
đầu** thay vì hai con, thì mới về lại 8/10.

**Chỉ tiêu nhiệm vụ + mật độ quặng** — hai cái bẫy ở hai đầu:

- quá ít → xong ở phút 2–4, cả nửa sau của ván không bao giờ diễn ra;
- quá nhiều **+ vỉa thưa** → phải băng ngang bản đồ để gom, mà đi bộ đường dài
  chính là lúc chết nhiều nhất (đo được: bot đi theo mũi tên nhiệm vụ qua nửa bản
  đồ thì tỉ lệ thắng rơi từ 3/6 xuống 1/6).

Lời giải là **vỉa dày + chỉ tiêu cao + bản đồ nhỏ lại** (112×152 → 94×126): quặng
gặp ngay trên đường đang đi, nhưng phải đào nhiều. Cộng thêm: **vỉa Morkite hiện
trên bản đồ nhỏ kể cả ô chưa khám phá** — DRG có máy quét địa hình làm đúng việc
này, và không có nó thì chỉ tiêu thành trò may rủi (đo được: có ván sau mười phút
mới ra 1/18 chỉ vì vỉa nằm lệch hướng).

Còn một chỗ nữa, mượn của DRG: **độ khó tăng bằng SỐ LƯỢNG và SÁT THƯƠNG, gần như
không bằng máu quái.** Từ Hiểm 1 lên Hiểm 5 của DRG, sát thương ×5,6 và số lượng
×5,7 nhưng máu chỉ ×1,7 — nhờ thế vũ khí không bao giờ có cảm giác yếu đi. Ở đây
làm y hệt: `hpK = 1 + 0,14·(ải−1) + 0,45·tiến-độ`, `dmgK = 1 + 0,11·(ải−1) +
0,55·tiến-độ`. **Ải 1 không có phụ trội nào** — ải đầu tiên phải là ải người mới
thắng được bằng đồ khởi đầu, không thì cả cỗ máy "nâng ngoài ván" chẳng có chỗ mà
bám vào.

## 8. Còn treo

- **Chưa có tiếng.** Cả game im lặng. Kho `data.unity3d` có sẵn nhạc và tiếng
  động của bản gốc nhưng chưa bóc.
- **Tiến hoá linh thú chưa nối vào**. Bảng điều kiện đã có đủ trong
  `data/pets.js` (bậc 5 + một việc phải làm được trong ván), màn hình chưa dựng.
- **Ba loại nhiệm vụ** đang dùng (khai thác / diệt tổ / thu hồi). DRG có tám.
- **Mối nguy môi trường** (`world.hazards`) đã sinh ra vị trí nhưng chưa có thực
  thể nào đọc chúng — mới chỉ có vũng nước và vũng nham hoạt động.
- **Bậc cuốc so với đá cứng** mới chỉ phạt tốc độ; chưa có loại đá nào thật sự
  đòi cuốc tối thiểu.
