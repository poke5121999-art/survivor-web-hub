"""World of Slime: export every 2D texture/sprite, UI sprites (with 9-slice), UI prefab layouts, login/prologue video.

  py -3.12 -I tools/export_2d.py img | ui | prefab | video | all

Outputs (under wos.ASSETS): img/<family>/<name>.webp + img/index.json, ui/<folder>/<name>.webp + ui/index.json,
ui/prefab/<prefab>.json, img/login_bg.mp4, img/prologue.mp4, img/Prologue.json.
Sprites are exported as the full Sprite rect (tight-packed atlas sprites are pasted back on a transparent canvas of the
original rect size), so m_Pivot / m_Border refer to the exported image.
"""
import os, sys, io, json, re, shutil, subprocess, multiprocessing as mp
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wos
import UnityPy
from PIL import Image

IMG = os.path.join(wos.ASSETS, 'img')
UI = os.path.join(wos.ASSETS, 'ui')
CACHE = os.path.join(wos.REF, 'cache')
SPRITE_MAP = os.path.join(CACHE, 'ui_sprite_map.json')   # "<file>:<pathid>" -> ui key, used by the prefab stage


def rel(p):
    return os.path.relpath(p, wos.ASSETS).replace('\\', '/')


def safe(n):
    return re.sub(r'[^\w.\-+ ()]', '_', n).strip() or '_'


def sprite_full(s):
    """Sprite -> RGBA image of the whole Sprite rect (not the tight atlas crop)."""
    im = s.image.convert('RGBA')
    r = s.m_Rect
    W, H = int(round(r.width)), int(round(r.height))
    if (im.width, im.height) == (W, H) or W <= 0 or H <= 0:
        return im
    off = s.m_RD.textureRectOffset
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c.paste(im, (int(round(off.x)), int(round(H - off.y - im.height))))
    return c


def save_webp(im, path, lossless=False, q=85, maxw=None):
    if maxw and im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    a = im.getchannel('A')
    if a.getextrema()[0] >= 250:
        im = im.convert('RGB')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if lossless:
        im.save(path, 'WEBP', lossless=True, method=4, exact=True)
    else:
        im.save(path, 'WEBP', quality=q, method=5, exact=True)
    return im.size


def sprite_meta(s):
    r = s.m_Rect
    b = s.m_Border
    return dict(pivot=[round(s.m_Pivot.x, 4), round(s.m_Pivot.y, 4)], ppu=s.m_PixelsToUnits,
                border=[b.x, b.y, b.z, b.w])  # Unity order: left, bottom, right, top (px of the exported image)


def family_of(bundle):
    n = bundle[:-7]
    for pre, fam in (('texture_sl_', 'sl'), ('texture_item_', 'item'), ('texture_icon_', 'icon'), ('texture_npc_', 'npc'),
                     ('texture_thumb_', 'thumb'), ('texture_bufficon', 'bufficon'), ('texture_mapicon', 'mapicon'),
                     ('texture_mapbackground', 'mapbackground'), ('texture_img_', 'img'),
                     ('texture_skillindicator', 'skillindicator'), ('texture_dialogue', 'dialogue'),
                     ('texture_introstory', 'introstory'), ('texture_storyillust', 'storyillust')):
        if n.startswith(pre):
            return fam
    return 'misc'


# ------------------------------------------------------------------ img
def img_bundle(b):
    fam = family_of(b)
    out = []
    try:
        env = UnityPy.load(os.path.join(wos.D, b))
        used = set()
        objs = list(env.objects)
        for o in objs:
            if o.type.name == 'Sprite':
                s = o.read()
                tex = s.m_RD.texture
                if tex is not None:
                    try: used.add(tex.m_PathID)
                    except Exception: pass
                try: used.add(s.m_SpriteAtlas.m_PathID)
                except Exception: pass
                im = sprite_full(s)
                name = s.m_Name
                p = os.path.join(IMG, fam, safe(name) + '.webp')
                size = save_webp(im, p, maxw=1920 if fam in ('storyillust', 'introstory') else None)
                d = dict(name=name, family=fam, bundle=b, file=rel(p), size=list(size), orig=[im.width, im.height], kind='sprite')
                d.update(sprite_meta(s))
                out.append(d)
        spr_tex = {d['name'] for d in out}
        for o in objs:
            if o.type.name == 'Texture2D':
                t = o.read()
                if t.m_Name in spr_tex:
                    continue
                im = t.image.convert('RGBA')
                p = os.path.join(IMG, fam, safe(t.m_Name) + '.webp')
                size = save_webp(im, p, maxw=1920 if fam in ('storyillust', 'introstory') else None)
                out.append(dict(name=t.m_Name, family=fam, bundle=b, file=rel(p), size=list(size), orig=[im.width, im.height], kind='texture'))
    except Exception as e:
        out.append(dict(error=f'{b}: {e!r}'))
    return out


def run_img():
    os.makedirs(IMG, exist_ok=True)
    for d in os.listdir(IMG):
        if os.path.isdir(os.path.join(IMG, d)): shutil.rmtree(os.path.join(IMG, d), ignore_errors=True)
    idx = json.load(io.open(os.path.join(CACHE, 'bundle_index.json'), encoding='utf-8'))['bundles']
    bundles = sorted(b for b in idx if b.startswith('texture_'))
    print(len(bundles), 'texture bundles')
    index, errs, dup = {}, [], 0
    with mp.Pool(4, maxtasksperchild=40) as pool:
        for res in pool.imap_unordered(img_bundle, bundles, chunksize=4):
            for d in res:
                if 'error' in d:
                    errs.append(d['error']); continue
                k = d['name']
                if k in index:   # same name in two bundles: keep both, second gets a family prefix
                    dup += 1; k = d['family'] + '/' + k
                index[k] = d
    index = dict(sorted(index.items()))
    # video is merged in by run_video; keep any existing entries out (img/ was cleared)
    json.dump(dict(count=len(index), items=index), open(os.path.join(IMG, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    fams = {}
    for d in index.values(): fams[d['family']] = fams.get(d['family'], 0) + 1
    print(fams, 'dup', dup, 'errors', errs[:10], len(errs))


# ------------------------------------------------------------------ ui
def load_main(src):
    """Load a bundle with its dependencies; return env and the set of file keys that belong to `src` itself."""
    if not src.endswith('.bundle'):
        return UnityPy.load(os.path.join(wos.DATA, src)), None
    env, _ = wos.load([src], depth=1)
    idx = json.load(io.open(os.path.join(CACHE, 'bundle_index.json'), encoding='utf-8'))['bundles'][src]
    return env, {c.lower() for c in idx['cabs']}


def containers(env, cabs):
    """(asset path, PPtr) of the container of `src` itself (not its dependencies)."""
    for f in env.files.values():
        for sf in list(getattr(f, 'files', {}).values()) or [f]:
            if cabs is not None and file_key(sf) not in cabs: continue
            c = getattr(sf, 'container', None)
            if c:
                yield from c.items()


def mine(env, cabs):
    for o in env.objects:
        if cabs is None or file_key(o.assets_file) in cabs:
            yield o


def ext_key(path):
    return os.path.basename(path).lower()


def file_key(f):
    """Stable key for a SerializedFile: its CAB name for bundles, file name for player files."""
    return os.path.basename(getattr(f, 'name', '') or '').lower()


def ui_worker(src):
    recs = []
    try:
        env, cabs = load_main(src)
        cont = {v.path_id: k for k, v in containers(env, cabs)}
        atlases = {}
        for o in mine(env, cabs):
            if o.type.name == 'SpriteAtlas':
                a = o.read()
                for ps in a.m_PackedSprites:
                    atlases[ps.m_PathID] = a.m_Name
        srcname = src[:-7] if src.endswith('.bundle') else src.split('.')[0]
        for o in mine(env, cabs):
            if o.type.name != 'Sprite':
                continue
            s = o.read()
            cp = cont.get(o.path_id)
            folder = os.path.basename(os.path.dirname(cp)) if cp else atlases.get(o.path_id)
            if not folder:
                try: folder = s.m_RD.texture.read().m_Name
                except Exception: folder = 'misc'
            folder = safe(folder)
            if src.endswith('.bundle') and srcname != 'ui_shared':
                folder = srcname + '/' + folder
            elif not src.endswith('.bundle'):
                folder = srcname + '/' + folder
            im = sprite_full(s)
            p = os.path.join(UI, folder, safe(s.m_Name) + '.webp')
            if os.path.exists(p):   # same name twice in one folder
                p = os.path.join(UI, folder, safe(s.m_Name) + '__%d.webp' % (o.path_id % 100000))
            size = save_webp(im, p, lossless=True)
            d = dict(name=s.m_Name, folder=folder, source=src, file=rel(p), size=list(size))
            d.update(sprite_meta(s))
            d['_k'] = '%s:%d' % (file_key(o.assets_file), o.path_id)
            recs.append(d)
    except Exception as e:
        recs.append(dict(error=f'{src}: {e!r}'))
    return recs


def run_ui():
    shutil.rmtree(os.path.join(UI, 'prefab'), ignore_errors=True)
    for d in os.listdir(UI) if os.path.isdir(UI) else []:
        if d != 'prefab': shutil.rmtree(os.path.join(UI, d), ignore_errors=True)
    os.makedirs(UI, exist_ok=True)
    srcs = ['ui_shared.bundle', 'sharedassets0.assets', 'resources.assets'] + \
           [b for b in sorted(os.listdir(wos.D)) if b.startswith('ui_') and b != 'ui_shared.bundle']
    items, smap, errs = {}, {}, []
    with mp.Pool(3, maxtasksperchild=1) as pool:
        for recs in pool.imap(ui_worker, srcs):
            for d in recs:
                if 'error' in d: errs.append(d['error']); continue
                k = d.pop('_k')
                key = d['folder'] + '/' + d['name']
                n = 2
                while key in items:
                    key = d['folder'] + '/' + d['name'] + '#%d' % n; n += 1
                items[key] = d; smap[k] = key
            print('done', len(items), flush=True)
    items = dict(sorted(items.items()))
    folders = {}
    for d in items.values(): folders[d['folder']] = folders.get(d['folder'], 0) + 1
    json.dump(dict(count=len(items), note='border = [left,bottom,right,top] px of the exported image (Unity m_Border); pivot normalized; key = folder/name',
                   folders=folders, items=items),
              open(os.path.join(UI, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(smap, open(SPRITE_MAP, 'w'))
    print(len(items), 'sprites', len(folders), 'folders', 'errors', errs)


# ------------------------------------------------------------------ prefab
KEEP = ('m_text', 'm_Text', 'm_fontSize', 'm_FontSize', 'm_FontData', 'm_Color', 'm_fontColor', 'm_fontColor32', 'm_Sprite', 'm_Type',
        'm_FillAmount', 'm_PreserveAspect', 'm_RaycastTarget', 'm_Alignment', 'm_HorizontalAlignment', 'm_isRightToLeft',
        'm_FillMethod', 'm_ChildAlignment', 'm_Spacing', 'm_Padding', 'm_StartCorner', 'm_CellSize', 'm_Constraint')


def col(c):
    if isinstance(c, dict) and 'r' in c:
        return [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3), round(c['a'], 3)]
    return c


def prefab_worker(args):
    b, = args
    res = {}
    try:
        scripts = {k.lower(): v for k, v in json.load(io.open(os.path.join(CACHE, 'bundle_index.json'), encoding='utf-8'))['scripts'].items()}
        smap = json.load(open(SPRITE_MAP))
        env, cabs = load_main(b)
        by = {}
        sf = None
        for f in env.files.values():
            if hasattr(f, 'objects'):
                sf = f
        for o in mine(env, cabs):
            by[(file_key(o.assets_file), o.path_id)] = o
        cont = dict(containers(env, cabs))
        cache = {}

        def obj_of(o, ptr):
            if not ptr or not ptr.get('m_PathID'): return None
            fid = ptr['m_FileID']
            if fid == 0: return by.get((file_key(o.assets_file), ptr['m_PathID']))
            return None

        def ext_cab(o, fid):
            if fid == 0: return file_key(o.assets_file)
            ex = o.assets_file.externals[fid - 1]
            return ext_key(ex.path)

        def tt(o):
            k = (file_key(o.assets_file), o.path_id)
            if k not in cache:
                try: cache[k] = o.read_typetree()
                except Exception: cache[k] = None
            return cache[k]

        def node(go_o, depth=0):
            go = tt(go_o)
            n = dict(name=go['m_Name'], active=bool(go.get('m_IsActive', 1)))
            comps, children = [], []
            for c in go['m_Component']:
                co = obj_of(go_o, c['component'])
                if co is None: continue
                t = co.type.name
                d = tt(co)
                if d is None: continue
                if t == 'RectTransform':
                    n['rect'] = dict(anchorMin=[d['m_AnchorMin']['x'], d['m_AnchorMin']['y']], anchorMax=[d['m_AnchorMax']['x'], d['m_AnchorMax']['y']],
                                     pos=[round(d['m_AnchoredPosition']['x'], 2), round(d['m_AnchoredPosition']['y'], 2)],
                                     size=[round(d['m_SizeDelta']['x'], 2), round(d['m_SizeDelta']['y'], 2)], pivot=[d['m_Pivot']['x'], d['m_Pivot']['y']])
                    sc = d['m_LocalScale']
                    if (sc['x'], sc['y']) != (1, 1): n['rect']['scale'] = [sc['x'], sc['y']]
                    for ch in d['m_Children']:
                        cco = obj_of(go_o, ch)
                        if cco is None: continue
                        t_ = tt(cco)
                        g = obj_of(cco, t_['m_GameObject'])
                        if g is not None: children.append(g)
                elif t == 'MonoBehaviour':
                    sp = d.get('m_Script') or {}
                    cls = scripts.get('%s:%d' % (ext_cab(co, sp.get('m_FileID', 0)), sp.get('m_PathID', 0)), '?')
                    c_ = dict(cls=cls)
                    for k in KEEP:
                        if k in d:
                            v = d[k]
                            if k == 'm_Sprite':
                                if v and v.get('m_PathID'):
                                    key = smap.get('%s:%d' % (ext_cab(co, v['m_FileID']), v['m_PathID']))
                                    c_['sprite'] = key or ('?%s:%d' % (ext_cab(co, v['m_FileID']), v['m_PathID']))
                                continue
                            if k == 'm_FontData' and isinstance(v, dict):
                                c_['fontSize'] = v.get('m_FontSize'); continue
                            if k in ('m_Color', 'm_fontColor'): v = col(v)
                            if k == 'm_fontColor32': continue
                            c_[k[2:] if k.startswith('m_') else k] = v
                    extra = {k: v for k, v in d.items() if isinstance(v, str) and k not in ('m_Name', 'm_text', 'm_Text') and 0 < len(v) <= 80 and not k.startswith('m_Edit')}
                    if cls not in ('Image', 'Text', 'TextMeshProUGUI') and extra: c_['str'] = extra
                    comps.append(c_)
                elif t == 'CanvasGroup':
                    comps.append(dict(cls='CanvasGroup', alpha=d.get('m_Alpha')))
            if comps: n['comp'] = comps
            n['children'] = [node(g, depth + 1) for g in children]
            if not n['children']: del n['children']
            return n

        for path, ptr in cont.items():
            if not path.endswith('.prefab'): continue
            o = ptr.deref()
            if o.type.name != 'GameObject': continue
            res[path] = node(o)
    except Exception as e:
        import traceback
        res['_error'] = traceback.format_exc()
    return b, res


def run_prefab():
    pd = os.path.join(UI, 'prefab')
    shutil.rmtree(pd, ignore_errors=True); os.makedirs(pd)
    bundles = [b for b in sorted(os.listdir(wos.D)) if b.startswith('ui_') and b != 'ui_shared.bundle']
    n = 0; idx = {}
    with mp.Pool(2, maxtasksperchild=1) as pool:
        for b, res in pool.imap(prefab_worker, [(x,) for x in bundles]):
            if '_error' in res: print(b, res['_error']); continue
            for path, tree in res.items():
                name = os.path.splitext(os.path.basename(path))[0]
                f = os.path.join(pd, b[:-7] + '__' + safe(name) + '.json')
                json.dump(dict(prefab=path, bundle=b, root=tree), open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
                idx[os.path.basename(f)] = path; n += 1
            print(b, len(res), flush=True)
    json.dump(idx, open(os.path.join(pd, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(n, 'prefab files')


# ------------------------------------------------------------------ video
def run_video():
    os.makedirs(IMG, exist_ok=True)
    mp4 = [f for f in os.listdir(os.path.join(wos.DATA, 'StreamingAssets')) if f.startswith('Login_MP4_Bg')]
    ff = shutil.which('ffmpeg')
    if mp4 and ff:
        src = os.path.join(wos.DATA, 'StreamingAssets', mp4[0])
        dst = os.path.join(IMG, 'login_bg.mp4')
        r = subprocess.run([ff, '-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], timeout=900)
        print('login', os.path.getsize(src) // 1024, 'KB ->', os.path.getsize(dst) // 1024, 'KB', r.returncode)
    # video_prologue.bundle: the TextAsset "Prologue" is really an mp4 (the .bytes file, 26 MB); the VideoClip is the same
    # film as webm in an external .resource (34 MB). There is no Prologue.json in this bundle (the notes were wrong).
    env = UnityPy.load(os.path.join(wos.D, 'video_prologue.bundle'))
    for o in env.objects:
        if o.type.name == 'TextAsset':
            t = o.read()
            data = t.m_Script
            raw = data.encode('utf-8', 'surrogateescape') if isinstance(data, str) else bytes(data)
            assert raw[4:8] == b'ftyp', 'prologue TextAsset is not an mp4'
            tmp = os.path.join(CACHE, 'prologue_src.mp4')
            open(tmp, 'wb').write(raw)
            dst = os.path.join(IMG, 'prologue.mp4')
            if ff:
                subprocess.run([ff, '-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
                                '-c:a', 'aac', '-b:a', '96k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], timeout=1800)
            else:
                shutil.copy(tmp, dst)
            print('prologue', os.path.getsize(tmp) // 1024, 'KB ->', os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    mp.freeze_support()
    for a in (sys.argv[1:] or ['all']):
        if a in ('img', 'all'): run_img()
        if a in ('ui', 'all'): run_ui()
        if a in ('prefab', 'all'): run_prefab()
        if a in ('video', 'all'): run_video()
