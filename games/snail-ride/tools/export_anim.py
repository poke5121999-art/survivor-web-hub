"""Export all AnimationClips (legacy + Mecanim) to a JS-friendly JSON.

Usage: python3 -I export_anim.py [REF_DIR]   (default ~/snail-ride-ref)
Reads  REF_DIR/dump/json/*.json, REF_DIR/dump/externals.json, REF_DIR/src/**.cs
Writes REF_DIR/anim/clips.json and prints a resolution / verification report.

Key format: [time, value, inSlope, outSlope] (Unity Hermite). A slope of the
string "Infinity" / "-Infinity" means a stepped segment (hold left value).
PPtr curves: [time, "<name>@<file>:<pathId>"].
"""
import json, math, os, re, struct, sys, zlib

REF = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/snail-ride-ref')
DUMP = os.path.join(REF, 'dump')
OUT = os.path.join(REF, 'anim')
SCAN_FILES = ['sharedassets0.assets', 'sharedassets1.assets', 'sharedassets2.assets',
              'level0', 'level1', 'level2']
EXTRA_FILES = ['globalgamemanagers.assets']  # MonoScripts live here
KEEP = {'AnimationClip', 'GameObject', 'Transform', 'RectTransform', 'MonoScript', 'Sprite',
        'Animator', 'Animation', 'AnimatorController', 'AnimatorOverrideController'}
CLASS = {1: 'GameObject', 4: 'Transform', 8: 'Behaviour', 23: 'MeshRenderer', 25: 'Renderer',
         82: 'AudioSource', 95: 'Animator', 102: 'TextMesh', 114: 'MonoBehaviour',
         120: 'LineRenderer', 198: 'ParticleSystem', 199: 'ParticleSystemRenderer',
         210: 'SortingGroup', 212: 'SpriteRenderer', 222: 'CanvasRenderer', 223: 'Canvas',
         224: 'RectTransform', 225: 'CanvasGroup'}
TRANSFORM_ATTR = {1: ('position', 3), 2: ('rotation', 4), 3: ('scale', 3), 4: ('euler', 3)}

ext = json.load(open(os.path.join(DUMP, 'externals.json')))
recs = {}  # (file, pid) -> record
for fn in SCAN_FILES + EXTRA_FILES:
    p = os.path.join(DUMP, 'json', fn + '.json')
    if not os.path.exists(p):
        continue
    for r in json.load(open(p)):
        if r['type'] in KEEP:
            recs[(fn, r['path_id'])] = r


def resolve(fn, pp):
    if not pp or pp.get('m_PathID', 0) == 0:
        return None
    fid = pp['m_FileID']
    f = fn if fid == 0 else (ext.get(fn, [])[fid - 1] if fid - 1 < len(ext.get(fn, [])) else None)
    return (f, pp['m_PathID']) if f else None


def ref_name(fn, pp):
    k = resolve(fn, pp)
    if not k:
        return None
    r = recs.get(k)
    nm = r['data'].get('m_Name') if r else None
    return '%s@%s:%d' % (nm or '?', k[0], k[1])


def script_name(fn, pp):
    k = resolve(fn, pp)
    r = recs.get(k) if k else None
    return r['data'].get('m_ClassName') or r['data'].get('m_Name') if r else None


def crc(s):
    return zlib.crc32(s.encode('utf-8')) & 0xFFFFFFFF


def r5(x):
    if isinstance(x, str):
        return x
    if math.isinf(x):
        return 'Infinity' if x > 0 else '-Infinity'
    if math.isnan(x):
        return 'NaN'
    v = float('%.5g' % x)
    return 0.0 if v == 0 else v


# ---------------------------------------------------------------- path hashes
path_hash = {0: ''}
go_name = {}
tparent = {}
for (fn, pid), r in recs.items():
    if r['type'] == 'GameObject':
        go_name[(fn, pid)] = r['data']['m_Name']
for (fn, pid), r in recs.items():
    if r['type'] in ('Transform', 'RectTransform'):
        tparent[(fn, pid)] = resolve(fn, r['data']['m_Father'])
for (fn, pid) in tparent:
    names, cur = [], (fn, pid)
    seen = set()
    while cur and cur in tparent and cur not in seen:
        seen.add(cur)
        g = resolve(cur[0], recs[cur]['data']['m_GameObject'])
        names.append(go_name.get(g, ''))
        cur = tparent[cur]
    names.reverse()  # root .. node
    for i in range(len(names)):  # relative to ancestor i: names[i+1:]
        s = '/'.join(names[i + 1:])
        path_hash.setdefault(crc(s), s)

# ------------------------------------------------------------ attribute names
attr_names = set(['m_IsActive', 'm_Enabled', 'm_Sprite', 'm_SortingOrder', 'm_Alpha', 'm_fontSize',
                  'm_FontSize', 'm_FlipX', 'm_FlipY', 'm_Size', 'm_Text', 'm_Interactable',
                  'm_FillAmount', 'm_Value', 'm_IsOn', 'm_Mass'])
VEC = {'m_Color': 'rgba', 'material._Color': 'rgba', 'material._FlashColor': 'rgba',
       'material._TintColor': 'rgba', 'm_LocalPosition': 'xyz', 'm_LocalScale': 'xyz',
       'localEulerAnglesRaw': 'xyz', 'localEulerAngles': 'xyz', 'm_LocalRotation': 'xyzw',
       'm_AnchoredPosition': 'xy', 'm_SizeDelta': 'xy', 'm_AnchorMin': 'xy', 'm_AnchorMax': 'xy',
       'm_Pivot': 'xy', 'm_Size': 'xy', 'm_Offset': 'xy', 'm_EffectDistance': 'xy',
       'm_EffectColor': 'rgba', 'm_FontData.m_FontSize': ''}
for b, comps in VEC.items():
    attr_names.add(b)
    for c in comps:
        attr_names.add(b + '.' + c)
attr_names.update(['material._FlashAmount', 'material._Cutoff'])
cs_idents = set()
for root, _, files in os.walk(os.path.join(REF, 'src')):
    for f in files:
        if f.endswith('.cs'):
            cs_idents.update(re.findall(r'[A-Za-z_][A-Za-z0-9_]*',
                                        open(os.path.join(root, f), errors='ignore').read()))
for n in cs_idents:
    attr_names.add(n)
    for c in 'xyzwrgba':
        attr_names.add(n + '.' + c)
shader_props = set()
for (fn, pid), r in recs.items():
    if r['type'] == 'AnimationClip':
        for k in ('m_FloatCurves', 'm_PPtrCurves'):
            for c in r['data'][k]:
                attr_names.add(c['attribute'])
                path_hash.setdefault(crc(c['path']), c['path'])
                if c['attribute'].startswith('material.'):
                    shader_props.add(c['attribute'][9:].split('.')[0])
for n in cs_idents:
    if n.startswith('_'):
        shader_props.add(n)
shader_props.update(['_Color', '_FlashColor', '_FlashAmount', '_MainTex', '_TintColor', '_Cutoff'])
attr_hash = {crc(n): n for n in sorted(attr_names)}
mat_hash = {crc(n) & 0x0FFFFFFF: n for n in sorted(shader_props)}


def material_attr(a):
    """customType 22: low 28 bits = crc32(shaderProp)&0xFFFFFFF, high nibble = component info.
    Observed: 0x8 = scalar float. Otherwise bits 28-29 = component, bit 30 = rgba(1)/xyzw(0)."""
    n = mat_hash.get(a & 0x0FFFFFFF)
    if n is None:
        return None
    hi = a >> 28
    if hi & 0x8:
        return 'material.' + n
    comp = hi & 3
    return 'material.%s.%s' % (n, ('rgba' if hi & 4 else 'xyzw')[comp])


# --------------------------------------------------------------- clip users
users = {}
for (fn, pid), r in recs.items():
    if r['type'] == 'AnimatorController':
        for c in r['data']['m_AnimationClips']:
            k = resolve(fn, c)
            if k:
                users.setdefault(k, set()).add('controller:' + r['data']['m_Name'])
    elif r['type'] == 'Animation':
        g = go_name.get(resolve(fn, r['data']['m_GameObject']), '?')
        for c in r['data']['m_Animations']:
            k = resolve(fn, c)
            if k:
                users.setdefault(k, set()).add('animation:%s@%s' % (g, fn))


# ------------------------------------------------------------ mecanim decode
def f32(u):
    return struct.unpack('<f', struct.pack('<I', u & 0xFFFFFFFF))[0]


def decode_streamed(words, ncurves):
    """-> {curveIndex: [(time, [c0,c1,c2,c3]), ...]} in time order."""
    out = {i: [] for i in range(ncurves)}
    i = 0
    while i < len(words):
        t = f32(words[i]); n = words[i + 1]; i += 2
        for _ in range(n):
            ci = words[i]
            co = [f32(w) for w in words[i + 1:i + 5]]
            i += 5
            out.setdefault(ci, []).append((t, co))
    return out


def is_pre(t):
    return not math.isfinite(t) or t < -1e30


def streamed_to_keys(segs, t0):
    """Each streamed key holds the cubic of the segment that starts at its time; the frame at
    -FLT_MAX holds the segment before the first real key. Unity sometimes folds a key at the clip
    start into that -FLT_MAX frame (seen on PPtr curves), so when the first real key starts after
    t0 and the pre-segment is constant, a key at t0 with the pre-segment value is restored."""
    keys = []
    if segs and is_pre(segs[0][0]):
        pc = segs[0][1]
        first = next((t for t, _ in segs if not is_pre(t)), None)
        if first is not None and first > t0 + 1e-6 and pc[0] == 0 and pc[1] == 0 and pc[2] == 0:
            segs = [(t0, pc)] + list(segs[1:])
    for j, (t, c) in enumerate(segs):
        if is_pre(t):
            continue
        val, out_s = c[3], c[2]
        if j == 0:
            in_s = 0.0
        else:
            pt, pc = segs[j - 1]
            if is_pre(pt):
                in_s = pc[2]
            elif pc[0] == 0 and pc[1] == 0 and pc[2] == 0 and pc[3] != val:
                in_s = math.inf  # stepped
            else:
                dt = t - pt
                in_s = (3 * pc[0] * dt + 2 * pc[1]) * dt + pc[2]
        keys.append([t - t0, val, in_s, out_s])
    return keys


def linear_keys(times, vals):
    keys = []
    n = len(vals)
    for i in range(n):
        si = (vals[i] - vals[i - 1]) / (times[i] - times[i - 1]) if i > 0 else 0.0
        so = (vals[i + 1] - vals[i]) / (times[i + 1] - times[i]) if i < n - 1 else 0.0
        keys.append([times[i], vals[i], si if i > 0 else so, so if i < n - 1 else si])
    return keys


unresolved = {}  # (kind, hash) -> set(clip keys)


def binding_desc(fn, b, ck):
    tid, attr = b['typeID'], b['attribute']
    path = path_hash.get(b['path'])
    if path is None:
        unresolved.setdefault(('path', b['path']), set()).add(ck)
        path = '#%d' % b['path']
    typ = CLASS.get(tid, 'Class%d' % tid)
    if tid == 114:
        typ = script_name(fn, b['script']) or 'MonoBehaviour'
    if tid == 4 and attr in TRANSFORM_ATTR:
        prop, dim = TRANSFORM_ATTR[attr]
        return path, typ, prop, dim
    if b['isPPtrCurve'] and attr == 0 and tid == 212:
        return path, typ, 'm_Sprite', 1
    if b['customType'] == 22:
        prop = material_attr(attr)
    else:
        prop = attr_hash.get(attr)
    if prop is None:
        unresolved.setdefault(('attr', attr, tid, b['customType']), set()).add(ck)
        prop = '#%d' % attr
    return path, typ, prop, 1


def mecanim_curves(fn, d, ck):
    mc = d['m_MuscleClip']
    clip = mc['m_Clip'].get('data', mc['m_Clip'])
    t0 = mc['m_StartTime']
    sc = clip['m_StreamedClip']
    dc = clip['m_DenseClip']
    cc = clip['m_ConstantClip']['data']
    nst = sc['curveCount']
    streamed = decode_streamed(sc['data'], nst)
    ndense = dc['m_CurveCount']
    total = nst + ndense + len(cc)

    def keys_for(i):
        if i < nst:
            return streamed_to_keys(streamed.get(i, []), t0)
        if i < nst + ndense:
            j = i - nst
            times = [dc['m_BeginTime'] - t0 + f / dc['m_SampleRate'] for f in range(dc['m_FrameCount'])]
            vals = [dc['m_SampleArray'][f * ndense + j] for f in range(dc['m_FrameCount'])]
            return linear_keys(times, vals)
        return [[0.0, cc[i - nst - ndense], 0.0, 0.0]]

    bind = d['m_ClipBindingConstant']
    pmap = bind['pptrCurveMapping']
    curves = []
    idx = 0
    for b in bind['genericBindings']:
        path, typ, prop, dim = binding_desc(fn, b, ck)
        for comp in range(dim):
            if idx >= total:
                raise ValueError('%s: bindings need more curves than the %d stored' % (ck, total))
            keys = keys_for(idx)
            src = 'streamed' if idx < nst else 'dense' if idx < nst + ndense else 'constant'
            idx += 1
            cv = {'path': path, 'type': typ, 'classID': b['typeID'], 'prop': prop}
            if dim > 1:
                cv['comp'] = comp
            if b['isPPtrCurve']:
                pk = []
                for k in keys:
                    n = int(round(k[1]))
                    ref = ref_name(fn, pmap[n]) if 0 <= n < len(pmap) else None
                    if pk and pk[-1][1] == ref:
                        continue
                    pk.append([r5(k[0]), ref or '#%d' % n])
                cv['keys'] = pk
            else:
                cv['keys'] = [[r5(v) for v in k] for k in keys]
            cv['src'] = src
            curves.append(cv)
    if idx != total:
        raise ValueError('%s: %d curves stored but bindings consume %d' % (ck, total, idx))
    return curves


def legacy_curves(fn, d, ck):
    curves = []
    for field, prop, comps in (('m_PositionCurves', 'position', 'xyz'),
                               ('m_RotationCurves', 'rotation', 'xyzw'),
                               ('m_EulerCurves', 'euler', 'xyz'),
                               ('m_ScaleCurves', 'scale', 'xyz')):
        for c in d[field]:
            kf = c['curve']['m_Curve']
            for ci, cn in enumerate(comps):
                curves.append({'path': c['path'], 'type': 'Transform', 'classID': 4, 'prop': prop,
                               'comp': ci, 'keys': [[r5(k['time']), r5(k['value'][cn]),
                                                     r5(k['inSlope'][cn]), r5(k['outSlope'][cn])]
                                                    for k in kf], 'src': 'legacy'})
    for c in d['m_FloatCurves']:
        typ = CLASS.get(c['classID'], 'Class%d' % c['classID'])
        if c['classID'] == 114:
            typ = script_name(fn, c['script']) or 'MonoBehaviour'
        curves.append({'path': c['path'], 'type': typ, 'classID': c['classID'], 'prop': c['attribute'],
                       'keys': [[r5(k['time']), r5(k['value']), r5(k['inSlope']), r5(k['outSlope'])]
                                for k in c['curve']['m_Curve']], 'src': 'legacy'})
    for c in d['m_PPtrCurves']:
        typ = CLASS.get(c['classID'], 'Class%d' % c['classID'])
        curves.append({'path': c['path'], 'type': typ, 'classID': c['classID'], 'prop': c['attribute'],
                       'keys': [[r5(k['time']), ref_name(fn, k['value'])] for k in c['curve']],
                       'src': 'legacy'})
    return curves


clips = {}
for (fn, pid), r in sorted(recs.items()):
    if r['type'] != 'AnimationClip':
        continue
    d = r['data']
    ck = '%s@%s:%d' % (d['m_Name'], fn, pid)
    mc = d['m_MuscleClip']
    legacy = bool(d['m_Legacy'])
    curves = legacy_curves(fn, d, ck) if legacy else mecanim_curves(fn, d, ck)
    if legacy:  # legacy clips keep a default 0..1 muscle range; real length = last key
        length = max([k[0] for cv in curves for k in cv['keys']] + [0.0])
    else:
        length = mc['m_StopTime'] - mc['m_StartTime']
    clips[ck] = {
        'name': d['m_Name'], 'legacy': legacy,
        'length': r5(length),
        'loop': bool(mc['m_LoopTime']) if not legacy else d['m_WrapMode'] in (2, 4),
        'wrapMode': d['m_WrapMode'],
        'sampleRate': d['m_SampleRate'],
        'events': [{'time': r5(e['time']), 'fn': e['functionName'], 'str': e['data'],
                    'int': e['intParameter'], 'float': r5(e['floatParameter'])} for e in d['m_Events']],
        'usedBy': sorted(users.get((fn, pid), [])),
        'curves': curves,
    }

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'clips.json'), 'w') as f:
    json.dump(clips, f, indent=1, allow_nan=False)

# ------------------------------------------------------------------- report
ncurves = sum(len(c['curves']) for c in clips.values())
print('clips', len(clips), 'curves', ncurves,
      'legacy', sum(c['legacy'] for c in clips.values()))
print('path hashes known', len(path_hash), 'attr names', len(attr_hash))
for k, v in sorted(unresolved.items(), key=str):
    print('UNRESOLVED', k, sorted(v))
print('unresolved total', len(unresolved))


# ------------------------------------------------------------------- verify
def hermite(keys, t):
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            if isinstance(a[3], str) or isinstance(b[2], str) or math.isinf(a[3]) or math.isinf(b[2]):
                return a[1] if t < b[0] else b[1]
            dt = b[0] - a[0]
            s = (t - a[0]) / dt
            s2, s3 = s * s, s * s * s
            return ((2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * a[3] * dt
                    + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * b[2] * dt)
    return keys[-1][1]


def verify():
    ok = True
    # 1) legacy Level clip must reproduce m_FloatCurves exactly (at 5 significant digits)
    src = recs[('sharedassets1.assets', 99)]['data']['m_FloatCurves']
    out = [cv for cv in clips['Level@sharedassets1.assets:99']['curves']]
    bad = 0
    for s, o in zip(src, out):
        exp = [[r5(k['time']), r5(k['value']), r5(k['inSlope']), r5(k['outSlope'])] for k in s['curve']['m_Curve']]
        if exp != o['keys'] or s['attribute'] != o['prop'] or s['path'] != o['path']:
            bad += 1
    print('VERIFY Level float curves: %d/%d match' % (len(src) - bad, len(src)))
    ok &= bad == 0 and len(src) == len(out)
    # 2) Hermite keys vs raw streamed cubic, sampled at 240 Hz, every Mecanim streamed curve
    worst = (0.0, None)
    for (fn, pid), r in recs.items():
        d = r['data']
        if r['type'] != 'AnimationClip' or d['m_Legacy']:
            continue
        mc = d['m_MuscleClip']; clip = mc['m_Clip'].get('data', mc['m_Clip'])
        sc = clip['m_StreamedClip']
        st = decode_streamed(sc['data'], sc['curveCount'])
        for ci in range(sc['curveCount']):
            allsegs = st.get(ci, [])
            segs = [(t, c) for t, c in allsegs if not is_pre(t)]
            keys = streamed_to_keys(allsegs, 0.0)
            if not segs:
                continue
            pre = allsegs[0][1] if is_pre(allsegs[0][0]) else None
            end = max(segs[-1][0], mc['m_StopTime'])
            for n in range(int(end * 240) + 1):
                t = n / 240.0
                seg = segs[0]
                for sg in segs:
                    if sg[0] <= t:
                        seg = sg
                if t < segs[0][0] and pre is not None:
                    raw = pre[3]  # constant pre-segment (checked by streamed_to_keys)
                else:
                    dt = max(t - seg[0], 0.0)
                    c = seg[1]
                    raw = ((c[0] * dt + c[1]) * dt + c[2]) * dt + c[3]
                e = abs(hermite(keys, t) - raw) / max(1.0, abs(raw))
                if e > worst[0]:
                    worst = (e, '%s curve %d t=%.4f' % (d['m_Name'], ci, t))
    print('VERIFY Hermite vs raw cubic: worst rel err %.3g at %s' % worst)
    ok &= worst[0] < 1e-3
    return ok


def sample(name, n=3):
    for ck, c in clips.items():
        if c['name'] != name:
            continue
        L = c['length']
        ts = [0.0, L / 2, L] if L else [0.0]
        print('SAMPLE %s (len %s loop %s)' % (ck, L, c['loop']))
        for cv in c['curves']:
            if cv['keys'] and isinstance(cv['keys'][0][1], str):
                vals = [cv['keys'][0][1]]
            else:
                vals = ['%.4g' % hermite(cv['keys'], t) for t in ts]
            print('  %-28s %-14s %-10s %s  @%s' % (cv['path'] or '<root>', cv['type'], cv['prop'] + (
                '[%d]' % cv['comp'] if 'comp' in cv else ''), vals, ['%.3g' % t for t in ts]))


if __name__ == '__main__':
    good = verify()
    for nm in ('Snail_SwapInit', 'Snail_Swap', 'Snail_Hit'):
        sample(nm)
    if not good or unresolved:
        sys.exit('verification failed')
