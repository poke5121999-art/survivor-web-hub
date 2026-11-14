# Voxel Lab — phòng thí nghiệm phá huỷ voxel

A code-only voxel ("3D pixel") destruction lab for the browser: three.js r170, plain ES modules, no model, texture or audio files. Pick a generated building or voxel mob and destroy it.

**Credit.** Techniques studied from *Voxel Engine* by mattshumer (spawn.co). That game has no known licence, so this is a clean-room build: only our own analysis notes (`D:\ref-voxel-engine\analysis\*.md`) and screenshots were read; every line of code here is our own. Each module repeats this credit in its header.

Vendored: `vendor/three.module.min.js` (three r170, MIT, `vendor/LICENSE-three`). No physics library (see "Rigid bodies").

## Run

Serve the folder with any static server and open `index.html` (all paths are relative, any sub-path works).

- `?model=<id>&seed=<n>`, `?row=1` (everything in rows), `?quality=low|med|high`
- `?harness`: nothing steps by itself; drive it from `window.__lab` (`spawn`, `spawnRow`, `step(n)`, `draw()`, `settle()`, `setCamera`, `explode`, `tool`, `stats()`, `world`, `R`, `mobs`).
- Keys: `1-8` tools, `V` first person (WASD, Space, Shift), `R` reset. Mouse/touch: tap = use tool, drag = rotate, right-drag / two fingers = pan, wheel / pinch = zoom. Holding still repeats gun, hammer and fire.

## Architecture

| Path | What |
|---|---|
| `lib/materials.js` | material table, palette (3 rows: colour+variation, roughness/emissive/pattern/flags, interior colour), `p0` carve thresholds |
| `lib/grid.js` | `VoxelGrid`: 0.1 m voxels in 32³ chunks, pristine ("solid as built") bit mask, dirty lists |
| `lib/mesher.js` | greedy mesher, quads up to 32×32; per quad: face, material, fresh/loose flags from the pristine mask, 4 "built convex edge" bits |
| `lib/render/shaders.js` | patterns by voxel coordinate (running-bond brick 3×1, formwork concrete 24×15 with tie holes, planks, tiles, turf, corrugated sheet, thatch, bamboo…), fracture-face interiors, bevel only on built edges, volume AO, sky visibility, sun shadow PCF, scorch, glass, debris, sprites, sky, SSAO, bloom, ACES composite |
| `lib/render/renderer.js` | `GridView` (chunk meshes of the world, of each rigid body and of each mob part), per-frame remesh budget (nearest first), 0.2 m density volume with sub-box uploads, 0.4 m sky-visibility sweep on the CPU, one sun shadow map re-rendered only when something changed, instanced debris and sprites, post chain, quality tiers |
| `lib/sim/world.js` | world (1280×384×320 voxels = 128×38×32 m), `carve`, `explode`, connectivity islands, level-1 "stack" stress, debris cubes → rubble voxels (sandpile), sprites, fire, fuel chains, raycast, matter ledger, digest |
| `lib/sim/bodies.js` | rigid voxel bodies: custom stepper, crush on impact, storey-by-storey pancake, fracture, bake back into the grid |
| `lib/sim/tools.js` | gun, hammer, grenade, rocket, satchel (3.5 s fuse), wrecking ball on a rope, fire, cut-base laser |
| `lib/audio/*` | WebAudio only: modal impacts per material class, contact bursts, rubble grain clouds (top-3 rule), 4-layer explosion + roll, glass, creak, fire loop, mixer with voice stealing, ducking |
| `lib/build/*` | `kit.js` (Canvas) + generators: tube house, brick house, apartment, office tower, warehouse, water tower, stone bridge, truss bridge, castle, hut, gas station, props (car, tree, lamp post, fence, fuel drums) |
| `lib/mob/mobs.js` | soldier, villager (nón lá), zombie, golem, giant spider, robot |
| `main.js`, `index.html`, `style.css` | page, Vietnamese UI, cameras, events → audio / shake, `window.__lab` |
| `tools/` | `capture.mjs`, `compare.mjs`, `checks.mjs`, `fps.mjs` (Playwright), `sheet.py`, `side.py`, `preview-build.mjs`, `sim-test.mjs` (node, no renderer) |

Everything runs on the main thread (the reference runs its sim in a worker). The step is a fixed 1/60 s, at most 4 steps a frame; time that cannot be simulated is dropped, so heavy destruction is slow motion, not a slideshow (overview.md §4). Events `{kind, x, y, z, mag, mat, a, b}` are the single bus to audio and camera feel (destruction.md §3.2).

## Material table

`lib/materials.js`, 75 ids. Orders of magnitude after destruction.md §1.5.1; values are ours.

| material | density kg/m³ | fc / ft / fv MPa | toughness T | notes |
|---|---|---|---|---|
| concrete | 2400 | 30 / 3 / 5 | 2200 | formwork pattern |
| rc (reinforced) | 2500 | 40 / 14 / 12 | 6500 | rust bar ends on fracture faces |
| brick, brick_buff, brick_dark | 1900–2000 | 18–22 / 1.4 / 2.6 | 1300–1500 | running bond |
| mortar | 1800 | 10 / 0.8 / 1.5 | 800 | |
| stone, ashlar | 2500–2600 | 50–60 / 5 / 8 | 2900–3200 | |
| steel, steel_yellow | 7850 | 400 / 400 / 240 | 60000 | only a carve of power > 0.79 cuts it |
| sheet_* (mái tôn), paint_* | 900–1200 | 60 / 60 / 40 | 2500 | corrugated |
| glass, glass_tint | 2500 | 200 / 7 / 7 | 45 | transparent pass, blows out beyond the hole |
| wood, plank, trunk | 550–700 | 30–35 / 35–40 / 6–7 | 520–900 | flammable → charred |
| plaster (+4 colours) | 900 | 6 / 0.6 / 1 | 260 | |
| rooftile | 1800 | 14 / 1.2 / 2 | 900 | |
| asphalt, sidewalk, tile_floor | 2000–2300 | 12–25 | 1000–1900 | |
| soil, grass, gravel | 1300–1700 | 1.2–2 | 280–320 | granular |
| bamboo, thatch, leaf, cloth | 120–400 | 0.1–25 | 12–380 | flammable, thatch is consumed |
| fuel | 1600 | 5 / 2 / 2 | 80 | explosive: a lit or blasted drum detonates |
| charred / ember / cinder | 350 / 450 / 250 | 3 / 14 / 0.1 | 90 / 300 / 15 | burnt wood is an order weaker |
| rubble, rubble_masonry/timber/metal/earth/pale/glass/leaf/flesh | 120–3000 | ≤ 3 | 12–300 | granular, laid by the sandpile rule |
| flesh, skin, cloth, bone, armour, golem_stone, chitin, robot_metal… | | | 40–9000 | mob materials |

## Numbers and where they come from

| What | Value | Doc |
|---|---|---|
| voxel, chunk, step | 0.1 m, 32³, 1/60 s, ≤ 4 steps/frame | destruction.md §1.1, §9 |
| carve threshold | `p0 = max(0, 0.264 + 0.16 ln(T/2200))`, `fac = clamp((power − p0)/0.12, 0, 1)` | destruction.md §4.2 |
| carve shape | core `0.85·R·fac − 0.5`, shell `+ min(0.15·R·fac, 1) + 0.3`, roughness 0.04 metal / 0.22 granular / 0.10 fibrous / 0.15 | §4.2 step 7 |
| carve limits | r ≤ 8 m, power ≤ 1.5, debris `clamp(r, 0.1, 3) × 100` cubes (doc: ×150), dust `× 60` scaled down | §4.2 step 3 |
| explosion | carve at `0.6 × power`; push full inside 2/3 of the reach, linear beyond; ejecta height `max(0.3, 0.3·r·(1.2 + 1.8u))`, speed `sqrt(2·g·h)` | §4.3 |
| tools | rocket r 3 m, satchel 3.5 s fuse r 3.5 m, ball 1.5 t on 8 m rope | §4.4, §12.4 |
| bodies | budget 150, mass / centre / inertia from density × 0.001 m³ | §5, §12.5 |
| stress | level 1 "stack": load above a layer against Σ fc × 0.01 m²; CREAK at 0.8–1, FRACTURE at ≥ 1 | §6, §12.6 |
| rubble | resting debris baked into the grid as `rubble_*`, slides while a neighbour is lower | §8, §12.8 |
| fire | chance × heat per neighbour, burn time → charred / consumed, fuel → `explode` | §7, §12.9 |
| determinism | integer hashes of (voxel, step), fixed dt, `world.digest()` | §10 |
| ledger | `world.ledger()`: world, pieces, debris, destroyed, burnt, offMap; `leak` stays 0 | §1.3 |
| brick / concrete / plank patterns, fracture interiors, bevel width 0.09 voxel | — | voxel-render.md §3.3, §3.4 |
| AO 0.2 m density volume, sky visibility 0.4 m (weights 0.30 / 0.11 / 0.065, floor 0.72) | — | voxel-render.md §3.5, §4.1 |
| scorch profile `clamp((1.15 − d)/0.65)` smoothstep, max-combined | — | voxel-render.md §6.1 |
| SSAO radius 0.42 m, 25–45 m fade; bloom mix 0.075; ACES Hill fit of `c·1.6`; S-curve 0.18; dither | — | voxel-render.md §8 |
| shake `0.45 + 0.35 × yield`, felt to `6 + 9r` m, thud cap 30 kN·s | — | game-feel.md / destruction.md §4.1, §5 |
| audio | see `lib/audio/*` headers | audio-physical.md §2–§13 |

### Things we decided ourselves (not in the docs)

- **Stress normalisation.** The docs could not recover how MPa map to capacity. Each structure is treated as *designed to a utilisation of 0.3* at the weakest layer of its lower 40 % when spawned; an eccentricity factor `1 + 3e/b` (capped at 4) raises the ratio when the load is off the centre of what is left. A centric failure crushes the whole overloaded band; an eccentric one cuts a thin band and gives the piece a small spin toward the cut side.
- **Pancake.** A piece landing upright is checked with the same stack rule using `a = v / 0.06 s` instead of g; the lowest overloaded band of storeys is crushed, the piece splits there and keeps 55 % of its speed. A big piece landing on its side is cut across its long axis.
- **Contact crush.** Energy of a hit against `toughness × 0.27 J` per voxel of the weaker side.
- **Rigid bodies: custom stepper, not Rapier.** Bodies collide through sampled surface voxels against the voxel grids directly, so there are no colliders to rebuild when the world changes (the world changes every frame here), nothing to download (Rapier's wasm is ~2 MB) and the same code runs on phones. The price is weak stacking; resting pieces are baked back into the grid quickly, which hides most of it.

## Adding a generator

**Building / prop.** Create `lib/build/<name>.js`:

```js
import { Canvas, M, rng } from './kit.js';
export default { id: 'my-thing', name: 'Tên tiếng Việt', variants: 3, build(seed) {
  const r = rng(seed), c = new Canvas(60, 80, 60); // x, y (up), z; front faces -z; 1 voxel = 0.1 m
  c.walls(0, 0, 0, 60, 30, 60, M.brick, 2); c.box(0, 30, 0, 60, 32, 60, M.rc);
  return c;
} };
```

Every voxel must be 6-connected to `y = 0` (`c.floating() === 0`), or it falls at spawn. Preview offline with `node tools/preview-build.mjs lib/build/<name>.js <seed> out.png`, then add it to `lib/build/index.js`.

**Mob.** Add an entry to `MOB_DEFS` in `lib/mob/mobs.js`: `parts(r)` returns rows `[name, parent, size, pivot, attach, paint(grid)]` (use `humanoid({...})` for two-legged ones); the voxels within 2.5 of a pivot are that part's joint. `anim: 'human' | 'spider'`, optional `pose`, `smash`, `claw`, `heavy`, `stiff`.

## Verification

`tools/capture.mjs buildings|mobs`, `tools/compare.mjs`, `tools/checks.mjs`, `tools/fps.mjs [--swiftshader]`. Output in `shots/`: one folder + `*_sheet.png` per model, `compare_tower_vs_ref.png`, `compare_house_vs_ref.png`, `report-*.json`.

## Known gaps

- Stress is level 1 only: no coarse node graph, so cantilevers and arches are not solved (a bridge deck with one pier gone falls only through the eccentricity rule). Moving bodies carry no static stress.
- Sim runs on the main thread; detaching a 300k-voxel piece is one 100–150 ms hitch.
- No 2.5 cm fine-detail layer, no heap (smooth mound) shader, no TAA, shafts, auto exposure, FXAA, point lights from lamps, contact-shadow map, water, far-field city. One shadow map, not cascades. Scorch is 16 analytic discs, not a soot volume.
- Sprites are hard-clipped by depth (no soft particles); glass casts no shadow.
- Wrecking ball is weak (dents a brick wall, does not go through it). Debris cubes do not push bodies or mobs.
- Mobs: no pathfinding, they do not burn, limbs are not ragdolls.
- Audio: no occlusion / enclosure reverb, fewer recipes than the reference (31), see the agent notes in `lib/audio/index.js`.
- Baking a rotated piece back into the grid rasterises it, so a few voxels are gained or lost (booked in the ledger).
