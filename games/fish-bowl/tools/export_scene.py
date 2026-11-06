"""Export one Aquarium Land scene (or part of it) for the three.js build.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_scene.py <file> <out-id> [--drop Root1,Root2]
       py -3.12 export_scene.py level2 env      the room, aquarium and the five levels' objects (ActivityManager)
       py -3.12 export_scene.py level4 player   player fish, cameras, path targets (loaded additively over level2)

Writes games/fish-bowl/art/<out-id>/
  geo.glb      every unique mesh, glTF mesh i = scene.meshes[i], one primitive per submesh, no materials;
               TEXCOORD_1 = Unity uv1 (lightmap UV)
  scene.json   nodes (hierarchy, local TRS, mesh/material refs, Bakery lightmap, gameplay components), materials,
               lightmaps, render settings
and games/fish-bowl/art/tex/<name>-<md5>.webp (+ .lq.webp).

Coordinates: Unity is left-handed, three.js right-handed. Converted once here:
point (x, y, z) -> (x, y, -z), quaternion (x, y, z, w) -> (-x, -y, z, w), triangle (a, b, c) -> (a, c, b).

Lightmaps: Bakery (ftLightmapsStorage) assigns lightmap index + scale/offset per renderer at runtime; the renderer's
own m_LightmapIndex is not used. node "lm" = [map index, sx, sy, ox, oy] in Unity UV convention (v up).
Kept: every GameObject outside --drop, minus UI-only subtrees (RectTransform branches without a renderer).
A PPtr to a GameObject or component of the same scene becomes {"n": node index}; others stay {"f": file, "id": path id}.
"""
import hashlib, io, json, os, struct, subprocess, sys
import numpy as np
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fl as mm  # noqa: E402

GAME = os.path.dirname(HERE)
fl_files = None
DROP_ROOTS = {"EventSystem", "!ftraceLightmaps"}
DROP_SCRIPTS = ("UnityEngine.UI.", "TMPro.TextMeshProUGUI", "UnityEngine.EventSystems.", "SwUiElementId", "Coffee.",
                "Cinemachine.CinemachinePipeline", "NativeAdsController", "UnityStandardAssets.Utility.FPSCounter")
KEEP_TYPES = ("BoxCollider", "SphereCollider", "CapsuleCollider", "NavMeshObstacle", "NavMeshAgent", "Animator",
              "Light", "Camera", "Canvas", "MeshCollider", "Rigidbody", "TrailRenderer", "AudioSource", "Animation")
LOG = []


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.append(s)
    print(s, flush=True)


def pos(v):
    return [round(v["x"], 5), round(v["y"], 5), round(-v["z"], 5)]


def quat(q):
    return [round(-q["x"], 6), round(-q["y"], 6), round(q["z"], 6), round(q["w"], 6)]


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {"asset": {"version": "2.0", "generator": "fish-bowl export_scene.py"}, "scene": 0,
                  "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "accessors": [], "bufferViews": [], "buffers": []}

    def acc(self, a, typ, target, minmax=False):
        while len(self.bin) % 4:
            self.bin.append(0)
        data = a.tobytes()
        self.j["bufferViews"].append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data), "target": target})
        self.bin += data
        ct = {np.dtype(np.uint16): 5123, np.dtype(np.uint32): 5125, np.dtype(np.float32): 5126}[a.dtype]
        d = {"bufferView": len(self.j["bufferViews"]) - 1, "componentType": ct, "count": int(a.shape[0]), "type": typ}
        if minmax:
            d["min"] = a.min(0).tolist()
            d["max"] = a.max(0).tolist()
        self.j["accessors"].append(d)
        return len(self.j["accessors"]) - 1

    def mesh(self, name, m):
        attrs = {"POSITION": self.acc(m["pos"], "VEC3", 34962, True)}
        if m["nrm"] is not None:
            attrs["NORMAL"] = self.acc(m["nrm"], "VEC3", 34962)
        if m["uv0"] is not None:
            attrs["TEXCOORD_0"] = self.acc(m["uv0"], "VEC2", 34962)
        if m.get("uv1") is not None:
            attrs["TEXCOORD_1"] = self.acc(m["uv1"], "VEC2", 34962)
        if m["col"] is not None:
            attrs["COLOR_0"] = self.acc(m["col"], "VEC4", 34962)
        if m.get("joints") is not None:
            attrs["JOINTS_0"] = self.acc(m["joints"], "VEC4", 34962)
            attrs["WEIGHTS_0"] = self.acc(m["weights"], "VEC4", 34962)
        prims = []
        for tri in m["subs"]:
            idx = tri.astype(np.uint16 if len(m["pos"]) < 65536 else np.uint32).reshape(-1)
            prims.append({"attributes": attrs, "indices": self.acc(idx, "SCALAR", 34963)})
        self.j["meshes"].append({"name": name, "primitives": prims})
        # Node names carry the mesh index: gltf-transform may prune or reorder, the runtime looks meshes up by "m<i>".
        self.j["nodes"].append({"mesh": len(self.j["meshes"]) - 1, "name": f"m{len(self.j['meshes']) - 1}"})
        self.j["scenes"][0]["nodes"].append(len(self.j["nodes"]) - 1)

    def write(self, path, meshopt=True):
        if meshopt:
            raw = path + ".raw.glb"
            self.write(raw, meshopt=False)
            r = subprocess.run(["npx", "-y", "@gltf-transform/cli@4", "meshopt", raw, path, "--level", "high"],
                               capture_output=True, text=True, shell=os.name == "nt")
            if r.returncode == 0 and os.path.exists(path):
                os.remove(raw)
                return
            log("meshopt failed, keeping the plain glb:", (r.stderr or r.stdout)[-300:])
            os.replace(raw, path)
            return
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin))


def read_mesh(mesh, skinned=False):
    h = MeshHandler(mesh)
    h.process()
    p = np.asarray(h.m_Vertices, dtype=np.float32).reshape(-1, 3).copy()
    n = len(p)
    p[:, 2] *= -1

    def arr(v, d):
        if v is None or len(v) == 0:
            return None
        a = np.asarray(v, dtype=np.float32).reshape(n, -1)[:, :d].copy()
        return a

    nrm = arr(h.m_Normals, 3)
    if nrm is not None:
        nrm[:, 2] *= -1
    uv0 = arr(h.m_UV0, 2)
    if uv0 is not None:
        uv0[:, 1] = 1 - uv0[:, 1]
    uv1 = arr(h.m_UV1, 2)
    if uv1 is not None:
        uv1[:, 1] = 1 - uv1[:, 1]
    col = arr(h.m_Colors, 4)
    subs = []
    idx = h.m_IndexBuffer or []
    for sm in mesh.m_SubMeshes:
        first = sm.firstByte // (2 if h.m_Use16BitIndices else 4)
        tri = np.asarray(idx[first:first + sm.indexCount], dtype=np.int64)
        if sm.topology != 0:
            log(f"  mesh {mesh.m_Name}: submesh topology {sm.topology} dropped")
            tri = np.zeros(0, dtype=np.int64)
        tri = tri.reshape(-1, 3) + (sm.baseVertex or 0)
        subs.append(tri[:, [0, 2, 1]])
    r = {"pos": p, "nrm": nrm, "uv0": uv0, "uv1": uv1, "col": col, "subs": subs}
    if skinned and h.m_BoneIndices is not None and len(h.m_BoneIndices) == n:
        # Unity 2019+ drops the BlendWeight channel when every vertex has one bone (implicit weight 1).
        ji = np.asarray(h.m_BoneIndices, dtype=np.uint16).reshape(n, -1)
        j = np.zeros((n, 4), dtype=np.uint16)
        j[:, :ji.shape[1]] = ji[:, :4]
        w = np.zeros((n, 4), dtype=np.float32)
        if h.m_BoneWeights is not None and len(h.m_BoneWeights) == n:
            wi = np.asarray(h.m_BoneWeights, dtype=np.float32).reshape(n, -1)
            w[:, :wi.shape[1]] = wi[:, :4]
            # m_CompressedMesh keeps the 4th weight implicit (1 - the other three); UnityPy decodes it as garbage (-28).
            bad = (w[:, 3] < 0) | (w[:, 3] > 1)
            w[bad, 3] = np.clip(1 - w[bad, :3].sum(1), 0, 1)
        else:
            w[:, 0] = 1
        r["joints"] = j
        r["weights"] = w / np.maximum(w.sum(1, keepdims=True), 1e-6)
        # Unity bind pose (row-major, left-handed) -> three.js column-major in the mirrored space: S * M * S, S = diag(1,1,-1,1)
        S = np.diag([1.0, 1.0, -1.0, 1.0])
        binds = []
        for bp in mesh.m_BindPose:
            M = np.array([[bp.e00, bp.e01, bp.e02, bp.e03], [bp.e10, bp.e11, bp.e12, bp.e13],
                          [bp.e20, bp.e21, bp.e22, bp.e23], [bp.e30, bp.e31, bp.e32, bp.e33]])
            binds.append([round(float(x), 6) for x in (S @ M @ S).T.reshape(-1)])
        r["bind"] = binds
    return r


def material_entry(m, textures):
    sp = m.m_SavedProperties
    f = dict(sp.m_Floats)
    c = {k: [round(v.r, 4), round(v.g, 4), round(v.b, 4), round(v.a, 4)] for k, v in sp.m_Colors}
    tex = {k: t for k, t in sp.m_TexEnvs if t.m_Texture.m_PathID}
    try:
        sh = m.m_Shader.read().m_ParsedForm.m_Name
    except Exception:
        sh = "?"
    kw = set(getattr(m, "m_ValidKeywords", None) or (m.m_ShaderKeywords or "").split())
    slot = next((s for s in ("_BaseMap", "_MainTex") if s in tex), None)
    e = {"name": m.m_Name, "shader": sh, "color": c.get("_BaseColor") or c.get("_Color") or [1, 1, 1, 1]}
    if slot:
        e["tex"] = textures(tex[slot].m_Texture)
        st = tex[slot]
        if (st.m_Scale.x, st.m_Scale.y, st.m_Offset.x, st.m_Offset.y) != (1, 1, 0, 0):
            e["st"] = [st.m_Scale.x, st.m_Scale.y, st.m_Offset.x, st.m_Offset.y]
    if "_EMISSION" in kw and c.get("_EmissionColor"):
        e["emis"] = c["_EmissionColor"]
        if "_EmissionMap" in tex:
            e["emisTex"] = textures(tex["_EmissionMap"].m_Texture)
    # Unknown shaders: keep every float/color so the view can be tuned against them without re-exporting.
    e["f"] = {k: round(v, 4) for k, v in f.items()}
    e["c"] = c
    e["slots"] = sorted(tex)
    # Every other texture slot (_Matcap, _Mask, _MatCapMask, _BumpMap...): custom shaders need them.
    e["texs"] = {k: textures(t.m_Texture) for k, t in tex.items() if k != slot and k != "_MainTex"}
    if sh.startswith("Toony Colors Pro 2"):
        e["toon"] = {"h": c.get("_HColor", [1, 1, 1, 1]), "s": c.get("_SColor", [0, 0, 0, 1]),
                     "thr": round(f.get("_RampThreshold", 0.5), 4), "smooth": round(f.get("_RampSmoothing", 0.1), 4)}
        if "Outline" in sh:
            e["outline"] = {"w": f.get("_OutlineWidth", 1.0), "color": c.get("_OutlineColor", [0, 0, 0, 1]),
                            "const": "TCP2_OUTLINE_CONST_SIZE" in kw}
    queue = m.m_CustomRenderQueue
    if "_ALPHATEST_ON" in kw:
        e["alpha"] = "MASK"
        e["cutoff"] = round(f.get("_Cutoff", 0.5), 3)
    elif queue >= 3000 or f.get("_DstBlend", 0) == 10:
        e["alpha"] = "BLEND"
    return e


def save_texture(t, texdir):
    """Write a Texture2D as <name>-<hash>.webp (+ .lq.webp, 16 px) and return that stem with the image.

    Stores share art/tex, and the same name holds different pixels per store (each mart has its own "palette"; Store_9
    also has "Palette", the same file on Windows), so the file name carries 8 hex of the pixels' md5."""
    im = t.image.convert("RGBA")
    if im.getextrema()[3][0] >= 250:
        im = im.convert("RGB")
    stem = f"{t.m_Name}-{hashlib.md5(im.tobytes()).hexdigest()[:8]}"
    path = os.path.join(texdir, stem + ".webp")
    if not os.path.exists(path):
        im.save(path, "WEBP", quality=90, method=6, lossless=max(im.size) <= 256)
        lq = im.copy()
        lq.thumbnail((16, 16), Image.BILINEAR)
        lq.save(os.path.join(texdir, stem + ".lq.webp"), "WEBP", quality=70)
    return stem, im


class Tree:
    """GameObject hierarchy of one serialized file: owners, transforms, parents, children."""

    def __init__(self, name):
        self.name = name
        self.objs = mm.by_file(name)
        self.ext = mm.ext_names(next(iter(self.objs.values())).assets_file)
        self.tt = {}
        self.gos = [pid for pid, o in self.objs.items() if o.type.name == "GameObject"]
        self.owner, self.trans, self.parent, self.children = {}, {}, {}, {}
        for g in self.gos:
            for c in self.T(g)["m_Component"]:
                cid = c["component"]["m_PathID"]
                self.owner[cid] = g
                if cid in self.objs and self.objs[cid].type.name in ("Transform", "RectTransform"):
                    self.trans[g] = cid
        for g, t in self.trans.items():
            d = self.T(t)
            fp = d["m_Father"]["m_PathID"]
            self.parent[g] = self.owner.get(fp) if fp else None
            self.children[g] = [self.owner[x["m_PathID"]] for x in d["m_Children"] if x["m_PathID"] in self.owner]
        self.index = {}

    def objs_ext(self, pptr):
        """Object a raw {m_FileID, m_PathID} of this file points to (same file or an external), or None."""
        name = self.name if pptr["m_FileID"] == 0 else self.ext[pptr["m_FileID"] - 1]
        o = mm.by_file(name).get(pptr["m_PathID"])
        return o.read() if o is not None else None

    def T(self, pid):
        if pid not in self.tt:
            self.tt[pid] = self.objs[pid].read_typetree()
        return self.tt[pid]

    def has_renderer(self, g):
        for c in self.T(g)["m_Component"]:
            cid = c["component"]["m_PathID"]
            if cid in self.objs and self.objs[cid].type.name in ("MeshRenderer", "SkinnedMeshRenderer", "SpriteRenderer", "ParticleSystemRenderer"):
                return True
        return any(self.has_renderer(ch) for ch in self.children.get(g, []))

    def walk(self, g, keep):
        if self.objs[self.trans[g]].type.name == "RectTransform" and not self.has_renderer(g):
            return
        keep.append((self, g))
        for ch in self.children.get(g, []):
            self.walk(ch, keep)

    def roots(self):
        return [g for g in self.gos if g in self.trans and self.parent.get(g) is None]

    def ref(self, v):
        if isinstance(v, dict):
            if set(v.keys()) == {"m_FileID", "m_PathID"}:
                if v["m_PathID"] == 0:
                    return None
                if v["m_FileID"] == 0:
                    pid = v["m_PathID"]
                    g = pid if pid in self.index else self.owner.get(pid)
                    if g in self.index:
                        return {"n": self.index[g]}
                    return {"f": "", "id": pid, "dropped": True}
                return {"f": self.ext[v["m_FileID"] - 1], "id": v["m_PathID"]}
            return {k: self.ref(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self.ref(x) for x in v]
        if isinstance(v, float):
            return round(v, 5)
        if isinstance(v, (bytes, bytearray)):
            return None
        return v


def main():
    level, outid = sys.argv[1], sys.argv[2]
    opt = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    root_path, drop = opt.get("--root"), set(filter(None, opt.get("--drop", "").split(",")))
    prefab_ids = [int(x) for x in opt.get("--prefabs", "").split(",") if x]
    out = os.path.join(GAME, "art", outid)
    texdir = os.path.join(GAME, "art", "tex")
    os.makedirs(out, exist_ok=True)
    os.makedirs(texdir, exist_ok=True)

    scene = Tree(level)
    keep = []
    root_g = None
    if prefab_ids:
        for pid in prefab_ids:
            g = scene.owner.get(pid, pid)
            while scene.parent.get(g):
                g = scene.parent[g]
            scene.walk(g, keep)
            log("prefab", pid, "->", scene.T(g)["m_Name"])
    elif root_path:
        parts = root_path.split("/")
        cur = [g for g in scene.roots() if scene.T(g)["m_Name"] == parts[0]]
        for name in parts[1:]:
            cur = [c for g in cur for c in scene.children.get(g, []) if scene.T(c)["m_Name"] == name]
        root_g = cur[0]
        for c in [c for c in scene.children[root_g] if scene.T(c)["m_Name"] in drop]:
            scene.children[root_g].remove(c)
            log("drop child", scene.T(c)["m_Name"])
        scene.walk(root_g, keep)
    else:
        for r in scene.roots():
            if scene.T(r)["m_Name"] in DROP_ROOTS:
                log("drop root", scene.T(r)["m_Name"])
                continue
            scene.walk(r, keep)
    scene.index = {g: i for i, (_, g) in enumerate(keep)}

    prefab_parent = {}
    # Bakery: renderer path id -> (lightmap index, scale/offset)
    lm_of, lm_maps = {}, []
    for pid, o in scene.objs.items():
        if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "ftLightmapsStorage":
            d = mm.read(o)
            lm_maps = d["maps"]
            for r, i, so in zip(d["bakedRenderers"], d["bakedIDs"], d["bakedScaleOffset"]):
                if i >= 0 and r["m_FileID"] == 0:
                    lm_of[r["m_PathID"]] = [i, round(so["x"], 6), round(so["y"], 6), round(so["z"], 6), round(so["w"], 6)]
            log(f"bakery: {len(lm_maps)} maps, {len(lm_of)} lightmapped renderers")

    glb = GLB()
    meshes, mesh_index = [], {}
    materials, mat_index = [], {}
    textures, tex_index = [], {}

    def tex_ref(pptr):
        return tex_ref_obj(pptr.read())

    def tex_ref_obj(t):
        key = (t.object_reader.assets_file.name, t.object_reader.path_id)
        if key in tex_index:
            return tex_index[key]
        name, im = save_texture(t, texdir)
        textures.append({"name": name, "size": list(im.size), "alpha": im.mode == "RGBA"})
        tex_index[key] = len(textures) - 1
        log(f"  tex {name} {im.size[0]}x{im.size[1]} {im.mode}")
        return tex_index[key]

    def mesh_ref(pptr, skinned=False):
        mo = pptr.read()
        key = (mo.object_reader.assets_file.name, mo.object_reader.path_id, skinned)
        if key not in mesh_index:
            try:
                m = read_mesh(mo, skinned)
            except Exception as e:
                log(f"  mesh {mo.m_Name} {key}: unreadable ({e}), node keeps no geometry")
                mesh_index[key] = None
                return None
            glb.mesh(mo.m_Name, m)
            entry = {"name": mo.m_Name, "subs": len(m["subs"]), "verts": len(m["pos"])}
            if "bind" in m:
                entry["bind"] = m["bind"]
            meshes.append(entry)
            mesh_index[key] = len(meshes) - 1
        return mesh_index[key]

    def mat_ref(pptr):
        if pptr.m_PathID == 0:
            return None
        mo = pptr.read()
        key = (mo.object_reader.assets_file.name, mo.object_reader.path_id)
        if key not in mat_index:
            materials.append(material_entry(mo, tex_ref))
            mat_index[key] = len(materials) - 1
        return mat_index[key]

    nodes = []
    counts = {"mesh": 0, "skinned": 0, "mb": 0, "mb_err": 0}
    for tr, g in keep:
        if tr is None:
            nodes.append({"n": g, "p": -1, "a": 0})
            continue
        G = tr.T(g)
        t = tr.T(tr.trans[g])
        par = tr.parent.get(g)
        node = {"n": G["m_Name"], "p": tr.index[par] if par in tr.index else prefab_parent.get((id(tr), g), -1)}
        if not G["m_IsActive"] and g != root_g:
            node["a"] = 0
        lp, lr, ls = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
        if g == root_g:
            lp, lr, ls = {"x": 0, "y": 0, "z": 0}, {"x": 0, "y": 0, "z": 0, "w": 1}, {"x": 1, "y": 1, "z": 1}
        if (lp["x"], lp["y"], lp["z"]) != (0, 0, 0):
            node["t"] = pos(lp)
        if (lr["x"], lr["y"], lr["z"], lr["w"]) != (0, 0, 0, 1):
            node["r"] = quat(lr)
        if (ls["x"], ls["y"], ls["z"]) != (1, 1, 1):
            node["s"] = [round(ls["x"], 5), round(ls["y"], 5), round(ls["z"], 5)]
        if G["m_Layer"]:
            node["layer"] = G["m_Layer"]
        comps = {}
        mf = mr = None
        for c in G["m_Component"]:
            cid = c["component"]["m_PathID"]
            o = tr.objs.get(cid)
            if o is None:
                continue
            ty = o.type.name
            if ty == "MeshFilter":
                mf = o.read()
            elif ty == "MeshRenderer":
                mr = o.read()
                if cid in lm_of:
                    node["lm"] = lm_of[cid]
            elif ty == "SkinnedMeshRenderer":
                sm = o.read()
                if sm.m_Mesh.m_PathID:
                    mi = mesh_ref(sm.m_Mesh, skinned=True)
                    bones = [tr.index.get(tr.owner.get(b.m_PathID)) for b in sm.m_Bones]
                    if mi is not None and "bind" in meshes[mi] and None not in bones:
                        node["sk"] = {"m": mi, "mt": [mat_ref(p) for p in sm.m_Materials], "bones": bones}
                        if not sm.m_Enabled:
                            node["sk"]["ren"] = 0
                        counts["skinned"] += 1
                    else:
                        log(f"  skinned {G['m_Name']}: mesh {mi} bones missing {bones.count(None)} of {len(bones)}")
            elif ty == "MonoBehaviour":
                asm, cls = mm.script(o)
                if cls.startswith(DROP_SCRIPTS):
                    continue
                try:
                    d = mm.read(o)
                except Exception as e:
                    counts["mb_err"] += 1
                    comps.setdefault(cls, []).append({"err": str(e)[:80]})
                    continue
                f = tr.ref({k: v for k, v in d.items() if k not in ("m_GameObject", "m_Script", "m_Name")})
                comps.setdefault(cls, []).append(f)
                counts["mb"] += 1
            elif ty in KEEP_TYPES:
                d = o.read_typetree()
                comps.setdefault(ty, []).append(tr.ref({k: v for k, v in d.items() if k not in ("m_GameObject",)}))
        if mf is not None and mr is not None and mf.m_Mesh.m_PathID:
            mi = mesh_ref(mf.m_Mesh)
            if mi is not None:
                node["m"] = mi
            node["mt"] = [mat_ref(p) for p in mr.m_Materials]
            # Static batching: the mesh is a "Combined Mesh (root: scene)" in world space; this renderer draws only its
            # submesh range, untransformed.
            sb = getattr(mr, "m_StaticBatchInfo", None)
            if sb is not None and sb.subMeshCount:
                node["sb"] = [sb.firstSubMesh, sb.subMeshCount]
            if not mr.m_Enabled:
                node["ren"] = 0
            counts["mesh"] += 1
        if comps:
            node["k"] = {k: (v[0] if len(v) == 1 else v) for k, v in comps.items()}
        nodes.append(node)

    rs = next((o.read_typetree() for o in scene.objs.values() if o.type.name == "RenderSettings"), {})
    lightmaps = []
    for pp in lm_maps:
        t = scene.objs_ext(pp)
        lightmaps.append(tex_ref_obj(t) if t is not None else None)
    out_scene = {"level": level, "lightmaps": lightmaps, "nodes": nodes, "meshes": meshes, "materials": materials, "textures": textures,
                 "render": scene.ref({k: rs.get(k) for k in ("m_AmbientMode", "m_AmbientSkyColor", "m_AmbientEquatorColor",
                                                              "m_AmbientGroundColor", "m_AmbientIntensity", "m_Fog", "m_FogColor",
                                                              "m_FogMode", "m_LinearFogStart", "m_LinearFogEnd", "m_SubtractiveShadowColor")})}
    glb.write(os.path.join(out, "geo.glb"))
    with open(os.path.join(out, "scene.json"), "w", encoding="utf-8") as fh:
        json.dump(out_scene, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "export.log"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(LOG))
    log(f"{level} -> {outid}: nodes {len(nodes)} (of {len(scene.gos)}), meshes {len(meshes)}, materials {len(materials)}, "
        f"textures {len(textures)}, {counts}, geo.glb {os.path.getsize(os.path.join(out, 'geo.glb')) // 1024} KB, "
        f"scene.json {os.path.getsize(os.path.join(out, 'scene.json')) // 1024} KB")


if __name__ == "__main__":
    main()
