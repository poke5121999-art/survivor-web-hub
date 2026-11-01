"""Sound effects and music of Burger Please! for the web build.

Usage: python -I tools/export_audio.py
Reads SoundManager._audioStorage (level1 -> sharedassets1.assets AudioStorage): soundSrcs indexed by SoundId, bgmSrcs by
BGMId, ambientBgmSrcs by AmbientBGMId. Decodes each AudioClip (FSB5 Vorbis) with UnityPy/fmod and re-encodes to MP3
with ffmpeg (every browser plays MP3). Writes art/audio/<name>.mp3 and art/audio/audio.json {sfx: {SoundId: file},
bgm: {BGMId: file}, ambient: file}.

Stage 1 only needs BGM USA (Counter.OnEnable plays MainBGMId.USA) and the ambient loop, so only those are exported.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import mm

SOUND_ID = ["BuildComplete", "GetMoney", "GaugeFill", "GaugeMoneyFill", "CarHorns", "Trash", "Upgrade", "Roulette1", "Roulette2"]
BGM_ID = ["USA", "USA_Expand", "France", "France_Expand", "UK", "UK_Expand", "WorldMap", "SkinRoom", "Hawaii"]
WANT_BGM = {"USA"}
WANT_SFX = {"BuildComplete", "GetMoney", "GaugeFill", "GaugeMoneyFill", "CarHorns", "Trash", "Upgrade"}


def headless_fmod():
    """fmod_toolkit inits FMOD with the default output, which fails without a sound device (FmodError OUTPUT INIT).
    Decoding needs no device: pre-create each system with the no-sound output."""
    from fmod_toolkit import fmod as ft
    real = ft.get_pyfmodex_system_instance

    def get(channels, flags):
        with ft.SYSTEM_GLOBAL_LOCK:
            key = (channels, flags)
            if key not in ft.SYSTEM_INSTANCES:
                system = ft.pyfmodex.System()
                system.output = ft.pyfmodex.enums.OUTPUTTYPE.NOSOUND_NRT
                system.init(channels, flags, None)
                ft.SYSTEM_INSTANCES[key] = (system, ft.Lock())
        return real(channels, flags)
    ft.get_pyfmodex_system_instance = get


def encode(clip, name, out_dir, music):
    samples = clip.samples  # {name.wav: bytes}
    wav = next(iter(samples.values()))
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        t.write(wav)
        t.flush()
        dst = os.path.join(out_dir, name + ".mp3")
        args = ["-b:a", "96k"] if music else ["-b:a", "96k", "-ac", "1"]
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", t.name, *args, dst],
                       check=True, timeout=300)
    return os.path.basename(dst)


def main():
    headless_fmod()
    mm.load()
    f = mm.by_file("sharedassets1.assets")
    store = next(o for o in f.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "AudioStorage")
    d = mm.read(store)
    out_dir = os.path.join(GAME, "art", "audio")
    os.makedirs(out_dir, exist_ok=True)
    meta = {"sfx": {}, "bgm": {}, "ambient": None, "source": "sharedassets1.assets AudioStorage"}
    for s in d["soundSrcs"]:
        sid = SOUND_ID[s["soundId"]]
        if sid not in WANT_SFX:
            continue
        clip = f[s["soundFile"]["m_PathID"]].read()
        meta["sfx"][sid] = encode(clip, "sfx_" + sid, out_dir, False)
        print(sid, clip.m_Name, round(clip.m_Length, 2), "s")
    for s in d["bgmSrcs"]:
        bid = BGM_ID[s["bgmId"]]
        if bid not in WANT_BGM:
            continue
        clip = f[s["soundFile"]["m_PathID"]].read()
        meta["bgm"][bid] = encode(clip, "bgm_" + bid, out_dir, True)
        print(bid, clip.m_Name, round(clip.m_Length, 2), "s")
    amb = d["ambientBgmSrcs"][0]["soundFile"]["m_PathID"]
    clip = f[amb].read()
    meta["ambient"] = encode(clip, "ambient", out_dir, True)
    print("ambient", clip.m_Name, round(clip.m_Length, 2), "s")
    json.dump(meta, open(os.path.join(out_dir, "audio.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
