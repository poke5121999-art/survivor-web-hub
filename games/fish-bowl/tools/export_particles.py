"""Export every Unity ParticleSystem of Aquarium Land to games/fish-bowl/data/particles.json (read by js/particles.js).

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_particles.py

Loads only level2, level4, sharedassets2.assets and sharedassets4.assets (see fl.py: loading every file costs ~16 GB).
Keys: "<scene>:<GameObject path>" for scene systems (scene = env for level2, player for level4: the art/<id> names, path
joined from the root like world.js pathOf), "prefab:<file>:<root GameObject path id>[/<child path>]" for prefab systems
(the id in FeedFish.crunchParticle etc. is a root path id; children carry "xf" = local transform relative to the root).

Curve = number (constant) | [min, max] (random between) | {"c": [8 samples], "c2": [8 samples]?} (value over normalised time;
c2 = second curve, per-particle lerp between c and c2). Colour = [r, g, b, a] | {"g": [8 x rgba]} over normalised time.
All vectors are already in three.js axes except shape/velocity data, which stay in Unity local axes: the runtime mirrors z
(Unity left-handed -> three right-handed) once, when it writes particle positions.
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fl  # noqa: E402
import export_scene as xs  # noqa: E402

GAME = xs.GAME
N = 8


def r4(x):
    return round(float(x), 4)


def hermite(keys, t):
    if not keys:
        return 0.0
    if t <= keys[0]["time"]:
        return keys[0]["value"]
    if t >= keys[-1]["time"]:
        return keys[-1]["value"]
    for a, b in zip(keys, keys[1:]):
        if a["time"] <= t <= b["time"]:
            dt = b["time"] - a["time"]
            if dt <= 0:
                return b["value"]
            s = (t - a["time"]) / dt
            ma, mb = a["outSlope"], b["inSlope"]
            if math.isinf(ma) or math.isinf(mb):
                return a["value"]
            s2, s3 = s * s, s * s * s
            return ((2 * s3 - 3 * s2 + 1) * a["value"] + (s3 - 2 * s2 + s) * ma * dt
                    + (-2 * s3 + 3 * s2) * b["value"] + (s3 - s2) * mb * dt)
    return keys[-1]["value"]


def samples(curve, mul, n=N):
    keys = curve["m_Curve"]
    return [r4(hermite(keys, i / (n - 1)) * mul) for i in range(n)]


def mm(c, n=N):
    """MinMaxCurve -> const | [min, max] | {"c": samples, "c2": samples}."""
    st, sc = c["minMaxState"], c["scalar"]
    if st == 0:
        return r4(sc)
    if st == 3:
        lo, hi = r4(c["minScalar"]), r4(sc)
        return lo if lo == hi else [lo, hi]
    a = samples(c["maxCurve"], sc, n)
    if st == 1:
        return a[0] if len(set(a)) == 1 else {"c": a}
    b = samples(c["minCurve"], sc, n)
    if a == b:
        return {"c": a}
    return {"c": b, "c2": a}


def grad_at(g, t):
    nc, na = g["m_NumColorKeys"], g["m_NumAlphaKeys"]
    ck = [(g[f"ctime{i}"] / 65535.0, g[f"key{i}"]) for i in range(max(nc, 1))]
    ak = [(g[f"atime{i}"] / 65535.0, g[f"key{i}"]["a"]) for i in range(max(na, 1))]

    def lerp(keys, t, f):
        if t <= keys[0][0]:
            return f(keys[0][1], keys[0][1], 0)
        for (ta, va), (tb, vb) in zip(keys, keys[1:]):
            if t <= tb:
                s = 0 if tb == ta else (t - ta) / (tb - ta)
                if g["m_Mode"] == 1:
                    s = 0
                return f(va, vb, s)
        return f(keys[-1][1], keys[-1][1], 0)
    c = lerp(ck, t, lambda a, b, s: [a[k] + (b[k] - a[k]) * s for k in "rgb"])
    a = lerp(ak, t, lambda a, b, s: a + (b - a) * s)
    return c + [a]


def grad_samples(g, n=N):
    return [[r4(x) for x in grad_at(g, i / (n - 1))] for i in range(n)]


def col(c, over_life=False):
    """MinMaxGradient. Start colour: {"a": rgba, "b": rgba?} (random lerp) | {"g": samples, "g2": samples?} | {"r": samples}
    (random pick along the gradient). Over lifetime: {"g": samples}."""
    st = c["minMaxState"]
    rgba = lambda k: [r4(c[k][x]) for x in "rgba"]
    if st == 0:
        return {"g": [rgba("maxColor")]}  if over_life else {"a": rgba("maxColor")}
    if st == 2:
        a, b = rgba("maxColor"), rgba("minColor")
        if over_life:
            return {"g": [[r4((x + y) / 2) for x, y in zip(a, b)]]}
        return {"a": a, "b": b}
    g = grad_samples(c["maxGradient"])
    if st == 1:
        return {"g": g}
    g2 = grad_samples(c["minGradient"])
    if over_life:
        return {"g": [[r4((x + y) / 2) for x, y in zip(p, q)] for p, q in zip(g, g2)]}
    return {"g": g, "g2": g2} if st == 3 else {"r": g}


def is_default(v, d=0):
    return v == d


def euler_deg(v):
    return [r4(v["x"]), r4(v["y"]), r4(v["z"])]


def system(d, rd, texfn, matfn):
    ini = d["InitialModule"]
    e = {"dur": r4(d["lengthInSec"]), "loop": bool(d["looping"]), "pre": bool(d["prewarm"]),
         "awake": bool(d["playOnAwake"]), "space": d["moveWithTransform"], "sm": d["scalingMode"],
         "life": mm(ini["startLifetime"]), "speed": mm(ini["startSpeed"]), "size": mm(ini["startSize"]),
         "color": col(ini["startColor"]), "max": ini["maxNumParticles"]}
    if d["simulationSpeed"] != 1:
        e["simspd"] = r4(d["simulationSpeed"])
    dl = mm(d["startDelay"])
    if dl != 0:
        e["delay"] = dl
    rot = mm(ini["startRotation"])
    if rot != 0:
        e["rot"] = rot
    g = mm(ini["gravityModifier"])
    if g != 0:
        e["grav"] = g
    em = d["EmissionModule"]
    if em["enabled"]:
        e["rate"] = mm(em["rateOverTime"])
        if em["rateOverDistance"]["scalar"]:
            e["rateDist"] = mm(em["rateOverDistance"])
        bursts = []
        for b in em["m_Bursts"][:em["m_BurstCount"]]:
            cc = mm(b["countCurve"])
            bursts.append([r4(b["time"]), cc, b["cycleCount"], r4(b["repeatInterval"]), r4(b["probability"])])
        if bursts:
            e["bursts"] = bursts
    else:
        e["rate"] = 0
    sh = d["ShapeModule"]
    if sh["enabled"]:
        s = {"t": sh["type"], "r": r4(sh["radius"]["value"]), "ang": r4(sh["angle"]), "arc": r4(sh["arc"]["value"]),
             "len": r4(sh["length"]), "thick": r4(sh["radiusThickness"])}
        if sh["type"] in (5, 15, 16):
            s["box"] = [r4(sh["m_Scale"]["x"]), r4(sh["m_Scale"]["y"]), r4(sh["m_Scale"]["z"])]
        else:
            if tuple(sh["m_Scale"].values()) != (1.0, 1.0, 1.0):
                s["scl"] = [r4(sh["m_Scale"]["x"]), r4(sh["m_Scale"]["y"]), r4(sh["m_Scale"]["z"])]
        if any(sh["m_Position"].values()):
            s["pos"] = [r4(sh["m_Position"]["x"]), r4(sh["m_Position"]["y"]), r4(sh["m_Position"]["z"])]
        if any(sh["m_Rotation"].values()):
            s["rot"] = euler_deg(sh["m_Rotation"])
        if sh["randomDirectionAmount"]:
            s["rnd"] = r4(sh["randomDirectionAmount"])
        if sh["sphericalDirectionAmount"]:
            s["sph"] = r4(sh["sphericalDirectionAmount"])
        e["shape"] = s
    sz = d["SizeModule"]
    if sz["enabled"]:
        e["sizeOL"] = mm(sz["curve"])
    c = d["ColorModule"]
    if c["enabled"]:
        e["colorOL"] = col(c["gradient"], True)
    r = d["RotationModule"]
    if r["enabled"]:
        e["rotOL"] = mm(r["curve"])
    v = d["VelocityModule"]
    if v["enabled"]:
        e["vel"] = {"x": mm(v["x"]), "y": mm(v["y"]), "z": mm(v["z"]), "world": bool(v["inWorldSpace"])}
        if v["speedModifier"]["scalar"] != 1:
            e["vel"]["mod"] = mm(v["speedModifier"])
    f = d["ForceModule"]
    if f["enabled"]:
        e["force"] = {"x": mm(f["x"]), "y": mm(f["y"]), "z": mm(f["z"]), "world": bool(f["inWorldSpace"])}
    cl = d["ClampVelocityModule"]
    if cl["enabled"] and (cl["drag"]["scalar"] or cl["magnitude"]["scalar"] not in (0, 1)):
        e["clamp"] = {"drag": mm(cl["drag"]), "mag": mm(cl["magnitude"]), "damp": r4(cl["dampen"])}
    n = d["NoiseModule"]
    if n["enabled"]:
        e["noise"] = {"str": mm(n["strength"]), "freq": r4(n["frequency"]), "scroll": mm(n["scrollSpeed"]),
                      "pos": mm(n["positionAmount"]), "damp": bool(n["damping"])}
    iv = d["InheritVelocityModule"]
    if iv["enabled"]:
        e["inherit"] = {"mode": iv["m_Mode"], "k": mm(iv["m_Curve"])}
    co = d["CollisionModule"]
    if co["enabled"]:  # type 0 = planes (Transforms), 1 = world colliders; no enabled system uses planes
        e["col"] = {"type": co["type"], "mode": co["collisionMode"], "damp": mm(co["m_Dampen"]), "bounce": mm(co["m_Bounce"]),
                    "loss": mm(co["m_EnergyLossOnCollision"]), "kmin": r4(co["minKillSpeed"]), "kmax": r4(co["maxKillSpeed"]),
                    "rs": r4(co["radiusScale"])}
    tm = d["TrailModule"]
    if tm["enabled"]:
        e["trail"] = {"mode": tm["mode"], "ratio": r4(tm["ratio"]), "life": mm(tm["lifetime"]), "minDist": r4(tm["minVertexDistance"]),
                      "texMode": tm["textureMode"], "texScale": [r4(tm["textureScale"]["x"]), r4(tm["textureScale"]["y"])],
                      "ribbons": tm["ribbonCount"], "world": bool(tm["worldSpace"]), "die": bool(tm["dieWithParticles"]),
                      "sizeW": bool(tm["sizeAffectsWidth"]), "sizeL": bool(tm["sizeAffectsLifetime"]),
                      "inhCol": bool(tm["inheritParticleColor"]), "width": mm(tm["widthOverTrail"]),
                      "colTrail": col(tm["colorOverTrail"], True), "colLife": col(tm["colorOverLifetime"], True)}
    u = d["UVModule"]
    if u["enabled"]:
        e["sheet"] = {"x": u["tilesX"], "y": u["tilesY"], "anim": u["animationType"], "row": u["rowIndex"],
                      "cycles": r4(u["cycles"]), "frame": mm(u["frameOverTime"]), "start": mm(u["startFrame"]),
                      "rowMode": u["rowMode"]}
    # Renderer
    rr = {"mode": rd["m_RenderMode"], "len": r4(rd["m_LengthScale"]), "vscale": r4(rd["m_VelocityScale"]),
          "order": rd["m_SortingOrder"], "align": rd["m_RenderAlignment"]}
    if not rd["m_Enabled"]:
        rr["off"] = 1
    if rd["m_RenderMode"] == 4:
        rr["mesh"] = texfn(rd["m_Mesh"])
    mats = [m for m in rd["m_Materials"] if m["m_PathID"]]
    if mats:
        rr.update(matfn(mats[0]))
    e["rend"] = rr
    if "trail" in e:  # the trail ribbon uses the renderer's second material
        e["trail"]["mat"] = matfn(mats[1]) if len(mats) > 1 else {k: v for k, v in rr.items() if k in ("tex", "st", "tint", "blend", "x2", "cut")}
    return e


def main():
    files = ["level2", "level4", "sharedassets2.assets", "sharedassets4.assets"]
    fl.load(files)
    texdir = os.path.join(GAME, "art", "tex")
    os.makedirs(texdir, exist_ok=True)
    out, log, alias = {}, [], {}
    tex_cache = {}
    scene_paths = {}
    for sid in ("env", "player"):
        sj = json.load(open(os.path.join(GAME, "art", sid, "scene.json"), encoding="utf-8"))
        ps = []
        for n in sj["nodes"]:
            ps.append(n)
        names = set()
        for i, n in enumerate(sj["nodes"]):
            p = n["n"]
            j = n["p"]
            while j >= 0:
                p = sj["nodes"][j]["n"] + "/" + p
                j = sj["nodes"][j]["p"]
            names.add(p)
        scene_paths[sid] = names

    for fname in files:
        tr = xs.Tree(fname)
        sid = {"level2": "env", "level4": "player"}.get(fname)
        ext = tr.ext

        def comp(g, ty):
            for c in tr.T(g)["m_Component"]:
                o = tr.objs.get(c["component"]["m_PathID"])
                if o is not None and o.type.name == ty:
                    return o
            return None

        def material(pptr):
            """Texture + blend facts of a renderer material (external pptr into sharedassets/resources)."""
            fid, pid = pptr["m_FileID"], pptr["m_PathID"]
            name = fname if fid == 0 else ext[fid - 1]
            key = (name, pid)
            if key in tex_cache:
                return tex_cache[key]
            mo = fl.by_file(name).get(pid)
            res = {"mat": "?"}
            if mo is None:
                log.append(f"material {key} not loaded")
                tex_cache[key] = res
                return res
            m = mo.read()
            sp = m.m_SavedProperties
            fl_ = dict(sp.m_Floats)
            cols = {k: [r4(v.r), r4(v.g), r4(v.b), r4(v.a)] for k, v in sp.m_Colors}
            tex = {k: t for k, t in sp.m_TexEnvs if t.m_Texture.m_PathID}
            try:
                sh = m.m_Shader.read().m_ParsedForm.m_Name
            except Exception:
                sh = "?"
            slot = next((s for s in ("_MainTex", "_BaseMap", "_BaseColorMap", "_BaseColorTexture") if s in tex), None)
            res = {"mat": m.m_Name, "shader": sh}
            if slot:
                res["tex"] = xs.save_texture(tex[slot].m_Texture.read(), texdir)[0]
                st = tex[slot]
                if (st.m_Scale.x, st.m_Scale.y, st.m_Offset.x, st.m_Offset.y) != (1, 1, 0, 0):
                    res["st"] = [r4(st.m_Scale.x), r4(st.m_Scale.y), r4(st.m_Offset.x), r4(st.m_Offset.y)]
            urp = sh.startswith("Universal Render Pipeline")
            # URP materials keep a stale legacy _TintColor (0.5) next to the live _BaseColor.
            tint = (cols.get("_BaseColor") if urp else cols.get("_TintColor") or cols.get("_Color")) or cols.get("_BaseColor")
            if tint:
                res["tint"] = tint
            kw = set(getattr(m, "m_ValidKeywords", None) or (m.m_ShaderKeywords or "").split())
            low = (sh + " " + m.m_Name).lower()
            dst = fl_.get("_DstBlend", fl_.get("_DstBlend2"))
            add = "additive" in low or "add" in sh.lower().split("/")[-1].lower().replace("address", "") \
                or dst == 1 or "_ADDITIVE" in kw
            res["blend"] = "add" if add else "alpha"
            if sh.startswith("Legacy Shaders/Particles") or sh.startswith("Mobile/Particles"):
                res["x2"] = 1 if add and "tint" in res else 0
            res["f"] = {k: r4(v) for k, v in fl_.items() if k in ("_Mode", "_Surface", "_Blend", "_SrcBlend", "_DstBlend",
                                                                  "_InvFade", "_SoftParticleFadeDistanceNear", "_Cull")}
            if fl_.get("_AlphaClip") == 1 or "_ALPHATEST_ON" in kw:
                res["cut"] = r4(fl_.get("_Cutoff", 0.5))
            res["q"] = m.m_CustomRenderQueue
            tex_cache[key] = res
            return res

        def mesh_of(pptr):
            """Mesh of a mesh-mode renderer as {p, uv, i} in three.js axes; Unity's built-in Quad (default resources) inlined."""
            fid, pid = pptr["m_FileID"], pptr["m_PathID"]
            name = fname if fid == 0 else ext[fid - 1]
            if name == "unity default resources" and pid == 10210:
                return {"p": [-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], "uv": [0, 1, 1, 1, 0, 0, 1, 0],
                        "i": [0, 2, 1, 2, 3, 1], "name": "Quad"}
            mo = fl.by_file(name).get(pid)
            if mo is None:
                log.append(f"mesh {name}:{pid} not loaded")
                return {"missing": f"{name}:{pid}"}
            mesh = mo.read()
            m = xs.read_mesh(mesh)
            tri = m["subs"][0]
            return {"name": mesh.m_Name, "p": [r4(x) for x in m["pos"].reshape(-1)],
                    "uv": [r4(x) for x in m["uv0"].reshape(-1)] if m["uv0"] is not None else [],
                    "i": [int(x) for x in tri.reshape(-1)]}

        # paths
        def gpath(g):
            names = []
            while g:
                names.append(tr.T(g)["m_Name"])
                g = tr.parent.get(g)
            return "/".join(reversed(names))

        def root_of(g):
            while tr.parent.get(g):
                g = tr.parent[g]
            return g

        def rel_xf(g, root):
            """Local transform of g relative to root in Unity space, as three.js [t, q, s] (pos (x,y,-z), q(-x,-y,z,w))."""
            chain = []
            while g != root:
                chain.append(g)
                g = tr.parent[g]
            p = [0.0, 0.0, 0.0]
            q = [0.0, 0.0, 0.0, 1.0]
            s = [1.0, 1.0, 1.0]

            def qmul(a, b):
                ax, ay, az, aw = a
                bx, by, bz, bw = b
                return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                        aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]

            def qrot(qq, v):
                x, y, z, w = qq
                u = [x, y, z]
                c1 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                t = [2 * c for c in c1]
                c2 = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]
                return [v[i] + w * t[i] + c2[i] for i in range(3)]
            for c in reversed(chain):
                t = tr.T(tr.trans[c])
                lp, lr, ls = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
                off = qrot(q, [lp["x"] * s[0], lp["y"] * s[1], lp["z"] * s[2]])
                p = [p[i] + off[i] for i in range(3)]
                q = qmul(q, [lr["x"], lr["y"], lr["z"], lr["w"]])
                s = [s[0] * ls["x"], s[1] * ls["y"], s[2] * ls["z"]]
            return {"t": [r4(p[0]), r4(p[1]), r4(-p[2])], "q": [r4(-q[0]), r4(-q[1]), r4(q[2]), r4(q[3])],
                    "s": [r4(x) for x in s]}

        n = 0
        for pid, o in tr.objs.items():
            if o.type.name != "ParticleSystem":
                continue
            d = o.read_typetree()
            g = tr.owner[pid]
            rend = comp(g, "ParticleSystemRenderer")
            rd = rend.read_typetree() if rend is not None else None
            if rd is None:
                log.append(f"{fname}:{gpath(g)} has no renderer")
                continue
            e = system(d, rd, mesh_of, material)
            if sid:
                key = f"{sid}:{gpath(g)}"
                if key in out:
                    k = 2
                    while f"{key}#{k}" in out:
                        k += 1
                    key = f"{key}#{k}"
                    log.append(f"duplicate path -> {key}")
                if gpath(g) not in scene_paths[sid]:
                    log.append(f"{key}: not in scene.json (dropped node)")
            else:
                root = root_of(g)
                rel = [tr.T(x)["m_Name"] for x in []]
                parts, x = [], g
                while x != root:
                    parts.append(tr.T(x)["m_Name"])
                    x = tr.parent[x]
                key = f"prefab:{fname}:{root}" + ("/" + "/".join(reversed(parts)) if parts else "")
                e["xf"] = rel_xf(g, root)
                e["name"] = tr.T(root)["m_Name"]
            out[key] = e
            if not sid and not parts:
                alias[f"prefab:{fname}:{pid}"] = key
            n += 1
        log.append(f"{fname}: {n} systems")

    out["_alias"] = alias  # FeedFish.crunchParticle & co. point at the root ParticleSystem component, not the GameObject
    dst = os.path.join(GAME, "data", "particles.json")
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("\n".join(log))
    print(f"{len(out)} systems -> {dst} ({os.path.getsize(dst) // 1024} KB)")


if __name__ == "__main__":
    main()
