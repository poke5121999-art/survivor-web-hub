# side-by-side: reference sheet (left) | our 3x3 sheet (right)   python tools/side.py <ref.png> <ourdir> <out.png> <i,j,...9 frame indices>
import sys, glob, os
from PIL import Image, ImageDraw
ref = Image.open(sys.argv[1]).convert('RGB'); d = sys.argv[2]; out = sys.argv[3]
files = sorted(glob.glob(os.path.join(d, 'f*.png'))); pick = [int(i) for i in sys.argv[4].split(',')]
tw, th = 480, 270
ours = Image.new('RGB', (tw * 3, th * 3))
for k, i in enumerate(pick[:9]):
    ours.paste(Image.open(files[min(i, len(files) - 1)]).convert('RGB').resize((tw, th), Image.LANCZOS), ((k % 3) * tw, (k // 3) * th))
ref = ref.resize((tw * 3, th * 3), Image.LANCZOS)
sheet = Image.new('RGB', (tw * 6 + 12, th * 3 + 34), (16, 16, 16))
sheet.paste(ref, (0, 34)); sheet.paste(ours, (tw * 3 + 12, 34))
dr = ImageDraw.Draw(sheet); dr.text((8, 10), 'REFERENCE: Voxel Engine (spawn.co) - ' + os.path.basename(sys.argv[1]), fill=(255, 255, 255)); dr.text((tw * 3 + 20, 10), 'OURS: voxel-lab - ' + d, fill=(255, 255, 255))
sheet.save(out); print(out)
