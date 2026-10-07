# -*- coding: utf-8 -*-
"""Tab act I-V of the LoD waypoint and quest panels -> games/diablo2/assets/img/g/exptabs.webp.

The UI atlas (build_ui.py) only has the classic 4-act tabs (waygatetabs/questtabs, 78 px).
LoD draws five 63x31 tabs from expwaygatetabs.dc6 / expquesttabs.dc6 (10 frames: act k
active = 2k, inactive = 2k+1). Kept as a separate small sheet so the UI atlas need not be
rebuilt: row 0 = waypoint tabs, row 1 = quest tabs, frame f at (f*63, row*31).
ui.js reads it at that fixed grid (EXPTABS in js/ui.js).

    python games/diablo2/_tools/build_exptabs.py      (env D2R_DATA overrides the data root)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2fmt  # noqa: E402
from PIL import Image  # noqa: E402

SRC = os.environ.get('D2R_DATA', 'D:/d2r-ref/fs/data/data')
G = SRC + '/global'
OUT = os.path.join(os.path.dirname(HERE), 'assets', 'img', 'g', 'exptabs.webp')
FW, FH = 63, 31


def main():
    pal = d2fmt.load_palette(G + '/palette/units/pal.dat')
    sheet = Image.new('RGBA', (FW * 10, FH * 2), (0, 0, 0, 0))
    for row, name in enumerate(('expwaygatetabs', 'expquesttabs')):
        with open('%s/ui/menu/%s.dc6' % (G, name), 'rb') as f:
            d = d2fmt.read_dc6(f.read())
        frames = [fr for r in d['frames'] for fr in r]
        assert len(frames) == 10, (name, len(frames))
        for i, fr in enumerate(frames):
            assert (fr['w'], fr['h']) == (FW, FH), (name, i, fr['w'], fr['h'])
            sheet.alpha_composite(Image.fromarray(d2fmt.to_rgba(fr['pix'], fr['mask'], pal)), (i * FW, row * FH))
    sheet.save(OUT, 'WEBP', lossless=True)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
