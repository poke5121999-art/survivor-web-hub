# Hố Xanh

Dựng lại vòng lặn xiên cá ở Hố Xanh của Dave the Diver. Hình Dave, cá Spine, bản đồ 3D, san hô đặt tay, số liệu ánh sáng, hiệu ứng và tiếng đều lấy từ bản gốc (xem `tools/README.md`).

Một lượt lặn là một trục dọc liền mạch ghép từ các tầng của bản gốc: vùng nông A (0–50 m), tầng giữa B (50–130 m), vực sâu C (130–250 m). Tầng dưới chỉ ghép được khi khớp miệng nối với tầng trên, giống cách bản gốc đổi bản đồ mỗi ngày. Mỗi lượt đổi sang một chủ đề khác lượt trước: ban ngày, rừng tảo (A06), chiều tà, trời mưa, lặn đêm (chỉ tới tầng giữa, có đèn đội đầu).

Lên tới mặt nước hoặc bơi lên vào khoang cứu hộ là mang cả túi cá về. Cạn dưỡng khí là ngất, chỉ giữ được một con.

Mỗi lượt lặn nằm trong một ngày trọn vòng:
1. Sắm đồ trên app iDiver: nâng trang bị, mua và chọn một khẩu súng phụ, nâng cấp quán.
2. Lái cano Nodens 68 từ nhà hàng sushi nổi ra Hố Xanh, rồi nhảy xuống nước.
3. Lặn.
4. Lái cano về quán.
5. Chọn món từ tủ cá. Bancho nấu, Dave bưng món và rót trà cho khách.
6. Cộng sổ cuối ca, sang ngày mới.

Mọi hình, hoạt ảnh, UI, VFX và tiếng của cano, quán và cửa hàng đều bóc từ bản gốc (`tools/README-boat.md`, `tools/README-bar.md`). Chỗ bản gốc không có thì bỏ trống, không vẽ bù.

## Điều khiển

| Việc | Bàn phím + chuột | Cảm ứng (ngang máy) |
|---|---|---|
| Bơi 8 hướng | WASD hoặc mũi tên | kéo nửa trái màn hình |
| Tăng tốc (đốt khí nhanh hơn) | Shift | giữ nút **Tăng tốc** |
| Lướt ngắn | Space | nút **Lướt** |
| Ngắm / bắn xiên | giữ chuột trái để ngắm, thả để bắn | giữ nửa phải để ngắm, thả để bắn |
| Giằng co với cá lớn | bấm liên tục chuột trái hoặc Space | chạm liên tục |
| Dao | F | nút **Dao** |
| Súng phụ | giữ chuột phải để ngắm, thả để bắn | giữ nút **Súng** (tự nhắm cá gần nhất), thả để bắn |
| Lái cano | W/↑ ga, S/↓ phanh rồi lùi, A/D hoặc ←/→ bẻ lái | giữ nút **Ga** / **Phanh**, kéo nửa trái để bẻ lái. Không chạm 2,2 giây thì cano tự chạy |
| Trong quán | A/D hoặc ←/→ đi; E, Space, Enter bưng món ở quầy hoặc phục vụ khách gần nhất; Q bỏ đĩa cũ nhất. Rót trà: giữ rồi thả khi vòng gần đầy | chạm sàn để đi, chạm món trong hàng chờ để lấy, chạm khách để phục vụ |
| Tạm dừng / tắt tiếng | P hoặc Esc / M | nút ‖ / nút loa |

Hòm dưỡng khí tự mở khi chạm vào. Khoang cứu hộ: tới sát rồi bơi lên.

Tham số URL:
- `?theme=night` (day, kelp, evening, rain, night) ép chủ đề; `?map=A03` ép tầng trên cùng; `?route=A03,B04,C03` ép cả lộ trình.
- `?fresh=1` xoá sổ lưu rồi tự gỡ khỏi địa chỉ.
- `?phase=prep|boat|kitchen|bar` vào thẳng một pha trên bờ, bỏ qua màn đầu. `boat` nhận thêm `&dir=home`. Bếp và quán mà tủ trống thì bỏ sẵn 3 cá hề, 1 cá mú chấm, 1 cá bò titan vào tủ (ghi vào sổ thật).

## Tệp

| Tệp | Làm gì |
|---|---|
| `index.html` | Khung trang, CSS chung, HUD bằng DOM, `#stage2d` và `#screens` cho pha trên bờ. Mọi `<script>`/`<link>`/ảnh gắn `?v=<rev>` |
| `data/tuning.js` | Mọi con số của lượt lặn, nhãn `[DtD]` (bản gốc) hoặc `[ĐỀ XUẤT]` (tự chọn) |
| `data/meta.js` | `HX_META`: bảng nâng cấp `GEAR` (O₂, túi cá, đồ lặn, dao, súng xiên) và `GUNS` (sáu khẩu gốc) lấy số `[DtD]` từ `gear_sheet.js`; `BAR` (ghế, đầu bếp, trang trí, trà) `[ĐỀ XUẤT]`; giá món gốc. Hàm thuần `stat / level / nextCost / buy / buyGun / equipGun / gunStat / loadout / dishOf / servingsOf`. Phải nạp sau `gear_sheet.js` |
| `data/gear_sheet.js`, `data/bar_assets.js`, `data/boat_assets.js` | Sinh bởi `tools/rip_boat.py` và `tools/rip_bar.py`: số trang bị và súng gốc; toàn bộ art, clip, bố cục UI, công thức hạt của quán và cano |
| `js/save.js` | `HX.save`: sổ lưu `hx.save.v1` trong localStorage. `load / get / commit(fn) / wipe / parse` |
| `js/prep.js` | Pha `prep`: app iDiver gốc, ba thẻ Trang bị / Súng / Quán, popup lên cấp gốc |
| `js/boat.js` | Pha `boat` (`surface: 'scene'`): cảnh biển sảnh gốc, cano lái được, clip Diveready / Respawn của Dave, hạt vệt sóng chạy từ công thức gốc, tiếng máy theo tốc độ |
| `js/bar.js` | Pha `kitchen`, `bar`, `ledger`: phòng quán 9 lớp, khách, Bancho nấu, Dave bưng món, rót trà, trả tiền, sổ cuối ca |
| `js/gun.js` | Súng phụ trong lượt lặn: ngắm, đạn, chùm đạn, xuyên, lưới, đạn ngủ, lựu đạn nổ vùng |
| `css/prep.css`, `css/boat.css`, `css/bar.css` | Kiểu riêng của từng pha trên bờ |
| `data/zones.js` | Sinh bởi `tools/level.py`: 16 tầng, mỗi tầng vách va chạm, hòm O₂, khoang cứu hộ, rong Spine, mã miệng nối và số liệu ánh sáng gốc |
| `js/dive.js` | Bảng chủ đề, ghép lộ trình theo miệng nối, xếp chồng các tầng, độ sâu hiển thị, ánh sáng theo độ cao |
| `js/world.js` | Va chạm 2D trên đa giác vách gốc của mọi tầng đã xếp chồng: trong/ngoài, trượt theo vách, tia xiên |
| `js/gfx.js` | Vẽ ở độ phân giải thật có khử răng cưa; bộ đổ màu nước (sương, ánh sáng, đèn đội đầu) dùng chung cho đá, sprite, Spine; lớp chỉnh màu cuối theo Volume gốc |
| `js/level.js` | Nạp glb từng tầng, gán vật liệu theo vai (đá, san hô, hải quỳ, rong…), rong Spine, vệt nắng, bụi, mặt nước, hòm O₂, khoang cứu hộ |
| `js/dave.js` | Sprite Dave + lớp tay súng, máy trạng thái người lặn |
| `js/harpoon.js` | Mũi xiên và dây |
| `js/fish.js` | Nạp Spine, máy trạng thái cá, bộ sinh cá quanh camera, ảnh nhỏ cho thẻ bắt cá |
| `js/fx.js` | Hạt hiệu ứng theo bảng `KINDS`, và phát lại công thức hạt gốc của súng |
| `js/hud.js`, `js/audio.js` | DOM phủ trên cảnh; Web Audio |
| `js/main.js` | Sổ pha và `go()`, dựng lượt lặn theo trang bị, nhập liệu, camera, ánh sáng mỗi khung, móc `window.HX_DEBUG` cho bộ kiểm |
| `tools/route-check.js` | Loang từ chỗ xuống nước qua mọi lộ trình hợp lệ, xác nhận bơi được tới tầng cuối |

## Máy trạng thái

- Pha: `title → prep → boat(out) → loading → dive → result → boat(home) → kitchen → bar → ledger → prep …`
  - Màn đầu: sổ còn cá chưa bán (`stage: 'bar'`) thì "Tiếp tục" vào thẳng `kitchen`, không thì `prep`.
  - Tầng trên cùng nạp trước; các tầng dưới nạp ngầm trong lúc lặn. Rời mặt nước (sang pha không phải `3d`, hoặc về màn đầu) thì dỡ lượt lặn.
- Sổ pha (`js/main.js`): mỗi pha `{ surface, enter(args), exit(), update(dt), render() }`, chỉ `surface` bắt buộc.
  - `surface: '3d'` vẽ cảnh three.js; `'dom'` vẽ cảnh nước trống làm nền, pha dựng giao diện trong `G.screen(tên)`; `'2d'` hiện `#stage2d`, bỏ vẽ cảnh 3D, pha tự vẽ trong `render()` lên `G.stage2d.ctx`; `'scene'` để pha tự dựng cảnh three.js riêng và tự vẽ bằng `G.gfx.renderer` (cano).
  - `G.go(tên, args)`: gọi `exit()` pha cũ, đặt `G.phase` và `body[data-phase]`, `body[data-surface]`, hiện đúng `#scr-<tên>`, gọi `enter(args)`.
  - Pha mới đăng ký bằng `HX.phases.<tên> = {...}` trong tệp riêng, nạp trước `main.js`.
- Sổ lưu `hx.save.v1`: `{ v, day, stage, gold, gear{o2,cargo,suit,knife,harpoon}, guns{owned:[id],equipped}, fridge{<cá>:số}, bar{seats,chef,decor,tea}, dex{<cá>:1}, stats{served,earned} }`.
  - Đọc vào là chuẩn hoá từng khoá; giá trị lạ về mặc định. Muốn đổi phải qua `HX.save.commit(fn)`.
  - Hết lượt lặn (lên bờ, vào khoang, ngất) là cá giữ được vào `fridge` và `dex`, `stage: 'bar'`, ghi một lần mỗi lượt.
  - Sổ cuối ngày (`ledger`) cộng vàng, bỏ cá đã bán khỏi tủ, `day + 1`, `stage: 'prep'`, cũng chỉ một lần. Tải lại giữa lúc bán thì tủ còn nguyên.
- Trang bị đọc một lần lúc dựng lượt lặn vào `G.loadout` (`HX_META.loadout(save)`). Mọi tệp lặn đọc từ đó; `o2.max`, `knife.damage`, `harpoon.damage` trong `tuning.js` không còn dùng.
  - Túi đếm số con, không đếm ký. Bản gốc tính túi theo kg (9 → 185) nhưng bảng cá không có cân nặng. Túi đầy thì cá hạ được vẫn tan đi khi tới tay, báo "Túi đầy".
  - Quá độ sâu an toàn của đồ lặn thì dưỡng khí tụt ×2,5 và HUD báo, tính một chỗ trong `dave.js`. Đồ lặn cấp 0 gốc chỉ tới 40 m; cấp 1 giá 0 vàng.
- Dave: `enter | swim | dash | aim | shoot | reel | tug | melee | gunAim | gunFire | hurt | surfaced | dead`. Tăng tốc là cờ của `swim`.
- Xiên: `ready → flying → (stuck | returning) → ready`.
- Cá: `wander | flee | chase | defend | sleep | hooked | dying | reeled`. Cá nóc dùng `defend` (phồng gai). `sleep` do súng ngủ.
- Quán: khách `vào → ngồi (xem thực đơn) → gọi món hoặc trà → chờ (cạn kiên nhẫn thì giận, bỏ về) → ăn → trả tiền → ra`. Bancho nấu lần lượt từng đĩa. Dave bưng tối đa 3 đĩa.
  - Cá ra món: số suất = `2 + floor(cm / 20)`, tối đa 10, rồi chia cho số phần cá công thức gốc cần (cá nóc sao 2, da cá nóc gai 3, còn lại 1). Sổ cuối ca bỏ khỏi tủ `ceil(suất đã bán / suất mỗi con)` con.

## Đo mới biết [ĐO TRONG REPO, 2026-09-24]

- **Ảnh Spine của mọi loài cá quay đầu về +x.** Cá bơi sang phải thì `scale.x = +1`.
  - Bản đầu ghi ngược (−x) và cả đàn bơi giật lùi trên Pages. Chủ dự án thấy ngay: "cá đang moon walk".
  - Kiểm bằng mắt, đừng suy: xếp cả 65 loài đứng yên với `facing = 1` rồi chụp. Ở cá hồng đen trắng và cá mó đầu gù, đuôi chẻ nằm bên phải.
  - Prefab gốc không có cờ lật nào: `SkeletonMecanim.initialFlipX = 0` ở mọi loài đã xem.
- **Đá glb nhô ra trước mặt phẳng chơi z=0 từ 2 tới 10 m** (trung vị 4,5 m), đo bằng tia bắn dọc −z trên các điểm nằm trong đa giác vách.
  - Camera phải lùi ≥ 12 m, nếu không đá tiền cảnh phình to che nửa màn hình.
  - Vẫn còn chỗ đá che Dave. Mảnh đá có z > 0,8 được lưới điểm thưa dần quanh Dave (`view.cutRadius`).
- **Mép trên `cameraBound` của các bản đồ A là y=19.** Vách hai bên cao tới y≈29. Mặt nước đặt ở y=20,5 `[ĐỀ XUẤT]`.
- **Đáy các bản đồ A để hở ở y≈−36, và đó là lối xuống tầng giữa.** Bản trước chặn cứng Dave ở đáy, nhìn xuống chỉ thấy khoảng trống, trông như lỗi.
  - Mỗi tầng là một cảnh riêng có toạ độ riêng (A y −36..29, B −70..29, C −108..27). Game đặt tầng dưới sao cho mép y=19 của nó chạm đáy tầng trên (`dive.entryY`).
  - `tools/route-check.js` xác nhận cả 17 lộ trình hợp lệ đều bơi được tới đáy tầng cuối (ngày: y≈−245; đêm: y≈−124).
- **Tên cảnh mã hoá miệng nối: `<map>_<trên>_<dưới>`.** `A03_01_02` có đáy kiểu 02, nên chỉ ghép được với B có miệng trên 02 (B03, B04, B06).
- **Mọi cảnh gốc tắt `multiFog`.** Sương chỉ có một màu, nội suy theo độ cao y. Các màu mid/far là giá trị mặc định, dùng vào là sai màu.
- **URP gốc chiếu sáng, trộn sương và chỉnh màu trên màu tuyến tính.** Ảnh và màu trong dữ liệu lưu dạng gamma.
  - Làm thẳng trên màu gamma thì ánh sáng môi trường 0,78 tối đi 22% thay vì ~11%.
  - Vực sâu có phơi sáng −0,9 và tương phản 25. Chỉnh quanh 0,5 trên màu gamma thì cả màn đen kịt. URP chỉnh quanh xám 18% tuyến tính.
- **Vực sâu gốc sáng nhờ hàng chục đèn điểm đặt trong cảnh** (cường độ 10–20, y≈−55..−95), không rút được. Game bù bằng nền sáng tối thiểu `dive.ambientFloor` và đèn đội đầu.
- **Đèn đội đầu phải tính như đèn 2D trên mặt màn hình.** Vách sau lưng Dave lùi 5–10 m theo z. Tính khoảng cách 3D thì chùm đèn chiếu trượt qua, đá quanh Dave vẫn tối.
- **gltfpack lượng tử hoá uv và ghi phép co giãn vào `KHR_texture_transform`.** GLTFLoader để nó trong `map.matrix`. Shader tự viết mà quên nhân ma trận này thì đá mất hết vân, chỉ còn một màu.
- **Thân Dave trong prefab `PlayerGroup` gốc phóng ×2** (`CharacterBody`, cả mũi xiên). Mỗi loài cá cũng có độ phóng riêng trong prefab, từ ×0,6 (cá da trơn sọc) tới ×2,5 (sứa hộp, sứa lược). `rip.py` ghi chúng vào `assets.js` (`dave.scale`, `fish[].scale`).
  - Bản trước vẽ mọi thứ ×1. Dave chỉ còn một nửa, chủ dự án nhận xét "player nhìn bé xíu". Camera 18,5 m vốn đúng; thiếu là thiếu độ phóng.
  - Va chạm gốc của Dave là `CapsuleCollider2D` 0,5 × 1 m, nên bán kính va chạm là 0,25 m.
- **`CinemachineConfiner` gốc với camera phối cảnh chỉ giữ tâm camera trong `CameraBound`** (x ±55, y ≤ 19), không giữ mép khung nhìn.
  - Bản trước giữ cả mép, nên camera dừng ở x = −43,7. Chỗ thả gốc của mọi map vùng nông là `StartPoint` (−57; 25), nên vừa vào lượt Dave đã nằm ngoài màn hình.
  - Bộ kiểm có bài "vừa xuống nước đã thấy Dave trong khung hình". Chạy trên bản lỗi thì bài này báo Dave ở x = −121 px.
- **Khoang cứu hộ kích hoạt khi chạm thì hay kết thúc lượt ngoài ý muốn.** Lúc thử bơi xuống, Dave lướt qua một khoang ở 99 m và lượt lặn kết thúc. Giờ phải bơi lên vào khoang.
- **Hòm dưỡng khí của A06 lơ lửng** 0,8 m và 1,4 m trên đá. Game hạ hòm xuống mặt đá gần nhất bên dưới trong vòng 3 m.
- **Hàng `Cheer` (hàng 6) trong sheet Dave là Dave mặc đồ trên bờ**, không phải đồ lặn. Lúc trồi lên dùng `Relief` rồi `Idle`.
- **Trường `icon` của cả 55 loài cá đều là null.** Thẻ bắt cá tự vẽ ảnh nhỏ từ khung đầu của hoạt ảnh bơi.
- Ô `HookAttackArm` đặt chung gốc với ô thân `HookAttackReady` là khớp vai. Đầu nòng cách khớp vai (0,14; −0,06) m.
- Nhiều ảnh san hô gốc là trắng xám; bản gốc tô bằng `SpriteRenderer.color`. `level.py` ghi màu đó vào màu đỉnh của atlas san hô.

### Cano, súng, quán, cửa hàng

- **`rip.py` căn giữa mọi khung Dave đã cắt, nên lớp tay lệch khỏi thân.** Súng phụ đặt tay và thân theo độ lệch sprite gốc (AttackReady +6, −5 px; AttackFire +6, +1; AttackPull +11, −1).
  - Tay súng xiên cũ vẫn lệch khoảng 23 px sang trái và 17 px xuống dưới, nên xiên nằm ngang bụng thay vì ngang vai. Chưa sửa, vì sửa thì phải dời luôn đầu nòng `harpoon.gunTip`.
- **Trong prefab `LobbyBoat_Day`, cụm VFX của cano nằm ở (0; 0,24; −0,92), phóng 0,82.** Vị trí hạt trong manifest chỉ khớp thân cano sau khi cộng độ lệch này.
  - Cụm mây "Lobby Clouds" nằm ở (−34,16; 15,92; 180,89). Khoá trôi của mây tính tương đối với nó.
  - GLTFLoader đổi dấu cách trong tên node thành `_`: "Cloud001 (1)" thành "Cloud001_(1)".
- **Hạt cộng sáng của Unity phải nhân đôi màu** (như shader Additive/Alpha Blended cũ). Không nhân thì vệt sóng sau cano gần như vô hình.
- **Lớp khói nấu của Bancho dùng shader cuộn ảnh trong mặt nạ, mà bản bóc chỉ có mặt nạ.** Vẽ riêng mặt nạ ra một khối trắng đặc che Bancho. Giờ bỏ qua mọi lớp hạt cần dữ liệu chưa bóc (hạt dạng mesh, shader flow/mask).
- **Lớp `_light` của phòng quán cần nền đục.** Chỗ trong suốt mà cộng sáng thì loá lên như đèn.
- **Hạt cộng sáng vẽ trên canvas riêng phủ DOM cần `mix-blend-mode: plus-lighter` hoặc `screen`.** Không có thì hạt thành ô vuông đen.
- **9-slice có phần giữa rộng 0 px (như `NameBubble00`) ra rỗng với CSS `border-image`.** Chừa phần giữa 1 px.
- **`index.html` có lớp `.bar` chung cao 12 px.** Đặt tên lớp trùng là bị ép dẹt mà không báo gì.
- **`String.replace` hiểu `$$` trong chuỗi thay thế là một `$`.** Vá bài kiểm có gọi `page.$$` bằng `replace` thì lời gọi hỏng im lặng.

## Chọn khác bản gốc [ĐỀ XUẤT]

- Camera theo bản gốc: phối cảnh 38°, lùi 18,5 m (`CinemachineFramingTransposer.m_CameraDistance`), khung nhìn cao ~12,7 m. Màn thấp (điện thoại ngang) kéo lại còn 12,5 m cho Dave khỏi bé.
- Camera nhìn trước theo vận tốc 0,45 giây; bản gốc tắt lookahead. Bơi xuống thì thấy trước chỗ sắp tới.
- Ánh sáng đá nhân thêm 1,4 lần (`dive.lightGain`), loá sáng lấy mẫu mipmap thay cho chuỗi làm mờ của URP. Cả hai chỉnh bằng mắt, đặt cạnh ảnh chụp Steam.
- Lặn đêm mượn bộ màu Evening như cảnh gốc, rồi tối thêm (`dim` 0,55) và luôn bật đèn đội đầu.
- Dave chết thì giữ con cá hạng cao nhất. Bản gốc cho người chơi tự chọn một món.
- **Kinh tế.** Giá món giữ nguyên bản gốc (2–220 vàng). Để nâng cấp đầu tiên mua được ngay ngày 1–2, số suất mỗi con cá, ca bán 180 giây và nhịp khách (5 giây một khách, chia cho mức trang trí) được chỉnh bằng `test/ho-xanh-bar-sim.js`. Chạy 14 ngày ra trung bình 381 vàng/ngày, trung vị 364.
- **Ghế.** Mở dần 3 → 5 → 7 → 9 → 12 → 15 ghế (bản gốc có 15 ghế).
- **Cano.** Tốc độ tối đa ~10 m/s lấy từ đoạn nhanh nhất của clip `Boat_Exit001`. Lực đẩy, phanh, bẻ lái, độ nghiêng là số tự chọn. Cả hai chuyến đều chạy mũi sang trái để camera luôn thấy mặt có chữ "Nodens 68". Nước gốc chỉ phủ x −225..115, nên dùng mặt nước riêng bám theo camera, tô bằng màu và ảnh gốc. Cú nhảy khỏi đuôi cano là cung 0,5 giây tự thêm, vì clip Diveready chỉ có khung hình.
- **Quán.** Phòng phóng theo bề ngang, làm tròn tới 0,5× (1,5× ở 1280×720, 1× ở 844×390), cắt bớt trần, camera bám Dave theo chiều ngang. Nền sau quán tô phẳng `#070a12` vì bản gốc có trời biển 3D ở đó. Tên 64 món do dự án tự dịch, vì bảng chữ gốc có 14 thứ tiếng nhưng không có tiếng Việt.
- **Súng.** Tốc độ đạn = sức bắn × 0,02, súng ngủ 5 giây (+1 mỗi cấp), lưới mở bán kính 1 m, lựu đạn rơi 4 m/s² và tự nổ sau 2,5 giây: bảng gốc không có các số này.

## Kiểm

```
node test/ho-xanh-suite.js      # SHOTS=<thư mục> để đổi chỗ lưu ảnh
node test/ho-xanh-meta.js       # hàm thuần của data/meta.js và chuẩn hoá sổ lưu, không cần trình duyệt
node test/ho-xanh-boat.js       # lái cano ra/về, nhảy xuống, 5 chuyến không rò bộ nhớ GPU
node test/ho-xanh-gun.js        # từng khẩu súng bắn trúng cá, hết đạn, dao ở phím F
node test/ho-xanh-bar.js        # một ca bán bằng phím và bằng chạm, giá đúng, trà, khách bỏ về, sổ ghi một lần
node test/ho-xanh-prep.js       # mua khi thiếu tiền bị từ chối, mua/trang bị súng, nâng quán, tải lại còn sổ
node test/ho-xanh-bar-sim.js [đêm] [hạt]   # mô phỏng tiền mỗi ngày, không cần trình duyệt
```

Chạy ở 1280×720 và 844×390 trên lộ trình A01 → B01 → C03. Các bài: ghép đúng lộ trình, glb A01 đủ vai (đá, san hô, hải quỳ, rong, san hô 2D), Dave có trên hình, bơi vào vách không lọt đá, xiên và dao bắt được cá, cá hướng đầu theo chiều bơi, độ sâu đúng dải, nạp ngầm đủ ba tầng, băng tên vùng, đèn đội đầu ở vực sâu, ngất giữ đúng một con, lên bờ và vào khoang cứu hộ giữ cả túi, không lỗi trang. Thêm một trang không ép lộ trình: ba lượt liền nhau đổi chủ đề và ghép khớp miệng nối. Thêm một ngày trọn vòng ở cả hai cỡ màn hình: sổ mới, mua khi 0 vàng bị từ chối, cá mang về vào bếp, quán bán, sổ cuối ngày sang ngày 2, tải lại trang còn sổ, nâng O₂ thì lượt sau O₂ 120, túi đầy ở con thứ 9, quá 130 m tụt khí ×2,5, `?fresh=1`, `?phase=bar`.

```
node games/ho-xanh/tools/route-check.js   # mọi lộ trình bơi được tới tầng cuối (~35 giây)
```
