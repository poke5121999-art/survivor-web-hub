"""Kiểm tiến trình (paudit): mỗi bước nhiệm vụ của bản gốc có chơi được tới xong trên bản web không -> PROGRESS-AUDIT.md.

Chạy:  python -I games/dredge/tools/progress_audit.py [ra.md]       (mặc định D:/dredge-ref/notes/PROGRESS-AUDIT.md; vài giây, chỉ đọc)
Đọc:   data/quests.js (QuestData, QuestStepData, QuestGridConfig), data/yarn.js (953 node đã biên dịch, docks), data/world_data.js
       (DockData, SpeakerData, ShopData), data/items.js, data/poi.js, data/explosives.js, data/research_ui.js, data/config.js,
       art/world/markers.json (HarvestPOI, HarvestZone), js/*.js (sổ lệnh/hàm Yarn đăng ký, chuỗi node gọi thẳng), index.html (tệp nạp).
       Bỏ DLC: nhiệm vụ nằm dưới Assets/Data/QuestData/DLC* trong dự án AssetRipper (D:/dredge-ref/ripped), hoặc tên DLC2_/TIR khi thiếu dự án.
Cách xét (theo QuestManager.cs):
  - Nhiệm vụ bắt đầu bằng Yarn SetQuestStarted / SetQuestStartedSilent / SetQuestAvailable (DredgeDialogueRunner.cs:390-400), hoặc tự mời khi
    canBeOfferedAutomatically + offerConditions (QuestManager.EvaluateUnavailableQuests).
  - Bước xong bằng Yarn SetQuestStepCompleted(Silent) (DredgeDialogueRunner.cs:380-385), hoặc tự xong khi allowAutomaticCompletion +
    completeConditions (EvaluateActiveQuestStepsForCompletion), hoặc MortarQuestStepAnimatorTriggerable.cs:23 (C#), hoặc SetQuestCompleted
    của cả nhiệm vụ khi bước đang chạy.
  - Đường Yarn đạt khi: node đi tới được từ một lối vào của bản web (node gốc của bến, người nói, điểm đến, bước showAtDock/showAtSpeaker,
    POI, điểm nổ, chuỗi node trong js/*.js) qua RunNode; mọi lệnh / hàm trên đường đi đã đăng ký (không phải stub) trong một tệp js mà
    index.html nạp; mọi lưới nhiệm vụ trên đường có hệ thống dựng; mọi món mà đường đòi (hàm ...ById, RemoveItemById, điều kiện lưới) kiếm được.
  - Món kiếm được (lặp tới điểm dừng): túi đầu ván, cửa hàng (alwaysInStock; món nghiên cứu nếu có cửa sổ Research), HarvestPOI / HarvestZone
    đang bật mà có đồ nghề cùng harvestableType, cá dị dạng của cá kiếm được (khi js/progress.js bật can-catch-aberrations), AddItemById /
    lưới CREATE trong node đi tới được, chai thư (ItemPOI), research-item (nạo vét), bait (MakeBait).
Ra:    bảng một dòng mỗi bước: OK / BLOCKED (lý do, tệp web).  Rerunnable: cùng đầu vào ra cùng đầu ra.
Bẫy:   `[BẪY]` lệnh ghi đè (DRYarn.command trong tệp khác) phải được index.html nạp, không thì stub trong yarn.js vẫn chạy.
       `[BẪY]` relic4 / relic5 không có HarvestPOI: chúng đến từ lưới SoldierRelic / DSPyre (CREATE), xét qua ShowQuestGrid.
"""
import io, os, re, sys, json
from collections import deque

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.environ.get('DR_GAME', os.path.dirname(HERE))   # DR_GAME=<thư mục games/dredge khác>: kiểm cây khác (vd _base15 để có số "trước")
RIPPED_Q = os.environ.get('DR_RIPPED_QUESTS', 'D:/dredge-ref/ripped/ExportedProject/Assets/Data/QuestData')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'D:/dredge-ref/notes/PROGRESS-AUDIT.md'


def load_js(rel):
    s = io.open(os.path.join(GAME, rel), encoding='utf-8').read()
    m = re.search(r'window\.\w+\s*=\s*', s)
    return json.JSONDecoder().raw_decode(s, m.end())[0]


Q = load_js('data/quests.js')
QUESTS, STEPS, GRIDS = Q['QuestData'], Q['QuestStepData'], Q['QuestGridConfig']
Y = load_js('data/yarn.js')
NODES = Y['nodes']
W = load_js('data/world_data.js')
ITEMS = load_js('data/items.js')
POI = load_js('data/poi.js')
EXPL = load_js('data/explosives.js')
RUI = load_js('data/research_ui.js')
CFG = load_js('data/config.js')
MARKERS = json.load(io.open(os.path.join(GAME, 'art/world/markers.json'), encoding='utf-8'))['markers']
INDEX = io.open(os.path.join(GAME, 'index.html'), encoding='utf-8').read()
LOADED = set(re.findall(r'<script src="(js/[\w-]+\.js)', INDEX))
JS = {}
for f in sorted(os.listdir(os.path.join(GAME, 'js'))):
    if f.endswith('.js'):
        JS['js/' + f] = io.open(os.path.join(GAME, 'js', f), encoding='utf-8').read()

# ---------------------------------------------------------------- DLC
def dlc_quests():
    out = set()
    if os.path.isdir(RIPPED_Q):
        for d, _, fs in os.walk(RIPPED_Q):
            if os.path.relpath(d, RIPPED_Q).split(os.sep)[0].startswith('DLC'):
                out.update(f[:-6] for f in fs if f.endswith('.asset') and f.startswith('Quest_'))
    else:
        out = {q for q in QUESTS if re.match(r'Quest_(DLC|IceCutter|Icebreaker|TheNarwhal|UnderTheIce|HoodedFigure5)', q)}
    return out


DLC = dlc_quests()
BASE = [q for q in QUESTS if q not in DLC]

# ---------------------------------------------------------------- sổ lệnh / hàm của bản web
def line_of(path, idx):
    return JS[path].count('\n', 0, idx) + 1


CMDS, FNS = {}, {}          # name -> (file:line, stub?)
yarn_src = JS.get('js/yarn.js', '')
for m in re.finditer(r"\bcmd\('(\w+)'", yarn_src):
    CMDS[m.group(1)] = ('js/yarn.js:%d' % line_of('js/yarn.js', m.start()), False)
for m in re.finditer(r"\bstub\('(\w+)'", yarn_src):
    CMDS[m.group(1)] = ('js/yarn.js:%d' % line_of('js/yarn.js', m.start()), True)
for m in re.finditer(r"\bfn\('([\w.]+)',\s*(.*)", yarn_src):
    FNS[m.group(1)] = ('js/yarn.js:%d' % line_of('js/yarn.js', m.start()), 'missingFn' in m.group(2))
for path, src in JS.items():
    if path == 'js/yarn.js' or path not in LOADED:
        continue
    for m in re.finditer(r"\.command\(\s*'(\w+)'", src):
        CMDS[m.group(1)] = ('%s:%d' % (path, line_of(path, m.start())), False)
    for m in re.finditer(r"\.fn\(\s*'([\w.]+)'", src):
        FNS[m.group(1)] = ('%s:%d' % (path, line_of(path, m.start())), False)

# ---------------------------------------------------------------- phân tích node
OPS = Y['ops']
OP = {n: i for i, n in enumerate(OPS)}


def node_info(name):
    ins = NODES[name]['i']
    cmds, fns, jumps, args = [], [], [], []
    for k, x in enumerate(ins):
        op = x[0]
        if op == OP['RunCommand']:
            cmds.append(x[1])
        elif op == OP['CallFunc']:
            fns.append(x[1])
            # [PushString id] [PushFloat n] [CallFunc f]: chuỗi đối số đứng trước
            j, a = k - 2, []
            while j >= 0 and ins[j][0] == OP['PushString'] and len(a) < 3:
                a.insert(0, ins[j][1]); j -= 1
            args.append((x[1], a))
        elif op == OP['RunNode'] and k and ins[k - 1][0] == OP['PushString']:
            jumps.append(ins[k - 1][1])
    return {'cmds': cmds, 'fns': fns, 'jumps': [j for j in jumps if j in NODES], 'args': args}


INFO = {n: node_info(n) for n in NODES}

# ---------------------------------------------------------------- lối vào của bản web
ENTRY = {}   # node -> (mô tả, cổng): cổng None = luôn mở, ('speaker', tên) / ('dest', id) = cần SetSpeakerAvailability / SetDestinationAvailable
def entry(n, why, gate=None):
    if n and n in NODES and (n not in ENTRY or (ENTRY[n][1] is not None and gate is None)):
        ENTRY[n] = (why, gate)


def speaker_gate(sp):
    sd = W['SpeakerData'].get(sp) or {}
    return None if sd.get('alwaysAvailable') else ('speaker', sp)


for did, d in W['DockData'].items():
    entry(d.get('yarnRootNode'), 'bến ' + did)
    for sp in d.get('speakers') or []:                                     # DockUI: DockData.speakers (js/dock.js:258)
        entry((W['SpeakerData'].get(sp) or {}).get('yarnRootNode'), 'người nói ' + sp, speaker_gate(sp))
for did, d in Y['docks'].items():
    for de in d.get('dests', []):                                           # điểm đến: always hoặc availableDestinations (js/dock.js)
        g = None if de.get('always') else ('dest', de['id'])
        entry(de.get('root'), 'điểm đến ' + de['id'], g)
        if de.get('speaker'):
            entry((W['SpeakerData'].get(de['speaker']) or {}).get('yarnRootNode'), 'người nói ' + de['speaker'], g)
for sid, s in STEPS.items():
    if s.get('showAtDock') or s.get('showAtSpeaker'):
        entry(s.get('yarnRootNode'), 'bước ' + sid + (' (showAtDock)' if s.get('showAtDock') else ' (showAtSpeaker)'))
for p in POI.get('points', []):
    entry(p.get('node'), 'POI ' + p['id'])
for e in EXPL:
    entry(e.get('node'), 'điểm nổ ' + e['id'])
for path, src in JS.items():                                                # node chạy thẳng từ js (dock.js HIJACKS ...)
    if path in LOADED:
        for m in re.finditer(r"node:\s*'([A-Z][A-Za-z0-9]*_[A-Za-z0-9_]+)'", src):
            entry(m.group(1), 'node trong ' + path)

TPL = CFG['saveDataTemplate']
OPEN = {('speaker', x) for x in TPL.get('availableSpeakers') or []} | {('dest', x) for x in TPL.get('availableDestinations') or []}
# BFS lặp: cổng mở dần theo SetSpeakerAvailability / SetDestinationAvailable ở node đi tới được; cha của mỗi node để dựng đường đi
while True:
    PARENT = {n: None for n, (w, g) in ENTRY.items() if g is None or g in OPEN}
    dq = deque(sorted(PARENT))
    while dq:
        n = dq.popleft()
        for j in INFO[n]['jumps']:
            if j not in PARENT:
                PARENT[j] = n
                dq.append(j)
    more = set(OPEN)
    for n in PARENT:
        for c in INFO[n]['cmds']:
            a = c.split()
            if len(a) > 2 and a[2].lower() == 'true':
                if a[0] == 'SetSpeakerAvailability':
                    more.add(('speaker', a[1]))
                elif a[0] == 'SetDestinationAvailable':
                    more.add(('dest', a[1]))
    if more == OPEN:
        break
    OPEN = more
REACH = set(PARENT)


def path_to(n):
    out = []
    while n is not None:
        out.append(n); n = PARENT[n]
    return out[::-1]

# ---------------------------------------------------------------- lưới nhiệm vụ: có hệ thống dựng không
SUPPORTED_COND = {'EmptyCondition', 'ItemCountCondition', 'AberrationCountCondition', 'CellCountOfItemTypeAndSubtypeCondition'}
QC_GRIDS = set(re.findall(r"(\w+): 1", (re.search(r"const GRIDS = \{([^}]*)\}", JS.get('js/questcmds.js', '')) or [None, ''])[1])) \
    if 'js/questcmds.js' in LOADED else set()


def grid_ok(g, from_poi):
    c = GRIDS.get(g)
    if not c:
        return False, 'không có QuestGridConfig ' + g
    if g in QC_GRIDS:
        return True, 'js/questcmds.js'
    if from_poi and c.get('isSaved') and c.get('questGridExitMode') == 'REVISITABLE':
        return True, 'js/poi.js (DRCargo quest)'
    conds = c.get('completeConditions') or []
    preset = (c.get('presetGrid') or {}).get('spatialItems') or []
    if c.get('presetGridMode') == 'CREATE' and preset and all(x['_t'] == 'EmptyCondition' for x in conds):
        return True, 'js/dialogue.js sgShow (nhận đồ)'
    bad = [x['_t'] for x in conds if x['_t'] not in SUPPORTED_COND]
    if bad:
        return False, 'lưới %s: điều kiện %s chưa có (js/dialogue.js sgShow)' % (g, ','.join(sorted(set(bad))))
    if not [x for x in conds if x['_t'] != 'EmptyCondition']:
        return False, 'lưới %s (%s, không điều kiện) không có hệ thống (js/dialogue.js sgShow "quest grid kind not built")' % (g, c.get('presetGridMode'))
    return True, 'js/dialogue.js sgShow (giao đồ)'

# ---------------------------------------------------------------- món kiếm được
def ent_ok(d):
    return (d.get('entitlementsRequired') or ['NONE']) == ['NONE']


ITEM_ARG_FNS = re.compile(r'ById|GetHasEverOwnedItem|GetHasSpaceForItem|GetCanAffordItemById')
SRC = {}    # item -> nguồn đầu tiên tìm thấy


def give(i, why):
    if i in ITEMS and i not in SRC:
        SRC[i] = why
        return True
    return False


for it in ((CFG['saveDataTemplate'].get('grids') or {}).get('INVENTORY') or {}).get('spatialItems', []):
    give(it['id'], 'túi đầu ván')
for sid, sh in W['ShopData'].items():
    for x in sh.get('alwaysInStock', []) or []:
        give(x['itemData'], 'cửa hàng ' + sid)
    for x in sh.get('dialogueLinkedStock', []) or []:
        pass
research_ok = 'js/research.js' in LOADED
RESEARCH = re.findall(r'"item":"([^"]+)"', json.dumps(RUI, separators=(',', ':')))
pool_subs = set()
for sh in W['ShopData'].values():
    for grp in sh.get('itemSubtypesFromResearchPool', []) or []:
        pool_subs.update(grp)
give('research-item', 'nạo vét (canBeReplacedWithResearchItem, js/spots.js)')
if 'js/questcmds.js' in LOADED:
    give('bait', 'MakeBait (js/questcmds.js)')
for p in POI.get('items', []) or []:
    give(p.get('item'), 'chai thư ' + p.get('id', ''))
aberr_on = 'js/progress.js' in LOADED and 'can-catch-aberrations' in JS.get('js/progress.js', '')
# ---- HarvestPOI có tới được bằng thuyền không (landmask.png, 1 px = 1 m): có ô nước cách tâm <= r + 1,5 m (POIInteractionListener,
# data/boat.js) mà 8 ô quanh nó cũng là nước (thuyền rộng ~2 m), nối liền biển khơi; dấu chân mảng đá nổ được (data/explosives.js fp) tính là nước.
def water_reach():
    import numpy as np
    from PIL import Image
    W0 = json.load(io.open(os.path.join(GAME, 'art/world/world.json'), encoding='utf-8'))['landmask']
    solid = np.asarray(Image.open(os.path.join(GAME, 'art/world', W0['file'])).convert('L')) > 127
    solid = solid.copy()
    for e in EXPL:
        for j, i, c in e.get('fp') or []:
            solid[j, i:i + c] = False
    wet = ~solid
    clear = wet.copy()
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            clear &= np.roll(np.roll(wet, dj, 0), di, 1)
    # biển nối liền: loang từ chỗ neo thuyền của Greater Marrow
    # hạt giống: nước mở ngoài Greater Marrow (điểm nạo vét relic1 [33] ở (-76, 53), cách bờ 14 m)
    sj, si = int((53 - W0['z0']) / W0['metresPerPixel']), int((-76 - W0['x0']) / W0['metresPerPixel'])
    seen = np.zeros_like(clear)
    q = deque([(sj, si)]) if clear[sj, si] else deque()
    H, Wd = clear.shape
    while q:
        j, i = q.popleft()
        if seen[j, i]:
            continue
        seen[j, i] = True
        for a, b in ((j + 1, i), (j - 1, i), (j, i + 1), (j, i - 1)):
            if 0 <= a < H and 0 <= b < Wd and clear[a, b] and not seen[a, b]:
                q.append((a, b))
    return seen, W0


SEA, LM = water_reach()


def reachable(x, z, r):
    R = r + 1.5
    j0, i0 = (z - LM['z0']) / LM['metresPerPixel'], (x - LM['x0']) / LM['metresPerPixel']
    if not (R < j0 < SEA.shape[0] - R and R < i0 < SEA.shape[1] - R):
        return True                                                       # ngoài mặt nạ = biển khơi, không có đất
    for j in range(int(j0 - R) - 1, int(j0 + R) + 2):
        for i in range(int(i0 - R) - 1, int(i0 + R) + 2):
            if 0 <= j < SEA.shape[0] and 0 <= i < SEA.shape[1] and SEA[j, i] and (j + 0.5 - j0) ** 2 + (i + 0.5 - i0) ** 2 <= R * R:
                return True
    return False


UNREACH = []
harv = []   # (item, harvestableType, where)
for m in MARKERS:
    if m.get('active') is False or m.get('root') in ('DLC1', 'DLC2'):
        continue
    if m['kind'] == 'harvestPOI':
        d = m.get('harvestPOIData') or {}
        rr = ((m.get('colliders') or [{}])[0].get('radius') or 2)
        if not reachable(m['pos'][0], m['pos'][2], rr):
            UNREACH.append((d.get('id'), d.get('items'), m['pos'][0], m['pos'][2]))
            continue
        for i in (d.get('items') or []) + (d.get('nightItems') or []):
            harv.append((i, (ITEMS.get(i) or {}).get('harvestableType'), 'HarvestPOI ' + m['name']))
    elif m['kind'] == 'harvestZone':
        for h in (m.get('fields', {}).get('HarvestZone', {}).get('harvestableItems') or []):
            harv.append((h.get('id'), (ITEMS.get(h.get('id')) or {}).get('harvestableType'), 'HarvestZone ' + m['name']))


def gear_types():
    t = set()
    for i in SRC:
        t.update(ITEMS[i].get('harvestableTypes') or [])
    return t


changed = True
while changed:
    changed = False
    if research_ok:
        for i in RESEARCH:
            d = ITEMS.get(i)
            if d and ent_ok(d) and d.get('subtype') in pool_subs:
                pre = [p.get('itemData') if isinstance(p, dict) else p for p in d.get('researchPrerequisites') or []]
                if all(p in SRC for p in pre if p in ITEMS and p not in RESEARCH) or True:
                    changed |= give(i, 'nghiên cứu (js/research.js) + cửa hàng')
    gt = gear_types()
    for i, ht, where in harv:
        if i in ITEMS and ht in gt:
            changed |= give(i, where)
    if aberr_on:
        for i in list(SRC):
            for a in ITEMS[i].get('aberrations') or []:
                changed |= give(a, 'cá dị dạng của ' + i + ' (js/progress.js)')
    for n in sorted(REACH):
        for c in INFO[n]['cmds']:
            a = c.split()
            if a[0] in ('AddItemById', 'AddItemToGrid') and len(a) > 1:
                changed |= give(a[1], 'Yarn ' + n)
            if a[0] == 'ShowQuestGrid' and len(a) > 1 and a[1] in GRIDS:
                g = GRIDS[a[1]]
                if g.get('presetGridMode') == 'CREATE' and grid_ok(a[1], True)[0]:
                    for it in (g.get('presetGrid') or {}).get('spatialItems', []):
                        changed |= give(it['id'], 'lưới ' + a[1] + ' (' + n + ')')

# ---------------------------------------------------------------- xét một đường Yarn
# stub không chặn tiến trình: thành tựu (AchievementManager.cs:98), hiệu ứng chân dung (PortraitVFXEnabler.cs:12), snapshot mixer, EndDemo (bản demo)
COSMETIC = {'SetAchievementState', 'TogglePortraitVFX', 'TransitionToAudioMixerSnapshot', 'EndDemo'}
POI_NODES = {p.get('node') for p in POI.get('points', [])}


def needs_of(n):
    """Món mà node tiêu: RemoveItemById..., điều kiện lưới. (Hàm ...ById chỉ là nhánh hỏi thăm: một node của Merchant hỏi cả 4 cá hiếm,
    nên không tính, để một món thiếu không chặn oan các bước khác.)"""
    need = set()
    for c in INFO[n]['cmds']:
        a = c.split()
        if a[0] in ('RemoveItemById', 'RemoveItemByIdInInventoryAndStorage', 'RemoveFishByIdAndCondition') and len(a) > 1 and a[1] in ITEMS:
            need.add(a[1])
        if a[0] == 'ShowQuestGrid' and len(a) > 1 and a[1] in GRIDS:
            for x in GRIDS[a[1]].get('completeConditions') or []:
                if x['_t'] == 'ItemCountCondition':
                    need.add(x['item'])
    return need


def check_path(n, extra=()):
    """-> (ok, lý do) cho node n; extra = món canh lệnh đích (GUARD)."""
    if n not in REACH:
        return False, 'node %s không đi tới được từ lối vào nào của bản web' % n
    why = []
    p = path_to(n)
    poi = p[0] in POI_NODES
    for x in p:
        for c in INFO[x]['cmds']:
            name = c.split()[0]
            if name not in CMDS:
                why.append('lệnh %s chưa đăng ký (%s)' % (name, x))
            elif CMDS[name][1] and name not in COSMETIC:
                why.append('lệnh %s là stub (%s, %s)' % (name, CMDS[name][0], x))
            if name == 'ShowQuestGrid':
                g = c.split()[1] if len(c.split()) > 1 else ''
                ok, w = grid_ok(g, poi)
                if not ok:
                    why.append(w + ' (' + x + ')')
        for f in INFO[x]['fns']:
            if f not in FNS:
                why.append('hàm %s chưa đăng ký (%s)' % (f, x))
            elif FNS[f][1]:
                why.append('hàm %s chỉ ghi "missing" (%s, %s)' % (f, FNS[f][0], x))
    for i in sorted(needs_of(n) | set(extra)):
        if i not in SRC:
            why.append('món %s không kiếm được' % i)
    return (not why), '; '.join(sorted(set(why)))


WEB_COND = set(re.findall(r"case '(\w+)':", (re.search(r"function cond\(c\)([\s\S]*?)\n  \}", JS.get('js/quests.js', '')) or [None, ''])[1]))


def check_conds(conds):
    why = []
    for c in conds or []:
        t = c['_t']
        if t not in WEB_COND:
            why.append('điều kiện %s chưa có (js/quests.js cond)' % t)
        it = c.get('itemId')
        if it and it not in SRC:
            why.append('món %s không kiếm được' % it)
    return (not why), '; '.join(why)

# ---------------------------------------------------------------- ai bắt đầu / ai xong
STARTERS, STEP_DONE, QUEST_DONE = {}, {}, {}
for n in sorted(NODES):
    for c in INFO[n]['cmds']:
        a = c.split()
        if len(a) < 2:
            continue
        if a[0] in ('SetQuestStarted', 'SetQuestStartedSilent', 'SetQuestAvailable'):
            STARTERS.setdefault(a[1], []).append(n)
        elif a[0] in ('SetQuestStepCompleted', 'SetQuestStepCompletedSilent'):
            STEP_DONE.setdefault(a[1], []).append(n)
        elif a[0] in ('SetQuestCompleted', 'SetQuestCompletedWithResolution'):
            QUEST_DONE.setdefault(a[1], []).append(n)
# món canh ngay trước lệnh: <<if GetHasEverOwnedItem("oarfish")>> <<SetQuestStepCompleted RareFishSub1_Catch>> → lệnh chỉ chạy khi có món
GUARD = {}
for n in NODES:
    ins = NODES[n]['i']
    for k, x in enumerate(ins):
        if x[0] != OP['RunCommand'] or k < 4 or ins[k - 1][0] != OP['JumpIfFalse'] or ins[k - 2][0] != OP['CallFunc']:
            continue
        if ITEM_ARG_FNS.search(ins[k - 2][1]) and ins[k - 4][0] == OP['PushString'] and ins[k - 4][1] in ITEMS:
            a = x[1].split()
            if len(a) > 1:
                GUARD.setdefault((n, a[1]), set()).add(ins[k - 4][1])
# MortarQuestStepAnimatorTriggerable.cs:23: completeThisStepOnAnimationComplete của 3 bẫy = SoldierSubMonster{n}_Wait (tools/mindsucker.py đọc từ Game.unity)
CS_STEP = {'SoldierSubMonster1_Wait', 'SoldierSubMonster2_Wait', 'SoldierSubMonster3_Wait'}
MORTAR = {}
if 'js/mindsucker.js' in LOADED and 'DRQuests.completeStep(t.d.completeStep)' in JS['js/mindsucker.js']:
    for sid in set(re.findall(r'"completeStep":"(\w+)"', io.open(os.path.join(GAME, 'data/mindsucker.js'), encoding='utf-8').read())):
        MORTAR[sid] = 'js/mindsucker.js:%d' % line_of('js/mindsucker.js', JS['js/mindsucker.js'].index('DRQuests.completeStep(t.d.completeStep)'))


def best(nodes, key=None):
    """Đường tốt nhất trong nhiều node: OK đầu tiên, không thì lý do của node đầu. key = id bước/nhiệm vụ (món canh lệnh)."""
    res = [(n,) + check_path(n, GUARD.get((n, key), ())) for n in nodes]
    for r in res:
        if r[1]:
            return True, r[0], ''
    return False, res[0][0] if res else '', res[0][2] if res else 'không có node'


rows = []
for qid in BASE:
    q = QUESTS[qid]
    st = STARTERS.get(qid, [])
    if st:
        sok, snode, swhy = best(st, qid)
        sdesc = 'Yarn ' + snode
    elif q.get('canBeOfferedAutomatically'):
        sok, swhy = check_conds(q.get('offerConditions'))
        sdesc = 'tự mời: ' + ','.join(c['_t'] for c in q.get('offerConditions') or [])
    else:
        sok, swhy, sdesc = False, 'không có gì bắt đầu nhiệm vụ', '-'
    steps = ([q['onOfferedQuestStep']] if q.get('onOfferedQuestStep') else []) + list(q['steps'])
    for i, sid in enumerate(steps):
        s = STEPS.get(sid, {})
        how, ok, why = [], False, []
        if sid in STEP_DONE:
            o, n, w = best(STEP_DONE[sid], sid)
            how.append('Yarn ' + n)
            ok |= o
            if not o: why.append(w)
        if s.get('allowAutomaticCompletion') and s.get('completeConditions'):
            o, w = check_conds(s['completeConditions'])
            how.append('tự xong: ' + ','.join('%s(%s)' % (c['_t'], c.get('itemId') or c.get('quest') or '') for c in s['completeConditions']))
            ok |= o
            if not o: why.append(w)
        if sid in CS_STEP:
            how.append('C# MortarQuestStepAnimatorTriggerable.cs:23')
            if sid in MORTAR:
                ok = True
            else:
                why.append('không tệp js nào gọi completeStep(%s)' % sid)
        if not how and sid == q.get('onOfferedQuestStep'):
            how.append('thay bằng bước đầu khi StartQuest (QuestManager.StartQuest)')
            ok = True
        if not how and i == len(steps) - 1 and qid in QUEST_DONE:
            o, n, w = best(QUEST_DONE[qid])
            how.append('SetQuestCompleted ở ' + n)
            ok |= o
            if not o: why.append(w)
        if not how:
            why.append('bản gốc không có gì hoàn thành bước này')
        if not sok:
            why.insert(0, 'nhiệm vụ không bắt đầu được: ' + swhy)
        rows.append((qid, sid, sdesc, ' / '.join(how) or '-', 'OK' if (ok and sok) else 'BLOCKED', '; '.join(w for w in why if w) if not (ok and sok) else ''))

# ---------------------------------------------------------------- lan truyền: bước sau bước bị chặn, điều kiện OtherQuest trỏ tới nhiệm vụ bị chặn
changed = True
while changed:
    changed = False
    bq = {r[0] for r in rows if r[4] == 'BLOCKED'}
    prev = {}
    for k, r in enumerate(rows):
        q, sid = r[0], r[1]
        if r[4] == 'OK':
            why = None
            if prev.get(q):
                why = 'bước trước %s bị chặn' % prev[q]
            else:
                oq = [c.get('quest') for c in (STEPS.get(sid, {}).get('completeConditions') or []) if c['_t'] == 'OtherQuestCondition']
                bad = [x for x in oq if x in bq and x != q]
                if bad and sid not in STEP_DONE:
                    why = 'chờ nhiệm vụ bị chặn ' + ','.join(bad)
            if why:
                rows[k] = r[:4] + ('BLOCKED', why)
                changed = True
        if rows[k][4] == 'BLOCKED':
            prev.setdefault(q, sid)

# ---------------------------------------------------------------- cảnh kết (không phải bước nhiệm vụ): Finale_Root -> Finale_Bad*/Finale_Good
# biến bool cốt truyện có ai đặt không: Yarn SetBoolVariable, js (vars['x'] = / vars.x =), WorldStateChanger (data/worldstate.js + js/worldstate.js)
def bool_setters(name):
    out = ['Yarn ' + n for n in NODES for c in INFO[n]['cmds'] if c.split()[:2] == ['SetBoolVariable', name]]
    for path in sorted(LOADED):
        if re.search(r"vars\[['\"]" + re.escape(name) + r"['\"]\]\s*=[^=]", JS.get(path, '')):
            out.append(path)
    ws = os.path.join(GAME, 'data', 'worldstate.js')
    if 'js/worldstate.js' in LOADED and os.path.exists(ws) and ('"' + name + '",true') in io.open(ws, encoding='utf-8').read():
        out.append('js/worldstate.js (WorldStateChanger)')
    return out


# điều kiện trước của kết tốt (không phải bước nhiệm vụ): OldMayor_Intro chỉ chạy khi "old-mayor-available" (OldMayorDock_N_Root,
# WorldStateChangerConfig OldMayorDockEnabler sau Collector_Award4Atrophy) → LighthouseKeeper_BookAsk (cần OldMayor_Intro) → Collector_Book1..5 →
# Collector_Revealed → LighthouseKeeper_BookHave → LighthouseKeeper_FinaleOptions → LighthouseKeeper_FinaleAccepted
PRE = {'Finale_Good': [('OldMayor_Intro', 'old-mayor-available'), ('LighthouseKeeper_BookAsk', None), ('Collector_Revealed', None)]}
for n, start in (('Finale_BadRegular', 'Collector_PickupAccept'), ('Finale_BadRevealed', 'Collector_PickupAccept'), ('Finale_Good', 'LighthouseKeeper_FinaleAccepted')):
    o1, w1 = check_path(start)
    o2, w2 = check_path(n)
    ws = [w for w in (w1, w2) if w]
    for pn, var in PRE.get(n, []):
        o, w = check_path(pn)
        if not o:
            ws.append(w)
        if var and not bool_setters(var):
            ws.append('%s cần biến "%s" mà không ai đặt (gốc: WorldStateChangerConfig OldMayorDockEnabler, BooleanSetWorldStateAction.cs:9)' % (pn, var))
    rows.append(('(cảnh kết)', n, 'Yarn ' + start, 'POI Finale_Root -> ' + ' > '.join(path_to(n)) if n in REACH else '-',
                 'BLOCKED' if ws else 'OK', '; '.join(ws)))

# ---------------------------------------------------------------- ghi
okn = sum(1 for r in rows if r[4] == 'OK')
bad = len(rows) - okn
md = io.StringIO()
md.write('# PROGRESS-AUDIT: bước nhiệm vụ của bản gốc trên bản web\n\n')
md.write('Sinh bởi `games/dredge/tools/progress_audit.py` (chạy lại được; đừng sửa tay). Quy tắc xét ở đầu tệp đó.\n\n')
md.write('- Nhiệm vụ gốc (bỏ DLC): %d, bước: %d. **OK %d / BLOCKED %d.**\n' % (len(BASE), len(rows), okn, bad))
md.write('- Node đi tới được: %d / %d (lối vào: %d). Lệnh Yarn còn stub: %s.\n' % (len(REACH), len(NODES), len(ENTRY),
         ', '.join(sorted(k for k, v in CMDS.items() if v[1])) or 'không'))
md.write('- HarvestPOI gốc (bỏ DLC) thuyền web không tới được (landmask.png): %d — %s.\n' % (len(UNREACH), ', '.join('%s %s (%.0f, %.0f)' % (u[0], '/'.join(u[1] or []), u[2], u[3]) for u in UNREACH)))
md.write('- Cá dị dạng bật bởi js/progress.js: %s. Cửa sổ nghiên cứu: %s.\n\n' % ('có' if aberr_on else 'không', 'có' if research_ok else 'không'))
md.write('| Nhiệm vụ | Bước | Bắt đầu (gốc) | Hoàn thành (gốc) | Web | Lý do |\n|---|---|---|---|---|---|\n')
for r in rows:
    md.write('| %s |\n' % ' | '.join(x.replace('|', '/') for x in r))
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(md.getvalue())
print('quests %d steps %d OK %d BLOCKED %d -> %s' % (len(BASE), len(rows), okn, bad, OUT))
for r in rows:
    if r[4] != 'OK':
        print('  BLOCKED', r[1], '—', r[5][:300])
for _i in filter(None, os.environ.get('PA_WHY', '').split(',')):   # PA_WHY=oarfish: in nguồn của món
    print('  nguồn', _i, '=', SRC.get(_i))
