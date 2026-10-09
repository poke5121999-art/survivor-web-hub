# -*- coding: utf-8 -*-
"""Bóc giao diện màn "Upgrades" của ụ tàu (UpgradeWindow) và tooltip nâng cấp từ bundle scene gốc cho Biển Mù.

Chạy:  python -I games/dredge/tools/upgrade_ui.py        (~30 giây, chạy lại ra đúng từng byte)
Cần:   tools/index_bundles.py và tools/data.py đã chạy (đọc cache/bundle_index.json, data/config.js, data/upgrades.js).
Ra:    data/upgrade_ui.js            window.DR_UPGRADE_UI (cây RectTransform, sprite, khoá chữ, màu, giá vật liệu, tooltip)
       art/ui/upgrade/*.webp         sprite đúng bản mà Image của cây trỏ tới (cỡ gốc, không bị data.py thu nhỏ 256 px)

Nguồn (chỉ đọc): bundle scene gamescene_scenes_all_*.bundle (Game scene, UnityPy). AssetRipper không có UpgradeWindow
  (khối Dock/Destination là Odin nên bị xuất rỗng; UI cũng nằm trong scene bundle), nên đo thẳng từ bundle như yarn.py.
  GameCanvases/GameCanvas/UpgradeWindow/Container      cây 145 GameObject: Scrim, Window 1680x820, Header, Title, Nodes, CoverScrim
  GameCanvases/Tooltip/Container                       TooltipSectionHeaderWithIcon / Description / UpgradeCost / ControlPrompts
  prefab TooltipUpgradeCostIcon                        ô vật liệu của tooltip (icon 35x35 + chữ "có/cần")
  UpgradeNodeUI x20                                    nâng cấp ứng với từng nút + danh sách đường nối đổi màu
  UpgradeDestination x7                                allowHullTier5Content theo từng ụ tàu
  HorizontalLayoutGroup của Nodes                      vị trí cột/nút KHÔNG phải anchoredPosition đã lưu (xem bẫy 1)
  QuestGridConfig của 20 nâng cấp (Odin)               completeConditions = giá vật liệu thật (UpgradeData.cs:54-57)
  SettingsSaveDataTemplate + GameConfigData.colors     bảng màu NEUTRAL/POSITIVE/DISABLED... (xem bẫy 4)

Bẫy đã sập (đọc trước khi sửa tool):
  1. HorizontalLayoutGroup của Nodes (spacing 30, MiddleCenter, không điều khiển cỡ con) tính lại x của 9 cột/nút mỗi lần
     mở cửa sổ và BỎ QUA con đang tắt. anchoredPosition lưu trong scene (Tier0 54, Tier1 209, Node2 399...) là kết quả
     khi cả 9 con đang bật. Bản cơ bản tắt UpgradeNodeTier5 (hullTier5Content) nên cả cây dồn vào giữa, dịch phải 85.
     Tool ghi `lg` (tham số nhóm) ở nút Nodes; js/upgrade.js tự xếp lại bằng đúng thuật toán của Unity.
  2. Tên sprite trùng: Tab_Selected, TabDivider, UpgradeNode_Small... có hai bản khác texture. Tool lấy đúng đối tượng Sprite
     mà m_Sprite của Image trỏ tới (PPtr), không tra theo tên. Ảnh ghi ra với cỡ gốc: FullPanel 384 px viền 72, nếu dùng bản
     data.py (thu về 256) thì viền 9-slice lệch.
  3. m_Border của Unity là (trái, dưới, phải, trên) và Sliced co theo ppu/100 (ppu tham chiếu của CanvasScaler = 100).
     UpgradeNode_Small viền trái 119 px ở ppu 200 = 59,5 đơn vị canvas: phần đó là ô icon đen, phần còn lại co giãn
     thành nền xanh. Sprite RGB không alpha, màu nền là phép NHÂN với Image.color (nên 3 trạng thái dùng một ảnh).
  4. DredgeColorTypeEnum KHÔNG có bảng màu riêng: LanguageManager.GetColor(t) = GameConfigData.Colors[SettingsSaveData.color<T>],
     chỉ số mặc định nằm trong SettingsSaveDataTemplate (NEUTRAL 0 ... DISABLED 7) ở sharedassets0.assets (không có typetree,
     data.py sinh từ Assembly-CSharp.dll). Tool đọc cả hai và in ra để kiểm.
  5. Font của chữ TMP nằm ở bundle localization-assets-shared (bảng Fonts, LocalizeFontBypass), không nằm trong load_all()
     (nó bỏ mọi bundle localization-*). Phải W.load() riêng. Font là "Front Page Neue SDF" (pointSize 157, capLine 108).
  6. TMP VerticalAlignment là cờ: Top 256, Middle 512, Bottom 1024, Baseline 2048, Geometry 4096, Capline 8192
     (HorizontalAlignment: Left 1, Center 2, Right 4). Tiêu đề nút dùng Capline, chữ đầu cửa sổ Middle, tên cửa sổ Geometry.
  7. data.py giới hạn ảnh 256 px và đặt "Tên_hash" cho bản trùng; tool này ghi ảnh vào art/ui/upgrade (thư mục riêng) để
     không bị data.py xoá/ghi đè.
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data as Dt  # noqa: E402  (nạp chỉ mục bundle + catalog Addressables; main() của data.py không chạy)

GAME = os.path.normpath(os.path.join(HERE, ".."))
ART_REL = "art/ui/upgrade"
ART = os.path.join(GAME, ART_REL)
OUT_JS = os.path.join(GAME, "data", "upgrade_ui.js")
SCENE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
LOC_SHARED = "localization-assets-shared_assets_all_4a0873e3d99c2046eeb40f0ab89ab825.bundle"
WIN_PATH = "GameCanvases/GameCanvas/UpgradeWindow"
TIP_PATH = "GameCanvases/Tooltip/Container"
W = Dt.W

# --------------------------------------------------------------------------- nạp thế giới
Dt.loc.load()
W.load_all()
W.load(LOC_SHARED)
sf = max(W.load(SCENE), key=lambda s: len(s.objects))
_TT = {}


def get(o):
    k = (id(o.assets_file), o.path_id)
    if k not in _TT:
        _TT[k] = o.read_typetree()
    return _TT[k]


def go_of(o):
    return o.assets_file.objects[get(o)["m_GameObject"]["m_PathID"]]


def tr_of(go):
    for c in get(go)["m_Component"]:
        o = go.assets_file.objects[c["component"]["m_PathID"]]
        if o.type.name in ("Transform", "RectTransform"):
            return o
    return None


def comps(go):
    return [(W.cls(go.assets_file.objects[c["component"]["m_PathID"]]), go.assets_file.objects[c["component"]["m_PathID"]])
            for c in get(go)["m_Component"]]


def path_of(tr):
    names = []
    while tr is not None:
        t = get(tr)
        names.append(get(tr.assets_file.objects[t["m_GameObject"]["m_PathID"]])["m_Name"])
        f = t["m_Father"]["m_PathID"]
        tr = tr.assets_file.objects.get(f) if f else None
    return "/".join(reversed(names))


def scene_monos(*names):
    """MonoBehaviour của scene theo tên lớp (đọc 28 byte đầu của từng đối tượng, nhanh)."""
    out = {n: [] for n in names}
    for o in sf.objects.values():
        if o.type.name == "MonoBehaviour":
            c = W.cls(o)
            if c in out:
                out[c].append(o)
    return out


def r3(v):
    return round(v, 3) if isinstance(v, float) else v


def rgba(c):
    return [r3(c["r"]), r3(c["g"]), r3(c["b"]), r3(c["a"])]


# --------------------------------------------------------------------------- sprite
SPRITES = {}      # tên -> {"f", "w", "h", "b": [trái, dưới, phải, trên], "ppu", "img": PIL}
_SPR_KEY = {}     # (id(file), path_id) -> tên


def sprite_of(ptr, owner):
    """PPtr của m_Sprite -> tên trong SPRITES (đúng đối tượng Sprite mà Image trỏ tới)."""
    if not ptr or not ptr.get("m_PathID"):
        return None
    o = W.obj(owner.assets_file, ptr["m_FileID"], ptr["m_PathID"])
    if o is None or o.type.name != "Sprite":
        return None
    key = (id(o.assets_file), o.path_id)
    if key in _SPR_KEY:
        return _SPR_KEY[key]
    s = o.read()
    name = s.m_Name
    if name in SPRITES:      # trùng tên, khác đối tượng: giữ cả hai, đuôi theo path id
        name = "%s_%x" % (name, o.path_id & 0xFFFF)
    img = s.image
    b = s.m_Border
    SPRITES[name] = {"f": "%s/%s.webp" % (ART_REL, name), "w": img.width, "h": img.height,
                     "b": [r3(float(b.x)), r3(float(b.y)), r3(float(b.z)), r3(float(b.w))],
                     "ppu": r3(float(s.m_PixelsToUnits)), "img": img}
    _SPR_KEY[key] = name
    return name


# --------------------------------------------------------------------------- chuỗi, font
def font_info(ptr, owner):
    o = W.obj(owner.assets_file, ptr["m_FileID"], ptr["m_PathID"]) if ptr and ptr.get("m_PathID") else None
    if o is None:
        return None
    t = o.read_typetree()
    fi = t["m_FaceInfo"]
    return {"family": fi["m_FamilyName"], "pointSize": fi["m_PointSize"], "ascent": r3(fi["m_AscentLine"]), "descent": r3(fi["m_DescentLine"]),
            "cap": r3(fi["m_CapLine"]), "mean": r3(fi["m_MeanLine"]), "lineHeight": r3(fi["m_LineHeight"])}


def loc_key(o):
    """LocalizeStringEvent.m_StringReference -> khoá chuỗi (ví dụ upgrades.header.description)."""
    ref = get(o).get("m_StringReference") or {}
    ent = ref.get("m_TableEntryReference") or {}
    tab = (ref.get("m_TableReference") or {}).get("m_TableCollectionName") or ""
    g = tab[5:] if tab.startswith("GUID:") else Dt.loc.names.get(tab)
    kid = ent.get("m_KeyId")
    return ent.get("m_Key") or (Dt.loc.shared.get(g, {}).get(kid) if g and kid else None)


# --------------------------------------------------------------------------- cây RectTransform
FONTS = {}
LAYOUT = {"HorizontalLayoutGroup": "H", "VerticalLayoutGroup": "V", "GridLayoutGroup": "G"}


def walk(tr, base_path, t5paths):
    t = get(tr)
    go = tr.assets_file.objects[t["m_GameObject"]["m_PathID"]]
    g = get(go)
    p = path_of(tr)
    rel = p[len(base_path) + 1:] if p.startswith(base_path + "/") else ""
    n = {"n": g["m_Name"], "on": int(g.get("m_IsActive", 1))}
    if tr.type.name == "RectTransform":
        v2 = lambda d: [r3(d["x"]), r3(d["y"])]  # noqa: E731
        n["rt"] = {"amin": v2(t["m_AnchorMin"]), "amax": v2(t["m_AnchorMax"]), "piv": v2(t["m_Pivot"]),
                   "ap": v2(t["m_AnchoredPosition"]), "sd": v2(t["m_SizeDelta"])}
    if rel in t5paths:
        n["t5"] = 1
    loc = None
    for c, o in comps(go):
        ct = get(o)
        if c == "LocalizeStringEvent":
            loc = loc_key(o)
    for c, o in comps(go):
        ct = get(o)
        if c == "Image":
            n["img"] = {"s": sprite_of(ct.get("m_Sprite"), o), "t": ct["m_Type"], "fc": ct.get("m_FillCenter", 1),
                        "pa": ct.get("m_PreserveAspect", 0), "c": rgba(ct["m_Color"])}
        elif c == "TextMeshProUGUI":
            f = font_info(ct.get("m_fontAsset"), o)
            if f:
                FONTS[f["family"]] = f
            n["tx"] = {"t": ct["m_text"], "k": loc, "s": r3(ct["m_fontSize"]), "au": ct["m_enableAutoSizing"],
                       "mn": r3(ct["m_fontSizeMin"]), "mx": r3(ct["m_fontSizeMax"]), "c": rgba(ct["m_fontColor"]),
                       "h": ct["m_HorizontalAlignment"], "v": ct["m_VerticalAlignment"], "f": f["family"] if f else None,
                       "w": ct.get("m_enableWordWrapping", 1), "rt": ct.get("m_isRichText", 1)}
        elif c in LAYOUT:
            lg = {"t": LAYOUT[c]}
            if "m_Padding" in ct:
                pd = ct["m_Padding"]
                lg["pad"] = [pd["m_Left"], pd["m_Right"], pd["m_Top"], pd["m_Bottom"]]
            for k, key in (("m_Spacing", "sp"), ("m_ChildAlignment", "al"), ("m_ChildControlWidth", "cw"), ("m_ChildControlHeight", "ch"),
                           ("m_ChildForceExpandWidth", "fw"), ("m_ChildForceExpandHeight", "fh"), ("m_ReverseArrangement", "rev"),
                           ("m_StartCorner", "corner"), ("m_StartAxis", "axis"), ("m_Constraint", "con"), ("m_ConstraintCount", "cc")):
                if k in ct:
                    lg[key] = r3(ct[k]) if not isinstance(ct[k], dict) else [r3(ct[k]["x"]), r3(ct[k]["y"])]
            if "m_CellSize" in ct:
                lg["cell"] = [r3(ct["m_CellSize"]["x"]), r3(ct["m_CellSize"]["y"])]
            if "m_Spacing" in ct and isinstance(ct["m_Spacing"], dict):
                lg["sp"] = [r3(ct["m_Spacing"]["x"]), r3(ct["m_Spacing"]["y"])]
            n["lg"] = lg
        elif c == "UpgradeNodeUI":
            n["up"] = get(W.obj(o.assets_file, ct["upgradeData"]["m_FileID"], ct["upgradeData"]["m_PathID"]))["id"]
    kids = [walk(tr.assets_file.objects[ch["m_PathID"]], base_path, t5paths) for ch in t.get("m_Children") or []]
    if kids:
        n["k"] = kids
    return n


def child(tr, i=0):
    return tr.assets_file.objects[get(tr)["m_Children"][i]["m_PathID"]]


def pptr(o, p):
    return W.obj(o.assets_file, p["m_FileID"], p["m_PathID"])


# --------------------------------------------------------------------------- chạy
M = scene_monos("UpgradeWindow", "UpgradeNodeUI", "UpgradeDestination", "UpgradeGridPanel", "TooltipUI", "TooltipSectionUpgradeCost")
uw = M["UpgradeWindow"][0]
CONT = WIN_PATH + "/Container"
WIN = CONT + "/Window"
container = child(tr_of(go_of(uw)))
assert path_of(container) == CONT, path_of(container)
tier5 = [path_of(tr_of(pptr(uw, p)))[len(WIN) + 1:] for p in get(uw)["hullTier5Content"]]
tree = walk(container, CONT, {"Window/" + p for p in tier5})

# nút nâng cấp: id + các đường nối đổi màu (UpgradeNodeUI.RefreshUI)
nodes = []
for o in M["UpgradeNodeUI"]:
    ct = get(o)
    rel = lambda ptr: path_of(tr_of(go_of(pptr(o, ptr))))[len(WIN) + 1:]  # noqa: E731
    nodes.append({"id": get(pptr(o, ct["upgradeData"]))["id"], "path": path_of(tr_of(go_of(o)))[len(WIN) + 1:],
                  "pre": [rel(p) for p in ct["linesToColorWhenPrerequisitesAreMet"]],
                  "post": [rel(p) for p in ct["linesToColorWhenThisIsResearched"]]})
nodes.sort(key=lambda x: x["id"])

# ụ tàu: bản cơ bản allowHullTier5Content = 0
dest = {get(o)["id"]: {"allowHullTier5Content": bool(get(o)["allowHullTier5Content"])} for o in M["UpgradeDestination"]}
dest = dict(sorted(dest.items()))

# tooltip nâng cấp: Container (viền, cách) + 4 mục + ô vật liệu (prefab TooltipUpgradeCostIcon)
tip_root = child(tr_of(go_of(M["TooltipUI"][0])))
assert path_of(tip_root) == TIP_PATH, path_of(tip_root)
tip = {}
for i in range(len(get(tip_root)["m_Children"])):
    ch = child(tip_root, i)
    nm = get(go_of(ch))["m_Name"]
    if nm in ("TooltipSectionHeaderWithIcon", "TooltipSectionDescription", "TooltipSectionUpgradeCost", "TooltipSectionControlPrompts"):
        tip[nm] = walk(ch, TIP_PATH, set())
cont = {"sd": [r3(get(tip_root)["m_SizeDelta"]["x"]), r3(get(tip_root)["m_SizeDelta"]["y"])]}
for c, o in comps(go_of(tip_root)):
    ct = get(o)
    if c == "VerticalLayoutGroup":
        cont["pad"] = [ct["m_Padding"]["m_Left"], ct["m_Padding"]["m_Right"], ct["m_Padding"]["m_Top"], ct["m_Padding"]["m_Bottom"]]
        cont["sp"] = ct["m_Spacing"]
    if c == "Image":
        cont["bg"] = sprite_of(ct.get("m_Sprite"), o)
tip["container"] = cont
prefab = pptr(M["TooltipSectionUpgradeCost"][0], get(M["TooltipSectionUpgradeCost"][0])["upgradeCostIconPrefab"])
tip["costIcon"] = walk(tr_of(prefab), "TooltipUpgradeCostIcon", set())

# SFX hoàn tất nâng cấp (GUID -> tên clip gốc)
gp = get(M["UpgradeGridPanel"][0])
sfx_guid = gp["upgradeCompleteSFX"]["m_AssetGUID"]
sfx_name = os.path.splitext(os.path.basename(Dt.GUIDS[sfx_guid]))[0] if sfx_guid in Dt.GUIDS else None

# giá vật liệu thật = completeConditions của QuestGridConfig (Odin)
costs = {}
seen = set()
for b in sorted(W.bundle_cabs):
    for s in W.bundle_cabs[b]:
        for o in s.objects.values():
            if o.type.name == "MonoBehaviour" and W.cls(o) in ("HullUpgradeData", "SlotUpgradeData") and (id(s), o.path_id) not in seen:
                seen.add((id(s), o.path_id))
                t = o.read_typetree()
                gc = W.obj(s, t["gridConfig"]["m_FileID"], t["gridConfig"]["m_PathID"])
                d = Dt.export_obj(gc, "QuestGridConfig")
                costs[t["id"]] = {"gridKey": d.get("gridKey"), "items": [{"item": c["item"], "count": c["count"]} for c in d.get("completeConditions", [])
                                                                          if c.get("_t") == "ItemCountCondition"]}
costs = dict(sorted(costs.items()))

# màu: GameConfigData.colors[SettingsSaveData.color<T>]
cfg = json.loads(open(os.path.join(GAME, "data", "config.js"), encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))
W.load_player_files()
tmpl = None
for o in W.player_sf.objects.values():
    if o.type.name == "MonoBehaviour" and W.cls(o) == "SettingsSaveDataTemplate":
        t = o.read_typetree()
        if t["m_Name"] == "SettingsSaveDataTemplate":
            tmpl = t
NAMES = ["Neutral", "Emphasis", "Positive", "Negative", "Critical", "Warning", "Valuable", "Disabled"]
colors = {}
for n in NAMES:
    colors[n.upper()] = cfg["colors"][tmpl["color" + n]]

# ghi ảnh sprite (cỡ gốc, WebP không mất)
os.makedirs(ART, exist_ok=True)
for name, s in sorted(SPRITES.items()):
    s["img"].save(os.path.join(GAME, s["f"]), "WEBP", lossless=True, quality=100, method=6)
sprites_out = {k: {kk: vv for kk, vv in v.items() if kk != "img"} for k, v in sorted(SPRITES.items())}

# kiểm giá của data/upgrades.js (upgradeCost) với completeConditions
ups = json.loads(open(os.path.join(GAME, "data", "upgrades.js"), encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))
stale = []
for uid, u in sorted(ups.items()):
    a = sorted((c["itemData"], c["num"]) for c in u.get("upgradeCost", []))
    b = sorted((c["item"], c["count"]) for c in costs[uid]["items"])
    if a != b:
        stale.append(uid)

out = {
    "source": "DREDGE 1.5.3: Game scene bundle (UpgradeWindow, Tooltip, UpgradeNodeUI, UpgradeDestination, QuestGridConfig), SettingsSaveDataTemplate",
    "canvas": {"w": 1920, "h": 1080, "ppu": 100},
    "font": FONTS,
    "colors": colors,
    "tree": tree,
    "tier5": tier5,
    "nodes": nodes,
    "destinations": dest,
    "tooltip": tip,
    "costs": costs,
    "sprites": sprites_out,
    "sfx": {"upgradeComplete": sfx_name},
}
os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
s = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* generated by tools/upgrade_ui.py - do not edit */\nwindow.DR_UPGRADE_UI=%s;\n" % s)
print("wrote", os.path.relpath(OUT_JS, GAME), len(s.encode("utf-8")), "bytes;", len(SPRITES), "sprites,", sum(1 for _ in nodes), "nodes")
print("colors", colors)
print("tier5 content:", tier5)
print("destinations:", {k: v["allowHullTier5Content"] for k, v in dest.items()})
print("sfx upgradeComplete:", sfx_name)
print("upgrades.js upgradeCost khác completeConditions:", stale)
print("fonts:", {k: (v["pointSize"], v["cap"]) for k, v in FONTS.items()})
