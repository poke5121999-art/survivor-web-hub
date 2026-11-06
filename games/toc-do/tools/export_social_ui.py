# Xuất biểu tượng Bạn Bè, Thư, BXH, Đội Đua, Cặp Đôi từ APK -> art/social/*.webp (nhánh Xã hội).
# Chạy: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_social_ui.py
#
# Nguồn gốc:
#   atlas NGUI og_room_ui3 / og_normalwaitingroom_ui3    Icon_Loves (hình hai người: Bạn Bè), icon_Heart (Cặp Đôi), BG_Gift (quà)
#   ui/race/#peakrace/.../icon_rankcup_01  cúp BXH
#   ui/social/#racingteam/.../icon_racingteam00  huy hiệu đội đua
# APK không có biểu tượng thư riêng ở atlas sảnh (nút Thư gốc là ảnh bản đồ Unity ngoài các atlas đã quét): vẽ phong bì stand-in bằng PIL.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ui_rip  # noqa: E402
import zs  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

OUT = os.path.join(HERE, '..', 'art', 'social')
RB = 'assets/resforassetbundles/'
ATLAS = [
    'ui/#lobbyhome/artwork/atlas/og_lobby/og_lobby.prefab',
    'ui/#lobbyhome/artwork/atlas/og_lobby_ui3/og_lobby_ui3.prefab',
    'ui/#common/artwork/atlas/og_common/og_common.prefab',
    'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/og_normalwaitingroom_ui3.prefab',
    'ui/room/#roomcommon/artwork/atlas/og_room_ui3/og_room_ui3.prefab',
]
# tên tệp ra -> tên sprite NGUI
SPRITES = {'ic_friend': 'Icon_Loves', 'ic_couple': 'icon_Heart', 'ic_gift': 'BG_Gift'}
# tên tệp ra -> container của Texture2D
TEX = {
    'ic_rank': 'ui/race/#peakrace/artwork/hightex/icon_rankcup_01.png',
    'ic_club': 'ui/social/#racingteam/artwork/atlas/og_racingteam/utex/icon_racingteam00_splited.png',
}


def bundles_for(paths):
    want = {RB + p for p in paths}
    return sorted({r['f'] for r in zs.index() if want.intersection(r['cont'])})


def load_sprites(want):
    rip = ui_rip.Rip()
    out, names = {}, set(want)
    for apath in ATLAS:
        for rel in bundles_for([apath]):
            for cab in rip.load(rel):
                for o in list(rip.files[cab].objects.values()):
                    if o.type.name != 'MonoBehaviour' or not names:
                        continue
                    try:
                        t = rip.tree(cab, o)
                    except Exception:
                        continue
                    sprites = {s['name']: s for s in t.get('mSprites') or []}
                    hit = names & set(sprites)
                    mat = rip.resolve(t.get('material'), cab) if hit else None
                    img = None
                    for name, envt in (rip.tree(*mat)['m_SavedProperties']['m_TexEnvs'] if mat else []):
                        if name == '_MainTex':
                            img = rip._texture(envt['m_Texture'], mat[0])
                    if img is None:
                        continue
                    img = img.convert('RGBA')
                    for n in hit:
                        sp = sprites[n]
                        out[n] = img.crop((sp['x'], sp['y'], sp['x'] + sp['width'], sp['y'] + sp['height']))
                    names -= hit
    if names:
        raise SystemExit('sprites not found: %s' % sorted(names))
    return out


def load_textures(paths):
    env, _ = zs.load_with_deps(bundles_for(paths), depth=0)
    out = {}
    for path, obj in env.container.items():
        rel = path[len(RB):] if path.startswith(RB) else path
        if rel in paths and obj.type.name == 'Texture2D':
            out[rel] = obj.read().image.convert('RGBA')
    miss = [p for p in paths if p not in out]
    if miss:
        raise SystemExit('texture not found: %s' % miss)
    return out


def envelope():
    """Phong bì thư stand-in 96x72: thân trắng ngà, nắp gập xanh, viền tối như các biểu tượng sảnh."""
    S = 4
    im = Image.new('RGBA', (96 * S, 72 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((6 * S, 10 * S, 90 * S, 64 * S), 8 * S, fill=(255, 244, 214, 255), outline=(40, 30, 70, 255), width=3 * S)
    d.polygon([(8 * S, 14 * S), (48 * S, 44 * S), (88 * S, 14 * S)], fill=(255, 210, 58, 255), outline=(40, 30, 70, 255))
    d.line([(8 * S, 62 * S), (36 * S, 38 * S)], fill=(40, 30, 70, 255), width=2 * S)
    d.line([(88 * S, 62 * S), (60 * S, 38 * S)], fill=(40, 30, 70, 255), width=2 * S)
    return im.resize((96, 72), Image.LANCZOS)


def save(name, im, maxd=256):
    bb = im.getchannel('A').getbbox()
    if bb:
        im = im.crop(bb)
    s = maxd / max(im.size)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=92, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    spr = load_sprites(set(SPRITES.values()))
    for k, n in SPRITES.items():
        save(k, spr[n])
    tex = load_textures(set(TEX.values()))
    for k, p in TEX.items():
        save(k, tex[p])
    save('ic_mail', envelope())
    print('%d ảnh -> %s' % (len(SPRITES) + len(TEX) + 1, OUT))


main()
