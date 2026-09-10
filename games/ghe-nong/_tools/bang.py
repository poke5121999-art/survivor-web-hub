# -*- coding: utf-8 -*-
"""bang.py — dan mot dong sprite thanh BANG LIEN HOAN co danh so, de nhin ma chon.

    python _tools/bang.py <thu-muc> <mau-glob> <ra.png> [so-o-moi-bang] [o-px]

In ra danh sach "so <tab> ten tep" de tra nguoc. Nen dat cua so 120 o mot bang thi
doc so tren anh con ro.
"""
import fnmatch, os, sys
from PIL import Image, ImageDraw

def main():
    d, mau, ra = sys.argv[1], sys.argv[2], sys.argv[3]
    moi = int(sys.argv[4]) if len(sys.argv) > 4 else 120
    O = int(sys.argv[5]) if len(sys.argv) > 5 else 96
    fs = sorted(f for f in os.listdir(d) if fnmatch.fnmatch(f, mau))
    COT = 10
    for b in range(0, len(fs), moi):
        lo = fs[b:b + moi]
        hang = (len(lo) + COT - 1) // COT
        im = Image.new('RGBA', (COT * O, hang * O), (24, 28, 36, 255))
        dr = ImageDraw.Draw(im)
        for i, f in enumerate(lo):
            c, h = i % COT, i // COT
            try:
                a = Image.open(os.path.join(d, f)).convert('RGBA')
            except Exception:
                continue
            k = min((O - 20) / float(max(a.width, 1)), (O - 20) / float(max(a.height, 1)))
            if k != 1:
                a = a.resize((max(1, int(a.width * k)), max(1, int(a.height * k))), Image.NEAREST)
            im.alpha_composite(a, (c * O + (O - a.width) // 2, h * O + (O - 14 - a.height) // 2 + 2))
            dr.rectangle([c * O, h * O, c * O + O - 1, h * O + O - 1], outline=(60, 70, 88, 255))
            dr.text((c * O + 3, h * O + O - 13), str(b + i), fill=(255, 214, 110, 255))
        p = ra if len(fs) <= moi else ra.replace('.png', '_%02d.png' % (b // moi))
        im.save(p)
        print('->', p, len(lo), 'o')
    for i, f in enumerate(fs):
        sys.stdout.write('%d\t%s\n' % (i, f))

main()
