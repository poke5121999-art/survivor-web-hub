"""Pack loose PNGs into atlas pages + a JSON frame index.

Skyline packer, alpha-trimmed, 1px gutter so bilinear never bleeds between
frames. The index records the trim offsets so a frame still draws at its
original size and registration.
"""
import os, sys, json, re
from PIL import Image

def pack(files, outdir, prefix, maxsize=2048, pad=1, scale=1):
    os.makedirs(outdir, exist_ok=True)
    items = []
    for name, path in files:
        im = Image.open(path).convert('RGBA')
        if scale != 1:
            im = im.resize((im.width*scale, im.height*scale), Image.NEAREST)
        ow, oh = im.size
        bb = im.getbbox()
        if bb is None:
            continue
        tr = im.crop(bb)
        items.append({'n': name, 'im': tr, 'ow': ow, 'oh': oh,
                      'ox': bb[0], 'oy': bb[1]})
    items.sort(key=lambda d: -d['im'].height)
    pages = []; index = {}
    cur = None
    def newpage():
        return {'img': Image.new('RGBA', (maxsize, maxsize), (0,0,0,0)),
                'sky': [(0,0,maxsize)], 'maxy': 0}
    def place(page, w, h):
        best = None
        for i,(sx,sy,sw) in enumerate(page['sky']):
            if sw < w: continue
            # y = max height across the spans this rect would cover
            need = w; y = sy; j = i
            while need > 0 and j < len(page['sky']):
                y = max(y, page['sky'][j][1]); need -= page['sky'][j][2]; j += 1
            if need > 0: continue
            if y + h > maxsize: continue
            if best is None or y < best[1] or (y == best[1] and sx < best[0]):
                best = (sx, y, i)
        return best
    def commit(page, x, y, w, h):
        sky = page['sky']; out = []; need = w; placed=False
        for (sx, sy, sw) in sky:
            if sx + sw <= x or sx >= x + w:
                out.append((sx, sy, sw)); continue
            # split
            if sx < x:
                out.append((sx, sy, x - sx))
            if not placed:
                out.append((x, y + h, w)); placed = True
            if sx + sw > x + w:
                out.append((x + w, sy, sx + sw - (x + w)))
        out.sort()
        merged = []
        for s in out:
            if merged and merged[-1][1] == s[1] and merged[-1][0] + merged[-1][2] == s[0]:
                merged[-1] = (merged[-1][0], merged[-1][1], merged[-1][2] + s[2])
            else:
                merged.append(list(s) if False else s)
                merged[-1] = tuple(s)
        page['sky'] = merged
        page['maxy'] = max(page['maxy'], y + h)
    for it in items:
        w, h = it['im'].width + pad, it['im'].height + pad
        if w > maxsize or h > maxsize:
            continue
        spot = None
        for pi, page in enumerate(pages):
            spot = place(page, w, h)
            if spot: cur = pi; break
        if not spot:
            pages.append(newpage()); cur = len(pages)-1
            spot = place(pages[cur], w, h)
            if not spot: continue
        page = pages[cur]
        x, y, _ = spot
        page['img'].paste(it['im'], (x, y))
        commit(page, x, y, w, h)
        index[it['n']] = [cur, x, y, it['im'].width, it['im'].height,
                          it['ox'], it['oy'], it['ow'], it['oh']]
    meta = {'pages': [], 'f': index, 'fmt': 'page,x,y,w,h,offx,offy,srcw,srch'}
    for i, page in enumerate(pages):
        hgt = 1
        while hgt < page['maxy']: hgt *= 2
        img = page['img'].crop((0, 0, maxsize, hgt))
        fn = '%s_%d.png' % (prefix, i)
        img.save(os.path.join(outdir, fn), optimize=True)
        meta['pages'].append({'file': fn, 'w': maxsize, 'h': hgt})
    return meta
