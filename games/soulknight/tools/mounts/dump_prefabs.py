# -*- coding: utf-8 -*-
"""Đọc prefab thú cưỡi + lính thuê từ bundle gốc 8.6 -> tools/mounts/prefabs.json (bản chụp để build_mounts.py chạy lại không cần bundle).

Chạy:  cd games/soulknight/tools && ~/sk86-ref/venv/bin/python mounts/dump_prefabs.py
Mỗi prefab: {hp, speed, speedRate, defence, itemValue, critical, atk_cd, talk_item_value, collider_damage, weapons:[{name, damage, consume, itemValue, weapon_type, speed}]}
(duyệt cây GameObject; thành phần MonoBehaviour như mdump.py)
"""
import io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from skrip import Rip  # noqa: E402

MECH = ['m_mech_%d' % i for i in range(8)] + ['m_mech_9', 'm_mech_coin', 'm_mech_engineer', 'm_mecha_normal_b',
        'm_mecha_normal_d', 'm_mecha_normal_e', 'm_mecha_normal_2s']
CREAT = ['mhorse', 'micemonkey', 'mdungbeetle', 'm_morph', 'mcloud', 'msword', 'mtao_sword']
SPECIAL = {'mboar': 'mount/boar', 'mboar2': 'mount/boar2', 'mcristal': 'mount/mcristal',
           'mcristal_gold': 'mount/mcristalgold', 'mspider': 'mount/spider', 'mvaken': 'mount/varkolyn', 'mbear': 'mount/bear'}
WANT = {}   # path -> (id, bundle patterns)
for m in MECH + CREAT:
    WANT['assets/rgprefab/mount/%s.prefab' % m] = (m, ['common'])
for n in range(1, 14):
    WANT['assets/rgprefab/pet/mercenary/npc_%02d.prefab' % n] = ('npc_%02d' % n, ['levelcommon'])
WANT['assets/level/others/npc_07_mad.prefab'] = ('npc_07_mad', ['levelcommon'])


def walk(f, pid, out):
    ob = f.objects.get(pid)
    if ob is None or ob.type.name != 'GameObject':
        return
    g = ob.read_typetree()
    for c in g['m_Component']:
        p = c['component']['m_PathID']
        co = f.objects.get(p)
        if co is None:
            continue
        t = co.type.name
        if t == 'MonoBehaviour':
            try:
                tt = co.read_typetree()
            except Exception:
                continue
            out.append((g['m_Name'], tt))
        elif t == 'Transform':
            for ch in co.read_typetree()['m_Children']:
                cp = f.objects.get(ch['m_PathID'])
                if cp is not None:
                    walk(f, cp.read_typetree()['m_GameObject']['m_PathID'], out)


def summarize(comps):
    r = {'weapons': []}
    for name, tt in comps:
        if 'max_hp' in tt:
            r['hp'] = tt['max_hp']; r['speed'] = tt.get('speed'); r['critical'] = tt.get('critical', 0)
        for k in ('defence', 'itemValue', 'speedRate', 'atk_cd', 'min_follow_distance', 'max_follow_distance'):
            if k in tt and k not in r:
                r[k] = tt[k]
        if 'talk_string' in tt:
            r['talk_item_value'] = tt.get('item_value', 0)
        if 'damageInterval' in tt and 'damage' in tt:
            r['collider_damage'] = tt['damage']
        if 'bulletsInfo' in tt and tt['bulletsInfo']:
            b = tt['bulletsInfo'][0]
            r['weapons'].append({'name': name, 'damage': b.get('damage'), 'critic': b.get('critic'), 'consume': tt.get('consume', 0),
                                 'itemValue': tt.get('item_value'), 'weapon_type': tt.get('weapon_type'), 'speed': tt.get('weapon_speed')})
        elif 'weapon' == name and 'atk' in tt:
            r['weapons'].append({'name': name, 'damage': tt['atk'], 'weapon_type': 0})
    return r


def main():
    rip = Rip(bundles=[])
    res = {}
    for path, (pid, pats) in WANT.items():
        for cab in rip.cabs(*pats):
            f = rip.files[cab]
            for o in list(f.objects.values()):
                if o.type.name != 'AssetBundle':
                    continue
                for p, info in rip.tree(cab, o)['m_Container']:
                    if p == path:
                        out = []
                        walk(f, info['asset']['m_PathID'], out)
                        res[pid] = summarize(out)
    # thú cưỡi sinh vật bundle riêng
    for pid, bun in SPECIAL.items():
        for cab in rip.cabs(bun):
            f = rip.files[cab]
            for o in list(f.objects.values()):
                if o.type.name != 'AssetBundle':
                    continue
                for p, info in rip.tree(cab, o)['m_Container']:
                    if p.endswith('/%s.prefab' % pid):
                        out = []
                        walk(f, info['asset']['m_PathID'], out)
                        res[pid] = summarize(out)
    with io.open(os.path.join(HERE, 'prefabs.json'), 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(len(res), 'prefab')


main()
