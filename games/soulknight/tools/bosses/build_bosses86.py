# -*- coding: utf-8 -*-
"""Bóc trùm thật của Soul Knight 8.6.0 cho js/bosses.js -> data/sk-bosses86.js + tools/extra/bosses.json.

Chạy (≈2 phút, cần D:\\sk86-ref và D:\\sk86-ref\\decoded của tools/config86):
    PYTHONIOENCODING=utf-8 python games/soulknight/tools/bosses/build_bosses86.py
rồi chạy lever (build_sk.py) để các sprite mà tệp extra xin vào atlas. Xem README.md cùng thư mục.
"""
import collections
import io
import json
import math
import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
from skrip import Rip  # noqa: E402

import skrip  # noqa: E402

DEC = os.path.join(skrip.REF, 'decoded')
WORK = os.path.join(skrip.REF, 'work', 'bosses')
OUT_JS = os.path.join(TOOLS, '..', 'data', 'sk-bosses86.js')
OUT_EXTRA = os.path.join(TOOLS, 'extra', 'bosses.json')

# Theme web -> LevelKey của config/enemies (level/1/a = forest ...) [ĐO themes[x].bundle trong sk-data.js]
THEME_KEY = {'forest': '1A', 'glacier': '1B', 'ruins': '1C', 'castle': '2A', 'graveyard': '2B', 'halloween': '2C',
             'icecave': '2D', 'swamp': '2E', 'relic': '2F', 'machinery': '2G', 'aliens': '3A', 'volcano': '3B', 'island': '3C'}
# Trận cuối Khu Thí Luyện: Tước Sĩ Đỏ (thường) / Tước Sĩ Tím (Lợi Hại) [ĐO enemies.boss_bossrush_final*, Path Level/bossrush];
# prefab nằm trong levelobjects.ab chứ không có bundle boss/ riêng.
EXTRA_POOL = {'bossrush_final': ['boss_bossrush_final', 'boss_bossrush_final_badass']}
BUNDLE_OF = {'boss_bossrush_final': 'levelobjects', 'boss_bossrush_final_badass': 'levelobjects'}
# Prefab phụ do AI trùm sinh ra (quái con, bia mộ...) cũng cần rig.
SUB_PREFABS = {'boss20': ['e_slime01_temp'], 'boss18': ['temp_tombstone1', 'temp_tombstone2', 'e_mummy03_temp',
                                                          'e_mummy04_temp', 'e_mummy05_temp'],
               'boss19': [], 'boss12': ['boss12_1', 'boss12_2']}
SKIP_NODES = {'collider', 'shadow_lock', 'dead_tap'}
BULLET_BUNDLES = ('bullet', 'common', 'levelcommon')

ATTR = {zlib.crc32(s.encode()): s for s in (
    'm_IsActive', 'm_Enabled', 'm_Color.r', 'm_Color.g', 'm_Color.b', 'm_Color.a', 'm_AnchoredPosition.x',
    'm_AnchoredPosition.y', 'm_SizeDelta.x', 'm_SizeDelta.y', 'm_FillAmount', 'm_Sprite', 'm_IsTrigger')}
SHORT = {'m_IsActive': 'on', 'm_Enabled': 'en', 'm_Color.r': 'cr', 'm_Color.g': 'cg', 'm_Color.b': 'cb',
         'm_Color.a': 'ca', 'm_AnchoredPosition.x': 'ax', 'm_AnchoredPosition.y': 'ay', 'm_SizeDelta.x': 'wx',
         'm_SizeDelta.y': 'wy', 'm_FillAmount': 'fill'}


def r4(x):
    return round(float(x), 4)


def jload(*p):
    return json.load(io.open(os.path.join(DEC, *p), encoding='utf-8'))


rip = Rip(bundles=[])
sprites_used = {}   # tên sprite -> bundle (sprite thế giới, PPU 16)
sprite_obj = {}     # tên sprite -> (cab, obj)
MB_SPRITES = [False]
ui_sprites = {}     # sprite UI (giữ điểm ảnh gốc) -> bundle
UI = [False]
log = []


def zdeg(q):
    return math.degrees(2 * math.atan2(q['z'], q['w']))


def plain(v, cab, depth=0):
    """typetree -> số/chuỗi; con trỏ -> 'Kiểu:tên'."""
    if depth > 6:
        return None
    if isinstance(v, dict):
        if set(v) == {'m_FileID', 'm_PathID'}:
            if not v['m_PathID']:
                return None
            r = rip.resolve(v, cab)
            if not r:
                return '?missing'
            try:
                # Sprite trỏ từ MB của trùm (BossAI07.angry_body...) cũng phải vào atlas, không chỉ sprite của rig.
                if MB_SPRITES[0] and r[1].type.name == 'Sprite':
                    sprite_name(v, cab)
                return r[1].type.name + ':' + (rip.tree(*r).get('m_Name') or '')
            except Exception:
                return r[1].type.name
        if 'm_PersistentCalls' in v or 'serializationData' in v:
            return None
        out = {}
        for k, x in v.items():
            if k in ('m_GameObject', 'm_Script', 'm_Enabled', 'm_EditorHideFlags', 'm_EditorClassIdentifier', 'm_Name',
                     'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset'):
                continue
            y = plain(x, cab, depth + 1)
            if y is not None and y != {} and y != []:
                out[k] = y
        return out
    if isinstance(v, list):
        if len(v) > 64:
            return None
        return [plain(x, cab, depth + 1) for x in v]
    if isinstance(v, float):
        return r4(v)
    return v


def sprite_name(ptr, cab):
    r = rip.resolve(ptr, cab)
    if not r:
        return None
    nm = rip.tree(*r).get('m_Name')
    if nm and nm != 'nothing':
        (ui_sprites if UI[0] else sprites_used).setdefault(nm, rip.bundle_of.get(r[0]) or rip.cab_bundle.get(r[0]))
        sprite_obj.setdefault(nm, r)
    return nm


# ---------------------------------------------------------------- clip
def clip_export(cab, o, pathmap):
    """AnimationClip -> {len, loop, ev, cv:[{n, k, s}]}. Cách đọc đường cong giống tools/vfx/build_vfx.py."""
    t = rip.tree(cab, o)
    mc = t['m_MuscleClip']
    data = mc['m_Clip']['data']
    sc, dense, const = data['m_StreamedClip'], data['m_DenseClip'], data['m_ConstantClip']
    binds = t['m_ClipBindingConstant']['genericBindings']
    mapping = t['m_ClipBindingConstant']['pptrCurveMapping']
    slots, pslots, idx = [], [], 0
    for b in binds:
        if b['isPPtrCurve']:
            pslots.append((b, idx))
            idx += 1
            continue
        n = {1: 3, 2: 4, 3: 3, 4: 3}.get(b['attribute'], 1) if b['typeID'] == 4 else 1
        slots.append((b, idx, n))
        idx += n
    total = idx
    keys = collections.defaultdict(list)
    raw = struct.pack('<%dI' % len(sc['data']), *sc['data']) if sc['data'] else b''
    i = 0
    while i + 8 <= len(raw):
        tm, n = struct.unpack_from('<fI', raw, i)
        i += 8
        for _ in range(n):
            ci, = struct.unpack_from('<I', raw, i)
            c = struct.unpack_from('<4f', raw, i + 4)
            i += 20
            keys[ci].append((tm, c))
    nd = dense['m_CurveCount']
    cvals = const['data']
    base_const = total - len(cvals)
    base_dense = base_const - nd
    if nd:
        arr, fc = dense['m_SampleArray'], dense['m_FrameCount']
        rate, t0 = dense['m_SampleRate'] or 30, dense['m_BeginTime']
        for j in range(nd):
            vals = [arr[f * nd + j] for f in range(fc)]
            for f in range(fc):
                v = vals[f]
                sl = (vals[f + 1] - v) * rate if f + 1 < fc else 0.0
                keys[base_dense + j].append((t0 + f / rate, (0.0, 0.0, sl, v)))
    for j, v in enumerate(cvals):
        keys[base_const + j].append((0.0, (0.0, 0.0, 0.0, v)))

    def seg(ci):
        out = []
        for tm, c in sorted(keys.get(ci, []), key=lambda x: x[0]):
            if tm > 1e30:
                continue
            tm = 0.0 if tm < -1e30 else tm
            row = [r4(tm), r4(c[0]), r4(c[1]), r4(c[2]), r4(c[3])]
            if out and abs(out[-1][0] - row[0]) < 1e-6:
                out[-1] = row
            else:
                out.append(row)
        return [[x[0], x[4]] if x[1] == 0 and x[2] == 0 and x[3] == 0 else x for x in out]

    cv = []
    for b, ci, n in slots:
        node = pathmap.get(b['path'])
        if node is None:
            continue
        ty, at = b['typeID'], b['attribute']
        props = None
        if ty == 4:
            props = {1: ['px', 'py', 'pz'], 2: ['qx', 'qy', 'qz', 'qw'], 3: ['sx', 'sy', 'sz'], 4: ['ex', 'ey', 'ez']}.get(at)
        else:
            nm = ATTR.get(at)
            if nm in SHORT:
                k = SHORT[nm]
                if ty in (58, 61, 68, 70) and k == 'en':
                    k = 'col'
                props = [k]
        if not props:
            continue
        for j, k in enumerate(props):
            if k in ('pz', 'sz', 'ex', 'ey', 'qx', 'qy'):
                continue
            s = seg(ci + j)
            if s:
                cv.append({'n': node, 'k': k, 's': s})
    for b, ci in pslots:
        node = pathmap.get(b['path'])
        if node is None or not (b['typeID'] in (212, 114) and b['attribute'] in (0, zlib.crc32(b'm_Sprite'))):
            continue
        s = []
        for tm, c in sorted(keys.get(ci, []), key=lambda x: x[0]):
            if tm > 1e30:
                continue
            k = int(round(c[3]))
            fr = sprite_name(mapping[k], cab) if 0 <= k < len(mapping) else None
            tm = 0.0 if tm < -1e30 else tm
            if s and abs(s[-1][0] - tm) < 1e-6:
                s[-1] = [r4(tm), fr]
            else:
                s.append([r4(tm), fr])
        if s:
            cv.append({'n': node, 'k': 'spr', 's': s})
    ev = []
    for e in t.get('m_Events', []):
        row = [r4(e['time']), e['functionName']]
        if e.get('data'):
            row.append(e['data'])
        elif e.get('intParameter'):
            row.append(e['intParameter'])
        elif e.get('floatParameter'):
            row.append(r4(e['floatParameter']))
        ev.append(row)
    out = {'clip': t['m_Name'], 'len': r4(mc['m_StopTime'] - mc['m_StartTime']), 'cv': cv}
    if mc.get('m_LoopTime'):
        out['loop'] = 1
    if ev:
        out['ev'] = ev
    return out


def controller_export(cab, o, pathmap):
    """Animator controller -> {layers: [{def, states: {tên: {clip..., spd?, next?}}}]}."""
    t = rip.tree(cab, o)
    if o.type.name == 'AnimatorOverrideController':
        base = rip.resolve(t['m_Controller'], cab)
        over = {}
        for p in t.get('m_Clips', []):
            a = rip.resolve(p['m_OriginalClip'], cab)
            b = rip.resolve(p['m_OverrideClip'], cab)
            if a and b:
                over[(a[0], a[1].path_id)] = b
        return controller_export(base[0], base[1], pathmap) if not over else _ctrl(*base, pathmap, over)
    return _ctrl(cab, o, pathmap, {})


def _ctrl(cab, o, pathmap, over):
    t = rip.tree(cab, o)
    tos = dict(t['m_TOS'])
    clips = t['m_AnimationClips']
    layers = []
    done = {}
    for sm in t['m_Controller']['m_StateMachineArray']:
        states = sm['data']['m_StateConstantArray']
        names = [tos.get(s['data']['m_NameID'], str(s['data']['m_NameID'])) for s in states]
        L = {'states': {}}
        di = sm['data'].get('m_DefaultState', 0)
        if 0 <= di < len(names):
            L['def'] = names[di]
        for si, sw in enumerate(states):
            s = sw['data']
            clip = None
            for b in s['m_BlendTreeConstantArray']:
                for ndd in b['data']['m_NodeArray']:
                    ci = ndd['data']['m_ClipID']
                    if 0 <= ci < len(clips):
                        clip = rip.resolve(clips[ci], cab)
                    break
                break
            if not clip or rip.tree(*clip).get('m_Name', '').startswith('char_'):
                continue
            clip = over.get((clip[0], clip[1].path_id), clip)
            k = (clip[0], clip[1].path_id)
            if k not in done:
                done[k] = clip_export(clip[0], clip[1], pathmap)
            e = dict(done[k])
            if abs(s.get('m_Speed', 1.0) - 1.0) > 1e-4:
                e['spd'] = r4(s['m_Speed'])
            for tr in s.get('m_TransitionConstantArray', []):
                td = tr['data']
                d = td.get('m_DestinationState')
                if not td.get('m_ConditionConstantArray') and td.get('m_HasExitTime', True) and isinstance(d, int) \
                        and 0 <= d < len(names):
                    e['next'] = names[d]
                    break
            L['states'][names[si]] = e
        layers.append(L)
    return layers


# ---------------------------------------------------------------- rig
def rig_export(root, ui=False):
    UI[0] = ui
    try:
        return _rig(root, ui)
    finally:
        UI[0] = False


def _rig(root, ui):
    nodes, objs = [], []

    def visit(nd, parent, path):
        if parent == 0 and nd.name in SKIP_NODES:
            return
        t = nd.t
        e = {'n': path or nd.name, 'p': parent}
        if ui and 'm_AnchorMin' in t:
            e.update({'amin': [r4(t['m_AnchorMin']['x']), r4(t['m_AnchorMin']['y'])],
                      'amax': [r4(t['m_AnchorMax']['x']), r4(t['m_AnchorMax']['y'])],
                      'pos': [r4(t['m_AnchoredPosition']['x']), r4(t['m_AnchoredPosition']['y'])],
                      'size': [r4(t['m_SizeDelta']['x']), r4(t['m_SizeDelta']['y'])],
                      'piv': [r4(t['m_Pivot']['x']), r4(t['m_Pivot']['y'])]})
        else:
            p = t['m_LocalPosition']
            e['x'], e['y'] = r4(p['x']), r4(p['y'])
        rz = zdeg(t['m_LocalRotation'])
        if abs(rz) > 1e-3:
            e['r'] = r4(rz)
        s = t['m_LocalScale']
        if (r4(s['x']), r4(s['y'])) != (1, 1):
            e['sx'], e['sy'] = r4(s['x']), r4(s['y'])
        if not nd.active:
            e['off'] = 1
        sr = nd.comp('SpriteRenderer')
        if sr:
            ccab, co, st = sr
            f = sprite_name(st.get('m_Sprite'), ccab)
            if f and f != 'nothing':
                e['f'] = f
            e['o'] = st.get('m_SortingOrder', 0)
            if st.get('m_SortingLayer'):
                e['L'] = st['m_SortingLayer']
            c = st.get('m_Color') or {}
            if c and (r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])) != (1, 1, 1, 1):
                e['c'] = [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]
            if st.get('m_FlipX'):
                e['fx'] = 1
            if st.get('m_FlipY'):
                e['fy'] = 1
            if not st.get('m_Enabled', 1):
                e['en'] = 0
        for tn, ccab, co in nd.comps:
            if tn in ('ParticleSystem', 'TrailRenderer', 'LineRenderer'):
                e.setdefault('fx3', []).append(tn)
        if ui:
            for cls, mcab, mt in nd.mbs():
                if cls == 'Image':
                    f = sprite_name(mt.get('m_Sprite'), mcab)
                    e['img'] = f
                    c = mt.get('m_Color')
                    if c:
                        e['c'] = [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]
                    e['it'] = mt.get('m_Type', 0)
                elif cls == 'Text':
                    fd = mt.get('m_FontData', {})
                    e['txt'] = {'v': mt.get('m_Text'), 's': fd.get('m_FontSize'), 'al': fd.get('m_Alignment')}
                    c = mt.get('m_Color')
                    if c:
                        e['txt']['c'] = [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]
                elif cls == 'Shadow':
                    c = mt.get('m_EffectColor')
                    d = mt.get('m_EffectDistance')
                    e['shadow'] = {'c': [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])] if c else None,
                                   'd': [r4(d['x']), r4(d['y'])] if d else None}
        col = {}
        for tn, ccab, co in nd.comps:
            if tn in ('CircleCollider2D', 'BoxCollider2D'):
                ct = rip.tree(ccab, co)
                c = {'trig': int(bool(ct.get('m_IsTrigger'))), 'off': [r4(ct['m_Offset']['x']), r4(ct['m_Offset']['y'])]}
                if tn == 'CircleCollider2D':
                    c['r'] = r4(ct['m_Radius'])
                else:
                    c['size'] = [r4(ct['m_Size']['x']), r4(ct['m_Size']['y'])]
                col[tn[:3].lower()] = c
        if col:
            e['col'] = col
        mbs = {}
        for cls, mcab, mt in nd.mbs():
            if cls and cls not in ('Image', 'Text', 'Shadow', 'RGNetBehaviour', 'CanvasRenderer'):
                mbs[cls] = plain(mt, mcab)
        if mbs and parent >= 0:
            e['mbs'] = mbs
        i = len(nodes)
        nodes.append(e)
        objs.append(nd)
        for ch in nd.children():
            visit(ch, i, (path + '/' if path else '') + ch.name)

    visit(root, -1, '')
    anims = []
    for i, nd in enumerate(objs):
        a = nd.comp('Animator')
        if not a:
            continue
        ccab, co, at = a
        rc = rip.resolve(at.get('m_Controller'), ccab)
        if not rc:
            continue
        base = nodes[i]['n'] if i else ''
        pathmap = {}
        for j, e in enumerate(nodes):
            nm = e['n'] if j else ''
            if i == 0:
                rel = nm
            elif nm == base:
                rel = ''
            elif nm.startswith(base + '/'):
                rel = nm[len(base) + 1:]
            else:
                continue
            pathmap[zlib.crc32(rel.encode())] = j
        anims.append({'node': i, 'layers': controller_export(rc[0], rc[1], pathmap)})
    return {'nodes': nodes, 'anims': anims}


# ---------------------------------------------------------------- tìm prefab theo tên
_by_name = {}


def find_root(name, rels):
    for rel in rels:
        if rel not in _by_name:
            m = {}
            for cab in rip.load(rel):
                for r in rip.roots(cab):
                    m.setdefault(r.name, r)
            _by_name[rel] = m
        if name in _by_name[rel]:
            return _by_name[rel][name], rel
    return None, None


GO_REF = re.compile(r'^GameObject:(.+)$')


def refs_in(v, out):
    """Mọi 'GameObject:x' trong MB đã plain."""
    if isinstance(v, dict):
        for x in v.values():
            refs_in(x, out)
    elif isinstance(v, list):
        for x in v:
            refs_in(x, out)
    elif isinstance(v, str):
        m = GO_REF.match(v)
        if m:
            out.append(m.group(1))
    return out


def main():
    os.makedirs(WORK, exist_ok=True)
    enemies = jload('config', 'enemies.json')
    loc = jload('localization_en_vi.json')
    # bosses.json (tên + lớp AI) của bộ giải cũ không còn: tên lấy localization theo id, lớp AI là MB tên Boss*.
    bosses_tbl = jload('bosses.json') if os.path.exists(os.path.join(DEC, 'bosses.json')) else {}
    pool = {}
    for theme, key in THEME_KEY.items():
        subs = {v['SubspeciesBoss'] for v in enemies.values() if v.get('SubspeciesBoss')}
        ids = [k for k, v in enemies.items() if v.get('IsBoss') and v.get('LevelKey') == key and k not in subs
               and not re.match(r'.*_(horse|\d)$', k) and v.get('Path', '').startswith('Level/')]
        pool[theme] = ids
    pool.update(EXTRA_POOL)
    print('pool', pool)
    out = {'v': 1, 'pool': pool, 'bosses': {}, 'bullets': {}, 'info': {}}
    want_bullets = []
    for theme, ids in pool.items():
        for bid in ids:
            row = enemies[bid]
            m = re.match(r'.*/Boss/([^/]+)/', row['Path'], re.I)
            bundle = BUNDLE_OF.get(bid) or 'boss/' + m.group(1).lower()
            kids = [bid] + ([row['SubspeciesBoss']] if row.get('SubspeciesBoss') else []) + SUB_PREFABS.get(bid, [])
            if bid == 'boss12_parent':
                kids = ['boss12_parent'] + SUB_PREFABS['boss12']
            for pid in kids:
                if pid in out['bosses']:
                    continue
                root, rel = find_root(pid, [bundle + '.ab'])
                if root is None:
                    log.append('thiếu prefab %s trong %s' % (pid, bundle))
                    continue
                rig = rig_export(root)
                cfg = enemies.get(pid) or {}
                tb = bosses_tbl.get(pid) or {}
                ent = {'bundle': rel, 'rig': rig, 'hp': cfg.get('Hp'), 'speed': cfg.get('Speed'),
                       'name': tb.get('name') or ({'en': loc[pid][0], 'vi': loc[pid][1]} if pid in loc else {}),
                       'ai': tb.get('ai'), 'weapon': cfg.get('BossWeapon'),
                       'bgm': (cfg.get('BossBgm') or '').split('/')[-1].replace('.mp3', ''),
                       'sub': cfg.get('SubspeciesBoss') or None, 'level': cfg.get('LevelKey')}
                MB_SPRITES[0] = True
                for cls, mcab, mt in root.mbs():
                    if cls and cls not in ('RGNetBehaviour',):
                        ent.setdefault('mbs', {})[cls] = plain(mt, mcab)
                MB_SPRITES[0] = False
                if not ent['ai']:
                    ent['ai'] = next((c for c in ent.get('mbs', {}) if re.match(r'Boss|AI', c)), None)
                out['bosses'][pid] = ent
                want_bullets += refs_in(ent.get('mbs', {}), [])
                for nd in rig['nodes']:
                    want_bullets += refs_in(nd.get('mbs', {}), [])
                inf, irel = find_root(pid + '_info', [bundle + '.ab'])
                if inf is not None:
                    out['info'][pid] = rig_export(inf, ui=True)
                print('boss', pid, rel, len(rig['nodes']), 'nodes', sum(len(L['states']) for a in rig['anims'] for L in a['layers']), 'states', flush=True)
    # đạn: đệ quy qua tham chiếu GameObject trong MB của đạn
    seen = set()
    boss_rels = sorted({b['bundle'] for b in out['bosses'].values()})
    while want_bullets:
        nm = want_bullets.pop(0)
        if nm in seen or nm in out['bosses']:
            continue
        seen.add(nm)
        root, rel = find_root(nm, boss_rels + [r + '.ab' for r in BULLET_BUNDLES])
        if root is None:
            log.append('thiếu đạn/prefab ' + nm)
            continue
        rig = rig_export(root)
        mbs = {}
        for cls, mcab, mt in root.mbs():
            if cls and cls != 'RGNetBehaviour':
                mbs[cls] = plain(mt, mcab)
        for nd in rig['nodes'][1:]:
            for cls, v in (nd.get('mbs') or {}).items():
                mbs.setdefault(cls, v)
        out['bullets'][nm] = {'bundle': rel, 'rig': rig, 'mbs': mbs}
        want_bullets += refs_in(mbs, [])
        print('bullet', nm, rel, len(rig['nodes']), flush=True)
    # sprite -> tệp extra của lever
    by_b = collections.defaultdict(list)
    for nm, rel in sorted(sprites_used.items()):
        by_b[(rel or '?').replace('.ab', '')].append(nm)
    extra = {'bundles': sorted(b for b in by_b if b != '?'), 'sprites': []}
    for b, names in sorted(by_b.items()):
        extra['sprites'].append('^(%s)$' % '|'.join(re.escape(n) for n in sorted(names)))
    out['spriteKeys'] = extra['sprites']
    # Lever gộp khung trùng điểm ảnh + điểm neo làm một tên; ghi nhóm trùng để mã chạy tra được tên còn lại.
    import hashlib
    groups = collections.defaultdict(list)
    for nm in sorted(sprites_used):
        try:
            r = rip.sprite(*sprite_obj[nm])
        except Exception:
            r = None
        if r:
            _, img, ax, ay, ppu = r
            groups[(hashlib.md5(img.tobytes()).hexdigest(), img.size, round(ax), round(ay))].append(nm)
    out['alias'] = {nm: g for g in groups.values() if len(g) > 1 for nm in g}
    old = {}
    if os.path.exists(OUT_EXTRA):
        old = json.load(io.open(OUT_EXTRA, encoding='utf-8'))
    extra['png_anims'] = {}
    for nm, rel in sorted(ui_sprites.items()):
        extra['png_anims']['bossui_' + nm] = {'dir': (rel or 'ui').replace('.ab', ''), 'frames': [nm], 'fps': 1,
                                              'loop': False, 'anchor': 'center', 'register': False}
    with io.open(OUT_EXTRA, 'w', encoding='utf-8') as f:
        json.dump(extra, f, ensure_ascii=False, indent=1)
    js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi tools/bosses/build_bosses86.py từ Soul Knight 8.6.0 — đừng sửa tay.\n')
        f.write('window.SK_BOSSES86 = ' + js + ';\n')
    with io.open(os.path.join(WORK, 'build.log'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(log))
    print('sprites', len(sprites_used), 'bundles', extra['bundles'], 'bullets', len(out['bullets']),
          'bytes', len(js), 'log', len(log))
    for x in log:
        print(' !', x)


if __name__ == '__main__':
    main()
