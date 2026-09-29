# -*- coding: utf-8 -*-
"""Doc thang cac bundle Soul Knight con giu o ~/Downloads/sk-ref/_ab (UnityPy 1.25).

Mot doi tuong Unity duoc khoa bang cap (CAB, path_id). Con tro trong typetree la
{m_FileID, m_PathID}: FileID 0 la cung tep, khac 0 thi tra externals[FileID-1].
"""
import glob
import os
import struct

import UnityPy
from PIL import Image

AB_DIR = os.path.expanduser('~/Downloads/sk-ref/_ab')


class Rip:
    def __init__(self, ab_dir=AB_DIR):
        self.env = UnityPy.load(*sorted(glob.glob(os.path.join(ab_dir, '*.ab'))))
        self.files = {}      # cab -> SerializedFile
        self.bundle_of = {}  # cab -> ten tep .ab
        for bname, bf in self.env.files.items():
            for cab, sf in getattr(bf, 'files', {}).items():
                if hasattr(sf, 'objects'):
                    self.files[cab] = sf
                    self.bundle_of[cab] = os.path.basename(bname)
        self._tree = {}
        self._script = {}
        self._atlas = None

    # ---- con tro -------------------------------------------------------
    def obj(self, cab, pid):
        sf = self.files.get(cab)
        return sf.objects.get(pid) if sf else None

    def resolve(self, ptr, cab):
        """ptr = {m_FileID, m_PathID} doc tu tep cab -> (cab_dich, obj) hoac None."""
        if not ptr or not ptr.get('m_PathID'):
            return None
        f = ptr['m_FileID']
        if f == 0:
            tcab = cab
        else:
            ext = self.files[cab].externals
            if f - 1 >= len(ext):
                return None
            tcab = ext[f - 1].path.split('/')[-1]
        o = self.obj(tcab, ptr['m_PathID'])
        return (tcab, o) if o is not None else None

    def tree(self, cab, o):
        k = (cab, o.path_id)
        if k not in self._tree:
            self._tree[k] = o.read_typetree()
        return self._tree[k]

    def script_name(self, cab, mb_tree):
        r = self.resolve(mb_tree.get('m_Script'), cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k not in self._script:
            self._script[k] = self.tree(*r).get('m_ClassName')
        return self._script[k]

    # ---- cay GameObject -------------------------------------------------
    def roots(self, cab):
        """Moi GameObject goc (Transform khong co cha) trong tep cab."""
        sf = self.files[cab]
        out = []
        for pid, o in sf.objects.items():
            if o.type.name != 'GameObject':
                continue
            g = self.tree(cab, o)
            t = self.transform_of(cab, g)
            if t is not None and not t.get('m_Father', {}).get('m_PathID'):
                out.append(Node(self, cab, o))
        return out

    def transform_of(self, cab, g):
        for c in g.get('m_Component', []):
            r = self.resolve(c['component'], cab)
            if r and r[1].type.name in ('Transform', 'RectTransform'):
                return self.tree(*r)
        return None

    # ---- sprite ----------------------------------------------------------
    def atlas_map(self):
        if self._atlas is None:
            self._atlas = {}
            for cab, sf in self.files.items():
                for o in sf.objects.values():
                    if o.type.name != 'SpriteAtlas':
                        continue
                    try:
                        t = self.tree(cab, o)
                    except Exception:
                        continue
                    for k, rd in t.get('m_RenderDataMap', []):
                        self._atlas[_rd_key(k)] = (rd, cab)
        return self._atlas

    def sprite(self, cab, o):
        """-> (ten, PIL RGBA, ax, ay) ; ax,ay la diem neo (pivot) tinh tu goc tren-trai cua anh da cat."""
        t = self.tree(cab, o)
        name = t['m_Name']
        rect = t['m_Rect']
        piv = t['m_Pivot']
        rd = t['m_RD']
        img = None
        try:
            img = o.read().image.convert('RGBA')
        except Exception:
            hit = self.atlas_map().get(_rd_key(t['m_RenderDataKey']))
            if hit:
                ard, acab = hit
                tex = self.resolve(ard['texture'], acab)
                if tex:
                    timg = tex[1].read().image
                    img = _crop(ard, timg)
                    rd = ard
        if img is None:
            return None
        tr = rd['textureRect']
        off = rd['textureRectOffset']
        rw, rh = rect['width'], rect['height']
        th = img.height
        ax = piv['x'] * rw - off['x']
        ay = th + off['y'] - rh * piv['y']
        ppu = t.get('m_PixelsToUnits', 16.0)
        return name, img, ax, ay, ppu

    # ---- hoat anh --------------------------------------------------------
    def clip(self, cab, o):
        """AnimationClip -> {'name', 'len', 'loop', 'keys': [(t, sprite_obj_tuple)]} chi lay duong m_Sprite."""
        t = self.tree(cab, o)
        cb = t['m_ClipBindingConstant']
        binds = cb['genericBindings']
        mapping = cb['pptrCurveMapping']
        mc = t['m_MuscleClip']
        clip = mc['m_Clip']['data']
        sc = clip['m_StreamedClip']
        n_stream = sc['curveCount']
        dense = clip['m_DenseClip']
        n_dense = dense['m_CurveCount']
        n_const = len(clip['m_ConstantClip']['data'])
        # Unity xep: streamed float, dense float, constant float, roi toi cac duong PPtr.
        # Chi so duong PPtr trong genericBindings la cac binding isPPtrCurve theo thu tu.
        float_binds = [b for b in binds if not b['isPPtrCurve']]
        pptr_binds = [b for b in binds if b['isPPtrCurve']]
        keys = []
        spr_bind = None
        for i, b in enumerate(pptr_binds):
            if b['typeID'] == 212 and b['attribute'] == 0:
                spr_bind = i
                break
        raw = struct.pack('<%dI' % len(sc['data']), *sc['data']) if sc['data'] else b''
        # PPtr curve nam trong streamed clip voi chi so = so duong float + chi so pptr
        want = None
        if spr_bind is not None:
            want = len(float_binds) + spr_bind
        frames = []
        i = 0
        while i + 8 <= len(raw):
            tm, n = struct.unpack_from('<fI', raw, i)
            i += 8
            for _ in range(n):
                idx, = struct.unpack_from('<I', raw, i)
                c = struct.unpack_from('<4f', raw, i + 4)
                i += 20
                if idx == want or (want is None and False):
                    frames.append((tm, int(round(c[3]))))
        # Truong hop PPtr curve la duong duy nhat va nam o chi so 0
        if not frames and spr_bind is not None:
            i = 0
            while i + 8 <= len(raw):
                tm, n = struct.unpack_from('<fI', raw, i)
                i += 8
                for _ in range(n):
                    idx, = struct.unpack_from('<I', raw, i)
                    c = struct.unpack_from('<4f', raw, i + 4)
                    i += 20
                    if idx == spr_bind:
                        frames.append((tm, int(round(c[3]))))
        out = []
        for tm, k in frames:
            if tm < -1e30:
                tm = 0.0
            if tm > 1e30 or k < 0 or k >= len(mapping):
                continue
            r = self.resolve(mapping[k], cab)
            if out and abs(out[-1][0] - tm) < 1e-6:
                out[-1] = (tm, r)
            else:
                out.append((tm, r))
        length = mc['m_StopTime'] - mc['m_StartTime']
        events = [(e['time'], e['functionName']) for e in t.get('m_Events', [])]
        return {'name': t['m_Name'], 'len': length, 'loop': bool(mc.get('m_LoopTime')),
                'keys': out, 'rate': t['m_SampleRate'], 'events': events,
                'n_float': len(float_binds)}

    def controller(self, cab, o):
        """AnimatorController (hoac Override) -> {ten_state: (cab, clip_obj)} cua lop dau tien."""
        t = self.tree(cab, o)
        if o.type.name == 'AnimatorOverrideController':
            base = self.resolve(t['m_Controller'], cab)
            states = self.controller(*base) if base else {}
            over = {}
            for p in t.get('m_Clips', []):
                a = self.resolve(p['m_OriginalClip'], cab)
                b = self.resolve(p['m_OverrideClip'], cab)
                if a and b:
                    over[(a[0], a[1].path_id)] = b
            return {k: over.get((v[0], v[1].path_id), v) for k, v in states.items()}
        tos = dict(t['m_TOS'])
        clips = t['m_AnimationClips']
        out = {}
        sms = t['m_Controller']['m_StateMachineArray']
        for li, sm in enumerate(sms):
            for st in sm['data']['m_StateConstantArray']:
                s = st['data']
                nm = tos.get(s['m_NameID'], str(s['m_NameID']))
                for b in s['m_BlendTreeConstantArray']:
                    for nd in b['data']['m_NodeArray']:
                        ci = nd['data']['m_ClipID']
                        if 0 <= ci < len(clips):
                            r = self.resolve(clips[ci], cab)
                            if r and (nm not in out):
                                out[nm if li == 0 else 'L%d.%s' % (li, nm)] = r
                        break
        return out


class Node:
    """Mot GameObject voi cac component da giai."""

    def __init__(self, rip, cab, go):
        self.rip, self.cab, self.go = rip, cab, go
        g = rip.tree(cab, go)
        self.name = g['m_Name']
        self.active = g.get('m_IsActive', 1)
        self.comps = []
        self.t = None
        for c in g.get('m_Component', []):
            r = rip.resolve(c['component'], cab)
            if not r:
                continue
            ccab, co = r
            tn = co.type.name
            if tn in ('Transform', 'RectTransform'):
                self.t = rip.tree(ccab, co)
                self.tcab = ccab
            self.comps.append((tn, ccab, co))

    def pos(self):
        p = self.t['m_LocalPosition']
        return (p['x'], p['y'])

    def scale(self):
        s = self.t['m_LocalScale']
        return (s['x'], s['y'])

    def children(self):
        out = []
        for ch in self.t.get('m_Children', []):
            r = self.rip.resolve(ch, self.tcab)
            if not r:
                continue
            tt = self.rip.tree(*r)
            gr = self.rip.resolve(tt['m_GameObject'], r[0])
            if gr:
                out.append(Node(self.rip, gr[0], gr[1]))
        return out

    def walk(self, path='', off=(0.0, 0.0)):
        """Duyet ca cay: yield (node, duong_dan, vi_tri_cong_don)."""
        yield self, path, off
        sx, sy = self.scale()
        for ch in self.children():
            px, py = ch.pos()
            yield from ch.walk(path + '/' + ch.name, (off[0] + px * sx, off[1] + py * sy))

    def mbs(self):
        out = []
        for tn, ccab, co in self.comps:
            if tn == 'MonoBehaviour':
                t = self.rip.tree(ccab, co)
                out.append((self.rip.script_name(ccab, t), ccab, t))
        return out

    def comp(self, typename):
        for tn, ccab, co in self.comps:
            if tn == typename:
                return ccab, co, self.rip.tree(ccab, co)
        return None


def _rd_key(k):
    a, b = k
    if isinstance(a, dict):
        a = tuple(a[x] for x in sorted(a))
    return (tuple(a) if isinstance(a, (list, tuple)) else a, b)


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
