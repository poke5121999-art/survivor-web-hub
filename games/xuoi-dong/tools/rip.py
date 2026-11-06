# -*- coding: utf-8 -*-
"""Rút art + âm thanh cho Xuôi Dòng thẳng từ bản cài Steam của Farming Camp Demo.

Chạy lại bao nhiêu lần cũng ra cùng một bộ tệp (ghi đè, không cộng dồn).
    set PYTHONIOENCODING=utf-8
    python games/xuoi-dong/tools/rip.py            # art + audio
    python games/xuoi-dong/tools/rip.py art        # chỉ art
    python games/xuoi-dong/tools/rip.py audio      # chỉ audio
Biến môi trường: FC_DATA (thư mục Farming Camp_Data), VGMSTREAM (vgmstream-cli.exe).
"""
import io, json, os, re, shutil, subprocess, sys, tempfile

import UnityPy
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art')
AUD = os.path.join(GAME, 'audio')
FC = os.environ.get('FC_DATA', r'D:\Steam\steamapps\common\Farming Camp Demo\Farming Camp_Data')
VGM = os.environ.get('VGMSTREAM', 'vgmstream-cli')
CACHE = os.path.join(tempfile.gettempdir(), 'xuoi-dong-rip')
PPU = 32

# ---------------------------------------------------------------- PICKS
# Sprite theo tên, hoặc "Tiền_tố_*" để lấy cả dãy khung số.
SPRITES = [
    'Boat_*', 'BoatB_*', 'BoatJP_*', 'BoatJefferson_*', 'BoatWhistle_*',
    'FishA_*', 'FishC_*', 'FishD_*', 'FishE_*', 'FishF_*', 'FishG_*', 'FishH_*', 'FishI_*', 'FishJ_*',
    'FloatingBarrelA_*', 'FloatingBarrelB_*', 'FloatingCrate_*', 'FloatingLog_*',
    'WaterRock_*', 'WaterRockB_*', 'WaterRockC_*',
    'MossyWaterRock_*', 'MossyWaterRockB_*', 'MossyWaterRockC_*',
    'AlligatorIdle_*', 'SpeedBoat_*', 'SplashAnim_*', 'WaterSplash_*',
    'VFX_Rain_*', 'Raindrops_*', 'VFX_Sparkles_*', 'Leaf_vfx_sheet_*', 'VFX_Firefly', 'VFX_Puff_*',
    'VFX_Bubbles_*', 'Cloud_vfx_sheet_0', 'Cloud_vfx_sheet_2', 'Cloud_vfx_sheet_5', 'Cloud_vfx_sheet_8',
    'Bird_idle_*', 'Bird_sing_*', 'BirdsB_*', 'Frog_*', 'Turtle_57', 'Turtle_58', 'Turtle_59',
    'VitoriaRegea_A', 'VitoriaRegea_B', 'VitoriaRegea_C', 'VitoriaRegea_D',
    'GodrayA', 'GodrayB', 'DayPhase_icons_*', 'FarmingCamp_LogoPixel_0',
]
# Boat_/BoatB_ có pivot (0.5,0.2), còn BoatJP_/BoatJefferson_ lại là (0.5,0.0) dù cùng
# một khung 180x153 vẽ cùng chỗ: giữ pivot gốc thì đổi bạn đồng hành là thuyền nhảy 30px.
PIVOT_OVERRIDE = {'BoatJP_': (0.5, 0.2), 'BoatJefferson_': (0.5, 0.2)}
# Tấm sheet không có Sprite con (hệ hạt của Unity cắt theo lưới lúc chạy).
SHEETS = [
    # tex, kiểu cắt, tham số, tiền tố tên
    ('VFX_Bird', 'bands', 4, 'BirdFly'),          # 8 dải: chim xám, bóng, xanh, bóng, đỏ, bóng, vàng, bóng
    ('VFX_Butterfly', 'grid', (6, 8), 'Butterfly'),
]
# Bốn khúc sông dựng sẵn trong scene level9 (minigame lái thuyền).
BIOME_GENS = {
    'canyon': 'P_MountainRiverGen_A',
    'forest': 'P_ForestRiverGen_A',
    'swamp': 'P_SwampRiverGen_A',
    'cave': 'P_CaveRiverGen_A',
}
FLOOR_GEN = 'P_ForestRiverGen_A'
# key: (bank, subsong, tên phải khớp, loại, giây tối đa)
AUDIO = {
    'mus_day': ('Music.assets', 120, 'Sail On', 'music', 0),
    'mus_golden': ('Music.assets', 68, 'Sail On 2', 'music', 0),
    'mus_dawn': ('Music.assets', 35, 'Sail On 3', 'music', 0),
    'mus_night': ('Music.streams', 31, 'Main Menu - Noite', 'music', 0),
    'amb_water': ('SFX.streams', 30, 'FC_waterclose', 'bed', 0),
    'amb_sea': ('SFX.streams', 38, 'FC_waterfar', 'bed', 0),
    'amb_morning': ('SFX.streams', 35, 'FC_MorningDayFull', 'bed', 60),
    'amb_afternoon': ('SFX.streams', 15, 'FC_Afternoon', 'bed', 60),
    'amb_night': ('SFX.streams', 29, 'FC_NightBG', 'bed', 0),
    'amb_river_night': ('SFX.streams', 41, 'FC_rivernightanimals', 'bed', 0),
    'amb_rain': ('SFX.streams', 31, 'FC_Rain', 'bed', 0),
    'amb_wind': ('SFX.streams', 24, 'FC_Wind', 'bed', 45),
    'amb_hull': ('SFX.streams', 53, 'FC_boatslide', 'bed', 30),
    'whistle1': ('SFX.assets', 19, 'FC_BoatWhistle1A', 'sfx', 0),
    'whistle2': ('SFX.assets', 366, 'FC_BoatWhistle1B', 'sfx', 0),
    'whistle3': ('SFX.assets', 412, 'FC_BoatWhistle1C', 'sfx', 0),
    'hit1': ('SFX.assets', 317, 'FC_BoatHit1', 'sfx', 0),
    'hit2': ('SFX.assets', 144, 'FC_BoatHit2', 'sfx', 0),
    'hit3': ('SFX.assets', 403, 'FC_BoatHit3', 'sfx', 0),
    'crack1': ('SFX.assets', 129, 'FC_BoatCrack1', 'sfx', 0),
    'crack2': ('SFX.assets', 181, 'FC_BoatCrack2', 'sfx', 0),
    'fish1': ('SFX.assets', 66, 'FC_FishCaught1', 'sfx', 0),
    'fish2': ('SFX.assets', 67, 'FC_FishCaught2', 'sfx', 0),
    'fish3': ('SFX.assets', 83, 'FC_FishCaught3', 'sfx', 0),
    'fish4': ('SFX.assets', 25, 'FC_FishCaught4', 'sfx', 0),
    'fish_rare': ('SFX.assets', 331, 'FC_NewRecord', 'sfx', 0),
    'collect': ('SFX.assets', 156, 'FC_Collect', 'sfx', 0),
    'pickup': ('SFX.assets', 96, 'PickUp', 'sfx', 0),
    'boost': ('SFX.assets', 15, 'PlayerBoost', 'sfx', 0, 18),
    'splash1': ('SFX.assets', 206, 'FC_fs_water1', 'sfx', 0),
    'splash2': ('SFX.assets', 263, 'FC_fs_water2', 'sfx', 0),
    'splash3': ('SFX.assets', 11, 'FC_fs_water3', 'sfx', 0),
    'bird1': ('SFX.assets', 416, 'FC_birds1', 'sfx', 0),
    'bird2': ('SFX.assets', 410, 'FC_birds2', 'sfx', 0),
    'bird3': ('SFX.assets', 376, 'FC_birds3', 'sfx', 0),
    'bird4': ('SFX.assets', 193, 'FC_birds4', 'sfx', 0),
    'frog1': ('SFX.assets', 241, 'FC_Frog1', 'sfx', 0),
    'frog2': ('SFX.assets', 192, 'FC_Frog2', 'sfx', 0),
    'owl1': ('SFX.streams', 32, 'FC_NightOwl1', 'sfx', 0),
    'owl2': ('SFX.streams', 51, 'FC_NightOwl2', 'sfx', 0),
    'thunder1': ('SFX.streams', 8, 'FC_Thunder1', 'sfx', 0),
    'thunder2': ('SFX.streams', 43, 'FC_Thunder2', 'sfx', 0),
    'thunder3': ('SFX.streams', 36, 'FC_Thunder3', 'sfx', 0),
    'click': ('SFX.assets', 78, 'Click', 'sfx', 0),
    'notify': ('SFX.assets', 91, 'FC_NotificationIn', 'sfx', 0),
}
ENCODE = {
    'music': ['-ac', '2', '-ar', '44100', '-b:a', '128k'],
    'bed': ['-ac', '2', '-ar', '44100', '-b:a', '64k'],
    'sfx': ['-ac', '1', '-ar', '44100', '-b:a', '96k'],
}


# ---------------------------------------------------------------- helpers
def load_env():
    files = [os.path.join(FC, 'level9')]
    files += sorted(os.path.join(FC, f) for f in os.listdir(FC)
                    if f.endswith('.assets') and (f.startswith('sharedassets') or f == 'resources.assets'))
    return UnityPy.load(*files)


def want(name):
    for p in SPRITES:
        if p.endswith('*'):
            if re.fullmatch(re.escape(p[:-1]) + r'\d+', name):
                return True
        elif p == name:
            return True
    return False


def collect_sprites(env):
    out = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        s = o.read()
        n = s.m_Name
        if n in out or not want(n):
            continue
        img = s.image.convert('RGBA')
        pv = (s.m_Pivot.x, s.m_Pivot.y)
        for pre, ov in PIVOT_OVERRIDE.items():
            if n.startswith(pre):
                pv = ov
        out[n] = (img, pv)
    return out


def textures(env):
    t = {}
    for o in env.objects:
        if o.type.name == 'Texture2D':
            d = o.read()
            t.setdefault(d.m_Name, d)
    return t


def slice_sheets(tex, out):
    for name, mode, arg, pre in SHEETS:
        im = tex[name].image.convert('RGBA')
        W, H = im.size
        a = im.getchannel('A')
        if mode == 'bands':
            rows = [any(a.getpixel((x, y)) for x in range(W)) for y in range(H)]
            bands, y = [], 0
            while y < H:
                if rows[y]:
                    y0 = y
                    while y < H and rows[y]:
                        y += 1
                    bands.append((y0, y))
                y += 1
            cw = W // arg
            for bi, (y0, y1) in enumerate(bands):
                for c in range(arg):
                    cell = im.crop((c * cw, y0, (c + 1) * cw, y1))
                    out['%s%d_%d' % (pre, bi, c)] = (cell, (0.5, 0.5))
        else:
            cw, ch = arg
            for r in range(H // ch):
                for c in range(W // cw):
                    out['%s%d_%d' % (pre, r, c)] = (im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), (0.5, 0.5))


def pack(sprites, maxw=2048):
    items = sorted(sprites.items(), key=lambda kv: (-kv[1][0].height, kv[0]))
    x = y = rowh = 0
    place = {}
    for n, (img, pv) in items:
        w, h = img.size
        if x + w + 1 > maxw:
            x, y, rowh = 0, y + rowh + 1, 0
        place[n] = (x, y)
        x += w + 1
        rowh = max(rowh, h)
    H = y + rowh
    if H > 2048:
        raise SystemExit('atlas cao %d > 2048' % H)
    sheet = Image.new('RGBA', (maxw, H), (0, 0, 0, 0))
    frames = {}
    for n, (img, pv) in sprites.items():
        px, py = place[n]
        sheet.paste(img, (px, py))
        frames[n] = {'x': px, 'y': py, 'w': img.width, 'h': img.height,
                     'px': round(pv[0] * img.width), 'py': round((1 - pv[1]) * img.height)}
    return sheet, frames


def anims_of(frames):
    groups = {}
    for n in frames:
        m = re.fullmatch(r'(.+?)_?(\d+)', n)
        if m:
            groups.setdefault(m.group(1), []).append((int(m.group(2)), n))
    return {k: [n for _, n in sorted(v)] for k, v in groups.items() if len(v) > 1}


def waterlines(tex):
    """WaterTexture là nền cyan đặc với các vạch sóng sáng hơn: giữ lại đúng các vạch."""
    im = tex['WaterTexture'].image.convert('RGB')
    base = sorted(im.getdata(), key=lambda p: p[1] + p[2])[len(im.getdata()) // 2]
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for y in range(im.height):
        for x in range(im.width):
            p = im.getpixel((x, y))
            d = (p[1] + p[2]) - (base[1] + base[2])
            if d > 6:
                out.putpixel((x, y), (255, 255, 255, min(255, 90 + d * 6)))
    return out


# ---------------------------------------------------------------- level bake
def level_items(env):
    objs = [o for o in env.objects if o.assets_file.name == 'level9']
    TR = {o.path_id: o.read() for o in objs if o.type.name == 'Transform'}

    def comp(go, tname):
        for c in go.m_Component:
            cc = c.component if hasattr(c, 'component') else c
            if cc.type.name == tname:
                return cc

    def world(t):
        names, first, active = [], True, True
        x = y = 0.0
        sx = sy = 1.0
        cur = t
        while cur is not None:
            p, s = cur.m_LocalPosition, cur.m_LocalScale
            if first:
                x, y, sx, sy = p.x, p.y, s.x, s.y
            else:
                x, y, sx, sy = p.x + s.x * x, p.y + s.y * y, sx * s.x, sy * s.y
            g = cur.m_GameObject.read()
            if first:
                active = g.m_IsActive
            names.append(g.m_Name)
            first = False
            f = cur.m_Father
            cur = TR.get(f.path_id) if f and f.path_id else None
        return names[::-1], x, y, sx, sy, active

    cache = {}

    def spr(ptr):
        k = (ptr.file_id, ptr.path_id)
        if k not in cache:
            try:
                s = ptr.read()
                cache[k] = (s.m_Name, s.image.convert('RGBA'), s.m_Pivot.x, s.m_Pivot.y)
            except Exception:
                cache[k] = None
        return cache[k]

    items = {}
    for o in objs:
        if o.type.name == 'SpriteRenderer':
            r = o.read()
            go = r.m_GameObject.read()
            names, x, y, sx, sy, act = world(TR[comp(go, 'Transform').path_id])
            if not act or not r.m_Enabled or len(names) < 2 or not r.m_Sprite.path_id or r.m_DrawMode != 0:
                continue
            sp = spr(r.m_Sprite)
            if not sp:
                continue
            c = r.m_Color
            items.setdefault(names[1], []).append(dict(
                kind='spr', name=sp[0], img=sp[1], pv=(sp[2], sp[3]), x=x, y=y, sx=sx, sy=sy,
                flip=(r.m_FlipX, r.m_FlipY), lay=r.m_SortingLayer, ord=r.m_SortingOrder,
                col=(c.r, c.g, c.b, c.a), path='/'.join(names)))
        elif o.type.name == 'Tilemap':
            tm = o.read()
            go = tm.m_GameObject.read()
            names, x, y, sx, sy, act = world(TR[comp(go, 'Transform').path_id])
            rr = comp(go, 'TilemapRenderer')
            rend = rr.read() if rr else None
            if not act or len(names) < 2 or not rend or not rend.m_Enabled:
                continue
            sprs = [spr(e.m_Data) for e in tm.m_TileSpriteArray]
            tiles = tm.m_Tiles
            its = list(tiles.items()) if isinstance(tiles, dict) else list(tiles)
            items.setdefault(names[1], []).append(dict(
                kind='tm', name=go.m_Name, x=x, y=y, lay=rend.m_SortingLayer, ord=rend.m_SortingOrder,
                tiles=[(p.x, p.y, sprs[d.m_TileSpriteIndex]) for p, d in its], path='/'.join(names)))
    return items


def tint(img, col):
    r, g, b, a = col
    if (r, g, b, a) == (1, 1, 1, 1):
        return img
    ch = img.split()
    return Image.merge('RGBA', [ch[0].point(lambda v: int(v * r)), ch[1].point(lambda v: int(v * g)),
                                ch[2].point(lambda v: int(v * b)), ch[3].point(lambda v: int(v * a))])


def render(items, x0, width_u, ytop, ybot, wrap):
    """Vẽ các mục vào ảnh phủ [x0, x0+width_u) x [ybot, ytop] (đơn vị Unity), bọc ngang để nối liền."""
    W, H = int(width_u * PPU), int(round((ytop - ybot) * PPU))
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shifts = (-width_u, 0, width_u) if wrap else (0,)
    for it in sorted(items, key=lambda it: (it['lay'], it['ord'], -it['y'])):
        for sh in shifts:
            if it['kind'] == 'tm':
                for tx, ty, sp in it['tiles']:
                    if not sp:
                        continue
                    px = int(round((it['x'] + tx + sh - x0) * PPU))
                    py = int(round((ytop - (it['y'] + ty + 1)) * PPU))
                    if -32 < px < W and -32 < py < H:
                        paste(im, sp[1], px, py)
                continue
            img = it['img']
            if it['flip'][0]:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            if it['flip'][1]:
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
            w, h = abs(it['sx']) * img.width, abs(it['sy']) * img.height
            if w < 1 or h < 1 or w > 4000 or h > 4000:
                continue
            if (round(w), round(h)) != img.size:
                img = img.resize((max(1, int(round(w))), max(1, int(round(h)))), Image.NEAREST)
            if it['sx'] < 0:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            if it['sy'] < 0:
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
            img = tint(img, it['col'])
            px = int(round((it['x'] + sh - x0) * PPU - it['pv'][0] * img.width))
            py = int(round((ytop - it['y']) * PPU - (1 - it['pv'][1]) * img.height))
            paste(im, img, px, py)
    return im


def paste(dst, src, px, py):
    if px >= dst.width or py >= dst.height or px + src.width <= 0 or py + src.height <= 0:
        return
    cx, cy = max(0, -px), max(0, -py)
    src = src.crop((cx, cy, min(src.width, dst.width - px), min(src.height, dst.height - py)))
    dst.alpha_composite(src, (px + cx, py + cy))


FLOOR_ORD = 1          # tilemap đáy sông (0) + mảng sâu (1)
SKIP = ('WaterTexture', 'GradientLight', 'Square')
YTOP, YBOT, RIVER_MID = 9, -16, -4.2   # khung vẽ (đơn vị Unity); RIVER_MID nằm giữa lòng sông của cả bốn khúc
FILL_GAP = 40                          # px tính từ mép nước vào đất liền được để trống
SOLID_FILL = {"cave": (4, 6, 8, 255)}      # hang: ngoài mép đá là bóng tối, không phải nước


def bake_biomes(items):
    chunks = {}
    floor_items = [it for it in items[FLOOR_GEN] if it['kind'] == 'tm' and it['ord'] <= FLOOR_ORD]
    gx = min(it['x'] for it in floor_items)
    floor = render(floor_items, gx, 72, 2, -13, True)
    floor.save(os.path.join(ART, 'floor.png'), optimize=True)
    for key, gen in BIOME_GENS.items():
        L = [it for it in items[gen] if it['name'] not in SKIP and not (it['kind'] == 'tm' and it['ord'] <= FLOOR_ORD)]
        banks = [it for it in L if 'Underwater' not in it['path']]
        under = [it for it in L if it not in banks]          # dải bóng tối dưới nước B_10..B_14
        x0 = min(it['x'] for it in L if it['kind'] == 'tm') if any(it['kind'] == 'tm' for it in L) else gx
        full = render(banks, x0, 72, YTOP, YBOT, True)
        a = full.getchannel('A')
        W, H = full.size
        cov = [sum(1 for x in range(0, W, 4) if a.getpixel((x, y)) > 128) / (W / 4) for y in range(H)]
        mid = int((YTOP - RIVER_MID) * PPU)
        top_edge = max(y for y in range(0, mid) if cov[y] >= 0.5) + 1
        bot_edge = min(y for y in range(mid, H) if cov[y] >= 0.5)
        up, down = int(4.5 * PPU), int(1.5 * PPU)
        # Khe hở trên đất liền (vòm đá của hẻm núi, lòng đầm) trong Unity lộ ra thác nước/đáy
        # sông; ở đây lót bằng chính đáy sông, chỉ ở phần xa mép nước để không đè lên dòng chảy.
        lined = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        if key in SOLID_FILL:
            lined.paste(SOLID_FILL[key], (0, 0, W, H))
        else:
            for y in range(0, H, floor.height):
                paste(lined, floor, 0, y)
        lined.paste((0, 0, 0, 0), (0, top_edge - FILL_GAP, W, bot_edge + FILL_GAP))
        if under:
            lined.alpha_composite(render(under, x0, 72, YTOP, YBOT, True))
        lined.alpha_composite(full)
        top = lined.crop((0, top_edge - up, W, top_edge + down))
        bot = lined.crop((0, bot_edge - down, W, bot_edge + up))
        top.save(os.path.join(ART, 'bank_%s_top.png' % key), optimize=True)
        bot.save(os.path.join(ART, 'bank_%s_bot.png' % key), optimize=True)
        chunks[key] = {'w': W, 'topH': top.height, 'topEdge': up, 'botH': bot.height, 'botEdge': down,
                       'riverU': round((bot_edge - top_edge) / PPU, 2)}
        print('  bank', key, 'top_edge', top_edge, 'bot_edge', bot_edge, 'river', bot_edge - top_edge, 'px')
    return chunks, {'w': floor.width, 'h': floor.height}


def rip_art():
    os.makedirs(ART, exist_ok=True)
    env = load_env()
    tex = textures(env)
    sprites = collect_sprites(env)
    missing = [p for p in SPRITES if not any(want(n) and (n == p or n.startswith(p[:-1])) for n in sprites)]
    if missing:
        raise SystemExit('thiếu sprite: %s' % missing)
    slice_sheets(tex, sprites)
    sprites['WaterLines'] = (waterlines(tex), (0.5, 0.5))
    sheet, frames = pack(sprites)
    sheet.save(os.path.join(ART, 'atlas.png'), optimize=True)
    print('  atlas', sheet.size, len(frames), 'khung')
    items = level_items(env)
    chunks, floor = bake_biomes(items)
    manifest = {'frames': frames, 'anims': anims_of(frames), 'banks': chunks, 'floor': floor}
    js = '// Sinh bởi tools/rip.py — đừng sửa tay.\nwindow.XD_ATLAS = ' + json.dumps(manifest, sort_keys=True, separators=(',', ':')) + ';\n'
    io.open(os.path.join(ART, 'atlas.js'), 'w', encoding='utf-8', newline='\n').write(js)


# ---------------------------------------------------------------- audio
def probe_name(bank, idx):
    out = subprocess.run([VGM, '-m', '-s', str(idx), bank], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
    m = re.search(r'stream name: (.*)', out)
    return m.group(1).strip() if m else ''


BED_MEAN_DB = -30.0


def mean_db(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                         capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    return float(re.search(r'mean_volume: (-?[\d.]+) dB', err).group(1))


def rip_audio():
    os.makedirs(AUD, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    meta = {}
    for f in os.listdir(AUD):
        if f.endswith(".mp3") and f[:-4] not in AUDIO:
            os.remove(os.path.join(AUD, f))
    for key, pick in sorted(AUDIO.items()):
        bank, idx, name, kind, maxs = pick[:5]
        gain = pick[5] if len(pick) > 5 else 0
        bpath = os.path.join(FC, 'StreamingAssets', bank + '.bank')
        got = probe_name(bpath, idx)
        if got != name:
            raise SystemExit('%s: subsong %d của %s tên "%s", chờ "%s"' % (key, idx, bank, got, name))
        wav = os.path.join(CACHE, '%s_%d.wav' % (bank, idx))
        if not os.path.exists(wav):
            subprocess.run([VGM, '-s', str(idx), '-o', wav, bpath], check=True, capture_output=True)
        if kind == 'bed':
            # Nền môi trường gốc lệch nhau tới 22 dB (NightBG -53.5, waterclose -31): kéo về
            # cùng một mức để bộ trộn chỉ còn phải nói "to bao nhiêu phần", không phải bù.
            gain = BED_MEAN_DB - mean_db(wav)
        af = []
        if kind == 'sfx':
            af.append('silenceremove=start_periods=1:start_threshold=-50dB')
        if gain:
            af += ['volume=%.1fdB' % gain, 'alimiter=limit=0.95']
        if maxs:
            af.append('afade=t=out:st=%g:d=1.5' % (maxs - 1.5))
        mp3 = os.path.join(AUD, key + '.mp3')
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav]
        if maxs:
            cmd += ['-t', str(maxs)]
        if af:
            cmd += ['-af', ','.join(af)]
        cmd += ENCODE[kind] + ['-map_metadata', '-1', mp3]
        subprocess.run(cmd, check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
                                   capture_output=True, text=True).stdout.strip())
        meta[key] = {'kind': kind, 'dur': round(dur, 2)}
        print('  audio', key, name, '%.1fs' % dur, os.path.getsize(mp3) // 1024, 'KB')
    js = '// Sinh bởi tools/rip.py — đừng sửa tay.\nwindow.XD_AUDIO = ' + json.dumps(meta, sort_keys=True, separators=(',', ':')) + ';\n'
    io.open(os.path.join(AUD, 'audio.js'), 'w', encoding='utf-8', newline='\n').write(js)


if __name__ == '__main__':
    what = sys.argv[1:] or ['art', 'audio']
    if 'art' in what:
        rip_art()
    if 'audio' in what:
        rip_audio()
