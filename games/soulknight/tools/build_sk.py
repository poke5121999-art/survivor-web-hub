# -*- coding: utf-8 -*-
"""Lever bóc Soul Knight -> art/sk/atlas*.png + data/sk-data.js

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_sk.py

Đọc bản cài đủ 8.6.0 ở D:\\sk86-ref\\UnityDataAssetPack\\assets\\AssetBundles (ngoài git, 2375 bundle,
nạp lười qua chỉ mục CAB của skrip.Rip). Kho PNG cũ 8.5.1 ở ~/Downloads/sk-ref/all chỉ còn là đường lùi
cho `png_anims` mà bundle 8.6 không có. Không sửa tay tệp sinh ra.
"""
import io
import json
import os
import re
import sys
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from skrip import Rip  # noqa: E402
from pack import Packer  # noqa: E402
import clip_xform  # noqa: E402

GAME = os.path.dirname(HERE)
# --out DIR: ghi DIR/art/sk + DIR/data thay vì vào game (thử lever mà không đè bản các agent khác đang chạy)
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else GAME
ART = os.path.join(OUT, 'art', 'sk')
DATA = os.path.join(OUT, 'data')
ALL = os.path.expanduser('~/Downloads/sk-ref/all')
PPU = 16.0

THEMES = {
    'level/1/a.ab': ('forest', 1), 'level/1/b.ab': ('glacier', 1), 'level/1/c.ab': ('ruins', 1),
    # 1G Di Tích Máy Móc (map_G1 "1-1", quái e_old_*, trùm boss30 Di Tích Zulan) [ĐO config/map_levels, enemies.LevelKey]
    'level/1/g.ab': ('zulanruins', 1),
    'level/2/a.ab': ('castle', 2), 'level/2/b.ab': ('graveyard', 2), 'level/2/c.ab': ('halloween', 2),
    'level/2/d.ab': ('icecave', 2), 'level/2/e.ab': ('swamp', 2), 'level/2/f.ab': ('relic', 2),
    'level/2/g.ab': ('machinery', 2),
    'level/3/a.ab': ('aliens', 3), 'level/3/b.ab': ('volcano', 3), 'level/3/c.ab': ('island', 3),
    # 4A Di Tích Núi Khối, ải mở rộng sau 3-5 (map_A16..A20 "4-1".."4-5") [ĐO config/map_levels; tools/polish/FLOOR4.md]
    'level/4/a.ab': ('monolith', 4),
    # 4B Chiến Trường Cổ (map_B16..B20, quái e_mob0..5) [ĐO config/map_levels; tools/polish/FLOOR4.md]
    'level/4/b.ab': ('battleground', 4),
    # 4C Đáy Biển (map_C16..C20, quái e_seabed_mob0..5, HUD oxy) [ĐO config/map_levels; tools/polish/FLOOR4.md]
    'level/4/c.ab': ('seabed', 4),
}
# Họ bundle nạp sẵn. Bundle khác (weapon, bullet, boss/*, ui, sound_effect...) nạp khi một con trỏ chỉ tới
# hoặc khi tools/extra/*.json ghi tên trong "bundles".
BASE_BUNDLES = ('common', 'levelcommon', 'levelobjects', 'level/*', 'multi_room', 'patternroom', 'scene_game',
                'sprite_atlas')

AI_PREFIX = ('EnemyAI', 'Enemy', 'EliteArcher', 'AIBrain', 'AIController', 'Boss')
WEAPON_PREFIX = ('EGun', 'ESword', 'EWeapon', 'EBow', 'EStaff', 'EThrow', 'ELaser', 'EMelee', 'EHammer')
SKIP_KEYS = {'m_GameObject', 'm_Script', 'm_Enabled', 'm_Name', 'serializationData', 'm_ObjectHideFlags',
             'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset'}

rip = Rip(bundles=BASE_BUNDLES)
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


def frame_of(cab, obj, native=False):
    """Sprite obj -> tên khung trong atlas. native: giữ điểm ảnh gốc, không quy về PPU 16 (sprite UI)."""
    s = rip.sprite(cab, obj)
    if not s:
        return None
    name, img, ax, ay, ppu = s
    if not native and abs(ppu - PPU) > 0.5 and ppu > 0:
        k = PPU / ppu
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
        ax, ay = ax * k, ay * k
    return packer.add(name, img, ax, ay)


def sprite_ref(ptr, cab, native=False):
    r = rip.resolve(ptr, cab)
    return frame_of(*r, native=native) if r else None


def anim_of(cab, clip_obj, key, root=None, variant=None, extra=False, keep=False):
    """root: skrip.Node mang Animator -> thêm tr (đường cong Transform, xem clip_xform.py) và len. Cùng clip mà tư thế
    nghỉ của prefab khác (tr khác) thì ghi thêm khoá '<key>@<variant>'. Clip chỉ có Transform thì f = [].
    extra (Animator gốc/vũ khí của quái, nhân vật): thêm đường bật/tắt 'on' vào tr và 'fp' = nút nhận đường sprite
    khi nút đó không phải gốc. keep: clip không có khung lẫn Transform (vd char_hit chỉ có sự kiện HitBack, w_ide đúng
    tư thế nghỉ) vẫn ghi {f: [], d: [], len, ev?} để state còn trong dữ liệu."""
    tr, ln = clip_xform.clip_tr(rip, cab, clip_obj, root, extra) if root is not None else (None, 0)
    fp = clip_xform.sprite_path(rip, cab, clip_obj, root) if (extra and root is not None) else None
    if fp is not None and fp.split('/')[-1] in ('', 'body'):
        fp = None   # nút thân (quy ước 'body' của extract_enemy/extract_heroes): mã chạy đã vẽ khung vào đó
    if key in anims:
        if root is None or (anims[key].get('tr') == tr and anims[key].get('fp') == (fp or None)):
            return key
        k2 = '%s@%s' % (key, variant or root.name)
        if k2 not in anims:
            a = {x: v for x, v in anims[key].items() if x not in ('tr', 'len', 'fp')}
            if tr:
                a['tr'], a['len'] = tr, round(ln, 4)
            elif not a['f'] and 'len' in anims[key]:
                a['len'] = anims[key]['len']
            if fp:
                a['fp'] = fp
            anims[k2] = a
            clip_xform.stats.variants += 1
        return k2
    c = rip.clip(cab, clip_obj)
    fr, du = [], []
    keys = c['keys']
    for i, (t, r) in enumerate(keys):
        f = frame_of(*r) if r else None
        nxt = keys[i + 1][0] if i + 1 < len(keys) else max(c['len'], t + 1.0 / max(c['rate'], 1))
        fr.append(f)
        du.append(round(max(nxt - t, 0.0), 4))
    if not fr and not tr and not keep:
        return None
    a = {'f': fr, 'd': du, 'loop': c['loop']}
    if c['events']:
        a['ev'] = [[round(t, 4), fn] for t, fn in c['events']]
    if tr:
        a['tr'], a['len'] = tr, round(ln, 4)
    elif not fr:
        a['len'] = round(c['len'], 4)
    if fp:
        a['fp'] = fp
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
        k = anim_of(clcab, clobj, '%s/%s' % (ctrl_name, st), node, prefix)
        if k:
            out[st] = k
    return out


# Máy trạng thái Animator (tools/README.md, mục `ctrl`): ctrls[tên] = {p, L}. Thực thể giữ tên qua trường `ctrl`, còn
# khoá anim của từng state nằm trong map state -> khoá anim của thực thể (e.anims, w.anims, s0.layers).
ctrls = {}
_ctrl_sig = {}


def _state_names(layer, li):
    """Tên state theo quy ước khoá anim: layer 0 giữ tên, layer n thêm 'Ln.'; trùng tên trong layer thì thêm '~k'."""
    out, seen = [], {}
    for s in layer['states']:
        nm = s['name'] if li == 0 else 'L%d.%s' % (li, s['name'])
        if nm in seen:
            seen[nm] += 1
            nm = '%s~%d' % (nm, seen[nm])
        else:
            seen[nm] = 0
        out.append(nm)
    return out


def register_ctrl(g):
    """Đồ thị controller (skrip.controller_graph) -> khoá trong ctrls. Hai controller trùng tên mà đồ thị khác: '@2'..."""
    sm = {'p': g['params'], 'L': []}
    for li, L in enumerate(g['layers']):
        names = _state_names(L, li)

        def T(x):
            return [names[x['to']] if x['to'] is not None else None, x['c'], x['exit'], x['dur']]
        ly = {'w': 1.0 if li == 0 else L['w'], 'add': L['add'], 'def': names[L['def']] if names else None,
              'any': [T(x) for x in L['any']], 'st': {}}
        for nm, st in zip(names, L['states']):
            ly['st'][nm] = [T(x) for x in st['tr']]
            if st['speed'] != 1:
                ly.setdefault('sp', {})[nm] = st['speed']
        sm['L'].append(ly)
    sig = json.dumps(sm, sort_keys=True)
    base = g['name'] or 'ctrl'
    name, i = base, 1
    while name in ctrls and _ctrl_sig[name] != sig:
        i += 1
        name = '%s@%d' % (base, i)
    ctrls[name], _ctrl_sig[name] = sm, sig
    return name


def animator_full(node, prefix, keep_from=0):
    """Như animator_states nhưng đọc mọi layer theo đồ thị đầy đủ -> (map state -> khoá anim, tên ctrl | None).
    State ở layer >= keep_from giữ cả clip rỗng (anim_of keep)."""
    a = node.comp('Animator')
    if not a:
        return {}, None
    ccab, co, t = a
    r = rip.resolve(t.get('m_Controller'), ccab)
    if not r:
        return {}, None
    g = rip.controller_graph(*r)
    if not g:
        return {}, None
    ctrl_name = rip.tree(*r).get('m_Name') or prefix
    out = {}
    for li, L in enumerate(g['layers']):
        for nm, st in zip(_state_names(L, li), L['states']):
            if not st['clip'] or nm in out:
                continue
            k = anim_of(st['clip'][0], st['clip'][1], '%s/%s' % (ctrl_name, nm), node, prefix, True, li >= keep_from)
            if k:
                out[nm] = k
    return out, register_ctrl(g)


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
    e['anims'], ctl = animator_full(root, root.name, keep_from=1)
    if ctl:
        e['ctrl'] = ctl
    root_anim = bool(e['anims'])
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
            # bodyPath: nút thân tính từ nút mang Animator của e['anims'] (khoá của anims[..].tr)
            if root_anim:
                e.setdefault('bodyPath', path[1:])
            st = animator_states(nd, root.name + '_body')
            if st and not any(anims[k]['f'] for k in e['anims'].values()):
                # Animator ở gốc chỉ động Transform (vd e_owl_metal: gốc nhún img, thân vỗ cánh bằng Animator riêng):
                # khung lấy từ Animator của thân như cũ, tư thế lấy từ Animator gốc qua e['pose'].
                if e['anims']:
                    e['pose'] = {'anims': e['anims'], 'body': path[1:]}
                    e.pop('bodyPath', None)
                e['anims'] = st
                e['bodyPath'] = ''
        elif leaf == 'shadow':
            e['shadow'] = sr_frame(nd)
            e['shadowOff'] = px(off)
        elif leaf.startswith('h') and nd.comp('MonoBehaviour') and any(c == 'RGEHand' for c, _, _ in nd.mbs()):
            e.setdefault('hands', []).append(px(off))
        wmb = [(c, mcab, t) for c, mcab, t in nd.mbs() if c and c.startswith(WEAPON_PREFIX)]
        if wmb:
            c, mcab, t = wmb[0]
            w = {'cls': c, 'p': plain(t, mcab), 'at': px(off)}
            if root_anim:
                w['path'] = path[1:]
            if 'bullet' in t:
                w['bullet'] = bullet_ref(t['bullet'], mcab)
            w['anims'], wctl = animator_full(nd, root.name + '_weapon')
            if wctl:
                w['ctrl'] = wctl
            # Sprite do mã EGun đổi (EGun004.s_ide/s_atk: cung giương khi atk_b) -> khung trong atlas.
            for fk, fv in t.items():
                if isinstance(fv, dict) and set(fv) == {'m_FileID', 'm_PathID'} and fv['m_PathID']:
                    rr = rip.resolve(fv, mcab)
                    if rr and rr[1].type.name == 'Sprite':
                        f = frame_of(*rr)
                        if f:
                            w.setdefault('spr', {})[fk] = f
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
    # Nút mà clip layer >= 1 của Animator gốc bật/tắt hoặc đổi sprite ngoài thân (dead_tap: "!" của char_atk, hồn ma khi chết).
    want = set()
    for st, k in e['anims'].items():
        if not st.startswith('L'):
            continue   # layer 0: bật/tắt nút tay/súng mã chạy đọc thẳng từ tr, không cần nút riêng
        a = anims.get(k) or {}
        if a.get('fp'):
            want.add(a['fp'])
        want.update(p for p, n in (a.get('tr') or {}).items() if 'on' in n)
    want.discard(e.get('bodyPath'))
    if want and root_anim:
        for nd, path, off in root.walk():
            if path[1:] in want:
                n = {'at': px(off)}
                sr = nd.comp('SpriteRenderer')
                if sr:
                    f = sprite_ref(sr[2].get('m_Sprite'), sr[0])
                    if f:
                        n['f'] = f
                    n['on'] = 1 if (sr[2].get('m_Enabled', 1) and nd.active) else 0
                    n['o'] = sr[2].get('m_SortingOrder', 0)
                e.setdefault('nodes', {})[path[1:]] = n
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
            # 4A: prefab gốc map_A_MonolithicMountainsRuins ghi level "0" (không rỗng như vùng khác)
            if cls == 'MapManagerLevel' and (not t.get('level') or (theme in ('monolith', 'battleground', 'seabed') and t.get('level') == '0')):
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
    for o in list(rip.files[cab].objects.values()):
        if o.type.name == 'MonoBehaviour':
            t = rip.tree(cab, o)
            if rip.script_name(cab, t) == 'RoomElementLibrary' and t.get('m_Name') == th.get('libraryKey'):
                th['lib'] = {it['id']: it['prefabPath'].split('/')[-1][:-7] for it in t['elementItems']}
    if theme == 'monolith':
        # 4A không có MapManagerBR (sàn là RuleTile 4A_RB_FloorTile_1/2, tường do RWallSubBuilderMMR dựng trong IL2CPP):
        # sàn = các khung trong của luật đầu RB_Floor_{1,2}_{9,16}; tường = prefab wall_MMR [ĐO bundle level/4/a; SUY cách ghép]
        th['walls'] = [tile_prefab(by_name['wall_MMR'])]
        sp = bundle_sprites(rip.bundle_of[cab])
        fl = []
        for nm in ('RB_Floor_1_9', 'RB_Floor_1_16', 'RB_Floor_2_9', 'RB_Floor_2_16'):
            hit = sp.get(nm)
            f = frame_of(*hit) if hit else None
            if f:
                fl.append(f)
        th['tiles'] = {'floor': fl, 'wall': [{'front': p['layers'][0]['f'], 'top': None} for p in th['walls'] if p['layers']]}
    elif theme == 'battleground':
        # 4B: sàn là RuleTile 4B_RB_FloorTile_0..4 (bãi cỏ gr_21, gr_22, RB_Floor_4), tường dựng trong IL2CPP: dùng prefab wall_AB [ĐO bundle level/4/b; SUY cách ghép]
        th['walls'] = [tile_prefab(by_name['wall_AB'])]
        sp = bundle_sprites(rip.bundle_of[cab])
        fl = []
        for nm in ('gr_21', 'gr_22', 'RB_Floor_4'):   # RuleTile 4B_RB_FloorTile_0 (bãi cỏ)
            hit = sp.get(nm)
            f = frame_of(*hit) if hit else None
            if f:
                fl.append(f)
        th['tiles'] = {'floor': fl, 'wall': [{'front': p['layers'][0]['f'], 'top': None} for p in th['walls'] if p['layers']]}
    elif theme == 'seabed':
        # 4C: sàn là RuleTile 4C_RB_FloorTile_0..2 (RB_Floor_0..2), tường dựng trong IL2CPP: dùng prefab wall_seabed [ĐO bundle level/4/c; SUY cách ghép]
        th['walls'] = [tile_prefab(next(r for n, r in by_name.items() if n.lower() == 'wall_seabed'))]
        sp = bundle_sprites(rip.bundle_of[cab])
        fl = []
        for nm in ('RB_Floor_0', 'RB_Floor_1', 'RB_Floor_2'):
            hit = sp.get(nm)
            f = frame_of(*hit) if hit else None
            if f:
                fl.append(f)
        th['tiles'] = {'floor': fl, 'wall': [{'front': p['layers'][0]['f'], 'top': None} for p in th['walls'] if p['layers']]}
    else:
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
    parts, dead = [], []
    for nd, path, off in root.walk():
        if not nd.active and nd is not root:
            dead.append(path)
            continue
        e = {'n': path or nd.name, 'at': px(off)}
        # ia: một tổ tiên đang tắt (m_IsActive = 0), mã gốc bật lúc chạy; nơi vẽ tĩnh (sảnh) bỏ qua.
        if any(path.startswith(d + '/') for d in dead):
            e['ia'] = 1
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
        if len(e) - ('ia' in e) > 2:
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
    for cab in rip.cabs('scene_game'):
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
                        f = sprite_ref(mt['m_Sprite'], mcab, native=True)
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


def pattern_sources():
    """-> [(tên, dict JSON)]: TextAsset trong patternroom.ab (8.6); không có thì thư mục JSON cũ 8.5.1."""
    out = []
    for cab, o in rip.objects(['patternroom'], ('TextAsset',)):
        d = o.read()
        txt = d.m_Script
        if isinstance(txt, bytes):
            txt = txt.decode('utf-8', 'surrogateescape')
        out.append((d.m_Name, json.loads(txt)))
    if out:
        return sorted(out, key=lambda x: x[0])
    for fn in sorted(os.listdir(PATTERN_DIR)):
        if fn.endswith('.json'):
            out.append((fn[:-5], json.load(io.open(os.path.join(PATTERN_DIR, fn), encoding='utf-8'))))
    return out


def load_patterns():
    out = {}
    for name, d in pattern_sources():
        ec = d['enemyGenerateConfig'] or {}
        out[name] = {
            'w': d['patternSize']['x'], 'h': d['patternSize']['y'],
            'it': [[i['Id'], i['Position']['x'], i['Position']['y']] for i in (d['itemInfos'] or [])],
            'ep': [[p['Position']['x'], p['Position']['y']] for p in (d['enemyPoints'] or [])],
            'ex': ec.get('exEnemyRate'),
            'pts': ec.get('fixedTotalPoints') if ec.get('isFixedTotalPoints') else None,
            'waves': ec.get('fixedTotalGenerateTimes') if ec.get('isFixedTotalGenerateTimes') else None,
            'special': d.get('canGenerateSpecialObject'),
        }
    return out


# ---------------------------------------------------------------- sprite theo tên trong bundle
_by_name = {}


class SpriteNames(dict):
    """{tên đúng: (cab, obj)}; get() thử tên đúng trước rồi mới tới tên viết thường (8.6 đổi hoa/thường vài tệp)."""

    def __init__(self):
        super().__init__()
        self.low = {}

    def get(self, nm, default=None):
        hit = dict.get(self, nm)
        return hit if hit is not None else self.low.get(nm.lower(), default)

    def __contains__(self, nm):
        return self.get(nm) is not None


def bundle_sprites(rel):
    """rel bundle -> SpriteNames của mọi Sprite trong bundle đó (nạp nếu chưa)."""
    if rel not in _by_name:
        m = SpriteNames()
        for cab, o in rip.objects([rel], ('Sprite',)):
            try:
                nm = o.peek_name()
            except Exception:
                nm = rip.tree(cab, o)['m_Name']
            m.setdefault(nm, (cab, o))
            m.low.setdefault(nm.lower(), (cab, o))
        _by_name[rel] = m
    return _by_name[rel]


def scaled_sprite(cab, o, native=False):
    """rip.sprite() quy về PPU 16 -> (tên, ảnh, ax, ay) hoặc None. native: giữ điểm ảnh gốc (icon UI có PPU 32,
    100...: thu về PPU 16 thì icon 32 px chỉ còn 16 px, mất nét)."""
    s = rip.sprite(cab, o)
    if not s:
        return None
    name, img, ax, ay, ppu = s
    if not native and abs(ppu - PPU) > 0.5 and ppu > 0:
        k = PPU / ppu
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
        ax, ay = ax * k, ay * k
    return name, img, ax, ay


def add_registered(items, anchor='bottom', register=True):
    """items = [(tên, ảnh, pivot_x, pivot_y)] của một hoạt ảnh -> ([tên khung], (dx, dy)).

    Giữ quy ước điểm neo cũ (khung 0: giữa-đáy hoặc tâm của ảnh đã cắt), còn các khung sau xếp theo pivot
    Unity thật nên không phải dò độ lệch bằng mặt nạ nữa. (dx, dy) = vị trí pivot Unity so với điểm neo,
    tính bằng px màn hình (y xuống)."""
    if not items:
        return [], (0.0, 0.0)
    _, im0, px0, py0 = items[0]
    ay0 = im0.height if anchor == 'bottom' else im0.height / 2.0
    dx, dy = im0.width / 2.0 - px0, ay0 - py0
    fr = []
    for nm, im, px, py in items:
        if register:
            ax, ay = px + dx, py + dy
        else:
            ax, ay = im0.width / 2.0, (im.height if anchor == 'bottom' else im.height / 2.0)
        fr.append(packer.add(nm, im, ax, ay))
    return fr, (round(-dx, 2), round(-dy, 2))


def png_path_bundle(dirpath):
    """Thư mục kho PNG cũ ('boss/boss08', 'Skin/Character/Ranger/Skin_0'...) -> bundle 8.6 cùng tên, hoặc None."""
    rel = dirpath.strip('/').lower() + '.ab'
    return rel if rel in rip.index['bundles'] else None


# ---------------------------------------------------------------- nhân vật
def hero_png(path, sprite_name):
    """'Skin/Character/Knight/Skin_0/knight_0.png' + 'knight_0_3' -> ảnh trong kho all/ (8.5.1, đường lùi)"""
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
    """Dò độ lệch x của img so với khung chuẩn ref (IoU mặt nạ, giữ đáy). -> dx. Chỉ dùng cho PNG 8.5.1."""
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


def add_png_frames(pngs, anchor='bottom', reg=True):
    """Đường lùi 8.5.1: [(tên, ảnh PNG đã cắt)] -> [tên khung], neo dò bằng register()."""
    ref = pngs[0][1]
    fr = []
    for nm, im in pngs:
        dx = register(ref, im) if reg and len(pngs) > 1 else 0
        ax = ref.width / 2.0 - dx
        ay = im.height if anchor == 'bottom' else im.height / 2.0
        fr.append(packer.add(nm, im, ax, ay))
    return fr


heroes = {}
hero_src = {'bundle': 0, 'png': 0}


def hero_clip_durations(rel, skin, kind, names):
    """Thời lượng từng khung, đọc từ clip skin_<n>_<kind> của bundle skin nếu clip đúng dãy sprite đó."""
    for cab, o in rip.objects([rel], ('AnimationClip',)):
        if rip.tree(cab, o)['m_Name'] != 'skin_%d_%s' % (skin, kind):
            continue
        c = rip.clip(cab, o)
        ks = [(t, rip.tree(*r)['m_Name'].lower() if r else None) for t, r in c['keys']]
        if [k for _, k in ks[:len(names)]] != [n.lower() for n in names]:
            return None
        out = []
        for i in range(len(names)):
            nxt = ks[i + 1][0] if i + 1 < len(ks) else c['len']
            out.append(round(max(nxt - ks[i][0], 0.0), 4))
        return out if all(out) else None
    return None


def hero_clip(rel, skin, kind):
    """-> (cab, AnimationClip) tên skin_<n>_<kind> trong bundle skin, hoặc None."""
    for cab, o in rip.objects([rel], ('AnimationClip',)):
        if rip.tree(cab, o)['m_Name'] == 'skin_%d_%s' % (skin, kind):
            return cab, o
    return None


def extract_heroes(want_skins=(0,)):
    cs = None
    for cab in rip.cabs('common'):
        for o in list(rip.files[cab].objects.values()):
            if o.type.name == 'MonoBehaviour' and o.peek_name() == 'CharacterSprites':
                cs = rip.tree(cab, o)
                break
        if cs:
            break
    for m in cs['characterSpriteModels']:
        if m['skinIndex'] not in want_skins:
            continue
        seqs = {'idle': m['idleSprites'], 'run': m['runSprites'], 'dead': m['deadSprites']}
        folder = seqs['idle'][0]['path'].split('/')[2].lower()
        entry = {'index': m['characterIndex'], 'folder': folder}
        rel = png_path_bundle('/'.join(seqs['idle'][0]['path'].split('/')[:-1]))
        sp = bundle_sprites(rel) if rel else {}
        ok = bool(sp) and all(s['spriteName'] in sp for v in seqs.values() for s in v)
        pivot = None
        hero_root = roots_by_name('hero.ab').get('c%02d' % m['characterIndex'])
        if hero_root is not None:
            for nd, path, off in hero_root.walk():
                if nd.name == 'body' and nd.comp('SpriteRenderer') and 'bodyPath' not in entry:
                    entry['bodyPath'] = path[1:]
                elif nd.name == 'h1' and 'handPath' not in entry:
                    entry['handPath'] = path[1:]
        else:
            log.append('hero %s: không có prefab c%02d trong hero.ab' % (folder, m['characterIndex']))
        for k, seq in seqs.items():
            names = [s['spriteName'] for s in seq]
            d = None
            if ok:
                items = []
                for s in seq:
                    r = scaled_sprite(*sp.get(s['spriteName']))
                    if r:
                        items.append((s['spriteName'], r[1], r[2], r[3]))
                fr, dv = add_registered(items, 'bottom', True)
                if k == 'idle':
                    pivot = dv
                d = hero_clip_durations(rel, m['skinIndex'], k, names) if k != 'dead' else None
            else:
                pngs = [(n, hero_png(s['path'], n)) for n, s in zip(names, seq)]
                pngs = [(n, im) for n, im in pngs if im is not None]
                if not pngs:
                    log.append('hero %s skin %s %s: thiếu ảnh' % (m['characterIndex'], m['skinIndex'], k))
                    continue
                fr = add_png_frames(pngs, 'bottom', k != 'dead')
            key = 'hero_%s_s%d/%s' % (folder, m['skinIndex'], k)
            # Mặc định 16 khung/giây [ĐO clip skin_0_idle/skin_0_run: 8 khung, 0,0625 s/khung].
            anims[key] = {'f': fr, 'd': d or [0.0625] * len(fr), 'loop': k != 'dead'}
            # Đường cong Transform của clip skin_<n>_<kind> (nhún khi chạy, nảy khi chết), neo vào prefab c<index>
            # trong hero.ab (Animator ở gốc).
            hc = hero_clip(rel, m['skinIndex'], k) if (ok and hero_root) else None
            if hc:
                tr, ln = clip_xform.clip_tr(rip, hc[0], hc[1], hero_root)
                if tr:
                    anims[key]['tr'], anims[key]['len'] = tr, round(ln, 4)
            entry[k] = key
        # Layer >= 1 của controller skin (char_hit...): tr/fp tính theo prefab c<index> của hero.ab.
        if ok and hero_root is not None:
            for ccab, co in rip.objects([rel], ('AnimatorController', 'AnimatorOverrideController')):
                g = rip.controller_graph(ccab, co)
                if not g:
                    continue
                cname = rip.tree(ccab, co).get('m_Name') or folder
                lay = {}
                for li, L in enumerate(g['layers']):
                    if li == 0:
                        continue
                    for nm, st in zip(_state_names(L, li), L['states']):
                        if st['clip'] and nm not in lay:
                            k = anim_of(st['clip'][0], st['clip'][1], '%s/%s' % (cname, nm), hero_root, folder, True, True)
                            if k:
                                lay[nm] = k
                if lay:
                    entry['layers'] = lay
                    entry['ctrl'] = register_ctrl(g)
                break
        hero_src['bundle' if ok else 'png'] += 1
        if pivot:
            entry['pivot'] = list(pivot)
        heroes.setdefault(folder, {})['s%d' % m['skinIndex']] = entry


# ---------------------------------------------------------------- danh sách thêm của từng mô-đun
EXTRA_DIR = os.path.join(HERE, 'extra')
# Nơi dò sprite/clip khi tệp extra không ghi "bundles"; giữ đúng họ và thứ tự của bản 8.5.1 để tên khung
# (đuôi ~2 khi trùng tên) không đổi.
EXTRA_SCAN = ('common', 'level/1/a', 'level/1/b', 'level/1/c', 'level/2/*', 'level/3/*', 'level/difficulty',
              'levelcommon', 'levelobjects', 'sprite_atlas')
# png_anims: ngoài bundle trùng tên thư mục, dò thêm ở đây trước khi lùi về PNG 8.5.1.
PNG_FALLBACK_BUNDLES = ('sprite_atlas', 'common', 'ui', 'hero')
png_src = {'bundle': 0, 'png': 0}
_roots = {}


def roots_by_name(rel):
    if rel not in _roots:
        m = {}
        for cab in rip.load(rel):
            for r in rip.roots(cab):
                m.setdefault(r.name, r)
        _roots[rel] = m
    return _roots[rel]


def extra_bundles(fn, sp):
    """Mẫu trong "bundles" -> [rel]; mẫu không khớp bundle nào thì ghi log."""
    out = []
    for pat in sp.get('bundles', []):
        hit = rip.bundles(pat)
        if not hit:
            log.append('%s: bundle không có: %s' % (fn, pat))
        out.extend(r for r in hit if r not in out)
    return out


def png_anim_sprites(a):
    """Tìm các khung của một png_anims trong bundle 8.6 -> [(tên, ảnh, pivot_x, pivot_y)] hoặc None nếu thiếu."""
    rels = [a['bundle']] if a.get('bundle') else []
    own = png_path_bundle(a['dir'])
    if own:
        rels.append(own)
    rels += [r for r in rip.bundles(*PNG_FALLBACK_BUNDLES) if r not in rels]
    items = []
    for nm in a['frames']:
        hit = None
        for rel in rels:
            if rel.endswith('.ab') and rel not in rip.index['bundles']:
                continue
            hit = bundle_sprites(rel).get(nm)
            if hit:
                break
        r = scaled_sprite(*hit, native=True) if hit else None
        if not r:
            return None
        items.append((nm, r[1], r[2], r[3]))
    return items


def extract_extras(by_name):
    """tools/extra/*.json -> {sprites, clips, png}. Mỗi mô-đun giữ một tệp riêng, xem tools/README.md."""
    out = {'sprites': {}, 'clips': {}, 'png': {}}
    if not os.path.isdir(EXTRA_DIR):
        return out
    specs = []
    for fn in sorted(os.listdir(EXTRA_DIR)):
        if fn.endswith('.json'):
            specs.append((fn, json.load(io.open(os.path.join(EXTRA_DIR, fn), encoding='utf-8'))))
    base = rip.bundles(*EXTRA_SCAN)
    scan = {rel: ([], []) for rel in base}   # rel -> ([(khoá, regex sprite)], [regex clip])
    for fn, sp in specs:
        more = extra_bundles(fn, sp)
        for nm in sp.get('prefabs', []):
            node = by_name.get(nm)
            for rel in more:
                if node is None:
                    node = roots_by_name(rel).get(nm)
            if node is not None:
                extract_prefab(node)
            else:
                log.append('%s: prefab thiếu %s' % (fn, nm))
        rs = [(r, re.compile(r)) for r in sp.get('sprites', [])]
        rc = [re.compile(r) for r in sp.get('clips', [])]
        for rel in base + [r for r in more if r not in base]:
            e = scan.setdefault(rel, ([], []))
            e[0].extend(x for x in rs if x[0] not in [y[0] for y in e[0]])
            e[1].extend(rc)
    for rel, (rx_sprites, rx_clips) in scan.items():
        if not rx_sprites and not rx_clips:
            continue
        for cab, o in rip.objects([rel], ('Sprite', 'AnimationClip')):
            tn = o.type.name
            if tn == 'Sprite' and rx_sprites:
                nm = rip.tree(cab, o)['m_Name']
                for key, rx in rx_sprites:
                    if rx.search(nm):
                        f = frame_of(cab, o)
                        if f and f not in out['sprites'].setdefault(key, []):
                            out['sprites'][key].append(f)
            elif tn == 'AnimationClip' and rx_clips:
                nm = rip.tree(cab, o)['m_Name']
                if nm not in out['clips'] and any(rx.search(nm) for rx in rx_clips):
                    k = anim_of(cab, o, 'clip/' + nm)
                    if k:
                        out['clips'][nm] = k
    for key in out['sprites']:
        out['sprites'][key].sort()
    for fn, sp in specs:
        for key, a in (sp.get('png_anims') or {}).items():
            anchor = a.get('anchor', 'bottom')
            reg = a.get('register', True)
            items = png_anim_sprites(a)
            if items:
                fr, _ = add_registered(items, anchor, reg and len(items) > 1)
                png_src['bundle'] += 1
            else:
                imgs = []
                for nm in a['frames']:
                    pth = os.path.join(ALL, *a['dir'].split('/'), nm + '.png')
                    if os.path.exists(pth):
                        imgs.append((nm, Image.open(pth).convert('RGBA')))
                    else:
                        log.append('%s: thiếu %s/%s (cả bundle 8.6 lẫn PNG 8.5.1)' % (fn, a['dir'], nm))
                if not imgs:
                    continue
                fr = add_png_frames(imgs, anchor, reg)
                png_src['png'] += 1
                log.append('%s: png_anims %s đọc PNG 8.5.1 (bundle 8.6 không có đủ khung)' % (fn, key))
            k = 'png/' + key
            fps = float(a.get('fps', 10))
            anims[k] = {'f': fr, 'd': [round(1.0 / fps, 4)] * len(fr), 'loop': a.get('loop', True)}
            out['png'][key] = k
    return out


def build_lock():
    """Nhiều agent có thể chạy lever cùng lúc; khoá bằng mkdir để lượt sau chờ lượt trước ghi xong."""
    import time
    lock = os.path.join(HERE, '.build_lock')
    for _ in range(900):
        try:
            os.mkdir(lock)
            return lock
        except FileExistsError:
            time.sleep(2)
    raise SystemExit('khoá .build_lock bị giữ quá 30 phút; xoá tay nếu không còn tiến trình nào chạy')


# ---------------------------------------------------------------- chạy
def main():
    t0 = time.time()
    for rel in sorted(THEMES):
        theme, level = THEMES[rel]
        for cab in rip.load(rel):
            extract_theme(cab, theme, level, rip.roots(cab))
        print('theme', theme, 'enemies', len(themes[theme]['enemies']), 'frames', len(packer.frames),
              '%.0fs' % (time.time() - t0), flush=True)
    by_name = {}
    for cab in rip.cabs('common', *sorted(THEMES), 'levelcommon', 'levelobjects'):
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
    print('prefabs', len(prefabs), 'frames', len(packer.frames), '%.0fs' % (time.time() - t0), flush=True)
    hud = extract_hud()
    print('hud nodes', len(hud), 'frames', len(packer.frames), flush=True)
    extras = {}
    for cab, o in rip.objects(['common', 'sprite_atlas'], ('Sprite',)):
        nm = rip.tree(cab, o)['m_Name']
        if re.match(r'^bullet_?\d+$', nm) and nm not in extras:
            extras[nm] = frame_of(cab, o)
    # Sprite vũ khí mà wiki khớp được: sprite_atlas trước (như 8.5.1), rồi weapon/skin/boss... có trong 8.6.
    wiki_w = os.path.join(HERE, 'wiki', 'weapons.json')
    want_w = {}
    if os.path.exists(wiki_w):
        for w in json.load(io.open(wiki_w, encoding='utf-8')):
            sp = w.get('sprite') or {}
            if sp.get('bundle') and sp.get('name'):
                want_w.setdefault(sp['bundle'] + '.ab', set()).add(sp['name'])
    got_w = n_w = 0
    for rel in sorted(want_w, key=lambda r: (r != 'sprite_atlas.ab', r)):
        n_w += len(want_w[rel])
        if rel not in rip.index['bundles']:
            log.append('sprite vũ khí wiki: không có bundle %s (%d sprite)' % (rel, len(want_w[rel])))
            continue
        sp = bundle_sprites(rel)
        for nm in sorted(want_w[rel]):
            if nm in sp and frame_of(*sp.get(nm)):
                got_w += 1
    print('weapon sprites', got_w, 'of', n_w, flush=True)
    extra = extract_extras(by_name)
    print('extra sprites', sum(len(v) for v in extra['sprites'].values()), 'clips', len(extra['clips']),
          'png', len(extra['png']), png_src, 'frames', len(packer.frames), '%.0fs' % (time.time() - t0), flush=True)
    extract_heroes()
    print('heroes', len(heroes), hero_src, 'frames', len(packer.frames), flush=True)
    print('controllers', len(ctrls), 'súng quái có ctrl', sum(1 for e in enemies.values() for w in e.get('weapons', []) if w.get('ctrl')),
          'quái có layer char_*', sum(1 for e in enemies.values() if any(k.startswith('L') for k in e['anims'])),
          'nhân vật có layer', sum(1 for h in heroes.values() if h.get('s0', {}).get('layers')), flush=True)
    print('bundles loaded', len(rip.loaded), 'CAB ngoài chỉ mục', rip.missing, flush=True)
    xs = clip_xform.stats
    print('transform: clip đọc %d, clip có tr %d, anim có tr %d, đường giữ %d, khoá biến thể %d, '
          'hash chưa giải %d (%d đường), clip có PPtr trước float %d'
          % (xs.clips, xs.with_tr, sum(1 for a in anims.values() if a.get('tr')), xs.tracks, xs.variants,
             len(xs.unresolved), sum(xs.unresolved.values()), xs.pptr_first), flush=True)
    if xs.unresolved:
        print('  hash chưa giải:', ' '.join(sorted(xs.unresolved)), flush=True)

    os.makedirs(ART, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    table, pages = packer.write(ART, tmp=True)
    import hashlib
    hv = hashlib.md5(b''.join(open(os.path.join(ART, p + '.tmp.png'), 'rb').read() for p in pages)).hexdigest()[:10]
    atlas = {'pages': ['art/sk/' + p for p in pages], 'v': hv, 'f': table}
    data = {'ppu': PPU, 'anims': anims, 'enemies': enemies, 'bullets': bullets, 'themes': themes,
            'heroes': heroes, 'prefabs': prefabs, 'patterns': load_patterns(), 'hud': hud,
            'sprites': {'bullets': sorted(v for v in extras.values() if v)}, 'extra': extra, 'ctrl': ctrls}
    tmp = os.path.join(DATA, 'sk-data.js.tmp')
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/build_sk.py — không sửa tay.\n')
        f.write('window.SK_ATLAS = ' + json.dumps(atlas, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('window.SK_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    for fn in os.listdir(ART):
        if fn.startswith('atlas') and fn.endswith('.png') and not fn.endswith('.tmp.png') and fn not in pages:
            os.remove(os.path.join(ART, fn))
    for fn in pages:
        os.replace(os.path.join(ART, fn + '.tmp.png'), os.path.join(ART, fn))
    os.replace(tmp, os.path.join(DATA, 'sk-data.js'))
    print('pages', pages, 'frames', len(table), 'anims', len(anims), 'bullets', len(bullets))
    for line in log:
        print('!', line)


if __name__ == '__main__':
    _lock = build_lock()
    try:
        main()
    finally:
        os.rmdir(_lock)
