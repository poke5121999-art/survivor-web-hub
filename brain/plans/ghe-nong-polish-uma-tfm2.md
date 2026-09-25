# Ghế Nóng — đánh bóng bằng asset Uma Musume + TFM2 (2026-09-25)

Chủ dự án: "polish game ghế nóng: UI/UX/Anim/VFX/Sound + làm game sinh động hơn dựa trên asset Uma + TFM2".

## Nguồn
- TFM2: `D:\Teamfight.Manager.2.v0.6.0_LinkNeverDie.Com\bundle.game_data`, định dạng tự chế, đọc được thẳng (xem `_tools/build_tfm.py`). Bản bóc thô ở `D:\tfm2-ref`.
- Uma: `~/AppData/LocalLow/Cygames/Umamusume/` (meta là SQLite trần, bundle UnityFS không mã hoá, tiếng CRI ACB/AWB). Bản bóc thô ở `D:\uma-ref`.

## Quyết định
- Trận đấu lấy TFM2: tướng, lính, trụ, lõi, quái có hoạt ảnh thật. Neo khung = TÂM khung (đã kiểm bằng ảnh chồng khung).
- Lớp vũ khí cầm tay (`veVuKhiTay`) bỏ cho thứ có sprite TFM2, vì sprite đã cầm vũ khí sẵn.
- Không đổi hình học `sim.js`: nền sân giữ cách dựng cũ. Ảnh nền TFM2 lệch vị trí trụ nên không dán thẳng được.
- Ngoài trận lấy Uma: tiếng UI, jingle, nhạc nền, nền cảnh, hiệu ứng tập.

## Các bước (mỗi bước: commit, push, kiểm trên Pages)
1. Atlas TFM2 cho tướng/lính/trụ/quái + vẽ theo trạng thái. Bỏ vũ khí rời.
2. Tiếng: bảng tiếng mẫu (TFM2 trong trận, Uma ngoài trận) + nhạc nền theo màn + chỉnh âm lượng.
3. VFX chiêu bằng hiệu ứng TFM2.
4. Ngoài trận: Uma art/nền/hoạt ảnh tập, lật thẻ gacha, lên cấp.
