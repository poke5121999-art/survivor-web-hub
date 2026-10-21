// Hằng số dùng chung. REV phải khớp ?v= trong index.html / mobile.html và mọi import (hub: đổi rev mỗi lần đẩy).
export const REV = '20261022a';

const P = new URLSearchParams(location.search);
// Gốc asset: repo world-of-slime-assets trên Pages. ?assets=<url> để test trỏ vào http.server cục bộ.
export const ASSETS = (P.get('assets') || 'https://poke5121999-art.github.io/world-of-slime-assets/').replace(/\/?$/, '/');
export const PARAMS = P;

// Hướng sáng chung cho toon ramp (toạ độ three). [ĐỀ XUẤT] lấy theo proto/view.html, chưa đọc từ scene.
export const LIGHT_DIR = [-0.4, 0.85, 0.35];

// Di chuyển. Game gốc: tốc độ do server mô phỏng, client gửi speedStep 0..10 + handleAngle 32 hướng (11.25 độ),
// CODE.md §8. Số m/s không có trong client -> [ĐỀ XUẤT].
export const MOVE = {
  walk: 3.6,          // [ĐỀ XUẤT] m/s ở speedStep 10
  // không có tốc độ chạy riêng: game gốc không có phím chạy, tốc độ = walk * speedStep / 10 (PC luôn speedStep 10)
  dirs: 32,           // MainJoystick.FixedUpdate: 11.25 độ
  stepMax: 0.55,      // [ĐỀ XUẤT] bậc cao nhất leo được (m); vách 1 m trở lên chặn
  dash: { dist: 3.2, time: 0.22, cooldown: 0.8 },   // [ĐỀ XUẤT] DashRequest có trong code, số thì không
};

export const CAMERA = {
  pitch: 50,          // [ĐO TRONG ẢNH] level3 Main Camera rotation x = 40 (MAPBUILD §6), nhưng inn1.png: vách cao 135 px, sàn phòng ngủ 220 px chỉ khớp ở 50 độ (FollowCamera đặt lại góc lúc chơi)
  // Main Camera mặc định ở (0.39, 81, -94.18): cách mặt đất ~126 m, nên FOV rất hẹp (gần trực giao), cây
  // ở mép màn không bị phình. Đo frame v4van_hud_larus: nhà t01_house (9.35 m) rộng ~240/1024 px -> màn ngang ~40 m.
  fov: 8,             // [ĐO TRONG ẢNH] dọc, khi bản đồ không có cameraMoveRect (kho 478): Larus 110/257 ghi fov 8; v9/al4 chỉ khớp cỡ phòng ở 8 (10 cho phòng nhỏ 0.7 lần)
  // [ĐO TRONG ẢNH] 160: Main Camera level3 cách đất 126 m (81 / sin 40) nhưng khung chụp thật (FOV 8 của cameraMoveRect)
  // rộng hơn: quán trọ inn1.png vách trái -> vách giữa 410 px (web 126 m: 537 px), làng x2.png đài phun nước -> cửa quán
  // trọ (28 m) 940 px. Hai số cho 165 và 153 m.
  dist: 160,
  zoomMin: 80, zoomMax: 170,
  deadZone: [1.2, 0.8],   // [ĐỀ XUẤT] FollowCamera.deadZone (m, x/z), giá trị nằm trên prefab chưa đọc
  minSpeed: 1.5, maxSpeed: 14, distanceForMaxSpeed: 6,  // [ĐỀ XUẤT] tên trường theo FollowCamera
};
