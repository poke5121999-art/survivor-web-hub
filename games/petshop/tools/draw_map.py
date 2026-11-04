"""Debug: 2D map of art/store/colliders.json (floors, wall segments, boxes) + expansion walls + furniture -> shots/map.png"""
import json, math, os, sys
from PIL import Image, ImageDraw
G = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
col = json.load(open(os.path.join(G, "art/store/colliders.json")))
game = json.load(open(os.path.join(G, "data/game.json")))
X0, X1, Z0, Z1, S = -14, 16, -18, 10, 30
im = Image.new("RGB", (int((X1 - X0) * S), int((Z1 - Z0) * S)), (30, 30, 30))
d = ImageDraw.Draw(im)
P = lambda x, z: ((x - X0) * S, (z - Z0) * S)
for f in col["floors"]:
    d.polygon([P(f[1], f[2]), P(f[3], f[4]), P(f[5], f[6])], fill=(60, 120, 60) if f[0] == 9 else (60, 60, 140))
for s in col["segs"]:
    d.line([P(s[0], s[1]), P(s[2], s[3])], fill=(200, 200, 200), width=1)
walls = {n: e["type"] for e in game["expansions"] for n in e["walls"]}
for b in col["boxes"]:
    c, sz, y = b["c"], b["size"], b["yaw"]
    co, si = math.cos(y), math.sin(y)
    pts = [(c[0] + co * dx + si * dz, c[1] - si * dx + co * dz) for dx, dz in ((-sz[0]/2, -sz[1]/2), (sz[0]/2, -sz[1]/2), (sz[0]/2, sz[1]/2), (-sz[0]/2, sz[1]/2))]
    d.polygon([P(*p) for p in pts], outline=(255, 80, 80))
for x in range(X0, X1 + 1, 2):
    d.text(P(x, Z0 + 0.2), str(x), fill=(255, 255, 0))
for z in range(Z0, Z1 + 1, 2):
    d.text(P(X0 + 0.1, z), str(z), fill=(255, 255, 0))
im.save(os.path.join(os.path.dirname(G), "..", "shots", "map.png"))
print(im.size)
