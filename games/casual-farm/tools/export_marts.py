"""Export every mart of the main progression (RC_MartOrder: Store, Store_2 .. Store_14) for the three.js build.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_marts.py [store3 store4 ...] [--skip-geo] [--index-only]

For each mart runs export_store.py <level> <id>, export_navmesh.py <id>, export_data.py <scene> <id>, then writes
data/marts.json (the order the next-mart pad walks, with GameManager.martNameList names). Scene index = BuildSettings order (tools in D:\\minimart-ref:
scenes.py); Big_Store_* are not exported. The six seasonal marts (Val23, Eas23, Hal22, Xms22, Cny23, Anv23) are not in
the order either: they follow the 14 in marts.json with "seasonal": true (no next-mart pad, no idle income, rules/census-events.md).
Each step is its own process so one store's UnityPy environment (~3 GB) is freed before the next.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
MARTS = [("Store", "level1"), ("Store_2", "level2"), ("Store_3", "level3"), ("Store_4", "level6"), ("Store_5", "level7"),
         ("Store_6", "level8"), ("Store_7", "level9"), ("Store_8", "level10"), ("Store_9", "level11"),
         ("Store_10", "level12"), ("Store_11", "level14"), ("Store_12", "level16"), ("Store_13", "level18"),
         ("Store_14", "level20")]

# GameManager.martNameList (level1, read from raw bytes: the generated type tree misreads GameManager) indexed the way
# GameManager.GetMartName does per MySceneType: Store1 -> [1], Store2 -> [2], Store3 -> [3], Store4 -> [5] ... Store14 -> [19].
NAMES = ["Grocer Mart", "Cafe Mart", "Pizza Mart", "Blueberry Mart", "Burger Mart", "Sushi Mart", "Mexican Mart",
         "Dessert Mart", "Cinema Mart", "Hotdog Mart", "Fairground Mart", "Seafood Mart", "Ratatouille Mart", "Campsite Mart"]

# Seasonal scenes (census-events.md 1.1): id, scene, level, name. GameManager.martNameList (raw bytes: 21 strings, [0]
# "Loading Scene") holds Easter, Halloween, Christmas, Chinese New Year and Anniversary Mart but no Valentine name.
SEASONAL = [("val23", "Store_Val23", "level4", "Valentine Mart"), ("eas23", "Store_Eas23", "level5", "Easter Mart"),
            ("hal22", "Store_Hal22", "level13", "Halloween Mart"), ("xms22", "Store_Xms22", "level15", "Christmas Mart"),
            ("cny23", "Store_Cny23", "level17", "Chinese New Year Mart"), ("anv23", "Store_Anv23", "level19", "Anniversary Mart")]

# Player_Chef.martMaxIdleIncomeList (rules/upgrades.md "Idle / offline income").
IDLE = [300, 600, 900, 1200, 1500, 2000, 2600, 3300, 4200, 5500, 7000, 8000, 9000, 10000]


def mart_id(k):
    return f"store{k + 1}"


def run(*args):
    print(">", " ".join(args), flush=True)
    subprocess.run([sys.executable, *args], cwd=HERE, check=True, timeout=1800)


def main():
    want = {a for a in sys.argv[1:] if not a.startswith("--")}
    skip_geo = "--skip-geo" in sys.argv
    jobs = [(mart_id(k), scene, level) for k, (scene, level) in enumerate(MARTS)] + [(m, sc, lv) for m, sc, lv, _ in SEASONAL]
    for mid, scene, level in [] if "--index-only" in sys.argv else jobs:
        if want and mid not in want:
            continue
        if not skip_geo:
            run("export_store.py", level, mid)
            run("export_navmesh.py", mid)
        run("export_data.py", scene, mid)
    out = []
    for k, (scene, level) in enumerate(MARTS):
        with open(os.path.join(GAME, "data", mart_id(k) + ".json"), encoding="utf-8") as fh:
            mats = len(json.load(fh)["mats"])
        # mats: completion = finished / total (PlayerHumanController.GetCompletionRate). idle: the map's collectable
        # income at 100 % (martMaxIdleIncomeList on Player_Chef, RC_MartOrder index).
        # icon: GameManager.martIconList sprite (export_menus.py writes Mart_<Name>Icon); Campsite has none -> martIcon.
        icon = "menus/Mart_%sIcon" % NAMES[k].split()[0]
        if not os.path.exists(os.path.join(GAME, "art", "ui", icon + ".webp")):
            icon = "sprites/martIcon"
        out.append({"id": mart_id(k), "name": NAMES[k], "scene": scene, "level": level, "mats": mats, "idle": IDLE[k], "icon": icon})
    for mid, scene, level, name in SEASONAL:
        path = os.path.join(GAME, "data", mid + ".json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            mats = len(json.load(fh)["mats"])
        out.append({"id": mid, "name": name, "scene": scene, "level": level, "mats": mats, "idle": 0, "icon": "sprites/martIcon",
                    "seasonal": True})
    with open(os.path.join(GAME, "data", "marts.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=1)


if __name__ == "__main__":
    main()
