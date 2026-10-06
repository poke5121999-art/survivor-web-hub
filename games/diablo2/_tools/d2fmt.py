# -*- coding: utf-8 -*-
"""Diablo II legacy file-format decoders (palette, DC6, DCC, COF, DT1, DS1).

Port of OpenDiablo2 d2common/d2fileformats (Go) to Python 3.8 + numpy + Pillow.
All pixel data stays as uint8 palette indices; colour is applied only by
to_rgba().  Index 0 is "transparent" for DC6/DCC (masks reflect that).

Sprite anchor convention (DC6 and DCC frames)
    Frame['ox'], Frame['oy'] = position of the frame's TOP-LEFT pixel relative
    to the sprite's anchor point (the unit's feet / the item's origin), in
    screen pixels, y growing downward.  Draw the frame at
    (anchor_x + ox, anchor_y + oy).
    - DC6: the file stores OffsetX = left edge and OffsetY = the y of the
      BOTTOM edge relative to the anchor; OpenDiablo2 draws a frame at
      (x + OffsetX, y + OffsetY - Height), so oy = OffsetY - h (raw value kept
      in Frame['oy_raw']).
    - DCC: every frame of one direction shares ONE canvas (the union box of
      all frames of that direction, dcc_direction.go 'Box'); ox, oy are the
      Box.Left / Box.Top of that direction (top = yOffset - height + 1 per
      frame).  All frames of a direction therefore have equal w, h, ox, oy.
"""
from __future__ import print_function

import math
import struct

import numpy as np

__all__ = ['load_palette', 'read_dc6', 'read_dcc', 'read_cof', 'read_dt1',
           'read_ds1', 'to_rgba', 'dir_to_compass', 'COMPOSITE_TYPES']


# --------------------------------------------------------------------------
# palette
# --------------------------------------------------------------------------

def parse_palette(data):
    """pal.dat: 256 entries of B, G, R (768 bytes) -> (256,3) uint8 RGB."""
    if len(data) < 768:
        raise ValueError('palette too short: %d bytes (need 768)' % len(data))
    bgr = np.frombuffer(bytes(data[:768]), dtype=np.uint8).reshape(256, 3)
    return bgr[:, ::-1].copy()


def load_palette(path):
    """Load pal.dat -> np.ndarray (256,3) uint8 RGB."""
    with open(path, 'rb') as f:
        return parse_palette(f.read())


def to_rgba(pix, mask, palette):
    """Apply palette: pix (h,w) uint8 indices, mask (h,w) bool -> (h,w,4) uint8."""
    pix = np.asarray(pix)
    out = np.zeros(pix.shape + (4,), dtype=np.uint8)
    out[..., :3] = palette[pix]
    out[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return out


# --------------------------------------------------------------------------
# DC6
# --------------------------------------------------------------------------

def read_dc6(data):
    """Decode a DC6 file (d2dc6/dc6.go).

    -> {'dirs', 'frames_per_dir', 'frames': [dir][frame] -> Frame}.
    Frame = {'w','h','ox','oy','oy_raw','pix','mask'}; see module docstring for
    the ox/oy anchor convention.  Rows are stored bottom-to-top in the file;
    the returned image is top-to-bottom.
    """
    data = bytes(data)
    if len(data) < 24:
        raise ValueError('dc6 truncated header')
    version, flags, encoding = struct.unpack_from('<iII', data, 0)
    dirs, fpd = struct.unpack_from('<II', data, 16)
    n = dirs * fpd
    p = 24 + 4 * n  # frames follow the pointer table back to back (as dc6.go)
    frames = []
    for d in range(dirs):
        row = []
        for f in range(fpd):
            (flipped, w, h, offx, offy, unk, nxt, length) = struct.unpack_from('<IIIiiIII', data, p)
            fd = data[p + 32:p + 32 + length]
            p += 32 + length + 3
            pix = np.zeros((h, w), dtype=np.uint8)
            mask = np.zeros((h, w), dtype=bool)
            x = 0
            y = h - 1
            o = 0
            while o < len(fd):
                b = fd[o]
                o += 1
                if b == 0x80:
                    if y == 0:
                        break
                    y -= 1
                    x = 0
                elif b & 0x80:
                    x += b & 0x7f
                else:
                    seg = fd[o:o + b]
                    o += b
                    xe = min(x + len(seg), w)
                    if 0 <= y < h and xe > x:
                        pix[y, x:xe] = np.frombuffer(seg, dtype=np.uint8)[:xe - x]
                        mask[y, x:xe] = True
                    x += b
            row.append({'w': w, 'h': h, 'ox': offx, 'oy': offy - h,
                        'oy_raw': offy, 'pix': pix, 'mask': mask})
        frames.append(row)
    return {'dirs': dirs, 'frames_per_dir': fpd, 'frames': frames,
            'version': version}


# --------------------------------------------------------------------------
# DCC
# --------------------------------------------------------------------------

_CRAZY_BITS = (0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32)
_PIXEL_MASK_LOOKUP = (0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4)


class _Bits(object):
    """LSB-first bit reader (d2datautils.BitMuncher). pos is in bits."""

    def __init__(self, data, pos):
        self.data = data
        self.pos = pos
        self.start = pos

    def copy(self):
        return _Bits(self.data, self.pos)

    def bits(self, n):
        if n == 0:
            return 0
        p = self.pos
        b0 = p >> 3
        b1 = (p + n + 7) >> 3
        chunk = self.data[b0:b1]
        if len(chunk) < b1 - b0:
            chunk = chunk + b'\x00' * (b1 - b0 - len(chunk))
        v = (int.from_bytes(chunk, 'little') >> (p & 7)) & ((1 << n) - 1)
        self.pos = p + n
        return v

    def signed(self, n):
        if n == 0:
            return 0
        v = self.bits(n)
        if v & (1 << (n - 1)):
            v -= 1 << n
        return v

    def skip(self, n):
        self.pos += n

    def read(self):
        return self.bits(1)

    def bits_read(self):
        return self.pos - self.start


def _decode_dcc_direction(data, bitpos, frames_per_dir):
    bm = _Bits(data, bitpos)
    bm.bits(32)  # OutSizeCoded
    comp_flags = bm.bits(2)
    var0_bits = _CRAZY_BITS[bm.bits(4)]
    w_bits = _CRAZY_BITS[bm.bits(4)]
    h_bits = _CRAZY_BITS[bm.bits(4)]
    x_bits = _CRAZY_BITS[bm.bits(4)]
    y_bits = _CRAZY_BITS[bm.bits(4)]
    opt_bits = _CRAZY_BITS[bm.bits(4)]
    coded_bits = _CRAZY_BITS[bm.bits(4)]

    # frame headers
    fr = []
    minx = miny = 100000
    maxx = maxy = -100000
    for _ in range(frames_per_dir):
        bm.bits(var0_bits)
        width = bm.bits(w_bits)
        height = bm.bits(h_bits)
        xo = bm.signed(x_bits)
        yo = bm.signed(y_bits)
        bm.bits(opt_bits)
        bm.bits(coded_bits)
        bottom_up = bm.bits(1)
        if bottom_up:
            raise NotImplementedError('dcc: bottom up frames are not implemented')
        left, top = xo, yo - height + 1
        f = {'w': width, 'h': height, 'left': left, 'top': top}
        fr.append(f)
        minx = min(minx, left)
        miny = min(miny, top)
        maxx = max(maxx, left + width)
        maxy = max(maxy, top + height)
    bx, by, bw, bh = minx, miny, maxx - minx, maxy - miny

    if opt_bits > 0:
        raise NotImplementedError('dcc: optional data bits are not supported')

    equal_size = bm.bits(20) if (comp_flags & 2) else 0
    mask_size = bm.bits(20)
    enc_size = raw_size = 0
    if comp_flags & 1:
        enc_size = bm.bits(20)
        raw_size = bm.bits(20)

    pal_entries = [0] * 256
    cnt = 0
    for i in range(256):
        if bm.bits(1):
            pal_entries[cnt] = i
            cnt += 1

    ec = bm.copy()
    bm.skip(equal_size)
    pm = bm.copy()
    bm.skip(mask_size)
    et = bm.copy()
    bm.skip(enc_size)
    rp = bm.copy()
    bm.skip(raw_size)
    pcd = bm.copy()

    # direction cells (4x4 grid over the union box)
    hcount = 1 + (bw - 1) // 4
    vcount = 1 + (bh - 1) // 4
    dir_cells = []  # [w, h, xoff, yoff, lastw, lasth, lastx, lasty]
    for cy in range(vcount):
        ch = bh if vcount == 1 else (4 if cy < vcount - 1 else bh - 4 * (vcount - 1))
        for cx in range(hcount):
            cw = bw if hcount == 1 else (4 if cx < hcount - 1 else bw - 4 * (hcount - 1))
            dir_cells.append([cw, ch, cx * 4, cy * 4, -1, -1, 0, 0])

    # per-frame cells
    for f in fr:
        w0 = 4 - ((f['left'] - bx) % 4)
        if f['w'] - w0 <= 1:
            fh = 1
        else:
            tmp = f['w'] - w0 - 1
            fh = 2 + tmp // 4
            if tmp % 4 == 0:
                fh -= 1
        h0 = 4 - ((f['top'] - by) % 4)
        if f['h'] - h0 <= 1:
            fv = 1
        else:
            tmp = f['h'] - h0 - 1
            fv = 2 + tmp // 4
            if tmp % 4 == 0:
                fv -= 1
        if fh == 1:
            cws = [f['w']]
        else:
            cws = [w0] + [4] * (fh - 2) + [f['w'] - w0 - 4 * (fh - 2)]
        if fv == 1:
            chs = [f['h']]
        else:
            chs = [h0] + [4] * (fv - 2) + [f['h'] - h0 - 4 * (fv - 2)]
        cells = []
        oy = f['top'] - by
        for y in range(fv):
            ox = f['left'] - bx
            for x in range(fh):
                cells.append((ox, oy, cws[x], chs[y]))  # xoff,yoff,w,h
                ox += cws[x]
            oy += chs[y]
        f['hc'], f['vc'], f['cells'] = fh, fv, cells

    # pixel buffer
    pbuf = []  # each: [values(4 list), frame, frame_cell_index]
    cell_buffer = [None] * (hcount * vcount)
    pixel_mask = 0
    for fi, f in enumerate(fr):
        ocx = (f['left'] - bx) // 4
        ocy = (f['top'] - by) // 4
        for cy in range(f['vc']):
            cur_y = cy + ocy
            for cx in range(f['hc']):
                cur = ocx + cx + cur_y * hcount
                if cell_buffer[cur] is not None:
                    tmp = ec.bits(1) if equal_size > 0 else 0
                    if tmp == 0:
                        pixel_mask = pm.bits(4)
                    else:
                        continue
                else:
                    pixel_mask = 0x0F
                stack = [0, 0, 0, 0]
                last = 0
                nbits = _PIXEL_MASK_LOOKUP[pixel_mask]
                enc = et.bits(1) if (nbits != 0 and enc_size > 0) else 0
                decoded = 0
                for i in range(nbits):
                    if enc:
                        stack[i] = rp.bits(8)
                    else:
                        stack[i] = last
                        disp = pcd.bits(4)
                        stack[i] += disp
                        while disp == 15:
                            disp = pcd.bits(4)
                            stack[i] += disp
                    if stack[i] == last:
                        stack[i] = 0
                        break
                    last = stack[i]
                    decoded += 1
                old = cell_buffer[cur]
                cur_idx = decoded - 1
                vals = [0, 0, 0, 0]
                for i in range(4):
                    if pixel_mask & (1 << i):
                        if cur_idx >= 0:
                            vals[i] = stack[cur_idx] & 0xFF
                            cur_idx -= 1
                        else:
                            vals[i] = 0
                    else:
                        vals[i] = old[0][i]
                entry = [vals, fi, cx + cy * f['hc']]
                pbuf.append(entry)
                cell_buffer[cur] = entry
    for e in pbuf:
        e[0] = [pal_entries[v] for v in e[0]]

    # generate frames
    for c in dir_cells:
        c[4] = c[5] = -1
    stride = bw
    dpix = bytearray(bw * bh)
    out = []
    pb = 0
    for fi, f in enumerate(fr):
        fpix = bytearray(bw * bh)
        for ci, (cxo, cyo, cw, chh) in enumerate(f['cells']):
            bc = dir_cells[(cxo // 4) + (cyo // 4) * hcount]
            pbe = pbuf[pb] if pb < len(pbuf) else None
            if pbe is None or pbe[1] != fi or pbe[2] != ci:
                if cw != bc[4] or chh != bc[5]:
                    for y in range(chh):
                        base = cxo + (y + cyo) * stride
                        for x in range(cw):
                            dpix[base + x] = 0
                else:
                    for fy in range(chh):
                        for fx in range(cw):
                            dpix[fx + cxo + (fy + cyo) * stride] = \
                                dpix[fx + bc[6] + (fy + bc[7]) * stride]
                    for fy in range(chh):
                        for fx in range(cw):
                            i = fx + cxo + (fy + cyo) * stride
                            fpix[i] = dpix[i]
            else:
                v = pbe[0]
                if v[0] == v[1]:
                    for y in range(chh):
                        base = cxo + (y + cyo) * stride
                        for x in range(cw):
                            dpix[base + x] = v[0]
                else:
                    nb = 2 if v[1] != v[2] else 1
                    for y in range(chh):
                        base = cxo + (y + cyo) * stride
                        for x in range(cw):
                            dpix[base + x] = v[pcd.bits(nb)]
                for fy in range(chh):
                    for fx in range(cw):
                        i = fx + cxo + (fy + cyo) * stride
                        fpix[i] = dpix[i]
                pb += 1
            bc[4], bc[5], bc[6], bc[7] = cw, chh, cxo, cyo
        out.append(fpix)

    if (ec.bits_read() != equal_size or pm.bits_read() != mask_size or
            et.bits_read() != enc_size or rp.bits_read() != raw_size):
        raise ValueError('dcc: bitstream size mismatch (corrupt or unsupported file)')
    end_bit = pcd.pos

    frames = []
    for fpix in out:
        arr = np.frombuffer(bytes(fpix), dtype=np.uint8).reshape(bh, bw).copy() if bw * bh else \
            np.zeros((bh, bw), dtype=np.uint8)
        frames.append({'w': bw, 'h': bh, 'ox': bx, 'oy': by, 'pix': arr, 'mask': arr != 0})
    return frames, end_bit


def read_dcc(data):
    """Decode a DCC file (d2dcc/*.go).

    -> {'dirs', 'frames_per_dir', 'frames': [dir][frame] -> Frame}, same shape
    as read_dc6.  Frame pix are palette indices, mask = pix != 0.  Direction
    index is the file order; see dir_to_compass().  See module docstring for
    ox/oy (shared canvas per direction).
    """
    data = bytes(data)
    if data[0] != 0x74:
        raise ValueError('dcc: signature expected to be 0x74')
    version = data[1]
    ndirs = data[2]
    fpd = struct.unpack_from('<i', data, 3)[0]
    if struct.unpack_from('<i', data, 7)[0] != 1:
        raise ValueError('dcc: tag value is not 1')
    offsets = struct.unpack_from('<%di' % ndirs, data, 15)
    frames = []
    for d in range(ndirs):
        fr, _ = _decode_dcc_direction(data, offsets[d] * 8, fpd)
        frames.append(fr)
    return {'dirs': ndirs, 'frames_per_dir': fpd, 'frames': frames, 'version': version}


# --------------------------------------------------------------------------
# direction naming
# --------------------------------------------------------------------------

_DIR4_DCC = [0] * 8 + [1] * 16 + [2] * 16 + [3] * 16 + [0] * 8
_DIR8_DCC = [4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5,
             5, 5, 5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 6, 6, 6, 6,
             6, 6, 6, 6, 2, 2, 2, 2, 2, 2, 2, 2, 7, 7, 7, 7,
             7, 7, 7, 7, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]
_DIR16_DCC = [4, 4, 8, 8, 8, 8, 0, 0, 0, 0, 9, 9, 9, 9, 5, 5,
              5, 5, 10, 10, 10, 10, 1, 1, 1, 1, 11, 11, 11, 11, 6, 6,
              6, 6, 12, 12, 12, 12, 2, 2, 2, 2, 13, 13, 13, 13, 7, 7,
              7, 7, 14, 14, 14, 14, 3, 3, 3, 3, 15, 15, 15, 15, 4, 4]
_DIR32_DCC = [4, 16, 16, 8, 8, 17, 17, 0, 0, 18, 18, 9, 9, 19, 19, 5,
              5, 20, 20, 10, 10, 21, 21, 1, 1, 22, 22, 11, 11, 23, 23, 6,
              6, 24, 24, 12, 12, 25, 25, 2, 2, 26, 26, 13, 13, 27, 27, 7,
              7, 28, 28, 14, 14, 29, 29, 3, 3, 30, 30, 15, 15, 31, 31, 4]
_DIR64_DCC = [4, 32, 16, 33, 8, 34, 17, 35, 0, 36, 18, 37, 9, 38, 19, 39,
              5, 40, 20, 41, 10, 42, 21, 43, 1, 44, 22, 45, 11, 46, 23, 47,
              6, 48, 24, 49, 12, 50, 25, 51, 2, 52, 26, 53, 13, 54, 27, 55,
              7, 56, 28, 57, 14, 58, 29, 59, 3, 60, 30, 61, 15, 62, 31, 63]
_DCC_TABLES = {4: _DIR4_DCC, 8: _DIR8_DCC, 16: _DIR16_DCC, 32: _DIR32_DCC, 64: _DIR64_DCC}


def _cof_table(n):
    # cof_dir_lookup.go: 4 -> same as dcc; 8/16/32/64 -> sequential buckets
    if n == 4:
        return _DIR4_DCC
    step = 64 // n
    half = step // 2
    return [((i + half) // step) % n if n != 64 else i for i in range(64)]


_COMPASS16 = ['S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
              'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE']


def dir_to_compass(dir_index, dir_count, kind='dcc'):
    """Screen compass name of file direction `dir_index` of `dir_count`.

    Convention (D2 / OpenDiablo2 dcc_dir_lookup.go): the engine's 64-step
    direction circle starts at 'S' (screen-down) at step 0 and runs clockwise
    on screen: S, SW, W, NW, N, NE, E, SE.  The DCC lookup for 8 directions
    then yields the well known D2 file order
        0=SW 1=NW 2=NE 3=SE 4=S 5=W 6=N 7=E
    (the file index interleaves the diagonals first).  Names for 16 dirs add
    SSW/WSW/... ; for 32 and 64 dirs the nearest 16-point name is returned.
    kind='dcc' uses dcc_dir_lookup.go; kind='cof' uses cof_dir_lookup.go,
    whose Go tables number the ring sequentially starting at S (0=S, 1=SW...),
    a different indexing than DCC for 8+ dirs - OD2 maps game direction to the
    COF priority row with that table.  *Not verified against real game files
    in this module* - check a real unit before trusting the exact mapping.
    """
    if dir_count not in _DCC_TABLES:
        raise ValueError('unsupported direction count %r' % (dir_count,))
    table = _DCC_TABLES[dir_count] if kind == 'dcc' else _cof_table(dir_count)
    idxs = [i for i, v in enumerate(table) if v == dir_index]
    if not idxs:
        raise ValueError('direction index %r out of range for %d dirs' % (dir_index, dir_count))
    sx = sum(math.cos(i * 2 * math.pi / 64) for i in idxs)
    sy = sum(math.sin(i * 2 * math.pi / 64) for i in idxs)
    ang = (math.atan2(sy, sx) * 360 / (2 * math.pi)) % 360
    return _COMPASS16[int(round(ang / 22.5)) % 16]


# --------------------------------------------------------------------------
# COF
# --------------------------------------------------------------------------

COMPOSITE_TYPES = ['HD', 'TR', 'LG', 'RA', 'LA', 'RH', 'LH', 'SH',
                   'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']


def _ctype(v):
    return COMPOSITE_TYPES[v] if v < len(COMPOSITE_TYPES) else 'T%d' % v


def read_cof(data):
    """Decode a COF file (d2cof/cof.go).

    -> {'layers': [{'type','shadow','selectable','transparent','draw_effect',
    'weapon_class'}], 'frames_per_dir','dirs','speed','animation_frames',
    'priority': [dir][frame] -> [layer type names in draw order]}.
    """
    data = bytes(data)
    nl, fpd, nd = data[0], data[1], data[2]
    speed = data[24]
    o = 25 + 3
    layers = []
    for _ in range(nl):
        b = data[o:o + 9]
        o += 9
        wc = b[5:9].replace(b'\x00', b'').decode('latin-1').strip()
        layers.append({'type': _ctype(b[0]), 'shadow': b[1], 'selectable': b[2] > 0,
                       'transparent': b[3] > 0, 'draw_effect': b[4], 'weapon_class': wc})
    anim = list(data[o:o + fpd])
    o += fpd
    pri = []
    for d in range(nd):
        row = []
        for f in range(fpd):
            row.append([_ctype(v) for v in data[o:o + nl]])
            o += nl
        pri.append(row)
    return {'layers': layers, 'frames_per_dir': fpd, 'dirs': nd, 'speed': speed,
            'animation_frames': anim, 'priority': pri}


# --------------------------------------------------------------------------
# DT1
# --------------------------------------------------------------------------

_XJUMP = (14, 12, 10, 8, 6, 4, 2, 0, 2, 4, 6, 8, 10, 12, 14)
_NBPIX = (4, 8, 12, 16, 20, 24, 28, 32, 28, 24, 20, 16, 12, 8, 4)


def read_dt1(data):
    """Decode a DT1 tile library (d2dt1/*.go) -> list of tile dicts.

    Tile keys: orientation (Go 'Type'; floor 0, walls 1-15, roof 15...),
    direction (Go 'Direction', first header int), main_index (Go Style),
    sub_index (Go Sequence), rarity (RarityFrameIndex), width, height (raw
    header values; walls are negative), y_offset (roof height, int16),
    material (raw uint16 flag word), subtile_flags (25 raw bytes; bit0 block
    walk, 1 LOS, 2 jump, 3 player walk, 5 light), y_min, pix, mask.

    Image origin: x = left edge of the tile (tile-space x=0); image row 0 is
    tile-space y = y_min, where y_min = min(0, min block y) (<= 0; walls rise
    above the tile origin, floors have y_min = 0).  The tile-space origin
    (0,0) is the top vertex of the floor diamond cell.  So to draw: place the
    image's top-left at (cell_x, cell_y + y_min).  Height = max(|height|, rows
    used) like OpenDiablo2's tile cache.  mask = pixels actually written by a
    block (index 0 inside a block is NOT treated as transparent).
    """
    data = bytes(data)
    major, minor = struct.unpack_from('<ii', data, 0)
    if (major, minor) != (7, 6):
        raise ValueError('dt1: expected version 7.6, got %d.%d' % (major, minor))
    ntiles, body = struct.unpack_from('<ii', data, 8 + 260)
    pos = body
    raw = []
    for _ in range(ntiles):
        (direction, roof, mat, height, width, _u1, ttype, style, seq, rarity) = \
            struct.unpack_from('<ihHiiiiiii', data, pos)
        # offsets: 0 dir,4 roof,6 mat,8 h,12 w,16 skip4,20 type,24 style,28 seq,32 rarity
        sub = list(data[pos + 40:pos + 65])
        bptr, bsize, nblocks = struct.unpack_from('<iii', data, pos + 72)
        raw.append((direction, roof, mat, height, width, ttype, style, seq, rarity,
                    sub, bptr, nblocks))
        pos += 96
    tiles = []
    for (direction, roof, mat, height, width, ttype, style, seq, rarity,
         sub, bptr, nblocks) in raw:
        blocks = []
        for b in range(nblocks):
            bx, by = struct.unpack_from('<hh', data, bptr + b * 20)
            gx, gy = data[bptr + b * 20 + 6], data[bptr + b * 20 + 7]
            fmt, length = struct.unpack_from('<hi', data, bptr + b * 20 + 8)
            foff = struct.unpack_from('<i', data, bptr + b * 20 + 16)[0]
            enc = data[bptr + foff:bptr + foff + length]
            blocks.append((bx, by, fmt, enc))
        y_min = min([0] + [b[1] for b in blocks])
        w = max([abs(width)] + [b[0] + 32 for b in blocks]) if blocks else abs(width)
        big_h = (max([b[1] for b in blocks]) - y_min + 40) if blocks else 0
        big_h = max(big_h, abs(height))
        pix = np.zeros((big_h, w), dtype=np.uint8)
        mask = np.zeros((big_h, w), dtype=bool)
        last_row = -1
        for (bx, by, fmt, enc) in blocks:
            if fmt == 1:  # isometric: 15 rows of 4..32 bytes
                idx = 0
                for y in range(15):
                    n = _NBPIX[y]
                    x0 = bx + _XJUMP[y]
                    r = by + y - y_min
                    if idx + n > len(enc):
                        break
                    pix[r, x0:x0 + n] = np.frombuffer(enc[idx:idx + n], dtype=np.uint8)
                    mask[r, x0:x0 + n] = True
                    idx += n
                    last_row = max(last_row, r)
            else:  # RLE
                x = 0
                y = 0
                i = 0
                n = len(enc)
                while i + 1 < n:
                    b1, b2 = enc[i], enc[i + 1]
                    i += 2
                    if b1 == 0 and b2 == 0:
                        x = 0
                        y += 1
                        continue
                    x += b1
                    seg = enc[i:i + b2]
                    i += b2
                    r = by + y - y_min
                    xs = bx + x
                    if len(seg) and 0 <= r < big_h and xs < w:
                        k = min(len(seg), w - xs)
                        pix[r, xs:xs + k] = np.frombuffer(seg, dtype=np.uint8)[:k]
                        mask[r, xs:xs + k] = True
                        last_row = max(last_row, r)
                    x += b2
        h = max(abs(height), last_row + 1)
        tiles.append({'orientation': ttype, 'direction': direction, 'main_index': style,
                      'sub_index': seq, 'rarity': rarity, 'width': width, 'height': height,
                      'y_offset': roof, 'material': mat, 'subtile_flags': sub,
                      'y_min': y_min, 'pix': pix[:h].copy(), 'mask': mask[:h].copy()})
    return tiles


# --------------------------------------------------------------------------
# DS1
# --------------------------------------------------------------------------

_DIR_LOOKUP = [0x00, 0x01, 0x02, 0x01, 0x02, 0x03, 0x03, 0x05, 0x05, 0x06,
               0x06, 0x07, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,
               0x0F, 0x10, 0x11, 0x12, 0x14]


def _tile_layer(dwords, w, h, orient=None):
    out = []
    for y in range(h):
        row = []
        for x in range(w):
            dw = int(dwords[y * w + x])
            t = {'prop1': dw & 0xFF, 'sequence': (dw >> 8) & 0x3F,
                 'unknown1': (dw >> 14) & 0x3F, 'style': (dw >> 20) & 0x3F,
                 'unknown2': (dw >> 26) & 0x1F, 'hidden': (dw >> 31) & 1}
            if orient is not None:
                t['orientation'] = int(orient[y * w + x])
            row.append(t)
        out.append(row)
    return out


def read_ds1(data):
    """Decode a DS1 map stamp (d2ds1/ds1.go).

    -> {'version','width','height','act','substitution_type','files',
    'walls','floors','shadows','substitutions','substitution_groups',
    'objects'}.  walls/floors/shadows are [layer][y][x] of tile records
    {prop1,sequence,unknown1,style,unknown2,hidden[,orientation]} (orientation
    only for walls, decoded from the paired orientation layer, remapped through
    the legacy table when version < 7).  'substitutions' is [layer][y][x] of
    raw uint32.  objects: {type,id,x,y,flags,paths:[{x,y,action}]}.
    Versions < 4 follow ds1.go's 'standard layers' schema (1 wall+orientation,
    1 floor, 1 shadow, 1 substitution); that path is untested.
    """
    data = bytes(data)
    o = [0]

    def i32():
        v = struct.unpack_from('<i', data, o[0])[0]
        o[0] += 4
        return v

    version = i32()
    width = i32() + 1
    height = i32() + 1
    act = 1
    if version >= 8:
        act = min(5, i32() + 1)
    subtype = 0
    if version >= 10:
        subtype = i32()
    files = []
    if version >= 3:
        for _ in range(i32()):
            e = data.index(b'\x00', o[0])
            files.append(data[o[0]:e].decode('latin-1'))
            o[0] = e + 1
    nwalls, nfloors, nshadows, nsubs = 0, 1, 1, 0
    if subtype in (1, 2):
        nsubs = 1
    if 9 <= version <= 13:
        o[0] += 8
    if version >= 4:
        nwalls = i32()
        if version >= 16:
            nfloors = i32()
    else:
        nwalls, nfloors, nshadows, nsubs = 1, 1, 1, 1

    n = width * height
    schema = []
    if version < 4:
        schema = [('wall', 0), ('floor', 0), ('orient', 0), ('sub', 0), ('shadow', 0)]
    else:
        for i in range(nwalls):
            schema.append(('wall', i))
            schema.append(('orient', i))
        for i in range(nfloors):
            schema.append(('floor', i))
        if nshadows > 0:
            schema.append(('shadow', 0))
        if nsubs > 0:
            schema.append(('sub', 0))
    wall_d, orient_d, floor_d, shadow_d, sub_d = {}, {}, {}, {}, {}
    for kind, idx in schema:
        arr = np.frombuffer(data, dtype='<u4', count=n, offset=o[0])
        o[0] += 4 * n
        if kind == 'wall':
            wall_d[idx] = arr
        elif kind == 'orient':
            if version < 7:
                oa = np.array([_DIR_LOOKUP[c] if c < len(_DIR_LOOKUP) else c
                               for c in (arr & 0xFF).tolist()], dtype=np.int32)
            else:
                oa = (arr & 0xFF).astype(np.int32)
            orient_d[idx] = oa
        elif kind == 'floor':
            floor_d[idx] = arr
        elif kind == 'shadow':
            shadow_d[idx] = arr
        else:
            sub_d[idx] = arr

    objects = []
    if version >= 3:
        for _ in range(i32()):
            t, oid, x, y, fl = struct.unpack_from('<iiiii', data, o[0])
            o[0] += 20
            objects.append({'type': t, 'id': oid, 'x': x, 'y': y, 'flags': fl, 'paths': []})

    groups = []
    if version >= 12 and subtype in (1, 2):
        if version >= 18:
            o[0] += 4
        for _ in range(i32()):
            tx, ty, tw, th, unk = struct.unpack_from('<iiiii', data, o[0])
            o[0] += 20
            groups.append({'x': tx, 'y': ty, 'w': tw, 'h': th, 'unknown': unk})

    if version > 14 and o[0] + 4 <= len(data):
        for _ in range(i32()):
            npaths, nx, ny = struct.unpack_from('<iii', data, o[0])
            o[0] += 12
            target = None
            for ob in objects:
                if ob['x'] == nx and ob['y'] == ny:
                    target = ob
                    break
            per = 12 if version > 15 else 8
            if target is None:
                o[0] += npaths * per  # ds1.go skips 3/2 bytes per path, which looks like a bug
                continue
            for _p in range(npaths):
                px, py = struct.unpack_from('<ii', data, o[0])
                o[0] += 8
                act_ = 0
                if version > 15:
                    act_ = i32()
                target['paths'].append({'x': px, 'y': py, 'action': act_})

    walls = [_tile_layer(wall_d[i], width, height, orient_d.get(i)) for i in sorted(wall_d)]
    floors = [_tile_layer(floor_d[i], width, height) for i in sorted(floor_d)]
    shadows = [_tile_layer(shadow_d[i], width, height) for i in sorted(shadow_d)]
    subs = [[[int(v) for v in sub_d[i][y * width:(y + 1) * width]] for y in range(height)]
            for i in sorted(sub_d)]
    return {'version': version, 'width': width, 'height': height, 'act': act,
            'substitution_type': subtype, 'files': files, 'walls': walls,
            'floors': floors, 'shadows': shadows, 'substitutions': subs,
            'substitution_groups': groups, 'objects': objects}
