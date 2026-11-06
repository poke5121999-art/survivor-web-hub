"""Like ui_tree.py, but prints every root GameObject of the bundle's own files, not only the container prefabs. Runtime
prefabs that a page instantiates (CardItemUI, CardsCategoryUI, BoosterCardItemUI, ...) live there without a container path.
    py -3 -I ui_roots.py <bundle-prefix> [name-substring]
"""
import sys, os
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
sys.argv = [sys.argv[0], sys.argv[1], '99'] + sys.argv[2:]
want = sys.argv[3] if len(sys.argv) > 3 else ''
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui_tree.py'), encoding='utf-8').read()
src = src.split('for k, v in roots:')[0]  # helpers + env of ui_tree.py, without its container walk
exec(compile(src, 'ui_tree.py', 'exec'))
own = [f for f in os.listdir(AND) if f.startswith(sys.argv[1])][0]
for sf in sfs(env):
    for pid, o in sf.objects.items():
        if o.type.name not in ('RectTransform', 'Transform'):
            continue
        t = o.read_typetree()
        if t['m_Father']['m_PathID'] != 0:
            continue
        g = resolve(o.assets_file, t['m_GameObject'])
        if g is None:
            continue
        name = g.read_typetree()['m_Name']
        if want and want.lower() not in name.lower():
            continue
        print('==== root', name, sf.name)
        walk(g, 0)
