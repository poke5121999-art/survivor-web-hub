# -*- coding: utf-8 -*-
"""Lever: Diablo II Act I character / monster / NPC sprites -> assets/sprites.js + assets/img/{hero,mon,npc}_*.webp

Rerunnable and deterministic (sorted keys, ordered pools, lossless WebP).  Contract:
brain/plans/diablo2-d2r.md "Hop dong sprite".

    PYTHONIOENCODING=utf-8 python build_sprites.py [--only mon,npc,hero] [--estimate] [--dirs 8|16]

Reads only the extracted D2R tree (GLOBAL).  Python 3.8 + numpy + Pillow.
"""
from __future__ import print_function

import glob
import io
import json
import math
import multiprocessing
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2anim  # noqa: E402
import d2fmt  # noqa: E402
import d2pack  # noqa: E402

GLOBAL = os.environ.get('D2_GLOBAL', r'D:\d2r-ref\fs\data\data\global')
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
IMG = os.path.join(ASSETS, 'img')
WEB_IMG = 'assets/img'

# ---------------------------------------------------------------------------
# hero profile.  The full set the brief asks for (every mode x wclass x token) is ~380 MB of DCC
# for 7 classes; the 25 MB budget forces this cut.  Everything else is derived from disk + excel.
# ---------------------------------------------------------------------------
HERO_DIRS = 8
# TH, KK and S1..S4 are dropped (budget): the engine falls back to A1/SC.
HERO_MODES = ['NU', 'WL', 'RN', 'TN', 'TW', 'A1', 'A2', 'GH', 'DT', 'DD', 'BL', 'SC']
HERO_CLASSES = ['AM', 'SO', 'NE', 'PA', 'BA', 'DZ', 'AI']
HERO_WCLASSES = {
    'AM': ['hth', '1ht', '2ht', 'bow'],
    'SO': ['hth', '1hs', 'stf'],
    'NE': ['hth', '1hs', 'stf'],
    'PA': ['hth', '1hs', '2hs'],
    'BA': ['hth', '1hs', '2hs'],
    'DZ': ['hth', '1hs', 'stf'],
    'AI': ['hth', 'ht1', 'ht2'],
}
ARMOR_TOKENS = ['lit', 'med', 'hvy']          # TR only
TR_TOKENS = ARMOR_TOKENS
OTHER_ARMOR_TOKENS = ['lit']                  # LG RA LA S1..S8
HEAD_GENERIC = 3                              # first N normal-tier helms present for the class
HEAD_CLASS = 1                                # first N class-specific head items (pelt/phlm/head...)
SHIELD_PICKS = 3
WEAPON_PICKS = {'1hs': 4, '1ht': 3, '2hs': 3, '2ht': 3, 'bow': 3, 'xbw': 2, 'stf': 3,
                'hth': 0, 'ht1': 3, 'ht2': 3}
WEAPON_MAXLVL = 30

MON_MODES = ['DT', 'NU', 'WL', 'GH', 'A1', 'A2', 'BL', 'SC', 'S1', 'S2', 'S3', 'S4', 'DD', 'KB',
             'SQ', 'RN']
MON_COMPS = ['HD', 'TR', 'LG', 'RA', 'LA', 'RH', 'LH', 'SH', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6',
             'S7', 'S8']
SUPERS_IN_RANGE = ['Bishibosh', 'Rakanishu', 'Treehead WoodFist', 'Corpsefire']
TOWN_EXTRA = ['cain1']          # Cain is quest-placed, not a type-1 object of towne1.ds1
LEVELS = range(1, 9)


def gp(*parts):
    return os.path.join(GLOBAL, *parts)


def rd_txt(name):
    with io.open(gp('excel', name + '.txt'), encoding='latin-1') as f:
        lines = f.read().split('\n')
    head = lines[0].rstrip('\r').split('\t')
    return [dict(zip(head, ln.rstrip('\r').split('\t'))) for ln in lines[1:] if ln.strip()]


# ---------------------------------------------------------------------------
# directions
# ---------------------------------------------------------------------------
_ANG = {}


def file_angles(n):
    """Angle in degrees (0 = screen S, clockwise on screen: S SW W NW N NE E SE) of every file
    direction of an n-direction DCC/COF; same maths as d2fmt.dir_to_compass but unrounded."""
    if n in _ANG:
        return _ANG[n]
    if n == 1:
        out = [0.0]
    else:
        table = d2fmt._DCC_TABLES[n]
        out = []
        for di in range(n):
            idx = [i for i, v in enumerate(table) if v == di]
            sx = sum(math.cos(i * 2 * math.pi / 64) for i in idx)
            sy = sum(math.sin(i * 2 * math.pi / 64) for i in idx)
            out.append((math.atan2(sy, sx) * 180 / math.pi) % 360)
    _ANG[n] = out
    return out


def target_angle(d, n):
    """Contract: d = 0 is screen West (90 deg in file_angles terms), clockwise, 360/n per step."""
    return (90.0 + d * 360.0 / n) % 360


def pick_dir(file_n, ang):
    best, bd = 0, 1e9
    for i, a in enumerate(file_angles(file_n)):
        dd = abs((a - ang + 180) % 360 - 180)
        if dd < bd - 1e-6:
            best, bd = i, dd
    return best


def dir_map(n_out, file_n):
    if file_n == 1:
        return [0] * n_out
    return [pick_dir(file_n, target_angle(d, n_out)) for d in range(n_out)]


# ---------------------------------------------------------------------------
# compositing
# ---------------------------------------------------------------------------
_PAL = [None]
_ANIM = [None]
_COF = {}
_DCC = {}


def pal():
    if _PAL[0] is None:
        _PAL[0] = d2fmt.load_palette(gp('palette', 'act1', 'pal.dat'))
    return _PAL[0]


def anims():
    if _ANIM[0] is None:
        _ANIM[0] = d2anim.load_animdata(gp('animdata.d2'))
    return _ANIM[0]


def load_cof(path):
    if path not in _COF:
        _COF[path] = d2fmt.read_cof(open(path, 'rb').read()) if os.path.exists(path) else None
    return _COF[path]


def load_dcc(path, keep=False):
    if path in _DCC:
        return _DCC[path]
    try:
        d = d2fmt.read_dcc(open(path, 'rb').read()) if os.path.exists(path) else None
    except Exception as e:  # noqa: BLE001 - a bad file must not kill the lever, it is reported
        sys.stderr.write('WARN dcc %s: %s\n' % (path, e))
        d = None
    if keep:
        _DCC[path] = d
    return d


def blend(dst, fr, ox, oy, transparent):
    """Draw one DCC frame (palette indices) into dst RGBA at integer offset (ox, oy)."""
    h, w = fr['pix'].shape
    if not h or not w:
        return
    m = fr['mask']
    rgb = pal()[fr['pix']]
    reg = dst[oy:oy + h, ox:ox + w]
    if not transparent:
        reg[m, :3] = rgb[m]
        reg[m, 3] = 255
        return
    # 50% layer (COF 'transparent'): straight-alpha over
    sa = 0.5
    da = reg[..., 3].astype(np.float32) / 255.0
    oa = sa + da * (1 - sa)
    out = (rgb.astype(np.float32) * sa + reg[..., :3].astype(np.float32) * (da * (1 - sa))[..., None]) \
        / np.maximum(oa, 1e-6)[..., None]
    reg[m, :3] = np.clip(out[m] + 0.5, 0, 255).astype(np.uint8)
    reg[m, 3] = np.clip(oa[m] * 255 + 0.5, 0, 255).astype(np.uint8)


def composite_anim(cof, layer_dccs, n_out):
    """-> [frame][dir] of (rgba, ax, ay) or None.  layer_dccs: {type: dcc dict}."""
    nf = cof['frames_per_dir']
    transp = set(l['type'] for l in cof['layers'] if l['transparent'])
    cdirs = dir_map(n_out, cof['dirs'])
    out = [[None] * n_out for _ in range(nf)]
    for d in range(n_out):
        boxes = {}
        for t, dcc in layer_dccs.items():
            di = dir_map(n_out, dcc['dirs'])[d]
            f0 = dcc['frames'][di][0]
            boxes[t] = (di, f0['ox'], f0['oy'], f0['w'], f0['h'])
        if not boxes:
            continue
        bx = min(b[1] for b in boxes.values())
        by = min(b[2] for b in boxes.values())
        ex = max(b[1] + b[3] for b in boxes.values())
        ey = max(b[2] + b[4] for b in boxes.values())
        W, H = ex - bx, ey - by
        if W <= 0 or H <= 0:
            continue
        for f in range(nf):
            canvas = np.zeros((H, W, 4), np.uint8)
            for t in cof['priority'][cdirs[d]][f]:
                if t not in boxes:
                    continue
                di, ox, oy, _, _ = boxes[t]
                frs = layer_dccs[t]['frames'][di]
                if f >= len(frs):
                    continue
                blend(canvas, frs[f], ox - bx, oy - by, t in transp)
            out[f][d] = (canvas, -bx, -by)
    return out


class DedupAtlas(object):
    """d2pack.Atlas + identical-frame sharing (DCC 'equal cells' repeat whole frames)."""

    def __init__(self, name):
        self.atlas = d2pack.Atlas(name, IMG, WEB_IMG)
        self.seen = {}

    def add(self, rgba, ax, ay):
        key = (rgba.shape, ax, ay, rgba.tobytes())
        r = self.seen.get(key)
        if r is None:
            r = self.atlas.add(rgba, ax, ay)
            self.seen[key] = r
        return r

    def save(self):
        self.seen = None
        return self.atlas.save(lossless=True)


# ---------------------------------------------------------------------------
# monsters + NPCs
# ---------------------------------------------------------------------------

def mon_spec(row2, mstat):
    """Layer spec of one monster from its monstats2 row: (wclass, {comp: token}, [modes])."""
    low = dict((k.lower(), v) for k, v in row2.items())
    comps = {}
    for c in MON_COMPS:
        if low.get(c.lower()) != '1':
            continue
        toks = [t.strip().lower() for t in low.get(c.lower() + 'v', '').strip('"').split(',')]
        tok = toks[0] if toks else ''
        if tok and tok != 'nil':
            comps[c] = tok
    modes = [m for m in MON_MODES if row2.get('m' + m) == '1']
    return (row2['BaseW'].strip().lower() or 'hth'), comps, modes


def build_mon(job):
    """job = (key, code, wclass, comps, modes) -> (key, anims dict, notes)."""
    key, code, wclass, comps, modes = job
    lc = code.lower()
    notes = []
    res = {}
    for m in modes:
        cof = None
        for wc in (wclass, 'hth'):    # DT/DD (and some others) always ship as hth, whatever BaseW is
            cof = load_cof(gp('monsters', lc, 'cof', lc + m.lower() + wc + '.cof'))
            if cof is not None:
                break
        if cof is None:
            continue
        ls = {}
        for l in cof['layers']:
            t = l['type']
            if t not in comps:
                continue
            fn = gp('monsters', lc, t.lower(), '%s%s%s%s%s.dcc' % (lc, t.lower(), comps[t], m.lower(),
                                                                  l['weapon_class']))
            dcc = load_dcc(fn)
            if dcc is None:
                continue
            ls[t] = dcc
        if not ls:
            notes.append('%s %s: no layer files' % (key, m))
            continue
        n_out = cof['dirs']
        fr = composite_anim(cof, ls, n_out)
        an = anims().get((lc + m.lower() + wc).upper())
        if an is None:
            notes.append('%s %s: no animdata, fps 12' % (key, m))
        res[m] = (n_out, cof['frames_per_dir'], an, fr)
    return key, res, notes


# ---------------------------------------------------------------------------
# hero
# ---------------------------------------------------------------------------

def norm_wc(wc):
    wc = wc.lower()
    return 'xbw' if wc == 'xbow' else wc


def hero_tokens(cls):
    """Per-class token policy -> function (type, wclass) -> [tokens] (before disk filtering)."""
    lc = cls.lower()
    arm = [r for r in rd_txt('armor') if r['code'] and r['code'] == r['normcode']]
    wep = [r for r in rd_txt('weapons') if r['code'] and r['code'] == r['normcode']]

    def exists(comp, tok):
        return bool(glob.glob(gp('chars', lc, comp, lc + comp + tok + '*.dcc')))

    heads, chead = [], []
    for r in arm:
        g = r['alternategfx']
        if r['type'] in ('helm', 'circ') and g and g != 'lit' and exists('hd', g) and g not in heads:
            heads.append(g)
    for r in arm:
        g = r['alternategfx']
        if r['type'] in ('pelt', 'phlm') and g and exists('hd', g) and g not in chead:
            chead.append(g)
    shields = []
    for r in arm:
        g = r['alternategfx']
        if r['type'] in ('shie', 'ashd', 'head') and g and exists('sh', g) and g not in shields:
            shields.append(g)
    # class-specific shields first (necro heads, paladin shields), then generic order
    spec = [s for s in shields if s[-1].isdigit()]
    gen = [s for s in shields if not s[-1].isdigit()]
    shields = (spec + gen)[:SHIELD_PICKS]

    def weps(wc):
        n = WEAPON_PICKS.get(wc, 0)
        out = []
        for r in wep:
            g = r['alternategfx']
            if not g or g in out:
                continue
            if wc not in (r['wclass'].lower(), r['2handedwclass'].lower()):
                continue
            if int(r['levelreq'] or 0) > WEAPON_MAXLVL and r['type'] not in ('bow', 'xbow', 'abow'):
                continue
            if not (exists('rh', g) or exists('lh', g)):
                continue
            out.append(g)
        return out[:n]

    wcache = {}

    def f(t, wc):
        if t == 'HD':
            return ['lit'] + heads[:HEAD_GENERIC] + chead[:HEAD_CLASS]
        if t == 'TR':
            return TR_TOKENS
        if t == 'SH':
            return shields
        if t in ('RH', 'LH'):
            if wc not in wcache:
                wcache[wc] = weps(wc)
            return wcache[wc]
        return OTHER_ARMOR_TOKENS
    return f


def hero_plan(cls, dirs_unused=None):
    """-> (cofs {key: info}, files [(layer key, mode, path)]) from disk; no decoding."""
    lc = cls.lower()
    tokf = hero_tokens(cls)
    cofs, files = {}, {}
    for wc in HERO_WCLASSES[cls]:
        for m in HERO_MODES:
            cp = None
            for cand in (wc, 'xbow' if wc == 'xbw' else wc):
                p = gp('chars', lc, 'cof', lc + m.lower() + cand + '.cof')
                if os.path.exists(p):
                    cp, fwc = p, cand
                    break
            if cp is None:
                continue
            cof = load_cof(cp)
            ckey = '%s.%s.%s' % (cls, m, norm_wc(wc).upper())
            cofs[ckey] = (cof, (cls + m + fwc).upper())
            for l in cof['layers']:
                t, lwc = l['type'], norm_wc(l['weapon_class'])
                for tok in tokf(t, lwc):
                    p = gp('chars', lc, t.lower(), '%s%s%s%s%s.dcc' % (lc, t.lower(), tok, m.lower(),
                                                                       l['weapon_class']))
                    if os.path.exists(p):
                        files[('%s.%s.%s.%s' % (cls, t, tok.upper(), lwc.upper()), m)] = p
    return cofs, files


def build_hero_class(cls):
    """Worker: decode + pack one class.  Returns (cofs json, layers json, pages, notes)."""
    t0 = time.time()
    lc = cls.lower()
    cofs, files = hero_plan(cls)
    at = DedupAtlas('hero_' + lc)
    n_out = HERO_DIRS
    layers = {}
    notes = []
    for (lkey, m), path in sorted(files.items()):
        dcc = load_dcc(path)
        if dcc is None:
            notes.append('%s %s unreadable' % (lkey, m))
            continue
        dm = dir_map(n_out, dcc['dirs'])
        nf = dcc['frames_per_dir']
        fl = []
        for f in range(nf):
            row = []
            for d in range(n_out):
                fr = dcc['frames'][dm[d]][f]
                if not fr['w'] or not fr['h']:
                    row.append([])
                    continue
                rgba = d2fmt.to_rgba(fr['pix'], fr['mask'], pal())
                row.append(at.add(rgba, -fr['ox'], -fr['oy']))
            fl.append(row)
        layers.setdefault(lkey, {})[m] = {'f': fl}
    cj = {}
    for ckey, (cof, aname) in sorted(cofs.items()):
        an = anims().get(aname)
        cdm = dir_map(n_out, cof['dirs'])
        nf = cof['frames_per_dir']
        used = sorted(set(l['type'] for l in cof['layers']))
        e = {'layers': used,
             'wclass': dict((l['type'], norm_wc(l['weapon_class'])) for l in cof['layers']),
             'dirs': n_out, 'frames': nf,
             'fps': round(an['fps'], 4) if an else 12.5,
             'hit': an['hit'] if an else -1,
             'pri': [[','.join(cof['priority'][cdm[d]][f]) for f in range(nf)] for d in range(n_out)]}
        tr = sorted(l['type'] for l in cof['layers'] if l['transparent'])
        if tr:
            e['transp'] = tr
        if not an:
            notes.append('%s: no animdata' % ckey)
        cj[ckey] = e
    pages = at.save()
    notes.append('%s: %d layer keys, %d cofs, %d pages, %.0fs' % (cls, len(layers), len(cj), len(pages),
                                                                 time.time() - t0))
    return cls, cj, layers, pages, notes


def estimate():
    tot = 0
    for cls in HERO_CLASSES:
        cofs, files = hero_plan(cls)
        b = sum(os.path.getsize(p) for p in files.values())
        # dcc files hold 16 directions (some 8); scale to HERO_DIRS
        b8 = 0
        for p in files.values():
            nd = open(p, 'rb').read(3)[2]
            b8 += os.path.getsize(p) * min(1.0, float(HERO_DIRS) / nd)
        print('%s: %d cofs, %d layer files, dcc %.2f MB, at %d dirs %.2f MB' %
              (cls, len(cofs), len(files), b / 1e6, HERO_DIRS, b8 / 1e6))
        tot += b8
    print('estimated hero total %.2f MB' % (tot / 1e6))


# ---------------------------------------------------------------------------
# monster list
# ---------------------------------------------------------------------------

def monster_lists():
    ms = rd_txt('monstats')
    by_id = dict((r['Id'], r) for r in ms)
    ex = dict((r['Id'], r) for r in rd_txt('monstats2'))
    ids = []
    for lv in rd_txt('levels'):
        if not lv['Id'].isdigit() or int(lv['Id']) not in LEVELS:
            continue
        for pre in ('mon', 'nmon', 'umon'):
            for i in range(1, 26):
                v = lv.get('%s%d' % (pre, i), '')
                if v and v in by_id and v not in ids:
                    ids.append(v)
    sup = {}
    for r in rd_txt('superuniques'):
        if r['Superunique'] in SUPERS_IN_RANGE:
            sup[r['Superunique']] = r['Class']
            if r['Class'] not in ids:
                ids.append(r['Class'])
    # town NPCs: type-1 objects of towne1.ds1 -> monpreset (Act 1 rows, in order)
    ds1 = d2fmt.read_ds1(open(gp('tiles', 'act1', 'town', 'towne1.ds1'), 'rb').read())
    act1 = [r for r in rd_txt('monpreset') if r['Act'] == '1']
    npc = []
    for o in ds1['objects']:
        if o['type'] == 1:
            p = act1[o['id']]['Place']
            if p in by_id and p not in npc:
                npc.append(p)
    for p in TOWN_EXTRA:
        if p not in npc:
            npc.append(p)
    return ms, by_id, ex, ids, npc, sup


def plan_sheets(ids, npc, by_id, ex):
    """-> (jobs [(key, code, wclass, comps, modes)], monmap {Id: key}, collisions [str])."""
    jobs, monmap, notes = {}, {}, []
    primary = {}      # prefix -> (sig, key)

    def add(prefix, i):
        code = by_id[i]['Code']
        row2 = ex[by_id[i]['MonStatsEx']]
        wc, comps, modes = mon_spec(row2, by_id[i])
        sig = (wc, tuple(sorted(comps.items())), tuple(modes))
        pk = '%s.%s' % (prefix, code.upper())
        got = primary.setdefault(pk, [])
        for s, k in got:
            if s == sig:
                monmap[i] = k
                return
        if not got:
            k = pk
        else:
            base = dict(got[0][0][1])
            diff = [t for c, t in sorted(comps.items()) if base.get(c) != t] or ['x']
            k = pk + '.' + diff[0]
            n = 2
            while any(k == kk for _, kk in got):
                k = '%s.%s%d' % (pk, diff[0], n)
                n += 1
            notes.append('%s: Code %s has a different layout (%s) -> key %s' % (i, code, comps, k))
        got.append((sig, k))
        monmap[i] = k
        jobs[k] = (k, code, wc, dict(comps), modes)

    for i in ids:
        if i not in npc:
            add('mon', i)
    for i in npc:
        add('npc', i)
    return sorted(jobs.values()), monmap, notes


def pack_sheets(pool, jobs, name):
    at = DedupAtlas(name)
    sheets, notes = {}, []
    for key, res, nn in pool.imap(build_mon, jobs):
        notes.extend(nn)
        an_out = {}
        for m in MON_MODES:
            if m not in res:
                continue
            n_out, nf, an, fr = res[m]
            f = []
            for fi in range(nf):
                f.append([at.add(*x) if x is not None else [] for x in fr[fi]])
            an_out[m] = {'dirs': n_out, 'fps': round(an['fps'], 4) if an else 12.5, 'frames': nf,
                         'hit': an['hit'] if an else -1, 'f': f}
        sheets[key] = {'anims': an_out}
    return sheets, at, notes


def clean_old(prefixes):
    for p in glob.glob(os.path.join(IMG, '*.webp')):
        if os.path.basename(p).split('_')[0] in prefixes:
            os.remove(p)


def main():
    args = sys.argv[1:]
    only = set(['mon', 'npc', 'hero'])
    global HERO_DIRS
    for i, a in enumerate(args):
        if a == '--only':
            only = set(args[i + 1].split(','))
        if a == '--dirs':
            HERO_DIRS = int(args[i + 1])
    if '--estimate' in args:
        estimate()
        return
    t0 = time.time()
    os.makedirs(IMG, exist_ok=True)
    pool = multiprocessing.Pool(max(1, min(11, multiprocessing.cpu_count() - 1)))
    clean_old(set(['hero', 'mon', 'npc']) & only)
    ms, by_id, ex, ids, npc, sup = monster_lists()
    jobs, monmap, cnotes = plan_sheets(ids, npc, by_id, ex)
    pages, sheets, allnotes = [], {}, list(cnotes)
    # hero first so the slow jobs start early
    hero_async = None
    if 'hero' in only:
        hero_async = pool.map_async(build_hero_class, HERO_CLASSES, chunksize=1)
    sizes = {}
    for grp, pre in (('mon', 'mon.'), ('npc', 'npc.')):
        if grp not in only:
            continue
        gj = [j for j in jobs if j[0].startswith(pre)]
        sh, at, nn = pack_sheets(pool, gj, grp)
        pg = at.save()
        off = len(pages)
        fix_pages(sh, off)
        pages.extend(pg)
        sheets.update(sh)
        allnotes.extend(nn)
        sizes[grp] = sum(os.path.getsize(os.path.join(IMG, os.path.basename(p))) for p in pg)
    hero = {'cofs': {}, 'layers': {}}
    if hero_async is not None:
        hsize = 0
        for cls, cj, layers, pg, nn in hero_async.get():
            off = len(pages)
            fix_pages(layers, off)
            pages.extend(pg)
            hero['cofs'].update(cj)
            hero['layers'].update(layers)
            allnotes.extend(nn)
            hsize += sum(os.path.getsize(os.path.join(IMG, os.path.basename(p))) for p in pg)
        sizes['hero'] = hsize
    pool.close()
    doc = {'pages': pages, 'sheets': sheets, 'hero': hero,
           'monmap': dict((k, v) for k, v in sorted(monmap.items()) if v != 'mon.%s' % by_id[k]['Code'].upper()
                          and v != 'npc.%s' % by_id[k]['Code'].upper())}
    out = os.path.join(ASSETS, 'sprites.js')
    with io.open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(u'window.D2_SPRITES = ' + json.dumps(doc, sort_keys=True, separators=(',', ':')) + u';\n')
    for n in allnotes:
        print(n)
    print('sheets:', ' '.join(sorted(sheets)))
    print('sizes MB:', dict((k, round(v / 1e6, 2)) for k, v in sizes.items()),
          'sprites.js %.2f MB' % (os.path.getsize(out) / 1e6), 'pages', len(pages), '%.0fs' % (time.time() - t0))


def fix_pages(obj, off):
    """Shift the page index of every rect (rect[6]) by `off`; rects are shared lists, shift once."""
    if off == 0:
        return
    seen = set()

    def walk(o):
        if isinstance(o, list):
            if len(o) == 7 and all(isinstance(v, int) for v in o):
                if id(o) not in seen:
                    seen.add(id(o))
                    o[6] += off
                return
            for v in o:
                walk(v)
        elif isinstance(o, dict):
            for k in sorted(o):
                walk(o[k])
    walk(obj)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
