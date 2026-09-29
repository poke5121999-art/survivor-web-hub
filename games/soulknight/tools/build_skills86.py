# Sinh data/sk-skills86.js: số thật kỹ năng + nội tại của 42 nhân vật Soul Knight 8.6 cho js/skills.js.
# Chạy: PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_skills86.py
# Nguồn (ngoài git, xem tools/config86/README.md):
#   D:\sk86-ref\decoded\heroes.json, config/skills.json, localization_en_vi.json, mb/{hero,bullet,weapon}.json
#   D:\sk86-ref\work\skills\mb\common.json  = dump_mb.py common.ab --out D:\sk86-ref\work\skills (tự chạy nếu thiếu)
# Bẫy đã gặp:
#   - Thư mục skin ↔ cNN: heroes[thư mục].s0.index của sk-data.js chính là N (knight = c00, astrologist = c32...).
#     sk-audio.js cũ ghép hero theo (máu, năng lượng, crit) nên đoán sai nhiều (astrologist → c12, doctor → c03).
#   - default_buff là enum buff: nội tại = localization Buff_name_(default_buff − 1); ≥ 1000 là thiên phú riêng.
#   - Nhiều prefab trùng tên trong common.ab với số khác nhau (buff_fire 15/0.5 s và 3/0.5 s): giữ cả mảng, runtime
#     chọn theo elementalType.
#   - Số sát thương kỹ năng thường do mã IL2CPP truyền vào BulletInfo; trường damage của prefab đạn chỉ đúng khi
#     prefab tự gây sát thương (Explode*, BulletGas*, BloodHoleTrigger, BulletThunder.atk, pet controller).
#   - Sói của Tu Sĩ Rừng: sprite nằm ở skin/pet/wolf_{1,2}/skin_0.ab, hai bundle cùng tên sprite wolf_0..15;
#     lấy bằng clip wolf_0_* / wolf_1_* (tools/extra/skills.json) chứ đừng tra theo tên sprite.
import io, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
DEC = r'D:\sk86-ref\decoded'
WORK = r'D:\sk86-ref\work\skills'
OUT = os.path.join(GAME, 'data', 'sk-skills86.js')


def jl(p):
    return json.load(io.open(p, encoding='utf-8'))


def slug(s):
    return re.sub(r'^_+|_+$', '', re.sub(r'[^a-z0-9]+', '_', str(s or '').lower()))


def base(path):
    # "RGPrefab/Effect/effect_c1_skill.prefab" -> effect_c1_skill ; "RGSound/effect/fx_skill_c1.mp3" -> fx_skill_c1
    return re.sub(r'\.(prefab|mp3|wav|ogg|png)$', '', str(path).split('/')[-1]) if path else None


def pptr_name(v):
    # "GameObject:buff_fire@common" -> buff_fire ; "ext:cab-..#.." -> None
    if not isinstance(v, str) or v.startswith('ext:') or ':' not in v:
        return None
    return v.split(':', 1)[1].split('@')[0].split('<')[0]


def slim(d, depth=0):
    """Giữ số, chuỗi ngắn, tên PPtr, dict nhỏ; bỏ mảng lớn, màu, sự kiện Unity."""
    out = {}
    for k, v in d.items():
        if k.startswith('m_') or k in ('serializationData', 'OnAttackStart', 'onDead', 'onBuffEnd', 'onBuffStart',
                                        'onTeammateReboundEvent', 'onBulletHit', 'onExplodeStartEvent', 'onInit',
                                        'shadowColor', 'onReloadGun', 'onAttack'):
            continue
        if isinstance(v, bool) or isinstance(v, (int, float)):
            out[k] = round(v, 4) if isinstance(v, float) else v
        elif isinstance(v, str):
            if v.startswith('ext:'):
                continue
            if ':' in v and not v.startswith('{') and not v.startswith('['):
                out[k] = '@' + (pptr_name(v) or '')
            elif v.startswith('{') or v.startswith('['):
                try:
                    pv = json.loads(v)
                    if isinstance(pv, dict) and depth < 2:
                        out[k] = slim(pv, depth + 1)
                except Exception:
                    pass
            elif len(v) < 80:
                out[k] = v
        elif isinstance(v, dict) and depth < 2:
            if set(v.keys()) <= {'r', 'g', 'b', 'a'}:
                continue
            if set(v.keys()) <= {'x', 'y', 'z'}:
                out[k] = [round(v.get('x', 0), 4), round(v.get('y', 0), 4)]
                continue
            s = slim(v, depth + 1)
            if s:
                out[k] = s
        elif isinstance(v, list) and len(v) <= 12 and all(isinstance(x, (int, float)) for x in v):
            out[k] = v
        elif isinstance(v, list) and len(v) <= 12 and all(isinstance(x, dict) for x in v) and depth < 2:
            if all(set(x.keys()) <= {'r', 'g', 'b', 'a'} for x in v):
                continue
            out[k] = [slim(x, depth + 1) for x in v]
        elif isinstance(v, list) and len(v) <= 12 and all(isinstance(x, str) for x in v):
            names = [pptr_name(x) if ':' in x else x for x in v]
            if all(names):
                out[k] = names
    return out


# Prefab mà js/skills.js tra số [ĐO]. Thêm tên vào đây khi cần trường mới.
PREFABS = [
    'battery', 'battery_intercept', 'bullet_bat', 'thunder', 'thunder_child', 'buff_fire', 'buff_ice', 'buff_posion',
    'buff_ele', 'buff_dizzy', 'buff_stealth', 'buff_nightmare', 'buff_plague', 'buff_armor', 'Gas_Alchemist_0',
    'bullet_frost', 'Fire2', 'explode_hit_enemy', 'explode_ice_box', 'bullet_follow_ice_skill', 'bullet_fire_storm',
    'bullet_209', 'bullet_84_blood', 'weapon_skill_officer', 'weapon_skill_paladin', 'wolf1_druid', 'wolf2_druid',
    'nec_ghost_hand', 'nec_spider', 'nec_fireball', 'NecFireGas', 'explode_energy2', 'bullet_c09', 'arrow_rain',
    'bullet_airstrike', 'bullet_airstrike_fire', 'explode_fire', 'bullet_hammer', 'taoist_gravity',
    'effect_vampire_body', 'explode_blast_out_vampire', 'shield', 'sword_2_5_assassin', 'npc_char_phantom',
    'funnel_robot_3', 'funnel_robot_4', 'effect_chaos', 'bullet_taoist_sword', 'bullet_8_revolver_skill', 'bullet_14',
    'bullet_shield_jump', 'explode_poison', 'lightning_0', 'Holy_light_c11', 'bullet_bottle_0_enhance',
    'bullet_botton_gas', 'bullet_botton_explode', 'bullet_botton_frost', 'explode_hit_enemy_nec', 'explode_no_smoke',
    'sword_dash', 'skill_slash', 'c10_skill_atk', 'bullet_12', 'bullet_25', 'fireball_fairy', 'Gas_Hit_Enemy',
    'Gas_Hit_Enemy_enhance', 'buff_gas_1', 'buff_gas_2', 'buff_gas_3', 'explode_hit_enemy_gas', 'c13',
]
SKIP_CLS = {'AutoChangeSkin', 'RGNetBehaviour', 'DerivativeSkinChanger', 'CollisionNormalPet', 'DecorateCallback',
            'FixAngle', 'RandomSprite', 'DOTweenAnimation', 'DOTweenVisualManager', 'ColdDownAudioPlayer',
            'IgnoreNetBehaviour', 'TrailSortingLayer', 'ShowRandomChild', 'TransformLocker', 'HSVShader',
            'ReboundBuffEffector', 'AttackTalk', 'SpriteAnimation'}


def main():
    common = os.path.join(WORK, 'mb', 'common.json')
    if not os.path.exists(common):
        subprocess.check_call([sys.executable, os.path.join(HERE, 'config86', 'dump_mb.py'), 'common.ab', '--out', WORK])
    heroes = jl(os.path.join(DEC, 'heroes.json'))
    cfg = jl(os.path.join(DEC, 'config', 'skills.json'))
    L = jl(os.path.join(DEC, 'localization_en_vi.json'))
    mb_hero = jl(os.path.join(DEC, 'mb', 'hero.json'))

    # Thư mục skin <-> cNN: sk-data.js heroes[thư mục].s0.index = số N của cNN [ĐO CharacterSprites].
    txt = io.open(os.path.join(GAME, 'data', 'sk-data.js'), encoding='utf-8').read()
    m = re.search(r'window\.SK_DATA = (\{.*\});?\s*$', txt, re.S)
    skd = json.loads(m.group(1).rstrip(';'))
    folder_of = {}
    for f, h in skd['heroes'].items():
        folder_of['c%02d' % h['s0']['index']] = f

    ctrl = {}
    for x in mb_hero:
        if re.match(r'C\d\dController$', x['cls']):
            ctrl[x['root']] = slim(x['data'])
        if x['cls'] == 'C29SkillSetting':
            ctrl.setdefault('_c29', {}).update(slim(x['data']))

    out = {'v': time.strftime('%Y%m%d%H%M'), 'heroes': {}, 'mb': {}}
    for c, h in heroes.items():
        f = folder_of.get(c)
        if not f:
            print('! không có thư mục skin cho', c)
            continue
        n = int(c[1:])
        buff = h.get('default_buff')
        # default_buff là enum buff; mục 1..41 ứng khoá localization Buff_name_(buff-1) [ĐO: Knight 6 -> Buff_05 Sturdy
        # Shield, Rogue 1 -> Buff_00 Piercing Crit, Berserker 32 -> Buff_31 Rapid Fire]. Mục >= 1000 là thiên phú riêng.
        pk = 'Buff_name_%02d' % (buff - 1) if buff and buff < 1000 else None
        pinfo = 'Buff_info_%02d' % (buff - 1) if pk else None
        cc = ctrl.get(c, {})
        rec = {
            'c': c, 'name': h['name'], 'ctrl': h.get('controller'),
            'clipSkill': (cc.get('clip_skill') or '@')[1:] or None, 'clipHit': (cc.get('clip_hit') or '@')[1:] or None,
            'passive': {'buff': buff, 'en': L.get(pk, [None, None])[0] if pk else None,
                        'vi': L.get(pk, [None, None])[1] if pk else None,
                        'info': L.get(pinfo, [None, None])[1] if pinfo else None},
            'ctrlFields': {k: v for k, v in cc.items() if k not in ('clip_skill', 'clip_hit', 'awake', 'dead', 'p_index')},
            'skills': []
        }
        for s in h['skills']:
            key = '%s/skill %d' % (c, s['slot'])
            v = cfg.get(key, {}).get('Value', {})
            cd = v.get('commonSkillData', {})
            skin = v.get('skillSkinData', {}).get('skinDataList')
            skin0 = skin[0] if isinstance(skin, list) and skin else {}
            fx = []

            def walk(o):
                if isinstance(o, dict):
                    for kk, vv in o.items():
                        if kk == 'gameObject' and vv:
                            fx.append(base(vv))
                        else:
                            walk(vv)
                elif isinstance(o, list):
                    for vv in o:
                        walk(vv)
            walk(skin0)
            aud = v.get('skillSkinData', {}).get('audioClipList')
            a0 = aud[0] if isinstance(aud, list) and aud else None
            i = s['slot'] - 1
            rec['skills'].append({
                'slot': s['slot'], 'id': slug(s['name']['en']), 'en': s['name']['en'].strip(), 'vi': s['name']['vi'],
                'info': ((L.get('Character%d_skill_%d_info' % (n, i)) or [None, ''])[1] or '').replace('\\n', '\n') or None,
                'cd': s['cd'], 'dur': s['duration'], 'range': s['range'], 'max': s['maxCount'], 'type': s['skillType'],
                'icon': cd.get('icon', {}).get('sprite'),
                'sfx': [base(x.get('audioClip')) for x in cd.get('audioClipList', []) if x.get('audioClip')],
                'sfxSkin0': base(a0.get('audioClip')) if a0 and a0.get('audioClip') else None,
                'objs': [base(x.get('gameObject')) for x in cd.get('objectList', []) if x.get('gameObject')],
                'fx': [x for x in fx if x],
                'args': cd.get('descriptionArgs'),
                'skin0': slim(skin0) if isinstance(skin0, dict) else None,
            })
        out['heroes'][f] = rec

    # Số của prefab đạn / thú / hiệu ứng mà kỹ năng dùng: {prefab: {Lớp: trường}}; tên trùng mà số khác thì giữ mảng.
    srcs = [jl(common), jl(os.path.join(DEC, 'mb', 'bullet.json')), jl(os.path.join(DEC, 'mb', 'weapon.json')), mb_hero]
    want = set(PREFABS)
    for src in srcs:
        for x in src:
            r = x['root']
            if r not in want or x['cls'] in SKIP_CLS:
                continue
            d = slim(x['data'])
            if not d:
                continue
            slot = out['mb'].setdefault(r, {})
            k = x['cls'] if x['path'] == r else x['cls'] + '@' + x['path'][len(r) + 1:]
            if k in slot:
                cur = slot[k] if isinstance(slot[k], list) else [slot[k]]
                if d not in cur:
                    cur.append(d)
                slot[k] = cur if len(cur) > 1 else cur[0]
            else:
                slot[k] = d
    miss = sorted(want - set(out['mb']))
    if miss:
        print('! không thấy MB:', miss)

    js = ('// SINH TỰ ĐỘNG bởi tools/build_skills86.py từ bản cài Soul Knight 8.6.0 — không sửa tay.\n'
          'window.SK_SKILLS86 = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
    print('ghi', OUT, len(js) // 1024, 'KB,', len(out['heroes']), 'nhân vật,', len(out['mb']), 'prefab')


if __name__ == '__main__':
    main()
