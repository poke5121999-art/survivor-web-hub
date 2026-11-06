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

Ghi thêm (vòng 2):
       cam      = máy quay lúc thu hoạch: "HarvestClearShot VCam" + 5 camera con (PlayerContainer.prefab) và blend của CinemachineBrain
                  (Scenes/Manager.unity + MonoBehaviour/Main Camera Blends.asset)
       spotfx   = mọi hệ hạt của prefab điểm câu (cá, mảnh vụn, vòng nước động, ooze), danh sách clip tiếng gần điểm + độ dài,
                  mesh thật -> art/ui/minigame/spot_meshes.bin, bảng màu -> art/ui/minigame/spot_*.webp
       art/ui/minigame/UITransitionTex.webp (mặt nạ tan biến của TutorialPopup, UITransitionEffect)
Ghi thêm (r2fish): tray = cây RectTransform của Container/StorageTray (460x245 dưới đáy bảng câu, lưới 6x3, HelpTextContainer).

Bẫy đã sập (ghi lại để khỏi sập lần nữa):
- `m_LocalEulerAnglesHint` của AssetRipper bị ĐẢO DẤU so với `m_LocalRotation`. Luôn đọc góc từ quaternion: rotZ = 2*atan2(z, w).
- Các trường [SerializeField] của HarvestMinigameView (stockText, progressBarIconMinY...) bị mất vì lớp là SerializedMonoBehaviour (Odin): suy từ bố cục.
- Đường dẫn trong AnimationClip có thể là `path_0xHASH_xxx` = CRC32 của đường dẫn. Hai đường dẫn của HarvestMinigameHit/Miss... là
  CRC32("FishMinigameWheel/Ring") và CRC32("FishMinigameWheel/Ring/Indicator"): KHÔNG có nút nào tên vậy trong cảnh (vòng thật là
  RadialFishMinigameWheel) nên hai đường cong ấy không gắn vào đâu cả, vòng cá gốc không rung/loé (audit F10).
- AssetReference (tiếng) chỉ là guid addressables: tra bằng catalog.json (cat() dưới đây), KHÔNG tra được bằng .meta của AssetRipper.
- Sprite trong AssetRipper là hình cắt chặt (m_Rect); Image đơn giản kéo CẢ m_Rect vào RectTransform. Cắt đúng m_Rect rồi để CSS kéo giãn.
- Script trong DLL (Cinemachine) chỉ có fileID trong m_Script: fileID = int32 đầu của MD4("s\\0\\0\\0" + namespace + tên lớp).
  ClearShot có thêm CinemachineCollider (1181723682) và CinemachineImpulseListener (657651115).
- Blend VÀO/RA ClearShot KHÔNG phải m_DefaultBlend của ClearShot (cái đó chỉ dùng giữa các camera con) mà là blend của
  CinemachineBrain: không có dòng nào trong Main Camera Blends khớp "HarvestClearShot VCam" nên dùng m_DefaultBlend của Brain.
- SphereLowPoly_2 không nằm trong bundle itemdata; trong bản AssetRipper nó trùng từng byte với SphereLowPoly (tool tự kiểm).
"""
import base64, bisect, collections, glob, hashlib, io, json, math, os, pickle, re, struct, subprocess, sys

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
                font = TTFont(io.BytesIO(bytes(f.m_FontData)), recalcTimestamp=False)   # mặc định ghi giờ chạy vào head.modified
                opts = subset.Options(); opts.flavor = "woff2"
                sb = subset.Subsetter(opts); sb.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D])
                sb.subset(font)
                os.makedirs(OUT + "/fonts", exist_ok=True)
                font.flavor = "woff2"
                font.save(OUT + "/fonts/FrontPageNeue.woff2")
                return


# ------------------------------------------------------------------ hiệu ứng điểm câu (HarvestableParticles)
def build_spotfx():
    """Mỗi item thu hoạch -> prefab hạt (CodParticles, TrinketParticles...) -> mọi hệ hạt của prefab (tham số đủ mô-đun),
    vòng nước động / ooze (prefab trỏ từ HarvestableParticles), mesh thật của từng hạt và bảng màu.

    Nguồn: item (itemdata bundle) cho tên prefab + độ sâu; GameObject/*.prefab (AssetRipper) cho tham số hạt;
    Mesh trong bundle cho hình. Đầu ra: spotfx = {items, prefabs, water, meshes, tex, poiSfx} + spot_meshes.bin + spot_*.webp."""
    import UnityPy
    ix = json.load(open(REF + "/cache/bundle_index.json", encoding="utf-8"))
    by_bundle = collections.defaultdict(list)
    for k, v in ix["containers"].items():
        if "/Data/SpatialItemData/" in k and v["type"] == "MonoBehaviour":
            by_bundle[v["bundle"]].append(v["path_id"])
    items, meshes = {}, {}
    for bundle, pids in sorted(by_bundle.items()):
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
    # ---- mọi hệ hạt của từng prefab điểm câu
    prefabs, extra = {}, set()
    for pn in sorted({v["p"] for v in items.values()}):
        rel = "GameObject/%s.prefab" % pn
        if not os.path.exists(ASSETS + rel):
            continue
        D, hp, systems, lods = prefab_fx(rel)
        if hp is None:
            continue
        nm = lambda ref: os.path.basename(GUID.get(ref.get("guid"), "")).replace(".prefab", "") if ref.get("guid") else None
        out = {"pps": hp["particlesPerStock"], "special": nm(hp["specialParticlePrefab"]), "water": nm(hp["disturbedWaterParticles"]),
               "ooze": nm(hp["disturbedOozeParticles"]), "sys": systems, "lod": lods,
               "harvestSys": bool(hp["HarvestableParticleSystem"]["fileID"])}
        extra.update(x for x in (out["water"], out["ooze"]) if x)
        prefabs[pn] = out
    # ---- vòng nước động / ooze (HarvestableParticles.Init: requiresAdvancedEquipment -> ooze)
    water = {}
    for pn in sorted(extra):
        D, hp, systems, lods = prefab_fx("GameObject/%s.prefab" % pn)
        water[pn] = {"sys": systems, "lod": lods}
    # ---- mesh thật: hạt cá / mảnh vụn / quả cầu thấp đa giác
    need = sorted({m for p in list(prefabs.values()) + list(water.values()) for s in p["sys"] for m in s.get("render", {}).get("meshes", [])})
    alias = {}
    for nm in need:
        if nm not in meshes:
            base = re.sub(r"_\d+$", "", nm)
            a, b = (open(ASSETS + "Mesh/%s.asset" % x, encoding="utf-8").read() for x in (nm, base))
            key = lambda s: (re.search(r"_typelessdata: (\w+)", s).group(1), re.search(r"m_IndexBuffer: (\w+)", s).group(1))
            if base in meshes and key(a) == key(b):          # SphereLowPoly_2 trùng từng byte với SphereLowPoly
                alias[nm] = base
    names = sorted({alias.get(n, n) for n in need if alias.get(n, n) in meshes})
    mesh_idx = export_meshes(names, meshes, OUT + "/spot_meshes.bin")
    mesh_idx["alias"] = alias
    missing = [n for n in need if alias.get(n, n) not in mesh_idx["list"]]
    if missing:
        print("THIẾU mesh:", missing)
    # ---- bảng màu (vật liệu của hạt)
    tex = {}
    for p in list(prefabs.values()) + list(water.values()):
        for s in p["sys"]:
            r = s.get("render", {})
            for m in r.get("mats", []) if r.get("mode") == 4 else []:     # chỉ vật liệu của hạt dạng mesh (cá, mảnh vụn, cầu)
                if m.get("tex"):
                    tex[m["tex"]] = None
    for t in sorted(tex):
        dst = "spot_" + re.sub(r"[^a-z0-9]+", "_", t.rsplit(".", 1)[0].lower()) + ".webp"
        tex[t] = export_tex(t, dst, lossless=Image.open(ASSETS + "Texture2D/" + t).size[0] <= 64, max_side=128)
    return {"items": items, "prefabs": prefabs, "water": water, "meshes": mesh_idx, "tex": tex}


def col2hex(c):
    return "#%02x%02x%02x" % tuple(int(round(c[k] * 255)) for k in "rgb")


# ------------------------------------------------------------------ tệp YAML lớn (PlayerContainer.prefab 5,7 MB): chỉ parse khối cần
class YDoc:
    HDR = re.compile(r"^--- !u!(\d+) &(-?\d+)(?: stripped)?\n", re.M)

    def __init__(self, path):
        txt = open(path, encoding="utf-8").read()
        ms = list(self.HDR.finditer(txt))
        self.raw = {}
        for i, m in enumerate(ms):
            self.raw[int(m.group(2))] = (int(m.group(1)), txt[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(txt)])
        self.cache = {}

    def get(self, i):
        if i not in self.cache:
            self.cache[i] = next(iter(yaml.safe_load(self.raw[i][1]).values()))
        return self.cache[i]

    def type(self, i):
        return self.raw[i][0]

    def ids(self, t=None):
        return [i for i, (tt, _) in self.raw.items() if t is None or tt == t]

    def name(self, go):
        return str(self.get(go)["m_Name"])

    def go_of(self, comp):
        return self.get(comp)["m_GameObject"]["fileID"]

    def comps(self, go):
        return [c["component"]["fileID"] for c in self.get(go)["m_Component"]]

    def tf(self, go):
        return next(c for c in self.comps(go) if self.type(c) in (4, 224))


# Script trong DLL: m_Script.fileID = int32 đầu của MD4("s\0\0\0" + namespace + tên lớp) (cách Unity đặt fileID cho MonoScript trong DLL).
# Bảng dự phòng tính bằng đúng công thức này cho máy có OpenSSL tắt MD4.
CM_FALLBACK = {1281779956: "CinemachineClearShot", 1181723682: "CinemachineCollider", 657651115: "CinemachineImpulseListener",
               -1223560802: "CinemachineVirtualCamera", -1777913960: "CinemachineTransposer", 1458643335: "CinemachineComposer",
               246809616: "CinemachinePipeline", -1224980236: "CinemachineFreeLook", 698978323: "CinemachineOrbitalTransposer",
               996775984: "CinemachineBrain", -960948103: "CinemachineBlenderSettings"}


def cm_classes():
    try:
        out = {}
        for n in set(CM_FALLBACK.values()):
            h = hashlib.new("md4", ("s\0\0\0Cinemachine" + n).encode("utf-8")).digest()
            out[struct.unpack("<i", h[:4])[0]] = n
        assert out == CM_FALLBACK, "bảng fileID Cinemachine lệch với MD4"
        return out
    except ValueError:            # hashlib không có md4
        return dict(CM_FALLBACK)


def q_euler(q):
    """Quaternion Unity -> (pitch quanh X, yaw quanh Y) độ, như Transform.eulerAngles (thứ tự ZXY)."""
    x, y, z, w = (float(q[k]) for k in "xyzw")
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, 2 * (w * x - y * z)))))
    yaw = math.degrees(math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)))
    return round(pitch, 3), round(yaw, 3)


def curve_keys(cv):
    """AnimationCurve -> [[t, v, inSlope, outSlope]] (tiếp tuyến vô hạn = null: bậc thang)."""
    sl = lambda v: (r3(float(v)) if math.isfinite(float(v)) else None)
    return [[r3(float(k["time"])), r3(float(k["value"])), sl(k["inSlope"]), sl(k["outSlope"])] for k in cv.get("m_Curve", [])]


def build_camera():
    """HarvestClearShot VCam + 5 camera con (PlayerContainer.prefab) + blend của CinemachineBrain (Manager.unity)."""
    CM = cm_classes()
    P = YDoc(ASSETS + "Prefabs/Player/PlayerContainer.prefab")
    cls = lambda mb: CM.get(P.get(mb)["m_Script"].get("fileID")) if P.type(mb) == 114 else None
    go_by_name = {P.name(g): g for g in P.ids(1)}
    cs_go = go_by_name["HarvestClearShot VCam"]
    comps = {cls(c): c for c in P.comps(cs_go) if cls(c)}
    cs = P.get(comps["CinemachineClearShot"])
    tf_name = lambda t: P.name(P.go_of(t)) if t else None

    def blend(b):
        return {"style": b["m_Style"], "time": r3(float(b["m_Time"])), "curve": curve_keys(b.get("m_CustomCurve", {}))}

    out = {"clearShot": {"name": "HarvestClearShot VCam", "priority": cs["m_Priority"], "minDuration": r3(float(cs["m_MinDuration"])),
                         "activateAfter": r3(float(cs["m_ActivateAfter"])), "randomizeChoice": cs["m_RandomizeChoice"],
                         "standbyUpdate": cs["m_StandbyUpdate"], "blend": blend(cs["m_DefaultBlend"]), "enabled": P.get(comps["CinemachineClearShot"])["m_Enabled"],
                         "follow": tf_name(cs["m_Follow"]["fileID"]), "lookAt": tf_name(cs["m_LookAt"]["fileID"])}}
    if "CinemachineCollider" in comps:
        c = P.get(comps["CinemachineCollider"])
        out["clearShot"]["collider"] = {k[2:]: (r3(v) if isinstance(v, float) else v) for k, v in c.items()
                                        if k in ("m_MinimumDistanceFromTarget", "m_AvoidObstacles", "m_DistanceLimit", "m_MinimumOcclusionTime",
                                                 "m_CameraRadius", "m_Strategy", "m_MaximumEffort", "m_SmoothingTime", "m_Damping",
                                                 "m_DampingWhenOccluded", "m_OptimalTargetDistance", "m_IgnoreTag")}
        out["clearShot"]["collider"]["CollideAgainst"] = c["m_CollideAgainst"]["m_Bits"]
    out["clearShot"]["impulseListener"] = "CinemachineImpulseListener" in comps
    shots, target = [], None
    for ref in cs["m_ChildCameras"]:
        vc = P.get(ref["fileID"])
        go = P.go_of(ref["fileID"])
        t = P.get(P.tf(go))
        tgt = vc["m_Follow"]["fileID"]
        if target is None and tgt:
            td = P.get(tgt)
            target = {"name": P.name(td["m_GameObject"]["fileID"]), "parent": tf_name(td["m_Father"]["fileID"]),
                      "pos": [r3(float(td["m_LocalPosition"][k])) for k in "xyz"]}
        lens = vc["m_Lens"]
        pitch, yaw = q_euler(t["m_LocalRotation"])
        s = {"name": P.name(go), "priority": vc["m_Priority"], "pos": [r3(float(t["m_LocalPosition"][k])) for k in "xyz"],
             "rot": [r3(float(t["m_LocalRotation"][k])) for k in "xyzw"], "pitch": pitch, "yaw": yaw,
             "fov": r3(float(lens["FieldOfView"])), "near": r3(float(lens["NearClipPlane"])), "far": r3(float(lens["FarClipPlane"])),
             "follow": tf_name(tgt), "lookAt": tf_name(vc["m_LookAt"]["fileID"])}
        # đường ống "cm": GameObject con ẩn mang Transposer + Composer
        for ch in t.get("m_Children", []):
            cgo = P.get(ch["fileID"])["m_GameObject"]["fileID"]
            for c in P.comps(cgo):
                n = cls(c)
                d = P.get(c) if n else None
                if n == "CinemachineTransposer":
                    s["transposer"] = {"binding": d["m_BindingMode"], "offset": [r3(float(d["m_FollowOffset"][k])) for k in "xyz"],
                                       "damp": [r3(float(d[k])) for k in ("m_XDamping", "m_YDamping", "m_ZDamping")],
                                       "angularMode": d.get("m_AngularDampingMode", 0),
                                       "yawDamp": r3(float(d.get("m_YawDamping", 0))), "pitchDamp": r3(float(d.get("m_PitchDamping", 0))),
                                       "rollDamp": r3(float(d.get("m_RollDamping", 0)))}
                elif n == "CinemachineComposer":
                    s["composer"] = {k[2:]: (r3(float(d[k])) if isinstance(d[k], (int, float)) else d[k]) for k in
                                     ("m_ScreenX", "m_ScreenY", "m_HorizontalDamping", "m_VerticalDamping", "m_DeadZoneWidth", "m_DeadZoneHeight",
                                      "m_SoftZoneWidth", "m_SoftZoneHeight", "m_LookaheadTime", "m_LookaheadSmoothing", "m_BiasX", "m_BiasY") if k in d}
                    s["composer"]["offset"] = [r3(float(d["m_TrackedObjectOffset"][k])) for k in "xyz"]
        shots.append(s)
    shots.sort(key=lambda s: -s["priority"])
    out["shots"], out["target"] = shots, target
    # ---- CinemachineBrain (camera chính nằm ở Scenes/Manager.unity) + bảng blend tuỳ chỉnh
    mtxt = open(ASSETS + "Scenes/Manager.unity", encoding="utf-8").read()
    blk = next(b for b in re.split(r"^--- !u!", mtxt, flags=re.M) if "m_BlendUpdateMethod" in b)
    bd = next(iter(yaml.safe_load(blk.split("\n", 1)[1]).values()))
    assert CM.get(bd["m_Script"]["fileID"]) == "CinemachineBrain", "khối có m_BlendUpdateMethod không phải CinemachineBrain"
    brain = {"default": blend(bd["m_DefaultBlend"]), "customAsset": None, "custom": []}
    cg = bd.get("m_CustomBlends", {}).get("guid")
    if cg:
        ap = GUID[cg]
        brain["customAsset"] = os.path.basename(ap).rsplit(".", 1)[0]
        cb = next(iter(yaml.safe_load(open(ASSETS + ap, encoding="utf-8").read().split("\n", 3)[3]).values()))
        brain["custom"] = [{"from": b["m_From"], "to": b["m_To"], "blend": blend(b["m_Blend"])} for b in cb["m_CustomBlends"]]

    def lookup(frm, to):                                    # CinemachineBlenderSettings.GetBlendForVirtualCameras
        A = "**ANY CAMERA**"
        for f, t in ((frm, to), (A, to), (frm, A)):
            for b in brain["custom"]:
                if b["from"] == f and b["to"] == t:
                    return dict(b["blend"], src="custom %s -> %s" % (f, t))
        return dict(brain["default"], src="CinemachineBrain.m_DefaultBlend")

    brain["in"] = lookup("Player VCam", out["clearShot"]["name"])
    brain["out"] = lookup(out["clearShot"]["name"], "Player VCam")
    brain["custom"] = [b for b in brain["custom"] if "Harvest" in b["from"] + b["to"]]   # chỉ giữ dòng liên quan để đối chiếu
    out["brain"] = brain
    return out


# ------------------------------------------------------------------ hệ hạt Unity -> dạng gọn (theo cách tools/vfx.py đọc BoatTrailParticles)
def mm(c):
    """MinMaxCurve -> số | [min, max] | {k, c:[[t,v,in,out]]} | {k, c0, c}."""
    if not isinstance(c, dict) or "minMaxState" not in c:
        return c
    s, k = c["minMaxState"], float(c.get("scalar", 0))
    if s == 0:
        return r3(k)
    if s == 3:
        return [r3(float(c.get("minScalar", 0))), r3(k)]
    if s == 1:
        return {"k": r3(k), "c": curve_keys(c["maxCurve"])}
    return {"k": r3(k), "c0": curve_keys(c["minCurve"]), "c": curve_keys(c["maxCurve"])}


def grad(g):
    nc, na = g["m_NumColorKeys"], g["m_NumAlphaKeys"]
    return {"c": [[r3(g["ctime%d" % i] / 65535), r3(float(g["key%d" % i]["r"])), r3(float(g["key%d" % i]["g"])), r3(float(g["key%d" % i]["b"]))] for i in range(nc)],
            "a": [[r3(g["atime%d" % i] / 65535), r3(float(g["key%d" % i]["a"]))] for i in range(na)]}


def mmg(m):
    s = m["minMaxState"]
    col4 = lambda c: [r3(float(c[k])) for k in "rgba"]
    if s == 0:
        return {"col": col4(m["maxColor"])}
    if s == 2:
        return {"min": col4(m["minColor"]), "max": col4(m["maxColor"])}
    if s == 1:
        return {"grad": grad(m["maxGradient"])}
    if s == 3:
        return {"grad0": grad(m["minGradient"]), "grad": grad(m["maxGradient"])}
    return {"rand": grad(m["maxGradient"])}


def v3(v):
    return [r3(float(v[k])) for k in "xyz"]


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def qrot(q, v):
    x, y, z, w = q
    u = (x, y, z)
    cr = lambda a, b: (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    t = tuple(2 * c for c in cr(u, v))
    c2 = cr(u, t)
    return tuple(v[i] + w * t[i] + c2[i] for i in range(3))


SHADER_PROPS = {}


def shader_props(path):
    """Khối Properties của shader (thân bị AssetRipper bỏ): tên nội bộ -> tên hiển thị (như tools/vfx.py)."""
    if path not in SHADER_PROPS:
        txt = open(ASSETS + path, encoding="utf-8").read()
        SHADER_PROPS[path] = {m.group(1): m.group(2) for m in re.finditer(r'^\s*(?:\[[^\]]*\]\s*)*(\w+)\s*\("([^"]*)"', txt, re.M)}
    return SHADER_PROPS[path]


def material_info(guid):
    """Vật liệu .mat -> {name, shader, tex, floats, colors} chỉ gồm thuộc tính có thật trong shader."""
    p = GUID.get(guid)
    if not p or not p.endswith(".mat"):
        return None
    d = next(iter(yaml.safe_load(open(ASSETS + p, encoding="utf-8").read().split("\n", 3)[3]).values()))
    sh = GUID.get(d["m_Shader"].get("guid", ""), "")
    props = shader_props(sh) if sh.endswith(".shader") else {}
    sp = d["m_SavedProperties"]
    o = {"name": d["m_Name"], "shader": os.path.basename(sh).rsplit(".", 1)[0], "floats": {}, "colors": {}}
    for k, v in sp["m_Floats"].items():
        if k in props or k in ("_Surface", "_ZWrite", "_Cull", "_SrcBlend", "_DstBlend"):
            o["floats"][props.get(k, k)] = r3(float(v))
    for k, v in sp["m_Colors"].items():
        if k in props:
            o["colors"][props[k]] = [r3(float(v[c])) for c in "rgba"]
    for k, v in sp["m_TexEnvs"].items():
        tp = GUID.get(v["m_Texture"].get("guid", ""), "")
        if k in props and tp.startswith("Texture2D/"):
            o.setdefault("texs", {})[props[k]] = os.path.basename(tp)
    for main in ("Albedo", "MainTex", "Sprite"):                      # Lit_Shader / FishParticle_Shader / FloatingParticle_Shader
        if main in o.get("texs", {}):
            o["tex"] = o["texs"][main]
            break
    o.pop("texs", None)
    return o


def ps_dump(D, ps_id, root_tf):
    """Một ParticleSystem trong prefab -> tham số (tên trường giữ ý nghĩa Unity) + vị trí GameObject so với gốc prefab."""
    d = D[ps_id][2]
    I, S, E, V = d["InitialModule"], d["ShapeModule"], d["EmissionModule"], d["VelocityModule"]
    go = d["m_GameObject"]["fileID"]
    o = {"node": str(D[go][2]["m_Name"]), "on": D[go][2]["m_IsActive"], "life": mm(I["startLifetime"]), "speed": mm(I["startSpeed"]),
         "size": mm(I["startSize"]), "rot": mm(I["startRotation"]), "color": mmg(I["startColor"]), "grav": mm(I["gravityModifier"]),
         "maxP": I["maxNumParticles"], "loop": d["looping"], "prewarm": d["prewarm"], "sim": d["moveWithTransform"], "dur": r3(float(d["lengthInSec"]))}
    if I.get("rotation3D"):
        o["rot3"] = [mm(I["startRotationX"]), mm(I["startRotationY"]), mm(I["startRotation"])]
    if I.get("size3D"):
        o["size3"] = [mm(I["startSize"]), mm(I["startSizeY"]), mm(I["startSizeZ"])]
    # vị trí/hướng của GameObject hệ hạt trong khung gốc prefab (Unity)
    tf = next(c["component"]["fileID"] for c in D[go][2]["m_Component"] if D[c["component"]["fileID"]][0] in (4, 224))
    pos, rot = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)
    t = tf
    while t and t != root_tf:
        td = D[t][2]
        lq = tuple(float(td["m_LocalRotation"][k]) for k in "xyzw")
        lp = tuple(float(td["m_LocalPosition"][k]) for k in "xyz")
        pos = tuple(a + b for a, b in zip(qrot(lq, pos), lp))
        rot = qmul(lq, rot)
        t = td["m_Father"]["fileID"]
    o["pos"], o["q"] = [r3(v) for v in pos], [r3(v) for v in rot]
    if S["enabled"]:
        rad = S["radius"]["value"] if isinstance(S["radius"], dict) else S["radius"]
        arc = S["arc"]["value"] if isinstance(S["arc"], dict) else S["arc"]
        o["shape"] = {"type": S["type"], "radius": r3(float(rad)), "thick": r3(float(S.get("radiusThickness", 1))), "donut": r3(float(S.get("donutRadius", 0))),
                      "arc": r3(float(arc)), "angle": r3(float(S.get("angle", 0))), "pos": v3(S["m_Position"]), "rot": v3(S["m_Rotation"]), "scale": v3(S["m_Scale"]),
                      "randomDir": r3(float(S.get("randomDirectionAmount", 0))), "align": S.get("alignToDirection", 0)}
    if E["enabled"]:
        o["rate"] = mm(E["rateOverTime"])
        o["bursts"] = [{"t": r3(float(b["time"])), "n": mm(b["countCurve"]), "cycles": b["cycleCount"], "every": r3(float(b["repeatInterval"]))} for b in E.get("m_Bursts", [])]
    if V["enabled"]:
        o["vel"] = {"x": mm(V["x"]), "y": mm(V["y"]), "z": mm(V["z"]), "orb": [mm(V["orbitalX"]), mm(V["orbitalY"]), mm(V["orbitalZ"])],
                    "radial": mm(V["radial"]), "speedMod": mm(V["speedModifier"]), "world": V["inWorldSpace"]}
    if d["SizeModule"]["enabled"]:
        o["sizeOL"] = mm(d["SizeModule"]["curve"])
    if d["RotationModule"]["enabled"]:
        R = d["RotationModule"]
        o["rotOL"] = [mm(R["x"]), mm(R["y"]), mm(R["curve"])] if R.get("separateAxes") else mm(R["curve"])
    if d["ColorModule"]["enabled"]:
        o["colOL"] = mmg(d["ColorModule"]["gradient"])
    if d["NoiseModule"]["enabled"]:
        N = d["NoiseModule"]
        o["noise"] = {"strength": mm(N["strength"]), "freq": r3(float(N["frequency"])), "scroll": mm(N["scrollSpeed"]), "damping": N["damping"], "octaves": N["octaves"]}
    if d["ForceModule"]["enabled"]:
        o["force"] = {k: mm(d["ForceModule"][k]) for k in "xyz"}
    if d["ClampVelocityModule"]["enabled"]:
        C = d["ClampVelocityModule"]
        o["limit"] = {"mag": mm(C["magnitude"]), "dampen": r3(float(C["dampen"])), "drag": mm(C["drag"])}
    rend = next((dd for t2, k2, dd in D.values() if t2 == 199 and dd["m_GameObject"]["fileID"] == go), None)
    if rend:
        meshes = []
        for mk in ("m_Mesh", "m_Mesh1", "m_Mesh2", "m_Mesh3"):
            g = rend.get(mk, {}).get("guid")
            if g and GUID.get(g, "").startswith("Mesh/"):
                meshes.append(os.path.basename(GUID[g]).rsplit(".", 1)[0])
        mats = [material_info(m["guid"]) for m in rend.get("m_Materials", []) if m.get("guid")]
        o["render"] = {"mode": rend["m_RenderMode"], "align": rend["m_RenderAlignment"], "meshes": meshes, "mats": [m for m in mats if m],
                       "maxSize": r3(float(rend["m_MaxParticleSize"])), "on": rend.get("m_Enabled", 1)}
    return o


def prefab_fx(rel):
    """Mọi hệ hạt của một prefab + LODGroup (cỡ, ngưỡng màn hình) + khối HarvestableParticles nếu có."""
    D = load_prefab(rel)
    go_of_tf = {i: v[2]["m_GameObject"]["fileID"] for i, v in D.items() if v[0] in (4, 224)}
    root_tf = next(i for i in go_of_tf if D[i][2]["m_Father"]["fileID"] == 0)
    hp = next((d for t, k, d in D.values() if t == 114 and "particlesPerStock" in d), None)
    harvest_ps = hp["HarvestableParticleSystem"]["fileID"] if hp else 0
    # HarvestableParticles.toggleObjects: GameObject tắt hẳn khi kho < 1 (cả con của nó); toggleParticles: chỉ Stop() phát
    tog_go = {r["fileID"] for r in (hp.get("toggleObjects") or [])} if hp else set()
    tog_ps = {r["fileID"] for r in (hp.get("toggleParticles") or [])} if hp else set()
    tf_of_go = {g: t for t, g in go_of_tf.items()}
    systems = []
    for i, (t, k, d) in sorted(D.items(), key=lambda kv: kv[0]):
        if t == 198:
            s = ps_dump(D, i, root_tf)
            if i == harvest_ps:
                s["harvest"] = 1
            g, tf = d["m_GameObject"]["fileID"], tf_of_go.get(d["m_GameObject"]["fileID"])
            while tf:
                if go_of_tf[tf] in tog_go:
                    s["toggleObject"] = 1
                    break
                tf = D[tf][2]["m_Father"]["fileID"]
            if i in tog_ps:
                s["toggleParticles"] = 1
            systems.append(s)
    lods = []
    for t, k, d in D.values():
        if t == 205:
            lods.append({"node": str(D[d["m_GameObject"]["fileID"]][2]["m_Name"]), "size": r3(float(d["m_Size"])),
                         "h": [r3(float(l["screenRelativeHeight"])) for l in d["m_LODs"]], "n": sum(len(l["renderers"]) for l in d["m_LODs"])})
    return D, hp, systems, lods


MESH_STATS = {}


def export_meshes(names, meshes, path):
    """Mesh thật (UnityPy, OBJ: x đổi dấu + tam giác đảo chiều) -> three.js (đổi dấu z: xoay 180° quanh y từ OBJ) -> spot_meshes.bin.

    Bố cục: [vị trí int16 chuẩn hoá theo hộp bao][pháp tuyến int8 x3][uv uint16 x2][chỉ số uint16], mỗi mảng nối mọi mesh;
    harvest_ui.js ghi offset từng mảng và mỗi mesh {vo, nv, io, ni, bb}."""
    P, N, UV, IDX, index, nv0, ni0 = [], [], [], [], {}, 0, 0
    for nm in names:
        m = meshes.get(nm)
        if m is None:
            continue
        obj = m.export()
        V = [[float(x) for x in l.split()[1:4]] for l in obj.splitlines() if l.startswith("v ")]
        T = [[float(x) for x in l.split()[1:3]] for l in obj.splitlines() if l.startswith("vt ")]
        Nn = [[float(x) for x in l.split()[1:4]] for l in obj.splitlines() if l.startswith("vn ")]
        F = [[int(x.split("/")[0]) - 1 for x in l.split()[1:4]] for l in obj.splitlines() if l.startswith("f ")]
        V = [[-v[0], v[1], -v[2]] for v in V]
        Nn = [[-n[0], n[1], -n[2]] for n in Nn] if len(Nn) == len(V) else [[0.0, 1.0, 0.0]] * len(V)
        T = T if len(T) == len(V) else [[0.0, 0.0]] * len(V)
        bb = [min(v[i] for v in V) for i in range(3)] + [max(v[i] for v in V) for i in range(3)]
        span = [max(bb[3 + i] - bb[i], 1e-6) for i in range(3)]
        for v in V:
            P.extend(int(round((v[i] - bb[i]) / span[i] * 65535)) - 32768 for i in range(3))
        for n in Nn:
            ln = math.sqrt(sum(c * c for c in n)) or 1.0
            N.extend(int(round(c / ln * 127)) for c in n)
        for u in T:
            UV.extend(int(round(min(1.0, max(0.0, c)) * 65535)) for c in u)
        flat = [i for f in F for i in f]
        assert max(flat) < len(V) and len(V) < 65536, "mesh %s: chỉ số vượt" % nm
        IDX.extend(flat)
        index[nm] = {"vo": nv0, "nv": len(V), "io": ni0, "ni": len(flat), "bb": [r3(x) for x in bb]}
        MESH_STATS[nm] = (len(V), len(flat) // 3, min(min(u) for u in T), max(max(u) for u in T))
        nv0 += len(V)
        ni0 += len(flat)
    pos = struct.pack("<%dh" % len(P), *P)
    nor = struct.pack("<%db" % len(N), *N)
    nor += b"\0" * (-len(nor) % 4)
    uv = struct.pack("<%dH" % len(UV), *UV)
    idx = struct.pack("<%dH" % len(IDX), *IDX)
    with open(path, "wb") as f:
        f.write(pos + nor + uv + idx)
    return {"file": "art/ui/minigame/" + os.path.basename(path), "nv": nv0, "ni": ni0, "pos": 0, "nor": len(pos), "uv": len(pos) + len(nor),
            "idx": len(pos) + len(nor) + len(uv), "list": index}


def ogg_dur(name):
    """Độ dài clip gốc (giây) đọc bằng ffprobe từ D:/dredge-ref/audio."""
    f = REF + "/audio/gameaudio/%s.ogg" % name.replace(" ", "_")
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True)
    return r3(float(r.stdout.strip())) if r.returncode == 0 and r.stdout.strip() else None


def build_poi_sfx():
    """HarvestPOIHandler.sfxClips (Odin, PlayerContainer.prefab): HarvestPOICategory -> danh sách clip gốc + độ dài."""
    P = YDoc(ASSETS + "Prefabs/Player/PlayerContainer.prefab")
    mb = next(i for i in P.ids(114) if "harvester: {fileID" in P.raw[i][1] and "audioMixerGroup" in P.raw[i][1])
    sd = P.get(mb)["serializationData"]
    od = odin.decode(bytes.fromhex(sd["SerializedBytes"]))
    refs = [r.get("guid") for r in sd["ReferencedUnityObjects"]]
    cats = ["NONE", "FISH_SMALL", "FISH_MEDIUM", "FISH_LARGE", "TRINKET", "MATERIAL", "RELIC"]
    out = {}
    for it in od["sfxClips"]["$items"]:
        names = []
        for c in it["$v"]["$items"]:
            p = GUID.get(refs[c["$unity"]], "")
            names.append(os.path.basename(p).rsplit(".", 1)[0])
        out[cats[it["$k"]]] = [{"n": n, "dur": ogg_dur(n)} for n in names]
    return out


def export_tex(src, dst, lossless=True, max_side=None):
    im = Image.open(ASSETS + "Texture2D/" + src).convert("RGBA")
    if max_side and max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(OUT + "/" + dst, "WEBP", lossless=lossless, quality=90, method=6)
    return {"src": "art/ui/minigame/" + dst, "orig": "Texture2D/" + src, "size": list(im.size)}


# ------------------------------------------------------------------ main
def main():
    S = Scene(SCENE)
    view_mb = S.owner_of_guid(script_guid("HarvestMinigameView"))[0]
    view_go = S.y(view_mb)[1]["m_GameObject"]["fileID"]
    path_of = {}
    tree = walk(S, view_go, "", path_of, skip=("StorageTray", "Audio"))
    # ---- StorageTray (audit F9): con của Container, lưới 6x3 do js/cargo.js vẽ (left kind 'tray'); xuất riêng để test so bố cục
    def child_named(go, name):
        for c in S.y(tf_of(S, go))[1].get("m_Children", []):
            cg = S.y(c["fileID"])[1]["m_GameObject"]["fileID"]
            if S.y(cg)[1]["m_Name"] == name:
                return cg
            r = child_named(cg, name)
            if r:
                return r
    keep = dict(SPRITES)                                         # sprite của khay do cargo.js tự vẽ: không xuất thêm ảnh
    tray = walk(S, child_named(view_go, "StorageTray"), "", {})
    SPRITES.clear(); SPRITES.update(keep)
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
    data = {"canvas": [1920, 1080], "tree": tree, "tray": tray, "mini": mini, "prefabs": prefabs, "clips": clips, "tags": tags, "sfx": refs, "sprites": meta,
            "colors": {"NEUTRAL": "#ffffff", "EMPHASIS": "#3b9795", "POSITIVE": "#74d27a", "NEGATIVE": "#dc2c38", "CRITICAL": "#871d58", "WARNING": "#ff9a3b", "VALUABLE": "#ffd104", "DISABLED": "#6b6b6b"}}
    # ---- TutorialPopup: UITransitionEffect (Coffee UIEffect, chế độ tan biến) + texture chuyển cảnh
    def find(n, name):
        if n["n"] == name:
            return n
        for k in n.get("k", []):
            r = find(k, name)
            if r:
                return r
    tp = find(tree, "TutorialPopup")
    te = S.y(next(c["cid"] for c in tp["c"] if c.get("script") == "UITransitionEffect"))[1]
    tt = GUID.get(te["m_TransitionTexture"]["guid"], "")
    data["tutorialTransition"] = {"mode": te["m_EffectMode"], "factor": r3(float(te["m_EffectFactor"])), "width": r3(float(te["m_DissolveWidth"])),
                                  "softness": r3(float(te["m_DissolveSoftness"])), "color": col(te["m_DissolveColor"]), "area": te["m_EffectArea"],
                                  "keepAspect": te["m_KeepAspectRatio"], "duration": r3(float(te["m_Player"]["duration"])),
                                  "tex": export_tex(os.path.basename(tt), "UITransitionTex.webp", lossless=False)}
    # ---- UIShiny (vệt sáng quét) của thẻ loại cá (typeTagShiny) và nút nhắc phím (controlPromptShiny)
    data["shiny"] = {}

    def shinies(n, path):
        for c in n.get("c", []):
            if c.get("script") == "UIShiny":
                d = S.y(c["cid"])[1]
                pl = d["m_Player"]
                data["shiny"][path] = {"width": r3(float(d["m_Width"])), "rotation": r3(float(d["m_Rotation"])), "softness": r3(float(d["m_Softness"])),
                                       "brightness": r3(float(d["m_Brightness"])), "gloss": r3(float(d["m_Gloss"])), "duration": r3(float(pl["duration"])),
                                       "loop": pl["loop"], "loopDelay": r3(float(pl["loopDelay"])), "initialDelay": r3(float(pl["initialPlayDelay"])), "playOnEnable": pl["play"]}
        for k in n.get("k", []):
            shinies(k, (path + "/" if path else "") + k["n"])
    shinies(find(tree, "Container"), "")
    # ---- máy quay lúc thu hoạch (F1)
    data["cam"] = build_camera()
    if not NO_SPOTFX:
        data["spotfx"] = build_spotfx()
        data["spotfx"]["poiSfx"] = build_poi_sfx()
    elif os.path.exists(OUT + "/harvest_ui.js"):                  # giữ spotfx của lần chạy trước
        old = open(OUT + "/harvest_ui.js", encoding="utf-8").read()
        data["spotfx"] = json.loads(old[old.index("=") + 1:old.rstrip().rindex(";")]).get("spotfx")
    os.makedirs(OUT, exist_ok=True)
    js = "/* generated by tools/harvest_ui.py - do not edit */\nwindow.DR_HARVEST_UI=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(OUT + "/harvest_ui.js", "w", encoding="utf-8").write(js)
    print("harvest_ui.js", len(js) // 1024, "KB;", len(meta), "sprites;", sum(os.path.getsize(f) for f in glob.glob(OUT + "/**/*.*", recursive=True)) // 1024, "KB tổng art/ui/minigame")


if __name__ == "__main__":
    main()
