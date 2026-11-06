"""Bản đồ thử (dev map) cho Thế Giới Slime.

Bố cục bản đồ thật là dữ liệu server (`map_type_{id}_client.dat` + `_tile.dat`), máy này chưa có. Tool này tự
vẽ MỘT bản đồ 48x40 ô kiểu làng Larus để thử bộ dựng cảnh, rồi chạy luật autotile của editor gốc
(D:\\wos-ref\\notes\\MAPBUILD.md mục 5 + 9, dạng mặt nạ hàng xóm) để chọn mảnh + góc xoay.
Đầu ra: games/world-of-slime/data/maps/dev.json, cùng khuôn ClientMapData + TileMapData (xem js/world/map.js).

Chạy:  py -3.12 -I games/world-of-slime/tools/devmap.py [--assets D:/world-of-slime-assets]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = 'D:/world-of-slime-assets'
if '--assets' in sys.argv:
    ASSETS = sys.argv[sys.argv.index('--assets') + 1]

W, H = 48, 40      # rộng hơn một màn (39 m) để camera còn chỗ bám theo
CLIFF = 'Cliff_t01-A'      # bộ vách làng Larus: mặt cỏ = _BlendTex toạ độ thế giới, vách = atlas
PATH = 'Path_t01-B'        # đường đất xám-be của làng Larus (atlas Cliff_t01A ~ (188,183,157)); mảnh phẳng y=0 -> floor = nền + 1
WATER = 'Water_01-A'       # bộ nước rừng (bờ cỏ xanh xám); không có bộ nước kiểu Larus trong demo
STAIR = 'ter01_stair_001_step1_level2'   # Larus không có cầu thang 2 m vừa ô; mảnh rừng: cao 2 m, dài 5 m, lên phía +z

combine = json.load(open(os.path.join(ASSETS, 'map/combine.json'), encoding='utf-8'))
mindex = json.load(open(os.path.join(ASSETS, 'map/index.json'), encoding='utf-8'))
pieces = {p['name'] for p in mindex['pieces']}


def cls(kind, name):
    for g in combine['classfication'][kind]:
        if g['tileClassificationName'] == name:
            return g
    raise SystemExit('classification not found: ' + name)


CL, PA, WA = cls('cliffs', CLIFF), cls('routes', PATH), cls('waters', WATER)

# landType theo tên mảnh (MapCombineDataSet.landTypeClassfication), giống DigitalizedMapData.ToClientLandTypeData
LAND = {}
for lt in combine['landTypeClassfication']['landtypes']:
    for n in lt['names']:
        LAND[n] = lt['landType']


def hsh(x, z, f):
    return ((x * 73856093) ^ (z * 19349663) ^ (f * 83492791)) & 0x7fffffff


def pick(lst, x, z, f):
    lst = [n for n in lst if n in pieces]
    return lst[hsh(x, z, f) % len(lst)] if lst else None


# ---------------------------------------------------------------- bố cục (ô x = cột, z = hàng, +z lên trên màn hình)
ground = [[0] * W for _ in range(H)]          # floor của mặt đất (đỉnh đi được = floor + 1)
water = [[False] * W for _ in range(H)]
path = [[False] * W for _ in range(H)]


def rect(x0, z0, x1, z1, fn):
    for z in range(max(0, z0), min(H, z1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            fn(x, z)


def setg(v):
    return lambda x, z: ground[z].__setitem__(x, v)


# viền rừng cao 2 tầng quanh mép (che khoảng trống ngoài bản đồ)
rect(0, 0, W - 1, 2, setg(2)); rect(0, H - 3, W - 1, H - 1, setg(2))
rect(0, 0, 2, H - 1, setg(2)); rect(W - 3, 0, W - 1, H - 1, setg(2))
# cao nguyên hình chữ L phía đông bắc, cao 2 m, có cầu thang ở mép nam
rect(23, 22, 36, 36, setg(2)); rect(23, 22, 28, 26, setg(0))
rect(31, 19, 36, 21, setg(2))
# ao phía tây nam (bo góc)
for z in range(8, 15):
    for x in range(6, 15):
        if (x in (6, 14)) and (z in (8, 14)):
            continue
        water[z][x] = True
# đường đất: từ chỗ xuất phát (20,6) lên bắc tới chân cầu thang, nhánh tây ra bờ ao, nhánh đông
rect(19, 3, 21, 20, lambda x, z: path[z].__setitem__(x, True))
rect(15, 9, 21, 11, lambda x, z: path[z].__setitem__(x, True))
rect(21, 11, 34, 13, lambda x, z: path[z].__setitem__(x, True))
rect(21, 5, 36, 6, lambda x, z: path[z].__setitem__(x, True))
for z in range(H):
    for x in range(W):
        if ground[z][x] > 0 or water[z][x] or (31 <= x <= 35 and 14 <= z <= 18):
            path[z][x] = False

# cầu thang: mảnh Larus 5 x 6 ô, cao 2 tầng. Đặt ở chân cao nguyên, bỏ vách ở các ô nó đè.
STAIR_AT = (35, 17)   # gốc mảnh ở góc: phủ Unity x 31.5..35.5, z 14..19, đầu cao chạm mép nam cao nguyên (z=19)

tiles = {}            # floor -> list


def emit(floor, x, z, name, yaw=0.0, scale=(1, 1, 1)):
    if not name:
        return
    tiles.setdefault(floor, []).append({
        'index': x + z * W, 'name': name, 'rotation': [0.0, float(yaw), 0.0], 'scale': [float(s) for s in scale],
        'isInvisible': False, 'useImposterObject': False})


def inR(fn, x, z):
    return 0 <= x < W and 0 <= z < H and fn(x, z)


def autotile(fn, x, z, f, kind, g):
    """Mặt nạ hàng xóm (MAPBUILD §9): một cạnh ngoài = edge, hai cạnh kề ngoài = convex, chỉ chéo ngoài = concave.
    Góc xoay Unity (độ): edge ngoài N 0, E 90, S 180, W -90; convex NE 0, SE 90, SW 180, NW -90;
    concave (thiếu chéo) SW 0, NW 90, NE 180, SE -90. Ô sát mép bản đồ coi như cùng vùng."""
    def ins(dx, dz):
        xx, zz = x + dx, z + dz
        if not (0 <= xx < W and 0 <= zz < H):
            return True
        return fn(xx, zz)
    n, e, s, w = ins(0, 1), ins(1, 0), ins(0, -1), ins(-1, 0)
    out = [not n, not e, not s, not w]
    cnt = sum(out)
    if cnt == 0:
        for dx, dz, yaw in ((-1, -1, 0), (-1, 1, 90), (1, 1, 180), (1, -1, -90)):
            if not ins(dx, dz):
                return pick(g['concaveCornerTiles'], x, z, f), yaw, 'concave'
        return pick(g['centerTiles'], x, z, f), 0, 'center'
    if cnt == 1:
        return pick(g['edgeTiles'], x, z, f), (0, 90, 180, -90)[out.index(True)], 'edge'
    if cnt == 2 and not (out[0] and out[2]) and not (out[1] and out[3]):
        yaw = 0 if (not n and not e) else 90 if (not s and not e) else 180 if (not s and not w) else -90
        return pick(g['convexCornerTiles'], x, z, f), yaw, 'convex'
    return None, 0, 'thin'   # dải rộng 1 ô: luật mặt nạ không có mảnh, bố cục tránh trường hợp này


thin = []
floors_used = sorted({ground[z][x] for z in range(H) for x in range(W)})
for f in floors_used:
    # ô ao vẫn tính là "có chiếm" khi dò viền vách (highest = max(vách/nền, nước)), nên ao không đục lỗ vách;
    # chỉ không đặt mảnh nền ở ô ao: bờ ao là vách riêng của mảnh Water_*_0_b/c/d.
    region = (lambda F: (lambda x, z: ground[z][x] >= F))(f)
    for z in range(H):
        for x in range(W):
            if not region(x, z) or (f == 0 and water[z][x]):
                continue
            name, yaw, role = autotile(region, x, z, f, 'cliffs', CL)
            if role == 'thin':
                thin.append((x, z, f))
                name, yaw = pick(CL['centerTiles'], x, z, f), 0
            emit(f, x, z, name, yaw)
# đáy ao (dưới mặt nước) để nhìn xuyên không thấy trời
for z in range(H):
    for x in range(W):
        if water[z][x]:
            emit(-2, x, z, pick(CL['centerTiles'], x, z, -2))
# nước: cùng tầng 0 với nền (mặt nước Water_*_0_a ở y 0.556, bờ của mảnh mép cao tới y 1 = mặt cỏ)
wfn = lambda x, z: water[z][x]
for z in range(H):
    for x in range(W):
        if water[z][x]:
            name, yaw, role = autotile(wfn, x, z, 0, 'waters', WA)
            # bảng GetWaterRotation (MAPBUILD §5.6) = góc vách + 180 cho cạnh và góc lồi; góc lõm có +180 riêng nên
            # về lại góc vách. Đã chụp kiểm (proof/slice/dbgpond): +180 cho góc lõm làm vòng bọt quay ra ngoài.
            if role in ('edge', 'convex'):
                yaw += 180
            if role == 'thin':
                thin.append((x, z, 0)); name, yaw = pick(WA['centerTiles'], x, z, 0), 0
            emit(0, x, z, name, yaw)
# đường đất: floor = nền + 1 (mảnh phẳng ở y=0 cục bộ, cộng 0.005 createPlaneHeight lúc dựng)
pfn = lambda x, z: path[z][x]
for z in range(H):
    for x in range(W):
        if path[z][x]:
            name, yaw, role = autotile(pfn, x, z, 1, 'routes', PA)
            if role == 'thin':
                thin.append((x, z, 1)); name, yaw = pick(PA['centerTiles'], x, z, 1), 0
            emit(ground[z][x] + 1, x, z, name, yaw)

# ---------------------------------------------------------------- đồ trang trí (thư viện t01_larus, cây xanh như frame Larus)
props = []      # (x, z, name, yaw, scale, block)


def prop(x, z, name, yaw=0, sc=1.0, block=False):
    if name not in pieces:
        print('missing piece', name)
        return
    props.append((x, z, name, yaw, sc, block))


TREES = ['t01_tree_001', 't01_tree_008a', 't01_tree_008b', 't01_tree_008c', 't01_tree_011', 't01_tree_012']
BUSH = ['t01_bush_002', 't01_bush_003', 't01_bush_004', 't01_bush_005', 't01_bush_007']
FLOW = ['t01_flower_001', 't01_flower_002', 't01_flower_003', 't01_flower_004']
GRASS = ['t01_grass_001', 't01_grass_002', 't01_grass_003', 't01_grass_004', 't01_grass_005']
ROCK = ['t01_rock_001', 't01_rock_002', 't01_rock_003']
# cây trên viền rừng, cách 3 ô
for z in range(H):
    for x in range(W):
        h = hsh(x, z, 7)
        border = x < 3 or z < 3 or x >= W - 3 or z >= H - 3
        # cây Larus to 5-7 m: mép nam (gần camera) chỉ để bụi, kẻo tán che người chơi
        if border and z < 3:
            if x % 3 == 1 and z == 1:
                prop(x, z, BUSH[h % len(BUSH)], (h >> 3) % 360, 1.0, True)
        elif border and (x % 4 == 1) and (z % 4 == 1):
            prop(x, z, TREES[h % len(TREES)], (h >> 3) % 360, 1.0, True)
        elif ground[z][x] == 2 and not border and x % 5 == 1 and z % 5 == 2 and z >= 30:
            prop(x, z, TREES[h % len(TREES)], (h >> 3) % 360, 1.0, True)
# bụi, hoa, cỏ, đá rải trên tầng 0 ngoài đường và ao
for z in range(3, H - 3):
    for x in range(3, W - 3):
        if ground[z][x] != 0 or water[z][x] or path[z][x]:
            continue
        h = hsh(x, z, 11) % 100
        near_path = any(inR(pfn, x + dx, z + dz) for dx in (-1, 0, 1) for dz in (-1, 0, 1))
        if 30 <= x <= 36 and 13 <= z <= 19:
            continue
        if h < 4 and not near_path:
            prop(x, z, BUSH[h % len(BUSH)], hsh(x, z, 3) % 360, 1.0, True)
        elif h < 9:
            prop(x, z, FLOW[h % len(FLOW)], hsh(x, z, 4) % 360)
        elif h < 16:
            prop(x, z, GRASS[h % len(GRASS)], hsh(x, z, 5) % 360)
        elif h == 16 and not near_path:
            prop(x, z, ROCK[h % len(ROCK)], hsh(x, z, 6) % 360, 1.0, True)
# vài bụi lớn quanh ao, như frame Larus
for (x, z) in ((5, 10), (15, 13), (10, 15), (16, 8)):
    prop(x, z, BUSH[(x + z) % len(BUSH)], 0, 1.0, True)

# cầu thang
stair = None
if STAIR in pieces:
    stair = STAIR

for (x, z, name, yaw, sc, block) in props:
    emit(ground[z][x] + 1, x, z, name, yaw, (sc, sc, sc))
if stair:
    emit(1, STAIR_AT[0], STAIR_AT[1], stair, 0)

# ---------------------------------------------------------------- ClientMapData
floors, land, blocked = [], [], []
for z in range(H):
    for x in range(W):
        i = x + z * W
        g = ground[z][x]
        if water[z][x]:
            floors.append(1)            # max(nền, nước tầng 0) + 1; landType Water chặn đi [ĐỀ XUẤT]
            land.append(3)
            continue
        floors.append(g + 1)
        lt = LAND.get(CLIFF + '_2_a_1', 1)
        if path[z][x]:
            lt = LAND.get(PA['centerTiles'][0], 0)
        land.append(lt)
for (x, z, name, yaw, sc, block) in props:
    if block:
        blocked.append(x + z * W)

out = {
    '_dev': True,
    '_note': 'BẢN ĐỒ THỬ do tools/devmap.py tự vẽ (không phải bản đồ thật của game). Bố cục thật là dữ liệu server '
             '(map_type_{id}_client.dat + _tile.dat); khi có sẽ đổi 1:1 sang khuôn này.',
    'id': 'dev',
    'name': 'Bản đồ thử',
    'client': {
        'width': W, 'height': H, 'floors': floors, 'landType': land,
        'cameraMoveRect': {'startX': 0, 'startY': 0, 'endX': W, 'endY': H, 'fov': 10},
        'verticalFogData': {'height': -3.0, 'farDistance': 60.0, 'nearDistance': 30.0,
                            'color': [0.72, 0.86, 0.9, 1.0], 'fogPosDynamic': False},
        'bgm': '', 'mapBackgroundType': 0, 'mapLightType': 0,
        'positionMarkerDatas': [{'type': 0, 'pos': [20.5, 12.5]}],
    },
    'tile': {'width': W, 'height': H, 'layers': [{'floors': [
        {'floor': f, 'tiles': tiles[f]} for f in sorted(tiles)]}]},
    'web': {'blocked': sorted(set(blocked)),
            '_note': 'web-only: ô có cây/bụi/đá chặn đi [ĐỀ XUẤT]; va chạm thật là dữ liệu server chưa có.'},
}
dst = os.path.join(GAME, 'data/maps/dev.json')
with open(dst, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
n = sum(len(v) for v in tiles.values())
print('wrote', dst, 'tiles', n, 'props', len(props), 'thin', thin[:10], 'kb', os.path.getsize(dst) // 1024)
