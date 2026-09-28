# PokéOne — lớp trực tuyến

Trò chơi là solo. Mạng chỉ phục vụ ba việc: **chat toàn cục** (khoe Pokémon, dán mã phòng boss), **đội đánh boss**
(chỉ tồn tại trong một trận boss), **chợ trời** đấu giá Pokémon. Mọi thứ ở đây hỏng thì im lặng: không cấu hình,
mất mạng, bảng chưa cài → trò chơi solo vẫn chạy y nguyên, không chờ mạng ở bất cứ đâu.

| Tệp | Việc |
|---|---|
| `js/net.js` | `P1.net`: một WebSocket Realtime, kênh + presence, REST/RPC có token thành viên, danh tính, `cardOf`/`parseCard`/`parseMon`, `giveMon` |
| `js/chat.js` | Khung chat kiểu PRO góc dưới phải, thẻ Pokémon, bộ popup dùng chung `P1.social` |
| `js/raid.js` | Bảng boss (huấn luyện viên), đánh một mình / lập phòng, phòng chờ (máy trạng thái), trận chung lockstep, chia đồ, hồi 12 ngày |
| `js/market.js` | Cửa sổ chợ, đăng bán, trả giá, hộp thư đi, nhận đồ |
| `css/social.css` | Bố cục + chữ; khung lấy từ atlas UI PRO qua `P1.proui` |
| `../../db/pokeone-market.sql` | Bảng + RLS + 4 hàm SECURITY DEFINER của chợ |
| `js/engine.js` (`P1.CoopBattle`), `js/battle.js` | Trận chung: sim + điều khiển theo ô; cảnh trận 1–3 ô mỗi phe |
| `../../test/pokeone-social.js` | Kiểm: SQL trên Postgres WASM, 2 và 3 trình duyệt trên Realtime thật, chợ |

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
- **Presence bị giới hạn: track lần thứ 6 trong ~30 s thì máy chủ đóng kênh** (`system` "Client presence rate limit
  exceeded" + `phx_close`) [đo, xem §Boss]. `track()` gộp đuôi, cách nhau ≥ 8 s. Kênh bị máy chủ đóng riêng (socket vẫn
  sống) thì vào lại theo nhịp lùi như trên (sự kiện `closed` cho bên dùng kênh).
- **`phx_leave` phải có `join_ref`** (net.js gửi `join_ref` trên mọi lệnh của kênh như Phoenix): thiếu nó máy chủ vẫn trả
  `ok` nhưng không đóng kênh, nên người rời phòng vẫn hiện trong presence của người khác mãi (tới khi đóng cả socket) [đo
  bằng hai client node: có `join_ref` → người kia thấy rời sau ~1,9 s]. Bộ kiểm ba người bắt được lỗi này: chủ phòng rời
  mà không ai lên thay.
- Gửi lúc đang mất kết nối là rơi mất. Mọi giao thức bên dưới chịu được việc đó (chat là tạm, dòng phòng boss gửi lại
  mỗi 2 s và là trạng thái chứ không phải sự kiện).
- `?netns=test-xxx` đổi mọi chủ đề thành `realtime:pokeone:test-xxx:<kênh>` để bộ kiểm không làm phiền người chơi thật.

**Danh tính.** `me.id` = `userId` nếu là thành viên hub (`hub.session.v1`, kind `member`), không thì một id ngẫu nhiên
cố định lưu ở `localStorage['pokeone.netid']`. `me.name` = tên huấn luyện viên (`P1.state.player.name`, ≤24).
Broadcast không có danh tính do máy chủ xác nhận: `from` do người gửi tự khai. Đủ cho chat và boss; chợ thì
danh tính thật là `auth.uid()` phía máy chủ, không dựa vào `from`.

**Mọi payload đến là dữ liệu không tin cậy.** Kiểm ở ranh giới: `parseFrom`, `parseCard`, `parseRow` / `parseFighter` /
`parseLog` (raid), `parseListing`, `parseMon`. Chữ luôn đi qua `esc()` trước khi vào `innerHTML` (câu chat dựng bằng
`textContent`, mã phòng tách ra thành nút).

## Kênh `global`

| Sự kiện | Payload | Bên nhận |
|---|---|---|
| `chat` | `{text}` ≤140 ký tự | dòng chat |
| `show` | `{card: MonCard}` | dòng "X khoe [Pikachu ★ Lv22]", bấm mở thẻ |
| `market` | `{listing}` | cửa sổ chợ đang mở thì tải lại (trễ 0,5 s) |
| presence | `{name, map, lvl}` | số người online |

`MonCard = {dex, nick, level, shiny, gender, nature, ability, ivs:{hp,atk,def,spa,spd,spe}, moves:[tên], ball, ot}`
(`P1.net.cardOf(mon)`): ảnh chụp công khai, không mang uid/EXP/EV/vật phẩm. Tên loài dịch cục bộ từ `dex`.

Mã phòng boss trong câu chat (6 ký tự đứng riêng, có cả chữ lẫn số) hiện thành chữ cam + nút **Tham gia**; thanh khung chat
có nút **Nhập mã phòng**. Xem §Boss.

Khung chat: giữ 100 dòng, giới hạn gửi 1 tin / 1,5 s (dòng hệ thống xám báo), Enter mở ô gõ (bắt ở pha capture nên
`core.js` không nhận Enter thành nút A; không bắt khi `P1.ui.isOpen()`), gửi xong trả focus về game. Tự hiện ở cảnh
`world`, tự gỡ ở cảnh khác (theo dõi `P1.scene.name` mỗi 250 ms, chỉ đổi khi tên cảnh đổi — `mount()/unmount()` gọi
tay vẫn giữ tới lần đổi cảnh sau). Khi popup của lớp mạng đang mở, phím trò chơi bị chặn và Esc đóng popup trên cùng.

## Boss (co-op theo PokéOne, boss là huấn luyện viên như PRO)

Mô hình co-op lấy từ PokéOne [ĐO TRONG REPO, `D:\pokeone-ref\il2cpp\dump.cs`]: `BattleLobbyHandler`/`LobbyWindow`, gói
`Lobby`/`LobbyActor` (Team1/Team2; actor `User|Leader|NPC`; `PokemonCount`, `ActiveCount`; trạng thái `Idle → Accept →
Confirm`), `LootVote`/`LootVoteResult`/`LootType` (Need/Greed/Pass). Danh sách boss theo PRO (`bosses.json`: huấn luyện
viên, `"cooldown": "12 days"`). Quyết định của chủ dự án (28/09): đội chỉ lập khi đánh boss; boss là huấn luyện viên.

### Luồng

1. Nói chuyện với NPC boss → kịch bản gọi `raid <bossId>` → `P1.raid.openLobby(bossId)` hỏi **Đánh một mình / Lập phòng /
   Thôi** (`P1.dialog.choose`, không có thì popup). `openLobby()` không id → danh sách 13 boss kèm số ngày còn hồi.
2. **Đánh một mình** = trận huấn luyện viên thường (`kind:'trainer'`, `P1.Battle`, có EXP, dùng được túi đồ) với đúng đội
   boss; thắng → tiền FRLG (trận tự trả), vật phẩm, trứng, EXP huấn luyện, hồi 12 ngày.
3. **Lập phòng** → phòng chờ có **mã phòng** 6 ký tự (bảng chữ bỏ 0/O/1/I). Nút **Sao chép mã mời** chép câu
   `[Boss] Giovanni — mã phòng K7Q2M9` (`navigator.clipboard`, không được thì `<textarea>` + `execCommand('copy')`).
   Người chơi tự dán vào chat. Không còn tin mời tự động (`boss_invite` đã bỏ).
4. Chat nhận mã trong **mọi** câu (`P1.raid.findCodes`: 6 ký tự đứng riêng, có cả chữ lẫn số — chữ in hoa không số như
   `ABCDEF` không bị bắt) → tô mã + nút **Tham gia** → `P1.raid.join(mã)`. Nút **Nhập mã phòng** ở thanh khung chat mở ô
   dán mã (nhận cả câu mời, chữ thường).
5. Phòng chờ (`LobbyWindow`): Đội 1 = người chơi, tối đa `min(3, số Pokémon của boss)` (Brock/Misty 2 người); Đội 2 = huấn
   luyện viên boss (NPC, `count` = cả đội, `active` = số người). Mỗi người chọn 1–3 Pokémon còn máu, con số 1 ra sân.
   Thành viên **Idle → Sẵn sàng (Accept)**; chủ phòng bấm **Bắt đầu** khi không ai Idle → mỗi thành viên đang ở ngoài bản
   đồ tự **Confirm** (điểm danh); ai chưa Confirm sau 6 s thì huỷ lần bắt đầu. Đủ Confirm → chủ phòng chốt `order`,
   `party` (đội từng người), `seed` → đếm ngược 3 s → `battle`. Người đang hồi với boss này bị từ chối khi vào phòng.
6. **Trận chung** (`P1.CoopBattle`, `engine.js`): 1 người đánh đơn Gen 7, 2 người đánh đôi Gen 7, 3 người đánh ba **Gen 6**
   (Showdown chỉ có đánh ba ở Gen 6 [đo]). Người thứ i đứng ô i phe p1; phe p2 là đội boss, n con đầu ra sân, còn lại dự bị.
   AI boss điều khiển mọi ô: chiêu có điểm cao nhất (uy lực × hệ × STAB × chính xác) lên mục tiêu tốt nhất, 20 % chọn bừa;
   con gục thì tung con dự bị kế tiếp. Thắng = cả đội boss gục; thua = phe mình gục hết, hoặc quá 60 lượt.
   - Ô p1 do **chủ của con đang đứng ở ô đó** điều khiển; bảng chọn chỉ có chiêu của con mình, dự bị chỉ gồm Pokémon của mình.
     Người hết Pokémon mà đồng đội còn dự bị: Showdown không cho `pass` ở ô trống ("Can't pass: You need to switch in a
     Pokémon" [đo]) → con của đồng đội ra ô đó và đồng đội điều khiển luôn ô đó.
   - Chiêu một mục tiêu khi có nhiều đối thủ → chọn mục tiêu (đối thủ trước, đồng đội sau; `validTargetLoc` của sim).
   - Đồng hồ **30 s/lượt** (`ActorTimer` của PokéOne) tính từ lúc chủ phòng diễn xong lượt trước (chậm nhất 20 s sau khi
     chốt). Hết giờ, hoặc người điều khiển không còn trong phòng → chủ phòng chọn thay bằng AI. Hộp máu đồng đội ghi
     "đang chọn…" / "✓ đã chọn" / "tự động".
   - Trận chung không có túi đồ, không bắt, không EXP. **Rời trận** = rời phòng: ô của mình thành tự chọn, mất phần chia đồ.
   - Khi trận xong, mỗi máy chép HP / trạng thái / PP cuối về đúng các Pokémon mình mang vào (`finalOf`) rồi lưu.
7. **Chia đồ** khi thắng: 3 món — tiền, vật phẩm, trứng. Cửa sổ mở khi mọi người còn ở phòng đã xem xong trận (dòng có
   `done`), chậm nhất 30 s sau lượt cuối; 20 s bỏ phiếu **Cần / Tham / Bỏ**. Người thắng một món tính giống nhau trên mọi
   máy: có Cần thì chỉ xét Cần, không thì Tham; điểm = `1 + FNV1a(seed|món|id) mod 100`, cao nhất thắng, bằng điểm thì id nhỏ
   hơn; mọi người Bỏ / không bỏ phiếu → không ai nhận. Xong sớm khi mọi người đã bỏ đủ phiếu; không thì chốt sau 20 s + 3 s.
   Mỗi máy chỉ áp phần mình thắng rồi `P1.save()`; `P1.state.raidDone` (30 mã gần nhất) chặn nhận hai lần. Mọi người thắng
   trận nhận EXP huấn luyện và bị hồi 12 ngày (`P1.state.bossWins[bossId]` = lúc thắng).

### Máy trạng thái phòng

```
Lobby = { room, boss, leader, actors:[Actor], phase:'lobby'|'countdown'|'battle'|'loot'|'closed', seed, order, party, reason }
Actor = { id, name, team:1|2, kind:'leader'|'user'|'npc', state:'idle'|'accept'|'confirm', mons:[mon], count, active }
reduce(lobby, { type:'rows', rows, me, offline } | { type:'result', win } | { type:'close', reason }) → lobby   (hàm thuần)
effects(trước, sau): vẽ phòng chờ, chủ phòng chốt đội khi đủ Confirm, thành viên tự Confirm, vào trận, mở chia đồ, đóng
```

`closed` là trạng thái cuối (không mở lại). `rows` là ảnh chụp dòng của từng người (của mình là bản cục bộ).
Chủ phòng rời khi còn ở phòng chờ → giải tán; người thứ `cap + 1` → "Phòng đã đủ N người"; vào khi đã đếm ngược → từ chối.

### Giao thức (kênh `raid:<mã>`)

| Gì | Đường | Nội dung |
|---|---|---|
| điểm danh | presence, track **một lần** khi vào | `{t: lúc vào, name}` → ai đang ở phòng, thứ tự vào |
| dòng của mỗi người | broadcast `row`, khi đổi (gộp đuôi 150 ms) và **mỗi 2 s** | `{seq, state, confirmFor, mons:[BattleMon], pick, log, votes, done, lead?}` |

- `quit: true` = mình đã tự nhường chủ phòng (dính). `lead` (chỉ chủ phòng) = `{boss, phase:'lobby'|'countdown'|'battle', launch, seed, order:[id], party:[{id,name,mons}], created}`.
- `BattleMon` = `MonCard` + `{evs, moves:[{id,pp}], hp, status, happiness}`; nhận vào qua `parseFighter` (dựng lại bằng
  `parseMon`, kẹp HP, bỏ trạng thái lạ; hết máu → bỏ). `pick = {n, c:{ô: {t:'move', m, tg} | {t:'switch', k}}}`, `n` = độ dài
  nhật ký lúc chọn. `log` = nhật ký đã chốt, mỗi mục `[chuỗi lựa chọn Showdown phe p1 | null, phe p2 | null]` đúng như sim
  đã nhận. `votes = {money|item|egg: 'need'|'greed'|'pass'}`.
- Người nhận giữ dòng có `seq` lớn nhất theo từng người gửi; dòng của người không còn trong presence thì không tính (trừ
  `log`, xem dưới). Tin rơi mất được chữa bằng nhịp 2 s — mọi thứ trong dòng là trạng thái, không phải sự kiện.

### Lockstep, đổi chủ phòng

- Mọi máy dựng cùng một `CoopBattle` từ `lead.party` đã chốt, `trainerTeam(boss, seed)` (P1.rng gieo bằng seed) và seed
  của sim, rồi áp các mục nhật ký theo thứ tự → cùng sự kiện, cùng HP. Chỉ chủ phòng **quyết** mục kế tiếp (lựa chọn của
  từng ô + AI boss); mọi máy (kể cả chủ phòng) diễn sự kiện do chính sim của mình sinh ra.
- Chủ phòng = người đầu tiên trong `order` chưa bị coi là **mất**: vắng presence > 4 s (người khác thấy), hoặc chính mình
  mất kênh > 1,5 s (tự nhường, ghi `quit: true` vào dòng của mình — mọi máy thấy dòng đó thì coi là mất ngay). Mất là dính
  và chỉ là mất quyền chủ phòng: người đó vẫn chọn cho ô của mình như thường. Ngưỡng tự nhường ngắn hơn ngưỡng bị thay nên
  không có lúc hai chủ phòng; vắng thoáng qua (< 4 s) không đổi chủ phòng. Bản trước thiếu `quit`: chủ phòng tự nhường sau
  1,5 s mất kênh (vào lại kênh tốn ≥ 1 s) mà người khác chưa tới 4 s nên vẫn chờ nó → trận treo (review mã tìm ra).
- Chủ phòng mới lấy nhật ký dài nhất trong mọi dòng đã nhận (kể cả dòng cuối của người vừa rời — mọi nhật ký là tiền tố
  của nhau) rồi quyết tiếp; picks của các ô nằm sẵn trong dòng từng người nên không phải hỏi lại. Hai nhật ký khác nhau ở
  cùng một vị trí → "trận bị lệch": kết thúc cho mọi người, không thưởng.
- **Ảnh chụp sim không dùng được**: `Battle.toJSON` 26–38 KB, `Battle.fromJSON` ném `o.getMoveRequestData is not a
  function` ở 6/11 trạng thái của một trận đánh đôi [đo, `test/pokeone-engine.js`]. Phát lại nhật ký luôn ra đúng trạng thái.

### Chỗ đã đổi so với bản giao (và vì sao)

1. **Phát nhật ký lựa chọn thay vì phát dòng giao thức + request từng ô.** Không có ảnh chụp để chuyển chủ phòng (trên);
   nhật ký ~40 B/lượt, phát lại tất định [đo: hai `CoopBattle` cùng đầu vào cho sự kiện và HP giống hệt qua 34 mục]; mỗi máy
   tự lấy request của ô mình từ sim của mình.
2. **Presence chỉ để điểm danh; dòng đi bằng broadcast.** Máy chủ đóng kênh khi một client track presence lần thứ 6 trong
   khoảng ~30 s (`system` "Client presence rate limit exceeded" rồi `phx_close`) [đo bằng hai client node: cách 0,15 / 0,25 /
   0,4 / 0,6 / 1 / 2,5 s đều chết ở lần 6; 5 lần, nghỉ 35 s, 3 lần thì qua; meta 64 KB cũng làm đóng kênh]. Broadcast 60 tin
   4 KB mỗi 50 ms qua hết. Trước khi đổi, bộ kiểm hai trình duyệt bắt được hậu quả: kênh của chủ phòng bị đóng giữa trận,
   thành viên tưởng chủ phòng rời nên lên thay → nhật ký rẽ nhánh (kết thúc ở mục 10 và 11), HP lệch; phiếu chia đồ không
   tới máy kia.
3. **Boss là huấn luyện viên** (chủ dự án đổi, 28/09): phe p2 là đội của họ, không có đệ tử bịa; số người ≤ số Pokémon của
   boss vì phe ít con hơn số ô làm sim sập (`forceSwitchFlag` of null [đo]). Bỏ bảng boss huyền thoại và xoay vòng theo ngày.
4. **Điều khiển theo chủ con Pokémon, không theo ô cố định** — vì Showdown bắt thay ở ô trống khi đồng đội còn dự bị (trên).
5. **Cửa sổ chia đồ neo vào lúc mọi người xem xong trận** thay vì lúc chốt lượt cuối: máy diễn chậm từng tới bảng chia đồ khi
   20 s đã gần hết [đo trong bộ kiểm].
6. **`net.js`**: `track()` gộp đuôi, cách nhau ≥ 8 s; kênh bị máy chủ đóng riêng (`phx_close` / `phx_error` / `system` lỗi) thì
   vào lại theo nhịp lùi — trước đây kênh chết im trong khi socket vẫn sống.

### Bảng boss [MAINLINE FRLG, PRO không công bố đội hình]

Đội hình và cấp theo FireRed/LeafGreen, **chép theo trí nhớ Bulbapedia, chưa đối chiếu lại**. Chiêu không phải moveset gốc:
mỗi con lấy 4 chiêu học gần nhất theo cấp. Tiền = tiền thưởng FRLG (100 × cấp con cuối; Nhà vô địch 200 ×, **đoán** theo
cách tính Gen 3). `sprite` = `npc/sprite<N>` của PRO nhận bằng mắt trên bảng ghép `D:\pro-ref\cache\npc` (`?` = chưa chắc).
Vật phẩm, trứng, EXP huấn luyện (50 × cấp cao nhất) là **[ĐỀ XUẤT]**. Trứng: trò chơi chưa có ấp trứng nên "trứng" nở ngay
thành dạng gốc Lv5 (IV ngẫu nhiên, shiny 1/64). `map` là gợi ý cho luồng bản đồ — các map này chưa có.

| id | Tên | sprite | map | Đội (loài cấp) | ₽ | Vật phẩm | Trứng | Người |
|---|---|---|---|---|---|---|---|---|
| brock | Brock | 27 | pewter_gym | Geodude 12, Onix 14 | 1400 | Super Potion ×5 | Onix | 2 |
| misty | Misty | 181 | cerulean_gym | Staryu 18, Starmie 21 | 2100 | Great Ball ×5 | Staryu | 2 |
| surge | Lt. Surge | 37 | vermilion_gym | Voltorb 21, Pikachu 18, Raichu 24 | 2400 | Hyper Potion ×3 | Pichu | 3 |
| erika | Erika | 36 | celadon_gym | Victreebel 29, Tangela 24, Vileplume 29 | 2900 | Ultra Ball ×5 | Oddish | 3 |
| koga | Koga | 167? | fuchsia_gym | Koffing 37, Muk 39, Koffing 37, Weezing 43 | 4300 | Max Potion ×2 | Koffing | 3 |
| sabrina | Sabrina | 39? | saffron_gym | Kadabra 38, Mr. Mime 37, Venomoth 38, Alakazam 43 | 4300 | Rare Candy ×1 | Abra | 3 |
| blaine | Blaine | 34? | cinnabar_gym | Growlithe 42, Ponyta 40, Rapidash 42, Arcanine 47 | 4700 | Revive ×3 | Growlithe | 3 |
| giovanni | Giovanni | 47 | viridian_gym | Rhyhorn 45, Dugtrio 42, Nidoqueen 44, Nidoking 45, Rhydon 50 | 5000 | Rare Candy ×2 | Rhyhorn | 3 |
| lorelei | Lorelei | 64 | indigo_lorelei | Dewgong 52, Cloyster 51, Slowbro 52, Jynx 54, Lapras 54 | 5400 | Full Restore ×2 | Lapras | 3 |
| bruno | Bruno | 74 | indigo_bruno | Onix 51, Hitmonchan 53, Hitmonlee 53, Onix 54, Machamp 56 | 5600 | Max Revive ×2 | Machop | 3 |
| agatha | Agatha | 9? | indigo_agatha | Gengar 54, Golbat 54, Haunter 53, Arbok 56, Gengar 58 | 5800 | PP Up ×2 | Gastly | 3 |
| lance | Lance | 67 | indigo_lance | Gyarados 56, Dragonair 54, Dragonair 54, Aerodactyl 58, Dragonite 60 | 6000 | Rare Candy ×3 | Dratini | 3 |
| blue | Blue | 46 | indigo_champion | Pidgeot 59, Alakazam 57, Rhydon 59, Gyarados 59, Exeggutor 61, Charizard 63 | 12600 | Master Ball ×1 | Charmander | 3 |

Nhà vô địch dùng biến thể đội khi người chơi chọn Bulbasaur (Blue có Charizard). Trận chung không tăng cấp hay máu boss theo
số người — thêm người là dễ hơn, như PokéOne [ĐỀ XUẤT, chưa cân bằng bằng trận thật].

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
"Đăng lên chợ", HUD "Chợ trời".

Cần luồng khác làm (chưa có):
- **Bản đồ**: đặt NPC boss (sprite theo bảng boss) ở các map gợi ý, lời thoại kết thúc bằng `raid <bossId>` — lệnh này giờ
  hỏi "Đánh một mình / Lập phòng". "Cổng Boss" ở Viridian (nếu giữ) gọi `raid` không id → danh sách boss.
- **Bóc ảnh** (`tools/pro/rip_pro.py`): thêm `npc/sprite` 27, 181, 37, 36, 167, 39, 34, 47, 64, 66, 9, 67 vào danh sách thêm
  (46 đã có). Chưa có thì phòng chờ và danh sách boss hiện icon loài đặc trưng thay mặt huấn luyện viên.

Hợp đồng cảnh trận cho trận chung: `P1.scene.go('battle', { kind:'boss', coop, foe, name, bg, onEnd })`, `coop` = cầu nối của
`raid.js` (`battle: CoopBattle, me, names, intro, turnMs, take(), wait(), over(), request(), ready(n), submit(ô, pick),
status(), leave()`). Trận boss máu chung cũ (`boss:{maxHp, sharedHp, report, ended}`) đã bỏ.

## Kiểm

```
node test/pokeone-engine.js                                  # CoopBattle: 1/2/3 người, điều khiển theo chủ, lockstep, phát lại
node test/pokeone-battle.js                                  # cảnh trận: 1/2/3 ô với cầu nối giả, đánh một mình Brock
node test/pokeone-social.js                                  # mọi phần; ONLY=pure,net,raid2,raid3,market để chạy một phần
PGLITE_PATH=<thư mục có node_modules/@electric-sql/pglite> node test/pokeone-social.js   # thêm phần [sql]
```

Bộ kiểm mạng dùng `?raidturn=12` (đồng hồ lượt 12 s thay cho 30 s) và `?bspeed=4`.

Chu trình chợ đầy đủ trên máy chủ thật (đăng → trả giá → nhận) cần hai tài khoản thành viên hub thật và bảng đã cài; bộ
kiểm tự bỏ qua phần đó khi bảng chưa có. Phần SQL được kiểm trên Postgres WASM với `auth.uid()` giả.

## Bẫy đã sập

- `curl` trong Git Bash máy này không phân giải được `*.supabase.co` (mã 6) trong khi node thì được → thăm dò REST bằng
  `fetch` của node.
- `presence_state` rỗng tới sau `presence_diff` của chính mình → mất người vừa track (xem trên).
- **Presence làm đường truyền lượt**: bản đầu của trận chung để mọi trạng thái trong meta presence; tới lượt thứ ~6 máy chủ
  đóng kênh của chủ phòng mà socket vẫn sống → không lỗi nào hiện ra, thành viên lên làm chủ phòng, nhật ký rẽ nhánh. Chỉ
  lộ ra khi bộ kiểm so HP giữa hai máy. Đo giới hạn bằng hai client node trước khi đổi thiết kế.
- **Chiêu hai lượt ở trận thường** (Skull Bash, Solar Beam, nạp lại…): request lượt sau chỉ còn chiêu đang khoá, nhưng bảng
  chiêu vẫn vẽ 4 nút → bấm nút 4 làm sim từ chối, `commit` ném lỗi và vòng trận chết. Giờ bảng vẽ theo request khi bị khoá
  và lựa chọn bị từ chối thì để Showdown tự chọn (`default`).
- **Máy diễn chậm lỡ phiếu chia đồ**: cửa sổ 20 s neo vào lúc chốt lượt cuối thì máy còn đang diễn tới muộn; neo vào lúc mọi
  người xem xong.
- Nút `<button>` gắn sprite không viền (vd `Button_round_X_normal`) vẫn hiện viền mặc định của trình duyệt → `social.css`
  xoá viền/nền mặc định bằng `:where(...)` (độ ưu tiên 0, sprite 9 mảnh đặt lại viền bằng style inline).
