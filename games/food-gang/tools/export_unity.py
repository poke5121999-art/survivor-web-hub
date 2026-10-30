"""Export the Food Gang AssetRipper Unity project (YAML) to compact web data for js/engine.

Reads D:/foodgang-ref/fg-unity (read only). Writes data/, art/, audio/ next to this tools/ folder.
Data shape: tools/README.md.
Run: PYTHONIOENCODING=utf-8 py -3.12 -I tools/export_unity.py [--all] [--no-audio] [--no-art]
"""
import collections, glob, json, math, os, re, struct, subprocess, sys, time, zlib, shutil

import numpy as np
import yaml
from PIL import Image

PROJ = "D:/foodgang-ref/fg-unity"
ASSETS = PROJ + "/Assets"
TYPES_CS = "D:/foodgang-ref/out/code/types.cs"
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SCRATCH = "D:/foodgang-ref/scratch-web"

MATCH_SCENES = ["SceneGame", "SceneLevelKitchen", "SceneLevelDiningRoom", "SceneLevelPantry"]
DEFAULT_SCENES = MATCH_SCENES + ["SceneIntro", "SceneMenu", "SceneLoadingGame", "SceneGameOver", "SceneGameTest"]
MAP_GROUP = {"SceneLevelKitchen": "map_kitchen", "SceneLevelDiningRoom": "map_dining", "SceneLevelPantry": "map_pantry"}
GROUP_PRIORITY = ["hud", "skins", "fx", "map_kitchen", "map_dining", "map_pantry", "ui"]
EXTRA_SPRITES = ["bg_skin_1", "bg_skin_2", "bg_skin_3", "bg_skin_4"]
SKIP_PREFAB = re.compile(r"^(DebugUI|Quantum|EntityPrototype)")
ATLAS_MAX = 2048
PAD = 2

# ---------------------------------------------------------------------------------------------------------------- YAML


class _Loader(yaml.CSafeLoader):
    pass


# YAML 1.1 turns yes/no/on/off and 0-prefixed digit runs into bools/octals; Unity writes them as plain strings.
_Loader.yaml_implicit_resolvers = {}
_Loader.add_implicit_resolver("tag:yaml.org,2002:bool", re.compile(r"^(?:true|false)$"), list("tf"))
_Loader.add_implicit_resolver("tag:yaml.org,2002:int", re.compile(r"^[-+]?(?:0|[1-9][0-9]*)$"), list("-+0123456789"))
_Loader.add_implicit_resolver("tag:yaml.org,2002:float", re.compile(
    r"^(?:[-+]?(?:[0-9][0-9]*)?\.[0-9]*(?:[eE][-+]?[0-9]+)?|[-+]?[0-9]+[eE][-+]?[0-9]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|[-+]?Infinity|NaN)$"),
    list("-+0123456789.IN"))
_Loader.add_implicit_resolver("tag:yaml.org,2002:null", re.compile(r"^(?:~|null|)$"), ["~", "n", ""])


def _float_ctor(loader, node):
    v = loader.construct_scalar(node)
    if v in ("Infinity", "+Infinity"):
        return math.inf
    if v == "-Infinity":
        return -math.inf
    low = v.lower()
    if "nan" in low:
        return 0.0
    if low.endswith("inf"):
        return -math.inf if v.startswith("-") else math.inf
    return float(v)


_Loader.add_constructor("tag:yaml.org,2002:float", _float_ctor)

DOC_RE = re.compile(r"^--- !u!(\d+) &(-?\d+)( stripped)?[^\n]*\n", re.M)


class UDoc:
    __slots__ = ("cls", "fid", "stripped", "type", "d")

    def __init__(self, cls, fid, stripped, typ, d):
        self.cls, self.fid, self.stripped, self.type, self.d = cls, fid, stripped, typ, d


_ycache = {}


def read_yaml(path):
    """Unity YAML file -> {fileID: UDoc} in file order."""
    path = path.replace("\\", "/")
    if path in _ycache:
        return _ycache[path]
    with open(path, encoding="utf-8", errors="replace") as f:
        txt = f.read()
    out = {}
    ms = list(DOC_RE.finditer(txt))
    for i, m in enumerate(ms):
        body = txt[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(txt)]
        try:
            d = yaml.load(body, Loader=_Loader) or {}
        except yaml.YAMLError as e:
            print("  yaml error", path, m.group(2), str(e)[:120])
            continue
        typ, data = next(iter(d.items())) if d else ("?", {})
        out[int(m.group(2))] = UDoc(int(m.group(1)), int(m.group(2)), bool(m.group(3)), typ, data or {})
    _ycache[path] = out
    return out


# ---------------------------------------------------------------------------------------------------------- GUID index


def md4(data):
    def F(x, y, z): return (x & y) | (~x & z)
    def G(x, y, z): return (x & y) | (x & z) | (y & z)
    def H(x, y, z): return x ^ y ^ z
    def rol(x, s): x &= 0xffffffff; return ((x << s) | (x >> (32 - s))) & 0xffffffff
    msg = bytearray(data); ml = len(data) * 8
    msg.append(0x80)
    while len(msg) % 64 != 56:
        msg.append(0)
    msg += struct.pack("<Q", ml)
    a, b, c, d = 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476
    for i in range(0, len(msg), 64):
        X = struct.unpack("<16I", msg[i:i + 64]); aa, bb, cc, dd = a, b, c, d
        for k in range(16):
            s = (3, 7, 11, 19)[k % 4]; r = rol(a + F(b, c, d) + X[k], s); a, b, c, d = d, r, b, c
        for k in range(16):
            idx = (k % 4) * 4 + k // 4; s = (3, 5, 9, 13)[k % 4]
            r = rol(a + G(b, c, d) + X[idx] + 0x5a827999, s); a, b, c, d = d, r, b, c
        order = (0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15)
        for k in range(16):
            s = (3, 9, 11, 15)[k % 4]; r = rol(a + H(b, c, d) + X[order[k]] + 0x6ed9eba1, s); a, b, c, d = d, r, b, c
        a = (a + aa) & 0xffffffff; b = (b + bb) & 0xffffffff; c = (c + cc) & 0xffffffff; d = (d + dd) & 0xffffffff
    return struct.pack("<4I", a, b, c, d)


def file_id(ns, name):
    return struct.unpack("<i", md4(("s\0\0\0" + ns + name).encode("utf-8"))[:4])[0]


G2P = {}        # guid -> absolute asset path
SCRIPTS = {}    # (guid, fileID) -> class name


def build_index():
    for meta in glob.glob(ASSETS + "/**/*.meta", recursive=True):
        with open(meta, encoding="utf-8", errors="replace") as f:
            m = re.search(r"^guid: ([0-9a-f]{32})", f.read(600), re.M)
        if m:
            G2P[m.group(1)] = meta[:-5].replace("\\", "/")
    for meta in glob.glob(PROJ + "/Library/PackageCache/**/*.cs.meta", recursive=True):
        with open(meta, encoding="utf-8", errors="replace") as f:
            m = re.search(r"^guid: ([0-9a-f]{32})", f.read(600), re.M)
        if m:
            SCRIPTS[(m.group(1), 11500000)] = os.path.basename(meta)[:-8]
    for g, p in G2P.items():
        if p.endswith(".cs"):
            SCRIPTS[(g, 11500000)] = os.path.basename(p)[:-3]
    dll = [g for g, p in G2P.items() if p.endswith(".dll")]
    if os.path.exists(TYPES_CS):
        ns = ""
        names = set()
        with open(TYPES_CS, encoding="utf-8", errors="replace") as f:
            for line in f:
                mn = re.match(r"namespace ([\w.]+)", line)
                if mn:
                    ns = mn.group(1)
                mc = re.match(r"\s*(?:public|internal)?\s*(?:sealed |abstract |static )*class (\w+)", line)
                if mc:
                    names.add((ns, mc.group(1))); names.add(("", mc.group(1)))
        for n, c in names:
            fid = file_id(n, c)
            for g in dll:
                SCRIPTS.setdefault((g, fid), c)


def rel(p):
    return p[len(ASSETS) + 1:] if p.startswith(ASSETS) else p


def script_name(ref):
    if not isinstance(ref, dict):
        return None
    return SCRIPTS.get((ref.get("guid"), ref.get("fileID")))


# ------------------------------------------------------------------------------------------------------ export state


class State:
    def __init__(self):
        self.sprites = {}           # guid/fid key -> sprite key
        self.sprite_src = {}        # sprite key -> (path, fid)
        self.sprite_groups = collections.defaultdict(set)
        self.tex_sprites = {}       # texture path -> sprite key (full texture as sprite)
        self.mats = {}              # mat key -> data
        self.mat_paths = {}         # path -> key
        self.mat_groups = collections.defaultdict(set)
        self.mesh_mats = set()      # materials drawn on 3D meshes: texture kept whole (tiling UVs), not atlased
        self.clips_needed = set()   # clip paths
        self.ctrl_needed = set()    # controller paths
        self.clip_groups = collections.defaultdict(set)
        self.audio = {}             # path -> key
        self.fonts = {}             # path -> key
        self.meshes = {}            # path -> key
        self.prefab_names = {}      # path -> name
        self.unresolved = collections.Counter()
        self.paths = {}             # crc32 -> transform path (for AssetRipper's path_0x.. names)
        self.counts = collections.Counter()
        self.group = "ui"


S = State()


def uniq_key(table, name, ident):
    k = name
    if k in table and table[k] != ident:
        k = name + "~" + hashlib_short(ident)
    table[k] = ident
    return k


def hashlib_short(s):
    return "%08x" % (zlib.crc32(repr(s).encode()) & 0xffffffff)


_sprite_keys = {}


def sprite_ref(path, fid):
    """Sprite asset or sprite sub-object -> sprite key (registered for packing)."""
    ident = (path, fid)
    if ident in S.sprites:
        key = S.sprites[ident]
    else:
        name = None
        if path.endswith(".asset"):
            docs = read_yaml(path)
            doc = docs.get(fid) or next(iter(docs.values()), None)
            if not doc or doc.cls != 213:
                return None
            name = doc.d.get("m_Name") or os.path.basename(path)[:-6]
        elif path.lower().endswith((".png", ".jpg", ".tga", ".psd")):
            name = os.path.splitext(os.path.basename(path))[0]
        else:
            return None
        key = uniq_key(_sprite_keys, str(name), ident)
        S.sprites[ident] = key
        S.sprite_src[key] = ident
    S.sprite_groups[key].add(S.group)
    return key


def tex_sprite(path):
    """A whole texture used as a sprite (particle/mesh/RawImage material textures)."""
    return sprite_ref(path, 2800000)


def material_ref(path):
    if path in S.mat_paths:
        key = S.mat_paths[path]
        S.mat_groups[key].add(S.group)
        return key
    docs = read_yaml(path)
    doc = next(iter(docs.values()), None)
    if not doc:
        return None
    d = doc.d
    key = d.get("m_Name") or os.path.basename(path)[:-4]
    S.mat_paths[path] = key
    S.mat_groups[key].add(S.group)
    sh = d.get("m_Shader") or {}
    shader = shader_name(sh)
    props = d.get("m_SavedProperties") or {}
    floats = kv_list(props.get("m_Floats"))
    colors = kv_list(props.get("m_Colors"))
    texs = kv_list(props.get("m_TexEnvs"))
    out = {"shader": shader, "src": floats.get("_SrcBlend", 5), "dst": floats.get("_DstBlend", 10)}
    lit = _shader_blend.get((sh or {}).get("guid"))
    if lit:
        # the shader hard-codes its blend state, so the material's leftover _SrcBlend/_DstBlend are not used
        out["src"], out["dst"] = lit
    kw = d.get("m_ValidKeywords") or d.get("m_ShaderKeywords") or []
    if isinstance(kw, str):
        kw = kw.split()
    if kw:
        out["kw"] = kw
    for tn in ("_MainTex", "_BaseMap"):
        t = texs.get(tn) or {}
        ref = t.get("m_Texture") or {}
        if ref.get("guid") and ref["guid"] in G2P:
            tp = G2P[ref["guid"]]
            if tp.lower().endswith((".png", ".jpg", ".tga")) and "SDF" not in tp:
                out["_texpath"] = tp
                sc, of = t.get("m_Scale") or {}, t.get("m_Offset") or {}
                if sc.get("x", 1) != 1 or sc.get("y", 1) != 1 or of.get("x", 0) or of.get("y", 0):
                    out["st"] = [sc.get("x", 1), sc.get("y", 1), of.get("x", 0), of.get("y", 0)]
            elif "SDF" in tp:
                out["atlas"] = os.path.basename(tp)
            break
    pr = {}
    for k, v in floats.items():
        if k in ("_SrcBlend", "_DstBlend"):
            continue
        pr[k] = rnd(v)
    for k, v in colors.items():
        pr[k] = col(v)
    out["props"] = pr
    if "_Color" in colors:
        out["color"] = col(colors["_Color"])
    if "_BaseColor" in colors and "_Color" not in colors:
        out["color"] = col(colors["_BaseColor"])
    S.mats[key] = out
    return key


_shader_cache = {}
_shader_blend = {}
BLEND_NAMES = {"Zero": 0, "One": 1, "DstColor": 2, "SrcColor": 3, "OneMinusDstColor": 4, "SrcAlpha": 5,
               "OneMinusSrcColor": 6, "DstAlpha": 7, "OneMinusDstAlpha": 8, "SrcAlphaSaturate": 9, "OneMinusSrcAlpha": 10}


def shader_name(ref):
    g = ref.get("guid")
    if not g:
        return None
    if g in _shader_cache:
        return _shader_cache[g]
    name = None
    if g in G2P:
        p = G2P[g]
        try:
            with open(p, encoding="utf-8", errors="replace") as f:
                src = f.read()
            m = re.search(r'Shader\s+"([^"]+)"', src[:4000])
            name = m.group(1) if m else os.path.basename(p)
            b = re.search(r"^\s*Blend\s+(\w+)\s+(\w+)\s*$", src, re.M)
            if b and b.group(1) in BLEND_NAMES and b.group(2) in BLEND_NAMES:
                sb, db = BLEND_NAMES[b.group(1)], BLEND_NAMES[b.group(2)]
                # premultiplying in the fragment shader + One/OneMinusSrcAlpha == straight SrcAlpha/OneMinusSrcAlpha
                if sb == 1 and re.search(r"c\.rgb\s*\*=\s*c\.a", src):
                    sb = 5
                _shader_blend[g] = (sb, db)
        except OSError:
            name = os.path.basename(p)
    elif g == "0000000000000000f000000000000000":
        name = "builtin:%d" % ref.get("fileID", 0)
    _shader_cache[g] = name
    return name


def kv_list(v):
    """Material property lists: either a dict (new format) or a list of single-key dicts (old format)."""
    if isinstance(v, dict):
        return v
    out = {}
    for e in v or []:
        if isinstance(e, dict):
            if "first" in e:
                out[e["first"]] = e.get("second")
            else:
                out.update(e)
    return out


def rnd(v, n=5):
    if isinstance(v, float):
        if math.isinf(v):
            return "inf" if v > 0 else "-inf"
        r = round(v, n)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    return v


def col(c):
    if not isinstance(c, dict):
        return [1, 1, 1, 1]
    return [rnd(c.get("r", 1), 4), rnd(c.get("g", 1), 4), rnd(c.get("b", 1), 4), rnd(c.get("a", 1), 4)]


def v2(v):
    return [rnd((v or {}).get("x", 0)), rnd((v or {}).get("y", 0))]


def v3(v):
    v = v or {}
    return [rnd(v.get("x", 0)), rnd(v.get("y", 0)), rnd(v.get("z", 0))]


def v4(v):
    v = v or {}
    return [rnd(v.get("x", 0)), rnd(v.get("y", 0)), rnd(v.get("z", 0)), rnd(v.get("w", 0))]


def ext_ref(ref):
    """External PPtr -> reference string per README conventions."""
    g = ref.get("guid")
    fid = ref.get("fileID", 0)
    if g and g.startswith("0000000000000000"):
        # Unity built-in resources: 10754 Sprites-Default material (= renderer default), 10210 cube, 10917 UI sprites
        return None if fid in (10754, 10100, 10303, 10306) else "builtin:%d" % fid
    if not g or g not in G2P:
        if g:
            S.unresolved["guid:" + g] += 1
        return None
    p = G2P[g]
    low = p.lower()
    if low.endswith(".asset") and "/Sprite/" in p:
        k = sprite_ref(p, fid)
        return "sprite:" + k if k else None
    if low.endswith((".png", ".jpg", ".tga", ".psd")):
        if fid == 21300000 or fid not in (2800000,):
            k = sprite_ref(p, fid)
            return "sprite:" + k if k else None
        return "sprite:" + tex_sprite(p)
    if low.endswith(".anim"):
        S.clips_needed.add(p)
        S.clip_groups[p].add(S.group)
        return "clip:" + clip_key(p)
    if low.endswith((".controller", ".overridecontroller")):
        S.ctrl_needed.add(p)
        S.clip_groups[p].add(S.group)
        return "ctrl:" + ctrl_key(p)
    if low.endswith(".prefab"):
        return "prefab:" + os.path.basename(p)[:-7]
    if low.endswith((".wav", ".ogg", ".mp3", ".aif", ".aiff")):
        k = os.path.splitext(os.path.basename(p))[0]
        S.audio[p] = k
        return "audio:" + k
    if low.endswith(".mat"):
        return "mat:" + (material_ref(p) or "")
    if "/Mesh/" in p and low.endswith(".asset"):
        k = os.path.basename(p)[:-6]
        S.meshes[p] = k
        return "mesh:" + k
    if low.endswith(".asset"):
        docs = read_yaml(p)
        doc = docs.get(fid) or next(iter(docs.values()), None)
        if doc and doc.cls == 114 and script_name(doc.d.get("m_Script")) in ("TMP_FontAsset",):
            S.fonts[p] = doc.d.get("m_Name")
            return "font:" + doc.d.get("m_Name")
        if doc and doc.cls == 213:
            k = sprite_ref(p, fid)
            return "sprite:" + k if k else None
    return "asset:" + rel(p)


def clip_key(p):
    return os.path.basename(p)[:-5]


def ctrl_key(p):
    return os.path.splitext(os.path.basename(p))[0]


# ----------------------------------------------------------------------------------------------- scenes and prefabs


class FileCtx:
    def __init__(self, docs):
        self.docs = docs
        self.node_of = {}   # GameObject fid -> node index
        self.tf_node = {}   # transform fid -> node index
        self.comp_of = {}   # component fid -> (node, comp index)

    def ref(self, r):
        if not isinstance(r, dict) or "fileID" not in r:
            return r
        fid = r.get("fileID", 0)
        if not fid:
            return None
        if r.get("guid"):
            return ext_ref(r)
        if fid in self.node_of:
            return "#%d" % self.node_of[fid]
        if fid in self.tf_node:
            return "#%d" % self.tf_node[fid]
        if fid in self.comp_of:
            n, c = self.comp_of[fid]
            return "#%d.%d" % (n, c)
        doc = self.docs.get(fid)
        if doc is None:
            return None
        return "local:%s" % doc.type


BOILER = {"m_ObjectHideFlags", "m_CorrespondingSourceObject", "m_PrefabInstance", "m_PrefabAsset", "m_GameObject",
          "m_Enabled", "m_EditorHideFlags", "m_Script", "m_Name", "m_EditorClassIdentifier", "serializedVersion"}


def conv_fields(ctx, v, depth=0):
    if isinstance(v, dict):
        if "fileID" in v and len(v) <= 3 and set(v) <= {"fileID", "guid", "type"}:
            return ctx.ref(v)
        if set(v) == {"r", "g", "b", "a"}:
            return col(v)
        if set(v) in ({"x", "y"}, {"x", "y", "z"}, {"x", "y", "z", "w"}):
            return [rnd(v[k]) for k in "xyzw" if k in v]
        if set(v) == {"RawValue"}:
            return rnd(v["RawValue"] / 65536.0)
        return {k: conv_fields(ctx, x, depth + 1) for k, x in v.items() if k not in BOILER}
    if isinstance(v, list):
        return [conv_fields(ctx, x, depth + 1) for x in v]
    return rnd(v)


def tf_of(d):
    q = d.get("m_LocalRotation") or {}
    qx, qy, qz, qw = (q.get(k, 0) for k in "xyzw")
    if abs(qx) < 1e-6 and abs(qy) < 1e-6:
        r = rnd(math.degrees(2 * math.atan2(qz, qw if qw else 1e-12)) if (qz or qw) else 0, 4)
        if r > 180:
            r = rnd(r - 360, 4)
        if r <= -180:
            r = rnd(r + 360, 4)
    else:
        r = [rnd(qx, 6), rnd(qy, 6), rnd(qz, 6), rnd(qw, 6)]
    return {"p": v3(d.get("m_LocalPosition")), "r": r, "s": v3(d.get("m_LocalScale"))}


def mmc(c):
    """MinMaxCurve."""
    if not isinstance(c, dict):
        return {"m": 0, "s": rnd(c or 0)}
    out = {"m": c.get("minMaxState", 0), "s": rnd(c.get("scalar", 0))}
    if out["m"] in (2, 3):
        out["mn"] = rnd(c.get("minScalar", 0))
    if out["m"] in (1, 2):
        out["c"] = curve_keys((c.get("maxCurve") or {}).get("m_Curve"))
        if out["m"] == 2:
            out["c2"] = curve_keys((c.get("minCurve") or {}).get("m_Curve"))
    return out


def curve_keys(keys):
    out = []
    for k in keys or []:
        v = k.get("value", 0)
        if isinstance(v, dict):
            continue
        out.append([rnd(k.get("time", 0)), rnd(v), rnd(k.get("inSlope", 0)), rnd(k.get("outSlope", 0))])
    return out


def grad(g):
    if not isinstance(g, dict):
        return None
    nc, na = g.get("m_NumColorKeys", 2), g.get("m_NumAlphaKeys", 2)
    cs = [[rnd(g.get("ctime%d" % i, 0) / 65535.0, 4)] + col(g.get("key%d" % i))[:3] for i in range(nc)]
    as_ = [[rnd(g.get("atime%d" % i, 0) / 65535.0, 4), col(g.get("key%d" % i))[3]] for i in range(na)]
    return {"c": cs, "a": as_, "mode": g.get("m_Mode", 0)}


def mmg(c):
    if not isinstance(c, dict):
        return {"m": 0, "a": [1, 1, 1, 1]}
    m = c.get("minMaxState", 0)
    out = {"m": m, "a": col(c.get("maxColor")), "b": col(c.get("minColor"))}
    if m in (1, 3, 4):
        out["g"] = grad(c.get("maxGradient"))
    if m == 3:
        out["g2"] = grad(c.get("minGradient"))
    return out


def conv_ps(ctx, d, rnd_doc):
    on = lambda m: isinstance(d.get(m), dict) and d[m].get("enabled", 0) == 1
    ini = d.get("InitialModule") or {}
    out = {"type": "ParticleSystem", "dur": rnd(d.get("lengthInSec", 5)), "loop": d.get("looping", 0),
           "prewarm": d.get("prewarm", 0), "delay": mmc(d.get("startDelay")), "playOnAwake": d.get("playOnAwake", 1),
           "space": d.get("moveWithTransform", 0), "scaling": d.get("scalingMode", 1),
           "speedMul": rnd(d.get("simulationSpeed", 1)), "stopAction": d.get("stopAction", 0),
           "seed": None if d.get("autoRandomSeed", 1) else d.get("randomSeed", 0),
           "maxP": ini.get("maxNumParticles", 1000),
           "main": {"life": mmc(ini.get("startLifetime")), "speed": mmc(ini.get("startSpeed")),
                    "size": mmc(ini.get("startSize")), "rot": mmc(ini.get("startRotation")),
                    "color": mmg(ini.get("startColor")), "gravity": mmc(ini.get("gravityModifier")),
                    "flipRot": rnd(ini.get("randomizeRotationDirection", 0))}}
    if ini.get("size3D"):
        out["main"]["size3d"] = [mmc(ini.get("startSize")), mmc(ini.get("startSizeY")), mmc(ini.get("startSizeZ"))]
    if ini.get("rotation3D"):
        out["main"]["rot3d"] = [mmc(ini.get("startRotationX")), mmc(ini.get("startRotationY")), mmc(ini.get("startRotation"))]
    used = []
    if on("EmissionModule"):
        e = d["EmissionModule"]
        bursts = []
        for b in e.get("m_Bursts") or []:
            bursts.append({"t": rnd(b.get("time", 0)), "n": mmc(b.get("countCurve")) if "countCurve" in b else
                           {"m": 3, "s": b.get("maxCount", 0), "mn": b.get("minCount", 0)},
                           "cycles": b.get("cycleCount", 1), "interval": rnd(b.get("repeatInterval", 0.01)),
                           "p": rnd(b.get("probability", 1))})
        out["emission"] = {"rate": mmc(e.get("rateOverTime")), "dist": mmc(e.get("rateOverDistance")), "bursts": bursts}
        used.append("emission")
    if on("ShapeModule"):
        s = d["ShapeModule"]
        out["shape"] = {"kind": s.get("type", 0), "radius": rnd((s.get("radius") or {}).get("value", s.get("radius", 1)) if isinstance(s.get("radius"), dict) else s.get("radius", 1)),
                        "thick": rnd(s.get("radiusThickness", 1)), "angle": rnd(s.get("angle", 25)),
                        "arc": rnd((s.get("arc") or {}).get("value", 360) if isinstance(s.get("arc"), dict) else s.get("arc", 360)),
                        "len": rnd(s.get("length", 5)), "box": v3(s.get("boxThickness")),
                        "pos": v3(s.get("m_Position")), "rot": v3(s.get("m_Rotation")), "scale": v3(s.get("m_Scale")),
                        "randDir": rnd(s.get("randomDirectionAmount", 0)), "sphereDir": rnd(s.get("sphericalDirectionAmount", 0)),
                        "alignDir": s.get("alignToDirection", 0)}
        used.append("shape")
    if on("VelocityModule"):
        v = d["VelocityModule"]
        out["vel"] = {"x": mmc(v.get("x")), "y": mmc(v.get("y")), "z": mmc(v.get("z")), "world": v.get("inWorldSpace", 0),
                      "orbital": [mmc(v.get("orbitalX")), mmc(v.get("orbitalY")), mmc(v.get("orbitalZ"))],
                      "radial": mmc(v.get("radial")), "speedMul": mmc(v.get("speedModifier"))}
        used.append("vel")
    if on("ClampVelocityModule"):
        v = d["ClampVelocityModule"]
        out["limit"] = {"v": mmc(v.get("magnitude")), "damp": rnd(v.get("dampen", 0)), "drag": mmc(v.get("drag")),
                        "separate": v.get("separateAxis", 0), "world": v.get("inWorldSpace", 0)}
        used.append("limit")
    if on("ForceModule"):
        v = d["ForceModule"]
        out["force"] = {"x": mmc(v.get("x")), "y": mmc(v.get("y")), "z": mmc(v.get("z")), "world": v.get("inWorldSpace", 0)}
        used.append("force")
    if on("ColorModule"):
        out["col"] = mmg(d["ColorModule"].get("gradient"))
        used.append("col")
    if on("SizeModule"):
        s = d["SizeModule"]
        out["sizeL"] = mmc(s.get("curve"))
        if s.get("separateAxes"):
            out["sizeL3"] = [mmc(s.get("curve")), mmc(s.get("y")), mmc(s.get("z"))]
        used.append("sizeL")
    if on("RotationModule"):
        out["rotL"] = mmc(d["RotationModule"].get("curve"))
        used.append("rotL")
    if on("RotationBySpeedModule"):
        r = d["RotationBySpeedModule"]
        out["rotSpeed"] = {"c": mmc(r.get("curve")), "range": v2(r.get("range"))}
        used.append("rotSpeed")
    if on("SizeBySpeedModule"):
        r = d["SizeBySpeedModule"]
        out["sizeSpeed"] = {"c": mmc(r.get("curve")), "range": v2(r.get("range"))}
        used.append("sizeSpeed")
    if on("NoiseModule"):
        n = d["NoiseModule"]
        out["noise"] = {"strength": mmc(n.get("strength")), "freq": rnd(n.get("frequency", 0.5)),
                        "scroll": mmc(n.get("scrollSpeed")), "damping": n.get("damping", 1), "octaves": n.get("octaves", 1),
                        "posAmt": mmc(n.get("positionAmount")), "rotAmt": mmc(n.get("rotationAmount")),
                        "sizeAmt": mmc(n.get("sizeAmount"))}
        used.append("noise")
    if on("UVModule"):
        u = d["UVModule"]
        out["uv"] = {"tiles": [u.get("tilesX", 1), u.get("tilesY", 1)], "mode": u.get("mode", 0),
                     "anim": u.get("animationType", 0), "frame": mmc(u.get("frameOverTime")),
                     "startFrame": mmc(u.get("startFrame")), "cycles": rnd(u.get("cycles", 1)),
                     "rowMode": u.get("rowMode", 1), "row": u.get("rowIndex", 0), "timeMode": u.get("timeMode", 0),
                     "fps": rnd(u.get("fps", 30)),
                     "sprites": [ctx.ref(s.get("sprite")) for s in (u.get("sprites") or []) if isinstance(s, dict)]}
        used.append("uv")
    if on("CollisionModule"):
        c = d["CollisionModule"]
        out["coll"] = {"type": c.get("type", 0), "dampen": mmc(c.get("m_Dampen")), "bounce": mmc(c.get("m_Bounce")),
                       "lifetimeLoss": mmc(c.get("m_EnergyLossOnCollision")), "minKill": rnd(c.get("minKillSpeed", 0)),
                       "radius": rnd(c.get("radiusScale", 1)), "planes": [ctx.ref(p) for p in c.get("m_Planes") or []],
                       "mode": c.get("collisionMode", 0)}
        used.append("coll")
    if on("SubModule"):
        out["sub"] = [{"ps": ctx.ref(s.get("emitter")), "type": s.get("type", 0), "props": s.get("properties", 0),
                       "p": rnd(s.get("emitProbability", 1))} for s in d["SubModule"].get("subEmitters") or []]
        used.append("sub")
    for k in ("TrailModule", "LightsModule", "ExternalForcesModule", "InheritVelocityModule", "TriggerModule",
              "CustomDataModule", "ColorBySpeedModule", "LifetimeByEmitterSpeedModule"):
        if on(k):
            S.counts["ps skipped " + k] += 1
    for u in used:
        S.counts["ps module " + u] += 1
    if rnd_doc is not None:
        r = rnd_doc.d
        mats = r.get("m_Materials") or []
        out["r"] = {"enabled": r.get("m_Enabled", 1), "mode": r.get("m_RenderMode", 0),
                    "mat": ctx.ref(mats[0]) if mats else None, "sortMode": r.get("m_SortMode", 0),
                    "layer": r.get("m_SortingLayerID", 0), "order": r.get("m_SortingOrder", 0),
                    "lenScale": rnd(r.get("m_LengthScale", 2)), "velScale": rnd(r.get("m_VelocityScale", 0)),
                    "camVelScale": rnd(r.get("m_CameraVelocityScale", 0)),
                    "minSize": rnd(r.get("m_MinParticleSize", 0)), "maxSize": rnd(r.get("m_MaxParticleSize", 0.5)),
                    "pivot": v3(r.get("m_Pivot")), "flip": v3(r.get("m_Flip")), "align": r.get("m_RenderAlignment", 0),
                    "fudge": rnd(r.get("m_SortingFudge", 0)), "mask": r.get("m_MaskInteraction", 0)}
    return out


def conv_comp(ctx, doc, node_idx, docs, ps_renderers):
    d, c = doc.d, doc.cls
    en = d.get("m_Enabled", 1)
    R = ctx.ref
    if c == 212:
        mats = d.get("m_Materials") or []
        return {"type": "SpriteRenderer", "enabled": en, "sprite": R(d.get("m_Sprite")), "color": col(d.get("m_Color")),
                "flip": [d.get("m_FlipX", 0), d.get("m_FlipY", 0)], "layer": d.get("m_SortingLayerID", 0),
                "order": d.get("m_SortingOrder", 0), "mat": R(mats[0]) if mats else None,
                "drawMode": d.get("m_DrawMode", 0), "size": v2(d.get("m_Size")), "maskInteraction": d.get("m_MaskInteraction", 0)}
    if c == 210:
        return {"type": "SortingGroup", "enabled": en, "layer": d.get("m_SortingLayerID", 0), "order": d.get("m_SortingOrder", 0)}
    if c == 23:
        mats = [R(m) for m in d.get("m_Materials") or []]
        S.mesh_mats.update(m[4:] for m in mats if m and m.startswith("mat:"))
        return {"type": "MeshRenderer", "enabled": en, "mats": mats,
                "layer": d.get("m_SortingLayerID", 0), "order": d.get("m_SortingOrder", 0),
                "batch": [(d.get("m_StaticBatchInfo") or {}).get("firstSubMesh", 0), (d.get("m_StaticBatchInfo") or {}).get("subMeshCount", 0)]}
    if c == 33:
        return {"type": "MeshFilter", "mesh": R(d.get("m_Mesh"))}
    if c == 95:
        return {"type": "Animator", "enabled": en, "ctrl": R(d.get("m_Controller")), "cull": d.get("m_CullingMode", 0),
                "applyRoot": d.get("m_ApplyRootMotion", 0), "unscaled": 1 if d.get("m_UpdateMode", 0) == 2 else 0,
                "keepState": d.get("m_KeepAnimatorStateOnDisable", 0)}
    if c == 111:
        clips = [R(x) for x in d.get("m_Animations") or []]
        return {"type": "Animation", "enabled": en, "clip": R(d.get("m_Animation")), "clips": [x for x in clips if x],
                "auto": d.get("m_PlayAutomatically", 1), "wrap": d.get("m_WrapMode", 0), "cull": d.get("m_CullingType", 0)}
    if c == 198:
        S.counts["ParticleSystem"] += 1
        return conv_ps(ctx, d, ps_renderers.get(d.get("m_GameObject", {}).get("fileID")))
    if c == 199:
        return None
    if c == 20:
        return {"type": "Camera", "enabled": en, "ortho": d.get("orthographic", 0), "size": rnd(d.get("orthographic size", 5)),
                "fov": rnd(d.get("field of view", 60)), "near": rnd(d.get("near clip plane", 0.3)),
                "far": rnd(d.get("far clip plane", 1000)), "clear": d.get("m_ClearFlags", 1),
                "bg": col(d.get("m_BackGroundColor")), "depth": rnd(d.get("m_Depth", 0)),
                "mask": (d.get("m_CullingMask") or {}).get("m_Bits", -1),
                "rect": [rnd((d.get("m_NormalizedViewPortRect") or {}).get(k, v)) for k, v in (("x", 0), ("y", 0), ("width", 1), ("height", 1))]}
    if c == 223:
        return {"type": "Canvas", "enabled": en, "mode": d.get("m_RenderMode", 0), "order": d.get("m_SortingOrder", 0),
                "layer": d.get("m_SortingLayerID", 0), "pixelPerfect": d.get("m_PixelPerfect", 0),
                "planeDistance": rnd(d.get("m_PlaneDistance", 100)), "overrideSorting": d.get("m_OverrideSorting", 0),
                "camera": R(d.get("m_Camera"))}
    if c == 225:
        return {"type": "CanvasGroup", "enabled": en, "alpha": rnd(d.get("m_Alpha", 1)), "interactable": d.get("m_Interactable", 1),
                "blocks": d.get("m_BlocksRaycasts", 1), "ignoreParent": d.get("m_IgnoreParentGroups", 0)}
    if c == 222:
        return None
    if c == 82:
        return {"type": "AudioSource", "enabled": en, "clip": R(d.get("m_audioClip")), "volume": rnd(d.get("m_Volume", 1)),
                "pitch": rnd(d.get("m_Pitch", 1)), "loop": d.get("Loop", 0), "playOnAwake": d.get("m_PlayOnAwake", 1),
                "mute": d.get("Mute", 0), "spatial": rnd(d.get("panLevelCustomCurve", {}).get("m_Curve", [{}])[0].get("value", 0)
                                                         if isinstance(d.get("panLevelCustomCurve"), dict) and d["panLevelCustomCurve"].get("m_Curve") else 0),
                "priority": d.get("Priority", 128)}
    if c == 61:
        return {"type": "BoxCollider2D", "enabled": en, "size": v2(d.get("m_Size")), "offset": v2(d.get("m_Offset")),
                "trigger": d.get("m_IsTrigger", 0)}
    if c == 58:
        return {"type": "CircleCollider2D", "enabled": en, "radius": rnd(d.get("m_Radius", 0.5)), "offset": v2(d.get("m_Offset")),
                "trigger": d.get("m_IsTrigger", 0)}
    if c == 65:
        return {"type": "BoxCollider", "enabled": en, "size": v3(d.get("m_Size")), "center": v3(d.get("m_Center")),
                "trigger": d.get("m_IsTrigger", 0)}
    if c == 50:
        return {"type": "Rigidbody2D", "bodyType": d.get("m_BodyType", 0), "gravity": rnd(d.get("m_GravityScale", 1))}
    if c == 81:
        return {"type": "AudioListener"}
    if c == 114:
        return conv_mb(ctx, doc)
    S.counts["skipped class %d %s" % (c, doc.type)] += 1
    return {"type": doc.type}


def conv_mb(ctx, doc):
    d = doc.d
    R = ctx.ref
    sn = script_name(d.get("m_Script"))
    en = d.get("m_Enabled", 1)
    if not sn:
        S.unresolved["script:%s" % (d.get("m_Script") or {}).get("guid")] += 1
        sn = "?"
    S.counts["mb " + sn] += 1
    if sn == "Image":
        return {"type": "Image", "enabled": en, "sprite": R(d.get("m_Sprite")), "color": col(d.get("m_Color")),
                "mat": R(d.get("m_Material")), "raycast": d.get("m_RaycastTarget", 1), "imgType": d.get("m_Type", 0),
                "preserveAspect": d.get("m_PreserveAspect", 0), "fillCenter": d.get("m_FillCenter", 1),
                "fillMethod": d.get("m_FillMethod", 4), "fillAmount": rnd(d.get("m_FillAmount", 1)),
                "fillClockwise": d.get("m_FillClockwise", 1), "fillOrigin": d.get("m_FillOrigin", 0),
                "ppuMul": rnd(d.get("m_PixelsPerUnitMultiplier", 1)), "maskable": d.get("m_Maskable", 1)}
    if sn == "RawImage":
        uv = d.get("m_UVRect") or {}
        return {"type": "RawImage", "enabled": en, "tex": R(d.get("m_Texture")), "color": col(d.get("m_Color")),
                "mat": R(d.get("m_Material")), "raycast": d.get("m_RaycastTarget", 1),
                "uv": [rnd(uv.get("x", 0)), rnd(uv.get("y", 0)), rnd(uv.get("width", 1)), rnd(uv.get("height", 1))]}
    if sn in ("TextMeshProUGUI", "TextMeshPro"):
        ha, va = d.get("m_HorizontalAlignment"), d.get("m_VerticalAlignment")
        align = (ha | va) if ha is not None and va is not None else d.get("m_textAlignment", 257)
        mats = R(d.get("m_sharedMaterial"))
        wrap = d.get("m_TextWrappingMode", d.get("m_enableWordWrapping", 1))
        S.counts["Text"] += 1
        return {"type": "Text", "ui": 1 if sn == "TextMeshProUGUI" else 0, "enabled": en, "text": str(d.get("m_text") or ""),
                "font": R(d.get("m_fontAsset")), "mat": mats, "size": rnd(d.get("m_fontSize", 36)),
                "autoSize": d.get("m_enableAutoSizing", 0), "sizeMin": rnd(d.get("m_fontSizeMin", 18)),
                "sizeMax": rnd(d.get("m_fontSizeMax", 72)), "color": col(d.get("m_fontColor")), "align": align,
                "wrap": wrap, "overflow": d.get("m_overflowMode", 0), "style": d.get("m_fontStyle", 0),
                "spacing": {"char": rnd(d.get("m_characterSpacing", 0)), "word": rnd(d.get("m_wordSpacing", 0)),
                            "line": rnd(d.get("m_lineSpacing", 0)), "para": rnd(d.get("m_paragraphSpacing", 0))},
                "margin": v4(d.get("m_margin")), "richText": d.get("m_isRichText", 1), "raycast": d.get("m_RaycastTarget", 1),
                "gradient": [col((d.get("m_fontColorGradient") or {}).get(k)) for k in ("topLeft", "topRight", "bottomLeft", "bottomRight")]
                if d.get("m_enableVertexGradient") else None, "maskable": d.get("m_Maskable", 1)}
    if sn in ("Button", "Toggle", "Slider", "Selectable", "Scrollbar"):
        cs = d.get("m_Colors") or {}
        ss = d.get("m_SpriteState") or {}
        at = d.get("m_AnimationTriggers") or {}
        out = {"type": sn, "enabled": en, "interactable": d.get("m_Interactable", 1), "transition": d.get("m_Transition", 1),
               "colors": {"normal": col(cs.get("m_NormalColor")), "highlighted": col(cs.get("m_HighlightedColor")),
                          "pressed": col(cs.get("m_PressedColor")), "selected": col(cs.get("m_SelectedColor")),
                          "disabled": col(cs.get("m_DisabledColor")), "mul": rnd(cs.get("m_ColorMultiplier", 1)),
                          "fade": rnd(cs.get("m_FadeDuration", 0.1))},
               "spriteState": {k[2:].replace("Sprite", "").lower(): R(v) for k, v in ss.items()},
               "animTriggers": {k[2:].replace("Trigger", "").lower(): v for k, v in at.items()},
               "target": R(d.get("m_TargetGraphic"))}
        if sn == "Button":
            out["onClick"] = [{"target": R(cl.get("m_Target")), "method": cl.get("m_MethodName"),
                               "arg": conv_fields(ctx, cl.get("m_Arguments"))}
                              for cl in ((d.get("m_OnClick") or {}).get("m_PersistentCalls") or {}).get("m_Calls") or []]
        if sn == "Slider":
            out.update({"fillRect": R(d.get("m_FillRect")), "handleRect": R(d.get("m_HandleRect")), "dir": d.get("m_Direction", 0),
                        "min": rnd(d.get("m_MinValue", 0)), "max": rnd(d.get("m_MaxValue", 1)), "value": rnd(d.get("m_Value", 0)),
                        "whole": d.get("m_WholeNumbers", 0)})
        if sn == "Toggle":
            out.update({"isOn": d.get("m_IsOn", 0), "graphic": R(d.get("graphic")), "group": R(d.get("m_Group"))})
        return out
    if sn == "Mask":
        return {"type": "Mask", "enabled": en, "showGraphic": d.get("m_ShowMaskGraphic", 1)}
    if sn == "RectMask2D":
        return {"type": "RectMask2D", "enabled": en, "padding": v4(d.get("m_Padding")), "softness": v2(d.get("m_Softness"))}
    if sn in ("HorizontalLayoutGroup", "VerticalLayoutGroup", "GridLayoutGroup"):
        p = d.get("m_Padding") or {}
        out = {"type": sn, "enabled": en, "padding": [p.get("m_Left", 0), p.get("m_Right", 0), p.get("m_Top", 0), p.get("m_Bottom", 0)],
               "childAlign": d.get("m_ChildAlignment", 0), "reverse": d.get("m_ReverseArrangement", 0)}
        if sn == "GridLayoutGroup":
            out.update({"cell": v2(d.get("m_CellSize")), "spacing": v2(d.get("m_Spacing")), "startCorner": d.get("m_StartCorner", 0),
                        "startAxis": d.get("m_StartAxis", 0), "constraint": d.get("m_Constraint", 0),
                        "count": d.get("m_ConstraintCount", 2)})
        else:
            out.update({"spacing": rnd(d.get("m_Spacing", 0)), "forceExpandW": d.get("m_ChildForceExpandWidth", 1),
                        "forceExpandH": d.get("m_ChildForceExpandHeight", 1), "controlW": d.get("m_ChildControlWidth", 0),
                        "controlH": d.get("m_ChildControlHeight", 0), "scaleW": d.get("m_ChildScaleWidth", 0),
                        "scaleH": d.get("m_ChildScaleHeight", 0)})
        return out
    if sn == "LayoutElement":
        return {"type": "LayoutElement", "enabled": en, "ignore": d.get("m_IgnoreLayout", 0),
                "minW": rnd(d.get("m_MinWidth", -1)), "minH": rnd(d.get("m_MinHeight", -1)),
                "prefW": rnd(d.get("m_PreferredWidth", -1)), "prefH": rnd(d.get("m_PreferredHeight", -1)),
                "flexW": rnd(d.get("m_FlexibleWidth", -1)), "flexH": rnd(d.get("m_FlexibleHeight", -1)),
                "priority": d.get("m_LayoutPriority", 1)}
    if sn == "ContentSizeFitter":
        return {"type": "ContentSizeFitter", "enabled": en, "h": d.get("m_HorizontalFit", 0), "v": d.get("m_VerticalFit", 0)}
    if sn == "AspectRatioFitter":
        return {"type": "AspectRatioFitter", "enabled": en, "mode": d.get("m_AspectMode", 0), "ratio": rnd(d.get("m_AspectRatio", 1))}
    if sn == "CanvasScaler":
        return {"type": "CanvasScaler", "enabled": en, "mode": d.get("m_UiScaleMode", 0), "refRes": v2(d.get("m_ReferenceResolution")),
                "match": rnd(d.get("m_MatchWidthOrHeight", 0)), "screenMatch": d.get("m_ScreenMatchMode", 0),
                "scaleFactor": rnd(d.get("m_ScaleFactor", 1)), "ppu": rnd(d.get("m_ReferencePixelsPerUnit", 100)),
                "dynPpu": rnd(d.get("m_DynamicPixelsPerUnit", 1))}
    if sn == "GraphicRaycaster":
        return {"type": "GraphicRaycaster", "enabled": en}
    if sn == "Volume":
        return {"type": "Volume", "enabled": en, "global": d.get("m_IsGlobal", 1), "weight": rnd(d.get("weight", 1)),
                "priority": rnd(d.get("priority", 0)), "profile": volume_profile(d.get("sharedProfile"))}
    if sn == "CinemachineCamera":
        L = d.get("Lens") or {}
        tg = d.get("Target") or {}
        return {"type": sn, "enabled": en, "priority": (d.get("Priority") or {}).get("m_Value", 0),
                "follow": R(tg.get("TrackingTarget")), "lookAt": R(tg.get("LookAtTarget")),
                "lens": {"fov": rnd(L.get("FieldOfView", 60)), "size": rnd(L.get("OrthographicSize", 5)),
                         "near": rnd(L.get("NearClipPlane", 0.1)), "far": rnd(L.get("FarClipPlane", 5000)),
                         "dutch": rnd(L.get("Dutch", 0)), "mode": L.get("ModeOverride", 0)}}
    if sn == "CinemachinePositionComposer":
        cp = d.get("Composition") or {}
        dz, hl, la = cp.get("DeadZone") or {}, cp.get("HardLimits") or {}, d.get("Lookahead") or {}
        return {"type": sn, "enabled": en, "distance": rnd(d.get("CameraDistance", 10)), "screen": v2(cp.get("ScreenPosition")),
                "deadZone": v2(dz.get("Size")) if dz.get("Enabled") else [0, 0],
                "hardLimits": v2(hl.get("Size")) if hl.get("Enabled") else [2, 2], "hardOffset": v2(hl.get("Offset")),
                "damping": v3(d.get("Damping")), "offset": v3(d.get("TargetOffset")),
                "lookahead": {"on": la.get("Enabled", 0), "time": rnd(la.get("Time", 0)), "smoothing": rnd(la.get("Smoothing", 0)),
                              "ignoreY": la.get("IgnoreY", 0)}, "centerOnActivate": d.get("CenterOnActivate", 1)}
    if sn in ("CinemachineConfiner3D", "CinemachineConfiner2D"):
        return {"type": sn, "enabled": en, "bounds": R(d.get("BoundingVolume") or d.get("BoundingShape2D")),
                "slowing": rnd(d.get("SlowingDistance", 0))}
    if sn == "CinemachineBrain":
        db = d.get("DefaultBlend") or {}
        return {"type": sn, "enabled": en, "update": d.get("UpdateMethod", 2), "blend": {"style": db.get("Style", 1), "time": rnd(db.get("Time", 2))}}
    if sn == "CinemachineImpulseListener":
        return {"type": sn, "enabled": en, "gain": rnd(d.get("Gain", 1)), "use2d": d.get("Use2DDistance", 0)}
    return {"type": "MonoBehaviour", "script": sn, "enabled": en, "fields": conv_fields(ctx, d)}


def volume_profile(ref):
    if not isinstance(ref, dict) or ref.get("guid") not in G2P:
        return None
    p = G2P[ref["guid"]]
    doc = next(iter(read_yaml(p).values()))
    out = {}
    for c in doc.d.get("components") or []:
        cp = G2P.get(c.get("guid"))
        if not cp:
            continue
        cd = next(iter(read_yaml(cp).values())).d
        name = cd.get("m_Name")
        if not cd.get("active", 1):
            continue
        vals = {k: v.get("m_Value") for k, v in cd.items() if isinstance(v, dict) and v.get("m_OverrideState") == 1}
        if name == "Tonemapping":
            out["tonemap"] = {0: "none", 1: "neutral", 2: "aces"}.get(vals.get("mode", 0), "none")
        elif name == "ColorAdjustments":
            out["postExposure"] = rnd(vals.get("postExposure", 0)); out["contrast"] = rnd(vals.get("contrast", 0))
            out["saturation"] = rnd(vals.get("saturation", 0))
            if "colorFilter" in vals:
                out["colorFilter"] = col(vals["colorFilter"])
            if "hueShift" in vals:
                out["hueShift"] = rnd(vals["hueShift"])
        elif name == "Bloom":
            out["bloom"] = {"threshold": rnd(vals.get("threshold", 0.9)), "intensity": rnd(vals.get("intensity", 0)),
                            "scatter": rnd(vals.get("scatter", 0.7)), "maxIter": vals.get("maxIterations", 6)}
        elif name == "Vignette":
            out["vignette"] = {"intensity": rnd(vals.get("intensity", 0)), "smoothness": rnd(vals.get("smoothness", 0.2)),
                               "color": col(vals.get("color")) if "color" in vals else [0, 0, 0, 1]}
        else:
            out[name] = {k: conv_fields(FileCtx({}), v) for k, v in vals.items()}
    return out


def export_file(path, kind, name):
    docs = read_yaml(path)
    ctx = FileCtx(docs)
    gos = [d for d in docs.values() if d.cls == 1]
    tfs = {d.fid: d for d in docs.values() if d.cls in (4, 224)}
    go_tf = {}
    for t in tfs.values():
        g = (t.d.get("m_GameObject") or {}).get("fileID")
        if g:
            go_tf[g] = t
    # depth-first order: roots in file order, children per m_Children
    roots = [g for g in gos if g.fid in go_tf and not (go_tf[g.fid].d.get("m_Father") or {}).get("fileID")]
    sr = [d for d in docs.values() if d.cls == 1660057539]
    if sr:
        order = [r.get("fileID") for r in sr[0].d.get("m_Roots") or []]
        by_tf = {go_tf[g.fid].fid: g for g in roots}
        roots = [by_tf[t] for t in order if t in by_tf] + [g for g in roots if go_tf[g.fid].fid not in order]
    tf_go = {t.fid: (t.d.get("m_GameObject") or {}).get("fileID") for t in tfs.values()}
    ordered = []

    def walk(g, parent):
        ordered.append((g, parent))
        idx = len(ordered) - 1
        for ch in go_tf[g.fid].d.get("m_Children") or []:
            cg = tf_go.get(ch.get("fileID"))
            if cg in docs:
                walk(docs[cg], idx)
    for g in roots:
        walk(g, -1)
    for i, (g, _) in enumerate(ordered):
        ctx.node_of[g.fid] = i
        ctx.tf_node[go_tf[g.fid].fid] = i
    # component indices first so references resolve regardless of order
    comp_docs = []
    ps_renderers = {}
    for i, (g, _) in enumerate(ordered):
        lst = []
        for c in g.d.get("m_Component") or []:
            fid = (c.get("component") or {}).get("fileID")
            cd = docs.get(fid)
            if cd is None or cd.cls in (4, 224):
                continue
            if cd.cls == 199:
                ps_renderers[g.fid] = cd
                continue
            if cd.cls == 222:
                continue
            ctx.comp_of[fid] = (i, len(lst))
            lst.append(cd)
        comp_docs.append(lst)
    nodes = []
    for i, (g, parent) in enumerate(ordered):
        t = go_tf[g.fid]
        n = {"id": i, "name": str(g.d.get("m_Name", "")), "parent": parent, "active": g.d.get("m_IsActive", 1),
             "layer": g.d.get("m_Layer", 0), "tf": tf_of(t.d)}
        tag = g.d.get("m_TagString")
        if tag and tag != "Untagged":
            n["tag"] = tag
        if t.cls == 224:
            n["rect"] = {"amin": v2(t.d.get("m_AnchorMin")), "amax": v2(t.d.get("m_AnchorMax")), "pivot": v2(t.d.get("m_Pivot")),
                         "size": v2(t.d.get("m_SizeDelta")), "pos": v2(t.d.get("m_AnchoredPosition"))}
        comps = []
        mf = None
        for cd in comp_docs[i]:
            c = conv_comp(ctx, cd, i, docs, ps_renderers)
            if c is None:
                c = {"type": "Skipped"}
            if c.get("type") == "MeshFilter":
                mf = c
            comps.append(c)
        if mf:
            for c in comps:
                if c.get("type") == "MeshRenderer":
                    c["mesh"] = mf["mesh"]
        n["comps"] = comps
        nodes.append(n)
    out = {"name": name, "kind": kind, "nodes": nodes, "roots": [i for i, (g, p) in enumerate(ordered) if p == -1]}
    if kind == "scene":
        rs = [d for d in docs.values() if d.cls == 104]
        if rs:
            out["settings"] = {"ambient": col(rs[0].d.get("m_AmbientSkyColor")), "ambientMode": rs[0].d.get("m_AmbientMode", 0)}
    # transform paths for crc32 resolution of AssetRipper's unresolved animation paths
    for i, n in enumerate(nodes):
        chain = []
        j = i
        while j != -1:
            chain.append(nodes[j]["name"])
            j = nodes[j]["parent"]
        chain.reverse()
        for s in range(len(chain)):
            p = "/".join(chain[s:])
            S.paths[zlib.crc32(p.encode("utf-8")) & 0xffffffff] = p
    S.counts[kind] += 1
    S.counts["nodes"] += len(nodes)
    return out


# ------------------------------------------------------------------------------------------------- animation clips


def clip_path_name(p):
    m = re.match(r"path_0x([0-9A-Fa-f]+)_", p or "")
    if m:
        h = int(m.group(1), 16)
        if h in S.paths:
            return S.paths[h]
        S.unresolved["animpath:" + p] += 1
    return p or ""


def curve_cls(c, cache={}):
    cid = c.get("classID", 0)
    names = {1: "GameObject", 4: "Transform", 212: "SpriteRenderer", 224: "RectTransform", 225: "CanvasGroup",
             198: "ParticleSystem", 23: "MeshRenderer", 95: "Animator", 82: "AudioSource", 210: "SortingGroup",
             199: "ParticleSystemRenderer", 61: "BoxCollider2D"}
    if cid == 114:
        sn = script_name(c.get("script"))
        if sn in ("Image", "RawImage"):
            return sn
        if sn in ("TextMeshProUGUI", "TextMeshPro"):
            return "Text"
        return "MonoBehaviour:%s" % (sn or "?")
    return names.get(cid, "class%d" % cid)


def export_clip(p):
    doc = next(iter(read_yaml(p).values()))
    d = doc.d
    st = d.get("m_AnimationClipSettings") or {}
    out = {"len": 0, "rate": rnd(d.get("m_SampleRate", 60)), "loop": st.get("m_LoopTime", 0), "wrap": d.get("m_WrapMode", 0),
           "legacy": d.get("m_Legacy", 0), "curves": [], "pptr": [], "events": []}
    start, stop = st.get("m_StartTime", 0), st.get("m_StopTime", 0)
    tmax = 0.0

    def add(path, prop, keys, cls=None):
        nonlocal tmax
        if not keys:
            return
        for k in keys:
            tmax = max(tmax, k[0])
        c = {"path": clip_path_name(path), "prop": prop, "keys": keys}
        if cls:
            c["cls"] = cls
        out["curves"].append(c)

    for kind, pre in (("m_EulerCurves", "r"), ("m_PositionCurves", "p"), ("m_ScaleCurves", "s")):
        for c in d.get(kind) or []:
            keys = (c.get("curve") or {}).get("m_Curve") or []
            for ax in "xyz":
                ks = [[rnd(k["time"]), rnd(k["value"][ax]), rnd(k["inSlope"][ax]), rnd(k["outSlope"][ax])] for k in keys]
                if pre == "r" and ax != "z" and all(k[1] == 0 for k in ks):
                    continue
                if pre in ("p", "s") and ax == "z" and len(set(k[1] for k in ks)) <= 1:
                    continue
                add(c.get("path"), pre + "." + ax, ks, "Transform")
    for c in d.get("m_RotationCurves") or []:
        keys = (c.get("curve") or {}).get("m_Curve") or []
        for ax in "xyzw":
            add(c.get("path"), "q." + ax, [[rnd(k["time"]), rnd(k["value"][ax]), rnd(k["inSlope"][ax]), rnd(k["outSlope"][ax])] for k in keys], "Transform")
    for c in d.get("m_FloatCurves") or []:
        attr = c.get("attribute")
        cls = curve_cls(c)
        if attr and attr.startswith("script_0x"):
            S.counts["clip unresolved attr"] += 1
        add(c.get("path"), attr, curve_keys((c.get("curve") or {}).get("m_Curve")), cls)
    for c in d.get("m_PPtrCurves") or []:
        keys = []
        for k in c.get("curve") or []:
            v = k.get("value") or {}
            r = ext_ref(v) if v.get("guid") else None
            keys.append([rnd(k.get("time", 0)), r])
            tmax = max(tmax, k.get("time", 0))
        out["pptr"].append({"path": clip_path_name(c.get("path")), "prop": c.get("attribute"), "cls": curve_cls(c), "keys": keys})
    for e in d.get("m_Events") or []:
        out["events"].append({"t": rnd(e.get("time", 0)), "fn": e.get("functionName"), "s": e.get("data") or "",
                              "f": rnd(e.get("floatParameter", 0)), "i": e.get("intParameter", 0),
                              "obj": FileCtx({}).ref(e.get("objectReferenceParameter"))})
    out["len"] = rnd(stop - start if stop > start else tmax)
    if not out["pptr"]:
        del out["pptr"]
    if not out["events"]:
        del out["events"]
    S.counts["clips"] += 1
    return out


def export_controller(p):
    docs = read_yaml(p)
    root = next(iter(docs.values()))
    if root.cls == 221:
        base = (root.d.get("m_Controller") or {})
        bp = G2P.get(base.get("guid"))
        if bp:
            S.ctrl_needed.add(bp)
            for g in S.clip_groups[p]:
                S.clip_groups[bp].add(g)
        over = {}
        for c in root.d.get("m_Clips") or []:
            o, n = c.get("m_OriginalClip") or {}, c.get("m_OverrideClip") or {}
            if o.get("guid") in G2P and n.get("guid") in G2P:
                op, np_ = G2P[o["guid"]], G2P[n["guid"]]
                S.clips_needed.add(np_)
                S.clips_needed.add(op)
                for g in S.clip_groups[p]:
                    S.clip_groups[np_].add(g)
                over[clip_key(op)] = clip_key(np_)
        S.counts["override controllers"] += 1
        return {"base": ctrl_key(bp) if bp else None, "over": over}
    ctrl = root.d
    TYPES = {1: "float", 3: "int", 4: "bool", 9: "trigger"}
    params = [{"name": pr["m_Name"], "type": TYPES.get(pr.get("m_Type"), "float"),
               "def": pr.get("m_DefaultBool", 0) if pr.get("m_Type") in (4, 9) else
               (pr.get("m_DefaultInt", 0) if pr.get("m_Type") == 3 else rnd(pr.get("m_DefaultFloat", 0)))}
              for pr in ctrl.get("m_AnimatorParameters") or []]
    groups = S.clip_groups[p]

    def motion(ref):
        if not isinstance(ref, dict) or not ref.get("fileID"):
            return None
        if ref.get("guid"):
            mp = G2P.get(ref["guid"])
            if mp and mp.endswith(".anim"):
                S.clips_needed.add(mp)
                for g in groups:
                    S.clip_groups[mp].add(g)
                return clip_key(mp)
            return None
        bt = docs.get(ref["fileID"])
        if bt and bt.cls == 206:
            b = bt.d
            kinds = {0: "1d", 1: "2dSimple", 2: "2dFreeform", 3: "2dCartesian", 4: "direct"}
            return {"kind": kinds.get(b.get("m_BlendType", 0), "1d"), "param": b.get("m_BlendParameter"),
                    "paramY": b.get("m_BlendParameterY"),
                    "children": [{"motion": motion(ch.get("m_Motion")), "th": rnd(ch.get("m_Threshold", 0)),
                                  "pos": v2(ch.get("m_Position")), "speed": rnd(ch.get("m_TimeScale", 1)),
                                  "param": ch.get("m_DirectBlendParameter")} for ch in b.get("m_Childs") or []]}
        return None

    def sm_export(smref):
        sm_doc = docs.get(smref.get("fileID"))
        states, index = [], {}
        sm_default = {}

        def collect(smd, prefix):
            d = smd.d
            first = None
            for cs in d.get("m_ChildStates") or []:
                sid = (cs.get("m_State") or {}).get("fileID")
                if sid in docs:
                    index[sid] = len(states)
                    states.append(sid)
            for csm in d.get("m_ChildStateMachines") or []:
                sub = docs.get((csm.get("m_StateMachine") or {}).get("fileID"))
                if sub:
                    collect(sub, prefix + sub.d.get("m_Name", "") + ".")
            sm_default[smd.fid] = (d.get("m_DefaultState") or {}).get("fileID")
        collect(sm_doc, "")

        def trans(tref):
            t = docs.get(tref.get("fileID"))
            if not t:
                return None
            td = t.d
            dst = (td.get("m_DstState") or {}).get("fileID")
            dsm = (td.get("m_DstStateMachine") or {}).get("fileID")
            if dst and dst in index:
                to = index[dst]
            elif dsm and sm_default.get(dsm) in index:
                to = index[sm_default[dsm]]
            elif td.get("m_IsExit"):
                to = "exit"
            else:
                return None
            o = {"to": to, "cond": [[c.get("m_ConditionMode"), c.get("m_ConditionEvent"), rnd(c.get("m_EventTreshold", 0))]
                                    for c in td.get("m_Conditions") or []]}
            if t.cls == 1101:
                o.update({"hasExit": td.get("m_HasExitTime", 0), "exitTime": rnd(td.get("m_ExitTime", 0)),
                          "dur": rnd(td.get("m_TransitionDuration", 0)), "fixed": td.get("m_HasFixedDuration", 1),
                          "offset": rnd(td.get("m_TransitionOffset", 0)), "interrupt": td.get("m_InterruptionSource", 0),
                          "ordered": td.get("m_OrderedInterruption", 1), "canSelf": td.get("m_CanTransitionToSelf", 1),
                          "solo": td.get("m_Solo", 0), "mute": td.get("m_Mute", 0)})
            return o
        out_states = []
        for sid in states:
            sd = docs[sid].d
            so = {"name": sd.get("m_Name"), "motion": motion(sd.get("m_Motion")), "speed": rnd(sd.get("m_Speed", 1)),
                  "cycleOffset": rnd(sd.get("m_CycleOffset", 0)), "mirror": sd.get("m_Mirror", 0), "tag": sd.get("m_Tag", ""),
                  "wd": sd.get("m_WriteDefaultValues", 1)}
            if sd.get("m_SpeedParameterActive"):
                so["speedParam"] = sd.get("m_SpeedParameter")
            if sd.get("m_TimeParameterActive"):
                so["timeParam"] = sd.get("m_TimeParameter")
            if sd.get("m_CycleOffsetParameterActive"):
                so["cycleParam"] = sd.get("m_CycleOffsetParameter")
            so["trans"] = [x for x in (trans(t) for t in sd.get("m_Transitions") or []) if x]
            out_states.append(so)
            S.counts["states"] += 1
        anys, entries = [], []

        def gather_any(smd):
            for t in smd.d.get("m_AnyStateTransitions") or []:
                x = trans(t)
                if x:
                    anys.append(x)
            for t in smd.d.get("m_EntryTransitions") or []:
                x = trans(t)
                if x:
                    entries.append(x)
            for csm in smd.d.get("m_ChildStateMachines") or []:
                sub = docs.get((csm.get("m_StateMachine") or {}).get("fileID"))
                if sub:
                    gather_any(sub)
        gather_any(sm_doc)
        dflt = sm_default.get(sm_doc.fid)
        return {"def": index.get(dflt, 0), "states": out_states, "any": anys, "entry": entries}

    layers = []
    for L in ctrl.get("m_AnimatorLayers") or []:
        lo = {"name": L.get("m_Name"), "weight": rnd(L.get("m_DefaultWeight", 0)),
              "blend": "additive" if L.get("m_BlendingMode") == 1 else "override"}
        if (L.get("m_Mask") or {}).get("fileID"):
            lo["mask"] = mask_paths(L["m_Mask"])
        if L.get("m_SyncedLayerIndex", -1) >= 0:
            lo["sync"] = L["m_SyncedLayerIndex"]
            lo["syncTiming"] = L.get("m_SyncedLayerAffectsTiming", 0)
            if L.get("m_Motions"):
                lo["syncMotions"] = [[conv_motion_ref(m2.get("m_State")), motion(m2.get("m_Motion"))] for m2 in L["m_Motions"]]
        smref = L.get("m_StateMachine") or {}
        if smref.get("fileID") in docs:
            lo["sm"] = sm_export(smref)
        else:
            lo["sm"] = {"def": 0, "states": [], "any": [], "entry": []}
        layers.append(lo)
    S.counts["controllers"] += 1
    return {"params": params, "layers": layers}


def conv_motion_ref(r):
    return (r or {}).get("fileID")


def mask_paths(ref):
    p = G2P.get(ref.get("guid"))
    if not p:
        return None
    doc = next(iter(read_yaml(p).values()))
    return [e.get("m_Path") for e in doc.d.get("m_Elements") or [] if e.get("m_Weight", 0) > 0]


# --------------------------------------------------------------------------------------------------------- sprites


def load_sprite_image(key):
    path, fid = S.sprite_src[key]
    if fid == 2800000 or path.lower().endswith((".png", ".jpg", ".tga")):
        im = Image.open(path).convert("RGBA")
        meta = {"ppu": 100, "px": im.width / 2, "py": im.height / 2, "ow": im.width, "oh": im.height, "border": None,
                "tex": 1}
        return im, 0, 0, meta
    doc = read_yaml(path).get(fid) or next(iter(read_yaml(path).values()))
    d = doc.d
    rd = d.get("m_RD") or {}
    tex = rd.get("texture") or {}
    tp = G2P.get(tex.get("guid"))
    if not tp:
        S.unresolved["sprite texture " + key] += 1
        return None
    big = _tex_cache.get(tp)
    if big is None:
        big = Image.open(tp).convert("RGBA")
        _tex_cache[tp] = big
    tr = rd.get("textureRect") or d.get("m_Rect")
    x, y, w, h = tr["x"], tr["y"], tr["width"], tr["height"]
    H = big.height
    box = (int(round(x)), int(round(H - y - h)), int(round(x + w)), int(round(H - y)))
    im = big.crop(box)
    sr = rd.get("settingsRaw", 0)
    if sr & 1 and (sr >> 2) & 0xF:
        S.counts["sprite packed rotation (unhandled)"] += 1
    rect = d.get("m_Rect")
    off = rd.get("textureRectOffset") or {"x": 0, "y": 0}
    b = d.get("m_Border") or {}
    border = [b.get("x", 0), b.get("y", 0), b.get("z", 0), b.get("w", 0)]
    pv = d.get("m_Pivot") or {"x": 0.5, "y": 0.5}
    meta = {"ppu": rnd(d.get("m_PixelsToUnits", 100)), "px": rnd(pv["x"] * rect["width"], 3), "py": rnd(pv["y"] * rect["height"], 3),
            "ow": rnd(rect["width"]), "oh": rnd(rect["height"]), "border": border if any(border) else None}
    return im, off.get("x", 0), off.get("y", 0), meta


_tex_cache = {}


def finalize_materials():
    """Material textures: whole webp for 3D meshes (UVs tile), atlas sprite for particles/UI."""
    for key, m in S.mats.items():
        tp = m.pop("_texpath", None)
        if not tp:
            continue
        if key in S.mesh_mats:
            name = "tex_" + os.path.splitext(os.path.basename(tp))[0]
            fn = "art/%s.webp" % name
            Image.open(tp).convert("RGBA").save(os.path.join(OUT, fn), "WEBP", lossless=True, method=6)
            m["texFile"] = fn
            S.counts["mesh textures"] += 1
        else:
            for g in S.mat_groups[key] or {"fx"}:
                S.group = g
                m["tex"] = "sprite:" + tex_sprite(tp)


def bleed(im, iters=4):
    """Spread edge colours into fully transparent pixels so bilinear sampling does not pull in black fringes."""
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3]
    if alpha.min() > 0 or alpha.max() == 0:
        return im
    rgb = a[..., :3].copy()
    known = alpha > 0
    for _ in range(iters):
        acc = np.zeros_like(rgb); cnt = np.zeros(alpha.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not dx and not dy:
                    continue
                k = np.roll(np.roll(known, dy, 0), dx, 1).astype(np.float32)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * k[..., None]
                cnt += k
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    out = np.concatenate([rgb, alpha[..., None]], axis=2).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def pack_sprites():
    """Group sprites, trim transparent margins, shelf-pack per group into <=2048 pages, write lossless WebP."""
    groups = collections.defaultdict(list)
    for key in S.sprite_src:
        gs = S.sprite_groups.get(key) or {"ui"}
        g = next((x for x in GROUP_PRIORITY if x in gs), sorted(gs)[0])
        groups[g].append(key)
    sprites, atlases = {}, {}
    total_px = 0
    for g in sorted(groups):
        items = []
        for key in groups[g]:
            r = load_sprite_image(key)
            if r is None:
                continue
            im, ox, oy, meta = r
            if not meta.get("border") and im.width and im.height:
                bb = im.getchannel("A").getbbox()
                if bb is None:
                    bb = (0, 0, 1, 1)
                # crop: bb is in image (top-left) coords; ox/oy measure from bottom-left of the sprite rect
                l, t, rr, bt = bb
                oy += im.height - bt
                ox += l
                im = im.crop(bb)
            items.append((key, bleed(im), ox, oy, meta))
        items.sort(key=lambda it: (-it[1].height, -it[1].width))
        pages = []
        cur = None
        for it in items:
            w, h = it[1].width + 2 * PAD, it[1].height + 2 * PAD
            placed = False
            for pg in pages:
                pos = pg.place(w, h)
                if pos:
                    pg.items.append((it, pos)); placed = True
                    break
            if not placed:
                side = 256
                while side < ATLAS_MAX and (side < max(w, h) or side * side < 0):
                    side *= 2
                pg = Shelf(ATLAS_MAX, ATLAS_MAX)
                pos = pg.place(w, h)
                if not pos:
                    S.counts["sprite too big " + it[0]] += 1
                    continue
                pg.items.append((it, pos))
                pages.append(pg)
        for pi, pg in enumerate(pages):
            name = g if len(pages) == 1 else "%s_%d" % (g, pi)
            W = pow2(max(x + it[1].width + 2 * PAD for it, (x, y) in pg.items))
            Hh = pow2(max(y + it[1].height + 2 * PAD for it, (x, y) in pg.items))
            canvas = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
            for (key, im, ox, oy, meta), (x, y) in pg.items:
                # extrude 1px so bilinear filtering at the frame edge does not pull in a neighbour
                ex = im.resize((im.width + 2, im.height + 2), Image.NEAREST) if False else None
                canvas.paste(im, (x + PAD, y + PAD))
                for dx, dy, src in ((-1, 0, im.crop((0, 0, 1, im.height))), (im.width, 0, im.crop((im.width - 1, 0, im.width, im.height)))):
                    canvas.paste(src, (x + PAD + dx, y + PAD + dy))
                top = canvas.crop((x + PAD - 1, y + PAD, x + PAD + im.width + 1, y + PAD + 1))
                bot = canvas.crop((x + PAD - 1, y + PAD + im.height - 1, x + PAD + im.width + 1, y + PAD + im.height))
                canvas.paste(top, (x + PAD - 1, y + PAD - 1))
                canvas.paste(bot, (x + PAD - 1, y + PAD + im.height))
                s = {"a": name, "x": x + PAD, "y": y + PAD, "w": im.width, "h": im.height, "px": meta["px"], "py": meta["py"],
                     "ppu": meta["ppu"], "ow": meta["ow"], "oh": meta["oh"], "ox": rnd(ox), "oy": rnd(oy)}
                if meta.get("border"):
                    s["border"] = meta["border"]
                sprites[key] = s
            fn = "art/%s.webp" % name
            canvas.save(os.path.join(OUT, fn), "WEBP", lossless=True, quality=100, method=6)
            atlases[name] = {"file": fn, "w": W, "h": Hh}
            total_px += W * Hh
            S.counts["atlas pages"] += 1
    S.counts["sprites packed"] = len(sprites)
    return {"atlases": atlases, "sprites": sprites}


def pow2(n):
    p = 64
    while p < n:
        p *= 2
    return p


class Shelf:
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.shelves = []  # [y, h, x]
        self.items = []
        self.next_y = 0

    def place(self, w, h):
        if w > self.W:
            return None
        for sh in self.shelves:
            if h <= sh[1] and sh[2] + w <= self.W:
                pos = (sh[2], sh[0])
                sh[2] += w
                return pos
        if self.next_y + h > self.H:
            return None
        self.shelves.append([self.next_y, h, w])
        pos = (0, self.next_y)
        self.next_y += h
        return pos


# ---------------------------------------------------------------------------------------------------------- meshes

VFMT = {0: ("<f", 4), 1: ("<e", 2), 2: ("B", 1), 3: ("b", 1), 4: ("<H", 2), 5: ("<h", 2), 6: ("B", 1), 7: ("b", 1),
        8: ("<H", 2), 9: ("<h", 2), 10: ("<I", 4), 11: ("<i", 4)}


def export_mesh(p, key):
    with open(p, encoding="utf-8") as f:
        txt = f.read()
    doc = next(iter(read_yaml(p).values())).d
    vd = doc.get("m_VertexData") or {}
    raw = re.search(r"_typelessdata: ([0-9a-f]+)", txt)
    data = bytes.fromhex(raw.group(1)) if raw else b""
    ib = re.search(r"m_IndexBuffer: ([0-9a-f]+)", txt)
    ibd = bytes.fromhex(ib.group(1)) if ib else b""
    n = vd.get("m_VertexCount", 0)
    chans = vd.get("m_Channels") or []
    # stream layout: each stream packs its channels in order; stream stride = sum of channel sizes in that stream
    strides = collections.defaultdict(int)
    for c in chans:
        dim = c.get("dimension", 0) & 0xF
        if dim:
            strides[c["stream"]] = max(strides[c["stream"]], c["offset"] + dim * VFMT[c["format"]][1])
    stream_off = {}
    off = 0
    for s in sorted(strides):
        stream_off[s] = off
        off += strides[s] * n
        off = (off + 15) // 16 * 16
    def read_ch(ci):
        if ci >= len(chans):
            return None
        c = chans[ci]
        dim = c.get("dimension", 0) & 0xF
        if not dim:
            return None
        fmt, sz = VFMT[c["format"]]
        base, stride = stream_off[c["stream"]], strides[c["stream"]]
        out = []
        for i in range(n):
            o = base + i * stride + c["offset"]
            vals = [struct.unpack_from(fmt, data, o + k * sz)[0] for k in range(dim)]
            if c["format"] == 2:
                vals = [v / 255.0 for v in vals]
            out.append(vals)
        return out
    pos, nrm, colr, uv = read_ch(0), read_ch(1), read_ch(3), read_ch(4)
    fmt16 = doc.get("m_IndexFormat", 0) == 0
    idx = list(struct.unpack("<%dH" % (len(ibd) // 2), ibd)) if fmt16 else list(struct.unpack("<%dI" % (len(ibd) // 4), ibd))
    subs = []
    for sm in doc.get("m_SubMeshes") or []:
        first = sm.get("firstByte", 0) // (2 if fmt16 else 4)
        cnt = sm.get("indexCount", 0)
        bv = sm.get("baseVertex", 0)
        subs.append({"start": first, "count": cnt, "base": bv})
    out = {"name": doc.get("m_Name"), "n": n,
           "pos": [rnd(v, 4) for p3 in pos for v in p3[:3]],
           "nrm": [rnd(v, 3) for p3 in (nrm or []) for v in p3[:3]],
           "uv": [rnd(v, 5) for p2 in (uv or []) for v in p2[:2]],
           "idx": idx, "sub": subs}
    if colr:
        out["col"] = [rnd(v, 3) for c4 in colr for v in c4[:4]]
    xs, ys, zs = pos and [p3[0] for p3 in pos], pos and [p3[1] for p3 in pos], pos and [p3[2] for p3 in pos]
    out["bounds"] = [rnd(min(xs), 3), rnd(min(ys), 3), rnd(min(zs), 3), rnd(max(xs), 3), rnd(max(ys), 3), rnd(max(zs), 3)] if pos else None
    os.makedirs(os.path.join(OUT, "data/meshes"), exist_ok=True)
    with open(os.path.join(OUT, "data/meshes/%s.json" % key), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    S.counts["meshes"] += 1


# ----------------------------------------------------------------------------------------------------------- fonts


def export_font(p, key):
    doc = next(iter(read_yaml(p).values())).d
    fi = doc.get("m_FaceInfo") or {}
    glyphs = {}
    for g in doc.get("m_GlyphTable") or []:
        m, r = g.get("m_Metrics") or {}, g.get("m_GlyphRect") or {}
        glyphs[g["m_Index"]] = [r.get("m_X", 0), r.get("m_Y", 0), r.get("m_Width", 0), r.get("m_Height", 0),
                                rnd(m.get("m_HorizontalBearingX", 0)), rnd(m.get("m_HorizontalBearingY", 0)),
                                rnd(m.get("m_HorizontalAdvance", 0)), rnd(m.get("m_Width", 0)), rnd(m.get("m_Height", 0)),
                                rnd(g.get("m_Scale", 1)), g.get("m_AtlasIndex", 0)]
    chars = {}
    for c in doc.get("m_CharacterTable") or []:
        gi = c.get("m_GlyphIndex")
        if gi in glyphs:
            chars[str(c["m_Unicode"])] = glyphs[gi]
    kern = []
    ft = doc.get("m_FontFeatureTable") or {}
    for pr in ft.get("m_GlyphPairAdjustmentRecords") or []:
        a, b = pr.get("m_FirstAdjustmentRecord") or {}, pr.get("m_SecondAdjustmentRecord") or {}
        kern.append([a.get("m_GlyphIndex"), b.get("m_GlyphIndex"), rnd((a.get("m_GlyphValueRecord") or {}).get("m_XAdvance", 0))])
    atl = []
    os.makedirs(os.path.join(OUT, "data/fonts"), exist_ok=True)
    for i, t in enumerate(doc.get("m_AtlasTextures") or []):
        tp = G2P.get(t.get("guid"))
        if not tp:
            continue
        im = Image.open(tp)
        a = im.getchannel("A") if im.mode in ("RGBA", "LA") else im.convert("L")
        fn = "data/fonts/%s%s.webp" % (key.replace(" ", "_"), "" if i == 0 else "_%d" % i)
        Image.merge("RGB", (a, a, a)).save(os.path.join(OUT, fn), "WEBP", lossless=True, method=6)
        atl.append(fn)
    mat = doc.get("m_Material") or {}
    mk = material_ref(G2P[mat["guid"]]) if mat.get("guid") in G2P else None
    src = doc.get("m_SourceFontFile") or {}
    ttf = None
    if src.get("guid") in G2P:
        sp = G2P[src["guid"]]
        ttf = "data/fonts/" + os.path.basename(sp).replace(" ", "_")
        shutil.copyfile(sp, os.path.join(OUT, ttf))
    fallback = []
    for fb in doc.get("m_FallbackFontAssetTable") or []:
        fp = G2P.get(fb.get("guid"))
        if fp:
            fallback.append(os.path.basename(fp)[:-6])
    out = {"name": key, "face": {"pointSize": rnd(fi.get("m_PointSize", 90)), "scale": rnd(fi.get("m_Scale", 1)),
                                 "lineHeight": rnd(fi.get("m_LineHeight", 0)), "ascent": rnd(fi.get("m_AscentLine", 0)),
                                 "descent": rnd(fi.get("m_DescentLine", 0)), "cap": rnd(fi.get("m_CapLine", 0)),
                                 "mean": rnd(fi.get("m_MeanLine", 0)), "baseline": rnd(fi.get("m_Baseline", 0)),
                                 "underline": rnd(fi.get("m_UnderlineOffset", 0)), "tab": rnd(fi.get("m_TabWidth", 0))},
           "atlas": atl, "aw": doc.get("m_AtlasWidth", 1024), "ah": doc.get("m_AtlasHeight", 1024),
           "padding": doc.get("m_AtlasPadding", 9), "mat": mk, "chars": chars, "kern": kern, "ttf": ttf,
           "fallback": fallback, "weights": {"normal": rnd((doc.get("normalStyle") or 0)), "bold": rnd(doc.get("boldStyle") or 0.75),
                                              "boldSpacing": rnd(doc.get("boldSpacing") or 7)}}
    with open(os.path.join(OUT, "data/fonts/%s.json" % key.replace(" ", "_")), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    S.counts["fonts"] += 1
    return {"file": "data/fonts/%s.json" % key.replace(" ", "_")}


# ------------------------------------------------------------------------------------------------------------ audio


def export_audio():
    ff = shutil.which("ffmpeg")
    out = {}
    # AudioDB / AudioEmitter pick clips by key at runtime, so every clip in the project is exported
    for p in glob.glob(ASSETS + "/AudioClip/*.*"):
        if p.lower().endswith((".wav", ".ogg", ".mp3")):
            S.audio[p.replace("\\", "/")] = os.path.splitext(os.path.basename(p))[0]
    if not ff:
        print("  ffmpeg not found: audio skipped")
        return out
    os.makedirs(os.path.join(OUT, "audio"), exist_ok=True)
    for p, key in sorted(S.audio.items()):
        dst = os.path.join(OUT, "audio", key + ".mp3")
        if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(p):
            try:
                subprocess.run([ff, "-y", "-loglevel", "error", "-i", p, "-codec:a", "libmp3lame", "-q:a", "5", dst],
                               timeout=60, check=True)
            except (subprocess.SubprocessError, OSError) as e:
                print("  audio failed", key, e)
                continue
        ln = 0.0
        try:
            with open(p, "rb") as f:
                hdr = f.read(64)
            if hdr[:4] == b"RIFF":
                import wave
                with wave.open(p) as w:
                    ln = w.getnframes() / float(w.getframerate())
        except Exception:
            pass
        out[key] = {"file": "audio/%s.mp3" % key, "len": rnd(ln, 3)}
        S.counts["audio"] += 1
    return out


# -------------------------------------------------------------------------------------------------------------- main


def group_for(kind, name):
    if kind == "scene":
        if name in MAP_GROUP:
            return MAP_GROUP[name]
        return "hud" if name == "SceneGame" else "ui"
    if re.match(r"^(skin_|Agent_|AgentView)", name):
        return "skins"
    if re.match(r"^(Fx_|smoke_|bullet_|Bullet|Box\d|Trophy)", name):
        return "fx"
    if name in ("LifeBar",):
        return "hud"
    return "ui"


def jdump(rel_path, obj):
    p = os.path.join(OUT, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    return os.path.getsize(p)


def main():
    t0 = time.time()
    all_scenes = "--all" in sys.argv
    build_index()
    print("index: %d guids, %d scripts (%.1fs)" % (len(G2P), len(SCRIPTS), time.time() - t0))
    for sub in ("data/scenes", "data/prefabs", "data/anim", "art", "data/fonts", "data/meshes", "data/assets", "data/assets/skins"):
        d = os.path.join(OUT, sub)
        if os.path.isdir(d) and sub != "data/fonts":
            for f in os.listdir(d):
                if f.endswith((".json", ".webp")):
                    os.remove(os.path.join(d, f))
        os.makedirs(d, exist_ok=True)
    # project
    tm = next(iter(read_yaml(PROJ + "/ProjectSettings/TagManager.asset").values())).d
    ps = next(iter(read_yaml(PROJ + "/ProjectSettings/ProjectSettings.asset").values())).d
    jdump("data/project.json", {"sortingLayers": [{"name": l["name"], "id": l["uniqueID"]} for l in tm.get("m_SortingLayers") or []],
                                "layers": [l or "" for l in tm.get("layers") or []],
                                "colorSpace": "linear" if ps.get("m_ActiveColorSpace") == 1 else "gamma"})
    # prefabs first (skins/fx groups claim shared sprites before UI)
    prefabs = sorted(glob.glob(ASSETS + "/GameObject/*.prefab") + glob.glob(ASSETS + "/Resources/*.prefab"))
    prefab_index = {}
    for p in prefabs:
        name = os.path.basename(p)[:-7]
        if SKIP_PREFAB.match(name):
            continue
        S.group = group_for("prefab", name)
        out = export_file(p.replace("\\", "/"), "prefab", name)
        prefab_index[name] = jdump("data/prefabs/%s.json" % name, out)
    scenes = sorted(os.path.basename(s)[:-6] for s in glob.glob(ASSETS + "/Scenes/*.unity")) if all_scenes else DEFAULT_SCENES
    scene_index = {}
    for s in scenes:
        S.group = group_for("scene", s)
        out = export_file(ASSETS + "/Scenes/%s.unity" % s, "scene", s)
        scene_index[s] = jdump("data/scenes/%s.json" % s, out)
    # ScriptableObjects the view reads at runtime (Resources.Load): GameData (team life bars, skins), AudioDB, skins
    asset_index = []
    S.group = "hud"
    # FgViewDb (FG/View/Resources): prefab, death/hit FX, icon and sfx keys per skin/action/bullet name
    for p in [ASSETS + "/Resources/GameData.asset", ASSETS + "/Resources/AudioDB.asset", ASSETS + "/FG/View/Resources/FgViewDb.asset"] \
            + sorted(glob.glob(ASSETS + "/Resources/skins/*.asset")):
        p = p.replace("\\", "/")
        doc = next(iter(read_yaml(p).values()), None)
        if not doc:
            continue
        r = rel(p)
        name = os.path.splitext(r[len("Resources/"):] if r.startswith("Resources/") else os.path.basename(r))[0]
        out = {"script": script_name(doc.d.get("m_Script")), "name": doc.d.get("m_Name"), "fields": conv_fields(FileCtx({}), doc.d)}
        jdump("data/assets/%s.json" % name, out)
        asset_index.append(name)
        S.counts["assets"] += 1
    # sprites the code picks by name from an atlas (LoadingCellDisplay: "bg_skin_" + team)
    for n in EXTRA_SPRITES:
        sprite_ref(ASSETS + "/Sprite/%s.asset" % n, None)
    print("scenes %d, prefabs %d (%.1fs)" % (len(scene_index), len(prefab_index), time.time() - t0))
    # controllers (may pull more clips), then clips (may pull sprites)
    ctrls = {}
    done = set()
    while S.ctrl_needed - done:
        for p in sorted(S.ctrl_needed - done):
            done.add(p)
            ctrls[ctrl_key(p)] = export_controller(p)
    for p in done:
        for g in S.clip_groups[p]:
            pass
    clips = {}
    # every clip in the project: Unity animation is cheap JSON; game code may play any of them by name
    for p in glob.glob(ASSETS + "/AnimationClip/*.anim"):
        S.clips_needed.add(p.replace("\\", "/"))
    for p in sorted(S.clips_needed):
        gs = S.clip_groups.get(p) or {"ui"}
        S.group = next((x for x in GROUP_PRIORITY if x in gs), "ui")
        clips[clip_key(p)] = export_clip(p)
    jdump("data/anim/clips.json", clips)
    jdump("data/anim/controllers.json", ctrls)
    print("clips %d, controllers %d (%.1fs)" % (len(clips), len(ctrls), time.time() - t0))
    # fonts (also registers their material)
    fonts = {}
    for p, key in list(S.fonts.items()):
        fonts[key] = export_font(p, key)
    # meshes
    for p, key in S.meshes.items():
        export_mesh(p, key)
    finalize_materials()
    jdump("data/materials.json", S.mats)
    if "--no-art" not in sys.argv:
        sp = pack_sprites()
        jdump("data/sprites.json", sp)
    audio = {} if "--no-audio" in sys.argv else export_audio()
    jdump("data/audio.json", audio)
    jdump("data/index.json", {"scenes": sorted(scene_index), "prefabs": sorted(prefab_index), "assets": asset_index, "fonts": fonts,
                              "meshes": sorted(S.meshes.values()), "built": time.strftime("%Y-%m-%d %H:%M")})
    print("done in %.1fs" % (time.time() - t0))
    for k, v in sorted(S.counts.items()):
        print("  %-48s %d" % (k, v))
    if S.unresolved:
        print("unresolved (top 25):")
        for k, v in S.unresolved.most_common(25):
            print("  %-60s %d" % (k, v))


if __name__ == "__main__":
    main()
