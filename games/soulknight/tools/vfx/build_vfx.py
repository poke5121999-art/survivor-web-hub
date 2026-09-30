# -*- coding: utf-8 -*-
"""Lever hiệu ứng: bóc prefab hiệu ứng thật của Soul Knight 8.6 ra data/sk-vfx.js + art/vfx/*.png.

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/vfx/build_vfx.py
Nguồn: D:\\sk86-ref (xem README.md cạnh tệp này). Không sửa gì trong D:\\sk86-ref.
"""
import collections
import glob
import hashlib
import io
import json
import math
import os
import re
import struct
import sys
import time
import zlib

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abx import AB_ROOT, Env  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_JS = os.path.join(GAME, 'data', 'sk-vfx.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx')
WORK = r'D:\sk86-ref\work\vfx'

BOSSES = sorted('boss/' + os.path.basename(p) for p in glob.glob(os.path.join(AB_ROOT, 'boss', '*.ab')))
SRC = ['bullet.ab', 'common.ab', 'weapon.ab', 'hero.ab', 'levelcommon.ab',
       'artifacts2/efx.ab', 'artifacts2/res.ab', 'artifacts2/bullet.ab', 'artifacts2/weapon.ab'] + BOSSES
EXTRA = ['sprite_atlas.ab', 'levelobjects.ab', 'artifacts2/atlas.ab']

PAGE = 1024
SPR_MAX = 256        # [ƯỚC LƯỢNG] sprite lớn hơn thì thu nhỏ (đa số là art HD phát sáng, không phải pixel art)
TEX_MAX = 128        # [ƯỚC LƯỢNG] texture hạt lớn hơn thì thu nhỏ: hạt vẽ theo đơn vị Unity nên độ phân giải gốc không cần.
MAX_PARTICLES = 200  # [ƯỚC LƯỢNG] trần mỗi hệ hạt khi xuất; runtime còn trần tổng.

# ---------------------------------------------------------------- phân loại gốc prefab
ENT = re.compile(r'^(RoleAttribute|Gun|CGWeapon|WeaponBFModAttack|WMod|RGHand|PetHand|RGEHand|EGun|TalkChar|Talk|Npc|Item|RGChest|'
                 r'RGContainer|RGBox$|RGTBox|Mount|RGMount|Button$|Image$|Text$|BossInfo|EnemyMaker|RGRoomX|AIController|PlayMaker|'
                 r'DecorateCreator|MultiHand|CollisionNormal|EnemyAI|Pet|RGWeapon|Weapon|BossCreator|RandomWalk|RoleSkinChanger|Scroll|'
                 r'Slider|Mask$|RTLRichText|Localize|GridLayout|Horizontal|Vertical|ContentSize|CanvasScaler|GraphicRaycaster|StatisticOnShow)')
BUL = re.compile(r'(Bullet0\d|^RGBullet$|BulletParabola|^RGSword|^CGProjectile|RGBulletTrigger|RGShortLaser|RGPointLaser|^BulletFire|'
                 r'RGArrow|^Bullet[A-Z]|QigongWave|RGSwordSlash|RGSwordMobile)')
EXP = re.compile(r'^(Explode(?!EffectTrigger|HammerSplit|SplitProcessor)|DelayExplode|BulletGas|AreaDamageCarrier|CircleDamageCarrier)')

# Trường MB trỏ tới prefab hiệu ứng (đo trong refs: xem README).
# [ĐO] data.unity3d TagManager.m_SortingLayers: chỉ số = trường m_SortingLayer của renderer. Trọng lực [ĐO] PhysicsManager (0,-9.81).
SORTING_LAYERS = ['Default', 'BackGround', 'Floor', 'Shadow', 'Wall', 'Character', 'WallFont', 'WallTop', 'Door', 'Effect', 'UI']
SKIP_SHADER = re.compile(r'HitDistortion|^Sprites/Distortion|CircularDistort|DistortSpin|TwistShader|WaveEffectShader|CameraFreeze|'
                         r'MirrorGround|RectMask|Teaching')
# Shader Particles cổ có _TintColor và nhân 2 × _TintColor (Additive, Alpha Blended, Anim Alpha Blended; bản Premultiply,
# Multiply, Additive (Soft) không có _TintColor) — theo mã nguồn builtin shaders của Unity.
LEGACY_PARTICLE = re.compile(r'^(Legacy Shaders/)?Particles/(Additive|Alpha Blended|Anim Alpha Blended)$')
# Shader sprite nhân _Color của vật liệu ('' = shader dựng sẵn không có trong bundle, vật liệu Sprites-Default)
SPRITE_COLOR_SHADERS = ('', 'Sprites/Default')
FX_FIELD = re.compile(r'(hit|fx|effect|explode|creation|smoke|buff|particle|prefab|boom|muzzle|fire|flash|trail|spark|dead|death|'
                      r'broken|shock|thunder|vfx|efx|show|aura|light)', re.I)


# Mục "u" nào làm hình khác Unity (phần còn lại là logic chơi: sát thương, va chạm, âm thanh — runtime hình không cần).
VIS_MB = re.compile(r'Sprite|Tween|Texture|Material|HSV|Vfx|Rotat|Line|Laser|Trail|Chain|Thunder|Lightning|Follow|Flip|Fade|'
                    r'Alpha|Color|Scale|Shake|Anim|Ring|Wave|Distort|Glow|Shadow|Outline|Particle|Afterimage|Phantom', re.I)


def visual_unsupported(u):
    if u.startswith(('ps:', 'sr:', 'shader:', 'clip:pptr')) or u == 'clip:type212':
        return True
    if u.startswith('comp:'):
        return u[5:] in ('SpriteMask', 'MeshRenderer', 'SkinnedMeshRenderer', 'TextMesh', 'Light', 'Canvas')
    if u.startswith('mb:'):
        return bool(VIS_MB.search(u[3:]))
    return False


def classify(mbs, name):
    if any(ENT.match(m) for m in mbs):
        return 'entity'
    if any(EXP.match(m) for m in mbs):
        return 'explode'
    if any(BUL.search(m) for m in mbs):
        return 'bullet'
    if any(m.startswith('Buff') for m in mbs) or name.startswith('buff'):
        return 'buff'
    return 'fx'


# ---------------------------------------------------------------- số gọn
def r4(x):
    if x is None:
        return 0
    if isinstance(x, bool):
        return int(x)
    if not isinstance(x, (int, float)) or not math.isfinite(x):
        return 0
    if x == int(x) and abs(x) < 1e9:
        return int(x)
    v = float('%.4g' % x)
    return int(v) if v == int(v) else v


def col(c):
    return [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]


def slope(x):
    # tiếp tuyến vô hạn = bậc thang (Unity "Constant"); JSON không có Infinity nên ghi null
    return None if not math.isfinite(x) else r4(x)


def curve_keys(cv):
    ks = cv.get('m_Curve', [])
    return [[r4(k['time']), r4(k['value']), slope(k['inSlope']), slope(k['outSlope'])] for k in ks]


def mmc(m, scale=1.0):
    """MinMaxCurve -> số | {a,b} | {c,m} | {c,c2,m}."""
    st = m.get('minMaxState', 0)
    if st == 0:
        return r4(m['scalar'] * scale)
    if st == 3:
        return {'a': r4(m['minScalar'] * scale), 'b': r4(m['scalar'] * scale)}
    out = {'c': curve_keys(m['maxCurve']), 'm': r4(m['scalar'] * scale)}
    if st == 2:
        out['c2'] = curve_keys(m['minCurve'])
    if not out['c']:
        return r4(m['scalar'] * scale)
    return out


def mmc_is_zero(v):
    return v == 0 or (isinstance(v, dict) and v.get('a', 1) == 0 and v.get('b', 1) == 0) or (isinstance(v, dict) and v.get('m') == 0)


def gradient(g):
    nc, na = g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2)
    cs = [[r4(g['ctime%d' % i] / 65535.0), r4(g['key%d' % i]['r']), r4(g['key%d' % i]['g']), r4(g['key%d' % i]['b'])] for i in range(nc)]
    als = [[r4(g['atime%d' % i] / 65535.0), r4(g['key%d' % i]['a'])] for i in range(na)]
    out = {'c': cs, 'a': als}
    if g.get('m_Mode', 0) == 1:
        out['fixed'] = 1
    return out


def mmg(m):
    """MinMaxGradient -> [r,g,b,a] | {g} | {a,b} | {g,g2} | {g,rnd}."""
    st = m.get('minMaxState', 0)
    if st == 0:
        return col(m['maxColor'])
    if st == 1:
        return {'g': gradient(m['maxGradient'])}
    if st == 2:
        return {'a': col(m['minColor']), 'b': col(m['maxColor'])}
    if st == 3:
        return {'g': gradient(m['maxGradient']), 'g2': gradient(m['minGradient'])}
    return {'g': gradient(m['maxGradient']), 'rnd': 1}


def quat_mat(q, s):
    x, y, z, w = q['x'], q['y'], q['z'], q['w']
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1
    x, y, z, w = x / n, y / n, z / n, w / n
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[R[i][j] * (s['x'], s['y'], s['z'])[j] for j in range(3)] for i in range(3)]


def euler_quat(e):
    """Unity euler độ (thứ tự ZXY) -> quaternion."""
    ex, ey, ez = (math.radians(e['x']) / 2, math.radians(e['y']) / 2, math.radians(e['z']) / 2)
    cx, sx, cy, sy, cz, sz = math.cos(ex), math.sin(ex), math.cos(ey), math.sin(ey), math.cos(ez), math.sin(ez)
    # q = qy * qx * qz
    return {'w': cy * cx * cz + sy * sx * sz, 'x': cy * sx * cz + sy * cx * sz,
            'y': sy * cx * cz - cy * sx * sz, 'z': cy * cx * sz - sy * sx * cz}


# ---------------------------------------------------------------- atlas
class Atlas:
    def __init__(self):
        self.items = {}     # name -> (PIL, ax, ay, s)
        self.by_hash = {}   # hash -> name
        self.spr_name = {}  # (cab,pid) -> frame name | None
        self.smooth = set()  # khung có texture lọc Bilinear/Trilinear (art HD mịn): runtime bật imageSmoothing

    def add(self, base, img, ax, ay, s=1.0, cap=None, smooth=False):
        if cap and max(img.width, img.height) * min(1.0, s) > cap:
            # ảnh HD quá lớn so với lúc hiện trên màn hình: thu về cap px, bù bằng hệ số s khi vẽ
            f = cap / max(img.width, img.height)
            img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
            ax, ay, s = ax * f, ay * f, s / f
        elif s < 0.999:
            # sprite PPU > 16 (art HD): thu về đúng độ phân giải màn hình (1 đơn vị = 16 px), khỏi chở ảnh lớn
            w2, h2 = max(1, round(img.width * s)), max(1, round(img.height * s))
            img = img.resize((w2, h2), Image.LANCZOS if s < 0.5 else Image.NEAREST)
            ax, ay, s = ax * s, ay * s, 1.0
        h = hashlib.md5(img.tobytes() + struct.pack('<4f', ax, ay, s, img.width)).hexdigest()
        if h in self.by_hash:
            return self.by_hash[h]
        name, i = base, 1
        while name in self.items:
            i += 1
            name = '%s~%d' % (base, i)
        self.items[name] = (img, ax, ay, s)
        self.by_hash[h] = name
        if smooth:
            self.smooth.add(name)
        return name

    def pack(self, out_dir):
        os.makedirs(out_dir, exist_ok=True)
        for f in glob.glob(os.path.join(out_dir, 'vfx_*.png')) + glob.glob(os.path.join(out_dir, 'vfx_*.webp')):
            os.remove(f)
        order = sorted(self.items, key=lambda n: (-self.items[n][0].height, -self.items[n][0].width, n))
        pages, frames = [], {}
        shelves = []  # per page: list [y, h, x]
        cur = None

        def new_page():
            im = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
            pages.append(im)
            shelves.append([])
            return len(pages) - 1

        cur = new_page()
        for n in order:
            img, ax, ay, s = self.items[n]
            w, h = img.width + 1, img.height + 1  # 1px khe chống lem
            placed = False
            for pi in range(len(pages)):
                sh = shelves[pi]
                for shelf in sh:
                    if h <= shelf[1] and shelf[2] + w <= PAGE:
                        x, y = shelf[2], shelf[0]
                        shelf[2] += w
                        placed = (pi, x, y)
                        break
                if placed:
                    break
                top = (sh[-1][0] + sh[-1][1]) if sh else 0
                if top + h <= PAGE and w <= PAGE:
                    sh.append([top, h, w])
                    placed = (pi, 0, top)
                    break
            if not placed:
                pi = new_page()
                shelves[pi].append([0, h, w])
                placed = (pi, 0, 0)
            pi, x, y = placed
            pages[pi].paste(img, (x, y))
            frames[n] = [pi, x, y, img.width, img.height, r4(ax), r4(ay)] + ([r4(s)] if abs(s - 1) > 1e-4 else [])
        paths, total = [], 0
        for i, im in enumerate(pages):
            bb = im.getbbox() or (0, 0, 1, 1)
            im = im.crop((0, 0, PAGE, min(PAGE, bb[3])))
            # WebP không mất dữ liệu: nhỏ hơn PNG tối ưu ~25% [ĐO trên 15 trang], canvas vẽ được như PNG
            p = os.path.join(out_dir, 'vfx_%d.webp' % i)
            im.save(p, 'WEBP', lossless=True, method=6)
            total += os.path.getsize(p)
            paths.append('art/vfx/vfx_%d.webp' % i)
        return paths, frames, total, sorted(n for n in self.smooth if n in frames)


# ---------------------------------------------------------------- bóc
class Builder:
    def __init__(self):
        t0 = time.time()
        self.E = Env(SRC + EXTRA, dep_depth=1)
        print('nạp %d bundle trong %.1fs' % (len(self.E.rels), time.time() - t0))
        self.atlas = Atlas()
        self.sa_map = None
        self.shader_cache = {}
        self.mat_cache = {}
        self.unsup = collections.Counter()   # module -> số hiệu ứng dùng
        self.modules = collections.Counter()
        self.missing_sprite = 0
        self.shaders = collections.Counter()
        self.unsup_eff = 0
        self.tex_fallback = collections.Counter()  # cách chọn texture/tint khi vật liệu thiếu -> stats.texFallback

    # ---- sprite
    def sprite_atlas_map(self):
        if self.sa_map is None:
            self.sa_map = {}
            E = self.E
            for cab, sf in E.files.items():
                for o in sf.objects.values():
                    if o.type.name != 'SpriteAtlas':
                        continue
                    t = E.tree(cab, o)
                    for k, rd in t.get('m_RenderDataMap', []):
                        a, b = k
                        if isinstance(a, dict):
                            a = tuple(a[x] for x in sorted(a))
                        self.sa_map[(tuple(a) if isinstance(a, (list, tuple)) else a, b)] = (rd, cab)
        return self.sa_map

    def sprite_frame(self, ptr, cab, cap=None):
        cap = cap or SPR_MAX
        r = self.E.resolve(ptr, cab)
        if not r or r[1].type.name != 'Sprite':
            return None
        k = (r[0], r[1].path_id, cap)
        if k in self.atlas.spr_name:
            return self.atlas.spr_name[k]
        name = None
        try:
            name = self._sprite(r[0], r[1], cap)
        except Exception as e:  # noqa: BLE001
            print('  sprite lỗi', e)
        if name is None:
            self.missing_sprite += 1
        self.atlas.spr_name[k] = name
        return name

    def _sprite(self, cab, o, cap):
        E = self.E
        t = E.tree(cab, o)
        rect, piv, rd = t['m_Rect'], t['m_Pivot'], t['m_RD']
        img = None
        smooth = self.filter_of(rd.get('texture'), cab)
        try:
            img = o.read().image
            if img is not None:
                img = img.convert('RGBA')
        except Exception:
            img = None
        if img is None or img.width == 0:
            k = t['m_RenderDataKey']
            a, b = k
            if isinstance(a, dict):
                a = tuple(a[x] for x in sorted(a))
            hit = self.sprite_atlas_map().get((tuple(a) if isinstance(a, (list, tuple)) else a, b))
            if not hit:
                return None
            ard, acab = hit
            tex = E.resolve(ard['texture'], acab)
            if not tex:
                return None
            timg = tex[1].read().image
            img = _crop(ard, timg)
            rd = ard
            smooth = self.filter_of(ard['texture'], acab)
        off = rd['textureRectOffset']
        rw, rh = rect['width'], rect['height']
        ax = piv['x'] * rw - off['x']
        ay = img.height + off['y'] - rh * piv['y']
        ppu = t.get('m_PixelsToUnits', 16.0) or 16.0
        bb = img.getbbox()
        if not bb:
            return None
        return self.atlas.add(t['m_Name'], img, ax, ay, 16.0 / ppu, cap, smooth)

    def filter_of(self, ptr, cab):
        r = self.E.resolve(ptr, cab) if ptr else None
        if not r:
            return False
        try:
            return self.E.tree(*r).get('m_TextureSettings', {}).get('m_FilterMode', 0) != 0
        except Exception:
            return False

    def texture_frame(self, ptr, cab):
        r = self.E.resolve(ptr, cab)
        if not r or r[1].type.name != 'Texture2D':
            return None
        k = (r[0], r[1].path_id)
        if k in self.atlas.spr_name:
            return self.atlas.spr_name[k]
        name = None
        try:
            tex = r[1].read()
            img = tex.image.convert('RGBA')
            if max(img.width, img.height) > TEX_MAX:
                f = TEX_MAX / max(img.width, img.height)
                img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
            name = self.atlas.add('#' + tex.m_Name, img, img.width / 2, img.height / 2, smooth=self.filter_of(ptr, cab))
        except Exception as e:  # noqa: BLE001
            print('  texture lỗi', e)
        self.atlas.spr_name[k] = name
        return name

    def white(self):
        # Vật liệu không gán _MainTex (vd Sprites-Default trên ParticleSystem): Unity dùng texture mặc định "white" của
        # shader -> hạt là ô vuông đặc màu (tia lửa trúng đích). Không phải đốm tròn mờ.
        if '#white' not in self.atlas.items:
            self.atlas.items['#white'] = (Image.new('RGBA', (4, 4), (255, 255, 255, 255)), 2, 2, 1.0)
        return '#white'

    def default_particle(self):
        if '#Default-Particle' not in self.atlas.items:
            im = Image.new('RGBA', (32, 32))
            px = im.load()
            for y in range(32):
                for x in range(32):
                    d = math.hypot(x - 15.5, y - 15.5) / 16
                    a = max(0.0, 1 - d) ** 2
                    px[x, y] = (255, 255, 255, int(a * 255))
            self.atlas.items['#Default-Particle'] = (im, 16, 16, 1.0)
            self.atlas.smooth.add('#Default-Particle')
        return '#Default-Particle'

    # ---- material
    def shader_name(self, ptr, cab):
        r = self.E.resolve(ptr, cab)
        if not r:
            return ''
        k = (r[0], r[1].path_id)
        if k not in self.shader_cache:
            nm = ''
            try:
                t = self.E.tree(*r)
                nm = (t.get('m_ParsedForm') or {}).get('m_Name') or t.get('m_Name', '')
            except Exception:
                pass
            self.shader_cache[k] = nm
        return self.shader_cache[k]

    def shader_blend(self, ptr, cab, floats, name=''):
        """Blend thật của pass đầu (m_ParsedForm ... m_State.rtBlend0) -> 'add'|'alpha'|'mul'|'screen'|None.

        Giá trị có thể là tên thuộc tính (vd _SrcBlend) -> lấy float của vật liệu. Enum UnityEngine.Rendering.BlendMode:
        0 Zero, 1 One, 2 DstColor, 3 SrcColor, 4 OneMinusDstColor, 5 SrcAlpha, 10 OneMinusSrcAlpha.
        None = shader không có trong bundle (dựng sẵn) hoặc không đọc được -> đoán theo tên như cũ.
        """
        r = self.E.resolve(ptr, cab)
        if not r:
            return None
        try:
            ss = (self.E.tree(*r).get('m_ParsedForm') or {}).get('m_SubShaders') or []
            # pass thường đầu tiên (m_Type 0); GrabPass (2) đứng trước trong Particles/Standard Unlit, mang One Zero mặc định
            st = next(ps for ps in ss[0]['m_Passes'] if ps.get('m_Type', 0) == 0)['m_State']['rtBlend0']
        except Exception:
            return None

        def val(x):
            nm = x.get('name', '<noninit>')
            return int(floats.get(nm, x.get('val', 0))) if nm != '<noninit>' else int(x.get('val', 0))
        src, dst = val(st['srcBlend']), val(st['destBlend'])
        if dst == 1:
            return 'screen' if src == 4 else 'add'
        if src == 1 and dst == 6:
            return 'screen'   # One OneMinusSrcColor (Particles/Additive (Soft))
        if src == 1 and dst == 10 and 'add' in name.lower():
            return 'add'      # premultiplied, shader "Add_*" (Hovl) ra alpha ~0 -> cộng [ƯỚC LƯỢNG theo tên]
        if (src == 2 and dst in (0, 3)) or (src == 0 and dst == 3):
            return 'mul'
        return 'alpha'

    def material(self, ptr, cab):
        """-> {'tex': frame|None, 'blend': 'add'|'alpha'|'mul', 'tint': [r,g,b,a], 'shader': name}"""
        r = self.E.resolve(ptr, cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k in self.mat_cache:
            return self.mat_cache[k]
        t = self.E.tree(*r)
        sh = self.shader_name(t.get('m_Shader'), r[0])
        props = t.get('m_SavedProperties', {})
        texs = dict((a, b) for a, b in props.get('m_TexEnvs', []))
        floats = dict((a, b) for a, b in props.get('m_Floats', []))
        cols = dict((a, b) for a, b in props.get('m_Colors', []))
        tex = None
        mt = texs.get('_MainTex')
        if mt and mt['m_Texture'].get('m_PathID'):
            tex = self.texture_frame(mt['m_Texture'], r[0])
            if tex is None:
                # texture nằm trong tài nguyên dựng sẵn của Unity (không có trong bundle): Default-Particle / -ParticleSystem
                tex = self.default_particle()
                self.tex_fallback['builtin:' + t.get('m_Name', '')] += 1
        else:
            tex = self.white()
            self.tex_fallback['white:' + t.get('m_Name', '')] += 1
        low = sh.lower()
        blend = 'alpha'
        sb = self.shader_blend(t.get('m_Shader'), r[0], floats, sh)
        if SKIP_SHADER.search(sh):
            blend = 'skip'   # khúc xạ/biến dạng màn hình: canvas không làm được, bỏ hẳn nút
        elif sb:
            # [ĐO] trạng thái Blend của shader trong bundle (vd Unlit/RGSEffectLight = One One: cộng, dù tên không có
            # "add" và _DstBlend cũ của vật liệu = 0)
            blend = sb
        elif 'add' in low or floats.get('_DstBlend') == 1:
            blend = 'add'
        elif 'multiply' in low:
            blend = 'mul'
        self.tex_fallback['blend:%s:%s' % ('shader' if sb else 'guess', blend)] += 1
        self.shaders[sh or '(builtin)'] += 1
        tint = [1, 1, 1, 1]
        if LEGACY_PARTICLE.match(sh):
            # shader Particles cổ: màu = 2 × _TintColor × màu đỉnh × texture, rồi mới kẹp [0,1] (kể cả alpha). Không
            # kẹp ở đây: _TintColor (1,1,1,1) = ×2, glow nổ/đạn sáng gấp đôi. Mặc định 0.5 = ×1. Vật liệu giữ cả thuộc
            # tính cũ của shader trước nên chỉ đọc _TintColor với shader thật sự dùng nó.
            c = cols.get('_TintColor', {'r': 0.5, 'g': 0.5, 'b': 0.5, 'a': 0.5})
            tint = [2 * c['r'], 2 * c['g'], 2 * c['b'], 2 * c['a']]
            self.tex_fallback['tint2x:' + sh] += 1
        elif '_Color' in cols and not low.startswith('mobile/particles'):
            c = cols['_Color']
            tint = [c['r'], c['g'], c['b'], c['a']]
        out = {'tex': tex, 'blend': blend, 'tint': [r4(x) for x in tint], 'shader': sh, 'name': t.get('m_Name', ''),
               'srTint': bool(LEGACY_PARTICLE.match(sh)) or sh in SPRITE_COLOR_SHADERS}
        self.mat_cache[k] = out
        return out

    # ---- clip
    def clip(self, cab, o, pathmap, used):
        """AnimationClip -> {len, loop, curves:[{n,k,s}]} ; pathmap: crc(path) -> node index."""
        E = self.E
        t = E.tree(cab, o)
        mc = t['m_MuscleClip']
        data = mc['m_Clip']['data']
        sc, dense, const = data['m_StreamedClip'], data['m_DenseClip'], data['m_ConstantClip']
        binds = t['m_ClipBindingConstant']['genericBindings']
        mapping = t['m_ClipBindingConstant']['pptrCurveMapping']
        # Chỉ số đường cong = cộng dồn theo đúng thứ tự genericBindings (Transform chiếm 3/4/3/3, PPtr chiếm 1, nằm xen
        # giữa). [ĐO explode_big: PPtr ở chỉ số 8 trong dữ liệu streamed dù curveCount=8.] Hằng số là các ô CUỐI,
        # dense là các ô ngay trước chúng; còn lại nằm trong streamed với đúng chỉ số cộng dồn.
        slots, pslots = [], []
        idx = 0
        for b in binds:
            if b['isPPtrCurve']:
                pslots.append((b, idx))
                idx += 1
                continue
            n = 1
            if b['typeID'] == 4:
                n = {1: 3, 2: 4, 3: 3, 4: 3}.get(b['attribute'], 1)
            slots.append((b, idx, n))
            idx += n
        total = idx
        keys = collections.defaultdict(list)
        raw = struct.pack('<%dI' % len(sc['data']), *sc['data']) if sc['data'] else b''
        i = 0
        while i + 8 <= len(raw):
            tm, n = struct.unpack_from('<fI', raw, i)
            i += 8
            for _ in range(n):
                ci, = struct.unpack_from('<I', raw, i)
                c = struct.unpack_from('<4f', raw, i + 4)
                i += 20
                keys[ci].append((tm, c))
        nd = dense['m_CurveCount']
        cvals = const['data']
        base_const = total - len(cvals)
        base_dense = base_const - nd
        if nd:
            arr = dense['m_SampleArray']
            fc = dense['m_FrameCount']
            rate = dense['m_SampleRate'] or 30
            t0 = dense['m_BeginTime']
            for j in range(nd):
                ci = base_dense + j
                vals = [arr[f * nd + j] for f in range(fc)]
                for f in range(fc):
                    v = vals[f]
                    nxt = vals[f + 1] if f + 1 < fc else v
                    keys[ci].append((t0 + f / rate, (0.0, 0.0, (nxt - v) * rate if f + 1 < fc else 0.0, v)))
        for j, v in enumerate(cvals):
            keys[base_const + j].append((0.0, (0.0, 0.0, 0.0, v)))

        def seg(ci):
            out = []
            for tm, c in sorted(keys.get(ci, []), key=lambda x: x[0]):
                if tm > 1e30:
                    continue
                tm = 0.0 if tm < -1e30 else tm
                row = [r4(tm), r4(c[0]), r4(c[1]), r4(c[2]), r4(c[3])]
                if out and abs(out[-1][0] - row[0]) < 1e-6:
                    out[-1] = row
                else:
                    out.append(row)
            # gọn: đoạn hằng -> [t, v]
            return [[x[0], x[4]] if x[1] == 0 and x[2] == 0 and x[3] == 0 else x for x in out]

        curves = []
        COLOR = {2526845255: 'cr', 4215373228: 'cg', 2334886179: 'cb', 304273561: 'ca'}
        for b, ci, n in slots:
            node = pathmap.get(b['path'])
            if node is None:
                continue
            ty, at = b['typeID'], b['attribute']
            props = None
            if ty == 4:
                props = {1: ['px', 'py', 'pz'], 2: ['qx', 'qy', 'qz', 'qw'], 3: ['sx', 'sy', 'sz'], 4: ['ex', 'ey', 'ez']}.get(at)
            elif ty == 1 and at == 2086281974:
                props = ['on']
            elif ty in (212, 198, 96, 199, 120) and at == 3305885265:
                props = ['en']
            elif ty == 212 and at in COLOR:
                props = [COLOR[at]]
            if not props:
                used.add('clip:type%d' % ty)
                continue
            for j, k in enumerate(props):
                s = seg(ci + j)
                if s:
                    curves.append({'n': node, 'k': k, 's': s})
        for b, ci in pslots:
            node = pathmap.get(b['path'])
            if node is None:
                continue
            if b['typeID'] == 212 and b['attribute'] == 0:
                s = []
                for tm, c in sorted(keys.get(ci, []), key=lambda x: x[0]):
                    if tm > 1e30:
                        continue
                    k = int(round(c[3]))
                    fr = self.sprite_frame(mapping[k], cab) if 0 <= k < len(mapping) else None
                    tm = 0.0 if tm < -1e30 else tm
                    if s and abs(s[-1][0] - tm) < 1e-6:
                        s[-1] = [r4(tm), fr]
                    else:
                        s.append([r4(tm), fr])
                if s:
                    curves.append({'n': node, 'k': 'spr', 's': s})
            else:
                used.add('clip:pptr%d' % b['typeID'])
        return {'name': t['m_Name'], 'len': r4(mc['m_StopTime'] - mc['m_StartTime']),
                'loop': 1 if mc.get('m_LoopTime') else 0, 'curves': curves}

    def controller_info(self, cab, o):
        """Animator controller -> (clips [(cab, clip_obj, speed, stateName)], seq [chỉ số], states {tên: chỉ số}).

        seq = chuỗi trạng thái mặc định lớp 0 (tối đa 4, chỉ chuyển theo exit time không điều kiện).
        Trạng thái mặc định rỗng (script gọi Play/SetTrigger, vd explode_s -> explode_small) thì seq rỗng.
        """
        E = self.E
        t = E.tree(cab, o)
        if o.type.name == 'AnimatorOverrideController':
            base = E.resolve(t['m_Controller'], cab)
            if not base:
                return [], [], {}
            over = {}
            for p in t.get('m_Clips', []):
                a = E.resolve(p['m_OriginalClip'], cab)
                b = E.resolve(p['m_OverrideClip'], cab)
                if a and b:
                    over[(a[0], a[1].path_id)] = b
            clips, seq, st = self.controller_info(*base)
            return [over.get((c[0], c[1].path_id), (c[0], c[1])) + (c[2], c[3]) for c in clips], seq, st
        tos = dict(t.get('m_TOS', []))
        aclips = t['m_AnimationClips']
        sms = t['m_Controller']['m_StateMachineArray']
        if not sms:
            return [], [], {}
        sm = sms[0]['data']
        states = sm['m_StateConstantArray']
        clips, key_idx, st_clip, names = [], {}, {}, {}
        for si, sw in enumerate(states):
            s = sw['data']
            clip = None
            for b in s['m_BlendTreeConstantArray']:
                for nd in b['data']['m_NodeArray']:
                    ci = nd['data']['m_ClipID']
                    if 0 <= ci < len(aclips):
                        clip = E.resolve(aclips[ci], cab)
                    break
                break
            if not clip:
                continue
            nm = tos.get(s.get('m_NameID'), str(s.get('m_NameID')))
            k = (clip[0], clip[1].path_id, round(s.get('m_Speed', 1.0), 4))
            if k not in key_idx:
                key_idx[k] = len(clips)
                clips.append((clip[0], clip[1], s.get('m_Speed', 1.0), nm))
            st_clip[si] = key_idx[k]
            names[nm] = key_idx[k]
        cur = sm.get('m_DefaultState', 0)
        seq, seen = [], set()
        while cur is not None and 0 <= cur < len(states) and cur not in seen and len(seq) < 4:
            seen.add(cur)
            if cur not in st_clip:
                break
            seq.append(st_clip[cur])
            nxt = None
            for tr in states[cur]['data'].get('m_TransitionConstantArray', []):
                td = tr['data']
                if not td.get('m_ConditionConstantArray') and td.get('m_HasExitTime', True):
                    d = td.get('m_DestinationState')
                    if isinstance(d, int) and d < 30000:
                        nxt = d
                    break
            cur = nxt
        return clips, seq, names

    # ---- một prefab
    def export(self, cab, go, cat, trail_only=False):
        E = self.E
        used = set()
        nodes, idx_of, pathmap_of = [], {}, {}
        order = []

        def visit(c, g, parent, path):
            gt = E.tree(c, g)
            i = len(order)
            order.append((c, g, parent, path, gt))
            idx_of[(c, g.path_id)] = i
            for ch in E.children(c, g):
                visit(ch[0], ch[1], i, (path + '/' if path else '') + E.tree(*ch)['m_Name'])
        visit(cab, go, -1, '')

        keep = [True] * len(order)
        if trail_only:
            keep = [False] * len(order)
            for i, (c, g, parent, path, gt) in enumerate(order):
                tns = {tn for tn, _, _ in E.components(c, g)}
                if tns & {'ParticleSystem', 'TrailRenderer', 'LineRenderer'}:
                    j = i
                    while j >= 0 and not keep[j]:
                        keep[j] = True
                        j = order[j][2]
            if not any(keep):
                return None

        remap = {}
        for i, (c, g, parent, path, gt) in enumerate(order):
            if not keep[i]:
                continue
            remap[i] = len(nodes)
            tr = E.tree(*E.transform(c, g))
            lp, lq, ls = tr['m_LocalPosition'], tr['m_LocalRotation'], tr['m_LocalScale']
            nd = {'n': gt['m_Name'], 'p': remap.get(parent, -1)}
            # T = [px py pz qx qy qz qw sx sy sz] (Unity, y lên); vắng = đơn vị
            T = [r4(lp['x']), r4(lp['y']), r4(lp['z']), r4(lq['x']), r4(lq['y']), r4(lq['z']), r4(lq['w']),
                 r4(ls['x']), r4(ls['y']), r4(ls['z'])]
            if T != [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]:
                nd['T'] = T
            if not gt.get('m_IsActive', 1):
                # GameObject tắt sẵn thì Unity không vẽ. Đạn bật nhánh con theo skin/nguyên tố bằng script: game tự bật
                # (h.nodes[i].on = true); bật hết thì warliege_roll vẽ cả nhánh tuyết lẫn lửa/sét cùng lúc.
                nd['off'] = 1
            for tn, cc, co in E.components(c, g):
                ct = E.tree(cc, co)
                if tn == 'SpriteRenderer' and not trail_only:
                    f = self.sprite_frame(ct.get('m_Sprite'), cc)
                    mat = self.material(ct['m_Materials'][0], cc) if ct.get('m_Materials') else None
                    sr = {'f': f, 'L': ct.get('m_SortingLayer', 0)}
                    if ct.get('m_SortingOrder', 0):
                        sr['o'] = ct['m_SortingOrder']
                    c4 = col(ct['m_Color'])
                    if c4 != [1, 1, 1, 1]:
                        sr['c'] = c4
                    if ct.get('m_FlipX'):
                        sr['fx'] = 1
                    if ct.get('m_FlipY'):
                        sr['fy'] = 1
                    if mat and mat['blend'] == 'skip':
                        used.add('shader:' + mat['shader'])
                        continue
                    if mat and mat['blend'] != 'alpha':
                        sr['b'] = mat['blend']
                    if mat and mat['tint'] != [1, 1, 1, 1]:
                        if mat['srTint']:
                            sr['tint'] = mat['tint']
                        else:
                            used.add('sr:matColor')  # shader riêng có _Color: không rõ shader dùng thế nào, không nhuộm
                    if not ct.get('m_Enabled', 1):
                        sr['off'] = 1
                    if ct.get('m_DrawMode', 0):
                        used.add('sr:drawMode')
                    if ct.get('m_MaskInteraction', 0):
                        used.add('sr:mask')
                    nd['sr'] = sr
                elif tn == 'ParticleSystem':
                    psr = None
                    for tn2, cc2, co2 in E.components(c, g):
                        if tn2 == 'ParticleSystemRenderer':
                            psr = (cc2, E.tree(cc2, co2))
                    ps = self.particle(cc, ct, psr, used)
                    if ps:
                        nd['ps'] = ps
                elif tn == 'TrailRenderer':
                    nd['tr'] = self.trail(cc, ct, used)
                elif tn == 'LineRenderer':
                    nd['ln'] = self.line(cc, ct, used)
                elif tn == 'MonoBehaviour':
                    cls = E.script_name(cc, ct)
                    if cls == 'SpriteAnimation' and not trail_only:
                        fr = [self.sprite_frame(p, cc) for p in ct.get('sprites', [])]
                        nd['sa'] = {'f': fr, 'fps': r4(ct.get('frameRate', 10) * ct.get('timeScale', 1)), 'mode': ct.get('mode', 0)}
                        if ct.get('hideSpriteWhenFinished'):
                            nd['sa']['hide'] = 1
                        if ct.get('randomStartIdx'):
                            nd['sa']['rnd'] = 1
                        if ct.get('frameIdxOffset'):
                            nd['sa']['off'] = ct['frameIdxOffset']
                    elif cls == 'BuffIce' and i == 0 and not trail_only:
                        # [ĐO sk_method.py BuffIce.BuffEnd] hết buff: tách khỏi quái, sprite = ice_end, lớp "Character",
                        # Invoke("Disappear", 2.0) -> SetTrigger("trigger") -> trạng thái disappear
                        fr = self.sprite_frame(ct.get('ice_end'), cc)
                        eff_end = {'after': 2, 'state': 'disappear', 'L': SORTING_LAYERS.index('Character')}
                        if fr:
                            eff_end['spr'] = fr
                        nd['_end'] = eff_end
                        used.add('mb:BuffIce')
                    elif cls == 'RGAutoDestory':
                        if i == 0:
                            nd['life'] = r4(ct.get('d_time', 0))
                        else:
                            nd['die'] = r4(ct.get('d_time', 0))
                    elif cls == 'ObjectRotate' and ct.get('rotateAxis', 2) == 2:
                        # [ĐO] ObjectRotate.rotateSpeed độ/giây quanh Z; clockWise đổi chiều
                        nd['spin'] = r4(ct.get('rotateSpeed', 0) * (-1 if ct.get('clockWise') else 1))
                    elif cls == 'AutoRotate' and not ct.get('interval') and abs(ct.get('RotateAngle', {}).get('z', 0)) > 0:
                        nd['spin'] = r4(ct['RotateAngle']['z'])
                    elif cls in ('ObjectRotate', 'AutoRotate', 'RotateAroundAxisBehaviour'):
                        used.add('mb:%s(trục X/Y)' % cls)
                    elif cls in ('AnimAudioPlayer', 'RGNetBehaviour', 'IgnoreNetBehaviour', 'ObjectZPos', 'CameraShakeBehaviour',
                                 'TrailSortingLayer', 'FixAngle', 'RotationLock', 'hold_sprite_rotation', 'ColdDownAudioPlayer'):
                        pass
                    elif cls and not trail_only:
                        used.add('mb:' + cls)
                elif tn == 'Animator' and not trail_only:
                    rc = E.resolve(ct.get('m_Controller'), cc)
                    if rc:
                        # đường dẫn tính từ nút mang Animator
                        pm = {}
                        base = path
                        for j2, (_, _, _, p2, _) in enumerate(order):
                            if j2 in remap or keep[j2]:
                                if p2 == base or p2.startswith(base + '/') or base == '':
                                    rel = p2[len(base):].lstrip('/') if base else p2
                                    pm[zlib.crc32(rel.encode())] = j2
                        nd['_anim'] = (rc, pm)
                elif tn in ('MeshRenderer', 'SpriteMask', 'Light', 'AudioSource', 'TextMesh', 'SkinnedMeshRenderer', 'Canvas'):
                    if not trail_only:
                        used.add('comp:' + tn)
            nodes.append(nd)
        # hoạt ảnh: giải sau khi đủ nút (pathmap chỉ tới nút đã remap)
        anims = []
        for ni, nd in enumerate(nodes):
            a = nd.pop('_anim', None)
            if not a:
                continue
            rc, pm = a
            pm2 = {k: remap[v] for k, v in pm.items() if v in remap}
            try:
                clips, seq, names = self.controller_info(*rc)
            except Exception as e:  # noqa: BLE001
                print('  controller lỗi', e)
                clips, seq, names = [], [], {}
            if len(clips) > 12:  # controller chung khổng lồ (nhân vật...): chỉ giữ chuỗi mặc định
                keep_i = sorted(set(seq)) or [0]
                clips = [clips[i] for i in keep_i]
                seq = [keep_i.index(i) for i in seq]
                names = {k: keep_i.index(v) for k, v in names.items() if v in keep_i}
            out = []
            for ccab, cobj, spd, nm in clips:
                cl = self.clip(ccab, cobj, pm2, used)
                cl['spd'] = r4(spd)
                out.append(cl)
            if out and any(c['curves'] for c in out):
                a2 = {'n': ni, 'clips': out, 'seq': seq}
                if len(names) > 1 or not seq:
                    a2['st'] = names
                anims.append(a2)
        eff = {'cat': cat, 'nodes': nodes}
        end = nodes[0].pop('_end', None) if nodes else None
        if end:
            eff['end'] = end
        if anims:
            eff['anims'] = anims
        vis = any(('sr' in n and n['sr'].get('f')) or 'sa' in n or 'ps' in n or 'tr' in n or 'ln' in n for n in nodes) or \
            any(c['k'] == 'spr' for a in anims for s in a['clips'] for c in s['curves'])
        if not vis:
            return None
        dur, loop = self.duration(eff)
        eff['dur'] = r4(dur)
        if loop:
            eff['loop'] = 1
        if used:
            eff['u'] = sorted(used)
        for u in used:
            self.unsup[u] += 1
        if any(visual_unsupported(u) for u in used):
            self.unsup_eff += 1
        return eff

    def duration(self, eff):
        life = eff['nodes'][0].get('life')
        dur, loop = 0.0, False
        for n in eff['nodes']:
            if n.get('off'):
                continue
            if 'sa' in n:
                ln = len(n['sa']['f']) / (n['sa']['fps'] or 10)
                if n['sa']['mode'] == 1:
                    dur = max(dur, ln)
                else:
                    loop = True
            if 'ps' in n:
                p = n['ps']
                if p.get('loop'):
                    loop = True
                else:
                    lt = p['life']
                    lmax = lt if isinstance(lt, (int, float)) else (max(lt.get('a', 0), lt.get('b', 0)) if 'a' in lt else lt.get('m', 1))
                    dmax = p.get('delay', 0)
                    dmax = dmax if isinstance(dmax, (int, float)) else dmax.get('b', 0) if isinstance(dmax, dict) else 0
                    dur = max(dur, dmax + p['dur'] + lmax)
            if 'tr' in n:
                loop = True
        for a in eff.get('anims', []):
            tot = 0.0
            for s in [a['clips'][i] for i in (a['seq'] or [0])]:
                if s['loop']:
                    loop = True
                    break
                tot += s['len'] / (s['spd'] or 1)
            dur = max(dur, tot)
        if life and life > 0:  # d_time -1 = không tự huỷ
            return life, False
        if dur <= 0:
            dur = 1.0 if loop else 0.5
        return dur, loop

    # ---- ParticleSystem
    def particle(self, cab, t, psr, used):
        im = t['InitialModule']
        rend = psr[1] if psr else {}
        mode = rend.get('m_RenderMode', 0)
        if mode == 5:
            if t['SubModule'].get('enabled'):
                used.add('ps:subEmitters')
            return None
        if not rend.get('m_Enabled', 1):
            return None
        if mode == 4:
            # hạt dạng Mesh (vòng sóng xung kích...): cỡ theo đơn vị mesh (185-250), vẽ thành billboard sẽ phủ kín màn
            used.add('ps:render:mesh')
            return None
        mods = []
        ps = {
            'dur': r4(t['lengthInSec']), 'loop': 1 if t['looping'] else 0,
            'life': mmc(im['startLifetime']), 'speed': mmc(im['startSpeed']),
            'size': mmc(im['startSize']), 'color': mmg(im['startColor']),
            'max': min(MAX_PARTICLES, im.get('maxNumParticles', 1000)),
        }
        if t.get('prewarm'):
            ps['prewarm'] = 1
        d = mmc(t['startDelay'])
        if not mmc_is_zero(d):
            ps['delay'] = d
        if t.get('simulationSpeed', 1) != 1:
            ps['simSpeed'] = r4(t['simulationSpeed'])
        if t.get('moveWithTransform', 0) == 1:
            ps['world'] = 1
        if t.get('scalingMode', 0):
            ps['scl'] = t['scalingMode']  # 1 Local, 2 Shape (vắng = 0 Hierarchy)
        if im.get('size3D'):
            ps['sizeY'] = mmc(im['startSizeY'])
        rot = mmc(im['startRotation'])
        if not mmc_is_zero(rot):
            ps['rot'] = rot
        if im.get('randomizeRotationDirection'):
            ps['flipRot'] = r4(im['randomizeRotationDirection'])
        g = mmc(im['gravityModifier'])
        if not mmc_is_zero(g):
            ps['grav'] = g
        if im.get('rotation3D'):
            used.add('ps:rotation3D')
        em = t['EmissionModule']
        if em.get('enabled'):
            rate = mmc(em['rateOverTime'])
            if not mmc_is_zero(rate):
                ps['rate'] = rate
            if not mmc_is_zero(mmc(em['rateOverDistance'])):
                ps['rateDist'] = mmc(em['rateOverDistance'])
            bs = []
            for b in em.get('m_Bursts', [])[:em.get('m_BurstCount', 0)]:
                bs.append([r4(b['time']), mmc(b['countCurve']), b.get('cycleCount', 1), r4(b.get('repeatInterval', 0.01)), r4(b.get('probability', 1))])
            if bs:
                ps['bursts'] = bs
        sh = t['ShapeModule']
        if sh.get('enabled'):
            s = {'t': sh['type'], 'r': r4(sh['radius']['value'])}
            if sh['type'] in (4, 7, 8, 9):
                s['ang'] = r4(sh.get('angle', 25))
            if sh['type'] in (8, 9):
                s['len'] = r4(sh.get('length', 5))
            if sh['arc']['value'] != 360:
                s['arc'] = r4(sh['arc']['value'])
            if sh['radius'].get('mode', 0) or sh['arc'].get('mode', 0):
                s['arcMode'] = sh['arc'].get('mode', 0)
                s['arcSpread'] = r4(sh['arc'].get('spread', 0))
                mods.append('shape:arcMode')
            rt = sh.get('radiusThickness', 1)
            if rt != 1:
                s['thick'] = r4(rt)
            bt = sh.get('boxThickness', {})
            p, ro, sc = sh.get('m_Position', {}), sh.get('m_Rotation', {}), sh.get('m_Scale', {})
            if any(p.get(k, 0) for k in 'xyz'):
                s['pos'] = [r4(p['x']), r4(p['y']), r4(p['z'])]
            if any(ro.get(k, 0) for k in 'xyz') or any(sc.get(k, 1) != 1 for k in 'xyz'):
                M = quat_mat(euler_quat(ro), sc)
                s['m'] = [r4(M[i][j]) for i in range(3) for j in range(3)]
            if sh.get('randomDirectionAmount'):
                s['rndDir'] = r4(sh['randomDirectionAmount'])
            if sh.get('sphericalDirectionAmount'):
                s['sphDir'] = r4(sh['sphericalDirectionAmount'])
            if sh.get('randomPositionAmount'):
                s['rndPos'] = r4(sh['randomPositionAmount'])
            if sh.get('alignToDirection'):
                s['align'] = 1
            if sh['type'] in (6, 13, 14, 19, 20):
                mods.append('shape:mesh/sprite')
            if sh['type'] == 17:
                s['donut'] = r4(sh.get('donutRadius', 0.2))
            ps['shape'] = s
        vm = t['VelocityModule']
        if vm.get('enabled'):
            v = {'x': mmc(vm['x']), 'y': mmc(vm['y']), 'z': mmc(vm['z'])}
            if vm.get('inWorldSpace'):
                v['world'] = 1
            rad = mmc(vm['radial'])
            if not mmc_is_zero(rad):
                v['radial'] = rad
            sm = mmc(vm['speedModifier'])
            if sm != 1:
                v['mul'] = sm
            if any(not mmc_is_zero(mmc(vm[k])) for k in ('orbitalX', 'orbitalY', 'orbitalZ')):
                v['orbZ'] = mmc(vm['orbitalZ'])
                if any(not mmc_is_zero(mmc(vm[k])) for k in ('orbitalX', 'orbitalY')):
                    mods.append('velocity:orbitalXY')
            ps['vel'] = v
        cm = t['ClampVelocityModule']
        if cm.get('enabled'):
            ps['limit'] = {'mag': mmc(cm['magnitude']), 'damp': r4(cm.get('dampen', 0))}
            if cm.get('separateAxis'):
                ps['limit'] = {'x': mmc(cm['x']), 'y': mmc(cm['y']), 'damp': r4(cm.get('dampen', 0))}
            dr = mmc(cm.get('drag', {'minMaxState': 0, 'scalar': 0}))
            if not mmc_is_zero(dr):
                ps['limit']['drag'] = dr
        fm = t['ForceModule']
        if fm.get('enabled'):
            ps['force'] = {'x': mmc(fm['x']), 'y': mmc(fm['y']), 'z': mmc(fm['z'])}
            if fm.get('inWorldSpace'):
                ps['force']['world'] = 1
            if fm.get('randomizePerFrame'):
                mods.append('force:randomizePerFrame')
        co = t['ColorModule']
        if co.get('enabled'):
            ps['col'] = mmg(co['gradient'])
        sz = t['SizeModule']
        if sz.get('enabled'):
            ps['sol'] = mmc(sz['curve'])
            if sz.get('separateAxes'):
                ps['solY'] = mmc(sz['y'])
        ro = t['RotationModule']
        if ro.get('enabled'):
            ps['rol'] = mmc(ro['curve'])
            if ro.get('separateAxes'):
                mods.append('rotation:separateAxes')
        uv = t['UVModule']
        if uv.get('enabled'):
            u = {'mode': uv.get('mode', 0), 'tx': uv.get('tilesX', 1), 'ty': uv.get('tilesY', 1), 'fot': mmc(uv['frameOverTime']),
                 'sf': mmc(uv['startFrame']), 'cyc': r4(uv.get('cycles', 1)), 'anim': uv.get('animationType', 0),
                 'row': uv.get('rowIndex', 0), 'rowMode': uv.get('rowMode', 1), 'time': uv.get('timeMode', 0), 'fps': r4(uv.get('fps', 30))}
            for k, dv in (('mode', 0), ('sf', 0), ('cyc', 1), ('anim', 0), ('row', 0), ('rowMode', 1), ('time', 0), ('fps', 30)):
                if u[k] == dv:
                    del u[k]
            if uv.get('mode', 0) == 1:
                u['spr'] = [self.sprite_frame(s['sprite'], cab, TEX_MAX) for s in uv.get('sprites', []) if s['sprite'].get('m_PathID')]
            ps['uv'] = u
        for nm, key in (('noise', 'NoiseModule'), ('trails', 'TrailModule'), ('subEmitters', 'SubModule'), ('collision', 'CollisionModule'),
                        ('lights', 'LightsModule'), ('externalForces', 'ExternalForcesModule'), ('inheritVelocity', 'InheritVelocityModule'),
                        ('sizeBySpeed', 'SizeBySpeedModule'), ('rotationBySpeed', 'RotationBySpeedModule'), ('colorBySpeed', 'ColorBySpeedModule'),
                        ('customData', 'CustomDataModule'), ('trigger', 'TriggerModule'), ('lifetimeByEmitterSpeed', 'LifetimeByEmitterSpeedModule')):
            if t.get(key, {}).get('enabled'):
                mods.append(nm)
        # renderer
        mat = None
        if rend.get('m_Materials'):
            mat = self.material(rend['m_Materials'][0], psr[0])
        if mat and mat['blend'] == 'skip':
            used.add('shader:' + mat['shader'])
            return None
        if not mat:
            # con trỏ vật liệu tới tài nguyên dựng sẵn (không có trong bundle): Default-Particle của Unity, đốm tròn mờ
            self.tex_fallback['nomat'] += 1
        ps['tex'] = (mat and mat['tex']) or self.default_particle()
        if mat and mat['blend'] != 'alpha':
            ps['blend'] = mat['blend']
        if mat and mat['tint'] != [1, 1, 1, 1]:
            ps['tint'] = mat['tint']
        if rend.get('m_SortingOrder', 0):
            ps['o'] = rend['m_SortingOrder']
        ps['L'] = rend.get('m_SortingLayer', 0)
        if mode != 0:
            ps['rm'] = mode
            if mode == 1:
                ps['lenScale'] = r4(rend.get('m_LengthScale', 2))
                ps['velScale'] = r4(rend.get('m_VelocityScale', 0))
        if rend.get('m_MaxParticleSize', 0.5) < 0.5:
            ps['maxSize'] = r4(rend['m_MaxParticleSize'])
        if rend.get('m_SortMode', 0):
            ps['sortMode'] = rend['m_SortMode']
        fl = rend.get('m_Flip', {})
        if fl.get('x') or fl.get('y'):
            ps['flip'] = [r4(fl.get('x', 0)), r4(fl.get('y', 0))]
        if mods:
            ps['u'] = mods
            for m in mods:
                used.add('ps:' + m)
        for k in ('sol', 'col', 'vel', 'limit', 'force', 'rol', 'uv', 'shape', 'bursts', 'rate'):
            if k in ps:
                self.modules[k] += 1
        self.modules['ps'] += 1
        return ps

    def trail(self, cab, t, used):
        mat = self.material(t['m_Materials'][0], cab) if t.get('m_Materials') else None
        p = t.get('m_Parameters', {})
        out = {'time': r4(t.get('m_Time', 1)), 'minD': r4(t.get('m_MinVertexDistance', 0.1)),
               'w': {'c': curve_keys(p.get('widthCurve', {})), 'm': r4(p.get('widthMultiplier', 1))},
               'g': gradient(p['colorGradient']) if 'colorGradient' in p else None,
               'o': t.get('m_SortingOrder', 0), 'L': t.get('m_SortingLayer', 0)}
        if mat:
            out['tex'] = mat['tex']
            if mat['blend'] != 'alpha':
                out['blend'] = mat['blend']
            if mat['tint'] != [1, 1, 1, 1]:
                out['tint'] = mat['tint']
        if not t.get('m_Enabled', 1):
            out['off'] = 1
        if not t.get('m_Emitting', 1):
            out['noEmit'] = 1
        self.modules['trail'] += 1
        return out

    def line(self, cab, t, used):
        mat = self.material(t['m_Materials'][0], cab) if t.get('m_Materials') else None
        p = t.get('m_Parameters', {})
        pts = [[r4(v['x']), r4(v['y'])] for v in t.get('m_Positions', [])]
        out = {'pts': pts, 'world': 1 if t.get('m_UseWorldSpace') else 0, 'loop': 1 if t.get('m_Loop') else 0,
               'w': {'c': curve_keys(p.get('widthCurve', {})), 'm': r4(p.get('widthMultiplier', 1))},
               'g': gradient(p['colorGradient']) if 'colorGradient' in p else None,
               'o': t.get('m_SortingOrder', 0), 'L': t.get('m_SortingLayer', 0)}
        if mat:
            out['tex'] = mat['tex']
            if mat['blend'] != 'alpha':
                out['blend'] = mat['blend']
        if not t.get('m_Enabled', 1):
            out['off'] = 1
        self.modules['line'] += 1
        return out

    # ---- quét
    def survey(self):
        E = self.E
        roots = []  # (rel, cab, go, name, cat, kinds, mbs)
        for rel in SRC:
            for cab in E.cabs_of(rel):
                for rc, rg in E.roots(cab):
                    kinds, mbs = collections.Counter(), set()
                    for c, g, d in E.walk(rc, rg):
                        for tn, cc, co in E.components(c, g):
                            if tn == 'MonoBehaviour':
                                mbs.add(E.script_name(cc, E.tree(cc, co)) or '?')
                            else:
                                kinds[tn] += 1
                    name = E.tree(rc, rg)['m_Name']
                    roots.append((rel, rc, rg, name, classify(mbs, name), kinds, mbs))
        return roots

    def raw_refs(self, roots):
        """Mọi con trỏ MB từ cây một gốc tới gốc khác -> [(tên nguồn, 'Lớp.trường', (cab, pid) đích)]."""
        E = self.E
        root_keys = {(rc, rg.path_id) for _, rc, rg, *_ in roots}
        out = []

        def ptrs(d, path=''):
            if isinstance(d, dict):
                if 'm_PathID' in d and 'm_FileID' in d and len(d) == 2:
                    yield path, d
                else:
                    for k, v in d.items():
                        yield from ptrs(v, path + '.' + k if path else k)
            elif isinstance(d, list):
                for v in d:
                    yield from ptrs(v, path + '[]')

        for rel, rc, rg, name, cat, kinds, mbs in roots:
            for c, g, dep in E.walk(rc, rg):
                for tn, cc, co in E.components(c, g):
                    if tn != 'MonoBehaviour':
                        continue
                    t = E.tree(cc, co)
                    cls = E.script_name(cc, t) or '?'
                    for path, p in ptrs(t):
                        if path in ('m_Script', 'm_GameObject') or not p.get('m_PathID'):
                            continue
                        r = E.resolve(p, cc)
                        if not r:
                            continue
                        tn2 = r[1].type.name
                        if tn2 == 'GameObject':
                            tg = r
                        elif tn2 in ('Transform', 'ParticleSystem'):
                            tg = E.resolve(E.tree(*r).get('m_GameObject'), r[0])
                        else:
                            continue
                        if not tg:
                            continue
                        k = (tg[0], tg[1].path_id)
                        if k not in root_keys or k == (rc, rg.path_id):
                            continue
                        f = '%s.%s' % (cls, path.replace('serializationData.ReferencedUnityObjects[]', 'odin[]'))
                        out.append((name, f, k))
        return out

    def refs(self, graph, exported):
        """-> {prefab nguồn: {'Lớp.trường': tên hiệu ứng | [tên]}} chỉ với đích đã xuất."""
        out = collections.defaultdict(dict)
        fields = collections.Counter()
        for name, f, k in graph:
            eff = exported.get(k)
            if not eff:
                continue
            fields[f] += 1
            cur = out[name].get(f)
            if cur is None:
                out[name][f] = eff
            elif cur != eff:
                lst = cur if isinstance(cur, list) else [cur]
                if eff not in lst:
                    lst.append(eff)
                out[name][f] = lst
        return dict(out), fields

    def muzzles(self, roots):
        """Súng: nút gun_point (SpriteRenderer) bật trong clip bắn -> hiệu ứng muzzle_<sprite>."""
        E = self.E
        out, effects = {}, {}
        for rel, rc, rg, name, cat, kinds, mbs in roots:
            if not any(m.startswith(('Gun', 'CGWeapon', 'EGun')) or m == 'WeaponBFModAttack' for m in mbs):
                continue
            gp = None
            for c, g, dep in E.walk(rc, rg):
                if E.tree(c, g)['m_Name'] == 'gun_point':
                    gp = (c, g)
                    break
            if not gp:
                continue
            srr = [E.tree(cc, co) for tn, cc, co in E.components(*gp) if tn == 'SpriteRenderer']
            if not srr:
                continue
            f = self.sprite_frame(srr[0].get('m_Sprite'), gp[0])
            if not f:
                continue
            # vị trí gun_point theo gốc súng (cộng dồn 2D)
            x = y = 0.0
            cur = gp
            while cur and not (cur[0] == rc and cur[1].path_id == rg.path_id):
                tr = E.tree(*E.transform(*cur))
                x += tr['m_LocalPosition']['x']
                y += tr['m_LocalPosition']['y']
                cur = E.parent_go(*cur)
            show = self.muzzle_show(rc, rg)
            ename = 'muzzle_' + f
            if ename not in effects:
                effects[ename] = {'cat': 'muzzle', 'nodes': [{'n': 'gun_point', 'p': -1,
                                                            'sr': {'f': f, 'o': srr[0].get('m_SortingOrder', 0), 'L': srr[0].get('m_SortingLayer', 0)}}],
                                  'dur': show}
            out[name] = {'muzzle': ename, 'at': [r4(x), r4(y)], 'show': show}
        return out, effects

    def muzzle_show(self, rc, rg):
        """Thời gian gun_point bật trong clip bắn đầu tiên có đường m_Enabled cho nó. [ĐO] clip; không có -> 0.05 [ƯỚC LƯỢNG]."""
        E = self.E
        crc = None
        for tn, cc, co in E.components(rc, rg):
            if tn != 'Animator':
                continue
            rcn = E.resolve(E.tree(cc, co).get('m_Controller'), cc)
            if not rcn:
                continue
            ct = E.tree(*rcn)
            if rcn[1].type.name == 'AnimatorOverrideController':
                clips = [p['m_OverrideClip'] for p in ct.get('m_Clips', [])]
            else:
                clips = ct.get('m_AnimationClips', [])
            for cp in clips:
                cr = E.resolve(cp, rcn[0])
                if not cr:
                    continue
                t = E.tree(*cr)
                if re.search(r'id(l)?e', t['m_Name'], re.I):
                    continue
                for b in t['m_ClipBindingConstant']['genericBindings']:
                    if b['attribute'] == 3305885265 and b['typeID'] == 212:
                        crc = crc or {}
                        pm = {b['path']: 0}
                        used = set()
                        cl = self.clip(cr[0], cr[1], pm, used)
                        for cv in cl['curves']:
                            if cv['k'] == 'en':
                                on_t = None
                                for k in cv['s']:
                                    v = k[-1] if len(k) == 2 else k[4]
                                    if v > 0.5 and on_t is None:
                                        on_t = k[0]
                                    elif v <= 0.5 and on_t is not None:
                                        return r4(k[0] - on_t)
                                if on_t is not None:
                                    return r4(max(0.03, cl['len'] - on_t))
        return 0.05


def _crop(rd, tex_img):
    r = rd['textureRect']
    x, y, w, h = r['x'], r['y'], r['width'], r['height']
    W, H = tex_img.size
    box = (int(round(x)), int(round(H - y - h)), int(round(x + w)), int(round(H - y)))
    im = tex_img.crop(box).convert('RGBA')
    rot = (int(rd.get('settingsRaw', 0)) >> 1) & 0x7
    ops = {1: [Image.FLIP_LEFT_RIGHT], 2: [Image.FLIP_TOP_BOTTOM], 3: [Image.ROTATE_180],
           4: [Image.ROTATE_90], 5: [Image.ROTATE_90, Image.FLIP_LEFT_RIGHT],
           6: [Image.ROTATE_90, Image.FLIP_TOP_BOTTOM], 7: [Image.ROTATE_270]}
    for op in ops.get(rot, []):
        im = im.transpose(op)
    return im


def main():
    os.makedirs(WORK, exist_ok=True)
    B = Builder()
    t0 = time.time()
    roots = B.survey()
    print('quét %d gốc trong %.1fs' % (len(roots), time.time() - t0))
    cats = collections.Counter(r[4] for r in roots)
    print('  phân loại', dict(cats))
    graph = B.raw_refs(roots)
    fx_target = {k for name, f, k in graph if FX_FIELD.search(f.split('.', 1)[1])}
    print('đồ thị tham chiếu: %d cạnh, %d gốc là đích trường hiệu ứng (%.1fs)' % (len(graph), len(fx_target), time.time() - t0))
    effects, exported, src_of, dup = {}, {}, collections.Counter(), 0
    by_src = collections.Counter()
    for rel, rc, rg, name, cat, kinds, mbs in roots:
        if cat == 'bullet' and (rc, rg.path_id) in fx_target:
            cat = 'fx'  # đạn/vùng được tạo ra như hiệu ứng (Fire2, explode_obj...) -> xuất trọn
        visual = kinds['ParticleSystem'] or kinds['TrailRenderer'] or kinds['LineRenderer'] or 'SpriteAnimation' in mbs or \
            kinds['Animator'] or kinds['SpriteRenderer']
        if not visual or cat == 'entity':
            continue
        trail_only = cat == 'bullet'
        if trail_only and not (kinds['ParticleSystem'] or kinds['TrailRenderer'] or kinds['LineRenderer']):
            continue
        if cat == 'fx' and (rc, rg.path_id) not in fx_target and not (kinds['ParticleSystem'] or kinds['TrailRenderer'] or kinds['LineRenderer'] or
                                'SpriteAnimation' in mbs or kinds['Animator'] or 'RGAutoDestory' in mbs):
            continue  # SpriteRenderer tĩnh không tự huỷ: đồ trang trí, không phải hiệu ứng
        if name in effects:
            dup += 1
            exported[(rc, rg.path_id)] = name
            continue
        try:
            eff = B.export(rc, rg, 'trail' if trail_only else cat, trail_only)
        except Exception as e:  # noqa: BLE001
            print('  lỗi', rel, name, repr(e))
            continue
        if not eff:
            continue
        eff['src'] = rel
        effects[name] = eff
        exported[(rc, rg.path_id)] = name
        by_src[rel] += 1
    print('xuất %d hiệu ứng (%d trùng tên bỏ qua) trong %.1fs' % (len(effects), dup, time.time() - t0))
    refs, fields = B.refs(graph, exported)
    muz, meff = B.muzzles(roots)
    for k, v in meff.items():
        v['src'] = 'weapon'
        effects.setdefault(k, v)
    by_src['muzzle(gun_point)'] = len(meff)
    print('refs: %d prefab nguồn, muzzle: %d súng / %d hiệu ứng' % (len(refs), len(muz), len(meff)))

    pages, frames, total, smooth = B.atlas.pack(OUT_ART)
    print('atlas: %d trang, %d khung, %.1f KB' % (len(pages), len(frames), total / 1024))
    stats = {
        'effects': len(effects), 'bySrc': dict(by_src.most_common()), 'byCat': dict(collections.Counter(e['cat'] for e in effects.values())),
        'modules': dict(B.modules.most_common()),
        'unsupportedVisual': {k: v for k, v in B.unsup.most_common() if visual_unsupported(k)},
        'effectsWithUnsupportedVisual': B.unsup_eff,
        'ignoredLogic': {k: v for k, v in B.unsup.most_common() if not visual_unsupported(k)},
        'texFallback': dict(B.tex_fallback.most_common()),
        'artBytes': total, 'missingSprites': B.missing_sprite, 'shaders': dict(B.shaders.most_common()), 'refFields': dict(fields.most_common(60)),
    }
    data = {'v': time.strftime('%Y%m%d%H%M'), 'ppu': 16, 'layers': SORTING_LAYERS, 'atlas': {'pages': pages, 'f': frames, 'smooth': smooth},
            'effects': effects, 'refs': refs, 'weapons': muz, 'stats': stats}
    js = '// Tệp sinh bởi tools/vfx/build_vfx.py từ bundle Soul Knight 8.6 — đừng sửa tay.\nwindow.SK_VFX=' + \
        json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    with open(os.path.join(WORK, 'stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
    print('ghi %s (%.1f KB)' % (OUT_JS, len(js.encode('utf-8')) / 1024))
    print(json.dumps(stats, ensure_ascii=False, indent=1)[:4000])


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    main()
