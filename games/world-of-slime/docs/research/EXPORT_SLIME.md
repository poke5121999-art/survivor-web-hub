# Export: slime/ (218 slime variants)

Tool: `games/world-of-slime/tools/export_slime.py` (also the shared library for export_npc.py / export_player.py:
Skel, Builder, add_clip, encode_webp, write_index).

## Run

```
cd D:\survivor-web-hub\games\world-of-slime\tools
py -3.12 -I export_slime.py                    # all 120 species / 218 variants, pool of 4, ~1 min; clears slime/ first
py -3.12 -I export_slime.py --only bat,mantis  # rewrite some species, merge into the existing index.json
```

## Output (D:\world-of-slime-assets\slime\)

- `SL_<Species>_<Elements>.glb` (218): the `_Normal` prefab named by data.bundle `SlimeRenderingData.normalModelResourceName`
  (Base + default equipment already combined into one SkinnedMeshRenderer, one submesh per material). Mesh + skin + all
  textures (WebP q85; mask and decal lossless). No clips, except Mantis (see below).
- `anim/<species>.glb` (119): skeleton-only GLB (nodes only, rest pose of the first variant) with every clip of
  `character_shared_sl_<species>.bundle`. Bind it on the variant scene: `new AnimationMixer(variant.scene).clipAction(clip)`;
  three.js resolves tracks by node name.
- `shared/*.webp`: shader.bundle ramps and matcaps (`TCP2_Ramp_cartoon_intense`, `Mixmaster_Matcap03/16`, `MixMasterSinRamp`, ...).
- `index.json`: `elements` (13, id 20001..20013, pastel/game/death colours from CommonDataSet), `species{glb, clips[{name,
  dur, loop, channels, events}], boneSetsIdentical, variants}`, `variants[{id, species, elements, elementIds, glb, anim,
  actions{Idle: clip, Walk: clip, ...}, rule (SlimeRenderingData), modelInfo{ropeAttachBone, wwiseFootstepEvent}
  (SlimeModelInfo), materialModifiers[{materialId, enableDecalView, _decalView, enableSubDecalView, _subDecalView}]
  (SMMaterialModifier), materials[{shader, keywords, floats, colors, shared}] (all material params, incl. _BlinkEnabled,
  _DecalCount, _DecalView), textures, bones, bonesMissingVsSpecies}]`.
- GLB material `extras`: `shader`, `keywords`, all `floats`/`colors`, `tex{albedo, mask, decal, emission, ...}` = glTF
  texture indices, `shared{_Ramp: "slime/shared/....webp"}`, `texST`. Animation `extras`: `loop`, `duration`, `events`
  (footsteps), `decalWeights` (face expression weights, SMMaterialModifier.decalViewWeight1..9), `subDecalWeights`,
  `mbCurves`, `activeCurves` (GameObject on/off).

## Measured

- 218 variants, 120 species, 0 errors, folder 85 MB (variants ~53 MB, anim ~32 MB), largest file 1.0 MB. Clip split: bone sets are identical inside a species except Golem (GroundPower has
  6 extra finger bones), Skull (DarkPower has 2 extra eye bones) and Mantis. Extra bones are harmless for name binding.
  **Mantis keeps its clips inside each variant GLB** (`clips: "embedded"`): `LeftHand`/`RightHand` sit under
  `LeftArm/LeftForearm` in Mantis_Grass but directly under `LeftArm` in Mantis_GrassSteel, so one name maps to two paths.
  The check only counts animated names (Wraith has two unanimated FX nodes called `Smoke`, so it keeps a species GLB).
- Some species ship variant-specific clips in the shared bundle (Skull: `SL_Skull_0_*` + `SL_Skull_DarkPower_*` +
  `SL_Skull_DarkSteel_*`; Bushtit and Mantis: `SL_<Species>_<Tag>_0_*`). `variants[].actions` resolves action -> clip
  (variant-specific wins over `_0_`). 12 variants have only 4 actions (their species bundle has only 4 clips).
- Mercury, Pixy, PoisonDino clips bind 12 paths that exist in no variant (`unresolvedBindings`); they render fine.
- Clips: 30 fps samples, linear key reduction (error 1e-3) and int16-normalised quaternions. That only saved ~10%: most of
  each anim GLB is accessor JSON, not data.

## Proof

`D:\wos-ref\proof\slime\sheet_final.png` (24 random slimes Idle + 6 NPC + man/woman walking),
`sheet_slimes.png`, `sheet_special.png` (Mantis/Golem/Skull/Wraith edge cases, Walk), `t_chars_side*.png`.
Viewer: `D:\wos-ref\proof\slime\sheet.html` + `shoot.js` (serve `D:\` with `py -3.12 -m http.server --bind 127.0.0.1
--directory D:\ 8766`). The shader in sheet.html is the proto approximation of `MixMaster/Unit/Unit Matcap wip`.

## Traps hit

1. GLB.write drops empty lists, so `glb.j['materials']` is missing on a meshless prefab: use `.get('materials', [])`.
2. SMMaterialModifier `<Renderer>` points at a component, not a Transform: Skel maps component path ids too.
3. Parallel workers writing the same shared ramp: `os.replace` can raise PermissionError on Windows; keep the first file.
4. three r160 declares `uv1` only when the geometry has it: guard with `#ifdef USE_UV1` in custom shaders.
5. Clip names do not always match the variant name's case or form (`SL_ManTis_...`, `SL_Bushtit_WindLight_0_*`).

## Not done

- Base + EQ part prefabs (equipment swapping) are not exported, only Normal. 12 materials use
  `MixMaster/Unit/Unit ViewUVScroll wip2` (UV scrolling), and the sheet renders them as the plain unit shader.
