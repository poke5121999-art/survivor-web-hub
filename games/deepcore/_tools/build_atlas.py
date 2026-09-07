# -*- coding: utf-8 -*-
"""
Dong goi art cho game "Loi Sau" (games/deepcore).

CHAY LAI:  python games/deepcore/_tools/build_atlas.py
NGUON:     D:/CoreKeeperAssets/{tex,frames.json}  (do _tools/rip_corekeeper.py sinh ra)
KET QUA:   games/deepcore/assets/atlas<N>.png + assets/atlas-data.js

LUAT CUA DUONG ONG (giong dragonproj): trong code game KHONG co ten file anh nao,
chi co khoa kieu 'mob.caveling.move'. Doi art = sua ROSTER o day roi chay lai,
KHONG dung code.

Cach lay so khung hinh, theo thu tu uu tien:
  1. frames.json  -> rect chinh xac, doc tu cac doi tuong Sprite cua Unity.
  2. tu do        -> dai ngang N khung deu nhau; do bang "cot bien it alpha".
"""
import io
import json
import os

import numpy as np
from PIL import Image

SRC = r'D:/CoreKeeperAssets'
TEX = SRC + '/tex'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
MAXP = 2048
PAD = 1

_fp = SRC + '/frames.json'
FRAMES = json.load(io.open(_fp, encoding='utf-8')) if os.path.exists(_fp) else {}


# ---------------------------------------------------------------- do khung hinh
# Dai nao bo do doan sai thi ghi de o day. So khung DEM BANG MAT tren anh phong
# to (xem _tools/contact_sheet.py). Chi ghi ten texture goc, khong ghi khoa game.
FRAME_OVERRIDE = {
    'bombScarab_move': 2, 'bombScarab_idle': 2,
    'bombScarab_move_up': 2, 'bombScarab_idle_up': 2,
    'snootFly_move': 8, 'snootFly_move_up': 8, 'snootFly_move_side': 7,
    'cat_move': 6, 'cat_idle': 6, 'cat_idle_up': 6,
}

TOL = 1.4        # n lon nhat con nam trong nguong nay so voi diem tot nhat
ASPECT_TARGET = 0.80   # be ngang mot khung / chieu cao, uoc cho nguoi + quai


def guess_n(img, maxn=24):
    """Doan so khung cua mot dai ngang, gop ba dau hieu:

      khe-cat  cot nam dung duong cat giua hai khung thuong it alpha;
      lech-tam moi khung co tam khoi alpha gan giua khung;
      ti-le    mot khung cao hon rong (nhan vat nhin tu tren xuong).

    Lay n LON NHAT con trong nguong TOL, vi n dung hay bi n/2 lan at: cat doi
    mot dai 8 khung thanh 4 thi duong cat cu van con trong.
    """
    W, H = img.size
    a = np.asarray(img.convert('RGBA'))[:, :, 3].astype(np.float32) / 255.0
    ca = a.sum(axis=0)
    mean = ca.mean() or 1.0
    cand = []
    for n in range(2, maxn + 1):
        if W % n:
            continue
        fw = W // n
        if fw < max(4, H * 0.32):
            continue
        cuts = [i * fw for i in range(1, n)] + [i * fw - 1 for i in range(1, n)]
        gut = ca[cuts].mean() / mean
        offs = []
        for i in range(n):
            seg = ca[i * fw:(i + 1) * fw]
            s = seg.sum()
            if s > 0:
                offs.append(((seg * np.arange(fw)).sum() / s - (fw - 1) / 2.0) / fw)
        cen = float(np.std(offs)) + abs(float(np.mean(offs))) if offs else 1.0
        asp = abs(np.log(fw / (ASPECT_TARGET * H)))
        cand.append((gut + cen * 3.0 + asp * 0.6, n))
    if not cand:
        return 1
    cand.sort()
    lim = cand[0][0] * TOL + 0.10
    return max([n for sc, n in cand if sc <= lim] or [cand[0][1]])


# ---------------------------------------------------------------- to mau
"""
Core Keeper to mau nhieu sinh vat bang BANG DAI MAU (gradient map): anh sprite
goc chi la mat na DO SANG (xam hoan toan), con mau that nam trong mot texture
256x1 ten `gm_<ten>`. Khong ap bang nay thi con cho, con meo, con rua, bo cuon...
deu ve ra thanh mot khoi den -- va do dung la trieu chung da gap khi nhin bang
doi chieu lan dau.

Anh xa: lay KENH DO cua diem anh lam chi so 0..255, tra vao bang, giu nguyen alpha.
"""
_GM_CACHE = {}


def gm_palette(base):
    """Tim bang dai mau cho mot sinh vat. Thu lan luot vai duoi ten hay gap."""
    if base in _GM_CACHE:
        return _GM_CACHE[base]
    pal = None
    for suf in ('', '_common', '_default'):
        p = os.path.join(TEX, 'gm_' + base + suf + '.png')
        if os.path.exists(p):
            im = Image.open(p).convert('RGBA')
            arr = np.asarray(im)[0]
            if arr.shape[0] >= 2:
                if arr.shape[0] != 256:
                    idx = (np.arange(256) * arr.shape[0] // 256).clip(0, arr.shape[0] - 1)
                    arr = arr[idx]
                pal = arr
            break
    _GM_CACHE[base] = pal
    return pal


def apply_gm(img, pal):
    a = np.asarray(img.convert('RGBA'))
    out = pal[a[:, :, 0]].copy()
    out[:, :, 3] = a[:, :, 3]
    return Image.fromarray(out.astype('uint8'), 'RGBA')


# ---------------------------------------------------------------- xep hinh
def pack(items, maxw=MAXP, maxh=MAXP):
    """Xep theo ke: sap cao->thap, rai tung hang, day thi sang trang moi.

    items: [(key, img, frames)]  ->  {key: (page, x, y)} + [ (w,h) moi trang ]
    """
    order = sorted(range(len(items)), key=lambda i: -items[i][1].size[1])
    place = {}
    pages = []  # moi trang: dict(x, shelf_y, shelf_h, w, h)

    def newpage():
        pages.append({'x': 0, 'shelf_y': 0, 'shelf_h': 0, 'w': 0, 'h': 0})

    newpage()
    for i in order:
        key, img, _ = items[i]
        w, h = img.size[0] + PAD, img.size[1] + PAD
        if w > maxw or h > maxh:
            raise ValueError('anh qua kho: %s %dx%d' % (key, img.size[0], img.size[1]))
        done = False
        for pi, p in enumerate(pages):
            if p['x'] + w <= maxw and p['shelf_y'] + max(p['shelf_h'], h) <= maxh:
                place[key] = (pi, p['x'], p['shelf_y'])
                p['x'] += w
                p['shelf_h'] = max(p['shelf_h'], h)
            elif p['shelf_y'] + p['shelf_h'] + h <= maxh:
                p['shelf_y'] += p['shelf_h']
                p['shelf_h'] = h
                place[key] = (pi, 0, p['shelf_y'])
                p['x'] = w
            else:
                continue
            p['w'] = max(p['w'], p['x'])
            p['h'] = max(p['h'], p['shelf_y'] + p['shelf_h'])
            done = True
            break
        if not done:
            newpage()
            p = pages[-1]
            place[key] = (len(pages) - 1, 0, 0)
            p['x'], p['shelf_h'] = w, h
            p['w'], p['h'] = w, h
    return place, pages


# ---------------------------------------------------------------- danh muc
BIOMES = {
    'dirt': 'dirt_tileset',
    'clay': 'clay_tileset',
    'nature': 'nature_tileset',
    'lava': 'lava_tileset',
    'crystal': 'crystal_tileset',
    'sea': 'sea_tileset',
    'desert': 'desert_tileset',
    'mold': 'mold_dungeon_tileset',
    'hive': 'larva_hive_tileset',
}
# vung cat trong mot tileset 336x416 -- do bang mat, ghi lai o assets/ASSETS.md
TILE_REGIONS = {
    'floor': (0, 80, 80, 144),     # 5 cot x 4 hang o 16px
    'wall': (0, 224, 80, 288),     # 5 x 4
    'decor': (0, 304, 80, 320),    # 5 x 1
    'ore': (176, 128, 208, 176),   # 2 x 3 -- via quang, ve DE LEN o tuong
    'crack': (144, 176, 176, 208), # 2 x 2 -- vet nut, ve khi o tuong dang bi dao
}

PC_BASE = [
    ('skin', 'Miner_skin'), ('eyes', 'Miner_eyes'),
    ('shirt', 'Miner_shirt'), ('pants', 'Miner_pants'),
    ('f_skin', 'MinerFemale_skin'), ('f_eyes', 'MinerFemale_eyes'),
    ('f_shirt', 'MinerFemale_shirt'),
]
PC_HAIR = ['1', '3', '6', '11', '17', '22']
PC_SETS = [
    ('copper', 'copperHelm', 'copperChest', 'copperPants'),
    ('iron', 'ironHelm', 'ironChest', 'ironPants'),
    ('scarlet', 'scarletHelm', 'scarletChest', 'scarletPants'),
    ('octarine', 'octarine_helm', 'octarine_chest', 'octarine_pants'),
    ('galaxite', 'galaxiteHelm', 'galaxiteChest', 'galaxitePants'),
    ('crystal', 'crystalHelmet', 'crystalChestplate', 'crystalLeggings'),
    ('miner', 'minerHelm', 'minerChest', 'minerPants'),
    ('ranger', 'rangerHelm', 'rangerChest', 'rangerPants'),
    ('sorcerer', 'sorcererHelm', 'sorcererChest', 'sorcererPants'),
    ('ninja', 'ninjaHelm', 'ninjaChest', 'ninjaPants'),
    ('golem', 'golemHelm', 'golemChest', 'golemPants'),
    ('lava', 'lavaHelm', 'lavaChest', 'lavaPants'),
    ('mold', 'moldHelm', 'moldChest', 'moldPants'),
    ('scarab', 'scarabHelm', 'scarabChest', 'scarabPants'),
    ('chieftain', 'chieftainHelm', 'chieftainChest', 'chieftainPants'),
    ('guardian', 'desertGuardianHelm', 'desertGuardianChest', 'desertGuardianPants'),
    ('hivebone', 'hiveboneHelm', 'hiveboneChest', 'hivebonePants'),
    ('commander', 'coreCommanderHelm', 'coreCommanderChest', 'coreCommanderPants'),
    ('godsent', 'godsent_helm', 'godsent_chest', 'godsent_pants'),
    ('alien', 'alienTechHelm', 'alienTechChest', 'alienTechPants'),
    ('blast', 'blastHelm', 'blastChest', 'blastPants'),
    ('tamer', 'tamerHelm', 'tamerChest', 'tamerPants'),
    ('monk', 'arcaneMonkHelm', 'arcaneMonkChest', 'arcaneMonkPants'),
    ('grim', 'grimHelm', 'grimChest', 'grimPants'),
    ('warden', 'corruptedWardenHelm', 'corruptedWardenChest', 'corruptedWardenPants'),
    ('hydra', 'hydraBoneHelm', 'hydraBoneChest', 'hydraBonePants'),
    ('wood', 'woodHelm', 'woodChest', 'woodPants'),
]

MOB_ANIMS = [
    'idle', 'idle_side', 'idle_up', 'move', 'move_side', 'move_up',
    'attack', 'attack_side', 'attack_up',
    'rangedAttack', 'rangedAttack_side', 'rangedAttack_up',
    'charge', 'charge_side', 'charge_up',
    'chargeAnticipation', 'chargeAnticipation_side', 'chargeAnticipation_up',
    'startExplode', 'startExplode_side', 'startExplode_up',
    'jump', 'jump_side', 'jump_up',
]
MOBS = [
    'larva', 'larva_red', 'bigLarva', 'bigLarvaVampire', 'acidLarva',
    'caveling', 'cavelingSpearman', 'cavelingHunter', 'cavelingShaman',
    'cavelingBrute', 'cavelingAssassin', 'cavelingSkirmisher', 'cavelingScholar',
    'infectedCaveling', 'bombScarab', 'snootFly', 'mimiteCrystal',
    'ancientGolem', 'rolyPoly', 'ElectroPestEnemy',
    'scorpion', 'cockroach', 'manyleg',
]
PETS = [
    'summonSkeleton', 'summonFireMite', 'petslime', 'petslimePrince',
    'orbitalTurret', 'dog', 'cat', 'tardigrade', 'bat', 'turtle',
]
PET_ANIMS = MOB_ANIMS + [
    'shieldUp', 'shieldLoop', 'shieldDown', 'happy', 'poof', 'idleEmote1',
]

BOSS_SHEETS = [
    'boss_slime', 'boss_slime_shadow', 'king_slime',
    'boss_hiveMother_base', 'boss_hiveMother_mouth',
    'boss_hiveMother_tentacles', 'boss_hiveMother_eyes',
    'Scarab_boss', 'Scarab_boss_butt', 'Scarab_boss_blue_ball',
    'Octopus_boss_body',
]
BOSS_ANIM_MOBS = [
    ('shrooman', 'shroomanBrute', MOB_ANIMS + [
        'collide', 'collide_side', 'collide_up',
        'vulnerable', 'endVulnerable', 'chargeEnd']),
]

FX = [
    'SlimeExplosion', 'WhiteSlimeExplosion', 'BloodExplosion', 'SlimeImpact',
    'AcidSplat', 'AcidSplat2', 'BloodSplat', 'BlueSplat', 'MoldSplat2',
    'AmoebaSplat', 'CytoplasmSplat', 'EnergyRipple_sheet',
    'Soulorb_core', 'Soulorb_energy', 'amoebaTrail_small', 'amoebaTrail_large',
    'GroundBurn', 'Ground_debris', 'Ground_debris_large',
]
MISC = ['coreBase', 'white_faded_spot']


# ---------------------------------------------------------------- dung danh muc
def load(name, gm_base=None):
    p = os.path.join(TEX, name + '.png')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGBA')
    if gm_base:
        pal = gm_palette(gm_base)
        if pal is not None:
            im = apply_gm(im, pal)
            GM_USED.add(gm_base)
    return im


GM_USED = set()


def frames_for(name, img):
    """Danh sach [x, y, w, h] cac khung, trong TOA DO ANH NGUON."""
    if name in FRAMES and FRAMES[name]['frames']:
        return [list(f) for f in FRAMES[name]['frames']]
    n = FRAME_OVERRIDE.get(name) or guess_n(img)
    fw = img.size[0] // n
    return [[i * fw, 0, fw, img.size[1]] for i in range(n)]


def grid_frames(w, h, fw=16, fh=16):
    return [[c * fw, r * fh, fw, fh]
            for r in range(h // fh) for c in range(w // fw)]


def main():
    items = []       # (key, img, frames-trong-anh-nguon)
    missing = []

    def add(key, img, frames):
        items.append((key, img, frames))

    def add_tex(key, texname, frames=None, gm_base=None):
        im = load(texname, gm_base)
        if im is None:
            missing.append(texname)
            return False
        add(key, im, frames if frames is not None else frames_for(texname, im))
        return True

    # --- o gach theo quan the
    for bk, tname in BIOMES.items():
        im = load(tname)
        if im is None:
            missing.append(tname)
            continue
        for rk, box in TILE_REGIONS.items():
            sub = im.crop(box)
            add('tile.%s.%s' % (bk, rk), sub, grid_frames(sub.width, sub.height))

    # --- nhan vat: moi lop la mot tam 234x156 dung chung 39 khung
    pcf = None
    _skin = load('Miner_skin')
    if _skin is not None:
        pcf = frames_for('Miner_skin', _skin)
    for key, tname in PC_BASE:
        add_tex('pc.' + key, tname, pcf)
    for h in PC_HAIR:
        add_tex('pc.hair.' + h, 'Miner_hair' + h, pcf)
        add_tex('pc.hairhelm.' + h, 'Miner_hair%s_helm' % h, pcf)
    for setk, helm, chest, pants in PC_SETS:
        add_tex('pc.helm.' + setk, helm, pcf)
        add_tex('pc.chest.' + setk, chest, pcf)
        add_tex('pc.pants.' + setk, pants, pcf)

    # --- quai / pet / boss co dai anim
    def add_anims(prefix, key, base, anims):
        got = 0
        for a in anims:
            t = '%s_%s' % (base, a)
            if add_tex('%s.%s.%s' % (prefix, key, a), t, None, base):
                got += 1
        if got == 0:
            missing.append(base + '_*')

    for m in MOBS:
        add_anims('mob', m, m, MOB_ANIMS)
    for p in PETS:
        add_anims('pet', p, p, PET_ANIMS)
    for key, base, anims in BOSS_ANIM_MOBS:
        add_anims('boss', key, base, anims)
    for t in BOSS_SHEETS:
        add_tex('boss.sheet.' + t, t)

    # --- hieu ung, do vat, linh tinh
    for f in FX:
        add_tex('fx.' + f, f)
    for f in MISC:
        add_tex('misc.' + f, f)
    im = load('lootsprites')
    if im is None:
        missing.append('lootsprites')
    else:
        add('items', im, grid_frames(im.width, im.height))

    # --- xep va ghi ra
    place, pages = pack(items)
    canv = []
    for p in pages:
        w = min(MAXP, max(16, 1 << (p['w'] - 1).bit_length()))
        h = min(MAXP, max(16, 1 << (p['h'] - 1).bit_length()))
        canv.append(Image.new('RGBA', (w, h), (0, 0, 0, 0)))
    sprites = {}
    for key, img, frames in items:
        pi, px, py = place[key]
        canv[pi].paste(img, (px, py))
        sprites[key] = {'p': pi,
                        'f': [[px + f[0], py + f[1], f[2], f[3]] for f in frames]}

    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    names = []
    for i, im in enumerate(canv):
        n = 'atlas%d.png' % i
        im.save(os.path.join(OUT, n), optimize=True)
        names.append(n)
    blob = json.dumps({'pages': names, 'tile': 16, 'sprites': sprites},
                      separators=(',', ':'))
    # Ghi ra file .JS chu khong phai .json: trinh duyet chan doc file cuc bo
    # qua fetch/XHR khi mo bang file://, nen ban do atlas phai vao bang the
    # <script>. Day la dung luat cua repo (xem data/games.js).
    io.open(os.path.join(OUT, 'atlas-data.js'), 'w', encoding='utf-8').write(
        u'window.DC_ATLAS=' + blob + u';\n')

    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in names)
    print('trang: %d  %s' % (len(names), [im.size for im in canv]))
    print('khoa : %d' % len(sprites))
    print('to mau: %d loai (%s)' % (len(GM_USED), ', '.join(sorted(GM_USED))))
    print('nang : %.2f MB png + %.0f KB json'
          % (total / 1048576.0,
             os.path.getsize(os.path.join(OUT, 'atlas-data.js')) / 1024.0))
    if missing:
        u = sorted(set(missing))
        print('THIEU (%d): %s' % (len(u), ', '.join(u[:40])))


main()
