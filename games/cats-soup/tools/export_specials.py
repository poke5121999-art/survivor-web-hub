"""Export the tables of the type-4 special facilities -> data/specials.json (feature `specials`).

usage: py -3.12 -I tools/export_specials.py
Sources: D:/catsoup-ref/flat/{BasketBall,Ball,SurpriseStore,SurpriseStoreSlotAdd,BGM,Shop}.json (plain JSON).
  basketball  [{score, rewardType, rewardValue}]            BasketBall.json
  balls       [{index, resName, weight, rewardType, rewardValue}]  Ball.json rows with eventType 0
  surprise    [[index, season, category, rewardType, rewardValue, costType, costValue, weight]]  SurpriseStore.json
  slotAdd     [price...]                                    SurpriseStoreSlotAdd.json (kept for the doc, unused)
  bgm         [{index, resName, cost, costType, howAquire}] BGM.json rows with eventType 0
  chestGem    300                                           Shop.json row resName "gacha" index 0
"""
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
FLAT = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(n):
    with open(os.path.join(FLAT, n + ".json"), encoding="utf-8") as f:
        return json.load(f)


shop = [r for r in load("Shop") if r["resName"] == "gacha"]
out = {
    "basketball": [{"score": r["score"], "rewardType": r["rewardType"], "rewardValue": r["rewardValue"]} for r in load("BasketBall")],
    "balls": [{"index": r["index"], "resName": r["resName"], "weight": r["probability"], "rewardType": r["rewardType"],
               "rewardValue": r["rewardValue"]} for r in load("Ball") if r["eventType"] == 0],
    "surprise": [[r["index"], r["season"], r["category"], r["rewardType"], r["rewardValue"], r["costType"], r["costValue"], r["weight"]]
                 for r in load("SurpriseStore")],
    "slotAdd": [r["addPrice"] for r in load("SurpriseStoreSlotAdd")],
    "bgm": [{"index": r["index"], "resName": r["resName"], "cost": r["cost"], "costType": r["costType"], "howAquire": r["howAquire"]}
            for r in load("BGM") if r["eventType"] == 0],
    "chestGem": shop[0]["cost"],
}
p = os.path.join(GAME, "data", "specials.json")
with open(p, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(p, os.path.getsize(p), {k: len(v) if hasattr(v, "__len__") else v for k, v in out.items()})
