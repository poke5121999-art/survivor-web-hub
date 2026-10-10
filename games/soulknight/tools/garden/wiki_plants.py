#!/usr/bin/env python3
"""Kéo 47 cây trồng từ wiki cộng đồng (soul-knight.fandom.com, Category:Plants) ra tools/wiki/plants.json.

Mỗi cây: khung "Soul Knight Plant Infobox" (rarity, growth_cycle ngày, harvest_type, product_type, product, price, id
= tên cây trong game, ví dụ plant_gem_tree) + đoạn "Usage" (luật thu hoạch bằng chữ).
Chạy: python3 tools/garden/wiki_plants.py
"""
import json, os, re, subprocess, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = 'https://soul-knight.fandom.com/api.php'
UA = 'Mozilla/5.0 (X11; Linux x86_64) survivor-web-hub wiki_plants'


def get(params):
    url = API + '?' + urllib.parse.urlencode(dict(params, format='json'))
    return json.loads(subprocess.check_output(['curl', '-s', '-L', '-A', UA, url]).decode('utf-8'))


def clean(s):
    s = re.sub(r'\{\{(?:I|R|Buff|Sprite)\|([^|}]+)[^}]*\}\}', r'\1', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'''?|<[^>]+>", '', s)
    return re.sub(r'\s+', ' ', s).strip()


def main():
    cm = get({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:Plants', 'cmlimit': 200})
    titles = [x['title'] for x in cm['query']['categorymembers'] if not x['title'].startswith('Template:')]
    out = {}
    for i in range(0, len(titles), 40):
        q = get({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles[i:i + 40])})
        for p in q['query']['pages'].values():
            t = p['revisions'][0]['slots']['main']['*']
            box = re.search(r'\{\{Soul Knight Plant Infobox(.*?)\n\}\}', t, re.S)
            f = dict((k.strip(), clean(v)) for k, v in re.findall(r'^\|\s*(\w+)\s*=\s*(.*)$', box.group(1), re.M)) if box else {}
            use = re.search(r'== *Usage *==\s*(.*?)(?=\n==|\{\{PlantsNav)', t, re.S)
            key = f.get('id') or p['title']
            if key in out:   # wiki ghi trùng id (Golden Mushroom ghi plant_dragon_tree): giữ cả hai, khoá phụ theo tên trang
                key = key + '#' + p['title']
            out[key] = {
                'en': re.sub(r' \(Plant\)$', '', p['title']), 'rarity': f.get('rarity'),
                'days': int(f['growth_cycle']) if (f.get('growth_cycle') or '').isdigit() else f.get('growth_cycle'),
                'harvest': f.get('harvest_type'), 'ptype': f.get('product_type'), 'product': f.get('product'),
                'price': int(f['price']) if (f.get('price') or '').isdigit() else None,
                'usage': clean(use.group(1)) if use else None,
            }
    dst = os.path.join(ROOT, 'tools', 'wiki', 'plants.json')
    with open(dst, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(out.items())), fh, ensure_ascii=False, indent=1)
    print('ghi %d cây -> %s' % (len(out), dst))


if __name__ == '__main__':
    main()
