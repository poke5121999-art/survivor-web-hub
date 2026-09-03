# Slime Legion — Năng lượng/Stamina và kinh tế ngoài trận (từ wiki/cộng đồng)

> Bối cảnh: file `slime-legion-apk-datamine.md` xác nhận **"số Stamina" là mảng duy nhất
> không đọc được** vì nằm trong `config/table.bytes` bị mã hoá XXTEA (mục 8 của file đó).
> Nhiệm vụ của file này là bù lại đúng mảng đó (và các mục kinh tế liên quan) bằng nguồn
> cộng đồng. Ngày tra cứu: 2026-09-03.
>
> Nhãn `[ĐO ĐƯỢC]` = có nguồn kèm link. `[SUY ĐOÁN]` = tôi tự suy luận, không phải số đo.
> Không có nhãn nào bị bỏ trống — chỗ nào không có số thì ghi thẳng **KHÔNG TÌM ĐƯỢC NGUỒN**.

## 0. Tình trạng nguồn (đọc trước khi dùng số bên dưới)

`slime-legion.fandom.com` — wiki cộng đồng chính — chặn WebFetch trực tiếp (lỗi 402), nên toàn bộ
nội dung wiki dưới đây được lấy qua proxy đọc `r.jina.ai` (bản text-hoá của trang). Đã duyệt gần
như **toàn bộ 26 trang** của wiki này (`Special:AllPages`, `Local_Sitemap`): wiki **không có trang
riêng nào tên "Stamina", "Energy", "Gold", "Diamond/Gem", "Guild", "Battle Pass" hay "AFK"**. Đây
là một wiki rất sơ khai (chủ yếu trang quái vật + 1 trang tier list), không phải kiểu wiki lớn có
mục kinh tế chi tiết như Genshin/AFK Arena wiki. Điều này tự nó là một phát hiện: **không tồn tại
nguồn cộng đồng tổng hợp đầy đủ hệ năng lượng của Slime Legion** — số liệu bên dưới là **mảnh vụn**
gom từ nhiều nguồn rời rạc (guide, trang App Store, review), không phải một bảng đầy đủ.

Công cụ `WebSearch` hết hạn ngạch phiên (dùng chung với các agent khác chạy song song) sau khoảng
20 lượt tìm đầu — từ đó tôi chuyển sang `WebFetch` trực tiếp + đoán URL + proxy `r.jina.ai`. Bing/
DuckDuckGo qua WebFetch trả về kết quả hỏng hoặc CAPTCHA nên không dùng được thay thế.

---

## 1. Stamina/Energy

**KHÔNG TÌM ĐƯỢC NGUỒN cho trần tối đa, tốc độ hồi, hay chi phí mỗi lượt chơi ải.**

Cái duy nhất xác nhận được là **Stamina có tồn tại như một tài nguyên rời** (không phải suy đoán
từ APK) và nó được phát theo cụm chẵn:

- Code quà tặng đã hết hạn `SlimeSummer` (2023-05-24 → 05-28) phát **30 Kim cương + 500 Vàng + 10
  Stamina** ([Slime Legion Wiki — Codes](https://slime-legion.fandom.com/wiki/Codes)).
- Hai code khác từng phát hành (`LOSTTEMPLE77`: 20 Kim cương + 2 Chìa khoá gỗ + 300 Vàng;
  `002Knights`: 30 Kim cương + 5.000 Vàng) **không có Stamina** — cho thấy Stamina không phải quà
  chuẩn của mọi code, chỉ một số đợt ([Slime Legion Wiki — Codes](https://slime-legion.fandom.com/wiki/Codes);
  xác nhận lại qua [AppGamer — Slime Legion Codes](https://www.appgamer.com/slime-legion-codes)
  cho `LOSTTEMPLE77`).

Không tìm thấy trang/bài nào nói Stamina dùng để **mở khoá ải chính** — mọi bài hướng dẫn (starter
guide, FAQ, game modes) đọc được của wiki đều mô tả ải chính chạy theo cơ chế **"bước đi mỗi ngày"**
(turn/step), không nhắc gì tới việc trừ Stamina để vào ải
([Slime Legion Starter Guide](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide);
[Game Modes](https://slime-legion.fandom.com/wiki/Game_Modes)). Lịch sử cập nhật trên App Store
(bản 2.5.1 → 4.5.0, xem mục 6) cũng không có mục nào tên "Energy System"/"Stamina System" được
ra mắt — nên **`[SUY ĐOÁN]`**: nếu Stamina đúng là dùng để vào ải chính thì hệ thống này đã có từ
bản đầu (trước 2.5.1), không phải tính năng mới — nhưng đây chỉ là suy đoán, không phải số đo.

→ **Mảng bị mã hoá trong APK (`GamePlayConst`/bảng Stamina) coi như vẫn chưa lấp được** — nguồn
cộng đồng không có số thay thế đáng tin.

## 2. Kim cương (Diamond/Gem)

- **30 kim cương/ngày** miễn phí bằng cách xem quảng cáo, "nếu farm đều mỗi ngày thì được ít nhất
  900 kim cương/tháng chỉ từ quảng cáo" `[ĐO ĐƯỢC]`
  ([Mobile Gaming Hub — Slime Legion Beginners Guide and Tips](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/),
  lấy nội dung qua snippet WebSearch vì trang chặn fetch trực tiếp — 403).
- Nguồn khác: "sự kiện và battle pass" cũng cho thêm kim cương, nhưng **không có số cụ thể**
  `[ĐO ĐƯỢC]` (cùng nguồn trên).
- Đối chiếu với số đã có: hồi sinh 30 kim cương/lần và đổi kỹ năng 30 kim cương/lần — nếu chỉ
  dựa vào nguồn quảng cáo miễn phí (30/ngày) thì **đúng một lần hồi sinh hoặc một lần đổi kỹ năng
  đã ngốn hết toàn bộ kim cương quảng cáo trong ngày** `[SUY ĐOÁN]` — số đo gốc lấy từ
  `slime-legion-apk-datamine.md` mục 3, số nguồn miễn phí lấy từ Mobile Gaming Hub ở trên.
- Code hiếm khi phát kim cương số lượng lớn hơn: 20–30 kim cương/code, không đều đặn hàng ngày
  ([Slime Legion Wiki — Codes](https://slime-legion.fandom.com/wiki/Codes)).

## 3. Vàng (Gold)

- **750 vàng/ngày** miễn phí bằng cách xem quảng cáo `[ĐO ĐƯỢC]`
  ([Mobile Gaming Hub — Slime Legion Beginners Guide and Tips](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Loot Treasures** — chế độ chơi ngoài cốt truyện, mô tả nguyên văn "nơi người chơi có thể nhận
  lượng lớn Vàng", có thưởng lần-đầu-qua-ải riêng cho từng stage, **mở cửa Thứ 2/4/6/CN, 00:00–23:59
  UTC** `[ĐO ĐƯỢC]` ([Slime Legion Wiki — Loot Treasures](https://slime-legion.fandom.com/wiki/Loot_Treasures)).
  Không có số vàng cụ thể mỗi stage/mỗi lần — trang chỉ mô tả định tính.
- Review Google Play (Nick S, 23/9/2024) ghi: "phần thưởng miễn phí hàng ngày trong shop cần xem
  8 quảng cáo" — không phải số vàng trực tiếp nhưng liên quan tới chi phí-thời-gian để lấy quà
  ngày `[ĐO ĐƯỢC]` ([Google Play — Slime Legion](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game)).
- **Tomb Adventure** — chế độ song song với Loot Treasures nhưng cho **mảnh hero (Monster shards)**
  chứ không phải vàng, mở Thứ 3/5/7/CN 00:00–23:59 UTC `[ĐO ĐƯỢC]`
  ([Slime Legion Wiki — Tomb Adventure](https://slime-legion.fandom.com/wiki/Tomb_Adventure)) — ghi
  vào đây để đối chiếu, vì hai chế độ này bổ sung cho nhau theo lịch trong tuần (không trùng ngày).

## 4. Idle/AFK/Patrol

**KHÔNG TÌM ĐƯỢC NGUỒN.** Đã đọc toàn bộ các trang có khả năng liên quan trên wiki (`Game Modes`,
`Starting Your Game`, `Slime Legion Starter Guide`, `FAQ`) và lịch sử cập nhật App Store — không
nơi nào nhắc tới thu nhập ngoại tuyến, chế độ tuần tra (patrol), hay giới hạn giờ tích luỹ offline.
Mô tả app trên App Store cũng chỉ nói "roguelike tower defense", không có từ khoá "idle"/"offline"/
"AFK" nào ([App Store — Slime Legion](https://apps.apple.com/us/app/slime-legion/id1664686966)).

⚠️ Cảnh báo trộn nhầm game: rất nhiều kết quả tìm kiếm trả về **"Legend of Slime: Idle RPG"**
(`com.loadcomplete.slimeidle`) — game này CÓ AFK reward tới 12 giờ tích luỹ, x2 bằng quảng cáo
([Google Play — Legend of Slime: Idle RPG War](https://play.google.com/store/apps/details?id=com.loadcomplete.slimeidle)).
Đây là **game khác**, không phải Slime Legion của Perfeggs — số 12 giờ đó **không được dùng** cho
tài liệu này, chỉ ghi lại để tránh agent khác nhầm lẫn khi tìm lại.

## 5. Nhiệm vụ ngày/tuần

- **Daily Challenge**: mở khoá sau khi qua xong **Main Story Chapter 7**; làm mới mỗi ngày; có
  **3 thử thách/ngày**, mỗi ngày đổi buff/debuff và quái khác nhau; mô tả "thưởng hào phóng khi
  hoàn thành" nhưng **không liệt kê số lượng cụ thể** `[ĐO ĐƯỢC]`
  ([Slime Legion Wiki — Daily Challenge](https://slime-legion.fandom.com/wiki/Daily_Challenge)).
- Không tìm thấy trang riêng cho "nhiệm vụ tuần" (Weekly Quest) — chỉ có 2 chế độ định kỳ theo
  tuần là Loot Treasures (T2/4/6/CN) và Tomb Adventure (T3/5/7/CN), xem mục 3 — có thể đây chính
  là "nhiệm vụ tuần" theo cách hiểu rộng, nhưng wiki không gọi tên chúng là "quest" `[SUY ĐOÁN]`.

## 6. Battle Pass

- Có ít nhất **2 gói mùa** bán qua IAP, giá lấy trực tiếp từ danh sách In-App Purchase trên trang
  App Store `[ĐO ĐƯỢC]` ([App Store — Slime Legion](https://apps.apple.com/us/app/slime-legion/id1664686966)):

| Tên IAP | Giá (USD) |
|---|---|
| `BATTLEPASS` | 11,99 |
| `ADVANCEBATTLEPASS` (bản nâng cao) | 14,99 |
| `Pass Activity` | 9,99 (chưa rõ có phải cùng hệ battle pass hay pass sự kiện riêng) |

- Mobile Gaming Hub xác nhận **có thể mua thẳng bậc tiếp theo bằng kim cương** (không chỉ bằng
  tiền thật), và "hoàn thành nhiệm vụ sự kiện cho thưởng theo mốc, mốc lớn hơn cho thưởng lớn hơn"
  `[ĐO ĐƯỢC]` ([Mobile Gaming Hub — Slime Legion Beginners Guide and Tips](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Số bậc, mốc thưởng cụ thể theo bậc, và thời hạn mùa: KHÔNG TÌM ĐƯỢC NGUỒN.**

## 7. Guild

- **Tính năng Guild ra mắt ở bản 2.6.0 (29/09/2024)**, patch note ghi nguyên văn: "Feature [Guild]
  Now Live! [Demon Conquest] Guild Boss Open [Guild Expedition] Team Up to Challenge Bosses"
  `[ĐO ĐƯỢC]` ([App Store — Slime Legion, mục lịch sử phiên bản](https://apps.apple.com/us/app/slime-legion/id1664686966)).
  → Vậy game có 2 nội dung guild: **Demon Conquest** (đánh boss guild) và **Guild Expedition**
  (đánh boss theo đội nhóm) — cái thứ hai khớp với "Guild Team Dungeon" trong yêu cầu nghiên cứu,
  nhưng đây chỉ là tên tính năng, chưa có số liệu bên trong.
- **Cơ chế đóng góp, công thức thưởng, và Guild Expedition cho vật phẩm gì: KHÔNG TÌM ĐƯỢC NGUỒN.**
  Không có trang wiki nào tên "Guild"; không guide nào (Mobile Gaming Hub, TalkAndroid, AppGamer,
  ProGameGuides, TheClashify) nhắc tới guild dù chỉ một câu.

---

## 8. Tổng kết — mục nào có số thật, mục nào trắng

| Mục | Trạng thái |
|---|---|
| Trần/hồi Stamina, chi phí mỗi ải | **Trắng hoàn toàn** — không nguồn nào có, kể cả code quà cũng chỉ cho biết Stamina tồn tại (bội số 10) |
| Mua thêm Stamina bằng gem + giá + giới hạn/ngày | **Trắng hoàn toàn** |
| Kim cương miễn phí | Có 1 số: 30/ngày qua quảng cáo (~900/tháng) |
| Vàng ngoài ải chính | Có 1 số (750/ngày quảng cáo) + 1 chế độ định tính (Loot Treasures, có lịch nhưng không có số vàng/lần) |
| Idle/AFK/Patrol | **Trắng hoàn toàn** — có khả năng Slime Legion không có hệ thống này (khác với "Legend of Slime" hay bị nhầm) |
| Nhiệm vụ ngày/tuần | Có khung (Daily Challenge: mở sau Chapter 7, 3 thử thách/ngày) nhưng **không có số thưởng** |
| Battle Pass | Có giá bán (11,99$ / 14,99$) + cơ chế mua bậc bằng gem, **không có số bậc/mốc thưởng** |
| Guild | Có tên 2 tính năng + ngày ra mắt (2.6.0, 29/09/2024), **không có số đóng góp/thưởng** |

**Kết luận chung**: cộng đồng quốc tế xoay quanh Slime Legion (Perfeggs) rất mỏng — wiki fandom
chỉ 26 trang, không có trang kinh tế; các trang guide lớn (Game8, ProGameGuides, TheClashify) chỉ
có đúng 1 bài tier-list mỗi nơi, không có bài kinh tế/beginner-currency riêng. Rất có thể **mảng
Stamina bị mã hoá trong APK là nguồn duy nhất từng tồn tại** cho số liệu này — không có bản sao
công khai nào trên internet tại thời điểm tra cứu (2026-09-03).
