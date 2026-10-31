"""Export cat/enemy battle stats + names to compact JSON for the web engine.

Reads DataLocal CSVs + resLocal names via bclib. Only includes units/enemies
whose battle sprite we actually have (so the engine never references a missing
sheet). Writes games/battle-cats/data/{cats,enemies}.json.
"""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import bclib

REF = bclib.REF
DL = os.path.join(REF, "local", "DataLocal")
RL = os.path.join(REF, "local", "resLocal")
OUT = os.path.join(os.path.dirname(__file__), "..", "data")


def rows(path):
    out = []
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.split("//")[0].strip().rstrip(",")
        if line == "":
            continue
        out.append(line.split(","))
    return out


def ints(r, n):
    v = []
    for i in range(n):
        try:
            v.append(int(r[i]))
        except (IndexError, ValueError):
            v.append(0)
    return v


# Cat form stats: index map (tbcml cats.py)
def cat_form(r):
    v = ints(r, 64)
    return {"hp": v[0], "kb": v[1], "speed": v[2], "atk": v[3], "tba": v[4],
            "range": v[5], "cost": v[6], "recharge": v[7],
            "cs": v[8], "cw": v[9], "area": v[12], "fsw": v[13],
            "ld0": v[44], "ldr": v[45]}


def enemy_stats(r):
    v = ints(r, 64)
    return {"hp": v[0], "kb": v[1], "speed": v[2], "atk": v[3], "tba": v[4],
            "range": v[5], "money": v[6], "cs": v[7], "cw": v[8],
            "area": v[11], "fsw": v[12]}


def cat_name(uid):
    p = os.path.join(RL, f"Unit_Explanation{uid + 1}_en.csv")
    if not os.path.exists(p):
        return None
    first = open(p, encoding="utf-8", errors="replace").readline()
    return first.split("|")[0].strip() or None


def enemy_names():
    p = os.path.join(RL, "Enemyname.tsv")
    if not os.path.exists(p):
        return []
    return [l.rstrip("\n").rstrip("\r") for l in open(p, encoding="utf-8", errors="replace")]


REAL = json.load(open(os.path.join(os.path.dirname(__file__), "..", "data", "_real_sheets.json")))
REAL = {k: set(v) for k, v in REAL.items()}


def main():
    os.makedirs(OUT, exist_ok=True)
    # Cats
    cats = {}
    for uid in range(0, 900):
        forms = []
        have_any = False
        for fi, fc in enumerate("fcs"):
            if uid not in REAL.get(fc, []):
                forms.append(None)
                continue
            p = os.path.join(DL, f"unit{uid:03d}.csv")
            if not os.path.exists(p):
                forms.append(None)
                continue
            rr = rows(p)
            if fi >= len(rr):
                forms.append(None)
                continue
            forms.append(cat_form(rr[fi]))
            have_any = True
        if have_any:
            cats[uid] = {"id": uid, "name": cat_name(uid) or f"Cat {uid}",
                         "forms": forms}
    # Enemies
    enames = enemy_names()
    tpath = os.path.join(DL, "t_unit.csv")
    trows = rows(tpath)
    enemies = {}
    for eid in range(0, len(trows)):
        if eid not in REAL.get("e", set()):
            continue
        st = enemy_stats(trows[eid])
        nm = enames[eid].strip() if eid < len(enames) else ""
        if not nm or nm == "ダミー":
            nm = f"Enemy {eid}"
        enemies[eid] = {"id": eid, "name": nm, "stats": st}
    json.dump(cats, open(os.path.join(OUT, "cats.json"), "w"), separators=(",", ":"))
    json.dump(enemies, open(os.path.join(OUT, "enemies.json"), "w"), separators=(",", ":"))
    print(f"cats {len(cats)} (with sprite), enemies {len(enemies)}")
    some = list(cats.values())[:3]
    for c in some:
        print(" ", c["id"], c["name"], "forms", sum(1 for f in c["forms"] if f))
    print("sample enemy:", list(enemies.values())[0] if enemies else None)


if __name__ == "__main__":
    main()
