"""Find prop blobs on the dark sheet; write a debug overlay + boxes json."""
import sys, json, io
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1]; out = sys.argv[2]
im = Image.open(src).convert('RGB')
W0, H0 = im.size
a = np.asarray(im).astype(np.int32)
# background estimate per column-row via heavy blur
sm = im.resize((W0//8, H0//8)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(4))
bg = np.asarray(sm.resize((W0, H0), Image.BILINEAR)).astype(np.int32)
d = np.abs(a - bg).sum(2)
lum = a.sum(2)
mask = (d > 45) | (lum > 230)
mask[790:, :] = False  # bottom watermark text
m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(int(sys.argv[3]) if len(sys.argv) > 3 else 9))
mask = np.asarray(m) > 0
H, W = mask.shape
lab = np.zeros((H, W), np.int32)
boxes = []
n = 0
for y in range(H):
    for x in range(W):
        if mask[y, x] and lab[y, x] == 0:
            n += 1
            st = [(y, x)]; lab[y, x] = n
            x0 = x1 = x; y0 = y1 = y; cnt = 0
            while st:
                cy, cx = st.pop(); cnt += 1
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for ny, nx in ((cy+1, cx), (cy-1, cx), (cy, cx+1), (cy, cx-1)):
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and lab[ny, nx] == 0:
                        lab[ny, nx] = n; st.append((ny, nx))
            if cnt > 150:
                boxes.append([int(x0), int(y0), int(x1), int(y1), cnt])
boxes.sort(key=lambda b: (b[1] // 60, b[0]))
dbg = im.copy(); dr = ImageDraw.Draw(dbg)
for i, b in enumerate(boxes):
    dr.rectangle(b[:4], outline=(0, 255, 0))
    dr.text((b[0] + 2, b[1] + 1), str(i), fill=(255, 255, 0))
dbg.save(out + '.png')
json.dump(boxes, io.open(out + '.json', 'w'), indent=0)
print(len(boxes))
