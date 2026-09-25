"""build_tfm.py — dựng atlas hoạt ảnh trận đấu từ Teamfight Manager 2.

Đọc thẳng bundle.game_data của TFM2 (định dạng tự chế, không mã hoá):
    u32 số mục, rồi mỗi mục: u32 len + đuôi, u32 len + đường dẫn, u32 cỡ + dữ liệu.
Hoạt ảnh là cặp `<tên>#anim.fanim` (JSON: anims → frames → {duration, data:{x,y,w,h}}) và
`<tên>#sheet.png`. Khung không kèm điểm neo: neo là TÂM khung (xếp chồng các khung theo tâm
thì thân người đứng yên, chỉ vũ khí và vệt chém di chuyển).

Ra: art/tfm/hinh.png + art/tfm/hinh.js (window.TFM_HINH).
Chạy: python _tools/build_tfm.py [đường dẫn bundle.game_data]
"""
import hashlib
import io
import json
import os
import struct
import sys

from PIL import Image

BUNDLE = sys.argv[1] if len(sys.argv) > 1 else r"D:/Teamfight.Manager.2.v0.6.0_LinkNeverDie.Com/bundle.game_data"
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'tfm')
CH = 'asset/base/aseprite_resources/champions/'
IG = 'asset/base/aseprite_resources/ingame/'
UI = 'asset/base/aseprite_resources/UI_aseprite/'

# trạng thái chung của tướng; mỗi trạng thái là một DÃY tên hoạt ảnh nối nhau
CHUNG = {'dung': ['idle'], 'chay': ['run'], 'danh': ['attack'], 'chet': ['dead'], 'dinh': ['hit']}

# tướng của game → tướng TFM2, kèm dãy hoạt ảnh cho chiêu và chiêu cuối
TUONG = {
    'kiemsi':     ('swordman', ['skill'], ['ult']),
    'cuongchien': ('berserker', ['skill1'], ['ult_pre', 'ult', 'ult_attack']),
    'phaco':      ('hammerer', ['skill'], ['ult']),
    'thanhkiem':  ('magic_knight', ['skill1'], ['ult', 'ult_effect_loop']),
    'kynhan':     ('cavalry_knight', ['skill1_pre', 'skill1_dash', 'skill1', 'skill1_end'], ['ult']),
    'gaosu':      ('werewolf', ['skill1'], ['skill2']),
    'bongma':     ('ghost', ['skill1'], ['skill1_kill']),
    'thoisan':    ('hunter', ['skill1'], ['ult']),
    'phaposu':    ('pyromancer', ['skill'], ['ult']),
    'phapset':    ('lightning_mage', ['skill1'], ['ult']),
    'bongdem':    ('shadowmancer', ['skill1'], ['ult', 'ult_end']),
    'tuchien':    ('dual_blader', ['skill'], ['ult']),
    'xathu':      ('archer', ['skill'], ['ult_pre', 'ult_loop', 'ult_loop', 'ult_end']),
    'sungtruong': ('gunner', ['attack'], ['ult_on']),
    'nodoc':      ('poison_dart_hunter', ['skill1'], ['ult']),
    'bomxich':    ('bomber', ['skill1'], ['ult']),
    'hiepsi':     ('shield_bearer', ['skill'], ['ult']),
    'thaythuoc':  ('priest', ['skill'], ['ult']),
    'khienhon':   ('barrier_magician', ['skill1'], ['ult']),
    'nhacsi':     ('bard', ['skill1'], ['ult']),
}
DOI_TEN = {'dead': ['dead', 'death']}

# thứ khác trong trận: khoá → (tệp, {trạng thái: dãy hoạt ảnh})
KHAC = {}
for doi, mau in (('xanh', 'blue'), ('do', 'red')):
    for loai, ten in (('can', 'melee'), ('xa', 'range')):
        KHAC['linh.%s.%s' % (loai, doi)] = (UI + 'minion', {
            'dung': ['%s_%s_idle' % (ten, mau)], 'chay': ['%s_%s_run' % (ten, mau)],
            'danh': ['%s_%s_attack' % (ten, mau)], 'chet': ['%s_%s_dead' % (ten, mau)]})
    KHAC['dan.linh.' + doi] = (UI + 'minion', {'bay': ['%s_projectile' % mau], 'no': ['%s_hit_effect' % mau]})
    KHAC['tru.' + doi] = (IG + mau + '_tower', {'dung': ['idle'], 'danh': ['attack']})
    KHAC['tru.ngoc.' + doi] = (IG + mau + '_tower_orb', {'dung': ['idle'], 'danh': ['attack']})
    KHAC['dan.tru.' + doi] = (IG + mau + '_tower', {'bay': ['attack_projectile'], 'no': ['hit_effect']})
    KHAC['loi.' + doi] = (IG + mau + '_nexus', {'dung': ['idle'], 'danh': ['attack']})
    KHAC['loi.ngoc.' + doi] = (IG + mau + '_nexus_orb', {'dung': ['idle'], 'danh': ['attack']})
    KHAC['loi.vo.' + doi] = (IG + mau + '_nexus_destroy_effect', None)
for i, ten in enumerate(['bee', 'mushroom', 'rhino', 'stump']):
    KHAC['quai.bai%d' % (i + 1)] = (IG + ten, {'dung': ['idle'], 'danh': ['attack'], 'chet': ['dead']})
KHAC['quai.rong'] = (IG + 'serpen', {'dung': ['idle'], 'danh': ['attack'], 'chet': ['dead']})
KHAC['quai.chua'] = (IG + 'epic', {'dung': ['idle'], 'danh': ['attack_left'], 'chet': ['dead']})


def doc_bundle(duong):
    muc = {}
    with open(duong, 'rb') as f:
        n, = struct.unpack('<I', f.read(4))
        for _ in range(n):
            l, = struct.unpack('<I', f.read(4)); duoi = f.read(l).decode()
            l, = struct.unpack('<I', f.read(4)); ten = f.read(l).decode('utf-8', 'replace')
            c, = struct.unpack('<I', f.read(4))
            muc[ten + '.' + duoi] = (f.tell(), c)
            f.seek(c, 1)
    return muc


class Kho:
    def __init__(self, duong):
        self.duong = duong
        self.muc = doc_bundle(duong)

    def byte(self, ten):
        o, c = self.muc[ten]
        with open(self.duong, 'rb') as f:
            f.seek(o)
            return f.read(c)

    def hoat_anh(self, goc):
        a = json.loads(self.byte(goc + '#anim.fanim'))['anims']
        sh = Image.open(io.BytesIO(self.byte(goc + '#sheet.png'))).convert('RGBA')
        return a, sh


def cat(sh, d):
    x, y, w, h = int(d['x']), int(d['y']), int(d['w']), int(d['h'])
    return sh.crop((x, y, x + w, y + h))


def main():
    kho = Kho(BUNDLE)
    ds = {}      # khoá → trạng thái → [(chỉ số ảnh, ms)]
    anh = []     # ảnh khung đã khử trùng
    bam = {}

    def them(im):
        h = hashlib.md5(im.tobytes() + bytes(im.size)).hexdigest()
        if h not in bam:
            bam[h] = len(anh)
            anh.append(im)
        return bam[h]

    def dung(khoa, goc, bang):
        a, sh = kho.hoat_anh(goc)
        if bang is None:
            bang = {'no': [sorted(a)[0]]}
        out = {}
        for tt, day in bang.items():
            khung = []
            for ten in day:
                ten_that = next((t for t in DOI_TEN.get(ten, [ten]) if t in a), None)
                if ten_that is None:
                    raise SystemExit('%s: thiếu hoạt ảnh %s (có: %s)' % (goc, ten, ', '.join(sorted(a))))
                for fr in a[ten_that]['frames']:
                    khung.append((them(cat(sh, fr['data'])), round(fr['duration'] * 1000)))
            out[tt] = khung
        ds[khoa] = out

    for id_, (tfm, chieu, cuoi) in TUONG.items():
        bang = dict(CHUNG)
        bang['chieu'] = chieu
        bang['cuoi'] = cuoi
        dung('tuong.' + id_, CH + tfm, bang)
    for khoa, (goc, bang) in KHAC.items():
        dung(khoa, goc, bang)

    # xếp kệ: cao trước, rộng tối đa 2048
    thu_tu = sorted(range(len(anh)), key=lambda i: (-anh[i].height, -anh[i].width))
    RONG = 2048
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
    atlas = Image.new('RGBA', (RONG, tong_cao), (0, 0, 0, 0))
    for i, (x, y) in vt.items():
        atlas.paste(anh[i], (x, y))
    os.makedirs(RA, exist_ok=True)
    atlas.save(os.path.join(RA, 'hinh.png'), optimize=True)

    # chân/đỉnh đo trên khung đứng đầu tiên, tính từ TÂM khung, đơn vị điểm ảnh gốc
    def bien(i):
        im = anh[i]
        bb = im.getchannel('A').getbbox() or (0, 0, im.width, im.height)
        return bb[3] - im.height / 2, im.height / 2 - bb[1]

    hinh = {}
    for khoa, bang in ds.items():
        m = {tt: [[vt[i][0], vt[i][1], anh[i].width, anh[i].height, ms] for i, ms in kh] for tt, kh in bang.items()}
        dau = bang.get('dung') or next(iter(bang.values()))
        chan, dinh = bien(dau[0][0])
        m['_'] = [round(chan, 1), round(dinh, 1)]
        hinh[khoa] = m
    hinh['_co'] = [RONG, tong_cao]
    js = ('/* sinh tự động bởi _tools/build_tfm.py — đừng sửa tay. Nguồn: Teamfight Manager 2.\n'
          '   khoá → trạng thái → [x, y, w, h, ms]; "_" = [chân, đỉnh] tính từ tâm khung. */\n'
          'window.TFM_HINH = ' + json.dumps(hinh, separators=(',', ':'), ensure_ascii=False) + ';\n')
    with io.open(os.path.join(RA, 'hinh.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('khung', len(anh), 'atlas', RONG, 'x', tong_cao,
          'png', os.path.getsize(os.path.join(RA, 'hinh.png')) // 1024, 'KB',
          'js', len(js) // 1024, 'KB')


if __name__ == '__main__':
    main()
