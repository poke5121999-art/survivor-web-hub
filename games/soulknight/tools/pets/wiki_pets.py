#!/usr/bin/env python3
"""Trích bảng thú cưng từ wiki cộng đồng (soul-knight.fandom.com, trang Pets) ra tools/wiki/pets.json.

Mỗi con: cách mở khoá + giá, món ăn ưa thích, tên kỹ năng, các dòng ghi chú số liệu kỹ năng.
Khoá theo id web (pet0..pet56), ghép bằng tên tiếng Anh trong data/sk-pets.js.
Chạy: python3 tools/pets/wiki_pets.py [đường_dẫn_wikitext.json]  (không có thì tải qua api.php)
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = 'https://soul-knight.fandom.com/api.php?action=parse&page=Pets&prop=wikitext&format=json'
UA = 'Mozilla/5.0 (X11; Linux x86_64) survivor-web-hub wiki_pets'


def wikitext(src):
    if src:
        raw = open(src, encoding='utf-8').read()
    else:
        raw = subprocess.check_output(['curl', '-s', '-L', '-A', UA, API]).decode('utf-8')
    return json.loads(raw)['parse']['wikitext']['*']


def clean(s):
    s = re.sub(r'\{\{(?:I|Sprite|Buff|Condition)\|([^|}]+)[^}]*\}\}', r'\1', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'''?|<[^>]+>", '', s)
    return s.strip()


def web_names():
    txt = open(os.path.join(ROOT, 'data', 'sk-pets.js'), encoding='utf-8').read()
    data = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    return {p['en'].lower(): k for k, p in data['pets'].items() if p.get('en')}


def main():
    t = wikitext(sys.argv[1] if len(sys.argv) > 1 else None)
    names = web_names()
    out, miss = {}, []
    for m in re.finditer(r'\|- id="([^"]+)"\n(.*?)(?=\n\|- id=|\n\|\})', t, re.S):
        body = m.group(2)
        head = re.search(r"'''(.+?) - (.+?)'''", body)
        if not head:
            continue
        name, unlock = head.group(1).strip(), clean(head.group(2))
        food = re.search(r'Food preference:\s*([^\n]+)', body)
        cells = re.split(r'\n\|(?=\[\[File:|data-sort)', body)
        skill = cells[-1] if len(cells) > 1 else ''
        sname = re.search(r"'''([^']+)'''", skill)
        desc = re.search(r"''([^'][^\n]*?)''", skill.replace("'''", '\x00'))
        notes = [clean(x) for x in re.findall(r'^\*+\s*(.+)$', skill, re.M)]
        gems = re.search(r'([\d,]+)\s*Gems', unlock)
        key = names.get(name.lower())
        if not key:
            miss.append(name)
            continue
        out[key] = {
            'en': name, 'unlock': unlock,
            'gems': int(gems.group(1).replace(',', '')) if gems else None,
            'food': clean(food.group(1)) if food else None,
            'skill': sname.group(1).strip() if sname else None,
            'desc': clean(desc.group(1)) if desc else None,
            'notes': notes,
        }
    dst = os.path.join(ROOT, 'tools', 'wiki', 'pets.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(out.items(), key=lambda kv: int(kv[0][3:]))), f, ensure_ascii=False, indent=1)
    print('ghi %d thú cưng -> %s; không ghép được tên: %s' % (len(out), dst, miss))


if __name__ == '__main__':
    main()
