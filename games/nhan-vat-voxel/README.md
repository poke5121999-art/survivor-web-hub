# voxel-chars

One page (`index.html`) showing many characters made in code (three.js r170, no model or texture files). The default view is
**Nhân vật khối**: classic blocky characters, a few big boxes wrapped in low-res pixel textures. **Voxel mịn** (toggle next to
the tabs, `?style=vox`) keeps the fine voxel version built from small cubes. Every path is relative, so the folder can be served from a GitHub Pages sub-folder.

| Tab | What | Source |
|---|---|---|
| Người sống sót (120), style Nhân vật khối (default) | the owner's chibi roster as blocky box characters | `block/` reads the same roster specs |
| Người sống sót (120), style Voxel mịn | the owner's chibi roster, voxelized from the smooth skinned mesh | `lib/roster`, `lib/chibi`, `lib/lf` copied from `D:\lf-humanoid` (Lanternfall kit by loktar00, chibi preset) |
| Zombie (10) | the chibi zombie sheet, same voxelizer | same |
| BZ anh hùng / zombie / boss (13 / 14 / 11) | the Blockade Z voxel cast | `data/bz-cast.js`, baked from the running game by `tools/bake-bz.js` |

Page controls: style toggle (Nhân vật khối / Voxel mịn, survivor and zombie tabs only), animation picker (Đứng, Thủ thế, Đi, Chạy, Đánh, Trúng đòn, Ngã), voxel density slider (12-64 cubes per
character height; the inspect view uses 1.5x the grid density), "Xem cả nhóm" (whole group on one screen), drag or wheel
to scroll, tap one character to inspect it (orbit, pinch or wheel zoom, every clip, "So với bản mượt" puts the smooth chibi
beside the voxel one). The stats line shows characters, cubes, triangles, draw calls (and how many characters are inside the
view after frustum culling) and fps. Query: `?style=block|vox&tab=survivors|zombies|bz-heroes|bz-zombies|bz-bosses&a=<clip>&n=<density>&fit=1&inspect=<id>&cmp=1&orbit=yaw,pitch,dist,targetY`.

## Blocky builder API (`block/builder.js`, `block/actor.js`)

```js
import { BlockActor, blockProto } from './block/actor.js';
import { buildBlock, PX, S, HOLD, holdOf } from './block/builder.js';

const a = new BlockActor(spec, { t0: 2, shadows: false });  // spec = one entry of lib/roster (ROSTER or ZOMBIES)
scene.add(a.root);
a.setMode('walk');            // idle | ready | walk | run | attack | hit | death
a.update(dt, speed);          // every frame; a.vox() = box count, a.tris(), a.draws() === 1
const { geo, tex, meta, boxes } = buildBlock(spec);   // raw: skinned BufferGeometry + { map, emissive } canvases
```

Body plan in model pixels (32 px tall, `PX` = 1.85/32 m): head 8x8x8, torso 8x12x4, arms 4x12x4 (3 wide when the spec has
`body.bust` or `body.k` < 0.96), legs 4x12x4, plus an outer layer of the same boxes inflated by 0.5 px (head) or 0.25 px
(body, limbs) whose texels may be transparent (`alphaTest`). Hats brims, toques, helmet rims and visors, backpacks, tanks,
pouches, long hair, pony tails, held props and the dog are extra small boxes. One canvas per character (128 wide, `S` = 2
texels per px, so a face is 16x16), NearestFilter, no mipmaps; glowing texels (lamps, flames, zombie eyes, welding visor,
reflective stripes) go into a second canvas used as `emissiveMap`. All boxes are merged into one `SkinnedMesh` with one bone
per box (root, body, head, armR, armL, legR, legL, dog, dogHead, 4 dog legs, dogTail): one draw call per character, dog included.

Box UV layout: each box gets a net `[R d][F w][L d][B w]` under `[  ][T w][D w]` (texels = size x S). Painting is per face in
face-local texels, top-left origin, as seen from outside: F = front (+z), B = back, L = the character's left side (+x),
R = right side (-x), T = top (image bottom = front), D = bottom. In `Kit` (builder.js): `K.box(name, bone, min, size, { inf,
alpha, fill })` adds a box, `K.paint(box, (P, rng) => P.F.set(x, y, rgb, glow))` queues painting (`fill`, `rect`, `row`,
`get`, `clear` on each face), `K.solid()` is a flat-coloured box with lit top and dark bottom rows, `K.push(matrix)` /
`K.pop()` place rotated props. Chibi heights from the specs map to texel rows with `legRow`, `torRow`, `armRow`
(e.g. `bottom.end`, `wear.belt.y`, `vest.y0/y1`, sleeve ends), so the same spec numbers drive both styles.

What a spec turns into: `top` (tee / long / rolled / tank / crop / bare, `stripes`, `pat` check / camo / floral / leather /
denim / knit, `sleeve`, `collar`), `bottom` (pants / shorts / capri / skirt / dress, `legs`, `cuff`, `rip`, `stripes`),
`socks`, `shoes` (boot / welly / sneaker, `sole`, `lace`, `right`), `hair` (short, buzz, quiff, bob, long, pony, side, spiky,
flattop), `beard` (full, short, stache, stubble), `face.brow`, every `wear` kind in the roster (vest, coat, apron, overalls,
carrier, belt, strap, tie, bowtie, braces, scarf, collar, badge, number, stethoscope, kneepad, bandage, legband, armband,
gloves, backpack, tank, holster, pouch, cigarette), every `head` kind (cap, beanie, beret, helmet army / ballistic / hard /
miner / fire / police / riot / bike / football, hat bucket / bush / fedora / straw, chef, hood with visor, gasmask half / full,
mask, bandana, headband, goggles up / down, glasses / shades, eyepatch, welding, balaclava, earmuffs, santa), every prop
kind (blades, tools, guns, torches, hanging boxes and buckets, shields, binoculars, camera, guitar, map, log, sign, crutch),
`pet` dogs (colours, ears up / flop, collar, vest, goggles, size `k`), `zombie` (eye colour, glowing coloured eyes, bigger
eye, open mouth with teeth, brain, glowing wounds), `body.belly` (a belly box), `dirt` (grime speckles).

Animation (`BlockActor.update`): whole boxes rotate at the neck, shoulders and hips, no elbows or knees. A held pose comes
from the spec (`pose`) or its props (`HOLD`, `holdOf`: shoulder, crossed, hips, shield, pistol, rifle, shrug, twohand, drink,
radio, map, binoculars, zombie-forward / one / dangle / limp); long guns are aimed across the chest and shoulder tools across
the back by undoing the held arm rotation (`aim` in builder.js). Clips: idle (breathing, look around), ready (wide stance,
arms up), walk / run (limb swing, bob, lean; held arms keep their pose), attack (overhead chop with body twist; guns recoil;
zombies claw), hit (knock back + red flash, every 1.25 s), death (falls backward, lies, sinks, loops), zombies shamble with
arms forward. The dog walks, wags, barks on attack and lies down on death.

`node tools/shoot-block.js [outDir=shots/block] [grid,zombies,close,ref,phone]` writes the blocky evidence: 120 line-up idle /
walk / attack with fps, zombies, close-ups (front and 3/4, idle / walk / attack), faces, owner's cell | blocky pairs for 20
survivors and all 10 zombies (`REF` = folder with `cells/` and `zcells/`, default `D:/lf-humanoid/ref`; `REFIDS`, `CLOSE`
pick other ids), phone width, the voxel toggle and a Blockade Z tab, console errors and warnings -> `report.json`.

Measured (desktop Chrome headless with GPU, capped near the display rate): all 120 blocky survivors on one screen = 1,970
boxes, 23.6k triangles, 122 draw calls, 68 fps idle, walking and attacking; zombies 144 boxes; phone width 390 px no overflow.
Zero console errors over the run (one shader compiler warning X3595 comes from the existing post pass and shows in the voxel view too).

Honest gaps (blocky): no elbows or knees, so two-handed holds are approximate (the off hand does not meet the gun); props
pass through the body in some holds (crossed arms, map); hats and helmets are generic shapes, not each concept's exact cut;
the head is 1/4 of the height (classic blocky), smaller than the chibi concept heads; puffy jackets, bellies and busts are
only hinted (belly box, slim arms); no real phone test.

## Voxelizer API (`vox/voxelizer.js`)

Works for any skinned or rigid triangle mesh whose rig can say "bone b maps a bind-pose point p to R_b p + O_b".

```js
import { voxelize, meshModel, packFigureBones, packMatrix } from './vox/voxelizer.js';
import { makeVoxMaterial, makeVoxDepth } from './vox/material.js';

const model = voxelize(
  { P, N, I, BA, BB, W, nBones },   // bind positions, normals, triangle indices; per vertex bone A, bone B, weight of B
  {                                   // (omit BB/W for one bone per vertex, omit BA for a single rigid mesh)
    size: height / 32,                // voxel edge in mesh units
    shade: (v, x, y, z) => [r, g, b, emis],  // linear colour of a visible voxel; v = source vertex outermost in it
    phase: [0.5, 0, 0],               // lattice offset in cells: x = 0 on a cell centre keeps a +Z-facing body symmetric
    boneScale: { [headBone]: 0.6 },   // optional finer (or coarser) lattice per bone
    minW: 0.25,                       // a blended vertex also fills its second bone above this weight (joints overlap, no gaps)
    priority: (v) => 0..1,            // small features that should win a voxel they share (pupils, lenses, glowing eyes)
    tol: 0.6,                         // ...when they sit within this many voxels of the outermost sample
    ignore: (v) => bool,              // fill the voxel but do not colour it (features a decal paints instead)
    decals: [{ bone, p: [x, y, z], dir: [0, 0, 1], col: [r, g, b], emis, cells: [[du, dv]], onlyIf: (v) => bool }],
  });
const geo = meshModel(model);         // BufferGeometry: position, normal, color (with AO), aBone, aEmis, aLat; userData { tris, quads, vox }
const mat = makeVoxMaterial({ size: model.size, maxBones: 32 });
const mesh = new THREE.Mesh(geo, mat); mesh.customDepthMaterial = makeVoxDepth(mat);
// every frame, after your own animation code posed the rig:
packFigureBones(fig.R, fig.O, fig.nb, mat.userData.u.uB.value);   // Lanternfall Figure (row-major R, offset O)
// or, for an Object3D tree: packMatrix(boneMatrixRelativeToMeshRoot, boneIndex, mat.userData.u.uB.value)
```

How it works: every triangle is sampled at under half a voxel; each sample goes to the grid of its bone (both bones in a
blend region), all grids share one lattice so the parts line up in bind pose. Per cell and per face direction the
outermost sample is kept, so a voxel takes the colour you would see from that side (shirt over skin, hat over hair).
Each part grid is flood-filled from outside (solid inside, closed parts that stay closed when a joint bends), then
greedy-meshed per part with per-vertex AO (same scheme as Blockade Z's `js/vox/voxelize.js`), each part closed against
its neighbours so rotating joints never show holes. Overlapping joint voxels get a tiny depth bias per bone, so they never
z-fight. The material (`vox/material.js`) is a MeshStandardMaterial: the vertex stage applies the bone's 3x4 matrix (uniform
array, 32 or 64 bones), the fragment stage adds a bevel line on every voxel edge, a lit upper edge, a per-voxel colour jitter
(all from `aLat`, the cell coordinate, so the pattern rides each part), glow, hit flash and a voxel-by-voxel dissolve for the
death clip. One draw per character (+1 for a dog), one shader program for all. Lighting is the chibi studio rig (hemisphere +
warm key + cool fill + rim, PMREM env) and a depth SSAO pass (`lib/chibi/post.js`).

Chibi adapter (`vox/chibi.js`): `chibiShade` is a CPU port of the chibi material (folds, check / camo / floral prints, grime,
blood, ground darkening, saturation, the soft cap on whites) evaluated once per voxel centre; `chibiFace` paints pupils, eye
whites (fine densities), brows and the mouth as decals on skin voxels only (never through glasses, masks or fringes); the
head is voxelized at 0.6x the body cell (`HEAD_K`) so faces read at grid size. `VoxActor` runs the roster's own `HumanAnim`
(and `DogAnim` for pets) on a mesh-less `Figure`, so idle / ready / walk / run / attack / hit / death and the zombie shamble
are the original animation code. Blockade Z adapter (`vox/bz.js`): decodes the baked grids, folds nodes no clip moves into
their moving ancestor (bosses: 60-115 part nodes -> 24-36 bones), meshes with the same mesher, plays the baked clips
(15 fps, interpolated), and halves the grids (2x2x2) at densities <= 24.

## Tools

```sh
node tools/shoot.js            # all evidence into shots/ (tabs, 120 grid fps at 16/32/48, close-ups, smooth|voxel, phone, console errors -> report.json)
node tools/peek.js "?tab=zombies&n=32" out.png 1400 900   # one screenshot + stats + console
node tools/bake-bz.js          # re-bake data/bz-cast.js from D:\hub-bzvox (game must be there); ONLY=thep,dragon for a subset
node tools/check-bz-cast.js    # decode check of the baked module
node tools/serve.js 8790 900   # static server that exits by itself
```

## Measured (desktop, Chrome headless with GPU, fps is capped near the display rate)

- Survivors, all 120 on one screen: density 16: 66.7k cubes / 223k triangles; 32 (default): 288k / 683k; 48: 722k / 1.49M;
  125 draw calls; 68 fps at all three, idle and walking. Phone width 390 px: no horizontal overflow, 16 characters in view.
- Blockade Z: heroes 294k cubes / 122k triangles, zombies 248k / 59k, bosses 600k / 113k (cube counts include filled insides).
- Zero console errors over the whole `tools/shoot.js` run.

## Honest gaps

- Joints are rigid parts with overlap: a sharply bent elbow or knee shows a small step, not a smooth bend.
- Faces are decals at fixed spots: expressions (`face.lid`, `browTilt`) are not carried over; brows hidden by a fringe are
  dropped; at density <= 20 the eyes and mouth are single cells.
- The Blockade Z cast is baked data (grids + sampled clips), not live game code: no carving, severed limbs or skill
  animations; hovering bosses' walk loops close roughly; the voxel density slider only halves them (1/32 m or 1/16 m).
- fps above was measured headless on a desktop GPU; no real phone test yet.
- The dog is voxelized like the owner but its pose in the grid is a small fixed offset.
