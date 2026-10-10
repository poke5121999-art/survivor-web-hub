# -*- coding: utf-8 -*-
"""57 thú cưng (prefab pet0..pet56, common.ab › rgprefab/pet/roles) -> data/sk-pets.js.

Chạy (sau build_sk.py, cần data/sk-data.js có prefab pet0..pet56 và $SK86/decoded/localization_en_vi.json):
    PYTHONIOENCODING=utf-8 ~/sk86-ref/venv/bin/python games/soulknight/tools/pets/build_pets.py

window.SK_PETS = {order: [petN...], pets: {petN: {vi, en, skill: {vi, en, desc, descEn}, cls, ctl: {trường Controller},
attr: {RoleAttributePet}}}}. Tên và kỹ năng là chữ chính thức (Pet_name_N, pet_N_skill_0_name/desc).
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
import skrip  # noqa: E402

LOC = os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json')
DATA = os.path.join(GAME, 'data', 'sk-data.js')
OUT = os.path.join(GAME, 'data', 'sk-pets.js')
WIKI = os.path.join(TOOLS, 'wiki', 'pets.json')
# Độ thân mật tối đa [WIKI Pets]: 240; Pepper (pet34) 300, Purpur (pet30) và Pochi (pet31) 180.
AFF_MAX = {'pet34': 300, 'pet30': 180, 'pet31': 180}
# Cá Khô: wiki chỉ ghi "Fish Chips" trơn cho Panda (không có số) -> 5 như các con còn lại [ƯỚC LƯỢNG].
FISH_DEFAULT = 5


def unlock_of(w, lock_vi):
    """Chuỗi mở khoá trên wiki -> {kind, cost, text}. kind: free|gems|fish|achievement|event|season|none."""
    u = (w.get('unlock') or '').strip()
    low = u.lower()
    if low.startswith('unlocked by default'):
        return {'kind': 'free', 'cost': 0, 'text': ''}
    if w.get('gems'):
        return {'kind': 'gems', 'cost': int(w['gems']), 'text': ''}
    m = re.match(r'^(\d+)?\s*fish chips?$', low)
    if m:
        return {'kind': 'fish', 'cost': int(m.group(1) or FISH_DEFAULT), 'text': ''}
    if low.startswith('achievement'):
        return {'kind': 'achievement', 'cost': 0, 'text': lock_vi or ''}
    if low.startswith('season'):
        return {'kind': 'season', 'cost': 0, 'text': ''}
    if low in ('unavailable', ''):
        return {'kind': 'none', 'cost': 0, 'text': ''}
    return {'kind': 'event', 'cost': 0, 'text': ''}   # Event / Community Event / Fishing pet: chưa có hệ thống tương ứng
KEEP = (int, float, bool, str)


def main():
    loc = json.load(io.open(LOC, encoding='utf-8'))
    src = io.open(DATA, encoding='utf-8').read()
    D = json.loads(re.search(r'window\.SK_DATA = (.*?);\n', src, re.S).group(1))
    wiki = json.load(io.open(WIKI, encoding='utf-8'))
    pets, order = {}, []
    for n in range(57):
        pid = 'pet%d' % n
        root = (D['prefabs'].get(pid) or [None])[0]
        if not root:
            continue
        mbs = root.get('mbs') or {}
        cls = next((k for k in mbs if re.match(r'^Pet\w*Controller$', k)), None) or \
            next((k for k in mbs if k.endswith('Controller')), None)
        name = loc.get('Pet_name_%d' % n) or ['', '']
        sk_n = loc.get('pet_%d_skill_0_name' % n) or ['', '']
        sk_d = loc.get('pet_%d_skill_0_desc' % n) or ['', '']
        ctl = {k: v for k, v in (mbs.get(cls) or {}).items() if isinstance(v, KEEP)}
        attr = {k: v for k, v in (mbs.get('RoleAttributePet') or {}).items() if isinstance(v, KEEP)}
        w = wiki.get(pid) or {}
        lock = (loc.get('Pet_name_%d_lock' % n) or ['', ''])[1]
        food = [x.strip() for x in (w.get('food') or '').split(',') if x.strip() and x.strip() != 'None']
        pets[pid] = {'unlock': unlock_of(w, lock), 'food': food, 'affMax': AFF_MAX.get(pid, 240), 'vi': name[1] or name[0], 'en': name[0], 'skill': {'vi': sk_n[1], 'en': sk_n[0], 'desc': sk_d[1],
                     'descEn': sk_d[0]}, 'cls': cls, 'ctl': ctl, 'attr': attr}
        order.append(pid)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/pets/build_pets.py — không sửa tay.\n')
        f.write('window.SK_PETS = ' + json.dumps({'order': order, 'pets': pets}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('pets', len(pets), 'không tên', [p for p, v in pets.items() if not v['vi']],
          'không kỹ năng', [p for p, v in pets.items() if not v['skill']['vi']])


if __name__ == '__main__':
    main()
