"""Bóc VFX mặt biển + cảm giác thuyền của DREDGE cho Biển Mù (games/dredge).

Chạy:  python -I games/dredge/tools/vfx.py [thư mục ExportedProject/Assets của AssetRipper]
Cần: PyYAML, numpy, Pillow. Nguồn mặc định: D:/dredge-ref/ripped/ExportedProject/Assets (YAML văn bản, không cần bundle).
Ghi ra:
  games/dredge/data/vfx.js        window.DR_VFX (hệ hạt BoatTrailParticles, khói ống khói, mặt nạ, vật liệu nước,
                                   WaterController + WaterPropertyModifier, tiếng máy/tiếng vệt/tiếng sóng lớn)
  games/dredge/art/vfx/*.webp     texture gốc nhỏ: Water_Normal, StylisedWater_Tex, SmokeColumn
  D:/dredge-ref/cache/vfx/*.txt   bản đầy đủ của từng ParticleSystem để đối chiếu
Toạ độ: Unity tay trái → three.js tay phải bằng cách đổi dấu z (đỉnh, vị trí); tam giác đảo chiều.
"""
import sys, os, re, io, json, math
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ASSETS = sys.argv[1] if len(sys.argv) > 1 else r"D:\dredge-ref\ripped\ExportedProject\Assets"
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "art", "vfx")
DATAJS = os.path.join(ROOT, "data", "vfx.js")
CACHE = r"D:\dredge-ref\cache\vfx"
PREFAB = os.path.join(ASSETS, "Prefabs", "Player", "PlayerContainer.prefab")
SCENE = os.path.join(ASSETS, "Scenes", "Game.unity")

HDR = re.compile(r"^--- !u!(\d+) &(-?\d+)", re.M)


# ---------------------------------------------------------------- YAML Unity

class UFile:
    """Một tệp YAML Unity, đọc từng khối theo fileID khi cần."""

    def __init__(self, path, lazy=False):
        self.path = path
        self.cache = {}
        if not lazy:
            txt = io.open(path, encoding="utf-8").read()
            ms = list(HDR.finditer(txt))
            self.raw = {}
            for i, m in enumerate(ms):
                end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
                self.raw[m.group(2)] = (m.group(1), txt[m.end():end])
        else:
            # tệp scene 168 MB: chỉ lập chỉ mục vị trí byte
            self.raw = None
            self.index = {}
            with open(path, "rb") as f:
                pos = 0
                prev = None
                for line in f:
                    if line.startswith(b"--- !u!"):
                        m = HDR.match(line.decode("utf-8", "replace"))
                        if prev:
                            self.index[prev[0]] = (prev[1], prev[2], pos)
                        prev = (m.group(2), m.group(1), pos + len(line))
                    pos += len(line)
                if prev:
                    self.index[prev[0]] = (prev[1], prev[2], pos)
            self.fh = open(path, "rb")

    def text(self, fid):
        fid = str(fid)
        if self.raw is not None:
            return self.raw[fid]
        t, a, b = self.index[fid]
        self.fh.seek(a)
        return t, self.fh.read(b - a).decode("utf-8")

    def get(self, fid):
        fid = str(fid)
        if fid not in self.cache:
            t, body = self.text(fid)
            d = yaml.safe_load(body)
            self.cache[fid] = (t, list(d.values())[0])
        return self.cache[fid][1]

    def type(self, fid):
        return self.text(fid)[0]

    def ids(self):
        return self.raw.keys() if self.raw is not None else self.index.keys()


def guid_path(guid):
    """guid → đường dẫn tài sản (bỏ .meta)."""
    if guid in _GUID:
        return _GUID[guid]
    for sub in ("Material", "Mesh", "Texture2D", "Shader", "Audio", "Scripts/Assembly-CSharp"):
        for dp, _, fns in os.walk(os.path.join(ASSETS, sub)):
            for fn in fns:
                if fn.endswith(".meta"):
                    p = os.path.join(dp, fn)
                    with open(p, encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("guid:"):
                                _GUID[line.split()[1]] = p[:-5]
                                break
        if guid in _GUID:
            return _GUID[guid]
    return None


_GUID = {}
TEXOUT = {}


def script_guid(cls):
    with open(os.path.join(ASSETS, "Scripts", "Assembly-CSharp", cls + ".cs.meta"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("guid:"):
                return line.split()[1]


# ---------------------------------------------------------------- cây GameObject trong prefab

class Tree:
    def __init__(self, uf):
        self.uf = uf
        self.go_name = {}
        self.tr_of_go = {}
        self.go_of_tr = {}
        self.father = {}
        for fid in uf.ids():
            t = uf.type(fid)
            if t == "1":
                g = uf.get(fid)
                self.go_name[fid] = str(g.get("m_Name"))
            elif t in ("4", "224"):
                tr = uf.get(fid)
                go = str(tr["m_GameObject"]["fileID"])
                self.tr_of_go[go] = fid
                self.go_of_tr[fid] = go
                self.father[fid] = str(tr["m_Father"]["fileID"])

    def path(self, go):
        parts = []
        tr = self.tr_of_go.get(go)
        while tr and tr != "0":
            parts.append(self.go_name[self.go_of_tr[tr]])
            tr = self.father.get(tr)
        return "/".join(reversed(parts))

    def find(self, path_suffix):
        return [go for go in self.go_name if ("/" + self.path(go)).endswith("/" + path_suffix)]

    def comps(self, go):
        return [str(c["component"]["fileID"]) for c in self.uf.get(go)["m_Component"]]

    def comp(self, go, utype):
        for c in self.comps(go):
            if self.uf.type(c) == utype:
                return self.uf.get(c)

    def mono(self, go, cls):
        g = script_guid(cls)
        for c in self.comps(go):
            if self.uf.type(c) == "114":
                m = self.uf.get(c)
                if m["m_Script"].get("guid") == g:
                    return m

    def local(self, go):
        """vị trí/quaternion cục bộ (Unity)."""
        tr = self.uf.get(self.tr_of_go[go])
        p, q, s = tr["m_LocalPosition"], tr["m_LocalRotation"], tr["m_LocalScale"]
        return [p["x"], p["y"], p["z"]], [q["x"], q["y"], q["z"], q["w"]], [s["x"], s["y"], s["z"]]

    def rel_pos(self, go, ancestor_go):
        """vị trí của go trong hệ toạ độ ancestor (chỉ cộng dồn tịnh tiến/quay/tỉ lệ)."""
        M = np.eye(4)
        tr = self.tr_of_go[go]
        stop = self.tr_of_go[ancestor_go]
        while tr != stop:
            M = trs_mat(*self.local(self.go_of_tr[tr])) @ M
            tr = self.father[tr]
        return M


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs_mat(p, q, s):
    M = np.eye(4)
    M[:3, :3] = quat_mat(q) @ np.diag(s)
    M[:3, 3] = p
    return M


def r(v, n=4):
    if isinstance(v, float):
        v = round(v, n)
        return 0.0 if v == 0 else v
    if isinstance(v, (list, tuple)):
        return [r(x, n) for x in v]
    if isinstance(v, dict):
        return {k: r(x, n) for k, x in v.items()}
    return v


def unity_to_three(p):
    return [p[0], p[1], -p[2]]


# ---------------------------------------------------------------- ParticleSystem → dạng gọn

def curve(c):
    """AnimationCurve → [[t, v, inSlope, outSlope], ...]."""
    return [[k["time"], k["value"], k["inSlope"], k["outSlope"]] for k in c.get("m_Curve", [])]


def mmc(m):
    """MinMaxCurve: {mode, ...}. mode 0 hằng, 1 đường cong×scalar, 2 ngẫu nhiên giữa 2 đường cong, 3 ngẫu nhiên giữa 2 hằng."""
    s = m["minMaxState"]
    if s == 0:
        return {"c": m["scalar"]}
    if s == 3:
        return {"min": m["minScalar"], "max": m["scalar"]}
    if s == 1:
        return {"curve": curve(m["maxCurve"]), "k": m["scalar"]}
    return {"curveMin": curve(m["minCurve"]), "curveMax": curve(m["maxCurve"]), "k": m["scalar"]}


def gradient(g):
    """Gradient → {c:[[t,r,g,b]], a:[[t,a]]} (màu sRGB như Inspector)."""
    nc, na = g["m_NumColorKeys"], g["m_NumAlphaKeys"]
    cs = [[g["ctime%d" % i] / 65535, g["key%d" % i]["r"], g["key%d" % i]["g"], g["key%d" % i]["b"]] for i in range(nc)]
    al = [[g["atime%d" % i] / 65535, g["key%d" % i]["a"]] for i in range(na)]
    return {"c": cs, "a": al, "mode": g.get("m_Mode", 0)}


def mmg(m):
    s = m["minMaxState"]
    col = lambda c: [c["r"], c["g"], c["b"], c["a"]]
    if s == 0:
        return {"color": col(m["maxColor"])}
    if s == 1:
        return {"gradient": gradient(m["maxGradient"])}
    if s == 2:
        return {"min": col(m["minColor"]), "max": col(m["maxColor"])}
    if s == 3:
        return {"gradMin": gradient(m["minGradient"]), "gradMax": gradient(m["maxGradient"])}
    return {"randomColor": gradient(m["maxGradient"])}


SHAPE = {0: "sphere", 2: "hemisphere", 4: "cone", 5: "box", 6: "mesh", 7: "coneShell", 8: "coneVolume",
         10: "circle", 12: "edge", 13: "meshRenderer", 17: "donut", 18: "rectangle"}
RENDER = {0: "billboard", 1: "stretched", 2: "horizontal", 3: "vertical", 4: "mesh", 5: "none"}
SIM = {0: "local", 1: "world", 2: "custom"}


def particle(uf, ps, psr):
    I = ps["InitialModule"]
    out = {
        "duration": ps["lengthInSec"], "looping": ps["looping"], "prewarm": ps["prewarm"],
        "simulationSpace": SIM[ps["moveWithTransform"]], "scalingMode": ps["scalingMode"],
        "emitterVelocityMode": ps.get("emitterVelocityMode"),
        "startLifetime": mmc(I["startLifetime"]), "startSpeed": mmc(I["startSpeed"]),
        "startSize": mmc(I["startSize"]), "startRotation": mmc(I["startRotation"]),
        "startColor": mmg(I["startColor"]), "gravityModifier": mmc(I["gravityModifier"]),
        "maxParticles": I["maxNumParticles"], "size3D": I.get("size3D", 0),
    }
    if I.get("size3D"):
        out["startSizeY"] = mmc(I["startSizeY"]); out["startSizeZ"] = mmc(I["startSizeZ"])
    if I.get("rotation3D"):
        out["startRotationX"] = mmc(I["startRotationX"]); out["startRotationY"] = mmc(I["startRotationY"])
    S = ps["ShapeModule"]
    if S["enabled"]:
        sh = {"type": SHAPE.get(S["type"], S["type"]), "angle": S["angle"], "radius": S["radius"]["value"],
              "radiusThickness": S["radiusThickness"], "arc": S["arc"]["value"], "length": S["length"],
              "position": S["m_Position"], "rotation": S["m_Rotation"], "scale": S["m_Scale"],
              "randomDirection": S["randomDirectionAmount"], "sphericalDirection": S["sphericalDirectionAmount"],
              "randomPosition": S["randomPositionAmount"], "alignToDirection": S["alignToDirection"],
              "boxThickness": S["boxThickness"], "placementMode": S["placementMode"]}
        if S["type"] in (6, 13):
            sh["mesh"] = mesh_name(S["m_Mesh"])
        out["shape"] = sh
    E = ps["EmissionModule"]
    if E["enabled"]:
        out["emission"] = {"rateOverTime": mmc(E["rateOverTime"]), "rateOverDistance": mmc(E["rateOverDistance"]),
                           "bursts": [{"time": b["time"], "count": mmc(b["countCurve"]), "cycles": b["cycleCount"],
                                       "interval": b["repeatInterval"], "probability": b.get("probability", 1)}
                                      for b in E.get("m_Bursts", [])]}
    for key, name in (("SizeModule", "sizeOverLifetime"), ("RotationModule", "rotationOverLifetime")):
        M = ps[key]
        if M["enabled"]:
            out[name] = {"curve": mmc(M["curve"]), "separateAxes": M["separateAxes"]}
            if M["separateAxes"]:
                out[name]["x"] = mmc(M["x"]); out[name]["y"] = mmc(M["y"])
    if ps["ColorModule"]["enabled"]:
        out["colorOverLifetime"] = mmg(ps["ColorModule"]["gradient"])
    V = ps["VelocityModule"]
    if V["enabled"]:
        out["velocityOverLifetime"] = {k: mmc(V[k]) for k in ("x", "y", "z", "radial", "speedModifier")}
        out["velocityOverLifetime"]["space"] = "world" if V["inWorldSpace"] else "local"
        out["velocityOverLifetime"]["orbital"] = [mmc(V[k]) for k in ("orbitalX", "orbitalY", "orbitalZ")]
    IV = ps["InheritVelocityModule"]
    if IV["enabled"]:
        out["inheritVelocity"] = {"mode": IV["m_Mode"], "curve": mmc(IV["m_Curve"])}
    LE = ps.get("LifetimeByEmitterSpeedModule")
    if LE and LE["enabled"]:
        out["lifetimeByEmitterSpeed"] = {"curve": mmc(LE["m_Curve"]), "range": LE["m_Range"]}
    C = ps["ClampVelocityModule"]
    if C["enabled"]:
        out["limitVelocity"] = {"magnitude": mmc(C["magnitude"]), "dampen": C["dampen"], "drag": mmc(C["drag"]),
                                "multiplyDragBySize": C["multiplyDragByParticleSize"],
                                "multiplyDragByVelocity": C["multiplyDragByParticleVelocity"],
                                "space": "world" if C["inWorldSpace"] else "local"}
    F = ps["ForceModule"]
    if F["enabled"]:
        out["force"] = {k: mmc(F[k]) for k in ("x", "y", "z")}
        out["force"]["space"] = "world" if F["inWorldSpace"] else "local"
    N = ps["NoiseModule"]
    if N["enabled"]:
        out["noise"] = {"strength": mmc(N["strength"]), "frequency": N["frequency"], "scrollSpeed": mmc(N["scrollSpeed"]),
                        "damping": N["damping"], "octaves": N["octaves"]}
    U = ps["UVModule"]
    if U["enabled"]:
        out["textureSheet"] = {"tilesX": U["tilesX"], "tilesY": U["tilesY"], "frameOverTime": mmc(U["frameOverTime"]),
                               "startFrame": mmc(U["startFrame"]), "cycles": U["cycles"], "animation": U["animationType"]}
    for key in ("SubModule", "CollisionModule", "TrailModule", "LightsModule", "CustomDataModule",
                "SizeBySpeedModule", "RotationBySpeedModule", "ColorBySpeedModule", "TriggerModule"):
        if key in ps and ps[key].get("enabled"):
            out.setdefault("otherModulesEnabled", []).append(key)
    rd = {"mode": RENDER.get(psr["m_RenderMode"], psr["m_RenderMode"]), "alignment": psr["m_RenderAlignment"],
          "maxParticleSize": psr["m_MaxParticleSize"], "minParticleSize": psr["m_MinParticleSize"],
          "lengthScale": psr["m_LengthScale"], "velocityScale": psr["m_VelocityScale"],
          "sortingFudge": psr["m_SortingFudge"], "pivot": psr["m_Pivot"]}
    if psr["m_RenderMode"] == 4:
        rd["mesh"] = mesh_name(psr["m_Mesh"])
    mats = [m for m in psr.get("m_Materials", []) if m.get("guid")]
    rd["materials"] = [material(m["guid"]) for m in mats]
    out["renderer"] = rd
    return out


# ---------------------------------------------------------------- Mesh (hex trong YAML)

MESHES = {}


def mesh_name(ref):
    p = guid_path(ref.get("guid")) if ref.get("guid") else None
    if not p:
        return None
    name = os.path.splitext(os.path.basename(p))[0]
    if name not in MESHES:
        MESHES[name] = read_mesh(p)
    return name


def read_mesh(p):
    d = list(yaml.safe_load(io.open(p, encoding="utf-8").read().split("\n", 3)[3]).values())[0]
    vd = d["m_VertexData"]
    n = vd["m_VertexCount"]
    ch = vd["m_Channels"]
    raw = bytes.fromhex(vd["_typelessdata"])
    # chỉ hỗ trợ một stream float32 (đủ cho các mesh nhỏ ở đây)
    # kích thước (byte) của VertexFormat: Float32, Float16, UNorm8, SNorm8, UNorm16, SNorm16, UInt8, SInt8, UInt16, SInt16, UInt32, SInt32
    FSZ = [4, 2, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4]
    stride = 0
    for c in ch:
        if c["dimension"] & 15 and c["stream"] == 0:
            stride = max(stride, c["offset"] + FSZ[c["format"]] * (c["dimension"] & 15))
    assert ch[0]["format"] == 0 and ch[0]["stream"] == 0, "mesh %s: vị trí không phải float32 ở stream 0" % p
    rows = np.frombuffer(raw[:n * stride], dtype=np.uint8).reshape(n, stride)
    def vec3(c):
        if c["format"] == 0:
            return rows[:, c["offset"]: c["offset"] + 12].copy().view(np.float32).reshape(n, 3)
        return rows[:, c["offset"]: c["offset"] + 6].copy().view(np.float16).reshape(n, 3).astype(np.float32)
    pos = vec3(ch[0])
    nor = vec3(ch[1]) if ch[1]["dimension"] & 15 and ch[1]["format"] in (0, 1) and ch[1]["stream"] == 0 else None
    ib = bytes.fromhex(d["m_IndexBuffer"])
    fmt = np.uint16 if d.get("m_IndexFormat", 0) == 0 else np.uint32
    idx = np.frombuffer(ib, dtype=fmt).astype(np.int64)
    sm = d["m_SubMeshes"][0]
    idx = idx[: sm["indexCount"]] if len(d["m_SubMeshes"]) == 1 else idx
    # Unity → three.js: đổi dấu z, đảo chiều tam giác
    pos[:, 2] *= -1
    if nor is not None:
        nor[:, 2] *= -1
    tri = idx.reshape(-1, 3)[:, [0, 2, 1]]
    out = {"position": r(pos.flatten().tolist(), 4), "index": tri.flatten().tolist()}
    if nor is not None:
        out["normal"] = r(nor.flatten().tolist(), 3)
    return out


# ---------------------------------------------------------------- khối lượng của MeshCollider lồi

def convex_hull(P, eps=1e-7):
    """Bao lồi 3D tăng dần (PhysX nấu MeshCollider convex thành bao lồi các đỉnh). Trả về tam giác hướng ra ngoài."""
    P = np.unique(np.round(P, 6), axis=0)
    n = len(P)
    i0 = 0
    i1 = int(np.argmax(np.linalg.norm(P - P[i0], axis=1)))
    d = np.linalg.norm(np.cross(P - P[i0], P[i1] - P[i0]), axis=1)
    i2 = int(np.argmax(d))
    nrm = np.cross(P[i1] - P[i0], P[i2] - P[i0])
    i3 = int(np.argmax(np.abs((P - P[i0]) @ nrm)))
    faces = [(i0, i1, i2), (i0, i2, i3), (i0, i3, i1), (i1, i3, i2)]
    cen = P[[i0, i1, i2, i3]].mean(axis=0)

    def orient(f):
        a, b, c = f
        nn = np.cross(P[b] - P[a], P[c] - P[a])
        return f if nn @ (P[a] - cen) > 0 else (a, c, b)
    faces = [orient(f) for f in faces]
    for k in range(n):
        if k in (i0, i1, i2, i3):
            continue
        vis = []
        for f in faces:
            a, b, c = f
            nn = np.cross(P[b] - P[a], P[c] - P[a])
            if nn @ (P[k] - P[a]) > eps * max(1.0, np.linalg.norm(nn)):
                vis.append(f)
        if not vis:
            continue
        edges = {}
        for a, b, c in vis:
            for e in ((a, b), (b, c), (c, a)):
                edges[e] = edges.get(e, 0) + 1
        horizon = [e for e in edges if (e[1], e[0]) not in edges]
        vs = set(vis)
        faces = [f for f in faces if f not in vs] + [(a, b, k) for a, b in horizon]
    return P, np.array(faces)


def mass_properties(P, F, mass=1.0):
    """Khối đặc đồng chất: tâm khối và tensor quán tính quanh tâm khối (theo khối lượng mass)."""
    o = P.mean(axis=0)
    C0 = np.array([[2, 1, 1], [1, 2, 1], [1, 1, 2]]) / 120.0
    vol = 0.0
    mom = np.zeros(3)
    C = np.zeros((3, 3))
    for a, b, c in F:
        A = np.column_stack([P[a] - o, P[b] - o, P[c] - o])
        det = np.linalg.det(A)
        vol += det / 6
        mom += det / 6 * (A.sum(axis=1) / 4)
        C += det * A @ C0 @ A.T
    com = mom / vol
    C = C - vol * np.outer(com, com)
    I = np.trace(C) * np.eye(3) - C
    I *= mass / vol
    return {"volume": vol, "com": (com + o).tolist(), "inertia": I.tolist(), "principal": np.linalg.eigvalsh(I).tolist()}


# ---------------------------------------------------------------- vật liệu

def material(guid):
    p = guid_path(guid)
    d = list(yaml.safe_load(io.open(p, encoding="utf-8").read().split("\n", 3)[3]).values())[0]
    sp = d["m_SavedProperties"]
    shader = guid_path(d["m_Shader"].get("guid", "")) if d.get("m_Shader") else None
    sname, props = shader_props(shader) if shader else (None, {})
    out = {"name": d["m_Name"], "shader": sname, "queue": d["m_CustomRenderQueue"], "floats": {}, "colors": {}, "textures": {}}
    # chỉ giữ thuộc tính có trong khối Properties của shader (còn lại là rác của shader cũ)
    for k, v in sp["m_Floats"].items():
        if k in props or k in ("_SrcBlend", "_DstBlend", "_ZWrite", "_Surface", "_Cull", "_Cutoff"):
            out["floats"][props.get(k, k)] = v
    for k, v in sp["m_Colors"].items():
        if k in props:
            out["colors"][props[k]] = [v["r"], v["g"], v["b"], v["a"]]
    for k, v in sp["m_TexEnvs"].items():
        g = v["m_Texture"].get("guid")
        if k in props and g:
            tp = guid_path(g)
            out["textures"][props[k]] = os.path.basename(tp) if tp else "missing:" + g
    return out


def shader_props(path):
    """Đọc khối Properties: tên nội bộ → tên hiển thị (bỏ trùng bằng hậu tố tên nội bộ)."""
    txt = io.open(path, encoding="utf-8").read()
    name = re.search(r'^Shader "([^"]+)"', txt).group(1)
    props = {}
    for m in re.finditer(r'^\s*(?:\[[^\]]*\]\s*)*(\w+)\s*\("([^"]*)"', txt, re.M):
        internal, disp = m.group(1), m.group(2)
        if disp == "Texture2D":
            disp = internal  # tên chung "Texture2D" thì giữ tên nội bộ
        props[internal] = disp
    return name, props


# ---------------------------------------------------------------- texture

def export_tex(fname, out, size, mode="RGBA", quality=90, lossless=False):
    src = os.path.join(ASSETS, "Texture2D", fname)
    im = Image.open(src).convert(mode)
    if im.size[0] > size:
        im = im.resize((size, size * im.size[1] // im.size[0]), Image.LANCZOS)
    dst = os.path.join(ART, out)
    im.save(dst, "WEBP", quality=quality, lossless=lossless, method=6)
    return {"src": "art/vfx/" + out, "orig": "Assets/Texture2D/" + fname, "size": list(im.size), "bytes": os.path.getsize(dst)}


# ---------------------------------------------------------------- âm thanh

def audio_source(a):
    clip = a.get("m_audioClip", {})
    p = guid_path(clip["guid"]) if clip.get("guid") else None
    return {"clip": os.path.relpath(p, ASSETS).replace(os.sep, "/") if p else None, "volume": a["m_Volume"],
            "pitch": a["m_Pitch"], "loop": a["Loop"], "minDistance": a["MinDistance"], "maxDistance": a["MaxDistance"]}


def main():
    os.makedirs(ART, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    uf = UFile(PREFAB)
    tree = Tree(uf)
    player = tree.find("PlayerContainer/Player")[0]
    out = {"source": "PlayerContainer.prefab, Material/*.mat, Scenes/Game.unity (AssetRipper 2026-10-07)"}

    # ---- hệ hạt
    systems = {}

    def take(key, go, rel_to):
        ps = tree.comp(go, "198")
        psr = tree.comp(go, "199")
        d = particle(uf, ps, psr)
        M = tree.rel_pos(go, rel_to)
        d["path"] = tree.path(go)
        d["layer"] = uf.get(go)["m_Layer"]
        d["active"] = uf.get(go)["m_IsActive"]
        d["pos"] = r(unity_to_three(M[:3, 3].tolist()))
        # hướng phát (trục z cục bộ của emitter) trong hệ của rel_to, three.js
        fwd = M[:3, 2] / (np.linalg.norm(M[:3, 2]) or 1)
        up = M[:3, 1] / (np.linalg.norm(M[:3, 1]) or 1)
        d["forward"] = r(unity_to_three(fwd.tolist()))
        d["up"] = r(unity_to_three(up.tolist()))
        systems[key] = d
        with io.open(os.path.join(CACHE, key + ".txt"), "w", encoding="utf-8") as f:
            f.write(uf.text(tree.comps(go)[1])[1])

    trail = tree.find("Player/BoatTrailParticles")[0]
    take("boatTrail", trail, player)
    for t in range(1, 6):
        boat = tree.find("Player/Boat%d" % t)[0]
        for name in ("ChimneySmoke/SmokePuffs", "ChimneySmoke1/SmokePuffs", "ChimneySmoke2/SmokePuffs"):
            gos = tree.find("Boat%d/%s" % (t, name))
            for i, go in enumerate(gos):
                take("smoke%d_%s" % (t, name.split("/")[0]), go, boat)
    # WaterSplash nằm trong PlayerTeleport/TeleportEffect (tắt): hiệu ứng dịch chuyển, không phải bọt mũi thuyền
    splash = tree.find("TeleportEffect/WaterSplash")
    out["notes"] = [
        "BoatTrailParticles (con của Player, layer Water) là toàn bộ vệt nước của thuyền: hạt dạng mesh SphereLowPoly_2 "
        "(cầu thấp đa giác) mang FoamParticle_Mat (FloatingParticle_Shader, FoamColoured = 1 nên lấy màu _FoamColor của "
        "WaterController), phát từ bề mặt mesh BoatFrontWakeMesh_0 (hình chữ V ôm mũi) theo quãng đường đi.",
        "FoamMask (mesh FoamCutOut, FoamMask_Mat = Unlit/DepthMaskShader, hàng đợi 3010) và WaterMask (mesh WaterCutOut, "
        "WaterMask_Mat_0, hàng đợi 2090) chỉ ghi chiều sâu: che nước (2090) và che bọt (3010 < 3020 của hạt bọt) bên trong "
        "vỏ thuyền. Chúng không ghi vào render target bọt nào.",
        "FoamCamera.cs (render target R8 _FoamTexture) không được gắn ở scene/prefab nào của bản 1.5.3: mã chết.",
        "WaterSplash (%d hệ) nằm ở %s, đang tắt: hiệu ứng của kỹ năng dịch chuyển, không phải bọt mũi thuyền. Bản gốc "
        "không có hệ hạt bọt tung ở mũi; vệt V ở mũi là BoatTrailParticles." % (len(splash), tree.path(splash[0]) if splash else "-"),
    ]
    out["systems"] = systems

    # ---- mặt nạ chiều sâu (mesh)
    masks = {}
    for t in range(1, 6):
        boat = tree.find("Player/Boat%d" % t)[0]
        for nm in ("WaterMask", "FoamMask"):
            go = [g for g in tree.find("Boat%d/%s" % (t, nm))][0]
            mf = tree.comp(go, "33")
            mr = tree.comp(go, "23")
            M = tree.rel_pos(go, boat)
            masks.setdefault("Boat%d" % t, {})[nm] = {
                "mesh": mesh_name(mf["m_Mesh"]), "material": material(mr["m_Materials"][0]["guid"])["name"],
                "queue": material(mr["m_Materials"][0]["guid"])["queue"], "pos": r(unity_to_three(M[:3, 3].tolist())),
                "scale": r([float(np.linalg.norm(M[:3, i])) for i in range(3)])}
    out["masks"] = masks

    # ---- cột khói ống khói: LineRenderer + SmokeColumn.cs (vị trí kéo lê theo lerpSpeeds, SmokeColumn.cs:53-74)
    smoke = {}
    sc_guid = script_guid("SmokeColumn")
    for t in range(1, 6):
        boat = tree.find("Player/Boat%d" % t)[0]
        for go in tree.go_name:
            if tree.go_name[go] != "SmokeColumn" or not tree.path(go).startswith(tree.path(boat) + "/"):
                continue
            lr = tree.comp(go, "120")
            sm = tree.mono(go, "SmokeColumn")
            P = lr["m_Parameters"]
            M = tree.rel_pos(go, player)
            mat = material(lr["m_Materials"][0]["guid"])
            wd = sm["windDirection"]
            smoke.setdefault("Boat%d" % t, []).append({
                "path": tree.path(go), "active": uf.get(go)["m_IsActive"], "pos": r(unity_to_three(M[:3, 3].tolist())),
                "positionCount": len(lr["m_Positions"]), "positionSpacing": sm["positionSpacing"],
                "windDirection": r(unity_to_three([wd["x"], wd["y"], wd["z"]])), "initialUvOffset": sm["initialUvOffest"],
                "widthMultiplier": P["widthMultiplier"], "widthCurve": curve(P["widthCurve"]),
                "colorGradient": gradient(P["colorGradient"]), "alignment": P["alignment"], "textureMode": P["textureMode"],
                "worldSpace": lr["m_UseWorldSpace"], "material": mat})
    for lst in smoke.values():
        for c in lst:
            tf = c["material"]["textures"].get("_MainTex")
            if tf and "smokeColumn" not in TEXOUT:
                TEXOUT["smokeColumn"] = export_tex(tf, "smoke_column.webp", 64, "RGBA", lossless=True)
    out["smokeColumns"] = smoke

    # ---- khối lượng: Rigidbody không ghi centerOfMass/inertiaTensor ⇒ PhysX tính từ collider mô phỏng (không tính trigger):
    # MeshCollider lồi của BoatN. Khối lượng 1 (Rigidbody.m_Mass).
    mp = {}
    for t in range(1, 6):
        boat = tree.find("Player/Boat%d" % t)[0]
        mc = tree.comp(boat, "64")
        if not mc or mc["m_IsTrigger"]:
            continue
        mesh_name(mc["m_Mesh"])
        p = guid_path(mc["m_Mesh"]["guid"])
        m = read_mesh(p)
        V = np.array(m["position"]).reshape(-1, 3) * np.array([1, 1, -1])  # về lại Unity
        M = tree.rel_pos(boat, player)
        V = (M[:3, :3] @ V.T).T + M[:3, 3]
        Ph, Fh = convex_hull(V)
        props = mass_properties(Ph, Fh, 1.0)
        I = np.array(props["inertia"])
        S = np.diag([1, 1, -1])
        I3 = S @ I @ S  # đổi dấu z: tensor đổi theo
        mp["Boat%d" % t] = {"mesh": os.path.splitext(os.path.basename(p))[0], "hullFaces": int(len(Fh)),
                            "volume": r(props["volume"], 4), "com": r(unity_to_three(props["com"]), 4),
                            "inertia": r(I3.tolist(), 5), "principal": r(props["principal"], 5)}
    out["massProperties"] = mp

    # ---- âm thanh trên thuyền
    aud = {}
    eng = tree.find("PlayerCenteredAudio/EngineAudioSource")[0]
    pe = tree.mono(eng, "PlayerEngineAudio")
    srcs = {c: uf.get(c) for c in tree.comps(eng) if uf.type(c) == "82"}
    main_src = srcs.get(str(pe["audioSource"]["fileID"]))
    aud["engine"] = {k: pe[k] for k in ("velocityModifier", "minPitch", "maxPitch", "minVolume", "maxVolume",
                                         "autoMoveVelocityModifier", "autoMovePitchModifier")}
    aud["engine"]["source"] = audio_source(main_src) if main_src else None
    aud["engine"]["origin"] = "PlayerContainer.prefab: EngineAudioSource/PlayerEngineAudio (PlayerEngineAudio.cs:123-140)"
    wk = tree.find("PlayerCenteredAudio/BoatWakeAudioSource")[0]
    bw = tree.mono(wk, "BoatWakeAudio")
    aud["wake"] = {k: bw[k] for k in ("velocityModifier", "minVolume", "maxVolume")}
    aud["wake"]["source"] = audio_source(tree.comp(wk, "82"))
    aud["wake"]["origin"] = "BoatWakeAudioSource/BoatWakeAudio (BoatWakeAudio.cs:24-28)"
    hv = tree.find("PlayerCenteredAudio/HeavyWavesLappingAudioSource")[0]
    hw = tree.mono(hv, "HeavyWavesAudio")
    aud["heavyWaves"] = {k: hw[k] for k in ("minSteepness", "maxSteepness", "minVolume", "maxVolume")}
    aud["heavyWaves"]["source"] = audio_source(tree.comp(hv, "82"))
    aud["heavyWaves"]["origin"] = "HeavyWavesLappingAudioSource/HeavyWavesAudio (HeavyWavesAudio.cs:21)"
    lp = tree.find("PlayerCenteredAudio/WavesLappingAudioSource")[0]
    aud["wavesLapping"] = {"source": audio_source(tree.comp(lp, "82"))}
    out["audio"] = aud

    # ---- vật liệu nước + texture
    water = material(_mat_guid("Water_Mat.mat"))
    out["waterMaterial"] = water
    out["foamParticleMaterial"] = material(_mat_guid("FoamParticle_Mat_0.mat"))
    tex = TEXOUT
    tex["waterNormal"] = export_tex("Water_Normal.png", "water_normal.webp", 128, "RGB", lossless=True)
    tex["waterTexture"] = export_tex("StylisedWater_Tex.png", "stylised_water.webp", 128, "L", lossless=True)
    for k, s in systems.items():
        for m in s["renderer"]["materials"]:
            for tn, tf in m["textures"].items():
                if tf and not tf.startswith("missing") and tn in ("Sprite", "_MainTex", "_BaseMap"):
                    key = os.path.splitext(tf)[0]
                    if key not in tex:
                        tex[key] = export_tex(tf, key.lower() + ".webp", 128)
    out["textures"] = tex

    # ---- scene: WaterController + WaterPropertyModifier
    sc = UFile(SCENE, lazy=True)
    wc_guid = script_guid("WaterController")
    wpm_guid = script_guid("WaterPropertyModifier")
    found = {"wc": None, "wpm": []}
    with open(SCENE, "rb") as f:
        prev = None
        for line in f:
            if line.startswith(b"--- !u!114 &"):
                prev = line[12:].strip().decode()
            elif b"m_Script:" in line and prev:
                if wc_guid.encode() in line:
                    found["wc"] = prev
                elif wpm_guid.encode() in line:
                    found["wpm"].append(prev)
    wc = sc.get(found["wc"])
    col = lambda c: r([c["r"], c["g"], c["b"], c["a"]])
    prop = lambda p: {"waterDepth": p["waterDepth"], "foamColor": col(p["foamColor"]),
                      "shallowColor": col(p["shallowColor"]), "deepColor": col(p["deepColor"])}
    mods = []
    for fid in found["wpm"]:
        m = sc.get(fid)
        go = str(m["m_GameObject"]["fileID"])
        g = sc.get(go)
        # vị trí thế giới: cộng dồn theo cha
        trf = next(str(c["component"]["fileID"]) for c in g["m_Component"] if sc.type(str(c["component"]["fileID"])) == "4")
        M = np.eye(4)
        while trf != "0":
            t = sc.get(trf)
            p, q, s = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
            M = trs_mat([p["x"], p["y"], p["z"]], [q["x"], q["y"], q["z"], q["w"]], [s["x"], s["y"], s["z"]]) @ M
            trf = str(t["m_Father"]["fileID"])
        mods.append({"name": g["m_Name"], "enabled": m["m_Enabled"] and g["m_IsActive"],
                     "pos": r(unity_to_three(M[:3, 3].tolist()), 2), "fullValueRadius": m["fullValueRadius"],
                     "partialValueRadius": m["partialValueRadius"], **prop(m["waterProperty"])})
    out["waterController"] = {"default": prop(wc["defaultWaterProperties"]), "modifiers": mods,
                              "origin": "Game.unity: WaterController (WaterController.cs:36-66)"}
    # khói SmokePuffs chỉ phát khi Haste (BoostAbility.cs:188 đặt rateOverTime); để ở cache, không đưa vào data
    for k in [k for k in systems if k.startswith("smoke")]:
        with io.open(os.path.join(CACHE, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(r(systems.pop(k)), f, ensure_ascii=False, indent=1)
    out["meshes"] = {k: MESHES[k] for k in sorted({s["shape"].get("mesh") for s in systems.values() if "shape" in s} |
                                                  {s["renderer"].get("mesh") for s in systems.values()}) if k}

    js = ("// Generated by games/dredge/tools/vfx.py from PlayerContainer.prefab, Water_Mat.mat, Game.unity. Do not edit.\n"
          "window.DR_VFX = " + json.dumps(r(out), ensure_ascii=False, indent=1) + ";\n")
    with io.open(DATAJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    print("data/vfx.js %d byte; hệ hạt: %s; mesh: %s; texture: %s; modifier: %d" % (
        len(js.encode()), ", ".join(systems), ", ".join(MESHES), ", ".join(tex), len(mods)))


def _mat_guid(fname):
    with open(os.path.join(ASSETS, "Material", fname + ".meta"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("guid:"):
                return line.split()[1]


if __name__ == "__main__":
    main()
