# -*- coding: utf-8 -*-
"""Sảnh (phòng khách) Soul Knight 8.6 -> art/hall/hall_0.png + data/sk-hall.js.

Chạy (từ gốc repo): PYTHONIOENCODING=utf-8 python games/soulknight/tools/hall/build_hall.py

Nguồn: hero_room/hall/skin_0.ab › prefab hall_0_normal (tilemap sàn/tường, SpriteRenderer, PolygonCollider2D tường,
cửa function/door_enter, 20 ô nội thất function/slots/*). Nội thất là prefab riêng (hero_room/common.ab `<ô>_0_normal`),
bóc vào sk-data.js qua tools/extra/hall.json và vẽ lúc chạy bằng SK.drawPrefab.
Nướng nền bằng render() của tools/season/extract_terrain.py (cùng thứ tự sắp xếp, cùng 16 px/đv).

Ánh sáng: 9 SpriteRenderer skin/light/lobby1..9 (sprite light_01, vật liệu `light` = Legacy Shaders/Particles/Additive,
_TintColor (1,1,1,1)) và viền tối skin/lobby_edge (black_edge_0, vẽ kiểu Sliced 38 × 16 đv, đen alpha 0,118) [ĐO prefab].
Đèn nằm ở lớp Floor/Shadow (dưới tường trước, trên sàn và tường sau) nên nướng thẳng vào hall_0.png theo đúng thứ tự
(lớp, order) xen giữa các tilemap; công thức cộng màu ở add_light(). Bẫy: SpriteRenderer trỏ bản light_01 đã gói vào atlas
effect_light (texture rỗng), nên lấy bản light_01 rời cùng CAB (40 × 40 px); atlas lọc Bilinear [ĐO] nên phóng bằng BILINEAR.

Cảnh HeroRoom (level3 trong UnityDataAssetPack/assets/bin/Data/datapack.unity3d, không nằm trong bundle nào): characters/cNN là
chỗ đứng của nhân vật số NN trong sảnh, Main Camera là camera sảnh. scene_hall() đọc ra `heroes` và `camera` trong sk-hall.js.
"""
import hashlib
import io
import json
import os
import sys

import numpy as np

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


def sprite_any(cab, ptr):
    """Sprite theo con trỏ; bản đã gói atlas không giải được thì lấy bản cùng tên có texture riêng trong cùng CAB."""
    s = ET.get_sprite(cab, ptr)
    if s is not None:
        return s
    h = ET.r.resolve(ptr, cab)
    if h is None:
        return None
    name = ET.r.tree(*h).get('m_Name')
    for o in ET.r._file(h[0]).objects.values():
        if o.type.name == 'Sprite' and o.path_id != h[1].path_id:
            t = ET.r.tree(h[0], o)
            if t.get('m_Name') == name and t['m_RD']['texture']['m_PathID']:
                return ET.r.sprite(h[0], o)
    return None


def active_chain(n):
    while n is not None:
        if not n.tree.get('m_IsActive', 1):
            return False
        n = n.parent
    return True


def fx_items(cab, nodes):
    """Đèn + viền tối của sảnh: [((lớp, order), loại, dữ liệu)]; đánh dấu các nút này khỏi lượt nướng SpriteRenderer."""
    out = []
    for n in nodes.values():
        light = n.path.startswith(TOP + '/skin/light/')
        if not (light or n.path == TOP + '/skin/lobby_edge') or not n.canon or not active_chain(n):
            continue
        for tn, o in n.comps:
            if tn != 'SpriteRenderer':
                continue
            t = ET.r.tree(cab, o)
            if not t['m_Enabled'] or not t['m_Sprite']['m_PathID']:
                continue
            s = sprite_any(cab, t['m_Sprite'])
            if s is None:
                print('  thiếu sprite', n.path)
                continue
            key = (t['m_SortingLayer'], t['m_SortingOrder'])
            col = [t['m_Color'][k] for k in 'rgba']
            ws, _ = ET.mat_info(n.world)
            if light:
                out.append((key, 'light', (s, n.world[4], n.world[5], ws[0], ws[1], col)))
            else:
                border = ET.r.tree(*ET.r.resolve(t['m_Sprite'], cab))['m_Border']
                out.append((key, 'sliced', (s, n.world[4], n.world[5], t['m_Size']['x'] * ws[0], t['m_Size']['y'] * ws[1], col, border)))
            n.canon = False
    return out


def add_light(canvas, spr, wx, wy, sx, sy, col, bounds):
    """Legacy Shaders/Particles/Additive (shader dựng sẵn của Unity): màu = 2 · màu đỉnh · _TintColor(1,1,1,1) · tex,
    alpha = saturate(2 · a đỉnh · tex.a), trộn SrcAlpha One; khung đệm 8 bit kẹp màu ra về [0,1] trước khi trộn."""
    minx, miny, maxx, maxy = bounds
    name, img, ax, ay, ppu = spr
    f = PX / ppu
    w, h = img.size
    nw, nh = max(1, int(round(w * f * abs(sx)))), max(1, int(round(h * f * abs(sy))))
    im = np.asarray(img.resize((nw, nh), Image.BILINEAR), dtype=np.float32) / 255.0
    X = int(round((wx - minx) * PX - ax * nw / w))
    Y = int(round((maxy - wy) * PX - ay * nh / h))
    rgb = np.clip(2.0 * im[..., :3] * np.array(col[:3], dtype=np.float32), 0, 1)
    al = np.clip(2.0 * im[..., 3] * col[3], 0, 1)
    add = rgb * al[..., None] * 255.0
    cv = np.asarray(canvas, dtype=np.float32)
    H, W = cv.shape[:2]
    x0, y0, x1, y1 = max(0, X), max(0, Y), min(W, X + nw), min(H, Y + nh)
    if x1 <= x0 or y1 <= y0:
        return canvas
    # Chỉ cộng lên chỗ đã có hình: ngoài tường bản gốc bị các mặt nạ đen (room/objects/masks, lớp UI) che, web để màu nền.
    seen = (cv[y0:y1, x0:x1, 3:4] > 0).astype(np.float32)
    cv[y0:y1, x0:x1, :3] = np.minimum(255.0, cv[y0:y1, x0:x1, :3] + add[y0 - Y:y1 - Y, x0 - X:x1 - X] * seen)
    return Image.fromarray(np.round(cv).astype(np.uint8), 'RGBA')


def sliced(spr, tw, th, border):
    """Vẽ kiểu Sliced (9 mảnh) ra ảnh tw × th px: góc giữ nguyên, cạnh/giữa kéo giãn (texture lọc Bilinear [ĐO])."""
    name, img, ax, ay, ppu = spr
    w, h = img.size
    L, B, R, T = int(border['x']), int(border['y']), int(border['z']), int(border['w'])
    xs, ys = [0, L, w - R, w], [0, T, h - B, h]
    dx, dy = [0, L, tw - R, tw], [0, T, th - B, th]
    out = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    for i in range(3):
        for j in range(3):
            sw, sh, ow, oh = xs[i + 1] - xs[i], ys[j + 1] - ys[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]
            if sw <= 0 or sh <= 0 or ow <= 0 or oh <= 0:
                continue
            piece = img.crop((xs[i], ys[j], xs[i + 1], ys[j + 1]))
            if (ow, oh) != (sw, sh):
                piece = piece.resize((ow, oh), Image.BILINEAR)
            out.paste(piece, (dx[i], dy[j]))
    return out


SLOT_OF = {'room_drink_seller': 'drink_seller', 'room_fishbowl': 'fish_bowl', 'magic_well': 'magic_well'}


def slot_empty(cab, nodes, top):
    """Hình 'chưa xây' của ô nội thất mở bằng bản vẽ (ItemRoomDecorateSlot, nút empty: biển gỗ objects_common_35 + bóng
    shadow3): {ô web: [[khung, dx, dy, lớp, order]]}, lệch tính từ nút roomdecorateslot_*. Bỏ khỏi lượt nướng vì xây xong
    thì bản gốc tắt nút empty."""
    out = {}
    for n in nodes.values():
        if not n.path.startswith(top + '/') or '/roomdecorateslot_' not in n.path or '/empty' not in n.path:
            continue
        rest = n.path.split('/roomdecorateslot_', 1)[1]
        slot = SLOT_OF.get(rest.split('/')[0])
        root = n
        while root.parent is not None and '/roomdecorateslot_' in root.parent.path:
            root = root.parent
        for tn, o in n.comps:
            if tn != 'SpriteRenderer' or slot is None:
                continue
            t = ET.r.tree(cab, o)
            h = ET.r.resolve(t['m_Sprite'], cab) if t['m_Sprite']['m_PathID'] else None
            if not t['m_Enabled'] or h is None:
                continue
            out.setdefault(slot, []).append([ET.r.tree(*h)['m_Name'], round(n.world[4] - root.world[4], 3), round(n.world[5] - root.world[5], 3),
                                             t['m_SortingLayer'], t['m_SortingOrder']])
        n.canon = False
    return out


def scene_hall():
    """Cảnh HeroRoom: chỗ đứng characters/cNN {NN: [x, y, scaleX, bật]} và camera chính {pos, size}."""
    import UnityPy
    env = UnityPy.load(os.path.join(skrip.REF, 'UnityDataAssetPack', 'assets', 'bin', 'Data', 'datapack.unity3d'))
    sf = None
    for bf in env.files.values():
        for name, f in getattr(bf, 'files', {}).items():
            if name == 'level3':
                sf = f
    if sf is None:
        raise SystemExit('level3 (HeroRoom) not found in datapack.unity3d')
    gos, trs = {}, {}
    for pid, o in sf.objects.items():
        if o.type.name == 'GameObject':
            gos[pid] = o.read_typetree()
        elif o.type.name == 'Transform':
            trs[pid] = o.read_typetree()
    name_of = {pid: gos[t['m_GameObject']['m_PathID']]['m_Name'] for pid, t in trs.items()}
    heroes, cam = {}, None
    for pid, t in trs.items():
        g = gos[t['m_GameObject']['m_PathID']]
        par = t['m_Father']['m_PathID']
        p, s = t['m_LocalPosition'], t['m_LocalScale']
        if par and name_of.get(par) == 'characters' and not trs[par]['m_Father']['m_PathID'] and g['m_Name'][1:].isdigit():
            heroes[int(g['m_Name'][1:])] = [round(p['x'], 3), round(p['y'], 3), s['x'], 1 if g['m_IsActive'] else 0]
        if g['m_Name'] == 'Main Camera' and not par:
            for c in g['m_Component']:
                co = sf.objects.get(c['component']['m_PathID'])
                if co is not None and co.type.name == 'Camera':
                    cam = {'pos': [round(p['x'], 3), round(p['y'], 3)], 'size': co.read_typetree()['orthographic size']}
    return {k: heroes[k] for k in sorted(heroes)}, cam


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
    empty = slot_empty(gcab, gnodes, G_TOP)
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
    canvas = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))      # nền BG lót ở cuối (đèn chỉ cộng lên chỗ có hình)
    deco_img = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))

    def put(dst, src, b, alpha):
        pos = (int(round((b[0] - minx) * PX)), int(round((maxy - b[3]) * PX)))
        if alpha:
            dst.alpha_composite(src, pos)
        else:
            dst.paste(src, pos)
    # Nền: tilemap chia theo các mốc (lớp, order) của đèn/viền tối; mỗi đoạn vẽ vườn trước, sảnh sau (nền trong suốt để cột
    # đệm của sảnh không che sàn vườn), rồi tới hiệu ứng ở mốc đó. Đèn cộng lên mọi thứ đã vẽ bên dưới (cả sàn vườn trong tầm).
    garden_r = ET.r
    ET.r = hall_r
    fx = fx_items(hall_cab, hall_nodes)
    empty.update(slot_empty(hall_cab, hall_nodes, TOP))
    fkeys = sorted({k for k, _, _ in fx})

    def tkey(tm):
        rd = tm['renderer']
        return (rd['sortingLayer'], rd['sortingOrder']) if rd else (-1, -1)

    def seg(tm):
        return sum(1 for k in fkeys if k < tkey(tm))
    for i in range(len(fkeys) + 1):
        for rip, cab_, nodes_, tms_, b in ((garden_r, gcab, gnodes, gtms, gb), (hall_r, hall_cab, hall_nodes, hall_tms, main)):
            part = [tm for tm in tms_ if seg(tm) == i]
            if part:
                ET.r = rip
                put(canvas, ET.render(cab_, nodes_, part, {}, b, {'sr': False, 'bg': (0, 0, 0, 0)}), b, True)
        if i == len(fkeys):
            break
        for key, kind, d in fx:
            if key != fkeys[i]:
                continue
            if kind == 'light':
                canvas = add_light(canvas, *d, bounds)
            else:
                s, wx, wy, tw, th, col, border = d
                im = sliced(s, int(round(tw * PX)), int(round(th * PX)), border)
                a = np.asarray(im, dtype=np.float32)
                a[..., :3] *= np.array(col[:3], dtype=np.float32)
                a[..., 3] *= col[3]
                im = Image.fromarray(np.round(a).astype(np.uint8), 'RGBA')
                piv = (s[2] / s[1].width, s[3] / s[1].height)          # điểm neo chuẩn hoá, gốc trên-trái
                X = int(round((wx - minx) * PX - piv[0] * im.width))
                Y = int(round((maxy - wy) * PX - piv[1] * im.height))
                canvas.alpha_composite(im, (X, Y))
    print('  fx', [(k, kind) for k, kind, _ in fx])
    base = Image.new('RGBA', (W_, H_), BG)
    base.alpha_composite(canvas)
    canvas = base
    ET.r = garden_r
    put(deco_img, ET.render(gcab, gnodes, gtms, {}, gb, {'tiles': False, 'bg': (0, 0, 0, 0)}), gb, True)
    ET.r = hall_r
    put(deco_img, ET.render(hall_cab, hall_nodes, hall_tms, {}, main, {'tiles': False, 'bg': (0, 0, 0, 0)}), main, True)
    heroes, cam = scene_hall()
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    canvas.save(OUT_PNG, optimize=True)
    deco_img.save(OUT_TOP, optimize=True)
    v = hashlib.md5(open(OUT_PNG, 'rb').read() + open(OUT_TOP, 'rb').read()).hexdigest()[:10]

    data = {
        'ppu': PX, 'bounds': [minx, miny, maxx, maxy], 'img': 'art/hall/hall_0.png', 'top': 'art/hall/hall_0_top.png', 'v': v, 'mask': MASK, 'walk': rows,
        'door': {'x': round(door['world'][0] + dc['offset'][0], 3), 'y': round(door['world'][1] + dc['offset'][1], 3),
                 'w': dc['size'][0], 'h': dc['size'][1]},
        'slots': slots, 'deco': deco, 'solids': solids, 'main': list(main), 'garden': garden,
        # heroes[chỉ số nhân vật] = [x, y, scaleX của nút (-1 = quay trái), nút bật sẵn]; camera = Main Camera của cảnh HeroRoom
        'heroes': heroes, 'camera': cam,
        # empty[ô] = [[khung, dx, dy, lớp, order]]: biển 'chưa xây' của ô mở bằng bản vẽ, lệch từ gốc ô (slot_empty)
        'empty': empty,
    }
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/hall/build_hall.py — không sửa tay.\n')
        f.write('window.SK_HALL = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    walk = sum(r.count('.') for r in rows)
    print('hall', canvas.size, 'bounds', (minx, miny, maxx, maxy), 'floor cells', len(cells), 'walk', walk, '/', w * h,
          'solids', len(solids), 'slots', len(slots), 'door', data['door'])


if __name__ == '__main__':
    main()
