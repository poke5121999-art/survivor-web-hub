"""Dump the finish confetti prefab (PlayerController.confettisPrefab = ConfettisLeft) of a gameplay config bundle as JSON:
    py -3 -I dump_confetti.py [bundle-prefix] [out.json]
Default bundle: grapplegameplayconfig (the Normal config has no player; every mode points at the same prefab).
Read the modules with show_ps.py. The numbers are ported in js/main.js (CONF)."""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

pre = sys.argv[1] if len(sys.argv) > 1 else 'defaultlocalgroup_assets_stickmanhook_gamemodes_grapplegameplayconfig'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'confetti_dump.json'
b = [f for f in os.listdir(AND) if f.startswith(pre)][0]
env = load_with_deps(b)
target = None
for sf in sfs(env):
    for pid, o in sf.objects.items():
        if o.type.name != 'MonoBehaviour': continue
        try: t = o.read_typetree()
        except Exception: continue
        if 'confettisPrefab' in t:
            target = (sf, t['confettisPrefab']); print('PlayerController in', sf.name, 'ptr', t['confettisPrefab'])
            break
    if target: break
sf, ptr = target
go = resolve(sf, ptr)
print('prefab', go.type.name, go.read().m_Name, go.assets_file.name)
dump = {}
def walk(go, path):
    g = go.read_typetree()
    name = path + '/' + g['m_Name']
    comps = {}
    tr = None
    for c in g['m_Component']:
        co = resolve(go.assets_file, c['component'])
        if co is None: continue
        try: ct = co.read_typetree()
        except Exception as e: comps[co.type.name] = 'ERR ' + str(e); continue
        if co.type.name in ('Transform', 'RectTransform'): tr = ct
        if co.type.name == 'ParticleSystemRenderer':
            for k in ('m_Materials',):
                mats = []
                for m in ct.get(k, []):
                    mo = resolve(co.assets_file, m)
                    if mo:
                        mt = mo.read_typetree()
                        texs = {}
                        for tk, tv in mt.get('m_SavedProperties', {}).get('m_TexEnvs', []):
                            to = resolve(mo.assets_file, tv['m_Texture'])
                            if to: texs[tk] = to.read().m_Name
                        mats.append({'name': mt['m_Name'], 'tex': texs, 'colors': mt.get('m_SavedProperties', {}).get('m_Colors')})
                ct['_mats'] = mats
        comps[co.type.name] = ct
    dump[name] = comps
    print(name, list(comps))
    if tr:
        for ch in tr['m_Children']:
            cto = resolve(go.assets_file, ch)
            if cto is None: continue
            cg = resolve(cto.assets_file, cto.read_typetree()['m_GameObject'])
            if cg: walk(cg, name)
walk(go, '')
def clean(x):
    if isinstance(x, dict): return {k: clean(v) for k, v in x.items()}
    if isinstance(x, list): return [clean(v) for v in x]
    if isinstance(x, (bytes, bytearray)): return '<bytes %d>' % len(x)
    return x
json.dump(clean(dump), open(OUT, 'w', encoding='utf-8'), indent=1, default=str)
print('wrote', OUT)
