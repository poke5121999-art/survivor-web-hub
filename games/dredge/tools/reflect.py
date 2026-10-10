"""Phản chiếu phẳng của mặt nước (PlanarReflections.cs) -> data/reflect.js (DR_REFLECT).

    python -I games/dredge/tools/reflect.py

Đọc:
  - Scenes/Manager.unity: component PlanarReflections (renderScale, reflectionLayer, reflectSkybox, reflectionTarget, reflectionPlaneOffset)
    và Transform của reflectionTarget (mặt phẳng phản chiếu).
  - ProjectSettings/TagManager.asset: tên layer.
  - SettingsSaveDataTemplate.asset: reflections (mặc định bật/tắt; ReflectionSettingResponder.cs bật component + keyword _REFLECTIONS).
  - Scenes/Game.unity: mọi GameObject có MeshRenderer trên layer trong reflectionLayer; vị trí thế giới (cộng Transform cha) so với vị trí
    từng instance của art/world/instances.bin -> instanceBits (base64, bit i = instance i được vẽ vào ảnh phản chiếu).
Chạy lại ra đúng từng byte (sắp xếp mọi danh sách).
"""
import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
PROJ = r'D:\dredge-ref\ripped\ExportedProject\ProjectSettings'
OUT = os.path.join(GAME, 'data', 'reflect.js')
PR_GUID = '3a1e3deeff8c942d8dea2f68efd8897e'  # Scripts/Assembly-CSharp/PlanarReflections.cs.meta


def blocks(txt):
    out = {}
    for m in re.finditer(r'--- !u!(\d+) &(-?\d+)[^\n]*\n(.*?)(?=\n--- !u!|\Z)', txt, re.S):
        out[m.group(2)] = (int(m.group(1)), m.group(3))
    return out


def field(b, name):
    m = re.search(r'\n\s*' + name + r': (.*)', '\n' + b)
    return m.group(1).strip() if m else None


def bits(b, name):
    m = re.search(name + r':\s*\n\s*serializedVersion: \d+\s*\n\s*m_Bits: (\d+)', b)
    return int(m.group(1))


def main():
    layers = re.search(r'layers:\n((?:  - .*\n)+)', open(os.path.join(PROJ, 'TagManager.asset'), encoding='utf-8').read()).group(1)
    layer_names = [l[4:].strip() for l in layers.splitlines()]

    man = blocks(open(os.path.join(ASSETS, 'Scenes', 'Manager.unity'), encoding='utf-8').read())
    pr = next(b for t, b in man.values() if t == 114 and PR_GUID in b)
    target = re.search(r'reflectionTarget: \{fileID: (-?\d+)\}', pr).group(1)
    tgo = man[target][1]
    ttr = next(man[c][1] for c in re.findall(r'component: \{fileID: (-?\d+)\}', tgo) if man[c][0] == 4)
    tpos = [float(v) for v in re.search(r'm_LocalPosition: \{x: (\S+), y: (\S+), z: (\S+)\}', ttr).groups()]
    mask = bits(pr, 'reflectionLayer')
    cfg = {
        'renderScale': float(field(pr, 'renderScale')),
        'reflectionLayer': mask,
        'reflectionLayerNames': [layer_names[i] for i in range(32) if mask >> i & 1],
        'basicReflectionLayer': bits(pr, 'basicReflectionLayer'),
        'reflectSkybox': int(field(pr, 'reflectSkybox')),
        'reflectionPlaneOffset': float(field(pr, 'reflectionPlaneOffset')),
        'targetName': field(tgo, 'm_Name'),
        'targetLocalPosition': tpos,
        'componentEnabledInScene': int(field(pr, 'm_Enabled')),
    }
    tpl = open(os.path.join(ASSETS, 'MonoBehaviour', 'SettingsSaveDataTemplate.asset'), encoding='utf-8').read()
    cfg['defaultSetting'] = int(re.search(r'\n\s*reflections: (\d+)', tpl).group(1))

    # Từng instance của instances.bin (tools/world.py: vị trí three.js = (x, y, −z) của Unity) có thuộc reflectionLayer không: so vị trí thế
    # giới của mọi GameObject có MeshRenderer trên layer đó trong Game.unity (cộng dồn Transform cha) với vị trí instance, làm tròn 1 cm.
    import numpy as np
    scene = blocks(open(os.path.join(ASSETS, 'Scenes', 'Game.unity'), encoding='utf-8').read())
    tr_of_go, tr = {}, {}
    for k, (t, b) in scene.items():
        if t != 4:
            continue
        g = re.search(r'm_GameObject: \{fileID: (-?\d+)\}', b).group(1)
        lp = [float(v) for v in re.search(r'm_LocalPosition: \{x: (\S+), y: (\S+), z: (\S+)\}', b).groups()]
        lr = [float(v) for v in re.search(r'm_LocalRotation: \{x: (\S+), y: (\S+), z: (\S+), w: (\S+)\}', b).groups()]
        ls = [float(v) for v in re.search(r'm_LocalScale: \{x: (\S+), y: (\S+), z: (\S+)\}', b).groups()]
        fa = re.search(r'm_Father: \{fileID: (-?\d+)\}', b).group(1)
        tr[k] = (lp, lr, ls, fa)
        tr_of_go[g] = k
    cache = {}

    def world(k):
        if k in cache:
            return cache[k]
        lp, (x, y, z, w), ls, fa = tr[k]
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4)
        M[:3, :3] = R * np.array(ls)
        M[:3, 3] = lp
        if fa != '0' and fa in tr:
            M = world(fa) @ M
        cache[k] = M
        return M

    sys.setrecursionlimit(10000)
    keys, n_on = set(), 0
    for k, (t, b) in scene.items():
        if t != 1:
            continue
        layer = int(field(b, 'm_Layer'))
        if not (mask >> layer & 1):
            continue
        comps = re.findall(r'component: \{fileID: (-?\d+)\}', b)
        if not any(scene.get(c, (0,))[0] == 23 for c in comps) or k not in tr_of_go:
            continue
        p = world(tr_of_go[k])[:3, 3]
        keys.add((round(p[0], 2), round(p[1], 2), round(-p[2], 2)))
        n_on += 1
    inst = np.fromfile(os.path.join(GAME, 'art', 'world', 'instances.bin'), dtype='<f4').reshape(-1, 10)
    flags = bytearray((len(inst) + 7) // 8)
    hit = 0
    for i, r in enumerate(inst):
        if (round(float(r[0]), 2), round(float(r[1]), 2), round(float(r[2]), 2)) in keys:
            flags[i >> 3] |= 1 << (i & 7)
            hit += 1
    import base64
    cfg['instances'] = len(inst)
    cfg['reflectedInstances'] = hit
    cfg['sceneRenderersOnLayer'] = n_on
    cfg['instanceBits'] = base64.b64encode(bytes(flags)).decode()
    cfg['notes'] = [
        'PlanarReflections.cs: camera phản chiếu = ma trận lật qua mặt phẳng y = target.y + offset, mặt cắt xiên (CalculateObliqueMatrix) '
        'ở plane − 0,1 m; GL.invertCulling; tắt sương (RenderSettings.fog = false); maximumLODLevel 1, lodBias × 0,5; không bóng; '
        'reflectSkybox 1 => xoá bằng skybox; ảnh = pixelWidth × renderScale × renderScale của URP (1), có mipmap; _PlanarReflectionTexture.',
        'Water_Shader (_REFLECTIONS) lấy mẫu ảnh tại toạ độ màn hình đã lệch khúc xạ, trộn trọng số '
        '(1 − sat((d + 5)·0,005·ReflectionDistanceFade))·sat((1 − V.y)^(ReflectionFresnelStrength·clamp(7·_WaveSteepness; 0,7; 5))·ReflectionStrength).',
    ]
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// sinh bởi tools/reflect.py — đừng sửa tay\nwindow.DR_REFLECT=' + json.dumps(cfg, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('reflect:', cfg['renderScale'], cfg['reflectionLayerNames'], cfg['reflectSkybox'], 'instances', hit, 'of', len(inst),
          '(scene renderers on layer', n_on, ') default', cfg['defaultSetting'], '->', OUT)


if __name__ == '__main__':
    main()
