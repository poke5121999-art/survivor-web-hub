# Vũ khí + đạn thật 8.6 (`build_w86.py`)

Bóc số đo, hoạt ảnh và thân đạn của **361 vũ khí / 439 prefab đạn** Soul Knight 8.6 từ bundle
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

Cần sẵn: `D:\sk86-ref\decoded\*.json` (tools/config86), bundle 8.6 ở `D:\sk86-ref\...`
(qua `tools/vfx/abx.py`). `W86_LIMIT=20` chỉ bóc 20 súng đầu để thử nhanh.
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
- Lớp tự viết không mô phỏng (chỉ có hoạt ảnh bắn, sát thương 0/không đúng): Đạn Đạo Lỗ Đen,
  Lá Phong Khổng Lồ, Gậy Ảo Ảnh (gọi phân thân), Gậy Tử Linh, Sách Bóng Tối, Cào Trúng Thưởng, Sổ Tay Chết Chóc.
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

### Còn lệch (chưa sửa)

- **Lao người khi chém** (`RGWeapon.ApplySelfForce(dir, force)`): Gun015 (Nanh Rồng, Móng Sói…), GunInitAssassin,
  GunInitJoker, Katana, GunInitMiner (`force` 30), đấm (`atk_force` 15). Cần đọc `RGBaseController.GetForce` để biết
  lực tắt dần thế nào.
- **Quay mặt trái**: vệt chém có `localScale.x = facing`; web chưa lật theo hướng mặt (hộp trúng vẫn ở phía trước).
  Chưa rõ góc mà `BulletFactory`/`RGSword` đặt khi facing = −1.
- Gatling: `heatIncreasePerShot`/`maxHeat` thuộc chiêu phụ `WeaponSpecial` (nút riêng) — web không có nút này.
- Đạn thường vẫn bỏ `bulletsInfo.size` (trừ cỡ tụ lực ở trên); `RGBullet.ResetScale` chưa đọc.
- Chuỳ Thánh (`GunInitPaladin`): trường đo được, cách nội suy theo k là [ƯỚC LƯỢNG] tuyến tính.

### Bẫy mới

- `python` trên máy này là shim `.bat` của pyenv: tham số có `<`, `>`, `|` (tên coroutine `Gun007.<CreateBullet>d__37`,
  regex `A|B`) bị cmd nuốt. Gọi thẳng `~/.pyenv/pyenv-win/versions/3.8.10/python.exe`.
- `vfx.spawn({flip})` là gương trục X cục bộ (như quay mặt trái). Gương trục Y của Unity (`localScale.y = -1`) phải
  vẽ bằng `ang + π` kèm `flip` — `spawnBullet86(..., {flipY})` làm việc này.
