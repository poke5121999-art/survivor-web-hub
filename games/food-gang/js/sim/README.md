# FG.Sim bản JS — mô phỏng trận Food Gang

Bản port từng dòng của `D:\foodgang-ref\fg-unity\Assets\FG\Sim` (C#, xem README bên đó cho luật, thứ tự tick, các mục `[ĐỀ XUẤT]`). ES module thuần, không phụ thuộc, chạy được cả trình duyệt lẫn node. Host chạy `match.step`, máy khách gửi `InputFrame`, host gửi `MatchState` (dữ liệu thuần, `JSON.stringify` / `structuredClone` được).

```js
import { GameDb, Match, createMatchSetup, addSlot, InputFrame, InputButtons, GoalType, TeamConfig } from './index.js';
const db = GameDb.load(await (await fetch('data/simdata.json')).text());
const match = new Match(db);
const setup = createMatchSetup({ seed: 42, mapIndex: 0, goal: GoalType.DeathMatch, teams: TeamConfig.TwoVersusTwo });
addSlot(setup, 0, 1, 10, false); addSlot(setup, 1, 6, 10, true, 0.5); addSlot(setup, 2, 8, 10, true); addSlot(setup, 3, 12, 10, true);
const state = match.create(setup);
// mỗi tick: match.step(state, [InputFrame.make(dirX, InputButtons.Jump), ...]); const ev = match.drainEvents();
```

## Khớp với C#

- Mỗi file C# một module cùng tên (`Core/`, `Data/`, `State/`, `Systems/`, `Bot/`, `Match.js`). Trường giữ tên C# viết camelCase, enum là số, `Vec2` là `{x, y}`, `SimRng.State` (ulong) là chuỗi thập phân `rng.state` — dump JSON của `MatchState` C# so được từng trường.
- Số thực: C# là float32, .NET tính từng phép ở độ chính xác đơn, nên mọi phép `+ - * / sqrt` đều qua `Math.fround` đúng chỗ C# gán. Hằng `0.35f` viết `f(0.35)`.
- `[ĐO TRONG REPO]` Bẫy đã sập: `Math.fround(Math.sin(x))` lệch `MathF.Sin` ở ~0,13 % đầu vào (2533/2 000 000 mẫu), dồn quanh |r| ≈ π/4. .NET 8 trên Windows gọi `sinf`/`cosf` của `ucrtbase.dll`, nhánh FMA3 tính đa thức double không làm tròn đúng. `Core/CrtMath.js` chép lại từng lệnh nhánh đó (FMA double giả lập bằng BigInt) → 0/2 000 000 lệch. Góc ngẫu nhiên của đạn (PEPE, BUD, ROB) và DropOnDeath đi qua đây.
- `List<T>.Sort` của .NET không ổn định; `Core/DotnetSort.js` chép IntroSort .NET 8 để các tiếp xúc cùng khoảng cách xếp như C#.

## Kiểm

```sh
node test/food-gang-sim.js              # trig + 109 assert của simtest + bảng 200 trận bot + so vết từng tick
node test/food-gang-sim.js --regen      # sinh lại vết C# (cần dotnet 8) rồi so
node games/food-gang/js/sim/test/make-scenarios.js   # sinh lại test/scenarios/*.json
```

Vết C# (~1,7 GB) nằm ngoài repo ở `D:\foodgang-ref\simtest\traces`, sinh bằng `simtest.dll trace <scenarios> <traces>` và `botsum 200 <file>`. Lần đo 2026-10-30: 117/117 kịch bản, 268 685/268 685 tick khớp từng bit; 200/200 trận bot của bảng simtest ra đúng trạng thái cuối. Tốc độ node 22: ~7 ms / 1000 tick với 4 bot, ~2,7 ms với 2 bot.

## Giới hạn

- "Khớp" là khớp với .NET 8 trên Windows x64 có FMA3 (máy làm port). Bản C# chạy trong Unity (Mono/IL2CPP) hoặc CPU không FMA3 gọi libm khác, có thể lệch bản JS ở các tick có lượng giác.
- Như bản C#: chưa có đường sinh dummy tutorial, cờ Freeze không ai ghi.
