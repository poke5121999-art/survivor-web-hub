# Food Gang: tự chơi thử như người chơi (vòng 2026-10-31, rev 20261031b → 20261031c)

Mục đích: chơi bản trên Pages như một người chơi thật, ghi lại chỗ khác bản gốc, sửa phần sửa được ở đúng module.
Công cụ: `test/food-gang-playtest.js` (Playwright, phím thật qua bàn phím, ngón tay thật qua CDP touch lên joystick và nút
trên màn hình). Ảnh nằm ở `shots/food-gang/playtest/<run>/`, số liệu ở `shots/food-gang/playtest/<run>/report.json`.

```sh
FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/index.html node test/food-gang-playtest.js
FG_NET=loop node test/food-gang-playtest.js            # bản trong cây, trận riêng qua BroadcastChannel
FG_PARTS=desktop,phone,portrait,party  FG_MATCHES=16  FG_NORMAL=4
```

"Người chơi" trong script nhìn màn như người: vị trí, máu, ai còn sống; đi về phía địch gần nhất, quay mặt, bấm đánh khi
cùng tầng, bấm chiêu khi hồi xong, leo kệ bằng cách đi ra mép kệ rồi nhảy (kệ là khối đặc, nhảy từ dưới lên bị chặn đầu).
Trận 1–4 chạy tốc độ thật, từ trận 5 nhanh 6 lần cho phần sự nghiệp dài (nút vẫn bấm thật, não chậm hơn nên hay thua hơn).

## 1. Các lượt đã chơi `[ĐO TRONG REPO]`

### 1.1 Pages, rev 20261031b (bản đang chạy), `shots/food-gang/playtest/pages/`

Hồ sơ mới → intro → trận hướng dẫn (5 bia, chơi bằng phím, 15 s) → gõ tên `Tâm Playtest 2026` (cắt còn 15 ký tự như
EditName) → 16 trận qua ghép trận → tủ lạnh → menu; mỗi 4 trận: Trophy Road (COLLECT), nâng skin, quà shop; lượt đầu thêm
VIP, Settings, bảng xếp hạng, Party Battle. Tải trang tới intro 1,96 s.

| # | kiểu (goal/đội) | map | kết quả | cúp | k/d | giây thật | fps | điều khiển |
|---|---|---|---|---|---|---|---|---|
| 1 | DM 2v2 | Kitchen | VICTORY | +5 | 10/2 | 103 | 59,9–60 | phím |
| 2 | LastSurvivor FFA | Pantry | VICTORY | +5 | 8/1 | 88 | 59,9–60 | phím |
| 3 | DM 2v2 | Pantry | VICTORY | +5 | 6/2 | 102 | 59,9–60 | phím |
| 4 | Kill5 FFA | Pantry | VICTORY | +5 | 5/3 | 87 | 59,9–60 | phím |
| 5 | Kill5 FFA | Kitchen | DEFEAT | +1 | 0/4 | 18 | x6 | phím |
| 6 | LastSurvivor FFA | Dining | DRAW | +2 | 2/3 | 30 | x6 | phím |
| 7 | DM FFA | Kitchen | DRAW | +3 | 4/4 | 27 | x6 | phím |
| 8 | KillBoss 1v3 | Pantry | DEFEAT | +1 | 0/1 | 22 | x6 | phím |
| 9 | LastSurvivor 2v2 | Dining | VICTORY | +5 | 1/0 | 25 | x6 | phím |
| 10 | LastSurvivor 2v2 | Kitchen | VICTORY | +5 | 1/0 | 19 | x6 | phím |
| 11 | Kill5 2v2 | Kitchen | VICTORY | +5 | 3/3 | 25 | x6 | phím |
| 12 | DM 2v2 | Kitchen | DEFEAT | +1 | 3/7 | 27 | x6 | phím |
| 13 | DM FFA | Kitchen | VICTORY | +5 | 6/4 | 28 | x6 | phím |
| 14 | KillBoss 1v3 | Dining | DEFEAT | +1 | 0/1 | 22 | x6 | phím |
| 15 | Kill5 2v2 | Kitchen | VICTORY | +5 | 2/1 | 21 | x6 | phím |
| 16 | LastSurvivor 2v2 | Pantry | VICTORY | +5 | 0/1 | 24 | x6 | phím |
| P1 | DM 2v2 | Kitchen | VICTORY | +5 | 14/2 | 103 | 59,9–60 | cảm ứng 844x390 |
| P2 | LastSurvivor 2v2 | Kitchen | VICTORY | +5 | 3/1 | 48 | 59,9–60 | cảm ứng 844x390 |

Kết thúc: 59 cúp, league III (qua league II ở trận 4), skin BRO cấp 1 → 5, 6 772 tiếng đã phát, không thiếu tiếng nào,
không lỗi console. Điện thoại dọc 390x844: hiện "Rotate your device". Trận riêng hai trang: **hỏng** (mục 2, lỗi 1).

### 1.2 Bản trong cây, rev 20261031c, `shots/food-gang/playtest/local/`

Cùng kịch bản, `FG_NET=loop FG_MATCHES=6 FG_NORMAL=2`: hướng dẫn 11 s bằng phím, tên gõ đúng, 6 trận máy tính (DM 2v2 ở
Kitchen và Pantry tốc độ thật 102 s, 59,8–60 fps; rồi DM 2v2, Kill5 FFA ở Dining, LastSurvivor FFA, KillBoss 1v3 ở Dining
x6), 23 cúp → league II, skin BRO 1 → 3, 3 015 tiếng, không lỗi console. Điện thoại ngang: hướng dẫn + 2 trận DM 2v2 bằng
joystick và nút trên màn (102 s mỗi trận, 59,9–60 fps). Dọc: gợi ý xoay máy.

Trận riêng hai trang qua menu thật (tạo phòng, gõ mã chữ thường vào ô Join, Battle!): 3 lần chạy, mỗi lần 2 vòng. Cả hai trang
vào trận với 2 người + 2 bot, màn kết quả không cúp/sao (phòng bạn bè), ~4 s sau cả hai về lại sảnh cùng mã phòng, chủ phòng
bấm Battle! lần nữa là vòng 2 chạy (`shots/food-gang/playtest/local/hostA_*`, `guestB_*`, `local-party/`).

Ngôn ngữ: menu + Settings + Shop + Trophy Road ở Ả Rập, Nga, Nhật, Thổ (`shots/food-gang/playtest/lang/`).

So với clip (skill parity-compare) cho 3 map sau khi đổi shader: `shots/food-gang/parity-c/compare/*.png`, cổng `check`
thoát 0 với 3 `ok`, 3 `version`, 1 `web-bug` (viền kem đĩa, mục 3.2). Ảnh web là bản trong cây (rev c chưa lên Pages).

## 2. Lỗi tìm thấy

Thứ tự theo mức người chơi thấy. "Đã sửa" = sửa trong cây ở rev 20261031c, chưa lên Pages (chủ dự án commit + deploy).

| # | Lỗi | Ảnh | Trạng thái | Gốc rễ / cách sửa |
|---|---|---|---|---|
| 1 | Party Battle: khách gõ đúng mã phòng chủ phòng thấy mà nút Join vẫn xám, không vào được | `pages/guestB_lobby_guest.png` | Đã sửa | Mã là mã Unity Lobby 6 ký tự, màn Join đòi đúng 4 như mã Photon của bản gốc. `Private.js` `CODE_LEN = 6`, ô nhập giới hạn 6 `[ĐỀ XUẤT]` (gốc 4 ký tự, Lobby không cho mã 4). Kiểm: `food-gang-meta-ui` (gõ 6 ký tự thì Join sáng), `food-gang-playtest` phần party |
| 2 | Party Battle: khách không bao giờ "sẵn sàng", nên bấm Battle! của chủ phòng không bắt đầu trận khi chơi bằng menu (chỉ trang dev tự bấm sẵn sàng hộ) | (lộ ra sau khi sửa lỗi 1) | Đã sửa | Gốc chỉ chủ phòng Launch (`FriendRoomLaunch`). `PrivateLobbyScreen` cho khách `setReady(true)` khi sảnh mở; khách còn ở màn kết quả thì chưa sẵn sàng nên Battle! đợi |
| 3 | Party Battle: hết trận mọi người về menu, phòng bỏ ngỏ (relay còn mở), không quay lại sảnh | — | Đã sửa | Gốc `GameOver.ContinueFriendRoom` → `StartRejoin(code)` → sảnh cùng phòng. `online.js` `Session.backToLobby()` (host: bỏ ghế người đã rời, mở khoá phòng, còn gửi ảnh cuối tới `LINGER`; khách: về `lobby`), `app.privateMatch` mở lại sảnh qua menu, `GameOverScreen` ở phòng bạn bè: không cúp/sao/tủ lạnh, chạm hoặc 3,2 s là spinner rồi sảnh. Kiểm: `food-gang-net` A/rematch (6 check), playtest party 2 vòng |
| 4 | Đổi nhân vật trong sảnh trận riêng không tới người khác, trận sau vẫn đánh nhân vật cũ | — | Đã sửa | `Session.setProfile` → tin `me` cho host (như thuộc tính `sk` Photon). Kiểm: `food-gang-net` A/rematch |
| 5 | Settings: logo Discord văng ra ngoài nút bên phải, bị cắt chữ "Disc" (mọi ngôn ngữ) | `pages/desk_meta1_SceneSettings.png` | Đã sửa | `HorizontalLayoutGroup` kẹp phần dư âm về 0 nên nội dung rộng hơn nhóm bị đẩy sang phải. Theo Unity: con được điều khiển cỡ thì co từ preferred về min, con không điều khiển thì phần dư âm vẫn chia theo căn lề (`ui.js`). Kiểm: `food-gang-ui-engine` |
| 6 | Chồng đĩa phòng ăn là khối nâu phẳng | `D:\foodgang-ref\scratch-web\parity\compare\dining.png` | Sửa một phần | Shader `ToonRampUnlit` của rip là bản giả; bóc chương trình GLES3 thật trong APK (`data.unity3d`, Shader path id 6, UnityPy + lz4): `_LightDirection` là vector thô, độ sáng liên tục `(1-(N·L·ramp+1)/2)·(màu đỉnh r + _ShadowIntensity)·tex·_Color·_LightColor·_LightIntensity`. `render.js` dùng đúng công thức; đĩa giờ từng chiếc có bóng, mép tối giữa hai đĩa. Viền kem trên mép đĩa vẫn chưa ra (mục 3). Kiểm: `food-gang-render` (độ lệch sáng trong chồng đĩa > 6) |
| 7 | Bục VICTORY: không có sao lấp lánh của halo | `shots/food-gang/ui/06_podium.png` (sau sửa) | Đã sửa | ParticleSystem dưới canvas camera bị bỏ ở cả lượt thế giới lẫn lượt UI. `ui.drawParticles` vẽ trong lượt canvas; `scalingMode Local` bỏ scale cha (halo x100), nhân pixel/đơn vị của camera canvas. Kiểm: `food-gang-meta-ui` (`uiParticles >= 5`) |
| 8 | Chữ Ả Rập, Nhật, Hàn, Trung (glyph dự phòng) không có viền đen như chữ Latin: tiêu đề trắng trơn trên nền vàng | `playtest/lang/Arabic_SceneSettings.png` (trước/sau) | Đã sửa | Viền tiêu đề Tobi là underlay giãn (`_UnderlayDilate` 1), không phải outline; bản dự phòng chỉ vẽ 1 bản lệch. `drawFallbackQuads` vẽ thêm 8 bản quanh độ giãn |
| 9 | Nga: "Политика конфиденциальности" bị chặt giữa từ thành 3 dòng tràn nút | `playtest/lang/Russian_SceneSettings.png` | Đã sửa | TMP auto size thu chữ trước khi cắt một từ dài hơn dòng; `text.js` coi bố cục phải cắt từ là "không vừa". Kiểm: `food-gang-ui-engine` (2 dòng) |
| 10 | Màn Join không có số phiên bản (góc phải chỉ "Version") | `pages/guestB_lobby_guest.png` | Đã sửa | `VersionDisplay` của `ScenePrivateJoin` chưa gán như màn Party Battle |
| 11 | Ghép trận: ảnh khung đầu "Searching opponents..." gần như đen | `pages/desk_m01_searching.png` | Không sửa | Là lúc mờ dần từ menu sang bảng VS (SceneSystem.StartFadeInOut); 0,4 s sau bảng hiện đủ (`desk_m01_versus.png`) |
| 12 | Tên ở TutoEnd đang sửa là thẻ `<input>` chữ trắng không viền, khác chữ TMP | `pages/desk_02b_name_editing.png` | Không sửa | Cần `<input>` thật để bàn phím điện thoại bật; chữ TMP quay lại ngay khi Enter. Ô một dòng, chọn hết khi focus, tự focus khi mở là đúng `EditName` gốc (`m_LineType` 0, `m_OnFocusSelectAll` 1, `m_autoFocus` 1) |
| 13 | Trận riêng vòng 1: chủ phòng VICTORY, khách DRAW | `local-party/` lượt 1 | Không phải lỗi; có gia cố | Chế độ FFA: hạng 2–3 là `Victory.Draw` theo luật gốc (`applyMatchResult`). Gia cố: `MatchScene.gameOver` lấy đội/slot thắng từ sự kiện `GameOverTriggered`, không từ state, vì khách phát lại ảnh chậm ~100 ms. Playtest kiểm "hai trang cùng hòa / không hòa" ở chế độ đội |

Ngôn ngữ `[ĐO TRONG REPO]`: bản gốc có đúng 13 ngôn ngữ (`D:\foodgang-ref\export\text`: English, French, German, Italian,
Spanish, Portuguese, Russian, Turkish, Arabic, Japanese, Korean, ChineseSimplified, ChineseTraditional), **không có tiếng
Thái**, nên không có gì để kiểm bố cục Thái. Đã chụp menu + Settings + Shop + Trophy Road ở Ả Rập, Nga, Nhật, Thổ
(`shots/food-gang/playtest/lang/`): không thấy ô vuông (tofu). Ả Rập nối chữ và đi phải sang trái đúng thứ tự
("الوصول إلى 50 كأس لفتح المهمة"). "Party" không dịch ở mọi ngôn ngữ là đúng file chữ gốc.

## 3. Còn khác bản gốc, xếp theo mức người chơi thấy `[ĐỀ XUẤT]`

1. Trận riêng chưa chạy thử qua Relay thật sau khi sửa (lượt local đi qua BroadcastChannel). Sau khi deploy: chạy
   `FG_URL=<Pages> FG_PARTS=party node test/food-gang-playtest.js`.
2. Viền kem từng đĩa ở phòng ăn: shader thật cho mặt trên đĩa 1,75x (kem chói) nhưng với camera ngang tầm (`r` 0, không lens
   shift, đã kiểm SceneGame và `CinemachineGroupManager`) mặt trên các đĩa cao hơn mắt bị che. Clip lại thấy viền ở cả đĩa
   trên cao, và clip còn có chai rượu, ly, ấm, giá dao không có trong rip 2.2.4: nhiều khả năng clip là bản game cũ.
   Khăn bàn và rèm phòng ăn sáng hơn clip 7–14 % với shader thật (exposure +0,5 cũ được chỉnh theo shader giả); chưa chỉnh lại
   exposure vì Kitchen/Pantry vẫn khớp.
3. Chữ dự phòng (Ả Rập, CJK, một số chữ Nga như Ф Э Р) đậm nhạt khác glyph SDF trong cùng một từ; RTLTMPro gốc còn đổi số
   sang chữ số Ả Rập-Ấn và lật căn lề, bản web giữ căn lề của scene.
4. Bàn tay khi chơi điện thoại: joystick nổi đúng gốc, nhưng chưa thử trên máy thật (chỉ CDP touch trong Chromium).
5. Shop: gói kim cương ưu đãi hiện giá "100" không đơn vị (giá IAP giả trong scene, đã ghi `[ĐỀ XUẤT]` ở tools/README).

## 4. Bộ kiểm

Chạy ở bản trong cây (rev 20261031c), 2026-10-31 `[ĐO TRONG REPO]`:

| Bộ | Kết quả | Kiểm mới |
|---|---|---|
| `node test/food-gang-sim.js` | 117/117 kịch bản, 268 685 tick khớp từng bit | — |
| `node test/food-gang-meta.js` | 189 196 assert, 0 lỗi | — |
| `node test/food-gang-render.js` | 28/28 | chồng đĩa Dining có bóng từng đĩa |
| `node test/food-gang-ui-engine.js` | 36/36 | chữ Nga nút Privacy 2 dòng; logo Discord giữa nút |
| `node test/food-gang-play.js` | 347/347 | — |
| `node test/food-gang-meta-ui.js` | 66/66 | sao lấp lánh bục VICTORY; mã phòng 6 ký tự làm sáng Join |
| `node test/food-gang-ui-tour.js` | 9 ảnh, 0 lỗi | — |
| `node test/food-gang-net.js` | 145/145 (A loopback + B Relay thật) | A/rematch: về sảnh, chờ Battle!, đổi nhân vật trong sảnh, vòng 2 |
| `node test/food-gang-playtest.js` | Pages rev b: 10/13 (3 lỗi trận riêng); local rev c: 20/20, party 13/13 | mới |

Sau khi deploy rev c: chạy lại `FG_URL=<Pages> node test/food-gang-playtest.js` (trận riêng qua Relay thật lần đầu) và
`FG_URL=<Pages>/net.html node test/food-gang-net.js --browser`.
