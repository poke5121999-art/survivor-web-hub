"""Miasma (FogDevil, MONSTERS.md §2.2) -> data/miasma.js.

Chạy:  python -I games/dredge/tools/miasma.py
Đọc:   Scenes/Game.unity: 2 GameObject "FogDevil" / "FogDevil (1)" dưới FogDevilContainer (Transform, MonoBehaviour FogDevil, con SanityModifier,
       AudioSource), Material/FogDevilParticle_Mat_0.mat (_NeutralAmount khởi đầu). Hạt (Particles / AggroParticles) đã nằm trong data/particles.js
       (tools/particles.py: FogDevilParticles, FogDevilAggroParticles), tệp này chỉ ghi số của script + vị trí + âm lượng.
Ra:    window.DR_MIASMA = { instances[{name,x,z,phase,...}], idleColor, chaseColor, sanity{...}, audio{...}, neutral{...} }
Toạ độ: three.js (z đổi dấu so với Unity), như data/safezones.js. Màu giữ nguyên số trong tệp (không đổi gamma).
Bẫy:   SanityModifier.cs lưu fullValueNight / partialValueMinNight...; tâm khối là vị trí của con (0,0,0 so với FogDevil). Đèn đổi _NeutralAmount của
       CHUNG một vật liệu (cả hai FogDevil dùng 2a95758e...), nên trạng thái giận là một cho cả hai.
Rerunnable: cùng đầu vào ra cùng đầu ra (làm tròn 5 chữ số, sắp theo tên).
"""
import io, os, re, json, sys
import yaml

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
SCENE = os.path.join(ASSETS, 'Scenes', 'Game.unity')
MAT = os.path.join(ASSETS, 'Material', 'FogDevilParticle_Mat_0.mat')
OUT = os.path.join(GAME, 'data', 'miasma.js')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)


def rnd(v, n=5):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, dict):
        return {k: rnd(x, n) for k, x in v.items()}
    if isinstance(v, float):
        r = round(v, n)
        return 0.0 if r == 0 else r
    return v


def load_docs(txt):
    ms = list(HDR.finditer(txt))
    docs = {}
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
        docs[int(m.group(2))] = (int(m.group(1)), txt[m.end():end])
    return docs


def body(docs, fid):
    t, txt = docs[fid]
    d = yaml.load(txt, Loader=CL)
    return list(d.values())[0]


def col(c):
    return [float(c['r']), float(c['g']), float(c['b']), float(c['a'])]


def main():
    txt = io.open(SCENE, encoding='utf-8').read()
    docs = load_docs(txt)
    # GameObject theo tên -> thành phần
    gos = {}
    for fid, (t, tx) in docs.items():
        if t == 1 and re.search(r'm_Name: FogDevil( \(1\))?\n', tx):
            g = body(docs, fid)
            gos[g['m_Name']] = g
    inst = []
    for name in sorted(gos):
        g = gos[name]
        tr = fd = None
        for c in g['m_Component']:
            fid = c['component']['fileID']
            t = docs[fid][0]
            if t == 4:
                tr = body(docs, fid)
            elif t == 114 and 'sanityMod:' in docs[fid][1]:
                fd = body(docs, fid)
        p = tr['m_LocalPosition']
        # SanityModifier con + AudioSource nằm ở GameObject do script tham chiếu
        sm_go = body(docs, fd['sanityMod']['fileID'])
        sm = None
        for c in sm_go['m_Component']:
            fid = c['component']['fileID']
            if docs[fid][0] == 114:
                sm = body(docs, fid)
        au = body(docs, fd['audioSource']['fileID'])
        inst.append({
            'name': name,
            'x': float(p['x']), 'z': -float(p['z']),          # three.js: z đổi dấu
            'phase': int(fd['worldPhaseForThisToSpawn']),
            'speed': float(fd['speed']), 'chaseDistance': float(fd['chaseDistance']),
            'spawnDistance': float(fd['spawnDistance']), 'spawnDistanceRandomOffset': float(fd['spawnDistanceRandomOffset']),
            'spawnArcRadius': float(fd['spawnArcRadius']),
            'appearTime': float(fd['appearTime']), 'disappearTime': float(fd['disappearTime']),
            'audioVolume': float(fd['audioVolume']), 'minimumDepthSpawn': float(fd['minimumDepthSpawn']),
            'retrySec': float(fd['timeBetweenSpawnAttemptsSec']),
            'idleColor': col(fd['idleColor']), 'chaseColor': col(fd['chaseColor']),
            'sanity': {k: float(sm[k]) for k in ('fullValueDay', 'fullValueNight', 'fullValueRadius', 'partialValueMinDay', 'partialValueMinNight', 'partialValueRadius')},
            'audio': {'volume': float(au['m_Volume']), 'loop': bool(au['Loop']), 'min': float(au['MinDistance']), 'max': float(au['MaxDistance'])},
        })
    mat = list(yaml.load(open(MAT, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    fl = {}
    m_f = mat['m_SavedProperties']['m_Floats']
    for e in (m_f if isinstance(m_f, list) else [m_f]):
        for k, v in e.items():
            fl[k] = float(v)
    out = {
        'src': 'Scenes/Game.unity:FogDevilContainer/FogDevil{,(1)}; FogDevil.cs',
        'instances': inst,
        'neutral': {'start': fl.get('_NeutralAmount', 0.0), 'aggroSec': 0.1, 'calmSec': 1.0},   # FogDevil.cs:136,147 DOFloat(0,0.1) / DOFloat(1,1)
        'chase': {'maxParticles': 5, 'lifetimeMul': 0.1, 'noiseK': 3.0},                         # FogDevil.cs:219-226
        'idle': {'maxParticles': 2, 'lifetimeMul': 1.0, 'noise': 0.0, 'homeSpeed': 2.0},         # FogDevil.cs:237-244
        'aggroEmit': {'main': 3, 'aggro': 15},                                                   # FogDevil.cs:129-130
    }
    out = rnd(out)
    js = '// Sinh bởi tools/miasma.py (U3 miasma: FogDevil, MONSTERS.md §2.2). Không sửa tay.\nwindow.DR_MIASMA = ' + json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + ';\n'
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('ghi', OUT, len(js), 'byte;', len(inst), 'FogDevil')


if __name__ == '__main__':
    main()
