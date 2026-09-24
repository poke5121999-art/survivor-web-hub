# -*- coding: utf-8 -*-
"""Rút art + anim + VFX + UI + tiếng của QUÁN SUSHI cho Hố Xanh, thẳng từ bản cài Steam của Dave the Diver.

Chạy lại bao nhiêu lần cũng ra cùng một bộ tệp:
    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_bar.py              # tất cả
    python games/ho-xanh/tools/rip_bar.py room chars   # chỉ vài phần (room chars dishes ui audio)
Ra: art/bar/**, audio/bar_*.mp3, data/bar_assets.js (window.HX_BAR_ASSETS).
Cần bảng tra bundle mà tools/rip.py đã đệm (%TEMP%/ho-xanh-rip/bundle_index.json).

Nguyên tắc: mọi hình, khung, thời lượng khung, đường cong UI, tham số hạt đều đọc từ tệp gốc.
Không vẽ thêm, không nội suy khung. Thứ gì game gốc không có thì ghi vào `missing` của manifest.
"""
import gc, io, json, math, os, re, shutil, struct, subprocess, sys, zlib

sys.dont_write_bytecode = True  # khỏi để lại __pycache__ trong cây game
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rip  # noqa: E402  (dùng bundle_index / with_deps / objects_for; KHÔNG sửa rip.py)
from PIL import Image  # noqa: E402

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art', 'bar')
AUD = os.path.join(GAME, 'audio')
DATA = os.path.join(GAME, 'data')
OUT_JS = os.path.join(DATA, 'bar_assets.js')
PARTS = os.path.join(rip.CACHE, 'bar_parts')
PC = rip.PC
SUSHI = PC + 'SushiBar/'
SCENE = 'Assets/Scenes/InGame/DR_SushiBar.unity'
SHEET = 'Assets/AssetBundleResources/GameDataSheet/%s.json'

# 1 đơn vị Unity = 100 px sprite gốc, mọi thứ trong quán đặt scale 2 → 1 đơn vị = 50 px ảnh ra.
PPU = 100
PX_PER_UNIT = 50

IDX = CABS = None


def init():
    global IDX, CABS
    ix = rip.bundle_index()
    IDX, CABS = ix['path'], ix['cab']
    rip.IDX, rip.CABS = IDX, CABS


# ================================================================ unity helpers
_DEPS = {}


def with_deps(bundle, fn):
    """Như rip.with_deps nhưng bỏ env cũ mỗi lần nạp thêm phụ thuộc.
    Bẫy đã sập: rip.with_deps đệm MỌI tổ hợp (bundle, deps) trong rip._ENVS; prefab UI kéo theo ~20 bundle
    (font, atlas) nên đệm phình tới MemoryError. Object đã đọc vẫn giữ env của nó nên xoá đệm là an toàn."""
    deps = set(_DEPS.get(bundle, ()))  # nhớ phụ thuộc đã biết của bundle: prefab sau cùng bundle khỏi dò lại từ đầu
    while True:
        rip._ENVS.clear()
        gc.collect()
        try:
            out = fn(rip.env_of(bundle, deps))
            _DEPS[bundle] = deps
            return out
        except FileNotFoundError as e:
            m = re.search(r'(cab-[0-9a-f]+)', str(e), re.I)
            cab = m.group(1).lower() if m else None
            if not cab or cab not in CABS or CABS[cab] in deps or CABS[cab] == bundle:
                raise
            deps.add(CABS[cab])


def in_env(path, fn):
    """fn(env) với bundle chứa path + mọi bundle phụ thuộc cần tới (nạp dần khi gặp FileNotFoundError)."""
    return with_deps(IDX[path], fn)


def container(env, path, type_name=None):
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k == path and (type_name is None or ptr.asset.type.name == type_name):
                    return ptr.asset
    return None


def script_name(mb):
    """Tên lớp C# của MonoBehaviour. FileNotFoundError phải nổi lên để with_deps nạp bundle MonoScript."""
    try:
        return mb.m_Script.read().m_ClassName
    except FileNotFoundError:
        raise
    except Exception:
        return None


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ('Transform', 'RectTransform'):
            return c.component.read()


def children(go):
    return [ch.read().m_GameObject.read() for ch in transform_of(go).m_Children]


def trs(t):
    """Ma trận 3x3 (2D affine) từ Transform, bỏ trục z; góc quay chỉ lấy quanh trục z."""
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    ang = 2 * math.atan2(q.z, q.w) if abs(q.x) < 1e-6 and abs(q.y) < 1e-6 else 0.0
    c, n = math.cos(ang), math.sin(ang)
    return [[c * s.x, -n * s.y, p.x], [n * s.x, c * s.y, p.y], [0, 0, 1]], p.z


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def world(t, cache):
    key = (t.assets_file.name, t.object_reader.path_id)
    if key not in cache:
        m, z = trs(t)
        if t.m_Father.m_PathID:
            pm, pz = world(t.m_Father.read(), cache)
            m, z = mul(pm, m), pz + z
        cache[key] = (m, z)
    return cache[key]


def r3(v):
    return round(float(v), 3)


def load_sheet(name):
    ta = [o for o in rip.objects_for(SHEET % name) if type(o).__name__ == 'TextAsset'][0]
    parts = rip.text_bytes(ta).decode('utf-8-sig').split('@/')
    return {parts[i].strip(): json.loads(parts[i + 1]) for i in range(0, len(parts) - 1, 2)}


# ================================================================ sprites -> ảnh
def sprite_full(s):
    """Ảnh RGBA đúng khung m_Rect của sprite (bù phần atlas đã cắt viền) + pivot tính bằng px từ góc trên-trái."""
    img = s.image.convert('RGBA')
    W, H = int(round(s.m_Rect.width)), int(round(s.m_Rect.height))
    if img.size != (W, H):
        ox, oy = s.m_RD.textureRectOffset.x, s.m_RD.textureRectOffset.y
        can = Image.new('RGBA', (W, H))
        can.paste(img, (int(round(ox)), H - int(round(oy)) - img.height))
        img = can
    return img, (s.m_Pivot.x * W, (1 - s.m_Pivot.y) * H)


def save_png(img, rel):
    p = os.path.join(ART, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    return 'art/bar/' + rel


def build_sheet(frames, rel, cols=16):
    """frames: [(tên, ảnh, (px, py))] theo thứ tự. Mọi khung cùng một ô, pivot trùng một điểm neo.
    -> {sheet, cell, anchor, cols, index{tên: ô}}."""
    L = max(p[0] for _, _, p in frames)
    T = max(p[1] for _, _, p in frames)
    R = max(im.width - p[0] for _, im, p in frames)
    B = max(im.height - p[1] for _, im, p in frames)
    ax, ay = int(math.ceil(L)), int(math.ceil(T))
    cw, ch = ax + int(math.ceil(R)), ay + int(math.ceil(B))
    cols = min(cols, len(frames))
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGBA', (cw * cols, ch * rows))
    index = {}
    for i, (name, im, p) in enumerate(frames):
        c, r = i % cols, i // cols
        sheet.alpha_composite(im, (c * cw + int(round(ax - p[0])), r * ch + int(round(ay - p[1]))))
        index[name] = i
    return {'sheet': save_png(sheet, rel), 'cell': [cw, ch], 'anchor': [ax, ay], 'cols': cols, 'count': len(frames)}, index


# ================================================================ AnimationClip
def streamed_keys(data):
    """StreamedClip: chuỗi khung (time f32, số khoá u32, [chỉ số curve u32, hệ số a b c d f32])."""
    raw = struct.pack('<%dI' % len(data), *data)
    i, out = 0, []
    while i + 8 <= len(raw):
        t, n = struct.unpack_from('<fI', raw, i)
        i += 8
        keys = []
        for _ in range(n):
            keys.append(struct.unpack_from('<I4f', raw, i))
            i += 20
        out.append((t, keys))
    return out


# Tên thuộc tính hay gặp trong clip Mecanim: binding chỉ giữ CRC32 của tên, nên dò ngược bằng bảng này.
ATTR_NAMES = ['m_Color.r', 'm_Color.g', 'm_Color.b', 'm_Color.a', 'm_Alpha', 'm_IsActive', 'm_Enabled',
              'm_AnchoredPosition.x', 'm_AnchoredPosition.y', 'm_SizeDelta.x', 'm_SizeDelta.y',
              'm_AnchorMin.x', 'm_AnchorMin.y', 'm_AnchorMax.x', 'm_AnchorMax.y', 'm_Pivot.x', 'm_Pivot.y',
              'm_LocalPosition.z', 'm_FillAmount', 'm_fontSize', 'm_fontColor.r', 'm_fontColor.g', 'm_fontColor.b',
              'm_fontColor.a', 'm_Sprite', 'm_FlipX', 'm_FlipY', 'm_SortingOrder', 'material._Color.a',
              'material._Color.r', 'material._Color.g', 'material._Color.b', 'm_Intensity', 'm_Size.x', 'm_Size.y',
              'm_Offset.x', 'm_Offset.y', 'm_Speed', 'm_UVRect.x', 'm_UVRect.y', 'm_UVRect.width', 'm_UVRect.height',
              'material._MainTex_ST.z', 'material._MainTex_ST.w', 'material._Emission', 'm_Volume', 'm_Pitch']
ATTR_CRC = {zlib.crc32(n.encode()): n for n in ATTR_NAMES}
TRANSFORM_ATTR = {1: ('localPosition', 'xyz'), 2: ('localRotation', 'xyzw'), 3: ('localScale', 'xyz'), 4: ('localEulerAngles', 'xyz')}


def clip_by_path(path):
    def go(env):
        a = container(env, path, 'AnimationClip')
        if a is None:
            return None
        c = a.read()
        return decode_clip(c)
    return in_env(path, go)


def decode_clip(c, path_names=None):
    """-> {name, rate, length, loop, legacy, sprites:[(t, Sprite)], curves:[...], events:[...]}.
    Clip legacy (component Animation) giữ đường cong gốc có tên; clip Mecanim chỉ có hệ số đã nén."""
    mc = c.m_MuscleClip
    clip = mc.m_Clip.data if hasattr(mc.m_Clip, 'data') else mc.m_Clip
    out = {'name': c.m_Name, 'rate': r3(c.m_SampleRate), 'length': r3(mc.m_StopTime - mc.m_StartTime),
           'loop': bool(mc.m_LoopTime), 'legacy': bool(c.m_Legacy), 'sprites': [], 'curves': [],
           'events': [{'t': r3(e.time), 'fn': e.functionName} for e in c.m_Events]}
    if c.m_Legacy:
        out['length'] = r3(max([k.time for cv in list(c.m_FloatCurves) + list(c.m_PositionCurves) + list(c.m_ScaleCurves)
                                + list(c.m_EulerCurves) for k in cv.curve.m_Curve] or [0]))
        for kind, lst, comps in (('localPosition', c.m_PositionCurves, 'xyz'), ('localScale', c.m_ScaleCurves, 'xyz'),
                                 ('localEulerAngles', c.m_EulerCurves, 'xyz')):
            for cv in lst:
                for ax in comps[:2] if kind != 'localEulerAngles' else 'z':
                    keys = [[r3(k.time), r3(getattr(k.value, ax)), r3(getattr(k.inSlope, ax)), r3(getattr(k.outSlope, ax))]
                            for k in cv.curve.m_Curve]
                    out['curves'].append({'path': cv.path, 'attr': '%s.%s' % (kind, ax), 'keys': keys})
        for cv in c.m_FloatCurves:
            keys = [[r3(k.time), r3(k.value), r3(k.inSlope) if abs(k.inSlope) < 1e9 else 'step',
                     r3(k.outSlope) if abs(k.outSlope) < 1e9 else 'step'] for k in cv.curve.m_Curve]
            out['curves'].append({'path': cv.path, 'attr': cv.attribute, 'classID': cv.classID, 'keys': keys})
        for cv in c.m_PPtrCurves:
            out['sprites'] += [(k.time, k.value.read()) for k in cv.curve]
        return out
    # --- Mecanim: gán chỉ số curve cho từng binding theo thứ tự
    binds = list(c.m_ClipBindingConstant.genericBindings)
    fl, pp = [], []
    for b in binds:
        if b.isPPtrCurve:
            pp.append(b)
        elif b.typeID == 4 and b.attribute in TRANSFORM_ATTR:
            kind, comps = TRANSFORM_ATTR[b.attribute]
            fl += [(b, '%s.%s' % (kind, a)) for a in comps]
        else:
            fl.append((b, ATTR_CRC.get(b.attribute, 'crc:%d' % b.attribute)))
    ns = clip.m_StreamedClip.curveCount
    nd = clip.m_DenseClip.m_CurveCount
    per = {}  # chỉ số curve -> [[t, v, a, b, c]]
    pptr_keys = []
    for t, keys in streamed_keys(clip.m_StreamedClip.data):
        for idx, a, b_, c_, d in keys:
            t0 = max(t, 0.0)
            if idx < ns:
                per.setdefault(idx, []).append([r3(t0), r3(d), r3(c_), r3(b_), r3(a)])
            else:
                pptr_keys.append((t0, int(d)))
    dc = clip.m_DenseClip
    for f in range(dc.m_FrameCount):
        for j in range(nd):
            per.setdefault(ns + j, []).append([r3(dc.m_BeginTime + f / dc.m_SampleRate), r3(dc.m_SampleArray[f * nd + j])])
    for j, v in enumerate(clip.m_ConstantClip.data):
        per.setdefault(ns + nd + j, []).append([0.0, r3(v)])
    for i, (b, attr) in enumerate(fl):
        if i in per:
            keys = per[i]
            # khung đầu của StreamedClip nằm ở t = -FLT_MAX (trạng thái trước clip); nếu ngay sau có khoá t=0 thì bỏ
            if len(keys) > 1 and keys[0][0] == 0.0 and keys[1][0] == 0.0:
                keys = keys[1:]
            # streamed: khoá cuối (t=+inf) đã bỏ; mỗi khoá kèm hệ số bậc ba (c,b,a) của đoạn tới khoá kế
            out['curves'].append({'path': (path_names or {}).get(b.path, b.path), 'attr': attr, 'typeID': b.typeID,
                                  'keys': keys})
    # PPtr (đổi sprite): chỉ số key trỏ vào pptrCurveMapping
    mapping = list(c.m_ClipBindingConstant.pptrCurveMapping)
    if pp:
        # khi clip chỉ có PPtr thì curveCount = 0 và chỉ số curve của khoá = 0
        raw = [(t, v) for t, keys in streamed_keys(clip.m_StreamedClip.data) for idx, a, b_, c_, v in keys
               if idx >= ns or not fl] if not pptr_keys else pptr_keys
        seen = set()
        for t, v in raw:
            t = max(t, 0.0)
            if (t, v) in seen:
                continue
            seen.add((t, v))
            s = mapping[int(v)].read()
            s.image  # nạp texture/atlas trong env có phụ thuộc
            out['sprites'].append((t, s))
    return out


def frame_list(dec, name_of=lambda s: s.m_Name):
    """Khoá sprite -> [(tên, ms)]. Thời lượng = khoảng tới khoá kế; khung cuối kéo tới hết clip.
    Hai khoá liền nhau cùng sprite thì gộp."""
    ks = sorted(dec['sprites'], key=lambda k: k[0])
    out = []
    for i, (t, s) in enumerate(ks):
        t1 = ks[i + 1][0] if i + 1 < len(ks) else max(dec['length'], t + 1.0 / dec['rate'])
        n = name_of(s)
        ms = (t1 - t) * 1000
        if out and out[-1][0] == n:
            out[-1][1] += ms
        else:
            out.append([n, ms])
    return [[n, int(round(ms))] for n, ms in out if ms > 0.5]


# ================================================================ nhân vật
def clip_paths(prefix):
    return sorted(k for k in IDX if k.startswith(prefix) and k.endswith('.anim'))


def char_from_clips(key, paths, rename, extra_sprites=(), outrel=None):
    """Dave / Bancho / mèo: sprite lấy thẳng từ pptrCurveMapping của clip."""
    anims, sprites, order = {}, {}, []
    for p in paths:
        dec = clip_by_path(p)
        if not dec or not dec['sprites']:
            continue
        fl = frame_list(dec)
        for t, s in dec['sprites']:
            if s.m_Name not in sprites:
                sprites[s.m_Name] = s
                order.append(s.m_Name)
        anims[rename(dec['name'])] = {'clip': dec['name'], 'rate': dec['rate'], 'loop': dec['loop'], 'frames': fl,
                                      'events': dec['events']}
    for s in extra_sprites:
        if s.m_Name not in sprites:
            sprites[s.m_Name] = s
            order.append(s.m_Name)
    frames = [(n,) + sprite_full(sprites[n]) for n in order]
    sheet, index = build_sheet(frames, outrel or '%s/%s.png' % (key, key))
    for a in anims.values():
        a['frames'] = [[index[n], ms] for n, ms in a['frames']]
    s0 = sprites[order[0]]
    sheet.update({'ppu': s0.m_PixelsToUnits, 'frameNames': order, 'anims': anims})
    return sheet


def sprites_in_bundle(path, pred):
    def go(env):
        out = {}
        for o in env.objects:
            if o.type.name == 'Sprite':
                s = o.read()
                if pred(s.m_Name):
                    s.image  # atlas có thể nằm ở bundle khác: đọc ngay khi env còn nạp phụ thuộc
                    out[s.m_Name] = s
        return out
    return in_env(path, go)


def prefab_components(path, fn):
    """fn(env, prefab_root_go) trong env có phụ thuộc."""
    def go(env):
        a = container(env, path, 'GameObject')
        return fn(env, a.read())
    return in_env(path, go)


def walk_go(go):
    out, stack = [], [go]
    while stack:
        g = stack.pop()
        out.append(g)
        stack.extend(reversed(children(g)))
    return out


def sorting_order(prefab):
    def go(env, root):
        for g in walk_go(root):
            for c in g.m_Component:
                if c.component.type.name == 'SpriteRenderer':
                    return c.component.read().m_SortingOrder
    return prefab_components(prefab, go)


def rip_dave():
    base = PC + 'Staffs/Dave/'
    paths = [p for p in clip_paths(base + 'Animations/')]

    def rename(n):
        n = re.sub(r'^(Staff_Dave_|Ani_Dave_Sushi_|Ani_Staff_Dave_)', '', n)
        return re.sub(r'_01$', '', n) if not n.startswith('CookClean') else n
    # Sprite có trong thư mục nhưng không clip nào của quán dùng: vẫn đưa vào sheet, không bịa thời lượng.
    loose = sprites_in_bundle(base + 'Sprites/Player_Sushi_Basic.png',
                              lambda n: re.match(r'Player_Sushi_(Basic|Surprise|what)', n) is not None)
    out = char_from_clips('dave', paths, rename, [loose[k] for k in sorted(loose)])
    out['unclipped'] = [out['frameNames'].index(k) for k in sorted(loose)]
    out['sortingOrder'] = sorting_order(base + 'Prefabs/Staff_Dave.prefab')
    out['scale'] = 2
    return out


def rip_bancho():
    base = PC + 'Staffs/Bancho/'
    paths = clip_paths(base + 'Animations/') + [PC + 'Common/Animations/Character_Cutscene/Chapter1_Inter/Ani_Bancho_chapter1_inter_Cheers.anim']
    loose = sprites_in_bundle(base + 'Sprites/Bancho_Idle001.png', lambda n: n.startswith('Bancho_Cutscene_Sushi_Surprise'))

    def rename(n):
        return re.sub(r'^(SushiBar_Bancho_|Ani_Bancho_)', '', n)
    out = char_from_clips('bancho', paths, rename, [loose[k] for k in sorted(loose)])
    out['unclipped'] = [out['frameNames'].index(k) for k in sorted(loose)]
    out['sortingOrder'] = sorting_order(base + 'Prefabs/Bancho.prefab')
    out['scale'] = 2
    return out


def rip_cat():
    paths = clip_paths(SUSHI + 'Animations/Cat_momo/')
    out = char_from_clips('cat', paths, lambda n: re.sub(r'^(Ani_SushiBar_Cat_|SushiBar_Cat_)', '', n))
    out['sortingOrder'] = sorting_order(SUSHI + 'Prefabs/cat001.prefab')
    out['scale'] = 2
    # prefab cat001 được sinh lúc chạy, scene không đặt sẵn: chỉ có vị trí gốc của prefab (đơn vị Unity)
    t = prefab_components(SUSHI + 'Prefabs/cat001.prefab', lambda env, root: transform_of(root).m_LocalPosition)
    out['prefabPosUnity'] = [r3(t.x), r3(t.y)]
    return out


CUSTOMER_CLIPS = SUSHI + 'Animations/Customer/Normal/'
COSTUME = SUSHI + 'Sprites/SushibarCustomer_P/SushibarCustomer_Costume/%s/%s_Default.spriteatlas'


def split_name(n):
    m = re.match(r'^(.*?)(\d*)$', n)
    p = m.group(1).rstrip('_').lower().replace('good', 'happy')
    return p, (int(m.group(2)) if m.group(2) else None)


def resolve_costume(tname, spr, subs):
    """Tên sprite thân -> tên sprite áo trong atlas Default của khách. Atlas từng khách đặt tên lệch nhau
    (Wait01 / Wait001 / wait, Good / Happy, Back_Good / Back_Happy): khớp theo tiền tố không phân biệt hoa
    thường + số. Thiếu số nào thì lấy số gần nhất nhỏ hơn và ghi vào substitutions [ĐỀ XUẤT]."""
    if tname in spr:
        return tname
    p, n = split_name(tname)
    same = sorted((split_name(k)[1] or 0, k) for k in spr if split_name(k)[0] == p)
    if not same:
        return None
    for num, k in same:
        if split_name(k)[1] == n or (split_name(k)[1] is None and len(same) == 1):
            return k
    lower = [k for num, k in same if num <= (n or 0)]
    k = lower[-1] if lower else same[0][1]
    subs[tname] = k
    return k


def controller_pairs(ctrl_ptr):
    """[(tên clip gốc trong CustomerAnimator, clip thật)] — AnimatorOverrideController thay từng clip."""
    ctrl = ctrl_ptr.read()
    if type(ctrl).__name__ == 'AnimatorOverrideController':
        over = {o.m_OriginalClip.m_PathID: o.m_OverrideClip for o in ctrl.m_Clips if o.m_OverrideClip.m_PathID}
        out = []
        for c in ctrl.m_Controller.read().m_AnimationClips:
            base = c.read()
            out.append((base.m_Name, over[c.m_PathID].read() if c.m_PathID in over else base))
        return ctrl.m_Name, out
    return ctrl.m_Name, [(c.read().m_Name, c.read()) for c in ctrl.m_AnimationClips]


def rip_customers():
    """Khách thường của Hố Xanh (NPC.Customer: Type Normal, SubType Default, ZoneType Bluehole).
    Mỗi khách = 2 lớp: thân ('Customer', clip của AnimatorOverrideController riêng từng khách, sprite trong
    CustomerAtlas_Basic_Point) + áo ('Costume', atlas <khách>_Default, đổi theo tên sprite thân).
    Bẫy đã sập: lần đầu chỉ lấy atlas Default -> khách mất đầu, chỉ còn bộ quần áo. Ở đây hai lớp được
    ghép sẵn (áo đè lên thân, cùng pivot) thành một sheet."""
    sheet_data = load_sheet('DR_GameData_NPC')
    rows = [r for r in sheet_data['Customer'] if r['Type'] == 'Normal' and r['SubType'] == 'Default'
            and r['ZoneType'] == 'Bluehole']
    eat = {r['Level']: r for r in sheet_data['CustomerEat']}
    talks = {r['TID']: r for r in sheet_data['CustomerToastTalk']}
    out, missing = [], []
    for row in sorted(rows, key=lambda r: r['Prefab']):
        cid = row['Prefab']
        prefab = SUSHI + 'Prefabs/Customer/%s.prefab' % cid
        if prefab not in IDX:
            missing.append({'what': 'customer', 'id': cid, 'why': 'không có prefab'})
            continue
        cos_path = COSTUME % (cid, cid)
        costume = sprites_in_bundle(cos_path, lambda n: True) if cos_path in IDX else {}

        def go(env, root):
            info, body_anims, body = None, {}, {}
            for g in walk_go(root):
                for c in g.m_Component:
                    tn = c.component.type.name
                    if tn == 'MonoBehaviour' and script_name(c.component.read()) == 'SushiBarCustomer':
                        t = c.component.read_typetree()
                        info = {k: t[k] for k in ('backLayerOrder', 'frontLayerOrder', 'frontInteractionAnchor', 'sittingPose')}
                    if tn == 'Animator' and g.m_Name == 'Customer':
                        cname, pairs = controller_pairs(c.component.read().m_Controller)
                        for base, clip in pairs:
                            if 'VIP' in base:  # VIP_Master_Cocktail: sprite chung của DLC, không phải của khách
                                continue
                            dec = decode_clip(clip)
                            if not dec['sprites']:
                                continue
                            for _, s in dec['sprites']:
                                body.setdefault(s.m_Name, s)
                            body_anims[re.sub(r'^Customer_', '', base).lower()] = (dec, frame_list(dec), clip.m_Name)
            return info, body_anims, body
        info, body_anims, body = prefab_components(prefab, go)
        subs, names, frames, anims = {}, [], [], {}
        for an, (dec, fl, clipname) in sorted(body_anims.items()):
            for n, _ in fl:
                if n not in names:
                    names.append(n)
            anims[an] = {'clip': clipname, 'rate': dec['rate'], 'loop': dec['loop'], 'frames': fl}
        cos_used = {}
        for n in names:
            img, piv = sprite_full(body[n])
            k = resolve_costume(n, costume, subs) if costume else None
            if k:
                cimg, cp = sprite_full(costume[k])
                can = Image.new('RGBA', img.size)
                can.alpha_composite(img)
                can.alpha_composite(cimg, (int(round(piv[0] - cp[0])), int(round(piv[1] - cp[1]))))
                img = can
                cos_used[n] = k
            elif costume:
                missing.append({'what': 'customer costume frame', 'id': cid, 'frame': n, 'why': 'atlas Default không có'})
            frames.append((n, img, piv))
        sheet, index = build_sheet(frames, 'customers/%s.png' % cid, cols=12)
        for a in anims.values():
            a['frames'] = [[index[n], ms] for n, ms in a['frames']]
        talk = talks.get(row.get('ToastTalkID'))
        sheet.update({'id': cid, 'frameNames': names, 'anims': anims, 'ppu': PPU, 'scale': 2, 'layer': info,
                      'costume': 'Default' if costume else None, 'costumeFrames': len(cos_used),
                      'substitutions': subs or None,
                      'data': {k: row[k] for k in ('TID', 'EatLevel', 'EnterSpeed', 'ExitSpeed', 'AngryExitSpeed',
                                                   'ThrowTrashChance', 'PreOrderDrinkChance', 'OrderDrinkChance',
                                                   'OrderDrinkRatioList', 'SittingPose') if k in row},
                      'talk': {kk: [en(x) for x in talk[kk]] for kk in ('WatingTalkIDList', 'AngryTalkIDList', 'EatingTalkIDList')}
                      if talk else None})
        out.append(sheet)
        print('  khách %-14s %2d khung, áo %2d, anim: %s%s' % (cid, len(names), len(cos_used), ','.join(sorted(anims)),
                                                             '  thay: %s' % subs if subs else ''))
    return out, {str(k): v for k, v in sorted(eat.items())}, missing


# ================================================================ phòng (quán ban đêm)
def rip_room():
    """Dựng lại quán đêm từ chính scene DR_SushiBar: cây Sushi_BG_Night_Re + ghế + chỗ ngồi + Bancho.
    Mọi SpriteRenderer đang bật được đặt vào một hệ px chung (50 px / đơn vị, y xuống dưới).
    Cả hàm chạy trong env của scene: gặp CAB thiếu thì with_deps nạp thêm bundle rồi chạy lại từ đầu."""
    return in_env(SCENE, _room)


def _room(env):
    shutil.rmtree(os.path.join(ART, 'room'), ignore_errors=True)
    res = {}
    if True:
        cache = {}
        gos = [o.read() for o in env.objects if o.type.name == 'GameObject']
        by_name = {}
        for g in gos:
            by_name.setdefault(g.m_Name, []).append(g)
        night = [g for g in by_name['Sushi_BG_Night_Re']][0]
        seat_root = [g for g in by_name['SeatRoot'] if world(transform_of(g), cache)[0][0][2] > -500][0]
        pieces, props, seats = [], [], []

        def active_below(g, stop):
            while g is not None and g.m_Name != stop:
                if not g.m_IsActive:
                    return False
                t = transform_of(g)
                g = t.m_Father.read().m_GameObject.read() if t.m_Father.m_PathID else None
            return True

        def animated(g):
            for c in g.m_Component:
                if c.component.type.name == 'Animator':
                    return c.component.read()
            return None

        def collect(root, stop, group):
            for g in walk_go(root):
                if not active_below(g, stop):
                    continue
                for c in g.m_Component:
                    if c.component.type.name != 'SpriteRenderer':
                        continue
                    r = c.component.read()
                    if not r.m_Enabled or not r.m_Sprite.m_PathID:
                        continue
                    # Animator ở chính nó hoặc ở cha gần (Sushi_Hood_full / base) thì là đồ động
                    anim_go, x = None, g
                    for _ in range(3):
                        if animated(x):
                            anim_go = x
                            break
                        t = transform_of(x)
                        if not t.m_Father.m_PathID:
                            break
                        x = t.m_Father.read().m_GameObject.read()
                    m, z = world(transform_of(g), cache)
                    mat = r.m_Materials[0].read() if r.m_Materials and r.m_Materials[0].m_PathID else None
                    shader, blend = None, None
                    if mat is not None:
                        shader, blend = shader_blend(mat)
                    pieces.append({'go': g, 'name': g.m_Name, 'sprite': r.m_Sprite.read(), 'm': m, 'z': z,
                                   'order': r.m_SortingOrder, 'color': [r3(r.m_Color.r), r3(r.m_Color.g), r3(r.m_Color.b), r3(r.m_Color.a)],
                                   'flip': [bool(r.m_FlipX), bool(r.m_FlipY)], 'group': group,
                                   'material': mat.m_Name if mat else None, 'shader': shader, 'blendf': blend,
                                   'animator': animated(anim_go) if anim_go else None, 'anim_go': anim_go})
        collect(night, night.m_Name, 'interior')
        collect(seat_root, seat_root.m_Name, 'seats')
        # hệ hạt đặt sẵn trong quán (đèn LED biển hiệu, loa, hoa anh đào, bọt bể cá, đốm đèn)
        emitters = []
        pctx = UICtx('room/vfx')
        for g in walk_go(night):
            if not active_below(g, night.m_Name):
                continue
            ps = [c.component for c in g.m_Component if c.component.type.name == 'ParticleSystem']
            if not ps:
                continue
            rend = [c.component for c in g.m_Component if c.component.type.name == 'ParticleSystemRenderer']
            m, _ = world(transform_of(g), cache)
            par = transform_of(g).m_Father.read().m_GameObject.read().m_Name if transform_of(g).m_Father.m_PathID else ''
            emitters.append({'name': g.m_Name, 'parent': par, 'pos': [m[0][2], m[1][2]],
                             'scale': r3(abs(m[0][0])), 'particle': particle(ps[0].read_typetree(), rend[0] if rend else None, pctx)})
        res['emitters'] = emitters
        res['emitterTextures'] = pctx.textures
        # chỗ ngồi
        for g in walk_go(seat_root):
            for c in g.m_Component:
                if c.component.type.name == 'MonoBehaviour' and script_name(c.component.read()) == 'SushiBarTable':
                    tt = c.component.read_typetree()
                    r = c.component.read()

                    def wp(ptr):
                        if not ptr.m_PathID:
                            return None
                        m, _ = world(ptr.read(), cache)
                        return [m[0][2], m[1][2]]
                    seats.append({'name': g.m_Name, 'table': tt['tableNumber'], 'isFront': bool(tt['isFront']),
                                  'pos': [world(transform_of(g), cache)[0][0][2], world(transform_of(g), cache)[0][1][2]],
                                  'sit': wp(r.sitPivot), 'stop': wp(r.stopPosition), 'anchor': wp(r.interactionAnchor),
                                  'noDrinkQTE': bool(tt['m_DoNotDrinkQTE'])})
        marks = {}
        for nm in ('Door', 'StaffRoot', 'Bancho', 'Kitchen', 'Hall', 'SeatRoot', 'LeftWall', 'RightWall', 'Floor'):
            for g in by_name.get(nm, []):
                m, _ = world(transform_of(g), cache)
                if m[0][2] > -500:
                    marks[nm] = [m[0][2], m[1][2]]
                    break
        res.update(pieces=pieces, seats=seats, marks=marks)
    pieces, seats, marks = res['pieces'], res['seats'], res['marks']

    # --- khung px chung
    def quad(p):
        s = p['sprite']
        img, (px, py) = sprite_full(s)
        u = 1.0 / s.m_PixelsToUnits
        corners = []
        for cx, cy in ((0, 0), (img.width, 0), (0, img.height), (img.width, img.height)):
            lx, ly = (cx - px) * u, (py - cy) * u
            m = p['m']
            corners.append((m[0][0] * lx + m[0][1] * ly + m[0][2], m[1][0] * lx + m[1][1] * ly + m[1][2]))
        return img, corners
    for p in pieces:
        p['img'], p['corners'] = quad(p)
    # bỏ gradient bóng trần (scale ~197 lần) khỏi việc tính khung: nó phủ tràn ra ngoài
    core = [p for p in pieces if abs(p['m'][0][0]) < 20]
    minx = min(x for p in core for x, _ in p['corners'])
    maxx = max(x for p in core for x, _ in p['corners'])
    miny = min(y for p in core for _, y in p['corners'])
    maxy = max(y for p in core for _, y in p['corners'])
    W = int(math.ceil((maxx - minx) * PX_PER_UNIT))
    H = int(math.ceil((maxy - miny) * PX_PER_UNIT))

    def to_px(x, y):
        return [round((x - minx) * PX_PER_UNIT, 1), round((maxy - y) * PX_PER_UNIT, 1)]

    def place(p):
        """Ảnh đã phóng (chỉ cho phép phóng theo trục, lấy mẫu gần nhất) + góc trên-trái px."""
        xs = [x for x, _ in p['corners']]
        ys = [y for _, y in p['corners']]
        w = int(round((max(xs) - min(xs)) * PX_PER_UNIT))
        h = int(round((max(ys) - min(ys)) * PX_PER_UNIT))
        img = p['img']
        m = p['m']
        if m[0][0] < 0:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        if m[1][1] < 0:
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
        if p['flip'][0]:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        if p['flip'][1]:
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
        if (w, h) != img.size and w > 0 and h > 0:
            img = img.resize((w, h), Image.NEAREST)
        col = p['color']
        if col[:3] != [1.0, 1.0, 1.0] or col[3] != 1.0:
            import numpy as np
            a = np.asarray(img).astype(np.float32)
            a[..., 0] *= col[0]
            a[..., 1] *= col[1]
            a[..., 2] *= col[2]
            a[..., 3] *= col[3]
            img = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')
        x0, y0 = to_px(min(xs), max(ys))
        return img, int(round(x0)), int(round(y0))

    # --- đồ động (Animator đổi sprite): tách riêng, không in vào lớp tĩnh
    statics, anim_props = [], {}
    for p in pieces:
        if p['animator'] is not None:
            anim_props.setdefault(id(p['anim_go']), []).append(p)
        else:
            statics.append(p)
    props = []
    for k, ps in anim_props.items():
        p = ps[0]
        prop = animated_prop(p, ps, place, to_px)
        if prop:
            props.append(prop)
        else:
            statics.extend(ps)

    # --- lớp tĩnh theo sortingOrder [ĐỀ XUẤT: ranh giới lớp chọn ở đúng chỗ nhân vật chen vào]
    BANDS = [('back', -10000, -2), ('mid', -2, 40), ('kitchen', 40, 140), ('counter', 140, 160),
             ('chairs', 160, 200), ('front', 200, 1000), ('top', 1000, 100000)]
    layers = []
    statics.sort(key=lambda p: (p['order'], -p['z'], p['name']))
    for name, lo, hi in BANDS:
        sel = [p for p in statics if lo <= p['order'] < hi]
        if not sel:
            continue
        # glow cộng sáng (LightCircle, material Additive) tách lớp riêng để game vẽ kiểu 'lighter'
        for blend, subsel in (('normal', [p for p in sel if not is_additive(p)]), ('add', [p for p in sel if is_additive(p)])):
            if not subsel:
                continue
            can = Image.new('RGBA', (W, H))
            for p in subsel:
                img, x, y = place(p)
                tmp = Image.new('RGBA', (W, H))
                tmp.paste(img, (x, y))
                can = Image.alpha_composite(can, tmp)
            bb = can.getbbox()
            if not bb:
                continue
            can = can.crop(bb)
            ln = name if blend == 'normal' else name + '_light'
            bf = sorted({p['blendf'] for p in subsel if is_additive(p)}) or ['alpha']
            layers.append({'name': ln, 'img': save_png(can, 'room/%s.png' % ln), 'x': bb[0], 'y': bb[1],
                           'w': bb[2] - bb[0], 'h': bb[3] - bb[1], 'z': lo if lo > -10000 else -400, 'orders': [lo, hi],
                           'blend': blend, 'unityBlend': bf,
                           'pieces': sorted({'%s (%s)' % (p['name'], p['shader']) for p in subsel})})
    # thứ tự vẽ giữa các lớp: z = sortingOrder thấp nhất của dải (nhân vật dùng sortingOrder gốc của chúng)
    for l in layers:
        if l['blend'] == 'add':
            l['z'] += 0.5
    seats_px = []
    for s in sorted(seats, key=lambda s: s['table']):
        seats_px.append({'table': s['table'], 'isFront': s['isFront'], 'x': to_px(*s['pos'])[0], 'y': to_px(*s['pos'])[1],
                         'sit': to_px(*s['sit']) if s['sit'] else None, 'stop': to_px(*s['stop']) if s['stop'] else None,
                         'anchor': to_px(*s['anchor']) if s['anchor'] else None, 'noDrinkQTE': s['noDrinkQTE'],
                         'name': s['name']})
    emitters = [dict(e, pos=to_px(*e['pos'])) for e in res['emitters']]
    return {'size': [W, H], 'originUnity': [r3(minx), r3(maxy)], 'pxPerUnit': PX_PER_UNIT, 'layers': layers,
            'props': props, 'seats': seats_px, 'emitters': emitters, 'emitterTextures': res['emitterTextures'],
            'floorY': to_px(0, -3.24)[1], 'marks': {k: to_px(*v) for k, v in marks.items()}}


BLEND = ['Zero', 'One', 'DstColor', 'SrcColor', 'OneMinusDstColor', 'SrcAlpha', 'OneMinusSrcColor', 'DstAlpha',
         'OneMinusDstAlpha', 'SrcAlphaSaturate', 'OneMinusSrcAlpha']
_SHADERS = {}


def shader_blend(mat):
    """(tên shader, 'Src+Dst' của pass đầu) — đọc từ Shader đã biên dịch trong bundle."""
    try:
        sh = mat.m_Shader.read()
    except FileNotFoundError:
        raise
    except Exception:
        return None, None
    name = sh.m_ParsedForm.m_Name
    if name not in _SHADERS:
        bl = None
        try:
            rb = sh.m_ParsedForm.m_SubShaders[0].m_Passes[0].m_State.rtBlend0
            bl = '%s+%s' % (BLEND[int(rb.srcBlend.val)], BLEND[int(rb.destBlend.val)])
        except Exception:
            pass
        _SHADERS[name] = bl
    return name, _SHADERS[name]


def is_additive(p):
    """Sprite pha màu kiểu cộng/nhân sáng (LightOverlay = DstColor+One): tách lớp riêng."""
    # Uber lấy blend từ thuộc tính material (_SrcBlend…) nên pass đọc ra Zero+Zero: coi là thường.
    return p.get('blendf') in ('DstColor+One', 'One+One', 'SrcAlpha+One', 'OneMinusDstColor+One')


def controller_clips(ctrl_ptr):
    """AnimatorController hoặc AnimatorOverrideController -> [AnimationClip]."""
    ctrl = ctrl_ptr.read()
    tn = type(ctrl).__name__
    if tn == 'AnimatorOverrideController':
        base = [c.read() for c in ctrl.m_Controller.read().m_AnimationClips]
        over = {o.m_OriginalClip.m_PathID: o.m_OverrideClip for o in ctrl.m_Clips if o.m_OverrideClip.m_PathID}
        out = []
        for c in ctrl.m_Controller.read().m_AnimationClips:
            out.append(over[c.m_PathID].read() if c.m_PathID in over else c.read())
        return ctrl.m_Name, out
    return ctrl.m_Name, [c.read() for c in ctrl.m_AnimationClips]


def rel_paths(root):
    """CRC32 của đường dẫn tương đối (như Animator băm) -> đường dẫn, cho mọi con của root."""
    out = {0: ''}

    def rec(g, pre):
        for ch in children(g):
            path = ch.m_Name if not pre else pre + '/' + ch.m_Name
            out[zlib.crc32(path.encode('utf-8'))] = path
            rec(ch, path)
    rec(root, '')
    return out


def animated_prop(p, ps, place, to_px):
    """Đồ trong quán có Animator: xuất mọi sprite mà clip đổi qua + thời lượng khung; clip chỉ đổi
    thuộc tính (scale, màu) thì giữ đường cong. Neo (anchor) = vị trí pivot của SpriteRenderer trong phòng."""
    anim = p['animator']
    if not anim.m_Controller.m_PathID:
        return None
    cname, clips = controller_clips(anim.m_Controller)
    names = rel_paths(p['anim_go'])
    decs = [decode_clip(c, names) for c in clips]
    decs = [d for d in decs if d['sprites'] or d['curves']]
    if not decs:
        return None
    t = transform_of(p['anim_go'])
    parent = t.m_Father.read().m_GameObject.read().m_Name if t.m_Father.m_PathID else p['anim_go'].m_Name
    key = re.sub(r'\W+', '_', parent)
    sp_frames = {}
    for d in decs:
        for _, sp in d['sprites']:
            sp_frames.setdefault(sp.m_Name, sp)
    frames = {}
    for n, sp in sorted(sp_frames.items()):
        img, (px, py) = sprite_full(sp)
        frames[n] = {'img': save_png(img, 'room/props/%s/%s.png' % (key, n)), 'pivot': [round(px, 1), round(py, 1)]}
    parts = []
    for q in ps:
        im, qx, qy = place(q)
        img0, (px0, py0) = sprite_full(q['sprite'])
        m = q['m']
        parts.append({'name': q['name'], 'sprite': q['sprite'].m_Name,
                      'img': save_png(im, 'room/props/%s/%s_static.png' % (key, q['name'])), 'x': qx, 'y': qy,
                      'anchor': to_px(m[0][2], m[1][2]), 'pivot': [round(px0, 1), round(py0, 1)],
                      'order': q['order'], 'blend': 'light' if is_additive(q) else 'alpha'})
    return {'name': key, 'controller': cname, 'order': p['order'], 'parts': parts, 'frames': frames,
            'animatorPath': p['anim_go'].m_Name,
            'anims': {d['name']: {'rate': d['rate'], 'loop': d['loop'], 'length': d['length'],
                                  'frames': frame_list(d) if d['sprites'] else None,
                                  'curves': d['curves'] or None} for d in decs}}


# ================================================================ chữ gốc (tiếng Anh / Hàn)
_TEXTS = None


def texts():
    """Mọi bảng chữ Assets/Excel/Auto/Texts/*.asset: khoá -> {en, ko}. Game gốc không có tiếng Việt."""
    global _TEXTS
    if _TEXTS is None:
        paths = sorted(k for k in IDX if k.startswith('Assets/Excel/Auto/Texts/'))

        def go(env):
            out = {}
            for o in env.objects:
                if o.type.name == 'AssetBundle':
                    for k, ptr in o.read().m_Container:
                        if k in paths:
                            for r in ptr.asset.read_typetree().get('dataArray', []):
                                if r.get('name'):
                                    out.setdefault(r['name'], {'en': r.get('english'), 'ko': r.get('korean')})
            return out
        _TEXTS = with_deps(IDX[paths[0]], go)
    return _TEXTS


def en(key):
    t = texts().get(key)
    return t['en'] if t else None


# ================================================================ món ăn
COMMON_ATLAS = PC + 'Common/Sprites/0_SpriteAtlas/CommonAtlas_Point.spriteatlas'
GENERIC = [('sashimi', 'Menu_TropicalFish_Sashimi'), ('maki', 'Menu_Red_FishRoll'),
           ('onigiri', 'Menu_Seadragon_Onigiri'), ('nigiri', 'Sushi_Comber')]


def rip_dishes():
    """Cá (HX_ASSETS.fish[].tid) -> FishInfoData.DropItemID -> FishDropPackage.ItemIDList (vật phẩm)
    -> Ingredients.TIDNumberConnect (nguyên liệu) -> Recipe.IngredientIDList. Icon món trong CommonAtlas_Point."""
    fish = load_sheet('DR_GameData_Fish')
    item = load_sheet('DR_GameData_Item')
    sb = load_sheet('DR_GameData_SushiBar')
    src = io.open(os.path.join(DATA, 'assets.js'), encoding='utf-8').read()
    A = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    info = {f['TID']: f for f in fish['FishInfoData']}
    drop = {d['TID']: d for d in fish['FishDropPackage']}
    ingr_by_item = {}
    for g in item['Ingredients']:
        ingr_by_item.setdefault(g['TIDNumberConnect'], []).append(g['TID'])
    recipes = sb['Recipe']
    by_ingr = {}
    for r in recipes:
        for ig in r['IngredientIDList']:
            by_ingr.setdefault(ig, []).append(r)
    picks, missing = {}, []
    for f in A['fish']:
        fi = info[f['tid']]
        d = drop.get(fi['DropItemID'])
        ing = sorted({g for it in (d['ItemIDList'] if d else []) for g in ingr_by_item.get(it, [])})
        cands = [r for g in ing for r in by_ingr.get(g, [])]
        # ưu tiên món một nguyên liệu (một con cá → một đĩa), rồi món ít nguyên liệu, rồi Type Sushi, rồi TID nhỏ
        cands.sort(key=lambda r: (len(r['IngredientIDList']), r['Type'] != 'Sushi', r['TID']))
        if not cands:
            missing.append({'what': 'dish', 'tid': f['tid'], 'id': f['id'],
                            'why': 'không Recipe nào dùng nguyên liệu của cá này (vật phẩm %s)' % (d['ItemIDList'] if d else '-')})
            continue
        picks[f['tid']] = (cands[0], len(cands))
    want = {r['Icon'] for r, _ in picks.values()} | {icon for _, icon in GENERIC} | {'Drink_Tea'}
    icons = sprites_in_bundle(COMMON_ATLAS, lambda n: n in want)
    shutil.rmtree(os.path.join(ART, 'dishes'), ignore_errors=True)
    dishes = {}
    for tid, (r, n) in sorted(picks.items()):
        if r['Icon'] not in icons:
            missing.append({'what': 'dish icon', 'tid': tid, 'why': 'không thấy sprite ' + r['Icon']})
            continue
        dishes[str(tid)] = {'recipe': r['TID'], 'nameKey': r['NameTextID'], 'name': en(r['NameTextID']),
                            'nameKo': (texts().get(r['NameTextID']) or {}).get('ko'), 'icon': r['Icon'],
                            'img': save_png(sprite_full(icons[r['Icon']])[0], 'dishes/%s.png' % r['Icon']),
                            'price': r['Price'], 'plates': r['PlateCount'], 'baseTaste': r['BaseTasteValue'],
                            'salesTimePerPlate': r['SalesTimePerPlate'], 'maxLevel': r['MaxLevel'],
                            'ingredients': len(r['IngredientIDList']), 'type': r['Type'], 'otherRecipes': n - 1,
                            'source': 'DtD'}
    generic = []
    for kind, icon in GENERIC:
        r = next((x for x in recipes if x['Icon'] == icon), None)
        if r and icon in icons:
            generic.append({'kind': kind, 'recipe': r['TID'], 'nameKey': r['NameTextID'], 'name': en(r['NameTextID']),
                            'img': save_png(sprite_full(icons[icon])[0], 'dishes/%s.png' % icon), 'price': r['Price']})
    tea = {}
    s = icons.get('Drink_Tea')
    if s is not None:
        img, _ = sprite_full(s)
        tea = {'img': save_png(img, 'dishes/Drink_Tea.png'), 'w': img.width, 'h': img.height}
    s = find_sprite('UI_Customer_Tea_Pop')
    if s is not None:
        img, _ = sprite_full(s)
        tea['orderBubble'] = {'img': save_png(img, 'dishes/UI_Customer_Tea_Pop.png'), 'w': img.width, 'h': img.height}
    iw, ih = sprite_full(next(iter(icons.values())))[0].size
    return {'dishes': dishes, 'genericDishes': generic, 'tea': tea, 'dishIconSize': [iw, ih], 'missingDishes': missing}


SPRITE_BUNDLES = None


def sprite_bundles():
    """Bundle có sprite của quán / UI chung (để tìm sprite theo tên)."""
    global SPRITE_BUNDLES
    if SPRITE_BUNDLES is None:
        pre = [SUSHI, PC + 'SushiBar_Shared/', PC + 'Staffs/', PC + 'Common/Sprites/', PC + 'Common/VFX/',
               PC + 'Ingame/00_InGame_Common/Sprites/']
        SPRITE_BUNDLES = sorted({b for k, b in IDX.items() if any(k.startswith(p) for p in pre)})
    return SPRITE_BUNDLES


_SPRITE_NAMES = None


def find_sprite(name):
    global _SPRITE_NAMES
    if _SPRITE_NAMES is None:
        p = os.path.join(rip.CACHE, 'bar_sprite_names.json')
        if os.path.exists(p):
            _SPRITE_NAMES = json.load(open(p, encoding='utf-8'))
        else:
            import UnityPy
            _SPRITE_NAMES = {}
            for b in sprite_bundles():
                env = UnityPy.load(os.path.join(rip.BUNDLES, b))
                for o in env.objects:
                    if o.type.name == 'Sprite':
                        _SPRITE_NAMES.setdefault(o.read().m_Name, [b, o.path_id])
            json.dump(_SPRITE_NAMES, open(p, 'w', encoding='utf-8'))
    hit = _SPRITE_NAMES.get(name)
    if not hit:
        return None
    b, pid = hit

    def go(env):
        for o in env.objects:
            if o.path_id == pid and o.type.name == 'Sprite':
                s = o.read()
                if s.m_Name == name:
                    s.image  # đọc ảnh ngay trong env có phụ thuộc (atlas có thể ở bundle khác)
                    return s
    return with_deps(b, go)


# ================================================================ UI + VFX
UI = SUSHI + 'Prefabs/UI/'
# Prefab UI của quán dùng cho vòng chơi một ngày (đường dẫn dưới SushiBar/Prefabs/UI/).
UI_PREFABS = [
    ('customerAction', 'SushiBarCustomerActionInfo.prefab'),   # bong bóng gọi món, đồng hồ ăn, tiền trả, mặt cười
    ('customerActionPanel', 'CustomerActionInfoPanel.prefab'),
    ('customerTalk', 'CustomerTalkBoxInfo.prefab'),
    ('daveAction', 'DaveActionInfo.prefab'),                   # món Dave đang bưng
    ('staffAction', 'StaffActionInfo.prefab'),
    ('workingIcon', 'Sushi_WorkingIcon.prefab'),
    ('cookingProgress', 'CookingProgressPanel.prefab'),        # hàng món Bancho đang làm
    ('cookingSlotComplete', 'CookingProgress/CookingProgressSlot_Complete.prefab'),
    ('buttonPanel', 'SushiBarButtonPanel.prefab'),
    ('menuButton', 'SushiBarMenuButton.prefab'),
    ('openConfirm', 'SushiBarOpenConfirmPanel.prefab'),
    ('opening', 'Opening/SushiBarOpeningPanel_New.prefab'),    # chọn món trước giờ mở quán
    ('menuActionSlot', 'RecipeMenu/MenuActionSlot.prefab'),
    ('menuIngredientsSlot', 'RecipeMenu/MenuIngredientsSlot.prefab'),
    ('recipes', 'ManagementSheet/Management_Recipes.prefab'),  # thẻ món / công thức
    ('management', 'ManagementSheet/ManagementPanel.prefab'),
    ('managementTop', 'ManagementSheet/Management_Top.prefab'),
    ('result', 'ResulstPopup/SushiBarResultPanelBase.prefab'), # tổng kết cuối ca
    ('account', 'Analytics/SushiBarAccountPanel.prefab'),     # sổ thu chi
    ('accountInternal', 'Analytics/SushiBarAccountInternal.prefab'),
    ('interiorList', 'Interior/SushiBarInteriorListBar.prefab'),  # nâng cấp nội thất
    ('interiorTop', 'Interior/SushiBarInteriorTopList.prefab'),
    ('qtePanel', 'QTE/SushiBarQTEPanel.prefab'),               # rót trà
    ('qteResult', 'QTE/QTEResultEffect.prefab'),
    ('trashPanel', 'SushiBarTableTrashPanel.prefab'),
]
VFXP = PC + 'Common/VFX/Prefabs/'
VFX_PREFABS = [
    ('eatHappy', 'Env_Effect/CustomerVFX/Eat_Happy_Particle.prefab'),
    ('eatBigHappy', 'Env_Effect/CustomerVFX/Eat_BigHappy_Particle.prefab'),
    ('coinAbsorb', 'fUI_Effect/VFX_UI_CoinAbsorb_A_01.prefab'),
    ('money', 'fUI_Effect/VFX_UI_Money_A_01.prefab'),
    ('addGold', 'AddGoldUIEffect.prefab'),
    ('customerPop', 'fUI_Effect/VFX_UI_Customer_Pop_Re_A_01.prefab'),
    ('customerFail', 'fUI_Effect/VFX_UI_CustomerAction_Fail_A_01.prefab'),
    ('daveSmile', 'fUI_Effect/VFX_UI_DaveAction_Smile_A_01.prefab'),
    ('likeHeart', 'fUI_Effect/VFX_UI_LikeHeart_A_01.prefab'),
    ('cookingSlot', 'fUI_Effect/VFX_UI_CookingSlot_A_01.prefab'),
    ('cookingSlotStart', 'fUI_Effect/VFX_UI_CookingSlot_Start_A_01.prefab'),
    ('teaPerfect', 'fUI_Effect/VFX_UI_GreenTea_Result_Perfect_A_01.prefab'),
    ('teaGood', 'fUI_Effect/VFX_UI_GreenTea_Result_Good_A_01.prefab'),
    ('teaBad', 'fUI_Effect/VFX_UI_GreenTea_Result_Bad_A_01.prefab'),
    ('tankBubble', 'Env_Effect/VFX_SushiBar_TankBubble_A_01.prefab'),
    ('signSpark', 'Item_Effect/VFX_Sushi_BCSign_Spark_A_01.prefab'),
    ('speakerSparkL', 'Item_Effect/VFX_Sushi_Speaker_L_Spark_A_01.prefab'),
    ('speakerSparkR', 'Item_Effect/VFX_Sushi_Speaker_R_Spark_A_01.prefab'),
    ('nightEnv', 'Env_Effect/Runtime/VFX_SushiBar_Evening_A_01.prefab'),
]
# Khói nấu của Bancho chỉ có trong DLC Jungle (quầy nướng) — vẫn là asset gốc của game, ghi rõ nguồn.
VFX_EXTRA = [('cookSmoke_JungleDLC', 'Assets/TempDLC_RnD/Contents/JDLC_SushiBar/VFX/Character_Effect/VFX_Jungle_SushiBar_Bancho_CookSmoke_01A.prefab')]
LOOSE_UI = ['UI_SushiOpenText', 'Customer_ReceiveHappy01', 'Customer_EatIcon', 'HappyGauge_Icon', 'UI_Customer_Pop_Re',
            'UI_Dave_Pop', 'UI_Sushi_TastyIcon', 'UI_TIP_Icon', 'TableDirt', 'UI_Sushi_Coin_20', 'UI_Sushi_Coin_30',
            'Coin24', 'Coin32', 'Coin_Reward_64', 'UI_Customer_Tea_Pop', 'Sushi_Flame_Icon']
# Nhánh con thuộc tính năng ngoài vòng chơi (phái nhân viên, tuyển người): ghi tên, không xuất ảnh [ĐỀ XUẤT]
SKIP_NODES = {'opening': {'Dispatch', 'RecruitMent'}}
# Clip rời trong SushiBar/Animations/UI thuộc tính năng khác (đấu VIP, chi nhánh, cocktail…): bỏ [ĐỀ XUẤT]
SKIP_CLIPS = re.compile(r'BattleVIP|Branch|Potioncraft|Dispatch|Recruit|Inspecter|VIPIncoming|Cocktail|Staff', re.I)
MAX_UI_PX = 1100  # ảnh nền UI lớn hơn cạnh này thì chỉ ghi tên, không xuất (giữ tổng dung lượng) [ĐỀ XUẤT]


class UICtx:
    def __init__(self, texdir='vfx'):
        self.texdir = texdir
        self.sprites, self.textures, self.clips, self.skipped = {}, {}, {}, {}
        self.skip_nodes = set()

    def sprite(self, s):
        name = s.m_Name
        if name in self.sprites or name in self.skipped:
            return name
        w, h = int(round(s.m_Rect.width)), int(round(s.m_Rect.height))
        if max(w, h) > MAX_UI_PX:
            self.skipped[name] = [w, h]
            return name
        img, (px, py) = sprite_full(s)
        b = s.m_Border
        self.sprites[name] = {'img': save_png(img, 'ui/%s.png' % safe(name)), 'w': w, 'h': h,
                              'border': [r3(b.x), r3(b.y), r3(b.z), r3(b.w)] if (b.x or b.y or b.z or b.w) else None,
                              'ppu': r3(s.m_PixelsToUnits), 'pivot': [r3(s.m_Pivot.x), r3(s.m_Pivot.y)]}
        return name

    def texture(self, t):
        name = t.m_Name
        if type(t).__name__ != 'Texture2D':  # RenderTexture: ảnh vẽ lúc chạy, không có điểm ảnh trong bundle
            return {'runtime': type(t).__name__, 'name': name}
        if name not in self.textures and name not in self.skipped:
            img = t.image.convert('RGBA')
            if max(img.size) > 1024:
                self.skipped[name] = list(img.size)
                return name
            self.textures[name] = {'img': save_png(img, '%s/%s.png' % (self.texdir, safe(name))), 'w': img.width, 'h': img.height}
        return name


def save_json(obj, rel):
    p = os.path.join(ART, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    return 'art/bar/' + rel


def count_nodes(n, key=None):
    here = 1 if key is None or key in n else 0
    return here + sum(count_nodes(c, key) for c in n.get('children', []))


def safe(n):
    return re.sub(r'[^\w\-]+', '_', n)


def col(c):
    return [r3(c.r), r3(c.g), r3(c.b), r3(c.a)]


def colj(c):
    return [r3(c['r']), r3(c['g']), r3(c['b']), r3(c['a'])]


def ckeys(c):
    return [[r3(k['time']), r3(k['value']), r3(k['inSlope']) if abs(k['inSlope']) < 1e9 else 'step',
             r3(k['outSlope']) if abs(k['outSlope']) < 1e9 else 'step'] for k in c['m_Curve']]


def mmcurve(m):
    """MinMaxCurve -> gọn: số | [min, max] | {'curve': khoá, 'mul'} | {'min': khoá, 'max': khoá, 'mul'}."""
    st = m['minMaxState']
    if st == 0:
        return r3(m['scalar'])
    if st == 3:
        return [r3(m['minScalar']), r3(m['scalar'])]
    if st == 1:
        return {'curve': ckeys(m['maxCurve']), 'mul': r3(m['scalar'])}
    return {'min': ckeys(m['minCurve']), 'max': ckeys(m['maxCurve']), 'mul': r3(m['scalar'])}


def gradient(g):
    nc, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    return {'color': [[r3(g['ctime%d' % i] / 65535.0)] + colj(g['key%d' % i])[:3] for i in range(nc)],
            'alpha': [[r3(g['atime%d' % i] / 65535.0), r3(g['key%d' % i]['a'])] for i in range(na)],
            'mode': g['m_Mode']}


def mmgrad(m):
    st = m['minMaxState']
    if st == 0:
        return colj(m['maxColor'])
    if st == 1:
        return {'gradient': gradient(m['maxGradient'])}
    if st == 2:
        return {'randomColor': [colj(m['minColor']), colj(m['maxColor'])]}
    if st == 3:
        return {'between': [gradient(m['minGradient']), gradient(m['maxGradient'])]}
    return {'randomGradient': gradient(m['maxGradient'])}


SHAPES = {0: 'sphere', 1: 'hemisphere', 4: 'cone', 5: 'box', 6: 'mesh', 8: 'coneVolume', 10: 'circle',
          12: 'edge', 13: 'meshRenderer', 14: 'skinnedMesh', 15: 'boxShell', 16: 'boxEdge', 17: 'donut',
          18: 'rectangle', 19: 'sprite', 20: 'spriteRenderer'}


def particle(ps_tt, rend, ctx):
    """ParticleSystem + Renderer -> tham số đủ để phát lại (đơn vị Unity; hệ UI thì đơn vị = px canvas)."""
    im = ps_tt['InitialModule']
    out = {'duration': r3(ps_tt['lengthInSec']), 'loop': bool(ps_tt['looping']), 'prewarm': bool(ps_tt['prewarm']),
           'startDelay': mmcurve(ps_tt['startDelay']), 'simulationSpeed': r3(ps_tt['simulationSpeed']),
           'lifetime': mmcurve(im['startLifetime']), 'speed': mmcurve(im['startSpeed']),
           'size': mmcurve(im['startSize']), 'rotation': mmcurve(im['startRotation']),
           'color': mmgrad(im['startColor']), 'gravity': mmcurve(im['gravityModifier']),
           'maxParticles': im['maxNumParticles'], 'simulationSpace': ps_tt['moveWithTransform']}
    em = ps_tt['EmissionModule']
    if em['enabled']:
        out['rate'] = mmcurve(em['rateOverTime'])
        out['bursts'] = [{'t': r3(b['time']), 'count': mmcurve(b['countCurve']) if 'countCurve' in b else b.get('minCount'),
                          'cycles': b.get('cycleCount'), 'interval': r3(b.get('repeatInterval', 0))} for b in em['m_Bursts']]
    sh = ps_tt['ShapeModule']
    if sh['enabled']:
        out['shape'] = {'type': SHAPES.get(sh['type'], sh['type']), 'radius': r3(sh['radius']['value']),
                        'angle': r3(sh['angle']), 'arc': r3(sh['arc']['value']),
                        'scale': [r3(sh['m_Scale']['x']), r3(sh['m_Scale']['y'])],
                        'pos': [r3(sh['m_Position']['x']), r3(sh['m_Position']['y'])],
                        'rot': [r3(sh['m_Rotation']['x']), r3(sh['m_Rotation']['y']), r3(sh['m_Rotation']['z'])]}
    for key, mod, fields in (('sizeOverLife', 'SizeModule', ['curve']), ('rotationOverLife', 'RotationModule', ['curve']),
                             ('velocityOverLife', 'VelocityModule', ['x', 'y', 'speedModifier']),
                             ('noise', 'NoiseModule', ['strength', 'frequency'])):
        m = ps_tt.get(mod)
        if m and m['enabled']:
            out[key] = {f: (mmcurve(m[f]) if isinstance(m[f], dict) and 'minMaxState' in m[f] else m[f]) for f in fields if f in m}
    cm = ps_tt['ColorModule']
    if cm['enabled']:
        out['colorOverLife'] = mmgrad(cm['gradient'])
    uv = ps_tt['UVModule']
    if uv['enabled']:
        out['sheet'] = {'tilesX': uv['tilesX'], 'tilesY': uv['tilesY'], 'animation': uv['animationType'],
                        'frameOverTime': mmcurve(uv['frameOverTime']), 'startFrame': mmcurve(uv['startFrame']),
                        'cycles': r3(uv['cycles']), 'mode': uv['mode'], 'timeMode': uv['timeMode'], 'fps': r3(uv['fps'])}
    if rend is not None:
        rr = rend.read()
        modes = ['billboard', 'stretch', 'horizontal', 'vertical', 'mesh', 'none']
        out['render'] = {'mode': modes[rr.m_RenderMode] if rr.m_RenderMode < len(modes) else rr.m_RenderMode,
                         'order': rr.m_SortingOrder, 'enabled': bool(rr.m_Enabled)}
        if rr.m_Materials and rr.m_Materials[0].m_PathID:
            mat = rr.m_Materials[0].read()
            shader, blend = shader_blend(mat)
            tex = None
            for k, v in mat.m_SavedProperties.m_TexEnvs:
                if k in ('_MainTex', '_BaseMap', '_BaseTex') and v.m_Texture.m_PathID:
                    tex = ctx.texture(v.m_Texture.read())
                    break
            colors = {k: col(v) for k, v in mat.m_SavedProperties.m_Colors if k in ('_Color', '_TintColor', '_BaseColor')}
            out['render'].update({'material': mat.m_Name, 'shader': shader, 'blend': blend, 'texture': tex,
                                  'tint': colors or None})
    return out


def tween(tt):
    """DOTweenAnimation -> số gốc. animationType theo enum DOTween: 1 Move, 2 LocalMove, 3 Rotate, 4 LocalRotate,
    5 Scale, 6 Color, 7 Fade, 8 Text, 9 PunchPosition, 10 PunchRotation, 11 PunchScale, 12 ShakePosition,
    13 ShakeRotation, 14 ShakeScale … ; easeType theo enum DG.Tweening.Ease."""
    keep = ['animationType', 'targetType', 'duration', 'delay', 'easeType', 'loops', 'loopType', 'isRelative', 'isFrom',
            'isIndependentUpdate', 'autoPlay', 'autoKill', 'id', 'endValueFloat', 'endValueV3', 'endValueV2',
            'endValueColor', 'endValueString', 'optionalBool0', 'optionalFloat0', 'optionalInt0', 'isSpeedBased']
    out = {}
    for k in keep:
        if k in tt:
            v = tt[k]
            if isinstance(v, dict) and 'r' in v:
                v = colj(v)
            elif isinstance(v, dict):
                v = [r3(x) for x in v.values()]
            elif isinstance(v, float):
                v = r3(v)
            out[k] = v
    if 'easeCurve' in tt and tt['easeCurve'].get('m_Curve'):
        out['easeCurve'] = ckeys(tt['easeCurve'])
    return out


def mb_fields(tt):
    """Trường chuỗi/số đơn giản của MonoBehaviour khác (khoá chữ, cấu hình) — bỏ PPtr và mảng lớn."""
    out = {}
    for k, v in tt.items():
        if k in ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name', 'm_EditorHideFlags'):
            continue
        if isinstance(v, str) and v:
            out[k] = v
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out[k] = r3(v) if isinstance(v, float) else v
    return out or None


def dump_node(go, ctx):
    t = transform_of(go)
    n = {'name': go.m_Name}
    if go.m_Name in ctx.skip_nodes:
        n['skipped'] = 'ngoài vòng chơi một ngày, không xuất'
        return n
    if not go.m_IsActive:
        n['off'] = 1
    if type(t).__name__ == 'RectTransform':
        n['rt'] = [r3(t.m_AnchorMin.x), r3(t.m_AnchorMin.y), r3(t.m_AnchorMax.x), r3(t.m_AnchorMax.y),
                   r3(t.m_AnchoredPosition.x), r3(t.m_AnchoredPosition.y), r3(t.m_SizeDelta.x), r3(t.m_SizeDelta.y),
                   r3(t.m_Pivot.x), r3(t.m_Pivot.y)]
    else:
        n['pos'] = [r3(t.m_LocalPosition.x), r3(t.m_LocalPosition.y)]
    sc = t.m_LocalScale
    if (r3(sc.x), r3(sc.y)) != (1.0, 1.0):
        n['scale'] = [r3(sc.x), r3(sc.y)]
    q = t.m_LocalRotation
    if abs(q.z) > 1e-4:
        n['rotZ'] = r3(math.degrees(2 * math.atan2(q.z, q.w)))
    ps = rend = None
    for c in go.m_Component:
        tn = c.component.type.name
        if tn in ('Transform', 'RectTransform', 'CanvasRenderer'):
            continue
        if tn == 'ParticleSystem':
            ps = c.component
            continue
        if tn == 'ParticleSystemRenderer':
            rend = c.component
            continue
        r = c.component.read()
        if tn == 'MonoBehaviour':
            nm = script_name(r) or '?'
            tt = c.component.read_typetree()
            if 'm_Sprite' in tt and 'm_FillMethod' in tt:  # UnityEngine.UI.Image
                img = {'sprite': ctx.sprite(r.m_Sprite.read()) if r.m_Sprite.m_PathID else None, 'type': tt['m_Type']}
                if colj(tt['m_Color']) != [1.0, 1.0, 1.0, 1.0]:
                    img['color'] = colj(tt['m_Color'])
                if tt['m_Type'] == 3:
                    img['fill'] = {'method': tt['m_FillMethod'], 'amount': r3(tt['m_FillAmount']),
                                   'origin': tt['m_FillOrigin'], 'clockwise': bool(tt['m_FillClockwise'])}
                if tt.get('m_PreserveAspect'):
                    img['preserveAspect'] = 1
                if not tt['m_Enabled']:
                    img['off'] = 1
                n['img'] = img
            elif 'm_Texture' in tt and 'm_UVRect' in tt:  # RawImage
                n['raw'] = {'tex': ctx.texture(r.m_Texture.read()) if r.m_Texture.m_PathID else None,
                            'color': colj(tt['m_Color'])}
            elif 'm_text' in tt:  # TextMeshProUGUI
                fc = tt.get('m_fontColor')
                # không đọc m_fontAsset: font TMP nằm trong bundle 50 MB, chỉ để lấy tên
                n['text'] = {'text': tt['m_text'], 'size': r3(tt.get('m_fontSize', 0)),
                             'color': colj(fc) if fc else None, 'style': tt.get('m_fontStyle'),
                             'align': tt.get('m_HorizontalAlignment', tt.get('m_textAlignment')),
                             'valign': tt.get('m_VerticalAlignment'), 'auto': bool(tt.get('m_enableAutoSizing')),
                             'sizeMinMax': [r3(tt.get('m_fontSizeMin', 0)), r3(tt.get('m_fontSizeMax', 0))]
                             if tt.get('m_enableAutoSizing') else None}
            elif 'animationType' in tt and 'easeType' in tt:  # DOTweenAnimation
                n.setdefault('tweens', []).append(tween(tt))
            else:
                f = mb_fields(tt)
                n.setdefault('scripts', []).append({nm: f} if f else nm)
        elif tn == 'CanvasGroup':
            n['alpha'] = r3(r.m_Alpha)
        elif tn == 'Animation':
            names = []
            paths = rel_paths(go)
            for cp in r.m_Animations:
                if cp.m_PathID:
                    cl = cp.read()
                    key = '%s/%s' % (go.m_Name, cl.m_Name)
                    ctx.clips[key] = strip_sprites(decode_clip(cl, paths), ctx)
                    names.append(key)
            n['animation'] = {'clips': names, 'playAuto': bool(r.m_PlayAutomatically)}
        elif tn == 'Animator':
            if r.m_Controller.m_PathID:
                cname, cls = controller_clips(r.m_Controller)
                paths = rel_paths(go)
                names = []
                for cl in cls:
                    key = '%s/%s' % (cname, cl.m_Name)
                    ctx.clips[key] = strip_sprites(decode_clip(cl, paths), ctx)
                    names.append(key)
                n['animator'] = {'controller': cname, 'clips': names}
        elif tn == 'SpriteRenderer':
            if r.m_Sprite.m_PathID:
                n['spriteRenderer'] = {'sprite': ctx.sprite(r.m_Sprite.read()), 'order': r.m_SortingOrder,
                                       'color': col(r.m_Color)}
        else:
            n.setdefault('components', []).append(tn)
    if ps is not None:
        n['particle'] = particle(ps.read_typetree(), rend, ctx)
    kids = [dump_node(ch, ctx) for ch in children(go)]
    if kids:
        n['children'] = kids
    return n


def strip_sprites(dec, ctx=None):
    """Clip đã giải -> dạng JSON: sprite đổi khung ghi theo tên (ảnh xuất qua ctx)."""
    out = {k: v for k, v in dec.items() if k != 'sprites'}
    if dec['sprites']:
        if ctx is not None:
            for _, s in dec['sprites']:
                ctx.sprite(s)
        out['spriteKeys'] = frame_list(dec)
    return out


def dump_prefab(path, ctx):
    def go(env):
        a = container(env, path, 'GameObject')
        if a is None:
            return None
        return dump_node(a.read(), ctx)
    return with_deps(IDX[path], go)


def rip_ui():
    for sub in ('ui', 'vfx'):
        shutil.rmtree(os.path.join(ART, sub), ignore_errors=True)
    ctx = UICtx()
    panels, missing = {}, []
    for key, rel in UI_PREFABS:
        path = UI + rel
        if path not in IDX:
            missing.append({'what': 'ui prefab', 'id': key, 'why': 'không có ' + rel})
            continue
        ctx.skip_nodes = SKIP_NODES.get(key, set())
        root = dump_prefab(path, ctx)
        ctx.skip_nodes = set()
        # bố cục đầy đủ để ở tệp JSON riêng (nặng); manifest chỉ giữ đường dẫn + cỡ gốc
        panels[key] = {'prefab': rel, 'layout': save_json(root, 'ui/layout/%s.json' % key),
                       'rt': root.get('rt'), 'nodes': count_nodes(root)}
        print('  UI %-22s sprite %d' % (key, len(ctx.sprites)))
    loose = {}
    for n in LOOSE_UI:
        s = find_sprite(n)
        if s is None:
            missing.append({'what': 'ui sprite', 'id': n, 'why': 'không thấy sprite'})
            continue
        loose[n] = ctx.sprite(s)
    vfx = {}
    for key, rel in VFX_PREFABS + VFX_EXTRA:
        path = rel if rel.startswith('Assets/') else VFXP + rel
        if path not in IDX:
            missing.append({'what': 'vfx prefab', 'id': key, 'why': 'không có ' + rel})
            continue
        root = dump_prefab(path, ctx)
        vfx[key] = {'prefab': path.replace(PC, ''), 'layout': save_json(root, 'vfx/layout/%s.json' % key),
                    'systems': count_nodes(root, 'particle')}
        print('  VFX %-20s ảnh %d' % (key, len(ctx.textures)))
    # clip UI rời trong SushiBar/Animations/UI (đồng xu bay, dọn bàn, bảng hiện…)
    for p in clip_paths(SUSHI + 'Animations/UI/'):
        if SKIP_CLIPS.search(os.path.basename(p)):
            continue
        dec = clip_by_path(p)
        if dec and (dec['curves'] or dec['sprites'] or dec['events']):
            ctx.clips.setdefault('UI/' + dec['name'], strip_sprites(dec, ctx))
    return {'ui': {'panels': panels, 'sprites': ctx.sprites, 'loose': loose, 'clips': ctx.clips,
                   'tooBig': ctx.skipped or None,
                   'notes': {'rt': '[anchorMin.x, anchorMin.y, anchorMax.x, anchorMax.y, pos.x, pos.y, sizeDelta.x, sizeDelta.y, pivot.x, pivot.y]',
                             'img.type': '0 Simple, 1 Sliced (9 mảnh theo border [trái, dưới, phải, trên] px), 2 Tiled, 3 Filled',
                             'curve.keys': 'legacy: [t, v, inSlope, outSlope] (Hermite); Mecanim streamed: [t, v, c, b, a] '
                                           'với v(t) = ((a*dt + b)*dt + c)*dt + v, dt = t - t_khoá; dense: [t, v]'}},
            'vfx': {'systems': vfx, 'textures': ctx.textures}, 'missingUI': missing}


# ================================================================ tiếng
AUDIO = [
    # khoá, tên clip gốc, loại. Nhạc giữ nguyên độ dài (vòng lặp). Tiếng lẻ: cắt lặng hai đầu.
    ('bgm_night', 'BGM_SushiBar_Night', 'music'),
    ('bgm_day', 'BGM_SushiBar_Day', 'music'),
    ('amb_crowd', 'amb_sushi_crowd', 'loop'),
    ('open', 'ui_sushibar_open', 'sfx'), ('close', 'ui_sushibar_close', 'sfx'), ('letsrock', 'ui_sushibar_letsrock', 'sfx'),
    ('enter_talk1', 'sushi_customer_enter_talk_01', 'sfx'), ('enter_talk2', 'sushi_customer_enter_talk_04', 'sfx'),
    ('enter_talk3', 'sushi_customer_enter_talk_08', 'sfx'),
    ('read_menu', 'sushi_customer_read_menu_03', 'sfx'),
    ('food_ready1', 'sushi_bancho_foodready_02', 'sfx'), ('food_ready2', 'sushi_bancho_foodready_04', 'sfx'),
    ('food_pick', 'sushi_food_receive_02', 'sfx'),
    ('serve', 'sushi_customer_served', 'sfx'), ('serve2', 'sushi_customer_served_02', 'sfx'),
    ('eat1', 'sushi_customer_eat_01', 'sfx'), ('eat2', 'sushi_customer_eat_02', 'sfx'), ('eat3', 'sushi_customer_eat_03', 'sfx'),
    ('pay', 'sound_sushibar_pay_02', 'sfx'), ('tip', 'sound_sushibar_give_tips_02', 'sfx'),
    ('like', 'sound_sushibar_give_like', 'sfx'), ('coin', 'ui_ingame_coin_appear', 'sfx'),
    ('tea_pour', 'sushi_tea_pouring_02', 'sfx'), ('drink_perfect', 'sushi_drink_perfect_04', 'sfx'),
    ('drink_good', 'sushi_drink_good_05', 'sfx'), ('drink_bad', 'sushi_drink_bad_02', 'sfx'),
    ('wasabi_grind', 'sushi_wasabi_grind_03', 'sfx'), ('wasabi_done', 'sushi_wasabi_done_02', 'sfx'),
    ('cleanup', 'sushi_cleanup_02', 'sfx'), ('dump', 'sushi_dump_02', 'sfx'),
    ('dave_foot', 'sound_dave_foot_01', 'sfx'), ('dave_dash', 'sound_dave_dash_02', 'sfx'), ('dave_tired', 'sound_dave_tired_01', 'sfx'),
    ('result_popup1', 'sushi_result_popup_01', 'sfx'), ('result_popup2', 'sushi_result_popup_02', 'sfx'),
    ('result_profit', 'sushi_result_profit_01', 'sfx'), ('result_fire', 'sushi_result_fire_02', 'sfx'),
    ('chop', 'BattleVIP_Slicing_Stargazer_Chop_01', 'sfx'),
    ('bancho_normal1', 'VO_Bancho_Normal_01', 'sfx'), ('bancho_normal2', 'VO_Bancho_Normal_02', 'sfx'),
    ('bancho_normal3', 'VO_Bancho_Normal_03', 'sfx'), ('bancho_exciting1', 'VO_Bancho_Exciting_01', 'sfx'),
    ('bancho_exciting2', 'VO_Bancho_Exciting_02', 'sfx'), ('bancho_angry1', 'VO_Bancho_Angry_01', 'sfx'),
    ('bancho_afterwork1', 'VO_Bancho_Afterwork_01', 'sfx'),
    ('momo', 'vo_talk_momo_01', 'sfx'),
]
MAX_MUSIC_BYTES = 3 * 1024 * 1024


def rip_audio():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    for f in os.listdir(AUD) if os.path.isdir(AUD) else []:
        if f.startswith('bar_') and f.endswith('.mp3'):
            os.remove(os.path.join(AUD, f))
    os.makedirs(AUD, exist_ok=True)
    out, missing = {}, []
    for key, clip, kind in AUDIO:
        try:
            path = rip.find_path(clip + '.wav')
        except KeyError:
            missing.append({'what': 'audio', 'id': key, 'why': 'không có clip ' + clip})
            continue
        ac = [o for o in rip.objects_for(path) if type(o).__name__ == 'AudioClip' and o.m_Name == clip]
        if not ac:
            missing.append({'what': 'audio', 'id': key, 'why': 'không đọc được AudioClip ' + clip})
            continue
        wav = list(ac[0].samples.values())[0]
        tmp = os.path.join(rip.CACHE, 'bar_%s.wav' % key)
        open(tmp, 'wb').write(wav)
        dst = os.path.join(AUD, 'bar_%s.mp3' % key)
        if kind == 'music':
            args = ['-ac', '1', '-b:a', '96k']
        elif kind == 'loop':
            args = ['-ac', '1', '-b:a', '64k']
        else:
            trim = ('silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,areverse,'
                    'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse')
            args = ['-af', trim, '-ac', '1', '-b:a', '96k']
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame'] + args + [dst], check=True)
        os.remove(tmp)
        size = os.path.getsize(dst)
        if kind == 'music' and size > MAX_MUSIC_BYTES:
            os.remove(dst)
            missing.append({'what': 'audio', 'id': key, 'why': 'mp3 %d KB > 3 MB, bỏ' % (size // 1024)})
            continue
        out[key] = {'src': 'audio/bar_%s.mp3' % key, 'clip': clip, 'kind': kind, 'kb': size // 1024}
        print('  tiếng %-18s %-38s %5d KB' % (key, clip, size // 1024))
    return {'audio': out, 'missingAudio': missing}


# ================================================================ manifest
def write_part(name, data):
    os.makedirs(PARTS, exist_ok=True)
    with open(os.path.join(PARTS, name + '.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, ensure_ascii=False, sort_keys=True)


def read_part(name):
    p = os.path.join(PARTS, name + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


HEADER = '''// Sinh bởi tools/rip_bar.py — đừng sửa tay. Chạy lại: python games/ho-xanh/tools/rip_bar.py
// Nguồn: bản Steam Dave the Diver. Nhãn số liệu:
//   [DtD]      đọc thẳng từ tệp gốc (Sprite, AnimationClip, prefab, scene, GameDataSheet).
//   [ĐỀ XUẤT]  do tool chọn (cách xếp lớp phòng, chọn món chung, cột sheet) — không phải số của game.
// Đường dẫn ảnh/tiếng tính từ games/ho-xanh/. Toạ độ phòng: px, gốc trên-trái, 50 px = 1 đơn vị Unity.
// Khung anim: frames = [[ô trong sheet, ms], ...]; ô i nằm ở cột i % cols, hàng i / cols; neo (anchor) = pivot gốc.
'''

SECTION_NOTES = {
    'ppu': '[DtD] px/đơn vị của sprite quán; mọi nhân vật + đồ đạc đặt scale 2 [DtD] → 50 px ảnh = 1 đơn vị.',
    'room': '[DtD] vị trí, sortingOrder, ghế, cửa lấy từ scene DR_SushiBar + prefab Sushi_BG_Night_Re. '
            '[ĐỀ XUẤT] cách gộp sprite thành lớp theo dải sortingOrder (orders). z = sortingOrder để chen nhân vật.',
    'dave': '[DtD] mọi khung + ms từ clip Staffs/Dave/Animations; sortingOrder từ prefab Staff_Dave.',
    'bancho': '[DtD] mọi khung + ms từ clip Staffs/Bancho/Animations (+ Cheers của cutscene chương 1).',
    'cat': '[DtD] mèo Momo trong quán (prefab cat001, clip Cat_momo).',
    'customers': '[DtD] 25 khách thường, trang phục Default; clip chung CustomerAnimator; data = hàng NPC.Customer.',
    'customerEat': '[DtD] NPC.CustomerEat theo EatLevel: thời gian gọi món, chờ, ăn (giây).',
    'dishes': '[DtD] tid cá (HX_ASSETS.fish) → Recipe: tên (khoá chữ gốc), giá, icon.',
    'genericDishes': '[ĐỀ XUẤT] chọn 4 món gốc làm hình dự phòng; giá + hình vẫn là [DtD].',
    'tea': '[DtD] ly trà + bong bóng gọi trà.',
    'ui': '[DtD] sprite + bố cục RectTransform + DOTween + clip của prefab UI quán.',
    'vfx': '[DtD] hệ hạt: ảnh, lưới khung (tilesX/Y), tham số main/emission/shape.',
    'audio': '[DtD] clip gốc → mp3 (mono 96 kbps, cắt lặng đầu/cuối).',
    'missing': 'Thứ đã tìm mà game gốc không có (hoặc tool chưa rút được) — không vẽ thay.',
}


# Đã tìm trong bundle mà game gốc không có (đo 2026-09-24) — game web không được vẽ thay.
KNOWN_ABSENT = [
    {'what': 'room', 'id': 'backWall', 'why': 'sau quán là cảnh 3D (Lobby_Env_SushiBar: trời, biển), không có tường sau dạng sprite'},
    {'what': 'audio', 'id': 'doorBell', 'why': 'không có tiếng chuông/cửa khi khách vào; chỉ có sushi_customer_enter_talk_*'},
    {'what': 'audio', 'id': 'customerHappyAngryVO', 'why': 'khách thường không có giọng vui/giận riêng'},
    {'what': 'vfx', 'id': 'cookSmokeMain', 'why': 'quán chính không có khói nấu; chỉ DLC Jungle có (vfx.cookSmoke_JungleDLC)'},
    {'what': 'dave', 'id': 'serveHandOff', 'why': 'không có clip đưa món riêng; Serve (đi bưng) + Serve_Idle (đứng bưng) là tất cả'},
]


def write_manifest():
    man = {}
    for part in ('room', 'chars', 'dishes', 'ui', 'audio'):
        d = read_part(part)
        if d:
            man.update(d)
    order = ['ppu', 'room', 'dave', 'bancho', 'cat', 'customers', 'customerEat', 'dishes', 'genericDishes', 'tea',
             'dishIconSize', 'ui', 'vfx', 'audio', 'missing']
    man['ppu'] = PPU
    miss = []
    for k in [k for k in man if k.startswith('missing')]:
        if k != 'missing':
            miss += man.pop(k)
    man['missing'] = miss + KNOWN_ABSENT
    os.makedirs(DATA, exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(HEADER)
        fh.write('window.HX_BAR_ASSETS = {\n')
        keys = [k for k in order if k in man] + sorted(k for k in man if k not in order)
        for i, k in enumerate(keys):
            if k in SECTION_NOTES:
                fh.write('  // %s\n' % SECTION_NOTES[k])
            body = json.dumps(man[k], ensure_ascii=False, separators=(',', ':'), sort_keys=True)
            fh.write('  %s: %s%s\n' % (json.dumps(k), body, ',' if i < len(keys) - 1 else ''))
        fh.write('};\n')
    return OUT_JS


# ================================================================ MAIN
def main():
    init()
    what = sys.argv[1:] or ['room', 'chars', 'dishes', 'ui', 'audio']
    if 'room' in what:
        print('Phòng…')
        write_part('room', {'room': rip_room()})
    if 'chars' in what:
        for sub in ('dave', 'bancho', 'cat', 'customers'):
            shutil.rmtree(os.path.join(ART, sub), ignore_errors=True)
        print('Dave…')
        dave = rip_dave()
        print('Bancho…')
        bancho = rip_bancho()
        print('Mèo…')
        cat = rip_cat()
        print('Khách…')
        cust, eat, miss = rip_customers()
        write_part('chars', {'dave': dave, 'bancho': bancho, 'cat': cat, 'customers': cust, 'customerEat': eat,
                             'missingChars': miss})
    if 'dishes' in what:
        print('Món…')
        write_part('dishes', rip_dishes())
    if 'ui' in what:
        print('UI + VFX…')
        write_part('ui', rip_ui())
    if 'audio' in what:
        print('Tiếng…')
        write_part('audio', rip_audio())
    print('xong ->', write_manifest())


if __name__ == '__main__':
    main()
