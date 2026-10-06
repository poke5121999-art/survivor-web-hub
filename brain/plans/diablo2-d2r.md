# Diablo II Act I trên hub, art + số liệu D2R

Mục tiêu: `games/diablo2/` dựng lại Act I của Diablo II bằng canvas/JS thuần. Mở được từ `file://`, chơi được trên Pages bằng chuột và cảm ứng.

- Chủ dự án chốt 2026-10-06: **dùng bộ asset và config của Diablo II** từ bản D2R ở `D:\Diablo2`. Thay hẳn lựa chọn art Flare ngày 2026-10-01.
- Nguồn: CASC của D2R 3.1.91636, giải nén ở `D:\d2r-ref`, bóc ra `D:\d2r-ref\fs\data\data\{global,local}` (4,6 GB, 37.659 file). Công cụ là `D:\d2r-tools\CASCExplorer\CASCConsole` (đặt `CASC_LIST=1` thì chỉ liệt kê). Danh sách đủ ở `D:\d2r-ref\listing.tsv`.
- Dùng **art 2D cổ** (DCC, DC6, DT1, DS1, palette). Art HD của D2R là mô hình 3D, không dùng.
- Tiếng và nhạc lấy từ `.flac` của D2R (`global/sfx`, `global/music`).
- Số liệu lấy từ `global/excel/*.txt` của D2R 3.1.
- Bộ giải mã: `_tools/d2fmt.py`. Đã thử trên file thật: Amazon ghép đủ lớp theo COF ra 16 hướng, `towne1.ds1` dựng đúng cả doanh trại, không thiếu tile nào.

## Đơn vị và toạ độ

- Đơn vị thế giới là **subtile**. Một tile của D2 rộng 5×5 subtile.
- Chiếu ra màn hình: `sx = (x - y) * 16`, `sy = (x + y) * 8`. Một tile là hình thoi 160×80 px. Vẽ ở tỉ lệ 1:1, canvas 960×540.
- Tốc độ lấy từ bảng D2, tính bằng subtile/giây: `WalkVelocity`, `RunVelocity` trong charstats; `Velocity`, `Run` trong monstats.
- Hướng sprite: `d = 0` là màn hình phía Tây, tăng theo chiều kim đồng hồ, mỗi bước `360/dirs` độ. Bộ build đổi thứ tự hướng của file D2 sang quy ước này (xem `d2fmt.dir_to_compass`).

## Hợp đồng sprite: `assets/sprites.js`, `assets/sprites_obj.js`

```js
window.D2_SPRITES = {            // sprites_obj.js gán vào window.D2_SPRITES_OBJ, cùng dạng
  pages: ['assets/img/mon_zm_0.webp', ...],      // chỉ số trang dùng trong rect[6]
  sheets: {
    // khoá: 'mon.<Code monstats>' | 'npc.<Code>' | 'obj.<token>' | 'mis.<tên missiles.txt>' | 'ovl.<tên>' | 'flp.<invfile>'
    'mon.ZM': { anims: {
      // khoá anim = mã mode D2 viết hoa: NU WL RN A1 A2 GH DT DD SC S1..S4 BL KK TH ... (objects: NU OP ON S1..)
      WL: { dirs: 8, fps: 10.5, frames: 10, hit: -1 /* khung gây sát thương theo animdata, -1 nếu không có */,
            f: [ /* frame */ [ /* dir */ [x, y, w, h, ox, oy, page] ] ] }
    } }
  },
  hero: {                        // nhân vật người chơi vẽ theo lớp, như D2
    cofs: { 'AM.WL.1HT': { layers: ['HD','LA','LG','RA','RH','S1','S2','SH','TR'], wclass: {HD:'1ht',...}, dirs: 16, frames: 8, fps: 25, hit: -1,
                           pri: [ /* dir (đã đổi sang quy ước trên) */ [ /* frame */ 'HD,TR,...' ] ] } },
    // 'hero.<CLS>.<LAYER>.<token>.<wclass>' -> anims theo mode
    layers: { 'AM.TR.LIT.1HT': { WL: { f: [[rect]] }, A1: {...} } }
  }
};
```

- fps lấy từ `animdata.d2`: `fps = 25 * speed / 256`. `hit` là khung có sự kiện tấn công.
- Token mặc định là `LIT`. Đồ mặc đổi token theo cột `alternategfx` (vũ khí, khiên, mũ) và các cột `Tr Lg Rs Ls Ss` (0/1/2 → lit/med/hvy) của armor.txt.

## Hợp đồng thế giới: `assets/world.js`, `assets/maps.js`

```js
window.D2_WORLD = { tilesets: { 'act1': {
  pages: ['assets/img/tiles_act1_0.webp', ...],
  // khoá 'o_s_q' = orientation_style(main_index)_sequence(sub_index); mỗi biến thể một mảng
  tiles: { '0_1_3': [[x, y, w, h, yMin, rarity, page, flagsIdx], ...] },
  flags: [ /* flagsIdx -> 25 số, cờ subtile của DT1: bit0 chặn đi, bit1 chặn tầm nhìn, bit2 chặn nhảy, bit3 chặn người chơi, bit5 ánh sáng */ ],
  palette: 'act1'
} } };
window.D2_MAPS = {               // mỗi DS1 cần dùng
  'act1/town/towne1': { w, h, floors: [[...]], walls: [{ t: [...], o: [...] }], shadows: [[...]],
                        // t[i] = style<<8 | sequence (0 = trống/ẩn), o[i] = orientation; i = y*w + x
                        objects: [{ type: 1|2, id, x, y }] },
  ...
};
window.D2_PRESETS = { /* LvlPrest rút gọn: def -> { name, files: ['act1/outdoors/bord1', ...], sizeX, sizeY, outdoors } */ };
```

Cách vẽ một tile, theo `OpenDiablo2 d2maprenderer`. Toạ độ tile `(tx, ty)` ra màn hình `px = (tx - ty) * 80`, `py = (tx + ty) * 40`. Ảnh của biến thể vẽ ở `(px - 80, py + dy)`:

| Loại | `dy` |
|---|---|
| sàn (orientation 0) | `yMin` |
| bóng (13) | `yMin + 80`, độ mờ 160/255 |
| tường (1..14) | `yMin + 80`. Orientation 3 vẽ thêm ảnh orientation 4 cùng style và sequence |
| mái (15) | `-roofHeight + yMin` |

Thứ tự vẽ:
1. Tường thấp (16..19), sàn, bóng.
2. Tường 1..14 (trừ 10, 11, 13) xen kẽ với thực thể, theo hàng tile.
3. Mái.

Biến thể chọn theo `rarity` với seed `(tx, ty)`. Cờ subtile của mọi lớp trong tile OR lại với nhau. Thứ tự subtile trong DT1 là từ dưới lên (`map_tile.go` subtileLookup).

## Hợp đồng `D2G` (js/drlg.js)

```js
D2G.build(areaId, seed) -> Level
// Level = { id, tw, th /* số tile */, w: tw*5, h: th*5 /* subtile */, tileset: 'act1',
//   floors: [Int32Array(tw*th)], walls: [{ t: Int32Array, o: Uint8Array }], shadows: [Int32Array],  // t = style<<8|seq, đã chọn biến thể: t | variant<<16
//   col: Uint8Array(w*h)  /* 0 đi được, 1 chặn đi, 2 chặn đi nhưng nhìn xuyên (nước) */,
//   hero: [x, y], exits: [{ x, y, to }], spawns: [{ x, y, n, kind }], npcs: [{ id, x, y }], objects: [{ token, x, y, kind }] }
```

- Doanh trại: chọn một trong các DS1 `Act 1 - Town 1` (LvlPrest def 1). Lối ra Blood Moor ở mép hở.
- Blood Moor: ghép như `OpenDiablo2 act1_overworld.go`. Viền cây là các stamp 8×8 (def 4..15), stamp lấp đầy chọn ngẫu nhiên (đá, nhà, trại Fallen, ao, đầm), cửa Den of Evil là def 52. Kích thước theo Levels.txt (80×80 tile).
- Den of Evil: mê cung phòng 24×24 tile (LvlPrest def 53..98, LvlMaze `Act 1 - Cave 1`). Phòng vào là `Prev`, phòng đặc biệt là `Den Of Evil`.

## Ai làm gì

| Phần | Tệp | Người làm |
|---|---|---|
| Bộ giải mã + bộ đóng gói | `_tools/d2fmt.py`, `_tools/d2pack.py` | xong |
| Sprite nhân vật, quái, NPC | `_tools/build_sprites.py` → `assets/sprites.js`, `assets/img/{hero,mon,npc}_*` | agent A |
| Vật thể, đạn, overlay, đồ rơi | `_tools/build_objects.py` → `assets/sprites_obj.js`, `assets/img/{obj,mis,ovl,flp}_*` | agent B |
| Tile + DS1 + bộ sinh bản đồ | `_tools/build_world.py` → `assets/world.js`, `assets/maps.js`; `js/drlg.js`; `test/diablo2-drlg.js` | agent C |
| Số liệu từ excel D2R | `_tools/build_data.py` → `js/data.js`; `test/diablo2-rules.js` | agent E |
| UI, icon đồ, tiếng, nhạc | `_tools/build_ui.py` → `assets/ui.js`, `assets/img/ui_*`, `assets/sfx/`, `assets/music/` | agent F |
| Engine vẽ, ghép vào game | `js/engine.js`, `js/game.js`, `js/ui.js`, `index.html`, `test/diablo2-suite.js` | điều phối |

Ngân sách: tối đa 60 MB cho cả game. Cả site tối đa 1 GB.

## Rủi ro

- Art và tiếng thuộc bản quyền Blizzard, lấy từ một bản crack. Hub đăng công khai trên Pages, nên có thể bị gửi yêu cầu gỡ bản quyền (DMCA). Chủ dự án đã yêu cầu dùng bộ này.
