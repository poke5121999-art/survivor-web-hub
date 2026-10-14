# Soul Knight web: dựng lại vòng chơi theo seri walkthrough Neogaming

Chủ dự án 2026-10-14: "theo dõi seri youtube này https://www.youtube.com/watch?v=1EdlLjGhhEQ + lượng asset của soul knight apk đang có
để làm lại game cho chỉnh chu, đừng tự vẽ art".

Seri có đúng 5 phần trên kênh Neogaming (playlist PL1hX1qD7bI71yzqd1Yjl71Rsa-44yicT8, bản 2019):
1EdlLjGhhEQ (hướng dẫn + 1-1..1-3), GLG702mUWX8 (1-4, 1-5), jFHCVBZEYDU (chết, GAME OVER, sảnh, chọn nhân vật),
N9FR-oALmvQ (1-2..1-5, trùm Devil's Snare, hồi sinh 200 đá, sang 2-1), yr9GkR7_cZ4 (vườn, GAME OVER, sảnh).
Bảng cảnh theo mốc giây do agent xem clip ghi: scratchpad phiên 2026-10-14 `clips/<id>/SCENES.md`, `FEEL.md`, `keyframes/`.

Luật: clip là bản 2019, asset là bản 8.6.0. Clip quyết định **luồng** (màn nào nối màn nào, cái gì hiện ra); hình và chữ lấy từ
prefab/scene 8.6. Không vẽ tay: thiếu asset thì ghi vào GAPS.md, không chế.

## Định nghĩa xong

Trên Pages, người chơi mới đi được trọn: màn tiêu đề → (lần đầu) lời mở truyện + ải hướng dẫn → sảnh → chọn nhân vật → cửa → 1-1..1-5
→ chết thì có hộp hồi sinh (200 đá) → GAME OVER hai trang (thước tiến trình + thống kê, đá nhận được) → về sảnh. Mỗi màn vẽ bằng
prefab/scene gốc, có ảnh chụp đặt cạnh khung clip. Bộ kiểm cũ vẫn xanh trên Pages; rev mới.

## Lệch tìm được (web so với clip, 2026-10-14)

| # | lệch | clip | asset 8.6 |
|---|---|---|---|
| 1 | Chết hiện chữ HTML "Bạn đã gục ngã", không có hồi sinh, không có GAME OVER | jFHCVBZEYDU?t=422, N9FR-oALmvQ?t=719 | `statements.ab` › `Statements.unity` (UIStatement), `common.ab` › `rgprefab/ui/window_reborn.prefab` |
| 2 | Không có màn tiêu đề | jFHCVBZEYDU?t=10 | `title.ab` (UI, logo `biaotivn`), `title_background/860.ab` (Spine) |
| 3 | Không có lời mở truyện + ải hướng dẫn | 1EdlLjGhhEQ?t=3 .. ?t=255 | `tutorial.ab`, `scene_tutorial.ab` |
| 4 | Vũ khí trên đất chỉ có nhãn "[E] Nhặt …"; gốc có tên + dải 4 chỉ số ở đáy màn, tên vũ khí bay lên khi cầm | 1EdlLjGhhEQ?t=160, ?t=357 | HUD `canvas.prefab` (item info) |

Đã khớp, không sửa: băng rôn trùm (xiên, tên + chân dung), chữ CLEAR, cột sáng vào ải, màn tải có mẹo, chọn thiên phú, màn chọn
nhân vật (tranh nạp chậm ~1 s, không phải lỗi).

## Việc

- [x] U1 chết → hồi sinh → GAME OVER (#1): `js/gameover.js`, `test/soulknight-gameover.js` (rev 20261014a)
- [x] U2 vũ khí trên đất: tên + dải chỉ số (#4): `js/hud.js` item_info, `test/soulknight-floorweapon.js`; mũi tên gốc chưa tìm ra sprite nên bỏ (rev 20261014a)
- [x] U3 màn tiêu đề (#2): `js/title.js`, `tools/title/build_title.py`, `test/soulknight-title.js`; bố cục [ƯỚC LƯỢNG] vì scene tiêu đề nằm trong data.unity3d (rev 20261014a)
- [x] U4 lời mở truyện + ải hướng dẫn (#3): `js/tutorial.js`, `tools/tutorial/build_tutorial.py`, `test/soulknight-tutorial.js`; luồng màn tựa → `SK.enterHome` → hướng dẫn (lần đầu) → sảnh (rev 20261014b). Giản lược: quái hiện khi khoá phòng, chết thì chơi lại ải, chưa có lời nhắc bấm nút kỹ năng
- [ ] Gộp, tăng rev, đẩy, kiểm trên Pages, chụp cạnh khung clip
