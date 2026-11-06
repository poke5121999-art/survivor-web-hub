"""List scripts and Button/EventTrigger persistent calls in a UI tree. Usage: buttons.py GAME_DIR KEY|scene:lv:Root"""
import sys, json
S = json.load(open(sys.argv[1] + '/data/scene.json'))
k = sys.argv[2]
roots = [r for r in S['scenes'][k.split(':')[1]] if r['name'] == k.split(':')[2]] if k.startswith('scene:') else [S['prefabs'][k]]
ids = {}
def index(n, path):
    ids[n['id']] = (path, 'GameObject')
    for c in n['c']: ids[c['id']] = (path, c['type'])
    for ch in n['ch']: index(ch, path + '/' + ch['name'])
for r in roots: index(r, r['name'])
STD = {'Transform','RectTransform','Image','Text','CanvasRenderer','LayoutElement','HorizontalLayoutGroup','VerticalLayoutGroup','ContentSizeFitter','Animator','Shadow','Outline','CanvasGroup','Mask','Button','AudioClick','GridLayoutGroup','Canvas','CanvasScaler','GraphicRaycaster','SafeArea','RawImage','Animation'}
def walk(n, path):
    for c in n['c']:
        if c['type'] == 'Button':
            calls = c['m_OnClick']['m_PersistentCalls']['m_Calls']
            print(f'{path}: Button -> ' + '; '.join(f"{ids.get((x['m_Target'] or {}).get('$'), ('?', '?'))[1]}@{ids.get((x['m_Target'] or {}).get('$'), ('?',))[0].split('/')[-1]}.{x['m_MethodName']}({x['m_Arguments'].get('m_StringArgument') or x['m_Arguments'].get('m_BoolArgument') or ''})" for x in calls))
        elif c['type'] not in STD:
            print(f'{path}: [{c["type"]}]')
    for ch in n['ch']: walk(ch, path + '/' + ch['name'])
for r in roots: walk(r, r['name'])
