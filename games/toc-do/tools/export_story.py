# Xuất ảnh Cốt Truyện từ APK: uitextures/id_career/{careermap,mapdetail,npchead,rolehead}/* -> art/story/<nhóm>_<tên>.webp
# Chạy: ~/zingspeed-ref/venv/bin/python -I tools/export_story.py [--sheet thư_mục]   (--sheet: ghi lưới ảnh có nhãn để chọn bằng mắt)
# Chỉ ghi ảnh trong bảng KEEP; --sheet vẽ lưới mọi ảnh của các nhóm để đối chiếu.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zs
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'story')
GROUPS = ['careermap', 'mapdetail', 'npchead', 'rolehead']
# KEEP: nhóm/tên (không _splited, đúng chữ hoa thường) -> cạnh dài tối đa. Điền sau khi xem lưới.
KEEP = {
    'careermap/BG_Map6': 1024, 'careermap/BG_Map7': 1024, 'careermap/BG_Map8': 1024, 'mapdetail/CareerMapBK2': 1024,   # nền bản đồ theo chương
    'careermap/BG_MapFlag01': 128, 'careermap/BG_ChapterLocked': 64,
    'careermap/BG_LevelBottomNormal': 128, 'careermap/BG_LevelBottomBoss': 128,                                         # đế sáng dưới ghim
    'careermap/BG_LevelDetailsNormal': 256, 'careermap/BG_LevelDetailsCurrent': 256, 'careermap/BG_LevelDetailsBoss': 256,  # ghim ải
    # chân dung NPC: tên gốc theo tệp (pinyin) -> tên trong game ở data/story.js
    'npchead/Icon_SuperProp_XiaoJuZi': 128, 'npchead/Icon_SuperProp_GuaiBoShi': 128, 'npchead/Icon_SuperProp_EnZuo': 128,
    'npchead/Icon_SuperProp_KaiLi': 128, 'npchead/Icon_SuperProp_KuLuoDiKa': 128, 'npchead/Icon_SuperProp_TeLiSiTan': 128,
    'npchead/Icon_SuperProp_XiZeEr': 128, 'npchead/Icon_SuperProp_YiLian': 128, 'npchead/Icon_SuperProp_LeiYin': 128,
    'npchead/Icon_Rezzo': 128, 'npchead/Icon_Kazami': 128,
}
MAXD = 512

def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    files, want = [], {}
    for r in zs.index():
        hit = False
        for c in r['cont']:
            if 'uitextures/id_career/' not in c: continue
            g, _, nm = c.split('id_career/')[1].partition('/')
            if g in GROUPS:
                hit = True
                want[g + '/' + nm.rsplit('.', 1)[0].replace('_splited', '').lower()] = 1
        if hit: files.append(r['f'])
    env = zs.load_with_deps(sorted(set(files)), depth=0)[0]
    got = {}
    for o in env.objects:
        if o.type.name != 'Texture2D': continue
        d = o.read()
        n = d.m_Name.replace('_splited', '').replace('_Splited', '')
        try: img = d.image.convert('RGBA')
        except Exception: continue
        for g in GROUPS:
            if g + '/' + n.lower() in want: got[g + '/' + n] = img
    os.makedirs(OUT, exist_ok=True)
    for k, md in KEEP.items():
        img = got.get(k)
        if img is None: print('thiếu', k); continue
        s = md / max(img.size)
        if s < 1: img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
        img.save(os.path.join(OUT, k.replace('/', '_') + '.webp'), 'WEBP', quality=88, method=6)
    print(len(got), 'ảnh:', ', '.join(sorted(got)))
    if sheet:
        os.makedirs(sheet, exist_ok=True)
        keys = sorted(got); W = 160; cols = 10
        for p in range(0, len(keys), 60):
            part = keys[p:p + 60]; rows = (len(part) + cols - 1) // cols
            im = Image.new('RGBA', (cols * W, rows * (W + 14)), (60, 50, 80, 255)); dr = ImageDraw.Draw(im)
            for i, k in enumerate(part):
                t = got[k].copy(); t.thumbnail((W - 6, W - 6))
                x, y = (i % cols) * W, (i // cols) * (W + 14)
                im.alpha_composite(t, (x + 3, y + 3)); dr.text((x + 3, y + W), k[:24] + ' %dx%d' % got[k].size, fill=(255, 255, 255, 255))
            im.convert('RGB').save(os.path.join(sheet, 'sheet%d.png' % (p // 60)))

main()
