"""Bóc AudioClip của Soul Knight 8.6 -> .m4a (AAC) + quét tham chiếu prefab -> clip.

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/audio/build_audio.py [export|scan|encode|all]
Cần: UnityPy 1.25, ffmpeg trong PATH (hoặc WinGet), nguồn D:\\sk86-ref (SK86 env đổi được).
Kết quả trung gian nằm ở D:\\sk86-ref\\work\\audio (ngoài git); art/audio chỉ chứa .m4a cuối.
Sau đó chạy tools/audio/build_map.py để sinh data/sk-audio.js.
"""
import os, sys, json, hashlib, subprocess, shutil, collections, glob, re

sys.stdout.reconfigure(encoding='utf-8')
R = os.environ.get('SK86', r'D:\sk86-ref') + r'\UnityDataAssetPack\assets\AssetBundles'
WORK = os.environ.get('SK86', r'D:\sk86-ref') + r'\work\audio'
HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.normpath(os.path.join(HERE, '..', '..', 'art', 'audio'))

# Gói chứa AudioClip mà game web cần (bỏ skin/, aram/, pvp/, tutorial*, heroball... không dùng).
INCLUDE_EXACT = ['sound_effect.ab', 'weapon.ab', 'hero.ab', 'common.ab', 'bullet.ab', 'levelcommon.ab',
                 'levelobjects.ab', 'ui.ab', 'scene_game.ab', 'celler.ab', 'defence.ab', 'mode_loop.ab',
                 'season_iron_common.ab', 'escape_audio.ab', 'escape.ab', 'hero_room/common.ab']
INCLUDE_DIRS = ['bgm', 'boss', 'level', 'pet', 'mount']


def bundles():
    out = list(INCLUDE_EXACT)
    for d in INCLUDE_DIRS:
        for dp, _, fs in os.walk(os.path.join(R, d)):
            for f in fs:
                if f.endswith('.ab'):
                    out.append(os.path.relpath(os.path.join(dp, f), R).replace('\\', '/'))
    return [b for b in out if os.path.exists(os.path.join(R, b))]


def find_ffmpeg():
    p = shutil.which('ffmpeg')
    if p: return p
    g = glob.glob(os.path.expanduser(r'~\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe'))
    if g: return g[0]
    raise SystemExit('không thấy ffmpeg')


def export():
    import UnityPy
    os.makedirs(WORK + r'\wav', exist_ok=True)
    idx = {}   # tên lưu -> {bundle, orig, hash, dur, ch, hz}
    seen = {}  # (tên gốc, hash) -> tên lưu
    where = {}  # 'bundle|tên gốc' -> tên lưu (để tra tham chiếu prefab)
    for b in bundles():
        env = UnityPy.load(os.path.join(R, b))
        for o in env.objects:
            if o.type.name != 'AudioClip': continue
            d = o.read()
            try:
                smp = d.samples
            except Exception as e:
                print('LỖI', b, d.m_Name, e); continue
            for _, wav in smp.items():
                h = hashlib.md5(wav).hexdigest()[:10]
                key = (d.m_Name, h)
                if key in seen:
                    where[b + '|' + d.m_Name] = seen[key]; continue
                name = d.m_Name
                if name in idx:  # trùng tên khác nội dung
                    name = '%s@%s' % (d.m_Name, os.path.basename(b)[:-3])
                    if name in idx: name += h
                seen[key] = name; where[b + '|' + d.m_Name] = name
                open(WORK + r'\wav\%s.wav' % re.sub(r'[^\w.@#-]', '_', name), 'wb').write(wav)
                idx[name] = {'bundle': b, 'orig': d.m_Name, 'hash': h, 'dur': round(d.m_Length, 3),
                             'ch': d.m_Channels, 'hz': d.m_Frequency}
                break
        print(b, len(idx), flush=True)
    json.dump({'clips': idx, 'where': where},
              open(WORK + r'\export_index.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)


# Nhạc web thực sự dùng (lobby, 3 chương thường + trùm, mùa giải) [ĐO: map_levels.BgmClip / enemies.BossBgm /
# escape_config.baseBgm]. Nhạc khác trong gói (bgm_ hero, 4A/4B/4C, mecha...) bỏ để giữ dung lượng.
KEEP_MUSIC = ['bgm_room', 'bgm_1Low', 'bgm_1High', 'bgm_4Low', 'bgm_2High', 'bgm_6Low', 'bgm_3High',
              'bgm_multi_room_skin_0', 'bgm_esc_Scene1', 'bgm_esc_Scene4', 'bgm_esc_Scene5']
MAX_SFX_SEC = 6.0   # tiếng dài hơn (long_idle, giọng, bgm hero) không cần cho game


def is_music(name, meta):
    return meta['bundle'].startswith('bgm/') or name.lower().startswith(('bgm_', 'boss_', 'synthwave', 'defence_', 'defenc_'))         or meta['dur'] > 20


def keep(name, m):
    if is_music(name, m): return name in KEEP_MUSIC
    return m['dur'] <= MAX_SFX_SEC


def encode():
    from concurrent.futures import ThreadPoolExecutor
    ff = find_ffmpeg()
    ix = json.load(open(WORK + r'\export_index.json', encoding='utf-8'))['clips']
    os.makedirs(ART, exist_ok=True)
    for f in glob.glob(ART + '/*.m4a'): os.remove(f)
    out = {}
    jobs = []
    for name, m in ix.items():
        if not keep(name, m): continue
        src = WORK + r'\wav\%s.wav' % re.sub(r'[^\w.@#-]', '_', name)
        fn = re.sub(r'[^\w.@#-]', '_', name) + '.m4a'
        mus = is_music(name, m)
        # Nhạc: stereo 56k; tiếng: mono 40k @32 kHz (AAC-LC, Chrome + Safari đều phát được).
        cmd = [ff, '-y', '-v', 'error', '-i', src, '-c:a', 'aac', '-movflags', '+faststart']
        cmd += ['-ac', '2', '-b:a', '56k', '-ar', '44100'] if mus else ['-ac', '1', '-b:a', '40k', '-ar', '32000']
        cmd.append(os.path.join(ART, fn))
        jobs.append(cmd)
        out[name] = {'file': fn, 'dur': m['dur'], 'music': mus, 'bundle': m['bundle']}
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda c: subprocess.run(c, check=True), jobs))
    json.dump(out, open(WORK + r'\encoded.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    tot = sum(os.path.getsize(os.path.join(ART, v['file'])) for v in out.values())
    mus = sum(os.path.getsize(os.path.join(ART, v['file'])) for v in out.values() if v['music'])
    print('m4a', len(out), 'tổng', round(tot / 1e6, 2), 'MB, nhạc', round(mus / 1e6, 2), 'MB')


def scan():
    sys.path.insert(0, HERE)
    import scan_refs
    bl = bundles()
    scan_refs.index(bl)
    res = []
    for b in bl:
        r = scan_refs.scan(b); res += r; print(b, len(r), flush=True)
    print('không giải được:', dict(scan_refs.STAT))
    json.dump(res, open(os.path.join(WORK, 'refs.json'), 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('export', 'all'): export()
    if what in ('scan', 'all'): scan()
    if what in ('encode', 'all'): encode()
