# Kho Vũ Khí 3D — vũ khí kiểu Saltline (three.js r170, chỉ code)

73 vũ khí dựng hoàn toàn bằng code (không file model, không file texture), theo **cách dựng và chất liệu của
Saltline**: 72 món đúng danh sách hai tờ concept của chủ dự án (giống `D:\stylized-weapons`) cộng khẩu **TR-9**,
là khẩu PAC-9 của Saltline port nguyên bằng tool, dùng làm thước chất lượng. Mở `index.html` qua server tĩnh
bất kỳ (ES module cần http). Bấm một món để gỡ khỏi tường và xoay xem gần.

Saltline là của Felix Rieseberg (claude.ai artifact `BGY1SztrAYcJQHSsnHHGmp`). Mọi công lao của phần code port là
của tác giả. Chữ khắc / tên hãng / logo đã đổi (`PAC-9` → `TR-9`, `LONGSHORE ARMS WORKS · SALTLINE` →
`KHO ARMS WORKS · REPLICA KIT`, `HX-2` → `RD-6`, số hiệu, logo hãng tàu trong bộ decal).

## Cái gì lấy từ Saltline (nguồn: `D:\ref-saltline-gh\work\game.pretty.js`, skill `fps-high-quality`)

Ba module trong `js/sl/` do `tools/port-sl-kit.js` sinh ra (dùng `tools/sl-port-lib.js` của Ga Chìm: đổi alias
three.js đã minify, kiểm định danh tự do bằng acorn, thay chữ theo neo, neo lệch là tool dừng). **Không sửa tay
file sinh ra**; sửa tool rồi chạy lại `node tools/port-sl-kit.js`.

| file sinh | dòng nguồn | nội dung |
|---|---|---|
| `gun-sl.js` | 24100-24306 | mergeGeometries, hộp bo `Wi`, tube `Fn`, gộp `Ii` |
| | 45296-46065 | helper PAC-9: `sm` (nhiễu màu đỉnh + mòn cạnh vát), `Rt` hộp, `xr`/`qo` đùn 2D có vát, `M_` pháp tuyến cạnh phẳng, `Cn` lathe, `Fi` chốt/vít, `Dv` rãnh bo, `fC` ô vát; hằng `mi`; `w_()` dựng toàn bộ PAC-9 |
| | 46601-46806 | atlas chữ khắc `TC`, quad `F_`, kính ngắm phản xạ `U_` |
| | 46886-46948 | lớp chi tiết vi mô `Bf` (anod / phosphate / polymer) + giọt mưa |
| | 47055-47078 | bố cục chữ khắc (`MARK_LAYOUT`) |
| `mats-sl.js` | 26265-28306 | module `[mats]`: nướng GPU bộ texture albedo/ORM/height (wood, rust, metal, brushed, paint có tróc sơn, hazard, fabric, rope, polymer, plastic, tarp, galv, gunmetal, armor, concrete…), patch MeshStandardMaterial (triplanar theo không gian vật, biến thiên macro, mô hình ướt), bảng vật liệu, decal + nhãn stencil |
| `render-sl.js` | 24366-25069 | sky shader + chụp PMREM, khớp khung bóng nắng `Gy`, chunk PCSS `qy`, shader hậu kỳ: bloom 13-tap/tent, streak, grade (ACES pha AgX 0.25, split tone, S-curve, vignette), final FXAA/sharpen/grain |

Số liệu dùng thẳng: nắng 9, môi trường 2, không hemi/ambient (`render.md` §1); vật liệu PAC-9 47009-47043
(`GUNMATS` trong `js/mats.js`); tư thế hông viewmodel 46956 (`__api.viewmodel`).

Phần của mình (không phải Saltline): `js/kit.js` (API soạn theo cm cho cận chiến, mài lưỡi theo khoảng cách tới
đường lưỡi, gom mesh theo vật liệu + hướng thớ), `js/mats.js` (các biến thể độ phân giải cao của bộ texture
Saltline, lớp phủ **máu tươi/máu khô và bụi bẩn** vẽ theo đỉnh qua `uv`), `js/render.js` (ghép chuỗi hậu kỳ),
`weapons/*.js` (73 vũ khí), `js/app.js` (showcase).

Hai chỗ phải chỉnh khi đem Saltline sang tủ trưng bày (ghi lại cho lần sau):
- **PCSS ra bóng lấm tấm**: bán kính bóng Saltline (`shadow.radius 1` = vùng tìm 55 cm, nửa tối tới 60 cm) hợp cảnh
  bến cảng, không hợp vật cách tường 18 cm. Dùng `radius 0.06` (URL `?srad=`). Ngoài ra đạo hàm `dFdx` trong
  `getShadow` lấy một lần ở `main()` (ANGLE/D3D11 báo X3595 khi gọi trong nhánh vòng đèn).
- **Lưỡi dao màu be**: bộ `brushed` dưới bầu trời giờ vàng của Saltline ra sọc như gỗ. Lưỡi dùng bộ `metal`
  (vết xước, vết mỡ, mill scale) tông thép lạnh `#98a8b4`.

## API (tương thích `D:\stylized-weapons`)

```js
import { Mats } from './js/mats.js';
import { setMats, REGISTRY } from './js/weapon.js';
import { inHand, gripWorld } from './lib/attach.js';
const mats = new Mats(renderer, 1024); await mats.ready; setMats(mats);
await import('./weapons/index.js');
const w = REGISTRY.find((x) => x.id === 'fire-axe');
const g = w.build(seed = 1, { variant: 0 });          // THREE.Group, mét
inHand(g, rightHandBone, 'r', new THREE.Vector3(0, 0, 1));
if (g.userData.weapon.grip2) leftTarget = gripWorld(g, 'grip2');
```

`build()` trả `Group` gồm một mesh cho mỗi (vật liệu × hướng thớ) và các `Object3D` rỗng `grip`, `grip2`, `muzzle`,
`tip`, `edge`. `userData.weapon`: `id, name, kind (melee|gun|shield|tool), hands, variant, seed, tris, size, bounds,
grip {pos,fwd,up}, grip2, muzzle {pos,dir}, tip, edge {a,b}`. Hệ trục: cận chiến dựng dọc +Y (mũi lên, lưỡi +X,
mặt phẳng ±Z); súng nằm dọc +X (nòng +X, đỉnh +Y). `variant 1` = không máu, bẩn hơn. `lib/attach.js` chép nguyên
từ kit cũ.

Thêm một món: viết `weapon(id, name, def, (k) => { ... })` vào một file trong `weapons/` (thứ tự mảng = thứ tự ô
tham chiếu). Cận chiến soạn theo cm với `G.*` + `k.add(geo, kind | [kind, màu, scale], {p, r, col, wear, blood,
grime, grain})`; súng soạn theo mét bằng helper PAC-9 trong `weapons/guns.js` (`plate`, `rail`, `barrel`,
`muzzleDevice`, `pistolGrip`, `triggerGroup`, `magazine`, `tape`, `hazard`, `label`).

## Ngân sách tam giác (đo, biến thể 0)

| nhóm | tam giác |
|---|---|
| TR-9 (PAC-9 port, chuẩn) | 30 656 |
| súng còn lại | 3 600 - 12 000 (shotgun 4 900, AK 11 800, rifle 12 000) |
| dao, dao ném, kunai | 440 - 2 150 |
| gậy, búa, rìu, kiếm, công cụ lớn | 670 - 13 700 (gậy quấn kẽm gai cao nhất) |
| tổng 73 món | 259 196 |

Mỗi món 3-12 draw call (một cho mỗi vật liệu). Texture: mỗi bộ 1024² (cao) / 512² (thấp, điện thoại), nướng lúc
mở trang, khoảng 2-4 s.

## Kiểm (Playwright, Chrome GPU, server tĩnh có hẹn giờ)

- `node tools/compare.mjs` → `shots/compare/NN-id.png` (ô tham chiếu | của mình, cùng tư thế), `shots/compare/sheet-1..10.png`,
  `shots/closeup/id.png` (cận cảnh xoay 28°).
- `node tools/vm.mjs <ảnh Ga Chìm>` → `shots/tr9-vs-gachim.png` (TR-9 ở tư thế hông viewmodel cạnh khung hình Ga Chìm).
- `node tools/final.mjs` → tường, bấm chuột chọn, xoay + zoom sát, đổi chất lượng, lưới, điện thoại 390 px; in lỗi console.
- `node tools/shot.mjs out.png "only=<id>&shot=1&yaw=20"` ảnh lẻ. URL: `?q=low|high`, `?view=grid`, `?inspect=<id>`,
  `?wet=1`, `?variant=1`, `?pcss=0`, `?srad=`.

## Chỗ còn thiếu (thật)

- Đường mài lưỡi là mài phẳng một mặt vát; chưa có vân hamon katana, chưa có đường lưỡi phụ đánh bóng.
- Tay cầm cận chiến làm bằng extrude bo + lathe, không có khắc chữ / logo; chữ trên súng chỉ AK (RUN), SMG và TR-9.
- Các công cụ tờ 2 vốn vẽ phẳng sạch; ở đây làm thành đồ đã qua dùng (sơn tróc), nên màu nhạt hơn tờ gốc.
- Băng keo là các vòng nghiêng xếp chồng, không phải dải xoắn liên tục; đứng gần thấy mép vòng.
