"""Sinh tools/maps/zones.txt từ bảng gặp Pokémon trên cỏ của PRO.

  python tools/pro/gen_zones.py

Nguồn: D:\\pro-ref\\pokemap\\pro_land_spawns.json (PRO_SPAWNS), ảnh chụp dữ liệu spawn PRO ngày 2026-07-18,
mỗi dòng {Map, Pokemon, MonsterID, Daytime:[sáng, ngày, đêm], MinLVL, MaxLVL, Item, MemberOnly, Tier}.
- Bỏ dòng MemberOnly (trò chơi không có hội viên).
- Tỉ trọng theo Tier: Common 10, Uncommon 4, Rare 1 [ĐỀ XUẤT: PRO không công bố tỉ lệ].
- Buổi: P1.period() có 4 buổi, PRO có 3 ô; morning -> sáng, day và evening -> ngày, night -> đêm
  [ĐỀ XUẤT: chưa thấy nguồn PRO cho buổi chiều].
- Item cầm theo ghi thành chú thích: engine chưa cho Pokémon hoang dã cầm đồ (P1.mon.create đặt item '').
Chạy lại ra cùng kết quả."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('PRO_SPAWNS', r'D:\pro-ref\pokemap\pro_land_spawns.json')
OUT = os.path.join(HERE, '..', 'maps', 'zones.txt')
ZONES = {'route_1_grass': 'Route 1'}          # vùng trong tools/maps/*.txt -> tên map PRO
WEIGHT = {'Common': 10, 'Uncommon': 4, 'Rare': 1}
SLOTS = {'morning': 0, 'day': 1, 'evening': 1, 'night': 2}

rows = json.load(open(SRC, encoding='utf-8'))
out = ['# Sinh bởi tools/pro/gen_zones.py từ bảng spawn trên cỏ của PRO (pro_land_spawns.json, ảnh chụp 2026-07-18).',
       '# Không sửa tay. Dòng: <buổi> dex:tỉ_trọng:cấp_min-cấp_max. Tỉ trọng Common 10 / Uncommon 4 / Rare 1 [ĐỀ XUẤT].',
       '# Pallet Town và Viridian City không có spawn trên cỏ trong PRO.', '']
for zone, pro_map in ZONES.items():
    mons = [r for r in rows if r['Map'] == pro_map and not r['MemberOnly']]
    if not mons:
        raise SystemExit('no PRO spawns for ' + pro_map)
    out.append(f'[zone {zone}] rate=normal')
    for period, slot in SLOTS.items():
        ents = [f"{r['MonsterID']}:{WEIGHT[r['Tier']]}:{r['MinLVL']}-{r['MaxLVL']}"
                for r in sorted(mons, key=lambda r: r['MonsterID']) if r['Daytime'][slot]]
        out.append(period + ' ' + ' '.join(ents))
    held = sorted({f"{r['Pokemon']}={r['Item']}" for r in mons if r['Item']})
    if held:
        out.append('# đồ cầm trong PRO (chưa dùng): ' + ', '.join(held))
    out.append('')
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('wrote', os.path.normpath(OUT))
