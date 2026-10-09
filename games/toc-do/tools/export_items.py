#!/usr/bin/env python3
"""Xuất đạo cụ của Zing Speed Mobile cho Tốc Độ (chế độ Đạo Cụ-Đơn / Đạo Cụ-Đội / Khu Luyện Tập Đạo Cụ).

Chạy:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_items.py [glb|icons|fx|sfx|all]

Ra:
  art/items/*.glb        hộp "?" (propsbox_huge), vỏ chuối, tên lửa, lá chắn, đĩa bay, mực, thiên sứ, mây, lốc xoáy.
                         Lưới có xương (đĩa bay, mực, thiên sứ, mây, chuối) xuất ở tư thế gốc (bind pose), không kèm hoạt ảnh.
                         Vật liệu ghi extras.kind = opaque | blend | add (shader gốc là shader riêng, web vẽ bằng Lambert/Basic).
  art/items/icons/*.png  ID_PropsItem_* 78 px từ atlas ui/#common/artwork/atlas/id_propsitem.
  art/items/ui/*.png     băng cảnh báo BG_Boomb1/2, BG_Hint (atlas ig_ingame).
  art/items/fx/*.webp    texture hạt của prefab hiệu ứng đạo cụ; tham số hạt vào TD.ITEM_FX.
  art/items/sfx/*.mp3    tiếng mượn (bank DJ của đạo cụ không có trong APK, xem items.md mục 4).
  data/items.js          khối giữa hai dấu `export_items` (TD.ITEM_ART, TD.ITEM_FX, TD.AUDIO[...]); phần bảng luật viết tay giữ nguyên.
Toạ độ theo README: (x, y, z) -> (x, y, -z), tam giác đảo thứ tự khi ma trận không lật.
"""
import io, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_track as T  # noqa: E402  GLB, Mat, Textures, MeshCache, load_with_deps
import zs  # noqa: E402
import UnityPy  # noqa: E402

GAME = T.GAME
OUT = os.path.join(GAME, 'art', 'items')
DATA = os.path.join(GAME, 'data', 'items.js')
MARK0, MARK1 = '/* <export_items> sinh bởi tools/export_items.py, đừng sửa tay */', '/* </export_items> */'

# (tên glb, đuôi prefab, lọc node theo tên | None = mọi renderer đang bật, cỡ texture)
# Hộp "?" cổ điển không có prefab riêng trong APK (propsbox_huge là biển quảng cáo 4,5 m): lấy từ hàng hộp mẫu PropsPointRoot
# trong cảnh xem trước Level_TrainTrack_B (vỏ kính Mesh01 shader CubeTransparent + mặt dấu hỏi Mesh02 Props_Item_Cube_02).
BOX_BUNDLE, BOX_NODE = 'AssetBundles/c9/c96f2b10361710a7263ecde7d54a668c', 'PropsPoint (000)'
GLBS = [
    ('banana', 'props_item_banana/props_item_banana_appear.prefab', lambda n: n == 'Mesh', 256),
    ('missile', 'props_item_missile/props_item_missile.prefab', lambda n: n == 'Props_Item_Missile', 256),
    ('shield', 'props_item_shield/props_item_shield_appear.prefab', lambda n: n in ('Props_Item_Shield', 'FX_Daoju_hudun_glow', 'a001'), 256),
    ('ufo', 'props_item_ufo/props_item_ufo_idle.prefab', lambda n: n == 'Mesh', 256),
    ('squid', 'props_item_squid/props_item_squid_attack.prefab', lambda n: n == 'Mesh', 256),
    ('angel', 'props_item_angel/props_item_angel_startaddloop.prefab', lambda n: n == 'Mesh', 256),
    ('cloud', 'props_item_wuyun/props_item_wuyun_attack.prefab', lambda n: n == 'Mesh', 256),
    ('tornado', 'fx_props_item_tornado_idle_lod1.prefab', None, 256),
]

ICON_ATLAS = 'ui/#common/artwork/atlas/id_propsitem/id_propsitem.prefab'
ICONS = ['Missile', 'Banana', 'Shield', 'Magnet', 'UFO', 'Ink', 'Tornado', 'Lightning', 'N2oProp', 'Angel', 'Clouds']
UI_ATLAS = 'ui/ingame/#ingame/artwork/atlas/ig_ingame/ig_ingame.prefab'
UI = [('boomb1', 'BG_Boomb1'), ('boomb2', 'BG_Boomb2'), ('hint', 'BG_Hint')]

# vai trò hiệu ứng -> prefab (dưới effects/ hoặc props/). Lớp hạt đọc bằng export_fx_ui.describe.
FX = [
    ('pickup', 'fx_props/props_item_propbox/fx_props_item_propbox_getitem_lod1.prefab'),
    ('missile_trail', 'props/props_item_missile/props_item_missile.prefab'),
    ('missile_hit', 'props/props_item_missile/props_item_missile_hited.prefab'),
    ('lightning', 'props/props_item_flash/props_item_flash_hited.prefab'),
    ('cloud_flash', 'props/props_item_wuyun/props_item_wuyun_attack.prefab'),
    ('ufo', 'props/props_item_ufo/props_item_ufo_idle.prefab'),
    ('ufo_find', 'props/props_item_ufodisturb/props_item_ufofind.prefab'),
    ('magnet', 'fx_props/props_item_magnet/fx_props_item_magnet_a_lod1.prefab'),
    ('smog', 'fx_props/props_item_cloud/fx_props_item_cloud_a_lod1.prefab'),
    ('shield', 'props/props_item_shield/props_item_shield_appear.prefab'),
]

# (khoá TD.AUDIO = event gốc của bank DJ, event nguồn có trong APK, cắt (bắt đầu, dài) | None, ghi chú)
SFX = [
    ('Play_DJ_shiqu_ty', 'Play_Super_Pickup', None, 'nhặt hộp'),
    ('Play_DJ_ddfashe', 'Play_HangHai_AMB_Missile', (0, 1.6), 'phóng tên lửa'),
    ('Play_DJ_ddbao', 'Play_HangHai_AMB_MissileBoomAir', None, 'tên lửa nổ'),
    ('Play_DJ_jingbao', 'Play_Mode_RongLuTaoTai_SFX_Warning', None, 'cảnh báo bị khoá'),
    ('Play_DJ_hudunopen', 'Play_ChaoXianJiDou_MuYang_Buff', (0, 1.5), 'mở lá chắn'),
    ('Play_DJ_hudunjisui', 'Play_HaiBingZhiYan_AMB_DianZiPinCrash', None, 'lá chắn đỡ đòn rồi vỡ'),
    ('Play_DJ_wind', 'Play_DJ_wind', None, 'lốc xoáy (event gốc, có trong ChaoXianJiDou_Mode.bnk)'),
    ('Play_DJ_Cloud', 'Play_Wushanwuxing_SFX_Cloud', None, 'mây mù'),
    ('Play_DJ_FD_fashe', 'Play_Wushanwuxing_SFX_Laser01', None, 'đĩa bay chiếu tia'),
    ('Play_DJ_shandian_hit', 'Play_ChaoXianJiDou_LeiYin_Skill', (0, 2.2), 'sấm sét'),
    ('Play_DJ_XJP_hit', 'Play_ChaoXianJiDou_AoLi_Hit', None, 'cán vỏ chuối'),
    ('Play_DJ_ZY_atk', 'Play_SnakeTale_SFX_InkSnake03', (0, 1.8), 'mực phun'),
    ('Play_DJ_CT_fashe', 'Play_Mode_ChaoXianJiDou_MuNiKeLa_Linked', None, 'nam châm hút'),
    ('Play_DJ_TSopen', 'Play_Mode_Spray_UI_Heal', None, 'thiên sứ'),
    ('Play_DJ_atk_ty', 'Play_Mode_Spray_SFX_PickWpn', (0, 0.8), 'thả đạo cụ'),
]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- prefab
def prefab(suffix):
    suffix = suffix.lower()
    rs = [r for r in zs.find(suffix) if any(c.lower().endswith(suffix) for c in r['cont'])]
    if not rs:
        raise KeyError(suffix)
    f = rs[0]['f']
    pid = [v.path_id for k, v in UnityPy.load(os.path.join(zs.IFS, f)).container.items() if k.lower().endswith(suffix)][0]
    env = T.load_with_deps([f])
    for fl in env.files.values():
        for sf in getattr(fl, 'files', {}).values():
            o = getattr(sf, 'objects', {}).get(pid)
            if o is not None and o.type.name == 'GameObject':
                return o
    raise KeyError(suffix)


def trs(tr):
    p, q, s = tr.m_LocalPosition, tr.m_LocalRotation, tr.m_LocalScale
    m = np.eye(4)
    m[:3, :3] = T.quat_mat((q.x, q.y, q.z, q.w)) * np.array([s.x, s.y, s.z])
    m[:3, 3] = (p.x, p.y, p.z)
    return m


def walk(go_obj, parent=None, active=True, out=None):
    """(tên, ma trận thế giới so với gốc prefab, đang bật, [component]) cho mọi node. Gốc prefab coi là đơn vị."""
    out = [] if out is None else out
    g = go_obj.read()
    comps = [c.component.deref() for c in g.m_Component]
    tr = next(c for c in comps if c.type.name in ('Transform', 'RectTransform')).read()
    w = np.eye(4) if parent is None else parent @ trs(tr)
    on = active and (g.m_IsActive or parent is None)
    out.append((g.m_Name, w, on, comps))
    for ch in tr.m_Children:
        walk(ch.deref().read().m_GameObject.deref(), w, on, out)
    return out


def kind_of(mat):
    s = mat.shader.lower()
    if 'additive' in s:
        return 'add'
    if 'transparentcommon' in s:
        return 'add' if mat.f.get('_DstBlend', 1) == 1 else 'blend'
    if 'alphablend' in s or 'blended' in s or 'transparent' in s or 'dissolve' in s or '_AlphaTex' in mat.tex:
        return 'blend'
    return 'opaque'


def box_root():
    import UnityPy as _
    env = T.load_with_deps([BOX_BUNDLE])
    for sf in env.files[os.path.join(zs.IFS, BOX_BUNDLE)].files.values():
        for o in getattr(sf, 'objects', {}).values():
            if o.type.name == 'GameObject' and o.read().m_Name == BOX_NODE:
                return o
    raise KeyError(BOX_NODE)


def export_glb(name, suffix, keep, cap, root=None):
    root = root or prefab(suffix)
    glb, texs, meshes = T.GLB(), T.Textures(), T.MeshCache()
    tex_glb, mat_glb = {}, {}
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    for nm, world, on, comps in walk(root):
        if not on or (keep is not None and not keep(nm)):
            continue
        rend = next((c for c in comps if c.type.name in ('MeshRenderer', 'SkinnedMeshRenderer')), None)
        if rend is None:
            continue
        r = rend.read()
        if rend.type.name == 'SkinnedMeshRenderer':
            mesh = r.m_Mesh.deref_parse_as_object()
        else:
            mf = next((c for c in comps if c.type.name == 'MeshFilter'), None)
            if mf is None:
                continue
            mesh = mf.read().m_Mesh.deref_parse_as_object()
        M = meshes.get(mesh)
        # Thừa vật liệu so với submesh: Unity vẽ lại submesh cuối với từng vật liệu thừa (mây: lớp nước cộng + lớp màu).
        for mi_, mp in enumerate(r.m_Materials):
            tri = M['subs'][min(mi_, len(M['subs']) - 1)]
            if not len(tri):
                continue
            mat = T.Mat(mp.deref_parse_as_object())
            kind = kind_of(mat)
            slot = mat.albedo_slot or next(iter(mat.tex), None)
            if 'CubeTransparent' in mat.shader:
                kind, slot = 'matcap', '_MatCap'   # vỏ kính: màu lấy theo pháp tuyến từ ảnh matcap (MeshMatcapMaterial)
            mk = (mp.m_FileID, mp.m_PathID, mi_)
            if mk not in mat_glb:
                tint = mat.c.get('_Color') or mat.c.get('_TintColor') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
                gm = {'name': mat.name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0},
                      'extras': {'shader': mat.shader, 'kind': kind, 'tint': [round(tint['r'], 3), round(tint['g'], 3), round(tint['b'], 3)],
                                 'alpha': round(tint['a'], 3)}}
                if slot:
                    ti = texs.get(mat, slot, cap, kind not in ('opaque', 'matcap'))
                    if ti is not None:
                        if ti not in tex_glb:
                            tex_glb[ti] = glb.image(texs.images[ti]['data'])
                        gm['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_glb[ti]}
                glb.j['materials'].append(gm)
                mat_glb[mk] = len(glb.j['materials']) - 1
            used = np.unique(tri)
            remap = np.full(len(M['pos']), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            p = (world[:3, :3] @ M['pos'][used].T).T + world[:3, 3]
            P = (p * [1, 1, -1]).astype(np.float32)
            lo, hi = np.minimum(lo, P.min(0)), np.maximum(hi, P.max(0))
            if M['nrm'] is not None:
                n = (np.linalg.inv(world[:3, :3]).T @ M['nrm'][used].T).T
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
            else:
                n = np.tile([0.0, 1.0, 0.0], (len(used), 1))
            uv = M['uv0'][used] if M['uv0'] is not None else np.zeros((len(used), 2))
            su, sv, ou, ov = mat.st(slot) if slot else (1, 1, 0, 0)
            uv = uv * [su, sv] + [ou, ov]
            tr = remap[tri]
            if np.linalg.det(world[:3, :3]) > 0:
                tr = tr[:, [0, 2, 1]]
            attrs = {'POSITION': glb.acc(P, 'VEC3', 34962, True), 'NORMAL': glb.acc((n * [1, 1, -1]).astype(np.float32), 'VEC3', 34962),
                     'TEXCOORD_0': glb.acc(np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32), 'VEC2', 34962)}
            glb.j['meshes'].append({'name': nm, 'primitives': [{'attributes': attrs, 'indices': glb.acc(tr.reshape(-1).astype(np.uint32), 'SCALAR', 34963),
                                                                  'material': mat_glb[mk]}]})
            glb.j['nodes'].append({'name': nm, 'mesh': len(glb.j['meshes']) - 1})
            glb.j['scenes'][0]['nodes'].append(len(glb.j['nodes']) - 1)
            log('  %-8s %-22s %-6s %-48s tris=%d' % (name, nm, kind, mat.shader[-48:], len(tr)))
    path = os.path.join(OUT, name + '.glb')
    glb.write(path)
    size = [round(float(x), 2) for x in hi - lo]
    log('  -> %s %.0f KB, cỡ %s, đáy y=%.2f' % (path, os.path.getsize(path) / 1e3, size, lo[1]))
    return {'glb': 'art/items/%s.glb' % name, 'size': size, 'min': [round(float(x), 2) for x in lo], 'src': suffix}


def build_glb():
    os.makedirs(OUT, exist_ok=True)
    out = {'box': export_glb('box', 'Level_TrainTrack_B.unity#' + BOX_NODE, None, 256, box_root())}
    out.update({name: export_glb(name, suf, keep, cap) for name, suf, keep, cap in GLBS})
    return out


# ---------------------------------------------------------------- icon / UI
def build_icons():
    import export_fx_ui as E
    cat = E.atlas_catalog()
    out = {}
    for sub, atlas, items in (('icons', ICON_ATLAS, [('ID_PropsItem_' + n, 'ID_PropsItem_' + n) for n in ICONS]), ('ui', UI_ATLAS, UI)):
        key = next(k for k in cat if k.endswith(atlas))
        sprites = {s[0]: s for s in cat[key]['sprites']}
        img = E.atlas_image(key)
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        for fn, sp in items:
            if sp not in sprites:
                log('  thiếu sprite', sp)
                continue
            _, x, y, w, h = sprites[sp][:5]
            img.crop((x, y, x + w, y + h)).save(os.path.join(d, fn + '.png'), optimize=True)
            out[fn] = 'art/items/%s/%s.png' % (sub, fn)
            log('  %-26s %dx%d' % (fn, w, h))
    return out


# ---------------------------------------------------------------- hạt
KEEP = ('kind', 'name', 'life', 'speed', 'size', 'rot', 'gravity', 'startColor', 'color', 'sizeOverLife', 'sheet', 'emit', 'shape',
        'render', 'blend', 'tex', 'tint', 'k', 'pos', 'duration', 'loop', 'mesh', 'active')


def build_fx():
    import export_fx_ui as E
    d = os.path.join(OUT, 'fx')
    os.makedirs(d, exist_ok=True)
    cache = {}

    # export_fx_ui ghi texture vào art/fx (thư mục của nhánh VFX, bị xoá khi chạy lại bộ đó): ghi riêng vào art/items/fx.
    def export_tex(mi, maxdim=256, luma_alpha=False):
        mt = E.main_tex(mi)
        if mt is None:
            return None
        t = mt['obj'].read()
        at = mi['tex'].get('_AlphaTex')
        im0 = t.image
        luma = luma_alpha and at is None and ('A' not in im0.getbands() or im0.getchannel('A').getextrema() == (255, 255))
        key = (t.m_Name, at['obj'].read().m_Name if at else None, luma)
        if key not in cache:
            safe = re.sub(r'[^A-Za-z0-9_]+', '_', t.m_Name).lower() + ('_la' if luma else '')
            im = im0.convert('RGBA')
            if luma:
                im.putalpha(im0.convert('L'))
            if at is not None:
                a = at['obj'].read().image.convert('L')
                im.putalpha(a.resize(im.size, Image.BILINEAR) if a.size != im.size else a)
            if max(im.size) > maxdim:
                k = maxdim / max(im.size)
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            im.save(os.path.join(d, safe + '.webp'), 'WEBP', quality=86, method=5)
            cache[key] = 'art/items/fx/%s.webp' % safe
        return cache[key]
    E.export_tex = export_tex
    out = {}
    for role, suf in FX:
        pre = 'assets/resforassetbundles/' + ('effects/' if suf.startswith('fx_') else '')
        full, ls = E.describe(pre + suf)
        layers = [{k: v for k, v in L.items() if k in KEEP} for L in ls if L.get('tex')]
        out[role] = {'src': full.split('resforassetbundles/')[1], 'layers': layers}
        log('  fx %-14s %d lớp: %s' % (role, len(layers), ', '.join(L['tex'].split('/')[-1] for L in layers)))
    return out


# ---------------------------------------------------------------- tiếng
def build_sfx():
    import export_audio as A
    d = os.path.join(OUT, 'sfx')
    os.makedirs(d, exist_ok=True)
    inv = {}
    for line in open(os.path.join(A.WORK, 'inventory.tsv'), encoding='utf-8'):
        c = line.rstrip('\n').split('\t')
        if c[0] != 'bank' and c[3]:
            inv.setdefault(c[1], [int(x) for x in c[3].split(',')])
    world = [None]
    out = {}
    for key, src, trim, note in SFX:
        wems = inv.get(src)
        if not wems:
            log('  THIẾU tiếng', src)
            continue
        wav = A.wav_path(wems[0])
        if not os.path.exists(wav):
            world[0] = world[0] or A.World()
            wav = A.decode_wem(world[0], wems[0])
        rel = 'art/items/sfx/%s.mp3' % key
        A.encode(wav, os.path.join(GAME, rel), 'sfx', trim)
        lu, pk, _ = A.measure(os.path.join(GAME, rel))
        vol = min(10 ** ((A.TARGET['sfx'] - lu) / 20), 10 ** ((-1.0 - pk) / 20), 10.0)
        out[key] = {'files': [rel], 'loop': False, 'vol': round(vol, 3), 'bus': 'sfx', 'dur': [round(A.wav_duration(os.path.join(GAME, rel)), 2)]}
        if src != key:
            out[key]['subst'] = src
        log('  %-22s <- %-40s vol=%.2f %s' % (key, src, vol, note))
    return out


# ---------------------------------------------------------------- data/items.js
def write_data(art, fx, sfx):
    txt = open(DATA, encoding='utf-8').read() if os.path.exists(DATA) else ''
    js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    block = [MARK0, '(function (g) {', '  var TD = g.TD = g.TD || {};', '  TD.ITEM_ART = ' + js(art) + ';', '  TD.ITEM_FX = ' + js(fx) + ';',
             '  // Bank DJ (tiếng đạo cụ) không có trong APK: mỗi event gốc mượn tiếng khác có trong APK (subst).', '  TD.AUDIO = TD.AUDIO || {};']
    for k, v in sfx.items():
        block.append('  TD.AUDIO[%s] = %s;' % (json.dumps(k), js(v)))
    block += ['})(typeof window !== "undefined" ? window : globalThis);', MARK1]
    b = '\n'.join(block)
    if MARK0 in txt and MARK1 in txt:
        txt = txt[:txt.index(MARK0)] + b + txt[txt.index(MARK1) + len(MARK1):]
    else:
        txt = txt.rstrip('\n') + '\n\n' + b + '\n'
    open(DATA, 'w', encoding='utf-8').write(txt)
    log('ghi', DATA)


def load_prev():
    """Khối cũ trong data/items.js để chạy lại từng phần (vd chỉ 'sfx') không mất phần còn lại."""
    if not os.path.exists(DATA):
        return {}, {}, {}
    txt = open(DATA, encoding='utf-8').read()
    if MARK0 not in txt:
        return {}, {}, {}
    b = txt[txt.index(MARK0):txt.index(MARK1)]
    get = lambda pat: json.loads(re.search(pat, b).group(1)) if re.search(pat, b) else {}
    sfx = {m.group(1): json.loads(m.group(2)) for m in re.finditer(r'TD\.AUDIO\["([^"]+)"\] = (\{.*\});', b)}
    return get(r'TD\.ITEM_ART = (\{.*\});'), get(r'TD\.ITEM_FX = (\{.*\});'), sfx


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    art, fx, sfx = load_prev()
    art = dict(art)
    if what in ('glb', 'all'):
        art['models'] = build_glb()
    if what in ('icons', 'all'):
        art['icons'] = build_icons()
    if what in ('fx', 'all'):
        fx = build_fx()
    if what in ('sfx', 'all'):
        sfx = build_sfx()
    write_data(art, fx, sfx)


if __name__ == '__main__':
    main()
