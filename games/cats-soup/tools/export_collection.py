"""Export the tables of the collection feature: Collection.json (sets of cats / fish / furniture / outfits and the ability
each one pays when complete), PictureBook.json (the six picture-book rows) and Storage_item.json (the item "Kho" list).

usage: py -3.12 -I tools/export_collection.py        -> data/collection.json
Only the columns the feature reads are kept. `value` / `limitValue` (a comma list in the table) become int arrays.
"""
import io, json, os, sys

sys.stdout.reconfigure(encoding="utf-8")
REF = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name):
    with io.open(os.path.join(REF, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def ints(v):
    if isinstance(v, list):
        return [int(x) for x in v]
    return [int(x) for x in str(v).split(",") if str(x).strip() != ""]


out = {
    # type 0 cat (CatType.index), 1 fish (Fish.index), 2 furniture (Furniture.index), 3 outfit (Equip.index);
    # DataManager.CheckCollection / CheckCollectionAll (DataManager.c:15853, :77652)
    "sets": [{"index": r["index"], "type": r["type"], "ids": ints(r["value"]), "sub": r["subindex"],
              "ability": r["ability"], "abilityLv": r["abilityLv"]} for r in load("Collection")],
    "book": [{"index": r["index"], "type": r["type"], "ids": ints(r["limitValue"]), "text": r["textIndex"],
              "rewardType": r["rewardType"], "rewardValue": r["rewardValue"]} for r in load("PictureBook")],
    "storage": [{"index": r["index"], "type": r["itemtype"], "zero": r["DisplayAtZero"], "dest": r["LinkButtonDest"],
                 "link": r["LinkButtonText"]} for r in load("Storage_item")],
}
path = os.path.join(GAME, "data", "collection.json")
with io.open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", path, {k: len(v) for k, v in out.items()})
