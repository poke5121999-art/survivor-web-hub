"""The original uGUI screens the web HUD redraws: money counter, upgrade office popup, HR popup, offline reward popup.

Usage: python -I tools/export_ui.py
Reads level1 (UIManager fields and the Canvas_* hierarchies), walks each root's RectTransform tree and writes
art/ui/ui.json:
  {"canvas": [720, 1280], "roots": {name: node}}   node = {n, on, rt: {a0, a1, pos, size, pv, sc, rot}, img?, txt?, btn?, kids}
  img = {s: sprite file, c: [r, g, b, a], t: Image.m_Type (0 simple, 1 sliced, 3 filled), border: [l, b, r, t], ppu, keep}
  txt = {t: text, key: Locale id (StringChange), fs, min, max, auto, c, ha, va, font, style}
and every sprite those nodes use as art/ui/<sprite>.png (Sprite.image crops the atlas).
Canvas: CanvasScaler ScaleWithScreenSize 720 x 1280, match mode Expand.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import mm

OUT = os.path.join(GAME, "art", "ui")
SKIP_COMPONENTS = {"ParticleSystem", "ParticleSystemRenderer", "UIParticleSystem"}


def r2(v):
    return round(float(v), 3)


class Walker:
    def __init__(self, f):
        self.f = f
        self.sprites = {}

    def comps(self, go):
        out = {}
        for c in go.m_Component:
            co = c.component.deref()
            name = mm.script(co)[1] if co.type.name == "MonoBehaviour" else co.type.name
            out[name] = co
        return out

    def sprite(self, ptr):
        if not ptr or ptr["m_PathID"] == 0:
            return None
        sf = self.f_by_ptr(ptr)
        o = sf.get(ptr["m_PathID"]) if sf is not None else None
        if o is None:
            return None
        key = (o.assets_file.name, o.path_id)
        if key in self.sprites:
            return self.sprites[key]
        sp = o.read()
        name = re.sub(r"[^A-Za-z0-9_.-]+", "_", sp.m_Name)
        fn = f"{name}.png"
        if fn in {v["s"] for v in self.sprites.values()}:
            fn = f"{name}_{o.path_id}.png"
        sp.image.save(os.path.join(OUT, fn))
        b = sp.m_Border
        self.sprites[key] = {"s": fn, "border": [r2(b.x), r2(b.y), r2(b.z), r2(b.w)], "w": sp.image.width, "h": sp.image.height,
                             "ppu": r2(sp.m_PixelsToUnits)}
        return self.sprites[key]

    def f_by_ptr(self, ptr):
        fid = ptr["m_FileID"]
        name = self.f.assets_file_name if fid == 0 else mm.ext_names(self.f.sf)[fid - 1]
        return mm.by_file(name)

    def material(self, mo):
        """TMP SDF material: outline and underlay (shadow) of the text, in font units."""
        key = (mo.assets_file.name, mo.path_id)
        if not hasattr(self, "_mats"):
            self._mats = {}
        if key not in self._mats:
            d = mo.read_typetree()
            sp = d["m_SavedProperties"]
            fl = {k: v for k, v in sp["m_Floats"]}
            co = {k: [r2(v["r"]), r2(v["g"]), r2(v["b"]), r2(v["a"])] for k, v in sp["m_Colors"]}
            self._mats[key] = {"name": d["m_Name"], "ow": r2(fl.get("_OutlineWidth", 0)), "oc": co.get("_OutlineColor"),
                               "fd": r2(fl.get("_FaceDilate", 0)),
                               "ul": [r2(fl.get("_UnderlayOffsetX", 0)), r2(fl.get("_UnderlayOffsetY", 0)), r2(fl.get("_UnderlaySoftness", 0))],
                               "uc": co.get("_UnderlayColor") if "UNDERLAY_ON" in (d.get("m_ValidKeywords") or d.get("m_ShaderKeywords") or "") or fl.get("_UnderlayOffsetY") else None,
                               "kw": d.get("m_ValidKeywords") or d.get("m_ShaderKeywords")}
        return self._mats[key]

    def node(self, rt_obj):
        t = rt_obj.read_typetree()
        go = rt_obj.read().m_GameObject.read()
        cs = self.comps(go)
        q = t["m_LocalRotation"]
        n = {"n": go.m_Name, "on": bool(go.m_IsActive),
             "rt": {"a0": [r2(t["m_AnchorMin"]["x"]), r2(t["m_AnchorMin"]["y"])], "a1": [r2(t["m_AnchorMax"]["x"]), r2(t["m_AnchorMax"]["y"])],
                    "pos": [r2(t["m_AnchoredPosition"]["x"]), r2(t["m_AnchoredPosition"]["y"])],
                    "size": [r2(t["m_SizeDelta"]["x"]), r2(t["m_SizeDelta"]["y"])], "pv": [r2(t["m_Pivot"]["x"]), r2(t["m_Pivot"]["y"])],
                    "sc": [r2(t["m_LocalScale"]["x"]), r2(t["m_LocalScale"]["y"])],
                    # z rotation in degrees (UI rotates in plane only)
                    "rot": r2(__import__("math").degrees(2 * __import__("math").atan2(q["z"], q["w"])))}}
        img = cs.get("UnityEngine.UI.Image")
        if img is not None:
            d = mm.read(img)
            sp = self.sprite(d["m_Sprite"])
            c = d["m_Color"]
            n["img"] = {"s": sp["s"] if sp else None, "c": [r2(c["r"]), r2(c["g"]), r2(c["b"]), r2(c["a"])], "t": d["m_Type"],
                        "keep": bool(d["m_PreserveAspect"]), "on": bool(d["m_Enabled"])}
            if sp:
                n["img"].update(border=sp["border"], ppu=sp["ppu"], pm=r2(d.get("m_PixelsPerUnitMultiplier", 1.0)), sw=sp["w"], sh=sp["h"])
            if d["m_Type"] == 3:
                n["img"].update(fill=r2(d["m_FillAmount"]), fm=d["m_FillMethod"], fo=d["m_FillOrigin"])
        tmp = cs.get("TMPro.TextMeshProUGUI")
        if tmp is not None:
            d = mm.read(tmp)
            c = d["m_fontColor"]
            fa = d["m_fontAsset"]
            font = None
            if fa and fa["m_PathID"]:
                fo = self.f_by_ptr(fa).get(fa["m_PathID"])
                font = mm.read(fo).get("m_Name") if fo is not None else None
            n["txt"] = {"t": d["m_text"], "fs": r2(d["m_fontSize"]), "min": r2(d["m_fontSizeMin"]), "max": r2(d["m_fontSizeMax"]),
                        "auto": bool(d["m_enableAutoSizing"]), "c": [r2(c["r"]), r2(c["g"]), r2(c["b"]), r2(c["a"])],
                        "ha": d["m_HorizontalAlignment"], "va": d["m_VerticalAlignment"], "font": font, "style": d["m_fontStyle"],
                        "on": bool(d["m_Enabled"])}
            mat = d.get("m_sharedMaterial") or d.get("m_fontSharedMaterial")
            if mat and mat["m_PathID"]:
                mo = self.f_by_ptr(mat).get(mat["m_PathID"])
                if mo is not None:
                    n["txt"]["mat"] = self.material(mo)
            sc = cs.get("StringChange")
            if sc is not None:
                n["txt"]["key"] = mm.read(sc).get("id")
        if "UnityEngine.UI.Button" in cs:
            n["btn"] = 1
        kids = []
        for ch in t["m_Children"]:
            co = self.f.get(ch["m_PathID"])
            if co is None or co.type.name != "RectTransform":
                continue
            kc = self.comps(co.read().m_GameObject.read())
            if SKIP_COMPONENTS & set(kc):
                continue
            kids.append(self.node(co))
        if kids:
            n["kids"] = kids
        return n


def balloons(f, W):
    """World-space order balloons (level1 OrderBalloons/CustomerOrderBalloon, CarOrderBalloon): a sliced SpriteRenderer
    box (drawMode 1, world size m_Size) and a TextMeshPro line "<sprite=N> count" whose icons come from the stage's
    TMP sprite asset (OrderBalloonManager._zoneStageSpriteAssets[zone].stageSpriteAssets[0] = ItemIcon1 on stage 1)."""
    def go(name):
        return next(o.read() for o in f.values() if o.type.name == "GameObject" and o.read().m_Name == name)
    def comps(g):
        return W.comps(g)
    out = {}
    for name in ("CustomerOrderBalloon", "CarOrderBalloon"):
        g = go(name)
        tr = comps(g)["Transform"]
        t = tr.read_typetree()
        child = tr.read().m_Children[0].read()
        cg = child.m_GameObject.read()
        sr = comps(cg)["SpriteRenderer"].read_typetree()
        sp = W.sprite(sr["m_Sprite"] if sr["m_Sprite"]["m_FileID"] == 0 else sr["m_Sprite"])
        txt_rt = child.m_Children[0].read()
        tmp = mm.read(comps(txt_rt.m_GameObject.read())["TMPro.TextMeshPro"])
        c = tmp["m_fontColor"]
        out[name] = {"y": r2(t["m_LocalPosition"]["y"]), "bg": sp["s"] if sp else None, "border": sp["border"] if sp else None,
                     "ppu": sp["ppu"] if sp else 100, "size": [r2(sr["m_Size"]["x"]), r2(sr["m_Size"]["y"])],
                     "alpha": r2(sr["m_Color"]["a"]), "fs": r2(tmp["m_fontSize"]), "c": [r2(c["r"]), r2(c["g"]), r2(c["b"]), r2(c["a"])],
                     "text": tmp["m_text"]}
    # Item icons of the stage-1 sprite asset, by glyph index (the N of <sprite=N>).
    sa = mm.read(mm.by_file("4ec07daa0400d4c419a328ce487c239b")[2])
    sheet_ptr = sa["spriteSheet"]
    sa_obj = mm.by_file("4ec07daa0400d4c419a328ce487c239b")[2]
    ext = mm.ext_names(sa_obj.assets_file)
    tex = mm.by_file(ext[sheet_ptr["m_FileID"] - 1] if sheet_ptr["m_FileID"] else sa_obj.assets_file.name)[sheet_ptr["m_PathID"]].read().image
    icons = []
    for gl in sa["m_SpriteGlyphTable"]:
        r = gl["m_GlyphRect"]
        # Glyph rects count y from the bottom of the atlas.
        img = tex.crop((r["m_X"], tex.height - r["m_Y"] - r["m_Height"], r["m_X"] + r["m_Width"], tex.height - r["m_Y"]))
        fn = f"ItemIcon1_{gl['m_Index']}.png"
        img.save(os.path.join(OUT, fn))
        icons.append({"s": fn, "scale": r2(gl["m_Scale"]), "by": r2(gl["m_Metrics"]["m_HorizontalBearingY"]), "h": r2(gl["m_Metrics"]["m_Height"])})
    out["icons"] = icons
    return out


class F(dict):
    pass


def main():
    os.makedirs(OUT, exist_ok=True)
    mm.load()
    f = F(mm.by_file("level1"))
    f.assets_file_name = "level1"
    f.sf = next(iter(f.values())).assets_file
    um = next(o for o in f.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "UIManager")
    u = mm.read(um)
    go_rt = lambda go_pid: next(c.component.deref() for c in f[go_pid].read().m_Component if c.component.deref().type.name == "RectTransform")
    W = Walker(f)
    roots = {
        "upgrade": u["playerTotalUpgradeSlots"]["upgradeUI"]["m_PathID"],
        "hr": u["workerUpgradeSlots"]["upgradeUI"]["m_PathID"],
        "offline": u["offlineRewardUI"]["m_PathID"],
    }
    out = {"canvas": [720, 1280], "roots": {}}
    for name, pid in roots.items():
        out["roots"][name] = W.node(go_rt(pid))
    # Money counter: Canvas_ItemCount/SafeArea/MoneyCount (CurrencyView).
    money = next(o for o in f.values() if o.type.name == "GameObject" and o.read().m_Name == "MoneyCount"
                 and "CurrencyView" not in W.comps(o.read()) and any(
                     c.component.deref().type.name == "RectTransform" and c.component.deref().read_typetree()["m_Father"]["m_PathID"]
                     for c in o.read().m_Component) and not any(mm.script(c.component.deref())[1] == "CustomeCurrencyEffector"
                                                                for c in o.read().m_Component if c.component.deref().type.name == "MonoBehaviour"))
    out["roots"]["money"] = W.node(go_rt(money.path_id))
    # Tutorial line: UIManager._guideText (GuideText) under Canvas/SafeArea/UICanvasGroup/UpperUI (full-screen parents).
    gt = f[u["_guideText"]["m_PathID"]]
    out["roots"]["guide"] = W.node(go_rt(mm.read(gt)["m_GameObject"]["m_PathID"]))
    out["balloons"] = balloons(f, W)
    with open(os.path.join(OUT, "ui.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("ui roots", list(out["roots"]), "sprites", len(W.sprites))


if __name__ == "__main__":
    main()
