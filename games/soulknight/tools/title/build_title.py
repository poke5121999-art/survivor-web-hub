# Lever: bóc màn hình tựa gốc của Soul Knight 8.6 ra art/title/ (Spine nền + hiệp sĩ, logo).
#   py -3.12 -I tools/title/build_title.py        (chạy ở games/soulknight; cần D:/sk86-ref)
# Nguồn [ĐO]:
#   title_background/860.ab: prefab title_860 = hai SkeletonGraphic title_bg + title_knight, cùng neo giữa-dưới, pos (-20, 513),
#     animation movement_ide (lặp), skin default, scale SkeletonData 0.01; atlas 3 trang (nền) + 1 trang (hiệp sĩ).
#   login.ab: Texture2D title_en 600x150 = logo "Soul Knight" (window_setting › title dùng sprite biaoti03 cùng ảnh).
#   Cảnh tựa gốc nằm trong scene APK không đọc được typetree nên bố cục (logo góc trên trái, chữ Nhấp bắt đầu dưới) lấy theo
#   khung 2019 và term 'TAP TO START' của localization [ƯỚC LƯỢNG].
# Ảnh nén PNG lượng tử hoá 8 bit nếu có Pillow quantize (giữ alpha), skel/atlas ghi nguyên.
import os, sys, io
import UnityPy
sys.stdout.reconfigure(encoding='utf-8')
AB = os.environ.get('SK86_AB', 'D:/sk86-ref/UnityDataAssetPack/assets/AssetBundles')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'title')
os.makedirs(OUT, exist_ok=True)

def save_png(img, name):
    p = os.path.join(OUT, name)
    img = img.convert('RGBA')
    try:
        q = img.quantize(colors=256, method=2, dither=0)   # FASTOCTREE giữ alpha
        q.save(p, optimize=True)
        # lượng tử hoá hỏng ảnh nhiều bóng mờ thì giữ bản RGBA gốc
        if os.path.getsize(p) > 3 * 1024 * 1024: img.save(p, optimize=True)
    except Exception:
        img.save(p, optimize=True)
    print('ghi', name, img.size, os.path.getsize(p))

env = UnityPy.load(os.path.join(AB, 'title_background', '860.ab'))
for path, o in env.container.items():
    base = os.path.basename(path)
    if o.type.name == 'TextAsset' and (base.endswith('.skel.bytes') or base.endswith('.atlas.txt')):
        d = o.read(); b = d.m_Script
        b = b.encode('utf-8', 'surrogateescape') if isinstance(b, str) else bytes(b)
        open(os.path.join(OUT, base), 'wb').write(b); print('ghi', base, len(b))
    elif o.type.name == 'Texture2D' and base.endswith('.png'):
        save_png(o.read().image, base)

env = UnityPy.load(os.path.join(AB, 'login.ab'))
for o in env.objects:
    if o.type.name == 'Texture2D':
        d = o.read()
        if d.m_Name == 'title_en': save_png(d.image, 'logo.png')   # 600x150, chữ "Soul Knight" (sprite biaoti03 của window_setting)
