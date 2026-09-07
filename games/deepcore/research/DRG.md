# Deep Rock Galactic — Nghiên cứu thiết kế (bản gốc, Ghost Ship Games)

> Tài liệu tra cứu cho dự án `deepcore`. Mọi số liệu đều kèm `[NGUỒN]` + URL ngay tại chỗ.
> `[ĐỀ XUẤT]` = suy luận/ý kiến của người viết, KHÔNG phải dữ liệu game.
> "không tra được" = wiki/nguồn chính thức không ghi con số đó.
>
> Ngày tra: 2026-09-07. Nguồn chính: wiki chính thức `deeprockgalactic.wiki.gg`, wiki cộng đồng `deeprockgalactic.fandom.com`, Steam store page, phỏng vấn Ghost Ship Games.

**Tagline chính thức:** "NO DWARF LEFT BEHIND - FOR ROCK AND STONE!" — co-op 1-4 người, hang procedural, **môi trường phá hủy 100%**, **11 biome**, hơn 50 loại quái (bay / bò / chui đất). `[NGUỒN]` https://store.steampowered.com/app/548430/Deep_Rock_Galactic/

**Lưu ý về mọi con số HP/damage bên dưới:** wiki ghi giá trị **base**, rồi nhân theo Hazard Level và số người chơi (xem mục 3). Ví dụ Grunt 90 base → 63 ở Haz1 solo.

---

## 1. Loại nhiệm vụ (Mission types)

Mỗi mission có **Length 1-3** (độ dài hang) và **Complexity 1-3** (độ rối của hang). Chỉ tiêu tăng theo Length/Complexity.

### Bảng tổng hợp chỉ tiêu

| Mission | Mục tiêu chính | Chỉ tiêu theo Length/Complexity | Kích hoạt kết màn |
|---|---|---|---|
| **Mining Expedition** | Đào Morkite, nộp vào M.U.L.E. | L1C1 **200**, L2C1 **225**, L2C2 **250**, L3C2 **325**, L3C3 **400** Morkite | Bấm nút đỏ trên M.U.L.E. → Drop Pod, **5 phút** |
| **Egg Hunt** | Đào trứng Glyphid, nộp M.U.L.E. | L1C1 **4**, L2C2 **6**, L3C2 **8** trứng | Nút đỏ M.U.L.E. → **5 phút** |
| **On-site Refining** | Lọc Liquid Morkite tại chỗ | Luôn **3 giếng (Wells)** | Lọc xong → rocket phóng ngay → **3 phút** chạy vào Drop Pod |
| **Salvage Operation** | Sửa Mini-M.U.L.E. + uplink + fuel cells | L2C2 **2** mule, L3C3 **3** mule; mỗi mule thiếu **3 chân** | Nạp xong fuel cells → Drop Pod chờ **1 phút** |
| **Point Extraction** | Vác Aquarq về Minehead | L2C3 **7**, L3C3 **10** Aquarq | Bấm nút → Drop Pod **đến sau 2 phút**, mở cửa thêm **3 phút** (tổng 5) |
| **Escort Duty** | Hộ tống Drilldozer tới Ommoran Heartstone | L2 **1** trạm tiếp nhiên liệu, L3 **2** trạm; mỗi trạm nạp **2 bình** | Lấy lõi Ommoran → nộp M.U.L.E. → nút đỏ → **5 phút** |
| **Elimination** | Diệt Dreadnought trong kén | L2C2 **2**, L3C3 **3** mục tiêu | Nút đỏ M.U.L.E. → **5 phút** |
| **Industrial Sabotage** | Hack 2 trạm điện + hạ Caretaker | **2** Power Station; hack **90 giây** liên tục | Lấy Data Rack → nộp M.U.L.E. → nút đỏ → **5 phút** |
| **Deep Scan** | Quét Resonance Crystal rồi xuống Geode | L1C2 **3**, L2C3 **5** scan; trong Geode gom **7 Morkite Seed** | Gom đủ seed → dùng Jet Boots thoát → **5 phút** |
| **Heavy Extraction** | Kéo Resinite Mass bằng Lift Pod | L2 **3**, L3 **4** khối Resinite | Nút đỏ M.U.L.E. → **5 phút** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Missions ·
https://deeprockgalactic.wiki.gg/wiki/Drop_Pod ·
https://deeprockgalactic.wiki.gg/wiki/Point_Extraction ·
https://deeprockgalactic.wiki.gg/wiki/On-site_Refining ·
https://deeprockgalactic.wiki.gg/wiki/Salvage_Operation ·
https://deeprockgalactic.wiki.gg/wiki/Elimination ·
https://deeprockgalactic.wiki.gg/wiki/Industrial_Sabotage ·
https://deeprockgalactic.wiki.gg/wiki/Deep_Scan ·
https://deeprockgalactic.wiki.gg/wiki/Egg_Hunt

### Chi tiết trình tự từng loại

**Mining Expedition** — Loại cơ bản nhất. Tìm mạch Morkite (xanh lá) trong tường → đào → nộp vào M.U.L.E. (Molly). Molly tự đi theo người chơi, gọi nó bằng phím `C`; nó **bất tử và quái không bao giờ đánh nó** (chỉ hazard điện làm nó chậm lại). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/M.U.L.E.

**Egg Hunt** — Trứng nằm trong khối màng tím phải đào ra. Khi trứng bung, đất rung + có **tiếng thét Glyphid vọng xa**. Số trứng gây swarm được định sẵn lúc sinh map và **mọi trứng trông giống nhau** nên không đoán được: map 4 trứng → **1** trứng gây swarm; 6 trứng → **2**; 8 trứng → **3**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Egg_Hunt

**On-site Refining** — Tìm 3 mạch phun xanh → gọi Pumpjack → nối **pipeline** từ Mobile Refinery tới từng pumpjack (mỗi đốt ống đặt cách nhau tối đa **9 m**, xây **5 giây/đốt**, nhiều người xây nhanh hơn; có thể **trượt trên ống** như đường ray). Bấm lọc → **150 giây** lọc. Trong lúc lọc, ống **rò rỉ** làm dừng tiến độ: khoảng cách giữa các lần rò là **50-70s (solo) / 45-65s (2 người) / 40-60s (3) / 35-55s (4)**; vá mất **5 giây/mối nối**. Đáng chú ý: khi bắt đầu lọc, **thay vì swarm theo chu kỳ thì là MỘT swarm liên tục không nghỉ**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/On-site_Refining

**Salvage Operation** — Tìm Mini-M.U.L.E. hỏng, mỗi con thiếu **3 chân** (rải quanh, có chân thừa). Khi lại gần một con, sau **5-35 giây** nổ một wave lớn **300 Difficulty Points**, rồi **25-40 giây** sau thêm wave nhỏ **150 DP**. Sửa xong → gọi về Drop Pod → sửa uplink (đứng trong quả cầu xanh mà thủ) → nạp fuel cells (từ lúc này **swarm không ngừng nữa**). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Salvage_Operation

**Point Extraction** — Aquarq là **vật nặng phải vác bằng tay** về Minehead (Minehead có sẵn **3 sentry turret** và đèn pha). Đây là mission có nhịp spawn khác hẳn: swarm đầu tại **4m29s** (Haz 1-4) hoặc **3m59s** (Haz 4.5+), sau đó cứ **5-6 phút** một lần; ngoài ra còn **Pressure Wave chạy liên tục cả màn** — wave đầu delay **55 giây**, mỗi wave sau giảm 1 giây (`55 − SpawnedWaves`), sàn là `40/PointExtractionScaler`; cỡ wave = `max(80, 40 + 5×(WaveNumber−1))` × Enemy Count modifier. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Point_Extraction · https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP

**Escort Duty** — Drilldozer có **3 mảng máu riêng: sườn trái, sườn phải, thân**. Mảng nào vỡ thì **không sửa lại được**, hỏng lan sang mảng kế; **thân về 0 = thua mission**. Tại trạm tiếp nhiên liệu, dùng tia laser hóa lỏng Oil Shale để đổ đầy **2 bình**. Tới Heartstone: **4 pha, tổng ~300 giây**; pha 2 và 4 Heartstone tung 1 trong 3 đòn — **Flying Rocks** (đá bay, bắn vỡ được), **Ommoran Beamers** (tháp pha lê bắn laser liên tục), **Crystal Traps** (bọc dwarf vào đá, phải đập ra). Hết pha 4 có shockwave quét sạch quái quanh đó. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Escort_Duty

**Elimination** — Kén cần **100 damage** để phá (súng, nổ, thậm chí Resupply Pod rơi trúng); kén **kháng 100% Nanite** nhưng không kháng loại khác. Vỡ kén là Dreadnought ra ngay. 3 biến thể có thể ra: **Glyphid Dreadnought**, **Dreadnought Hiveguard**, **Dreadnought Twins**; **không cho cùng một biến thể ra từ 2 kén liên tiếp**. Cửa Drop Pod chỉ mở khi M.U.L.E. đã vào. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Elimination

**Industrial Sabotage** — 2 Power Station. Gọi Hacking Pod → rải Transmitter Node nối pod với trạm → **thủ pod 90 giây** hack không đứt. Xong 2 trạm → tháo pin dự phòng của force field → đánh **Caretaker** 3 pha: **4 điểm yếu "intake"** ở 4 góc trên mở đầu mỗi pha, phá hết thì lộ **mắt** (điểm yếu chính); pha 1 có **3 tay máy**, pha 2-3 có **4 tay máy tự hồi sinh**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Industrial_Sabotage

**Deep Scan** — Dò Resonance Crystal bằng **Telemetric Rangefinder** trên HUD → đào ra → gọi Scanner Pod, nối cáp. Xong hết thì **Drillevator** khoan xuống; trong lúc xuống **quái đổ liên tục từ trên** và phải sửa **4 đường ray càng (claw tracks)** đang mòn dần. Xuống Geode gom **7 Morkite Seed** (đập cụm xanh bằng cuốc/khoan/Impact Axe), rồi dùng **Jet Boots Mk2** bay lên. Thưởng: **600-1.002 credits, 2.200-3.674 XP** tùy độ dài. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Deep_Scan

### Nhiệm vụ phụ (Secondary Objectives)

Luôn có **1** (đôi khi 2 với anomaly "Secret Secondary"), chọn ngẫu nhiên; hoàn thành cho thêm credits/XP nhưng **không bắt buộc**:

| Secondary | Chỉ tiêu |
|---|---|
| Alien Fossil | 10 |
| Fester Flea | 10 |
| Apoca Bloom | 15 |
| Gunk Seed | 12 |
| Boolo Cap | 20 |
| Hollomite | 35 |
| Ebonut | 14 |
| Bha Barnacle | 16 |
| Glyphid Egg | 40 |
| Dystrum | 100 |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Missions

---

## 2. Kết màn / Extraction

**Gọi Drop Pod thế nào.** Khi đủ chỉ tiêu chính, một **nút đỏ sáng lên trên lưng M.U.L.E.** (hoặc trên Minehead / Mobile Refinery tùy mission). Bấm nút → Mission Control phóng Drop Pod xuống. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Drop_Pod

**Đếm ngược.**

| Mission | Thời gian |
|---|---|
| Chuẩn (Mining, Egg Hunt, Elimination, Escort, Sabotage, Deep Scan, Heavy Extraction) | **5 phút** |
| Point Extraction | Pod **đến sau 2 phút**, mở cửa **3 phút** |
| On-site Refining | **3 phút** |
| Salvage Operation | **1 phút** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Drop_Pod

**Dẫn đường.** M.U.L.E. tự chạy về phía Drop Pod và **rải cột mốc xanh phát sáng có mũi tên chỉ hướng** dọc đường — đây gần như là hệ thống dẫn đường duy nhất trong lúc chạy trốn. Tới nơi, cửa hông pod mở, một cần cẩu điện từ kéo M.U.L.E. vào. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/M.U.L.E.

### Quái spawn lúc chạy ra — CÓ, và dồn hơn hẳn bình thường

Wiki ghi rõ: trong pha thoát, **cứ 20 giây spawn một đợt, 100 Difficulty Points cơ bản MỖI NGƯỜI CHƠI**, rải ở nhiều điểm **dọc theo đường chạy về Drop Pod** — tức là **chặn đầu**, không chỉ đuổi sau lưng. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm

Để cảm nhận độ dồn, đối chiếu giá "Difficulty Point" của từng con: Swarmer **6 DP**, Grunt **10 DP**, Web Spitter **25 DP**, Praetorian **90 DP**, Bulk Detonator **120 DP**. Vậy 100 DP/người mỗi 20 giây ≈ **10 Grunt mỗi 20 giây cho mỗi dwarf** — với đội 4 người là ~40 Grunt/20 giây. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm · https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP

Một số mission còn chuyển sang chế độ **spawn không ngừng** TRƯỚC cả khi bấm nút thoát: On-site Refining (từ lúc bắt đầu lọc) và Salvage Operation (từ lúc nạp fuel cell). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/On-site_Refining · https://deeprockgalactic.wiki.gg/wiki/Salvage_Operation

### Thua khi nào

- **Không ai vào được Drop Pod** trước khi hết giờ → mission **failed**. Pod tự cất cánh khi hết giờ bất kể ai đang ở đâu; hoặc **cất cánh sớm nếu toàn bộ người còn sống đã vào vùng an toàn** (cơ chế rút ngắn thời gian chờ). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Drop_Pod
- **Cả đội cùng gục một lúc** → thua ngay. Nếu có người mang perk **Iron Will** thì được **10 giây ân huệ** sau khi cả đội ngã để kịp bấm. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Health
- **Escort Duty**: thân Drilldozer về 0 máu → thua. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Escort_Duty

**Cứu đồng đội.** Máu gốc dwarf **110 HP**. Hồi sinh bằng cách nhìn vào người ngã ở cự ly rất gần và giữ nút **6 giây (mặc định)**; người được cứu chỉ hồi lại một phần máu phụ thuộc Hazard (bảng ở mục 3). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Health

`[ĐỀ XUẤT]` Điểm thiết kế quan trọng: DRG **không phạt bằng permadeath**, mà phạt bằng **thời gian và vị trí**. Ngã xuống nghĩa là đồng đội mất 6 giây đứng yên giữa bầy quái — cái giá là *tempo*, không phải *tiến độ*.

---

## 3. Hệ thống spawn quái

### 3.1 Trả lời thẳng: DRG KHÔNG dồn liên tục — có nhịp nghỉ rõ rệt

Nhịp cơ bản của một màn DRG là **chu kỳ căng–chùng**:

1. **Trickle / nền** — quái lẻ tẻ, người chơi đào khoáng và khám phá. Wiki mô tả sau khi dọn xong swarm thì "enemy spawn rates are reduced back to normal". `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP
2. **Cảnh báo** — Mission Control hô báo swarm sắp tới.
3. **Swarm** — quái chui đất lên ồ ạt, nhiều đợt liên tiếp.
4. **Dọn tàn quân** → về lại nền.

Khoảng nghỉ giữa các swarm dài đến mức chiếm phần lớn thời lượng màn chơi ở Hazard thấp (xem bảng 3.3).

### 3.2 Cảnh báo swarm — báo bằng gì

| Kênh cảnh báo | Chi tiết |
|---|---|
| **Thoại** | Mission Control hô báo swarm đang tới |
| **Nhạc** | **Nhạc swarm bật lên** (chuyển track) |
| **Thoại dwarf** | Dwarf tự hô "contact" khi thấy quái |
| **Hiệu ứng màn hình** | **Không có** — wiki không ghi hiệu ứng screen nào |

Timing: thông báo phát **3,7 giây trước khi quái bắt đầu spawn**; đợt spawn đầu tiên rơi vào khoảng **20 giây sau thông báo**, gồm **270 Difficulty Points cơ bản** chia ra **3 điểm spawn trong bán kính 20 m quanh người chơi**. Tức là người chơi có ~20 giây để chọn chỗ đứng, đào công sự, đặt turret/shield. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm

### 3.3 Khoảng cách giữa các swarm

| Hazard | Khoảng cách giữa swarm |
|---|---|
| Haz 1 | **350-500 giây** (5m50s – 8m20s) |
| Haz 5 | **160-180s** hoặc **230-280s** (theo xác suất có trọng số) |

Ngoài ra còn cộng thêm delay tùy loại swarm vừa xong: **+103 giây** sau swarm thường, **+0 giây** sau Dreadnought. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm

Delay swarm **đầu tiên** của Mining Expedition:

| Hazard | Delay swarm đầu |
|---|---|
| Haz 1-2 | 150 s |
| Haz 3-3.5 | 112,5 s |
| Haz 4-4.5 | 75 s |
| Haz 5-5.5 | **0 s** (vào là đánh luôn) |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP

### 3.4 Bên trong một swarm: Pressure Wave

Swarm không phải một cục quái duy nhất mà là **chuỗi đợt nhỏ**: mỗi **Pressure Wave** mang **20-40 Difficulty Points cơ bản**, delay tới wave kế **10-15 giây** và **random lại sau mỗi wave**. Thành phần Pressure Wave trong swarm thường chỉ gồm **Grunt, Swarmer, Web Spitter** (không có quái nặng). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm

`[ĐỀ XUẤT]` Đây là chi tiết đáng học nhất: swarm giữ áp lực bằng **nhiều đợt nhỏ cách nhau 10-15s** chứ không dump một cục. Người chơi luôn có 10-15 giây để reload, dịch chuyển, hồi sinh đồng đội — nhịp "thở" ngay bên trong lúc căng.

### 3.5 Hệ thống Difficulty Points (ngân sách spawn)

Mỗi loại quái có "giá":

| Quái | Difficulty Points |
|---|---|
| Glyphid Swarmer | 6 |
| Glyphid Grunt | 10 |
| Glyphid Web Spitter | 25 |
| Glyphid Praetorian | 90 |
| Glyphid Bulk Detonator | 120 |

Ngân sách của mỗi wave = `base DP × Enemy Count Modifier` (modifier phụ thuộc Hazard + số người). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm · https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP

`[ĐỀ XUẤT]` Hệ "ngân sách điểm" này là cách rẻ nhất để cân bằng: một hàm duy nhất sinh ra cả wave 10 con nhỏ lẫn wave 1 con to, và tự scale theo số người mà không cần bảng riêng cho từng mission.

### 3.6 Hazard Level 1-5 ảnh hưởng gì

Cột theo thứ tự **Solo / 2 người / 3 người / 4 người**.

**Sát thương quái gây ra (nhân):**

| Hazard | Solo | 2p | 3p | 4p |
|---|---|---|---|---|
| Haz 1 | 0,50 | 0,50 | 0,50 | 0,50 |
| Haz 2 | 0,70 | 0,80 | 0,90 | 1,00 |
| Haz 3 | 1,20 | 1,30 | 1,40 | 1,50 |
| Haz 4 | 2,00 | 2,15 | 2,30 | 2,50 |
| Haz 5 | 2,80 | 3,00 | 3,20 | 3,40 |

**Kháng sát thương của quái (≈ máu hiệu dụng), mọi số người chơi:**

| Hazard | Hệ số |
|---|---|
| Haz 1 | 0,70 |
| Haz 2 | 1,00 |
| Haz 3 | 1,10 |
| Haz 4 | 1,20 |
| Haz 5 | 1,20 |

**Số lượng quái (Enemy Count Modifier):**

| Hazard | Solo | 2p | 3p | 4p |
|---|---|---|---|---|
| Haz 1 | 0,15 | 0,25 | 0,45 | 0,65 |
| Haz 2 | 0,25 | 0,35 | 0,65 | 0,80 |
| Haz 3 | 0,50 | 0,50 | 0,80 | 1,10 |
| Haz 4 | 0,75 | 0,75 | 1,15 | 1,35 |
| Haz 5 | 0,85 | 0,85 | 1,25 | 1,50 |

**Máu hồi lại sau khi được cứu (tỉ lệ máu tối đa):**

| Hazard | Máu sau hồi sinh |
|---|---|
| Haz 1 | 0,60 |
| Haz 2 | 0,50 |
| Haz 3 | 0,40 |
| Haz 4 | 0,20 |
| Haz 5 | **0,10** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Difficulty_Scaling

**Đọc bảng này ra điều gì.** Từ Haz1 → Haz5:
- Sát thương quái tăng **~5,6×** (0,50 → 2,80 solo).
- Máu hiệu dụng quái chỉ tăng **~1,7×** (0,70 → 1,20) — và **đứng yên từ Haz4 sang Haz5**.
- Số lượng quái tăng **~5,7×** solo (0,15 → 0,85), **~2,3×** ở 4 người.
- Máu hồi sinh tụt từ 60% xuống **10%**.

`[ĐỀ XUẤT]` Đây là kết luận thiết kế then chốt: **DRG tăng độ khó bằng SỐ LƯỢNG và SÁT THƯƠNG, gần như không bằng bao máu (bullet sponge)**. Người chơi ở Haz5 vẫn giết một con Grunt bằng đúng số viên đạn như Haz2 — chỉ là có 3× số Grunt và mỗi cú cắn đau gấp 3. Kèm theo đó, hình phạt cho sai lầm (máu hồi sinh 10%) mới là thứ tạo cảm giác "chết người".

---

## 4. Danh sách quái

Nguồn tổng quan: https://deeprockgalactic.wiki.gg/wiki/Creatures — mọi HP là **giá trị base** trước khi nhân Hazard/số người.

Ghi chú chung: "**Tất cả Glyphid đều leo được tường và trần, và đa số chui từ dưới đất lên khi spawn**." `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Creatures

### 4.1 Glyphid — họ bò/đào đất (chủ lực)

| Quái | HP base | Hành vi tấn công | Điểm yếu | Cách xử lý |
|---|---|---|---|---|
| **Swarmer** | 12 | Chỉ cận chiến: chém + **nhảy vọt** (~2,3 m, góc 35°). Chạy zigzag, bọc sườn, luôn đi theo bầy lớn | Không tra được (không có weakpoint) | Một phát là chết; cần AoE và crowd-control. Biến thể do Dreadnought nhả ra gây **+50% dmg** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Swarmer |
| **Grunt** | 90 | Lao thẳng vào cắn/chém, luôn ra theo cụm. Xương sống của mọi swarm | **Đầu ×2**; miệng + bụng không giáp cũng ×2. Thân + chân có Armor Strength 15 → **×0,8** | Bắn đầu; AoE cho đám đông. Mod Armor Breaking bỏ qua ×0,8 `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Grunt |
| **Grunt Guard** | 270 | Cận chiến nhưng **giơ hai chân trước che mặt khi bị bắn từ phía trước**; di chuyển chậm khi đang thủ | Đầu ×2. **Chân trước ×0 (miễn nhiễm)**. Thân giáp 60 HP → ×0,8. Kháng: lửa 25%, băng 30%, nổ 30%, ăn mòn 20% | **Stun để nó bỏ thế thủ**, hoặc vòng ra bắn sườn/lưng `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Grunt_Guard |
| **Grunt Slasher** | 148 | Grunt nhanh hơn, đòn **"Crippling Slash"**: dmg cao + **làm chậm còn 50% tốc độ trong 1,5 giây** | Đầu ×2. Thân/chân ×0,8. **Nổ −30%** (yếu với nổ) | Diệt từ xa. Gây **2,5× dmg của Grunt**; 1 đòn vỡ shield, 4-5 đòn là ngã `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Grunt_Slasher |
| **Exploder** | 20 | Chạy tới, dừng lại trong bán kính, **rít lên rồi tự nổ** (25 dmg / bán kính 3,5 m ở Haz1 solo). **Cũng nổ khi bị giết** | Đầu ×2. **Melee −25%** | Giết sớm từ xa. Một nhát cuốc vào đầu là chết. **Đóng băng, crit vào đầu, hoặc Wave Cooker giết mà KHÔNG cho nổ** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Exploder |
| **Web Spitter** | 39,9 | **Chỉ tầm xa**, bắn từ tường/trần: nhổ tơ **làm chậm nặng + mờ mắt 4 giây**, không gỡ sớm được | Đầu ×2. Thân + chân trước giáp 10 → ×0,8 | Bắn đầu từ xa. Debuff không né được sau khi trúng → **chỉ có positioning mới phòng được** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Web_Spitter |
| **Acid Spitter** | 120 | Chỉ tầm xa, **leo tường/trần**, nhổ axit gây damage-over-time; bắn một loạt rồi **đổi chỗ** | Đầu ×2. Thân/chân trước ×0,8. **Điện −10%** | Bắn đầu trước khi nó bám lên cao; vũ khí điện; đừng đứng trong vũng axit `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Acid_Spitter |
| **Septic Spreader** | 270 | **Pháo binh**: bắn cầu vồng khối đỏ, để lại **vũng độc tồn tại 12 giây**. Khi chết "Abdomen Rupture" để lại thêm vũng. Chạy né liên tục ở 4 m/s | **Túi bụng ×2**. Chỉ lưng có giáp (Armor Strength 20 → ×0,8) | Giết từ xa vì vũng độc khi chết. **Bắn rơi đạn của nó giữa không trung được**. Cần vũ khí chính xác vì nó rất né `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Septic_Spreader |
| **Stingtail** | 400 | **"Sting Whip": quăng đuôi túm dwarf ở xa và giật về phía nó** (tracking dự đoán, báo trước bằng **đuôi phát sáng đỏ + tiếng thét to**), rồi "Tusk Slam" đâm cận chiến | Miệng ×2, lưng ×2 (dưới giáp dày). Lưng/đuôi/chân giáp 50 HP ×0. Kháng lửa 30%; **nổ −50%, điện −30%, xuyên −10%** | **Né ngang lúc đuôi sáng đỏ**. Dùng nổ/mod phá giáp. Nguy hiểm nhất là bị giật xuống hố `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Stingtail |
| **Stalker** | 360 | **Tàng hình + chui đất**, áp sát ra đòn "Short-Circuit Slash" — **tắt shield 20 giây** + điện giật làm chậm. Đánh xong (hoặc ăn 80+ dmg) là chui đi | Đầu ×2. Thân/chân giáp nhẹ ×0,8 không phá được. Kháng điện 25%; **melee −50%** | **Bám sát đội hình**; auto-aim không khóa được lúc nó tàng hình. Laser pointer ping lộ nó ra nhưng làm nó nổi điện. Nghe tiếng báo `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Stalker |
| **Menace** | 700 | Đánh–chạy: bắn loạt axit nhanh từ trên cao rồi **chui vào tường** để đổi vị trí khi bị thương (mất vài giây mới ló ra) | Đầu ×2 (giáp 100 HP). **Hai túi bên hông ×2, phá được** | Bung damage giết nhanh trước khi nó chui. Lưu ý: **flamethrower/cryo KHÔNG phá được weakpoint dạng vỡ** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Menace |
| **Warden** | 800 | **HOÀN TOÀN KHÔNG TẤN CÔNG.** Buff quái xung quanh: **giảm 1/2 sát thương chúng nhận + hồi 3,5 HP mỗi 1,5 giây**; hú gọi thêm Grunt | Đầu ×2; **bầu sau lưng ×3**. Chân trước/cổ/mông: Armor Strength 15 = **miễn nhiễm hoàn toàn** | **Bắn bầu sau lưng** (×3, bỏ qua giáp). Giết nó là cả bầy mất buff — ưu tiên số 1 `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Warden |
| **Praetorian** | 750 | Lùi lại một nhịp rồi **phun nón axit** tầm xa hơn tưởng; cận chiến bằng càng trước. **Khi chết để lại mây khí độc** — mây này **bắt lửa thì nổ, gặp lạnh thì đóng băng tức thì** | Giáp dày mặt trước chặn hết damage cho tới khi vỡ; **miệng không giáp, bắn vào được**. Bụng không giáp chỉ ×1. Kháng xuyên 30% | Nó **đứng im hoàn toàn và không xoay được trong lúc phun axit** → vòng ra sau. **Shield Generator của Gunner KHÔNG chặn được đòn phun này** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Praetorian |
| **Oppressor** | 900 | Xe tăng: lao vào cận chiến AoE, **"Sonic Stomp"** (shockwave đẩy lùi), **"Rage Quake"** (giậm liên tục sinh măng đá gây damage), và **đào xuyên địa hình**. Chết để lại mây độc bắt lửa | **Điểm yếu duy nhất: mảng bụng xanh nhỏ trên LƯNG, chỉ ×1 (không bonus)**. Toàn bộ mặt trước ×0 không phá nổi. Kháng: lửa 66%, băng 50%, nổ 66%, điện 25%, ăn mòn 66%, xuyên 50%; **melee −50%** | **Chạy vòng quanh nó** (xoay rất chậm) và bắn lưng. **Power Attack bằng cuốc rất mạnh**. Miễn nhiễm stun và hầu hết fear → cực kỳ nguy hiểm trong hành lang hẹp `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Oppressor |
| **Brood Nexus** | 1800 (mắt 300/cái) | **Bất động, không tấn công**; **đẻ Glyphid Spawn vô hạn**. Khi chết bung thêm một đợt spawn (trừ khi đang đóng băng) | **4 con mắt phá được, ×2** (**×6 khi đang đóng băng**). Phá 1 mắt = **600 damage vào thân** | **Đóng băng rồi bắn 4 mắt**; đóng băng cũng hủy luôn đợt spawn lúc chết `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Brood_Nexus |
| **Bulk Detonator** | 4000 | Mini-boss: **"Hellfire"** — giậm hai càng trước tạo shockwave khổng lồ (**bán kính 8 m**, dmg tối đa trong 2,5 m) và **đốt cháy** dwarf. **"Dig"** xuyên địa hình khi mất tầm nhìn. **"Final Blow"**: khi chết **nổ đường kính hơn 10 m, giết ngay lập tức mọi thứ trong đó**, đồng thời bắn ra các cục nổ | **3 khối u vàng, ×3 damage**, mỗi cái 200 HP. Kháng nổ 50% (AoE làm được khối u nhưng **không ăn hệ số weakpoint**) | Giữ khoảng cách khỏi Hellfire, tập trung bắn khối u. **Sau khi giết PHẢI chạy xa** — vụ nổ chết chóc hơn cả con quái `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Bulk_Detonator |

Các Glyphid khác wiki liệt kê nhưng ít gặp: **Glyphid Spawn** (đầu ×2, yếu nhất), **Glyphid Sentinel** (lưng ×1,5, lính của Hiveguard). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Creatures

### 4.2 Mactera — họ bay

| Quái | HP base | Hành vi | Điểm yếu | Cách xử lý |
|---|---|---|---|---|
| **Mactera Spawn** | 223 | Khóa một mục tiêu, **lơ lửng ở cự ly cố định**, sạc một nhịp rồi bắn gai vàng. Bay né rất lắt léo | **Bụng ×3**, không giáp. **Lửa −100%, nổ −100%, điện −50%, xuyên −33%** (toàn điểm yếu) | Bắn bụng đúng lúc nó đứng yên sạc đòn. **Stun hủy được đòn**. Lửa/nổ tan ngay `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Spawn |
| **Mactera Tri-Jaw** | 350 | **"Triple Barrage"**: sạc ngắn rồi bắn **3 gai axit theo hình quạt**, mỗi gai nổ theo bán kính khi trúng | **Bụng ×3**. Lửa −100%, nổ −100%, điện −50%, melee −100%, **ăn mòn −120%** | Stun hủy cả loạt. **Nó KHÔNG né trước khi bắn** → dễ nhắm hơn Spawn `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Tri-Jaw |
| **Mactera Grabber** | 500 | Đòn duy nhất là **BẮT CÓC** — giơ càng, **thét rất to**, quắp dwarf mang lên cao rồi thả cho chết vì rơi; nếu không tìm được chỗ thả thì **buông sau 15-20 giây** | **Đầu bụng ×3**. Melee −50% | **Gây 25 damage trong bất kỳ 4 giây nào là nó phải thả người ra**. Perk Heightened Senses tự thoát; bám zipline cũng thoát `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Grabber |
| **Mactera Goo Bomber** | 800 | Bay vòng cung quanh mục tiêu, **rải vệt keo dính (−70% tốc độ)** lên người và địa hình, rồi dừng lại bắn đạn | **2 túi keo phá được, ×3** (50 giáp HP mỗi cái); phá hết là **mất luôn đòn keo**. Lửa −20%, melee −50%, ăn mòn −50% | Bắn vỡ 2 túi bên hông (to và dễ thấy). Ở Glacial Strata nó đổi thành **Frost Bomber** (bọt đóng băng) `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Goo_Bomber |
| **Mactera Brundle** | 600 | Bắn "Sting Shot" tầm xa nhưng **hung hăng lao vào tận mặt** | Bụng ×3 **nhưng bọc giáp dày (80 HP)**; **miệng không giáp, ăn full damage** | Bắn vào **miệng đang há**, hoặc phá giáp bụng trước. Lửa/nổ tốt nhất `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Brundle |

### 4.3 Naedocyte, Q'ronar và fauna khác

| Quái | HP base | Hành vi | Điểm yếu | Cách xử lý |
|---|---|---|---|---|
| **Naedocyte Shocker** | 5 | Sứa bay; chạm vào (tối đa 2 m) là **giật điện, làm chậm còn ×0,3 tốc độ trong 0,5 giây** | Không tra được | Vô hại lẻ, chết người theo đàn — wiki nói vai trò "tương đương Glyphid Swarmer" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Naedocyte_Shocker |
| **Naedocyte Breeder** | 1500 | **Không tấn công trực tiếp.** Bay lơ lửng **đẻ Roe theo cụm 3** (cách nhau ~4,6 giây, ~22 giây giữa các cụm); Roe nở thành Hatchling sau ~17 giây | Cơ quan miệng ×3 **nhưng chỉ lộ ra trong lúc đang đẻ** | Là quái bay → **đóng băng nó là rơi xuống vỡ tan chết ngay**. Hoặc bắn Roe trước khi nở `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Naedocyte_Breeder |
| **Q'ronar Shellback** | 450 | 2 chế độ: **cuộn tròn thành bi lăn húc** (dmg + hất văng), hoặc **đứng yên bắn 3 quả axit** có splash | Mắt và chóp đuôi ×2. Lúc cuộn: nổ 80%, **miễn nhiễm điện 100%**. **Lúc đi bộ: +50% dmg lửa, +70% dmg băng** | **Đợi nó bung ra đi bộ rồi dùng lửa/băng**. Không stun được, miễn pheromone `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Q%27ronar_Shellback |
| **Cave Leech** | Không tra được | **Nấp trên trần trong hang tối.** Khi có người tới gần, xúc tu thõng xuống trong **hình trụ bán kính 10 m**; **chạm vào là bốc người lên trần ngay lập tức** rồi các xúc tu nhỏ xé liên tục. Phát tiếng **rít** trước khi tấn công | Bắn vào **càng hoặc gốc con leech** để cắt đòn | **Chỉ spawn lúc sinh map, giết là không hồi sinh.** Damage **5 dmg/giây (Haz1 solo) → 68 dmg/giây (Haz5, 4 người)**. Nó **KHÔNG thả ra cho tới khi chết hoặc nạn nhân ngã**. Nghe tiếng rít + nhìn bầu phát quang sinh học `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Cave_Leech |
| **Spitball Infector** | 800 | **Bất động, mọc rễ xuống sàn.** "Acid Mortar": **phồng lên 1 giây làm telegraph** rồi bắn cầu vồng quả axit nổ bán kính 2 m | Các bầu trên thân ×2; **nó rụt bầu vào khi bắn** nên khó trúng | Nó không đuổi được → **giữ khoảng cách**. Bắn rơi đạn giữa không trung. Chỉ spawn lúc sinh map `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Spitball_Infector |
| **Korlok Tyrant-Weed** | 3000 | Boss thực vật, **không tự đánh**. Mọc **Korlok Sprout** bắn đạn kiểu Spitball, cộng **Healing Pod** hồi máu cho nó. Tim mở ra định kỳ để đẻ thêm | Đầu sprout ×2. **Tim mở ra KHÔNG phải weakpoint** (không ăn hệ số). Lõi có Unbreakable Armor khi đóng = bất tử | Giết sprout để ép tim mở, rồi dồn damage vào cửa sổ đó. Giết Healing Pod để chặn hồi máu. **Đốt/giật điện liên tục lên sprout reset animation, khóa không cho nó bắn** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Korlok_Tyrant-Weed |
| **Xynarch Charge-Sucker** | 1300/ký sinh | Ký sinh **bám vào BET-C và chiếm quyền điều khiển**; BET-C bị chiếm bắn Precision Burst (turret), Quick Bomb, **Bomb Shower** (bung shield + 8 quả bom vòng tròn). **BET-C hoàn toàn bất tử** | Không tra được. Kháng lửa 20%, nổ 80%; miễn On-Fire; miễn đóng băng **một phần** | **Bắn 2 con ký sinh, đừng bắn BET-C.** Điện làm chậm chúng kể cả khi ngủ. Giết cả hai → BET-C reboot ~8 giây rồi thành **đồng minh tạm thời** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/BET-C |
| **Loot Bug** | 100 (200 cho bản vàng) | **Hoàn toàn thụ động**, rất chậm, "không có khả năng tấn công lẫn tự vệ". HP **không đổi theo Hazard** | Không có giáp | Giết để lấy Gold + Nitra bên trong, khoáng văng ra với **hệ số ×1,5**. Hoặc **bấm [USE] để vuốt ve**, đôi khi nó nhả khoáng ra `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Loot_Bug |
| **Huuli Hoarder** | 1500 | Thụ động; **bỏ chạy** khi bị đánh hoặc bị tới gần, và **chui mất vĩnh viễn** sau vài giây không bị đánh hoặc khi cách ~10-20 m | Kháng điện 80%, miễn nhiễm trạng thái điện giật | Đuổi giết để nhận **50-60 cục khoáng (~110 đơn vị trung bình)**. Mỗi phát trúng làm nó loạng choạng, chặn không cho chui. **Nó phát sáng và kêu ré khi chạy** nên rất dễ thấy `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Huuli_Hoarder |

### 4.4 Rival Tech — họ robot

Đặc điểm chung: **"tất cả bọn này chết ngay lập tức nếu bị đốt cháy hoàn toàn, bất kể còn bao nhiêu máu."** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Creatures

| Quái | HP base | Hành vi | Điểm yếu | Cách xử lý |
|---|---|---|---|---|
| **Shredder** | 35 | Drone bay nhỏ, chỉ cận chiến: xoay tại chỗ rồi lao tới lao lui húc | Nổ −100%, điện −30%, **melee −200%** | Vô hại lẻ, chí mạng theo đàn: "cùng nhau chúng xé một dwarf ra trong vài giây". Nổ / điện / **cuốc** dọn nhanh nhất `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Rival_Shredder |
| **Patrol Bot** | 900 | Gunship bay: bắn loạt laser (thường kèm **lộn né**), bắn turret nhắm chính xác, và **phóng loạt 4 tên lửa tự dẫn** khi đang bay | **Đầu ×3.** Miễn độc. **Băng −100% và điện −100%** | Bắn đầu lúc nó bay. Băng **nhân ba** damage trực tiếp. **Nếu chết bằng damage thường, nó còn hack được trong 30 giây** → Hacking Device biến nó thành đồng minh. Tuyệt đối không dùng độc `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Rival_Patrol_Bot |
| **Prospector Drone** | 3000 | **Hoàn toàn không có vũ khí và cực nhanh — nó BỎ CHẠY.** Mỗi khi mất một đoạn máu nó bật **khiên bất tử màu cam 10-20 giây** rồi gọi Patrol Bot + Shredder tới | **Động cơ hai bên hông ×3** (300 HP), là hai cục cam sáng phía sau | Bung damage vào động cơ trước khi nó thoát; **nếu để nó chạy mất, gặp lại nó dump thêm một đợt viện binh nữa**. Băng −100% và nổ −100% là **kháng**, nên hai loại này vô dụng `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Rival_Prospector_Drone |
| **Nemesis** | 3500 | **Giả giọng dwarf để dụ người tới.** "Seize and Destroy": **túm dwarf trong 8,5 m bằng càng rồi bóp trong 8 giây**. Ngoài ra bắn tường plasma (6 m/s, tồn tại 7 giây), **đào xuyên địa hình bằng cầu lực trường**, và có đòn AoE điện damage cao nếu bạn trốn khỏi cú túm | **4 weakpoint ×2**: 2 chỗ dưới nách (250 giáp HP mỗi bên), tấm lưng (250), và **con mắt** | **Không bao giờ để nó vào trong 8,5 m**; cắt tầm nhìn bằng địa hình. Perk Heightened Senses thoát được cú túm. **Nó kích nổ phase bomb khi chết** — đừng để nó chết cạnh Drilldozer `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Rival_Nemesis |
| **Caretaker** (boss Industrial Sabotage) | Mắt **5500**; mỗi Intake **550**; Robotic Appendage **675** | Boss cố định 3 pha. P1/P2: phát **Plasma Barrier** ngang chặn đạn, **Area Shock** (làm chậm) khi bạn đứng trên bệ, gọi Patrol Bot + tay máy. P2/P3 thêm Sniper Turret, bầy Shredder, và **Phase Bomb dịch chuyển tới cạnh dwarf rồi nổ**. Tay máy đâm, bắn loạt laser, và **chui xuống để đổi vị trí** | **Mắt ×1 (KHÔNG có bonus)**; đầu tay máy ×1,5 là **weakpoint giả** (không kích hoạt bonus của vũ khí). Kháng nổ 45%, miễn độc 100%, **ăn mòn −160%** | Phá 4 intake để lộ mắt, rồi mài mắt qua 3 pha. **Ăn mòn (corrosive) là loại damage tốt nhất hẳn.** Rời khỏi bệ khi có Area Shock `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Rival_Caretaker |

### 4.5 Dreadnought — boss của Elimination

| Boss | HP base | Cơ chế vỏ / pha | Đòn đánh | Điểm yếu | Cách xử lý |
|---|---|---|---|---|---|
| **Glyphid Dreadnought** (bản gốc) | Thân **5000**, **vỏ bụng 1700** | **Phải phá vỡ vỏ quanh bụng trước, rồi mới chạm được vào máu chính.** Vỏ **mọc lại sau ~25-35 giây**, hoặc khi nó mất 30% máu mà vẫn trên 5%. **Damage thừa lúc phá vỡ bị chặn**, không tràn sang máu chính | **Trembling Stomp** (đòn hiệu: dựng cọc dung nham đâm xuyên dwarf, nổ bán kính **6,75 m**), **Fireball**, cắn/chém (bán kính 2,5 m), **Swarm Bladder** (nhả cụm pheromone sinh thêm quái), **Dig** (AoE tầm 5 m) | Bụng dưới vỏ, **×2**. Toàn thân còn lại là **giáp không phá được**. Kháng điện 50%, nổ 40% | Đánh cửa sổ 25-35 giây rồi rút, chờ vỡ vỏ lần sau `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Dreadnought |
| **Dreadnought Twins** (**Lacerator** + **Arbalest**) | **4500 mỗi con** | **Chia máu cho nhau**: khi chênh lệch máu ≥ 20% (và bắt buộc một lần giữa trận) cả hai **chui xuống đất, bất tử, hồi vỏ**; con khỏe mất 1/4 chênh lệch, con yếu được 3/4 → **tổng máu tăng lên** | **Lacerator** (cận chiến, nhanh hơn Dreadnought thường **50%**): Flame Breath, **Rock Wave** (hàng cọc đá lao tới), Slam, Burrow. **Arbalest** (tầm xa, thích bám tường): **Explosive Barrage** (mưa lửa lên đầu dwarf), **Fireball Fan** (5 cầu lửa xòe quạt, mở khóa sau lần chia máu đầu) | **Không có weakpoint thật**: lưng ×1, hàm dưới ×0,5. Thân + chân trước giáp 100 HP ×0, **mod Armor Breaking cũng không xuyên nổi**. Kháng lửa 30%, băng 15%, nổ 30%, điện 40%, ăn mòn 20% | **Giữ hai thanh máu ngang nhau** để tránh chia máu, rồi bung damage trong cửa sổ. **Khi bị đóng băng nhận 2,666× damage** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Dreadnought_Lacerator · https://deeprockgalactic.wiki.gg/wiki/Glyphid_Dreadnought_Arbalest |
| **Dreadnought Hiveguard** | **5000** (scale từ 1000 solo Haz1 tới **14.875** ở 4 người Haz5 EDD) | **Vòng lặp 3 bước**: (1) gọi **Glyphid Sentinel** ra, phải giết hết; (2) lộ **3 cục lồi** 200 HP, kháng 50% AoE, phải phá cả 3 — damage mới tràn vào máu chính; (3) giáp mông mở, lộ bụng. Rồi lặp lại | Chém/cắn AoE, **Fire Mortar** (cầu lửa cầu vồng), **Rock Burst** (bắn đá nổ tỏa tròn), đào xuyên địa hình, triệu Sentinel | **Lưng lộ ra ×1,5**. **Mặt trước thân và chân: damage ×0, tuyệt đối không xuyên** | Giết Sentinel → phá 3 cục lồi → dồn vào lưng. **Băng là kháng thấp nhất (20%)**. Không bao giờ đánh từ phía trước `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Dreadnought_Hiveguard |

### 4.6 Nhận xét thiết kế về bộ quái

`[ĐỀ XUẤT]` Đọc cả bảng thì thấy DRG phân vai quái theo **loại áp lực chúng tạo ra**, không theo "damage cao/thấp":

| Vai | Quái tiêu biểu | Áp lực nó tạo ra |
|---|---|---|
| **Rác lấp không gian** | Swarmer, Shocker, Shredder, Spawn | Ép người chơi phải có AoE, chiếm chỗ, che tầm nhìn |
| **Sức ép chính** | Grunt | Nguồn damage nền, ép lùi |
| **Ép ĐỔI CHỖ ĐỨNG** | Web Spitter, Acid Spitter, Septic Spreader, Mactera | Bắn từ xa/trên cao → không cắm rễ một chỗ được |
| **Ép ĐỔI GÓC NHÌN** | Praetorian, Oppressor, Grunt Guard, Hiveguard | Mặt trước bất khả xâm phạm → bắt buộc vòng ra sau |
| **Phạt sai lầm không gian** | Exploder, Bulk Detonator, Cave Leech, Stingtail, Grabber | Đứng sai chỗ / đứng chụm là chết ngay |
| **Ưu tiên mục tiêu** | Warden (buff), Brood Nexus (đẻ), Naedocyte Breeder (đẻ), Healing Pod | Bắt người chơi phải chọn mục tiêu đúng, không bắn bừa |
| **Đảo lộn nhịp** | Stalker (tàng hình), Menace (chui), Prospector (bỏ chạy), Nemesis (giả giọng) | Phá thói quen, tạo bất ngờ |

Ba cơ chế lặp đi lặp lại trong toàn bộ bestiary: (1) **weakpoint có hệ số ×2/×3 nằm ở chỗ khó bắn**, (2) **giáp mặt trước ×0 buộc phải di chuyển**, (3) **đòn cuối/vụ nổ khi chết** khiến "giết được rồi" vẫn chưa phải là an toàn.

---

## 5. Hazard môi trường

### 5.0 Mọi số damage môi trường đều nhân theo Hazard

| Haz 1 | Haz 2 | Haz 3 | Haz 4 | Haz 5 | DD 3.5 | DD 4.5 | DD 5.5 |
|---|---|---|---|---|---|---|---|
| 0,75 | 1,00 | 1,00 | 1,33 | **2,00** | 1,15 | 1,66 | 2,20 |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Difficulty_Scaling

### 5.1 Rơi cao (fall damage) — hazard phổ biến nhất

- **Chỉ ăn damage khi rơi nhanh hơn 10 m/s.**
- Công thức: **D = (v − 10) × 17,5 × (1 − R)**; trên bề mặt mềm: **D = (v − 15) × 17,5 × (1 − R)**.
- Bề mặt "mềm" nâng ngưỡng lên 15 m/s: **Plastcrete MkII platform (súng platform của Engineer)**, Deep Snow (Glacial Strata), Sticky Goo (Fungus Bogs), địa hình Rockpox.
- Ví dụ: rơi **6 m → 14,7 dmg**; **8 m → 44,1**; **10 m → 70**; **20 m → 171,5** (dwarf chỉ có 110 HP).
- Kháng (cộng dồn): Scout Armor Rig T3.A **33%**, Grappling Hook T4.A **25%**, Zipline T3.A **25%**, bia Tunnel Rat **60%**.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Fall_Damage

`[ĐỀ XUẤT]` Điểm hay: hang DRG dọc nhiều hơn ngang, và **cái giết bạn thường là trọng lực chứ không phải quái**. Toàn bộ 4 công cụ traversal (platform, zipline, grapple, drill) tồn tại để trả lời một câu hỏi duy nhất: "làm sao xuống/lên chỗ kia mà không chết".

### 5.2 Hazard theo biome

| Biome | Hazard chính | Số liệu |
|---|---|---|
| **Crystalline Caverns** | **Electrocrystal** | HP 350, dmg 4, **làm chậm còn ×0,3**; phóng điện nối giữa các tinh thể gần nhau. Còn có **mưa** làm giảm độ sáng đèn nhưng cho miễn nhiễm damage lửa |
| **Salt Pits** | **Unstable Crystal** (thạch nhũ rơi) | Trúng trực tiếp 20 Melee; **nổ vùng 1000 Kinetic, bán kính 1,5 m**, armor breaking 200%, friendly fire chỉ 4%. Kèm **Unstable Platform** nứt dần rồi vỡ |
| **Fungus Bogs** | **Poison Spores Fungus** | HP 50, dmg 3 (độc DoT); nhả hơi xanh khi tới gần **và khi bị phá**; **hơi này bắt lửa**. **Sticky Goo** làm chậm còn **×0,3** (nhưng giảm fall damage). **Steam Geyser** hất người bay; phá nó thì nổ 200 dmg bán kính 3 m |
| **Radioactive Exclusion Zone** | **Volatile Uranium** | Hardness 1, **6 Radiation/tick** (0,5-1s/tick); tắt được bằng cách đào bỏ lõi phát sáng |
| **Dense Biozone** | Thực vật ăn thịt | **Exploding Plant** HP 30/30/20 → nổ **150/200/400**, bán kính **3/4,5/6 m**, friendly fire 30%, **nổ dây chuyền**. **Trapatactus** HP 400, dmg 60, **stun 100% trong 4 giây**. **Cave Urchin** 4-7 dmg/tick. **Ejector Cactus** HP 150, 30 dmg — và **kích nổ được Exploding Plant** |
| **Glacial Strata** | **Bão tuyết** | Bão: **−1°/giây tới −100°**, dwarf ×0,8 tốc độ; bão đầu sau 3-50 giây, sau đó **mỗi 5-15 phút**. **Cold Vent −12°/giây**. **Cryo Bulb** HP 40, 80 Cold, bán kính 4 m. **Unstable Ice** 1000 Kinetic bán kính 2 m. **Smooth Ice ×1,5 tốc trượt**. **Crevasse Crack** nứt là rơi xuống khe sâu. **Oasis** hồi +12°/giây (điểm cứu). **Đóng băng ở −100°** → bất động, chuyển góc nhìn thứ 3, đồng đội phải **cuốc cho tan băng** |
| **Hollow Bough** | Gai và dây leo | **Stabber Vine** HP 300, dmg **12,5 (Haz1 solo) → 170 (Haz5 4 người)**, mọc cụm 3, **bầu vàng ×3**, phá gốc là chết cả cụm. **Deeptora Bough Wasp Nest** HP 400, đốt **1,5 → 20,4 dmg/tick**, ong miễn nhiễm băng + điện, **tổ nhận GẤP ĐÔI damage lửa**. Creeper Vine / Bloated Vine / Thorn Pot / Goo Sack: có gây damage nhưng **không tra được** con số |
| **Magma Core** | Dung nham | **Hot Rock** 10 Fire+Heat/tick — **sinh ra cả tự nhiên LẪN từ chính vụ nổ của người chơi**; quái tự né nó. **Lava Geyser** 10/tick, **+20°/giây tới 100°**; phá nó thì **nổ 500 Explosive bán kính 4 m**. Exploding Plant như Dense Biozone. **Quake** làm dwarf ×0,5 tốc trong 9 giây và nứt đất |
| **Sandblasted Corridors** | **Bão cát** | Dwarf ×0,8 tốc, **tầm nhìn giảm mạnh**; ~15 giây sương mù dâng rồi ~30 giây bão. **Wind Tunnel** thổi bay dwarf rất xa, **có thể chết**. **Explosive Spore** nổ rồi **mọc lại sau vài giây** |
| **Azure Weald** | **Không có hazard gây damage nào** | Chỉ có buff: **Glowing Stone Pillar** cho **giảm 50% damage trong 15 giây** sau khi rời khu, **Magic Hole** cho trọng lực thấp + **30% tốc độ** trong 15 giây |
| **Ossuary Depths** (Season 06, ra 29/01/2026) | Chỉ có mạng nhện | Địa hình xương: bone pile hardness 1, xương hóa thạch 2 |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Biome_Features ·
https://deeprockgalactic.wiki.gg/wiki/Hoxxes ·
https://deeprockgalactic.wiki.gg/wiki/Glacial_Strata ·
https://deeprockgalactic.wiki.gg/wiki/Magma_Core ·
https://deeprockgalactic.wiki.gg/wiki/Stabber_Vine ·
https://deeprockgalactic.wiki.gg/wiki/Deeptora_Bough_Wasp_Nest ·
https://deeprockgalactic.wiki.gg/wiki/Sandblasted_Corridors ·
https://deeprockgalactic.wiki.gg/wiki/Azure_Weald ·
https://deeprockgalactic.wiki.gg/wiki/Ossuary_Depths ·
https://deeprockgalactic.wiki.gg/wiki/Biomes

### 5.3 Hazard cố định rải khắp map (mọi biome)

| Thứ | Số liệu |
|---|---|
| **Cave Leech** | Nấp trần, xúc tu quét trong **hình trụ bán kính 10 m**, chạm là bốc lên. **5 dmg/giây (Haz1 solo) → 68 dmg/giây (Haz5 4 người)**. Chỉ spawn lúc sinh map, giết là hết. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Cave_Leech |
| **Spitball Infector** | HP 800 → 1200 (Haz5/4p). Mortar **85 dmg**, bán kính 2 m; **bắn rơi đạn giữa không trung được** (bán kính đạn 0,35 m). Thức dậy khi có người vào **20 m** hoặc bị bắn. 2 bầu ×2 `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Spitball_Infector |
| **Barrage Infector** | HP 1200 → 1920. Bắn **9 quả**; trúng trực tiếp 17 dmg (50% nổ + 50% độc); nổ đất **85 dmg** bán kính 3,5 m. **Sau mỗi loạt bắn nó phơi mình vài giây** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Barrage_Infector |
| **Korlok Tyrant-Weed** | Boss cây, xem mục 4.3 |
| **Ổ nhện (Spider Web)** | HP 1, **làm chậm còn ×0,5**, chặn tầm nhìn; **chỉ lửa mới đốt được** (Dense Biozone: tồn tại 8 giây, miễn nhiễm mọi thứ trừ lửa) `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Biome_Features |
| **Glyphid Eggs (ổ trứng trang trí)** | HP 20; vỡ ra Swarmer, **có xác suất lây sang trứng bên cạnh** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Biome_Features |

### 5.4 Trạng thái (status) từ môi trường

| Trạng thái | Số liệu |
|---|---|
| On Fire (lên người chơi) | **2,5 Fire/tick**, tick 0,3-0,5s (quái ăn 6/tick) |
| Bốc cháy khi nhiệt đạt | **100°** (nguồn dung nham đẩy +20°/giây) |
| Đóng băng | **−100°** → dwarf bất động, **KHÔNG ăn thêm damage** (khác quái) |
| Poison | ví dụ 2,5 Poison/tick, tick 0,5-1,0s, kéo dài 2s |
| Radiation | **6/tick**, tick 0,5-1,0s |
| Electrocution | **3-4,5 Electric/tick**, tick 0,2-0,25s, kéo dài 3-6s, **làm chậm 80% (×0,2)** |
| Rockpox Infection | Dâng như thanh nhiệt độ; đầy thì bất động như đóng băng + DoT. Số liệu **không tra được** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Status_Effects · https://deeprockgalactic.wiki.gg/wiki/Lithophage

### 5.5 Warnings (cảnh báo) — chọn khi nhận mission, đổi lấy Hazard Bonus

Warning là **mutator xấu tự nguyện**: cho thêm % thưởng, hiện ngay trên bảng chọn mission.

| Warning | +Bonus | Hiệu ứng |
|---|---|---|
| **Cave Leech Cluster** | +15% | Cave Leech nhiều bất thường và **mọc thành cụm**. Cấm ở Point Extraction, Industrial Sabotage |
| **Parasites** | +15% | Quái chết thì bung **Carnivorous Larvae**; quái to nhả **3 con** |
| **Regenerative Bugs** | +15% | Quái **hồi 5% máu tối đa mỗi giây** sau 3 giây không bị đánh; đánh trúng là reset |
| **Exploder Infestation** | +20% | **Dòng Exploder gần như liên tục**, chạy song song và độc lập với hệ swarm bình thường |
| **Low Oxygen** | +20% | Bình O₂ **tụt 1,5%/giây** (đầy bình ≈ 1 phút); hết thì **10 HP/giây, KHÔNG chặn được bằng shield**. Nạp lại **10%/giây** cạnh Drop Pod / Resupply Pod / Mine Head / M.U.L.E. Hồi sinh cho **42%** O₂. Cấm ở Salvage Operation |
| **Mactera Plague** | +20% | **Gần như toàn quái bay**, quái đất hiếm khi xuất hiện |
| **Swarmageddon** | +20% | Bầy Swarmer nhỏ nổ liên tục suốt màn |
| **Ebonite Outbreak** | +20% | Ebonite Grunt/Praetorian xuất hiện định kỳ — **Ebonite CHỈ nhận damage từ đòn cận chiến và đóng băng**. M.U.L.E. phát bình giảm cooldown Power Attack. Cấm ở Salvage / Point Extraction / On-site Refining |
| **Pit Jaw Colony** | +20% | Ossiran Pit Jaw phục kích dưới đất, tóm được thì gây damage liên tục |
| **Scrab Nesting Grounds** | +20% | Ossiran Scrab spawn thành cụm nhỏ liên tục và từ các ổ rải rác |
| **Lethal Enemies** | +25% | **Mọi đòn cận chiến của quái GẤP ĐÔI damage** (nhảy, cắn, chém, đào). Đòn bắn và AoE không đổi |
| **Haunted Cave** | +30% | **Một Bulk Detonator ma BẤT TỬ đuổi theo cả màn**. Chỉ làm chậm được (điện giật) |
| **Rival Presence** | +30% | Patrol Bot, Shredder, Nemesis; Turret Controller thả Burst/Sniper/Repulsion turret. Cấm ở Escort Duty, Industrial Sabotage |
| **Elite Threat** | +30% | Biến thể **elite viền hào quang đỏ**: kháng damage cao hơn, nhanh hơn |
| **Shield Disruption** | +30% | **Shield cá nhân tắt vĩnh viễn**; bù lại dwarf được **giảm 30% damage**. Shield Generator vẫn dùng được nhưng không nạp lại shield cá nhân |
| **Duck and Cover** | +30% | **Quái tầm xa mọi loại tăng vọt** |
| **Core Corruption** | +40% | Một **Core Stone** đẻ Corespawn không ngừng cho tới khi bị phá |
| **Lithophage Outbreak** | **+50%** | Hang nhiễm Rockpox, phải dọn Contagion Spike bằng **LithoFoamer + LithoVac**. **Không ghép được với warning nào khác** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mutators

### 5.6 Anomalies — mutator "vui", không đổi Hazard Bonus

| Anomaly | Hiệu ứng |
|---|---|
| **Gold Rush** | Mạch vàng **dài gấp đôi** |
| **Golden Bugs** | **Mỗi con quái chết rơi ra 1 đơn vị Gold** |
| **Low Gravity** | Trọng lực giảm **~2,4 lần** — nhảy cao hơn, rơi an toàn hơn |
| **Critical Weakness** | Bắn weakpoint gây **gấp 5 lần** damage (nhân chồng). Không áp dụng cho quái không có weakpoint và Dreadnought |
| **Mineral Mania** | Khoáng crafting của biome dày đặc hơn |
| **Rich Atmosphere** | **+50% tốc độ di chuyển**, chạy xuyên hazard được, giọng dwarf **cao lên 50%** |
| **Double XP** | XP gấp đôi |
| **Volatile Guts** | **Mọi quái nổ khi chết**, quái to nổ mạnh hơn. Không áp dụng cho quái tí hon và quái cố định |
| **Blood Sugar** | Dwarf **mất 6 HP/giây**, nhưng **mỗi quái chết rơi 10 Red Sugar**. Cấm ở Industrial Sabotage |
| **Secret Secondary** | Thêm **1 nhiệm vụ phụ nữa**, tính đủ giá trị |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mutators

`[ĐỀ XUẤT]` Cấu trúc mutator này rất đáng chép: **hai nhóm tách bạch** — warning (xấu, có giá bằng % thưởng, người chơi tự chọn khi nhận mission) và anomaly (đổi vị, không có giá). Người chơi tự định giá rủi ro trước khi vào màn, và bảng chọn mission tự nó thành một minigame.

### 5.7 Ba đính chính so với giả định ban đầu

1. **Ebonite KHÔNG phải địa hình bọc giáp** — nó là **mutation giáp trên QUÁI** (Ebonite Grunt / Praetorian), và Ebonite **chỉ nhận damage từ cận chiến và đóng băng**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Ebonite
2. **Cave Vine không phải hazard** — là sinh vật thụ động vô hại, HP 100, vuốt ve được, "không thể gây damage cho người chơi dù trực tiếp hay gián tiếp". `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Cave_Vine
3. **Sludge/Corrosion không phải hazard môi trường** — là damage type của **Corrosive Sludge Pump** (vũ khí Driller): 8 Corrosive/tick, làm chậm 35%. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Status_Effects

Ngoài ra: **Hollomite là tài nguyên** (nhiệm vụ phụ) chứ không phải gai Hollow Bough; **Azure Weald hoàn toàn không có hazard gây damage**.

---

## 6. Tài nguyên đào được

### 6.0 Luật túi đồ

**Mỗi dwarf mang tối đa 40 đơn vị MỖI loại tài nguyên.** Đào quá thì khoáng **rơi ra thành cục nhỏ nằm dưới đất**, nhặt lại được khi có chỗ trống. Nộp tại **M.U.L.E., Drop Pod, hoặc Mine Head**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Pickaxe

Nâng sức chứa: armor mod **"Bigger Mineral Bag" +5** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/%22Mole%22_Armor_Rig · perk **Deep Pockets I/II/III = +5/+10/+15** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Deep_Pockets. Tổng tối đa: **không tra được** (wiki không cộng lại).

**Vật nặng (heavy object)** thì khác hẳn: phải **vác bằng hai tay**, **chậm 25%**, và **chỉ ném được flare hoặc bám zipline** — không bắn được. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Gold

### 6.1 Tài nguyên mục tiêu / tiêu hao

| Tài nguyên | Dùng để làm gì | Sức chứa | Credits | XP |
|---|---|---|---|---|
| **Morkite** | Mục tiêu chính Mining Expedition (**200-400/màn**). Công dụng thật là "bí mật của ban lãnh đạo" | 40 | không tra được | **1**/đơn vị |
| **Nitra** | **Gọi Resupply Pod (80/pod)** — đây là tài nguyên chiến thuật duy nhất | 40 | **không có thưởng cho Nitra thừa** | **2**/đơn vị |
| **Gold** | "chỉ để cho thêm credits và XP khi kết màn" — thuần điểm | 40 | **2**/đơn vị | **2**/đơn vị |
| **Compressed Gold** | Vật nặng chứa **150-250 đơn vị vàng** | Vật nặng | **300-500** | **300-500** |
| **Red Sugar** | **Hồi máu NGAY khi cuốc: 1-60 HP mỗi nhát, ~60 HP mỗi mạch** (78 HP với perk Sweet Tooth max). **Không bao giờ vào túi, không nộp** | — | — | — |
| **Alien Egg** | Mục tiêu chính Egg Hunt | Vật nặng | không tra được | **30**/quả |
| **Aquarq** | Mục tiêu chính Point Extraction (7 hoặc 10) | Vật nặng | không tra được | **25**/đơn vị |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Morkite ·
https://deeprockgalactic.wiki.gg/wiki/Nitra ·
https://deeprockgalactic.wiki.gg/wiki/Gold ·
https://deeprockgalactic.wiki.gg/wiki/Red_Sugar ·
https://deeprockgalactic.wiki.gg/wiki/Alien_Egg ·
https://deeprockgalactic.wiki.gg/wiki/Aquarq

`[ĐỀ XUẤT]` **Red Sugar là thiết kế xuất sắc nhất trong nhóm này**: nó biến "đào khoáng" thành "hồi máu", tức là **cùng một động tác vừa là kinh tế vừa là sinh tồn**. Người chơi hết máu giữa swarm sẽ đi tìm cục đỏ trên tường — vẫn là đào, vẫn đúng fantasy thợ mỏ.

### 6.2 Khoáng crafting (6 loại, kinh tế giống hệt nhau)

Tất cả: **mua 150 / bán 50 credits, 2 XP/đơn vị**, sức chứa 40. Dùng để **nâng cấp trang bị, mod vũ khí, thăng cấp dwarf, forge Overclock, mua đồ trang trí**.

| Khoáng | Nhiều ở | Hiếm ở |
|---|---|---|
| Bismor | Dense Biozone, Ossuary Depths | Crystalline Caverns, Salt Pits, Hollow Bough |
| Croppa | Fungus Bogs, Azure Weald | Magma Core |
| Enor Pearl | Salt Pits, Sandblasted Corridors | Radioactive Exclusion Zone |
| Jadiz | Crystalline Caverns, Hollow Bough | Fungus Bogs |
| Magnite | Glacial Strata, Magma Core | Sandblasted Corridors, Ossuary Depths |
| Umanite | Radioactive Exclusion Zone | Dense Biozone, Glacial Strata, Azure Weald |

Chi tiết đáng chú ý: cụm **Enor Pearl cho 7-18 đơn vị và TỰ PHÁT SÁNG soi hang cho tới khi nộp**; cụm **Jadiz cho 10-18 đơn vị**.

**Phazyonite** — tiền tệ thay thế: **1 đơn vị = 200 credits, hoặc = 2 khoáng ở Accessory Shop**; tỉ lệ ra **1/7 màn**.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Bismor ·
https://deeprockgalactic.wiki.gg/wiki/Croppa ·
https://deeprockgalactic.wiki.gg/wiki/Enor_Pearl ·
https://deeprockgalactic.wiki.gg/wiki/Jadiz ·
https://deeprockgalactic.wiki.gg/wiki/Magnite ·
https://deeprockgalactic.wiki.gg/wiki/Umanite ·
https://deeprockgalactic.wiki.gg/wiki/Phazyonite

### 6.3 Vật nặng hiếm (phần thưởng bất ngờ)

| Thứ | Giá trị | Tỉ lệ ra |
|---|---|---|
| **Bittergem** | "Công dụng duy nhất là cho một đống Credits" — **1000-1500 credits/viên, 0 XP** | **1/21 màn** |
| **Error Cube** (`ERR://23¤Y%/`) | Không có công dụng gì, thuần easter egg. **4.000 XP tĩnh, không bị ảnh hưởng bởi Hazard Bonus** (⚠️ trang Resources ghi 2000 — hai trang wiki mâu thuẫn nhau) | **1/26 (3,84%) mỗi màn** |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Bittergem · https://deeprockgalactic.wiki.gg/wiki/Error_Cube · https://deeprockgalactic.wiki.gg/wiki/Resources

### 6.4 Tài nguyên nhiệm vụ phụ

| Thứ | Chỉ tiêu | Credits | XP | Ghi chú |
|---|---|---|---|---|
| Alien Fossil | 10 | 200 | 700 | |
| Apoca Bloom | 15 | 200 | 700 | Nhặt bằng [USE], không cần cuốc |
| Boolo Cap | 20 | 200 | 700 | |
| Ebonut | 14 | 200 | 700 | Vỏ cần **3 nhát cuốc** (2 nhát với bia Skull Crusher) |
| Gunk Seed | 12 | 200 | 700 | **Phải bắn túi trên trần cho rơi xuống trước**; là vật nặng |
| Bha Barnacle | 16 | 200 | 700 | **Là SINH VẬT phải giết**, HP 25, miễn nhiễm mọi status |
| Hollomite | 35 | 250 | 650 | |
| Dystrum | 100 | 250 | 650 | Mọi biome **trừ Azure Weald**; rất khó thấy ở Glacial Strata |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Alien_Fossil ·
https://deeprockgalactic.wiki.gg/wiki/Apoca_Bloom ·
https://deeprockgalactic.wiki.gg/wiki/Boolo_Cap ·
https://deeprockgalactic.wiki.gg/wiki/Ebonut ·
https://deeprockgalactic.wiki.gg/wiki/Gunk_Seed ·
https://deeprockgalactic.wiki.gg/wiki/Bha_Barnacle ·
https://deeprockgalactic.wiki.gg/wiki/Hollomite ·
https://deeprockgalactic.wiki.gg/wiki/Dystrum

### 6.5 Nguyên liệu ủ bia (Malt Star, Starch Nut, Yeast Cone, Barley Bulb)

Cả 4: **XP 0, hardness 0, rarity 2**, ra ở mọi biome, **không bị ảnh hưởng bởi Hazard Bonus**. Dùng để **pha bia và mua Beer License ở Abyss Bar** — bia cho buff nhỏ ở màn kế (ví dụ Tunnel Rat giảm 60% fall damage, Skull Crusher Ale đào nhanh hơn, Rocky Mountain giảm 2 độ cứng đá). Credits: không tra được.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Malt_Star · https://deeprockgalactic.wiki.gg/wiki/Starch_Nut · https://deeprockgalactic.wiki.gg/wiki/Yeast_Cone · https://deeprockgalactic.wiki.gg/wiki/Barley_Bulb · https://deeprockgalactic.wiki.gg/wiki/Terrain

### 6.6 Sơ đồ chức năng — tại sao có nhiều loại đến thế

`[ĐỀ XUẤT]` Gom lại thì 20+ loại tài nguyên chỉ phục vụ **5 vòng lặp khác nhau**:

| Vòng lặp | Tài nguyên | Nhịp |
|---|---|---|
| **Trong màn — sinh tồn** | Nitra (gọi tiếp tế), Red Sugar (hồi máu) | Giây/phút |
| **Trong màn — mục tiêu** | Morkite, Egg, Aquarq, Resinite, Morkite Seed | Cả màn |
| **Trong màn — thưởng thêm** | Gold, Bittergem, Compressed Gold, Error Cube, Phazyonite | Cơ hội bắt gặp |
| **Giữa các màn — build** | 6 khoáng crafting | Nhiều giờ |
| **Giữa các màn — vị** | 4 nguyên liệu bia | Trang trí/xã giao |

Điểm quan trọng: **chỉ có Nitra và Red Sugar ảnh hưởng tới việc bạn sống hay chết trong màn**. Tất cả phần còn lại là điểm số. Nhờ vậy mà người chơi mới **có quyền chọn tham hay không tham** — đó chính là nguồn căng thẳng.

---

## 7. Bốn class và bộ kit

### 7.1 Bảng tổng hợp

| | **Driller** | **Engineer** | **Gunner** | **Scout** |
|---|---|---|---|---|
| **Steam mô tả** | "The living bulldozer" | "The defensive support specialist" | "The heavy weapons guy" | "The nimble wayfinder" |
| **Vũ khí chính** | CRSPR Flamethrower · Cryo Cannon · Corrosive Sludge Pump | "Warthog" Auto 210 (shotgun) · "Stubby" Voltaic SMG · LOK-1 Smart Rifle | "Lead Storm" Powered Minigun · "Thunderhead" Heavy Autocannon · "Hurricane" Guided Rocket System | Deepcore GK2 · M1000 Classic · DRAK-25 Plasma Carbine |
| **Vũ khí phụ** | Subata 120 · Experimental Plasma Charger · Colette Wave Cooker | Deepcore 40mm PGL · Breach Cutter · Shard Diffractor | "Bulldog" Heavy Revolver · BRT7 Burst Fire Gun · ArmsKore Coil Gun | Jury-Rigged Boomstick · Zhukov NUK17 · Nishanka Boltshark X-80 |
| **Traversal** | **Reinforced Power Drills** — khoan xuyên đá tạo đường hầm (**không đào được khoáng**) | **Platform Gun** — bắn bệ đứng lên mọi bề mặt | **Zipline Launcher** — căng dây vượt hố/dốc | **Grappling Hook** — tầm **20 m**, cooldown **4 giây** |
| **Support** | **Satchel Charge** — bom đặt "để dọn đá, dọn bọ, hoặc cả hai" | **LMG Gun Platform** — sentry turret tự bắn | **Shield Generator** | **Flare Gun** — flare dính tường |
| **Throwable (chọn 1)** | Impact Axe (**nhặt lại được**) · High Explosive Grenade · Neurotoxin Grenade (mây độc, **bắt lửa thì nổ**) · Springloaded Ripper (lưỡi lướt trên mặt đất) | L.U.R.E. (**dwarf hologram giả để nhử quái**) · Plasma Burster (**4 vụ nổ/quả**) · Proximity Mine (**chỉ nổ với quái cỡ trung trở lên**) · Shredder Swarm (**thả bầy drone bạn**) | Sticky Grenade (dính + **gây fear mạnh**) · Incendiary Grenade · Cluster Grenade · Tactical Leadbuster (**xối đạn vào khu vực nó rơi**) | Inhibitor-Field Generator (**làm chậm + tăng damage quái nhận**) · Cryo Grenade (**đóng băng tức thì**) · Pheromone Canister (**khiến quái khác quay ra đánh con bị dính**) · Voltaic Stun Sweeper (**nảy từ con này sang con khác, stun + giật điện**) |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Driller ·
https://deeprockgalactic.wiki.gg/wiki/Engineer ·
https://deeprockgalactic.wiki.gg/wiki/Gunner ·
https://deeprockgalactic.wiki.gg/wiki/Scout ·
https://deeprockgalactic.wiki.gg/wiki/Grappling_Hook ·
https://store.steampowered.com/app/548430/Deep_Rock_Galactic/

### 7.2 Số liệu công cụ

**Shield Generator (Gunner)** — bán kính **2,8 m**, tồn tại **6 giây**, hồi lại **12,5 giây**, mang **4 lần dùng**, hồi shield **10/giây**, **giảm 50% damage** bên trong, **gây fear cho quái khi đặt xuống**.
- **Chặn được**: hầu hết đạn bắn (Mactera Spawn, Acid Spitter); đa số quái cận chiến không vào được.
- **KHÔNG chặn được**: Praetorian Acid Spray, Bulk Detonator Hellfire, Oppressor Rage Quake, Q'ronar Rolling Strike, Parasite.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Shield_Generator

**Grappling Hook (Scout)** — tầm **20 m**, cooldown **4 giây**, tốc độ tối đa **1500**. Có wind-up ngắn trước khi kéo; giữ nút thì treo lơ lửng, thả nút thì rơi và bắt đầu cooldown. **Bắn xuống đất là triệt tiêu hoàn toàn fall damage.** Mod: giảm cooldown tới **−1,5s**, tăng tầm tới **+10 m**, giảm wind-up 0,25s, hoặc **+50% tốc chạy trong 2,5 giây sau khi dùng**.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Grappling_Hook

**Flare Gun (Scout)** — mặc định **75 giây/flare**, băng **3 viên**, tổng đạn **12**, nạp **2,4 giây**. Mod T1 chọn +3 đạn hoặc +15 giây; T2 chọn tốc bắn hoặc +1 băng; T3 auto-reload. Flare này **dính vào tường** và **sáng hơn, lâu hơn** flare thường.

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Flare_Gun

### 7.3 Cái gì làm mỗi class ĐỘC NHẤT về cảm giác chơi

`[ĐỀ XUẤT]` Điểm mấu chốt: **không class nào chỉ khác nhau ở "cây damage"**. Mỗi class thay đổi **cách bạn tương tác với KHÔNG GIAN**, và đó mới là thứ tạo cảm giác.

| Class | Động từ độc quyền | Cảm giác chơi | Bằng chứng cơ chế |
|---|---|---|---|
| **Driller** | **XÓA địa hình** | Người duy nhất **viết lại bản đồ**. Không đi vòng — khoan thẳng. Tạo hành lang tử thần, đào phòng thủ, mở lối tắt về Drop Pod | Power Drills khoan xuyên đá nhưng **cố tình KHÔNG đào được khoáng** — đây là ràng buộc thiết kế để nó không thay thế cuốc |
| **Engineer** | **THÊM địa hình + ủy quyền damage** | Người duy nhất **dựng thứ tồn tại sau khi mình bỏ đi**. Bệ Plastcrete cho cả đội đứng, turret bắn hộ khi đang bận | Platform Gun + LMG Gun Platform. Platform MkII còn **nâng ngưỡng fall damage lên 15 m/s** — nó vừa là sàn vừa là lưới an toàn |
| **Gunner** | **NEO một vùng đất** | Người duy nhất **biến một điểm thành pháo đài**. Shield là ốc đảo 2,8 m trong 6 giây; zipline là con đường cố định qua vực | Shield Generator: giảm 50% dmg + hồi shield 10/giây + fear quái, nhưng **chỉ 6 giây và 4 lần** — buộc phải chọn đúng thời khắc |
| **Scout** | **ĐI TỚI + NHÌN THẤY** | Người duy nhất **tách khỏi đội** một cách hợp lệ. Bắn grapple lên trần lấy khoáng cao, bắn flare mở ra cả căn phòng | Grapple 20 m / cd 4 giây + Flare Gun 75 giây. Đổi lại: máu giấy, đi một mình dễ chết — **rủi ro chính là cái giá của tốc độ** |

Ba quy tắc thiết kế rút ra:
1. **Mỗi class có đúng MỘT công cụ traversal, và bốn cái đó không thay thế được nhau** (đào / dựng / căng dây / bám). Cả đội cộng lại mới xử lý được mọi loại địa hình → hợp tác là bắt buộc, không phải tùy chọn.
2. **Throwable không phải "grenade khác skin"** mà là **4 động từ khác nhau**: Engineer nhử, Scout debuff/khống chế, Gunner gây fear/phủ lửa, Driller dọn sạch. Đọc 16 throwable của 4 class là thấy rõ ý đồ phân vai.
3. **Vũ khí chính lo damage, vũ khí phụ lo TÌNH HUỐNG** (Breach Cutter xuyên hàng, Coil Gun xuyên giáp, Boomstick đẩy lùi, Wave Cooker kích nổ trạng thái).

---

## 8. Resupply Pod

| Thông số | Giá trị |
|---|---|
| **Giá** | **80 Nitra** trong kho chung của đội |
| **Số lần dùng** | **4 giá đỡ (rack)** bung ra hai bên, mỗi cái dùng được **1 lần** |
| **Mỗi lần hồi** | **50% đạn (làm tròn lên)** + **50% máu tối đa**; wiki trang Nitra ghi rõ là **đạn, nhiên liệu, lựu đạn và máu** |
| **Thời gian tương tác** | **4 giây** giữ nút; **thả nút hoặc di chuyển là hủy** |
| **Damage khi rơi** | **1000 typeless damage, bán kính 1,5 m** — dùng làm vũ khí đè quái được |
| **Giới hạn/màn** | Không giới hạn số pod, nhưng **có delay ngắn trước khi gọi được pod kế** |
| **Không gọi được khi** | Địa hình không ổn định, quá gần pod cũ, hoặc chưa đủ Nitra |
| **Ở màn Low Oxygen** | Pod còn **nạp lại oxy** |
| **Thời gian pod hạ xuống** | không tra được |
| **Nitra thừa** | **Không có thưởng gì lúc kết màn** — "không có khác biệt giữa Nitra đã dùng và chưa dùng" |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Resupply_Pod · https://deeprockgalactic.wiki.gg/wiki/Nitra

### Chiến thuật quanh Resupply

`[ĐỀ XUẤT]` Resupply Pod là **cơ chế trung tâm âm thầm** của DRG, và nó hay vì mấy lý do:

- **Nitra là tài nguyên DUY NHẤT có giá trị chiến thuật trong màn.** Mọi khoáng khác chỉ là điểm. Nên khi thấy mạch Nitra, cả đội dừng lại đào — đó là **quyết định có sức nặng**, không phải phản xạ nhặt đồ.
- **80 Nitra = 4 lượt hồi, chia cho 4 người.** Nếu một người dùng 2 rack thì cả đội thiếu. Nó tạo ra **thương lượng xã hội** không cần luật nào ép buộc: "ai đang thấp máu nhất?".
- **Pod đứng yên một chỗ** → nó biến thành **cột mốc phòng thủ**. Đội thường gọi pod trước khi kích swarm và lùi về đó khi cần.
- **Hồi 50% chứ không phải 100%** → không xóa hết hậu quả, chỉ giảm bớt. Chuỗi sai lầm vẫn dẫn tới thua.
- **1000 damage bán kính 1,5 m khi rơi** → gọi pod đúng lúc cũng là một đòn tấn công. Ngay cả nút "hồi phục" cũng có mặt tấn công.
- **Gọi ngay chỗ đang đứng, không phải ở base** → cứu trợ có **địa lý**. Vị trí gọi pod quan trọng ngang việc có gọi hay không.

---

## 9. Đèn và tầm nhìn

### 9.1 Ánh sáng là trụ cột thiết kế, không phải hiệu ứng

Ghost Ship Games nói rõ trong các phỏng vấn: **bóng tối và việc người chơi tự mang ánh sáng vào hang là ý tưởng có ngay từ concept đầu tiên**, không phải thêm vào sau. Studio biến **công nghệ dynamic lighting thành CƠ CHẾ GAMEPLAY** thay vì chỉ là lớp trang trí.

Cảm hứng của cơ chế flare đến từ **The Thing (PS2)** — game mà người chơi ném pháo sáng với số lượng có hạn và phải cân nhắc khi nào dùng cây tiếp theo.

Mục tiêu thiết kế được nêu là **cân bằng 50/50 giữa khám phá và chiến đấu**, và "gameplay xoay quanh việc ném flare và soi sáng hang là thứ tối quan trọng ngay từ đầu để tạo chiều sâu cho việc khám phá và đào mỏ".

`[NGUỒN]` https://www.thegamer.com/deep-rock-galactic-making-of/ ·
https://www.psu.com/news/rock-and-stone-ghost-ship-games-ceo-soren-lundgaard-talks-deep-rock-galactics-upcoming-playstation-launch/ ·
https://www.youtube.com/watch?v=rGqih8GjFPM

### 9.2 Số liệu hệ thống flare

| Thông số | Giá trị |
|---|---|
| Mang tối đa | **4 flare** |
| Cháy sáng đầy | **30 giây** |
| Nạp lại | **12 giây/cây** |
| Sau 30 giây | Chuyển sang "cháy dở" (mờ đi), rồi **tắt hẳn sau ~20 giây nữa** |
| Bán kính chiếu sáng | **không tra được** (wiki không ghi con số mét) |
| Phân loại | **High-Intensity Flare**: Gunner + Scout · **Medium-Intensity Flare**: Driller + Engineer — nhưng wiki nói thẳng: **"không có khác biệt gì giữa hai loại này, dù tên gọi khác nhau"** |
| Màu theo class | Engineer đỏ · Scout xanh dương · Gunner xanh lá · Driller vàng |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/High-Intensity_Flare · https://deeprockgalactic.wiki.gg/wiki/Flare

**Flare Gun của Scout** khác hẳn: **75 giây** (gấp 2,5 lần), băng 3, tổng 12 đạn, nạp 2,4 giây, **bắn dính vào tường**, "sáng hơn và lâu hơn flare thường", "soi được khu vực rộng hơn nhiều". `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Flare_Gun

### 9.3 Bóng tối tương tác với những gì

| Hệ thống | Tương tác |
|---|---|
| **Cave Leech** | Nấp trên trần **trong hang tối**; bầu phát quang sinh học chỉ thấy khi nó thò xuống. **Bóng tối trực tiếp là cơ chế của con quái này** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Cave_Leech |
| **Mưa ở Crystalline Caverns** | **Làm giảm độ sáng của flare và đèn** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Crystalline_Caverns |
| **Bão cát Sandblasted Corridors** | Tầm nhìn giảm mạnh trong ~30 giây `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Sandblasted_Corridors |
| **Web Spitter** | Tơ dính **làm mờ mắt 4 giây**, không gỡ sớm được `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Web_Spitter |
| **Ổ nhện** | **Chặn tầm nhìn**, chỉ lửa mới đốt được `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Biome_Features |
| **Dense Biozone** | Được mô tả là **"pitch-black caverns"** — biome tối nhất `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Biomes |
| **Enor Pearl** | Cụm ngọc **tự phát sáng soi hang cho tới khi được nộp** — khoáng vừa là điểm vừa là đèn `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Enor_Pearl |
| **Stalker** | Tàng hình; auto-aim không khóa được → **mắt người chơi là cảm biến duy nhất** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Stalker |
| **Minehead (Point Extraction)** | Có sẵn **đèn pha** — điểm sáng cố định duy nhất trong hang `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Point_Extraction |

### 9.4 Tại sao ánh sáng lại "thấm" đến thế

`[ĐỀ XUẤT]` Gộp lại thì flare không phải "nút bật đèn" mà là **một hệ tài nguyên hoàn chỉnh có 5 tầng ý nghĩa**:

1. **Tài nguyên có hạn có nhịp hồi** — 4 cây, hồi 12 giây/cây. Không ném bừa được.
2. **Nó có tuổi thọ** — 30 giây rồi mờ dần rồi tắt. Nghĩa là **một căn phòng đã soi sẽ tối trở lại**. Ánh sáng phải được **duy trì**, không phải mở một lần là xong.
3. **Nó là ĐÁNH DẤU KHÔNG GIAN** — ném flare xuống chỗ có mạch Nitra để nhớ đường quay lại; ném vào đường hầm để biết mình đã đi qua. Nó là bản đồ, mà không cần bản đồ.
4. **Nó là GIAO TIẾP** — flare có màu theo class, nên nhìn màu là biết ai đã ở đây.
5. **Nó tạo NHỊP CĂNG–CHÙNG bằng thị giác** — vùng sáng = an toàn, vùng tối = chưa biết. Đi ra khỏi vùng sáng là một quyết định có cảm xúc.

Và tinh tế nhất: **quái từ bóng tối đi vào vùng sáng**. Người chơi thấy chúng đến trước khi chạm được vào — nhưng chỉ nếu đã chịu bỏ tài nguyên ra soi sáng chỗ đó. **Ánh sáng chính là thông tin, và thông tin phải mua.**

---

## 10. Cái gì nên bê sang một game 2D top-down mobile dọc

Bối cảnh giả định: màn hình dọc, điều khiển bằng ngón cái, phiên chơi ngắn (3-8 phút), một người chơi. Mỗi gạch đầu dòng dưới đây nêu **cơ chế cụ thể** + **lý do**, hoặc **lý do bỏ**.

### NÊN GIỮ

**1. Chu kỳ căng–chùng có cảnh báo, không phải dòng quái đều đều.**
Cơ chế: nền yên tĩnh → cảnh báo → swarm nhiều đợt nhỏ → dọn tàn quân → yên trở lại. DRG cách nhau **160-500 giây** tùy Hazard. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm
`[ĐỀ XUẤT]` Với phiên 3-8 phút, nén xuống **1 chu kỳ mỗi 40-60 giây**. Đây là cơ chế **đáng giá nhất** trong cả tài liệu: nó cho người chơi thời gian *làm việc khác* (đào, đi, sắp xếp), khiến lúc đánh nhau mới có ý nghĩa. Game mobile hay hỏng ở chỗ dồn quái liên tục cho "đã tay" rồi thành nhàm sau 90 giây.

**2. Cửa sổ cảnh báo ~3 giây thoại + ~20 giây chuẩn bị trước swarm.**
Cơ chế: DRG báo trước **3,7 giây** rồi quái spawn sau **~20 giây**, đủ để chọn chỗ đứng và đặt đồ. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm
`[ĐỀ XUẤT]` Trên mobile rút còn **4-6 giây**, báo bằng **rung + đổi nhạc + viền màn hình**, vì DRG cảnh báo bằng thoại/nhạc chứ không dùng hiệu ứng màn hình — mà mobile thì rất nhiều người tắt tiếng. **Bắt buộc phải có kênh thị giác.**

**3. Pressure Wave: chia swarm thành nhiều đợt nhỏ cách nhau 10-15 giây.**
Cơ chế: mỗi đợt 20-40 Difficulty Points, delay random lại sau mỗi đợt. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm
`[ĐỀ XUẤT]` Đây là "nhịp thở bên trong lúc căng" — 10-15 giây vừa đủ để reload, dịch chuyển, uống máu. Trên màn dọc còn quan trọng hơn vì tầm nhìn hẹp, dump một cục quái là người chơi không kịp đọc tình huống.

**4. Ngân sách Difficulty Point thay cho bảng spawn thủ công.**
Cơ chế: mỗi quái có giá (Swarmer 6, Grunt 10, Web Spitter 25, Praetorian 90, Bulk 120); mỗi đợt có ngân sách × modifier theo độ khó. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm/WIP
`[ĐỀ XUẤT]` Rẻ để code, dễ tune bằng một con số, và tự sinh ra sự đa dạng: cùng 100 điểm có thể ra 10 con nhỏ hoặc 1 con to + 1 con vừa.

**5. Tăng độ khó bằng SỐ LƯỢNG và SÁT THƯƠNG, không bằng bao máu.**
Cơ chế: Haz1→Haz5 sát thương quái ×5,6, số lượng ×5,7 (solo), nhưng máu hiệu dụng chỉ ×1,7 và **đứng yên từ Haz4 sang Haz5**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Difficulty_Scaling
`[ĐỀ XUẤT]` Cực kỳ quan trọng trên mobile: **giữ nguyên số phát bắn cần để giết một con** ở mọi độ khó, để cảm giác vũ khí không bao giờ "yếu đi". Bullet sponge làm hỏng cảm giác nhanh nhất.

**6. Hình phạt tăng dần thay vì chết ngay: máu hồi sinh 60% → 10%.**
Cơ chế: DRG không permadeath mà phạt bằng máu hồi sinh tụt dần theo Hazard. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Difficulty_Scaling
`[ĐỀ XUẤT]` Bản 1 người thì đổi thành: ngã lần 1 hồi 60% máu, lần 2 hồi 30%, lần 3 hồi 10%, lần 4 thua. **Một sai lầm không giết bạn, nhưng ba sai lầm liên tiếp thì có.** Chuỗi sai lầm mới đáng bị phạt, không phải sai lầm đơn lẻ.

**7. Nitra → Resupply: một tài nguyên trong màn có giá trị chiến thuật, tách khỏi mọi tài nguyên tính điểm.**
Cơ chế: **80 Nitra = 1 pod = 4 lượt, mỗi lượt 50% đạn + 50% máu**; Nitra thừa **không cho thưởng gì**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Resupply_Pod
`[ĐỀ XUẤT]` Đây là **cơ chế số 2 đáng bê nhất**. Nó biến việc đào từ "nhặt đồ phản xạ" thành "quyết định": dừng lại đào Nitra giữa lúc bị đuổi hay chạy tiếp? Bỏ 50% mà không phải 100% để không xóa sạch hậu quả. Trên mobile nên hiện **thanh Nitra ngay dưới thanh máu** để quyết định đó luôn hiển hiện.

**8. Red Sugar: hồi máu bằng chính động tác đào.**
Cơ chế: cuốc vào mạch đỏ hồi **1-60 HP mỗi nhát, ~60 HP mỗi mạch**, không vào túi, không nộp. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Red_Sugar
`[ĐỀ XUẤT]` Thiên tài ở chỗ **một động từ phục vụ hai hệ thống**. Trên mobile, ít nút là vàng — càng ít động từ mà càng nhiều ý nghĩa thì càng tốt. Đây là ví dụ mẫu mực.

**9. Quái "ép đổi góc" — giáp mặt trước ×0, điểm yếu phía sau.**
Cơ chế: Oppressor, Praetorian, Grunt Guard, Hiveguard đều bất khả xâm phạm từ phía trước, chỉ chết từ lưng/hông. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Oppressor
`[ĐỀ XUẤT]` Top-down 2D là **môi trường LÝ TƯỞNG** cho cơ chế này — hơn cả FPS. Góc nhìn từ trên xuống hiển thị hướng quay của quái rõ ràng bằng một mũi tên/mảng giáp, và người chơi hiểu ngay "phải vòng ra sau". Biến chiến đấu thành **bài toán vị trí** thay vì bài toán bắn nhanh.

**10. Quái "ép rời chỗ" — bắn tầm xa từ ngoài rìa màn hình.**
Cơ chế: Web Spitter (làm chậm + mờ mắt 4s), Acid Spitter (vũng axit), Septic Spreader (vũng độc 12 giây). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Septic_Spreader
`[ĐỀ XUẤT]` Chống lại bệnh "đứng một góc bắn ra" của mọi game top-down. **Vũng damage tồn tại lâu** (12 giây) là công cụ từ chối không gian rẻ nhất và dễ đọc nhất trên màn nhỏ.

**11. Đòn nổ khi chết — "giết được rồi" chưa phải là an toàn.**
Cơ chế: Exploder nổ 25 dmg bán kính 3,5 m khi chết; Bulk Detonator nổ **đường kính hơn 10 m giết ngay**; Praetorian để lại mây độc; Septic Spreader để lại vũng. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Bulk_Detonator
`[ĐỀ XUẤT]` Dạy người chơi **quan tâm tới việc giết ở ĐÂU**, không chỉ giết được hay không. Rất hợp mobile vì telegraph là một vòng tròn đỏ — đọc bằng ngoại vi được, không cần nhìn chăm chú.

**12. Ánh sáng có hạn, có tuổi thọ, đánh dấu không gian.**
Cơ chế: 4 flare, mỗi cây **30 giây rồi mờ rồi tắt**, hồi **12 giây/cây**, màu theo class. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/High-Intensity_Flare
`[ĐỀ XUẤT]` Trên màn dọc, sương mù chiến tranh + đèn ném là cách **rẻ nhất** để tạo cảm giác khám phá trong một không gian nhỏ. Chi tiết bắt buộc phải giữ: **flare TẮT sau một lúc**. Nếu sáng vĩnh viễn thì nó chỉ là nút mở map; vì nó tắt nên nó là tài nguyên, và người chơi mới phải chọn soi chỗ nào.

**13. Enor Pearl: khoáng tự phát sáng cho tới khi nộp.**
Cơ chế: cụm Enor Pearl soi hang cho tới khi được nộp vào M.U.L.E. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Enor_Pearl
`[ĐỀ XUẤT]` Đánh đổi tuyệt vời cho bản mobile: **giữ khoáng thì có đèn, nộp khoáng thì lấy điểm nhưng chìm vào bóng tối**. Một dòng code, một quyết định thật.

**14. Pha thoát có timer và có quái CHẶN ĐẦU dọc đường về.**
Cơ chế: **5 phút** (hoặc 3 / 1 phút), spawn **mỗi 20 giây, 100 DP mỗi người**, đặt **dọc đường chạy về Drop Pod**; M.U.L.E. rải **cột mốc xanh có mũi tên** dẫn đường. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Swarm · https://deeprockgalactic.wiki.gg/wiki/M.U.L.E.
`[ĐỀ XUẤT]` Cao trào có sẵn, miễn phí. Ba chi tiết phải giữ: (a) **timer đếm ngược nhìn thấy được**, (b) **quái spawn CHẶN ĐẦU chứ không đuổi sau lưng** — biến chạy trốn thành phá vây thay vì rượt đuổi vô nghĩa, (c) **mốc dẫn đường** để người chơi không lạc — trên màn dọc chỉ cần một mũi tên ghim mép màn hình.

**15. Warning/Anomaly: người chơi TỰ CHỌN độ khó để đổi lấy thưởng, chọn TRƯỚC khi vào màn.**
Cơ chế: warning cho **+15% đến +50%** thưởng (Lithophage Outbreak +50%, Elite Threat +30%, Low Oxygen +20%...); anomaly là mutator vui không đổi thưởng. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mutators
`[ĐỀ XUẤT]` Biến màn hình chọn màn thành minigame và tạo **replayability gần như miễn phí**: cùng một map, 3 warning khác nhau là 3 trải nghiệm khác nhau. Rất hợp mobile vì chọn bằng vài cú chạm trước khi vào, không tốn thao tác lúc chơi.

**16. Nhiều loại mission chỉ khác nhau ở ĐỘNG TỪ, không phải ở số lượng.**
Cơ chế: gom đủ số (Mining) / vác vật nặng (Point Extraction) / thủ một điểm theo thời gian (Refining, Salvage) / hộ tống thứ di chuyển (Escort) / diệt boss (Elimination). `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Missions
`[ĐỀ XUẤT]` Với mobile chỉ cần **4 động từ**: *gom · vác · thủ · hộ tống*. Bốn cái này đã đủ tạo cảm giác đa dạng mà dùng chung 100% code quái, code đào, code map.

### NÊN BỎ / ĐỔI

**17. BỎ: bốn công cụ traversal theo class.**
DRG có drill/platform/zipline/grapple vì hang **3 chiều và rất dọc** — fall damage bắt đầu từ 10 m/s, rơi 20 m là **171,5 damage** trên dwarf 110 máu. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Fall_Damage
`[ĐỀ XUẤT]` Top-down 2D **không có trục Z**, nên toàn bộ vấn đề mà 4 công cụ này giải quyết đơn giản là **không tồn tại**. Đừng ép. Thay bằng **một cơ chế đào duy nhất** làm cả 4 việc: mở đường tắt, tạo hành lang tử thần, bịt lối quái vào, và tạo chỗ trốn. Đó là **Driller làm được trong 2D, ba class kia thì không**.

**18. BỎ: co-op 4 người và toàn bộ thiết kế phụ thuộc vào nó.**
Shield Generator 6 giây, hồi sinh 6 giây, chia 4 rack tiếp tế, Mactera Grabber cần đồng đội bắn cứu, Cave Leech không thả cho tới khi chết — tất cả đều **giả định có người khác**. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Mactera_Grabber · https://deeprockgalactic.wiki.gg/wiki/Cave_Leech
`[ĐỀ XUẤT]` Một mình mà gặp Cave Leech kiểu DRG thì chỉ có chết đứng nhìn. **Mọi cơ chế "trói người chơi" phải có lối tự thoát** (bấm nhanh, dùng đồ, hoặc tự hết sau N giây) — DRG có sẵn tiền lệ: Mactera Grabber tự thả sau 15-20 giây và perk Heightened Senses cho tự thoát.

**19. BỎ: hệ tài nguyên 20 loại.**
DRG có 6 khoáng crafting + 8 loại nhiệm vụ phụ + 4 nguyên liệu bia + vật nặng hiếm. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Resources
`[ĐỀ XUẤT]` Với phiên chơi 3-8 phút, **tối đa 3 loại**: (1) tài nguyên chiến thuật trong màn = Nitra, (2) tài nguyên mục tiêu = Morkite, (3) tiền meta = Gold. Nhiều hơn là làm loãng ý nghĩa và làm rối HUD trên màn hình 6 inch. Giữ nguyên **luật 40/loại** vì nó tạo nhịp "về nộp" rất tốt.

**20. ĐỔI: pipeline, transmitter node, claw track, fuel canister — mọi minigame nhiều bước.**
DRG có xây ống 9 m/đốt, vá rò 5 giây, hack 90 giây, sửa 4 claw track. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/On-site_Refining
`[ĐỀ XUẤT]` Toàn bộ nhóm này đòi **ngắm chính xác + nhiều bước tuần tự**, cả hai đều tệ trên cảm ứng. Giữ lại **đúng một** cơ chế thủ điểm: *đứng trong vòng tròn N giây trong khi quái tràn vào*. Nó cho đúng cảm giác (bị vây, không được chạy) với **không nút bấm nào**.

**21. ĐỔI: weakpoint dạng bắn chính xác → weakpoint dạng vị trí.**
DRG có đầu ×2, bụng ×3, bầu ×3, khối u 200 HP. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Glyphid_Bulk_Detonator
`[ĐỀ XUẤT]` Ngắm vào bộ phận nhỏ là bất khả thi với ngón cái. Nhưng **hệ số theo HƯỚNG** (đánh từ sau lưng ×2) thì hoàn hảo cho top-down vì nó phụ thuộc **vị trí đứng**, thứ mà joystick ảo điều khiển rất tốt. Giữ nguyên ý đồ (thưởng cho người chơi khéo), đổi cách nhập liệu.

**22. GIỮ nhưng đơn giản hóa: Cave Leech thành "bẫy cố định có telegraph".**
DRG: nấp trần, quét trong bán kính 10 m, tóm là **5-68 damage/giây** và không thả cho tới khi chết; chỉ spawn lúc sinh map. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Cave_Leech
`[ĐỀ XUẤT]` Ý tưởng "hazard cố định, không hồi sinh, có tiếng báo trước, phạt việc đi ẩu qua chỗ tối" thì tuyệt vời. Nhưng **bỏ phần trói chết người**: đổi thành **vùng chậm + damage**, thoát được bằng cách di chuyển. Vẫn dạy đúng bài học ("nhìn trước khi bước") mà không tạo trạng thái vô vọng khi chơi một mình.

---

## Phụ lục: các số liệu KHÔNG tra được

Ghi lại để không ai đi tìm lại lần nữa:

- Bán kính chiếu sáng của flare (mét) — wiki chỉ ghi thời lượng.
- Thời gian Resupply Pod hạ xuống sau khi gọi.
- Sức chứa tối đa khi cộng cả armor mod và perk Deep Pockets.
- Số damage cụ thể của Creeper Vine, Bloated Vine, Thorn Pot, Goo Sack (Hollow Bough).
- Số damage của Wind Tunnel, Explosive Spore (Sandblasted Corridors).
- Bán kính tác dụng của Volatile Uranium.
- Số liệu Rockpox Infection.
- Thời lượng cụ thể pha thủ uplink và pha nạp fuel cell của Salvage Operation.
- HP của Cave Leech.
- Giá credits của Morkite, Nitra, Alien Egg, Aquarq và 4 nguyên liệu bia.

**Mâu thuẫn giữa hai trang wiki:** XP của Error Cube — trang `Error_Cube` ghi **4.000**, trang `Resources` ghi **2.000**.

**Lưu ý nguồn:** `deeprockgalactic.fandom.com` trả HTTP 402 Payment Required trên mọi trang trong đợt tra này, nên **toàn bộ số liệu trong tài liệu đến từ wiki chính thức `deeprockgalactic.wiki.gg`**, trừ các phỏng vấn đã ghi rõ URL.
