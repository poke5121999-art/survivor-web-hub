# Gộp số thật 8.6.0 thành bảng phẳng cho pha sau (vũ khí, anh hùng, đạn, trùm).
# Cần chạy trước: decode_config.py, dump_localization.py, dump_mb.py weapon.ab bullet.ab hero.ab boss/*.ab --deps
# Chạy: PYTHONIOENCODING=utf-8 python build_tables.py
# Ra (D:\sk86-ref\decoded\): weapons.json, heroes.json, bullets.json, bosses.json, wiki_check.json
import glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dump_mb as M  # noqa: E402

D = r'D:\sk86-ref\decoded'
WIKI = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wiki')


def J(*p):
    return json.load(open(os.path.join(D, *p), encoding='utf-8'))


def save(name, obj):
    json.dump(obj, open(os.path.join(D, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(name, len(obj))


LOC = J('localization_en_vi.json')
CFG = {n: J('config', n + '.json') for n in ('weapons', 'weapons_drop', 'characters', 'skills', 'enemies')}


def loc(term):
    v = LOC.get(term)
    return {'en': v[0], 'vi': v[1]} if v else None


# ---------- Animator + sprite của từng prefab vũ khí (weapon.ab; controller/clip ở common.ab, sprite ở sprite_atlas.ab)
def weapon_visuals():
    env = M.load('weapon.ab')
    M.load('common.ab')
    M.load('sprite_atlas.ab')
    clip_cache = {}

    def clip_info(sf, p):
        o, _ = M.target(sf, p)
        if o is None:
            return None
        k = (id(o.assets_file), o.path_id)
        if k not in clip_cache:
            a = o.read_typetree()
            mc = a['m_MuscleClip']
            clip_cache[k] = {'name': a['m_Name'], 'len': round(mc['m_StopTime'] - mc['m_StartTime'], 4),
                             'events': [[round(e['time'], 4), e['functionName']] for e in a['m_Events']]}
        return clip_cache[k]

    def controller(sf, p):
        o, _ = M.target(sf, p)
        if o is None:
            return None
        d = o.read_typetree()
        if 'm_Clips' in d:  # AnimatorOverrideController
            base = controller(o.assets_file, d['m_Controller']) or {'name': None, 'clips': []}
            over = {}
            for c in d['m_Clips']:
                a, b = clip_info(o.assets_file, c['m_OriginalClip']), clip_info(o.assets_file, c['m_OverrideClip'])
                if a and b:
                    over[a['name']] = b
            return {'name': d['m_Name'], 'base': base['name'],
                    'clips': [over.get(c['name'], c) for c in base['clips']]}
        clips, seen = [], set()
        for cp in d.get('m_AnimationClips', []):
            ci = clip_info(o.assets_file, cp)
            if ci and ci['name'] not in seen:
                seen.add(ci['name']); clips.append(ci)
        return {'name': d['m_Name'], 'clips': clips}

    out = {}
    for sfile in {o.assets_file for o in env.objects}:
        tf = {}
        for o in sfile.objects.values():
            if o.type.name == 'Transform':
                d = o.read_typetree()
                tf[d['m_GameObject']['m_PathID']] = d
        for gpid, t in tf.items():
            if t['m_Father']['m_PathID']:
                continue
            go = sfile.objects[gpid]
            root = go.peek_name()
            info = {'sprite': None, 'animator': None}
            stack = [gpid]
            while stack:
                g = stack.pop(0)
                gobj = sfile.objects.get(g)
                if not gobj:
                    continue
                gd = gobj.read_typetree()
                for c in gd['m_Component']:
                    co = sfile.objects.get(c['component']['m_PathID'])
                    if not co:
                        continue
                    if co.type.name == 'SpriteRenderer' and (info['sprite'] is None or gobj.peek_name() == 'w'):
                        n = M.resolve(sfile, co.read_typetree()['m_Sprite'], 'weapon.ab')
                        if n and gobj.peek_name() != 'gun_point':
                            info['sprite'] = n.split(':', 1)[-1].split('@')[0]
                    if co.type.name == 'Animator' and info['animator'] is None:
                        info['animator'] = controller(sfile, co.read_typetree()['m_Controller'])
                for ch in tf.get(g, {}).get('m_Children', []):
                    cto = sfile.objects.get(ch['m_PathID'])
                    if cto:
                        stack.append(cto.read_typetree()['m_GameObject']['m_PathID'])
            out[root] = info
    return out


STD = {'m_Name', 'isBossWeapon', 'isCreateFromSkill', 'weapon_type', 'weapon_tags', 'audio_clip', 'activate',
       'overrideHandCut', 'item_level', 'item_value', 'grabLocalOffset', 'bulletsInfo', 'deviation', 'consume',
       'consumeChange', 'dmgMultiFactor', 'holdSpeedFactor', 'reloadClipSource', 'ignoreControllerMovePenalty',
       'targetObj', 'weapon_speed', 'atk_move_speed', 'need_lock', 'has_effect', 'is_melee', 'not_forgeable', 'can_use',
       'canDualWielding', 'limitUseInMultiRoom', 'need_set_trigger_start'}


def scalar_extra(d):
    ex = {}
    for k, v in d.items():
        if k in STD:
            continue
        if isinstance(v, (int, float, str)) and not (isinstance(v, str) and (v.startswith('ext:') or len(v) > 80)):
            ex[k] = v
        elif isinstance(v, list) and all(isinstance(x, (int, float)) for x in v) and len(v) <= 16:
            ex[k] = v
    return ex


def weapons():
    mb = J('mb', 'weapon.json')
    vis = weapon_visuals()
    drop = {}
    for r in CFG['weapons_drop'].values():
        drop.setdefault(r['Weapon'], []).append({'group': r['Group'], 'weight': r['Weight']})
    cfg_by_prefab = {v['Path'].split('/')[-1][:-7]: v for v in CFG['weapons'].values()}
    out = {}
    for x in mb:
        d = x['data']
        if 'weapon_type' not in d or x['go'] != x['root'] or x['root'] in out:
            continue
        k = x['root']
        v = vis.get(k, {})
        an = v.get('animator') or {}
        atk = None
        for c in an.get('clips', []):
            n = sum(1 for e in c['events'] if re.search(r'attack|atk|shoot|fire', e[1], re.I))
            if n and c['len'] > 0:
                atk = {'clip': c['name'], 'len': c['len'], 'attackEvents': n}
                break
        ws = d.get('weapon_speed') or 0
        c = cfg_by_prefab.get(k) or {}
        out[k] = {
            'name': loc('weapon/' + k), 'cls': x['cls'], 'weapon_type': d['weapon_type'], 'tags': d.get('weapon_tags'),
            'grade': d.get('item_level'), 'value': d.get('item_value'), 'is_melee': d.get('is_melee'),
            'consume': d.get('consume'), 'deviation': d.get('deviation'), 'weapon_speed': ws,
            'atk_move_speed': d.get('atk_move_speed'), 'dmgMultiFactor': d.get('dmgMultiFactor'),
            'dual': d.get('canDualWielding'), 'forgeable': not d.get('not_forgeable'),
            'bullets': [{'proto': (b.get('bulletProto') or '').split(':', 1)[-1], 'damage': b.get('damage'),
                         'speed': b.get('speed'), 'size': b.get('size'), 'crit': b.get('critic'),
                         'repel': b.get('repel'), 'through': b.get('throughCount')} for b in d.get('bulletsInfo', [])],
            'extra': scalar_extra(d), 'sfx': (d.get('audio_clip') or '').split(':', 1)[-1] or None,
            'sprite': v.get('sprite'), 'animator': an.get('name'), 'atkClip': atk,
            'rps_est': round(ws * atk['attackEvents'] / atk['len'], 3) if atk and ws else None,
            'config': {'price': c.get('Price'), 'materials': c.get('Materials'),
                       'talents': [t.get('talentName') for t in (c.get('TalentList') or [])],
                       'drop': drop.get(k)} if c else None,
        }
    save('weapons.json', out)
    return out


def bullets():
    out = {}
    for x in J('mb', 'bullet.json'):
        r = out.setdefault(x['root'], {'components': []})
        d = {k: v for k, v in x['data'].items() if k != 'm_Name' and not isinstance(v, dict)}
        d = {k: (v.split(':', 1)[-1] if isinstance(v, str) and ':' in v else v) for k, v in d.items()
             if not (isinstance(v, list) and len(v) > 20)}
        r['components'].append({'cls': x['cls'], 'go': x['go'], **d})
    save('bullets.json', out)


def heroes():
    mb = J('mb', 'hero.json')
    out = {}
    for x in mb:
        if x['cls'] != 'RoleAttributePlayer':
            continue
        k, d = x['root'], x['data']
        n = int(k[1:])
        ctl = next((y['cls'] for y in mb if y['root'] == k and re.match(r'C\d+Controller$', y['cls'])), None)
        hand = next((y['cls'] for y in mb if y['root'] == k and y['cls'].startswith('RGHand')), None)
        sk = []
        for i in (1, 2, 3):
            s = CFG['skills'].get(f'{k}/skill {i}')
            if not s:
                continue
            c = (s['Value'] or {}).get('commonSkillData', {}) if isinstance(s['Value'], dict) else {}
            sk.append({'slot': i, 'name': loc(f'Character{n}_skill_{i - 1}_name'),
                       'cd': c.get('cd'), 'duration': c.get('duration'), 'range': c.get('range'),
                       'skillType': c.get('skillType'), 'maxCount': c.get('maxCount'), 'price': c.get('price'),
                       'icon': (c.get('icon') or {}).get('sprite')})
        ch = CFG['characters'].get(k) or {}
        out[k] = {'name': loc(f'Character{n}_name_skin0'), 'controller': ctl, 'hand': hand,
                  'hp': d['max_hp'], 'armor': d['_max_armor'], 'armor_field': d['armor'], 'energy': d['max_energy'],
                  'crit': d['critical'], 'speed': d['speed'], 'speed_rate': d['speed_rate'],
                  'default_buff': d['default_buff'],
                  'config_characters': {kk: ch[kk] for kk in ('Hp', 'Speed', 'Critical', 'MaxEnergy', 'Atk', 'InSkillTime')
                                        if kk in ch} or None,
                  'skills': sk}
    save('heroes.json', dict(sorted(out.items())))
    return out


def bosses():
    out = {}
    for f in sorted(glob.glob(os.path.join(D, 'mb', 'boss__*.json'))):
        b = os.path.basename(f)[6:-5]
        mb = json.load(open(f, encoding='utf-8'))
        for x in mb:
            d = x['data']
            if 'enemy_id' not in d:
                continue
            eid = d['enemy_id']
            attr = next((y['data'] for y in mb if y['root'] == x['root'] and y['go'] == x['go'] and y['cls'] == 'RoleAttribute'), {})
            cfg = CFG['enemies'].get(eid) or {}
            out[eid] = {'bundle': 'boss/' + b, 'prefab': x['root'], 'ai': x['cls'], 'name': loc(eid),
                        'hp_prefab': attr.get('max_hp'), 'speed_prefab': attr.get('speed'),
                        'hp_config': cfg.get('Hp'), 'speed_config': cfg.get('Speed'),
                        'boss_weapon': cfg.get('BossWeapon'), 'level': cfg.get('LevelKey'),
                        'ai_fields': scalar_extra({k: v for k, v in d.items() if k not in ('enemy_id',)}),
                        'components': sorted({y['cls'] for y in mb if y['root'] == x['root']})}
    save('bosses.json', out)


# ---------- đối chiếu wiki
def num(v):
    return (v or {}).get('number') if isinstance(v, dict) else v


def wiki_check(W, H):
    ww = {x['name'].lower(): x for x in json.load(open(os.path.join(WIKI, 'weapons.json'), encoding='utf-8'))}
    rows = []
    for k, w in W.items():
        nm = (w['name'] or {}).get('en', '').lower()
        x = ww.get(nm)
        if not x or not w['bullets'] or k.startswith(('weapon_init', '_')):
            continue
        b = w['bullets'][0]
        pairs = {'damage': (b['damage'], num(x['damage'])), 'energy': (w['consume'], num(x['ammo_cost'])),
                 'crit': (b['crit'], num(x['critical_chance'])), 'spread': (w['deviation'], num(x['accuracy'])),
                 'rps': (w['rps_est'], num(x['rounds_per_second']))}
        rows.append({'prefab': k, 'name': x['name'],
                     'cmp': {f: {'game': a, 'wiki': b_, 'ok': (a is not None and b_ is not None and abs(a - b_) <= max(0.1, 0.1 * abs(b_)))}
                             for f, (a, b_) in pairs.items()}})
    hh = {x['name'].lower(): x for x in json.load(open(os.path.join(WIKI, 'heroes.json'), encoding='utf-8'))}
    hr = []
    for k, h in H.items():
        x = hh.get(((h['name'] or {}).get('en') or '').lower())
        if not x:
            continue
        hr.append({'id': k, 'name': x['name'], 'cmp': {f: {'game': h[g], 'wiki': x[f], 'ok': h[g] == x[f]}
                                                        for f, g in (('hp', 'hp'), ('armor', 'armor'), ('energy', 'energy'), ('crit', 'crit'))}})
    summ = {}
    for f in ('damage', 'energy', 'crit', 'spread', 'rps'):
        v = [r['cmp'][f] for r in rows if r['cmp'][f]['wiki'] is not None]
        summ['weapon_' + f] = f"{sum(1 for c in v if c['ok'])}/{len(v)}"
    for f in ('hp', 'armor', 'energy', 'crit'):
        v = [r['cmp'][f] for r in hr if r['cmp'][f]['wiki'] is not None]
        summ['hero_' + f] = f"{sum(1 for c in v if c['ok'])}/{len(v)}"
    save('wiki_check.json', {'summary': summ, 'weapons': rows, 'heroes': hr})
    print(summ)


if __name__ == '__main__':
    H = heroes()
    bullets()
    bosses()
    W = weapons()
    wiki_check(W, H)
