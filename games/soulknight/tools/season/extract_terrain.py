# -*- coding: utf-8 -*-
"""Extract Soul Knight 8.6 escape-mode terrain bundles (run by build_season.py when the JSON is missing) (Init base + Scene1 "Base Outskirt") to JSON + previews.

Run:  set PYTHONIOENCODING=utf-8 ; python extract_terrain.py [bundle ...]
      default bundles: escape_terrain_init escape_terrain_scene1
Outputs (same folder): <bundle>_objects.json, _tilemaps.json, _points.json, _preview.png, _crop.png,
                       overview_Init.png, overview_Scene1.png
Uses the reader in D:\\survivor-web-hub\\games\\soulknight\\tools\\skrip.py (read only).
"""
import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from skrip import Rip  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

OUT = os.environ.get('SK_SEASON_TERRAIN', 'D:/sk86-ref/work/season/terrain')
os.makedirs(OUT, exist_ok=True)
PX = 16  # preview pixels per world unit

r = None
_name_cache = {}
# --top=/ten_prefab: lay goc khac lam "scene that" (vd /hall_0_normal trong hero_room/hall/skin_0)
TOP = next((a[6:] for a in sys.argv if a.startswith('--top=')), None)
SKIP_COMP = {'Transform', 'RectTransform', 'ParticleSystem', 'ParticleSystemRenderer', 'Tilemap', 'MonoScript'}
DROP_KEYS = {'m_GameObject', 'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset',
             'm_EditorHideFlags', 'm_EditorClassIdentifier', 'm_Script', 'm_Name', 'm_CastShadows', 'm_ReceiveShadows',
             'm_DynamicOccludee', 'm_StaticShadowCaster', 'm_MotionVectors', 'm_LightProbeUsage',
             'm_ReflectionProbeUsage', 'm_RayTracingMode', 'm_RayTraceProcedural', 'm_RenderingLayerMask',
             'm_RendererPriority', 'm_LightmapIndex', 'm_LightmapIndexDynamic', 'm_LightmapTilingOffset',
             'm_LightmapTilingOffsetDynamic', 'm_StaticBatchInfo', 'm_StaticBatchRoot', 'm_ProbeAnchor',
             'm_LightProbeVolumeOverride', 'm_ForceMeshLod', 'm_MeshLodSelectionBias', 'm_MaskInteraction',
             'm_AdaptiveModeThreshold'}


def rnd(v):
    if isinstance(v, float):
        return round(v, 5)
    return v


def bname(cab):
    b = r.bundle_of.get(cab)
    return b[:-3] if b else cab


def ptr_str(cab, p, home=None):
    """{m_FileID,m_PathID} -> 'Type:name@bundle' (no @ when same bundle as `home`) or None."""
    if not p or not p.get('m_PathID'):
        return None
    hit = r.resolve(p, cab)
    if hit is None:
        f = p['m_FileID']
        ext = r.files[cab].externals[f - 1].path.split('/')[-1] if f and f - 1 < len(r.files[cab].externals) else '?'
        return 'unresolved:%s#%s' % (ext, p['m_PathID'])
    tcab, o = hit
    key = (tcab, o.path_id)
    if key not in _name_cache:
        tn = o.type.name
        nm = ''
        try:
            if tn == 'MonoBehaviour':
                t = r.tree(tcab, o)
                cls = r.script_name(tcab, t)
                nm = (t.get('m_Name') or '')
                g = r.resolve(t.get('m_GameObject'), tcab)
                if g:
                    nm = r.tree(*g)['m_Name'] + '<%s>' % cls
                elif nm:
                    nm = nm + '<%s>' % cls
                else:
                    nm = '<%s>' % cls
            elif tn in ('Transform', 'RectTransform'):
                t = r.tree(tcab, o)
                g = r.resolve(t['m_GameObject'], tcab)
                nm = go_path(tcab, g[1].path_id) if g else ''
            elif tn == 'GameObject':
                nm = go_path(tcab, o.path_id)
            else:
                t = r.tree(tcab, o) if tn not in ('Texture2D',) else None
                nm = (t.get('m_Name') if t else o.peek_name()) or ''
                if not nm and t:
                    g = r.resolve(t.get('m_GameObject'), tcab)
                    nm = r.tree(*g)['m_Name'] if g else ''
        except Exception as e:  # noqa
            nm = '?err'
        _name_cache[key] = '%s:%s' % (tn, nm)
    s = _name_cache[key]
    if home is not None and tcab != home:
        s += '@' + bname(tcab)
    return s


_paths = {}


def go_path(cab, pid):
    if cab not in _paths:
        par, names = {}, {}
        sf = r.files[cab]
        tf_go = {}
        for o in sf.objects.values():
            if o.type.name == 'GameObject':
                names[o.path_id] = r.tree(cab, o)['m_Name']
            elif o.type.name in ('Transform', 'RectTransform'):
                t = r.tree(cab, o)
                tf_go[o.path_id] = (t['m_GameObject']['m_PathID'], t['m_Father']['m_PathID'])
        go_tf = {g: t for t, (g, f) in tf_go.items()}
        cache = {}

        def path(g):
            if g in cache:
                return cache[g]
            t = go_tf.get(g)
            f = tf_go[t][1] if t in tf_go else 0
            pg = tf_go[f][0] if f in tf_go else None
            cache[g] = (path(pg) + '/' if pg else '/') + names.get(g, '?')
            return cache[g]
        _paths[cab] = path
    return _paths[cab](pid)


def walkv(v, cab, home):
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            return ptr_str(cab, v, home)
        return {k: walkv(x, cab, home) for k, x in v.items()}
    if isinstance(v, list):
        return [walkv(x, cab, home) for x in v]
    return rnd(v)


# ---------------------------------------------------------------- affine helpers (2D, y up)
def mat_local(t):
    p, s, q = t['m_LocalPosition'], t['m_LocalScale'], t['m_LocalRotation']
    ang = 2 * math.atan2(q['z'], q['w'])  # rotation about z
    c, sn = math.cos(ang), math.sin(ang)
    # [a c tx; b d ty] column-major style: x' = a*x + c*y + tx ; y' = b*x + d*y + ty
    return (c * s['x'], sn * s['x'], -sn * s['y'], c * s['y'], p['x'], p['y'])


def mat_mul(A, B):  # A * B
    a, b, c, d, e, f = A
    a2, b2, c2, d2, e2, f2 = B
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def mat_apply(M, x, y):
    return M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]


def mat_info(M):
    sx = math.hypot(M[0], M[1])
    sy = math.copysign(math.hypot(M[2], M[3]), M[0] * M[3] - M[1] * M[2])
    rot = math.degrees(math.atan2(M[1], M[0]))
    return [rnd(sx), rnd(sy)], rnd(rot)


# ---------------------------------------------------------------- scene graph
class G:
    pass


def build_graph(cab):
    sf = r.files[cab]
    nodes = {}
    tf_of = {}
    for o in sf.objects.values():
        if o.type.name == 'GameObject':
            g = r.tree(cab, o)
            n = G()
            n.pid, n.tree, n.name = o.path_id, g, g['m_Name']
            n.comps = []
            for c in g['m_Component']:
                h = r.resolve(c['component'], cab)
                if not h:
                    continue
                n.comps.append((h[1].type.name, h[1]))
                if h[1].type.name in ('Transform', 'RectTransform'):
                    n.t = r.tree(*h)
                    tf_of[h[1].path_id] = n
                    n.tfpid = h[1].path_id
            nodes[o.path_id] = n
    for n in nodes.values():
        f = n.t['m_Father']['m_PathID']
        n.parent = tf_of.get(f) if f else None
        n.children = []
    for n in nodes.values():
        if n.parent:
            n.parent.children.append(n)
    for n in nodes.values():  # Unity m_Children order (matters for road point lists)
        order = {c['m_PathID']: i for i, c in enumerate(n.t['m_Children'])}
        n.children.sort(key=lambda c: order.get(c.tfpid, 0))
    roots = sorted([n for n in nodes.values() if n.parent is None], key=lambda n: n.name)

    def setw(n, P):
        n.world = mat_mul(P, mat_local(n.t))
        n.path = ('/' + n.name) if n.parent is None else n.parent.path + '/' + n.name
        for c in n.children:
            setw(c, n.world)
    for rt in roots:
        setw(rt, (1, 0, 0, 1, 0, 0))
    # The bundle holds the top prefab (/Scene1 or /Init) PLUS loose copies of its nested prefabs as extra roots
    # (/Grid, /Bunkers, /Teleports ... or /Shop, /Tent ...). Only the top prefab is the real scene.
    top = TOP or ('/Scene1' if any(x.path == '/Scene1' for x in roots) else '/Init')
    for n in nodes.values():
        n.canon = n.path == top or n.path.startswith(top + '/')
    return nodes, roots


def comp_dump(cab, n, tn, o):
    t = r.tree(cab, o)
    d = {'type': tn}
    if tn == 'MonoBehaviour':
        d['type'] = r.script_name(cab, t) or 'MonoBehaviour'
        d['mono'] = True
    if tn == 'SpriteRenderer':
        d.update({'enabled': t['m_Enabled'], 'sprite': ptr_str(cab, t['m_Sprite'], cab), 'sortingLayer': t['m_SortingLayer'],
                  'sortingLayerID': t['m_SortingLayerID'], 'sortingOrder': t['m_SortingOrder'], 'flipX': t['m_FlipX'],
                  'flipY': t['m_FlipY'], 'color': [rnd(t['m_Color'][k]) for k in 'rgba'], 'drawMode': t['m_DrawMode'],
                  'size': [rnd(t['m_Size']['x']), rnd(t['m_Size']['y'])], 'sortPoint': t.get('m_SpriteSortPoint')})
        return d
    if tn == 'TilemapRenderer':
        d.update({'enabled': t['m_Enabled'], 'sortingLayer': t['m_SortingLayer'], 'sortingLayerID': t['m_SortingLayerID'],
                  'sortingOrder': t['m_SortingOrder'], 'mode': t['m_Mode'], 'material': ptr_str(cab, t['m_Materials'][0], cab) if t['m_Materials'] else None})
        return d
    if tn == 'BoxCollider2D':
        d.update({'enabled': t['m_Enabled'], 'offset': [rnd(t['m_Offset']['x']), rnd(t['m_Offset']['y'])],
                  'size': [rnd(t['m_Size']['x']), rnd(t['m_Size']['y'])], 'isTrigger': t.get('m_IsTrigger'),
                  'usedByComposite': t.get('m_UsedByComposite')})
        return d
    if tn == 'Animator':
        d.update({'controller': ptr_str(cab, t.get('m_Controller'), cab)})
        return d
    data = {k: walkv(v, cab, cab) for k, v in t.items() if k not in DROP_KEYS}
    d['fields'] = data
    return d


def objects_json(cab, nodes, roots):
    out = []
    order = []

    def rec(n, depth):
        order.append((n, depth))
        for c in n.children:
            rec(c, depth + 1)
    for rt in roots:
        rec(rt, 0)
    for n, depth in order:
        scale, rot = mat_info(n.world)
        comps = []
        for tn, o in n.comps:
            if tn in SKIP_COMP:
                comps.append({'type': tn} if tn != 'Tilemap' else {'type': 'Tilemap', 'see': '_tilemaps.json'})
                continue
            comps.append(comp_dump(cab, n, tn, o))
        lp = n.t['m_LocalPosition']
        out.append({'id': n.pid, 'path': n.path, 'name': n.name, 'depth': depth, 'canonical': n.canon, 'active': n.tree.get('m_IsActive'),
                    'layer': n.tree.get('m_Layer'), 'tag': n.tree.get('m_TagString'),
                    'local': [rnd(lp['x']), rnd(lp['y'])], 'world': [rnd(n.world[4]), rnd(n.world[5])],
                    'worldScale': scale, 'worldRotZ': rot, 'nChildren': len(n.children), 'components': comps})
    return out


# ---------------------------------------------------------------- tilemaps
def ident(m):
    return abs(m['e00'] - 1) + abs(m['e11'] - 1) + abs(m['e22'] - 1) + abs(m['e33'] - 1) + sum(
        abs(m[k]) for k in m if k not in ('e00', 'e11', 'e22', 'e33')) < 1e-6


def nearest_grid(cab, n):
    p = n.parent
    while p:
        for tn, o in p.comps:
            if tn == 'Grid':
                return r.tree(cab, o), p
        p = p.parent
    return None, None


def tilemaps_json(cab, nodes):
    res = []
    for n in sorted(nodes.values(), key=lambda x: x.path):
        if not n.canon:
            continue
        tm = next((o for tn, o in n.comps if tn == 'Tilemap'), None)
        if tm is None:
            continue
        t = r.tree(cab, tm)
        grid, gnode = nearest_grid(cab, n)
        rend = next((r.tree(cab, o) for tn, o in n.comps if tn == 'TilemapRenderer'), None)
        col = [tn for tn, o in n.comps if tn in ('TilemapCollider2D', 'CompositeCollider2D')]
        mbs = [(r.script_name(cab, r.tree(cab, o)) or '?') for tn, o in n.comps if tn == 'MonoBehaviour']
        assets = [ptr_str(cab, a['m_Data'], cab) for a in t['m_TileAssetArray']]
        sprites = [ptr_str(cab, a['m_Data'], cab) for a in t['m_TileSpriteArray']]
        colors = [a['m_Data'] for a in t['m_TileColorArray']]
        mats = [a['m_Data'] for a in t['m_TileMatrixArray']]
        pal, pidx, cells = [], {}, []
        for pos, td in t['m_Tiles']:
            ci, si, mi = td['m_TileIndex'], td['m_TileSpriteIndex'], td['m_TileMatrixIndex']
            coli = td['m_TileColorIndex']
            c = colors[coli] if coli < len(colors) else None
            m = mats[mi] if mi < len(mats) else None
            crgba = None if (c is None or (c['r'], c['g'], c['b'], c['a']) == (1, 1, 1, 1)) else [rnd(c[k]) for k in 'rgba']
            mat = None if (m is None or ident(m)) else [rnd(m[k]) for k in ('e00', 'e01', 'e10', 'e11', 'e03', 'e13')]
            key = (assets[ci] if ci < len(assets) else None, sprites[si] if si < len(sprites) else None,
                   json.dumps(crgba), json.dumps(mat))
            if key not in pidx:
                pidx[key] = len(pal)
                e = {'tile': key[0], 'sprite': key[1]}
                if crgba:
                    e['color'] = crgba
                if mat:
                    e['matrix'] = mat  # [e00,e01,e10,e11,tx,ty] of the tile transform
                pal.append(e)
            cells.append([pos['x'], pos['y'], pidx[key]])
        cells.sort(key=lambda c: (c[1], c[0]))
        scale, rot = mat_info(n.world)
        d = {'name': n.name, 'path': n.path, 'id': n.pid, 'cell': [grid['m_CellSize']['x'], grid['m_CellSize']['y']] if grid else [1, 1],
             'cellGap': [grid['m_CellGap']['x'], grid['m_CellGap']['y']] if grid else [0, 0],
             'gridPath': gnode.path if gnode else None, 'gridWorld': [rnd(gnode.world[4]), rnd(gnode.world[5])] if gnode else None,
             'gridScale': mat_info(gnode.world)[0] if gnode else None,
             'offset': [rnd(n.world[4]), rnd(n.world[5])], 'worldScale': scale, 'worldRotZ': rot,
             'origin': [t['m_Origin']['x'], t['m_Origin']['y']], 'size': [t['m_Size']['x'], t['m_Size']['y']],
             'anchor': [t['m_TileAnchor']['x'], t['m_TileAnchor']['y']], 'color': [rnd(t['m_Color'][k]) for k in 'rgba'],
             'renderer': ({'enabled': rend['m_Enabled'], 'sortingLayer': rend['m_SortingLayer'], 'sortingOrder': rend['m_SortingOrder'],
                           'mode': rend['m_Mode']} if rend else None),
             'sortingOrder': rend['m_SortingOrder'] if rend else None,
             'layer': n.tree.get('m_Layer'), 'tag': n.tree.get('m_TagString'), 'active': n.tree.get('m_IsActive'),
             'collider': bool(col), 'colliderComponents': col, 'monoBehaviours': mbs,
             'nTiles': len(cells), 'palette': pal, 'cells': cells}
        res.append(d)
    return res


# ---------------------------------------------------------------- points
POINT_CLASSES = {
    'enemy': {'EscapeEnemySpawnPoint'},
    'chest': {'EscapeChestSpawnPoint'},
    'bunker': {'EscapeBunker'},
    'gate': {'EscapeSceneTransferGate', 'EscapeInstitudeTransferGate'},
    'heroRescue': {'EscapeHeroRescue'},
    'marker': {'EscapeMapWorldMarker'},
    'spawn': {'EscapePlayerCameraSpawnPoint'},
    'mapSize': {'EscapeMapSize'},
    'building': {'EscapeShop', 'EscapeWarehouse', 'EscapeCraftStation', 'EscapeDesignTable', 'EscapeTent',
                 'EscapeResearchStation', 'EscapeBeaconTeleporter'},
    'buildingNameHint': {'EscapeBuildingNameHint'},
    'trigger': {'EscapeSceneDialogTrigger'},
    'bridge': {'BridgeBuilder'},
    'sharedPathWindow': {'EscapeSharedPathWindow'},
    'enemyManager': {'EscapeEnemyManager'},
}


def points_json(cab, nodes, objs_by_id):
    pts = {k: [] for k in POINT_CLASSES}
    pts['other'] = []
    for n in sorted(nodes.values(), key=lambda x: x.path):
        if not n.canon:
            continue
        o = objs_by_id[n.pid]
        for c in o['components']:
            if not c.get('mono'):
                continue
            kind = next((k for k, s in POINT_CLASSES.items() if c['type'] in s), None)
            if kind is None:
                continue
            e = {'path': n.path, 'name': n.name, 'group': n.parent.name if n.parent else None, 'world': o['world'],
                 'class': c['type'], 'fields': c['fields']}
            bc = [x for x in o['components'] if x['type'] == 'BoxCollider2D']
            if bc:
                e['boxColliders'] = [{'offset': b['offset'], 'size': b['size'], 'isTrigger': b['isTrigger']} for b in bc]
            # sprites of this node and of its 'box' children (buildings keep their art there)
            sp = []
            stack = [n]
            while stack:
                m = stack.pop()
                for tn, oo in m.comps:
                    if tn == 'SpriteRenderer':
                        t = r.tree(cab, oo)
                        sp.append({'node': m.path, 'sprite': ptr_str(cab, t['m_Sprite'], cab), 'world': [rnd(m.world[4]), rnd(m.world[5])],
                                   'sortingOrder': t['m_SortingOrder']})
                stack.extend(m.children if kind == 'building' else [])
            if sp:
                e['sprites'] = sp
            if kind == 'sharedPathWindow' or kind == 'enemyManager' or kind == 'bridge':
                pass
            pts[kind].append(e)
    for k in list(pts):
        if k == 'other' and not pts[k]:
            del pts[k]
    return pts


# ---------------------------------------------------------------- rendering
_spr_cache = {}


def get_sprite(cab, ptr):
    """-> (name, img, ax, ay, ppu) or None, resolving PPtr across bundles."""
    h = r.resolve(ptr, cab)
    if h is None:
        return None
    k = (h[0], h[1].path_id)
    if k not in _spr_cache:
        try:
            _spr_cache[k] = r.sprite(*h)
        except Exception as e:  # noqa
            print('sprite fail', k, e)
            _spr_cache[k] = None
    return _spr_cache[k]


def paste_sprite(canvas, spr, wx, wy, sx, sy, minx, maxy, tint=None, rotdeg=0.0, ppx=PX):
    """Draw sprite with its pivot at world (wx,wy); sx,sy = scale in world units per sprite unit (sign = flip)."""
    name, img, ax, ay, ppu = spr
    f = ppx / ppu
    w, h = img.size
    im = img
    px, py = ax, ay  # pivot in image px, origin top-left
    if sx < 0:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        px = w - px
    if sy < 0:
        im = im.transpose(Image.FLIP_TOP_BOTTOM)
        py = h - py
    nw = max(1, int(round(w * f * abs(sx))))
    nh = max(1, int(round(h * f * abs(sy))))
    if (nw, nh) != (w, h):
        im = im.resize((nw, nh), Image.NEAREST)
    px *= nw / w
    py *= nh / h
    if tint and tint != [1, 1, 1, 1]:
        bands = im.split()
        im = Image.merge('RGBA', [b.point(lambda v, m=m: int(v * m)) for b, m in zip(bands, tint)])
    if abs(rotdeg) > 0.5:
        pad = max(nw, nh)
        big = Image.new('RGBA', (nw + 2 * pad, nh + 2 * pad))
        big.paste(im, (pad, pad))
        big = big.rotate(rotdeg, resample=Image.NEAREST, center=(pad + px, pad + py))
        im, px, py = big, pad + px, pad + py
    X = int(round((wx - minx) * ppx - px))
    Y = int(round((maxy - wy) * ppx - py))
    # clip to canvas
    W, H = canvas.size
    x0, y0 = max(0, X), max(0, Y)
    x1, y1 = min(W, X + im.width), min(H, Y + im.height)
    if x1 <= x0 or y1 <= y0:
        return
    crop = im.crop((x0 - X, y0 - Y, x1 - X, y1 - Y))
    region = canvas.crop((x0, y0, x1, y1))
    region.alpha_composite(crop)
    canvas.paste(region, (x0, y0))




# ---------------------------------------------------------------- dual grid / scatter / ground fill (preview only)
# jess::codes dual-grid table: (TL,TR,BL,BR) -> index into displayTileSubSprites. Index 6 = FULL, 12 = EMPTY
# (checked visually against overview_Scene1.png: dirt/water edges line up).
DUAL = {(1, 1, 1, 1): 6, (0, 0, 0, 1): 13, (0, 0, 1, 0): 0, (0, 1, 0, 0): 8, (1, 0, 0, 0): 15, (0, 1, 0, 1): 1,
        (1, 0, 1, 0): 11, (0, 0, 1, 1): 3, (1, 1, 0, 0): 9, (0, 1, 1, 1): 5, (1, 0, 1, 1): 2, (1, 1, 0, 1): 10,
        (1, 1, 1, 0): 7, (0, 1, 1, 0): 14, (1, 0, 0, 1): 4, (0, 0, 0, 0): 12}


def hrand(*a):
    """Deterministic pseudo-random in [0,1) from ints (preview only; the game's real RNG is unknown)."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
        h ^= h >> 15
        h = (h * 2246822519) & 0xffffffff
    return (h & 0xffffff) / float(0x1000000)


def mono_tree(cab, n, cls):
    for tn, o in n.comps:
        if tn == 'MonoBehaviour':
            t = r.tree(cab, o)
            if r.script_name(cab, t) == cls:
                return t
    return None


def render(cab, nodes, tms, pts, bounds, opts):
    minx, miny, maxx, maxy = bounds
    W, H = int((maxx - minx) * PX), int((maxy - miny) * PX)
    print('  canvas', W, H)
    canvas = Image.new('RGBA', (W, H), opts.get('bg', (24, 28, 34, 255)))
    items = []
    stats = {'ground': 0, 'dual': 0, 'scatter': 0, 'tile': 0, 'sr': 0}

    def spr_of(ptr):
        return get_sprite(cab, ptr)

    # ---- ground fill (EscapeBottomGroundTileFillArea over EscapeMapSize)
    for n in nodes.values():
        if not n.canon:
            continue
        gf = mono_tree(cab, n, 'EscapeBottomGroundTileFillArea')
        ms = mono_tree(cab, n, 'EscapeMapSize')
        if gf and ms and opts.get('ground', True):
            pool = [spr_of(p) for p in gf['spritePool']]
            sc = gf['tilemapLocalScale']['x']
            lb, rt = ms['leftBottomLocalPosition'], ms['rightTopLocalPositionExclusive']
            for cx in range(int(lb['x'] // sc), int(math.ceil(rt['x'] / sc))):
                for cy in range(int(lb['y'] // sc), int(math.ceil(rt['y'] / sc))):
                    v = hrand(cx, cy, gf['randomSeed'])
                    s = pool[0] if v < 0.85 else pool[1 + int((v - 0.85) / 0.15 * (len(pool) - 1)) % (len(pool) - 1)]
                    if s is not None:
                        items.append(((-99, 0, 0, 0), 'spr', (s, (cx + 0.5) * sc, (cy + 0.5) * sc, sc, sc, None, 0)))
                        stats['ground'] += 1

    # ---- tilemaps
    for tm in (tms if opts.get('tiles', True) else []):
        rd = tm['renderer']
        if not rd or not tm['nTiles']:
            continue
        n = nodes[tm['id']]
        M = n.world
        ws = mat_info(M)[0]
        cx, cy = tm['cell']
        ax, ay = tm['anchor']
        tree = r.tree(cab, next(o for tn, o in n.comps if tn == 'Tilemap'))
        sprmap = {}
        for a in tree['m_TileSpriteArray']:
            sprmap[ptr_str(cab, a['m_Data'], cab)] = spr_of(a['m_Data'])
        lay, order = rd['sortingLayer'], rd['sortingOrder']
        dg = mono_tree(cab, n, 'DualGridTilemap')
        sc_ = mono_tree(cab, n, 'EscapeTilemapRandomTileScatter')
        if dg is not None:
            occ = set((c[0], c[1]) for c in tm['cells'])
            subs = [spr_of(p) for p in dg['displayTileSubSprites']]
            extra = {e['index']: [spr_of(p) for p in e['sprites']] for e in dg['extraDisplayTileSprites']}
            xs = [c[0] for c in tm['cells']]
            ys = [c[1] for c in tm['cells']]
            for i in range(min(xs), max(xs) + 2):
                for j in range(min(ys), max(ys) + 2):
                    key = (int((i - 1, j) in occ), int((i, j) in occ), int((i - 1, j - 1) in occ), int((i, j - 1) in occ))
                    idx = DUAL[key]
                    if key == (0, 0, 0, 0):
                        continue
                    s = subs[idx]
                    if idx in extra and hrand(i, j, dg['displayTileVariantRandomSeed'], 7) < 0.3:
                        ex = extra[idx]
                        s = ex[int(hrand(i, j, 3) * len(ex)) % len(ex)]
                    if s is None:
                        continue
                    wx, wy = mat_apply(M, i * cx, j * cy)
                    items.append(((lay, order, 1e9, 0), 'spr', (s, wx, wy, ws[0], ws[1], None, 0)))
                    stats['dual'] += 1
            continue
        if sc_ is not None:
            pool = [spr_of(p) for p in sc_['spritePool']]
            # The scatter builds its own output grid of `outputGridCellSize` WORLD units (0.5) inside each source cell
            # (source cell = 2x2 world units here) and drops native-scale (not x2) sprites there.
            og = sc_['outputGridCellSize']['x']
            k = max(1, int(round(cx * ws[0] / og)))
            for c in tm['cells']:
                for m_ in range(sc_['randomPositionCountPerSourceCell']):
                    if hrand(c[0], c[1], m_, 11) > sc_['nonEdgeCellSpriteProbability']:
                        continue
                    sx_ = int(hrand(c[0], c[1], m_, 12) * k)
                    sy_ = int(hrand(c[0], c[1], m_, 13) * k)
                    bx, by = mat_apply(M, c[0] * cx, c[1] * cy)
                    wx, wy = bx + (sx_ + 0.5) * og, by + (sy_ + 0.5) * og
                    s = pool[int(hrand(c[0], c[1], m_, 14) * len(pool)) % len(pool)]
                    if s is None:
                        continue
                    items.append(((lay, order, -wy, 1), 'spr', (s, wx, wy, 1.0, 1.0, None, 0)))
                    stats['scatter'] += 1
            continue
        per_tile_sort = (lay, order) == (5, 5)
        for x, y, pi in tm['cells']:
            p = tm['palette'][pi]
            s = sprmap.get(p['sprite'])
            if s is None:
                continue
            lx, ly = (x + ax) * cx, (y + ay) * cy
            sx = sy = 1.0
            rot = 0.0
            if 'matrix' in p:
                e00, e01, e10, e11, tx, ty = p['matrix']
                det = e00 * e11 - e01 * e10
                sx = math.hypot(e00, e10)
                sy = math.hypot(e01, e11)
                if det < 0:
                    sx = -sx
                rot = math.degrees(math.atan2(e10 / sx, e00 / sx)) if sx else 0
                lx += tx
                ly += ty
            wx, wy = mat_apply(M, lx, ly)
            key = (lay, order, -wy if per_tile_sort else 1e9, 2)
            items.append((key, 'spr', (s, wx, wy, sx * ws[0], sy * ws[1], p.get('color'), rot)))
            stats['tile'] += 1

    # ---- SpriteRenderers
    for n in (nodes.values() if opts.get('sr', True) else []):
        if not n.canon:
            continue
        for tn, o in n.comps:
            if tn != 'SpriteRenderer':
                continue
            t = r.tree(cab, o)
            if not t['m_Enabled'] or not t['m_Sprite']['m_PathID']:
                continue
            s = spr_of(t['m_Sprite'])
            if s is None:
                continue
            ws, rot = mat_info(n.world)
            sx, sy = ws
            if t['m_FlipX']:
                sx = -sx
            if t['m_FlipY']:
                sy = -sy
            if t['m_DrawMode'] != 0:
                sx *= t['m_Size']['x'] / (s[1].width / s[4])
                sy *= t['m_Size']['y'] / (s[1].height / s[4])
            items.append(((t['m_SortingLayer'], t['m_SortingOrder'], -n.world[5], 3), 'spr',
                          (s, n.world[4], n.world[5], sx, sy, [t['m_Color'][k] for k in 'rgba'], rot)))
            stats['sr'] += 1
    print('  drawn', stats)
    items.sort(key=lambda x: x[0])
    for key, kind, (s, wx, wy, sx, sy, tint, rot) in items:
        paste_sprite(canvas, s, wx, wy, sx, sy, minx, maxy, tint, rot)
    return canvas


def overlay(canvas, pts, bounds):
    minx, miny, maxx, maxy = bounds
    dr = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype('arial.ttf', 16)
    except Exception:
        font = ImageFont.load_default()

    def dot(w, col, lab=None, rad=5):
        X, Y = (w[0] - minx) * PX, (maxy - w[1]) * PX
        dr.ellipse((X - rad, Y - rad, X + rad, Y + rad), fill=col, outline=(0, 0, 0, 255))
        if lab:
            dr.text((X + rad + 2, Y - rad), lab, fill=col, font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for e in pts.get('enemy', []):
        dot(e['world'], (255, 40, 40, 255), None, 5)
    for e in pts.get('chest', []):
        dot(e['world'], (255, 220, 0, 255), None, 5)
    for e in pts.get('gate', []):
        dot(e['world'], (0, 255, 80, 255), e['name'], 9)
    for e in pts.get('building', []):
        dot(e['world'], (0, 230, 255, 255), e['name'], 8)
    for e in pts.get('heroRescue', []):
        dot(e['world'], (255, 0, 255, 255), 'rescue', 8)
    for e in pts.get('spawn', []):
        dot(e['world'], (255, 255, 255, 255), 'spawn', 8)


def save_previews(canvas, base, center):
    W, H = canvas.size
    im = canvas
    if W > 2400:
        im = canvas.resize((2400, int(H * 2400 / W)), Image.LANCZOS)
    im.convert('RGB').save(os.path.join(OUT, base + '_preview.png'))
    cx, cy = center
    w, h = min(1200, W), min(800, H)
    x0 = int(max(0, min(W - w, cx - w // 2)))
    y0 = int(max(0, min(H - h, cy - h // 2)))
    canvas.crop((x0, y0, x0 + w, y0 + h)).convert('RGB').save(os.path.join(OUT, base + '_crop.png'))


def export_overviews():
    rr = Rip(bundles=['escape_map'])
    for cab in rr.cabs('escape_map'):
        for o in rr.files[cab].objects.values():
            if o.type.name == 'Texture2D' and o.peek_name() in ('Init', 'Scene1'):
                img = o.read().image
                img.save(os.path.join(OUT, 'overview_%s.png' % o.peek_name()))
                print('overview', o.peek_name(), img.size)


def main(argv):
    global r
    names = [a for a in argv[1:] if not a.startswith('--')] or ['escape_terrain_init', 'escape_terrain_scene1']
    r = Rip(bundles=names)
    for nm in names:
        print('==', nm)
        cab = r.loaded[nm + '.ab'][0]
        nodes, roots = build_graph(cab)
        objs = objects_json(cab, nodes, roots)
        by_id = {o['id']: o for o in objs}
        json.dump({'bundle': nm, 'cab': cab, 'roots': [x.path for x in roots], 'nObjects': len(objs), 'objects': objs},
                  io.open(os.path.join(OUT, nm + '_objects.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        tms = tilemaps_json(cab, nodes)
        json.dump({'bundle': nm, 'tilemaps': tms}, io.open(os.path.join(OUT, nm + '_tilemaps.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        pts = points_json(cab, nodes, by_id)
        json.dump(pts, io.open(os.path.join(OUT, nm + '_points.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('  objects', len(objs), 'canonical', sum(1 for o in objs if o['canonical']), 'tilemaps', len(tms), 'tiles', sum(t['nTiles'] for t in tms))
        print('  points', {k: len(v) for k, v in pts.items()})
        if '--nopreview' in argv:
            continue
        if pts.get('mapSize'):
            ms = pts['mapSize'][0]['fields']
            lb, rt = ms['leftBottomLocalPosition'], ms['rightTopLocalPositionExclusive']
            bounds = (lb['x'], lb['y'], rt['x'], rt['y'])
        else:
            bounds = (-60, -30, 80, 60)
        print('  bounds', bounds)
        cv = render(cab, nodes, tms, pts, bounds, {})
        if '--keepfull' in argv:
            cv.convert('RGB').save(os.path.join(OUT, nm + '_nooverlay_full.png'))
        overlay(cv, pts, bounds)
        c = ((bounds[2] - bounds[0]) / 2 * PX, (bounds[3] - bounds[1]) / 2 * PX)
        save_previews(cv, nm, c)
    export_overviews()


if __name__ == '__main__':
    main(sys.argv)
