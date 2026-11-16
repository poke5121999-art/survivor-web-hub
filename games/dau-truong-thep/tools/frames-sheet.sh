#!/bin/sh
# Contact sheet of the newer tanks (every style row with a frame spec) at one form, five per row, through styleshot.js.
#   sh tools/frames-sheet.sh [form] [out.jpg]      (default form 2, <repo>/.chk/frames/sheet.jpg)
set -e
cd "$(dirname "$0")/.."
FORM=${1:-2}
OUT=${2:-../../.chk/frames/sheet.jpg}
DIR=$(dirname "$OUT")/rows
mkdir -p "$DIR"
KEYS=$(node -e "import('./js/gfx/styles.js').then((m) => console.log(Object.keys(m.STYLES).filter((k) => m.STYLES[k].frame).join(' ')))")
i=0; row=""; n=0
for k in $KEYS; do
  row="$row${row:+,}$k@$FORM"; n=$((n + 1))
  if [ $n -eq 5 ]; then node tools/styleshot.js "$row" "$DIR/row$i.png" >/dev/null; i=$((i + 1)); row=""; n=0; fi
done
[ -n "$row" ] && node tools/styleshot.js "$row" "$DIR/row$i.png" >/dev/null
python3 - "$DIR" "$OUT" "$KEYS" <<'PY'
import sys, glob, os
from PIL import Image, ImageDraw
d, out, keys = sys.argv[1], sys.argv[2], sys.argv[3].split()
rows = sorted(glob.glob(os.path.join(d, 'row*.png')), key=lambda p: int(os.path.basename(p)[3:-4]))
ims = [Image.open(p).convert('RGB') for p in rows]
W = max(i.width for i in ims); H = sum(i.height for i in ims)
sheet = Image.new('RGB', (W, H), (30, 34, 40)); y = 0; dr = ImageDraw.Draw(sheet)
for r, im in enumerate(ims):
    sheet.paste(im, (0, y))
    for c in range(5):
        if r * 5 + c < len(keys): dr.text((c * 400 + 8, y + 6), keys[r * 5 + c], fill=(255, 255, 255))
    y += im.height
sheet.save(out, quality=88)
print(out, sheet.size)
PY
