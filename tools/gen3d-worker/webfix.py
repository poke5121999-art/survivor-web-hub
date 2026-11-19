"""Cut the skin 'webbing' TripoSG leaves between legs (and under the arms) out of a rigged glb, then cap the holes.

TripoSG often fuses the inner thighs (and the upper arm to the torso side) into one surface. After rigging, those faces
have one corner on the left leg and another on the right leg, so a walk stretches them into a membrane. This step:
1. labels every vertex by the bone chain carrying most of its skin weight (left/right leg, left/right arm, body);
2. removes faces with corners on both leg chains, and arm<->body faces below the armpit (shoulder joint height minus
   the upper-arm radius), keeping the normal shoulder;
3. caps every hole the cut opened: each boundary loop is split into runs of one chain, each run is closed by a fan to
   a new centre vertex that copies the run's skin weights (renormalised top 4) and the UV of the run vertex nearest
   the centre, so the cap moves rigidly with its own limb and shows the colour next to it.

Works on the glb written by rig.py (one skinned primitive, indexed, POSITION NORMAL TEXCOORD_0? JOINTS_0 WEIGHTS_0).
Usage: python webfix.py IN.glb OUT.glb  (or webfix.fix(path) from pipe_rig.py; returns the counts).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipekit as K  # noqa: E402

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
CHAINS = ("body", "Left-leg", "Right-leg", "Left-arm", "Right-arm")


def chain_of(name):
    n = name.split(":")[-1].replace("mixamorig_", "")
    for side in ("Left", "Right"):
        if not n.startswith(side):
            continue
        rest = n[len(side):]
        if rest.startswith(("UpLeg", "Leg", "Foot", "ToeBase", "Toe_End")):
            return CHAINS.index(side + "-leg")
        if rest.startswith(("Arm", "ForeArm", "Hand")):
            return CHAINS.index(side + "-arm")
    return 0


def _acc(js, views, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]])
    n = NC[a["type"]]
    raw = views[a["bufferView"]]
    stride = bv.get("byteStride", dt.itemsize * n)
    off = a.get("byteOffset", 0)
    if stride == dt.itemsize * n:
        return np.frombuffer(raw, dt, a["count"] * n, off).reshape(a["count"], n).copy()
    buf = np.frombuffer(raw, np.uint8)
    rows = np.stack([buf[off + k * stride: off + k * stride + dt.itemsize * n] for k in range(a["count"])])
    return rows.view(dt).reshape(a["count"], n).copy()


def _bind_worlds(js, views):
    skin = js["skins"][0]
    ibm = _acc(js, views, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row
    return {js["nodes"][j]["name"]: np.linalg.inv(ibm[k]) for k, j in enumerate(skin["joints"])}


def _loops(edges):
    """Boundary edges (directed, as they appear in their single face) -> list of vertex loops. A vertex touched by two
    loops (a pinch, common after a cut) is handled by splitting the walk whenever it comes back to a vertex on its path."""
    nxt = {}
    for a, b in edges:
        nxt.setdefault(a, []).append(b)
    used, loops = set(), []
    for a, b in edges:
        if (a, b) in used:
            continue
        used.add((a, b))
        path, pos, cur = [a], {a: 0}, b
        while True:
            if cur in pos:
                i = pos[cur]
                if len(path) - i >= 3:
                    loops.append(path[i:])
                for v in path[i + 1:]:
                    del pos[v]
                path = path[:i + 1]
            else:
                pos[cur] = len(path)
                path.append(cur)
            cand = [c for c in nxt.get(cur, []) if (cur, c) not in used]
            if not cand:
                break
            used.add((cur, cand[0]))
            cur = cand[0]
    return loops


def analyse(js, views):
    prim = js["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    P = _acc(js, views, at["POSITION"]).astype(np.float64)
    J = _acc(js, views, at["JOINTS_0"]).astype(np.int64)
    W = _acc(js, views, at["WEIGHTS_0"]).astype(np.float64)
    F = _acc(js, views, prim["indices"]).reshape(-1, 3).astype(np.int64)
    skin = js["skins"][0]
    jchain = np.array([chain_of(js["nodes"][j]["name"]) for j in skin["joints"]])
    cw = np.zeros((len(P), len(CHAINS)))
    for k in range(4):
        np.add.at(cw, (np.arange(len(P)), jchain[J[:, k]]), W[:, k])
    dom = cw.argmax(1)
    return P, J, W, F, dom


def bridges(P, F, dom, worlds):
    fl = dom[F]
    LL, RL, LA, RA = 1, 2, 3, 4
    has = lambda c: (fl == c).any(1)
    leg = has(LL) & has(RL)
    arm = np.zeros(len(F), bool)
    ymin, ymax = P[:, 1].min(), P[:, 1].max()
    info = {}
    for side, c in (("Left", LA), ("Right", RA)):
        sh = worlds.get("mixamorig:%sArm" % side)
        el = worlds.get("mixamorig:%sForeArm" % side)
        if sh is None or el is None:
            continue
        s, e = sh[:3, 3], el[:3, 3]
        ax = (e - s) / max(np.linalg.norm(e - s), 1e-9)
        av = np.nonzero(dom == c)[0]
        t = (P[av] - s) @ ax
        mid = av[(t > 0.2 * np.linalg.norm(e - s)) & (t < 0.8 * np.linalg.norm(e - s))]
        d = P[mid] - s
        r = float(np.median(np.linalg.norm(d - np.outer(d @ ax, ax), axis=1))) if len(mid) else 0.0
        armpit = s[1] - r
        cy = P[F].mean(1)[:, 1]
        br = has(c) & has(0) & (cy < armpit)
        arm |= br
        info[side] = {"shoulder_y": round(float((s[1] - ymin) / (ymax - ymin)), 3), "upperarm_r": round(r, 4), "faces": int(br.sum())}
    return leg, arm, info


def fix(src, dst=None, log=K.note):
    dst = dst or src
    js, blob = K.read_glb(src)
    views = [bytes(blob[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]) for v in js["bufferViews"]]
    prim = js["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    P, J, W, F, dom = analyse(js, views)
    worlds = _bind_worlds(js, views)
    leg, arm, info = bridges(P, F, dom, worlds)
    cut = leg | arm
    rep = {"faces": int(len(F)), "leg_leg": int(leg.sum()), "arm_body_below_armpit": int(arm.sum()), "arms": info}
    if not cut.any():
        rep["caps"] = 0
        log("webfix: " + json.dumps(rep))
        return rep
    # weld by position so UV seams do not count as holes
    q = np.round(P / max(np.ptp(P, 0).max(), 1e-9) * 2 ** 20).astype(np.int64)
    _, wid = np.unique(q, axis=0, return_inverse=True)
    wid = wid.reshape(-1)
    Fk = F[~cut]
    Fw = wid[Fk]

    def edge_count(Fx):
        e = np.concatenate([Fx[:, [0, 1]], Fx[:, [1, 2]], Fx[:, [2, 0]]])
        key = np.minimum(e[:, 0], e[:, 1]) * (wid.max() + 1) + np.maximum(e[:, 0], e[:, 1])
        u, c = np.unique(key, return_counts=True)
        return e, key, dict(zip(u.tolist(), c.tolist()))
    _, _, before = edge_count(wid[F])
    e, key, after = edge_count(Fw)
    ek = np.concatenate([Fk[:, [0, 1]], Fk[:, [1, 2]], Fk[:, [2, 0]]])  # same edges in original vertex ids
    new_b = np.array([after[k] == 1 and before.get(k, 0) > 1 for k in key.tolist()])  # opened by the cut
    # walk loops on welded ids; keep one original vertex per welded id for attributes
    rep_v = {}
    for (a, b), (wa, wb) in zip(ek[new_b], e[new_b]):
        rep_v.setdefault(int(wa), int(a)); rep_v.setdefault(int(wb), int(b))
    loops = _loops([(int(wa), int(wb)) for wa, wb in e[new_b]])

    names = {name: at[name] for name in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0") if name in at}
    A = {name: _acc(js, views, i) for name, i in names.items()}
    add = {name: [] for name in A}
    nV = len(P)
    caps = []
    junctions = 0
    hips = [k for k, j in enumerate(js["skins"][0]["joints"]) if js["nodes"][j]["name"].split(":")[-1] == "Hips"][0]
    for loop in loops:
        ov = np.array([rep_v[w] for w in loop])
        lab = dom[ov]
        # rotate so the loop starts at a label change, then split into runs of one chain
        ch = np.nonzero(lab != np.roll(lab, 1))[0]
        start = int(ch[0]) if len(ch) else 0
        ov, lab = np.roll(ov, -start), np.roll(lab, -start)
        cuts = list(np.nonzero(lab != np.roll(lab, 1))[0]) or [0]
        runs = [ov[cuts[i]: (cuts[i + 1] if i + 1 < len(cuts) else len(ov))] for i in range(len(cuts))]
        # Each run closes on its own fan (weights of that run only), so a cap never joins two limbs. A run also takes
        # the first vertex of the next run, so the edge between them is covered; its fan then closes along the chord
        # (next run start -> own start). The chords of all runs bound a small middle polygon, filled from the run
        # starts (no middle polygon for two runs: the two fans share the chord).
        polys = [ov] if len(runs) == 1 else [np.append(r, runs[(i + 1) % len(runs)][0]) for i, r in enumerate(runs)]
        # left leg run next to right leg run (no body vertex between): the fan closing over that edge would bridge the
        # legs again, so the two vertices of that edge lean on the hips (60 %) like the rest of the crotch
        for i, r in enumerate(runs if len(runs) > 1 else []):
            r2 = runs[(i + 1) % len(runs)]
            if {int(dom[r[-1]]), int(dom[r2[0]])} == {1, 2}:
                for v in (r[-1], r2[0]):
                    for u in np.nonzero(wid == wid[v])[0]:  # every copy of the vertex (UV seams split it)
                        acc = {hips: 0.6}
                        for k in range(4):
                            acc[int(J[u, k])] = acc.get(int(J[u, k]), 0.0) + 0.4 * float(W[u, k])
                        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
                        top += [(top[0][0], 0.0)] * (4 - len(top))
                        tot = sum(w for _, w in top) or 1.0
                        J[u] = [j for j, _ in top]; W[u] = [w / tot for _, w in top]
                        A["JOINTS_0"][u] = J[u]; A["WEIGHTS_0"][u] = W[u]
                    dom[v] = 0
                    junctions += 1
        starts = [r[0] for r in runs] if len(runs) > 2 else []
        body = [i for i, v in enumerate(starts) if dom[v] == 0]
        if body:  # fan the middle polygon from a body vertex, so its triangles never hold both legs
            starts = starts[body[0]:] + starts[:body[0]]
        for i in range(1, len(starts) - 1):
            caps.append([starts[0], starts[i + 1], starts[i]])
        for pi, poly in enumerate(polys):
            run = poly if len(runs) == 1 else poly[:-1]
            if len(poly) < 3:
                continue  # one-vertex run: its one edge is closed by the neighbour's chord (or the middle fill)
            c = P[run].mean(0)
            near = run[np.argmin(np.linalg.norm(P[run] - c, axis=1))]
            # skin weights: mean over the run, top 4, renormalised
            acc = {}
            for v in run:
                for k in range(4):
                    acc[int(J[v, k])] = acc.get(int(J[v, k]), 0.0) + float(W[v, k])
            top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
            while len(top) < 4:
                top.append((top[0][0], 0.0))
            s = sum(w for _, w in top) or 1.0
            ci = nV
            nV += 1
            add["POSITION"].append(c)
            if "NORMAL" in A:
                nrm = np.cross(P[run[1]] - P[run[0]], P[run[-1]] - P[run[0]])
                add["NORMAL"].append(nrm / max(np.linalg.norm(nrm), 1e-12))
            if "TEXCOORD_0" in A:
                add["TEXCOORD_0"].append(A["TEXCOORD_0"][near])
            add["JOINTS_0"].append([j for j, _ in top])
            add["WEIGHTS_0"].append([w / s for _, w in top])
            for i in range(len(poly)):  # cyclic: the last edge is the chord back to the run start
                a, b = poly[i], poly[(i + 1) % len(poly)]
                caps.append([b, a, ci])  # boundary edge a->b belongs to a kept face; cap face runs b->a
    capF = np.array(caps, np.int64).reshape(-1, 3)
    # cap normals: average of the fan faces, pointing like the fan's winding
    newF = np.concatenate([Fk, capF]).astype(np.uint32)
    for name in add:
        if add[name]:
            A[name] = np.concatenate([A[name], np.array(add[name], A[name].dtype).reshape(-1, A[name].shape[1])])
    if "NORMAL" in A and len(capF):
        Pn = A["POSITION"].astype(np.float64)
        fn = np.cross(Pn[capF[:, 1]] - Pn[capF[:, 0]], Pn[capF[:, 2]] - Pn[capF[:, 0]])
        cn = np.zeros((nV, 3)); np.add.at(cn, capF[:, 2], fn)
        newc = np.arange(len(P), nV)
        A["NORMAL"][newc] = (cn[newc] / np.maximum(np.linalg.norm(cn[newc], axis=1, keepdims=True), 1e-12)).astype(np.float32)
    # rewrite accessors: append new views for the changed attributes + indices, drop the old ones
    for name, arr in list(A.items()) + [("_idx", newF.reshape(-1, 1))]:
        ai = names[name] if name != "_idx" else prim["indices"]
        acc = js["accessors"][ai]
        dt = np.dtype(CT[acc["componentType"]])
        data = np.ascontiguousarray(arr.astype(dt))
        views.append(data.tobytes())
        js["bufferViews"].append({"buffer": 0, "byteOffset": 0, "byteLength": 0})
        if name != "_idx":
            js["bufferViews"][-1]["target"] = 34962
        else:
            js["bufferViews"][-1]["target"] = 34963
        acc["bufferView"] = len(views) - 1
        acc["byteOffset"] = 0
        acc["count"] = int(len(data) if name != "_idx" else data.size)
        if name == "POSITION":
            acc["min"] = data.min(0).tolist(); acc["max"] = data.max(0).tolist()
    # drop the now unused views
    used = {a["bufferView"] for a in js["accessors"] if "bufferView" in a} | {im["bufferView"] for im in js.get("images") or [] if "bufferView" in im}
    remap, keep, bvs = {}, [], []
    for i, b in enumerate(views):
        if i in used:
            remap[i] = len(keep); keep.append(b); bvs.append(js["bufferViews"][i])
    js["bufferViews"] = bvs
    for a in js["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    for im in js.get("images") or []:
        if "bufferView" in im:
            im["bufferView"] = remap[im["bufferView"]]
    K.write_glb(dst, js, keep)
    rep.update({"removed": int(cut.sum()), "holes": len(loops), "leg_junctions": junctions, "cap_faces": int(len(capF)), "cap_verts": int(nV - len(P))})
    log("webfix: " + json.dumps(rep))
    return rep


if __name__ == "__main__":
    fix(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
