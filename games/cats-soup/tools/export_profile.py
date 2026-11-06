"""Export the Cats&Soup profile / photo feature: data/profile.json.

usage: py -3.12 -I tools/export_profile.py

data/profile.json
  titles    PlayerTitle rows: index, name (lang key), type (conditionType), value
  images    PrimaryImage rows: index, image (sprite in atlas_food_atlas), name, type, value
  outlines  PrimaryOutline rows: index, image (sprite in atlas_ui1_atlas), type, value
  stickers  PhotoSticker rows: index, image (atlas_Screenshot_atlas), type, value, flip (horizontally), limit (placeLimit)
  frames    PhotoOutline rows: index, image (atlas_Screenshot_atlas), type, value
condition type: 0 always owned, 1 value = cats collected, 2 event reward (never unlocked here).
"""
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
FLAT = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def table(name):
    with open(f"{FLAT}/{name}.json", encoding="utf-8") as f:
        return json.load(f)


out = {
    "titles": [{"index": r["index"], "name": r["titleName"], "type": r["conditionType"], "value": r["value"]} for r in table("PlayerTitle")],
    "images": [{"index": r["index"], "image": r["image"], "name": r["name"], "type": r["conditionType"], "value": r["value"]} for r in table("PrimaryImage")],
    "outlines": [{"index": r["index"], "image": r["image"], "type": r["conditionType"], "value": r["value"]} for r in table("PrimaryOutline")],
    "stickers": [{"index": r["index"], "image": r["image"], "type": r["conditionType"], "value": r["value"], "flip": r["horizontally"], "limit": r["placeLimit"]} for r in table("PhotoSticker")],
    "frames": [{"index": r["index"], "image": r["image"], "type": r["conditionType"], "value": r["value"]} for r in table("PhotoOutline")],
}
with open(os.path.join(GAME, "data", "profile.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
