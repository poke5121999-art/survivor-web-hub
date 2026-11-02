"""Export the Cats&Soup NGUI interface: atlases and the level2 HUD layout.

usage: py -3.12 -I export_ui.py                 atlases -> art/ui/<tex>.webp + art/ui/atlases.json
       py -3.12 -I export_ui.py --layout level2 "UI Root/mainUI" "UI Root/set_speech" -> art/ui/hud.json

atlases.json = {atlasName: {tex: stem, w, h, sprites: {name: [x, y, w, h, bl, br, bt, bb, pl, pr, pt, pb]}}}
  x, y are from the TOP-left of the texture (as in the webp). The 12-number row ends with the four paddings.
hud.json     = {roots: [node...], uiroot: {...}, atlas ids resolved to names}
  node = {n name, a:0 when inactive, t [x, y] local position, s [sx, sy] when not 1,
          w: {k sprite|label|texture|box, atlas, sprite, width, height, depth, color #rrggbbaa, pivot, ...},
          anchor: {side, rel [x, y], px [x, y]}, btn: 1, safe: 1, c: [children]}
NGUI pivot enum: 0 TL 1 T 2 TR 3 L 4 C 5 R 6 BL 7 B 8 BR. UIAnchor.side: 0 BL 1 L 2 TL 3 T 4 TR 5 R 6 BR 7 B 8 C.
UISprite.mType: 0 simple 1 sliced 2 tiled 3 filled 4 advanced.
Nothing is read with the whole data folder loaded: atlases go through deps() per file, the scene through cns.env('level2').
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
from export_prefabs import deps, save_image, Tree  # noqa: E402

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(GAME, "art", "ui")
sys.stdout.reconfigure(encoding="utf-8")


def find(env, fname, pid):
    for o in env.objects:
        if o.path_id == pid and o.assets_file.name == fname:
            return o
    return None


def follow(env, obj, ptr):
    """Object a PPtr read from `obj` points to (resolves the external file by index)."""
    if not ptr or ptr["m_PathID"] == 0:
        return None
    fid = ptr["m_FileID"]
    fname = obj.assets_file.name if fid == 0 else cns.ext_names(obj.assets_file)[fid - 1]
    return find(env, fname, ptr["m_PathID"])


def atlas_name(f, pid):
    o = find(cns.env(f), f, pid)
    return cns.read(o)["m_Name"]


def export_atlases():
    os.makedirs(OUT, exist_ok=True)
    res = {}
    for f, pid in cns.index()["NGUIAtlas"]:
        files = deps([f])
        en = cns.env(*files)
        o = find(en, f, pid)
        d = cns.read(o)
        name = d["m_Name"]
        mat = follow(en, o, d["material"])
        if not mat:
            print("atlas without material", name, f)
            continue
        md = mat.read_typetree()
        tex = None
        envs = md["m_SavedProperties"]["m_TexEnvs"]
        for k, v in envs:
            if k == "_MainTex":
                tex = follow(en, mat, v["m_Texture"])
        if tex is None:
            for k, v in envs:
                tex = tex or follow(en, mat, v["m_Texture"])
        if tex is None:
            print("atlas without texture", name)
            continue
        im = tex.read().image
        stem, im = save_image(im, name, OUT)
        sp = {}
        for s in d["mSprites"]:
            sp[s["name"]] = [s["x"], s["y"], s["width"], s["height"], s["borderLeft"], s["borderRight"], s["borderTop"],
                             s["borderBottom"], s["paddingLeft"], s["paddingRight"], s["paddingTop"], s["paddingBottom"]]
        if name in res:
            print("duplicate atlas name", name, f)
            name = name + "@" + f[:6]
        res[name] = {"tex": stem, "w": im.size[0], "h": im.size[1], "sprites": sp}
        print(name, im.size, len(sp), flush=True)
        del en
    json.dump(res, open(os.path.join(OUT, "atlases.json"), "w", encoding="utf-8"), separators=(",", ":"))
    tot = sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT) if x.endswith(".webp") and ".lq." not in x)
    print(len(res), "atlases,", round(tot / 1e6, 2), "MB webp")


def hexcol(c):
    v = [max(0, min(255, round(c[k] * 255))) for k in "rgba"]
    return "#%02x%02x%02x" % tuple(v[:3]) + ("" if v[3] == 255 else "%02x" % v[3])


def r(x):
    x = round(x, 3)
    return int(x) if x == int(x) else x


class Layout:
    def __init__(self, scene):
        self.scene = scene
        self.en = cns.env(scene)
        self.tr = Tree(self.en, scene)
        self.names = {}
        self.warn = {}
        self.count = 0

    def aname(self, ptr):
        if not ptr or ptr["m_PathID"] == 0:
            return None
        fid = ptr["m_FileID"]
        f = self.tr.ext[fid - 1] if fid else self.scene
        if (f, ptr["m_PathID"]) not in self.names:
            self.names[(f, ptr["m_PathID"])] = atlas_name(f, ptr["m_PathID"])
        return self.names[(f, ptr["m_PathID"])]

    def comps(self, g):
        out = {}
        for c in self.tr.T(g)["m_Component"]:
            o = self.tr.objs.get(c["component"]["m_PathID"])
            if o is not None and o.type.name == "MonoBehaviour":
                try:
                    cls = cns.script(o)[1].split(".")[-1]
                except Exception as ex:  # noqa: BLE001
                    self.warn["script:" + str(ex)[:60]] = 1
                    continue
                out.setdefault(cls, o)
        return out

    def widget(self, cs):
        if "UISprite" in cs:
            d = cns.read(cs["UISprite"])
            w = {"k": "sprite", "atlas": self.aname(d["mAtlas"]), "sprite": d["mSpriteName"]}
            if d["mType"]:
                w["ty"] = d["mType"]
            if d["mType"] == 3:
                w["fill"] = [d["mFillDirection"], r(d["mFillAmount"])]
            if d["mFlip"]:
                w["flip"] = d["mFlip"]
            if d["mType"] == 1 and not d["mFillCenter"]:
                w["nocenter"] = 1
        elif "UILabel" in cs:
            d = cns.read(cs["UILabel"])
            w = {"k": "label", "text": d["mText"], "fs": d["mFontSize"]}
            for key, val, dflt in (("fstyle", d["mFontStyle"], 0), ("al", d["mAlignment"], 0), ("fx", d["mEffectStyle"], 0),
                                   ("ov", d["mOverflow"], 0), ("lines", d["mMaxLineCount"], 0), ("shrink", d["mShrinkToFit"], 0),
                                   ("sx", d["mSpacingX"], 0), ("sy", d["mSpacingY"], 0)):
                if val != dflt:
                    w[key] = val
            if d["mEffectStyle"]:
                w["fxc"] = hexcol(d["mEffectColor"])
                w["fxd"] = [r(d["mEffectDistance"]["x"]), r(d["mEffectDistance"]["y"])]
            if d["mApplyGradient"]:
                w["grad"] = [hexcol(d["mGradientTop"]), hexcol(d["mGradientBottom"])]
            fo = d["mFont"]
            if fo and fo["m_PathID"]:
                w["font"] = (self.tr.ext[fo["m_FileID"] - 1] if fo["m_FileID"] else "")[:8] + ":" + str(fo["m_PathID"])
            if "UILocalize" in cs:
                w["loc"] = cns.read(cs["UILocalize"]).get("key", "")
        elif "UITexture" in cs:
            d = cns.read(cs["UITexture"])
            w = {"k": "texture"}
            t = d.get("mTexture")
            if t and t["m_PathID"]:
                w["tex"] = (self.tr.ext[t["m_FileID"] - 1] if t["m_FileID"] else "")[:8] + ":" + str(t["m_PathID"])
            if d.get("mFixedAspect"):
                w["fixedaspect"] = 1
        elif "UIWidget" in cs:
            d = cns.read(cs["UIWidget"])
            w = {"k": "box"}
        else:
            return None
        w["width"], w["height"], w["depth"] = d["mWidth"], d["mHeight"], d["mDepth"]
        w["color"] = hexcol(d["mColor"])
        w["pivot"] = d["mPivot"]
        la = [d[k]["target"] for k in ("leftAnchor", "rightAnchor", "bottomAnchor", "topAnchor")]
        if any(x for x in la):
            w["wanchor"] = 1  # widget stretched by NGUI anchors: width/height are only the editor value
        return {k: v for k, v in w.items() if v not in (None, "")}

    def node(self, g):
        self.count += 1
        tr = self.tr
        go = tr.T(g)
        t = tr.T(tr.trans[g])
        n = {"n": go["m_Name"]}
        if not go["m_IsActive"]:
            n["a"] = 0
        p, s = t["m_LocalPosition"], t["m_LocalScale"]
        n["t"] = [r(p["x"]), r(p["y"])] + ([r(p["z"])] if abs(p["z"]) > 1e-4 else [])
        if abs(s["x"] - 1) > 1e-4 or abs(s["y"] - 1) > 1e-4:
            n["s"] = [r(s["x"]), r(s["y"])]
        q = t["m_LocalRotation"]
        if abs(q["z"]) > 1e-4 or abs(q["w"] - 1) > 1e-4:
            import math
            n["rot"] = r(math.degrees(2 * math.atan2(q["z"], q["w"])))
        cs = self.comps(g)
        w = self.widget(cs)
        if w:
            n["w"] = w
        if "UIAnchor" in cs:
            d = cns.read(cs["UIAnchor"])
            n["anchor"] = {"side": d["side"], "rel": [r(d["relativeOffset"]["x"]), r(d["relativeOffset"]["y"])],
                           "px": [r(d["pixelOffset"]["x"]), r(d["pixelOffset"]["y"])]}
        if "SafeArea" in cs:
            n["safe"] = 1
        if "UIButton" in cs:
            n["btn"] = 1
        if "UIPanel" in cs:
            d = cns.read(cs["UIPanel"])
            pn = {"depth": d["mDepth"]}
            if d.get("mClipping"):
                pn["clip"] = d["mClipping"]
                c = d.get("mClipRange")
                if c:
                    pn["range"] = [r(c["x"]), r(c["y"]), r(c["z"]), r(c["w"])]
            n["panel"] = pn
        if "UISpriteAnimation" in cs:
            d = cns.read(cs["UISpriteAnimation"])
            n["anim"] = {"fps": d.get("mFPS"), "prefix": d.get("mPrefix")}
        if "UIProgressBar" in cs or "UISlider" in cs:
            d = cns.read(cs.get("UISlider") or cs["UIProgressBar"])
            n["bar"] = {"v": r(d.get("mValue", 0)), "dir": d.get("mFill")}
        c = [self.node(x) for x in tr.children.get(g, [])]
        if c:
            n["c"] = c
        return n

    def by_path(self, path):
        parts = path.split("/")
        tr = self.tr
        cur = [g for g in tr.gos if tr.parent.get(g) is None and tr.T(g)["m_Name"] == parts[0]]
        for part in parts[1:]:
            cur = [c for g in cur for c in tr.children.get(g, []) if tr.T(c)["m_Name"] == part]
        return cur


def export_layout(scene, paths):
    L = Layout(scene)
    root = L.by_path("UI Root")[0]
    cs = L.comps(root)
    ur = cns.read(cs["UIRoot"])
    uiroot = {k: ur[k] for k in ("scalingStyle", "manualWidth", "manualHeight", "minimumHeight", "maximumHeight", "fitWidth", "fitHeight")}
    t = L.tr.T(L.tr.trans[root])
    uiroot["scale"] = [r(t["m_LocalScale"]["x"]), r(t["m_LocalScale"]["y"])]
    roots = []
    for p in paths:
        gs = L.by_path(p)
        if not gs:
            print("path not found", p)
        for g in gs:
            roots.append(L.node(g))
    out = {"uiroot": uiroot, "roots": roots}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, "hud.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print("nodes", L.count, "uiroot", uiroot, "warnings", list(L.warn))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--layout":
        export_layout(sys.argv[2], sys.argv[3:] or ["UI Root/mainUI", "UI Root/set_speech"])
    else:
        export_atlases()
