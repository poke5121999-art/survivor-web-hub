# -*- coding: utf-8 -*-
"""Prefab NGUI cua Zing Speed Mobile -> data/ugui.js + art/ugui/ui0.png + art/ugui/fonts/*.ttf.

Chay: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/build_ui.py

Game goc dung NGUI (UIPanel/UIAnchor/UISprite/UILabel), khong phai uGUI. Tool doc prefab ra cay nut cung dang voi
Soul Knight (games/soulknight/tools/ui/README.md) de js/ui/ugui.js ve lai duoc: moi nut con neo vao diem goc (pivot)
cua nut cha, p = localPosition, sz = mWidth x mHeight, pv = pivot cua widget. UIAnchor thanh nut neo vao mep man hinh.
Xem UI.md de biet [DO] / [SUY].
"""
import collections
import io
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ui_rip  # noqa: E402
import skrip  # noqa: E402
import zs  # noqa: E402
from PIL import Image  # noqa: E402

GAME = os.path.dirname(HERE)
OUT_JS = os.path.join(GAME, 'data', 'ugui.js')
OUT_DIR = os.path.join(GAME, 'art', 'ugui')
OUT_FONTS = os.path.join(OUT_DIR, 'fonts')
BASE = 'assets/resforassetbundles/ui/'

# khoa -> duong dan duoi assets/resforassetbundles/ui/
PREFABS = collections.OrderedDict([
    ('ingameview', 'ingame/#ingame/ingameview.prefab'),
    ('speednitro', 'ingame/#ingame/ig_siglespeednitrogen.prefab'),
    ('controls', 'ingame/#ingame/operatingmode_twoside.prefab'),
    ('countdown', 'ingame/#ingame/ig_startcountdowndialog.prefab'),
    ('minimap', 'ingame/#ingame/ig_minimapcontainer.prefab'),
    ('minimapparams', 'ingame/#ingame/minimapparams.prefab'),
    ('rankitem', 'ingame/#ingame/speedrankitem.prefab'),
    ('myrankitem', 'ingame/#ingame/speedmyrankitem.prefab'),
    ('lap2', 'ingame/#ingame/traffic_lap2.prefab'),
    ('lap3', 'ingame/#ingame/traffic_lap3.prefab'),
    ('finish', 'ingame/#ingame/traffic_finish.prefab'),
    ('booststate', 'ingame/#ingame/ig_booststatevisualdlg.prefab'),
    ('driftdis', 'ingame/#ingame/ig_showdriftingdisdlg.prefab'),
    ('confirmexit', 'ingame/#ingame/ig_confirmexitdlg.prefab'),
    ('settle', '#settle/ig_settleview.prefab'),
    ('settlemain', '#settle/ig_settlemainscreen.prefab'),
    ('garage', 'garage/#normalgarage/og_lb_garageview.prefab'),
    ('garageitem', 'garage/#normalgarage/garagevehicleitem.prefab'),
    ('lobby', '#lobbyhome/og_lb_lobbyview.prefab'),
])

# Chieu cao UIRoot.manualHeight: bien doi canvas (xem UI.md). [SUY] khong co UIRoot trong bundle, suy tu kich thuoc widget.
REF = [1280, 720]

# Font dong cua prefab la ban "Empty" (khung rong); ban VN nap font that qua bang thay the. Cafeta la font tieng Viet.
FONT_BOLD, FONT_NORMAL, FONT_NUM = 'CafetaBold', 'UTM CAFETA', 'FontNumber'
FONT_PICK = {'CafetaBold', 'UTM CAFETA', 'FontNumber'}
FONT_BUNDLES = ['AssetBundles/60/606ef0b17491bc450878465550bd6b9b', 'AssetBundles/cc/cc00003b1c04e605ec9eda5ba31bf0cb']

LOC_BUNDLE = 'AssetBundles/b6/b60d97626a81736aff4dbba12a6adb4b'
LOC_CHS_BUNDLE = 'AssetBundles/d1/d1cfb02cb244fc44a632429c75c9a844'

PIVOT_X = [0, .5, 1, 0, .5, 1, 0, .5, 1]
PIVOT_Y = [1, 1, 1, .5, .5, .5, 0, 0, 0]
SIDE = [(0, 0), (0, .5), (0, 1), (.5, 1), (1, 1), (1, .5), (1, 0), (.5, 0), (.5, .5)]  # NGUI UIAnchor.Side


def r3(v):
    return round(float(v), 3)


def color(c):
    return [r3(c['r']), r3(c['g']), r3(c['b']), r3(c['a'])]


def u32le(b, o):
    return struct.unpack_from('<I', b, o)[0]


# Chu ma bang localization_*_base khong co (chu giu cho cac nhan, ban VN tai tu Puffer sau khi cai): dich tay, [SUY].
# Khoa la chu cua prefab sau khi bo BBCode.
VI_FIX = {
    '圈': 'Vòng', '25%赛段': 'Chặng 25%', '本赛段达成前': 'Trước khi xong chặng', '本赛段本队达成第': 'Đội xong chặng thứ',
    '赛段达标': 'Chặng đạt chuẩn', '赛段倒计时': 'Đếm ngược chặng', '正在占点': 'Đang chiếm điểm', '机甲': 'Mecha',
    '漂移值': 'Điểm drift', '排位驾驶中': 'Đang lái xếp hạng', '99天99小时': '99 ngày 99 giờ', '回归特权': 'Đặc quyền trở lại',
    '限免': 'Miễn phí', '超频驾驶中': 'Đang lái siêu tần', '觉醒中': 'Đang thức tỉnh', '1阶段': 'Giai đoạn 1',
    '兰博基尼': 'Lamborghini', '品阶': 'Phẩm cấp', '描述': 'Mô tả', '再来一局': 'Chơi lại', '超级ECU': 'ECU siêu cấp',
    '特性1': 'Đặc tính 1', '特性2': 'Đặc tính 2', '特性3': 'Đặc tính 3', '定制': 'Tùy chỉnh', '藏馆': 'Bảo tàng',
    '强化': 'Cường hóa', '满改': 'Độ tối đa', '可激活': 'Kích hoạt', '改装': 'Độ xe', '对比': 'So sánh',
    '雷达图': 'Biểu đồ', '使用': 'Sử dụng', '限免驾驶中': 'Đang lái miễn phí', '系列藏馆': 'Bộ sưu tập',
    '超级限免中': 'Đang siêu miễn phí', '超级限免': 'Siêu miễn phí', '平跑氮气速度': 'Tốc độ nitro chạy thẳng',
    '皮肤加成:': 'Cộng từ skin:', '进阶进度:': 'Tiến độ nâng cấp:', '皮肤进阶': 'Nâng cấp skin', '社交': 'Xã hội',
    '萌新专属福利': 'Quà tân thủ', '飞车练习生': 'Tay đua tập sự', '经典': 'Cổ điển', '特殊': 'Đặc biệt',
    '04.26-06.26 可限免使用': '26/04 - 26/06 dùng miễn phí', '总览': 'Tổng quan', '详情': 'Chi tiết',
    '赛道—马达加斯加': 'Đường đua - Madagascar', '觀看': 'Xem', '观看': 'Xem', '總分': 'Tổng điểm',
    '车名  皮肤名字C': 'Tên xe  Tên skin', '未拥有未拥有未拥有': 'Chưa sở hữu', '神圣天使兽天女天': '', '创世之神': 'Thần sáng thế',
    '不知道叫个啥': '', '橘子电玩': 'Game center', '魔法': 'Phép thuật',
    '4分44秒内通过10个摄像头（均速180）': 'Qua 10 camera trong 4:44 (tốc độ TB 180)',
    'xxx 獲得了第一名，他駕駛的是 "DDD"': '[ffcd21]xxx[-] [ffffff]giành hạng nhất, đang lái[-] [ffcd21]"DDD"[-]',
    '每秒自动集气2%且小喷最高\n速\n度+2km/h.小喷动力+4%.落后于第一名时,所有效果变为2.5\n':
        'Mỗi giây tự nạp 2% nitro, tốc độ tối đa nitro nhỏ +2 km/h, lực nitro nhỏ +4%. Khi xếp sau hạng nhất, mọi hiệu ứng x2,5',
}


class Loc:
    """localization_*_base.bytes: u32 x3 dau, u32 N, N hash u32 tang dan, N offset tuyet doi, moi chuoi = u32 do dai + utf8.
    Cac ngon ngu cung hang cung cung hash. Khoa m_key (16 hex) cua CUILocalizationScript chua giai duoc ra hash,
    nen tra theo chu tieng Anh cua prefab: neu mot chu Anh co nhieu hang khac nghia thi lay ban hay gap nhat."""

    def __init__(self, rip):
        raw = {}
        for cab, o in rip.objects([LOC_BUNDLE, LOC_CHS_BUNDLE], ('TextAsset',)):
            d = o.read()
            b = d.m_Script.encode('utf-8', 'surrogateescape') if isinstance(d.m_Script, str) else bytes(d.m_Script)
            raw[d.m_Name] = b
        self.rows = {}
        for lang in ('EN', 'VN', 'CHS', 'CHT'):
            b = raw['Localization_%s_Base' % lang]
            n = u32le(b, 12)
            offs = struct.unpack_from('<%dI' % n, b, 16 + 4 * n)
            self.rows[lang] = [b[o + 4:o + 4 + u32le(b, o)].decode('utf-8', 'replace') for o in offs]
        self.hash = struct.unpack_from('<%dI' % n, raw['Localization_VN_Base'], 16)
        by = collections.defaultdict(list)
        for en, vi in zip(self.rows['EN'], self.rows['VN']):
            by[en].append(vi)
        self.by = by
        self.chs = {}
        for lang in ('CHS', 'CHT'):
            for zh, vi in zip(self.rows[lang], self.rows['VN']):
                self.chs.setdefault(zh, []).append(vi)
        self.by_norm = {}
        for en, vs in by.items():
            self.by_norm.setdefault(self.norm(en), []).extend(vs)
        self.ambiguous = {}

    @staticmethod
    def norm(s):
        return s.replace('\u2019', "'").replace('\u2018', "'").replace('\u201c', '"').replace('\u201d', '"').strip()

    def vi(self, en):
        c = self.by.get(en) or self.by_norm.get(self.norm(en)) or self.chs.get(en)
        if not c:
            return None
        if len(set(c)) > 1:
            self.ambiguous[en] = sorted(set(c))
        return collections.Counter(c).most_common(1)[0][0].replace('\\n', '\n')


def bb2rich(s):
    """BBCode cua NGUI ([rrggbb]..[-], [b][/b]...) -> <color=#rrggbb>..</color> cua ugui.js."""
    out, depth = [], 0

    def rep(m):
        nonlocal depth
        t = m.group(1)
        if re.fullmatch(r'[0-9a-fA-F]{6}([0-9a-fA-F]{2})?', t):
            depth += 1
            return '<color=#%s>' % t
        if t == '-' and depth:
            depth -= 1
            return '</color>'
        return ''
    s = re.sub(r'\[([0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|-|/?[bius]|/?sup|/?sub|-|url[^\]]*|/url|c|/c)\]', rep, s)
    return s + '</color>' * depth


class Builder:
    def __init__(self, rip):
        self.rip = rip
        self.loc = Loc(rip)
        self.atlas = {}      # (cab, pid) -> (sprites dict, PIL, replacement)
        self.images = {}     # key -> (PIL, [l, b, r, t], ppu)
        self.frame_of = {}   # (atlas key, sprite) -> frame key
        self.fonts = {}      # ten -> bytes
        self.skipped = collections.Counter()
        self.terms = {}
        self.path = []
        self.missing_sprites = collections.Counter()
        self.stats = collections.Counter()
        self.cur_key = None

    # ---- sprite ----------------------------------------------------------------------------------
    def atlas_of(self, ptr, cab):
        r = self.rip.resolve(ptr, cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k in self.atlas:
            return k, self.atlas[k]
        t = self.rip.tree(*r)
        rep = t.get('mReplacement')
        if rep and rep.get('m_PathID'):
            got = self.atlas_of(rep, r[0])
            if got:
                self.atlas[k] = got[1]
                return k, got[1]
        sprites = {s['name']: s for s in t.get('mSprites', [])}
        img = None
        mat = self.rip.resolve(t.get('material'), r[0])
        if mat:
            for name, env in self.rip.tree(*mat)['m_SavedProperties']['m_TexEnvs']:
                if name == '_MainTex':
                    img = self.rip._texture(env['m_Texture'], mat[0])
                    break
        go = self.rip.resolve(t.get('m_GameObject'), r[0])
        gname = self.rip.tree(*go)['m_Name'] if go else 'atlas'
        self.atlas[k] = (sprites, img.convert('RGBA') if img is not None else None, gname)
        return k, self.atlas[k]

    def sprite(self, ptr, cab, name):
        got = self.atlas_of(ptr, cab)
        if not got or not name:
            return None
        ak, (sprites, img, gname) = got
        fk = (ak, name)
        if fk in self.frame_of:
            return self.frame_of[fk]
        s = sprites.get(name)
        if s is None or img is None:
            self.missing_sprites[name] = self.missing_sprites.get(name, 0) + 1
            self.frame_of[fk] = None
            return None
        x, y, w, h = s['x'], s['y'], s['width'], s['height']
        im = img.crop((x, y, x + w, y + h))
        pl, pr, pt, pb = s['paddingLeft'], s['paddingRight'], s['paddingTop'], s['paddingBottom']
        if pl or pr or pt or pb:
            full = Image.new('RGBA', (w + pl + pr, h + pt + pb), (0, 0, 0, 0))
            full.paste(im, (pl, pt))
            im = full
        key = name
        n = 2
        while key in self.images:
            key = '%s#%d' % (name, n)
            n += 1
        self.images[key] = (im, [s['borderLeft'] + pl, s['borderBottom'] + pb, s['borderRight'] + pr, s['borderTop'] + pt], 100)
        self.frame_of[fk] = key
        return key

    def texture(self, ptr, cab):
        r = self.rip.resolve(ptr, cab)
        if not r or r[1].type.name != 'Texture2D':
            return None
        fk = ('tex', r[0], r[1].path_id)
        if fk in self.frame_of:
            return self.frame_of[fk]
        im = self.rip._texture(ptr, cab)
        key = None
        if im is not None and im.width * im.height <= 1024 * 1024:
            name = self.rip.tree(*r)['m_Name']
            key = name
            n = 2
            while key in self.images:
                key = '%s#%d' % (name, n)
                n += 1
            self.images[key] = (im.convert('RGBA'), [0, 0, 0, 0], 100)
        self.frame_of[fk] = key
        return key

    # ---- font -------------------------------------------------------------------------------------
    def font_name(self, mb, cab):
        f = self.rip.resolve(mb.get('mTrueTypeFont'), cab)
        src = self.rip.tree(*f)['m_Name'] if f else None
        if src == 'FontNumber':
            return FONT_NUM
        if src and 'Bold' in src or src is None:
            return FONT_BOLD
        return FONT_NORMAL

    # ---- node -------------------------------------------------------------------------------------
    def widget(self, n):
        for name, cab, mb in n.mbs():
            if name in ('UISprite', 'UILabel', 'UITexture', 'UIWidget'):
                return name, cab, mb
        return None, None, None

    def has_anchor(self, n):
        return any(m[0] == 'UIAnchor' for m in n.mbs()) or any(self.has_anchor(c) for c in n.children())

    def node(self, n, par_pv=(.5, .5), stretch_ok=True, panel_depth=0):
        """-> (nut, khoa ve) hoac None. khoa ve = (do sau panel, do sau widget) nho nhat trong cay con."""
        t = n.t
        out = {'n': n.name}
        if not n.active:
            out['off'] = 1
        wname, wcab, w = self.widget(n)
        mbs = {name: (cab, mb) for name, cab, mb in n.mbs()}
        if 'UIPanel' in mbs:
            pm = mbs['UIPanel'][1]
            panel_depth = pm.get('mDepth', 0)
            if pm.get('mAlpha', 1) != 1:
                out['cg'] = r3(pm['mAlpha'])
            if pm.get('mClipping'):
                self.stats['panel_clip'] += 1
        pos = t['m_LocalPosition']
        has_anchor_below = any(self.has_anchor(c) for c in n.children())
        pv = (.5, .5)
        wh = (0, 0)
        if w is not None:
            pv = (PIVOT_X[w['mPivot']], PIVOT_Y[w['mPivot']]) if wname != 'UITexture' else (PIVOT_X[w['mPivot']], PIVOT_Y[w['mPivot']])
            wh = (w['mWidth'], w['mHeight'])
        col = None
        if 'BoxCollider' in [c[0] for c in n.comps]:
            for tn, ccab, co in n.comps:
                if tn == 'BoxCollider':
                    col = self.rip.tree(ccab, co)
        if w is None and col is not None:
            cs, cc = col['m_Size'], col['m_Center']
            if cs['x'] > 0 and cs['y'] > 0:
                wh = (cs['x'], cs['y'])
                pv = (.5 - cc['x'] / cs['x'], .5 - cc['y'] / cs['y'])
        if 'UIAnchor' in mbs:
            am = mbs['UIAnchor'][1]
            sx, sy = SIDE[am['side']]
            ro, po = am['relativeOffset'], am['pixelOffset']
            out['a'] = [r3(sx + ro['x']), r3(sy + ro['y'])] * 2
            out['p'] = [r3(po['x']), r3(po['y'])]
            out['pv'] = [.5, .5]
            out['sz'] = [0, 0]
            out['an_side'] = am['side']
            pv = (.5, .5)
            if am.get('container', {}).get('m_PathID'):
                self.stats['anchor_container'] += 1
        elif stretch_ok and has_anchor_below and w is None:
            out['a'] = [0, 0, 1, 1]
            out['p'] = [0, 0]
            out['pv'] = [.5, .5]
            out['sz'] = [0, 0]
        else:
            out['a'] = [par_pv[0], par_pv[1], par_pv[0], par_pv[1]]
            out['p'] = [r3(pos['x']), r3(pos['y'])]
            out['pv'] = [r3(pv[0]), r3(pv[1])]
            out['sz'] = [wh[0], wh[1]]
        s = t['m_LocalScale']
        if (r3(s['x']), r3(s['y'])) != (1, 1):
            out['sc'] = [r3(s['x']), r3(s['y'])]
        q = t['m_LocalRotation']
        rz = math.degrees(2 * math.atan2(q['z'], q['w']))
        if abs(rz) > 0.01:
            out['rz'] = r3(rz)
        if col is not None and w is not None:
            cs, cc = col['m_Size'], col['m_Center']
            out['col'] = [r3(cc['x']), r3(cc['y']), r3(cs['x']), r3(cs['y'])]
        key = (1e9, 1e9)
        if wname == 'UISprite':
            key = (panel_depth, w['mDepth'])
            out['img'] = self.sprite_img(w, wcab)
            fl = out['img'].pop('flip', 0)
            if fl:
                sc = out.get('sc', [1, 1])
                out['sc'] = [sc[0] * (-1 if fl & 1 else 1), sc[1] * (-1 if fl & 2 else 1)]
        elif wname == 'UITexture':
            key = (panel_depth, w['mDepth'])
            self.texture_img(out, w, wcab)
        elif wname == 'UILabel':
            key = (panel_depth, w['mDepth'])
            out['txt'] = self.label(out, w, wcab, mbs)
        elif wname == 'UIWidget':
            key = (panel_depth, w['mDepth'])
        if w is not None and not w.get('m_Enabled', 1):
            for g in (out.get('img'), out.get('txt')):
                if g:
                    g['off'] = 1
        if 'UISlider' in mbs or 'UIProgressBar' in mbs:
            sl = mbs.get('UISlider') or mbs.get('UIProgressBar')
            out['slider'] = r3(sl[1].get('mValue', 1))
        mesh = self.mesh_img(n)
        if mesh and 'img' not in out:
            out['img'], ctr, size = mesh
            out['sz'] = [r3(size[0]), r3(size[1])]
            out['p'] = [r3(out['p'][0] + ctr[0] * s['x']), r3(out['p'][1] + ctr[1] * s['y'])]
            out['pv'] = [.5, .5]
            key = (panel_depth, 0)
        cls = [name for name, cab, mb in n.mbs() if name not in (
            'UISprite', 'UILabel', 'UITexture', 'UIWidget', 'UIPanel', 'UIAnchor', 'CUILocalizationScript', 'UIPlaySound',
            'UIPlayAudioEvent', 'UIEventListener', 'UIDepthHelp', 'EffectAdapter', 'TransparentCommonCurves', 'UIEffect',
            'DOTweenAnimation', 'UIKeyBinding', 'UIButton', 'CMTweener') and name]
        if cls:
            out['cls'] = cls
        for name in ('MeshRenderer', 'ParticleSystem'):
            if any(c[0] == name for c in n.comps):
                self.skipped[name] += 1
        kids = []
        for ch in n.children():
            got = self.node(ch, pv, True, panel_depth)
            if got:
                kids.append(got)
        kids.sort(key=lambda kv: kv[1])
        if kids:
            out['k'] = [k for k, _ in kids]
            key = min([key] + [k for _, k in kids])
        return out, key

    def mesh_img(self, n):
        """MeshRenderer phang (chu so dem nguoc, bien LAP/FINISH) -> anh. Co _AlphaTex thi ghep lam kenh alpha."""
        pat = MESH_KEEP.get(self.cur_key)
        if not pat or not re.search(pat, n.name):
            return None
        mr = next((c for c in n.comps if c[0] == 'MeshRenderer'), None)
        mf = next((c for c in n.comps if c[0] == 'MeshFilter'), None)
        if not mr or not mf:
            return None
        rip = self.rip
        mesh = rip.resolve(rip.tree(mf[1], mf[2])['m_Mesh'], mf[1])
        mats = rip.tree(mr[1], mr[2])['m_Materials']
        mat = rip.resolve(mats[0], mr[1]) if mats else None
        if not mesh or not mat:
            return None
        box = rip.tree(*mesh)['m_LocalAABB']
        if box['m_Extent']['z'] > 1:
            self.skipped['mesh3d'] += 1
            return None
        tex = {}
        for name, env in rip.tree(*mat)['m_SavedProperties']['m_TexEnvs']:
            if name in ('_MainTex', '_AlphaTex'):
                im = rip._texture(env['m_Texture'], mat[0])
                if im is not None:
                    tex[name] = im
        main = tex.get('_MainTex')
        if main is None:
            return None
        al = tex.get('_AlphaTex')
        if al is not None:
            im = main.convert('RGB').convert('RGBA')
            im.putalpha(al.convert('L').resize(im.size))
        elif 'alpha' in rip.tree(*rip.resolve(next(e for k, e in rip.tree(*mat)['m_SavedProperties']['m_TexEnvs'] if k == '_MainTex')['m_Texture'], mat[0]))['m_Name'].lower():
            im = Image.new('RGBA', main.size, (255, 255, 255, 255))
            im.putalpha(main.convert('L'))
        else:
            im = main.convert('RGBA')
            if im.getchannel('A').getextrema()[0] == 255:  # bien 3D tren duong: khong co alpha, lay do sang lam alpha
                im.putalpha(im.convert('RGB').convert('L').point(lambda v: min(255, v * 3)))
        name = 'mesh_' + rip.tree(*mat)['m_Name']
        if name not in self.images:
            self.images[name] = (im, [0, 0, 0, 0], 100)
        e, c = box['m_Extent'], box['m_Center']
        k = 10 if self.cur_key in ('lap2', 'lap3', 'finish') else 1  # bien tren duong tinh bang met, 10 px/m [SUY]
        return {'sp': name, 'c': [1, 1, 1, 1]}, (c['x'] * k, c['y'] * k), (2 * e['x'] * k, 2 * e['y'] * k)

    def sprite_img(self, w, cab):
        sp = self.sprite(w['mAtlas'], cab, w['mSpriteName'])
        img = {'sp': sp, 'c': color(w['mColor'])}
        t = w['mType']
        if t in (1, 3):
            img['t'] = t
        elif t == 2:
            self.stats['tiled'] += 1
        elif t == 4:
            img['t'] = 1
            self.stats['advanced'] += 1
        if t == 3:
            img['fm'] = min(w['mFillDirection'], 2)
            img['fa'] = r3(w['mFillAmount'])
            if w['mFillDirection'] >= 2:
                img['fm'] = 2
                img['fo'] = 2
                img['cw'] = 0 if w['mInvert'] else 1
            elif w['mInvert']:
                img['fo'] = 1
        if t == 1 and not w.get('mFillCenter', 1):
            img['nc'] = 1
        if w.get('mFlip'):
            img['flip'] = w['mFlip']
        if not sp:
            img['off'] = 1
            img['miss'] = w['mSpriteName']
        return img

    def texture_img(self, out, w, cab):
        tex = self.texture(w.get('mTexture'), cab)
        c = color(w['mColor'])
        if tex:
            out['img'] = {'sp': tex, 'c': c}
        else:
            out['dyn'] = 1  # texture gan luc chay (avatar, ban do nho)

    def label(self, out, w, cab, mbs):
        text = w['mText']
        plain = re.sub(r'\[[0-9a-fA-F]{6}\]|\[-\]', '', text).strip()
        fx = VI_FIX.get(plain) if plain in VI_FIX else VI_FIX.get(plain.replace('\n', '').replace(' ', ''))
        if fx is None and plain.startswith('每秒自动集气'):
            fx = VI_FIX['每秒自动集气2%且小喷最高\n速\n度+2km/h.小喷动力+4%.落后于第一名时,所有效果变为2.5\n']
        loc = mbs.get('CUILocalizationScript')
        en = text
        vi = fx if fx is not None else self.loc.vi(text)
        if vi is not None and loc:
            out['loc'] = [loc[1]['m_key'], en, vi]
            text = vi
        elif vi is not None:
            self.stats['vi_without_loc'] += 1
        if loc is None and vi is not None:
            text = vi
        c = color(w['mColor'])
        if w.get('mApplyGradient'):
            g1, g2 = w['mGradientTop'], w['mGradientBottom']
            c = [r3(c[0] * (g1['r'] + g2['r']) / 2), r3(c[1] * (g1['g'] + g2['g']) / 2), r3(c[2] * (g1['b'] + g2['b']) / 2), c[3]]
        pv = w['mPivot']
        al = (0 if PIVOT_Y[pv] == 1 else 1 if PIVOT_Y[pv] == .5 else 2) * 3
        ha = w['mAlignment']
        al += {1: 0, 2: 1, 3: 2, 4: 0}.get(ha, int(PIVOT_X[pv] * 2))
        txt = {'s': bb2rich(text), 'c': c, 'fs': w['mFontSize'], 'al': al, 'f': self.font_name(w, cab)}
        if w['mFontStyle'] in (1, 3):
            txt['st'] = 1
        ov = w['mOverflow']
        if ov == 0:
            txt['bf'] = [8, w['mFontSize']]
        if ov == 2 or not w.get('mMultiline', 1):
            txt['ho'] = 1
        if ov != 1 and ov != 0:
            txt['vo'] = 1
        if w.get('mUseFloatSpacing') and w.get('mFloatSpacingY'):
            txt['ls'] = r3(1 + w['mFloatSpacingY'] / w['mFontSize'])
        es = w['mEffectStyle']
        if es:
            d = w['mEffectDistance']
            out.setdefault('fx', []).append({'t': 's' if es == 1 else 'o', 'c': color(w['mEffectColor']),
                                             'd': [r3(d['x']), r3(d['y'])]})
        if w.get('mFont', {}).get('m_PathID'):
            self.stats['bitmap_font'] += 1
            txt['bmp'] = 1
        self.terms[en] = vi if vi is not None else en
        return txt

    # ---- sheet -----------------------------------------------------------------------------------
    def pack(self, W=2048):
        keys = sorted(self.images, key=lambda k: (-self.images[k][0].height, k))
        x = y = rowh = 0
        pos = {}
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


# Ghep HUD dua: prefab con gan vao diem neo cua ingameview nhu goc lam luc chay. [SUY] noi gan (xem UI.md).
COMPOSE = [('racehud', 'ingameview', [('StaticUI/AnchorTopRight/Offset', 'minimap'), ('DynamicUI/AnchorButtom', 'speednitro'),
                                      ('', 'controls')])]


# MeshRenderer phang chi lay o cac prefab nay (chu so dem nguoc, bien LAP/FINISH); VFX cong sang khong dung.
MESH_KEEP = {'countdown': r'^UIFX_CountDown_(01|02|03|go)$', 'lap2': '.', 'lap3': '.', 'finish': '.'}


def find(node, path):
    for name in [x for x in path.split('/') if x]:
        node = next((c for c in node.get('k', []) if c['n'] == name), None)
        if node is None:
            raise SystemExit('node not found: ' + path)
    return node


def container(rip, path):
    rec = [r for r in zs.find(BASE + path) if BASE + path in r['cont']]
    if not rec:
        raise SystemExit('prefab not found: ' + path)
    rel = rec[0]['f']
    for cab in rip.load(rel):
        for o in list(rip.files[cab].objects.values()):
            if o.type.name != 'AssetBundle':
                continue
            for p, info in rip.tree(cab, o)['m_Container']:
                if p == BASE + path:
                    r = rip.resolve(info['asset'], cab)
                    return skrip.Node(rip, r[0], r[1])
    raise SystemExit('prefab container not found: ' + path)


def main():
    rip = ui_rip.Rip()
    b = Builder(rip)
    prefabs = {}
    for key, path in PREFABS.items():
        root = container(rip, path)
        b.cur_key = key
        prefabs[key] = b.node(root, (.5, .5), True)[0]
        print(key, 'ok', file=sys.stderr)
    for key, n in list(prefabs.items()):
        if n.get('img') or n.get('txt'):  # drawRoot chi ve cac con cua goc: boc nut goc vao mot khung toan man
            prefabs[key] = {'n': key, 'a': [0, 0, 1, 1], 'pv': [.5, .5], 'p': [0, 0], 'sz': [0, 0], 'k': [n]}
    for n in prefabs['countdown']['k']:
        if n['n'] in ('UIFX_CountDown_02', 'UIFX_CountDown_03', 'UIFX_CountDown_go'):
            n['off'] = 1
    for dst, src, mounts in COMPOSE:
        root = json.loads(json.dumps(prefabs[src]))
        for path, key in mounts:
            host = find(root, path)
            host.setdefault('k', []).append(json.loads(json.dumps(prefabs[key])))
        prefabs[dst] = root
    sheet, frames = b.pack()
    os.makedirs(OUT_FONTS, exist_ok=True)
    sheet.save(os.path.join(OUT_DIR, 'ui0.png'), optimize=True)
    fonts = {}
    for cab, o in rip.objects(FONT_BUNDLES, ('Font',)):
        t = rip.tree(cab, o)
        nm = t['m_Name']
        if nm in ('CafetaBold', 'UTM CAFETA', 'FontNumber'):
            fn = nm.replace(' ', '_') + '.ttf'
            open(os.path.join(OUT_FONTS, fn), 'wb').write(bytes(bytearray(t['m_FontData'])))
            fonts[nm] = 'art/ugui/fonts/' + fn
    data = {'ref': REF, 'match': 1, 'sheet': 'art/ugui/ui0.png', 'frames': frames, 'fonts': fonts,
            'fallback': [FONT_BOLD], 'fontLH': {k: 1.0 for k in fonts}, 'terms': b.terms, 'prefabs': prefabs}
    js = '// Sinh boi tools/build_ui.py tu prefab NGUI goc. Khong sua tay.\nwindow.TD = window.TD || {};\nTD.UGUI = ' + \
         json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('sheet', sheet.size, 'frames', len(frames), 'fonts', list(fonts), 'js bytes', len(js.encode('utf-8')))
    print('missing sprites', dict(b.missing_sprites))
    print('stats', dict(b.stats), 'skipped', dict(b.skipped))
    print('ambiguous loc', len(b.loc.ambiguous))


if __name__ == '__main__':
    main()
