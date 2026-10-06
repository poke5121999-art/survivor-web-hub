# -*- coding: utf-8 -*-
"""Lever: trich ban do Hide And Seek (MapRandom1..3 + scene mapgenerate) -> data/hs-map.js.

Chay:  PYTHONIOENCODING=utf-8 python -I games/tron-tim/tools/build_map.py
Doc :  D:\\phanminhtam-ref\\project\\ExportedProject\\Assets
         GameObject/MapRandom1..3.prefab, Scenes/mapgenerate.unity, Scripts/Assembly-CSharp/*.cs.meta (guid -> lop)
         D:\\phanminhtam-ref\\verify-6000-h.log  (dong "SNAPFULL LayoutN ... <- MapRandomM": cach ghep de ve map_preview.png)
Ghi :  games/tron-tim/data/hs-map.js, games/tron-tim/tools/map_preview.png

Toa do ra: x = x_Unity ; y = Z_MAX - z_Unity (Z_MAX = 160) -> y tang xuong duoi man hinh.
Item trong chunk la TUONG DOI goc chunk (= Layout anchor): x = dx, y = -dz. Vi tri the gioi = anchors[i] + item.
rot = goc cua truc x cuc bo cua o chu nhat trong he (x, y) man hinh, do, chieu kim dong ho, chuan hoa [-90, 90).
w,h = kich thuoc BoxCollider * scale the gioi doc 2 truc cuc bo x,z (sau khi quay). Diem (spawn, box) co w=h=0.
"""
from __future__ import print_function
import sys, os, io, re, math, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from unity_yaml import load_docs, script_guids, quat, vec

ASSETS = r'D:\phanminhtam-ref\project\ExportedProject\Assets'
OUT_JS = os.path.join(HERE, '..', 'data', 'hs-map.js')
OUT_PNG = os.path.join(HERE, 'map_preview.png')
LOG = r'D:\phanminhtam-ref\verify-6000-h.log'
Z_MAX = 160.0
KINDS = ('wall', 'grass', 'grassarea', 'table', 'trash', 'water', 'spawn', 'box', 'other')
CHUNK_W, CHUNK_H = 40.0, 30.0


# ---------------------------------------------------------------- matrices
def mat_from_q(q):
    x, y, z, w = q
    return [[1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)],
            [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)],
            [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y)]]

def mm(a, b):
    return [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

class Xf(object):
    def __init__(self, R, t):
        self.R = R; self.t = t
    def apply(self, p):
        return [sum(self.R[i][k]*p[k] for k in range(3)) + self.t[i] for i in range(3)]
    def compose(self, c):
        return Xf(mm(self.R, c.R), self.apply(c.t))

def local_xf(tr):
    R = mat_from_q(quat(tr['m_LocalRotation'])); s = vec(tr['m_LocalScale'])
    return Xf([[R[i][j]*s[j] for j in range(3)] for i in range(3)], list(vec(tr['m_LocalPosition'])))


class Hier(object):
    """Transform hierarchy of one YAML file. keep_root=False: root pos/rot dropped, root scale kept
    (prefab instantiated at the anchor with Quaternion.identity: RandomMapPrefabs.GenerateMap)."""
    def __init__(self, docs, sg, keep_root):
        self.docs = docs; self.sg = sg; self.keep_root = keep_root
        self.go_of = {f: d['m_GameObject']['fileID'] for f, (c, d) in docs.items() if c == 4}
        self.tr_of = dict((v, k) for k, v in self.go_of.items())
        self._w = {}
    def name(self, tr): return self.docs[self.go_of[tr]][1]['m_Name']
    def kids(self, tr): return [e['fileID'] for e in self.docs[tr][1]['m_Children'] if e['fileID'] in self.go_of]
    def world(self, tr):
        if tr in self._w: return self._w[tr]
        d = self.docs[tr][1]; f = d['m_Father']['fileID']
        if f == 0 or f not in self.go_of:
            if self.keep_root: w = local_xf(d)
            else:
                s = vec(d['m_LocalScale'])
                w = Xf([[s[0], 0, 0], [0, s[1], 0], [0, 0, s[2]]], [0, 0, 0])
        else:
            w = self.world(f).compose(local_xf(d))
        self._w[tr] = w
        return w
    def path(self, tr):
        out = []
        while tr and tr in self.go_of:
            out.append(self.name(tr)); tr = self.docs[tr][1]['m_Father']['fileID']
        return '/'.join(reversed(out))
    def comps(self, go):
        out = []
        for cc in self.docs[go][1]['m_Component']:
            cid = cc['component']['fileID']
            if cid not in self.docs: continue
            c, b = self.docs[cid]
            out.append(('S:' + self.sg.get(b['m_Script']['guid'], '?' + b['m_Script']['guid'][:6]), b) if c == 114 else (c, b))
        return out
    def go_of_component(self, cid):
        return self.docs[cid][1]['m_GameObject']['fileID']


def box_world(xf, size, center):
    """Local box -> oriented rect on the ground plane, in OUTPUT axes (x, -z)."""
    c = xf.apply(list(center))
    ax = [xf.R[i][0] for i in range(3)]; az = [xf.R[i][2] for i in range(3)]
    lx = math.hypot(ax[0], ax[2]); lz = math.hypot(az[0], az[2])
    w = abs(size[0])*lx; h = abs(size[2])*lz
    rot = math.degrees(math.atan2(-ax[2], ax[0])) if lx > 1e-6 else 0.0
    rot = (rot + 180.0) % 360.0 - 180.0
    while rot >= 90: rot -= 180
    while rot < -90: rot += 180
    # rotating by +-180 keeps the same rect; the 90 fold swaps nothing because rot is the local-x axis angle
    return c[0], c[2], w, h, rot


# ---------------------------------------------------------------- prefab (chunk)
def classify_prefab(h):
    docs = h.docs
    root = [f for f, (c, d) in docs.items() if c == 4 and d['m_Father']['fileID'] == 0][0]
    root_go = h.go_of[root]
    mgr = [b for k, b in h.comps(root_go) if k == 'S:AddPointToButtonManager'][0]
    spawn_set = set(e['fileID'] for e in mgr['spawnPoint'])
    box_set = set(e['fileID'] for e in mgr['pointBox'])
    items = []; groups = collections.Counter()
    for go, (c, d) in sorted(docs.items()):
        if c != 1 or go not in h.tr_of: continue
        tr = h.tr_of[go]; name = d['m_Name']
        base = re.sub(r' \(\d+\)$', '', name).replace('(Clone)', '')
        xf = h.world(tr); comps = h.comps(go); cls = [k for k, b in comps]
        boxes = [b for k, b in comps if k == 65]
        solid = [b for b in boxes if not b.get('m_IsTrigger')]
        nav = [b for k, b in comps if k == 208]
        def emit(kind, size, center, suffix=''):
            cx, cz, w, hh, rot = box_world(xf, size, center)
            items.append(dict(k=kind, x=cx, z=cz, w=w, h=hh, rot=rot, name=name + suffix, path=h.path(tr)))
        def emit_pt(kind, suffix=''):
            p = xf.apply([0, 0, 0])
            items.append(dict(k=kind, x=p[0], z=p[2], w=0.0, h=0.0, rot=0.0, name=name + suffix, path=h.path(tr)))
        if tr in spawn_set: emit_pt('spawn'); continue
        if tr in box_set: emit_pt('box'); continue
        if 'S:TableObject' in cls:     # MeshCollider has no box: NavMeshObstacle box = footprint
            n = nav[0]
            emit('table', [2*float(n['m_Extents'][a]) for a in 'xyz'], vec(n['m_Center'])); continue
        if 'S:InGrass' in cls:
            emit('grassarea', vec(boxes[0]['m_Size']), vec(boxes[0]['m_Center'])); continue
        if 'S:TrashTrigger' in cls:
            way = [b for k, b in comps if k == 'S:TrashTrigger'][0].get('way')
            emit('other', vec(boxes[0]['m_Size']), vec(boxes[0]['m_Center']), ' [TrashTrigger way=%s]' % way); continue
        if 'S:TrashWater' in cls:      # inactive puddle (Splat_01(Clone)): only appears after a can is hit
            emit('other', vec(boxes[0]['m_Size']), vec(boxes[0]['m_Center']), ' [TrashWater puddle, inactive until can hit]'); continue
        if 'S:WaterSplat' in cls:
            emit('water', vec(boxes[0]['m_Size']), vec(boxes[0]['m_Center'])); continue
        if base == 'TrashCanWithBagTrash' and solid:      # the live can (active, BoxCollider + NavMeshObstacle)
            emit('trash', vec(solid[0]['m_Size']), vec(solid[0]['m_Center'])); continue
        if base == 'TrashCan' and solid:                  # TrashObject.trashList pieces: inactive, shown after a hit
            emit('other', vec(solid[0]['m_Size']), vec(solid[0]['m_Center']), ' [TrashCan piece, inactive]'); continue
        if base.startswith('Wall') and solid:
            for b in solid: emit('wall', vec(b['m_Size']), vec(b['m_Center']))
            continue
        if base == 'Grass1' and boxes:
            emit('grass', vec(boxes[0]['m_Size']), vec(boxes[0]['m_Center'])); continue
        if cls == [4] and h.kids(tr):          # pure container node (Random group, TableList, GrassGroup...)
            groups[base] += 1; continue
        emit_pt('other')
    return items, groups


# ---------------------------------------------------------------- scene
def scene_data(sg):
    docs = load_docs(ASSETS + r'\Scenes\mapgenerate.unity')
    h = Hier(docs, sg, True)
    roots = dict((h.name(f), f) for f, (c, d) in docs.items() if c == 4 and d['m_Father']['fileID'] == 0)
    def child(par, nm): return [k for k in h.kids(par) if h.name(k) == nm]
    def pos(tr):
        p = h.world(tr).apply([0, 0, 0]); return p
    mg = roots['MapGenerate']
    layouts = {}
    for k in h.kids(mg):
        m = re.match(r'Layout(\d+)$', h.name(k))
        # two objects are named Layout1: the anchor (no mesh) and a 70x50 plane (mesh); anchor = no MeshFilter
        if m and not any(c == 33 for c, b in h.comps(h.go_of[k])):
            layouts[int(m.group(1))] = pos(k)
    # RandomMapPrefabs.point order = anchors array; take script field to confirm
    rmp = [b for k, b in h.comps(h.go_of[mg]) if k == 'S:RandomMapPrefabs'][0]
    point_ids = [e['fileID'] for e in rmp['point']]
    anchors_order = [pos(t) for t in point_ids]
    # static walls
    wg = child(mg, 'WallGroup')[0]
    static = []; static_other = collections.Counter()
    for k in h.kids(wg):
        go = h.go_of[k]; comps = h.comps(go); xf = h.world(k)
        boxes = [b for c, b in comps if c == 65]
        nm = h.name(k)
        if boxes:
            for b in boxes:
                cx, cz, w, hh, rot = box_world(xf, vec(b['m_Size']), vec(b['m_Center']))
                static.append(dict(k='wall', x=cx, z=cz, w=w, h=hh, rot=rot, name=nm))
        else:
            p = xf.apply([0, 0, 0])
            static_other[re.sub(r' \(\d+\)$', '', nm)] += 1
            static.append(dict(k='other', x=p[0], z=p[2], w=0.0, h=0.0, rot=0.0, name=re.sub(r' \(\d+\)$', '', nm)))
    # zone
    zone_root = roots['Zone']
    zp = child(zone_root, 'ZonePrefab')[0]
    # the Zone component sits on the object named Zone (child of ZonePrefab)
    zc = None
    for k in h.kids(zp):
        for kk, b in h.comps(h.go_of[k]):
            if isinstance(b, dict) and 'StepsToEnd' in b: zc = b
    def circ(cid):
        go = h.go_of_component(cid); tr = h.tr_of[go]
        r = [b for kk, b in h.comps(go) if isinstance(b, dict) and 'Radius' in b][0]['Radius']
        p = pos(tr); return dict(x=p[0], z=p[2], r=float(r), name=h.name(tr))
    first = [circ(e['fileID']) for e in zc['FirstZoneCircle']]
    last = [circ(e['fileID']) for e in zc['LastZoneCircle']]
    steps = int(zc['StepsToEnd'])
    # Scene: Escape / Gate / EscapePoint / Environment
    sc = roots['Scene']
    esc = {}
    for nm in ('Escape', 'Gate', 'EscapePoint', 'Environment'):
        t = child(sc, nm)[0]; p = pos(t)
        e = dict(x=p[0], z=p[2], y=p[1])
        bx = [b for c, b in h.comps(h.go_of[t]) if c == 65]
        if bx:
            cx, cz, w, hh, rot = box_world(h.world(t), vec(bx[0]['m_Size']), vec(bx[0]['m_Center']))
            e.update(x=cx, z=cz, w=w, h=hh, rot=rot, trigger=bool(bx[0].get('m_IsTrigger')))
        esc[nm] = e
    # floor plane (named Layout1, has MeshFilter)
    floor = None
    for k in h.kids(mg):
        if h.name(k) == 'Layout1' and any(c == 33 for c, b in h.comps(h.go_of[k])):
            p = pos(k); s = vec(docs[k][1]['m_LocalScale'])
            floor = dict(x=p[0], z=p[2], sx=s[0], sz=s[2])
    return dict(layouts=layouts, anchors_order=anchors_order, static=static, static_other=static_other,
                zone=dict(first=first, last=last, steps=steps), esc=esc, floor=floor, zcomp=zc)


def parse_log():
    """Layout k -> MapRandomN (from the reference screenshot run)."""
    asg = {}
    for ln in io.open(LOG, encoding='utf-8', errors='replace'):
        m = re.match(r'SNAPFULL Layout(\d+) \(.*?\) <- MapRandom(\d+)', ln)
        if m: asg[int(m.group(1))] = int(m.group(2))
    return asg


# ---------------------------------------------------------------- output
def r2(v):
    v = round(v + 0.0, 2)
    return 0.0 if v == 0 else v

def sort_key(i):
    return (KINDS.index(i['k']), i['y'], i['x'], i['name'], i['w'], i['h'])

def out_item(i, ox=0.0, oy=0.0):
    """Unity (x,z) -> out. i['x'], i['z'] are Unity; chunk items subtract the anchor first."""
    return dict(k=i['k'], x=r2(i['x'] - ox), y=r2(-(i['z'] - oy)) if oy != 'abs' else 0, w=r2(i['w']), h=r2(i['h']),
                rot=r2(i['rot']), name=i['name'])

def js_item(it, with_name):
    s = '{k:"%s",x:%s,y:%s,w:%s,h:%s,rot:%s' % (it['k'], fmt(it['x']), fmt(it['y']), fmt(it['w']), fmt(it['h']), fmt(it['rot']))
    if with_name and it['k'] == 'other':
        s += ',n:%s' % jstr(it['name'])
    return s + '}'

def fmt(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def jstr(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def main():
    sg = script_guids(ASSETS + r'\Scripts\Assembly-CSharp')
    chunks = {}; census = {}
    for n in (1, 2, 3):
        h = Hier(load_docs(ASSETS + r'\GameObject\MapRandom%d.prefab' % n), sg, False)
        items, groups = classify_prefab(h)
        chunks['MapRandom%d' % n] = items
        census[n] = (items, groups)
    S = scene_data(sg)
    asg = parse_log()
    L = S['layouts']
    assert sorted(L) == list(range(1, 10)), 'thieu Layout: %s' % sorted(L)
    assert len(asg) == 9, 'log thieu SNAPFULL Layout: %s' % asg

    # ---- anchors: Layout1..9 (output coords). order = Layout index
    anchors = [[r2(L[i][0]), r2(Z_MAX - L[i][2])] for i in range(1, 10)]

    out_chunks = {}
    for name, items in sorted(chunks.items()):
        o = []
        for i in items:
            o.append(dict(k=i['k'], x=r2(i['x']), y=r2(-i['z']), w=r2(i['w']), h=r2(i['h']), rot=r2(i['rot']), name=i['name']))
        o.sort(key=sort_key)
        out_chunks[name] = o

    static = [dict(k=i['k'], x=r2(i['x']), y=r2(Z_MAX - i['z']), w=r2(i['w']), h=r2(i['h']), rot=r2(i['rot']), name=i['name'])
              for i in S['static']]
    static.sort(key=sort_key)

    def zc(c): return dict(x=r2(c['x']), y=r2(Z_MAX - c['z']), r=r2(c['r']))
    zone = dict(first=[zc(c) for c in S['zone']['first']], last=[zc(c) for c in S['zone']['last']], steps=S['zone']['steps'])
    def pt(e, extra=()):
        d = dict(x=r2(e['x']), y=r2(Z_MAX - e['z']))
        for k in extra:
            if k in e: d[k] = r2(e[k])
        return d
    esc = S['esc']
    gate = dict(escape=pt(esc['Escape'], ('w', 'h', 'rot')), gate=pt(esc['Gate'], ('w', 'h', 'rot')), escapePoint=pt(esc['EscapePoint']))
    # bounds: union of 9 chunks, Layout is the chunk CENTER (anchors measured, chunk 40 x 30)
    xs = [a[0] for a in anchors]; ys = [a[1] for a in anchors]
    bounds = dict(x0=r2(min(xs) - CHUNK_W/2), y0=r2(min(ys) - CHUNK_H/2), x1=r2(max(xs) + CHUNK_W/2), y1=r2(max(ys) + CHUNK_H/2))

    # ---- census
    print('=== CENSUS per chunk (kind: count) ===')
    for n in (1, 2, 3):
        c = collections.Counter(i['k'] for i in out_chunks['MapRandom%d' % n])
        print('MapRandom%d: %s' % (n, ', '.join('%s=%d' % (k, c[k]) for k in KINDS if c[k])))
        oth = collections.Counter(re.sub(r' \(\d+\)$', '', i['name']) for i in out_chunks['MapRandom%d' % n] if i['k'] == 'other')
        print('   other (explicit):', dict(oth))
        print('   container nodes ignored:', dict(census[n][1]))
    c = collections.Counter(i['k'] for i in static)
    print('static: %s ; non-collider nodes: %s' % (dict(c), dict(S['static_other'])))
    print('zone first: %s' % zone['first']); print('zone last: %s' % zone['last']); print('steps', zone['steps'])
    print('gate/escape:', gate); print('bounds', bounds)
    print('anchors', anchors)
    print('anchors in RandomMapPrefabs.point order (unity x,z):', [(r2(p[0]), r2(p[2])) for p in S['anchors_order']])
    print('log assignment Layout->MapRandom:', sorted(asg.items()))
    print('floor plane (scene Layout1 mesh): ', S['floor'])
    print('CurrentSafeZone/NextSafeZone default (serialized):', {k: S['zcomp'][k] for k in ('CurrentSafeZone',)})

    # ---- hs-map.js
    L_ = []
    L_.append('/* Sinh boi games/tron-tim/tools/build_map.py - KHONG sua tay, chay lai lever.')
    L_.append(' * Nguon: Assets/GameObject/MapRandom1..3.prefab, Assets/Scenes/mapgenerate.unity (AssetRipper export cua APK Hide And Seek).')
    L_.append(' * Toa do: x = x_Unity ; y = %g - z_Unity (y tang xuong duoi man hinh). Don vi Unity (1 = 16 px).' % Z_MAX)
    L_.append(' * Item cua chunk la tuong doi tam chunk (= anchors[i]); the gioi = anchors[i] + {x,y}. Chunk 40 x 30, anchor la TAM chunk.')
    L_.append(' * rot = do, goc truc x cuc bo cua o (w x h) trong he x-phai y-xuong, chieu kim dong ho, [-90,90). Diem: w=h=0.')
    L_.append(' * k: wall solid | grass bui (trigger, khong chan) | grassarea vung InGrass | table ban (nhay qua) | trash thung rac (TrashObject)')
    L_.append(' *    water vung nuoc WaterSplat (TrashWater chi hien sau khi dap thung: kind other, ten co [TrashWater]) | spawn AddPointToButtonManager.spawnPoint | box pointBox (cho rai hop buff) | other (n = ten)')
    L_.append(' * anchors[0..8] = Layout1..9. Gan chunk -> anchor la ngau nhien luc chay (RandomMapPrefabs); mau tham chieu: ' + ', '.join('L%d=MapRandom%d' % (k, v) for k, v in sorted(asg.items())) + '.')
    L_.append(' */')
    L_.append('window.HS_MAP = {')
    L_.append('  chunk: {w: 40, h: 30},')
    L_.append('  zMax: %s,' % fmt(Z_MAX))
    L_.append('  anchors: [%s],' % ', '.join('[%s, %s]' % (fmt(a[0]), fmt(a[1])) for a in anchors))
    L_.append('  sample: {%s},' % ', '.join('%d: %d' % (k, v) for k, v in sorted(asg.items())))
    L_.append('  chunks: {')
    for ci, (name, items) in enumerate(sorted(out_chunks.items())):
        L_.append('    %s: {items: [' % name)
        L_.append(',\n'.join('      ' + js_item(i, True) for i in items))
        L_.append('    ]}%s' % (',' if ci < 2 else ''))
    L_.append('  },')
    L_.append('  static: [')
    L_.append(',\n'.join('    ' + js_item(i, True) for i in static))
    L_.append('  ],')
    L_.append('  zone: {first: [%s], last: [%s], steps: %d},' % (
        ', '.join('{x:%s,y:%s,r:%s}' % (fmt(c['x']), fmt(c['y']), fmt(c['r'])) for c in zone['first']),
        ', '.join('{x:%s,y:%s,r:%s}' % (fmt(c['x']), fmt(c['y']), fmt(c['r'])) for c in zone['last']), zone['steps']))
    def jpt(d): return '{' + ','.join('%s:%s' % (k, fmt(v)) for k, v in d.items()) + '}'
    L_.append('  gate: {escape: %s, gate: %s, escapePoint: %s},' % (jpt(gate['escape']), jpt(gate['gate']), jpt(gate['escapePoint'])))
    L_.append('  bounds: {x0: %s, y0: %s, x1: %s, y1: %s}' % (fmt(bounds['x0']), fmt(bounds['y0']), fmt(bounds['x1']), fmt(bounds['y1'])))
    L_.append('};')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write('\n'.join(L_) + '\n')
    print('wrote', os.path.normpath(OUT_JS))

    render_preview(anchors, out_chunks, static, zone, gate, bounds, asg)


# ---------------------------------------------------------------- preview
COL = dict(wall=(235, 235, 235), grass=(120, 80, 40), grassarea=(70, 110, 50), table=(240, 200, 40), trash=(30, 90, 50),
           water=(230, 80, 200), spawn=(60, 200, 255), box=(255, 140, 0), other=(150, 150, 150))
FILL_ORDER = ('grassarea', 'water', 'grass', 'wall', 'table', 'trash', 'other', 'spawn', 'box')

def render_preview(anchors, out_chunks, static, zone, gate, bounds, asg, PPU=8):
    from PIL import Image, ImageDraw
    M = 6
    x0 = bounds['x0'] - M; y0 = bounds['y0'] - M
    W = int((bounds['x1'] - bounds['x0'] + 2*M) * PPU); H = int((bounds['y1'] - bounds['y0'] + 2*M) * PPU)
    im = Image.new('RGB', (W, H), (40, 44, 52)); dr = ImageDraw.Draw(im)
    def P(x, y): return ((x - x0) * PPU, (y - y0) * PPU)
    def rect(cx, cy, w, h, rot, col, outline=None, minw=0.0):
        w = max(w, minw); h = max(h, minw)
        a = math.radians(rot); ca, sa = math.cos(a), math.sin(a)
        pts = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx*w/2, sy*h/2
            pts.append(P(cx + lx*ca - ly*sa, cy + lx*sa + ly*ca))
        dr.polygon(pts, fill=col, outline=outline)
    # chunk frames + floor
    for i, (ax, ay) in enumerate(anchors):
        x_a, y_a = P(ax - CHUNK_W/2, ay - CHUNK_H/2); x_b, y_b = P(ax + CHUNK_W/2, ay + CHUNK_H/2)
        dr.rectangle([x_a, y_a, x_b, y_b], fill=(70, 90, 75), outline=(110, 130, 110))
    for kind in FILL_ORDER:
        for i, (ax, ay) in enumerate(anchors):
            ck = 'MapRandom%d' % asg[i + 1]
            for it in out_chunks[ck]:
                if it['k'] != kind: continue
                mw = 0.5 if kind in ('spawn', 'box') else 0.0
                if kind == 'other' and it['w'] == 0: mw = 0.3
                rect(ax + it['x'], ay + it['y'], it['w'], it['h'], it['rot'], COL[kind], minw=mw)
    for it in static:
        rect(it['x'], it['y'], it['w'], it['h'], it['rot'], (255, 120, 120) if it['k'] == 'wall' else (90, 90, 90), minw=0.4 if it['k'] == 'other' else 0)
    for c in zone['last']:
        px, py = P(c['x'], c['y']); r = c['r'] * PPU
        dr.ellipse([px - r, py - r, px + r, py + r], outline=(80, 200, 255))
    for c in zone['first']:
        px, py = P(c['x'], c['y']); r = c['r'] * PPU
        dr.ellipse([px - r, py - r, px + r, py + r], outline=(255, 255, 0))
    for k, col in (('escape', (0, 255, 0)), ('gate', (255, 0, 255)), ('escapePoint', (0, 255, 255))):
        px, py = P(gate[k]['x'], gate[k]['y']); dr.ellipse([px - 6, py - 6, px + 6, py + 6], outline=col, width=2)
    for i, (ax, ay) in enumerate(anchors):
        px, py = P(ax, ay); dr.text((px - 30, py - CHUNK_H/2 * PPU + 4), 'L%d=MapRandom%d' % (i + 1, asg[i + 1]), fill=(255, 255, 255))
    im.save(OUT_PNG)
    print('wrote', os.path.normpath(OUT_PNG), im.size)


if __name__ == '__main__':
    main()
