# -*- coding: utf-8 -*-
"""
Rip UI/jingle/training/gacha/result SFX and selected BGM from the locally
installed Uma Musume Pretty Derby (Steam / DMM) client into WAV files, and
build a TSV catalog of every subsong (cue) name + duration.

Data source: C:\\Users\\tamph\\AppData\\LocalLow\\Cygames\\Umamusume\\meta
(sqlite db, table a: n=logical name, h=hash/filename, m=category, k=kind
(11=CRI audio), s=1 means downloaded). File on disk = dat/<h[:2]>/<h>.

Decoder: vgmstream-cli.exe (C:\\Users\\tamph\\Downloads\\vgmstream). CRI
.acb/.awb pairs are copied to a temp dir under their LOGICAL names (so
vgmstream can resolve the acb -> awb streaming reference) together with a
`.hcakey` file holding the Uma Musume HCA key (big-endian 8 bytes,
0x0000450D608C479F) so encrypted HCA payloads decode.

Run: python rip_uma_audio.py
Outputs:
  - D:/uma-ref/audio_catalog.tsv   (bank, subsong index, stream name, seconds)
  - D:\\uma-ref\\sfx\\<bank>\\<index>_<name>.wav   (decoded UI/jingle/training/gacha cues)
  - D:\\uma-ref\\bgm\\<bank>.wav or <bank>_<index>_<name>.wav (selected BGM tracks)
"""
import io
import os
import re
import shutil
import sqlite3
import subprocess
import sys

UMA_DIR = r"C:\Users\tamph\AppData\LocalLow\Cygames\Umamusume"
META = os.path.join(UMA_DIR, "meta")
DAT = os.path.join(UMA_DIR, "dat")

VGMSTREAM = r"C:\Users\tamph\Downloads\vgmstream\vgmstream-cli.exe"
HCA_KEY_HEX = "0000450D608C479F"  # big-endian 8 bytes -> 75923756697503

SCRATCH = os.environ.get("UMAREF", r"D:/uma-ref")  # danh mục .tsv và thư mục tạm nằm cạnh bản bóc, ngoài git
WORK = os.path.join(SCRATCH, "audio_work")  # temp dir for paired acb/awb/hcakey
OUT_SFX = r"D:\uma-ref\sfx"
OUT_BGM = r"D:\uma-ref\bgm"
CATALOG_TSV = os.path.join(SCRATCH, "audio_catalog.tsv")
FAIL_LOG = os.path.join(SCRATCH, "audio_fail.log")

os.makedirs(WORK, exist_ok=True)
os.makedirs(OUT_SFX, exist_ok=True)
os.makedirs(OUT_BGM, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. Load logical-name -> hash map for every downloaded (s=1) audio row.
# ---------------------------------------------------------------------------
con = sqlite3.connect(META)
cur = con.cursor()
cur.execute("select n, h from a where s=1 and k=11")
name_to_hash = {}
for n, h in cur.fetchall():
    name_to_hash[n] = h
con.close()
print("loaded", len(name_to_hash), "downloaded CRI audio rows")


def disk_path(h):
    return os.path.join(DAT, h[:2], h)


# ---------------------------------------------------------------------------
# 2. Bank selections.
# ---------------------------------------------------------------------------
# SFX banks (sound/s/) to decode in full (UI / jingle / training / gacha /
# result). Chosen by inspecting the full sound/s/ name list for banks that
# are clearly UI/system/training/gacha related, excluding voice (sound/v,
# sound/c), per-character fan-club cheer banks (snd_sfx_fc_*), and big
# ambience/atmos loop banks (snd_sfx_atmos_*).
SFX_DECODE_BANKS = [
    "sound/s/snd_bgm_jingle_ui",       # UI stingers (confirm/cancel/etc jingles)
    "sound/s/snd_bgm_jingle_training", # training result jingles
    "sound/s/snd_sfx_common",          # core UI SE bank (button/cursor/decide/cancel...)
    "sound/s/snd_sfx_training_000",    # training-specific SE
    "sound/s/snd_sfx_training_001",
    "sound/s/snd_sfx_gacha_000",       # gacha common SE bank
    "sound/s/snd_sfx_race_result_1006",# race result fanfare set A
    "sound/s/snd_sfx_race_result_1007",# race result fanfare set B
]

# BGM banks (sound/b/) to decode: home/menu/training/career/gacha/result/lobby
# candidates. File names in sound/b/ are opaque codes (am/cs/dm/fx/gm/sm/jingle/
# title) with no descriptive suffix, so picks are judgement calls documented in
# CATALOG.md; "gm" (general/menu music) and "title" are the best-fit codes for
# home/menu, "jingle_ui" for short UI stings.
BGM_DECODE_BANKS = [
    "sound/b/snd_bgm_title",
    "sound/b/snd_bgm_jingle_ui",
    "sound/b/snd_bgm_gm001",
    "sound/b/snd_bgm_gm002",
    "sound/b/snd_bgm_gm003",
    "sound/b/snd_bgm_gm004",
    "sound/b/snd_bgm_gm005",
    "sound/b/snd_bgm_gm013",
    "sound/b/snd_bgm_gm020a",
    "sound/b/snd_bgm_gm095",
    "sound/b/snd_bgm_gm096",
    "sound/b/snd_bgm_gm128",
]


def safe(s):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", s)


def stage_pair(bank_logical):
    """Copy whichever of .acb/.awb exist for this bank into WORK under the
    same basename plus a .hcakey fallback. Returns the path vgmstream should
    be pointed at.
    MEASURED QUIRK: when a bank has BOTH a .acb and a separate .awb, this
    vgmstream build (r2117) fails to open the .acb directly ("ACB: bank has
    no subsongs (ignore)" / "failed opening ...") even though the .awb sits
    right next to it under the matching basename -- the acb<->awb auto-link
    does not kick in for this game's files. Opening the bare .awb instead
    works perfectly and vgmstream still recovers real cue names (HCA streams
    embed their own name/comment). Only when a bank has NO separate .awb
    (wave data embedded in the .acb itself, e.g. snd_sfx_common,
    snd_sfx_gacha_000, snd_sfx_training_001) does opening the .acb work (and
    is required, since there is no .awb). So: prefer .awb, fall back to .acb.
    Returns None if neither file is on disk.
    NOTE (measured): this Steam Uma Musume install's CRI HCA audio is NOT
    encrypted -- vgmstream decodes everything directly with no .hcakey
    needed. The .hcakey is still written as a harmless fallback in case a
    future/DLC bank turns out to be keyed.
    """
    acb_name = bank_logical + ".acb"
    awb_name = bank_logical + ".awb"
    base = safe(os.path.basename(bank_logical))
    staged_acb = None
    staged_awb = None

    if acb_name in name_to_hash:
        acb_src = disk_path(name_to_hash[acb_name])
        if os.path.isfile(acb_src):
            staged_acb = os.path.join(WORK, base + ".acb")
            shutil.copyfile(acb_src, staged_acb)

    if awb_name in name_to_hash:
        awb_src = disk_path(name_to_hash[awb_name])
        if os.path.isfile(awb_src):
            staged_awb = os.path.join(WORK, base + ".awb")
            shutil.copyfile(awb_src, staged_awb)

    if staged_acb is None and staged_awb is None:
        return None

    with open(os.path.join(WORK, base + ".hcakey"), "w") as f:
        f.write(HCA_KEY_HEX)

    return staged_awb or staged_acb


def vgmstream_meta(staged_file):
    """Return list of (subsong_index, stream_name, seconds) via -m -S 0.
    Each subsong's block in the output starts with a repeated
    'metadata for <path>' header line (measured with vgmstream r2117), so we
    split on that instead of relying on an (often absent, for single-subsong
    files) 'stream index:' line."""
    try:
        p = subprocess.run(
            [VGMSTREAM, "-S", "0", "-m", staged_file],
            capture_output=True, text=True, timeout=120
        )
    except Exception as e:
        return [], str(e)
    out = p.stdout + p.stderr
    if "metadata for" not in out.lower():
        return [], out.strip()[-2000:]

    blocks = re.split(r"(?=^metadata for )", out, flags=re.I | re.M)
    results = []
    next_idx = 1
    for block in blocks:
        if "metadata for" not in block.lower():
            continue
        m_idx = re.search(r"^stream index:\s*(\d+)", block, re.I | re.M)
        idx = int(m_idx.group(1)) if m_idx else next_idx
        m_name = re.search(r"^stream name:\s*(.*)$", block, re.I | re.M)
        name = m_name.group(1).strip() if m_name else ""
        secs = 0.0
        # duration is printed as "(M:SS.mmm seconds)" -- capture the mm:ss.mmm
        # form (a bare "[\d.]+ seconds" regex misses the colon and silently
        # returns 0.0, which is what an earlier version of this script did).
        m_secs = re.search(r"\((\d+):(\d+(?:\.\d+)?)\s*seconds\)", block)
        if m_secs:
            secs = int(m_secs.group(1)) * 60 + float(m_secs.group(2))
        results.append((idx, name, secs))
        next_idx = idx + 1
    return results, out


def short_name(name, limit=40):
    """Sanitize a (possibly multi-cue, semicolon-joined) stream name into a
    filesystem-safe, length-capped token. MEASURED: some banks (e.g.
    snd_bgm_gm013) have 20+ cue aliases joined with '; ' on one subsong;
    using the raw name in a filename blows past Windows MAX_PATH and
    vgmstream's -o then fails with 'failed to open ... for output'. So we
    take only the first alias and cap length."""
    first = re.split(r"\s*;\s*", name.strip())[0] if name else ""
    first = safe(first)[:limit].strip("_")
    return first


def vgmstream_decode_all(staged_file, subsongs, out_dir, prefix, single_name_only=False):
    """Decode every subsong individually (via -s <idx>) to
    out_dir/<prefix>_<idx>_<short_name>.wav (or out_dir/<prefix>.wav when
    there is exactly one subsong and single_name_only=True). Per-subsong -s
    decode (rather than -S 0 with a ?n template) lets us sanitize/cap the
    output filename ourselves -- needed because raw cue names can be long
    semicolon-joined lists that overflow Windows MAX_PATH."""
    os.makedirs(out_dir, exist_ok=True)
    ok = 0
    logs = []
    for idx, name, secs in subsongs:
        if len(subsongs) == 1 and single_name_only:
            fn = "%s.wav" % prefix
        else:
            nm = short_name(name) or "track"
            fn = "%s_%02d_%s.wav" % (prefix, idx, nm)
        out_path = os.path.join(out_dir, fn)
        try:
            p = subprocess.run(
                [VGMSTREAM, "-s", str(idx), "-o", out_path, staged_file],
                capture_output=True, text=True, timeout=120
            )
            logs.append(p.stdout + p.stderr)
            if p.returncode == 0 and os.path.isfile(out_path):
                ok += 1
        except Exception as e:
            logs.append(str(e))
    return ok, "\n".join(logs)


# ---------------------------------------------------------------------------
# 3. Catalog pass: every sound/s/ bank matching keywords, + full sound/b/ list.
# ---------------------------------------------------------------------------
KEYWORDS = ["ui", "jingle", "se_", "sys", "training", "gacha", "result",
            "fanfare", "cheer", "skill"]

sfx_bank_names = sorted({
    n[:-4] for n in name_to_hash
    if n.startswith("sound/s/") and n.endswith(".acb")
})
sfx_catalog_banks = [
    b for b in sfx_bank_names
    if any(kw in os.path.basename(b).lower() for kw in KEYWORDS)
]

bgm_bank_names = sorted({
    n[:-4] for n in name_to_hash
    if n.startswith("sound/b/") and n.endswith(".acb")
})

print("sfx banks matching keywords:", len(sfx_catalog_banks))
print("bgm banks total:", len(bgm_bank_names))

catalog_rows = []  # (bank, idx, name, seconds)
fail_lines = []

def catalog_bank(bank, list_only):
    staged = stage_pair(bank)
    if staged is None:
        fail_lines.append("MISSING acb on disk: %s" % bank)
        return
    subsongs, raw = vgmstream_meta(staged)
    if not subsongs:
        fail_lines.append("NO SUBSONGS for %s :: %s" % (bank, raw[-500:]))
        return
    for idx, name, secs in subsongs:
        catalog_rows.append((bank, idx, name, secs))


print("Cataloging sound/s/ keyword banks (metadata only)...")
for b in sfx_catalog_banks:
    catalog_bank(b, list_only=True)

print("Cataloging sound/b/ BGM banks (metadata only, this is slow: %d banks)..." % len(bgm_bank_names))
for i, b in enumerate(bgm_bank_names):
    catalog_bank(b, list_only=True)
    if i % 50 == 0:
        print("  ...", i, "/", len(bgm_bank_names))

with io.open(CATALOG_TSV, "w", encoding="utf-8") as f:
    f.write("bank\tsubsong_index\tstream_name\tseconds\n")
    for bank, idx, name, secs in catalog_rows:
        f.write("%s\t%s\t%s\t%.3f\n" % (bank, idx, name, secs))
print("wrote", CATALOG_TSV, "rows:", len(catalog_rows))

# ---------------------------------------------------------------------------
# 4. Decode pass: SFX target banks -> D:\uma-ref\sfx\<bank>\<idx>_<name>.wav
# ---------------------------------------------------------------------------
print("Decoding target SFX banks...")
for bank in SFX_DECODE_BANKS:
    staged = stage_pair(bank)
    bank_short = os.path.basename(bank)
    if staged is None:
        fail_lines.append("DECODE MISSING acb/awb: %s" % bank)
        continue
    subsongs, raw = vgmstream_meta(staged)
    if not subsongs:
        fail_lines.append("DECODE NO SUBSONGS %s :: %s" % (bank, raw[-500:]))
        continue
    out_dir = os.path.join(OUT_SFX, bank_short)
    n_out, log = vgmstream_decode_all(staged, subsongs, out_dir, bank_short)
    if n_out == 0:
        fail_lines.append("DECODE FAIL %s (0/%d wavs): %s" % (bank, len(subsongs), log[-800:]))
        continue
    if n_out < len(subsongs):
        fail_lines.append("DECODE PARTIAL %s (%d/%d wavs)" % (bank, n_out, len(subsongs)))
    print("  decoded", bank, "->", out_dir, "(%d/%d files)" % (n_out, len(subsongs)))

# ---------------------------------------------------------------------------
# 5. Decode pass: BGM target banks -> D:\uma-ref\bgm\<bank>[_idx_name].wav
# ---------------------------------------------------------------------------
print("Decoding target BGM banks...")
for bank in BGM_DECODE_BANKS:
    staged = stage_pair(bank)
    bank_short = os.path.basename(bank)
    if staged is None:
        fail_lines.append("DECODE MISSING acb/awb: %s" % bank)
        continue
    subsongs, raw = vgmstream_meta(staged)
    if not subsongs:
        fail_lines.append("DECODE NO SUBSONGS %s :: %s" % (bank, raw[-500:]))
        continue
    n_out, log = vgmstream_decode_all(staged, subsongs, OUT_BGM, bank_short, single_name_only=True)
    if n_out == 0:
        fail_lines.append("DECODE FAIL %s (0/%d wavs): %s" % (bank, len(subsongs), log[-800:]))
        continue
    if n_out < len(subsongs):
        fail_lines.append("DECODE PARTIAL %s (%d/%d wavs)" % (bank, n_out, len(subsongs)))
    print("  decoded", bank, "-> D:\\uma-ref\\bgm (%d/%d files)" % (n_out, len(subsongs)))

with io.open(FAIL_LOG, "w", encoding="utf-8") as f:
    for line in fail_lines:
        f.write(line + "\n")
print("wrote", FAIL_LOG, "failures:", len(fail_lines))
print("DONE")
