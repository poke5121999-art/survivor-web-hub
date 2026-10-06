# -*- coding: utf-8 -*-
"""Minimal Unity YAML loader + transform math (used by build_map.py)."""
import re, io, os, math, yaml
try:
    Loader = yaml.CSafeLoader
except AttributeError:
    Loader = yaml.SafeLoader

HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)', re.M)

def load_docs(path):
    """-> {fileID(int): (classID, dict body)}; body = the single top-level mapping value."""
    txt = io.open(path, encoding='utf-8').read()
    ms = list(HDR.finditer(txt))
    out = {}
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
        body = txt[m.end():end]
        body = body.split('\n', 1)[1] if '\n' in body else ''
        d = yaml.load(body, Loader=Loader)
        if isinstance(d, dict) and len(d) == 1:
            d = list(d.values())[0]
        out[int(m.group(2))] = (int(m.group(1)), d)
    return out

def script_guids(cs_dir):
    m = {}
    for f in os.listdir(cs_dir):
        if f.endswith('.cs.meta'):
            t = io.open(os.path.join(cs_dir, f), encoding='utf-8').read()
            g = re.search(r'guid: ([0-9a-f]{32})', t)
            if g:
                m[g.group(1)] = f[:-8]
    return m

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz)

def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    # v' = q * v * q^-1
    tx = 2*(y*vz - z*vy); ty = 2*(z*vx - x*vz); tz = 2*(x*vy - y*vx)
    return (vx + w*tx + (y*tz - z*ty), vy + w*ty + (z*tx - x*tz), vz + w*tz + (x*ty - y*tx))

def yaw_deg(q):
    """Unity yaw (rotation about +Y, left-handed, clockwise seen from above) of q's local +Z axis."""
    f = qrot(q, (0, 0, 1))
    return math.degrees(math.atan2(f[0], f[2]))

def vec(d, k='x'):
    return (float(d['x']), float(d['y']), float(d['z']))

def quat(d):
    return (float(d['x']), float(d['y']), float(d['z']), float(d['w']))
