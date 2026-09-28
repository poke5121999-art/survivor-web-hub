# -*- coding: utf-8 -*-
"""Rút data/gamedata.js (loài, vật phẩm, mô tả chiêu, bảng khắc hệ) cho PokéOne từ các
TextAsset đã dump sẵn ở D:\\pokeone-ref\\data\\ (pokemon.txt, items.txt, moves.txt,
typechart.txt). Chạy lại bao nhiêu lần cũng ra cùng kết quả.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_data.py

Các tệp .txt là JSON có dấu phẩy thừa trước "}"/"]" (không hợp lệ JSON chuẩn) và một số byte
không phải UTF-8 hợp lệ (tên có dấu, có byte lạ 0x9d) -> đọc bằng latin-1 (map đủ 256 byte,
không bao giờ throw) rồi bỏ dấu phẩy thừa bằng regex trước khi json.loads.

Bằng chứng đã đo (xem README-2d.md phần "Dữ liệu"):
- pokemon.txt "ID" == dex quốc gia đúng 1:1 cho dex 1-251 (không lệch như Index.txt/forms).
  Mỗi dex có đúng 1 dòng Form=="" (dạng gốc); 250 dòng khác là mega/form/giới tính.
- RatioM = 0.0 -> không giới tính (Magnemite, Voltorb, Ditto, Unown, các huyền thoại...).
  RatioM = 0.01 -> gần như luôn cái (Nidoran-F, Chansey, Kangaskhan, Jynx, Miltank...).
  Không có giá trị nào là "0% đực nhưng có giới tính" - 0.0 dành riêng cho không giới tính.
- items.txt: ItemImage - ID == 1 cho 935/994 vật phẩm (mọi Poké Ball đã soi bằng mắt khớp
  đúng: Master Ball ID1->idata/1.png, Ultra Ball ID2->idata/2.png, Great Ball ID3->idata/3.png,
  Poké Ball ID4->idata/4.png, Safari Ball ID5->idata/5.png, Net Ball ID6->idata/6.png).
  59 vật phẩm còn lại (TM/HM, xe đạp, thú cưỡi, trang phục) dùng chung 1 ItemImage đại diện
  khác hẳn ID -> ItemImage luôn là nguồn đúng, KHÔNG được suy ra từ ID. Công thức:
      idata_file_number = ItemImage - 1
- typechart.txt: 18 dòng theo Type 0..17 = thứ tự numeric-id kinh điển của Showdown
  (Normal,Fighting,Flying,Poison,Ground,Rock,Bug,Ghost,Steel,Fire,Water,Grass,Electric,
  Psychic,Ice,Dragon,Dark,Fairy) - xác nhận bằng hàng Type:0 (Normal): kháng Đá(0.5) đúng cột
  index5, miễn nhiễm Ma(0.0) đúng cột index7, kháng Thép(0.5) đúng cột index8.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
DATA = os.path.join(GAME, 'data')
REF = os.environ.get('POKEONE_REF_DATA', r'D:\pokeone-ref\data')

DEX_MAX = 251
# Loai ngoai 251 co trong bang gap Pokemon that cua PRO — cung danh sach voi tools/pro/rip_pro.py (DEX_EXTRA).
sys.path.insert(0, os.path.join(HERE, 'pro'))
from rip_pro import DEX_EXTRA  # noqa: E402
DEX_SET = set(range(1, DEX_MAX + 1)) | set(DEX_EXTRA)

TYPE_ORDER = [
    'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
    'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy',
]


def load_lenient(name):
    # Cac tep TextAsset nay la UTF-8 that (chu Pokemon co dau) nhung xen it byte hong (vd 0x9d)
    # khong phai UTF-8 hop le -> doc utf-8 voi errors='replace' de giu dung dau, chi mat dung
    # byte hong (thay U+FFFD), thay vi latin-1 lam mojibake ca file ("PokÃ©mon").
    path = os.path.join(REF, name)
    with io.open(path, encoding='utf-8', errors='replace') as f:
        s = f.read()
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    return json.loads(s, strict=False)


def num(x):
    """Chuỗi số trong moves.txt/pokemon.txt -> float hoặc int."""
    if isinstance(x, (int, float)):
        return x
    x = str(x).strip()
    if x == '':
        return None
    f = float(x)
    return int(f) if f.is_integer() else f


# ------------------------------------------------------------------ SPECIES
def build_species():
    pk = load_lenient('pokemon.txt')['Pokemon']
    base = {}
    for p in pk:
        if p.get('Form', '') == '' and p.get('ID', -1) in DEX_SET:
            base[p['ID']] = p

    missing = [d for d in sorted(DEX_SET) if d not in base]
    if missing:
        print('  !! thieu dex trong pokemon.txt:', missing)

    species = {}
    for dex, p in sorted(base.items()):
        types = [p['Type']]
        t2 = (p.get('Type2') or '').strip()
        if t2:
            types.append(t2)
        abilities = []
        for k in ('Ability1', 'Ability2', 'Ability3'):
            a = (p.get(k) or '').strip()
            abilities.append(None if a in ('', 'None') else a)
        species[dex] = {
            'name': p['Name'],
            'types': types,
            'desc': p.get('Description', ''),
            'category': p.get('Species', ''),
            'height': num(p.get('Height')),
            'weight': num(p.get('Weight')),
            'catchRate': p.get('CaptureRate'),
            'baseExp': p.get('BaseExp'),
            'expRate': p.get('ExpRate'),
            'evs': {
                'hp': p.get('EVHP', 0), 'atk': p.get('EVATK', 0), 'def': p.get('EVDEF', 0),
                'spa': p.get('EVSPATK', 0), 'spd': p.get('EVSPDEF', 0), 'spe': p.get('EVSPD', 0),
            },
            'male': p.get('RatioM'),
            'abilities': abilities,
            'happiness': p.get('BaseHappiness'),
        }
    print('species:', len(species), '/', len(DEX_SET))
    return species


# ------------------------------------------------------------------ ITEMS
def build_items():
    items_raw = load_lenient('items.txt')['items']
    items = {}
    n_gap = 0
    for it in items_raw:
        img_n = it.get('ItemImage')
        # ItemImage=1 (Null Item, ID 0) tro toi idata/0.png - tep nay khong ton tai trong
        # bundle (idata bat dau tu 1.png) nen coi nhu khong co icon. Vai vat pham khac (vd
        # "Oak's Parcel" ItemImage 1350 -> idata/1349.png) tro toi so khong co trong bundle
        # dua tren (961 tep thuc te, khoang 1..1404) - kiem tra ton tai tren dia, khong co
        # thi img=None thay vi ghi duong dan hong.
        img = None
        if img_n and img_n > 1:
            cand = os.path.join(GAME, 'art', 'item', '%d.png' % (img_n - 1))
            if os.path.isfile(cand):
                img = 'art/item/%d.png' % (img_n - 1)
            else:
                n_gap += 1
        items[it['ID']] = {
            'name': it['Name'],
            'battleId': it.get('BattleID'),
            'desc': it.get('Description', ''),
            'pocket': it.get('Pocket'),
            'usage': it.get('Usage'),
            'img': img,
        }
    print('items:', len(items), '(%d thieu icon trong bundle goc)' % n_gap)
    return items


# ------------------------------------------------------------------ MOVE_DESC
def build_move_desc():
    moves_raw = load_lenient('moves.txt')['Moves']
    out = {}
    for m in moves_raw:
        bid = m.get('BattleID')
        if not bid:
            continue
        out[bid] = m.get('Description', '')
    print('move_desc:', len(out))
    return out


# ------------------------------------------------------------------ TYPECHART
def build_typechart():
    rows = load_lenient('typechart.txt')
    chart = {}
    for row in rows:
        idx = row['Type']
        name = TYPE_ORDER[idx]
        eff = row['Effectiveness']
        chart[name] = {TYPE_ORDER[j]: eff[j] for j in range(len(TYPE_ORDER)) if eff[j] != 1.0}
    print('typechart:', len(chart), 'loai')
    return {'order': TYPE_ORDER, 'chart': chart}


def main():
    species = build_species()
    items = build_items()
    move_desc = build_move_desc()
    typechart = build_typechart()

    os.makedirs(DATA, exist_ok=True)
    out_path = os.path.join(DATA, 'gamedata.js')
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write('// Tu dong sinh boi tools/rip_data.py. Dung sua tay.\n')
        f.write('window.P1 = window.P1 || {};\n')
        f.write('P1.SPECIES = ' + json.dumps(species, ensure_ascii=False) + ';\n')
        f.write('P1.ITEMS = ' + json.dumps(items, ensure_ascii=False) + ';\n')
        f.write('P1.MOVE_DESC = ' + json.dumps(move_desc, ensure_ascii=False) + ';\n')
        f.write('P1.TYPECHART = ' + json.dumps(typechart, ensure_ascii=False) + ';\n')
    size = os.path.getsize(out_path)
    print('wrote', out_path, '(%d KB)' % (size // 1024))


if __name__ == '__main__':
    main()
