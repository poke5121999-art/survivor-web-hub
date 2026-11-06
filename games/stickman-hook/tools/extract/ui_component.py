"""Print the MonoBehaviour fields of named GameObjects inside a UI prefab bundle.
    py -3 -I comp.py <bundle-prefix> <GameObject name> [script substring]
"""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

pre, goname = sys.argv[1], sys.argv[2]
sub = sys.argv[3] if len(sys.argv) > 3 else ''
b = [f for f in os.listdir(AND) if f.startswith(pre)][0]
env = load_with_deps(b)
for o in env.objects:
    if o.type.name != 'GameObject': continue
    try: g = o.read_typetree()
    except Exception: continue
    if g['m_Name'] != goname: continue
    for c in g['m_Component']:
        co = resolve(o.assets_file, c['component'])
        if co is None: continue
        t = co.read_typetree()
        nm = co.type.name
        if nm == 'MonoBehaviour': nm = script_name(t)
        if sub and sub not in nm: continue
        t = {k: v for k, v in t.items() if k not in ('m_GameObject', 'm_Script', 'm_OnCullStateChanged')}
        print(o.assets_file.name, goname, nm, json.dumps(t, default=str)[:1500])
