"""Export a store's NavMeshData to art/<out-id>/navmesh.json.

Run from this folder after export_store.py:  PYTHONIOENCODING=utf-8 py -3.12 export_navmesh.py <out-id>   e.g. store1
The NavMeshData is the one the scene's "NavMesh Surface" (Unity.AI.Navigation.NavMeshSurface) points at, read from
art/<out-id>/scene.json.

Tile blob layout (Unity 6000.0.59f2, magic bytes 'VAND' = i32 0x444E4156, version 16), measured:
  header 72 bytes: i32 magic, version, x, y, agentTypeId; polyCount@20, vertCount@24, ...; f32 bmin@44, bmax@56, quant@68
  verts   vertCount * 3 f32, absolute world coords, start at byte 72
  polys   polyCount * 32 bytes: u16 verts[6], u16 neis[6], u32 firstLink, u8 vertCount, u8 area, 2 pad
Detail meshes, links, BV tree and off-mesh connections follow and are ignored (m_OffMeshLinks is empty).
NavMeshData m_Position/m_Rotation place the tiles (identity in most stores, not in Store_6).

Output is converted once to three.js space: (x,y,z) -> (x,y,-z) and each polygon is wound counter-clockwise seen from +Y
(right-handed: rotation from +Z towards +X). Adjacency is rebuilt geometrically from shared welded edges, with an
overlap pass for T-junction edges between tiles.
"""
import io
import json
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mm

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_ID = sys.argv[1] if len(sys.argv) > 1 else "store1"
OUT = os.path.join(HERE, "..", "art", OUT_ID, "navmesh.json")
SCENE = os.path.join(HERE, "..", "art", OUT_ID, "scene.json")
MAGIC = 0x444E4156  # bytes 'VAND' in the file
WELD = 1000.0  # 1 mm


def tiles(data):
    for t in data["m_NavMeshTiles"]:
        b = bytes(t["m_MeshData"])
        if len(b) < 72:
            continue
        magic, ver, tx, ty, agent, pc, vc = struct.unpack_from("<7i", b, 0)
        if magic != MAGIC or pc == 0:
            continue
        verts = [struct.unpack_from("<3f", b, 72 + i * 12) for i in range(vc)]
        po = 72 + vc * 12
        polys = []
        for i in range(pc):
            r = b[po + i * 32: po + i * 32 + 32]
            vs = struct.unpack_from("<6H", r, 0)
            n, area = r[28], r[29]
            assert 3 <= n <= 6 and all(v < vc for v in vs[:n]), (tx, ty, i, vs, n)
            polys.append((list(vs[:n]), area))
        yield (tx, ty), verts, polys


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def rot(q, v):
    x, y, z, w = q
    # v' = v + 2w(q×v) + 2 q×(q×v)
    cx, cy, cz = y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]
    dx, dy, dz = y * cz - z * cy, z * cx - x * cz, x * cy - y * cx
    return (v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz))


def world(nodes, i, cache):
    """(pos, quat, scale) of node i, composed from local TRS in scene.json (three.js space)."""
    if i in cache:
        return cache[i]
    n = nodes[i]
    t = tuple(n.get("t", (0, 0, 0)))
    r = tuple(n.get("r", (0, 0, 0, 1)))
    s = tuple(n.get("s", (1, 1, 1)))
    if n["p"] < 0:
        res = (t, r, s)
    else:
        pp, pq, ps = world(nodes, n["p"], cache)
        sc = rot(pq, (t[0] * ps[0], t[1] * ps[1], t[2] * ps[2]))
        res = ((pp[0] + sc[0], pp[1] + sc[1], pp[2] + sc[2]), quat_mul(pq, r), (s[0] * ps[0], s[1] * ps[1], s[2] * ps[2]))
    cache[i] = res
    return res


def obstacles():
    nodes = json.load(io.open(SCENE, encoding="utf-8"))["nodes"]
    cache, out = {}, []
    for i, n in enumerate(nodes):
        o = n.get("k", {}).get("NavMeshObstacle")
        if not o:
            continue
        pos, q, s = world(nodes, i, cache)
        c = o["m_Center"]
        lc = (c["x"] * s[0], c["y"] * s[1], c["z"] * s[2])
        lc = rot(q, lc)
        e = o.get("m_Extents") or {"x": 0, "y": 0, "z": 0}
        if o["m_Shape"] == 1:
            size = [2 * e["x"] * abs(s[0]), 2 * e["y"] * abs(s[1]), 2 * e["z"] * abs(s[2])]
            shape = "box"
        else:  # capsule: radius, height in the (Extents-less) fields
            r_, h_ = o.get("m_Radius", 0), o.get("m_Height", 0)
            size = [2 * r_ * abs(s[0]), h_ * abs(s[1]), 2 * r_ * abs(s[2])]
            shape = "capsule"
        out.append({"name": n["n"], "shape": shape, "carve": bool(o.get("m_Carve")),
                    "center": [round(pos[0] + lc[0], 4), round(pos[1] + lc[1], 4), round(pos[2] + lc[2], 4)],
                    "size": [round(v, 4) for v in size], "rot": [round(v, 6) for v in q]})
    return out


def main():
    mm.load()
    nodes = json.load(io.open(SCENE, encoding="utf-8"))["nodes"]
    surf = next(n["k"]["Unity.AI.Navigation.NavMeshSurface"] for n in nodes if n["n"] == "NavMesh Surface")
    ref = (surf[0] if isinstance(surf, list) else surf)["m_NavMeshData"]
    obj = mm.by_file(ref["f"])[ref["id"]]
    data = obj.read_typetree()
    # Tiles are baked in the NavMeshData's own frame (Store_6 moves and turns it); placed in Unity space before conversion.
    pos, q = data["m_Position"], data["m_Rotation"]
    P, Q = (pos["x"], pos["y"], pos["z"]), (q["x"], q["y"], q["z"], q["w"])

    vid, verts, polys = {}, [], []
    seen_polys, dupes = set(), 0
    ntiles = 0
    for _, tv, tp in tiles(data):
        ntiles += 1
        remap = []
        for v in tv:
            x, y, z = rot(Q, v)
            p = (x + P[0], y + P[1], -(z + P[2]))  # Unity -> three.js
            k = (round(p[0] * WELD), round(p[2] * WELD))
            if k not in vid:
                vid[k] = len(verts)
                verts.append(p)
            remap.append(vid[k])
        for vs, area in tp:
            if area == 1:  # Not Walkable
                continue
            ids = [remap[v] for v in vs]
            key = tuple(sorted(ids))
            if key in seen_polys:  # the same polygon baked twice (overlapping tiles); keep one
                dupes += 1
                continue
            seen_polys.add(key)
            # Unity winding is flipped by z -> -z; force counter-clockwise seen from +Y (z->x positive)
            a = sum(verts[ids[i]][2] * verts[ids[(i + 1) % len(ids)]][0] - verts[ids[(i + 1) % len(ids)]][2] * verts[ids[i]][0]
                    for i in range(len(ids)))
            if a < 0:
                ids.reverse()
            polys.append(ids)

    # adjacency from exactly shared edges
    edges = {}
    for pi, ps in enumerate(polys):
        for e in range(len(ps)):
            a, b = ps[e], ps[(e + 1) % len(ps)]
            edges.setdefault((min(a, b), max(a, b)), []).append((pi, e))
    adj = [[-1] * len(p) for p in polys]
    for lst in edges.values():
        if len(lst) == 2:
            (p0, e0), (p1, e1) = lst
            adj[p0][e0], adj[p1][e1] = p1, p0
    exact = sum(1 for a in adj for x in a if x >= 0)

    # T-junction pass: open edges of different polys that are collinear and overlap
    open_edges = [(pi, e) for pi, a in enumerate(adj) for e in range(len(a)) if a[e] < 0]
    buckets = {}
    for pi, e in open_edges:
        ps = polys[pi]
        a, b = verts[ps[e]], verts[ps[(e + 1) % len(ps)]]
        for key in {(round(a[0] / 2), round(a[2] / 2)), (round(b[0] / 2), round(b[2] / 2))}:
            buckets.setdefault(key, set()).add((pi, e))
    tj = 0
    seen = set()
    for cell in buckets.values():
        cell = sorted(cell)
        for i in range(len(cell)):
            for j in range(i + 1, len(cell)):
                (p0, e0), (p1, e1) = cell[i], cell[j]
                if p0 == p1 or ((p0, e0), (p1, e1)) in seen:
                    continue
                seen.add(((p0, e0), (p1, e1)))
                if adj[p0][e0] >= 0 or adj[p1][e1] >= 0:  # one neighbour per edge; keep the link table symmetric
                    continue
                a0, b0 = verts[polys[p0][e0]], verts[polys[p0][(e0 + 1) % len(polys[p0])]]
                a1, b1 = verts[polys[p1][e1]], verts[polys[p1][(e1 + 1) % len(polys[p1])]]
                dx, dz = b0[0] - a0[0], b0[2] - a0[2]
                L = math.hypot(dx, dz)
                if L < 1e-6:
                    continue
                ux, uz = dx / L, dz / L
                # both endpoints of edge 1 within 5 cm of the line of edge 0, and opposite direction, overlapping range
                def off(p):
                    return abs((p[0] - a0[0]) * uz - (p[2] - a0[2]) * ux)
                if off(a1) > 0.05 or off(b1) > 0.05:
                    continue
                t1 = (a1[0] - a0[0]) * ux + (a1[2] - a0[2]) * uz
                t2 = (b1[0] - a0[0]) * ux + (b1[2] - a0[2]) * uz
                lo, hi = max(0, min(t1, t2)), min(L, max(t1, t2))
                if hi - lo > 0.1 and abs(a1[1] - a0[1]) < 2.0:
                    adj[p0][e0] = p1
                    adj[p1][e1] = p0
                    tj += 1

    flat = [round(c, 4) for v in verts for c in v]
    xs, ys, zs = flat[0::3], flat[1::3], flat[2::3]
    out = {"verts": flat, "polys": polys, "adj": adj,
           "bounds": {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
           "obstacles": obstacles()}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, separators=(",", ":"))
    print("tiles(non-empty)", ntiles, "verts", len(verts), "polys", len(polys), "exact links", exact, "tjunction links", tj, "duplicate polys dropped", dupes,
          "open edges", sum(1 for a in adj for x in a if x < 0), "obstacles", len(out["obstacles"]), "bounds", out["bounds"])


if __name__ == "__main__":
    main()
