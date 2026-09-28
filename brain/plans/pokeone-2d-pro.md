# PokéOne → 2D kiểu PRO + lớp mạng xã hội

Yêu cầu chủ dự án (2026-09-28): chuyển `games/pokeone` sang 2D giống PRO (`D:\PROClient_64.zip`,
giải nén ở `D:\pro-ref`). Chơi solo là chính. Online chỉ có: chat toàn cục (khoe Pokémon, mời đánh
boss), lập đội CHỈ khi đánh boss, chợ trời đấu giá Pokémon.

## Định nghĩa xong

Trên Pages (`.../games/pokeone/index.html`): tạo nhân vật bằng sprite PRO → đi Pallet → Route 1 →
Viridian trên bản đồ tile 2D PRO, đánh trận 2D (sprite trước/sau PRO, nền `battlebgnew`, thanh máu
atlas PRO), bắt Pokémon. Hai trình duyệt cùng lúc: A gửi chat, B thấy; A khoe Pokémon, B bấm xem
thẻ; A mời boss, B vào phòng, cả hai đánh, máu boss chung giảm theo sát thương cả hai. Chợ: A đăng
Pokémon, B trả giá, hết giờ B nhận Pokémon, A nhận tiền (cần bảng SQL, chủ dự án chạy một lần).

## Nguồn PRO [ĐO TRONG REPO]

- `data.unity3d` là UnityFS (Unity 2023.1.22f1), UnityPy 1.25 đọc được. Không có `m_Container`
  bundle; đường dẫn lấy từ `ResourceManager.m_Container` của `resources.assets`.
- Thư mục Resources: `tiles/1..144` (1024², ô 32px), `pbig`(trước 128²), `back`, `follow` (256²,
  lưới 4×4 ô 64px), `smallpokemon` (32²), tiền tố `s` = shiny, `npc/spriteN` (256², 4 hàng × 3 cột
  ô 64px, hàng 0 lưng, 1 PHẢI, 2 mặt, 3 TRÁI — đo lại 2026-09-28), `player/<lớp>`, `battlebgnew/*` (570×400),
  `attackanimations/*`, `pokeballs/{closed,open,hand}`, `audio files/{cry,battle sfx,gui sfx,world sfx}`.
- Atlas UI NGUI: Texture2D `MainUIAtlasTrilinear` (sharedassets0 path 11, 2048²). Bảng sprite là
  MonoBehaviour sharedassets0 path 35: từ byte 44 là int đếm (461) rồi từng mục
  `string name (căn 4) + 12 int x,y,w,h,bl,br,bt,bb,pl,pr,pt,pb`.
- Cây UI `level1/GUIS/GameGUI`: Transform + tên GameObject đọc được (không cần typetree). Gốc
  1366×768: `GameMenu` góc dưới trái, `ChatBox` dưới phải, `TeamSidebar` trái trên, `TopRightPanel`.
  Có sẵn `ChatLinkPokeCard` (PRO vốn khoe Pokémon qua chat).
- Bản đồ KHÔNG có trong client (máy chủ gửi). IL2CPP dump hỏng (metadata bị bảo vệ) — không cần.
- Supabase Realtime (broadcast + presence) chạy với anon key, không cần bảng [đo bằng node WS 2026-09-28].

## Giữ / bỏ

Giữ: `js/engine.js` (P1.mon, P1.Battle — thuần logic), `js/world-script.js`, `js/core.js` (bỏ
`renderer/gltf/texture`), `js/main.js`, nguồn bản đồ `tools/maps/*.txt` (bố cục, actor, script,
quest, zone), `vendor/pkmn-sim`, `audio/music`, `audio/cry`, `art/item`, `data/gamedata.js`.
Bỏ: three.js, GLTFLoader, meshopt, `world-map.js`, `fx.js`, `ngui.js`, `title.js` 3D,
`data/{ui,props,pokes,battle,atlas}.js`, `art/{map,poke,battle,title,ui,fx,sprite}`, tool rip 3D.

## Hợp đồng tài sản (tools/pro/rip_pro.py → art/pro, data/pro.js)

```
art/pro/tiles/<sheet>.png            chỉ tấm có trong tools/maps/brushes.txt
art/pro/poke/{front,back,follow,icon}/<dex>.png, <dex>s.png   dex 1..251
art/pro/player/<m|f>/{body,cloth,hair,hat}/<tên>.png
art/pro/npc/sprite<N>.png            chỉ sprite bản đồ dùng + danh sách thêm
art/pro/ui/main.png                  atlas UI
art/pro/bg/<tên>.png                 battlebgnew
art/pro/ball/<ball>_{closed,open,hand}.png
audio/pro/<nhóm>/<tên>.ogg           nếu giải được
P1.PRO = { ui:{ '<sprite>':[x,y,w,h,bl,br,bt,bb,pl,pr,pt,pb] }, uiSize:[2048,2048],
           player:{ m:{body:[],cloth:[],hair:[],hat:[]}, f:{...} }, npc:[], bg:[], balls:{}, sfx:{}, dexMax:251 }
```

## Bản đồ 2D (tools/build_maps.js → data/maps.js)

Ô tham chiếu tile = `sheet*1024 + row*32 + col` (số nguyên, -1 = trống). Bản đồ dựng:
`{ id,name,w,h, ground:[], ground2:[], over:[], colliders, zones, links, npcs, settings }`.
`over` vẽ sau actor (mái nhà, ngọn cây). Cọ trong `brushes.txt`: `ground=S:c,r|...`,
`stamp=S:c,r,WxH foot=N` (N hàng dưới vào `ground2` + chặn; phần trên vào `over`).

## Mạng (js/net.js + chat/raid/market)

- Kênh `realtime:pokeone:global`: broadcast `chat`, `show` (thẻ Pokémon), `boss_invite`, `market`;
  presence `{name, map, lvl}`.
- Thẻ Pokémon `MonCard = {dex,nick,level,shiny,gender,nature,ability,ivs,moves:[tên],ball,ot}` —
  hàm thuần `cardOf(mon)`.
- Boss: không cần máy chủ. Mỗi người đánh boss trong trận 1v1 cục bộ (P1.Battle), boss HP to.
  Mỗi client phát `dmg {id, total}` luỹ kế; HP chung = maxHP − Σ max(total theo id) → hội tụ,
  phát lại vô hại (idempotent). Chủ phòng chỉ phát `start {at, boss, seed}`. Tối đa 4 người.
- Chợ: bảng `p1_listings`, `p1_bids` + RPC security definer `p1_list`, `p1_bid`, `p1_cancel`,
  `p1_claim` (trả mọi thứ người gọi được nhận — Pokémon thắng, tiền bán, tiền hoàn khi bị trả
  giá cao hơn, Pokémon ế — và đánh dấu đã nhận trong cùng giao dịch). Tiền đặt giá trừ ngay ở
  save (ký quỹ). Hết giờ xử lý lười khi đọc. Cần đăng nhập hub (auth.uid()).

## Luồng việc

1. Chặn: rip_pro.py (tài sản), cọ tile PRO (brushes.txt mới). Song song với nhau.
2. Song song, tệp tách rời: World 2D (build_maps.js, world*.js), Trận 2D (battle.js), UI/HUD/menu
   (menus.js, world-ui.js, creator.js, title.js, css), Mạng (net/chat/raid/market.js, db sql).
   `index.html`, `core.js`, `data/games.js` do chủ luồng sửa.
3. Kiểm Playwright hai trình duyệt, push, kiểm trên Pages.

## Hợp đồng giữa các luồng (agent đọc phần này trước khi viết mã)

Chung: không commit, không `git add -A`/`stash`/`checkout .`; chỉ sửa tệp trong phạm vi của mình.
Chú thích và tài liệu tiếng Việt. Chữ giao diện hệ thống tiếng Việt; lời thoại cốt truyện giữ nguyên.
`python -c` nhiều dòng hỏng trong Git Bash (shim pyenv): dùng `python - <<'EOF'`. Đặt `PYTHONIOENCODING=utf-8`.
Playwright: xem cách `test/pokeone-engine.js`/`pokeone-world.js` (git HEAD) nạp `PLAYWRIGHT_PATH`, server tĩnh, cờ swiftshader.

Khung đã có (chủ luồng viết, đừng sửa, cần đổi thì ghi vào báo cáo):
- `index.html` nạp theo thứ tự: pkmn-sim, data/{gamedata,audio,pro-ui,pro,pro-anim,maps}.js, js/{core,engine,proui,menus,
  title,creator,battle,world-actor,world-script,world-ui,world,net,chat,raid,market,main}.js; css/p1.css, css/social.css.
  Canvas `#view`, lớp DOM `#ui`.
- `P1.view()` → `{canvas, ctx, w, h, dpr, fit}` (ctx đã setTransform theo dpr, không làm mịn). `P1.img(url)` Promise,
  `P1.imgNow(url)` ảnh hoặc null. `P1.proui.{ready,rect,url,apply,el,has}` sprite atlas UI PRO (data/pro-ui.js).
- `main.js` gọi `P1.view()`, chờ `P1.proui.ready()`, rồi `title` / `?map=` / `?battle=`.

Ngoại hình người chơi: `P1.state.player = { name, gender:'m'|'f', look:{ body, cloth, hair, hat } }`, giá trị là tên tệp
KHÔNG có hậu tố tư thế (vd body `0_0`, cloth `1009`, hair `1`, hat `''` = không đội). Ảnh:
`art/pro/player/<gender>/<lớp>/<tên>_<tư thế>.png`, tư thế đi = `P1.PRO.pose.walk` (rip xác minh).
Thứ tự vẽ lớp: `P1.PRO.layerOrder`. Tấm 256², ô 64px, hàng 0 lưng/lên, 1 phải, 2 mặt/xuống, 3 trái; 3 cột khung bước.
Pokémon đi theo: `art/pro/poke/follow/<dex>[s].png`, thứ tự hàng ở `P1.PRO.followRows` (rip xác minh).

Cảnh trận: `P1.scene.go('battle', { kind:'wild'|'trainer'|'boss', foe:[mon], name, onEnd(out), canLose, bg, boss })`.
`bg` = họ nền PRO ('land','forest','indoor','cave 1','ocean',...) — trận tự thêm `_day|_afternoon|_night` nếu có.
Bản đồ đặt `settings.bg` theo họ này. Với `kind:'boss'`, `boss = { maxHp, sharedHp(), report(dealtTotal), ended() }`:
trận đặt máu tối đa của boss = maxHp; sau mỗi lượt gọi `report(tổng sát thương mình gây cho boss từ đầu trận)`, rồi hạ
máu boss cục bộ xuống `sharedHp()` nếu nhỏ hơn; thanh máu boss vẽ theo `sharedHp()` mỗi khung; `sharedHp()<=0` →
thắng; `ended()` true → kết thúc trận (hết giờ/đội thua). Boss: không ném bóng, Chạy = rời trận boss.
`out = { outcome:'win'|'lose'|'ran'|'caught', money, exp, caught, evolve:[...] }` như cũ.

API giao diện giữ tên cũ (world.js/battle.js gọi): `P1.ui.{hud, open, close, closeAll, isOpen, shop, heal, learnMove,
evolve, message, toast, textInput, pressAndHold, onEl, paintPlayer, itemByKey}`, `P1.dialog.{say, choose}`.
HUD theo bố cục PRO (`D:\pro-ref\ref\gamegui.txt`): thanh đội trái trên, menu dưới trái, tên map + giờ phải trên.
Góc dưới phải 440×280 px để trống cho khung chat (luồng mạng tự gắn vào `#ui`).
Nút nối sang mạng (có thì gọi, không có thì ẩn): menu Pokémon (đội/PC) có "Khoe lên chat" → `P1.chat.showMon(mon)`,
"Đăng lên chợ" → `P1.market.listMon(mon, from:'party'|'box', index)`; HUD có nút "Chợ trời" → `P1.market.open()`.

Mạng: `P1.net` (kết nối Realtime, danh tính `P1.net.me = {id, name, member}`), `P1.chat` (`showMon(mon)`, gắn/bỏ khung
chat qua `mount()/unmount()`), `P1.raid` (`openLobby(bossId)`, `join(roomId)`), `P1.market` (`open()`, `listMon(...)`).
Kịch bản bản đồ có lệnh `raid <bossId>` gọi `P1.raid.openLobby(bossId)` (luồng thế giới thêm vào world-script.js,
đặt NPC "Cổng Boss" ở Viridian City). `cardOf(mon)` → MonCard (luồng mạng viết trong net.js, UI dùng lại được).

## Co-op gốc của PokéOne [ĐO TRONG REPO, 2026-09-28, D:\pokeone-ref\il2cpp\dump.cs + wiki]

- Party (`PartyHandler`, gói `Party/PartyMember/PartyPokemon/PartyRemove`): tối đa 3 người (FAQ), mời/đá/nhường
  trưởng nhóm (vương miện), kênh chat riêng (`ChatID`), thấy Pokémon, cấp, khu vực của nhau.
- Phòng trận `BattleLobbyHandler`/`LobbyWindow` (gói `Lobby`, `LobbyActor`): hai đội Team1/Team2, mỗi "actor" là
  `User|Leader|NPC|Inactive|Offline`, góp `PokemonCount` con và `ActiveCount` con ra sân cùng lúc; tuỳ chọn
  Items/AdjustLevels/TeamPreview/Rotation/Ranked; trạng thái `Idle → Accept → Confirm`, đếm ngược rồi vào trận.
  Tức là người chơi cùng đứng một phe trên MỘT trận Showdown (trận đôi/ba), đối đầu NPC/boss.
- `BattleLayout`: Default, Rotation, Horde, BattleRoyal. `Battle` có `Request1/Request2`.
- Boss: huyền thoại BST>600 chỉ gặp dạng boss, hồi sau 1 tuần (chạy trốn thì reset trong ngày); trứng rơi từ boss hằng ngày.
- Chia chiến lợi phẩm kiểu MMO: `LootVote` Need/Greed/Pass có thời hạn, `LootVoteResult` Won/Lost/Passed, `LootType`
  Money/Item/Pokemon/Lootbox…
- Thử `@pkmn/sim` 0.10.11 [đo bằng node]: trận đôi Gen 7 2v2 chạy; trận ba chỉ có ở Gen 6 (`gen6triplescustomgame`);
  phe có ít con hơn số ô (boss một mình đấu 2–3 người) → `setPlayer` sập (`forceSwitchFlag` of null).
  Muốn boss chung sân thì phe boss phải đủ con: boss + đệ tử.
