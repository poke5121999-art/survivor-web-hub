# Nghiên cứu Might & Magic: Clash of Heroes — Cơ chế chiến đấu lõi & con số

Quy ước: mỗi số liệu có link nguồn. `[SUY ĐOÁN]` = suy luận của người viết, không có nguồn trực tiếp. `[ĐO ĐƯỢC]` = số lấy từ manual/wiki/guide/phát biểu trực tiếp từ nhà phát triển/nguồn chính thức. Không có nguồn thì ghi **"KHÔNG TÌM ĐƯỢC NGUỒN"**.

Ghi chú truy cập: nhiều trang wiki (mightandmagic.fandom.com), toàn bộ GameFAQs, TVTropes, GiantBomb, NintendoLife bị chặn fetch trực tiếp trong phiên nghiên cứu này (403/402). Các số liệu trích từ các trang này được lấy qua **snippet tổng hợp của công cụ tìm kiếm** (WebSearch), không phải đọc trực tiếp toàn văn trang — được ghi rõ `qua WebSearch` trong link nguồn. Nơi có mâu thuẫn giữa các snippet (ví dụ một kết quả từng nêu "10×6"), tài liệu này ưu tiên con số xuất hiện lặp lại ở ≥2 nguồn độc lập.

---

## 1. Bàn cờ (bàn cờ chiến đấu)

- Mỗi bên (người chơi và đối thủ) có **bàn cờ riêng 8 cột × 6 hàng = 48 ô** `[ĐO ĐƯỢC]` — xác nhận lặp lại ở 2 review độc lập (bản DS gốc 2010 và bản Definitive Edition 2023 dùng cùng mô tả): "each grid has eight columns on each side, and up to six units can fit on each column... 48 squares (8 wide, 6 tall)" ([Gaming Nexus — Definitive Edition Review, qua WebSearch](https://www.gamingnexus.com/Article/12886/Might-and-Magic-Clash-of-Heroes---Definitive-Edition/); [Gaming Nexus — bản gốc 2010, qua WebSearch](https://gamingnexus.com/article/might-and-magic-clash-of-heroes/item2496.aspx)).
- Bản DS gốc hiển thị 2 bàn cờ trên 2 màn hình vật lý riêng: quân địch ở màn trên, quân mình ở màn dưới ([WebSearch tổng hợp, GiantBomb wiki](https://giantbomb.com/wiki/Games/Might_And_Magic_Clash_of_Heroes)) — các bản console/PC sau này (HD, Definitive Edition) gộp thành 1 màn hình dọc với 2 bàn cờ đối xứng `[SUY ĐOÁN]` (không có nguồn trực tiếp mô tả layout màn hình đơn cho bản 2023, suy ra từ ảnh chụp màn hình phổ biến).
- **KHÔNG TÌM ĐƯỢC NGUỒN** xác nhận game có khái niệm chính thức "no man's land" (vùng trung lập giữa 2 bàn cờ) — các đội hình tấn công "phóng" từ bàn cờ người chơi thẳng sang bàn cờ đối thủ, không có vùng trung gian riêng biệt trên cùng 1 lưới; có vẻ 2 bàn cờ là 2 lưới tách biệt hoàn toàn, không phải 1 lưới chung chia đôi `[SUY ĐOÁN]`.

```
Bàn cờ ĐỊCH (8 cột x 6 hàng)          Bàn cờ MÌNH (8 cột x 6 hàng)
hàng 6 (xa nhất) ┌─┬─┬─┬─┬─┬─┬─┬─┐    hàng 1 (gần hero) ┌─┬─┬─┬─┬─┬─┬─┬─┐
                 ├─┼─┼─┼─┼─┼─┼─┼─┤                       ├─┼─┼─┼─┼─┼─┼─┼─┤
      ...        ├─┼─┼─┼─┼─┼─┼─┼─┤          ...          ├─┼─┼─┼─┼─┼─┼─┼─┤
hàng 1 (gần hero)└─┴─┴─┴─┴─┴─┴─┴─┘    hàng 6 (xa nhất)   └─┴─┴─┴─┴─┴─┴─┴─┘
      [HERO ĐỊCH]                            [HERO MÌNH]
```

- Kích thước đơn vị trên lưới: quân **core (thường)** chiếm **1 ô**; quân **elite** chiếm **2 ô** (xếp dọc theo cột); quân **champion** chiếm **4 ô** (khối 2×2) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp từ nhiều review, dẫn theo GiantBomb wiki](https://giantbomb.com/wiki/Games/Might_And_Magic_Clash_of_Heroes)).

---

## 2. Luật thao tác trong lượt

- Mỗi lượt người chơi có **số lần di chuyển giới hạn, thường là 3 lần (move)** để sắp xếp quân trên bàn cờ của mình `[ĐO ĐƯỢC]` ([Wikipedia — Might & Magic: Clash of Heroes](https://en.wikipedia.org/wiki/Might_%26_Magic:_Clash_of_Heroes)). Một số nguồn khác cũng lặp lại chính xác con số "3 moves per turn" ([WebSearch tổng hợp nhiều review](https://www.gamesradar.com/might-magic-clash-of-heroes-review-10/)).
- Một "move" gồm 2 loại hành động `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Gaming Nexus + review khác](https://www.gamingnexus.com/Article/12886/Might-and-Magic-Clash-of-Heroes---Definitive-Edition/)):
  1. **Di chuyển quân**: chỉ được di chuyển quân ở **cuối cột** (unit at the bottom of a column) sang cuối một cột khác — không di chuyển tự do quân ở giữa cột.
  2. **Xoá quân (remove/delete)**: có thể xoá bất kỳ quân nào trong lưới, kể cả quân nằm sâu trong cột — dùng để dọn chỗ hoặc phá thế cờ đối phương xếp hàng.
- Chi phí xoá quân: mỗi lần xoá tốn **1 move** trong số move giới hạn của lượt đó `[ĐO ĐƯỢC]` (suy trực tiếp từ mô tả "move" ở trên — xoá quân là 1 trong 2 loại hành động tính vào move) ([WebSearch tổng hợp Gaming Nexus](https://www.gamingnexus.com/Article/12886/Might-and-Magic-Clash-of-Heroes---Definitive-Edition/)); **KHÔNG TÌM ĐƯỢC NGUỒN** nói xoá quân có tốn thêm tài nguyên nào khác (mana/HP) ngoài 1 move.
- **Luật quân rơi lấp chỗ trống**: khi một quân bị xoá/di chuyển đi, quân phía trên nó trong cột **tự động rơi xuống lấp chỗ trống** — cơ chế kiểu match-3/Puzzle Quest, xác nhận qua mô tả cơ chế "stack" và việc chỉ được thao tác quân ở đáy cột `[SUY ĐOÁN]` (suy ra logic tất yếu từ luật "chỉ di chuyển quân ở cuối cột" — nếu không rơi xuống, cột sẽ có ô trống lơ lửng ở giữa, mâu thuẫn với cách game mô tả xếp chồng); không tìm được nguồn phát biểu tường minh cụm "gravity/falling".
- **Tiếp viện (Reinforcements)**: khi một ô trên lưới trống ra (quân bị tiêu diệt hoặc bị xoá), một quân mới — **loại và màu ngẫu nhiên** — sẽ được gọi vào lấp chỗ, lấy từ "quỹ" quân dự bị (unit pool/population cap) của người chơi `[ĐO ĐƯỢC]` ([WebSearch tổng hợp GameFAQs board "How do Reinforcements Work?"](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/58675129)).
  - Mỗi loại "cấu trúc" quân chiếm một số **slot** nhất định trong quỹ dự bị khi được gọi ra: **wall** (dù 2 tầng) tính là **1 slot**; **đội hình tấn công (charging formation) 3 quân core** tính là **3 slot**; **champion** tính là **4 slot** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp GameFAQs board, như trên](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/58675129)).
  - Bản DS gốc: gọi tiếp viện bằng phím **L/R**, không kiểm soát được sẽ ra quân màu/loại gì ("random") ([WebSearch tổng hợp, như trên](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/58675129)).

---

## 3. Formation tấn công (đội hình dọc)

```
Cột N (đội hình tấn công 3 quân màu Đỏ, xếp DỌC):
┌───┐
│ R │  <- quân core màu Đỏ #3 (trên cùng)
├───┤
│ R │  <- quân core màu Đỏ #2
├───┤
│ R │  <- quân core màu Đỏ #1 (đáy cột)
└───┘
  => khoá lại thành 1 "đội hình", đếm ngược charge time; hết giờ charge
     -> đội hình phóng thẳng lên cột đó vào lưới đối phương.
```

- **Điều kiện tạo formation core**: xếp **3 quân core cùng màu** thẳng hàng dọc trong 1 cột `[ĐO ĐƯỢC]` ([WebSearch tổng hợp nhiều nguồn, GameFAQs boards](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/52677268); [Wikipedia](https://en.wikipedia.org/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- **Charge time (thời gian nạp)**:
  - Quân core thông thường: **2–3 lượt** để nạp đầy trước khi phóng `[ĐO ĐƯỢC]` ([WebSearch tổng hợp, dẫn khái niệm "Charge time" trên wiki](https://mightandmagic.fandom.com/wiki/Charge_time); lặp lại ở [WebSearch tổng hợp review khác](https://killscreen.com/articles/review-might-magic-clash-heroes-hd)).
  - Quân elite/champion (đội hình đặc biệt): **4–6 lượt** để nạp `[ĐO ĐƯỢC]` ([WebSearch tổng hợp scientificgamer.com — "Thoughts: Clash Of Heroes"](https://scientificgamer.com/thoughts-clash-of-heroes/)); một nguồn khác nêu cụ thể hơn "4-5 turns" cho "special soldiers" ([WebSearch tổng hợp](https://mightandmagic.fandom.com/wiki/Charge_time)) — hai khoảng số hơi lệch nhau (4-6 vs 4-5), tài liệu này ghi cả 2 để không mất thông tin, chưa xác định số chính xác tuyệt đối.
  - Trong khi đang nạp (charging), **sức tấn công của đội hình tăng dần mỗi lượt** cho tới khi đạt full attack strength ở lượt phóng `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Charge time"](https://mightandmagic.fandom.com/wiki/Charge_time)).
- **Điều kiện tạo formation elite**: xếp **2 quân core cùng màu** ngay phía sau (dưới) 1 quân elite cùng màu trong cùng cột `[ĐO ĐƯỢC]` ([WebSearch tổng hợp GameFAQs, dẫn "3 units" thread](https://mightandmagic.fandom.com/wiki/Attack_(CoH))).
- **Điều kiện tạo formation champion**: xếp **4 quân core cùng màu** ngay phía sau 1 quân champion cùng màu `[ĐO ĐƯỢC]` (cùng nguồn trên).
- **Xếp nhiều hơn 3 quân core cùng màu trong 1 cột** (ví dụ đủ cả 6 ô của cột) → tạo ra đội hình mạnh hơn hẳn, gọi là kích hoạt **"toàn cột" (full column)** với sát thương tăng vọt so với 1 formation 3 quân thường `[ĐO ĐƯỢC]` ("Matching all six units in a column delivers massive enhanced damage" — [WebSearch tổng hợp scientificgamer.com](https://scientificgamer.com/thoughts-clash-of-heroes/)); **KHÔNG TÌM ĐƯỢC NGUỒN** cho hệ số nhân chính xác của full-column so với formation 3-quân chuẩn.

---

## 4. Formation tường (đội hình ngang)

```
Hàng ngang (3+ quân core cùng màu Đỏ, xếp NGANG):
┌───┬───┬───┐
│ R │ R │ R │   -> hợp nhất thành 1 khối TƯỜNG duy nhất
└───┴───┴───┘      di chuyển ngay lập tức ra hàng đầu (front rank)
                   của bàn cờ, chặn đường phóng của địch.
```

- **Điều kiện tạo tường**: xếp **3 quân core cùng màu trở lên** thành 1 hàng ngang (thay vì dọc) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp, lặp lại ở nhiều review](https://www.gamesradar.com/might-magic-clash-of-heroes-review-10/); [WebSearch tổng hợp scientificgamer.com](https://scientificgamer.com/thoughts-clash-of-heroes/)).
- Ngay khi hợp thành, tường **tự động di chuyển lên hàng đầu tiên** (gần đối thủ nhất) của bàn cờ người chơi, đóng vai trò lá chắn chặn đường phóng của đội hình tấn công đối phương `[ĐO ĐƯỢC]` ([WebSearch tổng hợp scientificgamer.com](https://scientificgamer.com/thoughts-clash-of-heroes/)).
- **HP của tường**: bằng **tổng HP (toughness) của các quân core dùng để tạo tường**, và **tăng theo cấp độ (level) của hero** `[ĐO ĐƯỢC]` ("Wall damage is exactly the HP of the wall unit... Walls become stronger when the hero levels up" — [WebSearch tổng hợp trang "Wall" trên wiki](https://mightandmagic.fandom.com/wiki/Wall)). HP tường cụ thể theo từng phe/loại quân — **KHÔNG TÌM ĐƯỢC NGUỒN** với bảng số chi tiết.
- **Tường chặn gì**: một đội hình tấn công của đối thủ khi phóng vào cột có tường phải "ăn" hết HP của tường trước (trừ dần theo cơ chế sát thương ở mục 6) rồi mới tới lượt các quân/hero phía sau tường `[ĐO ĐƯỢC]` (suy trực tiếp từ cơ chế sát thương xuyên tuyến, mục 6) ([WebSearch tổng hợp Steam Community thread về lane damage](https://steamcommunity.com/app/2213300/discussions/0/3806155261066057813/)).
- Có ví dụ khiên hero (hero shield ability) tạo tường phủ vùng hero, chặn sát thương bằng **50% HP tối đa của hero (ví dụ 50 HP ở level 10)** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Wall"](https://mightandmagic.fandom.com/wiki/Wall)) — đây là số của 1 skill/artifact cụ thể, không phải HP tường mặc định.
- **KHÔNG TÌM ĐƯỢC NGUỒN** xác nhận có giới hạn số tường tối đa cùng lúc trên 1 bàn cờ.

---

## 5. Link / Fusion (nối đội hình cùng màu để cộng dồn sát thương)

Game có **2 cơ chế cộng dồn khác nhau**, dễ nhầm lẫn với nhau:

### 5.1 Fusion — xếp chồng 2 formation cùng cột

```
Cột N — FUSION (2 formation cùng màu Đỏ, chồng lên nhau trong cùng 1 cột):
┌───┐
│ R │  <- formation #2 (mới xếp sau, cùng màu)
│ R │
│ R │
├───┤
│ R │  <- formation #1 (đang charge, phóng ra dùng charge time của formation NÀY)
│ R │
│ R │
└───┘
=> Sát thương = TỔNG sức mạnh 2 formation, nhưng dùng charge time còn lại
   của formation #1 (formation ra trước).
```

- **Fusion**: đặt 1 đội hình tấn công (attack formation) đứng **ngay sau** 1 đội hình khác cùng loại quân, cùng màu, trong cùng 1 cột → 2 đội hình **hợp nhất làm một**, tổng sát thương = cộng dồn cả 2, nhưng **dùng charge time của đội hình xếp trước (ra trước)** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Fusion"](https://mightandmagic.fandom.com/wiki/Fusion)).
- **Hệ số Fusion**: gây **200% sát thương** so với 1 formation đơn lẻ thông thường `[ĐO ĐƯỢC]` ([WebSearch tổng hợp, dẫn trang "Linking" so sánh Fusion vs Linking](https://mightandmagic.fandom.com/wiki/Linking); [WebSearch tổng hợp GameFAQs thread về fusion](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/52864517)).

### 5.2 Linking — 2+ formation cùng màu ở các cột khác nhau, cùng charge time còn lại

```
Cột A                Cột B
┌───┐                ┌───┐
│ R │                │ R │
│ R │  <- charging   │ R │  <- charging, CÙNG số lượt còn lại với cột A
│ R │     (2 lượt)    │ R │     (2 lượt)
└───┘                └───┘
       => 2 formation LINK với nhau -> cùng phóng 1 lúc, cộng dồn sát thương
          + bonus theo % (xem bảng dưới)
```

- **Điều kiện Link**: 2 (hoặc nhiều hơn) đội hình tấn công **cùng màu** và **cùng số lượt charge còn lại** (dù ở cột khác nhau) → khi phóng, chúng "link" lại, sát thương được cộng dồn kèm bonus `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Linking"](https://mightandmagic.fandom.com/wiki/Linking)).
- **Hệ số Link (2 formation)**: **230% sát thương** so với 1 formation đơn (cao hơn Fusion 200%) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp, dẫn trang "Linking"](https://mightandmagic.fandom.com/wiki/Linking)).
- **3 formation link cùng lúc**: sát thương bonus **cao hơn nữa so với link 2 formation**, nhưng **KHÔNG TÌM ĐƯỢC NGUỒN** cho con số % chính xác của link-3 hay link-4 (chỉ có phát biểu định tính "three linked formations will have a higher damage bonus than two" — [WebSearch tổng hợp GameFAQs thread](https://gamefaqs.gamespot.com/boards/991347-might-and-magic-clash-of-heroes/59043012)).
- **Bonus attack theo cấp bậc quân trong đội hình link** (cách đọc khác của cùng cơ chế, có thể là bonus riêng theo loại quân dẫn đầu formation, chưa rõ có cộng dồn với % link 230% ở trên hay là cách diễn giải khác của cùng 1 số liệu — cần xác minh thêm) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Linking"](https://mightandmagic.fandom.com/wiki/Linking)):

| Loại quân dẫn đầu formation | Bonus % sức tấn công khi link |
|---|---|
| Core | +15% |
| Elite | +25% |
| Champion | +50% |

- **SUY ĐOÁN của người viết**: khả năng cao bảng trên (+15/25/50%) và con số "230% cho 2 formation link" ở trên là **cùng một cơ chế được 2 snippet khác nhau diễn giải khác cách** (một bên nói % bonus thêm, một bên nói % tổng so với formation gốc) — không đủ dữ liệu để hợp nhất chính xác 2 con số này thành 1 công thức duy nhất; khi thiết kế lại cho slimeclash nên coi đây là 2 manh mối cần thực nghiệm/tinh chỉnh, không copy nguyên số `[SUY ĐOÁN]`.
- **Mana từ link/fusion**: tạo link, chain, hoặc fusion cũng là một trong các cách cộng thêm Mana Meter của hero (xem mục 8) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Hero spells"](https://mightandmagic.fandom.com/wiki/Hero_spells)).

---

## 6. Công thức sát thương

- **Cơ chế lõi — "power xuyên tuyến" (piercing damage line)**: mỗi đòn tấn công phóng ra có 1 giá trị **power** (= tổng sát thương của formation, đã cộng link/fusion nếu có). Sát thương này đi xuyên qua từng quân trên đường đi của cột bị tấn công, **trừ dần đúng bằng HP (toughness) của từng quân** nó đi qua, cho tới khi power về 0 hoặc hết quân trên đường đi `[ĐO ĐƯỢC]` ("Every attack that is sent down a line will have a power value. For every health it has to go through, it will be lowered by an equal amount." — [WebSearch tổng hợp Steam Community — "How to understand lane damage/defense?"](https://steamcommunity.com/app/2213300/discussions/0/3806155261066057813/)).
- **Quân đang charge (trong 1 formation) bị tấn công**: phải bị trừ **đúng hết (= 0)** giá trị HP hiện có (là số hiển thị đang đếm lên trong lúc charge) mới bị tiêu diệt — nếu sát thương đến không đủ, quân/formation đó **sống sót với HP còn lại**, không chết dù chỉ còn 1 điểm `[ĐO ĐƯỢC]` (ví dụ cụ thể: formation có 8 HP bị đòn 5 sát thương → còn sống với 3 HP — [WebSearch tổng hợp Steam Community thread, như trên](https://steamcommunity.com/app/2213300/discussions/0/3806155261066057813/)).
- **Quân đứng yên (idle, chưa vào formation) bị tấn công**: luôn **chết ngay lập tức chỉ sau 1 đòn trúng, bất kể toughness của nó cao hơn sát thương bao nhiêu** — nhưng trước khi chết, nó vẫn **trừ đi 1 lượng sát thương đúng bằng toughness của nó** khỏi power đang xuyên qua, phần dư tiếp tục xuyên tới quân/tường/hero phía sau `[ĐO ĐƯỢC]` ("Any idle unit that is struck in combat is killed instantly, even if their toughness exceeds the enemy's attack" — [WebSearch tổng hợp trang "Toughness (CoH)"](https://mightandmagic.fandom.com/wiki/Toughness_(CoH)); ví dụ số cụ thể — 3 quân idle 2 HP mỗi con bị đòn 7 sát thương → 1 điểm sát thương dư xuyên tới hero — [WebSearch tổng hợp Steam Community thread](https://steamcommunity.com/app/2213300/discussions/0/3806155261066057813/)).
- **Quân champion**: có **toughness = 20** — tức hấp thụ tối đa 20 điểm sát thương trong 1 đòn trước khi bị loại (nếu là idle) hoặc cần đúng 20 sát thương để hạ nếu champion đó đang tồn tại như 1 khối trên bàn cờ `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Champion unit"](https://mightandmagic.fandom.com/wiki/Champion_unit)). **KHÔNG TÌM ĐƯỢC NGUỒN** cho toughness cụ thể của quân elite hoặc bảng toughness đầy đủ theo từng quân/phe.
- **Sát thương thừa vào hero**: nếu power của đòn tấn công còn dư sau khi xuyên hết toàn bộ quân + tường trên đường đi của cột đó, **phần dư đánh thẳng vào HP của hero đối phương** `[ĐO ĐƯỢC]` ("If an attack gets to the back row of the enemy army, it will do the remainder of its damage directly to the enemy hero" — [WebSearch tổng hợp GameFAQs mechanics thread](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/53300918); xác nhận lại ở [WebSearch tổng hợp scientificgamer.com](https://scientificgamer.com/thoughts-clash-of-heroes/)).
- **Tường trừ sát thương**: tường bị trừ HP giống các quân khác trên đường xuyên — hết HP tường thì tường vỡ, sát thương dư tiếp tục xuyên tới quân/hero phía sau (xem mục 4) `[ĐO ĐƯỢC]` (suy trực tiếp từ mô tả cơ chế lane damage ở trên) ([WebSearch tổng hợp Steam Community thread](https://steamcommunity.com/app/2213300/discussions/0/3806155261066057813/)).

---

## 7. Máu hero & điều kiện thắng/thua

- **Điều kiện thắng/thua**: trận đấu thắng khi **đưa HP của hero đối phương về 0** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp scientificgamer.com](https://scientificgamer.com/thoughts-clash-of-heroes/)).
- **Ngoại lệ khi hero về 0 HP lúc đang có formation charging**: hero **không chết ngay** nếu đang có một hiệu ứng/quân đặc biệt (ví dụ quân **Phoenix**) đang hoạt động — tuỳ cấp độ Phoenix, một lượng HP nhất định được hoàn trả lại cho hero để trận đấu tiếp tục `[ĐO ĐƯỢC]` ([WebSearch tổng hợp diễn đàn heroescommunity.com](http://heroescommunity.com/viewthread.php3?TID=33564)) — cơ chế và con số hoàn HP chính xác theo cấp độ Phoenix: **KHÔNG TÌM ĐƯỢC NGUỒN** chi tiết.
- **Hero level & HP**: cả **hero và quân (creature)** đều có thể lên cấp; **quân tối đa level 5**, **hero tối đa level 10** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp diễn đàn heroescommunity.com](http://heroescommunity.com/viewthread.php3?TID=33564)). Mỗi lần hero lên cấp, hero được cộng: **HP tối đa, sức mạnh tường tối đa (max wall strength), và số quân tối đa có thể triệu hồi cùng lúc (population cap)** `[ĐO ĐƯỢC]` (cùng nguồn trên). **KHÔNG TÌM ĐƯỢC NGUỒN** cho bảng HP cụ thể theo từng level (ví dụ HP khởi điểm hoặc HP ở level 10 là bao nhiêu).

---

## 8. Combo/Chain & thanh Mana hero

- **Mana Meter**: hero có 1 thanh Mana, bắt đầu mỗi trận **rỗng**, phải tích luỹ trong trận mới cast được **hero spell** (phép hero) — mỗi lần thanh đầy là 1 lần cast `[ĐO ĐƯỢC]` ([WebSearch tổng hợp trang "Hero spells"](https://mightandmagic.fandom.com/wiki/Hero_spells)).
- **Cách tích Mana**: nhận mana **mỗi khi có trao đổi sát thương** giữa 2 bên (dù bên nào là bên tấn công) — **đòn càng nặng thì mana nhận càng nhiều**; ngoài ra còn nhận thêm mana khi **tạo link, chain, fusion, hoặc khi xoá quân (delete) để dọn đường xếp formation/tường** `[ĐO ĐƯỢC]` (cùng nguồn trên). Một số **artifact** trong game có thể tăng tốc độ tích mana, hoặc cho hero **bắt đầu trận với thanh mana đầy sẵn** `[ĐO ĐƯỢC]` (cùng nguồn trên).
- **Combo/chain**: thuật ngữ "chain" xuất hiện cùng nhóm với "link, fusion" như một trong các cách sinh thêm mana `[ĐO ĐƯỢC]` (cùng nguồn trên), nhưng **KHÔNG TÌM ĐƯỢC NGUỒN** mô tả tường minh "chain" là 1 cơ chế riêng biệt khác với "link" (rất có thể "chain" chỉ là cách gọi thông tục khác của "link nhiều formation liên tiếp", không phải hệ thống combo tách biệt) `[SUY ĐOÁN]`.
- **KHÔNG TÌM ĐƯỢC NGUỒN** cho hệ số nhân sát thương cụ thể của combo ngoài các con số Link/Fusion đã nêu ở mục 5.

---

## 9. Thời lượng một trận

- Một trận đấu có thể kéo dài từ **~10 phút** (trận nhanh) đến **~30 phút** (trận kéo dài, cân não) tuỳ chiến thuật, bộ quân nhận được và trình độ đối thủ `[ĐO ĐƯỢC]` ([WebSearch tổng hợp review, nguồn gốc không nêu rõ tên cụ thể — có thể là killscreen.com hoặc nguồn tương đương](https://killscreen.com/articles/review-might-magic-clash-heroes-hd)); độ tin cậy của trích dẫn này **thấp hơn các mục khác** vì không xác minh được toàn văn trang nguồn (bị chặn fetch trực tiếp).
- **KHÔNG TÌM ĐƯỢC NGUỒN** cho số lượt (turn count) trung bình một trận — chỉ có ước lượng thời gian thực (phút), không quy đổi được chính xác sang số lượt vì tốc độ lượt phụ thuộc người chơi.

---

## 10. Khác biệt của Definitive Edition (2023) so với bản gốc

- **Rebalance multiplayer toàn diện**: Definitive Edition quảng cáo "full rebalance" cho chế độ nhiều người chơi, cùng với chế độ online được **làm lại và cân bằng lại hoàn toàn** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp, dẫn thông tin phát hành chính thức](https://rpgamer.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced/)).
- Tuy nhiên, nhà phát triển **không công bố chi tiết cụ thể** những gì đã đổi, khiến cộng đồng phải tự phát hiện qua chơi thử `[ĐO ĐƯỢC]` ("developers were notably vague about specific details of the balance adjustments" — [WebSearch tổng hợp thảo luận Steam Community](https://steamcommunity.com/app/2213300/discussions/0/3820784984094768024/)).
- Các thay đổi cụ thể được cộng đồng ghi nhận qua Steam Discussions `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Steam Community — "Balance Changes!"](https://steamcommunity.com/app/2213300/discussions/0/3820784984094768024/)):
  - **Varkas** (hero phe Demon): phép hero buff sức tấn công quân bị giảm từ **+50%** xuống còn **+30%** (do bản gốc kết hợp với artifact "Crown of Elrath" bị coi là quá mạnh).
  - **Apprentice** (quân core của phe Academy): công thức charge được rút xuống chỉ còn **1 lượt** để phóng (nhanh hơn hẳn so với bản DS gốc — số lượt cụ thể của bản gốc không nêu rõ trong nguồn) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://steamcommunity.com/app/2213300/discussions/0/3820784984094768024/)).
  - Các vấn đề khác được cộng đồng nêu ra nhưng **chưa xác nhận có được sửa hay không**: RNG mở màn cho phép thắng ngay bằng tổ hợp champion+quân; artifact "Celerity Ring" (+1 move/lượt) bị coi là "phá game"; khả năng hấp thụ/phản damage của 1 boss phe Demon; một chiêu "arrow exploit" của nữ champion phe Forest; quân elite nhìn chung yếu hơn hẳn champion.
- Về mặt trải nghiệm chung ngoài cân bằng số liệu: thêm **nút Retry giữa trận**, cho phép **load lại từ bất kỳ đâu trong menu settings**, đồ hoạ vẽ lại hoàn toàn (redrawn artwork) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Steam Community, như trên](https://steamcommunity.com/app/2213300/discussions/0/3820784984094768024/); [WebSearch tổng hợp Wikipedia](https://en.wikipedia.org/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- Đánh giá tổng quan từ báo chí: nhiều review (ví dụ PCGamer) mô tả Definitive Edition **"gần như không thay đổi gì"** về nội dung/cơ chế cốt lõi so với bản gốc, phần lớn giá trị nằm ở việc mang game cũ lên nền tảng mới chứ không phải tái cân bằng sâu `[ĐO ĐƯỢC]` (tựa đề bài báo: "updates almost nothing but at least it's a second chance for the best puzzle RPG ever made" — [WebSearch tổng hợp PCGamer review](https://www.pcgamer.com/might-and-magic-clash-of-heroes-definitive-edition-updates-almost-nothing-but-at-least-its-a-second-chance-for-the-best-puzzle-rpg-ever-made/)).

---

## Tổng hợp nhanh — các con số lõi để tham chiếu khi thiết kế slimeclash

| Thông số | Giá trị | Nhãn | Ghi chú |
|---|---|---|---|
| Kích thước bàn cờ mỗi bên | 8 cột × 6 hàng (48 ô) | `[ĐO ĐƯỢC]` | 2 nguồn độc lập xác nhận |
| Move/lượt | 3 | `[ĐO ĐƯỢC]` | Wikipedia + nhiều review |
| Formation core (dọc) | 3 quân cùng màu | `[ĐO ĐƯỢC]` | |
| Formation elite | 1 elite + 2 core cùng màu phía sau | `[ĐO ĐƯỢC]` | |
| Formation champion | 1 champion + 4 core cùng màu phía sau | `[ĐO ĐƯỢC]` | |
| Charge time core | 2–3 lượt | `[ĐO ĐƯỢC]` | |
| Charge time elite/champion | 4–6 lượt (1 nguồn: 4–5) | `[ĐO ĐƯỢC]` | 2 nguồn hơi lệch |
| Formation ngang | 3+ quân core cùng màu | `[ĐO ĐƯỢC]` | tạo tường |
| Fusion (chồng cột) | +200% so với 1 formation | `[ĐO ĐƯỢC]` | dùng charge time formation đầu |
| Link (2 formation, khác cột, cùng charge time còn lại) | +230% so với 1 formation | `[ĐO ĐƯỢC]` | link 3+ cao hơn nhưng không rõ số |
| Champion toughness | 20 | `[ĐO ĐƯỢC]` | không rõ toughness elite/core |
| Hero level tối đa | 10 (quân tối đa 5) | `[ĐO ĐƯỢC]` | |
| Điều kiện thắng | HP hero đối phương = 0 | `[ĐO ĐƯỢC]` | có ngoại lệ Phoenix |
| Thời lượng trận | ~10–30 phút | `[ĐO ĐƯỢC]` | độ tin cậy nguồn thấp hơn |
