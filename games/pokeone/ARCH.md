# PokéOne (bản web) — kiến trúc

Phần đầu Kanto (Pallet Town → Route 1 → Viridian City) chơi solo, 2D theo kiểu PRO (Pokémon Revolution
Online). Online chỉ có ba việc: chat toàn cục, đội đánh boss, chợ trời đấu giá (NET.md).

Lịch sử: bản 27/09/2026 là 3D dựng từ client PokéOne (three.js, model glb, cây UI NGUI). Ngày 28/09/2026 chủ dự án
yêu cầu chuyển sang 2D giống PRO (`D:\PROClient_64.zip`). Luật chơi, cốt truyện, nhiệm vụ, bảng gặp Pokémon, nhạc
và tiếng kêu giữ từ bản cũ. Hình, giao diện và tiếng hiệu ứng thay bằng của PRO. Bản 3D còn trong git (`014c740`).

## Nguồn

- **PRO** (`D:\pro-ref`, Unity 2023.1, UnityPy đọc được): tile, sprite Pokémon, lớp nhân vật, NPC, nền trận,
  hoạt ảnh chiêu, bóng, atlas UI NGUI, tiếng hiệu ứng. Cách bóc và các bẫy đã gặp: `tools/pro/README.md`.
  Client PRO không có bản đồ (máy chủ gửi), nên bản đồ ở đây dựng tay bằng tile PRO (`tools/README-world.md`).
- **PokéOne** (`D:\pokeone-ref`): nhạc, tiếng kêu (`tools/rip_audio.py`), bảng loài/chiêu/vật phẩm
  (`tools/rip_data.py` → `data/gamedata.js`), luật và nội dung wiki.
- **Pokémon Showdown** (`vendor/pkmn-sim`): luật trận Gen 7.

## Thư mục

```
index.html        nạp mọi <script> theo thứ tự, gắn ?v=<rev> (khớp rev ở data/games.js của hub)
vendor/           pkmn-sim (Showdown, gói iife)
data/             *.js sinh ra, gán vào window.P1 — không sửa tay
  gamedata.js     P1.SPECIES / ITEMS / MOVE_DESC / TYPECHART      (tools/rip_data.py)
  audio.js        P1.MUSIC / SFX / CRY_PATH                        (tools/rip_audio.py)
  pro.js          P1.PRO: danh sách lớp nhân vật, tư thế, hàng sprite, nền trận, tiếng PRO  (tools/pro/rip_pro.py)
  pro-ui.js       P1.PRO_UI: ô sprite của atlas UI                (tools/pro/rip_ui.py)
  pro-anim.js     P1.PRO_ANIM: hoạt ảnh chiêu, bóng              (tools/pro/rip_battle.py)
  maps.js         P1.MAPS / SCRIPTS / QUESTS                      (tools/build_maps.js ← tools/maps/*.txt)
art/pro/          ảnh PRO đã bóc; art/item icon vật phẩm PokéOne
audio/            music, cry (PokéOne), pro/ (tiếng hiệu ứng PRO)
js/               mã game
tools/            công cụ bóc và dựng, chạy lại ra cùng kết quả
```

## Mã

| Tệp | Việc |
|---|---|
| `core.js` | `P1.state` + lưu (`localStorage` `pokeone.save.v1`), cài đặt, phím, tiếng, canvas 2D dùng chung `P1.view()`, bộ nạp ảnh `P1.img/imgNow`, máy trạng thái cảnh `P1.scene`, vòng lặp |
| `engine.js` | Thuần logic: `P1.mon` (tạo, chỉ số, EXP, học chiêu, tiến hoá), `P1.Battle` (chạy Showdown, AI, bắt, EXP, móc boss) |
| `proui.js` | Cắt sprite atlas UI PRO ra dataURL, gắn nền hoặc viền 9 mảnh (`P1.proui`) |
| `menus.js` | HUD kiểu PRO, mọi cửa sổ (túi, đội, Pokédex, thẻ, PC, cửa hàng, hồi máu, học chiêu, tiến hoá, cài đặt), hộp thoại NPC. API `P1.ui.*`, `P1.dialog.*` |
| `title.js`, `creator.js` | Màn đầu, tạo nhân vật trên lớp sprite PRO |
| `world*.js` | Bản đồ ô 32px: vẽ lớp nền / nhân vật theo y / lớp trên, đi theo ô, gờ, cửa, cỏ gặp Pokémon, trainer nhìn thấy, Pokémon đi theo, máy chạy kịch bản |
| `battle.js` | Trận 2D: nền `battlebgnew`, sprite trước/sau, hộp máu atlas PRO, bảng `DIRECTOR` diễn từng dòng giao thức Showdown |
| `net.js`, `chat.js`, `raid.js`, `market.js` | Lớp trực tuyến, xem NET.md |

Cảnh: `title → creator → world ⇄ battle`. Trong `world` có chế độ con `loading | explore | script | warp | battle`.
Trận nhận `{ kind:'wild'|'trainer'|'boss', foe, bg, onEnd, boss }` và trả `out` qua `onEnd`.

## Hướng sprite [ĐO TRONG REPO, 2026-09-28]

- Người chơi và NPC (256², ô 64px, 3 cột khung bước): hàng 0 lưng, **1 phải**, 2 mặt, **3 trái**.
- Pokémon đi theo (4×4, cỡ ô = cạnh/4): hàng 0 mặt, **1 trái**, **2 phải**, 3 lưng.
- Hai quy ước ngược nhau; bản đầu của tài liệu ghi nhầm hàng người thành "1 trái". Đo lại bằng cách xếp 4 hàng
  cạnh nhau rồi nhìn hướng mặt.

## Kiểm

`node test/pokeone-engine.js` (node thuần), còn lại dùng Playwright với trình duyệt thật: `pokeone-battle.js`,
`pokeone-world.js` (chạy cả `build_maps.js --check`), `pokeone-shell.js`, `pokeone-social.js` (hai trình duyệt trên
Supabase Realtime thật, kênh riêng `?netns=`). Ảnh chụp lưu ở `%TEMP%\pokeone-*-shots`.
