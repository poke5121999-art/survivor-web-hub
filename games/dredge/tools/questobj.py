"""Vật thể cốt truyện của W5 (máy Xua đuổi ở Bến Nghiên cứu, ngọn lửa bàn thờ Gai Quỷ) -> data/questobj.js + audio/ambience/Banish_Machine.mp3.

Chạy:  python -I games/dredge/tools/questobj.py        (~20 giây: đọc thẳng Game.unity dạng text, không cần UnityPy)
Đọc:   Scenes/Game.unity: MonoBehaviour BanishMachine (guid 8fea21fc…: toggleObjects, audioSource, volumeMax, volumeFadeTime) và
       DSAltarFlame (guid 09d7133e…: toggleObject, safeParticleDestroyer), GameObject / Transform của chúng và của các đối tượng được bật tắt,
       AudioSource của máy (clip, MinDistance, MaxDistance, Loop), GameConfigDataProd.asset (banishMachineDurationDays).
Ra:    window.DR_QUESTOBJ = { banishMachine: {name, p[3], toggles:[{name, p, active}], audio:{clip, loop, min, max, volumeMax, fadeTime}, durationDays},
                              altarFlames: [{name, p, toggle:{name, p}, particles}] }
       audio/ambience/Banish_Machine.mp3 (mono 48k, cắt 30 s như profile "amb" của tools/audio.py)
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z.
Ghi chú đo: Game.unity chỉ có MỘT DSAltarFlame và MỘT BanishMachine (WORLD-GAPS ghi "3 ngọn lửa" là ước, đã đo lại).
Rerunnable: cùng đầu vào ra cùng đầu ra (mp3 do ffmpeg, mã hoá lại byte giống nhau với cùng bản ffmpeg).
"""
import bisect, io, json, math, os, re, shutil, subprocess, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
SCENE = os.path.join(ASSETS, 'Scenes', 'Game.unity')
OUT_JS = os.path.join(GAME, 'data', 'questobj.js')
OUT_MP3 = os.path.join(GAME, 'audio', 'ambience', 'Banish_Machine.mp3')
G_BANISH, G_FLAME = '8fea21fcc49ab5a1b48355b8d5f285b0', '09d7133ec7accc093cca04ff75d2f2cc'

t = io.open(SCENE, encoding='utf-8', errors='replace').read()
ix = {}
for m in re.finditer(r'^--- !u!(\d+) &(\d+)[^\n]*\n', t, re.M):
    ix[m.group(2)] = (int(m.group(1)), m.end())
pos = sorted(v[1] for v in ix.values())


def blk(i):
    s = ix[str(i)][1]
    j = bisect.bisect_right(pos, s)
    return t[s:(pos[j] - 1 if j < len(pos) else len(t))]


def fid(s, key):
    m = re.search(r'^\s*%s: \{fileID: (\d+)' % key, s, re.M)
    return m.group(1) if m else None


def num(s, key, d=0.0):
    m = re.search(r'^\s*%s: (-?[\d.eE+-]+)' % key, s, re.M)
    return float(m.group(1)) if m else d


def vec(s, key, n='xyzw'):
    m = re.search(r'^\s*%s: \{(.*?)\}' % key, s, re.M)
    return [float(re.search(r'\b%s: (-?[\d.eE+-]+)' % c, m.group(1)).group(1)) for c in n]


def qrot(q, v):
    x, y, z, w = q
    # v' = v + 2w(q x v) + 2 q x (q x v)
    cx, cy, cz = y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]
    dx, dy, dz = y * cz - z * cy, z * cx - x * cz, x * cy - y * cx
    return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)]


def transform_of(go):
    for c in re.findall(r'component: \{fileID: (\d+)\}', blk(go).split('m_Layer')[0]):
        if ix[c][0] in (4, 224):
            return c
    return None


def world_pos(go):
    tr = transform_of(go)
    chain = []
    while tr and tr != '0':
        b = blk(tr)
        chain.append((vec(b, 'm_LocalPosition', 'xyz'), vec(b, 'm_LocalRotation'), vec(b, 'm_LocalScale', 'xyz')))
        tr = fid(b, 'm_Father')
    p = [0.0, 0.0, 0.0]
    for lp, lr, ls in chain:     # từ con lên gốc
        p = qrot(lr, [p[i] * ls[i] for i in range(3)])
        p = [p[i] + lp[i] for i in range(3)]
    return [round(p[0], 3), round(p[1], 3), round(-p[2], 3)]


def gobj(i):
    b = blk(i)
    return {'name': re.search(r'm_Name: (.*)', b).group(1).strip(), 'p': world_pos(i), 'active': num(b, 'm_IsActive', 1) == 1}


def mbs(guid):
    return [(k, blk(k)) for k, (c, s) in ix.items() if c == 114 and ('guid: ' + guid) in t[s:s + 400]]


def clip_name(guid):
    d = os.path.join(ASSETS, 'Audio')
    for r, _, fs in os.walk(d):
        for f in fs:
            if f.endswith('.meta'):
                with io.open(os.path.join(r, f), encoding='utf-8') as h:
                    if 'guid: ' + guid in h.read(300):
                        return os.path.join(r, f[:-5])
    raise SystemExit('không thấy clip ' + guid)


cfg = io.open(os.path.join(ASSETS, 'MonoBehaviour', 'GameConfigDataProd.asset'), encoding='utf-8').read()
dur = float(re.search(r'banishMachineDurationDays: (-?[\d.]+)', cfg).group(1))

bm = mbs(G_BANISH)
fl = mbs(G_FLAME)
assert len(bm) == 1 and len(fl) == 1, (len(bm), len(fl))
k, b = bm[0]
go = fid(b, 'm_GameObject')
toggles = [gobj(x) for x in re.findall(r'^\s*- \{fileID: (\d+)\}', b.split('toggleObjects:')[1].split('audioSource')[0], re.M)]
ab = blk(fid(b, 'audioSource'))
clip = clip_name(re.search(r'm_audioClip: \{fileID: \d+, guid: ([0-9a-f]+)', ab).group(1))
banish = dict(gobj(go), toggles=toggles, durationDays=dur,
              audio={'clip': os.path.basename(clip)[:-4], 'loop': num(ab, 'Loop') == 1, 'min': num(ab, 'MinDistance'), 'max': num(ab, 'MaxDistance'),
                     'volumeMax': num(b, 'volumeMax'), 'fadeTime': num(b, 'volumeFadeTime')})
flames = []
for k, b in fl:
    sp = blk(fid(b, 'safeParticleDestroyer'))
    flames.append(dict(gobj(fid(b, 'm_GameObject')), toggle=gobj(fid(b, 'toggleObject')), particles=len(re.findall(r'^\s*- \{fileID: \d+\}', sp, re.M))))

out = {'banishMachine': banish, 'altarFlames': flames}
os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// generated by tools/questobj.py - do not edit\nwindow.DR_QUESTOBJ = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
print(json.dumps(out, ensure_ascii=False))

ff = shutil.which('ffmpeg')
if ff:
    os.makedirs(os.path.dirname(OUT_MP3), exist_ok=True)
    subprocess.check_call([ff, '-y', '-v', 'error', '-i', clip, '-t', '30', '-ac', '1', '-b:a', '48k', '-map_metadata', '-1', '-fflags', '+bitexact', OUT_MP3])
    print('mp3', os.path.getsize(OUT_MP3), 'bytes')
