# Boc du lieu Spine cua trum tu bundle boss/<name>.ab -> art/spine/<name>/
import sys, os, UnityPy
name = sys.argv[1]
src = os.path.expanduser('~/sk86-ref/UnityDataAssetPack/assets/AssetBundles/boss/%s.ab' % name)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'art', 'spine', name)
os.makedirs(out, exist_ok=True)
env = UnityPy.load(src)
for path, o in env.container.items():
    base = os.path.basename(path)
    # Tên trong bundle có thể khác tên trùm (vd bosswindmyststonedragon_spineexport.*): ghi ra dưới tên trùm;
    # tham số 2 (tuỳ chọn) là tiền tố tệp spine cần lấy khi bundle có nhiều rig
    pre = sys.argv[2] if len(sys.argv) > 2 else None
    if pre and not base.lower().startswith(pre.lower()): continue
    if o.type.name == 'TextAsset' and (base.endswith('.skel.bytes') or base.endswith('.atlas.txt')):
        base = name + base[base.index('.'):]
        d = o.read(); b = d.m_Script
        b = b.encode('utf-8', 'surrogateescape') if isinstance(b, str) else bytes(b)
        open(os.path.join(out, base), 'wb').write(b); print('ghi', base, len(b))
    elif o.type.name == 'Texture2D' and (base == name + '.png' or (pre and base.lower().endswith('.png') and 'spine' in path.lower())):
        base = name + '.png'
        o.read().image.save(os.path.join(out, base)); print('ghi', base)
