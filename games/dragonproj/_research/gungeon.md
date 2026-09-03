# Nghiên cứu súng & đạn — Enter the Gungeon (Dodge Roll)

Nguồn chính: [enterthegungeon.wiki.gg](https://enterthegungeon.wiki.gg). Mỗi số liệu có link nguồn trực tiếp. Suy luận không có nguồn được gắn nhãn `[SUY ĐOÁN]`.

---

## 1. Schema thông số súng (copy cho bảng vũ khí của mình)

Wiki mô tả mỗi súng bằng đúng bộ field sau (lấy từ infobox súng, đối chiếu qua nhiều trang: [Marine Sidearm](https://enterthegungeon.wiki.gg/wiki/Marine_Sidearm), [AK-47](https://enterthegungeon.wiki.gg/wiki/AK-47), [Vulcan Cannon](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon), [RPG](https://enterthegungeon.wiki.gg/wiki/RPG), [Railgun](https://enterthegungeon.wiki.gg/wiki/Railgun)):

| Field | Ý nghĩa | Giá trị nhỏ nhất quan sát được | Giá trị lớn nhất quan sát được |
|---|---|---|---|
| **Damage** | Sát thương/phát bắn (hoặc `số viên x sát thương/viên` với súng shotgun, hoặc `x/s` cho súng beam) | 1.2 — [Gummy Gun](https://enterthegungeon.wiki.gg/wiki/Gummy_Gun) | 150 (charge tối đa) — [Prototype Railgun](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) |
| **Fire Rate** | **Khoảng cách thời gian giữa 2 phát (giây)**, KHÔNG phải shots/s — số càng nhỏ bắn càng nhanh (xem mục 1.1) | 0.04s — [Yari Launcher](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher), [Gummy Gun](https://enterthegungeon.wiki.gg/wiki/Gummy_Gun) | 1.20s — [A.W.P.](https://enterthegungeon.wiki.gg/wiki/A.W.P.), [Grenade Launcher](https://enterthegungeon.wiki.gg/wiki/Grenade_Launcher) |
| **Reload Time** | Giây để nạp lại băng đạn | 0.12s — [Bow](https://enterthegungeon.wiki.gg/wiki/Bow) | 3.0s — [RPG](https://enterthegungeon.wiki.gg/wiki/RPG) |
| **Magazine Size** | Số viên/băng | 1 — [RPG](https://enterthegungeon.wiki.gg/wiki/RPG), [Railgun](https://enterthegungeon.wiki.gg/wiki/Railgun), [Bow](https://enterthegungeon.wiki.gg/wiki/Bow) | 900 — [Vulcan Cannon](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon) |
| **Max Ammo** | Tổng đạn mang theo (có thể = Infinity với súng khởi đầu) | 40 — [RPG](https://enterthegungeon.wiki.gg/wiki/RPG) | 900 — [Vulcan Cannon](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon) |
| **Shot Speed** | Tốc độ bay của đạn (unit game/giây) | 10 — [Yari Launcher](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) | 800 — [Prototype Railgun](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) (Gamma Ray = Infinity vì là beam — [Gamma Ray](https://enterthegungeon.wiki.gg/wiki/Gamma_Ray)) |
| **Range** | Tầm bay tối đa của đạn | 8 — [Sawed-Off](https://enterthegungeon.wiki.gg/wiki/Sawed-Off) | Infinity/1000 (đa số súng tầm xa) — [Sniper Rifle](https://enterthegungeon.wiki.gg/wiki/Sniper_Rifle) |
| **Force** | Lực đẩy lùi (knockback) gây cho địch khi trúng đạn | 0 (charge tối đa, không đẩy) — [Prototype Railgun](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) | 50 — [Railgun](https://enterthegungeon.wiki.gg/wiki/Railgun), [Yari Launcher](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) |
| **Spread** | Góc lệch ngẫu nhiên của đạn (độ) | 0° (nhiều súng) | 45° — [Yari Launcher](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) |
| **DPS** | Sát thương/giây bền vững, tính sẵn theo công thức mục 1.1 | 14.5 — [Marine Sidearm](https://enterthegungeon.wiki.gg/wiki/Marine_Sidearm) | 100 (Vulcan Cannon, ổn định) — [Vulcan Cannon](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon); 243.2 (Railgun, trường hợp đặc biệt nhiều tia trúng) — [Railgun](https://enterthegungeon.wiki.gg/wiki/Railgun) |
| **Quality** | Bậc hiếm: D, C, B, A, S (N/A cho súng khởi đầu) | — | — |
| **Gun Class** | Nhãn phân loại kiểu bắn (không phải "archetype" thẩm mỹ) | — | — |

Danh sách **Gun Class** đầy đủ (14 loại) và số súng mỗi loại, từ [Category:Gun Classes](https://enterthegungeon.wiki.gg/wiki/Category:Gun_Classes): BEAM (10), CHARGE (15), CHARM (4), EXPLOSIVE (17), FIRE (10), FULLAUTO (36), ICE (6), NONE (3), PISTOL (40), POISON (6), RIFLE (11), SHITTY (21), SHOTGUN (17), SILLY (49).

### 1.1. Công thức DPS chính thức

Từ thảo luận cộng đồng trên [Talk:Guns](https://enterthegungeon.wiki.gg/wiki/Talk:Guns), công thức wiki dùng để tính cột DPS:

```
DPS = (magazine_size × damage) / ((magazine_size − 1) × fire_rate + reload_time)
```

(giả định phát cuối băng không cần cộng thêm fire_rate vì reload bắt đầu ngay; nếu fire_rate > reload_time thì thay reload_time bằng fire_rate). Công thức này **xác nhận Fire Rate là giây/phát (cooldown)**, không phải phát/giây — kiểm chứng chéo: Vulcan Cannon damage 5, fire_rate 0.05, magazine 900 → gần như liên tục 20 phát/s × 5 = 100 DPS = đúng số DPS niêm yết ([Vulcan Cannon](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon)).

### 1.2. Súng beam tính damage/tick thế nào

Field `Damage` của súng beam ghi sẵn dạng `X/s` (đã quy đổi sẵn theo giây), còn `Fire Rate` của mọi súng BEAM quan sát được đều là **0.10** → tick 10 lần/giây, mỗi tick = (X/s) × 0.10. Ví dụ [Demon Head](https://enterthegungeon.wiki.gg/wiki/Demon_Head): 31/s, fire rate 0.10 → mỗi tick ≈ 3.1 dmg, 10 tick/giây. `[SUY ĐOÁN]` con số per-tick 3.1 là suy ra từ 31×0.10, wiki không ghi trực tiếp "per-tick damage".

### 1.3. Không có crit-chance phổ quát

Gungeon **không có** cơ chế crit ngẫu nhiên áp dụng cho mọi súng (khác nhiều game khác). Crit chỉ tồn tại như cơ chế riêng của [Vorpal Gun](https://enterthegungeon.fandom.com/wiki/Vorpal_Gun): tỉ lệ bắn crit 100 dmg = `coolness + 1`%, và crit "dịch chuyển tức thời" tới địch gần nhất theo hướng ngắm thay vì bay như đạn thường, không có crit multiplier chung cho toàn bộ vũ khí.

---

## 2. Bảng so sánh archetype (11 nhóm, 3–4 súng đại diện/nhóm)

Ghi chú đọc bảng: **Dmg/shot** = sát thương 1 lần bắn (đã cộng nếu nhiều viên/tia); **Shots/s** = 1 ÷ Fire Rate; **DPS** = cột DPS chính thức của wiki (đã tính cả reload).

| Archetype | Súng | Dmg/shot | Fire Rate (s) | Shots/s | Reload (s) | Mag | DPS | Nguồn |
|---|---|---|---|---|---|---|---|---|
| **Pistol** | Marine Sidearm | 5 | 0.25 | 4.0 | 1.2 | 10 | 14.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/Marine_Sidearm) |
| Pistol | M1911 | 8 | 0.15/0.25 | 6.7/4.0 | 1.25 | 7 | 26.0/20.4 | [wiki](https://enterthegungeon.wiki.gg/wiki/M1911) |
| Pistol | Magnum | 13 | 0.15/0.25 | 6.7/4.0 | 1.0 | 6 | 44.6/34.7 | [wiki](https://enterthegungeon.wiki.gg/wiki/Magnum) |
| Pistol | Big Iron | 7×3=21/burst | 0.35 | 2.9 | 1.25 | 6 | 42.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Big_Iron) |
| **Rifle/Automatic** | AK-47 | 5.5 | 0.11 | 9.1 | 0.5 | 30 | 44.7 | [wiki](https://enterthegungeon.wiki.gg/wiki/AK-47) |
| Rifle/Auto | Vulcan Cannon | 5 | 0.05 | 20 | 0.6 | 900 | 100.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon) |
| Rifle/Auto | Zorgun (homing-rifle lai) | 5.5 | 0.10 | 10 | 0.6 | 30 | 55.6–61.3 | [wiki](https://enterthegungeon.wiki.gg/wiki/Zorgun) |
| **Shotgun** | Regular Shotgun | 4×6=24/shot | 0.60 | 1.67 | 1.8 | 8 | 32.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Regular_Shotgun) |
| Shotgun | Void Shotgun | 5×6=30/shot | 0.40 | 2.5 | 1.2 | 4 | 50.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Void_Shotgun) |
| Shotgun | Sawed-Off | 4×4=16/shot | 0.50 | 2.0 | 1.2 | 6 | 25.9 | [wiki](https://enterthegungeon.wiki.gg/wiki/Sawed-Off) |
| **Sniper/high-burst** | Sniper Rifle | 26 | 1.00 | 1.0 | 1.5 | 10 | 24.8 | [wiki](https://enterthegungeon.wiki.gg/wiki/Sniper_Rifle) |
| Sniper/burst | A.W.P. | 40 | 1.20 | 0.83 | 2.1 | 8 | 30.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/A.W.P.) |
| Sniper/burst | Hexagun | 35 | ~0 (1-shot, phải nạp lại từng phát) | — | 1.25 | 1 | 28.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Hexagun) |
| **Laser/Beam** | Demon Head | 31/s (≈3.1/tick×10) | 0.10 | 10 tick/s | N/A (liên tục) | 500 | 31.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Demon_Head) |
| Beam | Gamma Ray | 16/s | 0.10 | 10 tick/s | N/A | 800 | 16.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Gamma_Ray) |
| Beam | Mega Douser | 15/s | 0.10 | 10 tick/s | N/A | 900 | 15.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Mega_Douser) |
| **Rocket/Explosive** | RPG | 20 (va chạm)/35 (nổ) | 1.00 | 1.0 | 3.0 | 1 | 18.3 | [wiki](https://enterthegungeon.wiki.gg/wiki/RPG) |
| Explosive | Grenade Launcher | 10 (va chạm)/25 (nổ) | 1.20 | 0.83 | 0.78 | 1 | 29.17 | [wiki](https://enterthegungeon.wiki.gg/wiki/Grenade_Launcher) |
| Explosive | Yari Launcher | 8+8 (va chạm+nổ) | 0.04 | 25 | 1.5 | 20 | — (bỏ qua Boss DPS cap) | [wiki](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) |
| **Charge weapon** | Railgun | 50 (max charge, xuyên nhiều địch) | N/A (charge 1.25s) | — | 0.6 | 1 | 27.0 (1 hit) / 243.2 (nhiều hit) | [wiki](https://enterthegungeon.wiki.gg/wiki/Railgun) |
| Charge | Prototype Railgun | 150 (max charge) | N/A | — | 0.6 | 1 | 51.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) |
| Charge | Megahand | 6 (không charge) / 45 (full charge) | 0.07 | 14.3 | 0.54 | 18 | ≤62.4 / 43.2 | [wiki](https://enterthegungeon.wiki.gg/wiki/Megahand) |
| Charge | Bow | 7.5 (không charge) / 30 (full charge) | 1.00 | 1.0 | 0.12 | 1 | 26.8 | [wiki](https://enterthegungeon.wiki.gg/wiki/Bow) |
| **Sword-beam / melee-projectile** | Excaliber | 7×3=21/burst (xuyên); đòn chém khi nạp: ~27.5 (băng còn đạn) / 80 (băng rỗng) | 0.15 | 6.7 | 0.48 | 32 | 43.7 | [wiki](https://enterthegungeon.wiki.gg/wiki/Excaliber) |
| **Homing** | Stinger | 10 (va chạm)+15 (nổ)+3/bee | 1.00 | 1.0 | 2.0 | 1 | 27.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/Stinger) |
| Homing | Zorgun | 5.5 | 0.10 | 10 | 0.6 | 30 | 55.6–61.3 | [wiki](https://enterthegungeon.wiki.gg/wiki/Zorgun) |
| Homing | Yari Launcher | 8+8 | 0.04 | 25 | 1.5 | 20 | — | [wiki](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) |
| **Orbiting/companion** | *(không có súng nào bay quanh người chơi mặc định — xem mục 2.1)* | — | — | — | — | — | — | — |
| **Staff/magic-like** | Bundle of Wands | 7×3=21/shot | 0.30 | 3.3 | 1.5 | 6 | 42.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Bundle_of_Wands) |
| Magic-like | Hexagun | 35 | — | 1-shot/nạp | 1.25 | 1 | 28.0 | [wiki](https://enterthegungeon.wiki.gg/wiki/Hexagun) |

### 2.1. Không có archetype "orbiting weapon" thật sự

Gungeon **không thiết kế súng nào tự bắn đạn bay vòng quanh người chơi** kiểu tears-orbit của Isaac. Hiệu ứng đạn xoay quanh người chơi chỉ đến từ item passive [Orbital Bullets](https://enterthegungeon.wiki.gg/wiki/Orbital_Bullets): đạn bắn trượt (miss) sau khi chạm tường sẽ bay về và **quay quanh người chơi trong 15 giây**, cách người chơi ngẫu nhiên **2–5 ô (tile)**, tối đa **20 viên** cùng lúc orbit (thêm nữa thì nảy thay vì orbit); cơ chế này áp dụng cho *mọi* súng kể cả beam (beam sẽ "vòng 1 vòng tròn hoàn chỉnh quanh người chơi rồi mới bay thẳng"). `[SUY ĐOÁN]` Nếu muốn archetype "orbiting weapon" cho game của mình, đây là gợi ý thiết kế lai (item buff áp lên súng bất kỳ) chứ không phải súng riêng.

### 2.2. Bảng burst-vs-sustained (rút gọn để nhìn nhanh trade-off)

| Súng | Dmg/shot cao nhất | DPS bền vững | Tỉ lệ burst/sustained |
|---|---|---|---|
| Prototype Railgun | 150 | 51.0 | ~2.9× (1 phát ăn gần 3 giây DPS trung bình) — [wiki](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) |
| A.W.P. | 40 | 30.5 | ~1.3× — [wiki](https://enterthegungeon.wiki.gg/wiki/A.W.P.) |
| Vulcan Cannon | 5 | 100.0 | thấp burst, cao sustained (súng full-auto điển hình) — [wiki](https://enterthegungeon.wiki.gg/wiki/Vulcan_Cannon) |
| RPG | 35 (nổ) | 18.3 | reload 3.0s kéo sustained DPS xuống rất thấp dù dmg/phát cao — [wiki](https://enterthegungeon.wiki.gg/wiki/RPG) |

---

## 3. Charge weapon — cơ chế chi tiết

| Súng | Charge time | Dmg không charge → full charge | Giữ vô hạn được? | Nhả sớm | Chậm di chuyển khi charge? | Nguồn |
|---|---|---|---|---|---|---|
| Railgun | **1.25s** | (súng 1-charge, không có bậc trung gian ghi rõ) → 50 dmg, xuyên nhiều địch (DPS 27.0 khi trúng 1, tới 243.2 khi trúng nhiều địch cùng lúc) | Không ghi rõ trên wiki | Đổi súng trước khi bắn hết charge → **không tốn đạn** | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Railgun) |
| Prototype Railgun | Không ghi số giây cụ thể, có "tia laser ngắm trước" trong lúc charge | → 150 dmg full charge | Không ghi rõ | Đổi súng trước khi bắn → không tốn đạn | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Prototype_Railgun) |
| Megahand | **1.0s** | 6 dmg (không charge) → 45 dmg + knockback (Force 8→50) khi full charge | Không ghi rõ | Không ghi rõ | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Megahand) |
| Bow | **1.0s** ("Hold Fire To Charge") | 7.5 dmg → 30 dmg, mũi tên charge xuyên được nhiều địch | Không ghi rõ | Không ghi rõ | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Bow) |

**Nhận xét chung `[SUY ĐOÁN]` một phần:** Wiki liệt kê "Charge Time" như một field riêng cho súng CHARGE nhưng **hiếm khi ghi rõ multi-tier damage curve, có bị chậm di chuyển hay không, hay hành vi nhả-sớm** — đây là thông tin không có nguồn công khai rõ ràng trên wiki.gg, chỉ có 2 điểm chắc chắn ghi trong nguồn: (1) đổi súng giữa lúc đang charge (chưa bắn) trên Railgun/Prototype Railgun thì **không tốn đạn**; (2) charge time dao động **1.0–1.25s** trên 3/4 súng có ghi số ([Railgun](https://enterthegungeon.wiki.gg/wiki/Railgun), [Megahand](https://enterthegungeon.wiki.gg/wiki/Megahand), [Bow](https://enterthegungeon.wiki.gg/wiki/Bow)).

Lớp CHARGE đầy đủ (15 súng) theo [Category:CHARGE Class Guns](https://enterthegungeon.wiki.gg/wiki/Category:CHARGE_Class_Guns): Anvillain, Blunderbuss, Bow, Boxing Glove, Charge Shot, Cobalt Hammer, Corsair, Glass Cannon, Gunbow, Heroine, Megahand, Prototype Railgun, Railgun, Sling, Starpew. Lưu ý: wiki tự ghi chú "guns in the CHARGE gun class aren't necessarily actually charged" — đây là nhãn phân loại kiểu bắn, không đảm bảo mọi súng trong nhóm có cơ chế giữ nút charge.

---

## 4. Súng nổ (Explosive) — splash, self-damage, crit, tốc độ đạn

| Súng | Dmg va chạm | Dmg nổ | Tốc độ đạn | Splash radius | Self-damage | Nguồn |
|---|---|---|---|---|---|---|
| RPG | 20 | 35 (+30% dmg thêm lên boss riêng phần va chạm) | Tăng tốc dần từ chậm lên tối đa (40 shot speed niêm yết), "accelerate over a short distance" | Không ghi số cụ thể trên wiki | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/RPG) |
| Grenade Launcher | 10 | 25 | 20; lựu đạn "trượt trên mặt đất, nảy 1 lần khi chạm tường/vật thể" | Không ghi số cụ thể | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Grenade_Launcher) |
| Yari Launcher | 8 | 8 | 220 (tên lửa homing) | Nhỏ ("small explosions") | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher) |
| Stinger | 10 | 15 | 20 (tên lửa chính), 150 (ong homing, radius bắt mục tiêu = 10 unit) | Không ghi số cụ thể | Không ghi rõ | [wiki](https://enterthegungeon.wiki.gg/wiki/Stinger) |

**Self-damage:** Wiki không ghi công thức self-damage nổ trực tiếp trên các trang súng nổ. Bằng chứng gián tiếp duy nhất: item [Blast Helmet](https://enterthegungeon.wiki.gg/wiki/Blast_Helmet) "giảm bán kính mà vụ nổ có thể gây hại cho người chơi" và cho miễn sát thương chạm địch — nghĩa là **mặc định người chơi CÓ THỂ tự dính sát thương nổ từ chính súng của mình** trong bán kính nổ, và Blast Helmet là item counter cho việc này. `[SUY ĐOÁN]` Không tìm được con số % self-damage cụ thể trên wiki.gg trong phạm vi nghiên cứu này.

**Crit trên vụ nổ:** Không có bằng chứng nào từ wiki cho thấy nổ có thể "crit" — như mục 1.3, hệ thống crit của Gungeon chỉ tồn tại riêng ở Vorpal Gun, không áp dụng chung cho damage nổ.

**Bypass Boss DPS cap:** Điểm đặc biệt đáng chú ý — Yari Launcher's cả 2 phần dmg (va chạm + nổ) **bỏ qua Boss DPS cap** của game (xem mục 6 về DPS cap theo tầng), khiến súng nổ tầm thường về số nhưng rất mạnh với boss ([wiki](https://enterthegungeon.wiki.gg/wiki/Yari_Launcher)).

---

## 5. Beam/laser — damage/tick, pierce, tracking

| Súng | Dmg/giây niêm yết | Fire Rate (= tick interval) | Suy ra dmg/tick | Pierce | Tracking |
|---|---|---|---|---|---|
| Demon Head | 31/s | 0.10s → 10 tick/s | ≈3.1/tick `[SUY ĐOÁN, suy từ 31×0.10]` | Chỉ xuyên khi có synergy "Hail, Satan!" với Pitchfork | **Có** — "tia hơi cong về phía địch" | [wiki](https://enterthegungeon.wiki.gg/wiki/Demon_Head) |
| Gamma Ray | 16/s | 0.10s → 10 tick/s | ≈1.6/tick `[SUY ĐOÁN]` | Không ghi rõ | Có, "hơi cong về phía địch" (thêm từ bản Supply Drop Update); riêng hiệu ứng độc: bắn liên tục 0.25s gây độc (poison) 3.5s | [wiki](https://enterthegungeon.wiki.gg/wiki/Gamma_Ray) |
| Mega Douser | 15/s | 0.10s → 10 tick/s | ≈1.5/tick `[SUY ĐOÁN]` | Không ghi rõ | Không ghi rõ (không có mô tả cong/homing) | [wiki](https://enterthegungeon.wiki.gg/wiki/Mega_Douser) |

Quy tắc chung suy ra được: **mọi súng lớp BEAM quan sát đều có Fire Rate cố định = 0.10s**, tức chuẩn tick rate toàn hệ thống beam là **10 tick/giây**, và field `Damage` của beam luôn ghi sẵn dạng tổng theo giây (`X/s`) thay vì theo tick.

---

## 6. HP quái & boss theo tầng

### 6.1. Bullet Kin (quái thường phổ biến nhất) — scaling theo tầng

Từ [Bullet Kin](https://enterthegungeon.wiki.gg/wiki/Bullet_Kin) (infobox dùng template `{{HP|15}}` tự nhân hệ số theo tầng):

| Tầng 1 | Tầng O | Tầng 2 | Tầng A | Tầng 3 | Tầng 4/R | Tầng 5/6 |
|---|---|---|---|---|---|---|
| 15 | 20 | 19.5 | 25 | 24 | 27.75 | 31.5 |

(Biến thể cùng HP: Ashen Bullet Kin, Knight Bullet Kin. Biến thể mạnh hơn: Mutant/Fallen Bullet Kin 20→42 HP; Bullet Kin Titan 80→168 HP.)

### 6.2. Boss tầng 1–5 (chế độ "Enter the Gungeon" gốc)

| Tầng (khu vực) | Boss | HP | Nguồn |
|---|---|---|---|
| 1 — Keep of the Lead Lord | Bullet King | 950 | [wiki](https://enterthegungeon.wiki.gg/wiki/Bullet_King) |
| 1 — Keep of the Lead Lord | Gatling Gull (luôn là boss tầng 1 lần chơi đầu) | 700 | [wiki](https://enterthegungeon.wiki.gg/wiki/Gatling_Gull) |
| 1 — Keep of the Lead Lord | Trigger Twins | 400/twin (2 twin) | [wiki](https://enterthegungeon.wiki.gg/wiki/Trigger_Twins) |
| 2 — Gungeon Proper | Ammoconda | 899.6 | [wiki](https://enterthegungeon.wiki.gg/wiki/Ammoconda) |
| 2 — Gungeon Proper | Beholster | 1072.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/Beholster) |
| 2 — Gungeon Proper | Gorgun | 975 | [wiki](https://enterthegungeon.wiki.gg/wiki/Gorgun) |
| 3 — Black Powder Mine | Cannonbalrog | 1520 | [wiki](https://enterthegungeon.wiki.gg/wiki/Cannonbalrog) |
| 3 — Black Powder Mine | Treadnaught | 1520 | [wiki](https://enterthegungeon.wiki.gg/wiki/Treadnaught) |
| 4 — Hollow | High Priest | 1757.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/High_Priest) |
| 4 — Hollow | Wallmonger | 1757.5 | [wiki](https://enterthegungeon.wiki.gg/wiki/Wallmonger) |
| 5 — Forge (boss cuối) | High Dragun | Phase 1: 2767.8; Phase 2: 500; "Advanced Dragun": 5200 | [wiki](https://enterthegungeon.wiki.gg/wiki/High_Dragun) |

### 6.3. Tỉ lệ Boss HP / Mob HP

Lấy Bullet Kin tầng 1 (15 HP) làm chuẩn mob thường:

| Boss (tầng) | Boss HP | Tỉ lệ so với Bullet Kin tầng tương ứng |
|---|---|---|
| Gatling Gull (tầng 1, 15 HP mob) | 700 | **≈47×** |
| Bullet King (tầng 1) | 950 | **≈63×** |
| Ammoconda (tầng 2, mob ~19.5–25 HP) | 899.6 | **≈36–46×** |
| Cannonbalrog/Treadnaught (tầng 3, mob ~24 HP) | 1520 | **≈63×** |
| High Priest/Wallmonger (tầng 4, mob ~27.75 HP) | 1757.5 | **≈63×** |
| High Dragun phase 1 (tầng 5, mob ~31.5 HP) | 2767.8 | **≈88×** |

`[SUY ĐOÁN]` các phép chia trên là tính tay từ 2 số liệu nguồn (không phải số wiki công bố sẵn dạng tỉ lệ).

### 6.4. Boss DPS cap theo tầng (giới hạn sát thương/giây gây được lên boss)

Từ [Bosses](https://enterthegungeon.wiki.gg/wiki/Bosses), bảng DPS cap theo khu vực (A Farewell to Arms / Classic):

| Khu vực | Cap "A Farewell to Arms" | Cap "Classic" |
|---|---|---|
| Keep of the Lead Lord / Oubliette | 30 | 25 |
| Gungeon Proper / Abbey of the True Gun | 42 | 35 |
| Black Powder Mine / Resourceful Rat's Lair | 60 | 50 |
| Hollow / R&G Dept. | 70 | 58 |
| Forge | 78 | 65 |
| Bullet Hell | 80 | 70 |

(Nguồn: [Bosses](https://enterthegungeon.wiki.gg/wiki/Bosses); DPS cap giải thích cơ chế Yari Launcher "bypass" ở mục 4.)

---

## 7. Game feel

| Thông số | Giá trị | Nguồn |
|---|---|---|
| Dodge roll — tổng thời lượng | **≈0.7 giây** | [Dodge Roll (Move)](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Dodge roll — cửa sổ bất tử (i-frame) | **Nửa đầu của roll** (≈0.35s), gần như bất tử với mọi damage/đạn địch | [Dodge Roll (Move)](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Dodge roll — nửa sau | Vẫn di chuyển theo quán tính nhưng **mất giáp bất tử**, có thể dính damage/contact damage | [Dodge Roll (Move)](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Dodge roll — sát thương gây cho địch khi roll trúng | 3 dmg (mặc định), 4 dmg (Robot); tăng theo item: Live Ammo ×4 (15/20 dmg), Armor of Thorns ×6 (21/28 dmg), Blast Helmet ×2 (9/12 dmg) | [Dodge Roll (Move)](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Dodge roll — điều khiển hướng | 8 hướng cố định (bàn phím/chuột) vs 360° tự do (tay cầm) | [Dodge Roll (Move)](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Player HP mặc định | **3** (đơn vị nửa-tim, không thể giảm dưới 1 với nhân vật thường); Robot bắt đầu 0 HP | [Health](https://enterthegungeon.wiki.gg/wiki/Health) |
| Hitbox người chơi | Không công bố kích thước pixel chính thức; đo thủ công qua frame-advance 60fps cho thấy hitbox "bắt đầu từ trên quần, kết thúc dưới lọn tóc xoăn, mở rộng 2 bên đầu" — nhỏ hơn sprite hiển thị, sai số ±1 pixel | [Hitbox](https://enterthegungeon.wiki.gg/wiki/Hitbox) |
| Hitbox viên đạn thường | Chỉ là **các pixel trung tâm của đạn** (gần như điểm), không phải hình chữ nhật bao quanh sprite đạn — tức bullet hitbox nhỏ hơn nhiều so với hitbox người chơi | [Hitbox](https://enterthegungeon.wiki.gg/wiki/Hitbox) |
| Force (knockback/phát bắn) | Field riêng từng súng, dải quan sát 0–50 (mục 1); tách biệt với "Knockback Multiplier" — hệ số % nhân toàn cục lên mọi Force của người chơi, mặc định = 1 (100%) | [Knockback Multiplier](https://enterthegungeon.wiki.gg/wiki/Knockback_Multiplier) |
| Screenshake / hitstop | **Không tìm được số liệu hoặc tài liệu chính thức nào (postmortem/GDC talk) mô tả bằng số cho Enter the Gungeon cụ thể** trong phạm vi tìm kiếm này | `[SUY ĐOÁN]` — Gungeon rõ ràng dùng screenshake khi bắn/trúng đòn (có option tắt screenshake trong game, xác nhận cơ chế tồn tại) nhưng không có nguồn công khai ghi số frame/độ mạnh; nếu cần tham chiếu định lượng, nên dùng nguyên lý "Vlambeer juice" (Nuclear Throne/Ridiculous Fishing) làm proxy vì cùng trường phái thiết kế, KHÔNG phải số đo trực tiếp của Gungeon |

---

## Ghi chú tổng hợp cho việc copy schema

Đề xuất field-set tối thiểu nên copy cho bảng vũ khí riêng (đã kiểm chứng chéo qua >20 trang súng):
`damage, fireRate(s giữa 2 phát), reloadTime(s), magazineSize, maxAmmo, shotSpeed, range, force, spread(°), gunClass`, và **DPS nên để tính toán (derived field)** theo công thức mục 1.1 thay vì nhập tay, vì nó phụ thuộc cả 4 field kia và mỗi thay đổi buff/item sẽ tự động đúng.
