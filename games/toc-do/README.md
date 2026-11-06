# Tốc Độ (games/toc-do)

Game đua kart 3D trên web, dựng lại Zing Speed Mobile 1.55.0.27413 (VNG phát hành, bản Việt của QQ Speed Mobile / QQ飞车手游).
Yêu cầu của chủ dự án ngày 2026-10-09: tải APK, làm game giống vậy trên web, rút kinh nghiệm thiếu asset / VFX / cảm giác
từ các game trước. Kế hoạch theo pha: `brain/plans/toc-do.md`.

## Nguồn tham chiếu (ngoài git)

`ZS_REF` (mặc định `~/zingspeed-ref`):

- `dl/zingspeed.xapk` — bản tải từ APKPure, 4.134.851.937 byte.
- `raw/assets/IFS/AssetBundles/**` — 13.769 bundle UnityFS (Unity 2019.4.41f1), không mã hoá, đọc bằng UnityPy.
- `raw/assets/IFS/SoundBanks/*.bnk` — 110 bank Wwise. Bank lõi (`InGameBase.bnk`, `Default_Vehicle.bnk`,
  `BGM_Default.bnk`, `GlobalStructure.bnk`) **không có trong APK**: game tải chúng sau khi cài qua Puffer.
- `index.jsonl` — chỉ mục mọi bundle: `{f, size, cab[], cont[] (đường dẫn asset gốc), types{}, names[]}`.
  Sinh bằng `tools/index_bundles.py`. Tra bằng `tools/zs.py`: `zs.find('chuỗi con')`, `zs.load_with_deps([f])`.
- `dump/` — dữ liệu đã đọc ra JSON: `11citynew_*.json` (CheckPointConfig, Pick_Line, TriggerZoneConfig),
  `carparams/*.json` (tham số vật lý xe gốc), `wwise/*` (AndroidEventsInfoVN = tên event → bank, CarConfig, BGMConfig).
- `venv/bin/python` có UnityPy 1.25.4, Pillow, numpy. `bin/vgmstream-cli` (r2117) giải mã .bnk/.wem.
  Chạy Python với `-I`, đường dẫn truyền qua tham số.

## Quy ước toạ độ (mọi bộ xuất phải theo)

Unity là hệ tay trái (x phải, y lên, z tới), three.js tay phải. **Đổi một lần lúc xuất, trong Python:**

- điểm, vector: `(x, y, z) → (x, y, -z)`
- quaternion: `(x, y, z, w) → (-x, -y, z, w)`
- tam giác: đảo thứ tự đỉnh `(a, b, c) → (a, c, b)`

Đơn vị giữ nguyên mét của Unity. Game JS không đổi hệ toạ độ nào nữa.

## Bố cục thư mục và chủ sở hữu

| Đường dẫn | Nội dung | Sinh bởi |
|---|---|---|
| `tools/zs.py` | tra chỉ mục, nạp bundle kèm phụ thuộc | tay, chỉ đọc với mọi nhánh |
| `tools/export_track.py` → `art/tracks/<id>/` | đường đua hình (glb + texture + lightmap) | nhánh Đường đua |
| `tools/export_track_logic.py` → `data/tracks.js` | ruy băng đường, checkpoint, điểm hồi sinh | nhánh Mô phỏng |
| `tools/export_cars.py` → `art/cars/`, `data/cars.js` | xe kart glb, bánh, tham số | nhánh Xe |
| `tools/export_driver.py` → `art/drivers/`, `data/drivers.js` | tay đua glb kèm hoạt ảnh ngồi lái | nhánh Tay đua |
| `tools/export_audio.py` → `audio/`, `data/audio.js` | tiếng theo tên event gốc | nhánh Tiếng |
| `tools/export_fx_ui.py` → `art/fx/`, `art/ui/`, `data/fx.js`, `data/ui.js` | texture VFX, tham số hạt, sprite HUD | nhánh VFX/UI |
| `tools/export_campath.py` → `data/campaths.js` | camera mở màn gốc (chỉ 11citynew có trong APK) | tay |
| `tools/export_podium.py` → `art/podium/` | sân khấu bục `Podium.unity`, hoạt ảnh `ranking_01..06` | tay |
| `tools/export_items.py` → `art/items/`, `data/items.js` (khối sinh) | hộp "?", mô hình/biểu tượng/hạt của 11 đạo cụ | nhánh Đạo cụ |
| `tools/export_rank_ui.py` → `art/rank/` | huy hiệu bậc `uitextures/id_rank/id_rank_*` | nhánh Xếp hạng |
| `tools/export_lobby_ui.py` → `art/lobby/` (`--stage`: `stage.glb`) | ô sảnh, thẻ chế độ, thẻ ghép phòng, sân khấu `Lobby_L_Art.unity` | nhánh Sảnh |
| `tools/export_garage_ui.py` → `art/garage/` | biểu tượng kỹ năng bằng lái `id_talent/talent_icon*` | nhánh Gara |
| `tools/export_flag.py` → `art/practice/` | cờ caro luyện tập (APK không có, dựng hình đơn giản) + `icon_flag` gốc | nhánh Luyện tập |
| `tools/export_pets.py` → `art/pets/` | 8 PET gốc (mô hình tĩnh: APK không có clip PET) | đợt 2 |
| `tools/export_outfits.py` → `art/outfits/` | 16 bộ đồ + tóc cùng bộ xương tay đua (gọi `export_driver.py`) | đợt 2 |
| `tools/export_gacha.py` → `art/gacha/` | hiệu ứng Xưởng `og_unrealgaragedlg_v36` | đợt 2 |
| `tools/export_story.py` → `art/story/` | bản đồ chương, ghim ải, chân dung NPC | đợt 2 |
| `tools/export_events.py` → `art/events/` | xu `props_item_goldcoin`, biểu tượng mode sự kiện | đợt 2 |
| `tools/export_social_ui.py` → `art/social/` | biểu tượng bạn bè, cặp đôi, quà, BXH, đội đua | đợt 2 |
| `js/sim/modes.js`, `rank.js`, `items.js`, `ghost.js` | chế độ, bậc xếp hạng, đạo cụ, bóng kỷ lục (thuần JS) | pha 3 |
| `js/ui/lobby.js`, `garage.js`, `ranked.js`, `js/view/items.js`, `practice.js` | sảnh, gara/kỹ năng/nhiệm vụ, xếp hạng, đạo cụ, luyện tập | pha 3 |
| `tools/export_cars.py` (`PAINT_ONLY=1`) → `art/cars/*_base.jpg`, `*_mask.jpg` | ảnh nền chưa tô và mặt nạ sơn | tay |
| `js/sim/*` | mô phỏng thuần JS (không `document`, `THREE`, `window` ngoài `TD`) | nhánh Mô phỏng |
| `js/view/*`, `js/ui/*`, `index.html`, `css/*` | vẽ, camera, VFX, âm thanh, HUD, sảnh | tích hợp |

Mọi tệp JS khai báo vào một global `TD` (`window.TD` trong trình duyệt, `globalThis.TD` trong Node).
Dữ liệu sinh ra là `data/*.js` dạng `TD.X = {...};` để mở được cả từ `file://`.

## Hợp đồng dữ liệu

```
TD.TRACKS[id] = {
  id, name, laps, gravity, length,          // length = MainCurveLength (m)
  art: 'art/tracks/<id>/track.glb',
  pts: { x[], y[], z[], dx[], dy[], dz[], lw[], rw[], s[], next[][], prev[][] },  // TrackPointDataList, mỗi ~10 m
  cps: [{ id, s, x, y, z, lx, lz, rx, rz, next[] }],                              // CheckPointDataList
  resets: [{ x, y, z, qx, qy, qz, qw, cp }],
  loop?, endCp?, laps,                      // loop false = đường A→B, về đích ở cps[endCp]
  boxes?: [{ s, pts: [[x, y, z]] }],        // hàng hộp đạo cụ (propspointconfig)
  start: { x, y, z, fx, fy, fz },
}
TD.CARS[id] = { id, name, glb, wheels: [{ x, y, z, r, front }], stats: { speed, accel, handling, drift, nitro } }
TD.AUDIO[event] = { files: [], loop, vol, bus: 'sfx'|'music'|'voice'|'engine' }
```

Mô phỏng phát sự kiện, lớp vẽ và âm thanh chỉ đọc:

```
Race.events[] = { t, type, kart, ... }
type ∈ countdown | go | drift_start | drift_end | miniboost | nitro_start | nitro_end | gauge_full |
       wall | bump | air | land | lap | final_lap | finish | respawn | overtake
```

## Chế độ chơi và plugin trận (pha 3)

- `TD.MODES[id] = { id, name, karts, teams, items, ranked?, practice?, laps? }` (`js/sim/modes.js`). Mọi chỗ đọc bảng này,
  không rẽ nhánh theo tên chế độ. `TD.main.startRace({ mode })` dựng trận theo bảng; người chơi luôn Đội Xanh (`team` 1).
- `TD.Race.create({ mode })`: `mode.items` thì `R.items = TD.Items.init(R)`. Đạo cụ tác động lên xe qua
  `k.fx = { stunT, kind, decay, slowT, slowMul }`; `kart.js` chỉ thi hành (mất lái + hãm, nhân trần tốc độ).
- `TD.racePlugins[]`: `{ start, update, event, settle, end, rects, draw }`, ctx = `{ R, me, M, root }`. `settle(F)` đẩy thẻ HTML
  vào `F.cards` (màn thưởng). Đạo cụ, luyện tập, xếp hạng, nhiệm vụ, tên bot ghép phòng đều là plugin.
- Sự kiện đạo cụ: `item_get {item}`, `item_use {item, target}`, `item_hit {item, by}`, `item_block {item, by}`, `item_full`.
- `TD.TRACKS[id].boxes = [{ s, pts: [[x, y, z]] }]` từ `<env>/model/pick/propspointconfig.asset`; đường không có thì `items.js`
  tự sinh hàng hộp mỗi ~400 m.
- Nút một lần: `TD.input.take(id)`; phím E/Q đạo cụ, F/G/X cờ. HUD: `TD.hud.q(path)`, `TD.hud.over.rec(race)` ghi đè "Kỷ lục".
- Bản lưu: `mode, rank{pts,best,streak,games,wins}, owned, skills, quests, ach, totals`. Bóng kỷ lục để riêng
  `localStorage['td.ghost.<track>']`, luyện tập `td.practice.v1` (không lên đám mây vì nặng).

## Chạy và kiểm

- Mở `games/toc-do/index.html` qua máy chủ tĩnh (glb và tiếng tải bằng fetch, không chạy từ `file://`).
- `node test/toc-do-sim.js` — luật đua, drift, phun, bot (Node). `node test/toc-do-assets.js` — asset hai chiều.
- `node test/toc-do-{items,rank,garage,practice,lobby}.js` — từng phần pha 3; `node test/toc-do-modes.js` — mọi chế độ vào trận và chạy.
  Chạy tuần tự: mỗi bài mở một Chromium swiftshader, chạy song song nhiều bài thì máy quá tải và bài kiểm hết giờ giả.
- `node test/toc-do-ui.js` — luồng chơi thật bằng phím (1366×650) và chạm (844×390); `TD_URL=<gốc>` để chạy trên Pages.
- Bài kiểm trình duyệt chạy trên swiftshader (vài khung/giây) nên tua bằng `TD.main.timeScale`; trò chơi thật để 1.
- Công cụ xem: `tools/trackview.html?id=`, `carview.html?id=`, `driverview.html?d=`, `uiview.html?p=`, `fxsheet.html`,
  `simlab.html`, `audiolab.html`.

## Bẫy

- Texture của shader gamma (đường đua) phải để `LinearEncoding`: three r140 trên WebGL2 tải texture sRGB dạng SRGB8_ALPHA8
  và GPU tự giải về tuyến tính, làm albedo tối hẳn. Xe và tay đua là PBR tuyến tính, giữ sRGB.
- Thư mục đường đua theo `TD.TRACKS[id].art` (Phố Tàu: `art/tracks/chinatown/`, bộ xuất mặc định đặt tên `chinatown_new`).
- Kiểu trộn VFX: vật liệu không ghi `_DstBlend` thì `export_fx_ui.py` đoán. Texture đục hoàn toàn mà trộn alpha (QF_FXCommon
  lấy hình từ mặt nạ `SECOND_MASK`) thì xuất thêm bản `_la` có alpha = độ sáng. Trộn alpha với ảnh đục vẽ ra ô vuông đen.
- Màu đường: game gốc là dự án Unity không gian tuyến tính. `NssTerrain2Layer` (Phố Tàu) tính theo công thức tuyến tính của
  shader gốc; `NssStandard` vẫn theo công thức gamma vì chưa có reflection probe (chuyển sang thì đường 11citynew tối hẳn).
- Bài kiểm trình duyệt chờ trạng thái bằng `until(...)`, không chờ cứng: trên swiftshader bấm tạm dừng mất ~600 ms.
- Đường A→B (`RaceStartCheckPointIndex != RaceEndCheckPointIndex`: Tứ Xuyên, Reno, Polaris, Hoàng Hà): `loop: false`, `endCp`,
  `laps: 1`; về đích khi vào vùng checkpoint cuối sau khi đã qua vạch xuất phát; progress không bọc theo chiều dài. Bộ xuất
  thêm 45–150 m đường sau vạch xuất phát và 150 m đường thoát sau đích. Mã nào bọc `s` theo `T.L` phải xét `T.loop`.
- Hộp "?" cổ điển không có prefab riêng: `propsbox_huge` là bảng 4,5 m; hộp lấy từ hàng hộp mẫu trong scene `Level_TrainTrack_B`.
- Bank tiếng đạo cụ `DJ` không có trong APK: 17 tiếng mượn từ bank khác (`data/items.js`) + bíp khoá mục tiêu tổng hợp, chỉ `Play_DJ_wind` là gốc.
- Giọng đếm ngược "3-2-1" không có trong APK: mọi event giọng đếm ngược nằm ở bank tải sau (InGameBase, Lobby…); dùng bíp
  `Play_UI_ATM_countdown` và chuông cao `Play_XH_Ready` ở nhịp "1" (`Play_BGM_CountDown_Final`).
- Luật thêm của chế độ chạy qua `TD.Race.after` (hàm f(R) sau mỗi step); đừng bọc `TD.Race.step`.
- Mục sảnh: `TD.lobby.add`; trang trí xe: `TD.kartView.hooks`; bản lưu: `TD.save.norms`.
