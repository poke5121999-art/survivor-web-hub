# -*- coding: utf-8 -*-
"""Shared atlas packer for the D2 asset levers (build_sprites, build_objects, build_ui).

Frames are RGBA numpy arrays plus an anchor; pack() trims each frame to its alpha bbox,
shelf-packs them into one or more WebP pages and returns the manifest rects.

Rect contract (assets/*.js, read by js/engine.js):
    [x, y, w, h, ox, oy, page]
    draw the source rect (x, y, w, h) of page `page` with its top-left at
    (anchorX - ox, anchorY - oy), anchor = the unit's feet on screen.
"""
import os

import numpy as np
from PIL import Image

PAGE_W = 2048
PAGE_H = 2048
PAD = 1


def trim(rgba, ax, ay):
    """rgba (h,w,4), anchor (ax, ay) inside it -> (cropped, ox, oy) or None if empty."""
    a = rgba[..., 3]
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return rgba[y0:y1, x0:x1], int(ax - x0), int(ay - y0)


class Atlas(object):
    """Collects frames, then save() writes <out_dir>/<name>_<n>.webp pages."""

    def __init__(self, name, out_dir, web_dir, page_w=PAGE_W, page_h=PAGE_H):
        self.name, self.out_dir, self.web_dir = name, out_dir, web_dir
        self.page_w, self.page_h = page_w, page_h
        self.items = []

    def add(self, rgba, ax, ay):
        """Queue one frame. Returns a rect list filled in by save(); [] for an empty frame."""
        t = trim(rgba, ax, ay)
        rect = []
        if t is not None:
            self.items.append((t[0], t[1], t[2], rect))
        return rect

    def save(self, lossless=True, quality=90):
        """Shelf-pack tallest first. Returns the list of page paths relative to the game root."""
        order = sorted(self.items, key=lambda it: -it[0].shape[0])
        pages, cur = [], None
        x = y = shelf = 0
        for img, ox, oy, rect in order:
            h, w = img.shape[:2]
            if w > self.page_w or h > self.page_h:
                raise ValueError('%s: frame %dx%d is larger than a page' % (self.name, w, h))
            if cur is None or x + w > self.page_w:
                x, y, shelf = 0, y + shelf + PAD, 0
            if cur is None or y + h > self.page_h:
                cur = np.zeros((self.page_h, self.page_w, 4), np.uint8)
                pages.append([cur, 0])
                x = y = shelf = 0
            cur[y:y + h, x:x + w] = img
            pages[-1][1] = max(pages[-1][1], y + h)
            rect.extend([x, y, w, h, ox, oy, len(pages) - 1])
            x += w + PAD
            shelf = max(shelf, h)
        os.makedirs(self.out_dir, exist_ok=True)
        paths = []
        for i, (arr, used_h) in enumerate(pages):
            fn = '%s_%d.webp' % (self.name, i)
            im = Image.fromarray(arr[:max(1, used_h)])
            im.save(os.path.join(self.out_dir, fn), 'WEBP', lossless=lossless, quality=quality, method=6)
            paths.append(self.web_dir.rstrip('/') + '/' + fn)
        return paths
