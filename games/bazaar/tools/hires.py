# -*- coding: utf-8 -*-
"""Ảnh thẻ và chân dung quái ở độ phân giải gốc -> D:\cho-phien-assets (repo thứ hai, Pages riêng).

Chạy (Python 3.8, Pillow):  python -I games/bazaar/tools/hires.py
Đọc PNG đủ độ phân giải ở D:\bazaar-ref\art\{cards,encounters}\ (do art.py bóc), ghi webp CÙNG kích thước nguồn,
cùng chất lượng và cùng đường dẫn tương đối như art.py --web (q82; _bg q78), chỉ cho tệp có trong games/bazaar/art.
Chạy lại: bỏ qua tệp không đổi (so cỡ + mtime nguồn và tham số trong .hires.json).
"""
import os, sys, json, time, argparse
from multiprocessing import Pool
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art as A     # dùng lại ART (nguồn PNG), WEB_ART (tên webp web) của art.py; import không có tác dụng phụ

OUT = r"D:\cho-phien-assets"
GROUPS = ("cards", "encounters")
MANIFEST = os.path.join(OUT, ".hires.json")


def params_of(rel):
    """Cùng bảng với art.py run_web: thẻ RGB q82; encounter _bg RGB q78, còn lại RGBA q82."""
    if rel.startswith("cards/"):
        return "RGB", 82
    return ("RGB", 78) if rel.endswith("_bg.webp") else ("RGBA", 82)


def plan():
    jobs = []
    for g in GROUPS:
        for f in sorted(os.listdir(os.path.join(A.WEB_ART, g))):
            if not f.endswith(".webp"):
                continue
            rel = g + "/" + f
            src = os.path.join(A.ART, g, f[:-5] + ".png")
            if os.path.exists(src):
                jobs.append(rel)
            else:
                print("thiếu nguồn PNG:", rel)
    return jobs


def convert(rel):
    from PIL import Image
    mode, q = params_of(rel)
    sp = os.path.join(A.ART, rel[:-5].replace("/", os.sep) + ".png")
    dp = os.path.join(OUT, "art", rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(dp), exist_ok=True)
    im = Image.open(sp).convert(mode)
    im.save(dp, "WEBP", quality=q, method=4)
    return rel, os.path.getsize(dp), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    t = time.time()
    jobs = plan()
    old = {}
    if os.path.exists(MANIFEST) and not a.force:
        old = json.load(open(MANIFEST, encoding="utf-8"))
    new, todo = {}, []
    for rel in jobs:
        sp = os.path.join(A.ART, rel[:-5].replace("/", os.sep) + ".png")
        st = os.stat(sp)
        key = [st.st_size, st.st_mtime_ns, params_of(rel)[1], params_of(rel)[0]]
        dp = os.path.join(OUT, "art", rel.replace("/", os.sep))
        if old.get(rel, {}).get("k") == key and os.path.exists(dp):
            new[rel] = old[rel]
        else:
            new[rel] = {"k": key}
            todo.append(rel)
    if todo:
        with Pool(min(6, os.cpu_count() or 2)) as p:
            for rel, size, wh in p.imap_unordered(convert, todo, chunksize=8):
                new[rel]["size"] = size; new[rel]["wh"] = list(wh)
    json.dump(new, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, sort_keys=True)
    total = sum(v.get("size", 0) for v in new.values())
    print("hires: %d tệp (%d mới/đổi), %.1f MB, %.0fs" % (len(new), len(todo), total / 1048576, time.time() - t))
    page(total, len(new))


def page(total, n):
    """index.html, .nojekyll, README.md: ghi lại mỗi lần để luôn khớp."""
    def w(name, s):
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(s)
    w(".nojekyll", "")
    w("index.html", '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      '<title>Chợ Phiên - ảnh gốc</title><body style="font:16px system-ui;margin:2rem">'
      '<p>Kho ảnh độ phân giải gốc của Chợ Phiên (thẻ và chân dung quái), game tự tải khi cần. '
      '<a href="https://poke5121999-art.github.io/survivor-web-hub/games/bazaar/">Vào chơi Chợ Phiên</a></p></body></html>\n')
    w("README.md", "# cho-phien-assets\n\nKho ảnh độ phân giải gốc của game Chợ Phiên (`games/bazaar` trong repo survivor-web-hub), "
      "đăng riêng trên GitHub Pages vì repo chính đã vượt 1 GB. Game luôn có bản webp 512 px làm nền; "
      "khi màn hình cần nét hơn (hoặc xem phóng to) nó tải bản trong kho này (`games/bazaar/js/view/hires.js`).\n\n"
      "- `art/cards/*.webp`: art thẻ 1024x1024 (q82, bỏ alpha)\n- `art/encounters/*.webp`: chân dung và nền quái, thương nhân, sự kiện ở cỡ nguồn (q82, `_bg` q78)\n"
      "- Tên và đường dẫn trùng 1:1 với `games/bazaar/art/...`.\n- Hiện có %d tệp, %.1f MB.\n\n"
      "## Cách sinh\n\nỞ gốc repo survivor-web-hub (Python 3.8 + Pillow, sau `art.py` đã bóc PNG vào `D:\bazaar-ref\art`):\n\n"
      "    python -I games/bazaar/tools/hires.py\n\nChạy lại thì bỏ qua tệp không đổi. Sau đó commit và push repo này.\n" % (n, total / 1048576))


if __name__ == "__main__":
    main()
