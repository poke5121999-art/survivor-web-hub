"""Raw fields of scene MonoBehaviours in apk/assets/bin/Data/data.unity3d (no typetree there): finds the ones whose
MonoScript is in `want` and prints the bytes after m_Name as hex and float32, to be read by dump.cs field order.
Gave ProCamera2D / ProCamera2DForwardFocus of scene level2 (js/camera.js) and the CanvasScaler of level1.
    py -3 -I scene_monobehaviours.py
"""
import UnityPy, struct, sys, os
src = r'D:/stickman-hook-ref/apk/assets/bin/Data/data.unity3d'
env = UnityPy.load(src)
want = ('ProCamera2D', 'ProCamera2DForwardFocus', 'ProCamera2DNumericBoundaries', 'CameraService', 'PlayerCameraController', 'GradientBackgroundMover', 'BackgroundGradient')
scripts = {}
for obj in env.objects:
    if obj.type.name == 'MonoScript':
        d = obj.read()
        scripts[(obj.assets_file.name, obj.path_id)] = d.m_ClassName
print('monoscripts', len(scripts))
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    raw = obj.get_raw_data()
    # m_GameObject PPtr(4+8), m_Enabled(1 +3 pad), m_Script PPtr(4+8), m_Name string
    fid, pid = struct.unpack_from('<iq', raw, 16)
    sf = obj.assets_file
    if fid == 0:
        key = (sf.name, pid)
    else:
        ext = sf.externals[fid - 1]
        key = (os.path.basename(ext.path), pid)
    name = scripts.get(key)
    if name is None:
        # try by path id only
        cands = [v for (f, p), v in scripts.items() if p == pid]
        name = cands[0] if len(cands) == 1 else '?%s' % (cands,)
    if any(name == w for w in want):
        nl = struct.unpack_from('<i', raw, 28)[0]
        off = 32 + ((nl + 3) & ~3)
        body = raw[off:]
        print(sf.name, obj.path_id, name, 'len', len(body))
        print('  hex', body[:160].hex())
        fl = [round(struct.unpack_from('<f', body, i)[0], 4) for i in range(0, min(len(body), 160) - 3, 4)]
        print('  f32', fl)
