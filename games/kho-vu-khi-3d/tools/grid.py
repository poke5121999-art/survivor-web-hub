# python tools/grid.py out.png img1 img2 ...  (stack pairs vertically, 2 columns, each scaled to 900 px wide)
import sys
from PIL import Image
ims = [Image.open(p).convert('RGB') for p in sys.argv[2:]]
W = 900
ims = [i.resize((W, int(i.height * W / i.width))) for i in ims]
rows = [ims[i:i + 2] for i in range(0, len(ims), 2)]
H = sum(max(i.height for i in r) for r in rows)
m = Image.new('RGB', (W * 2, H), (12, 12, 14)); y = 0
for r in rows:
    for j, i in enumerate(r): m.paste(i, (j * W, y))
    y += max(i.height for i in r)
m.save(sys.argv[1])
