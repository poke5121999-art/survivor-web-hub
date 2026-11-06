"""Particle effects of ObjectPoolManager._particleObjectData (level1), by ParticleType: for every ParticleSystem in the
prefab its renderer texture (main texture of the particle material, sheet tiles), and the main/emission numbers the web
billboard emitter uses (lifetime, speed, size, colour, burst count, gravity).

Usage: python -I tools/export_fx.py   -> art/fx/fx.json + art/fx/*.png
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "fx")
TYPES = {2: "BuildEffect", 3: "SellEffect", 5: "CoinEffect", 6: "UpgradeEffect", 8: "SmileEffect", 9: "AngryEffect",
         10: "SleepEffect", 14: "DollerEffect", 0: "DollorExplosion"}


def curve_const(c):
    """MinMaxCurve -> [min, max] for constant / random-between-constants modes, else the scalar."""
    mode = c.get("minMaxState", 0)
    s = c.get("scalar", 1.0)
    if mode == 3:
        return [round(c.get("minScalar", s), 3), round(s, 3)]
    return [round(s, 3), round(s, 3)]


def grad_color(g):
    mode = g.get("minMaxState", 0)
    col = g.get("maxColor") or {"r": 1, "g": 1, "b": 1, "a": 1}
    return [round(col["r"], 3), round(col["g"], 3), round(col["b"], 3), round(col["a"], 3), mode]


def main():
    os.makedirs(OUT, exist_ok=True)
    mm.load()
    f = mm.by_file("level1")
    sf = next(iter(f.values())).assets_file
    opm = next(o for o in f.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "ObjectPoolManager")
    data = mm.read(opm)["_particleObjectData"]
    out, saved = {}, {}
    for t, name in TYPES.items():
        if t >= len(data):
            continue
        p = data[t]["prefab"]
        if not p["m_PathID"]:
            continue
        pf = mm.by_file(sf.name if p["m_FileID"] == 0 else mm.ext_names(sf)[p["m_FileID"] - 1])
        root = pf[p["m_PathID"]].read().m_GameObject.read()
        systems = []

        def walk(go):
            comps = {c.component.deref().type.name: c.component.deref() for c in go.m_Component}
            ps, pr = comps.get("ParticleSystem"), comps.get("ParticleSystemRenderer")
            if ps is not None and pr is not None and go.m_IsActive:
                d = ps.read_typetree()
                r = pr.read_typetree()
                mats = [m for m in r.get("m_Materials", []) if m["m_PathID"]]
                tex = None
                if mats:
                    mo = pr.read().m_Materials[0].read()
                    envs = {k: v for k, v in mo.m_SavedProperties.m_TexEnvs if v.m_Texture.m_PathID}
                    slot = next((s for s in ("_MainTex", "_BaseMap") if s in envs), None)
                    if slot:
                        to = envs[slot].m_Texture.read()
                        key = to.m_Name
                        if key not in saved:
                            fn = re.sub(r"[^A-Za-z0-9_.-]+", "_", key) + ".png"
                            to.image.save(os.path.join(OUT, fn))
                            saved[key] = fn
                        tex = saved[key]
                ini = d["InitialModule"]
                em = d["EmissionModule"]
                bursts = [int(b["countCurve"]["scalar"]) for b in em.get("m_Bursts", [])]
                uv = d.get("UVModule", {})
                systems.append({
                    "name": go.m_Name, "tex": tex,
                    "life": curve_const(ini["startLifetime"]), "speed": curve_const(ini["startSpeed"]),
                    "size": curve_const(ini["startSize"]), "color": grad_color(ini["startColor"]),
                    "gravity": round(ini.get("gravityModifier", {}).get("scalar", 0.0), 3),
                    "rate": round(em.get("rateOverTime", {}).get("scalar", 0.0), 3), "bursts": bursts,
                    "max": ini.get("maxNumParticles", 0), "duration": round(d.get("lengthInSec", 1.0), 3),
                    "loop": bool(d.get("looping", 0)),
                    "sheet": [uv.get("tilesX", 1), uv.get("tilesY", 1)] if uv.get("enabled") else None,
                    "shape": d.get("ShapeModule", {}).get("type"), "radius": round(d.get("ShapeModule", {}).get("radius", {}).get("value", 0.0), 3),
                })
            for c in go.m_Transform.read().m_Children:
                walk(c.read().m_GameObject.read())

        walk(root)
        out[name] = {"type": t, "systems": systems}
        print(name, [(s["name"], s["tex"], s["bursts"], s["rate"], s["life"]) for s in systems])
    with open(os.path.join(OUT, "fx.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))


if __name__ == "__main__":
    main()
