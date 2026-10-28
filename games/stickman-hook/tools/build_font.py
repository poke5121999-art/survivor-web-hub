"""Bake the game's TMP SDF font (JUNEGULL RG SDF) into a small white bitmap font with a dark outline.

    py -3 -I build_font.py [REF=D:/stickman-hook-ref]
Writes ../art/font.webp and ../data/font.json {size, lineHeight, base, glyphs: {char: [x,y,w,h,ox,oy,adv]}}.
"""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
import UnityPy

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__)); GAME = os.path.dirname(HERE)
B = REF + '/apk/assets/aa/Android/duplicateassetssortedbylabel_assets_bundle32_cb4b8c1b528efff64ba4f5be41f25c4f.bundle'
CHARS = ''.join(chr(c) for c in range(32, 127)) + 'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ'

env = UnityPy.load(B)
fa = tex = None
for o in env.objects:
    if o.type.name == 'MonoBehaviour':
        t = o.read_typetree()
        if 'm_GlyphTable' in t: fa = t
    if o.type.name == 'Texture2D':
        tex = o.read()
sdf = np.asarray(tex.image.convert('RGBA'))[:, :, 3].astype(np.float32) / 255.0
AH = sdf.shape[0]
face = fa['m_FaceInfo']; pad = fa['m_AtlasPadding']
glyph_by_index = {g['m_Index']: g for g in fa['m_GlyphTable']}
chars = {c['m_Unicode']: glyph_by_index.get(c['m_GlyphIndex']) for c in fa['m_CharacterTable']}

S = 0.5  # output scale vs the SDF sampling size
fill = np.clip((sdf - 0.5) / 0.04 + 0.5, 0, 1)
outline = np.clip((sdf - 0.36) / 0.04 + 0.5, 0, 1)
rgba = np.zeros(sdf.shape + (4,), np.float32)
rgba[..., 0:3] = fill[..., None] * 1.0 + (1 - fill[..., None]) * 0.06
rgba[..., 3] = np.maximum(fill, outline)
full = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')

items = []
for ch in CHARS:
    g = chars.get(ord(ch))
    if g is None: continue
    r = g['m_GlyphRect']; m = g['m_Metrics']
    x0, y0 = r['m_X'] - pad // 2, AH - (r['m_Y'] + r['m_Height']) - pad // 2
    w, h = r['m_Width'] + pad, r['m_Height'] + pad
    crop = full.crop((x0, y0, x0 + w, y0 + h))
    crop = crop.resize((max(1, round(w * S)), max(1, round(h * S))), Image.LANCZOS)
    items.append((ch, crop, (m['m_HorizontalBearingX'] - pad / 2) * S, (m['m_HorizontalBearingY'] + pad / 2) * S, m['m_HorizontalAdvance'] * S))
W = 512; x = y = shelf = 0; glyphs = {}
for ch, im, ox, oy, adv in sorted(items, key=lambda t: -t[1].height):
    if x + im.width + 1 > W: x = 0; y += shelf + 1; shelf = 0
    glyphs[ch] = [x, y, im.width, im.height, round(ox, 2), round(oy, 2), round(adv, 2)]
    x += im.width + 1; shelf = max(shelf, im.height)
atlas = Image.new('RGBA', (W, y + shelf))
for ch, im, *_ in items:
    g = glyphs[ch]; atlas.paste(im, (g[0], g[1]))
atlas.save(os.path.join(GAME, 'art/font.webp'), lossless=True, method=6)
json.dump({'size': round(face['m_PointSize'] * S, 2), 'lineHeight': round(face['m_LineHeight'] * S, 2),
           'ascent': round(face['m_AscentLine'] * S, 2), 'glyphs': glyphs},
          open(os.path.join(GAME, 'data/font.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('glyphs', len(glyphs), 'of', len(CHARS), 'atlas', atlas.size, 'pointSize', face['m_PointSize'])
