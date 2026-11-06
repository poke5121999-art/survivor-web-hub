# Ải 5 nhà, 7 loài quái mới, tiếng thật, đèn mềm: chép ngược từ bản Unity

Ngày 2026-09-15. Nguồn: kho `D:\REPO_Topdown`, commit `1dba2fa` trên `master`. Bản Unity là bản dịch nguyên văn `game.js` sang C#, rồi phát triển tiếp. Tệp này ghi lại những gì đã được chép ngược về bản web, những gì cố ý bỏ lại, và mấy cái bẫy đã sập trong lúc chép.

## Đã chép

| Phần | Nguồn Unity | Chỗ ở bản web |
|---|---|---|
| Dữ liệu ải + luật đọc từng nhà | `World/StageData.cs`, `World/StageRules.cs`, `Resources/World/Stage/Stage.asset` | `game.js`: `AI_5_NHA`, `AI` (xuất ra `REPO.ai`) |
| Theme sàn/tường Soul Knight (kiểu 17..21) | `Skin/Phong.cs` (`ThemSK`), `G03_World_b.cs` (FLOORS/WALLS) | `phong.js` (`theoKieu`, `SK_SAN`, `SK_TUONG`), `game.js` FLOORS/WALLS, `art/room/sk/` |
| Loot theo chất liệu nhà, hệ số giá trị/chỉ tiêu/máu/đòn, số bệ | `G03_World_a.cs` | `buildLevel`, `makeMonster`, `foeDmgScale` |
| Vũng độc, vũng bùn | `G04_Combat.cs` (`makeDoc/makeBun/stepDoc/stepBun`), `G07_Render_b.cs` (`drawVung`) | cùng tên trong `game.js` |
| Bảy loài quái | `G10_FoeKinds.cs`, `G10_FoeKinds_b.cs`, `G10_FoeKinds_draw.cs` | `game.js`: khối `FOE_KINDS` ngay trước bảng `MONSTERS`, `art/foe/sk/` |
| Mặt pho tượng bằng art thật, máu chảy mượt | `G07_Angel.cs`, `G01_Feel.cs`/`G01_Vfx.cs` (`FX.matMau`), `Skin/Sprites.cs` (`foeKhung/foeGoc/foeCo`) | `drawAngelMat`, `veVetMau`, `sprites.js` |
| Đèn pin mềm, bóng đồ đạc chỉ tối một phần, tia đèn đồng đội | `G10_Light.cs` bản đã commit, `G07_Render.cs`, `G06_Crew.cs` | `game.js`: khối "ánh sáng đèn pin mềm" ngay trước `buildLight` |
| Tiếng thật R.E.P.O. + nhạc theo nhà | `Audio/SfxSamples.cs`, `Audio/G_Sfx.cs` | trong `SFX` của `game.js` (`real`, `bed`), `sfx/<cue>/*.ogg` |
| Sảnh: một ải thay 9 map | `Squad/SqContent.cs`, `SqSquad.cs`, `SqUi_a.cs`, `SqUi_b.cs` | `repo-squad/data/content.js`, `js/squad.js`, `js/ui.js`, nhãn "Nhà" trên thanh trên |

## Cố ý bỏ lại

- **Co-op / online** (`CoopEngine`, `CoopSnapshot`, `SqCoop*`). Chủ dự án không cần.
- **Prefab**: phòng dựng tay (`RoomTemplate`, `RoomLibrary`, ô `F`/`P_FIXED`), cửa kéo tay (`CuaPhong`), Tile Palette (`RoomTiles`), prefab sàn/tường (`FloorSkin`), `WorldView`, `WorldData`. Chủ dự án không cần. Nhà web vẫn dựng từ 15 mẫu phòng chữ trong `ROOMS`.
- **uGUI** (`UiGo/*`, `UiHooks`, `SqUiApi`). Sảnh web vẫn là HTML.
- **Việc Unity chưa commit** lúc chép: gỡ tiến hoá/trang bị (`SqMeta`, `SqLegacyRefund`), sân thử, sách hướng dẫn, `visPoly` viết lại, bóng vật. Một agent khác đang làm dở; chép bây giờ là chép một thứ còn đổi.

## Luật giữ cho trang repo2d cũ không đổi

- `S.house = 0` khi trang không gắn `HOOKS.houseIndex`. Mọi hàm `AI.*` trả giá trị trung tính ở nhà 0, nên trang repo2d cũ dựng nhà y như trước.
- Lượt bốc ngẫu nhiên `stockFrom` loại các loài trong `FOE_KINDS`. Bảy loài mới chỉ vào nhà qua `AI.roster`.
  - `[ĐO TRONG REPO]` 300 lần `buildLevel` ở cấp 4..13 trên trang repo2d chỉ bốc ra `rook, banger, angel, gunner, mirror, gnome`.
- Tiếng thật chỉ bật khi có `HOOKS.houseIndex` (tức là trang Biệt Đội). Trang repo2d vẫn dùng tiếng tổng hợp.
- Đèn mềm và mặt pho tượng áp cho **cả hai trang**. Đây là sửa hình, không đổi luật.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` **Khoá trùng trong `window.REPO`.** Lần đầu thêm `spawnFoe(type, x, y)` vào đầu bảng xuất. Bảng này đã có sẵn `spawnFoe(type, dx, dy)` ở gần cuối, nhận **độ lệch** so với người chơi. Trong một object literal, khoá viết sau đè khoá viết trước mà không báo lỗi. Kết quả: bài kiểm truyền toạ độ tuyệt đối, quái hiện cách người chơi 400 px, và mọi loài trông như "không phát hiện người". Trước khi thêm tên vào `window.REPO`, grep tên đó trong cả tệp.
- `[BẪY ĐÃ SẬP]` **Bảng `MONSTERS` đọc hằng số lúc dựng.** `addFoeKinds` được gọi ngay sau bảng `MONSTERS`, và câu `wiki` của bàn tay nối chuỗi với `HAND_RELOCATE`. Nếu khối `FOE_KINDS` nằm sau bảng, lời gọi ấy đọc một `const` chưa khởi tạo và cả trang chết ở dòng đầu. Vì vậy cả khối nằm **trước** `// ===== monsters`.
- **Thanh vùng vẫy** (bẫy bên Unity): phải kiểm `struggle >= 1` **trước** khi trừ phần tụt dần. Trừ trước thì thanh kẹp ở 1 không bao giờ chạm được 1.
- **Lớp đèn nhỏ bằng nửa canvas.** Mọi thứ vẽ vào `lightCv` phải dùng `lightTransform`. Dùng `worldTransform` thì hình lệch và phóng gấp đôi.
- **`game.js`, `phong.js`, `bot.js` lưu CRLF, còn `sprites.js` lưu LF.** Mọi bản vá viết bằng Python `io.open(..., newline='')`. Đo lại bằng số dòng LF lẻ trước khi add (`d.count(b'\n') - d.count(b'\r\n')` phải bằng 0 với ba tệp CRLF).

## Hiệu năng: cần xem trên máy thật

`[ĐO TRONG REPO]` Chromium headless (canvas vẽ bằng CPU), 1280x720, sảnh Biệt Đội vào nhà 1:

| Bản | khung/giây |
|---|---|
| trước khi chép (Pages) | ~51 |
| sau khi chép | ~29–35 |
| sau khi chép, tắt `blurLight` | ~52 |

Gần như toàn bộ phần chậm đi nằm ở `blurLight`: 10 lần `drawImage` lên lớp đèn nửa độ phân giải. Trên trình duyệt có GPU, việc này thường rẻ, nhưng chưa ai đo trên điện thoại thật. Nếu điện thoại giật, việc đầu tiên nên thử là giảm `BLUR_TAPS` hoặc bỏ blur.

## Kiểm lại bằng máy

Bài kiểm Playwright nằm ngoài repo (scratchpad của phiên), nhưng các cửa để kiểm đều nằm trong `window.REPO`:

- `REPO.ai.*`: dữ liệu và luật từng nhà. Gắn `REPO.hooks.houseIndex = () => n` rồi gọi `REPO.startLevel(seed)` là dựng được nhà n.
- `REPO.spawnFoe(type, dx, dy)`: đặt một con quái lệch so với người chơi. Pha của nó đọc ở `m.kPh`, người bị giữ đọc ở `S.player.grabBy`.
- `REPO.amThat()`: danh sách cue tiếng thật đã giải mã, tiếng phòng đã chạy chưa, nhạc của nhà nào.
- `REPO.angelMat()`: độ hiện của khuôn mặt pho tượng.
