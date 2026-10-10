# -*- coding: utf-8 -*-
"""Vườn (sảnh bước 6) -> data/sk-garden.js (SK_GARDEN). Chạy từ gốc repo, sau tools/build_sk.py (cần prefab plant_* trong sk-data.js):

    python3 games/soulknight/tools/garden/build_garden.py

Ghép: luật prefab gốc (tools/garden/plants_prefab.json, do dump_plants.py đọc từ common.ab) + mbs Plant* trong data/sk-data.js
(vũ khí, vật liệu, buff, thú cưng của từng cây) + wiki cộng đồng (tools/wiki/plants.json: độ hiếm, giá, ngày) + tên Việt
(~/sk86-ref/decoded/localization_en_vi.json, data/sk-items.js, data/sk-buffs86.js, data/sk-weapons86.js) + giá hạt gốc
(~/sk86-ref/decoded/plant_config.json). Nguồn nào không có thì ghi rõ ở trường `src`.

SK_GARDEN = {plants: {<khoá hạt>: {plant, vi, en, rarity, days, fast, harvest, ptype, ptypeVi, mature, max, restart, stages[], product{}, price, src}},
             plots: [{kind: 'free'|'gems'|'money'|'achievement', ...}] (8 ô, theo thứ tự mở)}
product.kind: material {key, n} | gems {n} | randMat {keys} | weapon {key, up?} | buff {id, name} | buffRand | buffPick {ids} | slot | drink {hp, energy}
              | item (Bí Đỏ: vật phẩm ngẫu nhiên) | pet {pet?, sprite, nested?}
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
REF = os.environ.get('SK86') or os.path.expanduser('~/sk86-ref')


def jsvar(path, name):
    s = io.open(path, encoding='utf-8').read()
    m = re.search(r'window\.' + name + r'\s*=\s*', s)
    j = s.index('\n', m.end())
    return json.loads(s[m.end():j].rstrip().rstrip(';'))


def strip_tags(t):
    """Mô tả thiên phú gốc -> câu đầu, bỏ thẻ màu và chỗ trống {n}."""
    t = re.sub(r'<[^>]+>', '', t)
    t = t.split('\\n')[0].strip()
    return re.sub(r'\{\d+\}', '…', t)


def main():
    items = jsvar(os.path.join(GAME, 'data', 'sk-items.js'), 'SK_ITEMS')['items']
    data = jsvar(os.path.join(GAME, 'data', 'sk-data.js'), 'SK_DATA')
    pf_rules = json.load(io.open(os.path.join(HERE, 'plants_prefab.json'), encoding='utf-8'))
    wiki = json.load(io.open(os.path.join(GAME, 'tools', 'wiki', 'plants.json'), encoding='utf-8'))
    cfg = {p['plantName']: p for p in json.load(io.open(os.path.join(REF, 'decoded', 'plant_config.json'), encoding='utf-8'))['plants']}
    loc = json.load(io.open(os.path.join(REF, 'decoded', 'localization_en_vi.json'), encoding='utf-8'))
    buffs = jsvar(os.path.join(GAME, 'data', 'sk-buffs86.js'), 'SK_BUFFS86')['buffs']
    w86 = jsvar(os.path.join(GAME, 'data', 'sk-weapons86.js'), 'SK_W86')['weapons']
    pets = jsvar(os.path.join(GAME, 'data', 'sk-pets.js'), 'SK_PETS')['pets']
    prefabs = data['prefabs']

    # wiki theo tên Anh (khoá wiki lẫn id: dragon_tree, rosemary dùng chung)
    wk = {}
    for k, v in wiki.items():
        wk[v['en'].lower()] = v
    seeds = sorted(k for k in items if re.match(r'^plant_\w+_seed$', k))
    out, notes = {}, []
    for sk in seeds:
        base = sk[:-5]                                   # plant_gem_tree
        it = items[sk]
        en = re.sub(r'^Seed ', '', it['en'])
        w = wk.get(en.lower())
        if not w:
            notes.append('%s: không khớp wiki (%s)' % (sk, en))
        pf = pf_rules.get(base)
        pfname = base
        if not pf:
            pfname = 'plant_rosemary'                    # plant_icepear: không có prefab trong common.ab, mượn hình Hương Thảo
            pf = pf_rules[pfname]
            notes.append('%s: không có prefab, mượn hình %s' % (sk, pfname))
        f = pf['f']
        cls = pf['cls']
        n = pf['states']
        mbs = (prefabs.get(pfname) or [{}])[0].get('mbs', {}).get(cls, {})
        usable = f.get('usableState', 0)
        mature = usable if usable > 0 else n - 1
        restart = f.get('restartState', 0)
        perm = bool(f.get('permanent'))
        stages = []
        for i in range(n):
            sp = pf['stateSprites'].get(str(i)) or []
            stages.append(sp[0] if sp else None)
        # ---- sản phẩm theo lớp Plant*
        prod = {}
        ptypeVi = {'PlantMaterial': 'Vật liệu', 'PlantWeapon': 'Vũ khí', 'PlantBuff': 'Thiên phú', 'PlantPet': 'Thú cưng',
                   'PlantDrink': 'Khác', 'PlantGrowItem': 'Khác'}[cls]
        if cls == 'PlantMaterial':
            if f.get('randomMaterial'):
                prod = {'kind': 'randMat', 'keys': sorted(k for k in items if k.startswith('material_magic_')), 'n': 1}
            elif f['material'] == 'material_gem':
                prod = {'kind': 'gems', 'n': f['count']}
            else:
                prod = {'kind': 'material', 'key': f['material'], 'n': f['count']}
        elif cls == 'PlantWeapon':
            wk_ = lambda r: re.sub(r'^@', '', r)
            young = wk_(mbs.get('youngWeapon') or mbs.get('weapon'))
            prod = {'kind': 'weapon', 'key': young}
            if mbs.get('youngWeapon') and mbs.get('weapon'):
                prod['up'] = wk_(mbs['weapon'])
        elif cls == 'PlantBuff':
            bid = f.get('buff', 0)
            if f.get('IsRandomBuff'):
                prod = {'kind': 'buffRand'}
            elif bid == 0:
                prod = {'kind': 'slot'}
            else:
                b = buffs.get(str(bid))
                inf = loc.get('Buff_info_%d' % bid)
                nm = ((b or {}).get('name') or {}).get('vi')
                prod = {'kind': 'buff', 'id': bid, 'name': nm, 'info': strip_tags(inf[1]) if inf else None, 'en': ((b or {}).get('name') or {}).get('en')}
        elif cls == 'PlantPet':
            prod = {'kind': 'pet', 'pet': f.get('petName') or None, 'sprite': re.sub(r'^@', '', mbs.get('petSprite', '')) or None}
            prod['body'] = {'plant_datura': 'pet_datura_0', 'plant_eator': 'pet_eater_0'}.get(pfname)
        elif cls == 'PlantDrink':
            prod = {'kind': 'drink', 'hp': 1, 'energy': 40}       # [WIKI Snow Lotus] +1 máu tối đa, +40 năng lượng tối đa
        elif cls == 'PlantGrowItem':
            prod = {'kind': 'item'}
        if sk == 'plant_icepear_seed':
            prod = {'kind': 'buffPick', 'ids': [1015, 1016, 1017]}   # [WIKI Frozen Pear] một trong ba thiên phú băng
        days = w['days'] if w and isinstance(w['days'], int) else mature
        if w and isinstance(w['days'], str):
            days = mature
        fast = bool(w and w['days'] == 0)
        if w and w['harvest'] != ('Permanent' if perm else 'Once Time'):
            notes.append('%s: wiki %s khác prefab permanent=%s' % (sk, w['harvest'], perm))
        if w and not fast and days != mature and not isinstance(w['days'], str):
            notes.append('%s: wiki %s ngày khác prefab %s giai đoạn' % (sk, w['days'], mature))
        c = cfg.get(base) or {}
        out[sk] = {
            'plant': pfname, 'vi': (loc.get(base) or [None, it['vi']])[1], 'seed': it['vi'], 'en': en,
            'rarity': it['level'], 'days': days, 'fast': fast, 'harvest': 'perm' if perm else 'once',
            'ptype': cls, 'ptypeVi': ptypeVi, 'mature': mature, 'max': n - 1, 'restart': restart,
            'stages': stages, 'product': prod,
            'price': c.get('value') if c else (w or {}).get('price'),
            'src': {'rules': 'prefab ' + pfname, 'days': 'wiki' if w else 'prefab', 'price': 'plant_config' if c else ('wiki' if w and w.get('price') else None)},
        }
    # tên sản phẩm tiếng Việt dựng sẵn cho hộp thoại
    for sk, p in out.items():
        pr = p['product']
        k = pr['kind']
        if k == 'material':
            pr['vi'] = '%s ×%d' % (items[pr['key']]['vi'], pr['n'])
        elif k == 'gems':
            pr['vi'] = '%d đá quý' % pr['n']
        elif k == 'randMat':
            pr['vi'] = (loc.get('plant/info/random_material') or [0, '1 Mảnh Phép Thuật ngẫu nhiên'])[1]
        elif k == 'weapon':
            names = [w86[pr['key']]['n']['vi']] + ([w86[pr['up']]['n']['vi']] if pr.get('up') else [])
            pr['vi'] = ' hoặc '.join(names)
        elif k == 'buff':
            pr['vi'] = pr['name'] or pr['info'] or ('Thiên phú %d' % pr['id'])
        elif k == 'buffRand':
            pr['vi'] = (loc.get('plant/info/random_buff') or [0, 'Thiên phú ngẫu nhiên'])[1]
        elif k == 'buffPick':
            pr['vi'] = (loc.get('plant/info/random_range_buff') or [0, ''])[1].rstrip(':') + ' (Băng Kích, Tượng Băng Nổ, Vòng Sương Băng)'
        elif k == 'slot':
            pr['vi'] = (loc.get('plant/info/buff_slot') or [0, 'SL thiên phú thêm +1'])[1]
        elif k == 'drink':
            pr['vi'] = '+1 máu tối đa, +40 năng lượng tối đa'
        elif k == 'item':
            pr['vi'] = (loc.get('plant/info/random_item') or [0, 'Vật phẩm ngẫu nhiên'])[1]
        elif k == 'pet':
            pr['vi'] = 'Thú cưng ' + p['vi']
            if pr.get('pet') and pr['pet'] in pets:
                pr['vi'] = 'Thú cưng ' + pets[pr['pet']]['vi']
    plots = [{'kind': 'free'}, {'kind': 'free'}, {'kind': 'free'},
             {'kind': 'gems', 'n': 5000},                                   # [WIKI Garden] ô 4: 5000 đá
             {'kind': 'money', 'usd': 1}, {'kind': 'money', 'usd': 2},     # ô 5: $1, ô 6: $2
             {'kind': 'achievement', 'ac': 42, 'name': loc['ac/name_42'][1], 'text': loc['ac/desc_42'][1]},   # ô 7: thành tựu "The Last Wall"
             {'kind': 'money', 'usd': 2}]                                   # ô 8: $2
    res = {'v': 1, 'plants': out, 'plots': plots}
    dst = os.path.join(GAME, 'data', 'sk-garden.js')
    with io.open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/garden/build_garden.py — không sửa tay.\n')
        f.write('window.SK_GARDEN = ' + json.dumps(res, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('hạt', len(out), 'ghi chú', len(notes))
    for n in notes:
        print('!', n)


if __name__ == '__main__':
    main()
