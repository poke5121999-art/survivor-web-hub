# -*- coding: utf-8 -*-
"""Lever for the Diablo II world assets: tile atlases + DS1 stamps.

Reads D2R data (D:/d2r-ref) and writes
    assets/world.js            window.D2_WORLD.tilesets.{act1,act1cave}  (see brain/plans/diablo2-d2r.md)
    assets/maps.js             window.D2_MAPS, window.D2_PRESETS
    assets/img/tiles_<set>_<n>.webp

DS1 set = LvlPrest def 1 (town) + 2..52 (wilderness stamps) -> tileset 'act1',
          def 53..107 (Act 1 caves)                         -> tileset 'act1cave'.
Rerunnable and deterministic (stable iteration order, no randomness).

Why two tilesets and style aliases: one DT1 key space (orientation_style_sequence) cannot hold
town/wilderness tiles and cave tiles at once, because different DT1 files reuse the same keys
(real D2 resolves tiles per DS1 file list). Inside a set, a style whose keys clash with an earlier
DS1 gets an alias style (64+). Style 0 is always aliased: layer value 0 means 'empty', so
style 0 / sequence 0 would be indistinguishable from it. Consumers must read the style as
(t >> 8) & 0xff and the variant as t >> 16.
"""
from __future__ import print_function
import hashlib
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2fmt  # noqa: E402
import d2pack  # noqa: E402

G = 'D:/d2r-ref/fs/data/data/global/'
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
IMG = os.path.join(OUT, 'img')
BUDGET = 15 * 1024 * 1024
ALIAS_BASE = 64

_dt1_cache = {}


def dt1_tiles(path):
    if path not in _dt1_cache:
        _dt1_cache[path] = d2fmt.read_dt1(open(G + path, 'rb').read())
    return _dt1_cache[path]


_idx_cache = {}


def dt1_index(path):
    if path not in _idx_cache:
        ix = {}
        for t in dt1_tiles(path):
            ix.setdefault((t['orientation'], t['main_index'], t['sub_index']), []).append(t)
        _idx_cache[path] = ix
    return _idx_cache[path]


def norm_dt1(fn):
    q = fn.lower().replace(chr(92), '/').replace('.tg1', '.dt1')
    q = re.sub(r'^.*?/tiles/', 'tiles/', q)
    return q


def read_lvlprest():
    rows = []
    lines = io.open(G + 'excel/lvlprest.txt', encoding='latin-1').read().split('\n')
    h = lines[0].rstrip('\r').split('\t')
    for l in lines[1:]:
        c = l.rstrip('\r').split('\t')
        if len(c) < 17 or not c[1].isdigit():
            continue
        r = dict(zip(h, c))
        d = int(r['Def'])
        if d < 1 or d > 107:
            continue
        files = [r['File%d' % i] for i in range(1, 7) if r.get('File%d' % i, '0') not in ('0', '')]
        rows.append({'def': d, 'name': r['Name'], 'files': files, 'sizeX': int(r['SizeX']),
                     'sizeY': int(r['SizeY']), 'outdoors': r['Outdoors'] == '1'})
    return rows


def lvltype_files(type_id):
    lines = io.open(G + 'excel/lvltypes.txt', encoding='latin-1').read().split('\n')
    for l in lines[1:]:
        c = l.rstrip('\r').split('\t')
        if len(c) > 3 and c[1] == str(type_id):
            return ['tiles/' + f.lower() for f in c[2:34] if f not in ('0', '')]
    raise KeyError(type_id)


class TileSet(object):
    def __init__(self, name):
        self.name = name
        self.reg = {}        # (o, style, seq) -> (providers tuple, [tile dicts])
        self.alias = {}      # (style, providers sig) -> style actually written
        self.next_alias = ALIAS_BASE
        self.flags = []
        self.flag_idx = {}

    def resolve(self, libs, refs, label):
        """refs: set of (o, style, seq). Returns {(o,style,seq) -> (o, aliasStyle, seq)} for found keys."""
        prov = {}
        for k in refs:
            ps = tuple(sorted(p for p in libs if k in dt1_index(p)))
            if ps:
                prov[k] = ps
        out = {}
        for s in sorted(set(k[1] for k in prov)):
            ks = sorted(k for k in prov if k[1] == s)
            sig = (s, tuple(sorted(set(p for k in ks for p in prov[k]))))
            if sig in self.alias:
                a = self.alias[sig]
            else:
                a = None
                if s != 0 and all(k not in self.reg or self.reg[k][0] == prov[k] for k in ks):
                    a = s
                if a is None:
                    a = self.next_alias
                    self.next_alias += 1
                    assert a < 256, 'alias styles exhausted'
                self.alias[sig] = a
            for k in ks:
                nk = (k[0], a, k[2])
                if nk in self.reg and self.reg[nk][0] != prov[k]:
                    raise RuntimeError('%s: key clash %s vs %s in %s' % (self.name, nk, self.reg[nk][0], label))
                if nk not in self.reg:
                    vs = [t for p in prov[k] for t in dt1_index(p)[k]]
                    self.reg[nk] = (prov[k], vs)
                out[k] = nk
        return out

    def flags_index(self, sub):
        key = tuple(int(v) for v in sub)
        if key not in self.flag_idx:
            self.flag_idx[key] = len(self.flags)
            self.flags.append(list(key))
        return self.flag_idx[key]


def ds1_refs(ds):
    refs = set()
    for layer in ds['walls']:
        for row in layer:
            for r in row:
                # hidden warp markers (orientation 10/11) still carry the level exits
                if r['prop1'] and (not r['hidden'] or r['orientation'] in (10, 11)):
                    o = r['orientation']
                    refs.add((o, r['style'], r['sequence']))
                    if o == 3:
                        refs.add((4, r['style'], r['sequence']))
    for layer in ds['floors']:
        for row in layer:
            for r in row:
                if r['prop1'] and not r['hidden']:
                    refs.add((0, r['style'], r['sequence']))
    for layer in ds['shadows']:
        for row in layer:
            for r in row:
                if r['prop1'] and not r['hidden']:
                    refs.add((13, r['style'], r['sequence']))
    return refs


def flat(layer, kind, w, h, mp, orient=False):
    t = []
    o = []
    for y in range(h):
        for x in range(w):
            r = layer[y][x]
            v = 0
            ori = 0
            if r['prop1'] and (not r['hidden'] or (kind == 'wall' and r['orientation'] in (10, 11))):
                ori = r['orientation'] if kind == 'wall' else (0 if kind == 'floor' else 13)
                k = mp.get((ori, r['style'], r['sequence']))
                if k is not None:
                    v = (k[1] << 8) | k[2]
                else:
                    ori = 0
            t.append(v)
            o.append(ori if v else 0)
    return (t, o) if orient else t


def build():
    rows = read_lvlprest()
    sets = {'act1': TileSet('act1'), 'act1cave': TileSet('act1cave')}
    maps = {}
    presets = {}
    miss = {}
    for row in rows:
        d = row['def']
        ts = sets['act1'] if d <= 52 else sets['act1cave']
        keys = []
        for f in row['files']:
            key = f.lower().replace('.ds1', '')
            keys.append(key)
            ds = d2fmt.read_ds1(open(G + 'tiles/' + f.lower(), 'rb').read())
            libs = []
            for fn in ds['files']:
                q = norm_dt1(fn)
                if os.path.exists(G + q):
                    libs.append(q)
            libs = sorted(set(libs))
            refs = ds1_refs(ds)
            mp = ts.resolve(libs, refs, key)
            lost = sorted(k for k in refs if k not in mp)
            if lost:
                miss[key] = lost
            W, H = ds['width'], ds['height']
            m = {'w': W, 'h': H,
                 'floors': [flat(L, 'floor', W, H, mp) for L in ds['floors']],
                 'walls': [], 'shadows': [flat(L, 'shadow', W, H, mp) for L in ds['shadows']],
                 'objects': [{'type': o['type'], 'id': o['id'], 'x': o['x'], 'y': o['y']} for o in ds['objects']]}
            for L in ds['walls']:
                t, o = flat(L, 'wall', W, H, mp, True)
                m['walls'].append({'t': t, 'o': o})
            maps[key] = m
        presets[d] = {'name': row['name'], 'files': keys, 'sizeX': row['sizeX'], 'sizeY': row['sizeY'],
                      'outdoors': row['outdoors']}
    # wilderness grass: Town/Floor.dt1 style 0 seq 0, picked by the LevelType-2 file list
    wild_libs = sorted(p for p in lvltype_files(2) if os.path.exists(G + p))
    gm = sets['act1'].resolve(wild_libs, {(0, 0, 0)}, 'grass')
    gk = gm[(0, 0, 0)]
    grass_t = (gk[1] << 8) | gk[2]
    return rows, sets, maps, presets, miss, grass_t


class FullAtlas(d2pack.Atlas):
    """d2pack.Atlas without the alpha trim: the engine draws the variant's own w x h at (px-80, py+dy)."""

    def add(self, rgba, ax, ay):
        rect = []
        self.items.append((rgba, 0, 0, rect))
        return rect


def pack_tileset(ts, pal):
    atlas = FullAtlas('tiles_' + ts.name, IMG, 'assets/img')
    seen = {}
    entries = []   # (key, rect, yMin, rarity, flagsIdx, roofH)
    for key in sorted(ts.reg):
        o, s, q = key
        for t in ts.reg[key][1]:
            fi = ts.flags_index(t['subtile_flags'])
            ymin = t['y_min']
            roof = t['y_offset'] if o == 15 else 0
            flat_fill = o not in (0, 13) and t['mask'].any() and len(np.unique(t['pix'][t['mask']])) == 1
            if o in (10, 11) or flat_fill:
                # flat_fill: solid-colour placeholder walls at map edges (town SE corner); keep flags, draw nothing
                entries.append((key, [0, 0, 0, 0], 0, t['rarity'], fi, 0, None))
                continue
            rgba = d2fmt.to_rgba(t['pix'], t['mask'], pal)
            if o == 13:
                rgba[..., :3] = 0
                rgba[..., 3] = np.where(t['mask'], 255, 0)
            digest = hashlib.sha1(rgba.tobytes() + str(rgba.shape).encode()).hexdigest()
            if digest in seen:
                rect = seen[digest]
            else:
                rect = atlas.add(rgba, 0, 0)
                seen[digest] = rect
            entries.append((key, rect, ymin - roof, t['rarity'], fi, roof, rect))
    pages = atlas.save(lossless=True)
    tiles = {}
    for key, rect, ymin, rar, fi, roof, real in entries:
        k = '%d_%d_%d' % key
        if real is None:
            row = [0, 0, 0, 0, 0, rar, 0, fi]
        else:
            row = [rect[0], rect[1], rect[2], rect[3], ymin, rar, rect[6], fi]
        if roof:
            row.append(roof)
        tiles.setdefault(k, []).append(row)
    return {'pages': pages, 'tiles': tiles, 'flags': ts.flags, 'palette': 'act1'}


def js_wrap(name, obj):
    body = json.dumps(obj, separators=(',', ':'), sort_keys=True)
    return '/* generated by _tools/build_world.py, do not edit */\n(function(g){g.%s=%s;})(typeof window!=="undefined"?window:globalThis);\n' % (name, body)


def main():
    pal = d2fmt.load_palette(G + 'palette/act1/pal.dat')
    rows, sets, maps, presets, miss, grass_t = build()
    for fn in os.listdir(IMG) if os.path.isdir(IMG) else []:
        if fn.startswith('tiles_act1') and fn.endswith('.webp'):
            os.remove(os.path.join(IMG, fn))
    world = {'tilesets': {}}
    for name in ('act1', 'act1cave'):
        world['tilesets'][name] = pack_tileset(sets[name], pal)
    world['tilesets']['act1']['grass'] = grass_t
    with io.open(os.path.join(OUT, 'world.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js_wrap('D2_WORLD', world))
    with io.open(os.path.join(OUT, 'maps.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js_wrap('D2_MAPS', maps).replace('\n(function(g){g.D2_MAPS', '\n(function(g){g.D2_PRESETS=' +
                                                  json.dumps(presets, separators=(',', ':'), sort_keys=True) +
                                                  ';g.D2_MAPS', 1))
    total = 0
    for fn in sorted(os.listdir(IMG)):
        if fn.startswith('tiles_act1') and fn.endswith('.webp'):
            total += os.path.getsize(os.path.join(IMG, fn))
    ntiles = sum(len(v) for ts in world['tilesets'].values() for v in ts['tiles'].values())
    print('ds1 maps %d, tile variants %d, flag tables %s' % (
        len(maps), ntiles, {k: len(v['flags']) for k, v in world['tilesets'].items()}))
    print('pages %s' % {k: len(v['pages']) for k, v in world['tilesets'].items()})
    print('aliases %s' % {k: sets[k].next_alias - ALIAS_BASE for k in sets})
    print('tiles webp %.2f MB (budget %.0f MB)' % (total / 1048576.0, BUDGET / 1048576.0))
    print('world.js %d B, maps.js %d B' % (os.path.getsize(os.path.join(OUT, 'world.js')),
                                           os.path.getsize(os.path.join(OUT, 'maps.js'))))
    print('referenced keys without a DT1 tile: %d across %d ds1' % (sum(len(v) for v in miss.values()), len(miss)))
    for k in sorted(miss)[:6]:
        print('  ', k, miss[k][:4])
    if total > BUDGET:
        print('OVER BUDGET')
        sys.exit(1)


if __name__ == '__main__':
    main()
