"""Export the fur texture of every regular cat type (Entity_CatType resName -> Resources body/<resName>).

usage: py -3.12 -I export_cats.py
writes art/tex/body*.webp and data/cats.json {catType index: {tex, fat, ear: [x, y, z], head, neck, cheek}}.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
from export_prefabs import save_image  # noqa: E402

GAME = os.path.dirname(HERE)
load = getattr(cns, "env")
res = {}
for k, f, p in json.load(open(os.path.join(cns.ROOT, "resources.json"))):
    res.setdefault(k, (f, p))
rows = json.load(open(os.path.join(cns.ROOT, "flat", "CatType.json"), encoding="utf-8"))
out = {}
for r in rows:
    key = "body/" + r["resName"].lower()
    if key not in res:
        print("missing", key)
        continue
    f, pid = res[key]
    tex = next(o.read() for o in load(f).objects if o.assets_file.name == f and o.type.name == "Texture2D")
    stem, _ = save_image(tex.image, tex.m_Name, os.path.join(GAME, "art", "tex"))
    out[r["index"]] = {"tex": stem, "fat": r["fatFactor"], "ear": [r["earSizeX"], r["earSizeY"], r["earSizeZ"]],
                       "head": r["headSize"], "neck": r["neckSize"], "cheek": r["cheekSize"], "kitty": r["isKitty"],
                       "event": r["eventType"]}
json.dump(out, open(os.path.join(GAME, "data", "cats.json"), "w"), separators=(",", ":"))
print(len(out), "cat types")
