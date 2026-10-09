# -*- coding: utf-8 -*-
"""Chép một bộ nhỏ texture VFX gốc của The Bazaar sang web: games/bazaar/art/vfx/*.webp + js/view/vfx-data.js.

Chạy (Python 3.8, Pillow + numpy):
  python -I vfx.py
Chạy lại ra đúng các tệp như cũ (xoá art/vfx rồi dựng lại). Cuối cùng gọi vfxmap.py (texture phụ cho từng thẻ/hành động, hạn mức
art/vfx tổng 15 MB, data/vfxmap.js); thêm `--no-map` để bỏ bước đó.

Nguồn: D:\\bazaar-ref\\vfx (1292 PNG + manifest.json, bóc bởi ripped\\tools\\vfxexport.py, xem VISUAL.md §18).
Texture gốc phần lớn là mặt nạ xám vẽ trên nền đen (blend premultiplied/additive), shader tô màu theo hạt.
Canvas 2D không có shader nên ta đổi mỗi texture "mask" thành ảnh TRẮNG với alpha = độ sáng × alpha gốc;
trình duyệt tô màu bằng `source-in` rồi vẽ `lighter` (cộng) hoặc `source-over`.
Texture "packed" (mỗi kênh R/G/B là một mặt nạ riêng) lấy đúng một kênh.
Font số Bazaar Numbers chỉ có atlas SDF (khoảng cách trong kênh alpha, padding 30 ở cỡ 60):
phóng ×2 bằng nội suy song tuyến rồi lấy ngưỡng 0,5 (mặt chữ) và 0,5 − 7/62 (viền ~7 px) → hai tấm mặt nạ sắc nét.
"""
import os, sys, json, shutil
import numpy as np
from PIL import Image
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
SRC = r"D:\bazaar-ref\vfx"
OUTD = os.path.join(REPO, "games", "bazaar", "art", "vfx")
OUTJS = os.path.join(REPO, "games", "bazaar", "js", "view", "vfx-data.js")
BUDGET = 8 * 1024 * 1024

# tên web: (tệp nguồn trong vfx\, kiểu, cạnh dài tối đa, cols, rows, kênh)
#  kiểu "mask" = trắng + alpha; "color" = giữ màu gốc (mảnh băng).
TEX = {
    "glow":     ("glow/FX_Glow_01.png", "mask", 128, 1, 1, None),          # quầng sáng nền số, đạn
    "flash":    ("misc/FX_Flash_11.png", "mask", 128, 1, 1, None),         # CoreBlast của khối số sát thương
    "dot":      ("spark/FX_Particle_03.png", "mask", 64, 1, 1, None),      # Sparks_2 (hạt kéo dài)
    "spark":    ("flipbook/FX_Spark_02.png", "mask", 192, 3, 3, None),     # tia lửa của Haste
    "star":     ("spark/FX_Sparkles_01.png", "mask", 64, 1, 1, None),      # CardBumps, lấp lánh
    "dots":     ("flipbook/FX_Dots_01.png", "mask", 128, 2, 2, None),      # đốm hồi máu
    "tri":      ("misc/FX_Triangles_1_4.png", "mask", 256, 1, 1, None),    # khiên: lưới tam giác
    "shield":   ("misc/FX_Shield_08.png", "mask", 128, 1, 1, None),        # khiên: hình khiên
    "bubble":   ("bubble/FX_Bubble_01.png", "mask", 64, 1, 1, None),       # độc: bong bóng
    "crack":    ("ice/FX_Crack_06.png", "mask", 256, 1, 1, None),          # băng vỡ (Freeze Remove)
    "slash":    ("flipbook/Slash_Flashes_Packed.png", "mask", 512, 2, 1, 0),  # SpikeFlash (kênh R)
    "spikes":   ("flipbook/FX_Damage_Spikes_02a.png", "mask", 256, 2, 2, None),  # Center_Spikes
    "heroWave": ("frame/FX_HeroFrameWave_04.png", "mask", 256, 1, 1, None),  # BlikFrame quanh chân dung
    "frameGlow": ("glow/FX_CLOutsideGlow_01.png", "mask", 128, 1, 1, None),  # FrameGlow cooldown reset
    "glowdots": ("flipbook/Glowdots_Speckles.png", "mask", 192, 3, 3, None),  # vụn lửa của Burn
    "smoke":    ("smoke/FX_Smoke_05.png", "mask", 128, 1, 1, None),
    "puff":     ("flipbook/FX_SmokePuff_2x2_T.png", "mask", 256, 2, 2, None),
    "ring":     ("ring/FX_Circle_02.png", "mask", 128, 1, 1, None),
    "shock":    ("ring/FX_Shockwave_01.png", "mask", 256, 1, 1, None),
    "dust":     ("misc/FX_Dust_01.png", "mask", 256, 1, 1, None),          # bão cát
    "heart":    ("misc/FX_Heart_03.png", "mask", 128, 1, 1, None),
    "arrow":    ("misc/FX_Arrow_02.png", "mask", 128, 1, 1, None),         # đầu đạn (Trail_Add dùng FX_Arrow_02)
    "streak":   ("misc/FX_Projectile_14.png", "mask", 128, 1, 1, None),
    "ice":      ("flipbook/T_PremiumFX_Ice_01.png", "color", 192, 3, 4, None),  # Ice_01/02 mảnh băng
}

FONT_JSON = os.path.join(SRC, "fonts", "BazaarNumbers_Regular_SDF.json")
FONT_PNG = os.path.join(SRC, "fonts", "BazaarNumbers_Regular_SDF_Atlas_1877.png")
FONT_UP = 2           # phóng SDF ×2 rồi lấy ngưỡng
OUTLINE_PX = 7        # viền ở cỡ gốc 60 pt [ĐỀ XUẤT: SCT_Damage_M có outline dày, đo bằng mắt ảnh wiki]
FACE_DILATE = 1.2     # nở mặt chữ (TMP face dilate ~0,06 của vật liệu SCT) [ĐỀ XUẤT]
GLYPH_MARGIN = 10     # lề quanh glyph trong tấm mới (px gốc) để chứa viền


def to_mask(im, ch):
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    if ch is not None:
        m = a[..., ch]
    else:
        lum = a[..., :3].max(axis=2)
        m = lum * a[..., 3]
    out = np.zeros(a.shape[:2] + (4,), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.clip(m * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def fit(im, mx):
    w, h = im.size
    s = min(1.0, mx / float(max(w, h)))
    if s < 1.0:
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im


def save(im, name):
    p = os.path.join(OUTD, name + ".webp")
    im.save(p, "WEBP", quality=86, method=6)
    return os.path.getsize(p)


def smooth(x, e0, e1):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def font():
    j = json.load(open(FONT_JSON, encoding="utf-8"))
    atlas = Image.open(FONT_PNG).convert("RGBA").split()[3]
    AH = j["atlasHeight"]
    U = FONT_UP
    big = np.asarray(atlas.resize((atlas.width * U, atlas.height * U), Image.BILINEAR)).astype(np.float32) / 255.0
    grad = 2.0 * (j["padding"] + 1)       # TMP: alpha 0,5 ở mép, đổi 1/(2·(padding+1)) mỗi px
    ew = 0.6 / grad                         # mép mềm ~0,6 px gốc
    tf = 0.5 - FACE_DILATE / grad
    face = smooth(big, tf - ew, tf + ew)
    to = 0.5 - OUTLINE_PX / grad
    outl = smooth(big, to - ew, to + ew)
    glyphs = [g for g in j["glyphs"] if g["w"] > 0 or g["char"] == " "]
    M = GLYPH_MARGIN
    cells = []
    x = 0
    rowh = 0
    for g in glyphs:
        w = (g["w"] + 2 * M) * U if g["w"] else 0
        h = (g["h"] + 2 * M) * U if g["h"] else 0
        cells.append((g, x, w, h))
        x += w + 2
        rowh = max(rowh, h)
    W = x
    sheet = np.zeros((rowh * 2 + 2, W, 4), dtype=np.uint8)
    sheet[..., :3] = 255
    meta = {}
    for g, cx, w, h in cells:
        m = g["metrics"]
        info = {"adv": round(m["m_HorizontalAdvance"], 2)}
        if w:
            # GlyphRect của TMP tính y từ ĐÁY atlas
            x0 = (g["x"] - M) * U
            y0 = (AH - (g["y"] + g["h"]) - M) * U
            sub_f = face[max(0, y0):y0 + h, max(0, x0):x0 + w]
            sub_o = outl[max(0, y0):y0 + h, max(0, x0):x0 + w]
            hh, ww = sub_f.shape
            sheet[0:hh, cx:cx + ww, 3] = (sub_f * 255).astype(np.uint8)
            sheet[rowh + 2:rowh + 2 + hh, cx:cx + ww, 3] = (sub_o * 255).astype(np.uint8)
            info.update({"x": cx, "w": ww, "h": hh, "bx": round(m["m_HorizontalBearingX"] - M, 2),
                         "by": round(m["m_HorizontalBearingY"] + M, 2)})
        meta[g["char"]] = info
    im = Image.fromarray(sheet, "RGBA")
    size = save(im, "numbers")
    return {"src": "art/vfx/numbers.webp", "scale": U, "rowH": rowh, "outlineY": rowh + 2, "size": 60,
            "ascent": j["face"]["m_AscentLine"], "glyphs": meta}, size


def main():
    if os.path.isdir(OUTD):
        shutil.rmtree(OUTD)
    os.makedirs(OUTD)
    total = 0
    out = {"tex": {}, "font": None, "rev": "vfx-1"}
    for name, (rel, kind, mx, cols, rows, ch) in sorted(TEX.items()):
        im = Image.open(os.path.join(SRC, rel))
        im = to_mask(im, ch) if kind == "mask" else im.convert("RGBA")
        im = fit(im, mx)
        total += save(im, name)
        out["tex"][name] = {"src": "art/vfx/%s.webp" % name, "w": im.width, "h": im.height, "cols": cols, "rows": rows,
                            "kind": kind, "from": rel.replace("\\", "/")}
    out["font"], fs = font()
    total += fs
    hdr = ("// Sinh bởi tools/vfx.py, đừng sửa tay. Texture VFX gốc (D:\\bazaar-ref\\vfx) đã đổi sang mặt nạ trắng + alpha;\n"
           "// font số Bazaar Numbers dựng lại từ atlas SDF (mặt chữ hàng trên, viền hàng dưới). Toạ độ px trong numbers.webp.\n")
    with open(OUTJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(hdr + "window.BZ_VFX = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("art/vfx: %d tệp, %.1f KB (hạn %d KB)" % (len(out["tex"]) + 1, total / 1024.0, BUDGET // 1024))
    if total > BUDGET:
        raise SystemExit("art/vfx vượt hạn mức")
    if "--no-map" not in sys.argv:
        # bộ texture theo từng thẻ/hành động + data/vfxmap.js (chạy ngay sau vì cây art/vfx vừa bị xoá và dựng lại)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import vfxmap
        vfxmap.main()


if __name__ == "__main__":
    main()
