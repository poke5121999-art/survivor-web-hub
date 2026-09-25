# -*- coding: utf-8 -*-
"""Rút art + anim + VFX + tiếng cho Hố Xanh thẳng từ bản cài Steam của Dave the Diver.

Chạy lại bao nhiêu lần cũng ra cùng một bộ tệp (xoá rồi ghi lại art/, audio/, data/assets.js).
    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip.py            # tất cả
    python games/ho-xanh/tools/rip.py art        # chỉ ảnh + Spine
    python games/ho-xanh/tools/rip.py audio      # chỉ tiếng lặn (không đụng boat_*, gun_*, bar_*)
    python games/ho-xanh/tools/rip.py dave       # chỉ sheet Dave + mục dave của assets.js
    python games/ho-xanh/tools/rip.py fxmesh     # lưới 3D + số phụ cho hạt súng -> art/gear/mesh/gunvfx.json
    python games/ho-xanh/tools/rip.py divefx     # hạt của Dave (bọt bơi, thở, dao, mũi xiên) + máu cá -> art/fx/dive/
Biến môi trường: DTD_DATA (thư mục DaveTheDiver_Data).

Cách game đóng gói (đo 2026-09-24, bản Steam có DLC Jungle):
- 3.967 bundle Addressables tên băm ở StreamingAssets/aa/StandaloneWindows64, KHÔNG mã hoá.
  Tên asset gốc nằm trong m_Container của object AssetBundle mỗi bundle, nên lần đầu chạy
  quét hết một lượt (~4 phút) rồi đệm bảng path -> bundle ở %TEMP%/ho-xanh-rip/.
- Cá là Spine 4.0.37 (skel nhị phân + atlas + png). Cá mập, cá ngừ lớn là mô hình 3D, bỏ.
- Dave là sprite pixel 120x120, pivot giữa, 100 px/đơn vị, gói chung một SpriteAtlas 788 khung.
  Tay cầm súng lao là một lớp riêng (…Arms / …RightArm) để xoay theo hướng ngắm.
- Tiếng là AudioClip FSB5 trong bundle, UnityPy giải được. Thư mục SyncHashed chỉ chứa một
  phần (tên = sha256 tên clip), không cần dùng.
- Bảng số gốc của cá: GameDataSheet/DR_GameData_Fish.json, các khối nối bằng "@/".
"""
import io, json, os, re, shutil, subprocess, sys, tempfile

import UnityPy
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art')
AUD = os.path.join(GAME, 'audio')
DATA = os.path.join(GAME, 'data')
DTD = os.environ.get('DTD_DATA', r'D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data')
BUNDLES = os.path.join(DTD, 'StreamingAssets', 'aa', 'StandaloneWindows64')
CACHE = os.path.join(tempfile.gettempdir(), 'ho-xanh-rip')

PC = 'Assets/Contents/PlayContents/'

# ---------------------------------------------------------------- PICKS
# TID trong DR_GameData_Fish -> cá. Chỉ loài vẽ bằng Spine (loài 3D không có skel).
# Vùng A = nước nông Hố Xanh, B = tầng giữa, C = đáy sâu (130-250m). Bỏ tôm hùm (HP 999,
# bắt bằng tay) và bản "đêm"/"hung" trùng skel với bản thường (kiểm bằng tên trùng + cùng
# thư mục Spine, ví dụ TID 2010053/2010051/2010052/2010126 trùng 2010027/2010029/2010031/2010121).
#
# Vùng C [ĐO 2026-09-24]: nhiều loài mốc "C" chỉ có mô hình 3D (FBX, không có .skel) — Frilled_Shark,
# BluespottedStargazer, Rhinochimaeridae, Megamouth_Shark, Cookiecutter_Shark — bỏ. Hai loài
# ElephantFish và Salmon_Snailfish có thư mục Spine/ nhưng skeleton xuất dạng .json văn bản
# (Spine JSON), không phải .skel nhị phân — rip_spine() và spine-threejs runtime của game này chỉ
# đọc SkeletonBinary nên bỏ (muốn thêm phải viết loader SkeletonJson riêng). TID 2010206 Viperfish
# có đủ .skel/.atlas/.png nhưng KHÔNG có dòng nào trong FishInfoData (asset mồ côi, không rõ
# HP/damage) — bỏ. Norway_Lobster/Eastern_Rock_Lobster (2010240/2010241) HP 999, bắt tay — bỏ như
# tôm hùm vùng khác. Great_Spider_Crab (2010208) HP=1 nhưng FishCollectionNotAvailable=False (vẫn
# bắt được bằng xiên, không phải lỗi dữ liệu) — giữ.
FISH_TIDS = [
    2010002, 2010003, 2010004, 2010005, 2010006, 2010007, 2010008, 2010009, 2010010, 2010011,
    2010012, 2010013, 2010014, 2010015, 2010016, 2010017, 2010018, 2010019, 2010020, 2010021,
    2010023, 2010027, 2010029, 2010031, 2010060, 2010064, 2010065, 2010066, 2010070,
    2010071, 2010078, 2010079, 2010080,
    2010101, 2010102, 2010103, 2010105, 2010106, 2010107, 2010108, 2010109, 2010110, 2010111,
    2010112, 2010113, 2010114, 2010115, 2010116, 2010117, 2010121, 2010122, 2010129, 2010136,
    2010137, 2010138,
    2010201, 2010202, 2010208, 2010212, 2010214, 2010217, 2010218, 2010219, 2010220, 2010222,
]
# Dãy khung của Dave: tiền tố tên sprite -> khung/giây. Số fps đọc từ AnimationClip gốc
# (m_SampleRate): Idle 6, Move* 9, B_Move* 9, HookAttackReady 10, HookAttackFire 15,
# HookAttackPull 9, Die 9, ShortDash 24 trải 8 khoá trên 5 hình (≈ 7 hình/giây thực).
DAVE = {
    'Idle': 6, 'Wait': 6, 'Look': 6, 'Gasping': 6, 'idle_scared': 6, 'Relief': 6, 'Cheer': 6,
    'MoveSide': 9, 'MoveSideUp': 9, 'MoveSideDown': 9, 'MoveUp': 9, 'MoveDown': 9,
    'BMoveSide': 9, 'BMoveSideUp': 9, 'BMoveSideDown': 9, 'BMoveUp': 9, 'BMoveDown': 9, 'BIdle': 6,
    'ShortDashSide': 12, 'ShortDashSideUp': 12, 'ShortDashSideDown': 12, 'ShortDashUp': 12, 'ShortDashDown': 12,
    'AttackReady': 10, 'AttackReadyArms': 1, 'AttackReadyRightArm': 1,
    'AttackFire': 15, 'AttackPull': 9, 'AttackPullArms': 1, 'AttackPullRightArm': 1,
    'HookAttackReady': 10, 'HookAttackFire': 15, 'HookAttackPull': 9, 'HookAttackArm': 1,
    'MeleeAtk': 15, 'MeleeDagger': 12, 'MeleeDaggerAtk': 15, 'dagger_raise': 10, 'dagger_stab': 15,
    'Hit': 30, 'Bigdamage': 12, 'Die': 9, 'Shock': 12, 'Scared': 8, 'BigSurprise': 10, 'PickUp': 10,
    'G_MoveSide': 9, 'G_MoveUp': 9, 'G_MoveDown': 9, 'GIdle': 6,
    # thêm sau (thêm vào cuối để các hàng cũ giữ nguyên chỗ):
    #   RangeWeaponDraw rút súng qua Prepare01; RangeWeaponHook (giằng co, FightBlendTree ×2) là AttackFight01..08;
    #   RangeWeaponMiss xiên trượt: thân AttackFail01 + tay AttackFailArms/AttackFailRightArm;
    #   RangeWeaponShock bị giật: tay ShockArms/ShockRightArm; RangeWeaponFire_Move bắn khi đang bơi: thân UVLight_Move01..08.
    'Prepare': 10, 'AttackFight': 27, 'AttackFail': 10, 'AttackFailArms': 1, 'AttackFailRightArm': 1,
    'ShockArms': 1, 'ShockRightArm': 1, 'UVLight_Move': 6,
    # Xả thịt cá lớn (state Tanning của PlayerAnimCtrl, trigger Carving), xong thì TanningAfter; túi đầy thì Overloaded.
    'Tanning': 8, 'TanningAfter': 8, 'Overloaded': 6,
}
# Súng xiên cầm tay theo cấp súng xiên trong bảng SubEquipment (icon iDiver_Icon_<X>HarpoonGun ↔ prefab <X>HarpoonGunTemplate).
HARPOON_GUNS = ['OldHarpoonGun', 'HarpoonGun', 'PumpHarpoonGun', 'MermanHarpoonGun', 'NewMVHarpoonGun', 'AlloyHarpoonGun']
HARPOON_DIR = PC + 'Ingame/00_InGame_Common/Prefabs/InstanceItem/'
DAVE_ATLAS = PC + 'Common/Sprites/Player/Atlas/01_Default_Atlas.spriteatlas'

# Ảnh lẻ: đường dẫn gốc -> tên ra (trong art/). Hình trong một SpriteAtlas thì lấy qua Sprite.
# San hô, rong, thạch nhũ không còn rút lẻ: tools/level.py đưa chúng vào glb theo đúng chỗ bản gốc đặt.
IMAGES = {}
IMAGES[PC + 'Ingame/00_InGame_Common/Sprites/InstanceItem_P/Harpoon/HarpoonProjectile.png'] = 'fx/HarpoonProjectile.png'
IMAGES[PC + 'Common/Material/Player/Texture/CFXM4_T_BubbleSubtle-A8.tga'] = 'fx/BubbleSubtle.png'
for n in ['UI_O2_Frame_New', 'UI_Catch_New', 'UI_Warning_Mark', 'Gauge_Bar_Line', 'Gauge_Bar_Normal',
          'Gauge_Bar_Tap', 'UI_QTE_Success', 'UI_QTE_BarFrame_Fail01', 'Depressurization_Vignetting',
          'UI_elite_Mark01']:
    IMAGES[PC + 'Ingame/00_InGame_Common/Sprites/_Separated/%s.png' % n] = 'ui/%s.png' % n
for n in ['Target_Arrow', 'Target_ArrowGun', 'Target_ArrowGun_E', 'Target_CurveStart']:
    IMAGES[PC + 'Common/Sprites/Player/Range/%s.png' % n] = 'ui/%s.png' % n
# Prefab có SpriteRenderer: lấy mọi sprite trong cây (rương O2 là hai mảnh thân + nắp).
# EscapePod = thân khoang thoát hiểm (Pod_ex, tĩnh). EscapePodZone = biểu tượng bộ đàm gọi khoang
# (Icon_Radios01, tĩnh — AnimationClip EscapePod_Radios_Idle không có m_PPtrCurves nên không phải
# hoạt ảnh đổi khung hình, chỉ là property animation lặng lẽ pulse; game gốc vẽ vòng sáng quanh nó
# bằng ParticleSystem 3D, không xuất được kiểu sprite nên bỏ, dùng lại VFX glow có sẵn (LightCircle…)).
PREFAB_SPRITES = [
    PC + 'Ingame/00_InGame_Common/Prefabs/Interaction/Chest_O2.prefab',
    PC + 'Ingame/00_InGame_Common/Prefabs/Interaction/EscapePod.prefab',
    PC + 'Ingame/00_InGame_Common/Prefabs/Interaction/EscapePodZone.prefab',
]
# VFX: tên tệp gốc (tìm theo tên, vì thư mục VFX có nhiều tầng con).
VFX = ['E_Bubble_01A', 'E_Bubble_01B', 'E_Bubble_03A', 'E_Seq_Bubble_01A', 'E_Seq_Bubble_02A', 'E_Seq_Bubble_03A',
       'E_Ray_01A', 'E_Ray_01C', 'E_Ray_03A', 'E_Rays_01A', 'E_LightBeam_01A', 'LightBeam', 'E_Noise_Caustic_01A',
       'BloodCloud', 'E_Mask_Blood_01A', 'E_Hit_D_01A', 'E_Glow_01A', 'E_Glow_01B', 'E_Dust_01A',
       'E_Lightdust_01A', 'WaterFog', 'L001_Background_light', 'HeadLight', 'E_Splash_01A', 'E_Seq_Spark_01A',
       'E_Spark_01A', 'E_Water_Splash_01A', 'E_Seq_Water_Splash_01B', 'PointLightFX', 'LightCircle', 'E_Glow_04A']
# Spine phi cá (rong, san hô động).
# key -> tên AudioClip gốc (tìm theo tên tệp .wav trong catalog), và mức: sfx | loop | music.
# Bảng này từng bị xoá nhầm ở 441c391 (rip_audio vẫn gọi AUDIO). Chép lại y bản 2e5d9f2 đã sinh ra audio/.
# audio/ giờ dùng chung với rip_boat.py (boat_*, gun_*, ui_*) và rip_bar.py (bar_*): chỉ ghi đè tệp của bảng này.
AUDIO = {
    'bgm_ingame': ('BGM_InGame', 'music'),
    'bgm_seablue': ('BGM_SeaBlue_01', 'music'),
    'bgm_deep': ('BGM_Deep_Sea', 'music'),
    'bgm_night': ('BGM_Night_Diving', 'music'),
    'bgm_shark': ('BGM_Shark_Appear', 'music'),
    'amb_deep': ('amb_deepsea_loop', 'loop'),
    'harpoon_aim': ('harpoon_aim', 'sfx'),
    'harpoon_shot': ('harpoon_shot', 'sfx'),
    'harpoon_hit': ('harpoon_hit', 'sfx'),
    'harpoon_hit_rock': ('harpoon_hit_rock', 'sfx'),
    'harpoon_return': ('harpoon_return', 'sfx'),
    'harpoon_pull': ('harpoon_line_pull_loop', 'loop'),
    'harpoon_catch': ('harpoon_catch_success', 'sfx'),
    'harpoon_tap': ('harpoon_tap_button', 'sfx'),
    'dave_diving': ('dave_diving', 'sfx'),
    'dave_breathe': ('dave_breathe', 'sfx'),
    'dave_hit1': ('dave_hit_01', 'sfx'),
    'dave_hit2': ('dave_hit_02', 'sfx'),
    'dave_hit3': ('dave_hit_03', 'sfx'),
    'dave_dead': ('dave_dead_01', 'sfx'),
    'dave_swim': ('sound_Dave_Swim_01', 'sfx'),
    'dave_dash': ('sound_dave_dash_02', 'sfx'),
    'dave_grab': ('sound_DaveGrab_01', 'sfx'),
    'melee_hit': ('sound_hit_melee', 'sfx'),
    'knife': ('sound_weapon_shortsword', 'sfx'),
    'o2_use': ('sound_o2_capsule_use', 'sfx'),
    'o2_expand': ('sound_o2_tank_expansion', 'sfx'),
    'itembox': ('sound_gain_itembox_02', 'sfx'),
    'qte_raise': ('sound_QTE_raised_01', 'sfx'),
    'qte_success': ('sound_QTE_success_01', 'sfx'),
    'qte_perfect': ('sound_QTE_Perfect_success_01', 'sfx'),
    'qte_fail': ('sound_QTE_fail_01', 'sfx'),
    'qte_stab': ('sound_QTE_stab_01', 'sfx'),
    'bubble_seahorse': ('Seahorse_Bubble_01', 'sfx'),
    'carving': ('sound_cuting', 'sfx'),  # SFX_SoundData "Carving" (lặp suốt lúc xả thịt)
}

# ---------------------------------------------------------------- INDEX
def bundle_index():
    """{'path': path gốc -> bundle, 'cab': tên CAB -> bundle}. Đệm ở CACHE, xoá tệp để quét lại."""
    p = os.path.join(CACHE, 'bundle_index.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    os.makedirs(CACHE, exist_ok=True)
    paths, cabs = {}, {}
    names = sorted(os.listdir(BUNDLES))
    for n, f in enumerate(names):
        env = UnityPy.load(os.path.join(BUNDLES, f))
        for cab in env.files[next(iter(env.files))].files:
            cabs[cab.lower()] = f
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for k, _ in o.read().m_Container:
                    paths.setdefault(k, f)
                break
        if n % 500 == 0:
            print('  quét bundle %d/%d' % (n, len(names)), flush=True)
    out = {'path': paths, 'cab': cabs}
    json.dump(out, open(p, 'w', encoding='utf-8'))
    return out


IDX = None
CABS = None
_ENVS = {}


def env_of(bundle, deps=()):
    key = (bundle,) + tuple(sorted(deps))
    if key not in _ENVS:
        _ENVS[key] = UnityPy.load(*[os.path.join(BUNDLES, b) for b in key])
    return _ENVS[key]


def with_deps(bundle, read):
    """Chạy read(env); gặp PPtr trỏ sang CAB của bundle khác thì nạp thêm bundle đó rồi chạy lại."""
    deps = set()
    while True:
        try:
            return read(env_of(bundle, deps))
        except FileNotFoundError as e:
            cab = re.search(r'(cab-[0-9a-f]+)', str(e), re.I).group(1).lower()
            if cab not in CABS or CABS[cab] in deps:
                raise
            deps.add(CABS[cab])


def objects_for(path, read=lambda o: o):
    """read(o) cho mọi object mà m_Container gắn với path (một png có cả Texture2D lẫn Sprite)."""
    bundle = IDX.get(path)
    if not bundle:
        raise KeyError('không có trong bundle nào: ' + path)

    def go(env):
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                return [read(ptr.asset.deref_parse_as_object()) for k, ptr in o.read().m_Container if k == path]
        return []
    return with_deps(bundle, go)


def find_path(basename):
    hits = [k for k in IDX if os.path.basename(k) == basename]
    if not hits:
        raise KeyError('không thấy tệp ' + basename)
    return sorted(hits, key=len)[0]


def text_bytes(ta):
    s = ta.m_Script
    return s if isinstance(s, bytes) else s.encode('utf-8', 'surrogateescape')


def save_png(img, rel):
    p = os.path.join(ART, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    return img.size


def image_of(path):
    def pick(o):
        return o.image.convert('RGBA') if type(o).__name__ in ('Sprite', 'Texture2D') else None
    imgs = objects_for(path, lambda o: (type(o).__name__, pick(o)))
    spr = [i for t, i in imgs if t == 'Sprite']
    tex = [i for t, i in imgs if t == 'Texture2D']
    return (spr or tex)[0]


# ---------------------------------------------------------------- SPINE
def rip_spine(folder_path, stem, outdir):
    """Chép skel + atlas + các trang png của một bộ Spine. Trả về dict mô tả."""
    skel = folder_path + stem + '.skel.bytes'
    atlas = folder_path + stem + '.atlas.txt'
    sk = [o for o in objects_for(skel) if type(o).__name__ == 'TextAsset'][0]
    at = [o for o in objects_for(atlas) if type(o).__name__ == 'TextAsset'][0]
    atext = text_bytes(at).decode('utf-8').replace('\r\n', '\n')
    pages = [ln.strip() for i, ln in enumerate(atext.split('\n'))
             if ln.strip().endswith('.png') and (i == 0 or atext.split('\n')[i - 1].strip() == '')]
    # Hình pixel: lấy mẫu gần nhất cho khỏi nhoè khi phóng to.
    atext = re.sub(r'(?m)^filter:.*$', 'filter:Nearest,Nearest', atext)
    os.makedirs(os.path.join(ART, outdir), exist_ok=True)
    open(os.path.join(ART, outdir, stem + '.skel'), 'wb').write(text_bytes(sk))
    open(os.path.join(ART, outdir, stem + '.atlas'), 'w', encoding='utf-8', newline='\n').write(atext)
    pma = False
    for pg in pages:
        img = image_of(folder_path + pg)
        px = img.getdata()
        pma = pma or not any(r > a or g > a or b > a for r, g, b, a in px)
        save_png(img, outdir + '/' + pg)
    return {'skel': outdir + '/' + stem + '.skel', 'atlas': outdir + '/' + stem + '.atlas', 'pages': pages, 'pma': pma}


def rip_spine_env():
    """Rong Spine mà bản đồ đặt (zones.js -> spines, do level.py ghi). level.py phải chạy trước."""
    src = io.open(os.path.join(DATA, 'zones.js'), encoding='utf-8').read()
    zones = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    names = sorted({sp['skel'] for z in zones.values() for sp in z.get('spines', [])})
    base = PC + 'Ingame/00_InGame_Common/Sprites/Environment_P/Seaweed_Spine/'
    return {n: rip_spine(base + n + '/', n, 'env/spine/' + n) for n in names}


def load_fish_sheet():
    path = 'Assets/AssetBundleResources/GameDataSheet/DR_GameData_Fish.json'
    ta = [o for o in objects_for(path) if type(o).__name__ == 'TextAsset'][0]
    parts = text_bytes(ta).decode('utf-8-sig').split('@/')
    secs = {parts[i].strip(): json.loads(parts[i + 1]) for i in range(0, len(parts) - 1, 2)}
    return {f['TID']: f for f in secs['FishInfoData']}


def prefab_scale(path, pick):
    """Độ phóng thế giới (trục x) của GameObject đầu tiên trong prefab thoả pick(component)."""
    sys.dont_write_bytecode = True
    import level
    import numpy as np
    env, _ = level.load_with_deps(path)
    cache = {}
    for c in level.prefab_objects(env, path):
        if pick(c):
            go = c.read().m_GameObject.read()
            v = round(float(np.linalg.norm(level.world(level.transform_of(go), cache)[:3, 0])), 3)
            return int(v) if v == int(v) else v  # 2 chứ không 2.0, cho khớp assets.js đã có
    return 1


def is_skeleton(c):
    if c.type.name != 'MonoBehaviour':
        return False
    try:
        return c.read().m_Script.read().m_ClassName in ('SkeletonMecanim', 'SkeletonAnimation')
    except Exception:
        return False


def rip_fish():
    info = load_fish_sheet()
    prefabs = {}
    for k in sorted(IDX):
        m = re.match(r'Assets/Contents/PlayContents/Fish/(A|B|C)/([^/]+)/Prefabs/SA_(\d+)_([^/]+)\.prefab$', k)
        # một TID có thể có vài prefab (bản NPC, bản đêm); ưu tiên prefab trùng tên thư mục
        if m and (int(m.group(3)) not in prefabs or m.group(4) == m.group(2)):
            prefabs[int(m.group(3))] = (m.group(1), m.group(2), k)
    out = []
    for tid in FISH_TIDS:
        f = info[tid]
        zone, folder, prefab = prefabs[tid]
        skels = [k for k in IDX if k.startswith('%sFish/%s/%s/' % (PC, zone, folder)) and k.endswith('.skel.bytes')]
        skel = sorted(skels, key=len)[0]
        stem = os.path.basename(skel)[:-len('.skel.bytes')]
        spine = rip_spine(os.path.dirname(skel) + '/', stem, 'fish/' + folder)
        # ItemIcon (…_Thumbnail) nằm gói trong atlas không có địa chỉ riêng; CardIcon có png riêng
        # nhưng là thẻ dọc gần trống với con cá bé xíu. Game tự vẽ icon từ khung swim của Spine.
        icon = None
        out.append(dict(spine, tid=tid, id=folder, name=f['FishName'].replace('_', ' '), zone=zone,
                        hp=f['HP'], damage=f['Damage'], aggressive=f['FishActiveType'] == 1,
                        size=f['FishSizeType'], cm=f['FishDimension'], rank=f['FishRank'], icon=icon,
                        scale=prefab_scale(prefab, is_skeleton)))
        print('  cá %-32s hp %4s dmg %3s ×%s %s' % (folder, f['HP'], f['Damage'], out[-1]['scale'], 'HUNG' if out[-1]['aggressive'] else ''))
    return out


# ---------------------------------------------------------------- DAVE
def sprite_canvas(s):
    """Sprite -> ảnh RGBA đúng cỡ m_Rect, phần đã cắt viền đặt lại đúng chỗ theo m_RD.textureRectOffset.
    Mọi khung Dave là ô 120x120. Phần có hình chỉ ~40x57 px, và không nằm giữa ô.
    Bản cũ căn giữa phần đã cắt: Idle01 lệch (+5; −5) px so với bản gốc, lớp tay lệch khỏi thân."""
    img = s.image.convert('RGBA')
    w, h = int(round(s.m_Rect.width)), int(round(s.m_Rect.height))
    if img.size == (w, h):
        return img
    ox, oy = s.m_RD.textureRectOffset.x, s.m_RD.textureRectOffset.y
    can = Image.new('RGBA', (w, h))
    can.paste(img, (int(round(ox)), int(round(h - oy - img.height))))  # Unity: y hướng lên, gốc ở đáy ô
    return can


def rip_dave():
    """Mỗi dãy một hàng, ô 120x120 = m_Rect gốc, khung đặt đúng chỗ như game vẽ (pivot giữa ô với thân).
    Lớp tay (…Arms, HookAttackArm) vẽ trên cùng khung 120 px với thân: đặt pivot tay đúng chỗ pivot đó
    trên ô thân là tay khớp vai. Trả về {tên: {row, n, fps, pivot}} cùng độ phóng của thân Dave và mũi xiên."""
    env = env_of(IDX[DAVE_ATLAS])
    frames = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        s = o.read()
        m = re.match(r'^(.*?)(\d+)$', s.m_Name)
        pre, num = (m.group(1).rstrip('_'), int(m.group(2))) if m else (s.m_Name, 0)
        if pre in DAVE:
            frames.setdefault(pre, []).append((num, s))
    cell = 120
    names = [n for n in DAVE if n in frames]
    cells = {}  # tên sprite -> (hàng, cột) trong sheet
    width = max(len(frames[n]) for n in names)
    sheet = Image.new('RGBA', (cell * width, cell * len(names)))
    anims = {}
    for row, n in enumerate(names):
        seq = sorted(frames[n], key=lambda t: t[0])
        for col, (_, s) in enumerate(seq):
            sheet.paste(sprite_canvas(s), (col * cell, row * cell))
            cells[s.m_Name] = (row, col)
        s0 = seq[0][1]
        anims[n] = {'row': row, 'n': len(seq), 'fps': DAVE[n],
                    'pivot': [round(s0.m_Pivot.x, 3), round(s0.m_Pivot.y, 3)]}
    missing = [n for n in DAVE if n not in frames]
    if missing:
        print('  Dave thiếu dãy:', missing)
    save_png(sheet, 'dave/dave.png')
    # thân Dave (CharacterBody) và mũi xiên trong PlayerGroup gốc đều phóng ×2
    group = PC + 'Common/Prefabs/Player/PlayerGroup.prefab'
    named = lambda n: lambda c: c.type.name == 'SpriteRenderer' and c.read().m_GameObject.read().m_Name == n
    return {'sheet': 'dave/dave.png', 'cell': cell, 'ppu': 100, 'anims': anims,
            'scale': prefab_scale(group, named('CharacterBody')), 'harpoonScale': prefab_scale(group, named('HarpoonProjectile')),
            'rig': dave_rig(group), 'clips': dave_clips(group, cells), 'harpoonGuns': harpoon_guns(),
            'spear': prefab_sprite_info(HARPOON_DIR + 'HarpoonHead/NormalHarpoonHead.prefab', None), 'rope': harpoon_rope(group)}


def harpoon_rope(group):
    """Dây xiên: LineRenderer trên nút Rope của PlayerGroup (15 RopeLink nối HingeJoint2D, dây mềm vật lý).
    {width: m, color: rgba} = widthMultiplier × màu đầu gradient × _Color của HarpoonRopeMaterial."""
    sys.dont_write_bytecode = True
    import level
    env, _ = level.load_with_deps(group)
    for c in level.prefab_objects(env, group):
        if c.type.name == 'LineRenderer':
            tt = c.read_typetree()
            par = tt['m_Parameters']
            k = par['colorGradient']['key0']
            mat = c.read().m_Materials[0].deref().read_typetree()
            col = dict(mat['m_SavedProperties']['m_Colors']).get('_Color', {'r': 1, 'g': 1, 'b': 1, 'a': 1})
            rgba = [round(k[a] * col[a], 3) + 0.0 for a in 'rgba']
            return {'width': round(par['widthMultiplier'] * par['widthCurve']['m_Curve'][0]['value'], 4), 'color': rgba}
    raise KeyError('PlayerGroup không có LineRenderer')


def prefab_sprite_info(path, rel):
    """Sprite của SpriteRenderer đầu tiên trong prefab: {img?, size, pivot, ppu}. rel = None thì không ghi ảnh."""
    sys.dont_write_bytecode = True
    import level
    env, _ = level.load_with_deps(path)
    for c in level.prefab_objects(env, path):
        if c.type.name == 'SpriteRenderer':
            sp = c.read().m_Sprite.read()
            img = sprite_canvas(sp)
            out = {'size': list(img.size), 'pivot': [round(sp.m_Pivot.x, 3) + 0.0, round(sp.m_Pivot.y, 3) + 0.0], 'ppu': sp.m_PixelsToUnits}
            if rel:
                save_png(img, rel)
                out = dict({'img': rel}, **out)
            return out
    raise KeyError('prefab không có SpriteRenderer: ' + path)


def harpoon_guns():
    """Súng xiên Dave cầm (HarpoonGunTemplate…), mỗi cấp súng xiên một khẩu. Treo ở HarpoonHandler."""
    return [dict({'lv': i + 1, 'name': n}, **prefab_sprite_info(HARPOON_DIR + 'Harpoon/%sTemplate.prefab' % n, 'dave/harpoon/%s.png' % n))
            for i, n in enumerate(HARPOON_GUNS)]


def dave_clips(group, cells):
    """AnimationClip của PlayerAnimCtrl (Animator trên DaveCharacter) -> dãy khoá sprite của thân.
    {tên clip: {length, loop, frames: [[giây, hàng, cột], ...]}}. Chỉ giữ clip mà mọi khung đều có trong sheet.
    Nhịp khung gốc không đều: ShortDash chạy 03,04,01,02,03,04,05 rồi giữ 05; Die 17 khung rồi DieIdle lặp 18..23;
    MeleeOneHandHorizontal xong trong 0,26 giây. Chia đều theo fps là sai nhịp."""
    sys.dont_write_bytecode = True
    import zlib
    import level
    import rip_boat as rb  # dùng chung bộ giải AnimationClip (clip_curves, controller_clips)
    env, _ = level.load_with_deps(group)
    root = level.prefab_root(env, group)
    dave = [c.read().m_GameObject.read() for c in level.transform_of(root).m_Children]
    dave = [g for g in dave if g.m_Name == 'DaveCharacter'][0]
    anim = [c.component for c in dave.m_Component if c.component.type.name == 'Animator'][0]
    _, clips = rb.controller_clips(anim)
    body = zlib.crc32(b'CharacterBody')
    near, behind = zlib.crc32(b'CharacterBody/RangeWeaponArm'), zlib.crc32(b'CharacterBody/BehindRangeWeaponArm')
    handler = zlib.crc32(b'CharacterBody/RangeWeaponArm/HarpoonHandler')
    active = zlib.crc32(b'm_IsActive')
    out = {}
    for o in clips:
        tt, ac = o.read_typetree(), o.read()
        curves = rb.clip_curves(tt)
        names = []
        for ptr in ac.m_ClipBindingConstant.pptrCurveMapping:
            try:
                names.append(ptr.read().m_Name)
            except Exception:
                names.append(None)
        ci, seq, extra = 0, None, {}
        keys = lambda i: [[round(max(0.0, t), 4) + 0.0, round(c[3], 4) + 0.0] for t, c in curves.get(i, []) if t < rb.BIG]
        for b in tt['m_ClipBindingConstant']['genericBindings']:
            dims = rb.BIND_DIMS.get(b['attribute'], 1) if b['typeID'] == 4 else 1
            idx = ci
            ci += dims
            if b['isPPtrCurve'] and b['typeID'] == 212 and b['path'] in (near, behind):
                k = int(round(curves[idx][0][1][3]))
                extra['nearArm' if b['path'] == near else 'behindArm'] = names[k]
                continue
            if not b['isPPtrCurve'] and b['typeID'] == 1 and b['attribute'] == active and b['path'] == near:
                extra['armsOn'] = [[t, int(v)] for t, v in keys(idx)]  # lớp tay bật/tắt theo thời gian
                continue
            if not b['isPPtrCurve'] and b['typeID'] == 4 and b['attribute'] == 4 and b['path'] == handler:
                extra['handlerRotZ'] = keys(idx + 2)  # độ, khoá Hermite đã rút về giá trị tại khoá
                continue
            if not (b['isPPtrCurve'] and b['typeID'] == 212 and b['path'] == body):
                continue
            seq = []
            for t, c in curves.get(idx, []):
                t = 0.0 if t < -rb.BIG else t
                if t > rb.BIG:
                    continue
                k = int(round(c[3]))
                n = names[k] if 0 <= k < len(names) else None
                if seq and abs(seq[-1][0] - t) < 1e-6:
                    seq[-1] = [t, n]
                else:
                    seq.append([t, n])
        if not seq or any(n not in cells for _, n in seq):
            continue
        mc = tt['m_MuscleClip']
        frames = []
        for t, n in seq:
            if frames and frames[-1][1:] == list(cells[n]):
                continue  # khoá giữ khung cũ tới hết clip
            frames.append([round(t, 4) + 0.0] + list(cells[n]))
        out[tt['m_Name']] = {'length': round(mc['m_StopTime'] - mc['m_StartTime'], 4) + 0.0,
                             'loop': bool(mc.get('m_LoopTime')),
                             'frames': frames}
        out[tt['m_Name']].update(extra)
    return {k: out[k] for k in sorted(out)}


# Nút của lớp tay súng phụ trong PlayerGroup, toạ độ tính trong hệ CharacterBody (đơn vị Unity, chưa nhân ×2).
RIG = {
    'rangeArm': 'CharacterBody/RangeWeaponArm',                 # tay gần, sprite AttackReadyArms, xoay theo điểm ngắm
    'behindArm': 'CharacterBody/BehindRangeWeaponArm',          # tay xa, sprite AttackReadyRightArm
    'gunHandler': 'CharacterBody/RangeWeaponArm/GunHandler',    # chỗ gắn súng cầm tay
    'grabPoint': 'CharacterBody/RangeWeaponArm/BehindArmGrabPoint',
    'ropeAttach': 'CharacterBody/RangeWeaponArm/RopeAttachRigidbody',        # đầu dây xiên
    'harpoonHandler': 'CharacterBody/RangeWeaponArm/HarpoonHandler',        # chỗ gắn súng xiên cầm tay
    'projectileAttach': 'CharacterBody/RangeWeaponArm/HarpoonHandler/ProjectileAttachTransform',  # đuôi mũi xiên lúc nằm trong súng
}


def dave_rig(group):
    """{khoá: [x, y]} vị trí các nút tay súng so với tâm thân Dave, lấy từ prefab PlayerGroup."""
    sys.dont_write_bytecode = True
    import level
    import numpy as np
    env, _ = level.load_with_deps(group)
    root = level.prefab_root(env, group)
    dave = [c.read().m_GameObject.read() for c in level.transform_of(root).m_Children]
    dave = [g for g in dave if g.m_Name == 'DaveCharacter'][0]
    body = [c.read().m_GameObject.read() for c in level.transform_of(dave).m_Children]
    body = [g for g in body if g.m_Name == 'CharacterBody'][0]
    cache, out = {}, {}
    inv = np.linalg.inv(level.world(level.transform_of(body), cache))
    for key, path in RIG.items():
        go = body
        for part in path.split('/')[1:]:
            kids = [c.read().m_GameObject.read() for c in level.transform_of(go).m_Children]
            go = [g for g in kids if g.m_Name == part][0]
        p = inv @ level.world(level.transform_of(go), cache)[:, 3]
        out[key] = [round(float(p[0]), 4) + 0.0, round(float(p[1]), 4) + 0.0]
        if key == 'behindArm':
            # tay xa có AimConstraint nhắm BehindArmGrabPoint (chỉ trục z): góc = hướng tới điểm nắm + m_RotationOffset.z
            ac = [c.component for c in go.m_Component if c.component.type.name == 'AimConstraint'][0].read_typetree()
            out['behindAimOffsetDeg'] = round(ac['m_RotationOffset']['z'], 4) + 0.0
    return out


# ---------------------------------------------------------------- IMAGES + VFX
def rip_images():
    out = {}
    for path, rel in IMAGES.items():
        out[rel] = list(save_png(image_of(path), rel))
    for n in VFX:
        path = None
        for ext in ('.png', '.tga', '.psd'):
            try:
                path = find_path(n + ext)
                break
            except KeyError:
                pass
        if not path:
            print('  thiếu VFX', n)
            continue
        rel = 'fx/%s.png' % n
        out[rel] = list(save_png(image_of(path), rel))
    return out


def rip_prefab_sprites():
    sys.dont_write_bytecode = True  # khỏi để lại __pycache__ trong cây game
    import level  # level.py nạp bảng bundle lúc import, nên chỉ gọi sau bundle_index()
    out = {}
    for path in PREFAB_SPRITES:
        env, _ = level.load_with_deps(path)
        for c in level.prefab_objects(env, path):
            if c.type.name != 'SpriteRenderer':
                continue
            r = c.read()
            if not r.m_Sprite.m_PathID:
                continue
            sp = r.m_Sprite.read()
            rel = 'props/%s.png' % sp.m_Name
            t = level.transform_of(r.m_GameObject.read())
            out[rel] = {'size': list(save_png(sp.image.convert('RGBA'), rel)), 'ppu': sp.m_PixelsToUnits,
                        'pivot': [round(sp.m_Pivot.x, 3), round(sp.m_Pivot.y, 3)],
                        'local': [round(t.m_LocalPosition.x, 3), round(t.m_LocalPosition.y, 3)],
                        'order': r.m_SortingOrder}
    return out


# ---------------------------------------------------------------- AUDIO
def rip_audio(keys=None):
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    os.makedirs(AUD, exist_ok=True)
    out = {}
    for key, (clip, kind) in AUDIO.items():
        if keys and key not in keys:
            continue
        path = find_path(clip + '.wav')
        ac = [o for o in objects_for(path) if type(o).__name__ == 'AudioClip' and o.m_Name == clip]
        if not ac:
            print('  thiếu tiếng', clip)
            continue
        wav = list(ac[0].samples.values())[0]
        tmp = os.path.join(CACHE, key + '.wav')
        open(tmp, 'wb').write(wav)
        # Nhạc để 96k stereo, tiếng lẻ 64k mono: cả bộ phải nhẹ để Pages tải nhanh.
        rate = ['-b:a', '96k'] if kind == 'music' else ['-ac', '1', '-b:a', '64k']
        dst = os.path.join(AUD, key + '.mp3')
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame'] + rate + [dst],
                       check=True)
        out[key] = {'src': 'audio/%s.mp3' % key, 'kind': kind}
    return out


# Lời nhắc tương tác trên xác cá: CuttingInteractionUI.prefab (vòng Gauge Circle_68, đĩa IconArea Circle_52)
# và phím Space của InputAtlas_Keyboard (hành động Interaction trong DRInput.inputactions là <Keyboard>/space).
PROMPT_PREFAB = PC + 'Ingame/00_InGame_Common/Prefabs/UI/CuttingInteractionUI.prefab'
PROMPT_KEYS = PC + 'Common/Sprites/Input/InputAtlas_Keyboard.spriteatlas'


def rip_prompt():
    import level
    want = {'Circle_68': 'ui/Circle_68.png', 'Circle_52': 'ui/Circle_52.png'}
    out = {}
    env, _ = level.load_with_deps(PROMPT_PREFAB)
    for o in env.objects:
        if o.type.name == 'Sprite':
            s = o.read()
            if s.m_Name in want and want[s.m_Name] not in out:
                out[want[s.m_Name]] = list(save_png(s.image.convert('RGBA'), want[s.m_Name]))
    for o in env_of(IDX[PROMPT_KEYS]).objects:
        if o.type.name == 'Sprite' and o.read().m_Name == 'Space_Key_Dark':
            out['ui/Space_Key_Dark.png'] = list(save_png(o.read().image.convert('RGBA'), 'ui/Space_Key_Dark.png'))
    missing = [r for r in list(want.values()) + ['ui/Space_Key_Dark.png'] if r not in out]
    if missing:
        raise SystemExit('không thấy sprite: %s' % missing)
    return out


# ---------------------------------------------------------------- LƯỚI + SỐ PHỤ CHO HẠT SÚNG
def minmax(c):
    """MinMaxCurve hằng -> số hoặc [min, max] (radian/đơn vị gốc). Đường cong thì lấy giá trị scalar."""
    st = c.get('minMaxState', 0)
    v = round(c['scalar'], 4) + 0.0
    return [round(c.get('minScalar', 0), 4) + 0.0, v] if st == 3 else v


def rip_fx_meshes():
    """Công thức hạt của súng (data/boat_assets.js, do rip_boat.py ghi) có emitter vẽ bằng lưới 3D
    (ParticleSystemRenderer m_RenderMode 4: QuadToCircle của vụ nổ, E_M_Paper_01A của lưới rách).
    Công thức không mang lưới, cũng không mang xoay 3D, cỡ 3D và _Emission của material. Tệp này bù phần đó:
    art/gear/mesh/gunvfx.json = {meshes: {tên: {pos, uv, idx}}, emitters: {"<src>#<tên GameObject>": {...}}}."""
    sys.dont_write_bytecode = True
    import level
    from UnityPy.helpers.MeshHelper import MeshHandler
    src = io.open(os.path.join(DATA, 'boat_assets.js'), encoding='utf-8').read()
    BA = json.loads(src[src.index('window.HX_BOAT_ASSETS =') + len('window.HX_BOAT_ASSETS ='):].strip().rstrip(';'))
    shutil.rmtree(os.path.join(ART, 'gear', 'mesh'), ignore_errors=True)  # thư mục riêng của bước này
    recipes = [r['src'] for r in BA['gunVfx'].values()]
    recipes += [g['projectile']['trail']['src'] for g in BA['guns'].values() if g.get('projectile', {}).get('trail')]
    meshes, extras = {}, {}
    for rsrc in sorted(set(recipes)):
        path = PC + rsrc
        env, _ = level.load_with_deps(path)
        for c in level.prefab_objects(env, path):
            if c.type.name != 'ParticleSystemRenderer':
                continue
            r = c.read()
            go = r.m_GameObject.read()
            ex = {}
            if r.m_Materials and r.m_Materials[0].m_PathID:
                mtt = r.m_Materials[0].deref().read_typetree()['m_SavedProperties']
                fl = dict(mtt['m_Floats'])
                if '_Emission' in fl and abs(fl['_Emission'] - 1) > 1e-6:
                    ex['emission'] = round(fl['_Emission'], 4) + 0.0  # shader Hovl *_CenterGlow nhân màu với số này
                # Hovl *_CenterGlow: ảnh chính nhân với ảnh _Noise trượt theo _SpeedMainTexUVNoiseZW.zw (vệt gió của vòng nổ)
                envs = {k: v for k, v in mtt['m_TexEnvs']}
                spd = dict(mtt['m_Colors']).get('_SpeedMainTexUVNoiseZW')
                if '_Noise' in envs and envs['_Noise']['m_Texture']['m_PathID'] and spd:
                    tex = [v for k, v in r.m_Materials[0].read().m_SavedProperties.m_TexEnvs if k == '_Noise'][0].m_Texture.read()
                    rel = 'gear/mesh/%s.png' % tex.m_Name
                    save_png(tex.image.convert('RGBA'), rel)
                    ev = envs['_Noise']
                    ex['noise'] = {'img': rel, 'scale': [round(ev['m_Scale']['x'], 4) + 0.0, round(ev['m_Scale']['y'], 4) + 0.0],
                                   'offset': [round(ev['m_Offset']['x'], 4) + 0.0, round(ev['m_Offset']['y'], 4) + 0.0],
                                   'speed': [round(spd['b'], 4) + 0.0, round(spd['a'], 4) + 0.0]}
            tt = c.read_typetree()
            if tt['m_RenderMode'] == 4 and r.m_Mesh.m_PathID:
                me = r.m_Mesh.read()
                if me.m_Name not in meshes:
                    h = MeshHandler(me)
                    h.process()
                    tris = [i for sub in h.get_triangles() for t in sub for i in t]
                    meshes[me.m_Name] = {'pos': [round(float(v), 5) + 0.0 for xyz in h.m_Vertices for v in xyz[:3]],
                                         'uv': [round(float(v), 5) + 0.0 for uv in h.m_UV0 for v in uv[:2]],
                                         'idx': [int(i) for i in tris]}
                ex['mesh'] = me.m_Name
                ex['align'] = ['view', 'world', 'local', 'facing', 'velocity'][tt.get('m_RenderAlignment', 0)]
                ps = [x.component for x in go.m_Component if x.component.type.name == 'ParticleSystem'][0].read_typetree()
                ini, rot = ps['InitialModule'], ps['RotationModule']
                if ini.get('rotation3D'):
                    ex['rot3'] = {'x': minmax(ini['startRotationX']), 'y': minmax(ini['startRotationY']), 'z': minmax(ini['startRotation'])}
                if rot.get('enabled'):
                    ex['rotOverLife3'] = {'x': minmax(rot['x']), 'y': minmax(rot['y']), 'z': minmax(rot['curve'])} if rot.get('separateAxes') else {'z': minmax(rot['curve'])}
                if ini.get('size3D'):
                    ex['size3'] = {'x': minmax(ini['startSize']), 'y': minmax(ini['startSizeY']), 'z': minmax(ini['startSizeZ'])}
            if ex:
                extras[rsrc + '#' + go.m_Name] = ex
    out = os.path.join(ART, 'gear', 'mesh', 'gunvfx.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline=chr(10)) as fh:
        json.dump({'meshes': meshes, 'emitters': extras}, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print('  lưới hạt:', ', '.join('%s (%d đỉnh)' % (k, len(v['pos']) // 3) for k, v in sorted(meshes.items())),
          '| số phụ cho', len(extras), 'emitter')


# ---------------------------------------------------------------- HẠT CỦA DAVE VÀ MÁU CÁ
VFXP = PC + 'Common/VFX/Prefabs/'
# khoá -> nguồn. "pg:<đường dẫn dưới CharacterBody>" là cụm hạt gắn sẵn trong PlayerGroup (toạ độ ghi theo CharacterBody,
# game nhân D.scale); còn lại là prefab rời (toạ độ theo gốc prefab).
DIVE_FX = {
    'tailBubble': 'pg:EffectGroup/TailBubble',           # bọt sau lưng khi bơi
    'tailBubbleFast': 'pg:EffectGroup/TailBubble_Fast',  # bọt khi tăng tốc
    'breath': 'pg:EffectGroup/Breath_Loop',              # bọt thở trên đầu
    'meleeBubble': 'pg:EffectGroup/MeleeBubble',         # vung dao
    'spearBubble': VFXP + 'PlayerInternal/SpearBubble.prefab',  # vệt bọt mũi xiên (gắn trên HarpoonProjectile)
    'bloodHit': VFXP + 'Blood/BloodHit.prefab',
    'bloodFatal': VFXP + 'Blood/BloodFatal.prefab',
    'bloodFight': VFXP + 'Blood/BloodFight.prefab',
    'bloodDave': VFXP + 'Blood/BloodDave.prefab',
}


def rip_dive_fx():
    """Công thức hạt cho lượt lặn (cùng dạng gunVfx của rip_boat.py) -> art/fx/dive/dive_vfx.json + ảnh hạt art/fx/dive/."""
    sys.dont_write_bytecode = True
    import level
    import numpy as np
    import rip_boat as rb
    out_dir = os.path.join(ART, 'fx', 'dive')
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    rb.FXDIR, rb.FXTC = out_dir, {}  # ảnh hạt ghi vào thư mục riêng, không đụng art/boat/fx
    group = PC + 'Common/Prefabs/Player/PlayerGroup.prefab'
    genv = None
    out = {}
    for key, src in DIVE_FX.items():
        cache = {}
        if src.startswith('pg:'):
            if genv is None:
                genv, _ = level.load_with_deps(group)
            root = level.prefab_root(genv, group)
            node = [c.read().m_GameObject.read() for c in level.transform_of(root).m_Children]
            node = [g for g in node if g.m_Name == 'DaveCharacter'][0]
            for part in ['CharacterBody'] + src[3:].split('/'):
                kids = [c.read().m_GameObject.read() for c in level.transform_of(node).m_Children]
                node = [g for g in kids if g.m_Name == part][0]
                if part == 'CharacterBody':
                    body = node
            bt = level.transform_of(body)
            rel = np.linalg.inv(level.world(bt, cache))
            r = rb.recipe_more(node, rel, rb.world_quat(bt), cache, src='PlayerGroup/CharacterBody/' + src[3:])
        else:
            env, _ = level.load_with_deps(src)
            root = level.prefab_root(env, src)
            t = level.transform_of(root)
            W = level.world(t, cache)
            rel = np.linalg.inv(W) if abs(np.linalg.det(W[:3, :3])) > 1e-9 else np.eye(4)
            if abs(np.linalg.det(W[:3, :3])) <= 1e-9:
                rel[:3, 3] = -W[:3, 3]
            r = rb.recipe_more(root, rel, rb.world_quat(t), cache, src=src.replace(PC, ''))
        for e in r['emitters']:
            if e.get('img'):
                e['img'] = 'art/fx/dive/' + os.path.basename(e['img'])
        out[key] = r
        print('  hạt %-15s %2d emitter' % (key, len(r['emitters'])))
    with open(os.path.join(out_dir, 'dive_vfx.json'), 'w', encoding='utf-8', newline=chr(10)) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


# ---------------------------------------------------------------- MAIN
def main():
    global IDX, CABS
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    ix = bundle_index()
    IDX, CABS = ix['path'], ix['cab']
    man_p = os.path.join(DATA, 'assets.js')
    man = {}
    if os.path.exists(man_p):
        man = json.loads(open(man_p, encoding='utf-8').read().split('=', 1)[1].rstrip().rstrip(';'))
    if what in ('all', 'art'):
        # art/level thuộc về level.py, đừng xoá.
        for sub in ('dave', 'fish', 'env', 'fx', 'ui', 'props'):  # env: thư mục cũ, xoá luôn
            shutil.rmtree(os.path.join(ART, sub), ignore_errors=True)
        print('Dave…')
        man['dave'] = rip_dave()
        print('Cá…')
        man['fish'] = rip_fish()
        print('Rong Spine…')
        man['spineEnv'] = rip_spine_env()
        print('Ảnh + VFX…')
        man['images'] = rip_images()
        man['props'] = rip_prefab_sprites()
    if what == 'dave':
        # chỉ sheet Dave + mục dave trong assets.js; cá, rong, ảnh, tiếng giữ nguyên
        shutil.rmtree(os.path.join(ART, 'dave'), ignore_errors=True)
        print('Dave…')
        man['dave'] = rip_dave()
    if what in ('all', 'art', 'divefx'):
        # sau bước art (art/fx vừa bị xoá và ghi lại); cần rip_boat.py import được
        print('Hạt của Dave, máu cá…')
        rip_dive_fx()
        if what == 'divefx':
            return
    if what in ('all', 'fxmesh'):
        # cần data/boat_assets.js của rip_boat.py; không đụng assets.js
        print('Lưới hạt súng…')
        rip_fx_meshes()
        if what == 'fxmesh':
            return
    if what in ('all', 'audio'):
        # `rip.py audio carving knife` chỉ ghi lại vài tiếng, giữ nguyên các tệp khác
        keys = sys.argv[2:]
        print('Tiếng…')
        got = rip_audio(keys)
        man['audio'] = dict(man.get('audio', {}), **got) if keys else got
    if what == 'prompt':
        print('Lời nhắc tương tác…')
        man['images'].update(rip_prompt())
    os.makedirs(DATA, exist_ok=True)
    with open(man_p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/rip.py — đừng sửa tay.\nwindow.HX_ASSETS = ')
        json.dump(man, fh, ensure_ascii=False, indent=1)
        fh.write(';\n')
    if what in ('all', 'art'):
        subprocess.run(['node', os.path.join(HERE, 'spine-info.js')], check=True)
    print('xong ->', man_p)


if __name__ == '__main__':
    main()
