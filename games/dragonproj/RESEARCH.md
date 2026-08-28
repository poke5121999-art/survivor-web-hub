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

Bốn điều rút ra, và cả bốn đều đã đưa vào bản dựng lại:

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

**4. HƯỚNG NHÌN: đứng yên thì tự ngắm, đang chạy thì bắn theo hướng đi.**
Đây là mảnh còn thiếu khiến câu quảng cáo của Colopl thành ra đúng. 週刊アスキー viết về ぷにコン:

> 攻撃は画面のどこをタップしても大丈夫。自分の指で敵が見えなくなるわずらわしさもありません。
> *(Đánh thì chạm chỗ nào trên màn hình cũng được. Không có chuyện ngón tay che mất con quái.)*

"Chạm chỗ nào cũng được" chỉ đúng nếu game **tự quay nhân vật về phía địch**. GameWith, khi tổng
hợp đợt đổi thao tác 19/02/2020 của White Cat, ghi rõ luật hai vế:

> チャージアクションで発生する敵のターゲットが、**移動中は無くなり、進行方向に放つ**ように変更
> *(mục tiêu tự động của chiêu nạp **biến mất khi đang di chuyển, đòn bay theo hướng đi**)*
>
> その場で**停止して使う場合は敵の方向を向く**ので、慣れるまで注意しておこう
> *(dùng khi **đứng yên tại chỗ thì nhân vật quay về phía địch**, phải quen tay một chút)*

Wiki Shironeko nhắc lại luật này ở từng đòn: Sword Master *"a quick attack **in the direction of
the closest target**"*, Brawler sau Charge Knuckle *"**Automatically attacks a targeted enemy**"*,
Dragon Rider / Cross Saber *"**Targets the closest enemy**"*.

Nên luật là:

| Cần gạt | Hướng nhìn | Nghĩa là |
|---|---|---|
| Đang lệch (chạy) | Theo **hướng đi** | Người chơi đang tự chỉ hướng, game không giành lái |
| Đang ở giữa (đứng) | Tự quay về **địch gần nhất** | Chạm chỗ nào cũng trúng — cái lõi của một-ngón |

Bản dựng lại làm đúng vậy trong `Battle.faceTarget()`: thoát ngay nếu `player.moving`, còn không
thì khoá con gần nhất trong tầm `max(tầm vũ khí × 2.4, 190px)` (vũ khí bắn xa thì 520px) — đủ
rộng để khỏi canh hướng, đủ hẹp để không tự quay sang một con ở tận đầu kia sân. Áp cho: đánh
thường, vào thế đòn đặc thù, phản đòn, và xả Magi. **Không** áp cho đòn đánh-khi-đang-lăn, vì lúc
đó hướng đã do cú vẩy quyết định.

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

- **Multiplayer thật.** Bản gốc là 1–4 người thật. Bản này đi **một mình** — xem mục 13.4.
- **Tài nguyên gốc.** Không dùng một file ảnh/âm thanh nào của Dragon Project. Mọi thứ trên màn
  hình đều **vẽ bằng code**. Cái được lấy là **dữ liệu thiết kế**: bản đồ thao tác Punicon,
  đặc thù 5 vũ khí, thang chỉ số, tỉ lệ gacha, tỉ lệ rơi đồ, layout HUD.
- **Số liệu không công bố.** Máu boss, sát thương từng đòn, thời gian hồi Magi, tốc chạy — wiki
  không có. Đều là `[TÁI DỰNG]`, cân theo thang chỉ số trang bị ở mục 4 và 6.

---

## 13. Chỗ **cố ý lệch** bản gốc — và vì sao

Mục 1–11 ở trên là thứ *tìm được* về Dragon Project. Mục này là thứ bản dựng lại *quyết định làm
khác*. Sáu chỗ, và phần lớn đổi vì cùng một lý do: bản gốc là game **dịch vụ trực tuyến, nhiều
người, chơi dài hạn**, còn bản này là một trang HTML mở ra chơi một mình. Giữ nguyên khung của
game gốc thì đúng về hình thức nhưng hỏng về trải nghiệm.

### 13.1 Đi **ải** thay cho đi map nối map

**Bản gốc:** mỗi vùng là một chuỗi map nối nhau bằng cổng. Dọn đủ quái thì cổng mở, đi qua sang
map sau. Behemoth thì phải quay Quest Gacha mới có con để đánh, hoặc đợi *Sudden Behemoth* ngẫu
nhiên nhảy ra giữa map.

**Bản này:** một danh sách **ải đánh số** (Ải 1-1, 1-2, …). Mỗi ải là **hai chặng liền nhau trong
cùng một trận**: dọn đủ số quái mà ải yêu cầu, rồi **Behemoth cuối ải** ra ngay tại chỗ. Hạ nó là
phá ải, và ải kế tiếp mở.

**Vì sao:** cấu trúc gốc phân tán mục tiêu ra ba chỗ — cổng ở map, boss ở gacha, boss hiếm ở may
rủi. Người chơi mới mở game lên không biết mình *nên* làm gì tiếp. Danh sách ải đánh số trả lời
câu đó bằng một dòng: ải kế tiếp là ải nào, cần dọn bao nhiêu quái, trùm là con gì. Toàn bộ phần
"đi đâu bây giờ" biến mất.

**Chuỗi ải:** 38 ải qua 8 vùng, cấp 1 → 70. Trùm leo thang theo đúng bảng hạng của game gốc:
24 ải trùm hạng B, 9 ải hạng A, 4 ải hạng S, và ải cuối cùng là **Deus Felnarog hạng SS**. Ải cuối
mỗi vùng là chốt chặn (trùm mạnh hơn, thưởng gấp đôi, +10 Gem cho lần phá đầu).

### 13.2 Gacha ra **thẳng trang bị**

**Bản gốc:** Quest Gacha quay ra **một con Behemoth để đi đánh**. Hạ nó xong mới có **Tablet**,
đem Tablet về lò rèn mới chế được đồ. Năm Tablet cùng loại = 4 giáp + 1 vũ khí của con đó.

**Bản này:** quay ra **thẳng vũ khí hoặc giáp**, dùng được ngay.

**Vì sao:** ba bước (quay → đánh → chế) cho *một* món đồ là quá dài để hiểu, và ở bước một người
chơi còn chưa biết mình đang quay cái gì. Tỉ lệ hạng thì giữ **nguyên số thật** của Quest Gacha:
SS 3% / S 15% / A 55% / B 27%. Bộ đồ của mỗi Behemoth cũng giữ nguyên — chỉ bỏ khâu trung gian.

**Cân bằng bù lại:** gacha chỉ cho **món đồ**, không cho sức mạnh. Muốn mạnh thì phải **nâng cấp**,
mà mọi nguyên liệu nâng cấp đều **rơi trong ải**: Strengthening Stone, Equipment Crystal (bắt buộc
từ cấp 25), Lapis cho Limit Break, Magi Fragment. Gacha rút ngắn đường *có đồ*, không rút ngắn
đường *mạnh lên*.

### 13.3 **Lõi Rồng** — trùng gacha thành nguyên liệu không cày được

Quay trúng món **đã có** thì đổi thành **Lõi Rồng**: trùng hạng B ra 1, A ra 2, S ra 5, SS ra 12.

Lõi Rồng là thứ **duy nhất** mở được **Tiến hoá** — bậc nâng cấp cao nhất, và chỉ đồ hạng S/SS mới
tiến hoá được. Nó **không rơi ở bất kỳ ải nào**, không có trong bảng rơi của tộc quái nào, không
nằm trong điểm khai thác, không bán ở tiệm Pikke, rã đồ cũng không ra. Đường duy nhất là quay
trúng đồ trùng.

**Vì sao phải chặt như vậy:** nếu trùng chỉ đổi ra Lapis (thứ cày được) thì quay trùng chẳng khác
gì đi cày một lúc, và cú quay mất hết ý nghĩa. Cho nó gánh một bậc nâng cấp mà **đi cày không bao
giờ với tới**, thì mọi lần quay đều là tiến bộ thật — kể cả lần ra món đã có. Đây cũng là lý do
bậc Tiến hoá bị khoá ở hạng S/SS: nếu đồ hạng B cũng tiến hoá được thì Lõi Rồng tiêu hết vào đồ
vứt đi.

Cả `test/dragonproj-suite.js` lẫn `test/dragonproj-uicrawl.js` đều có một phép kiểm quét toàn bộ
bảng rơi (tộc quái, điểm khai thác, tiệm, drop của Behemoth) để chốt rằng `dragon_core` không lọt
vào bảng nào — luật này phải làm hỏng test nếu ai đó lỡ tay thêm nó vào.

### 13.4 Đi **một mình**

**Bản gốc:** 1–4 người thật, có hồi sinh đồng đội.

**Bản này:** không có người khác, và cũng **không có NPC đồng đội**. Bù lại người chơi có sẵn
**3 lượt tự đứng dậy** (4 giây mỗi lượt) và vẫn hồi sinh bằng Gem được. Hết lượt là thua ải.

**Vì sao:** bản dựng thử đầu tiên có 3 NPC chạy AI cho giống đội hình 4 người. Kết quả là NPC dọn
sạch quái trước khi người chơi kịp tới, và trận boss biến thành đứng nhìn. Punicon là một hệ điều
khiển đòi *chính tay người chơi* đọc đòn và bấm đúng nhịp — có ai đó đánh hộ thì toàn bộ ngữ pháp
đó thành thừa. Một mình thì mọi đòn trên sân đều là đòn của mình.

### 13.5 Vé lấy bằng **Medal**, không lấy bằng đồng hồ thật

**Bản gốc:** vé quay đến từ nhiệm vụ ngày/tuần và từ tiệm Pikke — mà Pikke cũng chỉ có từ nhiệm
vụ ngày/tuần. Tức toàn bộ đường vào gacha đi qua **đồng hồ thật**: hết lượt hôm nay thì chờ mai.
Đó là cách một game dịch vụ giữ người chơi quay lại mỗi ngày, và cũng là chỗ họ bán vé.

**Bản này:** giữ nguyên đường Pikke đó, nhưng mở thêm một quầy **Medal** ở tiệm. Medal rơi ra
**mỗi lần phá ải**, càng trùm cao càng nhiều (B 2 · A 5 · S 12 · SS 30), và cày lại ải đã phá
vẫn ăn. Giá neo theo một lần quay: **5 vé = 15 Medal**, đúng bằng ba ải hạng B hoặc một ải hạng S;
gói 10+1 (50 vé) 130 Medal.

**Vì sao:** game này chơi offline, một mình, không bán gì cho ai. Chặn người chơi bằng đồng hồ
thì không đổi lấy được thứ gì — chỉ làm họ ngồi không. Cho vé chảy ra từ **việc chơi** thì cày ải
khó trở nên đáng, và cái vòng lặp "đánh ải → quay đồ → nâng cấp → đánh ải khó hơn" khép lại được
mà không cần chờ ai.

Đây cũng là chỗ sửa một lỗi: trước đó Medal **được cộng nhưng không tiêu được ở đâu cả** — một
con số đếm lên trong màn Khác rồi thôi. Nó vốn là thứ quy đổi boss trùng của hệ gacha-ra-boss ở
mục 13.2; bỏ hệ đó đi thì Medal thành mồ côi.

Quầy Medal **không bán Lõi Rồng**, và test quét cả `SHOP` lẫn `MEDAL_SHOP` để chốt điều đó. Lõi
Rồng phải giữ đúng lời hứa ở mục 13.3: chỉ có từ quay trúng đồ trùng, không cày được, không mua
được. Hở một đường mua là bậc Tiến hoá mất hết ý nghĩa.

### 13.6 Menu vẽ to hơn sân đấu

Sân đấu buộc phải là 540×960 vì toàn bộ HUD và toạ độ Punicon neo theo đó. Trên điện thoại rộng
430px thì cả sân bị thu còn 0,8 lần — chữ 11px trong menu hiện ra 8,8px, phải nheo mắt mới đọc
được.

Nên lớp menu (`#screens` và bảng kết quả) vẽ trong một khung hẹp hơn — `540 / --ui` với
`--ui: 1.26` — rồi phóng to lại cho vừa sân. Mọi thứ trong menu to hơn 26% mà không phải đi sửa
từng con số `font-size` nằm rải rác trong CSS lẫn trong chuỗi HTML của `js/ui.js`, và **sân đấu
không suy suyển một pixel nào**. 0,8 × 1,26 ≈ 1,0 — chữ trong menu hiện ra gần đúng bằng số px
đã ghi, trên đúng cái máy mà game này để chơi.

---

---

## 14. Dựng lại phần đánh nhau cho ra chất **hack and slash**

Bản đầu có đủ mọi thứ *trên giấy* — năm vũ khí, sáu tộc quái, 56 Behemoth — mà chém vẫn không đã
tay. Chẩn đoán ra ba chỗ, và cả ba đều không nằm ở con số sát thương:

1. **Đánh trúng chẳng khác gì đánh hụt.** Trừ máu, hiện con số, hết. Không khựng, không văng,
   không loạng choạng.
2. **Quái không có gì để đọc.** Mọi con làm đúng một việc: đi thẳng vào mặt, chạm, trừ máu.
   Không báo trước thì không có gì để né, mà không né được thì không có nhịp.
3. **Sân quá rộng.** 1300×1600 với 9 con, phần lớn thời gian là đi bộ đi tìm quái.

### 14.1 Hitstop — thứ phải làm trước tiên

> *"Hitstop helps convey the strength, weight, and effectiveness of your hits… gives the eyes a
> few frames to register and confirm it happened"* — Celia Wagar, CritPoints

Khi đòn chạm thì **đóng băng cả hai bên** vài khung hình. Cái khựng đó là thứ nói cho người chơi
biết thứ họ đang chém **có sức cản**. Sakurai (Famitsu vol.490) gọi đây là nền của mọi cảm giác
"nặng tay"; Dark Souls 2 bị chê nhẹ đòn cũng vì thiếu nó.

Bảng dùng ở đây (ms, 60fps): nhẹ 50 · vừa 85 · nặng 145 · kết liễu 190 · hất tung 170. Trần 240ms
để chém trúng bảy con một lúc không thành đứng hình.

Ba điều phải giữ đúng, nếu không hitstop biến từ "đã tay" thành "lag":
- **Có trần.** Không cộng dồn.
- **Không nuốt input.** Tap trong lúc đóng băng vẫn vào hàng đợi. Đây không phải chi tiết phụ:
  Street Fighter 2 dùng đúng 10 khung hitstop để **nới cửa sổ hủy từ 5 lên 15 khung** — cái khựng
  vừa để sướng tay vừa để dễ bấm nối.
- **FX vẫn chạy.** Chỉ nhân vật và quái đứng; loé sáng, số bay lên, rung màn hình thì không.

### 14.2 Quái biết văng, biết loạng choạng, biết bay lên

- **Văng (knockback).** Mỗi đòn có lực văng riêng, tắt dần theo hệ số 0,86 mỗi khung. Đại Kiếm
  văng gấp bốn Song Kiếm — đó mới là chỗ phân biệt hai cây, chứ không phải con số sát thương.
- **Lì đòn (poise).** Con nào cũng có một thanh lì đòn. Đục hết thì **VỠ THẾ**: đứng chết trân
  0,9 giây. Đây là nhịp mà một game chặt chém sống nhờ — dồn đòn cho vỡ rồi xả đòn nặng vào. Con
  Fungo có poise 110 (gấp bốn con Jelly) nên nó là con dạy người chơi để ý thanh này.
- **Hất tung (launch).** Mượn thẳng từ Devil May Cry:

  > *"A launcher is any move in the game that tosses an enemy in the air, essentially neutralizing
  > their ability to attack and allowing you to attack until your heart's content"* — DMC3 Battle
  > Mechanics FAQ

  Game nhìn từ trên xuống không có nút nhảy, nên "trên không" ở đây là **độ cao + bóng co lại**.
  Quái đang lơ lửng thì không đánh trả được và **ăn thêm 40% sát thương** — phần thưởng cho việc
  giữ được nhịp. Trọng lực đặt sao cho một cú hất kéo dài ~0,9 giây, đủ để nối thêm hai ba nhát.

### 14.3 Mỗi cây vũ khí một BỘ ĐÒN, không phải một hệ số nhân

Trước đây `combo: [1.0, 1.0, 1.15, 1.45]` — bốn nhát y hệt nhau. Giờ mỗi nhát là một đòn riêng có
tầm, góc quét, thời gian, lực văng, độ khựng, lực phá poise của nó. Ba đường ra đòn, **tất cả vẫn
chỉ một ngón** đúng luật Punicon:

| Cách bấm | Ra gì |
|---|---|
| Tap liên tục | Đi hết chuỗi (3–6 nhát tuỳ cây), nhát cuối nặng nhất |
| **Ngưng 0,2s rồi mới tap** | Rẽ sang **ĐÒN NẶNG** — cửa sổ 0,26 giây, có vòng vàng dưới chân báo |
| Vẩy né rồi tap khi đang lăn | **ĐÒN LƯỚT**, mỗi cây một kiểu |

Nhánh "ngưng rồi mới tap" chính là thứ Monster Hunter dùng để phân biệt người quen tay với người
bấm loạn: *"really good longsword users understand instinctively how many frames they can wait
after the animation for one move ends before they can no longer initiate the next move."*

**Huỷ đuôi khi đã trúng.** Đòn chạm được thì cho nối sớm từ 62% thời gian; đòn **hụt** thì phải
chịu hết đuôi. Luật này thưởng cho việc đánh trúng và phạt việc bấm loạn — cùng một cây vũ khí mà
người quen tay chạy mượt hơn hẳn.

**Cam kết (commitment)** là chỗ phân biệt các cây, đúng như Monster Hunter: Song Kiếm 130ms một
nhát, huỷ lúc nào cũng được; Đại Kiếm 540–700ms, vung là phải chịu hết. *"The dual blades do away
with a lot of the restrictive slowness that Monster Hunter combat usually has."*

Cả năm cây **phát sẵn từ đầu**, ba khe đều có đồ. Bắt cày mấy tiếng mới được thử cây thứ hai thì
người chơi chẳng bao giờ biết game có gì.

### 14.4 Sáu lối đánh của quái, và ai cũng phải BÁO TRƯỚC

Con nào cũng chạy chung một khung: `idle → tell (báo trước) → act (ra đòn) → rest (hở)`. Cái
quan trọng không phải con quái làm gì, mà là **nó có báo trước không** — có báo thì mới có gì để
đọc, có đọc thì né mới là kỹ năng chứ không phải may rủi. Và `rest` là **cửa sổ phạt**: chỗ để
dồn đòn.

| Tộc | Lối đánh | Nét riêng |
|---|---|---|
| Purun | swarm | Đông, yếu, bâu vào. Có để mà chém cho đã |
| Vacca | charger | Vạch đỏ 0,8s rồi **húc thẳng** — né sang ngang. Húc xong đơ 0,9s |
| Geguri | hopper | **Nhảy vòng cung**, đang bay không đổi hướng được. Chạm đất nổ một vòng |
| Bat | flyer | **Lượn vòng** ngoài tầm rồi bổ nhào — canh đúng nhịp bổ mà chém |
| Galena | ranged | Giữ khoảng cách, **nhả ba viên**. Bắt người chơi phải xông vào |
| Fungo | tank | Chậm, **poise gấp bốn**, phải đục vỡ mới đánh vào được tử tế |

Behemoth cũng **nổi điên dưới nửa máu**: mở thêm bài và ra đòn dồn hơn 40%. Ba con trùm đầu game
được nới từ 3 lên 5–6 bài — 3 bài thì đánh hai lượt là thuộc lòng.

### 14.5 Sân chật lại

820×1080 thay cho 1300×1600, và 11–16 con thay cho 9. Lúc nào cũng có thứ trong tầm với, và cú
quét vòng 360° của Thương hay Đại Kiếm mới có nghĩa lý. Biển tên chỉ hiện cho con trong tầm với
hoặc con elite — sân chật mà con nào cũng đeo biển thì chữ chồng lên nhau, che mất chính cái đang
cần nhìn là vùng đỏ và xác quái.

### 14.6 Hai ý mượn của **Sephiria**

Sephiria (roguelike hành động, 6 loại vũ khí: Sword & Shield · Greatsword · Dagger · Katana ·
Crossbow · Staff) có hai nét thiết kế đáng lấy, và cả hai đều lấp đúng một lỗ của bản này:

**1. Đánh ra được TỪ THẾ ĐỠ.** Wiki Sephiria mô tả Sword & Shield: *"Hold Guard toward the
cursor to stop frontal damage. Attack during Guard to use the broad Cleave special."* Trước đây
ở bản này, đang đỡ mà bấm là HUỶ thế đỡ rồi mới đánh — tức thế đỡ chỉ biết đứng chịu, không có
đường ra đòn nào của riêng nó. Giờ bấm trong lúc đỡ ra **Chém Khiên**: quét rộng 2,4 rad, lực
văng 28, phá 38 poise.

**2. Phòng thủ thành công MỞ RA thứ gì đó.** Sephiria cho Dagger: *"Parry attacks around the
rabbit while briefly preventing damage. A successful defense enables the powerful Fury
follow-up."* Ở đây đỡ chuẩn vốn chỉ giảm 90% sát thương rồi thôi. Giờ nó mở thêm cửa sổ
**2,2 giây tay nhanh hơn 40%** — người chơi tự chọn xả cửa sổ đó bằng đòn gì, thay vì bị ép vào
một đòn định sẵn.

**Không lấy asset.** Không dùng một file ảnh, hiệu ứng hay animation nào của Sephiria — cùng một
luật đã áp cho Dragon Project ở mục 12: thứ lấy về là **dữ liệu thiết kế**, còn mọi thứ trên màn
hình vẫn vẽ bằng code. Wiki Sephiria phần lớn là trang SEO, không công bố hệ số hay số khung
hình, nên phần lấy được cũng chỉ tới mức ý cơ chế.

### Nguồn của mục này

- https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/ (hitstop)
- https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/
- https://www.ssbwiki.com/Hitlag
- https://gamefaqs.gamespot.com/ps2/930014-devil-may-cry-3-special-edition/faqs/40790 (launcher, juggle, cancel)
- https://intothebluesky.com/2021/03/20/devil-may-cry-files-04-dmc3-launchers/
- https://azhdarchid.com/monster-hunter-combat-landscape/ (bản sắc từng vũ khí)
- https://gist.github.com/fguillen/e4d4b066621910d8d77174a96ea2ca99 (danh sách "juiciness")
- https://sephiria.net/weapons/ và https://sephiriawiki.vercel.app/guides/weapons-guide (Sephiria)

---

## Nguồn

- https://dragonproject.fandom.com/wiki/Basic_gameplay
- https://dragonproject.fandom.com/wiki/How_to_Play_Guide_for_Dragon_Project
- https://dragonproject.fandom.com/wiki/Weapon (+ 5 trang vũ khí)
- https://dragonproject.fandom.com/wiki/Magi (+ Attack/Support/Recovery/Passive Magi)
- https://dragonproject.fandom.com/wiki/Monster (+ SS/S/A/B Behemoths, Small monsters)
- https://dragonproject.fandom.com/wiki/Equipment · /Material · /Map · /Story_Quests · /Recurrent_Quests · /Event_Quests
- https://www.4gamer.net/games/336/G033666/20160617066/
- https://gamewith.jp/shironeko/article/show/187071 (đổi thao tác 19/02/2020 — luật hướng nhìn)
- https://weekly.ascii.jp/elem/000/002/624/2624413/ (週刊アスキー về ぷにコン)
- https://app.famitsu.com/20160603_736272/
