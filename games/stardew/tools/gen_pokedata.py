import json, os, sys
src = json.load(open(sys.argv[1], encoding='utf8'))
out = sys.argv[2]

TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison',
         'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel']
TI = {t: i for i, t in enumerate(TYPES)}
# Gen 3 has no Fairy type. PokeAPI reports today's typing, so Clefairy and
# friends come back Fairy; in FireRed they are Normal, which is what the type
# chart in this file is built for. Mapping rather than adding an 18th type
# keeps every damage roll matching the generation the sprites come from.
TI['fairy'] = TI['normal']
VN = ['Thường','Lửa','Nước','Điện','Cỏ','Băng',
      'Giác Đấu','Độc','Đất','Bay','Siêu Linh',
      'Côn Trùng','Đá','Ma','Rồng','Bóng Tối','Thép']
COL = ['#a8a878','#f08030','#6890f0','#f8d030','#78c850','#98d8d8','#c03028','#a040a0',
       '#e0c068','#a890f0','#f85888','#a8b820','#b8a038','#705898','#7038f8','#705848','#b8b8d0']

CHART = {
 'normal':{'rock':.5,'ghost':0,'steel':.5},
 'fire':{'fire':.5,'water':.5,'grass':2,'ice':2,'bug':2,'rock':.5,'dragon':.5,'steel':2},
 'water':{'fire':2,'water':.5,'grass':.5,'ground':2,'rock':2,'dragon':.5},
 'electric':{'water':2,'electric':.5,'grass':.5,'ground':0,'flying':2,'dragon':.5},
 'grass':{'fire':.5,'water':2,'grass':.5,'poison':.5,'ground':2,'flying':.5,'bug':.5,'rock':2,'dragon':.5,'steel':.5},
 'ice':{'fire':.5,'water':.5,'grass':2,'ice':.5,'ground':2,'flying':2,'dragon':2,'steel':.5},
 'fighting':{'normal':2,'ice':2,'poison':.5,'flying':.5,'psychic':.5,'bug':.5,'rock':2,'ghost':0,'dark':2,'steel':2},
 'poison':{'grass':2,'poison':.5,'ground':.5,'rock':.5,'ghost':.5,'steel':0},
 'ground':{'fire':2,'electric':2,'grass':.5,'poison':2,'flying':0,'bug':.5,'rock':2,'steel':2},
 'flying':{'electric':.5,'grass':2,'fighting':2,'bug':2,'rock':.5,'steel':.5},
 'psychic':{'fighting':2,'poison':2,'psychic':.5,'dark':0,'steel':.5},
 'bug':{'fire':.5,'grass':2,'fighting':.5,'poison':.5,'flying':.5,'psychic':2,'ghost':.5,'dark':2,'steel':.5},
 'rock':{'fire':2,'ice':2,'fighting':.5,'ground':.5,'flying':2,'bug':2,'steel':.5},
 'ghost':{'normal':0,'psychic':2,'ghost':2,'dark':.5,'steel':.5},
 'dragon':{'dragon':2,'steel':.5},
 'dark':{'fighting':.5,'psychic':2,'ghost':2,'dark':.5,'steel':.5},
 'steel':{'fire':.5,'water':.5,'electric':.5,'ice':2,'rock':2,'steel':.5},
}
flat = []
for a in TYPES:
    for d in TYPES:
        flat.append(int(CHART.get(a, {}).get(d, 1) * 10))

NAT = [
 ['Hardy',0,0],['Lonely',1,2],['Brave',1,5],['Adamant',1,3],['Naughty',1,4],
 ['Bold',2,1],['Docile',0,0],['Relaxed',2,5],['Impish',2,3],['Lax',2,4],
 ['Timid',5,1],['Hasty',5,2],['Serious',0,0],['Jolly',5,3],['Naive',5,4],
 ['Modest',3,1],['Mild',3,2],['Quiet',3,5],['Bashful',0,0],['Rash',3,4],
 ['Calm',4,1],['Gentle',4,2],['Sassy',4,5],['Careful',4,3],['Quirky',0,0],
]
NATVN = ['Gan Lì','Đơn Độc','Dũng Cảm','Cương Nghị',
 'Nghịch Ngợm','Táo Bạo','Ngoan Ngoãn','Thư Thái','Tinh Quái',
 'Lười Nhác','Nhút Nhát','Hấp Tấp','Nghiêm Túc','Vui Vẻ',
 'Ngây Thơ','Khiêm Tốn','Ôn Hòa','Trầm Lặng','Bẽn Lẽn',
 'Nóng Nảy','Điềm Tĩnh','Dịu Dàng','Xấc Xược',
 'Cẩn Trọng','Kỳ Quặc']

def dedupe(seq):
    out = []
    for v in seq:
        if v not in out: out.append(v)
    return out

mon = {}
for k, m in src['mon'].items():
    i = int(k)
    rec = {
        'n': m['name'],
        't': dedupe([TI[t] for t in m['types']]),
        'b': m['base'],
        'e': m['eff'],
        'c': m['catch'],
        'g': m['genderRate'],
        'gr': m['growth'],
        'x': m['exp'],
        'h': m['happy'],
        'lg': 1 if m['legend'] else 0,
        'ht': m['height'], 'wt': m['weight'],
        'lv': m['learn'],
    }
    if m.get('evo'):
        rec['ev'] = [[e['to'], e.get('lv', 0), e['trigger'], e.get('item', ''), e.get('happy', 0)]
                     for e in m['evo']]
    mon[i] = rec

AIL = {'paralysis':'par','burn':'brn','freeze':'frz','poison':'psn','sleep':'slp',
       'confusion':'cnf','bad-poison':'tox'}
STATK = {'attack':1,'defense':2,'special-attack':3,'special-defense':4,'speed':5,
         'accuracy':6,'evasion':7}
moves = {}
for k, mv in src['moves'].items():
    i = int(k)
    r = {'n': mv['name'], 't': TI.get(mv['type'], 0), 'c': mv['cls'],
         'p': mv['power'], 'a': mv['acc'], 'pp': mv['pp']}
    if mv['pri']: r['pri'] = mv['pri']
    if mv['ail'] and mv['ail'] in AIL:
        r['ail'] = AIL[mv['ail']]; r['ailc'] = mv['ailc'] or 100
    if mv['crit']: r['crit'] = mv['crit']
    if mv['drain']: r['dr'] = mv['drain']
    if mv['heal']: r['hl'] = mv['heal']
    if mv['hits']: r['hits'] = mv['hits']
    if mv['flinch']: r['fl'] = mv['flinch']
    if mv['statch']:
        r['sc'] = [[STATK.get(s[0], 0), s[1]] for s in mv['statch']]
        r['scc'] = mv['statch_c'] or 100
    moves[i] = r

hdr = (
"/* GENERATED - do not edit by hand.  tools/gen_pokedata.py\n"
" *\n"
" * Species and move tables for the 151 Kanto Pokemon, pulled from PokeAPI -\n"
" * the FireRed/LeafGreen level-up learnsets specifically - and flattened into\n"
" * the shortest shape the game can read without a parse step of its own.\n"
" *\n"
" * Keys are short because this file loads on every page open on a phone:\n"
" *   mon:  n name, t types, b base stats, e EV yield, c catch rate,\n"
" *         g gender rate (-1 genderless, else chance-in-8 of female),\n"
" *         gr growth curve, x base exp, h base happiness, lg legendary,\n"
" *         ht/wt height+weight, lv level-up learnset, ev evolutions\n"
" *   move: n name, t type, c class (0 physical 1 special 2 status), p power,\n"
" *         a accuracy, pp, ail status inflicted, sc stat changes\n"
" *\n"
" * Stat order everywhere is [HP, Atk, Def, SpA, SpD, Spe] - Gen 3 order, which\n"
" * every formula in poke.js is written against.\n"
" *\n"
" * `chart` is the Gen 3 type table flattened to a 17x17 array of integers at\n"
" * x10, so an effectiveness lookup is one index and one divide instead of two\n"
" * object walks per hit.  Gen 3 has no Fairy type and Steel still resists\n"
" * Ghost and Dark - both are deliberate, not an omission.\n"
" */\n")
data = {'types': TYPES, 'typeVN': VN, 'typeCol': COL, 'chart': flat,
        'nat': NAT, 'natVN': NATVN, 'mon': mon, 'moves': moves}
with open(out, 'w', encoding='utf8') as f:
    f.write(hdr)
    f.write('window.ISL_POKE_DATA = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('wrote', out, os.path.getsize(out), 'bytes')
