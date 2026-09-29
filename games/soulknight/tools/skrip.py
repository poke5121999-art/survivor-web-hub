# -*- coding: utf-8 -*-
"""Doc bundle Soul Knight (UnityPy 1.25). Nguon mac dinh: ban cai day du 8.6.0 o D:\\sk86-ref.

Mot doi tuong Unity duoc khoa bang cap (CAB, path_id). Con tro trong typetree la
{m_FileID, m_PathID}: FileID 0 la cung tep, khac 0 thi tra externals[FileID-1] ra ten CAB.

8.6 co 2375 bundle trong thu muc long nhau, nap het mot luc thi qua nang. Rip giu mot chi muc
CAB -> duong dan bundle (cache JSON o D:\\sk86-ref\\work\\foundation) va chi nap bundle khi can:
bundle ghi trong `bundles=` luc tao, bundle goi qua load()/cabs(), va bundle chua dich cua mot con tro.
"""
import fnmatch
import hashlib
import io
import json
import os
import struct
import sys
import time

import UnityPy
from PIL import Image

AB86 = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles'
AB851 = os.path.expanduser('~/Downloads/sk-ref/_ab')
AB_DIR = AB86
WORK = r'D:\sk86-ref\work\foundation'


def _index_path(root):
    if os.path.normcase(os.path.abspath(root)) == os.path.normcase(AB86):
        return os.path.join(WORK, 'cab_index.json')
    h = hashlib.md5(os.path.abspath(root).lower().encode('utf-8')).hexdigest()[:8]
    return os.path.join(WORK, 'cab_index_%s.json' % h)


def build_index(root, path=None, quiet=False):
    """Quet moi .ab duoi root -> {'root', 'bundles': {rel: {size, mtime, cabs}}}. Bundle khong doi thi giu dong cu."""
    path = path or _index_path(root)
    old = {}
    if os.path.exists(path):
        try:
            d = json.load(io.open(path, encoding='utf-8'))
            if d.get('root') == os.path.abspath(root):
                old = d.get('bundles', {})
        except ValueError:
            old = {}
    out, t0, n_new = {}, time.time(), 0
    for dp, dns, fns in os.walk(root):
        dns.sort()
        for fn in sorted(fns):
            if not fn.endswith('.ab'):
                continue
            full = os.path.join(dp, fn)
            rel = os.path.relpath(full, root).replace('\\', '/')
            st = os.stat(full)
            o = old.get(rel)
            if o and o['size'] == st.st_size and abs(o['mtime'] - st.st_mtime) < 1e-3:
                out[rel] = o
                continue
            cabs = []
            try:
                env = UnityPy.load(full)
                for bf in env.files.values():
                    for cab, sf in getattr(bf, 'files', {}).items():
                        if hasattr(sf, 'objects'):
                            cabs.append(cab)
            except Exception as e:  # bundle hong: ghi lai de khoi quet lai moi lan
                cabs = []
                if not quiet:
                    print('index: loi doc %s: %s' % (rel, e), file=sys.stderr)
            out[rel] = {'size': st.st_size, 'mtime': st.st_mtime, 'cabs': cabs}
            n_new += 1
            if not quiet and n_new % 200 == 0:
                print('index: %d bundle, %.0fs' % (n_new, time.time() - t0), file=sys.stderr, flush=True)
    d = {'root': os.path.abspath(root), 'bundles': out}
    if n_new or len(out) != len(old):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + '.tmp'
        with io.open(tmp, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, path)
    return d


class Rip:
    def __init__(self, ab_dir=AB_DIR, bundles=None, index=None):
        """ab_dir: thu muc goc cac .ab. bundles: danh sach mau (fnmatch tren duong dan tuong doi,
        '.ab' co the bo) nap ngay; phan con lai nap khi can."""
        self.root = os.path.abspath(ab_dir)
        self.index = build_index(self.root, index)
        self.cab_bundle = {}   # cab -> rel (ca bundle chua nap)
        for rel, b in self.index['bundles'].items():
            for cab in b['cabs']:
                self.cab_bundle.setdefault(cab, rel)
        self.env = UnityPy.Environment()
        self.files = {}      # cab -> SerializedFile (chi bundle da nap)
        self.bundle_of = {}  # cab -> rel, vd 'level/1/a.ab'
        self.loaded = {}     # rel -> [cab]
        self.missing = {}    # ten CAB khong co trong chi muc -> so lan gap
        self._tree = {}
        self._script = {}
        self._atlas = None
        self._tex = {}
        for rel in self.bundles(*(bundles or ())):
            self.load(rel)

    # ---- bundle ----------------------------------------------------------
    def bundles(self, *patterns):
        """Mau -> danh sach rel co that, theo thu tu mau roi ten. 'level/*' khop ca 'level/1/a.ab'."""
        out = []
        allb = sorted(self.index['bundles'])
        for p in patterns:
            p = p.replace('\\', '/')
            if not p.endswith('.ab') and not p.endswith('*'):
                p += '.ab'
            hit = [r for r in allb if fnmatch.fnmatchcase(r, p)] if any(c in p for c in '*?[') else \
                ([p] if p in self.index['bundles'] else [])
            for r in hit:
                if r not in out:
                    out.append(r)
        return out

    def load(self, rel):
        """Nap mot bundle (rel trong chi muc) -> [cab]."""
        if rel in self.loaded:
            return self.loaded[rel]
        full = os.path.join(self.root, *rel.split('/'))
        cabs = []
        bf = self.env.load_file(full)
        for cab, sf in getattr(bf, 'files', {}).items():
            if hasattr(sf, 'objects'):
                self.files[cab] = sf
                self.bundle_of[cab] = rel
                cabs.append(cab)
        self.loaded[rel] = cabs
        return cabs

    def cabs(self, *patterns):
        """Nap cac bundle khop mau -> [cab] (danh sach moi, duyet an toan khi con tro nap them bundle)."""
        out = []
        for rel in self.bundles(*patterns):
            out.extend(self.load(rel))
        return out

    def objects(self, patterns, types=None):
        """Duyet (cab, obj) trong cac bundle khop mau, loc theo ten kieu."""
        for cab in self.cabs(*patterns):
            for o in list(self.files[cab].objects.values()):
                if types is None or o.type.name in types:
                    yield cab, o

    def _file(self, cab):
        sf = self.files.get(cab)
        if sf is None:
            rel = self.cab_bundle.get(cab)
            if rel is None:
                self.missing[cab] = self.missing.get(cab, 0) + 1
                return None
            self.load(rel)
            sf = self.files.get(cab)
        return sf

    # ---- con tro -------------------------------------------------------
    def obj(self, cab, pid):
        sf = self._file(cab)
        return sf.objects.get(pid) if sf else None

    def resolve(self, ptr, cab):
        """ptr = {m_FileID, m_PathID} doc tu tep cab -> (cab_dich, obj) hoac None. Nap bundle dich neu can."""
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
        sf = self._file(cab)
        out = []
        for pid, o in list(sf.objects.items()):
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
        """Moi SpriteAtlas trong cac bundle DA NAP -> {render_key: (rd, cab)}; nap them thi goi lai se cap nhat."""
        if self._atlas is None or self._atlas[0] != len(self.files):
            m = {}
            for cab, sf in list(self.files.items()):
                for o in list(sf.objects.values()):
                    if o.type.name != 'SpriteAtlas':
                        continue
                    try:
                        t = self.tree(cab, o)
                    except Exception:
                        continue
                    for k, rd in t.get('m_RenderDataMap', []):
                        m[_rd_key(k)] = (rd, cab)
            self._atlas = (len(self.files), m)
        return self._atlas[1]

    def _texture(self, ptr, cab):
        r = self.resolve(ptr, cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k not in self._tex:
            try:
                self._tex[k] = r[1].read().image
            except Exception:
                self._tex[k] = None
        return self._tex[k]

    def sprite(self, cab, o):
        """-> (ten, PIL RGBA, ax, ay, ppu); ax,ay la diem neo (pivot) tinh tu goc tren-trai cua anh da cat."""
        t = self.tree(cab, o)
        name = t['m_Name']
        rect = t['m_Rect']
        piv = t['m_Pivot']
        rd = t['m_RD']
        img = None
        # Texture o bundle khac: nap truoc de UnityPy tu giai duoc con tro texture cua Sprite.
        if rd.get('texture', {}).get('m_PathID'):
            self.resolve(rd['texture'], cab)
        if t.get('m_SpriteAtlas', {}).get('m_PathID'):
            self.resolve(t['m_SpriteAtlas'], cab)
        try:
            img = o.read().image.convert('RGBA')
        except Exception:
            img = None
        if img is None and rd.get('texture', {}).get('m_PathID'):
            timg = self._texture(rd['texture'], cab)
            if timg is not None:
                img = _crop(rd, timg)
        if img is None:
            hit = self.atlas_map().get(_rd_key(t['m_RenderDataKey']))
            if hit:
                ard, acab = hit
                timg = self._texture(ard['texture'], acab)
                if timg is not None:
                    img = _crop(ard, timg)
                    rd = ard
        if img is None:
            return None
        off = rd['textureRectOffset']
        rw, rh = rect['width'], rect['height']
        th = img.height
        ax = piv['x'] * rw - off['x']
        ay = th + off['y'] - rh * piv['y']
        ppu = t.get('m_PixelsToUnits', 16.0)
        return name, img, ax, ay, ppu

    # ---- hoat anh --------------------------------------------------------
    def clip(self, cab, o):
        """AnimationClip -> {'name', 'len', 'loop', 'keys': [(t, (cab, sprite_obj) | None)]} chi lay duong m_Sprite."""
        t = self.tree(cab, o)
        cb = t['m_ClipBindingConstant']
        binds = cb['genericBindings']
        mapping = cb['pptrCurveMapping']
        mc = t['m_MuscleClip']
        clip = mc['m_Clip']['data']
        sc = clip['m_StreamedClip']
        # Unity xep: streamed float, dense float, constant float, roi toi cac duong PPtr.
        # Chi so duong PPtr trong genericBindings la cac binding isPPtrCurve theo thu tu.
        float_binds = [b for b in binds if not b['isPPtrCurve']]
        pptr_binds = [b for b in binds if b['isPPtrCurve']]
        spr_bind = None
        for i, b in enumerate(pptr_binds):
            if b['typeID'] == 212 and b['attribute'] == 0:
                spr_bind = i
                break
        raw = struct.pack('<%dI' % len(sc['data']), *sc['data']) if sc['data'] else b''
        # Chi so duong PPtr = tong so duong float (streamed + dense + constant) + thu tu PPtr.
        # Mot binding vi tri/co giu 3 duong float, nen dem binding (cach cu) sai khi clip co ca Transform.
        n_curves = sc['curveCount'] + clip['m_DenseClip']['m_CurveCount'] + len(clip['m_ConstantClip']['data'])
        frames = []
        tries = (n_curves + spr_bind, len(float_binds) + spr_bind, spr_bind) if spr_bind is not None else ()
        for want in tries:
            i = 0
            while i + 8 <= len(raw):
                tm, n = struct.unpack_from('<fI', raw, i)
                i += 8
                for _ in range(n):
                    idx, = struct.unpack_from('<I', raw, i)
                    c = struct.unpack_from('<4f', raw, i + 4)
                    i += 20
                    if idx == want:
                        frames.append((tm, int(round(c[3]))))
            if frames:
                break
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


if __name__ == '__main__':
    # python skrip.py [root]  -> dung/cap nhat chi muc CAB, in thong ke
    root = sys.argv[1] if len(sys.argv) > 1 else AB86
    d = build_index(root)
    n = sum(len(b['cabs']) for b in d['bundles'].values())
    print('%d bundle, %d CAB -> %s' % (len(d['bundles']), n, _index_path(root)))
