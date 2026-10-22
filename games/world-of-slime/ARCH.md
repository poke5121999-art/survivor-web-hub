# Thế Giới Slime: kiến trúc (rev 20261022c)

Bản web của World of Slime Demo (TEAM42). Từ rev 20261022a chạy trên **bản đồ thật của server** (Larus: quán trọ 257, làng 110,
kho 478, lấy từ đệm đĩa của game): mở game là ở phòng ngủ quán trọ như bản thật, đi xuống cầu thang ra làng, vào/ra kho.
Lát cắt gồm: bản đồ thật + bản đồ thử (`?map=dev`), người chơi đi/chạy/lướt, một slime
đi theo, camera của game, điều khiển PC và mobile theo bảng phím gốc, tiếng bước chân, HUD dựng từ prefab gốc, màn tải
theo byte. Từ rev 20261022b có **chuỗi nhiệm vụ mở đầu "Village of Rough Waves"** (q1-q6 + nhận q7, Rudga chặn cổng tây,
quầy Vivian bán Cube): hội thoại có chân dung + lựa chọn, băng chữ, log EXP, nhật ký J, Tiềm năng K, bản lưu localStorage.
Từ rev 20261022c (F1) có **chiến đấu thời gian thực**, **đấu tay đôi với Rudga** và **Shadow Forest Entrance** (hai bản đồ
DỰNG THEO CLIP, nhãn "dựng theo clip" trên trang). Rev 20261022c còn có **phần mở đầu** (js/intro: Touch To Start, đặt tên,
tạo nhân vật 7 tab trước gương, truyện tranh, chọn ba lô = slime khởi đầu, phim tỉnh dậy, Setting bằng Esc). Chưa có bắt slime, các bảng túi / bách khoa / kho.
Nghiên cứu gốc: `D:\wos-ref\notes\` (MAPBUILD, PIPELINE, EXPORT_*, CODE §8-9). Kế hoạch: `brain/plans/world-of-slime.md`.

## Mô-đun

| Tệp | Việc |
|---|---|
| `index.html`, `mobile.html` | hai trang (PC / mobile ngang), cùng `js/`, import map trỏ `vendor/` |
| `vendor/` | three.js r160 (npm three@0.160.0: `three.module.min.js`, GLTFLoader, SkeletonUtils, BufferGeometryUtils, LICENSE) |
| `js/config.js` | `REV`, `ASSETS` (+ `?assets=`), hằng số di chuyển và camera (số `[ĐỀ XUẤT]` ghi rõ) |
| `js/assets.js` | tải GLB/JSON/ảnh có đệm; `bytes`/`expectBytes`/`loadProgress` cho màn tải |
| `js/world/map.js` | **khuôn dữ liệu bản đồ (đầu tệp)**, đặt mảnh bằng InstancedMesh, `getHeight`, `canStand`, `landTypeAt`, cầu thang |
| `js/world/envmat.js` | toon cho mảnh bản đồ (MixMaster/Enviroment Base, Tile Blend, Water) |
| `js/actors/toon.js` | toon cho slime/người (Unit Matcap wip), chép từ `D:\wos-ref\proof\slime\sheet.html` |
| `js/actors/actors.js` | `Player.create(gender)` ghép avatar từ `player/index.json` defaults; `Slime.create(id)` |
| `js/input/intent.js` | ý định chung `{move, attack, mouse, pressed:Set<tên hành động SMActions>}` + lượng tử 32 hướng |
| `js/input/pc.js` | `KEYMAP` = SMActions/Gameplay gốc (xem dưới) |
| `js/input/mobile.js` | cần ảo (`MainJoystick` của HUD) + chụm zoom; nút là của HUD (`data-act`) |
| `js/state.js` | bản lưu `localStorage['wos.save']` có `v` (SAVE_VERSION, khác phiên bản thì bỏ), `?fresh` xoá; kho trạng thái HUD (người chơi, đội 6 ô, ô vật phẩm, nhiệm vụ, CombatMode, battle, minimap); `set()` báo HUD vẽ lại |
| `js/ui/hud.js` | HUD HTML/CSS theo RectTransform prefab; `uiScale()` = SMUniformCanvasScaler; chân dung chụp avatar thật; bản đồ nhỏ; thẻ tên trên đầu |
| `js/ui/sprites.js` | URL sprite `ui/`, bảng viền 9-slice `BORDER`, `tinted()` nhân Image.color trên canvas, `paint()` |
| `js/ui/loading.js` | màn tải: `img/login_bg.mp4`, `Login_Logo_Title_En`, `LoadingIcon/UI_Loading_0..29`, thanh `Login_Loading_Gauge` theo byte |
| `js/quest/data.js` | **khuôn dữ liệu nhiệm vụ (đầu tệp)**: `QUESTS`, `DIALOGUE` (nút thoại -> lựa chọn -> nút / hành động), `TALK` (NPC -> nút đầu theo trạng thái nhiệm vụ), hộp trôi dạt, cổng tây, quầy, Tiềm năng |
| `js/quest/engine.js` | máy trạng thái nhiệm vụ: trạng thái none/active/ready/done, hành động (`complete:q`, `heal`, `box`, `perk`, `shop`...), EXP/cấp/SP, Vàng, đồ; đẩy `state.quest` cho HUD |
| `js/ui/story.js` | DialogueUI + ChoicePopup + DialogueIllust, QuestStart / QuestComplete / LevelUp, MapTextLayout (tên bản đồ), LogUI, QuestUI (J), PerkUI (K), BuyShopUI + BuyItemPopup, popup Notice |
| `data/quest_text.js` | chữ nhiệm vụ/thoại: `en` nguyên văn clip (mốc giờ từng dòng), `vi` bản dịch của bản web; `?lang=en` |
| `data/loc_vi.js` | chuỗi giao diện chép từ `D:\wos-ref\data\loc\vi.json` (+ en dự phòng), `t(key, args)` |
| `js/camera.js` | FollowCamera: cúi 40 độ, vùng chết, kẹp `cameraMoveRect`, zoom |
| `js/audio.js` | một AudioContext, sự kiện Wwise -> ogg, switch `LandType` theo `landType[]` |
| `js/game.js` | vòng chơi, đổi bản đồ qua cửa (`switchMap`: mờ đen, dựng bản đồ đích, đặt người chơi ở `arrive`), NPC; `window.WOS` để test đọc |
| `js/intro/intro.js` | **mở đầu (F2)**: `runIntro(platform)` Touch To Start -> đặt tên -> tạo nhân vật -> truyện tranh -> chọn ba lô -> phim tỉnh dậy; `profile` trong bản lưu; `avatarFor(profile)`, `applyProfile` |
| `js/intro/screens.js` | màn tiêu đề (`img/login_bg.mp4`, logo, nút mạng xã hội, thanh "Loading resources"), Nickname Setting + Notice, CustomizeUI 7 tab trước gương (`Customize/Customize_Bg` + avatar 3D vào RawImage) |
| `js/intro/avatar.js` | `buildAvatar(look)`: ghép avatar như Player.create nhưng chọn Hair/Face/Eyebrow, da, màu tóc, lens, AccDecal (CustomizeDataSet); clone mọi GLB nên dựng lại được |
| `js/intro/prologue.js` | truyện tranh IntroStory_01..05_{M,W} trên khung PaperBoard, chọn ba lô 3D (`prop/pr_event_1_dadbag.glb`, ba lô xanh đổi màu albedo), phim `img/prologue.mp4` + Skip |
| `js/intro/setting.js` | Setting (Esc / nút menu): Graphic Quality, Max FPS, Screen Mode, Resolution, Shadow, Camera Scale, âm lượng, ngôn ngữ, Account (Về màn hình chính, Xoá dữ liệu chơi); `localStorage['wos.settings']` |
| `js/intro/ui.js`, `js/intro/text.js`, `css/intro.css` | lớp `#intro` (đơn vị canvas như HUD, X() theo px ảnh 1280x720, popup CommonPopup), chữ vi/en (`?lang=en`, khoá loc gốc ghi cạnh) |
| `js/post.js` | hậu kỳ màu toàn màn: cảnh vẽ vào render target half float, quad đổi sang sRGB rồi nhân ma trận affine `GRADE[mapLightType]` |
| `js/combat/rules.js` | **mọi số chiến đấu một chỗ**: `META` = hàng thật data/meta (đòn thường action 4..15 / attack 8..19, kỹ năng 116/153/167, đòn slime hoang action 1 / attack 1 Sector 3 ô 90°, Small Slime Fragment item 215 dropRate 0.7), `RULES` = `[ĐỀ XUẤT]` (máu, sát thương, tầm, hồi sinh, đấu tay đôi) có chú thích từng số; RNG có hạt `?seed=` |
| `js/combat/combat.js` | slime hoang (lang thang, gây hấn, đuổi, đánh, chết, rơi đồ, sinh lại), đồng hành tự đánh (đòn thường + kỹ năng, quả cầu bay theo moveSpeed meta), tia lệnh người chơi -> slime, huýt sáo, EXP/cấp slime (`save.slime.lv/exp`), nhiệm vụ q7 (`obj q7.kill/frag`), đấu tay đôi (`startDuel`, `save.duel`); game.js chỉ gọi `setMap/command/recall/startDuel/update` |
| `js/combat/ui.js` | thẻ MonsterHud trên đầu, ô mục tiêu giữa trên, PVPvs / PVP321Start / thanh trên trận, bóng thoại, dòng log lớn LogUITitle ("Roasted / Lv2"); số theo prefab gốc |
| `tools/forestmap.py` | vẽ tay `data/maps/shadow_forest_entrance.json` + `rudga_arena.json` theo khung clip rồi chạy luật autotile (như devmap.py), có `collide`, `web.spawns`, cờ `_clip` |
| `data/portals.js` | `MAPS[id]`: tên bản đồ (HUD), `start`, `portals` (vùng bước vào là chuyển), `arrive`, `npcs`; mọi số `[ĐO TRONG ẢNH]` |
| `data/maps/110,257,478.json` | bản đồ thật, sinh bằng `tools/import_maps.py` (đừng sửa tay) |
| `data/meta/*.json` | bảng meta thật của server (`tools/import_meta.py`, xem `data/meta/README.md`; chữ chỉ là TextId) |
| `tools/import_maps.py` | đệm server -> `data/maps/<id>.json` (`--png`: ảnh lưới va chạm vào `D:\wos-ref\proof\larus\data`) |
| `tools/import_meta.py` | `meta_<type>_en.json.gz` -> `data/meta/<type>.json` |
| `tools/devmap.py` | vẽ bản đồ thử 48x40 bằng luật autotile của editor -> `data/maps/dev.json` |
| `tools/serve_cors.py` | http.server có CORS để test với asset cục bộ |

## Luồng dữ liệu từ đệm server

```
D:\wos-ref\server-cache\live\StandaloneWindows64\   (đệm đĩa của demo sau khi chủ dự án chơi; WOS_CACHE để đổi)
  <id>_tileData.txt   MessagePack TileMapData [w, h, layers]; layer k = LayerTypes-1; floor = [floor, tiles];
                      tile = [index, name, rot, scale, isInvisible, useImposter]
  <id>_clientData.txt MessagePack ClientMapData, mảng 13 phần tử theo khoá int (ClientMapDataFormatter): 0 w, 1 h, 2 layers (null),
                      3 floors, 4 cameraMoveRect [sx,sy,ex,ey,fov], 5 verticalFog, 6 (khoá trống), 7 bgm, 8 landType,
                      9 cloudProjector (khoá 0 trống), 10 mapBackgroundType, 11 mapLightType, 12 positionMarkers (null cả ba bản đồ)
  <id>_collide.txt    w*h*16 byte: mỗi ô 4 int32 BIG-endian (MiniMapLoader.ReverseCollision đảo byte), ô con 0.5 m
                      (2x + j%2, 2z + j/2), bit k = MapCollisionFlag k+1 (bit0 WALL, bit1 EXCLUSIVE, bit6 WATER...), 0 = ENABLE
  meta_<type>_en.json.gz   hàng meta (MetaSyncManager)
      | tools/import_maps.py, tools/import_meta.py (chạy lại ra tệp giống hệt)
      v
data/maps/<id>.json {client, tile, collide}     data/meta/<type>.json
      | js/world/map.js: đặt mảnh theo tile, đi được theo collide, độ cao theo floors + HeightPropData cầu thang
      v
data/portals.js: cửa, NPC, chỗ xuất phát (server gửi lúc chơi, không có trong đệm) -> đo trong ảnh D:\wos-ref\pilot
```
Nhạc nền: `client.bgm` (`bgm_town_larus`) -> `audio/index.json` `BGM__<FNV-1 32 bit của tên viết thường>` (`BGM__704172dc`,
2 tệp phát nối nhau). Kho 478 `bgm` null: giữ nhạc đang phát. Nền: `mapBackgroundType` 1 = `img/mapbackground/InsideCommon.webp`.
Bản đồ nhỏ vẽ từ `collide` như `MiniMapLoader.MakeMiniMapFromBytesCollision`.

## Khuôn dữ liệu

- Bản đồ `data/maps/<id>.json` = `{ client: ClientMapData, tile: TileMapData, _dev?, web? }`, tên trường đúng như game
  (xem đầu `js/world/map.js`). Khi có `map_type_{id}_client.dat` + `_tile.dat` (MessagePack) chỉ cần đổi sang JSON, không sửa bộ dựng.
- Toạ độ logic là Unity: ô (x, z), x = `index % width`, z = `index / width`, +z lên trên màn hình. Chỉ lúc đặt Object3D mới
  đổi sang three `(-x, y, z)`. Mảnh đặt ở `(x + 0.5, floor, z + 0.5)`, đỉnh đi được = floor + 1.
- `collide` (lưới va chạm thật 0.5 m) quyết định đi được; `web.blocked` chỉ còn ở bản đồ thử.
- NPC: `npc/index.json` không có tên nhân vật; ghép tên theo chân dung `img/npc/NPC_Larus_*.webp` với ảnh thật: Amy = Biggirl,
  Allen = Store, Lucy = Biggirl_4 (vật liệu `CH_Public_NPC_ArtistLucy`), Billy = Bigman, Olivia = Biggirl_5, Alice = Kidgirl,
  Rudga = Bigman_3, Benjamin = Oldman, Vivian = Shop (đoán: không ảnh nào hiện tên), Wisp = slime `SL_Wisp_Light`.

## Chạy

```
py -3.12 -m http.server 8841 --bind 127.0.0.1                                        # gốc repo
py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets   # asset cục bộ (tuỳ chọn)
http://127.0.0.1:8841/games/world-of-slime/index.html?assets=http://127.0.0.1:8842/
WOS_ASSETS=http://127.0.0.1:8842/ node test/world-of-slime-slice.js                   # đi PC + mobile, chụp vào D:\wos-ref\proof\slice
node test/world-of-slime-hud.js                                                      # HUD + phím + màn tải, chụp vào D:\wos-ref\proof\hud
py -3.12 -I games/world-of-slime/tools/devmap.py                                     # dựng lại bản đồ thử
py -3.12 -I games/world-of-slime/tools/import_maps.py [--png]                         # đệm server -> data/maps (110, 257, 478)
py -3.12 -I games/world-of-slime/tools/import_meta.py                                 # đệm server -> data/meta
node test/world-of-slime-larus.js     # quán trọ -> làng -> kho -> làng bằng phím thật (BFS trên collide), NPC, nhạc, lỗi, fps
node test/world-of-slime-parity.js    # chụp web cùng chỗ với ảnh thật -> D:\wos-ref\proof\larus\web (skill parity-compare)
```
Tờ so ảnh: `D:\wos-ref\proof\larus\compare\<key>.png`, nhận xét `D:\wos-ref\proof\larus\verdicts.tsv` (cổng `parity.py check`).
Test slice/hud đi trên `?map=dev` (mặc định giờ là 257).
Tham số trang: `?assets=`, `?map=dev|110|257|478` (mặc định 257), `?from=<tên cửa>`, `?camat=x,z` (khoá điểm nhìn), `?pitch=`,
`?grade=0` (tắt hậu kỳ), `?gender=woman`, `?slime=SL_Bat_WindDark`, `?at=x,z`, `?zoom=<m>`, `?quest` (nhiệm vụ mẫu),
`?warn` (cảnh báo thể lực), `?lang=en`.

## Mở đầu (js/intro, pha F2)

- Thứ tự theo clip DcGavHFwqtk 0:00-1:12 và ảnh demo thật `D:\wos-ref\pilot` (g1/g2 tiêu đề, g4/g5 đặt tên, cust1..6 + g6 tạo nhân vật,
  g7 xác nhận, intro*/g8 truyện tranh, pack*/pick* ba lô, pro* phim). Mở trang luôn qua Touch To Start; bản lưu có `profile` thì vào thẳng
  game, không thì chạy hết rồi ghi `profile = { name, look, slime, bag, at }` vào `wos.save` TRƯỚC khi engine đọc bản lưu.
- Tham số: `?intro=0` bỏ hẳn (mọi test cũ dùng), `?intro=nick|custom|comic|pack|film` nhảy tới một màn để chụp so (không ghi bản lưu nếu
  bỏ qua đặt tên), `?name=` tên dùng khi nhảy vào `custom`.
- Tab tạo nhân vật (icon `CustomizeUI/Category_Customize_0X_*`): Gender, Skin, Hair, Hair Color, Face, Lens, Acc. Không có tab Brow:
  lông mày đi theo Face (`Face i` -> decal `PC_<G>_Face00i` + `Eyebrow00i_L/R`) `[ĐỀ XUẤT]`. Lens nhân `lensColors` vào vùng cyan/magenta
  của decal mask; Acc = ô `faceOffsetVector4s[i]` của atlas 4x4 `PC_Face_Decal`, `accDecalMultiplyFlags` chọn nhân/phủ.
  Mặc định (g6, cust1..6): ô đầu mỗi tab, Hair Color ô 10.
- Slime khởi đầu (server gửi): ba lô xanh = `SL_ElecChicken_WindFire` (ảnh thật inn1.png và clip 1:12 đều chọn ba lô xanh và có gà lửa),
  ba lô vàng = `SL_ElecChicken_WindElectric` `[ĐỀ XUẤT]`. Mô hình ba lô chỉ có albedo vàng: ba lô xanh đổi màu trên canvas `[ĐỀ XUẤT]`.
- Setting: Graphic Quality = pixel ratio (0.5 / 0.75 / 1 / min(dpr,1.5) / min(dpr,2)), Max FPS = bọc `requestAnimationFrame`,
  Camera Scale 0.50..1.20 nhân `FollowCamera.effDist()` `[ĐỀ XUẤT]` khoảng, Shadow chỉ lưu (web chưa có bóng), BGM đổi thì phát lại bài.
- Test: `node test/world-of-slime-intro.js` (PC + mobile, bản lưu trống tới quán trọ, tải lại, Setting); ảnh so cùng trạng thái
  `node test/world-of-slime-intro-parity.js` -> `D:\wos-ref\proof\intro\web`, tờ so `D:\wos-ref\proof\intro\compare\<key>.png`,
  nhận xét `D:\wos-ref\proof\introerdicts.tsv`.

## Nhiệm vụ (js/quest, js/ui/story.js)

- Nguồn: clip DcGavHFwqtk (`docs/research/QUESTLINE.md`; khung 1.5 s có mốc giờ `D:\wos-ref\clips\DcGavHFwqtk\dlg\sheet_a..e.png`,
  khung đầy đủ `...ull\`) + ảnh demo thật `D:\wos-ref\pilot` (al1/h2/h4/h6 thoại, q1 nhật ký, b1 hộp, v9 tên bản đồ, x5 Rudga).
- Tương tác: NPC có `TALK` hoặc hộp (chỉ khi đang làm q4) trong tầm 2.2 m (Allen 3.8, Vivian 4.8: sau quầy) thì InteractButton
  hiện (chat / kính lúp) và Space là nói chuyện. Hội thoại: Space/chuột qua dòng, mũi tên/W/S chọn, LCtrl (DialogueSkip) chạy tới
  lựa chọn kế. Mở hội thoại thì HUD và thẻ tên ẩn, camera lại gần x0.735 và nhìn giữa người chơi với NPC (v9 -> al1).
- Băng chữ xếp hàng, chỉ hiện khi không có bảng nào mở (clip: Level Up / Hidden Power hiện sau khi đóng Tiềm năng).
- Số: Vàng mở đầu **10,000** `[ĐO TRONG CLIP]` (tài khoản mới; 9,929 ở 10:39 = 10,000 - 71 chữa ở 2:41; mua 3 Cube còn 8,429),
  không phải 1,000 như đề nghị ban đầu (1,000 không đủ mua 3 Cube x 500). Chữa 89 (pilot h4.png). EXP thưởng q3 = 40, q5 = q6 = 10
  `[THẤY]`; q1, q2, q4 và EXP lên cấp (100) `[ĐỀ XUẤT]` sao cho lên Lv2 đúng lúc trả q4 như 4:00.
- Hộp trôi dạt: 3 hộp ở làng (vị trí `[ĐO TRONG ẢNH]`), chỉ hộp cạnh quầy Vivian có Thảo mộc. Mô hình hộp thật không có trong prop/:
  dùng `pr_oldbox_003` x0.5 `[ĐỀ XUẤT]`.
- Rudga: bước vào vùng cổng tây (x <= 25, z 53..63, đường đất ra mép bản đồ) thì Rudga nói 4 dòng gốc + thẻ Huýt Sáo, popup
  "Chưa có trong bản web", rồi đẩy về (29.5, 58.5).
- Test: `node test/world-of-slime-quest.js` (phím/chuột thật, bản lưu trống tới mua 3 Cube + tải lại trang), ảnh
  `D:\wos-ref\proof\quest\web`; tờ so `D:\wos-ref\proof\quest\compare\<key>.png`, nhận xét `D:\wos-ref\proof\questerdicts.tsv`.
- `?quest` bày sẵn trạng thái "đang làm q4" trong bộ nhớ (để so HUD), `?name=` đặt tên người chơi, `?fresh` xoá bản lưu.

## Chiến đấu + rừng (F1, js/combat)

- Đường đi: q7 đang làm -> cổng tây 110 -> Rudga (ru1..ru4, lựa chọn "Lucy nhờ...") -> hành động `duel` -> sân `rudga_arena`
  (băng TEAM A vs TEAM B 2.2 s, thanh trên đồng hồ 00:00 -> 05:00 đếm lùi, 3-2-1-Start bằng UI_PVP_*, bóng thoại Rudga, slime
  đồng hành tự đánh "Junior Aqualime" Lv1 của Rudga) -> thắng: `save.duel = true`, về 110 cổng tây; thua (ngất / hết giờ): về
  làng, nói lại với Rudga để đấu lại. Đã thắng thì bước vào vùng cổng tây = sang `shadow_forest_entrance` (cửa về: mép đông).
- Rừng: 7 Junior Floralime (`SL_Slime_Grass`, 26 HP như ảnh goget_battle_whistle), Martin (`NPC_Larus_Fatman_3`, bóng thoại
  "Hic!"). Space / chuột trái / nút đánh = chọn con gần (chuột: gần điểm chuột 3 m) và đồng hành lao vào; đang đánh thì nút
  lớn thành huýt sáo đỏ, Space = gọi về. CombatMode (H) bật: tự đánh con trong 6 m. Thắng: log "<tên> EXP Slime + 2",
  70% "Mảnh slime nhỏ × 1" (item 215), lên cấp slime sau 6 EXP (con thứ ba, như 6:27) bằng dòng log lớn.
- Hậu kỳ màu rừng `GRADE[2]` (post.js) đo trên khung clip; sân đấu `mapLightType 3` không chấm màu (clip sáng như làng).
- Sân đấu: `MAPS.rudga_arena.camAt` giữ camera giữa sân. Cát = `Ground_t01_002` cùng tầng với cỏ `Cliff_t01-A` (như 110).
- Test: `node test/world-of-slime-combat.js` (bản lưu dựng sẵn q1..q6 xong, đấu, rừng, 3 con, huýt sáo, sinh lại, mobile.html
  cần ảo + nút); ảnh `D:\wos-ref\proof\combat\web`, tờ so `D:\wos-ref\proof\combat\compare\<key>.png`, nhận xét
  `D:\wos-ref\proof\combatverdicts.tsv`.
- Bẫy: (a) `page.waitForFunction` (polling raf) hết giờ dù điều kiện đúng khi trang vừa đổi bản đồ: test hỏi bằng `evaluate`
  từng 100 ms (`until`). (b) `cameraMoveRect` nhỏ hơn một màn làm `effDist()` kéo camera về ~0 m (màn trống xanh): rect phải
  rộng ít nhất một màn. (c) Cát Larus không phải Path_t01-C (ra màu cỏ) mà là mảnh `Ground_t01_002`. (d) Mảnh cỏ cao
  xanh lam của rừng không có trong map/: dùng `ter01_grass_007/008` gần nhất. (e) Combat ghi máu/MP/thể lực vào `save.slime`
  mỗi 0.3 s: khi engine đổi bản lưu (chữa ở Allen) phải đọc lại, không thì đè mất (cảnh báo thể lực không tắt).

## Bảng phím (đúng `D:\wos-ref\code\input_bindings.txt`, map Gameplay)

WASD đi (mũi tên không đi: chỉ thuộc map UI), Space = KeyboardInteractAttack (không có NPC thì đánh; đang đánh thì nút lớn là
Return = huýt sáo gọi slime về), chuột trái đánh theo hướng chuột, LShift = Dash + Slot1, Q/E/R = Slot2-4 (ô vật phẩm),
1-6 = EquipMonster1-6, C Switch, Tab Minimap, M WorldMap, I Inventory, B SlimeIndex, N SlimeInventory, J Quest (nhật ký), P Party,
K Perk (Tiềm năng), O Community, Enter Chat, LCtrl DialogueSkip, Esc, H CombatMode (tự đánh: nút Enabled/Disabled). Lăn chuột zoom.
**Không có phím chạy**: game gửi `speedStep = round(|cần|*10)`; WASD luôn |v| = 1 nên PC đi tốc độ tối đa, mobile đẩy nhẹ
thì chậm. Shift-chạy và T-huýt sáo của rev a là bịa, đã bỏ. Các bảng chưa dựng thì hiện toast tên bảng.

## HUD (js/ui/hud.js)

- Nguồn: `ui/prefab/ui_play__PlaySceneUIController.json` (+ SlimeQuickSlot, QuestBookmarkLayout, ObjectiveLayout,
  ui_objects__UserHud / MyMonsterHud). Tham số layout group / LayoutElement / PlaySceneButtonBatch không có trong JSON:
  đọc thẳng typetree bằng UnityPy (xem bẫy 11).
- Hệ toạ độ: `#hud` rộng `màn/s`, `scale(s)`; `R()` đổi RectTransform sang CSS (`left = aMin.x*100% + pos.x - pivot.x*size.x`,
  tương tự `bottom`, kéo giãn = `(aMax-aMin)*100% + sizeDelta`). Vì vậy mọi số trong mã là số prefab, không phải px.
- `s` = SMUniformCanvasScaler.Apply: r = cao màn (px thiết bị)/1080; dampen 0.7 (r >= 1), smoothstep tới 1.15 ở 720,
  dưới 720: 1.15 + 0.35*log2(720/h), trần 1.6; s = r^dampen, PC nhân StandaloneScale 0.8. 1080p -> 0.8, 720p -> 0.502.
- PC và mobile chung HUD; khác nhau: vị trí/cỡ nút (`PlaySceneButtonBatch.buttonInfos` standalone vs default, bảng `BTN`),
  PC có phím trên nút (`resources/Common/key_*`, ButtonKeymapOverlay), mobile có MainJoystick (120,130) 450, không có phím.
- Image.color: `tinted()` nhân màu trên canvas (cần CORS); alpha đặt trên lớp `.spr` riêng để không làm mờ con.
  Sliced = `border-image` với viền từ `BORDER`; filled dọc (vòng EXP) = `clip-path: inset()`; SlicedFilledImage = rộng theo %.
- Ảnh do runtime (RawImage) thay bằng: chân dung = chụp avatar thật vào render target rồi cắt theo `UI_PlayerInfo_BG_Mask`;
  ô slime = `img/sl/<id>.webp`; bản đồ nhỏ = vẽ từ `floors`/`landType` (gốc là ảnh bake, chưa có) `[ĐỀ XUẤT]`.
- Phông: TMP SDF CJK của game không dùng được; dùng **Nunito** 600-800 (Google Fonts, có dấu tiếng Việt, nét tròn gần nhất).
- So bố cục: ảnh chụp demo thật `D:\wos-ref\pilot\inn1.png` (1920x1080 thu về 1280x720) là chuẩn, ưu tiên hơn khung YouTube.

## Bẫy đã gặp

1. `map/index.json` có `Infinity` trần (Python json.dump), `JSON.parse` chết. `assets.js` thay bằng `null` khi parse hỏng.
2. `material.extras.tex` ghi uri tương đối với GLB (`tex/<hash>.webp`), còn `index.json` ghi `map/tex/...`: phải ghép thư mục GLB.
3. `py -m http.server` trần không gửi CORS: trang ở cổng 8841 không tải được asset ở 8842. Dùng `tools/serve_cors.py`.
4. Tile Blend trộn theo **alpha** vertex colour (A=1 cỏ `_BlendTex` toạ độ thế giới, A=0 vách `_MainTex`), không phải R:
   dùng R thì mặt trên của mảnh mép vách và bờ ao ra màu atlas xám.
5. Camera game ở xa (~126 m) với FOV hẹp: FOV 25-30 độ làm cây 6 m ở mép gần phình to che người chơi. Đo frame Larus:
   nhà 9.35 m rộng ~240/1024 px, nên màn ngang ~40 m.
6. Màn mobile 19.5:9 rộng hơn bản đồ: `effDist()` kéo camera lại gần để không lộ khoảng trống ngoài `cameraMoveRect`.
7. Cầu thang: BoxCollider ngắn hơn mesh (ter01_stair_001 z -2.7..0.7 so với -3.5..1.5), hai đầu rơi vào ô cùng tầng
   nên không biết đầu nào cao. Dùng bounds mesh, đầu cao/thấp lấy theo `floors[]` ngay ngoài hai đầu.
8. Nước: `Water_*` có bờ riêng (vách tới y -7, đỉnh y 1 = mặt cỏ). Ô ao vẫn tính là "có chiếm" khi dò viền vách, nên vách
   không đục lỗ quanh ao; cạnh và góc lồi của nước xoay +180 so với vách, góc lõm giữ nguyên (đã chụp thử cả hai).
9. Mô hình glTF nhìn +Z = xa camera; lúc vào game cho quay `yaw = PI` để nhìn về camera.
10. Path_t01-A là dải cỏ sáng, không phải đất; đường đất xám-be của Larus là Path_t01-B (lấy màu atlas tại UV mảnh để chọn).
11. `ui/prefab/*.json` chỉ giữ chuỗi ngắn của MonoBehaviour tự viết: spacing của HorizontalLayoutGroup, LayoutElement, và
    `PlaySceneButtonBatch.buttonInfos` (vị trí nút PC) không có. Đọc bằng typetree: `X.load_main('ui_play.bundle')`, lọc
    `MonoBehaviour` theo lớp (cách làm: `export_2d.py` `prefab_worker`). Vị trí nút trong prefab là bản mobile; PC bị đổi lúc chạy.
12. CanvasScaler không nằm trong prefab mà là `SMUniformCanvasScaler` (số trong `.ctor`: dampen 0.7, lowResolutionDampen 1.15,
    lowResolutionHeight 720, growth 0.35, maxDampen 1.6, referenceHeight 1080; `StandaloneScale` = 0.8). Đọc bằng
    `il2cpp_method.py "SMUniformCanvasScaler..ctor"`, `.Apply`, `.GetDampen`.
13. CSS `gap` không nhận số âm: spacing -22 của thanh slime làm bằng `margin-left` âm.
14. Ảnh khung `LoadingIcon` tải bằng `new Image()` có `crossOrigin` thì không cùng mục đệm với `background-image` CSS
    (CORS vs no-cors): CSS tải lại và bị huỷ (ERR_ABORTED) khi màn tải biến mất. Bỏ crossOrigin + giữ tham chiếu ảnh.
15. Thanh tải: lúc đầu chỉ biết byte vài tệp nhân vật nên % vọt 99. Chỉ tính % sau khi `map.build` đã `expectBytes` mọi GLB
    bản đồ (`loading.arm()`), và % không bao giờ lùi.
16. ChannelText prefab ghi fontSize 36 nhưng trong game thấy ~20 (TMP auto size vừa ô 110x40): dùng 20.

17. `_collide.txt` int32 là **big-endian** (đọc little-endian ra số rác). Kích thước kiểm bằng `GetExpectedColliderLength` = w*h*16.
18. `ClientMapData` có 13 phần tử, không phải 12 như danh sách trường: khoá 6 trống, bgm ở khoá 7. `cloudProjectorData` cũng
    lệch một (khoá 0 trống).
19. Tile Blend có keyword `_WORLDUV` thì `_MainTex` cũng lấy UV thế giới: dùng UV mảnh thì sàn gỗ quán trọ ra trắng.
20. `MixMaster/Particles/*` (tia nắng cửa sổ): `_SrcBlend 1 _DstBlend 1` = cộng màu, không ánh sáng; vẽ như vật liệu thường ra
    mảng đen. `_DstBlend 10` / Offset Scroll = trộn alpha.
21. Shadow Projector (`shadow_001`, lớp 4) là hộp chiếu bóng lên mesh bên dưới; vẽ thành mặt phẳng thì ra mảng sáng giữa nền tối
    (ở 257/478 hộp nằm ngoài mép phòng). Đang bỏ qua.
22. Cầu thang quán trọ: BoxCollider (hệ glTF, `x = -center[0]`) xoay yaw 90 + scale (-1,1,-1) ra hộp x 29.45..36.55, z 18..22,
    y 0..4.05; đầu thấp phía đông ra ngoài lưới floors (null) nên lối ra là vùng `x >= 34` (collide đi được tới 34.5).
    Collider ngắn hơn mesh (bẫy 7, bản đồ thử) thì hai đầu cùng tầng: thử lại bằng bounds mesh.
23. `cameraMoveRect` giới hạn tâm nhìn chứ không giới hạn mép màn (inn1: người chơi x 9.7 đứng giữa màn dù rect bắt đầu ở 0).
    Kho 478 không có rect: dùng cả bản đồ, FOV mặc định 8 (FOV 10 làm phòng nhỏ còn 0.7 lần).
24. Góc cúi 50 độ, cách 160 m `[ĐO TRONG ẢNH]`, không phải 40 / 126 của Main Camera trong level3: ở 40 độ vách quán trọ cao
    160 px (thật 135) và sàn phòng ngủ sâu 190 px (thật 220).
25. Màu làng thật xám-xanh (đất cát web (198,173,124) -> thật (138,143,138)): texture là cát vàng, nên đây là hậu kỳ của game, có
    thể do thời tiết (DistrictType 10 weathers 20001/20002). `GRADE[0]` hồi quy trên 7 cặp mẫu cùng chất liệu. Hồi quy trên
    trung bình vùng (khung lệch nhau vài mét) ra hệ số vô nghĩa: phải lấy mẫu từng chất liệu.
26. Mặt nước đài phun (`FX_Offset_WaterWave_012`) không có trong `map/t01_larus.glb` (export_map.py bỏ sót), chỉ có thác nước.
27. Đổi `REV` chưa đủ: `?v=` ở mọi import + `index.html`/`mobile.html` (sed rev cũ -> rev mới trong `games/world-of-slime`, ví dụ `20261022a` -> `20261022b`).

28. `loadGLB` trả cùng một gltf từ bộ đệm: vào lại bản đồ mà gắn lại `g.scene` và chạy lại `applyUnitMaterials` thì vật liệu toon
    bọc hai lần, NPC ra trắng bệch. `actors.js instanceOf()`: dựng vật liệu một lần, mỗi NPC/slime là `SkeletonUtils.clone`.
29. Sprite sliced có viền chiếm hết ảnh (Dialogue_Frame_Round 384 viền 192x2, Dialogue_List 104 viền 52x2, Ui_Bg_Round_01_54px
    viền 28+27 > 54): CSS `border-image` để trống tâm, còn Unity kéo dãn dải giữa. `border-image` cũng lộ đường nối khi #hud bị
    scale. `sprites.js drawSlice` vẽ 9 mảnh ra canvas đúng cỡ phần tử (co viền theo tỉ lệ như Unity), ResizeObserver
    (border-box, vẽ trong rAF, không thì "ResizeObserver loop completed").
30. Khung chữ là flex (căn giữa): nút chữ và `<span>` màu cam thành các mục flex rời, mất dấu cách và xuống dòng sai.
    `rich()` bọc cả dòng trong một `<span class="rt">`.
31. Popup_01_Medium/Small có lề trong suốt 60/40/60/62 px quanh thân: đặt theo ảnh phải là thân thấy được (`story.js panel()`).
32. Bảng toàn màn đo trên ảnh 1080p thu về 720 (q1.png, thang 0.533) to hơn ~6% so với web chạy 720p (0.502): đúng theo
    SMUniformCanvasScaler, không phải lệch bố cục.
33. `Object3D.clone()` không gắn lại SkinnedMesh vào xương mới: hai ba lô clone thường cùng vẽ theo bộ xương gốc ở gốc toạ độ (một ba lô
    nằm nghiêng giữa màn). Dùng `SkeletonUtils.clone`. Player.create cũng chuyển con của gltf trong bộ đệm sang rig (chỉ dùng được một
    lần mỗi GLB): `js/intro/avatar.js` clone từng bộ phận trước khi ghép.
34. Một WebGLRenderer cho cả gương lẫn ba lô: gương đặt `left/top/width` lên canvas; sang màn ba lô phải xoá `style` không thì canvas lệch
    (chỉ thấy trên mobile).
35. `?fresh` xoá bản lưu mỗi lần `loadSave()` được gọi: js/intro ghi profile rồi engine gọi lại là mất. `loadSave.freshDone` chỉ xoá một lần.
36. game.js kéo `fcam.dist` về `baseDist` mỗi khung: Camera Scale phải nhân ở `effDist()`, đổi `dist` từ ngoài sẽ bị trả lại.

## Còn thiếu / chưa đúng

- Nhiệm vụ: đấu tay đôi với Rudga, Shadow Forest (q7 trở đi) chưa có bản đồ. {name} = biệt danh của màn đặt tên (`?intro=0`: "Bạn" hoặc `?name=`). Dải bản đồ trong ô chi tiết nhật ký là gradient (gốc chụp bản
  đồ). Log EXP thiếu biểu tượng. Nền ô "Túi Đồ" ở quầy chưa hiện. Ô 2, 3 của quầy dùng ảnh món gần nhất. Giấy của băng tên bản
  đồ (PaperBg) là gradient vì sprite chưa xuất. Một số dòng thoại không đọc được trong clip ghi `[ĐỀ XUẤT]` trong data/quest_text.js.

- Vật thể server không có trong `_tileData`: giường, bàn tròn có cốc, tủ kính, cờ, lò sưởi quán trọ; sách trên giá kho (prop/PR_*).
  Cửa/portal và chỗ NPC là số đo trong ảnh (`data/portals.js`), không phải dữ liệu thật.
- Vách kem int02 tối hơn thật (x0.77) trong khi sàn gỗ đúng: hậu kỳ chung không sửa được, cần màu riêng của vật liệu.
- Plane sương cửa (builtin `Plane` + vật liệu verticalfog: cửa quán trọ, cửa kho, chân cầu thang) chưa xuất: cửa thật là hốc tối.
- Hội thoại NPC, bong bóng thoại, nhiệm vụ, chữ tên bản đồ khi vào, người chơi khác.

- Bản đồ thật chỉ có ba (110, 257, 478): vùng khác cần chơi demo thêm để có đệm. Bản đồ thử ghi `_dev`, trang hiện nhãn.
- Shader gốc chưa dịch ngược: không có gradient độ cao, matcap overlay, gió, sương dọc, hậu kỳ màu (game sáng và nhạt hơn).
- Tốc độ đi/chạy, số camera (vùng chết, tốc độ bám), lướt: `[ĐỀ XUẤT]`. Không có bóng đổ dưới chân nhân vật.
- Bộ nước kiểu Larus không có trong demo; ao dùng Water_01-A (bờ cỏ rừng xanh xám).
- HUD so với `pilot/inn1.png`: nút lướt (Dash) bản web luôn hiện, game thật ẩn tới khi có perk; độ mờ nút đánh Disabled
  (0.6) và màu ô bản đồ nhỏ là `[ĐỀ XUẤT]`; thẻ trạng thái trên đầu (biểu tượng + "Roasted"), bong bóng thoại NPC,
  ChatLog, buff chưa có. Vị trí màn tải là `[ĐỀ XUẤT]` (scene đăng nhập chưa bóc).
