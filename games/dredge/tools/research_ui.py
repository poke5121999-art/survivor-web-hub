# -*- coding: utf-8 -*-
"""Bóc màn "Research" (ResearchWindow) của điểm đến nghiên cứu từ bundle scene gốc cho Biển Mù.

Chạy:  python -I games/dredge/tools/research_ui.py        (~30 giây, chạy lại ra đúng từng byte)
Cần:   tools/index_bundles.py và tools/data.py đã chạy (đọc cache/bundle_index.json, data/config.js, data/items.js).
Ra:    data/research_ui.js           window.DR_RESEARCH_UI (cây RectTransform, sprite, khoá chữ, màu, 25 mục nghiên cứu, 4 tab, tiếng)
       art/ui/research/*.webp        sprite đúng bản mà Image của cây trỏ tới (cỡ gốc)

Nguồn (chỉ đọc): bundle scene gamescene_scenes_all_*.bundle (Game scene, UnityPy), như tools/upgrade_ui.py (đọc nó trước, có 7 bẫy chung):
  GameCanvases/PopupCanvas/ResearchWindow/Container   Scrim, Window 1640x820 (Image, ResearchItemCountContainer, TabbedPanelContainer
                                                      {TopBar: Tabs + nhắc phím Q/E, Panels: 4 ResearchPanel}, Disclaimer, Title)
  ResearchableEntry x25                               mỗi mục: spatialItemData, pixelsPerSquare, đường nối đổi màu (tiên quyết / đã nghiên cứu),
                                                      highlightConditions (AttentionCallout)
  TabUI x4                                            sprite Selected/Unselected/Locked của nút tab
  ResearchHelper                                      researchItemData + tiếng spend thành công / thất bại
Điều kiện tiên quyết và ResearchPointsRequired KHÔNG nằm trong cảnh: là trường của SpatialItemData (data/items.js: researchPrerequisites,
itemOwnPrerequisites, researchPointsRequired). Số ResearchNotch con của NotchContainer là số chấm vẽ sẵn; tool in ra để so với researchPointsRequired.

Bẫy đã sập:
  1. Vị trí mục (ap) là toạ độ trong ô Researchables (neo giữa, y hướng lên); đường nối (rodNLine...) là mảnh 2 px nằm cùng ô, KHÔNG phải
     con của mục: mục chỉ giữ tham chiếu để đổi màu (linesToColorWhen...). Pivot của mảnh đường lấy từ RectTransform (không phải 0.5 cả).
  2. Image.sprite của ảnh món (ResearchableContainer/Image) là null trong cảnh, đặt lúc chạy từ spatialItemData.sprite; Border/Image trong ô
     ResearchableContainer có sizeDelta riêng (150x150, 75x225...) = ô x pixelsPerSquare, đừng suy từ dims.
  3. Cùng bẫy 2, 4, 5, 6 của tools/upgrade_ui.py (sprite trùng tên, màu DredgeColorTypeEnum, font localization-assets-shared, cờ căn TMP).
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
ART_REL = "art/ui/research"
ART = os.path.join(GAME, ART_REL)
OUT_JS = os.path.join(GAME, "data", "research_ui.js")
SCENE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
LOC_SHARED = "localization-assets-shared_assets_all_4a0873e3d99c2046eeb40f0ab89ab825.bundle"
WIN_PATH = "GameCanvases/PopupCanvas/ResearchWindow"
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


def walk(tr, base_path):
    t = get(tr)
    go = tr.assets_file.objects[t["m_GameObject"]["m_PathID"]]
    g = get(go)
    n = {"n": g["m_Name"], "on": int(g.get("m_IsActive", 1))}
    if tr.type.name == "RectTransform":
        v2 = lambda d: [r3(d["x"]), r3(d["y"])]  # noqa: E731
        n["rt"] = {"amin": v2(t["m_AnchorMin"]), "amax": v2(t["m_AnchorMax"]), "piv": v2(t["m_Pivot"]),
                   "ap": v2(t["m_AnchoredPosition"]), "sd": v2(t["m_SizeDelta"])}
    loc = None
    for c, o in comps(go):
        if c == "LocalizeStringEvent":
            loc = loc_key(o)

    def rel(ptr, o):
        return path_of(tr_of(go_of(W.obj(o.assets_file, ptr["m_FileID"], ptr["m_PathID"]))))[len(base_path) + 1:]

    def nm(o, s):
        return get(W.obj(o.assets_file, s["m_FileID"], s["m_PathID"])).get("m_Name")
    for c, o in comps(go):
        ct = get(o)
        if c == "Image":
            n["img"] = {"s": sprite_of(ct.get("m_Sprite"), o), "t": ct["m_Type"], "fc": ct.get("m_FillCenter", 1),
                        "pa": ct.get("m_PreserveAspect", 0), "c": rgba(ct["m_Color"])}
            if ct.get("m_PixelsPerUnitMultiplier", 1) != 1:        # ô lưới Tiled của Border: ppm = ppu / (pixelsPerSquare ...)
                n["img"]["ppm"] = r3(ct["m_PixelsPerUnitMultiplier"])
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
        elif c == "ResearchableEntry":
            it = W.obj(o.assets_file, ct["spatialItemData"]["m_FileID"], ct["spatialItemData"]["m_PathID"])
            hl = []
            for h in ct["highlightConditions"]:
                hl.append({"always": bool(h["alwaysHighlight"]), "unvisited": list(h["highlightIfNodesUnvisited"]),
                           "visited": list(h["andTheseNodesVisited"]),
                           "stepsActive": [nm(o, s) for s in h["ifTheseStepsActive"]],
                           "stepsNotCompleted": [nm(o, s) for s in h["andTheseStepsNotCompleted"]],
                           "extra": bool(h["extraConditions"]["m_PathID"])})
            n["re"] = {"item": get(it)["id"], "pps": r3(ct["pixelsPerSquare"]),
                       "pre": [rel(x, o) for x in ct["linesToColorWhenPrerequisitesAreMet"]],
                       "post": [rel(x, o) for x in ct["linesToColorWhenThisIsResearched"]],
                       "hl": hl}
        elif c == "TabUI":
            n["tab"] = {k: sprite_of(ct.get(f), o) for k, f in (("sel", "selectedSprite"), ("unsel", "unselectedSprite"), ("lock", "lockedSprite"))}
        elif c == "LayoutElement":
            n["le"] = {k: r3(ct[f]) for k, f in (("mw", "m_MinWidth"), ("pw", "m_PreferredWidth"), ("fw", "m_FlexibleWidth"),
                                                  ("mh", "m_MinHeight"), ("ph", "m_PreferredHeight"), ("fh", "m_FlexibleHeight")) if f in ct}
        elif c == "ResearchPanel":
            n["panel"] = 1
    kids = [walk(tr.assets_file.objects[ch["m_PathID"]], base_path) for ch in t.get("m_Children") or []]
    if kids:
        n["k"] = kids
    return n


def pptr(o, p):
    return W.obj(o.assets_file, p["m_FileID"], p["m_PathID"])


# --------------------------------------------------------------------------- chạy
M = scene_monos("ResearchWindow", "ResearchableEntry", "ResearchHelper", "TabbedPanelContainer")
rw = M["ResearchWindow"][0]
CONT = WIN_PATH + "/Container"
container = tr_of(pptr(rw, get(rw)["container"]))
assert path_of(container) == CONT, path_of(container)
tree = walk(container, CONT)

rh = M["ResearchHelper"][0]
rht = get(rh)
research_item = get(pptr(rh, rht["researchItemData"]))["id"]
# tiếng: ResearchHelper.spendResearchSuccessSFX / FailureSFX là PPtr sang tệp ngoài (fileID 8) nên tool không đọc được tên clip;
# js dùng khoá có sẵn trong data/audio.js: ui.research.spend (spend-research.wav), ui.research.complete (Research - Complete.wav)
sfx = {"ok": "ui.research.spend", "done": "ui.research.complete", "fail": "ui.error"}

# màu: DredgeColorTypeEnum = GameConfigData.colors[SettingsSaveDataTemplate.color<T>] (bẫy 4 của tools/upgrade_ui.py). Đọc từ data/upgrade_ui.js
# (tool đó đã đọc sharedassets0.assets bằng TypeTreeGenerator; máy không có TypeTreeGeneratorAPI thì tool này vẫn chạy được)
colors = json.loads(open(os.path.join(GAME, "data", "upgrade_ui.js"), encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))["colors"]

# ảnh món (Image của ResearchableContainer trỏ sprite của chính món) đã có ở art/items nhờ data.py: không ghi lại (bẫy 2), js dùng DR_ITEMS[id].sprite
items = json.loads(open(os.path.join(GAME, "data", "items.js"), encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))
for name in [k for k in SPRITES if k in items]:
    del SPRITES[name]
def strip_items(n):
    if n.get("img") and n["img"].get("s") in items:
        n["img"]["s"] = None
    for k in n.get("k") or []:
        strip_items(k)
strip_items(tree)

# ảnh sprite (cỡ gốc, WebP không mất); xoá tệp thừa để chạy lại ra đúng từng byte
os.makedirs(ART, exist_ok=True)
for fn in os.listdir(ART):
    if fn[:-5] not in SPRITES:
        os.remove(os.path.join(ART, fn))
for name, s in sorted(SPRITES.items()):
    s["img"].save(os.path.join(GAME, s["f"]), "WEBP", lossless=True, quality=100, method=6)
sprites_out = {k: {kk: vv for kk, vv in v.items() if kk != "img"} for k, v in sorted(SPRITES.items())}

# kiểm: số chấm vẽ sẵn so với researchPointsRequired của items.js
entries = []


def collect(n):
    if "re" in n:
        notches = 0
        for k in n.get("k") or []:
            for kk in k.get("k") or []:
                if kk["n"] == "NotchContainer":
                    notches = sum(1 for z in kk.get("k") or [] if z["n"] == "ResearchNotch")
        entries.append((n["n"], n["re"]["item"], notches))
    for k in n.get("k") or []:
        collect(k)


collect(tree)
bad = [(e[1], e[2], items[e[1]]["researchPointsRequired"]) for e in entries if e[2] != items[e[1]]["researchPointsRequired"]]

out = {
    "source": "DREDGE 1.5.3: Game scene bundle (ResearchWindow, ResearchableEntry, TabUI, ResearchHelper), SettingsSaveDataTemplate",
    "canvas": {"w": 1920, "h": 1080, "ppu": 100},
    "font": FONTS,
    "colors": colors,
    "researchItem": research_item,
    "tree": tree,
    "sfx": sfx,
    "sprites": sprites_out,
}
os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
s = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* generated by tools/research_ui.py - do not edit */\nwindow.DR_RESEARCH_UI=%s;\n" % s)
print("wrote", os.path.relpath(OUT_JS, GAME), len(s.encode("utf-8")), "bytes;", len(SPRITES), "sprites,", len(entries), "entries")
print("colors", colors)
print("sfx", sfx)
print("notch count != researchPointsRequired:", bad)
print("fonts:", {k: (v["pointSize"], v["cap"]) for k, v in FONTS.items()})
