#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sinh data/achievements.js từ AchievementData của bản gốc (rerunnable, cùng đầu vào cho cùng đầu ra).

Nguồn:
  D:/dredge-ref/ripped/ExportedProject/Assets/Data/AchievementData/*.asset   (id, điều kiện: Odin SerializedBytes UTF-16)
  .../AchievementData/DLC1, DLC2                                               (DLC: bỏ, chỉ liệt kê)
  D:/dredge-ref/game/DREDGE.*/LinkNeverDie.Com-GSE/achievements.json           (tên + mô tả tiếng Anh của Steam, cờ hidden)
  src/DredgeAchievementId.cs                                                   (thứ tự enum)
Bản gốc không có bảng bản địa hoá cho thành tựu (tên/mô tả nằm bên Steam), nên tên và mô tả giữ nguyên tiếng Anh của Steam;
thành tựu "hidden" của Steam có mô tả trống: giao diện hiện "Bí mật" tới khi đạt (tên cũng giấu).
Biểu tượng: Steam giữ ảnh ở phía máy chủ, không có trong bản demo/bản cài. [ĐỀ XUẤT] mỗi thành tựu mượn một sprite có sẵn của game.

Chạy:  PYTHONIOENCODING=utf-8 py -3.12 -I tools/achievements.py
"""
import glob, io, json, os, re, struct, sys

REF = 'D:/dredge-ref'
ASSETS = REF + '/ripped/ExportedProject/Assets/Data'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'achievements.js')
GSE = glob.glob(REF + '/game/DREDGE*/LinkNeverDie.Com-GSE/achievements.json')[0]

# ---------------------------------------------------------------- guid -> tên asset
guid_name = {}
for meta in glob.glob(ASSETS + '/**/*.asset.meta', recursive=True):
    t = io.open(meta, encoding='utf8', errors='ignore').read(300)
    g = re.search(r'guid: (\w+)', t)
    if g:
        guid_name[g.group(1)] = os.path.basename(meta)[:-11]


def read_asset(path):
    t = io.open(path, encoding='utf8').read()
    raw = re.search(r'SerializedBytes: (\w*)', t).group(1)
    refs = [guid_name.get(g, g) for g in re.findall(r'guid: (\w+), type: 2', t)]
    return bytes(bytearray.fromhex(raw)), refs, t


U16 = lambda s: s.encode('utf-16le')


def strings(b):
    out = []
    for m in re.finditer(rb'(?:[\x20-\x7e]\x00){2,}', b):
        s = m.group(0).decode('utf-16le')
        if not s.startswith('System.'):          # tên kiểu List`1[...] của Odin
            out.append(s)
    return out


def after(b, name, n):
    """n byte sau chuỗi tên trường (Odin ghi tên trường UTF-16 rồi giá trị)."""
    i = b.find(U16(name))
    return b[i + 2 * len(name): i + 2 * len(name) + n] if i >= 0 else None


# ---------------------------------------------------------------- điều kiện
def decode(b, refs):
    ss = strings(b)
    kinds = [s.replace(', Assembly-CSharp', '') for s in ss if s.endswith(', Assembly-CSharp')]
    if not kinds:
        return None                                    # kích hoạt tay (lệnh Yarn / mã năng lực / sự kiện)
    k = kinds[0]
    if k in ('IntCondition', 'DecimalCondition'):
        i = ss.index('key')
        key = ss[i + 1]
        if k == 'IntCondition':
            target = struct.unpack('<i', after(b, 'target', 4))[0]
        else:
            w = struct.unpack('<4i', after(b, 'target', 16))
            target = [x for x in w if x][0]            # decimal nhỏ, scale 0: một từ khác 0
        mode = struct.unpack('<i', after(b, 'evaluationMode', 4))[0]   # NumericalEvaluationMode 0 = GTE (nhánh mặc định của Evaluate)
        return {'t': 'int' if k == 'IntCondition' else 'decimal', 'key': key, 'target': target, 'mode': mode}
    if k == 'BoolCondition':
        i = ss.index('keys'); j = ss.index('state')
        return {'t': 'bool', 'keys': ss[i + 1:j], 'state': True}
    if k == 'NodeVisitedCondition':
        i = ss.index('nodeNames')
        return {'t': 'nodes', 'names': ss[i + 1:]}
    if k in ('EngineSpeedCondition', 'FishingSpeedCondition', 'LightStrengthCondition'):
        return {'t': {'EngineSpeedCondition': 'engineSpeed', 'FishingSpeedCondition': 'fishingSpeed',
                      'LightStrengthCondition': 'lightStrength'}[k],
                'target': struct.unpack('<f', after(b, 'target', 4))[0]}
    if k == 'QuestCompleteCondition':
        return {'t': 'quests', 'ids': refs}
    if k == 'UpgradeOwnedCondition':
        return {'t': 'upgrades', 'ids': refs}
    if k == 'ResearchCompleteCondition':
        return {'t': 'research', 'ids': [r.lower() for r in refs]}
    if k == 'AchievementEarnedCondition':
        return {'t': 'achievements', 'ids': refs}
    raise SystemExit('condition kind not handled: ' + k)


# ---------------------------------------------------------------- đọc
enum = re.findall(r'^\t(\w+)', io.open(REF + '/src/DredgeAchievementId.cs', encoding='utf8').read(), re.M)
enum = [e for e in enum if e != 'COUNT']
steam = {a['name']: a for a in json.load(io.open(GSE, encoding='utf8'))}

base, dlc = {}, []
for p in sorted(glob.glob(ASSETS + '/AchievementData/**/*.asset', recursive=True)):
    n = os.path.basename(p)[:-6]
    if n == 'ALL_ACHIEVEMENTS' and False:
        pass
    if '/DLC' in p.replace('\\', '/'):
        dlc.append(n); continue
    b, refs, txt = read_asset(p)
    num = int(re.search(r'^  id: (\d+)', txt, re.M).group(1))
    base[n] = (num, decode(b, refs), refs)

# Hull: tên asset Tier{n}Hull -> id web tier-{n}-hull (data/upgrades.js)
for n, (num, c, refs) in base.items():
    if c and c['t'] == 'upgrades':
        c['ids'] = [re.sub(r'Tier(\d)Hull', r'tier-\1-hull', r) for r in c['ids']]

# ---------------------------------------------------------------- biểu tượng mượn (kiểm tồn tại)
ART = os.path.join(HERE, '..', 'art')
ICON = {
    'CATCH_FISH_ROD_1': 'items/rod1', 'CATCH_FISH_NET_1': 'items/net1', 'CATCH_CRABS_POT_1': 'items/pot1',
    'SELL_FISH_VALUE_1': 'items/cod', 'SELL_TRINKETS_VALUE_1': 'items/ring-1', 'DISCARD_FISH': 'items/cod',
    'DEPLETE_FISH_SPOTS': 'items/dredge1', 'CATCH_ALL_REGULAR_FISH': 'ui/sprites/FishIcon',
    'CATCH_ALL_ABERRATIONS': 'ui/sprites/AberratedQuestionMark',
    'COMPLETE_CHAPTER_1': 'items/relic1', 'COMPLETE_CHAPTER_2': 'items/relic2', 'COMPLETE_CHAPTER_3': 'items/relic3',
    'COMPLETE_CHAPTER_4': 'items/relic4', 'COMPLETE_CHAPTER_5': 'items/relic5', 'ENDING': 'items/relic5', 'ENDING_ALT': 'items/relic1',
    'HULL_2': 'ui/sprites/GenericHullUpgradeIcon', 'HULL_3': 'ui/sprites/GenericHullUpgradeIcon', 'HULL_4': 'ui/sprites/GenericHullUpgradeIcon',
    'FULL_CARGO': 'ui/sprites/CargoGrid_Default', 'FULL_EQUIPMENT': 'ui/sprites/FishingEquipmentIcon',
    'ABILITY_FOGHORN': 'ui/sprites/FogHornActionIcon', 'ABILITY_SPYGLASS': 'ui/sprites/SpyglassActionIcon',
    'ABILITY_BAIT': 'ui/sprites/BaitIcon', 'ABILITY_HASTE': 'ui/sprites/HasteActionIcon',
    'ABILITY_MANIFEST': 'ui/sprites/ManifestActionIcon', 'ABILITY_BANISH': 'ui/sprites/BanishActionIcon',
    'ABILITY_ATROPHY': 'ui/sprites/AtrophyActionIcon',
    'COMPLETE_ALL_SIDE_QUESTS': 'items/relic3', 'DISCOVER_ALL_DOCKS': 'ui/sprites/DockMarker', 'SOLVE_ALL_SHRINES': 'ui/sprites/CodShrineInventoryBackground',
    'RESEARCH_RODS': 'items/rod11', 'RESEARCH_NETS': 'items/net3', 'RESEARCH_POTS': 'items/pot7', 'RESEARCH_ENGINES': 'items/engine6',
    'STAT_FISHING_SPEED': 'items/rod15', 'STAT_ENGINE_SPEED': 'items/engine10', 'STAT_LIGHT_STRENGTH': 'items/light2',
    'INTRODUCTIONS': 'ui/sprites/Dockworker_Portrait', 'ALL_ACHIEVEMENTS': 'ui/sprites/Compass',
}
for k, v in ICON.items():
    if not os.path.exists(os.path.join(ART, v + '.webp')):
        raise SystemExit('icon missing: %s -> art/%s.webp' % (k, v))

# ---------------------------------------------------------------- ra
items = []
for n in enum:
    if n not in base:
        continue                                       # DLC_*
    num, cond, refs = base[n]
    s = steam[n]
    hidden = s['hidden'] == '1'
    items.append({'id': n, 'num': num, 'name': s['displayName'], 'desc': s['description'], 'hidden': hidden,
                  'icon': 'art/' + ICON[n] + '.webp', 'cond': cond})
ids = [i['id'] for i in items]
missing = [n for n in enum if n not in ids and not n.startswith('DLC_')]
assert not missing, missing
# ALL_ACHIEVEMENTS đòi đủ các thành tựu liệt kê trong asset (bản gốc: 38, kể cả DLC? in ra để biết)
allc = [i for i in items if i['id'] == 'ALL_ACHIEVEMENTS'][0]['cond']
notin = [i for i in ids if i != 'ALL_ACHIEVEMENTS' and i not in allc['ids']]
extra = [i for i in allc['ids'] if i not in ids]
out = {'order': ids, 'list': {i['id']: i for i in items}, 'dlcSkipped': sorted(dlc, key=enum.index),
       'allAchievementsNotRequired': notin, 'allAchievementsDlcRequired': extra}
s = 'window.DR_ACHIEVEMENTS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + ';\n'
io.open(OUT, 'w', encoding='utf8', newline='\n').write(s)
print('wrote', os.path.normpath(OUT), len(s), 'bytes;', len(items), 'base achievements;', len(dlc), 'DLC skipped')
print('ALL_ACHIEVEMENTS not requiring:', notin, '| DLC required:', extra)
