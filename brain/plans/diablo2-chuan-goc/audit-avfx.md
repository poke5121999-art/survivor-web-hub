# Ác Quỷ II: kiểm hoạt ảnh, tiếng, hiệu ứng so với Diablo II gốc

Ngày 2026-10-07. Chỉ đọc, không sửa tệp nào trong repo.

Nhãn nguồn:
- **[ĐO]**: tôi đo trên repo, trên dữ liệu gốc hoặc khi chạy game.
- **[DOC]**: lấy từ tài liệu, có ghi nguồn. `dataguide` là trang mô tả trường dữ liệu chính thức của Blizzard, đi kèm bản D2R, ở `D:\d2r-ref\fs\data\data\global\dataguide\data\files\*.js`.
- **[ĐOÁN]**: dựa vào hiểu biết của tôi về D2, chưa có nguồn nào trên máy xác nhận.

Ảnh chụp nằm ở `scratchpad/shots-avfx/`. Script chạy là `pw-avfx.js` (chạy thật bằng chuột, ghi lại tiếng) và `pw-avfx2.js` (đóng băng game rồi chạy từng bước bằng `D2DBG.sim`). Script phân tích là `an1..an7.js`, `x2.py`, `cof*.py`, `ad.py`.

---

## A. So từng mục

### A1. Hoạt ảnh

| Mục | Bản gốc (nguồn) | Bản làm lại (vị trí / số đo) | Kết luận |
|---|---|---|---|
| Số hướng của người chơi | 16 hướng: 846 trong 853 COF của `global/chars` có 16 hướng, chỉ DT/DD có vài file 8 hướng [ĐO cof.py] | `HERO_DIRS = 8` ở `build_sprites.py:37`. Mọi COF trong `hero_*` đều có `dirs` là 8 [ĐO an1] | **Thiếu.** Khi quay người thấy rõ bước nhảy góc |
| Mode của người chơi | NU WL RN TN TW A1 A2 BL GH SC TH KK S1–S4 DT DD [ĐO cof.py] | Có đủ NU WL RN TN TW A1 A2 BL GH SC DT DD. TH chỉ có ở AM và BA. KK chỉ có ở AI. S1/S3/S4 có ở BA, S1–S4 có ở AI [ĐO an2] | Thiếu một phần |
| Mode của kỹ năng | Cột `anim` của skills.txt với 210 kỹ năng: SC 118, A1 30, SQ 19, S2 8, S1 4, TH 4, KK 2, S3 2 [ĐO an5] | `game.js:746` và `skills.js:188` đổi mọi SQ/S1–S4/TH sang SC hoặc A1. Vì vậy các COF TH và S* đã đóng gói **không bao giờ chạy**. Chúng chiếm 22,7% điểm ảnh hero của BA, 25,2% của AI và 4,3% của AM, tức khoảng 1 MB nằm không [ĐO an3] | **Sai.** Whirlwind, Leap, Charge, Jab, Fend dùng nhầm động tác |
| Kiểu vũ khí (wclass) | 15 wclass cho mỗi lớp (HTH, 1HS, 1HT, 2HS, 2HT, BOW, XBW, STF, 1JS, 1JT, 1SS, 1ST, HT1, HT2...) [ĐOÁN] | SO, NE, DZ chỉ có HTH, 1HS, STF. PA có HTH, 1HS, 2HS. AM có 5 kiểu. Kiểu nào thiếu thì `heroLook` lùi về HTH (`game.js:606`) [ĐO] | Thiếu. Sorc cầm cung hoặc giáo sẽ thành tay không |
| Tốc độ hoạt ảnh của hero | fps lấy từ animdata. Tốc độ đánh tính từ số khung animdata của từng mode và wclass, kèm IAS, FCR, FHR [DOC skills.txt `seqtrans`: "faster cast rate" sửa tốc độ chuỗi] | Hoạt ảnh trải đều theo `stDur` (`game.js:1643`). Số khung gốc luôn là 16 vì `c.frames` rỗng ở mọi lớp (`rules.js:928`, đo `D2DATA.classes[*].frames = {}`). Không có FCR: `castFrames` không bao giờ được gán. FHR được tính ở `rules.js:979` nhưng không dùng. Sát thương ra ở 50% hoạt ảnh (`game.js:1180`), không theo khung `hit` của animdata. Ví dụ AMA1 1HT có hit ở khung 9/15, tức 60% [ĐO] | Gần đúng nhưng sai nhịp |
| Đỡ đòn (BL) | Có mode BL, chạy khi đỡ thành công [ĐOÁN] | Tỉ lệ `block` tính ở `rules.js:957` nhưng game không đọc. BL không bao giờ chạy, dù đã đóng gói [ĐO grep] | Thiếu |
| Hero trúng đòn (GH) | Trúng đòn khi sát thương ≥ 1/12 máu tối đa (Arreat Summit) [ĐOÁN] | Ngưỡng 5% máu tối đa (`game.js:692`) | Lệch nhẹ |
| Mode của quái | Trong monstats2 có NU 599, DD 535, DT 530, WL 490, A1 461, GH 408, SQ 393, KB 385, S1 246, A2 226, RN 61, S2 61, BL 52, SC 42 [ĐO x2] | Sheet đã đóng gói: NU 103, DT/DD 99, WL 94, A1 90, GH 82, A2 45, S1 43, S2 14, SC 14, BL 13, RN 11. Game chỉ chạy NU, WL, RN, A1, A2, GH, DT, DD, SC/S1 (lúc niệm hoặc hồi sinh). Không bao giờ chạy BL, S2–S4, KB [ĐO an1, `game.js:1362,1656`] | Phần lớn đúng |
| Số khung của quái | Đủ khung theo animdata. Ví dụ ZMWLHTH có 12 khung ở 10,16 fps, ZMDTHTH 19 khung ở 20,3 fps, ZMGHHTH 5 khung [ĐO ad.py] | Mọi mode trừ A1 bị bỏ một nửa khung (`build_sprites.py:68,614`, step 2). Trùm bị bỏ một nửa ở mọi mode. Kết quả: ZM WL còn 6 khung ở 5,08 fps, DT còn 10 khung, GH còn 3 khung [ĐO an2] | **Giật.** Thời lượng đúng nhưng chỉ còn nửa số khung |
| Lớp trong suốt của quái | 89 mã quái có lớp COF trong suốt, 326 lớp dùng draw effect 3 "Modulate" (GL_SRC_ALPHA, GL_DST_ALPHA, gần như cộng sáng) [ĐO cof2.py, DOC OpenDiablo2 `d2enum/draw_effect.go`] | `build_sprites.py:195` gộp các lớp đó vào ảnh với alpha 50% "straight over" [ĐO] | **Sai.** Quầng sáng, lửa trên thân quái bị xỉn |
| Lớp trong suốt của hero | Chỉ 1 trong 853 COF có lớp trong suốt [ĐO] | Không có `cof.blend` | Đúng, không đáng kể |
| NPC | NPC trong thị trấn đi lại. Ví dụ Gheed, Kashya [ĐOÁN] | `drawNpc` luôn vẽ NU (`game.js:1695`). 47 sheet NPC có WL nhưng không dùng [ĐO] | Thiếu |
| Vật thể | Cửa mở (OP), rương mở, waypoint chuyển NU → OP → ON, đền thờ có hiệu ứng khi kích hoạt [ĐOÁN] | Rương chạy OP một lần (`game.js:1004`). Waypoint nhảy thẳng sang ON (`:1684`). Cổng ON khi đã mở. Đuốc và lửa trại ON với lớp `fx` cộng sáng. Cửa và đền thờ không tương tác được, `objKind` không có loại này (`:480`) [ĐO] | Một phần |
| Xác | Xác ở lại tới khi rời khu hoặc tới giới hạn số xác [ĐOÁN] | DT giữ khung cuối rồi chuyển DD. Xác bị xoá sau 25 giây (`game.js:1293`) [ĐO] | Lệch |
| Hồi sinh và xuất hiện | `ResurrectMode` NU 582, S1 10, xx 31 [ĐO x2] | Xác về NU ngay (`game.js:1374`) | Đúng với phần lớn quái |

### A2. Vẽ sprite

| Mục | Bản gốc | Bản làm lại | Kết luận |
|---|---|---|---|
| Bóng của đơn vị | Bóng vẽ từ chính sprite. `Shadow`=1 ở 602/624 dòng monstats2 [DOC dataguide monstats2: "project a shadow on the ground"]. Cờ shadow của từng lớp COF bật ở 7215/7236 lớp hero và 2950/3152 lớp quái [ĐO cof2.py]. Vật thể dùng cột `Draw` [DOC objects] | Elip đen alpha 0.28 (`game.js:1647`). Quái đã chết, vật thể và đạn không có bóng [ĐO] | **Sai**, nhìn thấy ngay |
| Pha màu và trong suốt | Missiles.txt có `Trans` (487 dòng = 1, 5 dòng = 2) [ĐO]. [DOC dataguide: "alpha mode"] | Mis/ovl: 1, 3, 8 thành `lighter`, 2, 5 thành alpha 50% (`build_objects.py:405`). Lớp `fx` của vật thể theo draw effect [ĐO] | Đúng |
| Đổi màu quái (colormap) | Quái unique đổi màu ngẫu nhiên, trừ khi `noUniqueShift` (113 dòng) [DOC monstats2]. Có `Utrans` theo độ khó. Trạng thái `colorpri`/`colorshift`: freeze/cold 108, poison 104, red 100... [ĐO states.txt, DOC states] | Champion có quầng xanh, unique có quầng vàng bằng `ctx.shadowBlur` (`game.js:1674`). Quái bị làm lạnh hoặc trúng độc không đổi màu, xem ảnh `23-after-icebolt-chill.png` [ĐO] | **Thiếu, và vẽ thêm thứ D2 không có** |
| Đánh dấu mục tiêu | Đơn vị dưới con trỏ sáng lên, tên và thanh máu hiện trên đầu màn hình [ĐOÁN] | Elip đỏ dưới chân, thanh máu trên đầu màn hình (`game.js:1678`) | Lệch |
| Nháy khi trúng đòn | D2 không có [ĐOÁN] | `hitFlash` hạ alpha xuống 0.7 (`game.js:1675`) | Thêm thứ gốc không có |
| Chữ nổi | D2 không hiện số sát thương, "+XP" hay "miss" [ĐOÁN, rất chắc] | 22 lời gọi `floatText`: sát thương, +XP, miss, "LÊN CẤP!", +vàng [ĐO] | **Thêm thứ gốc không có**, nhìn thấy ngay |
| Ánh sáng và độ tối | Quái có bán kính sáng `Light` (103 dòng > 0), đạn có `Light` (315/736) và `Flicker`, overlay có `Radius`, trạng thái có `light-r/g/b` [ĐO, DOC]. Hầm tối ngoài bán kính sáng. Ngoài trời có ngày và đêm [ĐOÁN] | Khu trong nhà chỉ có một gradient tĩnh từ 120 px tới 520 px, tối nhất alpha 0.7 (`game.js:1738`). Gần như cả màn hình vẫn sáng. Đuốc, đạn và trạng thái không phát sáng. Ngoài trời không có đêm. Sheet đạn có `light` (vd. firebolt `[7,255,178,64]`) nhưng không ai đọc [ĐO] | **Thiếu**. Ảnh `13-catacombs_level_2.png` sáng gần như ban ngày |

### A3. Hiệu ứng hình

| Mục | Bản gốc | Bản làm lại | Kết luận |
|---|---|---|---|
| Đạn | 736 dòng, 289 CelFile khác nhau [ĐO] | 322 sheet. 60 trong 70 đạn của kỹ năng người chơi có hình [ĐO an5] | Tốt |
| Đạn đầu tiên | — | Nhóm `m/mis` (786 KB JS và 9 trang, 3,4 MB) chỉ nạp khi vẽ lần đầu. `sheetsForArea` (`game.js`) không nạp trước đạn hay overlay. Vì vậy Fire Bolt đầu tiên hiện thành **chấm cam** (hình thay thế ở `game.js:1712`), xem `04-firebolt-250-*.png` và `21-firebolt-2.png` [ĐO, cả hai lần chạy] | **Lỗi** |
| Nổ | Cột `ExplosionMissile` có ở 102 dòng [ĐO] | Có cho 10/10 đạn kỹ năng có cột này (`boomArt`) [ĐO] | Tốt |
| Vệt đuôi và đạn con | Có ở `CltSubMissile1` (86 dòng), `HitSubMissile1` (45), `SubMissile1` (39) [ĐO] | Không có đạn con phía client. Ice bolt có vệt vì vệt đã nằm sẵn trong hình [ĐO ảnh 23] | Thiếu một phần |
| Overlay lúc niệm | 59 kỹ năng lớp có `castoverlay` [ĐO x1] | `castOverlay` chỉ được đặt cho kỹ năng chạy qua D2S (`rules.js:676`): 22 kỹ năng, vẽ ở `skills.js:232`. Fire Bolt, Ice Bolt, Charged Bolt, Fireball... chạy qua `game.js beginAct`, không có overlay (hình `fire_cast_1`, `ice_cast_1` đã đóng gói) [ĐO an6] | Thiếu với kỹ năng đạn |
| Overlay của trạng thái và hào quang | 230 trạng thái, 96 có `overlay1` [ĐO] | Đã đóng gói 184 sheet ovl, code tham chiếu 96 (aura, curse, armor, charge) [ĐO an7] | Phần lớn có |
| Máu bắn | `Bleed` 1/2 ở 328 dòng: sinh `blood1/2` và `bigblood1/2` khi trúng [DOC monstats2]. `localBlood` đổi máu thành xanh [DOC] | Bốn sheet `mis.blood1/2`, `bigblood1/2` đã đóng gói nhưng không ai dùng [ĐO grep] | **Thiếu** |
| Đồ rơi lật | flippy | `flp.*` 212 sheet, chạy một lần ở 25 fps. Tốc độ này là giả định (`build_objects.py:20`) [ĐO] | Có, fps chưa kiểm |
| Lên cấp | Không có tệp overlay lên cấp trong `global/overlays` [ĐO]. Gốc chỉ phát tiếng `cursor_level_up` | Chữ nổi "LÊN CẤP!" và không có tiếng (xem B1) | Lệch |
| Waypoint, cổng | OP rồi ON | ON, không có OP | Thiếu một phần |

### A4. Tiếng và nhạc

| Mục | Bản gốc | Bản làm lại | Kết luận |
|---|---|---|---|
| Khoá tiếng do code tự đặt | Tên trong sounds.txt (11.913 dòng) | 33 khoá viết cứng. **Chỉ 6 khoá có thật**: `cursor_button_click`, `cursor_level_up`, `cursor_questdone`, `object_chest_large/small`, `object_waypoint_open`. Các khoá sau không có trong sounds.txt nên câm: `melee_attack*`, `power_*` (fireball, burn, freeze, shock, thunder, shoot, cast, shield, warcry, potion), `level_up`, `no_mana`, `female_hit`/`male_hit`, `*_die`, `inv_coins/potion/metal/leather`, `button/click/menu`, `env_stairs`, `object_portal_enter`, `monster_diablo_taunt1` [ĐO] | **Hỏng**: mọi tiếng phía hero đều câm |
| Thử một trận thật | — | 239 lần gọi `E.sfx`, 18 khoá khác nhau. 39 lần không tìm thấy khoá: vung kiếm, niệm Fire Bolt, hero trúng đòn (15 lần), hero chết, lên cấp, nhặt vàng. Các lần còn lại đều là tiếng quái [ĐO pw-avfx-out.json] | Như trên |
| Tiếng niệm kỹ năng | `stsound` có ở 108/210 kỹ năng, `dosound` 10, `tgtsound` 6 [ĐO]. [DOC skills: stsound "played when the skill is used"] | `build_ui.py:355` đã bóc ra, 108/108 có tệp. Game không đọc `stsound` ở đâu cả [ĐO grep] | **Đã bóc nhưng chưa nối** |
| Tiếng của đạn | `TravelSound` ở 56 đạn kỹ năng, `HitSound` ở 20 (đều đã bóc) [ĐO an5] | Không nối | Chưa nối |
| Tiếng vung và va chạm | `weapon_<hitclass>_<size>` (vd. one_hand_swing), `impact_*` theo hitclass.txt [ĐO sounds.txt] | 70 khoá `weapon_*` và 85 khoá `impact_*` đã bóc, không dùng [ĐO] | Chưa nối |
| Tiếng quái | monsounds có 150 dòng, 16 cột tiếng, kèm độ trễ theo khung (`Att1Del`, `Wea1Del`, `HitDelay`, `DeaDelay`), xác suất `Att1Prb`, `NeuTime` [DOC monsounds: Neutral phát khi NU/WL/RN và lặp sau NeuTime; Init lúc sinh ra; Footstep theo FsCnt] | Nối 5 cột: Attack1 lúc *bắt đầu* đòn, HitSound, DeathSound, Neutral **một lần** khi quái phát hiện hero, Skill1 khi hồi sinh (`game.js:628,1304,1369,1374`). `[Attack1, Weapon1]` qua `sfxFind` chỉ lấy khoá đầu nên Weapon1 không bao giờ phát. Không có độ trễ, xác suất, Footstep, Init, Taunt, Flee. Không dùng UMonSound (chỉ 6 dòng khác MonSound) [ĐO] | Được một phần |
| Âm lượng, cao độ, khoảng cách | sounds.txt có Volume Min/Max, Pitch Min/Max, `Falloff`, `Is2D`, `Defer Inst` [DOC sounds] | Mọi lời gọi đều truyền âm lượng cố định, nên `sfxVol` bị bỏ qua. Khi không truyền âm lượng, `sfxVol[k]` là mảng `[lo,hi]` mà code chia cho 255 (`engine.js:390`), ra NaN. Gán `a.volume = NaN` ném lỗi, bị `catch` nuốt, tiếng câm (lỗi đang ngủ). Không có cao độ, không có 3D, không có panning. 35 xác chết ngoài màn hình phát tiếng to như nhau [ĐO] | **Thiếu** |
| Bước chân | `light/medium/heavy_walk/run_<sàn>` theo `Material 1/2` của soundenviron [DOC] | 144 khoá đã bóc, không dùng [ĐO] | Chưa nối |
| Tiếng môi trường | soundenviron có Day/Night Ambience (lặp) và Day/Night Event (ngẫu nhiên theo `Event Delay`) [DOC soundenviron] | 195 tệp `ambient_*` đã bóc (1,6 MB), không dùng. `sfxLoop` (119) không ai đọc [ĐO] | Chưa nối |
| Nhạc | Mỗi khu một bài theo `SoundEnv` → `Song` [DOC levels, soundenviron] | Chọn bài đúng: wilderness, town_1, caves, monastery khi đi qua các khu [ĐO lần chạy]. **Nhưng bài bị cắt ở 110 giây** rồi mờ dần (`MUSIC_CAP`, `build_ui.py:45`). Bài gốc `wild.flac` dài 479 giây. 41 bài gốc dài tổng 7670 giây, bị cắt mất 4394 giây [ĐO ffprobe] | Lặp lại rất nhanh |
| Lời của nhân vật | `<class>_needmana_1`, `_cantcarry_*`, `_impossible_1`, `_cantuseyet`... nằm ở `local/sfx/common` (434 tệp, 18 MB flac, `IsLocal`=1) [ĐO] | `build_ui.py` chỉ đọc `global/sfx` nên không có lời nào [ĐO] | Thiếu |
| Lời chào của NPC | `local/sfx/actN/<npc>/*_greetings.flac`, `*_hello.flac`, cùng thoại nhiệm vụ [ĐO] | Không có | Thiếu |
| Tiếng nhặt, rơi, dùng đồ | `dropsound`/`usesound` của armor, weapons, misc; `item_flippy`, `item_gold`, `item_pickup`, `item_potion_drink` [ĐO] | 46 khoá `item_*` đã bóc. Code gọi nhầm tên (`inv_*`), nên câm [ĐO] | Hỏng |

---

## B. Những thiếu hụt, xếp theo mức người chơi nhận ra

**B1. Mọi tiếng phía hero đều câm vì gọi sai tên khoá.** Cỡ S, 0 MB.
- Bằng chứng ở A4: 27/33 khoá viết cứng không tồn tại. Trận chạy thử không phát một tiếng nào của hero.
- Cách sửa, chỉ thay ở runtime, không cần build lại. Thay khoá trong `game.js` và `skills.js` như sau:

| Việc | Khoá cũ | Khoá đúng |
|---|---|---|
| Hero trúng đòn | `gender_hit` | `<class>_hit_1` (nhóm 5 tiếng) |
| Hero chết | `gender_die` | `<class>_death_1` |
| Lên cấp | `level_up` | `cursor_level_up` |
| Nhặt vàng | `inv_coins` | `item_gold` |
| Uống thuốc | `power_potion` | `item_potion_drink` |
| Nhặt đồ | | `item_pickup` cộng `dropsound` của base lúc đồ chạm đất |
| Đổi trang bị, cất kho | | `usesound` của base |
| Nút giao diện | `button` | `cursor_button_click` |
| Cầu thang | `env_stairs` | xoá (D2 không có) |
| Cổng | `object_portal_enter` | `player_townportal_enter` |

- Niệm phép: `beginAct` và `skills.js:233` phát `DA.skill(id).t.stsound`, rồi phát `TravelSound` của đạn khi sinh đạn, `HitSound` khi đạn nổ hoặc trúng.
- Đánh thường: phát `weapon_<hitclass>_<small|large>` lúc vung, `impact_<hitclass>` khi trúng. Hitclass lấy từ weapons.txt, `HitClass` hoặc wclass. Kích thước quái lấy từ cờ `small`/`large` trong monstats2.
- Cũng sửa luôn `engine.js:390`: lấy ngẫu nhiên trong khoảng `[lo,hi]` thay vì chia mảng cho 255.

**B2. Đạn đầu tiên thành chấm cam.** Cỡ S, 0 MB.
- Cách sửa: trong `enterArea0`, thêm `E.ensure` cho `mis.*` và `ovl.*` của các kỹ năng hero đã học (`fx.missile.id`, `ExplosionMissile`, `castOverlay`) và của skill/đạn quái trong khu. Có thể dùng `E.ensurePrefix(['mis.','ovl.','flp.'])`, tốn khoảng 4,6 MB tải thêm một lần.

**B3. Không có ánh sáng và bóng tối.** Cỡ M, 0 MB, sửa ở runtime.
- Bằng chứng ở A2. Hầm mộ sáng như ngoài trời: ảnh `13-catacombs_level_2.png` so với `13-den_of_evil.png`.
- Cách sửa: vẽ một lớp ánh sáng sau `renderWorld`. Dùng canvas tối theo khu (trong nhà gần đen, ngoài trời theo ngày/đêm). Mỗi nguồn sáng khoét một vùng bằng `destination-out`, hoặc vẽ `lighter` với gradient tròn.
- Nguồn sáng: hero (bán kính gốc cộng `light radius` của đồ, [ĐOÁN] khoảng 7–8 subtile), `Light` và `Flicker` của đạn (có sẵn `sheet.light`), `Light` và màu RGB của quái trong monstats2, `Radius` của overlay, `light-r/g/b` của trạng thái, đuốc và lửa trại.
- Cần thêm `light` của vật thể vào `objPresets` ở `build_objects.py`. objects.txt có cột ánh sáng, tên cột cần đo lại.
- Ngày/đêm: chu kỳ thời gian game, đổi độ tối ngoài trời, cùng chọn Day hoặc Night Ambience (B8).

**B4. Thêm thứ D2 không có: chữ nổi, nháy alpha, quầng sáng champion/unique.** Cỡ S.
- Bằng chứng ở A2. Đây là thứ thấy đầu tiên trong mọi ảnh chụp.
- Cách sửa: tắt `floatText` sát thương, XP, miss, "LÊN CẤP" (có thể để sau một tuỳ chọn), tắt `hitFlash`, tắt `shadowBlur`.
- Thay quầng sáng bằng colormap thật (B6). Cần chủ dự án quyết vì đây là thay đổi về UX.

**B5. Hero 8 hướng, thiếu TH/KK/S1–S4, ít wclass.** Cỡ L, tốn nhiều MB.
- Bằng chứng ở A1. Hình hero hiện chiếm 13,3 MB [ĐO]. Lên 16 hướng thì gấp khoảng 2 lần, vượt ngân sách hero 22 MB và ngân sách game (đang 154/150 MB).
- Bước 1, cỡ S, 0 MB: cho `heroActMode` dùng thẳng S1–S4/TH/KK khi COF có, thay vì ép về SC/A1. Khoảng 1 MB COF của BA/AI/AM đang nằm không.
- Bước 2, cỡ M: thêm TH, KK, S1–S4 cho mọi lớp theo cột `anim` (SQ cần bảng `seqnum`, Whirlwind, Leap...).
- Bước 3, cỡ L: 16 hướng cho WL/RN/NU/TN/TW, 8 hướng cho các mode còn lại. [ĐOÁN] tốn thêm khoảng 5–7 MB.
- Muốn có chỗ thì phải giảm nơi khác (B9).

**B6. Không đổi màu quái.** Cỡ M.
- Bằng chứng ở A2.
- Cách sửa, cỡ M ở runtime: tạo trước trên canvas một sheet đã nhuộm cho mỗi `(sheet, màu)`, dùng `source-atop` với màu và alpha của colorshift (lạnh xanh, độc lục, đỏ). Lưu vào bộ đệm theo cặp trang ảnh và màu.
- Với unique: chọn một trong N tông màu theo seed, trừ khi `noUniqueShift`.
- Đúng nhất (cỡ L) là đọc bảng màu `.pl2` và `colormap` của D2, rồi build sẵn các biến thể đổi palette ở `build_sprites.py`. Cách này tốn MB vì mỗi biến thể là một sheet.

**B7. Hoạt ảnh quái giật vì bỏ nửa khung.** Cỡ M, cỡ ảnh tăng.
- Bằng chứng ở A1. `mon` hiện 28,3 MB [ĐO].
- Cách sửa: thêm WL, RN, GH, DT vào `FULL_RATE` của `build_sprites.py:68` cho quái thường (giữ step 2 cho trùm và NU). [ĐOÁN] tốn thêm 10–15 MB. Phải trả bằng B9.

**B8. Không có tiếng môi trường, bước chân, lặp lời quái.** Cỡ M, 0 MB vì tệp đã có.
- Cách sửa ở runtime: thêm `E.loop(key)` cho Day/Night Ambience của `soundenviron[def.soundEnv]`, và một bộ hẹn giờ cho Event theo `Event Delay` (cần đưa `soundenviron` vào `data.js` qua `build_data.py`).
- Bước chân hero theo `Material 1`, cứ mỗi FsCnt khung WL/RN phát một lần.
- Neutral của quái lặp theo `NeuTime/25` giây khi ở NU/WL. Thêm Init lúc sinh ra, Weapon1 theo `Wea1Del`, Attack1 theo `Att1Prb`.
- Thêm `E.sfx(key, vol, pos)`: giảm âm lượng theo khoảng cách tới hero (`Falloff`), pan bằng `StereoPannerNode` hoặc đơn giản là cắt ngoài khoảng 30 subtile. Cao độ dùng `playbackRate` trong khoảng Pitch Min/Max.

**B9. Nhạc chỉ còn 110 giây.** Cỡ S, cỡ ảnh thay đổi.
- Để đủ độ dài bài ở bitrate hiện tại (khoảng 9 KB/s) thì tốn thêm khoảng 40 MB. Không vừa.
- [ĐOÁN] Hạ `ENC_MUSIC` xuống mono hoặc khoảng 48 kbps rồi tăng `MUSIC_CAP` lên khoảng 240 giây, tổng nhạc vẫn quanh 28–35 MB.
- Chỗ có thể lấy lại để trả cho B5/B7: 195 tệp ambient (1,6 MB) chỉ nên giữ những tệp soundenviron trỏ tới. Khoảng 1 MB COF đang nằm không. Các khu dùng chung tile.

**B10. Overlay lúc niệm và máu bắn bị thiếu.** Cỡ S, 0 MB.
- Overlay lúc niệm: đưa `castoverlay` của SKX ra cho mọi kỹ năng (`rules.js:676`, bỏ điều kiện chỉ cho D2S), rồi vẽ trong `game.js beginAct`.
- Máu: trong `damageMon`, nếu monstats2 `Bleed` ≥ 1 thì `mk('fx', art 'mis.blood1|blood2' hoặc 'bigblood*')`. Nếu `localBlood` = 2 thì nhuộm xanh (B6).

**B11. Lớp trong suốt của quái bị gộp vào ảnh với alpha 50%.** Cỡ M, gần 0 MB.
- Cách sửa: ở `build_sprites.py`, tách các lớp `transparent` thành `anims[m].fx = [{blend:'add', ...}]` giống `build_objects.py:578`. `drawSprite` đã hỗ trợ `fx`.

**B12. Nhịp đánh của hero.** Cỡ M, 0 MB.
- Lấy số khung gốc từ `cof.frames` của mode và wclass đang dùng (đã có trong sheet hero) thay vì `c.frames.swing||16`.
- Sát thương ra ở khung `cof.hit`. Thêm bảng FCR và FHR theo lớp (Arreat Summit) cho SC và GH.
- Thêm đỡ đòn: chạy BL khi `Math.random() < d.block`.

**B13. NPC và vật thể đứng yên.** Cỡ M, 0 MB.
- NPC đi lại quanh chỗ đứng bằng WL đã có.
- Thêm cửa (OP/ON, đổi va chạm theo `HasCollision#`), đền thờ (OP cộng overlay `shrine_*` đã có), waypoint chạy OP khi kích hoạt lần đầu.
- Xác giữ tới khi rời khu, có giới hạn số xác.

**B14. Thiếu lời của nhân vật và lời chào NPC.** Cỡ S, khoảng 0,5–1 MB.
- `build_ui.py` thêm đường `local/sfx` (dùng cột `IsLocal`), chỉ bóc `*_needmana_1`, `*_cantcarry_*`, `*_impossible_1`, `*_cantuseyet` và `*_greetings`/`*_hello` của NPC thị trấn.
- Nối vào `noMana`, túi đầy, khi bấm NPC.

---

## C. Số đo độ phủ

| Mục | Số |
|---|---|
| Tệp tiếng đã đóng gói | 2029 tệp, 2071 khoá, 393 nhóm, khoảng 15,7 MB [ĐO] |
| Khoá tiếng runtime gọi tới được | 239 khoá tiếng quái (khoảng 1045 tệp kể cả thành viên nhóm) và 6 khoá viết cứng. Khoảng **52% số tệp đã đóng gói không bao giờ phát** [ĐO an4] |
| Khoá viết cứng có thật | 6/33 [ĐO] |
| Cột monsounds được dùng | 5/16 cột tiếng (Attack1, HitSound, DeathSound, Neutral, Skill1). Không dùng cột độ trễ hay xác suất nào [ĐO] |
| Quái có tiếng | 409/410 quái trong `D2DATA.monsters` có `snd` [ĐO] |
| Kỹ năng có tiếng niệm | 108 có `stsound`, đã bóc 108, nối **0** [ĐO] |
| Đạn kỹ năng có tiếng | TravelSound 56 có tệp / 0 nối. HitSound 20 có tệp / 0 nối [ĐO] |
| Đạn kỹ năng có hình | 60/70. Có hình nổ 10/10. Có ánh sáng 37, vẽ ra 0 [ĐO] |
| Sheet đạn | 322 sheet so với 736 dòng missiles.txt (289 CelFile khác nhau) [ĐO] |
| Overlay | Đóng gói 184, code tham chiếu 96. Overlay lúc niệm vẽ được 22/59 [ĐO] |
| Mode quái được chạy | NU WL RN A1 A2 GH DT DD SC/S1. Không bao giờ chạy BL (13 sheet), S2–S4 (27), KB (0 sheet) [ĐO] |
| Mode hero được chạy | NU WL RN TN TW A1 A2 SC GH DT, cộng KK ở AI. Không bao giờ chạy BL, TH, S1–S4 dù đã đóng gói [ĐO] |
| Hướng | Hero 8 (gốc 16). Quái 8 ở 644 anim, 16 ở 18, 1 ở 49 [ĐO an1] |
| Khung quái | Mọi mode trừ A1 còn 50% khung. Trùm còn 50% ở mọi mode [ĐO build_sprites.py:614] |
| Nhạc | Đủ 47 khoá, mỗi khu đúng bài, mỗi bài ≤ 110 giây (gốc tới 479 giây) [ĐO] |
| Tiếng môi trường, bước chân | 195 tệp ambient và 144 khoá bước chân đã đóng gói, nối 0 [ĐO] |
| Dung lượng ảnh | hero 13,3 MB, mon 28,3, npc 2,5, obj 5,6, mis 3,4, ovl 0,8, flp 0,26, tiles 31,7, ui 2,6 [ĐO] |

Ảnh chụp trong `shots-avfx/`:

| Ảnh | Nội dung |
|---|---|
| `01-town.png`, `02-town-walk.png` | TN/TW, bóng elip |
| `04-firebolt-250-*.png`, `21-firebolt-2.png` | Đạn đầu tiên là chấm cam |
| `21-firebolt-4.png`, `22-icebolt-2.png` | Có hình nổ |
| `23-after-icebolt-chill.png` | Ice Bolt đúng hình, Fallen không đổi xanh |
| `24-chargedbolt-2.png` | Đạn sét, nổ băng |
| `20-ranks-idle.png`, `08-melee-champion.png` | Quầng sáng của champion và unique |
| `05..07`, `26-kill-*`, `27-corpse.png` | Chết và xác, không có máu |
| `10-levelup.png` | Chữ nổi "LÊN CẤP!" |
| `13-den_of_evil.png`, `13-catacombs_level_2.png` | Độ tối trong nhà |

Giới hạn của lần kiểm này: không so fps của flippy và overlay với game gốc, không chụp được game gốc. Các nhận định [ĐOÁN] (ngưỡng GH, NPC đi lại, ngày/đêm, cách đánh dấu mục tiêu) cần kiểm lại bằng ảnh chụp D2 thật.
