# -*- coding: utf-8 -*-
"""build_art.py — ghép atlas sprite cho Ghế Nóng.

    python _tools/build_art.py

Nguồn (NGOÀI git, không commit):
    D:\\HoloCureAssets\\GameSprites\\spr_<Tên>_idle\\   — nhân vật và quái, mỗi thư mục là một
                                                          hoạt ảnh đứng yên 2–4 khung
    ~\\Downloads\\sk-ref\\sprites\\                      — hiệu ứng kỹ năng của Soul Knight

Ra (CÓ commit):
    art/nguoi.png     chân dung huấn luyện viên và tuyển thủ, ô 64×64, 1 khung
    art/fx.png        hiệu ứng chiêu
    Tướng, lính, trụ, quái trong trận lấy của Teamfight Manager 2: xem build_tfm.py.
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
SKG = os.environ.get('SKROOT', os.path.expanduser('~/Downloads/sk-ref'))
SK = os.environ.get('SKREF', os.path.join(SKG, 'sprites'))
RA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')

def sorted_glob(d, mau):
    """tên tệp trong `d` khớp biểu thức `mau`, xếp theo số ở đuôi"""
    if not os.path.isdir(d):
        return []
    p = re.compile(mau)
    fs = [f for f in os.listdir(d) if p.match(f)]
    fs.sort(key=lambda f: int(re.findall(r'(\d+)\.png$', f)[0]) if re.findall(r'(\d+)\.png$', f) else 0)
    return fs


O = 64          # ô atlas
KHUNG = 4       # số khung mỗi hoạt ảnh (thiếu thì lặp lại khung cuối)

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

# ── hiệu ứng: (khoá, thư mục, danh sách tệp theo thứ tự khung) ──
#    Mỗi CHIÊU của mỗi tướng phải nhìn ra được là chiêu nào (yêu cầu của chủ dự án), mà
#    bốn mươi chiêu thì không thể bốn mươi bộ sprite. Cách giải: mười bốn HÌNH DÁNG gốc ở
#    đây, rồi js/fx-chieu.js ghép dáng + màu + kiểu bày (vòng / tia / mưa / xích / lao) cho
#    từng chiêu. Mười dòng đầu là bản cũ, giữ nguyên khoá để không vỡ chỗ nào đang gọi.
FX = [
    ('chem', SK, ['effect_axe_%d.png' % i for i in range(6)]),   # lưỡi trăng lam, mở sang trái
    ('vuot', SK, ['bullet_eye_%d.png' % i for i in range(5)]),
    ('set',  SK, sorted_glob(SK, r'^doctor_thunder_anim_\d+\.png$')),
    ('no',   SK, sorted_glob(SK, r'^arcane_explode_s10_\d+\.png$')),
    ('chan', SK, sorted_glob(SK, r'^doctor_6_shield_2_\d+\.png$')),
    ('hoi',  SK, ['effect_healing.png']),
    ('dam',  SK, ['effect_2_%d.png' % i for i in range(5)]),
    ('sao',  SK, ['effect_0_%d.png' % i for i in range(4)]),
    ('loc',  SK, ['bullet_druid_s8_0_%d.png' % i for i in range(6)]),
    ('lua',  SK, ['effect08_seperated_%d.png' % i for i in range(3)]),
    # ── bổ sung cho hiệu ứng chiêu ──
    ('chemvang', SK, ['effect_slash_yellow_%d.png' % i for i in range(4)]),
    ('chemdo',   SK, ['effect_slash_04_%d.png' % i for i in range(4)]),
    ('dam_xuyen',SK, ['effect_stab_07_%d.png' % i for i in range(8)]),   # cú THỌC — giáo, lao
    ('cat',      SK, ['effect_cut_%d.png' % i for i in range(5)]),
    ('kiemkhi',  SK, ['effect_sword_%d.png' % i for i in range(6)]),
    ('bang',     SK, ['effect_ice_glacier_%d.png' % i for i in range(3)]),
    ('gaibang',  SK, ['effect_sting_ice_%d.png' % i for i in range(3)]),
    ('caulua',   SK, ['effect_fireball_%d.png' % i for i in range(4)]),
    ('nolon',    SK, ['effect_explode_%d.png' % i for i in range(8)]),
    ('noluc',    SK, ['effect_explode_green_%d.png' % i for i in range(8)]),
    ('nolam',    SK, ['effect_explode_cyan_%d.png' % i for i in range(8)]),
    ('dien',     SK, ['effect_shock_yellow_%d.png' % i for i in range(8)]),
    ('xung',     SK, ['effect_pulse_%d.png' % i for i in range(8)]),
    ('gio',      SK, ['effect_feng_%d.png' % i for i in range(8)]),
    ('saoroi',   SK, ['effect_star_2_%d.png' % i for i in range(8)]),
    ('notnhac',  SK, ['effect_dead_note_%d.png' % i for i in range(6)]),
]

# ── ĐẠN: mỗi loại một cột, MỘT khung, đầu đạn CHĨA SANG PHẢI ──
#    veHieu() xoay ngữ cảnh theo hướng bay nên mọi viên phải vẽ sẵn chỉ sang phải.
#    Số thứ tư là góc xoay để đưa đầu đạn về hướng PHẢI (ảnh gốc có viên chĩa lên).
DAN = [
    ('thuong', SK, ['bullet2_69.png'], 0),
    ('ten',    SK, ['bullet403.png'], 0),
    ('phep',   SK, ['bullet_laser_light2.png'], 0),
    ('bang',   SK, ['bullet2_5.png'], -90),
    ('doc',    SK, ['bullet2_68.png'], -90),
    ('tia',    SK, ['bullet_laser_light_1.png'], 0),
]

# ── 20 TRANG BỊ: đúng thứ tự G.TRANGBI trong js/data-trangbi.js ──
#    Món dài mà mảnh (kiếm, trượng) dán ngang thì chỉ chiếm một dải giữa ô, nhìn như
#    cọng tăm. Số thứ ba là GÓC XOAY: xoay chéo 45° cho lưỡi kiếm chạy hết đường chéo ô.
DO = [
    ('luoi1', 'weapons2_27.png', 45),   ('luoi2', 'weapons3_32.png', 45),
    ('luoi3', 'weapons5_25.png', 45),   ('luoi4', 'weapons4_27.png', 45),
    ('gio1',  'weapons2_57.png', 45),   ('gio2',  'weapons2_108.png', 0),
    ('gio3',  'weapons5_24.png', 0),    ('gio4',  'weapons4_87.png', 0),
    ('thep1', 'weapons2_40.png', 0),    ('thep2', 'weapons2_38.png', 0),
    ('thep3', 'weapons5_45.png', 0),    ('thep4', 'weapons2_113.png', 0),
    ('lua1',  'weapons3_26.png', 0),    ('lua2',  'weapons5_34.png', 0),
    ('lua3',  'weapons5_19.png', 0),    ('lua4',  'weapons5_23.png', 0),
    ('ngoc1', 'weapons5_41.png', 0),    ('ngoc2', 'weapons5_48.png', 0),
    ('ngoc3', 'weapons4_16.png', 45),   ('ngoc4', 'weapons5_17.png', 0),
]


def khung_cua(ten):
    d = os.path.join(HC, 'spr_%s_idle' % ten)
    if not os.path.isdir(d):
        return []
    fs = [f for f in os.listdir(d) if f.endswith('.png')]
    fs.sort(key=lambda f: int(re.findall(r'(\d+)\.png$', f)[0]) if re.findall(r'(\d+)\.png$', f) else 0)
    return [os.path.join(d, f) for f in fs]


def dat(im, anh, cot, hang, k=None):
    """canh ĐÁY-GIỮA trong ô. `k` là hệ số phóng ép; để None thì chỉ THU cho vừa ô."""
    w, h = anh.size
    if k is None:
        k = min((O - 6) / float(max(w, 1)), (O - 6) / float(max(h, 1)))
        if k > 1:
            k = 1
    if k != 1:
        anh = anh.resize((max(1, int(round(w * k))), max(1, int(round(h * k)))), Image.NEAREST)
    x = cot * O + (O - anh.width) // 2
    y = hang * O + (O - 3 - anh.height)
    im.alpha_composite(anh, (x, y))


def he_phong(anhs):
    """Một hệ số phóng CHUNG cho cả bộ khung, tính từ khung to nhất.
    Phải chung: mỗi khung tự co giãn theo cỡ của riêng nó thì con vật phình ra thu vào
    theo nhịp hoạt ảnh. Phóng theo bội số nguyên để giữ nét pixel."""
    w = max([a.width for a in anhs] + [1])
    h = max([a.height for a in anhs] + [1])
    k = min((O - 6) / float(w), (O - 6) / float(h))
    if k <= 1:
        return k
    # Phóng bội số nguyên cho nét, NHƯNG chỉ khi bội số ấy từ 2 trở lên. Ép int() lúc
    # k = 1.9 thì con đó đứng nguyên cỡ cũ, đứng cạnh con được phóng 3× là lệch hẳn —
    # hai con lính hai bên đường mà to nhỏ khác nhau thì nhìn là biết lỗi.
    return float(int(k)) if k >= 2 else k


def mep_tren(im, cot, hang):
    """Phần trăm chiều cao ô mà mép trên sprite bỏ trống, tính trên KHUNG CAO NHẤT.

    Sprite canh đáy-giữa nên nửa trên ô thường trống. Phía DOM cần biết con số này để
    cắt đúng dải có người rồi phóng cho đầy thẻ — không có nó thì phải đoán một con số
    chung, mà đoán thì hoặc người bé tí nằm dưới đáy, hoặc bị cụt đầu."""
    tren = O
    for h in range(hang):
        o = im.crop((cot * O, h * O, cot * O + O, h * O + O))
        bb = o.getbbox()
        if bb:
            tren = min(tren, bb[1])
    return round(max(0, min(O - 8, tren)) / float(O), 3)


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
        ban_do[khoa] = [i, min(len(fs), KHUNG) if nhieu_khung else 1, mep_tren(im, i, hang)]
    im.save(os.path.join(RA, ten_ra))
    return ban_do, thieu


def dat_giua(im, anh, cot, hang, le=4):
    """canh GIỮA ô và PHÓNG CHO ĐẦY — dùng cho icon (trang bị, đạn), thứ không có mặt đất
    để mà đứng lên. Icon gốc chỉ 10–24px nên phải phóng lên, và phóng theo bội số nguyên
    để giữ nét pixel; chỉ khi bội số nguyên không vừa mới chịu phóng lẻ."""
    w, h = anh.size
    if w < 1 or h < 1:
        return
    k = (O - le * 2) / float(max(w, h))
    if k >= 2:
        k = int(k)                               # phóng bội số nguyên → không nhoè
    # 1 < k < 2 thì KHÔNG được làm tròn xuống: int(1.7) == 1 nghĩa là không phóng gì cả,
    # và cây kiếm dài-mảnh nằm lọt thỏm giữa ô 64 trông như cọng tăm. Đúng cái bẫy đã sập
    # một lần ở he_phong() với con cung thủ orc — ghi lại ở RESEARCH §5.3.
    anh = anh.resize((max(1, int(round(w * k))), max(1, int(round(h * k)))), Image.NEAREST)
    im.alpha_composite(anh, (cot * O + (O - anh.width) // 2,
                             hang * O + (O - anh.height) // 2))


def lam_tep(ds, ten_ra, giua=False, le=4, phong=False):
    """Ghép atlas từ DANH SÁCH TỆP CỤ THỂ: ds = [(khoá, thư-mục, [tệp theo khung])].
    Cột = khoá, hàng = khung. `phong` thì phóng cho gần đầy ô — sprite gốc của Soul
    Knight chỉ 18–22px, dán nguyên cỡ vào ô 64 thì trong trận con lính bé như hạt gạo."""
    thieu = []
    cao = max([1] + [len(x[2]) for x in ds])
    im = Image.new('RGBA', (O * len(ds), O * cao), (0, 0, 0, 0))
    ban_do = {}
    for i, x in enumerate(ds):
        khoa, d, ts = x[0], x[1], x[2]
        co = [os.path.join(d, t) for t in ts if os.path.isfile(os.path.join(d, t))]
        if not co:
            thieu.append((khoa, os.path.join(d, ts[0] if ts else '?')))
            continue
        anhs = [Image.open(f).convert('RGBA') for f in co]
        goc = x[3] if len(x) > 3 else 0
        if goc:
            anhs = [a.resize((a.width * 4, a.height * 4), Image.NEAREST)
                     .rotate(goc, resample=Image.BILINEAR, expand=True) for a in anhs]
        k = he_phong(anhs) if phong else None
        for h, a in enumerate(anhs):
            if giua:
                dat_giua(im, a, i, h, le)
            else:
                dat(im, a, i, h, k)
        ban_do[khoa] = [i, len(co)]
    im.save(os.path.join(RA, ten_ra))
    return ban_do, thieu


def lam_nen_ca():
    """NỀN PHÒNG TẬP cho màn huấn luyện — art thật, không phải gradient vẽ tay.

    Nguồn: `all/hero_room/hall/skin_0/room_bg.png` của Soul Knight — đúng dáng cần: nhìn
    NGANG, tường sau có cửa sổ / đèn / tranh, dưới là sàn gỗ. Bản gốc là quán trọ tối
    màu; ở đây làm sáng lên và giảm bão hoà để nằm cùng bảng màu Uma (kem, hồng phấn).
    Ghép lại thành 1280 rộng: dải TƯỜNG kéo ngang ở trên, dải SÀN kéo ngang ở dưới —
    phóng cả tấm thì tường mỏng dính mà sàn thì méo.
    """
    f = os.path.join(SKG, 'all', 'hero_room', 'hall', 'skin_0', 'room_bg.png')
    if not os.path.isfile(f):
        return False, f
    import colorsys
    src = Image.open(f).convert('RGBA')
    px = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s2, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            r2, g2, b2 = colorsys.hsv_to_rgb(h, min(1.0, s2 * 0.60), min(1.0, 0.45 + 0.55 * v))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)

    W, CAO_TUONG, CAO_SAN = 1280, 275, 375
    tuong = src.crop((0, 0, src.width, 152)).resize((W, CAO_TUONG), Image.NEAREST)
    san = src.crop((0, 156, src.width, src.height)).resize((W, CAO_SAN), Image.NEAREST)
    ra = Image.new('RGBA', (W, CAO_TUONG + CAO_SAN), (0, 0, 0, 0))
    ra.alpha_composite(tuong, (0, 0))
    ra.alpha_composite(san, (0, CAO_TUONG))

    # Mờ dần MÉP TRÊN ngay trong ảnh. Làm bằng gradient CSS phủ lên thì vẫn thấy một
    # đường cắt ngang (thứ tự vẽ của ::before/::after không chắc phủ hết), còn ramp alpha
    # ở đây thì chắc chắn: ảnh tự tan vào nền, không cần lớp phủ nào.
    MO = 110
    px2 = ra.load()
    for y in range(MO):
        k = y / float(MO)
        for x in range(W):
            r, g, b, a = px2[x, y]
            if a:
                px2[x, y] = (r, g, b, int(a * k))
    ra.save(os.path.join(RA, 'nen-ca.png'))
    return True, None


def lam_do():
    """20 icon trang bị — mọi tệp nằm thẳng trong SK, mỗi món một khung, xoay theo bảng."""
    thieu = []
    im = Image.new('RGBA', (O * len(DO), O), (0, 0, 0, 0))
    ban_do = {}
    for i, (khoa, ten, goc) in enumerate(DO):
        f = os.path.join(SK, ten)
        if not os.path.isfile(f):
            thieu.append((khoa, f))
            continue
        a = Image.open(f).convert('RGBA')
        if goc:
            # phóng trước rồi mới xoay: xoay ảnh 10px bằng NEAREST thì răng cưa ăn mất
            # nửa lưỡi kiếm, phóng lên 4 lần trước thì đường chéo còn mượt.
            a = a.resize((a.width * 4, a.height * 4), Image.NEAREST)
            a = a.rotate(goc, resample=Image.BILINEAR, expand=True)
        dat_giua(im, a, i, 0, 6)
        ban_do[khoa] = [i, 1]
    im.save(os.path.join(RA, 'do.png'))
    return ban_do, thieu


def main():
    if not os.path.isdir(RA):
        os.makedirs(RA)
    if not os.path.isdir(HC):
        print('KHONG THAY kho HoloCure o', HC)
        print('Dat bien moi truong HOLOCURE tro toi thu muc GameSprites.')
        return 1

    bd = {}
    n1, thieu_n1 = lam_bang(HLV + TT, 'nguoi.png', False)
    bd['nguoi'] = n1
    fx, thieu_fx = lam_tep(FX, 'fx.png', giua=True, le=0)
    bd['fx'] = fx
    dn, thieu_dn = lam_tep(DAN, 'dan.png', giua=True, le=10)
    bd['dan'] = dn
    dd, thieu_dd = lam_do()
    bd['do'] = dd
    nen_ok, nen_thieu = lam_nen_ca()
    bd['_o'] = O
    bd['_khung'] = KHUNG

    js = json.dumps(bd, ensure_ascii=False, indent=1)
    io.open(os.path.join(RA, 'asset-map.json'), 'w', encoding='utf-8').write(js)
    # Ban .js de nap bang the <script>: trinh duyet CHAN fetch() tep cuc bo duoi file://,
    # nen khong the doc thang ban .json khi mo game bang cach nhan dup index.html.
    io.open(os.path.join(RA, 'asset-map.js'), 'w', encoding='utf-8').write(
        '/* SINH TU DONG bang _tools/build_art.py - dung sua tay */' + chr(10) +
        'window.ART_MAP = ' + js + ';' + chr(10))

    print('nguoi  :', len(n1), '/', len(HLV) + len(TT))
    print('fx     :', len(fx), '/', len(FX))
    print('dan    :', len(dn), '/', len(DAN))
    print('do     :', len(dd), '/', len(DO))
    print('nen-ca :', 'ok' if nen_ok else 'THIEU ' + str(nen_thieu))
    for nhan, ds in (('nguoi', thieu_n1), ('fx', thieu_fx), ('dan', thieu_dn), ('do', thieu_dd)):
        for x in ds:
            print('  THIEU', nhan, x[0], '<-', x[1])
    return 0


if __name__ == '__main__':
    sys.exit(main())
