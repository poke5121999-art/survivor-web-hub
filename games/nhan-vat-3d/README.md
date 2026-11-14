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
