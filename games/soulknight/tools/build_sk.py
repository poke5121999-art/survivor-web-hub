# -*- coding: utf-8 -*-
"""Lever bóc Soul Knight -> art/sk/atlas*.png + data/sk-data.js

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py

Đọc 25 bundle ở ~/Downloads/sk-ref/_ab (ngoài git) và kho PNG đã bóc ở ~/Downloads/sk-ref/all
(cho nhân vật, vì bundle skin không còn). Không sửa tay tệp sinh ra.
"""
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from skrip import Rip  # noqa: E402
from pack import Packer  # noqa: E402

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art', 'sk')
DATA = os.path.join(GAME, 'data')
ALL = os.path.expanduser('~/Downloads/sk-ref/all')
PPU = 16.0

THEMES = {
    'level__1__a.ab': ('forest', 1), 'level__1__b.ab': ('glacier', 1), 'level__1__c.ab': ('ruins', 1),
    'level__2__a.ab': ('castle', 2), 'level__2__b.ab': ('graveyard', 2), 'level__2__c.ab': ('halloween', 2),
    'level__2__d.ab': ('icecave', 2), 'level__2__e.ab': ('swamp', 2), 'level__2__f.ab': ('relic', 2),
    'level__2__g.ab': ('machinery', 2),
    'level__3__a.ab': ('aliens', 3), 'level__3__b.ab': ('volcano', 3), 'level__3__c.ab': ('island', 3),
}

AI_PREFIX = ('EnemyAI', 'Enemy', 'EliteArcher', 'AIBrain', 'AIController', 'Boss')
WEAPON_PREFIX = ('EGun', 'ESword', 'EWeapon', 'EBow', 'EStaff', 'EThrow', 'ELaser', 'EMelee', 'EHammer')
SKIP_KEYS = {'m_GameObject', 'm_Script', 'm_Enabled', 'm_Name', 'serializationData', 'm_ObjectHideFlags',
             'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset'}

rip = Rip()
packer = Packer()
anims = {}
log = []


def plain(v, cab=None, depth=0):
    """Rút typetree về số/chuỗi/mảng; con trỏ -> tên đối tượng đích (hoặc None nếu mất)."""
    if isinstance(v, dict):
        if set(v) == {'m_FileID', 'm_PathID'}:
            if not v['m_PathID']:
                return None
            r = rip.resolve(v, cab)
            if not r:
                return '?missing'
            try:
                return '@' + (rip.tree(*r).get('m_Name') or r[1].type.name)
            except Exception:
                return '@' + r[1].type.name
        if 'm_PersistentCalls' in v:
            return None
        out = {}
        for k, x in v.items():
            if k in SKIP_KEYS:
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
        return round(v, 4)
    return v


def frame_of(cab, obj):
    """Sprite obj -> tên khung trong atlas."""
    s = rip.sprite(cab, obj)
    if not s:
        return None
    name, img, ax, ay, ppu = s
    if abs(ppu - PPU) > 0.5 and ppu > 0:
        k = PPU / ppu
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
        ax, ay = ax * k, ay * k
    return packer.add(name, img, ax, ay)


def sprite_ref(ptr, cab):
    r = rip.resolve(ptr, cab)
    return frame_of(*r) if r else None


def anim_of(cab, clip_obj, key):
    if key in anims:
        return key
    c = rip.clip(cab, clip_obj)
    fr, du = [], []
    keys = c['keys']
    for i, (t, r) in enumerate(keys):
        f = frame_of(*r) if r else None
        nxt = keys[i + 1][0] if i + 1 < len(keys) else max(c['len'], t + 1.0 / max(c['rate'], 1))
        fr.append(f)
        du.append(round(max(nxt - t, 0.0), 4))
    if not fr:
        return None
    a = {'f': fr, 'd': du, 'loop': c['loop']}
    if c['events']:
        a['ev'] = [[round(t, 4), fn] for t, fn in c['events']]
    anims[key] = a
    return key


def animator_states(node, prefix):
    a = node.comp('Animator')
    if not a:
        return {}
    ccab, co, t = a
    r = rip.resolve(t.get('m_Controller'), ccab)
    if not r:
        return {}
    ctrl_name = rip.tree(*r).get('m_Name') or prefix
    out = {}
    for st, (clcab, clobj) in rip.controller(*r).items():
        k = anim_of(clcab, clobj, '%s/%s' % (ctrl_name, st))
        if k:
            out[st] = k
    return out


def px(p):
    return [round(p[0] * PPU, 2), round(p[1] * PPU, 2)]


def collider_info(node):
    out = {}
    for tn, ccab, co in node.comps:
        if tn in ('CircleCollider2D', 'BoxCollider2D', 'CapsuleCollider2D'):
            t = rip.tree(ccab, co)
            e = {'trig': bool(t.get('m_IsTrigger')), 'off': px((t['m_Offset']['x'], t['m_Offset']['y']))}
            if tn == 'CircleCollider2D':
                e['r'] = round(t['m_Radius'] * PPU, 2)
            else:
                e['size'] = px((t['m_Size']['x'], t['m_Size']['y']))
            out[tn.replace('Collider2D', '').lower()] = e
    return out


def sr_frame(node):
    s = node.comp('SpriteRenderer')
    if not s:
        return None
    ccab, co, t = s
    return sprite_ref(t.get('m_Sprite'), ccab)


# ---------------------------------------------------------------- đạn
bullets = {}


def extract_bullet(cab, go_obj):
    from skrip import Node
    n = Node(rip, cab, go_obj)
    if n.name in bullets:
        return n.name
    b = {'mbs': {}}
    for nd, path, off in n.walk():
        for cls, mcab, t in nd.mbs():
            if cls and cls not in b['mbs']:
                b['mbs'][cls] = plain(t, mcab)
        f = sr_frame(nd)
        if f and 'sprite' not in b and 'shadow' not in nd.name:
            b['sprite'] = f
        st = animator_states(nd, n.name)
        if st and 'anims' not in b:
            b['anims'] = st
        col = collider_info(nd)
        if col and 'col' not in b:
            b['col'] = col
    bullets[n.name] = b
    return n.name


def bullet_ref(ptr, cab):
    r = rip.resolve(ptr, cab)
    if not r:
        return None
    o = r[1]
    if o.type.name == 'GameObject':
        return extract_bullet(r[0], o)
    t = rip.tree(*r)
    g = rip.resolve(t.get('m_GameObject'), r[0])
    return extract_bullet(g[0], g[1]) if g else None


# ---------------------------------------------------------------- quái
enemies = {}


def extract_enemy(root, theme, level):
    e = {'theme': theme, 'level': level}
    mbs = {cls: (mcab, t) for cls, mcab, t in root.mbs()}
    ra = mbs.get('RoleAttribute')
    if not ra:
        return None
    rt = ra[1]
    e['hp'] = rt['max_hp']
    e['speed'] = round(rt['speed'], 3)
    e['crit'] = rt.get('critical', 0)
    ai = [(c, mcab, t) for c, (mcab, t) in mbs.items() if c and c.startswith(AI_PREFIX)]
    e['ai'] = [{'cls': c, 'p': plain(t, mcab)} for c, mcab, t in ai]
    e['anims'] = animator_states(root, root.name)
    e['col'] = {}
    e['parts'] = []
    for nd, path, off in root.walk():
        if nd is root:
            e['col'].update({('hurt_' + k): v for k, v in collider_info(nd).items()})
            continue
        leaf = path.split('/')[-1]
        if leaf == 'collider':
            e['col'].update(collider_info(nd))
        elif leaf == 'body':
            f = sr_frame(nd)
            if f:
                e['body'] = f
            st = animator_states(nd, root.name + '_body')
            if st and not e['anims']:
                e['anims'] = st
        elif leaf == 'shadow':
            e['shadow'] = sr_frame(nd)
            e['shadowOff'] = px(off)
        elif leaf.startswith('h') and nd.comp('MonoBehaviour') and any(c == 'RGEHand' for c, _, _ in nd.mbs()):
            e.setdefault('hands', []).append(px(off))
        wmb = [(c, mcab, t) for c, mcab, t in nd.mbs() if c and c.startswith(WEAPON_PREFIX)]
        if wmb:
            c, mcab, t = wmb[0]
            w = {'cls': c, 'p': plain(t, mcab), 'at': px(off)}
            if 'bullet' in t:
                w['bullet'] = bullet_ref(t['bullet'], mcab)
            w['anims'] = animator_states(nd, root.name + '_weapon')
            for wn, wpath, woff in nd.walk():
                if wn is nd:
                    continue
                f = sr_frame(wn)
                if wn.name == 'w' and f:
                    w['sprite'] = f
                    w['spriteOff'] = px(woff)
                elif wn.name == 'gun_point':
                    w['gunPoint'] = px(woff)
                    if f:
                        w['muzzle'] = f
            e.setdefault('weapons', []).append(w)
        other = [(c, mcab, t) for c, mcab, t in nd.mbs()
                 if c and nd is not root and not c.startswith(WEAPON_PREFIX) and c not in ('RGEHand', 'CollisionNormal')]
        for c, mcab, t in other:
            e['parts'].append({'at': path, 'cls': c, 'p': plain(t, mcab)})
    for c, (mcab, t) in mbs.items():
        if c and not c.startswith(AI_PREFIX) and c not in ('RoleAttribute', 'RGNetBehaviour', 'BuffPivot'):
            e['parts'].append({'at': '', 'cls': c, 'p': plain(t, mcab)})
    if not e['parts']:
        del e['parts']
    return e


# ---------------------------------------------------------------- theme
themes = {}


def extract_theme(cab, theme, level, roots):
    th = {'level': level, 'bundle': rip.bundle_of[cab], 'stages': {}, 'enemies': [], 'elites': {},
          'floors': [], 'walls': [], 'obstacles': []}
    by_name = {r.name: r for r in roots}
    for r in roots:
        for cls, mcab, t in r.mbs():
            if cls == 'MapManagerLevel' and t.get('level'):
                th['stages'][t['level']] = {'map_long': t['map_long'], 'chest_level': t['chest_level'],
                                            'roomSpacing': t['roomSpacing']}
            if cls == 'MapManagerLevel' and not t.get('level'):
                c = t['camera_bg']
                th['bg'] = '#%02x%02x%02x' % (round(c['r'] * 255), round(c['g'] * 255), round(c['b'] * 255))
                th['libraryKey'] = t.get('elementLibraryKey')
            if cls == 'MapManagerBR':
                for key, dst in (('floor_list', 'floors'), ('wall_list', 'walls'), ('obstacle_list', 'obstacles')):
                    for ptr in t.get(key, []):
                        rr = rip.resolve(ptr, mcab)
                        if not rr:
                            continue
                        from skrip import Node
                        nd = Node(rip, rr[0], rr[1]) if rr[1].type.name == 'GameObject' else None
                        if nd is None:
                            continue
                        th[dst].append(tile_prefab(nd))
    for o in rip.files[cab].objects.values():
        if o.type.name == 'MonoBehaviour':
            t = rip.tree(cab, o)
            if rip.script_name(cab, t) == 'RoomElementLibrary' and t.get('m_Name') == th.get('libraryKey'):
                th['lib'] = {it['id']: it['prefabPath'].split('/')[-1][:-7] for it in t['elementItems']}
    th['tiles'] = {
        'floor': [p['layers'][0]['f'] for p in th['floors'] if p['layers']],
        'wall': [{'front': p['layers'][0]['f'], 'top': p['layers'][-1]['f']} for p in th['walls'] if p['layers']],
    }
    for r in roots:
        if re.match(r'^(e|ex)_', r.name):
            e = extract_enemy(r, theme, level)
            if not e:
                continue
            if r.name.startswith('ex_'):
                base = 'e_' + r.name[3:]
                th['elites'][base] = r.name
            else:
                th['enemies'].append(r.name)
            enemies[r.name] = e
        elif r.name.startswith('bullet'):
            extract_bullet(r.cab, r.go)
    themes[theme] = th


def tile_prefab(nd):
    """Prefab sàn/tường/vật cản -> {name, layers:[{f, at}], col}"""
    out = {'name': nd.name, 'layers': [], 'col': collider_info(nd)}
    for n, path, off in nd.walk():
        f = sr_frame(n)
        if f and 'shadow' not in n.name:
            out['layers'].append({'f': f, 'at': px(off), 'node': n.name})
        if n is not nd:
            c = collider_info(n)
            if c:
                out['col'].update(c)
        st = animator_states(n, nd.name)
        if st:
            out.setdefault('anims', {}).update(st)
    return out


# ---------------------------------------------------------------- prefab chung
prefabs = {}
PREFAB_NAMES = [
    'chest_big', 'chest_room_reward', 'chest_boss', 'box_weapon', 'door_n', 'door_e', 'door_s', 'door_w',
    'transfer_gate', 'portal', 'coin_0_trail', 'coin_2', 'energy', 'energy_pot', 'energy_pot_big', 'health_pot',
    'restore_pot', 'restore_pot_big', 'hit_red', 'hit_yellow', 'hit_orange', 'hit_red_yellow', 'hit_white_large',
    'hit_blue', 'hit_green', 'hit_splash', 'hit_effect_1', 'enemy_dead_explode', 'explode_s', 'smoke',
    'fx_walk_dust', 'effect_black_smoke', 'aim_enemy', 'target', 'target_warn_effect', 'object_shadow',
    'merchant_honest', 'merchant_cunning', 'sell1-2', 'sell2-1', 'npc_banker', 'npc_smith',
    'r_start', 'r_end', 'r_chest_big', 'r_sell', 'r_statue', 'r_pills', 'r_coins_reward', 'r_chest',
] + ['buff_statue_%d' % i for i in range(1, 11)] + ['statue_%02d' % i for i in range(1, 9)]   + ['npc_char%02d' % i for i in range(0, 42)]


def prefab_parts(root):
    """Cây prefab -> danh sách phần vẽ được: [{n, at, sc, o, f?, a?, c?, col?, mbs?}] theo thứ tự duyệt."""
    parts = []
    for nd, path, off in root.walk():
        if not nd.active and nd is not root:
            continue
        e = {'n': path or nd.name, 'at': px(off)}
        sc = nd.scale()
        if sc != (1.0, 1.0):
            e['sc'] = [round(sc[0], 3), round(sc[1], 3)]
        s = nd.comp('SpriteRenderer')
        if s:
            ccab, co, t = s
            f = sprite_ref(t.get('m_Sprite'), ccab)
            if f:
                e['f'] = f
            e['o'] = t.get('m_SortingOrder', 0)
            c = t.get('m_Color') or {}
            if c and (c.get('r', 1), c.get('g', 1), c.get('b', 1), c.get('a', 1)) != (1, 1, 1, 1):
                e['c'] = [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]
            if t.get('m_FlipX'):
                e['fx'] = 1
        st = animator_states(nd, root.name + ('_' + nd.name if nd is not root else ''))
        if st:
            e['a'] = st
        col = collider_info(nd)
        if col:
            e['col'] = col
        m = {c: plain(t, mcab) for c, mcab, t in nd.mbs() if c}
        if m:
            e['mbs'] = m
        if len(e) > 2:
            parts.append(e)
    return parts


def extract_prefab(nd):
    if nd.name not in prefabs:
        prefabs[nd.name] = prefab_parts(nd)
    return nd.name


# ---------------------------------------------------------------- HUD (scene_game)
HUD_KEEP = ('Canvas/control', 'Canvas/info_bar', 'Canvas/player_info', 'Canvas/mini_map', 'Canvas/map',
            'Canvas/role_state', 'Canvas/state', 'Canvas/pause')


def extract_hud():
    """Cây RectTransform của Canvas trong màn chơi -> [{p, amin, amax, pos, size, piv, f?, c?, txt?}]"""
    out = []
    for cab in rip.files:
        if not rip.bundle_of[cab].startswith('scene_game'):
            continue
        for r in rip.roots(cab):
            if r.name != 'Canvas':
                continue
            stack = [(r, 'Canvas')]
            while stack:
                nd, path = stack.pop()
                t = nd.t or {}
                e = {'p': path, 'on': nd.active}
                if 'm_AnchorMin' in t:
                    e.update({'amin': [round(t['m_AnchorMin']['x'], 3), round(t['m_AnchorMin']['y'], 3)],
                              'amax': [round(t['m_AnchorMax']['x'], 3), round(t['m_AnchorMax']['y'], 3)],
                              'pos': [round(t['m_AnchoredPosition']['x'], 1), round(t['m_AnchoredPosition']['y'], 1)],
                              'size': [round(t['m_SizeDelta']['x'], 1), round(t['m_SizeDelta']['y'], 1)],
                              'piv': [round(t['m_Pivot']['x'], 3), round(t['m_Pivot']['y'], 3)]})
                sc = nd.scale()
                if sc != (1.0, 1.0):
                    e['sc'] = [round(sc[0], 3), round(sc[1], 3)]
                for cls, mcab, mt in nd.mbs():
                    if cls in ('Image', 'RawImage') and mt.get('m_Sprite'):
                        f = sprite_ref(mt['m_Sprite'], mcab)
                        if f:
                            e['f'] = f
                            e['it'] = mt.get('m_Type', 0)
                            if mt.get('m_Type') == 3:
                                e['fill'] = [mt.get('m_FillMethod'), round(mt.get('m_FillAmount', 1), 3)]
                        c = mt.get('m_Color')
                        if c and (c['r'], c['g'], c['b'], c['a']) != (1, 1, 1, 1):
                            e['c'] = [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]
                    elif cls in ('Text',) and 'm_FontData' in mt:
                        e['txt'] = {'s': mt['m_FontData'].get('m_FontSize'), 'v': (mt.get('m_Text') or '')[:40],
                                    'al': mt['m_FontData'].get('m_Alignment')}
                        c = mt.get('m_Color')
                        if c:
                            e['txt']['c'] = [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]
                    elif cls:
                        e.setdefault('cls', []).append(cls)
                out.append(e)
                for ch in reversed(nd.children()):
                    stack.append((ch, path + '/' + ch.name))
    return out


# ---------------------------------------------------------------- mẫu phòng
PATTERN_DIR = os.path.expanduser('~/Downloads/sk-ref/tilemap/pattern')


def load_patterns():
    out = {}
    for fn in sorted(os.listdir(PATTERN_DIR)):
        if not fn.endswith('.json'):
            continue
        d = json.load(io.open(os.path.join(PATTERN_DIR, fn), encoding='utf-8'))
        ec = d['enemyGenerateConfig'] or {}
        out[fn[:-5]] = {
            'w': d['patternSize']['x'], 'h': d['patternSize']['y'],
            'it': [[i['Id'], i['Position']['x'], i['Position']['y']] for i in (d['itemInfos'] or [])],
            'ep': [[p['Position']['x'], p['Position']['y']] for p in (d['enemyPoints'] or [])],
            'ex': ec.get('exEnemyRate'),
            'pts': ec.get('fixedTotalPoints') if ec.get('isFixedTotalPoints') else None,
            'waves': ec.get('fixedTotalGenerateTimes') if ec.get('isFixedTotalGenerateTimes') else None,
            'special': d.get('canGenerateSpecialObject'),
        }
    return out


# ---------------------------------------------------------------- nhân vật
HERO_DIRS = {}


def hero_png(path, sprite_name):
    """'Skin/Character/Knight/Skin_0/knight_0.png' + 'knight_0_3' -> ảnh trong kho all/"""
    parts = path.split('/')
    d = os.path.join(ALL, *[p.lower() for p in parts[:-1]])
    f = os.path.join(d, sprite_name + '.png')
    if os.path.exists(f):
        return Image.open(f).convert('RGBA')
    if os.path.isdir(d):
        low = sprite_name.lower() + '.png'
        for x in os.listdir(d):
            if x.lower() == low:
                return Image.open(os.path.join(d, x)).convert('RGBA')
    return None


def register(ref, img):
    """Dò độ lệch x của img so với khung chuẩn ref (IoU mặt nạ, giữ đáy). -> dx"""
    import numpy as np
    a = (np.array(ref)[:, :, 3] > 0)
    b = (np.array(img)[:, :, 3] > 0)
    best, bdx = -1, 0
    H = max(a.shape[0], b.shape[0])
    W = max(a.shape[1], b.shape[1]) + 16
    A = np.zeros((H, W), bool)
    A[H - a.shape[0]:, 8:8 + a.shape[1]] = a
    for dx in range(-8, 9):
        B = np.zeros((H, W), bool)
        x0 = 8 + dx
        if x0 < 0 or x0 + b.shape[1] > W:
            continue
        B[H - b.shape[0]:, x0:x0 + b.shape[1]] = b
        inter = (A & B).sum()
        uni = (A | B).sum()
        s = inter / max(uni, 1)
        if s > best:
            best, bdx = s, dx
    return bdx


heroes = {}


def extract_heroes(want_skins=(0,)):
    cs = None
    for cab, sf in rip.files.items():
        for o in sf.objects.values():
            if o.type.name == 'MonoBehaviour':
                t = rip.tree(cab, o)
                if t.get('m_Name') == 'CharacterSprites':
                    cs = t
                    break
        if cs:
            break
    for m in cs['characterSpriteModels']:
        if m['skinIndex'] not in want_skins:
            continue
        seqs = {'idle': m['idleSprites'], 'run': m['runSprites'], 'dead': m['deadSprites']}
        imgs = {k: [hero_png(s['path'], s['spriteName']) for s in v] for k, v in seqs.items()}
        if not imgs['idle'] or imgs['idle'][0] is None:
            log.append('hero %s skin %s: thiếu ảnh' % (m['characterIndex'], m['skinIndex']))
            continue
        folder = seqs['idle'][0]['path'].split('/')[2].lower()
        ref = imgs['idle'][0]
        rw = ref.width
        entry = {'index': m['characterIndex'], 'folder': folder}
        for k, lst in imgs.items():
            fr = []
            for s, im in zip(seqs[k], lst):
                if im is None:
                    continue
                dx = register(ref, im) if k != 'dead' else 0
                ax = rw / 2.0 - dx
                fr.append(packer.add(s['spriteName'], im, ax if k != 'dead' else im.width / 2.0, im.height))
            key = 'hero_%s_s%d/%s' % (folder, m['skinIndex'], k)
            # Hoạt ảnh nhân vật chuẩn của SK: 8 khung đứng / 8 khung chạy, 16 khung/giây
            # (đo từ clip npc_knight_ide: 8 khung, 0,0625 s/khung).
            anims[key] = {'f': fr, 'd': [0.0625] * len(fr), 'loop': k != 'dead'}
            entry[k] = key
        heroes.setdefault(folder, {})['s%d' % m['skinIndex']] = entry


# ---------------------------------------------------------------- chạy
def main():
    for cab, bname in sorted(rip.bundle_of.items(), key=lambda kv: kv[1]):
        if bname in THEMES:
            theme, level = THEMES[bname]
            roots = rip.roots(cab)
            extract_theme(cab, theme, level, roots)
            print('theme', theme, 'enemies', len(themes[theme]['enemies']), 'frames', len(packer.frames), flush=True)
    by_name = {}
    for cab in rip.files:
        if rip.bundle_of[cab] in ('levelcommon.ab', 'levelobjects.ab', 'common.ab') or rip.bundle_of[cab] in THEMES:
            for r in rip.roots(cab):
                by_name.setdefault(r.name, r)
    want = set(PREFAB_NAMES)
    for th in themes.values():
        want.update(th.get('lib', {}).values())
    for nm in sorted(want):
        if nm in by_name:
            extract_prefab(by_name[nm])
        else:
            log.append('prefab thiếu: ' + nm)
    print('prefabs', len(prefabs), 'frames', len(packer.frames), flush=True)
    hud = extract_hud()
    print('hud nodes', len(hud), 'frames', len(packer.frames), flush=True)
    extras = {}
    for cab in rip.files:
        if rip.bundle_of[cab] not in ('common.ab', 'sprite_atlas.ab'):
            continue
        for o in rip.files[cab].objects.values():
            if o.type.name != 'Sprite':
                continue
            nm = rip.tree(cab, o)['m_Name']
            if re.match(r'^bullet_?\d+$', nm) and nm not in extras:
                extras[nm] = frame_of(cab, o)
    extract_heroes()
    print('heroes', len(heroes), 'frames', len(packer.frames), flush=True)

    os.makedirs(ART, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    table, pages = packer.write(ART)
    atlas = {'pages': ['art/sk/' + p for p in pages], 'f': table}
    data = {'ppu': PPU, 'anims': anims, 'enemies': enemies, 'bullets': bullets, 'themes': themes,
            'heroes': heroes, 'prefabs': prefabs, 'patterns': load_patterns(), 'hud': hud,
            'sprites': {'bullets': sorted(v for v in extras.values() if v)}}
    with io.open(os.path.join(DATA, 'sk-data.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/build_sk.py — không sửa tay.\n')
        f.write('window.SK_ATLAS = ' + json.dumps(atlas, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('window.SK_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('pages', pages, 'frames', len(table), 'anims', len(anims), 'bullets', len(bullets))
    for line in log:
        print('!', line)


if __name__ == '__main__':
    main()
