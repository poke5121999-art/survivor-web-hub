# -*- coding: utf-8 -*-
"""Vật phẩm + bảng luật Season (Thoát khỏi Monkia) từ dữ liệu thật 8.6 -> data/season-items.js (window.SK_SEASON_ITEMS).

Nguồn (ngoài git, xem tools/config86/README.md):
  - D:/sk86-ref/decoded/luban/escape_*.json, task_tbescapetaskconfig.json, game_tbaiattribute.json, game_tbskill.json,
    game_tbweaponaffix.json (bảng Luban đã gỡ)
  - D:/sk86-ref/decoded/mb/escape_config.json (EscapePlayerCombatConfig...), localization_en_vi.json (tên tiếng Việt chính thức)
  - D:/sk86-ref/decoded/weapons.json (tên vũ khí), bundle escape.ab / escape_ui_texture.ab (icon, UI)
  - data/sk-wiki.js: bộ vũ khí bản web có (vũ khí thật ngoài bộ này bị bỏ khỏi bảng rơi, xem README)
Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/season/build_items.py
"""
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..'))
from skrip import Rip  # noqa: E402

DEC = 'D:/sk86-ref/decoded'
LUB = DEC + '/luban/'
TERRAIN = os.environ.get('SK_SEASON_TERRAIN', 'D:/sk86-ref/work/season/terrain')
OUT_JS = os.path.join(GAME, 'data', 'season-items.js')
ART_DIR = os.path.join(GAME, 'art', 'season', 'ui')
PAGE_W = 1024

TYPES = ['Weapon', 'Consumable', 'Normal', 'Bag', 'Armor', 'Talisman', 'Blueprint', 'TreasureMap', 'AffixStone']   # [ĐO EscapeItemType]
EFFECTS = ['hp', 'armor', 'energy', 'satiety', 'kg', 'speed', 'poison', 'fire', 'ice']                          # [ĐO EscapeConsumableEffectType]


def J(p):
    return json.load(io.open(p, encoding='utf-8'))


def short(i):
    return i.replace('esc_item_', '') if isinstance(i, str) else i


def slug(name):
    return re.sub(r'[^a-z0-9]+', '_', name.replace('‑', '-').replace("'", '').lower()).strip('_')


def wiki_weapons():
    s = io.open(os.path.join(GAME, 'data', 'sk-wiki.js'), encoding='utf-8').read()
    s = s[s.index('{'):s.rindex('}') + 1]
    return json.loads(s)['weapons']


def main():
    loc = J(DEC + '/localization_en_vi.json')
    vi = lambda k, d=None: (loc.get(k) or [None, None])[1] or d   # noqa: E731
    en = lambda k, d=None: (loc.get(k) or [None, None])[0] or d   # noqa: E731
    db = J(LUB + 'escape_tbescapeitemdatabase.json')
    affix = {r['Id']: r for r in J(LUB + 'game_tbweaponaffix.json')}
    wdec = J(DEC + '/weapons.json')
    wk = wiki_weapons()
    esc = {e['cls']: e['data'] for e in J(DEC + '/mb/escape_config.json')}
    rip = Rip(bundles=['escape', 'escape_ui_texture'])
    spr = {}
    for cab, o in rip.objects(['escape', 'escape_ui_texture'], ('Sprite',)):
        spr.setdefault(rip.tree(cab, o)['m_Name'], (cab, o))

    frames = []
    have = set()

    def icon(name, prefix='sitem/'):
        if not name or name not in spr:
            return None
        key = prefix + name
        if key not in have:
            s = rip.sprite(*spr[name])
            if not s:
                return None
            have.add(key)
            frames.append((key, s[1]))
        return key

    # vũ khí thật -> id vũ khí bản web (khớp tên tiếng Anh với wiki)
    wmap, wmiss = {}, []
    for r in db:
        if TYPES[r['Type']] != 'Weapon':
            continue
        d = wdec.get(r['WeaponId']) or {}
        nm = (d.get('name') or {}).get('en') or en(r['NameKey'])
        sid = slug(nm) if nm else None
        if sid in wk:
            wmap[short(r['Id'])] = sid
        else:
            wmiss.append(short(r['Id']))

    items, order = {}, []
    for r in db:
        t = TYPES[r['Type']]
        iid = short(r['Id'])
        it = {'raw': t, 'weight': r['Weight'], 'value': r['Value'], 'rarityIdx': r['Rarity'], 'stack': r['MaxStackCount']}
        if r['MaxDurability'] > 0:
            it['dur'] = r['MaxDurability']
        p = r['Params']
        if t == 'Weapon':
            if iid not in wmap:
                continue
            d = wdec.get(r['WeaponId']) or {}
            it.update(type='weapon', weaponId=wmap[iid], name=(d.get('name') or {}).get('vi') or vi(r['NameKey'], iid),
                      nameEn=(d.get('name') or {}).get('en') or en(r['NameKey'], iid), icon=wk[wmap[iid]].get('sprite'))
        elif t == 'AffixStone':
            a = affix.get(int(p[0])) if p else None
            if not a:
                continue
            it.update(type='affix', affixId=a['Id'], level=a['Level'], name='%s Lv%d' % (vi(a['NameKey'], a['Class']), a['Level']),
                      nameEn='%s Lv%d' % (en(a['NameKey'], a['Class']), a['Level']),
                      desc=(vi(a['DescKey'], '') or '').replace('{0}', '%g' % a['Factor0']).replace('{1}', '%g' % a['Factor1']),
                      icon=icon(r['IconName'], 'sui/') or icon('weapon_affix_level_%d' % a['Level'], 'sui/'))
        elif t in ('Talisman', 'Blueprint'):
            continue            # bùa thiên phú: chỉ chế ở Bàn Chế Tạo từ Ấn Ký của trùm — ngoài phạm vi bản web
        else:
            nm = vi(r['NameKey'])
            if not nm:
                continue        # chìa khoá nhiệm vụ không có chữ (esc_item_task_*): vùng sau
            it['name'] = nm
            it['nameEn'] = en(r['NameKey'], iid)
            it['desc'] = vi(r['DescKey'], '')
            ico = r['IconName'] or os.path.splitext(os.path.basename(r['IconPath']))[0]
            it['icon'] = icon(ico)
            if t == 'Consumable':
                it['type'] = 'potion' if ('pot' in iid or 'potion' in iid) else 'food'
                eff, ce = {}, r['ConsumableEffectType']
                # [ĐO bảng] Params = [giá trị hiệu ứng 1, thời gian dùng (s), giá trị hiệu ứng 2 | thời hạn (s)]
                if ce:
                    eff[EFFECTS[ce[0]]] = p[0]
                if len(ce) > 1:
                    eff[EFFECTS[ce[1]]] = p[2]
                elif ce and ce[0] >= 4 and len(p) > 2:
                    eff['time'] = p[2]
                it['effect'] = eff
                it['useTime'] = p[1] if len(p) > 1 else 0
            elif t == 'Bag':
                it['type'] = 'backpack'
                it['slots'], it['kg'] = int(p[0]), p[1]
            elif t == 'Armor':
                it['type'] = 'armor'
                it['armor'] = int(p[0])
            elif t == 'TreasureMap':
                it['type'] = 'treasure_map'
            elif iid.startswith(('treasure_', 'misc_copper', 'misc_silver', 'misc_gold', 'misc_moon')):
                it['type'] = 'valuable'
            else:
                it['type'] = 'material'
            if iid.startswith('ingredient_'):
                it['sub'] = 'ingredient'
        items[iid] = it
        order.append(iid)
    items['iron_coin'] = {'raw': 'Money', 'type': 'currency', 'name': 'Xu Sắt', 'nameEn': 'Iron Coin', 'weight': 0, 'value': 1,
                          'rarityIdx': 0, 'stack': 999999, 'icon': icon('icon_coin', 'sui/'), 'desc': 'Tiền của Monkia.'}
    order.append('iron_coin')

    # ---------------------------------------------------------------- bảng rơi
    def entries(lst):
        out = []
        for e in lst:
            iid = short(e['ItemId'])
            if iid != '__NO_DROP__' and iid not in items:
                continue      # vũ khí chưa có ở bản web
            if e['Probability'] <= 0:
                continue
            row = [iid, e['Probability'], e['CountMin'], e['CountMax']]
            if e.get('DurabilityMax'):
                row += [e['DurabilityMin'], e['DurabilityMax']]
            out.append(row)
        return out
    pools = {p['Id'].replace('esc_pool_', ''): entries(p['LootEntries']) for p in J(LUB + 'escape_tbescapelootentryconfig.json')}
    chests = {c['Id'].replace('esc_chest_', ''): [[p['LootPoolId'].replace('esc_pool_', ''), p['DrawCountMin'], p['DrawCountMax']]
                                                   for p in c['LootPools']] for c in J(LUB + 'escape_tbescapechestconfig.json')}
    chest_prefab = {c['chestId'].replace('esc_chest_', ''): c['prefab'].split(':')[1].split('@')[0]
                    for c in esc['EscapeChestPrefabConfig']['chests']}

    # ---------------------------------------------------------------- quái
    ai = {r['Id']: r for r in J(LUB + 'game_tbaiattribute.json')}
    skills = {r['Id']: r for r in J(LUB + 'game_tbskill.json')}
    spawns = {}
    for s in J(LUB + 'escape_tbescapeenemyspawnconfig.json'):
        pref = s['EnemyPrefabPath'].split('/')[-1].replace('.prefab', '')
        spawns[s['Id']] = {'prefab': pref, 'hpx': s['HpMultiplier'],
                           'weapons': [[short(w['WeaponItemId']), w['FireDurationMin'], w['FireDurationMax'], w['AttackCd']] for w in s['WeaponPool']],
                           'weaponsW': s['WeaponWeightPool'],
                           'loadouts': [[[short(x) for x in l['WeaponSlots'][0].split(';')], l['FireDurationMin'], l['AttackCd']] for l in s['WeaponLoadoutPool']]}
    enemies = {}
    for pid in sorted({v['prefab'] for v in spawns.values()}):
        a = ai.get(pid)
        if not a:
            continue
        enemies[pid] = {'hp': a['Hp'], 'speed': a['MoveSpeed'], 'atk': a['PhysicalAttack'], 'find': a['FindTargetRange'],
                        'friction': a['Friction'], 'think': a['AIThinkInterval'],
                        'skills': [[w['SkillID'], w['Weight']] for w in a['WeightedSkills']]}
    sk = {}
    for e in enemies.values():
        for sid, _ in e['skills']:
            s = skills[sid]
            sk[sid] = {'cls': s['Class'], 'cd': s['SkillCd'], 'gcd': s['SkillGcd'], 'startup': s['SkillStartUp'],
                       'dmg': s['SkillDamageFactor'][0], 'move': s['MoveStrategy'], 'custom': json.loads(s['CustomData'] or '{}')}

    # ---------------------------------------------------------------- căn cứ
    shop = [short(r['ItemId']) for r in sorted(J(LUB + 'escape_tbescapeshopitemconfig.json'), key=lambda r: r['Order'])]
    warehouse = [r['SlotCount'] for r in sorted(J(LUB + 'escape_tbescapewarehousecapacityconfig.json'), key=lambda r: r['Level'])]
    buildings = [{'id': b['BuildingName'], 'name': vi(b['DisplayName'], b['BuildingName']), 'desc': vi(b['Description'], ''),
                  'effect': vi(b['DisplayName'] + '_effect', ''), 'lv0': b['DefaultLevel']}
                 for b in J(LUB + 'escape_tbescapedesigntablebuildingconfig.json')]
    upgrades = [{'id': u['Id'], 'b': u['BuildingName'], 'lv': u['TargetLevel'], 'coins': u['MoneyCost'],
                 'items': [[short(i), n] for i, n in zip(u['RequiredItemIds'], u['RequiredItemCounts'])],
                 'need': u['AchievedNodeConditions']} for u in J(LUB + 'escape_tbescapedesigntableupgradeconfig.json')]
    craft = []
    for b in J(LUB + 'escape_tbescapecraftblueprintconfig.json'):
        tgt = short(b['TargetItemId'])
        if tgt.startswith('indestructible_'):
            continue          # vũ khí bền vĩnh viễn: cần Mảnh Thiên Thạch + bản vũ khí riêng, chưa có ở bản web
        if tgt not in items:
            continue
        need = [[short(i['Id']), i['Count']] for i in b['RequiredItems']]
        if any(n[0] not in items for n in need):
            continue
        craft.append({'id': b['Id'], 'at': b['Building'][0], 'lv': b['BuildingLevel'][0], 'coins': b['MoneyCost'],
                      'in': need, 'out': [tgt, b['TargetItemCount']]})
    training = []
    GROW = ['bag_capacity', 'weight', 'talisman_slots', 'sprint_distance', 'sprint_invincibility', 'sprint_cooldown',
            'sprint_charge', 'health', 'hunger']
    for u in J(LUB + 'escape_tbescapeupgradeblueprintconfig.json'):
        g = GROW[u['UpgradeType']]
        training.append({'id': u['Id'], 'type': u['UpgradeType'], 'key': g, 'value': u['UpgradeValue'], 'coins': u['MoneyCost'],
                         'pre': u['PrerequisiteUpgradeIds'], 'items': [[short(i['Id']), i['Count']] for i in u['RequiredItems']],
                         'icon': icon(u['SpriteName'], 'sui/'), 'name': vi('esc_character_growth_' + g, g),
                         'effect': vi('esc_character_growth_%s_effect' % g, '')})

    # ---------------------------------------------------------------- nhiệm vụ
    tasks = []
    for r in J(LUB + 'task_tbescapetaskconfig.json'):
        tid = r['Id']
        title = vi('esc_task_%d_name' % tid) or vi(r['TitleKey'], r['TitleKey'])
        if '{0}' in title:
            b = next(iter(r['Checkers'].values()), {})
            title = title.replace('{0}', ', '.join(vi('esc_building_' + {'Workshop': 'workshop', 'Kitchen': 'kitchen',
                                                                          'Medical': 'medical_station', 'Tent': 'tent'}.get(k, k.lower()), k) for k in b))
        checks = []
        for ck, v in r['Checkers'].items():
            kind = ck.split('#')[0].replace('Escape', '')
            for k, n in v.items():
                checks.append([kind, short(k), n])
        tasks.append({'id': tid, 'title': title, 'titleEn': en(r['TitleKey'], ''), 'desc': vi(r['DescKey'], ''),
                      'npc': r['NpcId'], 'pre': r['PreTaskID'], 'unlock': r['ExtraUnlockConditions'], 'checks': checks,
                      'rewards': [[short(k), n] for k, n in (r['FinishRewards'].get('0') or {}).items()], 'coins': r['RewardMoney']})

    # ---------------------------------------------------------------- luật [ĐO EscapePlayerCombatConfig + hằng IL2CPP]
    pc = esc['EscapePlayerCombatConfig']
    rules = {
        'speedBase': pc['playerBaseMoveSpeedInBase'], 'speedOut': pc['playerBaseMoveSpeedOutsideBase'],
        'kg': pc['playerBaseCarryWeight'],
        'tiers': [pc['carryWeightLevel%dThreshold' % i] for i in range(1, 5)],
        'tierSpeed': [pc['carryWeightLevel%dMoveSpeedFactor' % i] for i in range(5)],
        'dodgeCd': pc['playerDodgeCooldown'], 'dodgeInv': pc['playerDodgeInvincibleDuration'], 'dodgeForce': pc['playerDodgeForce'],
        'autoAim': pc['playerAutoAimRange'], 'hurtInv': pc['playerHurtInvincibleDuration'],
        'repairLoss': pc['repairWearMaxDurabilityLossMultiplier'], 'repairCost': pc['repairCostMultiplier'],
        'sellZeroDur': pc['sellPriceZeroDurabilityMultiplier'], 'reveal': pc['itemRevealDurationsByRarity'],
        'hungerMax': 100, 'hungerPerSec': 0.14, 'starvePerSec': 0.5,   # [ĐO hằng EscapeInventoryRuntime.BaseMaxHunger/...]
        'bagSlots': 15, 'secureSlots': 1, 'talismanSlots': 1,          # [ĐO hằng BasePlayerBagSlotCount/SafeSlotCountValue/BaseTalismanSlotCount]
        'weaponDurSec': 2.0,                                           # [ĐO EscapeWeaponDurabilityTracker.AddBillableTime: 2 s bắn = -1 độ bền]
        'buyRate': 2,                                                  # [ĐO EscapeShop.GetPurchasePrice = Value << 1]
        'camera': esc['EscapeModeConfig']['cameraOrthographicSize'],
    }
    npcs = {n['npcId']: {'name': vi(n['npcId'], n['npcId']), 'prefab': n['prefab'].split(':')[1].split('@')[0]} for n in esc['EscapeNpcConfig']['npcs']}
    for k in list(npcs):
        if npcs[k]['name'] == k:
            hero = npcs[k]['prefab']
            npcs[k]['name'] = next((v[1] for kk, v in loc.items() if kk.startswith('Character') and kk.endswith('_name_skin0') and v[0] and slug(v[0]) == slug(hero)), hero)
    npcs['esc_npc_trainer']['name'] = vi('esc_npc_trainer')
    dialog = {str(d['dialogId']): [vi(l['localizationKey'], l['localizationKey']) for l in d['lines']] for d in esc['EscapeDialogConfig']['dialogs']}
    treasure = [{'item': short(e['itemId']), 'events': [[p.split(':')[1].split('@')[0], k, w] for p, k, w in zip(e['prefab'], e['localizationKeys'], e['weights'])]}
                for e in esc['EscapeTreasureMapConfig']['entries']]
    esc_loc = {k: v[1] for k, v in loc.items() if k.startswith('esc_') and v[1] and not k.startswith('esc_item_')}

    # ---------------------------------------------------------------- atlas UI + icon
    for nm in sorted(n for n, (cab, o) in spr.items() if rip.bundle_of.get(cab, '').startswith('escape_ui_texture')):
        icon(nm, 'sui/')
    for nm in ('Coin', 'talent_mark', 'talent_mark_dim', 'season_icon_Escape'):
        icon(nm, 'sui/' if nm == 'Coin' else 'sitem/')
    frames.sort(key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    x = y = shelf = 0
    pos = {}
    for nm, im in frames:
        if x + im.width + 1 > PAGE_W:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[nm] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    page = Image.new('RGBA', (PAGE_W, y + shelf + 1), (0, 0, 0, 0))
    table = {}
    for nm, im in frames:
        px, py = pos[nm]
        page.paste(im, (px, py))
        table[nm] = [px, py, im.width, im.height, im.width / 2.0, im.height / 2.0]
    os.makedirs(ART_DIR, exist_ok=True)
    page.save(os.path.join(ART_DIR, 'season-ui.png'), optimize=True)
    # Ảnh bản đồ cho bảng Bản đồ (Texture2D Init/Scene1 của escape_map.ab, do extract_terrain.py xuất)
    maps = {}
    for nm, out, rect in (('Init', 'map_base.png', [-22.75, 30.5, 16.0]), ('Scene1', 'map_scene1.png', [0, 350, 1024 / 350.0])):
        im = Image.open(os.path.join(TERRAIN, 'overview_%s.png' % nm)).convert('RGB')
        k = 2 if nm == 'Init' else 1
        im2 = im.resize((im.width // k, im.height // k), Image.BOX)
        im2.save(os.path.join(ART_DIR, out), optimize=True)
        # [ĐO README terrain] góc trên-trái ảnh = (ux, uy) đơn vị; px ảnh gốc mỗi đơn vị
        maps[nm] = {'src': 'art/season/ui/' + out, 'w': im2.width, 'h': im2.height, 'ux0': rect[0], 'uy1': rect[1], 'ppu': rect[2] / k}

    data = {
        'source': 'Soul Knight 8.6.0: luban escape_* + escape_config + localization vi; tools/season/build_items.py',
        'order': order, 'items': items,
        'atlas': {'src': 'art/season/ui/season-ui.png', 'w': page.width, 'h': page.height, 'f': table}, 'maps': maps,
        'tables': {'pools': pools, 'chests': chests, 'chestPrefab': chest_prefab, 'spawns': spawns, 'enemies': enemies,
                   'skills': sk, 'shop': shop, 'warehouse': warehouse, 'buildings': buildings, 'upgrades': upgrades,
                   'craft': craft, 'training': training, 'tasks': tasks, 'rules': rules, 'npcs': npcs, 'dialog': dialog,
                   'treasure': treasure, 'loc': esc_loc},
        'weaponMissing': wmiss,
    }
    js = ('// SINH TỰ ĐỘNG bởi tools/season/build_items.py từ dữ liệu 8.6.0 — không sửa tay.\n'
          'window.SK_SEASON_ITEMS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    by = {}
    for it in items.values():
        by[it['type']] = by.get(it['type'], 0) + 1
    print('items', len(items), by, 'no icon', [k for k, v in items.items() if not v.get('icon')][:20])
    print('weapons mapped', len(wmap), 'missing', len(wmiss), 'craft', len(craft), 'tasks', len(tasks), 'enemies', list(enemies))
    print('page', page.size, 'frames', len(table), '->', OUT_JS, '%.0f KB' % (os.path.getsize(OUT_JS) / 1024))


if __name__ == '__main__':
    main()
