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

6. [ ] Bóc lại từ bản đủ 8.6.0 (`D:\sk86-ref`, 2375 bundle) sau khi chủ dự án chê thiếu anim/vfx/effect/config
   (2026-09-29). Đợt 1 song song: nền (skrip/build_sk sang 8.6), VFX (hệ hạt thật + `js/vfx.js`),
   tiếng thật (`js/sfx.js`), giải mã cấu hình (`tools/config86`). Đợt 2 dùng kết quả đợt 1: vũ khí + đạn,
   nhân vật + kỹ năng, trùm, mùa giải.

## Còn hở (mùa giải)

- Chỉ có vùng Ngoại ô căn cứ; Tide Zone, Volcanic, Volcano Core, Research Lab còn khoá.
- Khu huấn luyện và Bàn thiết kế chưa làm; nâng kho làm tạm ở Nhà kho.
- Chỉ 3 nhiệm vụ chạy (First Foray, Learn to Heal, Warehouse Expansion).
- Luật chết, vị trí/thời gian sơ tán và trọng số rơi đồ là [ĐOÁN]/[ƯỚC LƯỢNG], wiki không ghi.

## Còn hở (chế độ thường)

- Kỹ năng rơi về Song Thủ: Elf, Druid, Necromancer, Officer (cần hệ đồng minh/thú).
- Kỹ năng 2 và 3 của mỗi nhân vật chưa có mã; chọn trong sảnh thì game vẫn dùng kỹ năng 1.
- Nội tại phức tạp (phản đạn, độc, lửa, cầu máu...) chưa làm.
- Buff bỏ qua: Well Begun, Piercing Crit, Bouncing Bullets, Extra Weapon.
- Tượng Knight (cần hệ đi theo). Chưa có nhạc nền.

## Bộ kiểm

`node test/soulknight-<smoke|weapons|skills|bosses|rooms|lobby|sfx|season-world|season-ui>.js`, cần `python -m http.server 8811`
ở gốc repo; đặt `SK_URL=<url Pages>` để chạy trên bản thật.
