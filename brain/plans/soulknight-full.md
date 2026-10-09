# Soul Knight web: làm đủ nội dung bản gốc 8.6.0

Chủ dự án 2026-10-09: "làm full tất cả những thứ có trong Soul Knight gốc (nhân vật, vũ khí, vùng đất và trùm riêng,
chế độ chơi, sảnh, thú cưng, cây trồng, thiên phú...): research đủ danh sách từ game gốc trước, rồi làm hết. Chạy tự
động tới khi xong, đừng dừng giữa chừng để hỏi."

Kiểm kê gốc so với web: `games/soulknight/tools/polish/INVENTORY.md` (nguồn: localization, tên bundle, code web).
Nhật ký: `games/soulknight/tools/polish/decisions.tsv`. Lệch còn mở: `tools/polish/GAPS.md`. Tiền đề: [[soulknight-normal-mode]].

Thứ tự theo đúng lời chủ dự án. Mỗi mục là một hoặc vài đợt; mỗi đợt xong = commit + push + bộ kiểm trên Pages.

0. [~] Mở khoá dữ liệu (config.ab giải xong bằng `~/sk86-ref/tools/decode_config.py`, XOR ký tự, ngoài git; blob luban AES chưa giải): dựng lại `~/sk86-ref/decoded` (bảng luban: enemies, weapons, pets, plants...) trên Linux.
   Thiếu nó thì trùm theo vùng đất, vũ khí thiếu, thú cưng, cây trồng đều phải đoán.
1. [x] Nhân vật (rev 20261010a): 42/42 hero, 103/103 kỹ năng đã có. Thiếu skin: 782 gốc, web chỉ s0. Lever: `extract_heroes(want_skins)`
   trong `build_sk.py` đã đọc được mọi skin; tách atlas skin theo hero, nạp lười khi chọn. Chọn skin ở màn chọn nhân vật.
2. [x] Vũ khí (rev 20261010b): đủ 409 đánh số + 28 thần thoại (503 món kể cả vũ khí khởi đầu), `build_w86.py` chạy trên
   Linux; 80 món bảng rơi vào bể rương [SUY]. Còn: năng lực thần thoại, đường lấy đồ rèn (mục 5).
3. [~] Vùng đất và trùm riêng: [x] 22 trùm mới cho 10 vùng đất (rev 20261010b, `js/bosses/<pid>.js`, 7 agent song song,
   mỗi trùm qua `test/soulknight-bosses.js`). [ ] vùng 1G, tầng 4 (4A/4B/4C), 5A.
4. [~] Chế độ chơi (đặc tả: scratchpad MODES.md → tools/polish/MODES.md): [x] Lợi Hại, [x] Khu Thí Luyện 15 ải (rev 20261010c),
   [ ] Nhân Tố Thử Thách, [ ] Tước Sĩ cuối, [ ] Mê Trận Tà Vương, Xâm Nhập Hư Không, Thần Điện Thủ Hộ, Chỉ Huy Nhỏ.
   Cũ: Lợi Hại (badass), Khu Thí Luyện (boss rush), Nhân Tố Thử Thách, rồi các chế độ còn lại theo độ khả thi.
   Bỏ qua chế độ online (PVP, nhiều người).
5. [ ] Sảnh: tiện ích tương tác (rương, tủ lạnh, két, mèo chiêu tài, máy quay trứng, bàn rèn, lò đúc, luyện kim,
   thầy huấn luyện, cảnh sát, máy Dilili, hầm, xưởng, khu phép thuật), skin sảnh.
6. [ ] Thú cưng: 55 thú cưng + kỹ năng riêng, chọn thú cưng; thú cưỡi 5, tùy tùng 6.
7. [ ] Cây trồng: vườn, 51 cây, hạt giống, phân bón, thu hoạch.
8. [ ] Thiên phú: 13 chưa có dữ liệu + 20 có dữ liệu chưa có luật; tượng thần còn thiếu.
9. [ ] Còn lại: NPC trong hầm (13), lính thuê (13), vật liệu (162), thành tựu (155), thống kê.

Ghi chú:
- Skin vũ khí, sự kiện (activity), mùa giải khác ngoài Monkia: làm sau mục 9 nếu còn thời gian.
- Thứ không làm được (online, máy chủ) ghi vào GAPS.md kèm lý do, không bỏ im lặng.
