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
| Mô phỏng | `js/sim/*.js` | `VS`, `HX_ZONES`, `HX_SHARKS` (va chạm là `js/sim/geom.js`, không dùng `HX.World`) | `document`, `THREE`, `Math.random`, `Date`, `performance` |
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

Xem mục "Hình dạng dữ liệu" của `brain/plans/vuc-san.md`. Các khoá mà nhiều tầng cùng đọc:

- `Intent = { mx, my, boost, aimX, aimY, fire, skill, light, interact }`. Người và bot cùng ghi, thân nhân vật chỉ đọc.
  `fire`, `skill`, `light`, `interact` là phím một bước: `VS.sim.step` đọc xong thì **tự xoá về false cho mọi actor**,
  còn `VS.input.read` trả mỗi lần bấm đúng một lần. Thợ lặn: `fire` bắn xiên, `boost` bơi nhanh. Cá mập: `fire` lao cắn,
  `boost` phóng (tốn sức). Cứu người, nhặt, nộp, nạp O₂ là tự động khi đứng gần, không cần phím.
- `Actor.id` bằng đúng chỉ số của nó trong `m.actors`.
- `Actor.st`: thợ lặn `swim | held | down | out`, cá mập `swim | lunge | hold | stun | out`. Đang `held`, choáng hay ngủ thì
  không bắn, không dùng kỹ năng (cả hai phe).
- `Actor.stats = { banked, revives, dmg, bites, downs, outs, sharkOuts }`. Với cá mập, `downs`/`outs` là số thợ lặn nó hạ;
  công hạ thuộc về cá mập cuối cùng làm mất O₂ trong `shark.creditWindow` giây.
- `Actor.skill = { id, cd, t, charges }`.
- `Match.t` chỉ đếm thời gian chơi (0 suốt mở màn, mở màn đếm bằng `phaseT`); hết khi `t >= match.length`.
  `Match.result = { winner: 'diver' | 'shark', reason }` ghi đúng một lần; sau `phase 'end'` bước chỉ tăng `phaseT`.
- `Match.events[]`: mỗi bước đẩy thêm `{ t, type, ... }`. Mô phỏng **không bao giờ đọc** `events`; `main.js` chuyển cho
  `VS.view.onEvents` (vẽ hiệu ứng và phát tiếng) và `VS.hud.onEvents` rồi xoá; `tools/sim.js` xoá sau mỗi bước.
- Kho báu không bao giờ bị huỷ: rơi khỏi tay thì nằm lại đúng chỗ.

### Bảng hiệu ứng (`Actor.effects[] = { kind, until, mag, src }`)

`actors.js`/`vision.js` đọc, `skills.js` chỉ ghi qua `VS.sim.addEffect`. Không thêm loại mới mà không thêm dòng ở đây.

| kind | mag | tác dụng |
|---|---|---|
| `slow` | 0..1 | tốc độ × (1 − mag lớn nhất); hết thì miễn chậm `effects.slowImmune` giây |
| `speed` | hệ số | tốc độ × mag lớn nhất; mọi hệ số tốc độ cộng lại không xuống dưới `effects.slowFloor` |
| `stun` | — | không điều khiển, không bắn, không kỹ năng; hết thì miễn khống chế `effects.ccImmune` giây |
| `sleep` | — | như `stun`, tỉnh ngay khi trúng đòn |
| `ccImmune` | — | miễn `stun`, `sleep`, bị ngậm, bị bám, bị kéo |
| `spawnImmune` | — | miễn sát thương (`match.spawnImmune` giây sau khi sinh) |
| `armor` | 0..1 | sát thương nhận × (1 − mag) |
| `stealth` | m | đối phương chỉ thấy khi đứng trong mag mét |
| `blind` | — | không thấy gì ngoài thân mình |
| `reveal` | — | đội kia thấy actor này bất kể ánh sáng |
| `bleed` | O₂/s | mất O₂ đều |
| `noDash` | — | cá mập không phóng, không lao cắn |
| `grabImmune` | — | không bị ngậm, bám, kéo |
| `lightOff` | — | đèn pin buộc tắt |
| `biteMul` | hệ số | cú cắn kế tiếp × mag, cắn xong thì mất |
| `shrink` | hệ số | bán kính × mag; chỉ hết khi chỗ đang đứng đủ rộng cho bán kính thật |

## Giao diện giữa các tầng

```
VS.sim.createMatch(cfg) → Match
    cfg = { seed, mapId, theme?, lineup: [{ team, defId, name, ctrl: 'human'|'bot' }] }  // 4 diver rồi 2 shark
VS.sim.step(m, dt)                       // một bước cố định 1/60 s
VS.sim.visibleTo(m, team, x, y) → bool   // luật tầm nhìn, bot cũng dùng hàm này
VS.sim.canSee(m, team, actor) → bool
VS.sim.visionPolys(m, team) → [{ kind, x, y, r, pts: number[] }]  // vùng thấy được của một đội, cho lightmask
VS.sim.known(m, team) → Loot[]           // kho báu đội đó đã từng soi thấy (người và bot dùng chung trí nhớ này)
VS.bots.think(m, a, dt)                  // ghi a.intent cho actor bot
VS.SKILLS[id] = { start(m, a), update?(m, a, dt), end?(m, a), canStart?(m, a), bot?(m, a) → null | true | { x, y } }
    // số đọc từ VS.SKILL_DATA[id]; bot trả { x, y } thì bots.think đặt aimX/aimY rồi bấm skill

VS.view.init(canvas) → Promise
VS.view.loadMatch(m, onProgress) → Promise
VS.view.render(m, dt, viewer)            // viewer = { id, team }; bị loại hẳn thì camera theo đồng đội còn sống gần nhất
VS.view.onEvents(m, events, viewer)      // hiệu ứng và tiếng
VS.view.screenToWorld(px, py) → { x, y } ; VS.view.worldToScreen(x, y) → { x, y }
VS.view.unloadMatch()

VS.input.read(m, actor) → Intent         // bàn phím, chuột, cảm ứng; phím một bước trả đúng một lần
VS.input.press(name) ; VS.input.touch.hold(name, on)   // nút HUD/cảm ứng bấm thay phím (fire | skill | light | interact)
VS.input.touch.enabled() ; VS.input.touch.enable(on) ; VS.input.touch.state()  // điều khiển ảo, bật khi có cảm ứng
VS.hud.show(m, viewer) ; VS.hud.hide() ; VS.hud.update(m, viewer, dt) ; VS.hud.onEvents(m, events, viewer)

VS.save.load() → Save ; VS.save.store(save)                         // js/meta/save.js
VS.meta.settle(save, m, viewerId) → rewards                         // js/meta/save.js
VS.gacha.featured(banner, dayIndex) ; VS.gacha.pull(save, bannerId, n, rng, dayIndex)   // js/meta/gacha.js
VS.mmk.lineup(save, team, rng) → { seed, mapId, lineup, players }   // js/meta/mmk.js
VS.lobby.show(screen, opts) ; VS.lobby.loading(p, m) ; VS.lobby.showResult(m, rewards)  // js/meta/lobby.js
VS.lobby.onStart = function (cfg) {} ; VS.lobby.onLeave = function () {}               // main.js gán
```

## Cờ URL (cho kiểm và gỡ lỗi)

- `?seed=N` cố định hạt giống. `?map=A01` ép bản đồ. `?team=diver|shark` ép phe.
- `?go=match` bỏ sảnh, vào thẳng một trận với đội hình mặc định.
- `?manual=1` không tự chạy thời gian và không đọc bàn phím chuột; bước bằng `VS_DEBUG.step(n)`, lái bằng `VS_DEBUG.intent`.
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
