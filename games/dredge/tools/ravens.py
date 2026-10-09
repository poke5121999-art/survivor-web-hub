"""Quạ của sự kiện thế giới Ravens (MONSTERS.md §2.6, RavenWorldEvent.cs) -> data/ravens.js.

Chạy:  python -I games/dredge/tools/ravens.py        (vài giây, không ghi ảnh: hạt Ravens/Impactfx, mesh RavenMesh và texture đã có ở data/particles.js)
Đọc:   Assets/GameObject/Ravens.prefab (cây RavenRotater > RavenParent > AttackingRaven, ba TrailRenderer, ConstantlyRotateOnY, RavenWorldEvent),
       Assets/AnimationClip/RavenAttack.anim (đường cong Euler / vị trí / tỉ lệ + sự kiện hoạt ảnh + công tắc Impactfx),
       Assets/AnimatorController/RavensInsanityEventAnimator.controller (trigger "attack": Empty -> RavenAttack, về Empty khi hết clip).
Ra:    window.DR_RAVENS = { cfg, rig, clip{len, events, parent, raven, impact}, trails{shimmer, eye[]} }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z: vị trí z -> -z; Euler (x, y, z) -> (-x, -y, z) (cùng thứ tự ZXY = three 'YXZ');
        độ dốc đổi dấu theo giá trị. Khoá giữ nguyên thưa: [t, giá trị(n), inSlope(n), outSlope(n)] (Hermite theo từng thành phần).
Bẫy:   RavenAttack có m_PreInfinity = m_PostInfinity = 2 (lặp) nhưng bộ điều khiển chỉ phát một lần mỗi trigger (rồi về trạng thái rỗng, tỉ lệ AttackingRaven 0 ở prefab).
       Đường cong m_IsActive của Impactfx có outSlope Infinity (bậc thang): chỉ lấy thời điểm bật (1,5333 s), trùng sự kiện OnRavenAttackComplete.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys
import yaml

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'ravens.js')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)


def rnd(v, n=5):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, float):
        r = round(v, n)
        return 0.0 if r == 0 else r
    return v


def load_doc(path):
    txt = io.open(path, encoding='utf-8').read()
    parts = HDR.split(txt)
    objs = {}
    for i in range(1, len(parts), 3):
        body = yaml.load(parts[i + 2], Loader=CL)
        objs[int(parts[i + 1])] = (int(parts[i]), list(body.values())[0])
    return objs


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


def anim():
    doc = yaml.load(io.open(os.path.join(ASSETS, 'AnimationClip', 'RavenAttack.anim'), encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
    out = {}

    def add(lst, kind):
        for c in lst:
            keys = []
            for k in c['curve']['m_Curve']:
                v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                if kind == 'p':
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                elif kind == 'e':   # Euler (x, y, z) -> (-x, -y, z)
                    for a in (v, i, o):
                        a[0], a[1] = -a[0], -a[1]
                keys.append(rnd([float(k['time'])] + v + i + o, 5))
            out.setdefault(c['path'], {})[kind] = keys
    add(doc['m_EulerCurves'], 'e')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    imp = [c for c in doc['m_FloatCurves'] if c['attribute'] == 'm_IsActive' and c['path'] == 'RavenRotater/Impactfx'][0]
    on = [float(k['time']) for k in imp['curve']['m_Curve'] if float(k['value']) >= 0.5][0]
    ev = [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']]
    return float(doc['m_AnimationClipSettings']['m_StopTime']), ev, out, round(on, 5)


def grad_alpha(g):
    n = int(g['m_NumAlphaKeys'])
    return [[round(g['atime%d' % i] / 65535, 5), round(float(g['key%d' % i]['a']), 5)] for i in range(n)]


def trail(o):
    t = o['TrailRenderer'] if 'TrailRenderer' in o else o
    p = t['m_Parameters']
    g = p['colorGradient']
    col = [round(float(g['key0'][c]), 5) for c in 'rgb']
    return {'time': float(t['m_Time']), 'width': float(p['widthMultiplier']), 'minDist': float(t['m_MinVertexDistance']),
            'color': col, 'alpha': grad_alpha(g)}


def main():
    objs = load_doc(os.path.join(ASSETS, 'GameObject', 'Ravens.prefab'))
    byname = {}
    for fid, (cls, o) in objs.items():
        if cls == 1:
            byname[o['m_Name']] = fid
    comp = {}   # tên GameObject -> {lớp: đối tượng}
    for fid, (cls, o) in objs.items():
        g = o.get('m_GameObject')
        if g and g.get('fileID'):
            nm = objs[g['fileID']][1]['m_Name']
            comp.setdefault(nm, {})[cls] = o

    def lp(nm):
        p = comp[nm][4]['m_LocalPosition']
        return [float(p['x']), float(p['y']), -float(p['z'])]
    rot = [o for c, o in comp['RavenRotater'].items() if c == 114][0]
    wev = comp['Ravens'][114]
    clip_len, events, curves, imp_on = anim()
    # 3 TrailRenderer (lớp 96): ShimmerTrail + LEyeTrail + REyeTrail
    sh = trail(comp['ShimmerTrail'][96])
    eyes = []
    for nm in ('LEyeTrail', 'REyeTrail'):
        t = trail(comp[nm][96]); t['pos'] = lp(nm)
        eyes.append(t)
    sh['pos'] = lp('ShimmerTrail')
    mesh_sc = comp['AttackingRaven'][4]['m_LocalScale']
    data = {
        'cfg': {   # Ravens.prefab: RavenWorldEvent
            'attackDelay': float(wev['ravenAttackDelay']), 'numAttacks': int(wev['numAttacksToMake']), 'stealSize': int(wev['stealableFishSizeThreshold']),
            'finishDelay': float(wev['finishDelaySec']),
        },
        'rig': {
            'rotateSpeed': float(rot['rotateSpeed']), 'ccw': bool(rot['counterClockwise']),     # ConstantlyRotateOnY: độ/giây, Unity (+y) = three (-y)
            'swirl': [float(comp['SwirlingRavens'][4]['m_LocalPosition'][c]) * (1 if c != 'z' else -1) for c in 'xyz'],
            'ravenRest': lp('AttackingRaven'), 'ravenRestScale': vec(mesh_sc),
            'impact': lp('Impactfx'),
        },
        'clip': {'len': clip_len, 'events': events, 'impactOn': imp_on,
                 'parent': curves['RavenRotater/RavenParent'], 'raven': curves['RavenRotater/RavenParent/AttackingRaven']},
        'trails': {'shimmer': sh, 'eye': eyes},
    }
    txt = '// Sinh bởi tools/ravens.py từ Ravens.prefab + RavenAttack.anim (U5 ravens, MONSTERS.md §2.6). Không sửa tay.\nwindow.DR_RAVENS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(txt)
    print('ghi', OUT_JS, len(txt), 'byte')


main()
