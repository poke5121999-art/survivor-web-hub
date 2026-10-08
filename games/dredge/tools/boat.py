"""Export the DREDGE player boat (PlayerContainer.prefab) for the three.js remake.

Run:  python -I games/dredge/tools/boat.py [DREDGE_Data dir]
Needs UnityPy 1.25, numpy, Pillow, and D:/dredge-ref/cache/cab_index.json (from index_bundles.py).
Outputs:
  D:/dredge-ref/cache/boat/tree.txt        indented hierarchy: name, active flag, components, MonoBehaviour class
  D:/dredge-ref/cache/boat/typetrees.json  cleaned typetrees of the components copied into data/boat.js
  games/dredge/art/boat/boat.glb           PlayerContainer > Player > Boat1..Boat5 (+ attach points), original
                                           node names, extras.active = prefab active flag, baseColor textures
                                           embedded (<= 512px)
  games/dredge/data/boat.js                window.DR_BOAT (tiers, equipment, lights, colliders, physics, notes,
                                           abilityUI = ability bar / radial / spyglass UI read from Game.unity)
  games/dredge/art/ui/abilities/*.webp     control glyphs the ability UI shows (E key, right mouse button)
Coordinates: Unity left-handed -> three.js right-handed by negating Z (positions, vertices, normals),
quaternion (x,y,z,w)->(-x,-y,z,w), triangle winding flipped. Skinned meshes are baked at the prefab
rest pose (no skeleton in the glb).
Light beams: Light1Container/Beam1, Beam2 (+ BackFace) use Unity's built-in Quad (fileID 10210 in
"unity default resources", in no bundle). The prefab carries a copy of that Quad inside a PolybrushMesh
(Beam1/BackFace m_PolyMesh, m_OriginalMeshObject = 10210); this tool uses it for every Quad reference.
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
AA = os.path.join(DATA, "StreamingAssets", "aa", "StandaloneWindows")
SCENE_BUNDLE = os.path.join(AA, "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle")
CATALOG = os.path.join(DATA, "StreamingAssets", "aa", "catalog.json")
RIPPED = r"D:\dredge-ref\ripped\ExportedProject\Assets"
CACHE = r"D:\dredge-ref\cache\boat"
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "art", "boat")
UI_ART = os.path.join(ROOT, "art", "ui", "abilities")
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


def load_with_deps(bundle):
    """A bundle plus every bundle that holds one of its external CABs (one level, like load())."""
    cab_index = json.load(open(os.path.join(CACHE, "..", "cab_index.json")))
    deps = set()
    for f in UnityPy.load(bundle).files.values():
        for sf in getattr(f, "files", {}).values():
            for e in getattr(sf, "externals", []):
                cab = e.path.rsplit("/", 1)[-1].lower()
                if cab in cab_index and os.path.join(AA, cab_index[cab]) != bundle:
                    deps.add(os.path.join(AA, cab_index[cab]))
    return UnityPy.load(bundle, *sorted(deps))


_GUIDS = None


def guid_path(guid):
    """Addressables AssetReference guid -> asset path (catalog.json, same decoding as tools/data.py)."""
    global _GUIDS
    if _GUIDS is None:
        import base64
        d = json.load(open(CATALOG, encoding="utf-8"))
        kd, bd, ed = (base64.b64decode(d[k]) for k in ("m_KeyDataString", "m_BucketDataString", "m_EntryDataString"))
        nb = struct.unpack_from("<i", bd, 0)[0]
        p, keys, buckets = 4, [], []
        for _ in range(nb):
            ko, ne = struct.unpack_from("<ii", bd, p)
            buckets.append(struct.unpack_from("<%di" % ne, bd, p + 8))
            p += 8 + 4 * ne
            t = kd[ko]
            if t in (0, 1):
                n = struct.unpack_from("<i", kd, ko + 1)[0]
                keys.append(kd[ko + 5:ko + 5 + n].decode("ascii" if t == 0 else "utf-16-le"))
            else:
                keys.append(None)
        ne = struct.unpack_from("<i", ed, 0)[0]
        entries = [struct.unpack_from("<7i", ed, 4 + 28 * i) for i in range(ne)]
        _GUIDS = {}
        for k, b in zip(keys, buckets):
            if isinstance(k, str) and re.fullmatch(r"[0-9a-f]{32}", k) and b:
                _GUIDS[k] = d["m_InternalIds"][entries[b[0]][0]]
    return _GUIDS.get(guid)


def clip_name(path):
    """'Assets/Audio/SFX/Ability/Haste - Kickoff.wav' -> 'Haste - Kickoff' (DRAudio resolves the orig name)."""
    return os.path.splitext(path.rsplit("/", 1)[-1])[0] if path else None


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
            # LightBeam_Shader (Shader Graph): colour = tex.rgb * Color, alpha = fresnel^FadeSmoothness * tex.a * Opacity.
            # Single sided (_Cull 2 = Back): each beam quad has a BackFace child quad turned 180 degrees.
            fl = {k: v for k, v in sp.m_Floats}
            cl = {k: c for k, c in sp.m_Colors}
            col = cl.get("Color_A824354B")
            m["alphaMode"] = "BLEND"
            m["extras"]["lightBeam"] = {
                "opacity": round(fl.get("Vector1_9CBD1346", 1.0), 5),
                "fade": round(fl.get("Vector1_B072A672", 2.0), 5),
                "color": r5((col.r, col.g, col.b, col.a), 5) if col else [1, 1, 1, 0],
                "flashes": bool(fl.get("_FLASHES", 0)), "fadeAtWater": bool(fl.get("_FADEATWATER", 0)),
                "fadeWhenNear": bool(fl.get("_FADEWHENNEAR", 0))}
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


class RawMesh:
    """Mesh given as arrays (Unity space): a PolybrushMesh m_PolyMesh or a built-in mesh copied from one."""

    def __init__(self, name, V, N, UV, subs):
        self.m_Name, self.V, self.N, self.UV, self.subs = name, V, N, UV, subs


def poly_mesh(tt):
    """PolybrushMesh typetree -> RawMesh (vertices, normals, uv0, m_SubMeshes[].m_Indexes)."""
    pm = tt["m_PolyMesh"]
    V = np.array([[v["x"], v["y"], v["z"]] for v in pm["vertices"]], dtype=np.float64)
    N = np.array([[v["x"], v["y"], v["z"]] for v in pm["normals"]], dtype=np.float64) if pm["normals"] else np.zeros_like(V)
    UV = np.array([[v["x"], v["y"]] for v in pm["uv0"]], dtype=np.float64) if pm["uv0"] else np.zeros((len(V), 2))
    subs = [np.array(s["m_Indexes"], dtype=np.int64).reshape(-1, 3) for s in pm["m_SubMeshes"]] or \
        [np.array(pm["m_Triangles"], dtype=np.int64).reshape(-1, 3)]
    return RawMesh(pm["name"], V, N, UV, subs)


BUILTIN = {}  # fileID in "unity default resources" -> RawMesh (found in the prefab, see find_builtin_quad)


def find_builtin_quad(prefab):
    """The prefab keeps a copy of Unity's built-in Quad (fileID 10210) in a PolybrushMesh whose
    m_OriginalMeshObject points at it (Light1Container/Beam1/BackFace)."""
    for go, _, _ in walk(prefab):
        mb = mono_of(go, "PolybrushMesh")
        if mb is None:
            continue
        tt = mb.deref().read_typetree()
        if tt["m_OriginalMeshObject"]["m_PathID"] == 10210 and tt["m_PolyMesh"]["name"] == "Quad":
            BUILTIN[10210] = poly_mesh(tt)
            return


def write_mesh(g, key, name, V, N, UV, subs, mat_ptrs):
    """Unity-space arrays -> glTF mesh. -> (mesh index, (min, max) in three space)."""
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
    g.meshes.append({"name": name, "primitives": prims})
    g.mesh_key[key] = (len(g.meshes) - 1, (V.min(axis=0), V.max(axis=0)))
    return g.mesh_key[key]


def add_mesh(g, key, me, mat_ptrs, skinned=None):
    """-> (mesh index, (min, max) in three space)."""
    if key in g.mesh_key:
        return g.mesh_key[key]
    if isinstance(me, RawMesh):
        return write_mesh(g, key, me.m_Name, me.V, me.N, me.UV, me.subs, mat_ptrs)
    h, V, N, UV, subs = mesh_data(me)
    if skinned is not None:
        bones, smr_inv = skinned
        if len(me.m_BindPose) and len(bones) == len(me.m_BindPose) and h.m_BoneWeights and h.m_BoneIndices:
            V, N = skin(h, me, bones, smr_inv, V, N)
    return write_mesh(g, key, me.m_Name, V, N, UV, subs, mat_ptrs)


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
        # PolybrushMesh builds the MeshFilter mesh at runtime from its own copy (m_Mesh is empty in the build)
        pb = mono_of(go, "PolybrushMesh")
        if pb is not None:
            return poly_mesh(pb.deref().read_typetree()), list(r.m_Materials), None, bool(r.m_Enabled)
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
        if isinstance(mesh_ptr, RawMesh):
            me = mesh_ptr
        else:
            try:
                me = mesh_ptr.read()
            except FileNotFoundError:
                # built-in Unity mesh (unity default resources) is not in any bundle; Quad is recovered from the prefab
                me = BUILTIN.get(mesh_ptr.m_PathID)
                if me is None:
                    MISSING.append(go.m_Name)
    if r and me is not None:
        sk = (bones, np.linalg.inv(world(t))) if bones else None
        if isinstance(me, RawMesh):
            key = ("raw", me.m_Name, tuple(me.V.round(6).ravel()), tuple(m.m_PathID for m in mats))
        else:
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
    # BoatModelProxy.lights: the containers LightAbility switches on (Light0Container, Light1Container, ...)
    containers = [rel(x) for x in proxy["lights"]]
    mc = comp_map(boat_go)["MeshCollider"].deref().read_typetree()
    return {"equipment": eq, "lights": lights, "lightBeams": beams, "lightContainers": containers, "attach": pose,
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
    out["abilities"], out["abilityAudio"] = {}, {}
    for c in children(ab):
        for cls in ABILITY_CLASSES:
            mb = mono_of(c, cls)
            if mb is not None:
                out["abilities"][cls] = clean(mb.deref().read_typetree())
                out["abilityAudio"][cls] = ability_audio(c, mb)
    # PlayerTeleport (Manifest) sits next to Abilities, under Player
    pt = find_go(prefab, "PlayerTeleport")
    if pt is not None:
        out["abilities"]["PlayerTeleport"] = comp_tt(pt, "PlayerTeleport")
    out["spyglassCam"] = spyglass_cam(prefab, find_go(prefab, "SpyglassVCam"))
    return out


ABILITY_CLASSES = ("BoostAbility", "LightAbility", "SpyglassAbility", "FoghornAbility", "TrawlNetAbility",
                   "BaitAbility", "DeployPotAbility", "BanishAbility", "AtrophyAbility", "TeleportAbility",
                   "CameraAbility")
ENV = None  # set in main(): resolves PPtrs that point into another CAB of the loaded bundles


def deref_raw(obj_reader, raw, env=None):
    """Typetree PPtr {m_FileID, m_PathID} seen from obj_reader -> ObjectReader or None."""
    if not raw or not raw.get("m_PathID"):
        return None
    sf = obj_reader.assets_file
    if raw["m_FileID"] == 0:
        return sf.objects.get(raw["m_PathID"])
    cab = sf.externals[raw["m_FileID"] - 1].path.rsplit("/", 1)[-1].lower()
    for f in (env or ENV).files.values():
        for name, sub in getattr(f, "files", {}).items():
            if name.lower() == cab:
                return sub.objects.get(raw["m_PathID"])
    return None


def ability_audio(go, mb):
    """Clip names an ability plays: AudioClip fields, AssetReference fields (Addressables guid -> path)
    and the AudioSources under the ability node (volume, pitch, loop as authored)."""
    rd = mb.deref()
    tt = rd.read_typetree()
    fields = {}

    def clip_of(raw):
        o = deref_raw(rd, raw)
        return o.read().m_Name if o is not None and o.type.name == "AudioClip" else None

    for k, v in tt.items():
        if isinstance(v, dict) and set(v) == {"m_FileID", "m_PathID"}:
            n = clip_of(v)
            if n:
                fields[k] = n
        elif isinstance(v, list) and v and isinstance(v[0], dict) and set(v[0]) == {"m_FileID", "m_PathID"}:
            names = [clip_of(x) for x in v]
            if any(names):
                fields[k] = names
        elif isinstance(v, dict) and "m_AssetGUID" in v and v["m_AssetGUID"]:
            fields[k] = clip_name(guid_path(v["m_AssetGUID"]))
    sources = []
    for g2, _, p in walk(go):
        for n, ptr in comps_of(g2):
            if n != "AudioSource":
                continue
            a = ptr.deref().read_typetree()
            o = deref_raw(ptr.deref(), a["m_audioClip"])
            sources.append({"node": g2.m_Name, "clip": o.read().m_Name if o is not None else None,
                            "volume": round(a["m_Volume"], 4), "pitch": round(a["m_Pitch"], 4), "loop": bool(a["Loop"]),
                            "minDistance": round(a["MinDistance"], 3), "maxDistance": round(a["MaxDistance"], 3),
                            "rolloffMode": a["rolloffMode"]})
    return {"fields": fields, "sources": sources}


def spyglass_cam(prefab, vgo):
    """SpyglassVCam: lens, POV axes, transposer follow offset, sensitivity (SpyglassCameraSensitivitySettingResponder)."""
    if vgo is None:
        return None
    vc = comp_tt(vgo, "CinemachineVirtualCamera")
    sens = comp_tt(vgo, "SpyglassCameraSensitivitySettingResponder")
    out = {"lens": vc["m_Lens"], "priority": vc.get("m_Priority"),
           "sensitivity": {"baseSensitivityX": sens["baseSensitivityX"], "baseSensitivityY": sens["baseSensitivityY"]},
           "pose": pose_in(transform_of(find_go(prefab, "Player")), vgo)}
    for c in children(vgo):
        for cls in ("CinemachinePOV", "CinemachineTransposer"):
            mb = mono_of(c, cls)
            if mb is not None:
                out[cls] = clean(mb.deref().read_typetree())
    return out


# ---------------------------------------------------------------- ability UI (Game.unity, gamescene bundle)
# AssetRipper writes the AbilityRadial component of Game.unity as an empty block (no abilityWedges, no SFX);
# the bundle typetree has every field, so the UI is read here with UnityPy.

UI_ROOTS = (("ActiveAbility", "AbilityBarUI"), ("AbilityRadial", "AbilityRadial"), ("SpyglassUI", "SpyglassUI"))


class SceneUI:
    def __init__(self):
        self.env = load_with_deps(SCENE_BUNDLE)
        files = {}
        for o in self.env.objects:
            files.setdefault(o.assets_file.name, {})[o.path_id] = o
        self.main = max((k for k in files if not k.endswith(".sharedAssets")), key=lambda k: len(files[k]))
        self.objs = files[self.main]
        self._cls = {}

    def deref(self, rd, raw):
        return deref_raw(rd, raw, self.env)

    def cls(self, rd, tt):
        key = (tt["m_Script"]["m_FileID"], tt["m_Script"]["m_PathID"])
        if key not in self._cls:
            o = self.deref(rd, tt["m_Script"])
            try:
                self._cls[key] = o.read().m_ClassName if o is not None else None
            except Exception:
                self._cls[key] = None
        name = self._cls[key]
        if name:
            return name
        if "m_FillMethod" in tt:  # UnityEngine.UI scripts live in a CAB no bundle carries
            return "Image"
        if "m_text" in tt:
            return "TextMeshProUGUI"
        return "?"

    def name(self, rd, raw):
        o = self.deref(rd, raw)
        if o is None:
            return None
        try:
            return o.read_typetree().get("m_Name")
        except Exception:
            return None

    @staticmethod
    def script_fields(t):
        """Serialized values of a custom script: numbers, Colors as [r,g,b,a], RectOffset (layout padding)
        as [left, right, top, bottom]. Object references and AssetReferences are left out."""
        sc = {}
        for k, v in t.items():
            if k == "m_Enabled" or isinstance(v, bool):
                continue
            if isinstance(v, (int, float)):
                sc[k] = round(v, 4) if isinstance(v, float) else v
            elif isinstance(v, dict) and set(v) == {"r", "g", "b", "a"}:
                sc[k] = r5((v["r"], v["g"], v["b"], v["a"]), 4)
            elif isinstance(v, dict) and {"m_Left", "m_Right", "m_Top", "m_Bottom"} <= set(v):
                sc[k] = [v["m_Left"], v["m_Right"], v["m_Top"], v["m_Bottom"]]
        sd = t.get("serializationData") or {}
        raw = sd.get("SerializedBytes")
        if raw:  # Odin SerializedMonoBehaviour (ColorSettingResponder: {DredgeColorTypeEnum: [Image]})
            here = os.path.dirname(os.path.abspath(__file__))
            if here not in sys.path:
                sys.path.insert(0, here)
            import odin
            d = odin.decode(bytes(raw))
            for k, v in d.items():
                if isinstance(v, dict) and isinstance(v.get("$items"), list):
                    keys = [e.get("$k") for e in v["$items"] if isinstance(e, dict) and "$k" in e]
                    if keys:
                        sc[k + "Keys"] = keys
        return sc

    def find_root(self, go_name, cls):
        for o in self.objs.values():
            if o.type.name != "GameObject":
                continue
            g = o.read_typetree()
            if g["m_Name"] != go_name:
                continue
            for c in g["m_Component"]:
                co = self.deref(o, c["component"])
                if co is not None and co.type.name == "MonoBehaviour" and self.cls(co, co.read_typetree()) == cls:
                    return o, co
        raise LookupError("GameObject %s with %s not found in Game.unity" % (go_name, cls))

    def rects(self, go_rd, path, out):
        """Flat {path: rect + graphic} for a RectTransform subtree, values in canvas units (1080 high)."""
        g = go_rd.read_typetree()
        node = {"active": bool(g["m_IsActive"])}
        kids = []
        for c in g["m_Component"]:
            co = self.deref(go_rd, c["component"])
            if co is None:
                continue
            t = co.read_typetree()
            tn = co.type.name
            if tn == "RectTransform":
                q = t["m_LocalRotation"]
                node.update({"aMin": r5((t["m_AnchorMin"]["x"], t["m_AnchorMin"]["y"]), 4),
                             "aMax": r5((t["m_AnchorMax"]["x"], t["m_AnchorMax"]["y"]), 4),
                             "pos": r5((t["m_AnchoredPosition"]["x"], t["m_AnchoredPosition"]["y"]), 3),
                             "size": r5((t["m_SizeDelta"]["x"], t["m_SizeDelta"]["y"]), 3),
                             "pivot": r5((t["m_Pivot"]["x"], t["m_Pivot"]["y"]), 4),
                             "scale": r5((t["m_LocalScale"]["x"], t["m_LocalScale"]["y"]), 4),
                             # m_LocalEulerAnglesHint is unreliable in exports; z rotation from the quaternion
                             "rotZ": round(float(np.degrees(2 * np.arctan2(q["z"], q["w"]))), 3)})
                kids = t["m_Children"]
            elif tn == "CanvasGroup":
                node["alpha"] = round(t["m_Alpha"], 4)
            elif tn == "MonoBehaviour":
                cn = self.cls(co, t)
                if cn == "Image":
                    c4 = t["m_Color"]
                    node["image"] = {"sprite": self.name(co, t["m_Sprite"]),
                                     "color": r5((c4["r"], c4["g"], c4["b"], c4["a"]), 4), "type": t["m_Type"],
                                     "fillMethod": t["m_FillMethod"], "fillOrigin": t["m_FillOrigin"],
                                     "fillAmount": round(t["m_FillAmount"], 4), "fillClockwise": bool(t["m_FillClockwise"]),
                                     "preserveAspect": bool(t["m_PreserveAspect"]),
                                     "material": self.name(co, t["m_Material"])}
                elif cn == "TextMeshProUGUI":
                    c4 = t["m_fontColor"]
                    node["text"] = {"text": t["m_text"], "fontSize": round(t["m_fontSize"], 2),
                                    "autoSize": bool(t["m_enableAutoSizing"]),
                                    "fontSizeMin": round(t["m_fontSizeMin"], 2), "fontSizeMax": round(t["m_fontSizeMax"], 2),
                                    "color": r5((c4["r"], c4["g"], c4["b"], c4["a"]), 4),
                                    "align": t.get("m_HorizontalAlignment"), "valign": t.get("m_VerticalAlignment"),
                                    "fontStyle": t["m_fontStyle"], "font": self.name(co, t["m_fontAsset"])}
                else:
                    node.setdefault("scripts", []).append(cn)
                    sc = self.script_fields(t)
                    if sc:
                        node.setdefault("fields", {})[cn] = sc
        out[path] = node
        for k in kids:
            kr = self.deref(go_rd, k)
            if kr is None:
                continue
            cg = self.deref(kr, kr.read_typetree()["m_GameObject"])
            self.rects(cg, path + "/" + cg.read_typetree()["m_Name"], out)


def photo_mode():
    """BuildInfo.photoMode (AbilityRadial: 11 wedges when on, 10 otherwise). BuildInfo is not in a bundle;
    read the AssetRipper export of it."""
    t = open(os.path.join(RIPPED, "Data", "BuildInfo.asset"), encoding="utf-8").read()
    m = re.search(r"\n  photoMode: (\d+)", t)
    return bool(int(m.group(1))) if m else False


def odin_icons(asset):
    """KeyboardControlIconData / MouseControlIconData (Odin dictionary) -> [(key enum, up, down)]."""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:  # python -I leaves the script folder off sys.path
        sys.path.insert(0, here)
    import odin
    t = open(os.path.join(RIPPED, "MonoBehaviour", asset), encoding="utf-8").read()
    d = odin.decode(bytes.fromhex(re.search(r"SerializedBytes: ([0-9a-f]+)", t).group(1)))
    return [(e["$k"], e["$v"]["upSpriteName"], e["$v"]["downSpriteName"]) for e in d["controlIcons"]["$items"]]


def export_sprite(name):
    """AssetRipper Sprite/<name>.asset + its Texture2D png -> art/ui/abilities/<name>.webp (lossless)."""
    t = open(os.path.join(RIPPED, "Sprite", name + ".asset"), encoding="utf-8").read()
    rect = re.search(r"m_Rect:\s*\n(?:\s+serializedVersion: \d+\n)?\s+x: ([\d.]+)\n\s+y: ([\d.]+)\n\s+width: ([\d.]+)\n\s+height: ([\d.]+)", t)
    guid = re.search(r"texture: \{fileID: \d+, guid: ([0-9a-f]{32})", t).group(1)
    tex = None
    for f in sorted(os.listdir(os.path.join(RIPPED, "Texture2D"))):
        if f.endswith(".png.meta") and ("guid: " + guid) in open(os.path.join(RIPPED, "Texture2D", f), encoding="utf-8").read(300):
            tex = os.path.join(RIPPED, "Texture2D", f[:-5])
            break
    if tex is None:
        raise LookupError("texture %s of sprite %s not found" % (guid, name))
    img = Image.open(tex).convert("RGBA")
    x, y, w, h = (float(v) for v in rect.groups())
    # Unity rects count from the bottom of the texture
    box = (round(x), round(img.height - y - h), round(x + w), round(img.height - y))
    os.makedirs(UI_ART, exist_ok=True)
    out = os.path.join(UI_ART, name + ".webp")
    img.crop(box).save(out, "WEBP", lossless=True, quality=100, method=6)
    return "art/ui/abilities/" + name + ".webp"


def ability_ui():
    S = SceneUI()
    ui = {"rects": {}}
    roots = {}
    for go_name, cls in UI_ROOTS:
        go_rd, mb = S.find_root(go_name, cls)
        roots[cls] = (go_rd, mb, mb.read_typetree())
        S.rects(go_rd, go_name, ui["rects"])
    rd, tt = roots["AbilityRadial"][1], roots["AbilityRadial"][2]
    wedges = []
    for i, raw in enumerate(tt["abilityWedges"]):
        w = S.deref(rd, raw)
        wt = w.read_typetree()
        wedges.append({"slot": i, "ability": S.name(w, wt["abilityData"]), "index": wt["index"], "radius": wt["radius"],
                       "node": S.deref(w, wt["m_GameObject"]).read_typetree()["m_Name"],
                       "lockedSprite": S.name(w, wt["lockedSprite"])})
    ui["radial"] = {"wedges": wedges, "controllerDeadzoneMagnitude": round(tt["controllerDeadzoneMagnitude"], 4),
                    "openSFX": clip_name(guid_path(tt["openSFX"]["m_AssetGUID"])),
                    "closeSFX": clip_name(guid_path(tt["closeSFX"]["m_AssetGUID"])),
                    "selectSFX": clip_name(guid_path(tt["selectSFX"]["m_AssetGUID"]))}
    ui["photoMode"] = photo_mode()
    ui["numAbilities"] = 11 if ui["photoMode"] else 10  # AbilityRadial.Awake
    ui["bar"] = {"refreshDelaySec": round(roots["AbilityBarUI"][2]["refreshDelaySec"], 4)}
    sp = roots["SpyglassUI"][2]
    ui["spyglass"] = {k: round(sp[k], 4) for k in ("scaleMin", "scaleMax", "closeThreshold", "farThreshold")}
    ui["spyglass"]["addMarkerSFX"] = clip_name(guid_path(sp["advancedSpyglassAddMarker"]["m_AssetGUID"]))
    ui["spyglass"]["removeMarkerSFX"] = clip_name(guid_path(sp["advancedSpyglassRemoveMarker"]["m_AssetGUID"]))
    hp = ui["rects"].get("ActiveAbility/Container/HasteInfoPanel", {}).get("fields", {}).get("HasteAbilityInfoPanel")
    if hp is None:
        raise LookupError("HasteAbilityInfoPanel not found under ActiveAbility/Container")
    ui["haste"] = {"animateDurationSec": hp["animateDurationSec"]}
    # control glyphs: RadialSelectShow = Key.E, DoAbility = Mouse.RightButton (DredgeControlBindings.cs:333-334)
    # up = button released (outline), down = pressed; names from Keyboard.asset / Mouse.asset (Odin dictionaries)
    glyphs = {}
    for want, asset, key in (("radial", "Keyboard.asset", "keyboard-icon-e"), ("ability", "Mouse.asset", 2)):
        for k, up, down in odin_icons(asset):
            if (isinstance(key, int) and k == key) or key in (up, down):
                glyphs[want] = {"up": export_sprite(up), "down": export_sprite(down)}
                break
        if want not in glyphs:
            raise LookupError("control icon for %s not found in %s" % (key, asset))
    ui["glyphs"] = glyphs
    return ui


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
    "LightAbility.DoActivate switches on tiers[].lightContainers (Light0Container, Light1Container, Light2Container) and lightBeams; Light1Container holds the only Spot Light (VariablePlayerLight: intensity = PlayerStats.LightLumens * 0.02, range = PlayerStats.LightRange = max range of undamaged lights). Beam quads use material extras.lightBeam (LightBeam_Shader: tex.rgb * color, alpha = fresnel^fade * tex.a * opacity).",
    "physics.abilityAudio[cls]: clip names per ability (AudioClip fields, AssetReference guids resolved through the Addressables catalog, AudioSources under the ability node). physics.spyglassCam: SpyglassVCam lens/POV/transposer. abilityUI: Game.unity ability bar (ActiveAbility), radial (AbilityRadial: wedge order = abilityWedges list), SpyglassUI; rects in canvas units of a 1920x1080 reference, CanvasScaler matches height.",
]


def main():
    global ENV
    env, prefab = load()
    ENV = env
    write_tree(prefab)
    find_builtin_quad(prefab)
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
                      "lightContainers": ti["lightContainers"], "attach": ti["attach"], "hullBounds": None})
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
           "physics": phys, "abilityUI": ability_ui(), "glb": "art/boat/boat.glb", "notes": NOTES}
    write_js(obj)
    print("missing built-in meshes:", MISSING)
    print("glb", os.path.getsize(os.path.join(ART, "boat.glb")), "bytes;", len(g.nodes), "nodes,",
          len(g.meshes), "meshes,", len(g.mats), "materials,", len(g.imgs), "images")


if __name__ == "__main__":
    main()
