# Export: npc/ (object_npc_* bundles)

Tool: `games/world-of-slime/tools/export_npc.py` (uses export_slime.py as its library).

## Run

```
cd D:\survivor-web-hub\games\world-of-slime\tools
py -3.12 -I export_npc.py                          # all 110 bundles, pool of 4, ~1.5 min; clears npc/ first
py -3.12 -I export_npc.py --only larus_bigman,box_001
```

## Output (D:\world-of-slime-assets\npc\)

- `<Prefab>.glb`: skeleton + meshes (skinned and static) + textures + every clip its Animator controller states use.
  Prop bundles (box, cart, footprints, lightningrod, stones, ...) have static meshes and no clips.
- `shared/*.webp`: shader ramps/matcaps.
- Measured: 110 prefabs from 110 bundles, 0 errors, 94 with controller states, 92 humanoid, folder 93 MB (clips ~30 MB; clips are not shared between NPCs with the same avatar yet).
- `index.json` `npcs[{id, glb, kb, bundle, meshes, materials, textures, controller, kind, base, animatorNode,
  states[{layer, name, clips, speed, loop, default}], clips[{name, dur, loop, channels, events}], humanoid{avatar}}]`.
  Walk = state `MoveState`; idle = `IdleBase`; plus Laugh, Cry, Frown, Sigh, Surprised, Agree, Angry, Sleepy,
  IdleAction1/2, IdleDialogue, Disagree, Amazed, Cough, Skeptical, Ashamed, Thinking.

## How states are found

`Animator.m_Controller` = AnimatorOverrideController (object_shared_animationcontroller*.bundle) over a base controller
(NPC_Default, NPC_Default_WithApproach, NPC_Default_Mixing). State -> clip = base controller compiled state machine
(`m_StateConstantArray[].m_BlendTreeConstantArray[].m_NodeArray[].m_ClipID` -> `m_AnimationClips`), then the override
table (`m_Clips` original -> override). State names come from `m_TOS`.

## Humanoid clips (the big trap)

NPC and player clips are **Humanoid**: the body moves through 130 Animator curves (binding typeID 95), not transform
curves. Attribute 7-9 RootT, 10-13 RootQ, 14-41 IK goals (ignored), 42-136 the 95 muscles in HumanTrait order. Only
props, eyebrows, dress and cape bones have transform curves. Without baking, NPCs stand in T-pose.
`Humanoid` in export_npc.py bakes muscles to bone rotations from the Avatar (`m_Human.m_Skeleton.m_AxesArray`):
muscle -> (x, y, z) DoF per HumanBodyBones bone (Mecanim tables), `LimitUnproject` (v<0: -v*min, else v*max) times
`m_Sgn`, ZYRoll quaternion from tan(angle/2), then `preQ * q * conj(postQ)` = local rotation. Hips: body centre =
(RootT * m_Human.m_Scale, RootQ); hips = body * (inverse(m_RootX) * hips T-pose global); then made local to the hips'
real parent (`Bip001`, whose rest transform comes from the prefab, not the human pose: human space = Animator root).
Not done: Unity's twist distribution (m_ArmTwist, m_ForeArmTwist, m_UpperLegTwist, m_LegTwist) and IK goals.
Proof (side view, two times of the walk): `D:\wos-ref\proof\slime\t_chars_side.png`, `t_chars_side2.png`.

## Other traps

- NPC_Larus_Frog reuses `character_sl_frog_watermagic.bundle`, whose deps sit 2 levels down: retry with depth 2/3 on
  FileNotFoundError, and keep only `/Object/Models/` prefabs (the slime bundle's own prefabs are in the env too).
