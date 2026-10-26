"""Export the remote-config defaults the game ships with, per store, to games/casual-farm/data/<out-id>.json.

Usage: py -3.12 export_data.py <martSceneName> <out-id>      e.g. Store store1

progression: RC_MartProgression_<scene> (matName, cost = objectTypeReq of objectType 11 = Coin, objectToActivateList +
             delays, highlight targets) and startingCashAmount. The scene's own MatActivateController values are the
             fallback the game uses when the remote key is missing; this table is what a fresh install runs.
prices:      RC_ItemPrices_<scene> defaultPrices.priceList (price, demandQuota per MyObjectType), falling back to
             RC_ItemPrices_Global.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from dump_progression_raw import read_progression  # noqa: E402

GAME = os.path.dirname(HERE)


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
    out = {"scene": scene,
           "startingCash": prog["startingCashAmount"] if prog else 0,
           "mats": [{"name": m["matName"], "type": m["objectType"], "cost": m["objectTypeReq"],
                     "activate": m["objectToActivateList"], "delays": m["objectToActivateDelays"],
                     "highlight": [h for h in (m["objectToHighlight"], m["secondObjectToHighlight"]) if h]}
                    for m in (prog["mats"] if prog else [])],
           "prices": {str(k): v for k, v in sorted((prices or global_prices or {}).items())}}
    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    path = os.path.join(GAME, "data", f"{outid}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"{scene} -> {path}: {len(out['mats'])} mats, {len(out['prices'])} prices, startingCash {out['startingCash']}")


if __name__ == "__main__":
    main()
