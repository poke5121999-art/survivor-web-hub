# python tools/pair.py out.png a.png b.png ...  (side by side, same height)
import sys
from PIL import Image
ims = [Image.open(p).convert('RGB') for p in sys.argv[2:]]
h = max(i.height for i in ims)
ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
m = Image.new('RGB', (sum(i.width for i in ims), h)); x = 0
for i in ims: m.paste(i, (x, 0)); x += i.width
m.save(sys.argv[1])
