"""Atlas giao diện PRO -> art/pro/ui/main.png + data/pro-ui.js (P1.PRO_UI).
Kèm bản tham chiếu bố cục GameGUI (không vào repo) ở D:\pro-ref\ref\gamegui.txt.

Bảng sprite NGUI (UIAtlas.mSprites) nằm ở MonoBehaviour sharedassets0 path 35. IL2CPP không kèm
typetree nên đọc byte thô: từ byte 44 là int đếm, rồi từng mục
  string name (int độ dài + byte, căn 4) + 12 int: x y w h  bl br bt bb  pl pr pt pb
Texture: sharedassets0 path 11 'MainUIAtlasTrilinear' 2048x2048."""
import json, os, struct, collections
from pro_env import ProEnv, PRO

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
pe = ProEnv()
shared0 = {o.path_id: o for o in pe.env.objects if o.assets_file.name == 'sharedassets0.assets'}

tex = shared0[11].read()
assert tex.m_Name == 'MainUIAtlasTrilinear', tex.m_Name
tex.image.save(os.path.join(ROOT, 'art', 'pro', 'ui', 'main.png'))

raw = shared0[35].get_raw_data()
off = 44
n = struct.unpack_from('<i', raw, off)[0]; off += 4
sprites = {}
for _ in range(n):
    L = struct.unpack_from('<i', raw, off)[0]; off += 4
    name = raw[off:off + L].decode('utf-8'); off = (off + L + 3) & ~3
    sprites[name] = list(struct.unpack_from('<12i', raw, off)); off += 48
assert off == len(raw) - 24 or off <= len(raw), (off, len(raw))

with open(os.path.join(ROOT, 'data', 'pro-ui.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Sinh bởi tools/pro/rip_ui.py — đừng sửa tay. Atlas NGUI của PRO: [x,y,w,h, viền bl,br,bt,bb, đệm pl,pr,pt,pb], gốc trên-trái.\n')
    f.write('window.P1 = window.P1 || {};\n')
    f.write('P1.PRO_UI = { img: "art/pro/ui/main.png", size: [2048, 2048], s: {\n')
    f.write(',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v, separators=(',', ':'))) for k, v in sorted(sprites.items())))
    f.write('\n} };\n')

# Bố cục tham chiếu: cây Transform của level1/GUIS, kèm tên sprite atlas nhắc trong MonoBehaviour của mỗi nút.
lvl = [o for o in pe.env.objects if o.assets_file.name == 'level1']
go, tr, comps = {}, {}, collections.defaultdict(list)
for o in lvl:
    if o.type.name == 'GameObject':
        d = o.read(); go[o.path_id] = d.m_Name
    elif o.type.name == 'Transform':
        tr[o.path_id] = o.read()
    elif o.type.name == 'MonoBehaviour':
        raw = o.get_raw_data()
        gid = struct.unpack_from('<q', raw, 4)[0]
        hits = [s for s in sprites if len(s) > 3 and s.encode() in raw]
        if hits: comps[gid].append(max(hits, key=len))
kids = collections.defaultdict(list); roots = []
for pid, t in tr.items():
    (kids[t.m_Father.path_id] if t.m_Father.path_id else roots).append(pid)
lines = []
def walk(pid, depth, ox, oy):
    t = tr[pid]; p = t.m_LocalPosition; s = t.m_LocalScale
    gid = t.m_GameObject.path_id
    x, y = ox + p.x, oy + p.y
    lines.append('%s%s  local(%.0f,%.0f) abs(%.0f,%.0f) scale(%.2f) %s' % ('  ' * depth, go.get(gid, '?'), p.x, p.y, x, y, s.x, ' '.join(comps.get(gid, []))))
    for k in kids[pid]: walk(k, depth + 1, x, y)
for r in roots:
    if go.get(tr[r].m_GameObject.path_id) == 'GUIS': walk(r, 0, 0, 0)
os.makedirs(os.path.join(PRO, 'ref'), exist_ok=True)
open(os.path.join(PRO, 'ref', 'gamegui.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(sprites), 'sprite;', len(lines), 'nút GUI')
