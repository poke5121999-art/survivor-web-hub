# CORE KEEPER — Hồ sơ nghiên cứu thiết kế (tiếng Việt)

> Mục đích: bóc tách cơ chế của **Core Keeper** (Pugstorm / Fireshine Games, sandbox đào hầm 2D top-down)
> để dựng lại một game 2D **mobile màn hình dọc**.
>
> **Quy ước nhãn**
> - `[NGUỒN]` = số liệu/mô tả lấy trực tiếp từ wiki hoặc trang chính thức, có URL ngay tại chỗ.
> - `[ĐỀ XUẤT]` = suy luận của người viết, **không phải số liệu chính thức**.
> - "không tra được" = wiki không đăng, **không bịa số**.
>
> **Ghi chú về nguồn (quan trọng)**
> - `corekeeper.wiki.gg` bản tiếng Anh **đã rỗng** (mọi trang trả "There is currently no text in this page"), domain gốc redirect sang bản tiếng Trung.
> - `corekeeper.atma.gg` (bản kế nhiệm của wiki.gg) **bị Cloudflare chặn 403**, không truy cập được bằng công cụ tự động.
> - ⇒ Toàn bộ số liệu dưới đây lấy từ **core-keeper.fandom.com** (wiki cộng đồng, CC-BY-SA) + **Steam store page**.
> - Phiên bản tham chiếu: các trang wiki phản ánh nhánh **1.1.x / 1.2.x** (đã có Breaker's Reach, Nimruza, Explosives skill).

Steam (thể loại, số người chơi, ngày phát hành, tag "Pixel Graphics"):
`[NGUỒN]` https://store.steampowered.com/app/1621690/Core_Keeper/ — Action/Adventure/Indie/RPG/Simulation, 1–8 người co-op drop-in/drop-out, Early Access 08/03/2022, bản 1.0 ra 27/08/2024.

---

## 1. Sinh thế giới (World Generation)

### 1.1. Bố cục tổng thể — vòng tròn đồng tâm quanh The Core

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Biomes , https://core-keeper.fandom.com/wiki/World , https://core-keeper.fandom.com/wiki/Map

- **The Core luôn ở chính giữa thế giới** và luôn là điểm spawn mặc định. Trên bản đồ, biểu tượng The Core "always at the center of the world". `[NGUỒN]` https://core-keeper.fandom.com/wiki/Map
- Scene `Core Chamber` sinh **"Exactly 0 tiles from The Core"**, chứa The Core ở giữa cùng 3 tượng boss: **Glurch Statue, Ghorm Statue, Malugaz Statue**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Scenes
- Các biome xếp thành **vòng (ring) đồng tâm**, càng ra ngoài càng khó. Vị trí góc (hướng) của từng biome **random theo seed**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Biomes
- **Ranh giới biome là một rãnh/hào (trench)** phải vượt qua mới sang biome khác. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Biomes
- **Pit (hố) làm ranh giới vật lý**: "a large circular pit can be found surrounding the inner three biomes… Three long outstretched pits can also be found reaching out from the large circular pit to separate between the three outer biomes." `[NGUỒN]` https://core-keeper.fandom.com/wiki/Pit
- **Great Wall**: tường bất hoại chia vòng trong với vòng ngoài; chỉ mở được sau khi kích hoạt lại The Core rồi bấm Interact lên tường. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Great_Wall
- Từ bản **1.0.0.1**: thế giới **không còn vô hạn**, mọi biome đều có giới hạn ngoài; thế giới sinh theo **seed**; "world layout has been improved with more structured tunnels, rivers and chasms". `[NGUỒN]` https://core-keeper.fandom.com/wiki/World

### 1.2. Bán kính thực đo (theo khoảng cách sinh của dungeon/scene cố định)

Wiki **không đăng bán kính biên của từng biome**, nhưng đăng **khoảng cách cố định** của các dungeon/scene — đây là thước đo tin cậy nhất về "vòng".
`[NGUỒN]` https://core-keeper.fandom.com/wiki/Dungeons (bảng "Unique dungeons") và https://core-keeper.fandom.com/wiki/Scenes

| Khoảng cách (ô) | Cấu trúc | Biome |
|---|---|---|
| 0 | Core Chamber | Undergrounds |
| ~65 | Arena Glurch (SlimeBoss) | Undergrounds |
| 190–210 | Đường tuần của **Ghorm the Devourer** | Clay Caves / Forgotten Ruins |
| ~230 | Rune spawn của Ghorm | Clay Caves |
| ~270 | scene Forgotten Ruins | Forgotten Ruins |
| ~300 | ShamanBossRoom (Malugaz) | Forgotten Ruins |
| ~330 | Main Larva Hive (Hive Mother) | Larva Hive |
| ~500 | Fishing Merchant house · DesertMazeDungeonPrince | Azeos' Wilderness / Desert |
| ~550 | BirdBoss (Azeos) · Large Forlorn Metropolis #1 | Azeos' Wilderness / Sunken Sea |
| ~600 | Ivy · Ra-Akar · DesertMazeDungeonQueen | Azeos' / Desert |
| ~650 | Omoroth · Igneous · Ancient Forge · Metropolis #2 | Sunken Sea / Molten Quarry |
| ~700 | Morpha · Main Mold Dungeon · Crystal Meteorite · Maze King | Sunken Sea / Azeos' / Desert |
| ~750 | Large Forlorn Metropolis #3 | Sunken Sea |
| 1240–1280 | **Urschleim** (đi vòng quanh The Passage) | The Passage |

`[ĐỀ XUẤT]` Từ bảng trên có thể mô hình hoá: **vòng 1 ≈ 0–150 ô (Undergrounds); vòng 2 ≈ 150–350 ô (Clay Caves + Forgotten Ruins, mỗi cái chiếm nửa vòng, nằm đối diện nhau qua tâm); vòng 3 ≈ 500–800 ô (Azeos' / Sunken Sea / Desert, mỗi cái ~1/3 vòng); vòng 4 = Shimmering Frontier; vòng 5 ≈ 1200+ ô (The Passage); ngoài cùng Breaker's Reach (phía Bắc).** Việc Clay Caves và Forgotten Ruins đối diện nhau là `[NGUỒN]`: "Spawns on the opposite side of the map from The Forgotten Ruins" — https://core-keeper.fandom.com/wiki/Biomes

### 1.3. Danh sách biome & sub-biome

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Biomes

| Biome | Vòng | Block chính | Quặng | Boss |
|---|---|---|---|---|
| **The Undergrounds** (Dirt Biome) | 1 (tâm) | Dirt Block, Turf, Sand, Ground Slime | Copper Ore | Glurch |
| **The Clay Caves** | 2 | Clay Block, Larva Hive Block, Chrysalis, Hive Spike Trap, Ground Acid Slime | Tin Ore | Ghorm, Hive Mother |
| **The Forgotten Ruins** | 2 (đối diện Clay Caves) | Stone Block, Sand | Iron Ore | Malugaz |
| **Azeos' Wilderness** | 3 | Grass Block, Lush Moss, Lush Tree, Tall Grass, Bush | Scarlet Ore | Azeos, Ivy, Druidra |
| **The Sunken Sea** | 3 | Beach Block, Ground Slippery Slime, Kelp Tree | Octarine Ore | Omoroth, Morpha, Crydra, Atlantean Worm |
| **The Desert of Beginnings** | 3 | Desert Block, Plume Tree, Valley Moss, Temple Pillar | Galaxite Ore | Ra-Akar, Igneous, Pyrdra, Core Commander, Nimruza |
| **The Shimmering Frontier** | 4 | Crystal Block, Crystal Crust, Alien Tech Floor/Wall, Sun Crystal, Gleam Wood | Solarite Ore | (không boss; có Alien arena) |
| **The Passage** | 5 | Fossil Block, Sulfur Tree, Pandorium Crystal, Feather Tree | Pandorium | Urschleim |
| **Breaker's Reach** | ngoài cùng (Bắc) | Tuff Block | — | S.A.H.A.B.A.R, Oblidra |

Sub-biome: **The Meadow** (Meadow Block — **biome duy nhất không có quái**), **The Larva Hive**, **The Mold Dungeon**, **Forlorn Metropolis**, **The Molten Quarry** (Lava Rock Block, đầy smoldering chest), **The Oasis** (3 biến thể thường + 1 biến thể dungeon chứa Nimruza).

### 1.4. "Corridor" và "phòng" sinh ra sao — hệ Dungeon / Scene / Territory

Core Keeper dùng **3 hệ thống chồng lên nhau**. Đây là điểm quan trọng nhất để bắt chước.

| Hệ | Bản chất | Quy tắc |
|---|---|---|
| **Dungeon** | **Procedural**: nhiều phòng nối bằng đường (path). Game dùng chính hệ này để sinh **cả sub-biome lẫn nhà nhỏ** ("structures that players would not traditionally consider dungeons"). | Mỗi dungeon có **weight** quyết định xác suất sinh so với dungeon khác cùng biome. **Dungeon luôn sinh TRƯỚC scene**; scene không có khoảng cách cố định **không được sinh vào chunk đã bị dungeon chiếm**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Dungeons |
| **Scene** | **Prefab tay**: thiết kế cố định, giống hệt ở mọi world, chỉ **lật ngang/dọc ngẫu nhiên**. | Mỗi scene có giới hạn "Maximum N per world" và/hoặc "Approximately X tiles from The Core". `[NGUỒN]` https://core-keeper.fandom.com/wiki/Scenes |
| **Territory** | Vùng **đã spawn sẵn nhiều quái + ô sinh quái (spawning tile)**. | **Bán kính 25–40 ô**. 4 loại: Slime / Larva / Caveling / Wilderness caveling. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Territory |

**Bảng weight dungeon (số liệu thật, copy được thẳng):** `[NGUỒN]` https://core-keeper.fandom.com/wiki/Dungeons

| Biome | Dungeon (weight) |
|---|---|
| Undergrounds | Slime area 0.45 · Meadow 0.55 |
| Clay Caves | Bridge area 0.08 · Railway area 0.1 · Wood house 0.1 · ClayCavelingArea 0.15 · SmallLarvaHiveDungeon 0.22 |
| Forgotten Ruins | StoneBridgeArea 0.1 · RailwayRoom 0.15 · WoodRoom 0.15 · CavelingRuins 0.25 |
| Azeos' Wilderness | NatureCavelingArea 0.1 · NatureTemple 0.1 · CustomFarm 0.11 · MeadowAreaBig 0.12 · MoldDungeon0 0.25 |
| Sunken Sea | CityDungeon 0.2 · SeaIslands 0.2 · SeaWallsWithChest 0.2 · CoralReef 0.2 |
| Desert | DesertBridgeArea 0.1 · DesertRuins 0.25 · OasisArea 0.15 · DesertTempleDungeon 0.07 · DesertTempleDungeon2 0.07 · LavaDungeon 0.18 |
| Shimmering Frontier | CrystalAreaWithCustomScenes 0.15 · CrystalForest 0.07 · AlienStructure 0.15 · AlienStructureEventTerminals 0.2 |
| Passage | PassageOreField 0.15 · FeatherTreeForest 0.15 · SulfurForest 0.15 · HydraCultDungeon 0.2 |

Lịch sử thuật toán: **0.7.5-580c** "viết lại hoàn toàn thuật toán đặt đường nối các phòng"; **1.0.1.11** sửa lỗi entry point của dungeon chồng lên nhau; **1.0.1.0** tăng độ ngẫu nhiên vị trí unique dungeon (trước đó vùng slime của Glurch **luôn** nằm Tây Nam The Core). `[NGUỒN]` https://core-keeper.fandom.com/wiki/Dungeons

### 1.5. Tuỳ chọn world gen — chính là danh sách "tham số bộ sinh"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/World

| Tham số | Mô tả (theo wiki) |
|---|---|
| **Biome chaos** | mức các biome trong cùng ring chồng lấn / lồng vào nhau |
| **Ore density** | mật độ quặng và **ore boulder** |
| **Tunnels** | tần suất và độ vươn xa của **mạng đường hầm** |
| **Chambers** | số lượng và kích thước các **khoang hang rỗng** |
| **Rivers** | tần suất và độ phức tạp của **hệ thống sông** |
| **Lakes** | số lượng và kích thước **hồ** |
| **Pits** | tần suất và kích thước **hố** |
| **Ceiling holes** | tần suất **roof light** (lỗ trần) |

⇒ Pipeline suy ra: **nền đặc → khoét tunnel + chamber → đào river/lake/pit → rắc ore → đặt dungeon → đặt scene → đặt territory → đục ceiling hole**. `[ĐỀ XUẤT]` (riêng "dungeon trước scene" là `[NGUỒN]` https://core-keeper.fandom.com/wiki/Dungeons).

**Content bundle** — cơ chế "vá thêm world gen vào world cũ", **được phép ghi đè vùng đã khám phá**: Queen of the Burrowed Sands, The Queen's Offspring, Guaranteed Oases, Abiotic Factor Collab. `[NGUỒN]` https://core-keeper.fandom.com/wiki/World

### 1.6. Tỉ lệ tường / nền / hang rỗng

**Không tra được** con số % chính thức. Wiki chỉ mô tả định tính, và người chơi tự chỉnh bằng 2 tham số **Tunnels** và **Chambers**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/World

`[ĐỀ XUẤT]` Cảm giác chơi thật: vùng quanh The Core gần như **toàn đặc, chỉ vài hành lang hẹp**; ba biome vòng ngoài rỗng hơn hẳn (nhiều roof light, sông, hồ, đảo).

### 1.7. Quặng — cách vỉa mọc

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Ore

- Quặng **nhúng bên trong block tường** của biome tương ứng, nhận ra bằng **đốm trắng lấp lánh (white sparkles)** trên phần màn hình tối.
- **Ore boulder**: khối quặng riêng, hiếm, **chứa 1.800 đơn vị quặng** cùng loại.
- Quặng cũng xuất hiện trong **Sand Block nằm gần** loại block đặc trưng của nó.

| Quặng | Nằm trong block |
|---|---|
| Copper Ore | Dirt Block |
| Tin Ore | Clay Block |
| Iron Ore | Stone Block |
| Scarlet Ore | Grass Block |
| Octarine Ore | Beach Block |
| Galaxite Ore | Desert Block |
| Solarite Ore | Crystal Block |
| **Gold Ore** | bất kỳ block nào, hiếm |
| **Ancient Gemstone** | bất kỳ block nào, hiếm — không có ore boulder, không nấu ra bar |
| Pandorium Ore | **không nhúng trong block**; chủ yếu rơi từ **Pandorium Crystal** |

**Kích thước cụm vỉa (bao nhiêu ô/cụm): KHÔNG TRA ĐƯỢC.** Wiki không đăng. Chỉ biết có tham số **Ore density** lúc tạo world.

Item liên quan: **Core Iris** cho `+10–12 tiles visible ore distance` ⇒ game **có bán kính "nhìn xuyên tường thấy quặng" tính bằng ô**, và **Meticulous miner** (+3–15%) cho cơ hội nhận thêm quặng. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Mining

---

## 2. Tile & Đào

### 2.1. Mô hình dữ liệu tile — "một item, hai dạng"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Blocks

- Mỗi **Block** có **hai dạng: tường (wall) và nền (ground)**. Đặt block lên **pit/chất lỏng** → thành **nền**; đặt lên **nền** → thành **tường**. Đó là toàn bộ cơ chế xây/lấp.
- **Tường** có 2 chỉ số: `Wall health` + `Damage reduction`. **Nền** chỉ có `Ground health`, và phải dùng **xẻng** (chỉ số **digging damage**, *khác* mining damage).
- Luật chặn cứng: **mining damage ≤ damage reduction ⇒ gây 0 damage**, hiện "I need higher mining damage" / "My mining damage is too low". (Trước 0.6.0.0 tường vẫn ăn tối thiểu 1 damage; từ 0.6.0.0 là **0**.)
- **1 XP Mining** mỗi lần đánh trúng tường và gây **≥ 12 damage**.
- Từ **0.6.0.0**: hai tường khác loại nằm cạnh nhau **có viền phân cách** thay vì liền mạch.

### 2.2. BẢNG ĐỘ CỨNG TILE (số liệu gốc — dùng thẳng để cân bằng)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Blocks

| Block | Wall HP | Damage reduction (ngưỡng cuốc) | Ground HP |
|---|---|---|---|
| Sand Block | 8 | 1 | 10 |
| Snow Block | 8 | 1 | 10 |
| **Dirt Block** | **135** | **1** | 60 |
| Meadow Block | 150 | 1 | 60 |
| Turf Block | 150 | 1 | 60 |
| **Clay Block** | **179** | **22** | 120 |
| Dark Stone Block | 300 | 55 | 180 |
| **Stone Block** | **300** | **55** | 180 |
| **Larva Hive Block** | **445** | **244** | 120 |
| **Grass Block** | **550** | **135** | 180 |
| **Beach Block** | **700** | **242** | 240 |
| **Mold Block** | **706** | **660** | 180 |
| **Desert Block** | **850** | **355** | 400 |
| Oasis Block | 850 | **1279** | 400 |
| Metropolis Block | 892 | **1050** | 240 |
| Alien Tech Block | 950 | 535 | 60 |
| **Crystal Block** | **950** | **535** | 560 |
| Desert Temple Block | 988 | 767 | 400 |
| Maze Block | 988 | 895 | 400 |
| **Lava Rock Block** | **1086** | **1224** | 400 |
| **Fossil Block** | **1415** | **1600** | 720 |
| **Obsidian Block** | 1812 | **Bất hoại (Unbreakable)** | 60 |

Tường chế tạo — `[NGUỒN]` https://core-keeper.fandom.com/wiki/Walls :
Glass / Thin Glass Wall **1 HP** · Wood / Eerie / Paintable / Straw-bale Wall **150 HP (DR 1)** · Stone Bricks Wall **300 (DR 55)** · Scarlet Wall **550 (DR 135)** · Coral Wall **700 (DR 242)** · Galaxite Wall **850 (DR 355)** · Gleam Wood Wall **950 (DR 535)**.
Tường bẫy: **Thermite Wall 287 HP** (nổ), **Explosives Deposit 287 HP** ("đánh vào là nổ ngay mặt"), **Molten Wall 988 HP** (nổ diện rộng), **Poison Berry Wall 617 HP** (nổ hình chữ thập độc).

> **Đối chiếu brief**: từ bản 0.7.3-3c7e wiki **gộp hầu hết "natural wall" vào khái niệm "block"**. Nên "dirt wall / stone wall / clay / larva / obsidian" trong brief chính là các *Block* ở bảng trên. **"Ore vein" không phải tile riêng** — nó là quặng **nhúng trong block**, phá block ra thì rơi quặng.

### 2.3. Tốc độ đào phụ thuộc gì

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Mining

Hai chỉ số tách bạch:
1. **Mining damage** — quyết định **có phá nổi không** và **mấy nhát**.
2. **Mining speed %** — quyết định **vung nhanh chậm**.

| Nguồn | Ví dụ | Hiệu ứng |
|---|---|---|
| Skill | **Mining** lv1→100 | +0 → **+100 mining damage** |
| Talent | Efficient excavation / **Mine, mine, mine!** | +2–10% mining damage / **+3–15% mining speed** |
| Đồ ăn (10 phút) | Cave Crunch · Grumpkin · Golden Grumpkin · **Sandy Spikeback** · **Terra Trilobite** · White Coralotl | +50 · +45 · +71 & +7.2% speed · **+206** · **+344** · **+14.8% speed** |
| Giáp | Bronze Helm · Caveling Pants · **Larva Chest** · Octarine Helm · **Miner's Worker Pants** · **Miner's Protective Helm** | +5–17% · +8–21% · **+28–135 flat** · +6–8.8% speed · **+78–131 & +8–10% speed** · **+14–18% & +4 glow** |
| Phụ kiện | Ring of Stone · **Rusted Necklace** · **Topaz Ring** · **Tower Shell Necklace** · **Core Iris** | +14–276 · **+19–37%** · **+23–41%** · **+188–253** · +62–92 & **+10–12 ô thấy quặng** |
| Set bonus | Ring of Rock + Ring of Stone | **2 set: +49 mining damage** |

**Thời gian đào (giây) của từng cuốc: không tra được** — wiki chỉ đăng `mining speed %` dưới dạng bonus, không đăng use-time gốc.

### 2.4. Đặt tile / xây tường / bắc cầu qua nước

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Blocks , https://core-keeper.fandom.com/wiki/Bridges , https://core-keeper.fandom.com/wiki/Liquids

- **Đặt block lên pit/chất lỏng ⇒ thành nền (lấp)**; đặt lên nền ⇒ thành tường. Một item, hai kết quả tuỳ mục tiêu — cực gọn về UX.
- **Bridge** là loại tile riêng, đặt **đè lên chất lỏng và pit**, **chất lỏng vẫn chảy bên dưới**. Các loại: Wood, Stone, Scarlet, Coral, Galaxite, Glass, **Gleam Wood** (phát sáng), **Metal Grate** ("dùng để bắc qua dung nham ở Molten Quarry").
- **Chất lỏng phát sáng vẫn xuyên ánh sáng qua cầu** đặt bên trên.
- Nếu **lava chạm nước dưới cầu**, lava rock ground sinh ra sẽ **thay thế luôn cây cầu**.
- Boss slime khi nhảy **lấp pit/liquid thành nền** theo biome của rune (Dirt / Grass / Beach / Lava Rock). `[NGUỒN]` https://core-keeper.fandom.com/wiki/King_Slime

**Hệ chất lỏng có thứ tự ưu tiên — số cao ghi đè số thấp:** `[NGUỒN]` https://core-keeper.fandom.com/wiki/Liquids

| # | Chất lỏng | Ghi chú |
|---|---|---|
| 1 | Normal water | Undergrounds, Forgotten Ruins, Azeos', Clay Caves, Desert |
| 2 | **Lava** | Molten Quarry — **phát sáng cam mạnh**; gặp nước → tạo **Lava Rock Ground** |
| 3 | Acid water | Larva Hive |
| 4 | Mold water | Mold Dungeon |
| 5 | **Shimmering water** | Shimmering Frontier — **phát sáng** |
| 6 | Grimy water | The Passage |
| 7 | **Sea water** | Sunken Sea — **phát sáng xanh mờ** |

Chất lỏng nhặt/mang đi được bằng **Bucket**.

---

## 3. Ánh sáng & Tầm nhìn

### 3.1. Vì sao đây là "cảm giác đặc trưng"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Light_sources

- Trivia trên wiki: **"Internally Core Keeper is a 3D game, which is how many of the advanced lighting techniques are achieved."** ⇒ nhìn là 2D top-down nhưng render bằng **đèn 3D thật**: có bóng đổ, ambient occlusion, bounce light.
- Bản **0.5.2.0-b84a**: "Completely reworked **indirect (bounce) lighting**. Light now spreads further and **takes surface color into account**, resulting in **softer, more saturated** dynamic lighting." ⇒ ánh sáng **ăn màu bề mặt** — chính là lý do hang đất cho ánh vàng ấm, hang crystal cho ánh xanh lạnh.
- Bản 0.5.2.2-a842: Lit Floor không còn chặn các nguồn phát xạ khác (như Glow Tulip).

### 3.2. Bán kính sáng — CẢNH BÁO SỐ LIỆU

> **"The lighting engine was overhauled in 0.5.2.0-b84a, making it impossible to determine the exact radius of light sources due to the addition of intensity and directionality."**
> `[NGUỒN]` https://core-keeper.fandom.com/wiki/Light_sources

⇒ **Bán kính sáng tính bằng ô: KHÔNG TRA ĐƯỢC, và chính wiki tuyên bố là không xác định được.** Đừng tin bất kỳ con số "X tiles" nào từ nguồn khác.

Cái **tra được** là chỉ số **`glow`** trên item (thang nội bộ, cao nhất quan sát thấy là **8**) và **hệ số cường độ theo trạng thái**:

| Item / trạng thái | Giá trị | Nguồn |
|---|---|---|
| **Torch — Held (cầm tay)** | màu `#ffeecc`, cường độ **×6** | https://core-keeper.fandom.com/wiki/Torch |
| **Torch — Placed (đặt đất / gắn tường)** | `#ffeecc`, **×5** | https://core-keeper.fandom.com/wiki/Torch |
| **Torch — Displayed (trong túi)** | `#ffb969`, **×2** | https://core-keeper.fandom.com/wiki/Torch |
| Small Lantern | **+3–8 glow** | https://core-keeper.fandom.com/wiki/Lanterns |
| Lantern | +4–8 glow, +9–29 max health | https://core-keeper.fandom.com/wiki/Lanterns |
| Pumpkin Lantern | +4–8 glow, +0.5–1.8 HP/giây | https://core-keeper.fandom.com/wiki/Lanterns |
| **Orb Lantern** | +5–8 glow, **+9–20% mining damage** | https://core-keeper.fandom.com/wiki/Lanterns |
| Pearl Lantern | +5–8 **blue** glow, +7–9.8% move speed, +1.6–2.6 mana/giây | https://core-keeper.fandom.com/wiki/Lanterns |
| Soul Lantern | +6–8 **blue** glow, +32.1–53.5% minion attack speed | https://core-keeper.fandom.com/wiki/Lanterns |
| Miner's Protective Helm | **+4 glow** (mũ phát sáng) | https://core-keeper.fandom.com/wiki/Mining |
| Soul Seeker (cuốc) | **+3 blue glow** | https://core-keeper.fandom.com/wiki/Pickaxes |
| Omoroth's Necklace | **+4 blue glow** | https://core-keeper.fandom.com/wiki/Mining |
| Octarine Backpack | +3–5 blue glow | https://core-keeper.fandom.com/wiki/Category:Items_providing_blue_glow |
| Nimruza (boss) | **+8 green glow** | https://core-keeper.fandom.com/wiki/Nimruza,_Queen_of_the_Burrowed_Sands |

**Có 4 màu glow riêng biệt:** trắng/cam (mặc định), **blue**, **green**, **pink** — mỗi màu là một category item riêng trên wiki. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Category:Items_providing_blue_glow

### 3.3. Nguồn sáng phân loại

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Light_sources

| Nhóm | Ví dụ |
|---|---|
| **Nguồn sáng chính** (chức năng chính là chiếu sáng) | Torch, Candle, Candle Stack, Campfire, Lamp, Crystal Lamp, Stone Lantern, Paper Lantern, Caveling Fireplace, Decorative Torch, Alien Crystal Light, **Lit Floor** |
| **Đèn đeo (ô Lantern)** | Small Lantern, Lantern, Pumpkin Lantern, Orb Lantern, Pearl Lantern, Soul Lantern |
| **Critter phát sáng** (bắt bằng Bug Net) | Yellow / Blue / Green / Red **Glowbug** |
| **Pet talent** | **Spirit Animal** |
| **Roof light** | lỗ trần tự nhiên — xem 3.4 |
| **Nguồn sáng phụ** | Vũ khí (Fireball Staff, Galaxite Sword/Dagger/Chakram, Phantom Spark, Burnzooka…), công cụ (Galaxite Pickaxe/Shovel/Fishing Rod, **Soul Seeker**, Obliteration Ray, Stormbringer), mũ (Makeshift Goggles, Pumpkin Head, King Slime Crown, Octarine Helm, Galaxite Helm, **Miner's Protective Helm**, Sulfossil Helmet), giáp/quần (Octarine Breastplate, Galaxite Torso, Magma Torso/Shin, **Ninja Leggings**), phụ kiện (**Glow Tulip Ring**, Octarine Backpack, Octarine Shield, **Omoroth's Necklace**, Crystal Meteor Chunk, Scorching Aegis), **đồ ăn cầm trên tay** (Glow Tulip, Sunrice, Lunacorn và bản Golden), chất lỏng (**sea water**, **shimmering water**) |

### 3.4. Roof light (lỗ trần) — "ánh sáng trời" trong hang

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Roof_light

- Nguồn sáng **tự nhiên sinh từ trần hang**.
- **Gần như không có ở các biome vòng trong** (trừ Meadow và vài scene hiếm). **Azeos' Wilderness, Sunken Sea, Desert of Beginnings thì có rất nhiều.** ⇒ Đây chính là **cần gạt độ tối theo tiến độ chơi**: vòng trong tối om, vòng ngoài sáng như ngoài trời.
- Người chơi **tạo/xoá được** bằng **Roofing Gadget**; đặt bất kỳ tường nào ngay dưới cũng xoá được.
- Thunder beam của Soul of Azeos và sự kiện **cave-in** tự tạo ra roof light mới.

### 3.5. Fog of war / bản đồ

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Map

- Bản đồ **chỉ hiện vùng đã đi qua**, riêng theo **từng nhân vật trong từng world**.
- Luôn có **mini-map góc trên phải**; bản đồ lớn bật bằng phím Toggle map.
- **Cartography Table** cho phép **gộp bản đồ giữa người chơi** ⇒ fog of war là dữ liệu chia sẻ được.
- Tối đa **512 marker** người chơi tự cắm (5 kiểu: crystal, dấu hỏi, đầu lâu, cờ xanh, ping); **ping tự biến mất sau 6 giây**.
- Bản đồ hiện Portal / Ancient Waypoint đang hoạt động, và **boss đã kích hoạt Scanner tương ứng**.

### 3.6. Tuỳ chọn đồ hoạ liên quan ánh sáng (nói lên chi phí render)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Settings

| Setting | Giá trị | Mặc định |
|---|---|---|
| **Brightness** | 1–10 — "controls the brightness of light sources" | 5 |
| **Bloom** | Off / Reduced / Normal | Normal |
| **Light quality** | Low / Medium / High / Very High — "quality of **shadows light sources produce**. High settings will **negatively affect performance**, especially in areas with a large amount of light sources" | **Medium** |
| **Ambient occlusion** | Low / Medium / High | High |
| **Object shadows** | Off / Simple / Advanced | Advanced |
| **Reflections** | Off / On — chất lỏng phản chiếu vật thể | On |
| **Color Output** | 24-bit / **15-bit** / **15-bit (Dither)** | 24-bit |

⇒ Ghi chú cho mobile: chính Pugstorm phải đặt **Light quality mặc định = Medium** vì nhiều nguồn sáng làm tụt FPS. Trên mobile dọc bắt buộc phải làm ánh sáng **rẻ hơn nhiều** (xem mục 11).

---

## 4. Quái thường (non-boss enemies)

`[NGUỒN]` navbox "Creatures" trên https://core-keeper.fandom.com/wiki/Bosses và trang riêng từng quái.
**Tổng 67 sinh vật thù địch, trong đó 20 là boss ⇒ 47 quái thường.**

**Quy ước bảng:** `HP` ghi **Standard / Hard / Casual**. `Damage` là **Standard** (Hard ≈ ×2, Casual ≈ ×0,5 — đúng theo bảng infobox của wiki). `Speed` ghi base / chasing / leap-charge.
Mọi số dưới đây đã được **đối chiếu trực tiếp với infobox trên fandom**.

### ⚠️ Đính chính tên biome trong brief

| Trong brief | Thực tế trong game |
|---|---|
| "Dirt Biome" | = **The Undergrounds** |
| **"The Sacred Bloom"** | **KHÔNG TỒN TẠI** trong Core Keeper (trang wiki rỗng). "Scarlet" là **quặng** ở Azeos' Wilderness, không phải biome. |
| "Ancient City" | = **Forlorn Metropolis** (sub-biome của Sunken Sea) |
| "Cave Slime" | không có tên này; các slime là Orange / Red / **Purple** / Blue / Lava / Royal |
| "Big Slime" | không có; bản to là **Big Larva / Big Hive Larva** |
| "Caveling Scholar" | có thật, nhưng ở **Forlorn Metropolis** chứ không phải Forgotten Ruins |
| "Ghost Scholar" | **KHÔNG PHẢI QUÁI** — là **đồng minh** do vũ khí **Phantom Spark** triệu hồi (20% khi giết quái), hồi 309 HP/giây, tồn tại 15 giây. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Ghost_Scholar |
| Strolly Poly / Moolin / Bambuck / Dodo / Kelple / Drohmble | là **Cattle (gia súc)**, không phải quái |

### 4.1. The Undergrounds (4 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Orange Slime** | 105 / 158 / 52 | **18−20** (leap) | Nhảy bổ. **Trung lập — chỉ đánh khi bị đánh trước** | 10 → **100 (nhảy)** | Khối gel cam 1 ô. Idle phập phồng co giãn. Đòn: **lún xuống nạp → bật vọt theo vòng cung → tiếp đất bẹt ra → nảy về hình**. Cooldown dài nên né dễ. Miễn acid + slow-by-slime |
| **Red Slime** | 150 / 225 / 75 | **27−31** (leap) | Nhảy bổ. **Hung hăng, tự lao vào** | 10 / **15 (đuổi)** / 100 | Y hệt Orange nhưng đỏ; có thêm state **chasing** (bò chậm) giữa các cú nhảy |
| **Shrooman** | 105 / 158 / 52 | **24−28** (charge) | **Húc đầu thẳng một đường, không đổi hướng**. Đâm tường ⇒ **tự choáng** | 5 → **40 (lao)** | Người nấm 1 ô, mũ nấm to. Idle lắc lư. **Có tiếng grunt trước khi lao (telegraph)**. Lao: cúi đầu, thân nghiêng trước; đập tường thì bật ngược + rung |
| **Shrooman Brute** | **540** / 810 / 270 | **53−63** (charge) · **Mining 166** | Húc đầu **phá tường Dirt/Sand/Snow/Meadow/Turf trong 1 phát**. **GIÁP: mọi damage nhận vào bị giảm còn 1 — chỉ hở 2 giây sau khi đập trúng** | 5 → **60** | Bản to có mai giáp. **Anim chính thức: Idle / Move / Charge / Charge (impact)** |

`[NGUỒN]` /wiki/Orange_Slime · /wiki/Red_Slime · /wiki/Shrooman · /wiki/Shrooman_Brute

### 4.2. The Clay Caves + Larva Hive (10 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Caveling Skirmisher** | 270 / 405 / 135 | **58−70 (RANGE)** | **Ném lao từ xa**. Đánh cả người chơi lẫn Larva | 50 / 50 | Caveling nhỏ giáp da thô. Anim: **giơ lao qua đầu → vung tay ném** |
| **Caveling Spearman** | 270 / 405 / 135 | **58−70** (melee) | **Đâm lao cận chiến**. Spawn kèm Skirmisher | 50 / 50 | Giống Skirmisher; anim **đâm thọc thẳng** |
| **Clay Burrower** | 405 / 608 / 202 | **41−49** (contact) | **Sâu nhiều đốt CHUI TRONG TƯỜNG**, chỉ trồi khi người chơi lại gần. Damage do **chạm** | 40 | Thân rắn đất sét **nhiều segment nối đuôi** (snake-follow). Uốn lượn, **chui vào/ra tường (fade + bụi)**. Miễn acid/stun/trượt/knockback |
| **Cocoon** | 270 / 405 / 135 | — | **Nở ra Larvlet khi người chơi lại gần** (kích bằng thân nhiệt) | bất động | Kén sợi trắng. Anim: **rung giật mạnh dần rồi vỡ toác** |
| **Larva** | 176 / 264 / 88 | **35−41** (melee) | Lao vào cắn. **Đào xuyên tường Dirt/Turf/Sand/Clay**. Đi bầy nhỏ | 10 → **30 (đuổi)** | Ấu trùng mập phân đốt nâu-vàng. **Bò sâu đo: thân co dồn rồi duỗi bung về trước** |
| **Big Larva** | 412 / 618 / 206 | **67−81** melee · 75−91 lên vật thể · **Mining 151** | Như Larva nhưng **CỰC GHÉT ĐUỐC — chủ động đi tìm phá Torch** và nội thất | 10 → 30 | Bản phóng to của Larva |
| **Hive Larva** | 306 / 459 / 153 | **55−67** melee | Larva bản mạnh, chỉ có trong Larva Hive | 10 → 30 | Tông màu hive sáng hơn |
| **Big Hive Larva** | **742** / 1113 / 371 | **99−121** melee · **Mining 252** | Bản mạnh của Big Larva; **ăn xuyên cả tường người chơi đặt** | 10 → 30 | — |
| **Acid Larva** | **1 / 1 / 1** | **58−70 (NỔ khi va chạm)** | **BOM SỐNG**: đứng im tới khi thấy người → lao thẳng → **nổ**, để lại **Ground Acid Slime**. **Nổ thì không rơi loot** | 10 → **60 (đuổi)** | Ấu trùng xanh acid phồng căng. **HP đúng bằng 1** |
| **Larva Hive Egg** | 1.530 / 2.295 / 765 | — | Trứng spawn trong trận **The Hive Mother** | bất động | — |

### 4.3. The Forgotten Ruins (4 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Caveling** | 510 / 765 / 255 | **92−112** melee · 92−112 lên vật thể · **Mining 198** | Chém cận chiến, đập cả vật thể | 50 / 50 | Da xám nâu thô, mũ trùm. **Anim chính thức (4 hướng): Idle, Move, Attack, Taunt, Talk, Yawn, Sleep** — **có cả NGÁP và NGỦ** khi chưa phát hiện người chơi |
| **Caveling Shaman** | 408 / 612 / 204 | melee **70−84** · **RANGE 92−112 + 13 burn** | **Bắn cầu lửa gây bỏng từ xa**, đồng thời **gọi quân làm mồi nhử** | 30 / 30 | Áo choàng rách, hình xăm phát sáng, mắt đỏ như than, **gậy gộc gắn tinh thể**. Anim: **giơ gậy → đầu gậy sáng → bắn** |
| **Caveling Brute** | **1.095** / 1.642 / 548 | **147−179** melee · **Mining 315** | Melee nặng, đuổi dai. **Rất chậm (speed 15)** | 15 / 15 | To đồ sộ nâu-xám, **giáp đá chắp vá**. **Anim chính thức: Idle, Move, Attack, Taunt, Scratch pit (bới đất), Eat** |
| **Electro-Pest** | 405 / 608 / 202 | **110−134** (leap) | **Nhảy vọt tốc độ cực cao (200)** | 20 / 20 / **200 (leap)** | Bọ điện nhỏ, tia sét quanh thân. **Telegraph: nạp điện chớp trước khi phóng** |

### 4.4. Azeos' Wilderness + Mold Dungeon (7 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Purple Slime** (trang Biomes gọi *Poison Slime*) | 870 / 1.305 / 435 | **128−156** (leap) | Nhảy bổ + **100% dính độc (giảm 75% hồi máu của mục tiêu)**. Trung lập tới khi bị đánh | 10 → 100 | Slime tím; **bay xa hơn Orange** |
| **Snare Plant** | 435 / 652 / 218 | **29−35** (contact) + **ensnare (trói/choáng)** | **BẪY CỐ ĐỊNH.** Trói người chơi rồi **rụt vòi vàng lại, VÔ HẠI 4 GIÂY** | bất động | Cây thịt bám đất, **vòi/ngòi màu vàng** thò lên. **Anim chính thức: Growing**. Chu kỳ: **mọc → chích → rụt 4s** |
| **Caveling Gardener** | 870 / 1.305 / 435 | **128−156** melee | Chém gần **+ vừa đánh vừa TRỒNG Snare Plant lên ô cỏ** | 50 / 50 | Caveling nông dân mũ rơm. **Anim chính thức: Idle, Move, Attack, PLANT** — có frame **cúi xuống gieo cây** |
| **Caveling Hunter** | 870 / 1.305 / 435 | melee **90−108** · range **128−156** | **NGỤY TRANG THÀNH BỤI CÂY**, bắn tỉa từ xa; tới gần thì chuyển melee | 30 / 30 | **Anim chính thức: Idle, Move, Attack, BUSH** — state Bush là **sprite bụi cây giả hoàn toàn** |
| **Infected Caveling** (Mold Dungeon) | 931 / 1.396 / 466 | **147−179** melee + độc 100% | Melee, **đi theo đàn lớn**. Nền Mold gây debuff "infection" nên rất khó né | 15 / 15 | Caveling nhiễm mốc trắng-xám, mọc bào tử. Miễn Mold infection |
| **Mold Tentacle** (Mold Dungeon) | 1.095 / 1.642 / 548 | **117−143** (range) | **Ném cầu mốc trắng từ xa, 100% GÂY CHOÁNG** — rất nguy hiểm | bất động | Xúc tu mốc mọc từ đất; **ngoáy vòng lấy đà rồi quăng**. **MIỄN KNOCKBACK** |
| **Floracada** (mini-boss) | **3.022** / 4.533 / 1.511 (tới **8.840** khi 8 người) | charge **204−248** · contact 204−248 · projectile **216−264** · **Mining 2.458** | **Húc siêu tốc (214,5) + bắn đạn**. **Nổi giận ở 50% HP** (thoát khi hồi 70%) | 65 → **214,5 (charging)** | Ve sầu khổng lồ có cánh, tông cây cỏ. Miễn acid/stun/trượt/phóng xạ |

### 4.5. The Shimmering Frontier (4 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Mimite** | 1.869 / 2.804 / 934 | **243−297** (charge) · **Mining 1.205** | **MIMIC**: đứng im **giả làm Sun Crystal** tới khi bị lại gần → **lao cực nhanh, phá cả block trên đường** | 5 → **80** | Tinh thể vàng — lúc giả dạng là **sprite Sun Crystal y hệt**; lộ ra thì **nứt/há miệng**. Miễn phóng xạ |
| **Orbital Turret** | 1.735 / 2.602 / 868 | **195−237** (range) | **Bắn tràng laser XUYÊN QUA MỘT LÁ CHẮN BẤT KHẢ PHÁ. Lá chắn HỞ MỘT KHE Ở PHÍA ĐỐI DIỆN hướng bắn** ⇒ phải vòng ra sau lưng | 30 / 30 | Lõi nổi lơ lửng + **vòng khiên quay có đoạn khuyết**; khe hở **di chuyển theo hướng bắn** |
| **Crystal Snail** | **3.510** · **Damage reduction 806** | **0 — KHÔNG BAO GIỜ TẤN CÔNG** | Không đánh trả kể cả khi bị đánh. **Chỉ người chơi hoặc vụ nổ mới làm tổn thương được.** **Khi nó bò, nó phá luôn tường Crystal Block và Gleam Wood Roots** | 10 | Ốc sên vỏ tinh thể bò cực chậm; có 2 sprite **"With shell" / "Without shell"**. Vỏ chỉ vỡ được bằng **mining damage** |
| **Nilipede** | 2.670 / 4.005 / 1.335 | **171−207** (contact) | **Rết nhiều đốt chui tường**, chỉ trồi khi có người gần. **Không respawn** (chỉ sinh lúc tạo thế giới, 0,2% trên nền Crystal Block) | **70** | Cùng cơ chế segment như Clay Burrower, tông tinh thể, **nhanh gấp đôi**. Miễn acid/stun/trượt/phóng xạ |

### 4.6. The Sunken Sea (3 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Blue Slime** | 1.350 / 2.025 / 675 | **166−202** (leap) | Nhảy **nhanh và xa hơn hẳn mọi slime đời trước**, gây **trượt chân 6 giây**. Trung lập tới khi bị đánh | 10 → 100 | Slime xanh dương trong |
| **Tentacle** | 945 / 1.418 / 472 | **166−202 (RANGE)** | **Ném đạn SỨA từ xa**, damage rất cao. Sinh trên **sea water**, **nhiều hơn hẳn khi sát mép bờ** (1% cạnh bờ vs 0,01% giữa biển) | bất động | Xúc tu biển mọc từ đáy, **quăng theo vòng cung**. Cũng có ở Forlorn Metropolis |
| **Bubble Crab** | 1.350 / 2.025 / 675 | **149−181** (range) | **Phun luồng bong bóng TOẢ VÒNG QUANH THÂN** — gây trượt 6s, **bong bóng lơ lửng một lúc rồi mới nổ**. **KHÔNG có đòn cận chiến riêng** | 30 / 36 | Cua vỏ cứng. **Anim chính thức: Idle, Move, Attack**. Đòn là **AoE toả tròn**, không phải đạn thẳng |

### 4.7. Forlorn Metropolis — tức "Ancient City" (2 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Caveling Scholar** | 1.390 / 2.085 / 695 | melee **139−169** · range **185−225** · **HEAL 338/giây** | Bắn **quả cầu năng lượng** + **HỒI MÁU cho Scholar khác và Core Sentry** + vung gậy cận chiến | 30 / 30 | Học giả áo dài cầm trượng. **Anim chính thức: Idle, Move, Attack, HEAL** — có anim hồi máu riêng (**tia nối tới đồng minh**) |
| **Core Sentry** | 2.452 / 3.678 / 1.226 | **185−225** (range) | **Bắn 3 làn SÓNG XUNG ÁNH SÁNG** (né bằng cách **nấp sau tường/vật thể**; sóng phá được nội thất) + **đá** khi ở gần. **Được Scholar hồi máu.** Một số đứng im dạng tượng **"Damaged Core Sentry" ⇒ không rơi loot** | 15 / 15 | Robot canh gác đá. Khi kích hoạt thì **phát sáng dần lên rồi mới bước đi** — telegraph rất rõ |

### 4.8. The Desert of Beginnings (6 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Caveling Assassin** | 1.950 / 2.925 / 975 | melee **204−248** · range **204−248** | **Ném 3 con dao liên tiếp** từ xa, **hoặc 3 nhát chém lao tới** khi gần. **Nghỉ vài giây giữa các đòn ⇒ cửa sổ phản công** | 50 / 50 | Sát thủ mũ trùm áo choàng. **Anim chính thức: Idle, Move, Melee attack, Range attack** (2 anim tấn công tách bạch) |
| **Bomb Scarab** | 2.535 / 3.802 / 1.268 | charge **204−248** · **Mining nổ 998** | Lao tốc độ cao, **băng qua cả hố và chất lỏng**. **Mất 50% HP là NẰM XUỐNG rồi TỰ NỔ** — nổ thì **không rơi loot**. **Sự kiện lốc cát** trong Desert spawn tới **5 con** một lúc | 20 / 80 / **160 (lao)** | Bọ hung đen. Trước khi nổ có pha **rơi bệt xuống + phồng lên** làm telegraph |
| **Gold Scarab** | 2.925 / 4.388 / 1.462 | như Bomb Scarab | Biến thể Bomb Scarab: **nhiều máu hơn, lao chậm hơn chút**. **Chỉ có trong dungeon của Nimruza, không respawn** | 20 / 80 / **140** | Bọ hung vàng |
| **Caveling Mummy** | 1.836 / 2.754 / 918 | **176−214 (rift spike)** | **Triệu 7 KHE NỨT TÍM thành hàng thẳng hướng người chơi; gai đâm lên LẦN LƯỢT TỪNG KHE, bắt đầu từ khe gần nó nhất.** **Không có đòn cận chiến.** Khe nứt **xuyên qua tường** | 10 / 10 (rất chậm) | Xác ướp quấn băng. **Rất dễ dựng: 7 sprite khe tím + gai nhô lên theo delay tuần tự** |
| **Cicada Nymph** | 1.076 / 1.614 / 538 | **396−482 (melee)** ⚠️ | **Glass cannon**: sát thương cực cao so với HP thấp. Do **Nimruza** gọi ra trong trận + có sẵn trong dungeon của cô ta | 48 / 48 | Ấu trùng ve sầu. Con do Nimruza gọi **không rơi loot** |
| **Desert Cicada** | **6.457** / 9.686 / 3.228 (tới **18.887** khi 8 người) | charge **343−419** · contact 264−322 · projectile **405−495** · **Mining charge 3.629** | **Recolor của Floracada, mạnh hơn.** Húc siêu tốc + bắn đạn. Do **Nimruza** gọi ra | 70 → **231 (charging)** | Ve sầu khổng lồ tông sa mạc |

### 4.9. The Molten Quarry (2 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Lava Slime** | 2.295 / 3.442 / 1.148 | **224−272** (leap) | Nhảy bổ, **gây bỏng 8 giây khi chạm**. **Tầm phát hiện và tốc độ đuổi lớn hơn mọi slime khác** | 10 / **30 (đuổi)** / 100 | Slime dung nham đỏ-cam **phát sáng**, nứt như magma. Miễn burn + acid |
| **Lava Butterfly** | 2.295 / 3.442 / 1.148 | **224−272** (range) + burn | **BAY**, bắn cầu lửa nhỏ. **Bay qua được hố và chất lỏng** | 20 / 40 | Bướm lửa. **Anim chính thức CHỈ CÓ Idle và Attack — KHÔNG có anim "Move" riêng**, dùng luôn Idle vỗ cánh khi bay ⇒ rất tiện dựng: **1 loop vỗ cánh + 1 loop bắn** |

### 4.10. The Passage (2 con)

| Quái | HP (S/H/C) | Damage | Kiểu tấn công | Speed | Hình dáng + animation |
|---|---|---|---|---|---|
| **Sulfur Worm** | 3.075 / 4.612 / 1.538 | **264−322** (contact) | Sâu nhiều đốt **chui tường**. **Thỉnh thoảng THẢ MỘT QUẢ BOM kiểu Sulfur Bud, vài giây sau nổ. Khi chết có thể rớt ra NHIỀU BOM cùng lúc** | 70 | Sâu lưu huỳnh vàng-xanh. Miễn acid/stun/trượt/**charm** |
| **Colossal Amoeba** | 5.535 / 8.302 / 2.768 | **316−386** (contact) | Đâm sầm bằng thân. **Spawn QUANH NGƯỜI CHƠI** chứ không theo ô đất: bán kính **50 ô**, **tối đa 2 con**, **tự despawn khi không có người trong 50 ô** | 70 | Amip khổng lồ. Miễn acid/stun/trượt/charm |

### 4.11. Breaker's Reach (4 con — biome mới bản 1.2, **fandom chưa có trang riêng**)

Biome ở cực Bắc, mở bằng **Void Neuron** rơi từ Nimruza. Boss: **S.A.H.A.B.A.R**.

| Quái | Level | HP (Standard) | Ghi chú |
|---|---|---|---|
| **Void Caveling** | 16 | **19.305** — **nhiều máu nhất trong toàn bộ quái thường** | Damage / kiểu tấn công / hình dáng: **không tra được** |
| **Geobot Patroller** | 16 | 14.040 | damage ~192; **dải min−max không tra được** |
| **Geobot Miner** | 16 | 10.530 | damage ~441 (cao nhất nhóm); speed 10 (chậm nhất) |
| **Geobot Scourer** | 16 | 4.563 | damage ~189; speed 15 |

> ⚠️ Bốn con này **fandom chưa có trang**; số liệu đến từ cơ sở dữ liệu bên thứ ba **corekeeperdb.com**. **Cảnh báo kỹ thuật đã kiểm chứng:** HTML của trang đó **chèn `<!-- -->` vào giữa các chữ số**, khiến các bộ chuyển HTML→markdown **nối nhầm số lượng vào trước con số %** (ví dụ "14.3%" bị đọc thành "114.3%"). **Phải parse HTML thô**, không dùng công cụ fetch-và-tóm-tắt.

### 4.12. Quái do boss triệu hồi (2 con)

| Quái | HP (S/H/C) | Damage | Ghi chú |
|---|---|---|---|
| **Royal Slime** | 510 / 765 / 255 | **92−112** (leap) | Do **King Slime** gọi ra (1 con mỗi 700 máu mất). **Tự biến mất sau 60 giây.** Dùng **âm thanh trúng đòn/chết của Terraria** (crossover). `[NGUỒN]` /wiki/Royal_Slime |
| **Nature Worm** | 4.005 / 6.008 / 2.002 | **292−356** (contact) + độc | Do **Druidra the Wild Titan** gọi ra. Sâu nhiều đốt chui tường. **100% gây poison, giảm 75% hồi máu của địch.** Từ bản 1.1 **không rơi loot nữa**. `[NGUỒN]` /wiki/Nature_Worm |

### 4.13. ⭐ 7 ARCHETYPE để dựng sprite 2D (rút gọn 47 con thành 7 bộ khung)

| # | Archetype | Gồm | Bộ animation cần làm |
|---|---|---|---|
| 1 | **Slime nhảy** | Orange, Red, Purple, Blue, Lava, Royal (+ tất cả boss slime) | Idle (phập phồng) → **Squash (nạp)** → Airborne (vòng cung) → **Land (bẹt)** |
| 2 | **Charger húc thẳng** | Shrooman, Shrooman Brute, Mimite, Bomb/Gold Scarab, Floracada, Desert Cicada | Idle → **Telegraph** → Charge → **Impact/Stun** |
| 3 | **Caveling nhân hình** | Caveling, Skirmisher, Spearman, Brute, Shaman, Gardener, Hunter, Scholar, Assassin, Mummy, Infected | Idle / Move / Attack **(4 hướng)** + **1 anim đặc trưng riêng**: Plant · Bush · Heal · Taunt · Eat · Yawn · Sleep |
| 4 | **Sâu nhiều đốt chui tường** | Clay Burrower, Nilipede, Nature Worm, Sulfur Worm (+ Ghorm, Atlantean Worm) | Đầu + N segment **follow-the-leader**; **Emerge / Submerge** |
| 5 | **Larva bò** | Larva, Big Larva, Hive Larva, Big Hive Larva, Acid Larva | **Bò sâu đo** (co dồn → duỗi bung) |
| 6 | **Tháp / bẫy cố định** | Snare Plant, Mold Tentacle, Tentacle, Orbital Turret, Core Sentry (+ Hive Mother) | Idle → **Wind-up** → Fire → **Recover** |
| 7 | **Bay** | Lava Butterfly | **Idle (vỗ cánh — dùng chung cho cả di chuyển)** + Attack |

### 4.14. Cơ chế SINH QUÁI (spawn) — rất đáng bắt chước

`[NGUỒN]` trang riêng từng quái, mục "Spawning"

Core Keeper **không rải quái ngẫu nhiên trên nền đất**. Nó gắn quái vào **"spawning tile"** (ô sinh quái):

| Ô sinh quái | Sinh ra | Tỉ lệ / sự kiện respawn |
|---|---|---|
| **Ground Slime** | Orange Slime | 30%, tối thiểu 6 ô, **+0,15 spawn tối đa mỗi ô** |
| **Ground Slippery Slime** | Blue Slime | 30%, min 6 ô |
| **Ground Magma Slime** | Lava Slime 30% · **Lava Butterfly 10%** | min 6 ô |
| **Chrysalis** | Larva các loại | — |
| **Stone Moss** | Caveling, Shaman, Brute | — |
| **Lush Moss** | Caveling Gardener, Hunter | — |
| **Urban Moss** | Caveling Scholar **30%** · **Core Sentry 0,5%** | min 6 ô |
| **Valley Moss** | Caveling Assassin 30% | min 6 ô |
| **Crystal Crust** | Mimite 30% · **Orbital Turret 5%** | min 6 ô |
| **Beach Block ground** | Bubble Crab 0,5% | — |
| **Desert Block ground** | Bomb Scarab **0,05%** (tối đa 2/sự kiện) | — |
| **Sea water** | Tentacle **0,01%**, nhưng **1% nếu sát ô đất** | — |
| **Quanh người chơi** (không cần ô) | Colossal Amoeba (bán kính 50 ô, max 2) · Sulfur Worm (bán kính 50 ô, max 5) | chỉ ở The Passage |

⇒ **Hệ quả thiết kế:** người chơi **dọn ô sinh quái (đào bằng hoe/xẻng) là dọn được ổ quái vĩnh viễn**. Đây là cách Core Keeper cho phép "làm sạch khu vực để xây nhà" mà không cần cơ chế an toàn riêng.

---

## 5. BOSS — danh sách đầy đủ + chiêu + pha + animation

`[NGUỒN]` tổng quan: https://core-keeper.fandom.com/wiki/Bosses — **"There are a total of 18 bosses in the game (20 including seasonal variants)"** (con số này của trang tổng quan; trang đó liệt kê 20 mục vì đã thêm S.A.H.A.B.A.R và Oblidra của bản 1.2).

**Quy ước đọc chỉ số:** wiki đăng 3 cột **Casual / Standard / Hard**. Dưới đây lấy **Standard** (mặc định), và ghi thêm hệ số: Casual = ~1/2 Standard, Hard = ~1.5× Standard. HP boss còn **tăng theo số người chơi** trong world (ví dụ Glurch Standard: 1 người 2.459 → 8 người 12.979). `[NGUỒN]` https://core-keeper.fandom.com/wiki/Glurch_the_Abominous_Mass

### 5.0. Bảng tổng — 20 boss

| # | Boss (tên chính xác) | Biome | HP (Standard) | Bắt buộc? |
|---|---|---|---|---|
| 1 | **Glurch the Abominous Mass** | Undergrounds | 2.459 | ✅ tiến trình |
| 2 | **Ghorm the Devourer** | Clay Caves / Forgotten Ruins | 8.061 | ✅ tiến trình |
| 3 | **King Slime** (crossover Terraria) | mọi rune slime | 24.188 | tuỳ chọn |
| 4 | **The Hive Mother** | Larva Hive | 24.671 | tuỳ chọn |
| 5 | **Malugaz the Corrupted** | Forgotten Ruins | 14.513 (tổng 2 pha) | ✅ tiến trình |
| 6 | **Azeos the Sky Titan** | Azeos' Wilderness | 31.813 | ✅ titan 1/6 |
| 7 | **Ivy the Poisonous Mass** | Azeos' Wilderness | 39.155 | tuỳ chọn |
| 8 | **Omoroth the Sea Titan** | Sunken Sea | 90.772 | ✅ titan 2/6 |
| 9 | **Morpha the Aquatic Mass** | Sunken Sea | 84.551 | tuỳ chọn |
| 10 | **Ra-Akar the Sand Titan** | Desert of Beginnings | 160.799 | ✅ titan 3/6 |
| 11 | **Igneous the Molten Mass** | Molten Quarry | 160.799 | tuỳ chọn |
| 12 | **Atlantean Worm** | Sunken Sea | 9.641 **mỗi đốt** | tuỳ chọn |
| 13 | **Druidra the Wild Titan** | Azeos' Wilderness | 136.992 + **41.098 giáp** | ✅ titan 4/6 |
| 14 | **Crydra the Ice Titan** | Sunken Sea | 136.992 + 41.098 giáp | ✅ titan 5/6 |
| 15 | **Pyrdra the Fire Titan** | Desert of Beginnings | 136.992 + 41.098 giáp | ✅ titan 6/6 |
| 16 | **Core Commander** | Desert of Beginnings | **465.385** (2 pha) | ✅ **boss cuối cốt truyện** |
| 17 | **Urschleim** | The Passage | 249.826 | tuỳ chọn |
| 18 | **Nimruza, Queen of the Burrowed Sands** | Desert of Beginnings (Oasis dungeon) | 228.320 | tuỳ chọn (end-game) |
| 19 | **S.A.H.A.B.A.R** | Breaker's Reach | không tra được | post-game |
| 20 | **Oblidra, the Void Lord** | Breaker's Reach | không tra được | post-game |
| E1 | *Haunted Hive Mother* (Halloween) | — | như Hive Mother | biến thể sự kiện |
| E2 | *Awakened Azeos* (Easter) | — | như Azeos | biến thể sự kiện |

Nguồn từng dòng là trang riêng của boss đó trên `core-keeper.fandom.com` (liệt kê chi tiết bên dưới).

---

### 5.1. Glurch the Abominous Mass — "khuôn mẫu boss nhảy"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Glurch_the_Abominous_Mass

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 2.459 | 3.688 | 1.230 |
| Damage (leap) | **40−48** | 80−96 | 20−24 |
| Move speed | **150 (nhảy)** → **225 (nổi điên)** | | |
| Enrage | **≤30% máu**, thoát enrage khi hồi lên **50%** | | |
| Miễn nhiễm | slow-do-slime, **stun**, trượt, **knockback** | | |

**Chiêu / hành vi (chỉ 1 chiêu — đây là điểm hay):**
1. **Leap (nhảy vồ)** — nhảy nhanh về phía **người chơi gần nhất**, gây damage **ngay chỗ tiếp đất**, và **để lại vũng Ground Slime** (làm chậm người chơi).
2. **Phá địa hình**: "instantly breaks any non-indestructible objects in their path, including walls". Pit/chất lỏng trên đường đi bị **lấp thành Dirt Block ground**.
3. **Aggro 2 mức**: đầy máu chỉ đánh trong **bán kính 6 ô**; **bị đánh rồi thì mở rộng thành 20 ô**.
4. **Leash/hồi máu**: ra khỏi tầm hoặc Glurch đi quá **25 ô** khỏi rune ⇒ quay về rune và **hồi 10% máu tối đa mỗi 5 giây**.

**Animation đặc trưng:** khối slime cam khổng lồ **co lại → bật lên → rơi bẹp** (squash & stretch). Khi ở gần, **màn hình rung và có tiếng "thịch" nặng** báo trước. `[NGUỒN]` cùng trang.

**Triệu hồi lại:** đặt **Giant Slime Summoning Idol** lên **rune** ngay dưới chỗ spawn gốc.

---

### 5.2. Ghorm the Devourer — "boss giun chạy vòng"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Ghorm_the_Devourer

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 8.061 | 12.092 | 4.030 |
| Damage (contact) | **78−94** | 155−189 | 39−47 |
| Move speed | **60** | | |
| Enrage | **≤80%** (thoát ở 95%) | | |
| Miễn nhiễm | acid, stun, trượt, knockback | | |

**Chiêu / hành vi:**
1. **Đi vòng tròn không đổi** quanh thế giới ở khoảng cách **190–210 ô** từ The Core, xuyên qua Clay Caves + Forgotten Ruins. **Không có chiêu chủ động** ở pha 1.
2. **Phá huỷ tuyệt đối**: phá **mọi vật thể và tường trên đường đi, kể cả Obsidian Block vốn bất hoại**. Giết gần như mọi sinh vật chạm vào bằng **10.000 damage**.
3. **Pha 2 (dưới 80% máu)**: chuyển sang **chủ động vòng quanh người chơi** để đâm/đè.
4. **Vệt Ground Slime** phía sau làm chậm người chơi; pit/liquid bị **lấp thành Dirt Block**.
5. **Leash**: kéo đi quá xa ⇒ quay về đường tuần và **hồi 2% máu tối đa mỗi 5 giây**.

**Animation:** thân giun nhiều đốt trườn thành đường cong dài, đầu có sừng; **để lại đường hầm đã bị nghiền nát** — nghĩa là boss này *viết lại địa hình*.

---

### 5.3. King Slime (crossover Terraria)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/King_Slime

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 24.188 | 36.282 | 12.094 |
| Damage (leap) | **143−173** | 285−347 | 72−86 |
| Enrage | ≤30% (thoát 50%) | | |

**Chiêu:**
1. **Leap** giống Glurch (aggro 6 ô → 20 ô sau khi bị đánh; leash 25 ô; hồi 10%/5s).
2. **Gọi quân — Royal Slime**: **cứ mất 700 máu thì triệu hồi 1 Royal Slime**. Royal Slime **tự biến mất sau 60 giây**. Không spawn thêm nếu đã có **≥12 con trong bán kính 15 ô**.
   - Royal Slime: HP **510**, damage leap **92−112**, move speed 10 (thường) / 15 (đuổi) / 100 (nhảy).
3. Lấp pit/liquid thành **Dirt / Grass / Beach / Lava Rock** tuỳ rune đang dùng.

**Triệu hồi:** **Crown Summoning Idol** đặt lên **bất kỳ rune slime nào**.

---

### 5.4. The Hive Mother — "boss tĩnh, đánh bằng mưa acid + trứng"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/The_Hive_Mother

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 24.671 | 37.006 | 12.336 |
| Damage (acid impact) | **108−132** | 216−264 | 54−66 |
| Enrage | **≤60%** (thoát 80%) | | |
| Larva Hive Egg HP | **1.530** | 2.295 | 765 |

**Chiêu (đây là boss "mortar + summon" mẫu mực):**
1. **Nhổ acid (mortar)** — **mỗi 4–5 giây**, acid **rơi từ trên trời xuống đúng chỗ người chơi**. Trúng gây damage vừa + **tạo vũng Ground Acid Slime gây 12 acid damage/giây** khi đứng lên.
2. **Đẻ trứng (Larva Hive Egg)** — **mỗi 17→10 giây** (càng ít máu càng nhanh), đẻ tại **1 trong 5 vị trí cố định** của đấu trường. Multiplayer: **≥3 người → 2 trứng, ≥6 người → 3 trứng**.
3. **Trứng nở sau 7,4 giây** nếu không bị phá, sinh ra **1 Big Hive Larva** + **một trong ba nhóm**:
   - 6–7 **Hive Larva**
   - 2 **Big Hive Larva**
   - 3 **Acid Larva**
4. **Enrage ≤60% máu**: nhổ acid **mỗi 2–2,5 giây** thay vì 4–5 giây, **và đẻ thêm một trứng nữa**.

**Chỉ số quái con (biến thể "Hive Egg", khác bản hoang dã: aggro rộng hơn, aggro xuyên tường, KHÔNG rơi loot):**

| Quái | HP | Damage | Move speed |
|---|---|---|---|
| Hive Larva | 452 | 66−80 (melee) | 10 thường / **30 đuổi** |
| Big Hive Larva | 742 | 99−121 melee, 110−134 lên vật thể; **mining damage 2.520** (phá tường) | 10 / 30 |
| **Acid Larva** | **1** (một máu!) | **explosive 92−112 khi nổ** | 10 / **60 đuổi** |

**Animation:** khối tổ khổng lồ bám tường, **phồng lên rồi phun** khi bắn acid; trứng phập phồng rồi **nứt vỡ**.

---

### 5.5. Malugaz the Corrupted — **BOSS 2 PHA, có "hồi sinh"**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Malugaz_the_Corrupted

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **14.513 (tổng cả 2 pha)** | 21.770 | 7.256 |
| Damage melee | 83−101 | 166−202 | 42−50 |
| Damage range (fireball) | 83−101 | 166−202 | 42−50 |
| Damage flames (vũng lửa) | 54−66 | 108−132 | 27−33 |
| Mining damage (melee) | **825** — đòn đánh của hắn **phá tường** | | |
| Hiệu ứng | **+9 burn damage khi trúng đòn** | | |
| Move speed | 60 | | |

Projectile phụ **"Flames"** (vũng lửa): damage tiếp xúc **33−39**, **tồn tại 30 giây**, **+6 burn damage khi trúng**.

**Pha 1 — dạng đội mũ trùm (First form):** luân phiên 2 chiêu.
1. **Ném 2–3 quả cầu lửa** về phía người chơi. Fireball **phá tường và đồ nội thất, nhưng không phá sàn**.
2. Sau đó **hoặc dịch chuyển (teleport)** quanh đấu trường, **hoặc triệu hồi một vùng lửa 3×3** đọng lại trên sàn.

**Chuyển pha (rất hay để bắt chước):**
> Khi bị đánh về **0 máu**, hắn **KHÔNG chết**: **xé bỏ áo choàng và mũ trùm, tự bốc cháy (và đốt cả mặt đất), rồi HỒI ĐẦY MÁU** và bước sang pha 2.

**Pha 2 — dạng lộ mặt (Second form):**
1. Vẫn **teleport** quanh đấu trường.
2. Đổi sang **lao thẳng tới (launch himself forward) đánh cận chiến**.
3. Mỗi đòn melee **để lại vùng lửa 3×3 giống pha 1**, và có **AoE nhỏ khi tiếp đất**.
4. Đòn của hắn **phá cả tường, nội thất lẫn tile sàn**.
5. Wiki cảnh báo thẳng: rất nguy hiểm cho người chơi tầm xa — nếu kéo aggro thì **tập trung né, đừng đánh**.

**Luật đấu trường:** phải đánh trong **Caveling Throne Room**; nếu hắn ra khỏi phòng thì **teleport về và hồi hết máu đã mất**. **Nếu toàn bộ người chơi chết ở pha 2, Malugaz quay về pha 1.**

**Triệu hồi:** tìm scene **Caveling Throne Room** ~300 ô từ The Core (bao quanh bởi mê cung tường quá cứng cho đầu game), đặt **Skull of the Corrupted Shaman** lên rune giữa phòng.

---

### 5.6. Azeos the Sky Titan — **boss "bullet-hell hình học", 5 chiêu**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Azeos_the_Sky_Titan

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 31.813 | 47.720 | 15.906 |
| **Thunder Beam** (projectile) | damage tiếp xúc **180−220** | | |
| **Blue Crystal** (vật thể sinh ra) | 2×2 ô, HP **3**, **damage reduction 320** | | |
| Enrage | **≤40%** (thoát 60%) → **thunder beam bay nhanh hơn 40%** | | |

**5 chiêu (nguyên văn wiki, đây là mẫu bullet-hell cực dễ port sang 2D):**
1. **Hai hàng thunder beam ở TRÁI và PHẢI**, ép vào giữa từ hai bên.
2. **Hai hàng thunder beam ở TRÊN và DƯỚI**, ép vào giữa.
3. **Một VÒNG thunder beam bao quanh Azeos**, **vừa xoay vừa co vào**, rồi **nở bung trở ra**.
4. **Một CỤM thunder beam**, mỗi tia **đi ngẫu nhiên theo 1 trong 4 hướng**.
5. **Triệu hồi nhiều Blue Crystal** — **chỉ phá được bằng mining damage** (cuốc, thuốc nổ). **Nếu một crystal bị thunder beam sạc vào, nó bắt đầu HỒI MÁU CHẬM cho Azeos cho tới khi bị phá.**

**Animation / nhịp:** **sau mỗi pattern, Azeos TELEPORT rồi bắt đầu pattern khác.** Đây là boss chim bay, thân lớn, đấu trường tròn "rải đầy lông chim và xương".

**Triệu hồi:** đặt **Large Shiny Glimmering Object** vào đấu trường (~550 ô từ The Core). Sau khi chết, **linh hồn tồn tại 5–6 phút**, hết mới triệu hồi lại được.

---

### 5.7. Ivy the Poisonous Mass

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Ivy_the_Poisonous_Mass

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 39.155 | 58.732 | 19.578 |
| Damage leap | **198−242** | 396−484 | 99−121 |
| Damage poison impact | **72−88** | 144−176 | 36−44 |
| Enrage | ≤30% (thoát 50%), speed 150 → **225** | | |

**Chiêu:**
1. **Leap** như Glurch, để lại **Ground Poison Slime**; lấp pit/liquid thành **Grass Block**; phá mọi vật cản không bất hoại.
2. **Mưa cối độc (poison mortar)** — **mỗi 10–20 giây** dừng lại một nhịp rồi **bắn 12–14 quả đạn độc rơi từ trên trời**. Mỗi quả có **25% cơ hội triệu hồi một Purple Slime** (con này **không rơi loot**).
3. Aggro 6 ô → 20 ô; leash 25 ô, hồi 10%/5s.

---

### 5.8. Omoroth the Sea Titan — **boss "lốc xoáy hình rắn" + xúc tu**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Omoroth_the_Sea_Titan

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **90.772** | 136.158 | 45.386 |
| Damage (whirlwind) | **185−225** | 369−451 | 92−112 |
| Enrage | **≤50%** (thoát 80%) | | |
| **Omoroth's Tentacle** | HP **688**, damage melee **224−272**, **mining damage 5.880**, **tự biến mất sau 90 giây** | | |

**Chiêu:**
1. **Phun một dòng lốc xoáy (whirlwind) dày đặc bay theo QUỸ ĐẠO HÌNH RẮN (serpentine)** toả ra xa. Phần lớn xuất phát từ **vùng miệng**.
2. Sau vài loạt, **lặn xuống và trồi lên ở một xoáy nước (whirlpool) khác** trong đấu trường, rồi tiếp tục bắn.
3. Song song đó, **từng nhóm 3 Omoroth's Tentacle mọc lên quanh đấu trường, thường ngay cạnh người chơi**. Xúc tu này **chỉ đánh cận chiến nhưng sát thương cao hơn cả whirlwind**.

**Triệu hồi (độc đáo):** **câu cá** bằng **Expert Lure** ở một trong các xoáy nước lớn trong đấu trường (~650 ô). Cần **fishing ≥180** (Octarine Fishing Rod). Sau khi chết, hồn tồn tại 5–6 phút.

---

### 5.9. Morpha the Aquatic Mass

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Morpha_the_Aquatic_Mass

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | 84.551 | 126.826 | 42.276 |
| Damage range (bubble) | **166−202** | 332−404 | 83−101 |
| Damage leap | **257−313** | 513−627 | 128−156 |
| Hiệu ứng | **100% cơ hội gây "slippery movement" khi trúng đòn** | | |
| Enrage | ≤30% (thoát 50%) | | |

**Chiêu:**
1. **Leap** → để lại **Ground Slippery Slime** (làm trượt); lấp pit/liquid thành **Beach Block**.
2. **Bắn bong bóng** — **mỗi 3–6 giây** dừng lại và **bắn 30 quả bong bóng theo hướng NGẪU NHIÊN**. (Khác Ivy/Hive Mother ở chỗ: **không rơi từ trên trời mà toả ngang**.)
3. Aggro 6→20 ô; leash 25 ô; hồi 10%/5s.

---

### 5.10. Ra-Akar the Sand Titan — **6 chiêu, boss bọ hung**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Ra-Akar_the_Sand_Titan

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **160.799** | 241.198 | 80.400 |
| Damage ancient projectile | **224−272** | 447−545 | 112−136 |
| Damage sand ring | **176−214** | 351−429 | 89−107 |
| Damage charge | **157−191** | 314−382 | 79−95 |
| Mining damage (charge) | **10.000** — húc là nát địa hình | | |
| Enrage | **≤50%** (thoát 80%) | | |

**6 chiêu:**
1. **Vùi mình xuống đất rồi lao húc khắp đấu trường**, **MIỄN NHIỄM SÁT THƯƠNG trong lúc đó**.
2. **Các đường "vòng cát" (sand ring) quét theo chiều KIM ĐỒNG HỒ hoặc NGƯỢC**, giữa các vòng có **khe hở nhỏ để lách**.
3. **Sóng vòng cát toả từ Ra-Akar ra tới rìa đấu trường**.
4. **Nhiều vòng cát nổ ngay tại vị trí người chơi**.
5. **Triệu hồi nhiều Bomb Scarab** ở các điểm ngẫu nhiên trong đấu trường.
6. **6 "ancient projectile" hình TAM GIÁC** — **bám đuổi người chơi và tăng tốc rất nhanh**. Tránh bằng cách **chạy thoát** hoặc **dụ cho đâm vào tường**; cũng **phá được bằng vũ khí nổ** (Burnzooka, Volcanic Mortar).

**Triệu hồi:** đặt **Thumper** vào đấu trường (~600 ô).

---

### 5.11. Igneous the Molten Mass

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Igneous_the_Molten_Mass

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **160.799** | 241.198 | 80.400 |
| Damage range (fireball) | **448−546** | 895−1093 | 224−272 |
| Damage leap | **346−422** | 692−844 | 173−211 |
| Enrage | **≤50%** (thoát 70%) | | |

**Chiêu:**
1. **Leap** → để lại **Ground Magma Slime** (phát sáng cam); lấp pit/liquid thành **Lava Rock Block**.
2. **Mỗi 5–7 giây dừng lại và chọn 1 trong 2 chiêu:**
   - **Phun cầu lửa** về phía người chơi gần nhất — damage vừa + **gây burn**.
   - **Sinh nhiều "Magma Blob"** quanh mình; các cục này **bò chậm về phía Igneous và HỒI 10% MÁU cho hắn nếu chạm được**. Người chơi **phá được bằng 1 đòn**. **Số lượng blob tăng theo số người chơi và khi enrage.**
3. Enrage ≤50%: di chuyển nhanh hơn **và sinh nhiều magma blob hơn**.

---

### 5.12. Atlantean Worm — **boss giun có "điểm yếu tách đôi"**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Atlantean_Worm

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **9.641 MỖI ĐỐT (per segment)** | 14.462/đốt | 4.820/đốt |
| Damage contact | **317−387** | 634−774 | 159−193 |
| Damage electricity orb | **317−387** | 634−774 | 159−193 |
| Move speed | 50 | | |

**Chiêu / cơ chế:**
1. **Không đánh và không bị đánh** cho tới khi được "gọi lên mặt nước" bằng **Bait Pillar**.
2. Nổi lên rồi **đớp bằng miệng và đâm bằng gai**.
3. **Thỉnh thoảng sạc một đòn năng lượng rồi vỡ thành RẤT NHIỀU quả cầu nhỏ theo hình VÒNG TRÒN.**
4. **Cơ chế đặc sắc:** sau khi **phá được điểm yếu (weakpoint)**, con giun **TÁCH RA thành một Atlantean Worm ngắn hơn**, tuỳ vị trí điểm yếu nằm ở đâu.
5. Giống Ghorm: **phá tan mọi vật thể trên đường đi kể cả Obsidian**; **mọi ô nền trên đường bị thay bằng sea water**.
6. Chết xong **respawn ngay lập tức** ở một điểm ngẫu nhiên trên đường tuần.

---

### 5.13–5.15. Bộ ba HYDRA: **Druidra / Crydra / Pyrdra** — cơ chế "phá giáp → tê liệt"

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Druidra_the_Wild_Titan , https://core-keeper.fandom.com/wiki/Crydra_the_Ice_Titan , https://core-keeper.fandom.com/wiki/Pyrdra_the_Fire_Titan

**Chỉ số chung (cả 3 giống hệt nhau):**

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **136.992** | 205.488 | 68.496 |
| **Protective armor** (thanh vàng trên thanh máu) | **41.098** | 61.646 | 20.549 |
| Damage melee (slam) | 264−322 | 528−644 | 132−160 |
| Damage "appear" (trồi lên đất) | 80−96 | 159−193 | 40−48 |
| Damage beam | **343−419** | 686−838 | 171−209 |
| Mining damage (appear) | **10.000** | | |
| Move speed | 5 thường / 7 chiến đấu / **5–20 khi đuổi theo Organ** | | |

**Vòng lặp cơ chế (dùng chung cho cả ba — RẤT đáng bê nguyên):**
> Boss có **lớp giáp bảo vệ hấp thụ sát thương** (thanh vàng riêng trên thanh máu). **Phá hết giáp ⇒ boss TÊ LIỆT và ĐỔ XUỐNG ĐẤT, bị tổn thương trong 9,3 giây.** Sau 9,3 giây boss đứng dậy đánh tiếp và **hồi đầy giáp**.
> **Máu mất trong mỗi lần tê liệt bị chặn mềm (soft-cap) ở 25% máu tối đa** ⇒ **bắt buộc phải làm tê liệt ít nhất 4 lần** mới giết được.
> **Giữa mỗi chiêu, boss CHUI XUỐNG ĐẤT rồi trồi lên ở vị trí khác, gây damage cho người đứng gần chỗ trồi lên.**

**Chiêu chung của cả 3 đầu hydra:**
- **Slam**: nếu người chơi đủ gần, **đập đầu xuống đất** gây damage vùng. **Có tiếng RÍT (hissing) báo trước.**
- **Beam vàng**: phun **tia sáng màu vàng từ miệng, BÁM THEO người chơi**.

**Chiêu riêng từng con:**

| Boss | Chiêu riêng | Damage |
|---|---|---|
| **Druidra the Wild Titan** (Azeos' Wilderness) | (a) **Gai đất**: triệu hồi gai ngay dưới chân người chơi; sau một lúc gai **trồi lên** gây damage trong bán kính và **sinh ra một Nature Worm**. (b) **Gầm lên trời → nhiều khối rơi từ trên xuống → HÚT người chơi về phía mình**; trong lúc đó **hiệu ứng gió vẽ trên sàn đánh dấu vùng sắp bị shockwave**; sau đó **phát shockwave sát thương rất cao và PHÁ HUỶ các block bị lộ ra**. Né bằng cách **núp sau một block** hoặc **chạy đủ xa**. | thorns 264−322 · **shockwave 554−676** (mining damage 10.000) |
| **Crydra the Ice Titan** (Sunken Sea) | **Tạo một khối tinh thể băng trên sàn**, khối này **liên tục bắn hai loạt phi tiêu băng theo hình XOẮN ỐC**. Khối băng **phá được bằng bất kỳ đòn nào**. | ice shard **146−178** |
| **Pyrdra the Fire Titan** (Desert) | **Nhổ cầu lửa lên trời, chúng rơi xuống thành MỘT HÀNG THẲNG**, điểm rơi được **báo trước bằng dấu đỏ trên mặt đất**. Chỗ rơi **để lại Ground Magma Slime**. | fireball **369−451** |

**Cơ chế "linh hồn tích luỹ" (rất hay):**
- Druidra đánh **một mình**.
- **Crydra spawn kèm LINH HỒN của Druidra** — linh hồn **bất tử**, dùng được chiêu chung + chiêu riêng của Druidra. Khi Crydra tê liệt, **linh hồn Druidra vẫn đánh bình thường**.
- **Pyrdra spawn kèm LINH HỒN của CẢ Druidra VÀ Crydra** ⇒ trận cuối của bộ ba là **3 đầu cùng đánh**.

**Nature Worm** (quái do Druidra sinh): HP **4.005**, damage contact **292−356**, move speed 60, **100% gây poison khi trúng, giảm 75% lượng hồi máu của địch**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Druidra_the_Wild_Titan

**Triệu hồi:** cả ba **đi ngầm dưới đất theo vòng tròn quanh biome của mình**; muốn đánh phải đặt **Wind Organ of Wilderness / of Ice / of Fire** gần đó để kéo lên mặt đất.

---

### 5.16. Core Commander — **BOSS CUỐI, 2 PHA, có pha "hư không"**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Core_Commander

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **465.385 (tổng)** | 698.078 | 232.692 |
| Damage thunder beam | 337−411 | 674−822 | 169−205 |
| Damage whirlwind | 243−297 | 486−594 | 122−148 |
| Damage ancient projectile | **609−743** | 1217−1487 | 305−371 |
| **Core Sphere** (3 quả cầu vệ tinh) | HP **26.700**, damage electricity orb 243−297 | 40.050 | 13.350 |

**Cơ chế lõi (áp dụng cho CẢ HAI pha):**
> Core Commander **bất tử ban đầu**, có **3 quả cầu (Core Sphere) bay quanh**. **Phá 1 quả ⇒ nó rơi xuống đất, nằm im và LIÊN TỤC BẮN CẦU ĐIỆN THEO HÌNH NGŨ GIÁC.** **Phá đủ 3 quả ⇒ Core Commander TÊ LIỆT và bị tổn thương trong một khoảng thời gian.** Hết thời gian, **cả 3 quả hồi đầy máu và bay lại**.
> **Máu mất mỗi lần tê liệt bị soft-cap ở 50% máu tối đa** ⇒ thường phải làm tê liệt **2 lần/pha, 4 lần tổng**. (Đánh đủ nhanh thì bỏ qua được cap.)

**PHA 1 — 3 nhóm chiêu:**
1. **Sét (lightning bolt) sinh gần người chơi, 4 pattern khác nhau. Mọi tia SÉT ĐỨNG YÊN tại chỗ được sinh ra, KHÔNG bám theo người chơi:**
   - a) **Bao người chơi bằng một VÒNG sét có MỘT KHE HỞ ở hướng ngẫu nhiên**; vòng **xoay một lúc rồi khép vào**.
   - b) **Hai hàng sét ở TRÊN và DƯỚI người chơi, mỗi hàng có một khe hở**; sau một nhịp trễ ngắn **ép vào rất nhanh**.
   - c) **Ba nhóm sét cùng khép vào người chơi.**
   - d) **Một tia sét đơn lao vào người chơi khá nhanh.**
2. **Lốc xoáy tím (whirlwind)** — định kỳ sinh nhiều lốc **HÚT người chơi lại gần**. Lốc **biến mất sau khi gây damage một lần**. Vị trí sinh **báo trước bằng RUNE PHÁT SÁNG trên sàn** — **nhưng lốc gây damage SỚM HƠN lúc hình thành xong**, thậm chí sinh ngay dưới chân gây damage tức thì.
3. **3 projectile hình TAM GIÁC bám thẳng người chơi**, damage rất cao; **tan khi đâm vào block** hoặc sau vài giây.

**Chuyển pha:** hết máu pha 1 ⇒ **hồi đầy máu, đổi thành "Unleashed Core Commander"**, vào pha 2.

**PHA 2 — giữ nguyên chiêu pha 1, THÊM chiêu "Void":**
> Báo hiệu bằng **một tiếng động chói**. Core Commander **biến toàn bộ không gian quanh nó thành HƯ KHÔNG (void), chỉ chừa 3 VÙNG AN TOÀN HÌNH TRÒN** — thường nằm gần 3 quả cầu vệ tinh.
> Đứng trong void bị debuff **mất 20% máu MỖI GIÂY** ⇒ buộc phải đứng trong vùng an toàn.
> **Các đòn sét của pha 1 (trừ chiêu tia sét đơn) được bắn quanh TẤT CẢ các vùng an toàn.**
> **Vùng an toàn CO NHỎ DẦN, cuối cùng chỉ còn bán kính ~1 ô**, rồi chiêu kết thúc.
> **Nếu làm Core Commander tê liệt trong lúc này, chiêu kết thúc ngay lập tức.**
> Ngoài ra pha 2: **lốc xoáy sinh ở xa hơn** và **sét di chuyển nhanh hơn**.

**Triệu hồi:** lần đầu bằng cách **tương tác và đập vỡ Crystal Meteorite** sau khi có **đủ 6 titan soul**. Sau đó dùng **Core Commander Summoning Idol** đặt lên rune bên trong thiên thạch.

---

### 5.17. Urschleim — **"boss tường di động, chạm là chết"**

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Urschleim

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **249.826** | 374.739 | 124.913 |
| Damage contact | **18.000−22.000** (tức là **chạm là chết ngay**) | như trên | như trên |
| **Bulb** (3 bóng phát sáng) | HP **17.880** | 26.820 | 8.940 |
| Miễn nhiễm | phóng xạ, slime, trượt, burn, stun, **charm**, knockback | | |

**Cơ chế:**
1. Urschleim là **một khối khổng lồ TRẢI NGANG toàn bộ The Passage**, **bò chậm theo chiều kim đồng hồ** quanh biome, **đi xuyên qua (nhưng KHÔNG phá) mọi chướng ngại**.
2. **Không có chiêu nào cả** — nhưng **chạm vào là chết tức khắc**. Nó là một **bức tường đuổi**.
3. **Ba "bulb" phát sáng ở mặt trước**: **phá hết 3 bulb ⇒ lộ ra ĐẦU, đánh được trong một khoảng thời gian ngắn**; sau đó **đầu thụt vào, bulb mọc lại**, lặp lại.
4. **Soft-cap 25% máu tối đa mỗi lần lộ đầu** ⇒ phải phá bulb **ít nhất 4 lần**.
5. Ở gần thì **có tiếng ầm ầm (rumbling) và màn hình rung**.

**Triệu hồi:** tìm ở **1.240–1.280 ô** từ The Core; đánh lại bằng **Primeval Slime Cell** dùng ở bất kỳ đâu trong The Passage.

---

### 5.18. Nimruza, Queen of the Burrowed Sands

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Nimruza,_Queen_of_the_Burrowed_Sands

| Chỉ số | Standard | Hard | Casual |
|---|---|---|---|
| Max HP | **228.320** | 342.480 | 114.160 |
| Damage (**arm slam** — đập tay) | **659−805** | 1318−1610 | 330−402 |
| Hiệu ứng | **+8 green glow** (boss tự phát sáng xanh lá) | | |
| Miễn nhiễm | acid, stun, trượt, **phóng xạ**, knockback | | |

Là **ve sầu khổng lồ bị nhiễm bệnh (giant infected cicada)**, có dạng phụ **"Parasite"** (wiki có ảnh riêng cho dạng này).
**Danh sách chiêu chi tiết: KHÔNG TRA ĐƯỢC** — trang fandom hiện chỉ có mục Summoning/Drops, **chưa viết mục Behavior**. Chỉ chắc chắn có đòn **"arm slam"** (đập tay) từ bảng chỉ số.

**Triệu hồi:** tìm **dungeon Oasis biến thể đặc biệt** ở vị trí ngẫu nhiên trong Desert of Beginnings, đặt **Corrupted Sap** lên rune bên trong. Được thêm ở bản **1.1.0.1** (qua content bundle "Queen of the Burrowed Sands").

---

### 5.19–5.20. S.A.H.A.B.A.R & Oblidra, the Void Lord (Breaker's Reach, bản 1.2)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/S.A.H.A.B.A.R , https://core-keeper.fandom.com/wiki/Bosses

- **S.A.H.A.B.A.R**: "the robot boss of Core Keeper", **post-game**, mở sau khi hạ Nimruza, nằm trong **dungeon dạng nhà máy** ở Breaker's Reach. Phòng trung tâm có **dàn máy tính**; nạp **Profane Override** để triệu hồi.
  **Xác nhận từ wiki: đây là boss 2 PHA, "pha hai hung hãn hơn và có nhiều chiêu hơn pha một".** Danh sách chiêu cụ thể: **không tra được** (trang chưa có mục Behavior; infobox lỗi Lua).
- **Oblidra, the Void Lord**: có tên trong danh sách boss ở Breaker's Reach, nhưng **trang riêng RỖNG** ⇒ **không tra được** bất cứ số liệu hay chiêu nào.

---

### 5.21. Tổng kết mẫu thiết kế boss của Core Keeper (rút ra để bê sang)

| Mẫu | Boss đại diện | Mô tả |
|---|---|---|
| **Boss một chiêu, nhảy vồ + để lại vũng** | Glurch, King Slime, Ivy, Morpha, Igneous | 1 chiêu di chuyển duy nhất + vũng debuff + enrage ở 30–50% máu + leash & hồi máu 10%/5s |
| **Boss tuần tra huỷ diệt địa hình** | Ghorm, Atlantean Worm, Urschleim | Đi vòng cố định quanh thế giới, **chạm là gần như chết**, viết lại địa hình |
| **Boss tĩnh, mưa đạn + đẻ quân** | Hive Mother | mortar theo chu kỳ + trứng nở ra 3 loại quân |
| **Boss 2 pha "chết rồi sống lại"** | Malugaz, Core Commander, S.A.H.A.B.A.R | về 0 máu → biến hình, hồi đầy máu, đổi bộ chiêu |
| **Boss bullet-hell hình học** | Azeos, Ra-Akar, Core Commander | các pattern hàng/vòng/cụm khép vào; teleport giữa các pattern |
| **Boss "phá giáp → tê liệt → soft-cap"** | Druidra, Crydra, Pyrdra, Urschleim, Core Commander | thanh giáp riêng; phá xong boss nằm im X giây; **giới hạn 25%/50% máu mỗi lần** ⇒ ép người chơi lặp vòng 2–4 lần |
| **Boss "chữa lành nếu bỏ lỡ"** | Azeos (blue crystal), Igneous (magma blob) | boss tự hồi máu nếu người chơi không xử lý vật thể phụ |
| **Boss cộng dồn** | Crydra (+hồn Druidra), Pyrdra (+hồn Druidra & Crydra) | boss sau mang theo bộ chiêu của boss trước |

---

## 6. Loot & Rơi đồ

### 6.1. Cấu trúc rương

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Chests

- Rương có **2 cỡ: single-wide 18 ô** và **double-wide 36 ô**.
- **Locked chest (rương khoá) chỉ có 1 ô** — bỏ **đúng chìa** vào ô đó ⇒ rương **biến thành rương thường 18 ô** và mở ra toàn bộ loot.
- Nguyên văn: **"Locked chests appear randomly while mining; each main biome (except for the Clay Caves) has its own unique type."**
- Rương có nút **Sort** (sắp xếp theo internal ID) và **Quick stack** (dồn đồ từ túi vào rương).

> ⚠️ **KHÔNG TỒN TẠI** trong Core Keeper: "Wooden Chest", "Golden Chest", "Sunken Chest", "Obsidian Chest", "Crystal Chest", "Legendary Chest". Còn **"Caveling Chest" là ÁO GIÁP NGỰC**, không phải rương.

### 6.2. ⭐ CHUỖI 7 TIER RƯƠNG KHOÁ — xương sống của hệ loot

**Copper → Iron → Scarlet → Octarine → Galaxite → Solarite → Relucite**

**Quy luật vàng: MỌI TIER đều sinh ra khi ĐÀO TƯỜNG đúng biome ở tỉ lệ 0,27%.**
(Đã tự kiểm chứng trực tiếp trên trang Locked Copper Chest và Locked Iron Chest.)

| Rương khoá | Rarity | Chìa | Biome | Nguồn sinh | Loot tiêu biểu |
|---|---|---|---|---|---|
| **Locked Copper Chest** | Common | Copper Key | Undergrounds, Clay Caves | đào tường **Clay/Sand ở Clay Caves 0,27%**; đào **Dirt/Sand/Turf ở Undergrounds 0,27%**; **câu cá nước thường 2,36%**; 1 cái ở Abandoned Clay Mineshaft | 1 roll/22 món: Flintlock Musket · Wood Crossbow · Rusty Dagger · Miner Backpack · Swift Feather · Copper Sledge Hammer **6,85% mỗi món**; Simple Staff / Tome of the Dark 4,79%; Heart Berry Necklace **0,68%**. +3–4 roll/42 món: **Ancient Coin ×10–20 (12,12%/roll)**, Copper/Tin Bar ×4–8, Crude Bomb ×4–8 |
| **Locked Iron Chest** | Common | Iron Key | **Forgotten Ruins** | đào tường **Stone/Sand ở Forgotten Ruins 0,27%**; câu cá Forgotten Ruins **2,36%**; nước acid Clay Caves **0,92%** | — |
| **Locked Scarlet Chest** | Uncommon | Scarlet Key | Azeos' Wilderness | đào tường **Grass/Stone 0,27%**; câu nước thường 2,22%, nước Mold 2,42% | 1 roll/16 món (đa số **6,8%**): Scarlet Dagger, Scarlet Sledge Hammer, Scarlet Hand Drill, Hunter Hood/Cloak, Wildwarden Mask, bộ Corrupt Warden, Tome of Sprouts, Minion Detonator; Broken Handle 2,04%. +3–4 roll/34 món: Ancient Coin ×20–30, Iron/Scarlet Bar ×4–8, Bomb, Large Bomb, Amber Chunk 1,21% |
| **Locked Octarine Chest** | **Rare** | Octarine Key | Sunken Sea | đào tường **Beach Block 0,27%**; câu nước biển 2,12%; Cove Stash ×4, Shipwreck ×1 | 1 roll/26 món **đều 3,85%**: Octarine Axe, Octarine Necklace, Coral Ring, Topaz Ring, Golden Jellyfish, Rusted Necklace, Scarlet Chunk Necklace + **cả bộ đồ bơi** (Bikini / Board Shorts / Towel / Sunglasses) |
| **Locked Galaxite Chest** | **Rare** | Galaxite Key | Desert of Beginnings | đào tường **Desert Block 0,27%**; câu nước Desert 1,9%, **câu DUNG NHAM 2,12%**; dungeon Desert Bridge Area | 1 roll/15 món **đều 7,41%**: bộ Assassin (Hood/Cloak), bộ Paladin (Mask/Harness/Pants), Throwing Daggers, Bomb Ring, Bomb Scarab Mortar, Galaxite Sledge Hammer, Proximity Bomb ×3–5, Nomad Necklace/Ring |
| **Locked Solarite Chest** | **Rare** | Solarite Key | Shimmering Frontier | **CHỈ MỘT NGUỒN DUY NHẤT**: đào tường **Crystal Block** ở Azeos'/Sunken Sea/Desert/Shimmering Frontier — **0,27%** | 1 roll/12 món **đều 8,33%**: bộ Cosmos (Visor Helm/Torso/Legwear), bộ Arcane Monk, Gemstone Garment/Harem Pants, Crystal Shard Club, Ricochet Shuriken, Pet Rock, Tome of Decay. +2–3 roll/26 món: Solarite Bar ×4–8 (20,33%), Gleam Wood Plank (22,24%), Ancient Gemstone, Sunrice, Lunacorn, **Obliteration Ray 0,89%** |
| **Locked Relucite Chest** | Common | Relucite Key | **Breaker's Reach** | Relucite Key rơi từ **Geobot Miner 0,9% / Geobot Patroller 0,7%** | (nội dung chưa có trên fandom) |

**Cộng thêm 3 rương khoá rarity EPIC ở Desert of Beginnings**: Locked **Desert Prince** / **Queen** / **King Chest**. **Chìa mở: không tra được.**

`[NGUỒN]` /wiki/Locked_Copper_Chest · /wiki/Locked_Iron_Chest · /wiki/Locked_Scarlet_Chest · /wiki/Locked_Octarine_Chest · /wiki/Locked_Galaxite_Chest · /wiki/Locked_Solarite_Chest

### 6.3. Rương KHÔNG khoá đặt sẵn theo biome

| Rương | Biome / nơi đặt |
|---|---|
| **Chest** (rương gỗ thường, tự chế Wood ×5) | có mặt trong ~20 scene và 2 dungeon |
| **Ancient Chest** | Forlorn Metropolis (mọi biến thể), Sealed 3-Wing Temple ×2, Ancient Gateway/Pillar Ruins, Beached Caveling Ship Island, nhiều Melody Room |
| **Larva Hive Chest** | Larva Hive |
| **Mold Covered Chest** | Mold Dungeon |
| **Seashell Chest** | Sunken Sea |
| **Golden Ancient Chest** | Desert of Beginnings |
| **Smoldering Chest** | **Molten Quarry** (wiki: "This area is full of smoldering chests") |
| **Cultist Chest** | Passage / Oasis — **nguồn sớm nhất lấy biome gem** |
| **Alien Tech Chest** | Shimmering Frontier |
| **Desert Prince / Queen / King Chest** | Desert Temple (mở bằng Ra-Akar Automaton / Azeos Feather Fan / Omoroth Compass) |

**Bảng loot của Ancient Chest** (4–7 roll / 36 món) `[NGUỒN]` /wiki/Ancient_Chest: Octarine Ore ×4–8 **37,9% có ≥1** · Ancient Gemstone 37,9% · Mechanical Part 37,9% · Greater Healing/Keen/Enrage/Stoneskin Potion 37,9% mỗi loại · Large Bomb 37,9% · Coral Wood 18,5% · **Tentacle Whip 12,95%** · Caveling ID 12,95% · White Glass Ring 12,95% · Sentry Shield 4,48% · Black Bubble Pearl 3,6%.

**Bảng loot của "Chest" thường theo nhóm biome** `[NGUỒN]` /wiki/Chest:
- *Undergrounds + Clay Caves + Forgotten Ruins*: **4–5 roll / 50 món** — Fiber, Ancient Gemstone, Mechanical Part, Copper/Tin Bar mỗi loại **26,91% có ≥1**; Copper Pickaxe/Shovel/Sword 14,27%; **Lantern 11,56%**; Copper Key 5,92%; Miner Backpack 1,51%; Heart Berry Necklace **0,6%**.
- *Azeos' Wilderness*: **3–6 roll / 39 món** — **Torch ×4–8: 64,28%** (cao nhất!), Wool 36,93%, Scarlet Bar 36,93%, Scarlet Sword/Blowpipe 6,41%, Scarlet Pickaxe 4,31%, Petal Ring **1,09%**.

### 6.4. ⭐ Phòng bí mật — 4 kiểu, mỗi kiểu một cách mở khác nhau

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Scenes

**Định nghĩa chính thức của Pugstorm:** *"A **scene** is a unique area within a Core Keeper world that stands out within a particular biome. Some scenes include useful objects or treasures, some tell a story or provide clues to the lore, others are hidden."* — Steam news 2024-03-11 (dự án "Scene Makers").
Kích thước scene: chủ yếu **5×5, 10×10, 20×20 ô**; một số **40×40 và 60×60**. Patch **1.0.0** thêm **"80+ new hand made scenes"** (≥50 do cộng đồng thiết kế). Patch **1.2.0.3** thêm **17 puzzle room có thưởng**, **8 Echo-Map** (vật phẩm quét bản đồ tìm scene), **6 Titan Shrine**.
`[NGUỒN]` Steam News API app 1621690 — https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1621690&count=200

> ⭐ **Luật seed 2 lớp (rất quan trọng):** patch 1.0.0 ghi rõ — *"Worlds with the same seed contain the same terrain, and **boss arenas and unique items appear in the same locations**. The **exact location of non-boss dungeons and custom scenes MAY DIFFER** even with the same seed."*
> ⇒ Core Keeper **tách world-gen làm 2 lớp**: lớp cốt truyện tất định theo seed, lớp nội dung phụ thì không.

#### (a) MELODY ROOM — mở bằng CHƠI ĐÚNG NỐT NHẠC trước cửa

Đây là cơ chế phòng bí mật đặc trưng nhất của game. **Mỗi Melody Room tặng CHÌA KHOÁ CỦA TIER KẾ TIẾP.**

| Phòng | Biome / giới hạn | Chuỗi nốt | Phần thưởng cố định |
|---|---|---|---|
| **Dirt Melody Room** (2 style) | Undergrounds, max 1 | `CNMB CNM` hoặc `CVBC XZX` | Style 1: Ancient Chest chứa loot Clay Caves + Pedestal có Triangle Trinket. Style 2: Recall Idol + Greater Healing Potion + loot Forgotten Ruins |
| **Clay Melody Room** (2 style) | Clay Caves, max 1 | `XNBN CNCX` hoặc `NCVZ NCVZ` | Style 1: **Copper Chest LUÔN có COPPER KEY** + loot Forgotten Ruins + 2 Pedestal Twisted Agate. Style 2: Larva Hive Chest luôn có Golden Cocoon |
| **Stone Melody Room** (2 style) | Forgotten Ruins, max 1 | `BBNV BXVB` hoặc `NVBV NVBV` | Style 1: **Iron Chest LUÔN có IRON KEY** + Magnetic Ring + loot Locked Scarlet Chest. Style 2: Gold Crystal Necklace, Ancient Gem Plate, Recall Idol ×3, Iron Sword |
| **Nature Melody Room** (2 style) | Azeos', max 2 | `BVCX BCXZ` hoặc `BNCC BNCC` | Style 1: **Ancient Chest LUÔN có SCARLET KEY** + Caveling Medal ×2 + loot Locked Octarine Chest. Style 2: Mold Covered Chest |
| **Sea Melody Room** (2 style) | Sunken Sea, max 2 | `NXNB VBN` hoặc `ZXC NMB` | Style 1: **Seashell Chest LUÔN có OCTARINE KEY** + Golden Jellyfish + Anchor Axe + loot Locked Galaxite Chest |
| **Desert Melody Room** (2 style) | Desert, max 2 | `CNCB VCX` hoặc `BZCV ZCVB` | Style 1: **Golden Ancient Chest** luôn có Kingfish Scale + Black Desert Diamond + loot Locked Solarite Chest |

#### (b) SEALED ROOM — mở bằng CẦM ĐÚNG VẬT PHẨM đứng gần cửa

| Phòng | Biome | Điều kiện mở | Thưởng |
|---|---|---|---|
| **Chipped Blade Temple** | Azeos', **luôn sinh ≥1**, max 3 | **cầm Glow Tulip** | 4 Stone Pedestal luôn có: **Chipped Blade**, Gold Crystal Necklace, Recall Idol, Precious Urn. Tường **Obsidian bất khả phá** |
| **Sealed 3-Wing Temple** | Azeos' | cầm Glow Tulip | 2 Ancient Chest + 4 Pedestal |
| **Sealed Chapel** | Azeos' | cầm Glow Tulip | 1 Ancient Chest + **Pedestal GIẤU SAU MỘT CÂY Lush Tree** chứa Oracle Card "Aura" |

#### (c) MAZE — mê cung tường bất khả phá, rương ở giữa

| Mê cung | Biome | Thưởng |
|---|---|---|
| **Small Maze** | Forgotten Ruins, max 2 | Healing/Enrage/Stoneskin Potion ×3 mỗi loại, Tin Sword |
| **Medium Maze** | Forgotten Ruins + Azeos', **luôn sinh ≥1**, max 3 | Ancient Gemstone ×10, **Ancient Coin ×30**, Iron Bar ×10, Gold Bar ×5, Ocarina, Recall Idol, **Clear Gemstone** |
| **Large Maze** | Forgotten Ruins, max 1 | đầy Caveling + Ancient Crate, **spawn 3 Caveling Brute**. Rương giữa: **Ancient Coin ×250**, Recall Idol ×2, Precious Urn ×5, Crystal Skull Shard ×3, Oracle Card "Aura", Caveling Figurine, Gold Crystal Necklace |
| **Crystal Maze** | Shimmering Frontier | đầy **Mimite** (14 con), Radiation Crystal, Sun Crystal; **1 Solarite Ore Boulder ở giữa** |
| **DesertMazeDungeon Prince/Queen/King** | Desert, **500 / 600 / 700 ô** | Desert Prince/Queen/King Grave luôn chứa **Ra-Akar Automaton / Azeos Feather Fan / Omoroth Compass** (chìa mở 3 rương Epic trong Desert Temple ở ~650 ô) |

#### (d) RƯƠNG CHÔN / VẬT GIẤU

| Scene | Biome / giới hạn | Nội dung cố định |
|---|---|---|
| **Hidden Turf Chest** | Undergrounds, max 3 | chôn trong Turf Block, loot generic |
| **Hidden Clay Chest** | Clay Caves, max 3 | chôn trong Clay Block |
| **Turf Ruins** | Undergrounds, max 1 | giấu trong Tall Grass — **luôn có 5 hạt của cả 5 loại cơ bản** (Heart Berry, Glow Tulip, Bomb Pepper, Root, Grub Kapok) |
| **Sand Ruins** | Undergrounds, max 1 | chôn trong Sand Block — luôn có Ear Plate, Geode, Triangle Trinket, Gold Bar ×5, Ancient Gemstone ×10 |
| **Caveling Grave** | Azeos' | Digging Spot **luôn** rơi Caveling Mother's Ring + Caveling Doll + Small Caveling Skull |
| **Thread of Fate Shrine** | Desert, **luôn sinh ≥1** | bao quanh bởi **Maze Block xếp hình CON MẮT**; Digging Spot dưới Glyph Stele **luôn** rơi Thread of Fate |
| **Cove Stash** | Sunken Sea | **4 Tentacle canh giữ**; 4 Locked Octarine Chest + Pedestal có Solarite Bar; **2 Octarine Key giấu ở dig spot dưới 2 biển Wooden Core** |
| **Lucent Oak Spiral** | Shimmering Frontier | Solarite Chest giữa **luôn có** Jungle Emerald ×3 + Ocean Sapphire ×3 + Desert Ruby ×3 |
| **Mammoth Remains** | Desert | 4 dig spot rơi Crystal Spearhead + 1 rơi Prehistoric Crystal Spear |
| **Dirt Mushroom Farm** | Undergrounds, max 1 | Digging Spot trong lều có **50% rơi Iron Key** |
| **Solitary Tree** | Undergrounds, max 1 | Grass Digging Spot **50% rơi Flintlock Musket** |
| **Giant Mushroom Area** | Undergrounds/Clay, max 2 | chứa **Giant Mushroom — tăng VĨNH VIỄN máu tối đa** |

### 6.5. Drop table quái (số liệu thật)

**Cơ chế:** wiki ghi dạng **"N roll trong bảng M món"**, và bảng thường có mục **"None" (rơi rỗng)**. Có 2 cột: *Chance per roll* và *Chance for one* (xác suất có ít nhất 1).

| Quái | Drop tiêu biểu |
|---|---|
| **Orange Slime** (1 roll/10) | Slime **58,52%** · Scrap Parts 11,72% · Heart Berry/Bomb Pepper/Glow Tulip Seed 8,2% mỗi loại · Fungal Soil 2,34% · Ancient Gemstone 1,17% · **Copper Key 1,17%** · Slime Figurine **0,23%** · Crown Summoning Idol 0,23% |
| **Caveling** (1 roll/21) | Crystal Skull Shard **21,24%** · **None 11,68%** · Copper Ore/Scrap Parts/Fiber 10,62% · Iron Ore/Caveling Bread/Ancient Gemstone/Mechanical Part 5,31% · Caveling Hood 2,12% · Tin Pickaxe 1,59% · **Iron Key 1,06%** · Flintlock Musket 0,27% · Caveling Figurine **0,16%** |
| **Caveling Brute** (Wood ×4 **đảm bảo 100%** + 1–3 roll/20) | None 38,65% · Wood 27,37% · Copper Ore/Fiber/Crystal Skull Shard 18,73% · Battle Axe/Stone Moss 3,9% · bộ Caveling & Stone 2,93% · Ring of Rock/Brute Sign 1,96% · Figurine 0,98% |
| **Shrooman Brute** (2 roll/9) | Mushroom ×3–5 **77,96%** · Stoneskin Potion 46,01% · Ancient Gemstone/Shrooman Cap 10,33% · **Giant Mushroom 5,23%** · Figurine 4,72% · bộ Witch Doctor 3,16% |
| **Bubble Crab** | **None 68,08%** · Octarine Ore/Coral Wood 13,7% · Bubble Gun 2,05% · Sea Shell 1,37% · Topaz Ring 0,68% · Figurine 0,41% |
| **Core Sentry** | **None 53,78%** · Octarine Ore 14,34% · Scarlet Ore/Ancient Gemstone/Mechanical Part 7,17% · Urban Moss 5,02% · Magnet 0,86% · Processor Chip/Mechanical Arm/Ancient Guardian Ring/Sentry Shield 0,72% · Figurine 0,43% · **Sentry Helm 0,11%** (hiếm nhất) |
| **Lava Slime** | Magma Slime 46,66% · None 45,5% · Ancient Gemstone 2,33% · **Galaxite Key 1,17%** · Flame Ring + bộ Grim 0,93% · Figurine 0,37% |
| **Mimite** | None 39,6% · Solarite Ore/Ancient Gemstone 14,85% · Sunrice/Lunacorn Seed 9,9% · Jungle Emerald/Ocean Sapphire/Desert Ruby 2,97% · Figurine + Crystal Shard Club 0,99% |
| **Cocoon** | **Larvlet ×2–5 tại 50%**, rồi 1–2 roll: Fiber ×2–3 (92,86%), Grub Kapok Seed 23,78%, Figurine 0,99% |
| **Colossal Amoeba** | Cytoplasm ×3–5 **99,1%** · Sulfur Bomb 28,9% · Squishy Egg 3,2% · Figurine 2,1% |
| **Sulfur Worm** | Cytoplasm 64,3% · Sulfur Bud 64,3% · Figurine 1,1% |
| **Geobot Patroller** | Mechanical Part 41,9% · Fire Grenade 24,9% · Corrupted Alloy/Oil Grenade/Remote Explosive Pack 13,4% · Flamethrower 1,9% · **Relucite Key 0,7%** · Figurine 0,1% |
| **Geobot Miner** | Corrupted Alloy 64,9% · Mechanical Part 18,2% · Relucite Ore ×1–2 9,3% · bộ Inventor 1,9% · **Relucite Key 0,9%** · Figurine 0,2% |
| **Void Caveling** | Oblivion Fragment ×1–2 67,6% · Corrupted Alloy ×2–4 50,0% · Black Charm Necklace 7,8% · **Void Club 7,0%** · Figurine 0,2% |

**6 quy luật drop rút ra được:**
1. **Mọi quái đều có Figurine riêng, tỉ lệ 0,16%–2,39%** — một "collectible dài hạn" phủ toàn bộ bestiary.
2. **Chìa khoá rơi từ quái đúng tier ở ~0,7–1,2%.**
3. **Mục "None" chiếm tỉ trọng rất lớn ở quái đời sau** (Bubble Crab 68%, Core Sentry 54%) — chống lạm phát item.
4. **Boss dùng nhiều roll** (Glurch: 1 roll bảo đảm/11 món + 5 roll/19 món) ⇒ mỗi lần giết ra nhiều món, và **phải giết lại nhiều lần mới sưu tập đủ**.
5. **Loot theo mùa CỘNG THÊM chứ không thay thế**: Easter (Egg 15%), Halloween (Goodie Bag 10%), Christmas (Snowball 50%, Cookies & Milk 20%).
6. **Ancient Coin gần như không rơi từ quái** — chủ yếu từ rương/plunder (Medium Maze ×30, Large Maze ×250, Locked Copper Chest ×10–20).

### 6.6. ⭐ Phát hiện lớn nhất về hệ loot: đỉnh cao của LOOT là EPIC, không phải LEGENDARY

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Rarity

**Không có vũ khí Legendary nào rơi ra từ rương hay quái.** Cả 6 vũ khí/công cụ Legendary đều **chỉ chế tạo được**:

| Legendary | Chế ở |
|---|---|
| **Phantom Spark** | Solarite Workbench |
| **Soul Seeker** | Solarite Workbench (cần **Ancient Forge** ở Molten Quarry) |
| **Rune Song** | Galaxite Workbench |
| **Credence of Ruin** | Metalcrafter's Table |
| **Titan Breath** | Metalcrafter's Table |
| **Stormbringer** | **Rift Statue** |

Số item theo bậc (đếm trên ~1.741 item): Poor 4 · Common 954 · Uncommon 310 · Rare 270 · **Epic 190** ("Powerful equipment, many of which had to be taken from **Bosses**") · **Legendary 13**.

⇒ **Loot cho Epic; crafting cho Legendary.** Đây là quyết định thiết kế đáng bắt chước: người chơi **không thể may mắn nhảy cóc** tới đồ mạnh nhất.

**Mã màu hex của từng bậc rarity: không tra được** (wiki hiển thị màu bằng ảnh, không có mã).

---

## 7. Trang bị (Equipment) & Paperdoll

### 7.1. Các ô trang bị

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Inventory , https://core-keeper.fandom.com/wiki/Accessories

Core Keeper có **3 BỘ (loadout) trang bị chuyển đổi qua lại được**. Mỗi bộ có đủ ô riêng; **lantern và bag dùng chung cho cả 3 bộ**.

| Ô | Mỗi bộ | Tổng (3 bộ) |
|---|---|---|
| **Helm** (mũ) | 1 | 3 |
| **Chest** (giáp thân) | 1 | 3 |
| **Pants** (quần) | 1 | 3 |
| **Necklace** (dây chuyền) | 1 | 3 |
| **Ring** (nhẫn) | **2** | **6** |
| **Off-hand** (tay trái) | 1 | 3 |
| **Lantern** (đèn) | — | **1, dùng chung** |
| **Bag** (ba lô) | — | **1, dùng chung** |
| **Pouch** (túi phân loại, thêm ở 1.1.0.1) | 4 | 4 |
| **Pet** | có ô riêng trong menu trang bị | — |

- Túi đồ thường: bắt đầu **30 ô**, tối đa **50 ô** với bag tốt. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Inventory , https://core-keeper.fandom.com/wiki/Bags
- **Accessories KHÔNG có độ bền (durability)**; chia 6 loại: ring, necklace, off-hand, bag, lantern, pouch. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Accessories
- *Ghi chú lệch nguồn:* trang Inventory chưa cập nhật ô **pouch**; trang Accessories ghi rõ "…and **4 pouch slots**" cùng lịch sử "1.1.0.1: Added pouch slots".

### 7.2. ⭐ Trang bị nào HIỆN LÊN SPRITE nhân vật

| Loại | Hiện trên sprite? | Nguồn |
|---|---|---|
| **Helm / Chest / Pants (armor)** | ✅ **CÓ** — "Wearing armor **changes the character's appearance** to match the currently equipped armor. Armor may also be **mixed and matched**" | https://core-keeper.fandom.com/wiki/Armor |
| **Vũ khí / công cụ đang cầm** | ✅ **CÓ** — item cầm được vẽ trên tay; Torch có hẳn 3 trạng thái sprite `Held` / `Displayed` / `Placed` với cường độ sáng khác nhau | https://core-keeper.fandom.com/wiki/Torch |
| **Vanity (đồ thời trang)** | ✅ **CÓ**, nhưng **không cho chỉ số nào**: "Vanity items are similar to armor, but **do not provide any benefits** to the wearer" | https://core-keeper.fandom.com/wiki/Vanity |
| **Pet** | ✅ hiện là **sinh vật riêng đi theo**, không phải lớp sprite của nhân vật | https://core-keeper.fandom.com/wiki/Pets |
| **Ring / Necklace / Off-hand / Bag / Lantern / Pouch** | ❌ **không tra được** tài liệu nào nói chúng đổi sprite; lantern chỉ tạo **vầng sáng** quanh nhân vật | — |

### 7.3. ⭐ "Ẩn mũ" / đổi ngoại hình — làm qua NỘI THẤT, không qua ô vanity

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Dresser

> Tooltip trong game: *"Allows changing the equipment shown on your character."*
> Mô tả wiki: *"Interacting with it opens a menu that allows the player to **hide their armor** or **override its appearance** with another armor/vanity piece."*

| Thông tin | Giá trị |
|---|---|
| Cơ chế | **Transmog + Hide** — KHÔNG phải "ô vanity" kiểu Terraria |
| Chế tạo **Dresser** | Wood ×12, Copper Bar ×5 tại **Carpenter's Table** |
| Ra mắt | bản 0.4.0-3f9c |
| Biến thể | **Eerie Dresser** (cùng chức năng) |

⇒ Mô hình rất gọn: **một món nội thất đặt trong nhà, mở ra menu ngoại hình, cho ẩn từng món hoặc ghi đè sprite bằng món khác.**

### 7.4. Paperdoll & tuỳ biến nhân vật

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Character

**7 tham số tuỳ biến khi tạo nhân vật:** body type · skin color · hair style · hair color · eye color · **shirt color** · **pants color**.

`[ĐỀ XUẤT]` Suy ra **thứ tự lớp sprite**: `thân/da → mắt → tóc → quần → áo → mũ → item trên tay`. **Số lớp chính xác trong engine: không tra được.**

**Chỉ số khởi đầu:** 100 health · 100 mana · 100 food · **30 ô túi** · 9–11 melee damage · **20 mining damage** · **20 digging damage** · 100% movement speed · Total Item Level 0.

**11 "Background" (xuất thân)** — mỗi cái +3 level một skill + đồ khởi đầu:

| Background | Perk |
|---|---|
| Explorer | +3 Running, +1 **Small Lantern**, +3 Food Ration |
| **Miner** | **+3 Mining, +1 Copper Pickaxe**, +3 Food Ration |
| Fighter | +3 Melee combat, +1 Copper Sword, +3 Food Ration |
| Chef | +3 Cooking, +1 Cooking Pot, +8 Mushroom |
| Gardener | +3 Gardening, +1 Copper Hoe, +1 Watering Can |
| Fisherman | +3 Fishing, +1 Tin Fishing Rod, +3 Food Ration |
| Ranger | +3 Range combat, +1 Wood Bow, +3 Food Ration |
| Mage | +3 Magic, +1 Simple Staff, +3 Food Ration |
| Warlock | +3 Summoning, +1 Tome of the Dark, +3 Food Ration |
| Demolitionist | +3 Explosives, +10 Crude Bomb, +10 Grenade |
| Nomad | không có gì |

**Loại nhân vật:** Standard (hồi sinh) / **Hardcore** (chết là mất vĩnh viễn). Nhân vật của world Standard/Hard không dùng được ở world Creative và ngược lại ⇒ 4 loại.

**Chế tạo bằng tay (không cần bàn):** Basic Workbench (Wood ×8), Chest (Wood ×5), **Torch ×3 (Wood ×1)**, **Wood Bridge (Wood ×1)**, Wood Pickaxe (Wood ×4), Wood Shovel (Wood ×4).

### 7.5. Rarity, nâng cấp, set bonus

**Rarity — 6 bậc**, thể hiện bằng **màu tên item**: Poor · Common · Uncommon · Rare · Epic · **Legendary**. Item Legendary khi rơi ra **phát tia sáng + tiếng "sheen"**, và **game chặn không cho xoá**. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Rarity

**Bonus ngẫu nhiên / reforging: KHÔNG TỒN TẠI trong Core Keeper.** Item có chỉ số **cố định theo cấp**. Thay vào đó là **Upgrade Station** — nâng weapon/tool/armor/accessory lên **tối đa level 20** một cách **tất định**, có **ô preview chỉ số ở level kế tiếp**, trả bằng **Ancient Coin + thanh kim loại**. Item đã nâng có **icon xanh**, max level có **icon vàng**.
`[NGUỒN]` https://core-keeper.fandom.com/wiki/Upgrade_Station

> ⇒ **Đây chính là lý do mọi chỉ số trên wiki ghi dạng khoảng `+15–900`**: số đầu = level 1, số cuối = level 20.

*Đính chính brief:* **"Ancient Hologram Table"** trong game tên là **Ancient Hologram Pod**, và **KHÔNG phải bàn reforge** — nó là bàn chế **Scanner tìm boss** (+ Expert Lure, Thumper), làm bằng Ancient Gemstone ×5 + Mechanical Part ×5 tại Malugaz Statue. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Ancient_Hologram_Pod

**Set bonus: CÓ** — buff thêm khi mặc **nhiều mảnh giáp và/hoặc phụ kiện** cùng lúc (ví dụ *2 set: +49 mining damage* cho Ring of Rock + Ring of Stone). Bản 1.0.0.1 thêm 13 set bonus, bản 0.7.0.0 thêm 9. `[NGUỒN]` https://core-keeper.fandom.com/wiki/Set_bonus
Game có khoảng **56 bộ giáp** (Peasant, Wood, Copper, Ranger, Rain, Apprentice, Bronze, Chieftain, Iron, Stone, Caveling, Larva, Carapace, Hivebone, Scarlet, Moldweb, Hunter, Octarine, Slime, Sorcerer, Galaxite, Paladin, Assassin, Scarab, **Miner's**, Magma, Solarite, Hazmat, Gemstone, Cosmos, Ninja, Hydra Bone, Core Commander, Pandorium, Sulfossil, Desert Guardian…). `[NGUỒN]` https://core-keeper.fandom.com/wiki/Armor

---

## 8. Đèn + Cuốc

### 8.1. Bảng ĐẦY ĐỦ 10 cuốc

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Pickaxes — chỉ số dạng `base–max` = **item level 1 → 20**.

| # | Cuốc | Mining damage (lv1 – lv20) | Melee dmg | Durability | Item Lv | Sell | Nguyên liệu |
|---|---|---|---|---|---|---|---|
| 1 | **Wood Pickaxe** | +15 – 900 | 17−19 | 200 | 1 | 1 | Wood ×4 (chế tay) |
| 2 | **Copper Pickaxe** | +42 – 1366 | 26−30 | 400 | 2 | 3 | Wood ×4, Copper Bar ×2 |
| 3 | **Tin Pickaxe** | +83 – 1144 | 40−48 | 550 | 4 | 4 | Wood ×4, Tin Bar ×3 |
| 4 | **Iron Pickaxe** | +180 – 1386 | 58−70 | 800 | 6 | 33 | Wood ×4, Iron Bar ×4, Gold Bar ×1 |
| 5 | **Scarlet Pickaxe** | +289 – 1163 | 77−93 | 800 | 9 | 66 | Tin Bar ×4, Scarlet Bar ×6 |
| 6 | **Ancient Pickaxe** | +385 – 1106 **+9,1–14,2% mining speed** | 98−118 | 800 | 11 | 146 | **không chế được** — rơi từ Azeos |
| 7 | **Octarine Pickaxe** | +417 – 1034 | 99−121 | 800 | 12 | 137 | Coral Wood ×10, Octarine Bar ×12 |
| 8 | **Galaxite Pickaxe** | +576 – 1093 | 114−138 | 800 | 14 | 251 | Coral Wood Plank ×20, Galaxite Bar ×20 |
| 9 | **Solarite Pickaxe** | +735 – 1099 | 129−157 | 800 | 16 | 202 | Solarite Bar ×20, Gleam Wood ×20 |
| 10 | **Soul Seeker** ⭐ | +769 – 1150, **+9,7–11,6% mining speed**, **+3 blue glow**, **+1,5% cơ hội nhận quặng phổ biến của tường khi phá tường** | 138−168 | **∞** | 16 | — | Ancient Pickaxe + rất nhiều bar (Cipher Parchment) |

**Không có "Chipped Pickaxe".** Bậc thấp nhất là **Wood Pickaxe**. Brief ghi "Copper → Tin → Iron → Scarlet → Octarine → Galaxite → Solarite" là **thiếu Wood, Ancient và Soul Seeker**.

**Ngưỡng đào được gì** — đối chiếu cột `Damage reduction` ở §2.2. Ví dụ trực quan (dùng **mining damage cơ bản 20 của nhân vật + cuốc**, chưa tính skill/đồ ăn):

| Block | Damage reduction | Cuốc thấp nhất (ở lv1) vượt ngưỡng |
|---|---|---|
| Dirt / Turf / Sand | 1 | **Wood Pickaxe** (20+15 = 35) |
| Clay | 22 | **Wood Pickaxe** |
| Stone / Dark Stone | 55 | **Wood Pickaxe** (vừa đủ) — wiki ghi Forgotten Ruins cần **mining power ≥110** để hiệu quả |
| Grass | 135 | **Iron Pickaxe** (20+180 = 200) |
| Larva Hive | **244** (wiki Biomes ghi "khoảng 280") | **Scarlet Pickaxe** |
| Beach | 242 | **Scarlet Pickaxe** |
| Desert | 355 | **Ancient / Octarine Pickaxe** |
| Crystal / Alien Tech | 535 | **Galaxite Pickaxe** |
| Mold | **660** | **Galaxite Pickaxe** |
| Metropolis | **1050** | **Solarite Pickaxe** + buff |
| Lava Rock | **1224** | **Solarite / Soul Seeker** + buff (đồ ăn Terra Trilobite +344) |
| Oasis | **1279** | như trên |
| Fossil | **1600** | **Soul Seeker/Solarite max level + buff đầy đủ** |
| Obsidian | **bất hoại** | không bao giờ |

`[ĐỀ XUẤT]` — bảng ngưỡng này là phép đối chiếu của người viết giữa hai bảng `[NGUỒN]` (Blocks & Pickaxes); wiki không đăng sẵn bảng ghép này. Ngoại lệ **"Forgotten Ruins cần Mining power ≥110"** là `[NGUỒN]` https://core-keeper.fandom.com/wiki/Biomes

**Công cụ đào khác** `[NGUỒN]` https://core-keeper.fandom.com/wiki/Pickaxes :

| Nhóm | Danh sách | Ghi chú |
|---|---|---|
| **Sledge hammer** (búa tạ) | Copper, Tin, Iron, Scarlet, Octarine, Galaxite | mining damage thấp hơn cuốc (Copper +23–746 … Galaxite +437–828) |
| **Hand drill** (khoan) | Hand Drill (+85–1167), Scarlet Hand Drill (+327–1315, **+8,3–13,7% movement speed**), Obliteration Ray (+800–1073), **Stormbringer** (+1000–1097, độ bền ∞, **+15% movement speed ngắn hạn sau khi đào tường**, **sét lan sang 3 kẻ địch gần**) | dùng để phá **Ore Deposit** |
| **Shovel** (xẻng) | Wood → Galaxite | dùng chỉ số **digging damage**, **KHÁC mining damage** |

**Thời gian đào (giây) từng cuốc: KHÔNG TRA ĐƯỢC.**

### 8.2. Nguồn sáng đeo được

Chi tiết bảng glow đã ở **§3.2**. Tóm tắt riêng nhóm **đeo được**:

| Ô | Item | Glow | Bonus kèm |
|---|---|---|---|
| Lantern | **Small Lantern** | +3–8 | — |
| Lantern | **Lantern** | +4–8 | +9–29 max health |
| Lantern | **Pumpkin Lantern** | +4–8 | +0,5–1,8 HP/giây |
| Lantern | **Orb Lantern** | +5–8 | **+9–20% mining damage** |
| Lantern | **Pearl Lantern** | +5–8 **blue** | +7–9,8% move speed, +1,6–2,6 mana/giây |
| Lantern | **Soul Lantern** | +6–8 **blue** | +32,1–53,5% minion attack speed |
| Helm | **Miner's Protective Helm** | **+4** | +14–18% mining damage |
| Helm | King Slime Crown / Pumpkin Head / Octarine Helm / Galaxite Helm / **Makeshift Goggles** (green) | có | — |
| Ring | **Glow Tulip Ring** / **Polished Glow Tulip Ring** | blue | — |
| Necklace | **Omoroth's Necklace** | **+4 blue** | +10–15% mining damage, +7–11 armor |
| Bag | **Octarine Backpack** | +3–5 blue | — |
| Tay (tool) | **Soul Seeker** | +3 blue | — |
| Tay (item) | **Torch** cầm tay | **×6** (mạnh nhất) | rẻ nhất: Wood ×1 → 3 cái |
| Ăn/cầm | Glow Tulip, Sunrice, Lunacorn (+bản Golden) | blue/orange | — |

**Pet phát sáng: không tra được** item pet nào nằm trong category glow (chỉ có **pet talent "Spirit Animal"** trong danh sách nguồn sáng chính). `[NGUỒN]` https://core-keeper.fandom.com/wiki/Light_sources

---

## 9. Bảng màu & Phong cách art

### 9.1. ⭐ BẢNG MÀU CHÍNH THỨC theo biome (màu minimap — số liệu gốc từ game)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Map — mục "Object colors". Đây là **màu đại diện của từng tile trên minimap**, tức là **tông màu chủ đạo thật của biome đó**, do chính game định nghĩa.

| Biome | Tường (wall) | Nền (ground) | Quặng | Slime nền |
|---|---|---|---|---|
| **Undergrounds** | Dirt `#614927` · Turf `#466751` · Sand `#ac8f3a` | Dirt `#7f5f30` · Turf `#568064` · Sand `#d4b959` | Copper `#ed6057` | Ground Slime `#d96217` |
| **Clay Caves** | Clay `#c16436` · Larva Hive `#a36153` | Clay `#e88b69` · Larva Hive `#c77463` | Tin `#8e7a76` | Ground Acid Slime `#c1aa21` · Chrysalis `#fca694` |
| **Forgotten Ruins** | Stone `#49677d` · Dark Stone `#7b8cac` · Stone Bricks `#6a6c72` | Stone `#678397` | Iron `#829bcb` | Stone Moss `#cff1ff` |
| **Azeos' Wilderness** | Grass `#16831b` · Mold `#599cba` | Grass `#3d9b41` · Mold `#6cbce0` | Scarlet `#ce3b3b` | Ground Poison Slime `#b856a5` · Lush Moss `#a3ce4a` |
| **Sunken Sea** | Beach `#b4939a` · Metropolis `#314d57` | Beach `#ebc0be` · Metropolis `#578084` | Octarine `#8b52ee` | Ground Slippery Slime `#2f2fff` · Urban Moss `#2ad23e` |
| **Desert of Beginnings** | Desert `#a69298` · Desert Temple `#006cb1` · Maze `#3c4f39` · **Lava Rock `#383447`** | Desert `#d29a7c` · Temple `#9e8a86` · Lava Rock `#554e6a` | Galaxite `#f7f0dc` | Ground Magma Slime `#ff5400` · Valley Moss `#f97443` |
| **Shimmering Frontier** | Crystal `#2a70ba` · Alien Tech `#463e66` | Crystal `#3988db` · Alien Tech `#456a73` | Solarite `#ffbe4e` | Crystal Crust `#ffe08e` |
| **Meadow** | `#e0c961` | `#efe1b3` | — | — |
| **The Passage** | (Fossil — không có trong bảng màu) | — | Pandorium (—) | — |

**Màu chất lỏng & vật thể** `[NGUỒN]` cùng trang:

| Đối tượng | Màu |
|---|---|
| Water | `#1e3d81` |
| **Sea Water** | `#34d0ff` |
| **Shimmering Water** | `#9ac6f3` |
| Larva Hive Water | `#756730` |
| Mold Water | `#3d5587` |
| **Lava** | `#de3501` |
| **Pit (hố)** | `#1f1f1f` |
| **Great Wall** | `#135e52` |
| **Obsidian** | `#162a27` |
| Gold Ore | `#f2cc3d` · Ancient Gemstone `#0093ff` |
| Gleam Wood | `#29aedf` · Coral Wood `#fa59a3` · Wood `#e1a368` |

⇒ **Đọc ra được phong cách màu:** mỗi biome có **một cặp màu tường-tối / nền-sáng cùng tông** (ví dụ Dirt `#614927` tối ↔ `#7f5f30` sáng), và **quặng luôn là màu bão hoà cao chọi lại nền** (Copper đỏ cam `#ed6057` trên đất nâu, Octarine tím `#8b52ee` trên nền hồng be, Solarite vàng `#ffbe4e` trên nền xanh crystal). **Đó chính là lý do quặng "nhảy ra" khỏi tường trong bóng tối.**

### 9.2. Kích thước tile & sprite

**KHÔNG TRA ĐƯỢC số liệu chính thức** — Pugstorm không công bố, wiki không đăng.

`[ĐỀ XUẤT]` **Đo gián tiếp**: truy vấn MediaWiki imageinfo API của fandom cho các file icon gốc cho ra:
`File:Dirt Block.png` = **64×64**, `File:Torch.png` = **64×64**, `File:Copper Pickaxe.png` = **64×64**, `File:Orange Slime.png` = **56×52**.
Vì 56/4 = 14 và 52/4 = 13 (số nguyên), rất nhiều khả năng wiki đang **phóng to đúng 4×** từ sprite gốc ⇒ **tile gốc ≈ 16×16 px**, sprite quái nhỏ ≈ 14×13 px. **Đây là suy luận, không phải số liệu chính thức.**
(Phương pháp: `https://core-keeper.fandom.com/api.php?action=query&titles=File:Dirt+Block.png&prop=imageinfo&iiprop=size&format=json`)

**Kích thước sprite nhân vật, số frame animation đi/đứng/đánh: KHÔNG TRA ĐƯỢC.** Wiki không có mục nào về số frame.

### 9.3. Cảm giác thị giác — cái gì tạo nên "chất Core Keeper"

Tổng hợp từ các `[NGUỒN]` đã dẫn ở §3:

1. **Pixel art nhưng đèn 3D thật.** "Internally Core Keeper is a 3D game, which is how many of the advanced lighting techniques are achieved." — https://core-keeper.fandom.com/wiki/Light_sources
2. **Bounce light ăn màu bề mặt** (0.5.2.0-b84a) ⇒ đứng trong hang đất thì ánh đuốc **ngả vàng ấm**, trong hang crystal thì **ngả xanh lạnh**. Không phải một vòng sáng trắng chung.
3. **Bóng đổ vật thể có 3 mức** (Off / Simple / **Advanced**) và **ambient occlusion tới mức High** ⇒ pixel art nhưng vật thể có khối. — https://core-keeper.fandom.com/wiki/Settings
4. **Chất lỏng phản chiếu vật thể** (setting Reflections). — cùng nguồn
5. **Bloom** bật mặc định ⇒ nguồn sáng "loé" ra.
6. **Ánh sáng ấm nhỏ giữa hang tối rộng**: đuốc cầm tay `#ffeecc` cường độ ×6 là điểm sáng duy nhất; roof light gần như **không tồn tại ở 3 biome vòng trong**. — https://core-keeper.fandom.com/wiki/Roof_light , https://core-keeper.fandom.com/wiki/Torch
7. **Viền phân cách giữa hai loại tường khác nhau** (thêm ở 0.6.0.0) thay vì liền mạch ⇒ ranh giới biome đọc được ngay bằng mắt. — https://core-keeper.fandom.com/wiki/Walls
8. **Có chế độ Color Output 15-bit và 15-bit (Dither)** — tuỳ chọn "retro hoá" bảng màu. — https://core-keeper.fandom.com/wiki/Settings
9. **Camera gần như luôn khoá nhân vật ở CHÍNH GIỮA màn hình.** — https://core-keeper.fandom.com/wiki/Character
10. Tag Steam chính thức: **"Pixel Graphics"**. — https://store.steampowered.com/app/1621690/Core_Keeper/

---

## 10. Cây kỹ năng (Skills)

`[NGUỒN]` https://core-keeper.fandom.com/wiki/Skills

### 10.1. Cơ chế chung

| Quy tắc | Chi tiết |
|---|---|
| Số cây kỹ năng | **12** (không phải 9 như brief) |
| Level tối đa mỗi cây | **100** |
| Talent point | **+1 point mỗi 5 level** ⇒ 20 point từ lv1→100, **+5 point thưởng khi đạt lv100** ⇒ **tối đa 25 point/cây** |
| Cấu trúc cây | node chia **4 tier**; muốn mở tier sau phải **đầu tư đủ 5 point vào tier trước** |
| Mỗi node | tối đa **5 point**; số liệu ghi `min–max` = 1 point → 5 point |

⚠️ **Đính chính brief:** game gọi là **"Range combat"** và **"Melee combat"**. **Không có cây "Exploration"**. Có thêm **Vitality** và **Explosives**. (Magic & Summoning thêm ở **1.0.0.1**; Explosives thêm ở **1.1.0.1**.)

### 10.2. Bảng 12 cây + bonus thụ động + cách lấy XP

| # | Skill | Bonus thụ động (max lv100) | Lấy XP bằng |
|---|---|---|---|
| 1 | **Mining** | +1 mining damage/lv → **+100** | đánh tường — **1 XP/nhát** (phải gây ≥12 damage) |
| 2 | **Running** | +0,1% move speed/lv → **+10%** | đi bộ — ~**1 XP/ô** |
| 3 | **Melee combat** | +0,5% physical melee damage/lv → **+50%** | **1 XP/cú vung trúng** (trúng nhiều địch vẫn 1 XP) |
| 4 | **Vitality** | +1 max health/lv → **+100** | giết sinh vật — **XP = max health của nó, cap 1000** |
| 5 | **Crafting** | +0,5% armor/lv → **+50%** | chế tạo item |
| 6 | **Range combat** | +0,5% physical range damage/lv → **+50%** | 1 XP/hit |
| 7 | **Gardening** | +0,4% cơ hội nhận thêm item khi thu hoạch/lv → **+40%** | 1 XP/cây thu hoạch |
| 8 | **Fishing** | +1 fishing power/lv → **+100** | 1 XP/lần câu được |
| 9 | **Cooking** | +0,2% cơ hội thêm 1 món khi lấy khỏi Cooking Pot/lv → **+20%** | 1 XP/món lấy ra |
| 10 | **Magic** | +0,5% magic damage/lv → **+50%** | 1 XP/hit |
| 11 | **Summoning** | +0,5% minion damage/lv → **+50%** | **minion của bạn** đánh trúng — 1 XP/hit |
| 12 | **Explosives** | **+1% explosives damage/lv → +100%** | 1 XP/hit |

### 10.3. Perk đáng chú ý theo cây (đủ 8 node × 12 cây)

**1. Mining** — Efficient excavation (+2–10% mining dmg) · **Meticulous miner** (+3–15% cơ hội thêm quặng) · Self-mending alloy (+2–10 durability khi phá tường có quặng) · Miner's strength (+2–10% mining dmg cộng vào melee) · **Mine, mine, mine!** (+3–15% mining speed) · Explosives engineer (+4–20% explosives dmg) · **Pick and run!** (+4–20% move speed ngắn hạn sau khi đào 1 tường) · **Archaeologist** (+0,2–1% rơi item giá trị từ **bất kỳ tường nào**).

**2. Running** — Endurance runner (−5–25% food khi chạy) · Balanced stance (+5–25% dodge sau khi đứng yên) · Gotta go fast! (+2–10% speed sau khi chạy liên tục) · On your toes (+4–20% speed sau khi né được) · Escape artist (−10–50% thời gian snare/stun) · Keeping tempo (+3–15% damage sau khi chạy liên tục) · **Encumbering presence** (địch gần **−4–20% move speed**) · Breaking barriers (+6–30% armor theo mức tăng move speed).

**3. Melee combat** — Quick strikes (+2–10% attack speed) · **Building anger** (+2% melee dmg mỗi hit, cộng dồn 2–10 lần) · Fast and furious (+2–10% cơ hội +50% attack speed) · Heavy swings (+3–15% knockback) · Stubborn fighter (+3–15% dmg khi đánh liên tiếp **cùng một mục tiêu**) · Taking a step back (+4–20% cơ hội →+30% range dmg) · Seething blade (10% cơ hội hồi +1–5% máu) · **Strength of the Ancients (+4–20% damage lên BOSS)**.

**4. Vitality** — Maxed out! (+6–30% tổng skill point cộng vào max HP) · Strong and healthy (+2–10% dmg khi đầy máu) · Desperate fighter (+4–20% dmg khi máu thấp) · Stayin' alive (+0,2–1 HP/giây khi dưới nửa máu) · Healing potency (+6–30% hồi máu theo thời gian) · Lingering potions · **Protection of the Ancients (−3–15% damage nhận từ BOSS)** · **Cheat death (+2–10% cơ hội hồi chút máu thay vì chết)**.

**5. Crafting** — Base builder (+6–30% cơ hội thêm item khi chế wall/floor/bridge/fence) · **The right tools in the right hands** (+4–20% cơ hội **không mất durability** khi dùng tool/weapon) · High quality equipment (+4–20% cơ hội trang bị không mất durability khi bị đánh) · Alchemist · Industry specialist (+1–5 rail/wire/conveyor) · Blacksmith (−5–25% nguyên liệu ở anvil & sửa đồ) · Jewelry crafter (+10–50% cơ hội ra bản "polished") · Unbreakable (+6–30% armor khi máu thấp).

**6. Range combat** — Rapid shots (+2–10% attack speed) · Keeping momentum (+2% range dmg/hit, dồn 2–10) · Weakness detection (+2–10% cơ hội +100% crit chance) · **Slimy bullets (20% cơ hội làm chậm 8–40%)** · Charging in (+4–20% cơ hội →+30% melee dmg) · **Stun shot (+4–20% cơ hội STUN)** · Focused accuracy (+5–25% range dmg sau khi đứng yên) · Amplified precision (+8–40% crit damage).

**7. Gardening** — Grateful gardener (+5–25% cơ hội nhận hạt) · Eat your vegetables! · Feast for the eyes (+1–5 food khi thu hoạch) · Thorny weapons (+5–25% crit dmg) · **Thorny skin (+10–50 thorns damage)** · **Poison coated weapons (+3–15% cơ hội gây poison; poison GIẢM 75% lượng hồi máu của địch)** · Expert gardener (+3–15% cơ hội ra cây golden) · Potent poison (+5–25% dmg lên mục tiêu đang poison).

**8. Fishing** — Improved bait (+5–25% cá cắn nhanh) · Fisherman's luck (+4–20% cơ hội có cá) · Angler's advantage (+2–10% cá rarity cao) · Studied patterns (+2–10% dodge) · **Steady feet (−10–50% ảnh hưởng của mặt đất trơn)** · Chewy bait (+5–25% cơ hội không mất mồi) · Well-trained aim (+6–30% fishing cộng vào range damage) · **Power of Omega-3! (+3–15% dmg lên BOSS sau khi ăn cá)**.

**9. Cooking** — Utilizing every nutrient (+5–25% food) · Not so picky · Healthy diet (+20–100% buff "Well fed") · Fast food (+1–5% melee attack speed) · Long-lasting food (+6–30% thời lượng buff) · **The smell of food (+4–20% damage cho BẠN VÀ MỌI ĐỒNG ĐỘI gần đó)** · Master chef · **Sharing is caring (+0,1–0,5 HP/giây cho cả nhóm)**.

**10. Magic** — True sight (+1–5% crit chance) · Mana channeling (+2–10% mana hồi khi crit) · Firmly grounded (−5–25% trễ hồi magic barrier) · **The best offense (+10–50% magic barrier cộng vào magic damage)** · Arcane frenzy (+10–50% magic dmg ngắn hạn khi crit) · Arcane transfusion · **Fully charged (tới +6–30% magic dmg tuỳ lượng mana còn lại)** · Mana recharge.

**11. Summoning** — Ferocious creatures (+4–20% minion attack speed) · Critical command · **Power in numbers (+2–10% range attack speed MỖI minion đang sống)** · Trickle down arcana · Tough gang (+15–75 magic barrier mỗi minion) · Group effort (+2–10% magic dmg mỗi minion) · Longing for this world (+10–50% tuổi thọ minion) · **Vengeful spirit (minion hồi +1–5% máu cho bạn khi biến mất)**.

**12. Explosives** — **High Velocity Charge (+10–50% BÁN KÍNH NỔ)** · Phantom Bombs (+6–30% cơ hội không tiêu hao bom) · Auto Salvage · **Composite Armor (−16–80% damage từ vụ nổ của chính bạn & đồng đội)** · Mana Blast (+5–25 mana khi nổ) · Adrenaline Rush (+10–50% melee dmg ngắn hạn sau khi nổ) · After Burn (+10–50% burning damage) · **Napalm (+20–100% cơ hội sinh napalm từ vụ nổ)**.

---

## 11. Cái gì bê sang game 2D mobile dọc của tôi

17 gạch đầu dòng. Mỗi cái: **giữ gì** + **vì sao**.

1. **Giữ "một item block = hai dạng: tường và nền"** (`[NGUỒN]` §2.1). Đặt lên hố/nước → thành nền; đặt lên nền → thành tường. **Vì sao:** một nút, hai chức năng, không cần menu chọn chế độ xây — cực hợp màn hình dọc chật chội và điều khiển bằng ngón cái.

2. **Giữ cặp chỉ số `wall health` + `damage reduction`, KHÔNG dùng "pickaxe tier" kiểu Minecraft** (`[NGUỒN]` §2.2). **Vì sao:** một con số duy nhất (mining damage) vừa quyết định *có phá nổi không* vừa quyết định *mấy nhát* — dễ hiển thị trên UI hẹp, và **cho phép buff bằng đồ ăn/trang sức thay vì bắt buộc phải có cuốc đúng bậc**, tức là người chơi có nhiều đường tiến hơn.

3. **Giữ bảng độ cứng gần như nguyên xi (135 / 179 / 300 / 445 / 550 / 700 / 850 / 950 / 1086 / 1415)** (`[NGUỒN]` §2.2). **Vì sao:** đây là đường cong đã được cân bằng qua nhiều năm; bước nhảy ~1,3–1,5× mỗi biome giữ nhịp "vừa mới đủ sức" liên tục. Khỏi phải tự dò.

4. **Giữ bố cục vòng đồng tâm quanh một tâm cố định** (`[NGUỒN]` §1.1). **Vì sao:** trên mobile dọc, người chơi mất phương hướng rất nhanh. "Về nhà = đi về tâm" là quy tắc định hướng chỉ cần một câu để dạy, và minimap tròn nhỏ ở góc là đủ.

5. **Giữ ranh giới biome bằng HÀO/HỐ + một bức tường bất hoại (Great Wall)** (`[NGUỒN]` §1.1). **Vì sao:** khoá tiến trình bằng **địa hình** thay vì bằng level, nên không cần popup "bạn chưa đủ cấp". Người chơi tự thấy tường và tự hiểu.

6. **Giữ mô hình 3 tầng world-gen: Dungeon (procedural, có weight) → Scene (prefab tay) → Territory (ổ quái bán kính 25–40 ô)**, và **luật "dungeon sinh trước, scene không chen vào chunk của dungeon"** (`[NGUỒN]` §1.4). **Vì sao:** cho 90% thế giới random rẻ tiền nhưng vẫn có 10% khoảnh khắc thủ công đáng nhớ. Bảng weight của Core Keeper (0.07–0.55) dùng thẳng được.

7. **Giữ "roof light" làm cần gạt độ tối theo tiến trình** (`[NGUỒN]` §3.4). **Vì sao:** vòng trong tối om, vòng ngoài có lỗ trần sáng như ngoài trời — cho người chơi **cảm giác tiến bộ bằng ÁNH SÁNG** chứ không phải bằng con số. Trên mobile màn hình nhỏ, thay đổi độ sáng tổng thể là tín hiệu mạnh hơn bất kỳ HUD nào.

8. **Giữ ánh sáng ăn màu bề mặt (bounce light theo tông biome), nhưng làm bằng SHADER 2D RẺ** (`[NGUỒN]` §3.1, §3.6 — chính Pugstorm phải để Light quality mặc định *Medium* vì tốn hiệu năng). **Vì sao:** đây là chữ ký thị giác của Core Keeper, nhưng bản gốc render đèn 3D — trên mobile phải giả lập bằng **một mặt nạ radial gradient nhân với màu chủ đạo của biome** (bảng hex ở §9.1 có sẵn), không được đổ bóng thật.

9. **Giữ nguyên tắc "quặng là màu bão hoà cao chọi lại nền tối", cộng đốm lấp lánh trắng** (`[NGUỒN]` §1.7, §9.1). **Vì sao:** trên màn hình điện thoại 6 inch giữa ban ngày, đây là cách duy nhất để người chơi thấy quặng mà **không cần phóng to**. Bảng hex ở §9.1 dùng thẳng.

10. **Giữ khuôn mẫu boss "một chiêu duy nhất + vũng debuff + enrage ở 30% máu + leash-hồi-máu"** (Glurch/Ivy/Morpha/Igneous — `[NGUỒN]` §5.1, §5.21). **Vì sao:** boss chỉ có **một** pattern nhảy nên **đọc được hoàn toàn trên màn hình dọc hẹp**; độ khó đến từ vũng slime thu hẹp không gian đứng, không đến từ việc phải nhớ 6 chiêu. Đây là boss đầu game hoàn hảo cho mobile.

11. **Giữ cơ chế "phá giáp → boss tê liệt X giây → soft-cap 25% máu mỗi lần"** (Druidra/Crydra/Pyrdra/Urschleim; Core Commander dùng 50%) (`[NGUỒN]` §5.13–5.16). **Vì sao:** ép trận boss thành **4 vòng có nhịp giống nhau** thay vì một thanh máu dài lê thê ⇒ mỗi vòng là một "màn" ngắn 30–60 giây, đúng độ dài một lượt chơi mobile, và **chống được cả việc người chơi mang đồ quá mạnh** phá vỡ trận đấu.

12. **Giữ mẫu boss 2 pha "về 0 máu thì KHÔNG chết mà biến hình + hồi đầy máu"** (Malugaz xé áo choàng tự bốc cháy; Core Commander thành "Unleashed") (`[NGUỒN]` §5.5, §5.16). **Vì sao:** cú lật cảm xúc mạnh nhất trong cả game, mà chi phí làm chỉ là **một bộ sprite thứ hai + một bộ chiêu thứ hai**. Thêm luật "cả đội chết ở pha 2 thì boss về pha 1" để không phạt quá nặng.

13. **Giữ bullet-hell hình học của Azeos & Core Commander: HÀNG hai bên / HÀNG trên-dưới / VÒNG xoay khép vào / CỤM 4 hướng / VÒNG CÓ MỘT KHE HỞ** (`[NGUỒN]` §5.6, §5.16). **Vì sao:** các pattern này là **hình học thuần**, đọc tốt ở mọi tỉ lệ màn hình, code bằng vài dòng lượng giác, và **"vòng có một khe hở" đặc biệt hợp màn hình dọc** vì buộc người chơi di chuyển theo trục dọc.

14. **Giữ "boss tự hồi máu nếu người chơi bỏ lỡ vật thể phụ"** (Azeos: blue crystal bị thunder beam sạc sẽ hồi máu cho boss; Igneous: magma blob bò về hồi 10% máu, 1 đòn là vỡ) (`[NGUỒN]` §5.6, §5.11). **Vì sao:** tạo **mục tiêu phụ có deadline** mà không cần thêm UI — người chơi tự học "phải xử cái kia trước". Rất hợp lối chơi một ngón: một cú vuốt là phá xong blob.

15. **Giữ hệ trang bị: giáp HIỆN LÊN SPRITE (mũ/áo/quần, mix-and-match) + đổi ngoại hình qua MỘT MÓN NỘI THẤT (Dresser: ẩn hoặc ghi đè sprite), KHÔNG làm ô vanity riêng** (`[NGUỒN]` §7.2, §7.3). **Vì sao:** paperdoll 3 lớp là mức thấp nhất mà người chơi vẫn "thấy mình khoẻ lên"; còn dồn transmog vào một món nội thất thì **tiết kiệm được 3–6 ô UI** trên màn hình dọc vốn đã chật.

16. **Giữ 12 cây skill chỉ lên bằng HÀNH ĐỘNG, không có nút "phân phối điểm" toàn cục** — Mining lên bằng đánh tường, Running lên bằng đi bộ, Vitality lên bằng giết quái (XP = max HP của con đó, cap 1000) (`[NGUỒN]` §10.2). **Vì sao:** không cần màn hình level-up chen ngang; người chơi mobile chơi ngắt quãng vẫn thấy tiến bộ. **Chỉ nên bê 4–5 cây** (Mining, Melee, Running, Vitality, Cooking) — 12 cây × 8 node là quá nhiều cho màn hình dọc.

17. **Giữ ba "cần gạt" cân bằng của Core Keeper thay vì bảng cấu hình phức tạp**: (a) tuỳ chọn world gen dạng slider — Ore density / Tunnels / Chambers / Rivers / Lakes / Pits / Ceiling holes; (b) 3 mức Casual/Standard/Hard với hệ số HP & damage **×0,5 / ×1 / ×1,5**; (c) **HP boss tăng theo số người chơi** (`[NGUỒN]` §1.5, §5.0). **Vì sao:** cùng một bộ dữ liệu boss phục vụ được cả người chơi thường lẫn người chơi khó, chỉ bằng hai hệ số nhân — rẻ nhất có thể về mặt nội dung.
