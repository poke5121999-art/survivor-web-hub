"""Sinh data/sk-audio.js từ: refs.json (tham chiếu AudioClip trong prefab, do build_audio.py scan), encoded.json,
export_index.json và config đã giải mã của agent config86 (D:\\sk86-ref\\decoded).
Chạy: PYTHONIOENCODING=utf-8 python games/soulknight/tools/audio/build_map.py
"""
import os, sys, json, csv, re, collections

sys.stdout.reconfigure(encoding='utf-8')
SK86 = os.environ.get('SK86', r'D:\sk86-ref')
WORK = SK86 + r'\work\audio'
DEC = SK86 + r'\decoded'
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))

enc = json.load(open(WORK + r'\encoded.json', encoding='utf-8'))
where = json.load(open(WORK + r'\export_index.json', encoding='utf-8'))['where']
refs = json.load(open(WORK + r'\refs.json', encoding='utf-8'))

# ---- vai trò của trường tham chiếu (tên trường trong MonoBehaviour) ----
ROLE = {
    'fire': ['audio_clip', 'clip_bullet', 'emit_clip', 'audioClip', 'audioClips', 'attackAudioClip', 'atkClip',
             'shootGrenadeAudioClip', 'specialAttackFireAudioClip', 'audio_clip_mode2', 'clip', 'atk1_cilp',
             'atk2_clip', 'swordAudio2', 'slash2', 'elastic', 'guitarNotes'],
    'hit': ['hit_clip', 'hitClip', 'clip_hit', 'hitAudio', 'master_clip_hit_male', 'reboundSoundEff'],
    'dead': ['clip_dead', 'deadClip', 'clipDead'],
    'skill': ['clip_skill', 'skill_clips', 'skill2_clips', 'skillFx', 'clip_bells', 'boss_clip', 'angry_clip', 'showAudio'],
}
FIELD2ROLE = {f: r for r, fs in ROLE.items() for f in fs}
# Trường trùng nghĩa: chỉ RGSword/ExplodeHammer.clip là tiếng vung/nổ; ExplodeEffectTrigger.audioClip là nổ.
CLS_ROLE = {('ExplodeHammer', 'clip'): 'explode', ('ExplodeEffectTrigger', 'audioClip'): 'explode',
            ('DelayExplode', 'audio_clip'): 'explode', ('AnimAudioPlayer', 'audioClips'): 'anim',
            ('UIWindowShowObject', 'audio_clip'): 'ui', ('RGTransferGate', 'audioClip'): 'portal',
            ('ItemChestBattery', 'activate_clip'): 'open', ('RGMusicManager', 'effect_list'): 'ui',
            ('RGMusicManager', 'other_effects'): 'ui'}


def stored(bundle, orig):
    n = where.get(bundle + '|' + orig)
    return n if n in enc else None


byPrefab = collections.OrderedDict()
for r in refs:
    root = r['root'] or r['go']
    if not root: continue
    clip = stored(r['cb'], r['clip'])
    if not clip: continue
    field = r['f'].lstrip('.').replace('[]', '').split('.')[-1]
    role = CLS_ROLE.get((r['cls'], field)) or FIELD2ROLE.get(field) or 'other'
    d = byPrefab.setdefault(root, {})
    key = role if role != 'other' else field
    lst = d.setdefault(key, [])
    if clip not in lst: lst.append(clip)
for d in byPrefab.values():
    for k, v in list(d.items()):
        d[k] = v[0] if len(v) == 1 else v
    if 'fire' in d and isinstance(d['fire'], list): d['fireAll'] = d['fire']; d['fire'] = d['fire'][0]

# ---- wiki -> prefab vũ khí qua tên tiếng Anh trong localization (weapon/weapon_NNN) ----
loc = json.load(open(DEC + r'\localization_en_vi.json', encoding='utf-8'))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
name2key = collections.defaultdict(list)
for k, v in loc.items():
    m = re.fullmatch(r'weapon/(weapon_\d+(?:_\d+)?)', k)
    if m and v and v[0]: name2key[norm(v[0])].append(m.group(1))
_t = open(GAME + r'\data\sk-wiki.js', encoding='utf-8').read()
wiki = json.JSONDecoder().raw_decode(_t[_t.index('window.SK_WIKI = ') + 17:])[0]
byWeapon, unbridged = {}, []
kindClips = collections.defaultdict(collections.Counter)
for slug, w in wiki['weapons'].items():
    keys = [k for k in name2key.get(norm(w['name']), []) if k in byPrefab and 'fire' in byPrefab[k]]
    if not keys: unbridged.append(slug); continue
    d = dict(byPrefab[keys[0]]); d['prefab'] = keys[0]
    byWeapon[slug] = d
    kindClips[w['kind']][d['fire']] += 1
byKind = {k: c.most_common(1)[0][0] for k, c in kindClips.items()}

# ---- hero c## <-> hero web: khớp (hp, năng lượng, crit) config với wiki ----
chars = list(csv.DictReader(open(DEC + r'\config\characters.csv', encoding='utf-8')))[1:]
byHero = {}
for hid, h in wiki['heroes'].items():
    cand = [c['Key'] for c in chars if float(c['Hp']) == h['hp'] and float(c['Energy']) == h['energy'] and float(c['Critical']) == h['crit']]
    if len(cand) == 1 and cand[0] in byPrefab: byHero[h['folder']] = {'prefab': cand[0], **byPrefab[cand[0]]}
# Hiệp Sĩ trùng thông số với c19 (Beheaded); c00 là nhân vật đầu tiên [ƯỚC LƯỢNG].
if 'c00' in byPrefab: byHero['knight'] = {'prefab': 'c00', 'guess': 1, **byPrefab['c00']}
heroAmbiguous = [h['folder'] for h in wiki['heroes'].values() if h['folder'] not in byHero]

# ---- nhạc: theme -> map (config map_levels.BgmClip); trùm -> enemies.BossBgm ----
mapBgm = {}
for r in csv.DictReader(open(DEC + r'\config\map_levels.csv', encoding='utf-8')):
    m = re.search(r'bgm/([^"]+)\.mp3', r['BgmClip'])
    if m: mapBgm[r['Key']] = m.group(1)
bossBgm = {}
for r in csv.DictReader(open(DEC + r'\config\enemies.csv', encoding='utf-8')):
    if r['BossBgm']: bossBgm[r['Key']] = re.sub(r'\.mp3$', '', r['BossBgm'].split('/')[-1])
THEME_MAP = {'forest': 'map_A_Forest', 'castle': 'map_A_Castle', 'volcano': 'map_B_Volcano', 'glacier': 'map_B_Ice',
             'graveyard': 'map_B_Grave', 'ruins': 'map_C_Ruins', 'icecave': 'map_D_IceCave', 'swamp': 'map_E_Swamp',
             'relic': 'map_F_Relic', 'machinery': 'map_G_MachineryCity', 'aliens': 'map_A_Aliens',
             'halloween': 'map_C_Halloween', 'island': 'map_C_Island'}
# Chương -> nhạc trùm: 1x -> bgm_1High, 2x -> bgm_2High, 3x -> bgm_3High [ĐO: enemies.BossBgm theo LevelKey 1A/2A/3A].
clipfor = lambda n: n if n in enc else None


music = {'lobby': clipfor('bgm_room'),
         'boss': {'1': clipfor('bgm_1High'), '2': clipfor('bgm_2High'), '3': clipfor('bgm_3High')},
         'theme': {t: clipfor(mapBgm.get(m, '')) for t, m in THEME_MAP.items()},
         'season': {'base': clipfor('bgm_multi_room_skin_0'), 'expedition': clipfor('bgm_esc_Scene1'),
                    'expedition4': clipfor('bgm_esc_Scene4'), 'expedition5': clipfor('bgm_esc_Scene5')},
         'byBossPrefab': {b: clipfor(c) for b, c in bossBgm.items() if clipfor(c)}}
music['theme'] = {k: v for k, v in music['theme'].items() if v}

# ---- sự kiện game -> clip ----
c = lambda n: n if n in enc else None
events = {
    'coin': c('fx_coin'), 'pickup': c('fx_pickup'), 'roomLock': c('fx_door'), 'roomClear': c('fx_show_up'),
    'portal': c('fx_transform'), 'uiClick': c('fx_btn1'), 'uiStart': c('fx_btn_start'), 'uiLevelUp': c('fx_btn_levelup'),
    'cdReady': c('fx_cd_ready'), 'error': c('fx_error'), 'chestOpen': c('fx_chestbattery_open'),
    'hpPot': c('fx_healthpot'), 'energy': c('fx_energy'), 'obstacleBreak': c('fx_box_destroy'),
    'enemyHit': c('fx_hit'), 'enemyCrit': c('fx_metal_hit01'), 'enemyKill': c('fx_dead'),
    'enemyFire': c('fx_shoot_e1'), 'enemyMelee': c('fx_laser_sword'),
    'playerHurt': c('fx_hit_p1'), 'shieldHit': c('hit_shield'), 'skill': c('fx_skill'),
    'win': c('fx_applause'), 'lose': c('fx_fail'), 'weaponSwitch': c('fx_gun_draw'), 'reload': c('fx_reload'),
    'shop': c('fx_buy'), 'levelup': c('fx_levelup'),
}
events = {k: v for k, v in events.items() if v}
# Mức chắc chắn của từng sự kiện: 'do' = đo trực tiếp trong prefab/config; 'guess' = đoán theo tên clip.
DO = ['coin', 'pickup', 'roomLock', 'portal', 'uiClick', 'cdReady', 'error', 'enemyFire', 'enemyMelee', 'enemyKill',
      'playerHurt', 'chestOpen']
confidence = {k: ('do' if k in DO else 'guess') for k in events}

clips = {n: {'file': m['file'], 'dur': m['dur'], **({'music': 1} if m['music'] else {})} for n, m in enc.items()}
out = {'clips': clips, 'byPrefab': byPrefab, 'byWeapon': byWeapon, 'byKind': byKind, 'byHero': byHero,
       'events': events, 'confidence': confidence, 'music': music}
js = '// SINH TỰ ĐỘNG bởi tools/audio/build_map.py — không sửa tay. Xem tools/audio/README.md.\n' \
     'window.SK_AUDIO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(GAME + r'\data\sk-audio.js', 'w', encoding='utf-8').write(js)
print('clips', len(clips), 'byPrefab', len(byPrefab), 'byWeapon', len(byWeapon), '/', len(wiki['weapons']),
      'unbridged', len(unbridged), 'byHero', len(byHero), 'ambiguous', heroAmbiguous)
print('byKind', byKind)
print('music', json.dumps(music['theme']), music['boss'], music['lobby'])
print('bytes', len(js))
