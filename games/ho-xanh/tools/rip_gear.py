# -*- coding: utf-8 -*-
"""Rút mũi xiên đặc biệt và drone cứu hộ của Dave the Diver cho Hố Xanh.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_gear.py            # tất cả
    python games/ho-xanh/tools/rip_gear.py heads      # vài phần: heads vfx drone audio

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json). Chỉ import hàm của rip.py,
level.py, rip_boat.py, không sửa chúng.

Ra:
  art/gear/head/*.png          icon trong lặn (Item_*), ảnh cửa hàng (*_Thumbnail), ảnh dây hiệu ứng (Line_*)
  art/gear/drone/drone.glb     drone cứu hộ Underwater_Drone01: mỗi xương một nút, lưới cứng gắn theo xương,
                               hai clip gốc thành animation glTF
  art/fx/gear/                 ảnh hạt + gear_vfx.json (cùng dạng dive_vfx.json; js/fx.js gộp chung)
  audio/gear_*.mp3
  data/assets.js               khoá heads, drone; thêm tiếng vào khoá audio

Nguồn [DtD] (đo 2026-09-25):
  - HarpoonHeadSpecData_<Loại>_<cấp> (ScriptableObject trong bundle của ResourceManager.prefab): _Damage, _BuffIDs,
    EquipObjectReference (prefab đầu xiên), ropeEffectInfo (vật liệu + bề rộng dây khi mắc cá).
  - BuffDebuffEffect (bảng Excel trong bundle của DataManager.prefab): duration, tickinterval, buffvalue1..3,
    chancerate, buffvfxbody/head, buffvfxcolor.
  - LiftDrone.prefab: Underwater_Drone01 (7 SkinnedMeshRenderer, mỗi đỉnh chỉ một xương), Animator
    LiftDroneAnimatorController (Standby/Lift/WrapLift), hạt cánh quạt, lưới Obi (không xuất được).
  - CallDroneCommand_SO: commandDuration 2, animTrigger CallEscapePod, âm sound_Call_Drone_01.
"""
import io, json, os, shutil, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import numpy as np
from PIL import Image

import rip
_IX = rip.bundle_index()
rip.IDX, rip.CABS = _IX['path'], _IX['cab']
import level
import rip_boat as rb
from UnityPy.helpers.MeshHelper import MeshHandler

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art')
HEAD_DIR = os.path.join(ART, 'gear', 'head')
DRONE_DIR = os.path.join(ART, 'gear', 'drone')
FX_DIR = os.path.join(ART, 'fx', 'gear')
DATA = os.path.join(GAME, 'data')
PC = rip.PC
VFXP = PC + 'Common/VFX/Prefabs/'
HEADP = PC + 'Ingame/00_InGame_Common/Prefabs/InstanceItem/HarpoonHead/'
DRONE_PREFAB = PC + 'Common/Prefabs/LiftDrone.prefab'
RESOURCE_MGR = 'Assets/Contents/Singletons/ResourceManager.prefab'
DATA_MGR = 'Assets/Contents/Singletons/DataManager.prefab'
IN_ATLAS = PC + 'Ingame/00_InGame_Common/Sprites/0_SpriteAtlas/InGameAtlas_Point.spriteatlas'
COMMON_ATLAS = PC + 'Common/Sprites/0_SpriteAtlas/CommonAtlas_Point.spriteatlas'

# Tên loại trong HarpoonHeadSpecData_<Loại> -> id trong game. Mahoni (mũi xiên xanh của DLC rừng, chỉ có trong cốt truyện) bỏ.
HEADS = {'Basic': 'basic', 'Strong': 'strong', 'Paralysis': 'paralysis', 'Poison': 'poison',
         'Chain': 'chain', 'Sleep': 'sleep', 'Ice': 'ice', 'Fire': 'fire'}

# khoá hạt -> nguồn. "<prefab>#<GameObject>" là một cụm con trong prefab (toạ độ theo chính cụm đó).
VFX = {
    # hào quang trên đầu mũi xiên (con của prefab đầu xiên, lệch 0,29 m, phóng 1,3)
    'auraParalysis': HEADP + 'ElectricHarpoonHead.prefab#VFX_ElectricHarpoonHead_A_01',
    'auraPoison': HEADP + 'PoisonHarpoonHead.prefab#VFX_PoisonHarpoonHead_A_01',
    'auraSleep': HEADP + 'SleepHarpoonHead.prefab#VFX_HarpoonHead_Sleep_A_01',
    'auraChain': HEADP + 'LightningHarpoonHead.prefab#VFX_LightinigHarpoonHead_A_01',
    'auraIce': HEADP + 'IceHarpoonHead.prefab#VFX_IceHarpoonHead_A_01',
    'auraFire': HEADP + 'FireHarpoonHead.prefab#VFX_HarpoonHead_Fire_A_01',
    # hạt trúng của ba loại có prefab riêng trong Item_Effect
    'hitChain': VFXP + 'Item_Effect/VFX_HarpoonHead_Lightning_A_01.prefab',
    'hitParalysis': VFXP + 'Item_Effect/VFX_HarpoonHead_Paralysis_A_01.prefab',
    'hitPoison': VFXP + 'Item_Effect/VFX_HarpoonHead_Poison_A_01.prefab',
    # hạt bám thân / đầu cá theo buffvfxbody / buffvfxhead của BuffDebuffEffect
    'VFX_Debuff_Elec_Body_01': VFXP + 'Character_Effect/VFX_Debuff_Elec_Body_01.prefab',
    'VFX_Debuff_Poison_Body_01': VFXP + 'Character_Effect/VFX_Debuff_Poison_Body_01.prefab',
    'VFX_Debuff_Poison_Head_01': VFXP + 'Character_Effect/VFX_Debuff_Poison_Head_01.prefab',
    'VFX_Debuff_Sleep_Head_01': VFXP + 'Character_Effect/VFX_Debuff_Sleep_Head_01.prefab',
    'VFX_Debuff_Tranquilize_Body_01': VFXP + 'Character_Effect/VFX_Debuff_Tranquilize_Body_01.prefab',
    'VFX_Debuff_Freezing_Body_01': VFXP + 'Character_Effect/VFX_Debuff_Freezing_Body_01.prefab',
    'VFX_Debuff_Freezing_Broken_01': VFXP + 'Character_Effect/VFX_Debuff_Freezing_Broken_01.prefab',
    'VFX_Debuff_Burn_Body_01': VFXP + 'Character_Effect/VFX_Debuff_Burn_Body_01.prefab',
    # drone: bọt cánh quạt gắn trên xương, bọt lúc thả lưới
    'dronePropL1': DRONE_PREFAB + '#VFX_Underwater_Drone_PropellerL_A_01',
    'dronePropL2': DRONE_PREFAB + '#VFX_Underwater_Drone_PropellerL_A_02',
    'dronePropR1': DRONE_PREFAB + '#VFX_Underwater_Drone_PropellerR_A_01',
    'dronePropR2': DRONE_PREFAB + '#VFX_Underwater_Drone_PropellerR_A_02',
    'droneBubble1': DRONE_PREFAB + '#VFX_Underwater_Drone_Bubble_A_01',
    'droneBubble2': DRONE_PREFAB + '#VFX_Underwater_Drone_Bubble_A_02',
    'droneNetTrap': DRONE_PREFAB + '#VFX_Item_Nettrap_A_01',
    'droneNet': DRONE_PREFAB + '#VFX_Item_Drone_Net_A_01',
}

# khoá tiếng -> AudioClip gốc. [DtD] = SoundData/Command gốc trỏ đúng clip này;
# [ĐỀ XUẤT] = chọn theo tên tệp, vì mã gắn tiếng của đầu xiên nằm trong IL2CPP, không có trong dữ liệu.
AUDIO = {
    'gear_paralysis_shot': ('sound_harpoon_paralysis_shoot', 'sfx'),      # [ĐỀ XUẤT]
    'gear_paralysis_hit': ('sound_harpoon_paralysis_hit_01', 'sfx'),      # [ĐỀ XUẤT]
    'gear_paralysis_zap': ('sound_harpoon_paralysis_afterFX', 'sfx'),     # [DtD] SFX_SoundData "마비 지지직" (tê liệt xẹt xẹt)
    'gear_strong_shot': ('sound_harpoon_strong_shoot_01', 'sfx'),         # [ĐỀ XUẤT]
    'gear_sleep_shot': ('sound_harpoon_sleep_shoot_01', 'sfx'),           # [ĐỀ XUẤT]
    'gear_chain_shot': ('sound_harpoon_Chain_Shoot_01', 'sfx'),           # [ĐỀ XUẤT]
    'gear_chain_zap': ('sound_ElectricStrike_A_01', 'sfx'),               # [DtD] SFX_SoundData "전기 지지직" (điện xẹt)
    'gear_ice_shot': ('sound_harpoon_IceHead_01', 'sfx'),                 # [ĐỀ XUẤT]
    'gear_ice_hit': ('sound_harpoon_IceHead_hit_01', 'sfx'),              # [ĐỀ XUẤT]
    'gear_ice_freeze': ('sound_IceBuff_01', 'sfx'),                       # [DtD] SFX_SoundData sound_IceBuff_01
    'gear_ice_break': ('sound_weapon_frozenfish_hit_Buff', 'sfx'),        # [DtD] SFX_SoundData "얼린 물고기 깨트리는 소리" (đập cá đông đá)
    'gear_fire_burn': ('DR_SFX_Debuff_Underwater_Burn', 'sfx'),           # [DtD] SFX_SoundData
    'gear_fire_hit': ('harpoon_hit_rock_Fire', 'sfx'),                    # [ĐỀ XUẤT]
    'gear_poison_tick': ('DR_SFX_Debuff_Underwater_Poison', 'sfx'),       # [DtD] SFX_SoundData
    'gear_drone_call': ('sound_Call_Drone_01', 'sfx'),                    # [DtD] CallDroneCommand_SO.soundConfigID
    'gear_drone_a': ('Underwater_Drone_01A', 'sfx'),                      # [DtD] SFX_SoundData Underwater_Drone_01A
    'gear_drone_b': ('Underwater_Drone_01B', 'sfx'),                      # [DtD] SFX_SoundData Underwater_Drone_01B
}


def rel(p):
    return os.path.relpath(p, GAME).replace('\\', '/')


def rnd(v, n=4):
    return round(float(v), n) + 0.0


def mono_named(bundle_path, pred, deps=False):
    """MonoBehaviour trong bundle chứa bundle_path mà pred(typetree) đúng. deps: nạp cả bundle phụ thuộc
    (vật liệu dây của đầu xiên nằm ở bundle khác)."""
    env = level.load_with_deps(bundle_path)[0] if deps else rip.env_of(rip.IDX[bundle_path])
    out = []
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            tt = o.read_typetree()
        except Exception:
            continue
        if pred(tt):
            out.append((o, tt))
    return out


def hex_rgba(s):
    s = (s or '').lstrip('#')
    if len(s) != 8:
        return None
    return [rnd(int(s[i:i + 2], 16) / 255, 3) for i in (0, 2, 4, 6)]


# ---------------------------------------------------------------- MŨI XIÊN
def rip_heads():
    buffs = {}
    for o, tt in mono_named(DATA_MGR, lambda t: t.get('m_Name') == 'BuffDebuffEffect'):
        for r in tt['dataArray']:
            buffs[r['tid']] = r
    if not buffs:
        raise SystemExit('không thấy bảng BuffDebuffEffect')
    specs = {}
    for o, tt in mono_named(RESOURCE_MGR, lambda t: str(t.get('m_Name', '')).startswith('HarpoonHeadSpecData_'), deps=True):
        kind, lv = tt['m_Name'][len('HarpoonHeadSpecData_'):].rsplit('_', 1)
        if kind in HEADS:
            specs.setdefault(kind, {})[int(lv)] = (o, tt)
    missing = [k for k in HEADS if k not in specs]
    if missing:
        raise SystemExit('thiếu HarpoonHeadSpecData: %s' % missing)
    eqs = rb.load_sheet('DR_GameData_Equipment.json')
    items = {e['TID']: e for e in eqs['EquipmentItem']}
    gm = rb.guid_map()
    shutil.rmtree(HEAD_DIR, ignore_errors=True)
    need_in, need_thumb = set(), set()
    for kind, lvs in specs.items():
        it = items[lvs[1][1]['_TID']]
        need_in.add(it['ItemIcon'])
        need_thumb.add(it['ItemUIIcon'])
    icons = {}
    for n, s in sorted(rb.atlas_sprites(IN_ATLAS, need_in).items()):
        img, _ = rb.sprite_canvas(s)
        icons[n] = rb.save(img, os.path.join(HEAD_DIR, n + '.png'))
    for n, s in sorted(rb.atlas_sprites(COMMON_ATLAS, need_thumb).items()):
        img, _ = rb.sprite_canvas(s)
        icons[n] = rb.save(img, os.path.join(HEAD_DIR, n + '.png'))
    out = {}
    for kind, gid in HEADS.items():
        lvs = specs[kind]
        o1, t1 = lvs[1]
        it = items[t1['_TID']]
        prefab = gm.get(t1['EquipObjectReference']['m_AssetGUID'], [None])[0]
        # dây khi mắc cá: vật liệu + bề rộng (ropeEffectInfo); Basic là dây đen 0,02 m
        rope = None
        try:
            m = o1.read().ropeEffectInfo.lineMaterial.read()
            sp = m.m_SavedProperties
            tex = {n: e.m_Texture for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID}
            cols = {n: c for n, c in sp.m_Colors}
            shader = m.m_Shader.read().m_ParsedForm.m_Name
            rope = {'material': m.m_Name, 'shader': shader, 'width': rnd(t1['ropeEffectInfo']['lineWidth'], 3),
                    'tile': t1['ropeEffectInfo']['textureMode'] == 1}
            if '_MainTex' in tex:
                t = tex['_MainTex'].read()
                rope['img'] = rb.save(t.image.convert('RGBA'), os.path.join(HEAD_DIR, t.m_Name + '.png'))
            c = cols.get('_TintColor') or cols.get('_DiffuseBright') or cols.get('_Color')
            if c is not None:
                rope['color'] = [rnd(c.r, 3), rnd(c.g, 3), rnd(c.b, 3), rnd(c.a, 3)]
            rope['blend'] = 'add' if 'Additive' in shader else 'alpha'
        except Exception as e:
            print('  dây của %s: %s' % (kind, e))
        # hào quang: cụm VFX_* con của prefab đầu xiên (toạ độ theo gốc prefab = pivot của sprite HarpoonProjectile)
        aura = None
        if prefab:
            henv = level.load_with_deps(prefab)[0]
            hroot = level.prefab_root(henv, prefab)
            for ch in level.transform_of(hroot).m_Children:
                cg = ch.read().m_GameObject.read()
                if cg.m_Name.startswith('VFX_'):
                    ct = ch.read()
                    key = [k for k, v in VFX.items() if v.endswith('#' + cg.m_Name)]
                    aura = {'key': key[0] if key else None, 'pos': [rnd(ct.m_LocalPosition.x, 3), rnd(ct.m_LocalPosition.y, 3)],
                            'scale': rnd(ct.m_LocalScale.x, 3)}
        levels = []
        for lv in sorted(lvs):
            o, tt = lvs[lv]
            row = {'lv': lv, 'tid': tt['_TID'], 'dmg': tt['_Damage'], 'buff': None}
            if tt['_BuffIDs']:
                b = buffs[tt['_BuffIDs'][0]]
                row['buff'] = {'tid': b['tid'], 'name': b['suid'], 'type': b['bufftype'], 'element': b['eelement'],
                               'duration': rnd(b['duration'], 3), 'tick': rnd(b['tickinterval'], 3),
                               'v': [rnd(b['buffvalue1'], 3), rnd(b['buffvalue2'], 3), rnd(b['buffvalue3'], 3)],
                               'chance': rnd(b['chancerate'], 3), 'vfxBody': b['buffvfxbody'] or None,
                               'vfxHead': b['buffvfxhead'] or None, 'tint': hex_rgba(b['buffvfxcolor'])}
            levels.append(row)
        out[gid] = {'kind': kind, 'nameKey': it['ItemTextID'], 'headType': t1['m_HarpoonHeadType'], 'qte': t1['m_QTEType'],
                    'prefab': prefab.replace(PC, '') if prefab else None,
                    'icon': icons.get(it['ItemIcon']), 'thumb': icons.get(it['ItemUIIcon']),
                    'rope': rope, 'aura': aura, 'levels': levels}
        print('  đầu xiên %-9s %d cấp, sát thương %s, buff %s' % (gid, len(levels), [l['dmg'] for l in levels],
                                                                 levels[0]['buff'] and levels[0]['buff']['name']))
    return out


# ---------------------------------------------------------------- HẠT
def find_child(go, name):
    stack = [go]
    while stack:
        g = stack.pop()
        if g.m_Name == name:
            return g
        stack.extend(ch.read().m_GameObject.read() for ch in level.transform_of(g).m_Children)
    return None


def rip_vfx():
    shutil.rmtree(FX_DIR, ignore_errors=True)
    os.makedirs(FX_DIR)
    rb.FXDIR, rb.FXTC = FX_DIR, {}
    envs, out = {}, {}
    for key, src in VFX.items():
        path, _, child = src.partition('#')
        if path not in envs:
            envs.clear()   # mỗi prefab nạp cả chục bundle phụ thuộc: giữ nhiều bộ cùng lúc là MemoryError
            import gc
            gc.collect()
            envs[path] = level.load_with_deps(path)[0]
        root = level.prefab_root(envs[path], path)
        node = find_child(root, child) if child else root
        if node is None:
            raise SystemExit('không thấy %s trong %s' % (child, path))
        cache = {}
        t = level.transform_of(node)
        W = level.world(t, cache)
        relm = np.linalg.inv(W) if abs(np.linalg.det(W[:3, :3])) > 1e-9 else np.eye(4)
        if abs(np.linalg.det(W[:3, :3])) <= 1e-9:
            relm[:3, 3] = -W[:3, 3]
        r = rb.recipe_more(node, relm, rb.world_quat(t), cache, src=src.replace(PC, ''))
        for e in r['emitters']:
            if e.get('img'):
                e['img'] = 'art/fx/gear/' + os.path.basename(e['img'])
        # cụm tắt sẵn trong prefab (lưới drone) được script bật lúc chạy: tính là bật
        if not node.m_IsActive:
            for e in r['emitters']:
                e['on'] = True
        out[key] = r
        print('  hạt %-32s %2d emitter' % (key, len(r['emitters'])))
    with open(os.path.join(FX_DIR, 'gear_vfx.json'), 'w', encoding='utf-8', newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


# ---------------------------------------------------------------- DRONE
FLIP = np.diag([1.0, 1.0, -1.0, 1.0])


class DroneGlb(level.Glb):
    """Glb có cây nút và animation: level.Glb chỉ ghi nút phẳng đã nướng tư thế."""

    def __init__(self):
        super().__init__()
        self.tree = []   # nút glTF: {'name', 'children', trs, 'mesh'}
        self.anims = []

    def write(self, path):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'ho-xanh/tools/rip_gear.py'},
            'scene': 0, 'scenes': [{'nodes': [0]}],
            'nodes': self.tree, 'meshes': self.meshes, 'materials': self.materials,
            'textures': self.textures, 'images': self.images,
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                         {'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
            'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}],
            'animations': self.anims,
        }
        js = json.dumps(gltf, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)


def unity_trs(t):
    """Transform Unity -> (t, q, s) glTF (lật trục z: vị trí z đổi dấu, quaternion đổi dấu x và y)."""
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    return [rnd(p.x, 5), rnd(p.y, 5), rnd(-p.z, 5)], [rnd(-q.x, 6), rnd(-q.y, 6), rnd(q.z, 6), rnd(q.w, 6)], \
        [rnd(s.x, 5), rnd(s.y, 5), rnd(s.z, 5)]


def rip_drone():
    shutil.rmtree(DRONE_DIR, ignore_errors=True)
    os.makedirs(DRONE_DIR)
    env, _ = level.load_with_deps(DRONE_PREFAB)
    root = level.prefab_root(env, DRONE_PREFAB)
    anim_go = [c.read().m_GameObject.read() for c in level.transform_of(root).m_Children if c.read().m_GameObject.read().m_Name == 'Underwater_Drone01'][0]
    kids = {c.read().m_GameObject.read().m_Name: c.read().m_GameObject.read() for c in level.transform_of(anim_go).m_Children}
    bone_root, day = kids['Root'], kids['Underwater_Drone01']
    g = DroneGlb()
    node_of, path_of = {}, {}
    attach = []

    def add(go, path):
        t = level.transform_of(go)
        tr, q, s = unity_trs(t)
        i = len(g.tree)
        g.tree.append({'name': go.m_Name, 'translation': tr, 'rotation': q, 'scale': s, 'children': []})
        node_of[go.m_Name] = i
        path_of[path] = i
        for ch in t.m_Children:
            c = ch.read().m_GameObject.read()
            if c.m_Name.startswith('VFX_'):
                # hạt cánh quạt / bọt: ghi chỗ gắn (xương + độ lệch trong hệ xương, đã lật z)
                ct = level.transform_of(c)
                ctr, cq, cs = unity_trs(ct)
                attach.append({'name': c.m_Name, 'bone': go.m_Name, 'pos': ctr, 'rot': cq, 'scale': cs[0]})
                continue
            g.tree[i]['children'].append(add(c, path + '/' + c.m_Name))
        return i

    # nút 0 = Underwater_Drone01 (chủ Animator), đường dẫn clip tính từ đây
    top_t = level.transform_of(anim_go)
    tr, q, s = unity_trs(top_t)
    g.tree.append({'name': 'Underwater_Drone01', 'translation': tr, 'rotation': q, 'scale': s, 'children': []})
    path_of[''] = 0
    g.tree[0]['children'].append(add(bone_root, 'Root'))

    # lưới: mỗi đỉnh gắn đúng một xương (BlendIndices 1 chiều, không có BlendWeight) -> tách theo xương,
    # đưa đỉnh về hệ xương bằng bindpose, gắn làm con của nút xương
    parts = 0
    mats_seen = {}
    for c in level.transform_of(day).m_Children:
        go = c.read().m_GameObject.read()
        smr = rb.comp(go, 'SkinnedMeshRenderer')
        if smr is None:
            continue
        r = smr.read()
        if not r.m_Enabled or not r.m_Mesh.m_PathID:
            continue
        me = r.m_Mesh.read()
        h = MeshHandler(me)
        h.process()
        n = h.m_VertexCount
        pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
        nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] if h.m_Normals else None
        uv = np.array(h.m_UV0, dtype=np.float32).reshape(n, -1)[:, :2].copy() if h.m_UV0 else None
        if uv is not None:
            uv[:, 1] = 1 - uv[:, 1]
        bi = np.array(h.m_BoneIndices).reshape(n, -1)[:, 0].astype(int)
        binds = [level.mat4(b) for b in me.m_BindPose]
        bones = [b.read().m_GameObject.read().m_Name for b in r.m_Bones]
        mats = [g.material(x.read(), 'drone') for x in r.m_Materials if x.m_PathID]
        for mi, x in enumerate(r.m_Materials):
            if x.m_PathID:
                mats_seen[x.read().m_Name] = 1
        tris_all = h.get_triangles()
        for b in sorted(set(bi.tolist())):
            vid = np.nonzero(bi == b)[0]
            remap = -np.ones(n, dtype=np.int64)
            remap[vid] = np.arange(len(vid))
            B = binds[b]
            P = (B @ np.c_[pos[vid], np.ones(len(vid))].T).T[:, :3] * np.array([1, 1, -1])
            Nn = None
            if nrm is not None:
                Nn = (B[:3, :3] @ nrm[vid].T).T
                Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
                Nn = Nn * np.array([1, 1, -1])
            attrs = g.prim_attrs(P, Nn, uv[vid] if uv is not None else None)
            prims = []
            for si, tris in enumerate(tris_all):
                if si >= len(mats):
                    continue
                t = np.array(tris, dtype=np.int64).reshape(-1, 3)
                keep = (remap[t] >= 0).all(axis=1)
                if not keep.any():
                    continue
                idx = remap[t[keep]][:, ::-1].reshape(-1).astype(np.uint32)
                prims.append({'attributes': attrs, 'indices': g.accessor(idx, 5125, 'SCALAR', 34963), 'material': mats[si]})
            if not prims:
                continue
            g.meshes.append({'name': '%s@%s' % (me.m_Name, bones[b]), 'primitives': prims})
            mi = len(g.tree)
            g.tree.append({'name': '%s@%s' % (go.m_Name, bones[b]), 'mesh': len(g.meshes) - 1})
            g.tree[node_of[bones[b]]]['children'].append(mi)
            parts += 1
    for nd in g.tree:
        if 'children' in nd and not nd['children']:
            del nd['children']

    # hai clip gốc -> animation glTF (lấy mẫu 30 khung/giây, nội suy thẳng)
    animc = rb.comp(anim_go, 'Animator')
    ctrl_name, clips = rb.controller_clips(animc)
    paths = rb.path_names(anim_go)
    clip_info = {}
    for co in clips:
        d = rb.decode_clip(co, paths)
        chans, samps = [], []
        fps = d.get('fps', 30)
        for path, tr in sorted(d.get('tracks', {}).items()):
            ni = path_of.get(path)
            if ni is None:
                continue
            for key, gpath, conv in (('pos', 'translation', lambda v: [v[0], v[1], -v[2]]),
                                     ('quat', 'rotation', lambda v: [-v[0], -v[1], v[2], v[3]]),
                                     ('scale', 'scale', lambda v: v)):
                vals = tr.get(key)
                if not vals:
                    continue
                if len(vals) == 1:
                    times = [0.0, d['length']]
                    vals = [vals[0], vals[0]]
                else:
                    times = [min(d['length'], i / fps) for i in range(len(vals))]
                tin = g.accessor(np.array(times, dtype=np.float32).reshape(-1, 1), 5126, 'SCALAR', None, True)
                arr = np.array([conv(v) for v in vals], dtype=np.float32)
                if key == 'quat':
                    arr /= np.maximum(np.linalg.norm(arr, axis=1, keepdims=True), 1e-9)
                tout = g.accessor(arr, 5126, 'VEC4' if key == 'quat' else 'VEC3', None)
                samps.append({'input': tin, 'output': tout, 'interpolation': 'LINEAR'})
                chans.append({'sampler': len(samps) - 1, 'target': {'node': ni, 'path': gpath}})
        g.anims.append({'name': d['name'], 'channels': chans, 'samplers': samps})
        clip_info[d['name']] = {'length': d['length'], 'loop': d['loop']}
    # accessor 'SCALAR' dùng cho thời gian cần min/max (glTF bắt buộc); accessor() đã ghi
    path = os.path.join(DRONE_DIR, 'drone.glb')
    g.write(path)
    # cỡ thân (m) để đặt cá dưới bụng drone
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    for a in g.accessors:
        if a.get('type') == 'VEC3' and 'min' in a and len(a['min']) == 3:
            lo = np.minimum(lo, a['min']); hi = np.maximum(hi, a['max'])
    dock = find_child(anim_go, 'DockingDummy')
    dock_pos = unity_trs(level.transform_of(dock))[0] if dock else None
    icon = None
    try:
        s = rb.atlas_sprites(PC + 'Phone/Phone_Common/Sprites/0_SpriteAtlas/PhoneAtlas_Bilinear.spriteatlas', {'iDiver_Icon_Drone'})
        img, _ = rb.sprite_canvas(s['iDiver_Icon_Drone'])
        icon = rb.save(img, os.path.join(DRONE_DIR, 'iDiver_Icon_Drone.png'))
    except Exception as e:
        print('  thiếu icon drone', e)
    info = {'glb': rel(path), 'controller': ctrl_name, 'clips': clip_info, 'attach': attach,
            'dock': {'bone': 'Bone_DroneBody', 'pos': dock_pos}, 'bounds': [[rnd(v, 3) for v in lo], [rnd(v, 3) for v in hi]],
            'materials': sorted(mats_seen), 'icon': icon,
            'command': {'duration': 2.0, 'anim': 'CallEscapePod', 'failAnim': 'Overloaded', 'sound': 'sound_Call_Drone_01'}}
    print('  drone: %d mảnh lưới, %d clip %s, %d chỗ gắn hạt, cỡ %s KB' % (parts, len(clip_info), sorted(clip_info),
                                                                         len(attach), os.path.getsize(path) // 1024))
    return info


# ---------------------------------------------------------------- MAIN
def main():
    parts = sys.argv[1:] or ['heads', 'vfx', 'drone', 'audio']
    man_p = os.path.join(DATA, 'assets.js')
    src = io.open(man_p, encoding='utf-8').read()
    man = json.loads(src.split('=', 1)[1].rstrip().rstrip(';'))
    if 'heads' in parts:
        print('Mũi xiên…')
        man['heads'] = rip_heads()
    if 'vfx' in parts:
        print('Hạt…')
        rip_vfx()
    if 'drone' in parts:
        print('Drone…')
        man['drone'] = rip_drone()
    if 'audio' in parts:
        print('Tiếng…')
        rip.AUDIO = AUDIO
        man['audio'] = dict(man.get('audio', {}), **rip.rip_audio())
    with open(man_p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/rip.py — đừng sửa tay.\nwindow.HX_ASSETS = ')
        json.dump(man, fh, ensure_ascii=False, indent=1)
        fh.write(';\n')
    print('xong ->', man_p)


if __name__ == '__main__':
    main()
