#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Kéo số liệu Soul Knight từ wiki cộng đồng (soul-knight.fandom.com) rồi ghép sprite với kho bóc cục bộ.

Chạy lại được, idempotent: mọi phản hồi thô nằm ở ~/Downloads/sk-ref/wiki-cache (ngoài git),
lần chạy sau đọc từ cache, không gọi mạng.  Xem wiki/README.md.

    PYTHONIOENCODING=utf-8 python wiki_pull.py            # chạy hết
    PYTHONIOENCODING=utf-8 python wiki_pull.py weapons    # chỉ một phần: weapons heroes bosses levels enemies
"""
from __future__ import print_function
import hashlib
import io
import json
import os
import re
import subprocess
import sys
sys.dont_write_bytecode = True
import time
from collections import OrderedDict, defaultdict

try:
    from urllib.parse import urlencode, quote
except ImportError:  # pragma: no cover
    from urllib import urlencode, quote

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'wiki')
HOME = os.path.expanduser('~')
CACHE = os.path.join(HOME, 'Downloads', 'sk-ref', 'wiki-cache')
IMGCACHE = os.path.join(CACHE, 'img')
RIP = os.path.join(HOME, 'Downloads', 'sk-ref', 'all')
API = 'https://soul-knight.fandom.com/api.php'
UA = 'sk-remake-research/1.0 (personal fan-remake research; polite)'
DELAY = 0.35

for d in (OUT, CACHE, IMGCACHE):
    if not os.path.isdir(d):
        os.makedirs(d)


# ---------------------------------------------------------------- mạng + cache

def _cached_curl(url, fn, binary=False):
    if not os.path.exists(fn) or os.path.getsize(fn) == 0:
        time.sleep(DELAY)
        last = None
        for _ in range(4):
            try:
                out = subprocess.check_output(['curl', '-s', '-L', '-A', UA, url])
                if out:
                    tmp = fn + '.part'
                    with open(tmp, 'wb') as f:
                        f.write(out)
                    os.replace(tmp, fn)
                    break
            except subprocess.CalledProcessError as e:
                last = e
            time.sleep(2)
        else:
            raise RuntimeError('curl thất bại: %s (%s)' % (url, last))
    return fn


def api(params):
    q = urlencode(sorted(params.items()))
    fn = os.path.join(CACHE, 'q_' + hashlib.md5(q.encode('utf-8')).hexdigest() + '.json')
    _cached_curl(API + '?' + q, fn)
    with io.open(fn, encoding='utf-8') as f:
        return json.load(f)


def category(name):
    res, cont = [], None
    while True:
        p = {'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:' + name,
             'cmlimit': '500', 'format': 'json'}
        if cont:
            p['cmcontinue'] = cont
        d = api(p)
        res += [m['title'] for m in d['query']['categorymembers'] if m.get('ns') == 0]
        cont = d.get('continue', {}).get('cmcontinue')
        if not cont:
            return res


_WT = {}


def wikitext(titles):
    """{title: wikitext}; lấy theo lô 50, theo dõi redirect. Trang không có -> None."""
    need = [t for t in titles if t not in _WT]
    for i in range(0, len(need), 50):
        batch = need[i:i + 50]
        d = api({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main',
                 'titles': '|'.join(batch), 'redirects': '1', 'format': 'json', 'formatversion': '2'})
        q = d.get('query', {})
        norm = dict((n['from'], n['to']) for n in q.get('normalized', []))
        redir = dict((n['from'], n['to']) for n in q.get('redirects', []))
        pages = dict((p['title'], p) for p in q.get('pages', []))
        for t in batch:
            t2 = norm.get(t, t)
            t2 = redir.get(t2, t2)
            p = pages.get(t2)
            txt = None
            if p and 'revisions' in p:
                txt = p['revisions'][0]['slots']['main']['content']
            _WT[t] = txt
    return dict((t, _WT[t]) for t in titles)


# ---------------------------------------------------------------- wikitext -> dữ liệu

def find_templates(text, name_re):
    """Trả list (tên, thân) cho mọi {{Tên ...}} khớp name_re ở mọi độ sâu, có tính lồng {{ }}."""
    out = []
    i = 0
    n = len(text)
    while True:
        j = text.find('{{', i)
        if j < 0:
            break
        depth, k = 0, j
        while k < n:
            if text.startswith('{{', k):
                depth += 1
                k += 2
            elif text.startswith('}}', k):
                depth -= 1
                k += 2
                if depth == 0:
                    break
            else:
                k += 1
        body = text[j + 2:k - 2]
        head = re.split(r'[|\n]', body, 1)[0].strip()
        if re.match(name_re, head, re.I):
            out.append((head, body))
        i = j + 2
    return out


def split_top(body, sep='|'):
    parts, cur, d1, d2 = [], [], 0, 0
    i = 0
    while i < len(body):
        c2 = body[i:i + 2]
        if c2 == '{{':
            d1 += 1; cur.append(c2); i += 2; continue
        if c2 == '}}':
            d1 -= 1; cur.append(c2); i += 2; continue
        if c2 == '[[':
            d2 += 1; cur.append(c2); i += 2; continue
        if c2 == ']]':
            d2 -= 1; cur.append(c2); i += 2; continue
        if d1 == 0 and d2 == 0 and body.startswith(sep, i):
            parts.append(''.join(cur)); cur = []
            i += len(sep)
            continue
        else:
            cur.append(body[i])
        i += 1
    parts.append(''.join(cur))
    return parts


def infobox(text, name_re):
    """OrderedDict các tham số của infobox đầu tiên khớp name_re, hoặc None."""
    for head, body in find_templates(text, name_re):
        parts = split_top(body)
        d = OrderedDict()
        for p in parts[1:]:
            if '=' in p:
                k, v = p.split('=', 1)
                d[k.strip()] = v.strip()
        return d
    return None


def plain(s, page=''):
    """Wikitext -> chữ thường đọc được. `page` thay cho {{PAGENAME}}."""
    if s is None:
        return ''
    s = s.replace('{{PAGENAME}}', page)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'^\{\|.*$|^\|\}.*$|^\|-.*$', '', s, flags=re.M)
    s = re.sub(r'^[|!]\s*', '', s, flags=re.M)
    s = s.replace('||', ' | ').replace('!!', ' | ')
    s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' ', s, flags=re.I)
    s = re.sub(r'<gallery.*?</gallery>', '', s, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\[\[(?:File|Image):[^\]]*\]\]', '', s, flags=re.I)
    for _ in range(4):
        # {{I|Health|1}} {{Buff|Accuracy}} {{Weapon|Ring green}} -> tham số đầu; {{PAGENAME}} giữ nguyên để thay sau
        s = re.sub(r'\{\{\s*(?:I|Buff|Weapon|Condition|Enemy|Item|Boss)\s*\|([^|{}]*)[^{}]*\}\}', r'\1', s, flags=re.I)
        s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', s)
    s = s.replace("'''", '').replace("''", '')
    s = re.sub(r'^[;:*#]+\s*', lambda m: '- ' if '*' in m.group(0) else '', s, flags=re.M)
    s = re.sub(r'^=+\s*(.*?)\s*=+\s*$', r'\1', s, flags=re.M)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()


def section(text, names):
    """Nội dung mục == Tên == (cấp 2) đầu tiên khớp names (list, so không phân biệt hoa thường)."""
    heads = list(re.finditer(r'^(={2,4})\s*(.*?)\s*\1\s*$', text, flags=re.M))
    for idx, m in enumerate(heads):
        if m.group(2).strip().lower() in names:
            lvl = len(m.group(1))
            end = len(text)
            for m2 in heads[idx + 1:]:
                if len(m2.group(1)) <= lvl:
                    end = m2.start()
                    break
            return text[m.end():end]
    return None


def section_re(text, pattern):
    """Thân mục cấp 2-4 đầu tiên có tiêu đề khớp regex `pattern` (không phân biệt hoa thường)."""
    heads = list(re.finditer(r'^(={2,4})\s*(.*?)\s*\1\s*$', text, flags=re.M))
    for idx, m in enumerate(heads):
        if re.search(pattern, m.group(2), re.I):
            lvl = len(m.group(1))
            end = len(text)
            for m2 in heads[idx + 1:]:
                if len(m2.group(1)) <= lvl:
                    end = m2.start()
                    break
            return text[m.end():end]
    return None


def sections(text):
    """[(cấp, tiêu đề, thân)] phẳng."""
    heads = list(re.finditer(r'^(={2,4})\s*(.*?)\s*\1\s*$', text, flags=re.M))
    res = []
    for idx, m in enumerate(heads):
        end = heads[idx + 1].start() if idx + 1 < len(heads) else len(text)
        res.append((len(m.group(1)), m.group(2).strip(), text[m.end():end]))
    return res


# ---------------------------------------------------------------- chỉ số

NUM = r'[-+]?\d+(?:\.\d+)?'


def _clean_stat(s):
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('\u00a0', ' ')
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'(?<=\d),(?=\d{3}(?!\d))', '', s)
    return s


def _val(t):
    """Một giá trị: số, khoảng a~b, danh sách a/b/c, hoặc AxB."""
    t = t.strip().lstrip('*~≈ ').rstrip('%').strip()
    m = re.match(r'^(%s)$' % NUM, t)
    if m:
        return {'value': _n(m.group(1))}
    m = re.match(r'^(%s)\s*~\s*(%s)$' % (NUM, NUM), t) or re.match(r'^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$', t)
    if m:
        return {'min': _n(m.group(1)), 'max': _n(m.group(2))}
    m = re.match(r'^(%s)\s*[xX\u00d7]\s*(\d+)$' % NUM, t)
    if m:
        return {'value': _n(m.group(1)), 'count': int(m.group(2))}
    if re.match(r'^%s(\s*/\s*%s)+$' % (NUM, NUM), t):
        return {'list': [_n(x) for x in re.split(r'\s*/\s*', t)]}
    return None


def _n(x):
    f = float(x)
    return int(f) if f == int(f) and '.' not in x else f


def parse_stat(raw):
    """Chuỗi chỉ số của infobox -> {raw, number, min, max, parts:[{label,value|min,max|list, upgraded}]}.

    number = giá trị đầu tiên (cận dưới nếu là khoảng). `upgraded` lấy từ dạng 'a -> b' (bản tiến hoá/nâng cấp).
    """
    out = OrderedDict([('raw', raw)])
    if raw is None:
        out['number'] = None
        return out
    s = _clean_stat(raw)
    parts = []
    for line in [l for l in s.split('\n') if l.strip()]:
        label = None
        m = re.search(r'\(([^()]*)\)\s*$', line)
        if m:
            label = m.group(1).strip()
            line = line[:m.start()]
        elif re.search(r'\(([^()]*)\)', line):
            m = re.search(r'\(([^()]*)\)', line)
            label = m.group(1).strip()
            line = line[:m.start()] + line[m.end():]
        line = line.strip()
        pieces = re.split(r'\u2192|->', line)
        v = _val(pieces[0])
        if v is None:
            if line:
                parts.append(OrderedDict([('text', line)] + ([('label', label)] if label else [])))
            continue
        part = OrderedDict(v)
        if label:
            part['label'] = label
        if len(pieces) > 1:
            u = _val(pieces[1])
            if u:
                part['upgraded'] = u.get('value', u)
        parts.append(part)
    if parts:
        out['parts'] = parts
        p0 = parts[0]
        if 'value' in p0:
            out['number'] = p0['value']
        elif 'min' in p0:
            out['number'] = p0['min']
            out['min'], out['max'] = p0['min'], p0['max']
        elif 'list' in p0:
            out['number'] = p0['list'][0]
    if 'number' not in out:
        out['number'] = None
    return out


def parse_price(raw):
    """Giá mở khoá nhân vật/kỹ năng -> {raw, kind, currency, amount}. kind: default|achievement|gems|real_money|materials|other."""
    r = OrderedDict([('raw', raw)])
    t = plain(raw or '').strip()
    low = t.lower()
    r['text'] = t
    if not t:
        r['kind'] = None
    elif low.startswith('default') or 'unlocked by default' in low:
        r['kind'] = 'default'
    elif 'achievement' in low:
        r['kind'] = 'achievement'
    elif 'design table' in low:
        r['kind'] = 'design_table'
    elif '$' in t:
        m = re.search(r'\$\s*(\d+(?:\.\d+)?)', t)
        r['kind'], r['currency'] = 'real_money', 'USD'
        r['amount'] = float(m.group(1)) if m else None
    elif 'gem' in low:
        m = re.search(r'(\d[\d,]*)', t)
        r['kind'], r['currency'] = 'gems', 'Gems'
        r['amount'] = int(m.group(1).replace(',', '')) if m else None
    else:
        items = []
        for m in re.finditer(r'(\d[\d,]*)\s*\{\{\s*I\s*\|\s*([^|}]+)', raw or ''):
            items.append({'amount': int(m.group(1).replace(',', '')), 'currency': m.group(2).strip()})
        r['kind'] = 'materials' if len(items) > 1 else 'other'
        if items:
            r['items'] = items
            r['currency'] = ' + '.join(i['currency'] for i in items)
            r['amount'] = items[0]['amount'] if len(items) == 1 else None
    return r


def fix_mojibake(s):
    if s is None:
        return s
    if re.search(r'[\u0080-\u00ff\u2018-\u203a\u0152\u0153\u0160\u0161\u017d\u017e\u0178\u02c6\u02dc\u2122]', s):
        try:
            return s.encode('cp1252').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def interlangs(text):
    """{'zh-tw': ..., 'vi': ..., 'ru': ...} từ các liên kết [[xx:...]] cuối trang."""
    d = OrderedDict()
    for m in re.finditer(r'^\[\[([a-z]{2,3}(?:-[a-z]+)?):([^\]\n]+)\]\]\s*$', text, flags=re.M):
        d[m.group(1)] = fix_mojibake(m.group(2).strip())
    return d


def categories_of(text):
    return [c.strip() for c in re.findall(r'\[\[Category:([^\]|]+)', text)]


def img_files(val):
    """Tên tệp trong giá trị image của infobox (đơn, gallery, hoặc [[File:]])."""
    if not val:
        return []
    out = []
    for m in re.finditer(r'([^\n|<>\[\]=]+?\.(?:png|gif|jpe?g|webp))', val, flags=re.I):
        n = re.sub(r'^(?:file|image):', '', m.group(1).strip(), flags=re.I).strip()
        if n and n not in out:
            out.append(n)
    return out


# ---------------------------------------------------------------- ảnh wiki + ghép sprite

_FILEINFO = {}


def file_infos(names):
    """{tên tệp: {url,width,height} | None} qua imageinfo, theo lô 50."""
    need = [n for n in names if n not in _FILEINFO]
    for i in range(0, len(need), 50):
        batch = need[i:i + 50]
        d = api({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url|size',
                 'titles': '|'.join('File:' + n for n in batch), 'redirects': '1',
                 'format': 'json', 'formatversion': '2'})
        q = d.get('query', {})
        norm = dict((n['from'], n['to']) for n in q.get('normalized', []))
        redir = dict((n['from'], n['to']) for n in q.get('redirects', []))
        pages = dict((p['title'], p) for p in q.get('pages', []))
        for n in batch:
            t = 'File:' + n
            t = norm.get(t, t)
            t = redir.get(t, t)
            p = pages.get(t)
            info = None
            if p and p.get('imageinfo'):
                ii = p['imageinfo'][0]
                info = {'url': ii['url'], 'width': ii.get('width'), 'height': ii.get('height')}
            _FILEINFO[n] = info
    return dict((n, _FILEINFO[n]) for n in names)


def image_candidates(page, ib, keys):
    """Tên tệp thử theo thứ tự: các tệp ghi trong infobox rồi 'Sprite <tên>.png' (wiki đã đổi tên nhiều ảnh cũ)."""
    c = []
    first = pick_image(ib or {}, *keys)
    if first:
        c.append(first)
    for k in keys:
        for f in img_files((ib or {}).get(k)):
            if f not in c:
                c.append(f)
    base = re.sub(r'\s+', ' ', page).strip()
    nop = re.sub(r'\s+', ' ', re.sub(r'[()]', '', base)).strip()
    nopar = re.sub(r'\s*\(.*?\)', '', base).strip()
    for n in (base, nop, nopar):
        f = 'Sprite %s.png' % n
        if f not in c:
            c.append(f)
    return c


def prefetch_images(pages, T, ib_re, *keys):
    """imageinfo theo lô cho mọi ứng viên trước khi dựng bản ghi (nhanh hơn gọi từng tệp)."""
    names = []
    for pg in pages:
        names += image_candidates(pg, infobox(T[pg] or '', ib_re), keys)
    file_infos(names)


def pick_image(fields, *keys):
    """Chọn tệp ảnh đại diện: png/jpg tĩnh trước gif, 'Sprite ...' đứng đầu."""
    cands = []
    for k in keys:
        for f in img_files(fields.get(k)):
            if f not in cands:
                cands.append(f)

    def rank(f):
        return (f.lower().endswith('.gif'), not f.lower().startswith('sprite'))
    cands.sort(key=rank)
    return cands[0] if cands else None


def download(url):
    ext = os.path.splitext(url.split('?')[0])[1] or '.bin'
    fn = os.path.join(IMGCACHE, hashlib.md5(url.encode('utf-8')).hexdigest() + ext)
    _cached_curl(url, fn)
    return fn


def image_record(fname):
    """{'file','url','width','height'} hoặc None."""
    if not fname:
        return None
    info = file_infos([fname])[fname]
    rec = OrderedDict([('file', fname), ('url', info['url'] if info else None)])
    if info:
        rec['width'], rec['height'] = info['width'], info['height']
    return rec


def resolve_image(page, ib, *keys):
    """Ảnh đại diện đầu tiên còn tồn tại trên wiki; nếu không có, bản ghi của ứng viên đầu (url None)."""
    cands = image_candidates(page, ib, keys)
    infos = file_infos(cands)
    for f in cands:
        if infos[f]:
            rec = image_record(f)
            if f != cands[0]:
                rec['fallback'] = True
            return rec
    return image_record(cands[0]) if cands else None


def image_path(rec):
    if not rec or not rec.get('url'):
        return None
    try:
        return download(rec['url'])
    except RuntimeError:
        return None


try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover
    np = None
    Image = None

from math import gcd

MIN_AREA = 48
CONVINCING = 0.90
NEAR = 0.75
TOL = 12


def load_rgba(path):
    im = Image.open(path)
    im.seek(0)
    a = np.array(im.convert('RGBA'))
    a[a[:, :, 3] == 0] = 0
    return a


def trim(a):
    ys, xs = np.nonzero(a[:, :, 3])
    if len(ys) == 0:
        return None
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def upscale_factor(a):
    """Bội số nguyên k nếu ảnh là phóng to nearest-neighbour đều k lần; 1 nếu không."""
    if a.shape[0] < 2 or a.shape[1] < 2:
        return 1
    xs = np.nonzero(np.any(a[:, 1:] != a[:, :-1], axis=(0, 2)))[0] + 1
    ys = np.nonzero(np.any(a[1:] != a[:-1], axis=(1, 2)))[0] + 1
    g = 0
    for v in list(xs) + list(ys):
        g = gcd(g, int(v))
        if g == 1:
            return 1
    return g if 1 < g <= 16 else 1


def estimate_scale(a):
    """Hệ số phóng to nearest-neighbour không nguyên, vd 4.54: đoạn cùng màu dài 4 và 5 xen kẽ, 9 và 10 cho hai ô.

    Lấy cụm run nhỏ nhất đủ đông ({m, m+1}) rồi tính trung bình theo tần suất. None nếu không thấy cụm.
    """
    xs = np.nonzero(np.any(a[:, 1:] != a[:, :-1], axis=(0, 2)))[0] + 1
    ys = np.nonzero(np.any(a[1:] != a[:-1], axis=(1, 2)))[0] + 1
    runs = np.concatenate([np.diff(xs), np.diff(ys)]).astype(int)
    runs = runs[(runs >= 3) & (runs <= 40)]
    if len(runs) < 20:
        return None
    cnt = np.bincount(runs, minlength=42)
    m0 = next((v for v in range(3, 41) if cnt[v] >= 0.15 * cnt.max()), None)
    if m0 is None:
        return None
    c0, c1 = cnt[m0], cnt[m0 + 1]
    if c0 + c1 < 10:
        return None
    return float((m0 * c0 + (m0 + 1) * c1) / float(c0 + c1))


def resample(a, nh, nw):
    """Lấy mẫu nearest-neighbour theo tâm ô về (nh, nw)."""
    h, w = a.shape[:2]
    yy = np.minimum(((np.arange(nh) + 0.5) * (h / float(nh))).astype(int), h - 1)
    xx = np.minimum(((np.arange(nw) + 0.5) * (w / float(nw))).astype(int), w - 1)
    return a[yy][:, xx]


def variants(a):
    """Các bản thu nhỏ để thử ghép: hệ số nguyên + các ước, hoặc hệ số lẻ ước lượng (kích thước +-1), rồi 1."""
    k = upscale_factor(a)
    out = []
    seen = set()

    def add(label, b):
        t = trim(b)
        if t is not None and t.shape not in seen:
            seen.add(t.shape)
            out.append((label, t))

    if k > 1:
        for f in [k] + [d for d in range(k - 1, 1, -1) if k % d == 0]:
            add(f, a[::f, ::f])
    else:
        fk = estimate_scale(a)
        if fk:
            h, w = a.shape[:2]
            nh0, nw0 = int(round(h / fk)), int(round(w / fk))
            for dh in (0, -1, 1):
                for dw in (0, -1, 1):
                    if nh0 + dh >= 1 and nw0 + dw >= 1:
                        add(round(fk, 3), resample(a, nh0 + dh, nw0 + dw))
    add(1, a)
    return out


def transforms(t):
    yield 'id', t
    yield 'flipx', t[:, ::-1]
    yield 'flipy', t[::-1]
    yield 'rot180', t[::-1, ::-1]
    yield 'transpose', np.transpose(t, (1, 0, 2))
    yield 'rot90', np.rot90(t, 1)
    yield 'rot270', np.rot90(t, 3)


def pix_score(a, b):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    both_clear = (a[:, :, 3] <= TOL) & (b[:, :, 3] <= TOL)
    ok = (d.max(axis=2) <= TOL) | both_clear
    return float(ok.mean())


PRIORITY = {
    'weapon': ('weapon', 'sprite_atlas', 'skin/weapon', 'bullet', 'common'),
    'boss': ('boss', 'level', 'monster_rise', 'levelcommon', 'sprite_atlas', 'common'),
    'enemy': ('monster_rise', 'level', 'levelcommon', 'boss', 'sprite_atlas', 'common'),
}


def _prio(kind, bundle):
    order = PRIORITY.get(kind, ())
    for i, p in enumerate(order):
        if bundle == p or bundle.startswith(p + '/'):
            return i
    return len(order)


class SpriteIndex(object):
    """Chỉ mục kho bóc: (rộng, cao) sau khi cắt viền trong suốt -> [(bundle, tên, bbox)]."""

    def __init__(self):
        self.by_size = defaultdict(list)
        self.n = 0
        self._pix = {}
        self._load()

    def _load(self):
        fn = os.path.join(CACHE, 'rip-bbox.tsv')
        if not os.path.exists(fn):
            self._build(fn)
        with io.open(fn, encoding='utf-8') as f:
            for line in f:
                b, n, x0, y0, x1, y1 = line.rstrip('\n').split('\t')
                x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
                self.by_size[(x1 - x0, y1 - y0)].append((b, n, (x0, y0, x1, y1)))
                self.n += 1

    def _build(self, fn):
        print('  dựng chỉ mục kho bóc lần đầu (~2 phút)...', file=sys.stderr)
        tmp = fn + '.part'
        cnt = 0
        with io.open(os.path.join(RIP, 'manifest.tsv'), encoding='utf-8') as m, \
                io.open(tmp, 'w', encoding='utf-8', newline='\n') as out:
            for line in m:
                p = line.rstrip('\n').split('\t')
                if len(p) < 4:
                    continue
                b, n = p[0], p[1]
                try:
                    im = Image.open(os.path.join(RIP, b, n + '.png')).convert('RGBA')
                    bb = im.getchannel('A').getbbox()
                except Exception:
                    continue
                if not bb:
                    continue
                out.write('%s\t%s\t%d\t%d\t%d\t%d\n' % ((b, n) + bb))
                cnt += 1
        os.replace(tmp, fn)
        print('  đã lập chỉ mục %d ảnh' % cnt, file=sys.stderr)

    def pixels(self, b, n, bb):
        key = (b, n)
        a = self._pix.get(key)
        if a is None:
            im = np.array(Image.open(os.path.join(RIP, b, n + '.png')).convert('RGBA'))
            im[im[:, :, 3] == 0] = 0
            a = im[bb[1]:bb[3], bb[0]:bb[2]]
            if len(self._pix) > 4000:
                self._pix.clear()
            self._pix[key] = a
        return a

    def match(self, path, kind):
        """(record | None, note, near | None).

        record: điểm >= CONVINCING. near: điểm tốt nhất trong [NEAR, CONVINCING), chưa đủ tin (sprite bị vẽ lại / đổi màu).
        Trường: bundle, name, score, mask (tỉ lệ pixel trùng hình dạng), factor, transform, equal, alts.
        """
        try:
            a = load_rgba(path)
        except Exception as e:
            return None, 'không đọc được ảnh (%s)' % e.__class__.__name__, None
        vs = variants(a)
        if not vs:
            return None, 'ảnh trống', None
        best = None
        best_arrs = None
        seen_size = False
        for f, t in vs:
            if t.shape[0] * t.shape[1] < MIN_AREA:
                continue
            for tname, ta in transforms(t):
                h, w = ta.shape[:2]
                cands = self.by_size.get((w, h), [])
                if not cands:
                    continue
                seen_size = True
                scored = [(pix_score(ta, self.pixels(b, n, bb)), b, n, bb) for b, n, bb in cands]
                top = max(x[0] for x in scored)
                if best is None or top > best['score'] + 1e-9:
                    tops = sorted([x for x in scored if x[0] >= top - 1e-9],
                                  key=lambda x: (_prio(kind, x[1]), x[1], x[2]))
                    best = OrderedDict([('bundle', tops[0][1]), ('name', tops[0][2]), ('score', round(top, 4)),
                                        ('mask', None), ('factor', f), ('transform', tname), ('equal', len(tops)),
                                        ('alts', ['%s/%s' % (x[1], x[2]) for x in tops[1:6]])])
                    best_arrs = (ta, self.pixels(tops[0][1], tops[0][2], tops[0][3]))
            if best and best['score'] >= CONVINCING:
                break
        if best:
            ta, ca = best_arrs
            best['mask'] = round(float(((ta[:, :, 3] > TOL) == (ca[:, :, 3] > TOL)).mean()), 4)
        if best and best['score'] >= CONVINCING:
            return best, None, None
        if not seen_size:
            return None, 'không sprite nào cùng kích thước sau khi cắt viền (%dx%d, hệ số %s)' % (
                vs[0][1].shape[1], vs[0][1].shape[0], vs[0][0]), None
        near = best if best['score'] >= NEAR else None
        return None, 'điểm tốt nhất %.2f < %.2f (%s/%s)' % (best['score'], CONVINCING, best['bundle'], best['name']), near


_INDEX = []


def sprite_index():
    if not _INDEX:
        _INDEX.append(SpriteIndex())
    return _INDEX[0]


def attach_sprite(rec, kind):
    """Gắn rec['sprite'] (hoặc None) và rec['sprite_note'] từ rec['image']."""
    p = image_path(rec.get('image'))
    if not p:
        rec['sprite'] = None
        rec['sprite_note'] = 'không có ảnh wiki' if not rec.get('image') else (
            'tệp ảnh không còn trên wiki (%s)' % rec['image']['file'] if not rec['image'].get('url') else 'không tải được ảnh')
        return
    m, note, near = sprite_index().match(p, kind)
    rec['sprite'] = m
    if note:
        rec['sprite_note'] = note
    if near:
        rec['sprite_near'] = near


# ---------------------------------------------------------------- giai đoạn: vũ khí

WEAPON_IB = r'Soul[ _]Knight[ _]Weapon[ _]Infobox'
HERO_IB = r'Soul[ _]Knight[ _]Character[ _]Infobox'
SKILL_IB = r'Soul[ _]Knight[ _]Skill[ _]Infobox'
BOSS_IB = r'Soul[ _]Knight[ _]Boss[ _]Infobox'
ENEMY_IB = r'Soul[ _]Knight[ _]Enemy[ _]Infobox'

ALIASES = {
    'accuracy': ('accuracy', 'Inaccuracy'),
    'rounds_per_second': ('rounds_per_second', 'round_per_second'),
    'number_of_projectiles': ('number_of_projectiles', 'number_of_projectile'),
}


def first_of(ib, keys):
    for k in keys:
        if k in ib:
            return ib[k]
    return None


def clip(s, n):
    s = s.strip()
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + ' ...'


def usage_text(text, page):
    for names in (['usage'], ['attack', 'attacks', 'basics', 'how to use', 'stats', 'statistics', 'skill']):
        sec = section(text, names)
        if sec and plain(sec, page):
            return clip(plain(sec, page), 600), names[0]
    body = re.sub(r'^\{\{.*?\n\}\}', '', text, count=1, flags=re.S)
    body = re.split(r'^==', body, 1, flags=re.M)[0]
    return clip(plain(body, page), 600), 'lead'


def split_rarity(raw):
    t = plain(re.sub(r'<[^>]+>', '', raw or ''))
    base, _, up = t.partition('→')
    base = base.strip()
    color, _, tier = base.partition('/')
    r = OrderedDict([('raw', raw), ('color', color.strip() or None), ('tier', tier.strip() or None)])
    if up.strip():
        r['upgraded'] = up.strip()
    return r


def stage_weapons():
    pages = category('Weapons')
    T = wikitext(pages)
    prefetch_images(pages, T, WEAPON_IB, 'image1', 'image2')
    out = []
    for page in pages:
        text = T[page]
        ib = infobox(text, WEAPON_IB)
        if ib is None:
            continue
        w = OrderedDict()
        w['name'] = page
        w['page'] = 'https://soul-knight.fandom.com/wiki/' + quote(page.replace(' ', '_'))
        w['id'] = ib.get('id') or None
        w['type'] = plain(ib.get('type', '')) or None
        w['subtypes'] = [s.strip() for s in plain(ib.get('subtype(s)', '')).split(',') if s.strip()]
        w['rarity'] = split_rarity(ib.get('rarity'))
        w['grade'] = parse_stat(ib.get('grade'))
        w['damage'] = parse_stat(ib.get('damage'))
        w['ammo_cost'] = parse_stat(ib.get('ammo_cost'))
        w['critical_chance'] = parse_stat(ib.get('critical_chance'))
        w['accuracy'] = parse_stat(first_of(ib, ALIASES['accuracy']))
        w['speed'] = parse_stat(ib.get('speed'))
        w['rounds_per_second'] = parse_stat(first_of(ib, ALIASES['rounds_per_second']))
        w['number_of_projectiles'] = parse_stat(first_of(ib, ALIASES['number_of_projectiles']))
        w['charge_time'] = parse_stat(ib.get('charge_time'))
        w['dps'] = parse_stat(ib.get('dps'))
        w['forging'] = OrderedDict((k[8:], num_of(v)) for k, v in ib.items() if k.startswith('forging_'))
        w['evolution'] = OrderedDict((k[4:], v) for k, v in ib.items() if k.startswith('evo'))
        w['infobox'] = ib
        w['names'] = interlangs(text)
        w['categories'] = categories_of(text)
        w['usage'], w['usage_source'] = usage_text(text, page)
        w['image'] = resolve_image(page, ib, 'image1', 'image2')
        out.append(w)
    for w in out:
        attach_sprite(w, 'weapon')
    out.sort(key=lambda w: w['name'].lower())
    return out


def num_of(v):
    p = parse_stat(v)
    return p['number'] if p.get('number') is not None else plain(v)


# ---------------------------------------------------------------- giai đoạn: nhân vật

def parse_upgrade_table(sec):
    rows = []
    if not sec:
        return rows
    for chunk in re.split(r'^\|-\s*$', sec, flags=re.M):
        cells = split_top(re.sub(r'^\s*\|', '', chunk.strip(), count=1), '||')
        if len(cells) < 4 or not re.match(r'^\s*\d+\s*$', cells[0]):
            continue
        rows.append(OrderedDict([('level', int(cells[0])), ('upgrade', plain(cells[2])),
                                 ('cost', num_of(cells[3]))]))
    return rows


def parse_cooldown(raw):
    r = OrderedDict([('raw', raw)])
    p = parse_stat(raw)
    parts = p.get('parts', [])
    m = re.match(r'^\s*([\d.~]+)\s*\(([\d.~]+)\)\s*$', plain(raw or ''))
    if m:
        a, b = _val(m.group(1)), _val(m.group(2))
        r['base'] = a.get('value', a.get('min')) if a else None
        r['upgraded'] = b.get('value', b.get('min')) if b else None
    else:
        r['base'] = p.get('number')
    return r


def duration_of(text):
    t = plain(text or '')
    m = re.search(r'(?:for|lasts?|duration of|within)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b', t, re.I)
    if not m:
        return None, None
    a = max(0, m.start() - 60)
    return float(m.group(1)) if '.' in m.group(1) else int(m.group(1)), t[a:m.end() + 20].replace('\n', ' ')


def stage_heroes():
    pages = [t for t in category('Characters') if '/' not in t]
    T = wikitext(pages)
    prefetch_images(pages, T, HERO_IB, 'image1')
    out = []
    for page in pages:
        text = T[page]
        ib = infobox(text, HERO_IB)
        if ib is None:
            continue
        h = OrderedDict()
        h['name'] = page
        h['page'] = 'https://soul-knight.fandom.com/wiki/' + quote(page.replace(' ', '_'))
        langs = interlangs(text)
        h['name_zh_tw'] = langs.get('zh-tw')
        h['names'] = langs
        h['hp'] = num_of(ib.get('health'))
        h['armor'] = num_of(ib.get('armor'))
        h['energy'] = num_of(ib.get('energy'))
        h['crit'] = num_of(ib.get('critical_chance'))
        h['melee_damage'] = num_of(ib.get('melee_damage'))
        h['speed'] = num_of(ib.get('speed')) if 'speed' in ib else None
        h['passive'] = plain(ib.get('buff', '')) or None
        h['starting_weapon'] = plain(ib.get('weapon', '')) or None
        h['unlock'] = parse_price(ib.get('price'))
        usec = section_re(text, r'unlock')
        h['unlock_text'] = clip(plain(re.split(r'<table|\{\|', usec or '', 1)[0], page), 400) if usec else None
        h['upgrades'] = parse_upgrade_table(usec)
        skills = []
        boxes = find_templates(text, SKILL_IB)
        names = [plain(ib[k]) for k in ('skill1', 'skill2', 'skill3', 'skill4') if k in ib]
        for i, (_, body) in enumerate(boxes):
            f = OrderedDict()
            for p in split_top(body)[1:]:
                if '=' in p:
                    k, v = p.split('=', 1)
                    f[k.strip()] = v.strip()
            nm = plain(f['skill']) if 'skill' in f else ' / '.join(plain(f[k]) for k in sorted(f) if re.match(r'skill\d', k))
            sk = OrderedDict([('slot', i + 1), ('name', nm or (names[i] if i < len(names) else None)),
                              ('unlock', parse_price(f.get('unlock'))),
                              ('cooldown', parse_cooldown(f.get('cd')))])
            sk['description'] = plain(f.get('basic'), page) or None
            sk['upgrade'] = plain(f.get('upgrade'), page) or None
            sk['mentor_upgrade'] = plain(f.get('mentor'), page) or None
            dur, ctx = duration_of(f.get('basic'))
            sk['duration_s'], sk['duration_context'] = dur, ctx
            sk['fields'] = f
            skills.append(sk)
        # phần mô tả chi tiết: mục '== Skill N - Tên =='
        heads = [(l, hd, b) for l, hd, b in sections(text) if re.match(r'skill\s*\d', hd, re.I)]
        for sk, (_, hd, body) in zip(skills, heads):
            body = re.sub(r'\{\{Soul[ _]Knight[ _]Skill[ _]Infobox.*?\n\}\}', '', body, flags=re.S)
            sk['detail'] = clip(plain(body, page), 700)
            if sk['duration_s'] is None:
                d, c = duration_of(body)
                if d is not None:
                    sk['duration_s'], sk['duration_context'] = d, c
        h['skills'] = skills
        h['skill_names_infobox'] = names
        h['infobox'] = OrderedDict((k, v) for k, v in ib.items())
        h['image'] = resolve_image(page, ib, 'image1')
        out.append(h)
    out.sort(key=lambda h: h['name'].lower())
    return out


# ---------------------------------------------------------------- giai đoạn: boss / quái

def biome_titles():
    return category('Levels')


def biome_display(t):
    return re.sub(r'\s*\(.*\)$', '', t)


def parse_found_in(raw, biomes, modes):
    """found_in của infobox -> levels/biomes/modes.

    normal_* chỉ lấy từ những dòng có cả 'cấp N-M' lẫn tên biome mà không nhắc chế độ sự kiện.
    """
    out = OrderedDict([('raw', raw)])
    segs = [x for x in re.split(r'\n|<br\s*/?>', raw or '') if x.strip()]
    lv_all, lv_norm, bi_norm, mo_all = set(), set(), [], []
    spans = []
    skip_modes = ('Level Mode', 'Multiplayer')
    for sg in segs:
        t = plain(sg)
        lv = set('%s-%s' % m for m in re.findall(r'(?<![\d.])(\d{1,2})-(\d{1,2}|[xX])(?![\d])', t))
        bs = [b for b in biomes if re.search(r'\b%s\b' % re.escape(biome_display(b)), t)]
        links = re.findall(r'\[\[([^\]|]+)', sg)
        ms = [m for m in modes if m not in skip_modes and (m in links or re.search(r'\b%s\b' % re.escape(m), t))]
        lv_all |= lv
        if lv and bs and not ms:
            for m in re.finditer(r'(\d)-(\d|[xX])(?:\s*(?:to|~|-)\s*(\d)-(\d))?', t):
                lo = 1 if m.group(2) in 'xX' else int(m.group(2))
                hi = 5 if m.group(2) in 'xX' else int(m.group(4) or m.group(2))
                spans.append(OrderedDict([('floor', int(m.group(1))), ('from', lo), ('to', hi)]))
        for m in ms:
            if m not in mo_all:
                mo_all.append(m)
        if lv and bs and not ms:
            lv_norm |= lv
            bi_norm += [b for b in bs if b not in bi_norm]
    out['levels'] = sorted(lv_all)
    out['modes'] = mo_all
    out['normal_levels'] = sorted(lv_norm)
    out['normal_biomes'] = bi_norm
    out['normal_spans'] = spans
    out['biomes'] = [b for b in biomes if re.search(r'\b%s\b' % re.escape(biome_display(b)), plain(raw or ''))]
    return out


def collect_bosses():
    pages = [t for t in category('Bosses') if '/' not in t]
    biomes = biome_titles()
    modes = [m for m in category('Modes') if not m.startswith('File:')]
    T = wikitext(pages)
    TT = wikitext([p + '/Tactics' for p in pages])
    prefetch_images(pages, T, BOSS_IB, 'image1')
    out = []
    for page in pages:
        text = T[page] or ''
        ib = infobox(text, BOSS_IB)
        if ib is None:
            continue
        b = OrderedDict()
        b['name'] = page
        b['page'] = 'https://soul-knight.fandom.com/wiki/' + quote(page.replace(' ', '_'))
        b['found_in'] = parse_found_in(ib.get('found_in'), biomes, modes)
        b['normal_mode'] = bool(b['found_in']['normal_levels'])
        b['health'] = parse_stat(ib.get('health'))
        b['health_champion'] = parse_stat(ib.get('champion'))
        b['health_special'] = plain(ib.get('health_special', '')) or None
        b['unique_attacks'] = plain(ib.get('number_of_unique_attacks', '')) or None
        b['motif_weapon'] = plain(ib.get('motif_weapon', '')) or None
        b['drops'] = OrderedDict([('rare', [plain(x).lstrip('- ').strip() for x in plain(ib.get('rare_drops', '')).split('\n') if x.strip()]),
                                  ('common', [plain(x).lstrip('- ').strip() for x in plain(ib.get('common_drops', '')).split('\n') if x.strip()])])
        b['categories'] = categories_of(text)
        b['names'] = interlangs(text)
        tt = TT.get(page + '/Tactics') or ''
        attacks = []
        heads = sections(tt)
        for i, (lvl, hd, body) in enumerate(heads):
            if lvl == 2 and re.search(r'attack', hd, re.I):
                general = plain(body, page)
                if general:
                    attacks.append(OrderedDict([('name', '(chung)'), ('text', clip(general, 700))]))
                for lvl2, hd2, body2 in heads[i + 1:]:
                    if lvl2 <= 2:
                        break
                    attacks.append(OrderedDict([('name', plain(hd2, page)), ('text', clip(plain(body2, page), 700))]))
                break
        b['attacks'] = attacks
        tsec = section(tt, ['tactics', 'strategy'])
        b['tactics'] = clip(plain(tsec, page), 1200) if tsec else None
        room = section(text, ['room', 'arena'])
        b['room'] = clip(plain(room, page), 600) if room else None
        b['image'] = resolve_image(page, ib, 'image1')
        out.append(b)
    out.sort(key=lambda b: b['name'].lower())
    return out


def stage_bosses():
    out = collect_bosses()
    for b in out:
        attach_sprite(b, 'boss')
    return out


def hp_pair(raw):
    """'8 <br/> 26 {{Champion}}' -> {'normal': 8, 'champion': 26}."""
    d = OrderedDict([('raw', raw)])
    lines = [l for l in re.split(r'<br\s*/?>|\n', raw or '') if l.strip()]
    for l in lines:
        champ = 'champion' in l.lower()
        v = parse_stat(re.sub(r'\{\{[^{}]*\}\}', '', l))
        key = 'champion' if champ else 'normal'
        if key not in d:
            d[key] = v.get('number')
            if len(v.get('parts', [])) and 'text' in v['parts'][0]:
                d[key + '_text'] = v['parts'][0]['text']
    return d


def norm_key(s):
    return re.sub(r'[^a-z0-9]', '', plain(s).lower())


def biome_enemy_rows(text):
    """Bảng '==Enemies==' của trang biome -> [{id,name,hp,behavior,levels}]."""
    sec = section(text, ['enemies'])
    rows = []
    if not sec:
        return rows
    for m in re.finditer(r'^\|-\s*id="([^"]+)"\s*\n(.*?)(?=^\|-|^\|\})', sec, flags=re.S | re.M):
        lines = m.group(2).rstrip().split('\n')
        r = OrderedDict([('id', m.group(1))])
        cells = split_top(lines[0][1:], '||') if lines and lines[0].startswith('|') else []
        if len(cells) >= 2 and len(lines) >= 2 and lines[-1].startswith('|'):
            hp = re.match(r'\s*(\d+)\s*\{\{\s*I\s*\|\s*Health', cells[0])
            r['hp'] = int(hp.group(1)) if hp else None
            r['name'] = plain(cells[1])
            r['behavior'] = plain('\n'.join(lines[1:-1]), m.group(1))
            r['levels'] = [int(x) for x in re.findall(r'\d+', lines[-1])]
        else:
            r['raw'] = clip(m.group(2), 500)
        rows.append(r)
    return rows


def stage_enemies():
    pages = [t for t in category('Enemies') if '/' not in t]
    boss_names = set(t for t in category('Bosses') if '/' not in t)
    biomes = biome_titles()
    BT = wikitext(biomes)
    beh = {}
    for bt in biomes:
        for r in biome_enemy_rows(BT[bt] or ''):
            r['biome'] = bt
            beh.setdefault(norm_key(r['id']), []).append(r)
    T = wikitext(pages)
    prefetch_images([p for p in pages if p not in boss_names], T, ENEMY_IB, 'image1', 'image2')
    out = []
    for page in pages:
        if page in boss_names:
            continue
        text = T[page] or ''
        ib = infobox(text, ENEMY_IB)
        if ib is None:
            continue
        e = OrderedDict()
        e['name'] = page
        e['page'] = 'https://soul-knight.fandom.com/wiki/' + quote(page.replace(' ', '_'))
        e['type'] = plain(ib.get('type(s)', '')) or None
        e['health'] = hp_pair(ib.get('health'))
        e['damage'] = hp_pair(ib.get('damage'))
        e['weapon'] = plain(ib.get('weapon', '')) or None
        fi = parse_found_in(ib.get('found_in'), biomes, [])
        e['found_in'] = fi
        e['behavior'] = None
        rows = beh.get(norm_key(page)) or []
        if rows:
            e['behavior'] = rows[0].get('behavior')
            e['levels_in_floor'] = rows[0].get('levels')
            e['biome_page'] = rows[0]['biome']
        e['categories'] = categories_of(text)
        e['image'] = resolve_image(page, ib, 'image1', 'image2')
        out.append(e)
    for e in out:
        attach_sprite(e, 'enemy')
    out.sort(key=lambda e: e['name'].lower())
    return out


# ---------------------------------------------------------------- giai đoạn: màn chơi

LEVEL_PAGES = ['Levels', 'Level Mode', 'Boss Room', 'Enemies', 'Badass Mode', 'Secret Rooms', 'Chests', 'Shop',
               'Portals', 'Statues', 'Coins', 'Turrets Room', 'Scammer', 'Magic Stone', 'Mysterious Trader',
               'Kind Trader', 'Followers', 'Boss Rush Mode', 'Buffs']


def snippets(page, text, limit=2500):
    out = []
    for lvl, hd, body in sections(text):
        t = plain(body, page)
        if t:
            out.append(OrderedDict([('heading', plain(hd, page)), ('text', clip(t, limit))]))
    lead = re.split(r'^==', text, 1, flags=re.M)[0]
    lead = re.sub(r'^\{\{.*?\n\}\}', '', lead, count=1, flags=re.S)
    return OrderedDict([('page', 'https://soul-knight.fandom.com/wiki/' + quote(page.replace(' ', '_'))),
                        ('lead', clip(plain(lead, page), limit)), ('sections', out)])


def parse_biome_floor_table(text):
    sec = section(text, ['biomes'])
    res = []
    floor, hidden = None, None
    for row in re.split(r'^\|-\s*$', sec or '', flags=re.M):
        for line in row.split('\n'):
            if not line.startswith('|') or line.startswith('|}') or line.startswith('|+'):
                continue
            c = line[1:].strip()
            m = re.search(r'Floor\s*(\d)', c)
            if m:
                floor = int(m.group(1))
                h = re.search(r'hidden in (\w+)', c)
                hidden = h.group(1) if h else None
            elif '[[' in c and floor:
                lm = re.search(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', c)
                res.append(OrderedDict([('biome', lm.group(1)), ('display', lm.group(2) or lm.group(1)),
                                        ('floor', floor), ('hidden_from', hidden)]))
    return res


def parse_floor_details(text):
    floors = []
    for lvl, hd, body in sections(text):
        m = re.match(r'Floor\s*(\d)', hd)
        if lvl != 3 or not m:
            continue
        levels = []
        for line in body.split('\n'):
            lm = re.match(r'^\*\s*Level\s*(\d+)-(\d+)\s*(?:\(([^)]*)\))?\s*-?\s*(.*)$', line.strip())
            if not lm:
                continue
            rest = plain(lm.group(4))
            cond = plain(lm.group(3) or '')
            allt = (rest + ' ' + cond).lower()
            levels.append(OrderedDict([('id', '%s-%s' % (lm.group(1), lm.group(2))), ('raw', plain(line.strip().lstrip('*'))),
                                       ('boss', 'boss' in allt), ('buff_at_end', 'buff' in allt),
                                       ('scammer', 'scammer' in allt), ('magic_stone', 'magic stone' in allt)]))
        lead = plain(re.split(r'^\*', body, 1, flags=re.M)[0])
        floors.append(OrderedDict([('floor', int(m.group(1))), ('note', lead), ('levels', levels)]))
    return floors


def parse_room_types(text):
    out = []
    for lvl, hd, body in sections(text):
        m = re.search(r'\[\[(?:File|file):([^|\]]*Room Icon[^|\]]*)', hd)
        if not m:
            continue
        idm = re.search(r'id="([^"]+)"', hd)
        out.append(OrderedDict([('type', idm.group(1) if idm else None), ('icon', m.group(1).strip()),
                                ('heading', plain(hd)), ('text', clip(plain(body), 900))]))
    return out


def parse_room_contents(level_mode_text):
    """Danh sách nội dung phòng rương/đặc biệt và câu mô tả phòng cổng/boss/vào trong trang Level Mode."""
    out = OrderedDict([('chest_room', None), ('special_room', None), ('mentions', OrderedDict())])
    lines = level_mode_text.split('\n')
    group = None
    for l in lines:
        if l.startswith(':') and 'may contain' in l:
            group = 'chest_room' if 'Chest Room Icon' in l else 'special_room' if 'Special Room Icon' in l else None
            if group:
                out[group] = OrderedDict([('intro', plain(l.lstrip(': '))), ('items', [])])
            continue
        if group and l.startswith('*'):
            depth = len(l) - len(l.lstrip('*'))
            out[group]['items'].append(OrderedDict([('depth', depth), ('text', plain(l.lstrip('*').strip()))]))
            continue
        if group and l.strip() and not l.startswith('*'):
            group = None
        for icon in re.findall(r'File:([^|\]]*Room Icon[^|\]]*)', l):
            out['mentions'].setdefault(icon.strip(), [])
            t = plain(l.lstrip(':* '))
            if t and t not in out['mentions'][icon.strip()]:
                out['mentions'][icon.strip()].append(t)
    return out


def stage_levels():
    biomes = biome_titles()
    BT = wikitext(biomes)
    PT = wikitext(LEVEL_PAGES)
    levels_text = PT['Levels'] or ''
    table = parse_biome_floor_table(levels_text)
    bosses = collect_bosses()
    res = OrderedDict()
    res['source'] = 'https://soul-knight.fandom.com/wiki/Levels'
    res['floors'] = parse_floor_details(levels_text)
    floor_of = dict((r['biome'], r) for r in table)
    for f in res['floors']:
        f['biomes'] = [r['biome'] for r in table if r['floor'] == f['floor'] and not r['hidden_from']]
        f['hidden_biomes'] = [OrderedDict([('biome', r['biome']), ('reached_from', r['hidden_from'])])
                              for r in table if r['floor'] == f['floor'] and r['hidden_from']]
    res['biomes'] = OrderedDict()
    for bt in biomes:
        text = BT[bt] or ''
        d = OrderedDict()
        d['page'] = 'https://soul-knight.fandom.com/wiki/' + quote(bt.replace(' ', '_'))
        fl = floor_of.get(bt)
        d['floor'] = fl['floor'] if fl else None
        d['hidden_from'] = fl['hidden_from'] if fl else None
        desc = infobox(text, r'BiomeBasicDescription')
        d['description'] = OrderedDict((k, plain(v)) for k, v in (desc or {}).items())
        d['bosses'] = [OrderedDict([('name', b['name']), ('levels', b['found_in']['normal_levels']), ('hp', b['health'].get('number'))])
                       for b in bosses if bt in b['found_in']['normal_biomes']]
        d['enemies'] = biome_enemy_rows(text)
        d['sections'] = [s for s in snippets(bt, text, 1500)['sections'] if s['heading'] != 'Enemies']
        res['biomes'][bt] = d
    res['bosses_by_level'] = OrderedDict()
    for b in bosses:
        if not b['normal_mode']:
            continue
        for lv in b['found_in']['normal_levels']:
            res['bosses_by_level'].setdefault(lv, []).append(OrderedDict([('name', b['name']), ('biomes', b['found_in']['normal_biomes']),
                                                                          ('hp', b['health'].get('number'))]))
    res['bosses_by_level'] = OrderedDict(sorted(res['bosses_by_level'].items()))
    lm = PT['Level Mode'] or ''
    res['room_types'] = OrderedDict([('from_level_mode', parse_room_contents(lm)),
                                     ('from_boss_room_page', parse_room_types(PT['Boss Room'] or ''))])
    res['pages'] = OrderedDict((p, snippets(p, PT[p])) for p in LEVEL_PAGES if PT[p])
    # câu nhắc tới rớt vàng/năng lượng/rương/đợt quái ở các trang màn chơi
    kw = re.compile(r'\b(drop|energy|gold|coins?|chests?|waves?|badass|champions?|elite|gems?)\b', re.I)
    hits = []
    for p in LEVEL_PAGES + biomes:
        text = PT.get(p) or BT.get(p) or ''
        for lvl, hd, body in sections(text):
            for line in plain(body, p).split('\n'):
                if kw.search(line) and 20 < len(line) < 400:
                    hits.append(OrderedDict([('page', p), ('section', plain(hd)), ('text', line.strip())]))
    res['keyword_snippets'] = hits
    return res


# ---------------------------------------------------------------- điều phối

def match_stats(rows):
    n = len(rows)
    withimg = sum(1 for r in rows if r.get('image') and r['image'].get('url'))
    m = sum(1 for r in rows if r.get('sprite'))
    ex = sum(1 for r in rows if r.get('sprite') and r['sprite']['score'] >= 0.999)
    near = sum(1 for r in rows if not r.get('sprite') and r.get('sprite_near'))
    return OrderedDict([('total', n), ('with_image', withimg), ('matched', m), ('matched_exact', ex),
                        ('near_only', near),
                        ('rate_of_all', round(m / float(n), 3) if n else None),
                        ('rate_of_with_image', round(m / float(withimg), 3) if withimg else None)])


def write_json(name, data):
    fn = os.path.join(OUT, name)
    with io.open(fn, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=False))
        f.write('\n')
    return fn


def main(argv):
    want = argv[1:] or ['weapons', 'heroes', 'bosses', 'levels', 'enemies']
    stats = OrderedDict()
    sp = os.path.join(OUT, 'stats.json')
    if os.path.exists(sp):
        with io.open(sp, encoding='utf-8') as f:
            stats = json.load(f, object_pairs_hook=OrderedDict)
    stages = OrderedDict([('weapons', stage_weapons), ('heroes', stage_heroes), ('bosses', stage_bosses),
                          ('levels', stage_levels), ('enemies', stage_enemies)])
    for name in want:
        t0 = time.time()
        data = stages[name]()
        write_json(name + '.json', data)
        if name in ('weapons', 'bosses', 'enemies'):
            stats[name] = match_stats(data)
        else:
            stats[name] = OrderedDict([('total', len(data))]) if isinstance(data, list) else \
                OrderedDict([('biomes', len(data['biomes'])), ('floors', len(data['floors']))])
        print('%-8s %s  (%.1fs)' % (name, json.dumps(stats[name], ensure_ascii=False), time.time() - t0))
    write_json('stats.json', stats)


if __name__ == '__main__':
    main(sys.argv)
