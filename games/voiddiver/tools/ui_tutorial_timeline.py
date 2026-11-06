# -*- coding: utf-8 -*-
"""ui_tutorial_timeline.py - boc hai Timeline cua mo man / cat canh tutorial tu ban demo VOID DIVER cho ban web.

    set PYTHONIOENCODING=utf-8
    python tools/ui_tutorial_timeline.py            # timeline.json + video
    python tools/ui_tutorial_timeline.py --no-video # chi timeline.json

Ra (art/ui/tutorial/):
    timeline.json   moi prefab: duration (= cuoi clip xa nhat), fps, tracks[] {class, name, muted, clips[{name, start, duration,
                    clipIn, timeScale, easeIn, easeOut, asset{class, ...truong chinh}}], markers[{time, signal}]},
                    nodes{"<duong dan>": [px, py, pz, qx, qy, qz, qw]} transform cuc bo cua moi nut; AnimationTrack co them
                    offset{pos, euler, applyOffsets, trackOffset} (m_InfiniteClipOffset* cua track).
                    curves{"<track>|<duong dan tu Animator>:<thuoc tinh>": [[t, a, b, c, d], ...]} cua AnimationTrack (clip "Recorded" vo han):
                    doan tu t: v(t + x) = ((a x + b) x + c) x + d (StreamedClip cua Unity, he so Hermite da doi sang da thuc).
    intro/Diveloading.webm   5,6 s dau cua VideoClip Diveloading (VideoPlayer cua IntroTimelineObject, toc do 1,25),
                    960x540 VP9 khong tieng (tieng la SFX EnterLoading cua Timeline). Can ffmpeg trong PATH.

Do duoc (2026-09-26):
- IntroTimelineObject (Addressable 'Timeline/IntroTimelineObject.prefab', Extensions.InstantiateIntroTimelineObject) choi
  TL_World_OBJ_PhoneBooth_Intro khi stage o trang thai Intro (5). SignalReceiver: IntroFinish -> OnIntroFinished (tat vcam, gui
  ReqClientIntroFinished -> Playing -> Lua OnStage), TimelineFinish -> OnTimelineFinished.
- IngameCutScene_Chapter_01_TutorialCampaign_1 (LuaApi.PlayCutscene) choi TL_InGameCutScene_Chapter00_TutorialCampaign_1.
  Tin hieu Lua 1 = CutsceneLuaSignalClip.SignalId, phat mot lan luc clip bat dau (CutsceneLuaSignalBehaviour.OnBehaviourPlay ->
  GameCutsceneManager.EmitLuaSignal). Het timeline: TimelineFinish -> CutsceneTimelineObject.OnTimelineFinished.
- Nhan duong cong: khop crc32(duong dan tuong doi) / crc32(ten thuoc tinh) voi m_ClipBindingConstant.genericBindings;
  Transform: attribute 1 = localPosition (3 duong), 2 = localRotation (4), 3 = localScale (3), 4 = localEulerAngles (3).
"""
import io, json, os, shutil, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vd
import UnityPy.helpers.ResourceReader as RR

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'art', 'ui', 'tutorial')
MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'
PREFABS = {'intro': 'IntroTimelineObject', 'cutscene1100': 'IngameCutScene_Chapter_01_TutorialCampaign_1'}
ATTRS = ['m_Alpha', 'm_Color.a', 'm_Color.r', 'm_Color.g', 'm_Color.b', 'm_AmplitudeGain', 'm_FrequencyGain', 'm_IsActive',
         'm_Lens.FieldOfView', 'm_Intensity', 'weight', 'm_Weight', 'm_Enabled']
TRANSFORM_ATTR = {1: ('localPosition', 'xyz'), 2: ('localRotation', 'xyzw'), 3: ('localScale', 'xyz'), 4: ('localEulerAngles', 'xyz')}
VIDEO_SECONDS = 5.6        # video hien 0..4,333 s timeline x toc do 1,25 = 5,42 s video
VIDEO_CLIP = 'Diveloading'


def cmap_of(env):
    out = {}
    for o in env.objects:
        if o.type.name == 'MonoScript':
            d = o.read()
            out[o.path_id] = (d.m_Namespace + '.' if d.m_Namespace else '') + d.m_ClassName
    return out


def cls(reader, cmap):
    try:
        return cmap.get(reader.parse_monobehaviour_head().m_Script.path_id, '?')
    except Exception:
        return reader.type.name


def u2f(u):
    return struct.unpack('<f', struct.pack('<I', u & 0xFFFFFFFF))[0]


def streamed(data):
    """StreamedClip: [time, soKey, (curveIndex, c0, c1, c2, c3) x soKey]..."""
    out, i, n = [], 0, len(data)
    while i < n - 1:
        t = u2f(data[i]); k = data[i + 1]; i += 2
        keys = []
        for _ in range(k):
            keys.append((data[i], [u2f(data[i + 1 + j]) for j in range(4)])); i += 5
        out.append((t, keys))
    return out


def go_paths(root_tr):
    """crc32(duong dan tuong doi) -> duong dan, tinh tu moi nut cua prefab (Animator cua track co the nam o nut con,
    vd VcamOffset / Actors / Lights), nen so khop duoc duong dan tuong doi voi bat ky nut nao."""
    nodes = []

    def walk(tr, names):
        nodes.append(names)
        for c in tr.m_Children:
            ct = c.deref().read()
            walk(ct, names + [ct.m_GameObject.deref().read().m_Name])
    walk(root_tr, [])
    out = {zlib.crc32(b''): ''}
    for n in nodes:
        for m in nodes:
            if len(m) > len(n) and m[:len(n)] == n:
                p = '/'.join(m[len(n):])
                out.setdefault(zlib.crc32(p.encode()), p)
    return out


def nodes_of(root_tr):
    """Duong dan -> [px, py, pz, qx, qy, qz, qw] (transform cuc bo, Unity) cua moi nut con."""
    out = {}

    def walk(tr, path):
        for c in tr.m_Children:
            ct = c.deref().read()
            nm = ct.m_GameObject.deref().read().m_Name
            p = (path + '/' + nm) if path else nm
            a, q = ct.m_LocalPosition, ct.m_LocalRotation
            out[p] = [round(a.x, 5), round(a.y, 5), round(a.z, 5), round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)]
            walk(ct, p)
    walk(root_tr, '')
    return out


def curves_of(clip_reader, paths):
    tt = clip_reader.read_typetree()
    sc = tt['m_MuscleClip']['m_Clip']['data']['m_StreamedClip']
    names = []
    attr_crc = {zlib.crc32(a.encode()): a for a in ATTRS}
    for b in tt['m_ClipBindingConstant']['genericBindings']:
        p = paths.get(b['path'], '#%d' % b['path'])
        if b['typeID'] == 4 and b['attribute'] in TRANSFORM_ATTR:
            prop, axes = TRANSFORM_ATTR[b['attribute']]
            names += ['%s:%s.%s' % (p, prop, a) for a in axes]
        else:
            names.append('%s:%s' % (p, attr_crc.get(b['attribute'], '#%d' % b['attribute'])))
    cur = {}
    for t, keys in streamed(sc['data']):
        if t < -1e30 or t == float('inf'):
            continue      # khung canh -FLT_MAX / +inf cua Unity
        for idx, c in keys:
            nm = names[idx] if idx < len(names) else '#curve%d' % idx
            cur.setdefault(nm, []).append([round(t, 5)] + [round(x, 6) for x in c])
    return {'name': tt.get('m_Name'), 'streamedCurves': sc['curveCount'], 'curves': cur}


def asset_fields(reader, cmap):
    c = cls(reader, cmap)
    out = {'class': c}
    try:
        tt = reader.read_typetree()
    except Exception:
        return out
    for k in ('Sfx', 'SignalId', 'Direction', 'EffectIntensity', 'animationReference', 'loop'):
        if k in tt:
            v = tt[k]
            out[k] = v if not isinstance(v, dict) else None
    if 'EffectColor' in tt:
        out['EffectColor'] = [round(tt['EffectColor'][x], 4) for x in 'rgba']
    for k in ('animationReference', 'sourceGameObject', 'VirtualCamera'):
        if k in tt and isinstance(tt[k], dict) and 'exposedName' in tt[k]:
            out[k] = tt[k]['exposedName']
    if c.endswith('SpineAnimationStateClip') or 'animationReference' in tt:
        try:
            ref = reader.read().template.animationReference
            a = vd.deref(ref)
            if a is not None:
                out['animation'] = a.read_typetree().get('m_Name') if hasattr(a, 'read_typetree') else getattr(a, 'm_Name', None)
        except Exception:
            pass
    return out


def dump_prefab(env, cmap, root_name):
    root = None
    for o in env.objects:
        if o.type.name == 'GameObject' and o.peek_name() == root_name:
            g = o.read()
            for c in g.m_Component:
                r = (c.component if hasattr(c, 'component') else c).deref()
                if r.type.name == 'Transform' and not r.read().m_Father.path_id:
                    root = (g, r.read())
    g, root_tr = root
    paths = go_paths(root_tr)
    director = next(c for c in ((cc.component if hasattr(cc, 'component') else cc).deref() for cc in g.m_Component) if c.type.name == 'PlayableDirector').read()
    tl_reader = director.m_PlayableAsset.deref()
    tl = tl_reader.read()
    res = {'prefab': root_name, 'timeline': tl.m_Name, 'fps': tl.m_EditorSettings.m_Framerate, 'wrapMode': director.m_WrapMode,
           'tracks': [], 'curves': {}, 'nodes': nodes_of(root_tr)}
    end = 0.0

    def track(tp, parent_muted):
        nonlocal end
        r = tp.deref()
        t = r.read()
        muted = bool(t.m_Muted) or parent_muted
        e = {'class': cls(r, cmap), 'name': t.m_Name, 'muted': muted, 'clips': [], 'markers': []}
        for c in t.m_Clips:
            ce = {'name': c.m_DisplayName, 'start': round(c.m_Start, 5), 'duration': round(c.m_Duration, 5), 'clipIn': round(c.m_ClipIn, 5),
                  'timeScale': round(c.m_TimeScale, 5), 'easeIn': round(c.m_EaseInDuration, 5), 'easeOut': round(c.m_EaseOutDuration, 5)}
            if c.m_Asset.m_PathID:
                ce['asset'] = asset_fields(c.m_Asset.deref(), cmap)
            e['clips'].append(ce)
            if not muted:
                end = max(end, c.m_Start + c.m_Duration)
        for m in t.m_Markers.m_Objects:
            if not m.m_PathID:
                continue
            mr = m.deref()
            mt = mr.read_typetree()
            sig = None
            if mt.get('m_Asset') and mt['m_Asset'].get('m_PathID'):
                s = vd.deref(mr.read().m_Asset)
                sig = s.m_Name if s is not None else None
            e['markers'].append({'time': round(mt.get('m_Time', 0), 5), 'signal': sig})
            if not muted and sig:
                end = max(end, mt.get('m_Time', 0))
        ic = getattr(t, 'm_InfiniteClip', None)
        if ic is not None and ic.m_PathID:
            op, oe = t.m_InfiniteClipOffsetPosition, t.m_InfiniteClipOffsetEulerAngles
            e['offset'] = {'pos': [round(op.x, 5), round(op.y, 5), round(op.z, 5)], 'euler': [round(oe.x, 4), round(oe.y, 4), round(oe.z, 4)],
                           'applyOffsets': int(getattr(t, 'm_ApplyOffsets', 0)), 'trackOffset': int(getattr(t, 'm_TrackOffset', -1))}
        if ic is not None and ic.m_PathID and not muted:
            cv = curves_of(ic.deref(), paths)
            e['infiniteClip'] = cv['name']
            # khoa "<ten track>|<duong dan tu Animator cua track>:<thuoc tinh>"; '' = chinh nut co Animator
            res['curves'].update({t.m_Name + '|' + k: v for k, v in cv['curves'].items()})
        res['tracks'].append(e)
        for ch in t.m_Children:
            track(ch, muted)
    for tp in tl.m_Tracks:
        track(tp, False)
    res['duration'] = round(end, 5)
    print('  %s: %s %.3f s, %d track, %d duong cong' % (root_name, tl.m_Name, end, len(res['tracks']), len(res['curves'])), flush=True)
    return res


def rip_video(out_dir):
    ff = shutil.which('ffmpeg')
    if not ff:
        print('  ! khong thay ffmpeg, bo qua video')
        return None
    got = {}

    def run(env):
        for o in env.objects:
            if o.type.name == 'VideoClip' and o.peek_name() == VIDEO_CLIP:
                d = o.read()
                er = d.m_ExternalResources   # du lieu webm nam trong .resource cua bundle
                got['data'] = bytes(RR.get_resource_data(er.m_Source, d.object_reader.assets_file, er.m_Offset, er.m_Size))
                got['fps'] = d.m_FrameRate
    vd.with_deps(vd.bfile('dependencies_assets_video'), run)
    if 'data' not in got:
        print('  ! khong thay VideoClip', VIDEO_CLIP)
        return None
    tmp = os.path.join(tempfile.gettempdir(), 'vd_' + VIDEO_CLIP + '.webm')
    open(tmp, 'wb').write(got['data'])
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, VIDEO_CLIP + '.webm')
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', tmp, '-t', str(VIDEO_SECONDS), '-vf', 'scale=960:-2', '-an',
                    '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1', dst], check=True)
    os.remove(tmp)
    print('  video', dst, os.path.getsize(dst), 'B', flush=True)
    return {'file': 'intro/' + VIDEO_CLIP + '.webm', 'seconds': VIDEO_SECONDS, 'fps': got['fps']}


def main():
    res = {'source': 'VOID DIVER demo, tools/ui_tutorial_timeline.py'}

    def run(env):
        cmap = cmap_of(env)
        for k, name in PREFABS.items():
            res[k] = dump_prefab(env, cmap, name)
    vd.with_deps(vd.bfile('remote_prefab_assets_timeline'), run, deps=[vd.bfile(MONO), vd.bfile('dependencies_assets_timelines')])
    if '--no-video' not in sys.argv:
        v = rip_video(os.path.join(OUT, 'intro'))
    else:
        f = os.path.join(OUT, 'intro', VIDEO_CLIP + '.webm')
        v = {'file': 'intro/' + VIDEO_CLIP + '.webm', 'seconds': VIDEO_SECONDS, 'fps': 30.0} if os.path.exists(f) else None
    if v:
        v['speed'] = 1.25          # VideoPlayer.m_PlaybackSpeed cua IntroTimelineObject/Canvas/Video/Player
        res['intro']['video'] = v
    with open(os.path.join(OUT, 'timeline.json'), 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, separators=(',', ':'))
    print('wrote', os.path.join(OUT, 'timeline.json'))


if __name__ == '__main__':
    main()
