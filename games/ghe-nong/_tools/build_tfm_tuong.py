"""build_tfm_tuong.py — dựng MỘT sheet riêng cho MỖI tướng trong 68 tướng TFM2 (nạp lười, một
trận chỉ dùng 10/68) + một atlas chân dung dùng chung cho màn cấm chọn.

Khác với build_tfm.py (atlas CHUNG cho lính/trụ/quái/20 tướng tự chế đời cũ, giữ nguyên để không
vỡ game hiện tại): script này đọc THẲNG danh sách 68 id từ js/data-tfm.js (window.TFM.tuong),
nên không cần sửa tay khi đổi đội hình.

Với mỗi id lấy TẤT CẢ hoạt ảnh của:
  - asset/base/aseprite_resources/champions/<id>#anim.fanim         (bộ hoạt ảnh chính — luôn có)
  - asset/base/aseprite_resources/champions/<id>_ult#anim.fanim     (5 tướng có sheet ult riêng)
  - asset/base/aseprite_resources/skill_effect/<id>*                (19 tướng có hiệu ứng chiêu
    riêng ở thư mục khác — khớp theo TIỀN TỐ tên tệp, xem RESEARCH.md §15)
không lọc theo tên hoạt ảnh: tướng nào TFM2 có gì thì xuất nấy (idle/run/attack/dead/hit/skillN/
ult/ult_effect/...), sim và bên vẽ chiêu tự tra theo đúng tên TFM2 (không đổi tên như bảng CHUNG
của build_tfm.py).

Ra mỗi tướng: art/tfm/t/<id>.png + art/tfm/t/<id>.js (window.TFM_T['<id>'] = {...}), nạp bằng
G.napTuong(id) trong sprites.js (chèn <script> động, KHÔNG có trong index.html).
Ra thêm: art/tfm/icon.png + art/tfm/icon.js — ảnh khung ĐỨNG YÊN đầu tiên của cả 68 tướng, cắt
top 62% (cùng công thức G.anhTuong cũ), đóng gói chung MỘT atlas nhỏ vì màn cấm chọn cần thấy
cả 68 cùng lúc — không thể nạp lười từng tướng.

Chạy: python _tools/build_tfm_tuong.py [đường dẫn bundle.game_data]
"""
import hashlib
import io
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tfm import Kho, cat  # noqa: E402

BUNDLE = sys.argv[1] if len(sys.argv) > 1 else r"D:/Teamfight.Manager.2.v0.6.0_LinkNeverDie.Com/bundle.game_data"
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'tfm', 't')
CH = 'asset/base/aseprite_resources/champions/'
SE = 'asset/base/aseprite_resources/skill_effect/'


def doc_danh_sach_id():
    duong = os.path.join(GOC, 'js', 'data-tfm.js')
    with io.open(duong, encoding='utf-8') as f:
        raw = f.read()
    tien_to = 'window.TFM = '
    i = raw.index(tien_to) + len(tien_to)
    j = raw.rindex(';')
    data = json.loads(raw[i:j])
    return sorted(data['tuong'].keys())


def se_files(kho):
    out = sorted(set(k.rsplit('#', 1)[0] for k in kho.muc if k.startswith(SE) and '#' in k))
    return [f[len(SE):] for f in out]


def khop_se(id_, ds):
    chuan = id_.replace('_', ' ')
    return [f for f in ds if f == id_ or f.startswith(id_ + '_') or f == chuan or f.startswith(chuan + '_')]


def dung_mot_tuong(kho, id_, se_ds):
    """trả {tên hoạt ảnh: [(PIL.Image, ms), ...]} gộp từ mọi nguồn của một tướng"""
    anims = {}

    def gop(goc, doi_ten=None):
        k = goc + '#anim.fanim'
        if k not in kho.muc:
            return
        a, sh = kho.hoat_anh(goc)
        for ten, dl in a.items():
            ten2 = (doi_ten(ten) if doi_ten else ten)
            if ten2 in anims:
                ten2 = 'se_' + ten2 if ten2 != ten else ten2  # va tên hiếm: ưu tiên bộ chính, đổi tên bộ phụ
                n = ten2; k2 = 1
                while n in anims:
                    k2 += 1; n = ten2 + str(k2)
                ten2 = n
            anims[ten2] = [(cat(sh, fr['data']), round(fr['duration'] * 1000)) for fr in dl['frames']]

    gop(CH + id_)
    gop(CH + id_ + '_ult', lambda t: t if t not in ('idle',) else 'ult_' + t)
    for f in khop_se(id_, se_ds):
        gop(SE + f)
    return anims


def dong_goi(anims, ten_png):
    """dồn khung trùng, xếp kệ RONG=1024, trả (ảnh atlas, {anim: [[x,y,w,h,ms]]}, chan, dinh, rongMax, caoMax)"""
    khung = []   # [(PIL.Image, ms, tên anim)]
    bam = {}
    anh = []

    def them(im):
        h = hashlib.md5(im.tobytes() + str(im.size).encode()).hexdigest()
        if h not in bam:
            bam[h] = len(anh)
            anh.append(im)
        return bam[h]

    idx = {}
    for ten, ds in anims.items():
        idx[ten] = [(them(im), ms) for im, ms in ds]

    thu_tu = sorted(range(len(anh)), key=lambda i: (-anh[i].height, -anh[i].width))
    RONG = 1024
    vt = {}
    x = y = cao_ke = 0
    for i in thu_tu:
        w, h = anh[i].size
        if x + w > RONG:
            x = 0; y += cao_ke + 1; cao_ke = 0
        vt[i] = (x, y)
        x += w + 1
        cao_ke = max(cao_ke, h)
    tong_cao = y + cao_ke
    atlas = Image.new('RGBA', (RONG, max(tong_cao, 1)), (0, 0, 0, 0))
    for i, (x, y) in vt.items():
        atlas.paste(anh[i], (x, y))

    m = {ten: [[vt[i][0], vt[i][1], anh[i].width, anh[i].height, ms] for i, ms in ds] for ten, ds in idx.items()}

    # chân/đỉnh đo trên khung đầu của 'idle' (hoặc anim đầu tiên nếu thiếu idle), từ TÂM khung
    ten_dau = 'idle' if 'idle' in m else next(iter(m.keys()))
    i0 = idx[ten_dau][0][0]
    im0 = anh[i0]
    bb = im0.getchannel('A').getbbox() or (0, 0, im0.width, im0.height)
    chan = bb[3] - im0.height / 2
    dinh = im0.height / 2 - bb[1]
    rong_max = max(anh[i].width for ds in idx.values() for i, _ in ds) if idx else 0
    cao_max = max(anh[i].height for ds in idx.values() for i, _ in ds) if idx else 0
    return atlas, m, round(chan, 1), round(dinh, 1), rong_max, cao_max


def main():
    kho = Kho(BUNDLE)
    ids = doc_danh_sach_id()
    se_ds = se_files(kho)
    os.makedirs(RA, exist_ok=True)
    for x in os.listdir(RA):
        os.remove(os.path.join(RA, x))

    tong_png = 0
    portraits = []  # (id, PIL.Image cắt top62%)
    thieu = []

    for id_ in ids:
        anims = dung_mot_tuong(kho, id_, se_ds)
        if not anims:
            thieu.append(id_)
            continue
        atlas, m, chan, dinh, rong_max, cao_max = dong_goi(anims, id_)
        png_path = os.path.join(RA, id_ + '.png')
        atlas.save(png_path, optimize=True)
        tong_png += os.path.getsize(png_path)
        data = {'anim': m, '_': [chan, dinh, rong_max, cao_max], '_co': [atlas.width, atlas.height]}
        js = ("window.TFM_T=window.TFM_T||{};window.TFM_T['%s']=" % id_ +
              json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
        with io.open(os.path.join(RA, id_ + '.js'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(js)

        # chân dung: khung 'idle' đầu, cắt hình vuông cạnh = 62% chiều cao người, từ đỉnh đầu xuống
        f0 = m['idle'][0] if 'idle' in m else next(iter(m.values()))[0]
        x0, y0, w0, h0 = f0[0], f0[1], f0[2], f0[3]
        canh = min(w0, round((chan + dinh) * 0.62))
        tren0 = max(0, round(h0 / 2 - dinh) - 2)
        trai = round((w0 - canh) / 2)
        portraits.append((id_, atlas.crop((x0 + trai, y0 + tren0, x0 + trai + canh, y0 + tren0 + canh))))

    # atlas chân dung dùng chung, đóng gói vuông theo lưới (cạnh khác nhau chút — canh trái-trên)
    RONGP = 12  # cột
    cao_hang = {}
    x = y = hang_h = 0
    vt = {}
    for i, (id_, im) in enumerate(portraits):
        if i % RONGP == 0 and i:
            y += hang_h + 1; x = 0; hang_h = 0
        vt[id_] = (x, y, im.width, im.height)
        x += im.width + 1
        hang_h = max(hang_h, im.height)
    tong_cao = y + hang_h
    tong_rong = max((v[0] + v[2] for v in vt.values()), default=0)
    icon_atlas = Image.new('RGBA', (max(tong_rong, 1), max(tong_cao, 1)), (0, 0, 0, 0))
    for id_, im in portraits:
        icon_atlas.paste(im, (vt[id_][0], vt[id_][1]))
    icon_path = os.path.join(GOC, 'art', 'tfm', 'icon.png')
    icon_atlas.save(icon_path, optimize=True)
    icon_js = ('/* sinh tự động bởi _tools/build_tfm_tuong.py — đừng sửa tay.\n'
               '   id tướng TFM2 → [x, y, w, h] trong art/tfm/icon.png. */\n'
               'window.TFM_ICON = ' + json.dumps(vt, separators=(',', ':'), ensure_ascii=False) + ';\n')
    with io.open(os.path.join(GOC, 'art', 'tfm', 'icon.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(icon_js)

    if thieu:
        raise SystemExit('thiếu hoạt ảnh cho: ' + ', '.join(thieu))
    print('tướng', len(ids), 'tổng png/t', tong_png // 1024, 'KB',
          'icon.png', os.path.getsize(icon_path) // 1024, 'KB',
          'icon.js', os.path.getsize(os.path.join(GOC, 'art', 'tfm', 'icon.js')) // 1024, 'KB')


if __name__ == '__main__':
    main()
