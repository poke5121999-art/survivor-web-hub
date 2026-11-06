"""Cá đuối quái của sự kiện thế giới MonsterRayFollow / Attack1 / Attack2 (MONSTERS.md §2.10, đơn vị U9) -> data/ray.js + art/vfx/ray/*.webp.

Chạy:  python -I games/dredge/tools/ray.py
Đọc:   Assets/GameObject/MonsterRay{Follow,Attack1,Attack2}.prefab (cây xương `monsterray`, SkinnedMeshRenderer polySurface62, MonsterRayWorldEvent,
       VariablePlayerDamager, SanityModifier, ba CapsuleCollider JawCollider / TailCollider / TailJoinCollider), Assets/Mesh/polySurface62.asset,
       AnimationClip/{rayswim,rayattack,raytailswipe}.anim (cả đường cong m_IsActive bật/tắt collider), AnimatorController/MonsterRay_Controller
       (Swim Loop -[bite-attack | tail-attack, 0,25 s]-> Bite/Tail Attack -[hết clip, 0,25 s]-> Swim Loop), Material/MonsterRay_Mat.mat
       (Shader Graphs/MonsterRay_Shader; rã DXBC: tools/particles.py --dis -> D:/dredge-ref/cache/ray/MonsterRay_Shader.txt).
Ra:    window.DR_RAY = { types{Follow,Attack1,Attack2}, params, bones[], skinBones[], bindPoses[], mesh, clips{swim,bite,tail}, colliders[], sanity, mat, tex }
Toạ độ: giống tools/tentacle.py (Unity trái tay -> three.js phải tay bằng đổi dấu z; quaternion (x,y,z,w) -> (-x,-y,z,w)).
Bẫy: ba prefab chỉ khác monsterRayType và attackRange (kiểm bằng assert); collider chỉ bật theo đường cong m_IsActive của clip tấn công
     (JawCollider 0,333–1,333 s của rayattack, TailCollider + TailJoinCollider 0,433–2 s của raytailswipe), không có collider nào bật lúc bơi.
Rerunnable: cùng đầu vào ra cùng đầu ra từng byte.
"""
import base64, io, os, sys, json

import numpy as np
import yaml

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tentacle as TN  # noqa: E402  (load_doc, guid_path, vec, rnd, conv_q, read_skinned_mesh, curves: cùng định dạng dữ liệu)

GAME = os.path.dirname(HERE)
ASSETS = TN.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'ray.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'ray')
CL = TN.CL
rnd, vec = TN.rnd, TN.vec

TYPES = (('Follow', 'MonsterRayFollow.prefab'), ('Attack1', 'MonsterRayAttack1.prefab'), ('Attack2', 'MonsterRayAttack2.prefab'))
CLIPS = (('swim', 'rayswim.anim'), ('bite', 'rayattack.anim'), ('tail', 'raytailswipe.anim'))


def save_tex(src, name):
    from PIL import Image
    im = Image.open(src).convert('RGB')  # 128x128 gốc, giữ nguyên
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=85, method=6)
    return 'art/vfx/ray/' + name + '.webp', os.path.getsize(p)


def pack_mesh(m):
    """Mesh (danh sách số của tentacle.read_skinned_mesh) -> khối nhị phân base64 nhỏ: vị trí / uv uint16 theo hộp bao, pháp tuyến int8,
    chỉ số xương uint8, trọng số uint8 (JS chuẩn hoá lại tổng 1), chỉ số tam giác uint16. Sai số lượng tử < 0,01 % cạnh hộp bao."""
    pos = np.array(m['pos'], dtype=np.float64).reshape(-1, 3)
    nrm = np.array(m['nrm'], dtype=np.float64).reshape(-1, 3)
    uv = np.array(m['uv'], dtype=np.float64).reshape(-1, 2)
    n = len(pos)
    assert n < 65536
    pmin, pmax = pos.min(0), pos.max(0)
    umin, umax = uv.min(0), uv.max(0)
    q = lambda a, lo, hi: np.round((a - lo) / np.where(hi > lo, hi - lo, 1) * 65535).astype('<u2')
    nb = np.round(np.clip(nrm, -1, 1) * 127).astype('i1').tobytes()
    parts = [q(pos, pmin, pmax).tobytes(), nb + bytes(len(nb) % 2),  # dem cho uint16 ke tiep thang hang
             q(uv, umin, umax).tobytes(), np.array(m['skinIndex'], dtype='u1').tobytes(),
             np.round(np.array(m['skinWeight']) * 255).astype('u1').tobytes(), np.array(m['index'], dtype='<u2').tobytes()]
    return {'n': n, 'tris': len(m['index']) // 3, 'pmin': rnd(pmin.tolist(), 5), 'pmax': rnd(pmax.tolist(), 5), 'umin': rnd(umin.tolist(), 5),
            'umax': rnd(umax.tolist(), 5), 'b64': base64.b64encode(b''.join(parts)).decode('ascii')}


def main():
    per_type, objs0 = {}, None
    for key, fn in TYPES:
        objs = TN.load_doc(os.path.join(ASSETS, 'GameObject', fn))
        mb = [o[1] for o in objs.values() if o[0] == 114 and 'monsterRayType' in o[1]][0]
        vpd = [o[1] for o in objs.values() if o[0] == 114 and 'damagePoints' in o[1]][0]
        per_type[key] = {'type': int(mb['monsterRayType']), 'attackRange': float(mb['attackRange']), 'damagePoints': int(vpd['damagePoints']),
                         'oneHitOnly': bool(vpd['oneHitOnly']), 'requireOneHealthToKill': bool(vpd['requireOneHealthToKill']),
                         'extraDamageInNightmareMode': int(vpd['extraDamageInNightmareMode'])}
        common = {k: float(mb[k]) for k in ('timeUntilAttack', 'spawnDurationSec', 'despawnDurationSec', 'despawnDelay', 'maxFollowDurationSec',
                                            'attackCooldownSec', 'moveSpeed', 'moveSpeedScalar', 'boatSpeedMin', 'boatSpeedMax', 'rotationSpeed')}
        if objs0 is None:
            objs0, params = objs, common
            mb0 = mb
        else:
            assert common == params, 'tham số chung của %s khác Follow' % key
    assert [per_type[k]['type'] for k, _ in TYPES] == [0, 1, 2]
    objs = objs0
    go_name = {i: o[1]['m_Name'] for i, o in objs.items() if o[0] == 1}
    go_info = {i: o[1] for i, o in objs.items() if o[0] == 1}
    tf_of_go = {o[1]['m_GameObject']['fileID']: i for i, o in objs.items() if o[0] == 4}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    smr = [o[1] for o in objs.values() if o[0] == 137][0]
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    mesh_path = TN.guid_path('Mesh', smr['m_Mesh']['guid'])
    mat_path = TN.guid_path('Material', smr['m_Materials'][0]['guid'])
    model_tf = mb0['model']['fileID']  # Transform
    anim_tf = tf_of_go[[o[1] for o in objs.values() if o[0] == 95][0]['m_GameObject']['fileID']]
    assert anim_tf == model_tf, 'Animator không nằm trên nút model'
    # collider (CapsuleCollider) -> nút Transform của GameObject chứa nó
    caps = [(go_name[o[1]['m_GameObject']['fileID']], o[1]) for o in objs.values() if o[0] == 136]
    col_tf = {n: tf_of_go[c['m_GameObject']['fileID']] for n, c in caps}
    keep = set(bone_ids) | set(col_tf.values()) | {model_tf}
    order = []

    def walk(t):
        if t in keep:
            order.append(t)
            for c in tf[t]['m_Children']:
                walk(c['fileID'])
    walk(model_tf)
    assert set(order) == keep, 'nút ngoài cây model: %s' % [go_name[go_of_tf[t]] for t in keep - set(order)]
    index = {t: i for i, t in enumerate(order)}
    bones = []
    for t in order:
        T = tf[t]
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        bones.append({'name': go_name[go_of_tf[t]], 'parent': index.get(T['m_Father']['fileID'], -1), 'p': rnd(p, 6),
                      'q': rnd(TN.conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(vec(T['m_LocalScale']), 6)})
    mesh, bind, nv = TN.read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids), 'số bindpose %d khác số xương %d' % (len(bind), len(bone_ids))
    # nút `monsterray` ở local (0, 0, -1) của gốc prefab (đổi dấu z), lấy từ Transform của nút model
    mp = vec(tf[model_tf]['m_LocalPosition'])
    model_local = rnd([mp[0], mp[1], -mp[2]], 5)

    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    by_path = {tpath(t): index[t] for t in order}
    clips = {}
    for key, fn in CLIPS:
        path = os.path.join(ASSETS, 'AnimationClip', fn)
        c = TN.curves(path, go_name[go_of_tf[anim_tf]])
        for nm, d in c['curves'].items():
            for kind, v in d.items():
                v['bone'] = by_path[v['path']] if v['path'] else index[anim_tf]
                del v['path']
        doc = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
        # m_IsActive: đường cong bậc thang (hằng) bật/tắt GameObject collider; khoá [t, giá trị]
        act = {}
        for fc in doc['m_FloatCurves']:
            assert fc['attribute'] == 'm_IsActive', fc['attribute']
            act[fc['path'].split('/')[-1]] = [[round(float(k['time']), 5), float(k['value'])] for k in fc['curve']['m_Curve']]
        c['active'] = act
        clips[key] = c
    # collider: GameObject active ban đầu (prefab) + hình dạng (CapsuleCollider, m_Direction 0 = trục x, 1 = y, 2 = z)
    colliders = []
    for nm in ('JawCollider', 'TailCollider', 'TailJoinCollider'):
        c = dict(caps)[nm]
        go = go_info[c['m_GameObject']['fileID']]
        assert not c['m_IsTrigger'] and vec(c['m_Center']) == [0, 0, 0]
        colliders.append({'name': nm, 'bone': index[col_tf[nm]], 'radius': float(c['m_Radius']), 'height': float(c['m_Height']),
                          'dir': 'xyz'[int(c['m_Direction'])], 'layer': int(go['m_Layer']), 'tag': go['m_TagString'], 'startActive': bool(go['m_IsActive'])})
    # SanityModifier (con của prefab) + Animator
    san = [o[1] for o in objs.values() if o[0] == 114 and 'fullValueNight' in o[1]][0]
    sph = [o[1] for o in objs.values() if o[0] == 135 and go_name[o[1]['m_GameObject']['fileID']] == 'SanityModifier'][0]
    mat = list(yaml.load(io.open(mat_path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    F, C = mat['m_Floats'], mat['m_Colors']
    tex, size = {}, 0
    for k, nm in (('Texture2D_9aa7ba2263944b48bbf43c218dc48459', 'albedo'), ('Texture2D_4d740421464545a3b7ee68f44af80d8d', 'glow')):
        tex[nm], n = save_tex(TN.guid_path('Texture2D', mat['m_TexEnvs'][k]['m_Texture']['guid']), nm)
        size += n
    # Thuộc tính vật liệu theo tên đồ thị (Shader Graphs/MonsterRay_Shader, khối Properties)
    props = {'scrollSpeed': F['Vector1_0ac8c91cbbec422da55838fc9dda4e17'], 'glowScale': F['Vector1_a406839633634469825ab12f70095cca'],
             'speedX': F['Vector1_09f9e63932c3441dbbfa896357cb5e56'], 'speedY': F['Vector1_6fc5d28979694c8b99befcdb35ef2d82'],
             'glowStrength': F['_GlowStrength'], 'pulseNoiseScale': F['Vector1_510b5236724c4baf8b247633e22ae309'],
             'pulseStrength': F['Vector1_d6d36bb5307a4f74a2f7513ff2789271'], 'emissionFadeDistance': F['_EmissionFadeDistance'],
             'dissolveTop': F['_DissolveTop'], 'dissolveBottom': F['_DissolveBottom'], 'dissolveAmount': F['_DissolveAmount']}
    gc = C['Color_a7ce2b7bd770432e92093ddfae428c15']
    data = {
        'src': 'GameObject/MonsterRay{Follow,Attack1,Attack2}.prefab, Mesh/polySurface62.asset, AnimationClip/{rayswim,rayattack,raytailswipe}.anim, '
               'AnimatorController/MonsterRay_Controller.controller, Material/MonsterRay_Mat.mat (Shader Graphs/MonsterRay_Shader)',
        'types': per_type, 'params': params,
        'agent': {'radius': 2.5, 'height': 2, 'speed': 5, 'acceleration': 5, 'angularSpeed': 90, 'stoppingDistance': 2, 'agentTypeID': 658490984},
        'timeBetweenDestinationSetsSec': 0.35,  # MonsterRayWorldEvent.cs: timeBetweenDestinationSetsSec
        'modelLocal': model_local, 'modelNode': index[model_tf],
        'bones': bones, 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': pack_mesh(mesh),
        'clips': clips, 'colliders': colliders,
        'transitions': {'toAttack': 0.25, 'toSwim': 0.25, 'swimLen': clips['swim']['len']},  # AnimatorController: TransitionDuration 0,25; Bite/Tail -> Swim ExitTime 1
        'sanity': {'day': float(san['fullValueDay']), 'night': float(san['fullValueNight']), 'r0': float(san['fullValueRadius']),
                   'r1': float(san['partialValueRadius']), 'minDay': float(san['partialValueMinDay']), 'minNight': float(san['partialValueMinNight']),
                   'trigger': float(sph['m_Radius'])},
        'mat': {'props': props, 'glowColour': rnd([gc['r'], gc['g'], gc['b']], 4), 'ditherBayer': True},
        'tex': tex,
    }
    js = '// Generated by games/dredge/tools/ray.py from MonsterRay*.prefab + clips. Do not edit.\nwindow.DR_RAY = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('bones %d  skin %d  verts %d  tris %d  clips %s  js %d KB  tex %d KB' % (
        len(bones), len(bone_ids), nv, len(mesh['index']) // 3, ' '.join('%s %.2fs' % (k, c['len']) for k, c in clips.items()), len(js) // 1024, size // 1024))


if __name__ == '__main__':
    main()
