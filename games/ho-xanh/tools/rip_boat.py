# -*- coding: utf-8 -*-
"""Rút cano, biển sảnh (lobby), súng phụ và bảng nâng cấp trang bị của Dave the Diver cho Hố Xanh.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_boat.py            # tất cả
    python games/ho-xanh/tools/rip_boat.py boat sea   # vài phần: boat sea dave vfx gear sheet audio

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json). Không sửa rip.py/level.py,
chỉ import hàm của chúng.

Ra:
  art/boat/boat.glb        cano LobbyBoat_Day (gốc toạ độ = gốc prefab, ngay mặt nước)
  art/boat/sea.glb         biển sảnh: mặt nước, đảo xa, đảo sushi, bụi cây, thuyền quán sushi
  art/boat/clouds.glb      8 đám mây (giữ tên node để chạy anim trôi)
  art/boat/*.png           sheet Dave ở sảnh, sheet mòng biển + dừa, ảnh nước
  art/boat/fx/*.png        ảnh hạt của mọi VFX (sóng/bọt quanh cano, tia sáng, nòng súng, nổ, lưới)
  art/gear/**              icon trang bị, icon/súng cầm tay/đạn, tay Dave cầm súng, nền iDiver
  audio/boat_*.mp3 audio/gun_*.mp3 audio/ui_*.mp3
  data/boat_assets.js      window.HX_BOAT_ASSETS
  data/gear_sheet.js       window.HX_GEAR_SHEET
"""
import base64, io, json, math, os, re, shutil, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # khỏi để lại __pycache__ trong tools/

import numpy as np
import UnityPy
from PIL import Image

import rip
_IX = rip.bundle_index()
rip.IDX, rip.CABS = _IX['path'], _IX['cab']
import level  # nạp bảng bundle lúc import

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art')
BOAT = os.path.join(ART, 'boat')
GEAR = os.path.join(ART, 'gear')
FXDIR = os.path.join(BOAT, 'fx')  # ảnh hạt VFX dùng chung cho cano lẫn súng (một ảnh chỉ ghi một lần)
FXTC = {}
AUD = os.path.join(GAME, 'audio')
DATA = os.path.join(GAME, 'data')
CACHE = os.path.join(tempfile.gettempdir(), 'ho-xanh-rip')
PC = rip.PC
DTD = rip.DTD

LOBBY_SCENE = 'Assets/Scenes/InGame/DR_Lobby.unity'
BOAT_PREFAB = PC + 'Lobby/Prefabs/LobbyBoat_Day.prefab'
ENV_DAY = PC + 'Lobby/Prefabs/Environment/Lobby_Day.prefab'   # DynamicEnvironmentLoader nạp bản này (DayTime 1, Weather 0)
LOBBY_ATLAS = PC + 'Common/Sprites/Player/Atlas/01_Default_Lobby_Atlas.spriteatlas'
DAVE_ATLAS = PC + 'Common/Sprites/Player/Atlas/01_Default_Atlas.spriteatlas'
DAVE_CLIPS = PC + 'Lobby_Characters/Dave/Animations/'
VFXP = PC + 'Common/VFX/Prefabs/'
GUNP = PC + 'Ingame/00_InGame_Common/Prefabs/InstanceItem/Gun/'
SHEET = 'Assets/AssetBundleResources/GameDataSheet/'


def rel(p):
    return os.path.relpath(p, GAME).replace('\\', '/')


def save(img, path):
    """PNG. Ảnh hạt VFX phần lớn là mặt nạ xám (R=G=B): lưu dạng LA, nhẹ ~40% mà trình duyệt đọc như RGBA."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = np.asarray(img.convert('RGBA'))
    if img.mode == 'RGBA' and (a[..., 0] == a[..., 1]).all() and (a[..., 1] == a[..., 2]).all():
        img = Image.fromarray(a[..., [0, 3]], 'LA')
    img.save(path, optimize=True)
    return rel(path)


# ---------------------------------------------------------------- Addressables: GUID -> đường asset
def guid_map():
    """catalog.json: m_KeyDataString/m_BucketDataString/m_EntryDataString là nhị phân base64.
    GunSpecData trỏ tới prefab súng và đạn bằng GUID, nên phải giải bảng này mới biết đúng đạn."""
    p = os.path.join(CACHE, 'guid_map.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    c = json.load(open(os.path.join(DTD, 'StreamingAssets', 'aa', 'catalog.json'), encoding='utf-8'))
    ids = c['m_InternalIds']
    kd, bd, ed = (base64.b64decode(c[k]) for k in ('m_KeyDataString', 'm_BucketDataString', 'm_EntryDataString'))

    def key_at(off):
        t = kd[off]
        n = struct.unpack_from('<i', kd, off + 1)[0]
        if t == 0:
            return kd[off + 5:off + 5 + n].decode('ascii', 'replace')
        if t == 1:
            return kd[off + 5:off + 5 + n].decode('utf-16-le', 'replace')
        return None
    out, off = {}, 4
    for _ in range(struct.unpack_from('<i', bd, 0)[0]):
        koff, cnt = struct.unpack_from('<ii', bd, off)
        ents = struct.unpack_from('<%di' % cnt, bd, off + 8)
        off += 8 + 4 * cnt
        k = key_at(koff)
        if isinstance(k, str) and re.fullmatch(r'[0-9a-f]{32}', k):
            out[k] = [ids[struct.unpack_from('<7i', ed, 4 + e * 28)[0]] for e in ents]
    json.dump(out, open(p, 'w', encoding='utf-8'))
    return out


# ---------------------------------------------------------------- AnimationClip -> số khoá
def f32(u):
    return struct.unpack('<f', struct.pack('<I', u & 0xffffffff))[0]


BIG = 1e30
SPRITES = {}  # tên sprite -> Sprite, gom từ pptrCurveMapping của mọi clip đã giải
BIND_DIMS = {1: 3, 2: 4, 3: 3, 4: 3}  # Transform: 1 vị trí, 2 quaternion, 3 scale, 4 euler (độ)
ATTR_ACTIVE = zlib.crc32(b'm_IsActive')


def clip_curves(tt):
    """Clip đã build (không legacy): mọi khoá thành {chỉ số curve: [(t, [c0,c1,c2,c3])]}.
    Streamed: mỗi khoá mang hệ số Hermite cho đoạn từ nó tới khoá sau, giá trị = c3.
    Dense: lấy mẫu đều, nối thẳng. Constant: một giá trị."""
    mc = tt['m_MuscleClip']['m_Clip']
    mc = mc.get('data', mc)
    out = {}
    sc = mc['m_StreamedClip']
    data, pos = sc['data'], 0
    while pos < len(data):
        t, n = f32(data[pos]), data[pos + 1]
        pos += 2
        for _ in range(n):
            out.setdefault(data[pos], []).append((t, [f32(x) for x in data[pos + 1:pos + 5]]))
            pos += 5
    ns = sc['curveCount'] + sc.get('discreteCurveCount', 0)
    dc = mc['m_DenseClip']
    nd, arr = dc['m_CurveCount'], dc['m_SampleArray']
    for ci in range(nd):
        pts = [(dc['m_BeginTime'] + f / dc['m_SampleRate'], arr[f * nd + ci]) for f in range(dc['m_FrameCount'])]
        for i, (t, v) in enumerate(pts):
            slope = (pts[i + 1][1] - v) / (pts[i + 1][0] - t) if i + 1 < len(pts) else 0.0
            out.setdefault(ns + ci, []).append((t, [0.0, 0.0, slope, v]))
    for ci, v in enumerate(mc['m_ConstantClip']['data']):
        out.setdefault(ns + nd + ci, []).append((0.0, [0.0, 0.0, 0.0, v]))
    for k in out:
        out[k].sort(key=lambda x: x[0])
    return out


def curve_at(keys, t):
    cur = None
    for kt, c in keys:
        if kt <= t:
            cur = (kt, c)
        else:
            break
    if cur is None:
        return keys[0][1][3]
    kt, c = cur
    if kt < -BIG:
        return c[3]
    dt = t - kt
    return ((c[0] * dt + c[1]) * dt + c[2]) * dt + c[3]


def path_names(root_go):
    """crc32 của đường dẫn tương đối (như AnimationClip lưu) -> tên đường dẫn."""
    out = {0: ''}
    stack = [(root_go, '')]
    while stack:
        go, p = stack.pop()
        for ch in level.transform_of(go).m_Children:
            c = ch.read().m_GameObject.read()
            q = c.m_Name if not p else p + '/' + c.m_Name
            out[zlib.crc32(q.encode('utf-8'))] = q
            stack.append((c, q))
    return out


def rnd(v, n=4):
    return round(float(v), n) + 0.0  # + 0.0: bỏ "-0.0"


def decode_clip(obj, paths=None, fps=30):
    """AnimationClip -> dict dữ liệu thuần: độ dài, sampleRate gốc, lặp, dãy sprite [t, tên],
    và track transform lấy mẫu `fps` khung/giây (pos/euler/scale) + khoá bật/tắt GameObject."""
    tt = obj.read_typetree()
    ac = obj.read()
    paths = paths or {0: ''}
    mc = tt['m_MuscleClip']
    length = rnd(mc['m_StopTime'] - mc['m_StartTime'], 4)
    res = {'name': tt['m_Name'], 'length': length, 'sampleRate': rnd(tt['m_SampleRate'], 3),
           'loop': bool(mc.get('m_LoopTime'))}
    tracks = {}
    n_samp = max(1, int(round(length * fps)))
    times = [min(length, i / fps) for i in range(n_samp + 1)]
    if tt.get('m_Legacy'):
        res['legacy'] = True
        res['loop'] = tt.get('m_WrapMode') == 2 or res['loop']
        for kind, key in (('m_PositionCurves', 'pos'), ('m_EulerCurves', 'euler'), ('m_ScaleCurves', 'scale')):
            for c in tt[kind]:
                ks = c['curve']['m_Curve']
                if not ks:
                    continue
                # clip legacy (mây trôi 500 s, mòng biển bay vòng) chỉ có vài khoá: giữ nguyên khoá Hermite
                # [t, x,y,z, inX,inY,inZ, outX,outY,outZ] thay vì lấy mẫu (lấy mẫu 500 s x 30 = 15 000 dòng)
                sl = lambda v: rnd(v) if math.isfinite(v) else None
                tracks.setdefault(c['path'], {})[key + 'Keys'] = [
                    [rnd(k['time'])] + [rnd(k['value'][a]) for a in 'xyz'] + [sl(k['inSlope'][a]) for a in 'xyz']
                    + [sl(k['outSlope'][a]) for a in 'xyz'] for k in ks]
                res['length'] = length = max(length, rnd(ks[-1]['time']))
        for c in tt['m_FloatCurves']:
            ks = [(k['time'], k['value'], k['inSlope'], k['outSlope']) for k in c['curve']['m_Curve']]
            if ks:
                tracks.setdefault(c['path'], {})['float:' + c['attribute']] = [[rnd(k[0]), rnd(k[1])] for k in ks]
    else:
        curves = clip_curves(tt)
        names = []
        for p in ac.m_ClipBindingConstant.pptrCurveMapping:
            try:
                o = p.read()
                names.append(o.m_Name)
                if type(o).__name__ == 'Sprite':
                    SPRITES.setdefault(o.m_Name, o)
            except Exception:
                names.append(None)
        ci = 0
        for b in tt['m_ClipBindingConstant']['genericBindings']:
            dims = BIND_DIMS.get(b['attribute'], 1) if b['typeID'] == 4 else 1
            idx = list(range(ci, ci + dims))
            ci += dims
            path = paths.get(b['path'], '#%d' % b['path'])
            if b['isPPtrCurve']:
                ks = curves.get(idx[0], [])
                seq = []
                for t, c in ks:
                    if abs(t) > BIG:
                        t = 0.0 if t < 0 else None
                    if t is None:
                        continue
                    n = names[int(round(c[3]))] if 0 <= int(round(c[3])) < len(names) else None
                    if seq and seq[-1][0] == rnd(t):
                        seq[-1] = [rnd(t), n]
                    else:
                        seq.append([rnd(t), n])
                if b['typeID'] == 212:
                    res['sprites'] = seq
                else:
                    tracks.setdefault(path, {})['pptr:%d' % b['typeID']] = seq
                continue
            if any(i not in curves for i in idx):
                continue
            if b['typeID'] == 4:
                key = {1: 'pos', 2: 'quat', 3: 'scale', 4: 'euler'}[b['attribute']]
                vals = [[rnd(curve_at(curves[i], t)) for i in idx] for t in times]
                if all(v == vals[0] for v in vals):
                    vals = [vals[0]]
                tracks.setdefault(path, {})[key] = vals
            elif b['typeID'] == 1 and b['attribute'] == ATTR_ACTIVE:
                ks = [[rnd(max(0.0, t)), int(round(c[3]))] for t, c in curves[idx[0]] if t < BIG]
                tracks.setdefault(path, {})['active'] = ks
            else:
                ks = [[rnd(max(0.0, t)), rnd(c[3])] for t, c in curves[idx[0]] if t < BIG]
                tracks.setdefault(path, {})['attr:%d:%d' % (b['typeID'], b['attribute'])] = ks
    if tracks:
        res['fps'] = fps
        res['tracks'] = tracks
    return res


def controller_clips(anim_comp):
    """Animator -> các AnimationClip trong controller (kể cả override)."""
    a = anim_comp.read()
    ctrl = a.m_Controller.read()
    clips = []
    if type(ctrl).__name__ == 'AnimatorOverrideController':
        for cl in ctrl.m_Clips:
            p = cl.m_OverrideClip if cl.m_OverrideClip.m_PathID else cl.m_OriginalClip
            clips.append(p)
        base = ctrl.m_Controller.read()
        clips += list(base.m_AnimationClips)
    else:
        clips = list(ctrl.m_AnimationClips)
    seen, out = set(), []
    for p in clips:
        if not p.m_PathID:
            continue
        o = p.deref()
        k = (o.assets_file.name, o.path_id)
        if k not in seen:
            seen.add(k)
            out.append(o)
    return ctrl.m_Name, out


def legacy_clips(anim_comp):
    a = anim_comp.read()
    out = []
    for p in list(a.m_Animations) + [a.m_Animation]:
        if p.m_PathID:
            o = p.deref()
            if all((o.assets_file.name, o.path_id) != (x.assets_file.name, x.path_id) for x in out):
                out.append(o)
    return out


def clip_asset(path):
    """AnimationClip theo đường asset (có nạp phụ thuộc để đọc tên sprite)."""
    env, _ = level.load_with_deps(path)
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k == path and ptr.asset.type.name == 'AnimationClip':
                    return ptr.asset.deref()
    raise KeyError('không thấy clip ' + path)


# ---------------------------------------------------------------- sprite -> ảnh đúng khung
def sprite_canvas(sp):
    """Sprite -> ảnh RGBA đúng kích thước m_Rect (đặt phần đã cắt viền về đúng chỗ) + pivot (0..1)."""
    img = sp.image.convert('RGBA')
    w, h = int(round(sp.m_Rect.width)), int(round(sp.m_Rect.height))
    if img.size == (w, h):
        return img, (rnd(sp.m_Pivot.x, 3), rnd(sp.m_Pivot.y, 3))
    ox, oy = sp.m_RD.textureRectOffset.x, sp.m_RD.textureRectOffset.y
    can = Image.new('RGBA', (w, h))
    can.paste(img, (int(round(ox)), int(round(h - oy - img.height))))
    return can, (rnd(sp.m_Pivot.x, 3), rnd(sp.m_Pivot.y, 3))


def atlas_sprites(atlas_path, want=None):
    """{tên: Sprite} trong một SpriteAtlas (want = tập tên hoặc hàm lọc)."""
    env = rip.env_of(rip.IDX[atlas_path])
    out = {}
    for o in env.objects:
        if o.type.name == 'Sprite':
            s = o.read()
            n = s.m_Name
            if want is None or (callable(want) and want(n)) or (not callable(want) and n in want):
                out[n] = s
    return out


def pack_rows(rows, path, pad=0):
    """rows = [(tên dãy, [ảnh cùng cỡ ô])] -> sheet mỗi dãy một hàng. Trả về (cell w,h, {tên: row})."""
    cw = max(im.width for _, ims in rows for im in ims)
    ch = max(im.height for _, ims in rows for im in ims)
    width = max(len(ims) for _, ims in rows)
    sheet = Image.new('RGBA', (cw * width, ch * len(rows)))
    for r, (_, ims) in enumerate(rows):
        for c, im in enumerate(ims):
            sheet.paste(im, (c * cw + (cw - im.width) // 2, r * ch + (ch - im.height)))
    save(sheet, path)
    return [cw, ch], {n: r for r, (n, _) in enumerate(rows)}


def timeline(seq, length, names_in_row):
    """[t, tên sprite] -> [[cột, thời lượng giây]]; khoá trùng liền nhau gộp lại."""
    out = []
    for i, (t, n) in enumerate(seq):
        t1 = seq[i + 1][0] if i + 1 < len(seq) else length
        d = rnd(max(0.0, t1 - t), 4)
        if n is None:
            continue
        col = names_in_row.index(n)
        if out and out[-1][0] == col:
            out[-1][1] = rnd(out[-1][1] + d, 4)
        elif d > 0 or not out:
            out.append([col, d])
    return out


# ---------------------------------------------------------------- GLB
class HxGlb(level.Glb):
    """Glb của level.py + xử lý shader lẻ ở sảnh: shader graph đặt ảnh ở tên thuộc tính riêng
    (Texture2D_310EA40D...), nước ProjectDR/DaveWater không có ảnh màu, chỉ có màu + ảnh sóng."""

    def material(self, mat, role):
        i = super().material(mat, role)
        m = self.materials[i]
        ex = m['extras']
        if ex.get('_done'):
            return i
        pbr = m['pbrMetallicRoughness']
        sp = mat.m_SavedProperties
        T = [(n, e.m_Texture) for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID]
        C = {n: c for n, c in sp.m_Colors}
        if 'baseColorTexture' not in pbr and role not in ('water', 'sky') and T:
            try:
                ti, alpha = self.texture(T[0][1])
                pbr['baseColorTexture'] = {'index': ti}
                ex['texProp'] = T[0][0]
                if alpha:
                    m['alphaMode'] = 'BLEND' if role == 'cloud' else 'MASK'
                    if role != 'cloud':
                        m['alphaCutoff'] = 0.5
            except Exception as e:
                ex['missingTex'] = str(e)[:80]
        if role == 'cloud':
            m['alphaMode'] = 'BLEND'
            m.pop('alphaCutoff', None)
            m['doubleSided'] = True
        if role == 'water':
            b = C.get('_BaseColor')
            if b is not None:
                pbr['baseColorFactor'] = level.rgb(b) + [rnd(b.a)]
                m['alphaMode'] = 'BLEND'
            ex['textures'] = {n: t.read().m_Name for n, t in T}
        if role == 'boat' and ex.get('transparent'):
            m['alphaMode'] = 'BLEND'
            m.pop('alphaCutoff', None)
        ex['_done'] = 1
        return i

    def write(self, path):
        for m in self.materials:
            m.get('extras', {}).pop('_done', None)
        super().write(path)


def gltfpack(raw, out, keep_names=False):
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    args = [npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-ke', '-mm']
    if keep_names:
        args.append('-kn')
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def export_nodes(g, items, sprites, sprite_imgs, sprite_mats, cache, base=None, skip=lambda go: False,
                 force=(), animated_out=None):
    """items = [(GameObject gốc, vai trò)]. Đi hết cây con: MeshRenderer -> mesh, SpriteRenderer -> gom
    vào atlas chung. base = ma trận 4x4 đổi hệ (vd. về gốc cano). force = tên GameObject tắt nhưng vẫn lấy
    (vd. Sushiboat_Day do DynamicEnvironment bật lúc chạy). Sprite có Animator (dừa, mòng biển) không vẽ
    tĩnh mà trả vào animated_out."""
    base = np.eye(4) if base is None else base
    stats = {}
    for root, role in items:
        stack = [root]
        while stack:
            go = stack.pop()
            if skip(go):
                continue
            if not go.m_IsActive and go.m_Name not in force:
                continue
            stack.extend(ch.read().m_GameObject.read() for ch in level.transform_of(go).m_Children)
            comps = {c.component.type.name: c.component for c in go.m_Component}
            m = base @ level.world(level.transform_of(go), cache)
            if 'SpriteRenderer' in comps:
                r = comps['SpriteRenderer'].read()
                if not r.m_Enabled or not r.m_Sprite.m_PathID:
                    continue
                sp = r.m_Sprite.read()
                if 'Animator' in comps and animated_out is not None:
                    animated_out.append((go, comps['Animator'], m, r))
                    continue
                key = (sp.assets_file.name, sp.object_reader.path_id)
                if key not in sprite_imgs:
                    sprite_imgs[key] = sp.image.convert('RGBA')
                for mp in r.m_Materials:
                    if mp.m_PathID:
                        try:
                            sprite_mats.add(mp.read().m_Name)
                        except Exception:
                            pass
                sprites.append((key, sp, m, r.m_FlipX, r.m_FlipY, level.rgba(r.m_Color)))
                stats['sprites'] = stats.get('sprites', 0) + 1
            elif 'MeshRenderer' in comps and 'MeshFilter' in comps:
                r = comps['MeshRenderer'].read()
                mf = comps['MeshFilter'].read()
                if not r.m_Enabled or not mf.m_Mesh.m_PathID:
                    continue
                try:
                    me = mf.m_Mesh.read()
                except Exception:
                    continue
                mats = [g.material(x.read(), role) for x in r.m_Materials if x.m_PathID]
                g.node(go.m_Name, m, g.mesh(me, mats, role), role)
                stats[role] = stats.get(role, 0) + 1
    return stats


def load_scene_roots(path):
    env, own = level.load_with_deps(path)
    roots = {}
    for o in env.objects:
        if o.assets_file.name.lower() in own and o.type.name == 'Transform':
            t = o.read()
            if not t.m_Father.m_PathID:
                go = t.m_GameObject.read()
                roots[go.m_Name] = go
    return env, roots


def child(go, name):
    for ch in level.transform_of(go).m_Children:
        c = ch.read().m_GameObject.read()
        if c.m_Name == name:
            return c
    raise KeyError('%s không có con %s' % (go.m_Name, name))


def find_desc(go, name):
    stack = [go]
    while stack:
        g = stack.pop()
        if g.m_Name == name:
            return g
        stack.extend(ch.read().m_GameObject.read() for ch in level.transform_of(g).m_Children)
    raise KeyError(name)


def mb_tt(go, cls):
    for c in go.m_Component:
        if c.component.type.name == 'MonoBehaviour' and level.script_name(c.component.read()) == cls:
            return c.component.read_typetree()
    return None


def comp(go, tname):
    for c in go.m_Component:
        if c.component.type.name == tname:
            return c.component
    return None


def unity_to_gltf(p):
    return [rnd(p[0]), rnd(p[1]), rnd(-p[2])]


# ---------------------------------------------------------------- 1. CANO
def rip_boat():
    """LobbyBoat_Day: Model (thân + kính), Light_Root (đèn pha bật ban ngày), Prop_Root (ống, bình, thùng,
    bàn). Bỏ VFX_Root (ghi riêng thành công thức hạt), Event_Root (va chạm), AddOn_Root (trống), gương
    Merman và biển quảng cáo Cobra (nhiệm vụ mới mở)."""
    env, _ = level.load_with_deps(BOAT_PREFAB)
    root = level.prefab_root(env, BOAT_PREFAB)
    cache = {}
    W = level.world(level.transform_of(root), cache)
    base = np.linalg.inv(W)
    model = child(root, 'Model')
    g = HxGlb()
    sprites, imgs, smats = [], {}, set()
    skip = lambda go: go.m_Name in ('VFX_Root', 'Event_Root', 'AddOn_Root')
    stats = export_nodes(g, [(model, 'boat')], sprites, imgs, smats, cache, base=base, skip=skip)
    raw = os.path.join(CACHE, 'boat.raw.glb')
    g.write(raw)
    out = os.path.join(BOAT, 'boat.glb')
    os.makedirs(BOAT, exist_ok=True)
    gltfpack(raw, out)
    # Khung bao (hệ Unity, gốc = gốc prefab) để biết mũi/đuôi, mặt nước.
    pts = []
    for nd in g.nodes:
        if 'matrix' not in nd:
            continue
        M = np.array(nd['matrix']).reshape(4, 4).T
        acc = g.accessors[g.meshes[nd['mesh']]['primitives'][0]['attributes']['POSITION']]
        lo, hi = np.array(acc['min']), np.array(acc['max'])
        for cx in (lo[0], hi[0]):
            for cy in (lo[1], hi[1]):
                for cz in (lo[2], hi[2]):
                    pts.append((M @ np.array([cx, cy, cz, 1]))[:3])
    pts = np.array(pts)
    bbox = {'min': [rnd(v, 3) for v in pts.min(0)], 'max': [rnd(v, 3) for v in pts.max(0)]}
    # anim của Animator Boat_001 (Idle nhấp nhô, Exit001/Exit002 = rời bến)
    paths = path_names(root)
    anim = comp(root, 'Animator')
    ctrl, clips = controller_clips(anim)
    anims = {}
    for o in clips:
        d = decode_clip(o, paths)
        # vị trí gốc trong clip là toạ độ thế giới của prefab; trừ gốc prefab để còn độ lệch
        tr = d.get('tracks', {}).get('')
        if tr and 'pos' in tr:
            p0 = [W[0, 3], W[1, 3], W[2, 3]]
            tr['posOffset'] = [[rnd(v[0] - p0[0]), rnd(v[1] - p0[1]), rnd(v[2] - p0[2])] for v in tr.pop('pos')]
        anims[d['name']] = d
    # FloatingTransform (lắc theo sóng) trên cano ở scene; tham số ở DynamicEnvironmentBoatFloating của scene
    ft = None
    for c in root.m_Component:
        if c.component.type.name == 'MonoBehaviour' and level.script_name(c.component.read()) == 'FloatingTransform':
            ft = c.component.read_typetree()
    night = {}
    try:
        envn, _ = level.load_with_deps(PC + 'Lobby/Prefabs/LobbyBoat_Evening.prefab')
        for o in envn.objects:
            if o.type.name == 'Material':
                mt = o.read()
                if mt.m_Name in ('Boat_001_Window_night', 'Boat_001_SerchLight_night', 'Boat_001_Glow'):
                    sp = mt.m_SavedProperties
                    night[mt.m_Name] = {'shader': mt.m_Shader.read().m_ParsedForm.m_Name,
                                        'colors': {n: level.rgba(c) for n, c in sp.m_Colors},
                                        'floats': {n: rnd(v, 3) for n, v in sp.m_Floats if not n.startswith('_Queue')},
                                        'textures': {n: e.m_Texture.read().m_Name for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID}}
        rootn = level.prefab_root(envn, PC + 'Lobby/Prefabs/LobbyBoat_Evening.prefab')
        cn = {}
        Wn = level.world(level.transform_of(rootn), cn)
        lights = []
        stack = [rootn]
        while stack:
            go = stack.pop()
            stack.extend(ch.read().m_GameObject.read() for ch in level.transform_of(go).m_Children)
            lc = comp(go, 'Light')
            if lc is not None and go.m_IsActive:
                lt = lc.read_typetree()
                p = (np.linalg.inv(Wn) @ level.world(level.transform_of(go), cn))[:3, 3]
                lights.append({'name': go.m_Name, 'type': lt['m_Type'], 'color': level.rgb(lt['m_Color']),
                               'intensity': rnd(lt['m_Intensity'], 3), 'range': rnd(lt['m_Range'], 3),
                               'pos': [rnd(v, 3) for v in p]})
        night['lights'] = lights
    except Exception as e:
        night['error'] = str(e)[:120]
    print('  cano: %s, %d KB, bbox %s' % (stats, os.path.getsize(out) // 1024, bbox))
    return {'glb': rel(out), 'scale': 1, 'bowDir': [-1, 0, 0], 'waterlineY': 0.2,
            'notes': '[ĐO TRONG REPO] 1 đv glb = 1 đv Unity; thân dài ~12.6 đv dọc x, mũi ở -x (lan can nhọn), đuôi +x '
                     '(thang, phao tròn). Mặt có chữ "Nodens 68" đọc xuôi là mặt glTF +z = mặt nhìn từ camera sảnh (Unity -z). '
                     'waterlineY 0.2 = -heightOffset của DynamicEnvironmentBoatFloating [DtD]: cano đặt ở mặt sóng + (-0.2).',
            'bboxGltf': bbox, 'prefabWorld': [rnd(W[0, 3], 3), rnd(W[1, 3], 3), rnd(W[2, 3], 3)],
            'controller': ctrl, 'anims': anims, 'floatingTransform': ft, 'night': night}


# ---------------------------------------------------------------- 2. BIỂN SẢNH
def rip_sea():
    """Cảnh sảnh ban ngày: từ scene DR_Lobby lấy thuyền quán sushi, đảo xa (FarBG), bụi cây, nền đảo;
    từ Environment/Lobby_Day (bản DynamicEnvironmentLoader nạp khi DayTime 1 + Weather 0) lấy mặt nước
    wave001 và mây. Toạ độ giữ nguyên thế giới Unity của sảnh (glTF: z -> -z)."""
    env, roots = load_scene_roots(LOBBY_SCENE)
    cache = {}
    le = roots['Lobby_Env']
    out = {}
    # tham số scene: vị trí cano, nổi theo sóng, sương, camera
    boat_grp = child(le, 'Boat')
    fl = mb_tt(boat_grp, 'DynamicEnvironmentBoatFloating')
    lb = child(boat_grp, 'LobbyBoat_Day')
    Wb = level.world(level.transform_of(lb), cache)
    ch = child(boat_grp, 'Character')
    Wc = level.world(level.transform_of(ch), cache)
    out['boatScene'] = {'pos': [rnd(v, 3) for v in Wb[:3, 3]],
                        'floating': [{'weather': f['weather'], 'heightOffset': rnd(f['heightOffset'], 3),
                                      'rollAmount': rnd(f['rollAmount'], 4),
                                      'samples': [[rnd(s['x'], 2), rnd(s['y'], 2), rnd(s['z'], 2)] for s in f['samples']]}
                                     for f in (fl or {}).get('m_FloatingValueList', [])],
                        'floatingTransform': {k: v for k, v in (mb_tt(lb, 'FloatingTransform') or {}).items()
                                              if k not in ('m_GameObject', 'm_Script', 'm_Enabled', 'm_Name')},
                        'davePos': [rnd(v, 3) for v in Wc[:3, 3]],
                        'daveScale': rnd(np.linalg.norm(Wc[:3, 0]), 3)}
    for nm in ('DiveTrigger', 'MoveSceneTrigger'):
        try:
            Wt = level.world(level.transform_of(child(boat_grp, nm)), cache)
            out['boatScene'][nm] = [rnd(v, 3) for v in Wt[:3, 3]]
        except KeyError:
            pass
    for o in env.objects:
        if o.type.name == 'RenderSettings':
            rs = o.read_typetree()
            out['renderSettings'] = {'fog': bool(rs['m_Fog']), 'fogMode': rs['m_FogMode'], 'fogColor': level.rgb(rs['m_FogColor']),
                                     'fogStart': rnd(rs['m_LinearFogStart'], 2), 'fogEnd': rnd(rs['m_LinearFogEnd'], 2),
                                     'fogDensity': rnd(rs['m_FogDensity'], 4), 'ambientSky': level.rgb(rs['m_AmbientSkyColor']),
                                     'ambientEquator': level.rgb(rs['m_AmbientEquatorColor']),
                                     'ambientGround': level.rgb(rs['m_AmbientGroundColor']), 'ambientMode': rs['m_AmbientMode']}
            break
    cam = find_desc(roots['Camera_Lobby'], 'MainCamera')
    cc = comp(cam, 'Camera').read_typetree()
    Wcam = level.world(level.transform_of(cam), cache)
    fwd = Wcam[:3, 2] / np.linalg.norm(Wcam[:3, 2])
    out['camera'] = {'pos': [rnd(v, 3) for v in Wcam[:3, 3]], 'forward': [rnd(v, 4) for v in fwd],
                     'fov': rnd(cc['field of view'], 2), 'near': rnd(cc['near clip plane'], 3), 'far': rnd(cc['far clip plane'], 1),
                     'note': 'MainCamera trong Camera_Lobby (có Animator Camera_Lobby, số ở đây là tư thế lưu trong scene)'}

    g = HxGlb()
    sprites, imgs, smats = [], {}, set()
    animated = []
    items = []
    sb = child(le, 'Sushiboat')
    items.append((child(sb, 'Sushiboat_Day'), 'sushiboat'))
    for n, role in (('FarBG', 'far'), ('ForestSprites_Left', 'forest'), ('ForestSprites_Right', 'forest'),
                    ('ForestSprites_Small', 'forest'), ('Lobby_Ground001', 'ground')):
        items.append((child(le, n), role))
    stats = export_nodes(g, items, sprites, imgs, smats, cache, force=('Sushiboat_Day',), animated_out=animated)
    # Environment/Lobby_Day: nước + (mây tách glb riêng)
    env2, _ = level.load_with_deps(ENV_DAY)
    day = level.prefab_root(env2, ENV_DAY)
    c2 = {}
    wave = child(day, 'wave001')
    stats.update(export_nodes(g, [(wave, 'water')], sprites, imgs, smats, c2))
    if sprites:
        level.add_sprites(g, sprites, imgs, sorted(smats))
    raw = os.path.join(CACHE, 'sea.raw.glb')
    g.write(raw)
    dst = os.path.join(BOAT, 'sea.glb')
    gltfpack(raw, dst)
    # thông số nước
    wm = comp(wave, 'MeshRenderer').read().m_Materials[0].read()
    sp = wm.m_SavedProperties
    wtex = {}
    for n, e in sp.m_TexEnvs:
        if e.m_Texture.m_PathID:
            t = e.m_Texture.read()
            im = t.image.convert('RGBA')
            if max(im.size) > 512:
                im = im.resize((512, 512), Image.LANCZOS)
            wtex[n] = {'img': save(im, os.path.join(BOAT, 'water', t.m_Name + '.png')),
                       'scale': [rnd(e.m_Scale.x), rnd(e.m_Scale.y)], 'srcSize': [t.m_Width, t.m_Height]}
    me = comp(wave, 'MeshFilter').read().m_Mesh.read()
    Ww = level.world(level.transform_of(wave), c2)
    out['water'] = {'material': wm.m_Name, 'shader': wm.m_Shader.read().m_ParsedForm.m_Name,
                    'keywords': list(getattr(wm, 'm_ValidKeywords', []) or []),
                    'colors': {n: level.rgba(c) for n, c in sp.m_Colors},
                    'floats': {n: rnd(v, 4) for n, v in sp.m_Floats if not n.startswith('_Queue')},
                    'textures': wtex, 'mesh': me.m_Name,
                    'y': rnd(Ww[1, 3], 3), 'pos': [rnd(v, 3) for v in Ww[:3, 3]], 'scale': rnd(np.linalg.norm(Ww[:3, 0]), 3),
                    'note': 'ProjectDR/DaveWater (họ Stylized Water): sóng Gerstner trong shader, không có ảnh màu. '
                            'Màu = _BaseColor/_ShallowColor/_HorizonColor; bọt _FoamTex; gợn _IntersectionNoise.'}
    # đèn + sương theo buổi (Light của Lobby_Day)
    lights = []
    stack = [day]
    while stack:
        go = stack.pop()
        stack.extend(chh.read().m_GameObject.read() for chh in level.transform_of(go).m_Children)
        lc = comp(go, 'Light')
        if lc is not None:
            lt = lc.read_typetree()
            Wl = level.world(level.transform_of(go), c2)
            d = Wl[:3, 2] / np.linalg.norm(Wl[:3, 2])
            lights.append({'name': go.m_Name, 'type': lt['m_Type'], 'color': level.rgb(lt['m_Color']),
                           'intensity': rnd(lt['m_Intensity'], 3), 'dir': [rnd(v, 4) for v in d],
                           'shadows': lt['m_Shadows']['m_Type']})
    out['lights'] = lights
    # mây: glb riêng giữ tên node + anim legacy (trôi)
    clouds = child(day, 'Lobby Clouds')
    gc = HxGlb()
    old, level.MAX_TEX = level.MAX_TEX, 512  # ảnh mây 1024x512 mềm, thu nửa đỡ 2 MB
    try:
        cstats = export_nodes(gc, [(clouds, 'cloud')], [], {}, set(), c2)
    finally:
        level.MAX_TEX = old
    rawc = os.path.join(CACHE, 'clouds.raw.glb')
    gc.write(rawc)
    dstc = os.path.join(BOAT, 'clouds.glb')
    gltfpack(rawc, dstc, keep_names=True)
    canim = {}
    for chh in level.transform_of(clouds).m_Children:
        cgo = chh.read().m_GameObject.read()
        a = comp(cgo, 'Animation')
        if a is not None:
            for o in legacy_clips(a):
                d = decode_clip(o)
                canim.setdefault(cgo.m_Name, []).append(d)
    out['clouds'] = {'glb': rel(dstc), 'count': cstats.get('cloud', 0), 'anims': canim,
                     'note': 'mỗi đám mây là một node giữ tên (vd. "Cloud004 (1)"); anim legacy là track pos/euler tương đối node'}
    # sprite có Animator (dừa đung đưa) -> sheet riêng
    out['animSprites'] = anim_sprites(animated, roots)
    print('  biển: %s, %d KB; mây %d KB' % (stats, os.path.getsize(dst) // 1024, os.path.getsize(dstc) // 1024))
    out['glb'] = rel(dst)
    out['stats'] = stats
    out['sky'] = sky_info(le)
    return out


def sky_info(le):
    s = child(le, 'Sky_Inner')
    r = comp(s, 'MeshRenderer').read()
    m = r.m_Materials[0].read()
    return {'material': m.m_Name, 'shader': m.m_Shader.read().m_ParsedForm.m_Name,
            'floats': {n: rnd(v, 3) for n, v in m.m_SavedProperties.m_Floats if not n.startswith('_Queue')},
            'note': 'Sky_Inner là quả cầu bọc trong, shader graph 3D_InnerSkybox_Fog tô bằng màu sương/ambient, '
                    'KHÔNG có ảnh. Dùng renderSettings.fogColor + lights; không vẽ ảnh trời thay thế.'}


def anim_sprites(animated, roots):
    """Sprite có Animator: dừa (PalmTree00x), mòng biển (Seagull00x trong SeaGullMove00x, cha có Animation
    legacy bay vòng). -> sheet art/boat/lobby_anim.png + vị trí đặt."""
    cache = {}
    for n in ('SeaGullMove001', 'SeaGullMove002', 'SeaGullMove003'):
        if n in roots:
            gull = level.transform_of(roots[n]).m_Children[0].read().m_GameObject.read()
            a = comp(gull, 'Animator')
            sr = comp(gull, 'SpriteRenderer').read()
            animated.append((gull, a, level.world(level.transform_of(gull), cache), sr))
    kinds = {}
    places = []
    for go, a, m, r in animated:
        ctrl, clips = controller_clips(a)
        if ctrl not in kinds:
            kinds[ctrl] = [decode_clip(o) for o in clips]
        sc = [rnd(np.linalg.norm(m[:3, i]), 3) for i in range(3)]
        pl = {'kind': ctrl, 'name': go.m_Name, 'pos': [rnd(v, 3) for v in m[:3, 3]], 'scale': sc,
              'flipX': bool(r.m_FlipX), 'order': r.m_SortingOrder}
        par = level.parent_go(go)
        if par is not None and par.m_Name.startswith('SeaGullMove'):
            la = comp(par, 'Animation')
            if la is not None:
                pl['pathAnim'] = [decode_clip(o, path_names(par)) for o in legacy_clips(la)]
        places.append(pl)
    # sheet: một dãy cho mỗi clip có sprite
    spr = {}
    for ctrl, clips in kinds.items():
        for d in clips:
            for _, n in d.get('sprites', []):
                if n:
                    spr[n] = None
    found = {n: SPRITES[n] for n in spr if n in SPRITES}
    missing = sorted(n for n in spr if n not in found)
    rows, anims = [], {}
    for ctrl, clips in kinds.items():
        for d in clips:
            names = []
            for _, n in d.get('sprites', []):
                if n and n in found and n not in names:
                    names.append(n)
            if not names:
                continue
            ims = [sprite_canvas(found[n])[0] for n in names]
            key = '%s/%s' % (ctrl, d['name'])
            rows.append((key, ims))
            s0 = found[names[0]]
            anims[key] = {'names': names, 'frames': timeline(d['sprites'], d['length'], names), 'loop': d['loop'],
                          'sampleRate': d['sampleRate'], 'length': d['length'],
                          'pivot': [rnd(s0.m_Pivot.x, 3), rnd(s0.m_Pivot.y, 3)], 'ppu': s0.m_PixelsToUnits}
    if not rows:
        return {'missing': missing, 'places': places}
    cell, rowmap = pack_rows(rows, os.path.join(BOAT, 'lobby_anim.png'))
    for k in anims:
        anims[k]['row'] = rowmap[k]
    return {'sheet': 'art/boat/lobby_anim.png', 'cell': cell, 'anims': anims, 'places': places,
            'kinds': {k: [d['name'] for d in v] for k, v in kinds.items()}, 'missing': missing}


# ---------------------------------------------------------------- 3. DAVE Ở SẢNH
def rip_dave():
    """Atlas 01_Default_Lobby_Atlas (sprite 64x64, pivot đáy giữa, 100 px/đv) + mọi clip trong
    Lobby_Characters/Dave/Animations. Ở scene nhân vật phóng ×3.4 (Character trong Lobby_Env/Boat)."""
    sprites = atlas_sprites(LOBBY_ATLAS)
    clips = sorted(k for k in rip.IDX if k.startswith(DAVE_CLIPS) and k.endswith('.anim'))
    env, _ = level.load_with_deps(clips[0])
    objs = {}
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k in clips and ptr.asset.type.name == 'AnimationClip':
                    objs[k] = ptr.asset.deref()
    decoded = []
    for p in clips:
        if p not in objs:
            print('  thiếu clip', p)
            continue
        d = decode_clip(objs[p])
        if d.get('sprites'):
            decoded.append(d)
    rows, anims = [], {}
    used = set()
    for d in decoded:
        names = []
        for _, n in d['sprites']:
            if n and n not in names:
                names.append(n)
        names = [n for n in names if n in sprites]
        if not names:
            continue
        used.update(names)
        rows.append((d['name'], [sprite_canvas(sprites[n])[0] for n in names]))
        anims[d['name']] = {'names': names, 'frames': timeline(d['sprites'], d['length'], names),
                            'loop': d['loop'], 'sampleRate': d['sampleRate'], 'length': d['length']}
    unused = sorted(n for n in sprites if n not in used)
    # khung không clip nào dùng (vd. WalkEnd, Ready_A*) vẫn đưa vào, mỗi tiền tố một dãy tĩnh
    extra = {}
    for n in unused:
        m = re.match(r'^(.*?)_?(\d+)$', n)
        extra.setdefault(m.group(1) if m else n, []).append(n)
    for pre, names in sorted(extra.items()):
        names.sort(key=lambda s: int(re.search(r'(\d+)$', s).group(1)) if re.search(r'(\d+)$', s) else 0)
        rows.append(('_' + pre, [sprite_canvas(sprites[n])[0] for n in names]))
        anims['_' + pre] = {'names': names, 'frames': None, 'loop': False, 'note': 'không clip nào trong Lobby_Characters/Dave dùng'}
    cell, rowmap = pack_rows(rows, os.path.join(BOAT, 'dave_lobby.png'))
    for k in anims:
        anims[k]['row'] = rowmap[k]
    s0 = sprites['Idle01']
    print('  Dave sảnh: %d dãy, ô %s' % (len(rows), cell))
    return {'sheet': 'art/boat/dave_lobby.png', 'cell': cell, 'ppu': s0.m_PixelsToUnits,
            'pivot': [rnd(s0.m_Pivot.x, 3), rnd(s0.m_Pivot.y, 3)], 'anims': anims}


# ---------------------------------------------------------------- 4. VFX (ParticleSystem -> công thức)
def mm(v):
    """MinMaxCurve -> số | [min,max] | {curve, mul} | {min,max,mul}."""
    s = v['minMaxState']
    ck = lambda c: [[rnd(k['time'], 3), rnd(k['value'], 4)] for k in c['m_Curve']]
    if s == 0:
        return rnd(v['scalar'])
    if s == 3:
        return [rnd(v['minScalar']), rnd(v['scalar'])]
    if s == 1:
        return {'curve': ck(v['maxCurve']), 'mul': rnd(v['scalar'])}
    return {'min': ck(v['minCurve']), 'max': ck(v['maxCurve']), 'mul': rnd(v['scalar'])}


def grad(g):
    cols = [[rnd(g['ctime%d' % i] / 65535, 3)] + level.rgb(g['key%d' % i]) for i in range(g['m_NumColorKeys'])]
    alph = [[rnd(g['atime%d' % i] / 65535, 3), rnd(g['key%d' % i]['a'], 3)] for i in range(g['m_NumAlphaKeys'])]
    return {'color': cols, 'alpha': alph}


def mmg(v):
    s = v['minMaxState']
    if s == 0:
        return [rnd(v['maxColor'][k], 3) for k in 'rgba']
    if s == 1:
        return {'gradient': grad(v['maxGradient'])}
    if s == 2:
        return {'random': [[rnd(v['minColor'][k], 3) for k in 'rgba'], [rnd(v['maxColor'][k], 3) for k in 'rgba']]}
    return {'randomGradient': [grad(v['minGradient']), grad(v['maxGradient'])]}


SHAPES = {0: 'sphere', 1: 'sphere', 2: 'hemisphere', 3: 'hemisphere', 4: 'cone', 5: 'box', 6: 'mesh', 7: 'cone',
          8: 'coneVolume', 10: 'circle', 11: 'circle', 12: 'edge', 13: 'skinnedMesh', 14: 'meshRenderer',
          15: 'boxShell', 16: 'boxEdge', 17: 'donut', 18: 'rectangle', 19: 'sprite', 20: 'spriteRenderer'}


def emitter(ps, psr, fxdir, texcache, root_inv, cache):
    tt = ps.read_typetree()
    go = ps.read().m_GameObject.read()
    im = tt['InitialModule']
    e = {'name': go.m_Name, 'active': bool(go.m_IsActive),
         'pos': [rnd(v, 3) for v in (root_inv @ level.world(level.transform_of(go), cache))[:3, 3]],
         'scale': rnd(np.linalg.norm((root_inv @ level.world(level.transform_of(go), cache))[:3, 0]), 3),
         'duration': rnd(tt['lengthInSec'], 3), 'loop': bool(tt['looping']), 'prewarm': bool(tt['prewarm']),
         'delay': mm(tt['startDelay']), 'space': ['local', 'world', 'custom'][tt['moveWithTransform']],
         'lifetime': mm(im['startLifetime']), 'speed': mm(im['startSpeed']), 'size': mm(im['startSize']),
         'rotation': mm(im['startRotation']), 'color': mmg(im['startColor']), 'gravity': mm(im['gravityModifier']),
         'maxParticles': im['maxNumParticles']}
    if im['size3D']:
        e['sizeY'] = mm(im['startSizeY'])
    em = tt['EmissionModule']
    if em['enabled']:
        e['rate'] = mm(em['rateOverTime'])
        rd = mm(em['rateOverDistance'])
        if rd:
            e['rateOverDistance'] = rd
        if em['m_Bursts']:
            e['bursts'] = [{'time': rnd(b['time'], 3), 'count': mm(b['countCurve']), 'cycles': b['cycleCount'],
                            'interval': rnd(b['repeatInterval'], 3)} for b in em['m_Bursts']]
    sh = tt['ShapeModule']
    if sh['enabled']:
        e['shape'] = {'type': SHAPES.get(sh['type'], sh['type']), 'radius': rnd(sh['radius']['value'], 3),
                      'angle': rnd(sh['angle'], 2), 'arc': rnd(sh['arc']['value'], 1),
                      'scale': [rnd(sh['m_Scale'][k], 3) for k in 'xyz'], 'pos': [rnd(sh['m_Position'][k], 3) for k in 'xyz'],
                      'rot': [rnd(sh['m_Rotation'][k], 2) for k in 'xyz'], 'thickness': rnd(sh['radiusThickness'], 3)}
    for key, name in (('SizeModule', 'sizeOverLife'), ('RotationModule', 'rotOverLife')):
        md = tt[key]
        if md['enabled']:
            e[name] = mm(md['curve'])
    if tt['ColorModule']['enabled']:
        e['colorOverLife'] = mmg(tt['ColorModule']['gradient'])
    vm = tt['VelocityModule']
    if vm['enabled']:
        e['velocity'] = {'x': mm(vm['x']), 'y': mm(vm['y']), 'z': mm(vm['z']), 'world': bool(vm['inWorldSpace'])}
    fm = tt['ForceModule']
    if fm['enabled']:
        e['force'] = {'x': mm(fm['x']), 'y': mm(fm['y']), 'z': mm(fm['z']), 'world': bool(fm['inWorldSpace'])}
    uv = tt['UVModule']
    if uv['enabled']:
        e['sheet'] = {'cols': uv['tilesX'], 'rows': uv['tilesY'], 'frameOverTime': mm(uv['frameOverTime']),
                      'startFrame': mm(uv['startFrame']), 'cycles': rnd(uv['cycles'], 3),
                      'type': 'wholeSheet' if uv['animationType'] == 0 else 'singleRow', 'row': uv['rowIndex']}
    if tt['NoiseModule']['enabled']:
        e['noise'] = {'strength': mm(tt['NoiseModule']['strength']), 'frequency': rnd(tt['NoiseModule']['frequency'], 3)}
    if tt['TrailModule']['enabled']:
        e['trail'] = {'lifetime': mm(tt['TrailModule']['lifetime'])}
    if tt['SubModule']['enabled']:
        e['subEmitters'] = len(tt['SubModule']['subEmitters'])
    if psr is not None:
        rt = psr.read_typetree()
        r = psr.read()
        e['render'] = {'enabled': bool(rt['m_Enabled']),
                       'mode': ['billboard', 'stretch', 'horizontal', 'vertical', 'mesh', 'none'][min(rt['m_RenderMode'], 5)],
                       'lengthScale': rnd(rt['m_LengthScale'], 3), 'velocityScale': rnd(rt['m_VelocityScale'], 3),
                       'order': rt['m_SortingOrder'], 'maxSize': rnd(rt['m_MaxParticleSize'], 3)}
        mats = [x for x in r.m_Materials if x.m_PathID]
        if mats:
            mt = mats[0].read()
            sp = mt.m_SavedProperties
            try:
                shader = mt.m_Shader.read().m_ParsedForm.m_Name
            except Exception:
                shader = '?'
            F = {n: v for n, v in sp.m_Floats}
            C = {n: c for n, c in sp.m_Colors}
            e['material'] = mt.m_Name
            e['shader'] = shader
            src, dst = F.get('_SrcBlend', F.get('_SrcBlendMode')), F.get('_DstBlend', F.get('_DstBlendMode'))
            if src is not None and dst is not None:
                e['blend'] = 'additive' if int(dst) == 1 else ('alpha' if int(dst) == 10 else '%d/%d' % (src, dst))
            for cn in ('_TintColor', '_BaseColor', '_Color', '_MainColor'):
                if cn in C:
                    e['tint'] = [rnd(v, 3) for v in (C[cn].r, C[cn].g, C[cn].b, C[cn].a)]
                    break
            texs = [(n, en) for n, en in sp.m_TexEnvs if en.m_Texture.m_PathID]
            texs.sort(key=lambda x: (x[0] not in ('_MainTex', '_BaseMap'), x[0]))
            for n, en in texs[:1]:
                try:
                    t = en.m_Texture.read()
                    key = (t.assets_file.name, t.object_reader.path_id)
                    if key not in texcache:
                        img = t.image.convert('RGBA')
                        if max(img.size) > 512:
                            k = 512 / max(img.size)
                            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
                        texcache[key] = save(img, os.path.join(fxdir, t.m_Name + '.png'))
                    e['img'] = texcache[key]
                    e['texProp'] = n
                except Exception as ex:
                    e['imgError'] = str(ex)[:80]
            if rt['m_RenderMode'] == 4:
                try:
                    e['render']['mesh'] = r.m_Mesh.read().m_Name
                except Exception:
                    pass
    return e


def vfx_recipe(path, fxdir, texcache):
    """Prefab VFX -> {emitters:[...]} (vị trí tương đối gốc prefab, hệ Unity)."""
    env, _ = level.load_with_deps(path)
    root = level.prefab_root(env, path)
    cache = {}
    W = level.world(level.transform_of(root), cache)
    if abs(np.linalg.det(W[:3, :3])) > 1e-9:
        inv = np.linalg.inv(W)
    else:  # vài prefab (BloodHitGun…) để scale gốc = 0: chỉ trừ vị trí
        inv = np.eye(4)
        inv[:3, 3] = -W[:3, 3]
    ems = []
    stack = [root]
    while stack:
        go = stack.pop()
        stack.extend(ch.read().m_GameObject.read() for ch in reversed(level.transform_of(go).m_Children))
        ps, psr = comp(go, 'ParticleSystem'), comp(go, 'ParticleSystemRenderer')
        if ps is not None:
            ems.append(emitter(ps, psr, fxdir, texcache, inv, cache))
    return {'src': path.replace(PC, ''), 'emitters': ems}


BOAT_VFX = {
    'boatIdle': VFXP + 'Env_Effect/VFX_Dave_Boat_WaterWave_Afternoon_Idle_A_01.prefab',
    'boatExit': VFXP + 'Env_Effect/VFX_Dave_Boat_WaterWave_Afternoon_Exit_A_01.prefab',
    'boatIdleEvening': VFXP + 'Env_Effect/VFX_Dave_Boat_WaterWave_Evening_Idle_A_01.prefab',
    'boatExitEvening': VFXP + 'Env_Effect/VFX_Dave_Boat_WaterWave_Evening_Exit_A_01.prefab',
    'seaAfternoon': VFXP + 'Env_Effect/VFX_Lobby_Afternoon_Ray_A_01.prefab',
    'diveBubble': VFXP + 'DiveBubble.prefab',
    'upgradeBG': VFXP + 'fUI_Effect/VFX_UI_iDiver_Upgrade_BG_A_01.prefab',
    'upgradeLv': VFXP + 'fUI_Effect/VFX_UI_iDiver_Upgrade_Lv_A_01.prefab',
    'upgradeSlot': VFXP + 'fUI_Effect/VFX_UI_iDiver_Upgrade_Slot_A_01.prefab',
    'upgradeSlotB': VFXP + 'fUI_Effect/VFX_UI_iDiver_Upgrade_Slot_B_01.prefab',
    'upgradeTitle': VFXP + 'fUI_Effect/VFX_UI_iDiver_Upgrade_Title_A_01.prefab',
}
GUN_VFX = {
    'gunShotBubble': VFXP + 'PlayerInternal/GunShotBubble.prefab',
    'bulletBubble': VFXP + 'Character_Effect/VFX_Bullet_Bubble_A_01.prefab',
    'hitGun': VFXP + 'Blood/BloodHitGun.prefab',
    'netWrap': VFXP + 'Character_Effect/E_Net_Wrap_Prefab.prefab',
    'netTrap': VFXP + 'Item_Effect/VFX_Item_Nettrap_A_01.prefab',
    'netRip': VFXP + 'Item_Effect/VFX_Item_Nettrap_Rip_A_01.prefab',
    'sleepHead': VFXP + 'Character_Effect/VFX_Debuff_Sleep_Head_01.prefab',
    'tranqBody': VFXP + 'Character_Effect/VFX_Debuff_Tranquilize_Body_01.prefab',
    'sleepVolley': VFXP + 'Item_Effect/VFX_Gun_Sleep_Volleyjet_A_01.prefab',
    'explosion': VFXP + 'Env_Effect/VFX_Explosion_UnderWater_Pixel_A_01.prefab',
    'explosionWeak': VFXP + 'Env_Effect/VFX_Explosion_UnderWater_Pixel_Weak_A_01.prefab',
    'bulletBox': VFXP + 'Item_Effect/VFX_Item_BulletBox_A_01.prefab',
    'gunKit': VFXP + 'Item_Effect/VFX_Item_Gun_Kit_A_01.prefab',
}


def rip_vfx():
    out = {}
    for k, p in BOAT_VFX.items():
        out[k] = vfx_recipe(p, FXDIR, FXTC)
        print('  vfx %-16s %d emitter' % (k, len(out[k]['emitters'])))
    gout = {}
    for k, p in GUN_VFX.items():
        gout[k] = vfx_recipe(p, FXDIR, FXTC)
        print('  vfx %-16s %d emitter' % (k, len(gout[k]['emitters'])))
    return out, gout


# ---------------------------------------------------------------- 5. SÚNG + TRANG BỊ
def load_sheet(name):
    ta = [o for o in rip.objects_for(SHEET + name) if type(o).__name__ == 'TextAsset'][0]
    parts = rip.text_bytes(ta).decode('utf-8-sig').split('@/')
    return {parts[i].strip(): json.loads(parts[i + 1]) for i in range(0, len(parts) - 1, 2)}


def gun_specs():
    """GunSpecData_* (ScriptableObject, không có địa chỉ riêng trong m_Container): tìm bundle có chuỗi
    b'GunSpecData_' trong byte thô rồi đọc mọi MonoBehaviour có _TID + _GunType.
    Bẫy: bundle nén LZ4 theo khối, nên chuỗi dài hơn (vd. 'GunSpecData_Normal_') bị cắt ngang khối và
    KHÔNG tìm thấy dù có. Đo 2026-09-24: 3 bundle khớp, 7f643c5d… (80 KB) chứa 458 bản của Dave."""
    p = os.path.join(CACHE, 'gunspecs.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    out = {}
    cands = set()
    for b in sorted(os.listdir(rip.BUNDLES)):
        with open(os.path.join(rip.BUNDLES, b), 'rb') as fh:
            if b'GunSpecData_' in fh.read():
                cands.add(b)
    for b in sorted(cands):
        env = UnityPy.load(os.path.join(rip.BUNDLES, b))
        for o in env.objects:
            if o.type.name == 'MonoBehaviour':
                try:
                    tt = o.read_typetree()
                except Exception:
                    continue
                if '_TID' in tt and '_GunType' in tt:
                    tt.pop('serializationData', None)
                    out[tt['m_Name']] = tt
    if not out:
        raise SystemExit('không thấy GunSpecData nào trong bundle')
    json.dump(out, open(p, 'w', encoding='utf-8'), default=str)
    return out


# id súng -> (tiền tố GunSpecData, TID lv1, tên VN [ĐỀ XUẤT], cách chơi theo số gốc)
GUNS = [
    ('rifle', 'GunSpecData_Normal_UnderwaterRifle_Lv', 3010001, 'Súng trường nước', 'một viên thẳng, 8 viên/băng'),
    ('shotgun', 'GunSpecData_Normal_TripleAxel_Lv', 3010011, 'Súng hoa cải', '3 viên toả (MuzzleCount 3, góc ±20°), tầm 3'),
    ('sniper', 'GunSpecData_Normal_RedSniper_Lv', 3010021, 'Súng bắn tỉa', 'đạn xuyên (PierceBullet), tầm 20, 3 viên'),
    ('sleep', 'GunSpecData_Normal_SleepGun_Lv', 3010031, 'Súng gây mê', 'sát thương 0, buff ngủ (BuffIDs), 3 viên'),
    ('net', 'GunSpecData_Normal_NetGun_Lv', 3010061, 'Súng lưới', 'sát thương 0, lưới bắt cá cỡ ≤ CaptrueSize, tối đa CaptureCount con'),
    ('grenade', 'GunSpecData_Normal_GrenadeLauncher_Lv', 3010051, 'Súng phóng lựu', 'đạn cầu vồng (GunAimType 1), nổ bán kính 2'),
]
GUN_SFX = {  # [DtD] tên clip; ghép clip với súng là [ĐỀ XUẤT] theo tên (bảng âm thanh gốc nằm trong code IL2CPP)
    'rifle': {'shot': 'sound_shoot_UnderwaterRifle_01', 'hit': 'sound_hit_UnderwaterRifle_01'},
    'shotgun': {'shot': 'sound_shoot_quatro_gun', 'hit': 'sound_hit_UnderwaterRifle_01'},
    'sniper': {'shot': 'sound_shoot_sniper_rifle', 'hit': 'sound_hit_RedSniper_01', 'aim': 'sound_loop_sniper'},
    'sleep': {'shot': 'sound_shoot_anesthesia_gun', 'hit': 'sound_hit_Sleep_UnderwaterRifle_01'},
    'net': {'shot': 'sound_shoot_net_gun', 'hit': 'sound_hit_net_gun', 'collect': 'sound_item_net_gun_collect_01'},
    'grenade': {'shot': 'sound_shoot_grenade_launcher', 'hit': 'sound_hit_GrenadeLaunder_01'},
}
SPEC_KEYS = ['Damage', 'AmmoCount', 'BurstCount', 'BurstTerm', 'Power', 'Distance', 'MuzzleCount', 'GunAimType',
             'BarrelOfGun', 'DistanceFromCenterAim', 'TrajectoryGap', 'TrajectoryCount', 'MinAimAngle', 'MaxAimAngle',
             'ExplosionSplashDamage', 'ExposionRadius', 'ExposionSustainTime', 'NetCaptureLevel', 'NetStrength',
             'CaptrueSize', 'CaptureCount', 'NetRefundRate', 'RecoilForce', 'RecoilTime', 'BuffIDs', 'GunType']


def prefab_sprites(path):
    """[(tên GameObject, Sprite, SpriteRenderer, ma trận tương đối gốc)] của một prefab."""
    env, _ = level.load_with_deps(path)
    root = level.prefab_root(env, path)
    cache = {}
    W = level.world(level.transform_of(root), cache)
    inv = np.eye(4)
    inv[:3, 3] = -W[:3, 3]
    if abs(np.linalg.det(W[:3, :3])) > 1e-9:
        inv = np.linalg.inv(W)
    out = []
    for c in level.prefab_objects(env, path):
        if c.type.name == 'SpriteRenderer':
            r = c.read()
            if r.m_Sprite.m_PathID:
                go = r.m_GameObject.read()
                out.append((go.m_Name, r.m_Sprite.read(), r, inv @ level.world(level.transform_of(go), cache)))
    return out


def rip_gear(gvfx):
    """Icon + súng cầm tay + đạn + bảng số. -> (manifest guns/gearIcons, gear_sheet)."""
    eqs = load_sheet('DR_GameData_Equipment.json')
    const = load_sheet('DR_GameData_ConstValues.json')['GameConstValue']
    items = {e['TID']: e for e in eqs['EquipmentItem']}
    craft = {c['ProductItemID']: c for c in eqs['Craft']}
    specs = gun_specs()
    gm = guid_map()
    # icon ở các atlas
    need_common = set()
    need_ingame = set()
    for gid, pre, tid, *_ in GUNS:
        need_common.add(items[tid]['ItemUIIcon'])
        need_ingame.add(items[tid]['ItemIcon'])
    icons_common = atlas_sprites(PC + 'Common/Sprites/0_SpriteAtlas/CommonAtlas_Point.spriteatlas', need_common | {
        'OldHarpoonGun_Thumbnail', 'HarpoonGun_Thumbnail', 'PumpHarpoonGun_Thumbnail', 'MermanHarpoonGun_Thumbnail',
        'NewMVHarpoonGun_Thumbnail', 'AlloyHarpoonGun_Thumbnail', 'BasicDagger_Thumbnail', 'Ammo_Thumbnail',
        'AmmoPack_Thumbnail', 'SubO2Tank_Thumbnail'})
    icons_ingame = atlas_sprites(PC + 'Ingame/00_InGame_Common/Sprites/0_SpriteAtlas/InGameAtlas_Point.spriteatlas',
                                 need_ingame | {'Item_Ammo', 'Item_AmmoPack', 'Item_SubO2Tank'})
    icons_bil = atlas_sprites(PC + 'Common/Sprites/0_SpriteAtlas/CommonAtlas_Bilinear.spriteatlas',
                              {'Coin16', 'Coin20', 'Coin24', 'Coin32', 'Coin_Reward_64', 'CoinOutline_20',
                               'Bei16', 'Bei24', 'Bei32', 'Bei_Icon_s', 'Bei_Reward_64'})
    phone = atlas_sprites(PC + 'Phone/Phone_Common/Sprites/0_SpriteAtlas/PhoneAtlas_Bilinear.spriteatlas',
                          lambda n: n.startswith('iDiver') or n == 'AppIcon_iDiver')

    def put(spr, sub):
        img, piv = sprite_canvas(spr)
        return save(img, os.path.join(GEAR, sub, spr.m_Name + '.png'))
    ic = {}
    for n, s in sorted(phone.items()):
        ic[n] = put(s, 'idiver')
    for n, s in sorted(icons_bil.items()):
        ic[n] = put(s, 'ui')
    for n, s in sorted(icons_common.items()):
        ic[n] = put(s, 'icon')
    for n, s in sorted(icons_ingame.items()):
        ic[n] = put(s, 'icon')
    # nền iDiver (ảnh rời)
    try:
        bg = rip.image_of(PC + 'Phone/Phone_iDiver/Sprites/NonPacked/iDiver_BG.png')
        ic['iDiver_BG'] = save(bg, os.path.join(GEAR, 'idiver', 'iDiver_BG.png'))
    except Exception as e:
        print('  thiếu iDiver_BG', e)
    gear_icons = {'o2': ic.get('iDiver_Icon_Tank'), 'cargo': ic.get('iDiver_Icon_InvenBox'), 'suit': ic.get('iDiver_Icon_Suit'),
                  'suitLv2': ic.get('iDiver_Icon_Suit_Lv2'), 'knife': ic.get('iDiver_Icon_Dagger'),
                  'harpoon': ic.get('iDiver_Icon_OldHarpoonGun'), 'drone': ic.get('iDiver_Icon_Drone'),
                  'crabTrap': ic.get('iDiver_Icon_CrabTrap'), 'engine': None,
                  'coin': ic.get('Coin32'), 'coinBig': ic.get('Coin_Reward_64'), 'bei': ic.get('Bei32'),
                  'appIcon': ic.get('AppIcon_iDiver'),
                  'harpoonByLevel': [ic.get('iDiver_Icon_%s' % n) for n in ('OldHarpoonGun', 'HarpoonGun', 'PumpHarpoonGun',
                                                                           'MermanHarpoonGun', 'NewMVHarpoonGun', 'AlloyHarpoonGun')],
                  'idiverUI': {k: v for k, v in ic.items() if k.startswith('iDiver_') and 'Icon' not in k},
                  'ammo': ic.get('Item_Ammo'), 'ammoPack': ic.get('Item_AmmoPack')}
    # tay Dave cầm súng (atlas trong game)
    arms = atlas_sprites(DAVE_ATLAS, {'AttackReadyArms', 'AttackReadyArms_Pistol', 'AttackReadyRightArm'})
    arm_out = {}
    for n, s in arms.items():
        img, piv = sprite_canvas(s)
        arm_out[n] = {'img': save(img, os.path.join(GEAR, 'arms', n + '.png')), 'pivot': list(piv), 'ppu': s.m_PixelsToUnits,
                      'size': list(img.size)}
    # súng
    guns, sheet_guns = {}, {}
    for gid, pre, tid, vn, play in GUNS:
        lv = [specs['%s%d' % (pre, i)] for i in range(1, 6) if '%s%d' % (pre, i) in specs]
        s1 = lv[0]
        held_p = gm.get(s1['EquipObjectReference']['m_AssetGUID'], [None])[0]
        bullet_p = gm.get(s1['bulletReference']['m_AssetGUID'], [None])[0]
        held = {}
        if held_p:
            for goname, sp, r, M in prefab_sprites(held_p):
                img, piv = sprite_canvas(sp)
                held = {'img': save(img, os.path.join(GEAR, 'gun', sp.m_Name + '.png')), 'pivot': list(piv),
                        'ppu': sp.m_PixelsToUnits, 'size': list(img.size), 'prefab': held_p.replace(PC, '')}
                break
        proj = {}
        if bullet_p:
            for goname, sp, r, M in prefab_sprites(bullet_p):
                img, piv = sprite_canvas(sp)
                proj = {'img': save(img, os.path.join(GEAR, 'bullet', sp.m_Name + '.png')), 'pivot': list(piv),
                        'ppu': sp.m_PixelsToUnits, 'size': list(img.size), 'scale': rnd(np.linalg.norm(M[:3, 0]), 3),
                        'prefab': bullet_p.replace(PC, '')}
                break
            proj['trail'] = vfx_recipe(bullet_p, FXDIR, FXTC)
        it = items[tid]
        cr = craft.get(tid, {})
        guns[gid] = {
            'name': vn, 'nameKey': it['ItemTextID'], 'tid': tid, 'play': play,
            'icon': ic.get(it['ItemIcon']), 'thumb': ic.get(it['ItemUIIcon']),
            'held': held, 'projectile': proj,
            'muzzle': 'gunShotBubble', 'impact': {'net': 'netTrap', 'sleep': 'sleepHead', 'grenade': 'explosion'}.get(gid, 'hitGun'),
            'sfx': {k: 'audio/gun_%s_%s.mp3' % (gid, k) for k in GUN_SFX[gid]},
        }
        guns[gid]['sfx']['reload'] = 'audio/gun_reload.mp3'
        guns[gid]['sfx']['empty'] = 'audio/gun_empty.mp3'
        sheet_guns[gid] = {
            'tid': tid, 'nameKey': it['ItemTextID'], 'specName': s1['_Name'],
            'craftPrice': cr.get('Price'), 'craftItems': list(zip(cr.get('RequireItemIDsList', []), cr.get('RequireItemCountsList', []))),
            'sellPrice': it['ItemSellPrice'],
            'levels': [dict({'lv': i + 1, 'tid': s['_TID']}, **{k[0].lower() + k[1:]: (rnd(s['_' + k], 4) if isinstance(s['_' + k], float) else s['_' + k])
                                                               for k in SPEC_KEYS}) for i, s in enumerate(lv)],
            'sheetRow': {'WeaponDamage': it['WeaponDamage'], 'WeaponDistance': it['WeaponDistance'], 'WeaponAmmoCount': it['WeaponAmmoCount']},
        }
        print('  súng %-8s dmg %s ammo %s tầm %s cầm=%s đạn=%s' % (gid, [l['damage'] for l in sheet_guns[gid]['levels']],
                                                                  s1['_AmmoCount'], s1['_Distance'], bool(held), bool(proj.get('img'))))
    # trang bị (SubEquipment)
    kinds = {1: 'o2', 2: 'suit', 3: 'cargo', 4: 'harpoon', 5: 'drone', 6: 'knife', 7: 'crabTrap'}
    gear = {}
    for s in eqs['SubEquipment']:
        k = kinds.get(s['SubEquipmentType'])
        if not k or s['TID'] >= 3060800:  # 30608xx/30609xx = đồ DLC rừng (Jungle)
            continue
        row = {'lv': s['SubEquipmentLevel'], 'tid': s['TID'], 'price': s['Price'], 'icon': s['UIIcon']}
        if k == 'o2':
            row['maxO2'] = s['MaxHP']
        elif k == 'suit':
            row['maxDepth'] = s['MaxDepthWater']
        elif k == 'cargo':
            row['weight'] = s['LootboxWeight']
            row['overweight'] = s['OverwightThreshold']
        elif k in ('harpoon', 'knife'):
            e = items.get(s['EquipmentItemID'], {})
            row['damage'] = e.get('WeaponDamage')
            row['item'] = e.get('ItemTextID')
        elif k == 'drone':
            row['drones'] = s['DroneCount']
        elif k == 'crabTrap':
            row['traps'] = s['TrapCount']
        gear.setdefault(k, []).append(row)
    for k in gear:
        gear[k].sort(key=lambda r: r['lv'])
    cst = {k: const[k] for k in ('start_o2tank_id', 'start_diving_suit_id', 'start_inventory_id', 'start_harpoon_id',
                                 'start_melee_id', 'Max_Limit_Depth', 'Nomal_Depth_Damage', 'Danger_Depth_Damage',
                                 'Limit_Depth_Damage', 'SubWeaponMaxPower', 'SubWeaponMaxDistance', 'SubWeaponMaxAmmo',
                                 'Warning_Oxygen_MaxValue', 'Urgent_Warning_Oxygen_MaxValue', 'depth_warning_notify',
                                 'Start_Gold', 'default_boat_deco_id') if k in const}
    sheet = {'gear': gear, 'guns': sheet_guns, 'const': cst,
             'boatUpgrade': None,
             'boatUpgradeNote': 'DtD KHÔNG có bảng nâng cấp cano/động cơ. Bảng BoatDeco (DR_GameData_Item) chỉ là 30 '
                                'mẫu sơn thân thuyền (Boat_001..013, SeaBlue…), không có số tốc độ hay giá.'}
    return {'guns': guns, 'gearIcons': gear_icons, 'arms': arm_out, 'icons': ic}, sheet


# ---------------------------------------------------------------- 6. TIẾNG
AUDIO = {
    # key: (clip, kiểu, ghi chú). kiểu: loop = cắt đúng cả clip (không cắt lặng), music = 96k stereo
    'boat_move': ('lobby_boat_move', 'sfx', '[DtD] cano của Dave chạy ở sảnh (Lobby/lobby_boat_move)'),
    'boat_engine_loop': ('SFX_Dredge_Boat_Loop_01', 'loop', '[DtD, DLC Dredge] vòng lặp máy thuyền; cano Dave KHÔNG có clip máy lặp riêng'),
    'boat_engine_start': ('sound_pirateboat_engine_start_01', 'sfx', '[DtD] nổ máy (thuyền hải tặc)'),
    'boat_engine_idle': ('sound_pirateboat_engine_idle_01', 'loop', '[DtD] máy nổ không tải (thuyền hải tặc)'),
    'boat_drive': ('SFX_Dredge_Boat_Drive_01', 'sfx', '[DtD, DLC Dredge] thuyền tăng ga'),
    'boat_amb_day': ('amb_lobby_Afternoon', 'loop', '[DtD] nền biển sảnh buổi chiều'),
    'boat_amb_morning': ('amb_lobby_Morning', 'loop', '[DtD] nền biển sảnh buổi sáng'),
    'boat_amb_loop': ('amb_lobby_loop', 'loop', '[DtD] sóng vỗ sảnh'),
    'boat_amb_shore': ('amb_OceanShore_01', 'loop', '[DtD] sóng bờ'),
    'boat_seagull': ('amb_lobby_far_bird', 'loop', '[DtD] chim biển xa'),
    'boat_splash': ('sound_Splash_Small_01', 'sfx', '[DtD] tõm nước nhỏ'),
    'boat_dive': ('ui_lobby_dive_01', 'sfx', '[DtD] tiếng bấm lặn ở sảnh'),
    'boat_foot': ('lobby_dave_foot_01', 'sfx', '[DtD] bước chân Dave trên boong'),
    'boat_bgm_lobby': ('BGM_Lobby', 'music', '[DtD] nhạc sảnh'),
    'gun_reload': ('sound_item_bullet_refill', 'sfx', '[DtD] nhặt/nạp đạn; KHÔNG có clip nạp đạn riêng của súng phụ'),
    'gun_empty': ('sound_item_bullet_pickup_fail_01', 'sfx', '[DtD] nhặt đạn hỏng (đầy); dùng cho hết đạn là [ĐỀ XUẤT]'),
    'gun_upgrade': ('sound_item_gun_upgrade', 'sfx', '[DtD] nâng súng'),
    'ui_click': ('ui_button_click', 'sfx', '[DtD]'),
    'ui_open': ('ui_button_click_open_01', 'sfx', '[DtD]'),
    'ui_close': ('ui_button_click_close_01', 'sfx', '[DtD]'),
    'ui_buy': ('ui_lobby_cobra_buy', 'sfx', '[DtD] mua ở cửa hàng Cobra'),
    'ui_upgrade_gauge': ('ui_upgrade_gage_01', 'sfx', '[DtD] thanh nâng cấp tăng'),
    'ui_levelup': ('ui_lobby_levelup_01', 'sfx', '[DtD] lên cấp ở sảnh'),
    'ui_fail': ('ui_downgrade_gage_01', 'sfx', '[DtD] thanh tụt; dùng cho "không đủ tiền" là [ĐỀ XUẤT]'),
    'ui_attention': ('ui_ingame_attention', 'sfx', '[DtD] cảnh báo'),
    'ui_coin': ('ui_ingame_coin_appear', 'sfx', '[DtD] xu hiện'),
    'ui_slot': ('ui_Slot_Change_01', 'sfx', '[DtD] đổi ô (chọn súng)'),
    'ui_app': ('ui_app_click_01', 'sfx', '[DtD] bấm ứng dụng điện thoại (iDiver)'),
}
for _g, _d in GUN_SFX.items():
    for _k, _c in _d.items():
        AUDIO['gun_%s_%s' % (_g, _k)] = (_c, 'loop' if _k == 'aim' else 'sfx', '[DtD] clip; ghép với súng %s là [ĐỀ XUẤT] theo tên' % _g)


def rip_audio():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    os.makedirs(AUD, exist_ok=True)
    for f in os.listdir(AUD):
        if re.match(r'^(boat|gun|ui)_.*\.mp3$', f):
            os.remove(os.path.join(AUD, f))
    out = {}
    for key, (clip, kind, note) in AUDIO.items():
        try:
            path = rip.find_path(clip + '.wav')
        except KeyError:
            print('  thiếu tiếng', clip)
            continue
        ac = [o for o in rip.objects_for(path) if type(o).__name__ == 'AudioClip' and o.m_Name == clip]
        if not ac:
            print('  thiếu tiếng', clip)
            continue
        wav = list(ac[0].samples.values())[0]
        tmp = os.path.join(CACHE, 'b_' + key + '.wav')
        open(tmp, 'wb').write(wav)
        dst = os.path.join(AUD, key + '.mp3')
        af = []
        if kind == 'sfx':  # cắt lặng hai đầu
            af = ['-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                         'silenceremove=start_periods=1:start_threshold=-50dB,areverse']
        rate = ['-ac', '1', '-b:a', '96k']
        probe = lambda f: float(subprocess.run([shutil.which('ffprobe') or 'ffprobe', '-v', 'error', '-show_entries',
                                                'format=duration', '-of', 'default=nw=1:nk=1', f],
                                               capture_output=True, text=True).stdout.strip() or 0)
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp] + af + ['-codec:a', 'libmp3lame'] + rate + [dst], check=True)
        dur = probe(dst)
        if af and dur < max(0.05, 0.3 * probe(tmp)):
            # bẫy: tiếng bấm rất nhỏ (ui_app_click_01) dưới -50 dB, silenceremove xoá sạch -> mã lại không cắt
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame'] + rate + [dst], check=True)
            dur = probe(dst)
        out[key] = {'src': 'audio/%s.mp3' % key, 'clip': clip, 'kind': kind, 'sec': round(dur, 2), 'note': note,
                    'kb': os.path.getsize(dst) // 1024}
        print('  %-26s %-40s %5.1fs %4d KB' % (key, clip, dur, out[key]['kb']))
    return out


# ---------------------------------------------------------------- MAIN
def write_js(path, var, obj, header):
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(header)
        fh.write('window.%s = {\n' % var)
        # hai tầng đầu xuống dòng cho dễ đọc, phần trong viết liền cho khỏi dài hàng nghìn dòng
        rows = []
        for k, v in obj.items():
            if isinstance(v, dict):
                inner = ',\n'.join('  %s: %s' % (json.dumps(k2, ensure_ascii=False),
                                                 json.dumps(v2, ensure_ascii=False, separators=(',', ':')))
                                   for k2, v2 in v.items())
                rows.append(' %s: {\n%s\n }' % (json.dumps(k, ensure_ascii=False), inner))
            else:
                rows.append(' %s: %s' % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False, separators=(',', ':'))))
        fh.write(',\n'.join(rows))
        fh.write('\n};\n')


def main():
    parts = sys.argv[1:] or ['boat', 'sea', 'dave', 'vfx', 'gear', 'audio']
    man_p = os.path.join(DATA, 'boat_assets.js')
    man = {}
    if os.path.exists(man_p):
        src = io.open(man_p, encoding='utf-8').read()
        man = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    if set(parts) >= {'boat', 'sea', 'dave', 'vfx'}:
        shutil.rmtree(BOAT, ignore_errors=True)
    if 'gear' in parts and 'vfx' in parts:
        shutil.rmtree(GEAR, ignore_errors=True)
    os.makedirs(BOAT, exist_ok=True)
    if 'boat' in parts:
        print('Cano…')
        man['boat'] = rip_boat()
    if 'sea' in parts:
        print('Biển sảnh…')
        man['sea'] = rip_sea()
    if 'dave' in parts:
        print('Dave ở sảnh…')
        man['dave'] = rip_dave()
    if 'vfx' in parts:
        print('VFX…')
        man['vfx'], man['gunVfx'] = rip_vfx()
    if 'gear' in parts:
        print('Súng + trang bị…')
        g, sheet = rip_gear(man.get('gunVfx'))
        man['guns'], man['gearIcons'], man['arms'] = g['guns'], g['gearIcons'], g['arms']
        write_js(os.path.join(DATA, 'gear_sheet.js'), 'HX_GEAR_SHEET', sheet, GEAR_HEADER)
    if 'audio' in parts:
        print('Tiếng…')
        man['audio'] = rip_audio()
    man['_about'] = ABOUT
    write_js(man_p, 'HX_BOAT_ASSETS', man, MAN_HEADER)
    print('xong ->', man_p)


ABOUT = {
    'units': 'Đơn vị Unity (1 = 100 px sprite). glb đã đổi z -> -z như level.py; mọi toạ độ trong manifest là hệ Unity '
             '(x phải, y lên, z vào màn hình) trừ khi ghi khác.',
    'boat': '[ĐO TRONG REPO] boat.glb gốc = gốc prefab LobbyBoat_Day, ngay mặt nước (va chạm "floor" y=+0.07). '
            'Mũi cano hướng -x (Unity) = -x (glTF); đuôi +x (bọt Back/Booster ở x≈+2.3..+6). Thân dài dọc trục x.',
    'dave': 'frames = [[cột, giây]] theo đúng khoá sprite của AnimationClip gốc; sampleRate là m_SampleRate của clip.',
    'vfx': 'Công thức ParticleSystem gốc (lifetime/speed/size/rate/bursts/shape/sheet...). Số: một số = hằng, '
           '[a,b] = ngẫu nhiên giữa hai hằng, {curve, mul} = đường cong [t, v] nhân mul. sheet.cols/rows = lưới ảnh.',
}
MAN_HEADER = ('// Sinh bởi tools/rip_boat.py — đừng sửa tay.\n'
              '// Mọi số [DtD] đọc thẳng từ bản cài Steam Dave the Diver (prefab/clip/ParticleSystem/material).\n'
              '// Chỗ ghép tiếng với súng theo tên là [ĐỀ XUẤT]; xem "note" từng mục.\n')
GEAR_HEADER = ('// Sinh bởi tools/rip_boat.py — đừng sửa tay.\n'
               '// [DtD] GameDataSheet/DR_GameData_Equipment.json: SubEquipment (O2, đồ lặn, túi, súng xiên, dao, drone, bẫy cua),\n'
               '//        EquipmentItem (sát thương dao/xiên), Craft (giá chế súng ở Duff).\n'
               '// [DtD] GunSpecData_Normal_*_Lv1..5 (ScriptableObject): số súng phụ theo cấp.\n'
               '// [DtD] DR_GameData_ConstValues.json: hằng số (độ sâu, đạn tối đa...).\n'
               '// price = [a, b] y như bảng gốc. a là vàng; b CHƯA ĐO được là gì (bảng không ghi tên cột thứ hai).\n'
               '// gear.harpoon/knife: damage lấy từ EquipmentItem.WeaponDamage của EquipmentItemID.\n'
               '// guns.*.levels: damage/ammoCount/distance/muzzleCount/... = trường _X của GunSpecData;\n'
               '//   BurstTerm (giây giữa các viên trong một loạt) là số gần nhất với "tốc độ bắn": bảng KHÔNG có tốc độ bắn riêng.\n'
               '//   BuffIDs của súng gây mê trỏ tới buff ngủ; thời lượng buff KHÔNG có trong bảng dữ liệu.\n')

if __name__ == '__main__':
    main()
