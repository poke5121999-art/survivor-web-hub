"""Export the DREDGE player boat (PlayerContainer.prefab) for the three.js remake.

Run:  python -I games/dredge/tools/boat.py [DREDGE_Data dir]
Needs UnityPy 1.25, numpy, Pillow, and D:/dredge-ref/cache/cab_index.json (from index_bundles.py).
Outputs:
  D:/dredge-ref/cache/boat/tree.txt        indented hierarchy: name, active flag, components, MonoBehaviour class
  D:/dredge-ref/cache/boat/typetrees.json  cleaned typetrees of the components copied into data/boat.js
  games/dredge/art/boat/boat.glb           PlayerContainer > Player > Boat1..Boat5 (+ attach points), original
                                           node names, extras.active = prefab active flag, baseColor textures
                                           embedded (<= 512px)
  games/dredge/data/boat.js                window.DR_BOAT (tiers, equipment, lights, colliders, physics, notes)
Coordinates: Unity left-handed -> three.js right-handed by negating Z (positions, vertices, normals),
quaternion (x,y,z,w)->(-x,-y,z,w), triangle winding flipped. Skinned meshes are baked at the prefab
rest pose (no skeleton in the glb).
"""
import sys, os, json, struct, io, re
import numpy as np
import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

sys.stdout.reconfigure(encoding="utf-8")

DATA = sys.argv[1] if len(sys.argv) > 1 else r"D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\DREDGE_Data"
BUNDLE = os.path.join(DATA, "StreamingAssets", "aa", "StandaloneWindows",
                      "player_assets_all_a1328155fcaec70150d1cfa3e265e075.bundle")
CACHE = r"D:\dredge-ref\cache\boat"
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "art", "boat")
DATAJS = os.path.join(ROOT, "data", "boat.js")


def load():
    """Player bundle plus the bundles that hold its external CABs (materials, textures, shaders)."""
    first = UnityPy.load(BUNDLE)
    cab_index = json.load(open(os.path.join(CACHE, "..", "cab_index.json")))
    aa = os.path.dirname(BUNDLE)
    deps = set()
    for f in first.files.values():
        for sf in f.files.values():
            for e in getattr(sf, "externals", []):
                cab = e.path.rsplit("/", 1)[-1].lower()
                if cab in cab_index:
                    deps.add(os.path.join(aa, cab_index[cab]))
    env = UnityPy.load(BUNDLE, *sorted(deps))
    prefab = next(o for p, o in env.container.items() if p.endswith("PlayerContainer.prefab")).read()
    return env, prefab


# ---------------------------------------------------------------- hierarchy helpers

def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ("Transform", "RectTransform"):
            return c.component.read()


def comps_of(go):
    out = []
    for c in go.m_Component:
        try:
            out.append((c.component.type.name, c.component))
        except Exception:
            pass
    return out


def comp_map(go):
    out = {}
    for n, ptr in comps_of(go):
        out.setdefault(n, ptr)
    return out


def mono_name(ptr):
    try:
        return ptr.read().m_Script.read().m_ClassName
    except Exception:
        return "?"


def mono_of(go, cls):
    for n, ptr in comps_of(go):
        if n == "MonoBehaviour" and mono_name(ptr) == cls:
            return ptr
    return None


def children(go):
    return [c.read().m_GameObject.read() for c in transform_of(go).m_Children]


def walk(go, depth=0, path=""):
    """Yield (go, depth, path). Sibling names repeat in this prefab, so identify nodes by path."""
    yield go, depth, path + "/" + go.m_Name
    for c in children(go):
        yield from walk(c, depth + 1, path + "/" + go.m_Name)


def write_tree(prefab):
    lines = []
    for go, d, _ in walk(prefab):
        cs = []
        for n, ptr in comps_of(go):
            if n != "Transform":
                cs.append(mono_name(ptr) if n == "MonoBehaviour" else n)
        lines.append("%s%s [%s] %s" % ("  " * d, go.m_Name, "on" if go.m_IsActive else "off", ", ".join(cs)))
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "tree.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("tree.txt", len(lines), "nodes")


# ---------------------------------------------------------------- math (Unity space until converted)

def trs(t):
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    x, y, z, w = q.x, q.y, q.z, q.w
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * np.array([s.x, s.y, s.z])
    M[:3, 3] = [p.x, p.y, p.z]
    return M


_W = {}


def world(t):
    k = t.object_reader.path_id
    if k not in _W:
        f = t.m_Father
        _W[k] = trs(t) if not f.m_PathID else world(f.read()) @ trs(t)
    return _W[k]


def mat4(m):
    return np.array([[getattr(m, "e%d%d" % (r, c)) for c in range(4)] for r in range(4)])


FZ = np.diag([1.0, 1.0, -1.0, 1.0])


def r5(v, n=5):
    return [round(float(x), n) for x in v]


def quat_from_R(R):
    """Rotation matrix -> (x,y,z,w)."""
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        return [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    i = int(np.argmax(np.diag(R)))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = np.sqrt(R[i, i] - R[j, j] - R[k, k] + 1) * 2
    q = [0, 0, 0, 0]
    q[i] = s / 4
    q[j] = (R[j, i] + R[i, j]) / s
    q[k] = (R[k, i] + R[i, k]) / s
    q[3] = (R[k, j] - R[j, k]) / s
    return q


def pose_in(ref_t, go):
    """Pose of go relative to ref_t, converted to three.js space: {pos, quat, dir (local -Z... = Unity forward)}."""
    M = FZ @ (np.linalg.inv(world(ref_t)) @ world(transform_of(go))) @ FZ
    R = M[:3, :3] / np.linalg.norm(M[:3, :3], axis=0)
    return {"pos": r5(M[:3, 3]), "quat": r5(quat_from_R(R)), "forward": r5(R @ np.array([0, 0, -1.0]), 4)}


# ---------------------------------------------------------------- textures / materials

SKIP_TEX = ("Mask", "CloudShadows", "WaveMask", "Out_0", "Emission", "_Texture_1")
BASE_TEX_PRIORITY = ("_BaseMap", "_MainTex")
# Which mask channel tints with which material colour. The hull shader is compiled Shader Graph (not
# readable), so channels were chosen from the mask layout: blue fills most of the palette (hull),
# red is the top row (roof), green the bottom row (trim). Guess; see notes in boat.js.
TINT = (("r", "_Roof_Color"), ("g", "_Trim1_Color"), ("b", "_Hull_Color"))


def tex_image(ptr):
    t = ptr.read()
    img = t.image.convert("RGBA")
    if max(img.size) > 512:
        k = 512 / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    return t.m_Name, img


def pick_base_tex(sp):
    texs = [(k, e.m_Texture) for k, e in sp.m_TexEnvs if e.m_Texture.m_PathID]
    for want in BASE_TEX_PRIORITY:
        for k, p in texs:
            if k == want:
                return p
    cand = [(k, p) for k, p in texs if not any(s in k for s in SKIP_TEX)]
    # the Shader Graph exposes the albedo under an auto-generated Texture2D_<guid> name
    cand.sort(key=lambda kp: not kp[0].startswith("Texture2D_"))
    return cand[0][1] if cand else None


def bake_hull_tint(img, sp):
    mask_ptr = next((e.m_Texture for k, e in sp.m_TexEnvs if k == "_ColorMask" and e.m_Texture.m_PathID), None)
    if mask_ptr is None:
        return img
    _, mimg = tex_image(mask_ptr)
    if mimg.size != img.size:
        mimg = mimg.resize(img.size, Image.NEAREST)
    cols = {k: (c.r, c.g, c.b) for k, c in sp.m_Colors}
    base = np.asarray(img, dtype=float) / 255.0
    m = np.asarray(mimg, dtype=float)[..., :3] / 255.0
    w = m / np.maximum(m.sum(axis=2, keepdims=True), 1.0)
    tint = np.zeros(base.shape[:2] + (3,))
    for i, (_, cname) in enumerate(TINT):
        tint += w[..., i:i + 1] * np.array(cols.get(cname, (1, 1, 1)))
    out = base.copy()
    # x2: palette greys sit around 0.5, so a plain multiply would halve the hull brightness
    out[..., :3] = np.clip(base[..., :3] * tint * 2.0, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def paint_colors(mm):
    out = {}
    for k, c in mm.m_SavedProperties.m_Colors:
        if k in ("_Hull_Color", "_Roof_Color", "_Trim1_Color", "_Trim2_Color", "_Trim3_Color"):
            out[k[1:-6].lower()] = r5((c.r, c.g, c.b), 4)
    return out


# ---------------------------------------------------------------- glTF writer

class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accs, self.nodes, self.meshes = [], [], [], []
        self.mats, self.texs, self.imgs = [], [], []
        self.mesh_key, self.mat_key, self.img_key = {}, {}, {}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def acc(self, arr, ctype, atype, target=None, minmax=False):
        a = {"bufferView": self.view(arr.tobytes(), target), "componentType": ctype,
             "count": int(arr.shape[0]), "type": atype}
        if minmax:
            a["min"], a["max"] = [float(x) for x in arr.min(axis=0)], [float(x) for x in arr.max(axis=0)]
        self.accs.append(a)
        return len(self.accs) - 1

    def image(self, img):
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        data = buf.getvalue()
        if data not in self.img_key:
            self.imgs.append({"bufferView": self.view(data), "mimeType": "image/png"})
            self.img_key[data] = len(self.imgs) - 1
        return self.img_key[data]

    def texture(self, img, nearest):
        self.texs.append({"source": self.image(img), "sampler": 0 if nearest else 1})
        return len(self.texs) - 1

    def write(self, path, scene_roots):
        gltf = {"asset": {"version": "2.0", "generator": "dredge/tools/boat.py"},
                "scene": 0, "scenes": [{"nodes": scene_roots}], "nodes": self.nodes,
                "meshes": self.meshes, "materials": self.mats,
                "buffers": [{"byteLength": len(self.bin)}], "bufferViews": self.views, "accessors": self.accs}
        if self.texs:
            gltf["textures"], gltf["images"] = self.texs, self.imgs
            # palette textures are tiny colour swatches: filtering would bleed neighbouring swatches
            gltf["samplers"] = [{"magFilter": 9728, "minFilter": 9728, "wrapS": 33071, "wrapT": 33071},
                                {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
        js = json.dumps(gltf, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        binb = bytes(self.bin) + b"\0" * (-len(self.bin) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(binb), 0x004E4942) + binb)


def material_index(g, ptr):
    if not ptr.m_PathID:
        return None
    mm = ptr.read()
    key = mm.object_reader.path_id
    if key in g.mat_key:
        return g.mat_key[key]
    sp = mm.m_SavedProperties
    try:
        shader = mm.m_Shader.read().m_ParsedForm.m_Name
    except Exception:
        shader = "?"
    m = {"name": mm.m_Name, "extras": {"shader": shader},
         "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.8}}
    if "DepthMask" in shader:
        # Invisible water/foam cut-out volumes: kept as nodes, drawn fully transparent.
        m["alphaMode"] = "BLEND"
        m["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 0]
        m["extras"]["mask"] = True
    else:
        tp = pick_base_tex(sp)
        if tp is not None:
            name, img = tex_image(tp)
            if shader.endswith("LitBoat_Shader"):
                img = bake_hull_tint(img, sp)
                m["extras"]["paint"] = paint_colors(mm)
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": g.texture(img, max(img.size) <= 64)}
            m["extras"]["texture"] = name
        if "LightBeam" in shader:
            m["alphaMode"] = "BLEND"
            m["pbrMetallicRoughness"]["baseColorFactor"] = [1, 0.9, 0.7, 0.5]
            m["emissiveFactor"] = [1, 0.9, 0.7]
            m["doubleSided"] = True
        elif "Cutout" in shader:
            m["alphaMode"] = "MASK"
            m["doubleSided"] = True
        elif mm.m_Name in ("Rope_Mat", "Trawl_Mat"):
            m["doubleSided"] = True
        if mm.m_Name == "BoatWindows_Mat":
            m["extras"]["emissiveTexture"] = "SmallBoat_Emission"  # driven by _LightStrength at runtime
    g.mats.append(m)
    g.mat_key[key] = len(g.mats) - 1
    return g.mat_key[key]


# ---------------------------------------------------------------- meshes

def mesh_data(me):
    h = MeshHandler(me)
    h.process()
    def cols(a, k):
        # UnityPy returns flat lists or per-vertex tuples depending on the vertex format
        return np.array(a, dtype=np.float64).reshape(len(V), -1)[:, :k]

    V = np.array(h.m_Vertices, dtype=np.float64).reshape(-1, 3)
    N = cols(h.m_Normals, 3) if h.m_Normals else np.zeros_like(V)
    UV = cols(h.m_UV0, 2) if h.m_UV0 else np.zeros((len(V), 2))
    subs = [np.array(s, dtype=np.int64).reshape(-1, 3) for s in h.get_triangles()]
    return h, V, N, UV, subs


def skin(h, me, bones, smr_inv, V, N):
    """Bake the prefab rest pose into the vertices, expressed in the renderer node's frame."""
    palette = [world(b.read()) @ mat4(bp) if b.m_PathID else None for b, bp in zip(bones, me.m_BindPose)]
    Vo, No = V.copy(), N.copy()
    for i in range(len(V)):
        acc, accn, tw = np.zeros(3), np.zeros(3), 0.0
        for w, bi in zip(h.m_BoneWeights[i], h.m_BoneIndices[i]):
            if w <= 0 or bi >= len(palette) or palette[bi] is None:
                continue
            M = palette[bi]
            acc += w * (M[:3, :3] @ V[i] + M[:3, 3])
            accn += w * (M[:3, :3] @ N[i])
            tw += w
        if tw > 0:
            Vo[i] = smr_inv[:3, :3] @ (acc / tw) + smr_inv[:3, 3]
            No[i] = smr_inv[:3, :3] @ accn
    return Vo, No


def add_mesh(g, key, me, mat_ptrs, skinned=None):
    """-> (mesh index, (min, max) in three space)."""
    if key in g.mesh_key:
        return g.mesh_key[key]
    h, V, N, UV, subs = mesh_data(me)
    if skinned is not None:
        bones, smr_inv = skinned
        if len(me.m_BindPose) and len(bones) == len(me.m_BindPose) and h.m_BoneWeights and h.m_BoneIndices:
            V, N = skin(h, me, bones, smr_inv, V, N)
    V = V * np.array([1, 1, -1])
    N = N * np.array([1, 1, -1])
    n = np.linalg.norm(N, axis=1, keepdims=True)
    N = np.where(n > 1e-9, N / np.maximum(n, 1e-9), np.array([0, 1, 0]))
    UVg = np.stack([UV[:, 0], 1.0 - UV[:, 1]], axis=1)
    pos = g.acc(V.astype("<f4"), 5126, "VEC3", 34962, True)
    nor = g.acc(N.astype("<f4"), 5126, "VEC3", 34962)
    uv = g.acc(UVg.astype("<f4"), 5126, "VEC2", 34962)
    prims = []
    for i, tri in enumerate(subs):
        if not len(tri):
            continue
        idx = g.acc(tri[:, ::-1].reshape(-1, 1).astype("<u4"), 5125, "SCALAR", 34963)
        p = {"attributes": {"POSITION": pos, "NORMAL": nor, "TEXCOORD_0": uv}, "indices": idx}
        if i < len(mat_ptrs):
            mi = material_index(g, mat_ptrs[i])
            if mi is not None:
                p["material"] = mi
        prims.append(p)
    g.meshes.append({"name": me.m_Name, "primitives": prims})
    g.mesh_key[key] = (len(g.meshes) - 1, (V.min(axis=0), V.max(axis=0)))
    return g.mesh_key[key]


def mesh_bounds(ptr):
    """Bounds of a (collider) mesh in three space: {center, size}."""
    h = MeshHandler(ptr.read())
    h.process()
    V = np.array(h.m_Vertices, dtype=float).reshape(-1, 3) * np.array([1, 1, -1])
    lo, hi = V.min(axis=0), V.max(axis=0)
    return {"center": r5((lo + hi) / 2, 4), "size": r5(hi - lo, 4)}


# ---------------------------------------------------------------- export

PLAYER_KEEP = {"ColliderCenter", "BuoyancyEffector1", "BuoyancyEffector2", "BuoyancyEffector3",
               "BuoyancyEffector4", "DevilsSpineMonsterAnchor", "BoatTrailParticles"}
# Particle/line holders worth keeping as empty nodes: they mark where effects attach.
BOAT_KEEP = {"DeployPosition", "ChimneySmoke", "ChimneySmoke1", "ChimneySmoke2", "HullCriticalEffects",
             "WaterVacuumParticles"}


def renderable(go):
    """-> (mesh ptr, [material ptrs], bones or None, renderer enabled) or None."""
    cm = comp_map(go)
    if "SkinnedMeshRenderer" in cm:
        r = cm["SkinnedMeshRenderer"].read()
        if r.m_Mesh.m_PathID:
            return r.m_Mesh, list(r.m_Materials), list(r.m_Bones), bool(r.m_Enabled)
    if "MeshRenderer" in cm and "MeshFilter" in cm:
        r = cm["MeshRenderer"].read()
        mf = cm["MeshFilter"].read()
        if mf.m_Mesh.m_PathID:
            return mf.m_Mesh, list(r.m_Materials), None, bool(r.m_Enabled)
    return None


def wanted(go, keep):
    """Export a node when it draws, lights, marks an attachment point, or leads to one that does."""
    if renderable(go) or "Light" in comp_map(go) or go.m_Name in keep:
        return True
    return any(wanted(c, keep) for c in children(go))


MISSING = []


def emit(g, go, accept, deeper=None):
    t = transform_of(go)
    q = t.m_LocalRotation
    p = t.m_LocalPosition
    node = {"name": go.m_Name,
            "translation": [p.x, p.y, -p.z],
            "rotation": [-q.x, -q.y, q.z, q.w],
            "scale": [t.m_LocalScale.x, t.m_LocalScale.y, t.m_LocalScale.z],
            "extras": {"active": bool(go.m_IsActive)}}
    r = renderable(go)
    me = None
    if r:
        mesh_ptr, mats, bones, enabled = r
        try:
            me = mesh_ptr.read()
        except FileNotFoundError:
            # built-in Unity mesh (unity default resources) is not in any bundle
            MISSING.append(go.m_Name)
            me = None
    if r and me is not None:
        sk = (bones, np.linalg.inv(world(t))) if bones else None
        key = (me.object_reader.path_id, go.object_reader.path_id if sk else 0)
        node["mesh"] = add_mesh(g, key, me, mats, sk)[0]
        if not enabled:
            node["extras"]["rendererDisabled"] = True
        if go.m_Name in ("WaterMask", "FoamMask"):
            node["extras"]["mask"] = True
    if "Light" in comp_map(go):
        node["extras"]["light"] = True
    idx = len(g.nodes)
    g.nodes.append(node)
    kids = [emit(g, c, deeper or accept) for c in children(go) if accept(c)]
    if kids:
        node["children"] = kids
    return idx


def add_damage_meshes(g, boat_go, boat_idx):
    """BoatSubModelToggler swaps the hull mesh by damage state; expose each as an inactive child node."""
    proxy = mono_of(boat_go, "BoatModelProxy").deref().read_typetree()
    hull_mesh = comp_map(boat_go)["MeshFilter"].read().m_Mesh.m_PathID
    mats = renderable(boat_go)[1]
    names = []
    for i, mp in enumerate(proxy["damageStateMeshes"]):
        if mp["m_PathID"] == hull_mesh:
            continue
        ptr = _ptr(boat_go, mp)
        me = ptr.read()
        mi = add_mesh(g, (me.object_reader.path_id, 0), me, mats)[0]
        name = "%s_Damage%d" % (boat_go.m_Name, i)
        g.nodes.append({"name": name, "mesh": mi, "extras": {"active": False, "damageState": i}})
        g.nodes[boat_idx].setdefault("children", []).append(len(g.nodes) - 1)
        names.append(name)
    return names


def _ptr(go, raw):
    """ObjectReader for a typetree {m_FileID, m_PathID} reference into go's own file."""
    return go.assets_file.objects[raw["m_PathID"]]


# ---------------------------------------------------------------- data (boat.js)

def clean(tt):
    """Typetree -> plain JSON: drop object references and bookkeeping, round floats."""
    if isinstance(tt, dict):
        if set(tt) == {"m_FileID", "m_PathID"}:
            return None
        out = {}
        for k, v in tt.items():
            if k in ("m_GameObject", "m_Script", "serializationData", "m_ObjectHideFlags", "m_Enabled") \
                    or (k == "m_Name" and v == ""):
                continue
            c = clean(v)
            if c is not None and c != [] or isinstance(v, list) and v == []:
                out[k] = c
        return out
    if isinstance(tt, list):
        return [x for x in (clean(v) for v in tt) if x is not None]
    if isinstance(tt, float):
        return round(tt, 5)
    return tt


def go_of(ptr):
    o = ptr.read()
    return o if ptr.type.name == "GameObject" else o.m_GameObject.read()


def rel_path(go, tier_go):
    names = []
    t = transform_of(go)
    tier_id = transform_of(tier_go).object_reader.path_id
    while t.object_reader.path_id != tier_id:
        names.append(t.m_GameObject.read().m_Name)
        t = t.m_Father.read()
    return "/".join(reversed(names))


COSMETIC = [  # (kind, regex on the path relative to the tier node)
    ("fishInTrawl", r"^TrawlNet/.*/Fish/Fish\d+$"),
    ("salvageInNet", r"^SalvageNet/.*/Salvage/Salvage\d+$"),
    ("tyreFenders", r"^TyreFender[^/]*$"),
    ("lantern", r"^HangingLantern$"),
    ("ropes", r"^HangingRopes$"),
    ("flag", r"^FlagAccessory$"),
    ("bunting", r"^BuntingAccessory$"),
    ("propeller", r"^SteeringAnimator/(propeller|rudder)\d*$"),
    ("chimney", r"^ChimneySmoke\d*$"),
    ("waterMask", r"^(WaterMask|FoamMask)$"),
]
SUBTYPE = {4: "rod", 1024: "dredge", 128: "light", 512: "net"}
NETTYPE = {0: "trawl", 1: "ironhaven", 2: "salvage"}  # NetType enum order, see NetType.cs / Net.netType


def tier_info(prefab, boat_go, damage_nodes):
    tier_t = transform_of(boat_go)
    toggler = mono_of(boat_go, "BoatSubModelToggler").deref().read_typetree()
    proxy = mono_of(boat_go, "BoatModelProxy").deref().read_typetree()
    ptr = lambda raw: _ptr(boat_go, raw)
    rel = lambda raw: rel_path(go_of(ptr(raw)), boat_go)
    eq = {}
    for cfg in toggler["subModelConfigs"]:
        kind = SUBTYPE.get(cfg["itemSubtype"], "subtype%d" % cfg["itemSubtype"])
        if kind == "net":
            continue
        eq[kind] = {"nodes": [rel(x) for x in cfg["gameObjects"]], "showDamagedItems": bool(cfg["showDamagedItems"])}
    eq["advancedLights"] = [rel(x) for x in toggler["advancedLightModels"]]
    eq["fishContainers"] = [rel(x) for x in toggler["fishContainers"]]
    eq["icebreaker"] = [rel(toggler["icebreaker"])]
    eq["hullCriticalEffects"] = [rel(toggler["hullCriticalEffects"])]
    nets = {}
    attach = {"DeployPosition": rel(proxy["deployPosition"]) if proxy["deployPosition"]["m_PathID"] else None}
    paths = {}
    for go, _, _ in walk(boat_go):
        if go.object_reader.path_id == boat_go.object_reader.path_id:
            continue
        paths[rel_path(go, boat_go)] = go
    for path, go in paths.items():
        mb = mono_of(go, "Net")
        if mb is not None:
            nets[NETTYPE.get(mb.deref().read_typetree()["netType"], "net")] = path
        for kind, rx in COSMETIC:
            if re.match(rx, path):
                eq.setdefault(kind, []).append(path)
    eq["net"] = nets
    pose = {}
    for key, raw in (("DeployPosition", proxy["deployPosition"]), ("ChimneySmoke", proxy["chimneySmoke"])):
        if raw["m_PathID"]:
            pose[key] = dict(node=rel(raw), **pose_in(tier_t, go_of(ptr(raw))))
    for path, go in paths.items():
        if go.m_Name in ("SteeringAnimator", "propeller", "rudder", "propeller2", "rudder2", "HullCriticalEffects",
                         "WaterVacuumParticles") or go.m_Name.startswith("ChimneySmoke"):
            pose[path] = pose_in(tier_t, go)
    lights = []
    for path, go in paths.items():
        if "Light" not in comp_map(go):
            continue
        L = comp_map(go)["Light"].deref().read_typetree()
        holder = None
        for anc in (path.rsplit("/", 2)[0], path.rsplit("/", 1)[0]):
            if anc in paths:
                for cls in ("FixedPlayerLight", "VariablePlayerLight"):
                    mb = mono_of(paths[anc], cls)
                    if mb is not None:
                        holder = dict(clean(mb.deref().read_typetree()), cls=cls, node=anc)
        lights.append({"node": go.m_Name, "path": path,
                       "type": {0: "spot", 1: "directional", 2: "point"}.get(L["m_Type"], str(L["m_Type"])),
                       "color": r5((L["m_Color"]["r"], L["m_Color"]["g"], L["m_Color"]["b"]), 4),
                       "range": round(L["m_Range"], 4), "intensity": round(L["m_Intensity"], 4),
                       "spotAngle": round(L["m_SpotAngle"], 3), "innerSpotAngle": round(L["m_InnerSpotAngle"], 3),
                       "shadows": L["m_Shadows"]["m_Type"], "pose": pose_in(tier_t, go),
                       "playerLight": holder})
    beams = [rel(x) for x in proxy["lightBeams"]]
    mc = comp_map(boat_go)["MeshCollider"].deref().read_typetree()
    return {"equipment": eq, "lights": lights, "lightBeams": beams, "attach": pose,
            "damageNodes": damage_nodes, "deployPosition": attach["DeployPosition"],
            "meshCollider": dict(mesh_bounds(_ptr(boat_go, mc["m_Mesh"])), convex=bool(mc["m_Convex"]),
                                 isTrigger=bool(mc["m_IsTrigger"]))}


def comp_tt(go, cls=None, native=None):
    if native:
        return clean(comp_map(go)[native].deref().read_typetree())
    return clean(mono_of(go, cls).deref().read_typetree())


def find_go(prefab, name, path_prefix=None):
    for go, _, p in walk(prefab):
        if go.m_Name == name and (path_prefix is None or p.startswith(path_prefix)):
            return go


def physics(prefab):
    player = find_go(prefab, "Player")
    out = {"rigidbody": comp_tt(player, native="Rigidbody"),
           "playerCollider": comp_tt(player, "PlayerCollider"),
           "controller": comp_tt(player, "PlayerController"),
           "buoyantObject": comp_tt(player, "BuoyantObject"),
           "player": comp_tt(player, "Player")}
    # Unity does not serialize Rigidbody.centerOfMass unless set; ColliderCenter is the nearest authored point.
    cc = find_go(prefab, "ColliderCenter")
    out["rigidbody"]["colliderCenter"] = pose_in(transform_of(player), cc)
    vcam = find_go(prefab, "Player VCam")
    out["camera"] = comp_tt(vcam, "PlayerCamera")
    cine = {}
    for go, _, p in walk(vcam):
        key = p.split("/Player VCam", 1)[-1].lstrip("/") or "Player VCam"
        for n, ptr in comps_of(go):
            if n == "MonoBehaviour" and mono_name(ptr).startswith("Cinemachine") and mono_name(ptr) not in (
                    "CinemachinePipeline", "CinemachineImpulseListener", "CinemachineVolumeSettings",
                    "CinemachineFreeLookInputProvider"):
                cine.setdefault(key, {})[mono_name(ptr)] = clean(ptr.deref().read_typetree())
            if n == "MonoBehaviour" and mono_name(ptr) == "CinemachineVirtualCamera":
                pass
    out["cinemachine"] = cine
    # PlayerController serializes only the Rigidbody; defaultDrag is captured from rb.drag at Awake.
    out["controller"] = {"defaultDrag": out["rigidbody"]["m_Drag"], "movementBlockedDrag": 3.0,
                         "source": "PlayerController.cs:59,105 (3.0 is a code constant)"}
    ab = find_go(prefab, "Abilities")
    out["abilities"] = {}
    for c in children(ab):
        for cls in ("BoostAbility", "LightAbility", "SpyglassAbility", "FoghornAbility", "TrawlNetAbility",
                    "BaitAbility", "DeployPotAbility"):
            mb = mono_of(c, cls)
            if mb is not None:
                out["abilities"][cls] = clean(mb.deref().read_typetree())
    return out


def write_js(obj):
    os.makedirs(os.path.dirname(DATAJS), exist_ok=True)
    with open(DATAJS, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Generated by games/dredge/tools/boat.py from PlayerContainer.prefab. Do not edit.\n")
        f.write("window.DR_BOAT = " + json.dumps(obj, indent=1, ensure_ascii=False) + ";\n")


NOTES = [
    "Hull tier N shows node BoatN (Player.AdjustHullToTier: index = min(5, tier) - 1); the other four are hidden.",
    "Node names repeat across tiers (Light0, FishingRod1, ...): every name below is a path relative to the tier node, join with '/'. Resolve with tierNode.getObjectByName chain or a path walk.",
    "glb node extras.active is the prefab active flag (default visibility); extras.rendererDisabled, extras.mask (WaterMask/FoamMask are invisible depth-mask volumes), extras.light, extras.damageState.",
    "BoatSubModelToggler: for each equipment kind with k installed items the first k nodes of the list are shown. light: Light1 (spot + beams), Light2; advancedLights replaces the visible light models once the lights-advanced ability is owned. fishContainers: ceil(n * inventory fill) containers shown.",
    "net: exactly one of trawl / ironhaven / salvage is active (tir-net1 -> siphon = ironhaven, tir-net2 -> material = salvage, otherwise regular trawl); none when no net is equipped. Their skins are baked at rest pose, the trawl animation is not exported.",
    "Hull mesh damage: BoatN_Damage<i> nodes are the damageStateMeshes (i = index, 0 is the intact hull); toggle by damaged slots (ceil(slots/2), last one = DamageThreshold + hullCriticalEffects).",
    "Light0 is a point light always on (fixedIntensity/fixedRange apply); Light1/Light2 spot intensity at runtime = lumens * lumensIntensityCoefficient from the equipped LightItemData.",
    "Hull textures are 16x16 palette swatches tinted at runtime by _ColorMask and Hull/Roof/Trim colours (PlayerColorCustomizer). The glb bakes the prefab colours with a guessed channel mapping (blue=hull, red=roof, green=trim1); paint colours are in each hull material's extras.paint.",
    "There is no fisherman figure in PlayerContainer.prefab (DREDGE shows no character on the boat); no skeleton or animation is exported.",
    "Colliders: only convex MeshColliders exist (Player root = trigger, BoatN = solid) plus sphere triggers on child detectors; sizes are bounds of those meshes.",
    "physics.* values are raw serialized Unity values (cinemachine m_FollowOffset etc. keep Unity z; negate z for three.js). Rigidbody.centerOfMass is not serialized (Unity default = collider centre); playerAttach.ColliderCenter is the authored point. Ability and rig references to other objects are dropped.",
    "Unity forward is +Z. Exported to three.js by Z negation, so the bow ends up toward -Z in three space where Unity forward was +Z; `forward` vectors are already in three space.",
]


def main():
    env, prefab = load()
    write_tree(prefab)
    os.makedirs(ART, exist_ok=True)
    player = find_go(prefab, "Player")
    boats = sorted((c for c in children(player) if re.match(r"Boat\d+$", c.m_Name)), key=lambda c: int(c.m_Name[4:]))

    g = GLB()
    g.nodes.append({"name": prefab.m_Name, "extras": {"active": True}})
    p_idx = emit(g, player, lambda c: re.match(r"Boat\d+$", c.m_Name) or c.m_Name in PLAYER_KEEP,
                 lambda c: wanted(c, BOAT_KEEP))
    g.nodes[0]["children"] = [p_idx]
    bidx = {g.nodes[i]["name"]: i for i in g.nodes[p_idx]["children"]}

    tiers, tier_eq, lights, colliders = [], {}, [], {}
    for n, b in enumerate(boats, 1):
        dmg = add_damage_meshes(g, b, bidx[b.m_Name])
        ti = tier_info(prefab, b, dmg)
        mats = renderable(b)[1]
        paint = paint_colors(mats[0].read()) if mats else {}
        tiers.append({"name": b.m_Name, "tier": n, "nodes": [b.m_Name], "damageNodes": dmg, "paint": paint,
                      "deployPosition": ti["deployPosition"], "lightBeams": ti["lightBeams"],
                      "attach": ti["attach"], "hullBounds": None})
        tier_eq[b.m_Name] = ti["equipment"]
        for L in ti["lights"]:
            lights.append(dict(L, tier=n, tierNode=b.m_Name))
        colliders[b.m_Name] = ti["meshCollider"]
    # hull bounds from the exported hull mesh
    for t, b in zip(tiers, boats):
        t["hullBounds"] = {"min": r5(g.mesh_key[(comp_map(b)["MeshFilter"].read().m_Mesh.m_PathID, 0)][1][0], 3),
                           "max": r5(g.mesh_key[(comp_map(b)["MeshFilter"].read().m_Mesh.m_PathID, 0)][1][1], 3)}

    union = {}
    for b in boats:
        for kind, v in tier_eq[b.m_Name].items():
            lst = v["nodes"] if isinstance(v, dict) and "nodes" in v else (list(v.values()) if isinstance(v, dict) else v)
            u = union.setdefault(kind, [])
            u.extend(x for x in lst if x not in u)

    pl = transform_of(player)
    spheres, seen = [], set()
    for go, _, p in walk(player):
        if "SphereCollider" in comp_map(go) and go is not player:
            sc = comp_map(go)["SphereCollider"].deref().read_typetree()
            c = sc["m_Center"]
            sig = (go.m_Name, sc["m_Radius"], c["x"], c["y"], c["z"])
            if sig in seen:  # same detector repeated under every hull tier
                continue
            seen.add(sig)
            spheres.append({"node": go.m_Name, "trigger": bool(sc["m_IsTrigger"]), "radius": round(sc["m_Radius"], 4),
                            "center": [round(c["x"], 4), round(c["y"], 4), round(-c["z"], 4)],
                            "localScale": r5(np.linalg.norm(world(transform_of(go))[:3, :3], axis=0), 3)})
    pc = comp_map(player)["MeshCollider"].deref().read_typetree()
    ccpose = {}
    for name in PLAYER_KEEP:
        go = find_go(prefab, name)
        ccpose[name] = pose_in(pl, go)
    colliders_out = {"player": dict(mesh_bounds(_ptr(player, pc["m_Mesh"])), isTrigger=bool(pc["m_IsTrigger"]),
                                    convex=bool(pc["m_Convex"])),
                     "tiers": colliders, "spheres": spheres}
    phys = physics(prefab)
    json.dump(phys, open(os.path.join(CACHE, "typetrees.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    g.write(os.path.join(ART, "boat.glb"), [0])
    obj = {"tiers": tiers, "equipment": union, "tierEquipment": tier_eq,
           "lights": lights, "colliderSize": colliders_out, "playerAttach": ccpose,
           "physics": phys, "glb": "art/boat/boat.glb", "notes": NOTES}
    write_js(obj)
    print("missing built-in meshes:", MISSING)
    print("glb", os.path.getsize(os.path.join(ART, "boat.glb")), "bytes;", len(g.nodes), "nodes,",
          len(g.meshes), "meshes,", len(g.mats), "materials,", len(g.imgs), "images")


if __name__ == "__main__":
    main()
