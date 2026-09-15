# -*- coding: utf-8 -*-
"""Đóng sprite Soul Knight đã chọn thành MỘT tấm atlas cho Hắn Đang Tới.

    python games/hic/art/tools/build_sk_atlas.py

Đọc  games/hic/art/sk/picks.json   (khoá vai trò -> bundle + danh sách khung)
Ghi  games/hic/art/sk/atlas.png    (tấm ghép, nền trong suốt)
     games/hic/art/sk/atlas.js     (window.HIC_SK = toạ độ từng khung + nhóm hoạt ảnh)

WHY một tấm: game chạy trên điện thoại qua GitHub Pages. 400 tệp PNG lẻ là 400
lượt tải; một tấm là một lượt, và cả bản đồ vẽ từ cùng một ảnh nguồn.

Nguồn: kho bóc ~/Downloads/sk-ref/all (ngoài git). Xem art/sk/README.md.

Bẫy đã sập:
- Khung trong cùng một hoạt ảnh KHÔNG cùng cỡ (con quái vung tay thì khung rộng
  ra). Giữ nguyên cỡ gốc, không cắt viền trong suốt — cắt thì mỗi khung lệch tâm
  một kiểu và con quái giật qua lại khi đứng yên. Game neo mỗi khung ở GIỮA ĐÁY.
"""
import io, json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "sk"))
SRC = os.path.expanduser("~/Downloads/sk-ref/all")
PAD = 1
MAX_W = 1024


def load(bundle, name):
    p = os.path.join(SRC, *bundle.split("/"), name + ".png")
    return Image.open(p).convert("RGBA")


def main():
    picks = json.load(io.open(os.path.join(OUT, "picks.json"), encoding="utf-8"))
    frames = {}      # "bundle/name" -> Image
    groups = {}      # role -> dict
    for role, spec in sorted(picks.items()):
        if role.startswith("_"):
            continue
        b = spec["bundle"]
        g = {k: v for k, v in spec.items() if k not in ("bundle", "frames", "anims")}
        if "anims" in spec:
            g["anims"] = {}
            for an, names in spec["anims"].items():
                g["anims"][an] = [b + "/" + n for n in names]
                for n in names:
                    frames.setdefault(b + "/" + n, None)
        else:
            g["frames"] = [b + "/" + n for n in spec["frames"]]
            for n in spec["frames"]:
                frames.setdefault(b + "/" + n, None)
        groups[role] = g

    missing = []
    for key in list(frames):
        b, n = key.rsplit("/", 1)
        try:
            frames[key] = load(b, n)
        except Exception as e:
            missing.append(key)
    if missing:
        print("THIEU %d khung:" % len(missing))
        for m in missing:
            print("  ", m)
        sys.exit(1)

    # Xếp kệ: cao trước, rộng sau.
    order = sorted(frames, key=lambda k: (-frames[k].height, -frames[k].width))
    x = y = shelf = 0
    rects = {}
    width = 0
    for k in order:
        im = frames[k]
        if x + im.width + PAD > MAX_W:
            x = 0
            y += shelf + PAD
            shelf = 0
        rects[k] = (x, y, im.width, im.height)
        x += im.width + PAD
        width = max(width, x)
        shelf = max(shelf, im.height)
    height = y + shelf
    # Lũy thừa hai không cần cho canvas 2D; chỉ làm tròn cho gọn.
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for k, (rx, ry, w, h) in rects.items():
        sheet.alpha_composite(frames[k], (rx, ry))
    sheet.save(os.path.join(OUT, "atlas.png"), optimize=True)

    # Tên khung rút gọn thành số thứ tự để atlas.js nhẹ.
    ids = {k: i for i, k in enumerate(sorted(rects))}
    flat = []
    for k in sorted(rects):
        flat.extend(rects[k])
    out = {"w": width, "h": height, "f": flat, "g": {}}
    for role, g in groups.items():
        gg = dict(g)
        if "anims" in g:
            gg["anims"] = {an: [ids[k] for k in ks] for an, ks in g["anims"].items()}
        else:
            gg["frames"] = [ids[k] for k in g["frames"]]
        out["g"][role] = gg
    js = ("/* SINH TỰ ĐỘNG bởi art/tools/build_sk_atlas.py — đừng sửa tay.\n"
          "   f = [x, y, w, h] liền nhau cho mỗi khung; g = vai trò -> số khung. */\n"
          "window.HIC_SK = " + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";\n")
    io.open(os.path.join(OUT, "atlas.js"), "w", encoding="utf-8", newline="\n").write(js)
    print("%d khung, %d vai tro -> atlas.png %dx%d, atlas.js %d byte" %
          (len(rects), len(groups), width, height, len(js)))


if __name__ == "__main__":
    main()
