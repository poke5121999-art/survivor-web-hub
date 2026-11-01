"""List ObjectPoolManager prefab lists of level1 with their GameObject names (for --prefabs exports)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mm
env = mm.load()
sa = mm.by_file("sharedassets1.assets")
lvl = mm.by_file("level1")
pool = next(o for o in lvl.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "ObjectPoolManager")
d = mm.read(pool)
def goname(pid):
    o = sa.get(pid)
    return o.peek_name() if o is not None and o.type.name == "GameObject" else (o.type.name if o else "?")
out = {}
for k, v in d.items():
    if isinstance(v, list) and v and isinstance(v[0], dict) and "prefab" in v[0]:
        out[k] = [(e["prefab"]["m_PathID"], goname(e["prefab"]["m_PathID"])) for e in v]
        print(k, out[k])
json.dump(out, open(sys.argv[1], "w"))
