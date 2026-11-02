"""Build data/game.json (game tables + tuning from scenes) from data/scene.json. Usage: export_game.py GAME_DIR"""
import sys, os, json
g = sys.argv[1]
S = json.load(open(os.path.join(g, 'data', 'scene.json')))
O = S['objects']
def obj_by_type(t): return [v for v in O.values() if v['type'] == t]
def comps(nodes):
    for n in nodes:
        for c in n['c']: yield n, c
        yield from comps(n['ch'])
gd = obj_by_type('GameData')[0]
skins = []
for r in gd['m_skins']:
    s = O[r['$']]
    skins.append({'id': s['m_id'], 'name': s['m_name'], 'asset': s['m_Name'], 'price': s['m_currencyPrice'], 'availability': s['m_availability'],
                  'rarity': s['m_rarity'], 'alphaTex': (s['m_alphaTex'] or {}).get('$'), 'icon': (s['m_icon'] or {}).get('$'), 'url': s['m_urlAndroid']})
pat = obj_by_type('PatternData')[0]['m_patterns']
env = obj_by_type('EnvironmentData')[0]['m_environments']
adb = obj_by_type('AudioDB')[0]['m_entries']
level1 = S['scenes']['level1']
P = {}
for n, c in comps(level1):
    if c['type'] in ('CurveController', 'GameController', 'ObstacleController', 'CurveCamera', 'CurveRendering') or (c['type'] == 'CurveFollower' and n['name'] == 'Player'):
        P[c['type']] = {k: v for k, v in c.items() if not isinstance(v, (dict, list)) or k in ('m_obstacles', 'm_warmPool')}
out = {
    'priceMinigame': gd['m_priceMinigame'], 'link': gd['m_link'],
    'colors': {'rare': gd['m_colorRare'], 'legendary': gd['m_colorLegendary'], 'special': gd['m_colorSpecial']},
    'hook': {k: (gd[k] or {}).get('$') for k in ('m_hookDouble', 'm_hookDoubleCatch', 'm_hookNormal', 'm_hookCatch', 'm_hookIconDouble', 'm_hookIconNormal')},
    'buttons': {k: (gd[k] or {}).get('$') for k in ('m_button', 'm_buttonLarge', 'm_buttonDisabled', 'm_buttonLargeDisabled')},
    'defaultAlpha': (gd['m_defaultAlpha'] or {}).get('$'),
    'skins': skins, 'missions': gd['m_missions'], 'patterns': pat,
    'environments': [{'top': e['m_backgroundTop'], 'bottom': e['m_backgroundBottom'], 'glow': e['m_glow'], 'curve': e['m_curve']['$'], 'audio': e['m_audio']} for e in env],
    'audioDB': {e['m_key']: S['audio'].get(e['m_clip']['$']) for e in adb if e['m_clip']},
    'params': P,
}
json.dump(out, open(os.path.join(g, 'data', 'game.json'), 'w'), indent=0)
print('skins', len(skins), 'missions', len(gd['m_missions']), 'patterns', len(pat), 'envs', len(env), 'audio keys', len(out['audioDB']))
print(json.dumps(P)[:1500]); print(out['audioDB'])
