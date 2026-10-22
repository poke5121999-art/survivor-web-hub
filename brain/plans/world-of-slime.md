# Thế Giới Slime (World of Slime web)

Chủ dự án giao 2026-10-21: dựng lại World of Slime Demo (TEAM42, Steam) thành game web trong hub, dùng full art gốc
không tự vẽ, có hai bản PC và mobile. Asset nặng để ở repo riêng.

## Chỗ để đồ

- Game: `games/world-of-slime/` (id hub `world-of-slime`). Tool bóc: `games/world-of-slime/tools/`, đường dẫn gom ở
  `wos.py` (`WOS_GAME`, `WOS_REF`, `WOS_ASSETS`).
- Asset: repo `poke5121999-art/world-of-slime-assets`, clone `D:\world-of-slime-assets`, Pages
  `https://poke5121999-art.github.io/world-of-slime-assets/` (CORS `*`, trần site 1 GB, mỗi tệp dưới 50 MB).
- Nghiên cứu ngoài git: `D:\wos-ref\notes\` (`GAMEPLAY.md`, `CODE.md`, `ASSETS.md`, `DATA.md`, `PIPELINE.md`),
  chỉ mục `D:\wos-ref\cache\bundle_index.json` + `cabmap.json`, chuỗi giao diện `D:\wos-ref\data\loc\vi.json`.

## Sự thật đã đo

- Unity IL2CPP, metadata v39, Addressables không mã hoá, 4206 bundle 1879 MB (Wwise 776 MB). Typetree có trong bundle.
- Game online: chỉ số slime, skill, item, quest, tên slime, lời thoại do server gửi (`MetaSyncManager`), bố cục
  ô bản đồ + va chạm tải từ S3 (`MapDataLoader`, `map_type_{id}_client.dat`, `_tile.dat`). Cả hai được ghi đệm ra đĩa
  sau khi chơi (`meta_*`, `MapCacheStore`). Máy này chưa từng chạy demo nên chưa có đệm.
- Đánh thời gian thực trên bản đồ, server tính sát thương. Không có công thức trong client.
- PC và mobile chung code: PC là Input System `SMActions` (WASD, Space, Shift/Q/E/R, 1-6, chuột ngắm), mobile là
  `MainJoystick` + nút đánh + kéo nút skill để ngắm.
- Đường ống GLB chạy được (`SL_Bat_WindDark.glb` 232 KB, 12 clip). Bẫy lớn: euler XYZ theo `customType`.

## Pha

1. **Bóc art vào repo asset** (đang chạy). Slime/NPC/người chơi GLB, mảnh bản đồ GLB, ảnh 2D webp, âm thanh ogg.
   Mỗi tool ghi `index.json` cho thư mục của nó.
2. **Lấy đệm server** sau khi chủ dự án chơi demo: `meta_*` thành bảng JSON, `map_type_*` (MessagePack) thành lưới ô.
   Thiếu đệm thì không có bản đồ thật, chỉ dựng tay được, mà dựng tay đã bị chê (xem memory compare-render-to-real-game-shots).
3. **Lõi game**: three.js r160, lưới ô autotile theo `MapCombineDataSet`, người chơi + camera cao cố định, slime đi
   theo và tự đánh, bắt bằng Cube, đội 4-5 con.
4. **Giao diện** từ sprite `ui_shared` + bố cục prefab `ui_*`: HUD, đội, Slimepedia, kho slime, hội thoại, nhiệm vụ.
5. **PC và mobile**: hai bố cục + hai kiểu điều khiển, theo nhánh `IsStandalone()` của code gốc.
6. **Lên hub**: thẻ trong `data/games.js`, `rev`, kiểm trên Pages.

## Trạng thái 2026-10-22

- Đã lên Pages (`43eeea18`, rev 20261022a): HUD gốc, bảng phím SMActions, ba bản đồ Larus thật (257 quán trọ,
  110 làng, 478 kho) từ đệm server, 10 bảng meta gốc ở `games/world-of-slime/data/meta/`, cửa + 10 NPC đặt theo ảnh.
  Kiểm: `test/world-of-slime-{slice,hud,larus}.js` (13, 37, 16 PASS trên Pages).
- Chủ dự án chọn dừng lấy đệm (phương án C). Chưa có bản đồ ngoài làng; rừng dùng `?map=dev`.
- Đệm thô ở `D:\wos-ref\server-cache\live`, ảnh chụp game thật ở `D:\wos-ref\pilot` (tool lái game `D:\wos-ref\tools\pilot.py`).
- 2026-10-22 `69382801` rev 20261022b: nhiệm vụ Larus 1-6 + shop Cube theo `docs/research/QUESTLINE.md` (clip DcGavHFwqtk),
  `test/world-of-slime-quest.js` 70 PASS trên Pages.
- Còn thiếu: đồ đạc trong nhà, mặt nước đài phun, tạo nhân vật, đấu Rudga + Shadow Forest (chưa có bản đồ), đánh nhau, bắt slime, thẻ hub.

## Giả định đang dùng

- Bản web chơi một mình. Không có người chơi khác, không PvP, không chat.
- Số không có trong client (sát thương, khắc hệ, tỉ lệ bắt) là số tự đặt, ghi nhãn `[ĐỀ XUẤT]` trong mã, cho tới khi có đệm meta.
