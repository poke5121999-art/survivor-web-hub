"""Export the Cat Tower (rules in D:/catsoup-ref/rules/tower.md).

usage: py -3.12 -I export_tower.py [--data] [--prefabs [first-chunk [last-chunk]]] [--theme]
  no flag = all three.
  --data     writes data/tower.json: TowerInfo / TowerProp / TowerMission rows the feature reads and the prefab map
  --theme    the five default room parts and towertheme/* -> art/tower/theme/
  --prefabs  every TowerProp row is a prefab Resources towerprops/<resName> (one textured mesh each), 40 a chunk in
             table order -> art/tower/c<k>/ via export_prefabs.py (textures shared in art/tex)
Visit / return tables (TowerVisitReward, TowerReturnGift) belong to the server-side neighbour system and are left out.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref"
CHUNK = 40
res = {}
for k, f, p in json.load(open(f"{REF}/resources.json")):
    res.setdefault(k, (f, p))


def load(name):
    return json.load(open(f"{REF}/flat/{name}.json", encoding="utf-8"))


props = [r for r in load("TowerProp") if f"towerprops/{r['resName']}" in res]
chunks = [props[i:i + CHUNK] for i in range(0, len(props), CHUNK)]
THEME = ["towerprops/default_floor", "towerprops/default_wall_1", "towerprops/default_wall_2", "towerprops/default_wall_3",
         "towertheme/floor0", "towertheme/floor1", "towertheme/floor2", "towertheme/floor_edge"]
args = sys.argv[1:]
want = lambda f: f in args or not [a for a in args if a.startswith("--")]


def data():
    info = [{"index": r["index"], "type": r["type"], "layer": r["targetlayer"], "max": r["maxLevel"],
             "value": [r[f"levelValue_{i}"] for i in range(4)],
             "costType": [r[f"costType_{i}"] if i else 0 for i in range(4)],
             "cost": [r[f"costValue_{i}"] if i else 0 for i in range(4)]} for r in load("TowerInfo")]
    keys = ("index", "resName", "theme", "type", "detail", "objectSize_X", "objectSize_Y", "objectSize_Z", "reversal",
            "forceEdge", "maxStorage", "actionType", "costType", "cost", "ResaleCost", "ResaleLimitType", "eventType",
            "ItemTag")
    short = {"objectSize_X": "sx", "objectSize_Y": "sy", "objectSize_Z": "sz", "ResaleCost": "resale",
             "ResaleLimitType": "resaleLimit", "ItemTag": "tag"}
    rows = [{short.get(k, k): r[k] for k in keys} for r in load("TowerProp")]
    where = {r["index"]: [k, f"towerprops/{r['resName']}"] for k, ch in enumerate(chunks) for r in ch}
    miss = [r["index"] for r in load("TowerProp") if r["index"] not in where]
    missions = [{k: m[k] for k in ("index", "nextMission", "title", "name", "missionType", "missionValue1", "missionValue2",
                                   "missionCount", "rewardType", "rewardValue")} for m in load("TowerMission")]
    out = {"chunk": CHUNK, "chunks": len(chunks), "info": info, "props": rows, "prefab": {str(k): v for k, v in where.items()},
           "missing": miss, "missions": missions, "theme": THEME}
    with open(f"{GAME}/data/tower.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("data/tower.json:", len(info), "info,", len(rows), "props,", len(where), "with prefab,", len(missions), "missions", flush=True)


def run(out_id, keys):
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_prefabs.py"), out_id] + keys,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
    print(out_id, (r.stdout.strip().splitlines() or ["?"])[-1], r.stderr[-300:] if r.returncode else "", flush=True)


if want("--data"):
    data()
if want("--theme"):
    run("tower/theme", THEME)
if want("--prefabs"):
    i = args.index("--prefabs") if "--prefabs" in args else -1
    nums = [int(a) for a in args[i + 1:] if a.isdigit()] if i >= 0 else []
    first, last = (nums[0] if nums else 0), (nums[1] if len(nums) > 1 else len(chunks))
    for k, ch in enumerate(chunks):
        if first <= k <= last:
            run(f"tower/c{k}", [f"towerprops/{r['resName']}" for r in ch])
