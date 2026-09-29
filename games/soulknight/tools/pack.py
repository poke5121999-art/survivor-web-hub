# -*- coding: utf-8 -*-
"""Gom khung hinh thanh cac trang atlas, ghi toa do + diem neo."""
import hashlib
import os

from PIL import Image

PAD = 2
PAGE = 2048


class Packer:
    def __init__(self):
        self.frames = {}   # ten -> (img, ax, ay)
        self._by_hash = {}

    def add(self, name, img, ax, ay):
        """Them mot khung; trung ten nhung khac anh thi them hau to. Tra ve ten da dung."""
        img = img.convert('RGBA')
        h = hashlib.md5(img.tobytes() + str(img.size).encode() + ('%.2f,%.2f' % (ax, ay)).encode()).hexdigest()
        if h in self._by_hash:
            return self._by_hash[h]
        base, n, nm = name, 1, name
        while nm in self.frames:
            n += 1
            nm = '%s~%d' % (base, n)
        self.frames[nm] = (img, ax, ay)
        self._by_hash[h] = nm
        return nm

    def write(self, out_dir, prefix='atlas'):
        """Xep theo ke (shelf) tu cao xuong thap. -> {ten: [trang, x, y, w, h, ax, ay]}, [ten trang]"""
        items = sorted(self.frames.items(), key=lambda kv: (-kv[1][0].height, -kv[1][0].width, kv[0]))
        pages = []
        table = {}
        cur = None
        x = y = shelf = 0
        for nm, (img, ax, ay) in items:
            w, h = img.size
            if cur is None or x + w + PAD > PAGE:
                x = PAD
                y += shelf + PAD if cur is not None else 0
                shelf = 0
            if cur is None or y + h + PAD > PAGE:
                cur = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
                pages.append(cur)
                x, y, shelf = PAD, PAD, 0
            cur.paste(img, (x, y))
            table[nm] = [len(pages) - 1, x, y, w, h, round(ax, 2), round(ay, 2)]
            x += w + PAD
            shelf = max(shelf, h)
        names = []
        for i, p in enumerate(pages):
            bbox = p.getbbox() or (0, 0, 1, 1)
            hh = min(PAGE, bbox[3] + PAD)
            p = p.crop((0, 0, PAGE, hh))
            fn = '%s%d.png' % (prefix, i)
            p.save(os.path.join(out_dir, fn), optimize=True)
            names.append(fn)
        return table, names
