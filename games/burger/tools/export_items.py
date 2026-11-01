"""ItemType -> pool prefab name, and the --prefabs list for the pool export.

Usage: python -I tools/export_items.py
ObjectPoolManager._itemObjectData (level1) lists one prefab per ItemType in enum order (Money 0, EmptyCup 1, Burger1 2,
Package1 3, ... Coffee4 53). Writes data/items.json (names by ItemType) and prints the pool --prefabs argument: the
earlier pool roots first (their order is what older saves/screens were made with), then every other item prefab and
the VIP cars (_carVIPObjectData).
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm

FIRST = [3638, 3461, 3458, 3451, 3648, 3655, 3520, 3518, 3519, 3654, 3660, 3649, 3644, 3652, 3101]


def main():
    mm.load()
    lvl, sa = mm.by_file("level1"), mm.by_file("sharedassets1.assets")
    pool = next(o for o in lvl.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "ObjectPoolManager")
    d = mm.read(pool)
    items = [e["prefab"]["m_PathID"] for e in d["_itemObjectData"]]
    names = [sa[t].read().m_GameObject.read().m_Name for t in items]
    vip = [e["prefab"]["m_PathID"] for e in d["_carVIPObjectData"]]
    json.dump({"items": names, "vipCars": [sa[t].read().m_GameObject.read().m_Name for t in vip]},
              open(os.path.join(os.path.dirname(HERE), "data", "items.json"), "w"), indent=0)
    print(",".join(str(x) for x in FIRST + [t for t in items + vip if t not in FIRST]))


if __name__ == "__main__":
    main()
