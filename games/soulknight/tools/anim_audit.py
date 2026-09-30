# -*- coding: utf-8 -*-
"""Kiem toan hoat anh Soul Knight: bo Animator trong prefab GOC 8.6 so voi du lieu web.

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/anim_audit.py [--only heroes,enemies,...] [--all-skins]

Ghi ANIM_AUDIT.md + ANIM_AUDIT.json canh file nay. Chi doc, khong sua tep nao khac. Xac dinh: moi thu duoc sap theo
ten, khong ghi gio.

Lop: heroes, enemies (man 1-1..3-5), bosses, weapons, pets, mounts, hall (NPC sanh), objects (ruong/cong/cua/tuong/
thuong nhan... trong common, levelcommon, levelobjects, level/1-3).

Mot "state" = trang thai cua AnimatorController (moi layer) co motion la AnimationClip. Voi moi state ta do:
  spr    so khoa sprite cua clip goc (0 = clip chi co duong cong Transform/mau/khac)
  flt    so duong float cua clip goc
Web mang state neu ten khop (bo tien to 'L<n>.'). Phan loai state thieu:
  missing_sprite    clip goc co khung sprite, web khong co
  missing_nosprite  clip goc chi co duong cong float (web lop sprite-only khong bieu dien duoc)
Lop web luu duong cong (bosses, weapons) thi moi state thieu deu tinh missing_sprite/nosprite theo clip goc.
"""
import argparse
import collections
import io
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from skrip import Rip, Node, AB86  # noqa: E402

GAME = os.path.dirname(HERE)
DATA = os.path.join(GAME, 'data')
DEC = r'D:\sk86-ref\decoded'
OUT_MD = os.path.join(HERE, 'ANIM_AUDIT.md')
OUT_JSON = os.path.join(HERE, 'ANIM_AUDIT.json')
LIMITS = []


# ------------------------------------------------------------------ nap du lieu web
def load_js(fn):
    s = io.open(os.path.join(DATA, fn), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'^window\.(\w+)\s*=\s*', s, re.M):
        out[m.group(1)], _ = json.JSONDecoder().raw_decode(s, m.end())
    return out


def load_json(*p):
    return json.load(io.open(os.path.join(DEC, *p), encoding='utf-8'))


def norm(n):
    return re.sub(r'^L\d+\.', '', n)


# ------------------------------------------------------------------ doc goc
rip = None
_cont = {}
_clipc = {}
_ctrlc = {}


def container(rel):
    """bundle rel -> {basename_lower: [(cab, ptr, path)]} chi prefab."""
    if rel in _cont:
        return _cont[rel]
    m = collections.defaultdict(list)
    for cab in rip.load(rel):
        for o in list(rip.files[cab].objects.values()):
            if o.type.name != 'AssetBundle':
                continue
            for path, info in rip.tree(cab, o)['m_Container']:
                if path.endswith('.prefab'):
                    m[os.path.basename(path)[:-7].lower()].append((cab, info['asset'], path))
    _cont[rel] = m
    return m


def prefab_node(rel, name, suffix=None):
    """Prefab theo ten trong bundle. Nhieu prefab cung ten (weapon/ va weapon_library/) thi chon cai co duong dan
    ket thuc bang `suffix` (Path trong config), khong co thi lay cai dau."""
    hits = container(rel).get(name.lower())
    if not hits:
        return None
    pick = [h for h in hits if suffix and h[2].lower().endswith(suffix.lower())]
    cab, ptr, _ = (pick or hits)[0]
    r = rip.resolve(ptr, cab)
    if not r or r[1].type.name != 'GameObject':
        return None
    return Node(rip, r[0], r[1])


def clip_info(ref):
    """ref = (cab, obj) -> {name, spr, flt, len, ev}; spr = so khoa sprite."""
    k = (ref[0], ref[1].path_id)
    if k not in _clipc:
        try:
            c = rip.clip(*ref)
            uq = len(set(rip.tree(*r)['m_Name'] for _t, r in c['keys'] if r))
            _clipc[k] = {'clip': c['name'], 'spr': len(c['keys']), 'uq': uq, 'flt': c['n_float'], 'len': round(c['len'], 4),
                         'ev': sorted(set(e[1] for e in c['events'] if e[1]))}
        except Exception as e:  # noqa: BLE001
            _clipc[k] = {'clip': None, 'spr': 0, 'uq': 0, 'flt': 0, 'len': 0, 'ev': [], 'err': str(e)[:80]}
            LIMITS.append('clip %s doc loi: %s' % (k, str(e)[:80]))
    return _clipc[k]


def ctrl_states(cab, o):
    """AnimatorController/Override -> [{layer, name, ref|None, motion: bool}] moi layer."""
    key = (cab, o.path_id)
    if key in _ctrlc:
        return _ctrlc[key]
    t = rip.tree(cab, o)
    out = []
    if o.type.name == 'AnimatorOverrideController':
        base = rip.resolve(t['m_Controller'], cab)
        out = [dict(s) for s in ctrl_states(*base)] if base else []
        over = {}
        for p in t.get('m_Clips', []):
            a = rip.resolve(p['m_OriginalClip'], cab)
            b = rip.resolve(p['m_OverrideClip'], cab)
            if a and b:
                over[(a[0], a[1].path_id)] = b
        for s in out:
            if s['ref']:
                s['ref'] = over.get((s['ref'][0], s['ref'][1].path_id), s['ref'])
    else:
        tos = dict(t['m_TOS'])
        clips = t['m_AnimationClips']
        for li, sm in enumerate(t['m_Controller']['m_StateMachineArray']):
            for st in sm['data']['m_StateConstantArray']:
                s = st['data']
                nm = tos.get(s['m_NameID'], str(s['m_NameID']))
                ref, motion = None, False
                for b in s['m_BlendTreeConstantArray']:
                    for nd in b['data']['m_NodeArray']:
                        motion = True
                        ci = nd['data']['m_ClipID']
                        if 0 <= ci < len(clips):
                            ref = rip.resolve(clips[ci], cab)
                        break
                    break
                out.append({'layer': li, 'name': nm, 'ref': ref, 'motion': motion})
    _ctrlc[key] = out
    return out


def animators(node, root_name=None):
    """Moi Animator trong cay prefab -> [{path, ctrl, states:[{n, layer, clip, spr, flt, len, ev}], nomotion:[ten]}]."""
    out = []
    for nd, path, _off in node.walk():
        a = nd.comp('Animator')
        if not a:
            continue
        ccab, co, t = a
        r = rip.resolve(t.get('m_Controller'), ccab)
        ent = {'path': path.lstrip('/'), 'ctrl': None, 'states': [], 'nomotion': []}
        if r:
            ent['ctrl'] = rip.tree(*r).get('m_Name')
            for s in ctrl_states(*r):
                nm = s['name'] if s['layer'] == 0 else 'L%d.%s' % (s['layer'], s['name'])
                if s['ref']:
                    ci = clip_info(s['ref'])
                    ent['states'].append(dict(n=nm, layer=s['layer'], **ci))
                elif s['motion']:
                    ent['states'].append(dict(n=nm, layer=s['layer'], clip=None, spr=0, uq=0, flt=0, len=0, ev=[],
                                              unresolved=1))
                else:
                    ent['nomotion'].append(nm)
        else:
            ent['no_controller'] = 1
        out.append(ent)
    return out


# ------------------------------------------------------------------ so sanh
def compare_set(orig_anims, web_states, web_frames):
    """orig_anims: animators() cua prefab goc. web_states: {ten_chuan: so_khung|None} tap state web co.
    -> (states_total, missing_sprite[], missing_nosprite[], frame_diff[], flt_dropped[], attack_missing[])."""
    ms, mn, fd, fl, am = [], [], [], [], []
    tot = 0
    seen = set()
    for an in orig_anims:
        for s in an['states']:
            nm = norm(s['n'])
            k = (an['path'], nm)
            if k in seen:
                continue
            seen.add(k)
            tot += 1
            has_att = any(e.lower().startswith('attack') for e in s['ev'])
            if nm not in web_states:
                (ms if s['spr'] else mn).append(an['path'] + ':' + nm if an['path'] else nm)
                if has_att:
                    am.append(nm)
                continue
            wf = web_frames.get(nm)
            if s['spr'] > 1 and wf is not None and wf < s['spr']:
                fd.append('%s (goc %d, web %d)' % (nm, s['spr'], wf))
            if s['flt']:
                fl.append(nm)
    return tot, ms, mn, fd, fl, am


def is_char(x):
    return bool(re.match(r'^(.*[:/])?(L\d+\.)?char_', x))


def entity(present, orig, web_states, web_frames, extra=None, curve_web=False):
    tot, ms, mn, fd, fl, am = compare_set(orig, web_states, web_frames)
    e = {'in_web': bool(present), 'states': tot, 'missing_sprite': ms, 'missing_nosprite': mn,
         'frame_diff': fd, 'flt_dropped': [] if curve_web else fl, 'attack_missing': am}
    if extra:
        e.update(extra)
    e['missing'] = len(ms) + len(mn)
    e['missing_core'] = len([x for x in ms + mn if not is_char(x)])
    e['complete'] = bool(present) and not e['missing_core']
    return e


def src_moves(orig):
    """Goc co state (khong tinh char_* dung chung) doi khung sprite hoac co duong cong float."""
    return any((s['uq'] > 1 or s['flt']) and not norm(s['n']).startswith('char_')
               for a in orig for s in a['states'])


def static_only(web_anim_keys, anims):
    """Web ve mot khung duy nhat: co it nhat mot anim va moi anim <= 1 khung khac nhau."""
    fr = [len(set(x for x in (anims.get(k) or {}).get('f', []) if x)) for k in web_anim_keys]
    return (not fr) or max(fr) <= 1


# ------------------------------------------------------------------ cac lop
def audit_heroes(D, all_skins):
    res = {}
    heroes = D['heroes']
    hj = load_json('heroes.json')
    folder_of = {}
    for cid, h in hj.items():
        folder_of[cid] = h.get('folder') or None
    idx_to_folder = {v['s0']['index']: f for f, v in heroes.items() if 's0' in v}
    base = os.path.join(AB86, 'skin', 'character')
    for f in sorted(heroes):
        skins_src = sorted(int(m.group(1)) for n in os.listdir(os.path.join(base, f))
                           for m in [re.match(r'skin_(\d+)\.ab$', n)] if m) if os.path.isdir(os.path.join(base, f)) else []
        rels = ['skin/character/%s/skin_%d.ab' % (f, i) for i in (skins_src if all_skins else [0])]
        web = heroes[f]
        s0 = web.get('s0', {})
        web_states = {k: len(D['anims'].get(s0.get(k), {}).get('f', [])) for k in ('idle', 'run', 'dead') if s0.get(k)}
        per_skin = {}
        for rel in rels:
            if rel not in rip.index['bundles']:
                continue
            sk = int(re.search(r'skin_(\d+)', rel).group(1))
            states = []
            for cab in rip.load(rel):
                for o in list(rip.files[cab].objects.values()):
                    if o.type.name in ('AnimatorController', 'AnimatorOverrideController'):
                        for s in ctrl_states(cab, o):
                            if s['ref']:
                                states.append(dict(n=s['name'], layer=s['layer'], **clip_info(s['ref'])))
                        break
            per_skin[sk] = states
        s0st = per_skin.get(0, [])
        orig = [{'path': '', 'states': s0st, 'nomotion': []}]
        # ten state trong controller 'skin' la idle/run/dead
        wst = {k: v for k, v in web_states.items()}
        if 'idle' in wst:
            wst['ide'] = wst['idle']   # controller goc goi la 'ide', web goi 'idle'
        e = entity('s0' in web, orig, wst, wst, {
            'skins_source': len(skins_src), 'skins_web': len([k for k in web if re.match(r's\d+$', k)]),
            'orig_states': {s['n']: {'spr': s['spr'], 'flt': s['flt']} for s in s0st},
            'web_states': web_states,
            'other_skin_states': {str(k): sorted(set(s['n'] for s in v) - set(x['n'] for x in s0st))
                                  for k, v in sorted(per_skin.items()) if k and set(s['n'] for s in v) - set(x['n'] for x in s0st)},
        })
        e['static'] = len(set(D['anims'].get(s0.get('idle'), {}).get('f', []))) <= 1
        res[f] = e
    return res


def enemy_list():
    ml = load_json('config', 'map_levels.json')
    en = load_json('config', 'enemies.json')
    used = collections.defaultdict(set)
    for k, v in ml.items():
        m = re.match(r'^(\d)月(\d)日$', v.get('Level') or '')
        if not m or int(m.group(1)) > 3:
            continue
        for x in v.get('Enemies', []):
            used[x['enemy']].add('%s-%s' % m.groups())
    return {k: (en[k], sorted(v)) for k, v in sorted(used.items()) if k in en}


def audit_enemies(D):
    res = {}
    for eid, (cfg, lv) in enemy_list().items():
        rel = cfg['AssetBundle'] + '.ab'
        w = D['enemies'].get(eid)
        if rel not in rip.index['bundles']:
            LIMITS.append('enemy %s: bundle %s khong co' % (eid, rel))
            res[eid] = {'in_web': bool(w), 'levels': lv, 'bundle': rel, 'states': 0, 'missing_sprite': [],
                        'missing_nosprite': [], 'frame_diff': [], 'flt_dropped': [], 'attack_missing': [],
                        'missing': 0, 'missing_core': 0, 'complete': bool(w), 'static': False, 'src_missing': 1}
            continue
        nd = prefab_node(rel, os.path.basename(cfg['Path'])[:-7], cfg['Path'])
        orig = animators(nd) if nd else []
        keys = list((w or {}).get('anims', {}))
        anim_keys = list((w or {}).get('anims', {}).values())
        for wp in (w or {}).get('weapons', []):
            keys += list(wp.get('anims', {}))
            anim_keys += list(wp.get('anims', {}).values())
        wa = {}
        wf = {}
        src = list((w or {}).get('anims', {}).items())
        for wp in (w or {}).get('weapons', []):
            src += list(wp.get('anims', {}).items())
        for st, ak in src:
            wa[norm(st)] = 1
            wf[norm(st)] = len(D['anims'].get(ak, {}).get('f', []))
        e = entity(w, orig, wa, wf, {'levels': lv, 'bundle': rel, 'animators': [a['path'] or '/' for a in orig],
                                     'src_prefab_found': bool(nd)})
        real_keys = [ak for st, ak in src if not norm(st).startswith('char_')]
        e['static'] = bool(w) and src_moves(orig) and static_only(real_keys, D['anims'])
        res[eid] = e
    return res


def audit_bosses(B):
    res = {}
    fights = {b for pool in B['pool'].values() for b in pool}
    fights |= {'boss12_1', 'boss12_2', 'boss01_2'}
    for bid in sorted(B['bosses']):
        b = B['bosses'][bid]
        rel = b['bundle']
        nd = prefab_node(rel, bid)
        orig = animators(nd) if nd else []
        rig = b.get('rig') or {}
        nodes = rig.get('nodes', [])
        web = collections.defaultdict(dict)   # path -> {state: spr_keys}
        for a in rig.get('anims', []):
            path = nodes[a['node']]['n'] if a['node'] < len(nodes) else '?'
            if a['node'] == 0:
                path = ''
            for ly in a['layers']:
                for sn, s in ly['states'].items():
                    spr = sum(len(c['s']) for c in s.get('cv', []) if c['k'] == 'spr')
                    web[path][sn] = spr
        missing_s, missing_n, fd, tot = [], [], [], 0
        for an in orig:
            seen = set()
            for s in an['states']:
                nm = norm(s['n'])
                if nm in seen:
                    continue
                seen.add(nm)
                tot += 1
                wp = web.get(an['path'])
                if wp is None or nm not in wp:
                    (missing_s if s['spr'] else missing_n).append((an['path'] + ':' if an['path'] else '') + nm)
                elif s['spr'] > 1 and wp[nm] < s['spr']:
                    fd.append('%s:%s (goc %d, web %d)' % (an['path'], nm, s['spr'], wp[nm]))
        n_web_states = sum(len(v) for v in web.values())
        multi = any(s['spr'] > 1 for a in orig for s in a['states'])
        anim_any = any(c['k'] == 'spr' for a in rig.get('anims', []) for ly in a['layers']
                       for s in ly['states'].values() for c in s.get('cv', []))
        e = {'in_web': True, 'fight': bid in fights, 'bundle': rel, 'states': tot, 'missing_sprite': missing_s,
             'missing_nosprite': missing_n, 'frame_diff': fd, 'flt_dropped': [], 'attack_missing': [],
             'missing': len(missing_s) + len(missing_n), 'web_states': n_web_states,
             'animators_src': len(orig), 'animators_web': len(rig.get('anims', [])),
             'src_prefab_found': bool(nd), 'static': n_web_states == 0 and tot > 0,
             'no_spr_curve': bool(multi) and not anim_any}
        e['missing_core'] = len([x for x in missing_s + missing_n if not is_char(x)])
        e['complete'] = not e['missing_core']
        res[bid] = e
    return res


def audit_weapons(W):
    res = {}
    rel = 'weapon.ab'
    cont = container(rel)
    names = sorted(n for n in cont if re.match(r'^weapon_\d+$', n))
    sms = W['sms']
    for n in names:
        w = W['weapons'].get(n)
        nd = prefab_node(rel, n, 'rgprefab/weapon/%s.prefab' % n)
        orig = animators(nd) if nd else []
        orig = [a for a in orig if a['states']]
        wa, wf = {}, {}
        if w and w.get('sm') is not None and w['sm'] < len(sms):
            for st in sms[w['sm']]['st']:
                wa[norm(st['n'])] = 1
        if not orig and not w:
            continue
        e = entity(w, orig, wa, wf, {'controllers': sorted(set(a['ctrl'] or '' for a in orig)),
                                     'attack_states_src': sorted(set(norm(s['n']) for a in orig for s in a['states']
                                                                    if any(x.lower().startswith('attack') for x in s['ev'])))},
                   curve_web=True)
        e['static'] = False
        e['name_vi'] = ((w or {}).get('n') or {}).get('vi')
        res[n] = e
    return res


def web_name_set(D, W, B):
    s = set()
    for k in D['anims']:
        s.add(k.split('/')[0].lower())
    for grp in ('enemies', 'prefabs'):
        s |= {k.lower() for k in D[grp]}
    s |= {k.lower() for k in B['bosses']}
    s |= {k.lower() for k in W['fx']}
    return s


def prefab_web(D, name):
    """Web prefab -> ({path: {state: frames}}, present)"""
    parts = D['prefabs'].get(name)
    web = collections.defaultdict(dict)
    webu = {}
    if parts is None:
        return web, False, webu
    for i, p in enumerate(parts):
        path = '' if i == 0 else (p.get('n') or '').lstrip('/')
        for st, ak in (p.get('a') or {}).items():
            web[path][norm(st)] = len(D['anims'].get(ak, {}).get('f', []))
            webu[norm(st)] = max(webu.get(norm(st), 0), len(set(D['anims'].get(ak, {}).get('f', []))))
    return web, True, webu


def audit_prefab_list(D, items, W=None, B=None, names=None):
    """items: [(id, rel, prefab_name)] -> ket qua theo id. So sanh theo duong dan animator khi web la 'prefabs'."""
    res = {}
    for eid, rel, pn, *sx in items:
        suffix = sx[0] if sx else None
        if rel not in rip.index['bundles']:
            continue
        nd = prefab_node(rel, pn, suffix)
        if not nd:
            continue
        orig = [a for a in animators(nd) if a['states']]
        if not orig:
            continue
        web, present, webu = prefab_web(D, pn)
        if not present and names is not None:
            present = pn.lower() in names
        ms, mn, fd, fl, tot = [], [], [], [], 0
        for a in orig:
            seen = set()
            for s in a['states']:
                nm = norm(s['n'])
                if nm in seen:
                    continue
                seen.add(nm)
                tot += 1
                wp = web.get(a['path'])
                if wp is None:   # web co the dat anim o mot part ten khac: nhan neu ten state co o bat ky part nao
                    wp = {}
                    for v in web.values():
                        wp.update(v)
                if nm not in wp:
                    (ms if s['spr'] else mn).append((a['path'] + ':' if a['path'] else '') + nm)
                else:
                    if s['spr'] > 1 and wp[nm] < s['spr']:
                        fd.append('%s (goc %d, web %d)' % (nm, s['spr'], wp[nm]))
                    if s['flt']:
                        fl.append(nm)
        wf = [u for k, u in webu.items() if not k.startswith('char_')]
        e = {'in_web': present and bool(D['prefabs'].get(pn)) or present, 'prefab': pn, 'bundle': rel, 'states': tot,
             'missing_sprite': ms, 'missing_nosprite': mn, 'frame_diff': fd, 'flt_dropped': fl, 'attack_missing': [],
             'missing': len(ms) + len(mn)}
        e['missing_core'] = len([x for x in ms + mn if not is_char(x)])
        e['complete'] = e['in_web'] and not e['missing_core']
        e['static'] = bool(e['in_web'] and src_moves(orig) and (not wf or max(wf) <= 1))
        res[eid] = e
    return res


OBJ_KIND = [
    ('chest', r'box|chest|treasure|crate|barrel'),
    ('portal', r'gate|portal|transfer|teleport'),
    ('door', r'door'),
    ('statue', r'statue|buff|altar'),
    ('merchant', r'seller|merchant|shop|npc|banker|smith|trader|vendor|hostess|dealer'),
    ('brazier', r'brazier|candle|torch|lamp'),
]


def kind_of(n):
    for k, rx in OBJ_KIND:
        if re.search(rx, n.lower()):
            return k
    return 'other'


def random_object_prefabs():
    """Prefab (khong tinh vu khi) trong bang random_objects: ruong, tiem, tuong, thuong nhan... -> {ten: path}."""
    out = {}

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str) and o.endswith('.prefab') and '/Weapon/' not in o:
            out.setdefault(os.path.basename(o)[:-7], o)
    walk(load_json('config', 'random_objects.json'))
    return out


def audit_objects(D, W, B):
    """Vat the man choi co animator: prefab trong random_objects, prefab web co, va ten khop ruong/cong/cua/tuong/
    thuong nhan/lo lua trong common, levelcommon, levelobjects, level/1-3."""
    names = web_name_set(D, W, B)
    ro = random_object_prefabs()
    want = {n.lower() for n in ro} | {n.lower() for n in D['prefabs']}
    items, seen = [], set()
    for rel in ['common.ab', 'levelcommon.ab', 'levelobjects.ab'] + rip.bundles('level/1/*', 'level/2/*', 'level/3/*'):
        if rel not in rip.index['bundles']:
            continue
        for n, hits in sorted(container(rel).items()):
            path = hits[0][2].lower()
            if '/enemy/' in path or re.match(r'^ex?_', n) or '/boss' in path or '/player/' in path or n in seen:
                continue
            if n in want or kind_of(n) != 'other':
                seen.add(n)
                items.append(('%s#%s' % (rel[:-3], n), rel, n, ro.get(n)))
    res = audit_prefab_list(D, items, names=names)
    for k, e in res.items():
        e['kind'] = kind_of(e['prefab'])
        e['source'] = ('random_objects' if e['prefab'] in ro else '') + ('+' if e['prefab'] in ro and e['prefab'] in D['prefabs'] else '') + ('web' if e['prefab'] in D['prefabs'] else '')
    return res


def audit_pets(D, W, B, kind):
    names = web_name_set(D, W, B)
    cfg = load_json('config', kind + '.json')
    items = []
    for k, v in sorted(cfg.items()):
        rel = v['AssetBundle'] + '.ab'
        items.append((k, rel, os.path.basename(v['PrefabPath'])[:-7], v['PrefabPath']))
    res = audit_prefab_list(D, items, names=names)
    for k in cfg:
        if k not in res:
            res[k] = None
    return {k: v for k, v in res.items() if v}


def audit_hall(D, W, B):
    names = web_name_set(D, W, B)
    items = []
    for rel in rip.bundles('hero_room/*'):
        for n, hits in sorted(container(rel).items()):
            items.append(('%s#%s' % (rel[:-3], n), rel, n))
    return audit_prefab_list(D, items, names=names)


# ------------------------------------------------------------------ tong hop + ghi
def summarize(res):
    ents = list(res.values())
    n = len(ents)
    in_web = [e for e in ents if e['in_web']]
    return {
        'entities': n,
        'absent_in_web': n - len(in_web),
        'with_all_states': sum(1 for e in ents if e['complete']),
        'missing_states': sum(e['missing'] for e in ents),
        'missing_sprite_states': sum(len(e['missing_sprite']) for e in ents),
        'missing_nosprite_states': sum(len(e['missing_nosprite']) for e in ents),
        'entities_missing_any': sum(1 for e in ents if e['in_web'] and e['missing_core']),
        'frame_diff_states': sum(len(e['frame_diff']) for e in ents),
        'float_curves_dropped_states': sum(len(e['flt_dropped']) for e in ents),
        'missing_char_generic': sum(1 for e in ents for x in e['missing_sprite'] + e['missing_nosprite']
                                    if is_char(x)),
        'static_single_frame': sum(1 for e in ents if e.get('static')),
        'source_states': sum(e['states'] for e in ents),
    }


def trunc(lst, n=10):
    return ', '.join(lst[:n]) + (' (+%d)' % (len(lst) - n) if len(lst) > n else '')


def write_md(classes):
    L = ['# Kiem toan hoat anh Soul Knight: goc 8.6 so voi web', '',
         'Sinh boi `tools/anim_audit.py`, khong sua tay. Nguon: Animator trong prefab goc (D:\\sk86-ref) so voi '
         '`data/sk-data.js`, `sk-bosses86.js`, `sk-weapons86.js`. Nhan: [DO] cho moi con so o day.', '',
         '- "state" = trang thai AnimatorController co motion la mot AnimationClip (moi layer). Web mang state neu '
         'ten khop (bo tien to `L<n>.`).',
         '- `thieu-sprite`: clip goc co khung sprite ma web khong co state do. `thieu-transform`: clip goc chi co '
         'duong cong Transform/mau; lop web chi luu khung sprite (quai, vat the) khong bieu dien duoc.',
         '- `mat-cong`: state web co khung sprite nhung clip goc con duong cong float (co gian, doi mau, di chuyen) '
         'bi bo. Lop bosses/weapons web luu duong cong nen khong tinh cot nay.',
         '- `lech-khung`: web it khung sprite hon clip goc.',
         '- `tinh`: web ve mot khung duy nhat du clip goc co >1 khung.', '',
         '## Tong hop', '',
         '| lop | thuc the | vang mat o web | du state (bo char_*) | thieu state | trong do char_* | '
         'thieu-sprite | thieu-transform | lech-khung | mat-cong | tinh |',
         '|---|---|---|---|---|---|---|---|---|---|---|']
    for c, v in classes.items():
        s = v['summary']
        L.append('| %s | %d | %d | %d | %d | %d | %d | %d | %d | %d | %d |' % (
            c, s['entities'], s['absent_in_web'], s['with_all_states'], s['missing_states'],
            s['missing_char_generic'], s['missing_sprite_states'], s['missing_nosprite_states'], s['frame_diff_states'],
            s['float_curves_dropped_states'], s['static_single_frame']))
    L += ['', 'Cot "vang mat o web": thuc the goc khong co trong du lieu web (khong tinh vao "du state"). '
          '"thieu state" tinh tren moi thuc the (thuc the vang mat tinh het state cua no). `char_*` la state dung chung '
          '(char_hit, char_dizzy, char_tap_dead, char_hide_tap, char_angry) va khong tinh vao "du state".', '']
    for c, v in classes.items():
        L += ['## %s' % c, '']
        s = v['summary']
        if c == 'heroes':
            ents = v['entities']
            ss = sum(e['skins_source'] for e in ents.values())
            sw = sum(e['skins_web'] for e in ents.values())
            L += ['Skin: goc %d, web %d (chi skin 0).' % (ss, sw), '']
        bad = [(k, e) for k, e in v['entities'].items() if e['missing_core'] or not e['in_web'] or e.get('static')
               or e['frame_diff']]
        if not bad:
            L += ['Khong co thuc the nao thieu.', '']
            continue
        L += ['| thuc the | ghi chu | thieu-sprite | thieu-transform | lech-khung |', '|---|---|---|---|---|']
        for k, e in bad:
            note = []
            if not e['in_web']:
                note.append('vang mat o web')
            if e.get('static'):
                note.append('tinh')
            if e.get('levels'):
                note.append('man ' + ','.join(e['levels'][:4]) + ('...' if len(e['levels']) > 4 else ''))
            if e.get('kind'):
                note.append(e['kind'])
            if e.get('no_spr_curve'):
                note.append('khong co duong sprite')
            L.append('| %s | %s | %s | %s | %s |' % (
                k, '; '.join(note), trunc(e['missing_sprite']), trunc(e['missing_nosprite']), trunc(e['frame_diff'], 4)))
        L.append('')
    L += ['## Gioi han cua phep do', '',
          '- Chi tinh Animator trong prefab. Hieu ung ky nang, vien dan, VFX (prefab rieng) khong nam trong ban kiem toan nay.',
          '- Hero: prefab khong gan controller (gan luc chay); dung controller `skin` trong `skin/character/<thu muc>/skin_0.ab`. '
          'Moi skin khac chi dem so bundle (chay `--all-skins` de doc controller tung skin).',
          '- State nhieu node trong blend tree: lay clip dau tien (giong build_sk.py). State khong co motion khong tinh.',
          '- Quai: moi map A..F cua man 1-1..3-5 trong `map_levels` (ke ca ban bien the e_old_*, e_dream_*); web chi co 13 theme.',
          '- So khop theo ten state, khong so noi dung clip: state cung ten nhung clip khac van tinh la du.',
          '- Bosses/weapons: web luu duong cong nen thieu-transform la thieu that. Quai/vat the: web chi luu khung sprite.']
    if LIMITS:
        L += ['', '## Loi khi doc', ''] + ['- ' + x for x in sorted(set(LIMITS))[:40]] + ['']
    io.open(OUT_MD, 'w', encoding='utf-8', newline='\n').write('\n'.join(L))


ALL = ['heroes', 'enemies', 'bosses', 'weapons', 'pets', 'mounts', 'hall', 'objects']


def main():
    global rip
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=','.join(ALL))
    ap.add_argument('--all-skins', action='store_true', help='doc controller cua moi skin, khong chi skin 0 (cham)')
    a = ap.parse_args()
    only = [x for x in a.only.split(',') if x]
    t0 = time.time()
    D = load_js('sk-data.js')['SK_DATA']
    B = load_js('sk-bosses86.js')['SK_BOSSES86']
    W = load_js('sk-weapons86.js')['SK_W86']
    rip = Rip(bundles=['hero'])
    classes = collections.OrderedDict()
    for c in ALL:
        if c not in only:
            continue
        t1 = time.time()
        if c == 'heroes':
            r = audit_heroes(D, a.all_skins)
        elif c == 'enemies':
            r = audit_enemies(D)
        elif c == 'bosses':
            r = audit_bosses(B)
        elif c == 'weapons':
            r = audit_weapons(W)
        elif c in ('pets', 'mounts'):
            r = audit_pets(D, W, B, c)
        elif c == 'hall':
            r = audit_hall(D, W, B)
        else:
            r = audit_objects(D, W, B)
        r = collections.OrderedDict(sorted(r.items()))
        classes[c] = {'summary': summarize(r), 'entities': r}
        print(c, classes[c]['summary'], '%.0fs' % (time.time() - t1), flush=True)
    io.open(OUT_JSON, 'w', encoding='utf-8', newline='\n').write(
        json.dumps({'classes': classes, 'limits': sorted(set(LIMITS))}, ensure_ascii=False, indent=1, sort_keys=True))
    write_md(classes)
    print('xong %.0fs, bundles nap %d' % (time.time() - t0, len(rip.loaded)))


if __name__ == '__main__':
    main()
