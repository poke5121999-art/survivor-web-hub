"""build_uma_nguoi.py — chân dung người (huấn luyện viên, tuyển thủ) lấy nhân vật Uma Musume.

Nguồn: meta + dat của bản Uma cài trên máy (xem rip_uma_img.py).
  chara/chrXXXX/chr_icon_XXXX            icon tròn 256 px      → atlas art/uma/mat.png (ô 112 px)
  chara/chrXXXX/chara_stand_XXXX_1XXX01  tranh đứng, bộ đua    → art/uma/dung/<id>.webp (cỡ gốc, ô 512 px)
      bộ `1xxx01` là trang phục đua đặc trưng; bộ `000001` in tên thật của nhân vật lên áo.
      Nhân vật thiếu bộ đua thì dùng `000101`.
  uianimation/flash/singlemode/turn/chr_training_turn_bg_XXXX → art/uma/luot/<id>.webp (nền đồng hồ lượt)
  chara/chrXXXX/petit/petit_chr_XXXX_1XXX01_00NN  chibi trên nút Career (chỉ huấn luyện viên)
      → art/uma/petit/<id>.webp, dải 4 ô 256 px: tập ×2 khung (0020, 0021), giao hữu ×2 (0060, 0061)
Ra: art/uma/nguoi.js — window.UMA_NGUOI = {id người: {uma, mat: [x, y, w, h], dung, luot, petit}}, _co: [W, H].
Chạy: python _tools/build_uma_nguoi.py
"""
import io
import json
import os
import sqlite3

import UnityPy
from PIL import Image

UMA = os.path.expanduser('~/AppData/LocalLow/Cygames/Umamusume/')
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'uma')
O = 112

# người trong game → nhân vật Uma. Mỗi nhân vật dùng một lần.
GHEP = {
    'hlv_lua': '1003', 'hlv_thep': '1008', 'hlv_mat': '1017', 'hlv_vang': '1004', 'hlv_tan': '1013',
    'hlv_nhip': '1006', 'hlv_nha': '1015', 'hlv_vi': '1018', 'hlv_quan': '1011', 'hlv_dai': '1010',
    'hlv_tre': '1007', 'hlv_cu': '1012', 'hlv_may': '1014', 'hlv_ly': '1016', 'hlv_vui': '1024',
    'tt_bao': '1009', 'tt_nui': '1020', 'tt_lua': '1021', 'tt_thep': '1023', 'tt_oc': '1025',
    'tt_gio': '1026', 'tt_dan': '1027', 'tt_song': '1028', 'tt_kien': '1030', 'tt_minh': '1031',
    'tt_hai': '1032', 'tt_phong': '1035', 'tt_an': '1037', 'tt_khanh': '1038', 'tt_duy': '1040',
    'tt_tam': '1041', 'tt_nam': '1001', 'tt_long': '1045', 'tt_son': '1002', 'tt_vy': '1005',
    'tt_hung': '1046', 'tt_thu': '1050', 'tt_dat': '1052', 'tt_lam': '1056',
}


def main():
    db = sqlite3.connect(UMA + 'meta')

    def anh(ten):
        h = db.execute("select h from a where n=? and s=1", (ten,)).fetchone()
        if not h:
            return None
        env = UnityPy.load(UMA + 'dat/' + h[0][:2] + '/' + h[0])
        for o in env.objects:
            if o.type.name == 'Texture2D':
                return o.read().image.convert('RGBA')
        return None

    assert len(set(GHEP.values())) == len(GHEP), 'một nhân vật Uma bị ghép hai lần'
    for d in ('dung', 'luot', 'petit'):
        os.makedirs(os.path.join(RA, d), exist_ok=True)
    cot = 8
    hang = (len(GHEP) + cot - 1) // cot
    atlas = Image.new('RGBA', (cot * O, hang * O), (0, 0, 0, 0))
    bang = {}
    for i, (id_, c) in enumerate(sorted(GHEP.items())):
        ic = anh('chara/chr%s/chr_icon_%s' % (c, c))
        dung = anh('chara/chr%s/chara_stand_%s_%s%s01' % (c, c, c[0], c[1:])) or \
            anh('chara/chr%s/chara_stand_%s_000101' % (c, c))
        if ic is None or dung is None:
            raise SystemExit('thiếu ảnh nhân vật %s cho %s' % (c, id_))
        x, y = (i % cot) * O, (i // cot) * O
        atlas.paste(ic.resize((O, O), Image.LANCZOS), (x, y))
        bb = dung.getchannel('A').getbbox()
        dung = dung.crop(bb)      # giữ cỡ gốc: ảnh 2D lớn nhất Uma có là ô 512 px
        dung.save(os.path.join(RA, 'dung', id_ + '.webp'), quality=86, method=6)
        m = {'uma': c, 'mat': [x, y, O, O], 'dung': 'art/uma/dung/%s.webp' % id_}
        nen = anh('uianimation/flash/singlemode/turn/chr_training_turn_bg_' + c)
        if nen is not None:
            nen.save(os.path.join(RA, 'luot', id_ + '.webp'), quality=88, method=6)
            m['luot'] = 'art/uma/luot/%s.webp' % id_
        if id_.startswith('hlv_'):
            bo = c[0] + c[1:] + '01'
            khung = [anh('chara/chr%s/petit/petit_chr_%s_%s_%s' % (c, c, bo, k)) for k in ('0020', '0021', '0060', '0061')]
            if all(khung):
                dai = Image.new('RGBA', (256 * 4, 256), (0, 0, 0, 0))
                for j, im in enumerate(khung):
                    dai.paste(im.resize((256, 256), Image.LANCZOS), (j * 256, 0))
                dai.save(os.path.join(RA, 'petit', id_ + '.webp'), quality=88, method=6)
                m['petit'] = 'art/uma/petit/%s.webp' % id_
        bang[id_] = m
    atlas.save(os.path.join(RA, 'mat.png'), optimize=True)
    bang['_co'] = [cot * O, hang * O]
    with io.open(os.path.join(RA, 'nguoi.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* sinh tự động bởi _tools/build_uma_nguoi.py — đừng sửa tay. Nguồn: Uma Musume. */\n'
                'window.UMA_NGUOI = ' + json.dumps(bang, separators=(',', ':')) + ';\n')
    kb = lambda d: sum(os.path.getsize(os.path.join(RA, d, x)) for x in os.listdir(os.path.join(RA, d))) // 1024
    print('người', len(GHEP), 'mat.png', os.path.getsize(os.path.join(RA, 'mat.png')) // 1024, 'KB',
          'dung', kb('dung'), 'KB', 'luot', kb('luot'), 'KB', 'petit', kb('petit'), 'KB')


if __name__ == '__main__':
    main()
