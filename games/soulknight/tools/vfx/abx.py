# -*- coding: utf-8 -*-
"""Nạp một nhóm bundle 8.6 (kèm phụ thuộc theo .manifest) vào một môi trường UnityPy và giải con trỏ chéo tệp.

Khoá một đối tượng = (cab, path_id). Con trỏ {m_FileID, m_PathID}: FileID 0 là cùng tệp, khác 0 thì
tra externals[FileID-1] (tên CAB ở đuôi đường dẫn).
"""
import os
import re

import UnityPy

AB_ROOT = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles'
SKIP_DEPS = re.compile(r'^(fonts_|bgm/|sound_effect|escape_audio|gp_vnm|localization)')


def manifest_deps(rel):
    p = os.path.join(AB_ROOT, rel.replace('/', os.sep)[:-3] + '.manifest')
    out = []
    if not os.path.isfile(p):
        return out
    on = False
    for ln in open(p, encoding='utf-8', errors='replace'):
        if ln.startswith('Dependencies:'):
            on = True
            continue
        if on and ln.startswith('- '):
            out.append(ln.strip()[2:].split('/AssetBundles/')[-1] + '.ab')
    return out


def closure(rels, depth=1):
    seen = []
    frontier = list(rels)
    for _ in range(depth + 1):
        nxt = []
        for r in frontier:
            if r in seen or SKIP_DEPS.match(r):
                continue
            if not os.path.isfile(os.path.join(AB_ROOT, r)):
                continue
            seen.append(r)
            nxt += manifest_deps(r)
        frontier = nxt
    return seen


class Env:
    def __init__(self, rels, dep_depth=1):
        self.rels = closure(rels, dep_depth)
        self.env = UnityPy.load(*[os.path.join(AB_ROOT, r) for r in self.rels])
        self.files, self.bundle_of = {}, {}
        for bname, bf in self.env.files.items():
            rel = os.path.relpath(bname, AB_ROOT).replace(os.sep, '/') if os.path.isabs(bname) else bname
            for cab, sf in getattr(bf, 'files', {}).items():
                if hasattr(sf, 'objects'):
                    self.files[cab] = sf
                    self.bundle_of[cab] = rel
        self._tree = {}
        self._script = {}

    def cabs_of(self, rel):
        return [c for c, b in self.bundle_of.items() if b == rel or b.endswith(rel)]

    def obj(self, cab, pid):
        sf = self.files.get(cab)
        return sf.objects.get(pid) if sf else None

    def resolve(self, ptr, cab):
        if not isinstance(ptr, dict) or not ptr.get('m_PathID'):
            return None
        f = ptr['m_FileID']
        if f == 0:
            tcab = cab
        else:
            ext = self.files[cab].externals
            if f - 1 >= len(ext):
                return None
            tcab = ext[f - 1].path.split('/')[-1].lower()
            if tcab not in self.files:
                tcab = next((c for c in self.files if c.lower() == tcab), tcab)
        o = self.obj(tcab, ptr['m_PathID'])
        return (tcab, o) if o is not None else None

    def tree(self, cab, o):
        k = (cab, o.path_id)
        if k not in self._tree:
            try:
                self._tree[k] = o.read_typetree()
            except Exception:
                self._tree[k] = {}
        return self._tree[k]

    def script_name(self, cab, mb):
        r = self.resolve(mb.get('m_Script'), cab)
        if not r:
            return None
        k = (r[0], r[1].path_id)
        if k not in self._script:
            self._script[k] = self.tree(*r).get('m_ClassName')
        return self._script[k]

    # ---- cây GameObject
    def go_of(self, cab, comp_tree):
        return self.resolve(comp_tree.get('m_GameObject'), cab)

    def components(self, cab, go):
        g = self.tree(cab, go)
        out = []
        for c in g.get('m_Component', []):
            r = self.resolve(c['component'], cab)
            if r:
                out.append((r[1].type.name, r[0], r[1]))
        return out

    def transform(self, cab, go):
        for tn, ccab, co in self.components(cab, go):
            if tn in ('Transform', 'RectTransform'):
                return ccab, co
        return None

    def children(self, cab, go):
        tr = self.transform(cab, go)
        if not tr:
            return []
        out = []
        for ch in self.tree(*tr).get('m_Children', []):
            r = self.resolve(ch, tr[0])
            if r:
                g = self.resolve(self.tree(*r).get('m_GameObject'), r[0])
                if g:
                    out.append(g)
        return out

    def parent_go(self, cab, go):
        tr = self.transform(cab, go)
        if not tr:
            return None
        f = self.resolve(self.tree(*tr).get('m_Father'), tr[0])
        if not f:
            return None
        return self.resolve(self.tree(*f).get('m_GameObject'), f[0])

    def root_of(self, cab, go):
        cur = (cab, go)
        for _ in range(64):
            p = self.parent_go(*cur)
            if not p:
                return cur
            cur = p
        return cur

    def roots(self, cab):
        sf = self.files[cab]
        out = []
        for pid, o in sf.objects.items():
            if o.type.name != 'GameObject':
                continue
            tr = self.transform(cab, o)
            if tr and not self.tree(*tr).get('m_Father', {}).get('m_PathID'):
                out.append((cab, o))
        return out

    def walk(self, cab, go, depth=0):
        yield cab, go, depth
        for ch in self.children(cab, go):
            yield from self.walk(ch[0], ch[1], depth + 1)
