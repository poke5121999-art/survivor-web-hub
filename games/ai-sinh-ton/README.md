# Ải Sinh Tồn

Game tự đánh theo ải, màn dọc, chơi một người. Một đội tối đa 4 tướng tự di chuyển, tự chọn mục tiêu, tự đánh và tự dùng hai kỹ năng phụ qua 5 đợt zombie của mỗi ải; đợt 5 là boss. Người chơi chỉ làm ba việc trong trận: chạm ngọn lửa trên chân dung để tung tối thượng, chọn thẻ nâng cấp cho từng tướng sau mỗi đợt, và chọn xem trận qua mắt tướng nào. Ngoài trận là gacha, cấp tướng và trang bị.

Không có file model, ảnh hay âm thanh: mọi thứ sinh bằng code, chạy bằng three.js r160. Phạm vi đầy đủ và mọi bảng số ở `~/handoff/ai-sinh-ton-SCOPE.md` của chủ dự án; bản trong repo là code ở `js/data/`.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `js/data/` | Bảng dữ liệu và luật thuần: tướng, quái, boss, ải, thẻ, gacha, giá lên cấp, trang bị. Không đụng DOM. |
| `js/sim/battle.js` | Lõi trận. Bước cố định 30 lần mỗi giây, cùng seed cùng kết quả. Trình duyệt và tool Node dùng chung. |
| `js/meta.js` | Tài khoản người chơi và mọi lệnh thay đổi nó. Lưu ở `localStorage` khoá `aisinhton.save.v1`. |
| `js/bz/` | Tầng hình và tiếng mượn của Blockade Z. **Sinh tự động, không sửa tay.** |
| `js/view/` | Vẽ trận: sàn, sương, mưa, tướng, quái, camera. |
| `js/ui/` | Giao diện 3D: bảng, nút, chữ, icon, chân dung là mesh three.js có ánh sáng. |
| `tools/` | Tool kiểm. File `.mjs` không có chữ "shots" hay "test" trong trình duyệt thì chạy bằng Node thuần. |

## Mượn gì của Blockade Z

Model và animation của 13 tướng, zombie và 11 boss, hiệu ứng, âm thanh tổng hợp và texture đều là code của `games/blockade-z/js/`. Thư mục `js/bz/` là bản copy có vá vài chỗ (khoá lưu riêng, luôn tiếng Việt, tắt lớp voxel), tạo bằng:

```
node games/ai-sinh-ton/tools/port-bz.mjs           # sinh lại js/bz/
node games/ai-sinh-ton/tools/port-bz.mjs --check   # in GATE PASS khi js/bz/ khớp bản sinh mới
```

Muốn đổi gì trong `js/bz/` thì thêm một dòng vá vào `PATCHES` của tool rồi chạy lại. Không sửa `games/blockade-z/`: đó là game khác.

Zombie chạy ở chế độ puppet của Blockade Z (chế độ dành cho khách co-op): thân hình chỉ vẽ theo dữ liệu vị trí, máu, trạng thái mà lõi trận của game này đưa vào, không chạy AI của Blockade Z.

## Kiểm

Chạy bằng Node, không cần trình duyệt:

```
node games/ai-sinh-ton/tools/sim-test.mjs    # hành vi trận
node games/ai-sinh-ton/tools/meta-test.mjs   # tài khoản, lưu, gacha, lên cấp, trang bị
node games/ai-sinh-ton/tools/economy.mjs     # tỉ lệ gacha, bảo hiểm, đường giá, số trận tới cấp 10/20/50
node games/ai-sinh-ton/tools/ladder.mjs      # thang ghép trang bị
node games/ai-sinh-ton/tools/balance.mjs 1 30 3   # tỉ lệ thắng từng ải với bốn đội chuẩn
node games/ai-sinh-ton/tools/bosscmp.mjs 14 4     # so 11 boss trên cùng điều kiện
node games/ai-sinh-ton/tools/trace.mjs 10 ssr     # chi tiết một ải
```

Tool trình duyệt dùng `tools/pw.mjs` (Playwright, Chrome thật, mỗi lúc một Chrome qua file khoá `.chk/chrome.lock`). Đặt `PLAYWRIGHT_PATH` tới thư mục `playwright-core`; `GL=swiftshader` khi máy không có GPU; `AST_BASE=https://poke5121999-art.github.io/survivor-web-hub` để chạy trên bản đã lên Pages.

## Tham số URL khi thử

`?autostart=1` vào thẳng trận, `?stage=N`, `?seed=N`, `?wave=N`, `?team=thep,mua,yta,gio`, `?autoult=1`, `?autopick=1`, `?q=low|medium|high`, `?noaudio=1`, `?spectate=<ô>`.
