---
name: parity-compare
description: So bản web của một game clone với game gốc bằng ảnh ghép gốc|web cùng trạng thái, đo màu và độ sáng theo vùng, ghi nhận xét từng cặp, rồi chặn báo cáo khi còn cặp chưa xét. Dùng trước khi nói "khớp bản gốc", "chuẩn gốc", "giống game thật", trong mọi vòng sửa cho giống bản gốc, hoặc khi chủ dự án chê "chưa giống".
---

# So bản web với game gốc

Đếm màn có/thiếu không bắt được lỗi: Soul Knight từng báo khớp mà sót 12 lỗi. Phải nhìn từng cặp ảnh và đo màu bằng số.

## Thư mục

Mỗi game một chỗ, thường là `D:\<game>-ref\`:

| Thư mục | Chứa |
|---|---|
| `ref/<key>/*.jpg` | Khung gốc của trạng thái `<key>`, lấy từ clip (skill `watch-game-clips`) hoặc ảnh chụp game thật |
| `web/<key>.png` | Ảnh bản web cùng trạng thái, do test tour của game chụp |
| `regions.json` | Vùng cần đo, toạ độ tỉ lệ 0..1: `{"*": {"hud": [0,0,1,0.1]}, "sail-day": {"sea": [0.05,0.6,0.95,0.95]}}` |
| `verdicts.tsv` | `key<TAB>nhãn<TAB>ghi chú`, mỗi chỗ lệch một dòng |
| `compare/` | Đầu ra: `<key>.png`, `index.html`, `report.json` |

Key phải trùng tên giữa `ref` và `web`. Script tour có sẵn: `test/dredge-tour.js` (Biển Mù, ra `<key>.png`), `test/bazaar-capture.js` (Chợ Phiên, ra dải khung theo thời gian). Game chưa có tour thì viết một tour theo mẫu `test/dredge-tour.js`: mỗi trạng thái nạp trang mới, đặt trạng thái qua hook debug, chụp 1280x720.

## Các bước

1. Chụp web trên Pages, không chụp bản local: đặt biến `*_URL` của game (`DR_URL`, `BZ_URL`…) trỏ `https://poke5121999-art.github.io/survivor-web-hub`, chờ Pages lên bản `rev` mới trước.
2. Dựng tờ so:
   ```sh
   python -I .claude/skills/parity-compare/parity.py build --ref D:/<game>-ref/ref --web <ảnh web> --out D:/<game>-ref/compare --regions D:/<game>-ref/regions.json
   ```
   Mỗi dòng in `key  pair|missing-web|missing-ref  vùng:sáng+màu×tỉ lệ`. Mỗi vùng được so với từng khung gốc và lấy khung gần nhất; cờ bật khi cả khung gần nhất vẫn lệch quá `--tol 0.15` độ sáng hoặc `--dc 25` kênh màu (0..255). Vùng `frame` (cả ảnh) chỉ ghi số vào `report.json`, không bật cờ, vì HUD và bố cục khác nhau làm nó lệch sẵn.
3. Mở từng `compare/<key>.png` bằng Read và nhìn. Web bên trái, tối đa 2 khung gốc bên phải, vùng đo viền xanh lơ.
   - Khung gốc phải cùng trạng thái với key: cùng màn, cùng giờ trong game, cùng hộp thoại. Khung lạc trạng thái (menu che, cảnh khác, đang mờ dần) thì xoá khỏi `ref/<key>/` rồi dựng lại; chỉ giữ 2 khung đầu theo tên nên khung sai nằm đầu là hỏng cả cặp.
   - Web và gốc ở hai trạng thái khác nhau (gốc ở xưởng, web ở cây nâng cấp) thì sửa ref hoặc tour cho khớp, đừng ghi nhận xét trên cặp lệch.
   - Khác bố cục, thiếu chi tiết, sai cỡ chữ, sai vị trí: ghi một dòng cho mỗi chỗ.
   - Nghi màu hoặc độ sáng: thêm vùng vào `regions.json` rồi dựng lại, ghi tỉ lệ đo được vào ghi chú. Đừng ước bằng mắt.
4. Ghi `verdicts.tsv` với một trong bốn nhãn:

   | Nhãn | Nghĩa |
   |---|---|
   | `ok` | Khớp. Vùng đo lệch mà vẫn `ok` thì ghi chú phải nói vì sao |
   | `web-bug` | Web làm sai, phải sửa |
   | `version` | Clip là phiên bản game khác với asset đang dùng (khác chữ, khác UI do bản cập nhật), không sửa theo clip |
   | `not-built` | Bản web chưa có phần này |

5. Chạy cổng, phải thoát 0 mới được báo kết quả:
   ```sh
   python -I .claude/skills/parity-compare/parity.py check --out D:/<game>-ref/compare --verdicts D:/<game>-ref/verdicts.tsv
   ```
   Cổng đòi mọi key có cặp ảnh đều có ít nhất một dòng, và mọi key có vùng đo lệch không được ghi `ok` trơn.

## Báo cáo

Đưa số nhãn mà `check` in ra, liệt kê từng dòng `web-bug` kèm ảnh `compare/<key>.png`, và các key `missing-ref` / `missing-web`. Không viết "khớp bản gốc" khi còn dòng `web-bug` hoặc `not-built`.

Ghép nhanh hai ảnh lẻ: `python -I .claude/skills/parity-compare/parity.py pair web.png goc.png ra.png`.
