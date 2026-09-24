# Hố Xanh

Dựng lại vòng lặn xiên cá ở Hố Xanh của Dave the Diver. Hình Dave, cá Spine, bản đồ 3D, san hô đặt tay, số liệu ánh sáng, hiệu ứng và tiếng đều lấy từ bản gốc (xem `tools/README.md`).

Một lượt lặn là một trục dọc liền mạch ghép từ các tầng của bản gốc: vùng nông A (0–50 m), tầng giữa B (50–130 m), vực sâu C (130–250 m). Tầng dưới chỉ ghép được khi khớp miệng nối với tầng trên, giống cách bản gốc đổi bản đồ mỗi ngày. Mỗi lượt đổi sang một chủ đề khác lượt trước: ban ngày, rừng tảo (A06), chiều tà, trời mưa, lặn đêm (chỉ tới tầng giữa, có đèn đội đầu).

Lên tới mặt nước hoặc bơi lên vào khoang cứu hộ là mang cả túi cá về. Cạn dưỡng khí là ngất, chỉ giữ được một con.

Mỗi lượt lặn nằm trong một ngày trọn vòng: sắm đồ, lái cano ra Hố Xanh, lặn, về quán làm sushi từ cá bắt được, bán cho khách, cộng sổ, sang ngày mới. Kế hoạch ở `brain/plans/ho-xanh-mot-ngay.md`. Cano, bếp, quán và màn chuẩn bị hiện là **khung tạm** bằng DOM trơn; hình và hoạt ảnh gốc gắn vào ở đợt sau.

## Điều khiển

| Việc | Bàn phím + chuột | Cảm ứng (ngang máy) |
|---|---|---|
| Bơi 8 hướng | WASD hoặc mũi tên | kéo nửa trái màn hình |
| Tăng tốc (đốt khí nhanh hơn) | Shift | giữ nút **Tăng tốc** |
| Lướt ngắn | Space | nút **Lướt** |
| Ngắm / bắn xiên | giữ chuột trái để ngắm, thả để bắn | giữ nửa phải để ngắm, thả để bắn |
| Giằng co với cá lớn | bấm liên tục chuột trái hoặc Space | chạm liên tục |
| Dao | F hoặc chuột phải | nút **Dao** |
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
| `data/meta.js` | `HX_META`: bảng nâng cấp `GEAR` (O₂, túi cá, đồ lặn, dao, súng xiên, động cơ), `BAR` (ghế, đầu bếp, trang trí, trà), `GUNS`, giá món. Hàm thuần `stat / level / nextCost / buy / buyGun / equipGun / dishOf / servingsOf`. Cấp 0 bằng đúng `tuning.js` |
| `data/gear_sheet.js`, `data/bar_assets.js`, `data/boat_assets.js` | Luồng bóc asset ghi ra. Có thì `meta.js` lấy số `[DtD]`, món ăn lấy tên/giá/ảnh gốc; thiếu thì dùng `[ĐỀ XUẤT]` |
| `js/save.js` | `HX.save`: sổ lưu `hx.save.v1` trong localStorage. `load / get / commit(fn) / wipe / parse` |
| `js/prep.js`, `js/boat.js`, `js/bar.js` | Pha trên bờ (khung tạm): chuẩn bị; cano; bếp, quán, sổ cuối ngày. Mỗi tệp tự đăng ký vào `HX.phases` |
| `css/prep.css`, `css/boat.css`, `css/bar.css` | Kiểu riêng của từng pha trên bờ |
| `data/zones.js` | Sinh bởi `tools/level.py`: 16 tầng, mỗi tầng vách va chạm, hòm O₂, khoang cứu hộ, rong Spine, mã miệng nối và số liệu ánh sáng gốc |
| `js/dive.js` | Bảng chủ đề, ghép lộ trình theo miệng nối, xếp chồng các tầng, độ sâu hiển thị, ánh sáng theo độ cao |
| `js/world.js` | Va chạm 2D trên đa giác vách gốc của mọi tầng đã xếp chồng: trong/ngoài, trượt theo vách, tia xiên |
| `js/gfx.js` | Vẽ ở độ phân giải thật có khử răng cưa; bộ đổ màu nước (sương, ánh sáng, đèn đội đầu) dùng chung cho đá, sprite, Spine; lớp chỉnh màu cuối theo Volume gốc |
| `js/level.js` | Nạp glb từng tầng, gán vật liệu theo vai (đá, san hô, hải quỳ, rong…), rong Spine, vệt nắng, bụi, mặt nước, hòm O₂, khoang cứu hộ |
| `js/dave.js` | Sprite Dave + lớp tay súng, máy trạng thái người lặn |
| `js/harpoon.js` | Mũi xiên và dây |
| `js/fish.js` | Nạp Spine, máy trạng thái cá, bộ sinh cá quanh camera, ảnh nhỏ cho thẻ bắt cá |
| `js/fx.js` | Hạt hiệu ứng theo bảng `KINDS` |
| `js/hud.js`, `js/audio.js` | DOM phủ trên cảnh; Web Audio |
| `js/main.js` | Sổ pha và `go()`, dựng lượt lặn theo trang bị, nhập liệu, camera, ánh sáng mỗi khung, móc `window.HX_DEBUG` cho bộ kiểm |
| `tools/route-check.js` | Loang từ chỗ xuống nước qua mọi lộ trình hợp lệ, xác nhận bơi được tới tầng cuối |

## Máy trạng thái

- Pha: `title → prep → boat(out) → loading → dive → result → boat(home) → kitchen → bar → ledger → prep …`
  - Màn đầu: sổ còn cá chưa bán (`stage: 'bar'`) thì "Tiếp tục" vào thẳng `kitchen`, không thì `prep`.
  - Tầng trên cùng nạp trước; các tầng dưới nạp ngầm trong lúc lặn. Rời mặt nước (sang pha không phải `3d`, hoặc về màn đầu) thì dỡ lượt lặn.
- Sổ pha (`js/main.js`): mỗi pha `{ surface, enter(args), exit(), update(dt), render() }`, chỉ `surface` bắt buộc.
  - `surface: '3d'` vẽ cảnh three.js; `'dom'` vẽ cảnh nước trống làm nền, pha dựng giao diện trong `G.screen(tên)`; `'2d'` hiện `#stage2d`, bỏ vẽ cảnh 3D, pha tự vẽ trong `render()` lên `G.stage2d.ctx`.
  - `G.go(tên, args)`: gọi `exit()` pha cũ, đặt `G.phase` và `body[data-phase]`, `body[data-surface]`, hiện đúng `#scr-<tên>`, gọi `enter(args)`.
  - Pha mới đăng ký bằng `HX.phases.<tên> = {...}` trong tệp riêng, nạp trước `main.js`.
- Sổ lưu `hx.save.v1`: `{ v, day, stage, gold, gear{o2,cargo,suit,knife,harpoon,engine}, guns{owned,equipped}, fridge{<cá>:số}, bar{seats,chef,decor,tea}, dex{<cá>:1}, stats{served,earned} }`.
  - Đọc vào là chuẩn hoá từng khoá; giá trị lạ về mặc định. Muốn đổi phải qua `HX.save.commit(fn)`.
  - Hết lượt lặn (lên bờ, vào khoang, ngất) là cá giữ được vào `fridge` và `dex`, `stage: 'bar'`, ghi một lần mỗi lượt.
  - Sổ cuối ngày (`ledger`) cộng vàng, bỏ cá đã bán khỏi tủ, `day + 1`, `stage: 'prep'`, cũng chỉ một lần. Tải lại giữa lúc bán thì tủ còn nguyên.
- Trang bị đọc một lần lúc dựng lượt lặn vào `G.loadout`. O₂ tối đa, sát thương xiên và dao được ghi đè vào `HX_TUNING` vì `dave.js`, `harpoon.js`, `level.js` đọc thẳng từ đó. Túi đầy thì cá hạ được vẫn tan đi khi tới tay, báo "Túi đầy". Quá độ sâu của đồ lặn thì dưỡng khí tụt ×2,5 và HUD báo.
- Dave: `enter | swim | dash | aim | shoot | reel | tug | melee | hurt | surfaced | dead`. Tăng tốc là cờ của `swim`.
- Xiên: `ready → flying → (stuck | returning) → ready`.
- Cá: `wander | flee | chase | defend | hooked | dying | reeled`. Cá nóc dùng `defend` (phồng gai).

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

## Chọn khác bản gốc [ĐỀ XUẤT]

- Camera theo bản gốc: phối cảnh 38°, lùi 18,5 m (`CinemachineFramingTransposer.m_CameraDistance`), khung nhìn cao ~12,7 m. Màn thấp (điện thoại ngang) kéo lại còn 12,5 m cho Dave khỏi bé.
- Camera nhìn trước theo vận tốc 0,45 giây; bản gốc tắt lookahead. Bơi xuống thì thấy trước chỗ sắp tới.
- Ánh sáng đá nhân thêm 1,4 lần (`dive.lightGain`), loá sáng lấy mẫu mipmap thay cho chuỗi làm mờ của URP. Cả hai chỉnh bằng mắt, đặt cạnh ảnh chụp Steam.
- Lặn đêm mượn bộ màu Evening như cảnh gốc, rồi tối thêm (`dim` 0,55) và luôn bật đèn đội đầu.
- Dave chết thì giữ con cá hạng cao nhất. Bản gốc cho người chơi tự chọn một món.

## Kiểm

```
node test/ho-xanh-suite.js      # SHOTS=<thư mục> để đổi chỗ lưu ảnh
node test/ho-xanh-meta.js       # hàm thuần của data/meta.js và chuẩn hoá sổ lưu, không cần trình duyệt
```

Chạy ở 1280×720 và 844×390 trên lộ trình A01 → B01 → C03. Các bài: ghép đúng lộ trình, glb A01 đủ vai (đá, san hô, hải quỳ, rong, san hô 2D), Dave có trên hình, bơi vào vách không lọt đá, xiên và dao bắt được cá, cá hướng đầu theo chiều bơi, độ sâu đúng dải, nạp ngầm đủ ba tầng, băng tên vùng, đèn đội đầu ở vực sâu, ngất giữ đúng một con, lên bờ và vào khoang cứu hộ giữ cả túi, không lỗi trang. Thêm một trang không ép lộ trình: ba lượt liền nhau đổi chủ đề và ghép khớp miệng nối. Thêm một ngày trọn vòng ở cả hai cỡ màn hình: sổ mới, mua khi 0 vàng bị từ chối, cá mang về vào bếp, quán bán, sổ cuối ngày sang ngày 2, tải lại trang còn sổ, nâng O₂ thì lượt sau O₂ 120, túi đầy ở con thứ 9, quá 130 m tụt khí ×2,5, `?fresh=1`, `?phase=bar`.

```
node games/ho-xanh/tools/route-check.js   # mọi lộ trình bơi được tới tầng cuối (~35 giây)
```
