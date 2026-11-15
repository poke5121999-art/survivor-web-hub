# Crop the owner's zombie sheet (ref/owner-zombies-sheet.webp, 2 rows x 5) into ref/zcells/z1..z10.png
# (z1-z5 top row left to right, z6-z10 bottom row). Each cell is trimmed to the figure (pixels that differ from
# the blue gradient background of that cell's own corners). Usage: python -I tools/crop-zombies.py
import os
import numpy as np
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
im = Image.open(os.path.join(root, 'ref', 'owner-zombies-sheet.webp')).convert('RGB'); a = np.asarray(im).astype(np.float32)
H, W, _ = a.shape; out = os.path.join(root, 'ref', 'zcells'); os.makedirs(out, exist_ok=True)
for r in range(2):
    for c in range(5):
        x0, x1, y0, y1 = W * c // 5, W * (c + 1) // 5, H * r // 2, H * (r + 1) // 2
        sub = a[y0:y1, x0:x1]; bg = np.stack([sub[:, :6].mean(axis=1), sub[:, -6:].mean(axis=1)]).mean(axis=0)  # per-row background
        d = np.abs(sub - bg[:, None, :]).sum(axis=2) > 50
        ys, xs = np.where(d)
        box = (int(x0 + max(0, xs.min() - 6)), int(y0 + max(0, ys.min() - 6)), int(x0 + min(x1 - x0, xs.max() + 6)), int(y0 + min(y1 - y0, ys.max() + 6)))
        im.crop(box).save(os.path.join(out, 'z%d.png' % (r * 5 + c + 1)))
print('ok')
