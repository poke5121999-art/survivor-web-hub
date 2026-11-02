"""Export scenes + prefabs + materials + asset tables to data/scene.json for the JS runtime.
PPtrs become {"$": "<code>_<pid>"}. Usage: python3 -I export_prefabs.py DUMP_DIR INVENTORY_TSV GAME_DIR"""
import sys, os, json
dump, inv, game = sys.argv[1:4]
ext = json.load(open(os.path.join(dump, 'externals.json')))
CODES = {'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2',
         'globalgamemanagers.assets': 'gg', 'globalgamemanagers': 'gm', 'level0': 'l0', 'level1': 'l1', 'level2': 'l2',
         'unity default resources': 'ud', 'unity_builtin_extra': 'ub'}
def code(f): return CODES.get(f, 'r' + f[:6])
def key(f, pid): return f'{code(f)}_{pid}'
recs = {}
for fn in os.listdir(os.path.join(dump, 'json')):
    f = fn[:-5]
    for r in json.load(open(os.path.join(dump, 'json', fn))):
        recs[(f, r['path_id'])] = r
script = {}
for line in open(inv):
    a = line.rstrip('\n').split('\t')
    if len(a) >= 4 and a[2] == 'MonoBehaviour' and '<' in a[3]:
        script[(a[0], int(a[1]))] = a[3].split('<')[-1].rstrip('>')
NOISE = {'m_GameObject', 'm_Script', 'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset',
         'm_EditorHideFlags', 'm_EditorClassIdentifier', 'm_OnCullStateChanged', 'm_LightmapIndex', 'm_LightmapIndexDynamic',
         'm_LightmapTilingOffset', 'm_LightmapTilingOffsetDynamic', 'm_LightProbeUsage', 'm_ReflectionProbeUsage', 'm_CastShadows',
         'm_ReceiveShadows', 'm_DynamicOccludee', 'm_MotionVectors', 'm_RenderingLayerMask', 'm_RendererPriority',
         'm_StaticBatchInfo', 'm_StaticBatchRoot', 'm_ProbeAnchor', 'm_LightProbeVolumeOverride', 'm_ScaleInLightmap',
         'm_PreserveUVs', 'm_IgnoreNormalsForChartDetection', 'm_ImportantGI', 'm_StitchLightmapSeams', 'm_SelectedEditorRenderState',
         'm_MinimumChartSize', 'm_AutoUVMaxDistance', 'm_AutoUVMaxAngle', 'm_LightmapParameters', 'rolloffCustomCurve',
         'panLevelCustomCurve', 'spreadCustomCurve', 'reverbZoneMixCustomCurve', 'm_TypeName'}
used_assets = set()
def conv(f, v):
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            if v['m_PathID'] == 0: return None
            if v['m_FileID'] >= 0 and v['m_FileID'] - 1 < len(ext.get(f, [])):
                tf = f if v['m_FileID'] == 0 else ext[f][v['m_FileID'] - 1]
                k = key(tf, v['m_PathID']); used_assets.add((tf, v['m_PathID'])); return {'$': k}
            return None
        return {k: conv(f, x) for k, x in v.items() if k not in NOISE}
    if isinstance(v, list): return [conv(f, x) for x in v]
    if isinstance(v, float): return float(f'{v:.6g}')
    return v
def comp(f, pid):
    r = recs.get((f, pid))
    if not r or 'data' not in r: return None
    t = r['type']
    if t == 'MonoBehaviour': t = script.get((f, pid), 'MonoBehaviour')
    d = conv(f, r['data'])
    d['type'] = t; d['id'] = key(f, pid)
    return d
def node(f, tpid):
    tr = recs[(f, tpid)]['data']
    gid = tr['m_GameObject']['m_PathID']; g = recs[(f, gid)]['data']
    comps = []
    for cp in g['m_Component']:
        p = cp.get('component', cp)
        if p['m_FileID'] == 0:
            c = comp(f, p['m_PathID'])
            if c and c['type'] not in ('CanvasRenderer', 'GUILayer', 'FlareLayer'): comps.append(c)
    n = {'name': g['m_Name'], 'id': key(f, gid), 'active': bool(g.get('m_IsActive', 1)), 'layer': g.get('m_Layer', 0), 'tag': g.get('m_Tag', 0), 'c': comps}
    n['ch'] = [node(f, ch['m_PathID']) for ch in tr['m_Children']]
    return n
out = {'scenes': {}, 'prefabs': {}, 'materials': {}, 'clips': {}, 'audio': {}, 'fonts': {}, 'controllers': {}, 'objects': {}}
for (f, pid), r in recs.items():
    if r['type'] in ('Transform', 'RectTransform') and 'data' in r and r['data']['m_Father']['m_PathID'] == 0:
        n = node(f, pid)
        if f.startswith('level'): out['scenes'].setdefault(f, []).append(n)
        elif f.startswith('sharedassets') or f in ('globalgamemanagers.assets',) or len(f) == 32: out['prefabs'][n['id']] = n
for (f, pid), r in recs.items():
    t = r['type']; d = r.get('data') or {}
    k = key(f, pid)
    if t == 'Material':
        sp = d['m_SavedProperties']; g = lambda x: (x[0], x[1]) if isinstance(x, list) else (x['first'], x['second'])
        sh = recs.get((f if d['m_Shader']['m_FileID'] == 0 else ext[f][d['m_Shader']['m_FileID'] - 1], d['m_Shader']['m_PathID']))
        shn = ((sh or {}).get('data') or {}).get('m_ParsedForm', {}).get('m_Name') if sh else None
        out['materials'][k] = {'name': d['m_Name'], 'shader': shn or f'builtin:{d["m_Shader"]["m_PathID"]}',
            'tex': {g(x)[0]: conv(f, g(x)[1]['m_Texture']) for x in sp['m_TexEnvs'] if g(x)[1]['m_Texture']['m_PathID']},
            'st': {g(x)[0]: [g(x)[1]['m_Scale']['x'], g(x)[1]['m_Scale']['y'], g(x)[1]['m_Offset']['x'], g(x)[1]['m_Offset']['y']] for x in sp['m_TexEnvs'] if g(x)[1]['m_Texture']['m_PathID']},
            'col': {g(x)[0]: [round(c, 4) for c in g(x)[1].values()] for x in sp['m_Colors']},
            'fl': {g(x)[0]: g(x)[1] for x in sp['m_Floats']}}
    elif t == 'AudioClip': out['audio'][k] = d.get('m_Name')
    elif t == 'AnimationClip': out['clips'][k] = d.get('m_Name')
    elif t == 'Font': out['fonts'][k] = d.get('m_Name')
    elif t == 'AnimatorController': out['controllers'][k] = d.get('m_Name')
    elif t == 'MonoBehaviour' and (f, pid) in script and d.get('m_GameObject', {}).get('m_PathID', 1) == 0:
        c = comp(f, pid); out['objects'][k] = c  # ScriptableObjects (GameData, SkinSetting, ...)
    elif t == 'Mesh': out.setdefault('meshes', {})[k] = d.get('m_Name')
    elif t == 'Shader': out.setdefault('shaders', {})[k] = (d.get('m_ParsedForm') or {}).get('m_Name')
    elif t == 'GameObject' and (f, pid) not in [(0, 0)]:
        out.setdefault('gonames', {})[k] = d.get('m_Name')
s = json.dumps(out, separators=(',', ':'))
open(os.path.join(game, 'data', 'scene.json'), 'w').write(s)
print('scenes', {k: len(v) for k, v in out['scenes'].items()}, 'prefabs', len(out['prefabs']), 'materials', len(out['materials']), 'objects', len(out['objects']), 'bytes', len(s))
