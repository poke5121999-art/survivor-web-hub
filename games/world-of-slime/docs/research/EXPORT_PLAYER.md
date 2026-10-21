# Export: player/ (avatar kit from customize + customize_shared)

Tool: `games/world-of-slime/tools/export_player.py` (uses export_slime.py and export_npc.Humanoid).

## Run

```
cd D:\survivor-web-hub\games\world-of-slime\tools
py -3.12 -I export_player.py        # ~40 s, clears player/ first
```

## Output (D:\world-of-slime-assets\player\)

- `PC_Man_BaseRig.glb`, `PC_Woman_BaseRig.glb`: the rigs (41 nodes, no mesh). Both rigs have the same bone paths.
- `parts/<Prefab>.glb` (98): Top, Bottom, TopBottom (dresses), Gloves, Shoes (+ `_Under` variants), Cape, Hair (22 with
  a mesh; Hair000 is empty), Face, Eyebrow L/R (10 each per gender). Body parts carry their own copy of the rig bones.
- `anim_man.glb`, `anim_woman.glb`: skeleton-only GLBs with all 85 clips, humanoid muscles baked per rig Avatar.
- `face/*.webp`: the CustomizeDataSet face decal + decal mask textures (10 per gender each).
- `index.json`: `rigs{man, woman}` (controller PC_Man_Animator / PC_Woman_Animator over PC_Default, states -> clips:
  Idle, Walk, Run, Hit, Throw, SlimeAttack, fishing, emotes ...), `attach`, `capeAnchor`, `defaults{man, woman}`,
  `slots{gender: {slot: [ids]}}`, `parts[{id, slot, gender, under, attach, glb, meshes, materials, skinBones,
  springBones}]`, `anim{man, woman, clips}`, `customize` (lensColors, hairColors, faceOffsetVector4s, face texture files,
  accDecalMultiplyFlags).

## Assembly (constants read from SM.Common.Character.CharacterBuilder with il2cpp_method.py)

- Body parts: bind each skinned mesh to the rig bones with the same name; part-only bones (cape bones, hair bones) go
  under the rig bone that matches their parent.
- Hair and Face prefab roots go under `Root_PC_Head`; Eyebrow L/R under `Bone_Eyebrow_L1` / `Bone_Eyebrow_R1`; cape
  anchor bone `Bip001 Spine1`.
- Defaults: consts `Costume001_Top`, `Costume001_Bottom`, `Costume000_Gloves`, `Costume001_Shoes`, `Costume001_Cape`.
  Hair, eyebrow and face have no default const: the index takes the first part with a mesh (Hair001, Eyebrow000, Face).
- Tints are applied by the renderer, not baked: hair albedo is near-white and is multiplied by `hairColors[i]`;
  skin = 4x4 tone atlas `_SkinTex` picked by `_SkinNum` (1-16); face expressions = 3x3 decal atlas on UV1 (`_DecalView`);
  lens colour via the decal mask + `lensColors` (not done in the proof viewer, so eyes look grey).
- Assembly is implemented in `D:\wos-ref\proof\slime\sheet.html` (`playerCell`).
