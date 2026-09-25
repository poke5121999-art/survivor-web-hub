# tools/ — bóc dữ liệu + asset Void Diver

Tự chứa: chỉ cần bản Steam cài ở `VD_DATA` (mặc định
`D:/Steam/steamapps/common/VOID DIVER Escape from the Abyss Demo/VOID DIVER_Data`). Không phụ
thuộc `vd-ref/` của agent trước — chỉ dùng `vd-ref/` để tham khảo tài liệu (ASSETS.md/SYSTEMS.md)
lúc thiết kế, không import gì từ đó lúc chạy.

## Chạy lại từ đầu

```
set PYTHONIOENCODING=utf-8
cd games/voiddiver/tools
python build_data.py      # -> data/tables.js, text.js, lua.js, tools/manifest.json
python rip.py spine        # -> art/spine/<Tên>/ (4 nhân vật + quái trong manifest)
python rip.py sector       # -> art/sector/<id>.glb + .json + tex/*.webp
python rip.py audio        # -> audio/sfx/*.mp3, audio/bgm/*.mp3
python rip.py ui           # -> art/ui/icon_*/*.webp (toàn bộ icon, Item/Equipment/Talent... là bảng full)
python build_units.py      # -> tools/units.json (spine+skin+kích thước nhân vật/quái) + bốc spine còn thiếu
python rip.py portrait     # -> art/ui/portrait/*.webp
python rip.py dialogimage  # -> art/ui/dialogimage/*.webp
python build_assets.py     # -> data/assets.js (quét art/, audio/ đã bốc)
node smoke.js               # kiểm chứng bằng Playwright (cần http server tại repo root, xem dưới)
```

`rip.py all` chạy spine+sector+audio+ui+portrait+dialogimage liên tiếp (không có build_units xen giữa —
chạy `build_units.py` riêng sau `rip.py spine` nếu muốn spine NPC/quái đầy đủ).

Cache trung gian của `rip.py`/`build_units.py` (bundle_index, unit_map) nằm ở
`%TEMP%/voiddiver-rip/` — xoá để ép quét lại bundle (chậm, ~1-2 phút lần đầu).

## Giải mã

- `StreamingAssets/TableEncrypted/<Tên>.bytes` = CSV **XOR 0xCC** (trừ `LocalizedText.csv`,
  `BannedWord.csv` — 2 file này đã là CSV thường, không mã hoá). **`[ĐO]`**
- `StreamingAssets/LuaEncrypted/**/<tên>.bytes` = script Lua **XOR 0xF4**. **`[ĐO]`**
- Việc giải mã diễn ra thẳng từ Steam install trong `build_data.py:decrypt_table_csv/decrypt_lua`,
  không có bước trung gian.

## Phạm vi lọc (xem ARCH.md "Phạm vi")

`build_data.py` lọc `VD.T`:
- **Bảng đầy đủ** (không lọc, dán nguyên): danh sách `FULL_TABLES` trong file — gồm mọi bảng nhỏ
  (Const, Campaign, Npc, Item, Equipment, Talent, Crafting, ShopProduct, ArtifactDeal*, Shield,
  ExtraUnit, ...).
- **Bảng lọc theo phạm vi**: `Character` (4 nhân vật chơi được), `Sector` (sector dùng bởi
  campaign 1100/1101/1102/101-108 + sảnh 9001-9003), `Monster`, `Skill`, `HitBox`, `Buff`
  (đóng bao bắc cầu — xem dưới), `DropRewardProbability` (chỉ dòng có `DropRewardId` dùng bởi
  `RewardBox`/`MonsterSpawn`/`Monster.DropRewardGroupId` đã có trong scope).

### Đóng bao Skill/HitBox/Buff/Monster — bẫy đã sập

Lần đầu dùng cách dò theo **tên field** (`HitBoxId`, `BuffId`, `MonsterId`) để đi theo tham chiếu
chéo trong JSON lồng nhau (`RootActionNode`, `HitBoxInfo`, `BuffEffects`). **Sai**: nhiều sự kiện
tham chiếu id qua field tên **`Id`** trơn (`HitBoxEvent.Id`, `BuffActionEvent.Id`), không phải
`HitBoxId`/`BuffId` — bỏ sót `HitBox 100100001` (chiêu đánh thường đầu tiên của Gayoung!), combo
chạy nhưng không ra đòn.

Cách đúng (hiện tại): quét **mọi số nguyên** xuất hiện ở bất kỳ đâu trong các dòng Skill/HitBox/
Buff/Monster/Character đã có (kể cả field kiểu `"100104002"` dạng chuỗi số), coi mỗi số đó là ứng
viên Id, rồi nhận vào bất kỳ dòng Skill/HitBox/Buff/Monster nào khớp — lặp tới điểm dừng (fixed
point). Có hạt giống thêm từ các bảng phụ đã đầy đủ (Talent, Equipment, SpecialField, Trap,
Anomaly, Corruption, Stress, BuffVfx — chúng có thể tham chiếu thêm Skill/HitBox/Buff/Monster).
Rủi ro trùng số ngẫu nhiên (một chỉ số như `Def: 2` trùng `Buff.Id 2`) chỉ làm **phình thêm** dữ
liệu (vô hại), không làm **thiếu** — ưu tiên đúng hơn gọn.

**Bẫy thứ 2** trong chính bản viết lại này: hàm quét số nguyên đầu tiên chỉ cộng số khi nó là
**giá trị của một key trong dict** (`{"Id": 5}` → bắt được 5), còn số nằm trần trong **mảng**
(`"ActiveSkillIds": [20001073]`) thì bỏ qua luôn — vì đệ quy vào phần tử mảng gọi lại hàm với
`o = 20001073` (int trần), mà hàm không có nhánh xử lý input là int trần, chỉ xử lý dict/list.
Hậu quả: bộ đóng bao gần như không lấy được skill nào của quái (63/502 dòng Skill), một loạt quái
"không khởi động" được skill trong test. Sửa: hàm đệ quy kiểm tra kiểu của chính tham số đầu vào
trước (`int`→thêm, `str` số→thêm, `dict`→duyệt values, `list`→duyệt phần tử), không chỉ kiểm tra
khi nó là **value của key**.

**Bẫy thứ 3**: hạt giống ban đầu cho `seed_ints` chỉ chọn tay 9 bảng phụ ("có vẻ liên quan":
Talent, Equipment, SpecialField, Trap, Anomaly, Corruption, Stress, BuffVfx) — bỏ sót
**`ExtraUnit`** (skill "bánh quy" giả trang của Mio, `10011310..10011334`, nằm trong
`ExtraUnit.ActiveSkillIds`/`PassiveSkillIds`, không phải trong bất kỳ Skill/HitBox/Buff/Monster
nào đã có) và kéo theo cả chuỗi quái/skill/hitbox mà "bánh quy" triệu hồi. Sửa: quét **toàn bộ**
`FULL_TABLES` (mọi bảng đã dán nguyên vào `T`) làm hạt giống, không đoán tay bảng nào "chắc liên
quan" — cùng triết lý "thà thừa còn hơn thiếu" như bẫy 1.

**Bẫy thứ 4**: `Monster.BasePhaseMonsterId` chỉ trỏ **một chiều** (quái pha 2/3 → quái pha gốc);
quét số nguyên thường tìm được quái GỐC từ một quái pha đã có, nhưng KHÔNG tìm được các **quái
pha anh em khác** (cùng `BasePhaseMonsterId` nhưng Id khác) vì không có tham chiếu xuôi nào ghi
sẵn chuyện đó. Sửa: gom nhóm riêng `phase_siblings[BasePhaseMonsterId] = {tất cả Id cùng pha gốc
đó}` một lần, rồi mỗi vòng lặp thêm toàn bộ anh em pha của mọi quái đang có trong scope.

**Kiểm chứng bắt buộc** sau khi sửa bộ đóng bao — cả 2 lệnh, không chỉ 1:
- `VD_DATA=tables node test/voiddiver-combat.js` → `81 pass, 0 fail` (khớp
  `node test/voiddiver-combat.js` không đặt `VD_DATA`).
- `VD_DATA=tables node test/voiddiver-ai.js` → mục `[10]` (đối chiếu độc lập với JSON gốc đầy đủ
  ở `~/Downloads/vd-ref/json`, không phụ thuộc logic đóng bao của `build_data.py`) phải ra
  **`thiếu 0`** cho cả Skill/HitBox/Buff/Monster/ExtraUnit.
Không tự suy luận "chắc đúng rồi" — chạy thật cả hai, đối chiếu số.

### Thu gọn Skill/HitBox/Buff (giảm dung lượng)

`minify_tree()` trong `build_data.py` áp cho `RootActionNode`/`HitBoxInfo`/`BuffEffects`:
- Bỏ hẳn field `text`/`Text`/`TypeAndText`/`UniqueId` — đây là **ghi chú tiếng Hàn cho người thiết
  kế xem trong Unity Inspector** (vd `"text":"설명 없음"` = "không có mô tả"), **không phải** khoá
  dịch hay text hiển thị trong game — `<Key:...>`/tên khoá LocalizedText đi đường khác hoàn toàn.
  **`[ĐO]`** bằng cách in ra 40 dòng đầu `Skill.RootActionNode` và đọc `$type`/`text` cạnh nhau.
- Bỏ field có giá trị mặc định: `0`, `0.0`, `false`, `""`, `[]`, `"None"` — an toàn vì
  `js/stats.js:8 function num(v)` đã coi `v == null` là `0`, và mọi so sánh `!== 'None'` trong
  `hitbox.js`/`skill.js`/`buff.js` đều có `field && field !== 'None'` (guard trước) nên field vắng
  mặt (`undefined`) tương đương `'None'`. **`[ĐO]`** bằng `grep -n "!== 'None'" js/*.js` — toàn bộ
  22 chỗ đều có guard `&&` phía trước, không có chỗ nào so sánh trần.
- Ép chuỗi số thuần (`"8.000"` → `8.0`, `"100104002"` → `100104002`) thành số JSON thật.
- Kết quả cuối (sau khi đã sửa xong cả 4 bẫy đóng bao ở trên, phạm vi Skill/HitBox/Buff/Monster
  đã lớn hơn nhiều): `data/tables.js` **4,916,515 B** — so với **5,209,321 B** của bản đầu tiên
  (phạm vi hẹp hơn NHIỀU nhưng chưa minify, còn thiếu dữ liệu do bẫy 1+2) — minify bù lại phần
  phình ra do đóng bao đúng và đủ hơn.

### DropRewardProbability

450 KB trong bản gốc — 6016 dòng. Chỉ giữ dòng có `DropRewardId` trỏ tới `DropReward.Id` mà
`DropReward.GroupId` được tham chiếu từ `RewardBox.DropRewardGroupId`/`MonsterSpawn.DropRewardGroupId`/
`Monster.DropRewardGroupId` đang có trong scope. Kết quả: **5918/6016** dòng (RewardBox/DropReward
bản thân là bảng "đầy đủ" theo Pham vi nên hầu hết group vẫn được nhắc tới — chỉ cắt được ~1.6%,
không như kỳ vọng ban đầu; ghi lại để agent sau khỏi ngạc nhiên).

## text.js

`VD.TEXT`/`VD.TEXT_EN` lọc theo:
1. Mọi `<Key:...>` xuất hiện trong Lua đã chọn.
2. Khoá dạng `T<Bảng>_..._<id>` mà `<id>` khớp một dòng đã có trong `VD.T` (bất kỳ bảng nào, không
   chỉ bảng cùng tên — join lỏng, an toàn theo hướng thừa hơn thiếu).
3. Mọi khoá **không khớp** mẫu `T..._<số>` ở cuối (LL_*, LM_*, LQ_*, TalkDialog_*, tên enum
   E*, UHelpPopup_* ...) — coi là "hệ UI/system", nhận hết.

Kết quả **`[ĐO]`**: 10,931 khoá Vi (8,467 theo id + 3,281 UI... — có trùng nhau ở biên) trên tổng
15,321 khoá gốc. `VD.TEXT_EN` chỉ có khi `Vi` rỗng nhưng `En` có (0 khoá hiện tại — LocalizedText
Vi phủ 100% các khoá được chọn, khớp ghi chú trong `section_00_header.md` của agent trước: "Vi phủ
đúng 100% khoá có En").

## Manifest asset (spine/vfx/sfx/bgm)

`tools/manifest.json` sinh từ quét field tên kết thúc bằng `Vfx`/`Sfx`/`Bgm` trong
`RootActionNode`/`HitBoxInfo`/`BuffEffects` + cột `Sector.Bgm`/`CombatBgm` + `LoungeBgm` + Lua
`PlayBgm(...)`/`SpawnMonster(...)`/`SetDialogCustomImageAsync(...)`. **Không** chứa tên skeleton
spine hay icon — hai thứ đó cần đọc **prefab Unity** (không suy ra được từ bảng CSV), nên được
giải quyết riêng ở `rip.py spine`/`build_units.py` (ghi ngược kết quả vào `manifest.json['spine']`
sau khi chạy).

## Spine — khớp atlas theo SkeletonDataAsset, không đoán theo tên

Bẫy đã biết (ghi trong đề bài): nếu khớp atlas↔skeleton bằng cách so tên chuỗi, một số skeleton
lấy nhầm atlas (đặc biệt các cặp NW/SW dùng chung atlas nhưng khác `SkeletonDataAsset`).
`rip_spine_names()` đọc `atlasFile`/`materials` **trực tiếp từ chính `SkeletonDataAsset`**
(field `atlasFile` trỏ PPtr tới `AtlasAssetBase`, field `materials` của atlas đó trỏ PPtr tới
`Material` → `_MainTex`) — không có bước so tên chuỗi nào ở giữa.

Kết quả cuối: **38/44** bộ skeleton nhân vật/quái bốc được (100% 4 nhân vật + 10 boss + 24 quái
thường, sau khi phạm vi Monster tăng lên 183 dòng nhờ sửa xong bộ đóng bao). 6 skeleton lỗi
(`EmptySkeleton_SkeletonData` — rỗng, không có atlas thật; `Target_*` × 5 — skeleton "bia tập bắn"
dùng lại chung atlas với `Monster_*`/`Boss_*` gốc dưới tên khác chưa dò ra quy ước, KHÔNG bốc
được).

## VD.ASSETS.units (spine + skin + va chạm cho nhân vật/quái)

`build_units.py` đọc prefab trong `remote_prefab_assets_unit` (tên GameObject gốc = chính
`Character.Id`/`Monster.Id`/`Npc.Id` dạng chuỗi — **quy ước chỉ đúng cho Character/Monster**, xem
dưới), lấy `m_LocalScale.x` của root, `CapsuleCollider.m_Radius/m_Height`, và field có tên chứa
`blobshadowradius` (không phân biệt hoa/thường) trên component đổ bóng.

- **Skin nhân vật**: `Character.Id → CharacterSkin.Id (theo CharacterId) → CharacterSkinPreset đầu
  tiên (theo CharacterSkinId)` → `body/skinbase_<n>`, `body/eye_<n>`, `body/hair_<n>`,
  `body/costume_<n>` (bỏ nếu = -1), `acc/<n>` (chỉ nếu ≠ -1), cộng `weapon/<DefaultWeaponId>`.
- **Skin quái**: dùng thẳng `initialSkinName` đọc được trên component `SkeletonAnimation` của
  prefab (vd Monster_Zombie skin `"200013"` — đúng như ASSETS.md mô tả "Monster_Zombie có skin
  200011..200016").

**Gap đã biết**: 116/127 Npc **không** có prefab dưới tên `<Npc.Id>` trong
`remote_prefab_assets_unit` — nghĩa là NPC KHÔNG dùng cùng quy ước đặt tên prefab với
Character/Monster. `Npc.csv` có cột `DefaultImageName` (giá trị như `"Default"`/`"Smile"` — mã
cảm xúc, không phải tên prefab) — gợi ý NPC hiển thị chủ yếu qua **chân dung 2D** (portrait) lúc
hội thoại chứ không phải mô hình spine đầy đủ trong sảnh (sector 9001/9002 chỉ có spine trang trí
`World_Cat`/`World_Pendulum`/`World_Butterfly`/`World_LoungeBG`, không có NPC theo tên). Chưa dò
ra được prefab NPC thật (có thể ở bundle prefab khác, hoặc NPC trong sảnh dùng hệ UI 2D hoàn
toàn) — để lại cho agent sau, danh sách 116 id nằm trong `tools/units.json["missing"]`.

## Portrait / dialog image

`Npc.DefaultImageName` (cột trong `Npc.csv`) là **mã cảm xúc mặc định** (`Default`, `Smile`, ...),
ghép với `Npc.Id` thành tên sprite `"<id>_<Emotion>"` trong bundle
`remote_texture_assets_portrait` (222 sprite, đã xác nhận bằng cách liệt kê tên Sprite thật:
`100001_Default`, `100001_Happy`, `100001_cSad` — tiền tố `c` là biến thể "miệng khép"/nói chuyện).
Vì bundle này chỉ có 222 sprite (nhỏ, và mọi Npc đều nằm trong bảng "đầy đủ"), `rip.py portrait`
bốc **toàn bộ** thay vì lọc — không cần parse logic `MD_ExpandEmotion` trong Lua.
`rip.py dialogimage` bốc đúng 9 tên xuất hiện trong `SetDialogCustomImageAsync("...")` ở Lua scope.

## Sector — hình học tách khỏi texture

`rip.py sector` viết glb **chỉ hình học** (không nhúng ảnh: `image.uri` trỏ ra
`tex/<tên>.webp` thay vì bufferView nhị phân), texture ghi **một lần** dùng chung giữa mọi sector
(khoá theo tên texture Unity, không theo sector) — 40 sector chỉ tốn **42 file / 3.0 MB** texture
dùng chung (Country/City đều tái dùng một bộ tileset lớn). gltfpack nén hình học bằng
`-cc -km -ke -mm -si 0.6` (meshopt + lược giản 40% tam giác — xem "Ngân sách dung lượng" dưới).
Collider/đèn/spawn/spine trong `<id>.json` đã đổi trục (`z_three = -z_unity`) và bo tròn số.

## Fengari

`vendor/fengari-web.js` là bản **UMD** (`dist/fengari-web.js` của npm `fengari-web@0.1.4`), KHÔNG
phải `dist/fengari-web.bundle.js` — bản `.bundle.js` bắt đầu bằng `module.exports=...` không có
guard UMD, ném `ReferenceError: module is not defined` khi nạp bằng thẻ `<script>` trơn (đã đo bằng
Playwright). Sau khi nạp, `window.fengari` = `{lua, lauxlib, lualib, to_luastring, to_jsstring,
interop, L}` — API phẳng như tài liệu fengari 0.1.4, không lồng namespace lạ. `fengari.L` là state
Lua có sẵn (`fengari-web` tự mở) nhưng bản smoke test này tự tạo state riêng bằng
`fengari.lauxlib.luaL_newstate()` + `fengari.lualib.luaL_openlibs(L)` để tách biệt khỏi bất kỳ
`<script type="application/lua">` nào có thể chạy song song.

## spine-threejs 4.2.43 — namespace phẳng, không lồng `.threejs`

Bản `spine-threejs` **4.0.31** dùng ở ho-xanh có namespace `spine.threejs.SkeletonMesh`. Bản
**4.2.43** (bắt buộc dùng ở đây vì Spine gốc export ra 4.2, có physics constraint mà 4.0 không đọc
được) đưa mọi thứ lên thẳng `spine.*`: `spine.SkeletonMesh`, `spine.ThreeJsTexture`, không có
`spine.threejs`. Đo bằng cách liệt kê `Object.keys(spine)` qua Playwright trước khi viết
`tools/smoke.html` — đoán mò theo API 4.0 sẽ ném `TypeError: spine.threejs is undefined`.

## Font

`Pretendard-Regular`/`Pretendard-Bold` (TTF gốc trong Unity `Font` asset, bundle
`dependencies_assets_fonts` — 168 MB, chỉ tải 1 lần, ~30 s) được cắt bằng `fonttools.subset` chỉ
giữ đúng 232 ký tự xuất hiện trong `VD.TEXT`/`VD.TEXT_EN` (Latin cơ bản + dấu tiếng Việt) →
`vendor/fonts/*.subset.woff2` **~24 KB/font** (từ 2.7 MB gốc).

## Ngân sách dung lượng — 132 MB, vượt 90 MB **`[ĐO]`**

`games/voiddiver/` tổng ~132 MB, trong đó phần của tools này (không tính `art/vfx` 8.0 MB và
`art/object` 5.5 MB — hai thư mục do agent khác quản lý) là ~118 MB:

| phần | dung lượng | ghi chú |
|---|---:|---|
| `art/sector/` | 54 MB | 40 file `.glb` hình học (nén meshopt) + `tex/` 3.0 MB (42 texture dùng chung, ≤1024px) |
| `art/spine/` | 13 MB | 38 bộ skeleton (4 nhân vật + 8 boss + 26 quái) |
| `art/ui/` | 15 MB | 2648 icon (23 atlas — Item/Equipment/Talent đều là bảng "đầy đủ") + 222 portrait + 9 dialog image |
| `audio/` | 29 MB | 544 SFX (6.5 MB, 96 kbps mono) + 38 BGM (22 MB, **32 kbps mono**) |
| `data/` | 7.0 MB | `tables.js` 4.9 MB + `text.js` 1.3 MB + `lua.js` 0.9 MB + `assets.js` 0.1 MB |
| `vendor/` | 1.2 MB | three+GLTFLoader+meshopt+spine-threejs+fengari-web+font (font ~48 KB) |
| `tools/` | 0.5 MB | script + `manifest.json`/`units.json` |

Đã áp dụng đúng thứ tự khắc phục trong đề bài, nhưng **không đủ đưa tổng về dưới 90 MB**:
1. **BGM trước**: 112 kbps stereo mặc định → **32 kbps mono** (74 MB → 22 MB, giảm 70%; còn nghe
   được cho nhạc nền loop, không phải nhạc để nghe kỹ).
2. **SFX**: đã lọc theo scope ngay từ đầu (544/1003 tổng SFX của game — do vòng đóng bao
   Skill/HitBox/Buff/Monster mở rộng nhiều lần theo góp ý giữa chừng, không phải "toàn bộ rồi cắt
   bớt") — không còn khoảng cắt nào ở đây, SFX chỉ 6.5 MB, không phải chỗ nặng.
3. **Sector geometry** (ngoài 2 gợi ý trong đề bài, nhưng là phần nặng nhất đo được — 54 MB, gần
   nửa tổng dung lượng): thử `gltfpack -si 0.6` (lược giản 40% tam giác) trên 37/40 sector — kết
   quả đo được chỉ giảm **~2%/sector** (vd sector 4010: 1615 KB → 1581 KB), không đáng kể như kỳ
   vọng, có thể vì phần lớn dung lượng đã nằm ở overhead meshopt/quantization theo primitive
   (nhiều material/collider nhỏ) chứ không tỉ lệ thuận với số tam giác. **Chưa thử** `-tc` (nén
   texture KTX2/BasisU — texture chỉ 3 MB nên lợi ích nhỏ) hay gộp draw call/material trước khi
   pack. Việc quét chưa hoàn tất cho 3 sector cuối (9001-9003, bundle `dependencies_assets_spine`
   nạp rất chậm) — 3 sector đó **vẫn giữ bản gốc chưa `-si`** (không sai, chỉ chưa được thử tối
   ưu thêm).
4. **Chưa thử/không có thời gian**: giảm nữa BGM (32 kbps đã khá thấp, xuống nữa sẽ rè rõ), cắt
   bớt số sector (không được phép — tất cả 40 đều nằm trong Phạm vi).

Kết luận: **vượt ngân sách ~28-42 MB** tuỳ có tính `art/vfx`+`art/object` của agent khác hay
không. Đòn bẩy lớn nhất còn lại nằm ở `art/sector` (geometry), nằm ngoài 2 gợi ý ban đầu của đề
bài (BGM/SFX) — cần quyết định của chủ dự án: chấp nhận vượt ngân sách, hay đầu tư thêm thời gian
tối ưu gltfpack/giảm số sector trong Phạm vi.

## Bẫy máy (Windows + Git Bash + Python)

- `python` là cmd shim trên máy này: **không bao giờ** `python -c "nhiều dòng"` (ném
  `IndentationError` khó hiểu do bash truyền chuỗi lạ), **không** `python -` (treo máy) — luôn ghi
  script ra file rồi `python file.py`. Cũng đừng quên `export PYTHONIOENCODING=utf-8` — tên khoá
  tiếng Hàn/Việt trong bảng làm `cp1252` (mặc định) ném `UnicodeEncodeError` ngay dòng `print` đầu
  tiên.
- `TableEncrypted`/`LuaEncrypted` **không nằm trong AssetBundle nào** — chúng là file `.bytes` rời
  trực tiếp dưới `StreamingAssets/TableEncrypted/` và `StreamingAssets/LuaEncrypted/**/`, không
  phải TextAsset trong `dependencies_assets_scriptable` hay bất kỳ bundle addressable nào (đã dò
  nhầm hướng này khá lâu trước khi `find -iname "*.bytes"` lộ ra đường dẫn thật).
- `remote_prefab_assets_unit` chỉ có399 (thực đo 209) prefab, tên GameObject gốc = `Character.Id`
  hoặc `Monster.Id` dạng chuỗi thập phân — **không đúng cho Npc** (xem gap ở trên).
- `fengari-web` trên npm: `package.json.main` trỏ `dist/fengari-web.bundle.js` (dùng cho webpack),
  **không phải** thứ cần cho `<script>` trơn trong trình duyệt — phải lấy `dist/fengari-web.js`.
- gltfpack qua `npx -y gltfpack@0.22.0` tự tải về lần đầu (mất vài giây) — không cài global, mỗi
  agent/máy tự tải cache npx riêng, không commit `node_modules`.
- Bundle `dependencies_assets_spine` (220 TextAsset + 133 Material + 129 Texture2D) khá nặng — nạp
  lần đầu trong quá trình `rip.py sector` (khi gặp sector sảnh 9001/9002 có spine trang trí)
  khiến `with_deps()` phải nạp lại toàn bộ vòng lặp sector đã xử lý trước đó (không có cache nội
  bộ giữa các sector trong 1 lần chạy `with_deps` khi phải thêm dependency giữa chừng) — lãng phí
  nhưng không sai; nếu tối ưu tốc độ, nạp sẵn `dependencies_assets_spine` vào `deps=[...]` của
  `cmd_sector` thay vì để nó tự dò.
