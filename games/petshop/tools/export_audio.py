"""Every AudioClip of Pet Shop Simulator (47: SFX, voices, animal sounds, music, birds ambience) for the web build.

Usage: python -I tools/export_audio.py
Reads SoundManager._audioStorage (level1 -> sharedassets1.assets AudioStorage): soundSrcs indexed by SoundId, bgmSrcs by
BGMId, ambientBgmSrcs by AmbientBGMId. Decodes each AudioClip (FSB5 Vorbis) with UnityPy/fmod and re-encodes to MP3
with ffmpeg (every browser plays MP3). Writes art/audio/<name>.mp3 and art/audio/audio.json {sfx: {SoundId: file},
bgm: {BGMId: file}, ambient: file}.

Main and expand BGMs of USA, France, UK (Counter.OnEnable plays MainBGMId.* / ExpandBGMId.*; BGMArea boxes switch to
the expand one inside zone 2) and the ambient loop are exported, music at 64 kbps.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import mm

SOUND_ID = ["BuildComplete", "GetMoney", "GaugeFill", "GaugeMoneyFill", "CarHorns", "Trash", "Upgrade", "Roulette1", "Roulette2"]
BGM_ID = ["USA", "USA_Expand", "France", "France_Expand", "UK", "UK_Expand", "WorldMap", "SkinRoom", "Hawaii"]
WANT_BGM = {"USA", "France", "UK", "USA_Expand", "France_Expand", "UK_Expand"}  # main BGM of the stage countries (stages cycle USA, France, UK [GUESS])
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
        args = ["-b:a", "64k"] if music else ["-b:a", "96k", "-ac", "1"]
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", t.name, *args, dst],
                       check=True, timeout=300)
    return os.path.basename(dst)


VGM = os.path.expanduser("~/unity-decode-kit/third_party/vgmstream/vgmstream-cli")


def main():
    """Clip bytes live in Data/<m_Resource.m_Source> (outside data.unity3d): FSB5 -> vgmstream -> WAV -> ffmpeg MP3."""
    env = mm.load()
    data_dir = os.path.dirname(mm.DATA[0])
    out_dir = os.path.join(GAME, "art", "audio")
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for o in env.objects:
        if o.type.name != "AudioClip":
            continue
        d = o.read_typetree()
        name, res = d["m_Name"], d["m_Resource"]
        safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)
        with open(os.path.join(data_dir, os.path.basename(res["m_Source"])), "rb") as fh:
            fh.seek(res["m_Offset"])
            blob = fh.read(res["m_Size"])
        music = d["m_Length"] > 20
        with tempfile.TemporaryDirectory() as td:
            fsb, wav = os.path.join(td, "a.fsb"), os.path.join(td, "a.wav")
            open(fsb, "wb").write(blob)
            r = subprocess.run([VGM, "-o", wav, fsb], capture_output=True, timeout=120)
            if r.returncode or not os.path.exists(wav):
                print("FAIL", name, r.stderr[-200:])
                continue
            args = ["-b:a", "64k"] if music else ["-b:a", "96k", "-ac", "1"]
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, *args, os.path.join(out_dir, safe + ".mp3")],
                           check=True, timeout=300)
        meta[name] = safe + ".mp3"
        print(name, round(d["m_Length"], 2), "s")
    json.dump(meta, open(os.path.join(out_dir, "audio.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
