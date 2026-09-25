"""build_uma_flash.py — xuất hoạt ảnh giao diện "flash" (A2U) của Uma Musume cho js/uma-flash.js.

Mỗi prefab `uianimation/flash/.../pf_fl_*` là một AssetBundle gồm:
  - một Texture2D chứa mọi mảnh ảnh,
  - as_uMeshParam: mảnh tên gì, nằm đâu trên ảnh (UV gốc DƯỚI-TRÁI, có mảnh xoay 90°), cỡ hiện, độ lệch,
  - as_uParam: cây "motion"; mỗi motion có nhãn [t0, t1, nhãn kế], đối tượng con (motion con /
    mặt phẳng dán mảnh / chữ), và khoá khung đã nướng sẵn 30 fps cho vị trí, xoay, co, màu, đổi mảnh.
Mảnh tên `dum_*` là chỗ trống; game gốc nhét hình vào lúc chạy (ở đây do js lo).

Ra: art/uma/fl/<tên>.png + <tên>.js (window.UMA_FL[<tên>] = {...}, dạng gọn, xem `gon()`).
Chạy: python _tools/build_uma_flash.py
"""
import io
import json
import os
import sqlite3
import sys

import UnityPy

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'uma', 'fl')
UMA = os.path.expanduser('~/AppData/LocalLow/Cygames/Umamusume/')

# prefab → tên ngắn dùng trong game. Chỉ xuất cái được dùng: fl.js nạp ở mọi lần mở trang.
# the_luc và tieu_de chỉ để build_uma_ca.py cắt mảnh thanh thể lực / thanh tiêu đề.
PREFAB = {
    'uianimation/flash/singlemode/pf_fl_singlemode_btn_trainingmenu00': 'nut_tap',
    'uianimation/flash/singlemode/pf_fl_singlemode_trainingmenu_base00': 'nen_tap',
    'uianimation/flash/singlemode/pf_fl_singlemode_txt_trainingresult00': 'kq_tap',
    'uianimation/flash/singlemode/pf_fl_singlemode_header_hpgauge00': 'the_luc',
    'uianimation/flash/singlemode/pf_fl_singlemode_header_title00': 'tieu_de',
}
# ảnh rời nhét vào chỗ `dum_*`: tên → bundle
ANH_ROI = {
    'uianimation/flash/singlemode/training/': 'tap',
    'uianimation/flash/singlemode/statusicon/': 'cs',
    'uianimation/flash/singlemode/trainingcut/': 'cut',
}


def v2(d, so=3):
    return [round(d['x'], so), round(d['y'], so)]


def khoa(ds):
    """[[t, v], ...] từ _keyList; bỏ trống"""
    return [[round(k['x'], 4), round(k['y'], 4)] for k in ds['_keyList']]


def gon(o, loai):
    """một đối tượng A2U → dạng gọn"""
    r = {'k': loai, 'n': o['_objectName'], 'i': o['_objectIndex'], 't': v2(o['_timeRange'], 4), 's': v2(o['_size']),
         'p': v2(o['_position']), 'po': v2(o['_positionOffset']), 'r': round(o['_rotate']['z'], 3),
         'sc': v2(o['_scale']), 'sh': v2(o['_shear']),
         'c': [round(o['_color'][x], 3) for x in 'rgba'],
         'co': [round(o['_colorOffset'][x], 3) for x in 'rgba'], 'b': o['_blendModeType']}
    K = {}
    for ten, truong, n in (('p', '_positionKeyParamList', 2), ('po', '_positionOffsetKeyParamList', 2),
                           ('r', '_rotateKeyParamList', 3), ('sc', '_scaleKeyParamList', 2),
                           ('sh', '_shearKeyParamList', 2), ('c', '_colorKeyParamList', 4),
                           ('co', '_colorOffsetKeyParamList', 4)):
        ds = o.get(truong) or []
        for i in range(min(n, len(ds))):
            kk = khoa(ds[i])
            if kk:
                K[ten + str(i)] = kk
    if loai == 'm':
        r['ch'] = o.get('_childMotionID') or ''
        r['rs'] = o.get('_motionResetModeType', 0)
    elif loai == 'p':
        r['tx'] = o.get('_textureNameList') or []
        kk = khoa(o['_textureKeyParam'])
        if kk:
            K['tx'] = kk
    elif loai == 't':
        r['txt'] = {'s': o.get('_text', ''), 'f': o.get('_fontSize', 24), 'a': o.get('_alignment', 1),
                    'mau': o.get('_textColor', {}).get('rgba', 4294967295),
                    'vien': o.get('_outlineColor', {}).get('rgba', 0), 'dv': o.get('_outlineOffset', 0)}
    if K:
        r['K'] = K
    return r


def xuat(env_path, ten):
    env = UnityPy.load(env_path)
    anh, luoi, dong = None, None, None
    for o in env.objects:
        if o.type.name == 'Texture2D':
            anh = o.read().image
        elif o.type.name == 'MonoBehaviour':
            t = o.read_typetree()
            nm = t.get('m_Name', '')
            if nm.startswith('as_uMeshParam'):
                luoi = t
            elif nm.startswith('as_uParam'):
                dong = t
    W, H = anh.size
    anh.save(os.path.join(RA, ten + '.png'), optimize=True)
    mesh = {}
    for g in luoi['_meshParameterGroupList']:
        for m in g['_meshInfoParameterList']:
            u, v = m['_uvOffset']['x'], m['_uvOffset']['y']
            uw, vh = m['_uvSize']['x'], m['_uvSize']['y']
            # UV gốc dưới-trái → điểm ảnh gốc trên-trái
            mesh[m['_textureName']] = [round(u * W), round((1 - v - vh) * H), round(uw * W), round(vh * H),
                                       m['_rotated'], round(m['_size']['x'], 2), round(m['_size']['y'], 2),
                                       round(m['_offset']['x'], 2), round(m['_offset']['y'], 2)]
    M = {}
    for m in dong['_motionParameterGroup']['_motionParameterList']:
        obj = [gon(o, 'm') for o in m['_objectParamList']]
        obj += [gon(o, 'p') for o in m['_planeParamList']]
        obj += [gon(o, 't') for o in m['_textParamList']]
        obj.sort(key=lambda o: o['i'])          # thứ tự lớp của Flash, không phải thứ tự loại
        M[m['_id']] = {'n': m['_name'],
                       'l': [[l['_name'], round(l['_timeRange']['x'], 4), round(l['_timeRange']['y'], 4),
                              l['_nextLabel']] for l in m['_labelParamList']],
                       'o': obj}
    return {'tex': [W, H], 'mesh': mesh, 'root': dong['_rootMotionID'], 'fps': dong['_baseFrameRate'], 'm': M}


def main():
    db = sqlite3.connect(UMA + 'meta')
    os.makedirs(RA, exist_ok=True)
    tong = {}
    for n, ten in PREFAB.items():
        h = db.execute("select h from a where n=?", (n,)).fetchone()
        if not h:
            raise SystemExit('không thấy prefab: ' + n)
        tong[ten] = xuat(UMA + 'dat/' + h[0][:2] + '/' + h[0], ten)
    # ảnh rời
    roi = {}
    for pre, nhom in ANH_ROI.items():
        for n, h in db.execute("select n, h from a where n like ? and s=1 order by n", (pre + '%',)):
            env = UnityPy.load(UMA + 'dat/' + h[:2] + '/' + h)
            for o in env.objects:
                if o.type.name == 'Texture2D':
                    d = o.read()
                    tep = nhom + '_' + d.m_Name + '.png'
                    d.image.save(os.path.join(RA, tep), optimize=True)
                    roi[d.m_Name] = 'art/uma/fl/' + tep
    with io.open(os.path.join(RA, 'fl.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* sinh tự động bởi _tools/build_uma_flash.py — đừng sửa tay. Nguồn: Uma Musume (A2U). */\n'
                'window.UMA_FL = ' + json.dumps(tong, separators=(',', ':')) + ';\n'
                'window.UMA_FL_ANH = ' + json.dumps(roi, separators=(',', ':')) + ';\n')
    kb = sum(os.path.getsize(os.path.join(RA, x)) for x in os.listdir(RA)) // 1024
    print('prefab', len(tong), 'ảnh rời', len(roi), 'tổng', kb, 'KB', 'fl.js',
          os.path.getsize(os.path.join(RA, 'fl.js')) // 1024, 'KB')


if __name__ == '__main__':
    sys.exit(main())
