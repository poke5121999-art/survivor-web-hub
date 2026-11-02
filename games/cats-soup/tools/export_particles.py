"""Export the Unity ParticleSystems of the main-forest facility prefabs (places/placeN) and lamp/lamp0.

usage: py -3.12 -I tools/export_particles.py [<resource path> ...]     (default: every prefab that has a "ps":1 node in
                                                                       art/places*/scene.json and art/lamp/scene.json)

Writes games/cats-soup/data/particles.json
  { "<prefab key>": { "<node path>": system, ... }, ... }
node path = node names from the prefab root joined by "/" ("d/pt_steam"); two nodes with the same path get "#2", "#3"
(the order of art/<id>/scene.json, which is also the order of export_prefabs.py's walk). The system also carries "idx",
the node's offset inside the prefab (scene.json index minus the root's index), so the view finds it without names.
and the textures the renderer materials use into art/particles/<name>-<md5>.webp.

Reads one asset file (plus the externals it names) at a time through D:/catsoup-ref/tools/cns.py, like export_prefabs.py.

Value formats (Unity ParticleSystem serialization, ParticleSystemRenderer, source of each field is the typetree):
  curve  = number                                    MinMaxCurve constant (state 0, "scalar")
         | {"r": [min, max]}                         two constants (state 3, "minScalar".."scalar")
         | {"c": [[t, v, inSlope, outSlope]..], "m": multiplier}               curve (state 1)
         | {"c": ..., "c2": ..., "m": multiplier}    random between two curves (state 2)
  color  = {"m": 0, "c": [r,g,b,a]} | {"m": 2, "c": min, "c2": max} | {"m": 1|3|4, "g": grad, "g2": grad}
  grad   = {"c": [[t, r, g, b]..], "a": [[t, a]..]}  (t 0..1)
Angles are in radians as Unity serializes the rotation modules; the view converts the sign for its handedness.
"""
import hashlib, json, math, os, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
import export_prefabs as ep  # noqa: E402
from PIL import Image  # noqa: E402

TEXDIR = os.path.join(GAME, "art", "particles")
MAXTEX = 256
STATES = ep.STATES
SHAPES = {0: "sphere", 1: "sphere", 2: "hemisphere", 3: "hemisphere", 4: "cone", 5: "box", 6: "mesh", 7: "cone",
          8: "cone", 9: "cone", 10: "circle", 11: "circle", 12: "edge", 13: "mesh", 14: "mesh", 15: "box",
          16: "box", 17: "donut", 18: "rect", 19: "mesh", 20: "mesh"}


def r4(x):
    if isinstance(x, float):
        if math.isinf(x):
            return 1e9 if x > 0 else -1e9
        return round(x, 5)
    return x


def keys(c):
    return [[r4(k["time"]), r4(k["value"]), r4(k["inSlope"]), r4(k["outSlope"])] for k in c["m_Curve"]]


def cur(v):
    st = v["minMaxState"]
    if st == 0:
        return r4(v["scalar"])
    if st == 3:
        return {"r": [r4(v["minScalar"]), r4(v["scalar"])]}
    if st == 1:
        return {"c": keys(v["maxCurve"]), "m": r4(v["scalar"])}
    return {"c": keys(v["minCurve"]), "c2": keys(v["maxCurve"]), "m": r4(v["scalar"])}


def col4(c):
    return [r4(c["r"]), r4(c["g"]), r4(c["b"]), r4(c["a"])]


def grad(g):
    nc, na = g["m_NumColorKeys"], g["m_NumAlphaKeys"]
    return {"c": [[round(g[f"ctime{i}"] / 65535, 5)] + [r4(g[f"key{i}"][ch]) for ch in "rgb"] for i in range(nc)],
            "a": [[round(g[f"atime{i}"] / 65535, 5), r4(g[f"key{i}"]["a"])] for i in range(na)]}


def color(v):
    st = v["minMaxState"]
    if st == 0:
        return {"m": 0, "c": col4(v["maxColor"])}
    if st == 2:
        return {"m": 2, "c": col4(v["minColor"]), "c2": col4(v["maxColor"])}
    o = {"m": st, "g": grad(v["maxGradient"])}
    if st == 3:
        o["g2"] = grad(v["minGradient"])
    return o


def vec(v):
    return [r4(v["x"]), r4(v["y"]), r4(v["z"])]


def save_tex(im, name):
    im = im.convert("RGBA")
    if im.getextrema()[3][0] >= 250:
        im = im.convert("RGB")
    if max(im.size) > MAXTEX:
        im.thumbnail((MAXTEX, MAXTEX), Image.LANCZOS)
    stem = f"{name}-{hashlib.md5(im.tobytes()).hexdigest()[:8]}".replace(" ", "_")
    p = os.path.join(TEXDIR, stem + ".webp")
    if not os.path.exists(p):
        im.save(p, "WEBP", lossless=True, method=6)
    return stem, list(im.size), im.mode == "RGBA"


def material(m, notes):
    sp = m.m_SavedProperties
    try:
        sh = m.m_Shader.read().m_ParsedForm.m_Name
    except Exception:
        sh = "?"
    out = {"name": m.m_Name, "shader": sh, "q": m.m_CustomRenderQueue}
    st = STATES.get(sh)
    if not st and sh.startswith("Mobile/Particles/"):
        # Unity built-in shaders have no entry in shaders/states.json: Additive = One One, Alpha Blended =
        # SrcAlpha OneMinusSrcAlpha, VertexLit Blended = One OneMinusSrcAlpha, Multiply = DstColor Zero (UnityEngine blend enums)
        pair = {"Additive": (5, 1), "Alpha Blended": (5, 10), "VertexLit Blended": (1, 10), "Multiply": (2, 0)}.get(sh.split("/")[-1])
        if pair:
            st = [{"src": pair[0], "dst": pair[1], "zwrite": 0.0, "cull": 0.0}]
    if st:
        p = st[0]
        out["blend"] = [p.get("src"), p.get("dst")]
        out["zwrite"] = p.get("zwrite")
        out["cull"] = p.get("cull")
    else:
        notes.add(f"no render state for shader {sh}")
    out["f"] = {k: r4(round(v, 4)) if math.isfinite(v) else (1e9 if v > 0 else -1e9 if v < 0 else 0) for k, v in sp.m_Floats}
    out["c"] = {k: [round(v.r, 4), round(v.g, 4), round(v.b, 4), round(v.a, 4)] for k, v in sp.m_Colors}
    tex = {}
    for k, t in sp.m_TexEnvs:
        if not t.m_Texture.m_PathID:
            continue
        try:
            tx = t.m_Texture.read()
            stem, size, alpha = save_tex(tx.image, tx.m_Name)
        except Exception as e:
            notes.add(f"texture {k} of {m.m_Name}: {e}")
            continue
        tex[k] = {"name": stem, "size": size, "alpha": alpha,
                  "scale": [round(t.m_Scale.x, 4), round(t.m_Scale.y, 4)], "offset": [round(t.m_Offset.x, 4), round(t.m_Offset.y, 4)]}
    out["tex"] = tex
    return out


def system(d, rend, notes):
    ini, shp, em = d["InitialModule"], d["ShapeModule"], d["EmissionModule"]
    s = {"main": {
        "duration": r4(d["lengthInSec"]), "loop": d["looping"], "prewarm": d["prewarm"], "delay": cur(d["startDelay"]),
        "simSpeed": r4(d["simulationSpeed"]), "space": d["moveWithTransform"], "scaling": d["scalingMode"],
        "life": cur(ini["startLifetime"]), "speed": cur(ini["startSpeed"]), "color": color(ini["startColor"]),
        "size": [cur(ini["startSize"])] + ([cur(ini["startSizeY"]), cur(ini["startSizeZ"])] if ini["size3D"] else []),
        "rot": cur(ini["startRotation"]), "rotRandomDir": r4(ini["randomizeRotationDirection"]),
        "gravity": cur(ini["gravityModifier"]), "max": ini["maxNumParticles"], "playOnAwake": d["playOnAwake"]}}
    if ini["rotation3D"]:
        s["main"]["rot3"] = [cur(ini["startRotationX"]), cur(ini["startRotationY"]), cur(ini["startRotation"])]
    s["emission"] = {"on": em["enabled"], "rate": cur(em["rateOverTime"]), "dist": cur(em["rateOverDistance"]),
                     "bursts": [{"t": r4(b["time"]), "n": cur(b["countCurve"]), "cycles": b["cycleCount"],
                                 "every": r4(b["repeatInterval"]), "p": r4(b["probability"])} for b in em["m_Bursts"]]}
    if shp["enabled"]:
        s["shape"] = {"type": shp["type"], "kind": SHAPES.get(shp["type"], "?"), "angle": r4(shp["angle"]),
                      "length": r4(shp["length"]), "radius": r4(shp["radius"]["value"]), "arc": r4(shp["arc"]["value"]),
                      "arcMode": shp["arc"]["mode"], "box": vec(shp["boxThickness"]), "radiusThickness": r4(shp["radiusThickness"]),
                      "pos": vec(shp["m_Position"]), "rot": vec(shp["m_Rotation"]), "scale": vec(shp["m_Scale"]),
                      "randomDir": r4(shp["randomDirectionAmount"]), "sphericalDir": r4(shp["sphericalDirectionAmount"]),
                      "randomPos": r4(shp["randomPositionAmount"]), "align": shp["alignToDirection"]}
    mod = d["VelocityModule"]
    if mod["enabled"]:
        s["velocity"] = {"x": cur(mod["x"]), "y": cur(mod["y"]), "z": cur(mod["z"]), "radial": cur(mod["radial"]),
                         "orbital": [cur(mod["orbitalX"]), cur(mod["orbitalY"]), cur(mod["orbitalZ"])],
                         "speedMod": cur(mod["speedModifier"]), "world": mod["inWorldSpace"]}
    mod = d["ForceModule"]
    if mod["enabled"]:
        s["force"] = {"x": cur(mod["x"]), "y": cur(mod["y"]), "z": cur(mod["z"]), "world": mod["inWorldSpace"]}
    mod = d["SizeModule"]
    if mod["enabled"]:
        s["sizeOL"] = {"x": cur(mod["curve"]), "sep": mod["separateAxes"]}
        if mod["separateAxes"]:
            s["sizeOL"].update(y=cur(mod["y"]), z=cur(mod["z"]))
    mod = d["RotationModule"]
    if mod["enabled"]:
        s["rotOL"] = cur(mod["curve"])
    mod = d["ColorModule"]
    if mod["enabled"]:
        s["colorOL"] = color(mod["gradient"])
    mod = d["UVModule"]
    if mod["enabled"]:
        s["sheet"] = {"mode": mod["mode"], "timeMode": mod["timeMode"], "fps": r4(mod["fps"]), "frame": cur(mod["frameOverTime"]),
                      "start": cur(mod["startFrame"]), "x": mod["tilesX"], "y": mod["tilesY"], "anim": mod["animationType"],
                      "row": mod["rowIndex"], "rowMode": mod["rowMode"], "cycles": r4(mod["cycles"]),
                      "flipU": r4(mod["flipU"]), "flipV": r4(mod["flipV"])}
    mod = d["NoiseModule"]
    if mod["enabled"]:
        s["noise"] = {"strength": cur(mod["strength"]), "frequency": r4(mod["frequency"]), "scroll": cur(mod["scrollSpeed"]),
                      "position": cur(mod["positionAmount"])}
    for k in ("CollisionModule", "SubModule", "TrailModule", "LightsModule", "InheritVelocityModule", "ClampVelocityModule",
              "SizeBySpeedModule", "RotationBySpeedModule", "ColorBySpeedModule", "ExternalForcesModule", "LifetimeByEmitterSpeedModule"):
        if d[k]["enabled"]:
            notes.add(f"unsupported module {k}")
    r = {"mode": rend.m_RenderMode, "order": rend.m_SortingOrder, "fudge": r4(rend.m_SortingFudge),
         "layer": rend.m_SortingLayerID, "minSize": r4(rend.m_MinParticleSize), "maxSize": r4(rend.m_MaxParticleSize),
         "align": rend.m_RenderAlignment, "velScale": r4(rend.m_VelocityScale), "lenScale": r4(rend.m_LengthScale),
         "enabled": bool(rend.m_Enabled)}
    if rend.m_RenderMode == 4:
        try:
            me = rend.m_Mesh.read() if rend.m_Mesh.m_PathID else None
            if me is None:
                raise ValueError("no mesh")
            r["mesh"] = {"name": me.m_Name, "verts": me.m_VertexCount if hasattr(me, "m_VertexCount") else None}
        except Exception as e:
            notes.add(f"mesh: {e}")
    mats = []
    for p in rend.m_Materials:
        if p.m_PathID:
            try:
                mats.append(material(p.read(), notes))
            except Exception as e:
                notes.add(f"material: {e}")
    r["materials"] = mats
    s["renderer"] = r
    return s


def prefab(key, f, pid, out, notes):
    files = ep.deps([f])
    env = cns.env(*files)
    tr = ep.Tree(env, f)
    g = tr.owner.get(pid, pid)
    while tr.parent.get(g):
        g = tr.parent[g]
    nodes = []
    tr.walk(g, nodes)
    names = []
    for k, (_, gid) in enumerate(nodes):
        names.append(tr.T(gid)["m_Name"])
    paths = []
    for k, (_, gid) in enumerate(nodes):
        p = tr.parent.get(gid)
        pi = next((i for i, (_, x) in enumerate(nodes) if x == p), -1) if k else -1
        paths.append(names[k] if pi < 0 else paths[pi] + "/" + names[k])
    seen, res = {}, {}
    for k, (_, gid) in enumerate(nodes):
        ps = rend = None
        for c in tr.T(gid)["m_Component"]:
            cid = c["component"]["m_PathID"]
            o = tr.objs.get(cid)
            if o is None:
                continue
            if o.type.name == "ParticleSystem":
                ps = o
            elif o.type.name == "ParticleSystemRenderer":
                rend = o
        if ps is None:
            continue
        path = paths[k]
        seen[path] = seen.get(path, 0) + 1
        if seen[path] > 1:
            path += f"#{seen[path]}"
        if rend is None:
            notes.add(f"{key}/{path}: no renderer")
            continue
        n = set()
        sysd = system(ps.read_typetree(), rend.read(), n)
        sysd["idx"] = k
        sysd["name"] = names[k]
        for x in n:
            notes.add(f"{key}/{path}: {x}")
        res[path] = sysd
    if res:
        out[key] = res


def main():
    os.makedirs(TEXDIR, exist_ok=True)
    keys_ = sys.argv[1:]
    if not keys_:
        for sub in sorted(os.listdir(os.path.join(GAME, "art"))):
            sc = os.path.join(GAME, "art", sub, "scene.json")
            if not (sub.startswith("places") or sub == "lamp") or not os.path.exists(sc):
                continue
            d = json.load(open(sc))
            ns, rs = d["nodes"], d["roots"]
            for i, r in enumerate(rs):
                end = rs[i + 1]["node"] if i + 1 < len(rs) else len(ns)
                if any(n.get("ps") for n in ns[r["node"]:end]) and (sub != "lamp" or r["key"] == "lamp/lamp0"):
                    keys_.append(r["key"])
    res = {k: (f, p) for k, f, p in json.load(open(os.path.join(cns.ROOT, "resources.json")))[::-1]}
    out, notes = {}, set()
    for i, key in enumerate(keys_):
        f, p = res[key]
        prefab(key, f, p, out, notes)
        if i % 10 == 0:
            print(i, len(keys_), key, flush=True)
    path = os.path.join(GAME, "data", "particles.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    n = sum(len(v) for v in out.values())
    print(f"{len(out)} prefabs, {n} systems -> {path}")
    for x in sorted(notes):
        print("note:", x)


if __name__ == "__main__":
    main()
