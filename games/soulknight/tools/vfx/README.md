# Hiệu ứng thật Soul Knight 8.6 (tools/vfx)

Bóc prefab hiệu ứng (tia lửa trúng đích, nổ, lửa nòng súng, vệt đạn, hào quang kỹ năng, hiệu ứng trùm, trạng thái
buff) từ bundle 8.6.0 ra dữ liệu + atlas riêng, và một runtime canvas mô phỏng lại ParticleSystem / hoạt ảnh sprite.

| Tệp | Việc |
|---|---|
| `tools/vfx/build_vfx.py` | lever: đọc bundle, xuất `data/sk-vfx.js` + `art/vfx/vfx_*.webp` |
| `tools/vfx/abx.py` | nạp nhóm bundle kèm phụ thuộc `.manifest`, giải con trỏ chéo tệp (không dùng chung `skrip.py`) |
| `js/vfx.js` | runtime `SK.vfx` |
| `tools/vfx/viewer.html` | lưới xem mọi hiệu ứng chạy lặp, lọc, chậm ×0.25, bảng chi tiết có phim từng 1/30 s + khung sprite gốc |
| `test/soulknight-vfx.js` | kiểm thử Playwright (ở gốc repo) |

Chạy lever (≈3 phút, nạp 94 bundle):

```sh
PYTHONIOENCODING=utf-8 python games/soulknight/tools/vfx/build_vfx.py
```

Nguồn: `D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles` (chỉ đọc). Tệp nháp, thống kê đầy đủ: `D:\sk86-ref\work\vfx\`
(`stats.json`, `build.log`).

## Hiệu ứng nằm ở đâu [ĐO]

Không đoán theo tên. Lever quét mọi gốc prefab trong `bullet.ab, common.ab, weapon.ab, hero.ab, levelcommon.ab,
artifacts2/{efx,res,bullet,weapon}.ab, boss/*.ab` (8 076 gốc) rồi:

1. **Phân loại theo MonoBehaviour trong cây**: `entity` (có `RoleAttribute*`, `Gun*`, `Pet*`, `Npc*`, UI…) bị bỏ;
   `explode` (`Explode*`, `DelayExplode`, `BulletGas`, `*DamageCarrier`); `bullet` (`Bullet0x`, `RGSword*`,
   `RGBulletTrigger`, `CGProjectile`, laser…); `buff` (`Buff*` hoặc tên `buff*`); còn lại `fx`.
2. **Đồ thị tham chiếu**: mọi con trỏ trong MB trỏ sang một gốc khác (10 329 cạnh). Gốc là đích của trường "hiệu ứng"
   (`hit_object`, `creation`, `explode_obj`, `smoke_object`, `hitFx`, `VfxCreator.prefab`, `buff`, `deadParticle`,
   `effectPrefab`…; 878 gốc) được xuất trọn kể cả khi nó là "đạn" (vd `Fire2` tạo bởi `ExplodeEffectTrigger.creation`).
3. Đạn còn lại chỉ xuất phần **vệt** (nút có ParticleSystem / TrailRenderer / LineRenderer) — loại `trail`.
4. **Lửa nòng**: súng không có prefab lửa nòng riêng. Nút con `gun_point` (SpriteRenderer) được clip bắn bật
   `m_Enabled` trong chốc lát. Lever gom 465 súng về 15 hiệu ứng `muzzle_<sprite>` + bảng `weapons`.

Kết quả lần chạy gần nhất: **2 599 hiệu ứng** — common.ab 1 511, bullet.ab 773, weapon.ab 153, artifacts2/efx 56,
artifacts2/res 6, hero.ab 6, boss/* 79 (21 bundle trùm), muzzle 15. Theo loại: fx 1 227, trail 656, explode 519,
buff 182, muzzle 15. 197 prefab trùng tên giữa các bundle (common.ab 8.6 chép lại nhiều prefab của bullet.ab) được gộp,
giữ bản gặp trước theo thứ tự bundle ở trên. Hero skill: phần lớn nằm ở common.ab (`c03_show_effect*`, `skill_*`,
`*_skill*`), hero.ab chỉ có 6.

## Dạng dữ liệu `window.SK_VFX`

```js
{
  v: '202609291530', ppu: 16,
  layers: ['Default','BackGround','Floor','Shadow','Wall','Character','WallFont','WallTop','Door','Effect','UI'],
  atlas: { pages: ['art/vfx/vfx_0.webp', ...], f: { name: [page, x, y, w, h, ax, ay, s?] }, smooth: [name, ...] },
  effects: { <tên prefab>: Effect },
  refs:    { <tên prefab nguồn>: { 'Lớp.trường': tên hiệu ứng | [tên, ...] } },
  weapons: { <tên súng>: { muzzle: 'muzzle_bullet_4', at: [x, y] /* đơn vị Unity, gốc súng */, show: 0.05 } },
  stats:   { ... số liệu lần xuất ... }
}
```

- Khung atlas: `(ax, ay)` là pivot thật tính từ góc trên-trái ảnh; `s` (vắng = 1) là hệ số px: vẽ ảnh ở `s` lần kích
  thước (sprite PPU ≠ 16, hoặc ảnh HD đã thu nhỏ). `smooth` = khung có texture lọc Bilinear/Trilinear trong Unity
  (glow mịn) → runtime bật `imageSmoothing`; còn lại vẽ pixel sắc.
- `layers` [ĐO `data.unity3d` TagManager]: chỉ số = trường `L` của renderer.

`Effect`:

```js
{ cat: 'fx'|'explode'|'buff'|'trail'|'muzzle', src: 'common.ab', dur: 1.0, loop?: 1, u?: ['ps:noise', ...],
  nodes: [Node], anims?: [Anim] }
```

- `dur`: `RGAutoDestory.d_time` nếu có (> 0), không thì dài nhất của (hoạt ảnh không lặp, delay + duration + tuổi
  thọ hạt lớn nhất). `loop: 1` = có phần lặp và không tự huỷ → game phải `stop()`/truyền `dur`.
- `u`: thứ không mô phỏng được (xem bảng dưới); có cả logic chơi (`mb:Explode`, `clip:type58` = bật collider) chỉ để biết.

`Node` (thứ tự cây, cha luôn đứng trước):

| Trường | Nghĩa |
|---|---|
| `n`, `p` | tên, chỉ số cha (−1 = gốc) |
| `T` | `[px py pz qx qy qz qw sx sy sz]` local Unity (y lên); vắng = đơn vị |
| `off` | GameObject tắt lúc đầu (clip có thể bật) |
| `life` / `die` | `RGAutoDestory` ở gốc / ở nút con (nút tắt sau `die` giây) |
| `spin` | độ/giây quanh Z (`ObjectRotate`, `AutoRotate`) |
| `sr` | SpriteRenderer `{f, L, o?, c?[r,g,b,a], fx?, fy?, b?:'add'|'mul', off?}` |
| `sa` | ChillyRoom `SpriteAnimation` `{f:[khung], fps, mode: 0 lặp / 1 một lần / 2 qua lại, hide?, rnd?, off?}` |
| `ps` | ParticleSystem (dưới) |
| `tr` | TrailRenderer `{time, minD, w:{c,m}, g, tex, blend?, tint?, L, o?}` |
| `ln` | LineRenderer `{pts:[[x,y]], world, loop, w, g, tex, L, o?}` |

`ps` (đơn vị Unity, giây, radian — y như serialize của Unity):

| Trường | Module |
|---|---|
| `dur loop prewarm delay simSpeed world max` | main (`world` = simulationSpace World; `max` bị chặn 200) |
| `life speed size sizeY color rot flipRot grav` | main start* + gravityModifier (× 9.81 [ĐO PhysicsManager]) |
| `rate rateDist bursts:[[t, count, cycles, interval, prob]]` | emission |
| `shape:{t, r, ang?, arc?, len?, thick?, pos?, m?(3×3), rndDir?, sphDir?, donut?}` | shape (`t` = enum ParticleSystemShapeType) |
| `vel:{x,y,z, world?, radial?, orbZ?, mul?}` | velocityOverLifetime |
| `limit:{mag | x,y, damp, drag?}` | limitVelocityOverLifetime |
| `force:{x,y,z, world?}` | forceOverLifetime |
| `col` / `sol` `solY?` / `rol` | colorOverLifetime / sizeOverLifetime / rotationOverLifetime |
| `uv:{tx, ty, fot, sf?, cyc?, anim?, row?, rowMode?, time?, fps?, mode?, spr?}` | textureSheetAnimation (lưới hoặc danh sách sprite) |
| `tex blend? tint? L o? rm? lenScale velScale maxSize? flip?` | renderer: texture từ `_MainTex`; `blend` theo tên shader / `_DstBlend`; `tint` = `_TintColor`×2 (shader Particles cổ) hoặc `_Color`; `rm` = renderMode (1 kéo dài) |

MinMaxCurve: số (hằng) | `{a, b}` (ngẫu nhiên giữa hai hằng) | `{c: keys, m}` (đường cong × m) | `{c, c2, m}` (ngẫu
nhiên giữa hai đường cong). `keys = [[t, v, inSlope, outSlope]]`, slope `null` = bậc thang (Unity Constant).
MinMaxGradient: `[r,g,b,a]` | `{g}` | `{a, b}` (hai màu) | `{g, g2}` | `{g, rnd:1}` (màu ngẫu nhiên từ gradient).
Gradient: `{c: [[t, r, g, b]], a: [[t, a]], fixed?}`.

`Anim` (Animator trên nút `n`):

```js
{ n: 0, clips: [{ name, len, loop, spd, curves: [{ n: nút, k, s }] }], seq: [chỉ số clip], st?: { tênTrạngThái: chỉ số } }
```

- `seq` = chuỗi trạng thái mặc định (chuyển theo exit time). Rỗng khi trạng thái mặc định không có clip — script gọi
  `Play` (vd `explode_s`: `st = {explode_small, explode_big, explode_nuclear}`) → runtime chạy `o.state` hoặc clip 0.
- `k`: `px py pz qx qy qz qw sx sy sz ex ey ez` (Transform), `on` (GameObject), `en` (renderer bật), `cr cg cb ca`
  (màu SpriteRenderer), `spr` (sprite). `s` float: `[t, v]` (hằng) hoặc `[t, c0, c1, c2, c3]` = đa thức
  `((c0·d + c1)·d + c2)·d + c3` với `d = thời gian − t` (dạng streamed gốc của Unity). `s` sprite: `[t, tênKhung|null]`.

`refs` ví dụ: `refs.bullet_1 = {'RGBulletTrigger.hit_object': 'hit_orange'}`,
`refs.boss02 = {'BossAI02.bullet01': 'bullet_e_8', ...}`. Trường hay gặp: `RGBulletTrigger.hit_object` (tia trúng),
`ExplodeEffectTrigger.creation` (nổ/vùng tạo khi đạn vỡ), `RGBTEnergy.explode_obj`, `Explode.smoke_object`,
`RGBulletBuffTrigger.buff` (hiệu ứng trạng thái lên mục tiêu), `VfxCreator.prefab`, `RGBox.explode` (thùng vỡ),
`CGProjectile.hitFx`. Toàn bộ trong `stats.refFields`.

## Runtime `SK.vfx`

```js
const h = SK.vfx.spawn(G, 'explode_s', x, y, { ang, scale, flip, follow: obj, dx, dy, tint: [r,g,b,a],
                                              state: 'explode_big', layer: 'ground'|'top', dur, seed });
h.stop();   // ngừng phát, ẩn sprite, để hạt còn lại chết dần
h.kill();   // xoá ngay
SK.vfx.update(G, dt); SK.vfx.draw(ctx, G, 'ground'|'top'|undefined); SK.vfx.clear(G);
SK.vfx.hitFor('bullet_1') // 'hit_orange'   explodeFor(bullet)   muzzleFor('weapon_001') // {muzzle, at, show}
SK.vfx.load()             // tải hết trang atlas (bình thường tải lười theo khung cần)
```

- Toạ độ `x, y` là px thế giới game; `ang` (radian, chiều kim đồng hồ trên màn hình) xoay trục +X của hiệu ứng;
  `follow` = vật `{x, y[, ang]}` hiệu ứng bám theo (vệt đạn, buff trên quái); vật có `dead`/`gone` thì hiệu ứng `stop()`.
- Instance nằm trong `G.vfx`. Lặp (`def.loop`) thì sống tới `stop()` hoặc `dur`.
- Lượt vẽ tự chia theo sorting layer thật: `BackGround/Floor/Shadow` → `'ground'` (dưới nhân vật), còn lại `'top'`;
  `o.layer` ép cả hiệu ứng.
- Trần: 2 000 hạt tổng, 200 hạt mỗi hệ, 400 instance. Đo trong kiểm thử: 60 vụ nổ nặng nhất cùng lúc trên khung
  400×225 chạy 44–48 fps với đủ 2 000 hạt (Chromium headless).
- RNG riêng (sfc32 theo `seed`), không đụng `SK.rand` của ván chơi.

Móc vào game **không sửa tệp chung**: `vfx.js` bọc `SK.updateFx` và `SK.drawFx` (actors.js) — game.js gọi hai hàm này
mỗi bước / mỗi khung — và xoá hiệu ứng ở `SK.on('stageEnter')`. Chỉ cần hai thẻ script sau `actors.js`:

```html
<script src="data/sk-vfx.js?v=..."></script>
<script src="js/vfx.js?v=..."></script>
```

## Hỗ trợ / chưa hỗ trợ [ĐO số hiệu ứng dùng]

Mô phỏng: main (start*, gravity, delay, prewarm, simulationSpace local/world, maxParticles), emission (rate, rate theo
quãng đường, bursts có chu kỳ + xác suất), shape (sphere, hemisphere, cone, cone volume, box, circle, edge, donut,
rectangle; radiusThickness, arc, randomDirection, sphericalDirection, vị trí/xoay/thước shape), velocity (+radial,
orbital Z, speedModifier), limitVelocity (dampen, drag), force, color/size/rotation over lifetime, textureSheet (lưới,
một hàng, danh sách sprite, theo fps), renderer billboard + kéo dài theo vận tốc, blend cộng / nhân. SpriteRenderer
(màu, lật, blend), SpriteAnimation, clip Animator (Transform, bật tắt, màu, sprite; chuỗi trạng thái), TrailRenderer
và LineRenderer (vẽ nét màu, bỏ texture), `RGAutoDestory`, `ObjectRotate`/`AutoRotate` quanh Z.

Trong 2 599 hiệu ứng, **700** có ít nhất một thứ ảnh hưởng hình mà runtime bỏ qua (157 loại). Nhiều nhất:

| Thứ bỏ qua | Số hiệu ứng | Ghi chú |
|---|---|---|
| ParticleSystem renderMode Mesh | 92 | bỏ hệ đó (cỡ tính theo mesh 185–250, vẽ billboard phủ kín màn); 22 hiệu ứng chỉ có mesh nên không xuất |
| noise | 89 | hạt bay thẳng hơn bản gốc |
| collision | 66 | hạt xuyên tường |
| `DOTweenAnimation` | 57 | tween do script |
| inheritVelocity | 55 | |
| rotation3D | 47 | chỉ dùng trục Z |
| shape arc mode Loop/PingPong | 41 | coi như Random |
| subEmitters | 27 | |
| SpriteMask / maskInteraction | 25 / 21 | |
| `VfxCreator` (sinh hiệu ứng con lúc chạy) | 23 | tên hiệu ứng con có trong `refs` |
| rotation separateAxes | 21 | |
| trails module (của ParticleSystem) | 20 | |
| shader khúc xạ (`HitDistortion`, `Sprites/Distortion`, `DistortSpin`, `TwistShader`…) | nút bị bỏ hẳn | |

Danh sách đủ: `stats.unsupportedVisual` trong `data/sk-vfx.js`; logic chơi bị bỏ (sát thương, collider, âm thanh):
`stats.ignoredLogic`. Hệ hạt không có `rate`/`bursts` (80+ hiệu ứng) chỉ phát khi script gọi `Emit` — runtime không phát.

## Dung lượng

18 trang WebP không mất dữ liệu, **5,86 MB** (5 978 khung); `data/sk-vfx.js` 3,7 MB. Cách giữ nhỏ:

- Sprite PPU > 16 (art HD) thu về đúng độ phân giải màn hình (1 đơn vị = 16 px); sprite > 256 px và texture hạt
  > 128 px thu nhỏ, bù bằng hệ số `s` [ƯỚC LƯỢNG ngưỡng].
- WebP lossless nhỏ hơn PNG `optimize` ~25% [ĐO trên 15 trang]. Lượng tử 256 màu còn 1,8 MB nhưng vỡ gradient glow — bỏ.
- Ảnh trùng (cùng điểm ảnh + pivot) chỉ lưu một lần.

## Bẫy đã sập

- **Chỉ số đường cong trong clip**: đếm cộng dồn theo đúng thứ tự `genericBindings`, PPtr (sprite) chiếm một ô
  **xen giữa** chứ không nằm sau mọi float. `m_StreamedClip.curveCount` không tính PPtr; hằng số là các ô cuối.
  `skrip.py` giả định PPtr đứng sau float — đúng với clip chỉ có sprite, sai với `explode_big` (sprite ở ô 8, hằng ở ô 9).
- Transform trong clip chiếm 3 (vị trí, thước, euler) hoặc 4 (quaternion) ô.
- Trạng thái mặc định của Animator có thể rỗng (script `Explode` chọn `explode_small|big|nuclear`). Lấy "chuỗi mặc
  định" thôi thì mất hết hoạt ảnh nổ.
- `RGAutoDestory.d_time = -1` nghĩa là không tự huỷ.
- `m_SortingLayer` là **chỉ số** lớp (Effect = 9), `m_SortingLayerID` mới là id.
- Texture cho renderMode kéo dài (`#triangle_soft`, `#circlestretchy`) vẽ ngang, đầu nhọn bên trái: trục X của ảnh
  theo vận tốc, mép trái đi trước.
- Shader Particles cổ nhân `2 × _TintColor` (mặc định 0.5 → ×1).
- SpriteAnimation `mode` [ƯỚC LƯỢNG từ dữ liệu]: 1 đi kèm `hideSpriteWhenFinished` ở 103/142 chỗ → 1 = một lần,
  0 = lặp, 2 = qua lại.
- mulberry32 lấy mẫu theo bước cố định (mỗi hạt rút ~14 số) cho dãy lệch hẳn một phía — khói nổ bay cùng hướng.
  Runtime dùng sfc32. (`SK.rand` trong engine.js cũng là mulberry32.)
- `common.ab` 8.6 chứa bản sao của nhiều prefab `bullet.ab` (cùng tên, khác CAB); tra theo tên, đừng theo cặp CAB.
- GameObject tắt thì Unity xoá hạt của nó; giữ lại hạt "đóng băng" làm hiệu ứng không bao giờ tắt.

## Trang xem

`http://localhost:8811/games/soulknight/tools/vfx/viewer.html` — tham số URL: `q` (regex tên), `cat`, `src`,
`zoom`, `slow=1`, `page`, `per`, `sel=<tên>` (mở bảng chi tiết), `st=<trạng thái>`. Hiệu ứng `trail` / có
TrailRenderer / rateOverDistance chạy vòng tròn để thấy vệt. Bảng chi tiết: tạm dừng, bước 1/60 s, xoay góc, chọn
trạng thái Animator, "được tham chiếu bởi", phim 1/30 s và mọi khung atlas hiệu ứng dùng để so với sprite gốc.

## Kiểm thử

```sh
node test/soulknight-vfx.js   # cần python -m http.server 8811 ở gốc repo
```

14 mục: atlas nạp đủ, lưới vẽ ra điểm ảnh, không lỗi trang; `hit_yellow` phát hạt ngay và tắt theo tuổi thọ +
`RGAutoDestory`; toàn bộ 2 599 hiệu ứng chạy không ném lỗi, tự tắt, hệ có rate/bursts đều phát, bộ đếm hạt về 0;
hiệu năng 60 vụ nổ; trong game (nạp script bằng `addScriptTag` khi `index.html` chưa có thẻ) hiệu ứng sinh, cập
nhật qua vòng lặp thật và tắt hết. Ảnh: `%TEMP%/soulknight-vfx/`.
