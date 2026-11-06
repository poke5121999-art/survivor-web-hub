"""Export the player avatar kit (customize + customize_shared) to GLBs that share one skeleton by bone name.

Run:  py -3.12 -I export_player.py
Out:  <wos.ASSETS>/player/PC_Man_BaseRig.glb, PC_Woman_BaseRig.glb   skeleton (+ Animator root), no mesh
      <wos.ASSETS>/player/parts/<Prefab>.glb                         one part (hair, face, eyebrow, top, ...) with its
                                                                      own copy of the bones it needs
      <wos.ASSETS>/player/anim_man.glb, anim_woman.glb              skeleton-only GLBs with all 85 clips (humanoid muscles baked per rig)
      <wos.ASSETS>/player/face/*.webp                                 CustomizeDataSet face decal + mask textures
      <wos.ASSETS>/player/index.json                                  parts by gender and slot, attach bones,
                                                                      default man/woman, controller states, colors

Assembly (what SM.Common.Character.CharacterBuilder does; constants read from its IL2CPP code):
  - body parts (Top, Bottom, TopBottom, Gloves, Shoes, Cape) carry a copy of the rig: bind their skinned meshes to the
    base rig bones of the same name; part bones that the rig lacks are re-parented under the rig bone that matches
    their parent ("AddBone_" in the game).
  - Hair and Face prefabs go under "Root_PC_Head"; Eyebrow L/R under "Bone_Eyebrow_L1" / "Bone_Eyebrow_R1";
    the Cape anchor bone is "Bip001 Spine1".
  - Defaults (CharacterBuilder consts): Costume001_Top, Costume001_Bottom, Costume000_Gloves, Costume001_Shoes,
    Costume001_Cape. Hair/eyebrow defaults are not consts; the index uses the first part that has a mesh.
"""
import os, sys, json, shutil, time, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wos
from export_slime import (Skel, Builder, write_nodes, add_clip, write_index, container_map, folder_mb, log,
                          script_class, load_scripts_cached, encode_webp, r4)
from export_npc import controller_states, Humanoid

OUT = os.path.join(wos.ASSETS, 'player')
ATTACH = {'Hair': 'Root_PC_Head', 'Face': 'Root_PC_Head', 'Eyebrow_L': 'Bone_Eyebrow_L1', 'Eyebrow_R': 'Bone_Eyebrow_R1'}
CAPE_ANCHOR = 'Bip001 Spine1'
DEFAULT_COSTUME = {'Top': 'Costume001_Top', 'Bottom': 'Costume001_Bottom', 'Gloves': 'Costume000_Gloves',
                   'Shoes': 'Costume001_Shoes', 'Cape': 'Costume001_Cape'}


def export_go(go, out_path, rel, scripts):
    skel = Skel(wos.transform_of(go))
    glb = wos.GLB('world-of-slime tools/export_player.py')
    bld = Builder(glb, os.path.join(OUT, 'shared'), 'player/shared')
    meshes = bld.all_renderers(skel)
    write_nodes(glb, skel.nodes, keep_root_xform=True)
    bld.finish_nodes()
    behaviours = {}
    springs = []
    for n in skel.nodes:
        for c in n['go'].m_Component:
            if c.component.type.name == 'MonoBehaviour':
                mb = c.component.read()
                cls = script_class(mb, scripts) or '?'
                behaviours[cls] = behaviours.get(cls, 0) + 1
                if cls.endswith('SpringBone.SpringBone'):
                    tt = mb.object_reader.read_typetree()
                    springs.append(dict(bone=n['name'], **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in tt.items()
                                                           if isinstance(v, (int, float)) and not k.startswith('m_')}))
    glb.j['extras'] = dict(source=go.m_Name)
    glb.write(out_path)
    smr_bones = []
    for i, n in enumerate(skel.nodes):
        for r in wos.components(n['go'], 'SkinnedMeshRenderer'):
            smr_bones.append([skel.nodes[skel.node_of(b)]['name'] for b in r.m_Bones])
    meta = dict(id=go.m_Name, glb=rel, kb=round(os.path.getsize(out_path) / 1024, 1), meshes=meshes,
                materials=[dict(name=m['name'], **{k: m['extras'][k] for k in ('shader', 'keywords', 'floats', 'colors', 'shared')},
                                tex=sorted(m['extras']['tex'])) for m in glb.j.get('materials', [])],
                textures=bld.textures, nodes=[n['name'] for n in skel.nodes])
    if behaviours: meta['behaviours'] = behaviours
    if springs: meta['springBones'] = springs
    if smr_bones: meta['skinBones'] = sorted({b for l in smr_bones for b in l})
    return meta, skel


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    scripts = load_scripts_cached()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'parts'), exist_ok=True)
    env, loaded = wos.load(['customize.bundle', 'customize_shared.bundle'], depth=1)
    log('loaded', loaded)
    cont = container_map(env)
    prefabs = sorted(k for k in cont if k.lower().endswith('.prefab'))
    parts, rigs, errors = [], {}, {}
    rig_skel = {}
    for k in prefabs:
        slot = k.split('/')[4]
        go = cont[k].read()
        name = go.m_Name
        gender = 'man' if name.startswith('PC_Man') else 'woman' if name.startswith('PC_Woman') else None
        try:
            if slot == 'Base':
                meta, skel = export_go(go, os.path.join(OUT, f'{name}.glb'), f'player/{name}.glb', scripts)
                an = [wos.components(n['go'], 'Animator')[0] for n in skel.nodes if wos.components(n['go'], 'Animator')]
                if an and an[0].m_Controller.path_id:
                    info, used, states = controller_states(an[0].m_Controller.read())
                    meta.update(info, states=states)
                rigs[gender] = meta
                rig_skel[gender] = skel
            else:
                meta, skel = export_go(go, os.path.join(OUT, 'parts', f'{name}.glb'), f'player/parts/{name}.glb', scripts)
                s = slot
                if slot == 'Eyebrow':
                    s = 'Eyebrow_L' if name.endswith('_L') else 'Eyebrow_R'
                meta.update(slot=s, gender=gender, under=name.endswith('_Under'),
                            attach=ATTACH.get(s) or ('rig (bones by name), anchor ' + CAPE_ANCHOR if slot == 'Cape' else 'rig (bones by name)'))
                parts.append(meta)
            log(f'{slot:9s} {name}: {meta["kb"]} KB, meshes {[m["mesh"] for m in meta["meshes"]]}')
        except Exception as e:
            import traceback
            errors[name] = traceback.format_exc(); log('ERROR', name, e)

    # clips: one skeleton-only GLB per gender (same bone names, but each rig has its own humanoid Avatar)
    wsk = rig_skel.get('woman')
    mp, wp = {n['path'] for n in rig_skel['man'].nodes}, {n['path'] for n in wsk.nodes}
    rig_diff = dict(onlyMan=sorted(mp - wp), onlyWoman=sorted(wp - mp))
    clips = sorted([o.read() for o in env.objects if o.type.name == 'AnimationClip'], key=lambda c: c.m_Name)
    anims = {}
    for gender in ('man', 'woman'):
        skel = rig_skel[gender]
        glb = wos.GLB('world-of-slime tools/export_player.py')
        write_nodes(glb, skel.nodes)
        glb.j['nodes'][0]['name'] = f'PC_{gender}_anim'
        h2n = skel.hash2node()
        an = [wos.components(n['go'], 'Animator')[0] for n in skel.nodes if wos.components(n['go'], 'Animator')][0]
        human = Humanoid(an.m_Avatar.read(), h2n, skel.nodes)
        reps = []
        for c in clips:
            rep, miss = add_clip(glb, c, h2n, human=human)
            reps.append(rep)
        glb.j['extras'] = dict(source='customize_shared.bundle', retarget='by node name', avatar=an.m_Avatar.read().m_Name)
        fn = f'anim_{gender}.glb'
        glb.write(os.path.join(OUT, fn))
        anims[gender] = dict(glb=f'player/{fn}', avatar=an.m_Avatar.read().m_Name, unmappedBones=human.missing)
        log(f'{fn}: {len(reps)} clips, {os.path.getsize(os.path.join(OUT, fn)) / 1024:.1f} KB')
    anims['clips'] = reps

    # CustomizeDataSet (data.bundle) + its face textures
    denv, _ = wos.load(['data.bundle'], depth=1)
    cds = None
    for o in denv.objects:
        if o.type.name == 'MonoBehaviour' and o.peek_name() == 'CustomizeDataSet':
            mb = o.read(); cds = o.read_typetree(); break
    custom = {}
    os.makedirs(os.path.join(OUT, 'face'), exist_ok=True)
    for k, v in cds.items():
        if k.startswith('m_'):
            continue
        if isinstance(v, list) and v and isinstance(v[0], dict) and 'm_PathID' in v[0]:
            names = []
            for pp in getattr(mb, k):
                try:
                    t = pp.read()
                    data, alpha = encode_webp(t, 'decal' if 'Decal' in k else 'albedo')
                    fn = f'face/{t.m_Name}.webp'
                    open(os.path.join(OUT, fn), 'wb').write(data)
                    names.append(dict(name=t.m_Name, file='player/' + fn, size=f'{t.m_Width}x{t.m_Height}'))
                except Exception as e:
                    names.append(dict(missing=str(e)))
            custom[k] = names
        elif isinstance(v, list) and v and isinstance(v[0], dict) and set(v[0]) >= {'r', 'g', 'b'}:
            custom[k] = [r4([c['r'], c['g'], c['b'], c['a']]) for c in v]
        elif isinstance(v, list) and v and isinstance(v[0], dict) and set(v[0]) >= {'x', 'y', 'z', 'w'}:
            custom[k] = [r4([c['x'], c['y'], c['z'], c['w']]) for c in v]
        else:
            custom[k] = v
    del denv

    by = {}
    for p in parts:
        by.setdefault(p['gender'] or 'any', {}).setdefault(p['slot'], []).append(p['id'])
    defaults = {}
    for g in ('man', 'woman'):
        pre = 'PC_Man_' if g == 'man' else 'PC_Woman_'
        pick = {}
        for slot, suffix in DEFAULT_COSTUME.items():
            nm = pre + suffix
            if any(p['id'] == nm for p in parts):
                pick[slot] = nm
        for slot in ('Face', 'Hair', 'Eyebrow_L', 'Eyebrow_R'):
            cand = [p for p in parts if p['gender'] == g and p['slot'] == slot and p['meshes']]
            if cand:
                pick[slot] = sorted(c['id'] for c in cand)[0]
        defaults[g] = pick
    index = dict(generator='games/world-of-slime/tools/export_player.py',
                 note='Assemble: load the rig GLB, then each part; bind part skinned meshes to rig bones by name, '
                      're-parent part-only bones under the rig bone named like their parent, put Hair/Face/Eyebrow '
                      'prefab roots under their attach bone. Clips in anim_<gender>.glb target bones by name.',
                 rigs=rigs, rigDiff=rig_diff, attach=ATTACH, capeAnchor=CAPE_ANCHOR, defaults=defaults,
                 slots=by, parts=parts, anim=anims, customize=custom, errors=errors)
    idx = os.path.join(OUT, 'index.json')
    write_index(idx, index)
    index['totalMB'] = folder_mb(OUT)
    write_index(idx, index)
    log(f'done: {len(parts)} parts, {len(rigs)} rigs, {len(reps)} clips, {len(errors)} errors, {index["totalMB"]} MB')


if __name__ == '__main__':
    main()
