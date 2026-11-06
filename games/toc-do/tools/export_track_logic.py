"""Xuất logic đường đua (ruy băng, checkpoint, điểm hồi sinh, đường chạy chuẩn) vào data/tracks.js.

Dùng: venv/bin/python -I export_track_logic.py <envName> <id>
  vd: export_track_logic.py e_11citynew 11citynew
Đọc thẳng bundle qua zs: <envName>/model/pick/checkpointconfig và <MapId>_standarddata.asset.
Toạ độ đổi một lần ở đây: (x,y,z) -> (x,y,-z), quaternion (x,y,z,w) -> (-x,-y,z,w).
Đường A→B (RaceStartCheckPointIndex ≠ RaceEndCheckPointIndex: Tứ Xuyên, Reno, Polaris, Hoàng Hà...): ghi loop: false,
laps 1, end (vạch đích), length = quãng xuất phát → đích; ruy băng nối thêm đoạn sau vạch xuất phát và đường thoát sau đích.
"""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs, UnityPy  # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'tracks.js')

# Tên hiển thị: tìm trong Localization_VN_Base ("Thành Phố 11"); Troy giữ tên gốc; Phố Tàu là tên chọn.
# Các tên sau Phố Tàu: Localization_VN_Base không có tên đường (đã tìm theo chữ Hán) → chọn, dịch nghĩa tên thư mục map.
NAMES = {'11citynew': 'Thành Phố 11', 'troycity': 'Thành Troy', 'chinatown': 'Phố Tàu',
         'winterolympic01': 'Thế Vận Hội Mùa Đông', 'xintianebao': 'Lâu Đài Thiên Nga Mới',
         'troypalace': 'Cung Điện Troy',
         # Đường A→B: Localization_VN_Base chỉ có "Reno" (9d2fd4f3) và "Polaris" (7dc914b5); phần còn lại chọn theo tên thư mục.
         'sichuan02': 'Tứ Xuyên', 'renocity': 'Thành Phố Reno', 'polariswonderland': 'Xứ Sở Polaris',
         'huanghe02': 'Hoàng Hà'}
LINE_STEP = 3.0  # m, giãn đường chạy chuẩn (gốc ~1 m)
GRID_BACK = 45.0  # chọn: m ruy băng cần có sau vạch xuất phát (ô xếp xe xa nhất 22,5 m trong race.js gridSlot, chừa chỗ lùi)
RUNOFF = 150.0    # chọn: m đường thoát sau vạch đích để xe phanh dừng (trần ~60 m/s, phanh 0,6)
PT_STEP = 10.0    # m, như TrackPointDataList gốc


def r3(v):
    return round(v, 3)


def P(p):
    return r3(p['x']), r3(p['y']), r3(-p['z'])


def load_mb(query, name, optional=False):
    rs = zs.find(query)
    if not rs:
        if optional:
            return None
        sys.exit('bundle not found: ' + query)
    env = UnityPy.load(os.path.join(zs.IFS, rs[0]['f']))
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            n = o.peek_name()
        except Exception:
            n = None
        if n == name:
            return o.read_typetree()
    if optional:
        return None
    sys.exit('asset %s not found in %s' % (name, rs[0]['f']))


def open_ends(pts, cpo, S, E, parent):
    """Đường A→B: ruy băng gốc bắt đầu sát vạch xuất phát (Polaris, Hàng Thiên) và dừng ngay vạch đích (Reno).
    Nối thêm đoạn thẳng phía sau vạch xuất phát (tới checkpoint cha) và đường thoát sau vạch đích (theo các checkpoint sau
    đích, chỗ hết thì đi thẳng). Điểm thêm nằm cuối mảng: chỉ số điểm gốc giữ nguyên. Trả về (số điểm trước, số điểm sau)."""
    n = len(pts['x'])
    head = next(i for i in range(n) if not pts['prev'][i])
    tail = next(i for i in range(n) if not pts['next'][i])

    def unit(i):
        h = math.hypot(pts['dx'][i], pts['dz'][i]) or 1.0
        return pts['dx'][i] / h, pts['dz'][i] / h

    def chain(i, key, k):
        out = [i]
        for _ in range(k):
            if not pts[key][out[-1]]:
                break
            out.append(pts[key][out[-1]][0])
        return out

    # Đầu ruy băng gốc thu hẹp dần như vệt vẽ (Reno lw 0 → 7 → 10,5 → 12,8): mở cả đoạn đầu ra bề rộng đầy đủ
    ids = chain(head, 'next', 7)
    flw, frw = max(pts['lw'][q] for q in ids), max(pts['rw'][q] for q in ids)
    for q in ids[:6]:
        pts['lw'][q] = max(pts['lw'][q], flw); pts['rw'][q] = max(pts['rw'][q], frw)

    def add(x, y, z, ux, uz, slope, s, cp, lw, rw, prev):
        h = math.sqrt(1 + slope * slope)
        i = len(pts['x'])
        for k, v in (('x', r3(x)), ('y', r3(y)), ('z', r3(z)), ('dx', round(ux / h, 5)), ('dy', round(slope / h, 5)),
                     ('dz', round(uz / h, 5)), ('lw', lw), ('rw', rw), ('s', r3(s)), ('curve', 0), ('cp', cp)):
            pts[k].append(v)
        pts['next'].append([]); pts['prev'].append([] if prev is None else [prev])
        if prev is not None:
            pts['next'][prev].append(i)
        return i

    # phía sau vạch xuất phát
    ux, uz = unit(head)
    cs, cpar = cpo[S], cpo[parent]
    have = (cs['x'] - pts['x'][head]) * ux + (cs['z'] - pts['z'][head]) * uz
    dpar = (cs['x'] - cpar['x']) * ux + (cs['z'] - cpar['z']) * uz
    cpar['s'] = r3(cs['s'] - dpar)   # TrackDistance gốc của checkpoint cha sai (Polaris 135 m cho điểm sau vạch 135 m)
    need = min(150.0, max(GRID_BACK, dpar + PT_STEP))
    k_pre = max(0, int(math.ceil((need - have) / PT_STEP)))
    prev = None
    for k in range(k_pre, 0, -1):
        d = k * PT_STEP
        prev = add(pts['x'][head] - ux * d, pts['y'][head], pts['z'][head] - uz * d, ux, uz, 0.0,
                   pts['s'][head] - d, parent, flw, frw, prev)
    if prev is not None:
        pts['next'][prev] = [head]; pts['prev'][head] = [prev]

    # sau vạch đích: đi qua các checkpoint sau đích rồi thẳng tiếp
    ce = cpo[E]
    ux, uz = unit(tail)
    past = (pts['x'][tail] - ce['x']) * ux + (pts['z'][tail] - ce['z']) * uz
    way, c = [], ce
    while c['next']:
        c = cpo[c['next'][0]]
        way.append((c['x'], c['y'], c['z']))
    x, y, z, s, prev, k_post = pts['x'][tail], pts['y'][tail], pts['z'][tail], pts['s'][tail], tail, 0
    lw, rw = pts['lw'][tail], pts['rw'][tail]
    while past < RUNOFF:
        while way and math.hypot(way[0][0] - x, way[0][2] - z) < PT_STEP:
            way.pop(0)
        if way:
            wx, wy, wz = way[0]
            h = math.hypot(wx - x, wz - z)
            ux, uz, slope = (wx - x) / h, (wz - z) / h, (wy - y) / h
        else:
            slope = 0.0
        x, y, z, s, past = x + ux * PT_STEP, y + slope * PT_STEP, z + uz * PT_STEP, s + PT_STEP, past + PT_STEP
        prev = add(x, y, z, ux, uz, slope, s, E, lw, rw, prev)
        k_post += 1
    return k_pre, k_post


def despike(pts):
    """Bề rộng gốc ở điểm nhập nhánh có khi vọt lên hàng trăm mét (Tứ Xuyên điểm 721: trái 584 m giữa 17 m và 49 m;
    điểm 316–317: phải 316 m hai điểm liền); để nguyên thì xe chạy vào khoảng không mà vẫn được coi là trên đường.
    So với trung vị hai điểm mỗi phía: vượt 1,5 lần + 10 m thì kẹp về láng giềng lớn nhất không vọt. Trả về số lần kẹp."""
    fixed = 0
    for key in ('lw', 'rw'):
        w = list(pts[key])
        for q in range(len(w)):
            nb, a, b = [], q, q
            for _ in range(2):
                a = pts['prev'][a][0] if a is not None and pts['prev'][a] else None
                b = pts['next'][b][0] if b is not None and pts['next'][b] else None
                nb += [w[j] for j in (a, b) if j is not None]
            if not nb:
                continue
            nb.sort()
            med = (nb[(len(nb) - 1) // 2] + nb[len(nb) // 2]) / 2
            lim = 1.5 * med + 10
            if w[q] > lim:
                pts[key][q] = max(v for v in nb if v <= lim)
                fixed += 1
    return fixed


def widen_to_line(pts, sd):
    """Đường A→B: có chỗ ruy băng gốc chỉ là làn hẹp uốn lượn giữa quảng trường rộng (Reno s≈4140: 40 m → 5,8 m) mà
    đường chạy chuẩn (bản ghi người chạy thật) đi thẳng qua. Nới bề rộng điểm ruy băng gần nhất để chứa đường chuẩn
    + 2,5 m (nửa bề ngang xe + 1,5 m). Trả về số điểm đã nới."""
    n, grid, CELL = len(pts['x']), {}, 20.0
    for i in range(n):
        grid.setdefault((int(pts['x'][i] // CELL), int(pts['z'][i] // CELL)), []).append(i)
    hit = set()
    for d in sd:
        x, y, z = P(d['Pos'])
        cx, cz = int(x // CELL), int(z // CELL)
        best, bd = None, 1e18
        for gx in (cx - 1, cx, cx + 1):
            for gz in (cz - 1, cz, cz + 1):
                for i in grid.get((gx, gz), ()):
                    if abs(pts['y'][i] - y) > 4:
                        continue
                    dd = (pts['x'][i] - x) ** 2 + (pts['z'][i] - z) ** 2
                    if dd < bd:
                        best, bd = i, dd
        if best is None:
            continue
        h = math.hypot(pts['dx'][best], pts['dz'][best]) or 1.0
        fx, fz = pts['dx'][best] / h, pts['dz'][best] / h
        ox, oz = x - pts['x'][best], z - pts['z'][best]
        if abs(ox * fx + oz * fz) > 6:
            continue
        lat = ox * fz - oz * fx   # + là bên trái, như track.js
        key = 'lw' if lat > 0 else 'rw'
        need = r3(min(60.0, abs(lat) + 2.5))
        if pts[key][best] < need:
            pts[key][best] = need
            hit.add(best)
    return len(hit)


def export(env_name, tid):
    cfg = load_mb(env_name.lower() + '/model/pick/checkpointconfig', 'CheckPointConfig')
    tps = cfg['TrackPointDataList']
    cps = cfg['CheckPointDataList']
    pts = {k: [] for k in ('x', 'y', 'z', 'dx', 'dy', 'dz', 'lw', 'rw', 's', 'curve', 'cp', 'next', 'prev')}
    for i, p in enumerate(tps):
        assert p['PointID'] == i, 'TrackPoint ids not dense'
        x, y, z = P(p['Position'])
        d = p['Direction']
        pts['x'].append(x); pts['y'].append(y); pts['z'].append(z)
        pts['dx'].append(round(d['x'], 5)); pts['dy'].append(round(d['y'], 5)); pts['dz'].append(round(-d['z'], 5))
        pts['lw'].append(r3(abs(p['LeftWidth']))); pts['rw'].append(r3(abs(p['RightWidth'])))
        pts['s'].append(r3(p['TrackDistance']))
        pts['curve'].append(p['CurveID'])
        # LocatedCheckPointID -1 (Polaris điểm 757): lấy vùng của điểm trước
        pts['cp'].append(p['LocatedCheckPointID'] if p['LocatedCheckPointID'] >= 0 else pts['cp'][-1])
        pts['next'].append(list(p['Children'])); pts['prev'].append(list(p['Parents']))

    cpo = []
    for c in cps:
        x, y, z = P(c['Position'])
        lx, _, lz = P(c['LeftPoint'])
        rx, _, rz = P(c['RightPoint'])
        f = c['Forward']
        cpo.append({'id': c['PointID'], 's': r3(c['TrackDistance']), 'x': x, 'y': y, 'z': z,
                    'lx': lx, 'lz': lz, 'rx': rx, 'rz': rz, 'fx': r3(f['x']), 'fz': r3(-f['z']),
                    'curve': c['CurveID'], 'next': list(c['Children']), 'prev': list(c['Parants']),
                    'alt': list(c['ExtraConnection'])})

    S, E = cfg['RaceStartCheckPointIndex'], cfg['RaceEndCheckPointIndex']
    loop = S == E
    if not loop:
        n_tp = len(pts['x'])
        print('  kẹp bề rộng vọt: %d' % despike(pts))
        k_pre, k_post = open_ends(pts, cpo, S, E, cfg['RaceStartParentCheckPointIndex'])

    # s cho điểm hồi sinh: điểm ruy băng gần nhất cùng CurveID.
    resets = []
    for r in cfg['ResetPointDataList']:
        x, y, z = P(r['Position'])
        q = r['Rotation']
        best, bd = 0, 1e18
        for i in range(len(pts['x'])):
            if pts['curve'][i] != r['CurveID']:
                continue
            dd = (pts['x'][i] - x) ** 2 + (pts['z'][i] - z) ** 2 + (pts['y'][i] - y) ** 2
            if dd < bd:
                best, bd = i, dd
        f = r['Forward']
        resets.append({'x': x, 'y': y, 'z': z, 'qx': r3(-q['x']), 'qy': r3(-q['y']), 'qz': r3(q['z']), 'qw': r3(q['w']),
                       'fx': r3(f['x']), 'fz': r3(-f['z']), 'cp': r['CheckPointID'], 'tp': best, 's': pts['s'][best]})

    sc = cps[cfg['RaceStartCheckPointIndex']]
    sx, sy, sz = P(sc['Position'])
    sf = sc['Forward']
    g = -cps[0]['Gravity']['y']

    # Đường chạy chuẩn: số lần qua vạch (CP 68->0) - 1 = số vòng gốc.
    line, laps, laps_src = None, None, None
    mid = cfg['MapId']
    try:
        sd = load_mb('/%d_standarddata.asset' % mid, '%d_StandardData' % mid)['Datas']
    except SystemExit:
        sd = None
    if sd:
        last = cfg['RaceStartParentCheckPointIndex']
        start = cfg['RaceStartCheckPointIndex']
        cross = [i for i in range(1, len(sd)) if sd[i]['CP'] == start and sd[i - 1]['CP'] != start
                 and sd[i - 1]['CP'] in (last,) + tuple(cps[start]['Parants'])]
        a = b = None
        if not loop:
            # A→B: cả đường chuẩn từ ô xuất phát tới vạch đích (CP cuối của bản ghi là RaceEndCheckPointIndex)
            a, b = 0, len(sd)
        elif len(cross) >= 2:
            laps = len(cross) - 1
            laps_src = '%d_StandardData: %d lần qua vạch xuất phát' % (mid, len(cross))
            a, b = cross[0], cross[1]
        if a is not None:
            line = {'x': [], 'y': [], 'z': [], 'drift': []}
            acc = LINE_STEP
            for i in range(a, b):
                if i > a:
                    p0, p1 = sd[i - 1]['Pos'], sd[i]['Pos']
                    acc += math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z'])
                if acc < LINE_STEP:
                    continue
                acc = 0.0
                x, y, z = P(sd[i]['Pos'])
                line['x'].append(x); line['y'].append(y); line['z'].append(z)
                # drift=1 nếu bất kỳ điểm gốc nào trong khoảng giãn đang drift
                line['drift'].append(max(sd[j]['Drift'] for j in range(max(a, i - 2), i + 1)))
            if not loop:
                # nối đường thoát sau vạch đích để bot đã về đích còn bám đường khi phanh
                for q in range(n_tp + k_pre, n_tp + k_pre + k_post):
                    line['x'].append(pts['x'][q]); line['y'].append(pts['y'][q]); line['z'].append(pts['z'][q])
                    line['drift'].append(0)
    if not loop:
        laps = 1
        if sd:
            print('  nới ruy băng theo đường chuẩn: %d điểm' % widen_to_line(pts, sd))
        laps_src = 'A→B: RaceStartCheckPointIndex %d ≠ RaceEndCheckPointIndex %d' % (S, E)
    if laps is None:
        # chọn: không có đường chuẩn → số vòng để 1 trận ≈ 2–3 phút ở ~200 km/h
        laps = max(1, min(3, round(150 * 55 / cfg['MainCurveLength'])))
        laps_src = 'chọn: MainCurveLength %.0f m' % cfg['MainCurveLength']

    # Hàng hộp đạo cụ: propspointconfig chỉ có ở một số map (59/165); không có thì nhánh đạo cụ tự rải.
    boxes = None
    pp = load_mb('/' + env_name.lower() + '/model/pick/propspointconfig', 'PropsPointConfig', optional=True)
    if pp and pp['Rows']:
        boxes = [{'s': r3(r['TrackDistance']), 'pts': [list(P(q['Position'])) for q in r['Points']]}
                 for r in sorted(pp['Rows'], key=lambda r: r['TrackDistance'])]

    # length: vòng = MainCurveLength; A→B = quãng giữa vạch xuất phát và vạch đích (MainCurveLength gồm cả đường thoát)
    out = {
        'id': tid, 'name': NAMES.get(tid, tid.capitalize()), 'mapId': mid, 'env': env_name.lower(),
        'laps': laps, 'lapsSrc': laps_src, 'gravity': r3(g),
        'length': r3(cfg['MainCurveLength'] if loop else cpo[E]['s'] - cpo[S]['s']),
        'art': 'art/tracks/%s/track.glb' % tid,
        'startCp': S, 'endCp': E,
        'pts': pts, 'cps': cpo, 'resets': resets,
        'start': {'x': sx, 'y': sy, 'z': sz, 'fx': r3(sf['x']), 'fy': r3(sf['y']), 'fz': r3(-sf['z'])},
        'line': line,
    }
    if not loop:
        ec = cps[E]
        ex, ey, ez = P(ec['Position'])
        out['loop'] = False
        out['end'] = {'x': ex, 'y': ey, 'z': ez, 'fx': r3(ec['Forward']['x']), 'fy': r3(ec['Forward']['y']), 'fz': r3(-ec['Forward']['z'])}
    if boxes:
        out['boxes'] = boxes
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit('usage: export_track_logic.py <envName> <id>')
    t = export(sys.argv[1], sys.argv[2])
    tracks = {}
    if os.path.exists(OUT):
        for m in re.finditer(r'^TD\.TRACKS\[(".*?")\] = (.*);$', open(OUT, encoding='utf-8').read(), re.M):
            tracks[json.loads(m.group(1))] = m.group(2)
    tracks[t['id']] = json.dumps(t, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// Sinh bởi tools/export_track_logic.py — không sửa tay.\n')
        f.write("(function (G) { G.TD = G.TD || {}; G.TD.TRACKS = G.TD.TRACKS || {}; })(typeof window !== 'undefined' ? window : globalThis);\n")
        for k in sorted(tracks):
            f.write('TD.TRACKS[%s] = %s;\n' % (json.dumps(k), tracks[k]))
    print('%s: %s, %d pts, %d cps, %d resets, line %s, laps %d (%s), name %s' % (
        t['id'], 'A→B %.0f m' % t['length'] if t.get('loop') is False else 'vòng', len(t['pts']['x']), len(t['cps']), len(t['resets']),
        len(t['line']['x']) if t['line'] else 0, t['laps'], t['lapsSrc'], t['name']))
    print('  boxes: %s' % ('%d hàng' % len(t['boxes']) if 'boxes' in t else 'không có propspointconfig'))


if __name__ == '__main__':
    main()
