# -*- coding: utf-8 -*-
# Dựng hai tấm hình cho bẫy + rương + mimic, cắt từ kho Soul Knight đã bóc ở ~/Downloads/sk-ref.
#
# KHO ẤY NGOÀI GIT. Chạy tệp này sinh ra hai tấm trong repo; tấm nguồn thì không bao giờ vào.
#
# BẢN NÀY LẤY ĐỦ KHUNG ANIM, không còn dựng chuyển động bằng cách cắt xén một khung tĩnh:
#   gai   — Thorn_0..7 (level__2__g), 8 khung thật, tấm sắt thụt vào nhả ra
#   hộp   — ElectricBox_0 (im) + _4.._9 (6 khung tia điện nhảy)
#   tia   — mythic_12_laser_beam_0..3, 4 khung, XOAY NGANG và NHUỘM ĐỎ lúc dựng
#   rương — chest_anim_4, và khung mở dựng từ chính nó
#   mimic — chest_monster1_*, xếp thành charset 288x576
import os, glob, sys
from PIL import Image

R = os.path.expanduser('~/Downloads/sk-ref/tilemap/sprites')
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ITEM = 96                       # cạnh một ô trong dải đồ vật, đúng bằng ITEM trong sprites.js
FW, FH = 96, 144                # một khung charset quái
COLS, ROWS = 3, 4

def sp(ten):
    fs = glob.glob(os.path.join(R, '*', ten + '.png'))
    if not fs:
        print('KHONG CO', ten); sys.exit(1)
    return Image.open(fs[0]).convert('RGBA')

def cat(im):
    """Cắt sát viền trong suốt."""
    bb = im.getbbox()
    return im.crop(bb) if bb else im

def vao_o(nen, im, ox, oy, cao, day=1.0):
    """Đặt `im` vào ô (ox,oy) cỡ ITEM, phóng theo NEAREST sao cho cao = `cao` điểm ảnh,
       chân chạm dòng `day`*ITEM."""
    im = cat(im)
    k = cao / im.height
    w = max(1, int(round(im.width * k)))
    h = max(1, int(round(im.height * k)))
    b = im.resize((w, h), Image.NEAREST)
    nen.alpha_composite(b, (ox + (ITEM - w)//2, oy + int(round(day*ITEM)) - h))

def do_hoa(im):
    """Tím → đỏ, giữ nguyên lõi trắng và kênh trong suốt.
       Tia của Soul Knight có bốn khung ANIM thật nhưng chỉ có màu tím (mythic_12); bộ rgb_laser
       thì có đỏ nhưng bảy tấm ấy là bảy MÀU, không phải bảy khung. Đổi màu lúc dựng là cách duy
       nhất được cả hai: chuyển động thật, và màu đỏ đọc ra là 'đừng chạm vào'."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Gần trắng thì để yên — đó là lõi tia, và lõi tia mọi màu đều trắng.
            if min(r, g, b) > 200:
                continue
            px[x, y] = (max(r, b), int(g*0.30), int(b*0.24), a)
    return im

# ============================================================ 1. DẢI BẪY + RƯƠNG
# Thứ tự ô là HỢP ĐỒNG BA BÊN với BAY_O trong game.js và hàm bay() trong sprites.js:
#    0.. 7  gai: thụt hết → nhả hết (Thorn_7 ... Thorn_0)
#    8      hộp laser lúc tắt
#    9..14  hộp laser lúc bật, sáu khung tia điện
#   15      rương đóng
#   16      rương mở
#   17..20  thanh tia, bốn khung, đã xoay ngang và căng đầy ô
SO_O = 21
dai = Image.new('RGBA', (ITEM*SO_O, ITEM), (0, 0, 0, 0))

# --- gai: Thorn_7 là tấm đóng kín, Thorn_0 là gai nhả hết. Xếp ngược lại cho thành một dải
#     "càng về sau càng nhả ra", vì mọi chỗ đọc nó đều nghĩ theo chiều ấy.
for i, k in enumerate([7, 6, 5, 4, 3, 2, 1, 0]):
    o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
    # KHÔNG cắt sát viền từng khung: tám khung cao thấp khác nhau, cắt rồi căn đáy thì cái tấm
    # sắt nhảy lên nhảy xuống trong lúc gai mọc. Giữ nguyên khung gốc 16x19 cho cả tám.
    im = sp('Thorn_%d' % k)
    kk = (ITEM*0.62) / im.height
    w = max(1, int(round(im.width*kk))); h = max(1, int(round(im.height*kk)))
    b = im.resize((w, h), Image.NEAREST)
    o.alpha_composite(b, ((ITEM - w)//2, int(ITEM*0.88) - h))
    dai.alpha_composite(o, (ITEM*i, 0))

# --- hộp laser: cắt LẤY MỘT TỦ bên trái của ElectricBox (khung gốc 53 rộng chứa hai tủ).
#     Khung 0 là lúc im; 4..9 là sáu nhịp tia điện nhảy giữa hai trụ.
for i, ten in enumerate(['ElectricBox_0', 'ElectricBox_4', 'ElectricBox_5', 'ElectricBox_6',
                         'ElectricBox_7', 'ElectricBox_8', 'ElectricBox_9']):
    im = sp(ten)
    tu = im.crop((0, 0, 21, im.height))
    o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
    # Cũng KHÔNG cắt sát viền: sáu khung có tia điện thò ra cao thấp khác nhau, cắt rồi căn đáy
    # là cái tủ tự nhảy lên nhảy xuống theo tia điện.
    kk = (ITEM*0.86) / im.height
    w = max(1, int(round(tu.width*kk))); h = max(1, int(round(tu.height*kk)))
    b = tu.resize((w, h), Image.NEAREST)
    o.alpha_composite(b, ((ITEM - w)//2, int(ITEM*0.96) - h))
    dai.alpha_composite(o, (ITEM*(8+i), 0))

# --- rương: đóng, và mở.
# Bộ chest_anim KHÔNG CÓ khung mở — bảy khung nâu là bảy nhịp le lói của cái khoá, bảy khung
# xanh là cùng thế ở một màu khác. Nên khung "mở" dựng từ chính khung đóng: cắt lấy cái NẮP
# (chín dòng trên), ép dẹt rồi đẩy lên trên, và khoét một vũng tối trong lòng thân.
# Làm thế thì cái rương mở và cái rương đóng chắc chắn là CÙNG một vật — mà đó là cả trò chơi
# ở đây: người chơi phải không phân biệt nổi cái nào nuốt mình.
ruong = cat(sp('chest_anim_4'))
o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
vao_o(o, ruong, 0, 0, int(ITEM*0.66), 0.90)
dai.alpha_composite(o, (ITEM*15, 0))

nap = ruong.crop((0, 0, ruong.width, 9))
than = ruong.crop((0, 9, ruong.width, ruong.height))
mo = Image.new('RGBA', (ruong.width, ruong.height + 4), (0, 0, 0, 0))
mo.alpha_composite(than, (0, 13))
toi = Image.new('RGBA', (ruong.width - 4, 5), (14, 9, 7, 235))
mo.alpha_composite(toi, (2, 11))
mo.alpha_composite(nap.resize((ruong.width, 5), Image.NEAREST), (0, 4))
o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
vao_o(o, mo, 0, 0, int(ITEM*0.74), 0.90)
dai.alpha_composite(o, (ITEM*16, 0))

# --- thanh tia: bốn khung, xoay ngang, nhuộm đỏ, CĂNG ĐẦY Ô.
# Căng đầy là cố ý: lúc vẽ, ô này bị kéo thành hộp (dài tia × bề dày tia), nên mọi điểm ảnh
# trống trong ô đều biến thành lề thừa hai đầu tia.
for i in range(4):
    im = cat(sp('mythic_12_laser_beam_%d' % i))
    im = im.transpose(Image.ROTATE_90)          # dài nằm theo trục X
    # CẮT BỎ HAI ĐẦU. Tia gốc là một đoạn có hai đầu TÁN dần về trong suốt — đẹp khi nó dài đúng
    # 88px như trong game gốc, nhưng ở đây nó bị kéo ra cả sáu ô, và lúc ấy hai đầu tán ấy thành
    # hai quãng mờ dài cả ô rưỡi: tia trông như không chạm tới hai cây cột, mà tia này thì đốt
    # người ở đúng hai đầu ấy.
    # Cắt theo ĐỘ SÁNG ĐO ĐƯỢC chứ không theo một tỉ lệ gõ tay: bốn khung có chỗ sáng nằm lệch
    # khác nhau, cắt cứng 20–80% thì khung nào cũng dính một quãng tối ở đầu trái.
    px = im.load()
    cot = []
    for x in range(im.width):
        s2 = 0
        for y in range(im.height):
            r, g, b, a = px[x, y]
            s2 = max(s2, (r+g+b)//3 * a // 255)
        cot.append(s2)
    # Rồi LẤY ĐÚNG MỘT CỘT — cột sáng nhất — và trải nó ra cả ô.
    # Vì sao không cắt lấy một đoạn: trong một khung, độ sáng dọc theo tia không đều (tia gốc
    # nhấp nháy theo chiều dài), nên kéo một đoạn ra sáu ô thì mấy chỗ tối thành mấy khúc tia bị
    # đứt — mà tia này đốt người trên CẢ chiều dài, nên một khúc trông như tắt là một lời nói dối.
    # Bốn khung vẫn là bốn khung THẬT và vẫn khác nhau: mỗi khung có lõi dày mỏng, sáng tối riêng
    # — đó là nhịp đập của tia, chỉ bỏ đi cái nhấp nháy DỌC THEO chiều dài.
    best = cot.index(max(cot))
    lat = im.crop((best, 0, best+1, im.height)).resize((im.width, im.height), Image.NEAREST)
    im = lat
    im = do_hoa(im.resize((ITEM, ITEM), Image.NEAREST))
    dai.alpha_composite(im, (ITEM*(17+i), 0))

dai.save(os.path.join(ART, 'item', 'bay.png'))
print('bay.png', dai.size, SO_O, 'ô')

# ============================================================ 2. CHARSET CON MIMIC
# Khuôn 288x576 = 3 cột (chân trái · đứng · chân phải) x 4 hàng (xuống · trái · phải · lên).
# Cái rương thì KHÔNG CÓ LƯNG: bốn hàng dùng chung ba khung nhảy, chỉ hàng trái/phải lật ngang.
# Đó là câu đúng về mặt hình chứ không phải chỗ làm ẩu — một cái hộp nhìn từ sau vẫn là cái hộp.
KHUNG = ['chest_monster1_2', 'chest_monster1_0', 'chest_monster1_6']   # trái · đứng · phải
tam = Image.new('RGBA', (FW*COLS, FH*ROWS), (0, 0, 0, 0))
for hang in range(ROWS):
    for cot in range(COLS):
        im = cat(sp(KHUNG[cot]))
        if hang == 1:                     # nhìn sang TRÁI
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        # cao ~112 trong ô 144, chân chạm dòng y=138 — đúng luật ở art/README.md
        k = 112 / im.height
        w = max(1, int(round(im.width*k))); h = max(1, int(round(im.height*k)))
        b = im.resize((w, h), Image.NEAREST)
        tam.alpha_composite(b, (FW*cot + (FW-w)//2, FH*hang + 138 - h))
tam.save(os.path.join(ART, 'foe', 'mimic.png'))
print('mimic.png', tam.size)
