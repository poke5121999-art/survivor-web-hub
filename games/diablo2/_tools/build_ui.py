# -*- coding: utf-8 -*-
"""Build the Diablo II UI art, item icons, sound effects and music for games/diablo2.

Writes (all under games/diablo2/assets/):
    ui.js                 window.D2_UI manifest (see the contract in brain/plans/diablo2-d2r.md)
    img/ui_<n>.webp       UI panels, buttons, cursors, skill icons  (units palette)
    img/inv_<n>.webp      inventory pictures of items
    sfx/*.ogg             mono 22050 Hz Vorbis, keyed by sounds.txt Sound name in ui.js
    music/*.ogg           stereo 44.1 kHz Vorbis

Rerunnable and deterministic: atlases and ui.js are rebuilt every run, ogg files already on
disk are kept (pass --force to re-encode, needed after changing ENC_* below).
Env D2R_DATA overrides the extracted data root.  Python 3.8 + numpy + Pillow, ffmpeg on PATH.
"""
from __future__ import print_function

import io
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2fmt  # noqa: E402
import d2pack  # noqa: E402

GAME = os.path.dirname(HERE)
ASSETS = os.path.join(GAME, 'assets')
IMG_DIR = os.path.join(ASSETS, 'img')
SFX_DIR = os.path.join(ASSETS, 'sfx')
MUS_DIR = os.path.join(ASSETS, 'music')
SRC = os.environ.get('D2R_DATA', 'D:/d2r-ref/fs/data/data')
G = SRC + '/global'
BS = chr(92)

FORCE = '--force' in sys.argv
CELL = 29                       # inventory.txt gridBoxWidth; one item cell in px
LEVELREQ_MAX = 30
SKILL_REQLEVEL_MAX = 18
ENC_SFX = ['-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '2']
ENC_MUSIC = ['-ac', '2', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '2']

# Music kept for budget (18 MB): crypt (271 s) and monastery (308 s) are Act I levels past
# Den of Evil / the scope of the remake, so they are left out.
MUSIC = [
    ('town1', 'music/act1/town1.flac'),
    ('wild', 'music/act1/wild.flac'),
    ('cave', 'music/act1/caves.flac'),
    ('denofevil', 'music/act1/denofevilaction.flac'),
    ('bloodraven', 'music/act1/bloodravenresolution.flac'),
    ('andariel', 'music/act1/andarielaction.flac'),
    ('intro', 'music/introedit.flac'),
]

SKILL_ICON_FILES = {'AM': 'amskillicon', 'AS': 'asskillicon', 'BA': 'baskillicon',
                    'DR': 'drskillicon', 'NE': 'neskillicon', 'PA': 'paskillicon',
                    'SO': 'soskillicon', 'WA': 'waskillicon', 'GEN': 'skillicon'}
# skilltree backs: skltree_<letter>_back.dc6 (a, b, d, i, n, p, s, w) -> class code
SKILLTREE_FILES = {'AM': 'a', 'BA': 'b', 'DR': 'd', 'AS': 'i', 'NE': 'n', 'PA': 'p',
                   'SO': 's', 'WA': 'w'}

used_dc6 = []   # report: every DC6 read for the UI atlas


# ---------------------------------------------------------------- tables

def tab(name):
    with io.open('%s/excel/%s.txt' % (G, name), encoding='latin-1', newline='') as f:
        lines = f.read().split('\n')
    head = lines[0].rstrip('\r').split('\t')
    rows = []
    for l in lines[1:]:
        l = l.rstrip('\r')
        if not l.strip():
            continue
        p = l.split('\t')
        p += [''] * (len(head) - len(p))
        rows.append(dict(zip(head, p)))
    return rows


def num(s, d=0):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return d


# ---------------------------------------------------------------- dc6 / atlas helpers

PAL = d2fmt.load_palette(G + '/palette/units/pal.dat')
_dc6 = {}


def dc6(rel, track=True):
    """rel is relative to global/ (e.g. 'ui/panel/invchar6.dc6') -> flat list of frames."""
    if rel not in _dc6:
        with open('%s/%s' % (G, rel), 'rb') as f:
            d = d2fmt.read_dc6(f.read())
        _dc6[rel] = [fr for row in d['frames'] for fr in row]
        if track:
            used_dc6.append(rel)
    return _dc6[rel]


class Sheet(object):
    """Atlas wrapper: caches (file, frame, anchor mode) -> rect so shared frames pack once."""

    def __init__(self, name):
        self.atlas = d2pack.Atlas(name, IMG_DIR, 'assets/img')
        self.cache = {}

    def rect(self, rel, i, hot=False, track=True):
        key = (rel, i, hot)
        if key not in self.cache:
            fr = dc6(rel, track)[i]
            rgba = d2fmt.to_rgba(fr['pix'], fr['mask'], PAL)
            # hot=True: anchor is the DC6 anchor (cursor hot spot); else the frame's top-left,
            # so a {r, x, y} entry draws at (x - ox, y - oy) with x, y = untrimmed top-left.
            ax, ay = (-fr['ox'], -fr['oy']) if hot else (0, 0)
            self.cache[key] = self.atlas.add(rgba, ax, ay)
        return self.cache[key]

    def put(self, rel, i, x, y):
        return {'r': self.rect(rel, i), 'x': x, 'y': y}


ui = Sheet('ui')
inv = Sheet('inv')
P = 'ui/panel/'
M = 'ui/menu/'
L0 = (80, 60)     # left panel origin in 800x600: anchor (400,300) + rect (-320,-240)
R0 = (400, 60)    # right panel origin
GRID4 = [(0, 0), (256, 0), (0, 256), (256, 256)]


def grid4(rel, first, org):
    """4-frame 320x432 panel: 256x256, 64x256, 256x176, 64x176."""
    return [ui.put(rel, first + k, org[0] + GRID4[k][0], org[1] + GRID4[k][1]) for k in range(4)]


def frames(rel, first=0, n=None, x=0, y=0, dx=0, dy=0):
    n = len(dc6(rel)) - first if n is None else n
    return [ui.put(rel, first + k, x + dx * k, y + dy * k) for k in range(n)]


def build_panels():
    pn = {}
    # --- HUD control panel. Offsets from layouts/hudpanel.json background800Offsets
    #     [0,165,293,421,549,683]; frame 6 (128x55 blank socket) has no listed use, left out.
    cp = '%s800ctrlpnl7.dc6' % P
    pn['ctrlpanel'] = [ui.put(cp, 1, 165, 545), ui.put(cp, 2, 293, 545), ui.put(cp, 3, 421, 545),
                       ui.put(cp, 4, 549, 545), ui.put(cp, 0, 0, 496), ui.put(cp, 5, 683, 496)]
    gl = '%shlthmana.dc6' % P
    ov = '%soverlap.dc6' % P
    # fill textures (80x80) are cropped from the top by the engine according to the level;
    # overlap = round glass frame drawn over them (hudpanel.json: health x-1, mana x+1 y-4)
    pn['globes'] = {
        'hp': ui.put(gl, 0, 29, 507), 'mp': ui.put(gl, 1, 689, 507),
        'poison': ui.put(gl, 2, 29, 507), 'chill': ui.put(gl, 3, 29, 507),
        'hpFrame': ui.put(ov, 0, 28, 507), 'mpFrame': ui.put(ov, 1, 690, 503)}
    pn['popbelt'] = [ui.put('%sctrlpnl_popbelt.dc6' % P, 0, 341, 527)]
    pn['minipanel'] = {'single': ui.put('%sminipanel_s.dc6' % P, 0, 322, 527),
                       'multi': ui.put('%sminipanel.dc6' % P, 0, 312, 527),
                       'multi9': ui.put('%sminipanel_9.dc6' % P, 0, 302, 527)}
    # --- left-side panels
    ic = '%sinvchar6.dc6' % P
    pn['character'] = grid4(ic, 0, L0)
    for (sx, sy) in ((122, 74), (122, 136), (122, 222), (122, 284)):
        pn['character'].append(ui.put('%slevelsocket.dc6' % P, 0, L0[0] + sx, L0[1] + sy))
    pn['character'].append(ui.put('%sskillpoints.dc6' % P, 0, L0[0] + 3, L0[1] + 341))
    pn['stash'] = grid4('%sbank.dc6' % P, 0, L0)
    pn['stash_big'] = grid4('%sexpandedstash.dc6' % P, 0, L0)
    pn['npc_trade'] = grid4('%sbuysell.dc6' % P, 0, L0)
    pn['waypoint'] = grid4('%swaygatebackground.dc6' % M, 0, L0)
    pn['quest'] = grid4('%squestbackground.dc6' % M, 0, L0)
    # --- right-side panels
    inv_p = grid4(ic, 4, R0)
    # slot silhouettes: rect + backgroundOffset from layouts/playerinventoryoriginallayout.json
    for fn, frm, x, y in (('inv_helm_glove', 1, 135, 5), ('inv_ring_amulet', 0, 209, 34),
                          ('inv_armor', 0, 135, 75), ('inv_weapons', 0, 20, 48),
                          ('inv_weapons', 0, 251, 48), ('inv_ring_amulet', 1, 95, 179),
                          ('inv_ring_amulet', 1, 209, 179), ('inv_belt', 0, 136, 178),
                          ('inv_boots', 0, 251, 178), ('inv_helm_glove', 0, 20, 179)):
        inv_p.append(ui.put('%s%s.dc6' % (P, fn), frm, R0[0] + x, R0[1] + y))
    pn['inventory'] = inv_p
    for cls, letter in sorted(SKILLTREE_FILES.items()):
        rel = 'ui/spells/skltree_%s_back.dc6' % letter
        pn['skilltree_%s' % cls.lower()] = grid4(rel, 0, R0)        # shared frame + tab column
        for page in (1, 2, 3):                                      # layout: tab0=frame 12, 1=8, 2=4
            pn['skilltree_%s_p%d' % (cls.lower(), page)] = grid4(rel, 4 * page, R0)
    pn['dialog'] = frames('%sboxpieces.dc6' % M)                    # 9-slice + corners, 12x12
    return pn


def build_buttons():
    """Frame arrays with their default 800x600 position where layouts/*.json gives one.
    Unplaced sheets have x = y = 0.  Pairs are (up, down) unless noted."""
    b = {}
    b['run'] = frames('%srunbutton.dc6' % P, x=175, y=570)           # walk, walk down, run, run down
    b['menu'] = frames('%smenubutton.dc6' % P, x=312, y=560)         # mini-panel toggle (4 states)
    b['statup'] = frames('%slevel.dc6' % P, x=206, y=562)            # up, down, disabled
    b['skillup'] = frames('%slevel.dc6' % P, x=563, y=562)
    b['levelsocket'] = frames('%slevelsocket.dc6' % P, x=203, y=560)
    b['buysell'] = frames('%sbuysellbtn.dc6' % P)                    # 25 frames, pairs; 24 = close ok
    b['gold'] = frames('%sgoldcoinbtn.dc6' % P)
    b['goldsmall'] = frames('%sgoldbtn.dc6' % P)
    b['goldbar'] = frames('%sinv_goldbtn.dc6' % P)
    b['refresh'] = frames('%srefreshbtn.dc6' % P)
    b['tabs_trade'] = frames('%sbuyselltabs.dc6' % P)
    b['minipanel'] = frames('%sminipanelbtn.dc6' % P, x=325, y=530, dx=21)   # 9 buttons x (up, down)
    b['gemsocket'] = frames('%sgemsocket.dc6' % P)
    b['scrollbar'] = frames('%sscrollbar.dc6' % P)
    b['clickbox'] = frames('%sclickbox.dc6' % P)
    b['waygate_tabs'] = frames('%swaygatetabs.dc6' % M, x=85, y=63)
    b['waygate_icons'] = frames('%swaygateicons.dc6' % M)
    b['quest_tabs'] = frames('%squesttabs.dc6' % M, x=85, y=62)
    b['quest_icons'] = frames('%squesticons.dc6' % M)
    b['quest_sockets'] = frames('%squestsockets.dc6' % M)
    b['quest_last'] = frames('%squestlast.dc6' % M)
    for q in range(1, 7):
        b['quest_a1q%d' % q] = frames('%sa1q%d.dc6' % (M, q))        # Act I quest art, 27 frames
    return b


def build_cursor():
    """Frames anchored at the DC6 hot spot: draw at (mouse - ox, mouse - oy)."""
    cur = {}
    for name, rel in (('hand', 'ohand'), ('grasp', 'grasp'), ('buysell', 'buysell'),
                      ('spells', 'spells'), ('pentspin', 'pentspin'), ('gaunt', 'gaunt'),
                      ('lpress', 'lpress'), ('ppress', 'ppress'), ('focus16', 'focus16')):
        path = 'ui/cursor/%s.dc6' % rel
        n = len(dc6(path))
        cur[name] = [ui.rect(path, i, hot=True) for i in range(n)]
    cur['hand_still'] = cur['hand'][0]
    return cur


def build_skill_icons():
    out = {}
    for cls in sorted(SKILL_ICON_FILES):
        rel = 'ui/spells/%s.dc6' % SKILL_ICON_FILES[cls]
        out[cls] = [ui.rect(rel, i) for i in range(len(dc6(rel)))]
    return out


# ---------------------------------------------------------------- item icons

def build_icons():
    armor, weapons, misc = tab('armor'), tab('weapons'), tab('misc')
    bases = {}
    for kind, rows in (('armor', armor), ('weapon', weapons), ('misc', misc)):
        for r in rows:
            if r['code'] and num(r.get('levelreq')) <= LEVELREQ_MAX:
                bases[r['code']] = r
    names = {}      # invfile -> (cw, ch) of the first base that uses it

    def want(fn, base):
        fn = (fn or '').strip().lower()
        if fn and fn not in names and os.path.exists('%s/items/%s.dc6' % (G, fn)):
            names[fn] = (num(base['invwidth'], 1), num(base['invheight'], 1))

    for code in sorted(bases):
        r = bases[code]
        for col in ('invfile', 'uniqueinvfile', 'setinvfile'):
            want(r.get(col), r)
    for r in tab('uniqueitems'):
        if r['code'] in bases and num(r.get('lvl req')) <= LEVELREQ_MAX:
            want(r.get('invfile'), bases[r['code']])
    for r in tab('setitems'):
        if r['item'] in bases and num(r.get('lvl req')) <= LEVELREQ_MAX:
            want(r.get('invfile'), bases[r['item']])
    icons = {}
    for fn in sorted(names):
        rect = inv.rect('items/%s.dc6' % fn, 0, track=False)
        icons[fn] = {'r': rect, 'cw': names[fn][0], 'ch': names[fn][1]}
    return icons


# ---------------------------------------------------------------- sound

def ffmpeg(src, dst, enc):
    if not FORCE and os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    tmp = dst + '.tmp.ogg'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1',
           '-fflags', '+bitexact', '-flags:a', '+bitexact'] + enc + [tmp]
    subprocess.check_call(cmd)
    os.replace(tmp, dst)


class Sounds(object):
    def __init__(self):
        self.rows = [r for r in tab('sounds')]
        self.by_name = {}
        self.index = {}
        for i, r in enumerate(self.rows):
            if r['Sound'] and r['Sound'] not in self.by_name:
                self.by_name[r['Sound']] = r
                self.index[r['Sound']] = i
        self.need = {}          # name -> source path
        self.groups = {}
        self.sel = set()

    def src(self, row, depth=0):
        fn = row['FileName'].replace(BS, '/').lower()
        if fn and fn != 'none.flac':
            p = '%s/sfx/%s' % (G, fn)
            if os.path.exists(p):
                return p
        if row['Redirect'] and depth < 3 and row['Redirect'] in self.by_name:
            return self.src(self.by_name[row['Redirect']], depth + 1)
        return None

    def add(self, name):
        """Select a sound by sounds.txt name; Group Size n pulls in the next n-1 rows too."""
        name = (name or '').strip()
        if not name or name not in self.by_name or name in self.sel:
            return
        row = self.by_name[name]
        gs = num(row['Group Size'])
        members = [name]
        if gs > 1:
            i = self.index[name]
            members = [r['Sound'] for r in self.rows[i:i + gs] if r['Sound']]
            self.groups[name] = members
        for m in members:
            self.sel.add(m)
            p = self.src(self.by_name[m])
            if p:
                self.need[m] = p

    def add_prefix(self, folders):
        for r in self.rows:
            fn = r['FileName'].replace(BS, '/').lower()
            if r['Sound'] and any(fn.startswith(f) for f in folders):
                self.add(r['Sound'])


def pick_sounds():
    S = Sounds()
    monstats = {r['Id']: r for r in tab('monstats')}
    monsounds = {r['Id']: r for r in tab('monsounds')}
    skills = {r['skill']: r for r in tab('skills')}
    missiles = {r['Missile']: r for r in tab('missiles')}
    levels = tab('levels')
    snd_cols = ('Attack1', 'Weapon1', 'Attack2', 'Weapon2', 'HitSound', 'DeathSound', 'Skill1',
                'Skill2', 'Skill3', 'Skill4', 'Footstep', 'FootstepLayer', 'Neutral', 'Init',
                'Taunt', 'Flee')
    skill_cols = ('stsound', 'dosound', 'dosound a', 'dosound b', 'tgtsound', 'prgsound')
    mis_cols = ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec', 'cltmissile',
                'cltmissilea', 'cltmissileb', 'cltmissilec', 'cltmissiled')

    def skill_sounds(sk):
        for c in skill_cols:
            S.add(sk.get(c))
        for c in mis_cols:
            m = missiles.get(sk.get(c, ''))
            if m:
                S.add(m.get('TravelSound'))
                S.add(m.get('HitSound'))

    # monsters of levels 1..8 (mon1..mon10) and the Act I NPCs / bosses
    mons = []
    for r in levels:
        if 1 <= num(r['Id']) <= 8:
            mons += [r['mon%d' % i] for i in range(1, 11) if r.get('mon%d' % i)]
    mons += ['akara', 'charsi', 'gheed', 'kashya', 'warriv1', 'cain1', 'rogue1', 'rogue2',
             'act1hire', 'bloodraven', 'andariel', 'griswold', 'countess', 'smith']
    for m in mons:
        ms = monstats.get(m)
        if not ms:
            continue
        mrow = monsounds.get(ms['MonSound'])
        if mrow:
            for c in snd_cols:
                S.add(mrow.get(c))
        for i in range(1, 9):
            sk = skills.get(ms.get('Skill%d' % i, ''))
            if sk:
                skill_sounds(sk)
    # player skills up to reqlevel 18, any class
    for sk in skills.values():
        if sk.get('charclass') and num(sk.get('reqlevel')) <= SKILL_REQLEVEL_MAX:
            skill_sounds(sk)
    # footsteps (Act I surfaces), combat, items, cursor/ui, quest, objects, class voices
    for r in S.rows:
        n = r['Sound']
        if re.match(r'^(light|medium|heavy)_(walk|run)_(dirt|istone|ostone|wood)_\d$', n):
            S.add(n)
        if n.startswith('player_'):
            S.add(n)
    S.add_prefix(['combat/', 'item/', 'cursor/', 'quest/', 'object/'])
    scenes = ('wilderness_day_2', 'wilderness_night', 'cave', 'catacombs', 'cathedral', 'crypt',
              'creepywind')
    S.add_prefix(['ambient/scene/%s.flac' % s for s in scenes])
    return S


def encode_all(jobs, enc, label):
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda j: ffmpeg(j[0], j[1], enc), jobs))
    print('%s: %d files' % (label, len(jobs)))


def build_sfx():
    S = pick_sounds()
    os.makedirs(SFX_DIR, exist_ok=True)
    by_file = {}
    for name in sorted(S.need):
        rel = os.path.relpath(S.need[name], G + '/sfx').replace(BS, '/').lower()
        out = re.sub(r'\.flac$', '', rel).replace('/', '_') + '.ogg'
        by_file[S.need[name]] = out
    encode_all([(s, os.path.join(SFX_DIR, o)) for s, o in sorted(by_file.items())], ENC_SFX, 'sfx')
    # drop stale ogg from an earlier selection so the folder matches ui.js
    keep = set(by_file.values())
    for fn in os.listdir(SFX_DIR):
        if fn.endswith('.ogg') and fn not in keep:
            os.remove(os.path.join(SFX_DIR, fn))
    sfx = {n: 'assets/sfx/' + by_file[S.need[n]] for n in sorted(S.need)}
    groups = {n: [m for m in g if m in sfx] for n, g in sorted(S.groups.items()) if n in sfx}
    vol, loop = {}, []
    for n in sfx:
        r = S.by_name[n]
        lo, hi = num(r['Volume Min'], 255), num(r['Volume Max'], 255)
        if (lo, hi) != (255, 255):
            vol[n] = [lo, hi]
        if r['Loop'] == '1':
            loop.append(n)
    return sfx, groups, vol, loop


def build_music():
    os.makedirs(MUS_DIR, exist_ok=True)
    jobs, out = [], {}
    for key, rel in MUSIC:
        dst = os.path.join(MUS_DIR, key + '.ogg')
        jobs.append(('%s/%s' % (G, rel), dst))
        out[key] = 'assets/music/%s.ogg' % key
    encode_all(jobs, ENC_MUSIC, 'music')
    out['caves'] = out['cave']
    keep = set(k + '.ogg' for k, _ in MUSIC)
    for fn in os.listdir(MUS_DIR):
        if fn.endswith('.ogg') and fn not in keep:
            os.remove(os.path.join(MUS_DIR, fn))
    return out


# ---------------------------------------------------------------- main

def dirsize(d, pat):
    return sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if re.match(pat, f))


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    panels = build_panels()
    panels['buttons'] = build_buttons()
    cursor = build_cursor()
    skill_icons = build_skill_icons()
    icons = build_icons()

    ui_pages = ui.atlas.save()
    inv_pages = inv.atlas.save()
    off = len(ui_pages)
    for ic in icons.values():            # inventory pages follow the UI pages in `pages`
        if ic['r']:
            ic['r'][6] += off
    # stale pages of a previous run (fewer pages now)
    keep = set(os.path.basename(p) for p in ui_pages + inv_pages)
    for fn in os.listdir(IMG_DIR):
        if re.match(r'^(ui|inv)_\d+\.webp$', fn) and fn not in keep:
            os.remove(os.path.join(IMG_DIR, fn))

    sfx, groups, vol, loop = build_sfx()
    music = build_music()

    layout = {
        'cell': CELL,
        'panelOrigin': {'left': list(L0), 'right': list(R0)},
        # grid = [x, y, cols, rows] relative to the panel origin (layouts/*.json)
        'inventory': {'grid': [19, 255, 10, 4], 'gold': [84, 391], 'close': [18, 384]},
        'stash': {'grid': [74, 273, 6, 4], 'goldWithdraw': [75, 218], 'close': [275, 383]},
        'npc_trade': {'grid': [16, 63, 10, 10], 'buy': [116, 385], 'sell': [168, 385],
                      'repair': [220, 385], 'close': [272, 385]},
        'hud': {'health': [29, 507], 'mana': [689, 507], 'leftSkill': [117, 552],
                'rightSkill': [635, 552], 'belt': [341, 559], 'stamina': [193, 573, 102, 18],
                'exp': [176, 561, 119, 2]},
    }
    man = [('pages', ui_pages + inv_pages), ('layout', layout), ('panels', panels),
           ('icons', icons), ('skillIcons', skill_icons), ('cursor', cursor), ('sfx', sfx),
           ('sfxGroup', groups), ('sfxVol', vol), ('sfxLoop', loop), ('music', music)]
    body = ',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v, separators=(',', ':')))
                      for k, v in man)
    with io.open(os.path.join(ASSETS, 'ui.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('window.D2_UI = {\n%s\n};\n' % body)

    print('dc6 files used for the UI atlas (%d):' % len(set(used_dc6)))
    for p in sorted(set(used_dc6)):
        print('  ', p)
    mb = 1024.0 * 1024.0
    print('pages: %d ui + %d inv' % (len(ui_pages), len(inv_pages)))
    print('images %.2f MB  sfx %.2f MB  music %.2f MB' % (
        dirsize(IMG_DIR, r'^(ui|inv)_\d+\.webp$') / mb, dirsize(SFX_DIR, r'.*\.ogg$') / mb,
        dirsize(MUS_DIR, r'.*\.ogg$') / mb))
    print('panels %d, buttons %d, icons %d, skill icon sets %d, sfx %d, music %d' % (
        len(panels) - 1, len(panels['buttons']), len(icons), len(skill_icons), len(sfx),
        len(music)))


if __name__ == '__main__':
    main()
