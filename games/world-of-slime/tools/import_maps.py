"""Server map cache -> web map JSON (games/world-of-slime/data/maps/<id>.json).

Input: the game's own disk cache written by MapCacheStore / MiniMapLoader after playing the demo
(default WOS_CACHE = D:\\wos-ref\\server-cache\\live\\StandaloneWindows64):
  <id>_tileData.txt   MessagePack TileMapData   [width, height, layers]
                      layers[k] = [floors], floors[j] = [floor, tiles], tile = [index, name, rot[3], scale[3], isInvisible, useImposterObject]
                      layer k = MapObject.LayerTypes - 1 (0 Common, 1 Common_Second, 2 Route, 3 Route_New, 4 Shadow, 6 Water,
                      7 Route_Second, 8 Route_New_Second)
  <id>_clientData.txt MessagePack ClientMapData as an int-keyed array (ClientMapDataFormatter):
                      0 width, 1 height, 2 layers (null), 3 floors, 4 cameraMoveRect [startX,startY,endX,endY,fov],
                      5 verticalFogData, 6 (unused key), 7 bgm, 8 landType, 9 cloudProjectorData (key 0 unused),
                      10 mapBackgroundType, 11 mapLightType, 12 positionMarkerDatas
  <id>_collide.txt    raw collision grid (MiniMapLoader.GetColors / GetExpectedColliderLength): width*height*16 bytes,
                      per cell 4 big-endian int32 (ReverseCollision swaps to little endian before BitConverter.ToInt32),
                      sub-cell j at (2x + j%2, 2z + j//2), 0.5 m. Value = bit flags, bit k -> MapCollisionFlag k+1
                      (bit0 WALL, bit1 EXCLUSIVE, bit2..5 SLIDE_UP/RIGHT/DOWN/LEFT, bit6 WATER, bit7 JUMP, bit8 ICE...),
                      0 = ENABLE (walkable).

Output keeps the game's field names (see js/world/map.js header). Rerunnable, same input -> same bytes.
    py -3.12 -I games/world-of-slime/tools/import_maps.py [ids...] [--png]   (--png: debug renders into WOS_REF/proof/larus/data)
"""
import os, sys, json, struct
import msgpack

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'data', 'maps')
CACHE = os.environ.get('WOS_CACHE', r'D:\wos-ref\server-cache\live\StandaloneWindows64')
REF = os.environ.get('WOS_REF', r'D:\wos-ref')
NAMES = {110: 'Larus Village', 257: 'Larus Tavern', 478: 'Larus Storage'}
LAYER_TYPES = {0: 'Common', 1: 'Common_Second', 2: 'Route', 3: 'Route_New', 4: 'Shadow', 6: 'Water', 7: 'Route_Second', 8: 'Route_New_Second'}


def unpack(path):
    with open(path, 'rb') as f:
        return msgpack.unpackb(f.read(), strict_map_key=False)


def num(v):
    # float32 from MessagePack -> shortest decimal that round-trips the float32 (0.11999999731779099 -> 0.12)
    if isinstance(v, float):
        for p in range(1, 10):
            r = round(v, p)
            if struct.unpack('<f', struct.pack('<f', r))[0] == struct.unpack('<f', struct.pack('<f', v))[0]:
                return int(r) if r == int(r) and abs(r) < 1e9 else r
        return v
    return v


def vec(a):
    return [num(x) + 0 if isinstance(x, float) else x for x in a] if a is not None else None


def client_of(c):
    rect = c[4]
    fog = c[5]
    cloud = c[9]
    out = {
        'width': c[0], 'height': c[1],
        'floors': c[3],
        'cameraMoveRect': None if rect is None else dict(zip(['startX', 'startY', 'endX', 'endY', 'fov'], [num(v) for v in rect])),
        'verticalFogData': None if fog is None else dict(zip(['height', 'farDistance', 'nearDistance', 'color', 'fogPosDynamic'],
                                                             [vec(v) if isinstance(v, list) else num(v) for v in fog])),
        'bgm': c[7],
        'landType': c[8],
        'cloudProjectorData': None if cloud is None else dict(zip(
            ['speedX', 'speedY', 'color', 'shadowTextureName', 'shadowTiling', 'noiseTextureName', 'noiseTiling', 'height', 'yScale'],
            [vec(v) if isinstance(v, list) else num(v) for v in cloud[1:]])),
        'mapBackgroundType': c[10], 'mapLightType': c[11],
        'positionMarkerDatas': None if c[12] is None else [{'type': m[0], 'pos': vec(m[1])} for m in c[12]],
    }
    if len(c) != 13 or c[2] is not None or c[6] is not None:
        print('  note: clientData shape', len(c), 'key2', type(c[2]).__name__, 'key6', repr(c[6])[:60])
    return out


def tile_of(t):
    w, h, layers = t
    out = []
    for L in layers:
        floors = []
        for F in (L[0] if L else []):
            tiles = [{'index': x[0], 'name': x[1], 'rotation': vec(x[2]), 'scale': vec(x[3]),
                      'isInvisible': bool(x[4]), 'useImposterObject': bool(x[5])} for x in F[1]]
            floors.append({'floor': F[0], 'tiles': tiles})
        out.append({'floors': floors})
    return {'width': w, 'height': h, 'layers': out}


def collide_of(path, w, h):
    b = open(path, 'rb').read()
    if len(b) != w * h * 16:
        raise SystemExit('collide size %d, expected %d (width*height*16)' % (len(b), w * h * 16))
    v = struct.unpack('>%di' % (w * h * 4), b)
    W2 = w * 2
    flags = [0] * (w * h * 4)
    for i in range(w * h):
        x, z = i % w, i // w
        for j in range(4):
            flags[(2 * x + j % 2) + (2 * z + j // 2) * W2] = v[i * 4 + j]
    return {'width': W2, 'height': h * 2, 'cell': 0.5, 'flags': flags}


def png(mid, m):
    from PIL import Image
    d = os.path.join(REF, 'proof', 'larus', 'data'); os.makedirs(d, exist_ok=True)
    c, col = m['client'], m['collide']
    w, h = c['width'], c['height']
    im = Image.new('RGB', (w * 2, h * 2))
    for z in range(h * 2):
        for x in range(w * 2):
            f = col['flags'][x + z * w * 2]
            fl = c['floors'][x // 2 + (z // 2) * w]
            g = 40 + 20 * fl if fl is not None else 0
            im.putpixel((x, h * 2 - 1 - z), (200, 60, 60) if f & 1 and not f & 64 else (60, 90, 200) if f & 64 else (g, min(255, g + 40), g))
    im.resize((w * 8, h * 8), Image.NEAREST).save(os.path.join(d, '%d_collide.png' % mid))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    ids = [int(a) for a in args] or sorted(int(f.split('_')[0]) for f in os.listdir(CACHE) if f.endswith('_tileData.txt'))
    os.makedirs(OUT, exist_ok=True)
    for mid in ids:
        c = unpack(os.path.join(CACHE, '%d_clientData.txt' % mid))
        t = unpack(os.path.join(CACHE, '%d_tileData.txt' % mid))
        client = client_of(c)
        tile = tile_of(t)
        if (tile['width'], tile['height']) != (client['width'], client['height']):
            raise SystemExit('map %d: tile %dx%d vs client %dx%d' % (mid, tile['width'], tile['height'], client['width'], client['height']))
        m = {'_source': 'server cache %s (%d_tileData/_clientData/_collide.txt), tools/import_maps.py' % (os.path.basename(CACHE), mid),
             'id': mid, 'name': NAMES.get(mid, str(mid)), 'client': client, 'tile': tile,
             'collide': collide_of(os.path.join(CACHE, '%d_collide.txt' % mid), client['width'], client['height'])}
        p = os.path.join(OUT, '%d.json' % mid)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
        n = sum(len(F['tiles']) for L in tile['layers'] for F in L['floors'])
        print('%d %-14s %dx%d tiles %d bgm %s -> %s (%d KB)' % (mid, m['name'], client['width'], client['height'], n, client['bgm'], p, os.path.getsize(p) // 1024))
        if '--png' in sys.argv:
            png(mid, m)


if __name__ == '__main__':
    main()
