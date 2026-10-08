# Biển Mù: đợt chuẩn gốc 2 (2026-10-08)

Chủ dự án yêu cầu: "biển mù: cần decode và lấy thêm asset vfx, sfx, anim, env. bắt cá, xếp cá, xếp nâng cấp, gear chưa giống game gốc".
Đợt trước: [[plans/dredge-web]] (mục "chuẩn gốc", rev `20261007b`). Nhật ký quyết định: `brain/plans/dredge-chuan-goc-2/decisions.tsv`.

## Vì sao đợt 1 vẫn bị chê

Đợt 1 khớp số trong prefab, và test khẳng định đúng các số ấy.
Ảnh chụp thật cho thấy chỗ lệch nằm ở luồng và bố cục màn hình, không ở số.
Ví dụ: khi câu, bản gốc đưa camera lên nhìn thẳng xuống thuyền và mở sẵn khoang bên phải; cá câu được nằm trên con trỏ để người chơi tự xếp (`D:\dredge-ref\shots-real\gog_04.jpg`).
Bản web giữ camera sau lái, tự nhét cá vào khoang và hiện một thẻ mà bản gốc không có.
Đợt này kiểm thêm bằng ảnh ghép cạnh ảnh chụp thật (`D:\dredge-ref\notes\sbs.py`) và bằng thứ tự các trạng thái người chơi thấy.

## Nguồn (ngoài repo, đừng xoá)

- Báo cáo khảo sát 7 mảng: `D:\dredge-ref\notes\audit\{fishing,cargo,shop-upgrade,gear,vfx-anim,sfx,env}.md`, mỗi khác biệt có mã (F1, C01, SU-04, GR-05, X0, SFX-05, E03...) và bằng chứng ở cả mã gốc lẫn mã web.
- Ảnh chụp thật: `D:\dredge-ref\shots-real\` (31 ảnh GOG + màn Upgrades của wiki, mục lục `INDEX.md`). Trang Steam bị chặn DNS trên máy này.
- Hợp đồng giao việc: `D:\dredge-ref\notes\DELEGATE.md` + `DELEGATE-R2.md`.

## Vị từ "xong"

Chạy trên `https://poke5121999-art.github.io/survivor-web-hub/games/dredge/index.html`, rev mới:
1. Câu cá: vào điểm câu thì camera chuyển sang rig nhìn từ trên (cao 20 m, FOV 40) trong 1 s, khoang mở bên phải; cá câu được nằm trên con trỏ, chưa đặt hoặc vứt thì không thả câu tiếp; banner loài mới chỉ hiện lần đầu.
2. Xếp cá: tiếng nhặt/đặt/vứt theo đúng loại đồ; lắp/tháo thiết bị ở bến phải giữ 0,6 s và tốn giờ lắp; tooltip đủ các phần của bản gốc.
3. Xếp nâng cấp: ụ tàu có màn Upgrades đúng cây và toạ độ đo được; chọn dự án thì mở lưới "Materials Required", xếp vật liệu từ khoang vào; đủ thì mua, thân tàu mới dựng lại khoang.
4. Gear: cửa hàng là hai lưới (lấy món từ lưới cửa hàng, tự xoay và đặt vào khoang); hệ năng lực (giữ E, chuột phải), đèn tính theo tổng lumen, còi sương, ống nhòm, tăng tốc có nhiệt.
5. Asset: hệ hạt chung chạy các prefab gốc theo tên; tiếng gọi theo tên clip gốc; `node test/dredge-asset-keys.js` xanh (mọi tên gọi trong mã đều có dữ liệu); `games/dredge` ≤ 90 MB.
6. Mọi `test/dredge-*.js` xanh trên Pages; không có `pageerror`, lỗi console, HTTP ≥ 400.

## Cách chạy

- Mỗi nhánh làm trong bản sao riêng `D:\dredge-wt\<nhánh>` (chỉ `games/dredge` + `test/dredge-*.js`), từ bản gốc `D:\dredge-wt\_base1`.
  Lý do: 8 nhánh sửa và chạy Playwright cùng một cây sẽ làm hỏng test của nhau. Tệp của từng nhánh tách rời, nên gộp = so với `_base1` rồi chép tệp đổi về repo.
- Mối nối chung dựng trước khi giao (đợt 0): `DRAudio` nhận tên clip gốc + cao độ; `DRParticles.spawn(tên prefab gốc)`; `DRCamera.override` / `fovAdd`; cổng `test/dredge-asset-keys.js`.

| Đợt | Nhánh | Tệp riêng | Khác biệt xử lý |
|---|---|---|---|
| 1 | dữ liệu | `tools/data.py` + mọi tệp nó sinh | trường item cho tooltip, lưới Pot1-8 + STORAGE_TRAY, 20 lưới nộp vật liệu, tiếng thời tiết, bảng nhập hàng |
| 1 | câu cá | `camera.js`, `spots.js`, `minigame.js`, `harvest_ui.py`, banner mới | F1, F3-F8, F10, F12-F14, F16 |
| 1 | gear | `abilities.js` mới, `input.js`, `hud.js`, `boat.js`, `rules.js`, `boat.py` | GR-01..05, 08..10, 12, 14..16, F11 |
| 1 | tiếng | `audio.py`, `audio.js`, `sfx.js` mới, `docks.js` | SFX-04..15 + clip các nhánh khác gọi |
| 1 | môi trường | `world.js`, `sky.js`, `water.js`, `env.py`, `world.py` | E03 thời tiết, E08, E10, E14 |
| 1 | Upgrades | `upgrade.js` mới, `upgrade_ui.py` | SU-06 cây, SU-03 áp nâng cấp |
| 1 | hệ hạt | `particles.py`, `particles.js`, `vfx.js` | X0, B1, B2, nguồn hạt đặt sẵn trong cảnh, mưa/tuyết/sét |
| 1 | anim | `anim.py`, `anim.js`, `dialogue.js` | bóc clip + controller, U2 chân dung |
| 1b | khoang | `cargo.js`, `grid.js`, `cargo_ui.py` | mối nối lưới trái (kho, cửa hàng, lưới nộp, khay), khoang đi kèm khi câu, C03-C16 |
| 2 | câu cá 2, cửa hàng, Upgrades 2, thả lưới/bẫy | `spots.js`, `dock.js`, `upgrade.js`, `deploy.js` mới | F2, F9, SU-01/02/04/05/07..14, GR-06, GR-07, GR-13 |
| 3 (nếu còn ngân sách) | sinh vật, sự kiện thế giới | `creatures.py` mới | E05-E07, E11, E12, W1-W5 |

## Bàn giao (tạm dừng 2026-10-08 15:40, chủ dự án mở phiên mới)

Phiên mới **không** gọi lại được các agent của phiên cũ. Mỗi nhánh có tệp đề bài kèm trạng thái lúc dừng ở `D:\dredge-ref\notes\briefs\<nhánh>.md`. Giao lại nguyên văn tệp đó cho một agent mới, cùng model ghi ở dòng đầu, làm tiếp trong bản sao của nhánh.

- **Repo** (`D:\survivor-web-hub`, nhánh `main`): đã commit và đẩy theo yêu cầu chủ dự án, rev `20261008a`. Người chơi chưa thấy gì khác: phần đã đẩy chỉ gồm mối nối và dữ liệu.
  - Mối nối đợt 0: `js/audio.js`, `js/camera.js`, `js/particles.js` (khung rỗng), `js/main.js` (2 dòng), `index.html` (1 dòng), `test/dredge-asset-keys.js`.
  - Nhánh dữ liệu đã gộp: `tools/data.py`, `data/{items,grids,upgrades,weather,config,world_data}.js`, `tools/README.md`, `test/dredge-data.js`.
  - Kiểm trên máy: rules 35/35, suite 73/73, data 73/73, asset-keys đạt.
- **8 bản sao** ở `D:\dredge-wt`. Gốc để gộp: `_base1` cho câu cá, gear, tiếng, môi trường, Upgrades, hệ hạt, anim; `_base2` cho khoang.

| Nhánh | Lúc dừng | Việc đầu tiên khi chạy tiếp |
|---|---|---|
| tiếng | SFX-04..15 xong, sfx 67/67, suite 73/73, +7,62 MB | README; chạy story/fishing/cargo/env/sea |
| anim | 98 clip, chân dung Appear chạy, anim 90/91 (lỗi test) | sửa khẳng định đồng hồ, chạy lại story/suite |
| môi trường | E03/E08/E14/E10 xong, env 70/70 | chờ hệ hạt có `setRateOverTime`, rồi lái mưa/tuyết bằng tốc độ tuyệt đối |
| hệ hạt | runtime + 31 hệ + 141 nguồn cảnh, particles 29/30 | thêm `setRateOverTime(r)`, giữ hệ lặp khi còn tay cầm; chạy lại test |
| Upgrades | applyUpgrade 9/9; cửa sổ 21/24 ở 844x390 | sửa 3 trượt, chạy 1920x1080, ảnh ghép |
| câu cá | F1, F4, F6, F8, F10, F13, F14, F16 qua; 283/294 | sửa test F5/F7/F12, kết luận F3 |
| gear | boat.js xong chưa kiểm; abilities.js chưa gắn | css, input.js, hud.js (F11), test/dredge-gear.js |
| khoang | mới đọc xong đầu vào, chưa sửa tệp | viết mối nối DRCargo + handler gốc, rồi C03-C16 |

**Bẫy và việc của root** (người gộp):
- Hạn mức: `bash ~/.claude/bin/usage-watch.sh --now`. Chạm 92% thì nhắn các nhánh dừng ở chỗ an toàn rồi hẹn giờ reset. Cache `~/.cache/ccstatusline/usage.json` dùng chung 3 tài khoản, script đã lọc `tokenHash`.
- Gộp từng nhánh: `python -I D:/dredge-ref/notes/merge_copy.py <nhánh> <_base1|_base2>` để xem kế hoạch, thêm `--apply` để ghi.
  - `tools/README.md` sẽ đụng nhau vì nhánh nào cũng nối một mục vào cuối. Cách xử lý: ghép cả hai mục.
  - `index.html`: gộp ba chiều tự xử lý các dòng `<script>` mới.
- Độ tươi của cá không được tính ở đâu (`DRRules.decayFish` chưa ai gọi), nên cá không bao giờ ươn. Nhánh khoang sẽ xuất hàm. Root thêm một dòng gọi ở `main.js` hoặc `sky.js`.
- Ở 844x390, nút "Ụ tàu" bị `.dk-boat` đè (`dock.js` / `story.css`), nên bấm thật không được. Ai giữ `dock.js` ở đợt 2 sửa.
- Blend camera khi câu là 2 s, theo CinemachineBrain trong `Manager.unity`, không phải 1 s.
- Nhánh tiếng đã bỏ vòng sóng "Waves Ambience 1" và vòng mòng biển chung, vì bản gốc không có.
- Cuối đợt: nâng `?v=` trong `index.html` và `rev:` trong `data/games.js`. `data/games.js` có sửa của agent khác, nên chỉ stage khúc của mình. Đẩy, đợi Pages, rồi chạy mọi `test/dredge-*.js` với `DR_URL`.
- Đợt 2, sau khi gộp khoang:
  - câu cá F2/F9: cá lên con trỏ, khay tạm;
  - cửa hàng: handler Buy/Sell/Repair, SU-01/02/05/07..14;
  - Upgrades SU-04: lưới nộp vật liệu thay `purchase(id)`;
  - thả lưới/bẫy/mồi: GR-06/07/13, phát clip lưới bằng `DRAnim`.

## Kiểm

- Mỗi nhánh: test riêng `test/dredge-<nhánh>.js` (đầu vào thật, so số liệu gốc), ảnh ghép với ảnh thật, cộng `dredge-rules`, `dredge-suite`, `dredge-asset-keys`.
- Sau mỗi lần gộp: chạy lại toàn bộ `test/dredge-*.js` trên cây repo; đo khung hình so với mốc Pages 2,74 ms.
- Cuối: đẩy, đợi Pages, chạy toàn bộ với `DR_URL` trỏ vào Pages, xem ảnh tận mắt.
