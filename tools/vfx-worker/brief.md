You are making one pixel-art VFX effect with the pixelfx engine, in the current directory (a pixelfx checkout). The result is the single file `src/fx/studio/{{slug}}.js`, effect id `{{effect_id}}`.

## The artist's request (verbatim)

Title: {{title}}

{{request}}

## Direction from the artist's settings

{{direction}}

{{base}}
{{parent}}

## References

{{refs}}

## Second reference library: Pixel VFX Codex

`{{codex}}` (MIT, read-only) holds 138 more pixel VFX: game effects, anime-style ultimates built in six stages (Pose → Charge → Shape → Motion → Impact → Aftermath), mass spells against a horde, summoned weapons. Each `fx/<id>.js` describes its effect as a `timeline` and `layers` in plain English plus `beats` and a `palette`; `data/meta.json` lists them all with categories and descriptions (`grep -il <word> {{codex}}/data/meta.json`), and `{{codex}}/docs/AUTHORING.md` explains the stage kit. It runs on a different engine, so use it for ideas, structure, timing and palettes, never copy its code. Look there too when the request is a big spell, an ultimate or a mass effect.

## Method (mandatory)

1. Read `skills/pixelfx/SKILL.md` (section 3 especially) and `docs/AUTHORING.md` before writing any code.
2. Look at 2 or 3 library effects in `src/fx/` closest to the request (and the closest Pixel VFX Codex entries) and learn how they are built.
3. Open every reference image above with the Read tool and study shapes, colour ramps, timing and silhouette. Take the motif and feel from it, do not trace it.
4. Draft the effect, then run at least 3 rounds of: `node tools/render.mjs studio/{{slug}}`, look at `records/studio/{{slug}}/contact.png` with the Read tool, fix what is wrong (silhouette, readability at 1x, palette discipline, motion, timing, clean ending for one-shots, seamless wrap for loops).
5. `node tools/check.mjs studio/{{slug}}` must pass clean: no FAIL and no warnings. Fix the file until it does.
6. If the settings above call for an actor, the module exports a proper `act` as in `docs/AUTHORING.md`; check it with `node tools/act.mjs studio/{{slug}}`.

## Rules

- Write only `src/fx/studio/{{slug}}.js`. Temporary drafts inside `src/fx/studio/` must be deleted before you finish. Never edit `src/core`, `tools`, `docs` or other effects.
- No git. No network access, no installing packages.
- Imports inside the file are relative to `src/fx/studio/` (for example `../../core/index.js`).
- `meta.name`: a short name in Vietnamese. `meta.desc`: one sentence in Vietnamese describing the effect.
- Use generic motifs only. Never recreate a specific game's sprites, characters or logos, even if a reference resembles one.
- When the check is clean and you are happy with the contact sheet, stop with a one-line summary.
