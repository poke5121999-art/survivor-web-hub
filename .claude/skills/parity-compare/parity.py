"""So bản web với game gốc: ghép ảnh cạnh nhau, đo màu theo vùng, chặn báo cáo khi còn cặp chưa xét.

python -I parity.py pair  <web.png> <gốc.png> <ra.png> [cao=720]
python -I parity.py build --ref DIR --web DIR --out DIR [--regions regions.json] [--tol 0.15] [--dc 25] [--max-ref 2] [--height 540]
python -I parity.py check --out DIR --verdicts verdicts.tsv

Ảnh của một key nằm ở DIR/<key>/*.png|jpg|jpeg|webp hoặc DIR/<key>.png|jpg|jpeg|webp.
regions.json: {"*": {"tên": [x0,y0,x1,y1]}, "<key>": {...}}, toạ độ là tỉ lệ 0..1 trên từng ảnh.
verdicts.tsv: key<TAB>nhãn<TAB>ghi chú, nhãn thuộc LABELS; một key có thể nhiều dòng.
"""
import argparse
import glob
import html
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageStat

sys.stdout.reconfigure(encoding="utf-8")

EXTS = (".png", ".jpg", ".jpeg", ".webp")
LABELS = {"ok", "web-bug", "version", "not-built"}
MAGENTA = (255, 0, 255)


def images(root, key):
    d = os.path.join(root, key)
    if os.path.isdir(d):
        return sorted(p for p in glob.glob(os.path.join(d, "*")) if p.lower().endswith(EXTS))
    return [os.path.join(root, key + e) for e in EXTS if os.path.isfile(os.path.join(root, key + e))][:1]


def keys(root):
    out = set()
    for n in os.listdir(root):
        p = os.path.join(root, n)
        if os.path.isdir(p) and images(root, n):
            out.add(n)
        elif n.lower().endswith(EXTS):
            out.add(os.path.splitext(n)[0])
    return out


def box(im, r):
    return (round(r[0] * im.width), round(r[1] * im.height), round(r[2] * im.width), round(r[3] * im.height))


def mean_rgb(p, r):
    im = Image.open(p).convert("RGB")
    return [round(v, 1) for v in ImageStat.Stat(im.crop(box(im, r))).mean]


def luma(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def fit(p, h, regs):
    im = Image.open(p).convert("RGB")
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for name, r in regs.items():
        if name == "frame":
            continue
        b = box(im, r)
        d.rectangle(b, outline=(0, 255, 255), width=2)
        d.text((b[0] + 3, b[1] + 2), name, fill=(0, 255, 255))
    return im


def sheet(parts, h, out):
    w = sum(im.width for im, _ in parts) + 8 * (len(parts) - 1)
    s = Image.new("RGB", (w, h), MAGENTA)
    d, x = ImageDraw.Draw(s), 0
    for im, lab in parts:
        s.paste(im, (x, 0))
        d.rectangle([x, 0, x + 7 * len(lab) + 10, 18], fill=(0, 0, 0))
        d.text((x + 5, 3), lab, fill=(255, 255, 0))
        x += im.width + 8
    s.save(out)


def cmd_pair(a):
    sheet([(fit(a.web, a.height, {}), "WEB"), (fit(a.ref, a.height, {}), "GOC")], a.height, a.out)
    print(a.out)


def cmd_build(a):
    os.makedirs(a.out, exist_ok=True)
    regions = {}
    if a.regions:
        with io.open(a.regions, encoding="utf-8") as f:
            regions = json.load(f)
    report = []
    for key in sorted(keys(a.ref) | keys(a.web)):
        web, ref = images(a.web, key), images(a.ref, key)[: a.max_ref]
        row = {"key": key, "web": len(web), "ref": len(ref)}
        if not web or not ref:
            row["status"] = "missing-web" if not web else "missing-ref"
            report.append(row)
            print(f"{key:32} {row['status']}")
            continue
        regs = dict({"frame": [0, 0, 1, 1]}, **regions.get("*", {}), **regions.get(key, {}))
        row["status"], row["regions"], flags = "pair", {}, []
        for name, r in regs.items():
            # So với từng khung gốc rồi lấy khung gần nhất: một khung gốc lạc trạng thái không gây báo lệch giả.
            w = mean_rgb(web[0], r)
            per = []
            for p in ref:
                g = mean_rgb(p, r)
                per.append({"file": os.path.basename(p), "ref": g, "luma_ratio": round(luma(w) / max(luma(g), 1), 2),
                            "max_dc": round(max(abs(x - y) for x, y in zip(w, g)), 1)})
            best = min(per, key=lambda m: abs(m["luma_ratio"] - 1))
            flag = []
            if name != "frame" and abs(best["luma_ratio"] - 1) > a.tol:
                flag.append("sáng")
            if name != "frame" and min(m["max_dc"] for m in per) > a.dc:
                flag.append("màu")
            row["regions"][name] = {"web": w, "per_ref": per, "flag": flag}
            if flag:
                flags.append(f"{name}:{'+'.join(flag)}×{best['luma_ratio']}")
        row["flags"] = flags
        parts = [(fit(p, a.height, regs), "WEB " + key) for p in web[:1]]
        parts += [(fit(p, a.height, regs), "GOC " + os.path.basename(p)) for p in ref]
        sheet(parts, a.height, os.path.join(a.out, key + ".png"))
        report.append(row)
        print(f"{key:32} pair  {' '.join(flags) or '-'}")
    with io.open(os.path.join(a.out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    rows = []
    for r in report:
        img = f'<a href="{html.escape(r["key"])}.png"><img src="{html.escape(r["key"])}.png" loading="lazy"></a>' if r["status"] == "pair" else ""
        rows.append(f'<tr><td>{html.escape(r["key"])}</td><td>{r["status"]}</td>'
                    f'<td>{html.escape(" ".join(r.get("flags", [])))}</td><td>{img}</td></tr>')
    with io.open(os.path.join(a.out, "index.html"), "w", encoding="utf-8") as f:
        f.write('<meta charset="utf-8"><style>body{font:13px sans-serif;background:#111;color:#ddd}'
                'img{max-width:960px}td{vertical-align:top;padding:4px}</style><table>' + "".join(rows) + "</table>")
    n = sum(r["status"] == "pair" for r in report)
    print(f"{n} cặp, {len(report) - n} thiếu một bên, {sum(bool(r.get('flags')) for r in report)} cặp có vùng đo lệch -> {a.out}")


def cmd_check(a):
    with io.open(os.path.join(a.out, "report.json"), encoding="utf-8") as f:
        report = {r["key"]: r for r in json.load(f)}
    seen, bad = {}, []
    with io.open(a.verdicts, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if not line.strip() or line.startswith("#") or line.startswith("key\t"):
                continue
            c = line.rstrip("\n").split("\t")
            key, label, note = c[0], c[1] if len(c) > 1 else "", c[2] if len(c) > 2 else ""
            if label not in LABELS:
                bad.append(f"dòng {i}: nhãn '{label}' không thuộc {sorted(LABELS)}")
            if key not in report:
                bad.append(f"dòng {i}: key '{key}' không có trong report.json")
            seen.setdefault(key, []).append((label, note))
    for key, r in report.items():
        if r["status"] != "pair":
            continue
        v = seen.get(key)
        if not v:
            bad.append(f"{key}: có cặp ảnh nhưng chưa có dòng nhận xét")
        elif r.get("flags") and all(l == "ok" and not n.strip() for l, n in v):
            bad.append(f"{key}: đo lệch ({' '.join(r['flags'])}) mà ghi ok không lý do")
    labels = [l for v in seen.values() for l, _ in v]
    print("nhãn:", {l: labels.count(l) for l in sorted(LABELS)})
    for b in bad:
        print("THIẾU", b)
    sys.exit(1 if bad else 0)


p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("pair")
s.add_argument("web"); s.add_argument("ref"); s.add_argument("out"); s.add_argument("height", nargs="?", type=int, default=720)
s = sub.add_parser("build")
s.add_argument("--ref", required=True); s.add_argument("--web", required=True); s.add_argument("--out", required=True)
s.add_argument("--regions"); s.add_argument("--tol", type=float, default=0.15); s.add_argument("--dc", type=float, default=25)
s.add_argument("--max-ref", type=int, default=2); s.add_argument("--height", type=int, default=540)
s = sub.add_parser("check")
s.add_argument("--out", required=True); s.add_argument("--verdicts", required=True)
a = p.parse_args()
{"pair": cmd_pair, "build": cmd_build, "check": cmd_check}[a.cmd](a)
