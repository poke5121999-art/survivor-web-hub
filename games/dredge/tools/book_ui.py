# -*- coding: utf-8 -*-
"""Bóc màn Bản đồ (MapWindow, phím M) và Bách khoa (EncyclopediaWindow, phím L) của DREDGE cho Biển Mù.

Chạy:  python -I games/dredge/tools/book_ui.py        (~40 giây, chạy lại ra đúng từng byte)
Cần:   tools/index_bundles.py và tools/data.py đã chạy (đọc cache/bundle_index.json, data/config.js, data/items.js).
Ra:    data/encyclopedia.js          window.DR_BOOK (cây RectTransform của hai cửa sổ, sprite, thứ tự cá của sách, màu, tham số)
       art/ui/book/*.webp            sprite đúng bản mà Image trỏ tới (cỡ gốc; ảnh > 150 nghìn điểm lưu WebP có mất mát q88)

Nguồn (chỉ đọc): bundle scene gamescene_scenes_all_*.bundle (Game scene, UnityPy), như tools/upgrade_ui.py.
  GameCanvases/.../PopupCanvas/MapWindow/Container          Scrim, Map (Background MapBG, Letters/Numbers, MapMask > GridLines + MapContents), Title
  MapContents                                                BorderCircle, HeadingLines, Landmasses, AreaLabels, DockCircles, DockLabels, YouAreHereMarker
  MapWindow (MonoBehaviour)                                  horizontalSectors 19, verticalSectors 15, mapViewRectWidth 1142 x 902, proportionOfWorldRepresentedOnMap, boatSprites (17)
  .../EncyclopediaWindow/Container                           Scrim, Encyclopedia (PageLeft, PageRight, PageCounter, DiscoveryCounter, Zones, Types), Title
  Encyclopedia (MonoBehaviour)                               allFish (thứ tự cá của sách), zoneButtonWidthIdle/Selected, màu nút loại
  EncyclopediaPage (MonoBehaviour)                           màu ảnh cá đã/chưa biết, trophyIconColorMultiplier

Bẫy đã sập (đọc trước khi sửa tool):
  1. Mọi bẫy của upgrade_ui.py áp dụng nguyên (ppu của ảnh Sliced, m_Border (trái, dưới, phải, trên), cờ căn dọc TMP, tên sprite trùng).
  2. Ảnh nhỏ do data.py thu về 256 px không dùng được cho nền sách (FishEncyclopediaBG 1348x1732 -> 199x256) và nền bản đồ (MapBG
     2584x2112 -> 256x209): tool này ghi lại cỡ gốc vào art/ui/book (thư mục riêng, data.py không đụng).
  3. Ảnh cá trong sách (Image / AberrationImage) trỏ tới sprite mẫu "mackerel": đó là giá trị lúc dựng prefab, bị EncyclopediaPage.RefreshUI
     thay lúc chạy. Tool KHÔNG ghi ảnh mẫu, chỉ đánh dấu node có `dyn`.
  4. GridLines của bản đồ là RawImage (texture GridSquare lặp 19 x 15 ô, màu 0,45/0,58/0,47), không phải Image: walk() ghi nó ở trường `raw`.
  5. Nút thứ 9 của nhóm "Types" (ICE) và "Zones" (The Pale Reach) tắt sẵn vì cần DLC. Tool giữ cờ `on`.
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
ART_REL = "art/ui/book"
ART = os.path.join(GAME, ART_REL)
OUT_JS = os.path.join(GAME, "data", "encyclopedia.js")
SCENE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
LOC_SHARED = "localization-assets-shared_assets_all_4a0873e3d99c2046eeb40f0ab89ab825.bundle"
W = Dt.W
# sprite mẫu của prefab (bị thay lúc chạy), không ghi ra đĩa
PLACEHOLDER = {"mackerel", "mackerel-ab-1"}

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
    if name in PLACEHOLDER:
        return None
    if name in SPRITES:      # trùng tên, khác đối tượng: giữ cả hai, đuôi theo path id
        name = "%s_%x" % (name, o.path_id & 0xFFFF)
    img = s.image
    b = s.m_Border
    SPRITES[name] = {"f": "%s/%s.webp" % (ART_REL, name), "w": img.width, "h": img.height,
                     "b": [r3(float(b.x)), r3(float(b.y)), r3(float(b.z)), r3(float(b.w))],
                     "ppu": r3(float(s.m_PixelsToUnits)), "img": img}
    _SPR_KEY[key] = name
    return name


def texture_of(ptr, owner):
    """PPtr của RawImage.m_Texture -> tên trong SPRITES (Texture2D, đóng gói như sprite 1:1)."""
    if not ptr or not ptr.get("m_PathID"):
        return None
    o = W.obj(owner.assets_file, ptr["m_FileID"], ptr["m_PathID"])
    if o is None:
        return None
    key = (id(o.assets_file), o.path_id)
    if key in _SPR_KEY:
        return _SPR_KEY[key]
    t = o.read()
    name = t.m_Name
    img = t.image
    SPRITES[name] = {"f": "%s/%s.webp" % (ART_REL, name), "w": img.width, "h": img.height, "b": [0, 0, 0, 0], "ppu": 100.0, "img": img}
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
    if g["m_Name"] in ("DLC1", "DLC2"):       # nội dung DLC (bản đồ Pale Reach / Iron Rig): web không có, không ghi sprite
        return {"n": g["m_Name"], "on": 0}
    if tr.type.name == "RectTransform":
        v2 = lambda d: [r3(d["x"]), r3(d["y"])]  # noqa: E731
        n["rt"] = {"amin": v2(t["m_AnchorMin"]), "amax": v2(t["m_AnchorMax"]), "piv": v2(t["m_Pivot"]),
                   "ap": v2(t["m_AnchoredPosition"]), "sd": v2(t["m_SizeDelta"])}
        sc = t["m_LocalScale"]
        if (sc["x"], sc["y"]) != (1.0, 1.0):
            n["rt"]["sc"] = [r3(sc["x"]), r3(sc["y"])]
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
            if n["img"]["s"] is None and ct.get("m_Sprite") and ct["m_Sprite"].get("m_PathID"):
                n["img"]["dyn"] = 1
            if not ct.get("m_Enabled", 1):
                n["img"]["en"] = 0          # Image tắt (vùng bấm Zones / Types): không vẽ
        elif c == "Mask":
            n["mask"] = int(ct.get("m_ShowMaskGraphic", 1))     # Mask: ảnh của chính nó chỉ dùng làm khuôn khi m_ShowMaskGraphic = 0
        elif c == "RawImage":
            uv = ct["m_UVRect"]
            n["raw"] = {"s": texture_of(ct.get("m_Texture"), o), "c": rgba(ct["m_Color"]), "uv": [r3(uv["x"]), r3(uv["y"]), r3(uv["width"]), r3(uv["height"])]}
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
    for c, o in comps(go):
        ct = get(o)
        if c == "DockLabel":                  # DockLabel.OnEnable: chỉ hiện chữ khi SaveData có "has-visited-dock-" + dockData.Id
            n["dock"] = get(pptr(o, ct["dockData"]))["id"]
        elif c == "ZoneLabel":                # nhãn vùng; obscuredLabelKey = chữ khi chưa tới ("???")
            n["zone"] = {"obs": lstr_key(ct.get("obscuredLabelKey")), "demo": ct.get("availableInDemo", 0)}
        if "m_arcDegrees" in ct:              # script CurvedText (plugin, không có trong Assembly-CSharp): chữ uốn theo cung tròn
            n["curve"] = {"r": r3(ct["m_radius"]), "arc": r3(ct["m_arcDegrees"]), "off": r3(ct["m_angularOffset"]), "inv": ct.get("inverted", 0),
                          "maxDeg": r3(ct.get("m_maxDegreesPerLetter", 0))}
    kids = [walk(tr.assets_file.objects[ch["m_PathID"]], base_path, t5paths) for ch in t.get("m_Children") or []]
    if kids:
        n["k"] = kids
    return n


def lstr_key(ref):
    """LocalizedString (trường thường, không phải LocalizeStringEvent) -> khoá chuỗi."""
    if not ref:
        return None
    ent = ref.get("m_TableEntryReference") or {}
    tab = (ref.get("m_TableReference") or {}).get("m_TableCollectionName") or ""
    g = tab[5:] if tab.startswith("GUID:") else Dt.loc.names.get(tab)
    kid = ent.get("m_KeyId")
    return ent.get("m_Key") or (Dt.loc.shared.get(g, {}).get(kid) if g and kid else None)


def child(tr, i=0):
    return tr.assets_file.objects[get(tr)["m_Children"][i]["m_PathID"]]


def pptr(o, p):
    return W.obj(o.assets_file, p["m_FileID"], p["m_PathID"])




# --------------------------------------------------------------------------- chạy
M = scene_monos("MapWindow", "EncyclopediaWindow", "Encyclopedia", "EncyclopediaPage", "AberrationInfoUI")


def window_tree(mono, expect_suffix):
    go = go_of(mono)
    container = child(tr_of(go))
    base = path_of(container)
    assert base.endswith(expect_suffix + "/Container"), base
    return walk(container, base, set()), base


map_mb = M["MapWindow"][0]
map_tree, map_base = window_tree(map_mb, "MapWindow")
map_ct = get(map_mb)
enc_win = M["EncyclopediaWindow"][0]
enc_tree, enc_base = window_tree(enc_win, "EncyclopediaWindow")

# thứ tự cá của sách (Encyclopedia.allFish) và tham số
enc_mb = M["Encyclopedia"][0]
enc_ct = get(enc_mb)
fish = [get(pptr(enc_mb, p))["id"] for p in enc_ct["allFish"]]
assert len(fish) == len(set(fish)), "allFish có id trùng"

pages = sorted(M["EncyclopediaPage"], key=lambda o: path_of(tr_of(go_of(o))))
page_ct = get(pages[0])
page_params = {k: (rgba(page_ct[k]) if isinstance(page_ct[k], dict) and "r" in page_ct[k] else r3(page_ct[k]))
               for k in ("fadeDurationSec", "itemImageColorIdentified", "itemImageColorUnidentified", "trophyThreshold", "trophyIconColorMultiplier")}
ab = get(M["AberrationInfoUI"][0])
aber_params = {"identified": rgba(ab["itemImageColorIdentified"]), "unidentified": rgba(ab["itemImageColorUnidentified"])}


def cblock(cb):
    return {k: rgba(cb[k]) for k in ("m_NormalColor", "m_HighlightedColor", "m_PressedColor", "m_SelectedColor", "m_DisabledColor")}


enc_params = {"zoneButtonWidthIdle": r3(enc_ct["zoneButtonWidthIdle"]), "zoneButtonWidthSelected": r3(enc_ct["zoneButtonWidthSelected"]),
              "typeActive": cblock(enc_ct["harvestTypeActiveColorBlock"]), "typeInactive": cblock(enc_ct["harvestTypeInactiveColorBlock"]),
              "page": page_params, "aberration": aber_params}

# 17 sprite thuyền của bản đồ (MapWindow.boatSprites, chỉ số = round(yaw / 22,5), 16 = 0)
boats = [sprite_of(p, map_mb) for p in map_ct["boatSprites"]]
map_params = {"horizontalSectors": map_ct["horizontalSectors"], "verticalSectors": map_ct["verticalSectors"],
              "mapViewRectWidth": r3(map_ct["mapViewRectWidth"]), "mapViewRectHeight": r3(map_ct["mapViewRectHeight"]),
              "proportionOfWorldRepresentedOnMap": r3(map_ct["proportionOfWorldRepresentedOnMap"]),
              "markerMaxScale": r3(map_ct["mapMarkerMaxScale"]), "boats": boats}

# bản đồ: ảnh thuyền "Boat" dùng sprite cuối cùng của danh sách ở bản dựng sẵn; JS đổi theo hướng

# màu: GameConfigData.colors[SettingsSaveData.color<T>] (bẫy 4 của upgrade_ui.py)
cfg = json.loads(open(os.path.join(GAME, "data", "config.js"), encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))
W.load_player_files()
tmpl = None
for o in W.player_sf.objects.values():
    if o.type.name == "MonoBehaviour" and W.cls(o) == "SettingsSaveDataTemplate":
        t = o.read_typetree()
        if t["m_Name"] == "SettingsSaveDataTemplate":
            tmpl = t
NAMES = ["Neutral", "Emphasis", "Positive", "Negative", "Critical", "Warning", "Valuable", "Disabled"]
colors = {n.upper(): cfg["colors"][tmpl["color" + n]] for n in NAMES}

# ghi ảnh sprite (cỡ gốc; ảnh lớn lưu WebP mất mát để giữ ngân sách 90 MB)
os.makedirs(ART, exist_ok=True)
sizes = {}
for name, s in sorted(SPRITES.items()):
    path = os.path.join(GAME, s["f"])
    img = s["img"]
    if img.width * img.height > 150000:
        img.save(path, "WEBP", quality=88, method=6)
    else:
        img.save(path, "WEBP", lossless=True, quality=100, method=6)
    sizes[name] = os.path.getsize(path)
sprites_out = {k: {kk: vv for kk, vv in v.items() if kk != "img"} for k, v in sorted(SPRITES.items())}

out = {
    "source": "DREDGE 1.5.3: Game scene bundle (MapWindow, EncyclopediaWindow, Encyclopedia, EncyclopediaPage, AberrationInfoUI), SettingsSaveDataTemplate",
    "canvas": {"w": 1920, "h": 1080, "ppu": 100},
    "font": FONTS,
    "colors": colors,
    "map": {"tree": map_tree, "p": map_params},
    "enc": {"tree": enc_tree, "p": enc_params, "fish": fish},
    "sprites": sprites_out,
}
os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
s = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* generated by tools/book_ui.py - do not edit */\nwindow.DR_BOOK=%s;\n" % s)
print("wrote", os.path.relpath(OUT_JS, GAME), len(s.encode("utf-8")), "bytes;", len(SPRITES), "sprites,", len(fish), "fish")
print("art bytes:", sum(sizes.values()), {k: v for k, v in sizes.items() if v > 60000})
print("colors", colors)
print("map params", {k: v for k, v in map_params.items() if k != "boats"}, "boats", boats)
print("enc params", enc_params["zoneButtonWidthIdle"], enc_params["zoneButtonWidthSelected"], page_params, aber_params)
print("fonts:", {k: (v["pointSize"], v["cap"]) for k, v in FONTS.items()})
