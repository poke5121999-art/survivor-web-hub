# -*- coding: utf-8 -*-
"""fx_export.py - bóc prefab VFX gốc (Unity Shuriken) ra JSON đã chuẩn hoá cho js/vfx.js.

    set PYTHONIOENCODING=utf-8
    python fx_export.py <tên prefab...>        # tên gốc, có hay không có thư mục ("1001/1001_01_...")
    python fx_export.py --manifest <tệp.json>  # lấy khoá "vfx" của manifest
    python fx_export.py --all-referenced       # tự gom tên từ bảng (vd-ref/json) cho 4 nhân vật + quái trong phạm vi
    python fx_export.py --bundle remote_prefab_assets_object <tên...>   # hệ hạt nằm trong prefab đồ vật
    thêm --dry để chỉ in danh sách tên và tên không khớp.
    --all-referenced còn bóc OBJECT_FX (vùng SpecialField, cửa thoát, đồ rơi) từ remote_prefab_assets_object.

Ra: art/vfx/<tên>.json, art/vfx/tex/<ảnh>.webp, art/vfx/mesh/<mesh>.json, art/vfx/index.json.

Quy ước (xem ARCH.md): toạ độ đã đổi sang three (z_three = -z_unity).
- vị trí/vector: (x, y, -z). Quaternion: (-x, -y, z, w). Góc Euler 3D (rad): (-x, -y, z).
- Góc xoay billboard 2D giữ nguyên nghĩa của Unity: dương = quay theo chiều kim đồng hồ trên màn hình.
- Mesh: đỉnh (x, y, -z), đảo chiều tam giác.
- Hình phát (shape): toạ độ hình học sinh trong không gian local Unity rồi đổi (JS lo), còn pos/quat của
  shape đã đổi sẵn.

Định dạng rút gọn:
- MinMaxCurve: số (hằng) | [min, max] (hai hằng) | {"m": nhân, "k": [t, v, inSlope, outSlope, ...]}
  (đường cong) | {"m":, "k":, "k0":} (hai đường cong). Slope vô cực ghi 1e9.
- MinMaxGradient: [r,g,b,a] | {"g": grad} | {"c0": [..], "c1": [..]} | {"g": , "g0": } | {"rc": grad}.
  grad = {"c": [t,r,g,b,...], "a": [t,a,...], "f": 1 nếu chế độ Fixed}. Màu gamma (sRGB) như Unity lưu.
- Trường bằng mặc định bị bỏ (xem DEF trong mã).

Bẫy đã gặp (ghi lại ở đây, chi tiết trong README của tools):
- minMaxState trong typetree: 0 hằng, 1 đường cong, 2 HAI ĐƯỜNG CONG, 3 HAI HẰNG (giống enum C#
  ParticleSystemCurveMode). Đo: startSize state 3 có m_Curve rỗng và scalar/minScalar = 0.5/0.3.
- Góc (startRotation, rotationOverLifetime, ...) lưu bằng radian.
- frameOverTime/startFrame của UVModule lưu đã chuẩn hoá [0,1) theo số khung.
- Tên HitBox dạng "..._Hit" với UseElementalHitVfx = prefab "..._Hit_None|_Fire|_Water|_Wind".
"""
import io, json, math, os, re, sys, hashlib, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vc  # noqa: E402

ROOT = os.path.dirname(HERE)  # games/voiddiver
OUT = os.path.join(ROOT, 'art', 'vfx')
OUT_TEX = os.path.join(OUT, 'tex')
OUT_MESH = os.path.join(OUT, 'mesh')
REF_JSON = os.path.join(os.path.expanduser('~'), 'Downloads', 'vd-ref', 'json')

VFX_BUNDLE = 'remote_prefab_assets_vfx'
PRELOAD = ['dependencies_assets_vfx', 'dependencies_assets_shader', 'be9e4d904692f945f3910b57349aeb09_monoscripts']

TEX_MAX = 512          # cạnh dài tối đa của ảnh thường
TEX_MAX_SHEET = 1024   # ảnh flipbook (>= 4 ô) được giữ lớn hơn


# ------------------------------------------------------------------ số --
def rn(x, d=4):
    """làm tròn gọn: 4 chữ số có nghĩa sau dấu phẩy, bỏ -0."""
    if x is None:
        return 0
    if isinstance(x, bool):
        return 1 if x else 0
    if isinstance(x, int):
        return x
    if math.isinf(x) or abs(x) > 1e8:
        return 1e9 if x > 0 else -1e9
    if math.isnan(x):
        return 0
    if x == 0:
        return 0
    m = abs(x)
    if m >= 1000:
        v = round(x, 1)
    elif m >= 1:
        v = round(x, d)
    else:
        # giữ d chữ số có nghĩa với số nhỏ
        e = int(math.floor(math.log10(m)))
        v = round(x, max(d, -e + d - 1))
    if v == int(v) and abs(v) < 1e15:
        return int(v)
    return v


def v3(v):
    return [rn(v['x']), rn(v['y']), rn(v['z'])]


def v3m(v):
    """vector Unity -> three (lật z)"""
    return [rn(v['x']), rn(v['y']), rn(-v['z'])]


def quat_m(q):
    """quaternion Unity -> three (gương qua mặt z=0)"""
    return [rn(-q['x']), rn(-q['y']), rn(q['z']), rn(q['w'])]


def euler_to_quat(ex, ey, ez):
    """Euler độ theo thứ tự Unity (Z, rồi X, rồi Y) -> quaternion Unity (x,y,z,w)."""
    hx, hy, hz = math.radians(ex) / 2, math.radians(ey) / 2, math.radians(ez) / 2
    qx = (math.sin(hx), 0, 0, math.cos(hx))
    qy = (0, math.sin(hy), 0, math.cos(hy))
    qz = (0, 0, math.sin(hz), math.cos(hz))

    def mul(a, b):
        ax, ay, az, aw = a
        bx, by, bz, bw = b
        return (aw * bx + ax * bw + ay * bz - az * by,
                aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw,
                aw * bw - ax * bx - ay * by - az * bz)
    q = mul(mul(qy, qx), qz)
    return {'x': q[0], 'y': q[1], 'z': q[2], 'w': q[3]}


# --------------------------------------------------------- curve/gradient --
def curve_keys(c):
    ks = c.get('m_Curve') or []
    out = []
    for k in ks:
        out += [rn(k['time']), rn(k['value']), rn(k['inSlope']), rn(k['outSlope'])]
    return out


def mmc(m, neg=False):
    """MinMaxCurve typetree -> dạng rút gọn. neg: đảo dấu (trục z, góc x/y)."""
    if m is None:
        return 0
    st = m.get('minMaxState', 0)
    s = -1 if neg else 1
    if st == 0:
        return rn(m['scalar'] * s)
    if st == 3:
        a, b = rn(m['minScalar'] * s), rn(m['scalar'] * s)
        return a if a == b else [a, b]
    k = curve_keys(m['maxCurve'])
    if st == 1:
        return {'m': rn(m['scalar'] * s), 'k': k}
    return {'m': rn(m['scalar'] * s), 'k': k, 'k0': curve_keys(m['minCurve'])}


def col4(c):
    return [rn(c['r']), rn(c['g']), rn(c['b']), rn(c['a'])]


def grad(g):
    nc, na = g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2)
    c, a = [], []
    for i in range(nc):
        k = g['key%d' % i]
        c += [rn(g['ctime%d' % i] / 65535.0), rn(k['r']), rn(k['g']), rn(k['b'])]
    for i in range(na):
        k = g['key%d' % i]
        a += [rn(g['atime%d' % i] / 65535.0), rn(k['a'])]
    out = {'c': c, 'a': a}
    if g.get('m_Mode', 0) == 1:
        out['f'] = 1
    return out


def mmg(m):
    st = m.get('minMaxState', 0)
    if st == 0:
        return col4(m['maxColor'])
    if st == 1:
        return {'g': grad(m['maxGradient'])}
    if st == 2:
        return {'c0': col4(m['minColor']), 'c1': col4(m['maxColor'])}
    if st == 3:
        return {'g': grad(m['maxGradient']), 'g0': grad(m['minGradient'])}
    return {'rc': grad(m['maxGradient'])}


def is_white(x):
    return x == [1, 1, 1, 1]


def drop(d, defaults):
    """bỏ khoá có giá trị bằng mặc định hoặc None"""
    return {k: v for k, v in d.items() if v is not None and not (k in defaults and defaults[k] == v)}


# --------------------------------------------------------------- modules --
STREAM_SIZE = {4: 2, 5: 2, 6: 2, 7: 2, 8: 1, 9: 1, 10: 3, 11: 1, 12: 1, 13: 2, 14: 3, 15: 1, 16: 3, 17: 1,
               18: 3, 19: 3, 20: 1, 21: 1, 22: 1, 23: 1, 24: 2, 25: 3, 26: 4, 27: 1, 28: 2, 29: 3, 30: 4,
               31: 1, 32: 2, 33: 3, 34: 4, 35: 1, 36: 2, 37: 3, 38: 4, 39: 1, 40: 2, 41: 3, 42: 1, 43: 2,
               44: 3, 45: 1, 46: 2, 47: 3}
# tên nguồn cho từng thành phần của stream (JS tra bảng)
STREAM_SRC = {
    4: ['u', 'v'], 5: ['u2', 'v2'], 6: ['0', '0'], 7: ['0', '0'], 8: ['blend'], 9: ['frame'],
    10: ['cx', 'cy', 'cz'], 11: ['vid'], 12: ['sx'], 13: ['sx', 'sy'], 14: ['sx', 'sy', 'sz'],
    15: ['rot'], 16: ['rx', 'ry', 'rot'], 17: ['rotspd'], 18: ['0', '0', 'rotspd'],
    19: ['vx', 'vy', 'vz'], 20: ['speed'], 21: ['age'], 22: ['invlife'],
    23: ['sr0'], 24: ['sr0', 'sr1'], 25: ['sr0', 'sr1', 'sr2'], 26: ['sr0', 'sr1', 'sr2', 'sr3'],
    27: ['vr0'], 28: ['vr0', 'vr1'], 29: ['vr0', 'vr1', 'vr2'], 30: ['vr0', 'vr1', 'vr2', 'vr3'],
    31: ['c1x'], 32: ['c1x', 'c1y'], 33: ['c1x', 'c1y', 'c1z'], 34: ['c1x', 'c1y', 'c1z', 'c1w'],
    35: ['c2x'], 36: ['c2x', 'c2y'], 37: ['c2x', 'c2y', 'c2z'], 38: ['c2x', 'c2y', 'c2z', 'c2w'],
}


def stream_slots(rend):
    """Mô phỏng cách Unity nhồi vertex stream vào TEXCOORD: Position/Normal/Tangent/Color có semantic
    riêng; UV = TEXCOORD0.xy; các stream còn lại xếp liền nhau (được phép vắt qua 2 thanh ghi).
    Trả 12 tên nguồn cho TEXCOORD1.xyzw, TEXCOORD2.xyzw, TEXCOORD3.xyzw (shader nhà chỉ đọc từ đó)."""
    streams = rend.get('m_VertexStreams') if rend.get('m_UseCustomVertexStreams') else [0, 1, 3, 4]
    flat = []
    for s in streams:
        if s in (0, 1, 2, 3):
            continue
        n = STREAM_SIZE.get(s, 0)
        src = STREAM_SRC.get(s, ['0'] * n)
        flat += (src + ['0'] * n)[:n]
    flat += ['0'] * 16
    slots = flat[4:16]  # sau TEXCOORD0 (xy = UV, zw = stream kế tiếp)
    if all(x == '0' for x in slots):
        return None
    while slots and slots[-1] == '0':
        slots.pop()
    return slots


def norm_shape(sm):
    if not sm.get('enabled'):
        return None
    t = sm['type']
    rad = sm['radius']
    arc = sm['arc']
    q = euler_to_quat(sm['m_Rotation']['x'], sm['m_Rotation']['y'], sm['m_Rotation']['z'])
    out = {
        'type': t,
        'radius': rn(rad['value']),
        'radiusMode': rad['mode'], 'radiusSpread': rn(rad['spread']), 'radiusSpeed': mmc(rad['speed']),
        'radiusThick': rn(sm.get('radiusThickness', 1)),
        'angle': rn(sm['angle']), 'length': rn(sm['length']),
        'arc': rn(arc['value']), 'arcMode': arc['mode'], 'arcSpread': rn(arc['spread']), 'arcSpeed': mmc(arc['speed']),
        'boxThick': v3(sm['boxThickness']), 'donut': rn(sm.get('donutRadius', 0.2)),
        'pos': v3m(sm['m_Position']), 'quat': quat_m(q), 'scale': v3(sm['m_Scale']),
        'randDir': rn(sm.get('randomDirectionAmount', 0)), 'sphDir': rn(sm.get('sphericalDirectionAmount', 0)),
        'randPos': rn(sm.get('randomPositionAmount', 0)), 'align': 1 if sm.get('alignToDirection') else 0,
    }
    if t in (6, 13, 14):
        out['meshApprox'] = 1  # mesh -> xấp xỉ bằng hộp theo scale (không có dữ liệu mesh phát)
    return drop(out, {'radius': 1, 'radiusMode': 0, 'radiusSpread': 0, 'radiusSpeed': 1, 'radiusThick': 1,
                      'angle': 25, 'length': 5, 'arc': 360, 'arcMode': 0, 'arcSpread': 0, 'arcSpeed': 1,
                      'boxThick': [0, 0, 0], 'donut': 0.2, 'pos': [0, 0, 0], 'quat': [0, 0, 0, 1],
                      'scale': [1, 1, 1], 'randDir': 0, 'sphDir': 0, 'randPos': 0, 'align': 0})


def norm_emission(em):
    # module tắt vẫn xuất (khoá off) vì Animator có thể bật lại (EmissionModule.enabled là thuộc tính
    # được animate nhiều nhất: 515 binding)
    bursts = []
    for b in em.get('m_Bursts', [])[:em.get('m_BurstCount', 0)]:
        bursts.append([rn(b['time']), mmc(b['countCurve']), b['cycleCount'], rn(b['repeatInterval']),
                       rn(b.get('probability', 1))])
    out = {'rate': mmc(em['rateOverTime']), 'rateDist': mmc(em['rateOverDistance']), 'bursts': bursts,
           'off': 0 if em.get('enabled') else 1}
    out = drop(out, {'rate': 0, 'rateDist': 0, 'bursts': [], 'off': 0})
    if out.get('off') and len(out) == 1:
        return None
    return out


def norm_velocity(m):
    if not m.get('enabled'):
        return None
    w = bool(m.get('inWorldSpace'))
    out = {
        'x': mmc(m['x']), 'y': mmc(m['y']), 'z': mmc(m['z'], neg=True),
        'ox': mmc(m['orbitalX'], neg=True), 'oy': mmc(m['orbitalY'], neg=True), 'oz': mmc(m['orbitalZ']),
        'offx': mmc(m['orbitalOffsetX']), 'offy': mmc(m['orbitalOffsetY']), 'offz': mmc(m['orbitalOffsetZ'], neg=True),
        'radial': mmc(m['radial']), 'speedMod': mmc(m['speedModifier']), 'world': 1 if w else 0,
    }
    return drop(out, {'x': 0, 'y': 0, 'z': 0, 'ox': 0, 'oy': 0, 'oz': 0, 'offx': 0, 'offy': 0, 'offz': 0,
                      'radial': 0, 'speedMod': 1, 'world': 0})


def norm_limit(m):
    if not m.get('enabled'):
        return None
    sep = bool(m.get('separateAxis'))
    out = {'sep': 1 if sep else 0, 'damp': rn(m['dampen']), 'drag': mmc(m['drag']),
           'dragSize': 1 if m.get('multiplyDragByParticleSize') else 0,
           'dragVel': 1 if m.get('multiplyDragByParticleVelocity') else 0,
           'world': 1 if m.get('inWorldSpace') else 0}
    if sep:
        out.update({'x': mmc(m['x']), 'y': mmc(m['y']), 'z': mmc(m['z'])})  # giới hạn độ lớn: không đổi dấu
    else:
        out['mag'] = mmc(m['magnitude'])
    return drop(out, {'sep': 0, 'damp': 1, 'drag': 0, 'dragSize': 1, 'dragVel': 1, 'world': 0})


def norm_force(m):
    if not m.get('enabled'):
        return None
    out = {'x': mmc(m['x']), 'y': mmc(m['y']), 'z': mmc(m['z'], neg=True),
           'world': 1 if m.get('inWorldSpace') else 0, 'randFrame': 1 if m.get('randomizePerFrame') else 0}
    return drop(out, {'x': 0, 'y': 0, 'z': 0, 'world': 0, 'randFrame': 0})


def norm_size(m):
    if not m.get('enabled'):
        return None
    if m.get('separateAxes'):
        return {'x': mmc(m['curve']), 'y': mmc(m['y']), 'z': mmc(m['z'])}
    return {'x': mmc(m['curve'])}


def norm_rotation(m):
    if not m.get('enabled'):
        return None
    if m.get('separateAxes'):
        return drop({'x': mmc(m['x'], neg=True), 'y': mmc(m['y'], neg=True), 'z': mmc(m['curve'])},
                    {'x': 0, 'y': 0})
    return {'z': mmc(m['curve'])}


def norm_uv(m):
    if not m.get('enabled'):
        return None
    out = {'tx': m['tilesX'], 'ty': m['tilesY'], 'anim': m['animationType'], 'time': m.get('timeMode', 0),
           'fps': rn(m.get('fps', 30)), 'fot': mmc(m['frameOverTime']), 'start': mmc(m['startFrame']),
           'cycles': rn(m['cycles']), 'row': m.get('rowIndex', 0), 'rowMode': m.get('rowMode', 1),
           'flipU': rn(m.get('flipU', 0)), 'flipV': rn(m.get('flipV', 0)), 'mode': m.get('mode', 0),
           'speedRange': [rn(m['speedRange']['x']), rn(m['speedRange']['y'])] if 'speedRange' in m else None}
    return drop(out, {'anim': 0, 'time': 0, 'fps': 30, 'start': 0, 'cycles': 1, 'row': 0, 'rowMode': 1,
                      'flipU': 0, 'flipV': 0, 'mode': 0, 'speedRange': [0, 1]})


def norm_custom(m):
    if not m.get('enabled'):
        return None
    out = []
    for i in (0, 1):
        mode = m.get('mode%d' % i, 0)
        if mode == 1:
            n = m.get('vectorComponentCount%d' % i, 4)
            out.append({'v': [mmc(m['vector%d_%d' % (i, j)]) for j in range(n)]})
        elif mode == 2:
            out.append({'c': mmg(m['color%d' % i])})
        else:
            out.append(None)
    if out == [None, None]:
        return None
    return out


def norm_trail(m):
    if not m.get('enabled'):
        return None
    out = {'mode': m.get('mode', 0), 'ratio': rn(m['ratio']), 'life': mmc(m['lifetime']),
           'minDist': rn(m['minVertexDistance']), 'texMode': m.get('textureMode', 0),
           'world': 1 if m.get('worldSpace') else 0, 'die': 1 if m.get('dieWithParticles') else 0,
           'sizeW': 1 if m.get('sizeAffectsWidth') else 0, 'sizeL': 1 if m.get('sizeAffectsLifetime') else 0,
           'inheritCol': 1 if m.get('inheritParticleColor') else 0,
           'colLife': mmg(m['colorOverLifetime']), 'width': mmc(m['widthOverTrail']),
           'colTrail': mmg(m['colorOverTrail']), 'ribbons': m.get('ribbonCount', 1)}
    return drop(out, {'mode': 0, 'ratio': 1, 'life': 1, 'minDist': 0.2, 'texMode': 0, 'world': 0, 'die': 1,
                      'sizeW': 1, 'sizeL': 0, 'inheritCol': 1, 'colLife': [1, 1, 1, 1], 'width': 1,
                      'colTrail': [1, 1, 1, 1], 'ribbons': 1})


def norm_lights_module(m, ctx):
    if not m.get('enabled'):
        return None
    li = None
    lp = m.get('light')
    if lp is not None and ctx.get('light_reader'):
        li = ctx['light_reader'](lp)
    out = {'ratio': rn(m['ratio']), 'rand': 1 if m.get('randomDistribution') else 0,
           'useCol': 1 if m.get('color') else 0, 'useRange': 1 if m.get('range') else 0,
           'useInt': 1 if m.get('intensity') else 0, 'range': mmc(m['rangeCurve']),
           'intensity': mmc(m['intensityCurve']), 'max': m.get('maxLights', 20), 'light': li}
    return out


# -------------------------------------------------------------- material --
SHADER_KIND = {
    'ArtTeam/VFX/VFX_Master_typeA': 'A',
    'ArtTeam/VFX/VFX_Master_typeB': 'B',
    'ArtTeam/VFX/VFX_Master_typeB_Dither': 'B',
    'ArtTeam/VFX/VFX_Master_typeB_forMesh': 'B',
    'ArtTeam/VFX/VFX_Master_typeB_Xpan': 'BX',
    'ArtTeam/VFX/VFX_Master_typeA_Trail': 'AT',
    'LCArt/VFX/Shader_VFX_Grabpass_Distortion': 'skip',
}
# thuộc tính giữ lại theo loại shader: tên Unity -> khoá JSON
A_FLOATS = {'_AlphaThreshold': 'thr', '_Pixelation': 'px', '_isColor': 'isColor', '_Main_Alpha': 'mainA',
            '_Main_Radial': 'radial', '_Use_Main_TilingOffset': 'useTO', '_Main_Rotate': 'mainRot',
            '_Dissolve_Rotate': 'disRot', '_Use_Dissolve_Green': 'disG', '_Dissolve_Offset_UV2y': 'disOff',
            '_Use_Dissolve_Alpha': 'disA', '_Use_Dissolve_Progress_Property': 'useDisP',
            '_Dissolve_Progress_UV2w': 'disP', '_Dissolve_Sharp': 'disSharp', '_DissovePower': 'disPow',
            '_DissolveEdge_Use': 'edge', '_DissolveEdge_Wide': 'edgeW', '_DissolveEdge_Sharp': 'edgeS',
            '_Deform_Time_Offset_UV2y': 'defOff', '_Deform_Strength_UV2x': 'defStr',
            '_Use_Deform_Str_Property': 'useDefStr', '_Mask_Rotate': 'maskRot',
            '_FresnelMask_Threshold': 'fresThr', '_FresnelMask_Offset': 'fresOff', '_Fresnel_Reverse': 'fresRev'}
A_FLOAT_DEF = {'thr': 0.5, 'px': 1, 'isColor': 1, 'mainA': 1, 'radial': 0, 'useTO': 0, 'mainRot': 0, 'disRot': 0,
               'disG': 0, 'disOff': 0, 'disA': 0, 'useDisP': 0, 'disP': 1, 'disSharp': 0, 'disPow': 1, 'edge': 0,
               'edgeW': 0, 'edgeS': 0, 'defOff': 0, 'defStr': 0, 'useDefStr': 0, 'maskRot': 0,
               'fresThr': 1, 'fresOff': 0, 'fresRev': 0}
A_COLORS = {'_MainColor': 'mainCol', '_Main_Offset_UV1xy': 'mainOff', '_DissolveDirection': 'disDir',
            '_DissolveEdge_Color': 'edgeCol', '_DeformDirection': 'defDir'}
B_FLOATS = {'_invertB': 'invB', '_InvertB': 'invB', '_Pixelation': 'px', '_AlphaClipThreshold': 'thr',
            '_FresnelPower': 'fresPow', '_isFresnel': 'fres', '_DissolveSharpness': 'disSharp'}
AT_FLOATS = {'_isColor': 'isColor', '_Emmisive': 'emis', '_MainTexFlowSpeed': 'flow', '_AlphaThreshold': 'thr'}
TEX_SLOTS = {'_MainTex': 'main', '_BaseMap': 'main', '_MaskTex': 'mask', '_DissolveTex': 'dis', '_DeformTex': 'def'}


class Ctx:
    def __init__(self):
        self.tex_done = {}    # tên ảnh -> {w,h,...}
        self.tex_key = {}     # (file cab, path_id) -> tên ảnh
        self.mesh_done = {}
        self.stats = {}

    def bump(self, k, n=1):
        self.stats[k] = self.stats.get(k, 0) + n


def texture_out(ctx, ptr, sheet=False):
    if ptr is None or ptr.path_id == 0:
        return None
    try:
        rd = ptr.deref()
    except FileNotFoundError as e:
        if any(b in str(e).lower() for b in vc.BUILTIN):
            return None
        raise
    key = (rd.assets_file.name, rd.path_id)
    if key in ctx.tex_key:
        return ctx.tex_key[key]
    tex = rd.read()
    if type(tex).__name__ != 'Texture2D':
        return None
    name = re.sub(r'[^A-Za-z0-9_.-]', '_', tex.m_Name)
    if name in ctx.tex_done and ctx.tex_done[name].get('key') != key:
        name = name + '_' + hashlib.md5(repr(key).encode()).hexdigest()[:6]
    ctx.tex_key[key] = name
    if name not in ctx.tex_done:
        ts = tex.m_TextureSettings
        info = {'key': key, 'w': tex.m_Width, 'h': tex.m_Height, 'wrapU': ts.m_WrapU, 'wrapV': ts.m_WrapV,
                'filter': ts.m_FilterMode, 'srgb': 1 if getattr(tex, 'm_ColorSpace', 1) == 1 else 0}
        path = os.path.join(OUT_TEX, name + '.webp')
        img = tex.image
        cap = TEX_MAX_SHEET if sheet else TEX_MAX
        w, h = img.size
        if max(w, h) > cap:
            s = cap / float(max(w, h))
            from PIL import Image
            img = img.resize((max(1, int(round(w * s))), max(1, int(round(h * s)))),
                             Image.NEAREST if ts.m_FilterMode == 0 else Image.LANCZOS)
        if img.mode not in ('RGBA', 'RGB'):
            img = img.convert('RGBA')
        # lossless: shader nhà dùng riêng từng kênh (R sáng, G dissolve, B màu phụ, A) - nén lossy
        # YUV 4:2:0 làm lem kênh G/B sang nhau.
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
        info['ow'], info['oh'] = img.size
        info['bytes'] = os.path.getsize(path)
        ctx.tex_done[name] = info
    elif sheet and ctx.tex_done[name]['w'] > TEX_MAX and ctx.tex_done[name].get('ow', 0) < min(TEX_MAX_SHEET, ctx.tex_done[name]['w']):
        # lần đầu gặp ở chỗ không phải flipbook: xuất lại lớn hơn
        del ctx.tex_done[name]
        del ctx.tex_key[key]
        return texture_out(ctx, ptr, sheet=True)
    return name


def material_out(ctx, mptr, sheet=False):
    try:
        mat = mptr.read()
    except FileNotFoundError as e:
        if any(b in str(e).lower() for b in vc.BUILTIN):
            return None
        raise
    shader_name = None
    try:
        sh = mat.m_Shader.read()
        pf = getattr(sh, 'm_ParsedForm', None)
        shader_name = (getattr(pf, 'm_Name', None) if pf else None) or sh.m_Name
    except FileNotFoundError as e:
        if not any(b in str(e).lower() for b in vc.BUILTIN):
            raise
    kind = SHADER_KIND.get(shader_name, 'U')
    ctx.bump('shader:' + str(shader_name))
    floats, colors, texs = {}, {}, {}
    for k, v in mat.m_SavedProperties.m_Floats:
        floats[k] = v
    for k, v in mat.m_SavedProperties.m_Colors:
        colors[k] = [v.r, v.g, v.b, v.a]
    for k, v in mat.m_SavedProperties.m_TexEnvs:
        texs[k] = v
    kws = list(getattr(mat, 'm_ValidKeywords', None) or [])
    if not kws and isinstance(getattr(mat, 'm_ShaderKeywords', None), str):
        kws = mat.m_ShaderKeywords.split()
    out = {'name': mat.m_Name, 'sh': kind, 'shader': shader_name}
    out['blend'] = [int(floats.get('_SrcBlend', 5)), int(floats.get('_DstBlend', 10))]
    surf = floats.get('_Surface', 1)
    if '_SURFACE_TYPE_TRANSPARENT' in kws:
        surf = 1
    out['surf'] = int(surf)
    clip = floats.get('_AlphaClip', 0) >= 0.5 or '_ALPHATEST_ON' in kws
    out['clip'] = 1 if clip else 0
    out['zt'] = int(floats.get('_ZTest', 4))
    out['cull'] = int(floats.get('_Cull', 0 if kind != 'U' else 2))
    out['queue'] = int(floats.get('_QueueOffset', 0))
    tx = {}
    for slot, key in TEX_SLOTS.items():
        te = texs.get(slot)
        if te is None:
            continue
        nm = texture_out(ctx, te.m_Texture, sheet=(sheet and key == 'main'))
        if nm is None:
            continue
        st = [rn(te.m_Scale.x), rn(te.m_Scale.y), rn(te.m_Offset.x), rn(te.m_Offset.y)]
        e = {'t': nm}
        if st != [1, 1, 0, 0]:
            e['st'] = st
        tx[key] = e
    out['tex'] = tx
    if kind == 'A':
        out['kw'] = [k for k in ('_USE_SECONDARYCOLOR', '_DEFORM_USE', '_MASK_USE') if k in kws or floats.get(k, 0) >= 0.5]
        # _DEFORM_USE/_MASK_USE mặc định bật trong shader (=1); nếu vật liệu cũ không có khoá, dựa vào float
        f = {}
        for uk, jk in A_FLOATS.items():
            if uk in floats:
                f[jk] = rn(floats[uk])
        out['f'] = drop(f, A_FLOAT_DEF)
        c = {}
        for uk, jk in A_COLORS.items():
            if uk in colors:
                c[jk] = [rn(x) for x in colors[uk]]
        out['c'] = drop(c, {'mainCol': [1, 1, 1, 1], 'mainOff': [0, 0, 0, 0], 'disDir': [0, 0, 0, 0],
                            'defDir': [0, 0, 0, 0]})
        if not out['c'].get('edgeCol') or not f.get('edge'):
            out['c'].pop('edgeCol', None)
    elif kind in ('B', 'BX'):
        f = {}
        for uk, jk in B_FLOATS.items():
            if uk in floats:
                f[jk] = rn(floats[uk])
        out['f'] = drop(f, {'invB': 0, 'px': 1, 'thr': 0.5, 'fresPow': 2, 'fres': 0, 'disSharp': 1})
    elif kind == 'AT':
        f = {}
        for uk, jk in AT_FLOATS.items():
            if uk in floats:
                f[jk] = rn(floats[uk])
        out['f'] = f
        if '_MainColor' in colors:
            out['c'] = {'mainCol': [rn(x) for x in colors['_MainColor']]}
    else:
        col = colors.get('_BaseColor') or colors.get('_Color') or colors.get('_TintColor')
        if col:
            out['c'] = {'mainCol': [rn(x) for x in col]}
        if 'Mobile/Particles' in str(shader_name) or 'Alpha Blended' in str(shader_name):
            out['blend'] = [5, 10]
            out['surf'] = 1
        if 'Additive' in str(shader_name):
            out['blend'] = [5, 1]
            out['surf'] = 1
        if floats.get('_Cutoff') is not None and clip:
            out['f'] = {'thr': rn(floats['_Cutoff'])}
    for k in ('kw', 'f', 'c', 'tex'):
        if k in out and not out[k]:
            del out[k]
    return out


# ------------------------------------------------------------------ mesh --
def mesh_out(ctx, mptr):
    if mptr is None or mptr.path_id == 0:
        return None
    try:
        rd = mptr.deref()
    except FileNotFoundError as e:
        if any(b in str(e).lower() for b in vc.BUILTIN):
            return None
        raise
    key = (rd.assets_file.name, rd.path_id)
    if key in ctx.mesh_done:
        return ctx.mesh_done[key]
    mesh = rd.read()
    from UnityPy.helpers.MeshHelper import MeshHandler
    h = MeshHandler(mesh)
    h.process()
    if not h.m_VertexCount:
        ctx.mesh_done[key] = None
        return None
    name = re.sub(r'[^A-Za-z0-9_.-]', '_', mesh.m_Name) or 'mesh'
    used = {v for v in ctx.mesh_done.values() if v}
    if name in used:
        name = name + '_' + hashlib.md5(repr(key).encode()).hexdigest()[:6]
    pos = []
    verts = h.m_Vertices
    # m_Vertices có thể là list phẳng hoặc list tuple tuỳ phiên bản
    if verts and isinstance(verts[0], (list, tuple)):
        verts = [c for vv in verts for c in vv]
    n = h.m_VertexCount
    stride = len(verts) // n
    for i in range(n):
        x, y, z = verts[i * stride], verts[i * stride + 1], verts[i * stride + 2]
        pos += [rn(x, 4), rn(y, 4), rn(-z, 4)]
    uv = []
    uvs = h.m_UV0
    if uvs:
        if isinstance(uvs[0], (list, tuple)):
            uvs = [c for vv in uvs for c in vv]
        us = len(uvs) // n
        for i in range(n):
            uv += [rn(uvs[i * us], 4), rn(uvs[i * us + 1], 4)]
    col = []
    cs = h.m_Colors
    if cs:
        if isinstance(cs[0], (list, tuple)):
            cs = [c for vv in cs for c in vv]
        cst = len(cs) // n
        allwhite = True
        for i in range(n):
            cc = [cs[i * cst + j] for j in range(4)]
            cc = [c / 255.0 if isinstance(c, int) or c > 1.001 else c for c in cc]
            if any(abs(c - 1) > 1e-3 for c in cc):
                allwhite = False
            col += [rn(c, 3) for c in cc]
        if allwhite:
            col = []
    idx = []
    for sub in h.get_triangles():
        for tri in sub:
            a, b, c = tri
            idx += [a, c, b]  # đảo chiều vì đã lật z
    out = {'name': name, 'pos': pos, 'idx': idx}
    if uv:
        out['uv'] = uv
    if col:
        out['col'] = col
    with io.open(os.path.join(OUT_MESH, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    ctx.mesh_done[key] = name
    ctx.bump('meshes')
    return name


# ------------------------------------------------------------ renderer --
def norm_renderer(ctx, rtt, robj, uvmod):
    if not rtt.get('m_Enabled', True):
        return {'mode': 5}
    mode = rtt['m_RenderMode']
    out = {'mode': mode}
    sheet = bool(uvmod and uvmod.get('tx', 1) * uvmod.get('ty', 1) >= 4)
    mats = []
    for mp in robj.m_Materials:
        if mp is None or mp.path_id == 0:
            mats.append(None)
            continue
        mats.append(material_out(ctx, mp, sheet=sheet))
    out['mat'] = mats[0] if mats else None
    if len(mats) > 1 and mats[1]:
        out['trailMat'] = mats[1]
    if mode == 1:
        out['vs'] = rn(rtt['m_VelocityScale'])
        out['ls'] = rn(rtt['m_LengthScale'])
        out['cvs'] = rn(rtt['m_CameraVelocityScale'])
        if rtt.get('m_FreeformStretching'):
            out['freeform'] = 1
    if mode == 4:
        mn = mesh_out(ctx, robj.m_Mesh)
        if mn is None:
            out['mesh'] = 'quad'  # Quad dựng sẵn của Unity
        else:
            out['mesh'] = mn
    out['align'] = rtt.get('m_RenderAlignment', 0)
    pv = rtt.get('m_Pivot', {'x': 0, 'y': 0, 'z': 0})
    out['pivot'] = v3m(pv) if mode == 4 else v3(pv)
    fl = rtt.get('m_Flip', {'x': 0, 'y': 0, 'z': 0})
    out['flip'] = v3(fl)
    out['minSz'] = rn(rtt.get('m_MinParticleSize', 0))
    out['maxSz'] = rn(rtt.get('m_MaxParticleSize', 0.5))
    out['fudge'] = rn(rtt.get('m_SortingFudge', 0))
    out['order'] = rtt.get('m_SortingOrder', 0)
    out['sort'] = rtt.get('m_SortMode', 0)
    out['slots'] = stream_slots(rtt)
    return drop(out, {'align': 0, 'pivot': [0, 0, 0], 'flip': [0, 0, 0], 'minSz': 0, 'maxSz': 0.5, 'fudge': 0,
                      'order': 0, 'sort': 0, 'slots': None, 'cvs': 0})


# ------------------------------------------------------------ particle --
UNSUPPORTED = ('NoiseModule', 'CollisionModule', 'ExternalForcesModule', 'InheritVelocityModule',
               'SizeBySpeedModule', 'RotationBySpeedModule', 'ColorBySpeedModule', 'TriggerModule',
               'LifetimeByEmitterSpeedModule')


def norm_ps(ctx, tt, rtt, robj, node_idx, name):
    im = tt['InitialModule']
    size3 = bool(im.get('size3D'))
    rot3 = bool(im.get('rotation3D'))
    ps = {'node': node_idx, 'name': name}
    ps['dur'] = rn(tt['lengthInSec'])
    ps['loop'] = 1 if tt.get('looping') else 0
    ps['prewarm'] = 1 if tt.get('prewarm') else 0
    ps['delay'] = mmc(tt['startDelay'])
    ps['simSpeed'] = rn(tt.get('simulationSpeed', 1))
    ps['space'] = tt.get('moveWithTransform', 0)  # 0 local, 1 world, 2 custom
    ps['scaling'] = tt.get('scalingMode', 1)       # 0 hierarchy, 1 local, 2 shape
    ps['stopAction'] = tt.get('stopAction', 0)
    ps['life'] = mmc(im['startLifetime'])
    ps['speed'] = mmc(im['startSpeed'])
    if size3:
        ps['size3'] = [mmc(im['startSize']), mmc(im['startSizeY']), mmc(im['startSizeZ'])]
    else:
        ps['size'] = mmc(im['startSize'])
    if rot3:
        ps['rot3'] = [mmc(im['startRotationX'], neg=True), mmc(im['startRotationY'], neg=True), mmc(im['startRotation'])]
    else:
        ps['rot'] = mmc(im['startRotation'])
    ps['flipRot'] = rn(im.get('randomizeRotationDirection', 0))
    ps['color'] = mmg(im['startColor'])
    ps['grav'] = mmc(im['gravityModifier'])
    ps['max'] = im.get('maxNumParticles', 1000)
    ps['emit'] = norm_emission(tt['EmissionModule'])
    ps['shape'] = norm_shape(tt['ShapeModule'])
    ps['vel'] = norm_velocity(tt['VelocityModule'])
    ps['limit'] = norm_limit(tt['ClampVelocityModule'])
    ps['force'] = norm_force(tt['ForceModule'])
    ps['col'] = mmg(tt['ColorModule']['gradient']) if tt['ColorModule'].get('enabled') else None
    ps['sizeLife'] = norm_size(tt['SizeModule'])
    ps['rotLife'] = norm_rotation(tt['RotationModule'])
    ps['uv'] = norm_uv(tt['UVModule'])
    ps['cd'] = norm_custom(tt.get('CustomDataModule', {}))
    ps['trail'] = norm_trail(tt.get('TrailModule', {}))
    ps['lightsMod'] = norm_lights_module(tt.get('LightsModule', {}), ctx.__dict__)
    sub = tt.get('SubModule', {})
    if sub.get('enabled'):
        ps['sub'] = [s.get('type', 0) for s in sub.get('subEmitters', [])]
    uns = [k for k in UNSUPPORTED if tt.get(k, {}).get('enabled')]
    if uns:
        ps['skipped'] = uns
    ps['r'] = norm_renderer(ctx, rtt, robj, ps['uv'])
    # thống kê module
    for k in ('emit', 'shape', 'vel', 'limit', 'force', 'col', 'sizeLife', 'rotLife', 'uv', 'cd', 'trail',
              'lightsMod', 'sub'):
        if ps.get(k) and not (k == 'emit' and ps[k].get('off')):
            ctx.bump('mod:' + k)
    for k in uns:
        ctx.bump('skip:' + k)
    ctx.bump('render:%d' % ps['r']['mode'])
    if ps['shape']:
        ctx.bump('shape:%d' % ps['shape'].get('type', 4))
    ctx.bump('systems')
    return drop(ps, {'loop': 0, 'prewarm': 0, 'delay': 0, 'simSpeed': 1, 'space': 0, 'scaling': 1,
                     'stopAction': 0, 'flipRot': 0, 'color': [1, 1, 1, 1], 'grav': 0, 'max': 1000, 'rot': 0,
                     'rot3': [0, 0, 0]})


# ------------------------------------------------------------ others --
def light_out(tt):
    c = tt['m_Color']
    out = {'type': tt.get('m_Type', 2), 'color': [rn(c['r']), rn(c['g']), rn(c['b'])],
           'intensity': rn(tt.get('m_Intensity', 1)), 'range': rn(tt.get('m_Range', 10)),
           'enabled': 1 if tt.get('m_Enabled', True) else 0}
    if out['type'] == 0:
        out['spot'] = rn(tt.get('m_SpotAngle', 30))
    return out


def trail_renderer_out(ctx, tt, robj):
    wc = tt.get('m_Parameters', {})
    out = {'time': rn(tt.get('m_Time', 0)), 'minDist': rn(tt.get('m_MinVertexDistance', 0.1)),
           'autodestruct': 1 if tt.get('m_Autodestruct') else 0, 'emitting': 1 if tt.get('m_Emitting', True) else 0}
    if wc:
        out['width'] = rn(wc.get('widthMultiplier', 1))
        out['widthCurve'] = curve_keys(wc.get('widthCurve', {}))
        g = wc.get('colorGradient')
        if g:
            out['grad'] = grad(g)
        out['texMode'] = wc.get('textureMode', 0)
        out['align'] = wc.get('alignment', 0)
    mats = [material_out(ctx, mp) for mp in robj.m_Materials if mp is not None and mp.path_id != 0]
    out['mat'] = mats[0] if mats else None
    ctx.bump('trailRenderers')
    return out


def _crc(s):
    return zlib.crc32(s.encode('utf-8')) & 0xffffffff


# thuộc tính animator được hỗ trợ (typeID, crc32 tên) -> khoá JSON. Đo toàn bundle: typeID 198
# EmissionModule.enabled (515 binding), 1 m_IsActive (103), Transform (211), CustomData scalar (~45).
ANIM_PROPS = {(1, _crc('m_IsActive')): 'active', (198, _crc('EmissionModule.enabled')): 'emit'}
for _k in range(2):
    for _q in range(4):
        ANIM_PROPS[(198, _crc('CustomDataModule.vector%d_%d.scalar' % (_k, _q)))] = 'cd%d_%d' % (_k, _q)
TF_SIZE = {1: 3, 2: 4, 3: 3, 4: 3}      # Transform: 1 vị trí, 2 quaternion, 3 scale, 4 euler (độ)
TF_NAME = {1: 'pos', 2: 'rot', 3: 'scl', 4: 'rot'}
ANIM_RATE = 30.0


class MuscleCurves:
    """Giải AnimationClip đã biên dịch (m_MuscleClip): streamed (đa thức bậc 3 từng đoạn), dense (mẫu đều),
    constant. Thứ tự chỉ số đường cong: streamed, rồi dense, rồi constant (giống AssetStudio)."""

    def __init__(self, clip_tt, total):
        cd = clip_tt['m_MuscleClip']['m_Clip']['data']
        sc, dc, cc = cd['m_StreamedClip'], cd['m_DenseClip'], cd['m_ConstantClip']
        self.dense_n = dc.get('m_CurveCount', 0)
        self.const = list(cc.get('data', []))
        self.stream_n = sc.get('curveCount', total - self.dense_n - len(self.const))
        self.dense = dc
        self.keys = {}
        raw = sc.get('data', [])
        buf = struct.pack('<%dI' % len(raw), *raw)
        pos, n = 0, len(raw)
        while pos + 2 <= n:
            t = struct.unpack_from('<f', buf, pos * 4)[0]
            cnt = raw[pos + 1]
            pos += 2
            for _ in range(cnt):
                if pos + 5 > n:
                    break
                ci = raw[pos]
                co = struct.unpack_from('<4f', buf, (pos + 1) * 4)
                self.keys.setdefault(ci, []).append((t, co))
                pos += 5

    def value(self, ci, t):
        if ci < self.stream_n:
            ks = self.keys.get(ci)
            if not ks:
                return 0.0
            k = ks[0]
            for kk in ks:
                if kk[0] <= t:
                    k = kk
                else:
                    break
            dt = t - k[0] if k[0] > -1e30 else 0.0
            c = k[1]
            return ((c[0] * dt + c[1]) * dt + c[2]) * dt + c[3]
        ci -= self.stream_n
        if ci < self.dense_n:
            d = self.dense
            fc = d['m_FrameCount']
            f = (t - d['m_BeginTime']) * d['m_SampleRate']
            f = max(0.0, min(f, fc - 1))
            i0 = int(math.floor(f))
            i1 = min(i0 + 1, fc - 1)
            a = d['m_SampleArray'][i0 * self.dense_n + ci]
            b = d['m_SampleArray'][i1 * self.dense_n + ci]
            return a + (b - a) * (f - i0)
        ci -= self.dense_n
        return self.const[ci] if ci < len(self.const) else 0.0


def anim_export(ctx, animator, anim_node, nodes):
    """Animator -> {def, states, clips}: mỗi clip là các track lấy mẫu 30 Hz theo node (toạ độ three).
    Track: {n: node, p: pos|rot|scl|active|emit|cdK_Q, v: mẫu phẳng | c: hằng | s: [t, 0/1, ...] bậc thang}."""
    try:
        ctrl_rd = animator.m_Controller.deref()
    except FileNotFoundError as e:
        if any(b in str(e).lower() for b in vc.BUILTIN):
            return None
        raise
    except Exception:
        return None
    ct = ctrl_rd.read_typetree()
    ctrl = ctrl_rd.read()
    tos = dict((int(k), v) for k, v in ct.get('m_TOS', []))
    kids = {}
    for i, n in enumerate(nodes):
        kids.setdefault(n['p'], []).append(i)
    pathmap = {_crc(''): anim_node}

    def walkp(i, pre):
        for c in kids.get(i, []):
            p = (pre + '/' if pre else '') + nodes[c]['n']
            pathmap[_crc(p)] = c
            walkp(c, p)
    walkp(anim_node, '')
    clips = []
    for cp in ctrl.m_AnimationClips:
        crd = cp.deref()
        tt = crd.read_typetree()
        binds = tt['m_ClipBindingConstant']['genericBindings']
        total = sum(TF_SIZE.get(b['attribute'], 1) if b['typeID'] == 4 else 1 for b in binds)
        mc = MuscleCurves(tt, total)
        m = tt['m_MuscleClip']
        t0, t1 = m.get('m_StartTime', 0), m.get('m_StopTime', 0)
        length = max(0.0, t1 - t0)
        ns = max(1, int(math.ceil(length * ANIM_RATE)) + 1)
        times = [t0 + min(length, i / ANIM_RATE) for i in range(ns)]
        tracks = []
        ci = 0
        for b in binds:
            tid, attr = b['typeID'], b['attribute']
            size = TF_SIZE.get(attr, 1) if tid == 4 else 1
            node = pathmap.get(b['path'] & 0xffffffff)
            base = ci
            ci += size
            prop = TF_NAME.get(attr) if tid == 4 else ANIM_PROPS.get((tid, attr & 0xffffffff))
            if node is None or prop is None:
                ctx.bump('animSkip:%d/%s' % (tid, prop or attr))
                continue
            if tid == 4 and nodes[node]['p'] < 0 and prop in ('pos', 'rot'):
                continue   # gốc prefab: vị trí/hướng do chỗ spawn quyết
            vals = []
            for t in times:
                v = [mc.value(base + k, t) for k in range(size)]
                if tid == 4 and attr == 1:
                    v = [v[0], v[1], -v[2]]
                elif tid == 4 and attr == 2:
                    ln = math.sqrt(sum(x * x for x in v)) or 1
                    v = [-v[0] / ln, -v[1] / ln, v[2] / ln, v[3] / ln]
                elif tid == 4 and attr == 4:
                    q = euler_to_quat(v[0], v[1], v[2])
                    v = [-q['x'], -q['y'], q['z'], q['w']]
                vals.append([rn(x) for x in v])
            tr = {'n': node, 'p': prop}
            if prop in ('active', 'emit'):
                steps, last = [], None
                for t, v in zip(times, vals):
                    b01 = 1 if v[0] > 0.5 else 0
                    if b01 != last:
                        steps += [rn(t - t0), b01]
                        last = b01
                tr['s'] = steps
            elif all(v == vals[0] for v in vals):
                tr['c'] = vals[0] if size > 1 else vals[0][0]
            else:
                tr['v'] = [x for v in vals for x in v] if size > 1 else [v[0] for v in vals]
            tracks.append(tr)
        loop = 1 if m.get('m_LoopTime') else 0
        clips.append({'name': tt['m_Name'], 'len': rn(length), 'loop': loop, 'rate': ANIM_RATE, 'tracks': tracks})
        ctx.bump('animClips')
    sm = ct['m_Controller']['m_StateMachineArray'][0]['data']
    states = []
    for s in sm['m_StateConstantArray']:
        sd = s['data']
        clip_ids = [nd['data']['m_ClipID'] for b in sd['m_BlendTreeConstantArray'] for nd in b['data']['m_NodeArray']]
        st = {'name': tos.get(sd['m_NameID'], str(sd['m_NameID'])), 'clip': clip_ids[0] if clip_ids else -1,
              'speed': rn(sd.get('m_Speed', 1))}
        for tr in sd['m_TransitionConstantArray']:
            td = tr['data']
            if td.get('m_HasExitTime') and not td['m_ConditionConstantArray']:
                st['next'] = td['m_DestinationState']
                st['exit'] = rn(td.get('m_ExitTime', 1))
                break
        states.append(st)
    return {'def': sm.get('m_DefaultState', 0), 'states': states, 'clips': clips}


# --------------------------------------------------------------- prefab --
def export_prefab(ctx, env, go_obj, out_name):
    nodes, systems, trails, lights, notes, animators = [], [], [], [], [], []
    extra = {}

    def walk(go, parent):
        tf = None
        comps = []
        for cp in go.m_Component:
            ptr = cp.component
            try:
                c = ptr.read()
            except FileNotFoundError:
                raise
            except Exception as e:
                notes.append('đọc component lỗi: %s' % str(e)[:80])
                continue
            tn = type(c).__name__
            if tn in ('Transform', 'RectTransform'):
                tf = c
            comps.append((tn, c, ptr))
        idx = len(nodes)
        node = {'n': go.m_Name, 'p': parent}
        if tf is not None:
            lp, lr, ls = tf.m_LocalPosition, tf.m_LocalRotation, tf.m_LocalScale
            pos = [rn(lp.x), rn(lp.y), rn(-lp.z)]
            rot = [rn(-lr.x), rn(-lr.y), rn(lr.z), rn(lr.w)]
            scl = [rn(ls.x), rn(ls.y), rn(ls.z)]
            if pos != [0, 0, 0]:
                node['pos'] = pos
            if rot != [0, 0, 0, 1]:
                node['rot'] = rot
            if scl != [1, 1, 1]:
                node['scl'] = scl
        if not go.m_IsActive:
            node['off'] = 1
        nodes.append(node)
        by = {}
        for tn, c, ptr in comps:
            by.setdefault(tn, []).append((c, ptr))
        if 'ParticleSystem' in by:
            ps_c, ps_ptr = by['ParticleSystem'][0]
            tt = ps_ptr.read_typetree()
            if 'ParticleSystemRenderer' in by:
                r_c, r_ptr = by['ParticleSystemRenderer'][0]
                rtt = r_ptr.read_typetree()
            else:
                r_c, rtt = None, {'m_Enabled': False, 'm_RenderMode': 5}
            if r_c is None:
                class _R:
                    m_Materials = []
                    m_Mesh = None
                r_c = _R()
            sysd = norm_ps(ctx, tt, rtt, r_c, idx, go.m_Name)
            systems.append(sysd)
        for c, ptr in by.get('TrailRenderer', []):
            t = trail_renderer_out(ctx, ptr.read_typetree(), c)
            t['node'] = idx
            trails.append(t)
        for c, ptr in by.get('Light', []):
            li = light_out(ptr.read_typetree())
            li['node'] = idx
            lights.append(li)
            ctx.bump('lights')
        for c, ptr in by.get('Animator', []):
            animators.append((c, idx))
            ctx.bump('animators')
        for c, ptr in by.get('MonoBehaviour', []):
            try:
                cls = c.m_Script.read().m_ClassName
            except FileNotFoundError:
                raise
            except Exception:
                cls = '?'
            ctx.bump('script:' + cls)
            if cls == 'EffectShaderASecondColor':
                d = ptr.read_typetree()
                g = d.get('secondaryGradient')
                if g:
                    node['grad2'] = grad(g)
            elif cls == 'SimpleAnimatorDelay':
                d = ptr.read_typetree()
                node['animDelay'] = {k: rn(v) if isinstance(v, float) else v for k, v in d.items()
                                     if not k.startswith('m_') and isinstance(v, (int, float))}
        for tn in ('MeshRenderer', 'SpriteRenderer', 'SkinnedMeshRenderer'):
            if tn in by:
                notes.append('%s trên %s: chưa phát' % (tn, go.m_Name))
                ctx.bump('skip:' + tn)
        if tf is not None:
            for chp in tf.m_Children:
                ch_tf = chp.read()
                walk(ch_tf.m_GameObject.read(), idx)

    walk(go_obj.read(), -1)
    anims = []
    for c, idx in animators:
        a = anim_export(ctx, c, idx, nodes)
        if a:
            a['node'] = idx
            d = nodes[idx].pop('animDelay', None)
            if d:
                a['delayCfg'] = d
            anims.append(a)
    # nối grad2 (EffectShaderASecondColor) vào hệ hạt cùng node
    for s in systems:
        g2 = nodes[s['node']].pop('grad2', None) if 'grad2' in nodes[s['node']] else None
        if g2:
            s['grad2'] = g2
    # thời lượng ước: max(delay + dur + life) của hệ không lặp
    def mx(v):
        if isinstance(v, (int, float)):
            return v
        if isinstance(v, list):
            return max(v)
        if isinstance(v, dict):
            ks = v.get('k', [])
            vals = ks[1::4] + v.get('k0', [])[1::4]
            return v.get('m', 1) * (max(vals) if vals else 0)
        return 0
    total, looping = 0, False
    for s in systems:
        if s.get('loop'):
            looping = True
        if s['r'].get('mode') == 5 and not s.get('trail'):
            continue
        total = max(total, mx(s.get('delay', 0)) + s['dur'] + mx(s['life']))
    doc = {'v': 1, 'name': out_name, 'nodes': nodes, 'systems': systems}
    if trails:
        doc['trails'] = trails
    if lights:
        doc['lights'] = lights
    if anims:
        doc['anims'] = anims
    doc['len'] = rn(total)
    if looping:
        doc['loop'] = 1
    if notes:
        doc['notes'] = notes
    return doc


# ------------------------------------------------------------- tên gom --
def load_json(name):
    return json.load(io.open(os.path.join(REF_JSON, name + '.json'), encoding='utf-8'))


VFX_KEY = re.compile(r'(^|[a-z_])(vfx|prefab)$', re.I)
NAME_SKIP_KEYS = re.compile(r'(duration|offset|bone|speeds?|type|loop|pos|delay)$', re.I)


WORLD_FX = ['Trap_Box_Damage', 'Trap_Box_Damage_Hit', 'Trap_Box_Explosion_Delay', 'Trap_Box_San',
            'Trap_Box_Stress_GroundAttack', 'Trap_ConfuseGas', 'Trap_Explosion', 'Trap_GroundOver', 'Trap_PoisionGas',
            '03_Trap01', '03_Trap01_Hit_Burst', '03_Trap01_Hit_Loop', 'DropItemFX_Quest']


def collect_referenced(chars=(100001, 100003, 100004, 100005), monsters=None):
    if monsters is None:
        monsters = list(range(200001, 200041)) + [220009, 300022, 810001, 300014, 301014]
    skills = {r['Id']: r for r in load_json('Skill')}
    hitboxes = {r['Id']: r for r in load_json('HitBox')}
    buffs = {r['Id']: r for r in load_json('Buff')}
    buffvfx = {}
    for r in load_json('BuffVfx'):
        buffvfx.setdefault(r['BuffId'], []).append(r)
    mons = {r['Id']: r for r in load_json('Monster')}
    extra = {r['Id']: r for r in load_json('ExtraUnit')}
    charrows = {r['Id']: r for r in load_json('Character')}
    names = {}   # tên -> tập nguồn
    seen = set()
    todo = []

    def add_name(v, src):
        if not isinstance(v, str):
            return
        v = v.strip()
        if not v or v in ('None', 'null') or not re.search(r'[A-Za-z]', v) or re.fullmatch(r'[\d.:\-]+', v):
            return
        names.setdefault(v, set()).add(src)

    def walk(v, src):
        if isinstance(v, dict):
            t = str(v.get('$type', ''))
            if 'HitBox' in t and isinstance(v.get('Id'), int):
                todo.append(('hb', v['Id'], src))   # HitBoxEvent/HitBoxIteratorEvent trỏ HitBox qua "Id"
            for k, x in v.items():
                kl = k.lower()
                if isinstance(x, str) and VFX_KEY.search(k) and not NAME_SKIP_KEYS.search(k):
                    add_name(x, src)
                elif kl in ('hitboxid', 'destroyhitboxid', 'hitboxids', 'targetablehitboxid'):
                    for i in (x if isinstance(x, list) else [x]):
                        if isinstance(i, int) and i > 0:
                            todo.append(('hb', i, src))
                elif kl in ('buffid', 'targetbuffid', 'buffids'):
                    for i in (x if isinstance(x, list) else [x]):
                        if isinstance(i, int) and i > 0:
                            todo.append(('buff', i, src))
                elif kl in ('skillid', 'skillids', 'replacementskillid'):
                    for i in (x if isinstance(x, list) else [x]):
                        if isinstance(i, int) and i > 0:
                            todo.append(('skill', i, src))
                elif kl in ('extraunitidondestroy', 'extraunitid'):
                    for i in (x if isinstance(x, list) else [x]):
                        if isinstance(i, int) and i > 0:
                            todo.append(('extra', i, src))
                elif kl == 'monsterinfos' and isinstance(x, list):   # SummonActionEvent
                    for mi in x:
                        if isinstance(mi, dict) and isinstance(mi.get('Id'), int):
                            todo.append(('mon', mi['Id'], src))
                elif kl in ('monsterid', 'monsterids'):
                    for i in (x if isinstance(x, list) else [x]):
                        if isinstance(i, int) and i > 0:
                            todo.append(('mon', i, src))
                else:
                    walk(x, src)
        elif isinstance(v, list):
            for x in v:
                walk(x, src)

    # bẫy (Trap.HitBoxIds) và vùng đặc biệt (SpecialField: buff gắn cho người/quái)
    for r in load_json('Trap'):
        for h in r.get('HitBoxIds') or []:
            todo.append(('hb', h, 'Trap%d' % r['Id']))
    for r in load_json('SpecialField'):
        for k in ('CharacterBuffId', 'MonsterBuffId', 'CharacterStackBuffId', 'MonsterStackBuffId'):
            if (r.get(k) or 1) > 1:
                todo.append(('buff', r[k], 'SpecialField%d' % r['Id']))
    for cid in chars:
        c = charrows.get(cid)
        if not c:
            continue
        ids = [c.get('AttackSkillId'), c.get('DashSkillId'), c.get('PolymorphAttackSkillId'), c.get('PolymorphDashSkillId')]
        ids += (c.get('ActiveSkillIds') or []) + (c.get('PolymorphActiveSkillIds') or []) + (c.get('PassiveSkillIds') or [])
        for i in ids:
            if i:
                todo.append(('skill', i, 'char%d' % cid))
    for mid in monsters:
        todo.append(('mon', mid, 'mon%d' % mid))
    while todo:
        kind, i, src = todo.pop()
        if (kind, i) in seen:
            continue
        seen.add((kind, i))
        if kind == 'skill' and i in skills:
            walk(skills[i].get('RootActionNode'), src)
            walk(skills[i].get('DeactivateBuffCondition'), src)
        elif kind == 'hb' and i in hitboxes:
            walk(hitboxes[i], src)
        elif kind == 'buff' and i in buffs:
            walk(buffs[i], src)
            for r in buffvfx.get(i, []):
                add_name(r.get('Vfx'), src)
                add_name(r.get('DotVfx'), src)
        elif kind == 'mon' and i in mons:
            m = mons[i]
            add_name(m.get('SpawnVfx'), src)
            for s in (m.get('ActiveSkillIds') or []) + (m.get('PassiveSkillIds') or []):
                todo.append(('skill', s, src))
            for b in (m.get('OnCombatBuffIds') or []) + (m.get('OnCuriousBuffIds') or []):
                todo.append(('buff', b, src))
            for b in (m.get('LightBuffId') or []) + (m.get('LightStackBuffId') or []):
                todo.append(('buff', b, src))
        elif kind == 'extra' and i in extra:     # đơn vị phụ (bom đồ chơi của Mio, ...)
            e = extra[i]
            for sk in (e.get('ActiveSkillIds') or []) + (e.get('PassiveSkillIds') or []) + \
                    [e.get('AttackSkillId'), e.get('ActionSkillId')]:
                if sk:
                    todo.append(('skill', sk, src))
    # hiệu ứng trạng thái/buff: lấy hết, không lọc theo nhân vật (buff nào cũng có thể dính)
    for r in load_json('BuffVfx'):
        add_name(r.get('Vfx'), 'BuffVfx')
        add_name(r.get('DotVfx'), 'BuffVfx')
    for r in load_json('Buff'):
        add_name(r.get('Vfx'), 'Buff')
    for r in load_json('StatusEffectTag'):
        add_name(r.get('Vfx'), 'StatusEffectTag.' + r['Tag'])
        add_name(r.get('DotVfx'), 'StatusEffectTag.' + r['Tag'])
    for r in mons.values():
        add_name(r.get('SpawnVfx'), 'Monster.SpawnVfx')
    # VFX của đồ vật thế giới không qua bảng: bẫy đặt trong sector (Trap_Box_*, Trap_GroundOver, 03_Trap01*),
    # đồ rơi nhiệm vụ. Lấy theo tiền tố tên prefab (resolve() chỉ nhận tên khớp đúng).
    for x in WORLD_FX:
        names.setdefault(x, set()).add('world')
    # tên VFX gọi thẳng trong mã C# (chuỗi literal của global-metadata.dat)
    try:
        import fx_code_names
        _, lits = fx_code_names.literals()
        for x in lits:
            if x.startswith(('Common/', 'Status/', 'Buff/')) or '/' not in x:
                names.setdefault(x, set()).add('code')   # resolve() lọc tên không phải prefab
    except Exception as e:   # không có metadata: bỏ qua, in ra
        print('  (không đọc được global-metadata.dat: %s)' % e)
    return names


# ------------------------------------------------------------- khớp tên --
ELEMENTS = ('None', 'Fire', 'Water', 'Wind')


def build_prefab_map(env, bundle):
    """tên GameObject gốc -> [ObjectReader] (có tên trùng)."""
    m = {}
    sfs = vc.serialized_files(env, bundle)
    sfset = set(id(s) for s in sfs)
    for o in env.objects:
        if o.type.name != 'AssetBundle' or id(o.assets_file) not in sfset:
            continue
        ab = o.read()
        byid = {ob.path_id: ob for ob in o.assets_file.objects.values()}
        for k, info in ab.m_Container:
            ob = byid.get(info.asset.path_id)
            if ob is None or ob.type.name != 'GameObject':
                continue
            try:
                nm = ob.peek_name()
            except Exception:
                nm = ob.read().m_Name
            lst = m.setdefault(nm, [])
            if all(x.path_id != ob.path_id for x in lst):
                lst.append(ob)
    return m


def resolve(ref, pmap, lower):
    """ref (có thể 'thư mục/tên') -> ([tên prefab], cách khớp)"""
    leaf = ref.replace('\\', '/').split('/')[-1]
    if leaf.endswith('.prefab'):
        leaf = leaf[:-7]
    if leaf in pmap:
        return [leaf], 'exact'
    if leaf.lower() in lower:
        return [lower[leaf.lower()]], 'case'
    el = [leaf + '_' + e for e in ELEMENTS if leaf + '_' + e in pmap]
    if el:
        return el, 'elemental'
    # bỏ hậu tố số/khoảng trắng, thử tiền tố gần nhất
    cands = [n for n in pmap if n.lower().startswith(leaf.lower() + '_')]
    if len(cands) == 1:
        return cands, 'prefix'
    return [], None


# ------------------------------------------------------------------ main --
# prefab đồ vật có hệ hạt (đo bằng tools/fx_object_scan.py, 2026-09-25). BoxFogField (0 hệ hạt, chỉ collider +
# script), PhoneBooth (1 MeshRenderer, bốt là Spine trong WaveExit), IntervalTrap/TriggerTrap (0: hình bẫy nằm
# trong prefab sector, tiếng nổ/lửa là VFX của HitBox) không có ở đây.
OBJECT_BUNDLE = 'remote_prefab_assets_object'
OBJECT_FX = ['SphereFieldExit', 'SphereOilField', 'SphereBlockedField', 'TrainingField', 'WaveExit', 'SafeExit',
             'DropGoods']


def write_atomic(path, text):
    """ghi tệp tạm rồi os.replace: agent khác có thể đang đọc/commit art/vfx cùng lúc."""
    tmp = path + '.tmp%d' % os.getpid()
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)


def main(argv):
    dry = '--dry' in argv
    argv = [a for a in argv if a != '--dry']
    refs = {}
    if not argv:
        print(__doc__)
        return 1
    if argv[0] == '--manifest':
        man = json.load(io.open(argv[1], encoding='utf-8'))
        for n in man.get('vfx', []):
            if re.search(r'[A-Za-z]', str(n)):
                refs.setdefault(n, set()).add('manifest')
    elif argv[0] == '--all-referenced':
        refs = collect_referenced()
        mp = os.path.join(HERE, 'manifest.json')
        if os.path.exists(mp):
            for n in json.load(io.open(mp, encoding='utf-8')).get('vfx', []):
                if re.search(r'[A-Za-z]', str(n)) and not re.fullmatch(r'[\d.]+', str(n)):
                    refs.setdefault(n, set()).add('manifest')
    else:
        for n in argv:
            refs.setdefault(n, set()).add('cli')

    for d in (OUT, OUT_TEX, OUT_MESH):
        os.makedirs(d, exist_ok=True)
    bundle_name = VFX_BUNDLE
    if argv[0] == '--bundle':
        bundle_name = argv[1]
    bundle = vc.bfile(bundle_name)
    deps = set()
    for p in PRELOAD:
        try:
            deps.add(vc.bfile(p))
        except KeyError:
            pass
    env = vc.env_of([bundle] + sorted(deps))
    pmap = build_prefab_map(env, bundle)
    lower = {k.lower(): k for k in pmap}
    print('prefab gốc (%s):' % bundle_name, len(pmap), 'tên tham chiếu:', len(refs), flush=True)

    jobs = {}      # tên prefab -> nguồn
    alias = {}     # tên tham chiếu -> [tên prefab]
    unmatched = []
    how_count = {}
    for ref in sorted(refs):
        names, how = resolve(ref, pmap, lower)
        if not names:
            if refs[ref] != {'code'}:
                unmatched.append(ref)
            continue
        if refs[ref] == {'code'} and how != 'exact':
            continue
        how_count[how] = how_count.get(how, 0) + 1
        alias[ref] = names
        for n in names:
            jobs.setdefault(n, set()).update(refs[ref])
    print('khớp:', how_count, 'không khớp:', len(unmatched), flush=True)
    for u in unmatched:
        print('  KHÔNG KHỚP', u, sorted(refs[u]))
    if dry:
        for n in sorted(jobs):
            print('  ', n)
        return 0

    ctx = Ctx()
    idx_path = os.path.join(OUT, 'index.json')
    index = {'v': 1, 'fx': {}, 'alias': {}, 'tex': {}, 'unmatched': []}
    if os.path.exists(idx_path) and argv[0] not in ('--all-referenced', '--manifest'):
        try:
            index = json.load(io.open(idx_path, encoding='utf-8'))
        except Exception:
            pass
    dup = []
    plan = [(bundle_name, bundle, sorted(jobs))]
    if argv[0] == '--all-referenced':
        plan.append((OBJECT_BUNDLE, vc.bfile(OBJECT_BUNDLE), OBJECT_FX))
    for bname, bfile_, names_ in plan:
        if bfile_ != bundle:
            bundle = bfile_
            env = vc.env_of([bundle] + sorted(deps))
            pmap = build_prefab_map(env, bundle)
        for n in names_:
            if n not in pmap:
                print('  KHÔNG CÓ trong %s: %s' % (bname, n))
                index['unmatched'] = sorted(set(index.get('unmatched', []) + [n]))
                continue
            objs = pmap[n]
            if len(objs) > 1:
                dup.append(n)
            while True:
                try:
                    doc = export_prefab(ctx, env, objs[0], n)
                    break
                except FileNotFoundError as e:
                    m = re.search(r'(cab-[0-9a-f]+)', str(e), re.I)
                    b2 = vc.idx()['cab'].get(m.group(1).lower()) if m else None
                    if not b2 or b2 in deps:
                        raise
                    print('  + dep', vc.short(b2), flush=True)
                    deps.add(b2)
                    env = vc.env_of([bundle] + sorted(deps))
                    pmap = build_prefab_map(env, bundle)
                    objs = pmap[n]
            if bname != VFX_BUNDLE:
                doc['src'] = bname
            fn = re.sub(r'[^A-Za-z0-9_.-]', '_', n)
            data = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
            write_atomic(os.path.join(OUT, fn + '.json'), data)
            index['fx'][n] = {'file': fn + '.json', 'bytes': len(data.encode('utf-8')), 'len': doc['len'],
                              'systems': len(doc['systems']), 'loop': doc.get('loop', 0)}
            if bname != VFX_BUNDLE:
                index['fx'][n]['src'] = bname
            print('OK %-70s %6d B  %2d hệ' % (n, len(data), len(doc['systems'])), flush=True)
    for ref, names in alias.items():
        leaf = ref.split('/')[-1]
        if names != [leaf]:
            index['alias'][ref] = names
        elif ref != leaf:
            index['alias'][ref] = leaf
    for t, info in ctx.tex_done.items():
        index['tex'][t] = {k: v for k, v in info.items() if k in ('wrapU', 'wrapV', 'filter', 'srgb', 'ow', 'oh', 'bytes')}
    index['unmatched'] = sorted(set(index.get('unmatched', []) + unmatched))
    index['duplicateNames'] = dup
    index['stats'] = dict(sorted(ctx.stats.items()))
    write_atomic(idx_path, json.dumps(index, ensure_ascii=False, indent=0, separators=(',', ':')))
    tot_json = sum(v['bytes'] for v in index['fx'].values())
    tot_tex = sum(v.get('bytes', 0) for v in index['tex'].values())
    print('XONG: %d prefab, JSON %.1f KB, ảnh %d tệp %.1f KB, mesh %d' % (
        len(index['fx']), tot_json / 1024.0, len(index['tex']), tot_tex / 1024.0, len(ctx.mesh_done)))
    print(json.dumps(index['stats'], ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
