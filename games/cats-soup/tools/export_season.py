"""Write data/season.json: the tables of the time-based events (season exchange shop, event missions + pass, daily login
calendars, beginner / welcome / return gifts, soup pass, play points) and the local calendar schedule.
Rules: D:/catsoup-ref/rules/season.md.

usage: py -3.12 -I tools/export_season.py
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref/flat"


def load(name):
    return json.load(open(f"{REF}/{name}.json", encoding="utf-8"))


def pick(rows, keys):
    return [{k: r[k] for k in keys} for r in rows]


def main():
    times = {t["index"]: t for t in load("SeasonTime")}
    events = load("SeasonEvent")
    daily = load("EventDaily_Season")
    shop, day_rows = {}, {}
    for r in events:
        if r["actionType"] == "exchange":
            shop.setdefault(r["season"], []).append(r)
    for r in daily:
        day_rows.setdefault(r["season"], []).append(r)
    # A season can run locally when it has an exchange shop of 20+ rows, a login calendar and a start date (seasons 1-20 are
    # gacha / get-buy / dice events or have no dates).
    ok = sorted(s for s in shop if s >= 21 and len(shop[s]) >= 20 and s in day_rows and times[s]["startDay"] > 0)
    # Month -> season: the newest ok season whose start date falls in that calendar month; a month without one reuses the
    # season of the closest earlier month (wrapping at January).
    by_month = {}
    for s in ok:
        m = (times[s]["startDay"] // 100) % 100
        by_month[m] = max(by_month.get(m, 0), s)
    month = {}
    for m in range(1, 13):
        k = m
        while k not in by_month:
            k = 12 if k == 1 else k - 1
        month[str(m)] = by_month[k]
    used = sorted(set(month.values()))
    out = {
        "months": month,
        "seasons": {str(s): {"name": times[s]["resName"], "start": times[s]["startDay"], "end": times[s]["endDay"], "type": times[s]["type"]} for s in used},
        "shop": {str(s): pick(sorted(shop[s], key=lambda r: (-r["sort_order"] if r["sort_order"] < 9000 else 0, r["index"])), ("index", "enableCount", "requireValue", "rewardType", "rewardValue", "sort_order")) for s in used},
        "daily": {str(s): pick(sorted(day_rows[s], key=lambda r: r["requireValue"]), ("requireValue", "rewardType", "rewardValue", "rewardTypeP1", "rewardValueP1", "rewardTypeP2", "rewardValueP2", "isSpecial")) for s in used},
        "dayGroups": {},
        "beginner": pick(load("EventBeginner"), ("needUnitCount", "requireValue", "rewardType", "rewardValue", "rewardTypeP1", "rewardValueP1", "rewardTypeP2", "rewardValueP2")),
        "welcome": pick(load("EventWelcome"), ("needUnitCount", "requireValue", "rewardType", "rewardValue", "rewardTypeP1", "rewardValueP1", "rewardTypeP2", "rewardValueP2")),
        # ReturnVersion 0 is the base set (versions 1 and 2 repeat the day rows with other missions; inferred as later redesigns)
        "ret": pick([r for r in load("ReturnMission") if r["ReturnVersion"] == 0], ("index", "activeDay", "missionCatergory", "missionType", "missionValue", "rewardType", "rewardValue")),
        "eventMissions": pick(load("EventPassMission"), ("index", "type", "rewardPoint", "rewardType", "rewardValue", "maxValue")),
        "eventPass": pick(load("EventSeasonPass"), ("index", "unlockValue", "rewardType", "rewardValue", "rewardTypeP", "rewardValueP")),
        "soup": {
            "init": [r["value"] for r in load("SoupPassInit")],
            "reward": {},
            "minigame": pick(load("SoupPassMinigame"), ("index", "resName")),
        },
        "playPoint": pick(load("PlayPoint"), ("index", "grade", "costType", "cost", "rewardType", "rewardValue")),
        "dailyPlayPoint": pick(load("DailyPlayPoint"), ("index", "playTime", "rewardType", "rewardValue")),
    }
    for r in load("EventDaily_Day"):
        out["dayGroups"].setdefault(str(r["group"]), []).append({k: r[k] for k in ("requireValue", "rewardType", "rewardValue", "rewardTypeP1", "rewardValueP1", "rewardTypeP2", "rewardValueP2")})
    for g in out["dayGroups"].values():
        g.sort(key=lambda r: r["requireValue"])
    for r in load("SoupPassReward"):
        out["soup"]["reward"].setdefault(str(r["season"]), []).append({k: r[k] for k in ("pointValue", "rewardType", "rewardValue", "rewardTypeP", "rewardValueP")})
    with open(os.path.join(GAME, "data", "season.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("season.json months", month, "shop rows", {s: len(v) for s, v in out["shop"].items()})


main()
