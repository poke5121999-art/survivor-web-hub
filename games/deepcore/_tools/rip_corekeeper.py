# -*- coding: utf-8 -*-
"""
Boc art tu Core Keeper dang cai tren may ra PNG + ban do khung hinh.

CHAY:   python games/deepcore/_tools/rip_corekeeper.py
NGUON:  D:/Steam/steamapps/common/Core Keeper/CoreKeeper_Data/data.unity3d
RA:     D:/CoreKeeperAssets/
          tex/<ten>.png       6.964 texture
          spr/<ten>.png       7.642 sprite da cat san
          frames.json         ten texture -> danh sach [x,y,w,h] cac khung
          textures.txt        danh muc de tra bang mat
          manifest.tsv

Buoc nay CHAY MOT LAN va ket qua nam NGOAI kho ma nguon (D:/CoreKeeperAssets).
Kho chi chua atlas da loc, do _tools/build_atlas.py sinh ra.

CAN: pip install UnityPy pillow numpy

--- Ba dieu can biet ve bo art nay ---

1. `frames.json` chi phu duoc ~737 texture. Core Keeper la game DOTS/ECS: phan
   lon hoat anh KHONG dung Sprite hay AnimationClip cua Unity, ma la mot DAI
   NGANG N khung deu nhau, so khung nam trong du lieu ECS khong doc duoc bang
   UnityPy. Nen build_atlas.py phai DO so khung bang anh.

2. Nhieu sinh vat duoc to mau bang BANG DAI MAU: anh goc chi la mat na do sang
   (xam hoan toan), mau that nam trong texture 256x1 ten `gm_<ten>`. Khong ap
   bang thi ca dan ve ra thanh khoi den. Co 415 bang nhu vay.

3. Nhan vat va TOAN BO 293 lop trang bi dung chung mot khuon 234x156 = luoi 9x6
   khung 26x26 (39 khung co dung). Do la ly do "doi mu vao thi thay cai mu" la
   chuyen mien phi: chi la ve them mot lop nua.
"""
import collections
import io
import json
import os
import re

import UnityPy

SRC = r'D:/Steam/steamapps/common/Core Keeper/CoreKeeper_Data/data.unity3d'
OUT = r'D:/CoreKeeperAssets'
TEX = OUT + '/tex'
SPR = OUT + '/spr'


def safe(n):
    n = re.sub(r'[<>:"/\\|?*]', '_', n or 'unnamed')
    return n[:120] or 'unnamed'


def main():
    if not os.path.exists(SRC):
        print('KHONG THAY %s -- Core Keeper chua cai?' % SRC)
        return
    for d in (TEX, SPR):
        if not os.path.isdir(d):
            os.makedirs(d)

    env = UnityPy.load(SRC)
    objs = list(env.objects)
    print('doc %d doi tuong' % len(objs))

    # ---- 1. xuat anh
    seen = collections.Counter()
    nt = ns = err = 0
    manifest = io.open(OUT + '/manifest.tsv', 'w', encoding='utf-8')
    manifest.write('kind\tfile\tname\tw\th\n')
    texlist = []
    tex_by_pid = {}

    for o in objs:
        tn = o.type.name
        if tn not in ('Texture2D', 'Sprite'):
            continue
        try:
            d = o.read()
            raw = getattr(d, 'm_Name', '')
            name = safe(raw)
            seen[(tn, name)] += 1
            if seen[(tn, name)] > 1:
                name = '%s__%d' % (name, o.path_id)
            img = d.image
            if img is None or img.size[0] == 0:
                continue
            if tn == 'Texture2D':
                img.save(os.path.join(TEX, name + '.png'))
                texlist.append((raw, img.size[0], img.size[1]))
                tex_by_pid[o.path_id] = (raw, img.size[0], img.size[1])
                nt += 1
            else:
                img.save(os.path.join(SPR, name + '.png'))
                ns += 1
            manifest.write('%s\t%s\t%s\t%d\t%d\n'
                           % (tn, name + '.png', raw, img.size[0], img.size[1]))
        except Exception:
            err += 1
    manifest.close()
    print('texture %d  sprite %d  loi %d' % (nt, ns, err))

    texlist.sort()
    with io.open(OUT + '/textures.txt', 'w', encoding='utf-8') as f:
        for n, w, h in texlist:
            f.write('%s\t%dx%d\n' % (n, w, h))

    # ---- 2. ban do khung hinh, lay tu cac doi tuong Sprite
    # Toa do cua Unity tinh tu DAY anh len; doi sang goc-tren-trai cho khop voi
    # canvas cua trinh duyet ngay tai day, de ben JS khong phai nho luat nao.
    groups = collections.defaultdict(list)
    for o in objs:
        if o.type.name != 'Sprite':
            continue
        try:
            d = o.read()
            tt = o.read_typetree()
            tpid = tt.get('m_RD', {}).get('texture', {}).get('m_PathID')
            tex = tex_by_pid.get(tpid)
            if not tex:
                continue
            r = d.m_Rect
            m = re.match(r'^(.*?)_(\d+)$', d.m_Name)
            idx = int(m.group(2)) if m else 0
            groups[tex[0]].append(
                (idx, d.m_Name, int(r.x), int(r.y), int(r.width), int(r.height), tex[2]))
        except Exception:
            pass

    out = {}
    for tname, arr in groups.items():
        arr.sort()
        th = arr[0][6]
        out[tname] = {
            'tex': [0, th],
            'frames': [[a[2], th - a[3] - a[5], a[4], a[5]] for a in arr],
            'names': [a[1] for a in arr],
        }
    io.open(OUT + '/frames.json', 'w', encoding='utf-8').write(
        json.dumps(out, ensure_ascii=False))
    print('ban do khung hinh: %d texture' % len(out))
    print('xong. Buoc tiep: python games/deepcore/_tools/build_atlas.py')


main()
