# Ga Chìm: bàn giao (2026-11-14)

Game FPS gốc dựng bằng code, chuẩn chất lượng là clip gameplay Saltline (`linux2:~/saltline/yt/f/*.jpg`). Chưa commit, chưa lên hub.

## Đã có
- `js/bake.js`: nung vật liệu PBR trên GPU (15 loại bề mặt).
- `js/mats.js`: vật liệu triplanar, mặt ướt, vũng nước, vùng ngập, nước đọng trên súng, giảm sáng trong nhà.
- `js/sky.js`: trời giông, khe nắng, env map.
- `js/post.js`: AO, SSR, god rays, sương, bloom, tonemap, grade.
- `js/level.js` và `js/props.js`: bãi ga 7 đường ray, các loại toa, đầu máy, cột điện, giàn đèn, 3 gác ghi, nhà kho, sân ga, đồ lặt vặt.
- `js/lights.js` và `js/rain.js`: đèn và mưa.
- `js/gunmodel.js` và `js/weapon.js`: súng carbine và tay, có lò xo giật, chớp lửa, vỏ đạn, đường đạn. Chưa nối điều khiển.
- Chụp ảnh: `node games/ga-chim/tools/shots.js <outDir> yard,alley,flood,platform,shed,boxcar,gun,gunads [q] [&param]`. Cờ debug: `nocone norays nofog nossr noao nobloom norain dry`.

## Lỗi đang mở
- Súng và tay trông xám sáng thay vì đen hoặc nâu. Đã thử hạ env xuống 0.35 và tắt mưa, ảnh vẫn không đổi. Uniform `uPaint` của găng tay đúng (6b5a40). Bước tiếp theo: in giá trị albedo trong shader của lớp viewmodel, xem ánh sáng chiếu vào layer 1 và depth của lượt vẽ viewmodel.
- Tư thế bàn tay chưa ôm đúng báng súng.

## Còn phải làm
- Điều khiển người chơi và va chạm.
- Bắn trúng và hiệu ứng va chạm.
- Kẻ địch: bọ sắt bò, drone.
- Nhiệm vụ: bật điện 3 gác ghi rồi lên đầu máy.
- HUD, màn tiêu đề, âm thanh.
- So từng cảnh với khung Saltline.
- Thumbnail, thẻ hub `ga-chim`, kiểm tra trên Pages.
