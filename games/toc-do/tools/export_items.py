#!/usr/bin/env python3
"""Xuất đạo cụ của Zing Speed Mobile cho Tốc Độ (chế độ Đạo Cụ-Đơn / Đạo Cụ-Đội / Khu Luyện Tập Đạo Cụ).

Chạy:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_items.py [glb|icons|fx|sfx|all]

Ra:
  art/items/*.glb        hộp "?" (hàng hộp mẫu Level_TrainTrack_B), tên lửa: lưới tĩnh.
                         Đĩa Bay, mực, thiên sứ, mây giông, vỏ chuối, giá phóng tên lửa, lá chắn Dunpai: lưới có xương + mọi clip Animation cũ
                         của các prefab appear/idle/attack/hited/disappear (vai trò = tên animation trong glb, TD.ITEM_ART.models[x].clips).
                         Lốc xoáy, vòng nam châm, radar Đĩa Bay: lưới hiệu ứng giữ tâm node, extras = đường cong NssTween /
                         NssFXHelper / TransparentCommonCurves gốc (cỡ, xoay, độ mờ, cuộn UV) để view chạy lại.
                         Vật liệu ghi extras.kind = opaque | cut | blend | add | matcap (shader gốc là shader riêng).
  art/items/icons/*.png  ID_PropsItem_* 78 px từ atlas ui/#common/artwork/atlas/id_propsitem.
  art/items/ui/*.png     băng cảnh báo BG_Boomb1/2, BG_Hint (atlas ig_ingame); aim_0/1 = vòng ngắm UIFX_Props_Aiming_Red_A nướng từ lưới.
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
    ('missile', 'props_item_missile/props_item_missile.prefab', lambda n: n == 'Props_Item_Missile', 256),
]
# Lưới có xương: (tên glb, [(vai trò clip, prefab[#node mang Animation], lặp)]). Lưới + xương lấy từ prefab đầu.
# Mỗi prefab gốc chỉ có một clip Animation cũ (Appear/Idle/Attack/Hited/Disappear, dài 1 s) trên cùng lưới.
RIGGED = [
    ('ufo', [('idle', 'props_item_ufo/props_item_ufo_idle.prefab', True), ('appear', 'props_item_ufo/props_item_ufo_appear.prefab', False),
             ('attack', 'props_item_ufo/props_item_ufo_attack.prefab', False), ('defend', 'props_item_ufo/props_item_ufo_defend.prefab', False),
             ('disappear', 'props_item_ufo/props_item_ufo_disappear.prefab', False)]),
    ('squid', [('attack', 'props_item_squid/props_item_squid_attack.prefab', False), ('appear', 'props_item_squid/props_item_squid_appear.prefab', False),
               ('hited', 'props_item_squid/props_item_squid_hited.prefab', False), ('disappear', 'props_item_squid/props_item_squid_disappear.prefab', False)]),
    ('angel', [('appear', 'props_item_angel/props_item_angel_startaddloop.prefab#Props_Item_Angel_Start', False),
               ('idle', 'props_item_angel/props_item_angel_startaddloop.prefab#Props_Item_Angel_Loop', True),
               ('hited', 'props_item_angel/props_item_angel_hited.prefab', False),
               ('end', 'props_item_angel/props_item_angel_end.prefab', True)]),
    ('cloud', [('attack', 'props_item_wuyun/props_item_wuyun_attack.prefab', False), ('appear', 'props_item_wuyun/props_item_wuyun_appear.prefab', False),
               ('disappear', 'props_item_wuyun/props_item_wuyun_disappear.prefab', False)]),
    ('banana', [('appear', 'props_item_banana/props_item_banana_appear.prefab', False)]),
    # Lá Chắn: vòng tấm khiên Dunpai quanh xe (props_item_shield02a, đúng như clip b9IIano2xqU t=406), không phải quả cầu cũ
    ('shield', [('open', 'props_item_shield02a/props_item_shield_appear_new.prefab#Props_Item_Shield_Appear_New', False),
                ('loop', 'props_item_shield02a/props_item_shield_appear_new.prefab#Props_Item_Shield_Loop_New', True),
                ('close', 'props_item_shield02a/props_item_shield_appear_new.prefab#Props_Item_Shield_End_New', False)]),
    # giá phóng tên lửa dựng trên nóc xe lúc bắn (props_item_missileshelf_appear: lưới Mesh 6 xương, clip Appear)
    ('missile_shelf', [('appear', 'props_item_missile/props_item_missileshelf_appear.prefab', False)]),
]
# Lưới hiệu ứng (MeshRenderer) giữ tâm node + đường cong tween gốc: lốc xoáy, vòng nam châm, radar Đĩa Bay quấy nhiễu.
FXGLBS = [
    ('tornado', 'fx_props_item_tornado_appear_lod1.prefab'),        # phễu lốc + dải gió (2,5 s, lặp lại suốt đời lốc)
    ('tornado_ring', 'fx_props_item_tornado_idle_lod1.prefab'),     # vòng gió chớp quanh chân lốc
    ('tornado_hit', 'fx_props_item_tornado_hited_lod1.prefab'),     # vòng gió cuốn quanh xe bị trúng
    ('magnet_a', 'fx_props_item_magnet_a_lod1.prefab'),             # vòng từ xanh trước mũi xe hút
    ('magnet_b', 'fx_props_item_magnet_b_lod1.prefab'),             # vòng từ đỏ trên xe bị hút
    ('ufo_disturb', 'props_item_ufodisturb/props_item_ufodisturb.prefab'),   # radar quét trên xe bị Đĩa Bay khoá
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
    ('missile_shelf', 'props/props_item_missile/props_item_missileshelf_appear.prefab'),
    ('lightning', 'props/props_item_flash/props_item_flash_hited.prefab'),
    ('lightning_idle', 'props/props_item_flash/props_item_flash_idle.prefab'),
    ('cloud_flash', 'props/props_item_wuyun/props_item_wuyun_attack.prefab'),
    ('ufo', 'props/props_item_ufo/props_item_ufo_idle.prefab'),
    ('ufo_hit', 'props/props_item_ufo/props_item_ufo_hit.prefab'),
    ('ufo_find', 'props/props_item_ufodisturb/props_item_ufofind.prefab'),
    ('magnet', 'fx_props/props_item_magnet/fx_props_item_magnet_a_lod1.prefab'),
    ('magnet_b', 'fx_props/props_item_magnet/fx_props_item_magnet_b_lod1.prefab'),
    ('smog', 'fx_props/props_item_cloud/fx_props_item_cloud_a_lod1.prefab'),
    ('shield', 'props/props_item_shield/props_item_shield_appear.prefab'),
    ('banana_hit', 'props/props_item_banana/props_item_banana_hited.prefab'),
    ('squid_hit', 'props/props_item_squid/props_item_squid_hited.prefab'),
]

# (khoá TD.AUDIO = event gốc của bank DJ, event nguồn có trong APK, cắt (bắt đầu, dài) | None, ghi chú)
# Bank DJ không có trong APK; đã dò mọi bank có mặt (work/audio/inventory.tsv, 1265 event): chọn tiếng gần nhất theo tên/công dụng.
SFX = [
    ('Play_DJ_shiqu_ty', 'Play_Super_Pickup', None, 'nhặt hộp: tiếng nhặt đạo cụ của chế độ Siêu Đạo Cụ (bank SuperRace)'),
    ('Play_DJ_ddfashe', 'Play_HangHai_AMB_Missile', (0, 1.6), 'phóng tên lửa: tên lửa bay của đường Hàng Hải'),
    ('Play_DJ_ddbao', 'Play_HangHai_AMB_MissileBoomAir', None, 'tên lửa nổ: tên lửa nổ trên không của đường Hàng Hải'),
    ('Play_DJ_jingbao', 'Play_Mode_RongLuTaoTai_SFX_Warning', None, 'cảnh báo bị khoá: còi cảnh báo chế độ Dung Lô Đào Thải'),
    ('Play_DJ_hudunopen', 'Play_ChaoXianJiDou_MuYang_Buff', (0, 1.5), 'mở lá chắn: tiếng buff khiên (Siêu Tuyển Đấu)'),
    ('Play_DJ_hudunjisui', 'Play_Mode_RongLuTaoTai_SFX_BreakGlass', None, 'lá chắn vỡ: kính vỡ (Dung Lô Đào Thải)'),
    ('Play_DJ_wind', 'Play_DJ_wind', None, 'lốc xoáy: event gốc của bank DJ, bản sao có trong ChaoXianJiDou_Mode.bnk'),
    ('Play_DJ_wind_up', 'Play_Mode_Spray_SFX_Tornado', None, 'xe bị lốc cuốn lên: lốc xoáy của chế độ Phun Sơn'),
    ('Play_DJ_Cloud', 'Play_Wushanwuxing_SFX_Cloud', None, 'mây mù: mây của đường Vu Sơn'),
    ('Play_DJ_FD_fashe', 'Play_Wushanwuxing_SFX_Laser01', None, 'đĩa bay chiếu tia: laser của đường Vu Sơn'),
    ('Play_DJ_FD_ganrao', 'Play_Wushanwuxing_SFX_Laser02', None, 'đĩa bay quấy nhiễu khi treo trên đầu xe'),
    ('Play_DJ_shandian_hit', 'Play_ChaoXianJiDou_LeiYin_Skill', (0, 2.2), 'sấm sét: kỹ năng Lôi Âm (Siêu Tuyển Đấu)'),
    ('Play_DJ_XJP_hit', 'Play_ChaoXianJiDou_AoLi_Hit', None, 'cán vỏ chuối'),
    ('Play_DJ_ZY_atk', 'Play_SnakeTale_SFX_InkSnake03', (0, 1.8), 'mực phun: rắn mực của đường Bạch Xà'),
    ('Play_DJ_CT_fashe', 'Play_Mode_ChaoXianJiDou_MuNiKeLa_Linked', None, 'nam châm hút: tiếng nối dây (Siêu Tuyển Đấu)'),
    ('Play_DJ_TSopen', 'Play_Mode_Spray_UI_Heal', None, 'thiên sứ: hồi máu chế độ Phun Sơn'),
    ('Play_DJ_atk_ty', 'Play_Mode_Spray_SFX_PickWpn', (0, 0.8), 'thả đạo cụ: nhặt vũ khí chế độ Phun Sơn'),
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


def walk(go_obj, parent=None, active=True, out=None, parents=None, pi=-1):
    """(tên, ma trận thế giới so với gốc prefab, đang bật, [component]) cho mọi node. Gốc prefab coi là đơn vị.
    parents (list) nhận chỉ số node cha của từng node."""
    out = [] if out is None else out
    g = go_obj.read()
    comps = [c.component.deref() for c in g.m_Component]
    tr = next(c for c in comps if c.type.name in ('Transform', 'RectTransform')).read()
    w = np.eye(4) if parent is None else parent @ trs(tr)
    on = active and (g.m_IsActive or parent is None)
    me = len(out)
    out.append((g.m_Name, w, on, comps))
    if parents is not None:
        parents.append(pi)
    for ch in tr.m_Children:
        walk(ch.deref().read().m_GameObject.deref(), w, on, out, parents, me)
    return out


def kind_of(mat):
    s = mat.shader.lower()
    if 'dissolve' in s:
        return 'cut'   # FX_DissolveHard (Thiên Sứ): đục, alpha cắt ngưỡng
    # FX_Warp (vòng nam châm) là méo ảnh màn hình: web vẽ cộng màu texture nhiễu; RimBlend (kính khiên Dunpai): viền sáng cộng màu
    if 'additive' in s or 'warp' in s or 'rimblend' in s:
        return 'add'
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


class Mats:
    """Vật liệu glTF theo vật liệu Unity (một bản cho mỗi (vật liệu, chỉ số submesh)), texture WebP dùng chung."""

    def __init__(self, glb, cap):
        self.glb, self.cap, self.texs, self.tex_glb, self.mat_glb = glb, cap, T.Textures(), {}, {}

    def get(self, mp, mi_):
        mat = T.Mat(mp.deref_parse_as_object())
        kind = kind_of(mat)
        slot = mat.albedo_slot or next(iter(mat.tex), None)
        if 'CubeTransparent' in mat.shader:
            kind, slot = 'matcap', '_MatCap'   # vỏ kính: màu lấy theo pháp tuyến từ ảnh matcap (MeshMatcapMaterial)
        mk = (mp.m_FileID, mp.m_PathID, mi_)
        if mk not in self.mat_glb:
            tint = mat.c.get('_Color') or mat.c.get('_TintColor') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
            gm = {'name': mat.name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0},
                  'extras': {'shader': mat.shader, 'kind': kind, 'tint': [round(tint['r'], 3), round(tint['g'], 3), round(tint['b'], 3)],
                             'alpha': round(tint['a'], 3)}}
            if slot:
                ti = self.texs.get(mat, slot, self.cap, kind not in ('opaque', 'matcap'))
                if ti is not None:
                    if ti not in self.tex_glb:
                        self.tex_glb[ti] = self.glb.image(self.texs.images[ti]['data'])
                    gm['pbrMetallicRoughness']['baseColorTexture'] = {'index': self.tex_glb[ti]}
            if mat.f.get('_U') or mat.f.get('_V'):
                gm['extras']['scroll'] = [round(float(mat.f.get('_U', 0)), 4), round(float(mat.f.get('_V', 0)), 4)]   # UV/giây do shader cuộn
            self.glb.j['materials'].append(gm)
            self.mat_glb[mk] = len(self.glb.j['materials']) - 1
        return self.mat_glb[mk], mat, kind, slot


# Lưới dựng sẵn của Unity (Quad) nằm trong "unity default resources", không có trong bundle: dựng lại 1×1 m mặt XY.
QUAD = {'name': 'Quad', 'pos': np.array([[-.5, -.5, 0], [.5, -.5, 0], [-.5, .5, 0], [.5, .5, 0]], float), 'nrm': np.tile([0.0, 0, -1], (4, 1)),
        'uv0': np.array([[0, 0], [1, 0], [0, 1], [1, 1]], float), 'subs': [np.array([[0, 3, 1], [3, 0, 2]])]}


def node_tweens(comps, own_scale=(1, 1, 1)):
    """Đường cong NssTween / TransparentCommonCurves / NssFXHelper của một node hiệu ứng -> extras cho lớp vẽ web.
    TargetValue của tween cỡ là cỡ tuyệt đối (localScale): ghi theo tỉ lệ so với cỡ gốc own_scale của node mang tween."""
    out = {}
    for c in comps:
        if c.type.name != 'MonoBehaviour':
            continue
        try:
            cn, t = c.read().m_Script.read().m_ClassName, c.read_typetree()
        except Exception:
            continue
        keys = lambda cv: [[round(k['time'], 3), round(k['value'], 4)] for k in cv['m_Curve']]
        if cn == 'NssTween':
            # TWType 1 = xoay (độ, cộng vào góc gốc), 5 = cỡ (nhân cỡ gốc); CycleWrapMode 2 = lặp, còn lại chạy một lần
            out['tw'] = [{'type': w['TWType'], 'curve': keys(w['Curve']),
                          'to': [round(w['TargetValue'][a] / (own_scale[i] if w['TWType'] == 5 and own_scale[i] else 1), 4) for i, a in enumerate('xyz')],
                          'mul': round(w['CurveValueMulti'], 4), 'loop': w['CycleWrapMode'] == 2, 'delay': round(w['Delay'], 3)} for w in t['TWControls']]
        elif cn == 'NssFXHelper':
            # key 0 = màu/alpha vật liệu theo đường cong
            out['fxc'] = [{'key': f['KeyWord'], 'curve': keys(f['Curve']), 'mul': round(f['CurveValueMulti'], 4), 'loop': f['CycleWrapMode'] == 2,
                           'color': [round(f['TargetColor'][a], 4) for a in 'rgba']} for f in t['FXControls']]
        elif cn == 'TransparentCommonCurves':
            d = {}
            if t['mUseColorTween'] and t['mColorUseCuve']:
                d['alpha'] = {'curve': keys(t['mColorAnimationCurve']), 'dur': round(t['mColorDuration'], 3), 'loop': t['mColorLoop'] != 1}
            for ax in 'UV':
                if t['mUse%sTween' % ax]:
                    d[ax.lower()] = {'to': round(t['m%sTo' % ax], 4), 'dur': round(t['m%sDuration' % ax], 3),
                                     'curve': keys(t['m%sAnimationCuve' % ax]) if t['m%sUseCurve' % ax] else [[0, 0], [1, 1]]}
            if d:
                out['tcc'] = d
    return out


def export_glb(name, suffix, keep, cap, root=None, pivot=False):
    """Lưới tĩnh của prefab vào một glb. pivot=True (glb hiệu ứng): mỗi node giữ vị trí gốc làm tâm, lưới chỉ mang xoay/cỡ,
    kèm extras đường cong tween để lớp vẽ web xoay/phóng quanh đúng tâm như NssTween."""
    root = root or prefab(suffix)
    glb = T.GLB()
    mats, meshes = Mats(glb, cap), T.MeshCache()
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    parents = []
    nodes = walk(root, parents=parents)
    for ni, (nm, world, on, comps) in enumerate(nodes):
        if not on or (keep is not None and not keep(nm)):
            continue
        rend = next((c for c in comps if c.type.name in ('MeshRenderer', 'SkinnedMeshRenderer')), None)
        if rend is None:
            continue
        r = rend.read()
        try:
            if rend.type.name == 'SkinnedMeshRenderer':
                mesh = r.m_Mesh.deref_parse_as_object()
            else:
                mf = next((c for c in comps if c.type.name == 'MeshFilter'), None)
                if mf is None:
                    continue
                mesh = mf.read().m_Mesh.deref_parse_as_object()
            M = meshes.get(mesh)
        except Exception:
            M = QUAD
        lin, org = world[:3, :3], world[:3, 3]
        # Thừa vật liệu so với submesh: Unity vẽ lại submesh cuối với từng vật liệu thừa (mây: lớp nước cộng + lớp màu).
        for mi_, mp in enumerate(r.m_Materials):
            tri = M['subs'][min(mi_, len(M['subs']) - 1)]
            if not len(tri):
                continue
            midx, mat, kind, slot = mats.get(mp, mi_)
            used = np.unique(tri)
            remap = np.full(len(M['pos']), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            p = (lin @ M['pos'][used].T).T + (0 if pivot else org)
            P = (p * [1, 1, -1]).astype(np.float32)
            W = P + (np.array([org[0], org[1], -org[2]], np.float32) if pivot else 0)
            lo, hi = np.minimum(lo, W.min(0)), np.maximum(hi, W.max(0))
            if M['nrm'] is not None:
                n = (np.linalg.inv(lin).T @ M['nrm'][used].T).T
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
            else:
                n = np.tile([0.0, 1.0, 0.0], (len(used), 1))
            uv = M['uv0'][used] if M['uv0'] is not None else np.zeros((len(used), 2))
            su, sv, ou, ov = mat.st(slot) if slot else (1, 1, 0, 0)
            uv = uv * [su, sv] + [ou, ov]
            tr = remap[tri]
            if np.linalg.det(lin) > 0:
                tr = tr[:, [0, 2, 1]]
            attrs = {'POSITION': glb.acc(P, 'VEC3', 34962, True), 'NORMAL': glb.acc((n * [1, 1, -1]).astype(np.float32), 'VEC3', 34962),
                     'TEXCOORD_0': glb.acc(np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32), 'VEC2', 34962)}
            glb.j['meshes'].append({'name': nm, 'primitives': [{'attributes': attrs, 'indices': glb.acc(tr.reshape(-1).astype(np.uint32), 'SCALAR', 34963),
                                                                  'material': midx}]})
            node = {'name': nm, 'mesh': len(glb.j['meshes']) - 1}
            if pivot:
                node['translation'] = [round(float(org[0]), 4), round(float(org[1]), 4), round(float(-org[2]), 4)]
                # tween của node cha (phễu lốc: FX_fengmain phóng, FX_..._01_a xoay) áp cả vào node con vì lưới đã gộp ma trận
                ex, j = {}, ni
                while j >= 0:
                    tr_ = next(c for c in nodes[j][3] if c.type.name in ('Transform', 'RectTransform')).read().m_LocalScale
                    for k_, v_ in node_tweens(nodes[j][3], (tr_.x, tr_.y, tr_.z)).items():
                        ex[k_] = v_ + ex[k_] if k_ in ('tw', 'fxc') and k_ in ex else ex.get(k_, v_)
                    j = parents[j]
                if ex:
                    node['extras'] = ex
            glb.j['nodes'].append(node)
            glb.j['scenes'][0]['nodes'].append(len(glb.j['nodes']) - 1)
            log('  %-8s %-22s %-6s %-48s tris=%d' % (name, nm, kind, mat.shader[-48:], len(tr)))
    path = os.path.join(OUT, name + '.glb')
    glb.write(path)
    size = [round(float(x), 2) for x in hi - lo]
    log('  -> %s %.0f KB, cỡ %s, đáy y=%.2f' % (path, os.path.getsize(path) / 1e3, size, lo[1]))
    return {'glb': 'art/items/%s.glb' % name, 'size': size, 'min': [round(float(x), 2) for x in lo], 'src': suffix}


# ---------------------------------------------------------------- lưới có xương + hoạt ảnh (Animation cũ của Unity)
def anim_node(suffix):
    """GameObject mang component Animation trong prefab 'đuôi[#tên node]' và ma trận của nó so với gốc prefab."""
    suf, _, want = suffix.partition('#')
    for nm, world, on, comps in walk(prefab(suf)):
        a = next((c for c in comps if c.type.name == 'Animation'), None)
        if a is not None and (not want or nm == want):
            return a.read().m_GameObject.read(), a.read(), world
    raise KeyError(suffix)


def hermite(keys, t, comps):
    """Giá trị AnimationCurve Unity (Hermite, tiếp tuyến vô hạn = bậc thang) tại t, mỗi thành phần."""
    if t <= keys[0].time:
        return [getattr(keys[0].value, c) for c in comps]
    for a, b in zip(keys, keys[1:]):
        if t <= b.time:
            dt = b.time - a.time
            s = (t - a.time) / dt if dt > 0 else 0
            out = []
            for c in comps:
                v0, v1, m0, m1 = getattr(a.value, c), getattr(b.value, c), getattr(a.outSlope, c), getattr(b.inSlope, c)
                if not (np.isfinite(m0) and np.isfinite(m1)):
                    out.append(v0)
                    continue
                s2, s3 = s * s, s * s * s
                out.append((2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * dt * m1)
            return out
    return [getattr(keys[-1].value, c) for c in comps]


def legacy_channels(clip, skel, fps=30):
    """Clip Animation cũ (m_Legacy, đường cong không nén) -> (thời điểm, {(node, path): mảng}) theo toạ độ three.js."""
    import export_driver as D
    t1 = max([k.time for kk in ('m_RotationCurves', 'm_PositionCurves', 'm_ScaleCurves', 'm_EulerCurves')
              for c in getattr(clip, kk, []) for k in c.curve.m_Curve] + [1 / fps])
    times = np.linspace(0, t1, max(2, int(round(t1 * fps)) + 1))
    by_path = {n['path']: i for i, n in enumerate(skel.nodes)}
    ch, miss = {}, set()
    for kk, path, comps in (('m_PositionCurves', 'translation', 'xyz'), ('m_RotationCurves', 'rotation', 'xyzw'),
                            ('m_ScaleCurves', 'scale', 'xyz'), ('m_EulerCurves', 'rotation', 'xyz')):
        for c in getattr(clip, kk, []):
            node = by_path.get(c.path)
            if node is None:
                miss.add(c.path)
                continue
            keys = c.curve.m_Curve
            v = np.array([hermite(keys, t, comps) for t in times])
            if kk == 'm_EulerCurves':
                v = np.array([D.euler_to_q(e) for e in v])
            if path == 'translation':
                v[:, 2] *= -1
            elif path == 'rotation':
                v = np.stack([-v[:, 0], -v[:, 1], v[:, 2], v[:, 3]], 1)
                v /= np.linalg.norm(v, axis=1, keepdims=True)
                for i in range(1, len(v)):
                    if np.dot(v[i], v[i - 1]) < 0:
                        v[i] = -v[i]
            ch[(node, path)] = v
    return times, ch, miss


def acc_raw(glb, arr, ctype, typ, minmax=False):
    arr = np.ascontiguousarray(arr)
    d = {'bufferView': glb.view(arr.tobytes()), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if minmax:
        d['min'], d['max'] = [float(x) for x in np.atleast_1d(arr.min(0))], [float(x) for x in np.atleast_1d(arr.max(0))]
    glb.j['accessors'].append(d)
    return len(glb.j['accessors']) - 1


def export_rigged(name, clips, cap=256):
    """Lưới có xương của prefab đầu tiên + mọi clip (vai trò -> prefab) vào một glb. Các prefab appear/idle/attack... của
    một đạo cụ dùng chung lưới Mesh và bộ xương Root/Bip_*; node mang Animation lệch gốc (Thiên Sứ Loop cao 0,43 m) thì
    clip đó kèm kênh dời node gốc."""
    import export_driver as D
    from UnityPy.helpers.MeshHelper import MeshHandler
    go, _, w0 = anim_node(clips[0][1])
    skel = D.Skel(go)
    glb = T.GLB()
    glb.j['skins'], glb.j['animations'] = [], []
    mats = Mats(glb, cap)
    smrs, stack = [], [D.transform_of(go)]
    while stack:
        tr = stack.pop()
        g = tr.m_GameObject.read()
        if g.m_IsActive:
            smrs += D.components(g, 'SkinnedMeshRenderer')
            stack += [c.read() for c in tr.m_Children]
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    meshes = []
    for smr in smrs:
        mesh = smr.m_Mesh.read()
        mh = MeshHandler(mesh)
        mh.process()
        pos = np.array(mh.m_Vertices, dtype=np.float32).reshape(-1, 3)
        pos[:, 2] *= -1
        nrm = np.array(mh.m_Normals, dtype=np.float32).reshape(-1, 3)
        nrm[:, 2] *= -1
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
        uv = np.array(mh.m_UV0, dtype=np.float32).reshape(-1, 2).copy()
        uv[:, 1] = 1 - uv[:, 1]
        bi0 = np.array(mh.m_BoneIndices).reshape(len(pos), -1)
        # chỉ có kênh BlendIndices một chiều (mây Wuyun): mỗi đỉnh gắn cứng một xương, trọng số 1
        bw0 = np.array(mh.m_BoneWeights).reshape(len(pos), -1) if mh.m_BoneWeights is not None else np.ones((len(pos), 1))
        bi, bw = np.zeros((len(pos), 4), np.uint16), np.zeros((len(pos), 4), np.float32)
        k = min(4, bi0.shape[1])
        bi[:, :k], bw[:, :k] = bi0[:, :k], bw0[:, :k]
        bw /= np.maximum(bw.sum(1, keepdims=True), 1e-8)
        joints = [skel.graft(b.read()) for b in smr.m_Bones]
        ibm = np.stack([D.mat_of(m).T.reshape(-1) for m in mesh.m_BindPose]).astype(np.float32)
        lo, hi = np.minimum(lo, pos.min(0)), np.maximum(hi, pos.max(0))
        a = {'POSITION': glb.acc(pos, 'VEC3', 34962, True), 'NORMAL': glb.acc(nrm, 'VEC3', 34962), 'TEXCOORD_0': glb.acc(uv, 'VEC2', 34962),
             'JOINTS_0': acc_raw(glb, bi, 5123, 'VEC4'), 'WEIGHTS_0': acc_raw(glb, bw, 5126, 'VEC4')}
        tris = mh.get_triangles()
        prims = []
        for mi_, mp in enumerate(smr.m_Materials):
            sub = tris[min(mi_, len(tris) - 1)]
            if not sub:
                continue
            midx, mat, kind, _ = mats.get(mp, mi_)
            idx = np.array(sub, dtype=np.uint32)[:, [0, 2, 1]].reshape(-1)
            prims.append({'attributes': a, 'indices': glb.acc(idx, 'SCALAR', 34963), 'material': midx})
            log('  %-8s %-22s %-6s %-48s tris=%d xương=%d' % (name, smr.m_GameObject.read().m_Name, kind, mat.shader[-48:], len(sub), len(joints)))
        meshes.append((smr.m_GameObject.read().m_Name, prims, joints, ibm))
    for n in skel.nodes:
        nd = {'name': n['name']}
        if any(abs(x) > 1e-7 for x in n['t']):
            nd['translation'] = n['t']
        if any(abs(a - b) > 1e-7 for a, b in zip(n['r'], [0, 0, 0, 1])):
            nd['rotation'] = n['r']
        if any(abs(x - 1) > 1e-6 for x in n['s']):
            nd['scale'] = n['s']
        if n['children']:
            nd['children'] = list(n['children'])
        glb.j['nodes'].append(nd)
    glb.j['nodes'][0] = {k: v for k, v in glb.j['nodes'][0].items() if k in ('name', 'children')}
    glb.j['nodes'][0]['name'] = name
    glb.j['scenes'][0]['nodes'] = [0]
    for nm, prims, joints, ibm in meshes:
        glb.j['meshes'].append({'name': nm, 'primitives': prims})
        glb.j['skins'].append({'joints': joints, 'inverseBindMatrices': acc_raw(glb, ibm, 5126, 'MAT4')})
        glb.j['nodes'].append({'name': nm + '_skin', 'mesh': len(glb.j['meshes']) - 1, 'skin': len(glb.j['skins']) - 1})
        glb.j['nodes'][0].setdefault('children', []).append(len(glb.j['nodes']) - 1)
    info = {}
    seen = set()
    for role, suf, loop in clips:
        _, anim, w = anim_node(suf)
        clip = next(p for p in anim.m_Animations if p.path_id).read()
        if clip.object_reader.path_id in seen:
            log('  %s %s: clip %s trùng clip trước, bỏ' % (name, role, clip.m_Name))
            continue
        seen.add(clip.object_reader.path_id)
        times, ch, miss = legacy_channels(clip, skel)
        off = w[:3, 3] - w0[:3, 3]
        ch[(0, 'translation')] = np.tile([off[0], off[1], -off[2]], (len(times), 1))
        arrs = [acc_raw(glb, times.astype(np.float32), 5126, 'SCALAR', True)]
        samplers, chans = [], []
        for (node, path), v in sorted(ch.items()):
            samplers.append({'input': arrs[0], 'output': acc_raw(glb, v.astype(np.float32), 5126, 'VEC4' if path == 'rotation' else 'VEC3'),
                             'interpolation': 'LINEAR'})
            chans.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': path}})
        glb.j['animations'].append({'name': role, 'samplers': samplers, 'channels': chans})
        info[role] = {'dur': round(float(times[-1]), 3), 'loop': loop, 'src': clip.m_Name}
        log('  %-8s clip %-10s <- %-28s %.2f s, %d kênh%s' % (name, role, clip.m_Name, times[-1], len(chans),
                                                            (', thiếu xương ' + ','.join(sorted(miss))) if miss else ''))
    path = os.path.join(OUT, name + '.glb')
    glb.write(path)
    size = [round(float(x), 2) for x in hi - lo]
    log('  -> %s %.0f KB, cỡ %s' % (path, os.path.getsize(path) / 1e3, size))
    return {'glb': 'art/items/%s.glb' % name, 'size': size, 'min': [round(float(x), 2) for x in lo], 'src': clips[0][1], 'clips': info}


def build_glb():
    os.makedirs(OUT, exist_ok=True)
    out = {'box': export_glb('box', 'Level_TrainTrack_B.unity#' + BOX_NODE, None, 256, box_root())}
    out.update({name: export_glb(name, suf, keep, cap) for name, suf, keep, cap in GLBS})
    out.update({name: export_rigged(name, clips) for name, clips in RIGGED})
    out.update({name: export_glb(name, suf, None, 256, pivot=True) for name, suf in FXGLBS})
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


# ---------------------------------------------------------------- vòng ngắm
AIM_PREFAB = 'fx_ui/propswarview/uifx_props_aiming_red_a_lod1.prefab'


def build_aim(px=256):
    """Vòng ngắm khoá mục tiêu (UIFX_Props_Aiming_Red_A): texture gốc là atlas mảnh (mũi nhọn, vạch), lưới phẳng
    UIFX_Props_Aiming_Green_A_01/_03 xếp các mảnh thành vòng. Nướng mỗi lưới (đã nhân _Color đỏ) thành một ảnh vuông để
    HUD 2D vẽ: art/items/ui/aim_<i>.png. Mặt phẳng lưới là XZ (y ~ 0)."""
    root = prefab(AIM_PREFAB)
    meshes, out = T.MeshCache(), {}
    i = 0
    for nm, world, on, comps in walk(root):
        rend = next((c for c in comps if c.type.name == 'MeshRenderer'), None)
        mf = next((c for c in comps if c.type.name == 'MeshFilter'), None)
        if rend is None or mf is None:
            continue
        M = meshes.get(mf.read().m_Mesh.deref_parse_as_object())
        mat = T.Mat(rend.read().m_Materials[0].deref_parse_as_object())
        slot = mat.albedo_slot or next(iter(mat.tex))
        src = np.asarray(mat.tex[slot].m_Texture.deref_parse_as_object().image.convert('RGBA'), np.float32) / 255
        if '_AlphaTex' in mat.tex:   # TransparentCommon: độ trong nằm ở texture riêng _AlphaTex
            am = mat.tex['_AlphaTex'].m_Texture.deref_parse_as_object().image
            am = am.getchannel('A') if 'A' in am.getbands() and am.getextrema()[-1][0] < 250 else am.convert('L')
            src[..., 3] = np.asarray(am.resize(src.shape[1::-1]), np.float32) / 255
        tint = mat.c.get('_Color') or mat.c.get('_TintColor') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
        su, sv, ou, ov = mat.st(slot)
        P, UV = M['pos'][:, [0, 2]], M['uv0'] * [su, sv] + [ou, ov]
        half = np.abs(P).max()
        XY = (P / half * 0.5 + 0.5) * (px - 1)
        XY[:, 1] = px - 1 - XY[:, 1]
        img = np.zeros((px, px, 4), np.float32)
        H, Wd = src.shape[:2]
        for tri in np.concatenate(M['subs']):
            a, b, c = XY[tri]
            x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
            x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
            gx, gy = np.meshgrid(np.arange(max(0, x0), min(px, x1 + 1)), np.arange(max(0, y0), min(px, y1 + 1)))
            if not gx.size:
                continue
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue
            w0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            w1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            w2 = 1 - w0 - w1
            m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            uv = w0[m, None] * UV[tri[0]] + w1[m, None] * UV[tri[1]] + w2[m, None] * UV[tri[2]]
            tx = np.clip((uv[:, 0] % 1) * (Wd - 1), 0, Wd - 1).astype(int)
            ty = np.clip((1 - uv[:, 1] % 1) * (H - 1), 0, H - 1).astype(int)
            col = src[ty, tx] * [tint['r'], tint['g'], tint['b'], tint['a']]
            cur = img[gy[m], gx[m]]
            a_ = col[:, 3:4] + cur[:, 3:4] * (1 - col[:, 3:4])   # chồng "over", alpha thẳng
            rgb = (col[:, :3] * col[:, 3:4] + cur[:, :3] * cur[:, 3:4] * (1 - col[:, 3:4])) / np.maximum(a_, 1e-6)
            img[gy[m], gx[m]] = np.concatenate([rgb, a_], 1)
        d = os.path.join(OUT, 'ui')
        os.makedirs(d, exist_ok=True)
        fn = 'aim_%d' % i
        Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(d, fn + '.png'), optimize=True)
        out[fn] = 'art/items/ui/%s.png' % fn
        log('  vòng ngắm %s <- %s (%d tam giác)' % (fn, nm, sum(len(x) for x in M['subs'])))
        i += 1
    return out


# ---------------------------------------------------------------- hạt
KEEP = ('kind', 'name', 'life', 'speed', 'size', 'rot', 'gravity', 'startColor', 'color', 'sizeOverLife', 'sheet', 'emit', 'shape',
        'render', 'blend', 'tex', 'tint', 'k', 'pos', 'duration', 'loop', 'mesh', 'active', 'velocity', 'simSpace', 'rotOverLife',
        'uvScroll', 'scale', 'startColorMin')


def build_fx():
    import export_fx_ui as E
    d = os.path.join(OUT, 'fx')
    os.makedirs(d, exist_ok=True)
    for fn in os.listdir(d):   # chạy lại thì bỏ texture không còn lớp nào dùng
        if fn.endswith('.webp'):
            os.remove(os.path.join(d, fn))
    cache = {}

    # export_fx_ui ghi texture vào art/fx (thư mục của nhánh VFX, bị xoá khi chạy lại bộ đó): ghi riêng vào art/items/fx.
    def export_tex(mi, maxdim=256, luma_alpha=False):
        mt = E.main_tex(mi)
        if mt is None:
            return None
        t = mt['obj'].read()
        at = mi['tex'].get('_AlphaTex')
        key = (t.m_Name, at['obj'].read().m_Name if at else None, luma_alpha)
        if key not in cache:
            im0 = t.image
            im = im0.convert('RGBA')
            if at is not None:
                a = at['obj'].read().image.convert('L')
                im.putalpha(a.resize(im.size, Image.BILINEAR) if a.size != im.size else a)
            # trộn alpha mà ảnh (kể cả _AlphaTex) đục hoàn toàn: shader gốc lấy độ trong từ độ sáng -> bản _la
            luma = luma_alpha and im.getchannel('A').getextrema()[0] >= 250
            if luma:
                im.putalpha(im0.convert('L'))
            # cùng ảnh có lớp dùng _AlphaTex, có lớp cộng màu không alpha: tên tệp tách theo nguồn alpha để khỏi ghi đè nhau
            safe = re.sub(r'[^A-Za-z0-9_]+', '_', t.m_Name).lower() + ('_la' if luma else '_a' if at is not None else '')
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
        out[key] = {'files': [rel], 'loop': False, 'vol': round(vol, 3), 'bus': 'sfx', 'dur': [round(A.wav_duration(os.path.join(GAME, rel)), 2)], 'note': note}
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
        v = dict(v)
        note = v.pop('note', '')
        block.append('  TD.AUDIO[%s] = %s;%s' % (json.dumps(k), js(v), ('   // ' + note) if note else ''))
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
    sfx = {m.group(1): dict(json.loads(m.group(2)), note=m.group(3) or '') for m in re.finditer(r'TD\.AUDIO\["([^"]+)"\] = (\{.*?\});(?:   // (.*))?', b)}
    return get(r'TD\.ITEM_ART = (\{.*\});'), get(r'TD\.ITEM_FX = (\{.*\});'), sfx


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    art, fx, sfx = load_prev()
    art = dict(art)
    if what in ('glb', 'all'):
        art['models'] = build_glb()
    if what in ('icons', 'all'):
        aim = build_aim()   # trước build_icons: môi trường atlas của export_fx_ui làm hỏng việc đọc Mesh sau đó
        art['icons'] = build_icons()
        art['icons'].update(aim)
    if what in ('fx', 'all'):
        fx = build_fx()
    if what in ('sfx', 'all'):
        sfx = build_sfx()
    write_data(art, fx, sfx)


if __name__ == '__main__':
    main()
