# -*- coding: utf-8 -*-
"""Ve bang doi chieu: moi khoa mot hang, cac khung tach nhau, de soi bang mat
xem bo do khung hinh co cat sai cho nao khong."""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.normpath(os.path.join(HERE, '..', 'assets'))
data = json.load(io.open(A + '/atlas.json', encoding='utf-8'))
pages = [Image.open(os.path.join(A, p)).convert('RGBA') for p in data['pages']]
S = 3
GAP = 3

keys = sys.argv[2:] if len(sys.argv) > 2 else []
if not keys:
    keys = [k for k in data['sprites'] if k.endswith('.move')][:24]

rows = []
for k in keys:
    sp = data['sprites'].get(k)
    if not sp:
        continue
    fr = sp['f'][:14]
    imgs = [pages[sp['p']].crop((f[0], f[1], f[0] + f[2], f[1] + f[3])) for f in fr]
    rows.append((k, imgs, len(sp['f'])))

W = 260 + max(sum(i.width * S + GAP for i in r[1]) for r in rows)
H = sum(max(i.height for i in r[1]) * S + 14 for r in rows) + 10
out = Image.new('RGBA', (W, H), (22, 20, 26, 255))
d = ImageDraw.Draw(out)
y = 5
for k, imgs, n in rows:
    hh = max(i.height for i in imgs) * S
    d.text((4, y + hh // 2 - 4), '%s [%d]' % (k, n), fill=(255, 230, 120, 255))
    x = 258
    for im in imgs:
        big = im.resize((im.width * S, im.height * S), Image.NEAREST)
        d.rectangle([x - 1, y - 1, x + big.width, y + big.height],
                    outline=(255, 60, 60, 110))
        out.alpha_composite(big, (x, y))
        x += big.width + GAP
    y += hh + 14
out.save(sys.argv[1])
print('ok', out.size, len(rows))
