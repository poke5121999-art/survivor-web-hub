# Ác Quỷ II · Act I

Bản làm lại Act I của Diablo II (LoD 1.14d) bằng canvas/JS thuần, không engine, mở được từ `file://`.
Gồm Rogue Encampment, Blood Moor, Den of Evil. Ba lớp chơi được: Amazon, Sorceress, Barbarian. Bốn lớp còn lại có dữ liệu nhưng đang khoá.

## Luật của chủ dự án (2026-10-01)

- Chỉ mượn **hình và tiếng** của Flare. Bản đồ, nhân vật, kỹ năng, cơ chế phải giống Diablo II gốc.
- Engine D2 nguồn mở trong danh sách bobeff/open-source-games (OpenDiablo2, Abyss Engine) và Diablerie đều **không kèm art**. Chúng đọc MPQ của Blizzard, mà máy này không có D2.

## Nguồn

| Phần | Nguồn | Công cụ dựng lại |
|---|---|---|
| Hình, tiếng, nhạc | Flare: Empyrean Campaign, CC-BY-SA 3.0. Xem `CREDITS.md` | `_tools/build_assets.py` (cần `D:\flare-ref`) |
| Chỉ số lớp, kỹ năng, quái, đồ, rơi đồ, khu vực | Bảng `.txt` 1.14d qua blizzhackers/d2data commit `e35dcd6c` | `_tools/build_data.py`, sinh ra `js/data.js` |
| Công thức (trúng đòn, XP, hồi máu, chết mất vàng) | Arreat Summit, D2MOO | `js/rules.js` |
| Bố cục doanh trại | Vẽ tay theo mô tả công khai, **gần đúng** | `areas.rogue_encampment.preset` trong `build_data.py` |

Không sửa tay `js/data.js` hay `assets/`. Sửa công cụ rồi chạy lại:

```sh
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_assets.py   # cổng dung lượng 35 MB
```

## Mã

| Tệp | Việc |
|---|---|
| `js/drlg.js` | Sinh bản đồ. Doanh trại theo preset. Blood Moor ghép khối 8×8 như DRLG ngoài trời của D2. Den of Evil là hang ngẫu nhiên |
| `js/rules.js` | Hàm thuần: tạo nhân vật, chỉ số dẫn xuất, trúng đòn, sát thương kỹ năng, XP, rơi đồ |
| `js/engine.js` | Vẽ isometric, hoạt ảnh 8 hướng, nhân vật ghép lớp theo đồ đang mặc |
| `js/game.js` | Vòng lặp, máy trạng thái thực thể, AI quái, nhiệm vụ, lưu `localStorage` |
| `js/ui.js`, `js/input.js` | HUD kiểu D2, các bảng, chuột + bàn phím, cảm ứng ngang |

## Tỉ lệ bản đồ

`[ĐO TRONG REPO]` Tốc độ chạy là `RunVelocity × 0,5` = 4,5 ô/giây. Một ô Flare tương đương khoảng 2 subtile D2. Vì thế 1 tile D2 (5×5 subtile) = 2,5 ô (`CELLS_PER_D2_TILE` trong `drlg.js`). Kích thước khu vực trong `data.js` tính bằng tile D2 theo `Levels.txt`.

`[BẪY ĐÃ SẬP]` `Levels.txt` ghi Den of Evil 200×200. Đó là khung bao của DRLG kiểu mê cung, không phải kích thước chơi. Dùng thẳng thì ra một hang 200×200 mà chỉ 9% đi được.

`[BẪY ĐÃ SẬP]` Treasure class của quái Act I có NoDrop cao. Test "giết một con phải rơi đồ" chập chờn đúng theo luật, nên bộ kiểm giết thêm cả đàn trước khi kết luận.

## Kiểm

```sh
node test/diablo2-rules.js   # số liệu so với bảng gốc
node test/diablo2-drlg.js    # 50 seed mỗi khu: tới được mọi lối ra và đàn quái
node test/diablo2-suite.js   # Playwright: chuột thật, cảm ứng 932×430
```

## Chưa có

- Cold Plains, Burial Grounds (Blood Raven), lính đánh thuê, Nightmare/Hell.
- Curse, summon, corpse skill, Leap. Thưởng khi mặc nhiều món cùng set.
- Flare không có giáo/lao, nên Amazon cầm javelin được vẽ bằng gậy.
