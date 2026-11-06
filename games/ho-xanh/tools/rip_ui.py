# -*- coding: utf-8 -*-
"""Rút UI của màn chuẩn bị (app iDiver, app súng của Duff) và font UI của Dave the Diver cho Hố Xanh.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_ui.py               # tất cả
    python games/ho-xanh/tools/rip_ui.py idiver fonts  # vài phần: idiver duff fonts

Chỉ import rip.py và rip_bar.py, không sửa chúng. Cần bảng bundle mà rip.py đã đệm
(%TEMP%/ho-xanh-rip/bundle_index.json) và guid_map.json mà rip_boat.py đã đệm (để giải GUID font).
Chạy SAU rip_boat.py: `rip_boat.py vfx gear` xoá cả art/gear/ (gồm art/gear/idiver/ui, layout, duff của tool này).

Ra:
  art/gear/idiver/ui/*.png        sprite của iDiverPanel + IDiverScrollCellView chưa có ở art/gear/idiver/
                                  (Box_8rad, Box_8rad_Stroke, UI_WeaponCraft_Cell_Btn_Pink/Grey, Box_6rad, Coin…)
  art/gear/idiver/vfx/*.png       ảnh hạt của VFX nâng cấp nằm trong LevelUpPopup
  art/gear/idiver/layout/*.json   bố cục prefab (định dạng rip_bar.dump_node) + gradient, font từng chữ
  art/gear/duff/*.png             nền app súng PhoneBg_Duff, logo UI_WeaponCraft_Logo
  art/gear/duff/vfx/*.png         ảnh hạt của VFX_UI_WeaponCraft_NewWeapn_*
  art/gear/duff/layout/*.json     phần đầu app súng + khung chỉ số, ba VFX "súng mới"
  art/fonts/*                     font gốc có TTF/OTF nhúng trong asset Font (m_FontData)
  data/ui_assets.js               window.HX_UI_ASSETS
"""
import io, json, os, re, shutil, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rip  # noqa: E402
import rip_bar as rb  # noqa: E402

GAME = os.path.dirname(HERE)
IDV_DIR = os.path.join(GAME, 'art', 'gear', 'idiver')
DUFF_DIR = os.path.join(GAME, 'art', 'gear', 'duff')
FONT_DIR = os.path.join(GAME, 'art', 'fonts')
OUT_JS = os.path.join(GAME, 'data', 'ui_assets.js')
PHONE = rb.PC + 'Phone/'
FONTS = 'Assets/Contents/Fonts/'
UIDATA = 'Assets/ScriptableObjects/UIDataText/'

IDV_PREFABS = [('panel', 'Phone_iDiver/Prefabs/iDiverPanel.prefab'), ('cell', 'Phone_iDiver/Prefabs/IDiverScrollCellView.prefab')]
DUFF_PREFAB = PHONE + 'Phone_WeaponShop/Prefabs/WeaponCraftPanel.prefab'
DUFF_IMAGES = {'bg': PHONE + 'Phone_WeaponShop/Sprites/NonPacked/PhoneBg_Duff.png',
               'logo': PHONE + 'Phone_WeaponShop/Sprites/NonPacked/UI_WeaponCraft_Logo.png'}
# Nhánh của WeaponCraftPanel cần cho thẻ Súng (bảng đầy đủ 4.005 nút, phần lớn là cây chế súng 3D/notebook).
DUFF_KEEP = ['CraftMenuPanel', 'CraftPlanInfoPanel']
NEW_WEAPON_VFX = [('newWeapon', 'VFX_UI_WeaponCraft_NewWeapn_A_01'), ('newWeaponBG', 'VFX_UI_WeaponCraft_NewWeapn_BG_A_01'),
                  ('newWeaponTitle', 'VFX_UI_WeaponCraft_NewWeapn_Title_A_01')]
# Bốn sprite màn chuẩn bị từng phải thay bằng sprite gần giống; tool dừng hẳn nếu thiếu.
MUST_HAVE = ['Box_8rad', 'Box_8rad_Stroke', 'UI_WeaponCraft_Cell_Btn_Pink', 'UI_WeaponCraft_Cell_Btn_Grey']
# Nút tay cầm / phím trên nút bấm: web không có, không xuất [ĐỀ XUẤT]
SKIP_SPRITE = re.compile(r'^(XboxOne_|Controlbox|Ctrl_Key|Space_Key|PS\d|Switch_)')
# Font xuất ra web: Snowstorm (chữ tiêu đề, nút, số của bản tiếng Anh) và Roboto-Medium (chữ thân bản tiếng Anh).
FONT_EXPORT = {'snowstorm': 'Snowstorm.otf', 'roboto': 'Roboto-Medium.ttf'}
# Mẫu thử phủ dấu tiếng Việt: đủ 134 chữ có dấu thường + hoa, và vài ký hiệu màn chuẩn bị dùng.
VI_SAMPLE = (u'aăâbcdđeêghiklmnoôơpqrstuưvxyAĂÂBCDĐEÊGHIKLMNOÔƠPQRSTUƯVXY'
             u'àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ'
             u'ÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ0123456789·→×±°≤₂−')
# Mã ngôn ngữ trong UIFontContainer / UIFontOverride_* (enum riêng của game, đoán theo font: 23 Hàn → 210Youth,
# 22 Nhật → NotoSansJP, 6 Trung giản → NotoSansSC, 41 Trung phồn, 36 Thái → Anuphan, 37/27 → Apotek). 10 = tiếng Anh.
LANG_EN = 10


def rel(p):
    return os.path.relpath(p, GAME).replace('\\', '/')


def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return rel(path)


def save_json(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    return rel(path)


def colj(c):
    return [round(float(c['r']), 3), round(float(c['g']), 3), round(float(c['b']), 3), round(float(c['a']), 3)]


def ugradient(g):
    """UnityEngine.Gradient (typetree) -> {'color': [[t, r, g, b]], 'alpha': [[t, a]], 'mode': 0 blend | 1 fixed,
    'stops': [[t, r, g, b, a]]} với stops = hợp các mốc màu và mốc alpha, nội suy tuyến tính như Gradient.Evaluate."""
    nc, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    color = [[round(g['ctime%d' % i] / 65535.0, 4)] + colj(g['key%d' % i])[:3] for i in range(nc)]
    alpha = [[round(g['atime%d' % i] / 65535.0, 4), round(float(g['key%d' % i]['a']), 3)] for i in range(na)]
    fixed = g.get('m_Mode', 0) == 1

    def ev(keys, t, n):
        if t <= keys[0][0]:
            return keys[0][1:]
        for a, b in zip(keys, keys[1:]):
            if t <= b[0]:
                if fixed:
                    return b[1:]
                s = (t - a[0]) / max(1e-6, b[0] - a[0])
                return [a[j] + (b[j] - a[j]) * s for j in range(1, n + 1)]
        return keys[-1][1:]
    ts = sorted({k[0] for k in color} | {k[0] for k in alpha} | {0.0, 1.0})
    stops = [[t] + [round(v, 3) for v in ev(color, t, 3) + ev(alpha, t, 1)] for t in ts]
    return {'color': color, 'alpha': alpha, 'mode': g.get('m_Mode', 0), 'stops': stops}


# ================================================================ bổ sung cho rip_bar.dump_node
# dump_node của rip_bar bỏ qua PPtr và mảng trong MonoBehaviour. Bọc nó để ghi thêm:
#   - gradient: Gradient2 (UI Extensions) và JoshH.UI.UIGradient, đủ mốc màu
#   - text.font: preset UIFontOverride_* của UIDataText, font TMP và material
# dump_node đệ quy qua tên toàn cục rb.dump_node nên con cháu cũng đi qua hàm bọc.
_DUMP = rb.dump_node
G2_TYPE = ['horizontal', 'vertical', 'radial', 'diamond']       # Gradient2.Type
G2_BLEND = ['override', 'add', 'multiply']                       # Gradient2.Blend
UG_TYPE = ['linear', 'corner', 'complexLinear']                  # JoshH.UI.UIGradient.UIGradientType
UG_BLEND = ['override', 'multiply']                              # JoshH.UI.UIGradient.UIGradientBlendMode


def _name(ptr):
    if not ptr.m_PathID:
        return None
    try:
        return ptr.read().m_Name
    except FileNotFoundError:
        raise  # rb.with_deps nạp thêm bundle rồi chạy lại
    except Exception:
        return None


def dump_node_x(go, ctx):
    n = _DUMP(go, ctx)
    if n.get('skipped'):
        return n
    if 'particle' in n:
        # rip_bar.particle chỉ ghi startSize; hạt 3D-size (ảnh chữ "UPGRADE", "NEW WEAPON" 300×150) còn startSizeY riêng
        for c in go.m_Component:
            if c.component.type.name == 'ParticleSystem':
                im = c.component.read_typetree()['InitialModule']
                if im.get('size3D'):
                    n['particle']['sizeY'] = rb.mmcurve(im['startSizeY'])
    for c in go.m_Component:
        if c.component.type.name != 'MonoBehaviour':
            continue
        r = c.component.read()
        cls = rb.script_name(r)
        if cls not in ('Gradient2', 'UIGradient', 'UIDataText', 'TextMeshProUGUI'):
            continue
        tt = c.component.read_typetree()
        if cls == 'Gradient2':
            g = {'kind': 'Gradient2', 'type': G2_TYPE[tt['_gradientType']] if tt['_gradientType'] < 4 else tt['_gradientType'],
                 'blend': G2_BLEND[tt['_blendMode']] if tt['_blendMode'] < 3 else tt['_blendMode'],
                 'offset': round(float(tt['_offset']), 3), 'gradient': ugradient(tt['_effectGradient'])}
            if 'm_zoom' in tt:
                g['zoom'] = round(float(tt['m_zoom']), 3)
            n.setdefault('gradients', []).append(g)
        elif cls == 'UIGradient':
            t = tt['gradientType']
            g = {'kind': 'UIGradient', 'type': UG_TYPE[t] if t < 3 else t, 'blend': UG_BLEND[tt['blendMode']] if tt['blendMode'] < 2 else tt['blendMode'],
                 'intensity': round(float(tt['intensity']), 3), 'angle': round(float(tt['angle']), 3)}
            if g['type'] == 'linear':
                g['colors'] = [colj(tt['linearColor1']), colj(tt['linearColor2'])]
            elif g['type'] == 'corner':
                g['corners'] = {k: colj(tt['cornerColor' + k]) for k in ('UpperLeft', 'UpperRight', 'LowerRight', 'LowerLeft')}
            else:
                g['gradient'] = ugradient(tt['linearGradient'])
            n.setdefault('gradients', []).append(g)
        elif cls == 'UIDataText' and 'text' in n:
            f = {'preset': _name(r._fontOverridePreset) if tt['_fontOverridePreset']['m_PathID'] else None}
            cfg = tt.get('_fontOverride', {}).get('_overrideFontConfigs') or []
            if cfg:
                f['sizeOffset'] = {str(x['_fontType']): x['_sizeOffset'] for x in cfg if x['_sizeOffset']}
            keys = [e['_textKey'] for e in tt.get('_elements', []) if e.get('_textKey')]
            if keys:
                n['text']['key'] = keys[0]
            n['text'].setdefault('font', {}).update(f)
        elif cls == 'TextMeshProUGUI' and 'text' in n:
            n['text'].setdefault('font', {}).update({'tmp': _name(r.m_fontAsset), 'material': _name(r.m_sharedMaterial)})
    return n


rb.dump_node = dump_node_x


class Ctx(rb.UICtx):
    """Như rip_bar.UICtx nhưng ghi ảnh vào thư mục riêng; sprite trùng tên với ảnh rip_boat đã ghi thì trỏ tới ảnh đó."""

    def __init__(self, sprite_dir, tex_dir, reuse_dir=None, save_sprites=True, tex_reuse=None):
        rb.UICtx.__init__(self)
        self.sprite_dir, self.tex_dir, self.reuse_dir, self.save_sprites = sprite_dir, tex_dir, reuse_dir, save_sprites
        self.tex_reuse = tex_reuse

    def sprite(self, s):
        name = s.m_Name
        if name in self.sprites or name in self.skipped:
            return name
        w, h = int(round(s.m_Rect.width)), int(round(s.m_Rect.height))
        b = s.m_Border
        rec = {'w': w, 'h': h, 'border': [rb.r3(b.x), rb.r3(b.y), rb.r3(b.z), rb.r3(b.w)] if (b.x or b.y or b.z or b.w) else None,
               'pivot': [rb.r3(s.m_Pivot.x), rb.r3(s.m_Pivot.y)]}
        reuse = self.reuse_dir and os.path.join(self.reuse_dir, rb.safe(name) + '.png')
        if SKIP_SPRITE.match(name):
            rec['img'] = None
            rec['skipped'] = 'nút tay cầm/phím, web không dùng'
        elif reuse and os.path.exists(reuse):
            rec['img'] = rel(reuse)
        elif not self.save_sprites:
            rec['img'] = None
        elif max(w, h) > rb.MAX_UI_PX:
            self.skipped[name] = [w, h]
            return name
        else:
            img, _ = rb.sprite_full(s)
            rec['img'] = save_png(img, os.path.join(self.sprite_dir, rb.safe(name) + '.png'))
        self.sprites[name] = rec
        return name

    def texture(self, t):
        name = t.m_Name
        if type(t).__name__ != 'Texture2D':
            return {'runtime': type(t).__name__, 'name': name}
        if name not in self.textures and name not in self.skipped:
            img = t.image.convert('RGBA')
            if max(img.size) > 1024:
                self.skipped[name] = list(img.size)
                return name
            again = self.tex_reuse and os.path.join(self.tex_reuse, rb.safe(name) + '.png')
            if again and os.path.exists(again):
                src = rel(again)
            else:
                src = save_png(grey_la(img), os.path.join(self.tex_dir, rb.safe(name) + '.png'))
            self.textures[name] = {'img': src, 'w': img.width, 'h': img.height}
        return name


def grey_la(img):
    """Ảnh hạt xám (R=G=B) ghi dạng LA như rip_boat: nhẹ hơn, trình duyệt đọc ra cùng màu."""
    r, g, b, a = img.split()
    if r.tobytes() == g.tobytes() == b.tobytes():
        return img.convert('LA')
    return img


def find(n, name):
    if n.get('name') == name:
        return n
    for c in n.get('children', []):
        r = find(c, name)
        if r:
            return r
    return None


def walk(n):
    yield n
    for c in n.get('children', []):
        for x in walk(c):
            yield x


# ================================================================ hạt không vẽ được
def fx_unrenderable(p):
    """Hạt dạng mesh hoặc shader flow/mask tự viết: bản bóc chỉ có mặt nạ, vẽ thẳng ra khối đặc (xem README, bẫy khói Bancho)."""
    r = p.get('render') or {}
    props = r.get('props') or {}
    if r.get('mode') == 'mesh':
        return 'hạt dạng mesh'
    if re.search('Flow|Mask', r.get('shader') or '', re.I) or any(k in props for k in ('Flow', 'Mask')):
        return 'shader flow/mask (%s)' % (r.get('material') or r.get('shader'))
    return None


def prune_fx(roots, ctx):
    """Đánh dấu hạt không vẽ được (particle.skip) và bỏ ảnh chỉ chúng dùng. -> {tên nút: lý do}."""
    used, skipped = set(), {}
    for root in roots:
        for n in walk(root):
            p = n.get('particle')
            if not p:
                continue
            why = fx_unrenderable(p)
            if why:
                p['skip'] = why
                skipped[n['name']] = why
                continue
            tex = (p.get('render') or {}).get('texture')
            if isinstance(tex, str):
                used.add(tex)
    for name in list(ctx.textures):
        if name not in used:
            src = os.path.normpath(os.path.join(GAME, ctx.textures[name]['img']))
            if src.startswith(os.path.normpath(ctx.tex_dir)) and os.path.exists(src):
                os.remove(src)
            del ctx.textures[name]
    return skipped


# ================================================================ iDiver
def rip_idiver():
    for sub in ('ui', 'vfx', 'layout'):
        shutil.rmtree(os.path.join(IDV_DIR, sub), ignore_errors=True)
    ctx = Ctx(os.path.join(IDV_DIR, 'ui'), os.path.join(IDV_DIR, 'vfx'), reuse_dir=IDV_DIR)
    layouts, roots = {}, {}
    for key, p in IDV_PREFABS:
        root = rb.dump_prefab(PHONE + p, ctx)
        if root is None:
            raise SystemExit('prefab not found: ' + p)
        roots[key] = root
    skipped_fx = prune_fx(roots.values(), ctx)
    for key, p in IDV_PREFABS:
        layouts[key] = {'prefab': 'Phone/' + p, 'layout': save_json(roots[key], os.path.join(IDV_DIR, 'layout', key + '.json')),
                        'nodes': rb.count_nodes(roots[key])}
        print('  iDiver %-6s %d nút' % (key, layouts[key]['nodes']), flush=True)
    print('  %d sprite, %d ảnh hạt, bỏ %d hạt không vẽ được' % (len(ctx.sprites), len(ctx.textures), len(skipped_fx)), flush=True)
    panel, cell = roots['panel'], roots['cell']
    gone = [n for n in MUST_HAVE if not (ctx.sprites.get(n) or {}).get('img')]
    if gone:
        raise SystemExit('sprite not exported: ' + ', '.join(gone))
    # Hai gradient màn chuẩn bị cần (dải tiêu đề bảng lên cấp, nền ô cấp tối đa) + các UIGradient cùng bảng.
    lup = find(panel, 'LevelUpPopup')
    grads = {}
    for key, root, name in (('titleBand', lup, ' Title_BG'), ('maxLevelBG', cell, 'MaxLevelBG'), ('popupBG', lup, 'BG'),
                            ('popupStroke', find(lup, 'BG'), 'Image'), ('popupGlow', lup, 'VFX_BG'), ('thumbStroke', find(lup, 'Thumbnail'), 'Stroke')):
        n = find(root, name)
        if not n or not n.get('gradients'):
            raise SystemExit('gradient not found: ' + name)
        grads[key] = {'node': name.strip(), 'img': n.get('img'), 'rt': n.get('rt'), 'list': n['gradients']}
    return {'layouts': layouts, 'sprites': ctx.sprites, 'textures': ctx.textures, 'clips': ctx.clips, 'gradients': grads,
            'tooBig': ctx.skipped or None, 'skippedFx': skipped_fx or None}


# ================================================================ Duff (app súng)
def rip_duff():
    shutil.rmtree(DUFF_DIR, ignore_errors=True)
    out = {'images': {}, 'layouts': {}}
    for key, path in DUFF_IMAGES.items():
        spr = [o for o in rip.objects_for(path) if type(o).__name__ == 'Sprite']
        if not spr:
            raise SystemExit('sprite not found: ' + path)
        img, _ = rb.sprite_full(spr[0])
        out['images'][key] = {'img': save_png(img, os.path.join(DUFF_DIR, os.path.basename(path))), 'w': img.width, 'h': img.height,
                              'name': spr[0].m_Name}
    # bố cục app: đọc cả WeaponCraftPanel nhưng không ghi ảnh (4.005 nút); giữ hai nhánh cần cho thẻ Súng
    ctx = Ctx(os.path.join(DUFF_DIR, 'ui'), os.path.join(DUFF_DIR, 'vfx'), save_sprites=False)
    root = rb.dump_prefab(DUFF_PREFAB, ctx)
    keep = {'name': root['name'], 'rt': root.get('rt'), 'children': [find(root, k) for k in DUFF_KEEP]}
    if None in keep['children']:
        raise SystemExit('WeaponCraftPanel node not found: ' + ', '.join(DUFF_KEEP))
    info = keep['children'][1]
    for n in walk(info):  # cây chế tạo, nguyên liệu, nút phát triển: ngoài vòng chơi, cắt đi cho nhẹ
        if n.get('name') in ('CraftIngredientScroll (1)', 'DvelopPanel', 'BottomArea'):
            n.pop('children', None)
            n['cut'] = 'ngoài thẻ Súng, không ghi con'
    out['layouts']['app'] = {'prefab': DUFF_PREFAB.replace(rb.PC, ''), 'layout': save_json(keep, os.path.join(DUFF_DIR, 'layout', 'app.json'))}
    head = find(keep, 'HeaderImage')
    out['header'] = {'color': head['img'].get('color'), 'rt': head['rt'], 'logoRt': find(head, 'Logo')['rt']}
    # ba VFX "súng mới" (ảnh hạt ghi thật)
    vctx = Ctx(os.path.join(DUFF_DIR, 'ui'), os.path.join(DUFF_DIR, 'vfx'), tex_reuse=os.path.join(IDV_DIR, 'vfx'))
    vfx, roots = {}, {}
    for key, name in NEW_WEAPON_VFX:
        path = rb.VFXP + 'fUI_Effect/' + name + '.prefab'
        if path not in rb.IDX:
            raise SystemExit('vfx prefab not found: ' + name)
        roots[key] = (path, rb.dump_prefab(path, vctx))
    out['skippedFx'] = prune_fx([n for _, n in roots.values()], vctx) or None
    for key, (path, n) in roots.items():
        vfx[key] = {'prefab': path.replace(rb.PC, ''), 'layout': save_json(n, os.path.join(DUFF_DIR, 'layout', key + '.json')),
                    'systems': rb.count_nodes(n, 'particle')}
        print('  Duff VFX %-15s %d hệ hạt' % (key, vfx[key]['systems']), flush=True)
    out['vfx'] = vfx
    out['textures'] = vctx.textures
    out['sprites'] = {k: v for k, v in vctx.sprites.items() if v.get('img')}
    return out


# ================================================================ font
def rip_fonts():
    shutil.rmtree(FONT_DIR, ignore_errors=True)
    os.makedirs(FONT_DIR)
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        TTFont = None
        print('  (không có fontTools: bỏ đo phủ dấu tiếng Việt; pip install fonttools)')
    gm_p = os.path.join(rip.CACHE, 'guid_map.json')
    if not os.path.exists(gm_p):
        raise SystemExit('guid map not found: chạy rip_boat.py một lần để đệm ' + gm_p)
    gm = json.load(io.open(gm_p, encoding='utf-8'))
    bundle = rb.IDX[FONTS + 'Snowstorm.otf']

    def go(env):
        fonts, mbs = {}, {}
        for o in env.objects:
            if o.type.name == 'Font':
                f = o.read()
                data = f.m_FontData
                fonts[f.m_Name] = bytes(data) if not isinstance(data, bytes) else data
            elif o.type.name == 'MonoBehaviour':
                try:
                    tt = o.read_typetree()
                except Exception:
                    continue
                nm = tt.get('m_Name', '')
                if nm.startswith('UIFont') or 'm_FaceInfo' in tt:
                    mbs[nm] = {k: v for k, v in tt.items() if k in ('m_FaceInfo', '_fonts', '_languageDatas', '_fontConfigs', '_fontConfig')}
        return fonts, mbs
    fonts, mbs = rb.with_deps(bundle, go)
    cont = mbs['UIFontContainer']
    by_type = {}
    for f in cont['_fonts']:
        path = gm.get(f['_fontRef']['m_AssetGUID'], [None])[0]
        tmp = gm.get(f['_tmFontRef']['m_AssetGUID'], [None])[0]
        by_type[f['_fontType']] = {'file': os.path.basename(path) if path else None, 'tmp': os.path.basename(tmp)[:-6] if tmp else None}
    en = {d['_language']: d['_fontType'] for d in cont['_languageDatas']}
    files = {}
    all_fonts = {}
    for name, data in sorted(fonts.items()):
        if not data:
            continue
        rec = {'bytes': len(data)}
        if TTFont is not None:
            t = TTFont(io.BytesIO(data), lazy=True)
            cmap = t.getBestCmap()
            rec['family'] = t['name'].getDebugName(1)
            rec['copyright'] = (t['name'].getDebugName(0) or '').split('\n')[0].strip()
            rec['license'] = (t['name'].getDebugName(13) or '').split('\n')[0].strip() or None
            rec['viMissing'] = ''.join(ch for ch in VI_SAMPLE if ord(ch) not in cmap)
            rec['glyphs'] = len(cmap)
            rec['cmap'] = ranges(sorted(cmap))
        all_fonts[name] = rec
    for key, fname in FONT_EXPORT.items():
        stem = os.path.splitext(fname)[0]
        data = fonts.get(stem)
        if not data:
            raise SystemExit('font data not found: ' + fname)
        p = os.path.join(FONT_DIR, fname)
        with open(p, 'wb') as fh:
            fh.write(data)
        tmp = mbs.get(stem + ' SDF', {}).get('m_FaceInfo', {})
        rec = dict(all_fonts[stem])
        rec.update({'src': rel(p), 'faceScale': round(float(tmp.get('m_Scale', 1.0)), 3), 'pointSize': tmp.get('m_PointSize')})
        files[key] = rec
        print('  font %-10s %-18s %6d byte, thiếu %d/%d chữ mẫu tiếng Việt, TMP scale %s' % (
            key, fname, len(data), len(rec.get('viMissing', '')), len(VI_SAMPLE), rec['faceScale']))
    # preset UIFontOverride_* -> loại font bản tiếng Anh + độ lệch cỡ
    presets = {}
    names = {t: v['file'] for t, v in by_type.items()}
    for nm, mb in sorted(mbs.items()):
        if not nm.startswith('UIFontOverride_'):
            continue
        cfg = mb['_fontConfig']
        L = {d['_language']: d['_fontType'] for d in cfg['_overrideLanguageDatas']}
        t = L.get(LANG_EN, en.get(LANG_EN))
        off = {c['_fontType']: c['_sizeOffset'] for c in cfg['_overrideFontConfigs']}
        presets[nm] = {'en': names.get(t), 'sizeOffset': off.get(t, 0)}
    return {'files': files, 'all': {k: {kk: vv for kk, vv in v.items() if kk != 'cmap'} for k, v in all_fonts.items()},
            'types': {str(k): v for k, v in by_type.items()}, 'english': names.get(en.get(LANG_EN)), 'presets': presets}


def ranges(cps):
    out = []
    for c in cps:
        if out and c == out[-1][1] + 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return out


# ================================================================ manifest
HEADER = ('// Sinh bởi tools/rip_ui.py — đừng sửa tay. Chạy lại: python games/ho-xanh/tools/rip_ui.py\n'
          '// [DtD] mọi sprite, bố cục (rt = [anchorMin.x, anchorMin.y, anchorMax.x, anchorMax.y, pos.x, pos.y, sizeDelta.x,\n'
          '//       sizeDelta.y, pivot.x, pivot.y], px UI gốc khung 1920×1080, y lên), gradient, clip, hạt, font đọc từ bản cài Steam.\n')
ABOUT = {
    'gradients': 'Gradient2 (UI Extensions): type horizontal = theo x trái→phải, vertical = theo y dưới→lên; blend multiply nhân '
                 'vào màu Image. JoshH.UI.UIGradient: linear = lerp(colors[0], colors[1]) theo x khi angle 0; complexLinear = '
                 'gradient theo x; blend override THAY cả RGBA của Image (kể cả alpha) bằng màu gradient, multiply nhân vào. '
                 'stops = [t, r, g, b, a] đã gộp mốc màu và mốc alpha.',
    'fonts': 'files.*.viMissing = chữ trong mẫu tiếng Việt mà font không có. presets = UIFontOverride_* của UIDataText -> font '
             'bản tiếng Anh. Game gốc không có tiếng Việt; với ngôn ngữ Snowstorm không phủ (Ba Lan, Thổ) game đổi cả chuỗi '
             'sang font khác (Apotek), không trộn từng chữ.',
    'text.font': 'Trong layout: text.font.preset = UIFontOverride_* gốc, text.font.tmp = font TMP gắn trong prefab (bản Hàn).',
}
KNOWN_ABSENT = [
    {'what': 'bảng "súng mới" của app Duff', 'why': 'Không có prefab bảng nào trong bundle (chỉ có ba prefab VFX '
     'VFX_UI_WeaponCraft_NewWeapn_*). Màn chuẩn bị dùng bảng LevelUpPopup của iDiver và phát ba VFX này lên đó [ĐỀ XUẤT].'},
    {'what': 'font có dấu tiếng Việt cho chữ tiêu đề', 'why': 'Snowstorm (font tiêu đề, nút, số bản tiếng Anh) thiếu ă đ ơ ư và '
     'gần hết dấu thanh. 210Youth (bản Hàn), Apotek (Ba Lan/Thổ) cũng thiếu. Chỉ Roboto-Medium (chữ thân) và Anuphan (Thái) phủ đủ.'},
    {'what': 'chữ "UPGRADE" dịch', 'why': 'Tiêu đề bảng lên cấp dùng preset UIFontOverride_OnlyEnglish_SnowStorm, không có khoá '
     'chữ: bản gốc ghi "UPGRADE" ở mọi ngôn ngữ.'},
]


def main():
    parts = sys.argv[1:] or ['idiver', 'duff', 'fonts']
    ix = rip.bundle_index()
    rb.IDX, rb.CABS = ix['path'], ix['cab']
    rip.IDX, rip.CABS = rb.IDX, rb.CABS
    man = {}
    if os.path.exists(OUT_JS):
        src = io.open(OUT_JS, encoding='utf-8').read()
        man = json.loads(src[src.index('window.HX_UI_ASSETS =') + 21:].strip().rstrip(';'))
    if 'idiver' in parts:
        print('iDiver…', flush=True)
        man['idiver'] = rip_idiver()
    if 'duff' in parts:
        print('App súng của Duff…', flush=True)
        man['duff'] = rip_duff()
    if 'fonts' in parts:
        print('Font…', flush=True)
        man['fonts'] = rip_fonts()
    man['_about'] = ABOUT
    man['missing'] = KNOWN_ABSENT
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(HEADER)
        fh.write('window.HX_UI_ASSETS = ')
        json.dump(man, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        fh.write(';\n')
    print('xong ->', rel(OUT_JS), '%d KB' % (os.path.getsize(OUT_JS) // 1024))


if __name__ == '__main__':
    main()
