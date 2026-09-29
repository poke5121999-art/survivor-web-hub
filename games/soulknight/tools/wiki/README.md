# Số liệu Soul Knight kéo từ wiki

Kho bóc cục bộ (`~/Downloads/sk-ref/all`) không có bảng cấu hình vũ khí, nhân vật hay boss. Các con số ở đây lấy từ wiki cộng đồng https://soul-knight.fandom.com (bản cộng đồng, không phải nguồn của ChillyRoom) và ghép sprite với kho bóc để biết vũ khí nào nằm ở tệp nào.

Nhãn dùng trong tài liệu này. `[ĐO]` là số đếm hoặc kết quả chạy thật trong repo lúc viết (2026-09-29). `[SUY RA]` là suy luận chưa kiểm trong game.

## Các tệp

| Tệp | Số bản ghi | Nội dung |
|---|---|---|
| `weapons.json` | 540 | Mọi trang trong Category:Weapons có infobox vũ khí |
| `heroes.json` | 42 | Mọi nhân vật chơi được (Category:Characters, bỏ trang con `/Gallery`) |
| `bosses.json` | 58 | Mọi boss (Category:Bosses, bỏ `/Tactics`) kể cả boss của chế độ sự kiện |
| `enemies.json` | 151 | Quái thường (Category:Enemies trừ boss). Ưu tiên thấp |
| `levels.json` | 17 biome, 4 tầng | Cấu trúc chế độ thường: tầng, biome, boss theo màn, loại phòng, đoạn trích để dẫn nguồn |
| `stats.json` | | Tỉ lệ khớp sprite của lần chạy gần nhất |

Mọi bản ghi có `page` (URL trang wiki) để dẫn nguồn. Giá trị gốc của infobox luôn được giữ nguyên ở trường `raw` hoặc `infobox`, phần đã phân tích nằm bên cạnh.

### Chỉ số dạng `{raw, number, parts}`

Damage, tốn năng lượng, tỉ lệ chí mạng, độ lệch đạn, tốc độ di chuyển, phát bắn mỗi giây và số đạn đều qua cùng một bộ phân tích `parse_stat`.

- `raw` là chuỗi gốc từ infobox, ví dụ `4~8`, `3 (ranged)<br> 8 (melee)`, `5 → <span class=green>6</span>`.
- `number` là giá trị đầu tiên. Nếu là khoảng thì lấy cận dưới và có thêm `min`, `max`.
- `parts` tách từng dòng: `value` hoặc `min`/`max` hoặc `list` (dạng `2/3/36`) hoặc `count` (dạng `3x5`), kèm `label` (Primary, Melee...) và `upgraded` (vế sau mũi tên là bản nâng cấp hoặc tiến hoá).
- Ô không phải số (`-`, `?`, `∞`, `Max Health`) cho `number: null`, chữ còn nguyên ở `raw`.

### `weapons.json`

`name, page, id, type, subtypes, rarity{color,tier,upgraded}, grade, damage, ammo_cost` (năng lượng), `critical_chance, accuracy` (độ lệch đạn, tên gốc trên wiki là `accuracy` hoặc `Inaccuracy`), `speed` (chỉnh tốc độ di chuyển khi giữ nút bắn), `rounds_per_second, number_of_projectiles, charge_time, dps, forging{}, evolution{}, infobox{}` (toàn bộ trường gốc), `names{}` (tên tiếng Trung phồn thể, Việt, Nga khi trang có), `categories, usage` (600 ký tự đầu mục Usage), `usage_source, image{file,url,width,height}, sprite, sprite_near, sprite_note`.

- `id` chỉ có ở 77 vũ khí (dạng `1201010`). `[ĐO]`
- `usage_source` là `usage` cho 536 trang, `lead` cho 4 trang không có mục Usage. `[ĐO]`
- Đơn vị `speed` chưa rõ hết. Trang Bad Pistol ghi `-10` và mô tả "giảm 10%", nên `-10` là phần trăm. 96 vũ khí có giá trị nhỏ (|x| ≤ 2, ví dụ AK-47 là `-0.5`) và trang không giải thích đơn vị. 266 vũ khí để trống. `[ĐO]` cho số đếm, đơn vị của nhóm giá trị nhỏ chưa biết.

### `heroes.json`

`name, name_zh_tw, names{}, hp, armor, energy, crit, melee_damage, speed, passive, starting_weapon, unlock{kind,currency,amount,items,raw}, unlock_text, upgrades[{level,upgrade,cost}], skills[], image`.

- `unlock.kind` là một trong `default, achievement, gems, real_money, materials, other`. Ví dụ `gems` 5000, `real_money` USD 1.99, Robot là `materials` (20 Parts + 20 Battery), The Beheaded là `other` (999 Cell).
- `upgrades` là bảng nâng cấp 7 hoặc 8 bậc với giá gems (500, 1000, 1500, 2000, 2500, 5000, 8000). `[ĐO]` giống nhau ở cả 42 trang.
- Mỗi skill có `name, slot, unlock` (cùng dạng như trên, kèm loại `design_table` cho skill mở ở Design Table), `cooldown{raw,base,upgraded}`, `description, upgrade, mentor_upgrade, duration_s, duration_context, detail, fields{}`.
- `cooldown.upgraded` là số trong ngoặc của ô `cd` (`10 (8)`). `[SUY RA]` là hồi chiêu sau bậc nâng "-2s Skill Cooldown" trong bảng nâng cấp, vì Knight ghi `10 (8)` và bậc 4 ghi `-2s`.
- `duration_s` do regex bắt từ câu mô tả ("for 5 seconds"), không phải trường của wiki. Có `duration_context` để tự kiểm. Thiếu ở các skill mô tả không nêu số giây.
- `name_zh_tw` là chữ Trung phồn thể và chỉ có ở 12 trong 42 nhân vật. Game dùng chữ giản thể (骑士), nên cần đổi phồn sang giản khi dùng làm khoá. `[ĐO]`

### `bosses.json`

`name, page, found_in{raw,levels,biomes,modes,normal_levels,normal_biomes,normal_spans}, normal_mode, health, health_champion, health_special, unique_attacks, motif_weapon, drops{rare,common}, categories, names, attacks[{name,text}], tactics, room, image, sprite`.

- `normal_mode` là true khi có dòng `Level N-M (Biome)` không thuộc chế độ sự kiện. 44 boss thuộc chế độ thường, 14 là boss của chế độ khác (The Origin, Rosemary Island, Great Commander, Rush to Purity, Void Invasion, Robotic Frenzy, Three Kingdoms). `[ĐO]`
- `health` là máu ở chế độ thường theo wiki, `health_champion` là bản Champion. Quan hệ Champion = 1.25 lần máu thường xuất hiện ở hầu hết boss (720 và 900, 960 và 1200). `[ĐO]` Trang Enemies cũng ghi "25% more health". Nhiều boss ở màn 1-5 không có số Champion.
- `attacks` lấy từ trang con `<Boss>/Tactics`, mục Boss Attacks, mỗi đòn một mục. 9 boss chưa có mô tả từng đòn (danh sách rỗng). `[ĐO]`

### `enemies.json`

`name, page, type, health{raw,normal,champion}, damage{raw,normal,champion}, weapon, found_in{...,normal_spans[{floor,from,to}]}, behavior, levels_in_floor, biome_page, categories, image, sprite`.

- `behavior` và `levels_in_floor` lấy từ bảng Enemies trong trang biome (ghép theo tên đã chuẩn hoá). Quái không có hàng trong bảng thì để `null`.
- `normal_spans` mở rộng `1-2 to 1-5` thành `{floor:1, from:2, to:5}` và `1-x` thành 1 đến 5.

### `levels.json`

- `floors[]`: 4 tầng, mỗi tầng có `biomes`, `hidden_biomes` (Cave, Swamp, Grave và biome nào dẫn tới), `levels[]` với cờ `boss, buff_at_end, scammer, magic_stone`. Nguồn là trang Levels.
- `biomes{}`: 17 biome, mỗi biome có `floor, hidden_from, description, bosses[], enemies[], sections[]`.
- `bosses_by_level{}`: boss theo màn (`1-5`, `2-5`, `3-5`, `4-3`, `4-5`, `4-5`).
- `room_types`: `from_level_mode` (nội dung phòng rương vàng và phòng dấu chấm than, câu về phòng vào, cổng, boss) và `from_boss_room_page` (7 loại icon trên bản đồ nhỏ).
- `pages{}`: đoạn trích thô theo từng mục của 19 trang (Levels, Level Mode, Boss Room, Enemies, Badass Mode, Secret Rooms, Chests, Shop, Portals, Statues, Coins, Turrets Room, Scammer, Magic Stone, Mysterious Trader, Kind Trader, Followers, Boss Rush Mode, Buffs). Mỗi trang có `page` là URL để dẫn nguồn.
- `keyword_snippets[]`: các câu nhắc tới drop, energy, gold, chest, wave, champion, gem, mỗi câu kèm trang và mục. Dùng để tìm nhanh về rớt đồ và Champion.

Cấu trúc chế độ thường theo wiki (trang Levels và Level Mode):

- Tầng 1 gồm Forest, Glacier, Relics hoặc Mechanical Ruins, 5 màn, boss ở 1-5, buff cuối màn 1-1, 1-3, 1-5.
- Tầng 2 gồm Knight Kingdom, Dungeon, Halloween hoặc Chiseltown, 5 màn, boss ở 2-5 kèm Scammer, buff cuối 2-3 và 2-5. Cave, Swamp, Grave là biome ẩn của tầng 2, vào từ Glacier, Forest, Relics.
- Tầng 3 gồm Spaceship, Volcano hoặc Neo Isle, boss ở 3-5. Cổng xanh dẫn tới 3-6 (2 phòng, có Magic Stone), cổng tím dẫn sang tầng 4.
- Tầng 4 gồm Monolithic Range Ruins, Ancient Battleground hoặc Undersea. Boss ở 4-3 (trừ Undersea) và 4-5, 4-6 là màn cuối 2 phòng có Magic Stone.
- Mỗi màn có ít nhất 5 phòng gồm phòng vào và phòng ra. Phải dọn tối thiểu 2 phòng quái thường trước phòng ra. Màn nào cũng thường có một phòng icon rương vàng và một phòng icon dấu chấm than. Phòng dấu chấm than lặp lần hai thành phòng toàn Champion, thưởng 2 rương.
- Wiki có câu chữ đầy đủ ở `pages.Level Mode` và `pages.Levels`. Số lượng đợt quái (wave) trong một phòng thường không có số ở trang nào trong 19 trang đã kéo. `[ĐO]` bằng cách tìm từ khoá trong `keyword_snippets`.

## Chạy lại

```
cd games/soulknight/tools
PYTHONIOENCODING=utf-8 python wiki_pull.py             # cả 5 tệp
PYTHONIOENCODING=utf-8 python wiki_pull.py bosses      # một phần: weapons heroes bosses levels enemies
```

- Python 3.8, cần `numpy` và `Pillow`. Lệnh `curl` phải có trong PATH.
- Mọi phản hồi API lưu ở `~/Downloads/sk-ref/wiki-cache/` (JSON) và `.../wiki-cache/img/` (ảnh, đặt tên theo md5 của URL), ngoài git. Chạy lại chỉ đọc cache. Muốn kéo mới thì xoá tệp tương ứng trong cache.
- Lần chạy đầu cần mạng, khoảng 15 phút vì hơn 700 ảnh và có nghỉ 0.35 giây giữa các lượt. Lần đầu còn dựng `wiki-cache/rip-bbox.tsv` (khung cắt viền của 93.921 ảnh trong kho bóc, khoảng 50 giây).
- Chạy lại từ cache mất khoảng 75 giây (phần lớn là so pixel). `[ĐO]` chạy hai lần liên tiếp cho đầu ra giống hệt từng byte (md5 trùng) và không sinh tệp cache mới.
- Kết quả có thứ tự ổn định (sắp theo tên), nên `git diff` chỉ hiện thay đổi thật của wiki.

## Ghép sprite

Ảnh infobox của wiki được tải về, bỏ phần phóng to, cắt viền trong suốt, rồi tìm sprite trong kho bóc có cùng kích thước và gần như cùng pixel. Không so theo tên.

1. Phát hiện hệ số phóng to nearest-neighbour. Nguyên: ước chung lớn nhất của mọi vị trí đổi màu. Lẻ (vd 4.54): trung bình theo tần suất của cụm đoạn cùng màu ngắn nhất (4 và 5 xen kẽ). Với hệ số lẻ thử thêm kích thước sau thu nhỏ lệch ±1.
2. Cắt viền, tra chỉ mục theo kích thước đã cắt `(w, h)`, so từng pixel. Một pixel tính là khớp khi cả bốn kênh RGBA lệch không quá 12 hoặc cả hai đều trong suốt. `score` là tỉ lệ pixel khớp.
3. Nếu `score >= 0.90` thì ghi vào `sprite`. Nếu tốt nhất nằm trong `[0.75, 0.90)` thì ghi vào `sprite_near` (chưa đủ tin, thường là sprite bị vẽ lại hoặc đổi màu). Còn lại `sprite` là `null` và `sprite_note` nói lý do.
4. Nhiều sprite trùng nhau ở nhiều bundle (`equal > 1`). Chọn theo thứ tự ưu tiên bundle (vũ khí: `weapon`, `sprite_atlas`, `skin/weapon`...; boss: `boss`, `level`, `monster_rise`...), các bản trùng còn lại ghi ở `alts`.
5. Có thử lật và xoay (`transform`): 8 vũ khí khớp nhờ xoay hoặc lật. `[ĐO]`

Bản ghi `sprite`: `{bundle, name, score, mask (khớp hình dạng), factor, transform, equal, alts}`. Đường dẫn ảnh là `~/Downloads/sk-ref/all/<bundle>/<name>.png`.

### Tỉ lệ khớp (lần chạy 2026-09-29) `[ĐO]`

| Loại | Tổng | Có ảnh trên wiki | Khớp (`sprite`) | Khớp tuyệt đối (≥0.999) | Chỉ có `sprite_near` |
|---|---|---|---|---|---|
| Vũ khí | 540 | 540 | 467 (86.5%) | 380 | 25 |
| Boss | 58 | 58 | 38 (65.5%) | 33 | 2 |
| Quái | 151 | 115 | 89 (58.9% của tất cả, 77.4% của loại có ảnh) | 63 | 2 |

Chi tiết vũ khí: 87 vũ khí khớp trong khoảng 0.90 đến 0.999 (chênh màu nhẹ), 127 vũ khí có sprite trùng ở nhiều bundle. Theo loại: Sniper Rifle 13/13, Ring 4/4, Shotgun 30/32, Rifle 58/62, Misc 95/112, Melee 84/101, Throwing 22/30.

## Bẫy đã gặp

- `[ĐO]` Ảnh vũ khí trên wiki là phóng to nguyên lần: ×6 cho 416 trong 467 vũ khí khớp, ×10 cho 35, ×5 cho 5. Ảnh boss và quái thường là hệ số lẻ (4.5, 6.8, 7.2) nên gcd không bắt được. Trước khi thêm ước lượng hệ số lẻ, chỉ 29 trong 58 boss khớp (50%). Sau đó lên 38.
- `[ĐO]` Ảnh boss và quái trên wiki khớp với icon danh sách quái `bin_datapack/enemy_list_*` (18 trong 38 boss khớp, 76 trong 89 quái khớp), không phải khung hoạt hình trong `boss/` hay `monster_rise/`. Ai cần khung hoạt hình phải ghép theo cách khác.
- `[ĐO]` 143 trong 151 trang quái ghi tên ảnh không còn tồn tại trên wiki (`EliteGoblinGuardAxe.png` trả `missing`). Ảnh nay tên `Sprite <Tên>.png`, bỏ ngoặc đơn. Script thử tên infobox trước rồi tên suy ra, bản ghi thành công có `image.fallback: true` (107 quái). 36 quái vẫn không có ảnh, `sprite_note` ghi tệp thiếu.
- `[ĐO]` Wiki trả ảnh dạng WebP dù đuôi là `.png`. Pillow đọc được, tệp cache có đuôi `.bin`.
- `[ĐO]` Trang `Enemies`, `Champions` và `Gold Mine` cùng ra một văn bản (chuyển hướng trên wiki). Không có trang nào tên "Rooms". Đừng tin tên trang là chủ đề của nó, xem `levels.json > pages`.
- `[ĐO]` Nhân vật Wizard/法师 không có trang riêng dưới tên đó. Trang `Wizard` chuyển hướng sang `Witch`, tức nhân vật tương ứng là `Witch` (Lightning Strike, Piercing Frost, Firestorm). Tên game và tên wiki lệch nhau nên đối chiếu theo kỹ năng chứ đừng theo tên.
- `[ĐO]` Trang Priestess có tên Trung bị mã hoá hỏng (`ç‰§å¸«`). Script sửa bằng cách mã hoá cp1252 rồi giải mã UTF-8, ra 牧師.
- `[ĐO]` API `langlinks` cho thêm es và pt-br nhưng không cho thêm tiếng Trung. Chỉ 12 nhân vật có tên Trung trên wiki.
- `[ĐO]` Infobox chứa `{{I|Up Health||40px}}` có `||` bên trong mẫu. Tách ô bảng bằng `split('||')` đơn giản cho ra bảng nâng cấp sai. Script tách có tính lồng `{{ }}`.
- `[ĐO]` Wiki không có `3x5` trong ô damage. Số đạn nằm ở ô `number_of_projectiles` riêng (204 vũ khí có giá trị).
- Môi trường Windows: `python -c "..."` nhiều dòng qua shim pyenv bị hỏng trong Git Bash, phải ghi ra tệp `.py`. Không đặt tên script tạm là `enum.py` vì che mất thư viện chuẩn và Python báo `cannot import name 'IntEnum'`.
- Không có `git add` hay commit nào được chạy khi làm phần này. Thư mục `wiki/` và `wiki_pull.py` còn chưa được theo dõi.

## Chưa làm hoặc còn thiếu

- Chưa có số đợt quái, tỉ lệ rớt vàng và năng lượng theo từng loại quái. Wiki chỉ nói chung ("Champion luôn rớt vàng và năng lượng"), xem `keyword_snippets`.
- Chưa có tên Trung cho 30 nhân vật (12 tên có sẵn đều là phồn thể), và chưa có bảng ánh xạ tên wiki sang khoá cấu hình của game.
- 73 vũ khí, 20 boss chưa khớp sprite. Phần lớn là sprite bản mới hơn kho bóc (khác kích thước) hoặc bị vẽ lại. `sprite_near` liệt kê những cái gần đúng để duyệt tay.
