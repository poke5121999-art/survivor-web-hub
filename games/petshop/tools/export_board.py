"""Store board sprites and level reward icons: (StoreNameChangeHelper.colorDataList: boardSprite + panelBgSprite per colour) -> art/ui/board_<k>.png
and art/ui/boardpanel_<k>.png. Usage: python -I tools/export_board.py ; then to_webp.py."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm

OUT = os.path.join(os.path.dirname(HERE), "art", "ui")
BOARD = [1256, 1184, 1071, 1457, 1170, 1416]
PANEL = [1488, 1354, 1508, 1579, 1536, 1247]
env = mm.load()
want = {}
# LevelRewardUIHelper.rewardDataList sprites -> art/ui/reward_<pathId>.png (tools/export_rewards.mjs picks them up)
import json
scene = json.load(open(os.path.join(os.path.dirname(HERE), "art", "store", "scene.json")))
lr = next(n["k"]["LevelRewardUIHelper"] for n in scene["nodes"] if n.get("k") and "LevelRewardUIHelper" in n["k"])
for r in lr["rewardDataList"]:
    for x in r["subRewardList"]:
        if x.get("rewardSprite"): want[x["rewardSprite"]["id"]] = f"reward_{x['rewardSprite']['id']}.png"
for i, pid in enumerate(BOARD): want[pid] = f"board_{i}.png"
for i, pid in enumerate(PANEL): want[pid] = f"boardpanel_{i}.png"
for o in env.objects:
    if o.assets_file.name == "sharedassets1.assets" and o.path_id in want and o.type.name == "Sprite":
        o.read().image.save(os.path.join(OUT, want[o.path_id]))
        print(o.path_id, want[o.path_id])
