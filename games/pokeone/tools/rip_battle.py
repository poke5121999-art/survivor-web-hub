# -*- coding: utf-8 -*-
"""Bóc cảnh trận PokéOne (level2, GameObject gốc "Battle Arena") ra data/battle.js + art/battle/{stage,ball}/**.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_battle.py

Chạy lại ra cùng kết quả: xoá sạch art/battle/stage và art/battle/ball rồi ghi lại từ đầu, ghi đè data/battle.js.
Cần npx (gltfpack 0.22), UnityPy 1.25, numpy, Pillow. Đọc thêm: ARCH.md (bẫy m_Script), tools/ttg.py,
tools/rip_map_core.py (collect/export_parts, quy ước FLIP = diag(-1,1,1)), tools/rip_map_title.py (quat_of,
to_three_quat, lighting), tools/rip_poke.py (Glb có skin+animation, hermite, quy ước g_pos/g_quat).

Hệ toạ độ: mọi vị trí trong data/battle.js là khung three.js (x đảo dấu so với Unity), mét, tính trong không
gian cục bộ của "Battle Arena" (bỏ vị trí gốc (-500,0,0) của nó — xem hàm arena_frame()).

## Nguồn dữ liệu [ĐO TRONG REPO, 2026-09-27]

- `level2`, GameObject gốc "Battle Arena" (pos Unity (-500,0,0), không xoay, scale 1, không cha) có:
  `UserPokePos`, `FoePokePos`, ~40 con "Background - *" (chỉ "Background - Grass" đang bật), và
  "Camera And Positions/" (BattleCamera, 2 Light, và các mốc Select*/Center Field* dùng bởi BattleCamera).
- `sharedassets2.assets`: 9 ScriptableObject `NewBattleAnimation` (pathID 5119..5127, đọc qua typetree IL2CPP
  như MonoBehaviour thường — trường tên trùng hệt C#: cameraState, type, delayUntilNext, target, target2, atlas,
  spritePrefix, framerate, position, position2, color, color2, fvalue, fvalue2, audioClip, speed,
  reverse{X,Y,Z}onEnemies, tweenBack, loop, keepLastFrame, reversed, duration — đã đối chiếu với
  D:\\pokeone-ref\\data\\mb_dump.json), `BattleAnimator` (pathID 5128, battleAnimations = đúng thứ tự 5119..5127),
  25 prefab `CatchEffect` (bóng), 1 prefab `Default Hit` (ParticleSystem đơn, dùng chung cho mọi đòn đánh).
- Atlas VFX (P1.ATLAS): tên GameObject chứa UIAtlas -> khoá P1.ATLAS, đối chiếu trực tiếp `data/atlas.js`
  (trường "src"): BattleAnim_Normal1->fx_normal, BattleAnimTest->fx_test, BattleAnim_Items1->fx_items,
  BattleAnim_StatusEffects1->fx_statuseffects, BattleAnim_Fire1->fx_fire, BattleAnim_Rock1->fx_rock,
  BattleAnim_Plant1->fx_plant, BattleAnim_Water1->fx_water, BattleAnim_Bug1->fx_bug, BattleAnim_Electro1->fx_electro.
- Bóng bắt (CatchEffect): gốc scale 0.1, con `Out Of Ball`/`In Ball` (ParticleSystem + 2 con hiệu ứng CFX3),
  `PokeBall` (pos (0,-30,0), component `Animation` legacy giữ 4 clip: Pokeball_Open_Catch, Pokeball_Shake,
  Pokeball_Break, Pokeball_Success — dùng `m_EulerCurves` chứ không phải `m_RotationCurves`, khác Pokémon),
  chứa `Monsterball` (gốc xương, pos (0,2.5,0) scale 30) + lưới da (SkinnedMeshRenderer, 2 xương Down/Up,
  material `Toon/Lit Outline` một ảnh) + `Inside Ball Effect` (particle, bỏ qua khi xuất glb hình học).
  Gốc CatchEffect không xoay/dời (chỉ scale 0.1) nên gộp thẳng vào scale của nút gốc glb, không cần thêm nút.
- `pokemonmodels.txt`... không dùng ở đây. Tên bóng khớp `BattleID` trong `D:\\pokeone-ref\\data\\items.txt`
  sau khi bỏ dấu/khoảng trắng (vd. "Poké Ball" -> "pokball").

## Xấp xỉ ParticleSystem (Shuriken) -> particle dict

MinMaxCurve (scalar): state 0 hằng số (`scalar`), 3 hai hằng số (`minScalar`..`scalar`), 1 đường cong×hệ số
(dùng min/max giá trị khoá của `maxCurve` nhân `scalar`), 2 hai đường cong (hợp min/max của cả hai). Hàm
`curve_range()`.

MinMaxGradient (màu): không thấy trường "mode" tường minh trong bản dump; suy từ `minMaxState` giống
MinMaxCurve — 0 dùng thẳng `maxColor` (hằng số, `minColor` chỉ là giá trị mặc định bỏ đi), 2 dùng cả
`minColor`/`maxColor` (ngẫu nhiên giữa hai màu, xuất cả hai), 1/3/4 dùng `maxGradient` làm dải màu theo thời
gian (`gradient_stops()`, ghép mốc màu `ctimeN`/`keyN.rgb` với mốc alpha `atimeN`/`keyN.a` — đây là 2 mảng khoá
riêng của Gradient nhưng cùng dùng slot `keyN`).

`startRotation`/`RotationModule` lưu bằng radian dù UI Editor hiện độ — đổi sang độ khi ghi ra.
`simulationSpace`: bản 2018.4 không thấy field enum riêng trong typetree đọc được, chỉ có `moveWithTransform`
(bool) — đây là field lịch sử của Simulation Space kiểu cũ (true=Local, false=World) trước khi Unity thêm
Custom; suy đoán, đã ghi rõ trong data.

Độ trung thực ưu tiên: màu/kích thước/số lượng/thời điểm burst/kết cấu/kiểu cộng màu đúng đại thể hơn là mọi
module (không mô phỏng Collision/Trigger/Noise/Trail...).
"""
import io, json, math, os, re, shutil, struct, subprocess, sys, unicodedata

import numpy as np

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ttg
import rip_map_core as core
import rip_map_title as title
import rip_poke as poke

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art', 'battle')
STAGE_DIR = os.path.join(ART, 'stage')
BALL_DIR = os.path.join(ART, 'ball')
FX_DIR = os.path.join(GAME, 'art', 'fx')
DATA_JS = os.path.join(GAME, 'data', 'battle.js')
ITEMS_TXT = r'D:\pokeone-ref\data\items.txt'

FLIP = core.FLIP  # diag(-1,1,1): Unity -> three.js (x đảo dấu)

# ---------------------------------------------------------------- enum (đối chiếu D:\pokeone-ref\il2cpp\dump.cs)
STEP_TYPES = ['Wait', 'SpriteAnimation', 'Shake', 'TweenPosition', 'Tween2Position', 'TweenScale',
              'SpriteTweenPos', 'SpriteTweenScale', 'SpriteTween2Pos', 'TweenColor', 'TweenSaturation',
              'TweenContrast', 'TweenDistortion', 'TweenFullColorSat', 'TweenFullColorCon', 'SpriteTweenColor',
              'SpriteTweenColorScale', 'SoundEffect', 'ChangeBattleCamera']
TARGET_NAMES = ['Target', 'Source', 'TargetBar', 'SourceBar', 'TargetMulti', 'SourceMulti', 'TargetBarMulti',
                'SourceBarMulti', 'Background', 'Foreground']
CAMERA_STATES = ['FocusUser', 'FocusPlayer', 'Idle', 'Idle2', 'HitFoe', 'HitUser', 'SelectFoe', 'SelectUser',
                  'SelectField', 'Default', 'Still']
SPEED_MAP = {-1: 'Slow', 0: 'Normal', 1: 'Fast'}

ATLAS_GONAME_TO_KEY = {
    'BattleAnim_Normal1': 'fx_normal', 'BattleAnimTest': 'fx_test', 'BattleAnim_Items1': 'fx_items',
    'BattleAnim_StatusEffects1': 'fx_statuseffects', 'BattleAnim_Fire1': 'fx_fire', 'BattleAnim_Rock1': 'fx_rock',
    'BattleAnim_Plant1': 'fx_plant', 'BattleAnim_Water1': 'fx_water', 'BattleAnim_Bug1': 'fx_bug',
    'BattleAnim_Electro1': 'fx_electro',
}

EXPORT_BG_KEYS = {'grass', 'grass2', 'grass3', 'cave', 'city', 'indoor1', 'waterland', 'desert', 'snow',
                   'graveyard', 'stadium', 'ocean'}

SHAPE_TYPES = {0: 'sphere', 1: 'sphereshell', 2: 'hemisphere', 3: 'hemisphereshell', 4: 'cone', 5: 'box',
               6: 'mesh', 7: 'coneshell', 8: 'conevolume', 9: 'conevolumeshell', 10: 'circle', 11: 'circleedge',
               12: 'edge', 15: 'boxshell', 16: 'boxedge', 17: 'donut', 18: 'rectangle'}
RENDER_MODES = {0: 'billboard', 1: 'stretched', 2: 'horizontal', 3: 'billboard', 4: 'mesh', 5: 'none'}


def rnd(x, n=4):
    return round(float(x), n)


def slug(name):
    s = name
    if s.startswith('Background - '):
        s = s[len('Background - '):]
    return re.sub(r'[^a-z0-9]', '', s.lower())


def norm_name(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', s.lower())


def to_three_pos(p):
    return [rnd(-p[0], 3), rnd(p[1], 3), rnd(p[2], 3)]


def rot_of(m):
    """Bỏ scale khỏi khối 3x3 của ma trận (Frame trộn cả scale), trả ma trận xoay thuần."""
    R = np.array(m[:3, :3], dtype=np.float64, copy=True)
    for i in range(3):
        n = np.linalg.norm(R[:, i])
        if n > 1e-9:
            R[:, i] /= n
    return R


def hexcolor(c):
    return '#%02x%02x%02x' % (round(max(0, min(1, c['r'])) * 255), round(max(0, min(1, c['g'])) * 255),
                               round(max(0, min(1, c['b'])) * 255))


def round_all(o, nd=4):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, dict):
        return {k: round_all(v, nd) for k, v in o.items()}
    if isinstance(o, list):
        return [round_all(v, nd) for v in o]
    return o


# ---------------------------------------------------------------- MinMaxCurve / MinMaxGradient
def curve_range(mmc):
    st = mmc['minMaxState']
    if st == 3:
        return [mmc['minScalar'], mmc['scalar']]
    if st == 0:
        return [mmc['scalar'], mmc['scalar']]

    def ext(c):
        ks = c['m_Curve']
        if not ks:
            return (0.0, 1.0)
        vs = [k['value'] for k in ks]
        return (min(vs), max(vs))
    if st == 1:
        lo, hi = ext(mmc['maxCurve'])
        return [mmc['scalar'] * lo, mmc['scalar'] * hi]
    if st == 2:
        lo1, hi1 = ext(mmc['minCurve'])
        lo2, hi2 = ext(mmc['maxCurve'])
        return [mmc['scalar'] * min(lo1, lo2), mmc['scalar'] * max(hi1, hi2)]
    return [0.0, 0.0]


def gradient_stops(g):
    nc, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    cst = [(g['ctime%d' % i] / 65535.0, (g['key%d' % i]['r'], g['key%d' % i]['g'], g['key%d' % i]['b']))
           for i in range(nc)]
    ast = [(g['atime%d' % i] / 65535.0, g['key%d' % i]['a']) for i in range(na)]
    times = sorted(set(t for t, _ in cst) | set(t for t, _ in ast))

    def interp(stops, t, dflt):
        if not stops:
            return dflt
        ss = sorted(stops)
        if t <= ss[0][0]:
            return ss[0][1]
        if t >= ss[-1][0]:
            return ss[-1][1]
        for (t0, v0), (t1, v1) in zip(ss, ss[1:]):
            if t0 <= t <= t1:
                f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
                if isinstance(v0, tuple):
                    return tuple(a + (b - a) * f for a, b in zip(v0, v1))
                return v0 + (v1 - v0) * f
        return ss[-1][1]
    out = []
    for t in times:
        r, g_, b = interp(cst, t, (1.0, 1.0, 1.0))
        a = interp(ast, t, 1.0)
        out.append({'t': round(t, 3), 'color': [round(r, 3), round(g_, 3), round(b, 3), round(a, 3)]})
    return out


def gradient_color(mmg):
    """-> (color đại diện, colorMin|None, colorOverLifetime|None). Xem ghi chú suy luận state ở đầu tệp."""
    st = mmg['minMaxState']

    def col(c):
        return [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]
    if st == 2:
        return col(mmg['maxColor']), col(mmg['minColor']), None
    if st == 0:
        return col(mmg['maxColor']), None, None
    stops = gradient_stops(mmg['maxGradient'])
    return (stops[0]['color'] if stops else [1.0, 1.0, 1.0, 1.0]), None, stops


# ---------------------------------------------------------------- texture cho particle
def tex_for(desc, fallback_cache):
    if desc['tex'] is None:
        return None
    name = desc['tex'].read().m_Name
    fn = name + '.png'
    if os.path.exists(os.path.join(FX_DIR, fn)):
        return 'art/fx/' + fn
    fn2, _meta = fallback_cache.png(desc['tex'])
    return 'art/battle/ball/tex/' + fn2


def blend_of(desc):
    return 'add' if desc['extras'].get('additive') else 'alpha'


# ---------------------------------------------------------------- đọc một ParticleSystem -> dict xấp xỉ
def read_particle(name, node_t, ps_ptr, psr_ptr, fr, fallback_cache):
    d = ps_ptr.read_typetree()
    im = d['InitialModule']
    m = fr.world(node_t)
    pos = to_three_pos(m[:3, 3])
    scale = float(np.mean([np.linalg.norm(m[:3, i]) for i in range(3)]))

    tex = None
    blend = 'alpha'
    if psr_ptr is not None:
        rr = psr_ptr.read()
        if rr.m_Materials and rr.m_Materials[0].m_PathID:
            mat = rr.m_Materials[0].read()
            desc = core.material_desc(mat)
            tex = tex_for(desc, fallback_cache)
            blend = blend_of(desc)
        rd = psr_ptr.read_typetree()
        render_mode = RENDER_MODES.get(rd['m_RenderMode'], 'billboard')
        length_scale = rd.get('m_LengthScale')
    else:
        render_mode, length_scale = 'billboard', None

    color, color_min, _ = gradient_color(im['startColor'])
    em = d['EmissionModule']
    bursts = [{'time': round(b['time'], 3), 'count': round(b['countCurve']['scalar'])} for b in em['m_Bursts']]

    shp = d.get('ShapeModule') or {}
    shape = None
    if shp.get('enabled'):
        shape = {'type': SHAPE_TYPES.get(shp.get('type'), 'other'), 'radius': shp.get('radius', {}).get('value'),
                 'angle': shp.get('angle'), 'arc': shp.get('arc', {}).get('value')}

    col_life = None
    cm = d.get('ColorModule') or {}
    if cm.get('enabled'):
        _, _, col_life = gradient_color(cm['gradient'])

    size_life = None
    sm = d.get('SizeModule') or {}
    if sm.get('enabled'):
        curve = sm.get('curve', {})
        scalar = curve.get('scalar', 1.0)
        keys = curve.get('maxCurve', {}).get('m_Curve', [])
        if keys:
            size_life = [{'t': round(k['time'], 3), 'v': round(k['value'] * scalar, 4)} for k in keys]

    rot_life = None
    rm = d.get('RotationModule') or {}
    if rm.get('enabled'):
        c = rm.get('curve')
        if c:
            lo, hi = curve_range(c)
            rot_life = [round(math.degrees(lo), 2), round(math.degrees(hi), 2)]

    lo_r, hi_r = curve_range(im['startRotation'])
    particle = {
        'name': name, 'pos': pos, 'scale': rnd(scale), 'tex': tex, 'sheet': None, 'blend': blend,
        'renderMode': render_mode, 'lengthScale': length_scale,
        'duration': rnd(d['lengthInSec'], 3), 'loop': bool(d['looping']),
        'delay': curve_range(d['startDelay']), 'lifetime': curve_range(im['startLifetime']),
        'speed': curve_range(im['startSpeed']), 'size': curve_range(im['startSize']),
        'rotation': [round(math.degrees(lo_r), 2), round(math.degrees(hi_r), 2)],
        'color': color, 'gravity': sum(curve_range(im['gravityModifier'])) / 2,
        'maxParticles': im['maxNumParticles'], 'rate': curve_range(em['rateOverTime'])[1], 'bursts': bursts,
        'shape': shape, 'colorOverLifetime': col_life, 'sizeOverLifetime': size_life,
        'rotationOverLifetime': rot_life, 'simulationSpace': 'local' if d.get('moveWithTransform') else 'world',
    }
    if color_min is not None:
        particle['colorMin'] = color_min
        particle['colorMax'] = color
    return particle


def walk_particles(root_t, fr, fallback_cache, skip_names=()):
    """DFS mọi node có ParticleSystem trong subtree (kể cả root) -> [particle dict], theo thứ tự Unity."""
    out = []

    def rec(t):
        go = t.m_GameObject.read()
        if go.m_Name in skip_names:
            return
        ps_ptr = psr_ptr = None
        for cc in go.m_Component:
            tn = cc.component.type.name
            if tn == 'ParticleSystem':
                ps_ptr = cc.component
            elif tn == 'ParticleSystemRenderer':
                psr_ptr = cc.component
        if ps_ptr is not None:
            out.append(read_particle(go.m_Name, t, ps_ptr, psr_ptr, fr, fallback_cache))
        for c in t.m_Children:
            rec(c.read())
    rec(root_t)
    return out


def find_child(t, name):
    for c in t.m_Children:
        ct = c.read()
        if ct.m_GameObject.read().m_Name == name:
            return ct
    return None


def find_comp(t, name, ctype):
    go = t.m_GameObject.read()
    if go.m_Name == name:
        for cc in go.m_Component:
            if cc.component.type.name == ctype:
                return cc.component
    for c in t.m_Children:
        r = find_comp(c.read(), name, ctype)
        if r is not None:
            return r
    return None


# ================================================================== stage
def build_sky(F):
    """BattleCamera có m_ClearFlags=1 (Skybox); trời của trận là RenderSettings.m_SkyboxMaterial của chính level2
    (material "Sunny 06B noSun", shader Skybox/6 Sided — cùng dạng trời màn đăng nhập). Dùng lại
    rip_map_title.skybox() bằng cách tráo tạm khoá 'level1' trỏ sang file level2 (không copy code, không sửa
    rip_map_title.py). BattleCamera.Update() xoay _Rotation thêm -Time.time*0.5 lúc chạy — đó là việc của
    js/battle.js lúc render, giá trị 'rotation' ở đây chỉ là góc gốc lúc t=0."""
    out_dir = os.path.join(STAGE_DIR, 'sky')
    os.makedirs(out_dir, exist_ok=True)
    F2 = dict(F)
    F2['level1'] = F['level2']
    sky = title.skybox(F2, out_dir)
    sky['faces'] = {k: 'art/battle/stage/sky/' + os.path.basename(v) for k, v in sky['faces'].items()}
    sky['kind'] = '6sided'
    return sky


def build_stage(env, F):
    l2 = F['level2']
    arena = None
    for o in l2.objects.values():
        if o.type.name == 'GameObject':
            g = o.read()
            if g.m_Name == 'Battle Arena' and not core.transform_of(g).m_Father.m_PathID:
                arena = g
    if arena is None:
        raise SystemExit('không thấy GameObject "Battle Arena" trong level2')
    at = core.transform_of(arena)
    assert abs(at.m_LocalRotation.w - 1.0) < 1e-4, 'Battle Arena có xoay, giả định trong ARCH.md sai'
    fr = core.Frame(at, keep_root=False)  # gốc: bỏ vị trí (-500,0,0), chỉ giữ scale (=1)

    def pos_of(t):
        return to_three_pos(fr.world(t)[:3, 3])

    def quat_of(t, camera=False):
        return title.to_three_quat(rot_of(fr.world(t)), camera=camera)

    def fwd_of(t):
        return to_three_pos(rot_of(fr.world(t)) @ np.array([0.0, 0.0, 1.0]))

    user_t = find_child(at, 'UserPokePos')
    foe_t = find_child(at, 'FoePokePos')
    cap_t = find_child(at, 'Camera And Positions')

    # ---- máy ảnh
    battlecam_t = find_child(cap_t, 'BattleCamera')
    cam_ptr = None
    bc_mb = None
    for cc in battlecam_t.m_GameObject.read().m_Component:
        if cc.component.type.name == 'Camera':
            cam_ptr = cc.component
        elif cc.component.type.name == 'MonoBehaviour':
            full, tt = ttg.read_mb(env, cc.component.deref())
            if full == 'BattleCamera':
                bc_mb = tt
    cam = cam_ptr.read_typetree()
    bg = cam['m_BackGroundColor']
    q_cam = quat_of(battlecam_t, camera=True)

    def qapply(q, v):
        x, y, z, w = q
        vx, vy, vz = v
        tx, ty, tz = 2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)
        return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
    cam_fwd = [rnd(x, 4) for x in qapply(q_cam, [0.0, 0.0, -1.0])]

    def name_of(pid):
        return l2.objects[pid].read().m_GameObject.read().m_Name
    camera = {
        'fov': cam['field of view'], 'near': cam['near clip plane'], 'far': cam['far clip plane'],
        'clearColor': hexcolor(bg), 'pos': pos_of(battlecam_t), 'quat': q_cam, 'fwd': cam_fwd,
    }
    rig = {
        'positionTargets': [name_of(p['m_PathID']) for p in bc_mb['PositionTargets']],
        'cameraTargets': [name_of(p['m_PathID']) for p in bc_mb['CameraTargets']],
        'centerFieldFocus': name_of(bc_mb['CenterFieldFocus']['m_PathID']),
        'centerField': name_of(bc_mb['CenterField']['m_PathID']),
    }

    # ---- mốc: mọi con trực tiếp của "Camera And Positions"
    anchors = {}
    for c in cap_t.m_Children:
        ct = c.read()
        cg = ct.m_GameObject.read()
        e = {'pos': pos_of(ct)}
        q = quat_of(ct)
        if abs(q[3]) < 0.99999 or max(abs(q[0]), abs(q[1]), abs(q[2])) > 1e-4:
            e['quat'] = q
        anchors[cg.m_Name] = e

    # ---- đèn (Pokemon Lighting, Background Lighting) + ambient/fog của level2
    def light_info(t):
        go = t.m_GameObject.read()
        for cc in go.m_Component:
            if cc.component.type.name == 'Light':
                d = cc.component.read_typetree()
                return {'color': [rnd(d['m_Color']['r'], 4), rnd(d['m_Color']['g'], 4), rnd(d['m_Color']['b'], 4)],
                        'intensity': d['m_Intensity'], 'dir': fwd_of(t)}
    lights = {'pokemon': light_info(find_child(cap_t, 'Pokemon Lighting')),
              'background': light_info(find_child(cap_t, 'Background Lighting'))}
    rs = next(o for o in l2.objects.values() if o.type.name == 'RenderSettings').read_typetree()
    rgb = lambda c: [rnd(c['r'], 4), rnd(c['g'], 4), rnd(c['b'], 4)]
    lights['ambient'] = {'mode': {0: 'skybox', 1: 'trilight', 3: 'flat', 4: 'custom'}.get(rs['m_AmbientMode'], rs['m_AmbientMode']),
                          'sky': rgb(rs['m_AmbientSkyColor']), 'equator': rgb(rs['m_AmbientEquatorColor']),
                          'ground': rgb(rs['m_AmbientGroundColor']), 'intensity': rs['m_AmbientIntensity']}
    lights['fog'] = {'on': bool(rs['m_Fog']), 'mode': {1: 'linear', 2: 'exp', 3: 'exp2'}.get(rs['m_FogMode']),
                      'color': rgb(rs['m_FogColor']), 'start': rs['m_LinearFogStart'], 'end': rs['m_LinearFogEnd'],
                      'density': rs['m_FogDensity']}

    # ---- nền (Background - *)
    shutil.rmtree(STAGE_DIR, ignore_errors=True)
    os.makedirs(os.path.join(STAGE_DIR, 'tex'), exist_ok=True)
    tc = core.TexCache(os.path.join(STAGE_DIR, 'tex'), max_size=1024)
    SKIP_TOP = {'Battle3V3', 'Foe Highlight', 'Foe Highlight (1)', 'Foe Highlight (2)', 'User Highlight',
                'User Highlight (1)', 'User Highlight (2)', 'Camera And Positions', 'UserPokePos', 'FoePokePos',
                'Battle Weather', 'Point light (1)'}
    backgrounds = {}
    n_export = 0
    for c in at.m_Children:
        ct = c.read()
        cg = ct.m_GameObject.read()
        if cg.m_Name in SKIP_TOP or not cg.m_Name.startswith('Background'):
            continue
        key = slug(cg.m_Name)
        active = bool(cg.m_IsActive)
        cg.m_IsActive = True  # ép bật để collect() không bỏ qua chính nó (con tắt vẫn bị bỏ như thường)
        parts, _stats = core.collect(cg, keep_root=True)
        lo, hi = core.aabb(parts) if parts else (np.zeros(3), np.zeros(3))
        entry = {'name': cg.m_Name, 'glb': None, 'min': [rnd(x, 3) for x in lo], 'max': [rnd(x, 3) for x in hi],
                  'active': active}
        # đèn điểm bên trong nền: dùng cùng khung tham chiếu (Frame gốc tại chính nền, keep_root=True)
        bg_fr = core.Frame(ct, keep_root=True)
        pl = []

        def find_lights(tt):
            g2 = tt.m_GameObject.read()
            for cc in g2.m_Component:
                if cc.component.type.name == 'Light':
                    d = cc.component.read_typetree()
                    if d.get('m_Type') == 2:  # Point
                        m = bg_fr.world(tt)
                        pl.append({'pos': to_three_pos(m[:3, 3]), 'color': rgb(d['m_Color']),
                                   'intensity': d['m_Intensity'], 'range': d['m_Range']})
            for c2 in tt.m_Children:
                find_lights(c2.read())
        find_lights(ct)
        if pl:
            entry['lights'] = pl
        if key in EXPORT_BG_KEYS:
            out_glb = os.path.join(STAGE_DIR, key + '.glb')
            core.export_parts(parts, out_glb, tc, key)
            entry['glb'] = 'art/battle/stage/%s.glb' % key
            n_export += 1
        backgrounds[key] = entry

    # ---- BattlePokeHandler / 3DPokemonPrefab (bóng, BoxCollider) — thông tin biết thêm, không xuất hình
    sa2 = F['sharedassets2.assets']
    box = None
    for o in sa2.objects.values():
        if o.type.name == 'GameObject':
            g = o.read()
            if g.m_Name == '3DPokemonPrefab' and not core.transform_of(g).m_Father.m_PathID:
                for cc in g.m_Component:
                    if cc.component.type.name == 'BoxCollider':
                        bd = cc.component.read_typetree()
                        box = {'size': [rnd(bd['m_Size']['x'], 2), rnd(bd['m_Size']['y'], 2), rnd(bd['m_Size']['z'], 2)],
                               'center': [rnd(bd['m_Center']['x'], 2), rnd(bd['m_Center']['y'], 2), rnd(bd['m_Center']['z'], 2)]}
    pokemon_prefab = {'boxCollider': box,
                      'note': 'BattlePokeHandler.Shadow là MeshRenderer gán lúc chạy (null trong prefab tĩnh); '
                              'không có quad bóng cố định để đo. BoxCollider tính bằng cm, gán ở gốc placeholder.'}

    sky = build_sky(F)

    stage = {
        'user': {'pos': pos_of(user_t)}, 'foe': {'pos': pos_of(foe_t)},
        'camera': camera, 'anchors': anchors, 'rig': rig, 'lights': lights, 'backgrounds': backgrounds, 'sky': sky,
        'shadow': {'tex': 'art/battle/Shadow.png', 'tex2': 'art/battle/shadow_2.png', 'size': None,
                    'note': 'Kích thước quad bóng không tĩnh trong prefab (xem pokemonPrefab.note); size để null.'},
        'pokemonPrefab': pokemon_prefab,
    }
    report = {'backgrounds_total': len(backgrounds), 'backgrounds_exported': n_export}
    return stage, report


# ================================================================== anims (BattleAnimator + 9 NewBattleAnimation)
def build_anims(env, F):
    sa2 = F['sharedassets2.assets']

    def atlas_key(ptr):
        if not ptr['m_PathID']:
            return None
        go = sa2.objects[ptr['m_PathID']].read_typetree()['m_GameObject']
        name = sa2.objects[go['m_PathID']].read().m_Name if go['m_PathID'] else None
        return ATLAS_GONAME_TO_KEY.get(name, name)

    def audio_name(ptr):
        if not ptr['m_PathID']:
            return None
        return sa2.objects[ptr['m_PathID']].read().m_Name

    def step_dict(s):
        t = STEP_TYPES[s['type']]
        d = {
            'type': t, 'delay': s['delayUntilNext'], 'duration': s['duration'],
            'target': TARGET_NAMES[s['target']], 'target2': TARGET_NAMES[s['target2']],
            'atlas': atlas_key(s['atlas']), 'prefix': s['spritePrefix'], 'fps': s['framerate'],
            'pos': [s['position']['x'], s['position']['y'], s['position']['z']],
            'pos2': [s['position2']['x'], s['position2']['y'], s['position2']['z']],
            'color': [s['color']['r'], s['color']['g'], s['color']['b'], s['color']['a']],
            'color2': [s['color2']['r'], s['color2']['g'], s['color2']['b'], s['color2']['a']],
            'f': s['fvalue'], 'f2': s['fvalue2'], 'audio': audio_name(s['audioClip']),
            'speed': SPEED_MAP.get(s['speed'], 'Normal'),
            'reverseXonEnemies': bool(s['reverseXonEnemies']), 'reverseYonEnemies': bool(s['reverseYonEnemies']),
            'reverseZonEnemies': bool(s['reverseZonEnemies']), 'tweenBack': bool(s['tweenBack']),
            'loop': bool(s['loop']), 'keepLastFrame': bool(s['keepLastFrame']), 'reversed': bool(s['reversed']),
        }
        if t == 'ChangeBattleCamera':
            d['camera'] = CAMERA_STATES[s['cameraState']]
        return d

    battle_animator = None
    for o in sa2.objects.values():
        if o.type.name != 'MonoBehaviour':
            continue
        full, tt = ttg.read_mb(env, o)
        if full == 'BattleAnimator':
            battle_animator = tt
    order = [p['m_PathID'] for p in battle_animator['battleAnimations'] if p['m_PathID']]
    anims = []
    for pid in order:
        full, tt = ttg.read_mb(env, sa2.objects[pid])
        anims.append({'id': pid, 'name': tt['m_Name'], 'attack': [step_dict(s) for s in tt['attackSteps']],
                       'hit': [step_dict(s) for s in tt['hitSteps']]})
    return anims


# ================================================================== hit (Default Hit)
def build_hit(env, F, fallback_cache):
    sa2 = F['sharedassets2.assets']
    for o in sa2.objects.values():
        if o.type.name == 'GameObject':
            g = o.read()
            if g.m_Name == 'Default Hit' and not core.transform_of(g).m_Father.m_PathID:
                t = core.transform_of(g)
                fr = core.Frame(t, keep_root=False)
                parts = walk_particles(t, fr, fallback_cache)
                scale = t.m_LocalScale.x
                return {'name': 'Default Hit', 'particles': parts, 'scale': rnd(scale)}
    raise SystemExit('không thấy prefab "Default Hit" trong sharedassets2')


# ================================================================== catch (25 CatchEffect + ball glb)
def item_battle_ids():
    txt = io.open(ITEMS_TXT, encoding='utf-8').read()
    txt = re.sub(r',(\s*[}\]])', r'\1', txt)  # dấu phẩy thừa trước } hoặc ] (như pokemonmodels.txt)
    items = json.loads(txt)['items']
    return {norm_name(it['Name']): it['BattleID'] for it in items}


def decode_ball_clip(clip_tt, fps=30):
    """Clip legacy của bóng: euler curve (không phải quaternion) cho phần lớn khớp — khác Pokémon (README-poke.md)."""
    if clip_tt['m_CompressedRotationCurves']:
        raise SystemExit('clip bóng %s: có rãnh nén, chưa hỗ trợ' % clip_tt['m_Name'])
    L = 0.0
    for kind in ('m_PositionCurves', 'm_ScaleCurves', 'm_RotationCurves', 'm_EulerCurves'):
        for c in clip_tt[kind]:
            if c['curve']['m_Curve']:
                L = max(L, c['curve']['m_Curve'][-1]['time'])
    n = max(1, int(round(L * fps)))
    times = np.minimum(np.arange(n + 1) / fps, L)
    trs = {}
    for c in clip_tt['m_PositionCurves']:
        if c['curve']['m_Curve']:
            trs.setdefault(c['path'].rstrip('/'), {})['t'] = poke.hermite(c['curve']['m_Curve'], times, 3)
    for c in clip_tt['m_ScaleCurves']:
        if c['curve']['m_Curve']:
            trs.setdefault(c['path'].rstrip('/'), {})['s'] = poke.hermite(c['curve']['m_Curve'], times, 3)
    for c in clip_tt['m_RotationCurves']:
        if c['curve']['m_Curve']:
            v = poke.hermite(c['curve']['m_Curve'], times, 4)
            v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
            trs.setdefault(c['path'].rstrip('/'), {})['r'] = v
    for c in clip_tt['m_EulerCurves']:
        if c['curve']['m_Curve']:
            eul = poke.hermite(c['curve']['m_Curve'], times, 3)  # độ, thứ tự Unity: Z rồi X rồi Y (title.euler_m)
            qs = np.array([title.quat_of(title.euler_m(*e)) for e in eul])
            for i in range(1, len(qs)):
                if np.dot(qs[i], qs[i - 1]) < 0:
                    qs[i] = -qs[i]
            trs.setdefault(c['path'].rstrip('/'), {})['r'] = qs
    return {'name': clip_tt['m_Name'], 'len': float(L), 'loop': clip_tt['m_WrapMode'] == 2, 'times': times, 'trs': trs}


def export_ball(name, ce_go, out_dir, tex_dir):
    """CatchEffect prefab -> (glb tương đối, [clip{name,len,loop}], diameter). Gốc glb = node 'PokeBall' (Animation),
    scale của nó nhân thêm scale gốc CatchEffect (0.1, không xoay/dời — probe đã xác nhận cho 3 bóng mẫu)."""
    ce_t = core.transform_of(ce_go)
    root_scale = ce_t.m_LocalScale.x
    anim_t = find_child(ce_t, 'PokeBall')
    g = poke.Glb()
    by_path, by_pid = {}, {}

    def add(t, apath, scale_mul=1.0):
        go = t.m_GameObject.read()
        if go.m_Name == 'Inside Ball Effect':
            return None
        p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
        i = len(g.nodes)
        # scale_mul chỉ khác 1.0 ở đúng nút gốc (PokeBall/Animation): gộp scale của cha đã bỏ (CatchEffect root,
        # chỉ có scale, không dời/xoay) vào CẢ translation lẫn scale của nút này, vì cha không còn trong cây glb.
        g.nodes.append({'name': go.m_Name,
                         'translation': [poke.rnd(-p.x * scale_mul), poke.rnd(p.y * scale_mul), poke.rnd(p.z * scale_mul)],
                         'rotation': [poke.rnd(q.x, 7), poke.rnd(-q.y, 7), poke.rnd(-q.z, 7), poke.rnd(q.w, 7)],
                         'scale': [poke.rnd(s.x * scale_mul), poke.rnd(s.y * scale_mul), poke.rnd(s.z * scale_mul)]})
        by_path[apath] = i
        by_pid[t.object_reader.path_id] = i
        kids = []
        for c in t.m_Children:
            ct = c.read()
            cg = ct.m_GameObject.read()
            ci = add(ct, (apath + '/' if apath else '') + cg.m_Name)
            if ci is not None:
                kids.append(ci)
        if kids:
            g.nodes[i]['children'] = kids
        return i
    add(anim_t, '', scale_mul=root_scale)
    root_i = 0

    # ---- lưới + material (Toon/Lit Outline, một ảnh — không cần TEV như rip_poke)
    def find_smr(t):
        go = t.m_GameObject.read()
        for cc in go.m_Component:
            if cc.component.type.name == 'SkinnedMeshRenderer':
                return cc.component
        for c in t.m_Children:
            r = find_smr(c.read())
            if r is not None:
                return r
        return None
    smr_ptr = find_smr(anim_t)
    smr = smr_ptr.read()
    me = smr.m_Mesh.read()
    from UnityPy.helpers.MeshHelper import MeshHandler
    h = MeshHandler(me)
    h.process()
    n = h.m_VertexCount
    pos_u = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
    nrm_u = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3]
    uv_u = np.array(h.m_UV0, dtype=np.float64).reshape(n, -1)[:, :2]
    tris = [t for t in h.get_triangles() if len(t)]
    idx = np.array(tris[0], dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
    w = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1)
    ix = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1)[:, :w.shape[1]]
    if w.shape[1] < 4:
        w = np.hstack([w, np.zeros((n, 4 - w.shape[1]))])
        ix = np.hstack([ix, np.zeros((n, 4 - ix.shape[1]), np.int64)])
    w, ix = w[:, :4], ix[:, :4]
    w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
    ix[w == 0] = 0
    pos = pos_u * [-1, 1, 1]
    nrm = nrm_u * [-1, 1, 1]
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    joints = [by_pid[b.m_PathID] for b in smr.m_Bones]
    ibm = [poke.F @ poke.mat4(b) @ poke.F for b in me.m_BindPose]
    a_pos = g.accessor(pos.astype(np.float32), 5126, 'VEC3', 34962, True)
    a_nrm = g.accessor(nrm.astype(np.float32), 5126, 'VEC3', 34962)
    a_j = g.accessor(ix.astype(np.uint16), 5123, 'VEC4', 34962)
    a_w = g.accessor(w.astype(np.float32), 5126, 'VEC4', 34962)
    a_idx = g.accessor(idx, 5125, 'SCALAR', 34963)
    uv = np.c_[uv_u[:, 0], 1 - uv_u[:, 1]]
    a_uv = g.accessor(uv.astype(np.float32), 5126, 'VEC2', 34962)
    skin = len(g.skins)
    g.skins.append({'joints': joints, 'skeleton': root_i,
                     'inverseBindMatrices': g.accessor(np.stack([m.T for m in ibm]).reshape(-1, 16).astype(np.float32), 5126, 'MAT4')})

    tc = core.TexCache(tex_dir, max_size=512)
    mat = smr.m_Materials[0].read()
    desc = core.material_desc(mat)
    matdict = {'name': mat.m_Name, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 1.0,
               'baseColorFactor': [round(x, 4) for x in desc['color'][:3]] + [1.0]}}
    if desc['tex'] is not None:
        _k, img, meta = tc.image(desc['tex'])
        ti = g.texture(img if meta['alpha'] else img.convert('RGB'), mat.m_Name, poke.CLAMP, poke.CLAMP)
        matdict['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
    if desc['mode'] == 'BLEND':
        matdict['alphaMode'] = 'BLEND'
    elif desc['mode'] == 'MASK':
        matdict['alphaMode'] = 'MASK'
        matdict['alphaCutoff'] = round(desc['cutoff'], 4)
    if desc['double']:
        matdict['doubleSided'] = True
    g.materials.append(matdict)
    mi = len(g.materials) - 1
    mesh_node = len(g.nodes)
    g.meshes.append({'name': 'ball', 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm,
                     'JOINTS_0': a_j, 'WEIGHTS_0': a_w, 'TEXCOORD_0': a_uv}, 'indices': a_idx, 'material': mi}]})
    g.nodes.append({'name': 'ball_mesh', 'mesh': len(g.meshes) - 1, 'skin': skin,
                     'translation': [0.0, 0.0, 0.0], 'rotation': [0.0, 0.0, 0.0, 1.0], 'scale': [1.0, 1.0, 1.0]})
    g.nodes[root_i].setdefault('children', []).append(mesh_node)

    # ---- rest pose (thế giới, khung glb) để dựng kênh hằng số cho clip không có rãnh trên một nút
    def world():
        out = {}

        def walk(i, parent):
            nd = g.nodes[i]
            out[i] = parent @ poke.trs_mat(nd['translation'], nd['rotation'], nd['scale'])
            for c in nd.get('children', []):
                walk(c, out[i])
        walk(root_i, np.eye(4))
        return out
    world()  # (không dùng lại IBM ở đây; giữ lời gọi để bắt lỗi cây nút sớm nếu có nút hỏng)

    # ---- animation: 4 clip legacy trên GameObject "PokeBall" (anim_t)
    anim_ptr = None
    for cc in anim_t.m_GameObject.read().m_Component:
        if cc.component.type.name == 'Animation':
            anim_ptr = cc.component
    ad = anim_ptr.read_typetree()
    aa = anim_ptr.read()
    clip_pids = [c['m_PathID'] for c in ad['m_Animations'] if c['m_PathID']]
    clips = {pid: decode_ball_clip(aa.assets_file.objects[pid].read_typetree()) for pid in clip_pids}
    anim_paths = {}
    for d in clips.values():
        for p, tr in d['trs'].items():
            if p in by_path:
                anim_paths.setdefault(p, set()).update(tr)
    clip_report = []
    for pid, d in clips.items():
        chans, samps = [], []
        times = d['times'].astype(np.float32).reshape(-1, 1)
        tin = g.accessor(times, 5126, 'SCALAR', None, True)
        tin2 = g.accessor(np.array([[0.0], [d['len']]], np.float32), 5126, 'SCALAR', None, True)
        for path, keys in sorted(anim_paths.items()):
            ni = by_path[path]
            tr = d['trs'].get(path, {})
            nd = g.nodes[ni]
            for key, gpath in (('t', 'translation'), ('r', 'rotation'), ('s', 'scale')):
                if key not in keys:
                    continue
                if key in tr:
                    v = tr[key]
                    if key == 't':
                        v = v * [-1, 1, 1]
                        if path == '':  # nút gốc: cùng phép gộp scale cha đã bỏ như lúc dựng rest pose
                            v = v * root_scale
                    elif key == 'r':
                        v = v * [1, -1, -1, 1]
                        for i in range(1, len(v)):
                            if np.dot(v[i], v[i - 1]) < 0:
                                v[i] = -v[i]
                    elif key == 's' and path == '':
                        # rãnh scale trên nút gốc (vd. Open_Catch phồng to 0->1, Break teo nhỏ dần) THAY THẾ
                        # hẳn scale nghỉ đã gộp root_scale — phải nhân lại, nếu không quả bóng to gấp 1/root_scale
                        # lúc phát clip (bắt gặp thực tế: gấp ~10 lần vì root_scale=0.1).
                        v = v * root_scale
                    if np.abs(v - v[0]).max() < 1e-6:
                        v, ti = v[:1].repeat(2, 0), tin2
                    else:
                        ti = tin
                else:
                    v, ti = np.array([nd[gpath], nd[gpath]]), tin2
                out = g.accessor(v.astype(np.float32), 5126, 'VEC4' if key == 'r' else 'VEC3')
                samps.append({'input': ti, 'output': out, 'interpolation': 'LINEAR'})
                chans.append({'sampler': len(samps) - 1, 'target': {'node': ni, 'path': gpath}})
        g.anims.append({'name': d['name'], 'channels': chans, 'samplers': samps})
        clip_report.append({'name': d['name'], 'len': round(d['len'], 3), 'loop': d['loop']})

    raw = os.path.join(out_dir, '_raw_%s.glb' % re.sub(r'[^A-Za-z0-9_]+', '_', name))
    g.write(raw, [root_i])
    out = os.path.join(out_dir, '%s.glb' % re.sub(r'[^a-z0-9_]+', '', name.lower().replace(' ', '_')))
    poke.gltfpack(raw, out)
    os.remove(raw)

    # đường kính bóng: đo AABB tư thế nghỉ của lưới đã skin (bind pose)
    Wr = world()
    mats = np.stack([Wr[j] @ ibm[k] for k, j in enumerate(joints)])
    blend = (mats[ix] * w[:, :, None, None]).sum(1)
    P = np.einsum('nij,nj->ni', blend, np.c_[pos, np.ones(n)])[:, :3]
    diameter = float(P.max(0)[0] - P.min(0)[0])
    return os.path.relpath(out, GAME).replace('\\', '/'), clip_report, diameter, root_scale


def build_catch(env, F, fallback_cache):
    sa2 = F['sharedassets2.assets']
    battle_ids = item_battle_ids()
    shutil.rmtree(BALL_DIR, ignore_errors=True)
    ball_tex_dir = os.path.join(BALL_DIR, 'tex')
    os.makedirs(ball_tex_dir, exist_ok=True)
    balls = {}
    root_scales = set()
    diam_report = []
    for o in list(sa2.objects.values()):
        if o.type.name != 'MonoBehaviour':
            continue
        full, tt = ttg.read_mb(env, o)
        if full != 'CatchEffect':
            continue
        goptr = tt['m_GameObject']
        ce_go = sa2.objects[goptr['m_PathID']].read()
        name = ce_go.m_Name
        bid = battle_ids.get(norm_name(name))
        if bid is None:
            print('   [canh bao] khong tim thay BattleID cho bong "%s", bo qua' % name)
            continue
        ce_t = core.transform_of(ce_go)
        fr = core.Frame(ce_t, keep_root=False)  # scale 0.1 của gốc CatchEffect áp vào vị trí particle
        out_ptr, in_ptr = find_child(ce_t, 'Out Of Ball'), find_child(ce_t, 'In Ball')
        inside_t = find_comp(ce_t, 'PokeBall', 'Animation')  # chỉ để chắc nút PokeBall tồn tại
        pokeball_anim_t = find_child(ce_t, 'PokeBall')
        inside_effect_t = find_child(pokeball_anim_t, 'Inside Ball Effect') if pokeball_anim_t else None
        out_list = walk_particles(out_ptr, fr, fallback_cache) if out_ptr is not None else []
        in_list = walk_particles(in_ptr, fr, fallback_cache) if in_ptr is not None else []
        inside_list = walk_particles(inside_effect_t, fr, fallback_cache) if inside_effect_t is not None else []
        glb, clips, diameter, rscale = export_ball(name, ce_go, BALL_DIR, ball_tex_dir)
        root_scales.add(round(rscale, 4))
        diam_report.append((bid, diameter))
        balls[bid] = {'name': name, 'glb': glb, 'clips': clips, 'in': in_list, 'out': out_list, 'inside': inside_list}
    root_scale = next(iter(root_scales)) if len(root_scales) == 1 else sorted(root_scales)
    return {'rootScale': root_scale, 'balls': balls}, diam_report


# ================================================================== main
def write_js(data):
    header = ('// Sinh boi tools/rip_battle.py - dung sua tay. Hop dong: xem docstring dau tool.\n'
              '// Khung three.js (x da dao so voi Unity), don vi met, goc la khong gian cuc bo cua "Battle Arena".\n')
    body = 'window.P1 = window.P1 || {};\nP1.BATTLE = ' + json.dumps(round_all(data), ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(DATA_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(header + body)


def main():
    os.makedirs(STAGE_DIR, exist_ok=True)
    os.makedirs(BALL_DIR, exist_ok=True)
    fallback_cache = core.TexCache(os.path.join(BALL_DIR, 'tex'), max_size=1024)

    print('Nap core (level0/1/2 + shared assets)...')
    env = ttg.load_core()
    F = ttg.files(env)

    print('Doc san khau (Battle Arena, camera, den, nen)...')
    stage, stage_report = build_stage(env, F)

    print('Doc 9 NewBattleAnimation...')
    anims = build_anims(env, F)

    print('Doc Default Hit...')
    hit = build_hit(env, F, fallback_cache)

    print('Doc 25 CatchEffect + xuat glb bong...')
    catch, diam_report = build_catch(env, F, fallback_cache)

    data = {
        'enums': {'stepType': STEP_TYPES, 'target': TARGET_NAMES, 'cameraState': CAMERA_STATES,
                  'speed': {str(k): v for k, v in SPEED_MAP.items()}},
        'stage': stage, 'anims': anims, 'hit': hit, 'catch': catch,
    }
    write_js(data)

    def du(p):
        return sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(p) for f in fs) / 1e6
    print('--- xong ---')
    print('data/battle.js: %d KB' % (os.path.getsize(DATA_JS) // 1024))
    print('art/battle/stage: %.2f MB (%d/%d nen co glb)' % (du(STAGE_DIR), stage_report['backgrounds_exported'], stage_report['backgrounds_total']))
    print('art/battle/ball: %.2f MB (%d bong)' % (du(BALL_DIR), len(catch['balls'])))
    print('anims:', [a['name'] for a in anims])
    print('duong kinh bong (m):', ', '.join('%s=%.3f' % (b, d) for b, d in sorted(diam_report)))


if __name__ == '__main__':
    main()
