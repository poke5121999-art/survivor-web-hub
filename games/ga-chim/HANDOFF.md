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

## 2026-11-14 (rev 20261114f): súng, cách bắn và âm thanh port từ Saltline

- `js/sl/weapon-sl.js` và `js/sl/audio-sl.js` là file SINH bằng `node tools/port-sl-weapon.js` và `node tools/port-sl-audio.js` từ `D:\ref-saltline-gh\work\game.pretty.js` (Saltline của Felix Rieseberg, ghi công ở đầu file). Đừng sửa tay; sửa tool (đổi chữ khắc, tắt còi tàu biển/hải âu) hoặc lớp nối.
- `js/weapon.js` là lớp nối: đưa input, người chơi, phép bắn trúng, vỏ đạn thế giới (60 vỏ, nảy .32-.48, nằm 4 s rồi thu nhỏ .7 s), vệt đạn 260 m/s cho bộ điều khiển súng của Saltline. `js/gunmodel.js` cũ đã xoá.
- Giật camera theo Saltline nằm trong `Player.addRecoil` / `addShake` (35% giữ lại, 65% hồi, giữ .09 s, hồi 6.5, đuổi 34).
- `js/audio.js` là lớp nối âm thanh: chuyển sự kiện game (`G.events`) sang bảng sự kiện Saltline (`weapon:fire`, `impact`, `player:step`, `enemy:*`, `thunder`, `objective:*`). Lính (raider) không có trong Saltline nên dùng `rifle_shot` 3D.
- Kiểm: `node tools/fire-strip.js <out>` (dải khung hình lúc bắn), `node tools/probe.js "<expr>" "&noaudio="` rồi gọi `__G.audio.engine.selfTest({})` (peak, clip, NaN).

## 2026-11-14 (rev 20261114g): mặt đất ướt, vũng nước, mưa và mô hình ướt theo Saltline

- `js/sl/ground-sl.js` SINH bằng `node tools/port-sl-ground.js`: bản đồ vũng (mask 1024 px phủ x -60..140, z -140..60), shader mặt đất (vũng, viền thấm, quầng ẩm, gợn mưa chỉ ở vũng sâu >8 cm trong 34 m), gương phẳng, mưa 9000 vệt + tia bắn tung trên vũng. Tool thay phần của bến cảng: bảng 46 vũng sinh theo lối đi giữa các đường ray, vệt bánh xe dọc lối đi, khu ngập x -28..14 z -112..-66, không vạch sơn, không bê tông kè.
- `js/ground.js` là lớp nối; `G.puddleAt` hỏi `ground.isPuddle` nên tiếng bước chân, đạn trúng nước khớp với hình. Sấm do module mưa hẹn giờ, gọi `G.thunder`. `js/rain.js` và mặt nhựa đường cũ trong `level.js` đã bỏ.
- `js/mats.js`: mô hình ướt §3.4 với bảng `WET` theo từng bề mặt (tối đi, nhám khi ướt, ướt mặt đứng, hạt nước), trong nhà chỉ ướt 12%, chân tường có dải nước bắn.
- Bẫy: `tools/sl-port-lib.js` là thư viện chung cho 3 tool port (bảng tên rút gọn three.js, tìm tên tự do bằng acorn).

## 2026-11-14 (rev 20261114h): hiệu ứng theo Saltline (vệt đạn, va chạm, khói, mảnh vỡ, vỏ đạn, decal)

- `js/sl/fx-sl.js` SINH bằng `node tools/port-sl-fx.js` (dòng 39420-41201): 2 pool hạt (khói/bụi có chiếu sáng 1400, cộng sáng 3200), vệt đạn (lõi .024 m ×16 HDR, quầng ×6, đốm đầu, khói theo vệt, 260 m/s), bảng va chạm theo bề mặt, bọt nước khi trúng vũng, mảnh vỡ, vỏ đạn, decal, nổ. Nghe chung bus sự kiện Saltline (`G.audio.bus`): `impact` cần `point, normal, dir, surface, enemy`.
- `js/fx.js` cũ và vỏ đạn/vệt đạn tự viết trong `weapon.js` đã bỏ. Địch bắn: `G.weapon.tracer(from, to, true)` dùng màu vệt địch của Saltline.
- Bẫy: SSR sinh NaN ở pixel có hạt cộng sáng, NaN loang thành ô vuông đen quanh đầu nòng. SSR giờ chặn NaN/Inf. Hạt không ghi kênh alpha (mặt nạ SSR). Cách khoanh: đếm pixel half-float có số mũ 31 trong `compRT` khi bật/tắt từng pass (`&nossr=1`, `&noao=1`, `&nofog=1`).
