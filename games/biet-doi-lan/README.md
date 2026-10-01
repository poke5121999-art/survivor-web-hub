# Biệt Đội Lặn

Dave the Diver ghép R.E.P.O. Một ca là năm chuyến lặn ở năm vùng biển. Chuyến sau sâu hơn và chỉ tiêu cao hơn. Độ sâu chia thành tầng, mỗi tầng là một "phòng" như nhà REPO. Bắn móc vào đồ cổ dưới đáy rồi kéo dây lên cano. Đủ chỉ tiêu thì vào khoang lái để chạy về quán Bancho, giờ là trạm mua đồ. Dưỡng khí là máu. Thiết kế và lịch sử quyết định: `brain/plans/biet-doi-lan.md`.

Vào game: `index.html` mở sảnh REPO. `index.html?map=0..4` vào thẳng một chuyến lặn (bản thử, không qua sảnh và cano), thêm `&mates=loot,baoke,san,cuuho` để có đồng đội.

## Vòng chơi

Sảnh → RA KHƠI (`BDL.meta.runStart`) → cano ra (`cruise`) → lặn map 0 → khoang lái → cano về → trạm (`shop`) → cano ra → map 1 … → map 4 → cano về → `BDL.meta.runFinish` (vàng = 55% tiền đã giao + thưởng chuyến) → sảnh. Hết O₂ là thua ca, vẫn nhận phần đã giao. Luồng nằm trong `js/main.js` (`BDL.onSail`, `G.onExtract`, `G.onDead`, `finishRun`).

## Điều khiển

| Việc | PC | Cảm ứng (ngang) |
|---|---|---|
| Bơi / đi trên boong | WASD | cần nổi nửa trái |
| Tăng tốc (đốt thể lực) | giữ Space hoặc Shift dưới nước | nút Chạy (bật/tắt) |
| Nhảy xuống nước | Space trên boong | nút Nhảy |
| Súng móc (ô 0) / dùng món đang cầm (ô 1-3) | giữ chuột trái ngắm theo con trỏ, thả để bắn; đang kéo thì bấm lại để thả | kéo nút bắn lớn để ngắm, thả để bắn |
| Đổi món | lăn chuột, phím 1-3 | nút Đổi, chạm ô tay cầm |
| Leo lên thuyền (kéo theo vật đang móc, xả cá), mở tủ đồ | E | nút E |
| Kỹ năng crew | R | nút kỹ năng |
| Dao | F | nút dao |
| Drone chở đồ (3 lần mỗi chuyến) | Ctrl | nút drone |

**Không có ngắm tự động.** Chạm nút bắn mà không kéo thì bắn thẳng theo hướng mặt. **Không có phím móc riêng.** Móc chính là súng xiên (chủ dự án yêu cầu, 2026-10-01).

## Tệp

| Tệp | Việc |
|---|---|
| `index.html` | vỏ trang, HUD, nút cảm ứng; `window.HX_ROOT = '../ho-xanh/'` trước mọi script |
| `data/maps.js` | `BDL.MAPS` (5 chuyến), `BDL.floorsOf`, `BDL.floorAt` |
| `data/content.js`, `js/meta.js`, `js/ui.js`, `css/lobby.css` | sảnh REPO: crew, gacha 3 băng, nạp giả, nhiệm vụ, đồ nghề; số theo `D:\REPO_Meta\gamespark-config` |
| `js/run.js` | sổ ca và chuyến: chỉ tiêu REPO, giao hàng, trần bán quái 3, giá cá/xác |
| `js/main.js` | máy chủ: sổ pha, sổ hệ `BDL.systems`, nhập liệu, camera, vòng ca, `BDL_DEBUG` |
| `data/loot.js`, `js/loot.js` | đồ cổ gốc DtD rải theo tầng, va đập trừ tiền/vỡ, chìm |
| `js/tether.js` | dây móc: lò xo, kéo dần, căng đỏ rồi đứt |
| `data/foes.js`, `js/foes.js` | quái REPO trên cá mập/cá dữ DtD: ngủ, đi lùng, nghe tiếng, hồi sinh 45 s |
| `js/mates.js` | 4 đồng đội lặn cùng, sprite sinh từ sheet Dave (đổi màu + chi tiết), việc theo chiến thuật |
| `js/ship.js`, `css/ship.css` | cano Nodens 68 nổi trên mặt biển: boong, leo, đống đồ, tủ, khoang lái 5 s, túi cá theo ký |
| `js/items.js`, `js/locker.js`, `css/locker.css` | 3 ô tay cầm, súng/cận chiến/ném/O₂/dụng cụ, tủ đồ gỗ, drone, chỉ số crew + nâng cấp |
| `js/skills.js` | 14 kỹ năng R |
| `js/hud.js`, `css/hud.css` | HUD kiểu REPO cho PC và cảm ứng |
| `js/cruise.js` | cano chạy về quán / ra khơi (fork `ho-xanh/js/boat.js`) |
| `js/shop.js`, `css/shop.css` | quán Bancho thành trạm REPO; `BDL.restock` nạp đạn đầu mỗi chuyến |
| `js/engine/*.js` | fork bộ máy lặn Hố Xanh |
| `art/dtd/` | đồ cổ, icon đồ nghề, cano bóc từ Dave the Diver bằng `tools/rip_loot.py` (tên ở `tools/dtd-sprite-index.md`) |

Mỗi hệ đăng ký `BDL.systems.push({ name, build(G, map), update(dt, input), teardown(G) })`. Thứ tự gọi là thứ tự nạp tệp.

## Dùng chung kho với Hố Xanh

Không chép art, tiếng, vendor, dữ liệu. `index.html` nạp `../ho-xanh/vendor/*` và `../ho-xanh/data/*`. Mọi đường dẫn asset trong bản fork đi qua `HX.ROOT` (khai ở `js/engine/world.js`). Hố Xanh không bị sửa. Khoá lưu chỉ `bdl.*`.

## Chạy bộ kiểm

```
node test/biet-doi-lan-suite.js    # 5 map, tầng, O₂, thể lực, bức chắn đáy
node test/biet-doi-lan-flow.js     # đi đúng đường người chơi: sảnh → cano → lặn → móc bằng chuột → trạm → chuyến 2
node test/biet-doi-lan-lobby.js    # sảnh, gacha, nạp giả, nhiệm vụ, đồ nghề
node test/biet-doi-lan-ship.js     # boong, nhảy, leo, xả cá, đống đồ, khoang lái
node test/biet-doi-lan-tether.js   # đồ cổ, móc, va đập, đứt dây
node test/biet-doi-lan-foes.js     # ngủ, đi lùng, nghe tiếng, hồi sinh, trần bán 3
node test/biet-doi-lan-shop.js     # cano, trạm
node test/biet-doi-lan-hud.js      # HUD, 14 kỹ năng
node test/biet-doi-lan-items.js    # tay cầm, đồ, tủ, drone, chỉ số
node test/biet-doi-lan-mates.js    # đồng đội
BASE=https://poke5121999-art.github.io/survivor-web-hub node test/biet-doi-lan-flow.js   # trên bản Pages
```

## Đo mới biết

- **[BẪY ĐÃ SẬP] Màn cano phủ trong suốt lên cảnh lặn, nuốt hết chuột** [ĐO TRONG REPO, 2026-10-01].
  - `css/shop.css` có `#scr-cruise { display: block }`, luật id này thắng `.screen[hidden] { display: none }`. Sau chuyến cano, `#scr-cruise` không ẩn, phủ kín màn hình, canvas không nhận `mousedown`. Người chơi bắn móc không được.
  - Mọi bộ kiểm khi ấy vào thẳng `?map=N`, không đi qua cano, nên 588 bài xanh mà lỗi vẫn lên Pages. Chủ dự án là người chơi thật đầu tiên đi đường sảnh → cano.
  - Sửa: `.screen[hidden] { display: none !important; }` và `#scr-cruise:not([hidden])`. Khoá bằng `test/biet-doi-lan-flow.js`: trên bản lỗi nó đỏ 6 bài (`SECTION#scr-cruise` ở giữa màn, móc `idle`), trên bản sửa xanh 17/17.
  - Kiểm nhanh: `document.elementFromPoint(640, 360)` trong lúc lặn phải là `CANVAS#scene`.
- **Bản đầu trừ 8 O₂/s dưới tầng cuối ("vùng áp suất").** Map 0 chỉ 5 tầng (đáy y = −44,5) mà hình map còn kéo sâu tiếp, nên chủ dự án bơi lọt xuống và thấy "cứ bơi xuống sâu là mất máu". Giờ đáy tầng cuối là bức chắn: đẩy Dave lên, không trừ O₂, cảnh báo giữ thêm 2 s.
- Vùng A chỉ sâu 56,5 m (mặt nước y = 20,5 xuống đáy y ≈ −36). 5 tầng cần 65 m, nên map 0 phải thêm B vào lộ trình. Cá map 0 vẫn chỉ sinh ở A nhờ `tiers: 'A'`.
- Dải tầng k (0-based): y0 = 20,5 − 13k, y1 = 20,5 − 13(k+1).

| Map | Tên | Theme | Lộ trình | Tầng | y1 tầng cuối |
|---|---|---|---|---|---|
| 0 | Rạn San Hô | day | A01, B01 | 5 | −44,5 |
| 1 | Rừng Tảo | kelp | A06, B03 | 7 | −70,5 |
| 2 | Hoàng Hôn | evening | A04, B06 | 10 | −109,5 |
| 3 | Mưa Giông | rain | A05, B02, C03 | 13 | −148,5 |
| 4 | Vực Đêm | night | A03N, B04N, C03 | 16 | −187,5 |

- Map 4 cần C mà bản gốc không có C đêm: A03N → B04N đêm rồi C03 ban ngày dùng ánh sáng đêm. Vệt hải quỳ trắng ở map đêm có y hệt trong Hố Xanh cùng toạ độ, không phải lỗi của bản fork.
- Xác thuyền kéo gắt đứt dây sau khoảng 2,75 s (đúng luật). Bài kiểm phao từng đo chậm 2 s rồi mới dùng phao, đua với lúc đứt dây nên hỏng 1/3 lần; giờ đo 0,9 s.
- `ship.js addPile`: `iconTex` gọi callback ngay khi ảnh đã có trong bộ đệm, trước khi sprite được gán, nên lần giao thứ hai cùng hình ném `TypeError`. Giữ cỡ lại rồi đặt sau khi tạo sprite.
- Quái nhắm cả đồng đội (`foes.js`, `BDL.foes.targetsMates = true`); `mates.js` thôi tự trừ O₂ khi chạm để khỏi trừ hai lần.
