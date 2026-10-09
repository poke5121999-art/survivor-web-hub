# -*- coding: utf-8 -*-
"""Vũ khí + đạn thật của Soul Knight 8.6 -> data/sk-weapons86.js (window.SK_W86) + art/w86/*.webp

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/weapons86/build_w86.py

Chạy SAU ~/sk86-ref/tools/decode_config.py (cần $SK86/decoded/config/weapons*.json, ngoài git). Sau đó chạy build_sk.py (tệp này ghi
tools/extra/weapons.json: sprite của súng + khung hoạt ảnh súng) rồi build_design.py. Xem README.md cạnh tệp.
Dùng lại bộ đọc hiệu ứng của tools/vfx/build_vfx.py (chỉ import, không sửa) để xuất thân đạn.
"""
import collections
import io
import json
import math
import os
import re
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'vfx'))
import build_vfx as BV  # noqa: E402
from abx import REF, Env  # noqa: E402

DEC = os.path.join(REF, 'decoded')
WORK = os.path.join(REF, 'work', 'weapons')
OUT_JS = os.path.join(GAME, 'data', 'sk-weapons86.js')
OUT_ART = os.path.join(GAME, 'art', 'w86')
EXTRA_JSON = os.path.join(TOOLS, 'extra', 'weapons.json')
SKDATA_JS = os.path.join(GAME, 'data', 'sk-data.js')
BUNDLES = ['weapon.ab', 'bullet.ab', 'common.ab', 'sprite_atlas.ab', 'levelcommon.ab']
r4 = BV.r4

# Họ hành vi theo tiền tố danh sách trường riêng của lớp Gun* (lớp con giữ trường của lớp cha ở đầu) [ĐO mb/weapon.json].
FAMILY_PREFIX = [
    ('bow', ['clip_hold', 's_ide', 's_atk']),                                   # Gun005: kéo dây, nhả thì bắn
    ('bow', ['clipHold', 'sIde', 'sAtk']),
    ('charge', ['clip_hold', 'clip_big', 'multiCount', 'continuousCount']),     # Gun007: railgun tụ lực
    ('charge', ['clip_hold', 'max_time', 'reload_obj']),                        # GunAxe, GunInitPaladin, GunLvBu...
    ('charge', ['max_time', 'reload_obj']),                                     # WeaponChargeStaff
    ('fan', ['speed_correction', 'multiCount', 'angle']),                       # Gun002 / Gun019
    ('fan', ['gunPoint', 'speed_correction', 'multiCount', 'angle']),           # Gun012 (gậy)
    ('spray', ['multiCount', 'has_delay', 'max_delay']),                        # Gun004 (súng săn)
    ('spray', ['multiCount', 'speed_correction']),                              # GunGatlin, Gun004Rainbow...
    ('burst', ['continuousCount', 'delay']),                                    # Gun008 (bắn loạt)
    ('laser', ['has_delay', 'max_delay', 'reflectCount']),                      # Gun009
    ('laser', ['reflectCount']),                                                # Gun003 / Gun014...
    ('laser', ['multiCount', 'has_delay', 'max_delay', 'reflectCount']),
    ('sword', ['swordScale', 'sword_reverse']),                                 # Gun006
    ('spear', ['force', 'hasOffset', 'swordScale']),                            # Gun015
    ('throw', ['multiCount', 'max_consume', 'prepare_time']),                   # GunThrow
    ('throw', ['throw_audio_clip', 'sfxPlayer', 'throw_point']),                # GunThrowSword
    ('orbit', ['destory_time', 'target_offset']),                               # Gun010 (cầu xoay quanh)
    ('hammer', ['useGunPoint', 'hammer_offset']),                               # GunHarmmer
    ('spin', ['shoot_max_time', 'max_anim_speed']),                             # Gun016 (PKP nhanh dần)
]
STD = {'m_Name', 'isBossWeapon', 'isCreateFromSkill', 'weapon_type', 'weapon_tags', 'audio_clip', 'activate',
       'overrideHandCut', 'item_level', 'item_value', 'grabLocalOffset', 'bulletsInfo', 'deviation', 'consume',
       'consumeChange', 'dmgMultiFactor', 'holdSpeedFactor', 'reloadClipSource', 'ignoreControllerMovePenalty',
       'targetObj', 'weapon_speed', 'atk_move_speed', 'need_lock', 'has_effect', 'is_melee', 'not_forgeable', 'can_use',
       'canDualWielding', 'limitUseInMultiRoom', 'need_set_trigger_start'}
ATTACK_EV = re.compile(r'^(Attack\d*|AttackStart|Shoot\w*|Fire\w*|OnAttack\w*|Atk\w*)$')
MOVERS = ['Bullet01', 'Bullet02', 'Bullet03', 'Bullet04', 'RGSBullet01', 'BulletParabola', 'BulletFollow', 'BulletImmediately',
          'RGSword', 'RGSwordSlash', 'RGSwordMobile', 'RGShortLaser', 'RGPointLaser', 'RGLaser', 'BulletFireStorm']
TRIGGERS = ['RGBTRebound', 'RGBTEnergy', 'RGBTDivision', 'RGBTDelayCreate', 'RGBTCreate', 'RGArrowThroughTrigger', 'RGArrowTrigger',
            'RGArrowBuffTriggerElf', 'RGEnergyBallTrigger', 'RGSwordBuffTrigger', 'RGSwordTrigger', 'RGBulletBuffTriggerPercent',
            'RGBulletBuffTrigger', 'RGShortLaserTrigger', 'RGShortLasetBuff', 'RGBulletTriggerWall', 'BulletTriggerDontDestroy',
            'RGBulletTriggerNoDamage', 'RGBulletTrigger']


KEEP_K = {'px', 'py', 'qz', 'qw', 'ez', 'sx', 'sy', 'spr', 'en', 'on', 'cr', 'cg', 'cb', 'ca'}


def prefix_frames(fx, frames, smooth):
    """Khung atlas của mô-đun này mang tiền tố 'W:' để khỏi đè khung cùng tên của data/sk-vfx.js khi ghép vào SK_VFX."""
    names = set(frames)

    def P(v):
        return 'W:' + v if isinstance(v, str) and v in names else v
    for eff in fx.values():
        for n in eff['nodes']:
            if 'sr' in n:
                n['sr']['f'] = P(n['sr'].get('f'))
            if 'sa' in n:
                n['sa']['f'] = [P(x) for x in n['sa']['f']]
            if 'ps' in n:
                ps = n['ps']
                ps['tex'] = P(ps.get('tex'))
                uv = ps.get('uv')
                if uv and uv.get('spr'):
                    uv['spr'] = [P(x) for x in uv['spr']]
            for k in ('tr', 'ln'):
                if k in n:
                    n[k]['tex'] = P(n[k].get('tex'))
        for a in eff.get('anims', []):
            for c in a['clips']:
                for cv in c['curves']:
                    if cv['k'] == 'spr':
                        cv['s'] = [[t, P(v)] for t, v in cv['s']]
    return {'W:' + k: v for k, v in frames.items()}, ['W:' + x for x in smooth]


def J(*p):
    return json.load(io.open(os.path.join(DEC, *p), encoding='utf-8'))


def rot_z(q):
    return r4(math.degrees(2 * math.atan2(q['z'], q['w'])))


def split_ref(s):
    """'GameObject:bullet_14@bullet' | 'bullet_14@bullet' -> ('bullet_14', 'bullet')"""
    if not s:
        return None, None
    s = s.split(':', 1)[-1]
    n, _, b = s.partition('@')
    return n, (b or None)


class B86(BV.Builder):
    def __init__(self):
        t0 = time.time()
        self.E = Env(BUNDLES, dep_depth=1)
        print('nạp %d bundle trong %.1fs' % (len(self.E.rels), time.time() - t0), flush=True)
        self.atlas = BV.Atlas()
        self.sa_map = None
        self.shader_cache, self.mat_cache = {}, {}
        self.unsup, self.modules, self.shaders = collections.Counter(), collections.Counter(), collections.Counter()
        self.tex_fallback = collections.Counter()   # BV.Builder.material() ghi cách chọn texture/tint (glow ×2 _TintColor)
        self.missing_sprite = 0
        self.unsup_eff = 0
        self.names_mode = False
        self.rig_sprites = set()
        self.roots = {}
        for rel in BUNDLES:
            for cab in self.E.cabs_of(rel):
                for c, g in self.E.roots(cab):
                    n = self.E.tree(c, g)['m_Name']
                    self.roots.setdefault(n, {}).setdefault(rel[:-3], (c, g))

    def sprite_frame(self, ptr, cab, cap=None):
        if self.names_mode:
            r = self.E.resolve(ptr, cab)
            if not r or r[1].type.name != 'Sprite':
                return None
            n = self.E.tree(*r)['m_Name']
            self.rig_sprites.add(n)
            return n
        return super().sprite_frame(ptr, cab, cap)

    def root(self, name, bundle=None):
        d = self.roots.get(name)
        if not d:
            return None
        for b in ([bundle] if bundle else []) + ['bullet', 'weapon', 'common', 'levelcommon']:
            if b in d:
                return d[b]
        return next(iter(d.values()))

    # ---------------------------------------------------------------- cây GameObject 2D
    def walk2d(self, cab, go):
        """-> [(c, g, parent_idx, path, name, T[px,py,rz,sx,sy], active)]"""
        E = self.E
        out = []

        def visit(c, g, parent, path):
            gt = E.tree(c, g)
            tr = E.tree(*E.transform(c, g))
            p, q, s = tr['m_LocalPosition'], tr['m_LocalRotation'], tr['m_LocalScale']
            i = len(out)
            # Gốc prefab: vị trí/góc lưu trong prefab là rác của editor (bullet_7 ở 4.3,3.08; xẻng quay -159°);
            # Instantiate/ngắm súng đặt lại cả hai.
            px, py, rz = (0, 0, 0) if parent < 0 else (r4(p['x']), r4(p['y']), rot_z(q))
            out.append((c, g, parent, path, gt['m_Name'], [px, py, rz, r4(s['x']), r4(s['y'])],
                        gt.get('m_IsActive', 1)))
            for ch in E.children(c, g):
                visit(ch[0], ch[1], i, (path + '/' if path else '') + E.tree(*ch)['m_Name'])
        visit(cab, go, -1, '')
        return out

    def mbs(self, cab, go):
        """Mọi MonoBehaviour trong cây -> [(cls, node_idx, data)] với PPtr đổi thành tên đích."""
        E = self.E
        out = []
        for i, (c, g, *_r) in enumerate(self.walk2d(cab, go)):
            for tn, cc, co in E.components(c, g):
                if tn != 'MonoBehaviour':
                    continue
                t = E.tree(cc, co)
                out.append((E.script_name(cc, t) or '?', i, self.flat(t, cc)))
        return out

    def flat(self, t, cab):
        d = {}
        for k, v in t.items():
            if k.startswith('m_') or k in ('serializationData',):
                continue
            if isinstance(v, bool):
                d[k] = int(v)
            elif isinstance(v, (int, float)):
                d[k] = r4(v)
            elif isinstance(v, str) and len(v) < 80:
                d[k] = v
            elif isinstance(v, dict) and 'm_PathID' in v:
                if v.get('m_PathID'):
                    r = self.E.resolve(v, cab)
                    if r:
                        tn = r[1].type.name
                        if tn in ('GameObject', 'Sprite', 'AudioClip'):
                            d[k] = self.E.tree(*r).get('m_Name')
                        elif tn in ('Transform', 'SpriteRenderer', 'ParticleSystem'):
                            g = self.E.resolve(self.E.tree(*r).get('m_GameObject'), r[0])
                            if g:
                                d[k] = self.E.tree(*g).get('m_Name')
            elif isinstance(v, dict) and set(v) <= {'x', 'y', 'z'}:
                d[k] = [r4(v.get('x', 0)), r4(v.get('y', 0))]
            elif isinstance(v, list) and v and len(v) <= 16 and all(isinstance(x, (int, float)) for x in v):
                d[k] = [r4(x) for x in v]
        return d

    # ---------------------------------------------------------------- Animator
    def controller(self, cab, o, pathmap):
        E = self.E
        t = E.tree(cab, o)
        over = {}
        if o.type.name == 'AnimatorOverrideController':
            for p in t.get('m_Clips', []):
                a = E.resolve(p['m_OriginalClip'], cab)
                b = E.resolve(p['m_OverrideClip'], cab)
                if a and b:
                    over[(a[0], a[1].path_id)] = b
            base = E.resolve(t['m_Controller'], cab)
            if not base:
                return None
            cab, o = base
            t = E.tree(cab, o)
        tos = dict(t.get('m_TOS', []))
        C = t['m_Controller']
        vals = C['m_Values']['data']['m_ValueArray']
        params = {tos.get(v['m_ID'], str(v['m_ID'])): v['m_Type'] for v in vals}
        sms = C['m_StateMachineArray']
        if not sms:
            return None
        sm = sms[0]['data']
        aclips = t['m_AnimationClips']
        clips, clip_idx = [], {}

        def clip_of(ci):
            r = E.resolve(aclips[ci], cab)
            if not r:
                return None
            r = over.get((r[0], r[1].path_id), r)
            k = (r[0], r[1].path_id)
            if k not in clip_idx:
                used = set()
                cl = self.clip(r[0], r[1], pathmap, used)
                ct = E.tree(*r)
                cl['ev'] = [[r4(e['time']), e['functionName']] for e in ct.get('m_Events', [])]
                clip_idx[k] = len(clips)
                clips.append(cl)
            return clip_idx[k]

        def trans(td):
            conds = [(tos.get(c['data']['m_EventID'], '?'), c['data']['m_ConditionMode'], r4(c['data']['m_EventThreshold']))
                     for c in td['m_ConditionConstantArray']]
            d = td['m_DestinationState']
            return {'to': d if isinstance(d, int) and d < 30000 else None, 'exit': bool(td.get('m_HasExitTime')),
                    'x': r4(td.get('m_ExitTime', 0)), 'cond': conds}

        states = []
        for sw in sm['m_StateConstantArray']:
            s = sw['data']
            ci = None
            for b in s['m_BlendTreeConstantArray']:
                for nd in b['data']['m_NodeArray']:
                    cid = nd['data']['m_ClipID']
                    if 0 <= cid < len(aclips):
                        ci = clip_of(cid)
                    break
                break
            states.append({'name': tos.get(s['m_NameID'], ''), 'spd': r4(abs(s.get('m_Speed', 1) or 1)) or 1, 'c': ci,
                           'tr': [trans(tr['data']) for tr in s['m_TransitionConstantArray']]})
        anys = [trans(tr['data']) for tr in sm.get('m_AnyStateTransitionConstantArray', [])]
        return {'params': params, 'states': states, 'any': anys, 'def': sm.get('m_DefaultState', 0), 'clips': clips}


# ---------------------------------------------------------------- mô phỏng giữ nút bắn
# Tham số script bật sẵn khi cầm súng (vũ khí khởi đầu cần 'start' để rời 'inactive'; Katana cần 'can_atk') [ĐO tên tham số].
ALWAYS = {'start', 'can_atk'}


def cond_ok(conds, held, any_state=False):
    """Điều kiện thoả khi atk_b = held, ALWAYS bật (trừ ở any-state), mọi trigger/bool khác = false/0."""
    for p, mode, th in conds:
        v = 1 if (p == 'atk_b' and held) or (p in ALWAYS and not any_state) else 0
        if mode == 1 and not v:
            return False
        if mode == 2 and v:
            return False
        if mode == 3 and not v > th:
            return False
        if mode == 4 and not v < th:
            return False
        if mode == 6 and v != th:
            return False
        if mode == 7 and v == th:
            return False
    return True


def pick_tr(ctl, si, held):
    """Chuyển trạng thái đầu tiên có thể xảy ra khi atk_b = held (any-state trước). -> {'to', 'x' (None = ngay)}"""
    for tr in ctl['any']:
        if tr['cond'] and cond_ok(tr['cond'], held, True) and tr['to'] is not None and tr['to'] != si:
            return {'to': tr['to'], 'x': tr['x'] if tr['exit'] else None}
    for tr in ctl['states'][si]['tr']:
        if tr['to'] is None:
            continue
        if not tr['cond'] and not tr['exit']:
            continue
        if cond_ok(tr['cond'], held):
            return {'to': tr['to'], 'x': tr['x'] if tr['exit'] else None}
    return None


def simulate(ctl, held_for, t_max=4.0, dt=1 / 600.0):
    """Chạy máy trạng thái ở tốc 1: giữ nút held_for giây rồi nhả. -> [(t, fn)] sự kiện, [(t, state)] lịch trạng thái."""
    st = ctl['states']
    cur, lt, T = ctl['def'], 0.0, 0.0
    evs, visits = [], [(0.0, cur)]
    hops = 0   # chuyển ngay (không exit time) qua lại giữa hai trạng thái: chặn để khỏi lặp vô hạn
    while T < t_max:
        held = T < held_for
        s = st[cur]
        c = ctl['clips'][s['c']] if s['c'] is not None else None
        L = (c['len'] if c and c['len'] > 0 else 1.0) / s['spd']
        loop = bool(c and c['loop'])
        tr = pick_tr(ctl, cur, held)
        nt0, nt1 = lt / L, (lt + dt) / L
        if tr is not None:
            x = tr['x']
            fire = x is None or (math.floor(nt0 - x) < math.floor(nt1 - x) if (loop and x < 1) else nt0 < x <= nt1) or (not loop and x is not None and x < 1 and nt0 >= x)
            if fire and hops < 8:
                cur, lt = tr['to'], 0.0
                visits.append((T, cur))
                hops += 1
                continue
        hops = 0
        if c:
            for et, fn in c['ev']:
                e = et / s['spd']
                if loop and L > 0:
                    k0, k1 = math.floor((lt - e) / L), math.floor((lt + dt - e) / L)
                    if k0 < k1 and lt + dt >= e:
                        evs.append((round(T + dt, 4), fn))
                elif lt < e <= lt + dt:
                    evs.append((round(T + dt, 4), fn))
        lt += dt
        T += dt
    return evs, visits


def machine(ctl):
    """Máy trạng thái gọn cho runtime: [{c, len, loop, ev, h:{to,x}|None, r:{to,x}|None}] + def."""
    out = []
    for si, s in enumerate(ctl['states']):
        c = ctl['clips'][s['c']] if s['c'] is not None else None
        L = (c['len'] if c and c['len'] > 0 else 0) / s['spd']
        ev = [[r4(e[0] / s['spd']), e[1]] for e in (c['ev'] if c else []) if ATTACK_EV.match(e[1])]
        out.append({'n': s['name'], 'c': s['c'], 'len': r4(L), 'loop': 1 if (c and c['loop']) else 0,
                    'ev': ev, 'h': pick_tr(ctl, si, True), 'r': pick_tr(ctl, si, False)})
    return out


# ---------------------------------------------------------------- vũ khí
def family(cls, extra_keys):
    for fam, pre in FAMILY_PREFIX:
        if extra_keys[:len(pre)] == pre:
            return fam
    return 'single'


def weapon_rig(B, cab, go):
    """Cây hình của súng: nút có SpriteRenderer + tổ tiên, gun_point; Animator ở gốc."""
    E = B.E
    nodes = B.walk2d(cab, go)
    keep = [False] * len(nodes)
    srs = {}
    for i, (c, g, parent, path, name, T, act) in enumerate(nodes):
        for tn, cc, co in E.components(c, g):
            if tn == 'SpriteRenderer':
                ct = E.tree(cc, co)
                B.names_mode = True
                f = B.sprite_frame(ct.get('m_Sprite'), cc)
                B.names_mode = False
                srs[i] = {'f': f, 'o': ct.get('m_SortingOrder', 0), 'en': ct.get('m_Enabled', 1),
                          'c': BV.col(ct['m_Color']), 'fx': ct.get('m_FlipX', 0), 'fy': ct.get('m_FlipY', 0)}
                j = i
                while j >= 0 and not keep[j]:
                    keep[j] = True
                    j = nodes[j][2]
    remap = {}
    rig = []
    for i, (c, g, parent, path, name, T, act) in enumerate(nodes):
        if not keep[i]:
            continue
        remap[i] = len(rig)
        n = {'n': name, 'p': remap.get(parent, -1)}
        if T != [0, 0, 0, 1, 1]:
            n['T'] = T
        if not act:
            n['off'] = 1
        if i in srs:
            s = srs[i]
            n['f'] = s['f']
            if s['o']:
                n['o'] = s['o']
            if not s['en']:
                n['dis'] = 1
            if s['c'] != [1, 1, 1, 1]:
                n['c'] = s['c']
            if s['fx']:
                n['fx'] = 1
            if s['fy']:
                n['fy'] = 1
        rig.append(n)
    pathmap = {zlib.crc32(nodes[i][3].encode()): remap[i] for i in remap}
    ctl = None
    for tn, cc, co in E.components(cab, go):
        if tn == 'Animator':
            rc = E.resolve(E.tree(cc, co).get('m_Controller'), cc)
            if rc:
                B.names_mode = True
                try:
                    ctl = B.controller(rc[0], rc[1], pathmap)
                finally:
                    B.names_mode = False
    return rig, ctl


def weapon_entry(B, key, W, LOC):
    w = W.get(key) or {}
    rg = B.root(key, 'weapon')
    if not rg:
        return None, 'không có prefab'
    E = B.E
    mb = None
    for tn, cc, co in E.components(*rg):
        if tn == 'MonoBehaviour':
            t = E.tree(cc, co)
            if 'weapon_type' in t:
                mb = (E.script_name(cc, t), t, cc)
                break
    if not mb:
        return None, 'không có MB súng'
    cls, t, cc = mb
    extra_keys = [k for k in t if k not in STD and not k.startswith('m_')]
    fam = family(cls, extra_keys)
    rig, ctl = weapon_rig(B, *rg)
    lv = LOC.get('weapon/' + key)
    # [ĐO] số đọc thẳng MB súng (vũ khí khởi đầu của bard/shooter/joker nằm ở common.ab, không có trong decoded/weapons.json)
    out = {
        'n': {'en': lv[0], 'vi': lv[1]} if lv else (w.get('name') or {'en': key, 'vi': key}), 'cls': cls, 'fam': fam,
        'grade': t.get('item_level', 0), 'type': t.get('weapon_type'), 'melee': t.get('is_melee', 0),
        'cost': t.get('consume', 0), 'dev': r4(t.get('deviation', 0)), 'ws': r4(t.get('weapon_speed', 1) or 1),
        'move': r4(t.get('atk_move_speed', 0)), 'dual': t.get('canDualWielding', 1), 'dmf': r4(t.get('dmgMultiFactor', 1)),
        'lock': t.get('need_lock', 1), 'sfx': w.get('sfx'), 'val': t.get('item_value', 0),
        'b': [], 'x': {}, 'rig': rig,
    }
    for bi in t.get('bulletsInfo', []):
        pr = bi.get('bulletProto') or {}
        name = None
        bundle = None
        if isinstance(pr, dict) and pr.get('m_PathID'):
            r = E.resolve(pr, cc)
            if r:
                name = E.tree(*r)['m_Name']
                bundle = E.bundle_of.get(r[0], '')[:-3]
        out['b'].append({'p': name, 'bb': bundle, 'dmg': bi.get('damage', 0), 'spd': r4(bi.get('speed', 0)),
                         'size': r4(bi.get('size', 1)), 'crit': bi.get('critic', 0), 'repel': r4(bi.get('repel', 0)),
                         'thr': bi.get('throughCount', 0), 'gpa': bi.get('useGunpointAngle', 1)})
    out['x'] = {k: v for k, v in B.flat(t, cc).items() if k not in STD}
    # AudioClip nằm ở sound_effect.ab (không nạp kèm): lấy tên từ bảng decoded của config86
    for k, v in (w.get('extra') or {}).items():
        if isinstance(v, str) and v.startswith('AudioClip:') and k not in out['x']:
            out['x'][k] = v.split(':', 1)[1].split('@')[0]
    if ctl:
        m = machine(ctl)
        # 2D: bỏ đường z/qx/qy (luôn 0 với súng) cho gọn
        out['clips'] = [{'name': c['name'], 'len': c['len'], 'loop': c['loop'],
                         'cv': [v for v in c['curves'] if v['k'] in KEEP_K]} for c in ctl['clips']]
        out['sm'] = {'def': ctl['def'], 'st': m}
        # [ĐO] mô phỏng Animator ở tốc 1: giữ 3 s -> sự kiện bắn đầu tiên, chu kỳ ổn định, số sự kiện mỗi chu kỳ
        evs, visits = simulate(ctl, 3.0, 3.0)
        ts = [e[0] for e in evs if ATTACK_EV.match(e[1])]
        if not ts and fam not in ('bow', 'charge', 'laser', 'orbit'):
            # Clip không có sự kiện Attack (script tự bắn theo thời gian): coi đầu mỗi vòng của trạng thái có clip
            # trên đường giữ nút là một phát. [ƯỚC LƯỢNG]
            seen = {s for _, s in visits if m[s]['len'] > 0 and s != ctl['def']}
            for si in seen:
                m[si]['ev'] = [[0.001, 'Attack']]
                m[si]['syn'] = 1
                if ctl['states'][si]['c'] is not None:
                    ctl['clips'][ctl['states'][si]['c']]['ev'] = [[0.001, 'Attack']]
            if seen:
                evs, visits = simulate(ctl, 3.0, 3.0)
                ts = [e[0] for e in evs if ATTACK_EV.match(e[1])]
        if ts:
            tail = [b - a for a, b in zip(ts, ts[1:]) if a > 1.0]
            per = sum(tail) / len(tail) if tail else None
            out['fire'] = {'first': r4(ts[0]), 'period': r4(per) if per else None, 'n3s': len(ts)}
        else:
            out['fire'] = {'first': None, 'period': None, 'n3s': 0}
    return out, None


# ---------------------------------------------------------------- đạn
def collider_of(B, cab, go):
    """Hộp va chạm đầu tiên (nút có trigger), đơn vị Unity theo gốc đạn: {box:[ox,oy,w,h]} | {r, off}."""
    E = B.E
    nodes = B.walk2d(cab, go)
    sc = {}
    pos = {}
    for i, (c, g, parent, path, name, T, act) in enumerate(nodes):
        ps = sc.get(parent, (1.0, 1.0))
        pp = pos.get(parent, (0.0, 0.0))
        sc[i] = (ps[0] * T[3], ps[1] * T[4])
        pos[i] = (pp[0] + T[0] * ps[0], pp[1] + T[1] * ps[1])
        for tn, cc, co in E.components(c, g):
            if tn in ('BoxCollider2D', 'CircleCollider2D', 'CapsuleCollider2D', 'PolygonCollider2D'):
                ct = E.tree(cc, co)
                off = ct.get('m_Offset', {'x': 0, 'y': 0})
                ox, oy = pos[i][0] + off['x'] * sc[i][0], pos[i][1] + off['y'] * sc[i][1]
                if tn == 'CircleCollider2D':
                    return {'r': r4(ct['m_Radius'] * max(abs(sc[i][0]), abs(sc[i][1]))), 'off': [r4(ox), r4(oy)]}
                if tn == 'PolygonCollider2D':
                    pts = [p for path in ct.get('m_Points', {}).get('m_Paths', []) for p in path]
                    if pts:
                        xs = [p['x'] * sc[i][0] for p in pts]
                        ys = [p['y'] * sc[i][1] for p in pts]
                        return {'box': [r4(ox + (min(xs) + max(xs)) / 2), r4(oy + (min(ys) + max(ys)) / 2),
                                        r4(max(xs) - min(xs)), r4(max(ys) - min(ys))], 'poly': 1}
                    continue
                s = ct.get('m_Size', {'x': 0.5, 'y': 0.5})
                return {'box': [r4(ox), r4(oy), r4(abs(s['x'] * sc[i][0])), r4(abs(s['y'] * sc[i][1]))]}
    return None


def bullet_entry(B, name, bundle):
    rg = B.root(name, bundle)
    if not rg:
        return None
    mbs = B.mbs(*rg)
    by = collections.OrderedDict()
    for cls, ni, d in mbs:
        by.setdefault(cls, d)
    mover = next((m for m in MOVERS if m in by), None)
    trig = next((m for m in TRIGGERS if m in by), None)
    out = {'mv': mover, 'tg': trig, 'col': collider_of(B, *rg), 'm': {}}
    keep = set(MOVERS) | set(TRIGGERS) | {'ExplodeEffectTrigger', 'SwordBulletSplitProcessor', 'SpearBulletSplitProcessor',
                                          'ReboundEffectTrigger', 'BulletThunder', 'FixAngle', 'RotationLock', 'ObjectRotate',
                                          'BulletLightFade', 'IntervaltEnableCollider', 'AreaDamageCarrier', 'CircleDamageCarrier'}
    for cls, d in by.items():
        if cls in keep:
            out['m'][cls] = {k: v for k, v in d.items() if k not in ('effectDamageValue', 'effectDamageFactor', 'rigid2d', 'inStorm',
                                                                      'onBulletHit', 'emit_clip', 'hit_clip', 'audio_clip')}
    return out


def explode_entry(B, name, bundle=None):
    rg = B.root(name, bundle)
    if not rg:
        return None
    by = {}
    for cls, ni, d in B.mbs(*rg):
        by.setdefault(cls, d)
    ex = next((by[k] for k in by if k.startswith('Explode') and 'damage' in by[k]), None) or \
        next((by[k] for k in ('AreaDamageCarrier', 'CircleDamageCarrier') if k in by), None)
    col = collider_of(B, *rg)
    out = {'col': col}
    if ex:
        for k in ('damage', 'hit_enemy', 'hit_player', 'forceFactor', 'camp', 'small', 'shakeCamera', 'fire_rate', 'buff_fire'):
            if k in ex:
                out[k] = ex[k]
    out['cls'] = next((k for k in by if k.startswith('Explode') or k.endswith('DamageCarrier')), None)
    return out


# ---------------------------------------------------------------- chọn vũ khí
# Bảng rơi config/weapons_drop (Group 0..6) -> bể rương theo chương của web: bể luban WG_level1..3 cũ ứng với
# Group 0-1 / 2-3 / 4-6 (đếm chéo 219 món đã có trong cả hai bảng) [SUY].
DROP_LEVEL = {0: '1', 1: '1', 2: '2', 3: '2', 4: '3', 5: '3', 6: '3'}
ALL_KEYS = re.compile(r'^weapon_(\d+|mythic_\d+)$')


def selection(W):
    """Bảng luban (bể rương WG_level*, ánh xạ wiki) chưa giải được trên máy này: lấy lại từ data/sk-weapons86.js đã sinh,
    rồi thêm mọi vũ khí đánh số + thần thoại của config/weapons và món trong bảng rơi chưa có trong bể nào."""
    old = json.loads(re.search(r'window\.SK_W86=(.*?);\n', io.open(OUT_JS, encoding='utf-8').read(), re.S).group(1))
    wmap, heroes = dict(old['wiki']), dict(old['heroes'])
    pools = {k: list(v) for k, v in old['pools'].items()}
    weights = {k: dict(v) for k, v in old.get('weights', {}).items()}
    inpool = {x for v in pools.values() for x in v}
    for row in sorted(J('config', 'weapons_drop.json').values(), key=lambda r: r['Key']):
        w, lv = row['Weapon'], DROP_LEVEL.get(row['Group'])
        if lv and w in W and w not in inpool:
            pools.setdefault(lv, []).append(w)
            weights.setdefault(lv, {})[w] = row['Weight']
            inpool.add(w)
    # Tiếng bắn: bảng weapons cũ (luban) có trường sfx, config/weapons không có; giữ số đã bóc trước.
    for k, v in old['weapons'].items():
        if k in W and v.get('sfx'):
            W[k]['sfx'] = v['sfx']
    extra = sorted(k for k in W if ALL_KEYS.match(k))
    return extra, wmap, pools, weights, heroes


def read_enemy_bullets():
    s = io.open(SKDATA_JS, encoding='utf-8').read()
    m = re.search(r'window\.SK_DATA = (.*?);\n', s, re.S)
    D = json.loads(m.group(1))
    names = set(D.get('bullets', {}))
    for e in D.get('enemies', {}).values():
        for w in e.get('weapons') or []:
            if w.get('bullet'):
                names.add(w['bullet'])
    return sorted(names)


class W86Atlas(BV.Atlas):
    def pack(self, out_dir):
        import glob as _g
        paths, frames, total, smooth = super().pack(out_dir)
        # BV.Atlas.pack ghi vfx_%d.webp và đường art/vfx/: đổi tên về w86_%d.webp
        out = []
        for i, p in enumerate(paths):
            a = os.path.join(out_dir, 'vfx_%d.webp' % i)
            b = os.path.join(out_dir, 'w86_%d.webp' % i)
            if os.path.exists(b):
                os.remove(b)
            os.replace(a, b)
            out.append('art/w86/w86_%d.webp' % i)
        for f in _g.glob(os.path.join(out_dir, 'w86_*.webp')):
            if os.path.basename(f) not in {os.path.basename(x) for x in out}:
                os.remove(f)
        return out, frames, total, smooth


def rss():
    try:
        import psutil
        return '%.1f GB' % (psutil.Process().memory_info().rss / 2 ** 30)
    except Exception:  # noqa: BLE001
        return '?'


def main():
    enemy_only = False
    os.makedirs(WORK, exist_ok=True)
    t0 = time.time()
    W = J('config', 'weapons.json')
    LOC = J('localization_en_vi.json')
    extra, wmap, pools, weights, heroes = selection(W)
    S = sorted(set(wmap.values()) | {k for v in pools.values() for k in v} | {v for v in heroes.values() if v} | set(extra))
    LIMIT = int(os.environ.get('W86_LIMIT', '0') or 0)
    if LIMIT:
        S = S[:LIMIT]
    B = B86()
    B.atlas = W86Atlas()
    weapons, skipped = {}, {}
    for wi, k in enumerate(S):
        if wi % 25 == 0:
            print('  vũ khí %d/%d %s (%.0fs, RAM %s)' % (wi, len(S), k, time.time() - t0, rss()), flush=True)
        try:
            e, why = weapon_entry(B, k, W, LOC)
        except Exception as ex:  # noqa: BLE001
            e, why = None, 'lỗi ' + repr(ex)
        if e:
            weapons[k] = e
        else:
            skipped[k] = why
    print('vũ khí: %d, bỏ %d (%.0fs)' % (len(weapons), len(skipped), time.time() - t0), flush=True)
    for k, v in list(skipped.items())[:20]:
        print('  bỏ', k, v)

    # đạn của vũ khí + đạn quái
    want = collections.OrderedDict()
    for w in weapons.values():
        for b in w['b']:
            if b['p']:
                want.setdefault(b['p'], b['bb'])
    enemy_b = read_enemy_bullets()
    for n in enemy_b:
        want.setdefault(n, 'bullet')
    bullets, fx, explodes = {}, {}, {}
    for bi, (n, bb) in enumerate(want.items()):
        if bi % 25 == 0:
            print('  đạn %d/%d %s (%.0fs, RAM %s)' % (bi, len(want), n, time.time() - t0, rss()), flush=True)
        if enemy_only and n not in enemy_b:
            pass
        rg = B.root(n, bb)
        if not rg:
            continue
        try:
            be = bullet_entry(B, n, bb)
            eff = B.export(rg[0], rg[1], 'bullet')
            if eff and eff['nodes'] and eff['nodes'][0].get('T'):
                T0 = eff['nodes'][0]['T']
                T0[0] = T0[1] = T0[2] = 0
                if T0 == [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]:
                    del eff['nodes'][0]['T']
        except Exception as ex:  # noqa: BLE001
            print('  đạn lỗi', n, repr(ex))
            continue
        if be:
            bullets[n] = be
            if eff:
                fx[n] = eff
                be['fx'] = 1
            et = be['m'].get('ExplodeEffectTrigger')
            for src in (et and et.get('creation'), (be['m'].get('RGBTEnergy') or {}).get('explode_obj')):
                if src and src not in explodes:
                    xe = explode_entry(B, src)
                    if xe:
                        explodes[src] = xe
    print('đạn: %d (%d có hình), nổ: %d (%.0fs)' % (len(bullets), len(fx), len(explodes), time.time() - t0), flush=True)

    pages, frames, total, smooth = B.atlas.pack(OUT_ART)
    frames, smooth = prefix_frames(fx, frames, smooth)
    print('atlas: %d trang, %d khung, %.1f KB' % (len(pages), len(frames), total / 1024))
    hero_ok = {f: k for f, k in heroes.items() if k in weapons}
    # clip + máy trạng thái dùng chung giữa nhiều súng (weapon_m4, weapon_pistol...): gom thành bảng, súng giữ chỉ số
    clips, clip_id, sms, sm_id = [], {}, [], {}
    for w in weapons.values():
        ids = []
        for c in w.pop('clips', []):
            k = json.dumps(c, sort_keys=True)
            if k not in clip_id:
                clip_id[k] = len(clips)
                clips.append(c)
            ids.append(clip_id[k])
        w['cl'] = ids
        if 'sm' in w:
            k = json.dumps(w['sm'], sort_keys=True)
            if k not in sm_id:
                sm_id[k] = len(sms)
                sms.append(w['sm'])
            w['sm'] = sm_id[k]
    print('clip chung: %d, máy trạng thái chung: %d' % (len(clips), len(sms)))
    data = {
        'v': time.strftime('%Y%m%d%H%M'), 'ppu': 16,
        'atlas': {'pages': pages, 'f': frames, 'smooth': smooth},
        'weapons': weapons, 'clips': clips, 'sms': sms, 'bullets': bullets, 'explodes': explodes, 'fx': fx,
        'wiki': {k: v for k, v in wmap.items() if v in weapons}, 'heroes': hero_ok,
        'pools': {k: [x for x in v if x in weapons] for k, v in pools.items()},
        'weights': {k: {x: n for x, n in v.items() if x in weapons} for k, v in weights.items()},
    }
    js = ('// SINH TỰ ĐỘNG bởi tools/weapons86/build_w86.py từ Soul Knight 8.6 — không sửa tay.\n'
          'window.SK_W86=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('ghi %s (%.1f KB)' % (OUT_JS, len(js.encode('utf-8')) / 1024))

    # extra cho lever: sprite hình súng (khung đứng + khung đổi trong clip) vào atlas chính
    names = sorted(n for n in B.rig_sprites if n and n not in ('nothing',))
    chunks, cur = [], []
    for n in names:
        cur.append(re.escape(n))
        if len(cur) >= 60:
            chunks.append('^(' + '|'.join(cur) + ')$')
            cur = []
    if cur:
        chunks.append('^(' + '|'.join(cur) + ')$')
    old = {}
    if os.path.exists(EXTRA_JSON):
        old = json.load(io.open(EXTRA_JSON, encoding='utf-8'))
    ex = {'bundles': ['weapon', 'bullet'], 'prefabs': old.get('prefabs', []),
          'sprites': [s for s in old.get('sprites', []) if not s.startswith('^(')] + chunks, 'clips': old.get('clips', [])}
    with io.open(EXTRA_JSON, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(ex, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('extra: %d sprite hình súng trong %d regex' % (len(names), len(chunks)))
    stats = {'weapons': len(weapons), 'skipped': skipped, 'bullets': len(bullets), 'fx': len(fx), 'explodes': len(explodes),
             'fam': collections.Counter(w['fam'] for w in weapons.values()), 'art': total,
             'nofire': sorted(k for k, w in weapons.items() if not (w.get('fire') or {}).get('n3s') and w['fam'] not in ('bow', 'charge'))}
    with io.open(os.path.join(WORK, 'stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k != 'skipped'}, ensure_ascii=False)[:3000])


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    main()
