# -*- coding: utf-8 -*-
"""Rút sprite 2D (người chơi, NPC, Pokémon, vật phẩm, nền trận, hạt VFX, logo) cho PokéOne
thẳng từ bundle UnityFS trong bản cài. Chạy lại bao nhiêu lần cũng ra cùng kết quả (ghi đè).

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_2d.py             # tất cả
    python games/pokeone/tools/rip_2d.py player       # chỉ lớp người chơi
    python games/pokeone/tools/rip_2d.py npc          # tấm liên hệ NPC + tập curated
    python games/pokeone/tools/rip_2d.py poke         # sprite Pokémon 2D
    python games/pokeone/tools/rip_2d.py item         # icon vật phẩm
    python games/pokeone/tools/rip_2d.py battle       # nền trận + hạt VFX + logo

Biến môi trường: POKEONE_DATA (thư mục PokeOne_Data), xem README-2d.md để biết chi tiết
bố cục lưới sprite, ý nghĩa tên tệp và cách chọn tập NPC/clothes/hats.
"""
import io, json, os, re, sys

import UnityPy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art')
DATA = os.path.join(GAME, 'data')

PDATA = os.environ.get('POKEONE_DATA', r'D:\pokeone-ref\extract\app\files\PokeOne_Data')
SA = os.path.join(PDATA, 'StreamingAssets')
CATALOG = r'D:\pokeone-ref\catalog\npc'

DEX_MAX = 251

_bundle_cache = {}


def load_bundle(name):
    if name not in _bundle_cache:
        _bundle_cache[name] = UnityPy.load(os.path.join(SA, name))
    return _bundle_cache[name]


def load_shared(name):
    if name not in _bundle_cache:
        _bundle_cache[name] = UnityPy.load(os.path.join(PDATA, name))
    return _bundle_cache[name]


def ensure_dir(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def save_texture(data_obj, out_path):
    ensure_dir(out_path)
    img = data_obj.image
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    img.save(out_path)
    return img


# ------------------------------------------------------------------ PLAYER
PLAYER_GROUPS = [
    'body_male', 'body_female', 'clothe_male', 'clothe_female',
    'hair_male', 'hair_female', 'hats', 'mounts',
]


# body_*/clothe_*/hair_*/hats co 4 tep pose (_1/_2/_4/_5, khong co _3) cho MOI ma; ARCH.md
# muon P1.PLAYER_PARTS chi liet ke ma goc khong dinh pose (vd '00_00', khong phai '00_00_1')
# vi ma game tu ghep hau to pose luc chay. 'mounts' KHONG theo quy uoc nay (so '_1' o day la
# bien the rieng chu khong phai 1-trong-4-pose, vd co ca '02.png' lan '02_1.png' song song)
# nen giu nguyen ten tho, khong bo hau to.
POSE_SUFFIX_GROUPS = {
    'body_male', 'body_female', 'clothe_male', 'clothe_female',
    'hair_male', 'hair_female', 'hats',
}
POSE_SUFFIXES = ('_1', '_2', '_4', '_5')


def rip_player():
    env = load_bundle('sdata')
    cont = env.container
    parts = {g: set() for g in PLAYER_GROUPS}
    n = 0
    for path, obj in cont.items():
        m = re.match(r'assets/assetbundles/sprites/player/([a-z_]+)/([^/]+)\.png$', path)
        if not m:
            continue
        group, name = m.group(1), m.group(2)
        if group not in parts:
            continue
        if name.endswith('_'):
            # [BAY DA SAP] 'hats/152_1_.png' la ban sao thua, ten go nham gach duoi cuoi
            # trong chinh bundle goc (pixel giong het 'hats/152_1.png', da doi chieu bang
            # ImageChops.difference == None) -> bo qua, khong xuat, khong dua vao PLAYER_PARTS.
            print('  .. bo qua ten thua trong bundle goc:', path)
            continue
        data = obj.read()
        out = os.path.join(ART, 'sprite', 'player', group, name + '.png')
        save_texture(data, out)
        if group in POSE_SUFFIX_GROUPS:
            base = name
            for suf in POSE_SUFFIXES:
                if base.endswith(suf):
                    base = base[:-len(suf)]
                    break
            parts[group].add(base)
        else:
            parts[group].add(name)
        n += 1
    parts = {g: sorted(v) for g, v in parts.items()}
    print('player: exported', n, 'files across', len(PLAYER_GROUPS), 'groups')
    return parts


# ------------------------------------------------------------------ NPC
# Vai trò chọn tay sau khi xem tấm liên hệ D:\pokeone-ref\catalog\npc\contact_sheet_*.png
# (520 tấm, đã xem đủ cả 6 tấm liên hệ + phóng to 27 ứng viên trong npc_zoom_candidates.png).
# Chỉ đặt tên vai trò khi hình rõ ràng đúng vai đó; NPC không đoán vai để trong generic_N.
# PokéOne là game gốc riêng (không phải remake Kanto game-boy), nên không có sprite nào là
# đúng "Gary"/"Oak" nguyên bản — các vai đặt tên dưới đây là NPC có TRANG PHỤC đúng mô-típ vai
# đó (áo khoác phòng thí nghiệm cho scientist/oak, mũ phượt cho hiker...), không phải nhận diện
# nhân vật. Không tìm thấy NPC nào rõ ràng là y tá (đầm trắng có chữ thập đỏ) hay cảnh sát
# (đồng phục xanh) trong cả 520 tấm — bỏ trống 'nurse' và 'officer_jenny' thay vì đoán bừa.
NPC_ROLES = {
    'oak': 'sprite350',          # ông già tóc bạc, áo khoác xám kiểu giáo sư
    'scientist': 'sprite344',    # hói đầu, áo khoác trắng phòng thí nghiệm
    'hiker': 'sprite173',        # mũ phớt nâu, áo khoác leo núi
    'old_man': 'sprite8',        # ông già kính, áo len xanh
    'granny': 'sprite9',         # bà già tóc hồng bạc, đầm xanh
    'youngster': 'sprite27',     # trai tóc gai cam, quần short
    'lass': 'sprite236',         # gái tóc đuôi ngựa đen, đầm xanh
    # generic_N: khách qua đường Kanto bình thường (bỏ hết trang phục hoá trang lễ hội:
    # xác ướp/ma cà rồng/phù thuỷ v.v. không hợp bối cảnh sớm game).
    'generic_1': 'sprite2', 'generic_2': 'sprite3', 'generic_3': 'sprite4',
    'generic_4': 'sprite5', 'generic_5': 'sprite6', 'generic_6': 'sprite7',
    'generic_7': 'sprite13', 'generic_8': 'sprite14', 'generic_9': 'sprite17',
    'generic_10': 'sprite18', 'generic_11': 'sprite23', 'generic_12': 'sprite24',
    'generic_13': 'sprite25', 'generic_14': 'sprite26', 'generic_15': 'sprite31',
    'generic_16': 'sprite33', 'generic_17': 'sprite34', 'generic_18': 'sprite36',
    'generic_19': 'sprite37', 'generic_20': 'sprite38', 'generic_21': 'sprite40',
    'generic_22': 'sprite73', 'generic_23': 'sprite74', 'generic_24': 'sprite75',
    'generic_25': 'sprite76', 'generic_26': 'sprite77', 'generic_27': 'sprite110',
    'generic_28': 'sprite104', 'generic_29': 'sprite105', 'generic_30': 'sprite106',
    'generic_31': 'sprite107', 'generic_32': 'sprite151', 'generic_33': 'sprite152',
    'generic_34': 'sprite153', 'generic_35': 'sprite154', 'generic_36': 'sprite191',
    'generic_37': 'sprite193', 'generic_38': 'sprite230', 'generic_39': 'sprite257',
    'generic_40': 'sprite262', 'generic_41': 'sprite271', 'generic_42': 'sprite301',
    'generic_43': 'sprite371', 'generic_44': 'sprite441',
}


def _npc_grid_cells(img):
    cells = []
    for r in range(4):
        row = []
        for c in range(4):
            row.append(img.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64)))
        cells.append(row)
    return cells


def build_npc_catalog():
    env = load_bundle('sdata')
    cont = env.container
    ids = []
    for path in cont:
        m = re.match(r'assets/assetbundles/sprites/npc/sprite(\d+)\.png$', path)
        if m:
            ids.append(int(m.group(1)))
    ids.sort()
    os.makedirs(CATALOG, exist_ok=True)

    # tấm liên hệ: khung mặt (hàng 2, cột 1 = đứng yên nhìn xuống) + số, chia nhiều tệp
    per_sheet = 100
    cols = 10
    cell = 72  # 64px ảnh + viền
    label_h = 14
    sheet_paths = []
    for start in range(0, len(ids), per_sheet):
        chunk = ids[start:start + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        canvas = Image.new('RGBA', (cols * cell, rows * (cell + label_h)), (24, 24, 24, 255))
        draw = ImageDraw.Draw(canvas)
        for i, npc_id in enumerate(chunk):
            path = f'assets/assetbundles/sprites/npc/sprite{npc_id}.png'
            obj = cont[path]
            data = obj.read()
            img = data.image.convert('RGBA')
            face = _npc_grid_cells(img)[2][1]  # hàng2=mặt, cột1=khung đứng yên
            face = face.resize((64, 64), Image.NEAREST)
            r, c = divmod(i, cols)
            x, y = c * cell + 4, r * (cell + label_h) + 4
            canvas.paste(face, (x, y), face)
            draw.text((x, y + 64), str(npc_id), fill=(255, 255, 0, 255))
        sheet_path = os.path.join(CATALOG, f'contact_sheet_{start + 1:04d}-{start + len(chunk):04d}.png')
        canvas.save(sheet_path)
        sheet_paths.append(sheet_path)
    print('npc catalog:', len(ids), 'sprite, ', len(sheet_paths), 'tam lien he ->', CATALOG)
    return ids, sheet_paths


def rip_npc_curated():
    """Xuất bộ NPC đã chọn tay (NPC_ROLES) ra art/sprite/npc/. Gọi sau khi đã xem catalog
    và điền NPC_ROLES bằng tay ở trên."""
    env = load_bundle('sdata')
    cont = env.container
    names = set(NPC_ROLES.values())
    n = 0
    out_dir = os.path.join(ART, 'sprite', 'npc')
    for name in sorted(names):
        path = f'assets/assetbundles/sprites/npc/{name}.png'
        if path not in cont:
            print('  !! thieu', path)
            continue
        data = cont[path].read()
        out = os.path.join(out_dir, name + '.png')
        save_texture(data, out)
        n += 1
    print('npc: exported', n, 'sprite curated ->', out_dir)
    return NPC_ROLES


# ------------------------------------------------------------------ POKEMON 2D
FOLLOW_ROSTER = list(range(1, 23)) + [25, 26, 52, 53, 56, 57, 74, 75, 95] + list(range(161, 169))


def rip_pokemon():
    env = load_bundle('psdata')
    cont = env.container
    counts = {'big': 0, 'small64': 0, 'small64shiny': 0, 'follow': 0, 'follows': 0}
    for dex in range(1, DEX_MAX + 1):
        for kind in ('big', 'small64', 'small64shiny'):
            path = f'assets/assetbundles/pokemonsprites/{kind}/{dex}.png'
            if path not in cont:
                print('  !! thieu', path)
                continue
            data = cont[path].read()
            out = os.path.join(ART, 'sprite', 'poke', kind, f'{dex}.png')
            save_texture(data, out)
            counts[kind] += 1
    for dex in FOLLOW_ROSTER:
        p_follow = f'assets/assetbundles/pokemonsprites/follow/{dex:03d}.png'
        p_follows = f'assets/assetbundles/pokemonsprites/follows/{dex:03d}s.png'
        if p_follow in cont:
            data = cont[p_follow].read()
            save_texture(data, os.path.join(ART, 'sprite', 'poke', 'follow', f'{dex}.png'))
            counts['follow'] += 1
        else:
            print('  !! thieu', p_follow)
        if p_follows in cont:
            data = cont[p_follows].read()
            save_texture(data, os.path.join(ART, 'sprite', 'poke', 'follows', f'{dex}.png'))
            counts['follows'] += 1
        else:
            print('  !! thieu', p_follows)
    print('pokemon 2d:', counts)
    return counts


# ------------------------------------------------------------------ ITEMS
def rip_items():
    env = load_bundle('idata')
    cont = env.container
    n = 0
    for path, obj in cont.items():
        m = re.match(r'assets/assetbundles/items/(\d+)\.png$', path)
        if not m:
            continue
        data = obj.read()
        out = os.path.join(ART, 'item', m.group(1) + '.png')
        save_texture(data, out)
        n += 1
    print('items:', n, 'icon')
    return n


# ------------------------------------------------------------------ BATTLE BG + FX + LOGO
BATTLE_EXACT = {
    'Arena', 'ArenaEdges', 'PokemonBG', 'background02', 'Shadow', 'shadow',
    'pokeballload', 'poke_pattern',
}
BATTLE_PREFIX = ('btl_G_', 'weather')

FX_SUBSTR = (
    'CFX', 'Circle_Aura_20', 'Star_09', 'Sparkle', 'foudre', 'Explosion',
    'ConfettiGlitter_4x4', 'Streamers', 'SmallRocks', 'SingleSmoke',
    'GlowStar', 'WhiteCircleSmall',
)


def _export_named_textures(env, match_fn, out_dir):
    seen = {}
    n = 0
    for obj in env.objects:
        if obj.type.name != 'Texture2D':
            continue
        data = obj.read()
        name = data.m_Name
        if not match_fn(name):
            continue
        seen[name] = seen.get(name, 0) + 1
        fname = name if seen[name] == 1 else f'{name}_{seen[name]}'
        out = os.path.join(out_dir, fname + '.png')
        save_texture(data, out)
        n += 1
    return n


def rip_battle_and_fx():
    env2 = load_shared('sharedassets2.assets')

    def is_battle(name):
        if name in BATTLE_EXACT:
            return True
        return name.startswith(BATTLE_PREFIX)

    def is_fx(name):
        return any(s.lower() in name.lower() for s in FX_SUBSTR)

    n_battle = _export_named_textures(env2, is_battle, os.path.join(ART, 'battle'))
    n_fx = _export_named_textures(env2, is_fx, os.path.join(ART, 'fx'))

    # 'Sparkle' nam trong sharedassets1, khong phai sharedassets2 nhu du kien ban dau.
    env1 = load_shared('sharedassets1.assets')
    n_fx += _export_named_textures(env1, lambda n: n == 'Sparkle', os.path.join(ART, 'fx'))

    n_logo = _export_named_textures(env1, lambda n: n == 'logo', os.path.join(ART, 'ui'))
    print('battle bg:', n_battle, ' fx:', n_fx, ' logo:', n_logo)
    return n_battle, n_fx, n_logo


def write_sprites_js(parts, npc_roles):
    ensure_dir(os.path.join(DATA, 'sprites.js'))
    with io.open(os.path.join(DATA, 'sprites.js'), 'w', encoding='utf-8') as f:
        f.write('// Tu dong sinh boi tools/rip_2d.py. Dung sua tay.\n')
        f.write('window.P1 = window.P1 || {};\n')
        f.write('P1.PLAYER_PARTS = ' + json.dumps(parts, ensure_ascii=False, indent=2) + ';\n')
        f.write('P1.NPC_SPRITES = ' + json.dumps(npc_roles, ensure_ascii=False, indent=2) + ';\n')
        f.write('P1.FOLLOW_ROSTER = ' + json.dumps(FOLLOW_ROSTER) + ';\n')
    print('wrote', os.path.join(DATA, 'sprites.js'))


def scan_existing_parts():
    """Chi chay mot phan (vd 'npc') thi lay lai PLAYER_PARTS tu ten tep da co san tren dia,
    khong ghi de mat cac nhom khac (moi lan chay chi biet nhom minh vua lam)."""
    parts = {g: [] for g in PLAYER_GROUPS}
    for g in PLAYER_GROUPS:
        d = os.path.join(ART, 'sprite', 'player', g)
        if not os.path.isdir(d):
            continue
        names = set()
        for fn in os.listdir(d):
            if not fn.endswith('.png'):
                continue
            name = fn[:-4]
            if g in POSE_SUFFIX_GROUPS:
                for suf in POSE_SUFFIXES:
                    if name.endswith(suf):
                        name = name[:-len(suf)]
                        break
            names.add(name)
        parts[g] = sorted(names)
    return parts


def main():
    args = sys.argv[1:] or ['all']
    if 'all' in args or 'player' in args:
        parts = rip_player()
    else:
        parts = scan_existing_parts()
    if 'all' in args or 'npc' in args:
        build_npc_catalog()
        npc_roles = rip_npc_curated()
    else:
        npc_roles = dict(NPC_ROLES)
    if 'all' in args or 'poke' in args:
        rip_pokemon()
    if 'all' in args or 'item' in args:
        rip_items()
    if 'all' in args or 'battle' in args:
        rip_battle_and_fx()
    write_sprites_js(parts, npc_roles)


if __name__ == '__main__':
    main()
