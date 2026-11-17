# art/anim

Produced by `tools/export_anim.py` (generic clips + controllers), then `tools/export_humanoid.py` (baked humanoid clips,
rewrites clips.json; run it every time after export_anim.py). Logs: `export.log` (export_anim).

## clips.json

```
{ "clips": { "<name>@<file>:<pathId>": clip, "<name>@<file>:<pathId>|<Rig>": clip, ... },
  "humanoid": { "doc", "rigs", "owners", "aliases" } }
clip  = { name, duration, loop, tracks: [ { path, bone, prop: "position"|"quaternion"|"scale", times, values } ],
          humanoid?: true, rig?, alias?, travel? }
```
Generic clips: tracks bind by `path` relative to the Animator's GameObject. Coordinates are three.js (z mirrored).

### Humanoid (Mecanim muscle) clips
15 clips (the Player / enemy locomotion, jump, carry "mixamo.com", attack, cast clips) bind Animator muscles, not
Transforms. In `clips` they carry `"humanoid": true` and no bone tracks of their own. For every humanoid Avatar of the
GamePlay scene the baked variant is stored as `"<generic clip key>|<Rig>"` with the same track shape:

- Rigs: `Player1`..`Player6`. Each Player has its own Avatar (T-Pose Avatars 1197..1202 of sharedassets2). The four
  EnemyAI objects use the same six Avatars, so `humanoid.owners` maps `enemy -> Player2`, `enemy (1) -> Player3`,
  `enemy (3) -> Player5`, `enemy (4) -> Player6` (and `Player1 -> Player1`, ...). Use `owners[<scene object>]`.
- `track.path` is relative to the rig node: the child of the Player / enemy object that has `mixamorig:Hips` below it
  (`T-Pose (N)` or `PlayerMesh`). 23 tracks per clip: rotation of every human bone, hips position (vertical bob and
  sway only).
- Root motion: the horizontal travel of the hips is removed (the game moves the characters by CharacterController /
  NavMeshAgent). What was removed is `clip.travel = [x, z]` in rig-node units per second (three axes). The locomotion clips
  are authored in place (travel ~0), so match the playback speed to the ground speed yourself: the planted feet of
  `Run` move at ~1.4-1.7 world units/s at the player's scale, `Walking` ~0.86, `Running` ~2.4-2.6 (tools/anim_check.js).
- `humanoid.aliases`: `Run`, `Walking`, `Idle.1129` (enemy idle) / `Idle.1133` (player idle), ... -> generic key; a name
  used by two clips gets `.<pathId>`.
- Look-up: `clips[aliases[alias] + "|" + owners[owner]]`. Viewer: `viewer.html?s=world&clip=Run&rig=Player1[&t=0.3&view=side]`.
- Muscle math (HumanoidMuscleType, Avatar axes, RootT/RootQ body frame) is in `tools/humanoid.py`.

Checks: `node tools/anim_check.js Player1` writes `~/stealegg-ref/shots/anim-*.png` and prints a planted-foot slide measure.

## Unresolved bone paths (investigated, not recoverable)

Generic bindings are `crc32(path)`; the hash table holds every transform path of every file. What stays unresolved:

- Tungtungtung_Sahur idle/move (4 clips, 17 paths, 0 resolved): the root `Tungtungtung_Sahur_Rig` hashes correctly, but no
  GameObject of that rig, no prefab and no data row mentions Tungtung anywhere in the build (rig stripped). Used by no
  controller of a prefab that exists. 7 of its 17 paths can be reconstructed by name (`Bone.002`, `Bone.002/Bone.003_L/...`)
  but there is nothing to bind them to.
- Brr Brr Patapim (4 bones), Chimpanzini (1), DinDinDinDun (2), La Vacca Saturnita (2), TaTaTaSahur (2): the clip drives
  bones (`Bone.009_L`, `Bone.010_R`, `Bone/Bone.006`, ...) that are not in the build's prefab of that brainrot (authoring
  rig had more bones). Every track that can bind does: all other tracks of every clip used by a prefab bind 100%.
- `PepiKivi sleep` is set as the sleep clip of Dolfinita / Saturnita / TaTaTaSahur by their override controllers
  but animates Pipi Kiwi bones: binds 0 tracks there, as in Unity. `Armature_Tim cheese_*` used by FrigoCameri binds 6 of 30.
- `Run` (12 paths) and `Idle` 1133 (6 paths) humanoid clips carry stray Transform curves on bones that do not exist in the
  Player rigs; the baked humanoid tracks replace them.
