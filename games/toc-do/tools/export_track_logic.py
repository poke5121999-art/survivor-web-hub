"""Xuất logic đường đua (ruy băng, checkpoint, điểm hồi sinh, đường chạy chuẩn) vào data/tracks.js.

Dùng: venv/bin/python -I export_track_logic.py <envName> <id>
  vd: export_track_logic.py e_11citynew 11citynew
Đọc thẳng bundle qua zs: <envName>/model/pick/checkpointconfig và <MapId>_standarddata.asset.
Toạ độ đổi một lần ở đây: (x,y,z) -> (x,y,-z), quaternion (x,y,z,w) -> (-x,-y,z,w).
"""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs, UnityPy  # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'tracks.js')

# Tên hiển thị: tìm trong Localization_VN_Base ("Thành Phố 11"); Troy giữ tên gốc; Phố Tàu là tên chọn.
NAMES = {'11citynew': 'Thành Phố 11', 'troycity': 'Thành Troy', 'chinatown': 'Phố Tàu'}
LINE_STEP = 3.0  # m, giãn đường chạy chuẩn (gốc ~1 m)


def r3(v):
    return round(v, 3)


def P(p):
    return r3(p['x']), r3(p['y']), r3(-p['z'])


def load_mb(query, name):
    rs = zs.find(query)
    if not rs:
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
    sys.exit('asset %s not found in %s' % (name, rs[0]['f']))


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
        pts['cp'].append(p['LocatedCheckPointID'])
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

    # s cho điểm hồi sinh: điểm ruy băng gần nhất cùng CurveID.
    resets = []
    for r in cfg['ResetPointDataList']:
        x, y, z = P(r['Position'])
        q = r['Rotation']
        best, bd = 0, 1e18
        for i in range(len(tps)):
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
        if len(cross) >= 2:
            laps = len(cross) - 1
            laps_src = '%d_StandardData: %d lần qua vạch xuất phát' % (mid, len(cross))
            a, b = cross[0], cross[1]
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
    if laps is None:
        # chọn: không có đường chuẩn → số vòng để 1 trận ≈ 2–3 phút ở ~200 km/h
        laps = max(1, min(3, round(150 * 55 / cfg['MainCurveLength'])))
        laps_src = 'chọn: MainCurveLength %.0f m' % cfg['MainCurveLength']

    return {
        'id': tid, 'name': NAMES.get(tid, tid.capitalize()), 'mapId': mid, 'env': env_name.lower(),
        'laps': laps, 'lapsSrc': laps_src, 'gravity': r3(g), 'length': r3(cfg['MainCurveLength']),
        'art': 'art/tracks/%s/track.glb' % tid,
        'startCp': cfg['RaceStartCheckPointIndex'], 'endCp': cfg['RaceEndCheckPointIndex'],
        'pts': pts, 'cps': cpo, 'resets': resets,
        'start': {'x': sx, 'y': sy, 'z': sz, 'fx': r3(sf['x']), 'fy': r3(sf['y']), 'fz': r3(-sf['z'])},
        'line': line,
    }


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
    print('%s: %d pts, %d cps, %d resets, line %s, laps %d (%s), name %s' % (
        t['id'], len(t['pts']['x']), len(t['cps']), len(t['resets']),
        len(t['line']['x']) if t['line'] else 0, t['laps'], t['lapsSrc'], t['name']))


if __name__ == '__main__':
    main()
