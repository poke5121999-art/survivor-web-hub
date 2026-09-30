# -*- coding: utf-8 -*-
"""Đường cong Transform của AnimationClip -> anims[key].tr (dùng trong build_sk.py).

    tr = {"<đường dẫn nút tính từ GameObject mang Animator>": {p?: [[t, dx, dy]], s?: [[t, sx, sy]], r?: [[t, độ]]}}

- p: độ lệch vị trí so với tư thế nghỉ trong prefab, px (đơn vị × PPU 16), y hướng LÊN như Unity. Đã nhân cỡ
  nghỉ của các nút cha, nên là px trong hệ của nút Animator.
- s: cỡ clip chia cỡ nghỉ (1 = như prefab).
- r: góc quay z so với góc nghỉ, độ, ngược chiều kim đồng hồ như Unity. Tháo vòng: hai khoá liền nhau lệch < 180°.
- Khoá là giá trị tại thời điểm khoá, như uiclip.float_tracks đọc; giữa hai khoá nội suy tuyến tính, sau khoá cuối
  giữ nguyên. Chỉ ghi đường có đổi hoặc khác tư thế nghỉ.

Giải mã đường float dùng lại tools/ui/uiclip.py (float_tracks, node_paths), ở đây chỉ gom theo nút và quy đổi.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from ui import uiclip  # noqa: E402

PPU = 16.0
EPS = {'p': 0.01, 's': 0.001, 'r': 0.05}


class Stats:
    def __init__(self):
        self.clips = 0          # clip đã đọc Transform
        self.with_tr = 0        # clip có ít nhất một đường giữ lại
        self.tracks = 0         # đường Transform (nút × p/s/r) giữ lại
        self.unresolved = {}    # '#crc32' -> số lần gặp (đường Transform không khớp nút nào trong prefab)
        self.pptr_first = 0     # clip có binding PPtr đứng trước binding float (uiclip có thể lệch chỉ số)
        self.variants = 0       # cùng khoá anim (controller/state) mà tr khác (tư thế nghỉ hoặc clip khác) -> '<khoá>@<prefab>'


stats = Stats()
_roots = {}


def _rest(node):
    """Node (có Animator) -> ({crc32: đường dẫn}, {đường dẫn: tư thế nghỉ})."""
    k = (node.cab, node.go.path_id)
    if k in _roots:
        return _roots[k]
    rest = {}

    def rec(nd, path, anc):
        t = nd.t or {}
        p = t.get('m_LocalPosition', {'x': 0.0, 'y': 0.0})
        s = t.get('m_LocalScale', {'x': 1.0, 'y': 1.0})
        q = t.get('m_LocalRotation', {'z': 0.0, 'w': 1.0})
        rest[path] = {'p': (p['x'], p['y']), 's': (s['x'], s['y']),
                      'r': math.degrees(2 * math.atan2(q['z'], q['w'])), 'anc': anc}
        for ch in nd.children():
            rec(ch, (path + '/' if path else '') + ch.name, (anc[0] * s['x'], anc[1] * s['y']))

    rec(node, '', (1.0, 1.0))
    _roots[k] = (uiclip.node_paths(node), rest)
    return _roots[k]


def _at(keys, t):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v1 if t1 <= t0 else v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return keys[-1][1]


def _times(*tracks):
    return sorted({k[0] for tr in tracks if tr for k in tr})


def _squeeze(rows):
    """Bỏ khoá giữa trùng cả hai bên (nội suy tuyến tính không đổi); mọi khoá bằng nhau thì còn một."""
    out = []
    for i, r in enumerate(rows):
        if 0 < i < len(rows) - 1 and r[1:] == rows[i - 1][1:] == rows[i + 1][1:]:
            continue
        out.append(r)
    if all(r[1:] == out[0][1:] for r in out):
        out = out[:1]
    return out


def _unwrap(vals):
    out = []
    for v in vals:
        v = (v + 180.0) % 360.0 - 180.0
        if out:
            while v - out[-1] > 180.0:
                v -= 360.0
            while v - out[-1] < -180.0:
                v += 360.0
        out.append(v)
    return out


def clip_tr(rip, cab, clip_obj, root):
    """-> (tr hoặc None, độ dài clip giây). root: skrip.Node mang Animator chơi clip này."""
    paths, rest = _rest(root)
    tree = rip.tree(cab, clip_obj)
    binds = tree['m_ClipBindingConstant']['genericBindings']
    seen_pptr = False
    for b in binds:
        if b['isPPtrCurve']:
            seen_pptr = True
        elif seen_pptr:
            stats.pptr_first += 1
            break
    stats.clips += 1
    ft = uiclip.float_tracks(rip, cab, clip_obj, paths)
    by = {}
    for t in ft['tracks']:
        if t['type'] != 4:
            continue
        if t['path'].startswith('#'):
            stats.unresolved[t['path']] = stats.unresolved.get(t['path'], 0) + 1
            continue
        by.setdefault(t['path'], {})[t['prop']] = t['keys']
    tr = {}
    for path in sorted(by):
        pr, r0 = by[path], rest.get(path)
        if r0 is None:
            continue
        node = {}
        px, py = pr.get('m_LocalPosition.x'), pr.get('m_LocalPosition.y')
        if px or py:
            rows = []
            for t in _times(px, py):
                x = _at(px, t) if px else r0['p'][0]
                y = _at(py, t) if py else r0['p'][1]
                rows.append([round(t, 4), round((x - r0['p'][0]) * r0['anc'][0] * PPU, 2) + 0.0,
                             round((y - r0['p'][1]) * r0['anc'][1] * PPU, 2) + 0.0])
            if any(abs(v) >= EPS['p'] for r in rows for v in r[1:]):
                node['p'] = _squeeze(rows)
        sx, sy = pr.get('m_LocalScale.x'), pr.get('m_LocalScale.y')
        if sx or sy:
            rows = []
            for t in _times(sx, sy):
                vx = _at(sx, t) if sx else r0['s'][0]
                vy = _at(sy, t) if sy else r0['s'][1]
                rows.append([round(t, 4), round(vx / r0['s'][0] if r0['s'][0] else vx, 3) + 0.0,
                             round(vy / r0['s'][1] if r0['s'][1] else vy, 3) + 0.0])
            if any(abs(v - 1) >= EPS['s'] for r in rows for v in r[1:]):
                node['s'] = _squeeze(rows)
        qz, qw = pr.get('m_LocalRotation.z'), pr.get('m_LocalRotation.w')
        ez = pr.get('m_LocalEulerAngles.z')
        if qz or qw or ez:
            ts = _times(qz, qw) if (qz or qw) else _times(ez)
            if qz or qw:
                deg = [math.degrees(2 * math.atan2(_at(qz, t) if qz else 0.0, _at(qw, t) if qw else 1.0)) for t in ts]
            else:
                deg = [_at(ez, t) for t in ts]
            deg = _unwrap([d - r0['r'] for d in deg])
            rows = [[round(t, 4), round(d, 2) + 0.0] for t, d in zip(ts, deg)]
            if any(abs(r[1]) >= EPS['r'] for r in rows):
                node['r'] = _squeeze(rows)
        if node:
            tr[path] = node
            stats.tracks += len(node)
    if tr:
        stats.with_tr += 1
    return (tr or None), ft['len']
