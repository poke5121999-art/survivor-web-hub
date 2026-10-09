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

## Chạy và kiểm

- Mở `games/toc-do/index.html` qua máy chủ tĩnh (glb và tiếng tải bằng fetch, không chạy từ `file://`).
- `node test/toc-do-sim.js` — luật đua, drift, phun, bot (Node). `node test/toc-do-assets.js` — asset hai chiều.
- `node test/toc-do-ui.js` — luồng chơi thật bằng phím (1366×650) và chạm (844×390); `TD_URL=<gốc>` để chạy trên Pages.
- Bài kiểm trình duyệt chạy trên swiftshader (vài khung/giây) nên tua bằng `TD.main.timeScale`; trò chơi thật để 1.
- Công cụ xem: `tools/trackview.html?id=`, `carview.html?id=`, `driverview.html?d=`, `uiview.html?p=`, `fxsheet.html`,
  `simlab.html`, `audiolab.html`.

## Bẫy

- Texture của shader gamma (đường đua) phải để `LinearEncoding`: three r140 trên WebGL2 tải texture sRGB dạng SRGB8_ALPHA8
  và GPU tự giải về tuyến tính, làm albedo tối hẳn. Xe và tay đua là PBR tuyến tính, giữ sRGB.
- Thư mục đường đua theo `TD.TRACKS[id].art` (Phố Tàu: `art/tracks/chinatown/`, bộ xuất mặc định đặt tên `chinatown_new`).
