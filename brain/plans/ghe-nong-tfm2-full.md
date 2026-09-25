# Ghế Nóng: chép trọn dữ liệu trận của TFM2

Yêu cầu chủ dự án (2026-09-25): "copy hết skill + config + stats + equip + time của tfm2".

## Quyết định

- Đội hình tướng = đủ 68 tướng TFM2 (60 gốc + 8 mod), id là id TFM2 (`fighter`, `pyromancer`...).
  20 tướng tự chế (`kiemsi`, `phaposu`...) bị thay hẳn.
- Tên tướng, tên chiêu, mô tả chiêu, tên đồ: chữ tiếng Việt chính thức của TFM2 (`text/*.i18n`, khoá `vi`).
- Số liệu giữ đơn vị TFM2 trong dữ liệu: tick 60/giây, khoảng cách 1000 = 1 điểm ảnh sân 960000.
  Sim đổi đơn vị ở MỘT chỗ.
- Mỗi tướng có đòn đánh + 3 chiêu (skill, skill2, ult) đúng như TFM2. Không còn "nội tại" tự chế.
- 30 món đồ TFM2 (6 dòng × 5 bậc, ghép theo `next_tier`), thay bộ đồ tự chế.
- `game_setting` của TFM2 (hồi sinh, vàng, kinh nghiệm/cấp, lính, quái, trụ, lõi, về nhà) thay số tự chế.

## Nguồn

- `js/data-tfm.js` sinh bởi `_tools/build_tfm_data.py` (window.TFM = {tuong, do, cai, macro, chu}).
- Chiêu của 8 tướng mod khai bằng cây hiệu ứng (28 kiểu: TargetProjectile, RangeProjectile, Combine,
  AddStatScaledBuff...). Chiêu của 60 tướng gốc chỉ có tham số; cách chạy suy từ mô tả tiếng Việt,
  nơi `{Damage}`, `{Coef}`, `{Stun}`, `{Range}`... là tham số.
- Bộ não bot: `D:\tfm2-ref\AI_BRAIN.md`.

## Các bước (mỗi bước kết thúc bằng một lần kiểm; game chơi được sau mỗi commit)

1. [xong] Dữ liệu: `build_tfm_data.py` → `js/data-tfm.js`.
2. Lõi (agent lõi): sim đọc thẳng TFM2 (chỉ số + tăng mỗi cấp, `need_exp`, vàng, hồi sinh, lính,
   quái, trụ, lõi, đồ), nhịp ra đòn theo tick (duration / start_timing / cooltime), bộ hàm nguyên thuỷ
   cho chiêu, trình chạy cây hiệu ứng cho 8 tướng mod, và cách chạy CHUNG theo tham số cho 60 tướng gốc.
   Đổi đội hình sang 68 id ở mọi nơi (cấm chọn, tuyển thủ, lưu game).
3. Ảnh / tiếng / VFX (agent ảnh, chạy song song bước 2): xuất sprite, hiệu ứng chiêu, tiếng của đủ 68 tướng,
   khoá theo id TFM2.
4. Chiêu đúng mô tả (4 agent song song, mỗi agent 15–17 tướng, mỗi agent một tệp `js/chieu-tfm-N.js`).
5. Bot: nối bộ não TFM2 (tranh quái lớn cả đội, đua "ai chết trước", chiêu theo `casting_target`).
6. Cân bằng: `canbang.js`, `tileThang.js`, `tuchoi.js`, `kiemTieng.js`; đẩy và chơi thử trên Pages.

## Yêu cầu giữa các agent

- [xong 2026-09-25, main] `js/sprites.js` `G.napTuong`: `xongCa` chạy hai lần khi script và ảnh cùng xong trong một lượt
  (script `onload` gọi `kt` → `xongCa` → đặt `DANG_NAP_T[id] = null`; rồi ảnh `onload` gọi `kt` → `xongCa` lần
  nữa → `null.forEach`). Bắt được 1 lần trong 21 trận tự chơi (`tuchoi.js`, 2026-09-25). Cần `if (!ds) return;`
  đầu `xongCa`. Không chết game, chỉ là lỗi trang.
- [xong 2026-09-25, main: sửa trong sprites.js, bỏ `G.oAnhTuongTFM`] `G.anhTuongIcon` đặt `background-size` bằng cỡ ô (`m[2]*k`) thay vì cỡ atlas ⇒ chân dung là cả tấm
  co lại 21 px. Lõi tạm dựng style riêng trong `G.oAnhTuongTFM` (data-tuong.js) từ `window.TFM_ICON`; sửa xong
  thì lõi bỏ bản tạm. `art/tfm/icon.js` chưa có thẻ `<script>` — lõi đã thêm vào index.html.
- [lõi → 4 agent chiêu] API `S` ở RESEARCH §14.3; ví dụ mẫu: fighter (tệp 1), pyromancer (2), nightmare (3),
  priest (4). Tên hoạt ảnh / tiếng riêng tra §15.
- [agent 1 (17 tướng, chieu-tfm-1.js) → lõi, 2026-09-25] Năm việc còn thiếu để viết ĐÚNG hết chiêu nhóm 1
  (mỗi việc đã có giải pháp tạm trong chieu-tfm-1.js, ghi rõ bằng `[CHƯA LÀM ĐƯỢC]` tại chỗ, không chặn trận):
  1. **`data-tuong.js` dựng `kn.skill.p` từ `c['skill']`, không thử `c['skill1']`** — Dancer trong dữ liệu
     TFM2 gốc đặt tên tham số kỹ năng đầu là `skill1` (không phải `skill`), nên `n.tuong.tfm.skill` luôn
     `undefined` và `thuChieu()` (sim.js, `if (!n.tuong.tfm[loai]) continue`) không bao giờ gọi tới —
     "Ném Chakram" (chiêu chính của Dancer) hiện KHÔNG BAO GIỜ ra được trong trận thật, dù `chieu-tfm-1.js`
     đã viết đúng hàm (đọc thẳng `S.n.tuong.tfm.skill1`, kiểm ĐẠT bằng cách gọi thẳng `G.chayChieu`, bỏ qua
     `thuChieu`). Sửa một chỗ: khi dựng `kn[loai]`, thử thêm `c[a + '1']` nếu `c[a]` không có (đã đo thêm
     11 tướng khác có cùng kiểu lệch tên `skill1`/thiếu hẳn `skill`/`skill2` — phần lớn là NỘI TẠI thật
     không tham số nào, chỉ Dancer là có tham số đầy đủ mà lệch tên).
  2. **Không có nguyên thuỷ "khi khiên vỡ/hết thì làm X"** — Android skill2 ("Lá Chắn Phát Nổ": hết khiên
     mới choáng xung quanh) chỉ mô phỏng được nhánh HẾT HẠN tự nhiên (hẹn đúng lúc `shield_duration`),
     không bắt được nhánh "khiên bị đánh vỡ sớm".
  3. **Không có nguyên thuỷ chặn đạn bay theo vùng** — Barrier Magician skill2 ("Kết Giới Phong Toả": vô
     hiệu hoá đạn bay trong vùng) chỉ dựng được hình, không chặn được `tran.dan` (đạn không phải thực thể
     truy vấn được từ `S`).
  4. **Không có nguyên thuỷ "cộng hiệu ứng vào N đòn đánh thường kế tiếp"** — Cavalry Knight skill2 (đòn
     đánh thường gây thêm sát thương thiêu đốt một khoảng thời gian) và các tướng khác có mẫu tương tự.
  5. **Không có nguyên thuỷ "chuyển X% sát thương nhận thành sát thương theo thời gian"** (khác `giamNhan`
     nhân thẳng) — Chef ult ("phân tán sát thương") và **"chia sẻ sát thương giữa hai mục tiêu liên kết"**
     — Dark Mage ult ("Xiềng Xích Thống Khổ"). Cả hai đều cần móc vào `satThuong`.
  Ba việc khác chỉ là NỘI TẠI thật không tham số (không cần primitive, chỉ cần biết là bình thường):
  Ogre `skill`, Dancer `skill2`, và cơ chế "hồi chiêu Berserker ult giảm theo máu đã mất"
  (`ult_cooltime_reduction`/`ult_max_cooltime_reduction` nằm NGOÀI khối `ult`, cần móc theo dõi máu mất
  liên tục — không phải lúc ra chiêu).
- [agent 2 (17 tướng, chieu-tfm-2.js) → lõi, xác nhận việc #1 của agent 1, 2026-09-25] Đếm lại toàn bộ
  68 tướng: **8 con lệch tên `skill1`/`skill`** (dancer, lightning_mage, poison_dart_hunter + **năm con của
  nhóm 2**: dokkaebi, gambler, ghost, plague_doctor, pole_warrior) và **3 con không có khối `skill`/`skill1`
  nào cả** (monk, ogre, và **gunner** của nhóm 2 — nội tại thật, số nằm ở trường cấp-tướng
  `move_speed_up`/`move_speed_up_duration`, không phải trong một khối hành động). Với năm con của nhóm 2,
  né tạm bằng hàm cục bộ `p1(S)` đọc thẳng `S.n.tuong.tfm.skill1` (viết trong `chieu-tfm-2.js`) — nhưng
  đây CHỈ sửa được số/sát thương khi hàm được gọi tay; **`G.chonMucChieu` và cơ chế khoá người/hồi chiêu của
  hành động "skill" (`batDauHanh`, `n.hanh.dai/moc`, `n.cd.skill`) đều đọc `kn.skill.p` rỗng**, nên trong
  trận thật (không qua bộ kiểm gọi thẳng `G.chayChieu`) năm chiêu này gần như chắc chắn không tự ra được —
  cùng một chỗ sửa với agent 1 đề xuất (`data-tuong.js`, dựng `kn[loai]`: thử thêm `c[a + '1']` khi `c[a]`
  rỗng) sẽ sửa được cả 8 con cùng lúc. `gunner` (không có khối nào) thì không có gì để đọc — cần nguyên
  thuỷ "khi ra đòn đánh thường" (mục #4 của agent 1) mới viết được `skill` (nội tại "đánh trúng thì cộng
  tốc chạy"); `gunner.skill2`/`ult` của nhóm 2 cũng cần cùng nguyên thuỷ ấy cho vế "cứ 3 đòn thì làm chậm" /
  dokkaebi.skill cho vế "đòn đánh tạo sóng xung kích" — cả ba đều đang xấp xỉ bằng xung lặp theo đúng nhịp
  `attack.cooltime` thay vì bám sát đòn đánh thật.
- [agent 4 (15 tướng, chieu-tfm-4.js) → lõi, 2026-09-25] Xác nhận việc #1 (agent 1/2): `poison_dart_hunter`
  cũng lệch tên `skill1`/`skill` (đã né bằng `S.n.tuong.tfm.skill1` như agent 2). **[xong, lõi đã sửa trong
  dcb7c51]** — `data-tfm.js` giờ chép `skill1` → `skill` (giữ nguyên `skill1`), `poison_dart_hunter.skill` tự
  ra được trong trận thật; hàm của agent này vẫn đọc `tfm.skill1` (giá trị giờ trùng `tfm.skill`, không cần
  sửa lại). Thêm một ca KHÁC hẳn, không phải thiếu khoá mà LỆCH GIỮA CHỮ VÀ SỐ: **`soldier`** có khối `skill`
  với số liệu của "Điểm Xạ Ba Viên" (đủ `cooltime/duration/start_timing`, sim THỰC SỰ gọi được) nhưng
  `mo_ta.skill`/`ten_chieu.skill` lại là chữ của "Ngắm Bắn Chính Xác" (nội tại tăng tầm đánh mỗi cấp, đọc
  `growth_range` nằm CHUNG trong khối `skill` đó); còn `ten_chieu.skill2`/`mo_ta.skill2` mới đúng là chữ
  "Điểm Xạ Ba Viên" nhưng slot đó KHÔNG có khối dữ liệu (`tfm.bi_dong` xác nhận `soldier: ['skill2']` — TFM2
  tự coi slot 2 của con này là NỘI TẠI, khớp với suy đoán trên). Đã cài đúng số (ba phát liên tiếp) ở khe
  `skill` — khe sim thật sự gọi — và ghi `mota.skill` viết tay thay chữ sai; nội tại tăng tầm mỗi cấp
  (`growth_range`, cả trong khối `attack` lẫn `skill`) CHƯA cộng vào đâu cả (không thuộc `S`/chiêu, là việc
  của `G.tuongOCap` — bảng chỉ số cốt lõi).
  **Nội tại (`bi_dong`) của nhóm này** — `poison_dart_hunter.skill2` ("Truy Vết Độc Tố": +tầm đánh khi đánh
  trúng địch nhiễm độc, +tốc chạy khi lùi xa) và `soldier.skill2` (tăng tầm mỗi cấp, ở trên) đều nằm trong
  `tfm.bi_dong`, sim không bao giờ gọi qua khe chiêu — không thể cài bằng `G.CHIEU_TFM` (chỉ chạy lúc RA
  CHIÊU). Cần một hệ nội tại RIÊNG ngoài chiêu (đọc `tfm.bi_dong` + khối tham số cùng tên, móc vào lúc tính
  `chiSoNguoi`/lúc ra đòn đánh thường) mới cài được — không chặn trận (thiếu thì đơn giản là nội tại chưa có
  hiệu lực, không lỗi), nhưng cần lõi quyết định cách móc vì đụng `chiSoNguoi`/`satThuong` (ngoài quyền sửa
  của agent chiêu). Đã để trống, chỉ sửa `mota.skill2` cho khỏi hiện `?`.
  Ba nguyên thuỷ còn thiếu (không phải nội tại, mà THIẾU MÓC cho chiêu chủ động), đã né tạm (ghi rõ tại chỗ
  trong `chieu-tfm-4.js`), không chặn trận:
  1. **Không có nguyên thuỷ áp "Không Thể Bị Chỉ Định" lên MỤC TIÊU** (`S.khongChon(tick)` chỉ tự áp cho
     người ra chiêu) — Taoist ult ("Phong Ấn Dây Chuyền") cần áp lên địch trúng chiêu. Né bằng gán thẳng
     `m.khongChon = Math.max(m.khongChon||0, S.tran.t+S.giay(tick))` (đúng công thức `S.khongChon` làm cho
     `n`, chỉ đổi mục tiêu). Xin thêm `S.khongChonMuc(m, tick)`.
  2. **Không có nguyên thuỷ "Giải Giới" (cấm đánh thường, còn dùng chiêu bình thường)** — Taoist skill
     ("Phong Ấn Vũ Khí"). Né bằng `S.buff(m,{tocdanh:-100},...)` (chiSoNguoi kẹp sàn 0,2× tốc đánh, không
     phải cấm hẳn).
  3. **Không có nguyên thuỷ chuyển sát thương entity khác chịu hộ** — Shield Bearer skill2 ("Lời Thề Hộ Vệ").
     Né bằng buff `giamNhan` X% thẳng trên đồng minh (đúng SỐ MÁU MẤT quan sát được, nhưng Shield Bearer
     không tự nhận thêm sát thương như mô tả gốc).
  Nhiều chiêu khác (pythoness ult, voodoo_shaman skill2, spirit_caller ult, poison_dart_hunter ult…) xấp xỉ
  "đếm số lần bị đánh trúng" / "khi đồng minh đánh trúng thì…" bằng nhịp đều đặn hoặc đọc trường công khai
  `danhTuongAi/danhTuongLuc` — không cần primitive mới, chỉ là gần đúng, ghi trong chú thích từng con.

## Nhật ký

- 2026-09-25: bước 1 xong.
- 2026-09-25 (lõi, bước 2): sim viết lại trên số TFM2 — tick 1/60, nhịp ra đòn `cooltime/duration/start_timing/
  cancelable`, đạn bay, vùng, lao, đẩy/kéo, lá chắn, buff theo bảng khoá chung với đồ; kinh tế / hồi sinh / lính /
  quái / trụ / Chúa Hang / Rồng từ `game_setting`; 30 món đồ; 68 tướng có vị trí + lớp; mô tả chiêu điền tham số;
  cách chạy chung + cây hiệu ứng + bảng viết tay `G.CHIEU_TFM`; cấm chọn / thẻ trận / lưu game / tủ đội máy / bảng
  thông thạo đổi id. Đo ở RESEARCH §14. Bước 3 (ảnh) đã có: sim nối vào `G.napTuong/G.veHinhT/G.animTuong`.
