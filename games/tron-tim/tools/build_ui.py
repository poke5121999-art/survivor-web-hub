# -*- coding: utf-8 -*-
"""Lever: UI cua Hide And Seek (D:\\phanminhtam-ref\\ui\\ui.json) -> data/hs-ui.js (window.SK_UI cho js/sk/ugui.js).

Chay:  PYTHONIOENCODING=utf-8 python games/tron-tim/tools/build_ui.py
Doc :  D:\\phanminhtam-ref\\ui\\{ui.json, sprites.json, sprites\\, fonts\\, fonts.json}
       D:\\phanminhtam-ref\\project\\ExportedProject\\Assets\\Resources\\I2Languages.asset  (tu dien vi/en)
Ghi :  games/tron-tim/data/hs-ui.js, art/ui/sheet.png, art/ui/fonts/*

Dang nut = dang cua games/soulknight/tools/ui/README.md ("Dang du lieu"), them cac truong:
  txt.term  khoa I2 Localize (runtime doi vi/en bang SK_UI.terms[term].vi|.en), txt.uc = chu hoa (TMP UpperCase)
  btn:1     nut co Button; cls: ten cac Component/MonoBehaviour khac (Slider, Toggle, OpenPopup...) de ma game gan hanh vi
Moi so deu [DO] tu ui.json; loi du lieu (sprite thieu, font la) thi dung chu khong bo qua im lang.
"""
import io, json, math, os, re, sys
from PIL import Image
import yaml
from fontTools.ttLib import TTFont

REF = r"D:\phanminhtam-ref"
UI_DIR = os.path.join(REF, "ui")
I2 = os.path.join(REF, "project", "ExportedProject", "Assets", "Resources", "I2Languages.asset")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT_JS = os.path.join(GAME, "data", "hs-ui.js")
OUT_PNG = os.path.join(GAME, "art", "ui", "sheet.png")
OUT_FONTS = os.path.join(GAME, "art", "ui", "fonts")

PAD = 2          # px quanh moi sprite (lap lai vien de khong rach khi bat lam muot)
SHEET_W = 4096

# ten font TMP/Text (da bo " SDF") -> (khoa font, tep ttf trong ui/fonts)
# UTM_Neutra khong co TTF (chi co atlas SDF tinh): thay bang Pusia-Bold (dam, co tieng Viet day du;
# LilitaOne khong co dau Viet, Nougat/Titillium cung khong). fontLH van la so do cua UTM_Neutra (1,314).
FONT_FILES = {
    'LiberationSans': 'LiberationSans.ttf',
    'Arial': 'Arial.ttf',
    'Pusia-Bold': 'Pusia-Bold.otf',
    'Nougat-ExtraBlack': 'Nougat-ExtraBlack.ttf',
    'TitilliumWeb-Bold': 'TitilliumWeb-Bold.ttf',
    'LilitaOne': 'LilitaOne-Regular.ttf',
    'UTM_Neutra': 'Pusia-Bold.otf',
}
TMP_FONT_KEY = {
    'UTM_Neutra SDF': 'UTM_Neutra', '<default TMP Settings asset>': 'LiberationSans', 'LiberationSans SDF': 'LiberationSans',
    'LilitaOne-Regular SDF': 'LilitaOne', 'LilitaOne-Regular SDF1': 'LilitaOne', 'Pusia-Bold SDF': 'Pusia-Bold',
}
FALLBACK = ['LiberationSans']   # ky tu thieu trong font chinh

H_IDX = {'Left': 0, 'Center': 1, 'Right': 2, 'Justified': 0, 'Flush': 0, 'Geometry': 1}
V_IDX = {'Top': 0, 'Middle': 1, 'Bottom': 2, 'Baseline': 1, 'Geometry': 1, 'Capline': 0}
TEXT_ANCHOR = ["UpperLeft", "UpperCenter", "UpperRight", "MiddleLeft", "MiddleCenter", "MiddleRight", "LowerLeft", "LowerCenter", "LowerRight"]
FILL_M = {'horizontal': 0, 'vertical': 1, 'radial90': 2, 'radial180': 3, 'radial360': 4}
OUTLINE_K = 0.35   # [SUY] TMP _OutlineWidth 0,15 ~ 0,35 * 0,15 * cop chu px moi canh (khop net vien o anh chup game)

# (khoa, nguon): nguon = ('scene', scene, duong dan canvas) | ('prefab', ten, duong dan)
PREFABS = [
    ('menu', ('scene', 'level0', 'Canvas')),
    ('hud', ('scene', 'level1', 'Scene/GameManager/UI/Canavas')),
    ('loading', ('prefab', 'LoadingScene', 'LoadingScene/Canvas')),
    ('SeekUI', ('prefab', 'SeekUI', 'SeekUI')),
    ('RunUI', ('prefab', 'RunUI', 'RunUI')),
    ('TimeUI (1)', ('prefab', 'TimeUI (1)', 'TimeUI (1)')),
    ('WaypointCanvas', ('prefab', 'WaypointCanvas', 'WaypointCanvas')),
    ('ArrowIndicator', ('prefab', 'ArrowIndicator', 'ArrowIndicator')),
    ('Player UI', ('prefab', 'Player UI', 'Player UI')),
    ('Name', ('prefab', 'Name', 'Name')),
    ('PlayerNameTag', ('prefab', 'Player', 'Player/Other/Canvas')),
    ('PlayerCanvasTime', ('prefab', 'Player', 'Player/Death/ReviveCircle/CanvasTime')),
    ('PlayerCanvas', ('prefab', 'Player', 'Player/Camera/Canvas')),
    ('BotNameTag', ('prefab', 'Bot', 'Bot/Other/Canvas')),
    ('BotCanvasTime', ('prefab', 'Bot', 'Bot/Death/ReviveCircle/CanvasTime')),
    ('TableCanvas', ('scene', 'level1', 'MapSceneEscape/TableList/TableY/Canvas')),
]


def die(msg):
    sys.stderr.write('build_ui: ' + msg + '\n')
    sys.exit(1)


def r3(v):
    v = round(float(v), 3)
    return int(v) if v == int(v) else v


def color(h):
    if not h:
        return [1, 1, 1, 1]
    h = h.lstrip('#')
    if len(h) == 6:
        h += 'FF'
    return [r3(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4, 6)]


class _Loader(yaml.SafeLoader):
    pass


# YAML 1.1 doc 'No'/'Yes'/'NO'/'YES'/'on'/'off' thanh bool: tat bo nhan dien bool de giu nguyen chu
_Loader.yaml_implicit_resolvers = {k: [(t, r) for t, r in v if t != 'tag:yaml.org,2002:bool'] for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()}


def load_terms():
    txt = io.open(I2, encoding='utf-8').read()
    body = txt.split('\n', 3)[3]            # bo %YAML, %TAG, "--- !u!114"
    y = yaml.load(body, Loader=_Loader)
    terms = {}
    for t in y['MonoBehaviour']['mSource']['mTerms']:
        langs = t.get('Languages') or []
        terms[t['Term']] = {'vi': langs[0] if len(langs) > 0 else '', 'en': langs[1] if len(langs) > 1 else ''}
    return terms


class Build:
    def __init__(self, ui, sprites, fonts_json, terms):
        self.ui, self.sprites, self.fonts_json, self.terms = ui, sprites, fonts_json, terms
        self.used = {}            # ten sprite -> True
        self.unresolved_terms = {}
        self.stats = {'nodes': 0, 'dropped': 0, 'img': 0, 'txt': 0, 'loc': 0}
        self.fonts_used = set()

    # ---- gom truy cap
    def comp(self, n, k):
        return n.get('components', {}).get(k)

    def font_key(self, tmp_font):
        if tmp_font not in TMP_FONT_KEY:
            die('TMP font asset la: %r' % tmp_font)
        return TMP_FONT_KEY[tmp_font]

    def sprite(self, name):
        if not name:
            return None
        if name not in self.sprites:
            die('sprite khong co trong sprites.json: ' + name)
        self.used[name] = True
        return name

    # ---- mot nut
    def node(self, n):
        if n.get('_nonUI') or 'anchorMin' not in n:
            self.stats['dropped'] += 1
            return None
        c = n.get('components', {})
        if 'TMP_SubMeshUI' in c and not any(k in c for k in ('Image', 'TMP', 'Text')) and not n.get('children'):
            self.stats['dropped'] += 1
            return None
        self.stats['nodes'] += 1
        out = {'n': n['name']}
        if n.get('active') is False:
            out['off'] = 1
        # Man chuyen canh (FadeScene/FadeImage/FadeSwap/fadeScene): Animator keo alpha ve 0 khi vao; prefab luu luc dau (den hoac anh nap, a=1).
        # Khong co clip de ap, nen coi trang thai nghi la trong suot (tat). [SUY] theo ten + Animator, khop anh chup menu.
        # menu/BackGroud (bg1, anh dac den-xanh, scale 2, script ChangeBackGround tat): anh chup Main Camera cua game khong thay no
        # (nen 3D che hoac tat luc chay), nen tat. Nen menu that la canh 3D phia sau, khong phai UI. [SUY]
        if n['name'] == 'BackGroud' and c.get('Image', {}).get('sprite') in ('bg1', 'bg2'):
            out['off'] = 1
        if re.search(r'fade', n['name'], re.I):
            out['off'] = 1
        a0, a1, pv, p, sz = n['anchorMin'], n['anchorMax'], n['pivot'], n['anchoredPosition'], n['sizeDelta']
        out['a'] = [r3(a0[0]), r3(a0[1]), r3(a1[0]), r3(a1[1])]
        out['pv'] = [r3(pv[0]), r3(pv[1])]
        out['p'] = [r3(p[0]), r3(p[1])]
        out['sz'] = [r3(sz[0]), r3(sz[1])]
        sc = n.get('localScale')
        if sc:
            out['sc'] = [r3(sc[0]), r3(sc[1])]
        if n.get('rotZ'):
            out['rz'] = r3(n['rotZ'])

        hide_gfx = False
        fx = list(n.get('_tmpfx', []))
        if 'Mask' in c or 'RectMask2D' in c:
            out['mask'] = 1
            if 'Mask' in c and not c['Mask'].get('ShowMaskGraphic', 1):
                hide_gfx = True
        if 'Image' in c:
            im = c['Image']
            t = {'simple': 0, 'sliced': 1, 'tiled': 2, 'filled': 3}[im.get('type', 'simple')]
            img = {'sp': self.sprite(im.get('sprite')), 'c': color(im.get('color'))}
            if t:
                img['t'] = t
            if t == 3:
                img['fm'] = FILL_M[im.get('fillMethod', 'horizontal')]
                img['fo'] = im.get('fillOrigin', 0)
                img['fa'] = r3(im.get('fillAmount', 1))
                img['cw'] = 1 if im.get('fillClockwise', True) else 0
            if im.get('preserveAspect'):
                img['pa'] = 1
            if im.get('_disabled') or hide_gfx:
                img['off'] = 1
            out['img'] = img
            self.stats['img'] += 1
        loc = c.get('Localize')
        term = (loc or {}).get('mTerm')
        if 'TMP' in c:
            out['txt'] = self.tmp(c['TMP'], term)
        elif 'Text' in c:
            out['txt'] = self.text(c['Text'], term)
        if 'txt' in out:
            self.stats['txt'] += 1
            if term:
                self.stats['loc'] += 1
        # Shadow/Outline cua Unity (effect tren Graphic)
        for k in ('Shadow', 'Outline'):
            if k in c and not c[k].get('_disabled'):
                d = c[k]['EffectDistance']
                fx.append({'t': k[0].lower(), 'c': color(c[k]['EffectColor']), 'd': [r3(d[0]), r3(d[1])]})
        if fx:
            out['fx'] = fx
        for k, t in (('HorizontalLayoutGroup', 'h'), ('VerticalLayoutGroup', 'v')):
            if k in c and not c[k].get('_disabled'):
                g, pd = c[k], c[k]['Padding']
                out['lay'] = {'t': t, 'pad': [pd['Left'], pd['Right'], pd['Top'], pd['Bottom']], 'sp': r3(g['Spacing']),
                              'ca': g['ChildAlignment'], 'cw': g['ChildControlWidth'], 'ch': g['ChildControlHeight'],
                              'fw': g['ChildForceExpandWidth'], 'fh': g['ChildForceExpandHeight'], 'rv': g.get('ReverseArrangement', 0)}
        if 'GridLayoutGroup' in c and not c['GridLayoutGroup'].get('_disabled'):
            out['_grid'] = c['GridLayoutGroup']
        if 'ContentSizeFitter' in c and not c['ContentSizeFitter'].get('_disabled'):
            f = c['ContentSizeFitter']
            if f['HorizontalFit'] or f['VerticalFit']:
                out['fit'] = [f['HorizontalFit'], f['VerticalFit']]
        if 'LayoutElement' in c and not c['LayoutElement'].get('_disabled'):
            out['le'] = {k: r3(v) for k, v in c['LayoutElement'].items() if k != '_disabled'}
        if 'CanvasGroup' in c and c['CanvasGroup'].get('alpha', 1) != 1:
            out['cg'] = r3(c['CanvasGroup']['alpha'])
        if 'Button' in c:
            out['btn'] = 1
        cls = [k for k in ('Slider', 'Toggle', 'ScrollRect', 'TMP_InputField', 'Animator') if k in c]
        cls += [s['class'] for s in n.get('scripts', []) if s.get('class') and s['class'] != '<missing>']
        if cls:
            out['cls'] = cls
        kids = []
        for ch in n.get('children', []):
            k = self.node(ch)
            if k:
                kids.append(k)
        if out.get('_grid'):
            self.grid(out, out.pop('_grid'), kids)
        out.pop('_grid', None)
        if kids:
            out['k'] = kids
        return out

    def grid(self, out, g, kids):
        """ugui khong xep GridLayoutGroup: tinh vi tri tinh o day (cau hinh luc dung hinh, o co dinh)."""
        pd = g['Padding']
        cs, sp = g['CellSize'], g['Spacing']
        act = [k for k in kids if not k.get('off') and not (k.get('le') or {}).get('IgnoreLayout')]
        cnt = max(1, g.get('ConstraintCount', 1))
        for i, k in enumerate(act):
            if g['Constraint'] == 2:      # FixedRowCount
                row, col = (i % cnt, i // cnt) if g['StartAxis'] == 1 else (i // max(1, math.ceil(len(act) / cnt)), i % max(1, math.ceil(len(act) / cnt)))
            else:                          # FixedColumnCount (1) hoac linh hoat (0): hang ngang truoc
                col, row = (i % cnt, i // cnt) if g['StartAxis'] == 0 else (i // cnt, i % cnt)
            x = pd['Left'] + col * (cs[0] + sp[0])
            y = pd['Top'] + row * (cs[1] + sp[1])
            pv = k['pv']
            k['a'] = [0, 1, 0, 1]
            k['sz'] = [r3(cs[0]), r3(cs[1])]
            k['p'] = [r3(x + pv[0] * cs[0]), r3(-(y + (1 - pv[1]) * cs[1]))]

    # ---- chu
    def tmp(self, t, term):
        h, v = t['alignment'].split('/')
        txt = {'s': self.string(t.get('text', ''), term), 'c': color(t.get('color')), 'fs': r3(t['fontSize']),
               'al': V_IDX[v] * 3 + H_IDX[h], 'f': self.font_key(t.get('font', '<default TMP Settings asset>'))}
        self.fonts_used.add(txt['f'])
        st = t.get('fontStyle') or []
        stv = (1 if 'Bold' in st else 0) | (2 if 'Italic' in st else 0)
        if stv:
            txt['st'] = stv
        if 'UpperCase' in st:
            txt['uc'] = 1
            txt['s'] = txt['s'].upper()
        if t.get('autoSize'):
            lo, hi = t['autoSize']
            txt['bf'] = [r3(lo), r3(hi)]
            txt['fs'] = r3(hi)
        if t.get('wordWrap') is False:
            txt['ho'] = 1
        if t.get('lineSpacing'):
            txt['ls'] = r3(1 + t['lineSpacing'] / 100.0)
        if t.get('_disabled'):
            txt['off'] = 1
        if term:
            txt['term'] = term
        return txt

    def text(self, t, term):
        al = TEXT_ANCHOR.index(t.get('alignment', 'UpperLeft'))
        font = t.get('font') or 'Arial'
        fk = {'Arial': 'Arial', 'UTM_Neutra': 'UTM_Neutra', 'Nougat-ExtraBlack': 'Nougat-ExtraBlack', 'TitilliumWeb-Bold': 'TitilliumWeb-Bold'}.get(font)
        if not fk:
            die('Text font la: %r' % font)
        self.fonts_used.add(fk)
        txt = {'s': self.string(t.get('text', ''), term), 'c': color(t.get('color')), 'fs': r3(t['fontSize']), 'al': al, 'f': fk}
        st = {'normal': 0, 'bold': 1, 'italic': 2, 'boldItalic': 3}[t.get('fontStyle', 'normal')]
        if st:
            txt['st'] = st
        if t.get('bestFit'):                       # best fit cua Text cu lon toi max (ugui chi thu nho tu fs)
            txt['bf'] = [t['bestFit'][0], t['bestFit'][1]]
            txt['fs'] = t['bestFit'][1]
        if t.get('horizontalOverflow') == 'overflow':
            txt['ho'] = 1
        if t.get('lineSpacing'):
            txt['ls'] = t['lineSpacing']
        if term:
            txt['term'] = term
        return txt

    def string(self, s, term):
        if term:
            e = self.terms.get(term)
            if e:
                return e['vi'] or e['en'] or s
            self.unresolved_terms[term] = True
        return s


def find_canvas(ui, kind, a, b):
    if kind == 'scene':
        for c in ui['scenes'][a]['canvases']:
            if c['path'] == b:
                return c['tree'], c.get('canvas', {}), c.get('canvasScaler', {})
        die('canvas khong thay: %s %s' % (a, b))
    for r in ui['prefabs'][a]['uiRoots']:
        if r.get('path') == b:
            return r['tree'], r.get('canvas', {}), r.get('canvasScaler', {})
    die('prefab khong thay: %s %s' % (a, b))


def main():
    ui = json.load(io.open(os.path.join(UI_DIR, 'ui.json'), encoding='utf-8'))
    sprites = json.load(io.open(os.path.join(UI_DIR, 'sprites.json'), encoding='utf-8'))
    fonts_json = json.load(io.open(os.path.join(UI_DIR, 'fonts.json'), encoding='utf-8'))
    terms = load_terms()
    b = Build(ui, sprites, fonts_json, terms)

    # vien TMP: chen vao dump truoc khi doi (de node() gom thanh fx)
    def pre(n):
        t = n.get('components', {}).get('TMP')
        if t and t.get('outlineWidth'):
            d = max(1, t['fontSize']) * t['outlineWidth'] * OUTLINE_K
            n['_tmpfx'] = [{'t': 'o', 'c': color(t.get('outlineColor') or '#000000'), 'd': [r3(d), r3(d)]}]
        us = t.get('underlay') if t else None
        if us and (us.get('offsetX') or us.get('offsetY')):
            k = max(1, t['fontSize']) * 0.1
            n.setdefault('_tmpfx', []).append({'t': 's', 'c': color(us['color']), 'd': [r3(us['offsetX'] * k), r3(us['offsetY'] * k)]})
        for ch in n.get('children', []):
            pre(ch)

    prefabs, canvas = {}, {}
    for key, (kind, a, pth) in PREFABS:
        tree, cv, cs = find_canvas(ui, kind, a, pth)
        pre(tree)
        root = b.node(tree)
        if root is None:
            die('goc rong: ' + key)
        screen = (cv.get('renderMode') or '') != 'WorldSpace' and 'Canvas' in tree.get('components', {})
        if screen:
            root['n'] = 'Canvas'
        else:
            # khong phai canvas man hinh: bao ngoai bang mot canvas trong; goc giu hinh chu nhat cua no
            w = {'n': 'Canvas', 'a': [0.5, 0.5, 0.5, 0.5], 'pv': [0.5, 0.5], 'p': [0, 0], 'sz': [0, 0], 'k': [root]}
            if 'Canvas' in tree.get('components', {}):       # world-space: tam o giua, giu kich thuoc
                root['a'], root['p'] = [0.5, 0.5, 0.5, 0.5], [0, 0]
            root = w
        prefabs[key] = root
        sc = cs or {}
        canvas[key] = {'render': cv.get('renderMode', 'none'), 'mode': sc.get('uiScaleMode', 'none'),
                       'ref': sc.get('referenceResolution'), 'match': sc.get('matchWidthOrHeight')}

    # ---- sprite -> sheet
    names = sorted(b.used, key=lambda k: (-Image.open(os.path.join(UI_DIR, 'sprites', k + '.png')).size[1], k))
    ims = {}
    for k in names:
        im = Image.open(os.path.join(UI_DIR, 'sprites', k + '.png')).convert('RGBA')
        if tuple(im.size) != tuple(sprites[k]['size']):
            sys.stderr.write('warn: kich thuoc png %s %s != sprites.json %s\n' % (k, im.size, sprites[k]['size']))
        ims[k] = im
        if im.width + 2 * PAD > SHEET_W:
            die('sprite qua rong: ' + k)
    x = y = rowh = 0
    pos = {}
    for k in names:
        w, h = ims[k].size
        if x + w + 2 * PAD > SHEET_W:
            x, y, rowh = 0, y + rowh, 0
        pos[k] = (x + PAD, y + PAD)
        x += w + 2 * PAD
        rowh = max(rowh, h + 2 * PAD)
    sh = y + rowh
    sheet = Image.new('RGBA', (SHEET_W, sh), (0, 0, 0, 0))
    frames, clamped = {}, []
    for k in names:
        im = ims[k]
        px, py = pos[k]
        # lap vien PAD px (de lam muot khong an mau lang gieng)
        w, h = im.size
        ext = Image.new('RGBA', (w + 2 * PAD, h + 2 * PAD))
        ext.paste(im, (PAD, PAD))
        for i in range(PAD):
            ext.paste(im.crop((0, 0, 1, h)), (i, PAD))
            ext.paste(im.crop((w - 1, 0, w, h)), (PAD + w + i, PAD))
        row_t = ext.crop((0, PAD, w + 2 * PAD, PAD + 1))
        row_b = ext.crop((0, PAD + h - 1, w + 2 * PAD, PAD + h))
        for i in range(PAD):
            ext.paste(row_t, (0, i))
            ext.paste(row_b, (0, PAD + h + i))
        sheet.paste(ext, (px - PAD, py - PAD))
        bd = list(sprites[k]['border'])
        # Vien trai+phai (hoac duoi+tren) >= be rong: o giua rong 0 thi 9 manh khong ve gi o giua (nut vien thuoc, cat dau).
        # Chua ro Unity ve the nao (khong co mau goc); chua lai 1 px o giua de nut ra hinh vien thuoc. [SUY]
        for lo, hi, size in ((0, 2, w), (1, 3, h)):
            if bd[lo] + bd[hi] >= size > 0 and bd[lo] + bd[hi] > 0:
                over = bd[lo] + bd[hi] - size + 1
                big = lo if bd[lo] >= bd[hi] else hi
                bd[big] -= over
                clamped.append(k)
        frames[k] = [px, py, w, h, r3(bd[0]), r3(bd[1]), r3(bd[2]), r3(bd[3]), r3(sprites[k]['pixelsPerUnit'])]
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)

    # ---- font
    os.makedirs(OUT_FONTS, exist_ok=True)
    lh_tmp = {}
    for nm, f in fonts_json['tmpFontAssets'].items():
        lh_tmp[nm] = f['face']['m_LineHeight'] / float(f['face']['m_PointSize'])
    font_lh_src = {'UTM_Neutra': 'UTM_Neutra SDF', 'LiberationSans': 'LiberationSans SDF', 'LilitaOne': 'LilitaOne-Regular SDF', 'Pusia-Bold': 'Pusia-Bold SDF'}
    fonts, font_lh, copied = {}, {}, set()
    for key in sorted(FONT_FILES):
        src = os.path.join(UI_DIR, 'fonts', FONT_FILES[key])
        if not os.path.isfile(src):
            die('thieu font: ' + src)
        if FONT_FILES[key] not in copied:
            with open(src, 'rb') as fi, open(os.path.join(OUT_FONTS, FONT_FILES[key]), 'wb') as fo:
                fo.write(fi.read())
            copied.add(FONT_FILES[key])
        fonts[key] = 'art/ui/fonts/' + FONT_FILES[key]
        if key in font_lh_src:
            font_lh[key] = r3(lh_tmp[font_lh_src[key]])
        else:                                     # chu Text cu: hhea (ascent - descent + lineGap) / upm
            t = TTFont(src)
            hh = t['hhea']
            font_lh[key] = r3((hh.ascent - hh.descent + hh.lineGap) / float(t['head'].unitsPerEm))

    menu_cs = canvas['menu']
    data = {'ref': menu_cs['ref'], 'match': menu_cs['match'], 'sheet': 'art/ui/sheet.png', 'frames': frames,
            'fonts': fonts, 'fallback': FALLBACK, 'fontLH': font_lh, 'terms': terms, 'canvas': canvas, 'prefabs': prefabs}
    js = '// Sinh boi games/tron-tim/tools/build_ui.py tu D:\\phanminhtam-ref\\ui. Khong sua tay.\nwindow.SK_UI = ' + \
         json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)
    print('prefabs', len(prefabs), 'nodes', b.stats, 'sprites', len(frames), 'sheet', sheet.size)
    print('js bytes', len(js.encode('utf-8')), 'png bytes', os.path.getsize(OUT_PNG))
    print('fonts used', sorted(b.fonts_used), 'terms', len(terms), 'unresolved Localize terms', sorted(b.unresolved_terms))
    print('khung bi chinh vien (tong >= kich thuoc):', sorted(set(clamped)))
    print('canvas', json.dumps(canvas, ensure_ascii=False))


if __name__ == '__main__':
    main()
