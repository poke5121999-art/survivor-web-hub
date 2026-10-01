# Biệt Đội Lặn

Dave the Diver ghép R.E.P.O.: một ca là năm lần lặn ở năm theme, càng về sau càng sâu và chỉ tiêu càng cao. Độ sâu chia thành các tầng (mỗi tầng một phòng như nhà REPO), dưới tầng cuối là vùng áp suất. Dưỡng khí là máu: không hao theo thời gian hay độ sâu, chỉ tụt khi bị cắn hoặc ở vùng áp suất. Tăng tốc đốt thể lực. Thiết kế đầy đủ ở `brain/plans/biet-doi-lan.md`. Bản này mới là phase 1 (khung): vào thẳng `?map=0..4`, lặn, chưa có thuyền, đồ cổ, quái REPO, sảnh, trạm.

## Tệp

| Tệp | Việc |
|---|---|
| `index.html` | vỏ trang, HUD, nút cảm ứng; đặt `window.HX_ROOT = '../ho-xanh/'` trước mọi script |
| `data/maps.js` | `BDL.MAPS` (5 lượt lặn), `BDL.floorsOf(stack, map)`, `BDL.floorAt(y)` |
| `js/main.js` | máy chủ: nhánh lặn của Hố Xanh, tầng, vùng áp suất, thể lực, `window.BDL_DEBUG` |
| `js/hud.js` | HUD fork: O₂, thể lực, "Tầng k/N · d m", cảnh báo áp suất, ô chỉ tiêu, nút cảm ứng |
| `js/engine/*.js` | fork của Hố Xanh: world gfx dive audio fx level fish dave harpoon gun drone shark |
| `test/biet-doi-lan-suite.js` | bộ kiểm Playwright (ở thư mục `test/` của repo) |

Phần khác (`data/content.js`, `js/meta.js`, `js/ui.js`, `css/lobby.css`, `dev-lobby.html`) do luồng khác viết.

## Dùng chung kho với Hố Xanh

Không chép art, tiếng, vendor, dữ liệu. `index.html` nạp `../ho-xanh/vendor/*` và `../ho-xanh/data/*` (tuning, assets, fish_spawn, zones, gear_sheet, boat_assets, meta, shark_assets, mobile_ui). Mọi đường dẫn `art/`, `audio/`, `level/` trong bản fork đi qua một gốc `HX.ROOT = window.HX_ROOT || ''` (khai ở `js/engine/world.js`). Các chỗ đã đổi: `gfx.js` (TextureLoader), `fish.js` (spine AssetManager), `fx.js` (3 lần fetch json), `shark.js` (glb và shark_vfx.json), `drone.js` (glb), `audio.js` (src), `main.js` (glb bản đồ), `hud.js` (ảnh phím). Hố Xanh không bị sửa.

Khoá lưu: chỉ `bdl.*` (`bdl.save.v1`, `bdl.ui`, `bdl.mute`). Bản fork engine khác Hố Xanh ở ba chỗ, đều có chú thích: `dave.js` (bỏ hao O₂ theo giờ/độ sâu, thêm `stamina`, tăng tốc cần ≥ 8 thể lực và hết thì phải nhả phím, `hurt(..., soft)` cho nhịp áp suất), `fish.js` (`G.spawnOk` lọc chỗ sinh cá), `world.js` (`HX.ROOT`).

## Điều khiển

WASD bơi; Shift hoặc giữ Space tăng tốc (đốt 22/s, hồi 16/s, x1,4 khi đứng yên); chuột trái ngắm và bắn xiên; F dao; E nhặt xác; Ctrl drone; P hoặc Esc tạm dừng; M tắt tiếng. Space không còn là lướt; Space vẫn bấm giật dây khi giằng co. Chạm: cần nổi, nút bắn, nút tăng tốc (bật/tắt).

## Chạy bộ kiểm

```
node test/biet-doi-lan-suite.js
```

Tự dựng máy chủ tĩnh ở gốc repo (hoặc `BASE=https://.../` để kiểm bản trên mạng), mở từng map 0..4 ở 1280x720 và 844x390: vào pha dive, số tầng 5/7/10/13/16, Dave trong khung, đứng yên 8 s O₂ không đổi, giữ Space thể lực tụt rồi hồi, xuống dưới tầng cuối O₂ tụt và hiện cảnh báo, không lỗi trang. Ảnh ra `%TEMP%/bdl-shots`. Cần Playwright (đường dẫn qua `PLAYWRIGHT_PATH`).

## Đo mới biết

- Vùng A chỉ sâu 56,5 m (mặt nước y=20,5 xuống đáy y≈-36). 5 tầng cần 65 m, nên map 0 "chỉ A" phải thêm B vào lộ trình để đủ độ sâu. Cá của map 0 vẫn chỉ sinh ở A nhờ `tiers: 'A'`. `BDL.floorsOf` ném lỗi nếu lộ trình quá nông.
- Lộ trình và đáy chuỗi (đã loang ô bằng cách của `ho-xanh/tools/route-check.js`, bơi từ mặt xuống tới được tầng cuối):

| Map | Tên | Theme | Lộ trình | Đáy chuỗi y | Tầng | y1 tầng cuối |
|---|---|---|---|---|---|---|
| 0 | Rạn San Hô | day | A01, B01 | -125,1 | 5 | -44,5 |
| 1 | Rừng Tảo | kelp | A06, B03 | -124,3 | 7 | -70,5 |
| 2 | Hoàng Hôn | evening | A04, B06 | -124,2 | 10 | -109,5 |
| 3 | Mưa Giông | rain | A05, B02, C03 | -252,4 | 13 | -148,5 |
| 4 | Vực Đêm | night | A03N, B04N, C03 | -251,4 | 16 | -187,5 |

- Dải tầng k (0-based): y0 = 20,5 − 13k, y1 = 20,5 − 13(k+1). Map 4 là 16 tầng = 208 m nên bắt buộc có C; bản gốc không có C đêm. Chọn A03N→B04N đêm rồi C03 ban ngày, dùng ánh sáng đêm (`THEMES.night`: tối, đèn đội đầu). Khớp mã nối: A03N bottom 02 → B04N top 02; B04N bottom 01 → C03 top 01. Có vài mảng sprite rừng hải quỳ hiện trắng ở C03 khi dùng ánh sáng đêm (ảnh map4); chưa sửa.
- `teleport` vào đá bị đẩy ra theo hướng lên: bộ kiểm tìm ô nước trống bằng `world.open` rồi mới dịch tới.
- Vùng áp suất tụt 8 O₂/s bằng nhịp 0,25 s (2 O₂ mỗi nhịp), đo thực được ~12 O₂ sau 1,5 s.
- Ở 1280x720 `maxSpeed` 2,1 m/s; giữ Space 2 s đốt từ 100 xuống ~56 (khớp 22/s), hồi đầy trong 4 s sau khi nhả.
