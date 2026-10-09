"""Xuất camera mở màn (CameraPathAnimator của bản gốc) vào data/campaths.js.

Dùng: venv/bin/python -I export_campath.py
Prefab scenecamerapath/level_<map>.prefab có 3 CameraPathAnimator (CinematicCountDownConfig.CountDownAnimators),
mỗi cái là đường 2 điểm (tay cầm Bezier = 0 nên là đoạn thẳng) với điểm hướng (quaternion thế giới) và FOV ở hai đầu.
Toạ độ đổi một lần ở đây: (x,y,z) -> (x,y,-z); thay vì quaternion ta xuất hướng nhìn (fwd) và hướng lên (up) đã đổi,
vì camera Unity nhìn +z còn three.js nhìn -z, để bên web không phải đoán trục.
Chỉ 11citynew có đường: 11cityclassic dùng cùng hình học (lệch tối đa 1,3 m so với checkpointconfig).
Phố Tàu và Troy City không có prefab camerapath trong APK (Troypalace là bản đồ khác).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs, UnityPy  # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'campaths.js')
SRC = {'11citynew': ('scenecamerapath/level_11cityclassic.prefab', 'Level_11CityClassic')}


def rot(q, v):
    x, y, z, w = q
    # v' = v + 2w(q×v) + 2 q×(q×v)
    cx = y * v[2] - z * v[1]; cy = z * v[0] - x * v[2]; cz = x * v[1] - y * v[0]
    dx = y * cz - z * cy; dy = z * cx - x * cz; dz = x * cy - y * cx
    return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)]


def conv(v, n=3):
    return [round(v[0], n), round(v[1], n), round(-v[2], n)]


def export(tid, prefab):
    rs = [r for r in zs.find(prefab) if any(c.lower().endswith(prefab) for c in r['cont'])]
    env = UnityPy.load(os.path.join(zs.IFS, rs[0]['f']))
    byid, gos = {}, {}
    for o in env.objects:
        if o.type.name == 'GameObject':
            gos[o.path_id] = o.read().m_Name
        elif o.type.name == 'MonoBehaviour':
            try:
                byid[o.path_id] = (o.read().m_Script.read().m_ClassName, o.read_typetree())
            except Exception:
                pass
    cfg = next(d for k, d in byid.values() if k == 'CinematicCountDownConfig')
    shots = []
    for ref in cfg['CountDownAnimators']:
        a = byid[ref['m_PathID']][1]
        cp = byid[a['_cameraPath']['m_PathID']][1]
        assert cp['_interpolation'] == 4 and len(cp['_points']) == 2
        gid = a['m_GameObject']['m_PathID']
        # Chỉ lấy điểm nằm trong các *List của đúng đường: prefab còn sót điểm hướng/FOV cũ gắn cùng GameObject.
        lst = {k: next(d for kk, d in byid.values() if kk == k + 'List' and d['m_GameObject']['m_PathID'] == gid)['_points'] for k in ('CameraPathOrientation', 'CameraPathFOV', 'CameraPathSpeed')}
        pick = lambda k, pid: [byid[r['m_PathID']][1] for r in lst[k] if byid[r['m_PathID']][1]['point']['m_PathID'] == pid]
        keys = []
        for p in cp['_points']:
            pid = p['m_PathID']
            c = byid[pid][1]
            assert all(abs(c[k][ax]) < 1e-6 for k in ('_forwardControlPoint', '_backwardControlPoint') for ax in 'xyz'), 'tay cầm Bezier khác 0'
            ori, fov = pick('CameraPathOrientation', pid), pick('CameraPathFOV', pid)
            assert len(ori) == 1 and len(fov) == 1, 'điểm hướng/FOV không duy nhất'
            q = [ori[0]['rotation'][ax] for ax in 'xyzw']
            keys.append({'p': conv([c['_position'][ax] for ax in 'xyz']), 'fwd': conv(rot(q, [0, 0, 1])),
                         'up': conv(rot(q, [0, 1, 0])), 'fov': round(fov[0]['FOV'], 2)})
        # Đường 3 có bảng tốc độ giảm dần (12 -> 8 -> 0,1 theo phần trăm): web làm nhẹ bằng ease-out.
        shots.append({'name': gos[gid], 'dur': a['durationTime'], 'ease': 'out' if lst['CameraPathSpeed'] else 'lin', 'keys': keys})
    return shots


def main():
    res = {}
    for tid, (prefab, root) in SRC.items():
        res[tid] = {'src': 'assets/resforassetbundles/scenedynamicloadobj/' + prefab + ' (CameraPathAnimator x3, CinematicCountDownConfig)', 'shots': export(tid, prefab)}
    with open(OUT, 'w') as f:
        f.write('// Camera mở màn của bản gốc, xuất bằng tools/export_campath.py. Mỗi shot: đoạn thẳng 2 khoá (p, fwd, up, fov), dur giây.\n')
        f.write('globalThis.TD = globalThis.TD || {}; TD.CAMPATHS = TD.CAMPATHS || {};\n')
        for tid, d in res.items():
            f.write('TD.CAMPATHS[%s] = %s;\n' % (json.dumps(tid), json.dumps(d, separators=(',', ':'), ensure_ascii=False)))
    print('wrote', OUT, {k: [s['name'] for s in v['shots']] for k, v in res.items()})


main()
