# Vực Săn: Dave the Diver đối kháng (games/vuc-san)

Yêu cầu chủ dự án 2026-10-08, nguyên văn:

> game mới trên web - dave diver phiên bản pvp:
> - tham khảo https://claude.ai/artifact/MijRP2a5d2ciSY5jJpuJpc (artifact "Depth — phân tích game")
> - chọn mmk giả 1 trong 2 phe cá mập hoặc thợ lặn
> - gacha có banner thợ lặn lẫn cá mập
> - chỉ 1 map random mỗi lần mmk
> - có nhiều loại cá mập với skill khác nhau.
>
> (nhắn thêm) thợ lặn cũng khi ở dưới nước cũng chỉ nên nhìn thấy phía đèn pin soi như repo

Artifact tham khảo không đọc được trong phiên (cần người sở hữu cấp quyền). Thiết kế dựa trên Depth (Digital
Confectioners, 2014): thợ lặn nhặt kho báu và rút lui, cá mập săn họ, người chơi chọn phe. Hình, tiếng, bản đồ, cá mập
lấy từ bản rip Dave the Diver sẵn có trong `games/ho-xanh/`.

## Đích (vị từ kiểm được)

Chỉ coi là xong khi chạy được ở cả 1366×650 lẫn 844×390 (cảm ứng), không có `pageerror`, console error hay response >= 400:

1. Sảnh: chọn phe Thợ Lặn hoặc Cá Mập, mỗi phe một nhân vật đang dùng, bấm TÌM TRẬN.
2. Ghép trận giả: 6 ghế (4 thợ lặn, 2 cá mập) đầy dần bằng tên giả trong 3–12 s, có nút huỷ.
3. Đúng một bản đồ cho trận, bốc ngẫu nhiên từ kho bản đồ, hiện tên trước khi vào.
4. Trận chạy tới kết quả với bot ở cả hai phe: thợ lặn thắng khi nộp đủ chỉ tiêu kho báu, cá mập thắng khi hết giờ hoặc
   hết lượt hồi sinh và mọi thợ lặn đều gục.
5. Thợ lặn chỉ thấy vùng đèn pin soi; vách đá chặn ánh sáng; cá mập ngoài vùng sáng không được vẽ.
6. Gacha có banner thợ lặn và banner cá mập, trừ ngọc trai, đếm bảo hiểm (pity) riêng từng banner, thêm nhân vật vào kho;
   trận sau chọn được nhân vật mới.
7. 12 loài cá mập, mỗi loài một kỹ năng khác nhau; mỗi kỹ năng có một bài kiểm khẳng định hiệu ứng bằng số cụ thể.
8. `node test/vuc-san-*.js` xanh. Đẩy lên Pages và kiểm lại trên Pages chỉ làm khi chủ dự án cho đẩy `main`.

## Nguồn tái dùng (đọc thẳng, không chép)

- `../ho-xanh/` qua `VS.HX_ROOT`: `art/shark/*.glb` (12 loài, có clip bơi, lao, cắn, chết, choáng), `art/level/*.glb`
  + `data/zones.js` (16 bản đồ gốc: vách đa giác, rương O₂, khoang cứu hộ), `art/dave/dave.png` (sheet 61 dòng hoạt ảnh),
  `art/dave/harpoon/*` (6 súng xiên), `art/gear/*` (súng phụ, icon), `art/fx/*`, `audio/*`, `vendor/*` (three r140,
  GLTFLoader, MeshoptDecoder).
- `../biet-doi-lan/art/dtd/loot/*` (44 hình đồ cổ làm kho báu) và `art/dtd/icon/*` (bom mực, mìn, máy tạo O₂, máy đẩy).
- Mã động cơ fork từ `games/ho-xanh/js` (qua bản đã có `HX_ROOT` của `games/biet-doi-lan/js/engine`).
- Khung trận và bot học từ `games/tron-tim` (bảng pha theo `m.t`, máy trạng thái bot, `?manual=1` + `step(n)`).
- Gacha học từ `games/biet-doi-lan/js/meta.js:310-362` (soft/hard pity, pity 4★) và `games/dragonproj` (50/50).

## Hình dạng dữ liệu

Một luật xuyên suốt: **mô phỏng (`js/sim/*`) là JS thuần, không đụng `document`, `THREE`, `window` ngoài `VS`**.
Nhờ vậy cùng một trận chạy được trong trình duyệt và trong Node (`tools/sim.js`) để cân bằng bằng bot đấu bot.
Lớp vẽ (`js/view/*`) chỉ đọc trạng thái mô phỏng mỗi khung và không ghi ngược vào nó.

```
Intent  = { mx, my (-1..1), boost, aimX, aimY (m, toạ độ thế giới), fire, skill, light, interact }
          // người (bàn phím/chuột/cảm ứng) và bot cùng ghi Intent; thân nhân vật chỉ đọc Intent

Actor   = { id, team: 'diver'|'shark', defId, name, ctrl: 'human'|'bot',
            x, y, vx, vy, face, ang, r,
            st, stT,                         // diver: swim|held|down|out ; shark: swim|lunge|hold|stun|out
            o2, o2Max, carry[], carryKg, light,   // chỉ diver
            hp, hpMax, stamina, biteCd, holdId,   // chỉ shark
            skill: { id, cd, t }, effects: [{ kind, until, mag, src }],
            intent: Intent, brain, stats: { banked, downs, outs, dmg, revives } }

Loot    = { id, x, y, art, value, kg, st: 'rest'|'carried'|'banked', by }
Pod     = { x, y, r }            // khoang cứu hộ = chỗ nộp kho báu
O2Box   = { x, y, readyAt }      // chạm thì +O₂, rồi nghỉ
Proj    = { id, owner, team, kind, x, y, vx, vy, life, dmg, fx }
Zone    = { id, kind: 'cage'|'ink'|'mine'|'flare'|'o2gen'|'bait', x, y, r, until, team }

Match   = { seed, rng, mapId, theme, t, phase: 'intro'|'play'|'end', actors[6], loot[], pods[], o2[], projs[], zones[],
            score: { banked, target }, tickets, events[], result: null | { winner, reason } }
```

Bảng đăng ký (mỗi thứ một bảng, không rẽ nhánh rải rác):

- `data/sharks.js` → `VS.SHARKS[id] = { id (= species HX), name, rarity 3|4|5, hp, speed, dash, bite, r, skill, blurb }`
- `data/divers.js` → `VS.DIVERS[id] = { id, name, rarity, o2, speed, gun, dmg, reload, skill, pal, blurb }` (pal: bảng màu đổi áo)
- `js/sim/skills.js` → `VS.SKILLS[id] = { team, cd, dur, start(m,a), update?(m,a,dt), end?(m,a), bot(m,a) → bool }`
- `data/maps.js` → `VS.MAPS[] = { id (= khoá HX_ZONES), name, theme, divers: [x,y][], sharks: [x,y][], lootSpots: [x,y][] }`
  (điểm sinh và chỗ đặt kho báu do `tools/mapgen.js` sinh từ lưới đi được, không đặt tay)
- `data/banners.js` → `VS.BANNERS[] = { id, team, name, rates: { 5, 4 }, soft, hard, pity4, cost, featured: { 5: [], 4: [] } }`
- `data/tuning.js` → `VS.TUNING` (độ dài trận, chỉ tiêu, lượt hồi sinh, O₂, kinh tế, độ khó bot)

Lưu: `localStorage['vs.save.v1'] = { v: 1, name, level, exp, pearls, owned: { diver: { id: stars }, shark: { id: stars } },
pick: { team, diver, shark }, pity: { bannerId: { n5, n4, guar } }, stats }`.

## Luật trận (số mặc định, chỉnh trong `data/tuning.js`)

- 4 thợ lặn đấu 2 cá mập, 240 s chơi sau 4 s mở màn.
- O₂ là máu của thợ lặn (như Dave the Diver): tụt 0,6/s nên bình 100 cạn sau khoảng 167 s, tăng tốc tụt ×2,5,
  cá mập cắn trừ theo loài. Rương O₂ nạp 35, nghỉ 20 s.
  - Bị cắn trúng thì bị ngậm 1,5 s, mất 12 O₂/s. Giãy (đổi chiều trái phải) rút ngắn thời gian ngậm.
    Được nhả ra thì miễn cắn 1,2 s; con cá mập thứ hai không cắn được người đang bị ngậm.
  - O₂ về 0 thì gục 12 s. Đồng đội đứng cạnh đủ 2 s liền (tự động, không cần phím) thì cứu dậy với 35 O₂.
    Cá mập cắn kẻ đang gục thì loại luôn.
  - Bị loại thì rơi hết kho báu đang mang. Sau 7 s hồi sinh, tốn một lượt của đội (mặc định 4 lượt), ở điểm sinh hoặc
    khoang cứu hộ xa cá mập gần nhất nhất. Vừa sinh thì miễn sát thương 3 s (cả cá mập).
- Kho báu: 12–16 món mỗi trận, 40–300 điểm, nặng 2–15 kg. Mang càng nặng bơi càng chậm. Thợ lặn đang bơi chạm khoang
  cứu hộ là nộp. Chỉ tiêu = 60% tổng giá trị kho báu của trận. Kho báu không bao giờ bị huỷ.
- Cá mập không vào được vùng 5 m quanh khoang cứu hộ (chống canh cửa). Cá mập nhanh hơn thợ lặn ở nước trống nhưng to
  hơn, nên khe hẹp là chỗ trú của thợ lặn. Hết máu thì lui 8 s rồi quay lại từ chỗ sinh xa thợ lặn nhất.
- Súng xiên: bấm là bắn về phía con trỏ, nạp lại theo súng, trúng cá mập thì trừ máu và chậm 30% trong 0,5 s
  (hết chậm thì miễn chậm 2 s, để một thợ lặn không thả diều cá mập mãi).
- Choáng, ngủ, bị ngậm hết thì miễn khống chế 2 s. Đang bị ngậm, choáng, ngủ thì không bắn, không dùng kỹ năng.
- Điểm thưởng: thợ lặn 1 điểm mỗi 50 kho báu nộp và mỗi lần cứu; cá mập 1 điểm mỗi thợ lặn hạ gục (công thuộc con
  cuối cùng làm mất O₂ trong 10 s).

## Tầm nhìn đèn pin (theo R.E.P.O.)

- Nguồn sáng: đèn pin mỗi thợ lặn (nón 60°, 13 m, theo hướng ngắm, F để tắt/bật), quầng quanh người 2 m, khoang cứu hộ 5 m,
  rương O₂ 2,5 m, pháo sáng 10 m. Vách đá chặn sáng: mỗi nguồn tính một đa giác nhìn thấy bằng tia bắn vào lưới đoạn vách.
- Đội thợ lặn thấy hợp các vùng sáng. Cá mập và kho báu chỉ hiện khi nằm trong vùng sáng. Địa hình ngoài vùng sáng chỉ
  lờ mờ (độ sáng theo chủ đề bản đồ, 8–18%) để còn tìm đường. Đồng đội luôn hiện, có mũi tên mép màn chỉ khoang cứu hộ
  và đồng đội đang gục; kho báu đã từng được soi thấy thì cả đội nhớ (bot dùng chung trí nhớ này).
- Đội cá mập thấy trong 7 m quanh mình (có che khuất), thấy thợ lặn đang bật đèn trong 18 m nếu không bị vách che
  (đèn là ngọn hải đăng), và thấy thợ lặn dưới 30% O₂ trong 30 m (mùi máu). Cá mập thấy địa hình rõ hơn (35%).
- Bot dùng đúng hàm tầm nhìn đó, nên không bot nào nhìn xuyên tối.
- Vẽ: `js/view/lightmask.js` vẽ vùng thấy được của đội người chơi vào một canvas độ phân giải thấp, pass hậu kỳ nhân
  màu với mặt nạ ấy; đối thủ ngoài vùng thấy được thì ẩn hẳn.

## Bản đồ thư mục và chủ sở hữu tệp

| Nhánh | Tệp | Kiểm |
|---|---|---|
| Khung (agent gốc) | `index.html`, `js/main.js`, `js/core.js`, `data/*.js` (trừ `names.js`), `README.md`, `data/games.js` (chỉ khúc của mình) | `test/vuc-san-smoke.js` |
| W1 mô phỏng | `js/sim/{geom,vision,actors,match}.js`, `js/sim/bots.js` (bản đơn giản), `js/sim/skills.js` (khung + 2 kỹ năng mẫu), `tools/sim.js`, `tools/simlab.html` | `test/vuc-san-sim.js` (Node) |
| W2 lớp vẽ | `js/engine/{gfx,level,fx,audio,shark}.js`, `js/view/{diverSheet,diverView,sharkView,lightmask,view,hud}.js`, `js/input.js` (phím, chuột), `css/hud.css`, `tools/{fakematch.js,viewlab.html}` | `test/vuc-san-view.js` |
| W3 sảnh, ghép trận giả, gacha | `js/meta/{save,gacha,mmk,lobby}.js`, `css/ui.css`, `data/names.js` | `test/vuc-san-meta.js` (Node) + `test/vuc-san-lobby.js` |
| W4 lưới đi + bot (pha 2) | `js/sim/{nav,bots}.js`, `data/maps.js`, `tools/mapgen.js` (điểm sinh, chỗ đặt kho báu, kiểm khoang nối nhau với khoảng trống >= r cá mập lớn nhất) | `test/vuc-san-bots.js` (Node) |
| W5a kỹ năng cá mập (pha 2) | `js/sim/skills-shark.js` (11 kỹ năng), sửa nhỏ `js/sim/{actors,vision,match}.js` nếu thiếu móc | `test/vuc-san-skills-shark.js` (Node) |
| W5b kỹ năng thợ lặn (pha 2) | `js/sim/skills-diver.js` (9 kỹ năng); không sửa lõi sim, thiếu móc thì báo | `test/vuc-san-skills-diver.js` (Node) |
| W6 HUD, cảm ứng, tiếng (pha 2) | `js/view/*`, `js/engine/*`, `js/input.js` (thêm cảm ứng), `css/hud.css` | `test/vuc-san-flow.js` |

## Pha

| Pha | Việc | Vị từ "xong" |
|---|---|---|
| 0 ✅ | Khung: thư mục, `index.html` đủ thẻ script, bảng dữ liệu, `main.js` máy trạng thái màn hình, kiểm khói | trang mở không lỗi, `VS` có đủ bảng, kiểm khói xanh |
| 1 ✅ | Lát cắt dọc: W1 + W2 + W3 song song, ghép ở `main.js` | một trận chơi bằng chuột/phím thật trên 1 bản đồ, đèn pin che tối, bot đơn giản, ra màn kết quả (`test/vuc-san-play.js`) |
| 2 | W4 + W5 + W6 song song, kho 6 bản đồ | 12 kỹ năng cá mập + 10 kỹ năng thợ lặn có kiểm số; bot đi đường không kẹt; cảm ứng chơi được |
| 3 | Cân bằng bằng `tools/sim.js`, đánh bóng, thẻ hub | mỗi phe thắng 40–60% khi bot đấu bot trên mọi bản đồ; toàn bộ kiểm xanh |
| 4 | Đẩy `main`, kiểm trên Pages | chờ chủ dự án cho đẩy |

## Chọn mặc định (sai thì sửa)

- Tên game "Vực Săn", thư mục `games/vuc-san`.
- 4 đấu 2 thay vì 4 đấu 3 của Depth: cá mập trong màn ngang to và mạnh, 2 con đủ tạo áp lực.
- Thợ lặn dùng sheet Dave đổi màu áo (bản gốc chỉ có sprite Dave), tên tiếng Việt, không mượn tên nhân vật DtD.
- Không nối trang chỉnh thông số (`design.html` chỉ phục vụ REPO); số chỉnh nằm ở `data/tuning.js`.
- Một loại tiền: ngọc trai. Bắt đầu với 3200 (hai lần quay 10). Bảo hiểm 5★: tăng dần từ lượt 30, chắc chắn ở lượt 45.
  Quay trùng nhân vật thì đổi ra ngọc trai (3★ 10, 4★ 60, 5★ 400), không có chỉ số theo sao.
- Kho bản đồ: A01, A03N, B01, B02, B04N, B06. Bỏ C03 (khe 1,6 m nhốt cá mập) và A05 (trùng bố cục A01) theo bản soát
  2026-10-08.

## Còn lại sau pha 1 (2026-10-08)

- Ở 844x390, mũi tên mép màn (khoảng cách tới đồng đội, khoang) đè lên thanh điểm trên cùng: việc của W6 HUD.
- Trên SwiftShader 1366x650, mô phỏng chạy khoảng 18% tốc độ thật (khung vẽ chậm, chạm `MAX_STEPS`); bài kiểm đo theo
  `m.t`, chưa đo trên máy có GPU thật.
- `[BẪY ĐÃ SẬP]` Hai nhánh song song đặt class trùng tên (`vs-top`, `vs-toast`, `vs-tag`, `vs-mark`); HUD nay dùng
  tiền tố `vs-hud-`. `getImageData` trên canvas GPU chặn luồng vài giây khi sảnh đang chạy hoạt ảnh; canvas cần đọc
  điểm ảnh phải tạo với `willReadFrequently: true`.
