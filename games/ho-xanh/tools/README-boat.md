## Cano, súng, trang bị (rip_boat.py)

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_boat.py              # tất cả, ~12 phút
    python games/ho-xanh/tools/rip_boat.py boat sea     # vài phần: boat sea dave vfx gear audio

Tool chỉ import `rip.py` và `level.py`, không sửa chúng. `rip.py` phải chạy trước một lần để có bảng bundle.
Chạy cả bốn phần `boat sea dave vfx` thì xoá `art/boat/` trước khi ghi. Chạy `vfx gear` cùng nhau thì xoá `art/gear/`.

Ra:
- `art/boat/boat.glb`: cano của Dave. `sea.glb`: biển sảnh. `clouds.glb`: mây.
- `art/boat/dave_lobby.png`: Dave ở sảnh. `lobby_anim.png`: dừa, mòng biển. `water/`: ảnh nước. `fx/`: ảnh hạt của mọi VFX.
- `art/gear/`: icon iDiver, xu, Bei, icon súng, súng cầm tay, đạn, tay Dave cầm súng.
- `audio/boat_*`, `audio/gun_*`, `audio/ui_*`.
- `data/boat_assets.js` (`window.HX_BOAT_ASSETS`), `data/gear_sheet.js` (`window.HX_GEAR_SHEET`).

### Cano [ĐO TRONG REPO, 2026-09-24]
- Nguồn: prefab `Lobby/Prefabs/LobbyBoat_Day`. Lấy `Model`, `Light_Root`, `Prop_Root`.
  - Bỏ `VFX_Root` (ghi riêng thành công thức hạt), `Event_Root` (va chạm), gương Merman, biển quảng cáo Cobra.
- Gốc glb = gốc prefab. 1 đơn vị glb = 1 đơn vị Unity. Thân dài ~12,6 dọc trục x.
- Mũi cano ở -x (lan can nhọn). Đuôi ở +x (thang, ba phao tròn).
- Chữ "Nodens 68" đọc xuôi ở mặt glTF +z. Đó là mặt camera sảnh nhìn thấy (Unity -z).
- Mặt nước ở y = +0,2 so với gốc. Scene đặt cano ở độ cao sóng cộng `heightOffset` -0,2 (`DynamicEnvironmentBoatFloating`).
- Ở scene DR_Lobby cano nằm ở (-52,8; 15,39; 0,65). Mặt nước `wave001` ở y 15,53.
- Anim thật của cano (Animator `Boat_001`) đã giải ra số khoá: `Boat_Idle001` (nhấp nhô 3,5 s, lặp), `Boat_Exit001` (rời bến 3,65 s), `Boat_Exit002` (chạy, lặp).
  - Track gốc: `posOffset` = độ lệch so với gốc prefab, `euler` tính bằng độ. Lấy mẫu 30 khung/giây.
  - Track `active` bật tắt VFX `Idle`/`Exit` theo thời gian.
- Bản đêm: cùng mesh, chỉ đổi material kính/đèn pha. Số màu và đèn điểm nằm ở `boat.night`.

### Biển sảnh
- `sea.glb` lấy từ scene `DR_Lobby`: thuyền quán sushi `Sushiboat_Day`, đảo xa `FarBG`, bụi cây `ForestSprites_*`, nền đảo `Lobby_Ground001`.
- Mặt nước và mây lấy từ `Lobby/Prefabs/Environment/Lobby_Day.prefab`. Đây là bản `DynamicEnvironmentLoader` nạp khi DayTime 1 + Weather 0.
  - Có một `Lobby/Prefabs/Lobby_Day.prefab` khác, dùng material nước cũ. Không dùng bản đó.
- Nước là shader `ProjectDR/DaveWater` (họ Stylized Water). Sóng tính trong shader, không có ảnh màu.
  - Glb chỉ có mesh + màu `_BaseColor`. Mọi màu, số và 4 ảnh (sóng, bọt, gợn, caustic) nằm ở `sea.water`.
- Trời `Sky_Inner` là quả cầu shader graph không có ảnh. Không xuất. Màu lấy từ `sea.renderSettings` (sương 70→250) và `sea.lights`.
- Mây: 8 tấm, shader graph `Cloud`. Ảnh nằm ở thuộc tính `Texture2D_310EA40D`, không phải `_MainTex`.
  - `clouds.glb` đóng gói với `-kn` để giữ tên node. Anim trôi (legacy, 500 s) ghi dạng khoá Hermite `posKeys`.
- Dừa đung đưa và mòng biển có Animator nên không vẽ tĩnh trong glb. Chúng nằm ở `sea.animSprites` (sheet + vị trí + clip).
- Camera sảnh: fov 50, đặt ở (-44,63; 20,4; -19,32), nhìn gần như thẳng +z.

### Dave ở sảnh
- Atlas `01_Default_Lobby_Atlas`. Sprite 64×64, pivot đáy giữa, 100 px/đơn vị. Scene phóng ×3,4.
- Mỗi clip trong `Lobby_Characters/Dave/Animations` là một dãy. `frames = [[cột, giây], ...]` theo đúng khoá sprite của clip.
  - `Diveready`: 18 hình, 4,25 s, nhảy xuống nước. `Respawn`: leo lại lên thuyền. `Idle_Water`: đạp nước. `Walk`: đi trên boong.
- Khung không clip nào dùng vẫn đưa vào, dãy tên bắt đầu bằng `_` (vd. `_WalkEnd`).

### Súng phụ
- Số lấy từ ScriptableObject `GunSpecData_Normal_<Tên>_Lv1..5`, không phải từ bảng JSON.
- Súng cầm tay và đạn lấy đúng prefab mà GunSpecData trỏ tới qua GUID (`EquipObjectReference`, `bulletReference`).
  - Giải GUID bằng `catalog.json` của Addressables (`guid_map()`). Kết quả đệm ở `%TEMP%/ho-xanh-rip/guid_map.json`.
  - Ví dụ: súng hoa cải cầm prefab `VolleyJet`, bắn `Bullet`. Súng bắn tỉa là `RedSniper`, bắn `PierceBullet`.

| id | GunSpecData | sát thương lv1..5 | đạn | tầm | khác |
|---|---|---|---|---|---|
| rifle | UnderwaterRifle | 15 22 31 41 65 | 8 | 5 | 1 viên |
| shotgun | TripleAxel | 12 15 19 24 29 | 6 | 3 | 3 nòng, góc ±20° |
| sniper | RedSniper | 32 38 47 57 74 | 3 | 20 | đạn xuyên, Power 1500 |
| sleep | SleepGun | 0 | 3 | 5 | BuffIDs 14080403..07 (ngủ) |
| net | NetGun | 0 | 3 | 5 | bắt cá cỡ ≤ 3, tối đa 7→15 con theo cấp |
| grenade | GrenadeLauncher | 0 (nổ 30 37 46 56 70) | 6 | 10 | bắn cầu vồng, nổ bán kính 2 |

- Bảng không có "tốc độ bắn". `BurstTerm` 0,2 s là số gần nhất. Thời lượng ngủ của buff cũng không có trong bảng dữ liệu.
- Không có súng lục. `AttackReadyArms_Pistol` là lớp tay cầm súng nhỏ trong atlas trong game, đã xuất ở `art/gear/arms/`.
- Tiếng bắn: tên clip là [DtD]. Việc ghép clip với súng là [ĐỀ XUẤT] theo tên, vì bảng âm thanh gốc nằm trong code IL2CPP.

### Trang bị (`gear_sheet.js`)
- `SubEquipment`: O2 (11 cấp, 90→530), đồ lặn (40→800 m), túi (9→185 kg), súng xiên (sát thương 3→40), dao (3→17), drone, bẫy cua.
- `price = [a, b]` chép y bảng gốc. a là vàng. b chưa rõ là gì: bảng không ghi tên cột.
- DtD không có nâng cấp cano/động cơ. `BoatDeco` chỉ là mẫu sơn. `gearIcons.engine` = null.

### VFX
- Mỗi prefab ParticleSystem ghi thành "công thức": lifetime, speed, size, rate, bursts, shape, màu theo đời, lưới ảnh `sheet.cols/rows`, blend.
  - Số: một số = hằng, `[a, b]` = ngẫu nhiên, `{curve, mul}` = đường cong `[t, v]` nhân `mul`.
- Cano: `boatIdle`, `boatExit` (72 emitter: bọt đuôi, sóng hai bên, giọt nước), bản chiều tối, tia nắng + sóng lấp lánh `seaAfternoon`, `diveBubble`, 5 hiệu ứng nâng cấp iDiver.
- Súng: `gunShotBubble` (nòng), `hitGun`, `netTrap`, `netRip`, `sleepHead`, `tranqBody`, `explosion`… Mỗi đạn có thêm `projectile.trail`.
- `netWrap` (`E_Net_Wrap_Prefab`) không có ParticleSystem nào. Lưới thật là vải vật lý Obi (`ObiCloth`), không xuất được.

### Bẫy đã sập
- Tìm GunSpecData bằng byte thô: bundle nén LZ4 theo khối, chuỗi dài `GunSpecData_Normal_` bị cắt ngang khối nên không thấy. Tìm chuỗi ngắn `GunSpecData_` mới ra.
  - Lần đầu tool ghi đệm rỗng. Giờ tool dừng hẳn nếu không thấy gì.
- Clip đã build (không legacy) không có `m_PPtrCurves`. Khoá sprite nằm trong `m_StreamedClip` dưới dạng `discreteCurveCount`.
  - Chỉ số curve = cộng dồn số chiều của `genericBindings` theo thứ tự (Transform: vị trí 3, quaternion 4, scale 3, euler 3; còn lại 1).
  - Khung đầu nằm ở mốc thời gian -FLT_MAX. Bỏ mốc đó là mất hình đầu.
- Prefab `BloodHitGun` để scale gốc = 0. Nghịch đảo ma trận gốc báo `Singular matrix`, nên chỉ trừ vị trí.
- `silenceremove -50dB` xoá sạch `ui_app_click_01` (tiếng quá nhỏ). Tool tự mã lại không cắt nếu còn dưới 30% độ dài.
- Chrome/Playwright: trang đầu tiên của trình duyệt mất WebGL context (`CONTEXT_LOST_WEBGL`) khi render bằng SwiftShader. Chụp một trang nháp trước.
- Cổng 8765 có agent khác dùng. Máy chủ tĩnh để kiểm glb nên nghe cổng 0 (hệ điều hành tự chọn).
- `rip.py rip_dave` đặt khung đã cắt viền vào giữa ô, không theo `textureRectOffset`. Tool này dùng `sprite_canvas()` đặt đúng chỗ. `rip.py` chưa sửa.

### Số đo lần chạy 2026-09-24
- `boat.glb` 206 KB (10 mesh, 7 material). `sea.glb` 598 KB (143 sprite, 9 mesh quán sushi, 7 mesh đảo, 1 mặt nước). `clouds.glb` 815 KB (ảnh mây thu về 512).
- `art/boat` 6,9 MB (67 ảnh hạt trong `fx/`), `art/gear` 0,4 MB. Tổng 7,2 MB.
- 42 tệp tiếng, 2,5 MB, mp3 mono 96 kbps. `boat_bgm_lobby` chỉ dài 24 s vì `BGM_Lobby.wav` gốc là vòng lặp 24 s.
- `boat_assets.js` 464 KB, phần lớn là công thức VFX (`vfx` 209 KB, `gunVfx` 112 KB).
- Ảnh hạt xám (R=G=B) lưu dạng PNG `LA`: art giảm từ 8,7 MB xuống 7,2 MB cùng với việc gộp ảnh hạt trùng giữa cano và súng.
- Kiểm bằng mắt: glb dựng bằng three r140 + MeshoptDecoder của repo, chụp qua Playwright. Tư thế camera sảnh cho ra cảnh giống sảnh gốc.
- Mây dựng bằng material chuẩn bị viền nâu. Shader `Cloud` gốc dùng ảnh làm mặt nạ trộn hai màu HDR (`extras.colors` trong material). Runtime nên tô lại theo hai màu đó.

### Không có trong game gốc
- Không có clip máy cano lặp riêng của Dave. `boat_engine_loop` là của thuyền DLC Dredge, `boat_engine_start/idle` là của thuyền hải tặc. `boat_move` là tiếng cano Dave thật.
- Không có tiếng nạp đạn súng phụ. `gun_reload` là tiếng nạp/nhặt đạn. `gun_empty`, `ui_fail` là ghép [ĐỀ XUẤT].
- Không có ảnh trời, không có phao hay mốc đánh dấu Hố Xanh trên mặt nước. Sảnh chính là chỗ lặn (`DiveTrigger` ở đuôi cano).
- Không có bảng tốc độ cano.
