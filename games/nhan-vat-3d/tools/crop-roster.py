# Crop the owner's character sheet (ref/owner-roster-nanobanana.webp) into one image per character:
# ref/cells/rRcC.png (R = row 1..6, C = column 1..n, left to right), plus ref/cells/index.json with the boxes.
# Method: foreground = pixels clearly brighter / more saturated than the dark background; rows are split at the
# emptiest horizontal bands, columns inside a row at the emptiest vertical gaps (with a minimum figure width so a
# held prop or a dog stays with its owner). Usage: python -I tools/crop-roster.py [src] [outdir]
import sys, os, json
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'ref', 'owner-roster-nanobanana.webp')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'ref', 'cells')
os.makedirs(out, exist_ok=True)

im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
H, W, _ = a.shape
bg = np.median(a.reshape(-1, 3), axis=0)
d = np.abs(a - bg).sum(axis=2)
mx, mn = a.max(axis=2), a.min(axis=2)
fg = (d > 60) | ((mx - mn) > 45)

def smooth(v, k):
    return np.convolve(v, np.ones(k) / k, mode='same')

# rows: 6 bands; cut at the minima of the row profile near the expected spacing
prof = smooth(fg.sum(axis=1).astype(float), 9)
NR = 6
cuts = [0]
for r in range(1, NR):
    c = int(H * r / NR); lo, hi = c - int(H / NR * 0.3), c + int(H / NR * 0.3)
    cuts.append(lo + int(np.argmin(prof[lo:hi])))
cuts.append(H)

index = []
for r in range(NR):
    y0, y1 = cuts[r], cuts[r + 1]
    band = fg[y0:y1]
    col = smooth(band.sum(axis=0).astype(float), 3)
    # candidate gaps: runs where the column is (nearly) empty
    thr = max(1.0, col.max() * 0.012)
    empty = col <= thr
    segs = []; x = 0
    while x < W:
        if not empty[x]:
            s = x
            while x < W and not empty[x]: x += 1
            segs.append([s, x])
        else: x += 1
    # merge slivers (< 18 px wide) into the nearest neighbour, then split very wide segments at their weakest column
    merged = []
    for s in segs:
        if merged and (s[1] - s[0] < 18 or s[0] - merged[-1][1] < 3) and (s[1] - merged[-1][0] < 110):
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    final = []
    for s in merged:
        wdt = s[1] - s[0]
        if wdt > 105:  # two figures touching: split at the emptiest column in the middle part
            n = int(round(wdt / 78.0))
            n = max(2, n)
            pts = [s[0]]
            for k in range(1, n):
                c = s[0] + wdt * k // n; lo, hi = c - 14, c + 14
                pts.append(lo + int(np.argmin(col[lo:hi])))
            pts.append(s[1])
            for k in range(n): final.append([pts[k], pts[k + 1]])
        else:
            final.append(s)
    final = [s for s in final if s[1] - s[0] >= 14]
    for ci, (x0, x1) in enumerate(final):
        sub = fg[y0:y1, x0:x1]
        ys = np.where(sub.any(axis=1))[0]
        ty0, ty1 = (y0 + ys[0], y0 + ys[-1] + 1) if len(ys) else (y0, y1)
        pad = 4
        box = [int(v) for v in [max(0, x0 - pad), max(0, ty0 - pad), min(W, x1 + pad), min(H, ty1 + pad)]]
        name = 'r%dc%d' % (r + 1, ci + 1)
        im.crop(box).save(os.path.join(out, name + '.png'))
        index.append({'id': name, 'row': r + 1, 'col': ci + 1, 'box': box})
    print('row %d: %d cells' % (r + 1, len(final)))

with open(os.path.join(out, 'index.json'), 'w') as f:
    json.dump({'src': os.path.basename(src), 'size': [W, H], 'cells': index}, f, indent=1)
print('total', len(index))

# contact sheet of all crops with their ids, to check the split by eye
from PIL import ImageDraw
S = Image.new('RGB', (20 * 90, 6 * 150), (40, 40, 50)); dr = ImageDraw.Draw(S)
for c in index:
    t = Image.open(os.path.join(out, c['id'] + '.png')); t.thumbnail((88, 130))
    x = (c['col'] - 1) * 90; y = (c['row'] - 1) * 150; S.paste(t, (x, y)); dr.text((x + 2, y + 136), c['id'], fill=(255, 255, 0))
S.save(os.path.join(out, '_contact.png'))
