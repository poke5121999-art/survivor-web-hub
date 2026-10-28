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

Trạng thái 2026-10-27: làm "full game" theo yêu cầu "làm full game đi". Cách chạy, kiểm và bẫy: `games/casual-farm/README.md`.

1. **Hình** xong cho cả 14 mart (`tools/export_marts.py`).
2. **Mô phỏng thuần JS** xong: máy 1–4 đầu vào, ao cá, xe thu hoạch, trộm, nâng cấp máy/nhân viên/người chơi.
3. **Giao diện** xong: HUD, banner + mũi tên hướng dẫn, camera lia khi mở khoá, menu nâng cấp, menu Next Mart, tiền lúc vắng mặt, tiếng + nhạc.
4. **Tải mờ rồi rõ** xong.
5. **Các cửa hàng sau** xong: Store 2–8 dùng ô có sẵn trong scene; Store 9–14 dựng ô từ CSV `Store_N_Progression` (khớp RC Store 9 38/38).
6. **Lên hub** xong (`index.html`, Unity cũ ở `unity.html`).

7. **Prestige, bản đồ thành phố 3D, trang phục + thú cưng** xong (rev j, k, l). Tường vô hình xong (rev m: z của `NavMeshObstacle.m_Center`).

Tutorial đủ camera, banner, radar ở rev n. Gem, vòng quay ngày, popup tiền đầu mart ở rev r. Save theo tài khoản hub ở rev t. Shop tiền ảo + daily deal + rolling offer ở rev u. Còn lại theo thứ tự: 6 mart mùa + sự kiện, 2 Big Mart, việc nhỏ (lái xe trên bản đồ, cài đặt, mây vùng khoá).
Đối chiếu 302 class trong `D:\minimart-ref\il2cpp-dump\dump.cs` (2026-10-27) với census cũ: không cần làm nhiệm vụ ngày (`DailyChecklistManager` là khung UI bỏ dở, tiến độ không bao giờ tăng), cấp người chơi (`_XPHolder` tắt sẵn trong HUD gốc), dân đi bộ, nhà thu nhập, ô quảng cáo mở nhà (thuộc bản đồ `Map_meta_art`, nhánh A/B `ABMeta = 1`, mặc định tắt), menu mạng xã hội (link ngoài). Menu quản lý 14 mart đã có (thẻ bản đồ). Còn nhỏ: radar cốp xe (`CarTrunkRadarController`), bảng thống kê (`StatsMenuController`, chưa rõ có nút mở không).
Không làm: mua trong app bằng tiền thật (quảng cáo thành nhận miễn phí).
Hở: thu nhập đầu mỗi mart sau rất chậm nếu tới nơi với ít tiền (giá hàng tối đa 10, `pricing.md`).
Hở: Store 9 còn 3 vật cản (`Wall.006/.008/.009`) nằm xa mesh của chính nó; quầy bếp lệch đã sửa ở rev n (static batching). Chưa truy.
