# Lumber Inc (bản web, không Unity)

Làm lại Lumber Inc (Seikami, `com.seikami.lumber.inc` bản 0.6.5) bằng three.js r160 và JavaScript thuần, không có bước build, theo cách đã làm My Mini Mart (`games/casual-farm`). Hiện có bản đồ 1: hướng dẫn tân thủ, chặt cây, bóc vỏ, xẻ hộp, bán qua xe tải, thuê thợ, nâng người chơi, nâng sao máy (đổi model máy), thanh nhiệm vụ, thùng rác, trạm xăng, thuê xe máy và UAV, đơn hàng đặc biệt, thợ siêu cấp. Thị trấn: kho xây dựng 30, công trường 88100, 23 lô nhà, cư dân cộng buff, nâng nhà 3 cấp, thợ xây. Map 2 và 3 đã xuất (`art/world2`, `art/world3`) nhưng chưa chơi được.

- Chạy: mở `index.html`. Bản lưu nằm ở `localStorage` khoá `lumber-inc-v1`.
- Nguồn: XAPK tải từ APKPure, bóc ở `D:\lumber-ref` (ngoài git). Unity 2022.3.62f2, IL2CPP ARMv7, metadata v31, Addressables 250 bundle ở `apk/base/assets/aa/Android`, bảng cấu hình TSV ở `apk/base/assets/config/*.txt`.
- Luật lấy từ mã gốc decompile bằng Ghidra (`D:\lumber-ref\udk-out\code\decomp\Assembly-CSharp\GameWish\Game\*.c`). Ghi chép luật kèm dòng nguồn ở `D:\lumber-ref\rules\`: `chop-carry.md` (trích dẫn trong code là CC), `economy.md` (EC), `workers-guide-camera.md` (WG), `map1-extra.md` (X: công trình phụ, model máy theo sao), `hometown.md` (thị trấn), `meta.md` (map 2-3, cửa hàng, skin, nhiệm vụ ngày, điểm danh, vòng quay, offline).
- Kiểm: `node test/lumber-inc-sim.js` (luật, không cần trình duyệt) và `node test/lumber-inc-play.js` (Playwright, mặc định chạy trên Pages; đặt `LI_URL=http://localhost:<port>/games/lumber-inc/index.html` để chạy bản máy).

## Bố cục

- `tools/` là các bộ xuất Python (py -3.12, UnityPy). Mọi bộ đọc `D:\lumber-ref` qua `tools/lm.py`.
  - `export_world.py world1` ghi `art/world1/` (cây node `scene.json`, `geo.glb`, texture). Thêm `--paths` để in đường đi của xe.
  - `export_chars.py`, `export_anim.py` ghi `art/chars/`, `art/props/`, `art/anim/` (clip, vai trò → clip ở `roles.json`).
  - `export_ui.py` ghi `art/ui/` (sprite, layout uGUI từng prefab ở `panels/*.json`, font, chữ tiếng Anh). `--print` in cây node.
  - `export_audio.py` ghi `art/sfx/` (30 clip mp3), `export_data.py` ghi `data/config.json` (61 bảng) và `data/lang-en.json`.
  - `stamp.js <rev>` gắn `?v=<rev>` cho mọi module trong import map của `index.html`. Chạy mỗi lần tăng `rev` trong `data/games.js`.
- `js/sim/` là luật chơi thuần, không dùng THREE, chạy được bằng node. Sim phát sự kiện vào `sim.events`, view đọc rồi xoá.
  - `world.js` dựng mô tả tĩnh từ `scene.json`: nhà (ô mở khoá, giá, nhà cần mua trước, vùng trigger), cây, khung nghiên cứu, va chạm.
  - `sim.js` giữ trạng thái: tiền, kim cương, exp, ô trả tiền, máy, kho, xe tải, sao nghiên cứu, lưu/nạp.
  - `forest.js` (cây đổ, rơi 2 khúc gỗ, mọc lại sau 60 s), `pack.js` (ba lô chứa nhiều loại), `move.js` (va chạm), `workers.js` (thợ chặt và thợ khuân), `missions.js` (29 nhiệm vụ của `MissionConf`), `guide.js` (chạy `guide.txt` + `guide_step.txt`: mũi tên, lời nhắc, máy quay, bàn tay), `extras.js` (thùng rác, xăng, xe máy, UAV, đơn hàng; thời gian chạy theo `state.clock`), `town.js` (kho xây dựng, công trường, lô nhà theo chuỗi `PreBookId`, cư dân và hệ số `ratio.income / speed / workers`).
- `js/view/` vẽ: `world.js` dựng cảnh, `game.js` (ô, cây, gỗ trên lưng, đống tiền, xe tải, thợ), `anim.js`, `ui.js` (uGUI → DOM), `hud.js`, `panels.js` (bảng thuê thợ, nâng người chơi, chọn máy khi lên sao, thuê xe máy / UAV, đơn hàng, thợ siêu cấp), `guide.js` (hai mũi tên `FarmGuideArrow`, bong bóng `GuideWordPanel`, ngón tay `GuideHandPanel`), `town.js` (nhà theo `HouseInfoConf`, nhà đang xây hiện dần từng mảnh, nút xây / nhận / nâng nhà), `sound.js`.
- `art/guide` (mũi tên hướng dẫn), `art/machines` (máy và nhà xe tải theo sao, `ResearchUpgradeConf.NewPrefab`), `art/houses1` (69 nhà của map 1, nạp sau khi vào game), `art/props` (gỗ, tiền, can xăng, xe máy) xuất bằng `export_world.py <id> --paths ...`.

## Luật đáng nhớ

- Ô mở khoá trả dần: mỗi bước 0,02 s trả `ceil(min(tiền, còn thiếu) * min(spd, 0,5))`, `spd` bắt đầu 0,01 và tăng 0,004 mỗi bước. Tiền đã trả giữ lại khi bước ra.
- Sao nghiên cứu (`ResearchUpgradeConf`, 4 sao mỗi máy): trả dần trên khung nghiên cứu y như ô mở khoá (`ResearchUpgadeRecorder.UpdateNeed`), tiền trả dở lưu ở `state.paid["r<id>"]`. Trả đủ thì bảng `UpgradeBuildingStarPanel` mở cho chọn máy: máy thường miễn phí, máy xịn (các cột `...Ad`, cộng `StarAddAd` exp) giá 10 kim cương hoặc một lần xem quảng cáo. Hub không có quảng cáo nên nút quảng cáo cho nhận ngay.
- Thu nhập trả lúc bỏ gỗ vào máy (10 một khúc ở máy bóc vỏ, 15 ở máy xẻ), không phải lúc máy làm xong. Xe tải trả 20 một món vào đống tiền của trạm. Đống tiền không có trần, bước vào là lấy hết.

## Bẫy đã sập

- `Box.contains` từng so cả trục y. Điểm của người chơi không có `y` nên phép so ra NaN và mọi trigger đều trượt. Giờ `Box.contains` bỏ qua `p.y`.
- Collider sàn nằm chung danh sách va chạm, làm người chơi kẹt ngay chỗ đứng. `describeWorld` bỏ collider có đỉnh thấp hơn 0,2 m.
- Va chạm phải lọc theo ma trận layer của Unity (hàng của layer 18 "Player", `PLAYER_HITS` trong `js/sim/world.js`). Không lọc thì trigger và vật trang trí cũng chặn đường.
- Khung ô mở khoá trong bản gốc vẽ bằng shader gizmo `SizableFrameLocked2`, không phải texture. `js/view/lowpoly.js` (`frameMaterial`) dựng lại nét đứt đó.
- Sprite uGUI phải vẽ trên một lớp con riêng (`el._skin` trong `js/view/ui.js`). Đặt 9-slice bằng CSS border lên chính node thì con của nó bị đẩy lệch đúng bề dày viền, còn alpha của màu tint thì làm mờ luôn cả con. Trong uGUI, alpha, viền và fill của Image chỉ chạm vào ảnh đó.
- Lệnh bash dạng heredoc nuốt dấu `\`. Đoạn code có `\n` hay regex thì viết bằng công cụ sửa file, đừng dán qua heredoc.
- Nhà trong thị trấn nằm dưới `activeRoot` của lô, xoay thêm 180° so với cột `Rotation`, và chỉ nhân `m_Scale` của lô. Cột `Scale` của `HouseInfoConf` không dùng ở đây. Nhân cả hai thì nhà to tràn ra khỏi hàng rào.
- Cư dân cộng buff theo cột `BuffType` của `ResidentInfoConf`, không theo `BuffDesc` của sách: sách 0 ghi "efficiency" nhưng cư dân của nó cộng doanh thu.
- Bộ chạy hướng dẫn chỉ xét `JumpTrigger` lúc bắt đầu một hướng dẫn, như bản gốc. Đừng xét cả lúc đang chạy: hướng dẫn 3 nhảy khi cổng rừng 10011 mở, nhưng các bước chặt cây của nó chạy sau khi cổng đã mở.
- `D:\lumber-ref\play.js` tách bước bằng `|`, nên đoạn `eval:` không được chứa `|` (kể cả trong regex hay `||`).
