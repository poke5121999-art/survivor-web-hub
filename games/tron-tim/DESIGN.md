# Trốn Tìm — thiết kế

Dựng lại **Hide And Seek** (Heallios, 2021, game trường cũ của chủ dự án) thành game web 2D nhìn từ trên xuống.
Bản đầu là **solo**: 1 người chơi + 9 bot, chưa có online.

- **Luật chơi, số liệu, UI:** theo game gốc. Nguồn là APK đã bóc ở `D:\phanminhtam-ref` (ngoài git).
  - Luật trong trận: `D:\phanminhtam-ref\notes\gameplay.md`, mỗi số đều có `File.cs:dòng`.
  - Menu, kinh tế: `D:\phanminhtam-ref\notes\meta.md`.
  - UI: `D:\phanminhtam-ref\ui\ui.json` (dump RectTransform), `ui\summary.md`, `ui\sprites\`, `ui\fonts\`.
- **Nhân vật, hoạt ảnh, kỹ năng, VFX, tiếng, hình bản đồ:** lấy từ Soul Knight, qua dữ liệu đã bóc của `games/soulknight`.
  - Cách dùng lại engine SK: `D:\phanminhtam-ref\notes\sk-engine-how.md`.

## Luật không đổi

1. Không sửa một tệp nào trong `games/soulknight/`. Có agent khác đang làm trên đó.
2. Không nạp dữ liệu SK lúc chạy theo đường `../soulknight/`. Mọi thứ đi qua lever trích xuất (mục Lever) ra `games/tron-tim/`.
   Lý do: SK sinh lại dữ liệu thường xuyên, đổi tên khoá là tron-tim hỏng ngầm.
3. Hành động chính (vung vũ khí của người tìm) là **chuột trái, theo hướng chuột**. Không auto aim.
   Kỹ năng là **Space** (cảm ứng: nút kỹ năng). Di chuyển bằng WASD/mũi tên; cảm ứng dùng joystick như game gốc.
4. 1 đơn vị Unity của game gốc = 1 ô SK = 16 px. Tốc độ, bán kính, toạ độ bản đồ giữ nguyên số gốc.

## Lever (công cụ sinh dữ liệu, chạy lại được)

| Lệnh | Đọc | Ghi |
|---|---|---|
| `node games/tron-tim/tools/extract_sk.js` | `games/soulknight/data/*.js`, `art/sk/atlas*.png`, `art/vfx/*`, `art/audio/*` | `data/sk-subset.js`, `art/sk/atlas.png`, `art/vfx/*`, `art/audio/*` |
| `python games/tron-tim/tools/build_ui.py` | `D:\phanminhtam-ref\ui\ui.json`, `ui\sprites`, `ui\fonts` | `data/hs-ui.js` (định dạng `SK_UI` của `ugui.js`), `art/ui/sheet.png`, `art/ui/fonts/*` |
| `python games/tron-tim/tools/build_map.py` | APK đã bóc (`MapRandom1..3`, scene `mapgenerate`) | `data/hs-map.js` |

Mỗi lever ghi kèm danh sách khoá đã chọn. Thiếu khoá nào thì lever báo lỗi và dừng, không im lặng bỏ qua.

## Dạng dữ liệu

### Trận (`js/match.js`) là một máy trạng thái

```
phase: 'intro' -> 'countdown' -> 'playing' -> 'ending'
PHASES = { intro: {dur: 3}, countdown: {dur: 4 + 4}, playing: {}, ending: {} }   // gameplay.md 1.2
```

`playing` tự giữ các mốc con bằng thời gian, không bằng cờ:
- `t < 5`: người tìm đóng giả người trốn và đứng yên; 5 → 6.5 s biến hình; sau 6.5 s đi săn (gameplay.md 1.3).
- Đồng hồ 150 s đếm lùi. Khi còn 15 s, cổng bắt đầu đếm 15 s rồi mở. Sau 0 không có giới hạn giờ (gameplay.md 1.4).

Kết thúc là một trong hai, ghi vào `match.result`:
- `{winner: 'seek'}` khi mọi người trốn còn sống đều đang gục cùng lúc.
- `{winner: 'hide', by: id}` khi một người trốn còn sống chạm cổng đã mở.

### Thực thể (`js/actors.js`)

```
Actor = {
  id, isBot, name, hero,          // hero = khoá nhân vật SK, vd 'assassin'
  role: 'hide' | 'seek',
  life: 'alive' | 'downed' | 'dead' | 'escaped',   // không dùng nhiều cờ boolean
  x, y, face, moving, animT,
  hp,                             // máu vùng an toàn, 5 (bot 6), gameplay.md 4.4
  downedAt, revive: {by, t},      // gục: 60 s chờ cứu, cứu cần đứng yên 3 s
  effects: [{kind, until, mag}],  // speed+, speed-, stun, invisible, reveal, shield...
  skill: {id, cd, t},
  attackCd,                       // 1.5 s người, 2 s bot
  inGrass,
}
```

Tốc độ = `base(role) * Π hệ số của effects`, tính ở MỘT hàm `speedOf(actor)`. Game gốc nhân 9 biến `speedX`
với nhau (Player.cs:379); bản này gom về danh sách `effects`.

### Bản đồ (`data/hs-map.js`)

```
HS_MAP = {
  chunk: {w: 40, h: 30},
  anchors: [[x, y], ...9],                    // toạ độ gốc 9 ô (mapgenerate)
  chunks: { MapRandom1: {items: [{k, x, y, w, h, rot}]}, ... },   // k: wall | grass | table | trash | water | spawn | box
  zone: { first: [{x, y, r}], last: [{x, y, r}] , steps: 5 },
  bounds: {x0, y0, x1, y1},
}
```

Hình vẽ theo bộ ô `forest` của SK: tường = cặp sprite tường SK, `grass` = bụi `wall_bush1` không chặn đường,
`table` = thùng `box0x` (người trốn nhảy qua được), `trash` = `cask_*`, `water` = ô `speed_down`, cổng = `transfer_gate`.

### Kỹ năng (`js/skills.js`) là một bảng

```
SKILLS[id] = { hero, role, cd, dur?, start(m, a), update?(m, a, dt), end?(m, a) }
```

| Vai | Nhân vật SK | Kỹ năng SK | Trong Trốn Tìm |
|---|---|---|---|
| Trốn | assassin | invisibility | Tàng hình 6 s, mờ 0.297, hết khi bị đánh trúng hay dùng kỹ năng |
| Trốn | priest | pray | Hồi máu vùng + tăng tốc đồng đội trong bán kính; cứu đồng đội nhanh gấp đôi khi đang hiệu lực |
| Trốn | ranger | dodge | Lộn né một đoạn, miễn nhiễm trong lúc lộn |
| Trốn | trapmaster | master_s_trick | Đặt búp bê mồi nhử, bot người tìm đuổi theo búp bê; người dùng tàng hình ngắn |
| Tìm | robot | emp | Choáng người trốn trong vùng |
| Tìm | viking | leap | Nhảy qua vật cản, tiếp đất làm choáng xung quanh |
| Tìm | doctor | quantum_translocator | Dịch chuyển tức thời theo hướng chuột |
| Tìm | vampire | alien_swirl | Hố đen hút người trốn vào tâm |

Số hồi chiêu và thời gian lấy từ `SK_SKILLS86` qua lever. Hành vi viết mới theo mô tả trong mã SK, không nạp `skills.js` của SK.

### Bot (`js/bots.js`)

Máy trạng thái theo `CaseBot` của game gốc (Player.cs:16-29): `grass, gate, flee, save, scan, chase, oldPos, wander`.
Nhận biết 4 lần/giây, tầm nhìn 9, không thấy người trong cỏ trừ khi kề sát (gameplay.md 2.4).

## Màn hình

Theo cây UI gốc trong `data/hs-ui.js`, vẽ bằng `js/ugui.js` (chép từ SK):

- `MainMenu`: Quick Play vào trận solo. Nút chưa làm trong bản solo (Join, Create, Friend, Rank, Shop) hiện nhưng mờ.
- `CharMenu`: chọn nhân vật SK cho mỗi vai, đặt trong khung FASHION của game gốc.
- `settingMenu`: nhạc, tiếng, rung.
- HUD trong trận: `TimeUI`, `scanUI`, `AlertZone`, `HideRole`/`SeekRole`, `StartGameUI` 3-2-1-GO, `TextSeekerAppear`,
  `10sOpenDoor (1)`, `ItemSkill/ItemHelp/ItemDead` (bảng tin), `EndGame` Win/Lose, joystick và `ActionBtn`.

## Kiểm

- `test/tron-tim-suite.js` (Playwright): vào thẳng `games/tron-tim/index.html?seed=1`, chơi tự động bằng hook
  `window.TT` (tua thời gian, đặt vai), kiểm từng luật bằng con số. Chụp ảnh menu, HUD, kết trận.
- Xong = đã push và chơi lại trên Pages: `https://poke5121999-art.github.io/survivor-web-hub/games/tron-tim/index.html`.
