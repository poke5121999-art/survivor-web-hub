"""Export the runtime-assigned ground textures and far-tree sprites per theme (D:/catsoup-ref/rules/map.md 2b, 2e).

usage: py -3.12 -I export_ground.py [theme ...]   (default 0)
writes art/tex/<name>-<md5>.webp and data/ground.json {theme: {base, base2, back, farTree}} (texture stems).
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
from export_prefabs import save_image  # noqa: E402

GAME = os.path.dirname(HERE)
res = {}
for k, f, p in json.load(open(os.path.join(cns.ROOT, "resources.json"))):
    res.setdefault(k, (f, p))
load = getattr(cns, "env")


def image(key):
    f, pid = res[key]
    e = load(f)
    best = None
    for o in e.objects:
        if o.assets_file.name == f and o.type.name in ("Texture2D", "Sprite"):
            t = o.read()
            if best is None or o.type.name == "Sprite":
                best = t
    stem, _ = save_image(best.image, best.m_Name, os.path.join(GAME, "art", "tex"))
    return stem


out_path = os.path.join(GAME, "data", "ground.json")
out = json.load(open(out_path)) if os.path.exists(out_path) else {}
for theme in [int(x) for x in sys.argv[1:]] or [0]:
    out[str(theme)] = {"base": image(f"ground/ground_base{theme}"), "base2": image(f"ground/ground_base{theme}_2"),
                       "back": image(f"ground/ground_back{theme}"), "farTree": image(f"tree/picnic_tree06_theme{theme}")}
    print(theme, out[str(theme)])
json.dump(out, open(out_path, "w"), indent=1)
