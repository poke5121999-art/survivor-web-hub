"""Export the game's sound effects and music to games/casual-farm/art/sfx/ for the three.js build.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_audio.py        (needs ffmpeg on PATH and vgmstream-cli, $VGMSTREAM)

Which clip plays on which event: rules/sound-thief-nextmart.md in MM_REF (SoundManager fields in sharedassets0, the
Player_Chef and factory arrays in sharedassets1, the unlock / music clips in the addressable bundle). Writes
<name>.mp3 (mono 64 kbit/s; music 96 kbit/s) and sfx.json {event: {files, volume}}.

Clip data is FSB5 in a .resource stream. sharedassets0/1/12/18.resource sit next to the bundles on disk (UnityPy does
not open them, and its FMOD path fails with FmodError FORMAT), so the bytes are read from disk at m_Resource offset and
decoded with vgmstream; the addressable clips' stream lives inside their bundle.
"""
import glob, json, os, subprocess, sys, tempfile
from UnityPy.helpers.ResourceReader import get_resource_data

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "sfx")
VGM = os.environ.get("VGMSTREAM", os.path.expanduser("~/Downloads/vgmstream/vgmstream-cli.exe"))
ON_DISK = {os.path.basename(p): p for p in glob.glob(os.path.join(mm.REF, "*", "assets", "bin", "Data", "*.resource"))}


def fsb_bytes(o, d):
    r = d.m_Resource
    name = os.path.basename(r.m_Source)
    if name in ON_DISK:
        with open(ON_DISK[name], "rb") as fh:
            fh.seek(r.m_Offset)
            return fh.read(r.m_Size)
    return bytes(get_resource_data(r.m_Source, o.assets_file, r.m_Offset, r.m_Size))
# event -> (clip names, volume). Volumes are the SoundManager / PlayerHumanController fields. unlock, tile and
# factoryUpgrade are addressables known only by GUID; they are matched to the bundle clips by name (a guess).
EVENTS = {
    "tap": (["Tap-tap"], 1.0),
    "cancel": (["buttonCancel"], 0.8),
    "unlock": (["PoofUnlock_Small"], 0.9),
    "tile": (["PoofUnlock_Area"], 0.9),
    "factoryUpgrade": (["Small Success"], 1.0),
    "upgrade": (["powerupScaleRotate"], 1.0),
    "worker": (["Success Big Reward"], 0.8),
    "box": (["thud"], 1.0),
    "kaching": (["cash-register-sound-effect"], 1.0),
    "boxPick": (["Swish 1"], 1.0),
    "cashBurst": (["CashBurst_Small", "CashBurst_Medium", "CashBurst_Large", "CashBurst_ExtraLarge"], 1.0),
    "honk": (["clacson"], 0.3),
    "drive": (["carPullingAway"], 1.0),
    "pick": (["Cartoon Pop Up", "Cartoon Pop Up2", "Cartoon Pop Up3"], 0.8),
    "drop": (["Plop2", "Plop3", "Plop4"], 0.6),
    "cashPick": (["paperMoney04", "paperMoney05", "paperMoney06"], 0.3),
    "cashDrop": (["paperMoney01", "paperMoney02", "paperMoney03"], 0.5),
    "chicken": (["Chicken Sound Effect", "Chicken Sound Effect2", "Chicken Sound Effect3"], 1.0),
    "cow": (["CowMoo_01", "CowMoo_02", "CowMoo_07", "CowMoo_09"], 1.0),
    "pig": (["pig01", "pig02", "pig03", "pig04"], 1.0),
    "goat": (["goat01", "goat02", "goat04"], 1.0),
    "music": (["My Mini Mart - Idea 2 - Alt Melody 3"], 0.8),
}


def slug(name):
    return "".join(c if c.isalnum() else "_" for c in name).strip("_")


def main():
    os.makedirs(OUT, exist_ok=True)
    want = {n for names, _ in EVENTS.values() for n in names}
    found = {}
    for o in mm.load().objects:
        if o.type.name != "AudioClip":
            continue
        d = o.read()
        if d.m_Name not in want or d.m_Name in found:
            continue
        data = fsb_bytes(o, d)
        if data[:4] != b"FSB5":
            print("not FSB5:", d.m_Name, data[:4])
            continue
        music = d.m_Name.startswith("My Mini Mart")
        out = os.path.join(OUT, slug(d.m_Name) + ".mp3")
        tmp = tempfile.mkdtemp()
        fsb, wav = os.path.join(tmp, "a.fsb"), os.path.join(tmp, "a.wav")
        with open(fsb, "wb") as fh:
            fh.write(data)
        try:
            subprocess.run([VGM, "-o", wav, fsb], check=True, timeout=300, capture_output=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1" if not music else "2",
                            "-b:a", "96k" if music else "64k", out], check=True, timeout=300)
        finally:
            for f in (fsb, wav):
                if os.path.exists(f):
                    os.unlink(f)
            os.rmdir(tmp)
        found[d.m_Name] = slug(d.m_Name) + ".mp3"
        print(f"{d.m_Name}: {os.path.getsize(out) // 1024} KB")
    missing = sorted(want - set(found))
    table = {ev: {"files": [found[n] for n in names if n in found], "volume": vol} for ev, (names, vol) in EVENTS.items()}
    with open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(table, fh, indent=1)
    print("missing:", missing or "none")


if __name__ == "__main__":
    main()
