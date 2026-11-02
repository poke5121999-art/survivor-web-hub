"""Export every Cats&Soup AudioClip to art/sfx/<name>.mp3 + sfx.json {name: {dur, file, music}}.

Usage: PYTHONIOENCODING=utf-8 py -3.12 -I export_audio.py   (ffmpeg on PATH, vgmstream in ~/Downloads/vgmstream)
Each of the 203 clips sits alone in a file named by hash; its FSB5 stream is in <hash>.resource next to it. UnityPy's
FMOD path fails with FORMAT, so the bytes are read at m_Resource offset/size and decoded with vgmstream, then ffmpeg.
Clips < 10 s: mono 64k; longer: stereo 96k (music). Same name + same length = duplicate, skipped.
"""
import json, os, re, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
REF = "D:/catsoup-ref"
sys.path.insert(0, os.path.join(REF, "tools"))
import cns  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "art", "sfx")
VGM = os.environ.get("VGMSTREAM", os.path.expanduser("~/Downloads/vgmstream/vgmstream-cli.exe"))


def slug(n):
    return re.sub(r"[^\w\-.]+", "_", n).strip("_")


def run(cmd):
    return subprocess.run(cmd, check=True, timeout=300, capture_output=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    survey = json.load(open(os.path.join(REF, "survey.json"), encoding="utf-8"))["files"]
    files = sorted(f for f, v in survey.items() if v.get("types", {}).get("AudioClip"))
    table, seen, total, skipped = {}, set(), 0, []
    for f in files:
        e = cns.env(f)
        for o in e.objects:
            if o.type.name != "AudioClip":
                continue
            total += 1
            d = o.read()
            name = d.m_Name
            r = d.m_Resource
            src = os.path.join(cns.DATA, os.path.basename(r.m_Source))
            with open(src, "rb") as fh:
                fh.seek(r.m_Offset)
                data = fh.read(r.m_Size)
            if data[:4] != b"FSB5":
                skipped.append((name, "not FSB5"))
                continue
            tmp = tempfile.mkdtemp()
            fsb, wav = os.path.join(tmp, "a.fsb"), os.path.join(tmp, "a.wav")
            with open(fsb, "wb") as fh:
                fh.write(data)
            try:
                run([VGM, "-o", wav, fsb])
                pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
                                    capture_output=True, text=True, timeout=60)
                dur = round(float(pr.stdout.strip()), 3)
                key = (name, round(dur, 2))
                if key in seen:
                    skipped.append((name, "duplicate"))
                    continue
                seen.add(key)
                music = dur >= 10
                fn = slug(name)
                if fn + ".mp3" in {v["file"] for v in table.values()}:
                    fn += "_%d" % int(dur * 100)
                out = os.path.join(OUT, fn + ".mp3")
                run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "2" if music else "1",
                     "-b:a", "96k" if music else "64k", out])
                table[name if name not in table else fn] = {"dur": dur, "file": fn + ".mp3", "music": music}
            finally:
                for p in (fsb, wav):
                    if os.path.exists(p):
                        os.unlink(p)
                os.rmdir(tmp)
    with open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(table, fh, indent=1, ensure_ascii=False)
    print("found", total, "written", len(table), "skipped", skipped)


if __name__ == "__main__":
    main()
