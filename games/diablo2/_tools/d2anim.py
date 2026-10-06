# -*- coding: utf-8 -*-
"""animdata.d2 parser: 256 hash blocks, each = int32 count + count * 160-byte records
(name char[8], framesPerDir u32, animSpeed u32, frameData[144] u8; 1 = action frame).
fps = 25 * speed / 256."""
from __future__ import print_function
import io
import json
import os
import struct

import numpy as np
from PIL import Image

__all__ = ['load_animdata', 'GroupAtlas', 'write_group']


def load_animdata(path):
    """-> {NAME: {'frames': n, 'speed': s, 'fps': float, 'hit': first action frame or -1,
    'actions': [frame indices]}}.  Names are upper case COF names, e.g. 'AMWLHTH'."""
    with open(path, 'rb') as f:
        d = f.read()
    o = 0
    out = {}
    for _ in range(256):
        n = struct.unpack_from('<i', d, o)[0]
        o += 4
        for _ in range(n):
            name = d[o:o + 8].split(b'\x00')[0].decode('latin-1').upper()
            fpd, spd = struct.unpack_from('<II', d, o + 8)
            fd = d[o + 16:o + 160]
            acts = [i for i in range(min(fpd, 144)) if fd[i] == 1]
            out[name] = {'frames': fpd, 'speed': spd, 'fps': 25.0 * spd / 256.0,
                         'hit': acts[0] if acts else -1, 'actions': acts}
            o += 160
    if o != len(d):
        raise ValueError('animdata: %d trailing bytes (parsed %d of %d)' % (len(d) - o, o, len(d)))
    return out


# ---------------------------------------------------------------------------
# v2 asset groups (shared by build_sprites and build_objects): one atlas + one assets/m/<group>.js
# ---------------------------------------------------------------------------
GAME = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
G_IMG = os.path.join(GAME, 'assets', 'img', 'g')
G_WEB = 'assets/img/g'
M_DIR = os.path.join(GAME, 'assets', 'm')
LOSSY_Q = 35          # chosen by eye (identical at 1x) and by size; see build_sprites.py header
PAGE = 2048


def _opaque_colors(arr):
    m = arr[..., 3] > 0
    rgb = arr[..., :3][m].astype(np.uint32)
    return len(np.unique((rgb[:, 0] << 16) | (rgb[:, 1] << 8) | rgb[:, 2]))


def encode_page(arr, path, q=LOSSY_Q):
    """Write one page. Lossless and lossy both encoded, the smaller kept.
    D2 sprites are 8-bit palette art, so a palette page is already smaller than any lossy encode of it;
    lossy only pays on pages of blended (many-colour) frames. Alpha stays lossless in both (alpha_quality 100)."""
    im = Image.fromarray(arr)
    b = io.BytesIO()
    im.save(b, 'WEBP', lossless=True, quality=90, method=6)
    best, mode = b.getvalue(), 'll'
    if True:
        c = io.BytesIO()
        im.save(c, 'WEBP', lossless=False, quality=q, alpha_quality=100, method=6)
        if c.tell() < len(best):
            best, mode = c.getvalue(), 'q%d' % q
    for _ in range(5):
        try:
            with open(path, 'wb') as f:
                f.write(best)
            break
        except OSError:
            import time
            time.sleep(0.5)
    return len(best), mode


class GroupAtlas(object):
    """Frame dedup + shelf packing (same rect contract as d2pack: [x,y,w,h,ox,oy,page], page local to the group)."""

    def __init__(self, name):
        self.name = name
        self.items = []
        self.seen = {}

    def add(self, rgba, ax, ay):
        from d2pack import trim
        t = trim(rgba, ax, ay)
        if t is None:
            return []
        key = (t[0].shape, t[1], t[2], t[0].tobytes())
        r = self.seen.get(key)
        if r is None:
            r = []
            self.seen[key] = r
            self.items.append((t[0], t[1], t[2], r))
        return r

    def save(self):
        """-> (pages [web paths], bytes, modes)."""
        self.seen = None
        order = sorted(self.items, key=lambda it: -it[0].shape[0])
        pages, cur = [], None
        x = y = shelf = 0
        for img, ox, oy, rect in order:
            h, w = img.shape[:2]
            if w > PAGE or h > PAGE:
                raise ValueError('%s: frame %dx%d is larger than a page' % (self.name, w, h))
            if cur is None or x + w > PAGE:
                x, y, shelf = 0, y + shelf + 1, 0
            if cur is None or y + h > PAGE:
                cur = np.zeros((PAGE, PAGE, 4), np.uint8)
                pages.append([cur, 0])
                x = y = shelf = 0
            cur[y:y + h, x:x + w] = img
            pages[-1][1] = max(pages[-1][1], y + h)
            rect.extend([x, y, w, h, ox, oy, len(pages) - 1])
            x += w + 1
            shelf = max(shelf, h)
        os.makedirs(G_IMG, exist_ok=True)
        paths, total, modes = [], 0, []
        for i, (arr, used) in enumerate(pages):
            fn = '%s_%d.webp' % (self.name, i)
            n, m = encode_page(arr[:max(1, used)], os.path.join(G_IMG, fn))
            total += n
            modes.append(m)
            paths.append(G_WEB + '/' + fn)
        self.items = []
        return paths, total, modes


def write_group(name, body):
    """assets/m/<name>.js = D2_REG('<name>', body) ; body is a dict with pages first-class."""
    os.makedirs(M_DIR, exist_ok=True)
    p = os.path.join(M_DIR, name + '.js')
    txt = u"D2_REG('%s',%s);\n" % (name, json.dumps(body, sort_keys=True, separators=(',', ':')))
    for _ in range(5):
        try:
            with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
                f.write(txt)
            break
        except OSError:
            import time
            time.sleep(0.5)
    return len(txt.encode('utf-8'))


def clean_groups(prefixes):
    """Remove stale group files and pages of the given group-name prefixes (e.g. 'hero_', 'mon_')."""
    import glob
    for pre in prefixes:
        for p in glob.glob(os.path.join(M_DIR, pre + '*.js')) + glob.glob(os.path.join(G_IMG, pre + '*.webp')):
            os.remove(p)


if __name__ == '__main__':
    import sys
    a = load_animdata(sys.argv[1] if len(sys.argv) > 1 else
                      r'D:\d2r-ref\fs\data\data\global\animdata.d2')
    print(len(a), 'records')
    for k in ('AMWLHTH', 'AMA11HT', 'AMNU1HT', 'ZMWLHTH', 'ZMA1HTH', 'ZMNUHTH', 'AIWL1HT'):
        print(k, a.get(k))
