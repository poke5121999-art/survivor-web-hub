# In cây GameObject (gốc -> con) của một bundle kèm RectTransform, Image/sprite và tên script. Dùng: py -3.12 -I tree.py <bundle> [tên gốc]
import sys, UnityPy
sys.stdout.reconfigure(encoding='utf-8')
env = UnityPy.load(sys.argv[1]); want = sys.argv[2] if len(sys.argv) > 2 else None
objs = {o.path_id: o for o in env.objects}
def rd(pid):
    return objs[pid].read_typetree()
sprites = {o.path_id: o.read().m_Name for o in env.objects if o.type.name == 'Sprite'}
def comps(go):
    r = {}
    for c in go['m_Component']:
        pid = c['component']['m_PathID']; o = objs.get(pid)
        if not o: continue
        t = o.type.name
        if t in ('RectTransform', 'Transform'):
            d = o.read_typetree(); r['T'] = d
        elif t == 'MonoBehaviour':
            d = o.read_typetree(); r.setdefault('M', []).append(d)
        else: r.setdefault('O', []).append(t)
    return r
def show(tpid, depth):
    t = rd(tpid); go = rd(t['m_GameObject']['m_PathID']); c = comps(go)
    ex = ''
    if 'm_AnchoredPosition' in t:
        ex = ' a=(%s,%s)-(%s,%s) pos=(%.0f,%.0f) sz=(%.0f,%.0f) sc=%.2f' % (t['m_AnchorMin']['x'], t['m_AnchorMin']['y'], t['m_AnchorMax']['x'], t['m_AnchorMax']['y'], t['m_AnchoredPosition']['x'], t['m_AnchoredPosition']['y'], t['m_SizeDelta']['x'], t['m_SizeDelta']['y'], t['m_LocalScale']['x'])
    else:
        ex = ' lpos=(%.2f,%.2f) sc=(%.2f,%.2f)' % (t['m_LocalPosition']['x'], t['m_LocalPosition']['y'], t['m_LocalScale']['x'], t['m_LocalScale']['y'])
    ms = []
    for m in c.get('M', []):
        sp = m.get('m_Sprite', {}).get('m_PathID') if isinstance(m.get('m_Sprite'), dict) else None
        if sp in sprites: ms.append('spr=' + sprites[sp])
        for k in ('skeletonDataAsset', 'initialSkinName', 'startingAnimation', 'startingLoop', 'timeScale', 'm_Text', 'm_FontSize'):
            if k in m: ms.append('%s=%s' % (k, str(m[k])[:60]))
    print('  ' * depth + go['m_Name'] + ('' if go['m_IsActive'] else ' (OFF)') + ex + ' ' + ' '.join(x for x in c.get('O', []) if x!='CanvasRenderer') + ' ' + ' '.join(ms))
    for ch in t['m_Children']: show(ch['m_PathID'], depth + 1)
roots = []
for o in env.objects:
    if o.type.name in ('Transform', 'RectTransform'):
        t = o.read_typetree()
        if t['m_Father']['m_PathID'] == 0:
            n = rd(t['m_GameObject']['m_PathID'])['m_Name']
            if want is None or n == want: roots.append(o.path_id)
for r in roots:
    print('#### root'); show(r, 0)
