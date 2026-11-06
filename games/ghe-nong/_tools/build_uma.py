"""build_uma.py — dựng atlas giao diện ngoài trận từ ảnh Uma Musume đã bóc.

Nguồn: D:/uma-ref/img/atlas/<atlas>/utx_*.png, bóc bằng rip_uma_img.py (RESEARCH §12).
Mỗi sprite co về cạnh dài nhất CO_TOI_DA điểm ảnh (đủ nét cho cỡ hiện 24–64 px trên màn 2×),
xếp kệ vào art/uma/ui.png; bảng art/uma/ui.js: window.UMA_UI = {khoá: [x, y, w, h], _co: [W, H]}.
Chạy: python _tools/build_uma.py
"""
import io
import json
import os
import sys

from PIL import Image

UMA = os.environ.get('UMAREF', r"D:/uma-ref")
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'uma')
CO_TOI_DA = 96

# khoá trong game → (atlas, tên sprite không kèm tiền tố utx_ và đuôi .png, cỡ tối đa riêng nếu có)
BANG = {
    # sáu việc của một lượt ca (màn Career của Uma)
    'viec.nghi': ('single', 'ico_rest_01'),
    'viec.tap': ('common', 'progress_group_00'),
    'viec.giaoan': ('single', 'ico_skillget_00'),
    'viec.yte': ('single', 'ico_healthroom_00'),
    'viec.xahoi': ('single', 'ico_rest_summer_00'),
    'viec.giaohuu': ('common', 'menu_26'),
    # thanh bên của ca
    'ray.bxh': ('common', 'menu_04'),
    'ray.tin': ('home', 'ico_news_00'),
    'ray.lich': ('common', 'menu_05'),
    'ray.doi': ('common', 'progress_group_03'),
    'ray.giaoan': ('single', 'ico_skillget_01'),
    'ray.so': ('common', 'menu_11'),
    # năm chỉ số: giày, tim, cơ bắp, lửa, mũ — đúng thứ tự Speed/Stamina/Power/Guts/Wit
    'cs.0': ('common', 'obtain_00'), 'cs.1': ('common', 'obtain_01'), 'cs.2': ('common', 'obtain_02'),
    'cs.3': ('common', 'obtain_03'), 'cs.4': ('common', 'obtain_04'),
    # chữ hạng G..S
    'hang.G': ('common', 'statusrank_00'), 'hang.F': ('common', 'statusrank_01'),
    'hang.E': ('common', 'statusrank_02'), 'hang.D': ('common', 'statusrank_03'),
    'hang.C': ('common', 'statusrank_04'), 'hang.B': ('common', 'statusrank_05'),
    'hang.A': ('common', 'statusrank_06'), 'hang.S': ('common', 'statusrank_07'),
    # bậc hiếm của thẻ
    'bac.1': ('common', 'rarity_00'), 'bac.2': ('common', 'rarity_01'), 'bac.3': ('common', 'rarity_02'),
    # số "+N" kiểu màn xem trước buổi tập
    'so.+': ('single', 'txt_trainingselect_plus_00', 64),
    # màn CLB: thanh năm nút đáy và ba nút tròn
    'clb.nuoi': ('home', 'ico_home_umamusume_05'),
    'clb.giapha': ('home', 'ico_home_umamusume_10'),
    'clb.nha': ('home', 'ico_title_00'),
    'clb.giai': ('common', 'itemlist_dailyrace_00'),
    'clb.gacha': ('home', 'ico_present_00'),
    'clb.hlv': ('home', 'ico_mission_00'),
    'clb.sotay': ('common', 'menu_11'),
    'clb.cai': ('common', 'setup_00'),
    # tâm trạng năm bậc
    'tam.0': ('common', 'motivation_m_00'), 'tam.1': ('common', 'motivation_m_01'),
    'tam.2': ('common', 'motivation_m_02'), 'tam.3': ('common', 'motivation_m_03'),
    'tam.4': ('common', 'motivation_m_04'),
}
for i in range(10):
    BANG['so.%d' % i] = ('single', 'txt_trainingselect_num_%02d' % i, 64)


def main():
    anh = {}
    for khoa, v in BANG.items():
        atlas, ten = v[0], v[1]
        toi = v[2] if len(v) > 2 else CO_TOI_DA
        # atlas common bỏ tiền tố `ico_` trong bảng cho gọn
        duong = next((d for d in (os.path.join(UMA, 'img', 'atlas', atlas, 'utx_' + t + '.png')
                                  for t in (ten, 'ico_' + ten)) if os.path.exists(d)), None)
        if not duong:
            raise SystemExit('thiếu ảnh Uma: %s/%s' % (atlas, ten))
        im = Image.open(duong).convert('RGBA')
        bb = im.getchannel('A').getbbox()
        if bb:
            im = im.crop(bb)
        k = min(1.0, toi / max(im.size))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        anh[khoa] = im

    RONG = 1024
    vt = {}
    x = y = cao_ke = 0
    for khoa in sorted(anh, key=lambda k: (-anh[k].height, k)):
        w, h = anh[khoa].size
        if x + w > RONG:
            x = 0; y += cao_ke + 2; cao_ke = 0
        vt[khoa] = (x, y)
        x += w + 2
        cao_ke = max(cao_ke, h)
    tong = y + cao_ke
    atlas = Image.new('RGBA', (RONG, tong), (0, 0, 0, 0))
    for khoa, (x, y) in vt.items():
        atlas.paste(anh[khoa], (x, y))
    os.makedirs(RA, exist_ok=True)
    atlas.save(os.path.join(RA, 'ui.png'), optimize=True)
    bang = {k: [vt[k][0], vt[k][1], anh[k].width, anh[k].height] for k in sorted(anh)}
    bang['_co'] = [RONG, tong]
    with io.open(os.path.join(RA, 'ui.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* sinh tự động bởi _tools/build_uma.py — đừng sửa tay. Nguồn: Uma Musume. */\n'
                'window.UMA_UI = ' + json.dumps(bang, separators=(',', ':')) + ';\n')
    print('sprite', len(anh), 'atlas', RONG, 'x', tong, os.path.getsize(os.path.join(RA, 'ui.png')) // 1024, 'KB')


if __name__ == '__main__':
    main()
