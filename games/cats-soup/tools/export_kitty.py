"""Export the tables and art of the kitty feature (kittens, kitty houses, trips, album, magnets).

usage: py -3.12 -I tools/export_kitty.py            -> data/kitty.json + art/kitty/dest/<n>.webp
Tables read: KittyAbility, CatUnlock, CatType (isKitty rows), TravelItem, TravelDestination, TravelPictureInfo, Magnet, Init.
Destinations of the regular regions (type 0-4, indexes 0-49) are exported with their picture rows and their Resources image
`traveltex/traveldestination<N>` (512x358). Season destinations (type 5, indexes 200+) need the season event feature and
photo pieces, so they are left out. Rules: D:/catsoup-ref/rules/kitty.md.
"""
import io, json, os, sys

sys.path.insert(0, "D:/catsoup-ref/tools")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import cns  # noqa: E402

REF = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name):
    with io.open(os.path.join(REF, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


init = {r["index"]: r["value"] for r in load("Init")}
pics = {r["index"]: r for r in load("TravelPictureInfo")}
dests = [d for d in load("TravelDestination") if d["type"] < 5]
used = {i for d in dests for i in d["pictureInfos"]}


def pic(r):
    x, y = (float(v) for v in r["pos"].split(","))
    return [r["index"], r["pose"].replace("kittycat_pose_", ""), x, y, r["zoom"], r["petSide"], r["pet_MinPos"], r["pet_MaxPos"]]


out = {
    "abilities": [{"index": r["index"], "type": r["type"], "work": r["subIndex"]} for r in load("KittyAbility")],
    "unlock": [{"index": r["index"], "work": r["workIndex"], "gem": r["requireValue"], "wander": r["wanderTime"]} for r in load("CatUnlock")],
    "types": [{"index": r["index"], "res": r["resName"], "first": r["isFirst"], "event": r["eventType"]} for r in load("CatType") if r["isKitty"]],
    "items": [{"index": r["index"], "res": r["resName"], "type": r["type"], "value": r["itemValue"], "price": r["price"]} for r in load("TravelItem")],
    "dests": [{"index": d["index"], "region": d["type"], "res": d["resName"], "pics": d["pictureInfos"]} for d in dests],
    "pics": [pic(pics[i]) for i in sorted(used) if i in pics],
    "magnets": [{"index": r["index"], "res": r["resName"], "dest": r["travelDestination_id"], "sell": r["sell"], "prob": r["probability"]}
                for r in load("Magnet")],
    # Init rows 51 52 58 59 60 (specials.md BALANCE) and 8 is the jar
    "balance": {"defaultToken": init[51], "heartAddToken": init[52], "magnetProb": init[58], "tokenMin": init[59], "tokenMax": init[60]},
    "houses": [{"work": w["index"], "seconds": w["completeTime"], "need": w["needWork"], "cost": w["cost"], "digit": w["costDigit"], "type": w["type"]}
               for w in load("Work") if w["index"] in (402, 403, 404, 406)],
}
os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
path = os.path.join(GAME, "data", "kitty.json")
with io.open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", path, {k: len(v) for k, v in out.items()})

# ---- destination images ----
from PIL import Image  # noqa: E402

R = {x[0]: x[1] for x in json.load(open("D:/catsoup-ref/resources.json"))}
outdir = os.path.join(GAME, "art", "kitty", "dest")
os.makedirs(outdir, exist_ok=True)
for d in dests:
    f = R.get("traveltex/" + d["resName"].lower())
    if not f:
        print("no image", d["resName"])
        continue
    e = getattr(cns, "env")(f)
    for o in e.objects:
        if o.type.name == "Texture2D":
            im = o.read().image.convert("RGB")
            im = im.resize((384, int(384 * im.size[1] / im.size[0])), Image.LANCZOS)
            im.save(os.path.join(outdir, f"{d['index']}.webp"), "WEBP", quality=80, method=6)
            break
print("images", len(os.listdir(outdir)))
