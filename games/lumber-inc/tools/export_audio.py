"""Export Lumber Inc's 30 AudioClips (bundle defaultlocalgroup) to games/lumber-inc/art/sfx/ as mp3 + sfx.json.

Usage (from this folder): PYTHONIOENCODING=utf-8 py -3.12 export_audio.py   (needs ffmpeg on PATH and vgmstream-cli, $VGMSTREAM)

Clips are FSB5 inside the bundle's .resource stream: bytes are read raw, decoded with vgmstream, encoded with ffmpeg
(mono 96 kbit/s, music 128 kbit/s stereo-as-is). sfx.json {name: {file, seconds, music}} plus "_consts" from
config/const.txt (SOUND_MAINBGM = bgm_looby: no clip of that name ships in the APK, see "_notes").
"""
import json, os, subprocess, sys, tempfile
from UnityPy.helpers.ResourceReader import get_resource_data

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "sfx")
VGM = os.environ.get("VGMSTREAM", os.path.expanduser("~/Downloads/vgmstream/vgmstream-cli.exe"))


def main():
    os.makedirs(OUT, exist_ok=True)
    lm.load()
    table, total = {}, 0
    for fn in lm.bundle_files("defaultlocalgroup"):
        for pid, o in lm.by_file(fn).items():
            if o.type.name != "AudioClip":
                continue
            d = o.read()
            r = d.m_Resource
            data = bytes(get_resource_data(r.m_Source, o.assets_file, r.m_Offset, r.m_Size))
            if data[:4] != b"FSB5":
                print("not FSB5:", d.m_Name, data[:4])
                continue
            music = d.m_Name.startswith("bgm")
            out = os.path.join(OUT, d.m_Name + ".mp3")
            tmp = tempfile.mkdtemp()
            fsb, wav = os.path.join(tmp, "a.fsb"), os.path.join(tmp, "a.wav")
            with open(fsb, "wb") as fh:
                fh.write(data)
            try:
                subprocess.run([VGM, "-o", wav, fsb], check=True, timeout=300, capture_output=True)
                cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", wav]
                if not music and d.m_Channels > 1:
                    cmd += ["-ac", "1"]
                subprocess.run(cmd + ["-b:a", "128k" if music else "96k", out], check=True, timeout=300)
            finally:
                for f in (fsb, wav):
                    if os.path.exists(f):
                        os.unlink(f)
                os.rmdir(tmp)
            kb = os.path.getsize(out) / 1024
            total += kb
            table[d.m_Name] = {"file": d.m_Name + ".mp3", "seconds": round(d.m_Length, 3), "music": music,
                               "channels": d.m_Channels, "hz": d.m_Frequency}
            print(f"{d.m_Name}: {d.m_Length:.2f}s {kb:.0f} KB")
    consts = {}
    for row in lm.config("const"):
        if str(row.get("Key", "")).startswith("SOUND_"):
            consts[row["Key"]] = row.get("Value")
    table = dict(sorted(table.items()))
    table["_consts"] = consts
    table["_notes"] = ["SOUND_MAINBGM names bgm_looby, which is not among the 30 shipped clips; bgm_forest (59 s) and "
                       "bgm_wave (60 s) are the only music clips."]
    with open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(table, fh, indent=1, ensure_ascii=False)
    print(f"{len(table) - 2} clips, {total:.0f} KB")


if __name__ == "__main__":
    main()
