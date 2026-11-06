"""Export the textures of the mini game panels -> art/minigame/<file prefix>.webp + art/minigame/index.json (feature `minigame`).

usage: py -3.12 -I tools/export_minigame_art.py [panel ...]   (default: the sub game panels)
A panel widget of kind `texture` (art/ui/panels/*.json) carries tex = "<first 8 chars of the Data file>:<path id>". Each file is
loaded alone through cns.env (never the whole Data folder).
index.json = {prefix: [w, h]}
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
from export_prefabs import save_image  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(GAME, "art", "minigame")
PANELS = sys.argv[1:] or ["set_subgame_02_mole", "set_subgame_01_butterfly", "set_subgameenterui", "set_subgamecollectreward",
                          "set_guide_subgame", "subgamebutterfly_og", "subgamemole_og"]


# Textures a panel does not name: the illustrations of the two games (Resources subgame/*/subgame_illust_0X, path id 1).
EXTRA = ["d57fd327:1"]


def refs(names):
    out = set(EXTRA)

    def walk(n):
        w = n.get("w")
        if w and w.get("k") == "texture" and w.get("tex"):
            out.add(w["tex"])
        for c in n.get("c", []):
            walk(c)
    for p in names:
        with open(os.path.join(GAME, "art", "ui", "panels", p + ".json"), encoding="utf-8") as f:
            for r in json.load(f)["roots"]:
                walk(r)
    return sorted(out)


def fullname(prefix):
    for f in os.listdir(cns.DATA):
        if f.startswith(prefix):
            return f.replace(".split0", "")
    return None


os.makedirs(OUT, exist_ok=True)
ip = os.path.join(OUT, "index.json")
index = json.load(open(ip)) if os.path.exists(ip) else {}
for ref in refs(PANELS):
    prefix, pid = ref.split(":")
    if prefix in index:
        continue
    name = fullname(prefix)
    if not name:
        print("missing file", ref)
        continue
    e = cns.env(name)
    done = False
    for o in e.objects:
        if str(o.path_id) == pid and o.type.name == "Texture2D":
            im = o.read().image
            stem, im = save_image(im, prefix, OUT)
            os.replace(os.path.join(OUT, stem + ".webp"), os.path.join(OUT, prefix + ".webp"))
            lq = os.path.join(OUT, stem + ".lq.webp")
            if os.path.exists(lq):
                os.remove(lq)
            index[prefix] = [im.width, im.height]
            done = True
    if not done:
        print("not a texture", ref, [o.type.name for o in e.objects][:5])
with open(ip, "w") as f:
    json.dump(index, f, separators=(",", ":"))
print(len(index), "textures", sum(os.path.getsize(os.path.join(OUT, p + ".webp")) for p in index) // 1024, "KB")
