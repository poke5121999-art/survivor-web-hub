"""Tournament ("Race") ghosts and art for the web game.

    py -3 -I build_race.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/text/<level>_<pathId>.txt   the 21 TextAssets "Ghosts/<level>.json": [{"PlayerReplaySave<id>": base64}]
       REF/dump/full/tournament_raw.json    TournamentGamePlaySettings._saves (name, level, difficulty, spawnPoint, skinId,
                                            duration)
       REF/sprites_race/                    SpawnPointGhost, SpawnPointPlayer (tournament bundle), Trophies (currency)
       ../data/mode-race.json, ../data/levels.json   to place each level's targets (rope ends snap to them)
Writes ../data/race/<level>.json   {v, hz, ghosts: [...]} one file per map, loaded when a race on that map starts
       ../art/race.webp + the rects in ../data/race/art.json

A record (GhostToolPro PlayerRecord, decoder in REF/tools/decode_ghost.py) has two tracks sampled about every 0.02 s:
track 0 = body (position, euler z, flipX, sprite frame name), track 1 = rope (AAL_square_mini stretched between hand and
target: position = midpoint, scale y = length / 0.345, so target = 2 * midpoint - body). Frames before the spawn and
between a death and the respawn sit at x - 1000 (PlayerController.ResetPlayer); those samples are listed in `hid`. Each ghost is resampled at HZ on the record clock (t = 0 at the player's spawn) into
  x, y   centimetres, delta coded (first value absolute)
  r      euler z in whole degrees, delta coded and wrapped to -180..179
  f      frame index * 2 + flipX, into `fr` (the record's sprite names)
  h      rope intervals [firstSample, lastSample, targetIndex] (target = nearest level target to the rope end), or
         [firstSample, lastSample, -1, x, y] (cm) when no target is within 0.6 of the recorded end (5 ropes)
plus t0 (first visible time), ms (duration in ms, Task.Delay((int)Math.Round(duration * 1000)) [asm 0x1221438]).
"""
import sys, os, json, glob, base64, struct, math
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
HZ = 10
ROPE_UNIT = 0.345  # world length of AAL_square_mini at scale y 1, measured from the records (|target - body| / sy)


def rstr(b, i):
    n = sh = 0
    while True:
        c = b[i]; i += 1; n |= (c & 0x7F) << sh; sh += 7
        if c < 0x80: break
    return b[i:i + n].decode('utf-8'), i + n


def decode(b):
    i = 0
    _, i = rstr(b, i)
    nt, = struct.unpack_from('<i', b, i); i += 4
    tracks = []
    for _ in range(nt):
        _, i = rstr(b, i); i += 4
        _, i = rstr(b, i); i += 4
        _, i = rstr(b, i)
        n, = struct.unpack_from('<i', b, i); i += 4
        fr = []
        for _ in range(n):
            t, = struct.unpack_from('<f', b, i)
            v = struct.unpack_from('<9f', b, i + 5)
            spr, j = rstr(b, i + 43)
            # t, x, y, scaleY, eulerZ, flipX, sprite
            fr.append((t, v[0], v[1], v[4], v[8], b[i + 41], spr)); i = j
        tracks.append(fr)
    assert i == len(b), 'bytes left'
    return tracks


def lerp_at(fr, t, k):
    """Linear interpolation of field k of frames `fr` (sorted by t) at time t; returns (value, index of frame <= t)."""
    lo, hi = 0, len(fr) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if fr[mid][0] <= t: lo = mid
        else: hi = mid - 1
    a = fr[lo]
    if lo + 1 >= len(fr) or fr[lo + 1][0] <= a[0]:
        return a[k], lo
    b = fr[lo + 1]
    u = (t - a[0]) / (b[0] - a[0])
    return a[k] + (b[k] - a[k]) * u, lo


def wrap(d):
    return (d + 180) % 360 - 180


def level_targets(levels, mode, index):
    """World positions of the targets of race map `index` (level.js buildLevel: patterns chained at their end points)."""
    pats = {**levels['patterns'], **mode['patterns']}
    ox = oy = 0.0
    out = []
    for name in mode['sets']['mode.tournament']['levels'][index]:
        p = pats[name]
        out += [(x + ox, y + oy) for x, y in p['targets']]
        ox += p['end'][0]; oy += p['end'][1]
    return out


def finish_x(levels, mode, index):
    pats = {**levels['patterns'], **mode['patterns']}
    ox = 0.0
    fx = math.inf
    for name in mode['sets']['mode.tournament']['levels'][index]:
        p = pats[name]
        for f in p.get('finish', []): fx = min(fx, f + ox)
        ox += p['end'][0]
    return fx


def build():
    saves = json.load(open(os.path.join(REF, 'dump/full/tournament_raw.json'), encoding='utf-8'))['config']['_saves']
    by_name = {s['name']: s for s in saves}
    levels = json.load(open(os.path.join(GAME, 'data/levels.json')))
    mode = json.load(open(os.path.join(GAME, 'data/mode-race.json')))
    os.makedirs(os.path.join(GAME, 'data/race'), exist_ok=True)
    total = 0
    report = []
    for fn in sorted(glob.glob(os.path.join(REF, 'dump/text/*_*.txt'))):
        base = os.path.basename(fn)
        if not base.split('_')[0].isdigit():
            continue
        level = int(base.split('_')[0])
        targets = level_targets(levels, mode, level)
        fx = finish_x(levels, mode, level)
        recs = json.load(open(fn))[0]
        ghosts = []
        for name, b64 in recs.items():
            sv = by_name[name]
            assert sv['level'] == level, (name, level)
            body, rope = decode(base64.b64decode(b64))
            # frames parked at x - 1000 (before the spawn, and between a death and the respawn) are hidden
            t0 = next(f[0] for f in body if f[1] > -900)
            t_end = body[-1][0]
            n = int(math.floor((t_end - t0) * HZ)) + 1
            names = []
            xs, ys, rs, fs, hid = [], [], [], [], []
            hooked = []
            for k in range(n):
                t = t0 + k / HZ
                _, j = lerp_at(body, t, 1)
                a = body[j]
                if a[1] <= -900:
                    # hidden: repeat the previous pose
                    hid.append(k)
                    xs.append(xs[-1]); ys.append(ys[-1]); rs.append(rs[-1]); fs.append(fs[-1]); hooked.append(None)
                    continue
                b = body[j + 1] if j + 1 < len(body) and body[j + 1][0] > a[0] and body[j + 1][1] > -900 else None
                u = (t - a[0]) / (b[0] - a[0]) if b else 0
                x = a[1] + ((b[1] - a[1]) * u if b else 0)
                y = a[2] + ((b[2] - a[2]) * u if b else 0)
                rz = a[4] + (wrap(b[4] - a[4]) * u if b else 0)  # euler z along the short arc
                spr = a[6]
                if spr not in names: names.append(spr)
                xs.append(round(x * 100)); ys.append(round(y * 100)); rs.append(round(rz) % 360)
                fs.append(names.index(spr) * 2 + (1 if a[5] else 0))
                _, i = lerp_at(rope, t, 3)
                r = rope[i]
                hooked.append((k, 2 * r[1] - a[1], 2 * r[2] - a[2]) if r[3] * ROPE_UNIT > 0.2 else None)
            vis = [f for f in body if f[1] > -900]
            # rope intervals -> nearest target to the median rope end
            h = []
            k = 0
            while k < n:
                if hooked[k] is None: k += 1; continue
                # one interval per target: a release and a new grab within one sample shows as a jump of the rope end
                k1 = k
                while (k1 + 1 < n and hooked[k1 + 1] is not None
                       and math.hypot(hooked[k1 + 1][1] - hooked[k1][1], hooked[k1 + 1][2] - hooked[k1][2]) < 1):
                    k1 += 1
                pts = [hooked[q] for q in range(k, k1 + 1)]
                mx = sorted(p[1] for p in pts)[len(pts) // 2]; my = sorted(p[2] for p in pts)[len(pts) // 2]
                ti = min(range(len(targets)), key=lambda q: (targets[q][0] - mx) ** 2 + (targets[q][1] - my) ** 2)
                d = math.hypot(targets[ti][0] - mx, targets[ti][1] - my)
                if d > 0.6:
                    # no target there (a few records): keep the recorded rope end
                    report.append('%s level %d: rope end (%.2f, %.2f) is %.2f from target %d' % (name, level, mx, my, d, ti))
                    h.append([k, k1, -1, round(mx * 100), round(my * 100)])
                else:
                    h.append([k, k1, ti])
                k = k1 + 1
            # crossing time of the finish line vs the recorded duration
            cross = next((f[0] for f in vis if f[1] >= fx), None)
            ms = int(round(sv['duration'] * 1000))  # Python round() is half-to-even like .NET Math.Round
            report.append('CROSS %s level %d diff %d: crosses %.3f, duration %.3f, t0 %.3f' % (
                name, level, sv['difficulty'], cross if cross is not None else -1, sv['duration'], t0))

            def delta(v):
                return [v[0]] + [v[q] - v[q - 1] for q in range(1, len(v))]
            # hidden samples as [first, last] runs
            runs = []
            for k in hid:
                if runs and runs[-1][1] == k - 1: runs[-1][1] = k
                else: runs.append([k, k])
            g = {'n': name, 'd': sv['difficulty'], 's': sv['spawnPoint'], 'k': sv['skinId'], 'ms': ms,
                 't0': round(t0, 3), 'fr': names, 'x': delta(xs), 'y': delta(ys),
                 'r': [wrap(v) for v in delta(rs)], 'f': fs, 'h': h}
            if runs: g['hid'] = runs
            ghosts.append(g)
        ghosts.sort(key=lambda g: (g['d'], g['s'], g['n']))
        out = {'v': 1, 'hz': HZ, 'ghosts': ghosts}
        txt = json.dumps(out, separators=(',', ':'))
        open(os.path.join(GAME, 'data/race/%d.json' % level), 'w').write(txt)
        total += len(txt)
        print('race/%d.json' % level, len(ghosts), 'ghosts', len(txt) // 1024, 'KB')
    print('ghost data', total // 1024, 'KB')
    open(os.path.join(HERE, 'build_race_report.txt'), 'w', encoding='utf-8').write('\n'.join(report))

    # ---- art: the two start markers and the trophy icon, one small sheet loaded with the race mode
    src = os.path.join(REF, 'sprites_race')
    meta = json.load(open(os.path.join(src, 'sprites.json')))
    names = ['SpawnPointPlayer', 'SpawnPointGhost', 'Trophies']
    ims = [Image.open(os.path.join(src, n + '.png')).convert('RGBA') for n in names]
    W = sum(i.width for i in ims) + 2 * len(ims)
    H = max(i.height for i in ims)
    sheet = Image.new('RGBA', (W, H))
    rects = {}
    x = 0
    for n, im in zip(names, ims):
        sheet.paste(im, (x, 0))
        m = meta[n]
        # [x, y, w, h, pivotX, pivotY, ppu] like the atlas (pivot from the top-left, y down)
        rects[n] = [x, 0, im.width, im.height, m['px'], m['py'], m['ppu']]
        x += im.width + 2
    sheet.save(os.path.join(GAME, 'art/race.webp'), lossless=True, quality=100, method=6)
    json.dump(rects, open(os.path.join(GAME, 'data/race/art.json'), 'w'), separators=(',', ':'))
    print('art/race.webp', os.path.getsize(os.path.join(GAME, 'art/race.webp')) // 1024, 'KB')


build()
