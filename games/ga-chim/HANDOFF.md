# Ga Chìm: ghi chú cho phiên sau (2026-11-14)

Game FPS gốc dựng toàn bằng code (three.js r170 vendored). Chuẩn đồ hoạ là clip gameplay Saltline (`linux2:~/saltline/yt/f/*.jpg`). Chuẩn tư thế cầm súng là clip CoD do chủ dự án gửi (youtube v_PcbQI75-8).

## Đang chạy trên hub
- Thẻ `ga-chim` trong `data/games.js`. Đường dẫn `games/ga-chim/index.html`.
- Đẩy qua worktree thưa `D:\hub-gachim` (dựng từ `origin/main`). Không đẩy từ `D:\survivor-web-hub`, vì main ở đó lệch origin hàng trăm commit và đang chứa việc dở của agent khác.
- Cách đẩy: `git fetch` rồi `git checkout --detach origin/main`, chép `games/ga-chim` sang, nâng `rev` của thẻ và `?v=` trong `index.html`, commit, rồi `git push origin HEAD:main`.

## Công cụ kiểm
- `node games/ga-chim/tools/shots.js <out> yard,alley,flood,platform,shed,boxcar,gun,gunads [q] [&cờ]`. Cờ debug: `nocone norays nofog nossr noao nobloom norain dry vmdebug`.
- `node games/ga-chim/tools/play.js <out>`. Đặt `GC_URL=<url Pages>` để chạy trên Pages.
- `tools/poses.js`: các tư thế cầm súng.
- `tools/raiders.js` và `tools/raiders2.js`: địch là người.
- Script chụp nào cũng phải đặt `hub.session.v1` trong localStorage, nếu không cổng đăng nhập chặn và game không chạy.

## Bẫy đã gặp
- Tia nắng (radial blur) phủ một lớp sáng lên cả màn hình, làm súng và vật tối bị xám. Đã giới hạn tia nắng quanh vị trí mặt trời.
- Đèn pha cường độ 2600 cd làm sáng chói mặt đứng. Đã hạ xuống 650.
- Vật liệu three.js thường ghi alpha bằng 1, nên SSR coi nó là mặt phản chiếu. Phải bọc bằng `noMask()`.
- Viewmodel vẽ ở layer 1 với camera riêng. Mọi đèn phải gọi `layers.enableAll()`.

## Còn phải làm
- Kẻ cướp còn thô: mặt nạ, tay và vải chưa đủ chi tiết. Animation còn đơn giản.
- Chưa so từng cảnh với khung Saltline.
- Bàn tay viewmodel và đoạn tay trái tháo lắp băng đạn khi nạp cần chỉnh thêm.
- Âm thanh mới chỉ kiểm bằng phổ, chưa có người nghe.

## 2026-11-14 (rev 20261114e): ánh sáng và hậu kỳ theo Saltline

- Đèn: một DirectionalLight màu (1,.72,.42) cường độ 9, bỏ HemisphereLight; ánh sáng nền lấy từ PMREM của bầu trời, `environmentIntensity = 2`. Nguồn số: `D:\ref-saltline-gh\work\analysis\render.md`.
- Bóng: `installPCSS` trong `js/lights.js` thay `getShadow` của three (blocker search + Vogel 16 tap), cần `PCFShadowMap`. Tắt bằng `?nopcss=1`.
- Súng vẽ cùng render target với `gl.depthRange(0, 0.05)`; mọi pass hậu kỳ coi depth < 0.05 là "không phải thế giới". Không còn `clearDepth` trong `Weapon.draw`.
- `js/post.js` là bản port chuỗi Saltline: depthhalf, AO, SSR (giữ của mình), sương thể tích đọc shadow map, composite, bloom 6/5, streak, tự phơi sáng 1x1, grade (flare, ACES/AgX, split tone), FXAA. Hằng số ở `TUNE`.
- Bẫy đã sập: bầu trời nung env sinh NaN khi `pow(ts, n)` gặp ts hơi âm, PMREM làm nhoè NaN ra cả map, cả thế giới thành đen. Đã kẹp `ts` về [0,1]. Kiểm bằng `node tools/probe.js "<expr>" "&q=low"` (đọc pixel HDR qua `__px`).
