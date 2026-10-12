# Đổ MonoBehaviour (typetree, không mã hoá) của một hay nhiều bundle ra JSON đọc được.
# Chạy: PYTHONIOENCODING=utf-8 python dump_mb.py <bundle tương đối, vd weapon.ab boss/boss01.ab> [--deps] [--out DIR]
# Ra:   <out>/mb/<bundle, '/'->'__'>.json = [{cls, go, root, path, pid, data}]
#   go   = tên GameObject gắn MB; root = tên prefab gốc; path = đường cây root/.../go
#   data = typetree; mọi PPtr {m_FileID,m_PathID} được thay bằng chuỗi "Type:name" (hoặc "Type:name@bundle"
#          khi nằm ở bundle phụ thuộc, "ext:<cab>#<pid>" khi bundle đó không được nạp, null khi rỗng).
#   --deps nạp cả bundle phụ thuộc (theo .manifest) để đặt tên PPtr ngoài; chậm hơn (common.ab 50 MB).
import UnityPy, json, os, re, sys

AB = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles'
OUT = r'D:\sk86-ref\decoded'
DEPS = False

CAB = {}      # tên CAB (thường) -> (SerializedFile, bundle)
_names = {}


def deps_of(bundle):
    m = os.path.join(AB, bundle[:-3] + '.manifest')
    if not os.path.exists(m):
        return []
    txt = open(m, encoding='utf-8').read()
    part = txt.split('Dependencies:')[-1]
    return [re.sub(r'.*/AssetBundles/', '', l.strip()[2:]) + '.ab' for l in part.splitlines() if l.strip().startswith('- ')]


def load(bundle):
    env = UnityPy.load(os.path.join(AB, bundle))
    for name, f in env.files.items():
        for sname, sf in getattr(f, 'files', {}).items():
            if hasattr(sf, 'objects'):
                CAB[sname.lower()] = (sf, bundle)
    return env


def obj_name(obj):
    key = (id(obj.assets_file), obj.path_id)
    if key in _names:
        return _names[key]
    t = obj.type.name
    try:
        if t in ('GameObject', 'Sprite', 'AudioClip', 'AnimationClip', 'Texture2D', 'Material', 'TextAsset',
                 'AnimatorController', 'AnimatorOverrideController', 'Mesh', 'Shader', 'Font'):
            n = obj.peek_name() or ''
        elif t == 'MonoScript':
            n = obj.read().m_ClassName
        else:
            d = obj.read_typetree()
            n = ''
            g = d.get('m_GameObject')
            if g and g.get('m_PathID'):
                go = obj.assets_file.objects.get(g['m_PathID'])
                n = go.peek_name() if go else ''
            if t == 'MonoBehaviour':
                s = d.get('m_Script', {})
                so = obj.assets_file.objects.get(s.get('m_PathID')) if s.get('m_FileID') == 0 else None
                cls = so.read().m_ClassName if so else resolve_raw(obj.assets_file, s)
                n = f'{n}<{cls}>'
    except Exception as e:  # noqa
        n = '?'
    _names[key] = f'{t}:{n}'
    return _names[key]


def target(sf, p):
    fid, pid = p.get('m_FileID', 0), p.get('m_PathID', 0)
    if not pid:
        return None, None
    if fid == 0:
        return sf.objects.get(pid), None
    ext = sf.externals[fid - 1]
    cab = os.path.basename(ext.path).lower()
    hit = CAB.get(cab)
    if not hit:
        return None, f'ext:{cab}#{pid}'
    return hit[0].objects.get(pid), hit[1]


def resolve_raw(sf, p):
    o, b = target(sf, p)
    if o is None:
        return b
    n = obj_name(o)
    if n.startswith('MonoScript:'):
        return n[11:]
    return n


def resolve(sf, p, home):
    o, b = target(sf, p)
    if o is None:
        return b
    n = obj_name(o)
    return n if (b is None or b == home) else f'{n}@{b[:-3]}'


def walk(v, sf, home):
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            return resolve(sf, v, home)
        return {k: walk(x, sf, home) for k, x in v.items()}
    if isinstance(v, list):
        return [walk(x, sf, home) for x in v]
    if isinstance(v, float):
        return round(v, 6)
    return v


def hierarchy(sf):
    par, goname = {}, {}
    for o in sf.objects.values():
        if o.type.name in ('Transform', 'RectTransform'):
            d = o.read_typetree()
            g = d['m_GameObject']['m_PathID']
            f = d['m_Father']['m_PathID']
            par[o.path_id] = (g, f)
    tf_of_go = {g: t for t, (g, f) in par.items()}
    def path(go_pid):
        out, t = [], tf_of_go.get(go_pid)
        while t in par:
            g, f = par[t]
            o = sf.objects.get(g)
            out.append(o.peek_name() if o else '?')
            t = f if f else None
        return list(reversed(out))
    return path


def dump(bundle):
    env = load(bundle)
    if DEPS:
        for d in deps_of(bundle):
            if os.path.exists(os.path.join(AB, d)):
                load(d)
    rows = []
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        sf = o.assets_file
        try:
            d = o.read_typetree()
        except Exception as e:
            rows.append({'cls': '?', 'pid': o.path_id, 'error': str(e)[:200]}); continue
        cls = resolve_raw(sf, d.get('m_Script', {})) or '?'
        if isinstance(cls, str) and cls.startswith('ext:'):
            cls = '?' + cls
        gpid = d.get('m_GameObject', {}).get('m_PathID', 0)
        if not hasattr(sf, '_skpath'):
            sf._skpath = hierarchy(sf)
        p = sf._skpath(gpid) if gpid else []
        data = {k: walk(v, sf, bundle) for k, v in d.items()
                if k not in ('m_GameObject', 'm_Script', 'm_Enabled', 'm_ObjectHideFlags', 'm_CorrespondingSourceObject',
                             'm_PrefabInstance', 'm_PrefabAsset', 'm_EditorHideFlags', 'm_EditorClassIdentifier')}
        rows.append({'cls': cls, 'go': p[-1] if p else d.get('m_Name', ''), 'root': p[0] if p else '',
                     'path': '/'.join(p), 'pid': o.path_id, 'data': data})
    os.makedirs(os.path.join(OUT, 'mb'), exist_ok=True)
    fn = os.path.join(OUT, 'mb', bundle[:-3].replace('/', '__') + '.json')
    json.dump(rows, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{bundle}: {len(rows)} MB -> {fn}')
    return rows


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--out' in args:
        i = args.index('--out'); OUT = args[i + 1]; del args[i:i + 2]
    DEPS = '--deps' in args
    for b in [a for a in args if a != '--deps']:
        dump(b)
