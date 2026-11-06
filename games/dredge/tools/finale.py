"""Hai cảnh kết (W6b, WORLD-GAPS.md §2.3 / §6) -> data/finale.js + art/finale/{bad,good,ruins}.bin + art/finale/*.webp + art/finale/audio/*.mp3.

Chạy:  python -I games/dredge/tools/finale.py          (~40 s: đọc Game.unity 168 MB một lần; cần ffmpeg cho 3 clip tiếng còn thiếu)
Đọc:   MonoBehaviour/FinaleCutscene_Bad.playable, FinaleCutscene_Good.playable (TimelineAsset: Activation / Animation / Audio / Signal / Marker track,
       AnimationPlayableAsset m_Position + m_EulerAngles, m_InfiniteClip, SignalEmitter m_Time + SignalAsset), MonoBehaviour/*.asset (SignalEmitter
       của track Markers trong Bad), Scenes/Game.unity:
         InspectPOIs/Finale_Inspect/FinaleCutsceneLogic (FinaleCutsceneLogic.cs: director, existingMarrowsObjects, ruinedMarrowsPrefab, creditsVCam)
         PlayableDirector &122906: m_SceneBindings (track -> Animator / AudioSource / GameObject), một director cho cả hai timeline
         cây Finale_Inspect (BadEndingCutsceneContainer, GoodEndingCutsceneContainer, GoodEndingCreditsContainer, CameraLookAt) +
         CinematicCameraRigs/Credits (Credits_VCam, CreditsCamLookAt): Transform, MeshFilter/MeshRenderer, SkinnedMeshRenderer, SpriteRenderer,
         CinemachineVirtualCamera (m_Lens.FieldOfView, m_LookAt, m_Priority) + CinemachineComposer của con "cm" (m_ScreenX/Y), AudioSource
         TheMarrows/Islands/GreaterMarrow/GM_Town + TheMarrows/Props/Lighthouse (DestroyGreaterMarrow ẩn hai cây này)
       AnimationClip/*.anim (Recorded*, Circle_0, Chomp_0), Mesh/*.asset, Material/*.mat, Texture2D/*.png, Sprite/*.asset,
       GameObject/GM_RuinedTown.prefab (ruinedMarrowsPrefab), AudioClip + Audio/** (clip của Audio track), art/world/instances.bin + world.json.
Ra:    window.DR_FINALE = { src, nodes[], roots{}, meshes{}, mats{}, tex{}, anims{}, timelines{bad, good}, audio{}, ruins{}, gm{inst[], buoys[]}, bins{} }
         nodes[i] = { n tên, p cha (-1 = gốc thế giới), t [px,py,pz, qx,qy,qz,qw, sx,sy,sz] (three.js), a active, r? renderer, vc? vcam, ps? hệ hạt }
         timelines[k] = { len, signals [[t, SignalAsset]], tracks [{ type 'anim'|'act'|'audio', node, clips[...], inf? }] }
         anims[tên] = { len, fps, n, ch [{ path, k 'p'|'q'|'s', n, off, lo?, hi? }], fl [{ path, cls, attr, keys [[t, v, in, out]] }] } (khối Int16 trong bin)
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w), tam giác đảo chiều, bindpose S·M·S).
Timeline (Unity Timeline 1.x): AnimationPlayableAsset áp offset cho nút gốc của clip: vị trí = Euler(m_EulerAngles)·p_clip + m_Position,
       quay = Euler(m_EulerAngles)·q_clip (chỉ khi clip có đường cong quay gốc); nướng sẵn vào mẫu ở đây. Ngoại suy trước/sau (1 = Hold), trộn hai
       clip chồng nhau (m_BlendIn/OutDuration, -1 = tự tính theo phần chồng) và dải ease/blend theo m_MixInCurve (0->1, tiếp tuyến 0) do JS làm.
Bẫy:   `[BẪY ĐÃ SẬP]` Animation Track (3) của Good (clip Circle/Chomp của vòng thân Leviathan) gắn vào Animator của Credits_VCam trong m_SceneBindings,
       không phải Cinematic_LeviathanCoils: đường dẫn CoilsCtrl/... không khớp nên bản gốc KHÔNG chạy clip đó; vòng thân đứng ở tư thế lưu trong cảnh,
       nằm hẳn dưới mặt nước (đỉnh y < 0) => không xuất mesh vòng thân (tiết kiệm ~2,5 MB). Thuộc tính vật liệu trong clip bị AssetRipper ghi thành
       "material.path_0x...": không giải được tên, bỏ qua [ĐỀ XUẤT]. Marker của Bad nằm trong tệp SignalEmitter riêng (MonoBehaviour/*.asset).
Rerunnable: cùng đầu vào ra cùng đầu ra (từng byte; mp3 do ffmpeg -fflags +bitexact).
"""
import io, json, math, os, re, shutil, struct, subprocess, sys

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import angler as AN    # noqa: E402  (Scene, load_doc, yaml_body, guid_path, rnd, vec, conv_q)
import mindsucker as MS  # noqa: E402  (read_mesh_raw, herm, comp_keys, fl, asset_name, audio_path)

GAME = os.path.dirname(HERE)
ASSETS = AN.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'finale.js')
OUT_ART = os.path.join(GAME, 'art', 'finale')
OUT_SND = os.path.join(OUT_ART, 'audio')
AUDIO_JS = os.path.join(GAME, 'data', 'audio.js')
PLAYABLE = {'bad': 'FinaleCutscene_Bad.playable', 'good': 'FinaleCutscene_Good.playable'}
FPS_ROOT = 30   # [ĐỀ XUẤT] mẫu cho nút gốc / camera (clip ghi tay 60 khóa/giây ở rung camera Recorded (2)_8: 531 khoá / 46 s ≈ 11,5/s)
FPS_BONE = 15   # [ĐỀ XUẤT] mẫu cho xương (Julie 2-5 khoá / 40 s; Leviathan bake 30 khung/giây, 15 đủ ở tầm camera cảnh kết)
TEX = {'hero': 512, 'small': 256}   # [ĐỀ XUẤT] cạnh lớn nhất của texture (gốc 1024-2048), giữ ngân sách art/finale <= 4 MB
SKIP_TEX = {'_Texture2DAsset_33a40611635a40b8a15b88b0c3550250_Out_0', '_SampleTexture2D_9698af05d8cf4dae9cb12534835649ea_Texture_1',
            '_Texture2DAsset_d755a42399464d1ca4e254bcfb033bd5_Out_0'}   # nhiễu / LUT dùng chung của Shader Graph, không phải ảnh của vật
# con của Finale_Inspect không thuộc cảnh kết (js/poi.js / js/finale.js lo): chỉ giữ một nút rỗng để đường cong m_IsActive có chỗ trỏ
EXT = {'InspectionGlint', 'BadEndingBeam', 'ReturnLighthouseBeam', 'InspectPOI_VCamStatic', 'AutoMoveDestination'}
NO_MESH = re.compile(r'^ShimmerWarpEffect')   # ShimmerWarp_Shader: méo không gian sau lưng (grab pass) — web không dựng [ĐỀ XUẤT]
# hệ hạt chạy qua DRParticles (tools/particles.py NAMED, khối "vòng 8 W6b"): đường dẫn GameObject -> tên hệ
PARTICLES = {
    'Finale_Inspect/BadEndingCutsceneContainer/Flashes': 'FinaleFlashes',
    'Finale_Inspect/BadEndingCutsceneContainer/Julie/Embers': 'FinaleJulieEmbers',
    'Finale_Inspect/BadEndingCutsceneContainer/Julie/JulieFoamParticles': 'FinaleJulieFoam',
    'Finale_Inspect/BadEndingCutsceneContainer/BuoyantMusicBoxContaner/MusicBox/EmberParticles': 'FinaleMusicBoxEmbers',
    'Finale_Inspect/BadEndingCutsceneContainer/BuoyantMusicBoxContaner/SplashFX': 'FinaleSplashFX',
    'Finale_Inspect/GoodEndingCutsceneContainer/RingBurstEffect': 'FinaleRingBurst',
    'Finale_Inspect/GoodEndingCutsceneContainer/EmergeSplash': 'FinaleEmergeSplash',
    'Finale_Inspect/GoodEndingCutsceneContainer/ChinSplash': 'FinaleChinSplash',
    'Finale_Inspect/GoodEndingCutsceneContainer/Cinematic_Leviathan/Cinematic_LeviathanHead/root/headroot_jnt/jaw_jnt/ChinParticles': 'FinaleChinParticles',
}
rnd, vec, conv_q = AN.rnd, AN.vec, AN.conv_q
S4 = np.diag([1.0, 1.0, -1.0, 1.0])


# ---------------------------------------------------------------- toán
def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def euler_q(e):
    """Quaternion.Euler của Unity (độ, ZXY: q = qy·qx·qz), trả (x,y,z,w) hệ Unity."""
    h = np.radians(np.asarray(e, dtype=np.float64)) / 2
    cx, sx, cy, sy, cz, sz = np.cos(h[..., 0]), np.sin(h[..., 0]), np.cos(h[..., 1]), np.sin(h[..., 1]), np.cos(h[..., 2]), np.sin(h[..., 2])
    return np.stack([cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz], -1)


def mat_q(R):
    t = R[0, 0] + R[1, 1] + R[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    i = int(np.argmax([R[0, 0], R[1, 1], R[2, 2]]))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(max(1e-12, R[i, i] - R[j, j] - R[k, k] + 1)) * 2
    q = [0.0, 0.0, 0.0, 0.0]
    q[i] = s / 4
    q[j] = (R[j, i] + R[i, j]) / s
    q[k] = (R[k, i] + R[i, k]) / s
    q[3] = (R[k, j] - R[j, k]) / s
    return q


def trs_three(p, q, s):
    return rnd([p[0], p[1], -p[2]] + conv_q(q) + list(s), 6)


def world_three(M):
    """Ma trận thế giới Unity -> [p, q, s] three.js (tỉ lệ dương)."""
    M3 = S4 @ M @ S4
    sc = [float(np.linalg.norm(M3[:3, i])) for i in range(3)]
    R = M3[:3, :3] / np.array(sc)
    return rnd(M3[:3, 3].tolist() + mat_q(R) + sc, 6)


# ---------------------------------------------------------------- khối nhị phân (căn 4 byte)
class Bin:
    def __init__(self, name):
        self.name, self.parts, self.size = name, [], 0

    def add(self, arr):
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-self.size) % 4
        if pad:
            self.parts.append(bytes(pad))
            self.size += pad
        off = self.size
        self.parts.append(b)
        self.size += len(b)
        return [off, len(b)]

    def write(self):
        os.makedirs(OUT_ART, exist_ok=True)
        p = os.path.join(OUT_ART, self.name + '.bin')
        with open(p, 'wb') as f:
            f.write(b''.join(self.parts))
        return 'art/finale/' + self.name + '.bin', self.size


# ---------------------------------------------------------------- mesh
def pack_mesh(B, raw, skinned):
    """raw (MS.read_mesh_raw, hệ Unity, không gian mesh) -> mô tả + khối trong B: vị trí Int16 theo hộp, pháp tuyến Int8×4, uv Uint16 theo hộp,
    chỉ số Uint16/Uint32, (skin) chỉ số xương Uint8×4 + trọng số Uint8×4 (tổng 255)."""
    pos = raw['pos'].copy()
    pos[:, 2] *= -1
    nrm = raw['nrm'].copy()
    nrm[:, 2] *= -1
    uv = raw['uv'] if raw['uv'] is not None else np.zeros((len(pos), 2))
    n = len(pos)
    lo, hi = pos.min(0), pos.max(0)
    ulo, uhi = uv.min(0), uv.max(0)
    qp = np.round((pos - lo) / np.where(hi > lo, hi - lo, 1) * 65535 - 32768).astype('<i2')
    qn = np.zeros((n, 4), dtype='i1')
    qn[:, :3] = np.round(np.clip(nrm, -1, 1) * 127)
    qu = np.round((uv - ulo) / np.where(uhi > ulo, uhi - ulo, 1) * 65535).astype('<u2')
    groups, idx, o = [], [], 0
    for tri in raw['subs']:
        t = tri[:, [0, 2, 1]].reshape(-1)
        groups.append([o, int(t.size)])
        idx.append(t)
        o += int(t.size)
    idx = np.concatenate(idx)
    out = {'n': n, 'tris': int(idx.size // 3), 'min': rnd(lo.tolist(), 5), 'max': rnd(hi.tolist(), 5), 'umin': rnd(ulo.tolist(), 5),
           'umax': rnd(uhi.tolist(), 5), 'pos': B.add(qp), 'nrm': B.add(qn), 'uv': B.add(qu), 'groups': groups}
    if n < 65536:
        out['idx'] = B.add(idx.astype('<u2'))
    else:
        out['idx'] = B.add(idx.astype('<u4'))
        out['i32'] = 1
    if skinned:
        w8 = np.round(raw['w'][:, :4] * 255).astype(np.int64)
        w8[:, 0] += 255 - w8.sum(1)
        out['si'] = B.add(raw['bi'][:, :4].astype('u1'))
        out['sw'] = B.add(w8.astype('u1'))
        out['bind'] = [rnd((S4 @ M @ S4).T.reshape(-1).tolist(), 6) for M in raw['bind']]
    return out


# ---------------------------------------------------------------- texture / vật liệu
_tex_guid = {}


def tex_path(guid):
    if guid not in _tex_guid:
        try:
            _tex_guid[guid] = AN.guid_path('Texture2D', guid)
        except SystemExit:
            _tex_guid[guid] = None
    return _tex_guid[guid]


class Mats:
    def __init__(self):
        self.mats, self.tex, self.size = {}, {}, 0

    def texture(self, guid, role):
        p = tex_path(guid)
        if not p:
            return None
        name = os.path.basename(p).rsplit('.', 1)[0]
        if name in self.tex:
            return name
        im = Image.open(p)
        alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
        im = im.convert('RGBA' if alpha else 'RGB')
        k = TEX[role] / max(im.size)
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        os.makedirs(OUT_ART, exist_ok=True)
        dst = os.path.join(OUT_ART, re.sub(r'[^A-Za-z0-9_]+', '_', name) + '.webp')
        im.save(dst, 'WEBP', quality=82, method=6)
        self.size += os.path.getsize(dst)
        self.tex[name] = {'src': 'art/finale/' + os.path.basename(dst), 'a': int(alpha), 'w': im.width, 'h': im.height}
        return name

    def material(self, guid, role):
        p = AN.guid_path('Material', guid)
        name = os.path.basename(p).rsplit('.', 1)[0]
        if name in self.mats:
            return name
        d = AN.yaml_body(p)
        sp = d['m_SavedProperties']
        sh = d['m_Shader'].get('guid')
        shader = None
        if sh:
            try:
                shader = os.path.basename(AN.guid_path('Shader', sh)).rsplit('.', 1)[0]
            except SystemExit:
                shader = None
        tx = {}
        for k, v in sorted(sp['m_TexEnvs'].items()):
            g = v['m_Texture'].get('guid')
            if g and k not in SKIP_TEX:
                t = self.texture(g, role)
                if t:
                    tx[k] = t
        F = {k: rnd(float(v), 5) for k, v in sorted(sp['m_Floats'].items()) if not k.startswith('_') or k in (
            '_EmissionStrength', '_LightStrength', '_FlashAmount', '_DissipateHeight', '_Opacity', '_FadeOffset', '_ScrollSpeed', '_UnderwaterCutOff',
            '_ExpandStrength', '_NoiseScale', '_Cull', '_Surface', '_Blend', '_ZWrite', '_UnderwaterFoamHeight', '_WaterFoamTiling', '_Float', '_Float_1')}
        C = {k: rnd([float(v['r']), float(v['g']), float(v['b']), float(v['a'])], 5) for k, v in sorted(sp['m_Colors'].items())}
        self.mats[name] = {'shader': shader, 'tex': tx, 'f': F, 'c': C}
        return name


# ---------------------------------------------------------------- AnimationClip -> mẫu
def clip_doc(name):
    return AN.yaml_body(os.path.join(ASSETS, 'AnimationClip', name + '.anim'))


def sample_tracks(B, name, fps, root_off=None, paths_ok=None):
    """Clip -> { len, fps, n, ch[...], fl[...] }. root_off = (offP, offE) của AnimationPlayableAsset (áp cho đường dẫn rỗng).
    paths_ok(path) -> True nếu nút có trong cây (đường cong không khớp nút nào bị bỏ, đếm vào 'miss')."""
    d = clip_doc(name)
    st = d['m_AnimationClipSettings']
    L = MS.fl(st['m_StopTime'])
    n = max(2, int(round(L * fps)) + 1)
    ts = np.linspace(0, L, n)
    ch, miss = {}, set()
    for field, kind, axes in (('m_RotationCurves', 'q', 'xyzw'), ('m_EulerCurves', 'e', 'xyz'), ('m_PositionCurves', 'p', 'xyz'),
                              ('m_ScaleCurves', 's', 'xyz')):
        for c in d.get(field) or []:
            path = c['path'] or ''
            if paths_ok and not paths_ok(path):
                miss.add(path)
                continue
            assert c['curve'].get('m_RotationOrder', 4) == 4, 'Euler không phải ZXY'
            vals = np.array([[MS.herm(MS.comp_keys(c['curve'], ax), t) for ax in axes] for t in ts])
            k = 'q' if kind == 'e' else kind
            if kind == 'e':
                vals = euler_q(vals)
            if k == 'q':
                vals /= np.linalg.norm(vals, axis=1, keepdims=True)
            ch[(path, k)] = vals
    assert not d.get('m_CompressedRotationCurves')
    # offset của clip Timeline cho nút gốc (hệ Unity), rồi đổi sang three.js
    if root_off:
        offP, offE = root_off
        qo = euler_q(offE).tolist()
        R = qmat(qo)
        if ('', 'p') in ch:
            ch[('', 'p')] = ch[('', 'p')] @ R.T + np.array(offP)
        if ('', 'q') in ch:
            ch[('', 'q')] = np.array([qmul(qo, q) for q in ch[('', 'q')]])
    out_ch = []
    for (path, kind) in sorted(ch):
        v = ch[(path, kind)].copy()
        if kind == 'q':
            v = np.array([conv_q(q) for q in v])
            for i in range(1, len(v)):
                if np.dot(v[i], v[i - 1]) < 0:
                    v[i] = -v[i]
        elif kind == 'p':
            v[:, 2] *= -1
        const = float(np.abs(v - v[0]).max()) < 1e-5
        if const:
            v = v[:1]
        e = {'path': path, 'k': kind, 'n': len(v)}
        if kind == 'q':
            e['b'] = B.add(np.round(np.clip(v, -1, 1) * 32767).astype('<i2'))
        else:
            lo, hi = v.min(0), v.max(0)
            e['lo'], e['hi'] = rnd(lo.tolist(), 5), rnd(hi.tolist(), 5)
            e['b'] = B.add(np.round((v - lo) / np.where(hi > lo, hi - lo, 1) * 65535 - 32768).astype('<i2'))
        out_ch.append(e)
    fl = []
    for c in d.get('m_FloatCurves') or []:
        keys = [[round(MS.fl(k['time']), 5), round(MS.fl(k['value']), 5), clampinf(MS.fl(k['inSlope'])), clampinf(MS.fl(k['outSlope']))]
                for k in c['curve']['m_Curve']]
        fl.append({'path': c['path'] or '', 'cls': int(c['classID']), 'attr': c['attribute'], 'keys': keys})
    return {'len': round(L, 5), 'fps': fps, 'n': n, 'loop': int(st['m_LoopTime']), 'ch': out_ch, 'fl': fl, 'miss': sorted(miss)}


def clampinf(v):
    return 1e30 if v == math.inf else (-1e30 if v == -math.inf else round(v, 5))


# ---------------------------------------------------------------- cây cảnh -> nút
class Tree:
    def __init__(self, sc, mats, B):
        self.sc, self.mats, self.B = sc, mats, B
        self.nodes, self.index, self.meshes = [], {}, {}
        self.skins = []   # (nút, smr) xử lý sau khi có đủ chỉ số nút xương

    def comp(self, go, ty):
        out = []
        for c in self.sc.get(go)['m_Component']:
            f = c['component']['fileID']
            if self.sc.at[f][0] == ty:
                out.append(f)
        return out

    def mesh(self, guid, skinned):
        key = guid + ('s' if skinned else '')
        self.meshes[key] = (guid, skinned)   # đóng gói sau khi biết nút nào thật sự hiện (pack_all)
        return key

    def pack_all(self, B):
        used = {nd['r']['mesh'] for nd in self.nodes if 'r' in nd and 'mesh' in nd['r']}
        out = {}
        for k in sorted(used):
            guid, skinned = self.meshes[k]
            m = pack_mesh(B, MS.read_mesh_raw(AN.guid_path('Mesh', guid)), skinned)
            m['name'] = MS.asset_name('Mesh', guid)
            out[k] = m
        self.meshes = out

    def add(self, tf, parent, path, top_world=None):
        sc = self.sc
        T = sc.get(tf)
        go = T['m_GameObject']['fileID']
        G = sc.get(go)
        name = str(G['m_Name'])
        i = len(self.nodes)
        if top_world is not None:
            t = world_three(top_world)
        else:
            t = trs_three(vec(T['m_LocalPosition']), vec(T['m_LocalRotation'], 'xyzw'), vec(T['m_LocalScale']))
        node = {'n': name, 'p': parent, 't': t, 'a': int(G['m_IsActive'])}
        self.nodes.append(node)
        self.index[tf] = i
        self.index[go] = i
        rel = path + '/' + name if path else name
        node['path'] = rel
        if name in EXT and parent >= 0:
            node['ext'] = 1
            return i
        if rel in PARTICLES:
            node['ps'] = PARTICLES[rel]
        role = 'hero' if re.search(r'Masstrocity|Julie|Leviathan|Ruined', rel) else 'small'
        for f in self.comp(go, 23):
            mr = sc.get(f)
            mf = self.comp(go, 33)
            if not mf or not int(mr['m_Enabled']) or NO_MESH.match(name):
                continue
            mg = sc.get(mf[0])['m_Mesh']
            if not mg.get('guid') or mg['guid'] == '0000000000000000e000000000000000':
                # mesh dựng sẵn của Unity (10210 = Quad, 10209 = Plane, 10207 = Sphere)
                node['r'] = {'builtin': {10210: 'quad', 10209: 'plane', 10207: 'sphere'}.get(int(mg['fileID']), str(mg['fileID'])),
                             'mats': [self.mats.material(m['guid'], role) for m in mr['m_Materials'] if m.get('guid')]}
                continue
            node['r'] = {'mesh': self.mesh(mg['guid'], False), 'mats': [self.mats.material(m['guid'], role) for m in mr['m_Materials'] if m.get('guid')]}
        for f in self.comp(go, 137):
            smr = sc.get(f)
            if not int(smr['m_Enabled']):
                continue
            node['r'] = {'mesh': self.mesh(smr['m_Mesh']['guid'], True), 'mats': [self.mats.material(m['guid'], role) for m in smr['m_Materials']]}
            self.skins.append((i, smr))
        for f in self.comp(go, 212):
            spr = sc.get(f)
            sg = spr['m_Sprite'].get('guid')
            if sg and int(spr['m_Enabled']):
                sd = AN.yaml_body(AN.guid_path('Sprite', sg))
                tg = sd['m_RD']['texture']['guid']
                ppu = float(sd['m_PixelsToUnits'])
                rc = sd['m_Rect']
                node['r'] = {'sprite': self.mats.texture(tg, 'small'), 'size': rnd([float(rc['width']) / ppu, float(rc['height']) / ppu], 4),
                             'pivot': rnd(vec(sd['m_Pivot'], 'xy'), 4), 'color': rnd(vec(spr['m_Color'], 'rgba'), 4),
                             'mats': [self.mats.material(m['guid'], 'small') for m in spr['m_Materials'] if m.get('guid')]}
        for f in self.comp(go, 114):
            b = sc.get(f)
            if 'm_Lens' in b and 'm_LookAt' in b:
                vc = {'fov': float(b['m_Lens']['FieldOfView']), 'prio': int(b['m_Priority']), 'look': b['m_LookAt']['fileID'], 'sx': 0.5, 'sy': 0.5}
                for c in T['m_Children']:
                    cgo = sc.get(c['fileID'])['m_GameObject']['fileID']
                    for f2 in self.comp(cgo, 114):
                        cb = sc.get(f2)
                        if 'm_ScreenX' in cb:
                            vc['sx'], vc['sy'] = float(cb['m_ScreenX']), float(cb['m_ScreenY'])
                node['vc'] = vc
        for f in self.comp(go, 82):
            a = sc.get(f)
            node['au'] = {'vol': float(a['m_Volume'])}
        if name == 'cm' and parent >= 0 and 'vc' in self.nodes[parent]:
            return i    # đường ống Cinemachine: đã đọc composer ở trên
        for c in T['m_Children']:
            self.add(c['fileID'], i, rel)
        return i

    def finish(self):
        for i, smr in self.skins:
            self.nodes[i]['r']['bones'] = [self.index[b['fileID']] for b in smr['m_Bones']]
        for nd in self.nodes:
            if 'vc' in nd:
                nd['vc']['look'] = self.index.get(nd['vc']['look'], -1)
        for nd in self.nodes:
            del nd['path']


def node_path(nodes, i, top):
    """Đường dẫn của nút i tính từ nút top (như path của AnimationClip)."""
    out = []
    while i != top:
        out.append(nodes[i]['n'])
        i = nodes[i]['p']
        if i < 0:
            return None
    return '/'.join(reversed(out))


# ---------------------------------------------------------------- Timeline
def read_timeline(kind, binds, tree, sc, B, anims):
    fn = PLAYABLE[kind]
    objs = AN.load_doc(os.path.join(ASSETS, 'MonoBehaviour', fn))
    pguid = re.search(r'^guid: ([0-9a-f]+)', io.open(os.path.join(ASSETS, 'MonoBehaviour', fn + '.meta'), encoding='utf-8').read(), re.M).group(1)
    root = objs[11400000][1]
    tl_tracks = [t['fileID'] for t in root['m_Tracks']]
    if (root.get('m_MarkerTrack') or {}).get('fileID'):
        tl_tracks.append(root['m_MarkerTrack']['fileID'])
    SCR = {1467732076: 'anim', 46519060: 'act', -2113462093: 'audio', -119666388: 'markers', 661751997: 'signal'}
    tracks, signals, length = [], [], 0.0
    for tid in tl_tracks:
        b = objs[tid][1]
        ty = SCR.get(b['m_Script']['fileID'])
        if int(b.get('m_Muted', 0)):
            continue
        # SignalEmitter: trong tệp (Signal Track) hoặc tệp riêng (track Markers)
        for m in (b.get('m_Markers') or {}).get('m_Objects') or []:
            if m.get('guid'):
                mb = AN.yaml_body(AN.guid_path('MonoBehaviour', m['guid']))
            else:
                mb = objs[m['fileID']][1]
            if 'm_Time' in mb and mb.get('m_Asset', {}).get('guid'):
                sig = os.path.basename(AN.guid_path('MonoBehaviour', mb['m_Asset']['guid'])).rsplit('.', 1)[0]
                signals.append([round(float(mb['m_Time']), 4), sig])
                length = max(length, float(mb['m_Time']))
        if ty in ('markers', 'signal'):
            continue
        val = binds.get((pguid, tid))
        if val is None:
            print('  %s: track "%s" không có binding -> bỏ' % (kind, b['m_Name']))
            continue
        bty = sc.at[val][0]
        go = val if bty == 1 else sc.get(val)['m_GameObject']['fileID']
        node = tree.index.get(go)
        tr = {'type': ty, 'name': str(b['m_Name']), 'node': node if node is not None else -1}
        if node is None:
            tr['target'] = sc.path_of_tf(next(c['component']['fileID'] for c in sc.get(go)['m_Component'] if sc.at[c['component']['fileID']][0] == 4))
        clips = []
        for c in b.get('m_Clips') or []:
            a = objs[c['m_Asset']['fileID']][1]
            e = {'start': round(float(c['m_Start']), 5), 'dur': round(float(c['m_Duration']), 5), 'in': round(float(c['m_ClipIn']), 5),
                 'ts': round(float(c['m_TimeScale']), 5), 'pre': int(c['m_PreExtrapolationMode']), 'post': int(c['m_PostExtrapolationMode']),
                 'bin': round(float(c['m_BlendInDuration']), 5), 'bout': round(float(c['m_BlendOutDuration']), 5),
                 'ein': round(float(c['m_EaseInDuration']), 5), 'eout': round(float(c['m_EaseOutDuration']), 5)}
            length = max(length, e['start'] + e['dur'])
            if ty == 'anim':
                cn = MS.asset_name('AnimationClip', a['m_Clip']['guid'])
                key = clip_key(cn, a['m_Position'], a['m_EulerAngles'])
                if key not in anims:
                    anims[key] = anim_for(B, tree, node, cn, (vec(a['m_Position']), vec(a['m_EulerAngles'])))
                e['clip'] = key
            elif ty == 'audio':
                e['clip'] = audio_name(a['m_Clip']['guid'])
                e['vol'] = round(float(a['m_ClipProperties']['volume']), 4)
            clips.append(e)
        if ty == 'anim' and (b.get('m_InfiniteClip') or {}).get('guid'):
            cn = MS.asset_name('AnimationClip', b['m_InfiniteClip']['guid'])
            key = clip_key(cn, b['m_InfiniteClipOffsetPosition'], b['m_InfiniteClipOffsetEulerAngles'])
            if key not in anims:
                anims[key] = anim_for(B, tree, node, cn, (vec(b['m_InfiniteClipOffsetPosition']), vec(b['m_InfiniteClipOffsetEulerAngles'])))
            tr['inf'] = {'clip': key, 'pre': int(b['m_InfiniteClipPreExtrapolation']), 'post': int(b['m_InfiniteClipPostExtrapolation'])}
        if ty == 'act':
            tr['post'] = int(b.get('m_PostPlaybackState', 3))
        if ty == 'audio':
            tr['vol'] = tree.nodes[node]['au']['vol'] if node is not None and 'au' in tree.nodes[node] else 1.0
        tr['clips'] = clips
        tracks.append(tr)
    signals.sort()
    return {'len': round(length, 4), 'signals': signals, 'tracks': tracks}


def clip_key(name, p, e):
    p, e = vec(p), vec(e)
    if any(abs(v) > 1e-6 for v in p + e):
        return '%s@%s' % (name, ','.join('%g' % round(v, 4) for v in p + e))
    return name


def anim_for(B, tree, node, clip, off):
    """Mẫu của clip cho Animator ở nút `node`: đường dẫn của clip tính từ nút đó; đường dẫn không có trong cây bị bỏ (in ra)."""
    names = {}
    if node is not None:
        for i in range(len(tree.nodes)):
            pth = node_path(tree.nodes, i, node)
            if pth is not None:
                names[pth] = i
    is_bone = any(re.search(r'_jnt|Armature', p) for p in names)
    a = sample_tracks(B, clip, FPS_BONE if is_bone else FPS_ROOT, off, lambda p: p in names)
    if a['miss']:
        print('  clip %s: %d đường dẫn không khớp nút (bỏ): %s' % (clip, len(a['miss']), a['miss'][:3]))
    for c in a['ch']:
        c['node'] = names[c['path']]
    for f in a['fl']:
        f['node'] = names.get(f['path'], -1)
    return a


_audio_orig = None


def audio_name(guid):
    for kd in ('AudioClip', 'Audio'):
        try:
            p = AN.guid_path(kd, guid)
            return p
        except SystemExit:
            pass
    raise SystemExit('không thấy AudioClip ' + guid)


def audio_out(paths):
    """Clip -> src: dùng lại mp3 đã có trong data/audio.js (khớp trường orig theo tên tệp), thiếu thì ffmpeg ra art/finale/audio/."""
    txt = io.open(AUDIO_JS, encoding='utf-8').read()
    d = json.loads(txt[txt.index('{'): txt.rindex('}') + 1])
    have = {}
    for k, v in sorted(d.items()):
        if isinstance(v, dict) and v.get('orig'):
            have.setdefault(os.path.basename(v['orig']).rsplit('.', 1)[0], v)
    out, size = {}, 0
    ff = shutil.which('ffmpeg')
    for p in sorted(set(paths)):
        nm = os.path.basename(p).rsplit('.', 1)[0]
        if nm in have:
            out[nm] = {'src': have[nm]['src'], 'dur': have[nm].get('dur'), 'reuse': 1}
            continue
        src = p if p.endswith(('.ogg', '.wav', '.mp3')) else None
        if not src or not os.path.exists(src):
            alt = os.path.join(r'D:\dredge-ref\audio', 'gameaudio', nm + '.ogg')
            src = alt if os.path.exists(alt) else src
        fn = re.sub(r'[^A-Za-z0-9]+', '_', nm).strip('_') + '.mp3'
        dst = os.path.join(OUT_SND, fn)
        os.makedirs(OUT_SND, exist_ok=True)
        if ff and src:
            subprocess.check_call([ff, '-y', '-v', 'error', '-i', src, '-ac', '2' if 'Music' in nm else '1', '-c:a', 'libmp3lame', '-b:a', '96k' if 'Music' in nm else '64k',
                                   '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', dst])
        dur = None
        size += os.path.getsize(dst) if os.path.exists(dst) else 0
        out[nm] = {'src': 'art/finale/audio/' + fn, 'dur': dur}
    return out, size


# ---------------------------------------------------------------- DestroyGreaterMarrow: chỉ số instance cần ẩn + cảnh tàn
def gm_hide(sc, roots):
    inst = np.fromfile(os.path.join(GAME, 'art', 'world', 'instances.bin'), dtype='<f4').reshape(-1, 10)
    world = json.load(io.open(os.path.join(GAME, 'art', 'world', 'world.json'), encoding='utf-8'))
    hit, rend, missed = set(), 0, []
    paths = []
    for go in roots:
        tf = next(c['component']['fileID'] for c in sc.get(go)['m_Component'] if sc.at[c['component']['fileID']][0] == 4)
        paths.append(sc.path_of_tf(tf))
        stack = [(tf, True)]
        while stack:
            t, act = stack.pop()
            g = sc.get(sc.get(t)['m_GameObject']['fileID'])
            act = act and int(g['m_IsActive']) == 1
            for c in g['m_Component']:
                f = c['component']['fileID']
                if sc.at[f][0] == 23 and act and int(sc.get(f)['m_Enabled']):
                    rend += 1
                    W = sc.world(t)
                    m = np.where((np.abs(inst[:, 0] - W[0, 3]) < 0.02) & (np.abs(inst[:, 1] - W[1, 3]) < 0.02) & (np.abs(inst[:, 2] + W[2, 3]) < 0.02))[0]
                    if len(m):
                        hit.update(int(x) for x in m)
                    else:
                        missed.append(sc.name_of_tf(t))
            stack += [(c['fileID'], act) for c in sc.get(t)['m_Children']]
    buoys = [i for i, b in enumerate(world.get('buoys') or []) if any((b.get('path') or '').startswith(p + '/') or b.get('path') == p for p in paths)]
    return sorted(hit), buoys, rend, missed, paths


def ruins(mats, B):
    """GameObject/GM_RuinedTown.prefab (Instantiate ở gốc toạ độ): cây nút + mesh + vật liệu; Fire/Smoke chạy bằng DRParticles 'GMRuinedTown'."""
    objs = AN.load_doc(os.path.join(ASSETS, 'GameObject', 'GM_RuinedTown.prefab'))
    tfs = {i: b for i, (ty, b, _) in objs.items() if ty == 4}
    root = next(i for i, b in tfs.items() if not b['m_Father']['fileID'])
    nodes, meshes = [], {}

    def walk(t, parent):
        T = tfs[t]
        G = objs[T['m_GameObject']['fileID']][1]
        i = len(nodes)
        nd = {'n': str(G['m_Name']), 'p': parent, 'a': int(G['m_IsActive']),
              't': trs_three(vec(T['m_LocalPosition']), vec(T['m_LocalRotation'], 'xyzw'), vec(T['m_LocalScale']))}
        nodes.append(nd)
        comps = {objs[c['component']['fileID']][0]: objs[c['component']['fileID']][1] for c in G['m_Component']}
        if 33 in comps and 23 in comps and not NO_MESH.match(nd['n']):
            g = comps[33]['m_Mesh']['guid']
            if g not in meshes:
                raw = MS.read_mesh_raw(AN.guid_path('Mesh', g))
                meshes[g] = pack_mesh(B, raw, False)
                meshes[g]['name'] = os.path.basename(AN.guid_path('Mesh', g)).rsplit('.', 1)[0]
            nd['r'] = {'mesh': g, 'mats': [mats.material(m['guid'], 'hero') for m in comps[23]['m_Materials'] if m.get('guid')]}
        for c in T['m_Children']:
            walk(c['fileID'], i)
    walk(root, -1)
    # BadEndingPostProcessing: Volume toàn cục (m_IsGlobal 1, priority 100, weight 1) -> các thành phần có m_OverrideState 1
    post = {}
    for i, (ty, b, _) in sorted(objs.items()):
        if ty == 114 and (b.get('sharedProfile') or {}).get('guid'):
            prof = AN.yaml_body(AN.guid_path('MonoBehaviour', b['sharedProfile']['guid']))
            post['profile'] = str(prof['m_Name'])
            post['global'], post['priority'], post['weight'] = int(b['m_IsGlobal']), float(b['priority']), float(b['weight'])
            for c in prof['components']:
                cd = AN.yaml_body(AN.guid_path('MonoBehaviour', c['guid']))
                comp = re.sub(r'_\d+$', '', MS.asset_name('MonoBehaviour', c['guid']))
                vals = {}
                for k, v in sorted(cd.items()):
                    if isinstance(v, dict) and int(v.get('m_OverrideState', 0)) == 1:
                        x = v['m_Value']
                        vals[k] = rnd([float(x[a]) for a in 'rgba' if a in x], 5) if isinstance(x, dict) else rnd(float(x), 5)
                if int(cd.get('active', 1)) and vals:
                    post[comp] = vals
    return {'nodes': nodes, 'meshes': meshes, 'ps': 'GMRuinedTown', 'post': post}


# ---------------------------------------------------------------- chính
def main():
    sc = AN.Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    logic_go = [g for g in sc.go_named('FinaleCutsceneLogic')]
    lg = None
    for g in logic_go:
        for c in sc.get(g)['m_Component']:
            f = c['component']['fileID']
            if sc.at[f][0] == 114 and 'badFinalePlayable' in sc.get(f):
                lg = sc.get(f)
    assert lg, 'FinaleCutsceneLogic không thấy trong Game.unity'
    director = sc.get(lg['director']['fileID'])
    binds = {}
    for b in director['m_SceneBindings']:
        k = b['key']
        if k.get('guid') and b['value']['fileID']:
            binds[(k['guid'], int(k['fileID']))] = int(b['value']['fileID'])
    logic_tf = next(c['component']['fileID'] for c in sc.get(lg['m_GameObject']['fileID'])['m_Component'] if sc.at[c['component']['fileID']][0] == 4)
    insp_tf = sc.get(logic_tf)['m_Father']['fileID']
    cvc = sc.get(lg['creditsVCam']['fileID'])
    cvc_tf = next(c['component']['fileID'] for c in sc.get(cvc['m_GameObject']['fileID'])['m_Component'] if sc.at[c['component']['fileID']][0] == 4)
    rig_tf = sc.get(cvc_tf)['m_Father']['fileID']

    mats = Mats()
    Bc = Bin('cut')
    tree = Tree(sc, mats, Bc)
    roots = {'inspect': tree.add(insp_tf, -1, '', sc.world(insp_tf)), 'credits': tree.add(rig_tf, -1, '', sc.world(rig_tf))}
    tree.finish()
    # vòng thân Leviathan: xem bẫy ở đầu tệp; kiểm lại rằng chúng nằm dưới nước rồi gỡ
    coil_top = -1e9
    for i, nd in enumerate(tree.nodes):
        if 'r' in nd and 'mesh' in nd['r'] and re.match(r'^(LevArch|levring\d|polySurface303)$', nd['n']):
            tf = next(t for t, j in tree.index.items() if j == i and sc.at[t][0] == 4)
            pos = MS.read_mesh_raw(AN.guid_path('Mesh', tree.meshes[nd['r']['mesh']][0]))['pos']
            W = sc.world(tf)
            coil_top = max(coil_top, float((pos @ W[:3, :3].T + W[:3, 3])[:, 1].max()))
            del nd['r']
    assert coil_top < 0, 'vòng thân Leviathan nhô lên mặt nước (%.1f m): phải xuất mesh' % coil_top

    anims = {}
    timelines = {}
    for kind in ('bad', 'good'):
        timelines[kind] = read_timeline(kind, binds, tree, sc, Bc, anims)
    # track hoạt hình không chạm nút nào (Animation Track (3) của Good: xem bẫy ở đầu tệp) -> bỏ
    dead = {k for k, a in anims.items() if not a['ch'] and all(f['node'] < 0 for f in a['fl'])}
    for tl in timelines.values():
        for tr in tl['tracks']:
            if tr['type'] == 'anim':
                tr['clips'] = [c for c in tr['clips'] if c['clip'] not in dead]
                if tr.get('inf') and tr['inf']['clip'] in dead:
                    del tr['inf']
        tl['tracks'] = [tr for tr in tl['tracks'] if tr['type'] != 'anim' or tr['clips'] or tr.get('inf')]
    for k in dead:
        print('  clip %s không chạm nút nào -> bỏ' % k)
        del anims[k]
    # nút có thể hiện: tự bật trong cảnh hoặc được Activation track / đường cong m_IsActive bật, và cha cũng vậy; mesh của nút không bao giờ hiện thì bỏ
    act = {tr['node'] for tl in timelines.values() for tr in tl['tracks'] if tr['type'] == 'act'}
    act |= {f['node'] for a in anims.values() for f in a['fl'] if f['attr'] == 'm_IsActive'}
    can = []
    for i, nd in enumerate(tree.nodes):
        me = nd['p'] < 0 or nd['a'] or i in act
        can.append(me and (nd['p'] < 0 or can[nd['p']]))
        if not can[i] and 'r' in nd:
            print('  nút %s không bao giờ bật: bỏ renderer' % nd['n'])
            del nd['r']
    tree.pack_all(Bc)
    # tiếng
    apaths = [c['clip'] for tl in timelines.values() for tr in tl['tracks'] if tr['type'] == 'audio' for c in tr['clips']]
    audio, asize = audio_out(apaths)
    for tl in timelines.values():
        for tr in tl['tracks']:
            if tr['type'] == 'audio':
                for c in tr['clips']:
                    c['clip'] = os.path.basename(c['clip']).rsplit('.', 1)[0]

    # DestroyGreaterMarrow
    ex = [o['fileID'] for o in lg['existingMarrowsObjects']]
    inst, buoys, nrend, missed, gpaths = gm_hide(sc, ex)
    Br = Bin('ruins')
    rn = ruins(mats, Br)

    cut_src, cut_size = Bc.write()
    ru_src, ru_size = Br.write()
    data = {
        'src': 'MonoBehaviour/FinaleCutscene_Bad.playable + FinaleCutscene_Good.playable, Game.unity (Finale_Inspect, PlayableDirector &%d, '
               'CinematicCameraRigs/Credits, %s), GameObject/GM_RuinedTown.prefab' % (lg['director']['fileID'], ' + '.join(gpaths)),
        'bins': {'cut': cut_src, 'ruins': ru_src},
        'nodes': tree.nodes, 'roots': roots, 'meshes': tree.meshes, 'mats': mats.mats, 'tex': mats.tex, 'anims': anims,
        'timelines': timelines, 'audio': audio,
        'logic': {'scrim': [float(lg['scrimAppearDurationSec']), float(lg['scrimDisppearDurationSec'])]},
        'ruins': rn, 'gm': {'inst': inst, 'buoys': buoys, 'paths': gpaths},
    }
    js = '// Generated by games/dredge/tools/finale.py from FinaleCutscene_Bad/Good.playable + Game.unity. Do not edit.\nwindow.DR_FINALE = ' + \
        json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('nodes %d  meshes %d  mats %d  tex %d (%d KB)  anims %d  cut.bin %d KB  ruins.bin %d KB  audio %d (%d KB mới)  js %d KB' % (
        len(tree.nodes), len(tree.meshes), len(mats.mats), len(mats.tex), mats.size // 1024, len(anims), cut_size // 1024, ru_size // 1024,
        len(audio), asize // 1024, len(js) // 1024))
    for k, tl in timelines.items():
        print('  %s: dài %.3f s, %d tín hiệu, %d track' % (k, tl['len'], len(tl['signals']), len(tl['tracks'])))
    print('  GM: %d renderer, %d instance ẩn, %d phao, %d không khớp %s' % (nrend, len(inst), len(buoys), len(missed), missed[:6]))
    print('  vòng thân Leviathan cao nhất y = %.1f m (dưới nước, không xuất)' % coil_top)
    for k, m in sorted(tree.meshes.items()):
        print('  mesh %-24s %6d đỉnh %6d tam giác%s' % (m['name'], m['n'], m['tris'], ' skin' if 'si' in m else ''))


if __name__ == '__main__':
    main()
