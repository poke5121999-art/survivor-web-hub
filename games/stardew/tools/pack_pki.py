"""Pack the loose PKI sprites into the game's island atlas.

  python tools/pack_pki.py <sprites_dir> <out_dir>

Everything is packed except the two categories that are genuinely useless in
this game - the localisation flags and the store/marketing art - plus the
handful of oversized images (a 1463x2048 splash, a 1500x964 wooden frame) that
would blow the atlas up on their own.

THE FLAG LIST IS MATCHED WHOLE, and that is not a detail. It was a prefix match
once, and `Eng` then blocked `Enginear_Idle0` and `Enginear2_Idle0` - two of
the game's thirteen villagers - while `Sc` ate `ScholarIcon` and `Fra` ate the
`Frame*` UI. Nothing errored; the sprites simply were not in the atlas, and the
first sign of it was a magenta box on an island nobody had visited yet.
"""
import os
import re
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import pack

src = sys.argv[1]
outdir = sys.argv[2]

# Two-to-six letter language tags from the source game's flag sheet. Matched in
# full, never as a prefix - see the note above.
FLAGS = set('''Ara Ben Dutch Eng Filand Fra Ge Hin Ind Ita Jp kor Moru Norsk
Poland Por Rus Sc Sp Sweden Tc Thai Tur Vie Hiss'''.split())

# Patterns that block by prefix, which is correct for all of these.
BLOCK = re.compile(
    r'^(Ad_\d|android_neutral|siwa-logo|Splash|InApp|ic_stat|Icon192'
    r'|Splash_ResizeSmall|FrontWood|newIcon|pickaxeking_logo01'
    r'|L_[A-Z]|atlas_|fire_pixel|fire2|Font|.*SDF|EmojiOne'
    r'|UIMask|UISprite|Default|InputField|Icon_ImageIcon'
    r'|CardBackWhite|WhiteBox|Common_White_Box|BlankGround|Empty$'
    r'|cardglow|gradient|rainbow|seamlessNoise|palette-downwell|fx_circle)',
    re.I)

# 100 rank crowns ship with the game and only the first two dozen are ever
# shown; the rest are 76 frames of atlas for a leaderboard this game has not
# got.
CROWNCAP = re.compile(r'^Crown(\d+)')

files = []
skipped = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    n = f[:-4]
    if n in FLAGS:
        skipped.append(n); continue
    if BLOCK.match(n):
        skipped.append(n); continue
    m = CROWNCAP.match(n)
    if m and int(m.group(1)) >= 24:
        skipped.append(n); continue
    files.append((n, os.path.join(src, f)))

print('packing', len(files), 'sprites, skipping', len(skipped))
meta = pack(files, outdir, 'pki', maxsize=2048, pad=1)
json.dump(meta, open(os.path.join(outdir, 'pki.json'), 'w'), separators=(',', ':'))
print('pages', ['%s %dx%d' % (p['file'], p['w'], p['h']) for p in meta['pages']],
      'frames', len(meta['f']))
