# -*- coding: utf-8 -*-
"""Objects, missiles, overlays and item-drop sprites -> assets/m/{obj_act1..5,mis,ovl,flp}.js (contract v2)
+ assets/img/g/<group>_<n>.webp pages + index fragment assets/idx/objects.json.

    PYTHONIOENCODING=utf-8 python build_objects.py [--acts 1,2,3,4,5]

Each group file is D2_REG('<group>', {pages: [...], sheets: { 'obj.<tok>' | 'mis.<name>' | 'ovl.<name>' |
'flp.<file>': { anims: { MODE: { dirs, frames, fps, loop, [blend], f: [frame][dir] -> [x,y,w,h,ox,oy,page] } } } } }),
page indices local to the group.  Objects: one group per act (a token shared by several acts lives in the lowest
act's group; the index maps the sheet key to it).  Missiles: group 'mis'; overlays: 'ovl'; drops: 'flp'.
Index fragment: sheets (key -> 'm/<group>') and objPresets ('act<N>:<ds1 object id>' -> preset).
Directions: d = 0 is screen West, clockwise (d2fmt only names the 16 compass points, so the mean ring angle
is computed here to keep 32/64-dir missiles collision free).

Timing formulas (all at the 25 fps game tick):
    objects  : fps = 25 * FrameDelta[mode] / 256        (objects.txt; 256 = one frame per tick)
    missiles : fps = 25 * AnimSpeed / 16                (missiles.txt, "16ths"; AnimSpeed 16 = one frame per tick;
               blank AnimSpeed -> 25 * animrate / 1024, the dataguide's 256*animrate/1024 per 256 per tick)
    overlays : fps = 25 * AnimRate / 16                 (overlay.txt; same unit as missiles, ASSUMED - the dataguide
               only says "frames per second" and every row is 16 or a small variation of it)
    flippy   : fps = 25, play once (ASSUMED; no table drives it)
Blend: COF layers use the draw_effect byte (OpenDiablo2 DrawEffect: 0/1/2 = 25/50/75% alpha, 3 modulate,
4 burn, 5 normal, 6 mid grey) only when the 'transparent' flag is set; 3 and 4 -> 'add', the rest -> 'alpha50'.
Missiles/overlays use the Trans column: 0 none, 1 and 3 and 8 -> 'add', 2 and 5 -> 'alpha50' (ASSUMED from the
bulk of the data being additive; the raw value is kept as `trans`).
"""
from __future__ import print_function

import collections
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
import build_sprites as bsp  # noqa: E402

G = 'D:/d2r-ref/fs/data/data/global/'
GAME = os.path.normpath(os.path.join(HERE, '..'))
ACTS = [1, 2, 3, 4, 5]
MAX_DIRS = 16

MODES = ['NU', 'OP', 'ON', 'S1', 'S2', 'S3', 'S4', 'S5']
# Objects every act needs even when no DS1 places them: waypoints, stashes, portals, chests, urns.
ALWAYS_RX = re.compile(r'waypoint|stash|portal|chest|casket|urn|barrel|coffin|cain|shrine|well|fountain', re.I)
# Classes that are in the Act I preset table or are things Act I players meet, even when no DS1 places them.
EXTRA_OBJECT_CLASSES = ['TownPortal', 'PortalPermanent', 'Urn1', 'Urn2', 'Urn3', 'Urn4', 'Urn5', 'Casket3',
                        'Chest2', 'Chest3', 'Chest4', 'Chest1B', 'Chest2B', 'Chest3B', 'Chest8']
MISC_ALWAYS_OVERLAYS = ['healing', 'receiving', 'itemgleam', 'multigleam', 'teleport', 'fire_explode',
                        'ice_explode', 'light_cast_1', 'lightning', 'fire_hit', 'dust', 'frozenarmor',
                        'burning', 'poisonhit', 'stun', 'shout', 'cast_undead']
WEAPON_MISSILES = ['arrow', 'bolt', 'javelin', 'throwaxe', 'throwknife', 'firearrow', 'coldarrow']
STATE_ALWAYS = ['poison', 'burning', 'frozen', 'freeze', 'stunned', 'shatter', 'cold', 'slowed']
ACT1_BOSSES = ['andariel', 'bloodraven', 'griswold', 'corpsefire', 'bishibosh', 'bonebreaker', 'coldcrow',
               'rakanishu', 'treehead', 'smith']
SKILL_MISSILE_COLS = ['srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec',
                      'cltmissile', 'cltmissilea', 'cltmissileb', 'cltmissilec', 'cltmissiled']
SKILL_OVERLAY_COLS = ['srvoverlay', 'castoverlay', 'cltoverlaya', 'cltoverlayb', 'tgtoverlay', 'prgoverlay',
                      'sumoverlay', 'ItemCastOverlay']
SKILL_STATE_COLS = ['aurastate', 'auratargetstate', 'passivestate', 'State1', 'State2', 'State3']
MISSILE_LINK_COLS = ['ExplosionMissile', 'SubMissile1', 'SubMissile2', 'SubMissile3', 'HitSubMissile1',
                     'HitSubMissile2', 'HitSubMissile3', 'HitSubMissile4', 'CltSubMissile1', 'CltSubMissile2',
                     'CltSubMissile3', 'CltHitSubMissile1', 'CltHitSubMissile2', 'CltHitSubMissile3',
                     'CltHitSubMissile4']
STATE_OVERLAY_COLS = ['overlay1', 'overlay2', 'overlay3', 'overlay4', 'pgsvoverlay', 'castoverlay', 'removerlay']

_PAL = None


def pal():
    global _PAL
    if _PAL is None:
        _PAL = d2fmt.load_palette(G + 'palette/act1/pal.dat')
    return _PAL


# --------------------------------------------------------------------------
# tables
# --------------------------------------------------------------------------

def tab(name):
    with io.open(G + 'excel/' + name, encoding='latin-1') as f:
        lines = f.read().replace('\r', '').split('\n')
    head = lines[0].split('\t')
    return [dict(zip(head, ln.split('\t'))) for ln in lines[1:] if ln.strip()]


def num(v, d=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return d


# --------------------------------------------------------------------------
# directions: file order -> contract order (0 = W, clockwise)
# --------------------------------------------------------------------------

_REMAP = {}


def file_to_out(n):
    """list: file dir index -> output dir index for an n-dir DCC."""
    if n in _REMAP:
        return _REMAP[n]
    if n not in d2fmt._DCC_TABLES:
        res = list(range(n))  # 1, 2, 3, 12 ... dirs: no known ring table, keep file order
    else:
        table = d2fmt._DCC_TABLES[n]
        res = []
        for i in range(n):
            slots = [s for s, v in enumerate(table) if v == i]
            sx = sum(math.cos(s * 2 * math.pi / 64) for s in slots)
            sy = sum(math.sin(s * 2 * math.pi / 64) for s in slots)
            ang = (math.degrees(math.atan2(sy, sx))) % 360  # clockwise from S, see d2fmt.dir_to_compass
            res.append(int(round(((ang - 90) % 360) / (360.0 / n))) % n)
        if sorted(res) != list(range(n)):
            raise ValueError('direction remap for %d dirs is not a permutation: %r' % (n, res))
    _REMAP[n] = res
    return res


def out_dirs(frames_by_filedir):
    n = len(frames_by_filedir)
    m = file_to_out(n)
    out = [None] * n
    for fi, fr in enumerate(frames_by_filedir):
        out[m[fi]] = fr
    return out


# --------------------------------------------------------------------------
# decoding (runs in worker processes)
# --------------------------------------------------------------------------

def find_file(base):
    """base without extension, lower-case, relative to G -> existing path or None."""
    for ext in ('.dcc', '.dc6'):
        p = G + base + ext
        if os.path.exists(p):
            return p
    return None


def decode_file(path):
    """-> list[file dir][frame] of (rgba, anchor_x, anchor_y) with the anchor in rgba pixel coordinates."""
    with open(path, 'rb') as f:
        data = f.read()
    d = d2fmt.read_dc6(data) if path.endswith('.dc6') else d2fmt.read_dcc(data)
    out = []
    for row in d['frames']:
        r = []
        for fr in row:
            rgba = d2fmt.to_rgba(fr['pix'], fr['mask'], pal())
            r.append((rgba, -fr['ox'], -fr['oy']))
        out.append(r)
    return out


def _trim(rgba, ax, ay):
    t = d2pack.trim(rgba, ax, ay)
    return t


def blend_of(transparent, effect):
    if not transparent:
        return None
    return 'add' if effect in (3, 4) else 'alpha50'


def job_simple(path):
    """Missile / overlay / flippy: one file -> out_dir-ordered trimmed frames."""
    d = decode_file(path)
    d = out_dirs(d)
    return [[_trim(*fr) for fr in row] for row in d]


def job_object(args):
    """One object token + mode -> {'groups': {blend: [dir][frame] trimmed}, 'under': {...}, 'frames', 'dirs'}."""
    tok, mode, start, count = args
    cof_path = G + 'objects/%s/cof/%s%s%s.cof' % (tok, tok, mode.lower(), 'hth')
    if not os.path.exists(cof_path):
        return None
    with open(cof_path, 'rb') as f:
        cof = d2fmt.read_cof(f.read())
    nfr = cof['frames_per_dir']
    ndir = cof['dirs']
    layers = {}
    missing = []
    for l in cof['layers']:
        t = l['type'].lower()
        wc = l['weapon_class'].lower() or 'hth'
        p = find_file('objects/%s/%s/%s%s%s%s%s' % (tok, t, tok, t, 'lit', mode.lower(), wc))
        if p is None:
            missing.append(l['type'])
            continue
        layers[l['type']] = (decode_file(p), blend_of(l['transparent'], l['draw_effect']))
    if not layers:
        return None
    f0 = max(0, min(start, nfr - 1))
    f1 = nfr if count <= 0 else min(nfr, f0 + count)
    frames = list(range(f0, f1))
    cmap = file_to_out(ndir)
    all_blends = sorted(set(v[1] for v in layers.values()), key=lambda x: (x is not None, x or ''))
    groups = collections.OrderedDict()
    under = {}
    outd = [None] * ndir
    for fd in range(ndir):
        od = cmap[fd]
        per_group = collections.OrderedDict()
        for f in frames:
            order = cof['priority'][fd][f]
            frame_layers = [t for t in order if t in layers]
            for b in all_blends:
                sel = [t for t in frame_layers if layers[t][1] == b]
                if not sel:
                    per_group.setdefault(b, []).append(None)  # keep every group aligned to the frame index
                    continue
                items = []
                for t in sel:
                    ld = layers[t][0]
                    dfile = ld[fd % len(ld)] if len(ld) != ndir else ld[fd]
                    items.append(dfile[f % len(dfile)])
                x0 = min(-a for (_, a, _) in items)
                y0 = min(-c for (_, _, c) in items)
                # anchor-relative boxes: frame occupies [-ax, -ax + w) around the anchor
                x1 = max(-a + im.shape[1] for (im, a, c) in items)
                y1 = max(-c + im.shape[0] for (im, a, c) in items)
                canvas = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
                for (im, a, c) in items:
                    ox, oy = -a - x0, -c - y0
                    h, w = im.shape[:2]
                    reg = canvas[oy:oy + h, ox:ox + w]
                    m = im[..., 3] > 0
                    reg[m] = im[m]
                tr = _trim(canvas, -x0, -y0)
                per_group.setdefault(b, []).append(tr)
                if b is not None and b not in under and f == frames[0]:
                    first_base = [i for i, t in enumerate(frame_layers) if layers[t][1] is None]
                    first_b = [i for i, t in enumerate(frame_layers) if layers[t][1] == b]
                    under[b] = bool(first_base and first_b and first_b[0] < first_base[0])
        outd[od] = per_group
    for od in range(ndir):
        for b, lst in outd[od].items():
            groups.setdefault(b, [None] * ndir)[od] = lst
    return {'groups': groups, 'under': under, 'frames': len(frames), 'dirs': ndir, 'missing': missing}


def _worker(job):
    kind, arg = job
    try:
        if kind == 'obj':
            return job_object(arg)
        return job_simple(arg)
    except Exception as e:  # corrupt / unsupported file: reported, not fatal
        return ('ERR', '%s: %s' % (type(e).__name__, e), str(arg))


# --------------------------------------------------------------------------
# data selection
# --------------------------------------------------------------------------

def collect_ds1_objects(lvlprest, acts):
    """Type-2 objects of every LvlPrest DS1 of the acts -> (Counter {(act, object id): n}, files read)."""
    files = set()
    for r in lvlprest:
        m = re.match(r'^Act (\d) - ', r['Name'])
        if m and int(m.group(1)) in acts:
            for k in range(1, 7):
                v = r.get('File%d' % k, '')
                if v and v != '0':
                    files.add(v.lower().replace(chr(92), '/'))
    if 1 in acts:
        for t in 'nesw':
            files.add('act1/town/town%s1.ds1' % t)
    placed = collections.Counter()
    nfiles = 0
    for f in sorted(files):
        p = G + 'tiles/' + f
        if not os.path.exists(p):
            continue
        with open(p, 'rb') as fh:
            ds = d2fmt.read_ds1(fh.read())
        nfiles += 1
        for o in ds['objects']:
            if o['type'] == 2:
                placed[(ds['act'], o['id'])] += 1
    return placed, nfiles


def select_missiles_overlays(acts):
    skills = tab('skills.txt')
    sk_by = {}
    for r in skills:
        sk_by.setdefault(r['skill'].lower(), r)
    missiles = tab('missiles.txt')
    ms_by = {}
    for r in missiles:
        ms_by.setdefault(r['Missile'].lower(), r)
    states = tab('states.txt')
    st_by = {}
    for r in states:
        st_by.setdefault(r['state'].lower(), r)
    ovl_rows = tab('overlay.txt')
    ov_by = {}
    for r in ovl_rows:
        ov_by.setdefault(r['overlay'].lower(), r)

    # monsters of the acts (levels, bosses, superuniques, town NPCs, mercenaries)
    ms_, by_id, ex, ids, npc, per_act, npc_act = bsp.monster_lists(acts)
    mon_ids = set(i.lower() for i in ids) | set(i.lower() for i in npc)
    monstats = tab('monstats.txt')
    skill_names = set()
    n_mon = 0
    for r in monstats:
        if r['Id'].lower() in mon_ids:
            n_mon += 1
            for i in range(1, 9):
                s_ = r.get('Skill%d' % i, '').strip()
                if s_:
                    skill_names.add(s_.lower())
    class_skills = set()
    for r in skills:
        if r['charclass']:
            class_skills.add(r['skill'].lower())
    used_skills = [sk_by[s] for s in sorted(skill_names | class_skills) if s in sk_by]

    mis = set()
    ovl = set()
    stt = set(s for s in STATE_ALWAYS if s in st_by)
    for r in used_skills:
        for c in SKILL_MISSILE_COLS:
            v = r.get(c, '').strip().lower()
            if v in ms_by:
                mis.add(v)
        for c in SKILL_OVERLAY_COLS:
            v = r.get(c, '').strip().lower()
            if v in ov_by:
                ovl.add(v)
        for c in SKILL_STATE_COLS:
            v = r.get(c, '').strip().lower()
            if v in st_by:
                stt.add(v)
    # plain weapon missiles (bow/crossbow/throwing attacks) and the monsters' own attack missiles
    for v in WEAPON_MISSILES:
        if v in ms_by:
            mis.add(v)
    for r in monstats:
        if r['Id'].lower() in mon_ids:
            for c in ('MissA1', 'MissA2', 'MissS1', 'MissS2', 'MissS3', 'MissS4', 'MissC', 'MissSQ'):
                v = r.get(c, '').strip().lower()
                if v in ms_by:
                    mis.add(v)
    # missile closure (explosions / sub missiles, plus their overlays)
    todo = sorted(mis)
    while todo:
        m = todo.pop()
        row = ms_by[m]
        for c in MISSILE_LINK_COLS:
            v = row.get(c, '').strip().lower()
            if v in ms_by and v not in mis:
                mis.add(v)
                todo.append(v)
        po = row.get('ProgOverlay', '').strip().lower()
        if po in ov_by:
            ovl.add(po)
    state_loop = set()
    for s in sorted(stt):
        row = st_by[s]
        for c in STATE_OVERLAY_COLS:
            v = row.get(c, '').strip().lower()
            if v in ov_by:
                ovl.add(v)
                if c.startswith('overlay') or c == 'pgsvoverlay':
                    state_loop.add(v)
    for v in MISC_ALWAYS_OVERLAYS:
        if v in ov_by:
            ovl.add(v)
    for v in ov_by:
        if v.startswith('shrine_'):
            ovl.add(v)
    ovl.discard('null')
    return {'mis': sorted(mis), 'ms_by': ms_by, 'ovl': sorted(ovl), 'ov_by': ov_by, 'state_loop': state_loop,
            'n_mon': n_mon, 'n_skills': len(used_skills), 'n_states': len(stt)}


def resolve_art(folder, name):
    n = name.strip().lower().replace('\\', '/')
    if not n or n == 'null':
        return None
    return find_file('%s/%s' % (folder, n))


def trans_blend(v):
    v = num(v)
    if v in (1, 3, 8):
        return 'add'
    if v in (2, 5):
        return 'alpha50'
    return None


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    acts = list(ACTS)
    for i, a in enumerate(args):
        if a == '--acts':
            acts = [int(x) for x in args[i + 1].split(',')]
    t0 = time.time()
    objects = tab('objects.txt')
    objpreset = tab('objpreset.txt')
    lvlprest = tab('lvlprest.txt')
    byclass = {}
    for o in objects:
        byclass.setdefault(o['Class'], o)
    pre = {}
    for r in objpreset:
        pre[(num(r['Act']), num(r['Index']))] = r
    placed, nds1 = collect_ds1_objects(lvlprest, acts)
    print('ds1 files read: %d, placed type-2 object kinds: %d' % (nds1, len(placed)))
    unresolved = [k for k in placed if k not in pre or pre[k]['ObjectClass'] not in byclass]
    if unresolved:
        print('WARN unresolved placed objects: %r' % unresolved)

    # ---- object tokens, owned by the lowest act that needs them (one index key -> one group) ----
    tok_act = {}
    preset_cls = {}
    for a in acts:
        for (act, idx), r in sorted(pre.items()):
            if act != a:
                continue
            o = byclass.get(r['ObjectClass'])
            if not o:
                continue
            preset_cls[(act, idx)] = o
            if (act, idx) in placed or ALWAYS_RX.search(r['ObjectClass']):
                tok_act.setdefault(o['Token'].lower(), a)
    for c in EXTRA_OBJECT_CLASSES:
        if c in byclass:
            tok_act.setdefault(byclass[c]['Token'].lower(), min(acts))
    tok_rows = {}
    for o in objects:
        t = o['Token'].lower()
        if t in tok_act:
            tok_rows.setdefault(t, []).append(o)
    jobs = []
    obj_job_meta = []
    for tok in sorted(tok_act):
        if not os.path.isdir(G + 'objects/' + tok):
            continue
        o = tok_rows[tok][0]
        for mi, mode in enumerate(MODES):
            if num(o.get('Mode%d' % mi)) != 1:
                continue
            start = num(o.get('Start%d' % mi))
            count = num(o.get('FrameCnt%d' % mi))
            jobs.append(('obj', (tok, mode, start, count)))
            obj_job_meta.append((tok, mode, o, mi))

    # ---- missiles / overlays ----
    sel = select_missiles_overlays(acts)
    print('monsters: %d, skills: %d, states: %d' % (sel['n_mon'], sel['n_skills'], sel['n_states']))
    mis_files, mis_noart = {}, []
    for m in sel['mis']:
        p = resolve_art('missiles', sel['ms_by'][m].get('CelFile', ''))
        if p is None:
            mis_noart.append(m)
        else:
            mis_files[m] = p
    ovl_files, ovl_noart = {}, []
    for v in sel['ovl']:
        p = resolve_art('overlays', sel['ov_by'][v].get('Filename', ''))
        if p is None:
            ovl_noart.append(v)
        else:
            ovl_files[v] = p

    # ---- flippy ----
    flp = collections.OrderedDict()
    flp_noart = []
    for fn in ('armor.txt', 'weapons.txt', 'misc.txt'):
        for r in tab(fn):
            ff = r.get('flippyfile', '').strip().lower()
            if not ff:
                continue
            if fn != 'misc.txt' and r.get('normcode') and r['normcode'] != r['code']:
                continue
            if ff in flp:
                continue
            p = find_file('items/' + ff)
            if p is None:
                flp_noart.append(ff)
            else:
                flp[ff] = p

    # ---- decode in parallel ----
    uniq_files = collections.OrderedDict()
    for m in sorted(mis_files):
        uniq_files[mis_files[m]] = 'mis'
    for v in sorted(ovl_files):
        uniq_files[ovl_files[v]] = 'ovl'
    for ff in sorted(flp):
        uniq_files[flp[ff]] = 'flp'
    groups = collections.OrderedDict()
    for a in acts:
        groups['obj_act%d' % a] = d2anim.GroupAtlas('obj_act%d' % a)
    for k in ('mis', 'ovl', 'flp'):
        groups[k] = d2anim.GroupAtlas(k)
    errors = []

    pool = multiprocessing.Pool(max(1, min(10, os.cpu_count() or 2)))
    try:
        print('decoding %d object modes ...' % len(jobs))
        obj_res = pool.map(_worker, jobs, chunksize=1)
        print('decoding %d art files ...' % len(uniq_files))
        files = list(uniq_files.keys())
        file_res = pool.map(_worker, [('file', p) for p in files], chunksize=2)
    finally:
        pool.close()
        pool.join()

    def add_trimmed(atlas, tr_dirs):
        out = []
        n = len(tr_dirs)
        if n > MAX_DIRS and n % MAX_DIRS == 0:
            tr_dirs = tr_dirs[::n // MAX_DIRS]    # 32/64-dir missiles: 16 dirs (budget)
        for row in tr_dirs:
            r = []
            for t in row:
                if t is None:
                    r.append([])
                else:
                    r.append(atlas.add(t[0], t[1], t[2]))
            out.append(r)
        return out

    sheets = collections.OrderedDict()
    sheet_group = {}

    # ---- objects ----
    obj_sheets = {}
    missing_layers = collections.Counter()
    for (tok, mode, o, mi), res in zip(obj_job_meta, obj_res):
        if res is None:
            continue
        if isinstance(res, tuple) and res and res[0] == 'ERR':
            errors.append(res)
            continue
        at = groups['obj_act%d' % tok_act[tok]]
        for ml in res['missing']:
            missing_layers[(tok, mode, ml)] += 1
        delta = num(o.get('FrameDelta%d' % mi), 256)
        anim = {'dirs': res['dirs'], 'frames': res['frames'], 'fps': round(25.0 * delta / 256.0, 3),
                'loop': num(o.get('CycleAnim%d' % mi)) == 1}
        base = res['groups'].get(None)
        if base is None:
            anim['f'] = [[[] for _ in range(res['frames'])] for _ in range(res['dirs'])]
        else:
            anim['f'] = add_trimmed(at, base)
        fx = []
        for b in ('add', 'alpha50'):
            if b in res['groups']:
                fx.append({'blend': b, 'under': res['under'].get(b, False),
                           'f': add_trimmed(at, res['groups'][b])})
        if fx:
            anim['fx'] = fx
        obj_sheets.setdefault(tok, collections.OrderedDict())[mode] = anim
    for tok in sorted(obj_sheets):
        sheets['obj.' + tok] = {'anims': obj_sheets[tok]}
        sheet_group['obj.' + tok] = 'obj_act%d' % tok_act[tok]

    # ---- missiles ----
    file_cache = {}
    for p, res in zip(files, file_res):
        if isinstance(res, tuple) and res and res[0] == 'ERR':
            errors.append(res)
            continue
        file_cache[p] = (uniq_files[p], res)
    rect_cache = {}

    def rects_for(path, kind):
        if path in rect_cache:
            return rect_cache[path]
        r = add_trimmed(groups[kind], file_cache[path][1])
        rect_cache[path] = r
        return r

    mis_done = 0
    for m in sorted(mis_files):
        p = mis_files[m]
        if p not in file_cache:
            continue
        row = sel['ms_by'][m]
        r = rects_for(p, 'mis')
        speed = num(row.get('AnimSpeed'), 0)
        fps = 25.0 * speed / 16.0 if speed else 25.0 * num(row.get('animrate'), 1024) / 1024.0
        anim = {'dirs': len(r), 'frames': len(r[0]) if r else 0, 'fps': round(fps, 3),
                'loop': num(row.get('LoopAnim')) == 1, 'f': r}
        b = trans_blend(row.get('Trans'))
        if b:
            anim['blend'] = b
        sh = {'anims': {'NU': anim}, 'cel': row.get('CelFile', '').strip().lower(), 'trans': num(row.get('Trans'))}
        if num(row.get('Light')):
            sh['light'] = [num(row.get('Light')), num(row.get('Red')), num(row.get('Green')), num(row.get('Blue'))]
        if num(row.get('SubLoop')):
            sh['sub'] = [num(row.get('SubStart')), num(row.get('SubStop'))]
        if num(row.get('RandStart')):
            sh['rand'] = num(row.get('RandStart'))
        off = [num(row.get('xoffset')), num(row.get('yoffset')), num(row.get('zoffset'))]
        if any(off):
            sh['off'] = off
        sheets['mis.' + m] = sh
        sheet_group['mis.' + m] = 'mis'
        mis_done += 1

    # ---- overlays ----
    ovl_done = 0
    for v in sorted(ovl_files):
        p = ovl_files[v]
        if p not in file_cache:
            continue
        row = sel['ov_by'][v]
        r = rects_for(p, 'ovl')
        rate = num(row.get('AnimRate'), 16)
        anim = {'dirs': len(r), 'frames': len(r[0]) if r else 0, 'fps': round(25.0 * rate / 16.0, 3),
                'loop': v in sel['state_loop'], 'f': r}
        b = trans_blend(row.get('Trans'))
        if b:
            anim['blend'] = b
        sh = {'anims': {'NU': anim}, 'trans': num(row.get('Trans')), 'predraw': num(row.get('PreDraw')) == 1}
        if num(row.get('Xoffset')) or num(row.get('Yoffset')):
            sh['off'] = [num(row.get('Xoffset')), num(row.get('Yoffset'))]
        hs = [num(row.get('Height%d' % i)) for i in range(1, 5)]
        if any(hs):
            sh['height'] = hs
        if num(row.get('LoopWaitTime')):
            sh['loopWait'] = num(row.get('LoopWaitTime'))
        sheets['ovl.' + v] = sh
        sheet_group['ovl.' + v] = 'ovl'
        ovl_done += 1

    # ---- flippy ----
    flp_done = 0
    for ff in sorted(flp):
        p = flp[ff]
        if p not in file_cache:
            continue
        r = rects_for(p, 'flp')
        sheets['flp.' + ff] = {'anims': {'NU': {'dirs': len(r), 'frames': len(r[0]) if r else 0, 'fps': 25,
                                                  'loop': False, 'f': r}}}
        sheet_group['flp.' + ff] = 'flp'
        flp_done += 1

    # ---- presets ----
    presets = collections.OrderedDict()
    for (act, idx), o in sorted(preset_cls.items()):
        tok = o['Token'].lower()
        sh = sheets.get('obj.' + tok)
        modes = [m for m in MODES if sh and m in sh['anims']]
        sel_modes = [MODES[i] for i in range(8) if num(o.get('Selectable%d' % i)) == 1 and MODES[i] in modes]
        first = MODES.index(modes[0]) if modes else 0
        rec = collections.OrderedDict()
        rec['token'] = tok
        rec['name'] = o['Name']
        rec['cls'] = o['Class']
        rec['w'] = num(o['SizeX'])
        rec['h'] = num(o['SizeY'])
        rec['collide'] = num(o.get('HasCollision%d' % first)) == 1
        rec['selectable'] = bool(sel_modes)
        rec['modes'] = modes
        if sel_modes:
            rec['selModes'] = sel_modes
        rec['sprite'] = bool(sh)
        rec['placed'] = placed.get((act, idx), 0)
        if num(o.get('Draw')) != 1:
            rec['draw'] = False
        rec['orient'] = num(o.get('Orientation'))
        if num(o.get('Xoffset')) or num(o.get('Yoffset')):
            rec['off'] = [num(o.get('Xoffset')), num(o.get('Yoffset'))]
        lit = [num(o.get('Lit%d' % i)) for i in range(8)]
        if any(lit):
            rec['lit'] = lit
        if num(o.get('IsDoor')):
            rec['door'] = True
        if num(o.get('BlocksVis')):
            rec['blocksVis'] = True
        presets['act%d:%d' % (act, idx)] = rec

    # rects are collected per direction; the contract (brain/plans/diablo2-d2r.md) indexes f[frame][dir]
    def by_frame(f):
        return [list(col) for col in zip(*f)] if f else f
    for sh in sheets.values():
        for an in sh['anims'].values():
            an['f'] = by_frame(an['f'])
            for x in an.get('fx', []):
                x['f'] = by_frame(x['f'])

    # ---- pack + write one group file per atlas ----
    d2anim.clean_groups(['obj_', 'mis', 'ovl', 'flp'])
    sizes = {}
    jsbytes = 0
    for gname, at in groups.items():
        pages, nbytes, modes = at.save()
        body = {'pages': pages,
                'sheets': dict((k, v) for k, v in sheets.items() if sheet_group[k] == gname)}
        jsbytes += d2anim.write_group(gname, body)
        sizes[gname] = (len(pages), nbytes, ''.join('l' if m == 'll' else 'q' for m in modes))
    frag = {'sheets': dict((k, 'm/' + g) for k, g in sorted(sheet_group.items())),
            'objPresets': presets}
    __import__('build_index').write_fragment('objects', frag)

    total = sum(v[1] for v in sizes.values()) + jsbytes
    print('objects: %d sheets (%d presets, %d placed kinds), missiles: %d (no art: %d), overlays: %d (no art: %d), '
          'flippy: %d (no art: %d)' % (len(obj_sheets), len(presets), len(placed), mis_done, len(mis_noart),
                                       ovl_done, len(ovl_noart), flp_done, len(flp_noart)))
    print('group (pages, bytes, page modes l=lossless q=lossy):', sizes)
    print('total bytes %d (%.2f MB), group js %d, %.0fs' % (total, total / 1048576.0, jsbytes, time.time() - t0))
    if mis_noart:
        print('missiles without art:', ' '.join(mis_noart))
    if ovl_noart:
        print('overlays without art:', ' '.join(ovl_noart))
    if flp_noart:
        print('flippy without art:', ' '.join(flp_noart))
    if missing_layers:
        print('object layers missing on disk:', sorted(missing_layers)[:20], len(missing_layers))
    for e in errors:
        print('ERROR', e)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
