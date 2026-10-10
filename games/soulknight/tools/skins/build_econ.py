# -*- coding: utf-8 -*-
"""Giá / cách mở skin nhân vật -> data/skins/econ.js (window.SK_SKIN_ECON). Chạy: python3 build_econ.py (chỉ đọc wiki/ đã lưu).

Nguồn [WIKI soul-knight.fandom.com]: trang Skinlines (bảng {{S|<chỉ số nhân vật>|<số skin>}} ... - <giá>) và Template:<Hero>_Skins
(mục id="<nhân vật>_<skin>", dòng đậm "Tên - giá"). config skins.json chỉ có đường controller, không có giá; LOC không có giá.
Skinlines ưu tiên, Template điền chỗ thiếu; skin không có ở cả hai: [ƯỚC LƯỢNG] 12000 đá (mức phổ biến nhất, 45/160 skin tính đá).
Mã: ["g", đá] | ["$", usd] | ["f", Cá Khô] | ["0"] miễn phí | ["l", cách mở] khoá, không bán. Phần tử thứ 3 = 1: giá ước lượng.
"""
import glob, io, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'data', 'skins', 'econ.js')

LOCK = {
    'F': 'Ghép từ mảnh skin (Máy Quay Trứng)', 'GSP': 'Quay Máy Gashapon sự kiện giới hạn', 'BB': 'Mở từ Hộp Mù',
    'A': 'Hoàn thành thành tựu', 'E': 'Phần thưởng sự kiện', 'SR': 'Phần thưởng Chế độ Mùa Giải',
    'TS': 'Tiếp Tế Huấn Luyện cao cấp, đạt cấp 15', 'SP': 'Sở hữu một skin khác để mở', 'NA': 'Không còn phát hành',
    'F+GSP': 'Mảnh skin từ Máy Gashapon sự kiện giới hạn', 'F+E': 'Mảnh skin từ sự kiện',
}


def norm(raw):
    s = raw.strip().replace('&nbsp;', ' ')
    s = re.sub(r"\[\[[^\]|]*\|?([^\]]*)\]\]", r'\1', s)
    low = s.lower()
    m = re.match(r'^([\d.]+)\s*k$', low)
    if m: return ['g', int(round(float(m.group(1)) * 1000))]
    m = re.match(r'^([\d,]+)\s*gems?$', low)
    if m: return ['g', int(m.group(1).replace(',', ''))]
    if re.match(r'^\d+$', low): return ['g', int(low)]
    m = re.match(r'^\$\s*([\d.]+)$', low)
    if m: return ['$', float(m.group(1))]
    m = re.match(r'^(\d+)\s*(fc|fish chips?)$', low)
    if m: return ['f', int(m.group(1))]
    m = re.match(r'^([\d.,]+)\s*(k?)\s*(sc|season coins?)$', low)
    if m: return ['l', 'Chế độ Mùa Giải: %s Xu mùa giải' % format(int(round(float(m.group(1).replace(',', '')) * (1000 if m.group(2) else 1))), ',').replace(',', '.')]
    if low == 'default skin': return ['0']
    m = re.match(r'^ts\s*\(\$[\d.]+\)$', low)
    if m: return ['l', LOCK['TS']]
    if s.upper() in LOCK: return ['l', LOCK[s.upper()]]
    if low in ('unavailable', 'not available'): return ['l', LOCK['NA']]
    if low in ('event skin',): return ['l', LOCK['E']]
    if low == 'fragment skin': return ['l', LOCK['F']]
    if low == 'achievement skin': return ['l', LOCK['A']]
    if low == 'training supply skin': return ['l', LOCK['TS']]
    if low.startswith('obtain by unlocking'): return ['l', LOCK['SP']]
    if low == 'fish chips': return None
    return None


def main():
    tbl, tpl = {}, {}
    t = json.load(io.open(os.path.join(HERE, 'wiki', 'Skinlines.json'), encoding='utf-8'))['parse']['wikitext']['*']
    for a, b, p in re.findall(r'\{\{S\|(\d+)\|(\d+)\}\}\|[^}]*\}\}<hr>\{\{I\|[^}|]*\}\}\s*-\s*([^\n|]*)', t):
        tbl.setdefault((int(a), int(b)), []).append(p.strip())
    for fn in glob.glob(os.path.join(HERE, 'wiki', 'T*.json')):
        d = json.load(io.open(fn, encoding='utf-8'))
        if 'parse' not in d: continue
        for m in re.finditer(r"\|-\s*id=\"(\d+)_(\d+)\"(.*?)(?=\|-\s*id=|\Z)", d['parse']['wikitext']['*'], re.S):
            b = re.search(r"'''([^'\n]*)'''", m.group(3))
            if b and ' - ' in b.group(1): tpl[(int(m.group(1)), int(m.group(2)))] = b.group(1).rsplit(' - ', 1)[1].strip()
    import sys
    sys.path.insert(0, os.path.dirname(HERE))
    import build_sk as B
    B.extract_heroes(want_skins=range(1, 200))
    out, est, src = {}, [], {'wiki': 0, 'tpl': 0, 'est': 0}
    for hero, skins in sorted(B.heroes.items()):
        idx = next(iter(skins.values()))['index']
        row = {}
        for sk in skins:
            n = int(sk[1:])
            if n == 0: continue
            e = None
            for p in tbl.get((idx, n), []):   # cùng (nhân vật, số) có thể lặp ở bảng "không chính thức": lấy dòng đầu mà hiểu được
                e = norm(p)
                if e: src['wiki'] += 1; break
            if not e and (idx, n) in tpl:
                e = norm(tpl[(idx, n)])
                if e: src['tpl'] += 1
            if not e:
                e = ['g', 12000, 1]; est.append((hero, n)); src['est'] += 1
            row[str(n)] = e
        out[hero] = row
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/skins/build_econ.py — không sửa tay.\n')
        f.write('window.SK_SKIN_ECON = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    from collections import Counter
    print(src, Counter(v[0] for r in out.values() for v in r.values()), 'ước lượng', est)


if __name__ == '__main__':
    main()
