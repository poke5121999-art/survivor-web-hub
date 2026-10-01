# Diablo II Act I trên hub, art Flare

Mục tiêu: `games/diablo2/` là bản làm lại Act I của Diablo II (Doanh trại Rogue, Blood Moor, Den of Evil) bằng canvas/JS thuần, mở được từ `file://`, chơi được trên Pages cả bằng chuột lẫn cảm ứng.

- Không dùng tệp nào của Blizzard. Engine D2 nguồn mở (OpenDiablo2, Abyss Engine, Diablerie) đều cần MPQ gốc, không kèm art.
- Chủ dự án chốt (2026-10-01): **chỉ lấy art và tiếng của Flare**. Bản đồ, nhân vật, kỹ năng, cơ chế phải giống Diablo II gốc.
  - Doanh trại Rogue dựng theo bố cục cố định của bản gốc. Blood Moor và Den of Evil sinh ngẫu nhiên mỗi lần vào, như DRLG của D2.
  - Không dùng bản đồ Flare để chơi. Bản đồ Flare chỉ là dữ liệu để học bảng autotile (ô tường nào đặt cạnh ô nào).
- Art, tiếng lấy từ Flare: Empyrean Campaign (`D:\flare-ref`, sparse clone `mods/` của github.com/flareteam/flare-game), CC-BY-SA 3.0. Ghi công ở `games/diablo2/CREDITS.md`.
- Luật chơi lấy theo số liệu D2 công khai (Arreat Summit, các bảng `.txt` 1.10+ được cộng đồng chép lại). Ghi nguồn trong `js/data.js`.
- Ngân sách: cả site 661 MB / trần 1 GB của Pages [ĐO TRONG REPO, 2026-10-01]. Game này ≤ 35 MB.

## Bố cục tệp

| Tệp | Chủ | Nội dung |
|---|---|---|
| `_tools/build_assets.py` | A | Đọc `D:\flare-ref`, thu ½, đóng WebP, xuất `assets/manifest.js` |
| `assets/` | A (sinh ra) | `manifest.js`, `img/`, `sfx/`, `music/` |
| `CREDITS.md` | A | Ghi công Flare theo CC-BY-SA |
| `js/data.js` | C | `window.D2DATA`: lớp nhân vật, kỹ năng, quái, khu vực, đồ, affix, bảng XP |
| `js/rules.js` | C | `window.D2R`: hàm thuần, không đụng DOM/canvas |
| `test/diablo2-rules.js` | C | `node` chạy thẳng, không trình duyệt |
| `index.html`, `js/engine.js`, `js/input.js`, `js/game.js`, `js/ui.js` | B | Vẽ isometric, hoạt ảnh, điều khiển, vòng lặp, AI, HUD |
| `test/diablo2-suite.js` | B | Playwright, như `test/dragonproj-suite.js` |

## Hợp đồng `assets/manifest.js`

Nạp bằng `<script>` (không fetch JSON, vì `file://` chặn). Mọi toạ độ đã nhân `scale`.

```js
window.D2_ASSETS = {
  scale: 0.5,
  dirs: "<chiều của hướng 0..7 trong Flare, đọc từ mã flare-engine>",
  sheets: {
    // khoá: 'enemy.<tên>', 'avatar.<female|male>.<lớp>', 'power.<tên>', 'loot.<tên>', 'npc.<tên>'
    'enemy.zombie': {
      img: 'assets/img/enemy_zombie.webp',
      anims: {
        stance: { frames: 4, dur: 533, type: 'back_forth' /* | 'looped' | 'play_once' */,
                  f: [ /* frame */ [ /* dir 0..7 */ [x, y, w, h, ox, oy] ] ] },
        run: {...}, swing: {...}, hit: {...}, die: {...} /* , critdie, cast, shoot, spawn... nếu có */
      }
    }
  },
  avatarLayers: { order: [ /* dir 0..7 */ ['feet','legs','hands','chest','head','main','off'] ] },
  tilesets: { grassland: { img, tiles: { /* id */ 16: [x, y, w, h, ox, oy] } }, cave: {...} },
  // Học từ bản đồ Flare: với mỗi ô bị chặn, mặt nạ 8 hàng xóm (bit 0 = N, theo chiều kim đồng hồ, trên lưới ô) -> tile của lớp obj.
  autotile: {
    grassland: { floor: [[id, weight]], deco: [[id, weight]] /* vật trang trí không chặn */,
                 blockers: [[id, weight]] /* cây, đá chiếm 1 ô */, walls: { /* mask */ 255: [[id, weight]] } },
    cave: {...}, dungeon: {...}
  },
  icons: { img, cell, cols, count },
  sfx: { 'zombie_hit': 'assets/sfx/zombie_hit.ogg' },
  music: { town: '...', overworld: '...', cave: '...' }
};
```

## Hợp đồng `D2G` (drlg.js)

```js
D2G.build(areaId, seed) -> Grid
// Grid = { id, w, h, tileW, tileH, tileset, bg: Int32Array, obj: Int32Array, col: Uint8Array /* 0 đi, 1 tường, 2 nước/hố */,
//          hero: [x, y], spawns: [{ x, y, n, kind }], exits: [{ x, y, to }], npcs: [{ id, x, y }], objects: [{ type, x, y }] }
```
Toạ độ là ô lưới. Màn hình: `sx = (x - y) * tileW/2`, `sy = (x + y) * tileH/2`.

## Hợp đồng `D2R` (rules.js)

```js
D2R.rng(seed) -> () => [0,1)
D2R.newCharacter(classId, name) -> Char
// Char = { cls, name, lvl, xp, str, dex, vit, ene, statPts, skillPts,
//          skills: { [skillId]: slvl }, hp, mp, gold, inv: Item[], equip: { [slot]: Item }, belt: Item[], quests: {} }
D2R.derived(char) -> { maxHp, maxMp, ar, def, dmgMin, dmgMax, atkFrames, walk, run, block,
                       res: { fire, cold, light, poison }, hpRegen, mpRegen }
D2R.hitChance(ar, alvl, def, dlvl) -> 0.05..0.95
D2R.rollMonster(monId, areaLvl, rng, kind /* 'normal'|'champion'|'unique' */) -> MonsterInst
D2R.grantXp(char, monLvl, baseXp) -> { gained, leveled }
D2R.skillEffect(skillId, slvl, char) -> { mana, kind: 'missile'|'melee'|'nova'|'buff'|'aura'|'summon',
                                          dmg: { min, max, elem }, speed, pierce, count, radius, duration, art }
D2R.rollDrop(monId, mlvl, rng) -> Item[]
D2R.itemName(item), D2R.itemStats(item)
// Item = { base, ilvl, q: 'normal'|'magic'|'rare'|'unique'|'set', affixes: [{ stat, val }], w, h, icon }
```

`D2DATA.areas`: `{ id, name, act, lvl, size: [w, h], layout: 'preset'|'outdoor'|'cave', tileset, monsters: [monId], density, town, music, quest, exits }`. Doanh trại có thêm `preset` (lưới chữ mô tả hàng rào, lửa trại, chỗ đứng NPC, rương, waypoint). Ba khu đầu: `rogue_encampment`, `blood_moor`, `den_of_evil`.
`D2DATA.monsters[id].art` trỏ vào khoá `sheets` (`'enemy.zombie'`).

## Thứ tự

1. A, B, C, D chạy song song trên tệp tách rời. B viết theo hợp đồng trên, kiểm hình khi manifest có.
2. Ghép, chạy `test/diablo2-rules.js` và `test/diablo2-suite.js`.
3. Thêm mục vào `data/games.js` (tệp đang có sửa dở của agent khác, chỉ stage khúc của mình), push, chơi thử trên Pages.
4. Sau MVP: Cold Plains, Burial Grounds (Blood Raven), bốn lớp còn lại, waypoint, rương đồ.

## Trạng thái 2026-10-01

- MVP đã lên Pages ở rev `20261001d` (commit `0b9920db`, `e76d1b07`). Bộ kiểm trên Pages 78/78, một lần trượt "đi về thị trấn" không tái hiện được (13/13 lần đạt); test giờ in vết đường đi khi trượt.
- Việc tiếp:
  - Doanh trại đúng kích thước (140×100 ô) nhưng trống: thiếu lều to, hàng rào trong, thùng, đuốc, lính gác Rogue. Cần preset dày hơn và đồ vật nhiều ô.
  - Vách đá Blood Moor có vài tile gỗ lạc chỗ do bảng autotile học từ bản đồ Flare.
  - Amazon cầm javelin nhưng vẽ bằng gậy (Flare không có giáo).
  - Cold Plains, Burial Grounds + Blood Raven, lính đánh thuê, curse/summon/Leap.
