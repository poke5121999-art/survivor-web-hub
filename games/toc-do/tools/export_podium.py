"""Xuất sân khấu bục nhận giải của bản gốc (Scenes/StateScene/Podium.unity) vào art/podium/.

Dùng: venv/bin/python -I export_podium.py [--no-meshopt]   (hình sân khấu)
      venv/bin/python -I export_podium.py --clips            (hoạt ảnh tạo dáng ranking_01..06 -> rank_<id>.glb)

Ra: podium.glb (hình tĩnh, toạ độ đã đổi, mỗi renderer×submesh là một primitive), meta.json (vị trí hạng 1..10 của
chế độ "Single", xe thắng, 3 camera path Single_1..3, camera mặc định), export.log.
Vật liệu chỉ ghi kiểu vẽ vào extras: kind = opaque | blend | add, tint, bright, scroll (UV/giây lấy từ _ScrollX/Y),
vì shader gốc (QF_Gamma/Env/Basic_SepcularCubeNormal, UV_Offset_Mask_Additive) là shader riêng; web vẽ bằng MeshBasic.
Tái dùng Scene/Mat/Textures/MeshCache/GLB của export_track.py (cùng quy ước toạ độ: z đảo, tam giác đảo thứ tự).
"""
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_track as T  # noqa: E402
import zs  # noqa: E402

SCENE = 'Podium.unity'
OUT = os.path.join(T.GAME, 'art', 'podium')
ADD = ('additive',)


def kind_of(mat):
    s = mat.shader.lower()
    if 'additive' in s or 'god_rays' in s:
        return 'add'
    if mat.alpha == 'BLEND' or 'transparent' in s or 'alphablend' in s:
        return 'blend'
    return 'opaque'


def rot(q, v):
    x, y, z, w = q
    cx = y * v[2] - z * v[1]; cy = z * v[0] - x * v[2]; cz = x * v[1] - y * v[0]
    dx = y * cz - z * cy; dy = z * cx - x * cz; dz = x * cy - y * cx
    return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)]


def camera_paths(S):
    """Các CameraPathAnimator Single_*: đoạn 2 khoá (vị trí, hướng nhìn, hướng lên, FOV) như export_campath.py."""
    byid, gos = {}, {}
    for pid, o in S.O.items():
        if o.type.name == 'MonoBehaviour':
            try:
                byid[pid] = (o.read().m_Script.read().m_ClassName, o.read_typetree())
            except Exception:
                pass
    shots = {}
    for pid, (k, a) in byid.items():
        if k != 'CameraPathAnimator':
            continue
        gid = a['m_GameObject']['m_PathID']
        name = S.tt[gid]['m_Name']
        if not name.startswith('CameraPathSingle_') or name.endswith('Mecha'):
            continue
        cp = byid[a['_cameraPath']['m_PathID']][1]
        lst = {kk: next(d for k2, d in byid.values() if k2 == kk + 'List' and d['m_GameObject']['m_PathID'] == gid)['_points']
               for kk in ('CameraPathOrientation', 'CameraPathFOV', 'CameraPathSpeed')}
        keys = []
        for p in cp['_points']:
            pid2 = p['m_PathID']
            c = byid[pid2][1]
            pick = lambda kk: [byid[r['m_PathID']][1] for r in lst[kk] if byid[r['m_PathID']][1]['point']['m_PathID'] == pid2]
            ori, fov = pick('CameraPathOrientation'), pick('CameraPathFOV')
            q = [ori[0]['rotation'][ax] for ax in 'xyzw']
            cv = lambda v: [round(v[0], 3), round(v[1], 3), round(-v[2], 3)]
            keys.append({'p': cv([c['_position'][ax] for ax in 'xyz']), 'fwd': cv(rot(q, [0, 0, 1])), 'up': cv(rot(q, [0, 1, 0])),
                         'fov': round(fov[0]['FOV'], 2)})
        shots[name] = {'dur': round(a['durationTime'], 3), 'ease': 'out' if lst['CameraPathSpeed'] else 'lin', 'keys': keys}
        T.log('camera path', name, shots[name]['dur'], 's', len(keys), 'keys')
    return shots


RANK_CLIPS = ['ranking_01', 'ranking_01a', 'ranking_01b', 'ranking_02', 'ranking_03', 'ranking_04', 'ranking_05', 'ranking_06']


def export_rank_clips():
    """Hoạt ảnh tạo dáng đứng trên bục (clip_hm_cg / clip_hf_cg ranking_*) -> art/podium/rank_<id>.glb, chỉ có xương + clip.
    Cùng bộ xương với glb tay đua nên mixer của tay đua chạy được clip này theo tên node. Dùng lại Skel/sample_clip của export_driver."""
    import zlib
    import export_driver as D
    cm = D.cab_map()
    root_cont = 'assets/resforassetbundles/avatar/character/female/00root/f_avataranimator.controller'
    for d in D.DRIVERS:
        g = 'm' if d['g'] == 'male' else 'f'
        root_env = D.load([D.bundle_of(f"assets/resforassetbundles/avatar/character/{d['g']}/00root/{d['root']}.prefab")], cm, depth=1)
        skel = D.Skel(D.container_obj(root_env, f"assets/resforassetbundles/avatar/character/{d['g']}/00root/{d['root']}.prefab"))
        hash2node = {zlib.crc32(n['path'].encode()): i for i, n in enumerate(skel.nodes) if n['path']}
        conts = [f'assets/artwork/avatar/character/common/animation_{g}/clip_h{g}_cg/{c}.anim' for c in RANK_CLIPS]
        env = D.load([D.bundle_of(c) for c in conts], cm, depth=0)
        glb = D.GLB()
        for n in skel.nodes:
            nd = dict(name=n['name'])
            if any(abs(x) > 1e-7 for x in n['t']): nd['translation'] = n['t']
            if any(abs(a - b) > 1e-7 for a, b in zip(n['r'], [0, 0, 0, 1])): nd['rotation'] = n['r']
            if any(abs(x - 1) > 1e-6 for x in n['s']): nd['scale'] = n['s']
            if n['children']: nd['children'] = list(n['children'])
            glb.j['nodes'].append(nd)
        glb.j['nodes'][0]['name'] = d['id']
        glb.j['nodes'][0].pop('translation', None); glb.j['nodes'][0].pop('rotation', None)
        info = {}
        for cont, name in zip(conts, RANK_CLIPS):
            clip = D.container_obj(env, cont)
            times, ch, skipped = D.sample_clip(clip, skel, hash2node)
            arrs = [(times.astype(np.float32), 5126, 'SCALAR', True)]
            samplers, chans = [], []
            for (node, path), v in sorted(ch.items()):
                n = skel.nodes[node]
                rest = {'translation': n['t'], 'rotation': n['r'], 'scale': n['s']}[path]
                if np.abs(v - v[0]).max() < 1e-5 and (np.abs(v[0] - np.array(rest)).max() < 1e-4 or (path == 'rotation' and np.abs(v[0] + np.array(rest)).max() < 1e-4)):
                    continue
                if path == 'rotation':
                    arrs.append((np.round(np.clip(v, -1, 1) * 32767).astype(np.int16), 5122, 'VEC4', False))
                else:
                    arrs.append((v.astype(np.float32), 5126, 'VEC3', False))
                samplers.append(dict(input=0, output=len(arrs) - 1, interpolation='LINEAR'))
                chans.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
            ids = glb.acc_many(arrs)
            for sm in samplers:
                sm['input'] = ids[0]; sm['output'] = ids[sm['output']]
            glb.j['animations'].append(dict(name=name, samplers=samplers, channels=chans))
            info[name] = round(float(times[-1]), 3)
            T.log(f'rank clip {d["id"]} {name}: {info[name]} s, {len(chans)} kênh, {skipped} kênh không có xương')
        glb.write(os.path.join(OUT, f"rank_{d['id']}.glb"))
        T.log('rank clips', d['id'], info)


def main():
    opts = [a for a in sys.argv[1:] if a.startswith('--')]
    if '--clips' in opts:
        os.makedirs(OUT, exist_ok=True)
        export_rank_clips()
        return
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in zs.find(SCENE) if any(c.endswith('/' + SCENE) for c in r['cont'])]
    T.log('scene', SCENE, 'bundle', rows[0]['f'])
    env = T.load_with_deps([rows[0]['f']])
    S = T.Scene(T.find_scene_file(env, SCENE))
    O, tt, typ = S.O, S.tt, S.typ
    glb, texs, meshes = T.GLB(), T.Textures(), T.MeshCache()
    tex_glb, mat_glb, prims = {}, {}, 0
    for pid, t in typ.items():
        if t != 'MeshRenderer':
            continue
        R = tt[pid]
        g = R['m_GameObject']['m_PathID']
        where = S.path[g]
        if not S.active[g] or not R['m_Enabled']:
            T.log('skip inactive', where)
            continue
        if 'Reflection_Diffuse_Layer' in where:
            T.log('skip reflection probe dome (không phải vật hiện hình)', where)
            continue
        mfs = S.comp(g, 'MeshFilter')
        mesh = O[mfs[0]].read().m_Mesh.deref_parse_as_object()
        M = meshes.get(mesh)
        world = S.world[g]
        rmats = O[pid].read().m_Materials
        for si, tri in enumerate(M['subs']):
            if si >= len(rmats) or not len(tri):
                continue
            mat = T.Mat(rmats[si].deref_parse_as_object())
            kind = kind_of(mat)
            slot = '_MainTex' if '_MainTex' in mat.tex else ('_MainTex1' if '_MainTex1' in mat.tex else None)
            mk = (rmats[si].m_FileID, rmats[si].m_PathID)
            if mk not in mat_glb:
                gm = {'name': mat.name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0}}
                tint = mat.c.get('_Color') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
                # tint đen + alpha .5 là màu do script TransparentCommonCurves đổi theo thời gian; không có script thì để trắng.
                tc = [tint['r'], tint['g'], tint['b']] if max(tint['r'], tint['g'], tint['b']) > 0.02 else [1, 1, 1]
                su, sv, ou, ov = mat.st(slot) if slot else (1, 1, 0, 0)
                ex = {'shader': mat.shader, 'kind': kind, 'tint': [round(x, 3) for x in tc], 'alpha': round(tint['a'], 3),
                      'bright': float(mat.f.get('_Brightness', mat.f.get('_ColorMulti', 1.0))),
                      'scroll': [float(mat.f.get('_ScrollX', 0)), float(mat.f.get('_ScrollY', 0))] if 'Sky_Diffuse' in mat.shader or 'God_rays' in mat.shader else [0, 0],
                      'double': bool(mat.double or kind != 'opaque')}
                gm['extras'] = ex
                if slot:
                    ti = texs.get(mat, slot, 1024 if mat.name == 'E_Podium_01' else 512, kind != 'opaque')
                    if ti is not None:
                        if ti not in tex_glb:
                            tex_glb[ti] = glb.image(texs.images[ti]['data'])
                        gm['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_glb[ti]}
                glb.j['materials'].append(gm)
                mat_glb[mk] = len(glb.j['materials']) - 1
            used = np.unique(tri)
            remap = np.full(len(M['pos']), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            p = (world[:3, :3] @ M['pos'][used].T).T + world[:3, 3]
            P = (p * [1, 1, -1]).astype(np.float32)
            nm = np.linalg.inv(world[:3, :3]).T
            if M['nrm'] is not None:
                n = (nm @ M['nrm'][used].T).T
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
            else:
                n = np.tile([0.0, 1.0, 0.0], (len(used), 1))
            uv = M['uv0'][used] if M['uv0'] is not None else np.zeros((len(used), 2))
            su, sv, ou, ov = mat.st(slot) if slot else (1, 1, 0, 0)
            uv = uv * [su, sv] + [ou, ov]
            U = np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32)
            tr = remap[tri]
            if np.linalg.det(world[:3, :3]) > 0:
                tr = tr[:, [0, 2, 1]]
            attrs = {'POSITION': glb.acc(P, 'VEC3', 34962, True),
                     'NORMAL': glb.acc((n * [1, 1, -1]).astype(np.float32), 'VEC3', 34962),
                     'TEXCOORD_0': glb.acc(U, 'VEC2', 34962)}
            if M['col'] is not None and kind != 'opaque':
                attrs['COLOR_0'] = glb.acc(M['col'][used].astype(np.float32), 'VEC4', 34962)
            ind = glb.acc(tr.reshape(-1).astype(np.uint32), 'SCALAR', 34963)
            name = S.tt[g]['m_Name']
            glb.j['meshes'].append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mat_glb[mk]}]})
            glb.j['nodes'].append({'name': name, 'mesh': len(glb.j['meshes']) - 1})
            glb.j['scenes'][0]['nodes'].append(len(glb.j['nodes']) - 1)
            prims += 1
            T.log(f'prim {name}: {mat.name} {kind} {mat.shader} tris={len(tr)} verts={len(P)} y={P[:, 1].min():.1f}..{P[:, 1].max():.1f}')

    raw = os.path.join(OUT, 'podium.raw.glb')
    glb.write(raw)
    path = os.path.join(OUT, 'podium.glb')
    if '--no-meshopt' in opts:
        os.replace(raw, path)
    else:
        r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'meshopt', raw, path], capture_output=True, text=True)
        if r.returncode != 0:
            T.log('meshopt lỗi, giữ glb thường:', r.stderr[-300:])
            os.replace(raw, path)
        else:
            os.remove(raw)

    # Vị trí hạng chế độ "Single": Rank1..3 là bục, Pos4.. là chỗ đứng dưới sàn, Car1 là chỗ đỗ xe người thắng.
    pos = {}
    for g, p in S.path.items():
        if p.startswith('/PodiumRoot/Pos/Single/'):
            w = S.world[g]
            pos[p.split('/')[-1]] = [round(float(w[0, 3]), 3), round(float(w[1, 3]), 3), round(float(-w[2, 3]), 3)]
    cam = next(g for g, p in S.path.items() if p.endswith('/CG Camera'))
    cw = S.world[cam]
    fwd = cw[:3, :3] @ np.array([0, 0, 1.0])
    meta = {'scene': SCENE, 'glb': 'podium.glb', 'primitives': prims, 'pos': pos,
            'camera': {'p': [round(float(cw[0, 3]), 3), round(float(cw[1, 3]), 3), round(float(-cw[2, 3]), 3)],
                       'fwd': [round(float(fwd[0]), 3), round(float(fwd[1]), 3), round(float(-fwd[2]), 3)], 'fov': 50},
            'shots': camera_paths(S)}
    with open(os.path.join(OUT, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    T.log(f'xong: {prims} primitive, {len(texs.images)} texture, thư mục {sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT)) / 1e3:.0f} KB')
    with open(os.path.join(OUT, 'export.log'), 'w') as f:
        f.write('\n'.join(T.LOG) + '\n')


if __name__ == '__main__':
    main()
