# Dump every MonoBehaviour typetree in data.bundle to D:\wos-ref\code\data\<name>.json (PPtrs kept as ids).
import sys, os, json, UnityPy
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import wos
D = wos.D
out = _o.path.join(wos.REF, 'code', 'data')
env = UnityPy.load(os.path.join(D, 'data.bundle'))
n = 0
for o in env.objects:
    if o.type.name != 'MonoBehaviour':
        continue
    tt = o.read_typetree()
    name = (tt.get('m_Name') or str(o.path_id)).replace('/', '_')
    with open(os.path.join(out, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(tt, f, ensure_ascii=False, indent=1, default=str)
    n += 1
print('wrote', n)
