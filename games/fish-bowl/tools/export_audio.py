"""Export every AudioClip of Aquarium Land (23 clips) to games/fish-bowl/art/sfx/ for the three.js build.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_audio.py        (needs ffmpeg on PATH and vgmstream-cli, $VGMSTREAM)

Writes <slug>.mp3 (mono 64 kbit/s; the two music themes and the bird loop stereo 96 kbit/s) and sfx.json
{clip name: {file, length, source "file:pathId"}}; which event plays which clip is decided in js (timelines name their
clips, MonoBehaviour fields point at them by path id).
Clip data is FSB5 in a .resource stream, read from FL_REF/data at m_Resource offset and decoded with vgmstream.
"""
import glob, json, os, subprocess, sys, tempfile
from UnityPy.helpers.ResourceReader import get_resource_data

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fl as mm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "sfx")
STEREO = ("497534", "497542", "audioblocks")
VGM = os.environ.get("VGMSTREAM", os.path.expanduser("~/Downloads/vgmstream/vgmstream-cli.exe"))
ON_DISK = {os.path.basename(p): p for p in glob.glob(os.path.join(mm.DATA, "*.resource"))}


def fsb_bytes(o, d):
    r = d.m_Resource
    name = os.path.basename(r.m_Source)
    if name in ON_DISK:
        with open(ON_DISK[name], "rb") as fh:
            fh.seek(r.m_Offset)
            return fh.read(r.m_Size)
    return bytes(get_resource_data(r.m_Source, o.assets_file, r.m_Offset, r.m_Size))


def slug(name):
    return "".join(c if c.isalnum() else "_" for c in name).strip("_")


def main():
    os.makedirs(OUT, exist_ok=True)
    found = {}
    for o in mm.load().objects:
        if o.type.name != "AudioClip":
            continue
        d = o.read()
        if d.m_Name in found:
            continue
        data = fsb_bytes(o, d)
        if data[:4] != b"FSB5":
            print("not FSB5:", d.m_Name, data[:4])
            continue
        music = d.m_Name.startswith(STEREO)
        out = os.path.join(OUT, slug(d.m_Name) + ".mp3")
        tmp = tempfile.mkdtemp()
        fsb, wav = os.path.join(tmp, "a.fsb"), os.path.join(tmp, "a.wav")
        with open(fsb, "wb") as fh:
            fh.write(data)
        try:
            subprocess.run([VGM, "-o", wav, fsb], check=True, timeout=300, capture_output=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "2" if music else "1",
                            "-b:a", "96k" if music else "64k", out], check=True, timeout=300)
        finally:
            for f in (fsb, wav):
                if os.path.exists(f):
                    os.unlink(f)
            os.rmdir(tmp)
        found[d.m_Name] = {"file": slug(d.m_Name) + ".mp3", "length": round(d.m_Length, 3),
                           "source": f"{o.assets_file.name}:{o.path_id}"}
        print(f"{d.m_Name}: {os.path.getsize(out) // 1024} KB")
    with open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(found, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
