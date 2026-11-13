# Pháo Mây

Game bắn pháo theo lượt trên quần đảo bay, chạy bằng three.js r160. Không có file ảnh, model hay âm thanh nào: texture nướng trên GPU lúc khởi động, mô hình ghép từ khối cơ bản, âm thanh tổng hợp bằng WebAudio. Làm theo skill `procedural-web-game`. Tên game, cỗ pháo, đạn, bản đồ và giao diện đều tự nghĩ.

## Cấu trúc

Mỗi file là một script gắn vào `window.PM`, nạp theo thứ tự thẻ `<script>` trong `index.html`.

| File | Việc |
|---|---|
| `js/core.js` | RNG có seed (mulberry32, FNV-1a), noise, event bus, tham số URL, localStorage |
| `js/data.js` | Bảng `PM.UNITS` (cỗ pháo và đạn), `PM.ITEMS`, `PM.AI_LEVELS`, `PM.RULES`, `PM.MAPS`, `PM.CAMPAIGN`, `PM.UPGRADES` |
| `js/data-maps.js` | Các bản đồ thêm; mỗi bản đồ mang theo `theme` (trời, đèn, sương), `look` (màu đất đá), `hazard` |
| `js/terrain.js` | Địa hình là lưới khoảng cách có dấu (`sd < 0` là đất). `carve` khoét lỗ, `raycast`, `groundY` |
| `js/sim.js` | Trận đấu tất định, bước 1/120 giây: đạn, nổ, rơi, lượt theo delay. Không đụng tới hình |
| `js/ai.js` | Máy dò góc và lực bằng `PM.Sim.trace`, rồi bấm đúng các input như người |
| `js/gfx-core.js` | Renderer, ba mức đồ hoạ, chuỗi hậu kỳ (AO, volumetric fog, bloom, FXAA), bóng PCSS, bộ tự giảm độ phân giải |
| `js/gfx-bake.js` | Nướng bộ texture PBR, vật liệu triplanar (`onBeforeCompile`) |
| `js/gfx-sky.js`, `js/gfx-scenery.js` | Trời, đèn, biển mây, mây xa, đảo xa, luống chè, cây |
| `js/gfx-terrain.js` | Lưới 3D của đảo (marching squares theo chunk), shader tầng đất |
| `js/gfx-build.js`, `js/gfx-units.js` | Bộ ghép mô hình và hai cỗ pháo |
| `js/gfx-fx.js` | Hạt, mảnh văng, đạn, tia sấm, khiên, đường ngắm |
| `js/director.js`, `js/camera.js` | Camera theo pha của lượt, khựng hình khi nổ |
| `js/input.js`, `js/ui.js`, `js/meta.js`, `js/audio.js` | Điều khiển, HUD và màn hình, tiến trình lưu, âm thanh |
| `js/main.js` | Khởi động, vòng lặp, vòng đời trận, hook kiểm thử |

`sim.js` phát sự kiện vào `sim.events`. `main.js` chuyển chúng lên bus dưới tên `sim:<loại>`; hiệu ứng, âm thanh và HUD nghe ở đó. Máy và người đều điều khiển qua `sim.input`, `sim.selectShot`, `sim.useItem`, nên một trận chạy lại y hệt từ cùng seed.

Thêm cỗ pháo: thêm một dòng vào `PM.UNITS`, một hàm trong `PM.UNIT_MODELS` (`gfx-units.js`), giá trong `PM.UNIT_PRICE`. Thêm kiểu đạn: thêm một dòng vào `PM.Sim.BEHAV` và hình đạn trong `PROJ` (`gfx-fx.js`). Thêm bản đồ: một mục trong `PM.MAPS` (hàm `sd(x, y)` ghép từ đường cong và các khối trong `PM.sdf`) và một mục `PM.THEMES`. Hai bên bản đồ không cân tuyệt đối, nên `sim.js` cho hai đội đổi bên theo seed (`cfg.flip` để ép).

## Tham số URL và hook

`?autostart=1` vào thẳng trận. `?auto=1` cho máy cầm cả đội mình. `?ai=easy|medium|hard`, `?seed=`, `?unit=`, `?foe=`, `?q=low|medium|high`, `?noaudio=1`, `?nogov=1` (tắt bộ tự giảm độ phân giải), `?manual=1` (không chạy vòng lặp, chỉ vẽ khi gọi hook).

`window.__G` (state), `__ready`, `__errors`, `__stats`, `__frames`, `__step(n, dt)` vẽ n khung, `__tick(n, dt)` chạy n khung không vẽ rồi vẽ một khung, `__sim(giây)` chạy riêng trận đấu, `__setShot(tên | {x, y, dist})` đặt camera, `__fire({angle, power, shot, facing})` bắn theo kịch bản.

## Kiểm

```
export PLAYWRIGHT_PATH=$HOME/.cache/pw-node/node_modules/playwright-core
node games/phao-may/tools/sim-test.js    # trận đấu trong node, không cần trình duyệt
node games/phao-may/tools/play.js        # chơi trên trang thật bằng Chrome headless
node games/phao-may/tools/audio.js       # dựng mọi âm thanh, soi NaN và clipping
node games/phao-may/tools/shot.js <tên> "<query>" [góc máy ...]   # chụp ảnh vào .chk/
node games/phao-may/tools/bench.js       # đo khung hình trên GPU thật nếu Chrome với tới
node games/phao-may/tools/balance.js     # bảng tỉ lệ thắng giữa các cỗ pháo (máy mức Khó đấu nhau)
node games/phao-may/tools/matrix.js      # mọi bản đồ × mọi mức máy trong node, và kiểm mọi cỗ pháo bắn tới được bên kia (chạy ~5 phút)
node games/phao-may/tools/tour.js        # một trận máy đấu máy trọn vẹn trên trang thật cho từng bản đồ × mức máy
PM_GL=gl-egl node games/phao-may/tools/sheet.js   # bảng duyệt hình vào .chk/sheet-*.png
```

`PM_BASE=https://poke5121999-art.github.io/survivor-web-hub` chạy `play.js` và `audio.js` trên bản đã deploy.

Chrome headless dùng SwiftShader, mỗi khung hình mất hơn một giây. Vì vậy test chạy trận bằng `__sim` và `__tick`, chỉ vẽ vài khung.
