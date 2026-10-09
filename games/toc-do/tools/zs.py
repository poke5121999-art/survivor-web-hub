import json, os, UnityPy
HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.environ.get('ZS_REF', os.path.expanduser('~/zingspeed-ref'))
IFS = os.path.join(REF, 'raw/assets/IFS')
_idx = None
def index():
    global _idx
    if _idx is None:
        _idx = [json.loads(l) for l in open(os.path.join(REF, 'index.jsonl'))]
    return _idx
def cab_map():
    m = {}
    for r in index():
        for c in r['cab']:
            m[c.lower()] = r['f']
    return m
def find(sub):
    sub = sub.lower()
    return [r for r in index() if any(sub in c.lower() for c in r['cont'])]
def load_with_deps(paths, depth=3):
    """Load bundles plus the bundles their externals point at (by CAB name)."""
    cm = cab_map()
    env = UnityPy.Environment()
    seen = set()
    todo = [os.path.join(IFS, p) for p in paths]
    for _ in range(depth + 1):
        nxt = []
        for p in todo:
            if p in seen: continue
            seen.add(p)
            env.load_file(p)
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for ext in getattr(sf, 'externals', []):
                    n = os.path.basename(ext.path).lower()
                    if n in cm:
                        q = os.path.join(IFS, cm[n])
                        if q not in seen: nxt.append(q)
        if not nxt: break
        todo = nxt
    return env, len(seen)
