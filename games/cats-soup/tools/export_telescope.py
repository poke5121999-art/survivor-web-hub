"""Export the tables of the telescope feature: Telescope.json (star-observation rewards), TelescopeSeason.json (the six
seasons), StarTree*.json (the star-tree event), the Shop rows the observatory charges gems with, and the observatory
building (Work 110, eventType 4, so not in the core's places.json) as its own prefab library art/telescope/place110.

usage: py -3.12 -I tools/export_telescope.py [--art]        -> data/telescope.json (+ art/telescope/place110, art/startree with --art)
Only the columns the feature reads are kept. Day columns are YYYYMMDD integers (Entity_*.Param turns them into DateTime).
"""
import io, json, os, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
REF = "D:/catsoup-ref/flat"
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)


def load(name):
    with io.open(os.path.join(REF, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


shop = {}
for r in load("Shop"):
    # the first row of an index wins: UI_Observatory finds it with List.Find (Shop.json repeats index 139)
    if r["index"] in (1, 2, 35, 139, 140, 147) and r["index"] not in shop:
        shop[r["index"]] = {"index": r["index"], "name": r["resName"], "cost": r["cost"], "costType": r["costType"]}

out = {
    "telescope": [{"index": r["index"], "type": r["itemType"], "special": r["isSpecialItem"], "rt": r["rewardType"],
                   "rv": r["rewardValue"], "season": r["seasonName"], "quarter": r["quarter"]} for r in load("Telescope")],
    "seasons": [{"index": r["index"], "name": r["seasonName"], "start": r["startDay"], "end": r["seasonEndDay"],
                 "q1": r["quarter1EndDay"], "q2": r["quarter2EndDay"]} for r in load("TelescopeSeason")],
    "shop": shop,
    "star": {
        "event": [{"index": r["index"], "start": r["start_day"], "end": r["end_day"]} for r in load("StarTreeEvent")],
        "cats": [{"index": r["index"], "selected": r["selected_cat"], "catType": r["cat_type"]} for r in load("StarTreeCat")],
        "growth": [{"level": r["level"], "exp": r["required_exp"], "prefab": r["startree_prefab"],
                    "rt": r["reward_type"], "rv": r["reward_value"]} for r in load("StarTreeGrowth")],
        "reward": [{"index": r["index"], "count": r["require_count"], "rt": r["reward_type"], "rv": r["reward_value"]}
                   for r in load("StarTreeReward")],
        "skills": [{"index": r["index"], "icon": r["icon"], "catAni": r["cat_ani"], "equip": r["equip"],
                    "point": r["growth_point"], "cooldown": r["cooldown"]} for r in load("StarTreeSkill")],
    },
}
path = os.path.join(GAME, "data", "telescope.json")
with io.open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", path, {k: (len(v) if hasattr(v, "__len__") else v) for k, v in out.items()})

if "--art" in sys.argv:
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_prefabs.py"), "telescope/place110", "places/place110"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
    print("place110:", (r.stdout.strip().splitlines() or ["?"])[-1][:200], flush=True)
