"""build_tfm_data.py — chép nguyên dữ liệu trận của Teamfight Manager 2 ra js/data-tfm.js.

Nguồn: D:/tfm2-ref/asset/base (bóc từ bundle.game_data bằng tfm_extract, xem RESEARCH §12.1). Tệp là JSON.
  setting/champion_info.champion_info_sheet   68 tướng: stat, growth (mỗi cấp), attack, skill, skill2, ult,
                                               category, tags. 60 tướng gốc chỉ có THAM SỐ chiêu (cách chạy
                                               nằm trong exe); 8 tướng `mod_champions` khai chiêu bằng cây hiệu ứng.
  setting/item_setting.item_setting           30 món đồ (6 dòng × 5 bậc): giá, bậc, chỉ số, next_tier (ghép thành gì)
  setting/game_setting.game_setting           nhịp tick, hồi sinh, vàng, kinh nghiệm, lính, quái, trụ, lõi
  setting/macro_weights.macro_weights         trọng số mục tiêu lớn của bot
  text/champion.i18n, text/item.i18n          chữ tiếng Việt CHÍNH THỨC của TFM2 (khoá "vi")
Đơn vị giữ nguyên của TFM2: thời gian tính bằng tick (60 tick = 1 giây), khoảng cách 1000 = 1 điểm ảnh
bản đồ (sân 960000), phần trăm là số nguyên.
Ra: js/data-tfm.js — window.TFM = {tuong, do, cai, macro, chu}.
Chạy: python _tools/build_tfm_data.py
"""
import io
import json
import os

NGUON = os.environ.get('TFMREF', r'D:/tfm2-ref') + '/asset/base/'
GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def doc(duong):
    return json.load(io.open(NGUON + duong, encoding='utf-8-sig'))


def main():
    info = doc('setting/champion_info.champion_info_sheet')
    chu_tuong = doc('text/champion.i18n')['vi']
    chu_do = doc('text/item.i18n')['vi']

    tuong = {}
    for c in info['mod_champions']:
        tuong[c['id']] = dict(c, mod=True)
    for k, v in info.items():
        if k != 'mod_champions':
            tuong[k] = dict(v, id=k)
    for k, c in tuong.items():
        c.pop('sprite', None)
        # `[BẪY ĐÃ SẬP]` Khoá chiêu không đều: nhiều tướng gọi chiêu đầu là `skill1`; riêng jiangshi thì `skill1`
        # là ô 1 (triệu hồi) và `skill` là ô 2 (đòn choáng) — khớp theo mô tả `mo_ta.skill/skill2`. Sim chỉ đọc
        # `skill/skill2/ult`, nên các tướng này chưa từng ra chiêu đầu. Chép sang khoá chuẩn, GIỮ khoá gốc
        # (mã chiêu viết tay có chỗ đọc thẳng `tfm.skill1`); `khoa_goc` ghi nguồn.
        if 'skill1' in c:
            goc = {'skill': 'skill1'}
            if 'skill' in c and 'skill2' not in c:
                c['skill2'] = c['skill']
                goc['skill2'] = 'skill'
            c['skill'] = c['skill1']
            c['khoa_goc'] = goc
        # ô chiêu có mô tả mà không có khối ra đòn là chiêu BỊ ĐỘNG (Monk hồi máu, Gunner vừa chạy vừa bắn…)
        bd = [o for o in ('skill', 'skill2') if not isinstance(c.get(o), dict)]
        if bd:
            c['bi_dong'] = bd
        # [ĐỌC TỪ NGUỒN] champion_info của TFM2 ghi nhầm khoá đòn đánh của spirit_caller là "attaca";
        # exe của họ chắc đọc theo tên khác, còn sim đọc theo "attack" nên nắn lại ở đây.
        if 'attaca' in c and 'attack' not in c:
            c['attack'] = c.pop('attaca')
        # soldier / pythoness / berserker / clown không ghi attack_ratio ở đòn đánh: 100% SMCK là mặc định
        if isinstance(c.get('attack'), dict) and 'attack_ratio' not in c['attack'] and 'effect' not in c['attack']:
            c['attack']['attack_ratio'] = 100
        mt = chu_tuong['description'].get(k)
        tc = chu_tuong['skill_name'].get(k)
        if not mt or not tc:
            raise SystemExit('thiếu chữ tiếng Việt cho tướng ' + k)
        c['ten'] = mt['name']
        c['ten_chieu'] = {'skill': tc['skill1'], 'skill2': tc['skill2'], 'ult': tc['ult']}
        c['mo_ta'] = {'skill': mt['skill'], 'skill2': mt['skill2'], 'ult': mt['ult']}

    do = doc('setting/item_setting.item_setting')
    do.pop('mod_items', None)          # danh sách đồ của mod, bản gốc để trống
    for k, d in do.items():
        t = chu_do.get(d['key'])
        if not t:
            raise SystemExit('thiếu chữ tiếng Việt cho đồ ' + k)
        d['ten'] = t['name']
        d['hieu_ung'] = t['option']
        # bỏ các chỉ số bằng 0 cho tệp gọn; thiếu khoá = 0 / false
        d['stat'] = {s: v for s, v in d['stat'].items() if v not in (0, False, '')}

    ra = {
        'tuong': tuong,
        'do': do,
        'cai': doc('setting/game_setting.game_setting'),
        'macro': doc('setting/macro_weights.macro_weights'),
        'chu': {'loai': chu_tuong['category'], 'chi_so': chu_tuong['stat'], 'do_loai': chu_do['category'],
                'do_spec': chu_do['spec']},
    }
    duong = os.path.join(GOC, 'js', 'data-tfm.js')
    with io.open(duong, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* sinh tự động bởi _tools/build_tfm_data.py — đừng sửa tay. Nguồn: Teamfight Manager 2 v0.6.0.\n'
                '   Đơn vị gốc của TFM2: tick (60/giây), khoảng cách 1000 = 1 điểm ảnh bản đồ, phần trăm nguyên. */\n'
                'window.TFM = ' + json.dumps(ra, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('tướng', len(tuong), '(mod', sum(1 for c in tuong.values() if c.get('mod')), ') đồ', len(do),
          'cài', len(ra['cai']), '→', os.path.getsize(duong) // 1024, 'KB')


if __name__ == '__main__':
    main()
