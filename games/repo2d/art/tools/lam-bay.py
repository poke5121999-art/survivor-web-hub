# -*- coding: utf-8 -*-
# Dựng hai tấm hình cho bẫy + rương + mimic, cắt từ kho Soul Knight đã bóc ở ~/Downloads/sk-ref.
#
# KHO ẤY NGOÀI GIT. Chạy tệp này sinh ra hai tấm trong repo; tấm nguồn thì không bao giờ vào.
import os, glob, sys
from PIL import Image

R = os.path.expanduser('~/Downloads/sk-ref/tilemap/sprites')
ART = 'D:/survivor-web-hub/games/repo2d/art'
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
    x = ox + (ITEM - w)//2
    y = oy + int(round(day*ITEM)) - h
    nen.alpha_composite(b, (x, y))

# ============================================================ 1. DẢI BẪY + RƯƠNG
# Bảy ô, thứ tự này là hợp đồng với BAY_O trong game.js — đổi thứ tự là đổi cả hai chỗ.
#   0 gai nằm im       1 gai nhú      2 gai bật hết
#   3 hộp laser tắt    4 hộp laser bật
#   5 rương đóng       6 rương mở
#   7 thanh tia — CĂNG ĐẦY Ô, không chừa lề. Cố ý: lúc vẽ, ô này bị kéo thành hộp
#     (dài tia × bề dày tia), nên mọi điểm ảnh trống trong ô đều biến thành lề thừa
#     hai đầu tia. Căng đầy thì kéo ra bao nhiêu cũng vẫn là đúng cái thanh ấy.
O = ['gai0', 'gai1', 'gai2', 'laser0', 'laser1', 'ruong0', 'ruong1', 'tia']
dai = Image.new('RGBA', (ITEM*len(O), ITEM), (0, 0, 0, 0))

# --- gai: tấm đá (sting_MMR_1) làm nền, ba mũi gai (sting_MMR_0) nhú dần lên trên nó
da  = cat(sp('sting_MMR_1'))
gai = cat(sp('sting_MMR_0'))
for i, ph in enumerate([0.0, 0.45, 1.0]):
    o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
    # tấm đá luôn nằm đó, chiếm 62% ô, chân ở 0,86
    vao_o(o, da, 0, 0, int(ITEM*0.50), 0.86)
    if ph > 0:
        # gai mọc LÊN từ mặt đá: cắt phần trên của hình gai theo tỉ lệ, dán sao cho gốc gai
        # đứng yên còn ngọn dâng lên.
        gh = int(round(gai.height * ph))
        if gh >= 2:
            m = gai.crop((0, gai.height - gh, gai.width, gai.height))
            k = (ITEM*0.46) / gai.height          # tỉ lệ tính theo hình ĐẦY ĐỦ
            w = max(1, int(round(m.width*k))); h = max(1, int(round(m.height*k)))
            b = m.resize((w, h), Image.NEAREST)
            o.alpha_composite(b, ((ITEM - w)//2, int(ITEM*0.70) - h))
    dai.alpha_composite(o, (ITEM*i, 0))

# --- hộp laser: cắt LẤY MỘT TỦ bên trái của ElectricBox, tắt (khung 0) và bật (khung 8)
for i, ten in enumerate(['ElectricBox_0', 'ElectricBox_8']):
    im = sp(ten)
    # khung gốc 53 rộng: tủ trái nằm trong 0..18
    tu = im.crop((0, 0, 19, im.height))
    o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
    vao_o(o, tu, 0, 0, int(ITEM*0.80), 0.94)
    dai.alpha_composite(o, (ITEM*(3+i), 0))

# --- rương: đóng, và mở.
# Bộ chest_anim KHÔNG CÓ khung mở — bảy khung nâu là bảy nhịp le lói của cái khoá, bảy khung
# xanh là cùng thế ở một màu khác. Nên khung "mở" dựng từ chính khung đóng: cắt lấy cái NẮP
# (chín dòng trên), ép dẹt còn 55% rồi đẩy lên trên, và khoét một vũng tối trong lòng thân.
# Làm thế thì cái rương mở và cái rương đóng chắc chắn là CÙNG một vật — mà đó là cả trò chơi
# ở đây: người chơi phải không phân biệt nổi cái nào nuốt mình.
ruong = cat(sp('chest_anim_4'))
o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
vao_o(o, ruong, 0, 0, int(ITEM*0.66), 0.90)
dai.alpha_composite(o, (ITEM*5, 0))

nap = ruong.crop((0, 0, ruong.width, 9))
than = ruong.crop((0, 9, ruong.width, ruong.height))
mo = Image.new('RGBA', (ruong.width, ruong.height + 4), (0, 0, 0, 0))
mo.alpha_composite(than, (0, 13))
# vũng tối trong lòng: kẻ mấy dòng ngang sát mép trên của thân
toi = Image.new('RGBA', (ruong.width - 4, 5), (14, 9, 7, 235))
mo.alpha_composite(toi, (2, 11))
mo.alpha_composite(nap.resize((ruong.width, 5), Image.NEAREST), (0, 4))
o = Image.new('RGBA', (ITEM, ITEM), (0, 0, 0, 0))
vao_o(o, mo, 0, 0, int(ITEM*0.74), 0.90)
dai.alpha_composite(o, (ITEM*6, 0))

# --- thanh tia: rgb_laser_0 (đỏ) kéo căng cả ô
tia = cat(sp('rgb_laser_0')).resize((ITEM, ITEM), Image.NEAREST)
dai.alpha_composite(tia, (ITEM*7, 0))

dai.save(os.path.join(ART, 'item', 'bay.png'))
print('bay.png', dai.size, len(O), 'ô')

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
