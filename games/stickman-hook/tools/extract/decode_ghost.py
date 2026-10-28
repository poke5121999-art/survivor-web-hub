"""Decode GhostToolPro PlayerRecord blobs (Tournament ghosts) from dump/text/<n>_<pid>.txt.
Record = str typeName, int nTracks, then per track: str trackName, int 0, str guid, int 1, str material,
int nFrames, nFrames x frame. Frame = f32 t, u8 active, 3xf32 pos, 3xf32 scale, 3xf32 euler, u8, u8, str sprite.
Strings are .NET BinaryWriter (7-bit length prefix).
usage: decode_ghost.py <out.json> [--frames N] [--only <file.txt>]"""
import sys, json, glob, base64, struct, os

def rstr(b, i):
    n = 0; sh = 0
    while True:
        c = b[i]; i += 1; n |= (c & 0x7F) << sh; sh += 7
        if c < 0x80: break
    return b[i:i + n].decode('utf-8'), i + n

def decode(b):
    i = 0; h = {'tracks': []}
    h['type'], i = rstr(b, i)
    nt, = struct.unpack_from('<i', b, i); i += 4
    tracks = []
    for _ in range(nt):
        th = {}
        th['name'], i = rstr(b, i)
        th['b'], = struct.unpack_from('<i', b, i); i += 4
        th['guid'], i = rstr(b, i)
        th['c'], = struct.unpack_from('<i', b, i); i += 4
        th['material'], i = rstr(b, i)
        n, = struct.unpack_from('<i', b, i); i += 4
        fr = []
        for _ in range(n):
            t, = struct.unpack_from('<f', b, i); act = b[i + 4]
            vals = struct.unpack_from('<9f', b, i + 5)
            spr, j = rstr(b, i + 43)
            fr.append([round(t, 4), act, *[round(v, 4) for v in vals], b[i + 41], b[i + 42], spr]); i = j
        th['nFrames'] = n
        th['sprites'] = sorted({f[13].rstrip('0123456789') for f in fr})
        h['tracks'].append(th); tracks.append(fr)
    h['bytesLeft'] = len(b) - i
    return h, tracks

out = {'frame_layout': ['t', 'active', 'px', 'py', 'pz', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz', 'flag1', 'flag2', 'sprite'], 'files': {}}
keep = int(sys.argv[sys.argv.index('--frames') + 1]) if '--frames' in sys.argv else 0
only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
for fn in sorted(glob.glob(r'D:/stickman-hook-ref/dump/text/*_*.txt')):
    base = os.path.basename(fn)
    if not base.split('_')[0].isdigit() or (only and base != only): continue
    recs = json.load(open(fn))[0]
    fo = {}
    for name, b64 in recs.items():
        h, tracks = decode(base64.b64decode(b64)); fr = tracks[0]
        vis = [f for f in fr if f[2] > -900]
        fo[name] = {'header': h, 'tEnd': fr[-1][0] if fr else None,
                    'x': [min(f[2] for f in vis), max(f[2] for f in vis)] if vis else None,
                    'y': [min(f[3] for f in vis), max(f[3] for f in vis)] if vis else None}
        if keep: fo[name]['frames'] = [t[:keep] for t in tracks]
        if keep: break
    out['files'][base] = fo
json.dump(out, open(sys.argv[1], 'w'), separators=(',', ':'))
f0 = next(iter(out['files'].values())); r0 = next(iter(f0.values()))
print(sum(len(v) for v in out['files'].values()), 'records'); print(json.dumps({k: v for k, v in r0.items() if k != 'frames'})[:1200])
errs = [(f, n, r['header']['bytesLeft']) for f, v in out['files'].items() for n, r in v.items() if r['header']['bytesLeft']]
print('records with leftover bytes', len(errs), errs[:3])
