# -*- coding: utf-8 -*-
"""Rút art + anim + VFX + tiếng cho Hố Xanh thẳng từ bản cài Steam của Dave the Diver.

Chạy lại bao nhiêu lần cũng ra cùng một bộ tệp (xoá rồi ghi lại art/, audio/, data/assets.js).
    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip.py            # tất cả
    python games/ho-xanh/tools/rip.py art        # chỉ ảnh + Spine
    python games/ho-xanh/tools/rip.py audio      # chỉ tiếng
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
}
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
            return round(float(np.linalg.norm(level.world(level.transform_of(go), cache)[:3, 0])), 3)
    return 1.0


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
def rip_dave():
    """Mỗi dãy một hàng, ô 120x120. Trả về {tên: {row, n, fps, pivot}} cùng độ phóng của thân Dave và mũi xiên."""
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
    width = max(len(frames[n]) for n in names)
    sheet = Image.new('RGBA', (cell * width, cell * len(names)))
    anims = {}
    for row, n in enumerate(names):
        seq = sorted(frames[n], key=lambda t: t[0])
        for col, (_, s) in enumerate(seq):
            img = s.image.convert('RGBA')
            sheet.paste(img, (col * cell + (cell - img.width) // 2, row * cell + (cell - img.height) // 2))
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
            'scale': prefab_scale(group, named('CharacterBody')), 'harpoonScale': prefab_scale(group, named('HarpoonProjectile'))}


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
def rip_audio():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    if os.path.isdir(AUD):
        shutil.rmtree(AUD)
    os.makedirs(AUD)
    out = {}
    for key, (clip, kind) in AUDIO.items():
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
    if what in ('all', 'audio'):
        print('Tiếng…')
        man['audio'] = rip_audio()
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
