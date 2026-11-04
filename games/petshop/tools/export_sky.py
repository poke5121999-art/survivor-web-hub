"""Skybox of level1 (material "Sky", sharedassets1 path id 79, shader Skybox/6 Sided) -> art/sky/<face>.webp + sky.json
(DayNightCycle drives its _Tint and _Rotation at runtime). Usage: python -I tools/export_sky.py"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm

OUT = os.path.join(os.path.dirname(HERE), "art", "sky")
os.makedirs(OUT, exist_ok=True)
env = mm.load()
sf = next(o.assets_file for o in env.objects if o.assets_file.name == "sharedassets1.assets")
mat = sf.objects[79].read_typetree()
props = mat["m_SavedProperties"]
out = {"name": mat["m_Name"], "shader": "Skybox/6 Sided", "faces": {}}
for name, t in props["m_TexEnvs"]:
    pid = t["m_Texture"]["m_PathID"]
    if not pid:
        continue
    img = sf.objects[pid].read().image
    img = img.convert("RGB")
    if max(img.size) > 1024:
        img = img.resize((1024, 1024))
    fn = name.strip("_").replace("Tex", "").lower() + ".webp"
    img.save(os.path.join(OUT, fn), "WEBP", quality=88, method=6)
    out["faces"][name] = fn
out["floats"] = dict(props["m_Floats"])
out["tint"] = dict(props["m_Colors"])["_Tint"]
json.dump(out, open(os.path.join(OUT, "sky.json"), "w"), indent=1)
print(json.dumps(out["faces"]), out["floats"]["_Exposure"], out["tint"])
