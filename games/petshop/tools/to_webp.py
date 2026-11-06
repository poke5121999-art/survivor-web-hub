"""Re-encode art/ui and art/icons PNGs as WebP (lossless up to 256 px, quality 90 above) and point every reference at them.

Usage: python -I tools/to_webp.py   (run after export_ui.py / export_data.py; idempotent)
References: art/ui/ui.json (img.s, storageIcons, hudIcons), data/game.json (icon / grey / rewardIcons)."""
import json, os, re, sys
from PIL import Image
G = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for d in ("art/ui", "art/icons"):
    for fn in os.listdir(os.path.join(G, d)):
        if not fn.endswith(".png"):
            continue
        p = os.path.join(G, d, fn)
        im = Image.open(p)
        im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
        im.save(p[:-4] + ".webp", "WEBP", quality=90, method=6, lossless=max(im.size) <= 256)
        os.remove(p)
for f in ("art/ui/ui.json", "data/game.json"):
    p = os.path.join(G, f)
    s = open(p, encoding="utf-8").read()
    s = re.sub(r'([A-Za-z0-9_.-]+)\.png"', r'\1.webp"', s)
    open(p, "w", encoding="utf-8").write(s)
print("done")
