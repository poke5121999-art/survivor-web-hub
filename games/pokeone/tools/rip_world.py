# -*- coding: utf-8 -*-
"""Hằng số thế giới ngoài trời của PokéOne (nhân vật, máy ảnh, ánh sáng, hiệu ứng hạt, cửa, emote).

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_world.py

Ra:
  data/world.js          P1.WORLD, mỗi lá có `src` (tệp, đường dẫn GameObject, component, trường)
  art/fx/<ảnh>.png       ảnh bóng đổ + ảnh hạt còn thiếu (ảnh đã có thì không ghi lại)

Khung toạ độ: số thô giữ nguyên khung Unity (độ, đơn vị Unity). Mục `three` đổi sang khung three.js của bản web:
  - Hình học trong prefab (glb) đảo x (rip_map_core.FLIP).
  - Game gốc đặt prop xoay 180° quanh y (NPCPrefab/Door Horiz, TreeCut, PokeBall... đều quay (0,1,0,0)), máy ảnh ở
    -z Unity nhìn về +z. Bản web đặt prop không xoay, máy ảnh ở +z nhìn về -z.
  - Ghép hai điều trên: vị trí/hướng trong KHÔNG GIAN THẾ GIỚI (máy ảnh, đèn, khung sprite) đổi bằng soi gương z:
    (x, y, z) -> (x, y, -z); quaternion (x, y, z, w) -> (-x, -y, z, w).
"""
import json, math, os, struct, sys

import numpy as np

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rip_map_core as core
import ttg

GAME = os.path.dirname(HERE)
FX_DIR = os.path.join(GAME, 'art', 'fx')
DATA_JS = os.path.join(GAME, 'data', 'world.js')
L2, S2 = 'level2', 'sharedassets2.assets'
SAMPLES = (0.0, 0.25, 0.5, 0.75, 1.0)


# ---------------------------------------------------------------- số và toạ độ
def r4(x):
    x = float(x)
    return 0.0 if abs(x) < 5e-7 else round(x, 4)


def v3(v):
    return [r4(v.x), r4(v.y), r4(v.z)] if not isinstance(v, dict) else [r4(v['x']), r4(v['y']), r4(v['z'])]


def q4(q):
    return [r4(q.x), r4(q.y), r4(q.z), r4(q.w)]


def rgba(c):
    if isinstance(c, dict):
        return [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]
    return [r4(c.r), r4(c.g), r4(c.b), r4(c.a)]


def quat_m(q):
    n = math.sqrt(sum(float(c) * float(c) for c in q)) or 1.0
    x, y, z, w = (float(c) / n for c in q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def euler_unity(q):
    """Góc Euler kiểu Unity (độ; R = Ry·Rx·Rz), như ô Rotation của Inspector."""
    m = quat_m(q)
    x = math.degrees(math.asin(max(-1.0, min(1.0, -m[1, 2]))))
    if abs(m[1, 2]) < 0.9999999:
        y = math.degrees(math.atan2(m[0, 2], m[2, 2]))
        z = math.degrees(math.atan2(m[1, 0], m[1, 1]))
    else:
        y, z = math.degrees(math.atan2(-m[2, 0], m[0, 0])), 0.0
    return [r4(x), r4(y), r4(z)]


def euler_three(q):
    """Góc Euler thứ tự 'XYZ' của three.js (độ) cho quaternion khung three."""
    m = quat_m(q)
    y = math.asin(max(-1.0, min(1.0, m[0, 2])))
    if abs(m[0, 2]) < 0.9999999:
        x = math.atan2(-m[1, 2], m[2, 2])
        z = math.atan2(-m[0, 1], m[0, 0])
    else:
        x = math.atan2(m[2, 1], m[1, 1])
        z = 0.0
    return [r4(math.degrees(x)), r4(math.degrees(y)), r4(math.degrees(z))]


def pos3(p):
    return [p[0], p[1], r4(-p[2])]


def quat3(q):
    return [r4(-q[0]), r4(-q[1]), q[2], q[3]]


def forward_unity(q):
    return [r4(v) for v in quat_m(q) @ np.array([0, 0, 1.0])]


def three_of(pos=None, quat=None, dirv=None):
    out = {}
    if pos is not None:
        out['pos'] = pos3(pos)
    if quat is not None:
        out['quat'] = quat3(quat)
        out['euler'] = euler_three(quat3(quat))
    if dirv is not None:
        out['dir'] = pos3(dirv)
    return out


# ---------------------------------------------------------------- đọc Unity
class Src:
    """Nạp tệp gốc một lần; tra GameObject theo đường dẫn."""

    def __init__(self):
        self.env = ttg.load_core()
        self.F = ttg.files(self.env)

    def obj(self, fname, pid):
        return self.F[fname].objects[pid]

    def path_of(self, go):
        names = [go.m_Name]
        t = core.transform_of(go)
        while t is not None and t.m_Father.m_PathID:
            t = t.m_Father.read()
            names.append(t.m_GameObject.read().m_Name)
        return '/'.join(reversed(names))

    def go_by_path(self, fname, path):
        for o in self.F[fname].objects.values():
            if o.type.name == 'GameObject' and o.peek_name() == path.split('/')[-1]:
                g = o.read()
                if self.path_of(g) == path:
                    return g
        raise KeyError('GameObject not found: %s in %s' % (path, fname))

    def comps(self, go):
        out = {}
        for c in go.m_Component:
            out.setdefault(c.component.type.name, []).append(c.component)
        return out

    def mb(self, go, cls):
        for c in go.m_Component:
            if c.component.type.name == 'MonoBehaviour':
                o = c.component.deref()
                s = ttg.script_of(self.env, o)
                if s and s[1] == cls:
                    return ttg.read_mb(self.env, o)[1], o
        raise KeyError('%s not found on %s' % (cls, go.m_Name))


def read_mb_dropping(env, o, drop):
    """Typetree sinh từ DummyDll có cả trường Unity không lưu (mảng nhiều chiều int[,] ra 'int'): bỏ trước khi đọc."""
    asm, full = ttg.script_of(env, o)
    root = ttg.gen().get_nodes_up(asm, full)
    keep = root.m_Children
    root.m_Children = [c for c in keep if c.m_Name not in drop]
    try:
        return o.read_typetree(root)
    finally:
        root.m_Children = keep


def local_trs(go):
    t = core.transform_of(go)
    return {'pos': v3(t.m_LocalPosition), 'quat': q4(t.m_LocalRotation), 'euler': euler_unity(q4(t.m_LocalRotation)),
            'scale': v3(t.m_LocalScale), 'active': bool(go.m_IsActive)}


def world_m(go):
    t = core.transform_of(go)
    m = core.trs(t)
    while t.m_Father.m_PathID:
        t = t.m_Father.read()
        m = core.trs(t) @ m
    return m


# ---------------------------------------------------------------- đường cong, dải màu
def eval_curve(keys, t):
    """AnimationCurve Unity (Hermite không trọng số). Tiếp tuyến vô hạn = bậc thang."""
    if not keys:
        return None
    if t <= keys[0]['time']:
        return keys[0]['value']
    if t >= keys[-1]['time']:
        return keys[-1]['value']
    for a, b in zip(keys, keys[1:]):
        if a['time'] <= t <= b['time']:
            dt = b['time'] - a['time']
            if dt <= 0:
                return b['value']
            if not (math.isfinite(a['outSlope']) and math.isfinite(b['inSlope'])):
                return a['value']
            s = (t - a['time']) / dt
            h00, h10 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s
            h01, h11 = -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
            return h00 * a['value'] + h10 * dt * a['outSlope'] + h01 * b['value'] + h11 * dt * b['inSlope']


def samples(keys, mul=1.0):
    return [r4(eval_curve(keys, t) * mul) for t in SAMPLES]


def minmax_curve(mm, mul=1.0):
    """MinMaxCurve -> {mode, ...}. Đường cong lấy mẫu ở t = 0, .25, .5, .75, 1: với start* (startSize...) t là thời điểm
    trong chu kỳ phát (chia duration), với *OverLifetime t là tuổi hạt (chia startLifetime)."""
    st = mm['minMaxState']
    if st == 0:
        return {'mode': 'constant', 'value': r4(mm['scalar'] * mul)}
    if st == 3:
        return {'mode': 'twoConstants', 'min': r4(mm['minScalar'] * mul), 'max': r4(mm['scalar'] * mul)}
    mx = mm['maxCurve']['m_Curve']
    if st == 1:
        return {'mode': 'curve', 'at': list(SAMPLES), 'value': samples(mx, mm['scalar'] * mul)}
    return {'mode': 'twoCurves', 'at': list(SAMPLES), 'min': samples(mm['minCurve']['m_Curve'], mm['scalar'] * mul),
            'max': samples(mx, mm['scalar'] * mul)}


def eval_gradient(g, t):
    nc, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    ck = [(g['ctime%d' % i] / 65535.0, g['key%d' % i]) for i in range(nc)]
    ak = [(g['atime%d' % i] / 65535.0, g['key%d' % i]['a']) for i in range(na)]
    fixed = g.get('m_Mode', 0) == 1

    def lerp(keys, get):
        if t <= keys[0][0]:
            return get(keys[0][1])
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                if fixed:
                    return get(b)
                s = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                return get(a) + (get(b) - get(a)) * s
        return get(keys[-1][1])
    rgb = [lerp(ck, lambda c, k=k: c[k]) for k in 'rgb']
    return [r4(x) for x in rgb] + [r4(lerp(ak, lambda a: a))]


def gradient(g):
    return {'at': list(SAMPLES), 'rgba': [eval_gradient(g, t) for t in SAMPLES]}


def minmax_gradient(mg):
    st = mg['minMaxState']
    if st == 0:
        return {'mode': 'color', 'rgba': rgba(mg['maxColor'])}
    if st == 2:
        return {'mode': 'twoColors', 'min': rgba(mg['minColor']), 'max': rgba(mg['maxColor'])}
    if st == 1:
        return dict(mode='gradient', **gradient(mg['maxGradient']))
    if st == 3:
        return {'mode': 'twoGradients', 'min': gradient(mg['minGradient']), 'max': gradient(mg['maxGradient'])}
    return dict(mode='randomColor', **gradient(mg['maxGradient']))


# ---------------------------------------------------------------- ảnh
_written = []


def export_png(tex_ptr, name=None):
    """Ghi art/fx/<tên>.png nếu chưa có (ảnh đã có thì giữ nguyên). Trả đường dẫn tương đối games/pokeone/."""
    t = tex_ptr.read()
    fn = (name or t.m_Name) + '.png'
    path = os.path.join(FX_DIR, fn)
    if not os.path.exists(path):
        os.makedirs(FX_DIR, exist_ok=True)
        t.image.save(path, optimize=True)
        _written.append(fn)
    return 'art/fx/' + fn


def material_info(mat_ptr, export=True):
    m = mat_ptr.read()
    sp = m.m_SavedProperties
    out = {'name': m.m_Name, 'shader': core._shader_name(m)}
    for n, e in sp.m_TexEnvs:
        if n == '_MainTex' and e.m_Texture.m_PathID:
            t = e.m_Texture.read()
            out['texture'] = t.m_Name
            out['texSize'] = [t.m_Width, t.m_Height]
            if export:
                out['img'] = export_png(e.m_Texture)
            if (e.m_Scale.x, e.m_Scale.y, e.m_Offset.x, e.m_Offset.y) != (1, 1, 0, 0):
                out['tiling'] = [r4(e.m_Scale.x), r4(e.m_Scale.y), r4(e.m_Offset.x), r4(e.m_Offset.y)]
    C = {n: c for n, c in sp.m_Colors}
    for k in ('_Color', '_TintColor'):
        if k in C:
            out[k[1:].lower()] = rgba(C[k])
    Fl = {n: float(v) for n, v in sp.m_Floats}
    if '_Mode' in Fl and out['shader'].startswith('Standard'):
        out['mode'] = {0: 'opaque', 1: 'cutout', 2: 'fade', 3: 'transparent'}.get(int(Fl['_Mode']))
    if '_SrcBlend' in Fl and '_DstBlend' in Fl and 'Standard' in out['shader']:
        out['blend'] = [int(Fl['_SrcBlend']), int(Fl['_DstBlend'])]
    if '_Cutoff' in Fl:
        out['cutoff'] = r4(Fl['_Cutoff'])
    return out


# ---------------------------------------------------------------- 1. nhân vật
def character(S):
    player = S.go_by_path(L2, 'Player Handler/Player Character')
    ch, _ = S.mb(player, 'CharacterHandler')
    npc_go = S.go_by_path(S2, 'NPCPrefab')
    npc, _ = S.mb(npc_go, 'CharacterHandler')
    net_go = S.go_by_path(S2, 'Network Player')
    net, _ = S.mb(net_go, 'CharacterHandler')
    so = S.go_by_path(L2, 'Player Handler/Player Character/Sprite Offset')
    body = S.go_by_path(L2, 'Player Handler/Player Character/Sprite Offset/Quad - Body')
    shadow = S.go_by_path(L2, 'Player Handler/Player Character/Sprite Offset/Quad - Shadow')
    bc, sc = S.comps(body), S.comps(shadow)
    body_mat = material_info(bc['MeshRenderer'][0].read().m_Materials[0], export=False)
    shadow_mat = material_info(sc['MeshRenderer'][0].read().m_Materials[0])
    mesh = bc['MeshFilter'][0].read().m_Mesh
    so_t, body_t, sh_t = local_trs(so), local_trs(body), local_trs(shadow)
    # Tâm quad và mép dưới trong khung gốc nhân vật (nhân ma trận cha).
    mw = np.linalg.inv(world_m(player)) @ world_m(body)
    centre = mw[:3, 3]
    down = mw[:3, :3] @ np.array([0, -0.5, 0])
    shw = (np.linalg.inv(world_m(player)) @ world_m(shadow))[:3, 3]
    grounded = []
    for ch_t in core.transform_of(npc_go).m_Children:
        g = ch_t.read().m_GameObject.read()
        lt = local_trs(g)
        if abs(lt['pos'][1] + 0.6) < 1e-3:
            grounded.append(g.m_Name)
    src_p = 'level2 Player Handler/Player Character'
    fields = {k: ch[k] for k in ('MoveSpeed', 'LineOfSight', 'CheckForLOS', 'Steps', 'CurrentDirection', 'SpriteNumber')}
    return {
        'moveSpeed': {'value': r4(ch['MoveSpeed']), 'unit': 'ô/giây (đơn vị Unity/giây)',
                      'src': src_p + ' CharacterHandler.MoveSpeed (NPCPrefab và Network Player cũng 3.25)',
                      'npc': r4(npc['MoveSpeed']), 'network': r4(net['MoveSpeed'])},
        'animationSpeed': {'value': None, 'src': 'CharacterHandler.AnimationSpeed (private, offset 0xAC)',
                           'note': 'private, không serialize; mã GameAssembly.dll bị Themida mã hoá (.ctor 0x1AA6B0 toàn byte rác), không đọc được hằng'},
        'jumpSpeed': {'value': None, 'src': 'CharacterHandler.JumpSpeed (private, offset 0x10C)',
                      'note': 'private, không serialize; mã bị mã hoá như trên'},
        'lineOfSight': {'value': ch['LineOfSight'], 'npc': npc['LineOfSight'], 'checkForLOS': bool(npc['CheckForLOS']),
                        'src': 'CharacterHandler.LineOfSight trên Player Character (level2) và NPCPrefab (sharedassets2)',
                        'note': 'mặc định 0; tầm nhìn thật của trainer do server gửi (NPCSettingStruct.LOS, SightAction)'},
        'defaults': {'player': fields, 'npc': {k: npc[k] for k in fields}, 'src': src_p + ' / sharedassets2 NPCPrefab, CharacterHandler'},
        'rig': {
            'spriteOffset': dict(so_t, three=three_of(so_t['pos'], so_t['quat']),
                                 src=src_p + '/Sprite Offset Transform (NPCPrefab, Network Player giống hệt)'),
            'body': dict(body_t, mesh='Quad (built-in 1x1, pid 10210) x scale -> %gx%g đơn vị' % (body_t['scale'][0], body_t['scale'][1]),
                         material=body_mat, three=three_of(body_t['pos'], body_t['quat']),
                         src=src_p + '/Sprite Offset/Quad - Body MeshFilter+MeshRenderer'),
            'shadow': shadow_block(shadow, sh_t, shadow_mat, src_p),
            'quadSize': [r4(body_t['scale'][0]), r4(body_t['scale'][1])],
            'pxPerUnit': 32,
            'pxPerUnitNote': '[SUY RA] ô sprite 64 px (sdata 256x256, lưới 4x4) phủ cả quad 2x2 đơn vị -> 32 px/đơn vị, khớp ô nền 32 px. '
                             'UV từng ô do SetSpritePosition gán lúc chạy (mã mã hoá), không đo được.',
            'tiltDeg': so_t['euler'][0],
            'tiltNote': 'Sprite Offset xoay +%.1f° quanh x (Unity): mặt quad ngả về phía máy ảnh (-z Unity). Máy ảnh nghiêng 45°, nên sprite không vuông góc tia nhìn.' % so_t['euler'][0],
            'quadCentre': [r4(v) for v in centre], 'quadCentreThree': pos3([r4(v) for v in centre]),
            'quadBottom': [r4(v) for v in centre + down], 'quadBottomThree': pos3([r4(v) for v in centre + down]),
            'shadowCentre': [r4(v) for v in shw], 'shadowCentreThree': pos3([r4(v) for v in shw]),
            'src': 'tính từ ma trận Transform: gốc nhân vật -> Quad - Body/Quad - Shadow (khung gốc nhân vật)',
        },
        'groundY': {'value': -0.6, 'src': 'sharedassets2 NPCPrefab: con %s đặt ở y = -0.6 so với gốc nhân vật' % ', '.join(sorted(grounded)),
                    'note': '[SUY RA] mặt đất ô = gốc nhân vật - 0.6; bóng đổ nằm ~0.11 trên mặt đất'},
        'propYaw180': {'value': True,
                       'src': 'sharedassets2 NPCPrefab: Door_3, Door Horiz, TreeCut, PokeBall, Rock_Break, Fire_Lamp... Transform quay (0,1,0,~0) = 180° quanh y',
                       'note': 'prop gắn vào nhân vật (cửa, cây chặt được...) xoay 180°; TreeCut scale 0.06024 = 1/16.6 (nhóm prefab cũ). '
                               'Nhà gốc có mặt tiền pháp tuyến +z (đo diện tích pháp tuyến ext_house_pallettown_1: +z 25.6, -z 4.9), máy ảnh ở -z: [SUY RA] map gốc đặt prop với ry = 180.'},
        'meshRef': {'mesh': 'Quad', 'pathID': mesh.m_PathID, 'src': 'unity default resources'},
    }


def shadow_block(go, t, mat, src_p):
    return dict(t, mesh='Quad (built-in) scale %gx%g' % (t['scale'][0], t['scale'][1]), material=mat,
                three=three_of(t['pos'], t['quat']),
                note='cộng góc cha %.1f° + %.1f° = %.1f° quanh x: gần nằm phẳng; CharacterHandler.Shadow trỏ GameObject này' % (
                    euler_unity(q4(core.transform_of(go).m_Father.read().m_LocalRotation))[0], t['euler'][0],
                    euler_unity(q4(core.transform_of(go).m_Father.read().m_LocalRotation))[0] + t['euler'][0]),
                src=src_p + '/Sprite Offset/Quad - Shadow')


# ---------------------------------------------------------------- 2. Pokémon đi theo
def follow(S):
    root = S.go_by_path(L2, 'Player Handler/Follow Pokemon')
    fp, _ = S.mb(root, 'FollowPokemon')
    base = 'level2 Player Handler/Follow Pokemon'
    so = S.go_by_path(L2, base[7:] + '/Sprite Offset')
    body = S.go_by_path(L2, base[7:] + '/Sprite Offset/Quad - Body')
    sh = S.go_by_path(L2, base[7:] + '/Sprite Offset/Quad - Shadow')
    net_sh = S.go_by_path(S2, 'Network Player/Follow Pokemon/Sprite Offset/Quad - Shadow')
    r, so_t, b_t, s_t = local_trs(root), local_trs(so), local_trs(body), local_trs(sh)
    return {
        'root': dict(r, three=three_of(r['pos']), src=base + ' Transform (con của Player Handler, cạnh Player Character)',
                     note='đặt lệch 1 ô theo x khi dựng scene; lúc chơi FollowPokemon tự dời theo bước chủ (mã mã hoá)'),
        'spriteOffset': dict(so_t, three=three_of(so_t['pos'], so_t['quat']), src=base + '/Sprite Offset'),
        'body': dict(b_t, material=material_info(S.comps(body)['MeshRenderer'][0].read().m_Materials[0], export=False),
                     three=three_of(b_t['pos'], b_t['quat']), src=base + '/Sprite Offset/Quad - Body'),
        'shadow': dict(s_t, activeInNetworkPlayer=bool(net_sh.m_IsActive), three=three_of(s_t['pos'], s_t['quat']),
                       src=base + '/Sprite Offset/Quad - Shadow (level2 tắt, sharedassets2 Network Player bật)'),
        'serialized': {'Steps': fp['Steps'], 'CurrentDirection': fp['CurrentDirection'], 'objects': len(fp['Objects']),
                       'src': base + ' FollowPokemon'},
        'speed': {'value': None, 'src': 'FollowPokemon (dump.cs 205972)',
                  'note': 'lớp không có trường tốc độ/offset public; AnimationSpeed private không serialize. [SUY RA] đi theo tốc độ bước của chủ (MoveSpeed)'},
    }


# ---------------------------------------------------------------- 3. máy ảnh
def camera(S):
    go = S.go_by_path(L2, 'Player Handler/Player Camera')
    gc, _ = S.mb(go, 'GameCamera')
    ce, _ = S.mb(go, 'CameraEffects')
    cam = S.comps(go)['Camera'][0].read_typetree()
    t = local_trs(go)
    off = v3(gc['Offset'])
    fwd = forward_unity(t['quat'])
    pitch = r4(math.degrees(math.atan2(-fwd[1], math.hypot(fwd[0], fwd[2]))))
    look = math.degrees(math.atan2(off[1], -off[2]))
    tgt = S.path_of(S.F[L2].objects[gc['Target']['m_PathID']].read().m_GameObject.read())
    src = 'level2 Player Handler/Player Camera'
    return {
        'fov': r4(cam['field of view']), 'fovAxis': 'dọc (Unity), dùng thẳng cho PerspectiveCamera.fov',
        'near': r4(cam['near clip plane']), 'far': r4(cam['far clip plane']),
        'clearFlags': {1: 'skybox', 2: 'solidColor', 3: 'depth', 4: 'nothing'}.get(cam['m_ClearFlags']),
        'clearColor': rgba(cam['m_BackGroundColor']), 'hdr': cam['m_HDR'], 'msaa': cam['m_AllowMSAA'],
        'src': src + ' Camera (fov, near, far, clear)',
        'follow': {
            'target': tgt, 'offset': off, 'npcOffset': v3(gc['NPCOffset']), 'speed': r4(gc['speed']),
            'src': src + ' GameCamera.Target/Offset/NPCOffset/speed',
            'note': 'vị trí máy ảnh = vị trí Target (Sprite Offset của người chơi) + Offset. [SUY RA] speed = hệ số Lerp mỗi giây '
                    '(mã Update bị mã hoá). NPCOffset dùng khi máy ảnh bám NPC trong script (ScriptTarget).',
            'three': {'offset': pos3(off), 'npcOffset': pos3(v3(gc['NPCOffset']))},
        },
        'rotation': dict(t, pitchDeg=pitch, forwardUnity=fwd,
                         offsetAngleDeg=r4(look), distance=r4(math.hypot(off[1], off[2])),
                         three=dict(three_of(quat=t['quat'], dirv=fwd), note='three.js: camera.position = target + (0, 14, 14.5); camera.rotation.x = -45° (nhìn về -z, chúc xuống)'),
                         src=src + ' Transform (localRotation, cha Player Handler không xoay)',
                         note='góc Transform cố định 45°; góc của Offset là atan(14/14.5) = %.2f°: [SUY RA] máy ảnh không LookAt mà giữ góc Transform' % look),
        'underwater': {'color': rgba(ce['underwaterColor']), 'amplitude': r4(ce['destortionAmplitude']),
                       'freq': [r4(ce['destortionX']), r4(ce['destortionY'])], 'src': src + ' CameraEffects'},
    }


# ---------------------------------------------------------------- 4. ánh sáng
def light(S):
    mm_o = next(o for o in S.F[L2].objects.values() if o.type.name == 'MonoBehaviour'
                and (ttg.script_of(S.env, o) or ('', ''))[1] == 'MapManager')
    mm = read_mb_dropping(S.env, mm_o, ('TileHeight', 'TileFlags'))
    lo = S.F[L2].objects[mm['MapLight']['m_PathID']]
    lt = lo.read_typetree()
    lgo = lo.read().m_GameObject.read()
    t = local_trs(lgo)
    fwd = forward_unity(q4(core.transform_of(lgo).m_LocalRotation))
    rs = next(o for o in S.F[L2].objects.values() if o.type.name == 'RenderSettings').read_typetree()
    src_mm = 'level2 Map MapManager'
    gname = lambda p: S.path_of(S.F[L2].objects[p['m_PathID']].read()) if p['m_PathID'] else None

    def point(path):
        g = S.go_by_path(L2, path)
        d = S.comps(g)['Light'][0].read_typetree()
        lt_ = local_trs(g)
        return {'type': {0: 'spot', 1: 'directional', 2: 'point'}[d['m_Type']], 'color': rgba(d['m_Color']),
                'intensity': r4(d['m_Intensity']), 'range': r4(d['m_Range']), 'pos': lt_['pos'], 'active': lt_['active'],
                'three': three_of(lt_['pos']), 'src': 'level2 %s Light (con của nhân vật người chơi)' % path}
    night = []
    for p in mm['NightLights']:
        f = os.path.basename(mm_o.assets_file.externals[p['m_FileID'] - 1].path) if p['m_FileID'] else L2
        m = S.F[f].objects[p['m_PathID']].read()
        C = {n: rgba(c) for n, c in m.m_SavedProperties.m_Colors}
        night.append({'material': m.m_Name, 'colors': {k: v for k, v in sorted(C.items()) if k in ('_Color', '_EmissionColor', '_NightColor', '_TintColor')},
                      'file': f})
    col = lambda k: rgba(mm[k])
    return {
        'sun': {'type': 'directional', 'color': rgba(lt['m_Color']), 'intensity': r4(lt['m_Intensity']),
                'shadows': {0: 'none', 1: 'hard', 2: 'soft'}[lt['m_Shadows']['m_Type']], 'transform': t,
                'dirUnity': fwd, 'three': {'dir': pos3(fwd), 'note': 'hướng ánh sáng CHIẾU TỚI; đặt DirectionalLight ở target - dir * k'},
                'src': 'level2 Map/Directional Light Light (= MapManager.MapLight)'},
        'ambient': {'mode': {0: 'skybox', 1: 'trilight', 3: 'flat', 4: 'custom'}.get(rs['m_AmbientMode'], rs['m_AmbientMode']),
                    'color': rgba(rs['m_AmbientSkyColor']), 'intensity': r4(rs['m_AmbientIntensity']),
                    'src': 'level2 RenderSettings m_AmbientMode/m_AmbientSkyColor'},
        'fog': {'on': bool(rs['m_Fog']), 'mode': {1: 'linear', 2: 'exp', 3: 'exp2'}[rs['m_FogMode']], 'color': rgba(rs['m_FogColor']),
                'density': r4(rs['m_FogDensity']), 'start': r4(rs['m_LinearFogStart']), 'end': r4(rs['m_LinearFogEnd']),
                'src': 'level2 RenderSettings (m_Fog = false: map ngoài trời không có sương)'},
        'ambientByArea': {'normal': col('AmbientColour'), 'cave': col('CaveAmbientColour'), 'spooky': col('SpookyAmbientColour'),
                          'battle': col('BattleAmbientColour'), 'battleEvening': col('BattleEveningAmbientColour'),
                          'battleNight': col('BattleNightAmbientColour'), 'battleSpooky': col('BattleSpookyAmbientColour'),
                          'src': src_mm + ' AmbientColour/CaveAmbientColour/SpookyAmbientColour/Battle*AmbientColour'},
        'environmentColours': {'value': [col_ for col_ in (rgba(c) for c in mm['EnviromentColours'])],
                               'src': src_mm + ' EnviromentColours[7]',
                               'note': 'thứ tự không có nhãn (GameDayTime chỉ có 5 giá trị Unset/Morning/Day/Evening/Night, mảng có 7; mã dùng mảng bị mã hoá). '
                                       '[0] = AmbientColour, [4] cam = hoàng hôn, [1]/[5] xanh tối = đêm là [SUY RA] theo màu.'},
        'timeOfDay': {'value': mm['TimeOfDay'], 'enum': {0: 'Unset', 1: 'Morning', 2: 'Day', 3: 'Evening', 4: 'Night'},
                      'src': src_mm + ' TimeOfDay + dump.cs enum GameDayTime'},
        'water': {'normal': col('WaterColourNormal'), 'cave': col('WaterColourCave'), 'spooky': col('WaterColourSpooky'),
                  'src': src_mm + ' WaterColourNormal/Cave/Spooky'},
        'weather': {'sand': [rgba(c) for c in mm['SandColours']], 'snow': [rgba(c) for c in mm['SnowColours']],
                    'rain': [rgba(c) for c in mm['RainColours']], 'src': src_mm + ' SandColours/SnowColours/RainColours'},
        'areaLights': {'mapManagerRefs': {'dark': gname(mm['DarkLight']), 'cave': gname(mm['CaveLight']), 'spooky': gname(mm['SpookyLight'])},
                       'dark': point('Player Handler/Player Character/Dark Light'),
                       'cave': point('Player Handler/Player Character/Cave Light'),
                       'red': point('Player Handler/Player Character/Red Light'),
                       'src': src_mm + ' DarkLight/CaveLight/SpookyLight (GameObject) + Light trên các con của Player Character'},
        'nightLights': {'value': night, 'src': src_mm + ' NightLights (material cửa sổ sáng ban đêm)'},
    }


# ---------------------------------------------------------------- 5. hạt
SHAPES = {0: 'sphere', 1: 'sphereShell', 2: 'hemisphere', 3: 'hemisphereShell', 4: 'cone', 5: 'box', 6: 'mesh',
          7: 'coneShell', 8: 'coneVolume', 9: 'coneVolumeShell', 10: 'circle', 11: 'circleEdge', 12: 'edge',
          13: 'meshRenderer', 14: 'skinnedMeshRenderer', 15: 'boxShell', 16: 'boxEdge', 17: 'donut', 18: 'rectangle'}
RENDER_MODE = {0: 'billboard', 1: 'stretch', 2: 'horizontalBillboard', 3: 'verticalBillboard', 4: 'mesh'}
HANDLED = {'InitialModule', 'ShapeModule', 'EmissionModule', 'SizeModule', 'RotationModule', 'ColorModule', 'UVModule',
           'VelocityModule', 'ForceModule', 'NoiseModule'}


def particle(S, ps_ptr, path):
    d = ps_ptr.read_typetree()
    im, sh, em = d['InitialModule'], d['ShapeModule'], d['EmissionModule']
    rad2deg = math.degrees(1)
    out = {
        'path': path,
        'main': {
            'duration': r4(d['lengthInSec']), 'looping': d['looping'], 'prewarm': d['prewarm'], 'playOnAwake': d['playOnAwake'],
            'startDelay': minmax_curve(d['startDelay']),
            'startLifetime': minmax_curve(im['startLifetime']), 'startSpeed': minmax_curve(im['startSpeed']),
            'startSize': minmax_curve(im['startSize']), 'startRotationDeg': minmax_curve(im['startRotation'], rad2deg),
            'startColor': minmax_gradient(im['startColor']), 'gravityModifier': minmax_curve(im['gravityModifier']),
            'maxParticles': im['maxNumParticles'],
            'simulationSpace': {0: 'local', 1: 'world', 2: 'custom'}[d['moveWithTransform']],
            'scalingMode': {0: 'hierarchy', 1: 'local', 2: 'shape'}[d['scalingMode']],
            'simulationSpeed': r4(d['simulationSpeed']),
        },
        'emission': {'rateOverTime': minmax_curve(em['rateOverTime']), 'rateOverDistance': minmax_curve(em['rateOverDistance']),
                     'bursts': [{'time': r4(b['time']), 'count': minmax_curve(b['countCurve']) if 'countCurve' in b else [b.get('minCount'), b.get('maxCount')],
                                 'cycles': b.get('cycleCount'), 'interval': r4(b.get('repeatInterval', 0))} for b in em['m_Bursts']]},
        'shape': {'enabled': sh['enabled'], 'type': SHAPES.get(sh['type'], sh['type']), 'radius': r4(sh['radius']['value']),
                  'radiusThickness': r4(sh['radiusThickness']), 'angle': r4(sh['angle']), 'length': r4(sh['length']),
                  'arc': r4(sh['arc']['value']), 'box': v3(sh['m_Scale']), 'position': v3(sh['m_Position']),
                  'rotation': v3(sh['m_Rotation']), 'randomDirection': r4(sh['randomDirectionAmount'])},
    }
    if d['SizeModule']['enabled']:
        out['sizeOverLifetime'] = minmax_curve(d['SizeModule']['curve'])
    if d['ColorModule']['enabled']:
        out['colorOverLifetime'] = minmax_gradient(d['ColorModule']['gradient'])
    if d['RotationModule']['enabled']:
        out['rotationOverLifetimeDeg'] = minmax_curve(d['RotationModule']['curve'], rad2deg)
    if d['VelocityModule']['enabled']:
        v = d['VelocityModule']
        out['velocityOverLifetime'] = {'x': minmax_curve(v['x']), 'y': minmax_curve(v['y']), 'z': minmax_curve(v['z']),
                                       'space': 'world' if v['inWorldSpace'] else 'local'}
    if d['ForceModule']['enabled']:
        f = d['ForceModule']
        out['forceOverLifetime'] = {'x': minmax_curve(f['x']), 'y': minmax_curve(f['y']), 'z': minmax_curve(f['z']),
                                    'space': 'world' if f['inWorldSpace'] else 'local'}
    if d['NoiseModule']['enabled']:
        n = d['NoiseModule']
        out['noise'] = {'strength': minmax_curve(n['strength']), 'frequency': r4(n['frequency'])}
    uv = d['UVModule']
    if uv['enabled']:
        out['textureSheet'] = {'tiles': [uv['tilesX'], uv['tilesY']], 'animation': {0: 'wholeSheet', 1: 'singleRow'}.get(uv['animationType']),
                               'rowIndex': uv.get('rowIndex'), 'frameOverTime': minmax_curve(uv['frameOverTime']),
                               'startFrame': minmax_curve(uv['startFrame']), 'cycles': r4(uv['cycles'])}
    other = sorted(k for k, v in d.items() if k.endswith('Module') and k not in HANDLED and isinstance(v, dict) and v.get('enabled'))
    if other:
        out['otherEnabledModules'] = other
    go = ps_ptr.read().m_GameObject.read()
    rp = S.comps(go).get('ParticleSystemRenderer')
    if rp:
        r = rp[0].read_typetree()
        rr = rp[0].read()
        mats = [material_info(m) for m in rr.m_Materials if m.m_PathID]
        out['renderer'] = {'mode': RENDER_MODE.get(r['m_RenderMode'], r['m_RenderMode']),
                           'alignment': {0: 'view', 1: 'world', 2: 'local', 3: 'facing', 4: 'velocity'}.get(r.get('m_RenderAlignment')),
                           'lengthScale': r4(r.get('m_LengthScale', 0)), 'velocityScale': r4(r.get('m_VelocityScale', 0)),
                           'maxParticleSize': r4(r.get('m_MaxParticleSize', 0)), 'sortingFudge': r4(r.get('m_SortingFudge', 0)),
                           'materials': mats}
    t = local_trs(go)
    out['transform'] = dict(t, three=three_of(t['pos'], t['quat']))
    return out


def fx_tree(S, fname, root_name, what):
    root = next(o.read() for o in S.F[fname].objects.values() if o.type.name == 'GameObject' and o.peek_name() == root_name
                and not core.transform_of(o.read()).m_Father.m_PathID)
    systems = []
    stack = [(core.transform_of(root), root.m_Name)]
    while stack:
        t, path = stack.pop(0)
        go = t.m_GameObject.read()
        for c in go.m_Component:
            if c.component.type.name == 'ParticleSystem':
                systems.append(particle(S, c.component, path))
        mbs = []
        for c in go.m_Component:
            if c.component.type.name == 'MonoBehaviour':
                s = ttg.script_of(S.env, c.component.deref())
                if s:
                    mbs.append(s[1])
        if mbs and systems and systems[-1]['path'] == path:
            systems[-1]['scripts'] = mbs
        stack.extend((ch.read(), path + '/' + ch.read().m_GameObject.read().m_Name) for ch in t.m_Children)
    return {'prefab': root_name, 'systems': systems, 'src': '%s prefab "%s" ParticleSystem (+ con)' % (fname, root_name), 'use': what}


def fx(S):
    out = {
        'grass': fx_tree(S, S2, 'Special Grass', 'lá cỏ bắn lên khi bước vào cỏ cao [SUY RA theo tên + màu xanh lá]'),
        'dust': fx_tree(S, S2, 'Dust Effect', 'bụi khi đáp sau cú nhảy gờ [SUY RA theo tên]'),
        'shiny': fx_tree(S, S2, 'Shiny Sparkle', 'lấp lánh Pokémon shiny; ShinySparkler gán shape = SkinnedMeshRenderer của model lúc chạy'),
        'ripple': fx_tree(S, S2, 'RippleEffect', 'gợn nước quanh chân khi lội/lướt [SUY RA theo tên]'),
    }
    stars = S.go_by_path(L2, 'Player Handler/Follow Pokemon/Sprite Offset/Quad - Shadow/ShinyStars Small')
    out['followShinyStars'] = {'systems': [particle(S, S.comps(stars)['ParticleSystem'][0], 'ShinyStars Small')],
                               'src': 'level2 Player Handler/Follow Pokemon/Sprite Offset/Quad - Shadow/ShinyStars Small ParticleSystem',
                               'use': 'sao nhỏ dưới Pokémon đi theo khi shiny (GameObject tắt sẵn)'}
    return out


# ---------------------------------------------------------------- 6. cửa
def peak(prop, keys):
    """Độ lệch lớn nhất so với khoá đầu: góc (độ) với rotation, khoảng cách với position."""
    if len(keys) < 2 or prop not in ('rotation', 'position'):
        return {}
    first = np.array(keys[0][1:])
    best, at = 0.0, 0.0
    for k in keys[1:]:
        v = np.array(k[1:])
        if prop == 'rotation':
            d = math.degrees(2 * math.acos(min(1.0, abs(float(first @ v)) / (np.linalg.norm(first) * np.linalg.norm(v)))))
        else:
            d = float(np.linalg.norm(v - first))
        if d > best + 1e-6:
            best, at = d, k[0]
    return {'peak': r4(best), 'peakAt': r4(at)} if best > 1e-4 else {}


def clip_info(cp):
    c = cp.read()
    curves = []
    for kind in ('m_PositionCurves', 'm_RotationCurves', 'm_EulerCurves', 'm_ScaleCurves'):
        for pc in getattr(c, kind, None) or []:
            keys = []
            for k in pc.curve.m_Curve:
                v = [getattr(k.value, a) for a in ('x', 'y', 'z', 'w') if hasattr(k.value, a)]
                keys.append([r4(k.time)] + [r4(x) for x in v])
            cv = {'prop': kind[2:-6].lower(), 'path': pc.path, 'keys': keys}
            cv.update(peak(cv['prop'], keys))
            curves.append(cv)
    for fc in getattr(c, 'm_FloatCurves', None) or []:
        curves.append({'prop': fc.attribute, 'path': fc.path, 'keys': [[r4(k.time), r4(k.value)] for k in fc.curve.m_Curve]})
    length = max((k[-1][0] for k in ([cv['keys'] for cv in curves if cv['keys']])), default=0)
    out = {'name': c.m_Name, 'legacy': bool(getattr(c, 'm_Legacy', True)), 'sampleRate': r4(c.m_SampleRate),
           'wrap': {0: 'default', 1: 'once', 2: 'loop', 4: 'pingPong', 8: 'clampForever'}.get(getattr(c, 'm_WrapMode', 0)),
           'length': r4(length), 'curves': curves}
    if c.m_Compressed:
        out['note'] = 'clip nén: không giải'
    return out


def door(S):
    menv = core.load_map_env()
    idx = core.prefab_index(menv)
    out = {}
    for name in ('door_ext_brownhouse', 'door_green_oak', 'pokiecentre_doors', 'shopdoors'):
        path, ptr = idx[name][0]
        root = ptr.read()
        anims = []
        stack = [(core.transform_of(root), '')]
        has_da = False
        while stack:
            t, rel = stack.pop(0)
            go = t.m_GameObject.read()
            for c in go.m_Component:
                tn = c.component.type.name
                if tn == 'Animation':
                    a = c.component.read()
                    clips = [clip_info(cp) for cp in a.m_Animations if cp.m_PathID]
                    anims.append({'node': rel or go.m_Name, 'playAutomatically': bool(a.m_PlayAutomatically), 'clips': clips})
                if tn == 'MonoBehaviour':
                    has_da = True
            stack.extend((ch.read(), (rel + '/' if rel else '') + ch.read().m_GameObject.read().m_Name) for ch in t.m_Children)
        out[name] = {'animations': anims, 'hasDoorAnimator': has_da, 'src': '%s (%s) Animation + clip legacy' % (path, 'mdata')}
    npc = []
    for p in ('Door_3', 'Door_4', 'Door_5', 'Door Horiz', 'Door Vert'):
        g = S.go_by_path(S2, 'NPCPrefab/' + p)
        t = local_trs(g)
        anims = []
        stack = [core.transform_of(g)]
        while stack:
            tt = stack.pop(0)
            gg = tt.m_GameObject.read()
            for c in gg.m_Component:
                if c.component.type.name == 'Animation':
                    a = c.component.read()
                    anims.append({'node': gg.m_Name, 'clips': [clip_info(cp) for cp in a.m_Animations if cp.m_PathID]})
            stack.extend(ch.read() for ch in tt.m_Children)
        npc.append({'name': p, 'transform': t, 'animations': anims})
    return {
        'houseDoors': out,
        'doorAnimator': {'fields': {'anim': None, 'ExtraSize': 0.0},
                         'src': 'mdata* DoorAnimator (71 prefab, dump.cs 226588): anim = null, ExtraSize = 0 ở mọi cửa nhà',
                         'note': '[SUY RA] DoorAnimator lấy Animation ở con lúc chạy và phát clip khi người chơi đứng trước cửa; '
                                 'toạ độ clip của prefab nhóm cũ (door_ext_*) tính theo đơn vị cũ, nhân legacyScale 0.060241 như props.js'},
        'npcDoors': {'value': npc, 'src': 'sharedassets2 NPCPrefab/Door_* (cửa kiểu NPC do server bật, Animation DoorBoss)'},
        'doorObject': {'src': 'mdata* DoorObject (21 prefab: rèm gym Striaton, BadgeGate, kệ sách...)',
                       'note': 'cửa đặc biệt trượt DoorParts tới EndPositions với speed (1..3); không dùng cho cửa nhà thường'},
    }


# ---------------------------------------------------------------- 7. emote
def emote(S):
    bubble = S.go_by_path(L2, 'GUI Root/Panel - Usernames/Emote Bubble')
    eb, _ = S.mb(bubble, 'EmoteBubble')
    pre = S.go_by_path(S2, 'Emote Bubble')
    ebp, _ = S.mb(pre, 'EmoteBubble')
    spr_o = S.F[L2].objects[eb['spriteEmote']['m_PathID']]
    spr = ttg.read_mb(S.env, spr_o)[1]
    atlas_name = None
    ap = spr.get('mAtlas')
    if ap and ap['m_PathID']:
        f = os.path.basename(spr_o.assets_file.externals[ap['m_FileID'] - 1].path) if ap['m_FileID'] else L2
        atlas_name = ttg.read_mb(S.env, S.F[f].objects[ap['m_PathID']])[1].get('m_Name') or None
    anim = S.F[L2].objects[eb['_Animation']['m_PathID']].read()
    clips = [clip_info(cp) for cp in anim.m_Animations if cp.m_PathID]
    ts_o = S.F[L2].objects[eb['TS']['m_PathID']]
    ts = ttg.read_mb(S.env, ts_o)[1]
    tween = {k: (v3(ts[k]) if isinstance(ts.get(k), dict) and 'x' in ts[k] else ts.get(k))
             for k in ('from', 'to', 'duration', 'delay', 'style', 'ignoreTimeScale')}
    tween['curve'] = samples(ts['animationCurve']['m_Curve']) if ts.get('animationCurve') else None
    if isinstance(tween.get('duration'), float):
        tween['duration'] = r4(tween['duration'])
    return {
        'bubble': {'offset': v3(eb['offset']), 'prefabOffset': v3(ebp['offset']), 'depth': eb['Depth'],
                   'src': 'level2 GUI Root/Panel - Usernames/Emote Bubble EmoteBubble.offset; sharedassets2 prefab "Emote Bubble" (dùng cho NPC/người khác)',
                   'note': 'bong bóng là widget NGUI bám toạ độ màn hình của target (Player Character) + offset thế giới'},
        'sprite': {'atlas': atlas_name, 'initial': spr.get('mSpriteName'), 'size': [spr.get('mWidth'), spr.get('mHeight')],
                   'src': 'level2 .../Emote Bubble spriteEmote UISprite mAtlas/mSpriteName/mWidth/mHeight'},
        'spotted': {'sprite': '1', 'atlas': 'EmoteAtlas',
                    'src': 'data/atlas.js EmoteAtlas "1" = [70,4,68,62] = bong bóng dấu "!" (xem art/ui/EmoteAtlas.png); "2" = "?"',
                    'note': '[SUY RA] trainer thấy người chơi -> emote 1 ("!"): CharacterHandler.ProximityEmote / EmoteBubble.Emote(int id) nhận số; mã chọn số bị mã hoá'},
        'spottedSFX': {'value': None, 'src': 'MAPAPI.Response.NPCSettingStruct.SpottedSFX (string, dump.cs 164231+)',
                       'note': 'server gửi theo từng NPC; client không có giá trị mặc định (stringliteral.json không có tên tiếng)'},
        'animation': {'clips': clips, 'src': 'level2 GUI Root/Panel - Usernames/Emote Bubble Animation'},
        'tweenScale': dict(tween, src='level2 .../Emote Bubble TweenScale (EmoteBubble.TS)'),
    }


# ---------------------------------------------------------------- ghi
def main():
    S = Src()
    world = {
        'frame': {
            'unit': '1 đơn vị Unity = 1 ô', 'angles': 'độ', 'raw': 'khung Unity (tay trái)',
            'three': 'khung bản web: soi gương z cho vị trí/hướng thế giới: (x, y, z) -> (x, y, -z); quaternion (x, y, z, w) -> (-x, -y, z, w)',
            'why': 'game gốc: máy ảnh ở -z Unity nhìn về +z, prop đặt xoay 180° quanh y. Bản web: glb đảo x, prop không xoay, máy ảnh ở +z nhìn -z. '
                   'Đảo x rồi bỏ quay 180° = soi gương z.',
            'src': 'level2 Player Handler/Player Camera (GameCamera.Offset z = -14.5, Transform 45° quanh x) + sharedassets2 NPCPrefab (con quay 180°)',
        },
        'character': character(S),
        'follow': follow(S),
        'camera': camera(S),
        'light': light(S),
        'fx': fx(S),
        'door': door(S),
        'emote': emote(S),
    }
    body = json.dumps(world, ensure_ascii=False, indent=1, sort_keys=False)
    with open(DATA_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/rip_world.py - không sửa tay.\n')
        fh.write('window.P1 = window.P1 || {};\n')
        fh.write('P1.WORLD = %s;\n' % body)
    print('world.js %d byte; ảnh mới: %s' % (os.path.getsize(DATA_JS), ', '.join(_written) or 'không'))


def npc_sheets():
    """Xuất tấm sprite NPC mà tools/maps/*.txt gọi bằng tên gốc (sprite=spriteN) nhưng rip_2d.py chưa xuất.

    Chỉ thêm tệp còn thiếu vào art/sprite/npc/, không ghi đè, không xoá (rip_2d.py npc cũng không xoá).
    """
    import re
    import UnityPy
    maps = os.path.join(HERE, 'maps')
    want = set()
    for fn in os.listdir(maps):
        if fn.endswith('.txt'):
            with open(os.path.join(maps, fn), encoding='utf-8') as fh:
                want.update(re.findall(r'sprite=(sprite\d+)', fh.read()))
    out_dir = os.path.join(GAME, 'art', 'sprite', 'npc')
    missing = sorted(n for n in want if not os.path.exists(os.path.join(out_dir, n + '.png')))
    if not missing:
        print('npc: đủ %d tấm, không cần xuất' % len(want))
        return
    env = UnityPy.load(os.path.join(ttg.DATA, 'StreamingAssets', 'sdata'))
    cont = env.container
    for n in missing:
        p = 'assets/assetbundles/sprites/npc/%s.png' % n
        if p not in cont:
            print('  !! không có trong sdata:', p)
            continue
        img = cont[p].read().image.convert('RGBA')
        img.save(os.path.join(out_dir, n + '.png'))
        print('  + art/sprite/npc/%s.png' % n)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'npc':
        npc_sheets()
    else:
        main()
