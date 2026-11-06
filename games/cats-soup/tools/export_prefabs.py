"""Export Cats&Soup prefabs (Resources paths or file:pathid) for the three.js build.

usage: py -3.12 -I export_prefabs.py <out-id> <root> [<root> ...]
  root = a Resources path from D:/catsoup-ref/resources.json (places/place1, tree/tree0) or <file>:<pathid>
  @list.txt reads roots one per line.

Writes games/cats-soup/art/<out-id>/
  geo.glb      unique meshes, glTF mesh i = scene.meshes[i], one primitive per submesh, node names "m<i>"
  scene.json   {roots: [{key, node}], nodes, meshes, materials, textures}
and games/cats-soup/art/tex/<name>-<md5>.webp (+ .lq.webp 16 px).

Like casual-farm/tools/export_store.py (same axis flip: point (x, y, -z), quaternion (-x, -y, z, w), triangle
(a, c, b)), plus SpriteRenderer: the sprite becomes a quad mesh (rect / pixelsToUnits around the pivot) textured with
the cropped sprite image. Renderer sorting (layer id, order) is kept as "so" because the art is painted 2D and draw
order comes from sorting, not depth.
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np
from PIL import Image
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402

KEEP_TYPES = ("BoxCollider", "BoxCollider2D", "Animator", "Animation", "NavMeshAgent", "AudioSource")
DROP_SCRIPTS = ("UnityEngine.UI.", "TMPro.", "UnityEngine.EventSystems.")
LOG = []
STATES = json.load(open(os.path.join(cns.ROOT, "shaders", "states.json")))


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
        self.j = {"asset": {"version": "2.0", "generator": "cats-soup export_prefabs.py"}, "scene": 0,
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
        if m.get("nrm") is not None:
            attrs["NORMAL"] = self.acc(m["nrm"], "VEC3", 34962)
        if m.get("uv0") is not None:
            attrs["TEXCOORD_0"] = self.acc(m["uv0"], "VEC2", 34962)
        if m.get("col") is not None:
            attrs["COLOR_0"] = self.acc(m["col"], "VEC4", 34962)
        if m.get("joints") is not None:
            attrs["JOINTS_0"] = self.acc(m["joints"], "VEC4", 34962)
            attrs["WEIGHTS_0"] = self.acc(m["weights"], "VEC4", 34962)
        prims = []
        for tri in m["subs"]:
            idx = tri.astype(np.uint16 if len(m["pos"]) < 65536 else np.uint32).reshape(-1)
            if len(idx) == 0:
                idx = np.zeros(3, dtype=np.uint16)
            prims.append({"attributes": attrs, "indices": self.acc(idx, "SCALAR", 34963)})
        self.j["meshes"].append({"name": name, "primitives": prims})
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
        return np.asarray(v, dtype=np.float32).reshape(n, -1)[:, :d].copy()

    nrm = arr(h.m_Normals, 3)
    if nrm is not None:
        nrm[:, 2] *= -1
    uv0 = arr(h.m_UV0, 2)
    if uv0 is not None:
        uv0[:, 1] = 1 - uv0[:, 1]
    col = arr(h.m_Colors, 4)
    subs = []
    idx = h.m_IndexBuffer or []
    for sm in mesh.m_SubMeshes:
        first = sm.firstByte // (2 if h.m_Use16BitIndices else 4)
        tri = np.asarray(idx[first:first + sm.indexCount], dtype=np.int64)
        if sm.topology != 0:
            tri = np.zeros(0, dtype=np.int64)
        tri = tri.reshape(-1, 3) + (sm.baseVertex or 0)
        subs.append(tri[:, [0, 2, 1]])
    r = {"pos": p, "nrm": nrm, "uv0": uv0, "col": col, "subs": subs}
    if skinned and h.m_BoneIndices is not None and len(h.m_BoneIndices) == n:
        ji = np.asarray(h.m_BoneIndices, dtype=np.uint16).reshape(n, -1)
        j = np.zeros((n, 4), dtype=np.uint16)
        j[:, :ji.shape[1]] = ji[:, :4]
        w = np.zeros((n, 4), dtype=np.float32)
        if h.m_BoneWeights is not None and len(h.m_BoneWeights) == n:
            wi = np.asarray(h.m_BoneWeights, dtype=np.float32).reshape(n, -1)
            w[:, :wi.shape[1]] = wi[:, :4]
            bad = (w[:, 3] < 0) | (w[:, 3] > 1)
            w[bad, 3] = np.clip(1 - w[bad, :3].sum(1), 0, 1)
        else:
            w[:, 0] = 1
        r["joints"] = j
        r["weights"] = w / np.maximum(w.sum(1, keepdims=True), 1e-6)
        S = np.diag([1.0, 1.0, -1.0, 1.0])
        binds = []
        for bp in mesh.m_BindPose:
            M = np.array([[bp.e00, bp.e01, bp.e02, bp.e03], [bp.e10, bp.e11, bp.e12, bp.e13],
                          [bp.e20, bp.e21, bp.e22, bp.e23], [bp.e30, bp.e31, bp.e32, bp.e33]])
            binds.append([round(float(x), 6) for x in (S @ M @ S).T.reshape(-1)])
        r["bind"] = binds
    return r


def save_image(im, name, texdir):
    im = im.convert("RGBA")
    if im.getextrema()[3][0] >= 250:
        im = im.convert("RGB")
    stem = f"{name}-{hashlib.md5(im.tobytes()).hexdigest()[:8]}".replace(" ", "_")
    path = os.path.join(texdir, stem + ".webp")
    if not os.path.exists(path):
        im.save(path, "WEBP", quality=90, method=6, lossless=max(im.size) <= 256)
        lq = im.copy()
        lq.thumbnail((16, 16), Image.BILINEAR)
        lq.save(os.path.join(texdir, stem + ".lq.webp"), "WEBP", quality=70)
    return stem, im


def deps(names):
    """Every serialized file the named files reach through externals (Resources prefabs are one file each)."""
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


class Tree:
    def __init__(self, env, name):
        self.name = name
        self.objs = {o.path_id: o for o in env.objects if o.assets_file.name == name}
        self.ext = cns.ext_names(next(iter(self.objs.values())).assets_file)
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

    def T(self, pid):
        if pid not in self.tt:
            self.tt[pid] = self.objs[pid].read_typetree()
        return self.tt[pid]

    def walk(self, g, keep):
        keep.append((self, g))
        for ch in self.children.get(g, []):
            self.walk(ch, keep)

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
                    return {"f": "", "id": pid}
                return {"f": self.ext[v["m_FileID"] - 1], "id": v["m_PathID"]}
            return {k: self.ref(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self.ref(x) for x in v]
        if isinstance(v, float):
            return round(v, 5)
        if isinstance(v, (bytes, bytearray)):
            return None
        return v


def resolve_roots(args):
    res = {}
    for k, f, p in json.load(open(os.path.join(cns.ROOT, "resources.json"))):
        res.setdefault(k, (f, p))
    out = []
    for a in args:
        if a.startswith("@"):
            out += resolve_roots([x.strip() for x in open(a[1:], encoding="utf-8") if x.strip()])
        elif ":" in a and a.split(":")[0] not in res:
            f, p = a.split(":")
            out.append((a, f, int(p)))
        else:
            f, p = res[a]
            out.append((a, f, p))
    return out


def main():
    outid = sys.argv[1]
    roots = resolve_roots(sys.argv[2:])
    out = os.path.join(GAME, "art", outid)
    texdir = os.path.join(GAME, "art", "tex")
    os.makedirs(out, exist_ok=True)
    os.makedirs(texdir, exist_ok=True)
    files = deps(sorted({f for _, f, _ in roots}))
    log(f"{len(roots)} roots, {len(files)} files")
    env = cns.env(*files)
    trees = {}
    keep, root_list = [], []
    for key, f, pid in roots:
        tr = trees.get(f) or trees.setdefault(f, Tree(env, f))
        g = tr.owner.get(pid, pid)
        if g not in tr.gos:
            log(f"root {key}: {f}:{pid} is not a GameObject or component, skipped")
            continue
        while tr.parent.get(g):
            g = tr.parent[g]
        root_list.append({"key": key, "node": len(keep)})
        start = len(keep)
        tr.walk(g, keep)
        for k in range(start, len(keep)):
            tr.index[keep[k][1]] = k
    root_set = {r["node"] for r in root_list}

    glb = GLB()
    meshes, mesh_index = [], {}
    materials, mat_index = [], {}
    textures, tex_index = [], {}

    def tex_from_image(key, im, name):
        if key in tex_index:
            return tex_index[key]
        stem, im = save_image(im, name, texdir)
        textures.append({"name": stem, "size": list(im.size), "alpha": im.mode == "RGBA"})
        tex_index[key] = len(textures) - 1
        return tex_index[key]

    def tex_ref(pptr):
        t = pptr.read()
        key = (t.object_reader.assets_file.name, t.object_reader.path_id)
        if key in tex_index:
            return tex_index[key]
        return tex_from_image(key, t.image, t.m_Name)

    def material_entry(m):
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
                t[k] = tex_ref(st.m_Texture)
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

    def mat_ref(pptr):
        if pptr.m_PathID == 0:
            return None
        try:
            mo = pptr.read()
        except Exception as ex:
            log(f"  material unreadable ({ex})")
            return None
        key = (mo.object_reader.assets_file.name, mo.object_reader.path_id)
        if key not in mat_index:
            materials.append(material_entry(mo))
            mat_index[key] = len(materials) - 1
        return mat_index[key]

    def mesh_ref(pptr, skinned=False):
        mo = pptr.read()
        key = (mo.object_reader.assets_file.name, mo.object_reader.path_id, skinned)
        if key not in mesh_index:
            try:
                m = read_mesh(mo, skinned)
            except Exception as e:
                log(f"  mesh {mo.m_Name}: unreadable ({e})")
                mesh_index[key] = None
                return None
            glb.mesh(mo.m_Name, m)
            entry = {"name": mo.m_Name, "subs": len(m["subs"]), "verts": len(m["pos"])}
            if "bind" in m:
                entry["bind"] = m["bind"]
            meshes.append(entry)
            mesh_index[key] = len(meshes) - 1
        return mesh_index[key]

    def sprite_ref(pptr):
        """Sprite -> (mesh index of a quad in sprite units, texture index of the cropped image)."""
        sp = pptr.read()
        key = (sp.object_reader.assets_file.name, sp.object_reader.path_id, "sprite")
        if key in mesh_index:
            return mesh_index[key]
        try:
            im = sp.image
        except Exception as e:
            log(f"  sprite {sp.m_Name}: unreadable ({e})")
            mesh_index[key] = None
            return None
        ppu = sp.m_PixelsToUnits or 100
        w, h = sp.m_Rect.width / ppu, sp.m_Rect.height / ppu
        px, py = sp.m_Pivot.x, sp.m_Pivot.y
        x0, x1, y0, y1 = -px * w, (1 - px) * w, -py * h, (1 - py) * h
        p = np.array([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], dtype=np.float32)
        uv = np.array([[0, 1], [1, 1], [1, 0], [0, 0]], dtype=np.float32)
        nrm = np.array([[0, 0, 1]] * 4, dtype=np.float32)
        tri = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int64)
        glb.mesh("spr:" + sp.m_Name, {"pos": p, "uv0": uv, "nrm": nrm, "subs": [tri]})
        ti = tex_from_image(key, im, sp.m_Name)
        meshes.append({"name": "spr:" + sp.m_Name, "subs": 1, "verts": 4, "sprite": ti})
        mesh_index[key] = (len(meshes) - 1, ti)
        return mesh_index[key]

    nodes = []
    counts = {"mesh": 0, "skinned": 0, "sprite": 0, "mb": 0, "mb_err": 0, "particles": 0}
    for i, (tr, g) in enumerate(keep):
        G = tr.T(g)
        t = tr.T(tr.trans[g])
        par = tr.parent.get(g)
        node = {"n": G["m_Name"], "p": tr.index[par] if (par in tr.index and i not in root_set) else -1}
        if not G["m_IsActive"]:
            node["a"] = 0
        lp, lr, ls = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
        if i in root_set:
            lp, lr = {"x": 0, "y": 0, "z": 0}, {"x": 0, "y": 0, "z": 0, "w": 1}
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
            elif ty == "SkinnedMeshRenderer":
                sm = o.read()
                if sm.m_Mesh.m_PathID:
                    mi = mesh_ref(sm.m_Mesh, skinned=True)
                    bones = [tr.index.get(tr.owner.get(b.m_PathID)) for b in sm.m_Bones]
                    if mi is not None and "bind" in meshes[mi] and None not in bones:
                        node["sk"] = {"m": mi, "mt": [mat_ref(p) for p in sm.m_Materials], "bones": bones,
                                      "so": [sm.m_SortingLayerID, sm.m_SortingOrder]}
                        if not sm.m_Enabled:
                            node["sk"]["ren"] = 0
                        counts["skinned"] += 1
                    else:
                        log(f"  skinned {G['m_Name']}: mesh {mi} bones missing {bones.count(None)} of {len(bones)}")
            elif ty == "SpriteRenderer":
                sr = o.read()
                if sr.m_Sprite.m_PathID:
                    r = sprite_ref(sr.m_Sprite)
                    if r:
                        col = sr.m_Color
                        node["spr"] = {"m": r[0], "tex": r[1], "mt": [mat_ref(p) for p in sr.m_Materials],
                                       "so": [sr.m_SortingLayerID, sr.m_SortingOrder]}
                        if (col.r, col.g, col.b, col.a) != (1, 1, 1, 1):
                            node["spr"]["c"] = [round(col.r, 4), round(col.g, 4), round(col.b, 4), round(col.a, 4)]
                        if sr.m_FlipX or sr.m_FlipY:
                            node["spr"]["flip"] = [int(sr.m_FlipX), int(sr.m_FlipY)]
                        if not sr.m_Enabled:
                            node["spr"]["ren"] = 0
                        counts["sprite"] += 1
            elif ty == "ParticleSystem":
                counts["particles"] += 1
                node["ps"] = 1
            elif ty == "MonoBehaviour":
                asm, cls = cns.script(o)
                if cls.startswith(DROP_SCRIPTS):
                    continue
                try:
                    d = cns.read(o)
                except Exception as e:
                    counts["mb_err"] += 1
                    comps.setdefault(cls, []).append({"err": str(e)[:80]})
                    continue
                comps.setdefault(cls, []).append(tr.ref({k: v for k, v in d.items() if k not in ("m_GameObject", "m_Script", "m_Name")}))
                counts["mb"] += 1
            elif ty in KEEP_TYPES:
                try:
                    d = o.read_typetree()
                except Exception as e:
                    d = {"err": str(e)[:80]}
                comps.setdefault(ty, []).append(tr.ref({k: v for k, v in d.items() if k not in ("m_GameObject",)}))
        if mf is not None and mr is not None and mf.m_Mesh.m_PathID:
            mi = mesh_ref(mf.m_Mesh)
            if mi is not None:
                node["m"] = mi
            node["mt"] = [mat_ref(p) for p in mr.m_Materials]
            node["so"] = [mr.m_SortingLayerID, mr.m_SortingOrder]
            if not mr.m_Enabled:
                node["ren"] = 0
            counts["mesh"] += 1
        if comps:
            node["k"] = {k: (v[0] if len(v) == 1 else v) for k, v in comps.items()}
        nodes.append(node)

    out_scene = {"roots": root_list, "nodes": nodes, "meshes": meshes, "materials": materials, "textures": textures}
    glb.write(os.path.join(out, "geo.glb"))
    with open(os.path.join(out, "scene.json"), "w", encoding="utf-8") as fh:
        json.dump(out_scene, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "export.log"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(LOG))
    log(f"{outid}: roots {len(root_list)}, nodes {len(nodes)}, meshes {len(meshes)}, materials {len(materials)}, "
        f"textures {len(textures)}, {counts}, geo.glb {os.path.getsize(os.path.join(out, 'geo.glb')) // 1024} KB, "
        f"scene.json {os.path.getsize(os.path.join(out, 'scene.json')) // 1024} KB")


if __name__ == "__main__":
    main()
