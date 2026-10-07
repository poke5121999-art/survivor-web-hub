# DREDGE bản web (games/dredge)

Chủ dự án yêu cầu 2026-10-07: phân tích bản DREDGE 1.5.3 trên máy, dùng asset gốc, đọc wiki, dựng lại trên web.
Nguồn: `D:\DREDGE.v1.5.3.2_LinkNeverDie.Com.rar` (mật khẩu `linkneverdie.com`), giải nén ở `D:\dredge-ref\game`.
Unity Mono, 113 bundle Addressables không mã hoá. Mã C# dịch ngược ở `D:\dredge-ref\src`.

## Đích từng pha (vị từ kiểm được)

Mọi pha chỉ coi là xong khi chạy được trên `https://poke5121999-art.github.io/survivor-web-hub/games/dredge/index.html`,
`node test/dredge-suite.js` xanh với `DR_URL` trỏ vào Pages, không có `pageerror` và không có response >= 400.

| Pha | Vị từ "xong" |
|---|---|
| 0. Bóc + nghiên cứu | `tools/*.py` chạy lại ra cùng tệp; `D:\dredge-ref\notes\CODE.md` + `WIKI.md` có; ảnh nhìn từ trên khớp bản đồ gốc, không lật gương |
| 1. Lõi chơi được | Rời bến Greater Marrow bằng thuyền gốc trong thế giới gốc; giờ chỉ trôi khi đi/câu; đêm tối, sương, hoảng loạn tăng; câu ở điểm cá gốc qua minigame đúng loại; cá vào khoang lưới đúng hình; về bến bán đúng giá gốc |
| 2. Thuyền + kinh tế | Xưởng đóng tàu: nâng thân (lưới tier 1-5 gốc), mua cần/động cơ/đèn; mảnh nghiên cứu; cá thối theo ngày; đâm đá hỏng ô, sửa ở bến |
| 3. Nạo vét + bến khác | Nạo vét, lưới kéo, bẫy cua; các bến Little Marrow, Gale Cliffs, Stellar Basin, Twisted Strand, Devil's Spine với cửa hàng gốc |
| 4. Đêm đáng sợ | Đá ma, quái từng vùng, sự kiện thế giới (`worldeventdata`), cá dị dạng, hiệu ứng hoảng loạn |
| 5. Cốt truyện | Collector, relic, nhiệm vụ, hội thoại (bảng chữ gốc), kết thúc |
| 6. DLC | The Pale Reach, The Iron Rig |

## Hợp đồng dữ liệu

| Tệp | Ai ghi | Hình |
|---|---|---|
| `art/world/lib.glb`, `instances.bin`, `world.json`, `terrain.png`, `landmask.png`, `markers.json` | `tools/world.py` | xem docstring của world.py |
| `data/items.js` (`DR_ITEMS`), `strings.js` (`DR_STR`), `grids.js`, `upgrades.js`, `quests.js`, `weather.js`, `mapmarkers.js`, `art/items/*` | `tools/data.py` + `tools/odin.py` | id chuỗi, enum ra tên, PPtr ra id |
| `data/audio.js` (`DR_AUDIO`), `audio/**` | `tools/audio.py` | khoá ngữ nghĩa `boat.engine.loop` … |
| `art/boat/boat.glb`, `data/boat.js` (`DR_BOAT`) | `tools/boat.py` | node giữ tên gốc |

Toạ độ: Unity tay trái sang three.js tay phải bằng cách đổi dấu Z (đỉnh, vị trí), quaternion (x,y,z,w) → (-x,-y,z,w), lật chiều tam giác.

## Ngân sách dung lượng

Repo đã 2,84 GiB pack. `games/dredge` nhắm <= 90 MB: thế giới 40, item + UI 25, tiếng 25, thuyền 6.

## Tiến độ

| Pha | Trạng thái | Ghi chú |
|---|---|---|
| 0 | xong 2026-10-07 | `tools/README.md` có thứ tự chạy và bẫy; hướng bản đồ kiểm bằng `MapWindow.cs:577` |
| 1 | xong trên máy 2026-10-07, rev 20261007a | rules 35, ui 180, suite 75 đều đạt; còn kiểm trên Pages |
| chuẩn gốc W1-W5 | ghép 2026-10-07, rev 20261007b | rules 35, suite 73, sea 26, env 26, fishing 241, cargo 127, story 42 trên máy. `dredge-ui.js` + `ui-dev.html` bị xoá vì kiểm UI cũ |

## Đợt "chuẩn gốc" (2026-10-07, sau phản hồi chủ dự án)

Chủ dự án chơi bản pha 1 và chê: chưa có cảm giác rẽ sóng, lái chưa giống, thiếu VFX, câu cá và xếp cá chưa giống, môi trường chưa giống, không có cốt truyện, gameplay khác hẳn.
Nguyên nhân gốc: pha 1 chỉ bóc được số trong ScriptableObject và hình 3D; mọi thứ nằm trong prefab/scene (hạt, UI, material, hậu kỳ, Yarn) phải đoán.
Lever mới: `D:\dredge-ref\ripped\ExportedProject` (AssetRipper, YAML đọc được). Hợp đồng giao việc: `D:\dredge-ref\notes\DELEGATE.md`.

| Nhánh | Tệp | Kiểm |
|---|---|---|
| W1 biển, vệt rẽ sóng, cảm giác lái | `js/water.js`, `boat.js`, `camera.js`, `input.js`, `vfx.js` | `test/dredge-sea.js` |
| W2 môi trường (trời, sương, hậu kỳ, cây, hạt) | `js/sky.js`, `world.js`, `data/env.js` | `test/dredge-env.js` |
| W3 câu cá (HarvestMinigameView, VFX điểm câu) | `js/minigame.js`, `spots.js`, `css/minigame.css` | `test/dredge-fishing.js` |
| W4 khoang hàng | `js/cargo.js`, `grid.js`, `css/cargo.css` | `test/dredge-cargo.js` |
| W5 cốt truyện (VM Yarn từ `Dredge.asset`), bến, nhiệm vụ, intro | `js/yarn.js`, `dialogue.js`, `quests.js`, `intro.js`, `dock.js`, `docks.js`, `hud.js` | `test/dredge-story.js` |

`index.html`, `main.js`, `state.js`, `css/ui.css`, `data/games.js` do agent gốc giữ; nhánh chỉ sửa tối thiểu và khai báo.

## Việc mở sau pha 1

- Bến: `markers.json` chưa có trường mua bán của `MarketDestination` (`itemSubtypesBought`...) và tên điểm đến theo `m_KeyId`. `dock.js` đang nhận người buôn cá theo id có chữ `fishmonger`.
- Câu thoại nhân vật: lấy câu đầu trong bảng chữ, chưa chạy Yarn.
- `scene_config.json` có `Infinity`, engine thay khi đọc; `world.py` nên ghi số hữu hạn.
- Cao độ tiếng máy và quán tính quay là `[ĐỀ XUẤT]` (thuyền 3,6 m/s, 5,85 s một vòng).
- Đêm còn tối phẳng, nón đèn mờ.
