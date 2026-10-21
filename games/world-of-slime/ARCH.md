# Thế Giới Slime: kiến trúc lát cắt đầu (rev 20261021a)

Bản web của World of Slime Demo (TEAM42). Lát cắt này gồm: bản đồ thử, người chơi đi/chạy/lướt, một slime
đi theo, camera của game, điều khiển PC và mobile, tiếng bước chân. Chưa có đánh nhau thật, HUD, bắt slime.
Nghiên cứu gốc: `D:\wos-ref\notes\` (MAPBUILD, PIPELINE, EXPORT_*, CODE §8-9). Kế hoạch: `brain/plans/world-of-slime.md`.

## Mô-đun

| Tệp | Việc |
|---|---|
| `index.html`, `mobile.html` | hai trang (PC / mobile ngang), cùng `js/`, import map trỏ `vendor/` |
| `vendor/` | three.js r160 (npm three@0.160.0: `three.module.min.js`, GLTFLoader, SkeletonUtils, BufferGeometryUtils, LICENSE) |
| `js/config.js` | `REV`, `ASSETS` (+ `?assets=`), hằng số di chuyển và camera (số `[ĐỀ XUẤT]` ghi rõ) |
| `js/assets.js` | tải GLB/JSON/ảnh có đệm |
| `js/world/map.js` | **khuôn dữ liệu bản đồ (đầu tệp)**, đặt mảnh bằng InstancedMesh, `getHeight`, `canStand`, `landTypeAt`, cầu thang |
| `js/world/envmat.js` | toon cho mảnh bản đồ (MixMaster/Enviroment Base, Tile Blend, Water) |
| `js/actors/toon.js` | toon cho slime/người (Unit Matcap wip), chép từ `D:\wos-ref\proof\slime\sheet.html` |
| `js/actors/actors.js` | `Player.create(gender)` ghép avatar từ `player/index.json` defaults; `Slime.create(id)` |
| `js/input/intent.js` | ý định chung `{move, run, attack, skill[3], dash, whistle, interact}` + lượng tử 32 hướng |
| `js/input/pc.js`, `mobile.js` | bàn phím/chuột; cần ảo + nút bằng sprite thật `ui/Game/*` + chụm zoom |
| `js/camera.js` | FollowCamera: cúi 40 độ, vùng chết, kẹp `cameraMoveRect`, zoom |
| `js/audio.js` | một AudioContext, sự kiện Wwise -> ogg, switch `LandType` theo `landType[]` |
| `js/game.js` | vòng chơi; `window.WOS` để test đọc trạng thái |
| `tools/devmap.py` | vẽ bản đồ thử 48x40 bằng luật autotile của editor -> `data/maps/dev.json` |
| `tools/serve_cors.py` | http.server có CORS để test với asset cục bộ |

## Khuôn dữ liệu

- Bản đồ `data/maps/<id>.json` = `{ client: ClientMapData, tile: TileMapData, _dev?, web? }`, tên trường đúng như game
  (xem đầu `js/world/map.js`). Khi có `map_type_{id}_client.dat` + `_tile.dat` (MessagePack) chỉ cần đổi sang JSON, không sửa bộ dựng.
- Toạ độ logic là Unity: ô (x, z), x = `index % width`, z = `index / width`, +z lên trên màn hình. Chỉ lúc đặt Object3D mới
  đổi sang three `(-x, y, z)`. Mảnh đặt ở `(x + 0.5, floor, z + 0.5)`, đỉnh đi được = floor + 1.
- `web.blocked` (ngoài khuôn game): ô có cây/bụi/đá chặn đi, vì va chạm thật là dữ liệu server chưa có.

## Chạy

```
py -3.12 -m http.server 8841 --bind 127.0.0.1                                        # gốc repo
py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets   # asset cục bộ (tuỳ chọn)
http://127.0.0.1:8841/games/world-of-slime/index.html?assets=http://127.0.0.1:8842/
WOS_ASSETS=http://127.0.0.1:8842/ node test/world-of-slime-slice.js                   # đi 5 s PC + mobile, chụp vào D:\wos-ref\proof\slice
py -3.12 -I games/world-of-slime/tools/devmap.py                                     # dựng lại bản đồ thử
```
Tham số trang: `?assets=`, `?map=dev`, `?gender=woman`, `?slime=SL_Bat_WindDark`, `?at=x,z`, `?zoom=<m>`.
Phím PC: WASD/mũi tên đi, giữ Shift chạy, Space lướt, chuột trái đánh, Q/E/R skill, F tương tác, T gọi slime, lăn chuột zoom.
Bảng phím này theo việc được giao, khác game gốc (LShift = dash, Space = tương tác/đánh).

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

## Còn thiếu / chưa đúng

- Bố cục bản đồ thật (server). Bản đồ thử ghi `_dev` và trang hiện nhãn "bản đồ thử".
- Shader gốc chưa dịch ngược: không có gradient độ cao, matcap overlay, gió, sương dọc, hậu kỳ màu (game sáng và nhạt hơn).
- Tốc độ đi/chạy, số camera (vùng chết, tốc độ bám), lướt: `[ĐỀ XUẤT]`. Không có bóng đổ dưới chân nhân vật.
- Bộ nước kiểu Larus không có trong demo; ao dùng Water_01-A (bờ cỏ rừng xanh xám).
