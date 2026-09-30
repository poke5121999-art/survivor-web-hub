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
  nodes: [Node], anims?: [Anim], end?: { after, state, spr?, L? } }
```

- `end` (chỉ `BuffIce*`, 15 hiệu ứng) [ĐO `sk_method.py BuffIce.BuffEnd`]: hết buff (`stop()` hoặc hết `dur`) thì tách
  khỏi vật bám, sprite gốc đổi sang `spr` (`ice_end`, băng vỡ), lớp `L` (Character), đứng yên `after` = 2 s
  (`Invoke("Disappear", 2.0)`) rồi chạy trạng thái `state` (`disappear`, mờ 1 s) và tắt.

- `dur`: `RGAutoDestory.d_time` nếu có (> 0), không thì dài nhất của (hoạt ảnh không lặp, delay + duration + tuổi
  thọ hạt lớn nhất). `loop: 1` = có phần lặp và không tự huỷ → game phải `stop()`/truyền `dur`.
- `u`: thứ không mô phỏng được (xem bảng dưới); có cả logic chơi (`mb:Explode`, `clip:type58` = bật collider) chỉ để biết.

`Node` (thứ tự cây, cha luôn đứng trước):

| Trường | Nghĩa |
|---|---|
| `n`, `p` | tên, chỉ số cha (−1 = gốc) |
| `T` | `[px py pz qx qy qz qw sx sy sz]` local Unity (y lên); vắng = đơn vị |
| `off` | GameObject tắt lúc đầu (clip có thể bật; game bật nhánh skin/nguyên tố bằng `h.nodes[i].on = true`) |
| `life` / `die` | `RGAutoDestory` ở gốc / ở nút con (nút tắt sau `die` giây) |
| `spin` | độ/giây quanh Z (`ObjectRotate`, `AutoRotate`) |
| `sr` | SpriteRenderer `{f, L, o?, c?[r,g,b,a], fx?, fy?, b?:'add'|'mul'|'screen', tint?, off?}` — `tint` = màu vật liệu (dưới) |
| `sa` | ChillyRoom `SpriteAnimation` `{f:[khung], fps, mode: 0 lặp / 1 một lần / 2 qua lại, hide?, rnd?, off?}` |
| `ps` | ParticleSystem (dưới) |
| `tr` | TrailRenderer `{time, minD, w:{c,m}, g, tex, blend?, tint?, tm?, st?, L, o?, noEmit?}` |
| `ln` | LineRenderer `{pts:[[x,y]], world, loop, w, g, tex, blend?, tint?, tm?, st?, L, o?}` |

`tm` = `LineParameters.textureMode` (vắng 0 Stretch, 1 Tile, 2 DistributePerSegment, 3 RepeatPerSegment, 4 Static);
`st` = `[tileX, tileY, offX, offY]` của `_MainTex` trong vật liệu (vắng = 1, 1, 0, 0).

`ps` (đơn vị Unity, giây, radian — y như serialize của Unity):

| Trường | Module |
|---|---|
| `dur loop prewarm delay simSpeed world max scl?` | main (`world` = simulationSpace World; `max` bị chặn 200; `scl` = scalingMode 1 Local / 2 Shape, vắng = Hierarchy) |
| `life speed size sizeY color rot flipRot grav` | main start* + gravityModifier (× 9.81 [ĐO PhysicsManager]) |
| `rate rateDist bursts:[[t, count, cycles, interval, prob]]` | emission |
| `shape:{t, r, ang?, arc?, len?, thick?, pos?, m?(3×3), rndDir?, sphDir?, donut?}` | shape (`t` = enum ParticleSystemShapeType) |
| `vel:{x,y,z, world?, radial?, orbZ?, mul?}` | velocityOverLifetime |
| `limit:{mag | x,y, damp, drag?}` | limitVelocityOverLifetime |
| `force:{x,y,z, world?}` | forceOverLifetime |
| `col` / `sol` `solY?` / `rol` | colorOverLifetime / sizeOverLifetime / rotationOverLifetime |
| `uv:{tx, ty, fot, sf?, cyc?, anim?, row?, rowMode?, time?, fps?, mode?, spr?, rw?}` | textureSheetAnimation (lưới hoặc danh sách sprite; `rw` = bề rộng `m_Rect` từng sprite ở 16 px/đv, chỉ xuất khi khác bề rộng khung atlas vì ảnh bóc là `textureRect` cắt sát — 384 hệ) |
| `tex blend? tint? L o? rm? lenScale velScale maxSize? flip?` | renderer: texture từ `_MainTex` (không gán → `#white`, ô vuông đặc; texture dựng sẵn ngoài bundle → `#Default-Particle`); `blend` theo trạng thái `Blend` của shader (dưới); `tint` = `_TintColor`×2 **không kẹp** (Particles cổ) hoặc `_Color`; `rm` = renderMode (1 kéo dài) |

Vật liệu [ĐO]: `blend` đọc `m_ParsedForm.m_SubShaders[0]` → pass thường đầu tiên (`m_Type` 0, bỏ GrabPass) →
`m_State.rtBlend0.srcBlend/destBlend`; giá trị có tên (`_SrcBlend`) thì lấy float của vật liệu. `dst One` → `add`
(`src OneMinusDstColor` → `screen`), `One OneMinusSrcColor` → `screen`, `DstColor Zero` → `mul`, `One
OneMinusSrcAlpha` + tên có "add" (Hovl) → `add` [ƯỚC LƯỢNG], còn lại `alpha`. Shader không nằm trong bundle
(Sprites-Default…) thì đoán theo tên như trước. `tint` của SpriteRenderer chỉ xuất với shader Particles cổ
(`Additive`, `Alpha Blended`, `Anim Alpha Blended`) và `Sprites/Default`; shader riêng có `_Color` thì ghi
`u: sr:matColor` và không nhuộm (vd `boss_lvbu_dead_zone` có `_Color` đen, không rõ shader dùng thế nào).

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
- Vị trí gốc của prefab bị bỏ (Instantiate ghi đè), trừ `cat: 'buff'` có x ≈ 0 (< 0.5 đv) [ƯỚC LƯỢNG]: buff gắn làm con
  của nhân vật giữ độ lệch dọc (khiên `0,1`). 348 hiệu ứng có gốc lệch, tới 7.32 đv (`explode_energy*`) — trước đây vẽ
  lệch 117 px khỏi điểm nổ.
- Animator có trạng thái mặc định rỗng: `o.state` chọn trạng thái; không truyền thì chạy clip 0, **trừ** khi clip 0
  chỉ là trạng thái `disappear` (băng: đứng yên tới lúc hết buff).
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

## Đo khoảng cách với Unity (2026-09-30)

Ba công cụ, chạy ở gốc repo:

```sh
node games/soulknight/tools/vfx/play_count.js 12 %TEMP%/vfx-play.json --give   # chơi thật ~4 phút, đếm SK.vfx.spawn
node games/soulknight/tools/vfx/gap_report.js --play %TEMP%/vfx-play.json --top 40
PYTHONIOENCODING=utf-8 python games/soulknight/tools/vfx/probe.py hit_orange common.ab   # thông số gốc một prefab
```

- `play_count.js`: bọc `SK.vfx.spawn`, 17 lượt (12 nhân vật + 3 trùm + 2 phòng màn 2/3), giữ J, K mỗi 3,2 s; `--give`
  đổi vũ khí mỗi 4 s (không có thì chỉ thấy súng đầu). Ra `{counts, from (tệp:dòng gọi), perRun}`.
- `gap_report.js`: mỗi hiệu ứng (kể cả thân đạn `W:*`) → danh sách khoảng cách, cộng theo số lần sinh khi chơi.
  `fixed:*` = đã sửa (giữ để biết bao nhiêu hiệu ứng được lợi), `info:*` = không phải lỗi. `W:*` không mang vật liệu
  nên luôn báo `—` dù có thể sai.
- `probe.py`: cây nút, vật liệu (shader, texture, `_TintColor`/`_Color`, `_SrcBlend`/`_DstBlend`), module ParticleSystem.

Đo được [ĐO, 2 lượt chơi: 2 941 lần sinh có `--give`, 2 100 không]: `hit_*` (tia trúng) ≈ 50 % mọi lần sinh, thân đạn
`W:*` ≈ 35 %, nổ (`explode_*@explode_small|big`) ≈ 5 %, rồi `smoke`, `muzzle_*`, kỹ năng (`effect_c1_skill`…); buff
trên quái hiếm (< 1 %) khi chơi súng đầu. Đã sửa, xếp theo lần thấy:

1. **Hạt tia trúng là ô vuông đặc**, không phải đốm tròn mờ: renderer `hit_*` dùng `Sprites-Default` không gán
   `_MainTex` → Unity dùng texture trắng. 852 hệ (556 hiệu ứng) chuyển từ `#Default-Particle` sang `#white`.
2. **Glow ×2**: `light` của nổ dùng `Legacy Shaders/Particles/Additive` với `_TintColor (1,1,1,1)` = ×2 màu lẫn
   alpha; SpriteRenderer trước đây bỏ hẳn tint vật liệu, hạt thì kẹp ở 1. 480 SpriteRenderer có `tint [2,2,2,2]`.
3. **Blend theo shader**: `Unlit/RGSEffectLight` (One One) bị vẽ alpha thành ô tối (`fighter_0_angry_effect`);
   `Mobile/Particles/Alpha Blended` có `_DstBlend` cũ = 1 bị vẽ cộng.
4. **scalingMode** (`hit_*`: Shape): `o.scale` chỉ nới vùng phát, cỡ hạt giữ nguyên. 1 104 hệ Local/Shape.
5. **Gốc prefab lệch** bị bỏ (trên). 6. **`buff_ice`** đứng yên suốt lúc đóng băng rồi `ice_end` (trên; trước đây
   mờ hết trong 1 s đầu).
7. **Texture sheet chế độ Sprite một khung** vẽ đúng sprite (trước: texture vật liệu → ô trắng,
   `arcaneknight_0_skill1_add_armor_fx`). 8. Nút tắt sẵn của prefab đạn (`cat: trail`, 83 hiệu ứng) không còn bị bật
   hết (`warliege_roll` vẽ nhánh tuyết thành ô trắng).

### Vòng 2 (2026-09-30) [ĐO lượt chơi 12 s × 17 lượt `--give`: 2 282 lần sinh]

Gap report xếp lại theo lần sinh: chế độ Sprite 569 hiệu ứng / 73 lần sinh > texture vệt 365 / 19 > hạt Mesh 98 / 5 >
texture LineRenderer 72 / 1 > noise 92 / 0, collision 71 / 0.

9. **Cỡ hạt chế độ Sprite = bề rộng rect của sprite**, cao theo tỉ lệ ảnh, hạt đặt ở **pivot**. Đo trên 610 hệ pixel
   art (cỡ trung bình × thước, so với kích thước gốc của sprite): luật "rộng = cỡ" lệch trung vị |log2| 0,47 (113 hệ
   sprite không vuông), "cạnh dài = cỡ" 0,81, "cao = cỡ" 1,19, "kích thước gốc × cỡ" 1,00. Ca rõ nhất:
   `bullet_weapon_362_lightning/VerticleStrike` sprite 16×64 px cỡ 1 → đúng 16 px rộng (luật cạnh dài: tia sét 4 px);
   `lancer_spear/lightning` cỡ 3D (1.5, 1) → 24 × 64 px, cao đúng 64 px gốc; `rain_full_screen` 1×8 px cỡ 0.04 (luật
   cạnh dài: 0,08 px, không thấy). `fighter_0_angry_effect` (cỡ 4, sprite 128 px HD) → 64 px, hợp lý.
10. **TrailRenderer / LineRenderer là dải có texture** (`drawStrip`): tứ giác mỗi đoạn nối pháp tuyến trung bình ở đỉnh,
    chia hai tam giác affine + clip; bề rộng / màu theo phần quãng đường từ đầu; `textureMode` + tiling `_MainTex`.
    Đầu vệt u = 0 [ĐO: `#redtrail`, `#bluetrail`, `#yellowtrail`, `#lowres_modular_trail` sáng ở cột 0 rồi tối dần tới
    0, gradient alpha của chúng hằng 1 — texture mang phần mờ]. Nét round-cap cũ đậm lên ở mỗi khớp khi vệt trong mờ.
11. **Vệt của vật chậm**: runtime cũ dời đỉnh cuối theo vật nên vật đi < `minVertexDistance` mỗi khung chỉ có 1 đỉnh,
    vệt không bao giờ hiện. Nay đỉnh cố định + đỉnh đầu `tr.head` luôn ở vị trí hiện tại (như Unity).
12. **`Fire` (vòng lửa trứng rồng)**: shader `Fair/Unlit/WarlockRing` là SrcAlpha OneMinusSrcAlpha [ĐO rtBlend0] nhưng
    sprite `warlock_0_skill_0_effect_3` đục hoàn toàn (1 681/1 681 điểm ảnh alpha 255, 1 262 đen tuyền) → alpha do shader
    tính từ mặt nạ. Vẽ alpha thì ra ô đen (ảnh chụp riêng `Fire`: ô đen 41 px × thước); lever nay xuất `b: 'add'`, `tint`
    = `_Color` [ƯỚC LƯỢNG cách tính alpha]. `additive()` trong `js/bosses.js` đúng về kết quả (nền đen phải biến mất) và
    giờ thành thừa (chỉ đổi khi `!sr.b`).

Không phải lỗi: **`ice_explode` chớp đen 0,0667–0,1333 s** là thật. Clip `captain_ice_explode` đặt `m_Color.rgb`
(crc32 `m_Color.r` = 2526845255, đúng binding) của SpriteRenderer `Sprites-Default` về 0 bằng khoá bậc thang
(`[0,1] [0.0667,0] [0.1333,1]`); cùng đường cong ở 40 clip nổ `explode_big` (`explode_s`, `explode_ice`…) — khung
"impact" đen của vụ nổ lớn.

Không làm (gap report nói không đáng): hạt Mesh (5/2 282 lần sinh: `arcaneknight_0_skill_0_beam|unleash_fx`,
`skill_0_wave2`), noise và collision (0 lần sinh).

Còn lệch (chưa sửa): thân đạn `W:*` (lever `sk-weapons86`, không ở đây) thiếu tint ×2 của glow `texiao_01`; cỡ hạt
chế độ Sprite khi thước nút không đều (`VerticleStrike` Local (2, 4)): runtime lấy trung bình nhân; renderMode kéo dài
với sprite vẫn vẽ ô giữa tâm; màu vệt phẳng trong mỗi đoạn (Unity nội suy theo đỉnh); `tint > 1` chỉ kẹp màu, texel tối không sáng thêm
(109 hiệu ứng); `limitVelocity.dampen` áp theo khung hình, Unity độc lập khung hình [ƯỚC LƯỢNG]; `hit_red` "to quá"
(báo từ bên kỹ năng): đo khớp prefab (sprite 16×16 px PPU 16 = 1 đv, hạt 0.4 đv, thước gốc 1) — nếu vẫn lệch thì ở
phía gọi (`RGBulletTrigger.fixedHitScale`: tia trúng nhân thước đạn).

## Hỗ trợ / chưa hỗ trợ [ĐO số hiệu ứng dùng]

Mô phỏng: main (start*, gravity, delay, prewarm, simulationSpace local/world, maxParticles), emission (rate, rate theo
quãng đường, bursts có chu kỳ + xác suất), shape (sphere, hemisphere, cone, cone volume, box, circle, edge, donut,
rectangle; radiusThickness, arc, randomDirection, sphericalDirection, vị trí/xoay/thước shape), velocity (+radial,
orbital Z, speedModifier), limitVelocity (dampen, drag), force, color/size/rotation over lifetime, textureSheet (lưới,
một hàng, danh sách sprite, theo fps), renderer billboard (chế độ Sprite: rộng theo rect, pivot) + kéo dài theo vận tốc, blend cộng / nhân. SpriteRenderer
(màu, lật, blend), SpriteAnimation, clip Animator (Transform, bật tắt, màu, sprite; chuỗi trạng thái), TrailRenderer
và LineRenderer (dải texture, widthCurve, colorGradient, textureMode, tiling; không có cap/corner vertices), `RGAutoDestory`, `ObjectRotate`/`AutoRotate` quanh Z.

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
- Vật liệu **không gán** `_MainTex` ≠ texture dựng sẵn: không gán → shader lấy "white" (ô vuông đặc); gán tới texture
  nằm ngoài bundle (Default-Particle) → đốm tròn. Gộp hai trường hợp làm mọi tia trúng thành đốm mờ.
- Tên shader / `_DstBlend` của vật liệu không đáng tin: vật liệu giữ thuộc tính của shader trước (`_TintColor`,
  `_DstBlend = 1` trên `Mobile/Particles/Alpha Blended`). Đọc `rtBlend0` của shader; pass đầu có thể là GrabPass
  (`Particles/Standard Unlit`: One Zero) — lấy pass `m_Type 0`, không thì 326 hệ cộng bị đổi sai sang alpha.
- `_TintColor` ×2 phải để runtime kẹp **sau** khi nhân: kẹp ở lever (`min(1, 2c)`) thì mọi glow additive tối một nửa.
- Chế độ Sprite của texture sheet chỉ có một sprite thì `nFrames = 1`: đừng rơi về texture vật liệu.
- Canvas `drawImage` với ô nguồn lẻ điểm ảnh (`sx`, `sw` không nguyên, smoothing tắt): Chrome làm tròn ô nguồn → khe tối
  giữa các miếng texture của vệt. Vẽ cả khung dưới clip tam giác thay vì cắt ô nguồn.
- Hình bình hành một affine cho mỗi đoạn vệt lệch mép ở khớp gấp (răng cưa sọc). Tứ giác đúng = hai tam giác.
- Khi so "cũ/mới" bằng cách nạp `vfx.js` cũ vào trang xem: gọi `SK.vfx.load('../../')` — base rỗng thì trang atlas 404,
  sprite không vẽ và tưởng nhầm bản cũ không hiện gì.
- Ảnh bóc của sprite là `textureRect` (cắt sát khi sprite nằm trong atlas đóng gói chặt), không phải `m_Rect`: cỡ hạt
  chế độ Sprite phải lấy bề rộng `m_Rect` (`uv.rw`).

## Trang xem

`http://localhost:8811/games/soulknight/tools/vfx/viewer.html` — tham số URL: `q` (regex tên), `cat`, `src`,
`zoom`, `slow=1`, `page`, `per`, `sel=<tên>` (mở bảng chi tiết), `st=<trạng thái>`. Hiệu ứng `trail` / có
TrailRenderer / rateOverDistance chạy vòng tròn để thấy vệt. Bảng chi tiết: tạm dừng, bước 1/60 s, xoay góc, chọn
trạng thái Animator, "được tham chiếu bởi", phim 1/30 s và mọi khung atlas hiệu ứng dùng để so với sprite gốc.

## Kiểm thử

```sh
node test/soulknight-vfx.js   # cần python -m http.server 8811 ở gốc repo
```

28 mục: atlas nạp đủ, lưới vẽ ra điểm ảnh, không lỗi trang; `hit_yellow` phát hạt ngay và tắt theo tuổi thọ +
`RGAutoDestory`; toàn bộ 2 599 hiệu ứng chạy không ném lỗi, tự tắt, hệ có rate/bursts đều phát, bộ đếm hạt về 0;
hiệu năng 60 vụ nổ; trong game (nạp script bằng `addScriptTag` khi `index.html` chưa có thẻ) hiệu ứng sinh, cập
nhật qua vòng lặp thật và tắt hết. Độ trung thực (số kỳ vọng lấy từ prefab): hạt `hit_orange` là ô đúng màu
rgb(255,227,75); scalingMode Shape; glow `explode_s` ×2 (đỏ ×2, lam ×4); vòng đời `buff_ice` (2.75 s, `bullet_84`,
2 s, mờ 1 s); `explode_energy3` vẽ tại điểm nổ; `fighter_0_angry_effect` cộng không có ô tối; armor một sprite không
trắng; `warliege_roll` nhánh tắt không vẽ. Vòng 2 (28 mục): hạt Sprite `bullet_follow_ice_skill_s12` khung
[40, 56] × [31.54, 49.83] (16 × 18.29 px, pivot 21.6/24); `#redtrail` đầu vệt sáng ≥ 2,5 × chỗ cách 45 px; vệt vật
chậm dài 33 ± 2 px; `Fire` cộng, tint `[1, 0.6815, 0.3451, 1]`, 0 điểm ảnh tối; `ice_explode` đen đúng 0.0667–0.1333 s.
Kiểm "tự tắt" cộng thêm `tr.time` (vệt còn tới lúc đỉnh cuối hết hạn). Ảnh: `%TEMP%/soulknight-vfx/`.
