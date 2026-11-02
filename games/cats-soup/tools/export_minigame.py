"""Export the mini game tables -> data/minigame.json (feature `minigame`).

usage: py -3.12 -I tools/export_minigame.py
Sources: D:/catsoup-ref/flat/{SeasonSubGame,SeasonSubGameCollect,SeasonSubGameReward,MiniGame,MiniGameReward,Magnet,
  MagnetBoard,ThemeMagnet}.json (plain JSON).
  subGames        [{index, gameType, startDay, endDay}]               SeasonSubGame (gameType 1 butterfly, 2 mole)
  subCollect      [{group, names[3], rewardType, rewardValue, prob}]   SeasonSubGameCollect (group = rewardGroup)
  subReward       [[group, needCount, kind (0 single, 1 season), n, rewardType, rewardValue]]
  miniGames       [{index, gameType, startDay, endDay}]                MiniGame (gameType = eMiniGameType 1..9)
  miniReward      [[group, needCount, kind, n, rewardType, rewardValue]]
  magnets         [{index, resName, name, type, region, dest, sell, prob}]  Magnet
  boards          [{index, resName, cost, eventType}]                  MagnetBoard
  themes          [{index, resName, cost, costType, eventType}]        ThemeMagnet
"""
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
FLAT = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(n):
    with open(os.path.join(FLAT, n + ".json"), encoding="utf-8") as f:
        return json.load(f)


def rewards(rows):
    return [[r["rewardGroup"], r["needCount"], 0 if r["actionType"] == "singlereward" else 1, r["requireValue"], r["rewardType"], r["rewardValue"]]
            for r in rows]


out = {
    "subGames": [{"index": r["index"], "gameType": r["gameType"], "startDay": r["startDay"], "endDay": r["endDay"]} for r in load("SeasonSubGame")],
    "subCollect": [{"group": r["rewardGroup"], "names": [r["collect1"], r["collect2"], r["collect3"]], "rewardType": r["rewardType"],
                    "rewardValue": r["rewardValue"], "prob": r["spawnProbability"]} for r in load("SeasonSubGameCollect")],
    "subReward": rewards(load("SeasonSubGameReward")),
    "miniGames": [{"index": r["index"], "gameType": r["gameType"], "startDay": r["startDay"], "endDay": r["endDay"]} for r in load("MiniGame")],
    "miniReward": rewards(load("MiniGameReward")),
    "magnets": [{"index": r["index"], "resName": r["resName"], "name": r["displayName"], "type": r["type"], "region": r["region"],
                 "dest": r["travelDestination_id"], "sell": r["sell"], "prob": r["probability"]} for r in load("Magnet")],
    "boards": [{"index": r["index"], "resName": r["resName"], "cost": r["cost"], "eventType": r["eventType"]} for r in load("MagnetBoard")],
    "themes": [{"index": r["index"], "resName": r["resName"], "cost": r["cost"], "costType": r["costType"], "eventType": r["eventType"]} for r in load("ThemeMagnet")],
}
p = os.path.join(GAME, "data", "minigame.json")
with open(p, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(p, os.path.getsize(p), {k: len(v) for k, v in out.items()})
