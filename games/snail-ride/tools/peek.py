"""Compact view of an exported node tree. Usage: peek.py GAME_DIR KEY|scene:level1:Root [maxdepth]"""
import sys, json
S = json.load(open(sys.argv[1] + '/data/scene.json'))
k = sys.argv[2]; md = int(sys.argv[3]) if len(sys.argv) > 3 else 99
if k.startswith('scene:'):
    _, lv, rn = k.split(':'); roots = [r for r in S['scenes'][lv] if r['name'] == rn]
else: roots = [S['prefabs'][k]]
BIG = {'ParticleSystem', 'ParticleSystemRenderer', 'AudioSource', 'Camera', 'MeshRenderer'}
def short(v):
    if isinstance(v, dict):
        if '$' in v: return '$' + v['$']
        return '{' + ','.join(f'{a}:{short(b)}' for a, b in list(v.items())[:6]) + '}'
    if isinstance(v, list): return '[' + ','.join(short(x) for x in v[:8]) + (']' if len(v) <= 8 else '..]')
    if isinstance(v, float): return f'{v:.4g}'
    return str(v)
def show(n, d):
    if d > md: return
    print('  ' * d + f'* {n["name"]} [{n["id"]}]' + ('' if n['active'] else ' (off)') + (f' tag{n["tag"]}' if n['tag'] else ''))
    for c in n['c']:
        t = c['type']
        if t == 'Transform':
            p, r, s = c['m_LocalPosition'], c['m_LocalRotation'], c['m_LocalScale']
            print('  ' * d + f'   T p({p["x"]:.3g},{p["y"]:.3g},{p["z"]:.3g}) r({r["z"]:.3g},{r["w"]:.3g}) s({s["x"]:.3g},{s["y"]:.3g})'); continue
        if t in BIG: print('  ' * d + f'   {t}' + (f' mat {short(c.get("m_Materials"))}' if 'm_Materials' in c else '')); continue
        f = {a: b for a, b in c.items() if a not in ('type', 'id', 'm_Enabled', 'm_Name', 'go')}
        print('  ' * d + f'   {t} ' + ', '.join(f'{a}={short(b)}' for a, b in f.items())[:260])
    for ch in n['ch']: show(ch, d + 1)
for r in roots: show(r, 0)
