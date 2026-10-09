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

## Trạng thái (2026-10-08 tối): đợt 1 đã gộp đủ 8 nhánh, rev `20261008b`

Phiên thứ hai giao lại 8 nhánh từ `D:\dredge-ref\notes\briefs\<nhánh>.md`, gộp từng nhánh khi nhánh tự kiểm xanh, rồi đẩy một lần.
Các bản sao `D:\dredge-wt\*` không còn cần cho đợt 1; giữ lại làm gốc so sánh cho tới khi đợt 2 bắt đầu.

- Gộp bằng `python -I D:/dredge-ref/notes/merge_copy.py <nhánh> <_base1|_base2> [--apply]`. Script nay tự xử lý hai tệp mà nhánh nào cũng đụng:
  `index.html` (đổi `?v=` của gốc và nhánh sang rev của repo trước khi gộp ba chiều) và `tools/README.md` (gộp ba chiều theo từng mục `## `).
  Hai nhánh chèn thẻ sát nhau ở `index.html` vẫn đụng: ghép tay, rồi so tập `src`/`href` của repo với từng bản sao.
- Root đã sửa ngoài tệp của nhánh: `dialogue.js` không gán lại runner đã kết thúc (kẹt hội thoại sau Esc); `.dk-boat` chỉ cho nút con nhận chuột (nút Ụ tàu ở 844x390);
  `yarn.js` EmitLightning gọi `DRSky.weather.emitLightning()`; `sky.js` gán thêm `setSimulationSpeed` và `setSubEmitProbability` cho mưa;
  `main.js` gọi `DRCargo.tickFreshness()` mỗi khung (cá giờ mới ươn) và cập nhật cỡ `boat.glb`.
- Kiểm trên cây đã gộp (máy rảnh): rules 35, asset-keys đạt, data 73, particles 38, sfx 67, env 70, sea 26, anim 91, story 42, suite 73, gear 49, upgrade 105, fishing 295, cargo 283; không trượt.
- Khung hình cảnh câu cá 1280x720 (CPU, nhỏ nhất): cả đợt 1,21 → 1,57 ms; riêng câu cá 1,36 → 1,55 ms. Các hàm update cộng lại khoảng 0,2 ms; phần còn lại là thêm draw call (161 → 173).

**Còn mở, chưa làm:**
- Đợt 2 (cần mối nối khoang, nay đã có `DRCargo.open`): câu cá F2/F9 (cá lên con trỏ, khay tạm), cửa hàng Buy/Sell/Repair + SU-01/02/05/07..14, Upgrades SU-04 (lưới nộp thay `purchase(id)`), thả lưới/bẫy/mồi GR-06/07/13 qua `DRAbilities.register()`, GR-17.
- Mưa gần như vô hình: alpha màu đầu của Rain trong Game.unity chỉ 0,008–0,012, ảnh `gog_13` đậm hơn. Chưa giải thích.
- Cảnh đêm và hoàng hôn tối hơn ảnh thật (`gog_20`, `gog_01`): nước, đèn thuyền, mặt trời thấp hơn.
- Lỗ phun Devil's Spine: khung +17% khi máy đang tải nặng, +5% khi rảnh; đo lại.
- `storageTrayUnlockQuest` chưa xuất được; nhánh câu cá đợt 2 tự quyết khi nào mở khay.
- Ở 844x390 đầu chân dung bị cắt (`--s` chặn ở 0,62) và thanh năng lực rất nhỏ.

## Kiểm

- Mỗi nhánh: test riêng `test/dredge-<nhánh>.js` (đầu vào thật, so số liệu gốc), ảnh ghép với ảnh thật, cộng `dredge-rules`, `dredge-suite`, `dredge-asset-keys`.
- Sau mỗi lần gộp: chạy lại toàn bộ `test/dredge-*.js` trên cây repo; đo khung hình so với mốc Pages 2,74 ms.
- Cuối: đẩy, đợi Pages, chạy toàn bộ với `DR_URL` trỏ vào Pages, xem ảnh tận mắt.

## Đợt 2b (2026-10-09): sáu lời chê mới, sáu nhánh

Chủ dự án chơi rev `20261008b` rồi chê: nước nhìn góc nào cũng gãy khúc (low poly); cá câu được vẫn tự vào khoang; nâng cấp bấm mua là trừ vật liệu luôn; cửa hàng vẫn là danh sách; lưới kéo, bẫy cua, mồi mua được mà không dùng được; Banish, Atrophy, Manifest chưa có; nước gần bờ trắng quá, đêm tối hơn bản gốc.

- Hợp đồng chung: `D:\dredge-ref\notes\DELEGATE-R3.md`. Đề bài từng nhánh: `D:\dredge-ref\notes\briefs\r2*.md`.
- Bản sao `D:\dredge-wt\r2water|r2fish|r2shop|r2upgrade|r2deploy|r2spells`, bản gốc `_base3` = commit `5da3330c`.
- Gộp: `python -I D:/dredge-ref/notes/merge_copy.py r2<nhánh> _base3 [--apply]`. Tool sinh dữ liệu dùng chung (`audio.py`, `particles.py`) thì root chạy lại sau khi gộp hết.

| Nhánh | Tệp | Khác biệt |
|---|---|---|
| r2water | `water.js`, `sky.js`, `env.py` | nước mượt ở mọi camera, bờ bớt trắng, đêm và hoàng hôn theo `gog_20`, `gog_01` |
| r2fish | `spots.js`, `minigame.js`, `banner.js`, `harvest_ui.py` | F2 cá lên con trỏ, khoang mở bên phải; F9 khay 6x3 |
| r2shop | `dock.js`, `shop.js` mới | SU-01/02/05/07..14: hai lưới, bán, sửa |
| r2upgrade | `upgrade.js` | SU-04 lưới "Materials Required" |
| r2deploy | `deploy.js` mới (+ một hàm thêm ở `spots.js`) | GR-06 lưới kéo, GR-07 bẫy cua, GR-13 mồi |
| r2spells | `spells.js` mới | GR-17 Banish, Atrophy, Manifest |
