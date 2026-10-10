#!/usr/bin/env python
# Sinh data/sk-buffs86.js: buff chọn giữa ải, tượng, giếng ước, lái buôn, đồ rơi của chế độ thường,
# từ dữ liệu giải mã ở D:\sk86-ref\decoded (xem tools/config86/README.md). Không sửa tay tệp đầu ra.
#   PYTHONIOENCODING=utf-8 python games/soulknight/tools/buffs/build_buffs86.py
import io, json, os, re, sys, time

DEC = os.path.expanduser(os.environ.get('SK86_DEC', r'D:\sk86-ref\decoded'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'sk-buffs86.js')


def jl(rel):
    with io.open(os.path.join(DEC, rel), encoding='utf-8') as f:
        return json.load(f)


L = jl('localization_en_vi.json')
POOL = jl('luban/masteradvancement_tbmastertalentpoolconfig.json')
TG = jl('luban/pseudorandom_tbtalentgroups.json')
NOOB = jl('luban/pseudorandom_tbnooblevels.json')
RO = jl('config/random_objects.json')
WEAPONS = jl('weapons.json')


def loc(term):
    v = L.get(term)
    return {'en': v[0], 'vi': v[1]} if v else None


# ---- BuffId <-> khoá enum. [ĐO] pool: BuffId = thứ tự trong enum emBuff; tên/icon/mô tả theo BuffId.
by_key = {r['BuffName']: r for r in POOL}
# Khoá ở nhóm tượng (TG_*) mà pool không có: BuffId lấy theo thứ tự enum (types.txt emBuff) hoặc bảng loc.
EXTRA_ID = {'ExpertShop': 10, 'VampireHp': 11, 'ExpertPot': 12, 'VampireEnergy': 13, 'ExpertGem': 15,
            'ExpertBoxPot': 19, 'ExpertStatus': 22, 'MasterWeapon': 25, 'MasterElementCritic': 26, 'MasterStaff': 27,
            'SpeedUpWithCritic': 36, 'PeriodicImmuneElement': 1023, 'DungeonGourmet': 1025}
key_id = {k: r['BuffId'] for k, r in by_key.items()}
key_id.update({k: v for k, v in EXTRA_ID.items() if k not in key_id})


def loc_id(bid):
    """Buff_name_XX: XX = BuffId-1 với BuffId < 1000 ([ĐO] Buff_name_00 = Piercing Crit = BuffId 1); ≥ 1000 giữ nguyên."""
    return '%02d' % (bid - 1) if bid < 1000 else str(bid)


ICON = lambda bid: ('ui_buff_%02d' % bid) if bid < 100 else 'ui_buff_%d' % bid
ICON_OVERRIDE = {40: 'ui_buff_26',              # Elemental Torrent: ui.ab 8.6 không có ui_buff_40; icon gậy là 26
                 1024: 'ui_buff_gun_echo', 1025: 'ui_buff_dungeon_gourmet', 1023: 'ui_buff_yinyang',
                 39: 'ui_buff_x'}

buffs = {}
for k, bid in key_id.items():
    lid = loc_id(bid)
    nm = loc('Buff_name_' + lid)
    if k == 'ExpertStatus':
        nm = loc('Buff_name_21')
    info = loc('Buff_info_' + lid)
    upg = loc('Buff_upgrade_' + lid)
    row = by_key.get(k)
    buffs[str(bid)] = {
        'key': k, 'id': bid, 'name': nm, 'info': info, 'upg': upg,
        'icon': ICON_OVERRIDE.get(bid, ICON(bid)),
        'pool': {'weight': row['Weight'], 'enabled': row['Enabled'], 'note': row['Comment']} if row else None,
    }
# MasterElementCritic/MasterStaff (BuffId 26/27 trong enum) không có tên riêng ở loc: gộp vào Elemental Torrent (BuffId 40).
for k in ('MasterElementCritic', 'MasterStaff'):
    b = buffs[str(key_id[k])]
    b['name'] = buffs['40']['name']; b['info'] = buffs['40']['info']; b['upg'] = buffs['40']['upg']; b['icon'] = 'ui_buff_26'
    b['alias'] = 'ElementalStaff'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from talents86 import extra_buffs
buffs.update(extra_buffs(loc))   # 1015..1018, 3001..3007: ngoài bảng nhóm bốc

groups = {g['TalentGroupId']: [[key_id[u['Id']], u['Weight']] for u in g['TalentUnit']] for g in TG}
# 1-1..1-5 = cấp 1..5; 2-x = 6..10; 3-x = 11..15 [ĐO pseudorandom_tbnooblevels: LevelId "<cấp>_<nhánh>"].
levels = {}
for r in NOOB:
    lv, br = r['LevelId'].split('_')
    levels.setdefault(lv, {})[br] = r['TalentGroup'][0]

# ---- số từ mã Lua thật (giá trị kiểm bằng regex, không gõ tay)
LUA = os.path.join(DEC, 'lua', 'app')


def lua_num(rel, key):
    src = io.open(os.path.join(LUA, rel), encoding='utf-8').read()
    m = re.search(r'\b' + re.escape(key) + r'\s*=\s*(-?[0-9.]+)', src)
    if not m:
        raise SystemExit('không thấy %s trong %s' % (key, rel))
    v = float(m.group(1))
    return int(v) if v == int(v) else v


values = {
    # Hút Sinh Lực (VampireHp) / Hút Năng Lượng (VampireEnergy): bản Lua thay thế cùng biểu tượng.
    'lifeSiphon': {'prob': lua_num('talent/lifesiphon.lua', 'probability'), 'src': 'talent/lifesiphon.lua'},
    'energySiphon': {'prob': lua_num('talent/energysiphon.lua', 'probability'), 'src': 'talent/energysiphon.lua'},
    'whirlwind': {k: lua_num('talent/whirlwindslashruntime.lua', k) for k in ('cooldown', 'damage', 'size', 'repel')},
    'kinetic': {k: lua_num('talent/kineticstrike.lua', k) for k in
                ('charge_distance', 'damage_increase_percent', 'size_increase_percent')},
    'courage': {k: lua_num('talent/courage.lua', k) for k in ('damage_factor_per_stack', 'duration', 'max_stack')},
    'criticalRhythm': {k: lua_num('talent/criticalrhythm.lua', k) for k in
                       ('critical', 'attack_speed_per_stack', 'duration', 'max_stack')},
    'partyTime': {k: lua_num('talent/partytime.lua', k) for k in ('attack_speed_addition', 'move_speed_addition')},
    'elementalCycle': {k: lua_num('talent/elementalcycle.lua', k) for k in
                       ('cycle_duration', 'missile_trigger_probability', 'elemental_damage_factor')},
    'rapidCharge': {'factor': lua_num('talent/rapidcharge.lua', 'charge_time_factor')},
    'braveHeart': {k: lua_num('talent/braveheart.lua', k) for k in ('restore_per_max_health', 'max_health_per_trigger')},
    'bloodRage': {k: lua_num('talent/bloodrage.lua', k) for k in ('max_attack_speed', 'max_critical')},
    'emergencyShield': {k: lua_num('talent/emergencyshield.lua', k) for k in ('cooldown', 'shield_duration')},
    'potion': {'healPowerFactor': lua_num('talent/potionenhancement.lua', 'heal_power_factor')},
}

# ---- tượng: tên, mô tả (mẫu có {0}/{1}), hồi chiêu đọc từ prefab buff_statue_N lúc chạy.
# Số minh hoạ trong mô tả lấy theo wiki (nhãn [WIKI]); số chạy thật lấy từ prefab [ĐO] khi có.
STATUE_KEY = {1: 'wizard', 2: 'knight', 3: 'minister', 4: 'assassin', 5: 'spirit', 6: 'thief', 7: 'paladin',
              8: 'engineer', 9: 'viking', 10: 'wolf'}
statues = {}
for i, k in STATUE_KEY.items():
    statues[str(i)] = {'key': k, 'name': loc('statue_%s_name' % k), 'info': loc('statue/info/%d' % i)}

# ---- cửa hàng / vật phẩm: bể ngẫu nhiên thật [ĐO config/random_objects]


def pool(name, keep_cond=False):
    out = []
    d = RO[name]['Data']
    for o in d['Objects']:
        x = o['data']
        out.append({'p': x['gameObject'].split('/')[-1].replace('.prefab', ''), 'w': x['weight'],
                    'cond': [[c['type'], c['key'], c['compare'], c['num'], bool(c.get('inverse'))]
                             for c in x.get('conditions', [])]})
    return out


shop = pool('shop')
random_objects = {k: pool(k) for k in ('shop', 'statue', 'health_pot', 'energy_pot', 'restore_pot', 'slot_machine',
                                       'merchant_honest_buffs', 'merchant_cunning_buffs', 'mystery_shop_cage')}

weapon_value = {k: v['value'] for k, v in WEAPONS.items() if isinstance(v.get('value'), (int, float)) and v['value'] > 0}

out = {
    'v': time.strftime('%Y%m%d%H%M'),
    'note': 'SINH TỰ ĐỘNG bởi tools/buffs/build_buffs86.py từ D:\\sk86-ref\\decoded (luban, config, lua, localization)',
    'buffs': buffs,
    'groups': groups,
    'levels': levels,
    'values': values,
    'statues': statues,
    'shop': shop,
    'randomObjects': random_objects,
    'weaponValue': weapon_value,
    # [ĐO RGContainer.CalculateItemValue @0x31410bc, libil2cpp.so] giá = giá gốc + int(giá gốc × hệ số);
    # hệ số = (cấp tương đối − 2) × 0,12 nếu cấp tương đối ≥ 4 và giá gốc ≤ 198; có Giảm Nửa Giá thì hệ số −= 0,5.
    'price': {'from': 4, 'per': 0.12, 'cap': 198, 'sale': 0.5},
    # [ĐO GetReward @0x7205ba4] hai lần tung 0..99 độc lập so với reward_rate: lần 1 → reward_value[3] cầu năng lượng,
    # lần 2 → reward_value[i] xu loại coin_i (i = 0..2). Giá trị mỗi xu [ĐO RGCoin.value của prefab coin_0/1/2].
    'drops': {'coin': {'0': 5, '1': 3, '2': 1}, 'energy': 8, 'rolls': 2},
    # [ĐO ItemWishingWell..cctor + Start] tối đa 50 lượt; chuỗi thưởng bắt đầu ở lượt ngẫu nhiên 28..35.
    'well': {'maxUse': 50, 'streakFrom': [28, 36], 'cost': 1},
}
js = '// SINH TỰ ĐỘNG bởi tools/buffs/build_buffs86.py — không sửa tay.\nwindow.SK_BUFFS86 = ' + \
     json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)
print('ghi', os.path.normpath(OUT), len(js), 'byte;', len(buffs), 'buff;', len(groups), 'nhóm;', len(weapon_value), 'vũ khí')
