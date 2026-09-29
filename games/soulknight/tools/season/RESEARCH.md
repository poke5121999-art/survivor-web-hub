# Soul Knight — Season Mode ("Escape from Monkia") — Nghiên cứu & design brief

Ngày: 2026-09-29. Không viết mã game. Nhãn nguồn: `[ẢNH]` thấy trong ảnh chụp (tên tệp), `[SPRITE]` thấy trong bộ sprite rip (bundle/sprite), `[WIKI]` trang wiki soul-knight.fandom.com, `[ĐOÁN]` suy luận của tôi.

Tên chính thức trên wiki là **Escape from Monkia** (mùa "Season" ra ở Update 8.5.0, ngày 6/8/2026; 8.6.0 ra 20/9/2026 chỉ chỉnh giao diện/skin) [WIKI: Update 8.5.0, Update 8.6.0, Changelog]. Ảnh của chủ dự án là bản 8.6.0.19 (dòng UID góc dưới phải) [ẢNH e_0929_101229.jpg]. Bundle sprite là 8.5.1 nên hơi cũ hơn ảnh nhưng bố cục khớp. Trang wiki còn gắn `{{WIP}}` (chưa hoàn chỉnh) [WIKI: Escape from Monkia].

Cache wiki thô: `~/Downloads/sk-ref/wiki-cache/` (`page_Escape_from_Monkia.json`, `page_Escape_from_Monkia_Items.json`, `page_Season_Coins.json`, `page_Season_Shop.json`, `page_Update_8.5.0.json`, `page_Update_8.6.0.json`, `page_Changelog.json`, `search_*.json`).

---

## (a) Vòng lặp chế độ

1. **Căn cứ (Base)**: ngoài trời, rừng thông; không mất độ no, không dùng được vật phẩm tiêu hao [WIKI: Bases]. Ở đây nhận nhiệm vụ, cất/lấy đồ ở Warehouse, mua bán ở Store, chế tạo (Workbench/Kitchen/Medical Station), nâng cấp ở Training Facility, đổi nhân vật ở Tent [WIKI: Bases].
2. **Triển khai (deploy)**: nhân vật đi vào cổng xoáy xanh ở rìa bắc căn cứ [ẢNH g_0929_101301.jpg: xoáy xanh phía bắc bản đồ "Map - Base"; SPRITE escape_map/Init]. Nút Map mở bản đồ. Ngoài ra có Teleporter (mở khoá bằng Design Table) dịch chuyển tới "beacon" đã kích hoạt trên bản đồ (quest "Tide Zone Beacon") [WIKI: Teleporter, Drillmaster quests]. [ĐOÁN] cổng xoáy = đường ra bản đồ đầu tiên (Base Outskirt).
3. **Bản đồ**: khu rộng nhiều vùng (Base Outskirt, Tide Zone, Volcanic Zone, Volcano Core, Research Lab, Underground Base): "khám phá bản đồ lớn gồm nhiều khu vực, tìm tài nguyên, đánh quái, rồi sơ tán cùng chiến lợi phẩm" [WIKI: Introduction]. Chỉ chơi đơn [WIKI].
4. **Loot/đánh**: quái là khỉ (Macaque/Ape) cầm vũ khí chơi được thật; mọi quái/boss rớt "Monster crate" chứa đúng vũ khí nó cầm + Violet Energy [WIKI: Monster crate]. Có 5 loại thùng khác (Resource, Food, Medical, Supply, Misc) [WIKI: Crates & Items]. Đào kho báu bằng Treasure Map (đánh dấu xanh trên bản đồ) [WIKI: Items/Treasure]. Cứu nhân vật khác rồi hộ tống về điểm sơ tán để dùng được họ [WIKI: Characters].
5. **Sơ tán (extract)** về căn cứ: quest "Successfully extract 1 times" [ẢNH h_0929_101314.jpg]. Ký hiệu điểm sơ tán trên bản đồ là hình người chạy màu xanh lá [SPRITE escape_ui_texture/point_escape]. Sau khi sơ tán, đồ trong balô mang về, cất kho, bán, chế.
6. **Chết**: wiki KHÔNG ghi. Ảnh có ô "Secure Box" (hộp an toàn) riêng biệt với Balô và Trang bị [ẢNH f_0929_101253.jpg]. [ĐOÁN] theo thể loại extraction-shooter: chết thì mất toàn bộ balô + trang bị đang mặc; giữ Secure Box và Warehouse. Quy tắc này là giả định cần chủ dự án xác nhận.

Ghi chú: hotfix 8.5.11 thay boss của mùa bằng boss lấy từ dungeon (Level mode) [WIKI: Bosses note]. Hotfix 8.5.0.13 nâng Warehouse khởi đầu từ 28 lên 64, bước nâng từ 12 lên 32, và chỉnh stack/weight nhiều vật phẩm [WIKI: Trivia].

## (b) Bố cục căn cứ & NPC

- Bản đồ căn cứ là ảnh `escape_map/Init.png` 1151x688 [SPRITE]. Nhìn tổng: khoảng đất trống giữa rừng thông; đường đất dạng chữ T; xoáy xanh ở đỉnh phía bắc; bên trái có bàn đá + sạp (nhóm Building); giữa-trái là quầy mái tím (Store); dưới-giữ có đống thùng/kho (Warehouse) [SPRITE escape_map/Init; ẢNH g_0929_101301.jpg].
- Trong ảnh gameplay: quầy mái tím có tinh thể tím (Store) ở trên, cụm bệ đá xanh rêu góc trên-trái (giống Training Facility), đống thùng góc dưới-phải (Warehouse), NPC đội mũ cảnh sát/quân sự ở góc trên-phải, mèo đen đi theo người chơi [ẢNH e_0929_101229.jpg]. Icon chế độ là mặt nhà khảo cổ đội mũ safari [ẢNH i_0929_101349.jpg; SPRITE escape/season_icon_Escape 33x34].
- Cơ sở của Base theo wiki: Store (mua bán, sửa đồ; máy bán hàng bán 200% giá trị), Training Facility, Warehouse, Design Table (mở khoá/nâng công trình), Tent (đổi nhân vật/skill/skin), Workbench, Kitchen, Medical Station, Teleporter [WIKI: Bases]. Chỉ Store, Training, Warehouse, Design Table có sẵn; Tent, Workbench, Kitchen, Medical Station, Teleporter phải xây bằng Design Table [WIKI: Base's upgrades; Drillmaster quests "Build Workbench" v.v.].
- NPC: **Drillmaster** (giao nhiệm vụ mở màn); **Archaeologist** (cứu về, đứng cạnh Drillmaster, giao chuỗi quest điều tra); các nhân vật khác được cứu cũng ở lại Base và giao quest [WIKI: NPCs & Quests]. [ĐOÁN] sprite `npc_trainer_*` (28-31 px, mũ cảnh sát) là Drillmaster, khớp NPC góc trên-phải ảnh e; `npc_explorer_*` (mũ safari) là Archaeologist.
- Tất cả tòa nhà đã rip: xem sheet_buildings.png; `Building_4` (quầy mái tím) khớp Store; `Building_3` (bàn nấu có lửa) [ĐOÁN] Kitchen; `Building_6` (bảng bản thiết kế xanh) [ĐOÁN] Design Table; `Building_7/8` (sạp cam) [ĐOÁN] Workbench/Store phụ; `Teleporter_0` (47x33, đế kim loại) là Teleporter [SPRITE escape/Teleporter_0]; `Tent`, `Tent_0/1/2` là các lều [SPRITE].

## (c) HUD và các bảng UI (đo trên ảnh 1386x640; toạ độ px trên ảnh thu nhỏ)

**HUD căn cứ** [ẢNH e_0929_101229.jpg]:
- Khung trạng thái góc trên-trái x24-242, y10-152: 4 thanh xếp dọc, mỗi thanh cao ~22px, x~72-230: HP đỏ 19/19 (y30), Giáp xanh-xám 0/0 (y60), Năng lượng xanh 200/200 (y91), Độ no vàng kèm icon đùi gà 100/100 (y133) [SPRITE icon_food 9x9 / icons; icon_bar/bar/bar_bg]. Thanh no là hàng thứ tư, khác Level mode chỉ có 3 thanh.
- Bộ đếm xu góc trên-phải x1105-1215, y24-62: icon xu sắt + "0" [ẢNH; SPRITE escape_ui_texture/icon_coin 12x14 hoặc Coin 16x16]. Nút Pause xanh x1295-1370, y12-78 [SPRITE btn_pause 18x17].
- Cột trái ba nút, mỗi icon ~52px, nhãn chữ nằm ngay dưới: Quest (135,230), Map (135,318), Backpack (135,420) [SPRITE icon_mission 30x21, icon_map 27x22, icon_bag 25x23].
- Joystick ảo trái-dưới, tâm (232,516), bán kính ~78.
- Ba ô tiêu hao (Consumables) tròn ~66px, tâm x 592/693/794, y542; nhãn "Consumables" y597 [ẢNH; SPRITE Qucik_using_item_base1 34x34, Qucik_using_item_outline1/2 38x38, SELECTED 38x38].
- Nút Sprint phải: vòng tròn đường kính ~86 tâm (1320,268), icon ba mũi tên xanh, nhãn "Sprint" dưới nó [SPRITE icon_dash 24x18].
- Nút emoji (1040,378) ~60px. Nút kỹ năng nhân vật mờ (1290,400) ~100px, kèm nhãn nhỏ "0" xanh (1250,372) [ĐOÁN] đếm số lần sprint/charge hoặc cooldown.
- Nút tấn công (kính ngắm) tâm (1153,517) đường kính ~150; nút đổi vũ khí tâm (1297,540) ~100, hiện icon vũ khí.
- Số phiên bản/UID góc dưới-phải.

**Thanh tab trên cùng khi mở bảng** [ẢNH f/g/h]: ba icon Quest (568,48) | Backpack (690,48) | Map (817,48), gạch chân xanh dưới tab đang chọn, y~78 x505-880. Mockup còn có mũi tên trái/phải hai bên tab [SPRITE escape/ventory, escape/task; arrow_left/right 9x15]. Mockup `ventory` cho thấy bố cục chuẩn (xem sheet_ui_layout_mockups.png).

**Bảng Backpack/Equip/Warehouse** [ẢNH f_0929_101253.jpg]:
- Panel "Equip" x112-532, thanh tiêu đề y88-122 (nút X đỏ ở x500). Hai hàng x bốn ô, ô ~58px: hàng 1 = Backpack, Armor, Weapon, Weapon (x180/275/369/463, y165); hàng 2 = Amulet x4 (ô đầu mở, ba ô sau có khoá) (y250).
- Panel "Secure Box" x543-630, một ô đơn tâm (586,160), nhãn dưới y223.
- Panel "Backpack(0/15)" tiêu đề y~320 kèm hai nút "Store All" (383,320) và "Sort" (480,320); lưới 5 cột x 162/242/321/401/480 (bước ~79), hàng y 390/468/546... (15 ô = 5x3). Dưới cùng thanh "Weight:" và chữ "Total Weight: 0/40" (y590).
- Cột lọc dọc x850-910 gồm 6 icon (y 157/213/268/322/378/433): tất cả, túi (balô), giáp, bình thuốc, súng, tinh thể [SPRITE icon_types_0..5 16x16].
- Panel "Warehouse(0/64)" x912-1272, nút "Sort" và X; lưới 4 cột x 965/1050/1135/1220 (bước ~85), 64 ô = 16 hàng cuộn.
- Ba ô tiêu hao vẫn hiển thị phía dưới khi bảng mở.
- Mockup thiết kế (`escape/ventory`) còn có một cột "Pet Backpack" (ô túi thú cưng, hẹp) giữa Backpack và cột phải "tên vật thể tương tác" [SPRITE escape/ventory; escape_ui_texture/Pet_package_icon 17x16, Pet_package]. Ở ảnh 8.6.0 cột này không hiện (không có thú cưng túi?) [ĐOÁN].

**Bản đồ căn cứ** [ẢNH g_0929_101301.jpg]: cửa sổ x192-1195, y72-612, tiêu đề "Map - Base" + X đỏ; nền bản đồ = ảnh Init mờ dần ở viền; marker "You" là tam giác xanh lá nhỏ (678,530); xoáy xanh ở (698,395); thanh zoom dọc bên phải x1155 y170-565 với nút +/- [SPRITE point_self 16x16, icon_scales_0..3, shadow_map 31x26]. Các marker khác: point_gate, point_escape (điểm sơ tán), point_task, point_treasure, point_chestbox, point_white (mỗi cái 16x16) [SPRITE escape_ui_texture].

**Bảng Quest** [ẢNH h_0929_101314.jpg]: cửa sổ x148-1240, y72-615. Trái x155-573: hai tab "Accepted"/"Finished" (y157), danh sách quest (mục đang chọn có viền vàng): "First Foray", "Learn to Heal". Phải x585-1232, viền vàng: tiêu đề, mô tả, chữ ký "---- Drillmaster", đường phân cách, điều kiện có bộ đếm (số xanh khi xong, đỏ khi chưa: "Eliminate Any enemy 2/2", "Successfully extract 1 times 0/1"), "Rewards:" với ô vật phẩm (Healing Potion x1 góc xanh = độ hiếm, Iron Coin 500). Mockup có thêm nút xanh "Accept" ở góc dưới-phải [SPRITE escape/task; button_accept 9x10, finished 21x16, mission_selected/non_selected, switch_mission_*].

**Màn vào chế độ** [ẢNH i_0929_101349.jpg]: cột trái 4 mode (Level Mode, Season Mode có nhãn NEW, Ancient Warfront, Trial of Talents NEW); thẻ giữa x630-983 với icon safari, tên "Season Mode", ảnh minh hoạ ba nhân vật, "Reward Preview" (một huy chương vàng), nút xanh "Start" (y545); cột phải hai nút "Season Quests" và "Season Shop"; X đỏ góc trên-phải. [SPRITE escape_ui_texture/escape_ui_entrance 91x49 có thể là banner thẻ này.]

**Màn chọn nhân vật (a-d)**: chung cho mọi mode, không riêng Season [ẢNH a/b/c/d]. Không dùng trong brief này.

## (d) Mô hình kho đồ

- Ô Trang bị: Backpack x1, Armor x1, Weapon x2, Amulet x4 (mở dần) [ẢNH f]. Nâng cấp "Amulet Expansion" 3 cấp, mỗi cấp mở +1 ô [WIKI: Training Facility].
- **Balô**: mặc định 15 ô, tải trọng 40 kg [ẢNH f "0/15", "0/40"; WIKI: Weight 40 kg]. Balô đeo cộng thêm ô và tải: Plastic Bag +10/+5, Canvas Bag +15/+10, Old Schoolbag +20/+10, Hiking Backpack +25/+20, Tactical Backpack +35/+30, Backpack of Legend +40/+40 (không chế được) [WIKI: Backpacks]. Nâng cấp Training: Backpack Expansion +5 ô/cấp (3 cấp), Carry Weight Up +5 kg/cấp (3 cấp) [WIKI].
- **Trọng lượng** ảnh hưởng tốc độ và tốc độ đói: (% tải) <25 / 25-75 / 75-100 / 100-120 / >120 → tốc độ x1.1 / 1.0 / 0.7 / 0.5 / 0.1; chu kỳ giảm no 8 / 7 / 6 / 5 / 4 giây [WIKI: Characters].
- **Stack**: mỗi vật có value, weight, stack riêng. Ví dụ: nguyên liệu vải/kim loại/gỗ/đá stack 5; Violet Energy Trace 15, Shard 10, Crystal 5; thuốc/đồ ăn 5, thuốc đặc biệt 3; thỏi đồng/bạc/vàng, thùng, balô, giáp không stack (1) [WIKI: Items]. Cả bảng số liệu nằm trong `page_Escape_from_Monkia_Items.json`.
- **Warehouse**: 64 ô ở Lv1 [ẢNH f "0/64"; WIKI], +32 ô mỗi cấp tới Lv9 = 320 ô; nâng cấp bằng Iron Coins + Wooden Crate S/M/L (1.000 / 5.000 / 10.000 / 16.000 / 28.000 / 40.000 / 60.000 / 100.000 xu) [WIKI: Base's upgrades].
- **Secure Box**: đúng 1 ô [ẢNH f]. Wiki chưa mô tả; [ĐOÁN] giữ nguyên khi chết.
- Nút "Store All" (đổ balô vào kho) và "Sort" (sắp xếp) [ẢNH f]; lọc theo 6 loại [ẢNH f].
- Bán đồ ở Store lấy Iron Coins theo `value`; sửa đồ làm giảm độ bền tối đa [WIKI: Store]. Giáp có độ bền: mất 1 độ bền để hồi 1 điểm giáp [WIKI: Supply crate].
- Chi tiết công thức chế (Workbench Lv1-6, Kitchen Lv1-3, Medical Lv1-5): xem trang wiki Items/Escape đã cache; tóm tắt trong RESEARCH này là quá dài nên chỉ giữ số chính.

## (e) Đói / Sprint / Tiêu hao

- **Chỉ số**: HP = HP gốc + 2 x giáp gốc (Knight 7 + 6x2 = 19, khớp ảnh 19/19); Giáp bắt đầu 0, phải tìm/chế và mặc; Năng lượng giữ như Level mode (Knight 200 = ảnh); Độ no 100; hết no thì mất 1 HP mỗi 2 giây; trong Base tốc độ chạy nhanh hơn chút; buff tốc độ từ cây (Plant) vô hiệu [WIKI: Characters; ẢNH e].
- **Sprint**: mọi nhân vật đều có; chạm nút thì lướt vài ô, 0,2 giây bất tử, hồi 5 giây [WIKI]. Nâng cấp ở Training Facility: Sprint Invulnerability +0,1s (3 cấp), Sprint Distance +10/15/15, Sprint Cooldown -1s (3 cấp), Sprint Charges +1 (1 cấp) [WIKI].
- **Tiêu hao** (không dùng được ở Base, chỉ ngoài bản đồ) [WIKI: Bases]: ba ô nhanh trên HUD [ẢNH e]. Thuốc HP S/M/L/XL hồi 3/5/10/20; thuốc năng lượng S/M/L/XL hồi 50/100/200/300; Weightlifting +20 kg tải; Speed +20% tốc độ; Venom/Flame/Frost-proof miễn nhiễm; Omni hồi 50 HP + 400 năng lượng [WIKI: Potions]. Đồ ăn hồi no (Seaweed Cracker +30; Roasted Rockshroom +3 HP +30 no; Smoked Ham +5 HP +50 no; Rockhoney Ribs +10 HP +70 no; Spicy Strip -1 HP +20 no; Cola +30 năng lượng +10 no; Energy Jelly +60 năng lượng +20 no...) [WIKI: Foods].
- Quest "Learn to Heal" yêu cầu dùng 1 Healing Potion (S) và 1 Energy Potion (S) [WIKI: Drillmaster quests; ẢNH h hiện tên quest].

## (f) Bản đồ / địa hình

**Có ảnh bản đồ hoàn chỉnh cho mọi vùng** (đã dựng sẵn, không phải chỉ mảnh tile) [SPRITE escape_map]:

| Ảnh | Kích thước | Nội dung nhìn thấy | Gán vùng [ĐOÁN] |
|---|---|---|---|
| Init | 1151x688 | căn cứ, xoáy xanh phía bắc, đường đất chữ T, rừng thông bao quanh | Base |
| Scene1 | 1024x1024 | rừng, sông uốn, đường đất, các trại nhỏ, cầu gỗ ở phía bắc | Base Outskirt |
| Scene2 | 1365x1024 | rừng phía tây, bờ cát + biển sâu phía đông, làng bãi biển, cầu tàu, thị trấn | Tide Zone |
| Scene3 | 773x1024 | rừng + sông + vùng núi lửa đỏ tía ở góc trên-phải | Volcanic Zone |
| Scene4 | 901x866 | nội thất sàn gỗ nhiều phòng, tường "Institute" | Research Lab / Underground Base |
| Scene5 | 630x900 | toàn dung nham cam | Volcano Core |
| SceneTuto | 725x640 | giống Scene1 + biển | màn hướng dẫn |
| Bridge_s1_1, s2_1, s3_1 | 18-43 x 128 | mảnh cầu | cầu nối giữa các scene |

- `escape/Scene6` 747x953 là sơ đồ đường viền xám của một địa hình dạng hầm (chỉ line art, không màu) [SPRITE].
- **Bundle `escape_terrain_scene1..5`, `escape_terrain_init`, `escape_terrain_tuto` gần như trống**: chỉ có `ring08` (128x128, vòng tròn), `UISprite` (32x32), và ở `escape_terrain_tuto` thêm 18 sprite NPC/`Circle` [SPRITE manifest]. Toàn bộ tile thật (cỏ, đất, nước, dung nham, sàn...) nằm trong bundle **`escape`** (1077 sprite) [SPRITE].
- **Lưới tile 32x32 px**: `grass_*`, `dirt_*`, `sand_*`, `water_*`, `lava_*`, `floor_*`, `ground_*`, `sg_*`, `qg_*`, `gr_*` đều 32x32 [SPRITE escape]. Bộ autotile: `sg_0..48` (49 biến thể cỏ nền), `qg_0..47` (48 mảnh viền/cỏ phủ), `gr_0..47` (48 mảnh chuyển cỏ-đất và cỏ-nước) — xem sheet_autotile_sg_qg_gr.png [SPRITE; ĐOÁN vai trò]. Còn có nhóm 16 biến thể cho từng loại: water, water_shallow, water_deep, water_col, sand, dirt, lava, land_lava, ground_lava, ground_lava_col (`_col` = collider) [SPRITE].
- **Kích thước ảnh map so với lưới**: Scene1 1024 = đúng 32 tile x 32 tile. Init 1151x688, Scene2 1365x1024 không chia hết cho 32 [SPRITE escape_map]. [ĐOÁN] 1 pixel ảnh = 1 pixel sprite (kích thước tile 32), bản đồ là ảnh phẳng lát sẵn, không có file tile-index; có thể cần dựng lưới bằng cách cắt theo 32px. Ước lượng độ phóng to màn hình: nhân vật ~30px sprite hiển thị ~60px trên ảnh 1386x640 nên hệ số ~2x, khung nhìn ~21,5 x 10 tile [ĐOÁN từ ẢNH e].
- **Không có** dump scene (collider/objects) cho escape: các thư mục `~/Downloads/sk-ref/all/_scene_*` và `~/Downloads/sk-ref/tilemap/` không chứa dữ liệu escape (grep không thấy). Vật cản/collider chỉ có thể suy từ `*_col` sprite và từ chính ảnh map [ĐOÁN].
- Kiến trúc vùng: `MinerArea_*` (khu thợ mỏ, đá đỏ, xe goòng), `MacaqueArea_*` (nhà khỉ trên bãi biển), `ApeArea_*` (lều xương Ape), `WoodArea_*` (khung gỗ), `Bunker_*` (bãi đá/chòi), `WoodFence_*` (hàng rào), `Institute*` (tường/sàn/cổng phòng nghiên cứu, 64x64 với 45x63), `Tree_*/BeachTree/LavaTree`, `LavaStone_*`, `Trail_*` (ray cuối đường), `connect_*` (cầu/bến), `hide_door`/`door_volcano`/`common_hideRoom_door_*_enter|exit` (cửa hầm/thang xuống — [ĐOÁN] lối vào-ra phòng ẩn) [SPRITE escape].

## (g) Kẻ địch / loot / quest

- Kẻ địch: 4 dòng Macaque (Gunner, Engineer, Wizard, Researcher) + 3 dòng Ape (Brawler, Cannoneer, Guardian) + Mutant Macaque/Ape; mỗi con cầm vũ khí chơi được với chỉ số như thường; Macaque Gunner biết né [WIKI: Enemies]. HP ở Base Outskirt: Brawler 50/80, Cannoneer 40, Gunner 40, Researcher 40 [WIKI]. Sprite: `e_escape_macaque_1..4` và `e_escape_ape_1..3` (mỗi loại ~17 khung, 28-32 px), cộng `_elite` và `_boss` mỗi dòng, `macaque_1_dodge` 4 khung (né) [SPRITE escape]. [ĐOÁN] macaque_1 = Gunner (vì có dodge), macaque_2..4 lần lượt Engineer/Wizard/Researcher, ape_1..3 = Brawler/Cannoneer/Guardian; ánh xạ cần xác nhận bằng cách xem sheet_enemies_npc.png.
- Boss: Macaque Leader (Tide Zone, Research Lab; Explosive Crossbow, Magic Bow), Ape Chieftain (Volcano Core, HP 1420; Sandworm, Deep Dark Blade); boss cầm 2 vũ khí đổi nhau mỗi giây [WIKI: Bosses]. Từ hotfix 8.5.11 boss mùa bị thay bằng boss dungeon.
- Rớt đồ: Monster crate = vũ khí quái cầm + Violet Energy (Trace từ quái thường, Shard từ elite, Crystal từ boss), boss còn rớt Faded Buff Sigil (100% để chế Amulet) [WIKI: Monster crate]. Thùng thường: Resource (vải/kim loại/đá/gỗ), Food (nguyên liệu + đồ ăn), Medical (thuốc), Supply (giáp/balô), Misc (gem mod vũ khí, thùng kho, thỏi kim loại, treasure) [WIKI]. Sprite thùng: `Chest_0..27` (28 kiểu) [SPRITE escape; sheet_props.png].
- Amulet chỉ chế được (Buff Amulet: 1 Faded Buff Sigil + 3 Violet Energy Shard + 5000 Iron Coins, Workbench Lv1); kết quả là buff ngẫu nhiên [WIKI: Amulets]. Danh sách buff amulet cụ thể KHÔNG có trong wiki.
- Quest Drillmaster (10 cái): First Foray (diệt 2 quái + sơ tán 1 lần; thưởng 1 Healing Potion M + 500 Iron Coins), Learn to Heal, Build Workbench, Craft Armor (chế Roughspun Garb), Rescue Archaeologist, Build Kitchen, Warehouse Expansion, Build Medical Station, Teleportation, Tide Zone Beacon. Archaeologist: 12 quest điều tra khu vực (thưởng Attachment vũ khí + xu). NPC nhân vật cứu về: ~14 quest nộp vật phẩm, thưởng Faded Buff Sigil + xu [WIKI: NPCs & Quests]. Ảnh xác nhận quest "First Foray" (2/2, 0/1) và "Learn to Heal" [ẢNH h].
- Nhân vật chơi được: chỉ Knight lúc đầu; nhân vật khác phải cứu ngoài bản đồ và hộ tống về điểm sơ tán; giữ skill/passive; Tent là nơi đổi [WIKI].

## (h) Tiền tệ & thứ bán bằng tiền thật

- **Iron Coins** (xu sắt): tiền chính của chế độ (mua bán, quest, nâng cấp); bộ đếm góc trên-phải HUD [ẢNH e; WIKI].
- **Violet Energy** (Trace/Shard/Crystal): vật liệu nâng cấp Training, chế thuốc; rớt từ quái [WIKI].
- **Season Coins**: tiền mùa chung cho mọi season, kiếm được qua chơi/quest hoặc **mua bằng tiền thật**: 500 = $0,99; 1.500+200 = $2,99; 3.000+500 = $4,99; 7.000+1.000 = $10,99 [WIKI: Season Coins]. Dùng ở **Season Shop** (cần mạng) [WIKI: Season Shop]. Wiki không liệt kê hàng riêng của Monkia trong Season Shop (các dòng hiện có là của Robotic Frenzy, Rosemary Island...). Nút Season Shop/Season Quests có trên màn vào mode [ẢNH i].
- Không có bằng chứng thứ gì trong phiên chạy (loot/chế/kho) bán bằng tiền thật. "Reward Preview" ở màn vào mode hiển thị phần thưởng mùa (huy chương vàng) [ẢNH i].
- Quyết định cho bản web: bỏ Season Shop và Season Coins (không có tiền thật) [ĐỀ XUẤT].

## (i) Bảng tài nguyên: dùng sprite nào cho cái gì

Đường dẫn gốc: `~/Downloads/sk-ref/all/<bundle>/<sprite>.png`. Manifest: `manifest.tsv`.

| Thành phần | Bundle | Sprite (kích thước) |
|---|---|---|
| Bản đồ căn cứ + vùng | escape_map | Init 1151x688, Scene1-5, SceneTuto, Bridge_s1..3_1 |
| Tile nền (cỏ, đất, cát, nước, dung nham, sàn) | escape | grass_*, dirt_*, sand_*, water_*, lava_*, floor_*, ground_* (32x32); sg_0..48; qg_0..47; gr_0..47 |
| Collider tile | escape | *_col (water_col, ground_lava_col_*) |
| Cây, đá, hàng rào | escape | Tree_0..3, tree_0/1, BeachTree, LavaTree, stone_0..3, LavaStone_0..5, WoodFence_0..14 |
| Tòa nhà căn cứ (Store, Warehouse, bàn thiết kế, bếp) | escape | Building_0..8, Tent, Tent_0..2, Teleporter_0 |
| Trại khỉ/khỉ đột, hầm | escape | MacaqueArea_0..6, ApeArea_0..2, MinerArea_0..14, WoodArea_0..4, Bunker_0..12, connect_0..7 |
| Phòng nghiên cứu | escape | Institute{Wall,WallDark,Floor,Area,Gate}_* |
| Thùng | escape | Chest_0..27, Box_0/1, entry_light(_1) |
| Cửa/thang hầm | escape | hide_door, door_volcano, common_hideRoom_door_{0,1,2}_{enter,exit} |
| Vật phẩm (106) | escape | Item_0..105 (chỉ số không có tên) |
| Kẻ địch | escape | e_escape_macaque_{1..4,elite,boss}_*, e_escape_ape_{1..3,elite,boss}_*, macaque_1_dodge_* |
| NPC | escape_config, escape_terrain_tuto | npc_trainer_0..23 (~30px), npc_explorer_0 (32x32) |
| Icon chế độ | escape | season_icon_Escape 33x34 |
| Panel nền/khung/nút | escape_ui_texture | title_bar, base_board_alpha80, Equipment_BASE_Alpha65, Equipment_item_base/outline(2), item_base, item_outline, Qucik_using_item_*, bar/bar_bg/bar_value_0, button_close/red/accept, btn_pause/yellow, SELECTED, selecter_line, line1/3 |
| Icon ô Equip | escape_ui_texture | weapon_equip_weapon_icon, weapon_equip_object_empty, Equipment_object_empty, armor(_gray), weapon(_gray), inventory(_gray), icon_talismans 192x32, lock 20x22 |
| Tab/nút chính | escape_ui_texture | icon_mission, icon_bag, icon_map, icon_coin/Coin, icon_food, icon_dash, icon_types_0..5, icon_filters_0/1, Package_sort_button, Package_title_icon, Equipmenttitle_icon, Pet_package_icon, icon_transfer/transf |
| Marker bản đồ | escape_ui_texture | point_self, point_gate, point_escape, point_task, point_treasure, point_chestbox, point_white, icon_scales_0..3, shadow_map/mission/bag |
| Độ hiếm | escape_ui_texture | rare_hint_{white,green,blue,purple,orange,red} 13x13, weapon_affix_level_0..5 25x25 |
| Nâng cấp Training | escape_ui_texture | upgrade_hp, upgrade_bag, upgrade_bag_load, upgrade_hunger, upgrade_dodge_{charge,cooldown,distance,invencible}, upgrade_talent |
| Bố cục mẫu | escape | ventory 619x349, task 617x349 (mockup UI, chữ Trung) |
| Ảnh minh hoạ | escape | escape_intro_0, 5..10 (tranh minh hoạ loading, 130-200 px) |

Gợi ý gán Item_N (đoán theo hình, sheet_items_numbered.png; CẦN kiểm lại từng cái bằng mắt trước khi dùng): 0-4 gỗ 5 bậc; 5-9 vải; 10-14 kim loại; 15-19 đá; 20-23 thuốc HP đỏ S..XL; 24-27 thuốc năng lượng xanh; 28-33 thuốc đặc biệt; 34-45 đồ ăn; 46-53 giáp; 54-59 balô; 60-61 chìa khoá (không thấy trên wiki); 62-70 vật liệu lặt vặt (dây gai, bánh răng, kim xương, chai đất...); 71-72 Pure Gold Coin, Moonwhite Pearl; 73-75 Violet Energy Trace/Shard/Crystal; 76-78 Wooden Crate S/M/L; 79-87 đồng/bạc/vàng; 88-94 nguyên liệu (thịt, nấm, sò, mật, rong biển); 95-96 Treasure Map; 97-105 đồ kho báu (bản đồ sao, la bàn, chai mẫu, mặt nạ, sao...). Bậc thứ tự bên trong từng nhóm khớp thứ tự trong bảng wiki [ĐOÁN].

## (j) Khoảng trống: phải tự bịa

1. **Luật chết/mất đồ** và **luật sơ tán** (điểm sơ tán ở đâu, có đếm ngược không, có cửa sổ thời gian, có mất đồ nếu bỏ chạy): không nguồn nào ghi.
2. **Chỉ số quái/boss** ngoài vài con số HP ở Base Outskirt, tỉ lệ rớt từng thùng, vị trí spawn thùng/quái/beacon/điểm sơ tán (ảnh map chỉ là bitmap, không có dữ liệu đối tượng).
3. **Collider/lưới đi được**: phải tự suy từ ảnh map và sprite `*_col`.
4. **Tên Item_N** (không có bảng ánh xạ), danh sách buff Amulet, vị trí NPC trong Base ngoài ảnh e/g, độ bền vũ khí.
5. **Bản đồ Base chi tiết khi xây thêm** (Workbench, Kitchen, Medical, Tent, Teleporter đặt ở đâu): chỉ có Init.png trạng thái đầu.
6. **Âm thanh** và **animation Sprint**: không có.
7. **Bố cục Secure Box** và luật số ô (1 ô cố định) chỉ là ảnh; không biết nó có nâng cấp được không.
8. **Season Shop / Season Quests / Reward Preview**: nội dung không rõ; nên bỏ hoặc thay bằng danh sách đơn giản.
9. **Font/hiển thị chữ**: mockup chữ Trung; chữ Anh trong ảnh chụp dùng font pixel tiêu chuẩn của game; cần chọn chữ Việt.
10. **Kích thước map so với tile** (mục f) chưa chắc; nên thử dựng lưới 32px chồng lên ảnh Init để kiểm.

## Contact sheet đã lưu

Thư mục: `C:\Users\tamph\AppData\Local\Temp\claude\D--survivor-web-hub\42a8ac66-c0d8-457f-af35-dfff9b3afbc8\scratchpad\season\`

- `sheet_maps_overview.png` — Init, Scene1-5, SceneTuto (nửa kích thước)
- `sheet_terrain.png` — 301 tile nền
- `sheet_autotile_sg_qg_gr.png` — 145 tile sg/qg/gr
- `sheet_props.png` — thùng, cây, hàng rào, cầu, teleporter...
- `sheet_buildings.png` — nhà/trại/Building/Tent/Bunker
- `sheet_items_numbered.png` — 106 Item_N có số
- `sheet_ui_texture.png` — 145 sprite escape_ui_texture
- `sheet_ui_layout_mockups.png` — mockup `ventory` + `task` phóng 2x
- `sheet_enemies_npc.png` — 255 sprite kẻ địch và NPC
- `sheet_mockups.png` — cửa hầm, tranh minh hoạ, icon mode

Công cụ dựng sheet: `games/soulknight/tools/season/mksheet.py <out.png> <regex bundle> <regex tên> <cell> <cols>`; dấu `,` trong regex đổi thành `|`. Lưu ý: shim `python` trên máy này chạy qua cmd, làm mất ký tự `^` và `|` trong đối số; dùng `\A`, `\Z` thay cho `^`, `$`.
