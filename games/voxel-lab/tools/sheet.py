# contact sheet from a capture folder: python tools/sheet.py shots/<id> [cols] [out.png] [pick=i,j,...]
import sys, glob, os
from PIL import Image
d = sys.argv[1].rstrip('/')
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3
out = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else d + '_sheet.png'
files = sorted(glob.glob(os.path.join(d, 'f*.png')))
if len(sys.argv) > 4:
    files = [files[int(i)] for i in sys.argv[4].split(',') if int(i) < len(files)]
tw, th = 480, 270
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
print(out, len(files))
