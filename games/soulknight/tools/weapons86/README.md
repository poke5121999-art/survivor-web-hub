# Vũ khí + đạn thật 8.6 (`build_w86.py`)

Bóc số đo, hoạt ảnh và thân đạn của **503 vũ khí (409 đánh số + 28 thần thoại + vũ khí khởi đầu) / 688 prefab đạn** Soul Knight 8.6 từ bundle
Unity, ghi ra:

| Tệp | Nội dung |
|---|---|
| `data/sk-weapons86.js` | `window.SK_W86` (~1,2 MB) — xem "Hình dữ liệu" dưới |
| `art/w86/w86_*.webp` | atlas thân đạn (khung tên `W:...`), gắn vào `SK_VFX` lúc chạy |
| `tools/extra/weapons.json` | sprite súng + sprite trong cây hình súng cho `build_sk.py` (atlas chính) |
| `D:\sk86-ref\work\weapons\stats.json` | bảng thống kê để soi tay (ngoài git) |

## Chạy lại

```sh
PYTHONIOENCODING=utf-8 python games/soulknight/tools/weapons86/build_w86.py   # ~35 s
python games/soulknight/tools/build_sk.py      # atlas chính có sprite súng mới
python games/soulknight/tools/build_design.py  # (không cần sửa gì, chạy như cũ)
```

Cần sẵn: `$SK86/decoded/config/weapons*.json` (`~/sk86-ref/tools/decode_config.py`, ngoài git) và bản
`data/sk-weapons86.js` cũ (bể rương WG_level* + ánh xạ wiki từ bảng luban, máy này chưa giải được luban nên đọc lại
từ tệp đã sinh). Món trong bảng rơi `config/weapons_drop` chưa có bể nào được thêm theo Group 0-1/2-3/4-6 → chương 1/2/3 [SUY].
Bundle 8.6 ở `$SK86` (mặc định `~/sk86-ref`, Windows `D:\sk86-ref`) qua `tools/vfx/abx.py`. `W86_LIMIT=20` chỉ bóc 20 súng đầu để thử nhanh.
Trang cần `<script src="data/sk-weapons86.js?v=...">` **trước** `js/design.js`.
Không có tệp này thì `design.js`/`actors.js` quay về số wiki + đạn vẽ kiểu cũ.

## Hình dữ liệu `SK_W86`

- `weapons[prefab]`: `n{en,vi}` (tên Việt chính thức từ localization `weapon/<key>`), `cls` (lớp C#),
  `fam` (họ bắn: fan/spray/burst/bow/charge/sword/spear/throw/orbit/laser/spin/single),
  `grade` (item_level), `cost`, `dev`, `ws` (weapon_speed = Animator.speed), `move`, `dual`, `dmf`,
  `b[]` bulletsInfo đã giải `{p prefab, dmg, spd, size, crit, repel, thr}`, `x` trường riêng của lớp,
  `rig` cây hình (nút, sprite, gun_point), `cl` chỉ số clip trong `clips`, `sm` chỉ số máy trạng thái trong `sms`.
- `bullets[prefab]`: `mv` lớp di chuyển, `tg` lớp trigger, `col` (`box`[cx,cy,w,h] hoặc `r`,`off`, đơn vị Unity), `m` trường MB.
- `explodes`, `fx` (hiệu ứng thân đạn, định dạng như SK_VFX), `wiki` (slug wiki -> prefab),
  `heroes` (thư mục hero -> súng khởi đầu), `pools`/`weights` (rương WG_level1..3).

## Cách đo nhịp bắn

`rps = weapon_speed × số sự kiện Attack trong một vòng clip bắn / độ dài vòng`. Máy trạng thái được
mô phỏng với `atk_b` giữ = true (luôn bật thêm `start`, `can_atk`). Gatling: 10 sự kiện/s × multiCount 4
= 40 viên/s, đúng wiki "40"; bảng decoded ghi 10 là **số lần bóp cò**, không phải số viên.

## Bẫy đã sập (đừng lặp lại)

- **Vòng chuyển trạng thái ping-pong** làm lần chạy đầu ngốn 17 GB RAM: `simulate` phải có trần số bước
  (`hops < 8`), tốc độ state lấy trị tuyệt đối (clip chạy ngược có speed âm).
- **Gốc prefab có vị trí/góc rác của editor** (`bullet_7` ở (4.3, 3.08), `sword_bite` y=3.91, xẻng quay
  -159°). Instantiate/ngắm súng đặt lại gốc, nên `walk2d` bỏ T của nút gốc; không bỏ thì hộp va chạm
  lệch 5 ô và 7 khẩu (M4, M14, Aurora, ổ quay...) bắn không trúng ai.
- **47 súng không có sự kiện Attack trên đường giữ nút**: thêm sự kiện giả ở đầu state (trừ state mặc định —
  không thì súng tự bắn khi đứng yên) [ƯỚC LƯỢNG]. Sự kiện ở t=0 phải được bắn (runtime dùng `ev[0]||1e-4`).
- **`bulletsInfo.size` đã nằm sẵn trong prefab** (`sword_2_5`, nút `b` của bullet_28 ×2): nhân thêm là
  bazooka nổ ngay nòng. Runtime bỏ `size`.
- **Tia laser**: prefab `bullet_9` (Ion Laser) không có MB di chuyển, tốc 0.2 → coi họ laser là tia; chỉ
  kéo giãn nút `img`, không kéo cả đạn con; clip mở tia ẩn thân 0,4 s đầu nên tia giữ theo súng.
- **Nhiều súng không có prefab đạn trong bulletsInfo** (Cầu Vồng, Gậy Nữ Thần: đạn sinh trong mã) →
  `design.js` cho bắn `bullet_0` với số đo bulletsInfo. Cung Thợ Săn có lông vũ số 0 + mục không prefab mang số thật.
- **AudioClip của `clip_hold`** không giải được khi chưa nạp `sound_effect` → lấy tên từ decoded extra.
- 7 lớp tự viết (Đạn Đạo Lỗ Đen, Lá Phong Khổng Lồ, Gậy Ảo Ảnh, Gậy Tử Linh, Sách Bóng Tối, Cào Trúng Thưởng, Sổ Tay Chết
  Chóc) từ vòng 2 chạy bằng `CUSTOM_FIRE`/`CUSTOM_HOLD` trong actors.js — xem mục "Lớp tự viết" dưới.
- `laser_plunger` (wiki) không có trong 8.6 → bỏ (267/268 món wiki còn).

## Đối chiếu mã gốc 8.6 (2026-09-30, `tools/sk_method.py`)

Đọc bằng `python tools/sk_method.py Kiểu.Method`. Đã sửa trong `js/actors.js` / `js/design.js`, có kiểm thử
số cứng ở `test/soulknight-weapons.js`:

| Chỗ | Mã gốc [ĐO] | Web trước đó |
|---|---|---|
| Độ lệch | `GameUtil.GetFinalDeviation` = `RGRandom.Range(-d, d)`, d = deviation × (1 + deviation nhân vật) | ±deviation/2 |
| Góc đạn | `RGWeapon.GetBulletInfo`: `directionAngle = get_fixedAngle() + độ lệch`; fixedAngle = góc ngắm của nhân vật, không theo nòng đang giật | (đã đúng) |
| `speed_correction` | `Gun002/Gun004/Gun012`: tốc = bullet_speed + `Range(-sc, sc)` đơn vị/giây | nhân (1 ± sc%) |
| `has_delay` | `Gun004.Attack`: `Invoke("CreateBullet", max_delay)`, mọi viên trễ đúng max_delay | trễ ngẫu nhiên 0..max |
| Chỗ sinh vệt chém | `Gun006/Gun015/GunAxe/GunInitAssassin/GunInitJoker/GunInitCaptain/Katana.CreateBullet`: `transform.parent.position` (nút h1 = tay); Gun015 `createBulletAtGunpoint`, GunHarmmer `useGunPoint` mới dùng nòng | gun_point đang vung (lệch xuống dưới tới ~3 ô) |
| Nhát chém ngược | `Gun006.CreateBullet(reverse)`: `localScale = (facing, reverse ? -1 : 1)`; Attack: reverse = sword_reverse, Attack2: !sword_reverse | vfx.flip (gương trục X) → nhát thứ hai vẽ SAU lưng |
| Cỡ vệt chém | `RGSword.ResetSize`: nút `b` = (size, revert ? −size : size), size = bulletInfo.size > 0 (đặt, không nhân) | bỏ size → 79/138 vệt chém sai cỡ (Kiếm Laser Tím 3,5 vs 2,5; Kiếm Sư 1 vs 1,75) |
| Cung (`Gun005`) | `Attack`: bulletsInfo[1] là phần cộng (`bulletDelta`): sát thương/crit/tốc/xuyên = số[0] + (int)(k × số[1]), k = a_time/max_time | tốc nội suy 10→30, sát thương ×(1+k), không cộng crit |
| Súng ray (`Gun007`) | `<CreateBullet>`: như cung + cỡ = size0 + k × size1 | đầy → viên [0], chưa đầy → viên [1] (tốc 0: đạn đứng yên) |
| `WeaponChargeStaff` | `CreateBullet`: nội suy GetBulletInfo(0) → (1) theo k, làm tròn | NGƯỢC: đầy 3 sát thương, nhả ngay 12 |
| Tay cầm súng | nút `img/h1` của `c<index>` trong `hero.ab`: (0, 0,5) đv, 9 nhân vật khác | [3, 6] px cho mọi nhân vật |

Số đo đi kèm: Hiệp Sĩ tay [3,92; 6,8] px (pivot [3,92; 1,2] + h1 8 px); h1 khác mặc định: c02 0,4, c06 (0,1; 0,45),
c07 0,6, c13/c22/c28 0,3, c23/c25/c26 0,35. h2 (tay trái, Song Thủ) ở (0,5–0,55; 0,6), tức TRƯỚC mặt — web vẫn
đặt tay trái đối xứng sau lưng (chưa sửa). `grabLocalOffset` = 0 ở 1091/1097 súng: bỏ qua được.

Thân đạn `W:*` giờ mang `tint [2,2,2,2]` của glow (`_TintColor` ×2, 209/425 hiệu ứng): `B86.__init__` phải có
`self.tex_fallback` vì `BV.Builder.material()` ghi vào đó.

### Vòng 2 (2026-09-30): lao người, mặt trái, Song Thủ, cỡ đạn

| Chỗ | Mã gốc [ĐO] | Web |
|---|---|---|
| Lao người | `RGBaseController.GetForce(dir, F)`: `force_direction = dir` (F < 0 thì đảo dir), `inertial_vel = min(|F|, 300)`. `RGController.SetVelocity`: khi `inertial_vel > 1` thì velocity = `(1 − forceLerp)·tốc chạy + forceLerp·dir·inertial_vel`, `forceLerp = 1`; sau đó `inertial_vel *= min(friction, 1)`, `friction = 0,8` (`RGBaseController..ctor`). FixedUpdate 0,02 s (TimeManager trong `data.unity3d`) | `SK.selfForce` + `stepPush` (p.lunge), bước cố định 0,02 s, bỏ phím chạy khi đang lao. Lực 30 → 2,916 đv = 46,65 px trong 0,32 s |
| Lực theo lớp | Gun015, GunSpearLaser: `force` mỗi Attack. GunInitAssassin: Attack/Attack2 truyền lực 0, Attack3/Attack4 (nhát tụ) `max_hold_force` 30. GunInitJoker: `attackForce` (prefab = 0 → không lao). GunInitMiner.AttackNormal: 0; chỉ AttackHold dùng `force` 30. GunInitFighter/Baserker/HurricaneGloves: mọi cú đấm (Attack/2/3 cùng qua `Attack(bullet, pos, repel, rev)`) `atk_force`. Katana: `_forces = [0, 20, 15][_attackIndex] × clamp((d − 4)/4, 0, 1)`, d = khoảng cách tới mục tiêu (không có mục tiêu → × 1); `_attackIndex = trước + 1` nếu bấm lại trong `nextStateThreshold` 0,25 s (tối đa 2), không thì 0 | bảng `SELF_FORCE` trong actors.js; Katana đếm cạnh bấm nút bắn |
| Hướng lao | `transform.right × (facing > 0 ? 1 : −1)` hoặc `F × facing` → luôn theo hướng ngắm | `p.aim` |
| Quay mặt trái | `Gun006.CreateBullet`: `localScale = (facing, reverse ? −1 : 1)`; `BulletFactory.TakeBulletWithoutUpdate`: `rotation = Euler(0, 0, directionAngle)`; `RGWeapon.get_fixedAngle` = facing < 0 ? 180 − FixedAngle : FixedAngle | vệt chém (lớp RGSword*) lật gương trục Y cục bộ khi `p.face < 0`, XOR với nhát ngược |
| Song Thủ | `hero.ab`: `c00/img/h2` (0,55; 0,6) đv, CÙNG phía mặt với h1 (0; 0,5). h2 các nhân vật khác: mặc định (0,5; 0,6), c13/c22 (0,55; 0,4), c15 (0; 0,5), c24/c27/c28 (0,55; 0,6) | `hero.hand2` (design.js), súng thứ hai vẽ sau thân (nằm trên) |
| Cỡ đạn thường | `RGBullet.UpdateInfo`: đặt nút `b` = (size, size) CHỈ khi `updataInfoWithSize`; trường này không có trong typetree của `bullet.ab` → mặc định false (`RGBullet..ctor` không đặt). `RGBullet.ResetScale` chỉ được `LaserRain.SpecialAttackStart` gọi. `ExplodeEffectTrigger.ExplodeStart`: `scaleEffectByBulletSize` → nổ nhận size = bulletInfo.size × `sizeFactor` (không thì 1); `Explode.UpdateInfo`: `localScale = one × size` | thân đạn giữ cỡ prefab; `b.bsize` = size logic cho nổ. Bazooka/Ống Hỏa Tiễn (bullet_28, size 2): nổ ×2 bán kính; Trượng Phép Xua Đuổi nổ × 1,5 |

Bẫy vòng 2:

- `Katana` nằm trong namespace: gọi `sk_method.py RGScript.Weapon.Katana.CreateBullet`. `_forces` không có trong prefab,
  mảng dựng ở `.ctor` (`SZArrayNew(float[], 3)`, ghi [1] = 20, [2] = 15, [0] để 0).
- Katana không gọi `RGWeapon.ApplySelfForce` trực tiếp mà qua thunk (`[qua thunk]`), nên `--xref RGWeapon.ApplySelfForce`
  không liệt kê nó; phải đọc `CreateBullet`.
- `updataInfoWithSize`, `autoUpdateDirection`, `EnemyBulletStartOnTaken` có trong dump.cs nhưng KHÔNG có trong typetree
  bundle (bundle dựng trước mã). Trường vắng trong typetree = giá trị `.ctor`, không phải giá trị Inspector.
- Tìm chỗ lật mặt của nhân vật: `RGController.set_facing` đặt `transform_img.rotation = RotLeft/RotRight` (quay trục Y),
  không phải `localScale.x`. Pet/pháo đài tính `FixedAngle = Vector2.Angle(aim, (facing, 0))`, âm khi aim.y < 0
  (`DFBattery.FixedRotation`). Mã tính FixedAngle của chính người chơi chưa tìm thấy (không qua `set_FixedAngle`);
  hướng vệt chém mặt trái trên web theo ảnh gương [ĐO một phần].

### Nút đặc biệt và chiêu phụ vũ khí (IWeaponSpecial)

- Giao diện `IWeaponSpecial`: slot 0 `get_IsSpecial`, 1 `WeaponSpecial(bool isDown)`, 2 `get_SpecialMode` (dump.cs chỉ in 2
  slot, số slot đếm từ lệnh gọi trong `TriggerSpecialWeapon`/`FlushIcon`). 119 lớp cài; 56 lớp có súng trong web.
- `RGController.SpecialClick(isDown)` [ĐO]: `onUseSpecialButton` → `special_item` → thú cưỡi → vũ khí tay trước nếu
  `isSpecialWeapon` → `TriggerSpecialWeapon(isDown)` (gửi cả lúc nhả). Nút kỹ năng nhân vật là nút riêng (`OnSkillBtnClick`).
  `RGWeapon.FlushIcon` hiện `btn_special` khi `isSpecialWeapon`.
- Web (`actors.js`): kỹ năng khai báo `special()` thì nút về kỹ năng (khối của lead); không thì `SK.weaponSpecial(p)` →
  `WEAPON_SPECIALS[cls].press(G, p, w, isDown)`, theo dõi `I.down('special')` (vì `I.hit` đã bị dòng trên tiêu).
  HUD (`hud.js`, không thuộc phần này) mới chỉ hiện `btn_special` theo kỹ năng: nên hiện thêm khi `SK.weaponSpecial(p)`.
- **Gatling (`GunGatlin`) và Katana: `IsSpecial = RGWeapon.get_IsEvolvedWeapon`**. Bản thường không có chiêu phụ, không tích
  nhiệt — web đúng như cũ. Web chưa có tiến hoá: `w.evolved = true` bật chiêu.
  - Gatling: mỗi Attack ở tay h1 `heat += heatIncreasePerShot 3`, kẹp [0, 100], đầy thì quá nhiệt (= sẵn sàng; không chặn bắn,
    không tự nguội). Bấm: `PowerAttackSequence` 4 loạt (floor(duration 1 / delay 0,25)) × 4 viên `bullet_gatlin_power`
    (2 sát thương, 20 đv/s), không tốn năng lượng, chặn Attack trong 1 s.
  - Katana: năng lượng chiêu +1/giây tới 6. Bấm khi đầy: có mục tiêu thì lướt tới (khoảng cách + 0,5 đv), không thì 8 đv
    (BoxCast dừng ở tường), 40 đv/s; vệt `bulletsInfo[0]` ở tay; 0,15 s sau chém `sword_katana_slash` (24 sát thương) ở đích − 0,5 đv,
    `scale.x = dir.x < 0 ? 1 : −1` (quay về đường vừa lướt). `StartHitTrigger(dist/40 + 0,8)` web coi là bất tử [ƯỚC LƯỢNG].
- Chưa làm chiêu phụ của 54 lớp còn lại (danh sách: GunRevolver, Gun008, GunSoulCalibre, GunRocket, GunImplosion, GunMagicBow...);
  chưa kiểm lớp nào cũng khoá theo tiến hoá.

### Lớp tự viết (CUSTOM_FIRE trong actors.js)

`design.js` giữ bản ghi `w86` cho 7 lớp này dù `bulletsInfo` trống (`CUSTOM_CLS`); `fireEvent` gọi `CUSTOM_FIRE[cls]` thay
WEAPON_KINDS, trả `false` thì hoàn năng lượng (gốc chỉ `MakeConsume` khi thành công). Lính do vũ khí gọi: `SK.weaponAllies(G)`
(prop trong `G.props`, đỡ đạn địch, theo chủ 2 đv, quá 20 đv thì dịch chuyển).

- Gậy Tử Linh (`StaffOfNecromancy`): KHÔNG lấy xương của quái. Mỗi Attack 1 lính tại tay: `npc_skeleton_01` (8 máu, tốc 6,
  kiếm `sword_1_75` 4 sát thương), lần thứ 3 `ex_npc_skeleton_01` (16 máu, tốc 8, 6 sát thương); sống 15 s; chết để lại xác
  (`autoDestroyAfterDead = false`). Đủ 6 xác thì lần sau ra Thủ lĩnh `npc_skeleton_03` (28 máu, tốc 5, `bullet_hammer` 20 sát
  thương crit 40 cỡ 1,75 cách 1,5 đv, atk_cd 1,5 s, sống 20 s), xác bị gom. Dò 12 đv, đánh ở 2 đv, atk_cd 2 s.
  Bẫy: mã gốc so khoảng cách THẬT với `collectBoneRadius²` = 56,25 nên gom mọi xác trong phòng. Web dùng khung skeleton01 của quái
  cho mọi lính (Thủ lĩnh ×1,3) [ƯỚC LƯỢNG hình].
- Gậy Ảo Ảnh (`GunPhantom`): `count` 1 bản sao `npc_char_phantom` tại tay, tối đa `count`. Đủ rồi thì chỉ thay con đã chết/cầm
  vũ khí khác tên; không thay được thì không tốn năng lượng. Cầm bản sao vũ khí đeo sau lưng (không có/là chính gậy → tay không),
  máu 100 + giáp tối đa, không hết hạn. AI atk_cd 1 s, dò 12 đv. `PhantomSplitProcessor.damageFactor` 0,5 chỉ áp khi đạn bị tách
  (talent), không phải hệ số chung (skills.js đang dùng 0,5 cho bóng Sát Thủ — nên xem lại).
- Sổ Tay Chết Chóc (`GunDeadNote`): Attack (0,6667 s trong vòng clip 1 s) giết ngay mục tiêu tự ngắm nếu là quái thường đang
  thức (`RGEController.Dead`, không số), gắn `buff_deadnote` ở (0; 0,75) đv trên quái, −6. Trùm/đang ngủ: không làm gì, không
  tốn năng lượng. Không mục tiêu: phá thùng trong 1,5 đv, không tốn năng lượng.
- Cào Trúng Thưởng (`GunLottery`): theo cạnh bấm (không có sự kiện Attack), cost 0. ran 0..99; 0,6333 s đổi hình
  (`weapons_332_1` nếu ran < 50, không thì `_2`); +0,7 s phát thưởng: ≤0 130×coin_0 + 4×coin_1 + 4×coin_2, 1–5 20×coin_0,
  6–20 10×coin_0, 21–49 4×coin_1 + 3×coin_2, ≥50 `fx_fart`. coin_0/1/2 = 5/3/1 vàng (RGCoin.value). Xong thẻ bị bỏ.
  `bullet_93` trong bulletsInfo không dùng.
- Lá Phong Khổng Lồ (`PrequelStaff`): đánh thường `bullet_aoe_w374_2` = vòng 4 đv tâm cách nòng 6,06 đv (nút b 4,34 + 1,72),
  12 sát thương, mỗi quái một lần, sống 5 s. Chiêu phụ qua nút đặc biệt (component `BaseRevolver`, `coldDown` 7, sẵn sàng
  từ đầu): clip `w_staff_atk_special` Attack ở 0,3 s → `bullet_aoe_w374_1` vòng 6 đv tại nòng + 5 lá ở vòng 5 đv, trôi vào
  5 đv/s × 0,5 s, chờ 1 s, phóng 16 đv/s (8 sát thương, sống 7 s). Prefab lá `bullet_shoot_w374_3` không có trong SK_W86 → web
  vẽ bằng `bullet_0` [ƯỚC LƯỢNG hình]. Bản tiến hoá (`_3`: vòng lá thứ hai ở 4 s) chưa làm.
- Đạn Đạo Lỗ Đen (`GunBlackHoleMissile : GunChannel`): bấm = đồng hồ 0,8 s (`shoot_end_time`, thanh `reload_clip`); Attack đầu
  sinh lỗ `bullet_84` cách nòng 7 đv (gặp vật cản thì dừng), mỗi Attack −1; lỗ 1 sát thương / 0,5 s trong 3 đv, hút trong
  5,5 đv (PointEffector2D −375, web 3 đv/s [ƯỚC LƯỢNG]). Nhả: đủ 0,8 s → 1 tên lửa `bullet_89` (16, 32 đv/s, nổ `explode_scale`
  cỡ 1 — mã ép `scaleEffectByBulletSize = 1`, `sizeFactor = explosionSize/2`), chưa đủ → không bắn; lỗ ở lại 1,2 s.
- Sách Bóng Tối (`GunDarkBook`): sự kiện Attack rỗng. Bấm (hồi 0,7 s): lỗ `bullet_weapon_367` trên mục tiêu, không thì 6,5 đv
  phía trước, −2; giữ mỗi 1 s −2 (tới giai đoạn 3). Giai đoạn [0,3; 1,5; 3] s: 0,1 đv → 2,2 đv (2 / 0,5 s, hút 2,3 đv) → 3 cầu
  con quay 1,2 đv −200°/s, nổ cuối +8 → tự nhả. Nhả ở giai đoạn 1: nổ 0,5 đv 2 sát thương sau 0,8 s; từ giai đoạn 2: 0,75 +
  0,567 s rồi nổ 2,8 đv (2 hoặc 10), xoá đạn địch. Bán kính "× scale" chưa rõ có nhân size 2,75 — web ×1 [ƯỚC LƯỢNG].
- Phần tiến hoá của 7 lớp (xung lỗ đen, hấp đạn/cầu bóng, lá thứ hai...) chưa làm: web chưa có tiến hoá.

Bẫy vòng 2 (lớp tự viết):

- **build_w86 đè sự kiện Attack thật bằng 0,001 s** khi mô phỏng thấy clip "rỗng": Lá Phong có hai trạng thái chuyển nhau
  với exit time 0 trên clip không lặp → mô phỏng chuyền tức thì (hops < 8) → không đo được sự kiện → thêm sự kiện giả ở 0,001
  và ghi đè cả clip → rps 600. Unity chuyển ở hết clip. Sửa tạm ở runtime: `REAL_EV` (design.js, sự kiện thật 0,25 / 0,1944 s
  đọc từ weapon.ab) + `exitAt` coi x ≤ 0 trên trạng thái `syn` không lặp là x = 1. Chạy lại build_w86 thì nên sửa `simulate`
  theo cùng luật rồi bỏ `REAL_EV`. Cào Trúng Thưởng cũng mất sự kiện `OnSpecialAnimFinish` (0,6333 s) vì ATTACK_EV lọc bỏ.
- **Bắn đôi do số thực** trong `evWindow` (sự kiện trạng thái không lặp): cửa sổ (0,2333; 0,25] rồi (0,24999…; 0,2667] đều chứa
  0,25. Giờ hai đầu cùng dung sai 1e-9.
- Hình `weapons_332_1/_2` chưa có trong atlas chính: đã thêm regex `^weapons_332_[12]$` vào `tools/extra/weapons.json`, cần chạy
  `build_sk.py` (atlas chung) mới thấy đổi hình; trước đó `drawRig` giữ hình cũ.
- `test/soulknight-anim-weapon.js` ca "cung trước khi giương" thỉnh thoảng hỏng khi chạy liền sau test khác (0 lần vẽ w_bow0);
  chạy riêng lại thì đạt.

### Còn lệch (chưa sửa)

- Cuốc Sắt (GunInitMiner) nhát giữ `AttackHold` (lao 30) và vệt chém/đâm theo chế độ của GunSpearSword, GunThrowSword,
  GunZeusSpear (chỉ lao ở nhát cận chiến `SwordAttack` khi quái trong `meleeDistance`), Gun020, GunWindSword chưa làm.
- Chuỳ Thánh (`GunInitPaladin`): trường đo được, cách nội suy theo k là [ƯỚC LƯỢNG] tuyến tính.

### Bẫy mới

- `python` trên máy này là shim `.bat` của pyenv: tham số có `<`, `>`, `|` (tên coroutine `Gun007.<CreateBullet>d__37`,
  regex `A|B`) bị cmd nuốt. Gọi thẳng `~/.pyenv/pyenv-win/versions/3.8.10/python.exe`.
- `vfx.spawn({flip})` là gương trục X cục bộ (như quay mặt trái). Gương trục Y của Unity (`localScale.y = -1`) phải
  vẽ bằng `ang + π` kèm `flip` — `spawnBullet86(..., {flipY})` làm việc này.
