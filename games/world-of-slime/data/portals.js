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
};

export const DEFAULT_MAP = 257;
