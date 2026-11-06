# Soul Knight trên web — chế độ thường (ải 1-1 → 3-5)

Yêu cầu chủ dự án (2026-09-29): "từ asset và config lấy đc từ soul knight làm 1 game như vậy trên
web, chỉ tạm thời làm progress ải thường trước, chú ý skill, anim, vfx, stats, weapon, UI/UX, map,
monsters để tui có thể feel chính xác được. Cái nào bán bằng tiền thật thì cứ cho mua fake."

Thư mục game: `games/soulknight/`. Art ChillyRoom gói trong `games/soulknight/art/sk/` (cùng luật gỡ
với `games/hic/art/sk/`).

## Định nghĩa xong

Trên Pages (`.../games/soulknight/index.html`): vào sảnh Hiệp Sĩ, chọn nhân vật (khoá thì mở bằng
đá quý; nhân vật bán bằng tiền thật thì bấm mua giả là có), qua cổng vào 1-1. Chạy 1-1 → 1-5 (trùm),
2-1 → 2-5, 3-1 → 3-5. Mỗi ải là lưới phòng nối hành lang: phòng đầu, phòng đánh (khoá cửa, 2-3 đợt
quái, mở rương thưởng), phòng rương vũ khí, có khi phòng thương nhân, phòng trùm ở x-5, cổng sang ải.
HUD kiểu SK: máu/giáp/năng lượng góc trên trái, bản đồ nhỏ, vàng, ô vũ khí + chi phí năng lượng,
nút kỹ năng có hồi chiêu.

## Nguồn số liệu [ĐO TRONG REPO, 2026-09-29]

- 25 bundle `.ab` còn giữ ở `~/Downloads/sk-ref/_ab/` (xapk gốc đã xoá). UnityPy 1.25 đọc được
  **typetree của MonoBehaviour**, nên có cấu hình thật:
  - Quái: `RoleAttribute` (max_hp, speed), `EnemyAIxx` (shoot_cd, attackProbability, reward_*),
    súng quái `EGunxxx` (atk, bullet_speed, deviation, repel), prefab đạn (`Bullet01`...).
  - Theme theo bundle: `level__1__a` Forest, `1b` Ice(Glacier), `1c` Ruins, `2a` Castle,
    `2b` Grave, `2c` Halloween, `2d` IceCave, `2e` Swamp, `2f` Relic, `2g` MachineryCity,
    `3a` Aliens, `3b` Volcano, `3c` Island. `MapManagerLevel`: map_long, roomSpacing 35, cỡ phòng.
  - Hoạt ảnh: `AnimatorController` → state (ide/run/dead/atk) → `AnimationClip`. Khung sprite giải
    từ `m_StreamedClip` (time, index vào `pptrCurveMapping`). npc knight ide = 8 khung @16fps.
  - `CharacterSprites` (common.ab): idle/run/dead của MỌI nhân vật + skin.
  - `CommonConfig.heroHandAbilities`: sát thương đánh tay từng nhân vật.
- KHÔNG có `weapon.ab`, bundle trùm, bundle nhân vật → chỉ số vũ khí/nhân vật/trùm lấy từ wiki
  (`soul-knight.fandom.com/api.php?action=parse&prop=wikitext`, infobox máy đọc được), gắn nhãn
  `[WIKI]`. Hình vũ khí khớp wiki bằng so điểm ảnh, không đoán theo tên.
- Không có âm thanh (đã lọc lúc bóc). Tiếng phải tổng hợp.

## Hình dạng dữ liệu

- `data/sk-data.js` (sinh bởi `tools/build_sk.py`, không sửa tay): `SK_DATA = {anims, heroes,
  enemies, bullets, themes, objects, vfx, ui}`, khung trỏ vào `art/sk/atlas*.png` qua `SK_ATLAS`.
- `data/design.js` (tay + wiki): nhân vật (chỉ số, kỹ năng, giá), vũ khí (kind, số liệu), trùm,
  bảng tiến trình ải, giá cửa hàng.
- Runtime: máy trạng thái `sảnh → ải(vào, chơi, cổng) → chết | thắng`; phòng `chờ → khoá(đợt i) →
  sạch`; AI quái là bảng tra theo tên lớp `EnemyAIxx`; vũ khí là bảng tra theo `kind`.

## Việc

1. [x] Lever bóc: `tools/build_sk.py` → atlas + `sk-data.js` + `tools/viewer.html`.
2. [x] Wiki: `tools/wiki_pull.py` → `tools/wiki/*.json`; `tools/build_design.py` → `data/sk-wiki.js`.
3. [x] Runtime (rev 20260929b): lõi, sảnh + mua giả, 13 kỹ năng, 268 vũ khí, 5 trùm, lái buôn/tượng/buff, tiếng.
4. [x] Lên hub, đẩy, bộ kiểm chạy trên Pages: smoke 16, lobby 19, bosses 46 (2026-09-29).
5. [x] Season Mode ("Escape from Monkia"), rev 20260929c: căn cứ + Ngoại ô căn cứ (Scene1), vòng
   căn cứ → cổng → đánh khỉ, mở thùng → sơ tán 5 giây → về kho. Nghiên cứu ở `tools/season/RESEARCH.md`,
   thế giới ở `tools/season/README.md` (lever `build_season.py`), đồ ở `build_items.py` (108 món).
   Mã ở `js/season/` (world, inventory, ui, quests, season). Tạm dừng chỉ có một bảng, trên canvas (ui.js).

6. [x] Bóc lại từ bản đủ 8.6.0 (`D:\sk86-ref`, 2375 bundle), sau khi chủ dự án chê thiếu anim/vfx/effect/config
   (2026-09-29). Lên Pages theo từng phần, rev d → j:
   - d: tiếng thật (`tools/audio`, 939 clip m4a). e: lever sang 8.6 (`skrip.py` có chỉ mục CAB), sửa clip quái đứng hình.
   - f: VFX thật (`tools/vfx`, `js/vfx.js`, 2599 hiệu ứng) + sửa chỉ số đường sprite trong `skrip.clip` (22 anim).
   - g: mùa giải bằng dữ liệu thật (tilemap gốc, 792 vật phẩm, 38 nhiệm vụ, hòm tử vong).
   - h: kỹ năng (`data/sk-skills86.js`, 44 kỹ năng) + buff/tượng/lái buôn (`data/sk-buffs86.js`).
   - i: trùm (`data/sk-bosses86.js`, 12 trận). j: vũ khí + đạn (`data/sk-weapons86.js`, 361 vũ khí).
   - Số đã giải mã (Luban AES, Lua DES, config XOR) ở `D:\sk86-ref\decoded`; công cụ ở `tools/config86/` CHƯA commit vì
     chứa khoá của ChillyRoom, repo public — chờ chủ dự án quyết.

7. [ ] Đợt art + anim + UI gốc (chủ dự án 2026-09-30: "polish + xài đúng đủ art + anim của soul knight gốc là quan trọng nhất").
   - Kiểm kê chạy lại được: `node test/soulknight-art-audit.js` (lệnh vẽ tay lúc chạy, xếp theo diện tích) và
     `python tools/anim_audit.py` → `tools/ANIM_AUDIT.md` (state anim gốc so với bản web, theo từng thực thể).
   - IL2CPP đã dump đủ (`D:\sk86-ref
untime\dump\dump.cs`); cách làm ở `tools/config86/README.md` mục 8.
   - [x] a. HUD trong ải dựng từ prefab gốc (`tools/ui`, `js/ugui.js`), rev 20260930a.
   - [x] b. Transform trong clip (`tools/clip_xform.py`, `SK.animXform/animPose`), rev 20260930b. Còn: 5 quái có chuyển động ở
     nút con chưa vẽ (e_tentacle, e_statueCrab_host, e_pumpkinHouse, đầu malphite02/03); track đang nội suy tuyến tính, nên dùng `seg` bậc ba như UI.
   - [x] c. Animator vũ khí của quái (218/220 súng) + layer char_* qua đồ thị controller thật (`SK_DATA.ctrl`), rev 20260930c.
   - [x] d. Bản đồ nhỏ, bảng tạm dừng, số sát thương (font LockClock + DOJump + màu CommonConfig). Thanh máu trùm vốn đã theo `boss_hp`.
   - [ ] e. Vật thể có anim: rương, lái buôn, tượng, cổng, NPC sảnh, thú cưng.
   - [x] f. Màn chọn nhân vật 8.6 dựng từ `common.ab` › `choosehero/ui_choose_hero.prefab` (ChooseHeroView), rev 20260930d.
     Còn: phụ đề skin, vé E, icon nội tại riêng từng nhân vật, ô dải cuộn dùng icon skin; mô tả kỹ năng dài bị tràn khung.

8. [x] Đợt kỹ năng + VFX + vũ khí (chủ dự án 2026-09-30: "skill của mỗi char đều chưa làm, fx cũng chưa đúng, weapon
   cũng chưa chuẩn"). Đo lúc bắt đầu: 39/103 kỹ năng có mã, 64 rơi về Song Thủ.
   - Khung: `SK.skillKit` (đồ nghề của skills.js), mỗi nhân vật thiếu kỹ năng một tệp `js/skills/<thư mục>.js`, ca kiểm ở
     `test/sk-skills/<thư mục>.js` (soulknight-skills.js tự nạp). actors.js: bấm K khi kỹ năng đang chạy gọi `press`.
   - Lever đọc mã ARM gốc: `tools/sk_method.py` (thay số [ƯỚC LƯỢNG] bằng [ĐO]).
   - Song song: 10 nhóm kỹ năng, kiểm + sửa vũ khí (actors.js phần vũ khí, weapons86), kiểm + sửa VFX (vfx.js, tools/vfx).
   - Vòng 1 (rev 20260930e): 103/103 kỹ năng có mã. Vòng 2 (rev 20260930f): số và logic đọc lại từ mã gốc cho cả 103
     kỹ năng, chiêu phụ lên `special`, `max` chỉ là số lượt khi skillType thuộc {4, 6, 9, 12} [ĐO SkillInfo.get_hasMultiCount];
     vũ khí có lao cận chiến, 7 lớp tự viết, nút đặc biệt của vũ khí; VFX có hạt sprite và vệt có texture.
   - Còn hở: nâng cấp/tài năng của nhân vật (bản web chưa có cấp nhân vật ngoài `SK.profile.level`), 54 lớp vũ khí có chiêu
     phụ và phần tiến hoá, bán kính nằm trong collider prefab chưa bóc (nhiều chỗ còn [ƯỚC LƯỢNG] trong js/skills/*),
     số của prefab envoy chưa vào build_skills86.py, `REAL_EV` trong actors.js là vá tạm cho `simulate` của build_w86.

## Còn hở (sau đợt 8.6)

- Kỹ năng: 24 kỹ năng còn rơi về Song Thủ (cần cưỡi thú, giữ-để-tụ, và mọi kỹ năng của hero c17–c41).
- Vũ khí: 7 món có mã riêng chỉ chạy hoạt ảnh (Đạn Đạo Lỗ Đen, Gậy Tử Linh, Sổ Tay Chết Chóc...); nhiệt Gatling chưa mô phỏng.
- Trùm: chọn trùm trong bể là đều nhau, ngưỡng nổi giận 50% theo wiki, độc/đóng băng của trùm chưa gây lên người.
- Buff: logic chọn buff giữa ải ở IL2CPP, đang theo wiki; buff cần thú cưng/đá quý chưa mở.
- VFX: 700/2599 hiệu ứng dùng tính năng runtime bỏ qua (hạt dạng mesh, noise, va chạm...). `Fire` thiếu cờ cộng sáng.
- Tải lần đầu nặng (`sk-vfx.js` 3,7 MB, gzip ~660 KB) — nên nạp lười.

## Còn hở (mùa giải)

- Chỉ có Căn Cứ + Vành Đai Căn Cứ; Tide Zone, Volcanic, Volcano Core, Research Lab còn khoá.
- 16/38 nhiệm vụ chạy được; 400/822 dòng vũ khí mùa chưa có tương đương trong engine.
- VFX của escape.ab (vòng sơ tán, ánh rương, cổng) chưa xuất, đang vẽ vòng tạm.

## Bộ kiểm

`node test/soulknight-<smoke|weapons|skills|bosses|rooms|lobby|sfx|vfx|season-world|season-ui>.js`, cần `python -m http.server 8811`
ở gốc repo; đặt `SK_URL=<url Pages>` để chạy trên bản thật.

9. [ ] Đợt polish theo clip (chủ dự án 2026-10-09: "polish lại full game … áp dụng watch-game-clips để làm cho game perfect").
   - Nguồn dựng lại trên Linux: XAPK 8.6.0 (apkpure, versionCode 80600) giải ra `~/sk86-ref` (2375 bundle, cùng bản với
     `D:\sk86-ref`). `skrip.py` đọc `SK86`, mặc định `~/sk86-ref` khi không phải Windows. `tools/config86` + `decoded/` không
     còn trên máy này; các tệp `data/sk-*86.js` đã sinh sẵn nên chưa cần giải mã lại.
   - Cách làm: mỗi cảnh chuẩn (sảnh, chọn nhân vật, phòng đầu, phòng đánh, rương, lái buôn, tượng, chọn buff, trùm, cổng,
     chết, tạm dừng, chủ đề 2-x/3-x) lấy khung clip gốc đặt cạnh ảnh bản web, ghi chỗ lệch kèm mốc giây. Lệch nặng sửa trước.
   - Nhật ký quyết định: `games/soulknight/tools/polish/decisions.tsv`. Bảng lệch: `tools/polish/GAPS.md`.
   - Xong khi: mọi lệch mức "nặng" trong GAPS.md đã sửa và chụp lại cạnh khung gốc; 10 bộ kiểm xanh trên Pages; rev mới.
   - [x] Đợt 1 (rev 20261009a, `e49a7f8e`): chữ CLEAR, thú cưng `js/pets.js`, sửa Mask hiện khối trắng. Kiểm trên Pages.
   - [x] Đợt 2 (rev 20261009b, `3ee2c5fe`): sảnh `js/hall.js` + `tools/hall/build_hall.py`. Mở game vào sảnh; `?quick=1` giữ luồng cũ
     (mọi bộ kiểm cũ chạy với cờ này, `test/soulknight-hall.js` kiểm luồng sảnh). `build_sk.py` thêm cờ `ia` cho phần prefab
     nằm dưới tổ tiên đang tắt; chỉ sảnh bỏ qua chúng (`skip`).
   - [x] Đợt 3 (rev 20261009c, `25cb814b`): màn tải `js/loading.js` từ scene `loading.ab › Canvas_Loading`, chọn thiên
     phú bằng `ui_buff_bar` + 3 thẻ `buff_tpl3`. Bổ sung sảnh (rev 20261009d, `d248a1c0`): ô đá quý, mèo đi theo.
   - [x] Đợt 4 (rev 20261009e): mỗi tầng bốc chủ đề trong `level/N/*` (`game.js rollThemes`). Chủ đề ngoài forest/castle/
     volcano mượn bể trùm + nhạc của chủ đề gốc cùng tầng (`SK.tierAnchor`); bộ kiểm cũ ghim `?themes=forest,castle,volcano`,
     `test/soulknight-themes.js` phủ cả 13. Trùm riêng mỗi chủ đề cần `config/enemies.json` đã giải mã (GAPS.md).
   - `[BẪY ĐÃ SẬP]` Vòng chờ `until ! pgrep -f "test/soulknight-"` tự khớp chính dòng lệnh của nó nên không bao giờ thoát.
     Chờ bộ kiểm bằng `run_in_background` (có thông báo khi xong), không vòng pgrep theo chuỗi có trong lệnh.
   - `[BẪY ĐÃ SẬP]` `pkill -f build_sk.py` giết luôn shell đang chạy lệnh (dòng lệnh của shell chứa chuỗi đó). Dùng
     `pgrep -f 'python.*build_sk'` lấy PID rồi `kill`.
   - `[BẪY ĐÃ SẬP]` Dựng `sk-data.js` (14 phút) trong lúc bộ kiểm đang chạy thì trang có thể nạp tệp ghi dở. Dựng xong rồi mới kiểm.
