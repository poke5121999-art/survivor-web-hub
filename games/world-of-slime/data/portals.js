// Cửa chuyển bản đồ, chỗ đứng NPC và tên bản đồ của Larus. Game gốc nhận cửa (portal) và NPC từ server lúc vào bản đồ
// (ObjectController), không có trong _tileData/_clientData/_collide, nên mọi số ở đây là `[ĐO TRONG ẢNH]`: đặt theo
// ảnh chụp demo thật D:\wos-ref\pilot\*.png (thước ảnh 1280x720: ~33.6 px/m ngang, ~21.6 px/m dọc, đo bằng khoảng cách
// đài phun nước (59.5, 69.5) tới cửa quán trọ (87.5, 71.2) trong x2.png), toạ độ Unity (x phải, z lên màn hình).
// Cửa toà nhà làng lấy từ mảnh "Plane" sương cửa trong map/index.json (t01_house_005_a, t01_depository_001_a): đó là số
// đo trong dữ liệu `[ĐO TRONG REPO]`, chỉ việc cửa đó dẫn vào bản đồ nào là đo trong ảnh.
//
// portal: { rect: [x0, z0, x1, z1] vùng bước vào là chuyển, to: id bản đồ đích, at: cửa đến bên kia }
// arrive[name]: { x, z, yaw } chỗ đứng khi tới qua cửa `name` (yaw độ: 0 = nhìn lên màn hình (+z), 180 = nhìn xuống)
// npcs: { name, model (npc/index.json id hoặc slime/index.json id), x, z, yaw, src }

export const MAPS = {
  257: {
    name: 'Larus Tavern',      // HUD "Larus / Larus Tavern" (inn1.png)
    start: { x: 9.7, z: 34.5, yaw: 180 },   // mở game: phòng ngủ cạnh giường (inn1.png) [ĐO TRONG ẢNH]
    portals: [
      // chân cầu thang xuống phía đông (w2.png góc phải dưới): HeightPropData cầu thang x 29.45..36.55; collide đi được tới x 34.5 (y ~0.6)
      { name: 'tavern_exit', rect: [34.0, 18, 37, 22], to: 110, at: 'tavern_door' },
    ],
    arrive: { tavern_door: { x: 28.2, z: 20, yaw: -90 } },   // lên tới đầu cầu thang, nhìn sang trái [ĐO TRONG ẢNH]
    npcs: [
      { name: 'Amy', model: 'NPC_Larus_Biggirl', x: 26.7, z: 27.8, yaw: 180, src: 'inn1.png, w1.png, w2.png (khăn xanh, tạp dề)' },
    ],
  },
  110: {
    name: 'Larus Village',
    portals: [
      // cửa quán trọ t01_house_005 (87, 73): Plane sương cửa ở (87.54, 71.21) rộng ~2 m [ĐO TRONG REPO]
      { name: 'tavern_door', rect: [86.4, 71.0, 88.7, 72.6], to: 257, at: 'tavern_door' },
      // cửa kho t01_depository_001 (83, 96): Plane sương cửa ở (83.49, 93.0) [ĐO TRONG REPO]
      { name: 'storage_door', rect: [82.3, 92.8, 84.7, 94.4], to: 478, at: 'storage_door' },
    ],
    arrive: {
      tavern_door: { x: 87.5, z: 69.6, yaw: 180 },   // out2.png: đứng ngay trước cửa quán trọ
      storage_door: { x: 83.5, z: 91.3, yaw: 180 },
      west_gate: { x: 28.5, z: 58.5, yaw: 90 },        // về từ rừng / sân đấu: ngay trong cổng tây, nhìn vào làng (5:39)
    },
    npcs: [
      { name: 'Lucy', model: 'NPC_Larus_Biggirl_4', x: 65.8, z: 76.0, yaw: 180, src: 'x2.png, x3.png, v3.png (mũ nồi, bảng vẽ; vật liệu CH_Public_NPC_ArtistLucy)' },
      { name: 'Billy', model: 'NPC_Larus_Bigman', x: 68.8, z: 64.1, yaw: 180, src: 'x2.png, x3.png (tóc đỏ)' },
      { name: 'Olivia', model: 'NPC_Larus_Biggirl_5', x: 60.0, z: 61.2, yaw: 180, src: 'x2.png, x3.png (sạp hàng hồng dưới đài phun nước)' },
      { name: 'Alice', model: 'NPC_Larus_Kidgirl', x: 85.6, z: 55.5, yaw: 180, src: 'out2.png, v2.png (mũ rơm)' },
      { name: 'Rudga', model: 'NPC_Larus_Bigman_3', x: 28.3, z: 63.7, yaw: 180, src: 'x4.png, x5.png, s1.png (mũ xanh lông đỏ)' },
      { name: 'Benjamin', model: 'NPC_Larus_Oldman', x: 34.1, z: 49.8, yaw: 180, src: 'x4.png, s1.png, b4.png (mũ sọc, ria trắng)' },
      // Vivian: tên không hiện trong ảnh nào; cô bán hàng tóc cam ở quầy t01_store_001 (x5.png, s1.png) là NPC_Larus_Shop
      { name: 'Vivian', model: 'NPC_Larus_Shop', x: 33.4, z: 73.0, yaw: 180, src: 'x5.png (quầy hàng, tên đoán)' },
      // F4: áo blouse trắng, kính (NPC_Larus_Researcher, chân dung NPC_Larus_Researcher_Default); đứng ngay phải hộp sách tím trên rương
      // gỗ (mảnh bản đồ ở ~50.6, 90.6), dưới lối gỗ lên phía bắc: clip 7:42 (cách đài phun -5.9, +16.7 m), 8:01, 11:01 [ĐO TRONG ẢNH]
      { name: 'Mysterious Researcher', model: 'NPC_Larus_Researcher', x: 53.0, z: 89.9, yaw: 180, src: 'clip 7:42, 8:01, 11:01 (cạnh hộp sách tím)' },
    ],
  },
  478: {
    name: 'Larus Storage',
    portals: [
      // hành lang cửa phía nam (v9.png: cửa tối giữa mép dưới), floors x 29..35, z 19..22; collide đi được tới z 19.5
      { name: 'storage_exit', rect: [29, 18.5, 36, 20.2], to: 110, at: 'storage_door' },
    ],
    arrive: { storage_door: { x: 32.5, z: 23.5, yaw: 0 } },   // v9.png: vào là đứng giữa phòng, nhìn lên quầy
    npcs: [
      { name: 'Allen', model: 'NPC_Larus_Store', x: 32.5, z: 41.0, yaw: 180, src: 'v9.png, al4.png, h5.png (tóc vàng sau quầy)' },
      { name: 'Wisp', model: 'SL_Wisp_Light', slime: true, x: 39.2, z: 44.9, yaw: 180, src: 'al4.png, h5.png (slime trắng cạnh giá sách phải)' },
    ],
  },
  // ---- DỰNG THEO CLIP (tools/forestmap.py, không phải dữ liệu server): chỗ đứng [ĐO TRONG CLIP] DcGavHFwqtk
  shadow_forest_entrance: {
    name: 'Shadow Forest Entrance', region: 'Shadow Forest', icon: 'img/mapicon/UI_Map_ShadowForest.webp', clip: true,
    portals: [
      // đường cổng đông ra mép bản đồ (5:48 đi vào từ phải) -> làng Larus, cổng tây
      { name: 'forest_exit', rect: [86, 25, 88, 30], to: 110, at: 'west_gate' },
    ],
    arrive: { larus_gate: { x: 82.5, z: 27.5, yaw: -90 } },   // 5:48: vừa qua rào cổng, nhìn sang trái
    npcs: [
      // Martin (say rượu, cốc bia, mắt xoáy): NPC_Larus_Fatman_3; đứng phía tây bắc cổng (5:51, 6:36)
      { name: 'Martin', model: 'NPC_Larus_Fatman_3', x: 66.5, z: 33.5, yaw: 180, src: 'clip 5:51, 6:36 (đầu hói, râu nâu, cốc bia)' },
    ],
  },
  rudga_arena: {
    name: 'Sân đấu', region: 'Shadow Forest', icon: 'img/mapicon/UI_Map_ShadowForest.webp', clip: true, duel: true,
    camAt: { x: 28, z: 21.2 },   // 5:24-5:36: camera đứng yên giữa sân, rào chiếm gần hết màn [ĐO TRONG CLIP]
    portals: [],
    arrive: { duel: { x: 19.5, z: 29.5, yaw: 135 } },   // 5:21: góc trái trên sân
    npcs: [
      { name: 'Rudga', model: 'NPC_Larus_Bigman_3', x: 37.5, z: 15.5, yaw: -45, src: 'clip 5:21-5:36 (góc phải dưới sân)' },
    ],
  },
};

// ---- Đồ đạc server gửi (F5a) ----------------------------------------------------------------------------------------
// Giường, tủ kính, lò sưởi, bàn tròn có cốc... không có trong _tileData: game nhận chúng từ server như vật thể (prefab
// `PR_*` của Addressables Object/Props, đã xuất ở prop/<tên thường>.glb). Mọi chỗ đặt là `[ĐO TRONG ẢNH]`: chiếu điểm
// chân vật trong ảnh demo thật (cùng khung camera test/world-of-slime-parity.js) xuống mặt sàn bằng camera của bản web
// rồi cộng +0.4 z (chân người chơi chiếu ra lệch 0.4..0.6 m). Mảnh PR_* đã có sẵn độ cao (đĩa trên quầy min y 0.91,
// gối trên ghế 0.66, cờ treo 2.8..7) nên mọi vật đặt ở mặt sàn `floors[]`. yaw độ theo Unity, mặc định 180 (lò sưởi + thùng: 0, prefab lò đã xoay gốc 180): mặt trước
// của PR_* nằm phía +z của prefab (yaw 0 thì tủ kính, cờ, giá sách, lò sưởi quay lưng về camera; đã chụp thử). Bàn tròn
// đặt theo mép dưới trong ảnh nên trừ thêm ~1 m z so với điểm chiếu tâm.
// { piece: tên prefab (= node trong GLB), glb, x, z, yaw?, src }
const P = n => 'prop/' + n.toLowerCase() + '.glb';
export const PROPS = {
  257: [
    { piece: 'PR_bed_001', x: 7.2, z: 35.5, src: 'inn1.png, w1.png (giường xanh, đầu giường sát vách sau)' },
    { piece: 'PR_barrel_001', x: 11.6, z: 36.3, yaw: 0, src: 'inn1.png, w1.png (thùng có sách xanh + chổi)' },
    { piece: 'PR_flag_001', x: 14.6, z: 37.4, src: 'inn1.png, w1.png (cờ xanh huy hiệu treo cột)' },
    { piece: 'PR_cabinet_001', x: 17.8, z: 36.6, src: 'inn1.png, w1.png (tủ kính vòm)' },
    { piece: 'PR_oven_001', x: 29.1, z: 36.5, yaw: 0, src: 'w1.png (lò sưởi gạch có ống khói sau quầy)' },
    { piece: 'PR_fish_001', x: 26.7, z: 32.7, src: 'w1.png (gà quay + 2 cốc bia trên quầy; prefab tên PR_fish_001, PR_dish_002 chỉ là đĩa trắng)' },
    { piece: 'PR_table_016', x: 18.7, z: 26.3, src: 'inn1.png, w1.png (bàn tròn 2 cốc bia)' },
    { piece: 'PR_table_012', x: 31.1, z: 25.3, src: 'w1.png (bàn tròn đĩa cá)' },
    { piece: 'PR_table_011', x: 21.8, z: 21.1, src: 'inn1.png, w1.png (bàn tròn có bản đồ)' },
  ],
  478: [
    { piece: 'PR_bookshelf_002', x: 25.6, z: 45.8, src: 'al4.png (giá sách đầy, trái sau quầy)' },
    { piece: 'PR_bookshelf_003', x: 39.7, z: 45.8, src: 'al4.png (giá sách đầy, phải sau quầy)' },
    { piece: 'PR_bottle_001', x: 31.0, z: 45.5, src: 'al4.png (hai bình thuốc trên bàn sau Allen)' },
    { piece: 'PR_book_002', x: 34.0, z: 45.5, src: 'al4.png (hàng sách trên bàn sau Allen)' },
    { piece: 'PR_table_015', x: 26.2, z: 34.7, src: 'al4.png (bàn góc sắt có chai thuyền)' },
    { piece: 'PR_cushion_001', x: 40.6, z: 34.5, src: 'al4.png (gối trên ghế dài phải)' },
    { piece: 'PR_cushion_001', x: 27.0, z: 27.5, src: 'al4.png (gối trên ghế dài trái dưới)' },
  ],
};
for (const l of Object.values(PROPS)) for (const o of l) { o.glb = o.glb || P(o.piece); if (o.yaw == null) o.yaw = 180; }

export const DEFAULT_MAP = 257;
