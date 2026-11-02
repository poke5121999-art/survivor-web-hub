"""Export the data, UI panels and 3D fish of the fishing ground (work 10) and the aquarium (work 33).

usage: py -3.12 -I export_fishing.py [--skip-art] (data only)
  data/fishing.json    Fish table (all 71 rows, columns used) + ThemeAqua rows; written from D:/catsoup-ref/flat
  art/ui/panels/*.json set_fishing, set_fishinven, set_fishpopup, set_aquarium, set_aquainven, set_guide_aquarium (export_ui.py)
  art/fishing/fish<index>.webp  fish/fish<index> of Resources is a 128x128 Texture2D, not a prefab (export_prefabs.py finds no GameObject)
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref"
sys.stdout.reconfigure(encoding="utf-8")

fish = json.load(open(f"{REF}/flat/Fish.json", encoding="utf-8"))
themes = json.load(open(f"{REF}/flat/ThemeAqua.json", encoding="utf-8"))
res = {k for k, f, p in json.load(open(f"{REF}/resources.json"))}
cols = ["index", "type", "probability", "heartValue", "grade", "size", "group", "rewardType", "rewardValue"]
rows = [{c: f[c] for c in cols} | {"model": f"fish/fish{f['index']}" in res} for f in fish]
os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
json.dump({"fish": rows, "themes": themes}, open(os.path.join(GAME, "data", "fishing.json"), "w"), separators=(",", ":"))
print("data/fishing.json", len(rows), "fish", len(themes), "themes")

if "--skip-art" not in sys.argv:
    panels = ["ui/functionwork/" + n for n in ("set_fishing", "set_fishinven", "set_fishpopup", "set_aquarium", "set_aquainven")] + ["ui/guide/set_guide_aquarium"]
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_ui.py"), "--prefab"] + panels, capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout[-400:], r.stderr[-300:] if r.returncode else "")
    sys.path.insert(0, HERE)
    sys.path.insert(0, REF + "/tools")
    import cns
    out = os.path.join(GAME, "art", "fishing")
    os.makedirs(out, exist_ok=True)
    byk = {k: f for k, f, p in json.load(open(f"{REF}/resources.json"))}
    n = 0
    for f in fish:
        k = f"fish/fish{f['index']}"
        if k not in byk:
            continue
        env = getattr(cns, "env")(byk[k])
        for o in env.objects:
            if o.type.name == "Texture2D":
                o.read().image.save(os.path.join(out, f"fish{f['index']}.webp"), "WEBP", quality=90, lossless=False)
                n += 1
    print("fish images", n)
