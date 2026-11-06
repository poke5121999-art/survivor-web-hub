"""build_uma_ca.py — ảnh gốc Uma Musume cho màn nuôi (Career) và màn chọn buổi tập (Training).

Nguồn:
  D:/uma-ref/img/atlas/<atlas>/utx_*.png   sprite giao diện, bóc bằng rip_uma_img.py (UMA_ATLAS=all)
  bundle bg/bg_XXXX_XXXXX của bản Uma cài trên máy   tranh nền 2048×1024 (meta + dat, như rip_uma_img.py)
  art/uma/fl/<tên>.png + fl.js             texture flash đã xuất bởi build_uma_flash.py (cắt theo mesh)
Ra:
  art/uma/ca/<khoá>.png     sprite cỡ gốc (nút 6 việc, icon, khung, thanh thể lực...)
  art/uma/nen/<khoá>.webp   nền cảnh 1440×720
Chạy: python _tools/build_uma_ca.py
"""
import io
import json
import os
import sqlite3

import UnityPy
from PIL import Image

UMA = os.environ.get('UMAREF', r"D:/uma-ref")
CAI = os.path.expanduser('~/AppData/LocalLow/Cygames/Umamusume/')
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'art', 'uma')

# khoá → (atlas, tên sprite không kèm utx_ và .png)
SPRITE = {
    # sáu nút việc: đế viên thuốc, icon hai khung (Uma đổi qua lại cho nút "thở")
    'nut_nghi': ('single', 'btn_rest_main_00'),
    'nut_tap': ('single', 'btn_training_main_00'),
    'nut_kn': ('single', 'btn_skillget_main_00'),
    'nut_yte': ('single', 'btn_healthroom_main_00'),
    'nut_xahoi': ('single', 'btn_play_main_00'),
    'nut_giaohuu': ('single', 'btn_raceentry_main_00'),
    'ic_nghi0': ('single', 'ico_rest_00'), 'ic_nghi1': ('single', 'ico_rest_01'),
    'ic_kn0': ('single', 'ico_skillget_00'), 'ic_kn1': ('single', 'ico_skillget_01'),
    'ic_yte0': ('single', 'ico_healthroom_00'), 'ic_yte1': ('single', 'ico_healthroom_01'),
    'ic_xahoi0': ('single', 'ico_play_00'), 'ic_xahoi1': ('single', 'ico_play_01'),
    'vien_nut': ('single', 'eff_single_cmd_00_sl'),
    'muc_tieu': ('single', 'frm_target_label_00'),
    'bong_noi': ('single', 'frm_messageballoon_00_sl'),
    'nut_tron': ('common', 'btn_circle_m_00_sl'),
    'nut_info': ('common', 'btn_info_00'),
    'khoa': ('common', 'ico_lock_00'),
    # rail dọc
    'ray_log': ('common', 'ico_log_00'), 'ray_bxh': ('common', 'ico_menu_04'),
    'ray_tin': ('common', 'ico_menu_21'), 'ray_lich': ('common', 'ico_menu_05'),
    'ray_doi': ('common', 'ico_menu_15'), 'ray_kn': ('common', 'ico_menu_14'),
    'ray_so': ('common', 'ico_menu_11'),
}
for i in range(8):
    SPRITE['hang_%d' % i] = ('common', 'ico_statusrank_%02d' % i)

# nền cảnh: màn nuôi và năm sân tập (thứ tự Cơ · Bền · Lực · Lì · Não = Speed · Stamina · Power · Guts · Wit),
# cùng bốn việc còn lại
NEN = {
    'ca': 'bg_0005_00110',        # đại lộ trước trường
    'tap0': 'bg_0070_00110',      # đường đua cỏ — Speed tập trên sân
    'tap1': 'bg_0013_00110',      # hồ bơi — Stamina
    'tap2': 'bg_0015_00110',      # phòng gym — Power
    'tap3': 'bg_0072_00110',      # đường đất — Guts
    'tap4': 'bg_0006_00110',      # lớp học — Wit
    'nghi': 'bg_0017_00110',      # phòng ký túc
    'yte': 'bg_0121_00110',       # phòng y tế
    'xahoi': 'bg_0034_00110',     # khu vui chơi
    'giaohuu': 'bg_0056_00111',   # khán đài
}

# mảnh cắt từ texture flash: khoá → (prefab, mesh)
CAT_FL = {
    'the_luc_khung': ('the_luc', 'utx_gau_tp_base00'),
    'the_luc_mau': ('the_luc', 'gau_tp_bar00'),
    'tieu_de': ('tieu_de', 'utx_header_base00'),
}


def doc_fl():
    s = io.open(os.path.join(RA, 'fl', 'fl.js'), encoding='utf-8').read()
    dau = s.index('window.UMA_FL = ') + len('window.UMA_FL = ')
    return json.JSONDecoder().raw_decode(s[dau:])[0]


def main():
    for d in ('ca', 'nen'):
        os.makedirs(os.path.join(RA, d), exist_ok=True)
    for khoa, (atlas, ten) in SPRITE.items():
        duong = os.path.join(UMA, 'img', 'atlas', atlas, 'utx_' + ten + '.png')
        if not os.path.exists(duong):
            raise SystemExit('thiếu sprite Uma: %s/%s' % (atlas, ten))
        Image.open(duong).convert('RGBA').save(os.path.join(RA, 'ca', khoa + '.png'), optimize=True)

    fl = doc_fl()
    for khoa, (pf, mesh) in CAT_FL.items():
        m = fl[pf]['mesh'][mesh]
        im = Image.open(os.path.join(RA, 'fl', pf + '.png')).convert('RGBA').crop((m[0], m[1], m[0] + m[2], m[1] + m[3]))
        if m[4]:
            im = im.rotate(90, expand=True)   # mảnh lưu xoay 90°, uma-flash.js vẽ bằng rotate(−90°)
        im.save(os.path.join(RA, 'ca', khoa + '.png'), optimize=True)

    for khoa, ten in NEN.items():
        duong = os.path.join(UMA, 'img', 'bg', ten + '.jpg')
        if not os.path.exists(duong):
            raise SystemExit('thiếu nền Uma: %s (xuất bg/* trước)' % ten)
        Image.open(duong).convert('RGB').resize((1440, 720), Image.LANCZOS) \
            .save(os.path.join(RA, 'nen', khoa + '.webp'), quality=80, method=6)

    kb = lambda d: sum(os.path.getsize(os.path.join(RA, d, x)) for x in os.listdir(os.path.join(RA, d))) // 1024
    print('sprite', len(SPRITE) + len(CAT_FL), kb('ca'), 'KB  nền', len(NEN), kb('nen'), 'KB')


if __name__ == '__main__':
    main()
