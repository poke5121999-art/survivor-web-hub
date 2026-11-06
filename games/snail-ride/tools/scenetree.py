"""Print GameObject hierarchies with components. Usage: scenetree.py DUMP_DIR FILE [ROOT_GO_PATHID ...]
Without root ids prints all root GameObjects of FILE."""
import sys, json, os
dump = sys.argv[1]; target = sys.argv[2]; roots = [int(x) for x in sys.argv[3:]]
ext = json.load(open(os.path.join(dump, 'externals.json')))
cache = {}
INV = {}
for line in open(os.path.join(os.path.dirname(dump.rstrip('/')), 'inventory.tsv')):
    a = line.rstrip('\n').split('\t')
    if len(a) >= 4 and a[2] == 'MonoBehaviour' and '<' in a[3]:
        INV[(a[0], int(a[1]))] = a[3].split('<')[-1].rstrip('>')
def load(f):
    if f not in cache:
        p = os.path.join(dump, 'json', f + '.json')
        cache[f] = {r['path_id']: r for r in json.load(open(p))} if os.path.exists(p) else {}
    return cache[f]
def resolve(f, ptr):
    fid, pid = ptr.get('m_FileID', 0), ptr.get('m_PathID', 0)
    if pid == 0: return None
    tf = f if fid == 0 else ext[f][fid - 1]
    return tf, pid
def get(f, ptr):
    r = resolve(f, ptr)
    if not r: return None
    o = load(r[0]).get(r[1])
    return (r[0], o) if o else (r[0], None)
SKIP = {'m_GameObject', 'm_Enabled', 'm_Script', 'm_Name', 'm_EditorHideFlags', 'm_EditorClassIdentifier', 'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset'}
def brief(f, v, depth=0):
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            r = get(f, v)
            if not r: return 'null'
            tf, o = r
            if not o: return f'<{tf}:{v["m_PathID"]} ?>'
            nm = (o.get('data') or {}).get('m_Name', '') if isinstance(o.get('data'), dict) else ''
            if o['type'] in ('Transform', 'RectTransform', 'MonoBehaviour') and not nm:
                go = get(tf, o['data']['m_GameObject']) if o.get('data') else None
                nm = 'go:' + (go[1]['data']['m_Name'] if go and go[1] else '?')
            sc = ''
            if o['type'] == 'MonoBehaviour':
                sc = ':' + INV.get((tf, v['m_PathID']), '')
            return f'<{o["type"]}{sc} {nm} @{tf if len(tf)!=32 else tf[:8]}:{v["m_PathID"]}>'
        if depth > 2: return '{...}'
        return '{' + ', '.join(f'{k}: {brief(f, x, depth+1)}' for k, x in v.items() if k not in SKIP) + '}'
    if isinstance(v, list):
        if len(v) > 12: return '[' + ', '.join(brief(f, x, depth+1) for x in v[:12]) + f', ... ({len(v)})]'
        return '[' + ', '.join(brief(f, x, depth+1) for x in v) + ']'
    if isinstance(v, float): return f'{v:.4g}'
    return repr(v) if isinstance(v, str) else str(v)
def comp_line(f, c):
    t = c['type']; d = c.get('data') or {}
    if t in ('Transform', 'RectTransform'):
        p = d.get('m_LocalPosition', {}); s = d.get('m_LocalScale', {}); q = d.get('m_LocalRotation', {})
        out = f'pos({p.get("x",0):.3g},{p.get("y",0):.3g},{p.get("z",0):.3g}) rot({q.get("x",0):.3g},{q.get("y",0):.3g},{q.get("z",0):.3g},{q.get("w",1):.3g}) scale({s.get("x",1):.3g},{s.get("y",1):.3g},{s.get("z",1):.3g})'
        if t == 'RectTransform':
            out += f' anchor({d["m_AnchorMin"]["x"]:.3g},{d["m_AnchorMin"]["y"]:.3g})-({d["m_AnchorMax"]["x"]:.3g},{d["m_AnchorMax"]["y"]:.3g}) apos({d["m_AnchoredPosition"]["x"]:.4g},{d["m_AnchoredPosition"]["y"]:.4g}) size({d["m_SizeDelta"]["x"]:.4g},{d["m_SizeDelta"]["y"]:.4g}) pivot({d["m_Pivot"]["x"]:.3g},{d["m_Pivot"]["y"]:.3g})'
        return out
    if t in ('SpriteRenderer','MeshRenderer','ParticleSystemRenderer','LineRenderer','TrailRenderer'):
        keep = {k: d[k] for k in ('m_Materials','m_Sprite','m_Color','m_SortingOrder','m_SortingLayerID','m_DrawMode','m_Size','m_FlipX','m_FlipY','m_Enabled') if k in d}
        if 'm_Enabled' in d: keep['en'] = d['m_Enabled']
        return t + ' ' + brief(f, keep)
    if t == 'ParticleSystem':
        return 'ParticleSystem (len %s loop %s)' % (d.get('lengthInSec'), d.get('looping'))
    if t == 'AudioSource':
        return 'AudioSource ' + brief(f, {k: d[k] for k in ('m_audioClip','m_Volume','Loop','m_PlayOnAwake') if k in d})
    if t == 'Camera':
        return 'Camera ' + brief(f, {k: d[k] for k in ('m_ClearFlags','m_BackGroundColor','orthographic size','m_Depth','m_CullingMask') if k in d})
    sc = None
    if t == 'MonoBehaviour':
        sc = INV.get((f, c['path_id']))
    name = t + (':' + sc if sc else '')
    fields = {k: v for k, v in d.items() if k not in SKIP}
    return name + ' ' + brief(f, fields)
def walk(f, tr_pid, ind):
    tr = load(f)[tr_pid]; d = tr['data']
    go = load(f)[d['m_GameObject']['m_PathID']]
    gd = go['data']
    print('  ' * ind + f'* {gd["m_Name"]} [go {go["path_id"]}]' + ('' if gd.get('m_IsActive', 1) else ' (inactive)') + f' layer={gd.get("m_Layer")} tag={gd.get("m_Tag")}')
    for cp in gd['m_Component']:
        ptr = cp.get('component', cp)
        r = get(f, ptr)
        if r and r[1]:
            print('  ' * ind + '    - ' + comp_line(r[0], r[1]))
    for ch in d['m_Children']:
        walk(f, ch['m_PathID'], ind + 1)
objs = load(target)
if roots:
    for gid in roots:
        g = objs[gid]['data']
        for cp in g['m_Component']:
            c = objs.get(cp.get('component', cp)['m_PathID'])
            if c and c['type'] in ('Transform', 'RectTransform'):
                walk(target, c['path_id'], 0)
else:
    for pid, o in objs.items():
        if o['type'] in ('Transform', 'RectTransform') and o.get('data') and o['data']['m_Father']['m_PathID'] == 0:
            walk(target, pid, 0)
