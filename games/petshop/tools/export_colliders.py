"""Player collision footprint of a scene: art/<out-id>/colliders.json.

Usage: python -I tools/export_colliders.py <level> <out-id>      e.g. level1 store
The original player is a CharacterController (FirstPersonController) blocked by every non-trigger collider. The web
build moves the player on a floor grid instead, so each collider becomes its footprint at body height:
  boxes: {node, c: [x, z], size: [sx, sz], yaw}  BoxColliders that reach y 0.2..1.7 (node = scene.json index, so the
         runtime drops a box whose GameObject is inactive, e.g. an expansion wall once that expansion is bought)
  segs:  [x1, z1, x2, z2] where a MeshCollider triangle crosses y = 0.5 or y = 1.2 (walls, buildings, fences)
Coordinates are three.js (z negated)."""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm
from xform import Xform
from UnityPy.helpers.MeshHelper import MeshHandler

level, outid = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(HERE), "art", outid)
scene = json.load(open(os.path.join(OUT, "scene.json")))
N = scene["nodes"]
X = Xform(N)
boxes = []
for i, n in enumerate(N):
    bc = (n.get("k") or {}).get("BoxCollider")
    if not bc:
        continue
    for b in (bc if isinstance(bc, list) else [bc]):
        if b.get("m_IsTrigger") or not b.get("m_Enabled", 1):
            continue
        cen, sz = b["m_Center"], b["m_Size"]
        c, size, yaw = X.box(i, (cen["x"], cen["y"], -cen["z"]), (sz["x"] / 2, sz["y"] / 2, sz["z"] / 2))
        if c[1] + size[1] / 2 < 0.2 or c[1] - size[1] / 2 > 1.7:
            continue
        boxes.append({"node": i, "c": [round(c[0], 3), round(c[2], 3)], "size": [round(size[0], 3), round(size[2], 3)], "yaw": round(yaw, 4)})

# MeshColliders: Unity world matrix from the level's own Transform chain.
lv = mm.by_file(level)
tt = {}
def T(pid):
    if pid not in tt:
        tt[pid] = lv[pid].read_typetree()
    return tt[pid]
def trs(t):
    p, q, s = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s["x"], r[i][1] * s["y"], r[i][2] * s["z"], (p["x"], p["y"], p["z"])[i]] for i in range(3)]
def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) + (a[i][3] if j == 3 else 0) for j in range(4)] for i in range(3)]
def world(tpid):
    t = T(tpid)
    m = trs(t)
    f = t["m_Father"]["m_PathID"]
    return mul(world(f), m) if f else m
def active(gpid):
    return lv[gpid].read_typetree()["m_IsActive"]

segs = set()
H = (0.5, 1.2)
nmesh = 0
for o in lv.values():
    if o.type.name != "MeshCollider":
        continue
    mc = o.read()
    if mc.m_IsTrigger or not mc.m_Enabled or not mc.m_Mesh.m_PathID:
        continue
    go = mc.m_GameObject.read()
    if not go.m_IsActive:
        continue
    tr = next(c.component for c in go.m_Component if c.component.deref().type.name == "Transform")
    m = world(tr.m_PathID)
    mesh = mc.m_Mesh.read()
    h = MeshHandler(mesh)
    h.process()
    import numpy as np
    v = np.asarray(h.m_Vertices, dtype=np.float64).reshape(-1, 3).tolist()
    wv = [[m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3] for r in range(3)] for p in v]
    idx = h.m_IndexBuffer or []
    nmesh += 1
    for sm in mesh.m_SubMeshes:
        first = sm.firstByte // (2 if h.m_Use16BitIndices else 4)
        tri = idx[first:first + sm.indexCount]
        for k in range(0, len(tri) - 2, 3):
            a, b, c = (wv[tri[k] + (sm.baseVertex or 0)], wv[tri[k + 1] + (sm.baseVertex or 0)], wv[tri[k + 2] + (sm.baseVertex or 0)])
            for y in H:
                pts = []
                for p, q in ((a, b), (b, c), (c, a)):
                    if (p[1] - y) * (q[1] - y) < 0:
                        t = (y - p[1]) / (q[1] - p[1])
                        pts.append((p[0] + t * (q[0] - p[0]), -(p[2] + t * (q[2] - p[2]))))
                if len(pts) == 2 and math.dist(pts[0], pts[1]) > 0.01:
                    s = tuple(round(x, 2) for x in pts[0] + pts[1])
                    segs.add(s)
out = {"boxes": boxes, "segs": sorted(segs)}
json.dump(out, open(os.path.join(OUT, "colliders.json"), "w"), separators=(",", ":"))
print("boxes", len(boxes), "mesh colliders", nmesh, "segments", len(segs))
