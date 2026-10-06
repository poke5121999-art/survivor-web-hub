# -*- coding: utf-8 -*-
"""Draw a D2G Level the way js/engine.js will (brain/plans/diablo2-d2r.md, "Cách vẽ một tile").

    node games/diablo2/js/drlg.js --dump blood_moor 1 lv.json
    python render_level.py lv.json out.png [--col] [--quarter]

Writes out.png and out_q.png (1/4 scale). --col paints blocked subtiles as red dots (water in blue).
Tile (tx, ty) -> px = (tx - ty) * 80, py = (tx + ty) * 40; the variant image goes to (px - 80, py + dy):
floor dy = yMin, shadow dy = yMin + 80 at 160/255 opacity, wall dy = yMin + 80 (orientation 3 also draws the
orientation 4 tile with the same style/sequence), roof dy = yMin (the build already folds -roofHeight in).
Order: low walls (16..19), floor, shadow; then walls 1..14 except 10, 11, 13; then roofs (15).
"""
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ASSETS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets'))
Image.MAX_IMAGE_PIXELS = None


def load_world():
    s = io.open(os.path.join(ASSETS, 'world.js'), encoding='utf-8').read()
    return json.loads(s[s.index('g.D2_WORLD=') + len('g.D2_WORLD='):s.rindex(';})(typeof')])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    show_col = '--col' in sys.argv
    lv = json.load(io.open(args[0], encoding='utf-8'))
    out = args[1]
    ts = load_world()['tilesets'][lv['tileset']]
    pages = {}

    def page(i):
        if i not in pages:
            p = os.path.join(ASSETS, '..', ts['pages'][i])
            pages[i] = np.asarray(Image.open(p).convert('RGBA'))
        return pages[i]

    tw, th = lv['tw'], lv['th']
    ox, oy = th * 80 + 160, 400
    W, H = (tw + th) * 80 + 320, (tw + th) * 40 + 400 + 360
    img = np.zeros((H, W, 4), np.uint8)
    miss = set()

    def variants(o, style, seq):
        return ts['tiles'].get('%d_%d_%d' % (o, style, seq))

    def blit(row, px, py, dy, opacity=1.0):
        x, y, w, h, ymin, _r, pg = row[:7]
        if w == 0:
            return
        src = page(pg)[y:y + h, x:x + w]
        x0, y0 = px - 80 + ox, py + dy + oy
        dst = img[y0:y0 + h, x0:x0 + w]
        m = src[..., 3] > 0
        if opacity < 1.0:
            a = opacity
            dst[m, :3] = (dst[m, :3] * (1 - a) + src[m, :3] * a).astype(np.uint8)
            dst[m, 3] = 255
        else:
            dst[m] = src[m]

    def draw(t, o, tx, ty, kind):
        if not t:
            return
        style, seq, v = (t >> 8) & 255, t & 255, t >> 16
        lst = variants(o, style, seq)
        if not lst:
            miss.add((o, style, seq))
            return
        row = lst[v]
        px, py = (tx - ty) * 80, (tx + ty) * 40
        ymin = row[4]
        if kind == 'floor' or o == 15:
            blit(row, px, py, ymin)
        elif kind == 'shadow':
            blit(row, px, py, ymin + 80, 160 / 255.0)
        else:
            blit(row, px, py, ymin + 80)
            if o == 3:
                l4 = variants(4, style, seq)
                if l4:
                    blit(l4[min(v, len(l4) - 1)], px, py, l4[min(v, len(l4) - 1)][4] + 80)

    floors = lv['floors'][0]
    shadows = lv['shadows'][0]
    walls = lv['walls']
    for ty in range(th):
        for tx in range(tw):
            i = ty * tw + tx
            for L in walls:
                o = L['o'][i]
                if 16 <= o <= 19:
                    draw(L['t'][i], o, tx, ty, 'wall')
            draw(floors[i], 0, tx, ty, 'floor')
            draw(shadows[i], 13, tx, ty, 'shadow')
    for ty in range(th):
        for tx in range(tw):
            i = ty * tw + tx
            for L in walls:
                o = L['o'][i]
                if 1 <= o <= 14 and o not in (10, 11, 13):
                    draw(L['t'][i], o, tx, ty, 'wall')
    for ty in range(th):
        for tx in range(tw):
            i = ty * tw + tx
            for L in walls:
                if L['o'][i] == 15:
                    draw(L['t'][i], 15, tx, ty, 'wall')

    w5 = lv['w']
    if show_col:
        col = lv['col']
        for sy in range(lv['h']):
            for sx in range(w5):
                c = col[sy * w5 + sx]
                if c:
                    X, Y = (sx - sy) * 16 + ox, (sx + sy) * 8 + 8 + oy
                    img[Y - 1:Y + 2, X - 1:X + 2] = (255, 0, 0, 255) if c == 1 else (0, 120, 255, 255)

    def mark(sx, sy, colr):
        X, Y = (sx - sy) * 16 + ox, (sx + sy) * 8 + 8 + oy
        img[Y - 6:Y + 7, X - 6:X + 7] = colr

    for e in lv['exits']:
        mark(e['x'], e['y'], (255, 255, 0, 255))
    mark(lv['hero'][0], lv['hero'][1], (0, 255, 0, 255))
    for s in lv['spawns']:
        mark(s['x'], s['y'], (255, 0, 255, 255))

    im = Image.fromarray(img)
    bb = im.getbbox()
    im = im.crop(bb)
    bg = Image.new('RGBA', im.size, (24, 24, 28, 255))
    bg.alpha_composite(im)
    bg = bg.convert('RGB')
    bg.save(out)
    q = bg.resize((max(1, bg.width // 4), max(1, bg.height // 4)), Image.LANCZOS)
    q.save(re.sub(r'\.png$', '_q.png', out))
    print('%s %s, missing tile keys %d %s' % (out, bg.size, len(miss), sorted(miss)[:5]))


if __name__ == '__main__':
    main()
