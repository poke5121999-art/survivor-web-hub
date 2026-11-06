# -*- coding: utf-8 -*-
"""Bóc chỗ đặt cá gốc của 16 zone Hố Xanh thành games/ho-xanh/data/fish_spawn.js.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip_fishgroups.py

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json). Chạy ~25 giây, chỉ nạp
bundle scene, bundle IGPSet và bundle prefab cá được trỏ tới (không nạp phụ thuộc hình).

Cá thường của mỗi zone KHÔNG nằm trong scene [ĐO 2026-09-25]:
- Scene có IGPSetController (GameObject <scene>_IGPSetController, gốc 0,0). IGPSetInfoList liệt kê
  các prefab addressable IGPSet/PreSet/IGPSet_<map>_<Day|Night>_F00_N00_<n>, mỗi cái một Rate và
  điều kiện IGPSetConditionList. Lúc vào scene game bốc MỘT preset (GetRandomIGPSetInfo).
- Điều kiện: type 1 = Day_Min (giá trị enum IGPSetConditionType đọc từ global-metadata.dat:
  Day_Min=1, SNSGrade_Min=2). Preset Rate 0 chỉ bật theo nhiệm vụ (ActiveMissionTaskID) nên bỏ.
- Trong preset, cây InGamePlacementSet_Origin_<map>_F00 (có FishGroupController) chứa các
  FishAllocator đặt tay. Mỗi allocator: FishPrefabOrGroup (instanceType 0) hoặc FishPrefabOrGroups
  có trọng số (instanceType 1 = RandomSelect), trỏ tới prefab Boid_SA_<TID>_<Tên>_<n> (gốc + n con
  SA_<TID>_<Tên>) hoặc thẳng SA_<TID>_<Tên>. AreaMode 1 = WayPoint (bơi giữa các FishWayPoint, bán
  kính _Range), 0 = Bound (_limitBoundary). spawnCheckDistance: Dave lại gần chừng này mới sinh.
- FishGroup_<vùng>_<n>_NEW trong scene chỉ còn cá nhiệm vụ FishMon (TID 2011xxx), vẫn ghi vào `base`.
- A05 là scene cũ: không có IGPSetController, allocator nằm thẳng trong scene -> `base`.

Bẫy đã sập (bản trước, tools/spawn_data.py đã xoá): tìm FishGroupController, thấy rỗng, kết luận
"bản gốc không có danh sách loài theo bản đồ" rồi lấy wiki bù. Danh sách thật nằm ở IGPSet.
"""
import io, json, os, re, sys

import UnityPy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import level as L  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'data', 'fish_spawn.js')
PRESET = 'Assets/Contents/PlayContents/Ingame/00_InGame_Common/Prefabs/IGPSet/PreSet/'
DAY_MIN = 1  # IGPSetConditionType.Day_Min
NEAR = 20  # spawnCheckDistance mặc định; allocator khác số này mới ghi 'near'
NAME = re.compile(r'^SA_\d+_|\s*\(\d+\)$')


def assets_by_tid():
    src = open(os.path.join(GAME, 'data', 'assets.js'), encoding='utf-8').read()
    return {int(t): i for t, i in re.findall(r'"tid":\s*(\d+),\s*"id":\s*"([^"]+)"', src)}


_ENV = {}


def env_of(bundle):
    if bundle not in _ENV:
        e = UnityPy.load(os.path.join(L.BUNDLES, bundle))
        objs, ctr = {}, {}
        for o in e.objects:
            objs[o.path_id] = o
            if o.type.name == 'AssetBundle':
                for k, info in o.read().m_Container:
                    ctr[info.asset.m_PathID] = k
        _ENV[bundle] = (e, objs, ctr)
    return _ENV[bundle]


_TT = {}


def tt_of(o):
    k = (o.assets_file.name, o.path_id)
    if k not in _TT:
        try:
            _TT[k] = o.read_typetree()
        except Exception:
            _TT[k] = {}
    return _TT[k]


def mbs(go):
    return [tt_of(c.component.deref()) for c in go.m_Component if c.component.type.name == 'MonoBehaviour']


def children(go):
    return [ch.read().m_GameObject.read() for ch in L.transform_of(go).m_Children]


def r2(v):
    return round(float(v), 2)


# ---------------------------------------------------------------- prefab cá được trỏ tới
def fish_tid(go):
    """FishDataTID của SABaseFishSystem trên thân cá; tên con không tin được (Boid tuna: SA_0000_Tuna)."""
    for t in mbs(go):
        if t.get('FishDataTID'):
            return t['FishDataTID']
    return 0


PREFABS = {}   # tên gốc -> {path, fish: [[tid, dx, dy], ...]}
SPECIES = {}   # tid -> tên gốc (thư mục/prefab)


def fish_prefab(assets_file, ptr):
    """PPtr FishPrefabOrGroup -> tên gốc prefab (khoá của PREFABS)."""
    if not ptr['m_FileID'] and not ptr['m_PathID']:
        return None
    cab = assets_file.externals[ptr['m_FileID'] - 1].path.split('/')[-1].lower()
    bundle = L.CABS.get(cab)
    if not bundle:
        raise SystemExit('không thấy bundle của %s' % cab)
    _, objs, ctr = env_of(bundle)
    root = objs[ptr['m_PathID']].read()
    name = root.m_Name
    if name in PREFABS:
        return name
    cache, fish = {}, []
    m0 = L.world(L.transform_of(root), cache)
    body = [root] if fish_tid(root) else [c for c in children(root) if c.m_IsActive and fish_tid(c)]
    for c in body:
        tid = fish_tid(c)
        SPECIES.setdefault(tid, NAME.sub('', c.m_Name))
        p = L.world(L.transform_of(c), cache)[:2, 3] - m0[:2, 3]
        fish.append([tid, r2(p[0]), r2(p[1])])
    if not fish:
        print('   ! prefab %s không có con SA_<TID>_ nào' % name, flush=True)
    PREFABS[name] = {'path': ctr.get(ptr['m_PathID']), 'fish': fish}
    return name


# ---------------------------------------------------------------- allocator
def allocator(go, tt, assets_file, cache, off):
    """off: tên GameObject tắt gần gốc nhất trên đường tới allocator (công tắc nhiệm vụ/sự kiện), None nếu bật."""
    pos = L.world(L.transform_of(go), cache)[:2, 3]
    if tt['instanceType'] == 1 and tt['FishPrefabOrGroups']['list']:
        pick = [[it['weight'], fish_prefab(assets_file, it['data'])] for it in tt['FishPrefabOrGroups']['list']]
    else:
        pick = [[1, fish_prefab(assets_file, tt['FishPrefabOrGroup'])]]
    pick = [p for p in pick if p[1]]
    wps = []
    for ptr in tt['_WayPoints']:
        if not ptr['m_PathID']:
            continue
        wo = assets_file.objects[ptr['m_PathID']]
        wt = tt_of(wo)
        wgo = wo.read().m_GameObject.read()
        p = L.world(L.transform_of(wgo), cache)[:2, 3]
        d = wt['offSet'] if wt.get('hasOffSet') else {'x': 0, 'y': 0}
        wps.append([r2(p[0] + d['x']), r2(p[1] + d['y']), r2(wt['_Range'])])
    b = tt['_limitBoundary']
    row = {'x': r2(pos[0]), 'y': r2(pos[1]), 'p': pick_index(pick)}
    if tt['AreaMode'] == 1:
        row['w'] = wps
    else:
        # Bound: hộp quanh allocator (m_Center tính từ vị trí allocator), nửa cạnh m_Extent
        row['b'] = [r2(b['m_Center']['x']), r2(b['m_Center']['y']), r2(b['m_Extent']['x']), r2(b['m_Extent']['y'])]
    if tt['spawnCheckDistance'] != NEAR:
        row['near'] = r2(tt['spawnCheckDistance'])
    if tt['_overwriteFishDataTID']:
        row['tid'] = tt['_overwriteFishDataTID']
    if off:
        row['off'] = off
    return row


PICKS, _PICK_KEY = [], {}


def pick_index(pick):
    k = json.dumps(pick)
    if k not in _PICK_KEY:
        _PICK_KEY[k] = len(PICKS)
        PICKS.append(pick)
    return _PICK_KEY[k]


def collect(root, assets_file):
    """Mọi FishAllocator trong cây root, kể cả bị tắt. Không đi vào con của allocator."""
    out, cache, stack = [], {}, [(root, None)]
    while stack:
        go, off = stack.pop()
        off = off or (None if go.m_IsActive else go.m_Name)
        al = [t for t in mbs(go) if 'FishPrefabOrGroup' in t]
        if al:
            out.append(allocator(go, al[0], assets_file, cache, off))
            continue
        stack.extend((c, off) for c in reversed(children(go)))
    return out


def first_off(go):
    off = None
    while go is not None:
        if not go.m_IsActive:
            off = go.m_Name
        go = L.parent_go(go)
    return off


def scene_allocators(scene):
    e, objs, _ = env_of(L.PATHS[L.DR + scene + '.unity'])
    ctrl, roots = None, []
    for o in objs.values():
        if o.type.name != 'MonoBehaviour':
            continue
        t = tt_of(o)
        if 'IGPSetInfoList' in t:
            ctrl = (o, t)
        elif 'FishPrefabOrGroup' in t:
            roots.append(o)
    base, cache = [], {}
    for o in roots:
        go = o.read().m_GameObject.read()
        base.append(allocator(go, tt_of(o), o.assets_file, cache, first_off(go)))
    base.sort(key=lambda a: (a['x'], a['y']))
    return ctrl, base


def preset(name):
    path = PRESET + name + '.prefab'
    e, _, _ = env_of(L.PATHS[path])
    root = L.prefab_root(e, path)
    af = L.transform_of(root).assets_file
    return collect(root, af)


def species_prefab(tid):
    hits = sorted((k for k in L.PATHS if re.search(r'/SA_%d_[^/]*\.prefab$' % tid, k)), key=len)
    return hits[0] if hits else None


def main():
    by_tid = assets_by_tid()
    zones = {}
    for zid, scene in L.ZONES.items():
        ctrl, base = scene_allocators(scene)
        z = {'base': base, 'presets': []}
        if ctrl:
            o, t = ctrl
            go = o.read().m_GameObject.read()
            org = L.world(L.transform_of(go), {})[:2, 3]
            if abs(org[0]) + abs(org[1]) > 1e-3:
                raise SystemExit('%s: IGPSetController không ở gốc toạ độ %s' % (zid, org))
            for info in t['IGPSetInfoList']:
                if info['Rate'] <= 0:
                    continue
                conds = info['IGPSetConditionList']
                other = [c for c in conds if c['type'] != DAY_MIN]
                if other:
                    print('   ! %s %s có điều kiện lạ %s, bỏ qua điều kiện đó' % (zid, info['prefabName'], other))
                day = max([int(c['value']) for c in conds if c['type'] == DAY_MIN] or [0])
                pr = {'name': info['prefabName'], 'rate': info['Rate'], 'day': day, 'allocs': preset(info['prefabName'])}
                if info['ActiveMissionTaskID']:
                    pr['mission'] = info['ActiveMissionTaskID']
                z['presets'].append(pr)
        zones[zid] = z
        rows = base + [a for p in z['presets'] for a in p['allocs']]
        print('%s: %d preset (ngày %s), %d allocator, %d tắt, base %d' % (
            zid, len(z['presets']), [p['day'] for p in z['presets']], len(rows),
            sum(1 for a in rows if a.get('off')), len(base)), flush=True)

    bad = {a['tid'] for z in zones.values() for a in z['base'] + [a for p in z['presets'] for a in p['allocs']]
           if a.get('tid') and a['tid'] not in SPECIES}
    if bad:
        raise SystemExit('_overwriteFishDataTID trỏ tới loài không có prefab nào: %s' % sorted(bad))
    species = {}
    for tid, name in sorted(SPECIES.items()):
        s = {'name': name}
        if tid in by_tid:
            s['id'] = by_tid[tid]
        else:
            # không có Spine 2D trong assets.js: cá mập 3D (js/shark.js) hoặc loài game web chưa có
            s['prefab'] = species_prefab(tid)
            if re.search('shark|mako', name, re.I):
                s['shark'] = 1
        species[str(tid)] = s
    data = {'near': NEAR, 'species': species, 'prefabs': dict(sorted(PREFABS.items())), 'picks': PICKS, 'zones': zones}
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/rip_fishgroups.py — đừng sửa tay. Chỗ đặt cá gốc (IGPSet + FishAllocator) của từng zone,\n'
                 '// toạ độ scene giống data/zones.js. Cấu trúc: tools/README.md, mục "Cá đặt ở đâu".\n'
                 'window.HX_FISH_SPAWN = ')
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    print('ghi %s (%d KB), %d loài, %d prefab, %d bộ chọn' % (
        OUT, os.path.getsize(OUT) // 1024, len(species), len(PREFABS), len(PICKS)), flush=True)


if __name__ == '__main__':
    main()
    # UnityPy hay vỡ lúc Python dọn dẹp (Fatal Python error: deallocating None); dữ liệu đã ghi xong
    os._exit(0)
