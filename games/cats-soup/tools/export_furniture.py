"""Export the room art of Furniture.json (rules: D:/catsoup-ref/rules/furniture.md).

usage: py -3.12 -I export_furniture.py [--limit N] [--scale 0.5]

Every Furniture row has a prefab Resources furniture/<resName> (SpriteRenderer + BoxCollider2D + FurnitureArea, sprite packed in
the SpriteAtlas atlas_furniture1/2). UnityPy resolves the packed sprite; the images are shrunk by --scale and packed into sheets
art/furniture/sheet<k>.webp. data/furniture.json says, per furniture index, where its parts sit on a sheet and where they stand
in the room:
  items[index] = {p: [[sheet, x, y, w, h, ox, oy, dw, dh, order, flipx] ...], a: [minX, maxX, minY, maxY], b: [offX, offY, w, h]}
  sheet px rect x y w h; ox oy = world offset of the part's bottom-left corner from the prefab origin; dw dh = its world size
  (1 world unit = the room's x range +-0.35..0.4, UI_UnitInfo.CaculateFurniturePos); order = SpriteRenderer.sortingOrder.
Python reads prefab files in batches (never the whole Data folder).
"""
import json, os, sys, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

REF = "D:/catsoup-ref"
args = sys.argv[1:]
LIMIT = int(args[args.index("--limit") + 1]) if "--limit" in args else 0
SCALE = float(args[args.index("--scale") + 1]) if "--scale" in args else 0.5
BG = 0.5
BATCH = 40
SHEET = 2048
CACHE = "D:/catsoup-ref/furniture-cache"    # per-piece PNGs + meta.json: a run killed half way resumes (the full run takes ~25 min)

res = {}
for k, f, p in json.load(open(f"{REF}/resources.json")):
    res.setdefault(k.lower(), (f, p))
rows = json.load(open(f"{REF}/flat/Furniture.json", encoding="utf-8"))
todo = [r for r in rows if f"furniture/{r['resName'].lower()}" in res]
if LIMIT:
    todo = todo[:LIMIT]
missing = [r["index"] for r in rows if f"furniture/{r['resName'].lower()}" not in res]


def read_prefab(env, fname):
    """-> parts, area, box of the prefab file (root = the GameObject whose Transform has no father)."""
    objs = {o.path_id: o for o in env.objects if o.assets_file.name == fname}
    tr, go_of_tr, tr_of_go = {}, {}, {}
    for pid, o in objs.items():
        if o.type.name in ("Transform", "RectTransform"):
            d = o.read_typetree()
            tr[pid] = d
            go_of_tr[pid] = d["m_GameObject"]["m_PathID"]
            tr_of_go[d["m_GameObject"]["m_PathID"]] = pid

    def world(tid):
        """position (x, y) and scale (x, y) of a Transform in the prefab root's space; rotation is ignored."""
        d = tr[tid]
        lp, ls = d["m_LocalPosition"], d["m_LocalScale"]
        f = d["m_Father"]["m_PathID"]
        if not f:
            return (0.0, 0.0), (ls["x"], ls["y"])
        (px, py), (sx, sy) = world(f)
        return (px + lp["x"] * sx, py + lp["y"] * sy), (sx * ls["x"], sy * ls["y"])

    roots = [t for t, d in tr.items() if not d["m_Father"]["m_PathID"]]
    if not roots:
        raise ValueError("no root Transform; types " + ",".join(sorted({o.type.name for o in objs.values()})))
    root = roots[0]
    rs = tr[root]["m_LocalScale"]
    parts, area, box = [], None, None
    for pid, o in objs.items():
        t = o.type.name
        if t == "SpriteRenderer":
            r = o.read()
            if not r.m_Enabled or not r.m_Sprite or not r.m_Sprite.path_id:
                continue
            sp = r.m_Sprite.read()
            gtr = tr_of_go[r.m_GameObject.path_id]
            (px, py), (sx, sy) = world(gtr)
            im = sp.image
            ppu = sp.m_PixelsToUnits or 100.0
            w, h = im.size
            pv = sp.m_Pivot
            parts.append({"im": im, "dw": w / ppu * abs(sx), "dh": h / ppu * abs(sy),
                          "ox": px - pv.x * w / ppu * abs(sx), "oy": py - pv.y * h / ppu * abs(sy),
                          "order": r.m_SortingOrder, "flip": bool(r.m_FlipX) ^ (sx < 0)})
        elif t == "BoxCollider2D":
            d = o.read_typetree()
            gtr = tr_of_go[d["m_GameObject"]["m_PathID"]]
            (px, py), (sx, sy) = world(gtr)
            if gtr == root:
                box = [round(px + d["m_Offset"]["x"] * sx, 4), round(py + d["m_Offset"]["y"] * sy, 4),
                       round(d["m_Size"]["x"] * sx, 4), round(d["m_Size"]["y"] * sy, 4)]
        elif t == "MonoBehaviour":
            try:
                d = cns.read(o)
            except Exception:
                continue
            if isinstance(d, dict) and "minX" in d and "maxY" in d:
                area = [round(d["minX"], 4), round(d["maxX"], 4), round(d["minY"], 4), round(d["maxY"], 4)]
    return parts, area, box, (rs["x"], rs["y"])


def main():
    by_file = {}
    for r in todo:
        f, _ = res[f"furniture/{r['resName'].lower()}"]
        by_file.setdefault(f, []).append(r["index"])
    files = list(by_file)
    os.makedirs(CACHE, exist_ok=True)
    mp = f"{CACHE}/meta_{SCALE}.json"
    items = {int(k): v for k, v in json.load(open(mp)).items()} if os.path.exists(mp) else {}
    t0 = time.time()
    for b in range(0, len(files), BATCH):
        todo_files = [f for f in files[b:b + BATCH] if not all(i in items for i in by_file[f])]
        if not todo_files:
            continue
        env = getattr(cns, "env")(*todo_files)
        for fname in todo_files:
            tex = [o for o in env.objects if o.assets_file.name == fname and o.type.name == "Texture2D"]
            if tex:
                # floors (512x256) and walls (512x512) are bare textures; the room stretches them over its floor / wall band
                im = tex[0].read().image.convert("RGBA")
                im = im.resize((max(1, round(im.width * BG)), max(1, round(im.height * BG))), Image.LANCZOS)
                for idx in by_file[fname]:
                    os.makedirs(f"{GAME}/art/furniture/bg", exist_ok=True)
                    im.save(f"{GAME}/art/furniture/bg/{idx}.webp", "WEBP", quality=85, method=6)
                    items[idx] = {"bg": 1, "w": im.width, "h": im.height}
                continue
            try:
                parts, area, box, rscale = read_prefab(env, fname)
            except Exception as ex:
                print("fail", fname, repr(ex)[:120])
                continue
            for idx in by_file[fname]:
                it = {"p": [], "a": area, "b": box}
                for n, p in enumerate(sorted(parts, key=lambda q: q["order"])):
                    im = p["im"].convert("RGBA")
                    if SCALE != 1:
                        im = im.resize((max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))), Image.LANCZOS)
                    im.save(f"{CACHE}/{idx}_{n}.png")
                    it["p"].append([None, 0, 0, im.width, im.height, round(p["ox"], 4), round(p["oy"], 4), round(p["dw"], 4), round(p["dh"], 4), p["order"], int(p["flip"])])
                items[idx] = it
        json.dump({str(k): v for k, v in items.items()}, open(mp, "w"))
        print(f"{min(b + BATCH, len(files))}/{len(files)} prefabs, {len(items)} items, {time.time() - t0:.0f}s", flush=True)
        del env
        import gc; gc.collect()
    imgs = []
    for idx, it in items.items():
        for n in range(len(it.get("p", []))):
            imgs.append((idx, n, Image.open(f"{CACHE}/{idx}_{n}.png").convert("RGBA")))
    # shelf packing into SHEET-wide sheets, tallest first
    imgs.sort(key=lambda t: -t[2].height)
    sheets, cur, x, y, rowh = [], Image.new("RGBA", (SHEET, SHEET)), 0, 0, 0
    for idx, n, im in imgs:
        w, h = im.size
        if x + w > SHEET:
            x, y, rowh = 0, y + rowh + 1, 0
        if y + h > SHEET:
            sheets.append(cur)
            cur, x, y, rowh = Image.new("RGBA", (SHEET, SHEET)), 0, 0, 0
        cur.paste(im, (x, y))
        p = items[idx]["p"][n]
        p[0], p[1], p[2] = len(sheets), x, y
        x += w + 1
        rowh = max(rowh, h)
    sheets.append(cur)
    out = f"{GAME}/art/furniture"
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".webp"):
            os.remove(os.path.join(out, f))
    for k, s in enumerate(sheets):
        bb = s.getbbox()
        s.crop((0, 0, SHEET, min(SHEET, (bb[3] if bb else 1) + 1))).save(f"{out}/sheet{k}.webp", "WEBP", quality=82, method=6)
    json.dump({"sheet": SHEET, "scale": SCALE, "sheets": len(sheets), "missing": missing,
               "items": {str(k): v for k, v in sorted(items.items())}},
              open(f"{GAME}/data/furniture.json", "w"), separators=(",", ":"))
    print("data/furniture.json:", len(items), "items,", len(imgs), "images,", len(sheets), "sheets,", len(missing), "without art", flush=True)


main()
# The shop building (Work 111, eventType 4) is not in the core's places.json, so it gets its own prefab library for the furniture view.
import subprocess
r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_prefabs.py"), "furniture/place111", "places/place111"], capture_output=True, text=True,
                   encoding="utf-8", errors="replace", timeout=600)
print("place111:", (r.stdout.strip().splitlines() or ["?"])[-1][:200], flush=True)
