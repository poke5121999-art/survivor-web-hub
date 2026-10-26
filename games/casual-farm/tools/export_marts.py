"""Export every mart of the main progression (RC_MartOrder: Store, Store_2 .. Store_14) for the three.js build.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_marts.py [store3 store4 ...] [--skip-geo] [--index-only]

For each mart runs export_store.py <level> <id>, export_navmesh.py <id>, export_data.py <scene> <id>, then writes
data/marts.json (the order the next-mart pad walks, with GameManager.martNameList names). Scene index = BuildSettings order (tools in D:\\minimart-ref:
scenes.py); seasonal marts (Val23, Eas23, Hal22, Xms22, Cny23, Anv23) and Big_Store_* are not in the order.
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


def mart_id(k):
    return f"store{k + 1}"


def run(*args):
    print(">", " ".join(args), flush=True)
    subprocess.run([sys.executable, *args], cwd=HERE, check=True, timeout=1800)


def main():
    want = {a for a in sys.argv[1:] if not a.startswith("--")}
    skip_geo = "--skip-geo" in sys.argv
    for k, (scene, level) in enumerate([] if "--index-only" in sys.argv else MARTS):
        mid = mart_id(k)
        if want and mid not in want:
            continue
        if not skip_geo:
            run("export_store.py", level, mid)
            run("export_navmesh.py", mid)
        run("export_data.py", scene, mid)
    out = [{"id": mart_id(k), "name": NAMES[k], "scene": scene, "level": level} for k, (scene, level) in enumerate(MARTS)]
    with open(os.path.join(GAME, "data", "marts.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=1)


if __name__ == "__main__":
    main()
