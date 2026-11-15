# python tools/montage.py out.png scale cell1 cell2 ...  (cells from D:/stylized-weapons/ref/cells)
import sys
from PIL import Image
out, sc = sys.argv[1], float(sys.argv[2])
ims = [Image.open('D:/stylized-weapons/ref/cells/%02d.png' % int(c)) for c in sys.argv[3:]]
h = max(i.height for i in ims); W = sum(i.width for i in ims)
m = Image.new('RGB', (W, h), (20, 20, 24)); x = 0
for i in ims: m.paste(i, (x, 0)); x += i.width
m = m.resize((int(m.width * sc), int(m.height * sc)), Image.LANCZOS); m.save(out); print(m.size)
