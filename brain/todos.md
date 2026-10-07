# Todos

## Hắn Đang Tới
- [ ] Kiểm bằng mắt màn trận ở cỡ dọc 390×844 sau khi đổi `eh = min(h, w*0.9)` (commit `6c08ea3`).
  - Với hệ số 0,62 thì nhân vật chỉ cao khoảng 48px và nửa dưới màn là cỏ trống.
  - Đã đổi sang 0,9 nhưng chưa quay lại video để xem.
- [ ] Chưa ai nghe âm thanh trận đánh bằng tai.
  - Phiên máy chỉ kiểm được là không có lỗi.
  - Cần nghe: mức to tương đối giữa các tiếng, và nhạc trận/trùm có lấn tiếng đánh không.
- [ ] Sửa `shot.js`: khi đặt quái cạnh người chơi để ép trận, chọn ô đi được.
  - Chép bản mới của nó vào repo, để sau này chạy lại được.
- [ ] Thay các sprite đang chọn tạm.
  - Icon: mũ giáp, vương miện, khuyên tai.
  - Trùm: Gấu Cuồng Chiến (đang là con khỉ), Trùm Gỗ Giòn (đang là rồng lá), Hiệp Sĩ Đen và Golem (nhỏ quá so với trùm khác).
  - Danh sách ở `games/hic/art/sk/README.md`.
- [ ] Nước trên bản đồ là một tile phẳng, chưa có mép bờ hay sóng.

## Ghế Nóng
- [ ] Đo lại hai chỉnh chưa kiểm của commit `160d9fa`.
  - Bậc 5 `HE_SUC_MAY` = 0,50, đích chung kết thế giới ~20%: `HAT=0/5000/9000 CHI=w3,w4`.
  - Bùng Cuối +30%: `BIEN=the_bungcuoi`.
- [ ] Chạy `_tools/tuchoi.js` hết một mùa trên mã mô phỏng mới.
- [ ] Người chơi đọc màn xem trước sẽ không bao giờ tập NÃO (lối "tham" tới CKTG vẫn NÃO 75), dù NÃO giờ đáng ngang LỰC trong trận.
  - Hướng xử lý: cho sân NÃO ăn dày hơn, hoặc cho màn xem trước nói ra giá trị trong trận.
- [ ] Bố cục riêng cho máy hẹp: ở 844×390 khung co 0,54, nút chỉ khoảng 15px.
- [ ] Chưa ai nghe bằng tai tiếng và nhạc lấy từ TFM2 / Uma (RESEARCH §12.6): mức to tương đối, nhạc có lấn tiếng trận không, bài Uma nào hợp màn nào.
- [ ] Chân dung người vẫn là HoloCure; có muốn đổi sang tranh Uma (`chara_stand`, `chr_icon`) không — chờ chủ dự án.
- [ ] "Giao cho trợ lý" chưa cho xem đội hình vừa chọn.
- [ ] Lời thoại trong trận lặp ("Tôi sai vị trí."); tên nhân vật đứng gần chồng lên nhau.

## Hố Xanh
- [ ] Chùm tia đèn pha của cano đêm chưa có (shader gốc của tia chỉ tách được phần ra màu trắng).
- [ ] Chuyến về bắt đầu ở x = 67; nước đêm trong (8 m) nên thấy đáy cát gần đảo, dễ bị đọc là lỗi. Cân nhắc dời điểm xuất phát ra xa.
- [ ] Bộ nạp phụ thuộc dùng chung của `rip.py` giữ mọi tổ hợp bundle trong bộ nhớ. `rip_bar.py` phải tự viết bộ nạp riêng để khỏi tràn RAM.

## PokéOne
- [ ] Route 2 → Viridian Forest → Pewter, gym Brock (quest dừng ở "Viridian Forest"). Prefab và bảng spawn đã có (`D:\pokeone-ref\wiki\RESEARCH.md`).
- [ ] Chưa ai nghe bằng tai: nhạc 96 kbps, tiếng kêu, `battle_wild` so với `wild_battle_kanto`.
- [ ] Bờ nước chưa có prop sóng; `Shiny Sparkle`, `RippleEffect` đã rút số nhưng chưa dùng; đèn cửa sổ ban đêm.
- [ ] Trận: 26 nền phụ chưa bóc glb; hiệu ứng `fx_*` theo hệ là đoán (bản gốc không có VFX riêng từng chiêu).
- [ ] Tốc độ khung đi (`AnimationSpeed`, `JumpSpeed`), xác suất gặp mỗi bước 11,7%, cấp Pokémon hoang dã là đoán theo FRLG.
- [ ] Ở 844×390 chữ NGUI nhỏ vì UIRoot kẹp chiều cao ảo tối thiểu 700.

## Biển Mù (DREDGE)
- [ ] Chủ dự án chơi thử bản `20261007b` (đợt "chuẩn gốc" W1-W5) và chê tiếp trước khi làm pha 2.
  - Chỉ suite 73, story 42, fishing 241 đã chạy trên Pages; sea, env, cargo mới chạy trên máy.
- [ ] Pha 2: xưởng đóng tàu, mảnh nghiên cứu, cá thối theo ngày, đâm đá hỏng ô. Code đã có `hullTier`, `rotting`, `repair` ở `dock.js` nhưng chưa ai đối chiếu với vị từ trong `plans/dredge-web.md`.
- [ ] Pha 3: chưa có bẫy cua (grep `crabpot` ra 0); lưới kéo (`trawl`) chỉ có trong lời thoại và nhiệm vụ; các bến khác chỉ có tên trên bản đồ, chưa có cửa hàng.
- [ ] Pha 4: chưa có quái và sự kiện thế giới (grep `monster`, `worldEvent` ra 0); mới có cá dị dạng.
- [ ] Pha 5 (Collector, relic, kết thúc) và pha 6 (DLC Pale Reach, Iron Rig) chưa làm.
