"""Vòi rồng (WaterspoutWorldEvent, MONSTERS.md §2.9) -> data/waterspout.js. Đơn vị U8.

Chạy:  python -I games/dredge/tools/waterspout.py
Đọc:   Assets/GameObject/Waterspout.prefab + Waterspout_Corrupt.prefab: bộ chỉnh WaterspoutWorldEvent (script guid fb73c99f...), NavMeshAgent,
       SphereCollider của nút "Collider" (PlayerDetector, trigger), AudioSource; Assets/Data/SpatialItemData/Fish/*.asset (tên các vật trong itemPool).
Ra:    window.DR_WATERSPOUT = { Waterspout: {...}, Waterspout_Corrupt: {...} }
Bẫy: tỉ lệ cả chuỗi Transform từ nút Collider lên gốc đều = 1 nên bán kính chạm = m_Radius 0,5 m thế giới. Hạt/âm thanh đã có ở data/particles.js
     (S2: Waterspout, Waterspout_Corrupt, WaterspoutImpactfx) và data/audio.js; không lặp lại ở đây. Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'waterspout.js')
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
MODES = {0: 'STATIC', 1: 'MOVING', 2: 'CHASING'}


def docs(path):
    parts = HDR.split(io.open(path, encoding='utf-8').read())
    return {int(parts[i + 1]): (int(parts[i]), parts[i + 2]) for i in range(1, len(parts), 3)}


def f(body, key):
    m = re.search(r'^\s*%s: (.+)$' % re.escape(key), body, re.M)
    return m.group(1).strip() if m else None


def fid(body, key):
    m = re.search(r'^\s*%s: \{fileID: (-?\d+)' % re.escape(key), body, re.M)
    return int(m.group(1)) if m else None


def item_name(guid):
    d = os.path.join(ASSETS, 'Data', 'SpatialItemData', 'Fish')
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.asset.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as fh:
                if 'guid: ' + guid in fh.read(200):
                    return fn[:-11]
    raise SystemExit('không thấy vật guid ' + guid)


def web_id(name):
    """Tên tệp gốc -> id vật của web (data/items.js): 'Blue Mackerel' -> mackerel, 'Cod Aberration 2' -> cod-ab-2."""
    if name == 'Blue Mackerel':
        return 'mackerel'
    return re.sub(r'-aberration-', '-ab-', name.lower().replace(' ', '-'))


def one(fn):
    objs = docs(os.path.join(ASSETS, 'GameObject', fn))
    mb = [b for k, b in objs.values() if k == 114 and 'waterspoutMode:' in b][0]
    # SphereCollider (135) của nút Collider + chuỗi tỉ lệ Transform lên gốc
    sph = [(k, b) for k, b in objs.values() if k == 135][0][1]
    go = fid(sph, 'm_GameObject')
    tfid = {key: b for key, (k, b) in objs.items() if k == 4}   # tỉ lệ Transform: tích từ nút Collider lên gốc
    cur = [b for b in tfid.values() if fid(b, 'm_GameObject') == go][0]
    world = 1.0
    while True:
        sx = [float(v) for v in re.search(r'm_LocalScale: \{x: ([-\d.e]+), y: ([-\d.e]+), z: ([-\d.e]+)', cur).groups()]
        assert sx[0] == sx[1] == sx[2], 'tỉ lệ không đều'
        world *= sx[0]
        fa = fid(cur, 'm_Father')
        if not fa:
            break
        cur = tfid[fa]
    # finishDelaySec (Activate): max ps.main.startLifetime.constantMax của particleSystems; minMaxState 0 = hằng (scalar), 3 = hai hằng (scalar là cận trên)
    psids = [int(x) for x in re.findall(r'^  - \{fileID: (\d+)\}', mb.split('particleSystems:')[1].split('collisionSFXAsset')[0], re.M)]
    life = 0.0
    for i in psids:
        sl = objs[i][1].split('startLifetime:')[1]
        assert int(re.search(r'minMaxState: (\d)', sl).group(1)) in (0, 3), 'startLifetime dạng đường cong'
        life = max(life, float(re.search(r'scalar: ([\d.e-]+)', sl).group(1)))
    ag = [b for k, b in objs.values() if k == 195][0]
    au = [b for k, b in objs.values() if k == 82][0]
    pool = []
    for m in re.finditer(r'^\s+- \{fileID: 11400000, guid: ([0-9a-f]{32}), type: 2\}', mb.split('itemPool:')[1].split('playerCollider:')[0], re.M):
        pool.append(web_id(item_name(m.group(1))))
    assert int(f(sph, 'm_IsTrigger')) == 1
    return {
        'mode': MODES[int(f(mb, 'waterspoutMode'))],
        'moveSpeedScalar': float(f(mb, 'moveSpeedScalar')),
        'moveSpeedProportionalToPlayer': float(f(mb, 'moveSpeedProportionalToPlayer')),
        'accelerationFactor': float(f(mb, 'accelerationFactor')),
        'maxSpeed': float(f(mb, 'maxSpeed')),
        'repathToPlayerInterval': float(f(mb, 'repathToPlayerInterval')),
        'capSpeedWhenHarvesting': int(f(mb, 'capSpeedWhenHarvesting')) == 1,
        'maxTravelDistance': float(f(mb, 'maxTravelDistance')),
        'itemAddChance': float(f(mb, 'itemAddChance')),
        'itemPool': pool,
        'forbiddenSpawnLayers': int(re.search(r'm_Bits: (\d+)', mb).group(1)),
        'finishDelaySec': life,
        'hitRadius': float(f(sph, 'm_Radius')) * world,
        'hitCenter': [float(v) for v in re.search(r'm_Center: \{x: ([-\d.e]+), y: ([-\d.e]+), z: ([-\d.e]+)', sph).groups()],
        'agent': {'radius': float(f(ag, 'm_Radius')), 'speed': float(f(ag, 'm_Speed')), 'acceleration': float(f(ag, 'm_Acceleration')),
                  'angularSpeed': float(f(ag, 'm_AngularSpeed')), 'autoBraking': int(f(ag, 'm_AutoBraking')) == 1},
        'audio': {'min': float(f(au, 'MinDistance')), 'max': float(f(au, 'MaxDistance'))},
    }


def main():
    data = {'src': 'GameObject/Waterspout.prefab + Waterspout_Corrupt.prefab (WaterspoutWorldEvent.cs)',
            'Waterspout': one('Waterspout.prefab'), 'Waterspout_Corrupt': one('Waterspout_Corrupt.prefab'), 'Waterspout_Static': one('Waterspout_Static.prefab'),   # R6: chế độ STATIC (Gale Cliffs); hạt/tiếng y hệt Waterspout (so prefab: chỉ khác hitVibration, itemPool, chế độ, tốc độ 0)
            
            'strikeRolloff': [50.0, 100.0]}   # PlaySFX(collisionSFX, ..., Linear, 50, 100) trong OnPlayerHit
    js = '// Generated by games/dredge/tools/waterspout.py from Waterspout*.prefab. Do not edit.\nwindow.DR_WATERSPOUT = ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    for k in ('Waterspout', 'Waterspout_Corrupt', 'Waterspout_Static'):
        d = data[k]
        print(k, d['mode'], 'speed', d['moveSpeedScalar'], d['moveSpeedProportionalToPlayer'], 'max', d['maxSpeed'], 'pool', d['itemPool'], 'hit r', d['hitRadius'])


if __name__ == '__main__':
    main()
