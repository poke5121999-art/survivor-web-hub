# Mèo & Súp (Cats&Soup) lên web, kiểu My Mini Mart

Chủ dự án giao 2026-11-02: `C:\Users\tamph\Downloads\Cats&Soup_+Relaxing+Cozy+Games_5.3.0_APKPure.xapk`, "đưa game này full lên web như my mini market" = dựng lại bằng three.js + JS thuần từ asset gốc, không Unity WebGL (xem [[my-mini-mart-web]], [[lumber-inc]]). Luật hub hiện hành: chưa xong cũng lên trước rồi làm tiếp.

## Nguồn (đo trong repo bóc)

- `D:\catsoup-ref`: `xapk/` (com.hidea.cat 5.3.0, HIDEA), `data/assets/bin/Data` (asset pack 2,9 GB: 25.308 file serialized tên hash, level0-9, sharedassets0-9), `lib/libil2cpp.so` (ARMv7, 32 bit), `il2cpp-dump/` (Il2CppDumper, metadata v31, Unity 6000.0.60f1).
- Code bên linux: `~/catsoup-ref` -> HDD `/run/media/bui-thanh-thuong/C0E02AC6E02AC310/catsoup-ref`, udk build ra `~/catsoup-ref/udk` (tmux `claude:catsoup-udk`, log `~/catsoup-ref/udk-build.log`).
- Công cụ `D:\catsoup-ref\tools`: `cns.py` (nạp từng file, không nạp cả thư mục), `survey.py`, `build_index.py` (-> `index.json`: lớp MonoBehaviour -> [file, path id]), `tree.py <file> [độ sâu]`.
- `resources.json`: 18.251 đường dẫn `Resources.Load` -> file + path id (places/placeN, place/placeN_M_themeK, body/bodyX_Y = texture lông mèo, equip, furniture, tree, ground, lamp, npc, fish, machine, images/ui...).
- 117 bảng `Entity_*` (Unity-QuickSheet, giá trị ObscuredTypes; giá trị thật = `fakeValue`): thô ở `tables/`, phẳng ở `flat/`. Lõi: Work 181, Food 196, CatType 106, Furniture 1704, Equip 2247, Init 111, MapSize_Main 9, Quest 35, Lamp 125, Fish 71.
- Chữ: `lang/Vietnamese.txt`, `English.txt`, `Korean.txt` (dạng `key = value`, 10.205 dòng). Bản gốc có tiếng Việt chính thức.
- Clip chuẩn: `8las9YPqbvk` (bản gốc, dọc, cuối game: bãi cỏ giữa rừng thông, trạm có biển Lv, đèn, HUD vàng/năng lượng/gem, kệ bán súp dưới đáy, menu CRAFT 4 tab Cooking/Rest/Function/Special, RECIPE). `yNVE89oWoiw` là "Fluffy Town" (game khác, bỏ). Tải ở `D:\catsoup-ref\clips`.

## Cấu trúc game (đo)

- Scene `main.unity` (level2): map dựng lúc chạy (`Spawn`, `MapCombine`, `UnitFactory`, `FieldMapController`), UI NGUI (`UI Root`).
- Work.type: 1 nấu (súp, nước ép, xào... ra món bán), 2 sơ chế (mở/nâng nguyên liệu = cấp súp), 3 nghỉ (mèo nghỉ, ra năng lượng), 4 đặc biệt (rương, hũ phúc, câu cá, bảng tin...). Giá = cost × 1000^costDigit (đơn vị a, b, c...).
- Place prefab = MeshRenderer quad vẽ tay + SpriteRenderer + particle; mèo = texture lông `body/*` trên rig chung.

## Các bước

1. [x] Bóc, dump IL2CPP, index MonoBehaviour, xuất 117 bảng, chữ 3 thứ tiếng, clip chuẩn.
2. [x] Decompile Ghidra (linux) -> luật chơi có dẫn nguồn ở `D:\catsoup-ref\rules\*.md`.
3. [x] Bộ xuất art: place prefab (mesh + sprite + texture) -> glb/json; cây, nền, đèn; rig mèo + clip; UI sprite.
4. [x] Sim thuần JS (node chạy được): trạm, mèo làm việc, súp, kệ bán, vàng/năng lượng/gem, công thức, mở rừng, lưu.
5. [x] View three.js khung dọc 750:1334, HUD, menu CRAFT/RECIPE/mèo.
6. [x] Thẻ hub, thumbnail, deploy, kiểm trên Pages: rev 20261102a, commit a356b7de, `test/cats-soup-play.js` trên Pages 10/10.
7. [x] Lưu đám mây: `js/cloud.js` (HubSave, hàng `game_saves` id `cats-soup`), rev 20261102b, commit 6f6a8a1e. Đường khách (`off`) đã chạy trên Pages; đường có tài khoản chưa chạy thử vì test không có tài khoản.
8. [ ] Trạm đặc biệt còn lại: rương + trang bị, bóng bay, câu cá, máy gacha.
9. [ ] Nhiệm vụ, hướng dẫn đầu game, dời trạm, đồ nghề trên tay mèo, particle.
10. [ ] Full: trang bị, nội thất, câu cá, minigame, sự kiện mùa, tháp mèo...

## Full game (giao 2026-11-02 "làm full game đi")

Khung: mỗi hệ thống là một cặp module `js/sim/features/<id>.js` + `js/view/features/<id>.js`, đăng ký ở `js/sim/registry.js` / `js/view/registry.js` (hợp đồng ghi ở đầu hai file). Dữ liệu riêng `data/<id>.json` do `tools/export_<id>.py` xuất; layout bảng gốc `art/ui/panels/<tên>.json` do `tools/export_ui.py --prefab ui/...` xuất; luật `D:\catsoup-ref\rules\<id>.md`. Core chỉ có hook: `game.reward(type, value)`, `emit` gọi `onEvent`, `tick`/`offline`/`init` của từng feature. Mỗi agent chỉ sửa file của feature mình; ai cần đổi core thì ghi vào báo cáo.

- [x] Đợt 1 lên Pages rev 20261102d (commit db6bf582), 7 test trình duyệt qua trên Pages. Core thêm: dời trạm/kho/đổi cỡ rừng (`js/view/move.js`, `test/cats-soup-move.js`), ngày đêm (`isNight`, bước 60 s là suy đoán), hook `mult`, giữ nút nâng cấp, NGUI anchor/tint/9-slice/label, cách ly lỗi feature (`window.__failed()`).
- Đợt 1 (song song): `specials` (rương 3, bảng tin 8, khinh khí cầu 12, máy gắp 14, voi bán hàng 87, máy nhạc 90, bóng rổ 97, HUD hũ), `fishing` (câu cá 10, bể cá 33, Fish), `missions` (nhiệm vụ ngày, Quest, quà điểm danh, thành tựu), `cats` (danh sách mèo, thông tin, tim, kỹ năng, quà mèo, đổi mèo), `equip` (Equip: kho đồ, phòng thử đồ, đồ trên người mèo 3D, phần thưởng loại 5).
- [x] Đợt 2 lên Pages rev 20261102e (commit 0a4a3bb8): tower, furniture, collection, shop, guide, theme; test online qua. Nút của feature đi qua menu "thêm" (`hud.addMenu`), không thả nổi trên HUD.
- [x] Đợt 3 lên Pages rev 20261102f (commit 0e47be5c), test online qua. Core thêm `itemCount`/`spendItem` + `bag`, `mult('upgrade')`, `onTapAt`, `onWork`, `hud.moveActions`.
- [x] Đợt 4 lên Pages rev 20261102g (commit aced62ff): particles, integration, mèo con đi dạo; test online qua (minigame-play chập chờn khi máy tải nặng, chạy lại qua).
- [x] Đợt 5 lên Pages rev 20261102h (commit 43e6928d): cây thông, bảng theo prefab gốc, kệ có bát, đom đóm, tải ưu tiên; 39/39 bộ test local, test online qua. Còn lệch: xem PARITY.md (vòng lửa dưới nồi là mesh particle, ảnh 3D trạm trong FACILITY, 8 minigame phiêu lưu thiếu dữ liệu 3D).
- (cũ) Đợt 4: particles (hạt từ ParticleSystem gốc), integration (voi bán nội thất, gói shop trang phục/nội thất/skin, bảng nam châm, thưởng bướm, thưởng bộ cá), mèo con đi trong rừng.
- (cũ) Đợt 3: kitty (mèo con + du lịch), telescope (+ cây sao), minigame, season (sự kiện theo lịch máy), profile (+ chụp ảnh), guests (khách + khối trang trí).
- Đợt 2: nội thất + tháp mèo (Furniture, TowerProp, đồng xu), đèn + ngày đêm (Lamp), bộ sưu tập + sách tranh, cửa hàng (gem, gói quà; quảng cáo bấm là nhận), hướng dẫn đầu game, dời trạm, chủ đề trạm (WorkSkin, SignSkin, Theme).
- Đợt 3: du lịch (Travel*), kính viễn vọng (Telescope), cây sao (StarTree*), minigame (MiniGame, Magnet, Dice, Block), sự kiện mùa (Season*, Event*), soup pass.
