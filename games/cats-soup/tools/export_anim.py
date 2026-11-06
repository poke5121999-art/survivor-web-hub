"""Export Cats&Soup AnimationClips + AnimatorControllers as JSON for the three.js build (port of casual-farm/tools/export_anim.py).

Usage: py -3.12 -I export_anim.py

Writes games/cats-soup/art/anim/
  clips.json        {"clips": {"<name>@<file>:<pathId>": {name, duration, loop, tracks:[{path, bone, prop, times, values}]}}}
  controllers.json  {"<controller>": {ref:"<file>:<pathId>", params, layers:[{name, default, states, transitions}]}}
  export.log
The prefab Animators (cat1, kittycat1) have m_Controller = null in the data (assigned at runtime), so the consumer picks
the controller explicitly; the cat controller ref is "dea171a7c2ad211459f43c305c9d9a13:1".
Generic bindings name bones by CRC32 of the path relative to the Animator GameObject; the hash table is built from the
node trees of art/cat/scene.json (roots cat1 and kittycat1). Coordinates: position (x,y,-z), quaternion (-x,-y,z,w).
"""
import io, json, math, os, struct, sys, zlib
import numpy as np
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "anim")
CTRL_FILES = ["dea171a7c2ad211459f43c305c9d9a13"]
LOG = []
EPS = {"position": 1.5e-3, "quaternion": 8e-3, "scale": 8e-3}
COND = {1: "if", 2: "ifnot", 3: "greater", 4: "less", 6: "equals", 7: "notequals"}
PTYPE = {1: "float", 3: "int", 4: "bool", 9: "trigger"}

EXT = {}
CLIPKEY = {}
REST = {}   # root name -> {path: scene node}; constant tracks equal to every root's rest pose are dropped (the mixer restores rest)
RESTKEY = {"position": "t", "quaternion": "r", "scale": "s"}


def log(s):
    LOG.append(s)


def stem(fn):
    return fn


def deps(names):
    import UnityPy
    seen, todo = [], list(names)
    while todo:
        n = todo.pop()
        if n in seen or n in ("globalgamemanagers.assets", "globalgamemanagers") or n.startswith("library/"):
            continue
        p = cns.path(n)
        if not os.path.exists(p):
            continue
        seen.append(n)
        e = UnityPy.load(p)
        for f in e.files.values():
            for x in getattr(f, "externals", []):
                todo.append(x.path.split("/")[-1])
    return seen


def ptr_obj(sf, p):
    if not p or not p["m_PathID"]:
        return None
    if p["m_FileID"] == 0:
        return EXT.get((sf.name, p["m_PathID"]))
    return EXT.get((cns.ext_names(sf)[p["m_FileID"] - 1], p["m_PathID"]))


def scene_paths():
    """root name -> {path: node index}; plus crc32 -> path table."""
    sc = json.load(open(os.path.join(GAME, "art", "cat", "scene.json"), encoding="utf-8"))
    nodes = sc["nodes"]
    kids = {}
    for i, n in enumerate(nodes):
        kids.setdefault(n["p"], []).append(i)
    roots, h2p = {}, {}

    def walk(i, path, tbl):
        tbl[path] = i
        h2p.setdefault(zlib.crc32(path.encode("utf-8")) & 0xFFFFFFFF, path)
        for c in kids.get(i, []):
            walk(c, nodes[c]["n"] if not path else path + "/" + nodes[c]["n"], tbl)
    for r in sc["roots"]:
        tbl = {}
        walk(r["node"], "", tbl)
        roots[nodes[r["node"]]["n"]] = tbl
    for rn, tbl in roots.items():
        REST[rn] = {pth: nodes[i] for pth, i in tbl.items()}
    return roots, h2p


# ---------------- clip decoding (ported from toc-do export_driver.decode_clip) ----------------
def decode_clip(d):
    mc = d["m_MuscleClip"]
    c = mc["m_Clip"]["data"]
    sc, dc, cc = c["m_StreamedClip"], c["m_DenseClip"], c["m_ConstantClip"]
    raw = struct.pack(f"<{len(sc['data'])}I", *sc["data"])
    frames, p = [], 0
    while p < len(raw):
        t, nk = struct.unpack_from("<fI", raw, p)
        p += 8
        keys = []
        for _ in range(nk):
            keys.append(struct.unpack_from("<I4f", raw, p))
            p += 20
        frames.append((t, keys))
    ns, nd = sc["curveCount"], dc["m_CurveCount"]
    dense = np.array(dc["m_SampleArray"], dtype=np.float64).reshape(-1, nd) if nd else None
    const = np.array(cc["data"], dtype=np.float64)

    def at(t):
        out = np.zeros(ns + nd + len(const))
        seg = {}
        for ft, keys in frames:
            if ft > t + 1e-6:
                break
            for k in keys:
                seg[k[0]] = (ft, k)
        for i, (ft, k) in seg.items():
            dt = t - ft
            co = k[1:]
            if not all(math.isfinite(x) and abs(x) < 1e9 for x in co):   # stepped key
                out[i] = co[3] if math.isfinite(co[3]) else 0.0
            else:
                out[i] = ((co[0] * dt + co[1]) * dt + co[2]) * dt + co[3]
        if nd:
            x = (t - dc["m_BeginTime"]) * dc["m_SampleRate"]
            i0 = int(min(max(math.floor(x), 0), len(dense) - 1))
            i1 = min(i0 + 1, len(dense) - 1)
            w = min(max(x - i0, 0.0), 1.0)
            out[ns:ns + nd] = dense[i0] * (1 - w) + dense[i1] * w
        out[ns + nd:] = const
        return out
    return at, mc["m_StartTime"], mc["m_StopTime"], mc["m_LoopTime"]


def euler_to_q(e):
    x, y, z = [math.radians(a) for a in e]
    cx, sx, cy, sy, cz, sz = math.cos(x / 2), math.sin(x / 2), math.cos(y / 2), math.sin(y / 2), math.cos(z / 2), math.sin(z / 2)
    qx, qy, qz = (sx, 0, 0, cx), (0, sy, 0, cy), (0, 0, sz, cz)

    def mul(a, b):
        ax, ay, az, aw = a
        bx, by, bz, bw = b
        return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
    # Cats&Soup's Euler curves (3ds Max biped) compose as Z * Y * X: that reproduces the rest pose of the pelvis from
    # the whip clip (error 0.004), Unity's default Y * X * Z (My Mini Mart) is off by 0.92 and lays the cat on its side.
    return mul(mul(qz, qy), qx)


def reduce_keys(times, vals, eps, quat):
    """Douglas-Peucker on (time, vector): keep keys that linear interpolation of the kept neighbours misses by > eps."""
    n = len(times)
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        w = ((times[a + 1:b] - times[a]) / (times[b] - times[a]))[:, None]
        interp = vals[a] * (1 - w) + vals[b] * w
        if quat:
            interp = interp / np.linalg.norm(interp, axis=1, keepdims=True)
        err = np.abs(interp - vals[a + 1:b]).max(1)
        j = int(err.argmax())
        if err[j] > eps:
            keep[a + 1 + j] = True
            stack += [(a, a + 1 + j), (a + 1 + j, b)]
    return keep


def rnd(a, nd):
    return [round(float(x), nd) + 0.0 for x in np.asarray(a).ravel()]


def is_rest(path, prop, v):
    key, hit = RESTKEY[prop], 0
    for tbl in REST.values():
        n = tbl.get(path)
        if n is None:
            continue
        r = n.get(key)
        if r is None:
            r = {"t": [0, 0, 0], "r": [0, 0, 0, 1], "s": [1, 1, 1]}[key]
        d = max(abs(a - b) for a, b in zip(r, v))
        if key == "r":
            d = min(d, max(abs(a + b) for a, b in zip(r, v)))
        if d > 1e-3:
            return False
        hit += 1
    return hit > 0


def export_clip(d, h2p, unresolved):
    if d["m_Legacy"]:
        raise ValueError("legacy clip")
    at, t0, t1, loop = decode_clip(d)
    sr = d["m_SampleRate"] or 30.0
    dur = t1 - t0
    n = max(2, int(round(dur * sr)) + 1)
    times = np.linspace(t0, t1, n)
    vals = np.stack([at(t) for t in times])
    tracks, ci, other, nconst, nunres = [], 0, 0, 0, 0
    for b in d["m_ClipBindingConstant"]["genericBindings"]:
        tid, att = b["typeID"], b["attribute"]
        if b["isPPtrCurve"] or tid != 4 or att not in (1, 2, 3, 4):
            other += 1
            ci += 1
            continue
        w = 4 if att == 2 else 3
        v = vals[:, ci:ci + w]
        ci += w
        path = h2p.get(b["path"])
        if path is None:
            nunres += 1
            unresolved.setdefault(b["path"], set()).add(d["m_Name"])
            continue
        if att == 1:
            prop, v = "position", np.stack([v[:, 0], v[:, 1], -v[:, 2]], 1)
        elif att == 3:
            prop, v = "scale", v.copy()
        else:
            prop = "quaternion"
            q = v if att == 2 else np.array([euler_to_q(e) for e in v])
            q = np.stack([-q[:, 0], -q[:, 1], q[:, 2], q[:, 3]], 1)
            q = q / np.linalg.norm(q, axis=1, keepdims=True)
            for i in range(1, len(q)):
                if np.dot(q[i], q[i - 1]) < 0:
                    q[i] = -q[i]
            v = q
        tt = times - t0
        if np.abs(v - v[0]).max() < 1e-5:
            nconst += 1
            if is_rest(path, prop, v[0]):
                continue
            tt, v = tt[:1], v[:1]
        else:
            keep = reduce_keys(tt, v, EPS[prop], prop == "quaternion")
            tt, v = tt[keep], v[keep]
        tracks.append({"path": path, "bone": path.split("/")[-1], "prop": prop,
                       "times": rnd(tt, 3), "values": rnd(v, 4)})
    clip = {"name": d["m_Name"], "duration": round(dur, 4), "loop": bool(loop), "tracks": tracks}
    return clip, dict(tracks=len(tracks), const=nconst, unresolved=nunres, other_bindings=other)


# ---------------- controllers ----------------
def clip_key(sf, p):
    o = ptr_obj(sf, p)
    if o is None or o.type.name != "AnimationClip":
        return None
    return CLIPKEY.get((o.assets_file.name, o.path_id))


def export_controller(sf, d, remap=None):
    tos = {int(k): v for k, v in dict(d["m_TOS"]).items()}

    def nm(h):
        return tos.get(h, f"#{h}")
    c = d["m_Controller"]
    clips = [clip_key(sf, p) for p in d["m_AnimationClips"]]
    if remap:
        clips = [remap.get(k, k) for k in clips]
    dv = c["m_DefaultValues"]["data"]
    params = []
    for v in c["m_Values"]["data"]["m_ValueArray"]:
        ty, ix = v["m_Type"], v["m_Index"]
        arr = {1: "m_FloatValues", 3: "m_IntValues"}.get(ty, "m_BoolValues")
        try:
            dflt = dv[arr][ix]
        except IndexError:
            dflt = 0
        params.append({"name": nm(v["m_ID"]), "type": PTYPE.get(ty, f"type{ty}"),
                       "default": round(dflt, 5) if isinstance(dflt, float) else dflt})
    layers = []
    for ly in c["m_LayerArray"]:
        ld = ly["data"]
        sm = c["m_StateMachineArray"][ld["m_StateMachineIndex"]]["data"]
        sts = sm["m_StateConstantArray"]
        names = [nm(s["data"]["m_NameID"]) for s in sts]
        states, trans = {}, []

        def tr(frm, tc):
            dst = tc["m_DestinationState"]
            conds = []
            for cd in tc["m_ConditionConstantArray"]:
                x = cd["data"]
                conds.append({"param": nm(x["m_EventID"]), "mode": COND.get(x["m_ConditionMode"], str(x["m_ConditionMode"])),
                              "threshold": round(x["m_EventThreshold"], 5)})
            return {"from": frm, "to": names[dst] if 0 <= dst < len(names) else None, "conditions": conds,
                    "duration": round(tc["m_TransitionDuration"], 4), "hasExitTime": bool(tc["m_HasExitTime"]),
                    "exitTime": round(tc["m_ExitTime"], 4), "fixedDuration": bool(tc["m_HasFixedDuration"]),
                    "offset": round(tc["m_TransitionOffset"], 4)}
        for i, s in enumerate(sts):
            sd = s["data"]
            nodes = sd["m_BlendTreeConstantArray"][0]["data"]["m_NodeArray"] if sd["m_BlendTreeConstantArray"] else []
            st = {"clip": None, "speed": round(sd["m_Speed"], 4), "loop": bool(sd["m_Loop"])}
            if sd["m_SpeedParamID"]:
                st["speedParam"] = nm(sd["m_SpeedParamID"])
            if nodes:
                root = nodes[0]["data"]
                if not root["m_ChildIndices"]:
                    st["clip"] = clips[root["m_ClipID"]] if root["m_ClipID"] < len(clips) else None
                else:
                    bt = {"type": {0: "1d", 1: "2d-simple", 2: "2d-freeform-dir", 3: "2d-freeform-cart", 4: "direct"}.get(root["m_BlendType"], str(root["m_BlendType"])),
                          "param": nm(root["m_BlendEventID"]), "children": []}
                    if root["m_BlendEventYID"] != 0xFFFFFFFF:
                        bt["paramY"] = nm(root["m_BlendEventYID"])
                    th = root["m_Blend1dData"]["data"]["m_ChildThresholdArray"]
                    pos = root["m_Blend2dData"]["data"]["m_ChildPositionArray"]
                    for k, ci in enumerate(root["m_ChildIndices"]):
                        ch = nodes[ci]["data"]
                        e = {"clip": clips[ch["m_ClipID"]] if ch["m_ClipID"] < len(clips) else None}
                        if root["m_BlendType"] == 0 and k < len(th):
                            e["threshold"] = round(th[k], 4)
                        elif k < len(pos):
                            e["pos"] = [round(pos[k]["x"], 4), round(pos[k]["y"], 4)] if isinstance(pos[k], dict) else [round(x, 4) for x in pos[k]]
                        bt["children"].append(e)
                    st["blend"] = bt
                    st["clip"] = bt["children"][0]["clip"] if bt["children"] else None
            states[names[i]] = st
            for t in sd["m_TransitionConstantArray"]:
                trans.append(tr(names[i], t["data"]))
        for t in sm["m_AnyStateTransitionConstantArray"]:
            trans.append(tr("*", t["data"]))
        dflt = sm["m_DefaultState"]
        layers.append({"name": nm(ld["m_Binding"]), "default": names[dflt] if 0 <= dflt < len(names) else None,
                       "weight": round(ld["m_DefaultWeight"], 4), "states": states, "transitions": trans})
    return {"params": params, "layers": layers}


def main():
    roots, h2p = scene_paths()
    log(f"hash table: {len(h2p)} distinct paths from roots {', '.join(f'{k}({len(v)})' for k, v in roots.items())}")
    files = deps(CTRL_FILES)
    env = cns.env(*files)
    for o in env.objects:
        EXT[(o.assets_file.name, o.path_id)] = o
    log(f"files: {len(files)}")
    objs = sorted(EXT.values(), key=lambda o: (o.assets_file.name, o.path_id))
    ctrl_objs = [o for o in objs if o.type.name == "AnimatorController"]
    need = set()
    for o in ctrl_objs:
        for p in o.read_typetree()["m_AnimationClips"]:
            c = ptr_obj(o.assets_file, p)
            if c is not None:
                need.add((c.assets_file.name, c.path_id))
    clips, unresolved, ok, failed = {}, {}, 0, 0
    for fn, pid in sorted(need):
        o = EXT[(fn, pid)]
        nm = "?"
        try:
            d = o.read_typetree()
            nm = d["m_Name"]
            clip, st = export_clip(d, h2p, unresolved)
            key = f"{nm}@{fn}:{pid}"
            clips[key] = clip
            CLIPKEY[(fn, pid)] = key
            ok += 1
            log(f"ok     {key}  dur={clip['duration']} loop={clip['loop']} tracks={st['tracks']} const={st['const']} "
                f"unresolved={st['unresolved']} otherBindings={st['other_bindings']} keys={sum(len(t['times']) for t in clip['tracks'])}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            log(f"FAILED {nm}@{fn}:{pid}  {type(e).__name__}: {e}")
    ctrls = {}
    for o in ctrl_objs:
        d = o.read_typetree()
        val = export_controller(o.assets_file, d)
        val["ref"] = f"{o.assets_file.name}:{o.path_id}"
        k = d["m_Name"] if d["m_Name"] not in ctrls else val["ref"]
        ctrls[k] = val
        log(f"controller {k} ref={val['ref']} layers={len(val['layers'])} states={sum(len(l['states']) for l in val['layers'])} params={len(val['params'])}")
    ov = [o for o in objs if o.type.name == "AnimatorOverrideController"]
    log(f"override controllers in files: {len(ov)} (not exported)")
    log(f"clips: {ok} ok, {failed} failed, {len(need)} referenced")
    log(f"unresolved path hashes: {len(unresolved)}")
    for h, cn in sorted(unresolved.items()):
        log(f"  unresolved {h}: {', '.join(sorted(cn))}")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "clips.json"), "w") as f:
        json.dump({"clips": clips}, f, separators=(",", ":"))
    with open(os.path.join(OUT, "controllers.json"), "w") as f:
        json.dump(ctrls, f, separators=(",", ":"))
    for cname, c in ctrls.items():
        used = set()
        for l in c["layers"]:
            for s in l["states"].values():
                if s.get("clip"):
                    used.add(s["clip"])
                for ch in s.get("blend", {}).get("children", []):
                    if ch.get("clip"):
                        used.add(ch["clip"])
        for rname, tbl in roots.items():
            res = sum(1 for k in used for t in clips[k]["tracks"] if t["path"] in tbl)
            unres = sum(1 for k in used for t in clips[k]["tracks"] if t["path"] not in tbl)
            log(f"verify {cname} -> root {rname}: resolved {res}, unresolved {unres}")
        for ln, l in enumerate(c["layers"]):
            for sn, s in l["states"].items():
                ck = s.get("clip")
                log(f"state L{ln} {sn}: clip={ck.split('@')[0] if ck else None} dur={clips[ck]['duration'] if ck else None} "
                    f"loop={s['loop']} speed={s['speed']}{' BLEND' if 'blend' in s else ''}")
    with io.open(os.path.join(OUT, "export.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(LOG) + "\n")
    print("\n".join(l for l in LOG if not l.startswith("ok ")))
    for fn in ("clips.json", "controllers.json"):
        print(fn, "KB:", os.path.getsize(os.path.join(OUT, fn)) // 1024)


if __name__ == "__main__":
    main()
    import subprocess
    subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(os.path.abspath(__file__)), "split_clips.py")], check=True)
