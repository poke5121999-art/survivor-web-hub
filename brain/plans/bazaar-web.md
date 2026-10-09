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

## Đối chiếu clip YouTube (2026-10-09, skill `watch-game-clips`)

Ghi chú có mốc giờ ở `D:\bazaar-ref\notes\clips\<id>.md`, khung hình ở `D:\bazaar-ref\shots\clips\<id>\`.

| Clip | Dùng cho |
|---|---|
| `PSP75k4R4Pk` hướng dẫn 7 phút | máu cấp 1 = 300, Fates (uy tín về 0 lần đầu → 1 + chọn ân huệ), 8 vàng + 5 thu nhập |
| `oVtvrCdqHEE` Kripp giải thích | thua quái vẫn giữ vàng theo phần máu đã đánh; XP chỉ khi thắng |
| `wUzq6Q4u9Jc` Vanessa 10 thắng | máu bóng PvP theo ngày (`GHOST_HP_BY_DAY`), thẻ "Ngày N", màn VS, cổng thương nhân |
| `heZSYG0dD_c` closed beta 2024 | nhịp combat; chỗ nào trái prefab bản demo hiện tại thì giữ prefab |

Rev 20261009e: bot thắng PvP 40,1% (trước 29,3% với cùng đường máu và `GHOST_LEVEL_OFFSET` 1).

## Pha 3: làm cho khớp hẳn với game gốc (đang làm 2026-10-09)

Chủ dự án hỏi "vfx, sfx, anim, gameplay đã theo clip hết chưa" → chưa → "làm cho perfect, tìm thêm nhiều clip".
Hợp đồng: `D:\bazaar-ref\notes\MOMENTS.md` (danh sách khoảnh khắc + thư mục `ref/`, `web/`, `compare/`).

1. Tham chiếu từ clip mới (2025-2026, đúng UI bản hiện tại): 3 nhánh chia theo khoảnh khắc → `D:\bazaar-ref\ref\<moment>\` + `notes\clips\REF-*.md`.
2. Bảng đạn/tiếng theo thẻ chính xác: `tools/vfxmap.py` → `data/vfxmap.js` (GUID `VFXOverrideKey` → prefab → sprite + event FMOD).
3. Lever so sánh: `test/bazaar-capture.js` (quay bản web theo khoảnh khắc, đều theo thời gian game) + `tools/compare_sheet.py` → `D:\bazaar-ref\compare\`.
4. Sửa theo bảng so sánh, chạy lại lever, đẩy lên Pages, gửi bảng trước/sau cho chủ dự án.

Vòng 1 (rev 20261009f): thẻ (cooldown kiểu gốc: phần trên xám mờ, vạch xanh #00CF6D dâng lên, phần dưới vạch sáng lại; trạng thái; ammo; hover; tooltip), đạn và số nổi
(crit, khiên tím, hồi máu, bỏng, băng-rôn 0,7/1,3/0,3 s), đạn/tiếng theo thẻ qua `data/vfxmap.js` (283 thẻ chính xác, 526 mặc định
theo hành động), 6 tiếng còn thiếu, màn vòng chơi theo clip. Còn lệch: nền sân (gốc mỗi hero một bàn riêng, web dùng chung), số
crit nhỏ hơn gốc (~130 so với ~190 px), `enrage` chưa chụp được trận thật, `slow/charge/flying` chưa có tham chiếu clip.

## Pha 4: game đầy đủ (chủ dự án 2026-10-09 "làm full game hết nha")

Phạm vi "đầy đủ" = mọi thứ một run thật có, trừ thứ cần tiền thật (cửa hàng gem, skin trả phí, battle pass).

| Nhánh | Nội dung | Tệp sở hữu |
|---|---|---|
| D dữ liệu | thẻ cả 8 hero (Mak, Stelle, Jules, Karnok, The Dragons), nạp theo hero để giữ tải trang nhẹ; nối 60 sự kiện bị bỏ (bước con theo tên); quét sim mọi thẻ mới | `tools/data.py`, `data/*` (trừ audio/vfxmap/env/art/frames), `test/bazaar-sim.js` |
| R luật | rương thưởng 4/7/10 thắng; quest trên thẻ; trigger OnEncounterCardsDealt/Entered/Exited; sinh thẻ Premium Piggles/Book of Secrets; lệnh `swap`; xếp lại bàn ở pha `fight`; `run.best`; khởi đầu riêng từng hero | `js/run/*`, `test/bazaar-run.js` |
| A tiếng | giọng + nhạc đủ 8 hero | `tools/audio.py`, `data/audio.js`, `audio/**` |
| U giao diện | sảnh 8 hero (Spine nếu được), rương thưởng, quest, kéo đổi chỗ, xếp lại khi xem đối thủ, màn hết run bàn tốt nhất | `js/ui/**`, `css/run.css` (sau khi vòng 3 xong) |
| G bóng PvP | chủ dự án chốt: KHÔNG dùng Supabase, sinh sẵn "người chơi khác" bằng bot. `tools/ghosts.js` cho bot chơi nhiều run, chụp bàn trước PvP mỗi ngày, giữ 12-20 bàn/ngày thắng quái ≥ 50% → `data/ghosts.js` (`BZ_GHOSTS.byDay`); luật chọn từ đó, thiếu thì quay về bóng quái | `tools/ghosts.js`, `data/ghosts.js` |

Kết quả pha 4 (rev 20261010a): 7 hero chơi được (The Dragons khoá: GameData.db không có thẻ của hero này); 50/60 sự kiện bị bỏ đã nối lại;
rương 4/7/10, quest, swap/đẩy thẻ, xếp lại trước trận, `run.best`, trigger ngoài trận, khởi đầu theo hero; ô Stove/Cooler và hiệu ứng gốc
hero trong sim; giọng + nhạc 8 hero; `data/ghosts.js` 16 bóng/ngày từ 700 run bot; thẻ nạp theo hero (`js/ui/loader.js`).
Kiểm: sim micro 36/0 + sockets 27/0, run rules 114/0 (đủ: 127/0 với 7 hero × 200 run), play 49/0, view 19/0.
Còn lệch: bóng ngày 1-2 yếu, ngày 8-10 mạnh (bot thắng 25-31%); clip charge và bão cát thật chưa có.

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
