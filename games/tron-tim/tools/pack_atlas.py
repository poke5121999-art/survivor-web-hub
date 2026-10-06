# Helper cua extract_sk.js: xep lai cac khung can dung vao trang atlas moi.
# Dung: python -I pack_atlas.py job.json result.json
# job = {sets:[{name, pad, maxSize, ext, quality, outPrefix, srcPages:[duong dan], rects:[[page,x,y,w,h,smooth01]]}]}
# result = {sets:[{pages:[ten tep], sizes:[[w,h]], place:[[outPage,x,y] theo thu tu rects]}]}
import io, json, os, sys
from PIL import Image


def pack(rects, pad, max_size):
    # rects: list of (idx,w,h). Shelf packing, sap xep cao -> thap (on dinh theo idx).
    order = sorted(range(len(rects)), key=lambda i: (-rects[i][1], -rects[i][0], i))
    area = sum((r[0] + 2 * pad) * (r[1] + 2 * pad) for r in rects)
    wmax = max([r[0] for r in rects] + [1]) + pad * 2
    W = 256
    while W < wmax or W * W < area * 1.2:
        W *= 2
    W = min(W, max_size)
    pages = []  # moi trang: {shelves:[[y,h,x]], H}
    place = [None] * len(rects)
    for i in order:
        w, h = rects[i]
        pw, ph = w + 2 * pad, h + 2 * pad
        done = False
        for pi, pg in enumerate(pages):
            for sh in pg['shelves']:
                if ph <= sh[1] and sh[2] + pw <= W:
                    place[i] = (pi, sh[2] + pad, sh[0] + pad)
                    sh[2] += pw
                    done = True
                    break
            if done:
                break
            top = pg['H']
            if top + ph <= max_size:
                pg['shelves'].append([top, ph, pw])
                pg['H'] = top + ph
                place[i] = (pi, pad, top + pad)
                done = True
                break
        if not done:
            pages.append({'shelves': [[0, ph, pw]], 'H': ph})
            place[i] = (len(pages) - 1, pad, pad)
    sizes = [(W, (pg['H'] + 3) // 4 * 4) for pg in pages]
    return place, sizes


def main():
    job = json.load(io.open(sys.argv[1], encoding='utf-8'))
    res = {'sets': []}
    for st in job['sets']:
        pad = st.get('pad', 2)
        src = {}
        rects = st['rects']
        place, sizes = pack([(r[3], r[4]) for r in rects], pad, st.get('maxSize', 2048))
        outs = []
        for (w, h) in sizes:
            outs.append(Image.new('RGBA', (w, h), (0, 0, 0, 0)))
        for r, pl in zip(rects, place):
            pg, x, y, w, h, smooth = r
            if pg not in src:
                src[pg] = Image.open(st['srcPages'][pg]).convert('RGBA')
            crop = src[pg].crop((x, y, x + w, y + h))
            o = outs[pl[0]]
            ox, oy = pl[1], pl[2]
            if smooth and pad > 0:
                # tran vien: lap lai pixel mep de loc song tuyen tinh khong rua mau
                p = pad
                o.paste(crop.crop((0, 0, w, 1)).resize((w, p)), (ox, oy - p))
                o.paste(crop.crop((0, h - 1, w, h)).resize((w, p)), (ox, oy + h))
                o.paste(crop.crop((0, 0, 1, h)).resize((p, h)), (ox - p, oy))
                o.paste(crop.crop((w - 1, 0, w, h)).resize((p, h)), (ox + w, oy))
                for cx, cy, sx, sy in ((ox - p, oy - p, 0, 0), (ox + w, oy - p, w - 1, 0), (ox - p, oy + h, 0, h - 1), (ox + w, oy + h, w - 1, h - 1)):
                    o.paste(crop.crop((sx, sy, sx + 1, sy + 1)).resize((p, p)), (cx, cy))
            o.paste(crop, (ox, oy))
        names = []
        for i, o in enumerate(outs):
            name = '%s%d.%s' % (os.path.basename(st['outPrefix']), i, st['ext'])
            path = os.path.join(os.path.dirname(st['outPrefix']), name)
            if st['ext'] == 'png':
                o.save(path, optimize=True)
            else:
                o.save(path, 'WEBP', quality=st.get('quality', 92), method=6)
            names.append(name)
        res['sets'].append({'pages': names, 'sizes': sizes, 'place': place})
    io.open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(res))


main()
