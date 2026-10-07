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
import re
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

# ---------------------------------------------------------------------------
# hero profile.  Everything below is decided by measured size (--estimate prints dcc bytes per mode
# and weapon class); see the report in the build log for what the 60 MB budget cut.
# ---------------------------------------------------------------------------
HERO_DIRS = 8
# Turning shows the 8-dir step most in these modes; D2 ships them with 16 (2-AVFX budget, ~200 MB).
HERO_DIRS16 = ('NU', 'WL', 'RN', 'TN', 'TW')
HERO_MODES = ['NU', 'WL', 'RN', 'TN', 'TW', 'A1', 'A2', 'GH', 'DT', 'DD', 'BL', 'SC']
# TH (throw), KK (kick) and S1..S4 only for the classes whose skills use them (budget).
HERO_EXTRA_MODES = {'AM': ['TH'], 'BA': ['TH', 'S1', 'S2', 'S3', 'S4'], 'AI': ['KK', 'S1', 'S2', 'S3', 'S4']}
HERO_CLASSES = ['AM', 'SO', 'NE', 'PA', 'BA', 'DZ', 'AI']
HERO_WCLASSES = {
    'AM': ['hth', '1ht', '2ht', 'bow', 'xbw'],
    # bow and 2ht (spear) for the casters/paladin, ~0.6-0.9 MB each per class at 16 dirs; xbw left out (budget, 2-AVFX)
    'SO': ['hth', '1hs', 'stf', 'bow', '2ht'],
    'NE': ['hth', '1hs', 'stf', 'bow', '2ht'],
    'PA': ['hth', '1hs', '2hs', 'bow', '2ht'],
    'BA': ['hth', '1hs', '2hs', '1js', '1jt', '1ss', '1st'],
    'DZ': ['hth', '1hs', 'stf', 'bow', '2ht'],
    'AI': ['hth', 'ht1', 'ht2'],
}
ARMOR_TOKENS = ['lit', 'med', 'hvy']          # TR only
TR_TOKENS = ARMOR_TOKENS
OTHER_ARMOR_TOKENS = ['lit']                  # LG RA LA S1..S8
HEAD_GENERIC = 2                              # first N normal-tier helms present for the class
HEAD_CLASS = 1                                # first N class-specific head items (pelt/phlm/head...)
SHIELD_PICKS = 2
WEAPON_PICKS = {'1hs': 3, '1ht': 2, '2hs': 2, '2ht': 2, 'bow': 2, 'xbw': 2, 'stf': 2,
                'hth': 0, 'ht1': 2, 'ht2': 2, '1js': 2, '1jt': 2, '1ss': 2, '1st': 2}
WEAPON_MAXLVL = 30

MON_MODES = ['DT', 'NU', 'WL', 'GH', 'A1', 'A2', 'BL', 'SC', 'S1', 'S2', 'S3', 'S4', 'DD', 'KB',
             'SQ', 'RN']
MON_COMPS = ['HD', 'TR', 'LG', 'RA', 'LA', 'RH', 'LH', 'SH', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6',
             'S7', 'S8']
ACTS = [1, 2, 3, 4, 5]
# Budget cut: every 2nd frame (fps halved) for the other monster modes and for bosses.
FULL_RATE = ('NU', 'A1', 'WL', 'RN', 'GH', 'DT')   # 2-AVFX: the modes seen most keep every frame (+11 MB)
# Act of every superunique base (superuniques.txt carries none); index = row order of the table.
SUPER_ACT = {
    'Bishibosh': 1, 'Bonebreak': 1, 'Coldcrow': 1, 'Rakanishu': 1, 'Treehead WoodFist': 1, 'Griswold': 1,
    'The Countess': 1, 'Pitspawn Fouldog': 1, 'Flamespike the Crawler': 1, 'Boneash': 1,
    'The Smith': 1, 'Corpsefire': 1, 'The Cow King': 1,
    'Radament': 2, 'Bloodwitch the Wild': 2, 'Fangskin': 2, 'Beetleburst': 2, 'Leatherarm': 2,
    'Coldworm the Burrower': 2, 'Fire Eye': 2, 'Dark Elder': 2, 'The Summoner': 2,
    'Ancient Kaa the Soulless': 2,
    'Web Mage the Burning': 3, 'Witch Doctor Endugu': 3, 'Stormtree': 3, 'Sarina the Battlemaid': 3,
    'Icehawk Riftwing': 3, 'Ismail Vilehand': 3, 'Geleb Flamefinger': 3, 'Bremm Sparkfist': 3,
    'Toorc Icefist': 3, 'Wyand Voidfinger': 3, 'Maffer Dragonhand': 3,
    'Winged Death': 4, 'The Tormentor': 4, 'Taintbreeder': 4, 'Riftwraith the Cannibal': 4,
    'Infector of Souls': 4, 'Lord De Seis': 4, 'Grand Vizier of Chaos': 4,
}
ACT_BOSSES = {1: ['andariel'], 2: ['duriel'], 3: ['mephisto'], 4: ['diablo'],
              5: ['baalthrone', 'baalcrab', 'baalclone', 'baaltaunt', 'baalminion1', 'baalminion2',
                  'baalminion3', 'baalhighpriest']}
TOWN_EXTRA = {1: ['cain1']}      # Cain is quest-placed, not a type-1 object of the town DS1
BOSS_IDS = set(b for v in ACT_BOSSES.values() for b in v)
MERC_ACT = {'roguehire': 1, 'act2hire': 2, 'act3hire': 3, 'act5hire1': 5, 'act5hire2': 5}
MERCS = sorted(MERC_ACT)


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
        try:
            _COF[path] = d2fmt.read_cof(open(path, 'rb').read()) if os.path.exists(path) else None
        except Exception as e:  # noqa: BLE001 - amblxbow.cof does not parse (d2fmt); the sheet falls back
            sys.stderr.write('WARN cof %s: %s' % (path, e) + chr(10))
            _COF[path] = None
    return _COF[path]


def load_dcc(path, keep=False):
    if path in _DCC:
        return _DCC[path]
    try:
        if not os.path.exists(path) and os.path.exists(path[:-4] + '.dc6'):
            d = d2fmt.read_dc6(open(path[:-4] + '.dc6', 'rb').read())   # Mephisto, some bosses ship DC6
        else:
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
            frs = [fr for fr in dcc['frames'][di] if fr['w'] and fr['h']]
            if not frs:
                continue
            # union over every frame: DC6 layers (Mephisto...) change size from frame to frame
            boxes[t] = (di, min(fr['ox'] for fr in frs), min(fr['oy'] for fr in frs),
                        max(fr['ox'] + fr['w'] for fr in frs), max(fr['oy'] + fr['h'] for fr in frs))
        if not boxes:
            continue
        bx = min(b[1] for b in boxes.values())
        by = min(b[2] for b in boxes.values())
        ex = max(b[3] for b in boxes.values())
        ey = max(b[4] for b in boxes.values())
        W, H = ex - bx, ey - by
        if W <= 0 or H <= 0:
            continue
        for f in range(nf):
            canvas = np.zeros((H, W, 4), np.uint8)
            for t in cof['priority'][cdirs[d]][f]:
                if t not in boxes:
                    continue
                di = boxes[t][0]
                frs = layer_dccs[t]['frames'][di]
                if f >= len(frs):
                    continue
                blend(canvas, frs[f], frs[f]['ox'] - bx, frs[f]['oy'] - by, t in transp)
            out[f][d] = (canvas, -bx, -by)
    return out


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
    key, code, wclass, comps, modes = job[:5]
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
            if dcc is None and m == 'WL':    # VK ships its walk layers as <code><layer>lit WK
                dcc = load_dcc(fn.replace('wl' + l['weapon_class'] + '.dcc', 'wk' + l['weapon_class'] + '.dcc'))
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
        for m in HERO_MODES + HERO_EXTRA_MODES.get(cls, []):
            cp = None
            for cand in (wc, 'xbow' if wc == 'xbw' else wc):
                p = gp('chars', lc, 'cof', lc + m.lower() + cand + '.cof')
                if os.path.exists(p):
                    cp, fwc = p, cand
                    break
            if cp is None:
                continue
            cof = load_cof(cp)
            if cof is None:
                continue
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


def hero_dirs(m):
    return 16 if m in HERO_DIRS16 and HERO_DIRS < 16 else HERO_DIRS


def build_hero_class(cls):
    """Worker: decode + pack one class.  Returns (cofs json, layers json, pages, notes)."""
    t0 = time.time()
    lc = cls.lower()
    cofs, files = hero_plan(cls)
    at = d2anim.GroupAtlas('hero_' + cls)
    layers = {}
    notes = []
    for (lkey, m), path in sorted(files.items()):
        dcc = load_dcc(path)
        if dcc is None:
            notes.append('%s %s unreadable' % (lkey, m))
            continue
        n_out = hero_dirs(m)
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
        n_out = hero_dirs(ckey.split('.')[1])
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
    pages, nbytes, modes = at.save()
    d2anim.write_group('hero_' + cls, {'pages': pages, 'hero': {'cofs': cj, 'layers': layers}})
    notes.append('%s: %d layer keys, %d cofs, %d pages (%s) %.1f MB, %.0fs' % (
        cls, len(layers), len(cj), len(pages), ','.join(modes), nbytes / 1e6, time.time() - t0))
    return cls, nbytes, notes


def estimate():
    """dcc bytes of the planned hero files, by class, mode and weapon class (all dirs of the file)."""
    tot = 0
    bymode, bywc = {}, {}
    for cls in HERO_CLASSES:
        cofs, files = hero_plan(cls)
        b8 = 0
        for (lkey, m), p in files.items():
            nd = open(p, 'rb').read(3)[2]
            sz = os.path.getsize(p) * min(1.0, float(HERO_DIRS) / nd)
            b8 += sz
            bymode[m] = bymode.get(m, 0) + sz
            wc = lkey.split('.')[-1]
            bywc[wc] = bywc.get(wc, 0) + sz
        print('%s: %d cofs, %d layer files, at %d dirs %.2f MB' % (cls, len(cofs), len(files), HERO_DIRS, b8 / 1e6))
        tot += b8
    print('by mode MB:', dict((k, round(v / 1e6, 1)) for k, v in sorted(bymode.items())))
    print('by wclass MB:', dict((k, round(v / 1e6, 1)) for k, v in sorted(bywc.items())))
    print('estimated hero dcc total %.2f MB' % (tot / 1e6))


# ---------------------------------------------------------------------------
# monster list
# ---------------------------------------------------------------------------

def monster_lists(acts):
    ms = rd_txt('monstats')
    by_id = dict((r['Id'], r) for r in ms)
    ex = dict((r['Id'], r) for r in rd_txt('monstats2'))
    ids = []
    per_act = dict((a, []) for a in acts)

    def add(a, v):
        if v and v in by_id:
            if v not in ids:
                ids.append(v)
            if v not in per_act[a]:
                per_act[a].append(v)

    for lv in rd_txt('levels'):
        if not lv['Id'].isdigit() or not lv.get('Act', '').isdigit() or int(lv['Act']) + 1 not in acts:
            continue
        for pre in ('mon', 'nmon', 'umon'):
            for i in range(1, 26):
                add(int(lv['Act']) + 1, lv.get('%s%d' % (pre, i), ''))
    for a in acts:
        for v in ACT_BOSSES.get(a, []):
            add(a, v)
    for r in rd_txt('superuniques'):
        a = SUPER_ACT.get(r['Superunique'])
        if a in acts and r['Class']:
            add(a, r['Class'])
    # town NPCs: type-1 objects of the act's town DS1s -> monpreset rows of that act, in order
    lp = rd_txt('lvlprest')
    mp = rd_txt('monpreset')
    npc, npc_act = [], dict((a, []) for a in acts)
    for a in acts:
        rows = [r for r in mp if r['Act'] == str(a)]
        files = set()
        for r in lp:
            if re.match(r'^Act %d - (Town|Fortress|Harrogath)' % a, r['Name']):
                for k in range(1, 7):
                    v = r.get('File%d' % k, '')
                    if v and v != '0':
                        files.add(v.lower().replace(chr(92), '/'))
        for f in sorted(files):
            p = gp('tiles', f)
            if not os.path.exists(p):
                continue
            ds1 = d2fmt.read_ds1(open(p, 'rb').read())
            for o in ds1['objects']:
                if o['type'] == 1 and o['id'] < len(rows):
                    pl = rows[o['id']]['Place']
                    if pl in by_id and pl not in npc_act[a]:
                        npc_act[a].append(pl)
        for pl in TOWN_EXTRA.get(a, []):
            if pl not in npc_act[a]:
                npc_act[a].append(pl)
        for hid in MERCS:
            if hid in by_id and hid not in npc_act[a] and MERC_ACT[hid] == a:
                npc_act[a].append(hid)
        for pl in npc_act[a]:
            if pl not in npc:
                npc.append(pl)
    return ms, by_id, ex, ids, npc, per_act, npc_act


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
        for (s0, k0) in got:
            base = dict(s0[1])
            changed = set(c for c in set(base) | set(comps) if base.get(c) != comps.get(c))
            if not changed & set(['RH', 'LH', 'SH']) and wc == s0[0] and tuple(modes) == s0[2]:
                # colour/effect-only variant (same weapons, same modes): share the art, saves a full sheet
                monmap[i] = k0
                notes.append('%s: Code %s variant %s shares %s' % (i, code, sorted(changed), k0))
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
        jobs[k] = (k, code, wc, dict(comps), modes, i in BOSS_IDS)

    for i in ids:
        if i not in npc:
            add('mon', i)
    for i in npc:
        add('npc', i)
    return sorted(jobs.values()), monmap, notes


def group_of(key):
    return key.replace('.', '_')


def mon_group_job(job):
    """Worker: decode + pack + write one monster/NPC sheet as its own group -> (key, nbytes, pages, modes, notes)."""
    key, res, notes = build_mon(job)
    at = d2anim.GroupAtlas(group_of(key))
    an_out = {}
    for m in MON_MODES:
        if m not in res:
            continue
        n_out, nf, an, fr = res[m]
        step = 1 if (m in FULL_RATE and not job[5]) else 2   # bosses: huge frames, decimate everything
        f = []
        for fi in range(0, nf, step):
            f.append([at.add(*x) if x is not None else [] for x in fr[fi]])
        fps = (an['fps'] if an else 12.5) / step
        an_out[m] = {'dirs': n_out, 'fps': round(fps, 4), 'frames': len(f),
                     'hit': (an['hit'] // step) if an and an['hit'] >= 0 else -1, 'f': f}
    if not an_out:
        notes.append('%s: no art on disk, sheet skipped' % key)
        return key, 0, [], [], notes
    pages, nbytes, modes = at.save()
    d2anim.write_group(group_of(key), {'pages': pages, 'sheets': {key: {'anims': an_out}}})
    return key, nbytes, pages, modes, notes


def load_fragment():
    p = os.path.join(ASSETS, 'idx', 'sprites.json')
    if os.path.exists(p):
        with io.open(p, encoding='utf-8') as f:
            return json.load(f)
    return {}


def codes_main(codes, prefix='mon.'):
    """--codes B8,G2,...: build only these monster Codes as mon.<CODE> groups, leave every other group alone.
    Several monstats rows may share a Code (sentries, wolf/fenris): comps and modes are the union of the rows."""
    ms, ex = rd_txt('monstats'), dict((r['Id'], r) for r in rd_txt('monstats2'))
    jobs = []
    for c in codes:
        comps, modes, wc = {}, [], 'hth'
        for r in ms:
            if r['Code'].upper() != c:
                continue
            w, cp, md = mon_spec(ex[r['MonStatsEx']], r)
            wc = w
            for k, v in cp.items():
                comps.setdefault(k, v)
            modes.extend(m for m in md if m not in modes)
        for t in MON_COMPS:    # monstats2 flags miss layers that ship with the art (B8 S1, VK TR): trust the disk
            fs = glob.glob(gp('monsters', c.lower(), t.lower(), c.lower() + t.lower() + '???*.dcc'))
            if fs and t not in comps:
                comps[t] = os.path.basename(sorted(fs)[0])[len(c) + 2:len(c) + 5]
        if not modes:
            print('%s: no monstats row' % c)
            continue
        jobs.append((prefix + c, c, wc, comps, [m for m in MON_MODES if m in modes], False))
    pool = multiprocessing.Pool(max(1, min(11, multiprocessing.cpu_count() - 1)))
    out = pool.map(mon_group_job, jobs, chunksize=1)
    pool.close()
    frag = load_fragment()
    frag.setdefault('sheets', {})
    tot = 0
    for key, nbytes, pages, modes, nn in out:
        for n in nn:
            print(n)
        tot += nbytes
        if pages:
            frag['sheets'][key] = 'm/' + group_of(key)
        print('%s: %d pages, %.2f MB' % (key, len(pages), nbytes / 1e6))
    __import__('build_index').write_fragment('sprites', frag)
    print('codes total webp MB %.2f' % (tot / 1e6))


def main():
    args = sys.argv[1:]
    if '--codes' in args:
        codes_main([c.strip().upper() for c in args[args.index('--codes') + 1].split(',') if c.strip()])
        return
    if '--npc-codes' in args:     # same, but npc.<CODE> keys (town NPCs, critters)
        codes_main([c.strip().upper() for c in args[args.index('--npc-codes') + 1].split(',') if c.strip()], 'npc.')
        return
    only = set(['mon', 'npc', 'hero'])
    acts = list(ACTS)
    global HERO_DIRS
    for i, a in enumerate(args):
        if a == '--only':
            only = set(args[i + 1].split(','))
        if a == '--dirs':
            HERO_DIRS = int(args[i + 1])
        if a == '--acts':
            acts = [int(x) for x in args[i + 1].split(',')]
    if '--estimate' in args:
        estimate()
        return
    t0 = time.time()
    pool = multiprocessing.Pool(max(1, min(11, multiprocessing.cpu_count() - 1)))
    ms, by_id, ex, ids, npc, per_act, npc_act = monster_lists(acts)
    jobs, monmap, cnotes = plan_sheets(ids, npc, by_id, ex)
    allnotes = list(cnotes)
    for a in acts:
        print('act %d: %d monsters, %d npcs (%s)' % (a, len(per_act[a]), len(npc_act[a]), ' '.join(npc_act[a])))
    frag = load_fragment()
    frag.setdefault('sheets', {})
    frag.setdefault('hero', {})
    frag.setdefault('monmap', {})
    sizes = {}
    res_async = {}
    if 'hero' in only:
        d2anim.clean_groups(['hero_'])
        res_async['hero'] = pool.map_async(build_hero_class, HERO_CLASSES, chunksize=1)
    for grp, pre in (('mon', 'mon.'), ('npc', 'npc.')):
        if grp not in only:
            continue
        d2anim.clean_groups([pre.replace('.', '_')])
        gj = [j for j in jobs if j[0].startswith(pre)]
        for k in list(frag['sheets']):
            if k.startswith(pre):
                del frag['sheets'][k]
        res_async[grp] = pool.map_async(mon_group_job, gj, chunksize=1)
    pool.close()
    for grp in ('hero', 'mon', 'npc'):
        if grp not in res_async:
            continue
        out = res_async[grp].get()
        if grp == 'hero':
            frag['hero'] = {}
            tot = 0
            for cls, nbytes, nn in out:
                frag['hero'][cls] = 'm/hero_' + cls
                tot += nbytes
                allnotes.extend(nn)
            sizes['hero'] = tot
        else:
            tot = 0
            for key, nbytes, pages, modes, nn in out:
                allnotes.extend(nn)
                tot += nbytes
                if pages:
                    frag['sheets'][key] = 'm/' + group_of(key)
            sizes[grp] = tot
            sizes[grp + ' sheets'] = sum(1 for o in out if o[2])
    built = set(frag['sheets'])
    frag['monmap'] = dict((k, v) for k, v in sorted(monmap.items())
                          if v in built and v != 'mon.%s' % by_id[k]['Code'].upper()
                          and v != 'npc.%s' % by_id[k]['Code'].upper())
    __import__('build_index').write_fragment('sprites', frag)
    for n in allnotes:
        print(n)
    gm = sum(os.path.getsize(p) for p in glob.glob(os.path.join(d2anim.M_DIR, '*.js'))
             if os.path.basename(p).split('_')[0] in ('hero', 'mon', 'npc'))
    print('sizes:', dict((k, round(v / 1e6, 2) if v > 1000 else v) for k, v in sizes.items()),
          'group js MB %.2f' % (gm / 1e6), '%.0fs' % (time.time() - t0))


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
