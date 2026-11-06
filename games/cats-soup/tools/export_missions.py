"""Write data/missions.json: the mission, quest, scratch-card and attendance tables the missions feature reads, plus
the event rules that drive every counter (the rule table is this port's mapping of the original's achieve types to
sim events; rules/missions.md in D:/catsoup-ref explains each).

usage: py -3.12 -I tools/export_missions.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref/flat"


def load(name):
    return json.load(open(f"{REF}/{name}.json", encoding="utf-8"))


# Achieve type -> how sim events feed it. ev: event names; where: fields that must equal; amount: event field to add
# (default 1); recipe: 'unlock' (a recipe goes 0 -> 1) or 'level' (levels gained, optional line).
COMMON = {
    0: {"ev": ["sell"]}, 1: {"ev": ["build"]}, 2: {"ev": ["upgrade"], "amount": "levels"},
    3: {"ev": ["recipe"], "recipe": "unlock"}, 4: {"ev": ["feed"]}, 5: {"ev": ["chest"]}, 6: {"ev": ["jar"]},
    7: {"ev": ["fish"]}, 8: {"ev": ["balloon"]}, 9: {"ev": ["capsule"]}, 10: {"ev": ["expand"]},
    11: {"ev": ["recipe"], "recipe": "level", "line": 0}, 12: {"ev": ["recipe"], "recipe": "level", "line": 1},
    13: {"ev": ["recipe"], "recipe": "level", "line": 2}, 14: {"ev": ["order"]},
    15: {"ev": ["photo", "gift"]}, 16: {"ev": ["frogGift"]},
    27: {"ev": ["costume"]}, 28: {"ev": ["butterfly"]}, 30: {"ev": ["fish"], "where": {"star": True}},
    26: {"ev": ["basketballScore"], "amount": "score"},
}
MISSION_ONLY = {25: {"ev": ["basketball"]}}
# Mission.json index -> Work index that must be built for the mission to be listed (UI_Quest.c ShowUI ~2995-3030).
NEED_WORK = {2: 10, 5: 10, 3: 3, 4: 5, 6: 12, 7: 14, 8: 97}


def main():
    missions = [m for m in load("Mission")]
    out = {
        "rules": {str(k): v for k, v in {**COMMON, **MISSION_ONLY}.items()},
        "needWork": {str(k): v for k, v in NEED_WORK.items()},
        "missions": [{k: m[k] for k in ("index", "type", "rewardType", "rewardValue", "maxValue", "displayorder")} for m in missions],
        "quests": [{k: q[k] for k in ("index", "type", "maxValue", "addFactor", "subFactor", "rewardType", "rewardValue", "maxLv", "rewardValues")} for q in load("Quest")],
        "scratch": [{k: r[k] for k in ("index", "probability", "rewardType", "rewardValue")} for r in load("DailyReward")],
        "attend": [{k: r[k] for k in ("index", "rewardType", "rewardValue")} for r in load("Montly28Rewards") if r["month"] == 0],
    }
    with open(os.path.join(GAME, "data", "missions.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("missions.json", len(out["missions"]), "missions", len(out["quests"]), "quests", len(out["scratch"]), "scratch", len(out["attend"]), "attend")


main()
