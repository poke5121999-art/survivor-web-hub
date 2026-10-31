import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import bclib
from PIL import Image
idx = bclib.index()
real = {'f': [], 'c': [], 's': [], 'e': []}
for name in idx:
    m = re.fullmatch(r'(\d{3})_([fcse])\.png', name)
    if not m: continue
    uid, form = int(m.group(1)), m.group(2)
    p = bclib.find_png(name)
    try:
        w, h = Image.open(p).size
    except Exception:
        continue
    if w * h > 4:  # not a 1x1/2x2 blank
        real[form].append(uid)
for f in real:
    real[f] = sorted(set(real[f]))
    print(f, 'real sheets:', len(real[f]))
json.dump(real, open(os.path.join(os.path.dirname(__file__), '..', 'data', '_real_sheets.json'), 'w'))
print('cat units with real f:', real['f'][:20])
