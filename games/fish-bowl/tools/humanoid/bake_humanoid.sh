#!/bin/sh
# Bake Timmy's Humanoid clips to bone transforms: art/anim/humanoid.json.
#   sh games/fish-bowl/tools/humanoid/bake_humanoid.sh
# Needs Unity 6000.0.77f1 (opens a throwaway project at $FL_REF/bake; the clips are 2022.3 assets, they upgrade fine)
# and the AssetRipper project $FL_REF/ripped/ExportedProject (README "Humanoid"). ~2-3 GB while Unity runs.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REF=${FL_REF:-D:/fishlife-ref}
UNITY=${UNITY:-"C:/Program Files/Unity/Hub/Editor/6000.0.77f1/Editor/Unity.exe"}
PROJ=$REF/bake
RIP=$REF/ripped/ExportedProject/Assets
CLIPS="Kneeling Down|Standing Yell|Hiding Grab|M_wave|HumanoidWalkRight|TTB_wave|TTB_grabup|HumanoidWalk|TTB_talk2|TTB_talk1|Idle_1|Idle5|WalkFwdLoop"

if [ ! -d "$PROJ/Assets" ]; then
  timeout 900 "$UNITY" -batchmode -nographics -createProject "$PROJ" -quit -logFile "$REF/bake-create.log"
fi
mkdir -p "$PROJ/Assets/Bake" "$PROJ/Assets/Editor"
cp "$HERE/HumanoidBake.cs" "$PROJ/Assets/Editor/"
cp "$RIP/Avatar/TeenBoyRiggedAvatar.asset" "$RIP/Avatar/TeenBoyRiggedAvatar.asset.meta" "$PROJ/Assets/Bake/"
echo "$CLIPS" | tr '|' '\n' | while read -r c; do
  cp "$RIP/AnimationClip/$c.anim" "$RIP/AnimationClip/$c.anim.meta" "$PROJ/Assets/Bake/"
done
PYTHONIOENCODING=utf-8 py -3.12 "$HERE/rig_json.py" "$PROJ/Assets/Bake/rig.json" "$CLIPS"
rm -f "$PROJ/baked.json"
timeout 1200 "$UNITY" -batchmode -nographics -projectPath "$PROJ" -executeMethod HumanoidBake.Run -quit -logFile "$REF/bake-run.log" || true
grep "\[bake\]" "$REF/bake-run.log" || tail -40 "$REF/bake-run.log"
test -s "$PROJ/baked.json"
PYTHONIOENCODING=utf-8 py -3.12 "$HERE/baked_to_web.py" "$PROJ/baked.json"
