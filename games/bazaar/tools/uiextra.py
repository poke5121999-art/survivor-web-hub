# -*- coding: utf-8 -*-
"""Bổ sung (vòng 7, W-20): sprite UI + texture VFX gốc mà art.py/vfx.py chưa đưa lên web.

Chạy: python -I uiextra.py        (Python 3.8, UnityPy + Pillow + numpy)
Rerun được, ra cùng kết quả, KHÔNG xoá gì: chỉ ghi đè đúng các tệp của nó và vá `data/art.js` (thêm khoá, không bỏ khoá khác).
`[BẪY]` art.py --web xoá cả art/ui, vfx.py xoá cả art/vfx và art.py --web ghi lại art.js: hai tool đó gọi `run()` ở cuối
để các tệp dưới đây không biến mất; chạy riêng `python -I uiextra.py` cũng được.

Khoá trong BZ_ART.map:
  ui:Encounter_Banner_{Merchant,Monster,Quest,Skill}_P   art/ui/<tên>.webp   (prefab *_P chỉ là một SpriteRenderer
        trỏ sprite Encounter_Banner_{Merchant,Enemy,Event,Skills}_TUI; ta chép đúng sprite đó, giữ alpha)
  ui:CardTimer_{Haste,Slow,Freeze}_BG                                art/ui/<tên>.webp
  fx:<tên>   art/vfx/<tên>.webp   texture VFX: "mask" = trắng + alpha (như vfx.py), "color" giữ màu
"""
import os, sys, re, json
import numpy as np
from PIL import Image
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, ".."))              # games/bazaar
ART = os.path.join(REPO, "art")
ARTJS = os.path.join(REPO, "data", "art.js")
REF = r"D:\bazaar-ref"
AAW = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data\StreamingAssets\aa\StandaloneWindows64"
RAW = REF + r"\fix7_raw"                                       # PNG trung gian (ngoài repo)

# ---- UI: (khoá web, tệp nguồn PNG trong D:\bazaar-ref, cạnh dài tối đa)
BANNERS = [("Encounter_Banner_Merchant_P", r"art\frames\encounterframes\Encounter_Banner_Merchant_TUI.png"),
           ("Encounter_Banner_Monster_P", r"art\frames\encounterframes\Encounter_Banner_Enemy_TUI.png"),
           ("Encounter_Banner_Quest_P", r"art\frames\encounterframes\Encounter_Banner_Event_TUI.png"),
           ("Encounter_Banner_Skill_P", r"art\frames\encounterframes\Encounter_Banner_Skills_TUI.png")]
# ---- texture lấy thẳng từ bundle: (bundle, tên Texture2D)
BUNDLE_TEX = [("textures_fx_assets_all.bundle", n) for n in (
    "CardTimer_Haste_BG_TUI", "CardTimer_Slow_BG_TUI", "CardTimer_Freeze_BG_TUI",
    "FX_SandRibbon_01", "FX_SandRibbon_02", "FX_SandRibbonHighlight_01", "FX_SandSwipeMask_01",
    "FX_LevelUp_Vignette_T", "FX_LevelUpBorderGlow_01", "LevelUp_HealthBarRays_Idle")] + \
    [("encounter_assets_all.bundle", "FX_T_SandSwipe"), ("encounter_assets_all.bundle", "FX_T_SandSwipeEdge")]
# ---- VFX: (tên web, PNG trong D:\bazaar-ref\vfx hoặc fix7_raw, kiểu, cạnh dài)
FX = [("FX_BannerMask_02_T", r"vfx\mask\FX_BannerMask_02_T.png", "mask", 512),
      ("FX_Lighting_03_2x2_T", r"vfx\flipbook\FX_Lighting_03_2x2_T.png", "mask", 512),
      ("FX_Gradient_03_T", r"vfx\gradient\FX_Gradient_03_T.png", "mask", 256),
      ("FX_Gradient_04_T", r"vfx\gradient\FX_Gradient_04_T.png", "mask", 256),
      ("FX_Glow_01_T", r"vfx\flipbook\FX_Glow_01_T.png", "mask", 256),
      ("FX_GradientColor_01_T", r"vfx\gradient\FX_GradientColor_01_T.png", "color", 256),
      ("FX_SandRibbon_01", r"fix7_raw\FX_SandRibbon_01.png", "mask", 512),
      ("FX_SandRibbon_02", r"fix7_raw\FX_SandRibbon_02.png", "mask", 512),
      ("FX_SandRibbonHighlight_01", r"fix7_raw\FX_SandRibbonHighlight_01.png", "mask", 512),
      ("FX_SandSwipeMask_01", r"fix7_raw\FX_SandSwipeMask_01.png", "mask", 512),
      ("FX_T_SandSwipe", r"fix7_raw\FX_T_SandSwipe.png", "mask", 512),
      ("FX_T_SandSwipeEdge", r"fix7_raw\FX_T_SandSwipeEdge.png", "mask", 512),
      ("FX_LevelUp_Vignette_T", r"fix7_raw\FX_LevelUp_Vignette_T.png", "mask", 512),
      ("FX_LevelUpBorderGlow_01", r"fix7_raw\FX_LevelUpBorderGlow_01.png", "mask", 512),
      ("LevelUp_HealthBarRays_Idle", r"fix7_raw\LevelUp_HealthBarRays_Idle.png", "mask", 512)]
UI_RAW = ["CardTimer_Haste_BG_TUI", "CardTimer_Slow_BG_TUI", "CardTimer_Freeze_BG_TUI"]


def to_mask(im):
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    m = a[..., :3].max(axis=2) * a[..., 3]
    out = np.zeros(a.shape[:2] + (4,), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.clip(m * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def fit(im, maxdim):
    k = float(maxdim) / max(im.size)
    if k < 1:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    return im


def pull_bundles():
    """Bóc Texture2D cần thiết từ bundle ra PNG ở fix7_raw (bỏ qua tệp đã có)."""
    todo = [(b, n) for b, n in BUNDLE_TEX if not os.path.exists(os.path.join(RAW, n + ".png"))]
    if not todo:
        return
    import UnityPy
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
    os.makedirs(RAW, exist_ok=True)
    for b in sorted({b for b, _ in todo}):
        want = {n for bb, n in todo if bb == b}
        env = UnityPy.load(os.path.join(AAW, b))
        for o in env.objects:
            if o.type.name != "Texture2D":
                continue
            n = o.peek_name()
            if n in want:
                o.read().image.save(os.path.join(RAW, n + ".png"))
                want.discard(n)
        if want:
            print("  thiếu texture", b, sorted(want))


def run(quiet=False):
    pull_bundles()
    os.makedirs(os.path.join(ART, "ui"), exist_ok=True)
    os.makedirs(os.path.join(ART, "vfx"), exist_ok=True)
    amap, sizes = {}, {}

    def save(im, rel, q, key):
        p = os.path.join(ART, rel.replace("/", os.sep))
        im.save(p, "WEBP", quality=q, method=4)
        amap[key] = "art/" + rel
        sizes[rel] = (os.path.getsize(p), im.size)
    for name, src in BANNERS:
        save(Image.open(os.path.join(REF, src)).convert("RGBA"), "ui/%s.webp" % name, 85, "ui:" + name)
    for n in UI_RAW:
        save(Image.open(os.path.join(RAW, n + ".png")).convert("RGBA"), "ui/%s.webp" % n.replace("_TUI", ""), 85,
             "ui:" + n.replace("_TUI", ""))
    for name, src, kind, md in FX:
        im = fit(Image.open(os.path.join(REF, src)), md)
        save(to_mask(im) if kind == "mask" else im.convert("RGBA"), "vfx/%s.webp" % name, 85, "fx:" + name)
    # vá art.js: giữ nguyên mọi khoá khác
    txt = open(ARTJS, encoding="utf-8").read()
    m = re.search(r"window\.BZ_ART=(\{.*\});\s*$", txt, re.S)
    d = json.loads(m.group(1))
    d["map"].update(amap)
    head = txt[:m.start()]
    with open(ARTJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(head + "window.BZ_ART=" + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    if not quiet:
        tot = sum(s for s, _ in sizes.values())
        for k, (s, sz) in sorted(sizes.items()):
            print("  %-48s %6d B  %s" % (k, s, sz))
        print("uiextra:", len(sizes), "tệp,", round(tot / 1048576, 2), "MB")
    return sizes


if __name__ == "__main__":
    run()
