# Ca Trực Đêm 3D: kế hoạch và hợp đồng giữa các phần

Bản 3D góc nhìn thứ nhất của game Unity "Ca Trực Đêm: Biệt Đội" (D:/REPO_Topdown), chạy trên hub.
Gameplay dựng toàn bằng code (three.js r170 + Rapier 0.14, không tệp model/texture/animation).
UI giữ như game hiện tại (HTML/CSS + PNG của `D:/REPO_Topdown/Assets/Resources/WebPages`).
Nhân vật và quái là robot dựng bằng code, thiết kế riêng, không chép semibot của R.E.P.O.

## Điều kiện xong (kiểm được)

Trên `https://poke5121999-art.github.io/survivor-web-hub/games/repo3d/index.html`:
1. Từ sảnh (UI của game hiện tại) vào một ca 5 nhà, mỗi nhà đúng số phòng, bệ và loot theo `CFG/stage_theme_houses.json`.
2. Kéo đồ bằng tia, đồ mất giá theo `damageLoot` (delta-v, ngưỡng theo chất liệu), giao ở bệ giữ 3 s, đủ chỉ tiêu thì mở bệ kế, bệ cuối thì chạy về xe.
3. Quái robot săn theo tầm nhìn, tiếng ồn; người chơi gục thì rơi đầu, đồng đội mang đầu ra bệ để hồi.
4. `tools/run.js` cho bot tự chơi qua 5 nhà, 0 lỗi console, ≥ 50 fps ở 1280x720 trên máy dev.
5. Ảnh chụp từng loại quái, nhân vật, mỗi theme nhà được duyệt so với chuẩn của chủ dự án (`fps-high-quality/references/quality-bar.md`).

## Đơn vị

1 ô của game gốc (24 px) = 1 m. Tốc độ, delta-v px/s chia 24. Mọi số nằm ở `js/config.js`.

## Thứ tự (rủi ro trước)

| Đợt | Nội dung | Kiểm |
|---|---|---|
| 0 | Lát cắt: tia kéo, mất giá khi va, bệ giữ 3 s | `node tools/slice.js <out>` (xong 2026-11-18, 9/9) |
| 1a | Bộ robot bằng code: 14 nhân vật, quái, boss | `tools/robots.js` chụp ảnh xoay |
| 1b | Xuất phòng Unity ra JSON + bộ dựng nhà (tile) | `node tools/house-check.js` đếm phòng/bệ, mọi bệ tới được |
| 1c | UI từ WebPages: sảnh, HUD, bảng kết ca | ảnh chụp cạnh bản Unity |
| 2 | Nhà 3D từ layout 1b: tường, cửa đôi, sàn theo theme, đèn | ảnh chụp mỗi theme |
| 3 | Quái: nhận biết (nhìn, nghe, ồn), đuổi, đánh; 5 loài đầu ở nhà 1-2 | bài kiểm từng loài |
| 4 | Vòng ca: xe tải, chỉ tiêu, nhiều bệ, chạy về xe, trạm dịch vụ, 5 nhà | `tools/run.js` |
| 5 | Đồng đội bot, kỹ năng 14 nhân vật, đồ trạm | bài kiểm theo kỹ năng |
| 6 | Ánh sáng, hậu kỳ (port từ ga-chim), âm thanh sinh bằng code | `hdr-probe`, ảnh so |
| 7 | Co-op mạng | để sau, cần quyết riêng |

## Hợp đồng dữ liệu

`G` (main.js) giữ: `phys` (Rapier), `scene`, `camera`, `events` (`on/emit`), `loot`, `player`, `grab`, `extract`, `time`, `rng`.
Mỗi hệ có `step(dt, ...)` gọi trong `stepSim` theo thứ tự: player, grab, (bots), (foes), snapshot vận tốc, `world.step()`, loot, extract.
Body đã `world.removeRigidBody` thì không được đọc lại (wasm `unreachable`): đánh dấu `rec.dead` trước, mọi hệ kiểm `dead`.

Robot (`js/robots.js`): `buildRobot(spec) -> { root: THREE.Group, height, animate(dt, state) }`,
`spec = { kind: 'crew' | 'foe' | 'boss', id }`, `state = { speed, carrying, attack, hurt, down, look }`.

Layout nhà (`js/housegen.js`, tọa độ ô, y = trục z của 3D): xem `data/README` do đợt 1b viết.

## Nguồn

- Thiết kế: `D:/REPO_Topdown/brain/codebase/*.md`, `D:/REPO_Meta/gamespark-config/*.json`, `D:/REPO_Topdown/Assets/Scripts/Port`.
- Cơ chế R.E.P.O.: chỉ lấy cách chơi (tia kéo, đồ mất giá, bệ, đầu gục), không lấy tên, hình, map.
