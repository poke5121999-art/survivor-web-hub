"""Export the "theme" feature data of Cats&Soup (forest themes, facility skins, lamps) for the three.js build.

usage: py -3.12 -I export_theme.py [ground] [skins] [data]     (default: all three)

ground  art/tex/<ground textures of themes 0..18> and the per-theme record of data/theme.json "ground":
        {base, base2, back, farTree, farSize, bg}  (Spawn.SetThemeGround, map.md 2b; bg = camera clear colour, inferred)
skins   art/theme/skin<work>/{scene.json,geo.glb} for every facility whose WorkPlaceInfo._workSkinObjs swaps a mesh
        (Mesh_Change: MeshFilter n gets Change_Meshs[k] + Change_Materials[k] for the k-th entry of Work.existWorkSkins)
        and data/theme.json "skins": {work: {mode, mesh: [{node, picks: [root key|null per skin position]}],
        color: [{material, colors}], act: [[node...] per skin position]}}
data    the table rows the sim needs (ThemeShop, ThemeSpecial, Lamp chunk map) -> data/theme.json

The lamp prefabs themselves are exported with tools/export_prefabs.py (chunks of 25: art/theme/lamps0..4,
`py -3.12 -I tools/export_prefabs.py theme/lamps<k> lamp/lamp<i> ...`).
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
sys.stdout.reconfigure(encoding="utf-8")
import cns  # noqa: E402
from export_prefabs import GLB, read_mesh, save_image, deps, STATES, log  # noqa: E402

OUT = os.path.join(GAME, "data", "theme.json")
TEXDIR = os.path.join(GAME, "art", "tex")
FLAT = os.path.join(cns.ROOT, "flat")
RES = {}
for k, f, p in json.load(open(os.path.join(cns.ROOT, "resources.json"))):
    RES.setdefault(k, (f, p))
load_env = getattr(cns, "env")


def load_data():
    return json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}


def save_data(d):
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


def flat(name):
    return json.load(open(os.path.join(FLAT, name + ".json"), encoding="utf-8"))


# ---- ground ----
def image(key):
    f, pid = RES[key]
    e = load_env(f)
    best = None
    for o in e.objects:
        if o.assets_file.name == f and o.type.name in ("Texture2D", "Sprite"):
            t = o.read()
            if best is None or o.type.name == "Sprite":
                best = t
    stem, im = save_image(best.image, best.m_Name, TEXDIR)
    return stem, im


def export_ground():
    data = load_data()
    g = data.setdefault("ground", {})
    stems = {}
    for theme in range(19):
        rec = {}
        for field, key in (("base", f"ground/ground_base{theme}"), ("base2", f"ground/ground_base{theme}_2"),
                           ("back", f"ground/ground_back{theme}"), ("farTree", f"tree/picnic_tree06_theme{theme}")):
            if key not in RES:
                log(f"  theme {theme}: {key} is not in Resources")
                continue
            stem, im = image(key)
            rec[field] = stem
            if field == "farTree":
                rec["farSize"] = list(im.size)
            if field == "back":
                rec["_im"] = im
        stems[theme] = rec
    # Themes whose ground layer is missing reuse theme 3's (map.md 2b: theme 5 has no base entry, inferred).
    for theme, rec in stems.items():
        for field in ("base", "base2"):
            if field not in rec:
                rec[field] = stems[3][field]
                rec["inherit"] = 3
    # Camera clear colour: the ground_back image sampled at 0.25 of its height, scaled so theme 0 gives the colour measured
    # in the game video (main.js DAY.sky). Spawn.ChangeMainCamBgColor reads the texture (Spawn.c:11212); the pixel is not recovered (inferred).
    def sample(im):
        w, h = im.size
        r, gg, b = im.convert("RGB").getpixel((0, int(h * 0.25)))
        return np.array([r, gg, b], dtype=float) / 255
    ref = np.array([0.4274, 0.5569, 0.3294]) / sample(stems[0]["_im"])
    for theme, rec in stems.items():
        bg = np.clip(sample(rec.pop("_im")) * ref, 0, 1)
        rec["bg"] = [round(float(x), 4) for x in bg]
        g[str(theme)] = rec
        print(theme, rec)
    save_data(data)


# ---- table rows ----
def export_tables():
    data = load_data()
    data["shop"] = flat("ThemeShop")
    data["special"] = flat("ThemeSpecial")
    data["themeRows"] = flat("Theme")
    save_data(data)


# ---- facility skins ----
class Pack:
    def __init__(self, env):
        self.glb = GLB()
        self.meshes, self.mesh_index = [], {}
        self.materials, self.mat_index = [], {}
        self.textures, self.tex_index = [], {}
        self.objs = {(o.assets_file.name, o.path_id): o for o in env.objects}

    def tex_ref(self, pptr):
        t = pptr.read()
        key = (t.object_reader.assets_file.name, t.object_reader.path_id)
        if key not in self.tex_index:
            stem, im = save_image(t.image, t.m_Name, TEXDIR)
            self.textures.append({"name": stem, "size": list(im.size), "alpha": im.mode == "RGBA"})
            self.tex_index[key] = len(self.textures) - 1
        return self.tex_index[key]

    def material_entry(self, m):
        sp = m.m_SavedProperties
        f = {k: round(v, 4) for k, v in sp.m_Floats}
        c = {k: [round(v.r, 4), round(v.g, 4), round(v.b, 4), round(v.a, 4)] for k, v in sp.m_Colors}
        tex = {k: t for k, t in sp.m_TexEnvs if t.m_Texture.m_PathID}
        try:
            sh = m.m_Shader.read().m_ParsedForm.m_Name
        except Exception:
            sh = "?"
        e = {"name": m.m_Name, "shader": sh, "q": m.m_CustomRenderQueue}
        if sh in STATES:
            e["passes"] = [{k: v for k, v in p.items() if k in ("name", "zwrite", "cull", "src", "dst", "mask")} for p in STATES[sh]]
        if c:
            e["c"] = c
        if f:
            e["f"] = f
        t = {}
        for k, st in tex.items():
            try:
                t[k] = self.tex_ref(st.m_Texture)
            except Exception as ex:
                log(f"  material {m.m_Name}: texture {k} unreadable ({ex})")
                continue
            if (st.m_Scale.x, st.m_Scale.y, st.m_Offset.x, st.m_Offset.y) != (1, 1, 0, 0):
                e.setdefault("st", {})[k] = [st.m_Scale.x, st.m_Scale.y, st.m_Offset.x, st.m_Offset.y]
        if t:
            e["t"] = t
        kw = getattr(m, "m_ValidKeywords", None) or (m.m_ShaderKeywords or "").split()
        if kw:
            e["kw"] = list(kw)
        return e

    def mat(self, ref):
        if not ref:
            return None
        o = self.objs.get((ref["f"], ref["id"]))
        if o is None:
            log(f"  material {ref} not loaded")
            return None
        key = (ref["f"], ref["id"])
        if key not in self.mat_index:
            self.materials.append(self.material_entry(o.read()))
            self.mat_index[key] = len(self.materials) - 1
        return self.mat_index[key]

    def mesh(self, ref, skinned=False):
        if not ref:
            return None
        o = self.objs.get((ref["f"], ref["id"]))
        if o is None:
            log(f"  mesh {ref} not loaded")
            return None
        key = (ref["f"], ref["id"], skinned)
        if key not in self.mesh_index:
            mo = o.read()
            try:
                m = read_mesh(mo, skinned)
            except Exception as e:
                log(f"  mesh {mo.m_Name}: unreadable ({e})")
                self.mesh_index[key] = None
                return None
            self.glb.mesh(mo.m_Name, m)
            self.meshes.append({"name": mo.m_Name, "subs": len(m["subs"]), "verts": len(m["pos"])})
            self.mesh_index[key] = len(self.meshes) - 1
        return self.mesh_index[key]


def export_skins():
    data = load_data()
    places = json.load(open(os.path.join(GAME, "data", "places.json"), encoding="utf-8"))
    works = {w["index"]: w for w in json.load(open(os.path.join(GAME, "data", "tables.json"), encoding="utf-8"))["Work"]}
    scenes = {}
    skins = data.setdefault("skins", {})
    for a_s, k in places.items():
        a = int(a_s)
        w = works.get(a)
        if not w or len(w["existWorkSkins"]) < 2:
            continue
        if k not in scenes:
            scenes[k] = json.load(open(os.path.join(GAME, "art", f"places{k}", "scene.json"), encoding="utf-8"))
        sc = scenes[k]
        ri = next((i for i, r in enumerate(sc["roots"]) if r["key"] == f"places/place{a}"), None)
        if ri is None:
            continue
        lo = sc["roots"][ri]["node"]
        hi = sc["roots"][ri + 1]["node"] if ri + 1 < len(sc["roots"]) else len(sc["nodes"])
        wpi = next((n["k"]["WorkPlaceInfo"] for n in sc["nodes"][lo:hi] if n.get("k") and "WorkPlaceInfo" in n["k"]), None)
        so = wpi and wpi.get("_workSkinObjs")
        if not so or not so.get("Mode"):
            continue
        mode = so["Mode"]
        nskin = len(w["existWorkSkins"])
        rec = {"mode": mode, "base": lo}
        refs = set()
        for mc in so["MeshChanges"]:
            for x in (mc["Change_Meshs"] or []) + (mc["Change_Materials"] or []):
                if x:
                    refs.add(x["f"])
            for lst in mc.get("Change_SharedMaterialLists") or []:
                for x in lst.get("SharedMaterials") or []:
                    if x:
                        refs.add(x["f"])
        for mc in so["MaterialColors"]:
            if mc["Material"]:
                refs.add(mc["Material"]["f"])
        env = load_env(*deps(sorted(refs))) if refs else None
        pack = Pack(env) if env else None
        roots, root_nodes = [], []
        pick_of = {}

        def root_for(mesh_ref, mat_refs, skinned=False):
            key = (mesh_ref["f"], mesh_ref["id"], skinned, tuple((m["f"], m["id"]) if m else None for m in mat_refs))
            if key in pick_of:
                return pick_of[key]
            mi = pack.mesh(mesh_ref, skinned)
            if mi is None:
                pick_of[key] = None
                return None
            mts = [pack.mat(m) for m in mat_refs]
            name = f"s{len(roots)}"
            roots.append({"key": name, "node": len(root_nodes)})
            node = {"n": name, "p": -1, "m": mi, "mt": mts or [None]}
            root_nodes.append(node)
            pick_of[key] = name
            return name

        if mode & 2:
            rec["mesh"] = []
            for mc in so["MeshChanges"]:
                skinned = mc["ChangeMode"] == 1
                target = mc["SkinnedMeshRenderer"] if skinned else mc["MeshFilter"]
                if not target:
                    log(f"  work {a}: mesh change without a target skipped")
                    continue
                picks = []
                for s in range(nskin):
                    mesh_ref = mc["Change_Meshs"][s] if s < len(mc["Change_Meshs"]) else None
                    if not mesh_ref:
                        picks.append(None)
                        continue
                    if mc["MaterialMode"] == 1:
                        lst = mc["Change_SharedMaterialLists"][s]["SharedMaterials"] if s < len(mc["Change_SharedMaterialLists"]) else []
                        mats = lst
                    elif mc["MaterialMode"] == 0 and s < len(mc["Change_Materials"]):
                        mats = [mc["Change_Materials"][s]]
                    else:
                        mats = []
                    picks.append(root_for(mesh_ref, mats or [None], skinned))
                rec["mesh"].append({"node": target["n"], "picks": picks, **({"sk": 1} if skinned else {})})
        if mode & 1:
            rec["color"] = []
            for mc in so["MaterialColors"]:
                o = pack.objs.get((mc["Material"]["f"], mc["Material"]["id"])) if mc["Material"] else None
                name = o.read().m_Name if o is not None else None
                rec["color"].append({"material": name, "colors": [[c["r"], c["g"], c["b"], c["a"]] for c in mc["Change_Colors"]]})
        if mode & 16:
            rec["act"] = [[t["n"] for t in (ac.get("Trans") or []) if t] for ac in so["Actives"]]
        if roots:
            out = os.path.join(GAME, "art", "theme", f"skin{a}")
            os.makedirs(out, exist_ok=True)
            scene = {"roots": roots, "nodes": root_nodes, "meshes": pack.meshes, "materials": pack.materials, "textures": pack.textures}
            pack.glb.write(os.path.join(out, "geo.glb"))
            with open(os.path.join(out, "scene.json"), "w", encoding="utf-8") as fh:
                json.dump(scene, fh, ensure_ascii=False, separators=(",", ":"))
            rec["lib"] = f"theme/skin{a}"
        skins[str(a)] = rec
        log(f"work {a}: mode {mode}, {len(roots)} skin meshes, {len(pack.meshes) if pack else 0} meshes, "
            f"{len(pack.textures) if pack else 0} textures, colors {len(rec.get('color', []))}, act {len(rec.get('act', []))}")
    save_data(data)


if __name__ == "__main__":
    what = sys.argv[1:] or ["ground", "skins", "data"]
    if "data" in what:
        export_tables()
    if "ground" in what:
        export_ground()
    if "skins" in what:
        export_skins()
