"""Cá voi xanh, cá voi lộ diện (WhaleSighting), cá nhà táng, đàn cá heo / cá voi sát thủ (R8, WORLD-GAPS.md §6) -> data/cetaceans.js
+ art/vfx/cetaceans/*.webp + audio/monsters/*.mp3 (chỉ clip chưa có) + art/vfx/p/*.webp (texture hạt mới).

Chạy:  python -I games/dredge/tools/cetaceans.py        (~1-2 phút: nạp shader hạt từ bundle bằng UnityPy)
Đọc:   Assets/GameObject/{BlueWhaleEvent,DolphinPod,OrcaPod,WhaleEvent,SpermWhaleEvent}.prefab, Mesh/{BlueWhale,Orca,spermwhale,WhaleMesh,Tentacle...}.asset,
       AnimationClip/{bluewhale_emerge_RAW,bluewhale_swimloop,dolphin_jump,dolphin_swimidle,orca_jump_RAW,orca_swimidle,spermwhale_breachattack_RAW,
       WhaleWorldEvent}.anim, AnimatorController/*.controller, Material/{BlueWhale,Dolphin,Spermwhale,Whale}_Mat.mat, Audio/SFX/World Event/**.ogg
       + hệ hạt qua tools/particles.py (Doc, Conv, Shaders, system, placement: cùng định dạng dữ liệu với DR_PARTICLES).
Ra:    window.DR_CETACEANS = { models{blue,dolphin,orca,sperm,whale}, events{...số của WorldEvent}, audio{key: {src, loop, vol, dur, orig}},
                               particles{tên: hệ hạt}, plib{textures, sprites, meshes} }
Toạ độ: như tools/tentacle.py (Unity trái tay -> three.js phải tay bằng đổi dấu z; quaternion (x,y,z,w) -> (-x,-y,z,w)).
Bẫy:   - Skeleton nằm dưới nút Animator; mesh có thể nằm ngoài cây đó (SkinnedMeshRenderer.m_Bones trỏ sang xương), nên mesh gắn theo xương chứ không theo cha.
       - Đường cong m_IsActive bật/tắt cả GameObject (hệ hạt) và bị trả về giá trị prefab khi trạng thái Animator không có đường cong đó.
       - WhaleWorldEvent.anim dùng m_EulerCurves (độ, thứ tự ZXY của Unity), JS đổi sang quaternion rồi đổi dấu z.
Rerunnable: cùng đầu vào ra cùng đầu ra từng byte (mp3 chỉ dựng khi chưa có tệp).
"""
import io, json, os, re, shutil, subprocess, sys

import numpy as np
import yaml

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tentacle as TN  # noqa: E402
import ray as RY  # noqa: E402  (pack_mesh)

GAME = os.path.dirname(HERE)
ASSETS = TN.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'cetaceans.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'cetaceans')
OUT_AUDIO = os.path.join(GAME, 'audio', 'monsters')
REF_AUDIO = os.path.join(ASSETS, 'Audio', 'SFX', 'World Event')
CL = TN.CL
rnd, vec = TN.rnd, TN.vec
TEX_MAX = {'blue': 512, 'dolphin': 256, 'orca': 256, 'sperm': 512, 'whale': 512}  # [ĐỀ XUẤT] cạnh lớn nhất của texture thân (gốc 1024-2048)

# model -> (prefab, tên GameObject mang Animator, controller)
MODELS = (
    ('blue', 'BlueWhaleEvent', 'bluewhale', 'BlueWhale_anim_control', ('swim', 'bluewhale_swimloop'), ('emerge', 'bluewhale_emerge_RAW')),
    ('dolphin', 'DolphinPod', 'Dolphin', 'Dolphin_Controller', ('swim', 'dolphin_swimidle'), ('jump', 'dolphin_jump')),
    ('orca', 'OrcaPod', 'orca', 'Orca_Controller', ('swim', 'orca_swimidle'), ('jump', 'orca_jump_RAW')),
    ('sperm', 'SpermWhaleEvent', 'spermwhale', 'Spermwhale_anim_control', ('breach', 'spermwhale_breachattack_RAW'),),
    ('whale', 'WhaleEvent', 'WhaleEvent', 'WhaleWorldEvent', ('sight', 'WhaleWorldEvent'),),
)


def guid_map(sub, exts):
    m = {}
    for dp, dns, fns in os.walk(os.path.join(ASSETS, sub)):
        dns.sort()
        for fn in sorted(fns):
            if fn.endswith('.meta'):
                with io.open(os.path.join(dp, fn), encoding='utf-8', errors='replace') as f:
                    t = f.read(400)
                g = re.search(r'guid: ([0-9a-f]{32})', t)
                if g:
                    m[g.group(1)] = os.path.join(dp, fn[:-5])
    return m


def ffmpeg(src, dst, args):
    exe = shutil.which('ffmpeg')
    assert exe, 'không thấy ffmpeg'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run([exe, '-y', '-v', 'error', '-i', src, '-vn'] + args + [dst], check=True)


def audio_entry(AUD, path, loop, vol, cap=None):
    """ogg gốc -> mp3 mono (sfx: 64 kb/s; vòng lặp: 32 kb/s, cắt cap giây). Ra khoá cet.<tên chuẩn hoá>."""
    base = os.path.splitext(os.path.basename(path))[0]
    safe = re.sub(r'[^A-Za-z0-9\-]+', '_', base).strip('_')
    key = 'cet.' + re.sub(r'[^a-z0-9]+', '.', base.lower()).strip('.')
    dst = os.path.join(OUT_AUDIO, safe + '.mp3')
    if not os.path.exists(dst):
        args = ['-ac', '1', '-ar', '22050', '-b:a', '24k'] if loop else ['-ac', '1', '-b:a', '48k']   # mp3 MPEG-1 không có 24 kb/s: vòng lặp xuống 22,05 kHz
        if cap:   # vòng lặp: cắt cap giây, mờ vào/ra 0,3 s để chỗ nối không nổ tiếng [ĐỀ XUẤT]
            args = ['-t', str(cap), '-af', 'afade=t=in:d=0.3,afade=t=out:st=%s:d=0.3' % (cap - 0.3)] + args
        ffmpeg(path, dst, args)
    # độ dài thật của mp3 (ffprobe nếu có; không thì ước từ kích thước)
    dur = None
    probe = shutil.which('ffprobe')
    if probe:
        out = subprocess.run([probe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout.strip()
        dur = round(float(out), 2) if out else None
    AUD[key] = {'src': 'audio/monsters/' + safe + '.mp3', 'loop': bool(loop), 'vol': round(float(vol), 3), 'dur': dur,
                'orig': 'Assets/Audio/SFX/World Event/' + os.path.relpath(path, REF_AUDIO).replace(os.sep, '/')}
    return key


def read_curves(path, by_path):
    """Clip -> {len, loop, events, curves:{nút: {p,q,s,e}}, active:{nút: khoá}}; khoá [t, giá trị..., inSlope..., outSlope...]."""
    doc = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
    out = {}

    def add(lst, kind):
        for c in lst:
            node = by_path[c['path']]
            keys = []
            for k in c['curve']['m_Curve']:
                if kind == 'q':
                    v, i, o = vec(k['value'], 'xyzw'), vec(k['inSlope'], 'xyzw'), vec(k['outSlope'], 'xyzw')
                    v, i, o = TN.conv_q(v), TN.conv_q(i), TN.conv_q(o)
                elif kind == 'p':
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                else:  # s và e (độ Unity, giữ nguyên; JS đổi sang quaternion)
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                keys.append(rnd([float(k['time'])] + v + i + o, 4))
            assert kind not in out.setdefault(node, {}), 'hai đường cong %s cùng nút %s' % (kind, c['path'])
            out[node][kind] = keys
    add(doc['m_RotationCurves'], 'q')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    add(doc.get('m_EulerCurves') or [], 'e')
    act = {}
    for fc in doc['m_FloatCurves']:
        assert fc['attribute'] == 'm_IsActive', fc['attribute']
        act[by_path[fc['path']]] = [[round(float(k['time']), 5), float(k['value'])] for k in fc['curve']['m_Curve']]
    events = [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']]
    st = doc['m_AnimationClipSettings']
    return {'len': round(float(st['m_StopTime']), 5), 'loop': bool(st['m_LoopTime']), 'events': events, 'curves': {str(k): v for k, v in out.items()}, 'active': {str(k): v for k, v in act.items()}}


def controller(path):
    """Animator: tham số, trạng thái (tên -> clip), chuyển tiếp (điều kiện, exit time, thời lượng). Chỉ lấy cái 5 bộ điều khiển này dùng."""
    d = TN.load_doc(path)
    sm = [o[1] for o in d.values() if o[0] == 1107][0]
    states = {i: o[1] for i, o in d.items() if o[0] == 1102}
    out = {'default': states[sm['m_DefaultState']['fileID']]['m_Name'], 'states': {}, 'transitions': []}
    for i, s in states.items():
        mo = s['m_Motion']  # tên trạng thái có thể khác tên clip (orca_jump <- orca_jump_RAW.anim)
        out['states'][s['m_Name']] = {'speed': float(s['m_Speed']), 'clip': os.path.basename(TN.guid_path('AnimationClip', mo['guid']))[:-5]}
        for t in s['m_Transitions']:
            tr = d[t['fileID']][1]
            out['transitions'].append({'from': s['m_Name'], 'to': states[tr['m_DstState']['fileID']]['m_Name'],
                                       'cond': [c['m_ConditionEvent'] for c in tr['m_Conditions']], 'hasExit': bool(tr['m_HasExitTime']),
                                       'exit': round(float(tr['m_ExitTime']), 5), 'dur': round(float(tr['m_TransitionDuration']), 5)})
    return out


def trs(T):
    p = vec(T['m_LocalPosition'])
    p[2] = -p[2]
    return {'p': rnd(p, 6), 'q': rnd(TN.conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(vec(T['m_LocalScale']), 6)}


def build_model(key, prefab, anim_go, ctrl, clip_defs, MATS, TEXG, AUD, particle_roots):
    objs = TN.load_doc(os.path.join(ASSETS, 'GameObject', prefab + '.prefab'))
    go = {i: o[1] for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {o['m_GameObject']['fileID']: i for i, o in tf.items()}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    name = lambda t: go[go_of_tf[t]]['m_Name']
    animators = [(o[1]['m_GameObject']['fileID'], o[1]) for o in objs.values() if o[0] == 95]
    ctrl_guid = TN.guid_path('AnimatorController', animators[0][1]['m_Controller']['guid'])
    assert os.path.basename(ctrl_guid) == ctrl + '.controller', ctrl_guid
    first = [g for g, a in animators if go[g]['m_Name'] == anim_go][0]
    inst = []                                    # mọi bản (đàn cá heo 3, cá voi sát thủ 2): cùng cây, khác chỗ đặt
    for g, a in animators:
        assert go[g]['m_Name'] == anim_go and os.path.basename(TN.guid_path('AnimatorController', a['m_Controller']['guid'])) == ctrl + '.controller'
        inst.append(g)
    # nút của bản đầu
    root_t = tf_of_go[first]
    order = []

    def walk(t):
        order.append(t)
        for c in tf[t]['m_Children']:
            walk(c['fileID'])
    walk(root_t)
    index = {t: i for i, t in enumerate(order)}
    nodes = []
    for t in order:
        n = trs(tf[t])
        n.update({'name': name(t), 'parent': index.get(tf[t]['m_Father']['fileID'], -1), 'active': bool(go[go_of_tf[t]]['m_IsActive'])})
        nodes.append(n)
    paths = []
    for t in order:
        p, x = [], t
        while x != root_t:
            p.append(name(x))
            x = tf[x]['m_Father']['fileID']
        paths.append('/'.join(reversed(p)))
    by_path = {p: i for i, p in enumerate(paths)}
    assert len(by_path) == len(paths), 'đường dẫn nút trùng ở %s' % key
    # nơi đặt các bản so với PodContainer: chuỗi cha từ nút animator lên tới nút không còn trong nhánh Pod (giữ cả local lẫn tên cha)
    mounts = []
    for g in inst:
        chain, t = [], tf_of_go[g]
        while t:
            chain.append(t)
            t = tf[t]['m_Father']['fileID']
        # chuỗi gốc -> animator; cắt bỏ gốc prefab (event root) và Pod để lại phần riêng của từng con
        names = [name(x) for x in reversed(chain)]
        mounts.append({'chain': names, 'local': [trs(tf[x]) for x in reversed(chain)]})
    # mesh (SkinnedMeshRenderer) có xương nằm trong cây của bản đầu
    meshes = []
    for i, o in sorted(objs.items()):
        if o[0] != 137:
            continue
        smr = o[1]
        bones = [b['fileID'] for b in smr['m_Bones']]
        if not bones or not all(b in index for b in bones):
            continue
        mesh_path = TN.guid_path('Mesh', smr['m_Mesh']['guid'])
        mat_path = TN.guid_path('Material', smr['m_Materials'][0]['guid'])
        assert len(smr['m_Materials']) == 1
        m, bind, nv = TN.read_skinned_mesh(mesh_path)
        assert len(bind) == len(bones), 'bindpose %d khác xương %d' % (len(bind), len(bones))
        mat = list(yaml.load(io.open(mat_path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]
        sp = mat['m_SavedProperties']
        mt = [sp['m_TexEnvs'][k] for k in ('_MainTex', 'Texture2D_9aa7ba2263944b48bbf43c218dc48459', 'Texture2D_23e21d2602df45a9921e7c096a6a9432') if k in sp['m_TexEnvs']][0]  # Leviathan_Shader | Lit_Shader_0 | tentacle
        tex_src = TN.guid_path('Texture2D', mt['m_Texture']['guid'])
        tname = os.path.splitext(os.path.basename(tex_src))[0]
        tkey = key + '_' + re.sub(r'[^A-Za-z0-9]+', '', tname).lower()
        if tkey not in TEXG:
            from PIL import Image
            im = Image.open(tex_src).convert('RGB')
            s = TEX_MAX[key] / max(im.size)
            if s < 1:
                im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            os.makedirs(OUT_ART, exist_ok=True)
            p = os.path.join(OUT_ART, tkey + '.webp')
            im.save(p, 'WEBP', quality=80, method=6)
            TEXG[tkey] = ('art/vfx/cetaceans/' + tkey + '.webp', os.path.getsize(p), im.size)
        col = sp['m_Colors']['_Color']
        meshes.append({'name': go[smr['m_GameObject']['fileID']]['m_Name'], 'bones': [index[b] for b in bones], 'bind': bind, 'mesh': RY.pack_mesh(m),
                       'tex': TEXG[tkey][0], 'color': rnd([float(col['r']), float(col['g']), float(col['b'])], 4),
                       'tiling': rnd([float(mt['m_Scale']['x']), float(mt['m_Scale']['y'])], 4), 'offset': rnd([float(mt['m_Offset']['x']), float(mt['m_Offset']['y'])], 4),
                       'srcMat': os.path.basename(mat_path), 'verts': nv})
    assert meshes, 'không có SkinnedMeshRenderer ở ' + key
    clips = {}
    for k, fn in clip_defs:
        clips[k] = read_curves(os.path.join(ASSETS, 'AnimationClip', fn + '.anim'), by_path)
        clips[k]['src'] = fn + '.anim'
    # hệ hạt: GameObject có ParticleSystem mà cha không có (gốc của từng cụm); đặt theo nút cha
    ps_nodes = [t for t in order if tf_of_go[go_of_tf[t]] and any(objs[c['component']['fileID']][0] == 198 for c in go[go_of_tf[t]]['m_Component'])]
    ps_set = set(ps_nodes)
    pr = []
    for t in ps_nodes:
        if tf[t]['m_Father']['fileID'] in ps_set:
            continue
        pr.append({'node': index[t], 'name': name(t), 'parent': index[tf[t]['m_Father']['fileID']] if tf[t]['m_Father']['fileID'] in index else -1})
    particle_roots[key] = (prefab, pr, [paths[index[t]] for t in ps_nodes])
    return {'nodes': nodes, 'paths': paths, 'mounts': mounts, 'meshes': meshes, 'clips': clips, 'controller': controller(ctrl_guid),
            'particleRoots': pr}, objs, go, tf, tf_of_go, go_of_tf


def main():
    AUD, TEXG, particle_roots = {}, {}, {}
    ag = guid_map('Audio', None)
    ag.update(guid_map('AudioClip', None))
    models, events = {}, {}
    objs_of = {}
    for key, prefab, anim_go, ctrl, *clip_defs in MODELS:
        m, objs, go, tf, tf_of_go, go_of_tf = build_model(key, prefab, anim_go, ctrl, clip_defs, None, TEXG, AUD, particle_roots)
        models[key] = m
        objs_of[key] = (prefab, objs, go, tf, tf_of_go, go_of_tf)
    # ---- số của sự kiện (BlueWhaleWorldEvent / CetaceanPodWorldEvent / WhaleSightingWorldEvent / Cetacean) + tiếng
    scr = {}
    for dp, dns, fns in os.walk(os.path.join(ASSETS, 'Scripts', 'Assembly-CSharp')):
        for fn in fns:
            if fn.endswith('.cs.meta'):
                t = io.open(os.path.join(dp, fn), encoding='utf-8', errors='replace').read(400)
                scr[re.search(r'guid: ([0-9a-f]{32})', t).group(1)] = fn[:-8]

    def clipkey(ref, loop=False, vol=1.0, cap=None):
        p = ag.get(ref['guid'])
        assert p, 'không thấy clip %s' % ref
        return audio_entry(AUD, p, loop, vol, cap)

    def source(o, d, objs, go, loop_cap=12):
        a = objs[d['fileID']][1]
        ref = a['m_audioClip']
        r = {'vol': float(a['m_Volume']), 'loop': bool(a['Loop']), 'min': float(a['MinDistance']), 'max': float(a['MaxDistance']),
             'rolloff': int(a['rolloffMode']), 'playOnAwake': bool(a['m_PlayOnAwake']), 'obj': go[a['m_GameObject']['fileID']]['m_Name']}
        if ref.get('guid'):
            r['key'] = clipkey(ref, bool(a['Loop']), 1.0, loop_cap if a['Loop'] else None)
        return r
    for key, prefab, *_ in MODELS:
        _p, objs, go, tf, tf_of_go, go_of_tf = objs_of[key]
        ev = {'prefab': prefab}
        for i, o in objs.items():
            if o[0] != 114:
                continue
            d = o[1]
            cls = scr.get(d['m_Script']['guid'])
            if cls in ('BlueWhaleWorldEvent', 'CetaceanPodWorldEvent', 'WhaleSightingWorldEvent'):
                ev['class'] = cls
                for k, v in d.items():
                    if k.startswith('m_') or isinstance(v, (dict, list)):
                        continue
                    ev[k] = float(v)
                for k in ('emergeAudio', 'swimAudio', 'callAudio', 'submergeAudio'):
                    if k in d and d[k].get('fileID'):
                        ev[k] = source(o, d[k], objs, go)
                if 'callClips' in d:
                    ev['callClips'] = [clipkey(c) for c in d['callClips']]
                if 'cetaceans' in d:
                    ev['cetaceans'] = []
                    for c in d['cetaceans']:
                        cd = objs[c['fileID']][1]
                        ev['cetaceans'].append({'name': go[cd['m_GameObject']['fileID']]['m_Name'], **{k: (float(v) if not isinstance(v, bool) else v)
                                                for k, v in cd.items() if k in ('timeBetweenJumpsMin', 'timeBetweenJumpsMax', 'animatorSpeed', 'isAllowedToJump', 'jumpAudioDelaySec')},
                                                'jumpClips': [clipkey(c) for c in cd['jumpClips']],
                                                'jumpAudio': source(o, cd['jumpAudio'], objs, go) if cd['jumpAudio'].get('fileID') else None,
                                                'jumpParticles': go[objs[cd['jumpParticles']['fileID']][1]['m_GameObject']['fileID']]['m_Name'] if cd['jumpParticles'].get('fileID') else None,
                                                'signalOnEvent': bool(cd['animationEvents'].get('fileID'))})
                ev['rootScale'] = rnd([float(tf[tf_of_go[d['m_GameObject']['fileID']]]['m_LocalScale'][a]) for a in 'xyz'], 4)
        # nguồn tiếng không có script điều khiển trong sự kiện: Sperm / Whale (clip phát khi Awake)
        if ev.get('class') == 'WhaleSightingWorldEvent':
            for i, o in objs.items():
                if o[0] == 82 and o[1]['m_audioClip'].get('guid'):
                    ev['sound'] = source(o, {'fileID': i}, objs, go)
        # tiếng của BlueWhale: clip nằm ở chính AudioSource (emerge, swim, call)
        events[key] = ev
    # ---- hệ hạt: dùng bộ máy của particles.py
    import particles as PT
    guids = PT.Guids()
    conv = PT.Conv(guids)
    conv.shaders = PT.Shaders()
    conv.state = {}
    for nm in conv.shaders.objs:
        st = conv.shaders.get(nm)
        if st:
            conv.state[nm] = st
    parts = {}
    for key, (prefab, pr, _paths) in particle_roots.items():
        doc = PT.Doc('GameObject/' + prefab + '.prefab', guids)
        for r in pr:
            tgt = models[key]['paths'][r['node']]
            cands = sorted(g for g in doc.name if doc.path(g).endswith('/' + tgt.split('/')[-1]) and doc.comp(g, 198) is not None)
            # chọn theo đường dẫn tương đối đầy đủ so với nút animator (cùng đuôi)
            cands = [g for g in cands if doc.path(g).endswith('/' + tgt)] or cands
            g = cands[0]
            nodes, _gos = PT.system(doc, conv, g, managed=('__all__',))
            pname = 'Cet_%s_%s' % (key, r['name'])
            attach = dict(PT.placement(doc, g, stop=doc.parent(g)), to='Parent')
            parts[pname] = {'src': 'GameObject/%s.prefab:%s' % (prefab, doc.path(g)), 'attach': attach, 'nodes': nodes}
            r['ps'] = pname
            r['startActive'] = models[key]['nodes'][r['node']]['active']
    for p in parts.values():
        p['materials'] = PT.mats_of(p['nodes'], conv)
    plib = {'textures': dict(sorted(conv.textures.items())), 'sprites': dict(sorted(conv.sprites.items())), 'meshes': dict(sorted(conv.meshes.items()))}
    for m in models.values():
        del m['paths']          # chỉ dùng để ghép hệ hạt trong tool
        for x in m['meshes']:
            del x['srcMat']
    data = {'src': 'GameObject/{BlueWhaleEvent,DolphinPod,OrcaPod,WhaleEvent,SpermWhaleEvent}.prefab + AnimationClip + Mesh + Material + Audio/SFX/World Event',
            'models': models, 'events': events, 'audio': AUD, 'particles': PT.rnd(parts), 'plib': PT.rnd(plib)}
    js = '// Generated by games/dredge/tools/cetaceans.py from the cetacean world-event prefabs. Do not edit.\nwindow.DR_CETACEANS = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    art = sum(os.path.getsize(os.path.join(OUT_ART, f)) for f in os.listdir(OUT_ART))
    aud = sum(os.path.getsize(os.path.join(GAME, v['src'])) for v in AUD.values())
    print('data %d KB, art %d KB, audio %d KB (%d clips), particles %d' % (len(js) // 1024, art // 1024, aud // 1024, len(AUD), len(parts)))
    for k, m in models.items():
        print(k, 'nodes', len(m['nodes']), 'meshes', [(x['name'], x['verts']) for x in m['meshes']], 'clips', {c: (v['len'], v['loop']) for c, v in m['clips'].items()})


if __name__ == '__main__':
    main()
