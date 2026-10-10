# -*- coding: utf-8 -*-
"""Sảnh (phòng khách) Soul Knight 8.6 -> art/hall/hall_0.png + data/sk-hall.js.

Chạy (từ gốc repo): PYTHONIOENCODING=utf-8 python games/soulknight/tools/hall/build_hall.py

Nguồn: hero_room/hall/skin_0.ab › prefab hall_0_normal (tilemap sàn/tường, SpriteRenderer, PolygonCollider2D tường,
cửa function/door_enter, 20 ô nội thất function/slots/*). Nội thất là prefab riêng (hero_room/common.ab `<ô>_0_normal`),
bóc vào sk-data.js qua tools/extra/hall.json và vẽ lúc chạy bằng SK.drawPrefab.
Nướng nền bằng render() của tools/season/extract_terrain.py (cùng thứ tự sắp xếp, cùng 16 px/đv).
"""
import hashlib
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'season'))
import skrip  # noqa: E402
# extract_terrain tạo thư mục SK_SEASON_TERRAIN lúc nạp; mặc định của nó là đường Windows.
os.environ.setdefault('SK_SEASON_TERRAIN', os.path.join(skrip.REF, 'work', 'season', 'terrain'))
import extract_terrain as ET  # noqa: E402
from skrip import Rip  # noqa: E402
from PIL import Image  # noqa: E402

BUNDLE = 'hero_room/hall/skin_0'
TOP = '/hall_0_normal'
# Khu Vườn (bên trái sảnh): hero_room/garden/skin_0 › garden_0_normal dùng cùng toạ độ thế giới với sảnh (sàn vườn x -70..-23,
# sảnh bắt đầu từ x -22), nên ghép thẳng: nền = sàn/tường/cây của vườn + sảnh, nội thất vườn (ô trồng, bình tưới, xẻng, phân bón) vẽ lúc chạy.
G_BUNDLE = 'hero_room/garden/skin_0'
G_TOP = '/garden_0_normal'
OUT_PNG = os.path.join(GAME, 'art', 'hall', 'hall_0.png')
OUT_TOP = os.path.join(GAME, 'art', 'hall', 'hall_0_top.png')
OUT_JS = os.path.join(GAME, 'data', 'sk-hall.js')
PX = ET.PX
MASK = 2            # ô mặt nạ đi được = 1/MASK đv
PAD_TOP = 5         # tường sau cao hơn hàng sàn trên cùng (đv) [ĐO bbox map_collider4: y 6,9 → 14,9]
PAD = 1


def point_in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def main():
    ET.TOP = TOP
    ET.r = hall_r = Rip(bundles=[BUNDLE])
    cab = ET.r.loaded[BUNDLE + '.ab'][0]
    nodes, roots = ET.build_graph(cab)
    objs = ET.objects_json(cab, nodes, roots)
    by_path = {o['path']: o for o in objs if o['canonical']}
    tms = ET.tilemaps_json(cab, nodes)

    floor = next(t for t in tms if t['name'] == 'floor_lobby')
    gx, gy = floor['gridWorld']
    cells = {(gx + c[0], gy + c[1]) for c in floor['cells']}          # góc dưới-trái ô, đv thế giới
    minx = min(x for x, _ in cells) - PAD
    maxx = max(x for x, _ in cells) + 1 + PAD
    miny = min(y for _, y in cells) - PAD
    maxy = max(y for _, y in cells) + 1 + PAD_TOP

    solids = []
    for o in objs:
        if not o['canonical'] or '/map_collider/' not in o['path']:
            continue
        c = next(c for c in o['components'] if c['type'] == 'PolygonCollider2D')
        wx, wy = o['world']
        for path in c['fields']['m_Points']['m_Paths']:
            solids.append([[round(p['x'] + wx, 3), round(p['y'] + wy, 3)] for p in path])

    # ---- Khu Vườn: nạp bundle vườn (ET.r/ET.TOP là biến toàn cục của extract_terrain nên nạp sau khi đã xong phần sảnh)
    main = (minx, miny, maxx, maxy)
    hall_cab, hall_nodes, hall_tms = cab, nodes, tms
    ET.TOP = G_TOP
    ET.r = Rip(bundles=[G_BUNDLE])
    gcab = ET.r.loaded[G_BUNDLE + '.ab'][0]
    gnodes, groots = ET.build_graph(gcab)
    gobjs = ET.objects_json(gcab, gnodes, groots)
    gby = {o['path']: o for o in gobjs if o['canonical']}
    gtms = ET.tilemaps_json(gcab, gnodes)
    gfloor = next(t for t in gtms if t['name'] == 'floor_garden')
    ggx, ggy = gfloor['gridWorld']
    gcells = {(ggx + c[0], ggy + c[1]) for c in gfloor['cells']}
    # Tường vườn là BoxCollider2D xoay chéo; mặt nạ đi được của vườn lấy theo ô sàn floor_garden (tường nằm ngoài sàn).
    gminx = min(x for x, _ in gcells) - PAD
    gmaxx = max(x for x, _ in gcells) + 1 + PAD
    gminy = min(y for _, y in gcells) - PAD
    gmaxy = max(y for _, y in gcells) + 1 + PAD_TOP
    gb = (gminx, gminy, gmaxx, gmaxy)
    garden = {'plots': [list(gby[G_TOP + '/function/plant_pot_slots/slot_%d' % i]['world']) for i in range(8)]}
    for key, nm in (('can', 'weapon_shower'), ('shovel', 'weapon_shovel'), ('fert', 'object_fertilize')):
        garden[key] = list(gby[G_TOP + '/function/stuffs_slot/' + nm]['world'])
    # Nhân vật/bù nhìn/giếng của vườn (dưới /function/) chưa có ở web: không vẽ vào nền; nội thất vườn vẽ lúc chạy từ prefab.
    for n in gnodes.values():
        if n.path.startswith(G_TOP + '/function/') or n.path == G_TOP + '/function':
            n.canon = False
    cells |= gcells
    minx, miny = min(minx, gminx), min(miny, gminy)
    maxx, maxy = max(maxx, gmaxx), max(maxy, gmaxy)
    bounds = (minx, miny, maxx, maxy)

    w, h = int((maxx - minx) * MASK), int((maxy - miny) * MASK)
    rows = []
    for j in range(h):
        y = maxy - (j + 0.5) / MASK
        row = []
        for i in range(w):
            x = minx + (i + 0.5) / MASK
            walk = (int(x // 1), int(y // 1)) in cells and not any(point_in_poly(x, y, s) for s in solids)
            row.append('.' if walk else '#')
        rows.append(''.join(row))

    door = by_path[TOP + '/function/door_enter']
    dc = next(c for c in door['components'] if c['type'] == 'BoxCollider2D')
    slots = []
    for o in objs:
        if o['canonical'] and o['path'].startswith(TOP + '/function/slots/'):
            slots.append({'slot': o['name'][:-5], 'x': o['world'][0], 'y': o['world'][1]})
    for name in ('drink_seller', 'fish_bowl'):
        o = by_path[TOP + '/function/' + name + '_slot']
        slots.append({'slot': name, 'x': o['world'][0], 'y': o['world'][1]})

    # Đồ trang trí riêng của nhân vật (vòng phép, quan tài, hộp đồ nghề...): mốc đứng của nhân vật trong sảnh [SUY].
    deco = {o['name']: o['world'] for o in objs if o['canonical'] and o['path'].startswith(TOP + '/objects/') and o['depth'] == 2}

    # Hai lớp: sàn + tường (tilemap) rồi đồ trang trí (SpriteRenderer, nền trong suốt); thảm và đồ nằm sàn vẽ chen giữa.
    BG = (24, 28, 34, 255)
    W_, H_ = int((maxx - minx) * PX), int((maxy - miny) * PX)
    canvas = Image.new('RGBA', (W_, H_), BG)
    deco_img = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))

    def put(dst, src, b, alpha):
        pos = (int(round((b[0] - minx) * PX)), int(round((maxy - b[3]) * PX)))
        if alpha:
            dst.alpha_composite(src, pos)
        else:
            dst.paste(src, pos)
    # vườn trước (nền đặc), sảnh sau (nền trong suốt để cột đệm của sảnh không che sàn vườn)
    put(canvas, ET.render(gcab, gnodes, gtms, {}, gb, {'sr': False}), gb, False)
    put(deco_img, ET.render(gcab, gnodes, gtms, {}, gb, {'tiles': False, 'bg': (0, 0, 0, 0)}), gb, True)
    ET.r = hall_r
    put(canvas, ET.render(hall_cab, hall_nodes, hall_tms, {}, main, {'sr': False, 'bg': (0, 0, 0, 0)}), main, True)
    put(deco_img, ET.render(hall_cab, hall_nodes, hall_tms, {}, main, {'tiles': False, 'bg': (0, 0, 0, 0)}), main, True)
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    canvas.save(OUT_PNG, optimize=True)
    deco_img.save(OUT_TOP, optimize=True)
    v = hashlib.md5(open(OUT_PNG, 'rb').read() + open(OUT_TOP, 'rb').read()).hexdigest()[:10]

    data = {
        'ppu': PX, 'bounds': [minx, miny, maxx, maxy], 'img': 'art/hall/hall_0.png', 'top': 'art/hall/hall_0_top.png', 'v': v, 'mask': MASK, 'walk': rows,
        'door': {'x': round(door['world'][0] + dc['offset'][0], 3), 'y': round(door['world'][1] + dc['offset'][1], 3),
                 'w': dc['size'][0], 'h': dc['size'][1]},
        'slots': slots, 'deco': deco, 'solids': solids, 'main': list(main), 'garden': garden,
    }
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/hall/build_hall.py — không sửa tay.\n')
        f.write('window.SK_HALL = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    walk = sum(r.count('.') for r in rows)
    print('hall', canvas.size, 'bounds', (minx, miny, maxx, maxy), 'floor cells', len(cells), 'walk', walk, '/', w * h,
          'solids', len(solids), 'slots', len(slots), 'door', data['door'])


if __name__ == '__main__':
    main()
