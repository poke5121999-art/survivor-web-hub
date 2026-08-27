# Pull Gen-1 (Kanto 151) species + move data from PokeAPI into one compact JSON.
import json, os, sys, urllib.request, time
CACHE = sys.argv[1]
os.makedirs(CACHE, exist_ok=True)

def get(url):
    key = url.replace('https://pokeapi.co/api/v2/','').strip('/').replace('/','_')+'.json'
    p = os.path.join(CACHE, key)
    if os.path.exists(p):
        return json.load(open(p, encoding='utf8'))
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (harvest-isles asset build)'})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode('utf8'))
            json.dump(d, open(p,'w',encoding='utf8'))
            return d
        except Exception as e:
            if attempt == 3: raise
            time.sleep(1.5*(attempt+1))

STAT = {'hp':0,'attack':1,'defense':2,'special-attack':3,'special-defense':4,'speed':5}
GROWTH = {'slow':0,'medium':1,'fast':2,'medium-slow':3,'slow-then-very-fast':4,'fast-then-very-slow':5}

mon = {}
moveids = set()
for i in range(1, 152):
    p = get('https://pokeapi.co/api/v2/pokemon/%d/' % i)
    s = get('https://pokeapi.co/api/v2/pokemon-species/%d/' % i)
    base = [0]*6; eff = [0]*6
    for st in p['stats']:
        k = STAT[st['stat']['name']]
        base[k] = st['base_stat']; eff[k] = st['effort']
    # level-up learnset for firered-leafgreen, fall back to red-blue
    learn = {}
    for m in p['moves']:
        mid = int(m['move']['url'].rstrip('/').split('/')[-1])
        best = None
        for d in m['version_group_details']:
            if d['move_learn_method']['name'] != 'level-up': continue
            vg = d['version_group']['name']
            if vg not in ('firered-leafgreen','red-blue','yellow'): continue
            rank = {'firered-leafgreen':0,'yellow':1,'red-blue':2}[vg]
            lv = d['level_learned_at']
            if best is None or rank < best[0]: best = (rank, lv)
        if best: learn[mid] = best[1]; moveids.add(mid)
    lu = sorted(([lv, mid] for mid, lv in learn.items()), key=lambda r: (r[0], r[1]))
    vi = None
    for n in s['names']:
        if n['language']['name'] == 'en': vi = n['name']
    mon[i] = {
        'id': i, 'name': vi or p['name'],
        'types': [t['type']['name'] for t in sorted(p['types'], key=lambda t: t['slot'])],
        'base': base, 'eff': eff,
        'catch': s['capture_rate'],
        'genderRate': s['gender_rate'],          # -1 genderless, else female/8
        'growth': GROWTH.get(s['growth_rate']['name'], 1),
        'exp': p['base_experience'],
        'happy': s['base_happiness'],
        'legend': bool(s['is_legendary'] or s['is_mythical']),
        'height': p['height'], 'weight': p['weight'],
        'learn': lu,
    }
    # evolution
    print('mon', i, flush=True)

# evolution chains
chains = set()
for i in range(1, 152):
    s = get('https://pokeapi.co/api/v2/pokemon-species/%d/' % i)
    chains.add(s['evolution_chain']['url'])
def walk(node, out):
    src = int(node['species']['url'].rstrip('/').split('/')[-1])
    for ev in node['evolves_to']:
        dst = int(ev['species']['url'].rstrip('/').split('/')[-1])
        for d in ev['evolution_details']:
            rec = {'to': dst, 'trigger': d['trigger']['name']}
            if d['min_level']: rec['lv'] = d['min_level']
            if d['item']: rec['item'] = d['item']['name']
            if d['min_happiness']: rec['happy'] = d['min_happiness']
            out.setdefault(src, []).append(rec)
            break
        walk(ev, out)
evo = {}
for c in chains:
    walk(get(c)['chain'], evo)
for k, v in evo.items():
    if k in mon: mon[k]['evo'] = v

moves = {}
DC = {'physical':0,'special':1,'status':2}
for mid in sorted(moveids):
    m = get('https://pokeapi.co/api/v2/move/%d/' % mid)
    nm = m['name']
    for n in m['names']:
        if n['language']['name'] == 'en': nm = n['name']
    ail = m['meta']['ailment']['name'] if m.get('meta') else 'none'
    moves[mid] = {
        'id': mid, 'name': nm, 'type': m['type']['name'],
        'cls': DC.get(m['damage_class']['name'], 2),
        'power': m['power'] or 0, 'acc': m['accuracy'] or 0,
        'pp': m['pp'] or 5, 'pri': m['priority'],
        'ail': ail if ail != 'none' else None,
        'ailc': (m['meta']['ailment_chance'] if m.get('meta') else 0) or 0,
        'crit': (m['meta']['crit_rate'] if m.get('meta') else 0) or 0,
        'drain': (m['meta']['drain'] if m.get('meta') else 0) or 0,
        'heal': (m['meta']['healing'] if m.get('meta') else 0) or 0,
        'hits': [m['meta']['min_hits'], m['meta']['max_hits']] if (m.get('meta') and m['meta']['min_hits']) else None,
        'flinch': (m['meta']['flinch_chance'] if m.get('meta') else 0) or 0,
        'statch': [[c['stat']['name'], c['change']] for c in m.get('stat_changes', [])],
        'statch_c': m['meta']['stat_chance'] if m.get('meta') else 0,
    }
    print('move', mid, flush=True)

json.dump({'mon': mon, 'moves': moves}, open(os.path.join(CACHE, '_out.json'), 'w', encoding='utf8'), ensure_ascii=False)
print('DONE', len(mon), len(moves))
