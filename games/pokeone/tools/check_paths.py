# -*- coding: utf-8 -*-
"""Kiem tra moi duong dan nhac trong data/sprites.js, data/audio.js, data/gamedata.js co
ton tai tren dia khong (chay sau moi lan rip). Khong sua tep, chi bao cao.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/check_paths.py
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
DATA = os.path.join(GAME, 'data')


def load_p1(fname):
    """Tep data/*.js chi la dong 'P1.TEN = <JSON>;' (xem rip_2d.py/rip_audio.py/rip_data.py) ->
    bat tung dong bang regex roi json.loads truc tiep, khoi can may JS that."""
    path = os.path.join(DATA, fname)
    with io.open(path, encoding='utf-8') as f:
        src = f.read()
    out = {}
    # JSON co the nhieu dong (json.dumps indent=2) -> tim moi 'P1.TEN = ' roi doc het toi
    # dau ';' cuoi truoc 'P1.' tiep theo hoac het tep.
    markers = list(re.finditer(r'^P1\.([A-Z_]+) = ', src, re.M))
    for i, m in enumerate(markers):
        start = m.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(src)
        chunk = src[start:end].rstrip()
        assert chunk.endswith(';'), (fname, m.group(1), chunk[-20:])
        chunk = chunk[:-1]
        try:
            out[m.group(1)] = json.loads(chunk)
        except json.JSONDecodeError:
            # vd P1.CRY_PATH = 'audio/cry/'; (chuoi JS nhay don, khong phai JSON)
            out[m.group(1)] = chunk.strip().strip("'\"")
    return out


def check_paths(paths, label):
    missing = []
    checked = 0
    for p in paths:
        if not p:
            continue
        checked += 1
        full = os.path.join(GAME, p.replace('/', os.sep))
        if not os.path.isfile(full):
            missing.append(p)
    print('%s: %d duong dan, %d thieu' % (label, checked, len(missing)))
    for m in missing[:40]:
        print('  !! thieu', m)
    if len(missing) > 40:
        print('  ... con', len(missing) - 40, 'nua')
    return missing


def main():
    total_missing = 0

    sprites = load_p1('sprites.js')
    paths = []
    pose_groups = {'body_male', 'body_female', 'clothe_male', 'clothe_female',
                   'hair_male', 'hair_female', 'hats'}
    for group, names in sprites['PLAYER_PARTS'].items():
        for n in names:
            if group in pose_groups:
                for suf in ('_1', '_2', '_4', '_5'):
                    paths.append('art/sprite/player/%s/%s%s.png' % (group, n, suf))
            else:
                paths.append('art/sprite/player/%s/%s.png' % (group, n))
    for role, name in sprites['NPC_SPRITES'].items():
        paths.append('art/sprite/npc/%s.png' % name)
    total_missing += len(check_paths(paths, 'sprites.js (player+npc)'))

    poke_paths = []
    for kind in ('big', 'small64', 'small64shiny'):
        for dex in range(1, 252):
            poke_paths.append('art/sprite/poke/%s/%d.png' % (kind, dex))
    for dex in sprites['FOLLOW_ROSTER']:
        poke_paths.append('art/sprite/poke/follow/%d.png' % dex)
        poke_paths.append('art/sprite/poke/follows/%d.png' % dex)
    total_missing += len(check_paths(poke_paths, 'sprites.js (pokemon 2d)'))

    audio = load_p1('audio.js')
    a_paths = list(audio['MUSIC'].values()) + list(audio['SFX'].values())
    a_paths += ['%s%d.ogg' % (audio['CRY_PATH'], dex) for dex in range(1, 252)]
    total_missing += len(check_paths(a_paths, 'audio.js'))

    gd = load_p1('gamedata.js')
    item_imgs = [it.get('img') for it in gd['ITEMS'].values() if it.get('img')]
    total_missing += len(check_paths(item_imgs, 'gamedata.js (item icons)'))

    print()
    if total_missing:
        print('TONG CONG:', total_missing, 'duong dan thieu')
        sys.exit(1)
    else:
        print('TONG CONG: khong thieu duong dan nao')


if __name__ == '__main__':
    main()
