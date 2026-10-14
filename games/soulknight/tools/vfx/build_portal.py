# -*- coding: utf-8 -*-
"""Shader xoáy của cổng (prefab transfer_gate) -> data/sk-portal.js + art/vfx/portal/*.png.

Chạy: PYTHONIOENCODING=utf-8 python tools/vfx/build_portal.py   (từ games/soulknight; cần UnityPy, lz4)

[ĐO] transfer_gate có hai SpriteRenderer dùng sprite UISprite (quad trắng) với shader riêng:
  - main       : vật liệu level_portal,       shader "Sprites/Soul Knight Portal" (vòng ngoài, lớp 4 thứ tự 1)
  - innerWhirl : vật liệu level_portal_inner, shader "Sprites/SoulKnightPortal"   (xoáy trong, lớp 4 thứ tự 2)
Shader nằm trong Shader.compressedBlob (LZ4); nền tảng 5 = GLES2 lưu sẵn GLSL ES 1.0, nên đọc thẳng mã đoạn (fragment)
đã dịch từ HLSL, không phải suy từ tên thuộc tính. Tool lấy: mã fragment, số (float/màu) của vật liệu, tên + kiểu wrap
của texture, rồi chép texture ra PNG. Thông số vật liệu đọc từ m_SavedProperties.
Chưa đọc được: trạng thái Blend của pass (bộ xuất ShaderLab của UnityPy không in Blend); web dùng One OneMinusSrcAlpha
(sprite có trước alpha) [ƯỚC LƯỢNG].
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import lz4.block  # noqa: E402
from abx import Env  # noqa: E402

OUT_PNG = os.path.join(GAME, 'art', 'vfx', 'portal')
OUT_JS = os.path.join(GAME, 'data', 'sk-portal.js')
SHADERS = {'outer': ('level_portal', 'Sprites/Soul Knight Portal'), 'inner': ('level_portal_inner', 'Sprites/SoulKnightPortal')}
WRAP = {0: 'repeat', 1: 'clamp', 2: 'mirror'}


def fragment(E, cab, tree):
    blob = bytes(tree['compressedBlob'])
    i = tree['platforms'].index(5)   # GLES2: văn bản GLSL
    off, cl, dl = tree['offsets'][i][0], tree['compressedLengths'][i][0], tree['decompressedLengths'][i][0]
    raw = lz4.block.decompress(blob[off:off + cl], uncompressed_size=dl)
    seg = re.findall(rb'[\x09\x0a\x0d\x20-\x7e]{200,}', raw)[0].decode('ascii')   # biến thể đầu = không từ khoá
    frag = seg[seg.index('#ifdef FRAGMENT') + len('#ifdef FRAGMENT'):]
    frag = frag[:frag.rindex('#endif')]
    return frag.replace('#version 100', '').strip() + '\n'


def main():
    E = Env(['common.ab'], dep_depth=1)
    os.makedirs(OUT_PNG, exist_ok=True)
    out = {}
    shaders = {}
    for cab, sf in E.files.items():
        for o in list(sf.objects.values()):
            if o.type.name == 'Shader':
                t = E.tree(cab, o)
                n = (t.get('m_ParsedForm') or {}).get('m_Name')
                if n in [v[1] for v in SHADERS.values()] and n not in shaders:
                    shaders[n] = (cab, t)
    tex_done = {}
    for kind, (mat, shn) in SHADERS.items():
        found = None
        for cab, sf in E.files.items():
            for o in list(sf.objects.values()):
                if o.type.name == 'Material':
                    t = E.tree(cab, o)
                    if t.get('m_Name') == mat:
                        found = (cab, t)
                        break
            if found:
                break
        cab, t = found
        sp = t['m_SavedProperties']
        texs = {}
        for name, b in sp['m_TexEnvs']:
            r = E.resolve(b['m_Texture'], cab)
            if not r:
                continue
            tt = E.tree(*r)
            n = tt['m_Name']
            if n not in tex_done:
                img = r[1].read().image
                img.save(os.path.join(OUT_PNG, n + '.png'), optimize=True)
                ts = tt.get('m_TextureSettings', {})
                tex_done[n] = {'w': img.width, 'h': img.height, 'wrap': WRAP.get(ts.get('m_WrapU'), 'clamp')}
            texs[name] = n
        out[kind] = {
            'shader': shn, 'material': mat, 'tex': texs,
            'floats': {k: round(v, 6) for k, v in sp['m_Floats']},
            'colors': {k: [round(v[c], 6) for c in 'rgba'] for k, v in sp['m_Colors']},
            'frag': fragment(E, *shaders[shn]),
        }
    data = {'textures': tex_done, 'passes': out}
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/vfx/build_portal.py — không sửa tay.\n')
        f.write('window.SK_PORTAL = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('textures', sorted(tex_done), '->', OUT_PNG)
    print('data ->', OUT_JS, os.path.getsize(OUT_JS), 'bytes')


if __name__ == '__main__':
    main()
