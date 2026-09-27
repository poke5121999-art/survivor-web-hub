# PokéOne (bản web) — kiến trúc và hợp đồng dữ liệu

Dựng lại phần đầu game PokéOne (MMO Pokémon 3D, Unity 2018.4.36, IL2CPP) thành game một
người chơi trên hub. Art, anim, VFX, tiếng, bố cục UI và dữ liệu lấy thẳng từ bản cài
`p1setup.exe` theo yêu cầu của chủ dự án (2026-09-27). Luật chơi và nội dung map lấy từ
wiki (`D:\pokeone-ref\wiki\RESEARCH.md`, có dẫn nguồn từng dòng).

## Nguồn gốc [ĐO TRONG REPO, 2026-09-27]

- Bản cài: Inno Setup 6.1. `innoextract 1.9` vẫn bóc được dù chỉ ghi hỗ trợ tới 6.0.5.
  Bóc ra `D:\pokeone-ref\extract\app\files\PokeOne_Data`.
- `StreamingAssets/*` là AssetBundle UnityFS **không mã hoá**:
  - `pdata1..12`: 1.151 model Pokémon 3D (`pokes<N>/<modelId>/model.prefab`), clip legacy đặt tên theo số (`0.anim`, `1.anim`, `3.anim`…), 60 fps.
  - `mdata..mdata7`: prefab bản đồ 3D (`mapassets*/modelprefabs/*.prefab`).
  - `sdata`: sprite người chơi nhiều lớp (`player/body_*`, `clothe_*`, `hair_*`, `hats`, `mounts`) và `npc/spriteN.png`. Mỗi tấm 256×256, lưới 4×4 ô 64px, dùng 3 cột × 4 hàng.
  - `psdata`: `big` (128), `small64`, `small64shiny`, `small` (32), `follow`, `follows` (đi theo).
  - `idata`: icon vật phẩm 32px theo `ItemImage`.
  - `adata*`: nhạc; `cdata`: 805 tiếng kêu `crys/<dex>.wav`.
  - `fdata`: model Pokémon bay (thú cưỡi) — không dùng.
- `resources.assets` có TextAsset JSON: `pokemon`, `moves`, `items`, `learnsets` (định dạng Showdown), `typechart`, `pokemonmodels` (dex → `MaleID`/`FemaleID`/`MegaID` = số thư mục model), `shinysettings`.
- `sharedassets0`: `GUIAtlas` (NGUI, 2048×1024, 415 sprite).
- `sharedassets1`: 40 tiếng hiệu ứng (`Attack_Hit_Damage`, `ballshake`, `Level Up`…), font NGUI.
- `sharedassets2`: `BattleAnimator` + 9 `NewBattleAnimation` (anim chung: thả bóng, ngất, đổi Pokémon…), 10 atlas VFX chiêu thức, hiệu ứng bắt cho 25 loại bóng (`CatchEffect`), `Default Hit`, `Shiny Sparkle`, `Dust Effect`, nền trận `btl_G_*`.
- `level1` = màn đăng nhập (đảo có Pokémon Center, cọ, cầu tàu). `level2` = màn chơi (toàn bộ cây UI NGUI).
- **Đi theo ô, không đi tự do** (wiki ghi "3D" nhưng mã cho thấy lưới): `MapUserPosition` là số nguyên X/Y/Height; `CharacterHandler` có `CurrentX/CurrentY`, `CheckJump` (gờ), `LineOfSight` (trainer nhìn thấy), `FollowPokemon`. Map gốc là `MapDump`: hai lớp loại ô, độ cao ô, tường, va chạm, nước, vùng gặp, cửa nối, NPC, prefab đặt theo toạ độ nguyên. 1 ô = 1 đơn vị Unity.
- **glb bản đồ đảo trục X, không đảo Z** (tools/README-map.md): nhà PokéOne chỉ có mặt tiền quay về +Z, máy ảnh chơi đứng ở +Z nhìn về -Z. Model Pokémon vẫn nhìn về +Z.
- **Bản đồ không có trong bản cài.** Lớp `MapDump`/`Settings` trong mã cho thấy server gửi map. Map ở đây dựng tay từ prefab gốc.
- Máy chủ trận dùng **Pokémon Showdown**: có lớp `BattleRequest`, `BattleActive`, học chiêu dạng Showdown. Vì vậy trận ở đây chạy `@pkmn/sim` (bản JS của Showdown), luật Gen 7.

### Đọc MonoBehaviour (bản IL2CPP không kèm typetree)

1. `Il2CppDumper-x86.exe` (GameAssembly.dll là 32 bit, bản x64 báo lỗi) → `D:\pokeone-ref\il2cpp\` có `DummyDll/`, `dump.cs`, `stringliteral.json`.
2. `TypeTreeGeneratorAPI` nạp `DummyDll` (nạp thẳng il2cpp thì hỏng: "failed to load il2cpp").
3. **Bẫy đã sập:** `m_Script` đọc qua typetree lệch 3 byte (ra `m_FileID` 16777216). Đọc tay từ byte thô: `fileID` ở offset 16, `pathID` ở 20, rồi tra MonoScript trong mọi tệp đã nạp chung. Mã ở `tools/ttg.py`.

## Bố cục thư mục

```
games/pokeone/
  index.html            nạp vendor + js theo thứ tự, gắn ?v=<rev>
  vendor/               three r140, GLTFLoader, meshopt, pkmn-sim (Showdown, esbuild iife)
  tools/                công cụ bóc (python 3.8 + UnityPy 1.25), chạy lại ra cùng kết quả
  art/  audio/          đầu ra của tools, không sửa tay
  data/                 *.js đặt biến toàn cục (mở được qua <script>, không fetch JSON)
  js/                   mã game
```

## Hợp đồng dữ liệu (đầu ra của tools → mã game)

Mọi tệp `data/*.js` gán vào `window.P1` (đối tượng chung). Đường dẫn tương đối với `games/pokeone/`.

### `data/pokes.js` — model Pokémon (tools/rip_poke.py)

```js
P1.POKES = {
  1: { glb: 'art/poke/1.glb', scale: 1, height: 0.71,       // chiều cao AABB tư thế nghỉ, đơn vị Unity
       clips: { idle: 'a0', ... },                          // vai trò → tên clip trong glb
       shiny: { 'pm0001_00_bodya1': 'art/poke/shiny/1/pm0001_00_bodya1.png', ... } },
}
```

- Tên clip trong glb là `a<số gốc>` (`a0`, `a1`, `a3`…). Bảng vai trò → số lấy từ mã gốc, ghi nguồn trong `tools/README.md`.
- Vai trò tối thiểu: `idle`, `attack` (vật lý), `special`, `hit`, `faint`. Thiếu clip thì bỏ khoá đó, mã game tự rơi về `idle`.

### `data/props.js` — prefab bản đồ (tools/rip_map.py)

```js
P1.PROPS = { 'ext_house_pallettown_1': { glb: 'art/map/ext_house_pallettown_1.glb',
             min: [x,y,z], max: [x,y,z] }, ... }                 // AABB đơn vị Unity, gốc là pivot prefab
P1.TITLE_SCENE = { glb: 'art/title/island.glb', camera: { pos:[..], rot:[..], fov } }
```

### `data/atlas.js` — atlas NGUI (tools/rip_ui.py)

```js
P1.ATLAS = { GUIAtlas: { img: 'art/ui/GUIAtlas.png', w: 2048, h: 1024,
             s: { '12_Pokedollar': [x, y, w, h, bl, br, bt, bb, pl, pr, pt, pb], ... } },
             fx_fire: {...}, ... }
```

- `x, y` tính từ góc trên-trái ảnh (như NGUI). `b*` = viền 9-slice, `p*` = padding.

### `data/ui.js` — cây UI NGUI của `level2` (tools/rip_ui.py)

Cây theo `Transform`, mỗi nút: `{ n: tên, p: [x,y], s: [sx,sy], a: active, w: {kind:'sprite'|'label'|'texture'|'widget', atlas, sprite, type:'simple'|'sliced'|'tiled'|'filled', size:[w,h], pivot, depth, color:'#rrggbbaa', text, font, fontSize, align }, c: [con] }`.
Kèm `P1.UI_ROOT = { manualHeight, ... }` để biết tỉ lệ.

### `data/sprites.js`, `data/audio.js`, `data/gamedata.js` (tools/rip_2d.py, rip_audio.py)

```js
P1.PLAYER_PARTS = { body_male: ['00_00', ...], clothe_male: [...], hair_male: [...], hats: [...] }  // tên tệp không đuôi, dạng <kiểu>_<màu>
P1.SFX = { hit: 'audio/sfx/Attack_Hit_Damage.ogg', ... }   // khoá tiếng Anh gốc giữ nguyên tên clip
P1.MUSIC = { pallet_town: 'audio/music/pallet_town.ogg', ... }
P1.SPECIES = { 1: { name, types:[..], desc, height, weight, catchRate, baseExp, expRate, evs:{..}, genderM }, ... }  // từ pokemon.txt
P1.ITEMS = { 4: { name, battleId, desc, pocket, img: 'art/item/5.png' }, ... }
```

- Sprite: `art/sprite/<nhóm>/<tên>.png` giữ nguyên tấm 256×256. Hàng 0 = quay lưng (lên), 1 = trái, 2 = mặt (xuống), 3 = phải; 3 cột = khung bước. Hậu tố `_1/_2/_4/_5` của thân là các tư thế (đi/chạy/xe/lướt — xác minh trong README).
- Tiếng kêu: `audio/cry/<dex>.ogg`. Nhạc `.ogg`.

## Mã game

- `js/core.js` — `P1.state` (dữ liệu lưu), `P1.save()/load()`, `P1.settings`, `P1.input`, `P1.audio`, vòng lặp và bộ chuyển cảnh (`P1.scene.go(name, args)`).
- `js/ngui.js` — vẽ nút NGUI bằng DOM: sprite sliced = `border-image` từ atlas, label = chữ.
- `js/world.js` — bản đồ 3D theo lưới ô (định dạng như `MapDump`), đi theo ô 4 hướng, camera nghiêng cố định bám người chơi, NPC, cỏ cao, cửa.
- `js/battle.js` — `@pkmn/sim` chạy trận; đọc từng dòng giao thức Showdown (`|move|`, `|-damage|`, `|faint|`…) thành hàng sự kiện; bảng `DIRECTOR[lệnh]` diễn từng sự kiện (anim model, VFX, thanh máu, chữ, tiếng).
- `js/menu.js` — túi, đội, Pokédex, thẻ, cài đặt, lưu.

Trạng thái cảnh là một máy trạng thái: `title → creator → world ⇄ battle`, trong `world` có con `explore | dialog | menu | warp`.
