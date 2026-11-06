"""Export Lumber Inc AnimationClips + RoleAnimSO assets as JSON for the three.js build (port of casual-farm export_anim.py).

Usage: cd games/lumber-inc/tools && PYTHONIOENCODING=utf-8 py -3.12 export_anim.py

Writes games/lumber-inc/art/
  anim/clips.json        {"clips": {"<key>": {name, duration, loop, tracks:[{path, bone, prop, times, values}]}}}
                         key = clip name, or "<name>@<file>:<pathId>" when two clips share a name.
  anim/roles.json        {"<RoleAnimSO name>": {idle:[key], walk, run, ridingIdle, riding, ridingSkin:[], ridingSkinIdle:[], rest:[],
                          chopWood|chopRock|chopDrill|chopSaw: {clip, speed, fade, start, events:[normalized times]}}}
  chars/roles-of.json    {"<prefab name>": "<RoleAnimSO name>"}  (the SO the enabled role component of the prefab points at)
  anim/export.log
Clips come from the bundles characters-*, buildings-factory-animations, vehicles-truck, maps-box.
Hash -> path and coordinates: as casual-farm export_anim.py (path relative to the Animator GameObject, pos (x,y,-z),
quat (-x,-y,z,w)).
RoleAnimSO is read by hand: Animancer's ClipTransition serializes events differently from the IL2CPP type tree, so
lm.read() overruns. Layout (the parser asserts it consumes the whole object):
  header(GO PPtr, enabled+pad, script PPtr, name) | idle[], walk, run, ridingIdle, riding, ridingSkin[], ridingSkinIdle[], rest[]
  | ClipTransition x4 = fade f32, _NormalizedTimes[n f32], callbacks[n=0], _Names[n strings], _Clip PPtr, speed f32, startTime f32.
"""
import io, json, math, os, struct, sys, zlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lm as mm  # noqa: E402

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "anim")
LOG = []
EPS = {"position": 5e-4, "quaternion": 5e-4, "scale": 5e-4}
BUNDLES = ("characters-", "buildings-factory-animations", "vehicles-truck", "maps-box")

ENV = None
FILES = {}
EXT = {}
CLIPKEY = {}


def log(s):
    LOG.append(s)


def stem(fn):
    return fn[:-7] if fn.endswith(".assets") else fn


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


def hermite(keys, comp, ts):
    """Unity AnimationCurve (cubic Hermite, infinite slope = stepped) sampled at ts; clamped outside the key range."""
    kt = np.array([k["time"] for k in keys])
    out = np.empty(len(ts))
    for n, t in enumerate(ts):
        i = int(np.searchsorted(kt, t, side="right")) - 1
        if i < 0:
            out[n] = comp(keys[0], "value")
        elif i >= len(keys) - 1:
            out[n] = comp(keys[-1], "value")
        else:
            a, b = keys[i], keys[i + 1]
            dt = b["time"] - a["time"]
            m0, m1 = comp(a, "outSlope"), comp(b, "inSlope")
            y0, y1 = comp(a, "value"), comp(b, "value")
            if not (math.isfinite(m0) and math.isfinite(m1)) or abs(m0) > 1e8 or abs(m1) > 1e8:
                out[n] = y0
                continue
            s = (t - a["time"]) / dt
            s2, s3 = s * s, s * s * s
            out[n] = (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * dt * m1
    return out


def export_legacy(d):
    """Legacy (Animation component) clip: curves carry the path string directly (m_RotationCurves are quaternions)."""
    ends = [k["time"] for g in ("m_RotationCurves", "m_PositionCurves", "m_ScaleCurves", "m_EulerCurves") for c in d[g]
            for k in c["curve"]["m_Curve"]]
    dur = max(ends) if ends else 0.0
    sr = d["m_SampleRate"] or 30.0
    n = max(2, int(round(dur * sr)) + 1)
    ts = np.linspace(0, dur, n)
    tracks, nconst = [], 0
    for grp, prop in (("m_PositionCurves", "position"), ("m_RotationCurves", "quaternion"), ("m_EulerCurves", "euler"),
                      ("m_ScaleCurves", "scale")):
        for c in d[grp]:
            keys = c["curve"]["m_Curve"]
            w = 4 if prop == "quaternion" else 3
            v = np.stack([hermite(keys, lambda k, f, ax=ax: (k[f][ax] if isinstance(k[f], dict) else k[f][ax]), ts)
                          for ax in "xyzw"[:w]], 1) if True else None
            if prop == "position":
                v = np.stack([v[:, 0], v[:, 1], -v[:, 2]], 1)
            elif prop in ("quaternion", "euler"):
                q = v if prop == "quaternion" else np.array([euler_to_q(e) for e in v])
                q = np.stack([-q[:, 0], -q[:, 1], q[:, 2], q[:, 3]], 1)
                q = q / np.linalg.norm(q, axis=1, keepdims=True)
                for i in range(1, len(q)):
                    if np.dot(q[i], q[i - 1]) < 0:
                        q[i] = -q[i]
                v, prop2 = q, "quaternion"
            p2 = "quaternion" if prop in ("quaternion", "euler") else prop
            if np.abs(v - v[0]).max() < 1e-5:
                nconst += 1
                tt, vv = ts[:1], v[:1]
            else:
                keep = reduce_keys(ts, v, EPS[p2], p2 == "quaternion")
                tt, vv = ts[keep], v[keep]
            tracks.append({"path": c["path"], "bone": c["path"].split("/")[-1], "prop": p2,
                           "times": rnd(tt, 4), "values": rnd(vv, 5)})
    loop = d["m_WrapMode"] in (2, 4)
    return ({"name": d["m_Name"], "duration": round(dur, 4), "loop": loop, "legacy": True, "tracks": tracks},
            dict(tracks=len(tracks), const=nconst, unresolved=0, other_bindings=0))


def export_clip(d, h2p, unresolved):
    if d["m_Legacy"]:
        return export_legacy(d)
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



# ---------------- RoleAnimSO ----------------
class Raw:
    def __init__(self, b):
        self.b, self.p = b, 0

    def i32(self):
        v, = struct.unpack_from("<i", self.b, self.p)
        self.p += 4
        return v

    def f32(self):
        v, = struct.unpack_from("<f", self.b, self.p)
        self.p += 4
        return v

    def pptr(self):
        f, i = struct.unpack_from("<iq", self.b, self.p)
        self.p += 12
        return f, i

    def string(self):
        n = self.i32()
        s = self.b[self.p:self.p + n].decode("utf-8")
        self.p += (n + 3) & ~3
        return s


def clip_by_pptr(sf, fid, pid):
    if not pid:
        return None
    name = sf.name if fid == 0 else mm.ext_names(sf)[fid - 1]
    o = EXT.get((name, pid))
    return CLIPKEY.get((o.assets_file.name, o.path_id)) if o is not None and o.type.name == "AnimationClip" else None


def fin(v, dflt):
    return round(v, 4) if math.isfinite(v) else dflt


def parse_so(o):
    sf, r = o.assets_file, Raw(o.get_raw_data())
    r.p = 12 + 4 + 12
    name = r.string()

    def lst():
        return [clip_by_pptr(sf, *r.pptr()) for _ in range(r.i32())]
    d = {"idle": lst()}
    for k in ("walk", "run", "ridingIdle", "riding"):
        d[k] = clip_by_pptr(sf, *r.pptr())
    d["ridingSkin"], d["ridingSkinIdle"], d["rest"] = lst(), lst(), lst()
    for k in ("chopWood", "chopRock", "chopDrill", "chopSaw"):
        fade = r.f32()
        times = [r.f32() for _ in range(r.i32())]
        n = r.i32()
        if n:
            raise ValueError(f"{name}.{k}: {n} UnityEvent callbacks, layout unknown")
        names = [r.string() for _ in range(r.i32())]
        clip = clip_by_pptr(sf, *r.pptr())
        speed, start = r.f32(), r.f32()
        d[k] = {"clip": clip, "speed": fin(speed, 1), "fade": fin(fade, 0.25), "start": fin(start, 0),
                "events": [round(t, 4) for t in times if math.isfinite(t)], "names": names}
    if r.p != len(r.b):
        raise ValueError(f"{name}: parsed {r.p} of {len(r.b)} bytes")
    return name, d


def subtree(sf, go_pid, acc):
    acc.add(go_pid)
    for c in sf.objects[go_pid].read_typetree()["m_Component"]:
        o = sf.objects.get(c["component"]["m_PathID"])
        if o is not None and o.type.name in ("Transform", "RectTransform"):
            for ch in o.read_typetree()["m_Children"]:
                if ch["m_PathID"] in sf.objects:
                    subtree(sf, sf.objects[ch["m_PathID"]].read_typetree()["m_GameObject"]["m_PathID"], acc)
    return acc


def main():
    global ENV
    ENV = mm.load()
    for o in ENV.objects:
        sf = o.assets_file
        FILES.setdefault(sf.name, sf)
        EXT[(sf.name, o.path_id)] = o
    h2p = build_hashes()

    def wanted(o):
        return any(mm._bundle_of.get(o.assets_file.name, "").startswith(p) for p in BUNDLES)
    clip_objs = sorted((o for o in EXT.values() if o.type.name == "AnimationClip" and wanted(o)),
                       key=lambda o: (o.assets_file.name, o.path_id))
    names = {}
    for o in clip_objs:
        names.setdefault(o.read_typetree()["m_Name"], []).append(o)
    clips, unresolved, ok, failed = {}, {}, 0, 0
    for o in clip_objs:
        fn = o.assets_file.name
        nm = "?"
        try:
            d = o.read_typetree()
            nm = d["m_Name"]
            clip, st = export_clip(d, h2p, unresolved)
            key = nm if len(names[nm]) == 1 else f"{nm}@{stem(fn)}:{o.path_id}"
            clips[key] = clip
            CLIPKEY[(fn, o.path_id)] = key
            ok += 1
            log(f"ok     {key}  dur={clip['duration']} loop={clip['loop']} tracks={st['tracks']} const={st['const']} "
                f"unresolved={st['unresolved']} otherBindings={st['other_bindings']} keys={sum(len(t['times']) for t in clip['tracks'])}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            log(f"FAILED {nm}@{stem(fn)}:{o.path_id}  {type(e).__name__}: {e}")

    # RoleAnimSO assets
    roles, so_name = {}, {}
    pre = "assets/resaddressable/foldermode/characters/animations/scriptobject/"
    mm.asset("x")
    for p, (fn, pid) in sorted(mm._container.items()):
        if p.startswith(pre) and p.endswith(".asset"):
            try:
                name, d = parse_so(EXT[(fn, pid)])
                roles[name] = d
                so_name[(fn, pid)] = name
                missing = [k for k, v in d.items() if v is None or (isinstance(v, dict) and v["clip"] is None)]
                log(f"role   {name} idle={len(d['idle'])} rest={len(d['rest'])} unresolved/empty={missing}")
            except Exception as e:  # noqa: BLE001
                log(f"role FAILED {p}: {type(e).__name__}: {e}")

    # prefab -> SO (enabled role component inside the prefab's own GameObject subtree)
    roles_of = {}
    cpre = "assets/resaddressable/foldermode/characters/prefabs/settled/"
    for p, (fn, pid) in sorted(mm._container.items()):
        if not (p.startswith(cpre) and p.endswith(".prefab")) or EXT[(fn, pid)].type.name != "GameObject":
            continue
        sf = FILES[fn]
        gos = subtree(sf, pid, set())
        found = {}
        for o in sf.objects.values():
            if o.type.name != "MonoBehaviour":
                continue
            try:
                if o.read_typetree()["m_GameObject"]["m_PathID"] not in gos:
                    continue
                d = mm.read(o)
            except Exception:  # noqa: BLE001
                continue
            a = d.get("m_AnimSO")
            if a and a["m_PathID"]:
                nm = so_name.get((mm.ext_names(sf)[a["m_FileID"] - 1] if a["m_FileID"] else fn, a["m_PathID"]))
                found.setdefault(nm, []).append((mm.script(o)[1].split(".")[-1], bool(d.get("m_Enabled", 1))))
        pname = EXT[(fn, pid)].read_typetree()["m_Name"]
        log(f"prefab {pname}: {found}")
        en = [n for n, cs in found.items() if any(e for _, e in cs)]
        if en:
            roles_of[pname] = en[0]
    log(f"clips: {ok} ok, {failed} failed, {len(clip_objs)} total; roles {len(roles)}; roles_of {len(roles_of)}")
    log(f"unresolved path hashes: {len(unresolved)}")
    for h, cn in sorted(unresolved.items()):
        log(f"  unresolved {h}: {', '.join(sorted(cn))}")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(GAME, "art", "chars"), exist_ok=True)
    with open(os.path.join(OUT, "clips.json"), "w") as f:
        json.dump({"clips": clips}, f, separators=(",", ":"))
    with open(os.path.join(OUT, "roles.json"), "w") as f:
        json.dump(roles, f, indent=1)
    with open(os.path.join(GAME, "art", "chars", "roles-of.json"), "w") as f:
        json.dump(roles_of, f, indent=1)
    with io.open(os.path.join(OUT, "export.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(LOG) + "\n")
    print("\n".join(l for l in LOG if not l.startswith("ok ")))
    print("clips.json KB:", os.path.getsize(os.path.join(OUT, "clips.json")) // 1024)


if __name__ == "__main__":
    main()
