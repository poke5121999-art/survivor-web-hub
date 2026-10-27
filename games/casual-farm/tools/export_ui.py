"""Export My Mini Mart uGUI layouts + sprites for the three.js/DOM remake.

Usage (from this folder): PYTHONIOENCODING=utf-8 py -3.12 export_ui.py

Writes games/casual-farm/art/ui/
  layout.json   {"hud": {scaler, trees}, "world": {name: {canvas, nodes}}, "sprites": {name: {w,h,border,pivot,ppu}},
                 "fonts": [...], "notes": [...]}
  sprites/<name>.webp   every sprite a kept Image / SpriteRenderer points at (lossless <=256 px, q90 above)
  export.log

Node: {name, parent (index, -1 root), active, path, rect {anchorMin, anchorMax, anchoredPosition, sizeDelta, pivot,
scale, rotZ}, xf (plain Transform nodes only: pos, scale, rotZ), image, text, layout, effects, scripts}.
Units are Unity's (uGUI pixels for the HUD; metres * scale for world canvases, see "canvas").
Rect values are raw Unity (y up, anchors 0..1 from bottom-left). 9-slice border is [l, b, r, t] in sprite pixels.
"""
import json, math, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "ui")
SPR = os.path.join(OUT, "sprites")
LOG = []
MAX_W = 1024
IMG_TYPE = ["simple", "sliced", "tiled", "filled"]
FILL_METHOD = ["horizontal", "vertical", "radial90", "radial180", "radial360"]
H_ALIGN = {1: "left", 2: "center", 4: "right", 8: "justified", 16: "flush", 32: "geometry"}
V_ALIGN = {256: "top", 512: "middle", 1024: "bottom", 2048: "baseline", 4096: "geometry", 8192: "capline"}
CHILD_ALIGN = ["UpperLeft", "UpperCenter", "UpperRight", "MiddleLeft", "MiddleCenter", "MiddleRight",
               "LowerLeft", "LowerCenter", "LowerRight"]


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.append(s)
    print(s, flush=True)


def r(v, n=4):
    return round(v, n)


def v2(d):
    return [r(d["x"]), r(d["y"])]


def col(c):
    return [r(c["r"], 3), r(c["g"], 3), r(c["b"], 3), r(c["a"], 3)]


class File:
    """One serialized file: GameObject / Transform maps like export_store.py."""
    def __init__(s, name):
        s.name = name
        s.objs = mm.by_file(name)
        s.ext = mm.ext_names(next(iter(s.objs.values())).assets_file)
        s.tt = {}
        s.owner = {}
        s.trans = {}
        s.parent = {}
        s.children = {}
        gos = [p for p, o in s.objs.items() if o.type.name == "GameObject"]
        for g in gos:
            for c in s.T(g)["m_Component"]:
                s.owner[c["component"]["m_PathID"]] = g
        for g in gos:
            for c in s.T(g)["m_Component"]:
                cid = c["component"]["m_PathID"]
                if cid in s.objs and s.objs[cid].type.name in ("Transform", "RectTransform"):
                    s.trans[g] = cid
        for g, t in s.trans.items():
            d = s.T(t)
            fp = d["m_Father"]["m_PathID"]
            s.parent[g] = s.owner.get(fp) if fp else None
            s.children[g] = [s.owner[x["m_PathID"]] for x in d["m_Children"] if x["m_PathID"] in s.owner]

    def T(s, pid):
        if pid not in s.tt:
            s.tt[pid] = s.objs[pid].read_typetree()
        return s.tt[pid]

    def gname(s, g):
        return s.T(g)["m_Name"]

    def find(s, path):
        """GameObject id for a '/'-separated path from a scene root (first match at each level)."""
        parts = path.split("/")
        cur = [g for g in s.trans if s.parent[g] is None and s.gname(g) == parts[0]]
        for p in parts[1:]:
            nxt = []
            for g in cur:
                nxt += [c for c in s.children[g] if s.gname(c) == p]
            cur = nxt
        return cur[0] if cur else None

    def comps(s, g):
        """[(kind, class, object)] for every component; MonoBehaviours report their script class."""
        out = []
        for c in s.T(g)["m_Component"]:
            cid = c["component"]["m_PathID"]
            o = s.objs.get(cid)
            if o is None:
                continue
            if o.type.name == "MonoBehaviour":
                try:
                    out.append(("MonoBehaviour", mm.script(o)[1], o))
                except Exception:
                    out.append(("MonoBehaviour", "?", o))
            else:
                out.append((o.type.name, o.type.name, o))
        return out


FILES = {}


def F(name):
    if name not in FILES:
        FILES[name] = File(name)
    return FILES[name]


def deref(f, pptr):
    """(File, path id) of a PPtr dict seen from file f, or None."""
    if not pptr or not pptr["m_PathID"]:
        return None
    fid = pptr["m_FileID"]
    nf = f if fid == 0 else F(f.ext[fid - 1])
    return nf, pptr["m_PathID"]


# ---------------------------------------------------------------- sprites
SPRITES = {}      # name -> info
SPRITE_IDS = {}   # (file, id) -> name
SKIPPED = []
FONTS = {}


def sprite_ref(f, pptr):
    d = deref(f, pptr)
    if not d:
        return None
    sf, pid = d
    key = (sf.name, pid)
    if key in SPRITE_IDS:
        return SPRITE_IDS[key]
    o = sf.objs.get(pid)
    if o is None or o.type.name != "Sprite":
        log("  not a sprite:", key, o.type.name if o else None)
        return None
    td = sf.T(pid)
    name = td["m_Name"]
    safe = "".join(ch if ch.isalnum() or ch in "-_. ()" else "_" for ch in name).strip() or f"sprite{pid}"
    base, n = safe, 2
    while safe in SPRITES:
        safe = f"{base}~{n}"
        n += 1
    rc = td["m_Rect"]
    info = {"w": r(rc["width"], 2), "h": r(rc["height"], 2),
            "border": [r(td["m_Border"][k], 2) for k in ("x", "y", "z", "w")] if isinstance(td["m_Border"], dict)
            else [r(x, 2) for x in td["m_Border"]],
            "pivot": [r(td["m_Pivot"]["x"]), r(td["m_Pivot"]["y"])], "ppu": r(td["m_PixelsToUnits"], 2),
            "src": f"{sf.name}:{pid}"}
    SPRITES[safe] = info
    SPRITE_IDS[key] = safe
    if info["w"] > MAX_W or info["h"] > MAX_W:
        SKIPPED.append((safe, info["w"], info["h"]))
        info["skipped"] = True
        log(f"  sprite {safe} {info['w']}x{info['h']} wider than {MAX_W}: not written")
        return safe
    try:
        im = o.read().image
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        info["px"] = list(im.size)
        p = os.path.join(SPR, safe + ".webp")
        if max(im.size) <= 256:
            im.save(p, "WEBP", lossless=True, quality=100, method=6)
        else:
            im.save(p, "WEBP", quality=90, method=6)
        info["kb"] = r(os.path.getsize(p) / 1024, 1)
    except Exception as e:
        info["error"] = repr(e)[:200]
        log(f"  sprite {safe}: image failed {e!r}")
    return safe


# ---------------------------------------------------------------- components
def mono(o):
    return mm.read(o)


def material_fx(f, pptr):
    """Outline / underlay / dilate from a TMP material's saved properties (nonzero only)."""
    d = deref(f, pptr)
    if not d:
        return None
    mf, pid = d
    if pid not in mf.objs:
        return None
    try:
        sp = mf.T(pid)["m_SavedProperties"]
    except Exception:
        return None
    fl = {k["first"] if isinstance(k, dict) else k[0]: (k["second"] if isinstance(k, dict) else k[1]) for k in sp["m_Floats"]}
    cl = {k["first"] if isinstance(k, dict) else k[0]: (k["second"] if isinstance(k, dict) else k[1]) for k in sp["m_Colors"]}
    out = {}
    for k in ("_OutlineWidth", "_OutlineSoftness", "_FaceDilate", "_UnderlayOffsetX", "_UnderlayOffsetY",
              "_UnderlayDilate", "_UnderlaySoftness", "_GlowPower", "_Bevel"):
        if abs(fl.get(k, 0)) > 1e-4:
            out[k] = r(fl[k])
    if "_OutlineWidth" in out and "_OutlineColor" in cl:
        out["_OutlineColor"] = col(cl["_OutlineColor"])
    if any(k.startswith("_Underlay") for k in out) and "_UnderlayColor" in cl:
        out["_UnderlayColor"] = col(cl["_UnderlayColor"])
    out["material"] = mf.T(pid).get("m_Name", "")
    return out


def text_of(f, d):
    fa = deref(f, d["m_fontAsset"])
    font = None
    if fa and fa[1] in fa[0].objs:
        try:
            font = fa[0].T(fa[1]).get("m_Name") or mm.read(fa[0].objs[fa[1]]).get("m_Name")
        except Exception:
            try:
                font = mm.read(fa[0].objs[fa[1]]).get("m_Name")
            except Exception:
                font = f"?{fa[0].name}:{fa[1]}"
        FONTS[font] = FONTS.get(font, 0) + 1
    t = {"text": d["m_text"], "font": font, "fontSize": r(d["m_fontSize"], 2), "color": col(d["m_fontColor"]),
         "alignment": [H_ALIGN.get(d["m_HorizontalAlignment"], d["m_HorizontalAlignment"]),
                       V_ALIGN.get(d["m_VerticalAlignment"], d["m_VerticalAlignment"])],
         "autoSize": bool(d["m_enableAutoSizing"])}
    if d["m_enableAutoSizing"]:
        t["autoMin"], t["autoMax"] = r(d["m_fontSizeMin"], 2), r(d["m_fontSizeMax"], 2)
    for k, kk in (("m_fontStyle", "fontStyle"), ("m_characterSpacing", "charSpacing"), ("m_wordSpacing", "wordSpacing"),
                  ("m_lineSpacing", "lineSpacing")):
        if d.get(k):
            t[kk] = d[k]
    t["wrap"] = d.get("m_TextWrappingMode", None)
    t["overflow"] = d.get("m_overflowMode", None)
    if d.get("m_enableVertexGradient"):
        g = d["m_fontColorGradient"]
        t["gradient"] = {k: col(g[k]) for k in ("topLeft", "topRight", "bottomLeft", "bottomRight")}
    fx = material_fx(f, d["m_sharedMaterial"])
    if fx:
        t["fx"] = fx
    if d.get("m_margin"):
        m = d["m_margin"]
        t["margin"] = [r(m["x"]), r(m["y"]), r(m["z"]), r(m["w"])]
    return t


def node_data(f, g, idx, parent, path):
    rt = f.trans.get(g)
    rtd = f.T(rt) if rt else None
    isrect = rt is not None and f.objs[rt].type.name == "RectTransform"
    n = {"name": f.gname(g), "parent": parent, "active": bool(f.T(g)["m_IsActive"]), "path": path}
    q = rtd["m_LocalRotation"]
    rotz = r(math.degrees(2 * math.atan2(q["z"], q["w"])), 3)
    if rotz > 180:
        rotz -= 360
    sc = rtd["m_LocalScale"]
    if isrect:
        n["rect"] = {"anchorMin": v2(rtd["m_AnchorMin"]), "anchorMax": v2(rtd["m_AnchorMax"]),
                     "anchoredPosition": v2(rtd["m_AnchoredPosition"]), "sizeDelta": v2(rtd["m_SizeDelta"]),
                     "pivot": v2(rtd["m_Pivot"]), "scale": [r(sc["x"]), r(sc["y"]), r(sc["z"])], "rotZ": rotz}
        if abs(q["x"]) > 1e-4 or abs(q["y"]) > 1e-4:
            n["rect"]["rotQuat"] = [r(q[k], 5) for k in "xyzw"]
        # the z of the anchored position matters for world canvases (3D offset of a child)
        p = rtd.get("m_LocalPosition")
        if p and abs(p["z"]) > 1e-4:
            n["rect"]["localZ"] = r(p["z"])
    elif rtd:
        p = rtd["m_LocalPosition"]
        n["xf"] = {"pos": [r(p["x"]), r(p["y"]), r(p["z"])], "scale": [r(sc["x"]), r(sc["y"]), r(sc["z"])], "rotZ": rotz,
                   "rotQuat": [r(q[k], 5) for k in "xyzw"]}
    image = text = layout = None
    effects, scripts, extra = [], [], {}
    for kind, cls, o in f.comps(g):
        try:
            if cls == "UnityEngine.UI.Image":
                d = mono(o)
                fm = d["m_FillMethod"]
                image = {"sprite": sprite_ref(f, d["m_Sprite"]), "color": col(d["m_Color"]),
                         "type": IMG_TYPE[d["m_Type"]], "preserveAspect": bool(d["m_PreserveAspect"]),
                         "enabled": bool(d["m_Enabled"]) if "m_Enabled" in d else True, "raycast": bool(d["m_RaycastTarget"])}
                if d["m_Type"] == 3:
                    image.update(fillMethod=FILL_METHOD[fm], fillAmount=r(d["m_FillAmount"]),
                                 fillClockwise=bool(d["m_FillClockwise"]), fillOrigin=d["m_FillOrigin"])
                if d["m_Type"] == 1:
                    image["fillCenter"] = bool(d["m_FillCenter"])
                if d["m_PixelsPerUnitMultiplier"] != 1:
                    image["ppuMultiplier"] = r(d["m_PixelsPerUnitMultiplier"])
                if d["m_Material"]:
                    m = deref(f, d["m_Material"])
                    if m and m[1] in m[0].objs:
                        image["material"] = m[0].T(m[1]).get("m_Name")
            elif cls == "UnityEngine.UI.RawImage":
                d = mono(o)
                tx = deref(f, d["m_Texture"])
                image = {"sprite": None, "color": col(d["m_Color"]), "type": "simple", "rawTexture":
                         tx[0].T(tx[1]).get("m_Name") if tx and tx[1] in tx[0].objs else None}
            elif cls in ("TMPro.TextMeshProUGUI", "TMPro.TextMeshPro"):
                text = text_of(f, mono(o))
                if cls == "TMPro.TextMeshPro":
                    text["world3d"] = True
            elif cls in ("UnityEngine.UI.VerticalLayoutGroup", "UnityEngine.UI.HorizontalLayoutGroup"):
                d = mono(o)
                pd = d["m_Padding"]
                layout = {"type": "vertical" if "Vertical" in cls else "horizontal", "spacing": r(d["m_Spacing"]),
                          "padding": [pd["m_Left"], pd["m_Bottom"], pd["m_Right"], pd["m_Top"]],
                          "childAlignment": CHILD_ALIGN[d["m_ChildAlignment"]],
                          "controlChildSize": [bool(d["m_ChildControlWidth"]), bool(d["m_ChildControlHeight"])],
                          "forceExpand": [bool(d["m_ChildForceExpandWidth"]), bool(d["m_ChildForceExpandHeight"])],
                          "reverse": bool(d.get("m_ReverseArrangement", 0))}
            elif cls == "UnityEngine.UI.GridLayoutGroup":
                d = mono(o)
                pd = d["m_Padding"]
                layout = {"type": "grid", "spacing": v2(d["m_Spacing"]), "cellSize": v2(d["m_CellSize"]),
                          "padding": [pd["m_Left"], pd["m_Bottom"], pd["m_Right"], pd["m_Top"]],
                          "childAlignment": CHILD_ALIGN[d["m_ChildAlignment"]], "constraint": d["m_Constraint"],
                          "constraintCount": d["m_ConstraintCount"]}
            elif cls == "UnityEngine.UI.LayoutElement":
                d = mono(o)
                extra["layoutElement"] = {k: r(d[k]) for k in ("m_MinWidth", "m_MinHeight", "m_PreferredWidth",
                                                               "m_PreferredHeight", "m_FlexibleWidth", "m_FlexibleHeight")
                                          if d[k] not in (-1, 0)}
            elif cls == "UnityEngine.UI.ContentSizeFitter":
                d = mono(o)
                extra["contentSizeFitter"] = {"h": d["m_HorizontalFit"], "v": d["m_VerticalFit"]}
            elif cls in ("UnityEngine.UI.Outline", "UnityEngine.UI.Shadow"):
                d = mono(o)
                effects.append({"type": "outline" if cls.endswith("Outline") else "shadow", "color": col(d["m_EffectColor"]),
                                "distance": v2(d["m_EffectDistance"])})
            elif cls == "UnityEngine.UI.Mask":
                extra["mask"] = "mask"
            elif cls == "UnityEngine.UI.RectMask2D":
                extra["mask"] = "rect"
            elif cls == "UnityEngine.UI.CanvasScaler":
                d = mono(o)
                extra["scaler"] = scaler_of(d)
            elif cls == "UnityEngine.UI.Button":
                # White button sprites take their colour from the ColorBlock tint (normal / pressed)
                c = mono(o)["m_Colors"]
                extra["button"] = {"normal": col(c["m_NormalColor"]), "pressed": col(c["m_PressedColor"])}
            elif cls == "UnityEngine.UI.Slider" or cls == "UnityEngine.UI.Scrollbar":
                extra["slider"] = True
            elif kind == "Canvas":
                d = o.read_typetree()
                extra["canvas"] = {"renderMode": d["m_RenderMode"], "sortingOrder": d["m_SortingOrder"]}
            elif kind == "SpriteRenderer":
                d = o.read_typetree()
                image = {"sprite": sprite_ref(f, d["m_Sprite"]), "color": col(d["m_Color"]), "type": "simple",
                         "preserveAspect": False, "renderer": "SpriteRenderer", "flip": [bool(d["m_FlipX"]), bool(d["m_FlipY"])],
                         "sortingOrder": d["m_SortingOrder"]}
            elif cls == "UnityEngine.UI.CanvasGroup" or kind == "CanvasGroup":
                d = o.read_typetree() if kind == "CanvasGroup" else mono(o)
                extra["canvasGroup"] = {"alpha": r(d["m_Alpha"])}
            elif kind in ("MonoBehaviour",) and not cls.startswith(("UnityEngine.", "TMPro.", "Coffee.")):
                scripts.append(cls)
        except Exception as e:
            log(f"  component {cls} on {n['name']} failed: {e!r}"[:300])
    n["image"], n["text"], n["layout"] = image, text, layout
    if effects:
        n["effects"] = effects
    if scripts:
        n["scripts"] = scripts
    n.update(extra)
    return n


def scaler_of(d):
    return {"uiScaleMode": ["ConstantPixelSize", "ScaleWithScreenSize", "ConstantPhysicalSize"][d["m_UiScaleMode"]],
            "referenceResolution": v2(d["m_ReferenceResolution"]),
            "screenMatchMode": ["MatchWidthOrHeight", "Expand", "Shrink"][d["m_ScreenMatchMode"]],
            "match": r(d["m_MatchWidthOrHeight"]), "referencePixelsPerUnit": r(d["m_ReferencePixelsPerUnit"]),
            "scaleFactor": r(d["m_ScaleFactor"])}


def export_tree(f, root, skip=None, maxdepth=99, path0=""):
    """Depth-first node list; skip(g, depth) -> True drops a whole subtree."""
    nodes = []

    def walk(g, parent, depth, path):
        i = len(nodes)
        nodes.append(None)
        nodes[i] = node_data(f, g, i, parent, path)
        if depth >= maxdepth:
            return
        for c in f.children.get(g, []):
            if skip and skip(c, depth + 1):
                continue
            walk(c, i, depth + 1, path + "/" + f.gname(c))

    walk(root, -1, 0, path0 or f.gname(root))
    return nodes


def canvas_info(f, g):
    """Canvas of a GameObject: render mode, scale + size of its RectTransform, CanvasScaler if any."""
    out = {}
    for kind, cls, o in f.comps(g):
        if kind == "Canvas":
            d = o.read_typetree()
            out.update(renderMode=["screenOverlay", "screenCamera", "world"][d["m_RenderMode"]], sortingOrder=d["m_SortingOrder"])
        if cls == "UnityEngine.UI.CanvasScaler":
            out["scaler"] = scaler_of(mono(o))
    rt = f.T(f.trans[g])
    if f.objs[f.trans[g]].type.name == "RectTransform":
        sc = rt["m_LocalScale"]
        out["scale"] = [r(sc["x"], 6), r(sc["y"], 6), r(sc["z"], 6)]
        out["size"] = v2(rt["m_SizeDelta"])
        out["pivot"] = v2(rt["m_Pivot"])
    return out


# ---------------------------------------------------------------- main
HUD_TREES = {  # key -> path under the scene (level1)
    "_Dynamic Joystick": "_CANVAS_Static/_Dynamic Joystick",
    "_JoystickTutorial": "_CANVAS_Static/_JoystickTutorial",
    "_ButtonHolder_Settings": "_CANVAS_Static/----FunflareUIHolder----(Canvas Static)/_ButtonHolder_Settings",
    "CounterHolder": "_CANVAS_Static/BetweenBelowAndAbove/CounterHolder",
    "CounterHolder (1)": "_CANVAS_Static/BetweenBelowAndAbove/CounterHolder (1)",
    "ButtonsHolder": "_CANVAS_Static/ButtonsHolder",
    "TaskBannerUI": "_CANVAS_Static/BelowCashHUD/TaskBannerUI",
    "_XPHolder": "_CANVAS_Static/BelowCashHUD/_XPHolder",
}
# (key, file, path or GameObject id, extra info)
UZ = "[WorkerUpgradeActionZones]/"
BY_NAME = {"cashierIcon", "workerCashierIcon", "workerShelfIcon", "workerFarmerIcon", "workerChefIcon", "vanMartIcon"}
WORLD_TREES = [
    ("MatActivateCanvas", "sharedassets1.assets", 6233, "prefab WorldCanvasMatActivate: MatActivateUI picks one child variant"),
    ("CustomerDemandHolder", "sharedassets1.assets", 3910, "prefab _CustomerDemandHolder (horizontal)"),
    ("CustomerDemandHolder_Vertical", "sharedassets1.assets", 3909, "prefab _CustomerDemandHolder_Funflare(Vertical)"),
    ("playerMAXText", "sharedassets1.assets", 4194,
     "prefab spawned at PlayerHumanController.maxSlotTransform / upgradeTextSlotTransform (child of Player_Chef at local (0, 8, 1.35))"),
    ("WorldCanvas_prefab", "sharedassets1.assets", 4736, "prefab WorldCanvas (canvas only, no children)"),
    ("WorldCanvas_level1", "level1", "WORLD CANVAS", "scene canvas holding MaxHolder / MatUI / RV_Holder slots"),
    ("UpgradeZone_Player.Canvas", "level1", UZ + "UpgradeZone_Player/Canvas", "price / level plate"),
    ("UpgradeZone_Player.StarPathLocked", "level1", UZ + "UpgradeZone_Player/StarPath_Feature_Locked/Canvas", "locked plate"),
    ("UpgradeZone_Player.GemPurchase", "level1", UZ + "UpgradeZone_Player/GemPurchaseCanvas", "inactive gem unlock popup"),
    ("UpgradeZone_Worker_ChefA.Canvas", "level1", UZ + "UpgradeZone_Worker_ChefA/Canvas", "worker zone price / level plate"),
    ("UpgradeZone_Worker_ChefA.StarPathLocked", "level1", UZ + "UpgradeZone_Worker_ChefA/StarPath_Feature_Locked/Canvas", "locked plate"),
]


def skip_off_buttons(f):
    def skip(g, depth):
        # ButtonsHolder > VerticalHolder > buttons: inactive event buttons are dropped, active ones keep their subtree
        return depth == 2 and not f.T(g)["m_IsActive"]
    return skip


def main():
    os.makedirs(SPR, exist_ok=True)
    for old in os.listdir(SPR):
        os.remove(os.path.join(SPR, old))
    mm.load()
    lv = F("level1")
    root = lv.find("_CANVAS_Static")
    cinfo = canvas_info(lv, root)
    hud = {"canvas": cinfo, "scaler": cinfo.get("scaler"), "trees": {}}
    log("HUD canvas", json.dumps(cinfo))
    for key, path in HUD_TREES.items():
        g = lv.find(path)
        if g is None:
            log("MISSING", path)
            continue
        skip = skip_off_buttons(lv) if key == "ButtonsHolder" else None
        if key == "ButtonsHolder":
            # depth is counted from the tree root: ButtonsHolder(0) > VerticalHolder(1) > buttons(2)
            hud["trees"][key] = export_tree(lv, g, skip=skip)
        else:
            hud["trees"][key] = export_tree(lv, g)
        log(f"hud {key}: {len(hud['trees'][key])} nodes")
    world = {}
    for key, fname, ref, note in WORLD_TREES:
        f = F(fname)
        g = f.find(ref) if isinstance(ref, str) else ref
        if g is None:
            log("MISSING", key)
            continue
        nodes = export_tree(f, g)
        ci = canvas_info(f, g)
        cn = None
        if not ci:  # a canvas below: report the first canvas of the subtree
            for gg in [g] + list(f.children[g]):
                ci = canvas_info(f, gg)
                if ci.get("renderMode"):
                    break
        p = f.parent.get(g)
        t = f.T(f.trans[g])
        pos = t["m_LocalPosition"]
        world[key] = {"canvas": ci, "note": note, "source": f"{fname}:{g}",
                      "parent": f.gname(p) if p else None,
                      "localPosition": [r(pos["x"]), r(pos["y"]), r(pos["z"])], "nodes": nodes}
        log(f"world {key}: {len(nodes)} nodes, canvas {json.dumps(ci)}")
    # Sprites the game assigns from code (CustomerDemand shows cashierIcon once the basket is full), not from a tree.
    f0 = F("sharedassets0.assets")
    for pid, o in f0.objs.items():
        if o.type.name == "Sprite" and f0.T(pid)["m_Name"] in BY_NAME:
            sprite_ref(f0, {"m_FileID": 0, "m_PathID": pid})
    kb = sum(i.get("kb", 0) for i in SPRITES.values())
    notes = ["Rect values are raw Unity (y up). 'world' trees: sizeDelta/anchoredPosition are in canvas units; the canvas rect scale is in nodes[0].rect.scale.",
             "MatActivateUI variants: the HUD component chooses one child (MatActivateUI, _NEW, StoreTile, CityUnlockable, WithItemIcon).",
             "Inactive event buttons under ButtonsHolder/VerticalHolder were dropped; active buttons keep their subtree."]
    out = {"hud": hud, "world": world, "sprites": SPRITES, "fonts": FONTS, "notes": notes,
           "skippedSprites": [{"name": n, "w": w, "h": h} for n, w, h in SKIPPED]}
    with open(os.path.join(OUT, "layout.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    log(f"sprites written: {sum(1 for i in SPRITES.values() if 'kb' in i)} of {len(SPRITES)}, {kb:.1f} KB")
    log("fonts:", json.dumps(FONTS))
    contact_sheet()
    with open(os.path.join(OUT, "export.log"), "w", encoding="utf-8") as fh:
        fh.write(chr(10).join(LOG) + chr(10))


def contact_sheet():
    from PIL import ImageDraw
    names = sorted(n for n, i in SPRITES.items() if "kb" in i)
    cell, cols = 128, 12
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 14)), (60, 60, 70, 255))
    dr = ImageDraw.Draw(sheet)
    for k, n in enumerate(names):
        im = Image.open(os.path.join(SPR, n + ".webp")).convert("RGBA")
        im.thumbnail((cell - 8, cell - 8))
        x, y = (k % cols) * cell, (k // cols) * (cell + 14)
        sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        dr.text((x + 2, y + cell), n[:20], fill=(255, 255, 255, 255))
    sheet.convert("RGB").save(os.path.join(OUT, "_sheet.png"))


if __name__ == "__main__":
    main()
