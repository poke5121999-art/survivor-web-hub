# Hố Xanh

Dựng lại vòng lặn xiên cá ở Hố Xanh của Dave the Diver. Hình Dave, cá Spine, bản đồ 3D, san hô đặt tay, số liệu ánh sáng, hiệu ứng và tiếng đều lấy từ bản gốc (xem `tools/README.md`).

Một lượt lặn là một trục dọc liền mạch ghép từ các tầng của bản gốc: vùng nông A (0–50 m), tầng giữa B (50–130 m), vực sâu C (130–250 m). Tầng dưới chỉ ghép được khi khớp miệng nối với tầng trên, giống cách bản gốc đổi bản đồ mỗi ngày. Mỗi lượt đổi sang một chủ đề khác lượt trước: ban ngày, rừng tảo (A06), chiều tà, trời mưa, lặn đêm (chỉ tới tầng giữa, có đèn đội đầu).

Lên tới mặt nước hoặc bơi lên vào khoang cứu hộ là mang cả túi cá về. Cạn dưỡng khí là ngất, chỉ giữ được một con.

Mỗi lượt lặn nằm trong một ngày trọn vòng:
1. Sắm đồ trên app iDiver: nâng trang bị, mua và chọn một khẩu súng phụ, nâng cấp quán.
2. Cano Nodens 68 tự chạy từ nhà hàng sushi nổi ra Hố Xanh, Dave nhảy xuống nước.
3. Lặn.
4. Cano tự chạy về quán.
5. Chọn món từ tủ cá. Bancho nấu, Dave bưng món và rót trà cho khách.
6. Cộng sổ cuối ca, sang ngày mới.

Mọi hình, hoạt ảnh, UI, VFX và tiếng của cano, quán và cửa hàng đều bóc từ bản gốc (`tools/README-boat.md`, `tools/README-bar.md`). Chỗ bản gốc không có thì bỏ trống, không vẽ bù.

## Điều khiển

| Việc | Bàn phím + chuột | Cảm ứng (ngang máy) |
|---|---|---|
| Bơi 8 hướng | WASD hoặc mũi tên | chạm góc dưới trái: cần nổi hiện ở chỗ chạm |
| Tăng tốc (đốt khí nhanh hơn) | Shift | chạm nút tăng tốc để bật, chạm lần nữa để tắt |
| Lướt ngắn | Space (khi không đứng cạnh xác cá) | nút lướt (vòng tối quét lúc hồi) |
| Ngắm / bắn xiên | giữ chuột trái để ngắm, thả để bắn | giữ nút bắn lớn, kéo để ngắm, thả để bắn; thả trong ô **Huỷ bắn** góc trên phải là thôi. Không kéo thì bắn thẳng trước mặt |
| Giằng co với cá lớn | bấm liên tục chuột trái hoặc Space | chạm liên tục nút giằng co (thay chỗ nút bắn) hoặc bất kỳ đâu |
| Dao | F | nút dao |
| Nhặt xác cá / xả thịt cá lớn | E hoặc Space cạnh xác; cá lớn giữ 2,2 giây | nút bàn tay (chỉ hiện cạnh xác), giữ với cá lớn |
| Súng phụ | giữ chuột phải để ngắm, thả để bắn | nút nhỏ cạnh nút bắn đổi xiên ↔ súng; cầm súng mà không kéo thì tự nhắm cá gần nhất |
| Trong quán | A/D hoặc ←/→ đi, Shift chạy; E mở quán; Space bưng món ở quầy hoặc phục vụ khách gần nhất; giữ Q 1,5 giây bỏ đĩa cũ nhất. Rót trà: giữ Space rồi thả khi vòng gần đầy | cần nổi nửa trái để đi, nút tương tác (bưng, phục vụ, giữ để rót trà), nút thùng rác, nút đi/chạy (theo `SushiBarTouchCanvas` gốc) |
| Gọi drone chở cá (khi có drone) | Ctrl trái cạnh xác cá lớn hoặc cá lớn đang ngủ/đóng băng | nút drone |
| Tạm dừng, cài đặt / tắt tiếng | Esc hoặc P / M | nút menu góc trên phải; tắt tiếng nằm trong Cài đặt |

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
| `data/meta.js` | `HX_META`: bảng nâng cấp `GEAR` (O₂, túi cá, đồ lặn, dao, súng xiên) và `GUNS` (sáu khẩu gốc) lấy số `[DtD]` từ `gear_sheet.js`; `BAR` (ghế, đầu bếp, trang trí, trà); `BAR_TIERS` (mỗi cấp trang trí bày nội thất gốc nào, ghế nào, hệ số giá món, nhịp khách) và `tier(save)`; giá món gốc. Hàm thuần `stat / level / nextCost / buy / buyGun / equipGun / gunStat / loadout / dishOf / servingsOf`. Phải nạp sau `gear_sheet.js` |
| `data/gear_sheet.js`, `data/bar_assets.js`, `data/boat_assets.js` | Sinh bởi `tools/rip_boat.py` và `tools/rip_bar.py`: số trang bị và súng gốc; toàn bộ art, clip, bố cục UI, công thức hạt của quán và cano |
| `js/save.js` | `HX.save`: sổ lưu `hx.save.v1` trong localStorage. `load / get / commit(fn) / wipe / parse` |
| `js/prep.js` | Pha `prep`: app iDiver gốc, ba thẻ Trang bị / Súng / Quán, popup lên cấp gốc |
| `js/boat.js` | Pha `boat` (`surface: 'scene'`): cảnh biển sảnh gốc, cano tự chạy `moor → depart → cruise → arrive` theo khoá clip gốc, clip Diveready / Respawn của Dave, hạt vệt sóng chạy từ công thức gốc, tiếng máy theo tốc độ |
| `js/bar.js` | Pha `kitchen`, `bar`, `ledger`: phòng quán dựng theo hàng `BAR_TIERS` của cấp trang trí, khách, Bancho nấu, Dave bưng món, rót trà, trả tiền, sổ cuối ca |
| `js/gun.js` | Súng phụ trong lượt lặn: ngắm, đạn, chùm đạn, xuyên, lưới, đạn ngủ, lựu đạn nổ vùng |
| `css/prep.css`, `css/boat.css`, `css/bar.css` | Kiểu riêng của từng pha trên bờ |
| `data/zones.js` | Sinh bởi `tools/level.py`: 16 tầng, mỗi tầng vách va chạm, hòm O₂, khoang cứu hộ, rong Spine, mã miệng nối và số liệu ánh sáng gốc |
| `js/dive.js` | Bảng chủ đề, ghép lộ trình theo miệng nối, xếp chồng các tầng, độ sâu hiển thị, ánh sáng theo độ cao |
| `js/world.js` | Va chạm 2D trên đa giác vách gốc của mọi tầng đã xếp chồng: trong/ngoài, trượt theo vách, tia xiên |
| `js/gfx.js` | Vẽ ở độ phân giải thật có khử răng cưa; bộ đổ màu nước (sương, ánh sáng, đèn đội đầu) dùng chung cho đá, sprite, Spine; lớp chỉnh màu cuối theo Volume gốc |
| `js/level.js` | Nạp glb từng tầng, gán vật liệu theo vai (đá, san hô, hải quỳ, rong…), rong Spine, vệt nắng, bụi, mặt nước, hòm O₂, khoang cứu hộ |
| `js/dave.js` | Sprite Dave + lớp tay súng, máy trạng thái người lặn |
| `js/harpoon.js` | Mũi xiên và dây |
| `js/drone.js` | Drone chở cá: gọi, bay theo root motion của clip gốc, kéo cá lên, `G.drone` |
| `tools/rip_gear.py` | Bóc icon, ảnh, hiệu ứng, dây màu, tiếng của mũi xiên và drone vào `art/gear/head`, `art/gear/drone`, `art/fx/gear`, `audio/gear_*` |
| `js/fish.js` | Nạp Spine, máy trạng thái cá, bộ sinh cá theo allocator gốc của từng tầng (`G.fishes.sharks`: cá mập 3D chờ `js/shark.js`), ảnh nhỏ cho thẻ bắt cá |
| `data/fish_spawn.js` | Sinh bởi `tools/rip_fishgroups.py`: chỗ đặt cá gốc (preset IGPSet + FishAllocator) của 16 tầng, cấu trúc ở `tools/README.md` |
| `js/fx.js` | Hạt hiệu ứng theo bảng `KINDS`, và phát lại công thức hạt gốc của súng |
| `js/hud.js`, `js/audio.js` | DOM phủ trên cảnh; Web Audio |
| `js/main.js` | Sổ pha và `go()`, dựng lượt lặn theo trang bị, nhập liệu, camera, ánh sáng mỗi khung, móc `window.HX_DEBUG` cho bộ kiểm |
| `data/mobile_ui.js`, `art/ui/mobile/` | Sinh bởi `tools/rip_mobile.py` từ APK Android 1.0.30 (đọc bundle thẳng trong tệp zip): toạ độ, cỡ nút, số cần điều khiển và sprite của HUD cảm ứng gốc |
| `tools/route-check.js` | Loang từ chỗ xuống nước qua mọi lộ trình hợp lệ, xác nhận bơi được tới tầng cuối |

## Máy trạng thái

- Pha: `title → prep → boat(out) → loading → dive → result → boat(home) → kitchen → bar → ledger → prep …`
  - Màn đầu: sổ còn cá chưa bán (`stage: 'bar'`) thì "Tiếp tục" vào thẳng `kitchen`, không thì `prep`.
  - Tầng trên cùng nạp trước; các tầng dưới nạp ngầm trong lúc lặn. Rời mặt nước (sang pha không phải `3d`, hoặc về màn đầu) thì dỡ lượt lặn.
- Sổ pha (`js/main.js`): mỗi pha `{ surface, enter(args), exit(), update(dt), render() }`, chỉ `surface` bắt buộc.
  - `surface: '3d'` vẽ cảnh three.js; `'dom'` vẽ cảnh nước trống làm nền, pha dựng giao diện trong `G.screen(tên)`; `'2d'` hiện `#stage2d`, bỏ vẽ cảnh 3D, pha tự vẽ trong `render()` lên `G.stage2d.ctx`; `'scene'` để pha tự dựng cảnh three.js riêng và tự vẽ bằng `G.gfx.renderer` (cano).
  - `G.go(tên, args)`: gọi `exit()` pha cũ, đặt `G.phase` và `body[data-phase]`, `body[data-surface]`, hiện đúng `#scr-<tên>`, gọi `enter(args)`.
  - Pha mới đăng ký bằng `HX.phases.<tên> = {...}` trong tệp riêng, nạp trước `main.js`.
- Sổ lưu `hx.save.v1`: `{ v, day, stage, gold, gear{o2,cargo,suit,knife,harpoon,drone}, guns{owned:[id],equipped}, heads{lv{<mũi>:cấp},equipped}, fridge{<cá>:số}, bar{seats,chef,decor,tea}, dex{<cá>:1}, stats{served,earned} }`. Cài đặt HUD (cỡ nút, độ trong, cần cố định, kiểu tăng tốc) nằm riêng ở `localStorage['hx.ui']`.
  - Đọc vào là chuẩn hoá từng khoá; giá trị lạ về mặc định. Muốn đổi phải qua `HX.save.commit(fn)`.
  - Hết lượt lặn (lên bờ, vào khoang, ngất) là cá giữ được vào `fridge` và `dex`, `stage: 'bar'`, ghi một lần mỗi lượt.
  - Sổ cuối ngày (`ledger`) cộng vàng, bỏ cá đã bán khỏi tủ, `day + 1`, `stage: 'prep'`, cũng chỉ một lần. Tải lại giữa lúc bán thì tủ còn nguyên.
- Trang bị đọc một lần lúc dựng lượt lặn vào `G.loadout` (`HX_META.loadout(save)`). Mọi tệp lặn đọc từ đó; `o2.max`, `knife.damage`, `harpoon.damage` trong `tuning.js` không còn dùng.
  - Túi đếm số con, không đếm ký. Bản gốc tính túi theo kg (9 → 185) nhưng bảng cá không có cân nặng. Túi đầy thì cá hạ được vẫn tan đi khi tới tay, báo "Túi đầy".
  - Quá độ sâu an toàn của đồ lặn thì dưỡng khí tụt ×2,5 và HUD báo, tính một chỗ trong `dave.js`. Đồ lặn cấp 0 gốc chỉ tới 40 m; cấp 1 giá 0 vàng.
- Dave: `enter | swim | dash | aim | shoot | reel | tug | melee | gunAim | gunFire | harvest | callDrone | hurt | surfaced | dead`. Tăng tốc là cờ của `swim`.
  - State có cờ `immune` (`enter`, `tug`, `surfaced`, `dead`) thì không bị cắn. Một chỗ kiểm: `Diver.prototype.vulnerable()`.
  - `tug`: Dave đứng yên, cá chạy tới hết dây (`T.harpoon.range`) thì dừng.
- Xiên: `ready → flying → (stuck | returning) → ready`.
- Cá: `wander | flee | chase | defend | sleep | hooked | hauled | dying | dead | reeled`. Cá nóc dùng `defend` (phồng gai). `sleep` do súng ngủ.
  - Cá chết đi đâu chỉ quyết ở `Fish.prototype.die(onRope)`: chết trên dây xiên thì `hauled`, dây kéo về túi; chết do dao, súng thì `dying → dead`, thành xác nổi chậm, 40 giây thì tan.
  - Dave bơi tới xác, bấm E/Space: cá nhỏ nhặt ngay (`PickUp`); ba loài có `CarvableCount > 0` gốc (cá mó đầu gù, cá bàng chài đầu bướu, cá khế vây vàng) phải giữ 2,2 giây để xả thịt (`Tanning`).
- Quán theo cấp trang trí (`BAR_TIERS`): mức 0 là quán cũ gốc (`FurnitureLv1`), mức 1 trở đi là quán đã sửa (`FurnitureLv2`) cộng đồ `SushiBarInteriorItems`. Chỉ ghế đã mở mới bày ra. Giá món = giá gốc × hệ số cấp công thức.
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

- **Khung Dave phải đặt đúng chỗ trong ô 120 px theo `m_Rect` và `textureRectOffset`.** Bản cũ căn giữa phần đã cắt nên Idle01 lệch (+5; −5) px và tay lệch khỏi thân. `python tools/rip.py dave` chỉ ghi lại `art/dave/` và mục `dave` của `assets.js`.
- **Súng xiên dùng chung lớp tay `RangeWeaponArm` với súng phụ.** `HookAttack*` / `HookAttackArm` là đồ cũ: clip trỏ tới một nút không còn trong `PlayerGroup`. Súng xiên cầm tay là `<X>HarpoonGunTemplate` theo cấp; mũi xiên nằm ở `ProjectileAttachTransform`, dây buộc ở `RopeAttachRigidbody`. Dây gốc đen, rộng 0,02 m.
- **Nhịp hoạt ảnh lấy từ khoá sprite của AnimationClip gốc, không chia đều theo fps.** Ví dụ ShortDash chạy 03, 04, 01, 02, 03, 04, 05; Die rồi lặp DieIdle; RangeWeaponDraw 0,3 giây.
- **`scalingMode = Shape` (bọt của Dave) chỉ phóng vùng sinh, không phóng cỡ hạt.** Nhân cả cây thì bọt nhỏ tới mức vô hình.
- **Ảnh của shader dissolve là mặt nạ nhiều kênh (R hình, G nhiễu).** Vẽ thẳng RGB ra thành cục khói bảy màu. Công thức tan đang dùng là [ĐỀ XUẤT].
- **Lưới của súng lưới là vải vật lý Obi, mesh sinh lúc chạy.** Không có bản vẽ tĩnh để bóc, nên lưới không vẽ.
- **Chạy trọn `rip.py art` mất gần một giờ và xoá `art/fish`, `art/ui`… trong lúc đó.** Agent khác đang kiểm sẽ gặp 404. Chỉ chạy lẻ `dave`, `divefx`, `fxmesh`. `rip.py audio` giờ chỉ ghi đè tệp trong bảng `AUDIO`, không xoá `audio/` nữa.
- **Trong prefab `LobbyBoat_Day`, cụm VFX của cano nằm ở (0; 0,24; −0,92), phóng 0,82.** Vị trí hạt trong manifest chỉ khớp thân cano sau khi cộng độ lệch này.
  - Cụm mây "Lobby Clouds" nằm ở (−34,16; 15,92; 180,89). Khoá trôi của mây tính tương đối với nó.
  - GLTFLoader đổi dấu cách trong tên node thành `_`: "Cloud001 (1)" thành "Cloud001_(1)".
- **Mọi shader hạt của game nhân đôi màu, không riêng shader Additive cũ.** Không nhân thì vệt sóng sau cano gần như vô hình và hiệu ứng UI của quán chỉ sáng một nửa. Bảng công thức màu từng shader ở `tools/README-bar.md`.
- **Hơi cuộn trong khói nấu của Bancho là mesh cong có ảnh cuộn qua nhiễu trong mặt nạ.** Chỉ bóc mặt nạ mà vẽ thì ra khối trắng đặc che Bancho. Công thức đúng lấy bằng cách tháo shader đã biên dịch qua `d3dcompiler_47.dll`. Khói gốc rất nhạt, tối đa khoảng 8% độ đục.
- **Vòng sáng quanh bong bóng gọi món là con của bong bóng.** Chỉ tắt phát hạt thì vòng rỗng còn treo nửa giây sau khi phục vụ, trông như đĩa tròn đen.
- **Font gốc Snowstorm thiếu 104/196 chữ mẫu tiếng Việt.** Chuỗi tiếng Việt dùng nguyên chuỗi Roboto-Medium (cũng là font gốc); Snowstorm chỉ cho số và chữ không dấu, như cách bản gốc đổi font cho tiếng Ba Lan. `tools/rip_ui.py` bóc font, sprite iDiver, bố cục và cửa hàng Duff; chạy sau `rip_boat.py`.
- **Hạt dạng chữ ("UPGRADE", "NEW WEAPON") có chiều cao riêng `startSizeY`.** Thiếu số này thì chữ bị kéo cao gấp đôi.
- **Lớp `_light` của phòng quán cần nền đục.** Chỗ trong suốt mà cộng sáng thì loá lên như đèn.
- **Hạt cộng sáng vẽ trên canvas riêng phủ DOM cần `mix-blend-mode: plus-lighter` hoặc `screen`.** Không có thì hạt thành ô vuông đen.
- **9-slice có phần giữa rộng 0 px (như `NameBubble00`) ra rỗng với CSS `border-image`.** Chừa phần giữa 1 px.
- **`index.html` có lớp `.bar` chung cao 12 px.** Đặt tên lớp trùng là bị ép dẹt mà không báo gì.
- **`String.replace` hiểu `$$` trong chuỗi thay thế là một `$`.** Vá bài kiểm có gọi `page.$$` bằng `replace` thì lời gọi hỏng im lặng.

### Đợt sửa theo góp ý chủ dự án [ĐO TRONG REPO, 2026-09-25]

- **HUD cảm ứng lấy từ bản Android** (`InGameTouchCanvas` trong `Assets/XD/Prefab/XD_Variant/MainCanvas.prefab`, canvas chuẩn 2340×1080, co theo bề ngang). `hud.js` đặt nút theo toạ độ góc màn hình trong `mobile_ui.js`.
  - Cần trái là cần nổi (vùng 2400×1800 quanh góc dưới trái, núm đi tối đa 150). Prefab không ghi vùng chết, dùng mặc định 0,125 của Unity Input System [ĐỀ XUẤT].
  - Bắn là cần ngắm trên nút bắn (đi tối đa 160), không có chạm để bắn. Nút giằng co gốc nhịp 0,333 giây.
  - Bản Android không có iDiver riêng, không có nút lái cano. Quán dùng hai nửa màn hình để đi và một nút tương tác (`SushiBarTouchCanvas.prefab`), chưa chép sang.
  - Dữ liệu cá của bản Android trùng từng byte với bản PC ở 65 loài Hố Xanh. Câu cũ "bản Android cũng không có bảng sinh cá" là cùng cái bẫy ở dưới: chỗ đặt cá nằm trong IGPSet, chưa soát IGPSet của bản Android.

- **Cá đặt theo từng bản đồ, ở đúng toạ độ, trong preset IGPSet** (chi tiết và bảng số ở `tools/README.md`, mục "Cá đặt ở đâu").
  - [BẪY ĐÃ SẬP] Bản trước soát `FishGroupController` trong scene, thấy chỉ có cá nhiệm vụ FishMon, rồi kết luận bản gốc không có danh sách loài theo bản đồ và lấy giờ ngày/đêm trên wiki. Cá thường nằm trong prefab addressable `IGPSet_<map>_<Day|Night>_F00_N00_<n>` do `<scene>_IGPSetController` nạp lúc vào scene. Chủ dự án thấy ngay: "các loại cá vẫn chưa nằm ở đúng vị trí".
  - Mỗi lượt lặn, mỗi tầng bốc một preset theo `Rate`, trong số preset đã mở theo ngày của sổ lưu (`Day_Min` gốc: preset 2+ mở từ ngày 7–25). A05 không có preset, allocator nằm thẳng trong scene.
  - Mỗi `FishAllocator` sinh đúng prefab Boid gốc (3–25 con, lệch từng con như trong prefab) ngay chỗ nó đứng, rồi cá bơi quanh các `FishWayPoint` (bán kính 5,5–7,5 m) hoặc trong hộp `_limitBoundary`.
  - Loài theo bản đồ khác hẳn cách cũ: cá hề chỉ ở A01, A03, A05; cá thiên thần lửa, cá bàng chài đầu bướu, cá da trơn sọc chỉ ở rừng tảo A06. Wiki ghi A06 không có Sheepshead và Striped Catfish, nhưng preset A06 gốc đặt cả hai.
  - `Seahorse` (2010011) trong `assets.js` không có ở zone nào; cá ngựa trong Hố Xanh là cá ngựa đua (TID 2012xxx, art riêng), chưa bóc.
  - Nhóm tắt trong prefab (cá ngừ, cá cờ, cá mập đêm `BeforeSharkParty`/`AfterSharkParty`…) là công tắc nhiệm vụ, sự kiện; game không sinh.
- **Chỗ sinh cá tự chọn [ĐỀ XUẤT]:**
  - Allocator sinh khi camera cách nó dưới `min(spawnCheckDistance, fish.wake = 22 m)`. Gốc là 18/20 m; riêng A06 ghi 9999 (sinh hết ngay lúc vào scene, ~320 con), nên kìm lại cho đỡ nặng. Cá sinh ngoài khung nhìn nên người chơi không thấy khác.
  - Mọi con còn bơi của một allocator cách camera trên 30 m (`fish.despawn`) thì cất đi, nhớ số con còn sống; quay lại thì sinh lại đúng số đó.
  - Bản gốc không có trường hồi sinh nào, nên cá chết là mất cho tới hết lượt lặn. Lượt sau bốc preset mới.
  - Allocator đặt sát vách (46 trên 4.335 dòng, phần lớn cá đuối, cá sao trời, cua nhện nằm đáy) thì dời ra chỗ nước trống gần nhất trong 3 m.
  - Phần scene tầng dưới nhô lên trên mép nối bị tầng trên che, allocator ở đó không sinh.
- **Cá chết có ba đường trong bản gốc:** `FishInteractionType { Carving, Pickup, Calldrone }`. `CarvableCount` trong `DR_GameData_Fish.json` khác 0 đúng ba loài cỡ 2 của ta. `CarvingCommand` dài 2,2 giây; `PickupCommand` tức thì. Nút `Interaction` của `DRInput` là Space.
  - Tốc độ nổi của xác (`FloatingValueWhenDead`) và thời gian tan không đọc được. 0,12 m/s và 40 giây là số tự chọn.
  - Drone kéo cá cực lớn (`LiftDrone`) chưa làm.
- **Mũi xiên không đổi theo cấp súng xiên trong bản gốc.** Cả 8 prefab đầu xiên dùng chung sprite `HarpoonProjectile`; chỉ thân súng cầm tay đổi. Súng trường và súng hoa cải dùng chung `Bullet.prefab` (cùng GUID). Nâng cấp súng phụ không đổi đạn.
- **Sheet khách trong quán vẽ quay mặt sang phải.** Mã cũ lật khi đi sang phải nên khách đi giật lùi cả lúc vào lẫn lúc ra. Dave vẽ quay trái.
- **Quán cũ có sẵn trong bản gốc.** Mỗi ô nội thất có `InteriorFurnitureSpawner` hai khoá: 1 là quán trước khi sửa (`FurnitureLv1`: biển chập chờn, OPEN hỏng chữ, loa tóe lửa, rèm rách, quầy nứt), 2 là quán đã sửa. Cảnh gốc chỉ bày khoá 2.
  - Hạng Coal gốc khoá ghế 4, 5, 12, 13 bằng prefab ghế tắt hình (`LockSeatNumList`).
  - Trang trí gốc chỉ để nhìn (`BuffIDList` = 0). Giá món gốc tăng nhờ nâng công thức (cấp 10 = ×3,7, theo DiverDB). Bảng giá từng cấp công thức không có trong dữ liệu, nên chia đều là tự chọn.
  - [BẪY ĐÃ SẬP] `decode_clip` trong `rip_bar.py` từng gộp mọi khoá đổi sprite vào một rãnh. Phải tách theo nút bằng cách đếm curve qua binding, như `FindBinding` của AssetStudio.
- **Bản gốc không có cảnh đi đường giữa quán và biển.** Animator `Boat_001` chỉ có Idle001 → Exit001 (trigger "Exit", pha trộn 0,5 giây). `LobbyPlayer` chờ `boatExitTime` 0,5 giây, tối màn `boatExitFadeTime` 1 giây rồi nạp cảnh quán. `Camera_Lobby` không có clip, sảnh không có camera ảo hay Timeline nào.
  - `Boat_Exit002` không có đường chuyển nào tới, và tên nó không có trong `global-metadata.dat`. Cả hai clip đều bắt đầu từ chỗ neo: Exit001 chạy thẳng 16 m sang trái, Exit002 chạy 17,4 m và rẽ 28,7° vào sâu. [BẪY ĐÃ SẬP] Bản trước nối hai clip đầu–đuôi, là sai.
  - Quán Bancho (`Sushiboat_Day`, x 10–28,6, z 79–94,6) cách chỗ neo (−52,8; 0,65) chừng 112 m và nằm trong khung camera sảnh gốc. Chuyển động gốc giữa quán và biển là của thuyền khách: `Lobby_GuestBoat01_Exit01` (14,9 giây) lùi khỏi bến rồi chạy về phía camera, `Lobby_GuestBoat01_Enter01` (13,1 giây) chạy ngược lại. Mũi thuyền khách cùng trục −x cục bộ với cano của Dave.
  - Bản Android có đúng bộ clip sảnh này, không có dữ liệu chuyển cảnh nào thêm.
- **Nước đêm từng lộ đáy cát thành mảng tối.** Shader nước dịch sai công thức độ sâu so với DXBC gốc: gốc là `d/_Depth + _DepthExp·(1 − exp(−d)/_Depth − d/_Depth)`, bản dịch viết `exp(−d/_Depth)`. Với `_Depth` 8 của nước đêm, cát 3 m dưới nước chỉ tô 31% màu sâu thay vì ≥ 87,5%.
- **Mũi xiên gốc không bán ở cửa hàng.** Chúng rơi từ rương vũ khí (`ChestDropList`, cấp 1–4; mũi băng chỉ từ cấp 3) và mất khi lên bờ. Game này cho mua, nâng, lắp trong iDiver; giá 180 / 360 / 720 / 1440 / 2880 là [ĐỀ XUẤT]. Số từng cấp lấy từ `HarpoonHeadSpecData` 1–5 và `BuffDebuffEffect` (trong `DataManager.prefab`) [DtD].
  - Mọi mũi dùng chung sprite `HarpoonProjectile`; khác nhau ở vệt sáng trên đầu mũi, màu dây (`ropeEffectInfo`), hiệu ứng trên thân cá và màu tô cá. Bỏ Mahoni (DLC), Drill (chỉ có chữ), HarpoonHead_Temp (gỡ lỗi).
  - Bốn hiệu ứng `VFX_HarpoonHead_*_A_01` lặp mãi, phải tự dừng.
  - Buff của súng ngủ 14080403–07 kéo dài 8 → 4 giây; số 5 giây trong `GUN_PLAY.sleepTime` có thể đổi sang [DtD].
- **Drone chở cá** (`CallDroneCommand_SO`): Dave đứng 2 giây với `WaitEscapepod` và `sound_Call_Drone_01`, bị cắn thì huỷ, không mất drone. Đường bay là root motion của hai clip drone gốc, không phải script tính. Cá drone chở không tốn chỗ trong túi, ngất vẫn giữ. Cấp 2, 3 giá 6300 / 12800 [DtD]; bản gốc cho drone đầu tiên qua cốt truyện nên giá 1200 là [ĐỀ XUẤT]. Phím Ctrl trái là `SubInteraction` của `DRInput` (suy ra, không có hành động riêng cho drone). Lưới gốc là vải Obi nên chỉ có hạt bọt.
  - [BẪY ĐÃ SẬP] `rip_gear.py` giữ bundle phụ thuộc của nhiều prefab cùng lúc thì hết bộ nhớ; giờ giải phóng giữa các prefab.
- **UI/UX Android cho mọi máy.** HUD lặn, màn tạm dừng + cài đặt và nút quán theo bản Android hiện cả trên PC; góc mỗi nút có hình phím PC lấy từ `InputAtlas_Keyboard` (có sẵn trong APK).
  - Rót trà trên Android là giữ chính nút tương tác dùng để phục vụ. Hai vùng "屏幕左右" là QTE lau dọn chạm trái/phải, không phải để đi.
  - Ảnh hướng dẫn `XDContentsGuide_Custom1-3` là bản ghi tốt nhất về màn cài đặt gốc: cỡ nút 50, độ trong 100, cần trái cố định tắt, kiểu tăng tốc nút (mặc định) hoặc vòng cần.
  - [BẪY ĐÃ SẬP] `UI_TitleFrame_8rad` và `设置顶部按钮` rỗng ở giữa; dùng làm mask CSS thì che mất mọi thứ bên trong.
  - Chưa có: sắp xếp lại nút bằng tay, thanh âm lượng nhạc/tiếng riêng, ô nhiệm vụ/đồ trên màn tạm dừng, nút bom và đồ, QTE chạm trái/phải.

- **"Trên điện thoại không chơi được" là do cầm dọc** [ĐO TRONG REPO, 2026-09-25]. Đo bằng Playwright trên bản Pages, giả lập iPhone 13 và Pixel 7 (Chromium và WebKit), dọc lẫn ngang, đi từ cổng hub → khách → thẻ game → màn đầu → iDiver → cano → lặn → quán.
  - Cầm ngang: mọi bước chạy, không lỗi trang, không mất ngữ cảnh WebGL. Màn đầu hiện sau 1,1–2,5 giây; tới lúc lặn đã tải ~25 MB, mất 31–42 giây tính cả cano.
  - Cầm dọc: game vẫn chạy nhưng HUD Android co theo bề ngang canvas 2340, nên ở 390 px mọi nút chỉ còn 1/6. Nút bắn 40 px, lướt và tăng tốc 27 px, nút đổi súng 20 px, nút menu 15 px. Vùng cần trái chỉ còn 200 × 150 px ở góc dưới. Ô Huỷ bắn đè lên nút menu và đồng hồ O₂. Cảnh chỉ rộng chừng 7 m nên không thấy cá tới.
  - Bản Android gốc khoá ngang, còn bản web không nhắc xoay máy. Người mở từ hub thì cầm dọc như mọi trang khác.
  - Sửa: máy cảm ứng cầm dọc (`(orientation: portrait) and (pointer: coarse)`) thì `#rotate` phủ kín màn, và `frame()` trong `main.js` đứng yên như lúc tạm dừng. Xoay ngang là chơi tiếp, O₂ không bị trừ trong lúc cầm dọc. Máy tính có cửa sổ hẹp dọc thì không bị chặn.
  - [BẪY ĐÃ SẬP] Mọi bài kiểm cảm ứng cũ đều mở sẵn ở cỡ ngang (844×390, 740×360) rồi vào lượt lặn bằng `HX_DEBUG.go('loading')`. Chúng không bao giờ đi qua màn đầu ở tư thế cầm máy thật, nên lỗi này lọt qua. `test/ho-xanh-mobile.js` mở bằng cỡ màn thật của Pixel 7 và iPhone 13.
  - Dòng hướng dẫn cảm ứng ở màn đầu từng ghi "giữ nửa phải để ngắm" và "nút Súng". Giữ nửa phải thật ra không làm gì (Dave vẫn `swim`, xiên vẫn `ready`), còn nút Súng đã bỏ từ khi có HUD Android. Giờ dòng đó tả đúng cần trái, nút bắn và nút đổi súng.
  - Còn nặng trên máy yếu, chưa đo trên máy thật: vừa mở trang, `loadShared` giải mã 52 tệp tiếng thành ~221 MB PCM, trong đó bốn bản nhạc nền (`bgm_night`, `bgm_deep`, `bgm_seablue`, `bgm_ingame`, 6,4 MB mp3) chiếm phần lớn. Cả ngày chơi thì PCM lên ~297 MB qua 3 `AudioContext`, cộng ~195 MB ảnh đẩy lên GPU tính tới lúc lặn. Chế độ `--enable-low-end-device-mode` của Chromium vẫn chạy trọn ngày. iPhone RAM thấp có thể bị Safari đóng thẻ [ĐỀ XUẤT: chỉ giải mã nhạc của vùng sắp vào].

## Chọn khác bản gốc [ĐỀ XUẤT]

- Camera theo bản gốc: phối cảnh 38°, lùi 18,5 m (`CinemachineFramingTransposer.m_CameraDistance`), khung nhìn cao ~12,7 m. Màn thấp (điện thoại ngang) kéo lại còn 12,5 m cho Dave khỏi bé.
- Camera nhìn trước theo vận tốc 0,45 giây; bản gốc tắt lookahead. Bơi xuống thì thấy trước chỗ sắp tới.
- Ánh sáng đá nhân thêm 1,4 lần (`dive.lightGain`), loá sáng lấy mẫu mipmap thay cho chuỗi làm mờ của URP. Cả hai chỉnh bằng mắt, đặt cạnh ảnh chụp Steam.
- Lặn đêm mượn bộ màu Evening như cảnh gốc, rồi tối thêm (`dim` 0,55) và luôn bật đèn đội đầu.
- Dave chết thì giữ con cá hạng cao nhất. Bản gốc cho người chơi tự chọn một món.
- **Kinh tế.** Ca bán 90 giây như bản gốc (`EveningHours`). Giá món = giá gốc × hệ số cấp công thức, mỗi cấp trang trí ứng với một cấp công thức (×1 → ×3,7). Nâng quán chỉ tăng giá món; khách tới đều 5 giây một người ở mọi cấp (`CustomerVisitInterval` hạng Coal), ~12 khách mỗi đêm. Giá lên cấp trang trí (120 / 450 / 1100 / 2400 / 4500) chỉnh bằng `test/ho-xanh-bar-sim.js`. Trung bình một khách trả 22 vàng ở quán cũ, 72 vàng ở quán sang. Tip = giá bán × 0,5 × phần kiên nhẫn còn lại.
- **Ghế.** Mở dần 3 → 5 → 7 → 9 → 12 → 15 ghế (bản gốc có 15 ghế).
- **Cano.** Tự chạy, không lái, đi thật giữa quán và chỗ neo trong khung camera sảnh gốc. Chuyến ra: nổ máy ở bến quán (1,1 giây đầu `Boat_Exit001`), rời bến theo `Lobby_GuestBoat01_Exit01` (0–7,5 giây), đoạn nối, rồi `Boat_Exit001` phát ngược dừng đúng chỗ neo. Chuyến về: Respawn, `Boat_Exit002`, quay đầu, vào bến theo `Lobby_GuestBoat01_Enter01` (từ giây 5). Đoạn nối và quay đầu là cung–thẳng–cung bán kính 16 m [ĐỀ XUẤT], gia tốc ~5 m/s² và tốc độ tối đa 10,1 m/s đo từ `Boat_Exit001` [DtD]. Camera giữ góc sảnh gốc, chỉ lia ngang khi mũi hoặc đuôi cano sắp ra mép khung. Mô hình quán đêm bỏ `Lobby_GuestBoat01` vì cano của Dave vào đúng bến đó. Clip Diveready gốc không có chuyển động, nên Dave đi ra đuôi cano rồi chạy clip tại chỗ, màn hình tối dần từ 60% clip như bản gốc. Chuyến ra lúc chiều, chuyến về lúc đêm.
- **Quán.** Phòng phóng theo bề ngang, làm tròn tới 0,5× (1,5× ở 1280×720, 1× ở 844×390), cắt bớt trần, camera bám Dave theo chiều ngang. Nền sau quán tô phẳng `#070a12` vì bản gốc có trời biển 3D ở đó. Tên 64 món do dự án tự dịch, vì bảng chữ gốc có 14 thứ tiếng nhưng không có tiếng Việt.
- **Súng.** Tốc độ đạn = sức bắn × 0,02, súng ngủ 5 giây (+1 mỗi cấp), lưới mở bán kính 1 m, lựu đạn rơi 4 m/s² và tự nổ sau 2,5 giây: bảng gốc không có các số này.

## Kiểm

```
node test/ho-xanh-suite.js      # SHOTS=<thư mục> để đổi chỗ lưu ảnh
node test/ho-xanh-meta.js       # hàm thuần của data/meta.js và chuẩn hoá sổ lưu, không cần trình duyệt
node test/ho-xanh-boat.js       # cano tự chạy ra/về khớp khoá clip gốc, phím không có tác dụng, nhảy xuống, 5 chuyến không rò bộ nhớ GPU
node test/ho-xanh-harvest.js    # giằng co Dave đứng yên và không bị cắn, xác cá nằm lại, nhặt và xả thịt, túi đầy, nút Nhặt
node test/ho-xanh-spawn.js      # cá sinh ra đúng allocator gốc: đàn cá hề ở A01 (-34.89; 3.85), cá chết không sinh lại, cá mập chờ ở fishes.sharks
node test/ho-xanh-touch.js      # HUD cảm ứng trên điện thoại giả lập: cần nổi, kéo ngắm, huỷ bắn, giằng co, dao, súng, nhặt xác
node test/ho-xanh-mobile.js     # Pixel 7, iPhone 13 cầm dọc: bảng "Xoay ngang" phủ kín, lượt lặn đứng yên; xoay ngang thì chơi tiếp
HX_BASE=https://poke5121999-art.github.io/survivor-web-hub node test/ho-xanh-<tên>.js   # chạy cùng bài kiểm trên bản Pages
node test/ho-xanh-gear.js       # mua/nâng/lắp từng mũi xiên và hiệu ứng khi trúng, drone chở cá, không có drone thì G.drone null
node test/ho-xanh-gun.js        # từng khẩu súng bắn trúng cá và bắn đúng đạn gốc, hết đạn, dao ở phím F
node test/ho-xanh-bar.js        # một ca bán bằng phím và bằng chạm, giá đúng, trà, khách bỏ về, sổ ghi một lần
node test/ho-xanh-prep.js       # mua khi thiếu tiền bị từ chối, mua/trang bị súng, nâng quán, tải lại còn sổ
node test/ho-xanh-bar-sim.js [đêm] [hạt]   # mô phỏng tiền mỗi ngày, không cần trình duyệt
```

Chạy ở 1280×720 và 844×390 trên lộ trình A01 → B01 → C03. Các bài: ghép đúng lộ trình, glb A01 đủ vai (đá, san hô, hải quỳ, rong, san hô 2D), Dave có trên hình, bơi vào vách không lọt đá, xiên và dao bắt được cá, cá hướng đầu theo chiều bơi, độ sâu đúng dải, nạp ngầm đủ ba tầng, băng tên vùng, đèn đội đầu ở vực sâu, ngất giữ đúng một con, lên bờ và vào khoang cứu hộ giữ cả túi, không lỗi trang. Thêm một trang không ép lộ trình: ba lượt liền nhau đổi chủ đề và ghép khớp miệng nối. Thêm một ngày trọn vòng ở cả hai cỡ màn hình: sổ mới, mua khi 0 vàng bị từ chối, cá mang về vào bếp, quán bán, sổ cuối ngày sang ngày 2, tải lại trang còn sổ, nâng O₂ thì lượt sau O₂ 120, túi đầy ở con thứ 9, quá 130 m tụt khí ×2,5, `?fresh=1`, `?phase=bar`.

```
node games/ho-xanh/tools/route-check.js   # mọi lộ trình bơi được tới tầng cuối (~35 giây)
```
