# Biệt Đội Lặn: Dave the Diver × R.E.P.O.

Yêu cầu chủ dự án (2026-10-01): làm game mới ghép Dave the Diver với bản REPO top-down Unity
(`D:\REPO_Meta`). Một ca là 5 lần lặn ở 5 theme, càng về sau càng sâu và chỉ tiêu càng cao. Độ sâu
chia theo tầng, mỗi tầng là một phòng của REPO. Thuyền trên mặt biển là chỗ extract. Bắn móc vào đồ
cổ rồi kéo dây lên thuyền. Quái ngủ, sinh xa, hồi sinh, bán tối đa 3 lần mỗi loài. Quán đổi thành
trạm mua đồ. Một tay cầm một món. Oxy là máu. Có crew, gacha, nạp giả và nâng cấp như REPO.

Thư mục: `games/biet-doi-lan/`. Art, tiếng, map đọc thẳng từ `games/ho-xanh/` (không chép 93 MB).

## Định nghĩa xong

Trên Pages (`.../games/biet-doi-lan/index.html`), cả PC lẫn điện thoại cầm ngang:
sảnh REPO → chọn crew → RA KHƠI → lặn map 1 → móc đồ cổ kéo lên thuyền, săn cá, giết quái kéo xác
lên → vào khoang lái, đếm ngược → thuyền về quán-trạm → mua đồ → map 2 … map 5 → về sảnh nhận vàng.
Bộ kiểm `node test/biet-doi-lan-*.js` xanh trên bản Pages, không lỗi trang.

## Nguồn

- Báo cáo khảo sát (2026-10-01, ở scratchpad phiên, đã tóm vào đây):
  - Hố Xanh: bộ máy lặn tái dùng được (dave, harpoon, gun, fish, shark, drone, level, world, dive,
    fx, audio). Mọi đường dẫn asset là tương đối với trang. Khoá lưu `hx.*` cứng. Thuyền là cảnh cắt,
    không đi lại được.
  - Biệt Đội web (`repo-squad` + `repo2d`): meta không phụ thuộc engine. Cầm đồ là ghim cứng trước
    mặt, không có lò xo. Quái web không ngủ đầu ca; không có trần bán theo loài.
  - REPO_Meta (Unity, số 2026-09-29 trong `gamespark-config/*.json`): crew lên tối đa cấp 10
    (`200×(lv+1)` vàng + 1 mảnh), 3 băng gacha (thường + `lim1` + `lim2`), ngủ đầu ca, hồi sinh 45 s,
    trạm 3 ô nâng cấp + 5 ô đồ + túi máu, đạn đầy lại mỗi nhà, nhà 1..5 có 5/7/10/13/16 phòng.

## Hình dạng dữ liệu

- `data/maps.js` → `BDL.MAPS[5]`: `{id, name, theme, route|plan, floors, level, quotaMul, lootMul,
  hpMul, dmgMul, foes[]}`. `floors` = 5 / 7 / 10 / 13 / 16 như số phòng nhà REPO.
  - Tầng = một dải cao ~13 m thế giới (một khung camera). `BDL.floorsOf(stack, map)` trả mảng
    `{i, y0, y1}` tính từ mặt nước. Dưới tầng cuối là **vùng áp suất**: trừ oxy theo giây, camera
    dừng ở mép. Không cắt hình map.
- Ca: `run = {mapIdx, wallet, delivered, upg{}, stash[], sold{foeKind: n}, droneLeft, seed}`.
  Máy trạng thái pha: `lobby → dive(i) → cruise → shop → dive(i+1) … → result → lobby`.
- Trong lượt lặn:
  - `Loot {kind, mat, mass, value0, value, pos, vel, sink, state: rest|tethered|sinking|onDeck|gone}`
    giả giao diện `Fish` để xiên, súng, drone, HUD dùng chung.
  - `Tether {from: diver, to: Loot|Fish|Corpse, rest, strain, state: flying|attached|reeling|snapped}`.
    Dây căng quá ngưỡng (theo khối lượng so với sức kéo) thì `strain` tăng dần; đầy là đứt, vật chìm.
  - `Foe` = cá dữ / cá mập / quái bọc thêm não REPO: `asleep|patrol|alert|chase|attack|tired|dead`,
    sinh ≥ 30 m cách thuyền và người, ngoài khung nhìn; ngủ đầu lượt `(40..60)×(1−(lv−1)/10)^2.9` s.
    Chết → xác kéo được; `run.sold[kind] ≥ 3` thì xác tan. Hồi sinh 45 s.
  - `Hand {slots[3], active}`: một món cầm tay; súng/cận chiến có `uses`, đầy lại đầu mỗi lượt lặn.
- Quy đổi: tiền trên boong (đồ cổ + cá + xác) cộng vào `run.delivered`. Chỉ tiêu
  `= Σ giá đồ cổ rải × 0,7 × curve(level) × 0,55 × quotaMul` (công thức REPO, người chơi một mình).
  Hết ca: vàng sảnh = `round(delivered × 0,55)` + thưởng phá đảo.

## Pha (mỗi pha một đơn vị kiểm được, xong thì push và chơi trên Pages)

1. **Khung.** Fork bộ máy lặn Hố Xanh vào `js/engine/` với gốc asset `HX.ROOT`, khoá lưu `bdl.*`,
   5 map + tầng + vùng áp suất, oxy chỉ tụt khi trúng đòn, stamina cho tăng tốc. Thẻ hub.
   Kiểm: vào được cả 5 map, số tầng 5/7/10/13/16, đứng yên 10 s oxy không tụt.
2. **Song song (tệp rời nhau):**
   - Thuyền: boong đi được, Space nhảy xuống, E leo lên kèm vật đang kéo, đồ tự gom một chỗ,
     tủ đồ (E), khoang lái đếm ngược 5 s.
   - Đồ cổ + móc dây: bắn móc, dây lò xo, kéo dần, bấm lại thả, va đập trừ tiền / vỡ, đứt dây chìm.
   - Quái REPO: ngủ, sinh xa, phát hiện, đuổi, cắn người và cắn đồ, hồi sinh, trần bán 3.
   - Sảnh REPO: crew, gacha, cửa hàng nạp giả, nhiệm vụ, nâng cấp, đồ nghề, theo số REPO_Meta.
   - Trạm: quán Bancho thành trạm REPO, bày hàng, mang ra quầy, đứng 3 s trả tiền.
3. **Ghép:** cá theo ký + xả cá, xác cá to kéo dây, tay cầm 3 ô + đổi, súng/bom/cận chiến, thuốc,
   drone 3 lần, kỹ năng R, HUD REPO cho PC và cảm ứng.
4. **Cân bằng và kiểm cả ca** bằng bot trên Pages, ghi số đo vào README game.

## Chọn mặc định (nói rõ với chủ dự án, sai thì sửa)

- Người lặn luôn là Dave (bản gốc chỉ có sprite Dave). Crew đổi chỉ số và kỹ năng R, hình crew REPO
  chỉ hiện ở sảnh. Bốn đồng đội cộng chỉ số theo chiến thuật như REPO squad thật (bot không lặn).
- Quái là cá mập / cá dữ DtD mang não REPO, không dùng sprite top-down của REPO dưới nước.
- Thiếu cửa khoang lái trong art gốc thì dùng thân `boat.glb` của Hố Xanh nhìn ngang.
- Trần bán quái tính theo loài, theo từng lượt lặn.

## Đợt chỉnh 2026-10-02 (chủ dự án chơi thử)

- Đồ cổ vẽ to 1,5 / 1,75 / 2 lần thân Dave, có viền vàng. Vòng va chạm giữ theo thân vật lý cũ để kéo lọt hang.
- Minimap kiểu REPO ở góc trái trên, dưới thanh O₂ (`js/minimap.js`).
- Cá: nhỏ là cảnh (không trúng, không chết), vừa và sứa giằng co xong vào túi (tối đa 8 kg mỗi con), lớn kéo xác. Cá ngựa và tôm bỏ, thay bằng cá lớn / sứa (`data/fish.js`).
- Chết: xác nằm yên, chỉ về thuyền khi người khác kéo, tới thuyền thì hồi 25% O₂. Dave gục mà còn đồng đội sống thì chưa hết ca (`js/bodies.js`).
- Tiền: quỹ mỗi map = 3 × chỉ tiêu, chia đồ cổ 60 / cá 25 / xác quái 15 (`BDL.run.settle`).
