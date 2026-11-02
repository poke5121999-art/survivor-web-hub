"""Export textures (PNG), sprite metadata, Resources map. Usage:
python -I export_art.py DATA_DIR DUMP_DIR GAME_DIR"""
import sys, os, json, UnityPy
data, dump, game = sys.argv[1:4]
ext = json.load(open(os.path.join(dump, 'externals.json')))
def code(f):
    m = {'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2',
         'globalgamemanagers.assets': 'gg', 'level0': 'l0', 'level1': 'l1', 'level2': 'l2', 'unity default resources': 'ud', 'unity_builtin_extra': 'ub'}
    return m.get(f, 'r' + f[:6])
def key(f, pid): return f'{code(f)}_{pid}'
def deref(f, p):
    if not p or p['m_PathID'] == 0: return None
    return (f if p['m_FileID'] == 0 else ext[f][p['m_FileID'] - 1], p['m_PathID'])
os.makedirs(os.path.join(game, 'art', 't'), exist_ok=True)
env = UnityPy.load(data)
textures, sprites = {}, {}
for obj in env.objects:
    f = os.path.basename(obj.assets_file.name)
    if obj.type.name == 'Texture2D':
        d = obj.read()
        if d.m_Width == 0: continue
        k = key(f, obj.path_id)
        p = os.path.join(game, 'art', 't', k + '.png')
        try:
            d.image.save(p)
        except Exception as e:
            print('tex fail', k, d.m_Name, e); continue
        textures[k] = {'name': d.m_Name, 'w': d.m_Width, 'h': d.m_Height, 'wrap': getattr(d.m_TextureSettings, 'm_WrapU', 0), 'filter': getattr(d.m_TextureSettings, 'm_FilterMode', 1)}
# sprite metadata from dump json (no UnityPy needed)
for fn in os.listdir(os.path.join(dump, 'json')):
    f = fn[:-5]
    for r in json.load(open(os.path.join(dump, 'json', fn))):
        if r['type'] != 'Sprite' or 'data' not in r: continue
        s = r['data']; rd = s['m_RD']
        t = deref(f, rd['texture'])
        a = deref(f, rd.get('alphaTexture'))
        tr = rd['textureRect']; rc = s['m_Rect']
        sprites[key(f, r['path_id'])] = {
            'name': s['m_Name'], 'tex': key(*t) if t else None, 'atex': key(*a) if a else None,
            'x': tr['x'], 'y': tr['y'], 'w': tr['width'], 'h': tr['height'],
            'rw': rc['width'], 'rh': rc['height'], 'ox': rd['textureRectOffset']['x'], 'oy': rd['textureRectOffset']['y'],
            'px': s['m_Pivot']['x'], 'py': s['m_Pivot']['y'], 'ppu': s['m_PixelsToUnits'],
            'border': [s['m_Border']['x'], s['m_Border']['y'], s['m_Border']['z'], s['m_Border']['w']],
            'raw': rd['settingsRaw']}
# Resources container
res = {}
for r in json.load(open(os.path.join(dump, 'json', 'globalgamemanagers.json'))):
    if r['type'] == 'ResourceManager':
        for name, p in r['data']['m_Container']:
            t = deref('globalgamemanagers', p)
            k = key(*t)
            kind = 'sprite' if k in sprites else ('tex' if k in textures else 'other')
            res.setdefault(name, []).append([kind, k])
missing = [k for k, s in sprites.items() if s['tex'] not in textures]
print('textures', len(textures), 'sprites', len(sprites), 'resources', len(res), 'sprites w/o tex', len(missing))
json.dump({'textures': textures, 'sprites': sprites, 'resources': res}, open(os.path.join(game, 'data', 'art.json'), 'w'), separators=(',', ':'))
