"""Mind Sucker (TSMonster) + bẫy cối của Phi công ở Twisted Strand (WORLD-GAPS.md §4/§6 R3, đơn vị r3mind) -> data/mindsucker.js,
art/vfx/mindsucker/*.webp, audio/monsters/mindsucker/*.mp3.

Chạy:  python -I games/dredge/tools/mindsucker.py        (~15 s; đọc Game.unity 168 MB một lần, cần ffmpeg cho tiếng)
Đọc:   Scenes/Game.unity:
         Logic/MonsterManager/TwistedStrandMonsterManager (TwistedStrandMonsterManager.cs: allTriggerBoxes, monster)
         TwistedStrand/Monsters/Triggers/* (TSMonsterTriggerBox.cs: BoxCollider trigger, associatedMonsterId, spawnPointCandidates)
         TwistedStrand/Monsters/TSMonster (TSMonster.cs cấu hình, NavMeshAgent, Eye/FieldOfView.cs, head_ctrl/InsanityEffector =
           SanityModifier.cs + CapsuleCollider trigger, AudioSource Main/Scan/Drain), con TSMonster (Animator TwistedStrandMonsterAnimator,
           SkinnedMeshRenderer polySurface341 với TSMonsterSpore_Mat + TSMonster_Mat)
         TwistedStrand/Traps/Trap1..3 (MortarQuestStepAnimatorTriggerable.cs, TwistedStrandTrapAnimationEvents.cs, Animator
           TwistedStrandTrapMain; con MonsterTrap/ActiveTrap/MonsterTrap (SkinnedMeshRenderer MonsterTrap_mesh), MonsterTrap/DestroyedTrap/*,
           MonsterTrap/Bait/*, TSMonster (Animator TSMonsterTrapped))
       AnimatorController/{TwistedStrandMonsterAnimator,TSMonsterTrapped,TwistedStrandTrapMain}.controller, AnimationClip/TSM_*.anim,
       TwistedStrandTrapActivate.anim, Mesh/*.asset, Material/{TSMonster,TSMonsterSpore,PlaneWreck,MonsterBait}_Mat.mat, Texture2D/*.png,
       MonoBehaviour/SoldierSubMonster{1,2,3}_{Trap,Wait}.asset (tên bước nhiệm vụ), Audio/SFX/Monster/Twisted Strand/*.ogg.
Ra:    window.DR_MINDSUCKER = { src, manager{boxes[], spawns[]}, monster{cfg, agent, eye, effector, sanity, start, audio}, ctrl, bones[],
       skinBones[], bindPoses[], mesh, groups[], clips{tên: {len, loop, fps, n, tracks[], glow[], col[], events[], active{}}}, traps[],
       trapMain{len, events[], active{}, root{p, q}}, trapped{ctrl}, trapMesh{active, destroyed, bait}, mat{}, tex{}, audio{} }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w)); vị trí thế giới three.js [x, z].
Hoạt ảnh: lấy mẫu Hermite của AnimationCurve (như DRAnim.evalCurve) ở FPS khung/giây cho mọi xương skin + gốc; rãnh hằng giữ 1 khung;
       lượng tử Int16 (quaternion ×32767, vị trí theo hộp min/max của rãnh), base64. JS nội suy tuyến tính/nlerp giữa hai khung.
Bẫy: MonsterTrap_mesh là SkinnedMeshRenderer: da theo tư thế xương lưu trong cảnh (CPU, ở đây) rồi xuất như mesh tĩnh, không chạy
     TrapActivateRW (hàm kẹp rơi) [ĐỀ XUẤT: rút gọn]. Ba bẫy dùng chung một bộ mesh theo toạ độ local của Trap1 (đã kiểm khớp Trap2/3).
Rerunnable: cùng đầu vào ra cùng đầu ra (từng byte; mp3 do ffmpeg -fflags +bitexact).
"""
import base64, io, json, os, re, shutil, subprocess, sys

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import angler as AN   # noqa: E402  (Scene, guid_path, yaml_body, load_doc, rnd, vec, conv_q)
import tentacle as TN  # noqa: E402  (read_skinned_mesh)
import ray as RY       # noqa: E402  (pack_mesh)

GAME = os.path.dirname(HERE)
ASSETS = AN.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'mindsucker.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'mindsucker')
OUT_SND = os.path.join(GAME, 'audio', 'monsters', 'mindsucker')
FPS = 15          # [ĐỀ XUẤT] khung lấy mẫu hoạt ảnh; clip gốc 30 khung/giây (Maya bake), 15 đủ mượt ở khoảng cách camera và giữ dữ liệu nhỏ
TEX_MAX = 256     # [ĐỀ XUẤT] gốc 512 (TSMonster_Texture), 256 đủ cho quái cao ~5 m trên màn hình
rnd, vec, conv_q = AN.rnd, AN.vec, AN.conv_q

G = dict(manager='e0da4363d4e4b590b01d26e5f00d231e', monster='2ae18ded18d63a3c98aebe255c359fe6', box='337ec74a5075f38a9e13724895535462',
         mortar='349108f80ec8a55f98254f044fe11cb1', trapev='c5cf7defb22c04a918b51ccd90b018d1', fov='1ad0cd106d44e290c33453183f9bc961',
         sanity=None)
ROAM_CLIPS = ['TSM_SpawnRW', 'TSM_SpawnIdleRW', 'TSM_SpawnIdletoSearchRW', 'TSM_SearchIdleRW', 'TSM_SearchIdletoDrainRW', 'TSM_DrainIdleRW', 'TSM_BanishRW']
TRAP_CLIPS = ['TSM_Spawn', 'TSM_SpawnIdletoSearch', 'TSM_BaitSeekMoveLoop', 'TSM_BaitEatStart', 'TSM_BaitEatIdle', 'TSM_TrapActivate']
GLOW = 'material.Vector1_1c69703a107d4054b649838c74ab046e'   # GlowPulse_Shader: cường độ phát sáng (clip đẩy 0 -> 2 -> 5 -> 10..30 khi hút)
COL = 'material.Color_a7ce2b7bd770432e92093ddfae428c15'      # GlowPulse_Shader: màu phát sáng (vàng đất 0,45/0,36/0,18 -> đỏ 0,66/0/0 khi hút)


# ---------------------------------------------------------------- tiện ích cảnh
def mbs(sc, guid):
    out = []
    for m in re.finditer(r'm_Script: \{fileID: 11500000, guid: %s' % guid, sc.txt):
        h = AN.HDR.match(sc.txt, sc.txt.rfind('\n--- !u!', 0, m.start()) + 1)
        out.append(int(h.group(2)))
    return out


def tf_of(sc, go):
    return sc.comp(go, lambda ty, fid: ty in (4, 224))


def comp_of(sc, go, ty_want, pred=None):
    for c in sc.get(go)['m_Component']:
        fid = c['component']['fileID']
        if sc.at[fid][0] == ty_want and (pred is None or pred(sc.get(fid))):
            return fid
    return None


def child(sc, tf, name):
    for c in sc.get(tf)['m_Children']:
        if sc.name_of_tf(c['fileID']) == name:
            return c['fileID']
    raise SystemExit('không thấy con %s dưới %s' % (name, sc.path_of_tf(tf)))


def xz(W):
    return rnd([float(W[0, 3]), -float(W[2, 3])], 3)


def yaw_of(W):
    """Góc quay quanh trục y của three.js (rotation.y) cho ma trận Unity: hướng trước Unity (W[:,2]) -> three (x, -z)."""
    fx, fz = float(W[0, 2]), -float(W[2, 2])
    return round(float(np.arctan2(-fx, -fz)), 5)   # three: vật nhìn theo -z khi rotation.y = 0; hướng +z Unity = -z three


def asset_name(kind, guid):
    return os.path.basename(AN.guid_path(kind, guid)).rsplit('.', 1)[0]


def audio_path(guid):
    for r, _, fs in sorted(os.walk(os.path.join(ASSETS, 'Audio'))):
        for f in sorted(fs):
            if f.endswith('.meta'):
                with io.open(os.path.join(r, f), encoding='utf-8') as h:
                    if 'guid: ' + guid in h.read(300):
                        return os.path.join(r, f[:-5])
    raise SystemExit('không thấy AudioClip guid ' + guid)


# ---------------------------------------------------------------- mesh tĩnh (có/không skin), đọc kênh như tentacle.read_skinned_mesh
def read_mesh_raw(path):
    d = AN.yaml_body(path)
    vd = d['m_VertexData']
    n, ch = vd['m_VertexCount'], vd['m_Channels']
    raw = bytes.fromhex(vd['_typelessdata'])
    FSZ = [4, 2, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4]
    streams = {}
    for c in ch:
        if c['dimension'] & 15:
            streams[c['stream']] = max(streams.get(c['stream'], 0), c['offset'] + FSZ[c['format']] * (c['dimension'] & 15))
    base, off = {}, 0
    for s in sorted(streams):
        base[s] = off
        off += (streams[s] * n + 15) // 16 * 16

    def chan(i):
        c = ch[i]
        if not (c['dimension'] & 15):
            return None
        dim, fmt, st = c['dimension'] & 15, c['format'], c['stream']
        rows = np.frombuffer(raw[base[st]: base[st] + streams[st] * n], dtype=np.uint8).reshape(n, streams[st])
        a = rows[:, c['offset']: c['offset'] + FSZ[fmt] * dim].copy()
        if fmt == 0:
            return a.view(np.float32).reshape(n, dim).astype(np.float64)
        if fmt == 1:
            return a.view(np.float16).reshape(n, dim).astype(np.float64)
        if fmt == 2:
            return a.reshape(n, dim).astype(np.float64) / 255.0
        if fmt == 10:
            return a.view(np.uint32).reshape(n, dim).astype(np.int64)
        if fmt == 4:
            return a.view(np.uint16).reshape(n, dim).astype(np.int64)
        raise SystemExit('định dạng kênh %d chưa hỗ trợ' % fmt)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    w16 = d.get('m_IndexFormat', 0) == 0
    idx = np.frombuffer(ib, dtype=np.uint16 if w16 else np.uint32).astype(np.int64)
    subs = []
    for sm in d['m_SubMeshes']:
        first = sm['firstByte'] // (2 if w16 else 4)
        subs.append((idx[first: first + sm['indexCount']] + sm.get('baseVertex', 0)).reshape(-1, 3))
    bind = [np.array([[b['e%d%d' % (r, c)] for c in range(4)] for r in range(4)], dtype=np.float64) for b in d.get('m_BindPose') or []]
    return {'pos': chan(0), 'nrm': chan(1)[:, :3], 'uv': chan(4)[:, :2], 'w': chan(12), 'bi': chan(13), 'subs': subs, 'bind': bind}


def mesh_in(M, raw, mats):
    """raw (Unity, không gian mesh) biến đổi bằng M (4x4 Unity) -> danh sách (vật liệu, pos three, nrm three, uv, tam giác)."""
    p = (M[:3, :3] @ raw['pos'].T).T + M[:3, 3]
    nm = (np.linalg.inv(M[:3, :3]).T @ raw['nrm'].T).T
    nm /= np.maximum(np.linalg.norm(nm, axis=1, keepdims=True), 1e-9)
    p[:, 2] *= -1
    nm[:, 2] *= -1
    return [(mats[i], p, nm, raw['uv'], tri[:, [0, 2, 1]]) for i, tri in enumerate(raw['subs'])]


def merge(parts):
    """Gộp các phần cùng vật liệu -> {mat: khối base64 Float->Int16 theo hộp (pos), Int8 (nrm), Uint16 (uv), Uint16/Uint32 (index)}."""
    by = {}
    for mat, p, nm, uv, tri in parts:
        by.setdefault(mat, []).append((p, nm, uv, tri))
    out = {}
    for mat in sorted(by):
        P, N, U, I, o = [], [], [], [], 0
        for p, nm, uv, tri in by[mat]:
            used = np.unique(tri)
            remap = -np.ones(len(p), dtype=np.int64)
            remap[used] = np.arange(len(used)) + o
            P.append(p[used]); N.append(nm[used]); U.append(uv[used]); I.append(remap[tri])
            o += len(used)
        P, N, U, I = np.concatenate(P), np.concatenate(N), np.concatenate(U), np.concatenate(I).reshape(-1)
        lo, hi, ulo, uhi = P.min(0), P.max(0), U.min(0), U.max(0)
        q = np.round((P - lo) / np.where(hi > lo, hi - lo, 1) * 65535).astype('<u2')
        uq = np.round((U - ulo) / np.where(uhi > ulo, uhi - ulo, 1) * 65535).astype('<u2')
        nb = np.round(np.clip(N, -1, 1) * 127).astype('i1').tobytes()
        assert o < 65536
        blob = q.tobytes() + nb + bytes(len(nb) % 2) + uq.tobytes() + I.astype('<u2').tobytes()
        out[mat] = {'n': int(o), 'tris': int(len(I) // 3), 'pmin': rnd(lo.tolist(), 4), 'pmax': rnd(hi.tolist(), 4), 'umin': rnd(ulo.tolist(), 5),
                    'umax': rnd(uhi.tolist(), 5), 'b64': base64.b64encode(blob).decode('ascii')}
    return out


# ---------------------------------------------------------------- AnimationCurve
def herm(keys, t):
    """keys [(t, v, in, out)] (một thành phần). Hermite như Unity; ngoài khoảng giữ đầu/cuối; tiếp tuyến vô cực = bậc thang."""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    lo = 0
    while keys[lo + 1][0] < t:
        lo += 1
    k0, k1 = keys[lo], keys[lo + 1]
    dt = k1[0] - k0[0]
    m0, m1 = k0[3], k1[2]
    if not np.isfinite(m0) or not np.isfinite(m1) or dt <= 0:
        return k0[1]
    s = (t - k0[0]) / dt
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * m0 * dt + (s3 - s2) * m1 * dt + (3 * s2 - 2 * s3) * k1[1]


def fl(v):
    return float(v) if not isinstance(v, str) else float(v.replace('Infinity', 'inf'))


def comp_keys(curve, ax):
    return [(fl(k['time']), fl(k['value'][ax]) if ax else fl(k['value']), fl(k['inSlope'][ax]) if ax else fl(k['inSlope']),
             fl(k['outSlope'][ax]) if ax else fl(k['outSlope'])) for k in curve['m_Curve']]


def q16(a):
    return base64.b64encode(np.round(np.clip(a, -1, 1) * 32767).astype('<i2').tobytes()).decode('ascii')


def sample_clip(name, bone_of_path, root_alias=None):
    """Clip -> rãnh lấy mẫu theo FPS. bone_of_path: đường dẫn (tương đối nút Animator) -> chỉ số xương; root_alias: tên path coi là gốc ('root')."""
    d = AN.yaml_body(os.path.join(ASSETS, 'AnimationClip', name + '.anim'))
    st = d['m_AnimationClipSettings']
    L = fl(st['m_StopTime'])
    n = max(2, int(round(L * FPS)) + 1)
    ts = np.linspace(0, L, n)
    tr = {}
    for field, kind, axes in (('m_RotationCurves', 'q', 'xyzw'), ('m_EulerCurves', 'e', 'xyz'), ('m_PositionCurves', 'p', 'xyz')):
        for c in d.get(field) or []:
            path = c['path']
            key = 'root' if root_alias is not None and path == root_alias else bone_of_path.get(path)
            if key is None:
                continue
            assert c['curve'].get('m_RotationOrder', 4) == 4, 'Euler không phải ZXY'
            vals = np.array([[herm(comp_keys(c['curve'], ax), t) for ax in axes] for t in ts])
            if kind == 'e':   # localEulerAnglesRaw (độ, ZXY của Unity: R = Ry·Rx·Rz) -> quaternion Unity
                kind = 'q'
                h = np.radians(vals) / 2
                cx, sx, cy, sy, cz, sz = np.cos(h[:, 0]), np.sin(h[:, 0]), np.cos(h[:, 1]), np.sin(h[:, 1]), np.cos(h[:, 2]), np.sin(h[:, 2])
                vals = np.stack([cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz], 1)
            if kind == 'q':
                vals = np.array([conv_q(v) for v in vals])
                vals /= np.linalg.norm(vals, axis=1, keepdims=True)
                for i in range(1, n):
                    if np.dot(vals[i], vals[i - 1]) < 0:
                        vals[i] = -vals[i]
            else:
                vals[:, 2] *= -1
            tr.setdefault(key, {})[kind] = vals
    tracks = []
    for key in sorted(tr, key=lambda k: (-1 if k == 'root' else k)):
        t = {'b': key}
        for kind, vals in sorted(tr[key].items()):
            const = float(np.abs(vals - vals[0]).max()) < 1e-4
            v = vals[:1] if const else vals
            if kind == 'q':
                t['q'] = q16(v)
            else:
                lo, hi = v.min(0), v.max(0)
                t['p'] = base64.b64encode(np.round((v - lo) / np.where(hi > lo, hi - lo, 1) * 65535 - 32768).astype('<i2').tobytes()).decode('ascii')
                t['plo'], t['phi'] = rnd(lo.tolist(), 5), rnd(hi.tolist(), 5)
            t[kind + 'n'] = len(v)
        tracks.append(t)
    glow, col, active = None, None, {}
    for c in d.get('m_FloatCurves') or []:
        a = c['attribute']
        if a == GLOW:
            glow = rnd([herm(comp_keys(c['curve'], None), t) for t in ts], 3)
        elif a.startswith(COL + '.'):
            col = col or {}
            col[a[-1]] = [herm(comp_keys(c['curve'], None), t) for t in ts]
        elif a == 'm_IsActive' and not re.fullmatch(r'path_0x.*|\d+', c['path']):
            active[c['path'].split('/')[-1]] = [[round(fl(k['time']), 4), int(fl(k['value']) > 0.5)] for k in c['curve']['m_Curve']]
    if col:
        col = rnd([[col['r'][i], col['g'][i], col['b'][i]] for i in range(n)], 3)
    ev = [{'t': round(fl(e['time']), 4), 'fn': e['functionName']} for e in d['m_Events']]
    out = {'len': round(L, 4), 'loop': bool(int(st['m_LoopTime'])), 'fps': FPS, 'n': n, 'tracks': tracks, 'events': ev}
    if glow:
        out['glow'] = glow
    if col:
        out['col'] = col
    if active:
        out['active'] = active
    return out


def controller(name):
    states, default, trans = AN.controller(os.path.join(ASSETS, 'AnimatorController', name + '.controller'))
    st = {}
    for s in states.values():
        st[s['name']] = {'clip': asset_name('AnimationClip', s['clip']) if s['clip'] else None, 'speed': s['speed']}
    objs = AN.load_doc(os.path.join(ASSETS, 'AnimatorController', name + '.controller'))
    anyt = []
    for i, (ty, b, _) in objs.items():
        if ty == 1107:
            for t in b.get('m_AnyStateTransitions') or []:
                tb = objs[t['fileID']][1]
                anyt.append({'to': objs[tb['m_DstState']['fileID']][1]['m_Name'], 'when': [c['m_ConditionEvent'] for c in tb['m_Conditions']]})
    return {'default': default, 'states': st, 'transitions': trans, 'any': anyt}


def save_tex(name):
    im = Image.open(os.path.join(ASSETS, 'Texture2D', name + '.png')).convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=85, method=6)
    return 'art/vfx/mindsucker/' + name + '.webp', os.path.getsize(p)


# ---------------------------------------------------------------- chính
def main():
    sc = AN.Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    mgr_fid, = mbs(sc, G['manager'])
    mgr = sc.get(mgr_fid)
    mon_fid = mgr['monster']['fileID']
    mon = sc.get(mon_fid)
    mon_go = mon['m_GameObject']['fileID']
    mon_tf = tf_of(sc, mon_go)

    # --- hộp kích hoạt + điểm xuất hiện (thế giới three.js)
    boxes, spawns, sp_index = [], [], {}
    for b in mgr['allTriggerBoxes']:
        mb = sc.get(b['fileID'])
        go = mb['m_GameObject']['fileID']
        tf = tf_of(sc, go)
        W = sc.world(tf)
        bc = sc.get(comp_of(sc, go, 65))
        assert int(bc['m_IsTrigger']) == 1 and vec(bc['m_Center']) == [0, 0, 0]
        cand = []
        for sp in mb['spawnPointCandidates']:
            f = sp['fileID']
            if f not in sp_index:
                Ws = sc.world(f)
                sp_index[f] = len(spawns)
                spawns.append({'name': sc.path_of_tf(f).split('/')[-1], 'x': xz(Ws)[0], 'z': xz(Ws)[1], 'yaw': yaw_of(Ws)})
            cand.append(sp_index[f])
        sz = vec(bc['m_Size'])
        boxes.append({'name': str(sc.get(go)['m_Name']), 'id': int(mb['associatedMonsterId']), 'x': xz(W)[0], 'z': xz(W)[1], 'yaw': yaw_of(W),
                      'hx': sz[0] / 2, 'hz': sz[2] / 2, 'spawns': cand})

    # --- cấu hình TSMonster + con
    cfg = {k: float(mon[k]) for k in ('peekTimeUntilEmergeSec', 'detectTimeUntilDrainSec', 'searchTimeUntilGiveUpSec', 'lossTimeUntilLoseDetectionSec',
                                       'velocityMagnitudeThreshold', 'angularVelocityMagnitudeThreshold', 'rotationSpeedRadPerSec',
                                       'timeBetweenRepaths', 'spawnDistanceThreshold', 'arriveDistanceThreshold', 'minTimeSpentDraining')}
    cfg['vineAttack'] = asset_name(['MonoBehaviour', 'Data'], mon['vineAttackData']['guid'])
    cfg['despawnInvokeSec'] = 2.5   # TSMonster.cs:168 Invoke("OnDespawnComplete", 2.5f)
    cfg['drainSanityCut'] = 0.05    # TSMonster.cs:235 CurrentSanity <= 0.05f
    ag = sc.get(mon['navMeshAgent']['fileID'])
    agent = {k[2].lower() + k[3:]: float(ag[k]) for k in ('m_Speed', 'm_Acceleration', 'm_AngularSpeed', 'm_StoppingDistance', 'm_Radius')}
    eye = sc.get(mon['eye']['fileID'])
    eye_tf = tf_of(sc, eye['m_GameObject']['fileID'])
    eye_d = {'viewRadius': float(eye['viewRadius']), 'viewAngle': float(eye['viewAngle']), 'timeBetweenSearchesSec': float(eye['timeBetweenSearchesSec']),
             'y': round(float(vec(sc.get(eye_tf)['m_LocalPosition'])[1]), 3)}
    anim_fid = mon['animator']['fileID']
    anim = sc.get(anim_fid)
    anim_go = anim['m_GameObject']['fileID']
    anim_tf = tf_of(sc, anim_go)
    eff_go = [g for g in sc.go_named('InsanityEffector') if sc.path_of_tf(tf_of(sc, g)).startswith(sc.path_of_tf(anim_tf) + '/')]
    assert len(eff_go) == 1
    eff_tf = tf_of(sc, eff_go[0])
    cap = sc.get(comp_of(sc, eff_go[0], 136))
    san = sc.get(comp_of(sc, eff_go[0], 114, lambda b: 'fullValueNight' in b))
    effector = {'radius': float(cap['m_Radius']), 'height': float(cap['m_Height']), 'dir': 'xyz'[int(cap['m_Direction'])],
                'center': rnd(vec(cap['m_Center']), 4), 'parent': sc.name_of_tf(sc.get(eff_tf)['m_Father']['fileID'])}
    sanity = {k: float(san[k]) for k in ('fullValueDay', 'fullValueNight', 'fullValueRadius', 'partialValueMinDay', 'partialValueMinNight', 'partialValueRadius')}
    sanity['ignoreTimescale'] = bool(int(san['ignoreTimescale']))
    Wm = sc.world(mon_tf)
    start = {'x': xz(Wm)[0], 'z': xz(Wm)[1], 'yaw': yaw_of(Wm)}

    # --- âm thanh (AudioSource trên các nút con + danh sách clip)
    snd_files = {}

    def clip_ref(g):
        p = audio_path(g)
        nm = os.path.basename(p).rsplit('.', 1)[0]
        snd_files[nm] = p
        return nm

    def src(fid):
        a = sc.get(fid)
        c = a['m_audioClip']
        return {'clip': clip_ref(c['guid']) if c.get('guid') else None, 'vol': float(a['m_Volume']), 'loop': bool(int(a['Loop'])),
                'min': float(a['MinDistance']), 'max': float(a['MaxDistance'])}
    audio = {'main': src(mon['audioSource']['fileID']), 'scan': src(mon['scanAudio']['fileID']), 'drain': src(mon['drainAudio']['fileID']),
             'emerge': [clip_ref(c['guid']) for c in mon['emergeClips']], 'splash': [clip_ref(c['guid']) for c in mon['splashClips']],
             'submerge': [clip_ref(c['guid']) for c in mon['submergeClips']]}

    # --- bộ xương (cây từ nút Animator) + mesh skin polySurface341
    smr_fid = None
    for t in [anim_tf]:
        for c in sc.get(t)['m_Children']:
            g = sc.get(c['fileID'])['m_GameObject']['fileID']
            f = comp_of(sc, g, 137)
            if f:
                smr_fid = f
    smr = sc.get(smr_fid)
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    keep, order = set(bone_ids), []
    for b in bone_ids:
        t = sc.get(b)['m_Father']['fileID']
        while t and t != anim_tf:
            keep.add(t)
            t = sc.get(t)['m_Father']['fileID']

    def walk(t, parent):
        order.append((t, parent))
        for c in sc.get(t)['m_Children']:
            if c['fileID'] in keep:
                walk(c['fileID'], len(order) - 1 if t != anim_tf else -1)
    for c in sc.get(anim_tf)['m_Children']:
        if c['fileID'] in keep:
            walk(c['fileID'], -1)
    index = {t: i for i, (t, _) in enumerate(order)}
    bones, path_of = [], {}
    for t, par in order:
        T = sc.get(t)
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        bones.append({'name': sc.name_of_tf(t), 'parent': par, 'p': rnd(p, 6), 'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6),
                      's': rnd(vec(T['m_LocalScale']), 6)})
        pp, x = [], t
        while x and x != anim_tf:
            pp.append(sc.name_of_tf(x))
            x = sc.get(x)['m_Father']['fileID']
        path_of['/'.join(reversed(pp))] = index[t]
    mesh_path = AN.guid_path('Mesh', smr['m_Mesh']['guid'])
    mesh, bind, nv = TN.read_skinned_mesh(mesh_path)
    raw = read_mesh_raw(mesh_path)
    assert len(bind) == len(bone_ids)
    mats = [asset_name('Material', m['guid']) for m in smr['m_Materials']]
    groups, o = [], 0
    for i, tri in enumerate(raw['subs']):
        groups.append({'start': o, 'count': int(tri.size), 'mat': mats[i]})
        o += int(tri.size)
    head_bone = index[[t for t in order_ids(order) if sc.name_of_tf(t) == 'head_jnt'][0]]

    # --- clip
    clips = {}
    for nm in ROAM_CLIPS:
        clips[nm] = sample_clip(nm, path_of)
    for nm in TRAP_CLIPS:
        clips[nm] = sample_clip(nm, path_of)
    ctrl = controller('TwistedStrandMonsterAnimator')
    trapped = controller('TSMonsterTrapped')
    for c in (ctrl, trapped):
        for s in c['states'].values():
            assert s['clip'] is None or s['clip'] in clips, s['clip']

    # --- bẫy
    traps = []
    trap_tf0 = None
    for f in sorted(mbs(sc, G['mortar']), key=lambda f: sc.get(f)['triggerThisTrapOnAnimationComplete']):
        b = sc.get(f)
        go = b['m_GameObject']['fileID']
        tf = tf_of(sc, go)
        W = sc.world(tf)
        ev = sc.get(comp_of(sc, go, 114, lambda x: 'mortarFireParticles' in x))
        tm = sc.get(child(sc, tf, 'TSMonster'))
        tp = vec(tm['m_LocalPosition'])
        traps.append({'id': int(b['triggerThisTrapOnAnimationComplete']), 'name': str(sc.get(go)['m_Name']), 'x': xz(W)[0], 'z': xz(W)[1], 'yaw': yaw_of(W),
                      'step': asset_name('MonoBehaviour', b['questStepData']['guid']), 'trigger': b['triggerName'],
                      'completeStep': asset_name('MonoBehaviour', b['completeThisStepOnAnimationComplete']['guid']),
                      'monsterLocal': {'p': rnd([tp[0], tp[1], -tp[2]], 4), 'q': rnd(conv_q(vec(tm['m_LocalRotation'], 'xyzw')), 5)},
                      'audio': {'trap': src(ev['trapAudioSource']['fileID']), 'mortar': src(ev['mortarAudioSource']['fileID'])},
                      'mortarAt': xz(sc.world(tf_of(sc, sc.get(ev['mortarAudioSource']['fileID'])['m_GameObject']['fileID'])))})
        if trap_tf0 is None:
            trap_tf0, ev0 = tf, ev
    trap_audio = {'emerge': [clip_ref(c['guid']) for c in ev0['emergeSFXClips']], 'emergeCall': [clip_ref(c['guid']) for c in ev0['emergeCallSFXClips']],
                  'eating': clip_ref(ev0['eatingSFXClip']['guid']), 'trigger': clip_ref(ev0['triggerSFXClip']['guid']),
                  'explode': clip_ref(ev0['explodeSFXClip']['guid']), 'trapped': [clip_ref(c['guid']) for c in ev0['trappedSFXClips']]}
    tmain = sample_clip('TwistedStrandTrapActivate', {}, root_alias='TSMonster')
    main_ctrl = controller('TwistedStrandTrapMain')

    # --- mesh bẫy (toạ độ local của Trap1, three.js)
    Winv = np.linalg.inv(sc.world(trap_tf0))
    mtrap = child(sc, trap_tf0, 'MonsterTrap')

    def statics(root_tf):
        parts = []
        stack = [root_tf]
        while stack:
            t = stack.pop()
            go = sc.get(t)['m_GameObject']['fileID']
            mf = comp_of(sc, go, 33)
            if mf:
                mr = comp_of(sc, go, 23)
                mm = [asset_name('Material', m['guid']) for m in sc.get(mr)['m_Materials']]
                parts += mesh_in(Winv @ sc.world(t), read_mesh_raw(AN.guid_path('Mesh', sc.get(mf)['m_Mesh']['guid'])), mm)
            stack += [c['fileID'] for c in sc.get(t)['m_Children']]
        return parts
    active_tf = child(sc, mtrap, 'ActiveTrap')
    smr_trap = None
    stack = [active_tf]
    while stack:
        t = stack.pop()
        f = comp_of(sc, sc.get(t)['m_GameObject']['fileID'], 137)
        if f:
            smr_trap = f
        stack += [c['fileID'] for c in sc.get(t)['m_Children']]
    st = sc.get(smr_trap)
    rt = read_mesh_raw(AN.guid_path('Mesh', st['m_Mesh']['guid']))
    BW = [Winv @ sc.world(b['fileID']) @ B for b, B in zip(st['m_Bones'], rt['bind'])]   # da CPU theo tư thế xương lưu trong cảnh
    P = np.zeros((len(rt['pos']), 3))
    N = np.zeros((len(rt['pos']), 3))
    for k in range(4):
        for bi in np.unique(rt['bi'][:, k]):
            sel = rt['bi'][:, k] == bi
            w = rt['w'][sel, k:k + 1]
            M = BW[int(bi)]
            P[sel] += w * ((M[:3, :3] @ rt['pos'][sel].T).T + M[:3, 3])
            N[sel] += w * (M[:3, :3] @ rt['nrm'][sel].T).T
    rt2 = dict(rt, pos=P, nrm=N)
    tmats = [asset_name('Material', m['guid']) for m in st['m_Materials']]
    active_parts = mesh_in(np.eye(4), rt2, tmats)
    trap_mesh = {'active': merge(active_parts), 'destroyed': merge(statics(child(sc, mtrap, 'DestroyedTrap'))), 'bait': merge(statics(child(sc, mtrap, 'Bait')))}

    # --- vật liệu + texture
    tex, size = {}, 0
    matd = {}
    for mname in sorted(set(mats) | {m for g in trap_mesh.values() for m in g}):
        md = AN.yaml_body(AN.guid_path('Material', guid_of_mat(mname)))
        sp = md['m_SavedProperties']
        te = sp['m_TexEnvs']
        e = {}
        for key, slot in (('Texture2D_9aa7ba2263944b48bbf43c218dc48459', 'map'), ('Texture2D_4d740421464545a3b7ee68f44af80d8d', 'glow')):
            if key in te and te[key]['m_Texture'].get('guid'):
                tn = asset_name('Texture2D', te[key]['m_Texture']['guid'])
                if tn not in tex:
                    tex[tn], n = save_tex(tn)
                    size += n
                e[slot] = tn
        F, C = sp['m_Floats'], sp['m_Colors']
        if 'glow' in e:
            gc = C['Color_a7ce2b7bd770432e92093ddfae428c15']
            e.update({'glowColour': rnd([gc['r'], gc['g'], gc['b']], 4), 'glowStrength': float(F.get('_GlowStrength', 0)),
                      'pulseNoiseScale': float(F['Vector1_510b5236724c4baf8b247633e22ae309']), 'pulseStrength': float(F['Vector1_d6d36bb5307a4f74a2f7513ff2789271'])})
        matd[mname] = e

    # --- tiếng: mp3 mono, 64 kb/s một phát, 48 kb/s cho vòng lặp (theo profile sfx/amb của tools/audio.py)
    audio_out = {}
    ff = shutil.which('ffmpeg')
    os.makedirs(OUT_SND, exist_ok=True)
    loops = {audio['scan']['clip'], audio['drain']['clip']}
    for nm in sorted(snd_files):
        fn = re.sub(r'[^A-Za-z0-9]+', '_', nm).strip('_') + '.mp3'
        dst = os.path.join(OUT_SND, fn)
        if ff:
            subprocess.check_call([ff, '-y', '-v', 'error', '-i', snd_files[nm], '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k' if nm in loops else '64k',
                                   '-map_metadata', '-1', '-fflags', '+bitexact', dst])
        audio_out[nm] = {'src': 'audio/monsters/mindsucker/' + fn, 'loop': nm in loops, 'bytes': os.path.getsize(dst) if os.path.exists(dst) else 0}

    data = {
        'src': 'Scenes/Game.unity (TwistedStrandMonsterManager, TSMonsterTriggerBox ×%d, TSMonster, Trap1-3), AnimatorController/TwistedStrandMonsterAnimator, '
               'TSMonsterTrapped, TwistedStrandTrapMain, Mesh/polySurface341 + MonsterTrap_mesh + DestroyedTrap/Bait, Material/*_Mat' % len(boxes),
        'manager': {'boxes': boxes, 'spawns': spawns, 'triggerPad': 1.0},   # [ĐỀ XUẤT] thuyền là điểm + 1 m (va chạm hộp của collider thuyền)
        'monster': {'cfg': cfg, 'agent': agent, 'eye': eye_d, 'effector': effector, 'sanity': sanity, 'start': start, 'audio': audio, 'headBone': head_bone},
        'ctrl': ctrl, 'bones': bones, 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': RY.pack_mesh(mesh), 'groups': groups,
        'clips': clips, 'traps': traps, 'trapAudio': trap_audio, 'trapMain': dict(tmain, ctrl=main_ctrl), 'trapped': trapped,
        'trapMesh': trap_mesh, 'mat': matd, 'tex': tex, 'audio': audio_out,
    }
    js = '// Generated by games/dredge/tools/mindsucker.py from Game.unity (TwistedStrand) + TSM clips. Do not edit.\nwindow.DR_MINDSUCKER = ' + \
        json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('boxes %d spawns %d  bones %d skin %d verts %d  clips %d  traps %d  js %d KB  tex %d KB  audio %d KB (%d)' % (
        len(boxes), len(spawns), len(bones), len(bone_ids), nv, len(clips), len(traps), len(js) // 1024, size // 1024,
        sum(a['bytes'] for a in audio_out.values()) // 1024, len(audio_out)))
    for k, c in clips.items():
        print('  %-26s %.2fs n %d tracks %d events %s' % (k, c['len'], c['n'], len(c['tracks']), [e['fn'] for e in c['events']]))


def order_ids(order):
    return [t for t, _ in order]


_mat_guid = {}


def guid_of_mat(name):
    if not _mat_guid:
        d = os.path.join(ASSETS, 'Material')
        for fn in sorted(os.listdir(d)):
            if fn.endswith('.mat.meta'):
                m = re.search(r'^guid: ([0-9a-f]+)', io.open(os.path.join(d, fn), encoding='utf-8').read(300), re.M)
                _mat_guid[fn[:-9]] = m.group(1)
    return _mat_guid[name]


if __name__ == '__main__':
    main()
