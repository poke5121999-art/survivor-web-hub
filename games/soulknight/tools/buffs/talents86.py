#!/usr/bin/env python
# Thêm vào data/sk-buffs86.js các thiên phú mà bảng nhóm bốc (luban tbmastertalentpoolconfig) không liệt kê:
# 1015..1018 (đồ đặc biệt "Lê Băng", ngoài bể bốc), 3001..3007 (chế độ Xâm Nhập Hư Không, chưa có chế độ, chỉ giữ tên/mô tả).
# build_buffs86.py gọi extra_buffs(loc); chạy trực tiếp tệp này thì vá tệp data/sk-buffs86.js đã có (khi không có thư mục luban/lua):
#   SK86_DEC=~/sk86-ref/decoded python3 games/soulknight/tools/buffs/talents86.py
import io, json, os, re, sys

# icon ui_buff_<id> không có trong atlas ui.ab 8.6 [ĐO sprite_atlas.json] → dùng ô dự phòng ui_buff_x
EXTRA_IDS = [1015, 1016, 1017, 1018, 3001, 3002, 3003, 3004, 3005, 3006, 3007]


def extra_buffs(loc):
    out = {}
    for bid in EXTRA_IDS:
        nm, info = loc('Buff_name_%d' % bid), loc('Buff_info_%d' % bid)
        if not nm:
            continue
        out[str(bid)] = {'key': 'Buff%d' % bid, 'id': bid, 'name': nm, 'info': info, 'upg': loc('Buff_upgrade_%d' % bid),
                         'icon': 'ui_buff_x', 'pool': None}
    return out


if __name__ == '__main__':
    dec = os.path.expanduser(os.environ.get('SK86_DEC', '~/sk86-ref/decoded'))
    L = json.load(io.open(os.path.join(dec, 'localization_en_vi.json'), encoding='utf-8'))
    loc = lambda t: ({'en': L[t][0], 'vi': L[t][1]} if t in L else None)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'sk-buffs86.js')
    src = io.open(out, encoding='utf-8').read()
    head, body = src.split('window.SK_BUFFS86 = ', 1)
    j = json.loads(body.rstrip().rstrip(';'))
    j['buffs'].update(extra_buffs(loc))
    io.open(out, 'w', encoding='utf-8', newline='\n').write(
        head + 'window.SK_BUFFS86 = ' + json.dumps(j, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('đã thêm', len(extra_buffs(loc)), 'thiên phú; tổng', len(j['buffs']))
