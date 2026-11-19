# Điểm danh tính năng gameplay: bản 2D Unity so với bản 3D (repo3d)

Ngày lập: 2026-11-19. Chỉ đọc nguồn, không chạy trình duyệt hay Unity, không chạy test: cột "test" chỉ nói tệp trong `tools/` có chạm tính năng đó, không có nghĩa là test vừa xanh.
Phạm vi: gameplay trong ca chơi. UI, sảnh, gacha, nhiệm vụ, cửa hàng IAP ngoài phạm vi (bản 3D dùng lại UI gốc).

Viết tắt nguồn 2D: `ENG` = `D:/REPO_Topdown/Assets/Scripts/Port/Engine/`, `WORLD` = `.../Port/World/`, `SQ` = `.../Port/Squad/`, `INV` = `D:/repo3d/docs/design-inventory.md` (số mục), `MEM` = ghi chú trong memory của phiên Meta (tên tệp không có đuôi `.md`), `CFG` = `D:/REPO_Meta/gamespark-config/`.
Nguồn 3D: `D:/repo3d/js/`. Test: `D:/repo3d/tools/`.

Cách xác định trạng thái: đọc `PLAN.md`, `trail.tsv`, rồi grep `js/*.js`. "done" = có code chạy đúng luật nguồn (theo trail/test). "partial" = có một phần luật hoặc chỉ có hình/dữ liệu mà chưa có hành vi. "missing" = không thấy trong `js/`. Những chỗ không chắc được ghi ở mục cuối.

Lưu ý quan trọng khi đọc bảng quái: `js/foes.js` chỉ có hành vi riêng cho `banger`, `brat`, `minelayer`, `ghost` (và `gnome` là melee với `lootDmg` 9). Mọi loài khác trong `FOE_KINDS` có `beh: 'melee'` (chạy tới và vung), tức là có chỉ số, vị trí xuất hiện, hình robot, nhưng chưa có chiêu đặc trưng.

---------------------------------------------------------------------------------------------------
## 1. Vòng ca (run loop)

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Chuỗi 5 nhà, theme xáo theo seed, số phòng/bệ/loot đúng `stage_theme_houses` | INV 1, 8; `WORLD/HouseGen.cs` | done | `housegen.js`, `run.js` (RUN.houses/themes/levels) | `house-check.js` (500/500), `run.js` |
| Chỉ tiêu: `0.7 * curve(level) * crewMul`, chia đều theo số bệ | INV 1; `ENG/G03_World_a.cs:1027` | done | công thức chung ở `quota.js` (`crewMul = 0.4 + 0.15*min(crew,4)`), `run.js` và `house3d.js` cùng dùng, crew = người chơi + bot (2026-11-19). **Chưa xác định:** giá trị `houseQuotaMul` và `lootGrow` (INV 1 chỉ nêu tên, không có số; 3D coi bằng 1, `lootGrow` thuộc Vô Tận) | `run.js` (house3d pad quota = run pad quota, crew 4 và crew 1) |
| Nhiều bệ mở lần lượt, mỗi bệ giữ 3 s | INV 1; `ENG/G05_Extraction.cs` | done | `extract.js`, `run.js` | `run.js`, `slice.js` |
| Dư tiền ở bệ không cuối thành túi tiền (loot theo cỡ) | INV 1; `G05_Extraction.cs` | done | `run.js:267 spawnBag`, `bagSize` | `run.js` |
| Bệ cuối trả hết, rồi pha thoát về xe | INV 1 mục 7; MEM `escape-no-wave` | done | `run.js:280 startEscape`, `stepEscape`; không thêm quái, dịch quái sẵn có vào phòng kề xe | `run.js`, `foes.js` |
| Còi xe: 4 tiếng trong 10 s, tầm 30 và 15 ô, đèn nhà mờ 0.16 | INV 1, 9; `G05_Extraction.cs:170` | done | `run.js` (RUN.hornPings/escapeDim), `truck.js` hornPos | `run.js`, `audio.js` |
| Lên xe giữ nút 1.5 s, hồi máu theo nhà 50/50/35/35/25 | INV 1, 9; `run_timers` | done | `run.js:328 board`, `truck.js` BOARD_HOLD | `run.js` |
| Trạm dịch vụ giữa các nhà (không sau nhà 5) | INV 7; `G05_Station.cs` | partial | `station.js`, `run.js:357`; xem mục 8 về món bán còn thiếu | `run.js` |
| Chặng "ride room" (thùng xe): mở stash, uống thuốc, giữ XUẤT PHÁT 1.5 s | MEM `truck-ride-stop`; `ENG/G05_Ride.cs` | missing | Trạm có nút sàn đưa xe đi (`station.js` makeButton) nhưng không có phòng thùng xe riêng và không có stash | none |
| Thua khi hết cách đủ chỉ tiêu (`shiftLost`), mất cả ca | INV 1; `G05_Extraction.cs:493` | done | `extract.js remainingQuota/lootRemaining`, `run.js` unreachableConfirm | `run.js` |
| Thua khi cả đội gục (đầu rơi, nếu không ai đứng) | INV 1; `G06_Crew.cs:487` | done | `run.js` downLose, `player.js goDown` | `run.js`, `skills.js` |
| Đầu người gục (mass 9, r 9) mang ra bệ để hồi, HP hồi 1 | INV 1, 9; `G06_Crew.cs:165` | done | `extract.js checkHead`, `run.js:398 reviveNow`, `bots.js` | `run.js`, `passives.js` |
| Thưởng vàng cuối ca (300/nhà, cap 3000, thắng 1800) | INV 1; `run_reward.json` | partial | hằng số có trong `run.js` RUN (goldPerHouse/winGold/goldCap), không rõ có cộng vào ví meta (meta ngoài phạm vi) | `run.js` |
| Loot "restock" khi tổng giá trị dưới chỉ tiêu (x1.12, 1 món/1.5 s) | INV 4; `G03_World_*.cs` | done | `run.js:227 restockOne` | `run.js` |
| Điểm kiểm chống gian lận `RUN_CHECKPOINT` | MEM `run-checkpoint` | out of scope | phía server, không phải gameplay | none |
| Quái ngủ đầu ca 20-30 s, hồi sinh 45 s (1 s lúc thoát) | INV 5, 9; `run_timers` | done | `foes.js` FOE_RULES sleep/respawn | `foes.js` |
| Cảnh phim xe tải vào/ra nhà | `ENG/G05_Cutscene.cs` (965 dòng) | missing | không có cảnh cắt xe húc vào/ra; 3D chỉ đặt xe sẵn | none |

---------------------------------------------------------------------------------------------------
## 2. Chế độ chơi

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Solo Ải 5 nhà có bot | INV 2; `SQ/SqSquad.cs` | done | `run.js` + `bots.js` (đội mặc định 3 bot) | `run.js`, `skills.js` |
| Vô Tận (Endless): nhà không giới hạn, hệ số hp/dmg/quota/loot +8%/nhà, phòng phụ mỗi 2 nhà | INV 2; `CFG/endless_rules.json`, `WORLD/EndlessRules.cs`, MEM `endless-ranked-mode` | missing | `RUN.houses = 5` cứng, không có vòng sau nhà 5, không có save giữa nhà | none |
| Vô Tận khoá đội solo (TEAM_CHANGED), mùa, bảng xếp hạng | MEM `endless-team-lock` | out of scope | meta/server | none |
| PvP đội (3v3, hai xe, bệ cướp được, 25 phòng, hồi sinh 5 s, điểm kill/assist) | INV 2; `ENG/G22_Pvp*.cs`, MEM `pvp-5v5-mode`, `pvp-online-gs-room` | missing | không có chế độ PvP nào trong `js/` | none |
| Co-op online (host quyết định, khách chỉ render + gửi input) | INV 2; `SQ/SqCoop*.cs`, MEM `coop-*` | out of scope | chỉ ghi chú: PLAN đợt 7 "để sau"; thiết kế 3D phải giữ ranh giới sim để sau này host-authoritative | none |
| Co-op Local (WebRTC), chat chữ, kick+bot | MEM `coop-local-mode`, `coop-text-chat` | out of scope | meta/mạng | none |
| Hướng dẫn (FTUE 3 ô), phòng thử chiêu | INV 2; `Tutorial/`, `SkillDemo/`, MEM `skill-demo-room` | out of scope | UI/meta; bản 3D có `testroom.js` chỉ để test | `skills.js` |
| Bản đồ PvP tay vẽ (`pvp_maps.json`) | INV 8 | missing | thuộc PvP | none |

---------------------------------------------------------------------------------------------------
## 3. Người chơi

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Di chuyển: đi bộ, lom khom (sneak), chạy (tốn thể lực 22/s, hồi 16/s) | INV 3; `G01_Config.cs:255-345` | done | `player.js` (sprint/crouch, stamina, staminaDelay) | `slice.js`, `run.js` |
| Tốc độ chậm theo khối lượng cầm `92/(1+mass/str)`, sàn 0.35 | INV 3; `G03_Visibility.cs:793` | done | `grab.js:94` speedMul (Atlas weightHook) | `slice.js`, `passives.js` |
| Máu 100/theo nhân vật, không hồi tự nhiên, gói máu | INV 3; `G02_State.cs:251` | done | `player.js`, `run.js` R.hpMax = CREW[lead].hp, phím 1-3 gói máu | `run.js` |
| Tia kéo (pull beam), kéo loot từ xa, kéo lê theo sức | INV 3; `ENG/G12_PullBeam.cs` | done | `grab.js` + `beam.js` (2026-11-19: tia cong theo độ căng, bám đúng chỗ ngắm, R xoay, đứt khi tường chắn/kéo căng, góp sức bot, chống cưỡi đồ, kéo lê toé lửa, tâm ngắm) | `slice.js`, `beam.js` |
| Nhiều người cùng kéo một món chia khối lượng | INV 3 | missing | `grab.js` chỉ một người một tia | none |
| Ném đồ: `v = max(130, 560*str/(str+2.2*mass))`, sát thương lên quái, tiếng ồn 1.5 | INV 3 mục 3; `G04_Combat.cs:186-231` | done | `grab.js release(throwIt)`, `foes.js hurt` + `projectiles`, `noise.js` | `slice.js`, `foes.js` |
| Bốn khe tay (3 +1/thuốc túi, cầm loot và dùng đồ riêng) | INV 3; `ENG/G02_Hand.cs`, `HudSlots.cs` | partial | 3D có một ô đồ trạm (ô HUD 4, phím F) và gói máu phím 1-3; không có 3 ô đồ nhiều món, không có thuốc "túi +1" | `gear.js` |
| Thể lực mất khi ném (6) | INV 3 | done | đã kiểm 2026-11-19: `grab.js release(throwIt)` trừ `CFG.player.throwStamina` 6 (ném nạp thêm x(1+k)) | `beam.js` |
| Đèn pin nón 6.8 ô, góc nửa 0.62 rad, vòng gần 2.4 ô, LOS 14 ô | INV 3; `G01_Config.cs:277-279`, MEM `torch-instant-turn` | partial | spot light + sương thể tích theo nón (`post.js`, `lights.js`); chưa thấy vòng gần, nhãn giá chỉ hiện khi bị đèn rọi, đèn tối ưu chỉ cho chặn tầm nhìn của quái theo `seeStand/seeCrouch` | `look.js` |
| Đèn pin chập chờn khi bị săn/máu thấp | (bản 3D sáng tạo) | done | `lights.js` | `look.js` |
| Bẫy hỏng đèn (mù mực alien, thiên thần) | INV 3, 5 | missing | alien và angel chưa có chiêu | none |
| Đèn rọi làm tượng thiên thần đầy, chậm ma gương x0.42 | INV 3, 5; `ENG/G07_Angel.cs`, `G05_Mirror.cs` | done | `foe-moves-c.js torchOn` (nón đèn 0,62 rad, 14 m, không bị chắn) | `foe-moves-c.js` |
| Thanh tiếng ồn (đơn vị = ô nghe, bước chân `noiseOf*5*0.6`) | INV 3; MEM `noise-meter`, `ENG/G26_NoiseMeter.cs` | done | `noise.js` (sneak 0.25, walk 1, run 2.6, fall 10, hold 0.5, max 12) | `foes.js`, `audio.js` |
| Tiếng ồn: thả loot, va đập mất giá, ném, phá cửa 11 ô, súng, bệ 30 ô | INV 3 | done | `noise.js` R + `gear.js` + `run.js` | `foes.js`, `gear.js` |
| Tiếng nói (mic) gây ồn 2.5-8 ô | INV 3; `G26_NoiseMeter.cs` | missing | không đọc mic | none |
| Bước chân nghe 7 ô, thở 3.2 ô, tim đập 10 ô khi quái gần | INV 5; `G01_Feel.cs` | done | `audio.js` (tim đập khi bị săn trong 9 m, bước theo sàn theme) | `audio.js` |
| Leap Xung Chấn / nhảy (Quake) | `ENG/G08_Leap.cs` | partial | `player.js` có `jump`, kỹ năng shock ở `skills.js`, chưa thấy nhảy gắn với shock | `skills.js` |
| Nhảy (bản 3D, thiết kế mới; 2D không nhảy): tốn 8 thể lực, thiếu thì không nhảy; mang đồ nhảy thấp theo hệ số chậm (cao x speedMul); tiếp đất ồn `1+2,2·độ rơi` (rón rén x0,5), camera nhún, tiếng `land_<sàn>`; rơi > 2,5 m mất `8+15/m`; quái với cao 1,6 m, không với tới thì chờ dưới và xô loot mỗi 2 s; không khí phòng cầu thang trên đồ cao bị chặn tới trần | (mới, trail 2026-11-19 jump) | done | `player.js JUMP`, `main.js landHook`, `foes.js` bay/`shoveNear`, `house3d.js` STAND_CAP, `audio.js land_*` | `jump.js` (31/31) |
| Ngồi xổm làm giảm tầm thấy của quái (seeCrouch 2.5) | INV 5; `stage_rules` | done | `foes.js` seeStand/seeCrouch, `noise.js` | `foes.js` |
| Mini-map cầm tay, sương mù chia sẻ cả đội, "?" phòng chưa biết, loot dạng thanh, đường chấm | INV 7 | partial | `run.js:523 drawMinimap`, `markSeen`; chưa kiểm loot dạng thanh, đường chấm | `run.js` |
| Nội tại 14 nhân vật | INV 6; `ENG/G14_Passive.cs` | done | `passives.js` | `passives.js` (17/17) |
| Thanh máu + thể lực trên đầu người | `ENG/G16_BarHit.cs` | out of scope | UI 2D | none |

---------------------------------------------------------------------------------------------------
## 4. Loot, chất liệu, rương, két

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Ba cỡ loot (khối lượng 8/24/58), 4 chất liệu, ngưỡng vỡ theo delta-v | INV 4; `CFG/loot_*.json` | done | `config.js` CFG.loot, `loot.js` | `slice.js` |
| `damageLoot`: `value0*frag*0.35*(dv-thresh)/thresh`, gốm vỡ khi < 12% | INV 4; `G04_Combat.cs:32` | done | `loot.js afterStep` | `slice.js` |
| Ân hạn sau nhặt 1.0 s, sau trúng 0.8 s, sau spawn 3 s | INV 4 | done | `config.js` loot.graceAfterPickup/invulnAfterHit/graceAfterSpawn | `slice.js` |
| Chỉ số grip +25% ngưỡng khi cầm | INV 4 mục 7 | missing | không có thuốc grip | none |
| 209 món loot theo theme/cỡ/ô (`loot_items.json`) và giới hạn giá trị theo nhà | INV 4; `WORLD/LootItemTable.cs`, `loot_cap.json` | done | `housegen.js` (loot từ phòng xuất), `house3d.js` đồ đạc theo theme | `house-check.js` |
| Rương (chest, nhà từ cấp 2, 1-3 rương, 2-3 món) | INV 4; `safes_chests.json` | missing | `house3d.js` chỉ vẽ "chest" như đồ đạc trang trí, không mở được | none |
| Mimic: 30% rương là mimic, hiện hình 0.7 s rồi cắn | INV 4; MEM `mimic-chest-art`; `ENG/G05_Mimic.cs` | partial | `FOE_KINDS.mimic` có số liệu nhưng không có rương nên không bao giờ xuất hiện; không có hành vi hiện hình | none |
| Két sắt + chìa khoá (két mở khi mang chìa lại gần, nhà 20/30/35/40/45%) | INV 4; `ENG/G15_Safe.cs`, MEM `gamespark safes_chests` | missing | không có két, không có chìa | none |
| Cầu hồn (orb) rơi từ quái: giá `(hp*9+dmg*60)/50`, chất liệu soul, nổ khi vỡ, tối đa 3 | INV 4; `G04_LootBreak.cs` | done | `foes.js` maxOrbs, `loot.js` | `foes.js` |
| Quái `noLoot` (gnome, bomb, ghost, wallhand) | INV 4 | done | `foes.js` noLoot | `foes.js` |
| Nhãn giá chỉ hiện khi loot bị rọi | INV 4 | partial | `run.js`/`house3d.js` có nhãn; chưa kiểm điều kiện "chỉ khi sáng" | none |
| Đồ trên xe/xe đẩy được bảo vệ khỏi va tường | INV 4 | done | `cart.js` đánh dấu `inCart`, `loot.js afterStep` bỏ qua va đập; nổ và quái đánh vẫn tính (2026-11-19). Xe tải: chưa (chưa có thùng xe chở đồ) | `beam.js` |
| Bẫy hỏng loot (gai 3%, laser 2%, lửa 1.5%, băng 5%) | INV 4; `ENG/G17_TrapItemDamage.cs` | missing | không có bẫy | none |
| Vỡ do nổ `420*pow*(1-d/r)`, gậy tạ làm nứt loot | INV 4, 7 | partial | `foes.js explode` (blastLoot 420); không có gậy tạ | `foes.js` |

---------------------------------------------------------------------------------------------------
## 5. Quái và boss

Hành vi 3D ở `D:/repo3d/js/foes.js`; hình robot ở `robots.js`. Test chung: `tools/foes.js` (kiểm từng loài theo trail "14/14", chủ yếu: thấy/nghe/đuổi/đánh/hạ), `tools/robots.js` (ảnh). Cột "3D location" chỉ chỗ code; nếu `beh: 'melee'` thì chỉ là kẻ chạy tới và vung tay.

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Nhận biết: nón nhìn, nghe, sự kiện ồn, đuổi, mất dấu, lục soát | INV 5; `G02_Monsters.cs`, `G10_FoeKinds.cs` | done | `foes.js think/investigate/wander`, `noise.js heard` | `foes.js` |
| Hệ số theo nhà hp x1/1.2/1.5/1.7/2, dmg x1/1/1.1/1.2/1.35 | INV 5 | done | `foes.js HOUSE_ROSTER` | `foes.js` |
| Bảng loài theo nhà (1: banger/brat ... 5: 11 quái 6 loài), angel và mirror luôn xuất hiện | INV 5 | done | `foes.js HOUSE_ROSTER` + dòng 102 | `foes.js` |
| Kẹt 2.5 s thì tìm đường lại | `stage_rules.foe` | done | `foes.js` stuckSec | `foes.js` |
| Quái đi qua cửa (cửa mở cho quái), quái qua 2-5 phòng | INV 8 | done | `foes.js`, `nav.js`, `house3d.js` | `foes.js` (h) |
| Bom con `banger`: châm ngòi khi thấy, nổ cả khi bị giết (yếu hơn) | INV 5 | done | `foes.js bBanger`, `explode` | `foes.js` |
| Gấu mèo `brat`: cướp loot gần nhất, chạy, thở, ném lại, 4 hit thì rớt | INV 5 | done | `foes.js bBrat`, `projectiles` | `foes.js` |
| Kẻ gài mìn `minelayer`: sợ người, lang thang gài mìn (8-12 s, tối đa 4) | INV 5; MEM `minelayer-gait` | done | `foes.js bMinelayer` | `foes.js` |
| Hồn ma `ghost`: xuyên tường, miễn sát thương, mất dấu khi xa | INV 5 | done | `foes.js` beh 'ghost' | `foes.js` |
| Gnome: cưa món đang cầm x9, đàn 3 | INV 5 | partial | melee + `lootDmg 9`; chưa có đàn 3 | `foes.js` |
| Kẻ bắn `gunner`: dừng, vẽ vạch đỏ, bắn từ 9 ô, giữ cách 6 ô, tường chặn đạn | INV 5; `G10_FoeKinds_b.cs` | done | `foe-moves.js bGunner`: thấy người trong 9 m và đường bắn trống thì dừng ngắm, vạch đỏ bám theo rồi khoá; bắn tia tức thời (hitscan) trúng thứ đầu tiên (người, bot, quái khác, loot, tường); dưới 6 m thì lùi, không bao giờ tiến lại gần; săn bot. **Chưa xác định:** thời gian ngắm (tạm 0,7 s, khoá 0,25 s cuối), tốc độ đạn (tạm tức thời), nghỉ sau bắn (tạm 0,4 s) | `foe-moves.js` |
| Kẻ húc `rook`: khoá làn, dậm 3 lần, lao thẳng không lái, vẫn lao tới chỗ thấy cuối | INV 5; MEM `foe-friendly-fire` | done | `foe-moves.js bRook`: khoá làn thẳng tới người (hoặc chỗ thấy cuối, hoặc bot nó săn), dậm 3 nhịp, lao thẳng không lái, trúng người (dmg + xô), bot, quái khác trong làn (friendly fire x1); đâm tường thì choáng. **Chưa xác định:** nhịp dậm (tạm 0,32 s), tốc lao (tạm 8 m/s), quãng tối đa (tạm 12 m), lực xô (tạm 6 m/s), choáng khi đâm tường (tạm 1,2 s), tầm khoá (tạm 9 m) | `foe-moves.js` |
| Rương răng `mimic` | xem mục 4 | partial | không sinh ra (không có rương) | none |
| Bàn tay quỷ `wallhand`: ẩn trong tường, tóm người đi qua, bấm trái/phải để thoát, dời chỗ 15 s | INV 5 | done | `foe-moves-b.js bWallhand`: nằm trong tường cạnh ô đi được, ẩn; ai đi qua trong tầm thì bị tóm (người: không đi, không tia, không kỹ năng, không đồ, camera bị giật về phía tay; tay chui ra từ tường), mất dmg mỗi cd; bấm trái/phải xen kẽ đủ số lần thì thoát; 15 s sau thì dời chỗ. **Chưa xác định:** tầm tóm (tạm 1,0 m), số lần bấm (tạm 10), bot tự thoát sau (tạm 3 s) | `foe-moves-b.js` |
| Xác ướp `mummy`: ném dây vải kéo người, treo vào tường, đứt khi choáng | INV 5; `ENG/G27_Rope.cs` | done | `foe-moves-b.js bMummy`: ở 3-8 m thì vung 0,5 s rồi ném dây; trúng người thì kéo người về; trúng tường thì tự đu tới tường; choáng thì đứt dây; gần thì đánh như cận chiến. **Chưa xác định:** khoảng ném (tạm 3-8 m), tốc dây (tạm 14 m/s), lực kéo (tạm 4 m/s, tối đa 2,5 s), tốc đu (tạm 6 m/s), hồi chiêu (tạm 5 s) | `foe-moves-b.js` |
| Kẻ ném đầu `headthrower`: ném đầu lửa xanh nảy và nổ, khí độc, nhặt ném ngược | INV 5 | done | `foe-moves-b.js bHeadthrower`: giữ 3-9 m, ném vồng đầu lửa xanh (vật lý thật, nảy), nổ sau ngòi (không hại chính chủ), để lại khí độc 2 máu/s trong 3 s; dùng tia kéo nhặt được đầu và ném ngược. **Chưa xác định:** ngòi (tạm 2,4 s), bán kính nổ (tạm 2,2 m, lực 0,6), bán kính khí (tạm 1,8 m), mọc đầu mới (tạm 5 s) | `foe-moves-b.js` |
| Kẻ giả mạo `impostor`: giả đồng đội, lộ mặt khi gần | INV 5 | done | `foe-moves-b.js bImpostor`: đi quanh nhà như bot đội, im (không tính vào mắt phát hiện, không tim đập); tới gần trong tầm nhìn hoặc bị đánh thì lộ mặt (mặt giận, to lên 1,35), rồi đuổi đánh. **Chưa xác định:** tầm lộ mặt (tạm 2,5 m), thời gian lộ (tạm 0,8 s) | `foe-moves-b.js` |
| Quái gacha: tóm người, quay bánh xe (trượt/hồi/mất máu/gục), 4 hit để thả | INV 5; `G10_FoeKinds_gacha.cs` | done | `foe-moves-b.js bGacha`: đuổi, tới tầm thì tóm, bánh xe quay 2,5 s (vẽ trên HUD, không chữ), kết quả: trượt / hồi 20 / hồi đầy / mất 25 / gục; trúng 4 đòn thì thả. **Chưa xác định:** thời gian quay (tạm 2,5 s), tỉ lệ ô (tạm 30/20/10/30/10), lượng hồi/mất (tạm 20/25), nghỉ giữa hai lần tóm (tạm 6 s) | `foe-moves-b.js` |
| Kẻ truy lùng `hunter`: biết chỗ một thành viên xuyên tường, hai nắm đấm đập có vòng đỏ | INV 5; `G10_FoeKinds_hunter.cs` | done | `foe-moves-b.js bHunter`: chọn một người trong đội (người hoặc bot), luôn biết chỗ, đi chậm tới; tới gần thì vẽ vòng đỏ dưới chân mục tiêu, sau đó đập: ai trong vòng mất dmg và bị hất văng (cả quái khác). **Chưa xác định:** tầm bắt đầu đập (tạm 2,6 m), thời gian báo (tạm 1,0 s), bán kính vòng (tạm 1,6 m), lực hất (tạm 7 m/s) | `foe-moves-b.js` |
| Tượng thiên thần `angel`: hiện 30-60 s, rọi đèn 5 s để đuổi, không thì chớp tới vả 30 | INV 5; `G07_Angel.cs` | done | `foe-moves-c.js bAngel`: vắng 30-60 s rồi hiện trước mặt người (hoặc bot); rọi đèn pin đầy 5 s (rút 6 s khi tắt) thì bay đi, để lại ánh sáng r 7 m 30 s; 6 s không đầy thì chớp tới vả dmg, 6 s tắt đèn + chân nặng; bot giữ 15 s thì nó đi. **Chưa xác định:** khoảng cách hiện (tạm 3,5 m), mức chân nặng (tạm x0,5) | `foe-moves-c.js` |
| Gương `mirror`: cặp A->B, ma trồi 2 s, chậm khi xa/đèn rọi, lôi người qua gương | INV 5; `G05_Mirror.cs` | done | `foe-moves-c.js bMirror`: cặp gương trong tường cách nhau >= 10 m, mỗi tấm 84 máu (không nhân theo nhà); thấy người trong 9 m đủ 2 s thì ma trồi ra, đi tới người gần nhất, chậm dần khi xa gương (tối thiểu x0,32), x0,42 khi bị rọi; chạm 20 px thì lôi người ra ở gương kia (mất dmg); 2 phát súng lục hoặc đèn rọi làm vỡ, vỡ một tấm thì hết lối. **Chưa xác định:** tầm thấy (tạm 9 m), quãng chậm dần (tạm 12 m), nghỉ giữa hai lần lôi (tạm 8 s), rọi bao lâu thì vỡ (tạm 3 s) | `foe-moves-c.js` |
| Boss vampire (pha: ẩn, dơi, hiện, vòng đỏ, hút máu, ném, biến mất) | INV 5; `G10_FoeKinds_vampire.cs` | done | `bosses.js bVampire`: ẩn 5 s, dơi bay, hiện cách người 3-3,8 m, vòng đỏ r 4,6; trong vòng thì bị giữ hút máu 2,2 s (boss hồi đúng lượng hút), ném văng (đập tường mất thêm), biến mất. **Chưa xác định:** thời gian báo vòng (tạm 1,2 s), tốc hút (tạm 12 máu/s), lực ném (tạm 9 m/s), sát thương đập tường (tạm 10) | `bosses.js` |
| Boss nurse (la gọi quái, kim tiêm làm chậm, giữ khoảng cách) | INV 5; `G10_FoeKinds_nurse.cs` | done | `bosses.js bNurse`: thấy người thì la, quái trong tầm kéo tới; ngắm vạch hồng rồi bắn kim tiêm: dmg + chậm; giữ khoảng cách như gunner; tốc 42 px/s theo code (inventory ghi 56). **Chưa xác định:** tầm la (tạm 14 m, 20 s một lần), mức chậm (tạm x0,6 trong 4 s) | `bosses.js` |
| Boss joker (lao tới ai chạm bẫy, loot giả nổ hộp hề) | INV 5; MEM `joker-trap-rush` | partial | `bosses.js bJoker`: đặt loot giả có giá; ai kéo bằng tia, chất lên xe, hoặc bot nhặt thì nổ hộp hề; `jokerRush` lao x2,2 tối đa 10 s đã có, nhưng bẫy sàn chưa làm nên chưa có gì gọi nó. **Chưa xác định:** nhịp đặt loot giả (tạm 20 s, tối đa 3), nổ (tạm r 2,5 m, lực 0,7) | `bosses.js` |
| Boss alien (bắn mực làm mù màn hình) | INV 5; `G10_FoeKinds_alien.cs` | done | `bosses.js bAlien`: vạch tím rồi bắn mực: màn hình phủ vết mực đen (không chữ), không mất máu; ngoài ra đuổi đánh cận chiến. **Chưa xác định:** thời gian mù (tạm 4 s), hồi chiêu mực (tạm 8 s) | `bosses.js` |
| Boss pharaoh (đánh dấu khoá, lồng xương, gậy) | INV 5; `G10_FoeKinds_pharaoh.cs` | done | `bosses.js bPharaoh`: bóng khoá dưới chân người; đứng yên trong đó thì lồng xương sập (không đi được, vẫn đấm được); đấm vỡ lồng 66 máu, không thì 3 s sau gậy đập dmg; bước ra thì trượt. **Chưa xác định:** nhịp đánh dấu (tạm 10 s, tầm 9 m), thời gian bóng (tạm 2 s, r 1,2 m), gậy sau (tạm 3 s) | `bosses.js` |
| Boss từ nhà 3 (`bossFromHouse 3`), mỗi nhà một boss theo theme, không hồi sinh, choáng giới hạn 1.2 s | INV 5 | done | `bosses.js spawnBoss` (run.js gọi sau roster); không hồi sinh; chỉ đồ trạm làm choáng (thuốc mê, lựu choáng; gear.sleep), tối đa 1,2 s rồi miễn 4 s; kỹ năng và xe đẩy không làm choáng; hất x0,15 | `bosses.js` |
| Quái đánh quái (friendly fire x1): đạn, vung, bom, cú húc | INV 5; MEM `foe-friendly-fire`; `G29_FoeFriendlyFire.cs` | partial | nổ (`explode`) trúng quái; vung/đạn quái lên quái không có | `foes.js` |
| Đẩy lùi / choáng: người đẩy xe đâm quái (shove 2.2, choáng 0.8) | INV 3 | done | `cart.js`: xe lăn > 1,2 m/s chạm quái thì hất max(2,2, 0,8 x tốc độ) và choáng 0,8 s. **Chưa xác định:** đơn vị của 'shove 2.2' (coi là m/s) | `beam.js` |
| Chiêu thức bot hạ quái, điểm yếu theo loài (BOT_TACTIC) | MEM `bot-foe-tactics-skills` | partial | xem mục 7 | `skills.js` |

---------------------------------------------------------------------------------------------------
## 6. Nhân vật: kỹ năng chủ động và nội tại

14 nhân vật (INV 6, `SQ/SqContent.cs`), kỹ năng ở `js/skills.js` (`CREW[id]`, phím E), nội tại ở `js/passives.js`. Test: `tools/skills.js` (32/32 theo trail), `tools/passives.js` (17/17).

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Flare `flash`: quái trong 5.5 ô đứng yên 3 s, quên mục tiêu (cd 16) | INV 6 | done | `skills.js` s_flash | `skills.js` |
| Halo `healring`: vòng hồi 9 hp/s 6 s, r 4.2 (cd 20) | INV 6 | done | `skills.js` | `skills.js` |
| Atlas `gong`: 8 s không phạt cân, +30% chạy (cd 18) | INV 6 | done | `skills.js`, `player.js gongT` | `skills.js` |
| Pick `unlock`: mở mọi cửa khoá trong 9 ô, gột và hồi 15 | INV 6 | done | `skills.js` + `house3d.js unjam` | `skills.js` |
| Shade `vanish`: vô hình 6 s (cd 24) | INV 6 | done | `skills.js` invisT, chặn canSee | `skills.js` |
| Quake `shock`: r 3.5, dmg 40, choáng 1.5 s (cd 22), vùng oval khớp VFX | INV 6; MEM `quake-shock-nerf` | partial | số đúng; vùng 3D hình tròn, chưa kiểm oval; không nhảy leap | `skills.js` |
| Lure `decoy`: hộp ồn kéo quái trong 16 ô, 9 s (cd 19) | INV 6 | done | `skills.js` lureT | `skills.js` |
| Hook `rescue`: móc kéo bạn gục trong 9 ô, nhấc một người (cd 26) | INV 6 | done | `skills.js` | `skills.js` |
| Barb `cage`: bốn khiên chặn quái 9 s (cd 21) | INV 6 | done | `skills.js` cages, `foes.js keepApart` | `skills.js` |
| Blink `blink`: dịch 6.5 ô xuyên tường + bản sao, đáp `farthestOpen` (cd 12) | INV 6; MEM `blink-landing` | partial | dịch chuyển có (`skills.js`); chưa kiểm `farthestOpen` xoay ±45 độ và bản sao | `skills.js` |
| Oracle `reveal`: lộ hết loot, quái, bệ 12 s, đèn x1.5 (cd 25) | INV 6 | done | `skills.js` revealT, minimap | `skills.js` |
| Frost `freeze`: đóng băng quái trong 8 ô 4.5 s, +50% sát thương (cd 23) | INV 6 | done | `skills.js` vulnT | `skills.js` |
| Magnet `pull`: hút tối đa 2 món rơi trong 5 ô vào một túi vàng (cd 35) | INV 6 | done | `skills.js` (bag) | `skills.js` |
| Seraph `angel`: hồi cả đội gục, 5 s không gục (cd 30) | INV 6 | done | `skills.js` s_angel, `player.js noDownT` | `skills.js` |
| 14 nội tại (Flare +40% sáng, Halo hồi 1 hp/s... Seraph sống sót 30 s) | INV 6 | done | `passives.js`; mở sẵn không cần cấp 10 | `passives.js` |
| Cd -10% ở cấp 5, nội tại mở ở cấp 10, tăng chỉ số theo cấp | INV 6; `upgrade.json` | out of scope | meta nâng cấp; 3D mặc định cấp tối đa | none |
| Chỉ số riêng từng nhân vật (hp/atk/spd/carry/grit/atkR) | INV 6 | partial | `skills.js CREW` có hp/atk/spd/carry; chưa thấy grit (giảm sát thương) và atkR/atkCd riêng | `skills.js` |
| Tay không (fist) với `atk`, vũ khí thay thế; cú đấm thường hất 106,67 px/s (`plainHitKnock`), quái nhẹ `knockMul` 3 | INV 3, 6 | done | `melee.js` (2026-11-19): chuột phải đấm bằng `CREW[id].atk`, hất 4,44 m/s, quái nhẹ x3, gậy đi chung đường đòn (vũ khí thay nắm đấm). **Chưa xác định:** `atkR`/`atkCd` riêng từng nhân vật (INV 6 chỉ nêu tên; tạm dùng 1,15 m / 0,9 s của bot) và danh sách loài nào là 'quái nhẹ' (tạm: hp gốc <= 50, tức gnome, banger, brat, minelayer, gacha) | `melee.js` 16 bài |

---------------------------------------------------------------------------------------------------
## 7. Bot đồng đội

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| 9 vai (loot, thu, soi, baoke, hotong, cuuho, nhu, san, tiepte) | INV 2, 6; `tactics.json`, `SQ/SqAutoRoles.cs` | done | `bots.js`; ghi chú trail: 6 vai sau là cách đọc của bản port, nguồn chỉ có tên và % | `skills.js` (8 bài vai) |
| Bot chở đồ/đầu ra bệ, đánh quái, thăm dò | `ENG/G23_BotExplore.cs`, `G13_BotBrain.cs` | done | `bots.js` | `skills.js` |
| Bot dùng kỹ năng theo luật (`SqBotCast`) | MEM `bot-foe-tactics-skills` | done | `bots.js` | `skills.js` |
| Chiến thuật theo loài (IGNORE/RUN/SLIP/MELEE, `BOT_TACTIC`) | MEM `bot-foe-tactics-skills`, `bot-slip-settings-pause` | partial | `bots.js:20` bỏ qua ma/tay/angel; chưa có bảng đầy đủ theo 16 loài, chưa có slip theo nhịp | none |
| Né mìn, né vòng húc của rook, né gương | `G23_BotRook.cs`, `G23_BotMirror.cs` | missing | quái chưa có các chiêu đó | none |
| Bot hỗ trợ, không tự chơi: đổi việc theo tình huống, đánh-lùi, dùng xe | MEM `bot-support-not-player` | partial | vai cố định trong `bots.js`; không đổi vai theo ngữ cảnh | none |
| Bot lách bẫy, vào bẫy khói đập tắt | MEM `only-smoke-trap-breakable`; `G23_BotHazard.cs` | missing | không có bẫy | none |
| Bot dùng xe đẩy, nhẫn, súng | `G23_BotRing.cs`, `G23_BotGun.cs` | missing | thiếu hệ xe/nhẫn; bot không bắn | none |
| Bot chờ đủ người ở bệ, không kẹt, không lặp | `G23_BotPadWait.cs`, `G23_BotUnstick.cs` | partial | `bots.js` có anti-stuck cơ bản; "hold" cho test | `skills.js` |
| Bot "nói" (callouts) | `ENG/BotCallouts.cs`, `G21_BotTalk.cs` | out of scope | UI/âm giọng | none |

---------------------------------------------------------------------------------------------------
## 8. Đồ trạm, vũ khí, thuốc, xe, xe đẩy, sạc, dịch chuyển

Trạm 3D (`js/station.js`) bán: 3 gói máu, 5 thuốc (máu, thể lực, sức, đèn, chạy), 5 đồ (súng lục, gậy, thuốc mê, xà beng, lựu choáng). Trail dòng 37 ghi rõ phần bỏ ngoài: pin xe, mìn, bom chùm, shotgun, laser, xe.

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Súng lục 62 dmg, 20 đạn | INV 7; `ENG/G14_Weapon.cs` | done | `gear.js` | `gear.js` |
| Gậy (bat) 12 lần | INV 7 | partial | `gear.js` gậy 30 dmg + đẩy lùi; 3D không giới hạn số lần như 2D | `gear.js` |
| Thuốc mê (tranq) 3 lần, ngủ 12 s, ma miễn | INV 7 | done | `gear.js` | `gear.js` |
| Xà beng (pry) 3 lần, mở cửa kẹt | INV 7 | done | `gear.js` giữ F 2 s (Pick 1 s) | `gear.js` |
| Lựu đạn choáng 2 lần, ngủ 6 s, boss ít hơn | INV 7 | partial | `gear.js` 3.5 m ngủ 6 s (2D 6 ô); không phân biệt boss | `gear.js` |
| Bom (bomb) 2 lần | INV 7; `ENG/G04_Items.cs` | missing | không có | none |
| Xung (shockwave) 2 lần | INV 7 | missing | không có | none |
| Bom chùm (cluster) | INV 7 | missing | không có | none |
| Mìn của người chơi 8000 | INV 7 | missing | quái minelayer có mìn riêng, người chơi không | none |
| Shotgun 7 viên, giật | INV 7 | missing | không có | none |
| Laser nạp rồi bắn (x4 khi đầy) | INV 7 | missing | không có | none |
| Chảo (pan) phản đạn 0.25 s | INV 7 | missing | không có | none |
| Gậy tạ (sledge) 70 dmg, nứt loot, nổ orb, phá cửa | INV 7 | missing | không có | none |
| Dao rựa (machete) đòn 3 x1.6 | INV 7 | missing | không có | none |
| Gậy điện (prodzap) choáng 3 s | INV 7 | missing | không có | none |
| Búa bơm hơi (inflatable hammer) | INV 7 | missing | không có | none |
| Nhẫn (carry/speed/power/guard, 7 lần, 8-12 s) | INV 7; `ENG/G15_Ring.cs` | missing | không có | none |
| Pin xe (battery 6000) | INV 7 | missing | `station.js` chỉ nhắc | none |
| Gói máu 25/50/100 | INV 7 | done | `station.js`, `run.js:381 usePack` | `run.js` |
| Thuốc hp+20, thể lực+10, sức+10, đèn+16%, chạy+20% | INV 7 | done | `station.js` OFFERS, `player.js` | `gear.js` |
| Thuốc reach, rush, push, regen, grip, túi +1, xe đẩy +1 | INV 7 | missing | không có trong OFFERS | none |
| Giá nâng cấp tăng 1.6 mỗi lần mua, tồn kho ngẫu nhiên (3 nâng cấp, 5 đồ, 2 xe) | INV 7; `station_rules` | missing | 3D bày cố định, không xoay vòng ngẫu nhiên | none |
| Trả tiền đứng trên bệ trả 3 s | INV 7 | done | `station.js` PAY_HOLD | `run.js` |
| Đạn/số lần nạp lại mỗi nhà (`napDanLai`) | INV 7 | partial | cần kiểm `gear.js` có nạp lại giữa nhà | `gear.js` |
| Xe máy trinh sát (scout) 28000, xe máy chở (haul) 32000 | INV 7; `ENG/G02_Bikes.cs`, MEM `bike-fuel-hits` | missing | `house3d.js` chỉ vẽ xe làm đồ trang trí | none |
| Xe đẩy (cart) 6 ô, mini 3, +1 ô/nâng cấp, tối đa giá món 20000 | INV 3, 7; `G03_CartRoute.cs`, `G03_CartDoor.cs` | partial | `cart.js` (2026-11-19): 1 xe cạnh xe tải mỗi nhà, thùng vật lý, khối lượng (xe + hàng)/3,4, qua cầu thang, đẩy quái; house-check kiểm xe 3x3 chạy hết mọi dốc. Còn thiếu: giới hạn 6 ô/món 20000, xe mini, nâng cấp ô, mua xe ở trạm. Cột cũ: | không có xe đẩy; `housegen.js` cũng chưa kiểm "xe luôn tới được mọi bệ" như 2D | `house-check.js` (chỉ kiểm bệ tới được bằng người) |
| Xăng xe chỉ hao khi va tường/quái (2) | MEM `bike-fuel-hits` | missing | thuộc xe | none |
| Trạm sạc trên xe tải (3 năng lượng/pin, nạp đạn/nhẫn/xe giữa nhà) | INV 7; MEM `truck-charger`, `ENG/G05_Charger.cs` | missing | không có | none |
| Bệ dịch chuyển: bệ phóng 15000, bệ gọi về 18000 (cd 60, giữ 3 s, đáp >= 20 ô) | INV 7; MEM `teleport-pads`, `G05_TelePad` | missing | không có | none |
| Đồ đội rải trên sàn xe, E lấy, F thả, màn mới về xe | INV 1; MEM `truck-floor-gear`, `ENG/G05_TeamGear.cs`, `G09_Stash.cs` | missing | 3D chỉ có một ô đồ cá nhân | none |
| Hiệu ứng khói xe máy | `ENG/G25_BikeSmoke.cs` | out of scope | VFX, thuộc xe | none |

---------------------------------------------------------------------------------------------------
## 9. Nhà, cửa, bẫy, ống thông gió, thời tiết

| feature | 2D source | 3D status | 3D location / thiếu gì | test |
|---|---|---|---|---|
| Sinh nhà từ prefab thật (cây, cửa 3 ô, theo `stage_theme_houses`) | INV 8; `WORLD/HouseGen.cs` | done | `housegen.js` + `data/rooms.js` (xuất bởi `tools/export-rooms.js`) | `house-check.js` |
| Năm theme: vampire, kim tự tháp, Việt Nam (làng, không ống), trạm vũ trụ, bệnh viện | INV 8 | done | `house3d.js` theme + NIGHT hệ số | `look.js`, `house3d.js` |
| Cửa đôi tự mở khi lại gần, quái cũng mở | INV 7 | done | `house3d.js`, `nav.js` | `house3d.js`, `foes.js` |
| Cửa kẹt (jammed), tối đa 30% sàn bị niêm | INV 7; MEM `jammed-doors-new-layout` | done | `housegen.js:821`, `house3d.js` thanh đỏ | `house-check.js`, `gear.js` |
| Mở cửa kẹt: xà beng, kỹ năng Pick, nội tại Pick (2x nhanh) | INV 6, 7 | done | `gear.js`, `skills.js`, `passives.js` | `gear.js`, `passives.js` |
| Phá cửa bằng vũ lực (gậy tạ, nổ), tiếng ồn 11 ô | INV 7 | partial | tiếng cửa sập có (`door:slam`); không có cách phá cửa kẹt ngoài xà beng/Pick | `gear.js` |
| Cửa trang trí một cánh (DecorDoor) | INV 8; `WORLD/DecorDoor.cs` | unknown | không đối chiếu được | none |
| Bẫy sàn: gai, laser, lửa, khí độc, băng, vũng độc, bùn, khói (8 loại) | INV 7; `WORLD/TrapPoint.cs`, `ENG/G17_BayLo.cs`, `G17_SmokeTrap.cs` | missing | `housegen.js:690` đọc ra `traps[]` từ prefab, `station.js` để trống; `house3d.js` không vẽ và không có hiệu lực | none |
| Chỉ bẫy khói đập tắt được | MEM `only-smoke-trap-breakable` | missing | thuộc bẫy | none |
| Ống thông gió: 4 cặp, bò 12-18 s, quái không vào, làng Việt Nam không có | INV 7; MEM `vents`, `ENG/G28_Vents.cs` | missing | không có | none |
| Đèn trang trí chỉ phát sáng khi nón đèn rọi trúng | INV 8; MEM `decor-lights`, `ENG/G24_DecorLight.cs` | partial | `lights.js`/`house3d.js` có đèn nhà rè và nháy; chưa thấy luật "chỉ khi nón đèn pin chạm" | `look.js` |
| Sét/thời tiết theo phòng (4 tia/phút/phòng) | `ENG/G23_Weather.cs` | missing | không có | none |
| Tường/sàn che khuất, nội thất làm chắn tầm nhìn | INV 8 | done | `house3d.js` | `house3d.js`, `look.js` |
| Sảnh/phòng xuất: bệ trong phòng xe, bệ phụ trong phòng "extract" | INV 8 | done | `housegen.js`, `truck.js` | `house-check.js` |
| Xe tải có thật đặt ở phòng xe, collider, nút lên xe | INV 1 | done | `truck.js` | `run.js` |

---------------------------------------------------------------------------------------------------
## Danh sách ưu tiên (thiếu và một phần), người chơi thấy rõ nhất trước

1. ~~Chiêu đặc trưng của quái đã có chỉ số nhưng chỉ chạy tới đánh: gunner, rook, wallhand, mummy, headthrower, impostor, gacha, hunter~~ done 2026-11-19 (`foe-moves.js`, `foe-moves-b.js`) (mục 5, tất cả đang `beh: 'melee'`).
2. ~~Tượng angel (rọi đèn 5 s) và mirror (cặp gương, ma lôi người)~~ done 2026-11-20 (`foe-moves-c.js`).
3. ~~Boss 5 theme (vampire, nurse, joker, alien, pharaoh) từ nhà 3~~ done 2026-11-20 (`bosses.js`); joker lao tới khi có người chạm bẫy chờ bẫy sàn (mục 4).
4. Bẫy sàn 8 loại (gai, laser, lửa, khí, băng, vũng độc, bùn, khói) kể cả hỏng loot và bẫy khói đập tắt; dữ liệu đã có sẵn trong `housegen.js traps[]`.
5. Xe đẩy (cart) và xe máy scout/haul: cách chở đồ nặng/đắt chính của 2D, kèm luật "xe tới được mọi bệ" và đẩy quái.
6. Rương + mimic (30%) và két sắt + chìa khoá: nguồn tiền phụ không đếm chỉ tiêu.
7. Vũ khí/đồ trạm còn thiếu: bom, xung, bom chùm, mìn, shotgun, laser, chảo, gậy tạ, rựa, gậy điện, búa bơm; cộng nhẫn 4 loại.
8. Ống thông gió (vent) 4 cặp mỗi nhà (trừ làng Việt Nam).
9. Trạm sạc trên xe, bệ dịch chuyển (phóng/gọi về), đồ đội rải sàn xe, phòng ride room XUẤT PHÁT.
10. Kho thuốc nâng cấp còn thiếu (reach, rush, push, regen, grip, túi +1, xe đẩy +1) và xoay kệ ngẫu nhiên, giá x1.6.
11. ~~Chỉ tiêu theo số người trong đội (`crewMul 0.4 + 0.15n`)~~ done 2026-11-19 (`js/quota.js`).
12. Vô Tận (sau nhà 5, hệ số tăng, phòng phụ) và PvP: chế độ mới hoàn toàn.
13. Chiêu quái thứ yếu: gnome đàn 3, quái đánh quái bằng đạn/vung, shove khi đẩy xe, nhiều người cùng kéo một món.
14. Bot: bảng chiến thuật theo loài, né rook/mìn/gương, đổi việc theo ngữ cảnh, dùng xe/nhẫn/súng.
15. Thể loại phụ: tiếng nói gây ồn (mic), sét theo phòng, cảnh phim xe vào/ra, đèn trang trí chỉ sáng khi đèn pin rọi.

---------------------------------------------------------------------------------------------------
## Không xác định được

- Có trừ thể lực 6 khi ném loot trong `grab.js` hay không (chưa đọc hết `grab.js`).
- `napDanLai` (nạp đạn mỗi nhà) trong `gear.js`, và gậy 3D có giới hạn 12 lần không.
- Số liệu ô nghe/nhìn của quái ở prefab/`md_foes` có thể đè bảng (INV mục 10.1), chưa so với `FOE_KINDS` 3D.
- `DecorDoor` (cửa trang trí một cánh) và loot dạng thanh/đường chấm trên mini-map: chưa kiểm chi tiết trong `run.js`/`house3d.js`.
- Luật "Vai U", "nhẫn", vùng shock hình oval: chưa đối chiếu số trong prefab `Resources/World/Crew/<id>.prefab` (có thể đè `SqContent`, MEM `jammed-doors-new-layout`/`minelayer-gait`).
- ~~Điều kiện chỉ tiêu chia theo số bệ và `houseQuotaMul` ở 3D~~ đã kiểm 2026-11-19: `run.js loadHouse` tính `quotaFor(lootSum, level, crew)` rồi chia đều `round(total/số bệ/10)*10` cho mọi bệ; `house3d.js` nay dùng cùng công thức. `houseQuotaMul` không có trong code 3D (coi bằng 1), số gốc chưa xác định.
- Không đọc `G10_FoeKinds_*.cs` chi tiết thời gian pha, nên bảng quái/boss ở trên theo INV mục 5, chưa kiểm số lại với nguồn.
- Không đối chiếu từng test trong `tools/` (không chạy), chỉ dựa vào số liệu trong `trail.tsv` và tên tệp.
