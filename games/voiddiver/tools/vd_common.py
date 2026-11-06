# -*- coding: utf-8 -*-
"""vd_common.py - thu vien dung chung cho tools/rip.py. Tu chua: doc thang Steam install, dem
bundle_index vao %TEMP%/voiddiver-rip/cache (khong dung vd-ref/cache cua may khac)."""
import io, json, os, re, tempfile
import UnityPy

VD = os.environ.get(
    'VD_DATA', r'D:/Steam/steamapps/common/VOID DIVER Escape from the Abyss Demo/VOID DIVER_Data')
BUNDLES = os.path.join(VD, 'StreamingAssets', 'aa', 'StandaloneWindows64')
CACHE = os.environ.get('VD_RIP_CACHE') or os.path.join(tempfile.gettempdir(), 'voiddiver-rip')
os.makedirs(CACHE, exist_ok=True)

BUILTIN = ('unity default resources', 'unity_builtin_extra', 'library/unity')


def short(f):
    return f.rsplit('_', 1)[0]


def bundle_index():
    p = os.path.join(CACHE, 'bundle_index.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    paths, cabs, per = {}, {}, {}
    for f in sorted(os.listdir(BUNDLES)):
        env = UnityPy.load(os.path.join(BUNDLES, f))
        for cab in env.files[next(iter(env.files))].files:
            cabs[cab.lower()] = f
        lst = []
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                d = o.read()
                for k, ptr in d.m_Container:
                    paths.setdefault(k, f)
                    lst.append([k, ptr.asset.path_id if hasattr(ptr, 'asset') else None])
                break
        per[f] = lst
        print(short(f), len(lst), flush=True)
    out = {'path': paths, 'cab': cabs, 'per': per}
    json.dump(out, open(p, 'w', encoding='utf-8'))
    return out


IDX = None
_ENVS = {}


def idx():
    global IDX
    if IDX is None:
        IDX = bundle_index()
    return IDX


def bfile(prefix):
    for f in os.listdir(BUNDLES):
        if short(f) == prefix:
            return f
    raise KeyError('bundle not found: ' + prefix)


def env_of(bundles):
    key = tuple(sorted(set(bundles)))
    if key not in _ENVS:
        _ENVS[key] = UnityPy.load(*[os.path.join(BUNDLES, b) for b in key])
    return _ENVS[key]


def with_deps(bundle, read, deps=()):
    deps = set(deps)
    while True:
        try:
            return read(env_of([bundle] + list(deps)))
        except FileNotFoundError as e:
            m = re.search(r'(cab-[0-9a-f]+)', str(e), re.I)
            cab = m.group(1).lower() if m else None
            b = idx()['cab'].get(cab)
            if not b or b in deps:
                raise
            print('  + dep', short(b), flush=True)
            deps.add(b)


def deref(ptr):
    if ptr is None or ptr.path_id == 0:
        return None
    try:
        return ptr.deref_parse_as_object()
    except FileNotFoundError as e:
        if any(b in str(e).lower() for b in BUILTIN):
            return None
        raise


def serialized_files(env, bundle):
    cabs = {c for c, b in idx()['cab'].items() if b == bundle}
    out = []
    def walk(f):
        for k, v in getattr(f, 'files', {}).items():
            if not isinstance(k, str):
                continue
            if k.lower() in cabs and hasattr(v, 'objects'):
                out.append(v)
            else:
                walk(v)
    walk(env)
    return out


def roots_of(sf):
    r = []
    for o in sf.objects.values():
        if o.type.name in ('Transform', 'RectTransform'):
            t = o.read()
            if t.m_Father.path_id == 0:
                r.append(t)
    return r
