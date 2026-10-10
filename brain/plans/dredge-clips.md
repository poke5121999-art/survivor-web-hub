# Biển Mù: đối chiếu với clip gameplay thật (2026-10-09)

Chủ dự án yêu cầu: "dredge: áp dụng skill watch-game-clips để làm cho game perfect".
Đợt trước: [[plans/dredge-chuan-goc-2]] so bằng 31 ảnh tĩnh GOG. Ảnh tĩnh không cho thấy chuyển động, nhịp, thứ tự màn hình và âm thanh.
Đợt này so bằng clip, nên bắt được lỗi về luồng, thời gian và cảm giác.

## Vị từ "xong"

1. Danh mục trạng thái (`test/dredge-tour.js`, mỗi trạng thái một ảnh 1280x720) có ảnh web và khung clip thật đặt cạnh nhau.
2. Mỗi khác biệt thấy được có mã `V<n>`, dẫn clip `https://youtu.be/<id>?t=<s>` và ảnh web; ghi ở `D:\dredge-ref\notes\clips\GAPS.md`.
3. Mỗi khác biệt: hoặc đã sửa (test + ảnh ghép sau sửa, chạy trên Pages), hoặc ghi "để sau" kèm lý do.
4. Mọi `test/dredge-*.js` xanh trên Pages; không `pageerror`, lỗi console, HTTP >= 400.

## Nguồn clip (ngoài repo)

- `ObBBFGMem5U` DREDGE Demo, 48 phút, không lời: đúng phạm vi bản web (Greater Marrow, vùng đầu).
- `59xny6g6rvE` full game 4K không lời, lấy 80 phút đầu.
- `jt_Ww-RLNck` cách đối phó mọi quái, 10 phút.
- Tải về scratchpad phiên; khung trích ra lưu ở `D:\dredge-ref\clips\` để phiên sau dùng lại.

## Pha

| Pha | Việc | Kiểm |
|---|---|---|
| A | Lever: `test/dredge-tour.js` chụp 22 trạng thái | đọc tận mắt ít nhất 6 ảnh |
| B | Xem clip theo trạng thái, trích khung, ghi nhận | mỗi nhận xét có mốc thời gian |
| C | Ghép web/clip, lập GAPS.md, xếp ưu tiên | mỗi mục có cả hai ảnh |
| D | Sửa theo nhánh tách tệp (`D:\dredge-wt\v*`), gộp | test riêng + ảnh ghép |
| E | Đẩy, đợi Pages, chạy toàn bộ test trên Pages | xem ảnh tận mắt |

## Trạng thái (2026-10-09): 6 nhánh đã gộp, rev `20261009c`

- Gộp bằng `python -I D:/dredge-ref/notes/merge_copy.py v<nhánh> _base4 --apply`; `index.html` của vdock và vhud phải ghép tay thẻ.
- Root sửa ngoài nhánh: `sky.js` giờ màn tiêu đề 0,27; `dredge-gear` đóng Bách khoa sau khi bấm L (L nay mở Bách khoa như bản gốc); `dredge-water` ẩn `#dr-tut` lúc đo độ gồ (hộp hướng dẫn đè vùng đo).
- Nhật ký từng bước: `brain/plans/dredge-clips/decisions.tsv`. Hợp đồng và đề bài: `D:\dredge-ref\notes\DELEGATE-R4.md`, `briefs\v*.md`.

**Còn mở:** V16 quái, V17 xác tàu/phao/ống nhòm/thư, V18 tab CABIN trong khoang, V19 bản đồ mờ vùng chưa tới (chi tiết ở `D:\dredge-ref\notes\clips\GAPS.md`).
Nước giữa trưa vẫn sáng hơn clip khoảng 1,2 lần; thân dưới thuyền còn ván sẫm; thuyền khuất sau cầu tàu ở ô đỗ 0; mắt hoảng loạn ở mức đỏ nhạt hơn clip.

## Đợt 2 (2026-10-09): 4 nhánh w2*, rev `20261009d`

- w2dock: mặt đồng hồ + chip TAB ở bến, bỏ tiền, thanh nợ sau hội thoại Mayor; ván mới vẫn đỗ ô 0 (khuất) vì bản gốc cũng vậy.
- w2water: nước sát bến hết nâu xám (độ sâu đo theo tia nhìn); vẫn tối hơn clip khoảng 0,7 lần, hai test water/vwater kẹp `WATER_LIT` hai đầu.
- w2cabin: tab Phòng trong khoang (V18). V19 đóng: vùng mờ trên bản đồ clip là nhãn bản demo.
- w2poi: 38 điểm kiểm tra (phao, xác tàu + Đồ tìm thấy). Chưa có chai thư ItemPOI, camera trôi tới phao.
- Bẫy: `dredge-vhud` từng chạy WebGL phần mềm (`--use-gl=swiftshader`); sau vài bộ nặng thì mất context lúc biên dịch shader. Mọi test DREDGE dùng `--use-angle=d3d11`.

**Còn mở sau đợt 2:** V16 quái (pha 4), chai thư, thư Messages, sách đọc theo giờ, nước sáng/tối lệch khoảng 1,2-1,4 lần theo giờ.

## Đợt 3 và quái vùng Marrows (2026-10-10), rev `20261010a` → `20261010b`

- Đợt 3 (rev a): chai thư + Thư tín (w3msg), đọc sách theo giờ (w3books), độ sáng nước theo giờ khớp clip trong 15% theo dải (w3water).
- Quái (rev b): spec `D:\dredge-ref\notes\MONSTERS.md`. Phần nền S1 (`js/events.js` theo `WorldEventManager.cs`), S2 (NavMesh gốc giải mã, vùng an toàn, hạt, tiếng). 10 phần U1-U10: Angler, đá ma, Miasma, thuyền ma + FogGhost, quạ, sự kiện dọa, lây nhiễm, vòi rồng, cá đuối, cá mập ma.
- W0 (kế hoạch `D:\dredge-ref\notes\WORLD-GAPS.md`): cờ `can-catch-aberrations` bật đúng ngày như `AberrationEnabler.cs` (trước đây kẹt ở pha 0), `DRYarn.command`, `DRDock.registerDest`, 3 ô lưu, ẩn bến DLC trừ `?dlc=1`.
- Sửa chung: `uDrCamPos` thay `cameraPosition` (three r140 không nạp cho Lambert/Basic); `tools/tentacle.py` đảo albedo/emission.
- Còn mở: gốc lỗi mất hạt khi lô nới giữa khung (`particles.js` grow, đang né bằng sức chứa 1024); hiệu ứng hậu kỳ MonsterProfile (viền đỏ, quang sai) đang là lớp CSS; tiếp theo là W1-W9 và R1-R8 theo WORLD-GAPS.md §6.

## Cốt truyện, quái các vùng, cảnh kết (2026-10-10), rev `20261010c` → `20261010d`

- Rev c: W1-W5, W7, W8 (nghiên cứu, kho tràn, điểm hội thoại, đá nổ mìn, lệnh nhiệm vụ Yarn, menu, sơn thuyền).
- Rev d: W6a + W6b (cảnh kết xấu/tốt theo `FinaleCutscene_*.playable`, `DestroyGreaterMarrow`), W9 (chụp ảnh), R1 rắn Gale Cliffs, R2 quái Stellar Basin + sứa, R3 Mind Sucker, R4 hiểm hoạ Twisted Strand (tường rễ, nấm nổ, dây leo), R5 piranha + Mẹ, R6 cua giả, tượng mắt, đá ma GC, vòi rồng đứng, R8 cá voi/cá heo.
- Sửa gốc: `particles.js` grow (three r140 chỉ gán `_maxInstanceCount` một lần; mưa bão trước vẽ 147/2275 hạt); `DR.timeScale` thành chỉ đọc = mức nhỏ nhất của `DR.holdTime(id, k)` (ba module từng ghi đè nhau theo thứ tự rAF); bọt vệt thuyền nghiêng (ma trận T·Rz·S → T·S·Rz); hàm bọc `DRAudio.loop` của `finale.js` làm rơi tham số bus.
- Bẫy: hàm bọc API dùng chung phải chuyển đủ tham số; tay cầm giả trong test phải cùng hình dạng tay cầm thật (`systems: []`); nhiều quái phát `threatBanished` nên test lọc theo `source`.
- Còn mở: R7 (Leviathan, biên thế giới, cá mập trắng) đang làm; hậu kỳ MonsterProfile còn là CSS; CPU khung tăng ~1 ms gần quái nhiều skinned mesh (R2, R3, R5) chưa tối ưu; thành tựu (Phase C), DLC sau cùng.
- Rev e: R7 (Leviathan ở biên 1800/2000 m, chết trừ khi Hiện thân; cá mập trắng chỉ ở OPEN_OCEAN), C1 thành tựu (40 gốc, danh sách trong menu tạm dừng/màn đầu), sổ nhiệm vụ gộp bước nhiệm vụ con vào nhiệm vụ cha (`QuestDetailWindow.Init`). Pages rev d: 61/61 sau khi chạy riêng các bộ chập chờn.
