# -*- coding: utf-8 -*-
"""Export every AudioClip of DREDGE, then build the remake's mp3 subset.

Run:    python -I audio.py [AA bundle dir] [ref dir] [repo dredge dir]
        (defaults: the Steam copy under D:\\dredge-ref\\game, D:\\dredge-ref, games/dredge next to this file)
Writes: <ref>/audio/<group>/<name>.ogg (all clips) + <ref>/audio/catalog.tsv
        <dredge>/audio/<category>/<name>.mp3 (subset) + <dredge>/data/audio.js (window.DR_AUDIO)
Rerunnable: the repo audio/ dir is rebuilt from scratch each run.
Round 2 (sfx owner): clips the web code calls by ORIGINAL name (js/*.js call DRAudio.play('Dog - Pick Up 1')) are looked up by
clip basename (N(...)), so a name typo shows up as PROBLEM. The cost of each group is printed at the end (budget: +10 MB).
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
# prof = encoding profile of PROF (None = the old rule by category), cap = seconds (None = profile default),
# bus = mixer group of the original (js/sfx.js sets the gain of that bus from DR_SFX.mixer).
S = []
SN = []   # same, but the clip is looked up by basename (N): no need to type the container path
GROUP = ["base"]  # group label for the cost report


def add(key, cat, name, loop=False, vol=0.8, prof=None, cap=None, bus=None):
    S.append((key, cat, name, loop, vol, prof, cap, bus, GROUP[0]))


def N(key, cat, base, loop=False, vol=0.8, prof=None, cap=None, bus=None, sub=None):
    SN.append((key, cat, base, loop, vol, prof, cap, bus, GROUP[0], sub))


# encoding profiles: (ffmpeg args, cap in seconds or None). Loops are cut to the cap with a 2 s crossfade; one-shots with fades.
PROF = {
    "sfx": (["-ac", "1", "-b:a", "64k"], None),
    "amb": (["-ac", "1", "-b:a", "48k"], 30),
    "amb32": (["-ac", "1", "-b:a", "32k"], 20),     # long background beds without voice: 32 kb/s mono is enough
    "sting": (["-ac", "1", "-b:a", "64k"], 15),     # music sting: mono 64k, first 15 s (the original runs 20-55 s)
    "music": (["-ac", "2", "-b:a", "96k"], 50),
    "musicLite": (["-ac", "1", "-b:a", "56k"], 40),
}


# music: no per-region day/night overworld music exists in the build (only per-region stingers and
# ambiences), so regions get dock themes + stingers.
add("music.title", "music", "Music/Dredge Theme 1", True, 0.7, bus="Music_Menu")
add("music.paleReach", "music", "Music/Pale Reach Theme", True, 0.7, bus="Music_Menu")
add("music.ironRig", "music", "Music/Iron Rig Theme", True, 0.7, bus="Music_Menu")
add("music.collector", "music", "Music/Collector's Edition Theme", True, 0.7, bus="Music_Menu")
add("music.credits.good", "music", "Music/Good Ending Credits Theme", False, 0.7)
add("music.credits.bad", "music", "Music/Bad Ending Credits Theme", False, 0.7)
add("music.ending", "music", "EndingMusic2", False, 0.7)
add("music.musicbox", "music", "Music Box Song", True, 0.6)
for k, n in [("greaterMarrow", "Greater Marrow Dock Theme"), ("littleMarrow", "Little Marrow Dock Theme"),
             ("devilsSpine", "Devil's Spine Dock Theme"), ("stellarBasin", "Stellar Basin Dock Theme"),
             ("ingfell", "Ingfell Theme"), ("ruinedSettlement", "Ruined Settlement Dock Theme"),
             ("oldMayor", "Old Mayor's Theme"), ("collector", "Collector's Theme")]:
    add("music.dock." + k, "music", "Music/Dock Themes/" + n, True, 0.6, bus="Music_Dock")
GROUP[0] = "p3-stinger"
for reg, folder, nm, n in [("marrows", "Marrows", "Marrows", 6), ("galeCliffs", "Gale Cliffs", "Gale Cliffs", 7),
                           ("stellarBasin", "Stellar Basin", "Stellar Basin", 7),
                           ("devilsSpine", "Devil's Spine", "Devil's Spine", 7),
                           ("twistedStrand", "Twisted Strand", "Twisted Strand", 7)]:
    for i in range(1, n + 1):  # StingerAudio.stingerAssetReferences (Game.unity &124184): 6-7 clips per zone
        add("music.stinger.%s.%d" % (reg, i), "music",
            "Music/Stingers/%s/%s Stinger %d" % (folder, nm, i), False, 0.7, prof="sting", bus="Music_Stinger")
GROUP[0] = "base"
for i in (1, 2, 3, 4):  # panic / insanity layers
    add("music.insanity.%d" % i, "music", "Ambience/Insanity Layers/Insanity Ambience %d" % i, True, 0.5, bus="InsanitySFX")

# ambience
# 'Waves Ambience 1' sits on no AudioSource/prefab/scene of the original and GameSceneAudio/SeagullAmbience is inactive in
# Game.unity, so the web's old always-on sea loop and proximity seagulls were not original: removed (SFX-08, round 2).
add("ambience.waves.large", "ambience", "Ambience/Misc/Ambience Large Waves", True, 0.5)
add("ambience.title", "ambience", "Ambience/Misc/Ambience Large Waves", True, 0.5)  # Title.unity plays this clip
add("ambience.waves.boat", "ambience", "Ambience/Misc/Ambience Waves Against Boat", True, 0.5)
add("ambience.boatWake", "ambience", "Ambience/Misc/Boat Wake", True, 0.5)
for k, n in [("rain.light", "Light Rain 1"), ("rain.normal", "Normal Rain 1"), ("rain.heavy", "Heavy Rain 1"),
             ("wind", "Windy"), ("snow.light", "Light Snow"), ("snow.heavy", "Heavy Snow"),
             ("aurora", "Aurora")]:
    add("weather." + k, "ambience", "Ambience/Weather/" + n, True, 0.5, bus="Weather")
for i in (1, 2, 3):
    add("weather.thunder.%d" % i, "ambience", "Ambience/Weather/Thunder %d" % i, False, 0.8, bus="Weather")
    add("weather.lightning.%d" % i, "ambience", "Ambience/Weather/Lightning_%d" % i, False, 0.8, bus="Weather")
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
    add("dock." + k, "ambience", "Ambience/" + n, True, 0.5, bus="DayDockAmbience" if k.endswith(".day") else "NightDockAmbience")
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

# vocals: the 30 'vocal.<npc>.n' keys had no caller (dialogue plays art/portraits/vox, built by yarn.py): dropped, SFX-23.


# ======================================================================================================
# Vòng 2 (chủ tiếng): clip mà mã web gọi bằng TÊN GỐC (DRAudio.play('Dog - Pick Up 1')) hoặc mà js/sfx.js cần.
# N(khoá, loại, tên clip gốc ...) tra clip theo tên tệp; PROBLEM nghĩa là gõ sai tên hoặc trùng tên.
# Ưu tiên khi hết ngân sách (+10 MB): nối dây P0 (không tốn) > P1 > P2 > nhạc chớp mono 64k > nhạc bến.
# ======================================================================================================
GROUP[0] = "p1-fishing"
for k, lab in [("small", "Small Fish"), ("medium", "Medium Fish"), ("large", "Large Fish"), ("trinket", "Trinkets"),
               ("material", "Material"), ("relic", "Relic")]:
    for i in (2, 3):   # HarvestPOIHandler: mỗi loại 3 biến thể, chọn ngẫu nhiên (fish.spot.<loại> là biến thể 1)
        N("fish.spot.%s.%d" % (k, i), "fishing", "Harvest Spot - %s %d" % (lab, i))

GROUP[0] = "p1-grid"
for k, n in [("dog.1", "Dog - Pick Up 1"), ("dog.2", "Dog - Pick Up 2"), ("dog.3", "Dog - Pick Up 3"),
             ("relic.key.pick", "Relic Key Pickup"), ("relic.key.place", "Relic Key Place"),
             ("relic.musicbox.pick", "Relic Musicbox Pickup"), ("relic.musicbox.place", "Relic Musicbox Place"),
             ("relic.necklace.pick", "Relic Necklace Pickup"),
             ("relic.necklace.place", "Relic Necklance Place"),   # tên gốc viết sai chính tả ("Necklance")
             ("relic.pocketwatch.pick", "Relic Pocketwatch Pickup"), ("relic.pocketwatch.place", "Relic Pocketwatch Place"),
             ("icestone.pick", "Ice Stone - Pick up"), ("icestone.place", "Ice Stone - Place"),
             ("darksplash.1", "Dark Splash-001"), ("darksplash.2", "Dark Splash-002"), ("darksplash.3", "Dark Splash-003"),
             ("kit.repair", "Repair Kit"), ("kit.sanity", "Sanity Kit"), ("kit.crabpot", "Crabpot Kit")]:
    N("ui.grid." + k, "ui", n, vol=0.7)

GROUP[0] = "p1-window"
for k, n in [("ui.pursuits.open", "Pursuits - Open"), ("ui.pursuits.close", "Pursuits - Close"),
             ("ui.pursuits.open.one", "Pursuits - Open Individual"), ("ui.pursuits.close.one", "Pursuits - Close Individual"),
             ("ui.messages.open.one", "Messages - Open Individual"), ("ui.messages.close.one", "Messages - Close Individual"),
             ("ui.journal.page.3", "Encyclopedia - Turn Page 3"), ("ui.radial.close", "Radial Menu - Disappear")]:
    N(k, "ui", n, vol=0.8)

GROUP[0] = "p1-ability"
for k, n in [("boat.horn.adv", "Advanced Foghorn Ability"), ("boat.horn.adv.ping", "Advanced Foghorn Ping"),
             ("boat.light.adv.on", "Advanced Lights On"), ("boat.light.adv.off", "Advanced Lights Off"),
             ("boat.spyglass.adv.extend", "Advanced Spyglass Extend"), ("boat.spyglass.adv.retract", "Advanced Spyglass Retract"),
             ("boat.spyglass.adv.pin", "Advanced Spyglass Place Pin"), ("boat.spyglass.adv.unpin", "Advanced Spyglass Remove Pin"),
             ("boat.banish.snuff", "Banish - Snuff Only"), ("boat.atrophy.cast", "Atrophy - Cast"),
             ("boat.teleport", "Manifest"), ("fish.camera.open", "Camera Ability - Open_1"),
             ("fish.camera.close", "Camera Ability - Close_1"), ("fish.camera.capture.2", "Camera Ability - Capture 2_1"),
             ("fish.camera.capture.3", "Camera Ability - Capture 3_1"), ("fish.material.deploy", "Material Net Deploy"),
             ("fish.material.retract", "Material Net Retract"), ("fish.material.caught", "Material Net Caught")]:
    N(k, "boat" if k.startswith("boat.") else "fishing", n, vol=0.7)
# vòng lặp của năng lực: cắt 15 s, nối đuôi vào đầu
N("boat.banish.loop", "boat", "Banish - No Snuff", True, 0.7, prof="amb32", cap=15)
N("boat.atrophy.loop", "boat", "Atrophy - Loop", True, 0.7, prof="amb32", cap=15)
N("boat.haste.overheat", "boat", "Haste - Overheat Loop", True, 0.7, prof="amb32", cap=15)
# Tên clip mà nhánh khác gọi bằng tên gốc (gear: lưới hút bùn của TrawlNetAbility; fishing: cổng xoắn trong harvest_ui.js)
for k, n in [("ooze.activate", "Ooze Vacuum Activate"), ("ooze.retract", "Ooze Vacuum Retract"),
             ("fish.doors.open", "Fishing Minigame Doors Open"), ("fish.doors.close", "Fishing Minigame Doors Close"),
             ("fish.doors.hit", "Fishing Minigame Doors Closed Hit")]:
    N(k if k.startswith("fish.") else "fish." + k, "fishing", n, vol=0.7)
for k, n in [("fish.ooze.passive", "Ooze Vacuum Passive Loop"), ("fish.ooze.active", "Ooze Vacuum Active Loop")]:
    N(k, "fishing", n, True, 0.7, prof="amb32", cap=15)

GROUP[0] = "p2-story"
# 26 clip của lệnh Yarn PlayClip / PlayLoopingDialogueAudio (census: cmd). Vòng lặp = PlayLoopingDialogueAudio.
for n in ["fishmonger-door-slam", "collector-page-turn", "collector-ability-unlock", "mirror-shatter", "tir-leviathan-roar",
          "Frozen_Soul_Smash", "Ice_Shaper_Cut", "mystical-fire-ignite", "lighthouse-sweep", "Adjust_Bunting_Off",
          "Adjust_Bunting_On", "Paint_Boat", "Grind_Crabs", "Change_Flag", "scientist-reveal", "scientist-crunch",
          "scientist-screech", "Bait_Mixed", "generator-startup"]:
    N("story." + n.lower(), "story", n, vol=0.8)
for n in ["generator-ambience", "beacon-activated", "beacon-unactivated", "mystical-fire-loop", "cultist-ambience",
          "scientist-loop", "airman-ambience"]:
    N("story." + n.lower(), "story", n, True, 0.6, prof="amb32")

GROUP[0] = "p2-destination"
for n in ["Collector", "Dry Dock", "Explosives Shop", "Fishmonger", "Painter", "Research", "Researcher", "Shipwright",
          "Storage", "Trader", "Travelling Merchant"]:   # BaseDestination/SpeakerData.visitSFX: một nhịp ~1 s
    N("dest.visit." + n.lower().replace(" ", "-"), "ui", n + " - Visit", vol=0.8)
for n, b in [("Collector", "Collector - Ambience"), ("Fishmonger", "Fishmonger Ambience"), ("Lighthouse Keeper", "Lighthouse Keeper - Ambience"),
             ("Mayor", "Mayor - Ambience"), ("Painter", "Painter - Ambience"), ("Researcher", "Researcher Ambience"),
             ("Shipwright", "Shipwright - Ambience"), ("Trader", "Trader Ambience"), ("Travelling Merchant", "Travelling Merchant - Ambience"),
             ("Photographer", "Photographer Character Ambience 1_Loop")]:
    N("dest.loop." + n.lower().replace(" ", "-"), "ambience", b, True, 0.5, prof="amb32", cap=15)
N("dest.loop.lighthouse-keeper.sfx", "ambience", "lighthouse-loop", True, 0.5, prof="amb32", cap=15)

GROUP[0] = "p2-poi"
# IntermittentSFXPlayer (xác tàu gỗ, chai thư, máy bay rơi, bẫy Twisted Strand): clip ngắn
for n in ["POI - Wooden Shipwreck 1", "POI - Wooden Shipwreck 2", "POI - Wooden Shipwreck 3", "POI - Message in Bottle 1",
          "POI - Message in Bottle 2", "POI - Plane wreck 1", "POI - Plane wreck 2", "POI - Twisted Strand Monster Traps 1",
          "POI - Twisted Strand Monster Traps 2", "POI - Twisted Strand Monster Traps 3"]:
    N("poi." + n[6:].lower().replace(" ", "-"), "world", n, vol=0.8)
# nguồn lặp đặt cố định (DR_SFX.emitters): lỗ hơi, đền cá, giáo phái, thác, máy phát điện, vệ tinh
for k, n in [("steamvent", "POI - Steam Vent Loop"), ("shrine", "POI - Fish Shrines"), ("cultist", "POI - Cultist Loop"),
             ("waterfall.close", "POI - Waterfall Close"), ("waterfall.far", "POI - Waterfall Distant"),
             ("generator", "Generator - Ambience"), ("satellite", "Old Fortress Dock Ambience - Satellite")]:
    N("poi.loop." + k, "world", n, True, 0.5, prof="amb32", cap=15)

GROUP[0] = "p3-dock-ambience"
# DockData.ambienceDay/NightAssetReference của các bến game gốc chưa có tiếng (3 bến đầu đã có từ trước)
for n in ["Blackstone Isle Day Dock", "Blackstone Isle Night Dock", "Old Fortress Dock Ambience - Wind", "Ruined Settlement Dock Ambience",
          "Steel Point Dock Ambience - Day", "Steel Point Dock Ambience - Night", "Photographer Dock Ambience Day 1_Loop",
          "Photographer Dock Ambience - Night 1_Loop", "Airman Camp", "Research Station Dock Ambience - Wind",
          "Dock Ambience - Old Mayor Docks Campfire"]:
    N("dock.amb." + re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-"), "ambience", n, True, 0.5, prof="amb32")

GROUP[0] = "p3-dock-music"
# DockData.musicAssetReference còn thiếu của bến game gốc: bản nhẹ (mono 56k, 40 s)
for k, n in [("oldMayorEmpty", "Old Mayor's Dock Empty Theme"), ("airman", "Airman's Theme"),
             ("researchPontoon", "Destroyed Research Pontoon Theme"), ("merchantTwistedStrand", "Travelling Merchant - Twisted Strand"),
             ("merchantDevilsSpine", "Travelling Merchant - Devil's Spine"), ("merchantStellarBasin", "Travelling Merchant - Stellar Basin"),
             ("merchantGaleCliffs", "Travelling Merchant - Gale Cliffs")]:
    N("music.dock." + k, "music", n, True, 0.6, prof="musicLite", bus="Music_Dock")
GROUP[0] = "base"


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
    wanted = {}  # rel -> [(key, cat, loop, vol, prof, cap, bus, group)]
    problems = []
    bybase = {}
    for r in rows:
        bybase.setdefault(os.path.basename(r["rel"]).lower(), []).append(r)
    for key, cat, name, loop, vol, prof, cap, bus, grp in S:
        if name not in byrel:
            problems.append("missing clip for %s: %s" % (key, name))
            continue
        wanted.setdefault(name, []).append((key, cat, loop, vol, prof, cap, bus, grp))
    for key, cat, base, loop, vol, prof, cap, bus, grp, sub in SN:
        hit = [r for r in bybase.get(base.lower(), []) if r["group"] != "vocals" and (not sub or sub.lower() in r["rel"].lower())]
        if len(hit) != 1:
            problems.append("%s clip for %s: %s%s" % ("missing" if not hit else "ambiguous (%d)" % len(hit), key, base, " [%s]" % sub if sub else ""))
            continue
        wanted.setdefault(hit[0]["rel"], []).append((key, cat, loop, vol, prof, cap, bus, grp))

    cat_rows, used, failed, seen, audio, cost = [], {}, [], {}, {}, {}
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
        for key, cat, loop, vol, prof, kcap, bus, grp in wanted.get(r["rel"], []):
            if r["rel"] not in used:
                if prof:
                    enc, cap = list(PROF[prof][0]), kcap or PROF[prof][1]
                elif cat == "music" and not key.startswith("music.insanity"):
                    enc = ["-ac", "2", "-b:a", "96k"]
                    cap = cap_for(key, cat)
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
                cost[grp] = cost.get(grp, 0) + os.path.getsize(os.path.join(REPO_AUDIO, cat, stem + ".mp3"))
            c2, s2, d2 = used[r["rel"]]
            audio[key] = dict(src="audio/%s/%s.mp3" % (c2, s2), loop=loop, vol=vol, dur=round(d2, 2),
                              orig=r["container"] or n)
            if bus:
                audio[key]["bus"] = bus
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
    tot = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(REPO_AUDIO) for f in fs)
    print("audio/ total %.2f MB | by group (first file written for each clip): %s" % (
        tot / 1e6, ", ".join("%s %.0f KB" % (g, c / 1000) for g, c in sorted(cost.items()))))


main()
