# Nghiên cứu Might & Magic: Clash of Heroes — Phe, đơn vị, hero, kỹ năng, thông số

Agent #4/6. Phạm vi: toàn bộ đơn vị + phe + hero + kỹ năng + thông số. KHÔNG đụng cơ chế lưới/sát thương chi tiết (agent #3) hay campaign (agent #5).

Quy ước: `[ĐO ĐƯỢC]` = số lấy từ wiki/trang dữ liệu/nguồn cộng đồng có bảng số cụ thể; `[SUY ĐOÁN]` = người viết tự suy luận; không có nguồn thì ghi **KHÔNG TÌM ĐƯỢC NGUỒN**. Mọi số liệu có link ngay sau câu.

**Ghi chú kỹ thuật quan trọng về nguồn:** Trang `mightandmagic.fandom.com` (wiki chính thức của series) chặn fetch trực tiếp (lỗi "402 Payment Required" khi WebFetch), nên số liệu từ wiki này được lấy qua kết quả tóm tắt của WebSearch (trích dẫn nguyên văn các cặp số "Toughness X → Y", "Charge damage X → Y" mà công cụ tìm kiếm trả về từ đúng trang wiki đó) — độ tin cậy tương đương đọc trực tiếp trang, nhưng không tự tay xác minh được toàn bộ HTML gốc. Trang fan site tiếng Ba Lan/Anh `clash.acidcave.net` (bút danh "Komnaty Kwasowej"/"Kwasowa Grota") fetch được trực tiếp và cho số liệu **khớp gần như tuyệt đối** với số liệu wiki chính thức ở trên (ví dụ Bone Dragon 110 dmg / 20 endurance khớp cả hai nguồn) → hai nguồn xác nhận chéo lẫn nhau, độ tin cậy cao.

---

## 0. Tổng quan hệ thống (áp dụng mọi phe)

- **5 phe** duy nhất: **Haven** (Hiệp sĩ/Con người), **Sylvan** (Yêu tinh rừng/Elf), **Necropolis** (Tử linh/Undead), **Inferno** (Ác quỷ/Demon), **Academy** (Pháp sư/Wizard) — kế thừa từ *Heroes of Might and Magic V* `[ĐO ĐƯỢC]` ([WebSearch tổng hợp mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Category:Clash_of_Heroes_factions); [Wikipedia — Might & Magic: Clash of Heroes](https://en.wikipedia.org/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- **3 cấp đơn vị** mỗi phe `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com qua WebSearch](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)):
  - **Core** (quân thường): 3 loại/phe, **chiếm 1 ô lưới**, tuyển **không giới hạn số lượng và miễn phí** trong story mode ([clash.acidcave.net qua WebFetch](https://www.clash.acidcave.net/jednostki_inferno.html); [mightandmagic.fandom.com qua WebSearch](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)).
  - **Elite**: **chiếm 2 ô lưới**, số lượng giới hạn, phải tuyển từ "static dwellings" (nhà quân) bằng tài nguyên `[ĐO ĐƯỢC]` ([clash.acidcave.net](https://www.clash.acidcave.net/jednostki_inferno.html); [mightandmagic.fandom.com qua WebSearch](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)).
  - **Champion**: **chiếm 4 ô lưới**, giới hạn số lượng, không thể dùng làm tường (wall) `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com/wiki/Champion_unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Champion_unit); [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_inferno.html)).
- **Kích hoạt đội hình tấn công**: xếp **2 core cùng màu** phía sau 1 elite thì elite được kích hoạt cùng tấn công; xếp **4 core cùng màu** phía sau 1 champion thì champion được kích hoạt `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com/wiki/Elite_unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Elite_unit); [mightandmagic.fandom.com/wiki/Champion_unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Champion_unit)). 3 core cùng màu xếp dọc = đội hình tấn công (attack); 3+ core cùng màu xếp ngang = tường phòng thủ (wall) `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com/wiki/Core_unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Core_unit)).
- **2 thông số chính mỗi đơn vị**: **Toughness** (độ "chịu đòn" — khi đơn vị đứng yên/idle bị tấn công, nó hấp thụ sát thương bằng đúng giá trị Toughness của nó; đây là giá trị gần nhất với "HP" mà game này có) và **Power/Charge damage** (sát thương khi đội hình nạp đầy) `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com/wiki/Toughness_(CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Toughness_(CoH)); [mightandmagic.fandom.com/wiki/Power_(CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Power_(CoH))). Trong lúc nạp, "current power" của đội hình tăng dần từ giá trị Toughness lên tới giá trị Power tối đa `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com/wiki/Power_(CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Power_(CoH))).
- **Lên cấp đơn vị**: quân **có lên cấp**, tối đa **cấp 5** cho đơn vị, cấp 5 → Toughness và Power đều tăng theo bảng số ở mục 1-5 dưới đây (cột "HP"/"Sát thương" trong các bảng ghi dạng `X → Y` = cấp 1 → cấp 5) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp diễn đàn + mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- **Màu đơn vị**: mỗi loại quân trong 1 phe có 1 màu cố định (dùng để ghép đội hình cùng màu) nhưng **KHÔNG TÌM ĐƯỢC NGUỒN** liệt kê chính xác bảng ánh xạ tên đơn vị ↔ màu cụ thể (ví dụ "Swordsman = xanh dương") cho từng phe; các nguồn chỉ xác nhận khái niệm "units of the same color" chứ không cho bảng tra cứu đầy đủ ([WebSearch tổng hợp Steam colour-blind thread](https://steamcommunity.com/app/61700/discussions/0/558748822338605060/); [mightandmagic.fandom.com/wiki/Core_unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Core_unit)). → Cột "Màu" trong các bảng dưới để trống/ghi "không xác định", KHÔNG bịa màu.

---

## 1. Haven (Hiệp sĩ)

| Tên | Loại | Màu | HP (Toughness, cấp1→5) | Sát thương (Power, cấp1→5) | Charge | Kích thước ô | Kỹ năng | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Swordsman | Core | ? | 2 → 3 | 6 → 11 | 3 lượt | 1 ô | Quân mạnh nhất trong core Haven `[ĐO ĐƯỢC]` | [Swordsman (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Swordsman_(CoH)) |
| Spearman | Core | ? | 1 → 2 | 4 → 9 | 3 lượt | 1 ô | Giáo dài → đánh phủ đầu (strike first) `[ĐO ĐƯỢC]` | [Spearman qua WebSearch](https://mightandmagic.fandom.com/wiki/Spearman); [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_przystan.html) |
| Archer | Core | ? | 1 → 3 | 3 → 8 | 2 lượt | 1 ô | Nhanh nhất Haven, bắn tên `[ĐO ĐƯỢC]` | [Archer (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Archer_(CoH)) |
| Knight | Elite | ? | 4 → 6 | 20 → 32 | 4 lượt | 2 ô | Trong lúc nạp, nhận khiên chắn = **50%** (acidcave) / **40%** (wiki) sức mạnh tối đa — 2 nguồn lệch nhau, ghi cả hai `[ĐO ĐƯỢC]` | [Knight (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Knight_(CoH)); [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_przystan.html) |
| Priestess | Elite | ? | 2 → 4 | 10 → 22 | 4 lượt | 2 ô | Hồi máu cho hero khi nạp, sau đó phóng năng lượng gây sát thương `[ĐO ĐƯỢC]` | [Priestess qua WebSearch](https://mightandmagic.fandom.com/wiki/Priestess); [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_przystan.html) |
| Angel | Champion | ? | 14 → 23 | 70 → 115 | 6 lượt | 4 ô | Hồi máu toàn bộ quân bị thương mỗi lượt, sau đó đánh 1 đòn "holy light" `[ĐO ĐƯỢC]` | [Angel (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Angel_(CoH)) |
| Griffin | Champion | ? | 12 → 21 | 55 → 100 | 5 lượt | 4 ô | "Battle Dive": gây sát thương = **2× sức mạnh hiện tại** khi đấu với đội hình mạnh hơn `[ĐO ĐƯỢC]` | [Griffin (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Griffin_(CoH)) |
| Sword Master (ẩn) | Champion | ? | 18 → 27 | 60 → 105 | 6 lượt | 4 ô | Mỗi lượt cắm kiếm xuống đất tạo sóng xung kích đánh dọc 1 cột địch `[ĐO ĐƯỢC]` | [Sword master (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Sword_master_(CoH)) |

**Hero Haven**: **Godric/Godryk** — kỹ năng "**Khiên của Godryk**": dựng khiên chắn cuối bãi 1 lượt = **50% HP tối đa** của hero, toàn bộ sức mạnh còn dư bị **nhân đôi** rồi bắn về phía quân địch `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_przystan.html](https://www.clash.acidcave.net/bohaterowie_przystan.html)). **Sir Varkas** — kỹ năng "**Blessed Charge**": toàn bộ đội hình đang tấn công nhận **+30% sức mạnh** `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_przystan.html](https://www.clash.acidcave.net/bohaterowie_przystan.html)). **Carlyle** (DLC "I Am the Boss") — kỹ năng "Breath of Bile": biến ngẫu nhiên quân/tường địch cơ bản thành thức ăn, lượt sau ăn rồi nhổ vào hero địch `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_przystan.html](https://www.clash.acidcave.net/bohaterowie_przystan.html)). HP hero, mana pool, và chi phí mana/charge chính xác của từng phép: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 2. Sylvan (Yêu tinh rừng)

| Tên | Loại | Màu | HP (Toughness, cấp1→5) | Sát thương (Power, cấp1→5) | Charge | Kích thước ô | Kỹ năng | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Hunter | Core | ? | ? | ? (bắn tên sau 1 lượt) | 1 lượt | 1 ô | Nhanh nhất Sylvan `[ĐO ĐƯỢC]` | [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_sylwan.html) |
| Pixie | Core | ? | 1 → 2 | 1 → 5 | 2 lượt | 1 ô | Bụi phép rút mana từ hero `[ĐO ĐƯỢC]` | [Pixie (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Pixie_(CoH)) |
| Bear | Core | ? | 1 → 3 | 5 → 10 | 2 lượt | 1 ô | Chiến binh rừng mạnh mẽ `[ĐO ĐƯỢC]` | [Bear (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Bear_(CoH)) |
| Druid | Elite | ? | 3 → 5 | 9 → 21 | 2 lượt | 2 ô | Dây leo phép: **+2 lượt charge** mỗi đội hình địch bị trúng `[ĐO ĐƯỢC]` | [Druid (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Druid_(CoH)) |
| Deer | Elite | ? | 3 → 5 | 16 → 28 | 3 lượt | 2 ô | Nhảy qua 1 hàng tường địch `[ĐO ĐƯỢC]` | [Deer qua WebSearch](https://mightandmagic.fandom.com/wiki/Deer) |
| Unicorn (ẩn) | Elite | ? | 4 → 6 | 14 → 26 | 2 lượt | 2 ô | Khi nạp, tạo khiên bảo vệ bản thân + các cột kề bên `[ĐO ĐƯỢC]` | [Unicorn (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Unicorn_(CoH)) |
| Treant | Champion | ? | 15 → 29 | 50 → 95 | 4 lượt | 4 ô | Dây leo lan khắp bãi mỗi lượt, hút máu địch chuyển cho hero mình `[ĐO ĐƯỢC]` | [Treant (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Treant_(CoH)) |
| Emerald Dragon | Champion | ? | 9 → 21 | 45 → 90 | 4 lượt | 4 ô | Rải vũng axit tồn tại 1 lượt, gây sát thương bất kỳ quân địch nào chạm vào `[ĐO ĐƯỢC]` | [Emerald dragon (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Emerald_dragon_(CoH)) |

**Hero Sylvan**: **Anwen** — "Rain of Arrows": hero bắn loạt tên vào địch `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_sylwan.html](https://www.clash.acidcave.net/bohaterowie_sylwan.html)). **Findan** — "Quick Strike": rút ngắn charge time của **toàn bộ** đội hình đang có xuống còn **1 lượt** `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_sylwan.html](https://www.clash.acidcave.net/bohaterowie_sylwan.html)). **Euny the Archdruid** (chỉ có ở Definitive Edition, boss multiplayer/quick battle độc quyền) — "Tranquility": kéo dài charge time đội hình địch thêm **2 lượt** và vô hiệu hóa đội hình đặc biệt vừa tạo gần nhất của địch `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_sylwan.html](https://www.clash.acidcave.net/bohaterowie_sylwan.html); [RPGamer — DE announcement](https://rpgamer.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced/)). HP/mana/chi phí chính xác: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 3. Necropolis (Tử linh)

| Tên | Loại | Màu | HP (Toughness, cấp1→5) | Sát thương (Power, cấp1→5) | Charge | Kích thước ô | Kỹ năng | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Skeleton | Core | ? | 1 → 3 | 4 → 9 | 2 lượt | 1 ô | Dùng đầu lâu làm chùy `[ĐO ĐƯỢC]` | [Skeleton (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Skeleton_(CoH)) |
| Zombie | Core | ? | 1 → 2 | 3 → 8 | 2 lượt | 1 ô | Vết thương nhẹ cũng gây nhiễm trùng nặng `[ĐO ĐƯỢC]` | [Zombie (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Zombie_(CoH)) |
| Ebon Guard | Core | ? | 1 → 3 | 5 → 10 | 3 lượt | 1 ô | Mạnh nhất core Necropolis, dùng dao nghi lễ `[ĐO ĐƯỢC]` | [Ebon guard qua WebSearch](https://mightandmagic.fandom.com/wiki/Ebon_guard) |
| Vampire | Elite | ? | ~3 → 5 | 13 → 25 | 4 lượt | 2 ô | Hút máu địch, chuyển hồi HP cho hero `[ĐO ĐƯỢC]` | [Vampire (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Vampire_(CoH)) |
| Ghost | Elite | ? | 5 (acidcave) | 25 (acidcave) | 3 lượt | 2 ô | Nhận sát thương khi bị tấn công nhưng **không bị ảnh hưởng** (không chết/không giảm sức mạnh) `[ĐO ĐƯỢC]` | [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_nekropolis.html) |
| Bone Dragon | Champion | ? | 11 → 20 | 60 → 110 | 5 lượt | 4 ô | Nuốt quân địch đang đứng yên (idle), dùng endurance của chúng để tăng sức tấn công `[ĐO ĐƯỢC]` | [Bone dragon (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Bone_dragon_(CoH)) |
| Death Knight | Champion | ? | 15 → 24 | 60 → 105 | 6 lượt | 4 ô | Hút sức mạnh từ quân địch khi tấn công `[ĐO ĐƯỢC]` | [Death knight (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Death_knight_(CoH)) |
| Wraith (ẩn) | Champion | ? | 4 → 13 | 20 → 55 | 5 lượt | 4 ô | Gây **chết tức thời** cho bất kỳ sinh vật nào chạm phải, kể cả hero địch `[ĐO ĐƯỢC]` | [Wraith (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Wraith_(CoH)) |

**Hero Necropolis**: **Fiona** — "Blood Ritual": toàn bộ quân idle biến thành quả cầu năng lượng gom lại một chỗ, chuẩn bị một đòn hủy diệt hero có thể tung ra bất cứ lúc nào `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_nekropolis.html](https://www.clash.acidcave.net/bohaterowie_nekropolis.html)). **Markal** — "March of Death": ra lệnh cho **toàn bộ elite và champion** đang có trên bãi chiến lập tức xung phong (charge ngay lập tức) `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_nekropolis.html](https://www.clash.acidcave.net/bohaterowie_nekropolis.html)). **Ludmila** (DLC) — "Spider Swarm": triệu hồi bầy nhện lao xuống 1 cột đã chọn, lan ra toàn bãi nhưng gây sát thương nặng nhất ở đúng cột đó `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_nekropolis.html](https://www.clash.acidcave.net/bohaterowie_nekropolis.html)). HP/mana/chi phí chính xác: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 4. Inferno (Ác quỷ)

| Tên | Loại | Màu | HP (Toughness, cấp1→5) | Sát thương (Power, cấp1→5) | Charge | Kích thước ô | Kỹ năng | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Horned Demon | Core | ? | 1 → 3 | 6 → 11 | 3 lượt | 1 ô | Sát thương cao nhất trong core Inferno (móng vuốt sắc) `[ĐO ĐƯỢC]` | [Horned demon (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Horned_demon_(CoH)) |
| Imp | Core | ? | 1 → 3 | 5 → 10 | 3 lượt | 1 ô | Phát nổ khi chạm địch, gây sát thương diện rộng + rút mana hero địch `[ĐO ĐƯỢC]` | [Imp (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Imp_(CoH)) |
| Hellhound | Core | ? | 1 → 3 | 4 → 9 | 2 lượt | 1 ô | Nhanh nhất core Inferno `[ĐO ĐƯỢC]` | [Hellhound (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Hellhound_(CoH)) |
| Succubus | Elite | ? | 7 | 37 | 4 lượt | 2 ô | Bắn **4** quả cầu lửa nổ, cũng gây sát thương cho quân kề bên mục tiêu `[ĐO ĐƯỢC]` | [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_inferno.html) |
| Nightmare | Elite | ? | 4 → 7 | 23 → 35 | 4 lượt | 2 ô | Mọi đội hình Nightmare tấn công **đồng thời**, bất kể charge time còn lại `[ĐO ĐƯỢC]` | [Nightmare (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Nightmare_(CoH)) |
| Sorcerer (ẩn) | Elite | ? | 7 | 29 | 3 lượt | 2 ô | Phép hắc ám giải tán đội hình địch ngay lập tức, khiến chúng không hoạt động `[ĐO ĐƯỢC]` | [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_inferno.html) |
| Abyssal Lord | Champion | ? | 11 → 20 | 60 → 105 | 5 lượt | 4 ô | Triệu hồi **4 mạch lửa** phun lên dọc 1 cột địch `[ĐO ĐƯỢC]` | [Abyssal lord (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Abyssal_lord_(CoH)) |
| Pit Fiend | Champion | ? | 13 → 22 | 60 → 115 | 5 lượt | 4 ô | Nghiền địch bằng kiếm hỗn mang rèn trong lửa địa ngục Sheogh; để lại xác cháy làm chướng ngại `[ĐO ĐƯỢC]` | [Pit fiend (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Pit_fiend_(CoH)) |

**Hero Inferno**: **Aidan** — "Stone Rain": bao quanh các bức tường do hero dựng lên bằng vầng lửa, vầng lửa đó tự đánh quân địch `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_inferno.html](https://www.clash.acidcave.net/bohaterowie_inferno.html)). **Jezebeth** — "Wall Cracker": tường địch phát nổ, gây sát thương cho quân ngay phía trên và bên cạnh tường đó `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_inferno.html](https://www.clash.acidcave.net/bohaterowie_inferno.html)). **Azexes** (DLC) — "Demonic Portal": triệu hồi cổng rộng **2 cột** ở khu vực hero trong **1 lượt**; đòn đánh của địch lượt sau bị chuyển hướng, giảm **50%** sức mạnh `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_inferno.html](https://www.clash.acidcave.net/bohaterowie_inferno.html)). HP/mana/chi phí chính xác: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 5. Academy (Pháp sư)

| Tên | Loại | Màu | HP (Toughness, cấp1→5) | Sát thương (Power, cấp1→5) | Charge | Kích thước ô | Kỹ năng | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Apprentice/Adept | Core | ? | 1 → 2 | 3 → 8 | 2 lượt | 1 ô | Ném cầu phép sát thương `[ĐO ĐƯỢC]` | [Apprentice (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Apprentice_(CoH)) |
| Gremlin | Core | ? | 3 (cấp tối đa, acidcave ghi 3) | 14 (acidcave) | 2 lượt | 1 ô | Đạn phép gây sát thương cao ở hàng đầu; sát thương giảm dần theo khoảng cách bay **(giảm 2 mỗi ô di chuyển)** `[ĐO ĐƯỢC]` | [WebSearch tổng hợp mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes); [clash.acidcave.net](https://www.clash.acidcave.net/jednostki_akademia.html) |
| Golem | Core | ? | 1 → 3 | 5 → 10 | 3 lượt | 1 ô | Cỗ máy mạnh mẽ, đánh bằng chùy `[ĐO ĐƯỢC]` | [Golem (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Golem_(CoH)) |
| Djinn | Elite | ? | 4 → 6 | 15 → 27 | 3 lượt | 2 ô | Đóng băng mọi đội hình bị trúng trong **3 lượt**; đội hình bị đóng băng dễ bị phá hơn `[ĐO ĐƯỢC]` | [Djinn (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Djinn_(CoH)) |
| Mage | Elite | ? | 4 → 6 | 17 → 29 | 4 lượt | 2 ô | Sét đánh xuyên qua các đội hình địch đang idle `[ĐO ĐƯỢC]` | [Mage (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Mage_(CoH)) |
| Rakshasa | Champion | ? | 10 → 21 | 50 → 95 | 5 lượt | 4 ô | Đòn đánh trừ luôn cả endurance lẫn mana của hero địch `[ĐO ĐƯỢC]` | [Rakshasa (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Rakshasa_(CoH)) |
| Titan | Champion | ? | 13 → 22 | 65 → 110 | 6 lượt | 4 ô | Sóng xung kích lan khắp bãi địch, phá hủy các tường liên kết `[ĐO ĐƯỢC]` | [Titan (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Titan_(CoH)) |
| Phoenix (ẩn) | Champion | ? | 16 → 25 | 70 → 115 | 5 lượt | 4 ô | Đánh dấu đường bằng lửa; hồi sinh đội hình của mình **1 lần** nếu chết trong lúc nó tấn công `[ĐO ĐƯỢC]` | [Phoenix (CoH) qua WebSearch](https://mightandmagic.fandom.com/wiki/Phoenix_(CoH)) |

**Hero Academy**: **Nadia** — "Lightning Strike": bắn ngẫu nhiên **5** tia sét khắp bãi địch, gây sát thương mọi quân bị trúng `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_akademia.html](https://www.clash.acidcave.net/bohaterowie_akademia.html)). **Cyrus** — "Explosive Staff": gậy phép gây sát thương khi va chạm, tồn tại **2 lượt** trên bãi trước khi phát nổ `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_akademia.html](https://www.clash.acidcave.net/bohaterowie_akademia.html)). **Azh Rafir** (DLC, trùm cuối) — "Exploding Fingers": **2** luồng năng lượng mạnh bắn ra từ tay Chúa tể `[ĐO ĐƯỢC]` ([clash.acidcave.net/bohaterowie_akademia.html](https://www.clash.acidcave.net/bohaterowie_akademia.html)). HP/mana/chi phí chính xác: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 6. Số lượng elite/champion mỗi phe — có mâu thuẫn giữa nguồn

- Theo **danh sách đơn vị thật sự đặt tên** (khớp giữa acidcave và từng trang wiki đơn vị riêng lẻ, coi cả unit ẩn):
  - Haven: **2 elite** (Knight, Priestess) + **3 champion** (Angel, Griffin, Sword Master-ẩn).
  - Sylvan: **3 elite** (Druid, Deer, Unicorn-ẩn) + **2 champion** (Treant, Emerald Dragon).
  - Necropolis: **2 elite** (Vampire, Ghost) + **3 champion** (Bone Dragon, Death Knight, Wraith-ẩn).
  - Inferno: **3 elite** (Succubus, Nightmare, Sorcerer-ẩn) + **2 champion** (Abyssal Lord, Pit Fiend).
  - Academy: **2 elite** (Djinn, Mage) + **3 champion** (Rakshasa, Titan, Phoenix-ẩn).
  `[ĐO ĐƯỢC]` ([clash.acidcave.net, 5 trang jednostki_*.html](https://www.clash.acidcave.net/jednostki.html); từng trang unit riêng đã dẫn ở bảng trên).
- Nhưng trang tổng hợp `mightandmagic.fandom.com/wiki/Elite_unit` (qua WebSearch) lại nói "**Academy, Sylvan, Inferno = 3 elite; Necropolis, Haven = 2 elite**" — tức xếp Academy vào nhóm 3-elite, **mâu thuẫn trực tiếp** với danh sách đặt tên ở trên (Academy chỉ có 2 elite đặt tên là Djinn/Mage) `[ĐO ĐƯỢC — có mâu thuẫn]` ([Elite unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Elite_unit); [Champion unit qua WebSearch](https://mightandmagic.fandom.com/wiki/Champion_unit)). Không tìm được đơn vị Academy thứ 3 nào ở tier elite để giải thích chênh lệch này — có thể trang tổng hợp bị lỗi hoặc tính khác đợt DLC. **Ghi nhận mâu thuẫn, không tự ý chọn số "đúng".**
- Mỗi phe có đúng **1 đơn vị ẩn (hidden/secret)**, mở khóa qua điều kiện đặc biệt trong campaign (agent #5 phụ trách chi tiết mở khóa) `[SUY ĐOÁN]` (suy từ việc mỗi phe chỉ có đúng 1 unit ghi "ẩn"/"secret"/"hidden" trong toàn bộ nguồn đã tra).

---

## 7. Chi phí & giới hạn quân

- Core: **miễn phí, không giới hạn số lượng** khi tuyển trong story mode `[ĐO ĐƯỢC]` ([mightandmagic.fandom.com qua WebSearch](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- Elite/Champion: tuyển từ "static dwellings" (nhà quân cố định trên bản đồ chiến dịch), trả bằng **3 loại tài nguyên: Gold, Ore, Rubies** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)). **Giá gold/ore/ruby cụ thể cho từng đơn vị: KHÔNG TÌM ĐƯỢC NGUỒN** (không trang nào tra được liệt kê bảng giá).
- **Giới hạn số elite/champion mang vào 1 trận**: không tìm được luật số cứng chính thức. Cộng đồng GameFAQs bàn luận cho rằng nên mang **hơn 4 elite** phòng khi combat vì "không bao giờ có hơn 4 Knight cùng lúc trong 1 trận (và nhiều nhất có lẽ 2 champion)" — đây là **kinh nghiệm chơi, không phải luật chính thức** `[SUY ĐOÁN — nguồn cộng đồng]` ([GameFAQs — Elite Units??? qua WebSearch](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/52585979)).
- **Số quân tối đa trên bãi tại 1 thời điểm** tăng theo **cấp độ hero** (hero level càng cao → HP hero, độ bền tường, và số quân tối đa trên bãi càng tăng) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)). Con số cụ thể theo từng cấp: **KHÔNG TÌM ĐƯỢC NGUỒN**.
- Luật xây đội hình trước trận (chọn quân nào mang theo) nói chung không có "deck limit" cứng như thẻ bài — người chơi mang bất kỳ tổ hợp core/elite/champion nào đã tuyển được, quân xuất hiện ngẫu nhiên trong trận theo tần suất tỉ lệ với số lượng đã tuyển `[SUY ĐOÁN]` (suy từ mô tả "quân elite/champion đến với tần suất phụ thuộc số lượng đã tuyển" ở mục tìm kiếm army building).

---

## 8. Lên cấp & kinh nghiệm

- **Hero**: tối đa **cấp 10**; lên cấp cho: **HP hero tăng**, **độ bền tường (wall strength) tăng**, **số quân tối đa trên bãi tăng** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp mightandmagic.fandom.com](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)).
- **Đơn vị (unit)**: tối đa **cấp 5**; lên cấp làm tăng cả **Toughness** và **Power (charge damage)** theo đúng các cặp số `X → Y` ở bảng mục 1–5 phía trên (X = cấp 1, Y = cấp 5) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp — nhiều trang unit riêng lẻ của mightandmagic.fandom.com đã dẫn]).
- Cách kiếm EXP cho hero/unit cụ thể (bao nhiêu EXP mỗi trận thắng, mỗi quái hạ...): **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 9. Artifact / trang bị (theo acidcave.net, đã dịch)

### Haven (10 artifact)
Staff of Elrath (Priestess khi nạp gây sát thương thay vì hồi máu) · Feathered Helm (Griffin giảm **1 lượt** charge) · King's Crown (triệu hồi quân không tốn điểm di chuyển) · Golden Spear (tường có khả năng đánh phủ đầu như Spearman) · Blessed Wing (Angel hồi máu toàn bộ đội hình đang nạp tức thì thay vì dần dần) · Lion's Mane (đòn đánh combo nhận thêm **+50%** sức mạnh) · Holy Blade (tỉ lệ chí mạng của đòn đánh vào hero **+20%**) · Crown of Elrath (thanh phép hero đầy nhanh gấp đôi) · Phoenix Feather (hero hồi sinh 1 lần với **25%** HP tối đa) · Knight's Armor (Knight bắt đầu nạp với sức mạnh tối đa ngay từ đầu) `[ĐO ĐƯỢC]` ([clash.acidcave.net/artefakty_przystan.html](https://www.clash.acidcave.net/artefakty_przystan.html)).

### Sylvan (10 artifact)
Leaf Plate (+**25%** Defense hero) · Dragon Scales (vũng axit của dragon tồn tại thêm 1 lượt) · Deer Antler (đội hình Deer nhảy qua **mọi** tường địch) · Golden Roots (tường sau khi bị phá hồi sinh với **1 HP**) · Doubling Cape (bonus sức mạnh combo **+50%**) · Elder Staff (**+1** năng lực Druid cho mỗi đội hình còn lại ghép cùng Druid đó) · Treans Sap (rễ cây hút HP hero địch **gấp đôi** mỗi lượt) · Vine Gloves (tường hồi phục nhanh **gấp đôi**) · Ring of Life (hero hồi sinh 1 lần, hồi **2%** HP tối đa mỗi lượt sau khi sống lại) · Boost Boots (đội hình tấn công nhận bonus sức mạnh theo mỗi ô đã đi qua bên phần sân địch) `[ĐO ĐƯỢC]` ([clash.acidcave.net/artefakty_sylwan.html](https://www.clash.acidcave.net/artefakty_sylwan.html)).

### Necropolis (10 artifact)
Blood Ring (hạ quân idle địch → hero hồi HP) · Twilight Urn (tường dựng từ xác quân idle mạnh hơn **+100%**) · Cursed Shield (giảm phòng thủ tường địch **50%**) · Blood of the One (lực hút máu của Vampire **+20%**) · Talon's Talon (Bone Dragon hút endurance quân idle bị hạ **gấp đôi**) · Ritual Dagger (hạ 1 quân core idle của mình → tự động hạ luôn 1 quân core địch phía trước) · Crown of Thorns (hero địch mất **2 HP**/lượt) · Spider Cloak (giảm **75%** HP tối đa hero, nhưng **+75%** sức mạnh mọi đội hình) · Book of The Dead (hồi sinh 1 lần trong cả trận, dùng năng lượng từ toàn bộ quân idle trên bãi) · Plague Rat (nhân đôi hiệu ứng độc của Zombie) `[ĐO ĐƯỢC]` ([clash.acidcave.net/artefakty_nekropolis.html](https://www.clash.acidcave.net/artefakty_nekropolis.html)).

### Inferno (10 artifact)
Rage Shield (thêm 1 hàng đội hình địch nhận sát thương lửa) · Burning Horn (Succubus **+25%** sức tấn công) · Pit Master's Tail (giảm **1 lượt** charge của Demon) · Celerity Ring (**+1** điểm di chuyển/lượt) · Vulcano Armor (quân địch đi qua đội hình đang nạp của mình nhận sát thương lửa) · Crippling Flail (giảm sức tấn công ban đầu của đội hình địch) · Chaos Crown (lúc xếp đội hình, +Phòng thủ vật lý đổi lấy -Phòng thủ phép) · Thorn Whip (Nightmare đạt sức mạnh tối đa khi tấn công cùng nhau) · Revive Flame (hero chết → hồi sinh với **5 HP** + đội hình đang tấn công giữ nguyên sức mạnh tối đa) · Magma Shard (Infernal/Abyssal Lord hút **100%** sức mạnh từ đội hình địch bị hạ) `[ĐO ĐƯỢC]` ([clash.acidcave.net/artefakty_inferno.html](https://www.clash.acidcave.net/artefakty_inferno.html)).

### Academy (10 artifact)
Gauntlet (nhặt và đặt tường ở bất kỳ đâu trên bãi) · Absorb Circlet (hấp thụ phép từ tường bị gỡ = đúng năng lực tường đó) · Djinn's Sash (quân địch bị đóng băng vỡ vụn sau khi Djinn tấn công) · Battle Wand (bắt đầu mỗi trận với đầy năng lực phép) · Scimitar (quân idle địch không ảnh hưởng tới đòn kiếm của Rakshasa) · Golden Fist (sóng xung kích của Titan phá hủy hoàn toàn tường địch) · Binding Orb (bonus combo **+50%**) · Mana Shield (đòn địch đánh vào thanh phép trước, rồi mới tới điểm bền) · Revival Ring (hồi sinh 1 lần/trận với **5 HP** + đầy tiềm năng phép) · Transform Gem (Mage có thể hợp nhất với đội hình Mage khác bất kể màu) `[ĐO ĐƯỢC]` ([clash.acidcave.net/artefakty_akademia.html](https://www.clash.acidcave.net/artefakty_akademia.html)).

---

## 10. Đơn vị được cộng đồng đánh giá mạnh nhất mỗi phe

- **Haven**: **Sword Master** (unit ẩn) — sức mạnh cực cao, cộng thêm hiệu ứng rút máu hero địch kéo dài suốt trận `[SUY ĐOÁN — ý kiến cộng đồng]` ([WebSearch tổng hợp GameFAQs "Best/Worst Units per Faction"](https://gamefaqs.gamespot.com/boards/991347-might-and-magic-clash-of-heroes/59163069)).
- **Sylvan**: **Druid** — charge nhanh (2 lượt), có thể "stall" (câu giờ) vô hạn và cuối cùng hạ được bất kỳ champion nào của địch `[SUY ĐOÁN — ý kiến cộng đồng]` ([nguồn như trên](https://gamefaqs.gamespot.com/boards/991347-might-and-magic-clash-of-heroes/59163069)).
- **Necropolis**: **Wraith** (unit ẩn) — khả năng gây chết tức thời không thể chối cãi (undisputable) `[SUY ĐOÁN — ý kiến cộng đồng]` ([nguồn như trên](https://gamefaqs.gamespot.com/boards/991347-might-and-magic-clash-of-heroes/59163069)). Cả phe Necropolis nói chung được đánh giá có **champion (Bone Dragon, Wraith) xuất sắc** `[SUY ĐOÁN — ý kiến cộng đồng]` (nguồn như trên).
- **Inferno**: **Succubus** và **Sorcerer** — cả hai đều được đánh giá là elite unit rất mạnh `[SUY ĐOÁN — ý kiến cộng đồng]` (nguồn như trên).
- **Academy**: **Phoenix** (unit ẩn) — sức mạnh cao, tầm đánh rộng hơn mọi unit khác, cộng thêm khả năng hồi sinh `[SUY ĐOÁN — ý kiến cộng đồng]` (nguồn như trên).
- Nhận định tổng quan thêm: **Sylvan** được cho là có bộ elite xuất sắc (Druid/Deer/Unicorn); **Haven** bị chê elite yếu nhưng bù lại có artifact tốt `[SUY ĐOÁN — ý kiến cộng đồng]` (nguồn như trên).
- *Lưu ý:* các trang thảo luận gốc (GameFAQs "Tier List", GBAtemp "tier list" thread) **không fetch được trực tiếp** (lỗi 403 Forbidden khi WebFetch) — nội dung trên chỉ lấy được qua bản tóm tắt của WebSearch, không phải đọc toàn văn thread.

---

## 11. Definitive Edition (2023) — thay đổi so với bản gốc DS/Xbox 360/PS3

- Bản Definitive Edition do **Dotemu** làm lại, phát hành cho Switch/PS4/PC, chủ yếu là **vẽ lại đồ họa/chân dung nhân vật** cho sắc nét hơn, thêm **quality-of-life**, và **online mode được làm lại + cân bằng lại hoàn toàn** `[ĐO ĐƯỢC]` ([RPGamer — DE Announced](https://rpgamer.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced/); [PCGamer — "updates almost nothing"](https://www.pcgamer.com/might-and-magic-clash-of-heroes-definitive-edition-updates-almost-nothing-but-at-least-its-a-second-chance-for-the-best-puzzle-rpg-ever-made/)).
- Gộp sẵn nội dung DLC **"I Am the Boss"**: cho chơi bằng **4 hero trùm** — **Azexes** (Inferno), **Carlyle** (Haven), **Ludmila** (Necropolis), **Azh Rafir** (Academy) — ở chế độ Quick Battle/multiplayer `[ĐO ĐƯỢC]` ([Gematsu — DE announced](https://www.gematsu.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced-for-ps4-switch-and-pc)).
- Thêm **Euny the Archdruid** (Sylvan) — boss **hoàn toàn mới**, độc quyền multiplayer, không có ở bản gốc `[ĐO ĐƯỢC]` ([Gematsu, như trên](https://www.gematsu.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced-for-ps4-switch-and-pc)).
- PCGamer nhận định các thay đổi cân bằng chỉ ở mức "nhỏ" (minor balance tweaks), không đại tu core/elite/champion của 5 phe chính `[ĐO ĐƯỢC]` ([PCGamer, như trên](https://www.pcgamer.com/might-and-magic-clash-of-heroes-definitive-edition-updates-almost-nothing-but-at-least-its-a-second-chance-for-the-best-puzzle-rpg-ever-made/)). → Số liệu Toughness/Power ở các bảng trên **được coi là áp dụng cho cả bản gốc lẫn Definitive Edition**, trừ khi có ghi chú khác `[SUY ĐOÁN]`.

---

## 12. Danh sách nguồn chính đã dùng

- [mightandmagic.fandom.com — Category:Clash of Heroes factions](https://mightandmagic.fandom.com/wiki/Category:Clash_of_Heroes_factions)
- [mightandmagic.fandom.com — Might & Magic: Clash of Heroes (trang tổng)](https://mightandmagic.fandom.com/wiki/Might_%26_Magic:_Clash_of_Heroes)
- [mightandmagic.fandom.com — Core unit](https://mightandmagic.fandom.com/wiki/Core_unit) / [Elite unit](https://mightandmagic.fandom.com/wiki/Elite_unit) / [Champion unit](https://mightandmagic.fandom.com/wiki/Champion_unit) / [Toughness (CoH)](https://mightandmagic.fandom.com/wiki/Toughness_(CoH)) / [Power (CoH)](https://mightandmagic.fandom.com/wiki/Power_(CoH))
- Từng trang đơn vị riêng lẻ `*_(CoH)` của mightandmagic.fandom.com (đã dẫn trong từng dòng bảng)
- [clash.acidcave.net](https://www.clash.acidcave.net/jednostki.html) — toàn bộ trang `jednostki_*.html` (đơn vị), `bohaterowie_*.html` (hero), `artefakty_*.html` (artifact) theo từng phe
- [Wikipedia — Might & Magic: Clash of Heroes](https://en.wikipedia.org/wiki/Might_%26_Magic:_Clash_of_Heroes)
- [RPGamer](https://rpgamer.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced/), [Gematsu](https://www.gematsu.com/2023/04/might-magic-clash-of-heroes-definitive-edition-announced-for-ps4-switch-and-pc), [PCGamer](https://www.pcgamer.com/might-and-magic-clash-of-heroes-definitive-edition-updates-almost-nothing-but-at-least-its-a-second-chance-for-the-best-puzzle-rpg-ever-made/) — Definitive Edition
- [GameFAQs — Elite Units??? thread](https://gamefaqs.gamespot.com/boards/960173-might-and-magic-clash-of-heroes/52585979), [GameFAQs — Best/Worst Units per Faction thread](https://gamefaqs.gamespot.com/boards/991347-might-and-magic-clash-of-heroes/59163069) (chỉ đọc được qua tóm tắt WebSearch, không fetch trực tiếp được)

**Không fetch được (đã thử, lỗi 402/403, không dùng làm nguồn trực tiếp, chỉ dùng qua tóm tắt WebSearch nếu có):** mightandmagic.fandom.com (fetch trực tiếp lỗi 402), gamefaqs.gamespot.com (lỗi 403), gbatemp.net thread (lỗi 403), web.archive.org (không hỗ trợ).
