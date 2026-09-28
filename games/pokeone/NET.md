# PokéOne — lớp trực tuyến

Trò chơi là solo. Mạng chỉ phục vụ ba việc: **chat toàn cục** (khoe Pokémon, mời đánh boss), **đội đánh boss**
(chỉ tồn tại trong một trận boss), **chợ trời** đấu giá Pokémon. Mọi thứ ở đây hỏng thì im lặng: không cấu hình,
mất mạng, bảng chưa cài → trò chơi solo vẫn chạy y nguyên, không chờ mạng ở bất cứ đâu.

| Tệp | Việc |
|---|---|
| `js/net.js` | `P1.net`: một WebSocket Realtime, kênh + presence, REST/RPC có token thành viên, danh tính, `cardOf`/`parseCard`/`parseMon`, `giveMon` |
| `js/chat.js` | Khung chat kiểu PRO góc dưới phải, thẻ Pokémon, bộ popup dùng chung `P1.social` |
| `js/raid.js` | Bảng boss, xoay vòng theo ngày, phòng chờ, trận boss máu chung, thưởng |
| `js/market.js` | Cửa sổ chợ, đăng bán, trả giá, hộp thư đi, nhận đồ |
| `css/social.css` | Bố cục + chữ; khung lấy từ atlas UI PRO qua `P1.proui` |
| `../../db/pokeone-market.sql` | Bảng + RLS + 4 hàm SECURITY DEFINER của chợ |
| `../../test/pokeone-social.js` | Kiểm: SQL trên Postgres WASM, hai trình duyệt trên Realtime thật, chợ |

## Kết nối Realtime [ĐO TRONG REPO, 2026-09-28]

Hub không dùng supabase-js (không phụ thuộc ngoài). `net.js` nói thẳng giao thức Phoenix `vsn=1.0.0`:

```
wss://<project>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0
→ {topic:'realtime:pokeone:global', event:'phx_join', join_ref, ref,
   payload:{config:{broadcast:{self:false,ack:false}, presence:{key:<me.id>, enabled:true}, private:false}}}
→ {topic, event:'broadcast', payload:{type:'broadcast', event, payload:{…, from:{id,name}}}}
→ {topic, event:'presence', payload:{type:'presence', event:'track', payload:{…meta, name}}}
→ {topic:'phoenix', event:'heartbeat', payload:{}, ref}   mỗi 25 s
← presence_state {key:{metas:[…]}} , presence_diff {joins, leaves}
```

- **`presence.enabled:true` là bắt buộc.** Thiếu nó, máy chủ nhận `track` nhưng mỗi người chỉ thấy chính mình
  (đo bằng hai client node 22: không có `enabled` → `presence_diff` chỉ chứa khoá của mình).
- **`presence_diff` có thể tới TRƯỚC `presence_state`.** Đo được cả hai thứ tự. `net.js` làm như Phoenix Presence:
  diff tới trước ảnh chụp thì xếp chờ, áp sau ảnh chụp. Trước khi sửa, lỗi hiện ra là "0 online" dù đã nối.
- Nối lại: 1, 2, 5, 10, 20, 30 s rồi giữ 30 s. Nối lại thì vào lại mọi kênh và `track` lại meta cũ.
- Gửi lúc đang mất kết nối là rơi mất. Mọi giao thức bên dưới chịu được việc đó (chat là tạm, sát thương boss là luỹ kế).
- `?netns=test-xxx` đổi mọi chủ đề thành `realtime:pokeone:test-xxx:<kênh>` để bộ kiểm không làm phiền người chơi thật.

**Danh tính.** `me.id` = `userId` nếu là thành viên hub (`hub.session.v1`, kind `member`), không thì một id ngẫu nhiên
cố định lưu ở `localStorage['pokeone.netid']`. `me.name` = tên huấn luyện viên (`P1.state.player.name`, ≤24).
Broadcast không có danh tính do máy chủ xác nhận: `from` do người gửi tự khai. Đủ cho chat và boss; chợ thì
danh tính thật là `auth.uid()` phía máy chủ, không dựa vào `from`.

**Mọi payload đến là dữ liệu không tin cậy.** Kiểm ở ranh giới: `parseFrom`, `parseCard`, `parseInvite`, `parseStart`,
`parseListing`, `parseMon`. Chữ luôn đi qua `esc()` trước khi vào `innerHTML`.

## Kênh `global`

| Sự kiện | Payload | Bên nhận |
|---|---|---|
| `chat` | `{text}` ≤140 ký tự | dòng chat |
| `show` | `{card: MonCard}` | dòng "X khoe [Pikachu ★ Lv22]", bấm mở thẻ |
| `boss_invite` | `{room, boss, host, slots, expires}` | dòng mời + nút **Tham gia** → `P1.raid.join(room)` |
| `market` | `{listing}` | cửa sổ chợ đang mở thì tải lại (trễ 0,5 s) |
| presence | `{name, map, lvl}` | số người online |

`MonCard = {dex, nick, level, shiny, gender, nature, ability, ivs:{hp,atk,def,spa,spd,spe}, moves:[tên], ball, ot}`
(`P1.net.cardOf(mon)`): ảnh chụp công khai, không mang uid/EXP/EV/vật phẩm. Tên loài dịch cục bộ từ `dex`.

Khung chat: giữ 100 dòng, giới hạn gửi 1 tin / 1,5 s (dòng hệ thống xám báo), Enter mở ô gõ (bắt ở pha capture nên
`core.js` không nhận Enter thành nút A; không bắt khi `P1.ui.isOpen()`), gửi xong trả focus về game. Tự hiện ở cảnh
`world`, tự gỡ ở cảnh khác (theo dõi `P1.scene.name` mỗi 250 ms, chỉ đổi khi tên cảnh đổi — `mount()/unmount()` gọi
tay vẫn giữ tới lần đổi cảnh sau). Khi popup của lớp mạng đang mở, phím trò chơi bị chặn và Esc đóng popup trên cùng.

## Boss

**Không có máy chủ trận.** Mỗi người đánh một trận 1v1 cục bộ với cùng một con boss:

```
P1.scene.go('battle', { kind:'boss', foe:[bossMon], name, bg, canLose:true,
  boss:{ maxHp, sharedHp(), report(tổngSátThươngCủaMình), ended() }, onEnd })
```

- Con boss giống hệt trên mọi máy: `P1.mon.create` chạy dưới `P1.rng` gieo bằng `seed` của chủ phòng.
- **Máu chung** `sharedHp = maxHp − Σ_{id ∈ thành viên} dealt[id]`, với `dealt[id]` = tổng luỹ kế **lớn nhất** từng
  nghe từ người đó. Mỗi người phát `dmg {id, total, down}` sau mỗi lượt và mỗi 2 s. Vì mỗi số hạng chỉ tăng và lấy max,
  nhận trùng / lệch thứ tự / mất gói giữa chừng đều cho cùng kết quả khi gói mới nhất tới (bộ kiểm thử cả ba).
  Gói có `id` khác `from.id` hoặc từ người ngoài danh sách trận bị bỏ.
- `maxHp = hp_boss × (1 + 0,8 × (số người − 1))`; `parseStart` kiểm lại công thức, lệch là bỏ.
- `ended()` = hết 5 phút, hoặc mọi thành viên gục. "Gục" = tự báo `down`, hoặc im quá 10 s trong lúc mình vẫn đang
  nối (lúc chính mình mất mạng thì không tính ai gục; nối lại thì đặt lại đồng hồ im lặng).

**Phòng** (kênh `raid:<room>`), máy trạng thái `joining → lobby → countdown → fight → wait → over`:

| Tin | Ai phát | Ý nghĩa |
|---|---|---|
| presence `{lead:{dex,level,shiny}, t, host}` | mọi người | danh sách phòng, sắp chủ phòng trước rồi theo `t` |
| presence chủ phòng thêm `{boss, phase, start}` | chủ phòng | người vào sau đọc boss; ai lỡ tin `start` vẫn bắt kịp |
| `start {boss, level, maxHp, seed, members:[{id,name}], delay}` | chủ phòng | danh sách trận chốt ở đây (≤4) |
| `dmg {id, total, down}` | mỗi người | xem trên |
| `close {}` | chủ phòng | giải tán khi còn ở phòng chờ |

- Tối đa 4: người vào thứ 5 trở đi (theo thứ tự presence) tự rời "Phòng đã đủ 4 người". Hai người vào cùng lúc thì
  `start.members` của chủ phòng là trọng tài cuối.
- Đếm ngược tính bằng `delay` tương đối (3 s) chứ không bằng giờ tuyệt đối của chủ phòng → lệch đồng hồ giữa các máy không sao.
- Chỉ vào phòng / bắt đầu khi đang ở cảnh `world`. Tới giờ mà không ở world (đang mở menu thì vẫn là world) quá 15 s → tính là gục.
- Trận của mình kết thúc mà đội còn đánh → `wait`: về world, bảng đồng đội vẫn hiện, chờ `sharedHp ≤ 0` (thắng) hoặc `ended()`.
- **Thưởng** cho mỗi người có `dealt > 0` khi boss gục: tiền + EXP huấn luyện + chính loài boss Lv20 (IV ngẫu nhiên,
  shiny 1/64) vào đội hoặc PC, rồi `P1.save()`. `P1.state.raidDone` (30 mã phòng gần nhất) chặn nhận hai lần.
- Không chống gian lận: mỗi máy tự cấp thưởng cho mình, như mọi thứ trong bản lưu cục bộ.

Boss (`P1.raid.BOSSES`) và xoay vòng: mỗi ngày (giờ Việt Nam, UTC+7) mở 3 boss — 1 boss Lv30 + 2 boss từ phần còn lại,
trộn theo băm của ngày. `openLobby()` không có id → bảng chọn 3 boss hôm nay.

| id | Tên | Lv | Máu/người | Thưởng |
|---|---|---|---|---|
| snorlax | Snorlax Khổng Lồ | 30 | 450 | ₽3000, 300 EXP |
| gyarados | Gyarados Cuồng Nộ | 30 | 420 | ₽3000, 300 EXP |
| lapras | Lapras Biển Băng | 30 | 440 | ₽3000, 300 EXP |
| articuno / zapdos / moltres | … Huyền Thoại | 40 | 650 | ₽6000, 600 EXP |
| mewtwo | Mewtwo Tối Thượng | 50 | 1000 | ₽12000, 1200 EXP |

Các con số máu/thưởng là **[ĐỀ XUẤT]**, chưa cân bằng bằng trận thật (battle.js 2D chưa xong khi viết).

## Chợ trời

Cần đăng nhập hub (`auth.uid()`); khách thấy "Đăng nhập hub để dùng chợ" + liên kết `../../login.html`.

**Bảng** `p1_listings`, `p1_bids`: ai cũng đọc được (RLS select cho anon + authenticated), **không ai ghi thẳng**
(không có policy ghi, và `revoke insert/update/delete`). Mọi thay đổi qua 4 hàm `SECURITY DEFINER set search_path = public`,
chỉ `authenticated` được `execute`:

| Hàm | Làm gì |
|---|---|
| `p1_list(p_nonce, p_mon, p_card, p_name, p_start_price, p_buyout, p_hours∈{1,6,24})` | đăng; mon ≤8 KB, card ≤2 KB, tên ≤24, tối đa 10 phiên mở/người |
| `p1_bid(p_nonce, p_listing, p_amount, p_name)` | trả giá ≥ max(khởi điểm, giá đầu + max(1, ⌈5 %⌉)); ≥ mua đứt → hạ về đúng giá mua đứt, kết thúc ngay |
| `p1_cancel(p_listing)` | người bán rút phiên chưa ai trả giá; Pokémon về qua `p1_claim` |
| `p1_claim(p_token)` | đánh dấu + trả mọi thứ người gọi được nhận, trong **một** giao dịch |

`p1_claim` trả `[{kind:'mon'|'money', reason:'won'|'returned'|'sold'|'refund', listing, mon, amount}]`:
Pokémon thắng (hết giờ, mình dẫn đầu), Pokémon ế/huỷ về người bán, tiền bán, tiền hoàn cho **mọi lượt không còn dẫn đầu**
(hoàn ngay cả khi phiên còn mở — một lượt đã bị vượt thì không bao giờ dẫn đầu lại). Hết giờ xử lý lười: không cron,
"đã kết thúc" = `ends_at <= now()`.

Lỗi trả về dạng `p1:<mã>` (vd `p1:bid_low 1050`); `market.js` dịch sang tiếng Việt.

### Chỗ đã sửa so với thiết kế ban đầu (và vì sao)

Thiết kế ban đầu dùng cờ boolean `seller_paid` / `mon_delivered` / `refunded` và `p1_claim()` không tham số. Lỗ hổng:
máy chủ đánh dấu "đã giao" rồi **phản hồi mất trên đường về** (mất mạng, đóng tab) → đồ biến mất vĩnh viễn. Tương tự
`p1_list`/`p1_bid`: ghi xong mà phản hồi mất thì client không biết Pokémon đã lên chợ / tiền đã đặt chưa.

Sửa (mọi lệnh ghi đều lặp lại được):
- Cờ boolean → cột `mon_claim`, `money_claim` (listing) và `refund_claim` (bid) kiểu `uuid`: null = chưa giao, khác null =
  đã giao **trong lần nhận mang token đó**. `p1_claim(p_token)` gọi lại cùng token trả lại đúng những món ấy; token mới
  thì không giao trùng.
- `p1_list`/`p1_bid` nhận `p_nonce`, `unique (seller|bidder, nonce)`: gọi lại cùng nonce trả kết quả cũ, không ghi lần hai.
- Thêm `top_bid_id` để biết chính xác lượt nào đang dẫn (hoàn tiền mọi lượt khác).

Phía client (`P1.state.market`, lưu cùng bản lưu):
- `outbox`: lệnh đang treo `{op:'list'|'bid', nonce, args, mon|money}`. Đồ được **giữ ký quỹ trước khi gửi** (Pokémon rút
  khỏi đội/PC, tiền trừ ngay) và lưu. Kết quả: `ok` → xong (mua đứt thì hoàn phần chênh); `reject` (4xx, chưa cài, chưa đăng
  nhập — chắc chắn chưa ghi) → trả đồ lại; `unknown` (mất mạng, 5xx) → giữ nguyên, lần mở chợ sau gửi lại cùng nonce.
- `claim`: token lưu vào bản lưu **trước** khi gọi `p1_claim`; áp đồ, xoá token và `P1.save()` trong cùng một nhịp đồng bộ.
- Pokémon nhận về đi qua `parseMon`: dựng lại bằng `P1.mon.create` rồi chỉ chép trường đã kiểm (IV 0–31, EV ≤252/≤510,
  chiêu có thật ≤4, PP ≤ tối đa, đặc tính đúng loài, EXP trong khoảng của cấp; vật phẩm cầm theo bị bỏ — nên `listMon`
  từ chối Pokémon đang cầm đồ). Dữ liệu độc từ bản lưu người khác không vào được bản lưu mình.

### An toàn khi chạy song song

- `p1_bid` khoá dòng phiên (`for update`) → mọi lượt trả giá cùng phiên xếp hàng. Kiểm hết giờ bằng `clock_timestamp()`
  (không phải `now()` — giao dịch có thể đã chờ khoá qua mốc) và từ chối nếu `mon_claim` đã có.
- `p1_claim` là các `UPDATE … where <cột claim> is null`: mỗi dòng bị khoá khi sửa; ở READ COMMITTED, giao dịch đến sau
  xét lại điều kiện trên bản mới → hai lần nhận song song không giao trùng. Lượt trả giá và lần nhận tranh nhau cùng dòng
  phiên nên cũng tuần tự.
- `p1_list` giữ `pg_advisory_xact_lock` theo người bán → giới hạn 10 phiên mở đúng cả khi hai tab bấm cùng lúc.
- Chưa kiểm được: tranh chấp thật giữa hai kết nối (Postgres WASM trong bộ kiểm chỉ có một kết nối). Lập luận ở trên là
  theo ngữ nghĩa khoá dòng của Postgres, chưa đo.

### Bảng chưa cài

PostgREST trả 404 với `PGRST205` (bảng) / `PGRST202` (hàm) [đo trên dự án thật 2026-09-28]. Chợ hiện
"Chợ chưa mở: chủ hub cần chạy db/pokeone-market.sql"; `listMon` trả Pokémon về đội. Cài một lần theo `db/README.md`
§Chợ trời PokéOne. Không có và không dùng service key.

Không chống gian lận: tiền và Pokémon đến từ bản lưu của trình duyệt, như `game_saves`.

## Móc nối với luồng khác

Đã có sẵn (các luồng khác đã nối): `world-script.js` lệnh `raid <bossId>`; `menus.js` nút "Khoe lên chat",
"Đăng lên chợ", HUD "Chợ trời". Trận `battle.js` cần theo hợp đồng `kind:'boss'` ở trên — bộ kiểm dùng cảnh trận giả
theo đúng hợp đồng vì battle.js 2D chưa xong khi viết.

## Kiểm

```
node test/pokeone-social.js
PGLITE_PATH=<thư mục có node_modules/@electric-sql/pglite> node test/pokeone-social.js   # thêm phần [sql]
```

Chu trình chợ đầy đủ trên máy chủ thật (đăng → trả giá → nhận) cần hai tài khoản thành viên hub thật và bảng đã cài; bộ
kiểm tự bỏ qua phần đó khi bảng chưa có. Phần SQL được kiểm trên Postgres WASM với `auth.uid()` giả.

## Bẫy đã sập

- `curl` trong Git Bash máy này không phân giải được `*.supabase.co` (mã 6) trong khi node thì được → thăm dò REST bằng
  `fetch` của node.
- `presence_state` rỗng tới sau `presence_diff` của chính mình → mất người vừa track (xem trên).
- Nút `<button>` gắn sprite không viền (vd `Button_round_X_normal`) vẫn hiện viền mặc định của trình duyệt → `social.css`
  xoá viền/nền mặc định bằng `:where(...)` (độ ưu tiên 0, sprite 9 mảnh đặt lại viền bằng style inline).
