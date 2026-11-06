"""Dump a UI prefab bundle as a tree: GameObject, RectTransform (anchors, pos, size), Image sprite/color, TMP text.
    py -3 -I uitree.py <bundle-prefix> [maxdepth]
"""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

pre = sys.argv[1]
maxd = int(sys.argv[2]) if len(sys.argv) > 2 else 99
b = [f for f in os.listdir(AND) if f.startswith(pre)][0]
env = load_with_deps(b)
roots = []
for k, v in env.container.items():
    if b.split('_')[-2] and k.lower().endswith('.prefab'):
        roots.append((k, v))
print('container', [k for k, _ in roots][:10])

def sprite_name(sf, ptr):
    o = resolve(sf, ptr)
    if not o: return None
    try: return o.read().m_Name
    except Exception: return '?'

def col(c):
    return '#%02x%02x%02x%02x' % tuple(round(c[k] * 255) for k in ('r', 'g', 'b', 'a'))

def walk(go, dep):
    g = go.read_typetree(); tr = None; info = []
    for c in g['m_Component']:
        co = resolve(go.assets_file, c['component'])
        if co is None: continue
        try: ct = co.read_typetree()
        except Exception: info.append(co.type.name + '!'); continue
        nm = co.type.name
        if nm == 'MonoBehaviour': nm = script_name(ct)
        if co.type.name in ('RectTransform', 'Transform'): tr = ct; continue
        if 'm_Sprite' in ct:
            info.append(f"{nm}[{sprite_name(co.assets_file, ct['m_Sprite'])} {col(ct['m_Color'])} type={ct.get('m_Type')}]")
        elif 'm_text' in ct:
            fc = ct.get('m_fontColor') or {}
            info.append(f"{nm}['{ct['m_text'][:60]}' size={ct.get('m_fontSize')} {col(fc) if fc else ''} mat={sprite_name(co.assets_file, ct['m_sharedMaterial']) if 'm_sharedMaterial' in ct else ''}]")
        elif nm in ('CanvasRenderer',):
            continue
        else:
            info.append(nm)
    s = ''
    if tr and 'm_AnchorMin' in tr:
        a0, a1, ap, sd, pv = tr['m_AnchorMin'], tr['m_AnchorMax'], tr['m_AnchoredPosition'], tr['m_SizeDelta'], tr['m_Pivot']
        s = f"a=({a0['x']:.2f},{a0['y']:.2f})-({a1['x']:.2f},{a1['y']:.2f}) p=({ap['x']:.0f},{ap['y']:.0f}) sz=({sd['x']:.0f},{sd['y']:.0f}) pv=({pv['x']:.1f},{pv['y']:.1f})"
    if tr:
        sc = tr['m_LocalScale']
        if abs(sc['x'] - 1) > 1e-3 or abs(sc['y'] - 1) > 1e-3: s += f" sc=({sc['x']:.2f},{sc['y']:.2f})"
    print('  ' * dep + f"{g['m_Name']}{'' if g['m_IsActive'] else ' (off)'} {s} {' '.join(info)}")
    if dep >= maxd or not tr: return
    for ch in tr['m_Children']:
        cto = resolve(go.assets_file, ch)
        if cto is None: continue
        ctt = cto.read_typetree()
        cg = resolve(cto.assets_file, ctt['m_GameObject'])
        if cg: walk(cg, dep + 1)

for k, v in roots:
    o = v.deref() if hasattr(v, 'deref') else v
    print('====', k)
    walk(o, 0)
