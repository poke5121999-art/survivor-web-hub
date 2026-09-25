# -*- coding: utf-8 -*-
"""build_assets.py -- quet art/, audio/ da boc de sinh data/assets.js (VD.ASSETS), de runtime
khong phai doan duong dan/ten file. Chay sau khi tools/rip.py (spine/sector/audio/ui) da xong.
    PYTHONIOENCODING=utf-8 python build_assets.py
"""
import io, json, os, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art')
AUDIO = os.path.join(ROOT, 'audio')
DATA = os.path.join(ROOT, 'data')


def atomic_write_text(path, text):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.tmp-', suffix='.js')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def main():
    A = {'spine': {}, 'sector': {}, 'sfx': {}, 'bgm': {}, 'icon': {}, 'units': {}, 'font': {
        'regular': 'vendor/fonts/Pretendard-Regular.subset.woff2',
        'bold': 'vendor/fonts/Pretendard-Bold.subset.woff2',
    }}

    units_p = os.path.join(os.path.dirname(__file__), 'units.json')
    if os.path.isfile(units_p):
        u = json.load(open(units_p, encoding='utf-8'))
        A['units'] = u.get('units', {})

    manifest_p = os.path.join(os.path.dirname(__file__), 'manifest.json')
    A['uiSfx'] = {}
    if os.path.isfile(manifest_p):
        mf = json.load(open(manifest_p, encoding='utf-8'))
        have_sfx = set()  # dien sau khi quet audio/sfx/ ben duoi (xem cuoi ham)
        A['_uiSfxMapRaw'] = mf.get('uiSfx', {})
        A['_uiSfxLootingFamily'] = mf.get('uiSfxLootingFamily', [])

    spine_root = os.path.join(ART, 'spine')
    if os.path.isdir(spine_root):
        for name in sorted(os.listdir(spine_root)):
            d = os.path.join(spine_root, name)
            meta_p = os.path.join(d, 'meta.json')
            if not os.path.isfile(meta_p):
                continue
            meta = json.load(open(meta_p, encoding='utf-8'))
            skels = {}
            for skn, sk in meta.get('skeletons', {}).items():
                suffix = 'SW' if skn.endswith('_SW') else ('NW' if skn.endswith('_NW') else skn)
                skels[suffix] = {'skel': 'art/spine/%s/%s' % (name, sk['skel']), 'scale': sk.get('scale')}
            A['spine'][name] = {
                'dir': 'art/spine/%s/' % name,
                'atlas': 'art/spine/%s/%s' % (name, meta['atlas']) if meta.get('atlas') else None,
                'skeletons': skels,
                'pages': [p['png'] for p in meta.get('pages', [])],
            }

    sector_root = os.path.join(ART, 'sector')
    if os.path.isdir(sector_root):
        for f in sorted(os.listdir(sector_root)):
            if not f.endswith('.json'):
                continue
            sid = f[:-5]
            d = json.load(open(os.path.join(sector_root, f), encoding='utf-8'))
            glb = sid + '.glb'
            if os.path.exists(os.path.join(sector_root, glb)):
                A['sector'][sid] = {
                    'glb': 'art/sector/%s' % glb,
                    'json': 'art/sector/%s' % f,
                    'bounds': d.get('bounds'),
                }

    for group in ('sfx', 'bgm'):
        d = os.path.join(AUDIO, group)
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                if f.endswith('.mp3'):
                    A[group][f[:-4]] = 'audio/%s/%s' % (group, f)

    # VD.ASSETS.uiSfx: {purpose: 'sfx/<name>' | null neu clip khong xuat duoc (thieu trong bundle)}
    raw_map = A.pop('_uiSfxMapRaw', {})
    for purpose, clip in raw_map.items():
        A['uiSfx'][purpose] = clip if clip in A['sfx'] else None
    looting = A.pop('_uiSfxLootingFamily', [])
    A['uiSfx']['interactionLootingFamily'] = [n for n in looting if n in A['sfx']]

    ui_root = os.path.join(ART, 'ui')
    if os.path.isdir(ui_root):
        for fam_dir in sorted(os.listdir(ui_root)):
            if not fam_dir.startswith('icon_'):
                continue
            fam = fam_dir[len('icon_'):]
            names = sorted(f[:-5] for f in os.listdir(os.path.join(ui_root, fam_dir)) if f.endswith('.webp'))
            A['icon'][fam] = {'dir': 'art/ui/%s/' % fam_dir, 'names': names}
        for extra in ('portrait', 'dialogimage'):
            d = os.path.join(ui_root, extra)
            if os.path.isdir(d):
                A[extra] = {f[:-5]: 'art/ui/%s/%s' % (extra, f) for f in sorted(os.listdir(d)) if f.endswith('.webp')}

    os.makedirs(DATA, exist_ok=True)
    atomic_write_text(os.path.join(DATA, 'assets.js'),
                       'window.VD = window.VD || {};\nVD.ASSETS = ' +
                       json.dumps(A, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('spine', len(A['spine']), 'sector', len(A['sector']), 'sfx', len(A['sfx']), 'bgm', len(A['bgm']),
          'icon families', len(A['icon']), 'icon total', sum(len(v['names']) for v in A['icon'].values()),
          'units', len(A['units']))
    print('assets.js', os.path.getsize(os.path.join(DATA, 'assets.js')), 'bytes')


if __name__ == '__main__':
    main()
