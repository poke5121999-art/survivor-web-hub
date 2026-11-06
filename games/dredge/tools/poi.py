"""Điểm kiểm tra (InspectPOI: phao, xác tàu, bia đá, kho bờ biển) -> data/poi.js  (V17).

Chạy:  python -I games/dredge/tools/poi.py          (vài giây; cần art/world/markers.json do tools/world.py ghi)
Đọc:   art/world/markers.json: mọi marker kind 'inspectPOI' (con của InspectPOIs / DLC1/InspectPOI trong Game.unity) mang script InspectPOI
       (ConversationPOI.cs: conversationNodeName, isOneTimeOnly, enabledByOtherNodeVisit + enableNodeNames, shouldDisableOnOtherNodeVisit + otherNodeNames,
       interactCollider) và SphereCollider tương tác (bán kính).
Ra:    window.DR_POI = { points: [{ id, zone, x, z, r, node, once, needs[], hideAfter[] }], items: [{ id, item, x, z, r }] }   (x, z = three.js: z đã đảo dấu trong markers.json)
       items = ItemPOI (chai thư: tên GameObject "[số] <itemId> 1/1" do ItemPOI.OnValidate đặt; kho 1 món, ItemPOIDataModel.GetStartStock = 1; r = SphereCollider poiCollider)
       W3: markers.json chỉ giữ ConversationPOI là con TRỰC TIẾP của InspectPOIs; các POI nằm sâu hơn (Shrine_*/..., *DemoToggle/*Cullable/..., SB_ShoreCache4/...)
       và Finale_Inspect (AutoMovePOI, GameObject tắt sẵn) nên được đọc thẳng từ Game.unity (YAML): xem scene_points().
       Thêm cho các điểm đó: id = tên node (CodShrine, Courier_Root, ...), `off: true` nếu GameObject (hoặc cha) tắt sẵn trong Game.unity
       (Finale_Root: FinalePOIEnabler bật), `mk: [x, y, z]` nếu có interactPointTargetTransform (chỗ đặt dấu "?"), `auto: {x, z, fx, fz}` nếu là AutoMovePOI (autoMoveDestination + includeRotation).
Bỏ:    Explosives_Root / Explosives_Special (ExplosivePOI, đơn vị W4), mọi node DLC1_* chưa có, marker không có InspectPOI (SKUSpecificDisabler / MapMarkerLocation trơn: chỉ để bật tắt theo bản demo), AutoMovePOI (Finale_Inspect: cảnh cuối).
Bẫy:   `[BẪY ĐÃ SẬP]` ConversationPOI.RefreshStatus tắt cả GameObject khi đã thăm nút một lần (isOneTimeOnly) HOẶC khi bất kỳ nút trong otherNodeNames
       đã thăm; các kho bờ biển (xxShoreCache) dùng cách thứ hai (nút `..._Emptied` chạy khi lưới Found Items trống) nên KHÔNG tắt khi chỉ mới ghé.
       Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, json, sys, re
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC = os.path.join(GAME, 'art', 'world', 'markers.json')
OUT = os.path.join(GAME, 'data', 'poi.js')
SCENE = os.environ.get('DR_GAME_UNITY', 'D:/dredge-ref/ripped/ExportedProject/Assets/Scenes/Game.unity')
SKIP_NODE = re.compile(r'^(Explosives_|DLC1_)')
_VEC = re.compile(r'\{x: ([^,]+), y: ([^,]+), z: ([^,}]+)(?:, w: ([^}]+))?\}')


def parse_scene(path):
    """Đọc YAML Game.unity theo từng tài liệu; chỉ giữ Transform, GameObject, SphereCollider và script có conversationNodeName."""
    T, GO, SC, MB = {}, {}, {}, []
    cls = oid = d = lst = None

    def flush():
        if cls == '4': T[oid] = d
        elif cls == '1': GO[oid] = d
        elif cls == '135': SC[oid] = d
        elif cls == '114' and 'conversationNodeName' in d: MB.append(d)
    for line in io.open(path, encoding='utf-8'):
        if line.startswith('--- !u!'):
            if d is not None: flush()
            m = re.match(r'--- !u!(\d+) &(\d+)', line)
            cls, oid = m.group(1), m.group(2)
            d = {} if cls in ('4', '1', '135', '114') else None
            lst = None
            continue
        if d is None: continue
        s = line.strip()
        if s.startswith('- '):
            if lst is not None: d[lst].append(s[2:])
            continue
        k, _, v = s.partition(':')
        v = v.strip(); lst = None
        if k in ('m_GameObject', 'm_Father', 'interactCollider', 'autoMoveDestination', 'interactPointTargetTransform'): d[k] = v[len('{fileID: '):-1]
        elif k in ('m_LocalPosition', 'm_LocalScale', 'm_LocalRotation'): d[k] = [float(x) for x in _VEC.match(v).groups() if x is not None]
        elif k in ('m_Radius', 'm_IsActive', 'conversationNodeName', 'isOneTimeOnly', 'enabledByOtherNodeVisit', 'shouldDisableOnOtherNodeVisit', 'm_Name', 'includeRotation'):
            d[k] = v
        elif k in ('enableNodeNames', 'otherNodeNames'):
            d[k] = []; lst = k
    if d is not None: flush()
    return T, GO, SC, MB


def local_matrix(t):
    x, y, z, w = t['m_LocalRotation']; s = t['m_LocalScale']
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R @ np.diag(s); M[:3, 3] = t['m_LocalPosition']
    return M


def scene_points(known_nodes):
    """ConversationPOI của Game.unity chưa có trong markers.json (xem đầu tệp)."""
    T, GO, SC, MB = parse_scene(SCENE)
    g2t = {t['m_GameObject']: i for i, t in T.items()}

    def world(ti):
        t = T[ti]; M = local_matrix(t)
        return M if t['m_Father'] == '0' else world(t['m_Father']) @ M

    def active(ti):          # GameObject và mọi cha đều bật
        while ti != '0':
            if GO[T[ti]['m_GameObject']].get('m_IsActive') == '0': return False
            ti = T[ti]['m_Father']
        return True

    def top(ti):
        while T[ti]['m_Father'] != '0': ti = T[ti]['m_Father']
        return GO[T[ti]['m_GameObject']]['m_Name']
    out = []
    for m in MB:
        node = m['conversationNodeName']
        if node in known_nodes or SKIP_NODE.match(node): continue
        g = m['m_GameObject']; ti = g2t[g]
        col = SC.get(m['interactCollider'])
        if not col: raise SystemExit('ConversationPOI %s has no sphere collider' % node)
        W = world(ti)
        p = {'id': node, 'zone': top(ti), 'x': round(float(W[0, 3]), 2) + 0.0, 'z': round(float(-W[2, 3]), 2) + 0.0, 'r': float(col['m_Radius']), 'node': node,
             'once': m.get('isOneTimeOnly') == '1',
             'needs': m.get('enableNodeNames', []) if m.get('enabledByOtherNodeVisit') == '1' else [],
             'hideAfter': m.get('otherNodeNames', []) if m.get('shouldDisableOnOtherNodeVisit') == '1' else []}
        if not active(ti): p['off'] = True
        ip = m.get('interactPointTargetTransform')
        if ip and ip != '0':       # InteractPointUI đặt dấu "?" ở transform này thay vì ở chính điểm (Shrine_Cod: lệch 0,65 m lên)
            IW = world(ip)
            p['mk'] = [round(float(IW[0, 3]), 2) + 0.0, round(float(IW[1, 3]), 2) + 0.0, round(float(-IW[2, 3]), 2) + 0.0]
        if m.get('autoMoveDestination') and m['autoMoveDestination'] != '0':
            dt = T[m['autoMoveDestination']]; DW = world(m['autoMoveDestination'])
            f = DW[:3, :3] @ np.array([0, 0, 1.0]); f = f / np.linalg.norm(f)
            p['auto'] = {'x': round(float(DW[0, 3]), 2), 'z': round(float(-DW[2, 3]), 2) + 0.0, 'fx': round(float(f[0]), 3), 'fz': round(float(-f[2]), 3)}
            if m.get('includeRotation') != '1': p['auto']['norot'] = True
        out.append(p)
    out.sort(key=lambda p: (p['zone'], p['id']))
    return out


def main():
    markers = json.load(io.open(SRC, encoding='utf-8'))['markers']
    pts = []
    for m in markers:
        if m['kind'] != 'inspectPOI':
            continue
        f = (m.get('fields') or {}).get('InspectPOI')
        if not f or not f.get('conversationNodeName'):
            continue
        sph = [c for c in m.get('colliders', []) if c.get('shape') == 'sphere']
        if not sph:
            raise SystemExit('InspectPOI %s has no sphere collider' % m['path'])
        pts.append({
            'id': m['name'], 'zone': m['root'], 'x': round(m['pos'][0], 2), 'z': round(m['pos'][2], 2), 'r': sph[0]['radius'],
            'node': f['conversationNodeName'], 'once': bool(f.get('isOneTimeOnly')),
            'needs': f.get('enableNodeNames') or [] if f.get('enabledByOtherNodeVisit') else [],
            'hideAfter': f.get('otherNodeNames') or [] if f.get('shouldDisableOnOtherNodeVisit') else [],
        })
    pts.sort(key=lambda p: (p['zone'], p['id']))
    pts += scene_points({p['node'] for p in pts})
    items = []
    for m in markers:
        if 'ItemPOI' not in (m.get('scripts') or []):
            continue
        mm = re.match(r'^\[(\d+)\] (\S+) (\d+)/(\d+)$', m['name'])
        sph = [c for c in m.get('colliders', []) if c.get('shape') == 'sphere']
        if not mm or not sph:
            raise SystemExit('ItemPOI %s has no parsable name or sphere collider' % m['path'])
        items.append({'id': mm.group(1), 'item': mm.group(2), 'x': round(m['pos'][0], 2), 'z': round(m['pos'][2], 2), 'r': sph[0]['radius']})
    items.sort(key=lambda p: int(p['id']))
    js = '// Generated by games/dredge/tools/poi.py from art/world/markers.json (InspectPOI, ItemPOI). Do not edit.\nwindow.DR_POI = ' + \
        json.dumps({'points': pts, 'items': items}, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
    print('points %d  items %d  js %d B' % (len(pts), len(items), len(js)))


if __name__ == '__main__':
    main()
