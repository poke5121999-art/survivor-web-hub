# Nghiên cứu thiết kế vũ khí & kỹ năng — Soul Knight (ChillyRoom)

> Nguồn chính: [soul-knight.fandom.com](https://soul-knight.fandom.com). Công cụ fetch trực tiếp trang fandom bị chặn (HTTP 402) trong phiên làm việc này, nên toàn bộ số liệu dưới đây được lấy qua kết quả tìm kiếm (snippet đã được trích từ đúng trang wiki, URL nguồn đính kèm từng số liệu). Số liệu không có nguồn rõ ràng được gắn nhãn `[SUY ĐOÁN]`.
>
> Ghi chú đơn vị: "Rounds per Second" = phát/giây; DPS trong bảng của wiki là DPS lý thuyết côn thức = damage × projectiles × rounds/s (không tính crit/miss).

---

## 1. Phân loại vũ khí (taxonomy)

Theo trang thể loại của wiki, vũ khí Soul Knight chia thành: **Handguns, Rifles/SMG, Shotguns, Launchers (bazooka/rocket), Laser Guns, Bows, Melee Weapons (Swords / Axes & Hammers / Spears), Staffs, Throwing Weapons, Miscellaneous Weapons** — [Category:Weapons](https://soul-knight.fandom.com/wiki/Category:Weapons), [Category:Melee Weapons](https://soul-knight.fandom.com/wiki/Category:Melee_Weapons). Tổng cộng game có khoảng **483 vũ khí** kể cả vũ khí theo mùa và Summoner's Artifact — [Stats page qua tìm kiếm](https://soul-knight.fandom.com/wiki/Stats).

Bảng đại diện mỗi archetype (damage/hit, số đạn, tốc bắn, năng lượng, crit, verb đặc biệt):

| Archetype | Vũ khí đại diện | Damage/hit | Số đạn | Tốc bắn (rounds/s) | Energy cost | Crit | DPS | Verb đặc biệt | Nguồn |
|---|---|---|---|---|---|---|---|---|---|
| Handgun (súng lục) | Bad Pistol (starter Knight) | 3 | 1 | 3 | 0 | 0% | 9 | — | [Bad Pistol](https://soul-knight.fandom.com/wiki/Bad_Pistol) |
| Handgun | New Pistol (starter Knight, bản khác) | 4 | 1 | 3.2 | 0 | 0% | ~12.8 | — | [New Pistol](https://soul-knight.fandom.com/wiki/New_Pistol) |
| Handgun | P250 Pistol (Common) | 3 | 1 | 3.4 | 0 | 10% | ~10.2 | — | [P250 Pistol](https://soul-knight.fandom.com/wiki/P250_Pistol) |
| Handgun | Fantastic Gun (Legendary) | 1~25 | 1 | 3 | 2 | -30~55% | 21.93 | biến thiên dmg lớn, crit âm | [Fantastic Gun](https://soul-knight.fandom.com/wiki/Fantastic_Gun) |
| Rifle/SMG | SMG M1 | 3 | 1 | 6 | 1 | 30% | 23.4 | tốc bắn cao | [SMG M1](https://soul-knight.fandom.com/wiki/SMG_M1) |
| Sniper Rifle | Soul Calibre (Epic) | 25 | 1 | — | 9 | — | — | xuyên (pierce), vận tốc cao | [Soul Calibre](https://soul-knight.fandom.com/wiki/Soul_Calibre) |
| Shotgun | Basic Shotgun | 3 | 5 | — | 3 | 0% | — | spread, inaccuracy 25 | [Shotgun](https://soul-knight.fandom.com/wiki/Shotgun) (qua tìm kiếm) |
| Shotgun | Shotgun M2 (Uncommon) | 2 | 7 (cone 90°) | — | 1 | 5% | 35.28 | cone spread | [Shotgun M2](https://soul-knight.fandom.com/wiki/Shotgun_M2) |
| Shotgun | Shotgun M3 (Rare) | 2 | 12 (vòng tròn nổ ra) | — | 3 | 5% | 25.2 | spread hình khuyên | [Shotgun M3](https://soul-knight.fandom.com/wiki/Shotgun_M3) |
| Shotgun | Shotgun Pro (Common) | 2/4/6 (3 cỡ đạn) | 5 | — | 3 | — | 23.32 | đạn 3 kích cỡ khác nhau | [Shotgun Pro](https://soul-knight.fandom.com/wiki/Shotgun_Pro) |
| Laser | Meteo Laser Gun | 1~31 | 1 (chùm) | — | 10 | 0~50% | 23.25 | tia liên tục | [Meteo Laser Gun](https://soul-knight.fandom.com/wiki/Meteo_Laser_Gun) |
| Laser | Laggy Laser Gun | 8 | 1 | — | 2 | 0% | 40 (primary)/16 (hovering) | 2 chế độ | [Laggy Laser Gun](https://soul-knight.fandom.com/wiki/Laggy_Laser_Gun) |
| Bow | Bow (Common) | 4~8 | 1 | 1.66 | 2 | 0~50% | 20 | tích lực (charge) theo thời gian giữ | [Bow](https://soul-knight.fandom.com/wiki/Bow) |
| Launcher/Bazooka | Bazooka (Uncommon) | 8 (AoE) | 1 | — | 4 | không thể crit | — | nổ bán kính 3.5 ô, gây Burn | [Bazooka](https://soul-knight.fandom.com/wiki/Bazooka) |
| Launcher | Worn Bazooka (Common) | 8 | 1 | 1 | 6 | 0% | 8 | inaccuracy 2 | [Worn Bazooka](https://soul-knight.fandom.com/wiki/Worn_Bazooka) |
| Launcher | Ice Bazooka (Very Rare/Purple) | 15 (+15 nổ băng) | 1 | 1 | 5 | 0% | ~15-30 | knockback, sinh gai băng, Freeze | [Ice Bazooka](https://soul-knight.fandom.com/wiki/Ice_Bazooka) |
| Launcher | Rocket Gun M1 | 16 | 1 (homing) | — | 5 | — | — | tự dò mục tiêu (homing), có thể Burn | [Rocket Gun M1](https://soul-knight.fandom.com/wiki/Rocket_Gun_M1) |
| Staff | Staff of Wizard (Legendary) | 3 | 7 (đội hình 90°) | 1.9 | 3 | 80% | 47.88 | 4 màu đạn luân phiên: Freeze/Poison/Burn khi crit | [Staff of Wizard](https://soul-knight.fandom.com/wiki/Staff_of_Wizard) |
| Staff | Wizard's Staff (Rare) | 3 | 4 (hình chữ thập) | 1.5 | 3 | 10% | 19.8 | homing (tự dò) | [Wizard's Staff](https://soul-knight.fandom.com/wiki/Wizard's_Staff) |
| Melee — Scythe/Sickle | Midnight Sickle | 9 | 1 | 1.5 | 0 | 49% | — | melee cận chiến (không phải orbit — xem mục 2.4) | [Midnight Sickle](https://soul-knight.fandom.com/wiki/Midnight_Sickle) |
| Melee — Sword | Laser Sword Red | 12 | 1 | 2.4 | 0 | -20% | 28.8 | — | [Laser Sword Red](https://soul-knight.fandom.com/wiki/Laser_Sword_Red) |
| Melee — Sword (charge) | Laser Sword Purple | 8~18 | 1 (thường) | 1.33 (spam) / 0.625 (charge) | 15 (khi charge full) | 30% | — | full-charge: tia laser quét 185° quanh người chơi | [Laser Sword Purple](https://soul-knight.fandom.com/wiki/Laser_Sword_Purple) |
| Throwable | Hand Grenade (Very Rare) | (theo lv) | tối đa 3 lựu đạn cùng lúc | — | Shotgun buff: viên đầu 2, viên sau 1 | — | — | quỹ đạo vòng cung, nổ khi chạm đất, có thể Burn | [Hand Grenade](https://soul-knight.fandom.com/wiki/Hand_Grenade) |
| Drone/Summon | Satellite Floating Gun (starter Robot) | 3/1 (chính/phụ); nâng cấp 6/2 | khi làm vũ khí phụ: 2 drone, mỗi drone bắn 1 đạn | 1 | 1 (nâng cấp: 2) | 0% | 3 (6 khi nâng cấp) | drone bay 2 bên, tự bám mục tiêu gần; đạn drone không crit | [Satellite Floating Gun](https://soul-knight.fandom.com/wiki/Satellite_Floating_Gun) |

**Nhận xét thiết kế chung:** DPS lý thuyết của wiki dao động lớn (8–48) không theo một đường thẳng tuyến tính với rarity hay energy cost — vũ khí energy cost thấp (Shotgun M2: 1 energy, DPS 35.28) có thể vượt DPS vũ khí cùng dòng tốn energy cao hơn (Shotgun M3: 3 energy, DPS 25.2) — [so sánh Shotgun M2/M3/Pro](https://soul-knight.fandom.com/wiki/Shotgun_M2). `[SUY ĐOÁN]` Điều này gợi ý DPS thô không phải biến kiểm soát chính; wiki tự nhận xét M2 "hiệu quả nhất" nhờ chi phí energy thấp — nghĩa là **DPS-trên-mỗi-energy** mới là trục cân bằng thực sự, không phải DPS tuyệt đối.

---

## 2. Vũ khí cụ thể cần mô phỏng

### 2.1 Shotgun (súng shotgun — đạn chùm)

| Vũ khí | Damage | Số đạn | Góc/pattern | Energy | Crit | Inaccuracy | DPS | Nguồn |
|---|---|---|---|---|---|---|---|---|
| Shotgun (cơ bản) | 3 | 5 | spread thẳng | 3 | 0% | 25 | — | [wiki](https://soul-knight.fandom.com/wiki/Shotgun) |
| Shotgun M2 | 2 | 7 | cone 90° | 1 | 5% | 0 | 35.28 | [wiki](https://soul-knight.fandom.com/wiki/Shotgun_M2) |
| Shotgun M3 | 2 | 12 | vòng tròn nổ ra (ring) | 3 | 5% | 0 | 25.2 | [wiki](https://soul-knight.fandom.com/wiki/Shotgun_M3) |
| Shotgun Pro | 2/4/6 (3 cỡ đạn khác nhau trong 1 phát) | 5 | spread | 3 | — | — | 23.32 | [wiki](https://soul-knight.fandom.com/wiki/Shotgun_Pro) |
| Shotgun M3 + upgrade "shotgun pellets" | 30~40 → 90~120 (tổng 1 phát) | +2 viên | — | — | — | — | — | [Shotgun M3 qua buff pellet](https://soul-knight.fandom.com/wiki/Shotgun_M3) |
| Cherry Blossom | 8/viên chính, +cụm 5 viên phụ (10 dmg splash) | 1 chính + cụm 5 phụ theo chu kỳ khi bay | — | — | — | — | — | [Cherry Blossom](https://soul-knight.fandom.com/wiki/Cherry_Blossom) |

`[SUY ĐOÁN]` Không tìm được số liệu Buckshot/tầm bắn hiệu dụng hay độ suy giảm dmg theo khoảng cách — có thể shotgun Soul Knight không giảm dmg theo khoảng cách (khác từ game khác), chỉ dùng spread góc/inaccuracy để mô phỏng độ tản.

### 2.2 Laser (tia laser — liên tục vs xung)

Cơ chế chung: **beam liên tục** giữ nút bắn sẽ bắn tia đâm xuyên (pierce) liên tục qua địch và thùng đồ, gây damage theo **tick**, và damage/tick thường **tăng dần theo thời gian giữ nút** tới một giới hạn — [mô tả cơ chế continuous beam](https://soul-knight.fandom.com/wiki/Wiki_Terminology).

| Vũ khí | Damage/tick ban đầu | Scale theo thời gian giữ | Energy | Crit | DPS | Pierce | Nguồn |
|---|---|---|---|---|---|---|---|
| Ion Laser | 4/tick | tăng lên 5/tick sau 10 tick, 6/tick sau 23 tick | 1 | 0% | 20~30 | có | [Ion Laser](https://soul-knight.fandom.com/wiki/Ion_Laser) |
| Queen's Touch | 5/tick | tăng dần tới tối đa 17/tick khi giữ lâu | — | — | — | có | [Queen's Touch](https://soul-knight.fandom.com/wiki/Queen's_Touch) |
| Polychrome | 1/tick (8 tick đầu) | tăng lên 2/tick (6 tick kế) | 20 | 0% | — | có (laser) + hiệu ứng sét lan (chain) | [Polychrome](https://soul-knight.fandom.com/wiki/Polychrome) |
| Meteo Laser Gun | 1~31 (biến thiên) | — | 10 | 0~50% | 23.25 | — | [Meteo Laser Gun](https://soul-knight.fandom.com/wiki/Meteo_Laser_Gun) |
| Nasty Laser | 5 | — | 1 | 10% | 16.5 | — | [Nasty Laser](https://soul-knight.fandom.com/wiki/Nasty_Laser) |
| Laser Therapy | 1 | — | 0 | 0% | 6.2 | — | [Laser Therapy](https://soul-knight.fandom.com/wiki/Laser_Therapy) |
| Laser Shotgun (laser dạng xung/pulse spread) | 4 | — | 4 | 10% | 21.12 | — (dạng shotgun-pulse) | [Laser Shotgun](https://soul-knight.fandom.com/wiki/Laser_Shotgun) |
| Dead Star Laser Gun | 6 | — | 2 | 30% | 34.5 | — | [Dead Star Laser Gun](https://soul-knight.fandom.com/wiki/Dead_Star_Laser_Gun) |

**Kết luận cơ chế cho port:** Laser liên tục = vòng lặp deal-damage theo tick trong khi giữ nút, energy trừ liên tục (không phải 1 lần/click); damage/tick có đường cong tăng dần (ramp-up) làm phần thưởng cho việc giữ tia lâu; hầu hết laser pierce xuyên toàn bộ enemy trên đường đi.

### 2.3 Sword-projectile (kiếm bắn ra sóng chém — kiểu Excalibur)

Không tìm thấy vũ khí tên "Excalibur" trong Soul Knight gốc (có thể nhầm với game khác) — [tìm kiếm không ra kết quả](https://soul-knight.fandom.com/wiki/Deep_Dark_Blade). Vũ khí gần nhất về hành vi "kiếm bắn sóng chém":

| Vũ khí | Cơ chế | Damage | Đặc biệt | Nguồn |
|---|---|---|---|---|
| **Deep Dark Blade** (Legendary, motif Dark Grand Knight) | Combo 2 đòn: (1) xoay người lao tới + tạo shockwave + 4 viên đạn có thể nảy (bounce) 1 lần; (2) đâm tới, tạo shockwave + 3 viên đạn tách thành 4 viên khi trúng | không公布 số cụ thể tìm được | shockwave có thể làm choáng (stun) địch | [Deep Dark Blade](https://soul-knight.fandom.com/wiki/Deep_Dark_Blade) |
| Thunder Sword | Combo chém dưới lên + chém trên xuống + đòn xoay | — | combo 3 nhịp | [Thunder Sword](https://soul-knight.fandom.com/wiki/Thunder_Sword) |
| Mo Dao (Very Rare, polearm dài) | Chém quét + combo 4 đòn đâm, đẩy người chơi ~0.565 ô/đòn đâm | thấp/đòn nhưng range + tốc lớn | thiên phòng thủ (range lớn bù dmg thấp) | [Mo Dao](https://soul-knight.fandom.com/wiki/Mo_Dao) |
| Laser Sword Purple (full charge) | Tích lực rồi quét tia laser 185° quanh người chơi | 8~18 | tốn 15 energy khi full charge, crit 30% | [Laser Sword Purple](https://soul-knight.fandom.com/wiki/Laser_Sword_Purple) |

`[SUY ĐOÁN]` Vì không có "Excalibur" thật, nếu port cần một "vũ khí kiếm bắn sóng chém tầm xa" kiểu Vampire Survivors, mẫu gần nhất để tham khảo tốc độ bay/pierce là các projectile combo của Deep Dark Blade (4 viên nảy 1 lần, hoặc 3 viên tách thành 4) — nhưng không có số liệu travel speed cụ thể được công bố trên wiki.

### 2.4 Scythe / lưỡi hái xoay quanh người (orbiting blade)

Không tìm thấy vũ khí Soul Knight nào thật sự "orbit quanh người chơi và chặn đạn" — Midnight Sickle chỉ là **melee cận chiến bình thường** (9 dmg, 0 energy, crit 49%, 1.5 round/s), không orbit — [Midnight Sickle](https://soul-knight.fandom.com/wiki/Midnight_Sickle). Cơ chế orbit gần nhất tìm được là **kỹ năng nhân vật** chứ không phải vũ khí:

- **Battle Storm** (skill, không rõ nhân vật) — nhân vật xoay tròn nhanh, khiến đạn của cả bản thân lẫn địch **orbit quanh người chơi** — [tìm kiếm qua wiki](https://soul-knight.fandom.com/wiki/Category:Melee_Weapons). `[SUY ĐOÁN]` đây có thể là cơ chế "chặn đạn" gần nhất — nhưng chưa xác nhận được số liệu bán kính/tick rate cụ thể.
- **Breath of Hades**: bắn 1 projectile hình lưỡi liềm nhỏ màu tím, đồng thời triệu hồi các lưỡi hái giáng xuống sau một khoảng trễ, mỗi lưỡi gây **10 damage** — đây là AoE trì hoãn (delayed strike), không phải orbit — [Breath of Hades](https://soul-knight.fandom.com/wiki/Breath_of_Hades).
- **Satellite Floating Gun**: 2 drone bay 2 bên người chơi (không hẳn "orbit" theo nghĩa xoay tròn, mà bám theo 2 bên) — [Satellite Floating Gun](https://soul-knight.fandom.com/wiki/Satellite_Floating_Gun).

`[SUY ĐOÁN]` Kết luận: Soul Knight **không có vũ khí scythe-orbit kiểu Vampire Survivors** (không có cơ chế lưỡi hái xoay liên tục quanh người + chặn đạn địch trong dữ liệu tìm được). Nếu port game cần cơ chế này, đây là điểm khác biệt cần tự thiết kế (không có analogue trực tiếp trong Soul Knight) — nên tham khảo game khác (Vampire Survivors "King Bible"/"Garlic") cho phần này thay vì Soul Knight.

### 2.5 Staff — lob fireball / AoE

| Vũ khí | Cơ chế | Damage | Energy | Đặc biệt | Nguồn |
|---|---|---|---|---|---|
| Staff of Fire Crystal (core) | Bắn 3 quả cầu lửa chậm-khá nhanh theo hình nón | 5/quả | — | cone shape | [tìm kiếm](https://soul-knight.fandom.com/wiki/Staff_of_Wizard) (kết quả tổng hợp) |
| Warlock's Staff (fire form, basic) | Bắn 1 quả cầu lửa tròn | 10 Fire dmg | — | — | như trên |
| Warlock's Staff (fire form, full charge) | Triệu hồi vòng lửa mưa thiên thạch, tổng 12 lượt đánh | 1 Fire dmg/lượt (×12) | — | cast trễ do phải charge full | như trên |
| Staff of Shooting Stars | Sinh 3 thiên thạch quanh người chơi, nổ khi chạm đất | 10/thiên thạch | — | AoE nổ khi rơi | như trên |
| Staff of Wizard (Legendary) | 7 đạn hình quạt 90°, 4 màu luân phiên | 3/đạn | 3 | Freeze/Poison/Burn khi crit (crit 80%) | [Staff of Wizard](https://soul-knight.fandom.com/wiki/Staff_of_Wizard) |
| Wizard's Staff (Rare) | 4 đạn tím hình chữ thập | 3/đạn | 3 | homing | [Wizard's Staff](https://soul-knight.fandom.com/wiki/Wizard's_Staff) |
| Bucket (tương tự) | Tích lực rồi ném cụm đạn nước tỏa splash quanh điểm rơi | 8/viên chính + 10 splash | — | AoE splash tại điểm rơi | [tìm kiếm](https://soul-knight.fandom.com/wiki/Staff_of_Wizard) |

`[SUY ĐOÁN]` Không tìm được số liệu cast delay (giây) hay bán kính splash chính xác (theo ô/tile) cho các staff trên — wiki mô tả hành vi định tính, không luôn kèm số mét/giây cụ thể.

### 2.6 Bazooka / Rocket Launcher

| Vũ khí | Damage | Energy | Rarity | Splash/AoE | Đặc biệt | Nguồn |
|---|---|---|---|---|---|---|
| Bazooka | 8 (AoE) | 4 | Uncommon | bán kính 3.5 ô | không thể crit, gây Burn | [Bazooka](https://soul-knight.fandom.com/wiki/Bazooka) |
| Worn Bazooka | 8 | 6 | Common | — | inaccuracy 2, 1 round/s | [Worn Bazooka](https://soul-knight.fandom.com/wiki/Worn_Bazooka) |
| Ice Bazooka | 15 (va chạm) + 15 (nổ băng, biến mất sau 0.8s) | 5 | Very Rare (tím) | gai băng lan ra sau va chạm | knockback, có thể Freeze, 1 round/s, inaccuracy 3 | [Ice Bazooka](https://soul-knight.fandom.com/wiki/Ice_Bazooka) |
| Old Rocket Launcher | 8 | 8 | Common | — | — | [tìm kiếm](https://soul-knight.fandom.com/wiki/Rocket_Gun) |
| Rocket Gun | 15 | 5 | Very Rare | — | — | [Rocket Gun](https://soul-knight.fandom.com/wiki/Rocket_Gun) |
| Rocket Gun M1 | 16 | 5 | — | nổ tại đích | **homing** (tự dò mục tiêu), tốc độ bay giảm để bù homing, có thể Burn | [Rocket Gun M1](https://soul-knight.fandom.com/wiki/Rocket_Gun_M1) |
| Splash Railgun | biến thiên theo charge | — | — | — | bắn quả cầu năng lượng, có thể charge tăng cỡ+dmg, bắn tối đa 3 tia theo góc tỏa | [Splash Railgun](https://soul-knight.fandom.com/wiki/Splash_Railgun) |

`[SUY ĐOÁN]` Không tìm được số liệu **self-damage** (sát thương tự gây cho bản thân khi đứng gần vụ nổ) cho bất kỳ bazooka nào — nhiều khả năng game **không mô phỏng self-damage** cho launcher (khác Vampire Survivors' kiểu game khác có splash tự gây hại); cần kiểm chứng thêm nếu port cần cơ chế này.

---

## 3. Hệ thống Energy (năng lượng)

- Energy là tài nguyên bắt buộc để dùng **hầu hết vũ khí tầm xa**; hết energy thì vũ khí tốn energy trở nên vô dụng (không bắn được) — [Stats — Energy](https://soul-knight.fandom.com/wiki/Stats#Energy).
- **Không có cơ chế regen-theo-thời-gian mặc định cho energy** (khác với Armor — Armor tự hồi 1 điểm/giây sau 5 giây không bị đánh trúng) — energy chỉ được nạp lại qua: vật phẩm rơi từ quái, Statue of the Priest, một số skill nhân vật, một số buff, và potion — [phân tích hệ thống game (Medium, qua tìm kiếm)](https://medium.com/@jake.gollub/an-in-depth-analysis-of-the-game-systems-of-soul-knight-4e6accb4e51e), [Game Mechanics](https://soul-knight.fandom.com/wiki/Game_Mechanics). `[SUY ĐOÁN]` Đây là khác biệt thiết kế quan trọng nếu port game giả định "mana tự hồi" — Soul Knight dùng energy như **tài nguyên bán tiêu hao kiểu ammo**, buộc người chơi đổi vũ khí/dùng melee khi cạn, không phải chờ hồi.
- Nguồn nạp energy cụ thể có số liệu:
  - **Energy Stone** (gắn lên vũ khí): 33% cơ hội hồi **2 energy** mỗi lần bắn — [Energy Stone](https://soul-knight.fandom.com/wiki/Energy_Stone).
  - **Buff "Max energy +100"**: tăng max energy +100 cho lượt chơi hiện tại, đồng thời hồi ngay 100 energy — [Max energy +100](https://soul-knight.fandom.com/wiki/Max_energy_%2B100).
  - **Buff "Restore 30% max energy khi sang màn tiếp theo"** — [qua tìm kiếm Buffs](https://soul-knight.fandom.com/wiki/Buffs).
  - **Skill mentor upgrade (Knight — Dual Wield)**: hồi liên tục **3 energy mỗi 0.5 giây** (= 6 energy/giây) trong suốt thời gian skill kích hoạt — [Knight](https://soul-knight.fandom.com/wiki/Knight).
  - **Paladin — Energy Shield (nâng cấp)**: sát thương lá chắn hấp thụ được chuyển thành energy, **+2 energy mỗi lần** hấp thụ 1 đòn đánh (kể cả tick trạng thái) — [Paladin](https://soul-knight.fandom.com/wiki/Paladin).
- **Vì sao vũ khí melee tốn 0 energy:** melee (và vũ khí khởi đầu) được thiết kế miễn phí để làm phương án dự phòng khi cạn energy — cho phép người chơi vẫn chiến đấu (dù yếu hơn) mà không bị "khóa combat" hoàn toàn — [thảo luận trên forum wiki, qua tìm kiếm](https://soul-knight.fandom.com/f/t/Weapons). Cơ chế này tạo ra đánh đổi: vũ khí energy cao/damage cao dùng dồn dập rồi phải rút về melee "miễn phí" chờ nhặt/hồi energy.

---

## 4. Kỹ năng chủ động của nhân vật (active skills)

| Nhân vật | Skill | Cooldown (giây, cơ bản → nâng cấp) | Hiệu ứng | Nguồn |
|---|---|---|---|---|
| Knight | Skill 1 | 8 → 6 | không rõ chi tiết số liệu hiệu ứng qua tìm kiếm | [Knight](https://soul-knight.fandom.com/wiki/Knight) |
| Knight | Dual Wield | 10 → 8 | song kiếm; bản nâng cấp: hồi 3 energy/0.5s suốt thời lượng skill | [Knight](https://soul-knight.fandom.com/wiki/Knight) |
| Assassin | Dark Blade | 9 → 7 | — | [Assassin](https://soul-knight.fandom.com/wiki/Assassin) |
| Assassin | Invisibility | 6 → 4 | tàng hình | [Assassin](https://soul-knight.fandom.com/wiki/Assassin) |
| Paladin | **Energy Shield** (shield/barrier) | 12 → 10 (tính từ lúc skill kết thúc) | Bong bóng khiên bao quanh 4 giây, chặn toàn bộ đạn/damage trực tiếp (không chặn status/knockback nhưng vẫn hấp thụ dmg từ status/môi trường); nâng cấp: +2 energy/đòn hấp thụ, +3s thời lượng | [Paladin](https://soul-knight.fandom.com/wiki/Paladin) |
| Paladin | Holy Warrior / Splash & Bash | 14 → 12 (tính từ lúc hết hiệu ứng) / 9.5 → 7.5 | — | [Paladin](https://soul-knight.fandom.com/wiki/Paladin) |
| Special Forces | Special Operation | 9 → 7 | — | [Special Forces](https://soul-knight.fandom.com/wiki/Special_Forces) |
| Special Forces | Skill 2 | 4 | — | [Special Forces](https://soul-knight.fandom.com/wiki/Special_Forces) |
| Berserker | Rage | 4 → 2 | — | [Berserker](https://soul-knight.fandom.com/wiki/Berserker) |
| Berserker | Free Style | 10 → 8 (tính từ lúc hết thời lượng) | — | [Berserker](https://soul-knight.fandom.com/wiki/Berserker) |
| Werewolf | Berserk | 12 → 10 (tính từ lúc hết hiệu ứng) | — | [Werewolf](https://soul-knight.fandom.com/wiki/Werewolf) |
| Werewolf | Blood Thirst | — | chém liên tiếp bằng vuốt, đánh trúng thì hồi máu (lifesteal) | [Werewolf](https://soul-knight.fandom.com/wiki/Werewolf) |
| Rogue | **Iaido** (dash/blink) | mỗi stack 3 → 2 giây hồi, tối đa 4 stack | lao (dash) 10 ô tới địch và chém, **không nhận sát thương trong lúc dash** | [Rogue](https://soul-knight.fandom.com/wiki/Rogue) |
| Sword Master | Blinkblade Codex (3 giai đoạn) | — | GĐ1-2: lao tới + chém + triệu hồi kiếm; GĐ3: lao xuyên qua tất cả kiếm đã triệu hồi trên bản đồ rồi quay lại điểm gốc | [Sword Master](https://soul-knight.fandom.com/wiki/Sword_Master) |
| Engineer | **Gun Turret** (summon) | 9 → 7 | Triệu hồi súng máy tự động: 2 dmg/viên, 0% crit, inaccuracy 8, **12 HP**, tồn tại **10 giây**; tối đa **3 turret** cùng lúc (turret cũ nhất bị phá nếu build thêm) | [Engineer](https://soul-knight.fandom.com/wiki/Engineer) |
| Druid | Vines (AoE summon) | 12 → 10 | 6 dây leo mọc lên trong vùng 8×8 ô, tự héo sau 8.5s hoặc khi hết HP | [Druid](https://soul-knight.fandom.com/wiki/Druid) |
| Druid | Fuzzy Bear (summon) | 10 → 8 | — | [Druid](https://soul-knight.fandom.com/wiki/Druid) |
| Necromancer | Returnal (summon Ghostrider) | 6 | triệu hồi 1 Ghostrider hỗ trợ | [Necromancer](https://soul-knight.fandom.com/wiki/Necromancer) |
| Officer | Skill 1 (burst charge) | — | 3 charge, mỗi charge nạp 1 viên đạn vào súng, tối đa 6 viên tích trữ | [Officer, qua tìm kiếm](https://soul-knight.fandom.com/f/t/Officer) |
| Archer (kiểu) | Multishot | 5 | bắn nhiều mũi tên cùng lúc, tăng khả năng trúng nhiều mục tiêu | [tìm kiếm chung](https://soul-knight.fandom.com/wiki/Combo_Turbo) |
| Arcane Knight | Aegis Circle | — | tăng tốc độ di chuyển **+60%** | [Arcane Knight](https://soul-knight.fandom.com/wiki/Arcane_Knight) |
| "Blue Knight" (Special Forces skin/mode) | Meteor stacking | 4 | mỗi đòn đánh triệu hồi thêm thiên thạch (meteor); nếu không gây dmg trong lúc skill active, cỡ đạn+nổ tăng mỗi 0.5s và dmg thiên thạch +1, tối đa **4 stack** | [Special Forces qua tìm kiếm](https://soul-knight.fandom.com/wiki/Skills) |

`[SUY ĐOÁN]` Không tìm thấy skill "meteor/orbital strike" độc lập rõ ràng ngoài ví dụ Blue Knight nêu trên — trang tổng hợp [Skills](https://soul-knight.fandom.com/wiki/Skills) liệt kê đầy đủ nhưng không lấy được toàn bộ nội dung bảng qua tìm kiếm (chỉ snippet); nên tra cứu trực tiếp trang này khi có thể truy cập fandom bình thường.

---

## 5. Rarity vs Power (độ hiếm vs sức mạnh)

- Soul Knight dùng **6 bậc rarity theo màu**: White (Common) → Green (Uncommon) → Blue (Rare) → Purple (Very Rare) → Orange (Epic/Unique) → Red (Legendary) — [tổng hợp qua tìm kiếm](https://www.chaptercheats.com/qna/android/377151/soul-knight-answers/163951), phù hợp với ví dụ cụ thể: Knight's Fist = Rare/Blue, Reforged Sacred Sword = Very Rare/Purple — [Knight's Fist](https://soul-knight.fandom.com/wiki/Knight's_Fist), [Reforged Sacred Sword](https://soul-knight.fandom.com/wiki/Reforged_Sacred_Sword).
- Rarity ảnh hưởng **tỉ lệ rơi/gặp** (encounter rate), không phải một công thức damage cố định — mỗi bậc rarity "thường" mạnh hơn nhưng có ngoại lệ rõ: **Shotgun M2 (Uncommon/Green, DPS 35.28)** DPS cao hơn **Shotgun M3 (Rare/Blue, DPS 25.2)** dù M3 rarity cao hơn — vì M3 tốn energy gấp 3 lần (3 vs 1) — [Shotgun M2](https://soul-knight.fandom.com/wiki/Shotgun_M2), [Shotgun M3](https://soul-knight.fandom.com/wiki/Shotgun_M3).
- **Nâng cấp (upgrade) tại lò rèn**: mỗi lần nâng cấp tăng damage vũ khí thêm **10% damage gốc**; chi phí nâng cấp tăng theo rarity (Common rẻ nhất, Legendary đắt nhất) — [Weaponsmith, qua tìm kiếm](https://soul-knight.fandom.com/wiki/Weaponsmith).
- `[SUY ĐOÁN]` Từ các bảng số liệu thu thập được (mục 1–2), rarity cao hơn thường đi kèm: (a) cơ chế phức tạp hơn (status effect, homing, multi-color đạn, charge) chứ không chỉ damage/DPS thô cao hơn, và (b) **energy cost cao hơn** — nên rarity trong Soul Knight tương quan với "độ phức tạp cơ chế + chi phí energy", không phải hàm số tuyến tính với DPS. Đây là điểm khác nhiều game roguelite khác (nơi rarity ≈ DPS scaling thuần).

---

## Danh sách nguồn đã dùng (URL đầy đủ)

- https://soul-knight.fandom.com/wiki/Category:Weapons
- https://soul-knight.fandom.com/wiki/Category:Melee_Weapons
- https://soul-knight.fandom.com/wiki/Stats
- https://soul-knight.fandom.com/wiki/Game_Mechanics
- https://soul-knight.fandom.com/wiki/Bad_Pistol
- https://soul-knight.fandom.com/wiki/New_Pistol
- https://soul-knight.fandom.com/wiki/P250_Pistol
- https://soul-knight.fandom.com/wiki/Grenade_Pistol
- https://soul-knight.fandom.com/wiki/Fantastic_Gun
- https://soul-knight.fandom.com/wiki/SMG_M1
- https://soul-knight.fandom.com/wiki/Soul_Calibre
- https://soul-knight.fandom.com/wiki/Shotgun
- https://soul-knight.fandom.com/wiki/Shotgun_M2
- https://soul-knight.fandom.com/wiki/Shotgun_M3
- https://soul-knight.fandom.com/wiki/Shotgun_Pro
- https://soul-knight.fandom.com/wiki/Cherry_Blossom
- https://soul-knight.fandom.com/wiki/Meteo_Laser_Gun
- https://soul-knight.fandom.com/wiki/Nasty_Laser
- https://soul-knight.fandom.com/wiki/Laser_Therapy
- https://soul-knight.fandom.com/wiki/Laser_Shotgun
- https://soul-knight.fandom.com/wiki/Ion_Laser
- https://soul-knight.fandom.com/wiki/Laggy_Laser_Gun
- https://soul-knight.fandom.com/wiki/Dead_Star_Laser_Gun
- https://soul-knight.fandom.com/wiki/Polychrome
- https://soul-knight.fandom.com/wiki/Queen's_Touch
- https://soul-knight.fandom.com/wiki/Wiki_Terminology
- https://soul-knight.fandom.com/wiki/Bow
- https://soul-knight.fandom.com/wiki/Bazooka
- https://soul-knight.fandom.com/wiki/Worn_Bazooka
- https://soul-knight.fandom.com/wiki/Ice_Bazooka
- https://soul-knight.fandom.com/wiki/Rocket_Gun
- https://soul-knight.fandom.com/wiki/Rocket_Gun_M1
- https://soul-knight.fandom.com/wiki/Splash_Railgun
- https://soul-knight.fandom.com/wiki/Staff_of_Wizard
- https://soul-knight.fandom.com/wiki/Wizard's_Staff
- https://soul-knight.fandom.com/wiki/Midnight_Sickle
- https://soul-knight.fandom.com/wiki/Breath_of_Hades
- https://soul-knight.fandom.com/wiki/Deep_Dark_Blade
- https://soul-knight.fandom.com/wiki/Soul_Calibre (Soul Calibre)
- https://soul-knight.fandom.com/wiki/Thunder_Sword
- https://soul-knight.fandom.com/wiki/Mo_Dao
- https://soul-knight.fandom.com/wiki/Laser_Sword_Purple
- https://soul-knight.fandom.com/wiki/Laser_Sword_Red
- https://soul-knight.fandom.com/wiki/Satellite_Floating_Gun
- https://soul-knight.fandom.com/wiki/Hand_Grenade
- https://soul-knight.fandom.com/wiki/Energy_Stone
- https://soul-knight.fandom.com/wiki/Max_energy_%2B100
- https://soul-knight.fandom.com/wiki/Buffs
- https://soul-knight.fandom.com/wiki/Knight
- https://soul-knight.fandom.com/wiki/Assassin
- https://soul-knight.fandom.com/wiki/Paladin
- https://soul-knight.fandom.com/wiki/Special_Forces
- https://soul-knight.fandom.com/wiki/Berserker
- https://soul-knight.fandom.com/wiki/Werewolf
- https://soul-knight.fandom.com/wiki/Rogue
- https://soul-knight.fandom.com/wiki/Sword_Master
- https://soul-knight.fandom.com/wiki/Engineer
- https://soul-knight.fandom.com/wiki/Druid
- https://soul-knight.fandom.com/wiki/Necromancer
- https://soul-knight.fandom.com/f/t/Officer
- https://soul-knight.fandom.com/wiki/Combo_Turbo
- https://soul-knight.fandom.com/wiki/Arcane_Knight
- https://soul-knight.fandom.com/wiki/Skills
- https://soul-knight.fandom.com/wiki/Knight's_Fist
- https://soul-knight.fandom.com/wiki/Reforged_Sacred_Sword
- https://soul-knight.fandom.com/wiki/Weaponsmith
- https://www.chaptercheats.com/qna/android/377151/soul-knight-answers/163951
- https://medium.com/@jake.gollub/an-in-depth-analysis-of-the-game-systems-of-soul-knight-4e6accb4e51e

## Giới hạn nghiên cứu

Công cụ WebFetch bị chặn hoàn toàn trên domain `soul-knight.fandom.com` (server trả HTTP 402 Payment Required) trong suốt phiên nghiên cứu này, kể cả qua Google Translate proxy (redirect quay lại domain gốc và vẫn bị chặn) và qua API MediaWiki. Toàn bộ dữ liệu trong báo cáo được lấy qua **WebSearch**, công cụ này tự trích snippet nội dung khá chi tiết từ trang wiki nhưng đôi khi không lấy được **toàn bộ bảng số liệu** trên trang gốc (ví dụ trang [Skills](https://soul-knight.fandom.com/wiki/Skills) tổng hợp, hoặc cast-delay/travel-speed cụ thể của staff/bazooka). Các mục còn thiếu số liệu đã được ghi chú rõ trong bảng tương ứng.
