"""Cua mimic (WreckMonster) + tuong dien (InsanityStatue) -> data/mimic.js, data/statues.js, art/vfx/mimic/*.webp, audio/monsters/wreck_*.mp3
(WORLD-GAPS.md §4 / §6 R6, don vi r6small).

Chay:  python -I games/dredge/tools/mimic.py        (~25 s; doc Game.unity 168 MB mot lan, can ffmpeg cho 2 clip tieng moi)
Doc:   Scenes/Game.unity:
         WreckMonsters/WreckMonster_{Boat,LoreRockVariant,ShipVariant,PlaneVariant}: WreckMonster.cs (id, banishAbility), SphereCollider trigger (r 2, tam (0,0,2.5)),
           nut Collider (CapsuleCollider khong trigger, layer 7), nut wreckmonster_boat (Animator wreckmonster_animator, WreckMonsterAnimationEvents),
           nut con *Crab (SkinnedMeshRenderer + WreckMonster_Mat), cay xuong back_jnt..., l_topclaw_jnt / r_topclaw_jnt (CapsuleCollider layer 7, m_Enabled 0,
           bat tat boi clip). Bien the Iceworld (DLC1, nam duoi nhom khac) khong xuat.
         DevilsSpine/Statue/*/InsanityStatue_* (60 InsanityStatue: panicToDistanceThreshold, maxDistance 150, evaluationIntervalSec 1, toggleObject = TurnOn),
           nut Eyes (InsanityStatueEyes: meshRenderers, 2..5 s) va EvilEyeBlendshape (SkinnedMeshRenderer khong xuong, Mesh EvilEye_Base 2 blendshape L/R, ShrineEye_Mat)
       AnimatorController/wreckmonster_animator.controller, AnimationClip/wreckmonster_{idle,attack,retreat}.anim, Mesh/{BoatCrab,LoreCrab1,ShipCrab,PlaneCrab1}.asset,
       Mesh/EvilEye_Base.asset, Material/{WreckMonster,ShrineEye}_Mat.mat, Texture2D/*, AudioClip/WreckMonster{SwipeAttack,Retreat}.ogg
Ra:    window.DR_MIMIC = { src, crabs[{id, name, variant, x, y, z, yaw, trigger{r, c}, body{p, q, r, h}}], variants{ten: {bones, skinBones, bindPoses, mesh, claws{l, r}}},
         clips{idle, attack, retreat: {len, loop, fps, n, tracks[{b: duong dan xuong}], events, claw{l, r: [[t, 0/1]]}}}, ctrl, claw{r, h, c}, audio{}, mat{}, tex{} }
       window.DR_STATUES = { src, config{maxDistance, interval}, curves[[t, v, in, out]...], eyes{pos[], uv[], idx[], morph[2][], tex}, list[{x, y, z, curve, on, eyes[{mx, ...}]}] }
Toa do: Unity trai tay -> three.js phai tay bang doi dau z (vi tri z, quaternion (x,y,z,w) -> (-x,-y,z,w)); ma tran the gioi cua mat mat = S·M·S, S = diag(1,1,-1).
Hoat anh: lay mau Hermite o 15 khung/giay [ĐỀ XUẤT] bang mindsucker.sample_clip, rang khoa theo DUONG DAN xuong (JS anh xa duong dan -> xuong cua tung bien the:
       bon bien the co 27-28 xuong, ban Boat va Plane khong co l_back_jnt).
Bay:   hat bui / bot / nuoc ban (EmergeDust, RetreatDust, Splashes, FoamTrail), InspectionGlint (lureParticles) va lua / khoi / than ('TurnOn' cua tuong) la he hat
       cua canh, khong co trong data/particles.js (chi xuat prefab GameObject/*) nen bo qua [ĐỀ XUẤT].
Rerunnable: cung dau vao ra cung dau ra (tung byte; mp3 do ffmpeg -fflags +bitexact).
"""
import base64, io, json, os, re, shutil, subprocess, sys, zlib

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import angler as AN   # noqa: E402
import tentacle as TN  # noqa: E402

import mindsucker as MS  # noqa: E402  (mbs, tf_of, comp_of, yaw_of, sample_clip, read_mesh_raw, asset_name)

GAME = os.path.dirname(HERE)
ASSETS = AN.ASSETS
OUT_MIMIC = os.path.join(GAME, 'data', 'mimic.js')
OUT_STAT = os.path.join(GAME, 'data', 'statues.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'mimic')
OUT_BIN = os.path.join(OUT_ART, 'crabs.bin')
OUT_SND = os.path.join(GAME, 'audio', 'monsters')
TEX_MAX = 256     # [ĐỀ XUẤT] goc WreckMonster_texture 512 / ShrineEye 256; quai cao ~3 m tren man hinh
rnd, vec, conv_q = AN.rnd, AN.vec, AN.conv_q

G = dict(wreck='55c6022c070ed81fdf047535ec5902f3', statue='36c23ad7acc1b4445ee5451fa6449987', eyes='cdca8b4bbde77495365a195e7b4d6c63')
CLIPS = ['wreckmonster_idle', 'wreckmonster_attack', 'wreckmonster_retreat']
CLAW_NODES = ['l_topclaw_jnt', 'r_topclaw_jnt']
SFLIP = np.diag([1.0, 1.0, -1.0, 1.0])


class AnyPath(dict):
    """sample_clip chi can .get(path): moi duong dan xuong that (back_jnt/...) deu giu, duong dan bam (path_0x...) bo."""
    def get(self, path, default=None):
        return path if path.startswith('back_jnt') else default


def three_mat(M):
    """Ma tran Unity 4x4 -> mang 16 so cot-truoc (three.js Matrix4.fromArray) trong khong gian z-dao."""
    return rnd((SFLIP @ M @ SFLIP).T.reshape(-1).tolist(), 6)


def save_tex(src, name, rgba=False):
    im = Image.open(src).convert('RGBA' if rgba else 'RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=85, method=6)
    return 'art/vfx/mimic/' + name + '.webp', os.path.getsize(p)


BLOBS = []   # (ten bien the, khoi nhi phan) -> crabs.bin (deflate-raw, JS giai bang DecompressionStream)


def pack_crab(m):
    """Mesh skin -> khoi nhi phan nho: vi tri / uv uint16 theo hop bao, luong anh huong bien do (k u8, k chi so xuong u8, k-1 trong so u8; trong so cuoi = 1 - tong),
    chi so tam giac uint16. Khong luu phap tuyen: Monster_Shader khong dung N·L (xem js/angler.js). Sai so luong tu < 0,01 % canh hop bao."""
    pos = np.array(m['pos'], dtype=np.float64).reshape(-1, 3)
    uv = np.array(m['uv'], dtype=np.float64).reshape(-1, 2)
    n = len(pos)
    assert n < 65536
    pmin, pmax, umin, umax = pos.min(0), pos.max(0), uv.min(0), uv.max(0)
    q = lambda a, lo, hi: np.round((a - lo) / np.where(hi > lo, hi - lo, 1) * 65535).astype('<u2')
    si = np.array(m['skinIndex']).reshape(-1, 4)
    sw = np.array(m['skinWeight']).reshape(-1, 4)
    inf = bytearray()
    for i in range(n):
        k = max(1, int((sw[i] > 1e-4).sum()))
        assert k == 1 or np.all(sw[i, :k] > 1e-4)
        inf.append(k)
        inf.extend(int(x) for x in si[i, :k])
        tot = float(sw[i, :k].sum())
        inf.extend(int(round(float(sw[i, j]) / tot * 255)) for j in range(k - 1))
    blob = q(pos, pmin, pmax).tobytes() + q(uv, umin, umax).tobytes() + bytes(inf) + np.array(m['index'], dtype='<u2').tobytes()
    meta = {'n': n, 'tris': len(m['index']) // 3, 'inf': len(inf), 'pmin': rnd(pmin.tolist(), 5), 'pmax': rnd(pmax.tolist(), 5), 'umin': rnd(umin.tolist(), 5), 'umax': rnd(umax.tolist(), 5)}
    return meta, blob


def mat_props(name):
    d = AN.yaml_body(os.path.join(ASSETS, 'Material', name + '.mat'))['m_SavedProperties']
    return d


def tex_of(props, key):
    return AN.guid_path('Texture2D', props['m_TexEnvs'][key]['m_Texture']['guid'])


# ---------------------------------------------------------------- cua mimic
def crabs_part(sc):
    out = []
    for f in MS.mbs(sc, G['wreck']):
        mb = sc.get(f)
        go = mb['m_GameObject']['fileID']
        tf = MS.tf_of(sc, go)
        if not sc.path_of_tf(tf).startswith('WreckMonsters/'):
            continue   # WreckMonster_Iceworld (DLC1)
        out.append((str(mb['id']), go, tf, mb))
    assert len(out) == 4, [o[0] for o in out]
    return sorted(out, key=lambda o: o[0])


def skeleton(sc, anim_tf, smr):
    """Cay xuong tu nut Animator: xuong skin + to tien + hai nut vuot (CLAW_NODES). Tra bones, skinBones, path->chi so, mesh, bind."""
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    keep, order = set(bone_ids), []
    claw_tf = {}
    stack = [anim_tf]
    while stack:   # tim nut vuot trong cay
        t = stack.pop()
        for c in sc.get(t)['m_Children']:
            nm = sc.name_of_tf(c['fileID'])
            if nm in CLAW_NODES:
                claw_tf[nm] = c['fileID']
            stack.append(c['fileID'])
    keep |= set(claw_tf.values())
    for b in list(keep):
        t = sc.get(b)['m_Father']['fileID']
        while t and t != anim_tf:
            keep.add(t)
            t = sc.get(t)['m_Father']['fileID']

    def walk(t, parent):
        order.append((t, parent))
        for c in sc.get(t)['m_Children']:
            if c['fileID'] in keep:
                walk(c['fileID'], len(order) - 1)
    for c in sc.get(anim_tf)['m_Children']:
        if c['fileID'] in keep:
            walk(c['fileID'], -1)
    index = {t: i for i, (t, _) in enumerate(order)}
    bones, path_of = [], {}
    for t, par in order:
        T = sc.get(t)
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        bones.append({'name': sc.name_of_tf(t), 'parent': par, 'p': rnd(p, 6), 'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(vec(T['m_LocalScale']), 6)})
        pp, x = [], t
        while x and x != anim_tf:
            pp.append(sc.name_of_tf(x))
            x = sc.get(x)['m_Father']['fileID']
        path_of['/'.join(reversed(pp))] = index[t]
    mesh_path = AN.guid_path('Mesh', smr['m_Mesh']['guid'])
    mesh, bind, nv = TN.read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids)
    meta, blob = pack_crab(mesh)
    meta['off'] = sum(len(b) for _, b in BLOBS)
    meta['len'] = len(blob)
    BLOBS.append((os.path.basename(mesh_path)[:-6], blob))
    return {'bones': bones, 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': meta, 'paths': path_of, 'claw_tf': claw_tf,
            'nv': nv, 'meshName': os.path.basename(mesh_path)[:-6]}


def capsule(sc, go):
    f = MS.comp_of(sc, go, 136)
    c = sc.get(f)
    return {'r': float(c['m_Radius']), 'h': float(c['m_Height']), 'dir': 'xyz'[int(c['m_Direction'])], 'c': rnd(vec(c['m_Center']), 4), 'trigger': int(c['m_IsTrigger']),
            'enabled': int(c['m_Enabled']), 'layer': int(sc.get(go)['m_Layer'])}


def claw_windows(name):
    d = AN.yaml_body(os.path.join(ASSETS, 'AnimationClip', name + '.anim'))
    out = {'l': [], 'r': []}
    for c in d.get('m_FloatCurves') or []:
        if c['attribute'] != 'm_Enabled':
            continue
        leaf = c['path'].split('/')[-1]
        k = 'l' if leaf == 'l_topclaw_jnt' else 'r' if leaf == 'r_topclaw_jnt' else None
        assert k, c['path']
        out[k] = [[round(MS.fl(x['time']), 4), int(MS.fl(x['value']) > 0.5)] for x in c['curve']['m_Curve']]
    return out


def mimic_part(sc, snd):
    crabs, variants, claw0, clips, ctrl = [], {}, None, {}, None
    for cid, go, tf, mb in crabs_part(sc):
        W = sc.world(tf)
        sph = sc.get(MS.comp_of(sc, go, 135))
        assert int(sph['m_IsTrigger']) == 1
        node_tf = [c['fileID'] for c in sc.get(tf)['m_Children'] if sc.name_of_tf(c['fileID']) == 'wreckmonster_boat'][0]
        node_go = sc.get(node_tf)['m_GameObject']['fileID']
        anim = sc.get(MS.comp_of(sc, node_go, 95))
        assert AN.guid_path('AnimatorController', anim['m_Controller']['guid']).endswith('wreckmonster_animator.controller')
        smr_tf = [c['fileID'] for c in sc.get(node_tf)['m_Children'] if MS.comp_of(sc, sc.get(c['fileID'])['m_GameObject']['fileID'], 137)][0]
        smr = sc.get(MS.comp_of(sc, sc.get(smr_tf)['m_GameObject']['fileID'], 137))
        sk = skeleton(sc, node_tf, smr)
        vname = sk['meshName']
        mats = {AN.guid_path('Material', m['guid']) for m in smr['m_Materials']}
        assert len(mats) == 1 and next(iter(mats)).endswith('WreckMonster_Mat.mat')
        # claws: bat dau tat, cung hinh dang o moi bien the
        cl = {}
        for k, nm in (('l', 'l_topclaw_jnt'), ('r', 'r_topclaw_jnt')):
            cgo = sc.get(sk['claw_tf'][nm])['m_GameObject']['fileID']
            cl[k] = {'bone': sk['paths'][[p for p in sk['paths'] if p.endswith(nm)][0]], **capsule(sc, cgo)}
            assert cl[k]['enabled'] == 0 and cl[k]['layer'] == 7 and not cl[k]['trigger']
        shape = {k: {a: cl[k][a] for a in ('r', 'h', 'dir', 'c')} for k in cl}
        if claw0 is None:
            claw0 = shape
        assert shape == claw0, 'ham claw khac nhau giua bien the'
        variants[vname] = {'bones': sk['bones'], 'skinBones': sk['skinBones'], 'bindPoses': sk['bindPoses'], 'mesh': sk['mesh'], 'paths': sk['paths'],
                           'claws': {k: cl[k]['bone'] for k in cl}}
        # khoi va cham Collider (layer 7) + ban tin hieu
        ctf = [c['fileID'] for c in sc.get(tf)['m_Children'] if sc.name_of_tf(c['fileID']) == 'Collider'][0]
        cgo = sc.get(ctf)['m_GameObject']['fileID']
        cap = capsule(sc, cgo)
        assert cap['layer'] == 7 and not cap['trigger'] and cap['c'] == [0, 0, 0]
        T = sc.get(ctf)
        lp = vec(T['m_LocalPosition'])
        body = {'p': rnd([lp[0], lp[1], -lp[2]], 4), 'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 5), 'r': cap['r'], 'h': cap['h'], 'dir': cap['dir']}
        sc_ = vec(sph['m_Center'])
        crabs.append({'id': cid, 'name': str(sc.get(go)['m_Name']), 'variant': vname, 'x': MS.xz(W)[0], 'y': round(float(W[1, 3]), 3), 'z': MS.xz(W)[1], 'yaw': MS.yaw_of(W),
                      'trigger': {'r': float(sph['m_Radius']), 'c': rnd([sc_[0], sc_[1], -sc_[2]], 4)}, 'body': body,
                      'banish': MS.asset_name('MonoBehaviour', mb['banishAbility']['guid'])})
        if not clips:
            for nm in CLIPS:
                c = MS.sample_clip(nm, AnyPath())
                c.pop('active', None)
                cw = claw_windows(nm)
                c['claw'] = cw
                clips[nm.replace('wreckmonster_', '')] = c
            ctrl = MS.controller('wreckmonster_animator')
            ev = sc.get(MS.comp_of(sc, node_go, 114, lambda b: 'emergeSFX' in b))
            au = sc.get(ev['audioSource']['fileID']) if 'audioSource' in ev else None
            for k, f in (('emerge', 'emergeSFX'), ('slam', 'slamAttackSFX'), ('swipe', 'swipeAttackSFX'), ('retreat', 'retreatSFX')):
                snd[k] = AN.guid_path('AudioClip', ev[f]['guid'])
            mat = mat_props('WreckMonster_Mat')
            albedo = tex_of(mat, 'Texture2D_23e21d2602df45a9921e7c096a6a9432')
            emis = tex_of(mat, 'Texture2D_f4d8f19682674cb985d212562826db7c')
            tex = {'albedo': save_tex(albedo, 'wreck_albedo')[0], 'emission': save_tex(emis, 'wreck_emission')[0]}
            F = mat['m_Floats']
            matd = {'emissionStrength': F['Vector1_b0d9cca47aa941e7b3c694dbf011a310'], 'emissionEffectiveDistance': F['_EmissionEffectiveDistance'],
                    'lightStrength': F['_LightStrength']}
    ids = [c['id'] for c in crabs]
    return {'crabs': crabs, 'variants': variants, 'clips': clips, 'claw': claw0, 'mat': matd, 'tex': tex,
            'ctrl': {'default': ctrl['default'], 'states': {k: v['clip'].replace('wreckmonster_', '') for k, v in ctrl['states'].items()},
                     'idleToAttack': 0.1, 'attackToRetreatBanish': 0.25, 'exitTime': 1.0},   # AnimatorController: Idle->Attack (Attack, !isBanished) 0,1 s; Attack->Retreat (isBanished) 0,25 s hoac ExitTime 1; Retreat->Idle ExitTime 1
            'audio': {'spatialBlend': 1, 'min': 25, 'max': 100}, 'ids': ids}   # WreckMonsterAnimationEvents.Awake


# ---------------------------------------------------------------- tuong dien
def hermite_keys(curve):
    return [[MS.fl(k['time']), MS.fl(k['value']), MS.fl(k['inSlope']), MS.fl(k['outSlope'])] for k in curve['m_Curve']]


def statues_part(sc):
    fs = MS.mbs(sc, G['statue'])
    assert len(fs) == 60, len(fs)
    curves, cfg, eyes_tf = [], None, None
    lst = []
    eye_guid = None
    rawE = None
    for f in fs:
        mb = sc.get(f)
        go = mb['m_GameObject']['fileID']
        tf = MS.tf_of(sc, go)
        W = sc.world(tf)
        key = json.dumps(hermite_keys(mb['panicToDistanceThreshold']))
        assert mb['panicToDistanceThreshold']['m_PreInfinity'] == 2 and mb['panicToDistanceThreshold']['m_PostInfinity'] == 2
        if key not in [json.dumps(c) for c in curves]:
            curves.append(json.loads(key))
        ci = [json.dumps(c) for c in curves].index(key)
        c2 = (float(mb['maxDistance']), float(mb['evaluationIntervalSec']))
        cfg = cfg or c2
        assert c2 == cfg
        tog = mb['toggleObject']['fileID']
        # nut Eyes: hau due cua toggleObject co InsanityStatueEyes
        ttf = MS.tf_of(sc, tog)
        eyes = []

        def walk(t):
            for ch in sc.get(t)['m_Children']:
                g = sc.get(ch['fileID'])['m_GameObject']['fileID']
                ef = MS.comp_of(sc, g, 114, lambda b: 'evaluationIntervalMinSec' in b)
                if ef:
                    e = sc.get(ef)
                    EW = sc.world(ch['fileID'])
                    fw = EW[:3, 2] / np.linalg.norm(EW[:3, 2])
                    meshes = []
                    for r in e['meshRenderers']:
                        rg = sc.get(r['fileID'])['m_GameObject']['fileID']
                        smr = sc.get(r['fileID'])
                        assert not smr['m_Bones'] and 'ShrineEye_Mat' in AN.guid_path('Material', smr['m_Materials'][0]['guid'])
                        nonlocal_guid.add(smr['m_Mesh']['guid'])
                        meshes.append(three_mat(sc.world(MS.tf_of(sc, rg))))
                    eyes.append({'p': rnd([float(EW[0, 3]), float(EW[1, 3]), float(EW[2, 3])], 3), 'f': rnd(fw.tolist(), 5), 'min': float(e['evaluationIntervalMinSec']),
                                 'max': float(e['evaluationIntervalMaxSec']), 'm': meshes})
                walk(ch['fileID'])
        nonlocal_guid = globals().setdefault('_EYE_GUIDS', set())
        walk(ttf)
        assert eyes, 'tuong khong co mat'
        lst.append({'n': str(sc.get(go)['m_Name']), 'x': MS.xz(W)[0], 'y': round(float(W[1, 3]), 3), 'z': MS.xz(W)[1], 'curve': ci,
                    'on': int(sc.get(tog)['m_IsActive']), 'eyes': eyes})
    guids = globals()['_EYE_GUIDS']
    assert len(guids) == 1, guids
    mp = AN.guid_path('Mesh', next(iter(guids)))
    d = AN.yaml_body(mp)
    raw = MS.read_mesh_raw(mp)
    n = len(raw['pos'])
    pos = raw['pos'].copy()
    pos[:, 2] *= -1
    nrm = raw['nrm'].copy()
    nrm[:, 2] *= -1
    tri = np.concatenate(raw['subs']).reshape(-1, 3)[:, [0, 2, 1]]
    sh = d['m_Shapes']
    names = [c['name'] for c in sh['channels']]
    assert names == ['blendShape1.EvilEye_LeftShape', 'blendShape1.EvilEye_RightShape'], names
    morph = []
    for s in sh['shapes']:
        dv = np.zeros((n, 3))
        for v in sh['vertices'][s['firstVertex']: s['firstVertex'] + s['vertexCount']]:
            dv[v['index']] = [v['vertex']['x'], v['vertex']['y'], -v['vertex']['z']]
        morph.append(rnd(dv.reshape(-1).tolist(), 4))
    mat = mat_props('ShrineEye_Mat')
    etex = save_tex(tex_of(mat, 'Texture2D_9aa7ba2263944b48bbf43c218dc48459'), 'shrine_eye')[0]
    eyes_mesh = {'pos': rnd(pos.reshape(-1).tolist(), 4), 'nrm': rnd(nrm.reshape(-1).tolist(), 3), 'uv': rnd(raw['uv'].reshape(-1).tolist(), 4), 'idx': tri.reshape(-1).tolist(),
                 'morph': morph, 'tex': etex, 'lightStrength': mat['m_Floats']['_LightStrength']}
    return {'config': {'maxDistance': cfg[0], 'evaluationIntervalSec': cfg[1]}, 'curves': curves, 'eyes': eyes_mesh, 'list': lst}


# ---------------------------------------------------------------- tieng
def encode_snd(snd):
    ff = shutil.which('ffmpeg')
    out = {}
    os.makedirs(OUT_SND, exist_ok=True)
    for k, src in sorted(snd.items()):
        stem = os.path.basename(src).rsplit('.', 1)[0]
        dst = os.path.join(OUT_SND, stem + '.mp3')
        if k in ('swipe', 'retreat') and ff and not os.path.exists(dst + '.skip'):
            subprocess.check_call([ff, '-y', '-v', 'error', '-i', src, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', '-fflags', '+bitexact', dst])
        out[k] = {'src': 'audio/monsters/' + stem + '.mp3', 'orig': stem, 'bytes': os.path.getsize(dst) if os.path.exists(dst) else 0}
    return out


def main():
    sc = AN.Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    snd = {}
    M = mimic_part(sc, snd)
    M['audio'].update(encode_snd(snd))
    M['src'] = 'Scenes/Game.unity (WreckMonsters x4, WreckMonster.cs / WreckMonsterAnimationEvents.cs), AnimatorController/wreckmonster_animator, AnimationClip/wreckmonster_*, Mesh/*Crab*, Material/WreckMonster_Mat'
    S = statues_part(sc)
    S['src'] = 'Scenes/Game.unity (60 InsanityStatue + InsanityStatueEyes + EvilEyeBlendshape), Mesh/EvilEye_Base, Material/ShrineEye_Mat'
    raw = b''.join(b for _, b in BLOBS)
    co = zlib.compressobj(9, zlib.DEFLATED, -15)
    packed = co.compress(raw) + co.flush()
    os.makedirs(OUT_ART, exist_ok=True)
    open(OUT_BIN, 'wb').write(packed)
    M['bin'] = {'src': 'art/vfx/mimic/crabs.bin', 'raw': len(raw), 'size': len(packed), 'enc': 'deflate-raw'}
    print('crabs.bin raw %d KB -> %d KB' % (len(raw) // 1024, len(packed) // 1024))
    for path, var, d in ((OUT_MIMIC, 'DR_MIMIC', M), (OUT_STAT, 'DR_STATUES', S)):
        js = '// Generated by games/dredge/tools/mimic.py from Game.unity. Do not edit.\nwindow.%s = ' % var + json.dumps(d, separators=(',', ':')) + ';\n'
        io.open(path, 'w', encoding='utf-8', newline='\n').write(js)
        print(os.path.basename(path), len(js) // 1024, 'KB')
    print('crabs', [(c['id'], c['variant'], c['x'], c['z']) for c in M['crabs']])
    print('clips', {k: (c['len'], len(c['tracks'])) for k, c in M['clips'].items()})
    print('statues', len(S['list']), 'curves', len(S['curves']), 'eyes/statue', sorted({len(s['eyes']) for s in S['list']}), 'meshes/eye', sorted({len(e['m']) for s in S['list'] for e in s['eyes']}),
          'on', sum(s['on'] for s in S['list']))


if __name__ == '__main__':
    main()
