# -*- coding: utf-8 -*-
"""Rut tai san PRO (D:\\pro-ref\\PROClient) cho ban 2D kieu PRO cua PokeOne.
Chay lai bao nhieu lan cung ra cung ket qua: ghi de, va xoa het tep thua trong tung
thu muc no tu quan ly (art/pro/poke, art/pro/player, art/pro/bg, audio/pro) truoc khi
ghi lai, de thu muc luon khop dung danh sach ben duoi (khong cong don rac tu lan chay truoc
voi danh sach ngan hon).

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/pro/rip_pro.py            # tat ca
    python games/pokeone/tools/pro/rip_pro.py poke       # chi sprite Pokemon
    python games/pokeone/tools/pro/rip_pro.py player     # chi lop nhan vat
    python games/pokeone/tools/pro/rip_pro.py bg         # chi nen tran
    python games/pokeone/tools/pro/rip_pro.py audio      # chi am thanh (can ffmpeg trong PATH)

Xem tools/pro/README.md de biet cac su that da do (thu tu hang cua tam follow, tu the
nao la di/chay, thu tu ve lop) va cac bay da sap.
"""
import collections
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata


from pro_env import ProEnv, PRO

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ART = os.path.join(GAME, 'art', 'pro')
AUD = os.path.join(GAME, 'audio', 'pro')
DATA = os.path.join(GAME, 'data')

DEX_MAX = 251
# Loai ngoai dex 251 ma bang gap Pokemon that cua PRO co o vung dau Kanto (Route 1: Shinx; Viridian Forest:
# Budew, Shroomish - D:\pro-ref\pokemap\pro_land_spawns.json), kem ca dong tien hoa.
DEX_EXTRA = [285, 286, 315, 403, 404, 405, 406, 407]
DEX_LIST = list(range(1, DEX_MAX + 1)) + DEX_EXTRA
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')

POKE_SRC = {
    'front': ('pbig', 'spbig'),
    'back': ('back', 'sback'),
    'follow': ('follow', 'sfollow'),
    'icon': ('smallpokemon', 'ssmallpokemon'),
}

# Hang cua tam follow (Pokemon di theo, luoi 4x4 co dan theo kich thuoc anh/4) khac voi
# hang cua tam player/npc [DO TRONG REPO 2026-09-28] - xem README.
FOLLOW_ROWS = {'down': 0, 'left': 1, 'right': 2, 'up': 3}
FOLLOW_COLS = 4

# Tu the: 1=di, 2=chay (do bang mat tren body 0_0, xem README). 3/4/5 la xe dap/luot
# song/khac - khong rip vi de bai chi can di+chay.
POSE = {'walk': '1', 'run': '2'}

# Thu tu ve lop nhan vat (do bang ghep thu, xem README).
LAYER_ORDER = ['body', 'cloth', 'hair', 'hat']

CLOTH_COUNT = 30
HEADGEAR_COUNT = 24

_pe = None


def pe():
    global _pe
    if _pe is None:
        _pe = ProEnv()
    return _pe


def reset_dir(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def save_img(src_path, dst):
    """Luu anh nguyen pixel (khong resample) tu duong dan Resources cua PRO."""
    im = pe().image(src_path)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst)


def bases_with_poses(prefix):
    """vd 'player/2_cloth_m' -> {'1009': {'1','2','4','5'}, ...} tu cac duong dan
    'player/2_cloth_m/1009_4'. Bo qua hau to khong phai so (vd '...._1f')."""
    out = collections.defaultdict(set)
    pre = prefix + '/'
    for p in pe().paths:
        if not p.startswith(pre):
            continue
        name = p[len(pre):]
        m = re.match(r'^(.+)_(\d+)$', name)
        if not m:
            continue
        out[m.group(1)].add(m.group(2))
    return out


# ------------------------------------------------------------------ 1. POKEMON
def rip_poke():
    for sub in POKE_SRC:
        reset_dir(os.path.join(ART, 'poke', sub))
    shiny_missing = []
    for dex in DEX_LIST:
        for sub, (base_pre, shiny_pre) in POKE_SRC.items():
            save_img('%s/%d' % (base_pre, dex), os.path.join(ART, 'poke', sub, '%d.png' % dex))
            spath = '%s/%d' % (shiny_pre, dex)
            if spath in pe().paths:
                save_img(spath, os.path.join(ART, 'poke', sub, '%ds.png' % dex))
            else:
                shiny_missing.append('%s/%d' % (sub, dex))
    if shiny_missing:
        print('  !! thieu shiny:', shiny_missing)
    print('poke:', len(DEX_LIST), 'dex x 4 loai (front/back/follow/icon), thieu shiny:', len(shiny_missing))
    return shiny_missing


# ------------------------------------------------------------------ 2. PLAYER
def rip_player():
    for g in ('m', 'f'):
        for layer in LAYER_ORDER:
            reset_dir(os.path.join(ART, 'player', g, layer))
    result = {'m': {}, 'f': {}}

    # body: het ca 20 kieu/gioi, than da so co du tu the 1..5.
    for g, prefix in (('m', 'player/1_body_m'), ('f', 'player/1_body_f')):
        bases = bases_with_poses(prefix)
        names = sorted(bases.keys())
        result[g]['body'] = names
        for name in names:
            for suf in POSE.values():
                save_img('%s/%s_%s' % (prefix, name, suf),
                          os.path.join(ART, 'player', g, 'body', '%s_%s.png' % (name, suf)))

    # cloth: giao ca hai gioi (co du tu the di+chay o CA HAI gioi), lay 30 kieu dau
    # (sap theo so hieu) de gon dung luong.
    cm = bases_with_poses('player/2_cloth_m')
    cf = bases_with_poses('player/2_cloth_f')
    both = sorted(set(cm) & set(cf), key=int)
    cloth_names = [b for b in both if POSE['walk'] in cm[b] and POSE['run'] in cm[b]
                   and POSE['walk'] in cf[b] and POSE['run'] in cf[b]][:CLOTH_COUNT]
    for g, prefix in (('m', 'player/2_cloth_m'), ('f', 'player/2_cloth_f')):
        result[g]['cloth'] = cloth_names
        for name in cloth_names:
            for suf in POSE.values():
                save_img('%s/%s_%s' % (prefix, name, suf),
                          os.path.join(ART, 'player', g, 'cloth', '%s_%s.png' % (name, suf)))

    # hair: het ca kieu cua tung gioi (khong can giao nhau, hai gioi danh so doc lap).
    for g, prefix in (('m', 'player/3_hair_m'), ('f', 'player/3_hair_f')):
        bases = bases_with_poses(prefix)
        names = sorted(bases.keys(), key=int)
        result[g]['hair'] = names
        for name in names:
            for suf in POSE.values():
                save_img('%s/%s_%s' % (prefix, name, suf),
                          os.path.join(ART, 'player', g, 'hair', '%s_%s.png' % (name, suf)))

    # headgear: nguon dung chung ca hai gioi (khong tach _m/_f) - lay 24 kieu dau,
    # chep vao ca hai thu muc gioi de giu API "art/pro/player/<gioi>/hat/..." dong nhat.
    hg = bases_with_poses('player/4_headgear')
    hg_names = sorted((b for b in hg if POSE['walk'] in hg[b] and POSE['run'] in hg[b]), key=int)[:HEADGEAR_COUNT]
    for g in ('m', 'f'):
        result[g]['hat'] = hg_names
        for name in hg_names:
            for suf in POSE.values():
                save_img('player/4_headgear/%s_%s' % (name, suf),
                          os.path.join(ART, 'player', g, 'hat', '%s_%s.png' % (name, suf)))

    print('player: than %d, ao %d, toc m=%d/f=%d, non %d (moi gioi, tu the di+chay)' % (
        len(result['m']['body']), len(cloth_names), len(result['m']['hair']), len(result['f']['hair']),
        len(hg_names)))
    return result


# ------------------------------------------------------------------ 3. BATTLE BG
BG_SUFFIXES = ('_day', '_afternoon', '_evening', '_night')


def rip_bg():
    reset_dir(os.path.join(ART, 'bg'))
    raw_names = pe().listdir('battlebgnew')
    families = collections.defaultdict(list)
    for raw in raw_names:
        clean = raw.replace(' ', '_')
        save_img('battlebgnew/' + raw, os.path.join(ART, 'bg', clean + '.png'))
        fam = clean
        for suf in BG_SUFFIXES:
            if clean.endswith(suf):
                fam = clean[:-len(suf)]
                break
        families[fam].append(clean)
    for fam in families:
        families[fam].sort()
    print('bg:', len(raw_names), 'anh nen,', len(families), 'ho')
    return dict(families)


# ------------------------------------------------------------------ 4. AUDIO
def slug(name):
    s = unicodedata.normalize('NFKD', name)
    s = s.encode('ascii', 'ignore').decode('ascii').lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    return re.sub(r'_+', '_', s).strip('_')


def _has_ffmpeg():
    return shutil.which(FFMPEG) is not None


def clip_to_ogg(wav_bytes, dst, bitrate='64k'):
    """64k mono nhu quy uoc sfx cua tools/rip_audio.py (khong phai nhac nen nen khong can
    stereo/bitrate cao)."""
    tmp = os.path.join(tempfile.gettempdir(), 'pro_rip_tmp_%d.wav' % (os.getpid()))
    with open(tmp, 'wb') as f:
        f.write(wav_bytes)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [FFMPEG, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libvorbis', '-ac', '1', '-b:a', bitrate, dst]
    subprocess.run(cmd, check=True)
    os.remove(tmp)


AUDIO_GROUPS = {
    'battle': 'audio files/battle sfx',
    'gui': 'audio files/gui sfx',
    'world': 'audio files/world sfx',
}


VGMSTREAM = os.environ.get('VGMSTREAM', os.path.expanduser(r'~/Downloads/vgmstream/vgmstream-cli.exe'))
RESOURCE_FILE = os.path.join(PRO, 'PROClient', 'PROClient_Data', 'resources.resource')


def clip_wav_bytes(data):
    """Tra ve byte WAV cho mot AudioClip da doc (obj.read()), hoac None neu giai khong duoc.
    Du lieu tieng nam trong PROClient_Data/resources.resource TREN DIA, dang FSB5 (ca PCM lan ADPCM).
    [BAY DA SAP 2026-09-28] get_resource_data cua UnityPy tim 'resources.resource' trong goi
    data.unity3d truoc va tra ve byte cua tep khac cung ten (du lieu anh RGBA) - ra tap am chu
    khong loi. Doc thang tep tren dia theo m_Offset/m_Size, roi giai FSB5 bang vgmstream-cli."""
    res = data.m_Resource
    if not res or not res.m_Size or not os.path.exists(VGMSTREAM):
        return None
    with open(RESOURCE_FILE, 'rb') as f:
        f.seek(res.m_Offset)
        raw = f.read(res.m_Size)
    if raw[:4] != b'FSB5':
        return None
    tmp = tempfile.mkdtemp()
    src, dst = os.path.join(tmp, 'clip.fsb'), os.path.join(tmp, 'clip.wav')
    with open(src, 'wb') as f:
        f.write(raw)
    subprocess.run([VGMSTREAM, '-o', dst, src], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(dst, 'rb') as f:
        return f.read()


def rip_audio():
    if not _has_ffmpeg():
        print('  !! khong thay ffmpeg trong PATH - bo qua audio/pro (dat bien FFMPEG neu can)')
        return {}
    sfx = {}
    for grp, prefix in AUDIO_GROUPS.items():
        reset_dir(os.path.join(AUD, grp))
        for name in pe().listdir(prefix):
            obj = pe().obj(prefix + '/' + name)
            if obj.type.name != 'AudioClip':
                # Mot vai muc trong thu muc sfx la Texture2D (icon di kem, khong phai
                # am thanh) [BAY DA SAP] - bo qua.
                print('  !! khong phai AudioClip (%s):' % obj.type.name, prefix + '/' + name)
                continue
            data = obj.read()
            wav = clip_wav_bytes(data)
            if not wav:
                print('  !! khong giai duoc:', prefix + '/' + name)
                continue
            key = slug(name)
            dst = os.path.join(AUD, grp, key + '.ogg')
            clip_to_ogg(wav, dst)
            sfx['%s.%s' % (grp, key)] = 'audio/pro/%s/%s.ogg' % (grp, key)
    print('audio:', len(sfx), 'clip (cry giu nguyen tu PokeOne, khong rip lai)')
    return sfx


def rip_cries_extra():
    """Tieng keu cho DEX_EXTRA (bo 1-251 van dung ban cua PokeOne o audio/cry)."""
    for dex in DEX_EXTRA:
        wav = clip_wav_bytes(pe().obj('audio files/cry/%d' % dex).read())
        if not wav:
            print('  !! khong giai duoc cry', dex)
            continue
        clip_to_ogg(wav, os.path.join(GAME, 'audio', 'cry', '%d.ogg' % dex))
    print('cry them:', DEX_EXTRA)


# ------------------------------------------------------------------ DATA FILE
def write_data(shiny_missing, player, bg, sfx):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, 'pro.js')
    payload = {
        'dexMax': DEX_MAX,
        'dexExtra': DEX_EXTRA,
        'shinyMissing': shiny_missing,
        'followRows': FOLLOW_ROWS,
        'followCols': FOLLOW_COLS,
        'pose': POSE,
        'layerOrder': LAYER_ORDER,
        'player': player,
        'bg': bg,
        'sfx': sfx,
    }
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(u'// Sinh b\u1edfi tools/pro/rip_pro.py \u2014 \u0111\u1eebng s\u1eeda tay.\n')
        f.write('window.P1 = window.P1 || {};\n')
        f.write('P1.PRO = ' + json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + ';\n')
    print('wrote', path)


def scan_existing_sfx():
    """Khi chi chay 1 nhom (vd chi 'poke') de data/pro.js van day du sfx da rip truoc do."""
    sfx = {}
    for grp in AUDIO_GROUPS:
        d = os.path.join(AUD, grp)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith('.ogg'):
                key = fn[:-4]
                sfx['%s.%s' % (grp, key)] = 'audio/pro/%s/%s.ogg' % (grp, key)
    return sfx


def scan_existing_player():
    """Nhu tren nhung cho lop nhan vat: doc lai ten (bo hau to tu the) tu tep da co."""
    player = {}
    for g in ('m', 'f'):
        player[g] = {}
        for layer in LAYER_ORDER:
            d = os.path.join(ART, 'player', g, layer)
            names = set()
            if os.path.isdir(d):
                for fn in os.listdir(d):
                    if fn.endswith('.png'):
                        names.add(fn[:-4].rsplit('_', 1)[0])
            player[g][layer] = sorted(names, key=lambda x: x.isdigit() and (0, int(x)) or (1, x))
    return player


def scan_existing_bg():
    d = os.path.join(ART, 'bg')
    families = collections.defaultdict(list)
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if not fn.endswith('.png'):
                continue
            clean = fn[:-4]
            fam = clean
            for suf in BG_SUFFIXES:
                if clean.endswith(suf):
                    fam = clean[:-len(suf)]
                    break
            families[fam].append(clean)
    for fam in families:
        families[fam].sort()
    return dict(families)


def main():
    args = sys.argv[1:] or ['all']
    shiny_missing = []
    player = scan_existing_player()
    bg = scan_existing_bg()
    sfx = scan_existing_sfx()

    if 'all' in args or 'poke' in args:
        shiny_missing = rip_poke()
        rip_cries_extra()
    if 'all' in args or 'player' in args:
        player = rip_player()
    if 'all' in args or 'bg' in args:
        bg = rip_bg()
    if 'all' in args or 'audio' in args:
        sfx = rip_audio()

    write_data(shiny_missing, player, bg, sfx)


if __name__ == '__main__':
    main()
