# Stylized Props Kit (three.js r170, chỉ code)

Bộ đồ vật hậu tận thế kiểu low-poly vát cạnh, màu phẳng bão hoà, sơn tróc / gỉ / bẩn / máu vẽ bằng shader.
Không có file model hay texture: mọi đồ là một hàm `build(seed, opts)` trả về `THREE.Group`.
Nguồn hình: 4 ảnh concept của chủ dự án trong `ref/` (sheet đồ, sheet xe, cảnh xưởng, cảnh lửa trại).

- Showcase: mở `index.html` qua static server (ví dụ `npx http-server -c-1` hoặc `python -m http.server`), không mở `file:///`.
- three r170 nằm trong `vendor/three.module.min.js` (MIT, xem `vendor/LICENSE`).

## Dùng trong game

```js
import * as THREE from './vendor/three.module.min.js';           // cùng bản three với kit
import { buildProp, PROPS, updateProps, drumBlue } from 'D:/stylized-props/lib/index.js'; // đường dẫn tương đối trong dự án của bạn

const drum = buildProp('drum_blue', 7, { wear: 0.9, dent: 0.02 }); // theo id
const drum2 = drumBlue(3, { color: '#d6262c' });                    // hoặc gọi thẳng hàm có tên
scene.add(drum, drum2);

drum.userData.tris;                 // số tam giác, draws = số mesh
drum.userData.params;               // { doors: { value, range } ... } các tham số mở/động
locker.userData.set('doors', 0.8);  // mở cửa 0..1
// mỗi frame (lửa, quạt, bánh xe...):
updateProps([barrel, van], dt, elapsedTime);
```

Lưu ý: kit import three từ `vendor/three.module.min.js`. Game dùng bản three khác thì phải dùng chung một
instance (import map trỏ `../vendor/three.module.min.js` về bản của game, hoặc copy kit vào cạnh bản three đó).

Tham số chung cho mọi prop (`opts`):

| opts | ý nghĩa | mặc định |
|---|---|---|
| `wear` | 0 = mới, 0.6 = cũ vừa, 1 = rất cũ (nhân chip/gỉ/bẩn của mọi preset) | 0.6 |
| `quality` | 0 thấp (vát 1 nấc, ít đoạn tròn, noise 1 octave) / 1 cao | 1 |
| riêng từng prop | ví dụ `doors`, `fire`, `color`, `broken`, `dent` — xem `variants` trong `props/*.js` | |

Danh sách id + biến thể: `PROPS` (mỗi phần tử `{ id, name, build, yaw, variants:[{label, seed, opts}] }`).
Bảng ô tham chiếu ↔ id: `ref/props.md`.

## Cấu trúc

```
lib/geo.js            bevelBox, bevelCyl, lathe, torus, extrude, tube, blob, creaseNormals, deform, noise3
lib/wear-material.js  material "painted wear" (MeshStandardMaterial + onBeforeCompile), glow, glass
lib/prop.js           class Prop: gom mảnh -> merge 1 mesh / node / material, params, update
lib/parts.js          cụm dùng chung: drum, tyre, wheel, strapBox, strapRing, decal, cinderBlock, plank, loop, rebar
lib/fire.js           lửa low-poly lay động + đèn tuỳ chọn
lib/index.js          cổng public: buildProp, PROPS, updateProps, mọi hàm prop có tên
props/*.js            các nhóm prop (concrete, drums, furniture, metal, workshop, vehicles, scrap)
tools/                segment.py / crop.py (cắt ô), shoot.mjs (render + so sánh), solo.mjs (chụp cận), compare.py
```

## Viết một prop

```js
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';

export function toolCrate(seed = 1, opts = {}) {
  const p = new Prop('tool_crate', seed, opts);               // rng tất định: p.r(), p.range(a,b), p.int(a,b), p.pick(arr), p.chance(x)
  const red = p.paint('paint', { color: '#c62f2f' });         // preset + ghi đè
  p.box([0.6, 0.3, 0.35], { at: [0, 0.15, 0], paint: red, bevel: 0.02 });
  const lid = p.node('lid', { at: [0, 0.3, -0.175] });        // node = bản lề; mảnh trong node merge riêng
  p.in(lid, () => p.box([0.6, 0.04, 0.35], { at: [0, 0.02, 0.175], paint: red }));
  p.param('lid', opts.lid ?? 0, (v) => { lid.rotation.x = -v * 1.8; }); // tham số mở 0..1
  parts.decal(p, { shape: 'triangle', at: [0, 0.15, 0.177], size: 0.1 }); // biển cảnh báo vẽ
  return p.done();                                            // Group; userData { prop, tris, draws, params, set, update }
}
export const PROPS = [{ id: 'tool_crate', name: 'Hộp đồ', build: toolCrate, yaw: 0.3,
  variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { lid: 0.8, wear: 0.9 } }] }];
```

Mảnh (`p.box / cyl / lathe / torus / extrude / tube / blob / geom`) nhận chung: `at`, `rot` (Euler rad), `order`,
`scale`, `paint`, `node`, `deform: { amp, freq }` (móp / méo). Đơn vị mét, trục Y lên, mặt trước nhìn +Z.

- `p.box([w,h,d], { bevel, round })` hộp vát cạnh 44 tam giác (vát 1 mặt, pháp tuyến cuộn mềm qua cạnh); `round: 1|2` cho vát tròn 108 / 300 tam giác.
- `p.cyl(r, h, { r2, bevel, seg, open })` trụ vát (côn nếu r2 ≠ r), tâm ở giữa chiều cao.
- `p.lathe([[r,y],...], { seg, colors })` tiện tròn; `colors` = màu theo từng điểm profile (sọc nón, đai phuy).
- `p.extrude([[x,y],...], depth, { bevel, holes })` đùn theo Z, tâm ở z = 0; pháp tuyến mượt trong góc < 40°.
  Bẫy đã gặp: vát của extrude nới profile ra ngoài thêm ~0.9 × bevel, nên mảnh dán lên mặt extrude phải đặt lệch ra thêm chừng đó.
- `p.tube([[x,y,z],...], radius, { seg, smooth })` ống, tay nắm, khung ghế, dây.
- `p.attach(obj)` gắn Object3D bất kỳ (lửa); `p.onUpdate((dt, t) => ...)` cho chuyển động.
- Thêm prop vào kit: hàm có tên (camelCase của id) + phần tử trong `PROPS` của file nhóm; `props/index.js` tự gom.

## Material "painted wear"

Một `MeshStandardMaterial` dùng chung cho mọi prop (`sharedMaterials()`), nên cả cảnh chỉ tốn 1 program.
Mỗi đỉnh mang thông số sơn của mảnh nó thuộc về (attribute), shader tính mọi lớp trong không gian vật thể:

| lớp | cách tính | điều khiển |
|---|---|---|
| màu nền | `color` (vertex colour) | `paint.color`, `lathe colors` |
| hoa văn | sọc chéo / băng ngang / vết loang / lưới / loang mềm / sọc dọc / chevron | `paint.pattern` = `stripes`, `bands`, `stains`, `grid`, `mottle`, `vstripes`, `chevron`; `col2`; `patW` (bề rộng sọc, m, < 1) |
| tróc sơn | khoảng cách tới cạnh (hộp: cạnh thật, trụ: vành, extrude/ống: trọng số nếp gấp) × noise; thêm đốm tróc rải | `paint.chip`, `paint.under` (màu lộ ra), uniform `uChipWidth` |
| gỉ | đốm noise kéo dọc + quanh vết tróc + dồn về chân | `paint.rust`, `uRustA/B` |
| bẩn | dốc từ chân vật lên (y vật thể) + vệt loang | `paint.dirt`, `uDirtHeight`, `uDirtCol` |
| máu / sơn bắn | vệt bắn noise ngưỡng cao + giọt nhỏ | `paint.splat` (lượng), `paint.splatScale` (cỡ vệt, 1 = mặc định, 0.4 = vụn như trên xe), `uBlood` |
| bề mặt | roughness / metalness theo preset; chỗ tróc bóng hơn, gỉ / bẩn nhám | `paint.rough`, `paint.metal` |

Preset (`PRESETS` trong `lib/prop.js`): `paint, metal, steel, rusty, concrete, wood, plywood, plastic, rubber,
fabric, tarp, chrome, glass, glow`. `wear` của prop nhân chip/gỉ/bẩn của preset (trừ khi ghi đè giá trị cụ thể).

Uniform toàn cục (`wearUniforms`): `uChip, uRust, uDirt, uSplat` (hệ số nhân 0..n cho cả cảnh), `uChipWidth`, `uDirtHeight`, màu gỉ/bẩn/máu.
Instancing: hoạt động với `InstancedMesh` (mỗi instance tự lệch seed noise theo vị trí). Lấy geometry + material từ mesh của `buildProp`.

## Ngân sách tam giác

Mục tiêu (chất lượng cao): đồ nhỏ ≤ 1 500, đồ vừa ≤ 4 000, đồ lớn / cụm ≤ 10 000, xe ≤ 25 000; 1–4 draw mỗi prop
(1 draw / node chuyển động / material). Số đo thật của từng prop: `shots/stats.json` (sinh bởi `node tools/shoot.mjs`)
và bảng ở cuối file này.

## Kiểm tra

```
node tools/shoot.mjs                 # render 4 bố cục -> shots/layout-*.png, shots/compare/*.png, shots/stats.json, shots/console.txt
node tools/shoot.mjs --only cone,pallet --sheets props   # chỉ dựng lại ô so sánh của vài prop
node tools/solo.mjs cone,pallet --variants                # chụp cận từng biến thể -> shots/solo/
```

## Số đo từng prop (chất lượng cao, đo 2026-11-15 bằng `node tools/shoot.mjs`)

106 prop, 240 biến thể; trung vị 1 020 tam giác; xe 8 800–14 800; tổng (biến thể nặng nhất mỗi prop) 174 395.

| id | tam giác (min–max biến thể) | draw | biến thể | tham số |
|---|---|---|---|---|
| `jersey_striped` | 1532 | 1 | 3 | — (khe xe nâng là đường hầm khoét thật) |
| `jersey_stained` | 932 | 1 | 2 | — |
| `jersey_broken_mid` | 1252–1428 | 1 | 2 | — |
| `jersey_broken_end` | 1584 | 1 | 2 | — |
| `jersey_plain` | 932 | 1 | 2 | — |
| `jersey_broken_long` | 1582–1584 | 1 | 2 | — |
| `jersey_striped_long` | 1020 | 1 | 2 | — |
| `water_barrier_white` | 3812 | 1 | 2 | — (hốc nêm khoét thật, thân cắt đoạn dọc trục X) |
| `water_barrier_red` | 1140 | 1 | 2 | — |
| `barrier_crowd_red` | 808 | 1 | 2 | — |
| `barrier_steel` | 656 | 1 | 2 | — |
| `barrier_steel_broken` | 692 | 1 | 2 | — |
| `sawhorse` | 568–612 | 1 | 2 | — |
| `cone` | 392 | 1 | 2 | — |
| `traffic_drum` | 600 | 1 | 2 | — |
| `traffic_barrel` | 640 | 1 | 2 | — |
| `cinder_block` | 220–660 | 1 | 2 | — |
| `concrete_block_tarp` | 1128 | 1 | 2 | — |
| `flood_light` | 1232 | 2 | 2 | — |
| `fence_broken` | 736–792 | 1 | 2 | — |
| `fence_panel` | 532–656 | 1 | 3 | — (opts `width, planks, height, lean, gaps`) |
| `scrap_cart` | 3894–5682 | 3 | 3 | roll (opts `wheels 2/4, handle, spikes, load: none/drum/tyre`) |
| `drum_blue` | 672 | 1 | 3 | — |
| `drums_blue_strapped` | 2032 | 1 | 2 | — |
| `drums_on_pallet` | 3440 | 1 | 2 | — |
| `drum_red_rusty` | 476 | 1 | 2 | — |
| `drum_red_dented` | 476 | 1 | 2 | — |
| `drum_orange_white` | 1064 | 1 | 2 | — |
| `drum_blue_b` | 536 | 1 | 3 | — |
| `drum_rusty` | 1260 | 1 | 2 | — |
| `drum_red_white` | 1200 | 1 | 2 | — |
| `drum_blue_plastic` | 616 | 1 | 2 | — |
| `burn_barrel` | 2264–2474 | 2 | 2 | fire |
| `burn_bucket` | 1124–1304 | 2 | 2 | fire |
| `barrel_table` | 1601 | 1 | 2 | — |
| `trash_can` | 1328 | 2 | 3 | lid |
| `gas_cylinder_tall` | 972 | 1 | 2 | — |
| `gas_cylinder_small` | 892 | 1 | 2 | — |
| `gas_bottle_red` | 1312 | 1 | 2 | — |
| `fire_extinguisher` | 1148 | 1 | 2 | — |
| `jerry_can_red` | 480 | 1 | 2 | — |
| `jerry_can_red_small` | 480 | 1 | 2 | — |
| `jerry_can_yellow` | 588 | 1 | 2 | — |
| `bucket` | 768 | 1 | 2 | — |
| `bucket_handle` | 1256 | 1 | 2 | — |
| `tyre` | 360 | 1 | 2 | — |
| `tyre_flat` | 196 | 1 | 2 | — |
| `tyre_big` | 612 | 1 | 2 | — |
| `soda_can` | 212 | 1 | 2 | — |
| `pallet` | 732–748 | 1 | 2 | — |
| `mattress` | 736–1004 | 1 | 3 | — |
| `sleep_mat_flat` | 520–688 | 1 | 2 | — |
| `car_bench_seat` | 968–1092 | 1 | 3 | — |
| `bedroll_open` | 540–932 | 1 | 2 | — |
| `sleep_roll_orange` | 924 | 1 | 2 | — |
| `bedroll_tied` | 1196 | 1 | 2 | — |
| `pallet_table` | 1804–2968 | 1 | 3 | — |
| `tarp_crate_green` | 2696–2740 | 1 | 3 | — |
| `tarp_crate_blue` | 2952 | 1 | 2 | — |
| `chair_plastic` | 1800 | 1 | 2 | — |
| `chair_wood` | 1032–1140 | 1 | 2 | — |
| `stool` | 1080–1188 | 1 | 2 | — |
| `car_seat_sport` | 740 | 1 | 2 | — |
| `car_seat` | 220–300 | 1 | 2 | — |
| `camp_chair` | 720 | 1 | 2 | — |
| `log_stump` | 420–464 | 1 | 2 | — |
| `log_thin` | 284 | 1 | 2 | — |
| `plank_standing` | 208 | 1 | 2 | — |
| `plank_broken` | 360–492 | 1 | 2 | — |
| `workbench` | 3424 | 4 | 3 | drawers |
| `firewood_pile` | 660–966 | 1 | 2 | — |
| `firewood_split` | 68–204 | 1 | 2 | — |
| `backpack_red` | 2712 | 1 | 2 | — |
| `backpack_yellow` | 2452–3056 | 1 | 2 | — |
| `hatchet` | 480 | 1 | 2 | — |
| `lockers_triple` | 2004 | 4 | 3 | door2, doors |
| `container_open` | 6016–6224 | 3 | 5 | doors |
| `caravan` | 6708 | 3 | 3 | doors |
| `scrap_pile_a` | 4558–4570 | 1 | 2 | — |
| `scrap_pile_b` | 3452 | 1 | 2 | — |
| `tool_chest_red` | 2964 | 5 | 2 | doors, drawers |
| `fridge_yellow` | 1280 | 2 | 3 | door |
| `cabinet_yellow` | 1188 | 2 | 2 | door |
| `safe_small` | 1680 | 3 | 2 | door |
| `generator` | 3496 | 1 | 3 | — |
| `toolbox` | 1464 | 2 | 3 | lid |
| `case_red` | 1608 | 2 | 2 | lid |
| `gunsmith_bench` | 1544 | 3 | 3 | drawers |
| `reloading_press` | 408 | 2 | 2 | press |
| `cutting_mat` | 12 | 1 | 2 | — |
| `bench_vise` | 668 | 2 | 3 | jaw |
| `desk_lamp` | 612 | 5 | 3 | arm |
| `walkie_talkie` | 224 | 1 | 2 | — |
| `ashtray` | 708–1108 | 1 | 2 | — |
| `bottles_oil` | 544–816 | 1 | 2 | — |
| `mug` | 288–456 | 1 | 2 | — |
| `dynamite_bundle` | 684–1004 | 1 | 2 | — |
| `detonator_box` | 522 | 1 | 2 | — |
| `steel_cabinet_open` | 596 | 3 | 3 | doors |
| `tool_chest_rolling` | 3252 | 5 | 3 | drawers |
| `kettle_stove` | 1328 | 1 | 2 | — |
| `lug_wrench` | 324–380 | 1 | 3 | — |
| `shell_casings` | 960–2160 | 1 | 2 | — |
| `pickup` | 9860–14756 | 9 | 3 | doors, speed, steer |
| `van` | 9446–14282 | 11 | 3 | doors, speed, steer |
| `hatchback` | 8824–13460 | 9 | 3 | doors, speed, steer |

## Showcase

`index.html`: 4 bố cục theo 4 ảnh gốc (đặt từng prop vào đúng ô của nó trên ảnh, camera khớp ảnh) + tab Biến thể (mọi biến thể ở kích thước thật). Bấm một đồ để xem riêng: xoay/zoom, seed, độ cũ, thanh trượt tham số mở/động, ô ảnh gốc. Nút Ảnh gốc phủ ảnh tham chiếu 50% lên khung. Nút Chất lượng: Cao/Thấp (Thấp: tắt bóng, pixel ratio 1, noise 1 octave, ít đoạn tròn).

`tools/ui-test.mjs` chạy thử ở bề ngang điện thoại 390 px và desktop (không tràn ngang, 0 lỗi console).

## Xe đẩy phế liệu + rào ván (cảnh lửa trại)

`import { scrapCart, fencePanel } from '.../lib/index.js'` (hoặc `buildProp('scrap_cart' | 'fence_panel', seed, opts)`).
`scrap_cart`: trục dài X, tay đẩy ở -X, mũi ở +X, `set('roll', 0..1)` quay 4 bánh. `fence_panel`: dài theo X, ván hướng +Z.
Ô so sánh 116 (`ref/boxes.json`) dùng `scrap_cart`; `props/registry-safe.js` phải liệt kê `scrap` (đã thêm).

## Khoét lõm thật

Rào bê tông / rào nhựa dựng từ nhiều `extrude` ngắn dọc X (`lowBody` / vòng `prof2` trong `props/concrete.js`); đoạn có khe dùng profile đã cắt,
nên khe xe nâng và hốc nêm là hình học lõm, không phải mảng tối dán. Bevel đoạn nhỏ 0.004 để mối nối không lộ rãnh.
