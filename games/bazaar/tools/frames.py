# -*- coding: utf-8 -*-
"""Dựng khung thẻ 2D của The Bazaar cho web: art/frames2d/*.webp + data/frames.js.

Chạy (Python 3.8, Pillow + numpy; không cần UnityPy vì khung 2D đã được art.py bóc):
  python -I art.py --only frames     # (đã làm ở bước art) PNG ở D:\\bazaar-ref\\art\\frames\\cardframes
  python -I frames.py                # ra games/bazaar/art/frames2d + games/bazaar/data/frames.js
Phải chạy SAU `art.py --web` (bước đó xoá cả games/bazaar/art).

Nguồn: sprite UI 2D gốc `Card_PreviewFrame_<Tier>_<Small|Medium|Large|Skill>_TUI` và
`EncounterFrame_<Tier>_TUI` (đã phẳng, có ô trong suốt). Mesh 3D `cardframes` KHÔNG dùng:
sprite 2D là chính khung mà UI xem trước của game vẽ.
Cái tự đo: ô art (cửa sổ) = vùng trong suốt nối với tâm ảnh; bán kính góc đo ở hàng trên cùng của ô.
Neo (gem, tag, ammo, multicast) đo từ ảnh wiki `card-badges-crop-1.png`, `cooldown-uzi-1.jpg` [ĐỀ XUẤT].
"""
import os, sys, json, glob
import numpy as np
from PIL import Image, ImageDraw
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
OUTD = os.path.join(REPO, "games", "bazaar", "art", "frames2d")
OUTJS = os.path.join(REPO, "games", "bazaar", "data", "frames.js")
SRC_DIRS = [r"D:\bazaar-ref\art\frames\cardframes", os.path.join(REPO, "games", "bazaar", "art", "frames", "cardframes")]
SRC_ENC = [r"D:\bazaar-ref\art\frames\cardframes", os.path.join(REPO, "games", "bazaar", "art", "frames", "cardframes")]
TIERS = ["Bronze", "Silver", "Gold", "Diamond", "Legendary"]
SIZES = [("S", "Small"), ("M", "Medium"), ("L", "Large")]
H = 512
ENC_WIN = {"Bronze": (55, 38, 608, 505), "Silver": (61, 85, 641, 546), "Gold": (64, 78, 628, 545),
           "Diamond": (66, 90, 668, 580), "Legendary": (66, 90, 638, 565)}
GEMS = {  # tên web -> CardGem_<x>_TD
    "damage": "Damage", "heal": "Heal", "shield": "Shield", "burn": "Burn",
    "poison": "Poison", "regen": "Regeneration", "joy": "Joy", "lifesteal": "LifeSteal",
}


def find(name):
    for d in SRC_DIRS:
        for ext in (".png", ".webp"):
            p = os.path.join(d, name + ext)
            if os.path.exists(p):
                return p
    raise FileNotFoundError(name)


def load(name):
    return Image.open(find(name)).convert("RGBA")


def save(im, rel):
    p = os.path.join(OUTD, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, "WEBP", quality=90, alpha_quality=100, method=6)
    return os.path.getsize(p)


def fill(mask, seeds):
    """Thành phần liên thông 4 hướng của mask (bool) chứa các seed. (PIL floodfill hỏng với mode L trên bản Pillow này.)"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    st = [s for s in seeds if mask[s[1], s[0]]]
    for x, y in st:
        seen[y, x] = True
    while st:
        x, y = st.pop()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                st.append((nx, ny))
    return seen


def window_of(im):
    """Ô trong suốt nối với tâm ảnh -> (x,y,w,h,r) và mask."""
    a = np.array(im)[:, :, 3]
    cx, cy = im.width // 2, im.height // 2
    if a[cy, cx] >= 40:
        raise RuntimeError("tâm khung không trong suốt")
    w = fill(a < 40, [(cx, cy)])
    ys, xs = np.where(w)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    top = np.where(w[y0])[0]
    r = int(top.min() - x0)  # góc vát: hàng trên cùng bắt đầu lệch bao nhiêu px
    return dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0), r=max(r, 0)), w


def to_canvas(im, win, cw=None, scale=None):
    """Đặt khung lên canvas cao H: tâm ô trùng tâm canvas (kẹp để khung không bị cắt)."""
    if scale and scale != 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        win = {k: (round(v * scale) if k != "r" else round(v * scale)) for k, v in win.items()}
    cw = cw or im.width
    wcy = win["y"] + win["h"] / 2
    oy = int(round(H / 2 - wcy))
    oy = max(0, min(H - im.height, oy))
    ox = max(0, (cw - im.width) // 2)
    can = Image.new("RGBA", (cw, H), (0, 0, 0, 0))
    can.alpha_composite(im, (ox, oy))
    win = dict(win, x=win["x"] + ox, y=win["y"] + oy)
    return can, win, (ox, oy)


def opaque_bbox(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 40)
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def cut_bg(im, tol=38):
    """Tách nền đặc (màu góc) của sprite UV: flood fill từ 4 góc/cạnh."""
    rgb = im.convert("RGB")
    arr = np.array(rgb).astype(int)
    bg = arr[0, 0]
    near = (np.abs(arr - bg).sum(axis=2) < tol)
    bgmask = fill(near, [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)])
    out = np.array(im)
    out[:, :, 3] = np.where(bgmask, 0, 255)
    return Image.fromarray(out, "RGBA")


def gem_sprite(name):
    """CardGem_*_TD là ô UV chữ nhật 256x128 vuông góc; cắt hình bát giác (vát góc)."""
    im = load("CardGem_%s_TD" % name)
    w, h = im.size
    cx, cy = int(w * 0.11), int(h * 0.24)  # độ vát đo từ ảnh gem trong game
    S = 4
    m = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(m).polygon([
        (cx * S, 0), ((w - cx) * S, 0), (w * S, cy * S), (w * S, (h - cy) * S),
        ((w - cx) * S, h * S), (cx * S, h * S), (0, (h - cy) * S), (0, cy * S)], fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    im.putalpha(m)
    return im


def main():
    os.makedirs(OUTD, exist_ok=True)
    total = 0
    out = {"item": {}, "skill": {}, "encounter": {}, "gems": {}, "parts": {}, "rev": "frames2d-1"}

    # --- 1) khung vật phẩm S/M/L ---
    for t in TIERS:
        out["item"][t] = {}
        for k, nm in SIZES:
            im = load("Card_PreviewFrame_%s_%s_TUI" % (t, nm))
            win, _ = window_of(im)
            can, win, (ox, oy) = to_canvas(im, win)
            rel = "item_%s_%s.webp" % (t, k)
            total += save(can, rel)
            bx0, by0, bx1, by1 = opaque_bbox(can)
            Hh = H
            gw = int(0.20 * Hh)  # gem rộng ~0.2 chiều cao thẻ [ĐỀ XUẤT, đo từ wiki]
            cxm = win["x"] + win["w"] / 2
            out["item"][t][k] = dict(
                src="art/frames2d/" + rel, w=can.width, h=can.height, window=win, bbox=[bx0, by0, bx1, by1],
                anchors=dict(
                    gemTop=dict(x=round(cxm), y=by0 + 4, w=gw, h=gw // 2),
                    tag=dict(x=win["x"] + int(0.07 * Hh), y=win["y"] + win["h"] - int(0.12 * Hh), w=int(0.12 * Hh), h=int(0.09 * Hh)),
                    ammo=dict(x=round(cxm), y=win["y"] + win["h"] - int(0.045 * Hh), w=int(win["w"] * 0.88), h=int(0.06 * Hh), pip=int(0.045 * Hh)),
                    multicast=dict(x=win["x"] + win["w"] - int(0.07 * Hh), y=win["y"] + int(0.07 * Hh), w=int(0.12 * Hh), h=int(0.12 * Hh)),
                    cooldown=dict(x=win["x"], y=win["y"], w=win["w"], h=win["h"]),
                ))

    # --- 2) khung kỹ năng (huy chương tròn) ---
    for t in TIERS:
        im = load("Card_PreviewFrame_%s_Skill_TUI" % t)
        win, _ = window_of(im)
        can, win, _o = to_canvas(im, win, cw=max(im.width, H))
        rel = "skill_%s.webp" % t
        total += save(can, rel)
        win["r"] = min(win["w"], win["h"]) // 2
        out["skill"][t] = dict(src="art/frames2d/" + rel, w=can.width, h=can.height, window=win,
                               bbox=list(opaque_bbox(can)))

    # --- 3) khung encounter: ruột đặc (nền) nên phải đục ô theo sprite Interior (mặt nạ vòm) ---
    interior = load("EncounterFrame_Interior_TUI")
    imask = interior.split()[3]
    for t in TIERS:
        im = load("EncounterFrame_%s_TUI" % t)
        x0, y0, x1, y1 = ENC_WIN[t]  # [ĐỀ XUẤT] đo bằng mắt + quét độ chênh sáng
        wd, ht = x1 - x0, y1 - y0
        hole = imask.resize((wd, ht), Image.LANCZOS)
        arr = np.array(im)
        full = np.zeros(arr.shape[:2], dtype="uint8")
        full[y0:y1, x0:x1] = np.array(hole)
        arr[:, :, 3] = np.minimum(arr[:, :, 3], 255 - full)
        im = Image.fromarray(arr, "RGBA")
        s = H / im.height
        im2 = im.resize((round(im.width * s), H), Image.LANCZOS)
        win = dict(x=round(x0 * s), y=round(y0 * s), w=round(wd * s), h=round(ht * s), r=round(0.1 * wd * s), shape="arch")
        rel = "enc_%s.webp" % t
        total += save(im2, rel)
        out["encounter"][t] = dict(src="art/frames2d/" + rel, w=im2.width, h=im2.height, window=win,
                                   bbox=list(opaque_bbox(im2)))

    # --- 4) gem / tag / ammo / multicast ---
    for key, nm in GEMS.items():
        g = gem_sprite(nm)
        rel = "gems/gem_%s.webp" % key
        total += save(g, rel)
        out["gems"][key] = dict(src="art/frames2d/" + rel, w=g.width, h=g.height)
    for key, nm in (("tag1", "CardFrame_Tag_01_D"), ("tag2", "CardFrame_Tag_02_D")):
        g = cut_bg(load(nm))
        x0, y0, x1, y1 = opaque_bbox(g)
        g = g.crop((x0, y0, x1, y1))
        rel = "gems/%s.webp" % key
        total += save(g, rel)
        out["parts"][key] = dict(src="art/frames2d/" + rel, w=g.width, h=g.height)
    for key, nm in (("ammoBar", "Ammo_Bar_TUI"), ("ammoBarFull", "Ammo_Bar_Full_TUI"), ("pipEmpty", "Ammo_Pip_Empty_TUI"),
                    ("pipFull", "Ammo_Pip_TUI"), ("pipGlow", "Ammo_Pip_Glow_TUI"), ("multicast", "CardFrame_MultiCast_TUI")):
        g = load(nm)
        if key.startswith("pip"):
            g = g.resize((64, 64), Image.LANCZOS)
        rel = "gems/%s.webp" % key
        total += save(g, rel)
        out["parts"][key] = dict(src="art/frames2d/" + rel, w=g.width, h=g.height)

    hdr = ("// Sinh bởi tools/frames.py, đừng sửa tay. Khung thẻ 2D (sprite UI gốc Card_PreviewFrame_*_TUI),\n"
           "// toạ độ pixel trong ảnh khung (cao 512). window = ô lộ art; anchors [ĐỀ XUẤT] đo từ ảnh wiki.\n")
    with open(OUTJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(hdr + "window.BZ_FRAMES = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    print("ghi %d byte webp, %s" % (total, OUTJS))


if __name__ == "__main__":
    main()
