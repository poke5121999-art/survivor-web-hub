"""Export the remote-config defaults the game ships with, per store, to games/casual-farm/data/<out-id>.json.

Usage: py -3.12 export_data.py <martSceneName> <out-id>      e.g. Store store1

progression: RC_MartProgression_<scene> (matName, cost = objectTypeReq of objectType 11 = Coin, objectToActivateList +
             delays, highlight targets) and startingCashAmount. The scene's own MatActivateController values are the
             fallback the game uses when the remote key is missing; this table is what a fresh install runs.
prices:      RC_ItemPrices_<scene> defaultPrices.priceList (price, demandQuota per MyObjectType), falling back to
             RC_ItemPrices_Global.
Stores 9-14 have no mats in the scene: ProgressionData builds them at Awake from a CSV TextAsset (csv_mats, rules in
rules/progression-data.md in MM_REF); RC entries then override cost and lists by mat name. Needs
art/<out-id>/scene.json (export_store.py) for the object and customer names. Each CSV mat row also carries `object`
(the PROGRESS MANAGER child it unlocks), and store.js places and sizes it from the mat prefabs.
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from dump_progression_raw import read_progression  # noqa: E402

GAME = os.path.dirname(HERE)


def csv_mats(scene_json):
    """Mats ProgressionData.CreateProgressData would build, or None when the scene has no ProgressionData."""
    nodes = scene_json["nodes"]
    pd = next((n for n in nodes if "ProgressionData" in n.get("k", {})), None)
    if pd is None:
        return None
    ref = pd["k"]["ProgressionData"]["progressionData"]
    text = next(o.read().m_Script for o in mm.load().objects
                if o.type.name == "TextAsset" and o.assets_file.name == ref["f"] and o.path_id == ref["id"])
    text = text if isinstance(text, str) else text.decode("utf-8")
    grid = list(csv.reader(text.splitlines()))
    cell = lambda x, y: grid[y][x].strip() if y < len(grid) and x < len(grid[y]) else ""
    first_row = 1 if cell(0, 0).lower() == "name" else 0
    cm = pd["k"]["ProgressionData"]["customerManager"]["n"]
    queue = [n["n"] for n in nodes if n["p"] == cm and "_CustomerAgent" in n["n"]]
    items, order = {}, []

    def make(x, y):
        toks = [t.strip() for t in cell(x, y).split(",")]
        try:
            cost = int(cell(x + 1, y))
        except ValueError:
            cost = 0
        it = {"object": toks[0], "name": toks[0] + "_MatActivate", "cost": cost, "tags": [t.lower() for t in toks[1:] if t],
              "act": [], "hl": []}
        items[it["object"]] = it
        order.append(it)
        return it

    def column(x, y, prev):
        head = None
        while y < len(grid) and cell(x, y):
            it = make(x, y)
            head = head or it
            if prev is not None:
                lst = [prev["object"], it["name"]]
                if "-----" in cell(x + 2, y):
                    bx = next((c for c in range(x + 3, max(len(r) for r in grid)) if cell(c, y)), None)
                    if bx is not None:
                        lst.append(column(bx, y, prev)["name"])
                for t in it["tags"]:
                    if t == "cust" and queue:
                        lst.append(queue.pop(0))
                    elif t == "thief":
                        lst.append("_ActivateThief")
                    elif t == "car":
                        lst.append("_ActivateCarCustomer")
                    elif t == "zoom" and len(prev["hl"]) < 2:
                        prev["hl"].append(it["name"])
                prev["act"] = list(dict.fromkeys(lst + prev["act"]))
            prev = it
            y += 1
        if prev is not None:
            prev["act"] = [prev["object"]]
        return head

    column(0, first_row, None)
    return [{"name": it["name"], "object": it["object"], "type": 11, "cost": it["cost"], "activate": it["act"],
             "delays": [], "highlight": it["hl"]} for it in order]


def main():
    scene, outid = sys.argv[1], sys.argv[2]
    progs = read_progression()
    prog = next((p for p in progs if p["martSceneName"] == scene), None)
    prices, global_prices = None, None
    for o in mm.load().objects:
        if o.type.name != "MonoBehaviour" or mm.script(o)[1] != "__Funflare.Scripts.RemoteConfigsSO.RC_ItemPrices":
            continue
        d = mm.read(o)
        rows = {r["objectType"]: {"price": r["price"], "quota": r["demandQuota"]} for r in d["defaultPrices"]["priceList"]
                if not r["unused"]}
        if d["isGlobalConfig"]:
            global_prices = rows
        elif d["martSceneName"] == scene:
            prices = rows
    rc = [{"name": m["matName"], "type": m["objectType"], "cost": m["objectTypeReq"],
           "activate": list(dict.fromkeys(m["objectToActivateList"])), "delays": m["objectToActivateDelays"],
           "highlight": [h for h in (m["objectToHighlight"], m["secondObjectToHighlight"]) if h and h != "null"]}
          for m in (prog["mats"] if prog else [])]
    with open(os.path.join(GAME, "art", outid, "scene.json"), encoding="utf-8") as fh:
        built = csv_mats(json.load(fh))
    mats = rc
    if built is not None:
        # MartProgressionAdjuster: an RC entry overrides cost and activate list; empty RC highlights keep the CSV's.
        by = {m["name"]: m for m in rc}
        diff = [m["name"] for m in built if m["name"] in by and (by[m["name"]]["cost"], by[m["name"]]["activate"]) != (m["cost"], m["activate"])]
        print(f"CSV mats {len(built)}, RC mats {len(rc)}, RC matches CSV for {len(by) and len(by) - len(diff)}/{len(by)}"
              + (f", differ: {diff}" if diff else ""))
        mats = [{**m, **({k: by[m["name"]][k] for k in ("cost", "activate")} if m["name"] in by else {}),
                 "highlight": (by.get(m["name"]) or {}).get("highlight") or m["highlight"]} for m in built]
    out = {"scene": scene,
           "startingCash": prog["startingCashAmount"] if prog else 0,
           "mats": mats,
           "prices": {str(k): v for k, v in sorted((prices or global_prices or {}).items())}}
    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    path = os.path.join(GAME, "data", f"{outid}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"{scene} -> {path}: {len(out['mats'])} mats, {len(out['prices'])} prices, startingCash {out['startingCash']}")


if __name__ == "__main__":
    main()
