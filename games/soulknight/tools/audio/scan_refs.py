"""Quét prefab/MonoBehaviour/AudioSource của một gói .ab, trả các tham chiếu tới AudioClip (kể cả sang gói khác).
Dùng qua build_audio.py scan. Mỗi dòng: root (prefab gốc), go, cls (lớp MonoBehaviour), f (đường dẫn trường),
clip (tên AudioClip), cb (gói chứa clip), b (gói chứa tham chiếu)."""
import UnityPy, sys, os, collections

sys.stdout.reconfigure(encoding='utf-8')
R = os.environ.get('SK86', r'D:\sk86-ref') + r'\UnityDataAssetPack\assets\AssetBundles'
_cache = {}
CAB = {}          # tên CAB (chữ thường) -> (gói, SerializedFile)
STAT = collections.Counter()


def load(rel):
    if rel not in _cache:
        _cache[rel] = UnityPy.load(os.path.join(R, rel))
    return _cache[rel]


def sfiles(env):
    seen = {}
    for o in env.objects: seen[id(o.assets_file)] = o.assets_file
    return seen.values()


def index(rels):
    """Lập bảng CAB -> file để giải PPtr ngoài gói (audio_clip của vũ khí trỏ sang sound_effect.ab)."""
    for rel in rels:
        for sf in sfiles(load(rel)):
            CAB[sf.name.lower()] = (rel, sf)


def resolve(sf, fid, pid):
    """(gói, object) của PPtr; fid 0 = cùng file."""
    if fid == 0: return None, sf.objects.get(pid), sf
    base = os.path.basename(sf.externals[fid - 1].path.replace('\\', '/')).lower()
    hit = CAB.get(base)
    if not hit: STAT['ngoài gói chưa nạp'] += 1; return None, None, None
    return hit[0], hit[1].objects.get(pid), hit[1]


def walk(v, path, out):
    if isinstance(v, dict):
        if 'm_PathID' in v and 'm_FileID' in v and len(v) <= 3:
            out.append((path, v['m_FileID'], v['m_PathID'])); return
        for k, x in v.items(): walk(x, path + '.' + k, out)
    elif isinstance(v, list):
        for x in v: walk(x, path + '[]', out)


_rc = {}


def rootname(sf, go):
    key = (id(sf), go.path_id)
    if key in _rc: return _rc[key]
    r = None
    try:
        tr = None
        for c in go.read().m_Components:
            o = (c.component if hasattr(c, 'component') else c).deref()
            if o.type.name in ('Transform', 'RectTransform'): tr = o; break
        cur, n = tr, 0
        while cur is not None and n < 60:
            f = cur.read().m_Father
            if f.path_id == 0: break
            cur = f.deref(); n += 1
        r = cur.read().m_GameObject.read().m_Name if cur is not None else None
    except Exception:
        r = None
    _rc[key] = r
    return r


def scan(rel):
    env = load(rel)
    res = []
    for sf in sfiles(env):
        cc = {}
        for pid, o in sf.objects.items():
            t = o.type.name
            if t not in ('MonoBehaviour', 'AudioSource'): continue
            try: d = o.read_typetree()
            except Exception: continue
            refs = []
            walk(d, '', refs)
            script = None
            for p, fid, pid2 in refs:
                if pid2 == 0: continue
                key = (fid, pid2)
                if key not in cc:
                    name = cb = None
                    try:
                        cb, ao, _ = resolve(sf, fid, pid2)
                        if ao is not None and ao.type.name == 'AudioClip': name = ao.read().m_Name
                    except Exception: pass
                    cc[key] = (name, cb or rel)
                name, cb = cc[key]
                if not name: continue
                if script is None and t == 'MonoBehaviour':
                    try: script = o.read().m_Script.read().m_ClassName
                    except Exception: script = '?'
                gop = d.get('m_GameObject', {}).get('m_PathID')
                go = sf.objects.get(gop) if gop else None
                res.append({'root': rootname(sf, go) if go else None, 'b': rel, 'cb': cb, 't': t, 'cls': script,
                            'go': go.read().m_Name if go else None, 'f': p, 'clip': name})
    return res
