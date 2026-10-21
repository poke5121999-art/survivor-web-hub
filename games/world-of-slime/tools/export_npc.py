"""Export every object_npc_* prefab (110 bundles) to GLB with the clips of its Animator controller embedded.

Run:  py -3.12 -I export_npc.py [--only larus_bigman,box_001] [--workers 4]
Out:  <wos.ASSETS>/npc/<PrefabName>.glb    skeleton + meshes + textures + every clip its controller states use
      <wos.ASSETS>/npc/shared/*.webp       shader ramps / matcaps
      <wos.ASSETS>/npc/index.json          per prefab: glb, kb, controller, states {name: clip}, clips, meshes, materials

Animator.m_Controller is an AnimatorOverrideController (object_shared_animationcontroller*.bundle) over a base
AnimatorController (NPC_Default, NPC_Default_WithApproach, NPC_Default_Mixing). State -> clip comes from the base
controller's compiled state machine (m_BlendTreeConstantArray node m_ClipID -> m_AnimationClips), then the override
table (m_Clips original -> override). Clip bundles are object_shared_npc_* (loaded as dependencies, depth 1).
"""
import os, sys, json, shutil, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import wos
from export_slime import (Skel, Builder, write_nodes, add_clip, write_index, container_map, folder_mb, log,
                          script_class, load_scripts_cached)

OUT = os.path.join(wos.ASSETS, 'npc')


# ---------------------------------------------------------------- humanoid (Mecanim muscle space -> bone rotations)
# Clip binding typeID 95 (Animator): attribute 0-6 MotionT/Q, 7-9 RootT, 10-13 RootQ, 14-41 IK goals, 42-136 the 95 muscles
# in HumanTrait order. Muscle -> (x, y, z) DoF of each HumanBodyBones bone, following Mecanim's human.cpp tables.
_L, _R, _AL, _AR = 21, 29, 37, 46
BONE_DOF = {1: (_L + 2, _L + 1, _L + 0), 2: (_R + 2, _R + 1, _R + 0), 3: (_L + 4, -1, _L + 3), 4: (_R + 4, -1, _R + 3),
            5: (-1, _L + 6, _L + 5), 6: (-1, _R + 6, _R + 5), 7: (2, 1, 0), 8: (5, 4, 3), 9: (8, 7, 6), 10: (11, 10, 9),
            11: (14, 13, 12), 12: (-1, _AL + 1, _AL + 0), 13: (-1, _AR + 1, _AR + 0), 14: (_AL + 4, _AL + 3, _AL + 2),
            15: (_AR + 4, _AR + 3, _AR + 2), 16: (_AL + 6, -1, _AL + 5), 17: (_AR + 6, -1, _AR + 5), 18: (-1, _AL + 8, _AL + 7),
            19: (-1, _AR + 8, _AR + 7), 20: (-1, -1, _L + 7), 21: (-1, -1, _R + 7), 22: (-1, 16, 15), 23: (-1, 18, 17), 24: (-1, 20, 19)}


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def qconj(q):
    return q * np.array([-1, -1, -1, 1.0])


def qrot(q, v):
    p = np.concatenate([v, np.zeros(v.shape[:-1] + (1,))], -1)
    return qmul(qmul(q, p), qconj(q))[..., :3]


def v3(d): return np.array([d['x'], d['y'], d['z']], np.float64)
def v4(d): return np.array([d['x'], d['y'], d['z'], d['w']], np.float64)


class Humanoid:
    """Turns muscle curves into Unity-space local rotations for the avatar's human bones, plus the hips position."""

    def __init__(self, avatar, hash2node, skel_nodes):
        tt = avatar.object_reader.read_typetree()
        a = tt['m_Avatar']
        H = a['m_Human']['data']
        hs = H['m_Skeleton']['data']
        self.axes = hs['m_AxesArray']
        nodes = hs['m_Node']
        pose = H['m_SkeletonPose']['data']['m_X']
        self.node = [hash2node.get(i) for i in hs['m_ID']]
        self.bone = H['m_HumanBoneIndex']
        self.scale = H['m_Scale']
        G = []
        for i, nd in enumerate(nodes):
            t, q = v3(pose[i]['t']), v4(pose[i]['q'])
            if nd['m_ParentId'] < 0:
                G.append((t, q))
            else:
                pt, pq = G[nd['m_ParentId']]
                G.append((pt + qrot(pq, t), qmul(pq, q)))
        hips = self.bone[0]
        rt, rq = v3(H['m_RootX']['t']), v4(H['m_RootX']['q'])
        ht, hq = G[hips]
        self.hips_off = (qrot(qconj(rq), ht - rt), qmul(qconj(rq), hq))          # hips in body-centre frame
        # Human space = the Animator root. The hips' real parent (e.g. Bip001 under _Root/Rotation) keeps its rest
        # transform, so take its global from the prefab hierarchy (Unity space), not from the human skeleton pose.
        self.hips_node = self.node[hips]
        pt, pq = np.zeros(3), np.array([0, 0, 0, 1.0])
        chain, k = [], skel_nodes[self.hips_node]['parent'] if self.hips_node is not None else -1
        while k > 0:                       # stop below the Animator root (node 0)
            chain.append(k); k = skel_nodes[k]['parent']
        for k in reversed(chain):
            n = skel_nodes[k]
            t = np.array([-n['t'][0], n['t'][1], n['t'][2]]); q = np.array([n['r'][0], -n['r'][1], -n['r'][2], n['r'][3]])
            pt, pq = pt + qrot(pq, t), qmul(pq, q)
        self.hips_parent = (pt, pq)
        self.hnodes = nodes
        self.missing = [b for b in range(1, 25) if self.bone[b] >= 0 and self.node[self.bone[b]] is None]

    def axes_q(self, ax, uvw):
        mn, mx = v3(ax['m_Limit']['m_Min']), v3(ax['m_Limit']['m_Max'])
        xyz = np.where(uvw < 0, -uvw * mn, uvw * mx) * v3(ax['m_Sgn'])
        if ax['m_Type'] == 0:                 # plain euler (not seen in these rigs)
            from wos import euler_to_q
            q = np.array([euler_to_q(np.degrees(e), 0) for e in xyz])
        else:
            h = np.tan(0.5 * np.clip(xyz, -3.1, 3.1))
            x, y, z = h[:, 0], h[:, 1], h[:, 2]
            if ax['m_Type'] == 1:             # ZYRoll
                q = np.stack([x, y + x * z, z - x * y, np.ones_like(x)], 1)
            else:                             # RollZY
                q = np.stack([x, y - x * z, z + x * y, np.ones_like(x)], 1)
            q /= np.linalg.norm(q, axis=1, keepdims=True)
        pre, post = v4(ax['m_PreQ']), v4(ax['m_PostQ'])
        q = qmul(qmul(pre[None], q), qconj(post)[None])
        return q / np.linalg.norm(q, axis=1, keepdims=True)

    def __call__(self, hum):
        n = len(next(iter(hum.values())))
        g = lambda k: hum.get(k, np.zeros(n))
        out = {}
        for b, dof in BONE_DOF.items():
            hn = self.bone[b] if b < len(self.bone) else -1
            if hn < 0 or self.node[hn] is None:
                continue
            ai = self.hnodes[hn]['m_AxesId']
            if ai < 0:
                continue
            uvw = np.stack([g(42 + m) if m >= 0 else np.zeros(n) for m in dof], 1)
            q = self.axes_q(self.axes[ai], uvw)
            out[(self.node[hn], 'rotation')] = to_gltf_q(q)
        if 7 in hum and self.hips_node is not None:
            bt = np.stack([g(7), g(8), g(9)], 1) * self.scale
            bq = np.stack([g(10), g(11), g(12), g(13)], 1)
            bq /= np.maximum(np.linalg.norm(bq, axis=1, keepdims=True), 1e-9)
            ot, oq = self.hips_off
            ht = bt + qrot(bq, np.broadcast_to(ot, bt.shape)); hq = qmul(bq, oq[None])
            pt, pq = self.hips_parent
            lt = qrot(qconj(pq)[None].repeat(n, 0), ht - pt); lq = qmul(qconj(pq)[None], hq)
            out[(self.hips_node, 'translation')] = np.stack([-lt[:, 0], lt[:, 1], lt[:, 2]], 1)
            out[(self.hips_node, 'rotation')] = to_gltf_q(lq)
        return out


def to_gltf_q(q):
    q = np.stack([q[:, 0], -q[:, 1], -q[:, 2], q[:, 3]], 1)
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
    return q


def controller_states(ctrl):
    """AnimatorOverrideController or AnimatorController -> (controller info, {pid: clip object}, states)."""
    kind = ctrl.object_reader.type.name
    overrides = {}
    if kind == 'AnimatorOverrideController':
        base = ctrl.m_Controller.read()
        for c in ctrl.m_Clips:
            if c.m_OverrideClip.path_id:
                overrides[c.m_OriginalClip.path_id] = c.m_OverrideClip
    else:
        base = ctrl
    btt = base.object_reader.read_typetree()
    tos = {k: v for k, v in btt['m_TOS']}
    clip_pptrs = list(base.m_AnimationClips)
    states, used = [], {}
    for li, sm in enumerate(btt['m_Controller']['m_StateMachineArray']):
        d0 = sm['data']
        default = d0.get('m_DefaultState')
        for si, st in enumerate(d0['m_StateConstantArray']):
            d = st['data']
            clips = []
            for bt in d['m_BlendTreeConstantArray']:
                for nd in bt['data']['m_NodeArray']:
                    cid = nd['data']['m_ClipID']
                    if cid < 0 or cid >= len(clip_pptrs) or cid == 4294967295:
                        continue
                    orig = clip_pptrs[cid]
                    pp = overrides.get(orig.path_id, orig)
                    try:
                        clip = pp.read()
                    except Exception:
                        clips.append(dict(missing=True)); continue
                    used[clip.m_Name] = clip
                    clips.append(clip.m_Name)
            states.append(dict(layer=li, name=tos.get(d['m_NameID'], str(d['m_NameID'])), clips=clips,
                               speed=round(d.get('m_Speed', 1.0), 3), loop=bool(d.get('m_Loop', False)),
                               default=si == default))
    info = dict(controller=ctrl.m_Name, kind=kind, base=base.m_Name)
    return info, used, states


def export_prefab(go, scripts):
    skel = Skel(wos.transform_of(go))
    glb = wos.GLB('world-of-slime tools/export_npc.py')
    bld = Builder(glb, os.path.join(OUT, 'shared'), 'npc/shared')
    meshes = bld.all_renderers(skel)
    write_nodes(glb, skel.nodes)
    bld.finish_nodes()
    meta = dict(id=go.m_Name, meshes=meshes)
    behaviours = {}
    for n in skel.nodes:
        for c in n['go'].m_Component:
            if c.component.type.name == 'MonoBehaviour':
                cls = script_class(c.component.read(), scripts) or '?'
                behaviours[cls] = behaviours.get(cls, 0) + 1
    if behaviours:
        meta['behaviours'] = behaviours
    anim_nodes = [n for n in skel.nodes if wos.components(n['go'], 'Animator')]
    if anim_nodes:
        an = wos.components(anim_nodes[0]['go'], 'Animator')[0]
        if an.m_Controller.path_id:
            info, used, states = controller_states(an.m_Controller.read())
            # bindings are relative to the Animator's object
            root_path = anim_nodes[0]['path']
            h2n = {}
            import zlib
            for i, n in enumerate(skel.nodes):
                if n['path'] and (not root_path or n['path'].startswith(root_path + '/')):
                    rel = n['path'][len(root_path) + 1:] if root_path else n['path']
                    h2n[zlib.crc32(rel.encode())] = i
            human = Humanoid(an.m_Avatar.read(), h2n, skel.nodes) if an.m_Avatar.path_id else None
            reps = []
            for nm in sorted(used):
                rep, _ = add_clip(glb, used[nm], h2n, human=human)
                reps.append(rep)
            if human is not None:
                meta['humanoid'] = dict(avatar=an.m_Avatar.read().m_Name, unmappedBones=human.missing)
            meta.update(info, animatorNode=anim_nodes[0]['name'], states=states, clips=reps)
    glb.j['extras'] = dict(source=go.m_Name)
    out = os.path.join(OUT, f'{go.m_Name}.glb')
    glb.write(out)
    meta.update(glb=f'npc/{go.m_Name}.glb', kb=round(os.path.getsize(out) / 1024, 1),
                materials=[dict(name=m['name'], **{k: m['extras'][k] for k in ('shader', 'keywords', 'floats', 'colors', 'shared')},
                                tex=sorted(m['extras']['tex'])) for m in glb.j.get('materials', [])],
                textures=bld.textures, bones=len(skel.nodes))
    return meta


def do_bundle(b):
    t0 = time.time()
    try:
        scripts = load_scripts_cached()
        for depth in (1, 2, 3):          # NPC_Larus_Frog reuses a slime bundle, whose own deps sit one level deeper
            env, loaded = wos.load([b], depth=depth)
            cont = container_map(env)
            keys = sorted(k for k in cont if k.lower().endswith('.prefab') and '/Object/Models/' in k)
            metas = []
            try:
                for k in keys:
                    go = cont[k].read()
                    m = export_prefab(go, scripts)
                    m['bundle'] = b
                    m['container'] = k
                    metas.append(m)
                break
            except FileNotFoundError:
                if depth == 3:
                    raise
            finally:
                del env
        return b, metas, None, round(time.time() - t0, 1)
    except Exception:
        return b, None, traceback.format_exc(), round(time.time() - t0, 1)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    import multiprocessing as mp
    argv = sys.argv[1:]
    only = set(argv[argv.index('--only') + 1].lower().split(',')) if '--only' in argv else None
    workers = int(argv[argv.index('--workers') + 1]) if '--workers' in argv else 4
    bundles = sorted(f for f in os.listdir(wos.D) if f.startswith('object_npc_') and f.endswith('.bundle'))
    if only:
        bundles = [b for b in bundles if b[len('object_npc_'):-7] in only]
    idx_path = os.path.join(OUT, 'index.json')
    old = json.load(open(idx_path, encoding='utf-8')) if (only and os.path.exists(idx_path)) else None
    if not only and os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    items = {m['id']: m for m in old['npcs']} if old else {}
    errors = {}
    log(f'{len(bundles)} npc bundles')
    with mp.Pool(min(workers, 4), maxtasksperchild=6) as pool:
        jobs = [(b, pool.apply_async(do_bundle, (b,))) for b in bundles]
        for b, j in jobs:
            try:
                b, metas, err, sec = j.get(timeout=600)
            except mp.TimeoutError:
                errors[b] = 'timeout'; log('TIMEOUT', b); continue
            if err:
                errors[b] = err; log('ERROR', b, err.strip().splitlines()[-1]); continue
            for m in metas:
                items[m['id']] = m
            log(f'{b}: {[(m["id"], m["kb"], len(m.get("clips", []))) for m in metas]} ({sec}s)')
    index = dict(generator='games/world-of-slime/tools/export_npc.py',
                 note='Each GLB embeds the clips its controller states use (glTF animation name = Unity clip name). '
                      'states[] = controller state -> clip names; default=true marks the entry state.',
                 npcs=[items[k] for k in sorted(items)], errors=errors, totalMB=0)
    write_index(idx_path, index)
    index['totalMB'] = folder_mb(OUT)
    write_index(idx_path, index)
    log(f'done: {len(index["npcs"])} prefabs, {len(errors)} errors, {index["totalMB"]} MB')


if __name__ == '__main__':
    main()
