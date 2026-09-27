# -*- coding: utf-8 -*-
"""Rút nhạc, tiếng kêu Pokémon và SFX cho PokéOne thẳng từ bundle UnityFS trong bản cài.
Chạy lại bao nhiêu lần cũng ra cùng kết quả (ghi đè, và với nhạc: xoá luôn tệp thừa ngoài
danh sách KANTO_MUSIC để audio/music/ luôn khớp đúng danh sách).

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_audio.py            # tất cả
    python games/pokeone/tools/rip_audio.py music       # chỉ nhạc (danh sách KANTO_MUSIC, xem bên dưới)
    python games/pokeone/tools/rip_audio.py cry         # chỉ tiếng kêu (cdata, dex 1-251)
    python games/pokeone/tools/rip_audio.py sfx         # chỉ hiệu ứng (sharedassets1/2)

Biến môi trường: POKEONE_DATA (thư mục PokeOne_Data), FFMPEG (đường dẫn ffmpeg.exe).
UnityPy giải AudioClip (FSB5) luôn ra PCM .wav bất kể tệp gốc trong bundle là .ogg hay .mp3
(kiểm bằng peek: mọi clip đều bắt đầu bằng b'RIFF') — nên khỏi cần phân biệt, cứ luôn
wav -> ffmpeg -> ogg.
"""
import io, json, os, re, subprocess, sys, tempfile, unicodedata

import UnityPy

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
AUD = os.path.join(GAME, 'audio')
DATA = os.path.join(GAME, 'data')

PDATA = os.environ.get('POKEONE_DATA', r'D:\pokeone-ref\extract\app\files\PokeOne_Data')
SA = os.path.join(PDATA, 'StreamingAssets')
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
CACHE = os.path.join(tempfile.gettempdir(), 'pokeone-audio-rip')
os.makedirs(CACHE, exist_ok=True)

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


def slug(name):
    """Tên gốc -> khoá snake_case chữ thường (giữ số, gạch dưới)."""
    s = unicodedata.normalize('NFKD', name)
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s


def clip_to_ogg(wav_bytes, dst, mono=False, bitrate='96k'):
    tmp = os.path.join(CACHE, 'tmp_%d.wav' % (hash(dst) & 0xffffffff))
    with open(tmp, 'wb') as f:
        f.write(wav_bytes)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [FFMPEG, '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libvorbis', '-b:a', bitrate]
    if mono:
        cmd += ['-ac', '1']
    cmd += [dst]
    subprocess.run(cmd, check=True)


def all_audioclips(env):
    for obj in env.objects:
        if obj.type.name != 'AudioClip':
            continue
        d = obj.read()
        samp = d.samples
        if not samp:
            continue
        wav = list(samp.values())[0]
        yield d.m_Name, wav


# ------------------------------------------------------------------ MUSIC
# Chi lay nhac dung cho pham vi Kanto som (bo qua toan bo Unova B/W trong adata2 va nhac le
# hoi Xmas/Spooky trong adata3 - 142 bai goc / ~119 MB o 96kbps qua ngan "audio <= 45 MB").
# Danh sach nay la QUYET DINH CUOI CUNG tu dieu phoi vien (2026-09-27), thay cho ban dau "xuat
# het 142 bai" - o 96 kbps STEREO nhu de bai goc, khong phai ha bitrate nua vi danh sach da du
# nho de vua ngan sach. Giu la hang so o day de sua lai de dang neu can doi danh sach.
KANTO_MUSIC = [
    'title', 'pallet_town', 'route_1', 'viridian_city', 'viridian_forest', 'route_3',
    'pewter_city', 'mt_moon', 'pokemon_center', 'pokemon_center2', 'pokemart', 'shop',
    'oak', 'gym', 'wild_battle_kanto', 'battle_wild', 'trainer_battle', 'battle_gym_kanto',
    'battle_gym', 'rocket',
    'boy_1', 'boy_2', 'boy_3', 'girl_1', 'girl_2', 'lass', 'backpacker', 'tough',
    'suspicious_1', 'suspicious_2', 'gentleman', 'sailor', 'twins',
    'default_0', 'default_1', 'default_2', 'default_3',
]
MUSIC_BITRATE = '96k'


def rip_music():
    music = {}
    wanted = set(KANTO_MUSIC)
    found = set()
    for bundle in ('adata', 'adata2', 'adata3'):
        env = load_bundle(bundle)
        for name, wav in all_audioclips(env):
            key = slug(name)
            if key not in wanted:
                continue
            dst = os.path.join(AUD, 'music', key + '.ogg')
            clip_to_ogg(wav, dst, mono=False, bitrate=MUSIC_BITRATE)
            music[key] = 'audio/music/%s.ogg' % key
            found.add(key)
    missing = wanted - found
    if missing:
        print('  !! thieu trong bundle goc:', sorted(missing))
    # Xoa moi tep .ogg khong nam trong KANTO_MUSIC de thu muc khop dung danh sach (khong
    # cong don rac tu lan chay 'all' truoc khi con 142 bai).
    d = os.path.join(AUD, 'music')
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if fn.endswith('.ogg') and fn[:-4] not in wanted:
                os.remove(os.path.join(d, fn))
    print('music:', len(music), '/', len(KANTO_MUSIC), 'bai (da xoa bai ngoai danh sach)')
    return music


# ------------------------------------------------------------------ CRY
def rip_cry():
    env = load_bundle('cdata')
    cont = env.container
    n = 0
    for dex in range(1, DEX_MAX + 1):
        path = 'assets/assetbundles/crys/%03d.wav' % dex
        if path not in cont:
            print('  !! thieu', path)
            continue
        obj = cont[path]
        d = obj.read()
        samp = d.samples
        wav = list(samp.values())[0]
        dst = os.path.join(AUD, 'cry', '%d.ogg' % dex)
        clip_to_ogg(wav, dst, mono=True, bitrate='64k')
        n += 1
    print('cry:', n, 'tieng keu')
    return n


# ------------------------------------------------------------------ SFX
def rip_sfx():
    sfx = {}
    env1 = load_shared('sharedassets1.assets')
    for name, wav in all_audioclips(env1):
        key = slug(name)
        dst = os.path.join(AUD, 'sfx', key + '.ogg')
        clip_to_ogg(wav, dst, mono=True, bitrate='64k')
        sfx[key] = 'audio/sfx/%s.ogg' % key
    env2 = load_shared('sharedassets2.assets')
    for name, wav in all_audioclips(env2):
        key = slug(name)
        dst = os.path.join(AUD, 'sfx', key + '.ogg')
        clip_to_ogg(wav, dst, mono=True, bitrate='64k')
        sfx[key] = 'audio/sfx/%s.ogg' % key
    print('sfx:', len(sfx), 'clip')
    return sfx


def write_audio_js(music, sfx):
    os.makedirs(DATA, exist_ok=True)
    with io.open(os.path.join(DATA, 'audio.js'), 'w', encoding='utf-8') as f:
        f.write('// Tu dong sinh boi tools/rip_audio.py. Dung sua tay.\n')
        f.write('window.P1 = window.P1 || {};\n')
        f.write('P1.MUSIC = ' + json.dumps(music, ensure_ascii=False, indent=2, sort_keys=True) + ';\n')
        f.write('P1.SFX = ' + json.dumps(sfx, ensure_ascii=False, indent=2, sort_keys=True) + ';\n')
        f.write("P1.CRY_PATH = 'audio/cry/';\n")
    print('wrote', os.path.join(DATA, 'audio.js'))


def scan_existing(subdir):
    """Goi khi chi chay 1 nhom (vd chi 'sfx') de data/audio.js van day du ca 'music' lay
    tu tep .ogg da co san tren dia, khong ghi de mat nhom kia (moi lan chay chi biet nhom
    minh vua lam)."""
    d = os.path.join(AUD, subdir)
    out = {}
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith('.ogg'):
                key = fn[:-4]
                out[key] = 'audio/%s/%s' % (subdir, fn)
    return out


def main():
    if not _has_ffmpeg():
        raise SystemExit('khong thay ffmpeg trong PATH (dat bien FFMPEG neu can)')
    args = sys.argv[1:] or ['all']
    if 'all' in args or 'music' in args:
        music = rip_music()
    else:
        music = scan_existing('music')
    if 'all' in args or 'cry' in args:
        rip_cry()
    if 'all' in args or 'sfx' in args:
        sfx = rip_sfx()
    else:
        sfx = scan_existing('sfx')
    write_audio_js(music, sfx)


def _has_ffmpeg():
    import shutil
    return shutil.which(FFMPEG) is not None


if __name__ == '__main__':
    main()
