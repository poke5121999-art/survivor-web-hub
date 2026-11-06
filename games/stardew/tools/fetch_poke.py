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


# --------------------------------------------------------------- Gen 3 rollback
# PokeAPI serves CURRENT values. This build is FireRed, so every move has to be
# rolled back to what it was in Generation 3, and the API already carries what
# is needed: `past_values[i]` states what a field was in every generation
# BEFORE `version_group`. So the Gen 3 value of a field is the earliest
# past_value entry belonging to gen 4 or later that actually names that field;
# if nothing does, the move never changed and the current value is right.
VG_GEN = {
 'red-blue':1,'yellow':1,
 'gold-silver':2,'crystal':2,
 'ruby-sapphire':3,'emerald':3,'firered-leafgreen':3,'colosseum':3,'xd':3,
 'diamond-pearl':4,'platinum':4,'heartgold-soulsilver':4,
 'black-white':5,'black-2-white-2':5,
 'x-y':6,'omega-ruby-alpha-sapphire':6,
 'sun-moon':7,'ultra-sun-ultra-moon':7,'lets-go-pikachu-lets-go-eevee':7,
 'sword-shield':8,'brilliant-diamond-and-shining-pearl':8,'legends-arceus':8,
 'scarlet-violet':9,
}

def gen3(m, field):
    best_gen, best_val = 99, None
    for pv in m.get('past_values') or []:
        g = VG_GEN.get(pv['version_group']['name'], 99)
        if g < 4:                       # describes gen 1-2 values, not ours
            continue
        v = pv.get(field)
        if v is None:
            continue
        if g < best_gen:
            best_gen, best_val = g, v
    v = best_val if best_val is not None else m.get(field)
    # `type` is an object at both ends; every other field is a plain number.
    if isinstance(v, dict):
        return v.get('name')
    return v

# Generation 6 raised the base stats of a number of Kanto Pokemon. There is no
# API field for a past base stat, so the revisions are listed and reversed.
# id -> {stat index into [hp, atk, def, spa, spd, spe]: the Gen 3 value}
GEN3_BASE = {
 12:{3:80}, 15:{1:80}, 18:{5:91}, 25:{2:30,4:40}, 26:{4:80},
 31:{1:82}, 34:{1:92}, 36:{3:85}, 40:{3:75}, 45:{3:100},
 62:{1:85}, 65:{4:85}, 71:{4:60}, 76:{1:110}, 103:{4:65},
}

# Two moves whose stat_changes themselves changed after Gen 3. past_values does
# not carry stat_changes, so they are named.
GEN3_STATCH = {
 'Growth': [['special-attack', 1]],     # Gen 5 made it raise Attack too
 'Crunch': [['special-defense', -1]],   # Gen 4 switched it from SpD to Def
}

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
    for idx, val in (GEN3_BASE.get(i) or {}).items():
        base[idx] = val
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
    cat = (m['meta']['category']['name'] if m.get('meta') else '') or ''
    tgt = m['target']['name']
    moves[mid] = {
        'id': mid, 'name': nm, 'type': gen3(m, 'type') or m['type']['name'],
        'cls': DC.get(m['damage_class']['name'], 2),
        'power': gen3(m, 'power') or 0, 'acc': gen3(m, 'accuracy') or 0,
        'pp': gen3(m, 'pp') or 5, 'pri': m['priority'],
        'ail': ail if ail != 'none' else None,
        'ailc': (m['meta']['ailment_chance'] if m.get('meta') else 0) or 0,
        'crit': (m['meta']['crit_rate'] if m.get('meta') else 0) or 0,
        'drain': (m['meta']['drain'] if m.get('meta') else 0) or 0,
        'heal': (m['meta']['healing'] if m.get('meta') else 0) or 0,
        'hits': [m['meta']['min_hits'], m['meta']['max_hits']] if (m.get('meta') and m['meta']['min_hits']) else None,
        'flinch': (m['meta']['flinch_chance'] if m.get('meta') else 0) or 0,
        'statch': GEN3_STATCH.get(nm,
                    [[c['stat']['name'], c['change']] for c in m.get('stat_changes', [])]),
        'statch_c': m['meta']['stat_chance'] if m.get('meta') else 0,
        # WHERE a stat change lands. "damage-raise" is PokeAPI's name for a
        # damaging move whose stat changes hit the USER (Superpower drops its
        # own Atk and Def); "damage-lower" hits the target (Crunch, Acid); a
        # pure stat move follows its own target field, except the swagger-likes
        # which always hit the opponent. The engine used to guess from the SIGN
        # of the change, which handed Superpower's drawback to the opponent and
        # Swagger's +2 Attack to the user.
        'selfstat': 1 if (cat == 'damage-raise' or
                          (cat != 'swagger' and tgt in ('user', 'users-field'))) else 0,
        # A power of 0 on a DAMAGING move means the power is not a number:
        # fixed damage, level damage, an OHKO, or something computed. The
        # engine has to be told, or it treats them as status moves that do
        # nothing at all - which is what happened to Night Shade, Seismic Toss,
        # Dragon Rage, Sonic Boom, Super Fang and twelve others.
        'cat': cat,
    }
    print('move', mid, flush=True)

json.dump({'mon': mon, 'moves': moves}, open(os.path.join(CACHE, '_out.json'), 'w', encoding='utf8'), ensure_ascii=False)
print('DONE', len(mon), len(moves))
