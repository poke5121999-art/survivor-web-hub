# Tốc Độ: làm đủ game Zing Speed Mobile (pha 3, 2026-10-10)

Yêu cầu chủ dự án 2026-10-10, nguyên văn:

> Làm full game Zing Speed Mobile đi, mình thấy bản web còn thiếu nhiều lắm. Cần research thêm (watch-game-clips: xem thêm clip,
> đối chiếu APK) để liệt kê đủ mọi thứ game gốc có (chế độ chơi, sảnh, garage, đạo cụ, xếp hạng, luyện tập cắm cờ...), rồi làm hết.
> Chạy tự động tới khi xong, đừng dừng giữa chừng để hỏi.

Research (ngoài git, scratchpad phiên `c96d80b0…/scratchpad/research/`): `strings.md` (8663 chuỗi VN gốc, có hash),
`items.md` (đạo cụ trong APK), `screens.md` (màn UI, bậc, đường đua, sảnh 3D), `clips-lobby-practice.md`, `clips-items-ranked.md`.

## Kiểm kê: game gốc có gì → bản web làm gì

| Game gốc (tên VN gốc) | Nguồn | Bản web |
|---|---|---|
| Tốc Độ-Đơn | chuỗi a439eb0f | có từ pha 2 |
| Tốc Độ-Đội (2 đội, điểm theo hạng) | 0c7e0450 | làm: `TD.MODES.speedTeam`, `TD.teamScore` |
| Đạo Cụ-Đơn / Đạo Cụ-Đội | 3de1661e, 0da89674; `props/props_item_*`, `propspointconfig` | làm: nhánh Đạo cụ |
| X.Hạng-Tốc Độ (Đồng → Siêu Đẳng, sao, Vòng Trong) | b) trong strings.md; `uitextures/id_rank/` | làm: nhánh Xếp hạng |
| Huấn luyện tự do + Thiết lập/Về/Xóa điểm cờ | 1638d0c5, 0a4af0d8, 7dd892ab, f7130f92; clip wz6r3nirB7c t=35 | làm: nhánh Luyện tập |
| Khu Luyện Tập Đạo Cụ | 0cb4e1ca | làm: `TD.MODES.itemPractice` (bot yếu) |
| Thách Đấu Ảo Ảnh (bóng kỷ lục) | 8a2d4038, 257f36cc | làm: nhánh Luyện tập |
| Sảnh: ô Xuất Phát / Giải Đấu / Huấn Luyện, thanh dưới, thanh tiền | clip hhbJeuMU1ms t=0; `ui/#lobbyhome/og_lb_lobbyview` | làm: nhánh Sảnh |
| Gara: hạng xe A/B/C/S, radar 6 trục, thuộc tính, Lái ngay, sơn | clip 1KS1R0ZWQz4 t=267 | làm: nhánh Gara |
| Kỹ Năng bằng lái Sơ/Trung/Cao (cây nâng cấp tốn vàng) | clip hhbJeuMU1ms t=205 | làm: nhánh Gara |
| Nhiệm Vụ ngày, Thành Tựu, Cửa Hàng (mua xe) | 542a5dc2, 3399025b, da2dcda1 | làm: nhánh Gara |
| Ghép phòng "Đang ghép...", màn tải có thẻ người chơi | 593d5bf3, 34b46227; `ui/#loading/loadingplayer*item` | làm: nhánh Sảnh |
| Thêm đường đua (Tứ Xuyên, Reno, Polaris...) | screens.md mục 4 | làm: nhánh Đường đua |
| Cốt Truyện, Khu Giải Trí, Đội Đua (club), Cặp Đôi, Bạn Bè, Thư, chat, PET, thời trang, gacha xe X | | **Không**: cần máy chủ/người chơi thật hoặc nội dung truyện không có trong APK |
| Đua Xuyên Không, Át Chủ Bài, các mode sự kiện (`ui/gamemode/#*`) | | **Không**: mode sự kiện theo mùa, luật nằm trên máy chủ |
| Giọng đếm ngược, tiếng đạo cụ (bank `DJ`) | items.md mục 4 | **Không có trong APK**: tiếng đạo cụ tổng hợp hoặc mượn |

## Nền chung (đã dựng, chủ: luồng chính)

- `js/sim/modes.js`: `TD.MODES[id] = { id, name, karts, teams, items, ranked?, practice?, laps? }`, `TD.TEAM_POINTS`, `TD.TEAMS`, `TD.teamScore(R)`.
- `TD.Race.create({ mode, karts:[{ team }] })`: `R.mode`; `mode.items && TD.Items` thì `R.items = TD.Items.init(R)`, mỗi bước `TD.Items.step(R, h)`.
- `TD.Race.respawn(R, k, why, pose?)`: pose `{ x, y, z, yaw }` cho "Về điểm cờ".
- Kart nhận hiệu ứng ngoài: `k.fx = { stunT, kind, decay, slowT, slowMul }` (kart.js thi hành: mất lái + hãm; nhân trần tốc độ).
- `TD.racePlugins[]` (main.js): `{ start(ctx), update(dt, ctx), event(e, mine, ctx), settle(F, ctx), end(ctx), rects(hud), draw(g, hud) }`,
  `ctx = { R, me, M, root }`. Plugin tự lọc theo `ctx.R.mode`. `settle` đẩy thẻ HTML vào `F.cards` (màn thưởng).
- `TD.input.take(id)`: nút một lần. Phím E/Q → `item`/`item2`, F → `flag`, G → `flagBack`, X → `flagDel`; nút cảm ứng cùng id.
- `TD.hud.q(path)`: nút NGUI trong HUD (bật `PropParent` cho ô đạo cụ...).
- `TD.main.startRace({ mode })`; `TD.lobby.show()` thay `TD.menu.lobby()` khi có; `TD.garage.applySkills(me, save)`.
- Bản lưu thêm: `mode, rank{pts,best,streak,games,wins}, owned, skills, quests{day,prog,done}, ach, totals{...}`.
- `test/toc-do-modes.js`: mọi chế độ vào trận, chạy 6 s, không lỗi trang.

## Nhánh song song (mỗi nhánh một tập tệp)

| Nhánh | Tệp |
|---|---|
| Đạo cụ | `tools/export_items.py`, `art/items/`, `data/items.js`, `js/sim/items.js`, `js/view/items.js`, `data/audio.js` (chỉ thêm), `test/toc-do-items.js` |
| Xếp hạng | `tools/export_rank_ui.py`, `art/rank/`, `js/sim/rank.js`, `js/ui/ranked.js`, `css/ranked.css`, `test/toc-do-rank.js` |
| Sảnh | `tools/export_lobby_ui.py`, `art/lobby/`, `js/ui/lobby.js`, `css/lobby.css`, gỡ `UI.lobby` khỏi `menu.js` + `.lobby` khỏi `game.css`, `test/toc-do-lobby.js` |
| Gara | `js/ui/garage.js`, `css/garage.css`, `art/garage/`, `test/toc-do-garage.js` |
| Luyện tập | `tools/export_flag.py`, `art/practice/`, `js/sim/ghost.js`, `js/view/practice.js`, `test/toc-do-practice.js` |
| Đường đua | `tools/export_track*.py`, `art/tracks/<mới>/`, `art/maps/`, `data/tracks.js` (+ `boxes`), `data/campaths.js` |

### Hợp đồng giữa các nhánh

- Sảnh gọi: `TD.main.startRace({ mode })`, `TD.ranked.show()`, `TD.garage.open(tab)` với tab ∈ `cars|skills|quests|ach|shop`,
  `TD.garage.badges()` → `{ quests, ach }` (số chấm đỏ), `TD.RANK.of(pts)` → `{ tier, name, sub, stars, maxStars, badge }`.
  Mọi màn phụ quay về bằng `TD.lobby.show()`. Sảnh đặt `TD.main.lobbyCam = { pos, look, fov }` cho xe/tay đua 3D.
- Xếp hạng: `TD.RANK.settle(save, place, n, dnf)` → `{ before, after, delta, promoted, demoted }`, `TD.RANK.botSkill(save, rng)`.
- Đạo cụ phát sự kiện trong `R.events`: `item_get {item}`, `item_use {item, target?}`, `item_hit {item, by}`, `item_block {item, by}`.
  Gara đếm các sự kiện này cho nhiệm vụ/thành tựu qua plugin `event`.
- Đường đua: `TD.TRACKS[id].boxes = [{ s, pts: [[x, y, z], ...] }]` (toạ độ three.js, đã lật z) khi APK có `propspointconfig`.
  Đạo cụ tự sinh hàng hộp cho đường không có `boxes`.
- Gara: `TD.garage.applySkills(me, save)` nhân `me.p` (top, accel, drift, nitro…) theo cấp kỹ năng; xe chưa mua thì không chọn được.

Luồng chính giữ: `index.html`, `js/main.js`, `js/core.js`, `js/sim/{race,kart,modes}.js`, `js/ui/hud.js`, README, plan này.

## Kết quả (2026-10-10)

Sáu nhánh xong, gộp ở luồng chính. Bài kiểm riêng từng nhánh: items 55/0, rank 59/0, garage 43/0, practice 49/0, lobby 70/0;
sim 77/0 (6 đường). Bộ đầy đủ chạy tuần tự bằng `scratchpad/suite.sh` (xem báo cáo cuối phiên).

## Còn mở

- Xếp hạng: chưa có "Vòng Trong" (trận thăng bậc); thang bậc/sao là số chọn (APK không có bảng điểm). Huy hiệu `cs`, `df` chưa dùng.
- Đạo cụ: mô hình có xương xuất ở tư thế nghỉ (không hoạt ảnh); tiếng mượn; chưa thấy tên lửa đang bay trong ảnh chụp
  (bài kiểm Node xác nhận trúng). Lốc Xoáy khó thấy trên nền trời sáng.
- Đường A→B (Tứ Xuyên, Reno, Polaris...) cần luật "về đích ở checkpoint cuối" mới chạy được: chưa làm.
- Không làm (cần máy chủ hoặc nội dung không có trong APK): Cốt Truyện, Khu Giải Trí, Đội Đua, Cặp Đôi, bạn bè, thư, PET,
  thời trang, gacha xe X, mode sự kiện.
- Từ pha trước: Phố Tàu nặng, `NssStandard` thiếu probe, CWW, giọng đếm ngược, chưa ai nghe tiếng bằng tai.
