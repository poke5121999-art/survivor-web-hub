# EXPORT audio (Wwise -> Ogg + event index)

Run: `py -3.12 -I D:\survivor-web-hub\games\world-of-slime\tools\export_audio.py all [--force]`
Stages: `extract` (cached in D:\wos-ref\audio_raw, `--force` redoes, ~4 min), `index` (HIRC parse, ~40 s), `decode` (vgmstream | ffmpeg, 4 workers, ~2.5 min), `final` (writes audio/index.json). Rerun gives the same files and identical index.json (md5 checked).
Output: D:\world-of-slime-assets\audio\{bgm,ambience,footstep,sfx,ui,other}\<name>.ogg + index.json. 1126 ogg, 74 MB (budget 350 MB, nothing dropped).

## What the bundles really are
- 2243 `wwisedata_windows_*` bundles = 1035 RIFF .wem (named by media id; PCM, stereo 48k, 767 MB raw) + 1208 BKHD .bnk (one per event, named by event; Wwise 2022.1, bank version 154). The task text said all 2243 were wem: wrong.
- `wwisesoundbank.bundle` has no .bnk, only 1221 WwiseEventAssets (name + media ids). `BGM.bnk`, and 3 others, embed media in DIDX/DATA (91 embedded wems; BGM has 13 music files). They are written to raw/wem too.
- Names: the human name is the BANK name (= event name). Wwise ids are FNV-1(lower(name)). Five banks hold many events (BGM 20, UICommon 53, Main 28, Intro 15, CutSceneMerge 18); their names come from WwiseObjectReference assets (`objectName`+`id`) in mapsound/data/ui/cutscene bundles, plus a token dictionary (il2cpp metadata + code dumps). 40 events stay `<bank>__<hexid>` (19 of them BGM: the real BGM names are server data, `DistrictType.bgmResource`).
- Media shared by several events (footsteps) is named after the first event alphabetically (e.g. Footstep_default uses Footstep_biped_24.ogg); every event lists all its media ids.

## HIRC parsing (traps)
- Sound: plugin u32 @4, stream type @8, **sourceId u32 @9** = media id. NodeBaseParams is not parsed whole: the DirectParentID is found as the first u32 equal to an object id in the bank (offset 9..60), props follow at +5. Prop 0 = Volume dB, 74 = Loop count (0 = infinite).
- RanSeq: playlist is the tail (`u16 n` + n*(id, weight)), children block `u32 n + ids` just before the 2 mode bytes, loop count u16 24 bytes before it, mode 0 = random.
- Switch container: children block found by scanning and verified by consuming the object exactly (children, groups, 13-byte params). groupId @-9, default @-5 from the children block. Group is `landType` (Snow Sand Stone Ground Water Grass), emotion, time.
- Music nodes (10 segment, 11 track, 12 switch, 13 ranseq): first u32-id hit at offset 13 is the PARENT; skip it or the walk goes upward and collects every BGM.
- Event: action count is a varint; Play = 0x0403, SetSwitch 0x12xx, SetState 0x19xx (group/value are the last 8 bytes). Events with no media keep `actions` (Stop_BGM, Mute_SFX, Set_State_Day, SetState_landType_Water ...).
- vgmstream: use `-i` (ignore loop points) both for `-m` duration and for decode, else durations double. Output of `-p` pipes straight into ffmpeg libvorbis (music 96k stereo, others 64k; all sources are stereo, so no mono).
- Hash dictionary iterated unsorted gave case-variant names (GROUND/Ground) between runs: iterate sorted.

## index.json
`events[name] = {id, bank, media:[ids], loop, random, volume (linear), layered?, music?, switch?{group, default, cases{name:[ids]}}, actions?}`, `media[id] = {name, file, durationSec, channels, sampleRate, bytes, category}`, `refs` {attackSound=ui_attack, returnSound=ui_whistle (CommonWwiseEventData), mapSounds{mapId:[events]} from mapsound prefabs, footstepEvents}, `missingMedia`, `dropped`.
Stats: 1334 events (1293 with media, 41 action-only), 74 loop, 39 random, 33 switch, 20 layered. Cross-check against WwiseEventAsset media lists: 1176 of 1201 identical, the rest differ only because the asset list is empty/short (the bank is authoritative).

## Missing / wrong
- 20 media ids referenced by banks are not in the demo: ambience_global_cemetery/makina/noecheon/noecheon_mountain/snowfield, ambience_zone_noecheon_mountain (one or more variants each), emotion_danceA/lying/sitting (197114191), sfx_skill_drive_power, sfx_skill_tackle_ground. Listed in index `missingMedia`.
- 17 WwiseEventAssets have no bank (sfx_skill_swing, sfx_skill_fist, Footstep_slide, Play, ...): not in the demo, no events exported. `test_fire` (Test_Sound_Object prefab) likewise.
- `volume` = Wwise dB chain of the sound and its parents (no RTPC, no per-play random volume/pitch ranges). Music segments' entry/exit cues and transitions are ignored: BGM loops as whole files.
- Per-map BGM is not in the install (server data); `refs.mapSounds` has the ambience/zone events per map prefab.
- Proof: D:\wos-ref\proof\audio\sample_table.md (22 events); ffprobe checked all 1126 ogg: all vorbis, duration > 0, equal to vgmstream -i duration within 0.1 s.
