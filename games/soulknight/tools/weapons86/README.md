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
