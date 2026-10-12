# Giải config.ab (Soul Knight 8.6.0): 17 TextAsset = CSV, mỗi ký tự XOR khoá lặp "soulKnight".
# Chạy: PYTHONIOENCODING=utf-8 python decode_config.py [bundle_dir] [out_dir]
# Ra: <out>/config/<bảng>.json  {Key: {cột: giá trị}}  +  <out>/config/<bảng>.csv (bản giải thô)
import UnityPy, csv, io, json, os, sys

AB = sys.argv[1] if len(sys.argv) > 1 else r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles'
OUT = os.path.join(sys.argv[2] if len(sys.argv) > 2 else r'D:\sk86-ref\decoded', 'config')
KEY = b'soulKnight'  # [ĐO] tìm bằng chỉ số trùng hợp (chu kỳ 10) + chấm điểm chữ in được trên skills


def xor(text):
    # XOR theo từng ký tự C# (UTF-16 code unit), không theo byte: bản mã chứa ký tự UTF-8 nhiều byte hợp lệ
    return ''.join(chr(ord(c) ^ KEY[i % len(KEY)]) for i, c in enumerate(text))


def cell(v, t):
    if t == 'int':
        return int(v) if v not in ('', None) else None
    if t == 'float':
        return float(v) if v not in ('', None) else None
    if t == 'bool':
        return v == 'True'
    s = v.strip()
    if s[:1] in '{[':
        try:
            return json.loads(s)
        except ValueError:
            pass
    return v


def table(text):
    rows = list(csv.reader(io.StringIO(text.replace('\r\n', '\n'))))
    head, types = rows[0], rows[1]
    out, dup = {}, 0
    for r in rows[2:]:
        if not r or not any(r):
            continue
        r += [''] * (len(head) - len(r))
        d = {h: cell(r[i], types[i]) for i, h in enumerate(head)}
        k = str(d[head[0]])
        if k in out:
            dup += 1
            k = f'{k}#{dup}'
        out[k] = d
    return head, types, out, dup


def main():
    os.makedirs(OUT, exist_ok=True)
    env = UnityPy.load(os.path.join(AB, 'config.ab'))
    index = {}
    for o in env.objects:
        if o.type.name != 'TextAsset':
            continue
        d = o.read()
        s = d.m_Script
        raw = s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s)
        text = xor(raw.decode('utf-8'))
        open(os.path.join(OUT, d.m_Name + '.csv'), 'w', encoding='utf-8', newline='').write(text)
        head, types, rows, dup = table(text)
        json.dump(rows, open(os.path.join(OUT, d.m_Name + '.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        index[d.m_Name] = {'rows': len(rows), 'dupKeys': dup, 'columns': dict(zip(head, types))}
        print(f'{d.m_Name:24} {len(rows):5} hàng  {len(head):2} cột  trùng khoá {dup}')
    json.dump(index, open(os.path.join(OUT, '_index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
