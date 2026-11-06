# -*- coding: utf-8 -*-
"""Rút cá mập 3D của Hố Xanh (Dave the Diver) thành glb có xương + clip gốc, kèm số liệu, tiếng và hạt.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_shark.py                      # mọi loài, tiếng, hạt
    python games/ho-xanh/tools/rip_shark.py Tiger_Shark audio    # vài loài / phần (audio, vfx)

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json), `npx` (gltfpack) và `ffmpeg`.
Chỉ import hàm của rip.py, level.py, rip_boat.py, không sửa chúng. Tệp tạm ghi vào D:\\hx-tmp\\shark (HX_TMP để đổi).

Ra:
  art/shark/<loài>.glb        lưới skinned + xương + mọi clip gốc của loài (gltfpack -cc -kn)
  art/shark/fx/*.png, shark_vfx.json   hạt máu / cắn / vệt bơi theo prefab gốc (cùng dạng dive_vfx.json)
  audio/shark_*.mp3           tiếng theo AniClipSoundEvent của từng clip
  data/shark_assets.js        window.HX_SHARKS

Nguồn [DtD] (đo 2026-09-25):
  - SA_<TID>_<Tên>.prefab (Fish/<A|B|C>/<thư mục>/Prefabs): gốc SABaseFishSystem, dưới Body là GameObject mang Animator
    (AnimatorOverrideController trên SAFishController) và SkinnedMeshRenderer. Độ phóng thế giới của GameObject Animator
    so với gốc prefab là `scale` (cá mập vây trắng: gốc ×3,2, mô hình ×0,3).
  - Avatar của Animator: m_RootMotionBoneIndex trỏ "Root/Transform". Clip QTE_Ready dời nút này 1,19 đơn vị (lao tới);
    SwimTurn xoay nó 180° quanh trục dọc (quay đầu). Dời thì tách ra `motion`, xoay thì giữ trong clip.
  - ScriptableObjects/Fish/SA_Fish/SA_<TID>_*.asset: số AI (RangeFindEnemy, SprintLimitTime, …) và AbilityDatas
    tuần tự hoá bằng Odin (SerializedBytes) — giải bằng odin_decode() bên dưới.
  - GameDataSheet/DR_GameData_Fish.json FishInfoData: HP, Damage, FishSizeType, FishRank, FishDimension.
  - <thư mục>/AnimationEvents/*@<clip>.fbx.asset: AniClipSoundEvent (soundKey) cho từng clip; khoá tra trong
    SFX_SoundData (valueData.audioClipName, volume). *_AnimationEvent.asset (_clipDatas): hạt gắn xương theo clip.
"""
import io, json, os, re, shutil, struct, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import numpy as np
from UnityPy.helpers.MeshHelper import MeshHandler

import rip
_IX = rip.bundle_index()
rip.IDX, rip.CABS = _IX['path'], _IX['cab']
import level
import rip_boat as rb

GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art', 'shark')
FX_DIR = os.path.join(ART, 'fx')
AUD = os.path.join(GAME, 'audio')
DATA = os.path.join(GAME, 'data')
TMP = os.environ.get('HX_TMP', r'D:\hx-tmp\shark')
PC = rip.PC
SA_DATA = 'Assets/ScriptableObjects/Fish/SA_Fish/'
MAX_TEX = 512   # mọi ảnh cá mập gốc ≤ 512 px (cá mập cưa 256, cá mập cookie 128)
# ItemIcon "<tên>_Thumbnail" (FishInfoData) là sprite trong một SpriteAtlas không có địa chỉ Addressables riêng, nên
# bundle_index không tra ra. Tìm bằng cách quét tên Sprite trong cả 3.967 bundle (~20 phút, 2026-09-25): mọi ảnh
# nhỏ cá mập Hố Xanh nằm ở bundle này.
THUMB_BUNDLE = 'c2ab483cbb67f8768d9087e5854a0f1b.bundle'
ICON_UP = 3     # sprite gốc 64×64 px nghệ thuật điểm ảnh: phóng ×3 kiểu điểm gần nhất cho thẻ bắt cá khỏi nhoè
level.MAX_TEX = MAX_TEX   # Glb.texture() đọc trần ảnh của level.py

# id game, vùng, prefab SA gốc (sau PC), TID ngày, TID đêm (bản hung dữ dùng chung mô hình)
SPECIES = [
    ('Whitetip_Reefshark', 'A', 'Fish/A/ReefShark/Prefabs/SA_2010025_Whitetip_Reefshark_Renew.prefab', 2010025, 2010055),
    ('Blacktip_Reefshark', 'A', 'Fish/A/ReefShark/Prefabs/SA_2010058_Blacktip_Reefshark.prefab', 2010058, None),
    ('Copper_Shark', 'A', 'Fish/A/Copper_Shark/Prefabs/SA_2010059_Copper_Shark.prefab', 2010059, None),
    ('Shortfin_Mako', 'A', 'Fish/A/Shortfin_Mako/Prefabs/SA_2010073_Shortfin_Mako.prefab', 2010073, None),
    ('Zebra_Shark', 'A', 'Fish/A/Zebra_Shark01/Prefabs/SA_2010074_Zebra_Shark01.prefab', 2010074, None),
    ('Thresher_Shark', 'A', 'Fish/A/Thresher_Shark01/Prefabs/SA_2010132_Thresher_Shark01.prefab', 2010132, None),
    ('Tiger_Shark', 'B', 'Fish/B/Tiger_Shark/Prefabs/SA_2010119_Tiger_Shark.prefab', 2010119, 2010128),
    ('Longnosesaw_Shark', 'B', 'Fish/B/Longnosesaw_Shark/Prefabs/SA_2010125_Longnosesaw_Shark.prefab', 2010125, 2010127),
    ('Smooth_Hammershark', 'B', 'Fish/B/Smooth_Hammershark01/Prefabs/SA_2010133_Smooth_Hammershark01.prefab', 2010133, None),
    ('Cookiecutter_Shark', 'C', 'Fish/C/Cookiecutter_Shark/Prefabs/SA_2010211_Cookiecutter_Shark.prefab', 2010211, None),
    ('Frilled_Shark', 'C', 'Fish/C/Frilled_Shark/Prefabs/SA_2010204_Frilled_Shark.prefab', 2010204, None),
    ('Megamouth_Shark', 'C', 'Fish/C/Megamouth_Shark/Prefabs/SA_2010210_Megamouth_Shark.prefab', 2010210, None),
]

# TID khác dùng chung prefab/mô hình của một loài (bản nhiệm vụ đặt trong IGPSet gốc): trỏ về loài, dùng số của bản ngày.
ALIAS_TIDS = {2010224: 'Megamouth_Shark'}   # SA_2010224_Megamouth_Shark_Mission (FishRank 0, cùng HP/Damage 2010210)

# Tên clip gốc trong SAFishController (bên trái của override) -> vai trò trong game.
ROLE_OF = [
    (r'_Normal_Swim_A_01$', 'swim'), (r'_Normal_Swim_B_01$', 'swimB'), (r'_Normal_Swim_C_01$', 'swimC'),
    (r'_Normal_SwimTurn_A_01$', 'turn'), (r'_Normal_Sprint_A_01$', 'sprint'),
    (r'^Attack0$', 'attack'), (r'^Attack1$', 'attack2'), (r'^Attack2$', 'attack3'),
    (r'^EmptyDie$', 'die'), (r'^EmptyIdle$', 'idle'), (r'^EmptyQTE_Ready$', 'qteReady'),
    (r'_QTE_Enter_A_01$', 'qteEnter'), (r'_QTE_Fail_A_01$', 'qteFail'), (r'_QTE_Success_A_01$', 'qteSuccess'),
]
# Clip lẻ trong thư mục mô hình mà controller không trỏ tới, theo tên (sau "@"): trúng đòn, choáng, bơi yếu.
EXTRA_ROLE = [(r'_Damage_A_01$', 'damage'), (r'_Sturn_A_01$', 'stun'), (r'_SwimWeak_A_01$', 'weak')]
ROOT_MOTION = 'Root/Transform'


def rel(p):
    return os.path.relpath(p, GAME).replace('\\', '/')


def rnd(v, n=4):
    return round(float(v), n) + 0.0


# ---------------------------------------------------------------- Odin
def odin_decode(b):
    """Odin Serializer, định dạng nhị phân (SerializedBytes của SerializedScriptableObject) -> dict/list thuần.
    Mỗi mục: 1 byte kiểu (có tên = lẻ, không tên = chẵn từ 15 trở lên), tên (1 byte cỡ ký tự + int32 độ dài),
    rồi giá trị. Nút tham chiếu/struct mở bằng 1..4, đóng bằng 5; mảng 6..7."""
    b = bytes(b)
    pos = [0]
    types = {}

    def rd(fmt):
        v = struct.unpack_from('<' + fmt, b, pos[0])[0]
        pos[0] += struct.calcsize('<' + fmt)
        return v

    def rstr():
        wide = b[pos[0]]
        pos[0] += 1
        n = rd('i')
        k = 2 * n if wide else n
        s = b[pos[0]:pos[0] + k].decode('utf-16-le' if wide else 'latin-1')
        pos[0] += k
        return s

    def rtype():
        t = b[pos[0]]
        pos[0] += 1
        if t == 47:
            i = rd('i')
            types[i] = rstr()
            return types[i]
        if t == 48:
            return types.get(rd('i'))
        if t == 46:
            return None
        raise ValueError('odin: mục kiểu %d ở %d' % (t, pos[0]))

    prim = {15: 'b', 17: 'B', 19: 'h', 21: 'H', 23: 'i', 25: 'I', 27: 'q', 29: 'Q', 31: 'f', 33: 'd'}

    def body():
        out = []
        while pos[0] < len(b):
            t = b[pos[0]]
            pos[0] += 1
            if t in (5, 7, 49):
                return out
            if t in (1, 2):
                name = rstr() if t == 1 else None
                ty = rtype()
                rd('i')
                out.append((name, ('node', ty, body())))
            elif t in (3, 4):
                name = rstr() if t == 3 else None
                ty = rtype()
                out.append((name, ('node', ty, body())))
            elif t == 6:
                rd('q')
                out.append((None, ('array', body())))
            elif t == 8:
                n, sz = rd('i'), rd('i')
                out.append((None, b[pos[0]:pos[0] + n * sz].hex()))
                pos[0] += n * sz
            elif t in (9, 10):
                name = rstr() if t == 9 else None
                out.append((name, {'$ref': rd('i')}))
            elif t in (11, 12):
                name = rstr() if t == 11 else None
                out.append((name, {'$ext': rd('i')}))
            elif t in (13, 14):
                name = rstr() if t == 13 else None
                out.append((name, {'$guid': b[pos[0]:pos[0] + 16].hex()}))
                pos[0] += 16
            elif t in (50, 51):
                name = rstr() if t == 50 else None
                out.append((name, {'$extstr': rstr()}))
            elif t in prim or t - 1 in prim:
                name = rstr() if t in prim else None
                out.append((name, rd(prim[t if t in prim else t - 1])))
            elif t in (39, 40):
                name = rstr() if t == 39 else None
                out.append((name, rstr()))
            elif t in (43, 44):
                name = rstr() if t == 43 else None
                out.append((name, bool(b[pos[0]])))
                pos[0] += 1
            elif t in (45, 46):
                out.append((rstr() if t == 45 else None, None))
            elif t in (37, 38):
                name = rstr() if t == 37 else None
                out.append((name, chr(rd('H'))))
            elif t in (35, 36, 41, 42):
                name = rstr() if t in (35, 41) else None
                pos[0] += 16
                out.append((name, None))
            else:
                raise ValueError('odin: mục %d ở %d' % (t, pos[0] - 1))
        return out

    def simp(v):
        if isinstance(v, tuple) and v[0] == 'array':
            return [simp(x) for _, x in v[1]]
        if isinstance(v, tuple) and v[0] == 'node':
            items = v[2]
            if items and all(n is not None for n, _ in items):
                d = {n: simp(x) for n, x in items}
                if v[1]:
                    d['$type'] = v[1].split(',')[0]
                return d
            if len(items) == 1 and items[0][0] is None:
                return simp(items[0][1])
            return [simp(x) for _, x in items]
        return v

    items = body()
    return {n: simp(x) for n, x in items}


def odin_of(tt):
    sd = tt.get('serializationData') or {}
    return odin_decode(sd['SerializedBytes']) if sd.get('SerializedBytes') else {}


# ---------------------------------------------------------------- tra asset
def asset_at(path, deps=False):
    """Object đầu tiên mà m_Container của bundle gắn với path."""
    env = level.load_with_deps(path)[0] if deps else rip.env_of(rip.IDX[path])
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k == path:
                    return ptr.asset
    raise KeyError('không thấy asset ' + path)


def sa_data_path(tid):
    hits = sorted(k for k in rip.IDX if k.startswith(SA_DATA + 'SA_%d_' % tid) and k.endswith('.asset')
                  and not re.search(r'(NPCAttack|mission)', k, re.I))
    return hits[0] if hits else None


def find_go(go, pred):
    if pred(go):
        return go
    for ch in level.transform_of(go).m_Children:
        r = find_go(ch.read().m_GameObject.read(), pred)
        if r is not None:
            return r
    return None


_SFX = {}


def sound_table(env):
    """SFX_SoundData: soundKey -> (audioClipName, volume)."""
    if not _SFX:
        for o in env.objects:
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                tt = o.read_typetree()
            except Exception:
                continue
            if tt.get('m_Name') == 'SFX_SoundData':
                sd = tt['_SoundData']
                for k, v in zip(sd['keyData'], sd['valueData']):
                    _SFX[k] = (v['audioClipName'], rnd(v['volume'], 3))
                break
    return _SFX


# ---------------------------------------------------------------- GLB
FLIP = np.diag([1.0, 1.0, -1.0, 1.0])


class SharkGlb(level.Glb):
    """level.Glb + cây nút, skin và animation. Lưới skinned đặt ở nút gốc riêng (TRS đơn vị): GLTFLoader gắn
    xương với matrixWorld của nút lưới, lưới nằm dưới nút phóng ×0,3 là bị phóng hai lần."""

    def __init__(self):
        super().__init__()
        self.tree, self.anims, self.skins, self.roots = [], [], [], []

    def write(self, path):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'ho-xanh/tools/rip_shark.py'},
            'scene': 0, 'scenes': [{'nodes': self.roots}],
            'nodes': self.tree, 'meshes': self.meshes, 'materials': self.materials,
            'textures': self.textures, 'images': self.images, 'skins': self.skins,
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                         {'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
            'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}],
            'animations': self.anims,
        }
        js = json.dumps(gltf, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)


def unity_trs(t):
    """Transform Unity -> (t, q, s) glTF: lật trục z (vị trí z đổi dấu, quaternion đổi dấu x và y)."""
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    return [rnd(p.x, 5), rnd(p.y, 5), rnd(-p.z, 5)], [rnd(-q.x, 6), rnd(-q.y, 6), rnd(q.z, 6), rnd(q.w, 6)], \
        [rnd(s.x, 5), rnd(s.y, 5), rnd(s.z, 5)]


def build_tree(g, ago):
    """Cây nút từ GameObject mang Animator trở xuống. -> {đường dẫn tương đối: chỉ số nút}, {path_id Transform: nút}."""
    by_path, by_tf = {}, {}

    def add(go, path):
        t = level.transform_of(go)
        tr, q, s = unity_trs(t)
        i = len(g.tree)
        g.tree.append({'name': go.m_Name, 'translation': tr, 'rotation': q, 'scale': s})
        by_path[path] = i
        by_tf[t.object_reader.path_id] = i
        kids = []
        for ch in t.m_Children:
            c = ch.read().m_GameObject.read()
            kids.append(add(c, (path + '/' if path else '') + c.m_Name))
        if kids:
            g.tree[i]['children'] = kids
        return i

    add(ago, '')
    return by_path, by_tf


def skinned_mesh(g, smr, by_tf, role):
    """SkinnedMeshRenderer -> mesh glTF có JOINTS_0/WEIGHTS_0 + skin (inverseBindMatrices = bindpose gốc, lật z)."""
    r = smr.read()
    me = r.m_Mesh.read()
    h = MeshHandler(me)
    h.process()
    n = h.m_VertexCount
    pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3] * [1, 1, -1]
    nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] * [1, 1, -1]
    uv = np.array(h.m_UV0, dtype=np.float32).reshape(n, -1)[:, :2].copy()
    uv[:, 1] = 1 - uv[:, 1]
    w = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1)
    ix = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1)[:, :w.shape[1]]
    if w.shape[1] < 4:
        w = np.hstack([w, np.zeros((n, 4 - w.shape[1]))])
        ix = np.hstack([ix, np.zeros((n, 4 - ix.shape[1]), np.int64)])
    w, ix = w[:, :4], ix[:, :4]
    w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
    w[w == 0] = 0
    ix[w == 0] = 0
    attrs = g.prim_attrs(pos, nrm, uv)
    attrs['JOINTS_0'] = g.accessor(ix.astype(np.uint16), 5123, 'VEC4', 34962)
    attrs['WEIGHTS_0'] = g.accessor(w.astype(np.float32), 5126, 'VEC4', 34962)
    mats = [g.material(m.read(), role) for m in r.m_Materials if m.m_PathID]
    prims = []
    for i, tris in enumerate(h.get_triangles()):
        if len(tris) and i < len(mats):
            idx = np.array(tris, dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
            prims.append({'attributes': attrs, 'indices': g.accessor(idx, 5125, 'SCALAR', 34963), 'material': mats[i]})
    g.meshes.append({'name': me.m_Name, 'primitives': prims})
    joints = [by_tf[b.m_PathID] if b.m_PathID in by_tf else by_tf[b.read().object_reader.path_id] for b in r.m_Bones]
    ibm = np.stack([(FLIP @ level.mat4(b) @ FLIP).T.astype(np.float32) for b in me.m_BindPose])
    g.skins.append({'joints': joints, 'inverseBindMatrices': g.accessor(ibm.reshape(len(joints), 16), 5126, 'MAT4', None)})
    # tư thế nghỉ: đỉnh đã skin theo xương đang đặt trong prefab (để đo khung bao)
    return me, h, n, len(g.meshes) - 1, len(g.skins) - 1


def rest_world(g, root_matrix):
    """Ma trận thế giới glTF của mọi nút (tư thế nghỉ), gốc = root_matrix."""
    out = {}

    def trs_m(nd):
        t, q, s = nd['translation'], nd['rotation'], nd['scale']
        x, y, z, w = q
        R = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m = np.eye(4)
        m[:3, :3] = R * np.array(s)
        m[:3, 3] = t
        return m

    def walk(i, parent):
        m = parent @ trs_m(g.tree[i])
        out[i] = m
        for c in g.tree[i].get('children', []):
            walk(c, m)

    walk(0, root_matrix)
    return out


# ---------------------------------------------------------------- clip
def role_of(orig):
    for pat, role in ROLE_OF:
        if re.search(pat, orig or ''):
            return role
    return None


def species_clips(ago):
    """[(vai trò | None, object clip)] của controller trên Animator, không lặp. Controller override: chỉ lấy clip
    override (clip nền SAFishController là của cá mập vây trắng, xương loài khác không khớp)."""
    ctrl = rb.comp(ago, 'Animator').read().m_Controller.read()
    out, seen = [], {}
    if type(ctrl).__name__ == 'AnimatorOverrideController':
        pairs = []
        for cl in ctrl.m_Clips:
            if not cl.m_OverrideClip.m_PathID:
                continue
            orig = cl.m_OriginalClip.read().m_Name if cl.m_OriginalClip.m_PathID else ''
            pairs.append((role_of(orig), cl.m_OverrideClip.deref()))
    else:
        pairs = [(None, p.deref()) for p in ctrl.m_AnimationClips if p.m_PathID]
    for role, o in pairs:
        k = (o.assets_file.name, o.path_id)
        if k in seen:
            if role and not out[seen[k]][0]:
                out[seen[k]] = (role, o)
            elif role:
                out.append((role, o))   # cùng một clip cho hai vai (cá mập vằn: sprint = attack)
            continue
        seen[k] = len(out)
        out.append((role, o))
    return ctrl.m_Name, out


def extra_clips(model):
    """Clip trong <model>@*.fbx mà controller không dùng nhưng có vai (trúng đòn, choáng, bơi yếu)."""
    out = []
    for k in sorted(rip.IDX):
        base = os.path.basename(k)
        m = re.match(r'(?i)%s@(.+)\.fbx$' % re.escape(model), base)
        if not m:
            continue
        role = next((r for pat, r in EXTRA_ROLE if re.search(pat, m.group(1))), None)
        if not role:
            continue
        env = rip.env_of(rip.IDX[k])
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for kk, ptr in o.read().m_Container:
                    if kk == k and ptr.asset.type.name == 'AnimationClip':
                        out.append((role, ptr.asset.deref()))
    return out


def quat_seq(vals):
    """Unity quaternion -> glTF (lật z), giữ cùng bán cầu giữa hai mẫu liên tiếp."""
    arr = np.array([[-v[0], -v[1], v[2], v[3]] for v in vals], dtype=np.float64)
    arr /= np.maximum(np.linalg.norm(arr, axis=1, keepdims=True), 1e-9)
    for i in range(1, len(arr)):
        if np.dot(arr[i], arr[i - 1]) < 0:
            arr[i] = -arr[i]
    return arr.astype(np.float32)


def add_clip(g, d, by_path, rest_w, name):
    """Clip đã giải (rb.decode_clip) -> animation glTF. Dời của nút root motion tách ra: -> motion [[t, dx, dy]]
    theo hệ gốc prefab (m, trước khi nhân scale), None nếu clip không dời."""
    fps = d.get('fps', 30)
    chans, samps, motion, unknown = [], [], None, 0
    for path, tr in sorted(d.get('tracks', {}).items()):
        ni = by_path.get(path)
        if ni is None:
            unknown += 1
            continue
        if 'euler' in tr:
            raise SystemExit('clip %s: rãnh euler ở %s chưa hỗ trợ' % (d['name'], path))
        for key, gpath in (('pos', 'translation'), ('quat', 'rotation'), ('scale', 'scale')):
            vals = tr.get(key)
            if not vals:
                continue
            if key == 'pos' and path == ROOT_MOTION:
                if len(vals) > 1:
                    parent = [i for i, nd in enumerate(g.tree) if ni in nd.get('children', [])][0]
                    R = rest_w[parent][:3, :3]
                    p0 = np.array([vals[0][0], vals[0][1], -vals[0][2]])
                    step = max(1, int(round(fps / 10)))
                    seq = []
                    for i in list(range(0, len(vals), step)) + [len(vals) - 1]:
                        v = vals[i]
                        dv = R @ (np.array([v[0], v[1], -v[2]]) - p0)
                        seq.append([rnd(min(d['length'], i / fps), 3), rnd(dv[0], 4), rnd(dv[1], 4)])
                    if max(abs(s[1]) + abs(s[2]) for s in seq) > 0.01:
                        motion = seq
                continue   # vị trí nút root motion giữ tư thế nghỉ
            if len(vals) == 1:
                times, vals = [0.0, d['length']], [vals[0], vals[0]]
            else:
                times = [min(d['length'], i / fps) for i in range(len(vals))]
            tin = g.accessor(np.array(times, dtype=np.float32).reshape(-1, 1), 5126, 'SCALAR', None, True)
            if key == 'quat':
                arr = quat_seq(vals)
            elif key == 'pos':
                arr = np.array([[v[0], v[1], -v[2]] for v in vals], dtype=np.float32)
            else:
                arr = np.array(vals, dtype=np.float32)
            tout = g.accessor(arr, 5126, 'VEC4' if key == 'quat' else 'VEC3', None)
            samps.append({'input': tin, 'output': tout, 'interpolation': 'LINEAR'})
            chans.append({'sampler': len(samps) - 1, 'target': {'node': ni, 'path': gpath}})
    if chans:
        g.anims.append({'name': name, 'channels': chans, 'samplers': samps})
    return motion, unknown, len(chans)


# ---------------------------------------------------------------- sự kiện clip (tiếng, hạt)
def clip_events(folder, clip_names):
    """AnimationEvents/*.fbx.asset trong thư mục loài -> {tên clip: [[giây, soundKey], ...]}."""
    out = {}
    pre = PC + folder + '/AnimationEvents/'
    for k in sorted(rip.IDX):
        if not (k.startswith(pre) and re.search(r'(?i)\.fbx\.asset$', k)):
            continue
        obj = asset_at(k)
        data = odin_of(obj.read_typetree()).get('_data') or {}
        clip = None
        try:
            refs = obj.read().serializationData.ReferencedUnityObjects
            clip = refs[data['targetAni']['$ext']].deref().read().m_Name
        except Exception:
            m = re.search(r'@(.+)\.fbx\.asset$', k, re.I)
            clip = m.group(1) if m else None
        if clip not in clip_names:
            continue
        for e in data.get('events') or []:
            if (e.get('$type') or '').endswith('AniClipSoundEvent') and e.get('soundKey'):
                out.setdefault(clip, []).append([rnd(e.get('<eventTime>k__BackingField') or 0, 3), e['soundKey']])
    return out


def fx_events(ago, clip_names, recipes):
    """UnityAnimationEventHandler.animationEventData trên GameObject Animator (*_AnimationEvent.asset, _clipDatas):
    hạt gắn xương theo clip -> {clip: [[giây, tên hạt, tên xương]]}. Công thức hạt ghi vào recipes (tên -> công thức).
    Cá mập rạn vây đen gốc trỏ nhầm sang Tiger_Shark01_AnimationEvent (tên clip không khớp) nên không có hạt nào."""
    h = None
    for c in ago.m_Component:
        if c.component.type.name == 'MonoBehaviour':
            mb = c.component.read()
            if level.script_name(mb) == 'UnityAnimationEventHandler' and mb.animationEventData.m_PathID:
                h = mb
    if h is None:
        return {}
    out = {}
    for cd in h.animationEventData.deref().read()._clipDatas:
        if cd._animationName not in clip_names:
            continue
        for ev in cd.eventDatas:
            for ef in ev.effectDatas:
                if not ef.prefab.m_PathID:
                    continue
                go = ef.prefab.deref().read()
                if go.m_Name not in recipes:
                    cache = {}
                    t = level.transform_of(go)
                    W = level.world(t, cache)
                    r = rb.recipe_more(go, np.linalg.inv(W), rb.world_quat(t), cache, src=go.m_Name)
                    for e in r['emitters']:
                        if e.get('img'):
                            e['img'] = 'art/shark/fx/' + os.path.basename(e['img'])
                    recipes[go.m_Name] = r
                    print('    hạt %-56s %2d emitter' % (go.m_Name, len(r['emitters'])))
                out.setdefault(cd._animationName, []).append([rnd(ev.time, 3), go.m_Name, ef.nodeName.strip()])
    return out


# ---------------------------------------------------------------- một loài
def ai_numbers(tid):
    p = sa_data_path(tid)
    if not p:
        return {}
    tt = asset_at(p).read_typetree()
    keep = ('AggressionType', 'SwimSpeed', 'runToHomeSpeed', 'FishBattleSpeedRate', 'RotateSpeed', 'RangeFindEnemy',
            'SprintLimitTime', 'CoolTimeSprintDecision', 'RangeAbleToSprintAttack', 'LeastAngleToSprint', 'MaxRangeCanFollow',
            'TurnWeigh', 'SwimWeigh', 'SprintWeigh', 'LimitTimeFindEnemyFromRun')
    ai = {k: rnd(tt[k], 3) for k in keep if k in tt}
    ab = {}
    for a in odin_of(tt).get('AbilityDatas') or []:
        t = a.get('$type')
        if t == 'SABiteData':
            ab['bite'] = {'rate': rnd(a['RateToByte'], 3), 'cool': rnd(a['biteSkillCoolTime'], 3)}
        elif t == 'DefaultSprintData':
            ab['sprint'] = {'speed': rnd(a['SprintSpeed'], 3)}
        elif t == 'QTE_ReadyAble':
            ab['qte'] = {'range': rnd(a['range'], 3), 'angle': rnd(a['angle'], 3), 'cool': rnd(a['CoolTimeAfterAction'], 3),
                         'sprint': rnd(a['sprintDuration'], 3), 'accel': rnd(a['AccelateRate'], 3)}
        elif t == 'SARageData':
            ab['rage'] = {'time': rnd(a['ConsistTime'], 3), 'afterAttack': rnd(a['LeastTimeDecisionAFTAfterLastAttack'], 3)}
        elif t not in (None, 'AniClipEventData', 'InitDefaultMoveable'):
            ab.setdefault('other', []).append(t)
    ai['abilities'] = ab
    ai['src'] = p
    return ai


def export_species(sid, zone, prefab, tid, tid_night, sheet, sounds, recipes):
    path = PC + prefab
    env, _ = level.load_with_deps(path)
    root = level.prefab_root(env, path)
    ago = find_go(root, lambda go: rb.comp(go, 'Animator') is not None)
    smr_go = find_go(ago, lambda go: rb.comp(go, 'SkinnedMeshRenderer') is not None)
    cache = {}
    W_root = level.world(level.transform_of(root), cache)
    W_anim = level.world(level.transform_of(ago), cache)
    local = np.linalg.inv(W_root) @ W_anim        # GameObject Animator so với gốc prefab (gồm Body)
    scale = rnd(np.linalg.norm(W_anim[:3, 0]), 4)  # độ phóng thế giới của mô hình

    g = SharkGlb()
    by_path, by_tf = build_tree(g, ago)
    # nút 0 = GameObject Animator mang cả phép phóng của gốc prefab: glb ra đúng cỡ mét, JS chỉ đặt vị trí/hướng
    Lg = FLIP @ W_anim @ FLIP
    Lg[:3, 3] = (FLIP @ local @ FLIP)[:3, 3] * np.linalg.norm(W_root[:3, 0])
    g.tree[0]['translation'] = [rnd(v, 5) for v in Lg[:3, 3]]
    g.tree[0]['scale'] = [rnd(np.linalg.norm(Lg[:3, i]), 5) for i in range(3)]
    me, h, n, mesh_i, skin_i = skinned_mesh(g, rb.comp(smr_go, 'SkinnedMeshRenderer'), by_tf, 'shark')
    g.skins[skin_i]['skeleton'] = 0
    g.tree.append({'name': smr_go.m_Name + '_skin', 'mesh': mesh_i, 'skin': skin_i})
    g.roots = [0, len(g.tree) - 1]
    rest_w = rest_world(g, np.eye(4))

    # khung bao tư thế nghỉ (m, glTF): đỉnh skin theo xương nghỉ
    joints = g.skins[skin_i]['joints']
    ibm = [FLIP @ level.mat4(b) @ FLIP for b in me.m_BindPose]
    bones = [rest_w[j] @ ibm[k] for k, j in enumerate(joints)]
    pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3] * [1, 1, -1]
    w = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1)
    ix = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1)[:, :w.shape[1]]
    blend = (np.stack(bones)[ix] * w[:, :, None, None]).sum(1)
    P = np.einsum('nij,nj->ni', blend, np.c_[pos, np.ones(n)])[:, :3]
    lo, hi = P.min(0), P.max(0)

    def node_pos(pat):
        for pth, i in by_path.items():
            if re.search(pat, pth.split('/')[-1], re.I):
                return rest_w[i][:3, 3]
        return None
    head, tail = node_pos(r'^Bip001 Head$'), node_pos(r'^Bip001 Tail$')
    face = 1 if (head - tail)[0] > 0 else -1
    mouth = node_pos(r'^BiteTransform$')
    if mouth is None:
        mouth = node_pos(r'^Bip001 Mouth$')

    ctrl_name, ctrl_clips = species_clips(ago)
    clips = ctrl_clips + extra_clips(re.sub(r'\(Clone\)$', '', ago.m_Name))
    paths = rb.path_names(ago)
    roles, info, done = {}, {}, {}
    for role, co in clips:
        k = (co.assets_file.name, co.path_id)
        if k not in done:
            d = rb.decode_clip(co, paths)
            if not d.get('tracks'):
                continue
            n_before = len(g.anims)
            motion, unknown, nch = add_clip(g, d, by_path, rest_w, d['name'])
            if not nch or unknown > nch:
                del g.anims[n_before:]
                print('    bỏ clip %s: %d rãnh không khớp xương' % (d['name'], unknown))
                continue
            done[k] = d['name']
            info[d['name']] = {'len': d['length'], 'loop': d['loop']}
            if motion:
                info[d['name']]['motion'] = motion
        if role and k in done:
            roles.setdefault(role, done[k])
    raw = os.path.join(TMP, sid + '.raw.glb')
    g.write(raw)
    out = os.path.join(ART, sid + '.glb')
    gltfpack(raw, out)

    for c, evs in clip_events(prefab.split('/Prefabs/')[0], set(info)).items():
        info[c]['sfx'] = evs
        sounds.update(k for _, k in evs)
    for c, evs in fx_events(ago, set(info), recipes).items():
        info[c]['fx'] = evs

    f = sheet[tid]
    fn = sheet.get(tid_night) if tid_night else None
    rec = {
        'id': sid, 'tid': tid, 'tids': [tid] + ([tid_night] if tid_night else []) + [t for t, a in sorted(ALIAS_TIDS.items()) if a == sid],
        'zone': zone, 'name': f['FishName'].replace('_', ' '),
        'hp': f['HP'], 'damage': f['Damage'], 'size': f['FishSizeType'], 'cm': f['FishDimension'], 'rank': f['FishRank'],
        'activeType': f['FishActiveType'], 'qteLevel': f['QteLevel'], 'carvable': f['CarvableCount'],
        'night': {'tid': tid_night, 'hp': fn['HP'], 'damage': fn['Damage'], 'activeType': fn['FishActiveType']} if fn else None,
        'glb': rel(out), 'kb': os.path.getsize(out) // 1024, 'prefab': prefab, 'controller': ctrl_name, 'ai': ai_numbers(tid),
        'scale': scale, 'face': face,
        # khung bao tư thế nghỉ (m, hệ gốc prefab, mặt quay về face): [minX, minY, maxX, maxY]
        'bounds': [rnd(lo[0], 3), rnd(lo[1], 3), rnd(hi[0], 3), rnd(hi[1], 3)],
        'mouth': [rnd(mouth[0], 3), rnd(mouth[1], 3)] if mouth is not None else None,
        'roles': roles, 'clips': info,
    }
    print('  %-20s %4d KB  hp %3d dmg %3d  x%.2f mat %+d  dai %.2f m  clip %d  vai %s' % (
        sid, rec['kb'], rec['hp'], rec['damage'], scale, face, hi[0] - lo[0], len(info), ','.join(sorted(roles))))
    return rec


def gltfpack(raw, out):
    # -kn giữ nút có tên (BiteTransform, Bip001 Head… để JS đo miệng, gắn hạt), -ke extras, -km tên material,
    # -ac giữ rãnh hằng. gltfpack mặc định lấy mẫu lại clip 30 Hz và lượng tử hoá rãnh: clip vẫn còn đủ.
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-ke', '-kn', '-ac'],
                   check=True, stdout=subprocess.DEVNULL)


# ---------------------------------------------------------------- tiếng
def rip_audio(keys):
    """soundKey (SFX_SoundData) -> audio/shark_<clip>.mp3. -> ({khoá audio: {src, kind, vol}}, {soundKey: khoá audio})."""
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    table = sound_table(level.load_with_deps(PC + SPECIES[0][2])[0])
    out, by_key = {}, {}
    for key in sorted(keys):
        if key not in table:
            print('  thiếu khoá tiếng', key)
            continue
        clip, vol = table[key]
        akey = 'shark_' + re.sub(r'[^a-z0-9]+', '_', clip.lower()).strip('_')
        by_key[key] = akey
        if akey in out:
            continue
        try:
            path = rip.find_path(clip + '.wav')
        except KeyError:
            print('  thiếu tiếng', clip)
            del by_key[key]
            continue
        ac = [o for o in rip.objects_for(path) if type(o).__name__ == 'AudioClip' and o.m_Name == clip]
        if not ac:
            print('  thiếu tiếng', clip)
            del by_key[key]
            continue
        tmp = os.path.join(TMP, akey + '.wav')
        open(tmp, 'wb').write(list(ac[0].samples.values())[0])
        dst = os.path.join(AUD, akey + '.mp3')
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-ac', '1', '-b:a', '64k', dst],
                       check=True)
        out[akey] = {'src': 'audio/%s.mp3' % akey, 'kind': 'sfx', 'vol': vol, 'clip': clip}
        print('  tiếng %-28s <- %s' % (akey, key))
    return out, by_key


# ---------------------------------------------------------------- ảnh nhỏ
def rip_icons(recs, sheet):
    want = {sheet[r['tid']]['ItemIcon']: r for r in recs}
    found = {}

    def read(env):
        for o in env.objects:
            if o.type.name == 'Sprite':
                sp = o.read()
                if sp.m_Name in want and sp.m_Name not in found:
                    found[sp.m_Name] = rb.sprite_canvas(sp)[0]
    rip.with_deps(THUMB_BUNDLE, read)
    for name, r in want.items():
        if name not in found:
            print('  thiếu ảnh nhỏ', name)
            continue
        img = found[name]
        img = img.resize((img.width * ICON_UP, img.height * ICON_UP), 0)   # 0 = NEAREST
        dst = os.path.join(ART, r['id'] + '_icon.png')
        img.save(dst, optimize=True)
        r['icon'] = rel(dst)
        print('  ảnh nhỏ %-20s <- %s' % (r['id'], name))


# ---------------------------------------------------------------- MAIN
def write_data(recs, audio, by_key):
    for r in recs:
        for c in r['clips'].values():
            if 'sfx' in c:
                c['sfx'] = [[t, by_key[k]] for t, k in c['sfx'] if k in by_key]
    js = ('// Sinh bởi tools/rip_shark.py — đừng sửa tay.\n'
          '// [DtD]: DR_GameData_Fish (hp, damage, size, cm, rank), SAFishData (ai), prefab SA_* (scale, bounds, mouth), clip gốc.\n'
          'window.HX_SHARKS = ' + json.dumps({'species': recs, 'audio': audio}, ensure_ascii=False, indent=1) + ';\n')
    with open(os.path.join(DATA, 'shark_assets.js'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)


def main():
    args = sys.argv[1:]
    want = [s for s in SPECIES if s[0] in args] or SPECIES
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(ART, exist_ok=True)
    sheet = rip.load_fish_sheet()
    shutil.rmtree(FX_DIR, ignore_errors=True)
    os.makedirs(FX_DIR)
    rb.FXDIR, rb.FXTC = FX_DIR, {}
    sounds, recs, recipes = set(), [], {}
    import gc
    for sid, zone, prefab, tid, tidn in want:
        gc.collect()
        recs.append(export_species(sid, zone, prefab, tid, tidn, sheet, sounds, recipes))
    with open(os.path.join(FX_DIR, 'shark_vfx.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(recipes, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    rip_icons(recs, sheet)
    audio, by_key = rip_audio(sounds)
    write_data(recs, audio, by_key)


if __name__ == '__main__':
    main()
