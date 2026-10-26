# My Mini Mart làm lại bằng three.js (casual-farm)

Chủ dự án giao 2026-10-26: làm lại "mini market" không dùng Unity, tải nhẹ hơn, mới vào thì mờ rồi rõ dần, chuẩn
hơn, vì bản cũ nhiều bug. Bản cũ: Unity WebGL 150 MB ở repo Pages `my-mini-mart-web`, nguồn `D:/minimart-extract` đã mất.

## Chỗ để đồ

- Game: `games/casual-farm/` (id hub giữ `casual-farm`). Khi bản mới đủ chơi, `index.html` thôi chuyển hướng.
- Tool bóc: `games/casual-farm/tools/` (`mm.py` nạp dữ liệu, `export_store.py`). Nguồn `MM_REF` = `D:\minimart-ref`
  (xapk 1.89.5 + bóc + `il2cpp-dump\` + `dump\`). Nháp phân tích ở `D:\minimart-ref\tools`.
- Logic method: udk/Ghidra chạy bên linux, `~/minimart-ref/out` (tmux `minimart-udk`).
- Clip gameplay: `D:\minimart-ref\clips\ANALYSIS.md`.

## Sự thật đã đo

- Unity 6000.0.59f2, IL2CPP arm64, metadata v31, Linear color space. 22 scene, `level1` = Store 1.
- Art rất nhẹ: một palette 256x256 + shader Toony Colors Pro 2 Hybrid (ramp `_HColor`/`_SColor`, viền đen cố định
  pixel). Store 1: 113 mesh, `geo.glb` 1,8 MB chưa nén, `scene.json` 730 KB.
- Camera chính: orthographic size 35, offset theo (77.38, 253.93, -310.62) hệ Unity, nhìn mục tiêu +10 m.
- Chuỗi mở khoá + giá: `RC_MartProgression_<scene>` trong resources.assets (`dump_progression.py`); Store 9+ dùng CSV
  TextAsset `Store_N_Progression`. Giá bán món + `demandQuota`: `RC_ItemPrices_*`.
- Số trong scene: player `speed` 23, `pickupRate`/`dropOffRate` 0,05 s, cây cà chua 1,2 s giữ 3, gà 2,5 s giữ 4,
  khách cầm tay 3 món, worker speed 9.

## Pha

Trạng thái 2026-10-26: pha 1-4 và 6 xong cho Store 1, rev `20261026a`. Cách chạy, kiểm và bẫy: `games/casual-farm/README.md`.

1. **Hình** xong: cảnh, nhân vật có xương + clip, món hàng, viền, meshopt.
2. **Mô phỏng thuần JS** xong: `node test/casual-farm-sim.js` (`MM_MINUTES=180`: 40/40 ô, 15/15 bước hướng dẫn).
3. **Giao diện** xong phần chính: HUD tiền, joystick, nhãn giá, bong bóng khách, banner + mũi tên hướng dẫn, nhảy khi mở khoá.
   Còn: camera lia tới đồ vừa mở (2 s), tiếng, nâng cấp worker/máy.
4. **Tải mờ rồi rõ** xong: blur 14 → 8 → 5 → 0 theo chặng, ảnh 16 px trước.
5. **Các cửa hàng sau** chưa làm: chạy lại bộ xuất cho level2..; nhánh CSV cho Store 9+; `Mat_NextMart` chuyển cảnh.
6. **Lên hub** xong: `index.html` mới, Unity cũ ở `unity.html`, `node test/casual-farm-play.js` (thêm `MM_URL` cho Pages).

Hở: giữa game chậm (bot mua StoreTile2 ở phút 78, khách bỏ về nhiều); chưa rõ do bot hay do luật.
