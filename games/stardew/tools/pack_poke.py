"""Pack the FireRed/LeafGreen Pokemon sprites into one atlas + index.

Four sets go in - front, back, shiny front, shiny back - keyed `f25`, `b25`,
`sf25`, `sb25`.  They are alpha-trimmed by pack.py, which matters more here
than it does for the island art: a GBA sprite is a 64x64 canvas with the
creature somewhere inside it, and untrimmed that is 604 x 4 KB of empty pixels.

Usage:  python tools/pack_poke.py <sprites_dir> <out_dir>
        where <sprites_dir> holds front/ back/ shiny/ sback/ of N.png
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import pack

src = sys.argv[1]
outdir = sys.argv[2]
SETS = [('front', 'f'), ('back', 'b'), ('sfront', 'sf'), ('sback', 'sb')]

files = []
for sub, prefix in SETS:
    d = os.path.join(src, sub)
    for i in range(1, 152):
        p = os.path.join(d, '%d.png' % i)
        if os.path.exists(p) and os.path.getsize(p) > 100:
            files.append((prefix + str(i), p))

print('packing', len(files))
meta = pack(files, outdir, 'poke', maxsize=2048, pad=1)
json.dump(meta, open(os.path.join(outdir, 'poke.json'), 'w'), separators=(',', ':'))
print('pages', ['%s %dx%d' % (p['file'], p['w'], p['h']) for p in meta['pages']],
      'frames', len(meta['f']))
