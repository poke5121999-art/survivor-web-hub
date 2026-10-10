# -*- coding: utf-8 -*-
"""Thú cưỡi + lính thuê của Soul Knight 8.6 -> data/sk-mounts.js, data/sk-mercs.js.

Chạy (không cần bundle; prefabs.json do dump_prefabs.py chụp từ bundle gốc):
    PYTHONIOENCODING=utf-8 python3 games/soulknight/tools/mounts/build_mounts.py
Nguồn: [PF] prefabs.json; [CFG] $SK86/decoded/config/{random_objects,npc}.json (trọng số, điều kiện); [LOC] localization_en_vi.json;
[WIKI] bảng tay ở dưới (tên khi LOC không có khoá, vũ khí mặc định / loại dùng được của lính thuê). Không có nhãn = suy ra.
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
REF = os.environ.get('SK86') or os.path.expanduser('~/sk86-ref')
LOC = json.load(io.open(os.path.join(REF, 'decoded', 'localization_en_vi.json'), encoding='utf-8'))
CFG = os.path.join(REF, 'decoded', 'config')
PF = json.load(io.open(os.path.join(HERE, 'prefabs.json'), encoding='utf-8'))


def rnd(v, n=3):
    return None if v is None else round(v, n)


def loc(key):
    v = LOC.get(key)
    return {'en': v[0], 'vi': v[1]} if v and v[0] else None


def random_objects(name):
    d = json.load(io.open(os.path.join(CFG, 'random_objects.json'), encoding='utf-8'))
    return json.loads(d[name]['Data'])['Objects']


def seller(name):
    d = json.load(io.open(os.path.join(CFG, 'npc.json'), encoding='utf-8'))
    return json.loads(d[name]['Data'])['Mounts']


# ---------------------------------------------------------------- thú cưỡi
# Tên khi LOC không có khoá [WIKI Mounts]; vi để trống thì giao diện dùng en.
NAME_FALLBACK = {
    'mhorse': ('White Dragon Horse', 'Ngựa Bạch Long'), 'micemonkey': ('Gentle Snow Ape', 'Khỉ Tuyết'),
    'mdungbeetle': ('Stubborn Dung Beetle', 'Bọ Hung Cứng Đầu'), 'm_morph': ('Bazinga', 'Bazinga'),
    'mcristal_gold': ('Crystal Beetle (gold)', 'Sâu Pha Lê Vàng'), 'm_mech_coin': ('Coin Armor', 'Giáp Xu'),
    'm_mech_engineer': ('Engineer Mech', 'Cơ Giáp Kỹ Sư'), 'mbear': ('Fuzzy Bear', 'Gấu Khổng Lồ'),
    'mcloud': ('Speedy Cloud', 'Mây Cấp Tốc'), 'msword': ('Saint Sword', 'Thánh Kiếm'), 'mtao_sword': ('Taoist Sword', 'Kiếm Thầy Đạo'),
    'm_mech_7': ('Floating 51', 'Đĩa Nổi 51'),
}
LOC_KEY = {'m_mecha_normal_b': 'm_mecha_normal_b', 'm_mecha_normal_d': 'm_mecha_normal_d', 'm_mecha_normal_e': 'm_mecha_normal_e',
           'm_mecha_normal_2s': 'm_mecha_normal_2s'}
KIND = {'mboar': 'creature', 'mboar2': 'creature', 'mcristal': 'creature', 'mcristal_gold': 'creature', 'mspider': 'creature',
        'mvaken': 'creature', 'mhorse': 'creature', 'micemonkey': 'creature', 'mdungbeetle': 'creature', 'm_morph': 'creature',
        'mbear': 'summon', 'mcloud': 'special', 'msword': 'special', 'mtao_sword': 'special'}
WEAPON_LOC = {'mboar2': 'weapon/mboard2', 'mcristal': 'weapon/mcrystal', 'mspider': 'weapon/mspider', 'mvaken': 'weapon/mvaken',
              'm_mech_0': 'weapon/m_mech_0_1', 'm_mech_1': 'weapon/mech_1_1', 'm_mech_2': 'weapon/mech_2_1', 'm_mech_3': 'weapon/mech_3_1'}
PREFAB_OF = {'mboar': 'Mount/Boar/mboar.prefab', 'mboar2': 'Mount/Boar2/mboar2.prefab', 'mcristal': 'Mount/Mcristal/mcristal.prefab',
             'mcristal_gold': 'Mount/McristalGold/mcristal_gold.prefab', 'mspider': 'Mount/Spider/mspider.prefab',
             'mvaken': 'Mount/Varkolyn/mvaken.prefab', 'mbear': 'Mount/Bear/mbear.prefab'}


ORDER = ['mboar', 'mboar2', 'mcristal', 'mcristal_gold', 'mspider', 'mvaken', 'mhorse', 'micemonkey', 'mdungbeetle', 'm_morph'] + \
    ['m_mech_%d' % i for i in range(8)] + ['m_mecha_normal_b', 'm_mecha_normal_d', 'm_mecha_normal_e', 'm_mecha_normal_2s', 'm_mech_9',
                                          'm_mech_coin', 'm_mech_engineer', 'mcloud', 'msword', 'mtao_sword', 'mbear']


def build_mounts():
    cre = {}
    for o in seller('npc_mount_creature'):
        g = o['data']['gameObject'].split('/')[-1].replace('.prefab', '')
        cre[{'mIceMonkey': 'micemonkey', 'mDungBeetle': 'mdungbeetle'}.get(g, g)] = (o['data']['weight'], o['data']['conditions'])
    mech = {}
    for o in seller('npc_mount_mech'):
        g = o['data']['gameObject'].split('/')[-1].replace('.prefab', '')
        mech[g] = (o['data']['weight'], o['data']['conditions'])
    sell_w = {}
    for o in random_objects('mount_seller'):
        sell_w[o['data']['gameObject'].split('/')[-1].replace('.prefab', '')] = o['data']['weight']
    cage = {}
    for o in random_objects('cage_mount'):
        g = o['data']['gameObject'].split('/')[-1].replace('.prefab', '')
        cage[g] = o['data']['weight']
    mounts, order = {}, []
    for mid, p in PF.items():
        if mid.startswith('npc_'):
            continue
        kind = KIND.get(mid, 'mech')
        nm = loc(LOC_KEY.get(mid, mid)) or loc(mid)
        if not nm or not nm['en']:
            f = NAME_FALLBACK.get(mid)
            nm = {'en': f[0], 'vi': f[1], 'src': 'wiki'} if f else {'en': mid, 'vi': mid, 'src': 'none'}
        w = None
        ws = [x for x in p['weapons'] if x.get('damage')]
        if ws:
            w0 = ws[0]
            wl = loc(WEAPON_LOC[mid]) if mid in WEAPON_LOC else None
            w = {'name': (wl or {}).get('vi'), 'damage': w0['damage'], 'consume': w0.get('consume', 0), 'crit': w0.get('critic', 0)}
            if mid in ('m_mech_0', 'm_mech_engineer'):
                big = [x for x in p['weapons'] if x['name'] == 'm_mech_0_2'][0]
                w['blast'] = big['damage']          # Tạm Biệt Thế Giới
        cond = None
        shop = None
        if mid in cre:
            shop = 'creature'; cond = cre[mid]
        elif mid in mech:
            shop = 'mech'; cond = mech[mid]
        sellInfo = None
        if shop:
            unlock = [c['key'] for c in cond[1] if c.get('type') == 8]
            minLv = [c['num'] for c in cond[1] if c.get('type') == 0]
            sellInfo = {'shop': shop, 'weight': cond[0], 'unlock': unlock[0] if unlock else None, 'minLevel': minLv[0] if minLv else None}
        m = {'id': mid, 'kind': kind, 'en': nm['en'], 'vi': nm['vi'], 'hp': p.get('hp', 0), 'def': p.get('defence', 0),
             'speedRate': rnd(p.get('speedRate', 0)), 'itemValue': p.get('itemValue'),
             'weapon': w, 'bodyDamage': p.get('collider_damage'), 'sell': sellInfo, 'cage': cage.get(mid), 'prefab': PREFAB_OF.get(mid)}
        if nm.get('src'):
            m['nameSrc'] = nm['src']
        mounts[mid] = m
    order = [k for k in ORDER if k in mounts]
    return {'order': order, 'mounts': mounts, 'sellerWeight': sell_w, 'cageWeight': cage,
            'sellers': {'creature': [k for k in order if mounts[k]['sell'] and mounts[k]['sell']['shop'] == 'creature'],
                        'mech': [k for k in order if mounts[k]['sell'] and mounts[k]['sell']['shop'] == 'mech']},
            'rules': {'mechHalfRegen': True, 'priceMin': {'creature': 15, 'mech': 30}}}


# ---------------------------------------------------------------- lính thuê
# [WIKI Followers] vũ khí mặc định + loại vũ khí dùng được; tên en/vi từ [LOC npc/npc_NN].
MERC_WIKI = {
    'npc_01': ('Royal Knight\'s Short Sword', ['sword', 'spear']), 'npc_02': ('Machine Gun', ['pistol', 'rifle']),
    'npc_03': ('Shotgun', ['shotgun', 'launcher']), 'npc_04': ('Magic Staff', ['bow', 'spear', 'staff']),
    'npc_05': ('Raw Axe', ['axe', 'sword', 'hammer']), 'npc_06': ('Monster Cuisine', ['thrown', 'railgun']),
    'npc_07': ('Crowbar', ['laser']), 'npc_08': ('Retro Spear', ['spear', 'sword', 'bow']), 'npc_09': ('Worn Bazooka', ['launcher']),
    'npc_10': ('Ion Railgun', ['railgun', 'laser']), 'npc_11': ('Hope', ['staff']), 'npc_12': ('Pharaoh\'s Blade', ['red']),
    'npc_13': (None, ['any']),
}
SPECIAL_PRICE = {'npc_07': 'none', 'npc_10': 'half_gold', 'npc_12': 'maxhp'}


def build_mercs():
    rnd_w = {o['data']['gameObject'].split('/')[-1].replace('.prefab', ''): o['data']['weight'] for o in random_objects('random_mercenary')}
    art_w = {o['data']['gameObject'].split('/')[-1].replace('.prefab', ''): o['data']['weight'] for o in random_objects('random_mercenary_artifact_mode')}
    cage_w = {o['data']['gameObject'].split('/')[-1].replace('.prefab', ''): o['data']['weight'] for o in random_objects('cage_mercenary')}
    mercs, order = {}, []
    for i in range(1, 14):
        k = 'npc_%02d' % i
        p = PF[k]
        nm = loc('npc/' + k)
        wk = p['weapons'][0] if p['weapons'] else None
        wiki = MERC_WIKI[k]
        mercs[k] = {
            'id': k, 'en': nm['en'], 'vi': nm['vi'], 'hp': p['hp'], 'speed': p['speed'], 'crit': p['critical'], 'atkCd': rnd(p['atk_cd']),
            'price': p['talk_item_value'], 'priceKind': SPECIAL_PRICE.get(k, 'gold'),
            'damage': wk['damage'] if wk else 0, 'weaponName': wiki[0], 'weaponKinds': wiki[1],
            'minFollow': p['min_follow_distance'], 'maxFollow': p['max_follow_distance'],
            'weight': {'random': rnd_w.get(k, 0), 'artifact': art_w.get(k, 0), 'cage': cage_w.get(k, 0)},
            'prefab': k,
        }
        order.append(k)
    mad = PF['npc_07_mad']
    mercs['npc_07']['mad'] = {'hp': mad['hp'], 'damage': mad['weapons'][0]['damage'], 'weight': {'random': rnd_w.get('npc_07_mad', 0), 'cage': cage_w.get('npc_07_mad', 0)}}
    return {'order': order, 'mercs': mercs,
            'rules': {'talk': {'ask': loc('mercenary1_question')['vi'], 'accept': loc('mercenary1_accept')['vi'], 'refuse': loc('mercenary1_rejection')['vi']},
                      'priceFloor': {'from': 15, 'to': 30}, 'maxAtOnce': 1, 'specialRoomWeight': 75, 'mountRoomWeight': 40}}


def write(name, var, data, src):
    path = os.path.join(GAME, 'data', name)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/mounts/build_mounts.py (%s) — không sửa tay.\n' % src)
        f.write('window.%s = %s;\n' % (var, json.dumps(data, ensure_ascii=False, separators=(',', ':'))))
    print(path, os.path.getsize(path))


def main():
    m = build_mounts()
    c = build_mercs()
    write('sk-mounts.js', 'SK_MOUNTS', m, 'prefabs.json + config + LOC')
    write('sk-mercs.js', 'SK_MERCS', c, 'prefabs.json + config + LOC + wiki')
    print('mounts', len(m['order']), 'creature seller', len(m['sellers']['creature']), 'mech seller', len(m['sellers']['mech']))
    print('mercs', len(c['order']), 'hp sum', sum(c['mercs'][k]['hp'] for k in c['order']))
    print('mech hp', [m['mounts']['m_mech_%d' % i]['hp'] for i in range(8)])


main()
