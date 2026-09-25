# -*- coding: utf-8 -*-
"""Bóc UI cảm ứng của bản di động Dave the Diver (XD port, APK 1.0.30) cho Hố Xanh.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_mobile.py          # art/ui/mobile/*.png + data/mobile_ui.js
    python games/ho-xanh/tools/rip_mobile.py dump P   # in cây RectTransform của prefab P (đường dẫn gốc)
Biến môi trường: DTD_APK (tệp .apk), DTD_MOBILE_CACHE (chỗ đệm, mặc định D:/drmobile-extract).

Bundle đọc thẳng từ zip (mục STORED, không giải nén), nên không cần bung 2,9 GB ra đĩa.
Lần đầu quét m_Container của 2.226 bundle (~3 phút) rồi đệm bảng tra ở DTD_MOBILE_CACHE.

Đo được (2026-09-25):
- Bản Android là bản port của XD. HUD cảm ứng lúc lặn là nhánh InGameTouchCanvas trong
  Assets/XD/Prefab/XD_Variant/MainCanvas.prefab; CanvasScaler ScaleWithScreenSize 2340×1080, khớp bề ngang.
- Cần trái: OnScreenStick_Normal, m_Behaviour 2 (ExactPositionWithDynamicOrigin), tầm 150, gốc nổi trong 500;
  vùng chạm Left Joystick 2400×1800 đặt tâm ở góc dưới trái; canHideAll = 1 (ẩn khi không chạm).
- Nút bắn là cần ngắm OnScreenStick_Fire (m_Behaviour 0 = RelativePositionWithStaticOrigin, tầm 160), thả trong
  ô Button_cancle (取消射击) là huỷ. Tên sprite gốc là tiếng Trung, tệp ra đặt tên Latinh (xem SPRITES).
- Chữ trên nút (Level, Ammo) là TextMeshPro, không xuất font; bản web dùng Snowstorm đã có.
"""
import io, json, os, re, sys, zipfile

import UnityPy

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT_ART = os.path.join(GAME, 'art', 'ui', 'mobile')
OUT_JS = os.path.join(GAME, 'data', 'mobile_ui.js')
APK = os.environ.get('DTD_APK', os.path.expanduser(r'~\Downloads\DAVE+THE+DIVER_1.0.30_APKPure.apk'))
CACHE = os.environ.get('DTD_MOBILE_CACHE', r'D:\drmobile-extract')
AA = 'assets/aa/Android/'

_ZIP = None


def apk():
    global _ZIP
    if _ZIP is None:
        _ZIP = zipfile.ZipFile(APK)
    return _ZIP


def bundle_bytes(name):
    return apk().read(AA + name)


def bundle_index():
    """{'path': path gốc -> bundle, 'cab': CAB -> bundle}. Xoá tệp đệm để quét lại."""
    p = os.path.join(CACHE, 'bundle_index.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    os.makedirs(CACHE, exist_ok=True)
    paths, cabs = {}, {}
    names = sorted(n[len(AA):] for n in apk().namelist() if n.startswith(AA) and n.endswith('.bundle'))
    for n, f in enumerate(names):
        try:
            env = UnityPy.load(bundle_bytes(f))
        except Exception as e:  # noqa: BLE001
            print('  bỏ %s: %s' % (f, e), flush=True)
            continue
        for fl in env.files.values():
            for cab in getattr(fl, 'files', {}):
                cabs[cab.lower()] = f
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for k, _ in o.read().m_Container:
                    paths.setdefault(k, f)
                break
        if n % 200 == 0:
            print('  quét bundle %d/%d' % (n, len(names)), flush=True)
    out = {'path': paths, 'cab': cabs}
    json.dump(out, open(p, 'w', encoding='utf-8'))
    return out


IDX = None
CABS = None
_ENVS = {}


def env_of(bundle, deps=()):
    key = (bundle,) + tuple(sorted(deps))
    if key not in _ENVS:
        _ENVS[key] = UnityPy.load(*[bundle_bytes(b) for b in key])
    return _ENVS[key]


def with_deps(bundle, read):
    """Chạy read(env); gặp PPtr trỏ sang CAB của bundle khác thì nạp thêm bundle đó rồi chạy lại."""
    deps = set()
    while True:
        try:
            return read(env_of(bundle, deps))
        except FileNotFoundError as e:
            m = re.search(r'(cab-[0-9a-f]+)', str(e), re.I)
            if not m:
                raise
            cab = m.group(1).lower()
            if cab not in CABS or CABS[cab] in deps:
                raise
            deps.add(CABS[cab])


def init():
    global IDX, CABS
    ix = bundle_index()
    IDX, CABS = ix['path'], ix['cab']


def r3(v):
    return round(float(v), 3)


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ('Transform', 'RectTransform'):
            return c.component.read()


def children(go):
    return [ch.read().m_GameObject.read() for ch in transform_of(go).m_Children]


def script_name(mb):
    try:
        return mb.m_Script.read().m_ClassName
    except Exception:  # noqa: BLE001
        return None


def sprite_name(ptr):
    if not ptr or not ptr.m_PathID:
        return None
    return ptr.read().m_Name


def node(go, depth=0, maxdepth=99):
    t = transform_of(go)
    n = {'name': go.m_Name}
    if not go.m_IsActive:
        n['off'] = 1
    if type(t).__name__ == 'RectTransform':
        n['rt'] = [r3(t.m_AnchorMin.x), r3(t.m_AnchorMin.y), r3(t.m_AnchorMax.x), r3(t.m_AnchorMax.y),
                   r3(t.m_AnchoredPosition.x), r3(t.m_AnchoredPosition.y), r3(t.m_SizeDelta.x), r3(t.m_SizeDelta.y),
                   r3(t.m_Pivot.x), r3(t.m_Pivot.y)]
    sc = t.m_LocalScale
    if (r3(sc.x), r3(sc.y)) != (1.0, 1.0):
        n['scale'] = [r3(sc.x), r3(sc.y)]
    for c in go.m_Component:
        tn = c.component.type.name
        if tn in ('Transform', 'RectTransform', 'CanvasRenderer'):
            continue
        if tn == 'MonoBehaviour':
            mb = c.component.read()
            nm = script_name(mb) or '?'
            try:
                tt = c.component.read_typetree()
            except Exception:  # noqa: BLE001
                tt = {}
            if 'm_Sprite' in tt and 'm_FillMethod' in tt:
                img = {'sprite': sprite_name(mb.m_Sprite), 'type': tt['m_Type']}
                col = tt['m_Color']
                if (r3(col['r']), r3(col['g']), r3(col['b']), r3(col['a'])) != (1, 1, 1, 1):
                    img['color'] = [r3(col['r']), r3(col['g']), r3(col['b']), r3(col['a'])]
                if not tt.get('m_Enabled', 1):
                    img['off'] = 1
                if tt.get('m_PreserveAspect'):
                    img['aspect'] = 1
                n['img'] = img
            elif 'm_text' in tt:
                n['text'] = {'text': tt['m_text'], 'size': r3(tt.get('m_fontSize', 0))}
            else:
                f = {}
                for k, v in tt.items():
                    if k.startswith('m_') and k in ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name', 'm_EditorHideFlags',
                                                    'm_EditorClassIdentifier', 'm_CorrespondingSourceObject',
                                                    'm_PrefabInstance', 'm_PrefabAsset', 'm_ObjectHideFlags'):
                        continue
                    if isinstance(v, (int, float, str, bool)):
                        f[k] = r3(v) if isinstance(v, float) else v
                    elif isinstance(v, dict) and set(v) <= {'x', 'y', 'z', 'w'}:
                        f[k] = [r3(x) for x in v.values()]
                    elif isinstance(v, dict) and 'm_PathID' in v:
                        if v['m_PathID']:
                            f[k] = '->'
                    elif isinstance(v, dict) and set(v) == {'r', 'g', 'b', 'a'}:
                        f[k] = [r3(x) for x in v.values()]
                n.setdefault('mb', []).append({nm: f})
        elif tn == 'Canvas':
            cv = c.component.read_typetree()
            n['canvas'] = {'mode': cv.get('m_RenderMode'), 'order': cv.get('m_SortingOrder')}
        elif tn == 'CanvasGroup':
            n['alpha'] = r3(c.component.read().m_Alpha)
        else:
            n.setdefault('comp', []).append(tn)
    if depth < maxdepth:
        kids = [node(ch, depth + 1, maxdepth) for ch in children(go)]
        if kids:
            n['kids'] = kids
    return n


def dump(path, sub=None):
    """Cây node của prefab path (hoặc chỉ nhánh tên sub). Nạp thêm bundle phụ thuộc tới khi đọc được mọi sprite."""
    def go(env):
        root = None
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for k, ptr in o.read().m_Container:
                    if k == path and ptr.asset.deref().type.name == 'GameObject':
                        root = ptr.asset.deref().read()
                break
        if sub:
            root = find_go(root, sub)
        return node(root)
    return with_deps(IDX[path], go)


def find_go(go, name):
    if go.m_Name == name:
        return go
    for ch in children(go):
        r = find_go(ch, name)
        if r is not None:
            return r
    return None


# ---------------------------------------------------------------- HUD cảm ứng lúc lặn
MAIN = 'Assets/XD/Prefab/XD_Variant/MainCanvas.prefab'
REF = (2340.0, 1080.0)  # CanvasScaler của InGameTouchCanvas: ScaleWithScreenSize, khớp theo bề ngang

# vai -> (đường dẫn node dưới InGameTouchCanvas, góc màn hình để đo khoảng cách tới tâm)
# góc: 'bl' dưới trái, 'br' dưới phải, 'tr' trên phải
CONTROLS = {
    'stick':   ('GameObject/leftButtom/Left Joystick/Background', 'bl'),
    'knob':    ('GameObject/leftButtom/Left Joystick/Handle', 'bl'),
    'stickZone': ('GameObject/leftButtom/Left Joystick', 'bl'),
    'dash':    ('GameObject/Dash/ShortDash', 'br'),
    'dashBtn': ('GameObject/Dash/ShortDash/ShortDashButton', 'br'),
    'dashIcon': ('GameObject/Dash/ShortDash/ShortDashButton/Image (2)', 'br'),
    'dashCd': ('GameObject/Dash/ShortDash/ShortDashButton/Slider/Fill Area/Fill', 'br'),
    'boost':   ('GameObject/Dash/加速', 'br'),
    'boostOn': ('GameObject/Dash/加速/Image (1)', 'br'),
    'boostIcon': ('GameObject/Dash/加速/Image', 'br'),
    'melee':   ('GameObject/RegionFish/GameObject/Button_melee', 'br'),
    'meleeIcon': ('GameObject/RegionFish/GameObject/Button_melee/Image', 'br'),
    'interact': ('GameObject/RegionFish/GameObject/Button_Interact', 'br'),
    'cancel':  ('GameObject/RegionFish/GameObject/Button_cancle', 'tr'),
    'fire':    ('GameObject/RegionFish/GameObject/Right JoystickArea/GunBackground', 'br'),
    'fireIcon': ('GameObject/RegionFish/GameObject/Right JoystickArea/GunBackground/GunShow', 'br'),
    'fireLevel': ('GameObject/RegionFish/GameObject/Right JoystickArea/GunBackground/Level', 'br'),
    'fireAmmo': ('GameObject/RegionFish/GameObject/Right JoystickArea/GunBackground/Ammo', 'br'),
    'sub':     ('GameObject/RegionFish/GameObject/Right JoystickArea/SubGunBackground', 'br'),
    'switch':  ('GameObject/RegionFish/GameObject/Right JoystickArea/Switchbutton', 'br'),
    'aimBg':   ('GameObject/RegionFish/GameObject/Right JoystickArea/AimBackground', 'br'),
    'aim':     ('GameObject/RegionFish/GameObject/Right JoystickArea/Handle', 'br'),
    'qte':     ('GameObject/RegionFish/HarpoonQTE', 'br'),
    'qteBtn':  ('GameObject/RegionFish/HarpoonQTE/Image (2)', 'br'),
    'qteRing': ('GameObject/RegionFish/HarpoonQTE/Image (1)', 'br'),
    'menu':    ('GameObject/暂停/SettingButton', 'tr'),
}

# tên tệp -> (vai, lấy sprite từ đâu): 'img' = Image của node, hoặc tên trường sprite của OnScreenStick_Fire
SPRITES = {
    'stick_bg': ('stick', 'img'),
    'stick_knob': ('knob', 'img'),
    'btn_blue': ('melee', 'img'),
    'icon_knife': ('meleeIcon', 'img'),
    'btn_interact': ('interact', 'img'),
    'boost_icon': ('boostIcon', 'img'),
    'boost_on': ('boostOn', 'img'),
    'dash_icon': ('dashIcon', 'img'),
    'cd_mask': ('dashCd', 'img'),
    'fire_bg': ('fire', 'img'),
    'icon_harpoon': ('fireIcon', 'img'),
    'switch': ('switch', 'img'),
    'aim_bg': ('aim', 'm_aim_SpriteBackGroundBlue'),
    'aim_bg_red': ('aim', 'm_aim_SpriteBackGroundRed'),
    'aim': ('aim', 'm_aim_SpriteNormalBlue'),
    'aim_red': ('aim', 'm_aim_SpriteNormalRed'),
    'cancel': ('aim', 'm_aim_SpriteCancleBlue'),
    'cancel_red': ('aim', 'm_aim_SpriteCancleRed'),
    'cancel_x': ('aim', 'm_aim_SpriteCancleXBlue'),
    'cancel_x_red': ('aim', 'm_aim_SpriteCancleXRed'),
    'qte_btn': ('qteBtn', 'img'),
    'qte_ring': ('qteRing', 'img'),
    'menu': ('menu', 'img'),
}

# số của các bộ điều khiển: (vai, script, [trường])
NUMBERS = [
    ('knob', 'OnScreenStick_Normal', ['m_MovementRange', 'm_DynamicOriginRange', 'm_Behaviour', 'canHideAll']),
    ('aim', 'OnScreenStick_Fire', ['m_MovementRange', 'm_DynamicOriginRange', 'm_Behaviour']),
]


def go_at(root, path):
    go = root
    for name in path.split('/'):
        nxt = [c for c in children(go) if c.m_Name == name]
        if not nxt:
            raise KeyError('không có node %s (ở %s)' % (name, path))
        go = nxt[0]
    return go


def rect_in(t, parent):
    """Hình chữ nhật (x0, y0, x1, y1) của RectTransform t trong hệ toạ độ canvas gốc dưới trái."""
    px0, py0, px1, py1 = parent
    pw, ph = px1 - px0, py1 - py0
    ax0, ax1 = px0 + t.m_AnchorMin.x * pw, px0 + t.m_AnchorMax.x * pw
    ay0, ay1 = py0 + t.m_AnchorMin.y * ph, py0 + t.m_AnchorMax.y * ph
    w, h = ax1 - ax0 + t.m_SizeDelta.x, ay1 - ay0 + t.m_SizeDelta.y
    rx = ax0 + (ax1 - ax0) * t.m_Pivot.x + t.m_AnchoredPosition.x
    ry = ay0 + (ay1 - ay0) * t.m_Pivot.y + t.m_AnchoredPosition.y
    x0, y0 = rx - t.m_Pivot.x * w, ry - t.m_Pivot.y * h
    return (x0, y0, x0 + w, y0 + h)


def control_rect(root, path):
    """Tâm, cỡ và độ phóng tích luỹ của node path, trên canvas REF."""
    rect, go, sx, sy = (0.0, 0.0) + REF, root, 1.0, 1.0
    for name in path.split('/'):
        go = [c for c in children(go) if c.m_Name == name][0]
        t = transform_of(go)
        rect = rect_in(t, rect)
        sx, sy = sx * t.m_LocalScale.x, sy * t.m_LocalScale.y
    return go, rect, (sx, sy)


def image_sprite(go):
    for c in go.m_Component:
        if c.component.type.name == 'MonoBehaviour':
            tt = c.component.read_typetree()
            if 'm_Sprite' in tt and 'm_FillMethod' in tt and tt['m_Sprite']['m_PathID']:
                return c.component.read().m_Sprite.read()
    raise KeyError('node %s không có Image' % go.m_Name)


def script_of(go, name):
    for c in go.m_Component:
        if c.component.type.name == 'MonoBehaviour':
            mb = c.component.read()
            if script_name(mb) == name:
                return mb, c.component.read_typetree()
    raise KeyError('node %s không có %s' % (go.m_Name, name))


def layout_entry(rect, scale, corner):
    x0, y0, x1, y1 = rect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    dx = REF[0] - cx if corner[1] == 'r' else cx
    dy = REF[1] - cy if corner[0] == 't' else cy
    e = {'corner': corner, 'dx': r3(dx), 'dy': r3(dy), 'w': r3(x1 - x0), 'h': r3(y1 - y0)}
    if (r3(scale[0]), r3(scale[1])) != (1.0, 1.0):
        e['scale'] = r3(scale[0])
    return e


def rip_dive_touch():
    os.makedirs(OUT_ART, exist_ok=True)

    def go(env):
        root = None
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for k, ptr in o.read().m_Container:
                    if k == MAIN and ptr.asset.deref().type.name == 'GameObject':
                        root = ptr.asset.deref().read()
                break
        tc = find_go(root, 'InGameTouchCanvas')
        scaler = script_of(tc, 'CanvasScaler')[1]
        ref = scaler['m_ReferenceResolution']
        if (ref['x'], ref['y']) != REF or scaler['m_MatchWidthOrHeight'] != 0:
            raise ValueError('CanvasScaler đổi: %r' % scaler)
        gos, layout = {}, {}
        for role, (path, corner) in CONTROLS.items():
            g, rect, sc = control_rect(tc, path)
            gos[role] = g
            layout[role] = layout_entry(rect, sc, corner)
        sprites = {}
        for fn, (src, how) in SPRITES.items():
            g = gos[src] if src in gos else go_at(tc, src)
            if how == 'img':
                spr = image_sprite(g)
            else:
                mb, _ = script_of(g, 'OnScreenStick_Fire')
                spr = getattr(mb, how).read()
            img = spr.image.convert('RGBA')
            img.save(os.path.join(OUT_ART, fn + '.png'), optimize=True)
            sprites[fn] = {'src': spr.m_Name, 'w': img.size[0], 'h': img.size[1]}
        numbers = {}
        for role, script, fields in NUMBERS:
            _, tt = script_of(gos[role], script)
            numbers[role] = {f: r3(tt[f]) if isinstance(tt[f], float) else tt[f] for f in fields}
        return {'ref': list(REF), 'layout': layout, 'sprites': sprites, 'numbers': numbers}
    return with_deps(IDX[MAIN], go)


HEADER = ('// Sinh bởi tools/rip_mobile.py từ bản Android của Dave the Diver (APK 1.0.30) — đừng sửa tay.\n'
          '// Chạy lại: python games/ho-xanh/tools/rip_mobile.py\n'
          '// Nguồn: Assets/XD/Prefab/XD_Variant/MainCanvas.prefab > InGameTouchCanvas.\n'
          '// Toạ độ theo canvas gốc 2340×1080 (CanvasScaler ScaleWithScreenSize, khớp bề ngang):\n'
          '// 1 đơn vị = bề ngang màn hình / 2340. layout[vai] = {corner, dx, dy (từ góc tới tâm), w, h, scale}.\n')


def main():
    init()
    if len(sys.argv) > 2 and sys.argv[1] == 'dump':
        print(json.dumps(dump(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None), ensure_ascii=False, indent=1))
        return
    data = rip_dive_touch()
    data['art'] = 'art/ui/mobile/'
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(HEADER)
        f.write('window.HX_MOBILE_UI = {\n')
        for k in ('ref', 'art', 'numbers'):
            f.write('  %s: %s,\n' % (k, json.dumps(data[k], ensure_ascii=False)))
        for k in ('layout', 'sprites'):
            f.write('  %s: {\n' % k)
            for role, v in data[k].items():
                f.write('    %s: %s,\n' % (json.dumps(role, ensure_ascii=False), json.dumps(v, ensure_ascii=False)))
            f.write('  },\n')
        f.write('};\n')
    print('ghi', OUT_JS, len(data['sprites']), 'ảnh')


if __name__ == '__main__':
    main()
