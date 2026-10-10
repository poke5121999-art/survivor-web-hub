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
   mỗi trùm qua `test/soulknight-bosses.js`). [x] vùng 1G Di Tích Máy Móc + boss30 (rev 20261010e), [ ] tầng 4 (4A/4B/4C), 5A.
4. [~] Chế độ chơi (đặc tả: scratchpad MODES.md → tools/polish/MODES.md): [x] Lợi Hại, [x] Khu Thí Luyện 15 ải (rev 20261010c),
   [x] Nhân Tố Thử Thách 36 nhân tố, [x] Tước Sĩ Đỏ/Tím ải 3-6 (rev 20261010d), [~] Mê Trận Tà Vương (đặc tả MODES.md 2d; lõi đang làm: STAGES động, Uy Áp, Tà Vương, js/matrix.js; thẻ ở sảnh nối sau vườn),
   [ ] Xâm Nhập Hư Không độ 1 (MODES.md 2e: tinh anh 3 tầng khiên), [ ] tầng 4A/4B/4C (FLOOR4.md: cổng tím sau 3-5, làm 4A trước;
   cần dựng sk-data nên làm khi không agent nào dựng), [ ] Thần Điện Thủ Hộ, Chỉ Huy Nhỏ.
   Cũ: Lợi Hại (badass), Khu Thí Luyện (boss rush), Nhân Tố Thử Thách, rồi các chế độ còn lại theo độ khả thi.
   Bỏ qua chế độ online (PVP, nhiều người).
5. [~] Sảnh — [x] bước 1–3 (rev 20261010e: kho đồ, thư, nhãn + phím E, rơi vật liệu 137 món, két/chuyển phát/máy đổi...) (đặc tả 43 tiện ích + kinh tế + 9 bước: tools/polish/HALL.md; bước 1 kho đồ/thư/tương tác → 2 rơi vật liệu →
   3 két/chuyển phát/máy đổi → 4 bàn thiết kế + rèn → 5 rương/máy trứng/mèo → 6 vườn → 7 nội thất bản vẽ → 8 sổ tay/thành tựu → 9 xưởng/treo thưởng): tiện ích tương tác (rương, tủ lạnh, két, mèo chiêu tài, máy quay trứng, bàn rèn, lò đúc, luyện kim,
   thầy huấn luyện, cảnh sát, máy Dilili, hầm, xưởng, khu phép thuật), skin sảnh.
6. [~] Thú cưng: [x] 55 thú cưng + kỹ năng riêng (js/pets/petN.js, số theo wiki tools/wiki/pets.json, rev 20261010f),
   [x] pet được kéo vào phòng khi rào dâng; [x] chọn/mua/cho ăn/thân mật 50% mở kỹ năng (js/hall_pet.js, rev 20261010g);
   [ ] HP chung của pet (wiki: 10 HP, nghỉ ở 1 HP, hồi 14–16 s; pet7/8/14/26/49 đang giữ a.hp riêng); [x] lính thuê 13 + dữ liệu thú cưỡi (rev 20261010i); [ ] thú cưỡi sinh vật + cơ giáp (bước C–D).
7. [~] Cây trồng: [x] Vườn bên trái sảnh, 8 ô, 47 cây, tưới/bón/xẻng/thu hoạch (rev 20261010i); [ ] 14 cây buff chưa có luật, pet cây chỉ đi theo + cắn.
8. [~] Thiên phú: [x] luật 38,39,40,41,1020,2145,2146,1024,2105,2108,2118,17,23,1015–1018 (rev 20261010h; id = BuffId, bảng INVENTORY
   mục 7 trước đó lệch 1 ô); [ ] 15,31,1023,1025 chưa có cơ chế nền; 3001–3007 thuộc Xâm Nhập Hư Không; tượng thần còn thiếu.
9. [ ] Còn lại: NPC trong hầm (13), lính thuê (13), vật liệu (162), thành tựu (155), thống kê.

Ghi chú:
- Skin vũ khí, sự kiện (activity), mùa giải khác ngoài Monkia: làm sau mục 9 nếu còn thời gian.
- Thứ không làm được (online, máy chủ) ghi vào GAPS.md kèm lý do, không bỏ im lặng.

