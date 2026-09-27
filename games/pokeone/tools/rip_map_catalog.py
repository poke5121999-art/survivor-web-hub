# -*- coding: utf-8 -*-
"""Tờ ảnh thu nhỏ của MỌI prefab bản đồ (mdata..mdata7) để người chọn thêm prop. Ra ngoài repo.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_map_catalog.py            # mọi prefab
    python games/pokeone/tools/rip_map_catalog.py tree_2     # vài prefab, ra ảnh lẻ để xem nhanh

Ra D:\\pokeone-ref\\catalog\\props\\props_NNN.png (lưới 10x8) + index.tsv (tên, bundle, tờ, cỡ AABB).
Vẽ bằng bộ rasterizer numpy đơn giản (z-buffer, lấy mẫu ảnh gần nhất, cắt alpha), nhìn chéo từ
phía nam-tây, trên cao; không cần trình duyệt. Chỉ để nhận mặt, không phải ảnh chuẩn màu.
"""
import os, sys, time, traceback

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rip_map_core as core

OUT = r'D:\pokeone-ref\catalog\props'
RS, TS = 256, 128           # cỡ vẽ, cỡ thu nhỏ
COLS, ROWS = 10, 8
CW, CH = 150, 176           # ô trên tờ
LEGACY = 16.6               # một ô lưới của nhóm prefab cũ (xem README-map.md)

# Hướng nhìn: từ nam-tây, trên cao (máy ảnh Unity nhìn về +z, chúc xuống).
_yaw, _pitch = np.radians(-30), np.radians(35)
FWD = np.array([np.cos(_pitch) * np.sin(-_yaw), -np.sin(_pitch), np.cos(_pitch) * np.cos(_yaw)])
RIGHT = np.cross([0, 1, 0], FWD)
RIGHT /= np.linalg.norm(RIGHT)
UP = np.cross(FWD, RIGHT)
LIGHT = -np.array([0.4, -0.8, 0.45])
LIGHT /= np.linalg.norm(LIGHT)


class Tex:
    def __init__(self):
        self.cache = {}

    def get(self, ptr):
        if ptr is None:
            return None
        k = (ptr.assets_file.name if hasattr(ptr, 'assets_file') else '', ptr.m_FileID, ptr.m_PathID)
        if k not in self.cache:
            try:
                im = ptr.read().image.convert('RGBA')
                if max(im.size) > 128:
                    f = 128 / max(im.size)
                    im = im.resize((max(1, int(im.width * f)), max(1, int(im.height * f))), Image.BILINEAR)
                self.cache[k] = np.asarray(im, dtype=np.float32) / 255.0
            except Exception:
                self.cache[k] = None
            if len(self.cache) > 3000:
                self.cache.pop(next(iter(self.cache)))
        return self.cache[k]


_DESC = {}


def desc(mat):
    k = core.key_of(mat)
    if k not in _DESC:
        _DESC[k] = core.material_desc(mat)
    return _DESC[k]


def render(parts, tex):
    """[Part] -> ảnh RGBA TSxTS."""
    allv = np.vstack([p.pos[np.unique(p.tri)] for p in parts])
    sx, sy = allv @ RIGHT, allv @ UP
    cx, cy = (sx.min() + sx.max()) / 2, (sy.min() + sy.max()) / 2
    ext = max(sx.max() - sx.min(), sy.max() - sy.min(), 1e-6) * 1.08
    k = RS / ext
    color = np.zeros((RS, RS, 3), np.float32)
    alpha = np.zeros((RS, RS), np.float32)
    zbuf = np.full((RS, RS), np.inf, np.float32)
    order = sorted(parts, key=lambda p: desc(p.mat)['mode'] == 'BLEND')
    for p in order:
        d = desc(p.mat)
        if d['extras'].get('additive'):
            continue
        img = tex.get(d['tex'])
        base = np.array(d['color'][:3], np.float32)
        V = p.pos
        X = (V @ RIGHT - cx) * k + RS / 2
        Y = RS / 2 - (V @ UP - cy) * k
        Z = V @ FWD
        tri = p.tri
        a, b, c = V[tri[:, 0]], V[tri[:, 1]], V[tri[:, 2]]
        n = np.cross(b - a, c - a)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        shade = 0.55 + 0.45 * np.abs(n @ LIGHT)
        uv = None
        if img is not None and p.uv is not None:
            s0, s1, o0, o1 = d['st']
            uv = p.uv * [s0, s1] + [o0, o1]
        vc = p.col[:, :3].astype(np.float32) if (d['vcol'] and p.col is not None) else None
        cut = d['cutoff'] if d['mode'] == 'MASK' else (0.25 if d['mode'] == 'BLEND' else -1)
        th, tw = (img.shape[0], img.shape[1]) if img is not None else (1, 1)
        for i in range(len(tri)):
            i0, i1, i2 = tri[i]
            xs = (X[i0], X[i1], X[i2])
            ys = (Y[i0], Y[i1], Y[i2])
            x0, x1 = int(max(0, np.floor(min(xs)))), int(min(RS - 1, np.ceil(max(xs))))
            y0, y1 = int(max(0, np.floor(min(ys)))), int(min(RS - 1, np.ceil(max(ys))))
            if x0 > x1 or y0 > y1:
                continue
            den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(den) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
            w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
            w2 = 1 - w0 - w1
            m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            if not m.any():
                continue
            z = w0 * Z[i0] + w1 * Z[i1] + w2 * Z[i2]
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]
            m &= z < sub
            if not m.any():
                continue
            if uv is not None:
                u = w0 * uv[i0, 0] + w1 * uv[i1, 0] + w2 * uv[i2, 0]
                v = w0 * uv[i0, 1] + w1 * uv[i1, 1] + w2 * uv[i2, 1]
                tx = (np.mod(u, 1.0) * tw).astype(np.int32).clip(0, tw - 1)
                ty = ((1 - np.mod(v, 1.0)) * th).astype(np.int32).clip(0, th - 1)
                texel = img[ty, tx]
                rgb, al = texel[..., :3] * base, texel[..., 3]
            else:
                rgb = np.broadcast_to(base, m.shape + (3,))
                al = np.ones(m.shape, np.float32)
            if cut >= 0:
                m &= al >= cut
                if not m.any():
                    continue
            if vc is not None:
                rgb = rgb * (w0[..., None] * vc[i0] + w1[..., None] * vc[i1] + w2[..., None] * vc[i2])
            sub[m] = z[m]
            color[y0:y1 + 1, x0:x1 + 1][m] = (rgb * shade[i])[m]
            alpha[y0:y1 + 1, x0:x1 + 1][m] = 1.0
    out = np.dstack([np.clip(color, 0, 1), alpha])
    im = Image.fromarray((out * 255).astype(np.uint8), 'RGBA')
    return im.resize((TS, TS), Image.LANCZOS)


def font(sz):
    for f in ('arial.ttf', 'segoeui.ttf'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def bundle_no(path):
    import re
    m = re.search(r'assetbundles/mapassets(\d*)/', path)
    return (m.group(1) or '1') if m else 'r'


def thumb_cell(name, path, img, size, note):
    cell = Image.new('RGB', (CW, CH), (58, 62, 70))
    chk = Image.new('RGB', (TS, TS), (86, 92, 102))
    if img is not None:
        chk.paste(img, (0, 0), img)
    cell.paste(chk, ((CW - TS) // 2, 4))
    d = ImageDraw.Draw(cell)
    f = font(11)
    label = '%s' % name
    lines, cur = [], ''
    for ch in label:
        if d.textlength(cur + ch, font=f) > CW - 6:
            lines.append(cur)
            cur = ''
        cur += ch
    lines.append(cur)
    y = TS + 6
    for ln in lines[:2]:
        d.text((3, y), ln, fill=(240, 240, 240), font=f)
        y += 12
    d.text((3, y), note, fill=(160, 200, 255), font=font(10))
    return cell


def main():
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    env = core.load_map_env()
    idx = core.prefab_index(env)
    items = sorted(((name, path, ptr) for name, lst in idx.items() for path, ptr in lst),
                   key=lambda x: (x[0], x[1]))
    only = set()
    for a in sys.argv[1:]:
        if a.startswith('@'):
            only |= {ln.strip() for ln in open(a[1:], encoding='utf-8') if ln.strip()}
        else:
            only.add(a)
    if only:
        items = [x for x in items if x[0] in only]
    tex = Tex()
    rows, cells = [], []
    for n, (name, path, ptr) in enumerate(items):
        img, note, size = None, '', None
        try:
            parts, st = core.collect(ptr.read())
            if parts:
                lo, hi = core.aabb(parts)
                size = hi - lo
                img = render(parts, tex)
                legacy = max(size) > 12
                f = 1 / LEGACY if legacy else 1
                note = 'm%s %s %.1fx%.1fx%.1f' % (bundle_no(path), 'L' if legacy else '', *(size * f))
            else:
                note = 'm%s (rỗng)' % bundle_no(path)
        except Exception as e:
            note = 'ERR %s' % str(e)[:30]
            traceback.print_exc()
        cells.append(thumb_cell(name, path, img, size, note))
        rows.append((name, bundle_no(path), path, len(cells) - 1, note))
        if (n + 1) % 100 == 0:
            print('%d/%d %.0fs' % (n + 1, len(items), time.time() - t0), flush=True)
    per = COLS * ROWS
    for s in range(0, len(cells), per):
        sheet = Image.new('RGB', (COLS * CW, ROWS * CH), (30, 32, 36))
        for i, c in enumerate(cells[s:s + per]):
            sheet.paste(c, ((i % COLS) * CW, (i // COLS) * CH))
        fn = 'props_%03d.png' % (s // per) if not only else 'pick_%03d.png' % (s // per)
        sheet.save(os.path.join(OUT, fn), optimize=True)
    if not only:
        with open(os.path.join(OUT, 'index.tsv'), 'w', encoding='utf-8') as fh:
            fh.write('name\tbundle\tsheet\tcell\tnote\tcontainer\n')
            for name, b, path, i, note in rows:
                fh.write('%s\tmdata%s\tprops_%03d.png\t%d\t%s\t%s\n' % (name, '' if b == '1' else b, i // per, i % per, note, path))
    print('xong %d prefab, %.0fs' % (len(items), time.time() - t0))


if __name__ == '__main__':
    main()
