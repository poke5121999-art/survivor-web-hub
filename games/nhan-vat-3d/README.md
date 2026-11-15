# lf-humanoid

Characters built with **Lanternfall's character kit**, ported to three.js r170 for internal use (hub + skill).

**Credit:** the mesh kit, surface shader, human body and wardrobe, heroes, monsters, animation composer, world,
particles and render pipeline are the work of **loktar00** — [Lanternfall](https://github.com/loktar00/lanternfall),
commit `ada0fd5`. The repo has no licence file; this port is for internal use with credit, not for redistribution.
three.js r170 is MIT (`vendor/LICENSE`).

## Pages

- `gallery.html` — Lanternfall's own heroes and monsters, then 9 new themes (3 variants each) composed from the
  ported kit: modern operator, sci-fi trooper, post-apoc survivor, Vietnamese farmer, samurai, fantasy mage, zombie,
  goblin, brute. Animation picker (idle/walk/run/attack/hit/death), views (front, 3/4, back, face), seed + Randomize,
  triangle and draw-call counts. URL: `?t=<theme|lf-heroes|lf-monsters>&v=<all|0|1|2>&a=<anim>&view=<front|3/4|back|face>&s=<seed>`.
- `original.html` — Lanternfall's own gallery (src/90-main.js:259-288), run verbatim from the port. Takes the same
  query as the game: `?gallery&set=heroes|monsters|all&fig=<name>&anim=<...>&t=<0..1>`.

All paths are relative; the folder can be served as a GitHub Pages sub-folder.

## Layout

| Path | What |
|---|---|
| `scripts/fetch-lanternfall.sh` | clone Lanternfall at the pinned commit, check sha256 of every used file |
| `tools/port-lf-*.js`, `tools/lf-port-lib.js` | generators: slice line ranges, anchored replacements, r170 check, write `lib/lf/*.js` |
| `tools/gate.js` | regenerate into a temp dir, require byte-identical `lib/lf/` |
| `lib/lf/` | **generated** — never edit by hand |
| `lib/lf-host.js` | host shim (THREE, LF, QS, qnum, view size hooks) |
| `lib/stage.js`, `lib/arm-ik.js`, `lib/theme-kit.js`, `lib/themes.js` | hand-written adapters and the new themes |
| `tools/compare-originals.js`, `tools/shoot-themes.js`, `tools/serve.js` | Playwright checks and the local server |
| `shots/` | captures, `compare-originals.png`, `compare/`, `sheet-*.png` |

## Rebuild and check

```sh
sh scripts/fetch-lanternfall.sh ~/lanternfall-ref        # or use an existing checkout via LF_SRC
LF_SRC=~/lanternfall-ref/repo node tools/port-lf-all.js
LF_SRC=~/lanternfall-ref/repo node tools/gate.js         # GATE PASS = byte-identical
node tools/serve.js 8765 900 &                            # serves ./ and the Lanternfall checkout at /ref/
node tools/compare-originals.js && node tools/shoot-themes.js
```

See `SKILL-NOTES.md` for line ranges, the host shim, r158 -> r170 traps and the composition API.

## Chibi-survivor preset (owner's character sheets)

Stylized people for the code-only Walking Trade remake and later games, built from the owner's own concept sheets
(`ref/owner-roster-nanobanana.webp` 6x20, `ref/owner-zombies-sheet.webp` 2x5, two scene images). Same kit underneath:
one skinned mesh, one material, one draw per character (a pet dog is its own mesh, +1 draw), Lanternfall's HumanAnim.

| Page | What |
|---|---|
| `roster.html` | the 6x20 line-up like the sheet (all 120 built) and the zombie tab (10); click / tap one to inspect: orbit, idle / ready / walk / run / attack / hit / death, triangle and draw counts. `?v=zombies`, `?inspect=r1c14&a=walk`, `?still` |
| `scene-campfire.html` | 4 survivors round a burning drum (chair with crossed leg, ground leaning back, arms crossed, relaxed rifle) with props from `ext/stylized-props` and an AK from `ext/stylized-weapons`; flickering warm fire light + cool ambient |
| `scene-workshop.html` | soldier inspecting an AK (two-handed, grip IK on the weapon's `grip2`), bearded smoker seated at the gunsmith bench, desk-lamp light |

| Path | What |
|---|---|
| `lib/chibi/body.js` | rig (humanRig's 28 bones, longer torso/arms, Lanternfall leg joints), body tables, shoe, mitten fist, head + face, hair, beard, `headShell` |
| `lib/chibi/mat.js` | clean stylized material (check / camo / floral prints, soft lift, rim, light spatter) |
| `lib/chibi/wear.js`, `headgear.js`, `props.js` | garment / headgear / held-prop builders, all `(c, opts)` |
| `lib/chibi/poses.js` | carry / ready / clips per pose, scene poses (sit, lean, inspect, desk), zombie shamble + lunge |
| `lib/chibi/compose.js` | `buildChibi(spec)` -> Lanternfall-shaped def; zombie face and wounds |
| `lib/chibi/stage.js`, `dog.js`, `scene-kit.js`, `scene-page.js` | studio stage + `Actor`, dog companion, hand sockets for external meshes, scene runner |
| `lib/roster/row1..6.js`, `zombies.js`, `scenes.js` | one data spec per character |
| `ref/cells/`, `ref/zcells/`, `ref/roster.md` | per-character crops (`tools/crop-roster.py`, `tools/crop-zombies.py`) and the description list |
| `ext/` | snapshot of the sibling kits (`sh tools/sync-ext.sh`); the scene pages' import map points their three.js at `./vendor` |

Checks (server first: `node tools/serve.js 8765 1800 &`): `node tools/shoot-roster.js` (side-by-side
`shots/roster/side-r1..r6.png`, `side-z.png`, `lineup.png`, `stats.json`), `node tools/shoot-scenes.js`
(`shots/roster/scene-campfire.png`, `scene-workshop.png`), `node tools/peek-roster.js <ids> <out.png> [anim]`
(front / 3/4 / side / back; `DIST=1.6 TY=1.55` for faces), `node tools/pose-tune-roster.js <id> <out.png> '[{bone:[x,y,z]},...]'`
(try carry-pose candidates live, one row each), `node tools/shoot-phone.js` (390 px wide: overflow + console errors,
`shots/roster/phone-*.png`).
