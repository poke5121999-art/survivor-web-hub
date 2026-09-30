# -*- coding: utf-8 -*-
"""Duong float cua AnimationClip (Mecanim) -> track theo ten nut + ten thuoc tinh.

Thu tu chi so duong: streamed, dense, constant; moi binding Transform (typeID 4) chiem 3/4/3/3 duong
(vi tri/quaternion/co/euler), binding khac chiem 1. binding.path = crc32 duong dan nut tinh tu goc Animator,
binding.attribute = crc32 ten thuoc tinh (vd 'm_AnchoredPosition.x') voi moi kieu tru Transform.
"""
import struct
import zlib

PROPS = []
for base in ('m_AnchoredPosition', 'm_SizeDelta', 'm_AnchorMin', 'm_AnchorMax', 'm_Pivot', 'm_LocalScale',
             'm_LocalPosition', 'm_LocalEulerAnglesRaw', 'localEulerAnglesRaw'):
    for ax in 'xyz':
        PROPS.append(base + '.' + ax)
for base in ('m_Color', 'm_EffectColor'):
    for ch in 'rgba':
        PROPS.append(base + '.' + ch)
PROPS += ['m_IsActive', 'm_Enabled', 'm_Alpha', 'm_FillAmount', 'm_FontData.m_FontSize', 'm_Interactable',
          'm_Spacing', 'm_Value']
PROP_OF = {zlib.crc32(p.encode()): p for p in PROPS}
TRANSFORM_ATTR = {1: ('m_LocalPosition', 'xyz'), 2: ('m_LocalRotation', 'xyzw'), 3: ('m_LocalScale', 'xyz'),
                  4: ('m_LocalEulerAngles', 'xyz')}


def node_paths(node, prefix=''):
    """{crc32(duong dan): duong dan} cho moi nut con cua skrip.Node (goc = '')."""
    out = {zlib.crc32(b''): ''}
    for ch in node.children():
        p = prefix + ch.name
        out[zlib.crc32(p.encode('utf-8'))] = p
        out.update({k: v for k, v in node_paths(ch, p + '/').items() if v})
    return out


def float_tracks(rip, cab, clip_obj, paths):
    """-> {'name','len','tracks':[{'path','type','prop','keys':[[t,v],...]}]} (chi duong float)."""
    t = rip.tree(cab, clip_obj)
    binds = t['m_ClipBindingConstant']['genericBindings']
    clip = t['m_MuscleClip']['m_Clip']['data']
    sc, dc, cc = clip['m_StreamedClip'], clip['m_DenseClip'], clip['m_ConstantClip']['data']
    # chi so duong -> (binding, thanh phan)
    slots = []
    for b in binds:
        if b['isPPtrCurve']:
            continue
        if b['typeID'] == 4:
            name, comps = TRANSFORM_ATTR.get(b['attribute'], ('?', 'x'))
            for c in comps:
                slots.append((b, name + '.' + c))
        else:
            slots.append((b, PROP_OF.get(b['attribute'], '#%08x' % b['attribute'])))
    keys = {}
    raw = struct.pack('<%dI' % len(sc['data']), *sc['data']) if sc['data'] else b''
    i = 0
    while i + 8 <= len(raw):
        tm, n = struct.unpack_from('<fI', raw, i)
        i += 8
        for _ in range(n):
            idx, = struct.unpack_from('<I', raw, i)
            c = struct.unpack_from('<4f', raw, i + 4)
            i += 20
            if -1e30 < tm < 1e30:
                keys.setdefault(idx, []).append([round(tm, 4), round(c[3], 4)])
    ns = sc['curveCount']
    nd = dc['m_CurveCount']
    if nd:
        arr = dc['m_SampleArray']
        frames = len(arr) // nd
        for f in range(frames):
            tm = dc['m_BeginTime'] + f / dc['m_SampleRate']
            for j in range(nd):
                keys.setdefault(ns + j, []).append([round(tm, 4), round(arr[f * nd + j], 4)])
    for j, v in enumerate(cc):
        keys.setdefault(ns + nd + j, []).append([0.0, round(v, 4)])
    tracks = []
    for idx, (b, prop) in enumerate(slots):
        if idx not in keys:
            continue
        tracks.append({'path': paths.get(b['path'], '#%08x' % b['path']), 'type': b['typeID'], 'prop': prop,
                       'keys': keys[idx]})
    mc = t['m_MuscleClip']
    return {'name': t['m_Name'], 'len': round(mc['m_StopTime'] - mc['m_StartTime'], 4), 'tracks': tracks}
