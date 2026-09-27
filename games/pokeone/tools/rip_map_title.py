# -*- coding: utf-8 -*-
"""Cảnh màn đăng nhập (level1): đảo mô hình Kanto/Johto, trời, ánh sáng, đường bay máy ảnh.

Gọi từ rip_map.py (build_title). Ra art/title/island.glb, art/title/tex/*.png, art/title/sky_*.png
và trả dict cho P1.TITLE_SCENE.

Máy ảnh: Main Camera có PlayableDirector phát timeline "Login" (lặp, DirectorWrapMode.Loop). Timeline
có một AnimationTrack với clip vô hạn "Recorded" (163,2 s, 6 đường cong: vị trí xyz + góc Euler xyz).
Track áp offset: vị trí = OpenClipOffsetPosition + R(OpenClipOffsetEulerAngles) * vị trí clip,
góc xoay = R(offset) * R(euler clip). Đã kiểm: ở t=0 công thức ra đúng transform lưu trong scene
(562.30, 87.60, 258.10) so với (562.04, 87.69, 258.11), hướng nhìn khớp tới 3 chữ số.
"""
import math, os, struct, sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rip_map_core as core
import ttg

SKIP = {'Main Camera', 'Directional Light', 'Post Processing'}
SAMPLE_DT = 0.25


def euler_m(ex, ey, ez):
    """Góc Euler Unity (độ, thứ tự quay Z rồi X rồi Y) -> ma trận 3x3."""
    ex, ey, ez = map(math.radians, (ex, ey, ez))
    rx = np.array([[1, 0, 0], [0, math.cos(ex), -math.sin(ex)], [0, math.sin(ex), math.cos(ex)]])
    ry = np.array([[math.cos(ey), 0, math.sin(ey)], [0, 1, 0], [-math.sin(ey), 0, math.cos(ey)]])
    rz = np.array([[math.cos(ez), -math.sin(ez), 0], [math.sin(ez), math.cos(ez), 0], [0, 0, 1]])
    return ry @ rx @ rz


def quat_of(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s])
    i = int(np.argmax(np.diag(m)))
    if i == 0:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        return np.array([0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
    if i == 1:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        return np.array([(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
    s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
    return np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s])


def to_three_pos(p):
    return [round(float(-p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3)]


MIRROR = np.diag([-1.0, 1.0, 1.0])
TURN = np.diag([-1.0, 1.0, -1.0])   # nửa vòng quanh y


def to_three_quat(m, camera=False):
    """Ma trận quay Unity -> quaternion three.js (soi gương x: M R M). Máy ảnh Unity nhìn theo +z cục bộ,
    three.js theo -z: với máy ảnh nhân thêm nửa vòng quanh y cục bộ."""
    r = MIRROR @ m @ MIRROR
    if camera:
        r = r @ TURN
    q = quat_of(r)
    q /= np.linalg.norm(q)
    return [round(float(x), 5) for x in q]


class StreamedCurves:
    """AnimationClip dạng streamed (Mecanim): mỗi khoá mang 4 hệ số Hermite (a,b,c,d),
    giá trị = ((a*dt + b)*dt + c)*dt + d, dt = t - thời điểm khoá; khoá sống tới khoá kế của cùng đường."""

    def __init__(self, words, count):
        buf = struct.pack('<%dI' % len(words), *words)
        self.keys = [[] for _ in range(count)]
        pos = 0
        while pos < len(buf):
            t, n = struct.unpack_from('<fI', buf, pos)
            pos += 8
            for _ in range(n):
                idx, = struct.unpack_from('<I', buf, pos)
                co = struct.unpack_from('<4f', buf, pos + 4)
                pos += 20
                if idx < count and math.isfinite(t):
                    self.keys[idx].append((t, co))
                elif idx < count and not self.keys[idx]:
                    self.keys[idx].append((-1e30, co))

    def value(self, i, t):
        ks = self.keys[i]
        k = ks[0]
        for kk in ks:
            if kk[0] <= t:
                k = kk
            else:
                break
        a, b, c, d = k[1]
        dt = max(0.0, t - k[0]) if k[0] > -1e29 else 0.0
        return ((a * dt + b) * dt + c) * dt + d


def camera_path(env, F):
    s1 = F['sharedassets1.assets']
    director = next(o for o in F['level1'].objects.values() if o.type.name == 'PlayableDirector').read_typetree()
    tl_ptr = director['m_PlayableAsset']
    timeline = ttg.read_mb(env, s1.objects[tl_ptr['m_PathID']])[1]
    track = ttg.read_mb(env, s1.objects[timeline['m_Tracks'][0]['m_PathID']])[1]
    clip = s1.objects[track['m_AnimClip']['m_PathID']].read_typetree()
    mc = clip['m_MuscleClip']
    data = mc['m_Clip']['data']['m_StreamedClip']
    curves = StreamedCurves(data['data'], data['curveCount'])
    binds = [(b['attribute'], b['typeID']) for b in clip['m_ClipBindingConstant']['genericBindings']]
    assert binds == [(1, 4), (4, 4)], binds  # Transform: vị trí (1) rồi Euler (4)
    off_p = np.array([track['m_OpenClipOffsetPosition'][k] for k in 'xyz'])
    off_e = [track['m_OpenClipOffsetEulerAngles'][k] for k in 'xyz']
    R = euler_m(*off_e)
    dur = float(mc['m_StopTime'])
    times, pos, rot = [], [], []
    n = int(round(dur / SAMPLE_DT))
    for i in range(n + 1):
        t = min(dur, i * SAMPLE_DT)
        cp = np.array([curves.value(j, t) for j in range(3)])
        ce = [curves.value(j, t) for j in range(3, 6)]
        times.append(round(t, 3))
        pos.append(to_three_pos(off_p + R @ cp))
        rot.append(to_three_quat(R @ euler_m(*ce), camera=True))
    cam_go = None
    for o in F['level1'].objects.values():
        if o.type.name == 'Camera':
            c = o.read_typetree()
            if not c['orthographic']:
                cam = c
                cam_go = c['m_GameObject']['m_PathID']
    t = core.transform_of(F['level1'].objects[cam_go].read())
    scene_m = core.trs(t)[:3, :3]
    return {
        'pos': pos[0], 'rot': rot[0], 'fov': cam['field of view'], 'near': cam['near clip plane'], 'far': cam['far clip plane'],
        'sceneTransform': {'pos': to_three_pos(core.trs(t)[:3, 3]), 'rot': to_three_quat(scene_m, camera=True)},
        'path': {'dt': SAMPLE_DT, 'duration': round(dur, 3), 'loop': director['m_WrapMode'] == 1,
                 'pos': pos, 'rot': rot,
                 'note': 'Timeline "Login" lặp; mẫu mỗi %.2fs, nội suy tuyến tính vị trí + slerp quaternion. '
                         'Khung three.js (x đã đảo).' % SAMPLE_DT},
    }


def skybox(F, out_dir):
    """Skybox/6 Sided: _FrontTex=+Z, _BackTex=-Z, _LeftTex=+X, _RightTex=-X, _UpTex=+Y (Unity).
    Ghi sky_<mặt>.png giữ ảnh gốc, kèm hướng của từng mặt trong three.js (x đã đảo, ảnh không lật)."""
    rs = next(o for o in F['level1'].objects.values() if o.type.name == 'RenderSettings').read()
    mat = rs.m_SkyboxMaterial.read()
    sp = mat.m_SavedProperties
    faces = {}
    for n, e in sp.m_TexEnvs:
        if e.m_Texture.m_PathID and n.endswith('Tex'):
            face = n[1:-3].lower()
            im = e.m_Texture.read().image.convert('RGB')
            fn = 'sky_%s.png' % face
            im.save(os.path.join(out_dir, fn), optimize=True)
            faces[face] = 'art/title/' + fn
    C = {n: c for n, c in sp.m_Colors}
    F_ = {n: float(v) for n, v in sp.m_Floats}
    tint = C.get('_Tint')
    return {'material': mat.m_Name, 'faces': faces,
            'unityDir': {'front': '+z', 'back': '-z', 'left': '+x', 'right': '-x', 'up': '+y', 'down': '-y'},
            'threeDir': {'front': '+z', 'back': '-z', 'left': '-x', 'right': '+x', 'up': '+y', 'down': '-y'},
            'tint': [round(tint.r, 3), round(tint.g, 3), round(tint.b, 3)] if tint else None,
            'exposure': F_.get('_Exposure', 1.0), 'rotation': F_.get('_Rotation', 0.0)}


def lighting(F):
    rs = next(o for o in F['level1'].objects.values() if o.type.name == 'RenderSettings').read_typetree()
    light = next(o for o in F['level1'].objects.values() if o.type.name == 'Light').read_typetree()
    lt = core.transform_of(F['level1'].objects[light['m_GameObject']['m_PathID']].read())
    fwd = core.trs(lt)[:3, :3] @ np.array([0, 0, 1.0])
    rgb = lambda c: [round(c['r'], 4), round(c['g'], 4), round(c['b'], 4)]
    return {
        'sun': {'color': rgb(light['m_Color']), 'intensity': light['m_Intensity'],
                'dir': to_three_pos(fwd), 'note': 'hướng ánh sáng chiếu tới (khung three.js); đặt DirectionalLight ở -dir'},
        'ambient': {'mode': {0: 'skybox', 1: 'trilight', 3: 'flat', 4: 'custom'}.get(rs['m_AmbientMode'], rs['m_AmbientMode']),
                    'sky': rgb(rs['m_AmbientSkyColor']), 'equator': rgb(rs['m_AmbientEquatorColor']),
                    'ground': rgb(rs['m_AmbientGroundColor']), 'intensity': rs['m_AmbientIntensity']},
        'fog': {'on': bool(rs['m_Fog']), 'mode': {1: 'linear', 2: 'exp', 3: 'exp2'}[rs['m_FogMode']],
                'color': rgb(rs['m_FogColor']), 'start': rs['m_LinearFogStart'], 'end': rs['m_LinearFogEnd'],
                'density': rs['m_FogDensity']},
    }


def post(env, F):
    s1 = F['sharedassets1.assets']
    out = {}
    for o in s1.objects.values():
        if o.type.name != 'MonoBehaviour':
            continue
        sc = ttg.script_of(env, o)
        if sc and sc[1].endswith('ColorGrading'):
            d = ttg.read_mb(env, o)[1]
            tm = {0: 'none', 1: 'neutral', 2: 'aces', 3: 'custom'}
            out = {'tonemapper': tm.get(d['tonemapper']['value']) if d['tonemapper']['overrideState'] else 'none',
                   'postExposureEV': d['postExposure']['value'] if d['postExposure']['overrideState'] else 0,
                   'temperature': d['temperature']['value'] if d['temperature']['overrideState'] else 0,
                   'note': 'PostProcessLayer/Volume trên máy ảnh: ColorGrading (ACES, +1 EV = sáng x2, ấm +25)'}
    return out


def build_title(game_dir):
    out_dir = os.path.join(game_dir, 'art', 'title')
    os.makedirs(out_dir, exist_ok=True)
    env = ttg.load_core()
    F = ttg.files(env)
    scene = None
    for o in F['level1'].objects.values():
        if o.type.name == 'GameObject':
            g = o.read()
            if g.m_Name == 'Scene' and not core.transform_of(g).m_Father.m_PathID:
                scene = g
    parts, stats = core.collect(scene, keep_root=True, skip=lambda g: g.m_Name in SKIP)
    # PaintTerrain.Start(): mesh.colors của Island = TextAsset MapVertex (Vector3 float/đỉnh, xám 0.47..1.27).
    mv = next(o for o in F['resources.assets'].objects.values()
              if o.type.name == 'TextAsset' and o.peek_name() == 'MapVertex').read()
    raw = mv.m_Script.encode('utf-8', 'surrogateescape') if isinstance(mv.m_Script, str) else bytes(mv.m_Script)
    paint = np.frombuffer(raw, dtype='<f4').reshape(-1, 3).astype(np.float64)
    painted = 0
    for p in parts:
        if p.node == 'Island' and len(p.pos) == len(paint):
            p.col = np.c_[paint, np.ones(len(paint))]
            painted += 1
    tc = core.TexCache(os.path.join(out_dir, 'tex'), max_size=1024)
    g = core.export_parts(parts, os.path.join(out_dir, 'island.glb'), tc, 'island')
    lo, hi = core.aabb(parts)
    sky = skybox(F, out_dir)
    info = {
        'glb': 'art/title/island.glb',
        'camera': camera_path(env, F),
        'sky': sky,
        'light': lighting(F),
        'post': post(env, F),
        'min': [round(float(x), 3) for x in lo], 'max': [round(float(x), 3) for x in hi],
    }
    report = {'parts': len(parts), 'materials': len(g.materials), 'textures': len(g.images),
              'painted_island_submeshes': painted, **stats}
    return info, report
