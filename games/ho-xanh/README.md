# Hố Xanh

Dựng lại cảm giác vòng lặn xiên cá ở vùng nông Hố Xanh của Dave the Diver. Hình Dave, cá Spine, bản đồ 3D, hiệu ứng và tiếng đều lấy từ bản gốc (xem `tools/README.md`). Mỗi lượt lặn chọn ngẫu nhiên một trong sáu bản đồ A01..A06. Lên tới mặt nước là mang cả túi cá về. Cạn dưỡng khí là ngất, chỉ giữ được một con.

## Điều khiển

| Việc | Bàn phím + chuột | Cảm ứng (ngang máy) |
|---|---|---|
| Bơi 8 hướng | WASD hoặc mũi tên | kéo nửa trái màn hình |
| Tăng tốc (đốt khí nhanh hơn) | Shift | giữ nút **Tăng tốc** |
| Lướt ngắn | Space | nút **Lướt** |
| Ngắm / bắn xiên | giữ chuột trái để ngắm, thả để bắn | giữ nửa phải để ngắm, thả để bắn |
| Giằng co với cá lớn | bấm liên tục chuột trái hoặc Space | chạm liên tục |
| Dao | F hoặc chuột phải | nút **Dao** |
| Tạm dừng / tắt tiếng | P hoặc Esc / M | nút ‖ / nút loa |

Hòm dưỡng khí tự mở khi chạm vào. Thêm `?map=A03` vào URL để chọn cố định một bản đồ.

## Tệp

| Tệp | Làm gì |
|---|---|
| `index.html` | Khung trang, CSS, HUD bằng DOM. Mọi `<script>`/ảnh gắn `?v=<rev>` |
| `data/tuning.js` | Mọi con số, nhãn `[DtD]` (bản gốc) hoặc `[ĐỀ XUẤT]` (tự chọn) |
| `js/world.js` | Va chạm 2D trên đa giác vách gốc: trong/ngoài, trượt theo vách, tia xiên, mép đá ngửa lên |
| `js/gfx.js` | Vẽ vào khung thấp rồi phóng nearest; bộ đổ màu nước theo độ sâu dùng chung cho đá, sprite, Spine |
| `js/level.js` | Nạp glb, trang trí san hô/rong trên mép đá, vệt nắng, bụi, mặt nước, hòm dưỡng khí |
| `js/dave.js` | Sprite Dave + lớp tay súng, máy trạng thái người lặn |
| `js/harpoon.js` | Mũi xiên và dây |
| `js/fish.js` | Nạp Spine, máy trạng thái cá, bộ sinh cá quanh camera, ảnh nhỏ cho thẻ bắt cá |
| `js/fx.js` | Hạt hiệu ứng theo bảng `KINDS` |
| `js/hud.js`, `js/audio.js` | DOM phủ trên cảnh; Web Audio |
| `js/main.js` | Các pha, nhập liệu, camera, móc `window.HX_DEBUG` cho bộ kiểm |

## Máy trạng thái

- Pha: `title → loading → dive → result`, rồi "Lặn tiếp" quay lại `loading`.
- Dave: `enter | swim | dash | aim | shoot | reel | tug | melee | hurt | surfaced | dead`. Tăng tốc là cờ của `swim`.
- Xiên: `ready → flying → (stuck | returning) → ready`.
- Cá: `wander | flee | chase | defend | hooked | dying | reeled`. Cá nóc dùng `defend` (phồng gai).

## Đo mới biết [ĐO TRONG REPO, 2026-09-24]

- **Ảnh Spine của mọi loài cá quay đầu về +x.** Cá bơi sang phải thì `scale.x = +1`.
  - Bản đầu ghi ngược (−x) và cả đàn bơi giật lùi trên Pages. Chủ dự án thấy ngay: "cá đang moon walk".
  - Kiểm bằng mắt, đừng suy: xếp cả 65 loài đứng yên với `facing = 1` rồi chụp. Ở cá hồng đen trắng và cá mó đầu gù, đuôi chẻ nằm bên phải.
  - Prefab gốc không có cờ lật nào: `SkeletonMecanim.initialFlipX = 0` ở mọi loài đã xem.
- **Đá glb nhô ra trước mặt phẳng chơi z=0 từ 2 tới 10 m** (trung vị 4,5 m), đo bằng tia bắn dọc −z trên các điểm nằm trong đa giác vách.
  - Camera phải lùi ≥ 12 m, nếu không đá tiền cảnh phình to che nửa màn hình.
  - Vẫn còn chỗ đá che Dave. Mảnh đá có z > 0,8 được lưới điểm thưa dần quanh Dave (`view.cutRadius`).
- **Mép trên `cameraBound` của cả sáu bản đồ là y=19.** Vách hai bên cao tới y≈29. Mặt nước đặt ở y=20,5 `[ĐỀ XUẤT]`.
- **Đáy các bản đồ A để hở ở y≈−36.** Dave bị chặn cứng ở `box.minY + 0,4`.
- **Hòm dưỡng khí của A06 lơ lửng** 0,8 m và 1,4 m trên đá. Game hạ hòm xuống mặt đá gần nhất bên dưới trong vòng 3 m.
- **Hàng `Cheer` (hàng 6) trong sheet Dave là Dave mặc đồ trên bờ**, không phải đồ lặn. Lúc trồi lên dùng `Relief` rồi `Idle`.
- **Trường `icon` của cả 55 loài cá đều là null.** Thẻ bắt cá tự vẽ ảnh nhỏ từ khung đầu của hoạt ảnh bơi.
- Ô `HookAttackArm` đặt chung gốc với ô thân `HookAttackReady` là khớp vai. Đầu nòng cách khớp vai (0,14; −0,06) m.
- Nhiều ảnh san hô gốc là trắng xám; bản gốc tô bằng `SpriteRenderer.color`. Game tô bằng bảng màu `CORAL_TINTS` `[ĐỀ XUẤT]`.

## Chọn khác bản gốc [ĐỀ XUẤT]

- Góc nhìn 26° thay cho 38° của MainCamera gốc. Không biết khoảng cách camera gốc. Với 38° thì hoặc Dave quá nhỏ, hoặc đá tiền cảnh phình to. 26° ở 14 m giữ Dave cao ~8% màn hình (đo trên ảnh chụp 720p: ~55 px).
- Khung vẽ thấp giữ 100 px/m ở mặt z=0 (đúng mật độ sprite gốc): cao 650 dòng, thấp hơn nếu màn thấp hơn. Màn 1080p phóng ~1,7 lần.
- Dave chết thì giữ con cá hạng cao nhất. Bản gốc cho người chơi tự chọn một món.

## Kiểm

```
node test/ho-xanh-suite.js      # SHOTS=<thư mục> để đổi chỗ lưu ảnh
```

Chạy ở 1280×720 và 844×390 trên bản đồ A01. Bộ kiểm có các bài: nạp glb đủ 166 mảnh, Dave có trên hình, bơi vào vách không lọt đá, xiên và dao bắt được cá, tiếng được gọi đúng, ngất giữ đúng một con, lên bờ giữ cả túi, không lỗi trang.
