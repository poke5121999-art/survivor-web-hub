# -*- coding: utf-8 -*-
"""skill_audit.py - đối chiếu skill GỐC của 4 nhân vật với bản web, in từng chỗ lệch ra docs/SKILL_AUDIT.md.

    set PYTHONIOENCODING=utf-8
    python tools/skill_audit.py --scan     # quét bundle VFX gốc (UnityPy): component/script/Animator của mọi prefab
                                           #   → ~/Downloads/vd-ref/cache/vfx_components.json (ngoài git, chạy một lần)
    python tools/skill_audit.py            # đọc bảng gốc + mã web, ghi docs/SKILL_AUDIT.md
    python tools/skill_audit.py --json     # in thêm danh sách lỗ hổng dạng JSON ra stdout

Nguồn gốc: ~/Downloads/vd-ref/json (Skill, HitBox, Buff, BuffVfx, StatusEffectTag, Character, ExtraUnit, text_vi).
Phía web: js/skill.js (EVENTS, node, anim), js/hitbox.js (HitBoxInfo, COLLISION, iterator), js/stage.js (playFx),
js/vfx.js + art/vfx/*.json (prefab đã bóc), art/spine/*/*.skel (tên anim), audio/sfx/*.mp3.

Mỗi lỗ hổng là một dòng: loại, mô tả, số skill bị ảnh hưởng, các skill, trạng thái (còn / đã sửa + lý do).
Luật ngữ nghĩa đọc từ mã C# gốc (tools/il2cpp_method.py) nằm trong SEMANTIC bên dưới: mỗi luật có trích dẫn hàm gốc
và một phép kiểm trên mã web (regex) để biết đã sửa chưa.
"""
import collections, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # games/voiddiver
REF = os.path.join(os.path.expanduser('~'), 'Downloads', 'vd-ref')
REF_JSON = os.path.join(REF, 'json')
SCAN_CACHE = os.path.join(REF, 'cache', 'vfx_components.json')
OUT_MD = os.path.join(ROOT, 'docs', 'SKILL_AUDIT.md')
CHARS = (100001, 100003, 100004, 100005)
SPINE_OF = {100001: 'Cha_Sword', 100003: 'Cha_Dullahan', 100004: 'Cha_Caster', 100005: 'Cha_Raven'}


def load(name):
    return json.load(io.open(os.path.join(REF_JSON, name + '.json'), encoding='utf-8'))


def rd(path):
    return io.open(os.path.join(ROOT, path), encoding='utf-8').read()


def T(t):
    return str(t or '').split(',')[0].split('.')[-1]


# Giá trị "trống" riêng từng trường (enum mặc định, −1 = không dùng) — đo trên toàn HitBox.json / Skill.json.
FIELD_DEFAULT = {'FixedYPos': -1, 'CollisionTriggerDelay': -1, 'multiHitInterval': -1, 'ExecuteType': 'Immediate'}


def nondef(v, key=None):
    if key in FIELD_DEFAULT:
        d = FIELD_DEFAULT[key]
        try:
            return float(v) != d if isinstance(d, (int, float)) else v != d
        except (TypeError, ValueError):
            return v != d
    if v is None or v is False or v == '' or v == [] or v == {} or v == 'None':
        return False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v != 0
    if isinstance(v, str):
        if re.fullmatch(r'-?[\d.]+', v):
            return float(v) != 0
        if re.fullmatch(r'-?[\d.]+(:-?[\d.]+)+', v):
            return any(float(x) != 0 for x in v.split(':'))
    return True


# ------------------------------------------------------------------------------------------------ bảng gốc --
class Orig:
    def __init__(self):
        self.skill = {r['Id']: r for r in load('Skill')}
        self.hb = {r['Id']: r for r in load('HitBox')}
        self.buff = {r['Id']: r for r in load('Buff')}
        self.bvfx = collections.defaultdict(list)
        for r in load('BuffVfx'):
            self.bvfx[r['BuffId']].append(r)
        self.tag = {r['Tag']: r for r in load('StatusEffectTag')}
        self.char = {r['Id']: r for r in load('Character')}
        self.extra = {r['Id']: r for r in load('ExtraUnit')}
        self.text = load('text_vi')

    def name(self, sid):
        return self.text.get('TSkill_Name_%d' % sid) or (self.skill.get(sid) or {}).get('Memo') or str(sid)


def char_skills(o, cid):
    """skill thuộc nhân vật: đánh thường, lướt, ActiveSkillIds, bản polymorph, passive (bỏ Preview), skill thay thế
    (ChangeSkill của buff) và skill của ExtraUnit do hitbox sinh — theo thứ tự ô phím."""
    c = o.char[cid]
    ids = [c.get('AttackSkillId'), c.get('DashSkillId')] + (c.get('ActiveSkillIds') or [])
    ids += [c.get('PolymorphAttackSkillId'), c.get('PolymorphDashSkillId')] + (c.get('PolymorphActiveSkillIds') or [])
    ids += c.get('PassiveSkillIds') or []
    out = []
    for i in ids:
        if i and i in o.skill and i not in out and o.skill[i].get('SkillType') != 'Preview':
            out.append(i)
    return out


# ------------------------------------------------------------------------------------------- duyệt một skill --
class Use:
    """mọi thứ một skill chạm tới trong dữ liệu gốc."""

    def __init__(self):
        self.node_f = set(); self.anim_f = set(); self.ev = collections.defaultdict(set)
        self.iter_f = set(); self.hb_f = set(); self.coll = collections.defaultdict(set)
        self.vfx = set(); self.sfx = set(); self.anims = set(); self.buffs = set(); self.hbs = set()
        self.extra_skills = set(); self.change_skills = set()
        self.ev_raw = []          # (loại, event) để luật ngữ nghĩa soi
        self.anim_raw = []        # SkillAnimationData
        self.node_raw = []


def walk_skill(o, sid, use, seen_sk=None):
    seen_hb, seen_buff = set(), set()
    seen_sk = seen_sk if seen_sk is not None else set()
    if sid in seen_sk:
        return
    seen_sk.add(sid)

    def buff(bid):
        if not isinstance(bid, int) or bid <= 0 or bid in seen_buff or bid not in o.buff:
            return
        seen_buff.add(bid)
        use.buffs.add(bid)
        b = o.buff[bid]
        for r in o.bvfx.get(bid, []):
            for k in ('Vfx', 'DotVfx'):
                if nondef(r.get(k)):
                    use.vfx.add(r[k])
            for k in ('Sfx', 'DotSfx'):
                if nondef(r.get(k)):
                    use.sfx.add(r[k])
        tg = o.tag.get(b.get('EffectTag'))
        if tg:
            for k in ('Vfx', 'DotVfx'):
                if nondef(tg.get(k)):
                    use.vfx.add(tg[k])
        for ef in b.get('BuffEffects') or []:
            if nondef(ef.get('Vfx')):
                use.vfx.add(ef['Vfx'])
            if nondef(ef.get('Sfx')):
                use.sfx.add(ef['Sfx'])
            if isinstance(ef.get('HitBoxId'), int):
                hitbox(ef['HitBoxId'])
            if T(ef.get('$type')) == 'ChangeSkillEffect' and ef.get('ReplacementSkillId'):
                use.change_skills.add(ef['ReplacementSkillId'])

    def hitbox(hid):
        if not isinstance(hid, int) or hid <= 0 or hid in seen_hb or hid not in o.hb:
            return
        seen_hb.add(hid)
        use.hbs.add(hid)
        info = o.hb[hid].get('HitBoxInfo') or {}
        for k, v in info.items():
            if nondef(v, k):
                use.hb_f.add(k)
        for k in ('vfx', 'FireVfx', 'hitVfx'):
            if nondef(info.get(k)):
                use.vfx.add(info[k] + ('#elem' if k == 'hitVfx' and info.get('UseElementalHitVfx') else ''))
        for k in ('SpawnSfx', 'hitSfx', 'criticalHitSfx', 'pierceSfx', 'DestroyByHitSfx', 'DestroyByTimeoutSfx'):
            if nondef(info.get(k)):
                el = (k == 'hitSfx' and info.get('UseElementalHitSfx')) or (k == 'criticalHitSfx' and info.get('UseElementalCritSfx'))
                use.sfx.add(info[k] + ('#elem' if el else ''))
        for c in info.get('collisionEvents') or []:
            t = T(c.get('$type'))
            for k, v in c.items():
                if nondef(v):
                    use.coll[t].add(k)
            if nondef(c.get('Vfx')):
                use.vfx.add(c['Vfx'])
            if nondef(c.get('Sfx')):
                use.sfx.add(c['Sfx'])
            if c.get('buffId'):
                buff(c['buffId'])
        for d in info.get('destroyHitBoxId') or []:
            hitbox(d)
        events(info.get('ActionEventsOnDestroy') or [])
        ex = info.get('ExtraUnitIdOnDestroy')
        if ex and ex in o.extra:
            e = o.extra[ex]
            if nondef(e.get('SpawnVfx')):
                use.vfx.add(e['SpawnVfx'])
            for s in (e.get('PassiveSkillIds') or []) + (e.get('ActiveSkillIds') or []) + [e.get('AttackSkillId')]:
                if s and s in o.skill:
                    use.extra_skills.add(s)

    def events(evs):
        for e in evs:
            t = T(e.get('$type'))
            use.ev_raw.append((t, e))
            for k, v in e.items():
                if nondef(v):
                    use.ev[t].add(k)
            if t == 'VfxEvent' and nondef(e.get('prefab')):
                use.vfx.add(e['prefab'])
            if t == 'SfxEvent' and nondef(e.get('Sfx')):
                use.sfx.add(e['Sfx'])
            if t == 'HitBoxEvent':
                hitbox(e.get('Id'))
            if t == 'HitBoxIteratorEvent':
                it = e.get('HitBoxIterator') or {}
                for k, v in it.items():
                    if nondef(v):
                        use.iter_f.add(k)
                hitbox(it.get('HitBoxId'))
                hitbox((it.get('IndicatorInfo') or {}).get('HitBoxId'))
            if t == 'IndicatorVfxEvent':
                hitbox((e.get('IndicatorInfo') or {}).get('HitBoxId'))
            if t == 'BuffActionEvent' and not e.get('IsRemove'):
                buff(e.get('Id'))

    def node(n):
        a = n.get('skillAction') or {}
        use.node_raw.append(a)
        for k, v in a.items():
            if nondef(v, k):
                use.node_f.add(k)
        for an in a.get('SkillAnimationDatas') or []:
            use.anim_raw.append(an)
            for k, v in an.items():
                if nondef(v):
                    use.anim_f.add(k)
            for k in ('animationName', 'moveAnimationName'):
                if nondef(an.get(k)):
                    use.anims.add(an[k])
        events(a.get('actionEvents') or [])
        for c in n.get('childNodes') or []:
            node(c)

    r = o.skill.get(sid)
    if not r or not r.get('RootActionNode'):
        return
    if nondef(r.get('ActionSfx')):
        use.sfx.add(r['ActionSfx'])
    buff((r.get('DeactivateBuffCondition') or {}).get('BuffId'))
    node(r['RootActionNode'])


# ---------------------------------------------------------------------------------------------- phía web --
def props(src, var):
    return set(re.findall(r'\b' + var + r'\.(\w+)', src))


def handler_fields(src, table):
    """{loại: tập trường ev.X} của bảng handler 'var <table> = { A: function (...) { ... }, ... }'."""
    m = re.search(r'var ' + table + r' = \{(.*?)\n  \};', src, re.S)
    if not m:
        return {}
    body = m.group(1)
    parts = re.split(r'\n    (\w+): function', body)
    out = {}
    for i in range(1, len(parts) - 1, 2):
        out[parts[i]] = set(re.findall(r'\bev\.(\w+)', parts[i + 1])) | set(re.findall(r'\binfo\.(\w+)', parts[i + 1]))
    return out


class Web:
    def __init__(self):
        self.skill = rd('js/skill.js')
        self.hitbox = rd('js/hitbox.js')
        self.stage = rd('js/stage.js')
        self.vfx = rd('js/vfx.js')
        self.buff = rd('js/buff.js')
        self.unitvis = rd('js/unitvis.js')
        self.all = '\n'.join([self.skill, self.hitbox, self.stage, self.vfx, self.buff, self.unitvis])
        self.node_f = props(self.skill, 'a') | props(self.skill, 'skillAction') | props(self.skill, 'ra')
        self.anim_f = props(self.skill, 'an')
        self.events = handler_fields(self.skill, 'EVENTS')
        # HitBoxIteratorEvent chuyển nguyên ev cho HitBox.iterate (hitbox.js đọc ev.X / it.ev.X)
        it_src = self.hitbox[self.hitbox.find('HitBox.iterate'):self.hitbox.find('HitBox.cancelIter')]
        if 'HitBoxIteratorEvent' in self.events:
            self.events['HitBoxIteratorEvent'] |= props(it_src, 'ev') | props(it_src, r'it\.ev')
        self.coll = handler_fields(self.hitbox, 'COLLISION')
        self.iter_f = props(self.hitbox, 'c') | props(self.hitbox, 'cfg')
        self.hb_f = props(self.hitbox, 'info') | props(self.hitbox, 'i') | props(self.all, r'hb\.info') | props(self.all, 'hi')
        self.fx = json.load(io.open(os.path.join(ROOT, 'art', 'vfx', 'index.json'), encoding='utf-8'))
        self.sfx = set(os.path.splitext(f)[0] for f in os.listdir(os.path.join(ROOT, 'audio', 'sfx')))
        self.skel = {}

    def fx_names(self, ref):
        """tên tham chiếu → [tên prefab đã bóc] (khớp như vfx.js: alias, lá, biến thể nguyên tố)."""
        elem = ref.endswith('#elem')
        ref = ref.replace('#elem', '')
        leaf = ref.replace('\\', '/').split('/')[-1]
        fx, al = self.fx['fx'], self.fx.get('alias', {})
        for k in (ref, leaf):
            if k in al:
                v = al[k]
                return v if isinstance(v, list) else [v]
            if k in fx:
                return [k]
        if elem:
            got = [leaf + '_' + e for e in ('None', 'Fire', 'Water', 'Wind') if leaf + '_' + e in fx]
            if got:
                return got
        return []

    def fx_doc(self, name):
        info = self.fx['fx'].get(name)
        if not info:
            return None
        p = os.path.join(ROOT, 'art', 'vfx', info['file'])
        return json.load(io.open(p, encoding='utf-8')) if os.path.exists(p) else None

    def has_anim(self, spine, name):
        if spine not in self.skel:
            bufs = []
            d = os.path.join(ROOT, 'art', 'spine', spine)
            for f in os.listdir(d):
                if f.endswith('.skel'):
                    bufs.append((f, open(os.path.join(d, f), 'rb').read()))
            self.skel[spine] = bufs
        tries = [name, 'battle/' + name, 'default/' + name, re.sub(r'^battle/', '', name), re.sub(r'^default/', '', name)]
        missing = []
        for f, b in self.skel[spine]:
            ok = False
            for n in tries:
                enc = n.encode('utf-8')
                if bytes([len(enc) + 1]) + enc in b:
                    ok = True
                    break
            if not ok:
                missing.append(f)
        return missing


# --------------------------------------------------------------------------------- luật ngữ nghĩa (mã gốc) --
# Mỗi luật: id, mô tả lệch, trích dẫn mã gốc, applies(loại, event|anim|node) → bool, fixed(web) → (bool, ghi chú).
def _vfx_ind_bone(t, e):
    return t == 'VfxEvent' and e.get('IsIndependent') and nondef(e.get('boneType'))


def _vfx_follow_offset(t, e):
    if t != 'VfxEvent' or e.get('IsIndependent'):
        return False
    off = [float(x) for x in str(e.get('offset') or '0:0:0').split(':')]
    return not nondef(e.get('boneType')) and (off[0] != 0 or off[2] != 0)


def _vfx_follow_bone_offset(t, e):
    if t != 'VfxEvent' or e.get('IsIndependent') or not nondef(e.get('boneType')):
        return False
    off = [float(x) for x in str(e.get('offset') or '0:0:0').split(':')]
    return off[0] != 0 or off[2] != 0


SEMANTIC = [
    {'id': 'vfx-ind-bone', 'kind': 'VfxEvent',
     'desc': 'VfxEvent IsIndependent có boneType: bản gốc KHÔNG cộng độ lệch khớp (chỉ nhánh bám theo mới gửi BoneType); '
             'vị trí = ITarget.Position + (phải, lên, tới)·offset theo hướng VFX',
     'cite': 'UnitController.OnVfxEvent 0x1806652b0 (BoneType/TargetPositionOffset chỉ ghi khi !IsIndependent; '
             'nhánh độc lập: Position = Position + r·x + u·y + d·z, r = cross(up, d))',
     'applies': _vfx_ind_bone,
     'fixed': lambda w: re.search(r'bone:\s*ev\.IsIndependent\s*\?\s*null', w.skill) is not None},
    {'id': 'vfx-follow-offset', 'kind': 'VfxEvent',
     'desc': 'VfxEvent bám theo, không khớp, offset có x/z: bản gốc quay offset theo Forward (hoặc MoveDir nếu '
             'InheritMoveDir) của unit MỖI KHUNG, hướng VFX giữ như lúc sinh; web quay offset theo hướng VFX',
     'cite': 'UnitFollower.Update 0x180716170 (boneType None: pos = view.pos + LookRotation(flat(Forward|MoveDir))·offset)',
     'applies': _vfx_follow_offset,
     'fixed': lambda w: 'unitFollower' in w.stage},
    {'id': 'vfx-follow-bone-offset', 'kind': 'VfxEvent',
     'desc': 'VfxEvent bám theo có khớp: offset cộng theo trục thế giới (không quay); web quay theo hướng VFX',
     'cite': 'UnitFollower.Update 0x180716170 (boneType ≠ None: pos = view.pos + GetBoneOffset(bone) + offset)',
     'applies': _vfx_follow_bone_offset,
     'fixed': lambda w: 'unitFollower' in w.stage},
    {'id': 'anim-multitrack', 'kind': 'SkillAnimationData',
     'desc': 'UseMultiTrackMoveAnimation: đi trong skill thì bản gốc phát moveAnimationName trên track riêng (chân) '
             'chồng lên clip skill; web thay hẳn clip bằng moveAnimationName',
     'cite': 'UnitSkillState.UpdateMoveByInputAnimation 0x1806ce970 → NtfPlayAnimation.MultiTrackAnimationName → '
             'UnitView.PlayAnimationAsync',
     'applies': lambda t, e: t == 'anim' and e.get('UseMultiTrackMoveAnimation'),
     'fixed': lambda w: 'multiTrack' in w.stage and 'poseTrack1' in w.unitvis},
]


# -------------------------------------------------------------------------------------- quét bundle VFX --
def scan(names=None):
    sys.path.insert(0, HERE)
    import vd_common as vc
    import fx_export as fe
    bundle = vc.bfile(fe.VFX_BUNDLE)
    deps = set()
    for p in fe.PRELOAD:
        try:
            deps.add(vc.bfile(p))
        except KeyError:
            pass
    fxi = json.load(io.open(os.path.join(ROOT, 'art', 'vfx', 'index.json'), encoding='utf-8'))
    want = names or sorted(n for n, v in fxi['fx'].items() if not v.get('src'))
    out = {}
    if os.path.exists(SCAN_CACHE):
        out = json.load(io.open(SCAN_CACHE, encoding='utf-8'))

    def cls_of(c):
        try:
            return c.m_Script.read().m_ClassName
        except FileNotFoundError:
            raise
        except Exception:
            return '?'

    def one(env, pmap, n):
        comps, scripts, anim_skip, lines = collections.Counter(), collections.Counter(), collections.Counter(), []
        nodes = []

        def walk(go, parent, path):
            tf = None
            idx = len(nodes)
            nodes.append({'n': go.m_Name, 'p': parent})
            for cp in go.m_Component:
                try:
                    c = cp.component.read()
                except FileNotFoundError:
                    raise
                except Exception:
                    comps['?'] += 1
                    continue
                tn = type(c).__name__
                if tn in ('Transform', 'RectTransform'):
                    tf = c
                    continue
                comps[tn] += 1
                if tn == 'MonoBehaviour':
                    scripts[cls_of(c)] += 1
                elif tn == 'Animator':
                    try:
                        ctrl = c.m_Controller.deref().read()
                        for clp in ctrl.m_AnimationClips:
                            tt = clp.deref().read_typetree()
                            for b in tt['m_ClipBindingConstant']['genericBindings']:
                                tid, attr = b['typeID'], b['attribute']
                                ok = (tid == 4 and attr in fe.TF_NAME) or (tid, attr & 0xffffffff) in fe.ANIM_PROPS
                                if not ok:
                                    anim_skip['%d/%d' % (tid, attr & 0xffffffff)] += 1
                    except FileNotFoundError:
                        raise
                    except Exception as e:
                        anim_skip['lỗi:' + str(e)[:40]] += 1
                elif tn in ('LineRenderer', 'SpriteRenderer', 'SkinnedMeshRenderer', 'AudioSource'):
                    lines.append('%s trên %s' % (tn, path))
            if tf is not None:
                for ch in tf.m_Children:
                    g = ch.read().m_GameObject.read()
                    walk(g, idx, path + '/' + g.m_Name)
        walk(pmap[n][0].read(), -1, n)
        return {'comps': dict(comps), 'scripts': dict(scripts), 'animSkip': dict(anim_skip), 'where': lines}

    def run(env):
        pmap = fe.build_prefab_map(env, bundle)
        for i, n in enumerate(want):
            if n not in pmap:
                continue
            out[n] = one(env, pmap, n)
            if i % 40 == 0:
                print('  %d/%d %s' % (i, len(want), n), flush=True)
        return out
    res = vc.with_deps(bundle, run, deps)
    os.makedirs(os.path.dirname(SCAN_CACHE), exist_ok=True)
    io.open(SCAN_CACHE, 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False, indent=0))
    print('ghi', SCAN_CACHE, len(res), 'prefab')


# Script trong prefab VFX: đã phát (web làm theo mã gốc) hay không ảnh hưởng hình. Mỗi mục ghi lý do đo được.
SCRIPT_OK = {
    'ChainSkillVfx': 'vfx.js runScript theo ChainSkillVfx.FixedUpdate',
    'StatusVfx': 'OnDespawn 0x1805f15a0: Animator có EndTrigger thì chạy End rồi mới huỷ = VD.vfx.stop(h, "end")',
    'UniversalAdditionalLightData': 'dữ liệu URP đi kèm Light (xem dòng Light)',
    'EffectShaderASecondColor': 'fx_export grad2 → màu phụ typeA',
    'SimpleAnimatorDelay': 'fx_export animDelay → trễ Animator',
    'SkillVfx': 'stage/vfx: bám hitbox, PlayEnd khi hitbox mất (SkillVfx.Init/LateUpdate)',
    'Description': 'ghi chú editor',
}
COMP_OK = {'ParticleSystem', 'ParticleSystemRenderer', 'MeshFilter', 'MeshRenderer', 'TrailRenderer', 'Animator',
           'MonoBehaviour'}
COMP_NOTE = {'Light': 'Light: vfx.js dùng 4 PointLight chung (gần đúng cường độ/tầm)'}


# --------------------------------------------------------------------------------------------------- audit --
def audit():
    o, w = Orig(), Web()
    comp_cache = json.load(io.open(SCAN_CACHE, encoding='utf-8')) if os.path.exists(SCAN_CACHE) else None
    gaps = collections.OrderedDict()
    skill_label = {}

    def gap(key, kind, desc, sid, fixed=None, note=''):
        g = gaps.get(key)
        if not g:
            g = gaps[key] = {'kind': kind, 'desc': desc, 'skills': set(), 'fixed': fixed, 'note': note}
        g['skills'].add(sid)

    GENERIC_EV = {'$type', 'text', 'TypeAndText', 'startTime', 'ActionTarget', 'BuffConditionList', 'TalentConditionList'}
    EDITOR_NODE = {'SkillId', 'SkillType', 'text', 'UniqueId', 'timeFrom', 'timeTo', 'MoveSpeedCurve'}
    EDITOR_HB = {'MoveSpeedCurve'}
    per_char = collections.OrderedDict()
    for cid in CHARS:
        sids = char_skills(o, cid)
        extra = []
        for sid in list(sids):
            u = Use()
            walk_skill(o, sid, u)
            for s in sorted(u.change_skills | u.extra_skills):
                if s not in sids and s not in extra:
                    extra.append(s)
        per_char[cid] = sids + extra
    total = 0
    for cid, sids in per_char.items():
        spine = SPINE_OF[cid]
        for sid in sids:
            total += 1
            key_s = '%d %s' % (sid, o.name(sid))
            skill_label[sid] = (cid, key_s)
            u = Use()
            walk_skill(o, sid, u)
            for f in sorted(u.node_f - w.node_f - EDITOR_NODE):
                gap('node:' + f, 'Node', 'trường node `%s` có dữ liệu, web không đọc' % f, sid)
            for f in sorted(u.anim_f - w.anim_f):
                gap('anim:' + f, 'Anim', 'trường SkillAnimationData `%s` có dữ liệu, web không đọc' % f, sid)
            for t, fs in u.ev.items():
                if t == 'HitBoxIterator':
                    continue
                if t not in w.events:
                    gap('ev:' + t, 'Event', 'sự kiện `%s` không có handler trong EVENTS' % t, sid)
                    continue
                for f in sorted(fs - w.events[t] - GENERIC_EV):
                    gap('evf:%s.%s' % (t, f), 'Event', '`%s.%s` có dữ liệu, handler không đọc' % (t, f), sid)
            for f in sorted(u.iter_f - w.iter_f):
                gap('iter:' + f, 'HitBox', '`HitBoxIterator.%s` có dữ liệu, hitbox.js không đọc' % f, sid)
            for f in sorted(u.hb_f - w.hb_f - EDITOR_HB):
                gap('hb:' + f, 'HitBox', '`HitBoxInfo.%s` có dữ liệu, hitbox.js/stage.js không đọc' % f, sid)
            for t, fs in u.coll.items():
                if t not in w.coll:
                    gap('coll:' + t, 'HitBox', 'sự kiện va chạm `%s` không có handler' % t, sid)
                    continue
                for f in sorted(fs - w.coll[t] - {'$type', 'targetType', 'IsOnce', 'BuffConditionList', 'HitableConditions'}):
                    gap('collf:%s.%s' % (t, f), 'HitBox', '`%s.%s` có dữ liệu, handler không đọc' % (t, f), sid)
            # anim
            for a in sorted(u.anims):
                miss = w.has_anim(spine, a)
                if miss:
                    gap('animmiss:%s:%s' % (spine, a), 'Anim', 'clip `%s` không có trong %s' % (a, ', '.join(miss)), sid)
            # sfx
            for s in sorted(u.sfx):
                base = s.replace('#elem', '')
                names = [base + '_' + e for e in ('None',)] if s.endswith('#elem') else [base]
                if not any(n in w.sfx for n in names):
                    gap('sfx:' + s, 'SFX', 'tiếng `%s` không có trong audio/sfx' % ' / '.join(names), sid)
            # vfx
            for ref in sorted(u.vfx):
                names = w.fx_names(ref)
                if not names:
                    gap('vfxmiss:' + ref, 'VFX', 'prefab `%s` chưa bóc (không có trong art/vfx/index.json)' % ref, sid)
                    continue
                for n in names:
                    doc = w.fx_doc(n)
                    if not doc:
                        gap('vfxmiss:' + n, 'VFX', 'tệp art/vfx của `%s` không có' % n, sid)
                        continue
                    for s in doc.get('systems', []):
                        for m in s.get('skipped', []):
                            gap('vfxmod:' + m, 'VFX', 'module hạt `%s` chưa phát' % m, sid, note=n)
                        mat = (s.get('r') or {}).get('mat') or {}
                        if mat.get('sh') == 'skip':
                            gap('vfxsh:' + str(mat.get('shader')), 'VFX', 'shader `%s` bị bỏ (không vẽ)' % mat.get('shader'), sid, note=n)
                        elif mat.get('sh') == 'U':
                            # Mobile/Particles/Alpha Blended (shader dựng sẵn của Unity) = texture × màu đỉnh, Blend SrcAlpha
                            # OneMinusSrcAlpha — đúng y cách vẽ U, nên không còn là gần đúng.
                            exact = 'Mobile/Particles/Alpha Blended' in str(mat.get('shader'))
                            gap('vfxsh:' + str(mat.get('shader')), 'VFX', 'shader `%s` vẽ gần đúng (unlit ảnh × màu)' % mat.get('shader'),
                                sid, fixed=True if exact else None, note=n)
                    for li in doc.get('lights', []):
                        gap('vfxlight', 'VFX', COMP_NOTE['Light'], sid, note=n)
                    for nt in doc.get('notes', []):
                        gap('vfxnote:' + nt.split(' trên ')[0], 'VFX', nt.split(' trên ')[0] + ' trong prefab chưa phát', sid, note=n)
                    if comp_cache is not None:
                        cc = comp_cache.get(n)
                        if cc is None:
                            gap('vfxscan:' + n, 'VFX', 'chưa quét component (chạy --scan)', sid, note=n)
                            continue
                        for cls in cc.get('scripts', {}):
                            if cls == 'ParticleSetupTool':
                                if not doc.get('setup'):
                                    gap('vfxpst:' + n, 'VFX', 'ParticleSetupTool (sizeMultiplier/delayOffset/additionalDelay, ApplyLogic '
                                        '0x1805da000) chưa nướng vào JSON — chạy lại tools/fx_export.py ' + n, sid, note=n)
                                continue
                            if cls not in SCRIPT_OK:
                                gap('vfxscript:' + cls, 'VFX', 'script `%s` trong prefab: web không chạy' % cls, sid, note=n)
                        for tn in cc.get('comps', {}):
                            if tn not in COMP_OK and tn not in COMP_NOTE:
                                gap('vfxcomp:' + tn, 'VFX', 'component `%s` trong prefab: web không phát' % tn, sid, note=n)
                        for b in cc.get('animSkip', {}):
                            gap('vfxanim:' + b, 'VFX', 'Animator có đường cong thuộc tính `%s` (typeID/crc) web bỏ qua' % b, sid, note=n)
            # ngữ nghĩa
            for rule in SEMANTIC:
                hit = False
                if rule['kind'] == 'SkillAnimationData':
                    hit = any(rule['applies']('anim', an) for an in u.anim_raw)
                else:
                    hit = any(rule['applies'](t, e) for t, e in u.ev_raw)
                if hit:
                    gap('sem:' + rule['id'], 'Ngữ nghĩa', rule['desc'] + ' — gốc: ' + rule['cite'], sid, fixed=rule['fixed'](w))
    return o, gaps, skill_label, per_char, total, comp_cache is not None


# key → cách đã sửa (2026-09-28, vòng skillfx2). Lỗ hổng đã biến khỏi lần quét (trường nay được đọc) vẫn liệt kê ở đây.
FIXED_NOTES = {
    'sem:vfx-follow-offset': 'stage.js syncFollower (unitFollower) theo UnitFollower.Update: offset quay theo Forward/MoveDir '
                             'mỗi khung, hướng VFX giữ lúc sinh; ảnh scratchpad skillfx2/mio_blade_ba.png',
    'sem:vfx-follow-bone-offset': 'stage.js syncFollower: GetBoneOffset tính lại mỗi khung + offset trục thế giới',
    'sem:vfx-ind-bone': 'skill.js VfxEvent: IsIndependent thì không gửi boneType; ảnh g_chain_ba.png',
    'sem:anim-multitrack': 'unitvis.js poseTrack1/clearTrack1 + stage.js: đi trong skill → track 0 battle/walk|run, track 1 '
                           'moveAnimationName; dừng → clip skill chạy lại từ 0. Đo xương IK_leg_F_2: trước đứng yên (0,045; 0,015), '
                           'sau chạy theo battle/walk; ảnh r_gat_ba2.png',
    'anim:UseMultiTrackMoveAnimation': 'xem sem:anim-multitrack',
    'hb:UseAimCorrection': 'hitbox.js correctAimDir theo HitBox.CorrectAimDir 0x1805dfc30 (≤ 10°, quái trong tầm nhìn gần nhất); '
                           'đo: lệch 5°/9° → bắn thẳng vào quái, 11°/20° giữ nguyên',
    'hb:IgnoreHitVfxWall': 'hitbox.js wallHitFx: đạn vỡ ở tường phát hitVfx/hitSfx (TryCollision 0x1805eaf20 → IsHighObstacle), '
                           'trừ IgnoreHitVfxWall; đo: đạn Raven vào tường 2 m → Raven_Shot_Hit + NormalAttack_Hit_None',
    'hb:pierceSfx': 'hitbox.js pierceStep theo HitBox.UpdateHitCollision 0x1805ebc70: xuyên tiếp thì phát pierceSfx',
    'hb:pierceChances': 'hitbox.js pierceStep: Random.Range(0,100) ≥ pierceChances[k] → hết xuyên',
    'vfxscript:ParticleSetupTool': 'fx_export.py apply_particle_setup (ApplyLogic 0x1805da000) nướng sizeMultiplier/'
                                   'delayOffset/additionalDelay; 26 prefab Raven xuất lại (dấu "setup"). HeadShot_Cast: 8 hệ trễ '
                                   '0,6 s → loé nòng trùng lúc bắn (r_headshot_ba.png); BlindlyShot ×0,75 (r_ult_ba.png)',
    'vfxscript:StatusVfx': 'không cần thêm: OnDespawn → EndTrigger = VD.vfx.stop(h, "end") đã có',
    'vfxsh:Mobile/Particles/Alpha Blended': 'fx_export.py: shader dựng sẵn không có thuộc tính màu → bỏ _TintColor sót (0,0,0,0) '
                                            'làm điếu thuốc vô hình; xuất lại Cigarette_Projectile. Shader gốc = ảnh × màu đỉnh, '
                                            'Blend SrcAlpha/OneMinusSrcAlpha — cách vẽ U khớp đúng (r_cig_ba.png)',
    'hitpoint-none': 'hitbox.js: hitPointType None vẫn phát hitVfx tại tâm hitbox; NearByOwner lấy _executionPosition (chỗ chủ '
                     'đứng lúc sinh hitbox) — TryCollision 0x1805eaf20',
    'mesh-name-clobber': 'fx_export.py mesh_out: chạy lẻ không ghi đè mesh trùng tên của prefab khác (msh_SphereDome01_uvv_uvflip)',
    'passive-double': 'stage.js S.spawn: makeUnit(S.A) đã push + initPassives, S.spawn lại initPassives lần nữa → mọi '
                      'AddPassiveSkillTrigger chạy 2 lần (đo: bom 10002 của Mio 5 passive × 2, phát 2 vòng Sitting_Ring cùng lúc); '
                      'nay makeUnit(add:false), S.spawn push + initPassives một lần → đo lại 5 × 1',
}
REMAIN_NOTES = {
    'node:executeTime': 'không tìm thấy nơi đọc SkillAction.ExecuteType/executeTime trong UnitSkillState.* (ExecuteSkillAction, '
                        'ProceedNextSkillAction, TriggerActiveSkill, OnUpdate, InitSkillAction, OnSkillActionTimeEnded, '
                        'IsNextNodeNeedInput); web bỏ qua như SKILLVM §2.2',
    'node:ExecuteType': 'như executeTime',
    'vfxlight': 'Light thật của URP (suy giảm, số đèn/vật) chưa dựng lại; vfx.js chọn 4 đèn mạnh nhất',
    'vfxscript:EffectRandomSeedController': 'chọn một hạt giống trong allowedSeeds rồi Play: bộ sinh số ngẫu nhiên hạt của Unity là '
                                            'mã đóng, web không tái lập được chuỗi ngẫu nhiên',
    'node:IsGroundSfxOnMove': 'UnitSkillState.UpdateGroundSfxOnMove cần BackgroundTileTypeCore.GetGroundType (loại nền theo ô) — '
                              'web chưa có hệ loại nền; chỉ Grass/Water có tiếng (SkillGroundMoveSfx)',
    'node:groundSfxInterval': 'như IsGroundSfxOnMove',
    'vfxsh:ArtTeam/VFX/VFX_Master_typeC_3CD': 'chưa giải DXBC shader typeC; vẽ gần đúng ảnh × màu',
    'vfxsh:LCArt/VFX/Shader_VFX_Grabpass_Distortion': 'shader méo ảnh nền (grab pass) — web chưa có bước chụp màn hình để méo',
    'vfxscript:FakeShadowPoint': 'hệ bóng giả FakeShadowManager (bóng đổ theo điểm sáng) web chưa có',
    'anim:nonCombatAnimationName': 'chỉ dùng khi UnitModel.IsNonCombat (sảnh) — phần sảnh do worker lobbyplay',
}


def write_md(o, gaps, skill_label, per_char, total, scanned):
    rows = sorted(gaps.items(), key=lambda kv: (-len(kv[1]['skills']), kv[0]))
    lines = ['# SKILL_AUDIT — skill 4 nhân vật: bản gốc ↔ bản web', '',
             'Sinh bởi `python tools/skill_audit.py` (đừng sửa tay; ghi chú lý do nằm trong `FIXED_NOTES`/`REMAIN_NOTES` của tool).', '',
             'Phạm vi: %d skill (đánh thường, lướt, ActiveSkillIds, bản polymorph, passive, skill thay thế, skill của ExtraUnit) của '
             '100001 Gayoung, 100003 Noah, 100004 Mio, 100005 Raven. Quét component prefab: %s.' % (total, 'có' if scanned else 'CHƯA (chạy --scan)'), '',
             'Cột "skill" = số skill bị ảnh hưởng. Sắp theo cột này. Trạng thái: **còn** / **đã sửa** (phép kiểm trên mã web '
             'hoặc lỗ hổng biến mất khỏi dữ liệu). Nguồn luật ngữ nghĩa: mã C# gốc đọc bằng `tools/il2cpp_method.py`.', '']
    open_rows = [(k, g) for k, g in rows if g['fixed'] is not True]
    done_rows = [(k, g) for k, g in rows if g['fixed'] is True]
    lines += ['## Còn lệch (%d)' % len(open_rows), '', '| # | loại | lệch | skill | ví dụ skill | ghi chú |', '|---|---|---|---|---|---|']
    for i, (k, g) in enumerate(open_rows, 1):
        ex = ', '.join(skill_label[s][1] for s in sorted(g['skills'])[:4]) + (' …' if len(g['skills']) > 4 else '')
        note = REMAIN_NOTES.get(k, '') or (('prefab: ' + g['note']) if g['note'] else '')
        lines.append('| %d | %s | %s | %d | %s | %s |' % (i, g['kind'], g['desc'].replace('|', '/'), len(g['skills']), ex, note.replace('|', '/')))
    lines += ['', '## Đã sửa (%d)' % len(done_rows), '', '| loại | lệch | skill | cách sửa |', '|---|---|---|---|']
    for k, g in done_rows:
        lines.append('| %s | %s | %d | %s |' % (g['kind'], g['desc'].replace('|', '/'), len(g['skills']), FIXED_NOTES.get(k, '').replace('|', '/')))
    gone = [k for k in FIXED_NOTES if k not in gaps]
    if gone:
        lines += ['', '### Đã sửa (lỗ hổng không còn trong lần quét này)', '']
        for k in gone:
            lines.append('- `%s`: %s' % (k, FIXED_NOTES[k]))
    lines += ['', '## Skill trong phạm vi', '']
    for cid, sids in per_char.items():
        lines.append('- **%d %s**: %s' % (cid, SPINE_OF[cid], ', '.join(skill_label[s][1] for s in sids)))
    io.open(OUT_MD, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('ghi', OUT_MD, '— còn', len(open_rows), 'đã sửa', len(done_rows))
    return rows


def main(argv):
    if '--scan' in argv:
        scan([a for a in argv if not a.startswith('--')] or None)
        return 0
    o, gaps, lbl, per_char, total, scanned = audit()
    rows = write_md(o, gaps, lbl, per_char, total, scanned)
    if '--json' in argv:
        print(json.dumps([{'key': k, 'kind': g['kind'], 'n': len(g['skills']), 'fixed': g['fixed'], 'desc': g['desc'],
                           'note': g['note']} for k, g in rows], ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
