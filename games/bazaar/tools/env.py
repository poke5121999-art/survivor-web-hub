# -*- coding: utf-8 -*-
"""Nền môi trường từng bàn chơi của The Bazaar (art/env/board_<khoá>.webp + data/env.js).

Gốc: mỗi bundle board_<khoá>_assets_all chứa một ảnh dựng sẵn nhìn từ trên xuống cả bàn kèm cảnh xung quanh
(Texture2D/Sprite `Board_*_PreviewCollection_T*` 2048x1024, riêng Dragons là `StoreImage`, ThemePark là `StoreIcon`).
Ảnh này là bản dựng 3D thật của bàn (khung, thảm, nước, cây, đồ trang trí) nên không cần dựng lại mesh.
Mesh của bàn chỉ có texture dạng atlas UV, không dùng trực tiếp được [ĐO TRONG REPO: board_van có 85 MeshRenderer, texture 2048 atlas].

Cách dựng: mỗi bàn có "sân" (khối thảm hai làn chứa bài) đo tay trên ảnh (BOARDS, toạ độ lưới 1000x500).
Cắt + co giãn ảnh sao cho sân khớp đúng vào BOARD_RECT = nơi web đặt hai làn (css .bz-board: left 392, top 300,
rộng 1136, cao 490 trên khung 1920x1080), phần còn lại (kênh nước, cây, đồ trang trí) tràn ra hai bên như bản gốc.
Co giãn hơi lệch tỉ lệ (<= 15%) là có chủ ý; muốn bản khác thì sửa BOARDS/BOARD_RECT rồi chạy lại.

Chạy (Python 3.8, UnityPy 1.25; dùng `python -I`):
  python -I env.py                 # bóc ảnh gốc (nếu chưa có) + dựng webp + ghi data/env.js + bảng so sánh
  python -I env.py --only van,pyg  # chỉ vài bàn
  python -I env.py --force         # bóc lại ảnh gốc
Trung gian: D:\\bazaar-ref\\env\\prev\\*.png, bảng xem: D:\\bazaar-ref\\env\\sheet_out.jpg
"""
import os, sys, json, argparse, warnings, io
warnings.filterwarnings("ignore")
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from PIL import Image, ImageDraw
import UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
warnings.simplefilter("ignore")

AAW = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data\StreamingAssets\aa\StandaloneWindows64"
WORK = r"D:\bazaar-ref\env"
PREV = os.path.join(WORK, "prev")
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
OUT_ART = os.path.join(REPO, "games", "bazaar", "art", "env")
OUT_DATA = os.path.join(REPO, "games", "bazaar", "data", "env.js")
W, H = 1920, 1080
BOARD_RECT = (392, 300, 1136, 490)          # x, y, w, h trên 1920x1080: hai làn bài của web (css .bz-board)
MAX_BYTES = 560 * 1024                      # trần từng ảnh (yêu cầu <= 600 KB)

# khoá -> (bundle, tiền tố tên texture, sân [x0,y0,x1,y1] trên lưới 1000x500 của ảnh gốc, nhãn)
BOARDS = {
    "grand":   ("board_thegrand", "Board_Grand_PreviewCollection", (240, 142, 762, 359), "The Grand (mặc định/common)"),
    "van":     ("board_van", "Board_VAN_PreviewCollection", (240, 142, 760, 358), "Vanessa: boong tàu cướp biển"),
    "pyg":     ("board_pyg", "Board_PYG_PreviewCollection", (240, 142, 760, 358), "Pygmalien: đảo kênh xanh"),
    "doo":     ("board_doo", "Board_DOO_PreviewCollection", (245, 145, 755, 355), "Dooley: phi thuyền trên mây"),
    "jul":     ("board_jul", "Board_JUL_PreviewCollection", (240, 138, 762, 355), "Jules: tiệc bánh"),
    "mak":     ("board_mak", "Board_MAK_PreviewCollection", (240, 142, 760, 358), "Mak: phòng giả kim"),
    "ste":     ("board_ste", "Board_STE_PreviewCollection", (275, 152, 725, 335), "Stelle: khinh khí cầu"),
    "karnok":  ("board_karnok", "Board_Karnok_PreviewCollection", (232, 150, 765, 358), "Karnok: gốc cây rêu"),
    "dragons": ("board_dragons", "Board_Dragons_StoreImage", (240, 150, 760, 350), "Dragons: sân khấu rock"),
    "crashsite": ("board_crashsite", "Board_CrashSite_PreviewCollection", (280, 155, 725, 345), "Crash Site: đồng cỏ pha lê"),
    "elite":   ("board_elite", "Board_Elite_PreviewCollection", (232, 142, 768, 368), "Elite: đền vàng"),
    "spring":  ("board_spring", "Board_Spring_PreviewCollection", (275, 155, 725, 345), "Spring: đồng cỏ xanh"),
    "palago":  ("board_palago", "Board_Spring_PreviewCollection", (272, 155, 728, 345), "Palago: đảo hoa tím"),
    "temple":  ("board_templeexpedition", "Board_TempleExpedition_PreviewCollection", (300, 155, 700, 345), "Temple Expedition: rừng cổ"),
    "anniversary": ("board_anniversary", "Board_Anniversary_PreviewCollection", (233, 152, 770, 352), "Anniversary: lễ hội"),
    "themepark": ("board_themepark", "Board_ThemePark_StoreIcon", (245, 150, 750, 350), "Theme Park: công viên"),
}
# alias "common" = bàn mặc định của game (khung ghi hình gốc: sân đất nung + kênh nước lam + cây = The Grand)
ALIASES = {"common": "grand"}
# hero -> bàn riêng của hero (album *_board)
BY_HERO = {"Vanessa": "van", "Pygmalien": "pyg", "Dooley": "doo", "Jules": "jul", "Mak": "mak",
           "Stelle": "ste", "Karnok": "karnok", "Dragons": "dragons", "TheDragons": "dragons"}


def extract(key, force=False):
    bundle, name, _, _ = BOARDS[key]
    out = os.path.join(PREV, key + ".png")
    if os.path.exists(out) and not force:
        return out
    os.makedirs(PREV, exist_ok=True)
    env = UnityPy.load(os.path.join(AAW, bundle + "_assets_all.bundle"))
    best = None
    for o in env.objects:
        if o.type.name in ("Texture2D", "Sprite"):
            d = o.read()
            if d.m_Name.startswith(name):
                im = d.image
                if best is None or im.size[0] * im.size[1] > best.size[0] * best.size[1]:
                    best = im
    if best is None:
        raise RuntimeError("không thấy ảnh %s trong %s" % (name, bundle))
    best.convert("RGB").save(out)
    return out


def compose(key, src_png):
    f = BOARDS[key][2]
    im = Image.open(src_png).convert("RGB")
    sw, sh = im.size                       # lưới 1000x500 -> điểm ảnh gốc
    ux, uy = sw / 1000.0, sh / 500.0
    bx, by, bw, bh = BOARD_RECT
    kx = bw / float(f[2] - f[0])           # điểm ảnh đích trên 1 ô lưới
    ky = bh / float(f[3] - f[1])
    x0 = f[0] - bx / kx                    # hộp nguồn (ô lưới) phủ đúng 1920x1080 đích
    y0 = f[1] - by / ky
    x1 = x0 + W / kx
    y1 = y0 + H / ky
    box = [x0 * ux, y0 * uy, x1 * ux, y1 * uy]
    m = int(max(0, -box[0], -box[1], box[2] - sw, box[3] - sh)) + 2   # tràn mép: nhân bản điểm ảnh biên
    if m > 2:
        import numpy as np
        im = Image.fromarray(np.pad(np.asarray(im), ((m, m), (m, m), (0, 0)), mode="edge"))
        box = [box[0] + m, box[1] + m, box[2] + m, box[3] + m]
    out = im.resize((W, H), Image.LANCZOS, box=tuple(box))
    return out, (kx, ky)


def save_webp(img, path):
    for q in (86, 82, 78, 74, 70, 66, 62, 58, 54, 50):
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            break
    with open(path, "wb") as fh:
        fh.write(buf.getvalue())
    return buf.tell(), q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    keys = [k for k in BOARDS if not a.only or k in a.only.split(",")]
    os.makedirs(OUT_ART, exist_ok=True)
    thumbs = []
    for k in keys:
        img, (kx, ky) = compose(k, extract(k, a.force))
        n, q = save_webp(img, os.path.join(OUT_ART, "board_%s.webp" % k))
        print("%-12s %6.1f KB q%d  co giãn %.2fx%.2f  %s" % (k, n / 1024.0, q, kx, ky, BOARDS[k][3]))
        thumbs.append((k, img))
    env = {}
    for k in BOARDS:
        if os.path.exists(os.path.join(OUT_ART, "board_%s.webp" % k)):
            env[k] = {"src": "art/env/board_%s.webp" % k, "boardRect": list(BOARD_RECT),
                      "lanes": {"top": [392, 300, 1136, 245], "bot": [392, 545, 1136, 245]}, "label": BOARDS[k][3]}
    for al, k in ALIASES.items():
        if k in env:
            env[al] = dict(env[k])
    env["byHero"] = {h: k for h, k in BY_HERO.items() if k in env}
    env["defaultKey"] = "common"
    head = ("/* Sinh bởi games/bazaar/tools/env.py, đừng sửa tay.\n"
            "   Mỗi bàn: src (ảnh 1920x1080, đường dẫn tính từ games/bazaar), boardRect [x,y,w,h] trên khung 1920x1080 = nơi\n"
            "   sân hai làn nằm trong ảnh (khớp css .bz-board), lanes.top/bot = hai làn. byHero: hero -> khoá bàn; defaultKey: bàn mặc định. */\n")
    with open(OUT_DATA, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(head + "window.BZ_ENV = " + json.dumps(env, ensure_ascii=False, indent=1) + ";\n")
    files = [f for f in os.listdir(OUT_ART) if f.startswith("board_")]
    tot = sum(os.path.getsize(os.path.join(OUT_ART, f)) for f in files)
    print("tổng board_*.webp: %.2f MB (%d bàn)" % (tot / 1048576.0, len(files)))
    tw, th = 640, 360
    sheet = Image.new("RGB", (tw * 4, th * ((len(thumbs) + 3) // 4)))
    for i, (k, img) in enumerate(thumbs):
        t = img.resize((tw, th), Image.LANCZOS)
        d = ImageDraw.Draw(t)
        sx, sy = tw / float(W), th / float(H)
        bx, by, bw, bh = BOARD_RECT
        d.rectangle([bx * sx, by * sy, (bx + bw) * sx, (by + bh) * sy], outline=(255, 255, 0))
        d.text((6, 4), k, fill=(255, 255, 255))
        sheet.paste(t, ((i % 4) * tw, (i // 4) * th))
    sheet.save(os.path.join(WORK, "sheet_out.jpg"), quality=80)


if __name__ == "__main__":
    main()
