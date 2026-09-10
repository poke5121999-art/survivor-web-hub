# -*- coding: utf-8 -*-
"""build_art.py — ghép atlas sprite cho Ghế Nóng.

    python _tools/build_art.py

Nguồn (NGOÀI git, không commit):
    D:\\HoloCureAssets\\GameSprites\\spr_<Tên>_idle\\   — nhân vật và quái, mỗi thư mục là một
                                                          hoạt ảnh đứng yên 2–4 khung
    ~\\Downloads\\sk-ref\\sprites\\                      — hiệu ứng kỹ năng của Soul Knight

Ra (CÓ commit):
    art/tuong.png     20 tướng × 4 khung, ô 64×64, canh ĐÁY-GIỮA
    art/nguoi.png     chân dung huấn luyện viên và tuyển thủ, ô 64×64, 1 khung
    art/quai.png      quái rừng, Rồng, Chúa Hang
    art/fx.png        hiệu ứng chiêu
    art/asset-map.json  bảng tra: khoá → [cột, số khung]

LUẬT (giống games/dragonproj): trong code KHÔNG có tên tệp ảnh nào, chỉ có khoá kiểu
'tuong.kiemsi'. Đổi art = thay PNG + sửa asset-map.json, KHÔNG đụng code. Thiếu ảnh thì
phần vẽ tự rơi về hình học cũ chứ không vỡ.

Canh ĐÁY-GIỮA chứ không canh tâm: nhân vật cao thấp khác nhau, canh tâm thì lúc đổi khung
chân nó nhảy lên nhảy xuống.
"""
import io, json, os, re, sys

try:
    from PIL import Image
except ImportError:
    print('Can Pillow: python -m pip install pillow')
    sys.exit(1)

HC = os.environ.get('HOLOCURE', 'D:/HoloCureAssets/GameSprites')
SK = os.environ.get('SKREF', os.path.expanduser('~/Downloads/sk-ref/sprites'))
RA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')

O = 64          # ô atlas
KHUNG = 4       # số khung mỗi hoạt ảnh (thiếu thì lặp lại khung cuối)

# ── 20 tướng: chọn nhân vật hợp vai ─────────────────────────────────────────
TUONG = [
    ('kiemsi',    'Ayame'),            # cầm kiếm
    ('cuongchien','Noel'),             # hiệp sĩ giáp nặng
    ('phaco',     'Goriela'),          # to con, chuyên đập
    ('thanhkiem', 'Flare'),
    ('kynhan',    'Gura'),             # cầm đinh ba, lao tới
    ('gaosu',     'Mio'),              # thú
    ('bongma',    'Ollie'),            # ma
    ('thoisan',   'Kaela'),
    ('phaposu',   'Ina'),              # phép
    ('phapset',   'Kroni'),
    ('bongdem',   'Fubuki_Kurokami'),  # bản tóc đen
    ('tuchien',   'Calli'),            # cầm liềm
    ('xathu',     'Ame'),              # cầm súng
    ('sungtruong','Roboco'),
    ('nodoc',     'Anya'),
    ('bomxich',   'Bae'),
    ('hiepsi',    'Kiara'),
    ('thaythuoc', 'Choco'),            # bác sĩ
    ('khienhon',  'Sana'),
    ('nhacsi',    'Suisei'),           # ca sĩ
]

# ── chân dung: huấn luyện viên và tuyển thủ ────────────────────────────────
HLV = [
    ('hlv_lua', 'Kiara'), ('hlv_thep', 'Kanata'), ('hlv_mat', 'Ina'), ('hlv_vang', 'Sora'),
    ('hlv_tan', 'Marine'), ('hlv_nhip', 'Subaru'), ('hlv_nha', 'Noel'), ('hlv_vi', 'Mumei'),
    ('hlv_quan', 'Okayu'), ('hlv_dai', 'Watame'), ('hlv_tre', 'Kobo'), ('hlv_cu', 'Coco'),
    ('hlv_may', 'Moona'), ('hlv_ly', 'Aqua'), ('hlv_vui', 'Matsuri'),
]
TT = [
    ('tt_bao', 'Pekora'), ('tt_nui', 'Miko'), ('tt_lua', 'Aki'), ('tt_thep', 'Towa'),
    ('tt_oc', 'Shion'), ('tt_gio', 'Korone'), ('tt_dan', 'Luna'), ('tt_song', 'Reine'),
    ('tt_kien', 'Mel'), ('tt_minh', 'Iofi'), ('tt_hai', 'Risu'), ('tt_phong', 'Haato'),
    ('tt_an', 'Fauna'), ('tt_khanh', 'AZKi'), ('tt_duy', 'Zeta'), ('tt_tam', 'Irys'),
    ('tt_nam', 'Fubuki'), ('tt_long', 'Bae'), ('tt_son', 'Mio'), ('tt_vy', 'Anya'),
    ('tt_hung', 'Ollie'), ('tt_thu', 'Moona'), ('tt_dat', 'Kobo'), ('tt_lam', 'Sana'),
]

QUAI = [('bai', 'Beetle'), ('rong', 'Dog'), ('chua', 'Monkey'),
        ('linh_can', 'Bunny'), ('linh_xa', 'Cat'), ('penguin', 'Penguin')]

# ── hiệu ứng chiêu, lấy của Soul Knight ────────────────────────────────────
FX = [
    ('chem',   r'^assassin_20_init_weapon_bullet_\d+\.png$'),
    ('set',    r'^doctor_thunder_anim_\d+\.png$'),
    ('no',     r'^arcane_explode_s10_\d+\.png$'),
    ('chan',   r'^doctor_6_shield_2_\d+\.png$'),
    ('hoi',    r'^effect_healing\.png$'),
]


def khung_cua(ten):
    d = os.path.join(HC, 'spr_%s_idle' % ten)
    if not os.path.isdir(d):
        return []
    fs = [f for f in os.listdir(d) if f.endswith('.png')]
    fs.sort(key=lambda f: int(re.findall(r'(\d+)\.png$', f)[0]) if re.findall(r'(\d+)\.png$', f) else 0)
    return [os.path.join(d, f) for f in fs]


def dat(im, anh, cot, hang):
    """canh ĐÁY-GIỮA trong ô"""
    w, h = anh.size
    k = min((O - 6) / float(max(w, 1)), (O - 6) / float(max(h, 1)))
    if k < 1:
        anh = anh.resize((max(1, int(w * k)), max(1, int(h * k))), Image.NEAREST)
    x = cot * O + (O - anh.width) // 2
    y = hang * O + (O - 3 - anh.height)
    im.alpha_composite(anh, (x, y))


def lam_bang(ds, ten_ra, nhieu_khung):
    thieu = []
    hang = KHUNG if nhieu_khung else 1
    im = Image.new('RGBA', (O * len(ds), O * hang), (0, 0, 0, 0))
    ban_do = {}
    for i, (khoa, ten) in enumerate(ds):
        fs = khung_cua(ten)
        if not fs:
            thieu.append((khoa, ten))
            continue
        for h in range(hang):
            f = fs[min(h, len(fs) - 1)]
            dat(im, Image.open(f).convert('RGBA'), i, h)
        ban_do[khoa] = [i, min(len(fs), KHUNG) if nhieu_khung else 1]
    im.save(os.path.join(RA, ten_ra))
    return ban_do, thieu


def lam_fx():
    im = Image.new('RGBA', (O * 6, O * len(FX)), (0, 0, 0, 0))
    ban_do = {}
    if not os.path.isdir(SK):
        return ban_do, [('fx', SK)]
    ten_tep = os.listdir(SK)
    thieu = []
    for r, (khoa, mau) in enumerate(FX):
        p = re.compile(mau)
        fs = sorted(f for f in ten_tep if p.match(f))
        if not fs:
            thieu.append((khoa, mau))
            continue
        fs = fs[:6]
        for c, f in enumerate(fs):
            dat(im, Image.open(os.path.join(SK, f)).convert('RGBA'), c, r)
        ban_do[khoa] = [r, len(fs)]
    im.save(os.path.join(RA, 'fx.png'))
    return ban_do, thieu


def main():
    if not os.path.isdir(RA):
        os.makedirs(RA)
    if not os.path.isdir(HC):
        print('KHONG THAY kho HoloCure o', HC)
        print('Dat bien moi truong HOLOCURE tro toi thu muc GameSprites.')
        return 1

    bd = {}
    t, thieu_t = lam_bang(TUONG, 'tuong.png', True)
    bd['tuong'] = t
    n1, thieu_n1 = lam_bang(HLV + TT, 'nguoi.png', False)
    bd['nguoi'] = n1
    q, thieu_q = lam_bang(QUAI, 'quai.png', True)
    bd['quai'] = q
    fx, thieu_fx = lam_fx()
    bd['fx'] = fx
    bd['_o'] = O
    bd['_khung'] = KHUNG

    js = json.dumps(bd, ensure_ascii=False, indent=1)
    io.open(os.path.join(RA, 'asset-map.json'), 'w', encoding='utf-8').write(js)
    # Ban .js de nap bang the <script>: trinh duyet CHAN fetch() tep cuc bo duoi file://,
    # nen khong the doc thang ban .json khi mo game bang cach nhan dup index.html.
    io.open(os.path.join(RA, 'asset-map.js'), 'w', encoding='utf-8').write(
        '/* SINH TU DONG bang _tools/build_art.py - dung sua tay */' + chr(10) +
        'window.ART_MAP = ' + js + ';' + chr(10))

    print('tuong  :', len(t), '/', len(TUONG))
    print('nguoi  :', len(n1), '/', len(HLV) + len(TT))
    print('quai   :', len(q), '/', len(QUAI))
    print('fx     :', len(fx), '/', len(FX))
    for nhan, ds in (('tuong', thieu_t), ('nguoi', thieu_n1), ('quai', thieu_q), ('fx', thieu_fx)):
        for x in ds:
            print('  THIEU', nhan, x[0], '<-', x[1])
    return 0


if __name__ == '__main__':
    sys.exit(main())
