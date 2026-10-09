# The Bazaar bản web (games/bazaar, "Chợ Phiên")

Chủ dự án yêu cầu 2026-10-09: xem bản The Bazaar Demo trên Steam ở máy, đọc wiki, làm một game tương tự trên web.
Nhấn mạnh polish UI/UX, hiệu ứng, animation ngay trong lúc bóc, như các game khác của hub.

Nguồn: `D:\Steam\steamapps\common\The Bazaar Demo` (Unity Mono, URP, 931 bundle Addressables, 5,7 GB).
Mọi bản bóc nằm ở `D:\bazaar-ref` (không vào repo). Hợp đồng giao việc cho subagent: `D:\bazaar-ref\notes\DELEGATE.md`.

## Điều đã đo [ĐO TRONG REPO, 2026-10-09]

- `StreamingAssets\GameData.db.zip` là SQLite, mỗi dòng là JSON. Bảng dùng `STRICT` nên Python 3.8 không mở được, phải dùng `py -3.12`.
  - cards 2709 (TCardItem 1146, TCardSkill 498, TCardEncounterStep 447, Event 405, Combat 170, Pedestal 32), monsters 166, game_modes 1, level_ups 30.
  - Đủ 7 hero: Vanessa 139 item, Pygmalien 155, Dooley 143, Mak 145, Stelle 126, Jules 120, Karnok 119, Common 195.
  - game_modes: 10 ngày, 6 giờ một ngày, 10 trận thắng, uy tín 20, 8 XP một cấp, 1 XP một giờ, bảng giá mua/bán theo kích thước × bậc.
- Thẻ là một DSL dữ liệu: 43 loại trigger, 38 action, 10 target, 10 value, 20 condition, 4 aura, 44 thuộc tính.
- Mã C# dịch ngược ở `D:\bazaar-ref\src`: `BazaarBattleService` là bộ mô phỏng phía server đi kèm bản demo.

## Hình dữ liệu cốt lõi (chốt trước khi viết logic)

- Mô phỏng combat là hàm thuần, tất định theo seed: nhận hai board, chạy hết trận ngay lập tức, trả về **timeline sự kiện** (giống `CombatSimEvent` của game gốc).
- Lớp hiển thị chỉ phát lại timeline theo tốc độ người chơi chọn. Tách thế này để kiểm luật bằng Node mà không cần trình duyệt, và để animation không bao giờ làm lệch kết quả.
- DSL thẻ thông dịch bằng **bảng đăng ký theo `$type`**: `TRIGGERS`, `ACTIONS`, `TARGETS`, `VALUES`, `CONDS`, `AURAS`. Thêm loại mới = thêm một dòng, không thêm nhánh if.
- Vòng chơi là **máy trạng thái**: chọn hero → giờ (chọn 1 trong các gặp gỡ) → gặp gỡ (thương nhân, sự kiện, quái, bệ) → combat → phần thưởng → cuối ngày đấu PvP bóng → ngày mới. Mọi thay đổi trạng thái đi qua command.

## Đích từng pha (vị từ kiểm được)

Mọi pha chỉ coi là xong khi chạy được trên `https://poke5121999-art.github.io/survivor-web-hub/games/bazaar/index.html`, bộ kiểm xanh với URL trỏ vào Pages, không `pageerror`, không response >= 400.

| Pha | Vị từ "xong" |
|---|---|
| 0. Bóc + nghiên cứu | `D:\bazaar-ref\notes\` có CODE-COMBAT, CODE-RUN, WIKI, ASSETS, VISUAL, AUDIO; `games/bazaar/tools/*.py` chạy lại ra cùng tệp |
| 1. Lõi combat | Sim JS chạy mọi thẻ của hero đã chọn không ném lỗi; kết quả khớp các tình huống tay tính từ CODE-COMBAT; trận phát lại có cooldown, đạn, số sát thương, khiên, bỏng, độc |
| 2. Vòng chơi | Một run 10 ngày chơi được: thương nhân, sự kiện, quái, lên cấp, bán, kho, PvP bóng, hết run |
| 3. Polish | Mọi tương tác trong VISUAL.md có animation và tiếng; so ảnh với trailer gốc |

## Tiến độ

| Pha | Trạng thái | Ghi chú |
|---|---|---|
| 0 | xong 2026-10-09 | notes đủ 6 tệp; art 3526 webp 60 MB (8 hero), tiếng 900 ogg 26 MB (render đúng event FMOD bằng `fmodstudio.dll` của game), DB → `data/*.js` |
| 1a sim | xong trên máy 2026-10-09 | `js/sim/*`, `node test/bazaar-sim.js` 40/0; 0 `$type` chưa cài; Transform chỉ xấp xỉ vì server xoá đích biến hình |
| 1b xem combat | xong trên Pages 2026-10-09, rev 20261009b | DOM/CSS cho bàn + thẻ + tooltip, một canvas phủ cho đạn/số/hạt; khung thẻ phẳng lấy từ sprite `Card_PreviewFrame_*` bằng `tools/frames.py`. `BZ_URL=… node test/bazaar-view.js` 18/18 trên Pages. Chủ dự án chưa xem |
| 2a luật vòng chơi | xong 2026-10-09 | reducer thuần `js/run/*`, máy trạng thái theo `phase.kind`, số server giấu gom vào `js/run/tuning.js`; `node test/bazaar-run.js` 67/0 |
| 2b giao diện vòng chơi | xong trên Pages 2026-10-09, rev 20261009d | `js/ui/*`, `SCREENS[kind]`; `BZ_URL=… node test/bazaar-play.js` 20/0 và `bazaar-view.js` 18/0 trên Pages. Chủ dự án chưa chơi thử |

## Việc mở sau pha 2

- Luật: lệnh `swap` khi kéo vào ô đã có đồ; cho `move`/`sell` ở pha `fight` (xếp lại sau khi xem đối thủ); lưu `run.best` cho màn hết run.
- Cân bằng: bot tham lam thua PvP ~72% (341/1082), uy tín cạn quanh ngày 7 — bóng PvP có thể quá mạnh; chỉnh sau khi chủ dự án chơi.
- Giao diện: màn bệ chưa chụp được; ô bên cạnh chưa né khi kéo; popup kết quả trận che băng-rôn.
- Nội dung: mới 3 hero (Vanessa, Pygmalien, Dooley); 60 sự kiện không nối được bước con bị bỏ; Fates khi hết uy tín chưa làm.

## Bẫy pha 0

- Bản demo là client mỏng: lịch giờ, tỉ lệ bậc theo ngày, vàng khởi đầu, PvP bóng, hệ số crit, thông số bão cát đều nằm trên server (`[BazaarObfuscate]`). Lấp bằng wiki và `[ĐỀ XUẤT]`.
- AssetRipper không xuất được bundle (header không ghi phiên bản Unity). UnityPy đọc được khi đặt phiên bản dự phòng `6000.3.11f1`.
- Khung thẻ là mesh 3D trải UV, không phải ảnh khung phẳng.
- `[BẪY ĐÃ SẬP]` Art thẻ là ảnh thẻ bị ép vào ô vuông 1024×1024 (cả 1096 ảnh, mọi cỡ S/M/L); mesh kéo giãn lại. Hiện bằng `cover` thì thẻ nhỏ phình ngang, thẻ lớn phình dọc (chủ dự án thấy "art bị kéo dãn"). Đúng là `background-size: 100% 100%`; đã so với ảnh chụp game thật ở thẻ Vanessa_Pearl.
- Font gốc chỉ có atlas SDF, phủ 21/68 chữ có dấu tiếng Việt: chữ giao diện dùng web font.
