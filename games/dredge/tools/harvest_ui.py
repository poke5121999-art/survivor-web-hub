# -*- coding: utf-8 -*-
"""Bóc màn câu cá / nạo vét (HarvestMinigameView) và hiệu ứng điểm câu của DREDGE cho Biển Mù.

Chạy (python 3.8, PyYAML, Pillow có webp, ffmpeg trong PATH; UnityPy chỉ cần cho phần `spotfx`):
    python -I games/dredge/tools/harvest_ui.py [--no-spotfx]
Đọc    D:/dredge-ref/ripped/ExportedProject/Assets (bản AssetRipper: Scenes/Game.unity, GameObject/*.prefab, AnimationClip/*.anim,
       Sprite/*.asset + Texture2D/*.png) và D:/dredge-ref/audio (ogg).  Không `cat` Game.unity (168 MB): tệp được chỉ mục byte.
Ghi    games/dredge/art/ui/minigame/harvest_ui.js   window.DR_HARVEST_UI = {...}  (cây RectTransform, hằng số prefab, clip hoạt hình, màu thẻ loại, spotfx)
       games/dredge/art/ui/minigame/sprites/*.webp  (sprite gốc, cạnh dài nguyên bản, KHÔNG thu nhỏ như art/ui/sprites)
       games/dredge/art/ui/minigame/audio/*.mp3     (ba tiếng cánh cổng xoắn ốc của DLC2)
Chạy lại bao nhiêu lần cũng ra cùng kết quả.

Bẫy đã sập (ghi lại để khỏi sập lần nữa):
- `m_LocalEulerAnglesHint` của AssetRipper bị ĐẢO DẤU so với `m_LocalRotation`. Luôn đọc góc từ quaternion: rotZ = 2*atan2(z, w).
- Các trường [SerializeField] của HarvestMinigameView (stockText, progressBarIconMinY...) bị mất vì lớp là SerializedMonoBehaviour (Odin): suy từ bố cục.
- Đường dẫn trong AnimationClip có thể là `path_0xHASH_xxx` (băm không tra ngược được): chỉ biết chắc `Ring`/`Indicator` của vòng xoay cá qua giá trị.
- AssetReference (tiếng) chỉ là guid addressables: tra bằng catalog.json (cat() dưới đây), KHÔNG tra được bằng .meta của AssetRipper.
- Sprite trong AssetRipper là hình cắt chặt (m_Rect); Image đơn giản kéo CẢ m_Rect vào RectTransform. Cắt đúng m_Rect rồi để CSS kéo giãn.
"""
import base64, bisect, collections, glob, io, json, math, os, pickle, re, struct, subprocess, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import yaml
from PIL import Image
import odin

REF = "D:/dredge-ref"
ASSETS = REF + "/ripped/ExportedProject/Assets/"
SCENE = ASSETS + "Scenes/Game.unity"
AA = REF + "/game/DREDGE.v1.5.3_LinkNeverDie.Com/DREDGE_Data/StreamingAssets/aa/StandaloneWindows/"
GAME = os.path.normpath(os.path.join(HERE, ".."))
OUT = GAME + "/art/ui/minigame"
NO_SPOTFX = "--no-spotfx" in sys.argv


# ------------------------------------------------------------------ guid -> asset path
def build_guids():
    cache = REF + "/cache/harvest_guids.pkl"
    if os.path.exists(cache):
        return pickle.load(open(cache, "rb"))
    g = {}
    for d, _, fs in os.walk(ASSETS):
        for f in fs:
            if f.endswith(".meta"):
                try:
                    t = open(os.path.join(d, f), encoding="utf-8", errors="replace").read(400)
                except OSError:
                    continue
                m = re.search(r"guid: (\w+)", t)
                if m:
                    g[m.group(1)] = os.path.relpath(os.path.join(d, f[:-5]), ASSETS).replace(os.sep, "/")
    pickle.dump(g, open(cache, "wb"))
    return g


GUID = build_guids()


def script_guid(name):
    return re.search(r"guid: (\w+)", open(ASSETS + "Scripts/Assembly-CSharp/%s.cs.meta" % name).read()).group(1)


# ------------------------------------------------------------------ Game.unity chỉ mục byte
class Scene:
    def __init__(self, path):
        cache = REF + "/cache/harvest_scene_idx.pkl"
        st = os.stat(path)
        key = (st.st_size, int(st.st_mtime))
        idx = None
        if os.path.exists(cache):
            k, idx = pickle.load(open(cache, "rb"))
            if k != key:
                idx = None
        if idx is None:
            idx, pos, hdr = {}, 0, re.compile(rb"^--- !u!(\d+) &(-?\d+)")
            with open(path, "rb") as f:
                for line in f:
                    if line.startswith(b"--- "):
                        m = hdr.match(line)
                        if m:
                            idx[int(m.group(2))] = (int(m.group(1)), pos)
                    pos += len(line)
            pickle.dump((key, idx), open(cache, "wb"))
        self.idx, self.f = idx, open(path, "rb")
        self.offs = sorted(o for _, o in idx.values())
        self.by_off = {o: i for i, (_, o) in idx.items()}
        self.cache = {}

    def block(self, i):
        t, o = self.idx[i]
        k = bisect.bisect_right(self.offs, o)
        end = self.offs[k] if k < len(self.offs) else None
        self.f.seek(o)
        return self.f.read((end - o) if end else -1).decode("utf-8", "replace")

    def y(self, i):
        if i not in self.cache:
            d = yaml.safe_load(self.block(i).split("\n", 1)[1])
            k = next(iter(d))
            self.cache[i] = (k, d[k])
        return self.cache[i]

    def owner_of_guid(self, guid):
        """Mọi MonoBehaviour dùng script guid này (grep thô theo byte)."""
        r = subprocess.run(["grep", "-b", "-o", "-a", "guid: " + guid, SCENE], capture_output=True, text=True)
        out = []
        for l in r.stdout.splitlines():
            b = int(l.split(":")[0])
            out.append(self.by_off[self.offs[bisect.bisect_right(self.offs, b) - 1]])
        return out


def kids_of(S, go):
    tf = tf_of(S, go)
    return [S.y(c)[1]["m_GameObject"]["fileID"] for c in S.y(tf)[1].get("m_Children", []) for c in [c["fileID"]]]


def tf_of(S, go):
    for c in S.y(go)[1]["m_Component"]:
        cid = c["component"]["fileID"]
        if S.idx[cid][0] in (4, 224):
            return cid


def comps_of(S, go):
    return [c["component"]["fileID"] for c in S.y(go)[1]["m_Component"]]


# ------------------------------------------------------------------ chuẩn hoá giá trị
def col(c):
    return "#%02x%02x%02x%02x" % tuple(int(round(c[k] * 255)) for k in "rgba") if isinstance(c, dict) and "r" in c else c


def r3(v):
    return round(v, 4) if isinstance(v, float) else v


def v2(v):
    return [r3(float(v["x"])), r3(float(v["y"]))]


def rotz(q):
    return round(2 * math.degrees(math.atan2(q["z"], q["w"])), 3)


def asset_name(guid):
    p = GUID.get(guid)
    return os.path.basename(p).rsplit(".", 1)[0] if p else None


SPRITES = {}   # tên sprite -> {guid, path}


def sprite_ref(ref):
    if not isinstance(ref, dict) or not ref.get("guid"):
        return None
    g = ref["guid"]
    p = GUID.get(g)
    if not p or not p.endswith(".asset") or "/Sprite" not in "/" + p and not p.startswith("Textures/"):
        return None
    name = os.path.basename(p)[:-6]
    SPRITES[name] = p
    return name


def comp_dump(S, c, local_names):
    """Một component -> dict gọn (Image / TMP / MonoBehaviour tự viết)."""
    t, d = S.y(c)
    if t in ("RectTransform", "Transform", "CanvasRenderer", "Animator", "CanvasGroup", "Canvas", "AudioSource"):
        return None
    if t != "MonoBehaviour":
        return {"type": t}
    sg = d["m_Script"].get("guid")
    sp = GUID.get(sg, "")
    sn = os.path.basename(sp)[:-3] if sp.endswith(".cs") else os.path.basename(sp)
    if "m_FillMethod" in d and "m_Sprite" in d:   # UnityEngine.UI.Image
        o = {"script": "Image", "spr": sprite_ref(d["m_Sprite"]), "col": col(d["m_Color"]), "type": d["m_Type"], "pa": d["m_PreserveAspect"]}
        if d["m_Type"] == 3:
            o["fill"] = [r3(d["m_FillAmount"]), d["m_FillMethod"], d["m_FillOrigin"], d["m_FillClockwise"]]
        if d.get("m_Material", {}).get("guid"):
            o["mat"] = asset_name(d["m_Material"]["guid"])
        if not d.get("m_Enabled", 1):
            o["off"] = 1
        return o
    if "m_text" in d:                              # TextMeshProUGUI
        return {"script": "TMP", "text": d["m_text"], "size": d["m_fontSize"], "col": col(d["m_fontColor"]), "halign": d["m_HorizontalAlignment"],
                "valign": d["m_VerticalAlignment"], "auto": d["m_enableAutoSizing"], "min": d["m_fontSizeMin"], "max": d["m_fontSizeMax"]}
    o = {"script": sn}
    for k, v in d.items():
        if k.startswith("m_") or k in ("serializationData",):
            continue
        if isinstance(v, dict) and "fileID" in v:
            if v.get("guid"):
                o[k] = asset_name(v["guid"])
            elif v["fileID"]:
                o[k] = {"ref": v["fileID"]}
        elif isinstance(v, (int, float, str, bool)):
            o[k] = r3(v) if isinstance(v, float) else v
        elif isinstance(v, dict) and set(v) <= {"r", "g", "b", "a"}:
            o[k] = col(v)
        elif isinstance(v, dict) and all(isinstance(x, (int, float)) for x in v.values()):
            o[k] = {a: r3(b) for a, b in v.items()}
        elif isinstance(v, list):
            o[k] = [({"ref": x["fileID"]} if isinstance(x, dict) and "fileID" in x else x) for x in v if not isinstance(x, dict) or "fileID" in x]
    return o


def walk(S, go, parent_path, out_map, skip=()):
    gd = S.y(go)[1]
    tf = tf_of(S, go)
    td = S.y(tf)[1]
    path = (parent_path + "/" + gd["m_Name"]) if parent_path else gd["m_Name"]
    node = {"n": gd["m_Name"], "on": gd["m_IsActive"], "id": go}
    if "m_SizeDelta" in td:
        node["rt"] = {"amin": v2(td["m_AnchorMin"]), "amax": v2(td["m_AnchorMax"]), "piv": v2(td["m_Pivot"]), "sd": v2(td["m_SizeDelta"]),
                      "ap": v2(td["m_AnchoredPosition"]), "sc": [r3(td["m_LocalScale"]["x"]), r3(td["m_LocalScale"]["y"])], "rot": rotz(td["m_LocalRotation"])}
    cs = []
    for c in comps_of(S, go):
        o = comp_dump(S, c, None)
        if o:
            o["cid"] = c
            cs.append(o)
    if cs:
        node["c"] = cs
    out_map[go] = path
    ks = []
    for c in td.get("m_Children", []):
        cg = S.y(c["fileID"])[1]["m_GameObject"]["fileID"]
        if S.y(cg)[1]["m_Name"] in skip:
            continue
        ks.append(walk(S, cg, path, out_map, skip))
    if ks:
        node["k"] = ks
    return node


# ------------------------------------------------------------------ prefab
def load_prefab(rel):
    txt = open(ASSETS + rel, encoding="utf-8").read()
    docs = {}
    for m in re.finditer(r"^--- !u!(\d+) &(-?\d+)(?: stripped)?\n(.*?)(?=^--- |\Z)", txt, re.M | re.S):
        d = yaml.safe_load(m.group(3))
        if d:
            docs[int(m.group(2))] = (int(m.group(1)), next(iter(d)), next(iter(d.values())))
    return docs


def prefab_tree(rel):
    D = load_prefab(rel)
    go_of_tf = {i: v[2]["m_GameObject"]["fileID"] for i, v in D.items() if v[0] in (4, 224)}
    root_tf = next(i for i in go_of_tf if D[i][2]["m_Father"]["fileID"] == 0)

    def mk(tf):
        td = D[tf][2]
        go = go_of_tf[tf]
        gd = D[go][2]
        node = {"n": gd["m_Name"], "on": gd["m_IsActive"]}
        if "m_SizeDelta" in td:
            node["rt"] = {"amin": v2(td["m_AnchorMin"]), "amax": v2(td["m_AnchorMax"]), "piv": v2(td["m_Pivot"]), "sd": v2(td["m_SizeDelta"]),
                          "ap": v2(td["m_AnchoredPosition"]), "sc": [r3(td["m_LocalScale"]["x"]), r3(td["m_LocalScale"]["y"])], "rot": rotz(td["m_LocalRotation"])}
        cs = []
        for c in gd["m_Component"]:
            cid = c["component"]["fileID"]
            t, k, d = D[cid]
            if t != 114:
                continue
            sg = d["m_Script"].get("guid")
            if "m_FillMethod" in d and "m_Sprite" in d:
                o = {"script": "Image", "spr": sprite_ref(d["m_Sprite"]), "col": col(d["m_Color"]), "type": d["m_Type"], "pa": d["m_PreserveAspect"]}
            else:
                sp = GUID.get(sg, "")
                o = {"script": os.path.basename(sp)[:-3]}
                for kk, vv in d.items():
                    if kk in ("regularBallSprite", "negativeBallSprite"):
                        o[kk] = sprite_ref(vv)
                        continue
                    if kk.startswith("m_") or isinstance(vv, dict):
                        if kk == "scaleCurve":
                            o[kk] = [[r3(p["time"]), r3(p["value"]), r3(p["inSlope"]), r3(p["outSlope"])] for p in vv["m_Curve"]]
                        continue
                    if isinstance(vv, (int, float, str, bool)):
                        o[kk] = r3(vv) if isinstance(vv, float) else vv
            cs.append(o)
        if cs:
            node["c"] = cs
        ks = [mk(c["fileID"]) for c in td.get("m_Children", [])]
        if ks:
            node["k"] = ks
        return node

    return mk(root_tf)


# ------------------------------------------------------------------ AnimationClip
def clip(name):
    t = open(ASSETS + "AnimationClip/%s.anim" % name, encoding="utf-8").read().split("\n", 3)[3]
    d = yaml.safe_load(t)["AnimationClip"]
    st = d["m_AnimationClipSettings"]
    out = {"len": r3(st["m_StopTime"]), "loop": st["m_LoopTime"], "curves": []}

    def keys(c):
        ks = []
        for k in c["curve"]["m_Curve"]:
            v = k["value"]
            ks.append([r3(k["time"]), v if not isinstance(v, dict) else [r3(v[a]) for a in "xyz"], r3(k["inSlope"]) if not isinstance(k["inSlope"], dict) else 0,
                       r3(k["outSlope"]) if not isinstance(k["outSlope"], dict) else 0])
        return ks

    for key, kind in (("m_FloatCurves", "float"), ("m_ScaleCurves", "scale"), ("m_EulerCurves", "euler"), ("m_PositionCurves", "pos")):
        for c in d.get(key) or []:
            out["curves"].append({"path": c["path"], "attr": c.get("attribute", ""), "kind": kind, "keys": keys(c)})
    return out


# ------------------------------------------------------------------ catalog addressables (guid -> đường dẫn)
def catalog():
    d = json.load(open(AA + "../catalog.json", encoding="utf-8"))
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
    out = {}
    for k, b in zip(keys, buckets):
        if isinstance(k, str) and re.fullmatch(r"[0-9a-f]{32}", k) and b:
            out[k] = d["m_InternalIds"][entries[b[0]][0]]
    return out


# ------------------------------------------------------------------ sprite -> webp
def export_sprite(name, rel):
    t = open(ASSETS + rel, encoding="utf-8").read()
    g = lambda pat: re.search(pat, t, re.S)
    rect = [float(g(r"m_Rect:.*?%s: ([\-0-9.e]+)" % k).group(1)) for k in ("x", "y", "width", "height")]
    border = [float(x) for x in g(r"m_Border: \{x: ([\-0-9.e]+), y: ([\-0-9.e]+), z: ([\-0-9.e]+), w: ([\-0-9.e]+)").groups()]
    ppu = float(g(r"m_PixelsToUnits: ([\-0-9.e]+)").group(1))
    tex = GUID[g(r"texture: \{fileID: 2800000, guid: (\w+)").group(1)]
    im = Image.open(ASSETS + tex).convert("RGBA")
    x, y, w, h = rect
    box = (int(math.floor(x + 1e-3)), int(math.floor(im.height - y - h + 1e-3)), int(math.ceil(x + w - 1e-3)), int(math.ceil(im.height - y - 1e-3)))
    crop = im.crop(box)
    os.makedirs(OUT + "/sprites", exist_ok=True)
    crop.save(OUT + "/sprites/%s.webp" % name, "WEBP", lossless=True, method=6)
    return {"w": crop.width, "h": crop.height, "ppu": ppu, "border": border}


# ------------------------------------------------------------------ phông "Front Page Neue" (chữ UI của TextMeshPro)
def export_font():
    """15 KB, chỉ có ASCII + Latin-1: js/minigame.js dùng nó cho chuỗi thuần Latin-1, còn lại rơi về Signika (tiếng Việt)."""
    import UnityPy
    from fontTools import subset
    from fontTools.ttLib import TTFont
    bundle = glob.glob(AA + "game_assets_all_*.bundle")[0]
    for o in UnityPy.load(bundle).objects:
        if o.type.name == "Font":
            f = o.read()
            if f.m_Name == "Front Page Neue":
                font = TTFont(io.BytesIO(bytes(f.m_FontData)))
                opts = subset.Options(); opts.flavor = "woff2"
                sb = subset.Subsetter(opts); sb.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D])
                sb.subset(font)
                os.makedirs(OUT + "/fonts", exist_ok=True)
                font.flavor = "woff2"
                font.save(OUT + "/fonts/FrontPageNeue.woff2")
                return


# ------------------------------------------------------------------ hiệu ứng điểm câu (HarvestableParticles)
def _curve(c):
    """MinMaxCurve hằng / ngẫu nhiên giữa hai số -> [min, max]; đường cong -> {k:[[t,v]...], s: scalar}."""
    if not isinstance(c, dict) or "minMaxState" not in c:
        return [c, c]
    st, sc = c["minMaxState"], c.get("scalar", 0)
    if st == 0:
        return [sc, sc]
    if st == 3:
        return [c.get("minScalar", 0), sc]
    key = lambda cc: [[r3(k["time"]), r3(k["value"])] for k in cc["m_Curve"]]
    return {"s": sc, "k": key(c["maxCurve"])}


def build_spotfx():
    """Mỗi item thu hoạch -> prefab hạt (CodParticles...) -> tham số bầy cá/mảnh vụn + hình bóng mesh nhìn từ trên xuống.

    Nguồn: item (itemdata bundle) cho tên prefab + độ sâu; GameObject/*.prefab (AssetRipper) cho tham số hạt;
    Mesh trong bundle cho hình bóng. Đầu ra: spotfx = {items, prefabs, atlas} + art/ui/minigame/fish_atlas.webp."""
    import UnityPy
    from PIL import ImageDraw
    ix = json.load(open(REF + "/cache/bundle_index.json", encoding="utf-8"))
    by_bundle = collections.defaultdict(list)
    for k, v in ix["containers"].items():
        if "/Data/SpatialItemData/" in k and v["type"] == "MonoBehaviour":
            by_bundle[v["bundle"]].append(v["path_id"])
    items, meshes = {}, {}
    for bundle, pids in by_bundle.items():
        env = UnityPy.load(AA + bundle)
        for sf in [c for c in env.cabs.values() if hasattr(c, "objects")]:
            for pid in pids:
                o = sf.objects.get(pid)
                if o is None:
                    continue
                try:
                    t = o.read_typetree()
                except Exception:
                    continue
                pp = t.get("harvestParticlePrefab")
                if "id" not in t or not pp or pp.get("m_PathID") == 0 or pp.get("m_FileID") != 0:
                    continue
                go = sf.objects.get(pp["m_PathID"])
                if go is None:
                    continue
                items[t["id"]] = {"p": go.read().m_Name, "depth": r3(t.get("harvestParticleDepthOffset", 0)), "ovr": t.get("overrideHarvestParticleDepth", 0), "flat": t.get("flattenParticleShape", 0)}
            for o in sf.objects.values():
                if o.type.name == "Mesh":
                    m = o.read()
                    meshes.setdefault(m.m_Name, m)
    # ---- tham số từng prefab hạt
    prefabs, need = {}, []
    for pn in sorted({v["p"] for v in items.values()}):
        rel = "GameObject/%s.prefab" % pn
        if not os.path.exists(ASSETS + rel):
            continue
        D = load_prefab(rel)
        hp = next((d for t, k, d in D.values() if t == 114 and "particlesPerStock" in d), None)
        if hp is None:
            continue
        out = {"pps": hp["particlesPerStock"], "special": bool(hp["specialParticlePrefab"].get("fileID") or hp["specialParticlePrefab"].get("guid")),
               "water": os.path.basename(GUID.get(hp["disturbedWaterParticles"].get("guid"), "")).replace(".prefab", ""),
               "ooze": bool(hp["disturbedOozeParticles"].get("guid"))}
        psid = hp["HarvestableParticleSystem"]["fileID"]
        if psid and psid in D:
            d = D[psid][2]; I = d["InitialModule"]; sh = d["ShapeModule"]; vel = d["VelocityModule"]; em = d["EmissionModule"]
            col = I["startColor"]["maxColor"] if I["startColor"]["minMaxState"] in (0, 3) else I["startColor"]["maxGradient"]["key0"]
            out.update({"life": _curve(I["startLifetime"]), "size": _curve(I["startSize"]), "maxP": I["maxNumParticles"], "rate": _curve(em["rateOverTime"])[0],
                        "shape": sh["type"], "radius": r3(sh["radius"]["value"] if isinstance(sh["radius"], dict) else sh["radius"]), "donut": r3(sh.get("donutRadius", 0)),
                        "thick": r3(sh.get("radiusThickness", 1)), "orb": _curve(vel["orbitalY"]) if vel["enabled"] else [0, 0],
                        "vy": _curve(vel["y"]) if vel["enabled"] else [0, 0], "color": col2hex(col), "pos": [r3(sh["m_Position"]["x"]), r3(sh["m_Position"]["y"]), r3(sh["m_Position"]["z"])]})
            rend = next(dd for t, k, dd in D.values() if t == 199 and dd["m_GameObject"]["fileID"] == d["m_GameObject"]["fileID"])
            mn = os.path.basename(GUID.get(rend["m_Mesh"].get("guid"), "")).replace(".asset", "")
            out["mesh"] = re.sub(r"_\d+$", "", mn)
            need.append(out["mesh"])
        prefabs[pn] = out
    # ---- hình bóng mesh nhìn từ trên xuống (+Z của mesh = hướng bơi) -> atlas 64x64
    names = sorted(set(need))
    cols = 8
    rows = (len(names) + cols - 1) // cols
    atlas = Image.new("L", (cols * 64, max(1, rows) * 64), 0)
    sil = {}
    for i, nm in enumerate(names):
        m = meshes.get(nm)
        if m is None:
            continue
        obj = m.export()
        V = [tuple(float(x) for x in l.split()[1:4]) for l in obj.splitlines() if l.startswith("v ")]
        F = [[int(x.split("/")[0]) - 1 for x in l.split()[1:4]] for l in obj.splitlines() if l.startswith("f ")]
        if not V or not F:
            continue
        zs = [v[2] for v in V]; xs = [v[0] for v in V]
        z0, z1, x0, x1 = min(zs), max(zs), min(xs), max(xs)
        L, W = max(z1 - z0, 1e-3), max(x1 - x0, 1e-3)
        k = 60.0 / max(L, W)
        SS = 4
        big = Image.new("L", (64 * SS, 64 * SS), 0)
        dr = ImageDraw.Draw(big)
        for f in F:
            pts = [((V[a][2] - (z0 + z1) / 2) * k * SS + 32 * SS, -(V[a][0] - (x0 + x1) / 2) * k * SS + 32 * SS) for a in f]
            dr.polygon(pts, fill=255)
        atlas.paste(big.resize((64, 64), Image.LANCZOS), ((i % cols) * 64, (i // cols) * 64))
        sil[nm] = {"i": i, "L": r3(L), "W": r3(W)}
    atlas.save(OUT + "/fish_atlas.webp", "WEBP", quality=85, method=6)
    for p in prefabs.values():
        if p.get("mesh") in sil:
            p["sil"] = sil[p["mesh"]]
    return {"items": items, "prefabs": prefabs, "atlas": {"file": "art/ui/minigame/fish_atlas.webp", "cols": cols, "rows": rows, "tile": 64}}


def col2hex(c):
    return "#%02x%02x%02x" % tuple(int(round(c[k] * 255)) for k in "rgb")


# ------------------------------------------------------------------ main
def main():
    S = Scene(SCENE)
    view_mb = S.owner_of_guid(script_guid("HarvestMinigameView"))[0]
    view_go = S.y(view_mb)[1]["m_GameObject"]["fileID"]
    path_of = {}
    tree = walk(S, view_go, "", path_of, skip=("StorageTray", "Audio"))
    # ---- hằng số của 6 minigame (trường [SerializeField] đọc được; ref -> đường dẫn nút)
    mini = {}
    for cname in ("FishMinigame", "PendulumMinigame", "BallCatcherMinigame", "DiamondMinigame", "SpiralMinigame", "DredgeMinigame"):
        for mb in S.owner_of_guid(script_guid(cname)):
            d = S.y(mb)[1]
            o = {}
            for k, v in d.items():
                if k.startswith("m_") or k in ("controller", "feedbackAnimationController", "loopAudioSource", "loopSFX", "hitSFX", "missSFX", "specialSFX", "endSFX", "openGate", "closeGate", "hitGate", "ballPrefab", "targetPrefab", "gatePrefab"):
                    continue
                def refpath(r):
                    fid = r["fileID"]
                    if fid in path_of:
                        return path_of[fid]
                    if fid in S.idx:
                        go = S.y(fid)[1].get("m_GameObject", {}).get("fileID")
                        return path_of.get(go)
                if isinstance(v, dict) and "fileID" in v:
                    o[k] = refpath(v)
                elif isinstance(v, list):
                    o[k] = [refpath(x) if isinstance(x, dict) and "fileID" in x else x for x in v]
                elif isinstance(v, dict):
                    o[k] = {a: (col({"r": b, "g": v["g"], "b": v["b"], "a": v["a"]}) if False else b) for a, b in v.items()} if "r" not in v else col(v)
                else:
                    o[k] = r3(v) if isinstance(v, float) else v
            mini[cname] = o
    # ---- prefab runtime
    prefabs = {n: prefab_tree("GameObject/%s.prefab" % n) for n in ("DiamondTarget", "BallCatcherBall", "SpiralGate")}
    # ---- clip hoạt hình
    clips = {n: clip(n) for n in ("HarvestMinigameIdle", "HarvestMinigameHit", "HarvestMinigameMiss", "HarvestMinigameHitSpecial", "HarvestMinigameEnd",
                                  "HarvestMinigameEndSpecial", "DredgeMinigameIdle", "DredgeMinigameHit", "DredgeMinigameMiss", "DredgeMinigameEnd",
                                  "SpiralGateIdleClosed", "SpiralGateIdleOpen", "SpiralGateOpening", "SpiralGateClosing")}
    # ---- thẻ loại cá (HarvestTypeTagConfig_0.asset, Odin)
    raw = open(ASSETS + "MonoBehaviour/HarvestTypeTagConfig_0.asset", encoding="utf-8").read()
    od = odin.decode(bytes.fromhex(re.search(r"SerializedBytes: ([0-9a-f]+)", raw).group(1)))
    enum = ["NONE", "COASTAL", "SHALLOW", "OCEANIC", "ABYSSAL", "HADAL", "VOLCANIC", "MANGROVE", "DREDGE", "CRAB", "ICE"]

    def hexc(c):
        return "#%02x%02x%02x" % tuple(int(round(x * 255)) for x in c[:3])

    tags = {}
    for it in od["stringLookup"]["$items"]:
        tags.setdefault(enum[it["$k"]], {})["str"] = it["$v"]
    for it in od["colorLookup"]["$items"]:
        tags.setdefault(enum[it["$k"]], {})["col"] = hexc(it["$v"]["$items"])
    for it in od["textColorLookup"]["$items"]:
        tags.setdefault(enum[it["$k"]], {})["text"] = hexc(it["$v"]["$items"])
    # ---- tiếng: guid addressables -> tệp
    cat = catalog()
    sfx = {}
    for cname, mb in mini.items():
        pass
    refs = {}
    for cname in mini:
        d = S.y(S.owner_of_guid(script_guid(cname))[0])[1]
        for k in ("hitSFX", "missSFX", "specialSFX", "endSFX", "openGate", "closeGate", "hitGate"):
            if k in d:
                refs.setdefault(cname, {})[k] = os.path.basename(cat.get(d[k]["m_AssetGUID"], "?")).rsplit(".", 1)[0]
        refs.setdefault(cname, {})["loop"] = os.path.basename(GUID.get(d["loopSFX"].get("guid"), "?")).rsplit(".", 1)[0]
    # ---- sprite
    for extra in ("keyboard-icon-f", "keyboard-icon-f-line", "TrophyIcon", "DredgingChestIcon", "FishingFishIcon", "QuestionMark"):
        for base in ("Sprite/%s.asset" % extra, "Sprite/%s_0.asset" % extra):
            if os.path.exists(ASSETS + base):
                SPRITES[extra] = base
                break
    SPRITES.pop("tripod-spiderfish", None)   # sprite mẫu của cảnh, không dùng
    meta = {}
    for name, rel in sorted(SPRITES.items()):
        meta[name] = export_sprite(name, rel)
    # ---- tiếng cánh cổng (DLC2) -> mp3 nhỏ
    try:
        export_font()
    except ImportError as e:
        print("bỏ qua phông (thiếu thư viện):", e)
    os.makedirs(OUT + "/audio", exist_ok=True)
    for src, dst in (("Fishing_Minigame_Doors_Open", "gate-open"), ("Fishing_Minigame_Doors_Close", "gate-close"), ("Fishing_Minigame_Doors_Closed_Hit", "gate-hit")):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", REF + "/audio/gameaudio/%s.ogg" % src, "-ac", "1", "-b:a", "64k", OUT + "/audio/%s.mp3" % dst], check=True)
    data = {"canvas": [1920, 1080], "tree": tree, "mini": mini, "prefabs": prefabs, "clips": clips, "tags": tags, "sfx": refs, "sprites": meta,
            "colors": {"NEUTRAL": "#ffffff", "EMPHASIS": "#3b9795", "POSITIVE": "#74d27a", "NEGATIVE": "#dc2c38", "CRITICAL": "#871d58", "WARNING": "#ff9a3b", "VALUABLE": "#ffd104", "DISABLED": "#6b6b6b"}}
    if not NO_SPOTFX:
        data["spotfx"] = build_spotfx()
    os.makedirs(OUT, exist_ok=True)
    js = "/* generated by tools/harvest_ui.py - do not edit */\nwindow.DR_HARVEST_UI=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(OUT + "/harvest_ui.js", "w", encoding="utf-8").write(js)
    print("harvest_ui.js", len(js) // 1024, "KB;", len(meta), "sprites;", sum(os.path.getsize(f) for f in glob.glob(OUT + "/**/*.*", recursive=True)) // 1024, "KB tổng art/ui/minigame")


if __name__ == "__main__":
    main()
