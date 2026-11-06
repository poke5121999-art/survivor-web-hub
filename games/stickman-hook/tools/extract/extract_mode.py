"""Generalised extract_raw.py for any *GamePlayConfig bundle.
Walks the whole config typetree; every PPtr to a prefab (GameObject or one of its components) is replaced by
'prefab:<name>' and the prefab node tree is dumped under 'prefabs'; sprites/other objects become '<Type>:<name>'.
usage: extract_mode.py <bundleFileName> <out.json>"""
import sys, json, math
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *
import extract_raw_lib as R

bundle, out = sys.argv[1], sys.argv[2]
env = load_with_deps(bundle)
cfg = [v for k, v in env.container.items() if k.endswith('GamePlayConfig.asset')][0].deref()
ct = cfg.read_typetree(); sf = cfg.assets_file
prefabs = {}; origin = {}
SKIP_KEYS = {'m_GameObject', 'm_Script'}

def ref(fsf, ptr):
    o = resolve(fsf, ptr)
    if o is None: return None
    tn = o.type.name
    try:
        t = o.read_typetree()
    except Exception:
        return f'{tn}:?'
    if tn == 'GameObject' or (tn in ('MonoBehaviour', 'Transform') and 'm_GameObject' in t and t['m_GameObject']['m_PathID']):
        go = o if tn == 'GameObject' else resolve(o.assets_file, t['m_GameObject'])
        key = f'{go.assets_file.name}:{go.path_id}'
        if key not in origin:
            n = R.node(go); nm = n['name']
            while nm in prefabs and origin.get(key) != nm: nm += '+'
            prefabs[nm] = n; origin[key] = nm
        return 'prefab:' + origin[key]
    return f"{tn}:{t.get('m_Name', '?')}"

def walk(x, fsf):
    if isinstance(x, dict):
        if set(x.keys()) == {'m_FileID', 'm_PathID'}:
            return ref(fsf, x) if x['m_PathID'] else None
        return {k: walk(v, fsf) for k, v in x.items() if k not in SKIP_KEYS}
    if isinstance(x, list): return [walk(v, fsf) for v in x]
    return x

res = {'config': walk(ct, sf), 'prefabs': prefabs}
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(len(prefabs), 'prefabs ->', out)
