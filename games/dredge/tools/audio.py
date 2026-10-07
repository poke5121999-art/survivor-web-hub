# -*- coding: utf-8 -*-
"""Export every AudioClip of DREDGE, then build the remake's mp3 subset.

Run:    python -I audio.py [AA bundle dir] [ref dir] [repo dredge dir]
        (defaults: the Steam copy under D:\\dredge-ref\\game, D:\\dredge-ref, games/dredge next to this file)
Writes: <ref>/audio/<group>/<name>.ogg (all clips) + <ref>/audio/catalog.tsv
        <dredge>/audio/<category>/<name>.mp3 (subset) + <dredge>/data/audio.js (window.DR_AUDIO)
Rerunnable: the repo audio/ dir is rebuilt from scratch each run.
"""
import glob, io, json, os, re, shutil, subprocess, sys, wave
import UnityPy

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
AA = sys.argv[1] if len(sys.argv) > 1 else glob.glob(
    r"D:\dredge-ref\game\*\DREDGE_Data\StreamingAssets\aa\StandaloneWindows")[0]
REF = sys.argv[2] if len(sys.argv) > 2 else r"D:\dredge-ref"
DR = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(HERE)
OUT = os.path.join(REF, "audio")
REPO_AUDIO = os.path.join(DR, "audio")
FFMPEG = shutil.which("ffmpeg")
GROUPS = ["gameaudio", "vocals", "commonaudio", "titleaudio", "gamescene", "player"]
PREFIX = {"gamescene": "gamescene_scenes_all", "player": "player_assets_all"}

# ---- subset: key -> (category, name, loop, vol). name = container path under Assets/Audio/ without
# extension, or the bare clip name for scene/player clips (they have no container path).
S = []


def add(key, cat, name, loop=False, vol=0.8):
    S.append((key, cat, name, loop, vol))


# music: no per-region day/night overworld music exists in the build (only per-region stingers and
# ambiences), so regions get dock themes + stingers.
add("music.title", "music", "Music/Dredge Theme 1", True, 0.7)
add("music.paleReach", "music", "Music/Pale Reach Theme", True, 0.7)
add("music.ironRig", "music", "Music/Iron Rig Theme", True, 0.7)
add("music.collector", "music", "Music/Collector's Edition Theme", True, 0.7)
add("music.credits.good", "music", "Music/Good Ending Credits Theme", False, 0.7)
add("music.credits.bad", "music", "Music/Bad Ending Credits Theme", False, 0.7)
add("music.ending", "music", "EndingMusic2", False, 0.7)
add("music.musicbox", "music", "Music Box Song", True, 0.6)
for k, n in [("greaterMarrow", "Greater Marrow Dock Theme"), ("littleMarrow", "Little Marrow Dock Theme"),
             ("devilsSpine", "Devil's Spine Dock Theme"), ("stellarBasin", "Stellar Basin Dock Theme"),
             ("ingfell", "Ingfell Theme"), ("ruinedSettlement", "Ruined Settlement Dock Theme"),
             ("oldMayor", "Old Mayor's Theme"), ("collector", "Collector's Theme")]:
    add("music.dock." + k, "music", "Music/Dock Themes/" + n, True, 0.6)
for reg, folder, nm in [("marrows", "Marrows", "Marrows"), ("galeCliffs", "Gale Cliffs", "Gale Cliffs"),
                        ("stellarBasin", "Stellar Basin", "Stellar Basin"),
                        ("devilsSpine", "Devil's Spine", "Devil's Spine"),
                        ("paleReach", "The Pale Reach", "Pale Reach"),
                        ("twistedStrand", "Twisted Strand", "Twisted Strand")]:
    for i in (1, 2):
        add("music.stinger.%s.%d" % (reg, i), "music",
            "Music/Stingers/%s/%s Stinger %d" % (folder, nm, i), False, 0.7)
for i in (1, 2, 3, 4):  # panic / insanity layers
    add("music.insanity.%d" % i, "music", "Ambience/Insanity Layers/Insanity Ambience %d" % i, True, 0.5)

# ambience
add("ambience.sea", "ambience", "Ambience/Waves Ambience 1", True, 0.5)
add("ambience.seagulls", "ambience", "Ambience/Seagulls Ambience 1", True, 0.4)
add("ambience.waves.large", "ambience", "Ambience/Misc/Ambience Large Waves", True, 0.5)
add("ambience.waves.boat", "ambience", "Ambience/Misc/Ambience Waves Against Boat", True, 0.5)
add("ambience.boatWake", "ambience", "Ambience/Misc/Boat Wake", True, 0.5)
for k, n in [("rain.light", "Light Rain 1"), ("rain.normal", "Normal Rain 1"), ("rain.heavy", "Heavy Rain 1"),
             ("wind", "Windy"), ("snow.light", "Light Snow"), ("snow.heavy", "Heavy Snow"),
             ("aurora", "Aurora")]:
    add("weather." + k, "ambience", "Ambience/Weather/" + n, True, 0.5)
for i in (1, 2, 3):
    add("weather.thunder.%d" % i, "ambience", "Ambience/Weather/Thunder %d" % i, False, 0.8)
    add("weather.lightning.%d" % i, "ambience", "Ambience/Weather/Lightning_%d" % i, False, 0.8)
for k, n in [("marrows.day", "Blackstone Isle Day Undocked"),
             ("marrows.wildlife.day", "Marrows Undocked - Wildlife Ambience Day"),
             ("marrows.wildlife.night", "Marrows Undocked - Wildlife Ambience Night"),
             ("marrows.general", "Marrows Undocked - General Ambience")]:
    add("region." + k, "ambience", n, True, 0.5)
for k, n in [("galeCliffs.day", "Gale Cliffs/Gale Cliffs - Day Ambience"),
             ("galeCliffs.general", "Gale Cliffs/Gale Cliffs - General"),
             ("devilsSpine.day", "Devil's Spine/Devil's Spine - Ambience Day"),
             ("devilsSpine.general", "Devil's Spine/Devils Spine - Ambience General"),
             ("stellarBasin.general", "Stellar Basin/Stellar Basin Ambience - General"),
             ("stellarBasin.day", "Stellar Basin/Stellar Basin Ambience - Day Wildlife"),
             ("stellarBasin.night", "Stellar Basin/Stellar Basin Ambience - Night Birds"),
             ("twistedStrand.day", "Twisted Strand/Twisted Strand - Undocked Day"),
             ("twistedStrand.night", "Twisted Strand/Twisted Strand - Undocked Night")]:
    add("region." + k, "ambience", "Ambience/" + n, True, 0.5)
for k, n in [("greaterMarrow.day", "Marrows/Greater Marrow Dock Day"),
             ("greaterMarrow.night", "Marrows/Greater Marrow Dock Night"),
             ("littleMarrow.day", "Marrows/Little Marrow - Dock Day"),
             ("littleMarrow.night", "Marrows/Little Marrow - Dock Night"),
             ("ingfell.day", "Gale Cliffs/Ingfell - Dock Day"), ("ingfell.night", "Gale Cliffs/Ingfell - Dock Night")]:
    add("dock." + k, "ambience", "Ambience/" + n, True, 0.5)
# boat
for i in range(1, 6):
    add("boat.engine.%d" % i, "boat", "SFX/Engine%d" % i, True, 0.5)
add("boat.engine.loop", "boat", "SFX/Engine1", True, 0.5)
for i in range(1, 6):
    add("boat.impact.%d" % i, "boat", "SFX/impact-%d" % i)
add("boat.impact.safe", "boat", "SFX/impact-safe-1")
for i in range(1, 4):
    add("boat.splash.%d" % i, "boat", "SFX/splash-%d" % i, False, 0.6)
for k, n in [("break.engine", "SFX/break-engine"), ("break.light", "SFX/break-light"),
             ("break.rod", "SFX/break-rod"), ("light.on", "SFX/light-on"), ("light.off", "SFX/light-off"),
             ("horn.loop", "SFX/foghorn-loop"), ("horn.end", "SFX/foghorn-end"),
             ("horn.far.loop", "SFX/foghorn-loop-far"), ("horn.far.end", "SFX/foghorn-end-far"),
             ("dock.docked", "SFX/Docking - Docked"), ("dock.progress", "SFX/Docking - Progress"),
             ("dock.undocked", "SFX/Docking - Undocked"), ("fogRecede", "SFX/Fog Recede"),
             ("dynamite.rock", "SFX/Dynamite - Rock Wall"), ("dynamite.wood", "SFX/Dynamite - Wood Wall"),
             ("haste.kickoff", "SFX/Ability/Haste - Kickoff"), ("haste.loop", "SFX/Ability/Haste - Loop"),
             ("haste.explosion", "SFX/Ability/Haste - Engine Explosion"),
             ("spyglass.extend", "SFX/Ability/Spyglass - Extend"),
             ("spyglass.retract", "SFX/Ability/Spyglass - Retract"),
             ("fire.loop", "SFX/fire-crackle-loop"), ("fire.stress", "SFX/fire-stress-loop"),
             ("rocks.warning", "SFX/falling-rocks-warning"), ("rocks.fall", "SFX/falling-rocks")]:
    add("boat." + k, "boat", n, k.endswith("loop") or k.endswith("stress"), 0.7)

# fishing
add("fish.cast", "fishing", "SFX/Ability/Cast Ability - Bait")
add("fish.loop", "fishing", "SFX/fishing-loop", True, 0.6)
add("fish.end", "fishing", "SFX/fishing-end")
add("fish.minigame.success", "fishing", "SFX/UI/Minigame/Fishing/Fishing - Success")
add("fish.minigame.failure", "fishing", "SFX/UI/Minigame/Fishing/Fishing - Failure")
# the build has success/failure only; hit/miss are aliases so the game can use either vocabulary
add("fish.minigame.hit", "fishing", "SFX/UI/Minigame/Fishing/Fishing - Success")
add("fish.minigame.miss", "fishing", "SFX/UI/Minigame/Fishing/Fishing - Failure")
add("fish.dredge.loop", "fishing", "SFX/UI/Minigame/Dredging/Dredging - Loop", True, 0.6)
add("fish.dredge.hitNotch", "fishing", "SFX/UI/Minigame/Dredging/Dredging - HitNotch")
add("fish.dredge.changeLane", "fishing", "SFX/UI/Minigame/Dredging/Dredging - ChangeLane")
add("fish.dredge.complete", "fishing", "SFX/UI/Minigame/Dredging/Dredging - Complete")
add("fish.new", "fishing", "SFX/UI/Fish - New")
add("fish.new.aberration", "fishing", "SFX/UI/Fish - New Aberration")
for sz in ("Small", "Medium", "Large"):
    add("fish.spot.%s" % sz.lower(), "fishing", "SFX/Harvest Spots/Harvest Spot - %s Fish 1" % sz)
add("fish.spot.material", "fishing", "SFX/Harvest Spots/Harvest Spot - Material 1")
add("fish.spot.relic", "fishing", "SFX/Harvest Spots/Harvest Spot - Relic 1")
add("fish.spot.trinket", "fishing", "SFX/Harvest Spots/Harvest Spot - Trinkets 1")
for k, n in [("deploy", "Trawl Net - Deploy"), ("caught", "Trawl Net - Fish Caught"),
             ("broken", "Trawl Net - Net Broken"), ("retract", "Trawl Net - Retract")]:
    add("fish.trawl." + k, "fishing", "SFX/Ability/" + n)
add("fish.crabpot.deploy", "fishing", "SFX/Ability/Crab Pot - Deploy")
add("fish.crabpot.open", "fishing", "SFX/Crab Pot - Open")
add("fish.crabpot.pickup", "fishing", "SFX/Crab Pot - Pick up")
add("fish.camera.capture", "fishing", "Camera Ability - Capture 1_1")

# ui
G = "SFX/UI/Grid Objects/"
for k, n in [("pick.organic", "Organic Item - Pick up"), ("place.organic", "Organic Item - Place"),
             ("drop.organic", "Organic Item - Drop"), ("pick.inorganic", "Inorganic Item - Pick up"),
             ("place.inorganic", "Inorganic Item - Place"), ("drop.inorganic", "Inorganic Item - Drop"),
             ("pick.trinket", "Trinket Item - Pickup"), ("place.trinket", "Trinket Item - Place"),
             ("discard.trinket", "Trinket Item - Discard"), ("pick.aberration", "Aberration - Pick up"),
             ("pick.relic", "Relic Ring Pickup"), ("place.relic", "Relic Ring Place"),
             ("pick.person", "Person - Pickup"), ("place.person", "Person - Place"),
             ("equip.install", "Equipment - Install"), ("equip.uninstall", "Equipment - Uninstall"),
             ("rotate", "rotate"), ("error", "item-place-error")]:
    add("ui.grid." + k, "ui", G + n, False, 0.7)
add("ui.grid.pick", "ui", G + "Organic Item - Pick up", False, 0.7)
add("ui.grid.place", "ui", G + "Organic Item - Place", False, 0.7)
add("ui.grid.open", "ui", "SFX/UI/Generic Grid Open Sound")
for i in (1, 2, 3):
    add("ui.sell.%d" % i, "ui", "SFX/item-sold-%d" % i)
add("ui.sell", "ui", "SFX/item-sold-1")
add("ui.buy", "ui", "SFX/Item-bought-1")
for k, n in [("money.gain", "Money - Gained"), ("money.spend", "Money - Spent"),
             ("generic", "Notification - Generic"), ("itemRemoved", "Notification - Item Removed"),
             ("parasite", "Notification - Parasite"), ("book.added", "Book - Added"),
             ("book.complete", "Book - Complete")]:
    add("ui.notify." + k, "ui", "SFX/UI/Notification/" + n)
for k, n in [("button.select", "select"), ("button.submit", "submit"), ("button.back", "click-back"),
             ("error", "error-1"), ("chime.1", "chime-1"), ("chime.2", "chime-2"), ("chime.3", "chime-3"),
             ("research.spend", "spend-research")]:
    add("ui." + k, "ui", "SFX/" + n)
for k, n in [("journal.open", "Encyclopedia - Open"), ("journal.close", "Encyclopedia - Close"),
             ("journal.page.1", "Encyclopedia - Turn Page 1"), ("journal.page.2", "Encyclopedia - Turn Page 2"),
             ("map.open", "Map - Open"), ("map.close", "Map - Close"),
             ("messages.open", "Messages - Open"), ("messages.close", "Messages - Close"),
             ("pursuit.update", "Pursuit - Updated"), ("pursuit.complete", "Pursuit - Completed"),
             ("research.complete", "Research - Complete"), ("upgrade.complete", "Upgrade - Complete"),
             ("hold.active", "Hold - Active"), ("hold.complete", "Hold - Complete"),
             ("passTime.loop", "Pass Time - Loop"), ("passTime.complete", "Pass Time - Complete"),
             ("radial.appear", "Radial/Radial Menu - Appear"), ("radial.select", "Radial/Radial Menu - Select")]:
    add("ui." + k, "ui", "SFX/UI/" + n, k.endswith("loop"))

# monsters: a few per monster
M = "SFX/Monster/"
for k, n in [("marrow.call", "Marrow/Marrow Monster - Call 1"), ("marrow.attack", "Marrow/Marrow Monster - Attack"),
             ("marrow.aggro", "Marrow/Marrow Monster - Aggro Loop"),
             ("marrow.idle", "Marrow/Marrow Monster - Idle Loop"),
             ("marrow.retreat", "Marrow/Marrow Monster - Retreat"),
             ("gale.call", "Gale Cliffs/Gale Cliffs Monster - Aggro Call 1"),
             ("gale.attack", "Gale Cliffs/Gale Cliffs Monster - Attack"),
             ("gale.idle", "Gale Cliffs/Gale Cliffs Monster - Idle Loop"),
             ("gale.banished", "Gale Cliffs/Gale Cliffs Monster - Banished"),
             ("stellar.emerge", "Stellar Basin/Stellar Basin Monster - Emerge"),
             ("stellar.attack", "Stellar Basin/Stellar Basin Monster - Attack 1"),
             ("stellar.call", "Stellar Basin/Stellar Basin Monster - Call 1"),
             ("stellar.banish", "Stellar Basin/Stellar Basin Monster - Banish"),
             ("spine.attack", "Devil's Spine/Devil's Spine Monster - Mother Attack"),
             ("spine.idle", "Devil's Spine/Devil's Spine Monster - Mother Idle Call"),
             ("spine.latch", "Devil's Spine/Devil's Spine Monster - Latch On"),
             ("spine.baby", "Devil's Spine/Devil's Spine Monster - Baby Latched Call 1"),
             ("narwhal.call", "The Pale Reach/Narwhal - Call 1"), ("narwhal.jump", "The Pale Reach/Narwhal - Jump"),
             ("narwhal.spawn", "The Pale Reach/Narwhal - Spawn"),
             ("strand.emerge", "Twisted Strand/Twisted Strand Monster - Emerge Call 1"),
             ("strand.splash", "Twisted Strand/Twisted Strand Monster - Emerge Splash 1"),
             ("strand.scan", "Twisted Strand/Twisted Strand Monster - Scan"),
             ("strand.trapped", "Twisted Strand/Twisted Strand Monster - Trapped 1")]:
    add("monster." + k, "monsters", M + n, "Loop" in n, 0.8)
for k, n in [("giant.call", "Giant Monster - Call 1_2"), ("giant.reveal", "Giant Monster - Reveal_2"),
             ("wreck.emerge", "WreckMonsterEmerge"), ("wreck.attack", "WreckMonsterAttack1"),
             ("marrow.call2", "Marrow Monster - Call 2"), ("marrow.aggroCall", "Marrow Monster - Aggro Call 1")]:
    add("monster." + k, "monsters", n, False, 0.8)
for k, n in [("generic.attackSmall", "monster-attack-small-1"), ("generic.loop", "monster-loop"),
             ("generic.splash", "monster-splash"), ("tentacle", "tentacle-attack"),
             ("whale.sighting", "whale-sighting"), ("whispers", "whispering-sounds"),
             ("ravens", "Raven Swarm Loop"), ("tremor", "World Tremor 1")]:
    add("monster." + k, "monsters", "SFX/" + n, "loop" in n.lower() or k == "whispers", 0.7)
add("monster.bluewhale.call", "monsters", "SFX/World Event/Blue Whale/Blue Whale - Call 1")
add("monster.crocodile.call", "monsters", "SFX/World Event/Crocodile/Crocodile - Call 1")
add("monster.dolphin.call", "monsters", "SFX/World Event/Dolphin/Dolphin Pod - Call 1")

# vocals: up to three evenly spaced barks for each main NPC; clip names are "<NPC> - <bark>"
NPCS = [("courier", "Courier"), ("collector", "Collector"), ("fishmonger", "Fishmonger"), ("mayor", "Mayor"),
        ("researcher", "Researcher"), ("trader", "Trader"), ("painter", "Painter"), ("builder", "Builder"),
        ("pilot", "Pilot"), ("merchant", "Travelling Merchant")]


# Budget: the repo audio/ dir must stay under 25 MB, so long loops/themes are cut to a cap (seconds)
# with a short fade at both ends to hide the seam; the real length stays in the ogg export.
CAP = {"music": 50, "ambience": 30, "stinger": 15, "insanity": 30}


def cap_for(key, cat):
    if key.startswith("music.stinger"):
        return CAP["stinger"]
    if key.startswith("music.insanity"):
        return CAP["insanity"]
    return CAP.get(cat)


def loop_hint(name):
    return bool(re.search(r"loop|ambience|drone", name, re.I))


def safe(n):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", n).strip("_")


XF = 2.0


def ffenc(wav, dst, args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", "pipe:0"] + args + [dst],
                   input=wav, check=True)


def main():
    if not FFMPEG:
        raise SystemExit("ffmpeg not found on PATH")
    idx = json.load(open(os.path.join(REF, "cache", "bundle_index.json"), encoding="utf-8"))
    cont = {}
    for path, v in idx["containers"].items():
        if v["type"] == "AudioClip":
            cont[(v["bundle"], v["path_id"])] = path
    if os.path.isdir(REPO_AUDIO):
        shutil.rmtree(REPO_AUDIO)
    # collect all clips first so vocals can be picked evenly by sorted name
    rows = []
    for g in GROUPS:
        f = glob.glob(os.path.join(AA, (PREFIX.get(g) or g + "_assets_all") + "_*.bundle"))[0]
        env = UnityPy.load(f)
        for o in env.objects:
            if o.type.name == "AudioClip":
                c = o.read()
                bn = os.path.basename(f)
                rows.append(dict(group=g, clip=c, name=c.m_Name, container=cont.get((bn, o.path_id), "")))
    byrel = {}
    for r in rows:
        r["rel"] = r["container"][len("Assets/Audio/"):].rsplit(".", 1)[0] if r["container"] else r["name"]
        byrel[r["rel"]] = r
    wanted = {}  # rel -> [(key, cat, loop, vol)]
    problems = []
    for key, cat, name, loop, vol in S:
        if name not in byrel:
            problems.append("missing clip for %s: %s" % (key, name))
            continue
        wanted.setdefault(name, []).append((key, cat, loop, vol))
    voc = sorted((r for r in rows if r["group"] == "vocals"), key=lambda r: r["rel"])
    for k, npc in NPCS:
        mine = [r for r in voc if os.path.basename(r["rel"]).startswith(npc + " - ")]
        if not mine:
            problems.append("no vocals for " + npc)
            continue
        for j, i in enumerate(sorted({0, len(mine) // 2, len(mine) - 1})):
            wanted.setdefault(mine[i]["rel"], []).append(("vocal.%s.%d" % (k, j + 1), "vocals", False, 0.9))

    cat_rows, used, failed, seen, audio = [], {}, [], {}, {}
    for r in rows:
        g, n = r["group"], r["name"]
        stem = safe(n)
        seen[(g, stem)] = seen.get((g, stem), 0) + 1
        if seen[(g, stem)] > 1:
            stem += "_%d" % seen[(g, stem)]
        try:
            wav = list(r["clip"].samples.values())[0]
            w = wave.open(io.BytesIO(wav))
            ch, rate, dur = w.getnchannels(), w.getframerate(), w.getnframes() / float(w.getframerate())
            os.makedirs(os.path.join(OUT, g), exist_ok=True)
            if not os.path.exists(os.path.join(OUT, g, stem + ".ogg")):  # export is deterministic; skip on rerun
                ffenc(wav, os.path.join(OUT, g, stem + ".ogg"), ["-c:a", "libvorbis", "-q:a", "6"])
        except Exception as e:  # noqa: BLE001 - keep going, report at the end
            failed.append((g, n, repr(e)[:120]))
            continue
        cat_rows.append((g, r["container"] or "(scene/player: no container)", n, "%.2f" % dur, ch, rate,
                         "loop" if loop_hint(n) else ""))
        for key, cat, loop, vol in wanted.get(r["rel"], []):
            if r["rel"] not in used:
                if cat == "music" and not key.startswith("music.insanity"):
                    enc = ["-ac", "2", "-b:a", "96k"]
                else:
                    enc = ["-ac", "1", "-b:a", "48k" if cat == "ambience" or key.startswith("music.insanity") else "64k"]
                cap = cap_for(key, cat)
                if cap and dur > cap + 1 and loop and dur > cap + XF:
                    # A fade-out at the seam dips the volume every lap; instead crossfade the tail
                    # [cap, cap+XF] into the head [0, XF] so the last sample flows into the first.
                    enc += ["-filter_complex",
                            "[0:a]asplit[x][y];"
                            "[x]atrim=start=%s:end=%s,asetpts=PTS-STARTPTS[body];"
                            "[y]atrim=start=0:end=%s,asetpts=PTS-STARTPTS[head];"
                            "[body][head]acrossfade=d=%s:c1=tri:c2=tri[out]" % (XF, cap + XF, XF, XF),
                            "-map", "[out]"]
                    dur_out = float(cap)
                elif cap and dur > cap + 1:
                    enc += ["-t", str(cap), "-af", "afade=t=in:d=0.5,afade=t=out:st=%s:d=1.5" % (cap - 1.5)]
                    dur_out = float(cap)
                else:
                    dur_out = dur
                os.makedirs(os.path.join(REPO_AUDIO, cat), exist_ok=True)
                ffenc(wav, os.path.join(REPO_AUDIO, cat, stem + ".mp3"), ["-c:a", "libmp3lame"] + enc)
                used[r["rel"]] = (cat, stem, dur_out)
            c2, s2, d2 = used[r["rel"]]
            audio[key] = dict(src="audio/%s/%s.mp3" % (c2, s2), loop=loop, vol=vol, dur=round(d2, 2),
                              orig=r["container"] or n)
    cat_rows.sort(key=lambda t: (GROUPS.index(t[0]), t[1], t[2]))
    with io.open(os.path.join(OUT, "catalog.tsv"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("group\tcontainer\tname\tduration_s\tchannels\trate\tloop_hint\n")
        for t in cat_rows:
            fh.write("\t".join(str(x) for x in t) + "\n")
    os.makedirs(os.path.join(DR, "data"), exist_ok=True)
    with io.open(os.path.join(DR, "data", "audio.js"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("// generated by tools/audio.py - do not edit\nwindow.DR_AUDIO = {\n")
        items = sorted(audio.items())
        for i, (k, v) in enumerate(items):
            fh.write("  %s: %s%s\n" % (json.dumps(k), json.dumps(v, ensure_ascii=False),
                                       "," if i < len(items) - 1 else ""))
        fh.write("};\n")
    print("exported", len(cat_rows), "of", len(rows), "| failed", len(failed), "| subset files", len(used),
          "| keys", len(audio))
    for f in failed:
        print("FAILED", f)
    for p in problems:
        print("PROBLEM", p)


main()
