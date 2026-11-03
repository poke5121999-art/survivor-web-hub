"""Build data/game.json from the configs and AI graphs of the original APK.

    python3 -I tools/export_data.py <ref dir> <out json>

<ref dir> holds cfg/*.json (TextAssets of bundle f14c0ec0..., XOR 0x40) and graphs/*.json (MicroGraph MonoBehaviours
of bundles 411291... and ec1c69...), see ~/handoff/supermarket-RECON.md. Only numbers are taken; names are generic
English product words. Every block carries "_src" with the table / graph node it came from.
"""
import json, os, re, sys

ref, out = sys.argv[1], sys.argv[2]


def cfg(name):
    return json.load(open(os.path.join(ref, 'cfg', name + '.json'), encoding='utf-8'))['Datas']


lang = {r['id']: (r['en'] or r['zh_cn']).strip() for r in cfg('LanguageConfig')}
items = {r['id']: r for r in cfg('GameItemConfig')}
prod = {r['item_id']: r for r in cfg('ProductItemConfig')}
setting = json.load(open(os.path.join(ref, 'cfg', 'SettingConfig.json'), encoding='utf-8'))
setting = setting.get('Datas', setting)
if isinstance(setting, list):
    setting = setting[0]


def name_of(i):
    g = items.get(i)
    return lang.get(g['name']['key'], g['name']['key']).strip() if g else str(i)


# Shelf layer plane of the white shelf prefab (MultiLayerItemLayout S_JH_01..04 planeSize 0.92 x 0.30 x 0.38 m).
LAYER = (92, 30, 38)


def shelf_cap(p):
    w, h, d = p['shelve_volume']
    n = (LAYER[0] // w) * (LAYER[2] // d)
    if p['shelve_can_stack']:
        n *= max(1, LAYER[1] // h)
    return max(1, n)


products = []
for r in cfg('ShopItemConfig'):
    p = prod.get(r['item_id'])
    if not p or r['shop_id'] not in (101, 301):
        continue
    g = items[r['item_id']]
    products.append({
        'id': r['item_id'], 'shop': r['shop_id'], 'name': name_of(r['item_id']), 'cat': g['sub_type'],
        'cost': p['cost_price'], 'rec': p['recommend_price'], 'min': p['min_price'], 'max': p['limit_price'],
        'shelf': p['type'], 'foot': p['shelve_volume'], 'stack': p['shelve_can_stack'], 'cap': shelf_cap(p),
        'load': r['load_num'], 'delivFirst': r['delivery_first'], 'delivNormal': r['delivery_normal'],
        'license': r['license_id'], 'costDrift': [p['cost_min'], p['cost_max']],
        'marketDrift': [p['market_min'], p['market_max']], 'candy': r['candy'],
    })

furniture = []
for r in cfg('ShopItemConfig'):
    if r['shop_id'] == 102:
        p = prod[r['item_id']]
        furniture.append({'id': r['item_id'], 'name': name_of(r['item_id']), 'price': p['cost_price'],
                          'sub': items[r['item_id']]['sub_type']})

licenses = [{'id': r['id'], 'name': name_of(r['id']), 'kind': 'product' if r['license_type'] == 1 else 'section',
             'price': r['item_cost'][1], 'level': r['shop_level'], 'requires': r['require_id']}
            for r in cfg('LicensesInfoConfig') if r['license_type'] in (1, 2)]

levels = [int(r['pro_exp'][0].split('_')[1]) for r in cfg('ShopExpConfig')]


# ---- customer birth graph: per-day wave schedule -------------------------------------------------------------------
def graph(name):
    t = json.load(open(os.path.join(ref, 'graphs', name + '.json'), encoding='utf-8'))
    return {r['data']['_onlyId']: (r['type']['class'], r['data']) for r in t['references']['RefIds']
            if '_onlyId' in r['data']}


birth = graph('ShopNpcBirth')
NEAR, FAR = 10354, 10355  # EmptyNodes that spawn at CreatePoint_near / CreatePoint_far


def parse_ranges(formula):
    f = formula.replace('\n', ' ').replace('\t', ' ')
    rng = [[int(a), int(b)] for a, b in re.findall(r'(\d+)\s*<\s*\{NpcCount\}\s*<=\s*(\d+)', f)]
    tail = re.findall(r'(\d+)\s*<\s*\{NpcCount\}\s*(?:\|\||,)', f)
    for a in tail:
        if not any(x[0] == int(a) for x in rng):
            rng.append([int(a), 9999])
    return rng


def wave(formula_id):
    cls, fd = birth[formula_id]
    eq = birth[fd['_childs'][0]][1]
    t_eq, t_ne = birth[eq['Equal'][0]][1], birth[eq['NoEqual'][0]][1]
    return {'burst': parse_ranges(fd['formula']),
            'inBurst': t_eq['delayTime'], 'inBurstAt': 'near' if t_eq['_childs'][0] == NEAR else 'far',
            'between': t_ne['delayTime'], 'betweenAt': 'near' if t_ne['_childs'][0] == NEAR else 'far',
            'node': formula_id}


sw = birth[10512][1]
waves = {str(c['value']): wave(c['nodeIds'][0]) for c in sw['conditions']}
waves['default'] = wave(sw['_childs'][0])

data = {
    '_about': 'Numbers from Shop Simulator v1.411 configs/graphs. Money in cents. PLACEHOLDER = not in the data.',
    'settings': {
        'dayStart': setting['MinGameTime'], 'dayEnd': setting['MaxGameTime'], 'timeRate': setting['GameTimeRate'],
        'initialMoney': setting['InitialMoney'], 'initialItem': setting['InitalItem'],
        'expPerCheckout': setting['OnceCashExp'], 'expPerOrder': setting['OnceOrderExp'],
        'giveChange': [[int(a), int(b)] for a, b in (s.split('_') for s in setting['Npc_GiveChange'])],
        'deliverySpeedUpCash': setting['DeliverySpeedUpCash'], 'deliverySpeedUpEnergy': setting['DeliverySpeedUpEnergy'],
        'hireCashierCost': setting['HireCashierCost_Market'], 'hireCashierTime': setting['HireCashierTime'],
        'stockClerk': setting['StockClerkEmployee'][0], 'priceWarOpenDay': setting['PriceWarOpenDay'],
        'fireExtinguishTime': setting['FireExtinguishingTime'], 'maxClean': setting['MaxClean'],
        'garbageEnergy': setting['GarbageCollectionEnergy'], 'shawarmaUnlock': setting['ShawarmaUnlock'],
        'halloweenUnlockLevel': setting['HalloweenShopUnlock'], 'halloweenUnlockNeed': setting['HalloweenShopUnlockNeed'],
        '_src': 'SettingConfig',
    },
    'spawn': {
        'openHour': 6, 'closeHour': 22, 'queueLimit': 8, 'dailyCap': [[7, 30], [9999, 60]], 'waves': waves,
        '_src': 'graph ShopNpcBirth: #10487/#10488 open/close, #10522 queue, #10206 if(Day<=7,30,60), #10512 per-day waves',
    },
    'shopping': {
        # RandomIntNode max is exclusive (UnityEngine.Random.Range(int,int)); ranges stored as [min, max).
        'day1': {'units': [1, 4], 'refuse': [5, 20], '_src': 'graph XUNGOU1 #10022 SL, #10159 vs YiJia #10092'},
        'day2': {'units': [1, 6], 'refuse': [5, 20], '_src': 'graph XUANGOU2 #10111/#10113 (SL<=5), #10123'},
        'day4': {'units': [5, 7], 'unitsLate': [7, 9], 'lateFromDay': 7, 'perProduct': [1, 3], 'refuse': [10, 30],
                 '_src': 'graph MoreShopping #10346 DAY<7, #10347/#10238 SL, #10240 GM, #10362 vs YiJia'},
        'pickTime': [1.0, 1.5], 'walkSpeed': 2.0,
        'patience': 60, 'patience_PLACEHOLDER': 'NpcRunAwayFromLineNode threshold is native code',
        'satisfaction': {r['id']: r['satisfaction'] for r in cfg('NpcSatisfactionConfig')},
        '_src_sat': 'NpcSatisfactionConfig 1 cannot find -1, 2 too expensive -1, 3 short change -3',
        'firstDayPay': ['cash', 'card'],
        '_src_pay': 'graph CheckoutAiGraph #10067 day 1: 1st checkout cash (#10077), 2nd card (#10082), then random',
    },
    'levels': levels, '_src_levels': 'ShopExpConfig pro_exp (treated as cumulative exp, guess)',
    'products': products, 'furniture': furniture, 'licenses': licenses,
    'rent': 0, 'rent_PLACEHOLDER': 'DailyUI.Rent exists, amount is native code',
}
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(data, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('products', len(products), 'licenses', len(licenses), 'levels', len(levels), 'waves', list(waves))
