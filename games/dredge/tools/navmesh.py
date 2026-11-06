"""NavMesh của DREDGE (Detour 'DNAV') -> bitmap đi được 1 m cho AI quái/tàu ma: art/world/navmask-generic.png, navmask-ray.png.

Chạy:  python -I games/dredge/tools/navmesh.py
Đọc:   D:/dredge-ref/ripped/ExportedProject/Assets/NavMeshData/NavMesh-{Generic,Ray}NavMeshSurface.asset (YAML AssetRipper: m_NavMeshTiles[].m_MeshData là hex).
       Generic = agent type 0 (angler, tàu ma, vòi rồng; MonsterRayWorldEvent/WaterspoutWorldEvent dùng NavMesh.SamplePosition trên đó),
       Ray = RayNavMeshSurface (agent 658490984, chỉ vùng nước nông, MonsterRayWorldEvent.cs).
Định dạng tile [ĐO TRONG REPO]: tile = dtMeshHeader rút gọn 72 byte
       int magic 'VAND'(0x444E4156), version 16, x, y, layer, polyCount, vertCount, (3 int chưa dùng: polyCount lặp, detailMeshCount, detailVertCount/TriCount),
       float bmin[3], bmax[3], bvQuantFactor; rồi float verts[vertCount][3] (toạ độ thế giới Unity); rồi polyCount × 32 byte:
       u16 verts[6], u16 neis[6], u32 flags, u8 vertCount, u8 area, 2 byte đệm. Phần sau (liên kết, chi tiết, BV) không cần cho bitmap.
       Đa giác phẳng theo mặt nước nên chỉ vẽ hình chiếu XZ.
Ra:    PNG xám 8 bit, 255 = đi được. Cùng lưới với landmask.png (world.json landmask: x0, z0, 1 m/px, hàng 0 = z three nhỏ nhất), z đã đổi dấu (three.js).
       In ra: số tile/đa giác, độ phủ trong vùng The Marrows, và so với landmask (bao nhiêu ô nước đi được bị landmask chặn, ô đất đi được).
Rerunnable: cùng đầu vào ra cùng byte.
"""
import io, json, os, re, struct, sys
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
NAVDIR = r'D:\dredge-ref\ripped\ExportedProject\Assets\NavMeshData'
OUT = os.path.join(GAME, 'art', 'world')
SURFACES = [('generic', 'NavMesh-GenericNavMeshSurface.asset'), ('ray', 'NavMesh-RayNavMeshSurface.asset')]


def read_tiles(fn):
    txt = io.open(os.path.join(NAVDIR, fn), encoding='utf-8').read()
    return [bytes.fromhex(h) for h in re.findall(r'm_MeshData: ([0-9a-f]+)', txt)]


def tile_polys(b):
    """-> (verts (V,3) float32, polys [(indices[], flags, area)]) """
    magic, ver, tx, ty, layer, P, V = struct.unpack_from('<7i', b, 0)
    assert magic == 0x444E4156 and ver == 16, (hex(magic), ver)
    verts = np.frombuffer(b, '<f4', V * 3, 72).reshape(V, 3)
    polys = []
    base = 72 + 12 * V
    for i in range(P):
        o = base + 32 * i
        idx = struct.unpack_from('<6H', b, o)
        flags, nv, area = struct.unpack_from('<IBB', b, o + 24)
        assert 3 <= nv <= 6 and max(idx[:nv]) < V, (i, nv, idx)
        polys.append((idx[:nv], flags, area))
    return verts, polys


def main():
    world = json.load(io.open(os.path.join(OUT, 'world.json'), encoding='utf-8'))
    L = world['landmask']
    x0, z0, W, H = L['x0'], L['z0'], L['width'], L['height']
    assert L['metresPerPixel'] == 1.0
    land = np.array(Image.open(os.path.join(OUT, 'landmask.png')).convert('L')) > 127
    yy, xx = np.mgrid[0:H, 0:W]
    marrows = ((xx + x0 + 0.5 - 58) ** 2 + (-(yy + z0 + 0.5) - 27) ** 2) < 150 ** 2  # capsule THE_MARROWS ~ đĩa r 150 tại Unity (58, 27)
    for name, fn in SURFACES:
        tiles = read_tiles(fn)
        im = Image.new('L', (W, H), 0)
        dr = ImageDraw.Draw(im)
        npoly = 0
        flags, areas = {}, {}
        for b in tiles:
            verts, polys = tile_polys(b)
            for idx, fl, ar in polys:
                flags[fl] = flags.get(fl, 0) + 1
                areas[ar] = areas.get(ar, 0) + 1
                pts = [(float(verts[i][0]) - x0 - 0.5, -float(verts[i][2]) - z0 - 0.5) for i in idx]  # z three = -z Unity; tâm pixel i ở i + 0,5
                dr.polygon(pts, fill=255)
                npoly += 1
        m = np.array(im) > 0
        path = os.path.join(OUT, 'navmask-%s.png' % name)
        im.save(path, optimize=True)
        water = ~land
        mw = marrows
        print('%s: %d tile, %d đa giác, flags %s, area %s, %d KB' % (name, len(tiles), npoly, flags, areas, os.path.getsize(path) // 1024))
        print('   đi được %d ô; trong Marrows: đi được %d / nước %d; ô nước (landmask) bị navmesh bỏ %d; ô đất (landmask) mà navmesh cho đi %d'
              % (m.sum(), (m & mw).sum(), (water & mw).sum(), (water & mw & ~m).sum(), (land & mw & m).sum()))
        agree = ((m == water) & mw).sum() / mw.sum()
        print('   Marrows: trùng với "nước = đi được" %.2f%%' % (100 * agree))


if __name__ == '__main__':
    main()
