# Vực Săn

Dave the Diver đối kháng kiểu Depth: 4 thợ lặn nhặt kho báu trong bóng tối, 2 cá mập săn họ. Người chơi chọn phe khi
ghép trận (giả, bot lấp ghế), mỗi trận bốc ngẫu nhiên đúng một bản đồ gốc Dave the Diver. Gacha có banner thợ lặn và
banner cá mập. Kế hoạch và lý do chọn: `brain/plans/vuc-san.md`.

Tài liệu này là hợp đồng chung cho mọi agent làm game. Đọc hết trước khi sửa tệp nào.

## Luật tầng

| Tầng | Thư mục | Được dùng | Cấm |
|---|---|---|---|
| Dữ liệu | `data/*.js` | gán vào `window.VS` | logic |
| Động cơ fork | `js/engine/*.js` | `window.HX`, `THREE` | biết gì về `VS` |
| Mô phỏng | `js/sim/*.js` | `VS`, `HX.World`, `HX_ZONES`, `HX_SHARKS` | `document`, `THREE`, `Math.random`, `Date`, `performance` |
| Vẽ | `js/view/*.js` | `VS`, `HX`, `THREE`, DOM | ghi vào trạng thái trận |
| Sảnh | `js/meta/*.js` | `VS`, DOM, `localStorage` | `THREE` |
| Ghép | `js/main.js`, `js/input.js` | mọi thứ | |

Mô phỏng thuần là để cùng một trận chạy được trong Node (`tools/sim.js`, các bài kiểm `test/vuc-san-*.js` không cần trình
duyệt). Ngẫu nhiên trong trận chỉ lấy từ `m.rng` (mulberry32 theo `seed`), nên cùng seed cùng chuỗi bước thì cùng kết quả.

Mỗi tệp là một IIFE: `(function (VS) { ... })(window.VS = window.VS || {});`. Không ES module, không bước build.
Mọi `<script>`/`<link>` trong `index.html` gắn `?v=<rev>`, trùng `rev` của mục `vuc-san` trong `data/games.js`.

## Đường dẫn tài nguyên

`VS.asset(p)`: `'hx:...'` → `../ho-xanh/...`, `'bdl:...'` → `../biet-doi-lan/...`, còn lại tương đối với trang.
Động cơ fork dùng `HX.ROOT = window.HX_ROOT` (đặt `'../ho-xanh/'` trong `index.html`). Không chép art của Hố Xanh.

## Hình dạng dữ liệu

Xem mục "Hình dạng dữ liệu" của `brain/plans/vuc-san.md`. Tóm tắt các khoá mà nhiều tầng cùng đọc:

- `Intent = { mx, my, boost, aimX, aimY, fire, skill, light, interact }`. Người và bot cùng ghi, thân nhân vật chỉ đọc.
  `fire`, `skill`, `light`, `interact` là cạnh lên (đúng một bước), riêng `boost` và `fire` khi giữ thì có `fireHeld`.
- `Actor.st`: thợ lặn `swim | held | down | out`, cá mập `swim | lunge | hold | stun | out`.
- `Match.phase`: `intro | play | end`. `Match.result = { winner: 'diver' | 'shark', reason }`.
- `Match.events[]`: mỗi bước đẩy thêm `{ t, type, ... }`; `main.js` chuyển cho vẽ, HUD, tiếng rồi xoá.

## Giao diện giữa các tầng

```
VS.sim.createMatch(cfg) → Match
    cfg = { seed, mapId, theme?, lineup: [{ team, defId, name, ctrl: 'human'|'bot' }] }  // 4 diver rồi 2 shark
VS.sim.step(m, dt)                       // một bước cố định 1/60 s
VS.sim.visibleTo(m, team, x, y) → bool   // luật tầm nhìn, bot cũng dùng hàm này
VS.sim.visionPolys(m, team) → [{ x, y, r, pts: number[] }]  // vùng thấy được của một đội, cho lightmask
VS.bots.think(m, a, dt)                  // ghi a.intent cho actor bot
VS.SKILLS[id] = { start(m, a), update?(m, a, dt), end?(m, a), bot?(m, a) → bool }   // số đọc từ VS.SKILL_DATA[id]

VS.view.init(canvas) → Promise
VS.view.loadMatch(m, onProgress) → Promise
VS.view.render(m, dt, viewer)            // viewer = { id, team }
VS.view.screenToWorld(px, py) → { x, y } ; VS.view.worldToScreen(x, y) → { x, y }
VS.view.unloadMatch()

VS.input.read(m, actor) → Intent         // bàn phím, chuột, cảm ứng
VS.hud.update(m, viewer, dt)

VS.save.load() → Save ; VS.save.store(save)
VS.gacha.pull(save, bannerId, n, rng) → { results: [{ team, id, rarity, isNew, featured }] }  // sửa save tại chỗ
VS.mmk.lineup(save, team, rng) → { lineup, mapId, players }   // người chơi giả cho màn ghép trận
VS.lobby.show(screen) ; VS.lobby.onStart = function (cfg) {} ; VS.lobby.showResult(m, rewards)
VS.meta.settle(save, m, viewerId) → rewards
```

## Cờ URL (cho kiểm và gỡ lỗi)

- `?seed=N` cố định hạt giống. `?map=A01` ép bản đồ. `?team=diver|shark` ép phe.
- `?go=match` bỏ sảnh, vào thẳng một trận với đội hình mặc định.
- `?manual=1` không tự chạy thời gian; bước bằng `VS_DEBUG.step(n)`.
- `window.VS_DEBUG`: `match()`, `step(n)`, `info()`, `teleport(id, x, y)`, `intent(id, partialIntent)`.

## Kiểm

- Node, không trình duyệt: `node test/vuc-san-sim.js`, `vuc-san-skills.js`, `vuc-san-bots.js`, `vuc-san-meta.js`.
- Trình duyệt: `node test/vuc-san-smoke.js`, `vuc-san-lobby.js`, `vuc-san-view.js`, `vuc-san-flow.js`. Mỗi bài tự mở máy chủ
  tĩnh ở cổng 0 trên gốc repo, hoặc dùng `VS_URL=<gốc>` để chạy trên Pages.
- Playwright trên máy Linux này: `require(process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core')`.
- Hỏng nếu có `pageerror`, console error, `requestfailed` hoặc response >= 400.
- Bài kiểm khẳng định bằng số cụ thể sau khi gọi đúng đường người dùng đi (bấm chuột, phím thật), không khẳng định "có gì đó".
- Ảnh chụp lưu ở `VS_SHOTS` (mặc định thư mục tạm) và phải được mở ra xem.

## Rào

- Chỉ sửa tệp của nhánh mình (bảng trong `brain/plans/vuc-san.md`). Cần sửa tệp nhánh khác thì dừng và báo.
- Không `git add -A`, không `git stash`, không commit; agent gốc xem diff rồi commit.
- Không sửa gì trong `games/ho-xanh/` hay `games/biet-doi-lan/`.
