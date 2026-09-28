"""Bóc hoạt ảnh chiêu và bóng của PRO cho trận 2D (js/battle.js).

Nguồn (Resources trong data.unity3d, đọc qua ProEnv):
  attackanimations/<tên>      prefab: UITexture (khung hiển thị w,h + uvRect + Texture2D) + AnimateMove2
                               (float số khung, int, int, float ms mỗi khung, ...)
  attackanimations/new/<tên>  prefab: SheetAni (PPtr UITexture, số khung, số cột, khung nguồn w,h, giây mỗi khung, số hàng)
  pokeballs/{closed,open,hand}/<itemId>_<kiểu>   ảnh bóng; itemId → tên qua json/itemdesc
  json/moveanimations         tên chiêu có hoạt ảnh (để khớp tên prefab → id Showdown)

Không có typetree cho MonoBehaviour (IL2CPP), nên đọc byte thô sau phần đầu 32 byte. Vị trí trường
đo bằng cách so nhiều prefab (Ember 16 khung 570×405 lưới 7 cột; Tackle 8 khung 250×256 dải ngang).

Hậu tố _foe/_user (hoặc foe/user) = phía hoạt ảnh diễn ra: emberuser vẽ quả cầu lửa bay xuống Pokémon
phía mình (trái-dưới), barrier_foe hiện 92 px (cỡ sprite đối thủ) còn barrier_user 160 px. Vài cặp
(thunderbolt) dùng chung một ảnh cho cả hai phía — giữ nguyên như bản gốc.

Ra:  art/pro/anim/<khoá>.png   khung xếp lưới, tối đa 2048 px mỗi chiều (thu nhỏ nếu cần)
     art/pro/ball/<bóng>_{closed,open,hand}.png
     data/pro-anim.js          P1.PRO_ANIM = { moves, status, weather, balls, typeFallback }

Chạy:  PYTHONIOENCODING=utf-8 python tools/pro/rip_battle.py
"""
import json, math, os, re, struct, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pro_env import ProEnv

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_ANIM = os.path.join(GAME, 'art', 'pro', 'anim')
OUT_BALL = os.path.join(GAME, 'art', 'pro', 'ball')
OUT_JS = os.path.join(GAME, 'data', 'pro-anim.js')
MAX_SIDE = 2048
SCENE = (570, 400)

# Tên prefab không khớp thẳng tên chiêu.
ALIAS = {'hydro': 'hydropump', 'tspikes': 'toxicspikes'}
STATUS = {'par': 'par', 'slp': 'slp', 'psn': 'psn'}
WEATHER = {'battlerain': 'RainDance', 'battlesun': 'SunnyDay', 'battlesand': 'Sandstorm', 'battleharshsun': 'DesolateLand'}
# zmove: không có Z-Move. *room: chiêu hiếm, mỗi ảnh ~2.5 MB. spikes/stealthrock/tspikes là hệ hạt, không phải dải ảnh.
SKIP = {'zmove', 'magic room', 'trick room', 'wonder room'}
# uvRect để trống (absorb, megadrain, shadowclaw): dùng khung chuẩn 570×405 trên ảnh 4096×2048 như Ember.
STD_UV = (570 / 4096, 405 / 2048)

# Hệ → chiêu có hoạt ảnh dùng thay cho chiêu cùng hệ chưa có hoạt ảnh (chọn tay theo hình).
TYPE_FALLBACK = {
    'normal': 'tackle', 'fire': 'ember', 'water': 'watergun', 'electric': 'thundershock', 'grass': 'absorb',
    'ice': 'icebeam', 'fighting': 'karatechop', 'poison': 'poisonsting', 'psychic': 'psychocut',
    'ghost': 'shadowclaw', 'dark': 'bite', 'flying': 'aeroblast',
}

# Khoá bóng của engine (P1.BALLS) + các bóng chuẩn khác của game gốc.
BALL_KEYS = ['pokeball', 'greatball', 'ultraball', 'masterball', 'premierball', 'cherishball', 'healball', 'friendball',
             'luxuryball', 'netball', 'nestball', 'quickball', 'timerball', 'duskball', 'levelball', 'diveball',
             'dreamball', 'fastball', 'heavyball', 'loveball', 'lureball', 'moonball', 'sportball', 'repeatball',
             'safariball', 'parkball', 'beastball']


def to_id(s):
    return re.sub(r'[^a-z0-9]', '', s.lower().replace('é', 'e'))


def words(raw):
    n = len(raw) // 4
    return struct.unpack('<%di' % n, raw[:n * 4]), struct.unpack('<%df' % n, raw[:n * 4])


def mono(o):
    """(tên lớp, ints, floats) của một MonoBehaviour, bỏ 32 byte đầu (GameObject, Enabled, Script, Name rỗng)."""
    mb = o.read(check_read=False)
    raw = o.get_raw_data()[32:]
    i, f = words(raw)
    return mb.m_Script.read().m_ClassName, i, f


def components(e, go):
    for c in go.read().m_Component:
        o = (c.component if hasattr(c, 'component') else c).deref()
        if o.type.name == 'MonoBehaviour':
            yield mono(o)


def ui_texture(e, ints, floats):
    """UITexture: khung hiển thị (int 26,27), uvRect (float 44..47), Texture2D (PPtr ở int 48, pathID int 49)."""
    tex = e.res[ints[49]].read()
    return {'show': (ints[26], ints[27]), 'uv': floats[44:48], 'tex': tex}


def frames_of(img, fw, fh, count, cols):
    out = []
    for k in range(count):
        x, y = (k % cols) * fw, (k // cols) * fh
        out.append(img.crop((x, y, x + fw, y + fh)))
    return out


def pack(frames, key):
    """Xếp lưới ≤ 2048 px; thu nhỏ khung khi cần. Trả (tệp, số cột, khung w,h trong ảnh)."""
    fw, fh = frames[0].size
    n = len(frames)
    scale = 1.0
    while True:
        w, h = max(1, round(fw * scale)), max(1, round(fh * scale))
        cols = max(1, min(n, MAX_SIDE // w))
        rows = math.ceil(n / cols)
        if rows * h <= MAX_SIDE:
            break
        scale *= 0.75
    sheet = Image.new('RGBA', (cols * w, rows * h), (0, 0, 0, 0))
    for k, fr in enumerate(frames):
        if scale != 1.0:
            fr = fr.resize((w, h), Image.LANCZOS)
        sheet.paste(fr, ((k % cols) * w, (k // cols) * h))
    name = re.sub(r'[^a-z0-9_]', '_', key) + '.png'
    # Bảng 256 màu: hạt/tia sáng không mất gì thấy được, tệp nhỏ đi ~4-5 lần (surf 1.2 MB → 0.26 MB).
    sheet.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(os.path.join(OUT_ANIM, name), optimize=True)
    return 'art/pro/anim/' + name, cols, w, h



def split_name(n):
    m = re.match(r'^(.*?)[ _]?(foe|user)$', n)
    return (m.group(1), m.group(2)) if m else (n, None)


def main():
    os.makedirs(OUT_ANIM, exist_ok=True)
    os.makedirs(OUT_BALL, exist_ok=True)
    e = ProEnv()
    known = {to_id(k): k for k in json.loads(e.text('json/moveanimations'))}

    moves, status, weather, report, packed = {}, {}, {}, [], {}
    prefabs = [('attackanimations/' + n, n) for n in e.listdir('attackanimations')] + \
              [('attackanimations/new/' + n, n) for n in e.listdir('attackanimations/new')]
    bases_with_variant = {split_name(n)[0] for _, n in prefabs if split_name(n)[1]}
    for path, n in prefabs:
        base, side = split_name(n)
        if base in SKIP:
            continue
        comps = {cls: (i, f) for cls, i, f in components(e, e.obj(path))}
        if 'SheetAni' in comps:
            i, f = comps['SheetAni']
            ut = e.res[i[1]]
            _, ui, uf = mono(ut)
            t = ui_texture(e, ui, uf)
            count, cols, fw, fh, dt = i[3], max(1, i[4]), i[5], i[6], f[7]
            if cols == 0:
                continue
        elif 'AnimateMove2' in comps and 'UITexture' in comps:
            i, f = comps['AnimateMove2']
            ui, uf = comps['UITexture']
            t = ui_texture(e, ui, uf)
            tw, th = t['tex'].image.size
            # uvRect của UITexture, hoặc cỡ khung lưu trong AnimateMove2 (float 4,5) khi uvRect còn trống.
            uw, uh = (t['uv'][2] or f[4] or STD_UV[0]), (t['uv'][3] or f[5] or STD_UV[1])
            if not (uw > 0 and uh > 0):
                report.append('skip %s: không đọc được cỡ khung %s %s' % (n, t['uv'], f[4:6]))
                continue
            fw, fh = round(uw * tw), round(uh * th)
            count, dt = int(round(f[0])), f[3] / 1000.0
            cols = max(1, tw // fw)
        elif 'AnimateMove' in comps and 'UITexture' in comps:
            # Bản cũ: float số khung, float ms mỗi khung, float uv rộng; dải ngang một hàng.
            i, f = comps['AnimateMove']
            ui, uf = comps['UITexture']
            t = ui_texture(e, ui, uf)
            tw, th = t['tex'].image.size
            fw, fh = round((t['uv'][2] or f[2]) * tw), round((t['uv'][3] or 1) * th)
            count, dt = int(round(f[0])), f[1] / 1000.0
            cols = max(1, tw // fw)
        else:
            report.append('skip %s: %s' % (n, list(comps)))
            continue
        img = t['tex'].image.convert('RGBA')
        frames = frames_of(img, fw, fh, count, cols)
        # Khung trống cuối dải (ảnh gốc hay chừa) bỏ đi để hoạt ảnh không đứng im.
        while len(frames) > 1 and frames[-1].getbbox() is None:
            frames.pop()
        show = t['show']
        place = 'scene' if show[0] >= SCENE[0] else 'target'
        if not side:
            side = 'user' if base in bases_with_variant else 'target'
        key = n.replace(' ', '_')
        sig = (t['tex'].m_Name, fw, fh, count, cols)
        if sig not in packed:
            packed[sig] = pack(frames, key)
        img_path, pcols, pw, ph = packed[sig]
        anim = {'img': img_path, 'frames': len(frames), 'cols': pcols, 'fw': pw, 'fh': ph,
                'w': show[0], 'h': show[1], 'fps': round(1.0 / dt, 2) if dt > 0 else 12, 'on': side, 'place': place}
        report.append('%-22s %-7s %-6s %2d khung %4dx%-4d hiện %dx%d fps %.1f' % (n, place, side, len(frames), fw, fh, show[0], show[1], anim['fps']))
        if base in STATUS:
            status[STATUS[base]] = anim
        elif base in WEATHER:
            weather[WEATHER[base]] = anim
        else:
            mid = ALIAS.get(to_id(base), to_id(base))
            if mid not in known:
                report.append('  (chiêu %s không có trong json/moveanimations)' % mid)
            moves.setdefault(mid, []).append(anim)

    items = json.loads(e.text('json/itemdesc'))
    have = set(e.listdir('pokeballs/closed'))
    ball_ids = {}
    for k, v in items.items():
        if (k + '_closed') in have:
            ball_ids.setdefault(to_id(v.get('name', '')), k)
    balls = {}
    for key in BALL_KEYS:
        iid = ball_ids.get(key)
        if not iid:
            report.append('ball %s: không có ảnh (itemId %s)' % (key, iid))
            continue
        entry = {}
        for kind in ('closed', 'open', 'hand'):
            im = e.image('pokeballs/%s/%s_%s' % (kind, iid, kind))
            fn = '%s_%s.png' % (key, kind)
            im.save(os.path.join(OUT_BALL, fn), optimize=True)
            entry[kind] = 'art/pro/ball/' + fn
            entry[kind + 'Size'] = list(im.size)
        balls[key] = entry

    fallback = {t: m for t, m in TYPE_FALLBACK.items() if m in moves}
    data = {'moves': moves, 'status': status, 'weather': weather, 'balls': balls, 'typeFallback': fallback}
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/pro/rip_battle.py — đừng sửa tay. Hoạt ảnh chiêu và bóng của PRO cho trận 2D.\n')
        fh.write('// moves[id] = [{img, frames, cols, fw, fh (khung trong ảnh), w, h (cỡ hiện, px sân 570×400), fps,\n')
        fh.write("//              on: 'foe'|'user'|'target' (phía diễn), place: 'scene' (phủ sân) | 'target' (đặt lên Pokémon)}]\n")
        fh.write('window.P1 = window.P1 || {};\nP1.PRO_ANIM = ')
        fh.write(json.dumps(data, ensure_ascii=False, indent=1))
        fh.write(';\n')
    print('\n'.join(report))
    print('moves %d, status %d, weather %d, balls %d' % (len(moves), len(status), len(weather), len(balls)))


if __name__ == '__main__':
    main()
