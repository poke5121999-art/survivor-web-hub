# -*- coding: utf-8 -*-
"""World of Slime audio export: Wwise .wem -> Ogg Vorbis + event index.

Run:  py -3.12 -I export_audio.py [extract|index|decode|all] [--force]
Out:  <wos.ASSETS>/audio/<category>/<name>.ogg  and  audio/index.json
Raw cache (outside the asset repo): <wos.REF>/audio_raw/{wem,bnk}

Inputs (see wos.D): 2243 `wwisedata_windows_*` bundles. Each is ONE MonoBehaviour with `RawData`:
  * 1035 are RIFF (.wem media, named by Wwise media id; all PCM/Vorbis, vgmstream reads them),
  * 1208 are BKHD (.bnk soundbanks, named by the event / bank; Wwise 2022.1 = bank version 154).
`wwisesoundbank.bundle` holds the WwiseEventAssets (event name + media id list), and mapsound.bundle /
data.bundle hold WwiseObjectReference assets (objectName + FNV-1 id) used to name events.
Traps are in D:\\wos-ref\\notes\\EXPORT_AUDIO.md.
"""
import sys, os, re, json, math, struct, glob, shutil, subprocess, time, collections
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wos

RAW = os.path.join(wos.REF, 'audio_raw')
WEM = os.path.join(RAW, 'wem')
BNK = os.path.join(RAW, 'bnk')
OUT = os.path.join(wos.ASSETS, 'audio')
VGM = r"C:\Users\tamph\Downloads\vgmstream\vgmstream-cli.exe"
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'
FFPROBE = shutil.which('ffprobe') or 'ffprobe'
BUDGET_MB = 350.0
WWISE_REF_BUNDLES = ['mapsound.bundle', 'data.bundle', 'cutscene_merge_failed.bundle', 'cutscene_merge_success.bundle', 'map_path_01.bundle',
                     'map_path_06.bundle', 'map_shadow.bundle', 'map_ter05_cave.bundle', 'object_pr_oven_001.bundle',
                     'object_pr_slimemerge.bundle', 'ui_objects.bundle', 'ui_popup.bundle', 'ui_view.bundle']


def fnv(s):
    """Wwise short id: FNV-1 32 bit over the lower-cased name."""
    h = 2166136261
    for c in s.lower().encode('utf-8'):
        h = ((h * 16777619) & 0xffffffff) ^ c
    return h


# ------------------------------------------------------------------------------------------ 1. extract
def stage_extract(force=False):
    import UnityPy
    os.makedirs(WEM, exist_ok=True); os.makedirs(BNK, exist_ok=True)
    if not force and os.path.exists(os.path.join(RAW, 'extracted.json')):
        print('extract: cached (use --force to redo)'); return
    for d in (WEM, BNK):
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
    n = collections.Counter()
    for f in sorted(x for x in os.listdir(wos.D) if x.startswith('wwisedata_windows_')):
        env = UnityPy.load(os.path.join(wos.D, f))
        for o in env.objects:
            if o.type.name != 'MonoBehaviour':
                continue
            t = o.read_typetree()
            raw = bytes(t['RawData'])
            ext = 'wem' if raw[:4] == b'RIFF' else 'bnk' if raw[:4] == b'BKHD' else None
            if not ext:
                print('  unknown RawData', f, raw[:4]); continue
            with open(os.path.join(RAW, ext, t['m_Name'] + '.' + ext), 'wb') as fh:
                fh.write(raw)
            n[ext] += 1
    # media embedded in bank DATA chunks (BGM has 13 music files inside the bank)
    for p in glob.glob(BNK + '/*.bnk'):
        _, didx, data = load_bank(p)
        for mid, off, size in (didx or []):
            fn = os.path.join(WEM, '%d.wem' % mid)
            if not os.path.exists(fn):
                open(fn, 'wb').write(data[off:off + size]); n['embedded'] += 1
    json.dump(dict(n), open(os.path.join(RAW, 'extracted.json'), 'w'))
    print('extract:', dict(n))


# ------------------------------------------------------------------------------------------ 2. HIRC
def chunks(d):
    i = 0
    while i + 8 <= len(d):
        t = d[i:i + 4]; n = struct.unpack_from('<I', d, i + 4)[0]
        yield t, d[i + 8:i + 8 + n]; i += 8 + n


def load_bank(path):
    d = open(path, 'rb').read()
    objs, didx, data, ver = [], None, None, None
    for t, b in chunks(d):
        if t == b'BKHD': ver = struct.unpack_from('<I', b, 0)[0]
        elif t == b'DIDX': didx = [struct.unpack_from('<III', b, i) for i in range(0, len(b), 12)]
        elif t == b'DATA': data = b
        elif t == b'HIRC':
            n = struct.unpack_from('<I', b, 0)[0]; p = 4
            for _ in range(n):
                ty = b[p]; ln = struct.unpack_from('<I', b, p + 1)[0]
                o = b[p + 5:p + 5 + ln]
                objs.append((ty, struct.unpack_from('<I', o, 0)[0], o)); p += 5 + ln
    return objs, didx, data


def u32(o, p): return struct.unpack_from('<I', o, p)[0]


def f32(v): return struct.unpack('<f', v)[0]


class Banks:
    """All HIRC objects, id -> (type, bytes, bank). Ids are unique per bank; the first bank wins globally,
    lookups prefer the bank the reference came from."""
    def __init__(self):
        self.by_bank = {}
        self.glob = {}
        self.events = {}            # event id -> (bank, bytes)
        self.media_files = set(int(f[:-4]) for f in os.listdir(WEM))
        for p in sorted(glob.glob(BNK + '/*.bnk')):
            nm = os.path.basename(p)[:-4]
            objs, _, _ = load_bank(p)
            self.by_bank[nm] = {i: (t, o) for t, i, o in objs}
            for t, i, o in objs:
                self.glob.setdefault(i, (t, o, nm))
                if t == 4:
                    self.events.setdefault(i, (nm, o))
        self._chain = {}

    def get(self, i, bank):
        b = self.by_bank.get(bank, {})
        if i in b: return b[i][0], b[i][1], bank
        return self.glob.get(i, (None, None, None))

    # ---- node base params
    def parent_pos(self, o, bank, lo=9, hi=60):
        ids = self.by_bank[bank]
        me = u32(o, 0)
        for p in range(lo, min(hi, len(o) - 4)):
            v = u32(o, p)
            if v != me and v in ids:
                return p
        return None

    def props(self, o, bank):
        p = self.parent_pos(o, bank)
        if p is None: return {}, None
        q = p + 5
        try:
            n = o[q]; ids = list(o[q + 1:q + 1 + n]); q += 1 + n
            vals = [o[q + 4 * i:q + 4 * i + 4] for i in range(n)]
            if len(vals) != n or any(len(v) != 4 for v in vals): return {}, u32(o, p)
        except IndexError:
            return {}, u32(o, p)
        return dict(zip(ids, vals)), u32(o, p)

    def chain_db(self, i, bank, depth=0):
        """Sum of Volume props (dB) from this node up through its parents."""
        key = (i, bank)
        if key in self._chain: return self._chain[key]
        t, o, bk = self.get(i, bank)
        if t not in (2, 5, 6, 7, 9) or depth > 12:
            return 0.0
        pr, par = self.props(o, bk)
        v = f32(pr[0]) if 0 in pr else 0.0
        if not (-100 < v < 40): v = 0.0
        if par:
            v += self.chain_db(par, bk, depth + 1)
        self._chain[key] = v
        return v

    # ---- containers
    def ranseq(self, o, bank):
        """returns dict(children, loops, random, ok). Playlist is the tail; children block precedes the 2 mode bytes."""
        ids = self.by_bank[bank]
        end = len(o)
        for n in range(0, 400):
            off = end - 2 - 8 * n
            if off < 8: break
            if struct.unpack_from('<H', o, off)[0] != n: continue
            items = [(u32(o, off + 2 + 8 * k), struct.unpack_from('<i', o, off + 6 + 8 * k)[0]) for k in range(n)]
            if not all(i in self.glob for i, _ in items): continue
            coff = off - 4 - 4 * n
            if coff < 8 or u32(o, coff) != n: continue
            ch = [u32(o, coff + 4 + 4 * k) for k in range(n)]
            loops = struct.unpack_from('<H', o, coff - 24)[0]
            mode = o[coff - 2]
            return dict(children=ch, loops=loops, random=(mode == 0), weights=[w for _, w in items], ok=True)
        return dict(children=[], loops=1, random=False, ok=False)

    def switch(self, o, bank):
        """Find children block by scanning, verified by consuming the object exactly."""
        ids = self.glob
        for p in range(20, len(o) - 12):
            n = u32(o, p)
            if not (0 < n < 300) or p + 4 + 4 * n + 8 > len(o): continue
            ch = [u32(o, p + 4 + 4 * k) for k in range(n)]
            if not all(c in ids for c in ch): continue
            q = p + 4 + 4 * n
            ng = u32(o, q); q += 4
            groups = []; ok = ng < 500
            for _ in range(ng if ok else 0):
                if q + 8 > len(o): ok = False; break
                sw, m = u32(o, q), u32(o, q + 4); q += 8
                if m > 500 or q + 4 * m > len(o): ok = False; break
                groups.append((sw, [u32(o, q + 4 * k) for k in range(m)])); q += 4 * m
            if not ok or q + 4 > len(o): continue
            npar = u32(o, q); q += 4
            if q + 13 * npar != len(o): continue
            group_id = u32(o, p - 9); default = u32(o, p - 8 + 0 - 0) if False else u32(o, p - 5)
            return dict(children=ch, groups=groups, group_id=group_id, default=default, ok=True)
        return dict(children=[], groups=[], ok=False)

    def music_children(self, t, o, bank):
        """Music nodes: scan u32s equal to known object ids. The first hit at offset 13 is the parent."""
        ids = self.by_bank[bank]
        me = u32(o, 0)
        hits = []
        for p in range(4, len(o) - 3):
            v = u32(o, p)
            if v != me and v in ids: hits.append((p, v))
        if hits and hits[0][0] == 13 and t in (10, 13):
            hits = hits[1:]
        if t == 10:
            hits = [h for h in hits if ids[h[1]][0] == 11]
        elif t == 11:
            hits = []
        out = []
        for _, v in hits:
            if v not in out: out.append(v)
        return out

    def music_media(self, o):
        out = []
        for p in range(4, len(o) - 3):
            v = u32(o, p)
            if v in self.media_files and v not in out: out.append(v)
        return out

    # ---- resolution
    def resolve(self, i, bank, depth=0):
        """Play tree of node i -> dict(media=[ids], loop, random, layered, switch, music, gain={id:dB})"""
        t, o, bk = self.get(i, bank)
        R = dict(media=[], loop=False, random=False, layered=False, switch=None, music=False, gain={}, notes=[])
        if t is None or depth > 30:
            R['notes'].append('missing node %08x' % i); return R
        if t == 2:
            src = u32(o, 9); R['media'] = [src]
            pr, _ = self.props(o, bk)
            R['loop'] = (74 in pr and u32(pr[74], 0) == 0)
            R['gain'][src] = self.chain_db(i, bk)
            if src not in self.media_files: R['notes'].append('wem %d not in bundles' % src)
            if 2 in pr and -3000 < f32(pr[2]) < 3000: R['pitchCents'] = f32(pr[2])
            return R
        if t in (5, 6, 9, 7):
            if t == 5:
                info = self.ranseq(o, bk)
                kids = info['children']; R['random'] = info['random'] and len(kids) > 1
                R['loop'] = info['loops'] == 0
                if not info['ok']: R['notes'].append('ranseq tail unparsed')
                R['sequence'] = (not info['random']) and len(kids) > 1
            elif t == 6:
                info = self.switch(o, bk); kids = info['children']
                if not info['ok']: R['notes'].append('switch unparsed')
            else:
                pp = self.parent_pos(o, bk)
                me = u32(o, 0); kids = []
                for p in range((pp or 9) + 4, len(o) - 3):
                    v = u32(o, p)
                    if v != me and v in self.glob and v not in kids and self.glob[v][0] in (2, 5, 6, 7, 9): kids.append(v)
                R['layered'] = (t == 9)
            subs = {c: self.resolve(c, bk, depth + 1) for c in kids}
            for c in kids:
                s = subs[c]
                for m in s['media']:
                    if m not in R['media']: R['media'].append(m)
                R['gain'].update(s['gain']); R['loop'] |= s['loop']; R['notes'] += s['notes']
                R['music'] |= s['music']; R['layered'] |= s['layered']
                R['random'] |= s['random'] and t != 6
                if s['switch'] and not R['switch'] and t != 6: R['switch'] = s['switch']
            if t == 6 and info['ok']:
                cases = {}
                for sw, members in info['groups']:
                    ms = []
                    for c in members:
                        for m in (subs.get(c) or self.resolve(c, bk, depth + 1))['media']:
                            if m not in ms: ms.append(m)
                    cases[sw] = ms
                R['switch'] = dict(group=info['group_id'], default=info['default'], cases=cases)
            return R
        if t in (10, 11, 12, 13):
            R['music'] = True; R['loop'] = True
            if t == 11:
                R['media'] = self.music_media(o)
                for m in R['media']: R['gain'][m] = 0.0
                return R
            for c in self.music_children(t, o, bk):
                s = self.resolve(c, bk, depth + 1)
                for m in s['media']:
                    if m not in R['media']: R['media'].append(m)
                R['gain'].update(s['gain']); R['notes'] += s['notes']
            R['random'] = (t == 13)
            return R
        R['notes'].append('node type %s' % t)
        return R

    def event(self, eid):
        bank, o = self.events[eid]
        n = o[4]; p = 5
        if n & 0x80: n = ((n & 0x7f) << 7) | o[5]; p = 6
        acts = [u32(o, p + 4 * k) for k in range(n)]
        play, others = [], []
        for a in acts:
            t, ao, bk = self.get(a, bank)
            if t != 3: continue
            at = struct.unpack_from('<H', ao, 4)[0]; tgt = u32(ao, 6)
            if at in (0x0403, 0x0503): play.append((tgt, bk))
            elif (at >> 8) == 0x12: others.append(dict(action='setSwitch', group=u32(ao, len(ao) - 8), value=u32(ao, len(ao) - 4)))
            elif (at >> 8) == 0x19: others.append(dict(action='setState', group=u32(ao, len(ao) - 8), value=u32(ao, len(ao) - 4)))
            else: others.append(dict(action='0x%04x' % at, target=tgt))
        return bank, play, others


# ------------------------------------------------------------------------------------------ 3. names
def collect_names(banks):
    """id -> name, from every source we trust: bank names, WwiseEventAssets, WwiseObjectReference assets,
    plus a dictionary of tokens (il2cpp metadata + dumped code) hashed on demand."""
    import UnityPy
    names = {}; assets = {}

    def add(n, src):
        if n:
            names.setdefault(fnv(n), (n, src))

    for nm in banks.by_bank: add(nm, 'bank')
    env = UnityPy.load(os.path.join(wos.D, 'wwisesoundbank.bundle'))
    for o in env.objects:
        if o.type.name != 'MonoBehaviour': continue
        t = o.read_typetree(); n = t['m_Name']; add(n, 'asset')
        win = [d for d in t.get('m_dataPerPlatformList', []) if d.get('WwisePlatform') == 'Windows'] or t.get('m_dataPerPlatformList', [])
        ml = []
        for d in win[:1]:
            for lm in d.get('LocalizedStreamingMediaValues', {}).get('localizedMediaList', []):
                ml += [int(m['id']) for m in lm['media']]
        assets[n] = ml
    objref = {}
    for b in WWISE_REF_BUNDLES:
        e, _ = wos.load([b], depth=1)
        for o in e.objects:
            if o.type.name != 'MonoBehaviour': continue
            try: t = o.read_typetree()
            except Exception: continue
            if 'objectName' in t and 'id' in t and 'guid' in t:
                objref[o.path_id] = (t['objectName'], t['id']); add(t['objectName'], 'objref')
    return names, assets, objref


def dictionary_names(names, wanted):
    """Last resort: hash every token in il2cpp metadata + code dumps and keep those that match wanted ids."""
    cands = set()
    meta = os.path.join(wos.DATA, 'il2cpp_data', 'Metadata', 'global-metadata.dat')
    if os.path.exists(meta):
        for m in re.finditer(rb'[A-Za-z0-9_\-\. ]{3,60}\x00', open(meta, 'rb').read()):
            cands.add(m.group()[:-1].decode('latin1'))
    for f in glob.glob(os.path.join(wos.REF, 'code', '**', '*'), recursive=True):
        if os.path.isfile(f):
            s = open(f, encoding='utf-8', errors='ignore').read()
            cands.update(m.group() for m in re.finditer(r'[A-Za-z0-9_\-\.]{3,60}', s))
    for c in sorted(cands):
        h = fnv(c)
        if h in wanted: names.setdefault(h, (c, 'dict'))


def map_sounds(objref):
    """mapsound.bundle prefabs `<mapId>_SoundEnvironmentObject`: AkAmbient/AkEvent components -> Wwise event names."""
    env, _ = wos.load(['mapsound.bundle'], depth=0)
    objs = {o.path_id: o for o in env.objects}
    cont = {}
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            cont.update(getattr(sf, 'container', {}) or {})
    owner = {}
    for path, a in cont.items():
        if a.type.name != 'GameObject': continue
        stack = [a.path_id]
        while stack:
            g = stack.pop()
            if g in owner: continue
            owner[g] = path
            for c in objs[g].read_typetree()['m_Component']:
                cp = c['component']['m_PathID']
                if cp in objs and objs[cp].type.name in ('Transform', 'RectTransform'):
                    for ch in objs[cp].read_typetree()['m_Children']:
                        chp = ch['m_PathID']
                        if chp in objs: stack.append(objs[chp].read_typetree()['m_GameObject']['m_PathID'])
    out = {}
    for o in env.objects:
        if o.type.name != 'MonoBehaviour': continue
        try: t = o.read_typetree()
        except Exception: continue
        ref = (t.get('data') or {}).get('WwiseObjectReference') if isinstance(t.get('data'), dict) else None
        if not ref: continue
        pid = ref['m_PathID']; g = t['m_GameObject']['m_PathID']
        pre = owner.get(g, '?'); m = re.search(r'/(\d+)_SoundEnvironmentObject', pre)
        key = m.group(1) if m else pre
        nm = objref.get(pid, (None,))[0]
        if nm: out.setdefault(key, [])
        if nm and nm not in out[key]: out[key].append(nm)
        if not nm: out.setdefault(key + '_unresolved', []).append(pid)
    return out


# ------------------------------------------------------------------------------------------ 4. index
def category(name, music):
    n = name.lower()
    if music or n.startswith('bgm'): return 'bgm'
    if n.startswith('ambience') or n.startswith('amb_'): return 'ambience'
    if 'footstep' in n or n.startswith('collision'): return 'footstep'
    if n.startswith('sfx_'): return 'sfx'
    if n.startswith('ui') or n.startswith('ui_'): return 'ui'
    return 'other'


def slug(s):
    return re.sub(r'[^A-Za-z0-9_\-]+', '_', s).strip('_')


def stage_index():
    banks = Banks()
    names, assets, objref = collect_names(banks)
    wanted = set(i for i in banks.events if i not in names)
    for bk, b in banks.by_bank.items():          # switch / state ids that need a readable name too
        for t, o in b.values():
            if t == 6:
                sw = banks.switch(o, bk)
                if sw['ok']:
                    wanted.add(sw['group_id']); wanted.add(sw['default']); wanted.update(g for g, _ in sw['groups'])
            elif t == 3 and (struct.unpack_from('<H', o, 4)[0] >> 8) in (0x12, 0x19):
                wanted.add(u32(o, len(o) - 8)); wanted.add(u32(o, len(o) - 4))
    dictionary_names(names, wanted)
    words = ('grass stone dirt sand snow wood water metal rock gravel mud ice cave carpet leaf leaves floor concrete tile default '
             'indoor outdoor day night none slime road bush forest swamp lava poison wasteland desert beach field town '
             'footstep surface material ground state time timeofday weather rain wind').split()
    for w in words:
        for c in (w, w.capitalize(), 'Footstep_' + w, 'footstep_' + w, 'Surface_' + w, 'Material_' + w):
            if fnv(c) in wanted: names.setdefault(fnv(c), (c, 'guess'))
    print('switch/state/event ids wanted %d, unresolved %d' % (len(wanted), len([w for w in wanted if w not in names])))
    ev_out = {}; media_owner = {}; unnamed = collections.Counter()
    order = sorted(banks.events, key=lambda i: (banks.events[i][0], i))
    for eid in order:
        bank, play, others = banks.event(eid)
        nm = names.get(eid, (None,))[0]
        if not nm:
            nm = '%s__%08x' % (bank, eid); unnamed[bank] += 1
        R = dict(media=[], loop=False, random=False, layered=False, switch=None, music=False, gain={}, notes=[])
        for tgt, bk in play:
            s = banks.resolve(tgt, bk)
            for m in s['media']:
                if m not in R['media']: R['media'].append(m)
            for k in ('loop', 'random', 'layered', 'music'): R[k] |= s[k]
            R['gain'].update(s['gain']); R['notes'] += s['notes']
            if s['switch'] and not R['switch']: R['switch'] = s['switch']
        e = dict(id=eid, bank=bank)
        if R['media']:
            gs = [R['gain'].get(m, 0.0) for m in R['media']]
            e['media'] = R['media']; e['loop'] = bool(R['loop']); e['random'] = bool(R['random'])
            e['volume'] = round(10 ** ((sum(gs) / len(gs)) / 20.0), 4)
            if R['layered']: e['layered'] = True
            if R['music']: e['music'] = True
            if R['switch']:
                sw = R['switch']
                gname = names.get(sw['group'], (None,))[0] or '%08x' % sw['group']
                e['switch'] = dict(group=gname, default=names.get(sw['default'], (None,))[0] or '%08x' % sw['default'],
                                   cases={(names.get(k, (None,))[0] or '%08x' % k): v for k, v in sw['cases'].items()})
            if R['notes']: e['notes'] = sorted(set(R['notes']))[:5]
        else:
            e['media'] = []
            if others: e['actions'] = [dict(a, **({'group': names.get(a['group'], (None,))[0] or '%08x' % a['group']} if 'group' in a else {}),
                                            **({'value': names.get(a['value'], (None,))[0] or '%08x' % a['value']} if 'value' in a else {})) for a in others]
        if '__' in nm and not e['media'] and len(e.get('actions', [])) == 1 and e['actions'][0]['action'] in ('setState', 'setSwitch'):
            a = e['actions'][0]; nm = '%s_%s_%s' % (a['action'][0].upper() + a['action'][1:], a['group'], a['value'])
        ev_out[nm] = e
        for m in e['media']:
            media_owner.setdefault(m, []).append(nm)
    # ---- media naming: first (sorted) event that owns it, bank-named events win over generic ones
    media = {}
    per_event_count = collections.Counter()
    ev_media_order = {}
    for nm in sorted(ev_out):
        e = ev_out[nm]
        for k, m in enumerate(e['media']):
            if m in media: continue
            cat = category(nm, e.get('music'))
            tot = len([x for x in e['media']])
            base = slug(nm) if tot == 1 else '%s_%02d' % (slug(nm), k + 1)
            media[m] = dict(name=base, category=cat)
    orphans = sorted(set(banks.media_files) - set(media))
    for m in orphans:
        media[m] = dict(name='media_%d' % m, category='unreferenced')
    # unique file names within category
    used = collections.defaultdict(set)
    for m in sorted(media):
        d = media[m]; n = d['name']; i = 2
        while n.lower() in used[d['category']]:
            n = '%s_%d' % (d['name'], i); i += 1
        used[d['category']].add(n.lower()); d['name'] = n
    maps = map_sounds(objref)
    json.dump(dict(maps=maps, media=media, ev_out=ev_out, orphans=orphans, assets=assets,
                   objref={str(k): v for k, v in objref.items()},
                   names={str(k): v[0] for k, v in names.items() if k in banks.events or True}),
              open(os.path.join(RAW, 'index_stage.json'), 'w'))
    print('events', len(ev_out), 'unnamed', dict(unnamed), 'media', len(media), 'orphans', len(orphans))
    # cross-check with WwiseEventAsset media lists
    bad = 0; checked = 0; missing_events = []
    for an, ml in assets.items():
        if an in ev_out:
            checked += 1
            if set(ml) != set(ev_out[an]['media']):
                bad += 1
                if bad <= 8: print('  media mismatch', an, sorted(ml)[:4], sorted(ev_out[an]['media'])[:4])
        else:
            missing_events.append(an)
    print('asset cross-check: %d events, %d mismatches; asset without bank/event: %s' % (checked, bad, missing_events))


# ------------------------------------------------------------------------------------------ 5. decode
def probe(path):
    r = subprocess.run([VGM, '-m', '-i', path], capture_output=True, text=True, timeout=60)
    ch = int(re.search(r'channels: (\d+)', r.stdout).group(1))
    sr = int(re.search(r'sample rate: (\d+)', r.stdout).group(1))
    sec = re.search(r'play duration: (\d+) samples', r.stdout)
    dur = int(sec.group(1)) / float(sr)
    return ch, sr, dur


def decode_one(args):
    mid, src, dst, cat = args
    try:
        ch, sr, dur = probe(src)
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            return mid, ch, sr, dur, 'cached'
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        music = cat in ('bgm',)
        out_ch = 1 if ch == 1 else 2
        br = (96 if out_ch == 2 else 64) if music else (64 if out_ch == 2 else 48)
        v = subprocess.Popen([VGM, '-i', '-p', src], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        f = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-i', 'pipe:0', '-ac', str(out_ch), '-c:a', 'libvorbis',
                              '-b:a', '%dk' % br, '-map_metadata', '-1', dst], stdin=v.stdout, stderr=subprocess.PIPE)
        v.stdout.close()
        try:
            _, err = f.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            f.kill(); v.kill(); return mid, ch, sr, dur, 'timeout'
        v.wait(timeout=10)
        if f.returncode != 0 or not os.path.exists(dst):
            return mid, ch, sr, dur, 'ffmpeg: ' + err.decode('utf8', 'replace')[:200]
        return mid, ch, sr, dur, 'ok'
    except Exception as e:
        return mid, 0, 0, 0, 'error: %r' % e


def stage_decode():
    from multiprocessing import Pool
    st = json.load(open(os.path.join(RAW, 'index_stage.json'), encoding='utf-8'))
    media = st['media']
    if os.path.isdir(OUT):
        # clear only our own output
        for c in os.listdir(OUT):
            p = os.path.join(OUT, c)
            if os.path.isdir(p): shutil.rmtree(p)
    jobs = [(int(m), os.path.join(WEM, '%s.wem' % m), os.path.join(OUT, d['category'], d['name'] + '.ogg'), d['category'])
            for m, d in sorted(media.items(), key=lambda x: int(x[0])) if os.path.exists(os.path.join(WEM, '%s.wem' % m))]
    t0 = time.time()
    res = {}
    with Pool(4) as pool:
        for k, r in enumerate(pool.imap_unordered(decode_one, jobs, chunksize=4)):
            res[r[0]] = r
            if k % 200 == 0: print('  decoded', k, '/', len(jobs), round(time.time() - t0), 's', flush=True)
    bad = [r for r in res.values() if r[4] not in ('ok', 'cached')]
    print('decode: %d files, %d failed, %ds' % (len(res), len(bad), time.time() - t0))
    for r in bad[:20]: print('  FAIL', r)
    json.dump({str(k): v for k, v in res.items()}, open(os.path.join(RAW, 'decode_stage.json'), 'w'))


# ------------------------------------------------------------------------------------------ 6. final index + budget
def stage_final():
    st = json.load(open(os.path.join(RAW, 'index_stage.json'), encoding='utf-8'))
    dec = json.load(open(os.path.join(RAW, 'decode_stage.json')))
    media = st['media']; ev = st['ev_out']
    mout = {}
    total = 0
    for m, d in media.items():
        if m not in dec: continue
        _, ch, sr, dur, status = dec[m]
        rel = 'audio/%s/%s.ogg' % (d['category'], d['name'])
        fp = os.path.join(wos.ASSETS, rel.replace('/', os.sep))
        if status not in ('ok', 'cached') or not os.path.exists(fp): continue
        size = os.path.getsize(fp); total += size
        mout[m] = dict(name=d['name'], file=rel, durationSec=round(dur, 3), channels=ch, sampleRate=sr, bytes=size, category=d['category'])
    dropped = []
    if total > BUDGET_MB * 1e6:
        # drop unreferenced first, then longest files of the heaviest non-bgm categories
        order = sorted(mout, key=lambda m: (mout[m]['category'] != 'unreferenced', -mout[m]['bytes']))
        for m in order:
            if total <= BUDGET_MB * 1e6: break
            total -= mout[m]['bytes']; os.remove(os.path.join(wos.ASSETS, mout[m]['file'].replace('/', os.sep)))
            dropped.append(mout.pop(m)['file'])
    events = {}
    for nm, e in ev.items():
        o = dict(id=e['id'], bank=e['bank'])
        ms = [m for m in e['media'] if str(m) in mout or m in mout]
        o['media'] = [str(m) for m in ms]
        if e['media']:
            for k in ('loop', 'random', 'volume', 'layered', 'music', 'notes'):
                if k in e: o[k] = e[k]
            if 'switch' in e:
                o['switch'] = dict(e['switch'], cases={k: [str(x) for x in v if str(x) in mout] for k, v in e['switch']['cases'].items()})
        elif 'actions' in e:
            o['actions'] = e['actions']
        events[nm] = o
    # refs the code/data use
    refs = {}
    names = {int(k): v for k, v in st['names'].items()}
    objref = {int(k): v for k, v in st['objref'].items()}
    cw = os.path.join(wos.REF, 'code', 'data', 'CommonWwiseEventData.json')
    if os.path.exists(cw):
        j = json.load(open(cw, encoding='utf-8'))
        for k, lab in (('<AttackSoundEvent>k__BackingField', 'attackSound'), ('<ReturnSoundEvent>k__BackingField', 'returnSound')):
            pid = j[k]['WwiseObjectReference']['m_PathID']
            if pid in objref: refs[lab] = objref[pid][0]
    refs['mapSounds'] = st.get('maps', {})
    refs['footstepEvents'] = sorted(n for n in events if n.lower().startswith('footstep_'))
    missing = {}
    for nm, e in ev.items():
        for m in e['media']:
            if str(m) not in mout: missing.setdefault(str(m), []).append(nm)
    index = dict(version=1, note='Wwise 2022.1 export. events[name] -> media ids; media[id] -> file (relative to repo root). '
                 'volume is linear (from Wwise dB chain), loop=true means infinite loop, random=true means pick one of media.',
                 events=events, media=mout, refs=refs, dropped=dropped, missingMedia=missing,
                 totalBytes=total)
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1, ensure_ascii=False)
    print('final: %d events, %d media, %.1f MB, dropped %d' % (len(events), len(mout), total / 1e6, len(dropped)))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    stage = args[0] if args else 'all'
    force = '--force' in sys.argv
    if stage in ('extract', 'all'): stage_extract(force)
    if stage in ('index', 'all'): stage_index()
    if stage in ('decode', 'all'): stage_decode()
    if stage in ('final', 'all'): stage_final()
