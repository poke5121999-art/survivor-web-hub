"""Mối nguy Twisted Strand: tường rễ (TSRootWall), nấm nổ (ExplodingMushrooms), dây leo (VinesWorldEvent) (WORLD-GAPS.md §4/§6 R4, đơn vị r4ts)
-> data/tshazards.js, art/vfx/tshazards/*.webp, audio/world/tshazards/*.mp3.

Chạy:  python -I games/dredge/tools/tshazards.py        (~40 s; đọc Game.unity 168 MB một lần qua tools/explosives.py Scene, cần ffmpeg cho tiếng)
Đọc:   Scenes/Game.unity:
         TwistedStrand/RootWalls/* : TSRootWall.cs (20 cái; cấu hình, Animator RootWallController), con Models (5 mesh TwistedStrandBranch1) +
           Colliders (7 BoxCollider layer 7, bật/tắt theo clip), NavMeshObstacle.
         TwistedStrand/ExplodingMushrooms/* : ExplodingMushrooms.cs (99 cái; sanityThreshold, pitch, AudioSource grow, explodeVFX), 3 nút
           ExplodingMushroom{,(1),(2)} mỗi nút có MushroomHead_Mesh + MushroomStalk_Mesh, SafeCollider (SphereCollider trigger bật/tắt theo clip).
       AnimatorController/{RootWallController,ExplodingMushrooms,VineAttack}.controller; AnimationClip/RootWall_{Show,Hide,ShowIdle,HideIdle}.anim,
       ExplodingMushrooms_{Idle,Explode,Spawn(=Respawn)}.anim, Vine_SpawnRW.anim, Tentacle_Retract.anim;
       GameObject/Vines.prefab (VinesWorldEvent + 4 AttackingTentacle: Vine1..4, mesh Vine.asset, vật liệu TwistedStrandTreeTrunks_Mat),
       Data/WorldEvent/Vines.asset (đã có trong data/worldevents.js), Audio/SFX/World Event/{Vine Tentacles,Vine Wall,Mushrooms}/*.ogg.
Ra:    window.DR_TSHAZARDS = { src, walls{cfg, clips{show,hide}, list[{id, x, z, models[{inst, m[10], mir, A{p,q,s}}], fp}], audio},
       mushrooms{cfg, clips{explode,respawn}, list[{id, x, z, trig{c,r}, nodes[{S{p,q,s}, head{inst, m, mir, T}, stalk{inst, m, mir, T}}]}], audio},
       vines{...bones/skin/clips như data/tentacle.js..., list[{name, scale, anchor, strength, delay, sfx}], tex, tint, audio} }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w), Euler độ ZXY của Unity -> quaternion rồi cùng phép đó).
Vật cảnh tĩnh: tường rễ và nấm đã nằm sẵn trong art/world/instances.bin (tools/world.py gom mọi MeshRenderer dưới TwistedStrand ở tư thế cảnh = ShowIdle /
       Idle). Ở đây chỉ ghi chỉ số instance (khớp theo vị trí thế giới như tools/explosives.py) để js/tshazards.js ẩn chúng (DRWorld.hideInstances) và vẽ bản
       động bằng đúng hình học + vật liệu của thế giới. `mir` = ma trận thế giới có định thức âm (tools/world.py decompose đã nướng gương x vào mesh biến thể).
       Dấu chân va chạm `fp` = các ô landmask.png mà 7 collider của tường vẽ ra (cùng phép với tools/explosives.py footprint).
Bẫy:   (1) VinesWorldEvent.DelayedEventFinish đợi MỌI vine IsAttackFinished rồi Destroy ngay: vine đã xong ở cuối clip Spawn nên Retract chỉ chạy khi bị
       RequestEventFinish SỚM. (2) Clip nấm "ExplodingMushrooms_Spawn.anim" là trạng thái Respawn của controller (3,15 s; SafeCollider.m_Enabled bật ở 2,633).
       (3) m_EulerCurves của đầu nấm tính bằng độ (rung ±2°).
Rerunnable: cùng đầu vào ra cùng đầu ra (từng byte; mp3 do ffmpeg -fflags +bitexact).
"""
import io, json, math, os, re, shutil, subprocess, sys

import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import explosives as EX   # noqa: E402  (Scene, collider_polys, footprint, read_mesh, guid_map)
import tentacle as TN     # noqa: E402  (load_doc, guid_path, read_skinned_mesh, curves)
import mindsucker as MS   # noqa: E402  (herm, comp_keys, fl)

GAME = os.path.dirname(HERE)
ASSETS = EX.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'tshazards.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'tshazards')
OUT_SND = os.path.join(GAME, 'audio', 'world', 'tshazards')
FPS = 30        # [ĐỀ XUẤT] khung lấy mẫu clip tường / nấm (clip gốc ≤ 3,15 s; JS nội suy tuyến tính giữa hai khung)
TEX_MAX = 256   # [ĐỀ XUẤT] texture thân dây leo: gốc 1024
SOLID = EX.SOLID
rnd = TN.rnd


# ---------------------------------------------------------------- tiện ích
def trs(S, go):
    """Local TRS của GameObject (Unity thô) -> {p, q, s} đã đổi sang three.js."""
    b = S.docs[S.tr(go)][1]
    p = EX.vec(re.search(r'm_LocalPosition: (\{[^}]*\})', b).group(1))
    q = EX.vec(re.search(r'm_LocalRotation: (\{[^}]*\})', b).group(1), 'xyzw')
    s = EX.vec(re.search(r'm_LocalScale: (\{[^}]*\})', b).group(1))
    return {'p': rnd([p[0], p[1], -p[2]], 5), 's': rnd(s, 5), 'q': rnd([-q[0], -q[1], q[2], q[3]], 6)}


def det_neg(S, go):
    return bool(np.linalg.det(S.world(go)[:3, :3]) < 0)


def eul2q(e):
    """Euler độ (x, y, z) Unity ZXY (R = Ry·Rx·Rz) -> quaternion Unity (x, y, z, w)."""
    h = np.radians(e) / 2
    cx, sx, cy, sy, cz, sz = np.cos(h[0]), np.sin(h[0]), np.cos(h[1]), np.sin(h[1]), np.cos(h[2]), np.sin(h[2])
    return [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz]


def sample(name, want):
    """Clip -> {len, n, fps, ch: {đường dẫn: {p|s|q: phẳng}}, act: {đường dẫn: [[t, 0/1]]}, ev: [{t, fn}], en: [[t, 0/1]] (m_Enabled của collider)}.
    want: 'p' vị trí (z đổi dấu), 's' tỉ lệ, 'q' xoay (quaternion hoặc Euler)."""
    d = MS.AN.yaml_body(os.path.join(ASSETS, 'AnimationClip', name + '.anim'))
    L = MS.fl(d['m_AnimationClipSettings']['m_StopTime'])
    n = max(1, int(round(L * FPS))) + 1
    ts = np.linspace(0, L, n)
    ch = {}
    for field, kind in (('m_PositionCurves', 'p'), ('m_ScaleCurves', 's'), ('m_RotationCurves', 'q'), ('m_EulerCurves', 'e')):
        out = 'q' if kind == 'e' else kind
        if out not in want:
            continue
        for c in d.get(field) or []:
            axes = 'xyzw' if kind == 'q' else 'xyz'
            v = np.array([[MS.herm(MS.comp_keys(c['curve'], ax), t) for ax in axes] for t in ts])
            if kind == 'e':
                v = np.array([eul2q(x) for x in v])
            if out == 'q':
                v = np.array([[-x[0], -x[1], x[2], x[3]] for x in v]) if kind == 'e' else np.array([[-x[0], -x[1], x[2], x[3]] for x in v])
                v /= np.linalg.norm(v, axis=1, keepdims=True)
                for i in range(1, n):
                    if np.dot(v[i], v[i - 1]) < 0:
                        v[i] = -v[i]
            elif out == 'p':
                v[:, 2] *= -1
            ch.setdefault(c['path'], {})[out] = rnd(v.reshape(-1).tolist(), 5)
    act, en = {}, []
    for c in d.get('m_FloatCurves') or []:
        ks = [[round(MS.fl(k['time']), 4), int(MS.fl(k['value']) > 0.5)] for k in c['curve']['m_Curve']]
        if c['attribute'] == 'm_IsActive':
            act[c['path']] = ks
        elif c['attribute'] == 'm_Enabled':
            en = ks
    return {'len': round(L, 4), 'n': n, 'fps': FPS, 'ch': ch, 'act': act, 'en': en,
            'ev': [{'t': round(MS.fl(e['time']), 4), 'fn': e['functionName']} for e in d['m_Events']]}


def audio_of(guid, out, key):
    """AudioClip theo guid -> mp3 mono 64 kb/s (profile sfx của tools/audio.py), ghi vào OUT_SND; out[key] = {src, bytes}."""
    p = MS.audio_path(guid)
    nm = os.path.basename(p)[:-4]
    fn = re.sub(r'[^A-Za-z0-9]+', '_', nm).strip('_') + '.mp3'
    os.makedirs(OUT_SND, exist_ok=True)
    dst = os.path.join(OUT_SND, fn)
    ff = shutil.which('ffmpeg')
    if ff:
        subprocess.check_call([ff, '-y', '-v', 'error', '-i', p, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', '-fflags', '+bitexact', dst])
    out[key] = {'src': 'audio/world/tshazards/' + fn, 'orig': nm, 'bytes': os.path.getsize(dst) if os.path.exists(dst) else 0}


def clip_guid_named(rel):
    """Guid của một tệp trong Assets (đường dẫn tương đối) theo .meta."""
    with io.open(os.path.join(ASSETS, rel + '.meta'), encoding='utf-8') as f:
        return re.search(r'guid: (\w+)', f.read(300)).group(1)


def match_inst(inst, w):
    m = np.where((np.abs(inst[:, 0] - w[0, 3]) < 0.02) & (np.abs(inst[:, 1] - w[1, 3]) < 0.02) & (np.abs(inst[:, 2] + w[2, 3]) < 0.02))[0]
    return [int(i) for i in m]


# ---------------------------------------------------------------- tường rễ + nấm (Game.unity)
def scene_part(S, snd):
    L = json.load(io.open(EX.WORLD, encoding='utf-8'))['landmask']
    land = np.asarray(Image.open(EX.LAND).convert('L')) > 127
    inst = np.fromfile(os.path.join(GAME, 'art', 'world', 'instances.bin'), dtype='<f4').reshape(-1, 10)
    mesh_guid = EX.guid_map('Mesh', '.asset')
    mesh_cache = {}

    def mesh_of(guid):
        if guid not in mesh_cache:
            mesh_cache[guid] = EX.read_mesh(mesh_guid[guid])
        return mesh_cache[guid]

    def fields(k):
        return yaml.load(S.docs[k][1], Loader=EX.CL)['MonoBehaviour']

    # ---- tường rễ
    wk = sorted((k for k, (c, b) in S.docs.items() if c == 114 and 'playerSanityThreshold:' in b), key=lambda k: S.world(S.go_of(k))[0, 3])
    keys = ('minTimeBetweenChecks', 'maxTimeBetweenChecks', 'minPlayerDistance', 'maxPlayerDistance', 'playerSanityThreshold', 'sfxCloseDistance', 'sfxFarDistance')
    cfg0 = {k: float(fields(wk[0])[k]) for k in keys}
    walls = []
    for k in wk:
        f = fields(k)
        assert {x: float(f[x]) for x in keys} == cfg0, 'tường rễ có cấu hình khác nhau: ' + S.path(S.go_of(k))
        g = S.go_of(k)
        W = S.world(g)
        models = next(c for c in S.kids(g) if S.name(c) == 'Models')
        cols = next(c for c in S.kids(g) if S.name(c) == 'Colliders')
        ms = {}
        for c in S.kids(models):
            nm = S.name(c)
            idx = 0 if nm == 'TwistedStrand_BigTreeRoot1' else int(re.search(r'\((\d)\)', nm).group(1))
            hit = match_inst(inst, S.world(c))
            assert len(hit) == 1, 'tường %s mô hình %s: %d instance' % (S.path(g), nm, len(hit))
            ms[idx] = {'inst': hit[0], 'm': rnd(inst[hit[0]].tolist(), 5), 'mir': det_neg(S, c), 'A': trs(S, c)}
        assert sorted(ms) == [0, 1, 2, 3, 4]
        polys = []
        for x in S.kids(cols):
            if S.eff_active(x) and S.layer(x) in SOLID:
                for c in S.of_type(x, 65):
                    p = EX.collider_polys(S, x, c, mesh_of)
                    if p:
                        polys.extend(p)
        fp = EX.footprint(polys, L)
        px = sum(r[2] for r in fp)
        white = sum(int(land[j, i:i + n].sum()) for j, i, n in fp if 0 <= j < land.shape[0])
        walls.append({'id': len(walls), 'x': rnd(float(W[0, 3]), 2), 'z': rnd(float(-W[2, 3]), 2), 'models': [ms[i] for i in range(5)], 'fp': fp, 'px': px, 'land': white})
    # clip tường rễ: vị trí / tỉ lệ của 5 mô hình + bật/tắt Colliders
    wclips = {}
    for key, nm in (('show', 'RootWall_Show'), ('hide', 'RootWall_Hide')):
        c = sample(nm, 'ps')
        order = {}
        for path, v in c['ch'].items():
            m = re.match(r'Models/TwistedStrand_BigTreeRoot1(?: \((\d)\))?$', path)
            order[int(m.group(1) or 0)] = v
        wclips[key] = {'len': c['len'], 'n': c['n'], 'fps': FPS, 'm': [order[i] for i in range(5)], 'col': c['act']['Colliders']}
    wr = fields(wk[0])
    waud = {}
    audio_of(wr['emergeClip']['guid'], waud, 'emerge')
    audio_of(wr['submergeClip']['guid'], waud, 'submerge')
    print('tuong re %d: %s | cac pixel fp %d, dat %d' % (len(walls), cfg0, sum(w['px'] for w in walls), sum(w['land'] for w in walls)))

    # ---- nấm nổ
    mk = sorted((k for k, (c, b) in S.docs.items() if c == 114 and 'mushroomAnimator:' in b), key=lambda k: S.world(S.go_of(k))[0, 3])
    f0 = fields(mk[0])
    mcfg = {'sanityThreshold': float(f0['sanityThreshold']), 'pitchMin': float(f0['pitchMin']), 'pitchMax': float(f0['pitchMax'])}
    mush = []
    for k in mk:
        f = fields(k)
        assert float(f['sanityThreshold']) == mcfg['sanityThreshold'] and float(f['pitchMin']) == mcfg['pitchMin'], 'nấm có cấu hình khác'
        g = S.go_of(k)
        W = S.world(g)
        nodes = {}
        trig = None
        for c in S.kids(g):
            nm = S.name(c)
            if nm.startswith('ExplodingMushroom'):
                idx = 0 if nm == 'ExplodingMushroom' else int(re.search(r'\((\d)\)', nm).group(1))
                node = {'S': trs(S, c)}
                for part in S.kids(c):
                    pn = S.name(part)
                    hit = match_inst(inst, S.world(part))
                    assert len(hit) == 1, 'nấm %s %s: %d instance' % (S.path(g), pn, len(hit))
                    node['head' if pn == 'MushroomHead_Mesh' else 'stalk'] = {'inst': hit[0], 'm': rnd(inst[hit[0]].tolist(), 5), 'mir': det_neg(S, part), 'T': trs(S, part)}
                nodes[idx] = node
        # OnTriggerEnter: SphereCollider (trigger, bán kính 2,5) nằm trên chính GameObject ExplodingMushrooms; clip bật/tắt m_Enabled của nó (path rỗng).
        # SafeCollider con (r 0,75, không trigger) là va chạm cứng, đã nằm trong landmask.
        sp = S.of_type(g, 135)[0]
        body = S.docs[sp][1]
        assert re.search(r'm_IsTrigger: (\d)', body).group(1) == '1'
        cc = EX.vec(re.search(r'm_Center: (\{[^}]*\})', body).group(1))
        scl = np.linalg.norm(W[:3, :3], axis=0).max()
        p = W @ [cc[0], cc[1], cc[2], 1]
        trig = {'c': rnd([float(p[0]), float(p[1]), float(-p[2])], 3), 'r': rnd(float(re.search(r'm_Radius: ([\d.eE+-]+)', body).group(1)) * float(scl), 3)}
        assert sorted(nodes) == [0, 1, 2] and trig, 'nấm %s thiếu nút' % S.path(g)
        mush.append({'id': len(mush), 'x': rnd(float(W[0, 3]), 2), 'z': rnd(float(-W[2, 3]), 2), 'trig': trig, 'nodes': [nodes[i] for i in range(3)]})
    # AudioSource grow (một cái cho mọi nấm; chỉ ghi clip + khoảng cách) và AudioSource của explodeVFX
    mg = S.go_of(mk[0])
    aud = S.of_type(mg, 82)
    maud = {}
    grow_guid = None
    if aud:
        b = S.docs[aud[0]][1]
        grow_guid = re.search(r'm_audioClip: \{[^}]*guid: (\w+)', b)
        grow_guid = grow_guid.group(1) if grow_guid else None
        mcfg['grow'] = {'vol': float(re.search(r'm_Volume: ([\d.eE+-]+)', b).group(1)), 'min': float(re.search(r'MinDistance: ([\d.eE+-]+)', b).group(1)),
                        'max': float(re.search(r'MaxDistance: ([\d.eE+-]+)', b).group(1)), 'loop': int(re.search(r'Loop: (\d)', b).group(1))}
    if grow_guid:
        audio_of(grow_guid, maud, 'grow')
    audio_of(clip_guid_named('Audio/SFX/World Event/Mushrooms/World Event - Mushroom Explode.ogg'), maud, 'explode')
    mclips = {}
    for key, nm in (('explode', 'ExplodingMushrooms_Explode'), ('respawn', 'ExplodingMushrooms_Spawn')):
        c = sample(nm, 'pseq')
        per = [{} for _ in range(3)]
        for path, v in c['ch'].items():
            m = re.match(r'ExplodingMushroom(?: \((\d)\))?(/MushroomHead_Mesh)?$', path)
            per[int(m.group(1) or 0)]['H' if m.group(2) else 'S'] = v
        mclips[key] = {'len': c['len'], 'n': c['n'], 'fps': FPS, 'nodes': per, 'en': c['en'], 'ev': c['ev']}
    # tư thế Idle của đầu nấm theo clip (scale 1, Euler 0): đối chiếu với tư thế cảnh
    off = max(max(abs(x - 1) for x in n['head']['T']['s']) for m in mush for n in m['nodes'])
    print('nam %d: %s | lech tu the canh so voi Idle (scale) toi da %.4f' % (len(mush), mcfg, off))
    return walls, cfg0, wclips, waud, mush, mcfg, mclips, maud


# ---------------------------------------------------------------- dây leo (Vines.prefab)
def vines_part():
    pre = os.path.join(ASSETS, 'GameObject', 'Vines.prefab')
    objs = TN.load_doc(pre)
    go_name = {i: o[1]['m_Name'] for i, o in objs.items() if o[0] == 1}
    tf_of_go = {o[1]['m_GameObject']['fileID']: i for i, o in objs.items() if o[0] == 4}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tentacles = {}
    for o in objs.values():
        if o[0] == 114 and 'tentacleAnchorPos' in o[1]:
            tentacles[go_name[o[1]['m_GameObject']['fileID']]] = o[1]
    assert sorted(tentacles) == ['Vine1', 'Vine2', 'Vine3', 'Vine4']
    smrs = {}
    for o in objs.values():
        if o[0] == 137:
            g = o[1]['m_GameObject']['fileID']
            root = tf[tf_of_go[g]]['m_Father']['fileID']
            smrs[go_name[go_of_tf[root]]] = o[1]

    def build(vname):
        """Cây xương của một vine (gốc = Vine<n>), như tools/tentacle.py main()."""
        vtf = tf_of_go[[g for g, n in go_name.items() if n == vname][0]]
        smr = smrs[vname]
        skin_tf = tf_of_go[smr['m_GameObject']['fileID']]
        bone_ids = [b['fileID'] for b in smr['m_Bones']]
        keep = set(bone_ids) | {skin_tf, vtf}
        for t in list(keep):
            f = tf[t]['m_Father']['fileID']
            while f and f != tf[vtf]['m_Father']['fileID']:
                keep.add(f)
                f = tf[f]['m_Father']['fileID']
        order = []

        def walk(t):
            if t in keep:
                order.append(t)
                for c in tf[t]['m_Children']:
                    walk(c['fileID'])
        walk(vtf)
        index = {t: i for i, t in enumerate(order)}
        bones = []
        for t in order:
            T = tf[t]
            p = TN.vec(T['m_LocalPosition'])
            p[2] = -p[2]
            bones.append({'name': go_name[go_of_tf[t]], 'parent': index.get(T['m_Father']['fileID'], -1) if t != vtf else -1, 'p': rnd(p, 6),
                          'q': rnd(TN.conv_q(TN.vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(TN.vec(T['m_LocalScale']), 6)})
        return vtf, smr, skin_tf, bone_ids, order, index, bones

    vtf, smr, skin_tf, bone_ids, order, index, bones = build('Vine1')
    for v in ('Vine2', 'Vine3', 'Vine4'):   # cùng cây xương, chỉ khác tỉ lệ gốc
        b2 = build(v)[6]
        for a, b in zip(bones[1:], b2[1:]):
            assert a == b, 'xương %s khác giữa Vine1 và %s' % (a['name'], v)
        assert [x['name'] for x in bones[1:]] == [x['name'] for x in b2[1:]]
        assert smrs[v]['m_Mesh'] == smr['m_Mesh']
    mesh_path = TN.guid_path('Mesh', smr['m_Mesh']['guid'])
    mesh, bind, nv = TN.read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids)
    anim = [o[1] for o in objs.values() if o[0] == 95 and go_name[o[1]['m_GameObject']['fileID']] == 'Vine1'][0]
    anim_tf = tf_of_go[anim['m_GameObject']['fileID']]
    assert anim_tf == vtf

    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    clips = {}
    for key, fn in (('spawn', 'Vine_SpawnRW.anim'), ('retract', 'Tentacle_Retract.anim')):
        clips[key] = TN.curves(os.path.join(ASSETS, 'AnimationClip', fn), 'Vine1')
    names = {tpath(t): bones[index[t]]['name'] for t in order}
    for k, c in clips.items():
        for nm, d in c['curves'].items():
            for kind, v in d.items():
                assert v['path'] in names or v['path'] == '', 'đường cong %s/%s không khớp xương' % (k, v['path'])
                v['bone'] = index[[t for t in order if tpath(t) == v['path']][0]] if v['path'] else index[anim_tf]
                del v['path']
    # vật liệu: TwistedStrandTreeTrunks_Mat (cùng vật liệu thân rễ của tường): texture TwistedStrandTreeTrunk_Texture × màu Color_9a80436d
    mat = list(yaml.load(io.open(TN.guid_path('Material', smr['m_Materials'][0]['guid']), encoding='utf-8').read().split('\n', 3)[3], Loader=TN.CL).values())[0]['m_SavedProperties']
    texrefs = {k: v['m_Texture'].get('guid') for k, v in mat['m_TexEnvs'].items() if v['m_Texture'].get('guid')}
    src = TN.guid_path('Texture2D', texrefs['Texture2D_9aa7ba2263944b48bbf43c218dc48459'])
    im = Image.open(src).convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    dst = os.path.join(OUT_ART, 'vine.webp')
    im.save(dst, 'WEBP', quality=80, method=6)
    tint = mat['m_Colors']['Color_9a80436dfae54f168ee3b031d4a7bfcb']
    lst = []
    for i, n in enumerate(('Vine1', 'Vine2', 'Vine3', 'Vine4')):
        t = tentacles[n]
        sc = TN.vec(tf[build(n)[0]]['m_LocalScale'])
        assert sc[0] == sc[1] == sc[2]
        lst.append({'name': n, 'scale': sc[0], 'anchor': rnd(TN.vec(t['tentacleAnchorPos']), 4), 'strength': float(t['trackingStrength']),
                    'delay': float(t['animationDelay']), 'sfx': bool(t['emergeSFX'].get('m_AssetGUID'))})
    aud = {}
    for key, nm in (('emerge', 'Vine Attack - Emerge'), ('submerge', 'Vine Attack - Submerge'), ('whip', 'Vine Attack - Whip')):
        audio_of(clip_guid_named('Audio/SFX/World Event/Vine Tentacles/%s.ogg' % nm), aud, key)
    # 4 BoxCollider/vine (xương Bone.003/.004/.007/.012, layer 7 SafeCollider, không trigger) nhưng prefab KHÔNG có VariablePlayerDamager => không gây hại.
    print('day leo: xuong %d, dinh %d, tam giac %d, clip spawn %.3fs retract %.3fs, %s' % (len(bones), nv, len(mesh['index']) // 3, clips['spawn']['len'], clips['retract']['len'],
          [(v['name'], v['scale'], v['anchor'], v['strength'], v['delay'], v['sfx']) for v in lst]))
    return {'bones': bones, 'skinNode': index[skin_tf], 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': mesh, 'clips': clips,
            'retractBlend': 0.5, 'tex': 'art/vfx/tshazards/vine.webp', 'tint': rnd([tint['r'], tint['g'], tint['b']], 4), 'list': lst, 'audio': aud,
            'texBytes': os.path.getsize(dst)}


def main():
    S = EX.Scene()
    snd = {}
    walls, wcfg, wclips, waud, mush, mcfg, mclips, maud = scene_part(S, snd)
    vines = vines_part()
    data = {
        'src': 'Scenes/Game.unity (TSRootWall x%d, ExplodingMushrooms x%d), RootWallController + ExplodingMushrooms + VineAttack controllers, GameObject/Vines.prefab, '
               'Data/WorldEvent/Vines.asset, tools/explosives.py (khớp instance, dấu chân va chạm)' % (len(walls), len(mush)),
        'walls': {'cfg': wcfg, 'clips': wclips, 'list': walls, 'audio': waud},
        'mushrooms': {'cfg': mcfg, 'clips': mclips, 'list': mush, 'audio': maud},
        'vines': vines,
    }
    js = '// Generated by games/dredge/tools/tshazards.py from Game.unity (TwistedStrand) + RootWall / ExplodingMushrooms / Vine clips. Do not edit.\nwindow.DR_TSHAZARDS = ' + \
        json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('js %d KB  tex %d KB  audio %d KB' % (len(js) // 1024, vines['texBytes'] // 1024,
          sum(a['bytes'] for d in (waud, maud, vines['audio']) for a in d.values()) // 1024))


if __name__ == '__main__':
    main()
