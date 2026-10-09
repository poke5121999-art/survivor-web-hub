# -*- coding: utf-8 -*-
"""Prefab uGUI goc cua Soul Knight 8.6 -> data/sk-ui.js + art/ui/ui0.png + art/ui/fonts/*.ttf.

Chay: PYTHONIOENCODING=utf-8 python tools/ui/build_ui.py   (tu games/soulknight)

Moi prefab trong PREFABS thanh mot cay nut rut gon (xem README.md cung thu muc). Sprite duoc cat tu
texture/atlas goc bang skrip.Rip.sprite, xep vao mot trang PNG, giu nguyen diem anh.
"""
import io
import json
import math
import re
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
import skrip  # noqa: E402
from ui import uiclip  # noqa: E402
from PIL import Image  # noqa: E402

LOC = os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json')
OUT_JS = os.path.join(GAME, 'data', 'sk-ui.js')
OUT_PNG = os.path.join(GAME, 'art', 'ui', 'ui0.png')
OUT_FONTS = os.path.join(GAME, 'art', 'ui', 'fonts')

# khoa -> (bundle, duoi duong dan trong m_Container, clip Animator cua goc ap san luc dung)
PREFABS = {
    'hud': ('ui', 'assets/rgprefab/other/scene_object/canvas.prefab', ['show_ui']),
    'minimap': ('levelcommon', 'other/scene_object/minimap/minimap.prefab', []),
    'minimap_room': ('levelcommon', 'other/scene_object/minimap/minimap_room.prefab', []),
    'minimap_corridor': ('levelcommon', 'other/scene_object/minimap/minimap_corridor.prefab', []),
    'choose_hero': ('common', 'assets/rgprefab/other/scene_object/choosehero/ui_choose_hero.prefab', []),
    # Man tai giua hai ai: goc Canvas_Loading cua scene loading.ab (khong co trong m_Container).
    'loading': ('loading', 'scene:Canvas_Loading', []),
    # Thẻ chọn thiên phú UIBuffBar nạp lúc chạy (3 thẻ = buff_tpl3).
    'buff_tpl3': ('common', 'assets/rgprefab/ui/common/buff_tpl3.prefab', []),
    # Màn chọn thú cưng ở sảnh (ChoosePetView).
    'choose_pet': ('common', 'assets/rgprefab/other/scene_object/ui_choose_pet.prefab', []),
}

# Prefab con khong co trong m_Container, chi duoc tro toi tu mot MonoBehaviour cua prefab khac:
# khoa -> (prefab chua, duong dan nut, lop MonoBehaviour, ten truong con tro GameObject).
# [DO] SkinScrollView.cellPrefab = skin_cell (cung CAB voi ui_choose_hero), o thanh truot nhan vat o day man.
REF_PREFABS = {
    'skin_cell': ('choose_hero', 'mask_down/skin_scroll_view', 'SkinScrollView', 'cellPrefab'),
}

# Prefab gan vao nut cua prefab khac nhu ma goc lam luc chay: (dich, duong dan cha, nguon, vi tri).
# [DO] MiniMapUIView.visiblePosition = (-20, -220), cha la map_info_root cua HUD.
COMPOSE = [('hud', 'map_info_root', 'minimap', (-20, -220)),
           # 3 the buff trong luoi cua UIBuffBar, cach nhau 310 don vi canvas [DO khung https://youtu.be/LyMmXTQFcq8?t=44].
           ('loading', 'ui_buff_bar/body/grid', 'buff_tpl3', (-310, 0)),
           ('loading', 'ui_buff_bar/body/grid', 'buff_tpl3', (0, 0)),
           ('loading', 'ui_buff_bar/body/grid', 'buff_tpl3', (310, 0))]

# MonoBehaviour giu nguyen du lieu (con tro Sprite doi thanh ten khung trong trang UI).
# ChooseHeroView: sprite o tick/vach xanh-xam, SkinCell: nen/khung/sao cua o nhan vat, SkinScrollView + Scroller:
# khoang cach o (cellInterval), vi tri o giua (scrollOffset), thoi gian bat o (snap).
MB_KEEP = {'MiniMapUIView', 'ChooseHeroView', 'SkinCell', 'SkinScrollView', 'Scroller'}

# Chu ma goc gan luc chay (khong co component Localize): duong dan nut -> term localization.
# [DO] ChooseHeroView.Awake gan cac term tips/* nay cho nhan cua man chon nhan vat.
_CH_ATTR = 'ui_left/panel/hero_attributes/'
RUNTIME_TERMS = {
    'hud': {'window_pause/title/Text': 'Pause'},
    'choose_hero': {
        _CH_ATTR + 'value1/Name': 'tips/hp', _CH_ATTR + 'value2/Name': 'tips/armor',
        _CH_ATTR + 'value3/Name': 'tips/energy', _CH_ATTR + 'value4/Name': 'tips/critical',
        _CH_ATTR + 'buff/name': 'tips/passive_skill', _CH_ATTR + 'weapon/name': 'tips/init_weapon',
        _CH_ATTR + 'jewelry/name': 'jewelry/name', _CH_ATTR + 'upgraded_detail_button/text': 'tips/upgrade_details',
        'mask_down/skill_demo_checkbox/name': 'tips/skill_demo', 'mask_down/btn_ok/text': 'tips/start',
        'mask_down/btn_ok/try_skin_active/text': 'tips/start',
    },
}

# Term ma ma game ghep luc chay (khong gan vao nut nao); xuat ra SK_UI.terms = {term: chu vi (hoac en)}.
# [DO] ChooseHeroView.RefreshSkills: tips/skill_{0}, tips/iap_unlock, tips/gem_unlock; RefreshSkillDetail:
# multi_room_skin_ui_using, UNLOCK; GetSkillDetailDescription: skill_cd_description; RefreshSkillDemoCheckbox /
# RefreshUnlockArea: tips/unlock_character_first, I_ComingSoon.
EXTRA_TERMS = ['tips/skill_1', 'tips/skill_2', 'tips/skill_3', 'tips/iap_unlock', 'tips/gem_unlock',
               'multi_room_skin_ui_using', 'UNLOCK', 'skill_cd_description', 'tips/unlock_character_first',
               'I_ComingSoon', 'tips/unlock_char', 'ui_loading_new_when_buff_popup', 'ui_loading_new_title', 'uiloading/reroll']
# [SUY] Meo man tai: moi term I_tip_<so> (UILoading chon ngau nhien; I_tip_00 'Hay chon 1 thien phu' khong phai meo).

# Font du phong cho dau tieng Viet (font pixel goc chi co ASCII); ban goc cung mang font nay trong common.ab.
EXTRA_FONTS = ['BeVietnamPro-Regular']

# Vi tri nut mac dinh do KeyboardSetup.RefreshBtnPos dat luc chay, khong nam trong prefab.
# [DO] SettingData..cctor gan *Position2 (dung cho CustomKeyboardLayoutMode.Level = 0), doc bang arm_method.py.
RUNTIME_POS = {
    'hud': {
        'control/joystick': (260, 140), 'control/btn_atk': (-185, 140), 'control/btn_skill': (-300, 110),
        'control/btn_unmount': (-300, 110), 'control/btn_weapon': (-120, 300), 'control/btn_special': (-325, 260),
        'control/btn_emoticon': (-450, 290), 'control/btn_fishing': (-480, 85),
    },
    # Prefab luu bon khoi o ngoai man; ChooseHeroView.ShowOrHideView truot chung ve ShowEndValues trong 0,25 s.
    # [DO] ChooseHeroView..cctor: NodeNames = mask_up, mask_down, ui_left, ui_right; ShowEndValues = 4 x (0, 0);
    # HideEndValues = (0, 180), (0, -300), (-550, 0), (550, 0) (chinh la vi tri trong prefab).
    'choose_hero': {'mask_up': (0, 0), 'mask_down': (0, 0), 'ui_left': (0, 0), 'ui_right': (0, 0)},
}

# zpix: font pixel CJK 4,7 MB, chi cac nut chu Trung (dang an) dung; khong dua len web.
SKIP_FONTS = {'zpix'}
SKIP_MB = {'CanvasScaler', 'GraphicRaycaster', 'CanvasRenderer'}


def r3(v):
    return round(float(v), 3)


def color(c):
    return [r3(c['r']), r3(c['g']), r3(c['b']), r3(c['a'])]


def container(rip, rel, suffix):
    """Tim GameObject goc cua prefab qua AssetBundle.m_Container; 'scene:<ten>' = goc cua scene trong bundle."""
    if suffix.startswith('scene:'):
        for cab in rip.cabs(rel):
            for r in rip.roots(cab):
                if r.name == suffix[6:]:
                    return r
        raise SystemExit('scene root not found: %s in %s' % (suffix, rel))
    for cab in rip.cabs(rel):
        for o in list(rip.files[cab].objects.values()):
            if o.type.name != 'AssetBundle':
                continue
            for path, info in rip.tree(cab, o)['m_Container']:
                if path.endswith(suffix):
                    r = rip.resolve(info['asset'], cab)
                    if r:
                        return skrip.Node(rip, r[0], r[1])
    raise SystemExit('prefab not found: %s in %s' % (suffix, rel))


class Builder:
    def __init__(self, rip):
        self.rip = rip
        self.sprites = {}   # (cab, pid) -> key
        self.images = {}    # key -> (PIL, border l,b,r,t, ppu)
        self.fonts = {}     # ten font -> bytes
        self.font_lh = {}   # ten font -> m_LineSpacing / m_FontSize (chieu cao dong tren moi don vi co chu)
        self.scripts = {}
        self.loc = json.load(open(LOC, encoding='utf-8')) if os.path.exists(LOC) else {}

    def sprite(self, ptr, cab):
        r = self.rip.resolve(ptr, cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k in self.sprites:
            return self.sprites[k]
        got = self.rip.sprite(*r)
        if not got:
            self.sprites[k] = None
            return None
        name, img, _, _, ppu = got
        t = self.rip.tree(*r)
        b = t.get('m_Border', {})
        key = name
        n = 2
        while key in self.images:
            key = '%s#%d' % (name, n)
            n += 1
        self.images[key] = (img, [r3(b.get('x', 0)), r3(b.get('y', 0)), r3(b.get('z', 0)), r3(b.get('w', 0))], r3(ppu))
        self.sprites[k] = key
        return key

    def font(self, ptr, cab):
        r = self.rip.resolve(ptr, cab)
        if not r:
            return None
        t = self.rip.tree(*r)
        name = t['m_Name']
        if name not in self.fonts:
            data = t.get('m_FontData') or []
            self.fonts[name] = bytes(bytearray(data)) if data else None
            if t.get('m_FontSize'):
                self.font_lh[name] = r3(t['m_LineSpacing'] / t['m_FontSize'])
        return name

    def clips(self, n):
        """Moi clip cua Animator tren nut n -> {ten: {len, tracks}} (duong dan tinh tu n)."""
        c = n.comp('Animator')
        if not c:
            return None
        cab, _, t = c
        r = self.rip.resolve(t.get('m_Controller'), cab)
        if not r:
            return None
        ct = self.rip.tree(*r)
        paths = uiclip.node_paths(n)
        out = {}
        for ptr in ct.get('m_AnimationClips', []):
            rr = self.rip.resolve(ptr, r[0])
            if rr:
                res = uiclip.float_tracks(self.rip, rr[0], rr[1], paths)
                out[res['name']] = {'len': res['len'], 'tracks': res['tracks']}
        return out or None

    def plain(self, v, cab):
        """Typetree -> du lieu JSON; con tro toi Sprite thanh ten khung, con tro khac thanh ten doi tuong."""
        if isinstance(v, dict):
            if set(v) == {'m_FileID', 'm_PathID'}:
                r = self.rip.resolve(v, cab)
                if not r:
                    return None
                if r[1].type.name == 'Sprite':
                    return self.sprite(v, cab)
                return self.rip.tree(*r).get('m_Name')
            return {k: self.plain(x, cab) for k, x in v.items() if k not in ('m_GameObject', 'm_Script', 'm_Name', 'm_Enabled')}
        if isinstance(v, list):
            return [self.plain(x, cab) for x in v]
        if isinstance(v, float):
            return r3(v)
        return v

    def node(self, n):
        t = n.t
        out = {'n': n.name}
        an = self.clips(n)
        if an:
            out['an'] = an
        if not n.active:
            out['off'] = 1
        if 'm_AnchorMin' in t:
            a0, a1 = t['m_AnchorMin'], t['m_AnchorMax']
            out['a'] = [r3(a0['x']), r3(a0['y']), r3(a1['x']), r3(a1['y'])]
            out['pv'] = [r3(t['m_Pivot']['x']), r3(t['m_Pivot']['y'])]
            out['p'] = [r3(t['m_AnchoredPosition']['x']), r3(t['m_AnchoredPosition']['y'])]
            out['sz'] = [r3(t['m_SizeDelta']['x']), r3(t['m_SizeDelta']['y'])]
        s = t['m_LocalScale']
        if (r3(s['x']), r3(s['y'])) != (1, 1):
            out['sc'] = [r3(s['x']), r3(s['y'])]
        q = t['m_LocalRotation']
        rz = math.degrees(2 * math.atan2(q['z'], q['w']))
        if abs(rz) > 0.01:
            out['rz'] = r3(rz)
        cls = []
        hide_gfx = False
        for name, ccab, mb in n.mbs():
            if name is None or name in SKIP_MB:
                continue
            en = mb.get('m_Enabled', 1)
            if name == 'Image' or name == 'RawImage':
                img = {'sp': self.sprite(mb.get('m_Sprite'), ccab), 'c': color(mb['m_Color'])}
                for k, src in (('t', 'm_Type'), ('fm', 'm_FillMethod'), ('fo', 'm_FillOrigin'), ('pa', 'm_PreserveAspect')):
                    if mb.get(src):
                        img[k] = mb[src]
                if mb.get('m_Type') == 3:
                    img['fa'] = r3(mb.get('m_FillAmount', 1))
                    img['cw'] = mb.get('m_FillClockwise', 1)
                if mb.get('m_FillCenter', 1) == 0:
                    img['nc'] = 1
                if r3(mb.get('m_PixelsPerUnitMultiplier', 1)) != 1:
                    img['pm'] = r3(mb['m_PixelsPerUnitMultiplier'])
                if not en:
                    img['off'] = 1
                out['img'] = img
            elif name == 'Text':
                fd = mb['m_FontData']
                txt = {'s': mb.get('m_Text', ''), 'c': color(mb['m_Color']), 'fs': fd['m_FontSize'],
                       'al': fd['m_Alignment'], 'f': self.font(fd['m_Font'], ccab)}
                if fd.get('m_FontStyle'):
                    txt['st'] = fd['m_FontStyle']
                if fd.get('m_BestFit'):
                    txt['bf'] = [fd['m_MinSize'], fd['m_MaxSize']]
                if r3(fd.get('m_LineSpacing', 1)) != 1:
                    txt['ls'] = r3(fd['m_LineSpacing'])
                if fd.get('m_HorizontalOverflow'):
                    txt['ho'] = 1
                if fd.get('m_VerticalOverflow'):
                    txt['vo'] = 1
                if not en:
                    txt['off'] = 1
                out['txt'] = txt
            elif name in ('Shadow', 'Outline'):
                d = mb['m_EffectDistance']
                out.setdefault('fx', []).append({'t': name[0].lower(), 'c': color(mb['m_EffectColor']), 'd': [r3(d['x']), r3(d['y'])]})
            elif name in ('HorizontalLayoutGroup', 'VerticalLayoutGroup'):
                p = mb['m_Padding']
                out['lay'] = {'t': name[0].lower(), 'pad': [p['m_Left'], p['m_Right'], p['m_Top'], p['m_Bottom']],
                              'sp': r3(mb['m_Spacing']), 'ca': mb['m_ChildAlignment'],
                              'cw': mb['m_ChildControlWidth'], 'ch': mb['m_ChildControlHeight'],
                              'fw': mb['m_ChildForceExpandWidth'], 'fh': mb['m_ChildForceExpandHeight'],
                              'rv': mb.get('m_ReverseArrangement', 0)}
            elif name == 'GridLayoutGroup':
                p = mb['m_Padding']
                out['lay'] = {'t': 'g', 'pad': [p['m_Left'], p['m_Right'], p['m_Top'], p['m_Bottom']],
                              'cs': [r3(mb['m_CellSize']['x']), r3(mb['m_CellSize']['y'])],
                              'sp': [r3(mb['m_Spacing']['x']), r3(mb['m_Spacing']['y'])],
                              'ca': mb['m_ChildAlignment'], 'cn': [mb['m_Constraint'], mb['m_ConstraintCount']]}
            elif name == 'ContentSizeFitter':
                out['fit'] = [mb['m_HorizontalFit'], mb['m_VerticalFit']]
            elif name == 'LayoutElement':
                out['le'] = {k[2:]: r3(v) for k, v in mb.items() if k in ('m_IgnoreLayout', 'm_MinWidth', 'm_MinHeight', 'm_PreferredWidth', 'm_PreferredHeight', 'm_FlexibleWidth', 'm_FlexibleHeight')}
            elif name in ('Mask', 'RectMask2D'):
                out['mask'] = 1
                if name == 'Mask' and not mb.get('m_ShowMaskGraphic', 1):
                    hide_gfx = True
            elif name == 'CanvasGroup':
                out['cg'] = r3(mb.get('m_Alpha', 1))
            elif name in MB_KEEP:
                out.setdefault('mbd', {})[name] = self.plain(mb, ccab)
            elif name == 'Localize':
                term = mb.get('mTerm') or ''
                if term:
                    ev = self.loc.get(term)
                    out['loc'] = [term] + (ev if ev else [])
                    if ev and ev[1] and out.get('txt'):
                        out['txt']['s'] = ev[1]
            else:
                cls.append(name)
        # Mask.m_ShowMaskGraphic = 0: Image van bat (clip co the bat/tat no) nhung khong bao gio ve ra.
        if hide_gfx and out.get('img'):
            out['img']['gfx'] = 0
        if cls:
            out['cls'] = cls
            for c in cls:
                self.scripts[c] = self.scripts.get(c, 0) + 1
        kids = [self.node(ch) for ch in n.children()]
        if kids:
            out['k'] = kids
        return out

    def pack(self):
        """Xep sprite theo hang (cao truoc), chen 1 px trong suot giua cac anh."""
        keys = sorted(self.images, key=lambda k: (-self.images[k][0].height, k))
        W, x, y, rowh, pos = 2048, 0, 0, 0, {}
        for k in keys:
            im = self.images[k][0]
            if x + im.width > W:
                x, y, rowh = 0, y + rowh + 1, 0
            pos[k] = (x, y)
            x += im.width + 1
            rowh = max(rowh, im.height)
        H = y + rowh
        sheet = Image.new('RGBA', (W, max(1, H)), (0, 0, 0, 0))
        out = {}
        for k in keys:
            im, border, ppu = self.images[k]
            px, py = pos[k]
            sheet.paste(im, (px, py))
            out[k] = [px, py, im.width, im.height] + border + [ppu]
        return sheet, out


def node_at(node, path):
    """Nut skrip.Node theo duong dan ten con (nhu find, nhung tren cay goc)."""
    for name in [x for x in path.split('/') if x]:
        node = next((c for c in node.children() if c.name == name), None)
        if node is None:
            raise SystemExit('node not found: ' + path)
    return node


def ref_prefab(rip, root, path, cls, field):
    """GameObject ma truong `field` cua MonoBehaviour `cls` tren nut `path` tro toi."""
    for name, cab, mb in node_at(root, path).mbs():
        if name == cls:
            r = rip.resolve(mb[field], cab)
            if r:
                return skrip.Node(rip, r[0], r[1])
    raise SystemExit('prefab reference not found: %s.%s at %s' % (cls, field, path))


def find(node, path):
    for name in [x for x in path.split('/') if x]:
        node = next((c for c in node.get('k', []) if c['n'] == name), None)
        if node is None:
            return None
    return node


def apply_clip(root, name):
    """Ghi gia tri cuoi cua clip `name` (tren Animator cua goc) vao cay nut, nhu trang thai sau khi clip chay xong."""
    clip = (root.get('an') or {}).get(name)
    if not clip:
        raise SystemExit('clip not found: ' + name)
    for tr in clip['tracks']:
        n = find(root, tr['path'])
        if n is None:
            continue
        v = tr['keys'][-1][1]
        base, _, ax = tr['prop'].partition('.')
        i = 'xyzw'.find(ax) if ax in 'xyzw' else 'rgba'.find(ax)
        if base == 'm_AnchoredPosition':
            n['p'][i] = v
        elif base == 'm_SizeDelta':
            n['sz'][i] = v
        elif base == 'm_LocalScale':
            n.setdefault('sc', [1, 1])
            if i < 2:
                n['sc'][i] = v
        elif base == 'm_IsActive':
            if v:
                n.pop('off', None)
            else:
                n['off'] = 1
        elif base == 'm_Enabled' and (n.get('img') or n.get('txt')):
            g = n.get('img') or n.get('txt')
            if v:
                g.pop('off', None)
            else:
                g['off'] = 1
        elif base == 'm_Color' and n.get('img'):
            n['img']['c'][i] = v
        elif base == 'm_Color' and n.get('txt'):
            n['txt']['c'][i] = v
        elif base == 'm_Alpha':
            n['cg'] = v


def main():
    rip = skrip.Rip(bundles=[v[0] for v in PREFABS.values()] + ['common', 'fonts_default', 'sprite_atlas'])
    b = Builder(rip)
    prefabs, roots = {}, {}
    for key, (rel, suffix, apply) in PREFABS.items():
        root = roots[key] = container(rip, rel, suffix)
        prefabs[key] = b.node(root)
        for name in apply:
            apply_clip(prefabs[key], name)
        for path, pos in RUNTIME_POS.get(key, {}).items():
            find(prefabs[key], path)['p'] = list(pos)
        for path, term in RUNTIME_TERMS.get(key, {}).items():
            ev = b.loc.get(term)
            if not ev:
                raise SystemExit('localization term not found: ' + term)
            find(prefabs[key], path)['txt']['s'] = ev[1] or ev[0]
    for key, (src, path, cls, field) in REF_PREFABS.items():
        prefabs[key] = b.node(ref_prefab(rip, roots[src], path, cls, field))
    for cab, o in rip.objects(['common'], ('Font',)):
        t = rip.tree(cab, o)
        if t['m_Name'] in EXTRA_FONTS and t.get('m_FontData'):
            b.fonts[t['m_Name']] = bytes(bytearray(t['m_FontData']))
    for dst, parent, src, pos in COMPOSE:
        child = json.loads(json.dumps(prefabs[src]))
        child['p'] = list(pos)
        if src == 'buff_tpl3':
            child['a'], child['off'] = [0.5, 0.5, 0.5, 0.5], 1
        find(prefabs[dst], parent).setdefault('k', []).append(child)
    sheet, frames = b.pack()
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)
    os.makedirs(OUT_FONTS, exist_ok=True)
    fonts = {}
    for name, data in b.fonts.items():
        if data and name not in SKIP_FONTS:
            fn = name.replace(' ', '_') + '.ttf'
            open(os.path.join(OUT_FONTS, fn), 'wb').write(data)
            fonts[name] = 'art/ui/fonts/' + fn
        else:
            fonts[name] = None
    data = {'ref': [1280, 720], 'match': 1, 'sheet': 'art/ui/ui0.png', 'frames': frames, 'fonts': fonts,
            'fallback': [f for f in EXTRA_FONTS if fonts.get(f)],
            'fontLH': b.font_lh,
            'terms': {t: (b.loc[t][1] or b.loc[t][0]) for t in EXTRA_TERMS},
            'tips': [b.loc[t][1] or b.loc[t][0] for t in sorted(b.loc) if re.match(r'^I_tip_\d+$', t) and t != 'I_tip_00'],
            'prefabs': prefabs}
    js = '// Sinh boi tools/ui/build_ui.py tu prefab uGUI goc. Khong sua tay.\nwindow.SK_UI = ' + \
         json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('prefabs', list(prefabs), 'sprites', len(frames), 'sheet', sheet.size, 'fonts', fonts)
    print('js bytes', len(js.encode('utf-8')))
    print('custom scripts', sorted(b.scripts.items(), key=lambda kv: -kv[1])[:40])
    missing = [k for k, v in b.sprites.items() if v is None]
    if missing:
        print('sprites unresolved', len(missing))


if __name__ == '__main__':
    main()
