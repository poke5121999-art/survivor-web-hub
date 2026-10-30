# Food Gang lên web (bản JS nhẹ, dựng lại mọi thứ của Unity)

Chủ dự án giao 2026-10-30: "đưa game này full lên web. full game". Giữa chừng có nói "dùng unity netcode",
rồi hỏi "phải dùng unity à, không có phương án nhẹ hơn à" và chốt **A: bản JS nhẹ, nhưng phải tái dựng lại hết mấy thứ của unity**.
Nguồn: `C:\Users\tamph\Downloads\Food+Gang_2.2.4_APKPure.xapk` (com.bloop.food 2.2.4, Unity 6000.4.11f1, IL2CPP arm64, metadata v39).

## Game gốc [ĐO TRONG REPO]
- Đánh nhau 2D nhìn ngang, 16 nhân vật đồ ăn, 3 map (Kitchen, DiningRoom, Pantry), 8 kiểu đấu (DM 1v1/2v2/FFA4, Kill5, LastSurvivor, KillBoss).
- Mạng gốc: Photon Quantum 3. Meta: skin, league/trophy road, mission, pass/VIP, shop, fridge, daily offer, private battle.

## Hướng làm
- Không dùng Unity khi chạy. Canvas/WebGL viết tay. Scene, prefab, animation, particle, UI và camera lấy từ project AssetRipper
  `D:\foodgang-ref\fg-unity` (YAML) qua bộ xuất rerun được, rồi một runtime JS dựng lại đúng như Unity.
- Mạng: Unity Relay qua `games/mini-mart-coop/js/net/relay.js` (JS thuần), host là trình duyệt, bot thay người rớt.
- Luật lấy từ `GAMEPLAY.md` / `META.md`. Hai lõi C# đã kiểm (`fg-unity/Assets/FG/Sim`, `.../Meta`) là bản chuẩn để so khi port sang JS.
- Quảng cáo/IAP: nút vẫn hiện, bấm là nhận.

## Bố cục `games/food-gang/`
- `js/engine/` runtime kiểu Unity: scene graph, transform, sprite + sorting, animator, particle, camera, UI, audio, input.
- `js/sim/` lõi trận JS. `js/meta/` lõi meta JS. `js/game/` view trận, HUD, các màn hình.
- `data/` JSON xuất ra, `art/` atlas webp, `audio/` mp3. `tools/` bộ xuất (đọc `D:\foodgang-ref`).
- Kiểm: `test/food-gang-*.js`.

## Pha
0. ✅ Bóc + decompile + đặc tả + hai lõi C# (`simtest` 109 assert, `metatest` 97 940 assert).
1. Song song: (a) bộ xuất + runtime, hiện được map và nhân vật đứng/chạy; (b) lõi trận JS so trace với C#; (c) lõi meta JS so career với C#.
2. Màn trận đầy đủ: view theo `FoodGang.View` decompile, HUD, input, FX, tiếng. Lên Pages.
3. Menu + mọi màn meta từ UI prefab gốc.
4. Online qua Relay: quick match (thiếu người thì bot), private battle bằng mã.
5. So clip gốc (`parity-compare`), thẻ hub, tự chơi nhiều trận trên Pages.

## Tiến độ
- 2026-10-30: pha 0 xong. Dump ở `D:\foodgang-ref` (`out/` decompile, tra `sh /d/foodgang-ref/udk/udk.sh q|method|type|callers`).
  Pha 1b Unity WebGL dừng giữa chừng khi đổi sang JS; project `fg-unity` giữ làm nguồn YAML.
- 2026-10-30: pha 1 (JS) xong, cả ba đã kiểm lại:
  - `node test/food-gang-sim.js`: 117 kịch bản, 268 685 tick khớp từng bit với C# (`Core/CrtMath.js` chép sinf/cosf của ucrtbase).
  - `node test/food-gang-meta.js`: 189 196 assert, profile khớp từng byte với C#.
  - `node test/food-gang-render.js`: 27/27; bộ xuất `tools/export_unity.py`, runtime `js/engine`, 6,07 MB art+audio+data.
- 2026-10-31: pha 2 lên Pages, commit 88ca47dd (rev 20261030a, thẻ hub `food-gang`). Đẩy bằng index tạm trên origin/main
  (cây chính lệch 113 commit + có việc dở của agent khác). `FG_URL=<Pages> node test/food-gang-play.js` 330/332: 2 check
  hồi sinh trượt ở trận kết thúc sau 1 kill (luật killBoss), lỗi của test không phải game; đã giao pha 3 sửa.
  Đang làm song song: pha 3 (menu + meta, `js/game/screens`, rev 20261031a) và pha 4 (online, `js/net`, hợp đồng `Online` trong brief).
