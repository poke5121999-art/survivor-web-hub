# -*- coding: utf-8 -*-
"""Ải hướng dẫn lần đầu của Soul Knight 8.6 -> data/sk-tutorial.js + art/tutorial/*.png.

Chạy (từ gốc repo): PYTHONIOENCODING=utf-8 py -3.12 -I games/soulknight/tools/tutorial/build_tutorial.py

Nguồn (xem README.md cùng thư mục):
- scene_plot.ab › Scene_Plot.unity › Canvas (UIPlot): màn kể chuyện đen, tranh juqing01/02 + ba câu I_plot1..3.
  Cây nút dựng bằng tools/ui/build_ui.py Builder (cùng định dạng SK_UI.prefabs) để js/ugui.js vẽ được.
- tutorial.ab › prefab map_Scene_toturial (MapManagerPattern): 7 phòng RGRoomX đặt sẵn trên lưới 41 đv, bảng ObjectTip,
  rương RGChestAppoint, quái trong enemy_group, vật cản trong wall_group (RGObjectSkin.obj_index -> obstacle_list của theme).
- localization.ab (qua $SK86/decoded/localization_en_vi.json của tools/ui/build_loc.py): chữ Việt chính thức.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'season'))
sys.path.insert(0, os.path.join(TOOLS, 'ui'))
import skrip  # noqa: E402
os.environ.setdefault('SK_SEASON_TERRAIN', os.path.join(skrip.REF, 'work', 'season', 'terrain'))
import extract_terrain as ET  # noqa: E402
import build_ui  # noqa: E402

OUT_JS = os.path.join(GAME, 'data', 'sk-tutorial.js')
OUT_ART = os.path.join(GAME, 'art', 'tutorial')
TOP = '/map_Scene_toturial'
LOC = json.load(io.open(os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json'), encoding='utf-8'))
# emRoomType (dump.cs): 0 Start, 1 Enemy, 2 Statues, 3 Chest. Phòng cuối (room1_3) ghi 2 nhưng mang bảng I_teaching_3
# "Dùng Cửa Dịch Chuyển kết thúc hướng dẫn" và clip thấy cổng giữa phòng đó [THẤY https://youtu.be/1EdlLjGhhEQ?t=255] -> 'end'.
ROOM_TYPE = {0: 'start', 1: 'battle', 2: 'end', 3: 'chest'}
# RGRoomX.openDirection: bit 1 lên, 2 xuống, 4 phải, 8 trái [SUY: khớp đủ 6 cặp phòng kề trong prefab, lever kiểm lại].
DIR_BITS = {(0, 1): 1, (0, -1): 2, (1, 0): 4, (-1, 0): 8}


def loc(term):
    ev = LOC.get(term)
    if not ev:
        raise SystemExit('localization term not found: ' + term)
    return ev[1] or ev[0]


def base(name):
    return re.sub(r'\s*\(\d+\)$', '', name).strip()


def comp(n, tn):
    return next((o for t, o in n.comps if t == tn), None)


def mono(n, cls):
    return ET.mono_tree(ET.cab, n, cls)


def r3(v):
    return round(float(v), 3)


def build_map():
    ET.TOP = TOP
    ET.r = skrip.Rip(bundles=['tutorial'])
    ET.cab = cab = ET.r.loaded['tutorial.ab'][0]
    nodes, _ = ET.build_graph(cab)
    rooms = []
    for n in nodes.values():
        if not n.canon or not n.parent or n.parent.path != TOP:
            continue
        rx = mono(n, 'RGRoomX')
        if rx is None:
            continue
        ux, uy = n.world[4], n.world[5]
        room = {'key': n.name, 'gx': rx['room_x'], 'gy': rx['room_y'], 'w': rx['room_width'], 'h': rx['room_height'],
                'type': ROOM_TYPE[rx['room_type']], 'open': rx['openDirection'], 'signs': [], 'chests': [], 'enemies': [], 'obs': []}
        rel = lambda c: [r3(c.world[4] - ux), r3(c.world[5] - uy)]  # noqa: E731  đv Unity so với tâm phòng, y lên
        for g in n.children:
            for c in g.children:
                if not c.tree.get('m_IsActive', 1):
                    continue
                if g.name == 'floor_group':
                    # ObjectTip + vùng trigger nằm ở nút con signs_tip/talk
                    talk = next((k for k in c.children if mono(k, 'ObjectTip') is not None), None)
                    tip = mono(talk, 'ObjectTip') if talk else None
                    ch = mono(c, 'RGChestAppoint')
                    if tip is not None:
                        box = next(ET.r.tree(cab, o) for t, o in talk.comps if t == 'BoxCollider2D' and ET.r.tree(cab, o).get('m_IsTrigger'))
                        room['signs'].append({'at': rel(c), 'tip': tip['tip_string'], 'text': loc(tip['tip_string']),
                                              'trig': [r3(box['m_Offset']['x']), r3(box['m_Offset']['y']), r3(box['m_Size']['x']), r3(box['m_Size']['y'])]})
                    elif ch is not None:
                        items = []
                        for p in ch['object_list']:
                            h = ET.r.resolve(p, cab)
                            items.append(ET.r.tree(*h)['m_Name'] if h else None)
                        room['chests'].append({'at': rel(c), 'items': items})
                    else:
                        raise SystemExit('floor_group: chưa biết vật %s' % c.path)
                elif g.name == 'enemy_group':
                    room['enemies'].append({'id': base(c.name), 'at': rel(c)})
                elif g.name == 'wall_group':
                    sk = mono(c, 'RGObjectSkin')
                    if sk is not None:
                        room['obs'].append({'skin': sk['obj_index'], 'at': rel(c)})
                    else:
                        room['obs'].append({'name': base(c.name), 'at': rel(c)})
        rooms.append(room)
    # Đường đi: phòng kề nhau trên lưới mà cả hai cùng mở cửa về phía nhau.
    by = {(r['gx'], r['gy']): r for r in rooms}
    links = set()
    for r in rooms:
        for (dx, dy), bit in DIR_BITS.items():
            o = by.get((r['gx'] + dx, r['gy'] + dy))
            if r['open'] & bit:
                if not o or not (o['open'] & DIR_BITS[(-dx, -dy)]):
                    raise SystemExit('openDirection lệch: %s bit %d' % (r['key'], bit))
                links.add(tuple(sorted((r['key'], o['key']))))
    # Thứ tự phòng = đường đi từ phòng đầu (lưới là một chuỗi, không rẽ nhánh).
    order, cur, prev = [], next(r for r in rooms if r['type'] == 'start'), None
    while cur:
        order.append(cur)
        nxt = [o for a, b in links for o in (by_key(rooms, a), by_key(rooms, b)) if cur['key'] in (a, b) and o is not cur and o is not prev]
        prev, cur = cur, (nxt[0] if nxt else None)
    if len(order) != len(rooms) or len(links) != len(rooms) - 1:
        raise SystemExit('phòng hướng dẫn không thành một chuỗi: %d/%d phòng, %d cửa' % (len(order), len(rooms), len(links)))
    spacing = abs(order[1]['gx'] - order[0]['gx']) + abs(order[1]['gy'] - order[0]['gy'])
    sx = next(nodes[k].world for k in nodes if nodes[k].canon and nodes[k].name == order[0]['key'])
    return {'spacing': r3(sx[4] / order[0]['gx']) if spacing else 41, 'rooms': order}


def by_key(rooms, k):
    return next(r for r in rooms if r['key'] == k)


def build_plot(rip):
    """Scene_Plot › Canvas -> cây nút SK_UI; ảnh UIPlot.img_list ghi ra PNG rời (vẽ bằng n.draw ở js/tutorial.js)."""
    b = build_ui.Builder(rip)
    root = build_ui.container(rip, 'scene_plot', 'scene:Canvas')
    tree = b.node(root)
    scaler = next((t for name, c, t in root.mbs() if name == 'CanvasScaler'), None)
    plot = next(t for name, c, t in root.mbs() if name == 'UIPlot')
    imgs = []
    os.makedirs(OUT_ART, exist_ok=True)
    for ptr in plot['img_list']:
        h = rip.resolve(ptr, root.cab)
        name, img, _, _, _ = rip.sprite(*h)
        fn = name + '.png'
        img.save(os.path.join(OUT_ART, fn), optimize=True)
        imgs.append({'src': 'art/tutorial/' + fn, 'w': img.width, 'h': img.height})
    # Ảnh của nút Image trong scene là tranh đầu (juqing01); DoTap1 đổi sang img_list[0] (juqing02), DoTap2 tắt Image.
    # Ghi ra PNG rời và bỏ tên khung khỏi cây (ugui chỉ tra trang SK_UI; js/tutorial.js vẽ ảnh bằng n.draw).
    for k in tree.get('k', []):
        sp = k.get('img') and k['img'].get('sp')
        if not sp:
            continue
        if k['n'] == 'Image':
            im = b.images[sp][0]
            im.save(os.path.join(OUT_ART, sp + '.png'), optimize=True)
            imgs.insert(0, {'src': 'art/tutorial/' + sp + '.png', 'w': im.width, 'h': im.height})
        k['img']['sp0'] = k['img'].pop('sp')
    # Animator plot_anim của Canvas: bool ShowMubu chuyển plot_hide_mubu <-> plot_show_mubu; hai clip dài 0 nên màn đen hiện/tắt
    # dần theo thời lượng chuyển trạng thái (m_TransitionDuration) -> mubu = {state: [đích, điều kiện, thời lượng]}.
    an = root.comp('Animator')
    g = rip.controller_graph(*rip.resolve(an[2]['m_Controller'], an[0]))
    L0 = g['layers'][0]
    mubu = {s['name']: [[L0['states'][t['to']]['name'] if t['to'] is not None else None, t['c'], r3(t['dur'])] for t in s['tr']]
            for s in L0['states']}
    return {'tree': tree, 'imgs': imgs, 'texts': [loc('I_plot1'), loc('I_plot2'), loc('I_plot3')], 'mubu': mubu, 'params': g['params'],
            'mubuDef': L0['states'][L0['def']]['name'],
            # UIPlot.Start: btn_plot/text = ScriptLocalization.Get("I_plot_skip").ToUpper() + ">>" [ĐO sk_method UIPlot.Start]
            'skip': loc('I_plot_skip').upper() + '>>',
            'scaler': {'ref': [scaler['m_ReferenceResolution']['x'], scaler['m_ReferenceResolution']['y']],
                       'match': scaler['m_MatchWidthOrHeight'], 'mode': scaler['m_UiScaleMode']} if scaler else None}


def main():
    m = build_map()
    plot = build_plot(skrip.Rip(bundles=['scene_plot']))
    data = {'map': m, 'plot': plot, 'label': loc('I_tutorial'),
            'theme': 'forest'}   # tutorial.manifest phụ thuộc level/1/a (= theme forest của SK_DATA) [ĐO]
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/tutorial/build_tutorial.py — không sửa tay.\n')
        f.write('window.SK_TUTORIAL = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    for r in m['rooms']:
        print(r['key'], r['type'], r['w'], 'x', r['h'], 'signs', [s['tip'] for s in r['signs']], 'chests', [c['items'] for c in r['chests']],
              'enemies', [e['id'] for e in r['enemies']], 'obs', len(r['obs']))
    print('plot imgs', plot['imgs'], 'scaler', plot['scaler'])
    print('wrote', OUT_JS, os.path.getsize(OUT_JS))


if __name__ == '__main__':
    main()
