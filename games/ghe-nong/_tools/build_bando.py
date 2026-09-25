"""build_bando.py — bản đồ 5v5 của Teamfight Manager 2 cho Ghế Nóng.

Đọc thẳng bundle.game_data (dùng Kho của build_tfm.py). Ra:
  art/tfm/ban-duoi.png   các lớp nằm DƯỚI người: nền, bóng tường, tường, bóng bụi, bụi
  art/tfm/ban-tren.png   tường viền dưới, vẽ ĐÈ lên người (wall_5v5_front)
  art/tfm/ban-nho.png    bản đồ nhỏ (minimap_5v5: bg + wall)
  js/data-bando.js       window.BAN_DO: lưới tường/bụi, bảng đi thẳng, ba đường, toạ độ công trình

Chạy: python _tools/build_bando.py [đường dẫn bundle.game_data]
"""
import base64
import io
import json
import math
import os
import struct
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tfm import BUNDLE, GOC, IG, RA, Kho  # noqa: E402

# Toạ độ đo trên ảnh 1280×1280 của các lớp 5v5 (điểm ảnh), BÊN XANH. Bên đỏ = lật (x, y) → (y, x):
# lưới tường của map_setting đối xứng tuyệt đối qua đường chéo ấy (0/900 ô lệch), và sim đòi đúng
# phép đối xứng ấy để hai bên công bằng (chú thích trên DUONG trong sim.js).
# Cách đo (RESEARCH §13.1): bệ trụ là vùng màu (111,115,100) của background_5v5, tách thành nửa
# trên 42×30 và nửa dưới 48×36, tâm bệ = trung điểm hai nửa; bãi quái lớn là ô đá (58,72,81) 60×60;
# bãi nhỏ và hai hố quái lớn đo bằng cắt ảnh; loại quái ở bãi nào đọc từ
# UI_aseprite/ingame_mockup_5v5_new.png (lệch 32 px ngang so với lớp 1280).
GOC_SAN, SO_O, O_PX = 160, 30, 32          # sân bắt đầu ở (160,160), 30×30 ô, mỗi ô 32 px
XANH = {
    'loi': (254, 1026),                     # lõi (nexus)
    'gieng': (192, 1088),                   # dấu "+" trong nhà: chỗ hồi sinh
    'nha': [(273, 944), (337, 1008)],       # hai trụ đôi trước lõi
    'tru': {'tren': [(209, 688), (209, 432)],   # [trong, ngoài]
            'giua': [(401, 880), (526, 751)],
            'duoi': [(593, 1072), (849, 1072)]},
    # bãi quái phía xanh: (x, y, loại) — loại là khoá hoạt ảnh quai.<loại> trong atlas
    'bai': [(336, 750, 'nam'), (415, 608, 'goc'), (656, 910, 'tegiac'), (510, 960, 'ong')],
}
QUAI_LON = {'chua': (440, 440), 'rong': (830, 830)}   # epic (Morgard) và serpen, cả hai trên đường chéo
# ba đường, điểm ảnh, từ lõi xanh tới giữa; nửa kia là ảnh lật ngược lại
DUONG = {
    'tren': [(254, 1026), (240, 960), (240, 700), (240, 440), (248, 248)],
    'giua': [(254, 1026), (330, 950), (640, 640)],
    'duoi': [(254, 1026), (320, 1040), (580, 1040), (840, 1040), (1032, 1032)],
}


def sim(pt):
    """điểm ảnh → toạ độ sim 0..1000 (sân 960 px ↔ 1000 đơn vị)"""
    k = 1000 / (SO_O * O_PX)
    return [round((pt[0] - GOC_SAN) * k, 2), round((pt[1] - GOC_SAN) * k, 2)]


def lat(pt):
    return [pt[1], pt[0]]


def doc_map_setting(b):
    """map_setting.map_setting (nhị phân, u64 little-endian):
       1) vec[30] vec[30] vec[30] vec[30] u8 — với mỗi ô nguồn (hàng, cột), mặt nạ 30×30 các ô đi
          THẲNG tới được (tính cả bề dày người).
       2) u64 810000, u64 405000, rồi 405000 byte = 810000 ô 4 bit (nửa thấp trước): ô [a*900+b] là
          hướng bước đầu từ ô a tới ô b: 0 phải, 1 xuống, 2 trái, 3 lên, 4 phải-xuống, 5 trái-xuống,
          6 phải-lên, 7 trái-lên, 15 không tới được. Ô tường: cả hàng là 15.
       3) u64 27000, u64 13500, rồi 13500 byte 4 bit — chưa giải."""
    p = 0

    def u():
        return struct.unpack_from('<Q', b, p)[0]
    thay = bytearray(900 * 900)
    n = u(); p += 8
    for i in range(n):
        m = u(); p += 8
        for j in range(m):
            r = u(); p += 8
            for k in range(r):
                L = u(); p += 8
                goc = (i * 30 + j) * 900 + k * 30
                thay[goc:goc + L] = b[p:p + L]
                p += L
    so, so_byte = struct.unpack_from('<QQ', b, p); p += 16
    huong = []
    for x in b[p:p + so_byte]:
        huong += [x & 15, x >> 4]
    tuong = ''.join('1' if all(huong[a * 900 + j] == 15 for j in range(900)) else '0' for a in range(900))
    return thay, huong, tuong


def tham_so(duong, pt):
    """tham số t (0..1) của điểm gần nhất trên đường gấp khúc"""
    dai = [math.dist(duong[i], duong[i + 1]) for i in range(len(duong) - 1)]
    tong = sum(dai)
    tot, di = (1e18, 0), 0
    for i in range(len(duong) - 1):
        (ax, ay), (bx, by) = duong[i], duong[i + 1]
        L2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1
        k = max(0, min(1, ((pt[0] - ax) * (bx - ax) + (pt[1] - ay) * (by - ay)) / L2))
        d = math.dist((ax + (bx - ax) * k, ay + (by - ay) * k), pt)
        if d < tot[0]:
            tot = (d, (di + dai[i] * k) / tong)
        di += dai[i]
    return round(tot[1], 4)


def o_cua(pt):
    return int(pt[1] * SO_O / 1000) * SO_O + int(pt[0] * SO_O / 1000)


def main():
    kho = Kho(sys.argv[1] if len(sys.argv) > 1 else BUNDLE)
    IG5 = IG + '5v5/'

    def lop(ten):
        return Image.open(io.BytesIO(kho.byte(IG5 + ten + '.png'))).convert('RGBA')
    duoi = lop('background_5v5')
    for ten in ('wall_shadow_5v5', 'wall_5v5', 'bush_shadow_5v5', 'bush_5v5'):
        duoi.alpha_composite(lop(ten))
    os.makedirs(RA, exist_ok=True)
    duoi.save(os.path.join(RA, 'ban-duoi.png'), optimize=True)
    lop('wall_5v5_front').save(os.path.join(RA, 'ban-tren.png'), optimize=True)

    # bản đồ nhỏ: ô "bg" + "wall" của minimap_5v5 (toạ độ trong sprite_sheet là tỉ lệ 0..1)
    mm = Image.open(io.BytesIO(kho.byte(IG + 'minimap_5v5#sheet.png'))).convert('RGBA')
    ds = json.loads(kho.byte(IG + 'minimap_5v5#data.sprite_sheet'))['images']

    def cat_mm(k):
        d = ds[k]
        return mm.crop((round(d['x'] * mm.width), round(d['y'] * mm.height),
                        round((d['x'] + d['w']) * mm.width), round((d['y'] + d['h']) * mm.height)))
    nho, tuong_nho = cat_mm('bg_0'), cat_mm('wall_0')
    nho.alpha_composite(tuong_nho, ((nho.width - tuong_nho.width) // 2, (nho.height - tuong_nho.height) // 2))
    nho.save(os.path.join(RA, 'ban-nho.png'), optimize=True)

    thay, huong, tuong = doc_map_setting(kho.byte('asset/base/setting/map_setting.map_setting'))
    # bụi: ô có quá nửa diện tích phủ lớp bush_5v5
    bui_anh = lop('bush_5v5')
    bui = []
    for cy in range(SO_O):
        for cx in range(SO_O):
            x0, y0 = GOC_SAN + cx * O_PX, GOC_SAN + cy * O_PX
            phu = sum(1 for yy in range(y0, y0 + O_PX, 4) for xx in range(x0, x0 + O_PX, 4)
                      if bui_anh.getpixel((xx, yy))[3] > 0)
            bui.append('1' if phu > 32 else '0')
    bit = bytearray(900 * 900 // 8)
    for i, v in enumerate(thay):
        if v:
            bit[i >> 3] |= 1 << (i & 7)

    duong = {}
    for lane, nua in DUONG.items():
        di = [sim(p) for p in nua]
        ve = [lat(p) for p in reversed(di)]
        if di[-1] == ve[0]:
            ve = ve[1:]
        duong[lane] = di + ve
    tru = []
    for lane, ds_tru in XANH['tru'].items():
        for p in ds_tru:
            x = sim(p)
            tru.append([lane, tham_so(duong[lane], x), 'xanh'] + x)
            tru.append([lane, tham_so(duong[lane], lat(x)), 'do'] + lat(x))
    bai = [sim((px, py)) + ['xanh', loai] for px, py, loai in XANH['bai']]
    bai += [lat(b[:2]) + ['do', b[3]] for b in list(bai)]
    loi, gieng = sim(XANH['loi']), sim(XANH['gieng'])
    ban = {
        'o': SO_O, 'goc': GOC_SAN, 'oPx': O_PX, 'co': list(duoi.size),
        'tuong': tuong, 'bui': ''.join(bui),
        'thay': base64.b64encode(bytes(bit)).decode(),
        'duong': duong, 'tru': tru, 'bai': bai,
        'loi': {'xanh': loi, 'do': lat(loi)}, 'gieng': {'xanh': gieng, 'do': lat(gieng)},
        'nha': {'xanh': [sim(p) for p in XANH['nha']], 'do': [lat(sim(p)) for p in XANH['nha']]},
        'quaiLon': {k: sim(v) for k, v in QUAI_LON.items()},
    }

    # kiểm: mọi điểm quan trọng nằm trên ô đi được, và ba đường không cắt qua tường
    diem = [('loi', loi), ('gieng', gieng)] + [('tru ' + t[0], t[3:]) for t in tru] + \
        [('bai ' + b[3], b[:2]) for b in bai] + list(ban['quaiLon'].items()) + \
        [('nha', p) for p in ban['nha']['xanh'] + ban['nha']['do']]
    for ten, pt in diem:
        if tuong[o_cua(pt)] == '1':
            raise SystemExit('%s ở %s nằm trên ô tường' % (ten, pt))
    for lane, dd in duong.items():
        for i in range(len(dd) - 1):
            for k in range(41):
                x = dd[i][0] + (dd[i + 1][0] - dd[i][0]) * k / 40
                y = dd[i][1] + (dd[i + 1][1] - dd[i][1]) * k / 40
                if tuong[o_cua((x, y))] == '1':
                    raise SystemExit('đường %s cắt qua tường ở (%.0f,%.0f)' % (lane, x, y))

    js = ('/* sinh tự động bởi _tools/build_bando.py — đừng sửa tay. Nguồn: Teamfight Manager 2,\n'
          '   asset/base/setting/map_setting.map_setting và các lớp ingame/5v5. Toạ độ theo đơn vị sim 0..1000.\n'
          '   tuong/bui: 900 ký tự, ô (hàng, cột) ở vị trí hàng*30+cột. thay: 810000 bit (base64), bit a*900+b\n'
          '   = từ ô a đi thẳng tới ô b được. tru: [đường, t, đội, x, y]. bai: [x, y, đội gần, loại quái]. */\n'
          'window.BAN_DO = ' + json.dumps(ban, separators=(',', ':'), ensure_ascii=False) + ';\n')
    with io.open(os.path.join(GOC, 'js', 'data-bando.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('bản đồ: tường', tuong.count('1'), 'bụi', bui.count('1'), '· data-bando.js', len(js) // 1024, 'KB',
          '· ban-duoi.png', os.path.getsize(os.path.join(RA, 'ban-duoi.png')) // 1024, 'KB')


if __name__ == '__main__':
    main()
