import os, sys, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import pack
src = sys.argv[1]; outdir = sys.argv[2]
BLOCK = re.compile(r'''^(Ad_\d|android_neutral|siwa-logo|Splash|InApp|ic_stat|Icon192|Splash_ResizeSmall|FrontWood|newIcon|pickaxeking_logo01|
 Ara|Ben|Dutch|Eng|Filand|Fra|Ge|Hin|Ind|Ita|Jp|kor|Moru|Norsk|Poland|Por|Rus|Sc|Sp|Sweden|Tc|Thai|Tur|Vie|Hiss|
 L_[A-Z]|atlas_|fire_pixel|fire2|Font|.*SDF|EmojiOne|UIMask|UISprite|Default|InputField|
 Icon_ImageIcon|CardBackWhite|WhiteBox|Common_White_Box|BlankGround|Empty$|
 Legend[0-9]|epic$|cardglow|glow|gradient|rainbow|seamlessNoise|palette-downwell|fx_circle)''',
 re.X | re.I)
CROWNCAP = re.compile(r'^Crown(\d+)')
files = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    n = f[:-4]
    if BLOCK.match(n): continue
    m = CROWNCAP.match(n)
    if m and int(m.group(1)) >= 24: continue
    files.append((n, os.path.join(src, f)))
print('packing', len(files))
meta = pack(files, outdir, 'pki', maxsize=2048, pad=1)
json.dump(meta, open(os.path.join(outdir, 'pki.json'), 'w'), separators=(',', ':'))
print('pages', [p['file'] + ' %dx%d' % (p['w'], p['h']) for p in meta['pages']], 'frames', len(meta['f']))
