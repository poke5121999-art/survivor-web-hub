# -*- coding: utf-8 -*-
"""Check d2fmt.py.  Run:  python d2fmt_check.py

1. Synthetic round-trip tests (always run): hand-built DC6/DCC/COF/DT1/DS1
   bytes.  They prove the decoders agree with an independent encoder written
   from the Go source; they do NOT prove agreement with real game files.
2. Real-file check (only if D:\\d2r-ref\\fs exists): decodes sample files and
   writes PNGs to the scratchpad directory.
"""
from __future__ import print_function

import os
import random
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import d2fmt  # noqa: E402

REF = r'D:\d2r-ref\fs'
OUT = (r'C:\Users\tamph\AppData\Local\Temp\claude\D--survivor-web-hub'
       r'\9a1306ea-45b5-4d20-a0db-4a4309754e73\scratchpad\d2fmt')


class W(object):
    """LSB-first bit writer."""

    def __init__(self):
        self.v = 0
        self.n = 0

    def put(self, val, bits):
        self.v |= (val & ((1 << bits) - 1)) << self.n
        self.n += bits

    def bytes(self):
        return self.v.to_bytes((self.n + 7) // 8, 'little')


def ok(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond:
        ok.failed += 1


ok.failed = 0


def test_dc6():
    # 5x3 frame: rows stored bottom-up.  row2(bottom)=1 2 3 . .  row1=. 9 . . 7  row0=4 4 4 4 4
    fd = bytes([3, 1, 2, 3, 0x80,
                0x81, 1, 9, 0x82, 1, 7, 0x80,
                5, 4, 4, 4, 4, 4, 0x80])
    hdr = struct.pack('<iII4sII', 6, 1, 0, b'\xee' * 4, 1, 1) + struct.pack('<I', 28)
    fr = struct.pack('<IIIiiIII', 0, 5, 3, -7, 20, 0, 0, len(fd)) + fd + b'\x01\x02\x03'
    d = d2fmt.read_dc6(hdr + fr)
    f = d['frames'][0][0]
    exp = np.array([[4, 4, 4, 4, 4], [0, 9, 0, 0, 7], [1, 2, 3, 0, 0]], dtype=np.uint8)
    ok('dc6 pixels', (f['pix'] == exp).all())
    ok('dc6 mask', (f['mask'] == np.array([[1] * 5, [0, 1, 0, 0, 1], [1, 1, 1, 0, 0]], dtype=bool)).all())
    ok('dc6 offsets', (f['ox'], f['oy']) == (-7, 17))


def test_cof():
    hdr = bytes([2, 3, 1]) + bytes(21) + bytes([128]) + bytes(3)
    # data: nl=2 fpd=3 dirs=1 ; header: 3 bytes + 21 unknown + speed at index 24
    hdr = bytes([2, 3, 1]) + bytes(21) + bytes([100])
    body = bytes(3)
    lay = bytes([0, 1, 1, 0, 2]) + b'hth\x00' + bytes([1, 0, 0, 1, 0]) + b'1hs\x00'
    anim = bytes([1, 2, 3])
    pri = bytes([0, 1, 1, 0, 0, 1])
    c = d2fmt.read_cof(hdr + body + lay + anim + pri)
    ok('cof layers', [l['type'] for l in c['layers']] == ['HD', 'TR'] and c['layers'][0]['weapon_class'] == 'hth'
       and c['layers'][1]['weapon_class'] == '1hs' and c['speed'] == 100)
    ok('cof priority', c['priority'][0][1] == ['TR', 'HD'] and c['priority'][0][2] == ['HD', 'TR'])
    ok('compass 8', [d2fmt.dir_to_compass(i, 8) for i in range(8)] == ['SW', 'NW', 'NE', 'SE', 'S', 'W', 'N', 'E'])


def encode_dcc(frame_specs, entries):
    """Single-direction, single-frame-per-spec DCC (flags 0, all cells new).
    frame_specs: [(w, h, xo, yo)] with ONE frame only (cells computed as the decoder does).
    Returns (bytes, expected_pix)."""
    (w, h, xo, yo) = frame_specs[0]
    rnd = random.Random(7)
    wb = W()
    wb.put(0, 2)       # compression flags
    wb.put(0, 4)       # var0 bits idx -> 0 bits
    for _ in range(4):  # width,height,xoff,yoff bits: idx 5 -> 8 bits
        wb.put(5, 4)
    wb.put(0, 4)       # optional bits
    wb.put(0, 4)       # coded bytes bits
    wb.put(w, 8)
    wb.put(h, 8)
    wb.put(xo, 8)
    wb.put(yo, 8)
    wb.put(0, 1)       # bottom up
    wb.put(0, 20)      # pixel mask stream size
    used = set(entries)
    for i in range(256):
        wb.put(1 if i in used else 0, 1)
    # cells exactly as the decoder derives them (single frame => same as direction box)
    w0 = 4
    hc = 1 if w - w0 <= 1 else 2 + (w - w0 - 1) // 4 - (1 if (w - w0 - 1) % 4 == 0 else 0)
    vc = 1 if h - 4 <= 1 else 2 + (h - 4 - 1) // 4 - (1 if (h - 4 - 1) % 4 == 0 else 0)
    cws = [w] if hc == 1 else [4] + [4] * (hc - 2) + [w - 4 - 4 * (hc - 2)]
    chs = [h] if vc == 1 else [4] + [4] * (vc - 2) + [h - 4 - 4 * (vc - 2)]
    pcd = W()
    cells = []
    for cy in range(vc):
        for cx in range(hc):
            codes = sorted(rnd.sample(range(1, len(entries)), 4))
            last = 0
            for c in codes:
                d = c - last
                while d >= 15:
                    pcd.put(15, 4)
                    d -= 15
                pcd.put(d, 4)
                last = c
            cells.append((cx, cy, codes))
    exp = np.zeros((h, w), dtype=np.uint8)
    for (cx, cy, codes) in cells:
        vals = [codes[3], codes[2], codes[1], codes[0]]  # value[i] <- stack[3-i]
        ox = sum(cws[:cx])
        oy = sum(chs[:cy])
        for y in range(chs[cy]):
            for x in range(cws[cx]):
                k = rnd.randrange(4)
                pcd.put(k, 2)
                exp[oy + y, ox + x] = entries[vals[k]]
    wb.put(pcd.v, pcd.n)
    wb_bytes = wb.bytes()
    direction = struct.pack('<I', 0) + wb_bytes
    hdr = bytes([0x74, 6, 1]) + struct.pack('<iii', 1, 1, 0) + struct.pack('<i', 19)
    return hdr + direction, exp


def test_dcc():
    entries = [0] + list(range(5, 250, 3))
    for (w, h) in [(11, 10), (9, 13), (3, 3), (20, 17)]:
        data, exp = encode_dcc([(w, h, -5, 9)], entries)
        d = d2fmt.read_dcc(data)
        f = d['frames'][0][0]
        ok('dcc %dx%d pixels' % (w, h), f['pix'].shape == exp.shape and (f['pix'] == exp).all())
        ok('dcc %dx%d box' % (w, h), (f['ox'], f['oy']) == (-5, 9 - h + 1))


def test_dt1():
    # one floor tile (iso block, 256 bytes) and one wall tile (RLE block)
    iso = bytes(range(256))
    rle = bytes([2, 3, 7, 8, 9]) + bytes([0, 0]) + bytes([0, 2, 5, 6])
    hdr = struct.pack('<ii', 7, 6) + bytes(260) + struct.pack('<ii', 2, 276)
    tiles = b''
    blocks = b''
    bptr0 = 276 + 2 * 96
    # tile 0
    t0_blocks = struct.pack('<hh2sBBhi2si', 0, 0, b'\0\0', 0, 0, 1, 256, b'\0\0', 20) + iso
    t1_blocks = struct.pack('<hh2sBBhi2si', 0, -10, b'\0\0', 0, 0, 0, len(rle), b'\0\0', 20) + rle
    tiles += struct.pack('<ihHii4siiii4s', 0, 0, 0, 79, 160, b'\0' * 4, 0, 3, 1, 2, b'\0' * 4)
    tiles += bytes(range(25)) + bytes(7) + struct.pack('<iii', bptr0, 0, 1) + bytes(12)
    tiles += struct.pack('<ihHii4siiii4s', 0, -64, 0x10, -96, 160, b'\0' * 4, 1, 4, 5, 6, b'\0' * 4)
    tiles += bytes(25) + bytes(7) + struct.pack('<iii', bptr0 + len(t0_blocks), 0, 1) + bytes(12)
    t = d2fmt.read_dt1(hdr + tiles + t0_blocks + t1_blocks)
    ok('dt1 tile fields', (t[0]['main_index'], t[0]['sub_index'], t[0]['rarity'], t[0]['orientation']) == (3, 1, 2, 0)
       and t[1]['orientation'] == 1 and t[1]['height'] == -96 and t[0]['subtile_flags'][24] == 24)
    p = t[0]['pix']
    ok('dt1 iso rows', p.shape[1] == 160 and p[0, 14:18].tolist() == [0, 1, 2, 3] and p[7, 0:32].tolist() == list(range(
        sum(d2fmt._NBPIX[:7]), sum(d2fmt._NBPIX[:8]))))
    p1 = t[1]['pix']
    ok('dt1 rle', t[1]['y_min'] == -10 and p1[0, 2:5].tolist() == [7, 8, 9] and p1[1, 0:2].tolist() == [5, 6]
       and t[1]['mask'][0, 2:5].all() and p1.shape[0] == 96)


def test_ds1():
    ver = 18
    w, h = 3, 2
    n = w * h
    out = struct.pack('<iii', ver, w - 1, h - 1)
    out += struct.pack('<ii', 0, 1)                    # act, substitution type
    out += struct.pack('<i', 2) + b'a.dt1\0b.dt1\0'
    out += struct.pack('<ii', 1, 1)                    # walls, floors
    wall = [(1 | (2 << 8) | (3 << 20)) for _ in range(n)]
    out += struct.pack('<%dI' % n, *wall)
    out += struct.pack('<%dI' % n, *[5] * n)            # orientation
    out += struct.pack('<%dI' % n, *[(9 | (1 << 31)) for _ in range(n)])  # floor
    out += struct.pack('<%dI' % n, *[0] * n)            # shadow
    out += struct.pack('<%dI' % n, *range(n))           # substitution
    out += struct.pack('<i', 1) + struct.pack('<iiiii', 1, 7, 10, 20, 0x10)
    out += struct.pack('<I', 0) + struct.pack('<i', 1) + struct.pack('<iiiii', 0, 0, 2, 2, 0)
    out += struct.pack('<i', 1) + struct.pack('<iii', 2, 10, 20) + struct.pack('<iii', 4, 5, 1) + struct.pack('<iii', 6, 7, 2)
    d = d2fmt.read_ds1(out)
    ok('ds1 header', (d['width'], d['height'], d['act'], d['files']) == (3, 2, 1, ['a.dt1', 'b.dt1']))
    ok('ds1 wall/floor', d['walls'][0][1][2] == {'prop1': 1, 'sequence': 2, 'unknown1': 0, 'style': 3,
                                                 'unknown2': 0, 'hidden': 0, 'orientation': 5}
       and d['floors'][0][0][0]['hidden'] == 1 and d['floors'][0][0][0]['prop1'] == 9
       and d['substitutions'][0][1][2] == 5)
    ok('ds1 objects', d['objects'][0]['x'] == 10 and d['objects'][0]['paths'] == [
        {'x': 4, 'y': 5, 'action': 1}, {'x': 6, 'y': 7, 'action': 2}] and len(d['substitution_groups']) == 1)


def find_first(root, pred):
    for dp, dn, fn in os.walk(root):
        dn.sort()
        for f in sorted(fn):
            p = os.path.join(dp, f)
            if pred(p.replace('\\', '/').lower()):
                return p
    return None


def save_png(path, pix, mask, pal):
    from PIL import Image
    Image.fromarray(d2fmt.to_rgba(pix, mask, pal), 'RGBA').save(path)


def real_check():
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    pal_path = find_first(REF, lambda p: p.endswith('global/palette/act1/pal.dat'))
    print('palette:', pal_path)
    pal = d2fmt.load_palette(pal_path)
    p = find_first(REF, lambda p: p.endswith('.dc6') and ('global/ui' in p or 'global/items' in p))
    if p:
        d = d2fmt.read_dc6(open(p, 'rb').read())
        f = d['frames'][0][0]
        print('dc6', p, d['dirs'], d['frames_per_dir'], f['w'], f['h'], f['ox'], f['oy'])
        save_png(os.path.join(OUT, 'dc6.png'), f['pix'], f['mask'], pal)
    for tag in ('monsters/zm', 'monsters/fa'):
        p = find_first(REF, lambda q: q.endswith('.dcc') and tag in q)
        if p:
            d = d2fmt.read_dcc(open(p, 'rb').read())
            row = d['frames'][0]
            print('dcc', p, d['dirs'], d['frames_per_dir'], row[0]['w'], row[0]['h'], row[0]['ox'], row[0]['oy'])
            sheet = np.zeros((row[0]['h'], row[0]['w'] * min(8, len(row)), 4), dtype=np.uint8)
            for i, fr in enumerate(row[:8]):
                sheet[:, i * fr['w']:(i + 1) * fr['w']] = d2fmt.to_rgba(fr['pix'], fr['mask'], pal)
            Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'dcc_' + tag.split('/')[1] + '.png'))
            break
    p = find_first(REF, lambda q: q.endswith('.cof'))
    if p:
        c = d2fmt.read_cof(open(p, 'rb').read())
        print('cof', p, {k: c[k] for k in ('frames_per_dir', 'dirs', 'speed')}, c['layers'][:3])
        print('priority[0][0]', c['priority'][0][0])
    p = find_first(REF, lambda q: q.endswith('.dt1') and 'act1' in q and 'floor' in q) or \
        find_first(REF, lambda q: q.endswith('.dt1') and 'act1' in q)
    if p:
        t = d2fmt.read_dt1(open(p, 'rb').read())
        print('dt1', p, len(t))
        cols = 8
        cw = max(x['pix'].shape[1] for x in t[:48])
        chh = max(x['pix'].shape[0] for x in t[:48])
        rows = (min(48, len(t)) + cols - 1) // cols
        sheet = np.zeros((rows * chh, cols * cw, 4), dtype=np.uint8)
        for i, x in enumerate(t[:48]):
            r, c_ = divmod(i, cols)
            h, w = x['pix'].shape
            sheet[r * chh:r * chh + h, c_ * cw:c_ * cw + w] = d2fmt.to_rgba(x['pix'], x['mask'], pal)
        Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'dt1.png'))
    p = find_first(REF, lambda q: q.endswith('.ds1') and 'act1' in q)
    if p:
        d = d2fmt.read_ds1(open(p, 'rb').read())
        print('ds1', p, d['version'], d['width'], d['height'], 'walls', len(d['walls']), 'floors',
              len(d['floors']), 'shadows', len(d['shadows']), 'subs', len(d['substitutions']),
              'objects', len(d['objects']), 'files', d['files'][:3])


if __name__ == '__main__':
    test_dc6()
    test_cof()
    test_dcc()
    test_dt1()
    test_ds1()
    if os.path.isdir(REF):
        real_check()
    else:
        print('NOTE %s does not exist: real-file check skipped, nothing verified against real game files' % REF)
    print('failures:', ok.failed)
    sys.exit(1 if ok.failed else 0)
