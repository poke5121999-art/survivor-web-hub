"""Export cat outfits and tools (Entity_Equip, rules in D:/catsoup-ref/rules/equip.md).

usage: py -3.12 -I export_equip.py [--data] [--cloth] [--prefabs [first-chunk [last-chunk]]]
  no flag = all three.
  --data     writes data/equip.json (item -> chunk / cloth texture / attach slot)
  --cloth    cloth (type 1) is a texture laid over the fur: Resources equiptex/<resName> -> art/equip/body/<resName>.webp
  --prefabs  hats (type 0), accessories (2) and friends (3) are prefabs Resources equip/<resName>, 24 a chunk in item order
             -> art/equip/c<k>/ via export_prefabs.py (a chunk is one scene.json + geo.glb, textures shared in art/tex)
Kitty outfits (types 10-12) are left out: this build has no kitties.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402

GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref"
CHUNK = 24
res = {}
for k, f, p in json.load(open(f"{REF}/resources.json")):
    res.setdefault(k, (f, p))
rows = json.load(open(f"{REF}/flat/Equip.json", encoding="utf-8"))
solid = [r for r in rows if r["type"] in (0, 2, 3) and f"equip/{r['resName']}" in res]
cloth = [r for r in rows if r["type"] == 1 and f"equiptex/{r['resName']}" in res]
chunks = [solid[i:i + CHUNK] for i in range(0, len(solid), CHUNK)]
args = sys.argv[1:]
want = lambda f: f in args or not [a for a in args if a.startswith("--")]


def data():
    where = {r["index"]: k for k, ch in enumerate(chunks) for r in ch}
    out = {"chunk": CHUNK, "chunks": len(chunks),
           "prefab": {str(r["index"]): [where[r["index"]], f"equip/{r['resName']}"] for r in solid},
           "cloth": {str(r["index"]): r["resName"] for r in cloth},
           "missing": [r["index"] for r in rows if r["type"] in (0, 1, 2, 3) and r not in solid and r not in cloth]}
    json.dump(out, open(f"{GAME}/data/equip.json", "w"), separators=(",", ":"))
    print("data/equip.json:", len(solid), "prefab items,", len(cloth), "cloth,", len(out["missing"]), "without art", flush=True)


def clothes():
    load = getattr(cns, "env")
    os.makedirs(f"{GAME}/art/equip/body", exist_ok=True)
    n = 0
    for r in cloth:
        path = f"{GAME}/art/equip/body/{r['resName']}.webp"
        if os.path.exists(path):
            continue
        f, pid = res[f"equiptex/{r['resName']}"]
        tex = next(o.read() for o in load(f).objects if o.assets_file.name == f and o.type.name == "Texture2D")
        im = tex.image.convert("RGBA")
        im.save(path, "WEBP", quality=88, method=6)
        n += 1
        if n % 50 == 0:
            print("cloth", n, im.size, flush=True)
    print("cloth done", n, flush=True)


def prefabs(first, last):
    for k, ch in enumerate(chunks):
        if k < first or k > last:
            continue
        keys = [f"equip/{r['resName']}" for r in ch]
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_prefabs.py"), f"equip/c{k}"] + keys,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
        print(k, (r.stdout.strip().splitlines() or ["?"])[-1], r.stderr[-300:] if r.returncode else "", flush=True)


if want("--data"):
    data()
if want("--cloth"):
    clothes()
if want("--prefabs"):
    i = args.index("--prefabs") if "--prefabs" in args else -1
    nums = [int(a) for a in args[i + 1:] if a.isdigit()] if i >= 0 else []
    prefabs(nums[0] if nums else 0, nums[1] if len(nums) > 1 else len(chunks))
