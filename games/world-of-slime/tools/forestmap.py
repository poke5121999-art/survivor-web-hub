"""Shadow Forest Entrance + sân đấu Rudga, DỰNG THEO CLIP (không phải dữ liệu bản đồ thật của server).

Hai nơi này không có trong đệm server đã lấy (chỉ có 110, 257, 478; docs/research/QUESTLINE.md "Bản đồ còn thiếu").
Nguồn hình duy nhất là clip DcGavHFwqtk: rừng 5:48-6:57 + 8:42-10:00 (khung D:\\wos-ref\\clips\\DcGavHFwqtk\\f3\\t0117..t0200),
sân đấu 5:09-5:36 (t0104..t0113). Tool này vẽ bố cục bằng tay theo các khung đó rồi chạy luật autotile của editor
(MAPBUILD.md §5, cùng hàm mặt nạ hàng xóm như tools/devmap.py) để chọn mảnh + góc xoay; chỉ dùng mảnh gốc trong
map/index.json (thư viện ter01_forest, Cliff_01-A, Path_01-*, Water_01-A, t01_larus cho rào/đèn/cổng).
Đầu ra cùng khuôn với bản đồ thật (client + tile + collide, xem đầu js/world/map.js) và có cờ `_clip: true`:
  data/maps/shadow_forest_entrance.json   data/maps/rudga_arena.json
Mọi toạ độ là ô Unity (x phải, z lên màn hình), số [ĐO TRONG CLIP] đo trên khung 480x270 (thước ~11 px/m ngang) hoặc
[ĐỀ XUẤT] khi khung không cho thấy.

Chạy:  py -3.12 -I games/world-of-slime/tools/forestmap.py [--assets D:/world-of-slime-assets]
Chạy lại ra tệp giống hệt (băm vị trí, không ngẫu nhiên).
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = 'D:/world-of-slime-assets'
if '--assets' in sys.argv:
    ASSETS = sys.argv[sys.argv.index('--assets') + 1]

combine = json.load(open(os.path.join(ASSETS, 'map/combine.json'), encoding='utf-8'))
mindex = json.load(open(os.path.join(ASSETS, 'map/index.json'), encoding='utf-8'))
PIECES = {p['name']: p for p in mindex['pieces']}

LAND = {}
for lt in combine['landTypeClassfication']['landtypes']:
    for n in lt['names']:
        LAND[n] = lt['landType']


def cls(kind, name):
    for g in combine['classfication'][kind]:
        if g['tileClassificationName'] == name:
            return g
    raise SystemExit('classification not found: ' + name)


def hsh(x, z, f):
    return ((x * 73856093) ^ (z * 19349663) ^ (f * 83492791)) & 0x7fffffff


class Builder:
    """Một bản đồ: lưới tầng, nước, đường, mảnh trang trí, ô chặn (lưới va chạm 0.5 m)."""

    def __init__(self, W, H, cliff, route, water):
        self.W, self.H = W, H
        self.CL, self.PA, self.WA = cls('cliffs', cliff), cls('routes', route), cls('waters', water)
        self.ground = [[0] * W for _ in range(H)]
        self.water = [[False] * W for _ in range(H)]
        self.path = [[False] * W for _ in range(H)]
        self.sand = [[False] * W for _ in range(H)]   # ô đất cát Ground_* cùng tầng (Larus 110: Ground_t01_002 ở floor 4 cạnh cỏ Cliff_t01-A)
        self.sand_piece = 'Ground_t01_002'
        self.tiles = {}          # (layer, floor) -> [TileData]
        self.walls = set()       # ô con 0.5 m bị chặn (sx, sz)
        self.thin = []
        self.missing = set()

    # ---- vẽ bố cục
    def rect(self, x0, z0, x1, z1, fn):
        for z in range(max(0, z0), min(self.H, z1 + 1)):
            for x in range(max(0, x0), min(self.W, x1 + 1)):
                fn(x, z)

    def set_ground(self, x0, z0, x1, z1, v):
        self.rect(x0, z0, x1, z1, lambda x, z: self.ground[z].__setitem__(x, v))

    def set_path(self, x0, z0, x1, z1, v=True):
        self.rect(x0, z0, x1, z1, lambda x, z: self.path[z].__setitem__(x, v))

    def set_water(self, x0, z0, x1, z1, v=True):
        self.rect(x0, z0, x1, z1, lambda x, z: self.water[z].__setitem__(x, v))

    def pick(self, lst, x, z, f):
        lst = [n for n in lst if n in PIECES]
        return lst[hsh(x, z, f) % len(lst)] if lst else None

    def emit(self, layer, floor, x, z, name, yaw=0.0, scale=1.0):
        if not name:
            return
        if name not in PIECES:
            self.missing.add(name)
            return
        s = scale if isinstance(scale, (list, tuple)) else (scale, scale, scale)
        self.tiles.setdefault((layer, floor), []).append({
            'index': x + z * self.W, 'name': name, 'rotation': [0.0, float(yaw), 0.0], 'scale': [float(v) for v in s],
            'isInvisible': False, 'useImposterObject': False})

    def block(self, ux, uz, r):
        """Chặn các ô con 0.5 m trong bán kính r quanh (ux, uz) (cây, bụi, gốc cây, cột đèn) [ĐỀ XUẤT]."""
        for sz in range(int((uz - r) * 2) - 1, int((uz + r) * 2) + 2):
            for sx in range(int((ux - r) * 2) - 1, int((ux + r) * 2) + 2):
                cx, cz = (sx + 0.5) / 2, (sz + 0.5) / 2
                if (cx - ux) ** 2 + (cz - uz) ** 2 <= r * r:
                    self.walls.add((sx, sz))

    def block_line(self, x0, z0, x1, z1, w=0.35):
        n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
        for i in range(n + 1):
            t = i / n
            self.block(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, w)

    # ---- luật autotile (MAPBUILD §9, giống tools/devmap.py)
    def autotile(self, fn, x, z, f, g):
        W, H = self.W, self.H

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
                    return self.pick(g['concaveCornerTiles'], x, z, f), yaw, 'concave'
            return self.pick(g['centerTiles'], x, z, f), 0, 'center'
        if cnt == 1:
            return self.pick(g['edgeTiles'], x, z, f), (0, 90, 180, -90)[out.index(True)], 'edge'
        if cnt == 2 and not (out[0] and out[2]) and not (out[1] and out[3]):
            yaw = 0 if (not n and not e) else 90 if (not s and not e) else 180 if (not s and not w) else -90
            return self.pick(g['convexCornerTiles'], x, z, f), yaw, 'convex'
        return None, 0, 'thin'

    def terrain(self):
        W, H = self.W, self.H
        for f in sorted({self.ground[z][x] for z in range(H) for x in range(W)}):
            region = (lambda F: (lambda x, z: self.ground[z][x] >= F and not (self.ground[z][x] == F and self.sand[z][x])))(f)
            for z in range(H):
                for x in range(W):
                    if self.ground[z][x] == f and self.sand[z][x]:
                        self.emit(0, f, x, z, self.sand_piece); continue
                    if not region(x, z) or (f == 0 and self.water[z][x]):
                        continue
                    name, yaw, role = self.autotile(region, x, z, f, self.CL)
                    if role == 'thin':
                        self.thin.append((x, z, f)); name, yaw = self.pick(self.CL['centerTiles'], x, z, f), 0
                    self.emit(0, f, x, z, name, yaw)
        wfn = lambda x, z: self.water[z][x]
        for z in range(H):
            for x in range(W):
                if self.water[z][x]:
                    self.emit(0, -2, x, z, self.pick(self.CL['centerTiles'], x, z, -2))
                    name, yaw, role = self.autotile(wfn, x, z, 0, self.WA)
                    if role in ('edge', 'convex'):
                        yaw += 180       # GetWaterRotation (ARCH bẫy 8)
                    if role == 'thin':
                        self.thin.append((x, z, 0)); name, yaw = self.pick(self.WA['centerTiles'], x, z, 0), 0
                    self.emit(6, 0, x, z, name, yaw)     # lớp 6 = Water như 110
        # đường: tâm ở lớp Route (2), mép/góc ở Route_New (3), không chồng nhau (như 110: 3085 tâm, 1251 mép, 0 chung)
        pfn = lambda x, z: self.path[z][x]
        for z in range(H):
            for x in range(W):
                if self.path[z][x]:
                    name, yaw, role = self.autotile(pfn, x, z, 1, self.PA)
                    if role == 'thin':
                        self.thin.append((x, z, 1)); name, yaw = self.pick(self.PA['centerTiles'], x, z, 1), 0
                    self.emit(2 if role == 'center' else 3, self.ground[z][x] + 1, x, z, name, yaw)

    def prop(self, x, z, name, yaw=0, sc=1.0, r=0.0):
        xi, zi = int(math.floor(x)), int(math.floor(z))
        if not (0 <= xi < self.W and 0 <= zi < self.H):
            return
        self.emit(0, self.ground[zi][xi] + 1, xi, zi, name, yaw, sc)
        if r > 0:
            self.block(xi + 0.5, zi + 0.5, r)

    def write(self, dst, meta, client_extra, web):
        W, H = self.W, self.H
        floors, land = [], []
        cliff_lt = LAND.get(self.CL['centerTiles'][0], 1)
        path_lt = LAND.get(self.PA['centerTiles'][0], 0)
        for z in range(H):
            for x in range(W):
                if self.water[z][x]:
                    floors.append(1); land.append(3); continue
                floors.append(self.ground[z][x] + 1)
                land.append(path_lt if self.path[z][x] else LAND.get(self.sand_piece, 0) if self.sand[z][x] else cliff_lt)
        cw, ch = W * 2, H * 2
        flags = [0] * (cw * ch)
        for z in range(H):
            for x in range(W):
                if self.water[z][x]:
                    for j in range(4):
                        flags[(2 * x + j % 2) + (2 * z + j // 2) * cw] |= 64
        for (sx, sz) in self.walls:
            if 0 <= sx < cw and 0 <= sz < ch:
                flags[sx + sz * cw] |= 1
        # mép bản đồ: một hàng ô con chặn
        for sx in range(cw):
            flags[sx] |= 1; flags[sx + (ch - 1) * cw] |= 1
        for sz in range(ch):
            flags[sz * cw] |= 1; flags[cw - 1 + sz * cw] |= 1
        layers = []
        for li in range(9):
            fl = sorted(f for (l, f) in self.tiles if l == li)
            layers.append({'floors': [{'floor': f, 'tiles': self.tiles[(li, f)]} for f in fl]})
        out = dict(meta)
        out['client'] = {'width': W, 'height': H, 'floors': floors, 'landType': land, **client_extra}
        out['tile'] = {'width': W, 'height': H, 'layers': layers}
        out['collide'] = {'width': cw, 'height': ch, 'cell': 0.5, 'flags': flags}
        out['web'] = web
        with open(dst, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        n = sum(len(v) for v in self.tiles.values())
        print('wrote', os.path.relpath(dst, GAME), 'tiles', n, 'thin', len(self.thin), self.thin[:6],
              'missing', sorted(self.missing), 'kb', os.path.getsize(dst) // 1024)


# =================================================================================== Shadow Forest Entrance
# Bố cục [ĐO TRONG CLIP]: vào từ cổng phía đông (5:48: rào gỗ hai bên đường + cột đèn, tháp cổng mái xanh bên phải
# ở 6:57), Martin đứng phía tây bắc cổng (5:51), đường mòn sáng uốn khúc đi về tây và bắc (5:54-6:21), vách tối viền tím
# phía bắc có cỏ cao trên mép (8:51-9:18), ao góc tây bắc có lá sen và cỏ nến (6:18, goget_battle_whistle), cụm cây tròn
# xanh thẫm giữa các vòng đường (6:00, 6:24), gốc cây, biển gỗ ở ngã rẽ (6:24), hoa vàng và cụm cỏ cao xanh lam rải rác.
def forest():
    W, H = 88, 60
    b = Builder(W, H, 'Cliff_01-A', os.environ.get('FOREST_PATH', 'Path_01-C'), 'Water_01-A')
    # vách phía bắc cao 1 m (8:51: một bậc tím), mép dưới gồ ghề
    b.set_ground(30, 50, W - 1, H - 1, 1)
    b.set_ground(44, 48, 60, 49, 1)
    b.set_ground(70, 47, 80, 49, 1)
    b.set_ground(22, 53, 29, H - 1, 1)
    # ao góc tây bắc (6:18): bờ bo góc
    for z in range(43, 57):
        for x in range(3, 18):
            if (x - 10.5) ** 2 / 64 + (z - 50) ** 2 / 46 <= 1.0:
                b.water[z][x] = True
    # đường mòn rộng 3 ô
    b.set_path(56, 26, W - 1, 28)          # từ cổng đông vào
    b.set_path(48, 26, 58, 28)
    b.set_path(48, 26, 50, 42)             # lên bắc
    b.set_path(18, 40, 50, 42)             # sang tây
    b.set_path(18, 13, 20, 42)             # xuống nam
    b.set_path(18, 13, 62, 15)             # sang đông phía nam
    b.set_path(60, 13, 62, 28)             # nối lại đường cổng
    b.set_path(30, 42, 32, 49)             # nhánh lên mép vách
    b.set_path(34, 26, 48, 28)             # nhánh giữa sang tây
    b.set_path(34, 20, 36, 28)
    for z in range(H):
        for x in range(W):
            if b.water[z][x] or b.ground[z][x] > 0:
                b.path[z][x] = False

    # vùng trống quanh đường (cây không mọc): cách đường <= 4 ô, quanh ao <= 2, các bãi cỏ giữa vòng đường
    def near(mask, x, z, r):
        for dz in range(-r, r + 1):
            for dx in range(-r, r + 1):
                xx, zz = x + dx, z + dz
                if 0 <= xx < W and 0 <= zz < H and mask[zz][xx]:
                    return True
        return False
    clear = [[False] * W for _ in range(H)]
    for z in range(H):
        for x in range(W):
            clear[z][x] = near(b.path, x, z, 2 if (x >= 64 and z < 26) else 4) or near(b.water, x, z, 2)   # 5:48: cây sát rào nam cổng
    for (x0, z0, x1, z1) in ((22, 17, 46, 38), (52, 17, 58, 38), (64, 30, 80, 42), (36, 43, 47, 47)):
        b.rect(x0, z0, x1, z1, lambda x, z: clear[z].__setitem__(x, True))
    # cụm cây giữa vòng đường (6:00 dưới cụm cỏ cao, 6:24 bên phải)
    for (x0, z0, x1, z1) in ((24, 18, 31, 24), (39, 34, 45, 37), (52, 17, 57, 22), (64, 17, 72, 23)):
        b.rect(x0, z0, x1, z1, lambda x, z: clear[z].__setitem__(x, False))

    # cổng đông: rào gỗ Larus hai bên đường (t01_fence_003 dài 4 m, gốc ở đầu đông, chạy về -x), cột đèn (5:48)
    for z_line in (25.7, 29.3):   # rào sát hai mép đường (5:48)
        for x_end in range(70, W, 4):
            b.prop(x_end + 0.1, z_line, 't01_fence_003', 0)
        b.block_line(68.0, z_line, W - 0.5, z_line)
    for (x, z) in ((69.5, 25.2), (69.5, 29.8)):
        b.prop(x, z, 't01_lamp_002', 0, 1.0, 0.5)
    b.prop(77.5, 31.5, 't01_gate_002', 0, 1.0, 2.6)        # tháp cổng mái xanh đứng trên rào bắc cạnh đường (5:48, 6:57)
    b.prop(64.5, 29.5, 'ter01_sign_001', 180, 1.0, 0.6)     # biển gỗ ngã rẽ (6:24)
    b.prop(47.0, 39.5, 'ter01_sign_003', 90, 1.0, 0.4)
    b.prop(21.5, 25.5, 'ter01_signboard_002', -90, 1.0, 0.4)

    TREES = ['ter01_tree_025', 'ter01_tree_026', 'ter01_tree_032', 'ter01_tree_033', 'ter01_tree_027', 'ter01_tree_028']
    # cây: lưới so le 3.6 m, chỉ ở ô không trống; trên vách bắc cũng có cây (8:48)
    sp = 3.6
    for j in range(int(H / sp) + 2):
        for i in range(int(W / sp) + 2):
            x = i * sp + (sp / 2 if j % 2 else 0) + (hsh(i, j, 3) % 100) / 100.0 - 0.5
            z = j * sp + (hsh(i, j, 5) % 100) / 100.0 - 0.5
            xi, zi = int(x), int(z)
            if not (0 <= xi < W and 0 <= zi < H) or clear[zi][xi] or b.water[zi][xi]:
                continue
            h = hsh(i, j, 7)
            sc = 0.78 + (h % 22) / 100.0
            b.prop(x, z, TREES[h % len(TREES)], (h >> 4) % 360, sc, 1.7 * sc)

    # cỏ cao xanh lam (6:00, 8:51): mảng chữ nhật 1 ô/mảnh; mép vách bắc có một dải
    TALL = os.environ.get('FOREST_TALL', 'ter01_grass_007,ter01_grass_008').split(',')
    patches = [(38, 30, 44, 31), (23, 34, 27, 35), (62, 34, 66, 35), (41, 18, 45, 19), (54, 43, 58, 44), (12, 39, 15, 41),
               (68, 37, 71, 38), (25, 44, 28, 45), (33, 51, 40, 52), (61, 50, 69, 51), (74, 49, 79, 50), (18, 44, 19, 49)]
    tall_cells = []
    for (x0, z0, x1, z1) in patches:
        for z in range(z0, z1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < W and 0 <= z < H and not b.path[z][x] and not b.water[z][x]:
                    b.prop(x, z, TALL[hsh(x, z, 9) % len(TALL)], (hsh(x, z, 10) % 4) * 90, 0.8)
                    tall_cells.append((x, z))
    # bờ ao: lá sen, cỏ nến (goget_battle_whistle: cỏ nến cam cạnh cỏ cao)
    b.emit(0, 1, 8, 49, 'ter01_lotusleaves_001', 30)
    b.emit(0, 1, 13, 46, 'ter01_lotusleaves_002', 200)
    for (x, z) in ((16, 50), (16, 47), (17, 52)):
        b.prop(x, z, 'ter01_waterflower_003', hsh(x, z, 2) % 360)
    # gốc cây (6:00 dưới trái, 6:30), nấm, hoa vàng, bụi nhỏ
    for (x, z, n) in ((33, 23, 'ter01_stump_003'), (69, 39, 'ter01_stump_001'), (27, 31, 'ter01_stump_002'), (55, 31, 'ter01_stump_006'),
                      (44, 37, 'ter01_stump_004'), (74, 33, 'ter01_stump_003')):
        b.prop(x, z, n, hsh(x, z, 1) % 360, 1.0, 0.6)
    FLOW = ['ter01_flower_002', 'ter01_flower_003', 'ter01_flower_009', 'ter01_flower_001_a', 'ter01_flower_001_b']
    for z in range(H):
        for x in range(W):
            if not clear[z][x] or b.path[z][x] or b.water[z][x] or (x, z) in tall_cells:
                continue
            h = hsh(x, z, 11) % 100
            if h < 3:
                b.prop(x, z, FLOW[h % len(FLOW)], hsh(x, z, 4) % 360)
            elif h < 5:
                b.prop(x, z, 'ter01_grass_009', hsh(x, z, 5) % 360)
            elif h == 5 and not near(b.path, x, z, 1):
                b.prop(x, z, 'ter01_bush_001', hsh(x, z, 6) % 360, 1.0, 0.5)
            elif h == 6 and not near(b.path, x, z, 1):
                b.prop(x, z, 'ter01_mushroom_001', hsh(x, z, 6) % 360)
    b.terrain()
    # ô ngoài vùng camera cũng chặn đi (rìa rừng dày)
    for sz in range(H * 2):
        for sx in range(W * 2):
            if sx < 8 or sz < 8 or sz >= H * 2 - 6:
                b.walls.add((sx, sz))
    meta = {
        '_clip': True, 'id': 'shadow_forest_entrance', 'name': 'Shadow Forest Entrance',
        '_note': 'DỰNG THEO CLIP DcGavHFwqtk (5:48-6:57, 8:42-10:00) bằng tools/forestmap.py, mảnh gốc ter01_forest/Cliff_01-A/'
                 'Path_01-A/Water_01-A/t01_larus. Không phải dữ liệu server (map_type_*.dat của vùng này chưa có trong đệm).',
    }
    client = {
        'cameraMoveRect': {'startX': 21, 'startY': 13, 'endX': 67, 'endY': 47, 'fov': 8},   # [ĐỀ XUẤT] như 110: fov 8, lề ~20 m
        'verticalFogData': None, 'bgm': 'bgm_field_shadowforest', 'mapBackgroundType': 0, 'mapLightType': 2,
        'positionMarkerDatas': [{'type': 0, 'pos': [80.5, 27.5]}], 'cloudProjectorData': None,
    }
    web = {
        '_note': 'web-only [ĐỀ XUẤT]: chỗ sinh slime hoang (spawns), cửa về Larus và chỗ Martin nằm ở data/portals.js.',
        'spawns': [
            {'id': 'flo1', 'model': 'SL_Slime_Grass', 'x': 41.5, 'z': 32.8},    # 6:00: phía trên cụm cỏ cao giữa
            {'id': 'flo2', 'model': 'SL_Slime_Grass', 'x': 55.0, 'z': 35.5},
            {'id': 'flo3', 'model': 'SL_Slime_Grass', 'x': 28.0, 'z': 28.5},
            {'id': 'flo4', 'model': 'SL_Slime_Grass', 'x': 24.5, 'z': 38.0},
            {'id': 'flo5', 'model': 'SL_Slime_Grass', 'x': 44.5, 'z': 23.0},
            {'id': 'flo6', 'model': 'SL_Slime_Grass', 'x': 70.0, 'z': 35.0},
            {'id': 'flo7', 'model': 'SL_Slime_Grass', 'x': 38.0, 'z': 45.5},
            # F3: loài thứ hai để bắt (Mandrake, cỏ) [ĐỀ XUẤT chỗ sinh]: clip chỉ cho thấy Mandrake của người chơi khác
            {'id': 'man1', 'model': 'SL_Mandrake_Grass', 'x': 60.0, 'z': 26.0},
            {'id': 'man2', 'model': 'SL_Mandrake_Grass', 'x': 52.0, 'z': 44.0},
        ],
    }
    b.write(os.path.join(GAME, 'data/maps/shadow_forest_entrance.json'), meta, client, web)


# =================================================================================== sân đấu Rudga
# [ĐO TRONG CLIP] 5:12-5:36 (t0105..t0113): bãi cỏ sáng giữa rừng, rào gỗ vuông bao quanh (cạnh trên ~26 m, khung 5:27),
# bãi cát giữa bo góc lượn (~16 x 12 m), 6 cột đèn (4 góc + giữa hai cạnh bên), tấm ván gãy ở góc phải dưới, cụm hoa
# trắng/vàng dọc rào, cây tròn xanh ngoài rào. Người chơi vào ở góc trái trên, Rudga góc phải dưới (5:21).
def arena():
    W, H = 56, 46
    b = Builder(W, H, 'Cliff_t01-A', 'Path_t01-C', 'Water_01-A')
    # bãi cát: chữ nhật 17 x 13 bo góc 2 ô và lượn mép (5:27)
    x0, z0, x1, z1 = 20, 16, 36, 28
    for z in range(z0, z1 + 1):
        for x in range(x0, x1 + 1):
            cx = min(x - x0, x1 - x) ; cz = min(z - z0, z1 - z)
            if cx + cz < 2:
                continue
            b.sand[z][x] = True
    for (x, z) in ((x0 + 6, z1 + 1), (x0 + 7, z1 + 1), (x0 + 8, z1 + 1), (x1 + 1, z0 + 5), (x1 + 1, z0 + 6), (x0 - 1, z0 + 7),
                   (x0 - 1, z0 + 8), (x0 + 9, z0 - 1), (x0 + 10, z0 - 1)):
        b.sand[z][x] = True
    # rào: hình chữ nhật x 14..42, z 10..34 (t01_fence_003 dài 4 m chạy -x; xoay 90 thì chạy +z)
    fx0, fz0, fx1, fz1 = 14, 10, 42, 34
    for xe in range(fx0 + 4, fx1 + 1, 4):
        b.prop(xe + 0.1, fz1 + 0.1, 't01_fence_003', 0)
        if xe < fx1 - 4 or True:
            b.prop(xe + 0.1, fz0 + 0.1, 't01_fence_003', 0)
    for zs in range(fz0, fz1, 4):
        b.prop(fx0 + 0.1, zs + 0.1, 't01_fence_003', 90)
        b.prop(fx1 + 0.1, zs + 0.1, 't01_fence_003', 90)
    b.block_line(fx0, fz0, fx1, fz0); b.block_line(fx0, fz1, fx1, fz1)
    b.block_line(fx0, fz0, fx0, fz1); b.block_line(fx1, fz0, fx1, fz1)
    for (x, z) in ((fx0 + 2, fz1 - 2), (fx1 - 2, fz1 - 2), (fx0 + 2, fz0 + 2), (fx1 - 2, fz0 + 2), (fx0 + 1.5, (fz0 + fz1) / 2), (fx1 - 1.5, (fz0 + fz1) / 2)):
        b.prop(x, z, 't01_lamp_005', 0, 0.75, 0.4)
    b.prop(fx1 - 4, fz0 + 1, 't01_board_001' if 't01_board_001' in PIECES else 'ter01_board_001', 20)
    FLOW = ['ter01_flower_001_a', 'ter01_flower_001_b', 'ter01_flower_001_c', 'ter01_flower_006', 'ter01_flower_007']
    for i, (x, z) in enumerate(((fx0 + 6, fz1 - 1), (fx0 + 14, fz1 - 1), (fx1 - 6, fz1 - 1), (fx0 + 4, fz0 + 1), (fx0 + 12, fz0 + 1),
                                (fx1 - 8, fz0 + 2), (fx0 + 1, fz0 + 8), (fx1 - 1, fz1 - 8), (fx0 + 1, fz1 - 6))):
        b.prop(x, z, FLOW[i % len(FLOW)], (i * 77) % 360)
    TREES = ['ter01_tree_025', 'ter01_tree_026', 'ter01_tree_032', 'ter01_tree_033']
    sp = 3.4
    for j in range(int(H / sp) + 2):
        for i in range(int(W / sp) + 2):
            x = i * sp + (sp / 2 if j % 2 else 0)
            z = j * sp
            if fx0 - 2.5 < x < fx1 + 2.5 and fz0 - 2.5 < z < fz1 + 2.5:
                continue
            h = hsh(i, j, 7)
            b.prop(x, z, TREES[h % len(TREES)], (h >> 4) % 360, 0.95 + (h % 20) / 100.0, 1.6)
    for (x, z) in ((fx0 - 1, fz0 + 3), (fx1 + 1, fz1 - 4), (fx0 + 8, fz0 - 1), (fx1 - 3, fz1 + 1)):
        b.prop(x, z, 'ter01_bush_003', 0, 1.0, 0.6)
    b.terrain()
    # chỉ đi trong rào
    for sz in range(H * 2):
        for sx in range(W * 2):
            if not (fx0 * 2 < sx < fx1 * 2 and fz0 * 2 < sz < fz1 * 2):
                b.walls.add((sx, sz))
    meta = {
        '_clip': True, 'id': 'rudga_arena', 'name': 'Sân đấu',
        '_note': 'DỰNG THEO CLIP DcGavHFwqtk 5:09-5:36 bằng tools/forestmap.py, mảnh gốc Cliff_t01-A/Path_t01-C/t01_larus/ter01_forest. '
                 'Không phải dữ liệu server.',
    }
    client = {
        'cameraMoveRect': {'startX': 8, 'startY': 5, 'endX': 48, 'endY': 39, 'fov': 8},   # [ĐỀ XUẤT] vừa một màn quanh rào (5:24-5:36 camera gần như đứng yên)
        'verticalFogData': None, 'bgm': 'bgm_field_shadowforest', 'mapBackgroundType': 0, 'mapLightType': 3,   # 3: không chấm màu (clip 5:24 sáng như làng trong clip)
        'positionMarkerDatas': [{'type': 0, 'pos': [19.5, 29.5]}], 'cloudProjectorData': None,
    }
    web = {'_note': 'web-only [ĐO TRONG CLIP 5:21]: chỗ đứng hai đội.',
           'teamA': {'x': 19.5, 'z': 29.5}, 'teamB': {'x': 36.5, 'z': 15.5}}
    b.write(os.path.join(GAME, 'data/maps/rudga_arena.json'), meta, client, web)


forest()
arena()
