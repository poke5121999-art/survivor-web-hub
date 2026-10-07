# -*- coding: utf-8 -*-
"""Build the Diablo II UI art, item icons, sound effects and music for games/diablo2.

Writes (all under games/diablo2/assets/):
    m/ui.js               D2_REG('m/ui', {ui: D2_UI-shaped object}) + idx/ui.json fragment
    img/g/ui_<n>.webp     UI panels, buttons, cursors, skill icons  (units palette)
    img/g/inv_<n>.webp    inventory pictures of every item
    a/sfx/*.ogg           mono 22050 Hz Vorbis q0, keyed by sounds.txt Sound name
    a/music/*.ogg         stereo 44.1 kHz Vorbis q1

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
IMG_DIR = os.path.join(ASSETS, 'img', 'g')
SFX_DIR = os.path.join(ASSETS, 'a', 'sfx')
MUS_DIR = os.path.join(ASSETS, 'a', 'music')
GROUP = 'm/ui'
SRC = os.environ.get('D2R_DATA', 'D:/d2r-ref/fs/data/data')
G = SRC + '/global'
BS = chr(92)

FORCE = '--force' in sys.argv
CELL = 29                       # inventory.txt gridBoxWidth; one item cell in px
LOSSY_PAGE_BYTES = 1 << 20      # a lossless page above this is re-saved lossy q90 when --lossy-big
ENC_SFX = ['-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '0']
ENC_MUSIC = ['-ac', '2', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '1']
MUSIC_CAP = float(os.environ.get('MUSIC_CAP', '110'))   # s; longer loops are cut and faded out
FADE = 4.0

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
        self.atlas = d2pack.Atlas(name, IMG_DIR, 'assets/img/g')
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
# pieces added in wave 2-UI live on their own page so ui_*.webp keep their packing
uix = Sheet('uix')
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
    for a in range(1, 6):
        for q in range(1, 7):
            if os.path.exists('%s/%sa%dq%d.dc6' % (G, M, a, q)):
                b['quest_a%dq%d' % (a, q)] = frames('%sa%dq%d.dc6' % (M, a, q))
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


def build_extra():
    """Mercenary portraits by act (ui/hireables: rogue, desert guard, iron wolf, barbarian), the drop-gold
    dialog (menu/dialogbackground, amount bar + two sockets) and its OK / cancel buttons (menu/goldbtn:
    0-1 ok, 2-3 cancel)."""
    H = 'ui/hireables/'
    return {'merc': {'1': uix.rect(H + 'rogueicon.dc6', 0), '2': uix.rect(H + 'act2hireableicon.dc6', 0),
                     '3': uix.rect(H + 'act3hireableicon.dc6', 0), '5': uix.rect(H + 'barbhirable_icon.dc6', 0)},
            'goldDialog': uix.rect(M + 'dialogbackground.dc6', 0),
            'goldBtn': [uix.rect(M + 'goldbtn.dc6', i) for i in range(4)]}


def build_skill_icons():
    out = {}
    for cls in sorted(SKILL_ICON_FILES):
        rel = 'ui/spells/%s.dc6' % SKILL_ICON_FILES[cls]
        out[cls] = [ui.rect(rel, i) for i in range(len(dc6(rel)))]
    return out


# ---------------------------------------------------------------- fonts

FONT_DIR = SRC + '/local/font/latin'
# D2 text colours = pal.pl2 TextColorShifts index (ÿc0..ÿc;).  Shift 0 maps every index to black in the
# 3.1 files, so 'white' is the glyph as drawn (no shift), the way OpenDiablo2 renders an uncoloured label.
TEXT_COLORS = ['white', 'red', 'green', 'blue', 'gold', 'grey', 'black', 'tan', 'orange', 'yellow',
               'dgreen', 'purple', 'green2']
ALL_TEXT = [c for c in TEXT_COLORS if c not in ('black', 'green2')]
FONTS = {'font16': ALL_TEXT, 'font30': ['white', 'gold'], 'font42': ['white', 'gold'],
         'fontexocet10': ALL_TEXT, 'fontformal12': ['white', 'gold', 'grey']}
FIRST, NCH, COLS = 32, 224, 16       # codes 32..255 (latin-1), 16 per row -> 14 rows per colour


def read_tbl(path):
    """font .tbl (d2font/font.go): 'Woo!\\x01' + 7 bytes, then 14 bytes per glyph:
    code u16, 0, width, height, 1 0 0, frame u16, 4 bytes.  -> {code: (adv, height, frame)}."""
    import struct
    with open(path, 'rb') as f:
        t = f.read()
    if t[:5] != b'Woo!\x01':
        raise ValueError('%s: font table signature not found' % path)
    out = {}
    for p in range(12, len(t) - 13, 14):
        code, = struct.unpack_from('<H', t, p)
        fr, = struct.unpack_from('<H', t, p + 8)
        out[code] = (t[p + 3], t[p + 4], fr)
    return out, t[10]


def build_fonts():
    """One image per font: a 16-column grid of glyph cells (codes 32..255), one block per baked colour.
    Glyphs keep their DC6 frame (all frames of a font share one height, art sits at the bottom)."""
    import numpy as np
    from PIL import Image
    pal = PAL
    with open(G + '/palette/act1/pal.pl2', 'rb') as f:
        pl2 = f.read()
    # pal.pl2 layout (d2pl2/pl2.go): base 1024, light 32x256, inv 16x256, selected 256, alpha 3x256x256,
    # additive, multiplicative 256x256 each, hue 111x256, r/g/b 3x256, unknown 14x256, maxcomp 256x256,
    # darkened 256, then 13 RGB text colours and 13 text colour shifts
    off = 1024 + 8192 + 4096 + 256 + 196608 + 65536 + 65536 + 28416 + 768 + 3584 + 65536 + 256
    rgb = [list(pl2[off + 3 * i:off + 3 * i + 3]) for i in range(13)]
    shifts = [np.frombuffer(pl2[off + 39 + 256 * i:off + 39 + 256 * (i + 1)], np.uint8) for i in range(13)]
    out = {}
    for name in sorted(FONTS):
        tbl, line = read_tbl('%s/%s.tbl' % (FONT_DIR, name))
        with open('%s/%s.dc6' % (FONT_DIR, name), 'rb') as f:
            frs = [x for row in d2fmt.read_dc6(f.read())['frames'] for x in row]
        hgt = max(fr['h'] for fr in frs)
        cw = max(frs[tbl[c][2]]['w'] for c in range(FIRST, FIRST + NCH))
        rows = NCH // COLS
        cols = FONTS[name]
        img = np.zeros((rows * hgt * len(cols), COLS * cw, 4), np.uint8)
        mean = {}
        for k, col in enumerate(cols):
            ci = TEXT_COLORS.index(col)
            acc = []
            for i in range(NCH):
                fr = frs[tbl[FIRST + i][2]]
                pix = fr['pix'] if col == 'white' else shifts[ci][fr['pix']]
                rgba = d2fmt.to_rgba(pix, fr['mask'], pal)
                x, y = (i % COLS) * cw, (k * rows + i // COLS) * hgt + hgt - fr['h']
                img[y:y + fr['h'], x:x + fr['w']] = rgba
                acc.append(rgba[fr['mask']][:, :3])
            # glyph face colour (mean of the brightest quarter; the rest is outline): the web-font fallback
            # is drawn in it so mixed text looks alike
            px = np.concatenate(acc).astype(np.float64)
            lum = px @ [0.299, 0.587, 0.114]
            mean[col] = [int(v) for v in px[lum >= np.percentile(lum, 75)].mean(0).round()]
        e = frs[tbl[ord('E')][2]]['mask']
        rws = np.nonzero(e.any(1))[0]
        cap, base = int(rws.min()) + hgt - e.shape[0], int(rws.max()) + 1 + hgt - e.shape[0]
        fn = 'font_%s.webp' % name
        Image.fromarray(img).save(os.path.join(IMG_DIR, fn), 'WEBP', lossless=True, method=6)
        # cap/base: rows of the top and bottom (+1) of 'E' inside a cell, for the fallback font size and baseline
        out[name] = {'img': 'assets/img/g/' + fn, 'h': hgt, 'cw': cw, 'line': line, 'cap': cap, 'base': base, 'first': FIRST,
                     'cols': COLS, 'rows': rows, 'colors': cols, 'rgb': mean,
                     'adv': [tbl[c][0] for c in range(FIRST, FIRST + NCH)]}
        print('font %s: %dx%d cells, %d colours, %d KB' % (name, cw, hgt, len(cols),
                                                          os.path.getsize(os.path.join(IMG_DIR, fn)) // 1024))
    return out, {TEXT_COLORS[i]: rgb[i] for i in range(13)}


# ---------------------------------------------------------------- front end (group m/front)

FRONT_GROUP = 'm/front'
FRONT_Q = 80                    # lossy WebP: the screens are painted art, alpha kept
# class select (OpenDiablo2 d2gamescreen/select_hero_class.go): feet position, click box [x, y, w, h],
# play lengths in ms of idle / forward walk / back walk (0 = OD default), and whether the overlay layer
# (<c>fws, <c>bws, <c>nu3s) is drawn additive.  nu2 is the same picture as nu1 and is left out.
CLASSES = [('amazon', 'am', 100, 339, [70, 220, 55, 200], [2500, 2200, 1500], False),
           ('assassin', 'as', 231, 365, [175, 235, 50, 180], [2500, 3800, 1500], False),
           ('barbarian', 'ba', 400, 330, [364, 201, 90, 170], [0, 2500, 1000], False),
           ('druid', 'dz', 720, 370, [680, 220, 70, 195], [1500, 4800, 1500], False),
           ('necromancer', 'ne', 300, 335, [265, 220, 55, 175], [1200, 2000, 1500], True),
           ('paladin', 'pa', 521, 338, [490, 210, 65, 180], [2500, 3400, 1300], False),
           ('sorceress', 'so', 626, 352, [580, 240, 65, 160], [2500, 2300, 1200], True)]


class FrontSheet(object):
    def __init__(self):
        self.atlas = d2pack.Atlas('front', IMG_DIR, 'assets/img/g')
        self.pals = {}

    def pal(self, name):
        if name not in self.pals:
            self.pals[name] = d2fmt.load_palette('%s/palette/%s/pal.dat' % (G, name))
        return self.pals[name]

    def rect(self, rel, i, pal, opaque=False, top_left=False):
        """Anchored at the DC6 anchor (or the frame's top-left): draw at (x - ox, y - oy)."""
        fr = dc6(rel, False)[i]
        rgba = d2fmt.to_rgba(fr['pix'], fr['mask'], self.pal(pal))
        if opaque:                 # full-screen backgrounds: index 0 is black there, not a hole
            rgba[..., 3] = 255
        return self.atlas.add(rgba, 0 if top_left else -fr['ox'], 0 if top_left else -fr['oy'])

    def anim(self, rel, pal, step=1):
        return [self.rect(rel, i, pal) for i in range(0, len(dc6(rel, False)), step)]

    def screen(self, rel, pal):
        """800x600 background stored as 256-px tiles row by row -> [{r, x, y}]."""
        out, x, y, rowh = [], 0, 0, 0
        for i, fr in enumerate(dc6(rel, False)):
            if x >= 800:
                x, y, rowh = 0, y + rowh, 0
            out.append({'r': self.rect(rel, i, pal, True, True), 'x': x, 'y': y})
            x += fr['w']
            rowh = max(rowh, fr['h'])
        return out


def build_front():
    fs = FrontSheet()
    U = 'ui/frontend/'
    front = {
        'title': {'bg': fs.screen(U + 'titlescreen.dc6', 'sky'),
                  # logo at (400, 120), fire layers drawn additive over the black ones (OD main_menu.go)
                  'logo': {'x': 400, 'y': 120, 'fireL': fs.anim(U + 'd2logofireleft.dc6', 'units'),
                           'fireR': fs.anim(U + 'd2logofireright.dc6', 'units'),
                           'blackL': fs.rect(U + 'd2logoblackleft.dc6', 0, 'units'),
                           'blackR': fs.rect(U + 'd2logoblackright.dc6', 0, 'units')}},
        'create': {'bg': fs.screen(U + 'charactercreate.dc6', 'fechar'),
                   'fire': {'x': 380, 'y': 335, 'f': fs.anim(U + 'fire.dc6', 'fechar')}},
        'load': {'x': 400, 'y': 300, 'f': [fs.rect('ui/loading/loadingscreen_eng.dc6', i, 'loading')
                                           for i in range(len(dc6('ui/loading/loadingscreen_eng.dc6', False)))]},
        'btn': {'wide': [fs.rect(U + 'widebuttonblank.dc6', i, 'units', False, True) for i in (0, 1)],
                'medium': [fs.rect(U + 'mediumbuttonblank.dc6', i, 'units', False, True) for i in (0, 1)],
                'textbox': fs.rect(U + 'textbox2.dc6', 0, 'units', True, True)},
        'cls': {},
    }
    for name, ab, x, y, box, lens, blend in CLASSES:
        d = '%s%s/%s' % (U, name, ab)
        c = {'x': x, 'y': y, 'box': box, 'len': lens, 'blend': blend}
        for k in ('nu1', 'nu3', 'fw', 'bw', 'nu3s', 'fws', 'bws'):
            rel = '%s%s.dc6' % (d, k)
            if os.path.exists('%s/%s' % (G, rel)):
                # the walks to and from the fire are 19..121 frames: every other one keeps the front group
                # near 2 MB, played over the same OD length
                c[k] = fs.anim(rel, 'fechar', 2 if k[:2] in ('fw', 'bw') else 1)
        front['cls'][name] = c
    pages = fs.atlas.save(lossless=False, quality=FRONT_Q)
    keep = set(os.path.basename(p) for p in pages)
    for fn in os.listdir(IMG_DIR):
        if re.match(r'^front_\d+\.webp$', fn) and fn not in keep:
            os.remove(os.path.join(IMG_DIR, fn))
    front['pages'] = pages
    with io.open(os.path.join(ASSETS, 'm', 'front.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(u"D2_REG('%s', { front: %s });\n" % (FRONT_GROUP, json.dumps(front, separators=(',', ':'))))
    print('front pages: %s' % ['%s %d KB' % (os.path.basename(p), os.path.getsize(os.path.join(IMG_DIR, os.path.basename(p))) // 1024) for p in pages])


# ---------------------------------------------------------------- item icons

def build_icons():
    """Every inventory picture of armor, weapons, misc (all tiers, uniques, sets, runes, gems,
    charms, jewels, quest items, potions, scrolls, keys) plus uniqueitems/setitems invfile."""
    bases = {}
    for rows in (tab('armor'), tab('weapons'), tab('misc')):
        for r in rows:
            if r['code']:
                bases[r['code']] = r
    names = {}      # invfile -> (cw, ch) of the first base that uses it

    def want(fn, base):
        fn = (fn or '').strip().lower()
        if fn and fn not in names and os.path.exists('%s/items/%s.dc6' % (G, fn)):
            names[fn] = (num(base['invwidth'], 1), num(base['invheight'], 1))

    for code in sorted(bases):
        for col in ('invfile', 'uniqueinvfile', 'setinvfile'):
            want(bases[code].get(col), bases[code])
    for r in tab('uniqueitems'):
        if r['code'] in bases:
            want(r.get('invfile'), bases[r['code']])
    for r in tab('setitems'):
        if r['item'] in bases:
            want(r.get('invfile'), bases[r['item']])
    # D2 picks ring / amulet / charm / jewel / potion variants in code, not from the tables:
    # every other inv*.dc6 is kept too, sized from its frame
    for f in sorted(os.listdir(G + '/items')):
        fn = f[:-4].lower()
        if f.lower().endswith('.dc6') and fn.startswith('inv') and fn not in names:
            fr = dc6('items/%s' % f, False)[0]
            names[fn] = (max(1, int(round(fr['w'] / float(CELL)))), max(1, int(round(fr['h'] / float(CELL)))))
    icons = {}
    for fn in sorted(names):
        rect = inv.rect('items/%s.dc6' % fn, 0, track=False)
        icons[fn] = {'r': rect, 'cw': names[fn][0], 'ch': names[fn][1]}
    return icons


# ---------------------------------------------------------------- sound

def ffmpeg(src, dst, enc, cap=0):
    if not FORCE and os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    tmp = dst + '.tmp.ogg'
    cut = []
    if cap:
        cut = ['-t', '%g' % cap, '-af', 'afade=t=out:st=%g:d=%g' % (cap - FADE, FADE)]
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1',
           '-fflags', '+bitexact', '-flags:a', '+bitexact'] + cut + enc + [tmp]
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

    # every monster of every level (normal, nightmare/hell, unique, champion lists), all NPCs
    # and bosses; both MonSound and UMonSound (the unique/boss variant) rows
    mons = []
    for r in levels:
        for pre in ('mon', 'nmon', 'umon', 'cmon'):
            mons += [r['%s%d' % (pre, i)] for i in range(1, 26) if r.get('%s%d' % (pre, i))]
    mons += ['smith']       # the Tristram smith has neither the npc nor the boss flag
    mons += [i for i, r in monstats.items() if r.get('npc') == '1' or r.get('boss') == '1']
    for m in sorted(set(mons)):
        ms = monstats.get(m)
        if not ms:
            continue
        for col in ('MonSound', 'UMonSound'):
            mrow = monsounds.get(ms.get(col, ''))
            if mrow:
                for c in snd_cols:
                    S.add(mrow.get(c))
        for i in range(1, 9):
            sk = skills.get(ms.get('Skill%d' % i, ''))
            if sk:
                skill_sounds(sk)
    # all class skills
    for sk in skills.values():
        if sk.get('charclass'):
            skill_sounds(sk)
    # items: drop / use sounds
    for name in ('armor', 'weapons', 'misc'):
        for r in tab(name):
            for c in ('dropsound', 'usesound'):
                S.add(r.get(c))
    # footsteps (every surface), class voices, combat, items, cursor/ui, quest, objects
    for r in S.rows:
        n = r['Sound']
        if re.match(r'^(light|medium|heavy)_(walk|run)_\w+_\d$', n):
            S.add(n)
        if n.startswith('player_'):
            S.add(n)
    S.add_prefix(['combat/', 'item/', 'cursor/', 'quest/', 'object/'])
    S.add_prefix(['ambient/scene/%s.flac' % s for s in AMBIENT])
    return S


AMBIENT = ('wilderness_day_2', 'wilderness_night', 'cave', 'catacombs', 'cathedral', 'crypt',
           'creepywind', 'desertday', 'desertnight', 'harem', 'jungleday', 'junglenight', 'sewer',
           'tomb', 'town3day', 'town3night', 'lava', 'hell1')


def encode_all(jobs, enc, label):
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda j: ffmpeg(j[0], j[1], enc, j[2] if len(j) > 2 else 0), jobs))
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
    sfx = {n: 'assets/a/sfx/' + by_file[S.need[n]] for n in sorted(S.need)}
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


def music_list():
    """(key, flac relative to global/, cap seconds or 0, [aliases]).  Env songs use the sounds.txt
    names soundenviron.txt points at (music_wilderness...), so def.music of an area resolves."""
    S = dict((r['Sound'], r) for r in tab('sounds'))
    seen, out = {}, []
    for r in tab('soundenviron'):
        n = r['Song']
        if n and n in S and n not in seen:
            fn = S[n]['FileName'].replace(BS, '/').lower()
            if fn.startswith('act'):
                seen[n] = 1
                out.append((n, 'music/' + fn, MUSIC_CAP, []))
    # boss / event stingers: one key per file stem (the Act I three keep their old keys)
    for act in range(1, 6):
        d = '%s/music/act%d' % (G, act)
        for f in sorted(os.listdir(d)):
            rel = 'music/act%d/%s' % (act, f)
            if not any(o[1] == rel for o in out):
                stem = f[:-5]
                key = {'denofevilaction': 'denofevil', 'bloodravenresolution': 'bloodraven',
                       'andarielaction': 'andariel'}.get(stem, stem)
                out.append((key, rel, 0, []))
    out.append(('intro', 'music/introedit.flac', 0, []))
    return out


ALIAS = {'town1': 'music_town_1', 'wild': 'music_wilderness', 'cave': 'music_caves',
         'caves': 'music_caves', 'town': 'music_town_1'}


def build_music():
    os.makedirs(MUS_DIR, exist_ok=True)
    jobs, out = [], {}
    for key, rel, cap, _ in music_list():
        src = '%s/%s' % (G, rel)
        jobs.append((src, os.path.join(MUS_DIR, key + '.ogg'), cap))
        out[key] = 'assets/a/music/%s.ogg' % key
    encode_all(jobs, ENC_MUSIC, 'music')
    for k, v in ALIAS.items():
        out[k] = out[v]
    keep = set(os.path.basename(j[1]) for j in jobs)
    for fn in os.listdir(MUS_DIR):
        if fn.endswith('.ogg') and fn not in keep:
            os.remove(os.path.join(MUS_DIR, fn))
    return out


# ---------------------------------------------------------------- main

def dirsize(d, pat):
    return sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if re.match(pat, f))


def save_pages(atlas):
    """Lossless pages; with --lossy-big, any page over 1 MB is re-saved lossy q90 (same packing)."""
    paths = atlas.save(lossless=True)
    big = [p for p in paths if os.path.getsize(os.path.join(IMG_DIR, os.path.basename(p))) > LOSSY_PAGE_BYTES]
    print('%s pages lossless: %s' % (atlas.name, ['%s %d KB' % (os.path.basename(p), os.path.getsize(os.path.join(IMG_DIR, os.path.basename(p))) // 1024) for p in paths]))
    if big and '--lossy-big' in sys.argv:
        for p in big:
            fp = os.path.join(IMG_DIR, os.path.basename(p))
            os.replace(fp, fp + '.ll')
        atlas.save(lossless=False, quality=90)
        for p in big:
            fp = os.path.join(IMG_DIR, os.path.basename(p))
            print('  %s lossy q90 %d KB (lossless %d KB, kept as .ll for comparison)' % (
                os.path.basename(p), os.path.getsize(fp) // 1024, os.path.getsize(fp + '.ll') // 1024))
    return paths


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    panels = build_panels()
    panels['buttons'] = build_buttons()
    panels['extra'] = build_extra()
    cursor = build_cursor()
    skill_icons = build_skill_icons()
    icons = build_icons()
    fonts, text_rgb = build_fonts()
    build_front()

    ui_pages = save_pages(ui.atlas)
    inv_pages = save_pages(inv.atlas)
    uix_pages = save_pages(uix.atlas)
    off = len(ui_pages)
    for ic in icons.values():            # inventory pages follow the UI pages in `pages`, then the uix page
        if ic['r']:
            ic['r'][6] += off
    for r in uix.cache.values():
        if r:
            r[6] += off + len(inv_pages)
    keep = set(os.path.basename(p) for p in ui_pages + inv_pages + uix_pages)
    for fn in os.listdir(IMG_DIR):
        if re.match(r'^(ui|inv|uix)_\d+\.webp$', fn) and fn not in keep:
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
    man = [('pages', ui_pages + inv_pages + uix_pages), ('layout', layout), ('panels', panels),
           ('icons', icons), ('skillIcons', skill_icons), ('cursor', cursor), ('sfx', sfx),
           ('sfxGroup', groups), ('sfxVol', vol), ('sfxLoop', loop), ('music', music),
           ('fonts', fonts), ('textColors', text_rgb)]
    body = ',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v, separators=(',', ':')))
                      for k, v in man)
    mdir = os.path.join(ASSETS, 'm')
    os.makedirs(mdir, exist_ok=True)
    with io.open(os.path.join(mdir, 'ui.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(u"D2_REG('%s', { ui: {\n%s\n} });\n" % (GROUP, body))
    import build_index
    build_index.write_fragment('ui', {'ui': GROUP, 'front': FRONT_GROUP})

    print('dc6 files used for the UI atlas (%d)' % len(set(used_dc6)))
    mb = 1024.0 * 1024.0
    print('pages: %d ui + %d inv' % (len(ui_pages), len(inv_pages)))
    print('images %.2f MB  sfx %.2f MB  music %.2f MB' % (
        dirsize(IMG_DIR, r'^(ui|inv|uix)_\d+\.webp$') / mb, dirsize(SFX_DIR, r'.*\.ogg$') / mb,
        dirsize(MUS_DIR, r'.*\.ogg$') / mb))
    print('panels %d, buttons %d, icons %d, skill icon sets %d, sfx %d, music %d' % (
        len(panels) - 1, len(panels['buttons']), len(icons), len(skill_icons), len(sfx),
        len(music)))


if __name__ == '__main__':
    main()
