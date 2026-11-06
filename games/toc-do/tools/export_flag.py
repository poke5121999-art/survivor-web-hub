"""Dựng cờ caro luyện tập (Huấn luyện tự do: Thiết lập điểm cờ) -> art/practice/flag.glb + flag_checker.png.

Dùng: venv/bin/python -I export_flag.py

APK không có mesh cờ caro: cờ 3D duy nhất là vật trang trí của đường e_bhyuchang
(c_aniobj_flag.fbx, mesh E_BHyuchang_AQizhi_01 192 đỉnh, tấm băng-rôn trong cảnh chiến trường; không phải cờ caro, hoạt ảnh
Flag_Idle không nằm cùng bundle) và e_nature001_zd_windflag. Clip gốc (wz6r3nirB7c t=45) cho thấy cờ caro đen-trắng khổng lồ trên cột cao, có tia sáng
trắng dọc cột. Nên đây là đồ tự dựng (chọn) từ hình học đơn giản:
  - cột trụ 16 m, mũ cầu trên đỉnh, đế;
  - tấm vải 9 × 5,4 m chia 24×12 ô lưới đỉnh (lớp vẽ gợn sóng bằng cách dịch đỉnh theo thời gian: positions gốc nằm sẵn trong glb);
  - texture caro 8×5 ô đen-trắng (png nhúng).
Biểu tượng nút: icon_flag.png cắt từ atlas ig_ingame_ui3 (sprite Icon_Flag, đúng icon_flag của HUD gốc); mũi tên xanh "Về điểm cờ"
và dấu X "Xóa điểm cờ" không tìm thấy trong hai atlas ig_ingame*, view/practice.js tự vẽ.
Tia sáng không nằm trong glb: view/practice.js dựng từ art/fx/fx_glow_09610_1.webp (dải sáng đứng gốc của kho VFX).
Quy ước: tay phải của three.js, +y lên; cột ở gốc, vải trải về +x.
"""
import io, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_track as T  # noqa: E402

OUT = os.path.join(T.GAME, 'art', 'practice')
POLE_H, POLE_R = 16.0, 0.22
CLOTH_W, CLOTH_H = 9.0, 5.4
NX, NY = 24, 12


def checker_png():
    cols, rows, cell = 8, 5, 32
    a = np.zeros((rows * cell, cols * cell, 3), np.uint8)
    for r in range(rows):
        for c in range(cols):
            a[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = 245 if (r + c) % 2 == 0 else 18
    b = io.BytesIO()
    Image.fromarray(a).save(b, 'PNG', optimize=True)
    return b.getvalue()


def cylinder(r, h, y0, seg=16):
    pos, nrm, idx = [], [], []
    for i in range(seg + 1):
        t = 2 * np.pi * i / seg
        c, s = np.cos(t), np.sin(t)
        pos += [[r * c, y0, r * s], [r * c, y0 + h, r * s]]
        nrm += [[c, 0, s]] * 2
    for i in range(seg):
        a = 2 * i
        idx += [a, a + 1, a + 2, a + 1, a + 3, a + 2]
    return np.array(pos, np.float32), np.array(nrm, np.float32), np.array(idx, np.uint32)


def sphere(r, cy, seg=14):
    pos, nrm, idx = [], [], []
    for j in range(seg + 1):
        p = np.pi * j / seg
        for i in range(seg + 1):
            t = 2 * np.pi * i / seg
            n = [np.sin(p) * np.cos(t), np.cos(p), np.sin(p) * np.sin(t)]
            pos.append([r * n[0], cy + r * n[1], r * n[2]]); nrm.append(n)
    for j in range(seg):
        for i in range(seg):
            a = j * (seg + 1) + i; b = a + seg + 1
            idx += [a, b, a + 1, a + 1, b, b + 1]
    return np.array(pos, np.float32), np.array(nrm, np.float32), np.array(idx, np.uint32)


def cloth():
    """Lưới (NX+1)×(NY+1); mép trái dính cột (x=0.14) tại đỉnh cột; UV: u theo x, v từ trên xuống."""
    top = POLE_H - 0.5
    pos, uv = [], []
    for j in range(NY + 1):
        for i in range(NX + 1):
            pos.append([POLE_R + CLOTH_W * i / NX, top - CLOTH_H * j / NY, 0])
            uv.append([i / NX, j / NY])
    idx = []
    for j in range(NY):
        for i in range(NX):
            a = j * (NX + 1) + i; b = a + NX + 1
            idx += [a, a + 1, b, a + 1, b + 1, b]    # +z phía trước, CCW
    n = np.tile([0, 0, 1.0], (len(pos), 1))
    return np.array(pos, np.float32), n.astype(np.float32), np.array(uv, np.float32), np.array(idx, np.uint32)


def icon():
    import export_fx_ui as F
    cat = F.atlas_catalog()
    k = next(k for k in cat if k.endswith('/ig_ingame_ui3/ig_ingame_ui3.prefab'))
    sp = next(s for s in cat[k]['sprites'] if s[0] == 'Icon_Flag')
    _, x, y, w, h = sp[:5]
    F.atlas_image(k).crop((x, y, x + w, y + h)).save(os.path.join(OUT, 'icon_flag.png'), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    icon()
    g = T.GLB()
    g.j.pop('extensionsUsed'); g.j.pop('extensionsRequired')
    png = checker_png()
    open(os.path.join(OUT, 'flag_checker.png'), 'wb').write(png)
    bv = g.view(png)
    g.j['images'].append({'bufferView': bv, 'mimeType': 'image/png'})
    g.j['textures'].append({'sampler': 0, 'source': 0})
    g.j['materials'] = [
        {'name': 'pole', 'pbrMetallicRoughness': {'baseColorFactor': [0.86, 0.88, 0.92, 1], 'metallicFactor': 0.6, 'roughnessFactor': 0.35}},
        {'name': 'cloth', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.8}},
    ]
    parts = [('pole', 0, cylinder(POLE_R, POLE_H, 0)), ('cap', 0, sphere(POLE_R * 2.2, POLE_H + 0.1)), ('base', 0, cylinder(0.5, 0.25, 0, 20))]
    for name, mat, (p, n, i) in parts:
        at = {'POSITION': g.acc(p, 'VEC3', 34962, True), 'NORMAL': g.acc(n, 'VEC3', 34962)}
        g.j['meshes'].append({'name': name, 'primitives': [{'attributes': at, 'indices': g.acc(i, 'SCALAR', 34963), 'material': mat}]})
        g.j['nodes'].append({'name': name, 'mesh': len(g.j['meshes']) - 1})
        g.j['scenes'][0]['nodes'].append(len(g.j['nodes']) - 1)
    p, n, uv, i = cloth()
    at = {'POSITION': g.acc(p, 'VEC3', 34962, True), 'NORMAL': g.acc(n, 'VEC3', 34962), 'TEXCOORD_0': g.acc(uv, 'VEC2', 34962)}
    g.j['meshes'].append({'name': 'cloth', 'primitives': [{'attributes': at, 'indices': g.acc(i, 'SCALAR', 34963), 'material': 1}]})
    g.j['nodes'].append({'name': 'cloth', 'mesh': len(g.j['meshes']) - 1})
    g.j['scenes'][0]['nodes'].append(len(g.j['nodes']) - 1)
    g.write(os.path.join(OUT, 'flag.glb'))
    json.dump({'poleH': POLE_H, 'clothW': CLOTH_W, 'clothH': CLOTH_H, 'nx': NX, 'ny': NY, 'src': 'tự dựng (APK không có cờ caro)'},
              open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    print('flag.glb', os.path.getsize(os.path.join(OUT, 'flag.glb')), 'byte')


if __name__ == '__main__':
    main()
