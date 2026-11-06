# -*- coding: utf-8 -*-
"""Chợ Phiên — dựng tờ so sánh "game gốc vs bản web" cho từng khoảnh khắc.

Đầu vào (theo D:\\bazaar-ref\\notes\\MOMENTS.md):
  ref\\<moment>\\01.jpg..NN.jpg + meta.json   (game gốc, từ clip YouTube; có thể thêm a\\, b\\, c\\ nếu có nhiều bản)
  web\\<moment>\\01.png..NN.png + meta.json   (bản web, do test/bazaar-capture.js chụp)
Đầu ra:
  compare\\<moment>.jpg   hàng trên = khung gốc, hàng dưới = khung web (cùng số cột, cùng nhịp 10 khung/giây theo thời gian),
                          đầu tờ: mã khoảnh khắc, link clip, thời lượng đo được hai bên cạnh nhau
  compare\\index.html     mọi khoảnh khắc + thời lượng hai bên + trạng thái (ok / thiếu ref / thiếu web)

Chạy (Python 3.8, Pillow):  python -I games/bazaar/tools/compare_sheet.py [--moments a,b] [--root D:/bazaar-ref]
Chạy lại được; ghi đè tờ cũ. Không đụng vào ref\\ và web\\.
"""
import argparse
import html
import io
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # Python < 3.7 hoặc luồng lạ
    pass

COLS = 8           # tối đa số cột mỗi dải
MAX_FRAMES = 48    # tối đa số khung so sánh (4 dải)
CELL_W = 220
HEAD_H = 96
BG = (22, 24, 29)
FG = (236, 236, 240)
DIM = (150, 156, 170)
ACC = (255, 211, 107)
GOOD = (120, 220, 140)
BAD = (255, 120, 110)


def font(size, bold=False):
    names = (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"])
    for n in names:
        for d in ("C:/Windows/Fonts/", "/usr/share/fonts/truetype/dejavu/"):
            p = d + n
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()


def read_json(p):
    try:
        with io.open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def parse_moments(notes):
    ids, run_flow = [], False
    try:
        lines = io.open(notes, encoding="utf-8").read().splitlines()
    except Exception:
        return ids
    for l in lines:
        if re.match(r"^Run flow", l):
            run_flow = True
            continue
        if not re.match(r"^\s*-\s|^\s+`", l):
            continue
        if run_flow:
            ids += re.findall(r"`([a-z0-9-]+)`", l)
            continue
        m = re.match(r"^- ((?:`[a-z0-9-]+`[,\s]*)+)", l)
        if m:
            ids += re.findall(r"`([a-z0-9-]+)`", m.group(1))
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def frames_in(d, exts):
    try:
        fs = sorted(f for f in os.listdir(d) if re.match(r"^\d+\.(%s)$" % "|".join(exts), f))
    except Exception:
        return []
    return [os.path.join(d, f) for f in fs]


def ref_sets(root, mid):
    """[(tên, thư mục)] — bản chính + a, b, c nếu có"""
    base = os.path.join(root, "ref", mid)
    sets = []
    if frames_in(base, ("jpg", "jpeg", "png")):
        sets.append(("ref", base))
    for sub in ("a", "b", "c"):
        d = os.path.join(base, sub)
        if frames_in(d, ("jpg", "jpeg", "png")):
            sets.append(("ref " + sub, d))
    return sets


def fit(img, w, h):
    """đặt vừa khung w×h, giữ tỉ lệ, nền tối"""
    img = img.convert("RGB")
    s = min(w / img.width, h / img.height)
    nw, nh = max(1, int(img.width * s)), max(1, int(img.height * s))
    out = Image.new("RGB", (w, h), (10, 11, 14))
    out.paste(img.resize((nw, nh), Image.LANCZOS), ((w - nw) // 2, (h - nh) // 2))
    return out


def pick(paths, fps, n, step_s):
    """n khung cách nhau step_s giây (theo fps của dải) — chỉ số gần nhất"""
    out = []
    for k in range(n):
        i = int(round(k * step_s * fps))
        out.append(paths[min(i, len(paths) - 1)])
    return out


def fmt_dur(d):
    if not d:
        return "—"
    return ", ".join("%s %d" % (k, v) for k, v in sorted(d.items()) if isinstance(v, (int, float)))


def text_w(draw, s, f):
    try:
        return draw.textlength(s, font=f)
    except Exception:
        return draw.textsize(s, font=f)[0]


def wrap(draw, s, f, maxw):
    words, lines, cur = s.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if text_w(draw, t, f) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def build_sheet(mid, rname, rdir, wdir, out_path):
    rpaths = frames_in(rdir, ("jpg", "jpeg", "png"))
    wpaths = frames_in(wdir, ("png", "jpg"))
    rmeta = read_json(os.path.join(rdir, "meta.json")) or {}
    wmeta = read_json(os.path.join(wdir, "meta.json")) or {}
    rfps = float(rmeta.get("fps") or 10)
    wfps = float(wmeta.get("fps") or 10)
    # số khung so sánh = đoạn ngắn hơn của hai bên, theo bước 0,1 s
    dur = min(len(rpaths) / rfps, len(wpaths) / wfps)
    n = max(2, min(MAX_FRAMES, int(round(dur * 10))))
    step = 0.1
    rs, ws = pick(rpaths, rfps, n, step), pick(wpaths, wfps, n, step)
    ri = Image.open(rs[0])
    cell_h = max(60, min(260, int(round(CELL_W * ri.height / float(ri.width)))))
    cols = min(COLS, n)
    bands = (n + cols - 1) // cols
    W = cols * CELL_W + (cols + 1) * 4
    row_h = cell_h + 18
    H = HEAD_H + bands * (2 * row_h + 8) + 6
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f1, f2, f3 = font(24, True), font(14), font(11)
    d.text((8, 6), mid + ("  (" + rname + ")" if rname != "ref" else ""), fill=ACC, font=f1)
    url = rmeta.get("url") or rmeta.get("clip") or ""
    d.text((W // 2, 8), "clip: " + str(url), fill=DIM, font=f2)
    # thời lượng hai bên cạnh nhau, tô màu nếu lệch > 30 %
    y = 40
    rd, wd = rmeta.get("durations_ms") or {}, wmeta.get("durations_ms") or {}
    d.text((8, y), "gốc: " + fmt_dur(rd), fill=FG, font=f2)
    d.text((8, y + 18), "web: " + fmt_dur(wd), fill=FG, font=f2)
    shared = [k for k in rd if k in wd and rd[k]]
    if shared:
        bits = []
        for k in shared:
            ratio = wd[k] / float(rd[k])
            bits.append("%s web/gốc = %.2f" % (k, ratio))
        d.text((8, y + 36), "; ".join(bits[:6]), fill=GOOD if all(abs(wd[k] / float(rd[k]) - 1) <= 0.3 for k in shared) else BAD, font=f2)
    else:
        d.text((8, y + 36), "chưa có chỉ số chung để so (đặt durations_ms cùng tên khoá ở hai meta.json)", fill=DIM, font=f3)
    notes = rmeta.get("notes") or ""
    if notes:
        for i, l in enumerate(wrap(d, "gốc: " + notes, f3, W - 16)[:1]):
            d.text((8, y + 54 + i * 12), l, fill=DIM, font=f3)
    for b in range(bands):
        y0 = HEAD_H + b * (2 * row_h + 8)
        for c in range(cols):
            k = b * cols + c
            if k >= n:
                break
            x = 4 + c * (CELL_W + 4)
            sheet.paste(fit(Image.open(rs[k]), CELL_W, cell_h), (x, y0 + 14))
            sheet.paste(fit(Image.open(ws[k]), CELL_W, cell_h), (x, y0 + row_h + 14 + 4))
            d.text((x + 2, y0), "%.1fs gốc" % (k * step), fill=DIM, font=f3)
            d.text((x + 2, y0 + row_h + 4), "%.1fs web" % (k * step), fill=ACC, font=f3)
    sheet.save(out_path, "JPEG", quality=84)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="D:/bazaar-ref")
    ap.add_argument("--moments", default="")
    a = ap.parse_args()
    root = a.root
    out = os.path.join(root, "compare")
    if not os.path.isdir(out):
        os.makedirs(out)
    ids = parse_moments(os.path.join(root, "notes", "MOMENTS.md"))
    for sub in ("ref", "web"):  # thư mục có thật nhưng không có trong danh sách vẫn được liệt kê
        try:
            for dn in sorted(os.listdir(os.path.join(root, sub))):
                if os.path.isdir(os.path.join(root, sub, dn)) and not dn.startswith("_") and dn not in ids:
                    ids.append(dn)
        except Exception:
            pass
    only = [m for m in a.moments.split(",") if m]
    rows = []
    for mid in ids:
        if only and mid not in only:
            continue
        refs = ref_sets(root, mid)
        wdir = os.path.join(root, "web", mid)
        has_web = bool(frames_in(wdir, ("png", "jpg")))
        wmeta = read_json(os.path.join(wdir, "meta.json")) or {}
        row = {"id": mid, "web_dur": wmeta.get("durations_ms") or {}, "ref_dur": {}, "url": "", "status": "", "sheets": []}
        if refs:
            m0 = read_json(os.path.join(refs[0][1], "meta.json")) or {}
            row["ref_dur"] = m0.get("durations_ms") or {}
            row["url"] = m0.get("url") or ""
        if not refs and not has_web:
            row["status"] = "thiếu cả ref và web"
        elif not refs:
            row["status"] = "thiếu ref"
        elif not has_web:
            row["status"] = "thiếu web"
        else:
            row["status"] = "ok"
            for i, (rn, rd) in enumerate(refs):
                fn = mid + (".jpg" if i == 0 else "-" + rn.split()[-1] + ".jpg")
                try:
                    n = build_sheet(mid, rn, rd, wdir, os.path.join(out, fn))
                    row["sheets"].append(fn)
                    print("ok  %-16s %2d khung  %s" % (mid, n, fn))
                except Exception as e:
                    row["status"] = "lỗi dựng tờ: %s" % e
                    print("XX  %-16s %s" % (mid, e))
        rows.append(row)

    def fmt_ms(v):
        # ref meta đôi khi ghi khoảng "150-300" hoặc chú thích chữ thay cho số
        if v is None:
            return "—"
        if isinstance(v, (int, float)):
            return "%d ms" % v
        return html.escape(str(v))

    def dur_cell(r):
        keys = sorted(set(r["ref_dur"]) | set(r["web_dur"]))
        if not keys:
            return "—"
        lines = []
        for k in keys:
            rv, wv = r["ref_dur"].get(k), r["web_dur"].get(k)
            cls = ""
            if isinstance(rv, (int, float)) and isinstance(wv, (int, float)) and rv:
                cls = ' class="%s"' % ("good" if abs(wv / float(rv) - 1) <= 0.3 else "bad")
            lines.append("<div%s>%s: gốc %s · web %s</div>" % (cls, html.escape(k), fmt_ms(rv), fmt_ms(wv)))
        return "".join(lines)

    h = ['<!doctype html><html lang="vi"><meta charset="utf-8"><title>Chợ Phiên: gốc vs web</title>',
         "<style>body{background:#16181d;color:#ececf0;font:14px/1.45 'Segoe UI',sans-serif;margin:24px}h1{color:#ffd36b}"
         "table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2a2d36;padding:6px 10px;vertical-align:top;text-align:left}"
         "th{color:#9aa0b0;font-weight:600}.ok{color:#78dc8c}.miss{color:#ff9f6e}.good{color:#78dc8c}.bad{color:#ff7a6e}a{color:#8cc8ff}"
         "img{max-width:460px;border:1px solid #2a2d36;display:block;margin-bottom:4px}code{color:#ffd36b}</style>",
         "<h1>Chợ Phiên — game gốc vs bản web</h1>",
         "<p>%d khoảnh khắc: %d ok. Mỗi tờ: hàng trên = gốc, hàng dưới = web. Thời lượng xanh = web lệch gốc ≤ 30 %%.</p>" % (len(rows), sum(1 for r in rows if r["status"] == "ok")),
         "<table><tr><th>khoảnh khắc</th><th>trạng thái</th><th>thời lượng (ms)</th><th>tờ so sánh</th></tr>"]
    for r in rows:
        st_cls = "ok" if r["status"] == "ok" else "miss"
        link = '<a href="%s">clip gốc</a>' % html.escape(r["url"]) if r["url"] else ""
        sheets = "".join('<a href="%s"><img loading="lazy" src="%s" alt="%s"></a>' % (html.escape(s), html.escape(s), html.escape(s)) for s in r["sheets"])
        h.append("<tr><td><code>%s</code><br>%s</td><td class=\"%s\">%s</td><td>%s</td><td>%s</td></tr>" % (
            html.escape(r["id"]), link, st_cls, html.escape(r["status"]), dur_cell(r), sheets))
    h.append("</table></html>")
    io.open(os.path.join(out, "index.html"), "w", encoding="utf-8").write("\n".join(h))
    print("index.html: %d khoảnh khắc, %d ok" % (len(rows), sum(1 for r in rows if r["status"] == "ok")))


if __name__ == "__main__":
    main()
