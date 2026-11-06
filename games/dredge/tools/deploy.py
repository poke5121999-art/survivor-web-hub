"""
Bóc dữ liệu cho bẫy cua, mồi và lưới kéo (js/deploy.js) từ YAML AssetRipper của DREDGE 1.5.3.

Nguồn (chỉ đọc):
  GameObject/PlacedHarvestPOI.prefab          phao bẫy cua (GameSceneInitializer.placedPOIPrefab)
  GameObject/PlacedMaterialHarvestPOI.prefab  phao bẫy vật liệu (placedMaterialPOIPrefab, dùng cho placedMaterialHHarvesterData)
  GameObject/BaitPOI.prefab                   điểm mồi (BaitAbility.baitPOIPrefab)
  Mesh/*.asset, Material/*.mat, Texture2D/*.png  lưới, vật liệu Lit_Shader, ảnh
  Prefabs/Player/PlayerContainer.prefab       BaitAbility (baitItems, deepFormItemData)
  Scenes/Game.unity                           GameSceneInitializer (placedMaterialHHarvesterData)

Đầu ra:
  data/deploy.js       window.DR_DEPLOY = { prefabs, meshes, materials, materialPotItem, bait }
  art/deploy/*.webp    ảnh albedo / phát sáng (32x32, lossless)

Chạy:  python -I games/dredge/tools/deploy.py      (~3 giây, cần PyYAML, numpy, Pillow; không cần index_bundles.py)
Chạy lại ra đúng từng byte (khoá sắp xếp, số làm tròn cố định).
"""
import io
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
import yaml
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, ".."))
RIP = os.environ.get("DREDGE_RIP", r"D:\dredge-ref\ripped\ExportedProject\Assets")
OUT_JS = os.path.join(GAME, "data", "deploy.js")
OUT_ART = os.path.join(GAME, "art", "deploy")
HDR = re.compile(r"^--- !u!(\d+) &(-?\d+)", re.M)

# Tên thuộc tính của Lit_Shader (Shader Graphs_Lit_Shader_2.shader, khối Properties)
ALBEDO = "Texture2D_9aa7ba2263944b48bbf43c218dc48459"
EMISSION = "Texture2D_c7b8c5c57d6443a5a9f86b68269754f3"
FLICKER = "BOOLEAN_3E4CD0FFFCDB4460AA7D73A352CD2455"
EMISSIVE = "BOOLEAN_0965F30455D645A4AD7F01AF266AE935"
FLICKER_TEX = "Texture2D_d75ba12263b343d3ad393c05a6dda1b7"


def log(*a):
    print("[deploy]", *a)


# ---------------------------------------------------------------- guid -> tệp
GUID = {}


def index_guids():
    for sub in ("Mesh", "Material", "Texture2D", "AnimatorController", "AnimatorOverrideController", "GameObject", os.path.join("Data", "SpatialItemData")):
        for dp, _, fns in os.walk(os.path.join(RIP, sub)):
            for fn in sorted(fns):
                if not fn.endswith(".meta"):
                    continue
                with io.open(os.path.join(dp, fn), encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("guid:"):
                            GUID[line.split()[1]] = os.path.join(dp, fn[:-5])
                            break


def asset_of(ref):
    g = ref.get("guid") if isinstance(ref, dict) else None
    return GUID.get(g) if g else None


def stem(p):
    return os.path.splitext(os.path.basename(p))[0]


# ---------------------------------------------------------------- YAML Unity
class UFile:
    def __init__(self, path):
        txt = io.open(path, encoding="utf-8").read()
        ms = list(HDR.finditer(txt))
        self.raw = {}
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
            self.raw[m.group(2)] = (m.group(1), txt[m.end():end])
        self.cache = {}

    def get(self, fid):
        fid = str(fid)
        if fid not in self.cache:
            t, body = self.raw[fid]
            self.cache[fid] = (t, list(yaml.safe_load(body).values())[0])
        return self.cache[fid]

    def of_type(self, t):
        return [k for k, (tt, _) in self.raw.items() if tt == t]


ITEMS_BY_ASSET = {}


def item_id(path):
    """id của một item: `id` nằm trong blob Odin nên tra ngược theo tên asset ở data/items.js (do data.py ghi, chạy trước)."""
    if not ITEMS_BY_ASSET:
        txt = io.open(os.path.join(GAME, "data", "items.js"), encoding="utf-8").read()
        items = json.loads(txt[txt.index("=") + 1: txt.rstrip().rindex(";")])
        for k, v in items.items():
            ITEMS_BY_ASSET.setdefault(v.get("asset"), k)
    name = stem(path)
    if name not in ITEMS_BY_ASSET:
        raise LookupError("item asset not found in data/items.js: " + name)
    return ITEMS_BY_ASSET[name]


def script_name(uf, d):
    p = None
    g = d.get("m_Script", {}).get("guid")
    if g:
        meta = os.path.join(RIP, "Scripts", "Assembly-CSharp")
        if not SCRIPTS:
            for fn in os.listdir(meta):
                if fn.endswith(".cs.meta"):
                    with io.open(os.path.join(meta, fn), encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("guid:"):
                                SCRIPTS[line.split()[1]] = fn[:-8]
                                break
        p = SCRIPTS.get(g)
    return p


SCRIPTS = {}


def rnd(v, n=5):
    if isinstance(v, float):
        r = round(v, n)
        return 0.0 if r == 0 else r
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    return v


# ---------------------------------------------------------------- Mesh (hex trong YAML)
FSZ = [4, 2, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4]          # VertexFormat: Float32, Float16, UNorm8, SNorm8, UNorm16, ...
NPT = {0: np.float32, 1: np.float16}


def read_mesh(path):
    d = list(yaml.safe_load(io.open(path, encoding="utf-8").read().split("\n", 3)[3]).values())[0]
    vd = d["m_VertexData"]
    n = vd["m_VertexCount"]
    ch = vd["m_Channels"]
    raw = bytes.fromhex(vd["_typelessdata"])
    stride = 0
    for c in ch:
        dim = c["dimension"] & 15
        if dim and c["stream"] == 0:
            stride = max(stride, c["offset"] + FSZ[c["format"]] * dim)
    if any((c["dimension"] & 15) and c["stream"] != 0 for c in ch):
        raise ValueError("mesh %s: more than one vertex stream" % path)
    rows = np.frombuffer(raw[: n * stride], dtype=np.uint8).reshape(n, stride)

    def chan(i, want):
        c = ch[i]
        dim = c["dimension"] & 15
        if not dim:
            return None
        if c["format"] not in NPT:
            raise ValueError("mesh %s: channel %d format %d unsupported" % (path, i, c["format"]))
        sz = FSZ[c["format"]]
        a = rows[:, c["offset"]: c["offset"] + sz * dim].copy().view(NPT[c["format"]]).reshape(n, dim).astype(np.float64)
        return a[:, :want]

    pos, nor, uv = chan(0, 3), chan(1, 3), chan(4, 2)
    ib = bytes.fromhex(d["m_IndexBuffer"])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get("m_IndexFormat", 0) == 0 else np.uint32).astype(np.int64)
    tris = []
    for sm in d["m_SubMeshes"]:
        a = sm["firstByte"] // (2 if d.get("m_IndexFormat", 0) == 0 else 4)
        tris.append(idx[a: a + sm["indexCount"]] + sm.get("baseVertex", 0))
    tri = np.concatenate(tris).reshape(-1, 3)
    # Unity (tay trái) -> three.js: đổi dấu z, đảo chiều tam giác; UV Unity v lên = three.js v lên (flipY = false)
    pos[:, 2] *= -1
    if nor is not None:
        nor[:, 2] *= -1
    tri = tri[:, [0, 2, 1]]
    out = {"p": rnd(pos.flatten().tolist(), 4), "i": tri.flatten().tolist()}
    if nor is not None:
        out["n"] = rnd(nor.flatten().tolist(), 3)
    if uv is not None:
        out["uv"] = rnd(uv.flatten().tolist(), 4)
    return out


# ---------------------------------------------------------------- vật liệu Lit_Shader
def export_tex(ref):
    p = asset_of(ref.get("m_Texture", {}))
    if not p:
        return None
    name = stem(p)
    os.makedirs(OUT_ART, exist_ok=True)
    out = os.path.join(OUT_ART, name + ".webp")
    Image.open(p).convert("RGBA").save(out, "WEBP", lossless=True, quality=100, method=6, exact=True)
    return "art/deploy/" + name + ".webp"


def read_material(path):
    d = list(yaml.safe_load(io.open(path, encoding="utf-8").read().split("\n", 3)[3]).values())[0]
    sp = d["m_SavedProperties"]
    tex = sp.get("m_TexEnvs", {}) or {}
    fl = sp.get("m_Floats", {}) or {}
    col = sp.get("m_Colors", {}) or {}
    m = {"name": d["m_Name"]}
    if ALBEDO in tex:
        m["map"] = export_tex(tex[ALBEDO])
        m["emissiveMap"] = export_tex(tex[EMISSION]) if fl.get(EMISSIVE, 1) else None
        m["lightStrength"] = fl.get("_LightStrength", 4)
        m["flicker"] = bool(fl.get(FLICKER, 0))
        gp = asset_of(tex.get(FLICKER_TEX, {}).get("m_Texture", {})) if m["flicker"] else None
        if gp:
            # LightFlickerGradient: shader lấy kênh R theo u = vị trí vật − thời gian (xem js/world.js LightsFlicker); ghi hàng đầu (sRGB 0..1)
            im = Image.open(gp).convert("RGB")
            m["flickerGradient"] = {"name": stem(gp), "r": [round(im.getpixel((x, 0))[0] / 255, 4) for x in range(im.size[0])]}
    else:
        bc = col.get("_BaseColor") or col.get("_Color") or {"r": 1, "g": 1, "b": 1, "a": 1}
        m["color"] = rnd([bc["r"], bc["g"], bc["b"], bc["a"]], 4)
    return m


# ---------------------------------------------------------------- prefab -> cây nút
def unity_q(q):
    # quaternion Unity (x, y, z, w) -> three.js (-x, -y, z, w)
    return rnd([-q["x"], -q["y"], q["z"], q["w"]], 6)


def read_prefab(rel, meshes, mats):
    uf = UFile(os.path.join(RIP, rel))
    gos = {k: uf.get(k)[1] for k in uf.of_type("1")}
    trs = {}
    for k in uf.of_type("4"):
        d = uf.get(k)[1]
        trs[str(d["m_GameObject"]["fileID"])] = d
    roots = [g for g, d in trs.items() if str(d["m_Father"]["fileID"]) == "0"]
    if len(roots) != 1:
        raise ValueError("%s: %d root GameObjects" % (rel, len(roots)))
    nodes, index = [], {}
    out = {"src": rel}

    def comps(g):
        for c in gos[g]["m_Component"]:
            yield uf.get(c["component"]["fileID"])

    def walk(g, parent):
        t = trs[g]
        p, s = t["m_LocalPosition"], t["m_LocalScale"]
        nd = {"name": gos[g]["m_Name"], "parent": parent, "pos": rnd([p["x"], p["y"], -p["z"]], 5),
              "q": unity_q(t["m_LocalRotation"]), "s": rnd([s["x"], s["y"], s["z"]], 5), "active": bool(gos[g]["m_IsActive"])}
        for ty, d in comps(g):
            if ty == "33" and gos[g]["m_IsActive"]:
                # nút lưới đang tắt mà clip không bật lại (BuoyMesh/CrabPotParticle: clip Place bật nút hạt cùng tên ở CrabPotBuoy) thì bỏ
                mp = asset_of(d["m_Mesh"])
                if mp:
                    meshes.setdefault(stem(mp), read_mesh(mp))
                    nd["mesh"] = stem(mp)
            elif ty == "23" and gos[g]["m_IsActive"]:
                mp = asset_of(d["m_Materials"][0]) if d.get("m_Materials") else None
                if mp:
                    mats.setdefault(stem(mp), read_material(mp))
                    nd["mat"] = stem(mp)
            elif ty == "198":
                nd["particles"] = True                     # ParticleSystem: luồng VFX vẽ theo tên GameObject
            elif ty == "95":
                cp = asset_of(d["m_Controller"])
                out["animator"] = {"node": len(nodes), "controller": stem(cp) if cp else None}
            elif ty == "136" and parent == -1:
                c = d["m_Center"]
                out["collider"] = {"radius": d["m_Radius"], "height": d["m_Height"], "center": rnd([c["x"], c["y"], -c["z"]], 4)}
            elif ty == "114" and parent == -1:
                sn = script_name(uf, d)
                if sn == "SimpleBuoyantObject":
                    out["buoyant"] = {"every": d["timeBetweenUpdatingWaveSteepnessSec"], "depth": d["objectDepth"]}
                elif sn == "Cullable":
                    out["cullRadius"] = d["sphereRadius"]
                elif sn in ("PlacedHarvestPOI", "BaitHarvestPOI", "HarvestPOI"):
                    out["poi"] = sn
                    out["_states"] = {k: str(d[k]["fileID"]) for k in ("idleObj", "readyObj", "brokenObj") if k in d}
                    hp = asset_of(d.get("harvestParticlePrefab", {}))
                    if hp:
                        out["harvestParticlePrefab"] = stem(hp)
        index[g] = len(nodes)
        nodes.append(nd)
        for ch in t["m_Children"]:
            cg = str(uf.get(ch["fileID"])[1]["m_GameObject"]["fileID"])
            walk(cg, index[g])

    walk(roots[0], -1)
    out["nodes"] = nodes
    # PlacedHarvestPOI.UpdateVisuals: idle (bẫy trống), ready (có đồ), broken (hết độ bền)
    st = out.pop("_states", {})
    out["states"] = {k[:-3]: index[v] for k, v in sorted(st.items()) if v in index}
    return out


# ---------------------------------------------------------------- cảnh và PlayerContainer
def scene_field(name):
    """Đọc một dòng `name: {fileID..., guid...}` của Game.unity (168 MB, đọc theo dòng)."""
    pat = ("  " + name + ":").encode()
    with open(os.path.join(RIP, "Scenes", "Game.unity"), "rb") as f:
        for line in f:
            if line.startswith(pat):
                m = re.search(rb"guid: ([0-9a-f]{32})", line)
                return m.group(1).decode() if m else None
    raise LookupError("Game.unity: field not found: " + name)


def bait_ability():
    uf = UFile(os.path.join(RIP, "Prefabs", "Player", "PlayerContainer.prefab"))
    for k in uf.of_type("114"):
        t, body = uf.raw[k]
        if "baitPOIPrefab:" not in body:
            continue
        d = uf.get(k)[1]
        return {
            "prefab": stem(asset_of(d["baitPOIPrefab"])),
            "items": [item_id(asset_of(r)) for r in d["baitItems"]],
            "deepForm": item_id(asset_of(d["deepFormItemData"])),
        }
    raise LookupError("PlayerContainer.prefab: BaitAbility not found")


def main():
    index_guids()
    log("guid: %d" % len(GUID))
    meshes, mats = {}, {}
    prefabs = {}
    for name in ("PlacedHarvestPOI", "PlacedMaterialHarvestPOI", "BaitPOI"):
        prefabs[name] = read_prefab("GameObject/%s.prefab" % name, meshes, mats)
        log(name, len(prefabs[name]["nodes"]), "nút")
    mat_item = item_id(GUID[scene_field("placedMaterialHHarvesterData")])
    bait = bait_ability()
    data = {
        "v": 1,
        "prefabs": prefabs,
        "meshes": meshes,
        "materials": mats,
        "materialPotItem": mat_item,                     # GameSceneInitializer.placedMaterialHHarvesterData
        "bait": bait,                                     # BaitAbility (PlayerContainer.prefab)
    }
    js = ("/* generated by tools/deploy.py from DREDGE 1.5.3 (AssetRipper YAML) - do not edit */\n"
          "window.DR_DEPLOY=" + json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + ";\n")
    with io.open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    log("data/deploy.js %.1f KB, %d mesh, %d vật liệu, bẫy vật liệu = %s, mồi = %s" % (
        len(js) / 1024, len(meshes), len(mats), mat_item, ",".join(bait["items"])))


if __name__ == "__main__":
    main()
