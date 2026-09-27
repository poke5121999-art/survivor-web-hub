# -*- coding: utf-8 -*-
"""Bóc UI NGUI của PokéOne: atlas -> art/ui + data/atlas.js, cây UI level1/level2 + prefab -> data/ui.js,
menu Options -> data/settings.js (rip_ui_settings.py, chỉ khi có --settings). Chạy lại ra cùng kết quả.

    set PYTHONIOENCODING=utf-8 && python games/pokeone/tools/rip_ui.py [--debug-dir <thư mục>]

--debug-dir: ghi thêm ảnh atlas có khung sprite (để soát toạ độ), mặc định %TEMP%/pokeone-ui-shots.
--settings: chạy luôn rip_ui_settings.py (nạp GameAssembly.dll để đọc menu Options, xem README-ui.md).
"""
import os, sys, json, struct, re, shutil
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import ttg  # noqa: E402

ART = os.path.join(GAME, 'art', 'ui')
DATA = os.path.join(GAME, 'data')

WIDGETS = {'UISprite', 'UILabel', 'UITexture', 'UIWidget'}
NGUI_CORE = WIDGETS | {'UIPanel', 'UIRoot', 'UIButton', 'UIButtonColor', 'UIGrid', 'UITable', 'UIToggle', 'UISlider',
                       'UIScrollBar', 'UIPopupList', 'UIInput', 'UIScrollView', 'UIDragScrollView', 'UIDragObject',
                       'UIPlayTween', 'UIEventListener', 'UIWidgetContainer', 'UICamera'}
TWEENS = {'TweenAlpha', 'TweenPosition', 'TweenScale', 'TweenRotation', 'TweenColor', 'TweenWidth', 'TweenHeight'}

PIVOT = ['TopLeft', 'Top', 'TopRight', 'Left', 'Center', 'Right', 'BottomLeft', 'Bottom', 'BottomRight']
SPRITE_TYPE = ['simple', 'sliced', 'tiled', 'filled', 'advanced']
FILL_DIR = ['horizontal', 'vertical', 'radial90', 'radial180', 'radial360']
FLIP = ['', 'h', 'v', 'both']
EFFECT = ['', 'shadow', 'outline', 'outline8']
OVERFLOW = ['shrink', 'clamp', 'resizeFreely', 'resizeHeight']   # thứ tự enum UILabel.Overflow trong dump.cs
ALIGN = ['auto', 'left', 'center', 'right', 'justified']
FONT_STYLE = ['', 'bold', 'italic', 'bolditalic']
CLIP = {0: 'none', 1: 'texture', 3: 'soft', 4: 'constrain'}

# Font NGUI (bitmap BMFont nằm trong GUIAtlas / Wooden Atlas) -> font web ở art/ui/fonts (Google Fonts, OFL).
WEB_FONTS = {
    'Aldrich': {'file': 'fonts/Aldrich-Regular.ttf'},
    'Arimo': {'file': 'fonts/Arimo-wght.ttf'},
}
FONT_MAP = {  # tên NGUIFont -> (font web, đậm)
    'Aldrich 16': ('Aldrich', 400), 'AldrichLarge': ('Aldrich', 400),
    'Arial 14': ('Arimo', 400), 'Arial 15': ('Arimo', 700), 'Arial11': ('Arimo', 400),
    'Arial15NotBold': ('Arimo', 400), 'Arimo14': ('Arimo', 400),
}


def rnd(v, k=3):
    v = round(float(v), k)
    return int(v) if v == int(v) else v


def hexcol(c):
    return '#' + ''.join('%02x' % max(0, min(255, int(round(c[k] * 255)))) for k in 'rgba')


class Env:
    def __init__(self):
        self.env = ttg.load_core()
        self.fs = ttg.files(self.env)
        self._mb = {}
        self.prefab_key = {}   # (tệp, pathID GameObject gốc của prefab) -> khoá P1.UI_PREFABS

    def fileof(self, sf, fid):
        if fid == 0:
            return sf
        return self.fs.get(os.path.basename(sf.externals[fid - 1].path))

    def deref(self, sf, ptr):
        if not ptr or not ptr.get('m_PathID'):
            return None
        tf = self.fileof(sf, ptr['m_FileID'])
        return tf.objects.get(ptr['m_PathID']) if tf is not None else None

    def mb(self, o):
        key = (o.assets_file.name, o.path_id)
        if key not in self._mb:
            self._mb[key] = ttg.read_mb(self.env, o)
        return self._mb[key]

    def mbs(self, fname):
        sf = self.fs[fname]
        for pid, o in sf.objects.items():
            if o.type.name == 'MonoBehaviour':
                s = ttg.script_of(self.env, o)
                if s:
                    yield pid, o, s[1]

    def texture_of_material(self, mat):
        m = mat.read_typetree()
        for name, env in m['m_SavedProperties']['m_TexEnvs']:
            if name == '_MainTex' and env['m_Texture']['m_PathID']:
                return self.deref(mat.assets_file, env['m_Texture'])
        return None


# ---------------------------------------------------------------- atlas

def sprite_groups(names):
    """'slash_02' -> nhóm 'slash': số khung mỗi hiệu ứng trong atlas VFX."""
    counts = {}
    for n in names:
        p = re.sub(r'[\s_\-]*\d+$', '', n)
        counts[p] = counts.get(p, 0) + 1
    return dict(sorted(counts.items()))


def rip_atlases(E, debug_dir):
    for d, pre in ((ART, ''), (debug_dir, 'atlas_')):   # chạy lại sạch: xoá ảnh atlas cũ (tên có thể đã đổi)
        for fn in os.listdir(d) if d else []:
            if fn.startswith(pre) and fn.endswith('.png'):
                os.remove(os.path.join(d, fn))
    atlases, by_obj = {}, {}
    for fname in ('sharedassets0.assets', 'sharedassets1.assets', 'sharedassets2.assets'):
        for pid, o, cls in E.mbs(fname):
            if cls not in ('NGUIAtlas', 'UIAtlas'):
                continue
            _, d = E.mb(o)
            sf = o.assets_file
            mat = E.deref(sf, d['material'])
            tex = E.texture_of_material(mat).read()
            img = tex.image.convert('RGBA')
            W, H = img.size
            sprites = {}
            for s in d.get('mSprites') or []:
                sprites[s['name']] = [s['x'], s['y'], s['width'], s['height'],
                                      s['borderLeft'], s['borderRight'], s['borderTop'], s['borderBottom'],
                                      s['paddingLeft'], s['paddingRight'], s['paddingTop'], s['paddingBottom']]
            for s in d.get('sprites') or []:   # NGUI 2 cũ: outer/inner (pixel khi mCoordinates=0), padding theo tỉ lệ
                o_, i_ = s['outer'], s['inner']
                if d.get('mCoordinates', 0) == 1:
                    o_ = {'x': o_['x'] * W, 'y': o_['y'] * H, 'width': o_['width'] * W, 'height': o_['height'] * H}
                    i_ = {'x': i_['x'] * W, 'y': i_['y'] * H, 'width': i_['width'] * W, 'height': i_['height'] * H}
                x, y, w, h = [int(round(o_[k])) for k in ('x', 'y', 'width', 'height')]
                sprites[s['name']] = [x, y, w, h,
                                      int(round(i_['x'] - o_['x'])), int(round(o_['x'] + o_['width'] - i_['x'] - i_['width'])),
                                      int(round(i_['y'] - o_['y'])), int(round(o_['y'] + o_['height'] - i_['y'] - i_['height'])),
                                      int(round(s['paddingLeft'] * w)), int(round(s['paddingRight'] * w)),
                                      int(round(s['paddingTop'] * h)), int(round(s['paddingBottom'] * h))]
            src = d['m_Name']
            if not src:
                go = E.deref(sf, d['m_GameObject'])
                src = go.read().m_Name if go else tex.m_Name
            # Atlas VFX không có m_Name; GameObject của nó tên BattleAnim_<Nhóm>1 -> fx_<nhóm>
            name = d['m_Name'].replace(' ', '') if d['m_Name'] else                 'fx_' + re.sub(r'\d+$', '', src.replace('BattleAnim', '').strip('_')).lower()
            fn = name + '.png'
            img.save(os.path.join(ART, fn), optimize=True)
            atlases[name] = {'img': 'art/ui/' + fn, 'w': W, 'h': H, 'src': src,
                             's': dict(sorted(sprites.items()))}
            if not d['m_Name']:
                atlases[name]['groups'] = sprite_groups(sprites)
            by_obj[(os.path.basename(sf.name), pid)] = name
            if debug_dir:
                dbg = img.copy()
                bg = Image.new('RGBA', dbg.size, (40, 40, 48, 255))
                bg.alpha_composite(dbg)
                dr = ImageDraw.Draw(bg)
                for sn, r in sprites.items():
                    x, y, w, h, bl, br, bt, bb = r[:8]
                    dr.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 0, 255, 255))
                    if bl or br or bt or bb:
                        dr.rectangle([x + bl, y + bt, x + w - 1 - br, y + h - 1 - bb], outline=(0, 255, 255, 255))
                bg.save(os.path.join(debug_dir, 'atlas_' + name + '.png'))
            print('atlas %-16s %4dx%-4d %3d sprite  (%s)' % (name, W, H, len(sprites), src))
    return atlases, by_obj


SAMPLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'


def web_scale(f, web, weight):
    """Cỡ chữ CSS = fontSize * k. NGUI vẽ font bitmap theo tỉ lệ fontSize / mSize.
    k khớp tổng advance của A-Z a-z 0-9 giữa BMFont gốc và font web, để chữ tràn/xuống dòng/co
    (ShrinkContent) như bản gốc. Không khớp theo chiều cao chữ H: glyph BMFont có đệm 1 px nên đo cao
    bị lệch (BMFont "Arial 14" thật ra là Arial em ~10,6 px trên dòng 14 px)."""
    from PIL import ImageFont
    ft = ImageFont.truetype(os.path.join(ART, WEB_FONTS[web]['file']), 1000)
    try:
        ft.set_variation_by_axes([weight])
    except Exception:
        pass
    adv = {g['index']: g['advance'] for g in f['mSaved']}
    chars = [c for c in SAMPLE if ord(c) in adv]
    bm = sum(adv[ord(c)] for c in chars)
    web = sum(ft.getlength(c) / 1000.0 for c in chars)
    return bm / (web * f['mSize'])


def rip_fonts(E, atlas_by_obj):
    fonts, by_obj = {}, {}
    for fname in ('sharedassets1.assets', 'sharedassets2.assets'):
        for pid, o, cls in E.mbs(fname):
            if cls != 'NGUIFont':
                continue
            _, d = E.mb(o)
            sf = o.assets_file
            name = d['m_Name']
            at = E.deref(sf, d['mAtlas'])
            atlas = atlas_by_obj.get((os.path.basename(at.assets_file.name), at.path_id)) if at else None
            f = d['mFont']
            glyph_h = {g['index']: g['height'] for g in f['mSaved']}
            web, weight = FONT_MAP[name]
            fonts[name] = {'web': web, 'weight': weight, 'bitmap': True, 'size': f['mSize'], 'base': f['mBase'],
                           'k': rnd(web_scale(f, web, weight), 4), 'atlas': atlas, 'glyphs': f['mSpriteName'],
                           'sym': {s['sequence']: s['spriteName'] for s in d['mSymbols']}}
            by_obj[(os.path.basename(sf.name), pid)] = name
    return fonts, by_obj


# ---------------------------------------------------------------- cây UI

class Tree:
    """Một cây Transform (scene hoặc prefab) -> dữ liệu nút theo hợp đồng ARCH.md."""

    def __init__(self, E, sf, atlas_by_obj, font_by_obj, textures):
        self.E, self.sf = E, sf
        self.atlas_by_obj, self.font_by_obj, self.textures = atlas_by_obj, font_by_obj, textures
        self.trs, self.gos, self.go_of = {}, {}, {}
        for pid, o in sf.objects.items():
            t = o.type.name
            if t in ('Transform', 'RectTransform'):
                self.trs[pid] = o.read()
            elif t == 'GameObject':
                self.gos[pid] = o.read()
        self.tr_of_go = {t.m_GameObject.path_id: pid for pid, t in self.trs.items()}
        for gpid, g in self.gos.items():
            for c in g.m_Components:
                cp = c.component.path_id if hasattr(c, 'component') else c.path_id
                self.go_of[cp] = gpid
        self.path = {}       # transform pid -> đường dẫn
        self.unresolved = 0
        self.hits = 0        # số ref trỏ vào cây UI (để lọc driver ngoài cây)

    def comps(self, gpid):
        out = []
        for c in self.gos[gpid].m_Components:
            cp = c.component.path_id if hasattr(c, 'component') else c.path_id
            o = self.sf.objects.get(cp)
            if o is not None and o.type.name == 'MonoBehaviour':
                s = ttg.script_of(self.E.env, o)
                out.append((s[1] if s else '?', o))
        return out

    def assign_paths(self, tpid, path):
        self.path[tpid] = path
        for ch in self.trs[tpid].m_Children:
            n = self.gos[self.trs[ch.path_id].m_GameObject.path_id].m_Name
            self.assign_paths(ch.path_id, (path + '/' if path else '') + n)

    def ref(self, ptr):
        """pptr -> đường dẫn nút ('' = gốc), 'prefab:<tên>' cho prefab, None nếu rỗng."""
        if not ptr or not ptr.get('m_PathID'):
            return None
        if ptr['m_FileID'] != 0:
            o = self.E.deref(self.sf, ptr)
            if o is None:
                return '?'
            try:
                if o.type.name in ('GameObject', 'Transform', 'RectTransform', 'MonoBehaviour'):
                    return self.prefab_ref(o)
                return '%s:%s' % (o.type.name, getattr(o.read(check_read=False), 'm_Name', '') or o.path_id)
            except Exception:
                return '?'
        pid = ptr['m_PathID']
        t = pid if pid in self.trs else None
        if t is None:
            g = pid if pid in self.gos else self.go_of.get(pid)
            t = self.tr_of_go.get(g) if g is not None else None
        if t is not None:
            if t in self.path:
                self.hits += 1
                return self.path[t]
            return '#' + self.gos[self.trs[t].m_GameObject.path_id].m_Name   # ngoài cây UI
        self.unresolved += 1
        return '?'

    def prefab_ref(self, o):
        """GameObject/Transform/MonoBehaviour ở tệp khác -> khoá prefab của GameObject gốc chứa nó."""
        sf = o.assets_file
        if o.type.name == 'GameObject':
            go = o
        elif o.type.name == 'MonoBehaviour':   # m_GameObject là PPtr đầu tiên trong dữ liệu thô
            fid, pid = struct.unpack_from('<iq', o.get_raw_data(), 0)
            go = self.E.deref(sf, {'m_FileID': fid, 'm_PathID': pid})
        else:
            go = self.E.deref(sf, {'m_FileID': 0, 'm_PathID': o.read(check_read=False).m_GameObject.path_id})
        g = go.read()
        tr = next(sf.objects[c.component.path_id if hasattr(c, 'component') else c.path_id] for c in g.m_Components
                  if sf.objects[c.component.path_id if hasattr(c, 'component') else c.path_id].type.name in ('Transform', 'RectTransform'))
        t = tr.read()
        while t.m_Father.path_id:
            t = sf.objects[t.m_Father.path_id].read()
        root_go = t.m_GameObject.path_id
        key = self.E.prefab_key.get((os.path.basename(sf.name), root_go))
        name = sf.objects[root_go].read().m_Name
        return key or 'prefab:' + name

    def plain(self, v, depth=0):
        """Giá trị MonoBehaviour -> JSON gọn: pptr thành đường dẫn, bỏ mảng lớn."""
        if isinstance(v, dict):
            if set(v.keys()) == {'m_FileID', 'm_PathID'}:
                return self.ref(v)
            if set(v.keys()) >= {'r', 'g', 'b', 'a'} and len(v) == 4:
                return hexcol(v)
            if 'mTarget' in v and 'mMethodName' in v:
                return (self.ref(v['mTarget']) or '') + '.' + v['mMethodName'] if v['mMethodName'] else None
            if 'm_Curve' in v or depth > 3:
                return None
            out = {k: self.plain(x, depth + 1) for k, x in v.items() if not k.startswith('m_')}
            return {k: x for k, x in out.items() if x not in (None, [], {}, '')}
        if isinstance(v, list):
            if len(v) > 64:
                return None
            return [x for x in (self.plain(x, depth + 1) for x in v) if x is not None]
        if isinstance(v, float):
            return rnd(v)
        return v

    def anchors(self, d):
        anc = {}
        for side, key in (('l', 'leftAnchor'), ('r', 'rightAnchor'), ('b', 'bottomAnchor'), ('t', 'topAnchor')):
            a = d.get(key)
            if a and a['target']['m_PathID']:
                anc[side] = [self.ref(a['target']), rnd(a['relative']), a['absolute']]
        if anc:
            anc['up'] = ['enable', 'update', 'start'][d.get('updateAnchors', 0)]
        return anc

    def widget(self, cls, d):
        w = {'kind': {'UISprite': 'sprite', 'UILabel': 'label', 'UITexture': 'texture'}.get(cls, 'widget'),
             'size': [d['mWidth'], d['mHeight']], 'pivot': PIVOT[d['mPivot']], 'depth': d['mDepth'],
             'color': hexcol(d['mColor'])}
        if w['color'] == '#ffffffff':
            del w['color']
        if not d['m_Enabled']:
            w['off'] = 1
        anc = self.anchors(d)
        if anc:
            w['anc'] = anc
        if d.get('keepAspectRatio'):
            w['aspect'] = [d['keepAspectRatio'], rnd(d['aspectRatio'])]
        if cls in ('UISprite', 'UITexture'):
            w['type'] = SPRITE_TYPE[d['mType']]
            if d['mType'] == 3:
                w['fill'] = {'dir': FILL_DIR[d['mFillDirection']], 'amt': rnd(d['mFillAmount']), 'inv': d['mInvert']}
            if d['mFlip']:
                w['flip'] = FLIP[d['mFlip']]
            if not d.get('mFillCenter', 1):
                w['center'] = False
            if d.get('mApplyGradient'):
                w['grad'] = [hexcol(d['mGradientTop']), hexcol(d['mGradientBottom'])]
        if cls == 'UISprite':
            at = self.E.deref(self.sf, d['mAtlas'])
            w['atlas'] = self.atlas_by_obj.get((os.path.basename(at.assets_file.name), at.path_id)) if at else None
            if w['atlas'] is None and d['mAtlas']['m_PathID']:
                # tham chiếu atlas không trỏ tới atlas nào đã bóc: ghi lại để soát (NGUI không vẽ sprite này)
                w['atlasRef'] = '%s:%d' % (os.path.basename(at.assets_file.name) if at else 'missing(fid %d)' % d['mAtlas']['m_FileID'],
                                           d['mAtlas']['m_PathID'])
            w['sprite'] = d['mSpriteName']
        elif cls == 'UITexture':
            w['tex'] = self.textures(self.sf, d['mTexture'])
            r = d['mRect']
            if (r['x'], r['y'], r['width'], r['height']) != (0, 0, 1, 1):
                w['uv'] = [rnd(r['x'], 4), rnd(r['y'], 4), rnd(r['width'], 4), rnd(r['height'], 4)]
            b = d['mBorder']
            if any(b[k] for k in 'xyzw'):
                w['border'] = [rnd(b[k]) for k in 'xyzw']
        elif cls == 'UILabel':
            f = self.E.deref(self.sf, d['mFont'])
            w['font'] = self.font_by_obj.get((os.path.basename(f.assets_file.name), f.path_id)) if f else None
            if d['mTrueTypeFont']['m_PathID']:
                tt = self.E.deref(self.sf, d['mTrueTypeFont'])
                w['ttf'] = tt.read().m_Name if tt else '?'
            w['text'] = d['mText']
            w['fontSize'] = d['mFontSize']
            w['align'] = ALIGN[d['mAlignment']]
            w['overflow'] = OVERFLOW[d['mOverflow']]
            if d['mFontStyle']:
                w['style'] = FONT_STYLE[d['mFontStyle']]
            if d['mEffectStyle']:
                w['effect'] = {'style': EFFECT[d['mEffectStyle']], 'color': hexcol(d['mEffectColor']),
                               'dist': [rnd(d['mEffectDistance']['x']), rnd(d['mEffectDistance']['y'])]}
            if d['mSpacingX'] or d['mSpacingY']:
                w['spacing'] = [d['mSpacingX'], d['mSpacingY']]
            if d['mMaxLineCount']:
                w['maxLines'] = d['mMaxLineCount']
            if not d['mEncoding']:
                w['bbcode'] = False
            if not d['mSymbols']:
                w['symbols'] = False
            if d.get('mApplyGradient'):
                w['grad'] = [hexcol(d['mGradientTop']), hexcol(d['mGradientBottom'])]
            if d.get('mOverflowEllipsis'):
                w['ellipsis'] = 1
        return w

    def node(self, tpid):
        t = self.trs[tpid]
        gpid = t.m_GameObject.path_id
        g = self.gos[gpid]
        lp, ls, lr = t.m_LocalPosition, t.m_LocalScale, t.m_LocalRotation
        n = {'n': g.m_Name, 'p': [rnd(lp.x, 2), rnd(lp.y, 2)], 's': [rnd(ls.x), rnd(ls.y)], 'a': bool(g.m_IsActive)}
        if abs(lr.z) > 1e-4 or abs(lr.x) > 1e-4 or abs(lr.y) > 1e-4:
            import math
            # quay quanh trục z (UI phẳng); x/y khác 0 thì ghi thêm để biết
            n['r'] = rnd(math.degrees(2 * math.atan2(lr.z, lr.w)), 2)
            if abs(lr.x) > 1e-4 or abs(lr.y) > 1e-4:
                n['r3'] = [rnd(lr.x, 4), rnd(lr.y, 4), rnd(lr.z, 4), rnd(lr.w, 4)]
        for c in g.m_Components:
            co = self.sf.objects.get(c.component.path_id if hasattr(c, 'component') else c.path_id)
            if co is not None and co.type.name in ('BoxCollider', 'BoxCollider2D'):
                n['col'] = 1   # NGUI chỉ nhận chuột ở nút có collider (và chặn click xuyên xuống dưới)
        mb, tweens = {}, []
        for cls, o in self.comps(gpid):
            full, d = self.E.mb(o)
            if d is None:
                mb[cls] = None
                continue
            if cls in WIDGETS:
                n['w'] = self.widget(cls, d)
            elif cls == 'UIPanel':
                cr = d['mClipRange']
                pn = {'depth': d['mDepth'], 'clip': CLIP.get(d['mClipping'], d['mClipping']), 'alpha': rnd(d['mAlpha'])}
                if d['mClipping']:
                    pn['range'] = [rnd(cr['x']), rnd(cr['y']), rnd(cr['z']), rnd(cr['w'])]
                    pn['soft'] = [rnd(d['mClipSoftness']['x']), rnd(d['mClipSoftness']['y'])]
                    pn['off'] = [rnd(d['mClipOffset']['x']), rnd(d['mClipOffset']['y'])]
                anc = self.anchors(d)
                if anc:
                    pn['anc'] = anc
                if d.get('mSortingOrder'):
                    pn['sort'] = d['mSortingOrder']
                if not d['m_Enabled']:
                    pn['disabled'] = 1
                n['pn'] = pn
            elif cls in ('UIButton', 'UIButtonColor'):
                b = {'target': self.ref(d['tweenTarget']), 'hover': hexcol(d['hover']), 'pressed': hexcol(d['pressed']),
                     'disabled': hexcol(d['disabledColor']), 'dur': rnd(d['duration'])}
                for k in ('hoverSprite', 'pressedSprite', 'disabledSprite'):
                    if d.get(k):
                        b[k] = d[k]
                clicks = [x for x in (self.plain(c) for c in d.get('onClick') or []) if x]
                if clicks:
                    b['onClick'] = clicks
                if not d['m_Enabled']:
                    b['off'] = 1
                n['b'] = b
            elif cls == 'UIGrid':
                n['g'] = {'arr': ['h', 'v', 'snap'][d['arrangement']], 'cw': rnd(d['cellWidth']), 'ch': rnd(d['cellHeight']),
                          'max': d['maxPerLine'], 'pivot': PIVOT[d['pivot']], 'hide': d['hideInactive'],
                          'sort': ['', 'alpha', 'h', 'v', 'custom'][d['sorting']]}
            elif cls == 'UITable':
                n['t'] = {k: self.plain(v) for k, v in d.items() if not k.startswith('m_') and k not in ('onReposition',)}
            elif cls in TWEENS:
                tw = {'kind': cls, 'from': self.plain(d.get('from')), 'to': self.plain(d.get('to')),
                      'dur': rnd(d['duration']), 'delay': rnd(d['delay']), 'style': ['once', 'loop', 'pingpong'][d['style']],
                      'group': d['tweenGroup']}
                if d['m_Enabled']:
                    tw['on'] = 1
                tweens.append(tw)
            elif cls in ('UIToggle', 'UISlider', 'UIScrollBar', 'UIPopupList', 'UIInput', 'UIScrollView', 'UIPlayTween', 'UIRoot'):
                n.setdefault('x', {})[cls] = self.plain(d)
            elif cls in NGUI_CORE:
                n.setdefault('x', {})[cls] = 1
            else:
                mb[cls] = self.plain(d)
        if tweens:
            n['tw'] = tweens
        if mb:
            n['mb'] = mb
        kids = [self.node(ch.path_id) for ch in t.m_Children]
        if kids:
            n['c'] = kids
        return n


def find_root_named(tree, name):
    for pid, t in tree.trs.items():
        if t.m_Father.path_id == 0 and tree.gos[t.m_GameObject.path_id].m_Name == name:
            return pid
    return None


def make_textures(E):
    """pptr Texture2D -> 'art/ui/tex/<tên>.png' (ghi ảnh một lần), RenderTexture -> 'rt:<tên>'."""
    tex_out = os.path.join(ART, 'tex')
    shutil.rmtree(tex_out, ignore_errors=True)
    os.makedirs(tex_out, exist_ok=True)
    tex_done = {}

    def textures(sf, ptr):
        o = E.deref(sf, ptr)
        if o is None:
            return None
        key = (os.path.basename(o.assets_file.name), o.path_id)
        if key not in tex_done:
            t = o.read()
            if o.type.name == 'RenderTexture':
                tex_done[key] = 'rt:' + t.m_Name   # mã game vẽ vào lúc chạy (model 3D xem trước)
                return tex_done[key]
            fn = re.sub(r'[^A-Za-z0-9_.\-]+', '_', t.m_Name) or 'tex%d' % o.path_id
            if fn + '.png' in tex_done.values():
                fn += '_%d' % o.path_id
            try:
                t.image.save(os.path.join(tex_out, fn + '.png'), optimize=True)
            except Exception as e:
                print('  texture lỗi', t.m_Name, e)
                tex_done[key] = None
                return None
            tex_done[key] = fn + '.png'
        v = tex_done[key]
        return v if not v or v.startswith('rt:') else 'art/ui/tex/' + v
    return textures


def rip_trees(E, atlas_by_obj, font_by_obj, textures):
    ui, roots, stats, drivers = {}, {}, {}, {}
    for lvl, prefix in (('level2', ''), ('level1', 'title:')):
        tree = Tree(E, E.fs[lvl], atlas_by_obj, font_by_obj, textures)
        rp = find_root_named(tree, 'GUI Root')
        tree.assign_paths(rp, '')
        # đường dẫn trong level1 mang tiền tố 'title:' để không đụng tên panel của level2
        if prefix:
            tree.path = {k: (prefix + v if v else '') for k, v in tree.path.items()}
        root = tree.node(rp)
        ur = root.get('x', {}).get('UIRoot', {})
        roots[lvl] = {'style': ['flexible', 'constrained', 'constrainedOnMobiles'][ur.get('scalingStyle', 0)],
                      'manualWidth': ur.get('manualWidth'), 'manualHeight': ur.get('manualHeight'),
                      'minimumHeight': ur.get('minimumHeight'), 'maximumHeight': ur.get('maximumHeight'),
                      'fitWidth': ur.get('fitWidth'), 'fitHeight': ur.get('fitHeight'),
                      'adjustByDPI': ur.get('adjustByDPI'), 'shrinkPortraitUI': ur.get('shrinkPortraitUI'),
                      'panel': root.get('pn')}
        # MonoBehaviour ngoài GUI Root (Handlers, Networking...) có trường trỏ vào cây UI
        for gpid, g in tree.gos.items():
            if tree.tr_of_go.get(gpid) in tree.path:
                continue
            for cls, o in tree.comps(gpid):
                full, d = E.mb(o)
                if d is None:
                    continue
                tree.hits = 0
                v = tree.plain(d)
                if tree.hits:
                    drivers[prefix + cls] = dict(v, _go='#' + g.m_Name)
        for ch in root.get('c', []):
            if ch['n'] == 'Camera':
                continue
            key = prefix + ch['n']
            assert key not in ui, 'trùng tên panel ' + key
            ui[key] = ch
        stats[lvl] = tree.unresolved
    return ui, roots, stats, drivers


def has_widget(tree, tpid):
    g = tree.trs[tpid].m_GameObject.path_id
    if any(c in WIDGETS for c, _ in tree.comps(g)):
        return True
    return any(has_widget(tree, ch.path_id) for ch in tree.trs[tpid].m_Children)


def index_prefabs(E, atlas_by_obj, font_by_obj, textures):
    """Prefab UI mà mã dựng lúc chạy (dòng Options, ô danh sách, ô túi đồ...). Đặt khoá trước khi bóc cây
    để mọi tham chiếu prefab (ListPrefab, ShopItemPrefab...) trỏ đúng khoá, kể cả khi hai prefab trùng tên."""
    found = []
    for fname in ('sharedassets0.assets', 'sharedassets1.assets', 'sharedassets2.assets', 'resources.assets'):
        tree = Tree(E, E.fs[fname], atlas_by_obj, font_by_obj, textures)
        for pid, t in tree.trs.items():
            if t.m_Father.path_id != 0 or not has_widget(tree, pid):
                continue
            name = tree.gos[t.m_GameObject.path_id].m_Name
            key = 'prefab:' + name
            if key in E.prefab_key.values():
                key += '#%d' % pid
            E.prefab_key[(fname, t.m_GameObject.path_id)] = key
            tree.assign_paths(pid, key)
            found.append((tree, pid, key))
    return found


def rip_prefabs(found):
    return {key: tree.node(pid) for tree, pid, key in found}


def main():
    debug_dir = os.path.join(os.environ.get('TEMP', HERE), 'pokeone-ui-shots')
    if '--debug-dir' in sys.argv:
        debug_dir = sys.argv[sys.argv.index('--debug-dir') + 1]
    os.makedirs(debug_dir, exist_ok=True)
    os.makedirs(ART, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    E = Env()

    atlases, atlas_by_obj = rip_atlases(E, debug_dir)
    fonts, font_by_obj = rip_fonts(E, atlas_by_obj)
    textures = make_textures(E)
    found = index_prefabs(E, atlas_by_obj, font_by_obj, textures)
    ui, roots, stats, drivers = rip_trees(E, atlas_by_obj, font_by_obj, textures)
    prefabs = rip_prefabs(found)

    font_dir = os.path.join(ART, 'fonts')
    os.makedirs(font_dir, exist_ok=True)
    for fn in ('Aldrich-Regular.ttf', 'Arimo-wght.ttf', 'OFL-Aldrich.txt', 'OFL-Arimo.txt'):
        if not os.path.exists(os.path.join(font_dir, fn)):
            print('THIẾU art/ui/fonts/' + fn + ' (tải từ github.com/google/fonts, xem README-ui.md)')

    def js(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), sort_keys=False)

    with open(os.path.join(DATA, 'atlas.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi tools/rip_ui.py — đừng sửa tay.\nwindow.P1 = window.P1 || {};\n')
        f.write('P1.ATLAS = ' + js(atlases) + ';\n')
    with open(os.path.join(DATA, 'ui.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi tools/rip_ui.py — đừng sửa tay. Cấu trúc nút: tools/README-ui.md\n')
        f.write('window.P1 = window.P1 || {};\n')
        f.write('P1.UI_ROOT = ' + js(dict(roots['level2'], title=roots['level1'])) + ';\n')
        f.write('P1.UI_FONTS = ' + js(fonts) + ';\n')
        f.write('P1.UI_WEBFONTS = ' + js(WEB_FONTS) + ';\n')
        f.write('P1.UI = {\n' + ',\n'.join(js(k) + ':' + js(v) for k, v in ui.items()) + '\n};\n')
        f.write('P1.UI_DRIVERS = {\n' + ',\n'.join(js(k) + ':' + js(v) for k, v in sorted(drivers.items())) + '\n};\n')
        f.write('P1.UI_PREFABS = {\n' + ',\n'.join(js(k) + ':' + js(v) for k, v in prefabs.items()) + '\n};\n')

    if '--settings' in sys.argv:
        # rip_ui_settings nạp GameAssembly.dll (Themida) vào một tiến trình 32 bit để giải nén rồi dịch ngược:
        # chạy mã của game trên máy, nên chỉ làm khi gọi rõ ràng.
        import rip_ui_settings
        rip_ui_settings.main(E)

    count = lambda n: 1 + sum(count(c) for c in n.get('c', []))
    print('ui.js: %d panel, %d nút, %d prefab (%d nút), ref chưa giải: %s' % (
        len(ui), sum(count(v) for v in ui.values()), len(prefabs), sum(count(v) for v in prefabs.values()), stats))
    print('size ui.js', os.path.getsize(os.path.join(DATA, 'ui.js')), 'atlas.js', os.path.getsize(os.path.join(DATA, 'atlas.js')))


if __name__ == '__main__':
    main()
