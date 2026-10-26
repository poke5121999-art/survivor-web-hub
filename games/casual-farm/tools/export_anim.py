"""Export My Mini Mart AnimationClips + AnimatorControllers as JSON for the three.js build.

Usage: cd games/casual-farm/tools && PYTHONIOENCODING=utf-8 py -3.12 export_anim.py

Writes games/casual-farm/art/anim/
  clips.json        {"clips": {"<name>@<file>:<pathId>": {name, duration, loop, tracks:[{path, bone, prop, times, values}]}}}
  controllers.json  {"<controller>": {params, layers:[{name, default, states, transitions}]}}
  export.log        one line per clip (ok/failed, track counts) + unresolved path hashes

Generic bindings name bones by CRC32 of the path relative to the Animator's GameObject. The hash -> path table is built
from every Animator in every serialized file (store scene "level1" and all *.assets): each Animator GameObject's
descendants give "A/B/C" paths, crc32(utf-8 path). Hash 0 is the Animator's own GameObject (path "", bone "").

Coordinates (Unity left-handed -> three.js right-handed, converted once here): position (x,y,z) -> (x,y,-z),
quaternion (x,y,z,w) -> (-x,-y,z,w), scale unchanged. Euler curves (Unity order ZXY, degrees) become quaternions first.
Tracks are sampled at the clip sample rate, then reduced (keys that linear interpolation reproduces are dropped).
A track whose value never changes is kept as ONE key (times [0]) so a blend away from a clip that posed that bone
still works; the count is logged per clip.
Only Transform bindings (position/rotation/euler/scale) are exported; other bindings (floats, RectTransform) are counted
and logged.
"""
import io, json, math, os, struct, sys, zlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "anim")
LOG = []
EPS = {"position": 5e-4, "quaternion": 5e-4, "scale": 5e-4}
COND = {1: "if", 2: "ifnot", 3: "greater", 4: "less", 6: "equals", 7: "notequals"}
PTYPE = {1: "float", 3: "int", 4: "bool", 9: "trigger"}

ENV = None
FILES = {}
EXT = {}
CLIPKEY = {}


def log(s):
    LOG.append(s)


def stem(fn):
    return fn[:-7] if fn.endswith(".assets") else fn


def ptr_obj(sf, p):
    """PPtr dict -> object (or None); externals resolved by file name."""
    if not p or not p["m_PathID"]:
        return None
    if p["m_FileID"] == 0:
        return sf.objects.get(p["m_PathID"])
    return EXT.get((mm.ext_names(sf)[p["m_FileID"] - 1], p["m_PathID"]))


# ---------------- hash -> path ----------------
_names = {}


def transform_of(sf, go):
    for c in go.read_typetree()["m_Component"]:
        cp = c["component"]
        o = sf.objects.get(cp["m_PathID"]) if cp["m_FileID"] == 0 else None
        if o is not None and o.type.name in ("Transform", "RectTransform"):
            return o
    raise ValueError("GameObject has no Transform")


def go_name(sf, tr):
    k = (sf.name, tr.path_id)
    if k not in _names:
        _names[k] = sf.objects[tr.read_typetree()["m_GameObject"]["m_PathID"]].read_typetree()["m_Name"]
    return _names[k]


def walk(sf, tr, path, h2p):
    h2p.setdefault(zlib.crc32(path.encode("utf-8")) & 0xFFFFFFFF, path)
    for ch in tr.read_typetree()["m_Children"]:
        if ch["m_FileID"] != 0 or ch["m_PathID"] not in sf.objects:
            continue
        c = sf.objects[ch["m_PathID"]]
        nm = go_name(sf, c)
        walk(sf, c, nm if not path else path + "/" + nm, h2p)


def build_hashes():
    h2p, n_anim = {}, 0
    for fn, sf in FILES.items():
        for o in sf.objects.values():
            if o.type.name != "Animator":
                continue
            n_anim += 1
            try:
                go = sf.objects[o.read_typetree()["m_GameObject"]["m_PathID"]]
                walk(sf, transform_of(sf, go), "", h2p)
            except Exception as e:  # noqa: BLE001
                log(f"hash table: Animator {fn}:{o.path_id} skipped ({e})")
    log(f"hash table: {n_anim} Animators, {len(h2p)} distinct paths")
    return h2p


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
    return mul(mul(qy, qx), qz)   # Unity applies Z, then X, then Y


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
            tt, v = tt[:1], v[:1]
        else:
            keep = reduce_keys(tt, v, EPS[prop], prop == "quaternion")
            tt, v = tt[keep], v[keep]
        tracks.append({"path": path, "bone": path.split("/")[-1], "prop": prop,
                       "times": rnd(tt, 4), "values": rnd(v, 5)})
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
    global ENV
    ENV = mm.load()
    for o in ENV.objects:
        sf = o.assets_file
        FILES.setdefault(sf.name, sf)
        EXT[(sf.name, o.path_id)] = o
    log("files: " + ", ".join(sorted(FILES)))
    h2p = build_hashes()

    clip_objs = sorted((o for o in EXT.values() if o.type.name == "AnimationClip"), key=lambda o: (o.assets_file.name, o.path_id))
    clips, unresolved, ok, failed = {}, {}, 0, 0
    for o in clip_objs:
        fn = o.assets_file.name
        nm = "?"
        try:
            d = o.read_typetree()
            nm = d["m_Name"]
            clip, st = export_clip(d, h2p, unresolved)
            key = f"{nm}@{stem(fn)}:{o.path_id}"
            clips[key] = clip
            CLIPKEY[(fn, o.path_id)] = key
            ok += 1
            log(f"ok     {key}  dur={clip['duration']} loop={clip['loop']} tracks={st['tracks']} const={st['const']} "
                f"unresolved={st['unresolved']} otherBindings={st['other_bindings']} keys={sum(len(t['times']) for t in clip['tracks'])}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            log(f"FAILED {nm}@{stem(fn)}:{o.path_id}  {type(e).__name__}: {e}")

    ctrls, ctrl_by_obj = {}, {}

    def put(name, fn, pid, val):
        k = name if name not in ctrls else f"{name}@{stem(fn)}:{pid}"
        val["ref"] = f"{fn}:{pid}"
        ctrls[k] = val
        return k
    objs = sorted(EXT.values(), key=lambda o: (o.assets_file.name, o.path_id))
    for o in (o for o in objs if o.type.name == "AnimatorController"):
        try:
            d = o.read_typetree()
            k = put(d["m_Name"], o.assets_file.name, o.path_id, export_controller(o.assets_file, d))
            ctrl_by_obj[(o.assets_file.name, o.path_id)] = k
            log(f"controller ok  {k} ({stem(o.assets_file.name)}:{o.path_id}) layers={len(ctrls[k]['layers'])} "
                f"states={sum(len(l['states']) for l in ctrls[k]['layers'])} params={len(ctrls[k]['params'])}")
        except Exception as e:  # noqa: BLE001
            log(f"controller FAILED {stem(o.assets_file.name)}:{o.path_id}  {type(e).__name__}: {e}")
    for o in (o for o in objs if o.type.name == "AnimatorOverrideController"):
        try:
            d = o.read_typetree()
            sf = o.assets_file
            base = ptr_obj(sf, d["m_Controller"])
            if base is None:
                raise ValueError("base controller not found")
            remap = {}
            for pr in d["m_Clips"]:
                a, b = clip_key(sf, pr["m_OriginalClip"]), clip_key(sf, pr["m_OverrideClip"])
                if a and b:
                    remap[a] = b
            val = export_controller(base.assets_file, base.read_typetree(), remap)
            val["base"] = ctrl_by_obj.get((base.assets_file.name, base.path_id))
            k = put(d["m_Name"], sf.name, o.path_id, val)
            log(f"override ok    {k} ({stem(sf.name)}:{o.path_id}) base={val['base']} remapped={len(remap)}")
        except Exception as e:  # noqa: BLE001
            log(f"override FAILED {stem(o.assets_file.name)}:{o.path_id}  {type(e).__name__}: {e}")

    log(f"clips: {ok} ok, {failed} failed, {len(clip_objs)} total")
    log(f"unresolved path hashes: {len(unresolved)}")
    for h, cn in sorted(unresolved.items()):
        log(f"  unresolved {h}: {', '.join(sorted(cn))}")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "clips.json"), "w") as f:
        json.dump({"clips": clips}, f, separators=(",", ":"))
    with open(os.path.join(OUT, "controllers.json"), "w") as f:
        json.dump(ctrls, f, separators=(",", ":"))
    with io.open(os.path.join(OUT, "export.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(LOG) + "\n")
    print("\n".join(l for l in LOG if not l.startswith("ok ")))
    print("clips.json KB:", os.path.getsize(os.path.join(OUT, "clips.json")) // 1024)


if __name__ == "__main__":
    main()
