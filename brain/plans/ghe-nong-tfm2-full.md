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

- [lõi → ảnh] `js/sprites.js` `G.napTuong`: `xongCa` chạy hai lần khi script và ảnh cùng xong trong một lượt
  (script `onload` gọi `kt` → `xongCa` → đặt `DANG_NAP_T[id] = null`; rồi ảnh `onload` gọi `kt` → `xongCa` lần
  nữa → `null.forEach`). Bắt được 1 lần trong 21 trận tự chơi (`tuchoi.js`, 2026-09-25). Cần `if (!ds) return;`
  đầu `xongCa`. Không chết game, chỉ là lỗi trang.
- [lõi → ảnh] `G.anhTuongIcon` đặt `background-size` bằng cỡ ô (`m[2]*k`) thay vì cỡ atlas ⇒ chân dung là cả tấm
  co lại 21 px. Lõi tạm dựng style riêng trong `G.oAnhTuongTFM` (data-tuong.js) từ `window.TFM_ICON`; sửa xong
  thì lõi bỏ bản tạm. `art/tfm/icon.js` chưa có thẻ `<script>` — lõi đã thêm vào index.html.
- [lõi → 4 agent chiêu] API `S` ở RESEARCH §14.3; ví dụ mẫu: fighter (tệp 1), pyromancer (2), nightmare (3),
  priest (4). Tên hoạt ảnh / tiếng riêng tra §15.

## Nhật ký

- 2026-09-25: bước 1 xong.
- 2026-09-25 (lõi, bước 2): sim viết lại trên số TFM2 — tick 1/60, nhịp ra đòn `cooltime/duration/start_timing/
  cancelable`, đạn bay, vùng, lao, đẩy/kéo, lá chắn, buff theo bảng khoá chung với đồ; kinh tế / hồi sinh / lính /
  quái / trụ / Chúa Hang / Rồng từ `game_setting`; 30 món đồ; 68 tướng có vị trí + lớp; mô tả chiêu điền tham số;
  cách chạy chung + cây hiệu ứng + bảng viết tay `G.CHIEU_TFM`; cấm chọn / thẻ trận / lưu game / tủ đội máy / bảng
  thông thạo đổi id. Đo ở RESEARCH §14. Bước 3 (ảnh) đã có: sim nối vào `G.napTuong/G.veHinhT/G.animTuong`.
