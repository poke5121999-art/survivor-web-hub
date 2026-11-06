# -*- coding: utf-8 -*-
"""build_units.py -- doc unit_map (rip.py) + data/tables.js de sinh VD.ASSETS.units (spine + skin +
kich thuoc va cham) cho nhan vat/quai/npc, va boc them spine cho npc chua co trong art/spine/.
Chay SAU khi build_data.py va rip.py spine/sector da chay it nhat 1 lan.
    PYTHONIOENCODING=utf-8 python build_units.py
"""
import io, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rip
import vd_common as vd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')


def load_T():
    text = io.open(os.path.join(DATA, 'tables.js'), encoding='utf-8').read()
    m = re.search(r'VD\.T = (\{.*\});\s*$', text, re.S)
    return json.loads(m.group(1))


def load_manifest():
    return json.load(open(os.path.join(os.path.dirname(__file__), 'manifest.json'), encoding='utf-8'))


def main():
    T = load_T()
    m = load_manifest()
    char_ids = set(m['characters'])
    mon_ids = set(m['monsters'])
    npc_ids = {r['Id'] for r in T.get('Npc', []) if 'Id' in r}
    all_ids = char_ids | mon_ids | npc_ids

    print('unit_map cho %d id (char=%d mon=%d npc=%d)...' % (len(all_ids), len(char_ids), len(mon_ids), len(npc_ids)))
    um = rip.build_unit_map(all_ids)
    print(' -> %d id co prefab' % len(um))

    # ------ skeleton base name (X_SW_SkeletonData / X_NW_SkeletonData -> X) ------
    def base_names(info):
        names = set()
        for s in info['skels']:
            sda = s.get('sda')
            if sda:
                names.add(re.sub(r'_(SW|NW)_SkeletonData$', '', sda))
        return sorted(names)

    # ------ skin cho nhan vat: CharacterSkin (CharacterId->Id) -> CharacterSkinPreset dau tien ----
    char_by_id = {r['Id']: r for r in T.get('Character', [])}
    cskin_by_char = {r['CharacterId']: r['Id'] for r in T.get('CharacterSkin', [])}
    presets_by_cskin = {}
    for r in T.get('CharacterSkinPreset', []):
        presets_by_cskin.setdefault(r['CharacterSkinId'], []).append(r)

    def char_skins(cid):
        crow = char_by_id.get(cid)
        cskin_id = cskin_by_char.get(cid)
        presets = presets_by_cskin.get(cskin_id, []) if cskin_id else []
        parts = []
        if presets:
            p = presets[0]
            if p.get('SkinBaseId', -1) not in (-1, None):
                parts.append('body/skinbase_%s' % p['SkinBaseId'])
            if p.get('EyeSkinId', -1) not in (-1, None):
                parts.append('body/eye_%s' % p['EyeSkinId'])
            if p.get('HairSkinId', -1) not in (-1, None):
                parts.append('body/hair_%s' % p['HairSkinId'])
            if p.get('CostumeSkinId', -1) not in (-1, None):
                parts.append('body/costume_%s' % p['CostumeSkinId'])
            if p.get('AccSkinId', -1) not in (-1, None):
                parts.append('acc/%s' % p['AccSkinId'])
        if crow and crow.get('DefaultWeaponId'):
            parts.append('weapon/%s' % crow['DefaultWeaponId'])
        return parts

    units = {}
    missing = []
    for uid in sorted(all_ids):
        info = um.get(uid)
        if not info or not info['skels']:
            missing.append(uid)
            continue
        names = base_names(info)
        spine_name = names[0] if names else None
        entry = {
            'spine': spine_name,
            'scale': info.get('scale'),
            'radius': info.get('radius'),
            'height': info.get('height'),
            'shadow': info.get('shadowRadius'),
        }
        if uid in char_ids:
            entry['skins'] = char_skins(uid)
        else:
            sk = info['skels'][0].get('skin')
            entry['skins'] = [sk] if sk else []
        units[str(uid)] = entry

    print('units resolved:', len(units), '  khong co prefab/spine:', len(missing))
    if missing:
        print('  thieu (id):', missing[:40], '...' if len(missing) > 40 else '')

    # ------ boc spine con thieu (chu yeu NPC) ------
    have_spine_dirs = set(os.listdir(os.path.join(ROOT, 'art', 'spine'))) if os.path.isdir(os.path.join(ROOT, 'art', 'spine')) else set()
    need_names = sorted({e['spine'] for e in units.values() if e['spine'] and e['spine'] not in have_spine_dirs})
    if need_names:
        print('boc them %d bo spine con thieu:' % len(need_names), need_names)
        out_root = os.path.join(ROOT, 'art', 'spine')
        rip.rip_spine_names(need_names, out_root)

    # ------ ghi tools/units.json (nguon cho build_assets.py) ------
    out_p = os.path.join(os.path.dirname(__file__), 'units.json')
    json.dump({'units': units, 'missing': missing}, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('->', out_p)


if __name__ == '__main__':
    main()
