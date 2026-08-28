# Dragon Project (ドラゴンプロジェクト / ドラプロ) — hồ sơ nghiên cứu

Game gốc: **Dragon Project**, COLOPL. JP 2016-06-03, Global (goGame/SEGA) 10/2017.
Global đóng cửa **2020-09-30**; JP đóng cửa ngày 27/06 lúc 16:00 (thông báo trên 4Gamer).
Thể loại nhà phát hành tự gọi: *マルチハンティングRPG* — Monster Hunter thu nhỏ cho di động, 1–4 người.
Bốn ngày sau khi mở JP đã vượt **1 triệu người dùng**.

Tài liệu này là phần **research** cho bản dựng lại trong `games/dragonproj/`. Mọi con số dưới
đây đều dẫn nguồn; con số nào là **tái dựng** (không có trong nguồn công khai) đều đánh dấu `[TÁI DỰNG]`.

Nguồn chính:
- Official Dragon Project Wiki (Fandom) — đọc qua `api.php?action=raw`, 154 trang.
- 4Gamer, "「ドラゴンプロジェクト」全武器種の立ち回り方＆オススメ武器を紹介" (2016-06-20) —
  bài mô tả **chính xác** bản đồ thao tác ぷにコン và đặc thù 5 loại vũ khí.
- **Shironeko Project Wiki, trang `Class Mechanics`** — White Cat Project là nơi Punicon ra đời,
  và trang này là tài liệu đầy đủ nhất còn tồn tại về ngữ pháp của hệ điều khiển. Xem mục 1.
- Ảnh chụp màn hình trận đấu trong wiki (`CHANGE_WEAPON.png`, `WEAPON_GREAT_SWORD_CLEAVE.png`)
  — dùng để dựng lại layout HUD.

---

## 1. ぷにコン (Punicon) — cơ chế điều khiển

Punicon là hệ điều khiển COLOPL tự phát triển (dùng chung với *白猫プロジェクト*), cho phép
**đánh + di chuyển + né bằng đúng một ngón**, không có D-pad và không có hàng nút — nên nhân vật
không bị ngón tay che, và thuận tay trái hay phải đều như nhau. Chính hệ này về sau là tâm điểm
vụ kiện bằng sáng chế của Nintendo với COLOPL.

Bản đồ thao tác (4Gamer, mục 「●基本操作」 — nguyên văn:
「スワイプで"移動"，タップで"攻撃"，フリックで"回避"…連続してタップすることでコンボ…
長押しによる"各武器に応じた特殊行動"」):

| Cử chỉ | Hành động | Ghi chú |
|---|---|---|
| **Chạm & kéo** (swipe/drag) | Di chuyển | Cần gạt ảo mọc ra ngay tại điểm chạm — giữa màn hình hay bất cứ đâu |
| **Chạm nhả nhanh** (tap) | Đánh thường | |
| **Bấm liên tục** (spam) | Nối combo | Mỗi vũ khí một chuỗi combo dài ngắn khác nhau |
| **Vẩy** (flick) | Né / lăn | Né được cả đòn diện rộng; hủy được độ cứng sau đòn đánh |
| **Giữ** (long press) | **Đặc thù từng vũ khí** | Đây là chỗ 5 vũ khí khác nhau hoàn toàn |

Wiki bản Global mô tả trùng khớp: *"Hold tap and slide across the screen to navigate"*,
*"Swipe on screen to roll around or dodge"*, *"Tap on screen repeatedly to deal damage"*,
*"Tap and hold on screen to block (sword and shield only)"*.

### Ngữ pháp đầy đủ của Punicon — đọc từ *White Cat Project*

Dragon Project **không phát minh** Punicon; nó thừa hưởng từ **白猫プロジェクト (White Cat
Project / Shironeko Project)**, game 2014 của cùng COLOPL. Wiki của White Cat có trang
**Class Mechanics** liệt kê câu lệnh của từng class — và đó là tài liệu **đầy đủ nhất còn tồn
tại** về hệ điều khiển này, vì Dragon Project chỉ lặp lại một tập con.

Phần "Basic mechanics" (nguyên văn, áp dụng cho **mọi** class):

> **Move** — Slide the screen in the desired direction. Flick to quickly move in a direction and dodge attacks.
> **Normal Attack** — Tap the screen. Tap continuously for combos… A small amount of SP is recovered with each attack landed on enemies.
> **Action Skill** — **Hold the screen and slide in the direction of the skill button.** Each skill consumes SP.

Ba điều rút ra, và cả ba đều đã đưa vào bản dựng lại:

**1. Kỹ năng kích hoạt bằng GIỮ RỒI TRƯỢT VỀ HƯỚNG NÚT — không phải bấm vào nút.**
Đây là chi tiết dễ bỏ sót nhất và cũng là chi tiết *giải thích tại sao UI gốc tối ưu*: ngón cái
đặt giữa màn hình **không với tới mép phải**, nên Colopl không bắt nó với. Trượt đúng **hướng**
là đủ. Bản dựng lại nhận lệnh khi kéo vượt vòng cần gạt và lệch hướng dưới ~26°, đồng thời vẽ
một tia sáng từ cần gạt chỉ về nút đang nhắm. (Bấm thẳng vào nút vẫn được — Dragon Project có
nút Magi bấm được, thấy rõ trong ảnh chụp HUD.)

**2. Dấu 「!!」 trên đầu nhân vật là một câu lệnh, không phải hiệu ứng trang trí.**
Nó xuất hiện ở rất nhiều class và luôn có nghĩa **"chạm ngay bây giờ"**:
- Fencer — *Counter Slash*: vẩy né trúng một đòn → hiện `!!` → chạm → phản đòn.
- Cross Saber — *Assault Chain* / *Counter Edge*: `!!` → chạm → lao tới chém.
- Brawler — *Gatling Kick*: sau Charge Knuckle, `!!` → chạm.
- Warrior — *Buster Spin*: vẩy, `!!` → chạm → đòn xoay, giữ thêm để kéo dài.
- Brawler — *Grab Escape*: `!!` khi bị tóm → **vẩy** để thoát, mất 20% máu.

**3. Vẩy rồi CHẠM trong lúc còn đang lăn = một đòn riêng (Rolling Attack).**
Có ở Fencer (*Rolling Attack*), Warrior (*Rolling Smash*), Archer (*Rolling Shot*),
Brawler. Nghĩa là né trong Punicon **không phải hành động phòng thủ thuần** — nó là nửa đầu của
một combo. Đây là thứ làm cho việc "vẩy liên tục" có ích chứ không phải chạy trốn.

Ba quy ước phụ khác cũng lấy về:
- **Mức nạp hiện thành VÒNG MÀU DƯỚI CHÂN nhân vật**, không phải thanh ở rìa màn hình.
  Bậc màu của Warrior *Overcharge*: **trắng (1–3) → vàng (4–6) → lục (7–9) → đỏ (tối đa)**.
  Brawler *Combo Charge* dùng đúng bảng màu đó theo số đòn trúng (25 → 100 → 200 hit).
- **Just Guard** (Lancer): đỡ **ngay trước** khi đòn chạm → né hẳn đòn đó và hồi lại độ bền khiên.
  Chính là *Critical Guard* của Dragon Project.
- **Burst Gauge**: đầy → **giữ để nạp rồi nhả** → vào trạng thái mạnh. Dragon Project đổi tên
  thành thanh **Heat** / **Soul** nhưng giữ nguyên câu lệnh.

Vài move set đặc trưng khác của White Cat, để đối chiếu với 5 vũ khí của Dragon Project:
Mage *Teleportation* (vẩy = dịch chuyển, không phải lăn) · Mage *Revival* (giữ cho tới khi thanh
cứu đồng đội đầy) · Cross Saber *Assault Step* (giữ-nhả = dịch chuyển tới địch gần nhất, có khung
bất tử) · Dragon Rider *Charge Breath* (giữ = phun liên tục, càng giữ càng yếu dần) ·
Rune Saber *Rune Drive* (giữ icon rồi **trượt qua từng rune** để bật — biến thể nâng cao của
chính câu lệnh giữ-rồi-trượt).

### Ngưỡng thời gian / khoảng cách `[TÁI DỰNG]`
Không nguồn nào công bố. Bản dựng lại dùng: vùng chết 12px; tap khi < 180ms và kéo < 12px;
flick khi tốc độ lúc nhả > 1.05 px/ms; giữ kích hoạt đặc thù sau 260ms **đứng yên** (giữ ngưỡng
"đứng yên" để kéo-di-chuyển không vô tình biến thành đòn đặc thù); cửa sổ nối combo 450ms;
cửa sổ 「!!」 900ms; lệch hướng cho phép khi trượt về nút kỹ năng 26°.

---

## 2. Vũ khí — 5 loại, mang tối đa 3, đổi được giữa trận

Đổi vũ khí trong trận có **độ trễ ngắn, đứng yên và hở sườn** (How-to-Play guide). Chỉ đánh
bằng 1 vũ khí tại một thời điểm. Loadout đổi ở Armory.

| JP | EN | Đặc thù (Normal) | Tính chất |
|---|---|---|---|
| 片手剣 | Sword & Shield | **Guard** — giữ để đỡ | Cân bằng, vũ khí **duy nhất** đỡ được |
| 両手剣 | Great Sword | **溜め斬り Charged Cleave** | Sát thương cao nhất, chậm nhất |
| 槍 | Spear | **突進 Lunge** | Tầm với dài nhất, đòn cuối combo quét vòng |
| 双剣 | Dual Blades | **乱舞 Ranbu** | Nhanh nhất, di chuyển nhanh nhất, tầm ngắn nhất |
| 弓矢 | Bow | **狙い撃ち Snipe** | Duy nhất đánh xa; **càng gần bắn càng đau** |

### Chi tiết từng đặc thù (nguồn: How-to-Play guide + 4Gamer)

**Sword & Shield — Guard & Counter.** Giữ để đỡ bao lâu tùy ý; khi đỡ thì giảm sát thương
nhưng **chậm đi**. Đỡ **đúng thời điểm** (timed guard / クリティカルガード) → giảm **90%**
sát thương (wiki Normal-type ghi *"Received damage become 1/10"*). Nhả tay sau một cú đỡ
thành công → **phản đòn** một nhát chém dọc, sát thương cao hơn hẳn đòn thường (4Gamer:
「紫色の斬撃がカウンター…通常攻撃よりはるかに高威力」). Đỡ **không** chặn được hiệu ứng bất lợi.
Normal-type còn: hồi HP nhanh hơn khi đang đỡ, hồi sinh đồng đội nhanh hơn khi đang đỡ.
Heat-type: đỡ nạp thanh Heat, đầy thì giữ → **Vengeance**; phản đòn thành **2 nhát**.

**Great Sword — Charged Cleave.** Giữ để nạp, **đứng yên và hở sườn**. Nhả bất cứ lúc nào →
chém dọc, hệ số nhân theo thời gian nạp, có mốc nạp tối đa báo bằng đổi thế đứng.
Đòn chém **không thể bị ngắt**, và trong lúc chém người chơi **giảm 50% sát thương nhận**.
Normal-type: cú chém nạp gây **×4 sát thương hệ**. Heat-type: mất bonus ×4 nhưng nối được
đòn 2 và đòn 3 bằng cách bấm đúng nhịp (Pulverize). Đánh vào chỗ **không** phải WEAK vẫn nạp
được thanh gục.

**Spear — Lunge.** Giữ → lao thẳng một quãng vừa theo hướng đang quay, chạm địch gần nhất thì
gây sát thương. Trúng **WEAK point** → làm địch **chùn và ngắt đòn đang ra**. Sau khi lao có
**một khoảng hở ngắn**. Normal-type: nếu kéo giữ chỉ hướng khi lao, sát thương **hệ** của cú lao
và của combo ngay sau đó tăng tới **×4**. Heat-type thay bằng **Jump Thrust / Sky Fall**: giữ →
hiện vòng ngắm di chuyển được quanh nhân vật; nhả → bay lên rồi rơi xuống gây sát thương diện
rộng; mạnh theo số vạch Heat (**tối đa 3 vạch**); đang ngắm vẫn ăn đòn.

**Dual Blades — Ranbu.** Trang bị vào thì **tốc chạy và tốc né cao nhất game**. Giữ → nạp một
nhịp rồi nhảy lên tung chuỗi đòn trên không, **bất tử từ lúc nhảy đến hết chuỗi**; **tiếp đất có
độ cứng** dễ ăn đòn. Đánh trúng được cả WEAK point **ở trên cao**. Heat-type thay bằng
**Overdrive/Demonize**: thanh Heat **đầy sẵn khi vào trận**, kích hoạt khi ≥50%; trong lúc bật
thì tăng tốc chạy, tốc đánh, sát thương, và **mỗi đòn liên tiếp (tối đa 7) +50% sát thương**;
thanh cạn thì tắt, đánh trúng thì nạp lại. Có tới **4 vạch**.

**Bow — Snipe.** Giữ → hiện vòng ngắm kéo được quanh nhân vật; sát thương tỉ lệ với thời gian
giữ; nhả → bắn, **xuyên qua** mục tiêu phía sau. Nạp đầy trúng WEAK point → cắm mũi tên trắng
gây **sát thương theo thời gian**, cộng dồn theo số lần trúng WEAK. **Tầm càng ngắn sát thương
càng cao** (4Gamer: 「射程距離が短いほど矢の威力が大幅に高まる」). Kneeling Shot mở rộng bán
kính ngắm. Heat-type: hiện nhiều điểm ngắm trên thân quái, bắn đủ 4–5 điểm liên tiếp →
**Lockdown**, quái bất động vài giây.

### Loại đặc thù của vũ khí
`Normal` / `Heat` / `Soul` / `Burst` / `Oracle` (Oracle và Burst ra sau, wiki còn để "Unknown"
cho phần lớn Burst). Soul: nạp thanh Soul, đầy thì buff (vd Great Sword vào **Slayer Mode**:
tăng tốc, tăng sát thương, giảm độ trễ combo; Spear đánh **tự trừ máu mình**, giữ-nhả thì ra
đòn nặng và **hút máu lại**).

---

## 3. Hệ nguyên tố & trạng thái

Vòng khắc chế (How-to-Play guide): **Water > Fire > Earth > Lightning > Water**, và
**Dark ↔ Light** đối nhau. Hệ số khắc chế cụ thể không công bố `[TÁI DỰNG: ×1.5 / ×0.6]`.

Trạng thái có trong game (suy từ bảng Common Abilities — mỗi trạng thái đều có một ability
giảm thời gian): **Burn, Poison, Paralysis, Slow**, cộng **Freeze** và **Stagger** (từ mô tả Magi).
Ghi chú tê liệt (trang Attack Magi): tỉ lệ làm tê liệt theo hệ địch — **Earth 0%, Lightning 25%,
Fire 50%, Water 100%**; **phá được một bộ phận thì hủy trạng thái tê liệt**.

---

## 4. Boss (Behemoth) — cách đánh

Ba đường gặp boss: **Sudden Massive Monster** (ngẫu nhiên khi đang farm, hạng B→S; loại
**Rare** hiện chữ vàng và rơi vật phẩm hiếm làm "proof"), **Event Boss**, và **Gacha Summon**.

Cơ chế trận boss:
- **Điểm yếu (WEAK point)**: boss tự để lộ trong thời gian ngắn; đánh vào đó ra sát thương cao.
- **Phá bộ phận (Part break)**: đủ sát thương lên một bộ phận thì phá, **rơi thêm nguyên liệu**.
- **Thanh gục (Fatigue / Incapacitation)**: thanh vàng nhỏ **ngay dưới thanh máu boss**; chỉ nạp
  bằng sát thương vào điểm yếu. Đầy → boss **gục một khoảng**, ăn sát thương cao hơn nhiều —
  đây là cửa sổ để xả Magi và đòn Heat.
- **Điểm yếu đặc biệt**: chỉ ăn **đặc thù của một loại vũ khí nhất định** (vd cú lao của thương)
  hoặc một loại Magi nhất định; trúng thì boss **loạng choạng và mất lượt đánh đang ra**.
- **Báo đòn**: game **tô đỏ vùng ảnh hưởng** trước khi boss ra đòn mạnh.
- **Thưởng gem**: tối đa **4 gem** mỗi con Sudden Behemoth — 1 gem cho mỗi điều kiện
  (không chết lần nào / dùng một loại kỹ năng chỉ định / hạ trong thời gian ngắn hơn),
  đủ cả 3 thì **+1 gem** nữa. Con đã hạ ở cùng map thì không cho gem lại.
- Party **4 người**; hạ xong mỗi người nhận phần riêng, **chủ phòng chắc chắn có Tablet**.

Số lượng boss trong wiki: **SS 46 con, S 31 con**, cộng A và B. Mỗi con boss quy định **1 loại
vũ khí + 1 loại đặc thù + 1 hệ**, và chính là bộ trang bị chế từ Tablet của nó.

Ví dụ số liệu thật của một boss SS (trang **Cocytus Amarok**, Sword & Shield / Normal / Water):

| | Giá trị |
|---|---|
| Vũ khí — Physical Attack | 306 (+117 sau limit break) |
| Vũ khí — Elemental Attack | 656 (Water) |
| Ô Magi của vũ khí | ★ Attack, ♥ Recovery, ★ Attack |
| Ability gốc | HP ≥ 80% → Water DMG +30%, tốc đánh +15% |
| Giáp — hệ phòng | Fire |
| Head | HP 252 (+27) / PDef 0 / EDef 148 / PAtk 0 |
| Body | HP 0 / PDef 327 (+76) / EDef 199 / PAtk 0 |
| Arm | HP 52 / PDef 112 (+13) / EDef 151 / PAtk 45 (+14) |
| Legs | HP 120 (+11) / PDef 105 (+25) / EDef 210 / PAtk 19 (+6) |
| Drop | Ice Core (S) · Frozen Tail (A) · Icicle Wing (C) · Carapace (D) · **Tablet (SS)** |

Đây là **thang số** dùng để cân bằng bản dựng lại: vũ khí SS ≈ 300 phys / 650 elem ở max,
một bộ giáp SS ≈ 424 HP / 544 phys-def / 708 elem-def / 64 phys-atk.

Thang vũ khí Sword & Shield hạng SS trong wiki (Physical / Elemental ở max level 40):
`135/291` → `274/587` → `306/656` (3 bậc **evolve** của cùng một cây), hoặc dòng Heat
`198/297` → `297/445` → `445/669`. Limit-break bonus của dòng Normal: `+20 / +42 / +55`;
dòng Heat: `+44 / +66 / +89`.

---

## 5. Trang bị

Bộ giáp **4 mảnh**: Head, Body, Arms, Legs. Mặc đủ bộ có **bonus**, nhưng mix được.
- **Gold Armor**: chế từ **Behemoth Tablet**. Limit break đủ 4 lần → **thêm 1 ô Passive Magi**.
- **Silver Armor**: không cần Tablet — từ event, từ **Emblem** rơi ngoài field, hoặc từ nguyên
  liệu hạng S/A/B/C. Thường **không** có ô magi thứ 3.

**Nâng cấp (Enhance)**: tốn nguyên liệu chỉ định theo cấp đích, làm ở **ARMORY**.
**Tiến hóa (Evolution)**: tới max level thì evolve bằng **equipment crystal**; đổi tên, **về lv.1
nhưng giữ chỉ số cao hơn**; tối đa **2 lần** (hạng A trở xuống thường không có).
**Limit Break**: tốn **Lapis** cùng hạng, làm được ở **bất kỳ level nào**, **tối đa 4 lần**;
3 lần đầu tăng chỉ số, **lần thứ 4 mở ô Magi thứ 3**. Lapis lấy từ **rã** trang bị chế từ
nguyên liệu boss gacha.
**Ability**: mỗi món có **2 ability ngẫu nhiên**; đổi lại được **không giới hạn số lần**, tốn
**Gold**. Món đặc biệt có thêm **ability thứ 3 cố định, hiện chữ xanh lá**, và ability xanh này
**ăn theo reinforcement**.

Danh sách **Common Abilities** (nguyên văn từ wiki — đây là bảng để tái dựng đúng):
Sword DMG · Guard (giảm dmg khi đỡ) · Great DMG · Cleave · Cleave SPD (giảm thời gian nạp) ·
Spear DMG · Lunge · D. Blades DMG · Frenzy · Bow DMG · Snipe Shot · Snipe SPD ·
Fire/Water/Earth/Lightning DMG · Fire-Water DMG · Hydroelectric (Water+Lightning) ·
Burn DMG · Poison Resist · Anti-Paralysis · Slow Resist · Recovery · Move SPD · Dodge (tăng
quãng né) · Magi Charge · Casting SPD · Luck.

---

## 6. Magi (マギ) — đá kỹ năng

Đá gắn vào ô của trang bị. **Ô có hình dạng**, chỉ lắp được magi cùng hình:

| Loại | Hình | Gắn ở | Tác dụng |
|---|---|---|---|
| Attack | ★ ngôi sao | **Vũ khí** | Đòn sát thương, hầu hết có hệ. Hai kiểu: Ranged / Melee |
| Recovery | ♥ trái tim | **Vũ khí** | Hồi máu. Ba kiểu: Regeneration / Instant / Party heal |
| Support | ◆ kim cương | **Vũ khí** | Buff bản thân. Ba kiểu: Defense / Damage / Trap |
| Passive | ● tròn | **Giáp** | Bị động, luôn bật: +HP / +ATK / +DEF |

Vũ khí thường **2 ô**, giáp **1 ô**; limit break lần 4 mở thêm 1 ô.
Nâng magi bằng **Strengthening Stones** (rơi từ khai thác ngoài map và daily quest).

**Tỉ lệ gacha Magi**: **SS 3% · S 9% · A 48% · B 40%**. Gói có bảo hiểm thì viên cuối chắc chắn SS.
**Level tối đa theo hạng**: SS 60 · S 40 · A 30 · B 20 (Passive SS chỉ tới 30).

Vài mốc số thật để cân bằng (từ wiki):
- Recovery SS hồi từ **400** (Anniversary Heart) tới **1600** (Angel's Embrace) — nghĩa là
  máu người chơi ở endgame nằm ở thang **vài nghìn**.
- Support SS: buff hệ **+180%~+200%** trong **20–30s**; khiên **Quad Aegis** = 200% max HP.
- Passive SS: **+280 HP**, **+90 PAtk**, **+200 PDef**, **+20% sát thương hệ**, **+15% move speed**.

---

## 7. Gacha & tiền tệ

**Gacha boss ("Quest Gacha")** — điểm lạ của game: gacha **không ra vũ khí**, nó ra **một con
boss để đi đánh**. Đánh xong mới nhận Tablet/Lithograph để tự chế đồ. Hạ **5 con cùng loại** là
chế được **trọn bộ 4 giáp + 1 vũ khí**.
- Tỉ lệ: **SS 3% · S 15% · A 55% · B 27%**; gói bảo hiểm thì con cuối chắc chắn SS.
- **5 vé** = 1 lần đơn · **50 vé** = gói **10+1**. Vé có hạn dùng.

Tiền tệ: **Gem** (cao cấp: gacha, hồi sinh trong trận, mua potion xịn) · **Gold** (chính) ·
**Medal** (chỉ có từ giết boss, đổi nguyên liệu/potion/vé) · **Gacha Ticket** · **Pikke Points**.
**Potion**: +gold / +exp / +tỉ lệ rơi đồ, **30 phút**; loại cao cấp mua bằng gem có **cả ba**, **60 phút**.

---

## 8. Nhiệm vụ

**Story** — Main (mở map mới, boss nằm giữa các map, xong phải **về nhà xem cutscene** mới nhận
thưởng; banner **xanh lá**, icon Pamela) · **Side** (nhặt nguyên liệu, hoàn thành ngay ngoài
field, banner **xanh dương**; nguyên liệu chữ **cam** = hiếm, thưởng tốt hơn) ·
**Secret** (mở sau khi xong main; ở 3 vùng "Hidden" — hậu tố **Dark / Darkness / Black** —
quái level cao hơn; banner **tím**).

**Recurrent** — Daily: 3 nhiệm vụ + 1 nhiệm vụ thưởng khi xong cả 3. Weekly: 4 + 1.
Bảng thưởng thật (rút gọn): giết 1 behemoth = **10.000 gold + 100 Pikke**; giết 3 = 150 Pikke +
Gold Potion; xong cả 3 daily = **300 Pikke + 5 gem**; mỗi weekly = **200 Pikke + 2 vé**;
xong daily 5 lần trong tuần = **400 Pikke + 25 gem**.

**Event** — *Material Collection* (mỗi thứ trong tuần 2 loại behemoth, 4 độ khó
Novice/Intermediate/Advanced/Master; cuối tuần mở tất cả + map **Gold Plains** thưởng
2.000/6.000/12.000/**20.000 gold**) · *Dungeon Clearing* · *Tower Clearing* (5 tầng một lượt,
**5 phút**, tối đa 4 người, **4 lần cứu, không được hồi sinh bằng gem**; hết lượt cứu thì xem
tới hết tầng rồi tự sống lại ở tầng sau; phá bộ phận và hạ boss được **cộng giờ**).

---

## 9. Bản đồ & quái thường

**6 bộ tộc quái thường**: **Purun** (slime) · **Vacca** (bò) · **Geguri** (ếch) · **Bat** (dơi) ·
**Galena** (chim) · **Fungo** (nấm). Mỗi tộc có biến thể theo hệ — tiền tố
`Heat` (lửa) / `Aqua` (nước) / `Thunder`–`Elec` (sét) / `Mad` (đất) — và bản **elite** to hơn
(hậu tố `-ron`, `-ino`, hoặc `Gold`) máu và sát thương cao hơn, **tỉ lệ rơi đồ tốt hơn nhiều**.
Đồ rơi quyết định bởi **tộc** (nguyên liệu chung) + **hệ** (nguyên liệu riêng).

Tỉ lệ rơi thật (trang Small monsters), quái thường:
`D 24.95%` · `C 2.95%` · `B 7.70%` · `B cao cấp 1.45%` · `B của boss 0.32%`.
Quái elite: `D 28.44%` · `C 19.99%` · `B 24.95%` · `B cao cấp 16.03%` · `B boss 10.59%`.
Gold Jelly: `D 27.95%` · `C 20.20%` · `B 24.95%` · `B cao cấp 16.20%` · `Grouton Core 10.70%`.

Vùng đất (Season 1) và khoảng level: **Tior Fields** (1–21) · **Rakshard Badlands** (5–28) ·
**Torerno Tropics** (10–32) · **Sutherland Mountains** (14–30) · **Kouglorz Forest** ·
**Borda Ruins** · **Torv Desert** · **Ancient Kirva Territory**. Mỗi vùng chia nhiều map con
(`- South / West / North / East`), mỗi map con có bảng spawn riêng + 1 **Sudden Encounter**
loại Normal và 1 loại Rare. Mỗi vùng có 3 map ẩn hậu tố **Dark / Black / Darkness**.

Cổng (portal) sang map kế **khóa cho tới khi giết đủ số quái**; cổng hiện số còn thiếu và
**phát sáng** khi đủ; mở cổng có thể thưởng gem.

Rương rơi ra khi giết quái, **phải chạm vào mới nhặt**, và **biến mất sau một lúc hoặc khi
đổi map**. Rương **vàng-bạc** ra đồ hạng thấp, rương **đỏ** ra đồ hạng cao và có cơ hội ra
vật phẩm nhiệm vụ; rương **vàng-trắng** là rương nhiệm vụ.

Nguyên liệu chia **6 hạng: SS · S · A · B · C · D**, cộng nhóm riêng **Lapis**.

---

## 10. Cốt truyện & nhân vật

Người chơi là một **Hound / Hunter**, bảo vệ **Vương quốc Hilant** (bản Global gọi là
**Heiland**). Cốt lõi: tồn tại một con rồng huyền thoại — **Tiamat** — mang theo
**Crimson Gloria**, thứ **biến thú thành quái vật**. Chuỗi story chia mùa; JP về sau mở
**chương 2** với vùng **ミュリアス境界 (Myurias Boundary)** và nhân vật **リシュア (Rishua)**,
hậu duệ của tộc điều khiển rồng.

NPC: **Pamela** (nhận nhiệm vụ ở guild) · **Pikke** (cửa hàng, tiêu Pikke Points) ·
**Sylvie** · **Axel** · **Linton** · **Ange** · **Aine** · **Gawen** · **Jild**.

Tên vài nhiệm vụ mở màn (Area 1 Tior Fields): *I'm In A Hurry!* · *Defeat the Behemoth!* ·
*Linton Meal* · *Find Froggo Skin!* · *Earthen Horns, Please* · *Mission From Sylvie* ·
*Protect the Carriage* · *Froggo Hate* · *Axel's Hunting Mission* · *Medicinal Use of Jelly* ·
*Defeat a Winvlum!*

Tạo nhân vật: 2 giới tính · **5 khuôn mặt** · **8 tông da** · **8 kiểu tóc** · **12 màu tóc** ·
**4 giọng**; đổi lại bất cứ lúc nào ở Menu → Profile → Customise.

---

## 11. Layout HUD trận đấu (dựng theo ảnh `CHANGE_WEAPON.png`, 540×960 dọc)

```
+----------------------------------------------+
| (o) 0:03:52  X Lv5 <TEN BOSS>  Weakness [#] =|  <- hang boss
|          ############################____    |  <- mau do
|          ##############________________      |  <- thanh guc vang
+----------------------------------------------+
|                                              |
|                                     +-----+  |
|                    [NPC] Leo        |  *  |  |  <- nut Magi 1 (luc giac)
|                    =====            +-----+  |
|                                     +-----+  |
|                                     |  V  |  |  <- nut Magi 2
|                                     +-----+  |
|                                          <|  |  <- tab chat/stamp
|  > 17m                                       |  <- khoang cach toi boss
|                                              |
|                 (san dau)                    |
|                                              |
+----------------------------------------------+
|  ,---.  <ten nguoi choi>               150   |
| ( (o) )  ##########################          |  <- cau Magi (trai) + mau
|  `---'   _______ Lv. 8 _______               |  <- exp
|              [P] 0        [G] 0              |  <- dem potion / gem
+----------------------------------------------+
```

Điểm phải giữ đúng, vì nó chính là lý do UI gốc "tối ưu": **toàn bộ nửa dưới và giữa màn hình
trống hoàn toàn** — đó là vùng đặt ngón cái. Không nút nào nằm ở đó. Chỉ có ba thứ bấm được:
nút Magi ở mép phải (tầm ngón cái với tới khi cầm một tay), nút menu góc trên phải, và tab chat.

Ảnh `WEAPON_GREAT_SWORD_CLEAVE.png` bổ sung: quái thường có **biển tên + thanh máu xanh lá
nổi trên đầu**, sát thương hiện thành **số trắng viền đen bay lên**, và camera là góc nhìn
**top-down nghiêng ~55°**.

---

## 12. Những gì bản dựng lại **không** làm

- **Multiplayer thật.** Bản gốc là 1–4 người thật. Bản này thay bằng **3 NPC đồng đội** chạy AI —
  giữ được cảm giác đội hình 4 người, cứu nhau, chia đòn, nhưng không có mạng.
- **Tài nguyên gốc.** Không dùng một file ảnh/âm thanh nào của Dragon Project. Mọi thứ trên màn
  hình đều **vẽ bằng code**. Cái được lấy là **dữ liệu thiết kế**: bản đồ thao tác Punicon,
  đặc thù 5 vũ khí, thang chỉ số, tỉ lệ gacha, tỉ lệ rơi đồ, layout HUD.
- **Số liệu không công bố.** Máu boss, sát thương từng đòn, thời gian hồi Magi, tốc chạy — wiki
  không có. Đều là `[TÁI DỰNG]`, cân theo thang chỉ số trang bị ở mục 4 và 6.

## Nguồn

- https://dragonproject.fandom.com/wiki/Basic_gameplay
- https://dragonproject.fandom.com/wiki/How_to_Play_Guide_for_Dragon_Project
- https://dragonproject.fandom.com/wiki/Weapon (+ 5 trang vũ khí)
- https://dragonproject.fandom.com/wiki/Magi (+ Attack/Support/Recovery/Passive Magi)
- https://dragonproject.fandom.com/wiki/Monster (+ SS/S/A/B Behemoths, Small monsters)
- https://dragonproject.fandom.com/wiki/Equipment · /Material · /Map · /Story_Quests · /Recurrent_Quests · /Event_Quests
- https://www.4gamer.net/games/336/G033666/20160617066/
- https://app.famitsu.com/20160603_736272/
