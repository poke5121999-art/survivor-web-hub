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


# Shelf layer planes (MultiLayerItemLayout.planeSize, cm): white shelf Shelves_01 S_JH_01..04 92x30x38, yellow
# shelf Shelves_02 S_JH_05..08 90x30x38 (tilted -20 deg, fruit), fridge Binggui_01 BG_JH_04..07 92x30x38.
LAYERS = {302: (92, 30, 38), 303: (92, 30, 38), 305: (90, 30, 38)}


def shelf_cap(p):
    L = LAYERS.get(p['type'], LAYERS[302])
    w, h, d = p['shelve_volume']
    n = (L[0] // w) * (L[2] // d)
    if p['shelve_can_stack']:
        n *= max(1, L[1] // h)
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

# ---- Drop 3: missions, Fund, staff, price drift -------------------------------------------------------------------
def reward_of(rid):
    g = items.get(rid)
    if not g: return None
    fp = json.loads(g['useFeatureParam'] or '{}'); r = {'id': rid}
    for e in fp.get('rewardCustom', []):
        i, n = map(int, e.split('_'))
        if i == 1010001: r['cash'] = r.get('cash', 0) + n
        elif i == 1040001: r['exp'] = r.get('exp', 0) + n
        elif i == 1050001: r['energy'] = r.get('energy', 0) + n
        elif 4030001 <= i <= 4030199: r.setdefault('licenses', []).append(i)
    for e in fp.get('rewardBox', []):
        pool, n = map(int, e.split('_'))
        rows = [x for x in cfg('RandomRewardConfig') if x['pool_id'] == pool]
        shop = {x['id']: x for x in cfg('ShopItemConfig')}
        r.setdefault('boxes', []).append({'pool': [[shop[x['shop_id']]['item_id'], x['weight']] for x in rows], 'n': n})
    return r

tasks = cfg('TaskConfig')
rewards = {}
for t in tasks: rewards[str(t['reward_id'])] = reward_of(t['reward_id'])
fund = [{'id': f['id'], 'level': f['condition'][1], 'reward': f['reward_id']} for f in cfg('FundConfig') if f['condition'][0] == 100001]
for f in fund: rewards[str(f['reward'])] = reward_of(f['reward'])
# Daily tasks that need ads, IAP or systems this remake does not have are left out (see RECON / STATUS).
DAILY_OUT = {200006, 200008, 200010, 200011, 200016, 200017, 200018, 200021, 200022, 200023, 200024, 200025, 200026}
missions = {
    'main': [{'id': t['id'], 'n': i + 1, 'cond': t['task_condition'], 'reward': t['reward_id'], 'next': t['next_task']}
             for i, t in enumerate(x for x in tasks if x['group_id'] == 0)],
    'daily': [{'id': t['id'], 'group': t['group_id'], 'cond': t['task_condition'], 'reward': t['reward_id']}
              for t in tasks if t['group_id'] > 0 and t['task_condition'][0] not in DAILY_OUT
              and not (t['task_condition'][0] == 200015 and t['task_condition'][1] != 1001)],
    'dailyLeftOut': [t['id'] for t in tasks if t['group_id'] > 0 and (t['task_condition'][0] in DAILY_OUT or (t['task_condition'][0] == 200015 and t['task_condition'][1] != 1001))],
    'slotWeights': [setting['Task_0%d_weight' % i] for i in range(1, 6)],
    'text': {k.split('_')[0]: lang[k] for k in lang if re.match(r'^\d{6}_Task$', k)},
    '_src': 'TaskConfig; TaskSystem.StartDailyTask @0xCA0A84 makes 5 daily tasks, slot i weighted by Task_0i_weight over groups 1..3;'
            ' Condition_200007.m_boxCompute @0xF3C0CC matches GameItemConfig.sub_type (furniture), Condition_200004 the shop tab id',
}
data_fund = {'levels': fund, '_src': 'FundConfig 400xx (level track). BattlePassSystem.ProgressChange @0xC57EB0 has no IAP gate; the 500xx ADS track is left out'}
staff = {
    'cashier': {'npc': 1001, 'cost': {'cash': int(setting['SupermarketEmployee'][0].split('_')[1])}, 'time': setting['EmployeTime'],
                'level': setting['HireCashierLevel_Market_High'], 'lazy': 0, 'scanPerItem': 0.5, 'scanPerItem_PLACEHOLDER': 'NpcSwipGoodsNode speed is an animation',
                '_src': 'EmploeeUI.btnBuy_HighHire_Click @0xD00594: SupermarketEmployee[0] 1010001_15000, EmployeTime (0x128) 180 s, CreatANpcEmployer(1001); NpcConfig 1001 npc_parameter 0 = LazyTime'},
    'clerk': {'npc': 1004, 'cost': {'energy': int(setting['StockClerkEmployee'][0].split('_')[1])}, 'time': setting['Deliveryman_01'],
              'level': setting['HireCashierLevel_Deliveryman'], 'putEvery': 0.3, 'walk': [1.3, 1.4],
              '_src': 'EmploeeUI.btnBuy_Other_Click @0xD03478: StockClerkEmployee[0] 1050001_10, Deliveryman_01 (0x160) 120 s, npc 1004; graph HandlingNpc: put 1 good / 0.3 s, walk 1.3-1.4'},
    'extraSlots': 'ads only (SupermarketEmployee[1..] = "ads") - left out',
}
price_war = {'openDay': setting['PriceWarOpenDay'], 'count': [8, 11], 'ownedShare': 0.4, 'nextShare': 0.6,
             '_src': 'ItemSystem.Refresh_Today_PriceData @0xC8A168 (Random.Range(8,11), 0.4 owned licences / 0.6 next licence,'
                     ' skip yesterday), CalculateDiscountData @0xC8B974: cost=floor(round2(R(1-cost_min%,1+cost_max%))*cost_price),'
                     ' market=clamp(floor(round2(R(1-market_min%,1+market_max%))*recommend_price), min_price, limit_price)'}

data = {
    '_about': 'Numbers from Shop Simulator v1.411 configs/graphs/code. Money in cents. PLACEHOLDER = not in the data.',
    'settings': {
        'dayStart': setting['MinGameTime'], 'dayEnd': setting['MaxGameTime'], 'timeRate': setting['GameTimeRate'],
        'initialMoney': setting['InitialMoney'], 'initialItem': setting['InitalItem'],
        'expPerCheckout': setting['OnceCashExp'], 'expPerOrder': setting['OnceOrderExp'],
        'giveChange': [[int(a), int(b)] for a, b in (s.split('_') for s in setting['Npc_GiveChange'])],
        '_src_giveChange': 'NpcTakeoutCashNode.CreateMoney @0xDAB88C: random tier, +Random.Range(a,b) cents, ceil to x100',
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
        'patience': None,
        '_src_patience': 'NpcRunAwayFromLineNode.GetChild @0xDA5944: returns runAway only when FireSystem.IsFiringStatus(),'
                         ' else Line; the line graphs loop with 1 s waits, so customers never leave the queue for waiting',
        'satisfaction': {r['id']: r['satisfaction'] for r in cfg('NpcSatisfactionConfig')},
        '_src_sat': 'NpcSatisfactionConfig 1 cannot find -1, 2 too expensive -1, 3 short change -3',
        'firstDayPay': ['cash', 'card'],
        '_src_pay': 'graph CheckoutAiGraph #10067 day 1: 1st checkout cash (#10077), 2nd card (#10082), then random',
    },
    'levels': levels, '_src_levels': 'ShopExpConfig pro_exp = exp needed for each level (CashDeskSystem.AddShopExp @0xC60E54 subtracts it)',
    'products': products, 'furniture': furniture, 'licenses': licenses,
    'missions': missions, 'rewards': rewards, 'fund': data_fund, 'staff': staff, 'priceWar': price_war,
    'energyItem': 1050001,
    'rent': 0, '_src_rent': 'DailySettleSystem.AddRent @0xC6C0F0, AddSalary @0xC6C124, AddLoan @0xC6C158 have no call'
                           ' sites in libil2cpp (BL/B/BLX scan); set_Rent is only called by the save bridge -> always 0',
}
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(data, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('products', len(products), 'licenses', len(licenses), 'levels', len(levels), 'waves', list(waves))
