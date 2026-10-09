# -*- coding: utf-8 -*-
"""Bóc cách DREDGE đặt tiếng trong thế giới: bus mixer, vị trí nguồn tiếng, nhạc chớp, sấm, hoảng loạn.

Chạy:  python -I games/dredge/tools/sfx_scene.py
       (cần D:\\dredge-ref: bản AssetRipper, catalog Addressables; không cần UnityPy, ~15 giây)
Ghi:   games/dredge/data/sfx.js   window.DR_SFX
       { mixer, blend, weather, lightning, stingers, insanity, funds, music, dock, destinations, speakers, emitters, intermittent }
Đọc thêm D:\dredge-ref\cache\sfx_dest.json do tools/sfx_dest.py ghi (điểm đến, vì AssetRipper bỏ hết trường của chúng).

Mọi clip trong DR_SFX ghi bằng TÊN GỐC của clip (tên tệp không đuôi, "Marrows Undocked - General Ambience");
js/audio.js tra ra khoá phát bằng trường `orig` mà tools/audio.py ghi (DRAudio.resolve). Clip chưa được audio.py
đưa vào bản web thì lúc chạy bị bỏ qua, không lỗi. Chạy lại ra đúng từng byte.

Số liệu lấy từ đâu (đều đo trong Game.unity, không đoán):
  - nguồn tiếng: mọi AudioSource (lớp 82) lặp + PlayOnAwake + bật + cha ông đều bật; toạ độ thế giới dựng từ chuỗi Transform
    (đổi dấu Z sang three.js như mọi tool khác); nhóm mixer từ OutputAudioMixerGroup.
  - Volume2D (lớp 114) gắn cùng nguồn: closeDist, attenuationDistance, closeVolume, farVolume, usePlayerDistance.
    Nguồn vùng (Day/Night/General) có SpatialBlend 0, nên gốc chỉ chỉnh âm lượng theo khoảng cách (Volume2D.cs), không panning.
  - TimeOfDayAudioBlender: đường cong dayVolumeModifier / nightVolumeModifier (nhóm mixer Day / Night).
  - Nhạc chớp: StingerAudio là SerializedMonoBehaviour nên danh sách nằm trong blob Odin (tools/odin.py).
  - Mixer: MainAudioMixer.mixer, cây nhóm + giá trị dB từng snapshot; Master luôn -9 dB.
"""
import collections, glob, io, json, os, pickle, re, struct, sys, base64
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import odin  # noqa: E402

REF = os.environ.get("DREDGE_REF", r"D:\dredge-ref")
ASSETS = os.path.join(REF, "ripped", "ExportedProject", "Assets")
SCENE = os.path.join(ASSETS, "Scenes", "Game.unity")
DR = os.path.dirname(HERE)
OUT = os.path.join(DR, "data", "sfx.js")
CATALOG = glob.glob(os.path.join(REF, "game", "*", "DREDGE_Data", "StreamingAssets", "aa", "catalog.json"))[0]
ZONES = {1: "THE_MARROWS", 2: "GALE_CLIFFS", 4: "STELLAR_BASIN", 8: "TWISTED_STRAND", 16: "DEVILS_SPINE", 32: "OPEN_OCEAN", 64: "PALE_REACH"}  # ZoneEnum.cs
SNAP = {"UndockedSnapshot": "UNDOCKED", "MusicOnlySnapshot": "MUSIC_ONLY", "DockedIndoorSnapshot": "DOCKED_INDOORS",
        "DockedOutdoorSnapshot": "DOCKED_OUTDOORS", "MenuSnapshot": "MENU", "LoadingSnapshot": "LOADING", "CutsceneSnapshot": "CUTSCENE"}
# Bản web chỉ có game gốc: DLC1 (Pale Reach), DLC2 (Iron Rig) và vật theo sự kiện không có trong bản đồ web.
SKIP_ROOTS = ("DLC1", "DLC2", "PatrollingWildlife")
WORLD = 900  # m, nửa cạnh vùng giữ lại (bản đồ vuông 1500 m)


def r3(x):
    return round(float(x), 3) + 0.0


# ---------------------------------------------------------------- catalog Addressables + meta guid
def catalog():
    d = json.load(open(CATALOG, encoding="utf-8"))
    kd, bd, ed = (base64.b64decode(d[k]) for k in ("m_KeyDataString", "m_BucketDataString", "m_EntryDataString"))
    nb = struct.unpack_from("<i", bd, 0)[0]
    p, keys, buckets = 4, [], []
    for _ in range(nb):
        ko, ne = struct.unpack_from("<ii", bd, p)
        buckets.append(struct.unpack_from("<%di" % ne, bd, p + 8))
        p += 8 + 4 * ne
        t = kd[ko]
        if t in (0, 1):
            n = struct.unpack_from("<i", kd, ko + 1)[0]
            keys.append(kd[ko + 5:ko + 5 + n].decode("ascii" if t == 0 else "utf-16-le"))
        else:
            keys.append(None)
    ne = struct.unpack_from("<i", ed, 0)[0]
    entries = [struct.unpack_from("<7i", ed, 4 + 28 * i) for i in range(ne)]
    byguid = {}
    for k, b in zip(keys, buckets):
        if isinstance(k, str) and b and re.fullmatch(r"[0-9a-f]{32}", k):
            iid = d["m_InternalIds"][entries[b[0]][0]]
            if iid.lower().endswith((".wav", ".ogg", ".mp3")):
                byguid[k] = iid
    return byguid


def meta_guids():
    out = {}
    for sub in ("Audio", "AudioClip"):
        for d, _, fs in os.walk(os.path.join(ASSETS, sub)):
            for f in fs:
                if f.endswith(".meta") and f[:-5].lower().endswith((".wav", ".ogg", ".mp3")):
                    t = io.open(os.path.join(d, f), encoding="utf-8", errors="replace").read(600)
                    m = re.search(r"guid: (\w+)", t)
                    if m:
                        out[m.group(1)] = f[:-5]
    return out


CG = catalog()
MG = meta_guids()


def stem(p):
    return re.sub(r"\.(wav|ogg|mp3)$", "", os.path.basename(p), flags=re.I)


def clip_of(guid):
    """guid (catalog hoặc .meta) -> tên clip gốc, None nếu không phải clip."""
    if guid in CG:
        return stem(CG[guid])
    if guid in MG:
        return stem(MG[guid])
    return None


# ---------------------------------------------------------------- mixer
def mixer():
    txt = io.open(os.path.join(ASSETS, "Audio", "Mixers", "MainAudioMixer.mixer"), encoding="utf-8").read()
    parts = re.split(r"^--- !u!(\d+) &(-?\d+)\n", txt, flags=re.M)
    objs = {}
    for i in range(1, len(parts), 3):
        objs[parts[i + 1]] = (parts[i], parts[i + 2])

    def g(body, key):
        m = re.search(r"^  %s: (.*)$" % key, body, re.M)
        return m.group(1).strip() if m else None
    groups, parent = {}, {}
    for fid, (cls, body) in objs.items():
        if cls != "243":
            continue
        kids = re.findall(r"^  - \{fileID: (\d+)\}", body.split("m_Children:")[1].split("m_Volume")[0], re.M)
        groups[fid] = dict(name=g(body, "m_Name"), kids=kids, vol=g(body, "m_Volume"))
    for fid, d in groups.items():
        for k in d["kids"]:
            parent[k] = fid
    snaps = {}
    for fid, (cls, body) in objs.items():
        if cls == "245":
            snaps[SNAP[g(body, "m_Name")]] = dict(re.findall(r"^    (\w{32}): (\S+)$", body, re.M))
    res = {}
    for fid, d in groups.items():
        res[d["name"]] = dict(parent=groups[parent[fid]]["name"] if fid in parent else None,
                              db={s: float(v[d["vol"]]) if d["vol"] in v else 0.0 for s, v in sorted(snaps.items())})
    return res, {fid: d["name"] for fid, d in groups.items()}


# ---------------------------------------------------------------- scene
def script_guids():
    out = {}
    d = os.path.join(ASSETS, "Scripts", "Assembly-CSharp")
    for f in os.listdir(d):
        if f.endswith(".cs.meta"):
            m = re.search(r"guid: (\w+)", io.open(os.path.join(d, f), encoding="utf-8").read(300))
            if m:
                out[m.group(1)] = f[:-8]
    return out


WANT = {"Volume2D", "TimeOfDayAudioBlender", "TimeOfDayAudioSourceFader", "StingerAudio", "Lightning", "InsanityAmbience",
        "FundsChangeAudio", "IntermittentSFXPlayer", "DockAudio", "DestinationAudio"}


def read_scene(sg):
    GO, TR, AS, SC = {}, {}, {}, collections.defaultdict(list)
    hdr = re.compile(r"^--- !u!(\d+) &(-?\d+)( stripped)?")
    state = {"cls": None, "fid": None, "buf": []}

    def flush():
        cls, fid, buf = state["cls"], state["fid"], state["buf"]
        state["cls"], state["buf"] = None, []
        if cls is None:
            return
        if cls == "1":
            name = active = None
            comps = []
            for l in buf:
                if l.startswith("  m_Name:"):
                    name = l.split(":", 1)[1].strip()
                elif l.startswith("  m_IsActive:"):
                    active = int(l.split(":")[1])
                elif l.startswith("  - component:"):
                    comps.append(re.search(r"fileID: (-?\d+)", l).group(1))
            GO[fid] = dict(name=name, active=active, comps=comps)
        elif cls == "4":
            r = dict(go=None, father=None, pos=(0, 0, 0), rot=(0, 0, 0, 1), scale=(1, 1, 1))
            for l in buf:
                if l.startswith("  m_GameObject:"):
                    r["go"] = re.search(r"fileID: (-?\d+)", l).group(1)
                elif l.startswith("  m_Father:"):
                    r["father"] = re.search(r"fileID: (-?\d+)", l).group(1)
                elif l.startswith("  m_LocalPosition:"):
                    r["pos"] = tuple(float(x) for x in re.findall(r"[xyz]: (-?[\d.e+-]+)", l))
                elif l.startswith("  m_LocalRotation:"):
                    r["rot"] = tuple(float(x) for x in re.findall(r"[xyzw]: (-?[\d.e+-]+)", l))
                elif l.startswith("  m_LocalScale:"):
                    r["scale"] = tuple(float(x) for x in re.findall(r"[xyz]: (-?[\d.e+-]+)", l))
            TR[fid] = r
        elif cls == "82":
            r = dict(raw={}, blend=None, go=None)
            cur = None
            for l in buf:
                if l.startswith("  ") and not l.startswith("   "):
                    k, _, v = l.strip().partition(":")
                    cur = k
                    if v.strip():
                        r["raw"][k] = v.strip()
                elif cur == "panLevelCustomCurve" and l.strip().startswith("value:") and r["blend"] is None:
                    r["blend"] = float(l.split(":")[1])
            AS[fid] = r
        elif cls == "114":
            m = re.search(r"m_Script: \{fileID: 11500000, guid: (\w+)", "\n".join(buf[:15]))
            sc = sg.get(m.group(1)) if m else None
            if sc in WANT:
                SC[sc].append((fid, list(buf)))

    with io.open(SCENE, encoding="utf-8", errors="replace", newline="") as fh:
        for line in fh:
            line = line.rstrip("\r\n")
            if line.startswith("--- "):
                flush()
                m = hdr.match(line)
                if m and not m.group(3) and m.group(1) in ("1", "4", "82", "114"):
                    state["cls"], state["fid"] = m.group(1), m.group(2)
                continue
            if state["cls"] is not None:
                state["buf"].append(line)
    flush()
    return GO, TR, AS, SC


def qmul(a, b):
    return (a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2])


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx, ty, tz = 2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)
    return (vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx))


class Scene:
    def __init__(self, GO, TR):
        self.GO, self.TR, self.cache = GO, TR, {}
        self.go2tr = {t["go"]: fid for fid, t in TR.items()}
        self.comp2go = {c: g for g, d in GO.items() for c in d["comps"]}

    def world(self, tid):
        if tid in self.cache:
            return self.cache[tid]
        t = self.TR[tid]
        if t["father"] and t["father"] != "0" and t["father"] in self.TR:
            pp, pr, ps = self.world(t["father"])
            lp = qrot(pr, tuple(t["pos"][i] * ps[i] for i in range(3)))
            res = ((pp[0] + lp[0], pp[1] + lp[1], pp[2] + lp[2]), qmul(pr, t["rot"]), tuple(t["scale"][i] * ps[i] for i in range(3)))
        else:
            res = (t["pos"], t["rot"], t["scale"])
        self.cache[tid] = res
        return res

    def chain(self, tid):
        names, act = [], True
        while tid and tid in self.TR:
            g = self.GO.get(self.TR[tid]["go"], {})
            names.append(g.get("name", "?"))
            if g.get("active") == 0:
                act = False
            tid = self.TR[tid]["father"]
        return list(reversed(names)), act

    def where(self, comp_fid):
        go = self.comp2go.get(comp_fid)
        tid = self.go2tr.get(go)
        if tid is None:
            return None
        names, act = self.chain(tid)
        return dict(pos=self.world(tid)[0], path=names, active=act, go=go)


def kv(lines):
    d = {}
    for l in lines:
        m = re.match(r"  (\w+): (.*)", l)
        if m:
            d[m.group(1)] = m.group(2).strip()
    return d


def curve(lines, key):
    """AnimationCurve của Unity trong YAML -> [[time, value, inSlope, outSlope], ...] (Hermite)."""
    out, on, cur = [], False, None
    for l in lines:
        if l.startswith("  %s:" % key):
            on = True
            continue
        if on and re.match(r"  \w", l) and not l.startswith("   "):
            break
        if not on:
            continue
        s = l.strip()
        if s.startswith("- serializedVersion"):
            cur = {}
            out.append(cur)
        elif cur is not None and ":" in s and s.split(":")[0] in ("time", "value", "inSlope", "outSlope"):
            cur[s.split(":")[0]] = float(s.split(":")[1])
    return [[r3(c["time"]), r3(c["value"]), r3(c["inSlope"]), r3(c["outSlope"])] for c in out]


def three(p):
    return [r3(p[0]), r3(p[1]), r3(-p[2])]


def meta_clip(ref):
    m = re.search(r"guid: (\w+)", ref or "")
    return clip_of(m.group(1)) if m else None


def build():
    sg = script_guids()
    GO, TR, AS, SC = read_scene(sg)
    S = Scene(GO, TR)
    mix, mixname = mixer()

    def gname(ref):
        m = re.search(r"fileID: (\d+)", ref or "")
        return mixname.get(m.group(1)) if m else None

    # ---- Volume2D theo AudioSource
    v2d = {}
    for fid, lines in SC.get("Volume2D", []):
        d = kv(lines)
        m = re.search(r"fileID: (-?\d+)", d.get("audioSource", ""))
        asid = m.group(1) if m else None
        if asid and asid != "0" and d.get("m_Enabled") == "1":
            v2d[asid] = [float(d["closeDist"]), float(d["attenuationDistance"]), float(d["closeVolume"]), float(d["farVolume"]), int(d["usePlayerDistance"])]
    fader = {}
    for fid, lines in SC.get("TimeOfDayAudioSourceFader", []):
        d = kv(lines)
        m = re.search(r"fileID: (-?\d+)", d.get("audioSource", ""))
        if m:
            fader[m.group(1)] = dict(curve=curve(lines, "volumeModifier"), max=float(d["maxVolume"]))

    # ---- nguồn tiếng đặt cố định trong thế giới
    emitters, skipped = [], collections.Counter()
    for fid, a in AS.items():
        raw = a["raw"]
        if not (raw.get("Loop") == "1" and raw.get("m_PlayOnAwake") == "1" and raw.get("m_Enabled") == "1" and raw.get("Mute") != "1"):
            continue
        w = S.where(fid)
        clip = meta_clip(raw.get("m_audioClip"))
        grp = gname(raw.get("OutputAudioMixerGroup"))
        if not w or not clip or not w["active"]:
            continue
        x, y, z = three(w["pos"])
        if w["path"][0] in SKIP_ROOTS or abs(x) > WORLD or abs(z) > WORLD:
            skipped["ngoài game gốc: " + w["path"][0]] += 1
            continue
        if grp not in ("Day", "Night", "General", "WorldSFX"):
            skipped["nhóm " + str(grp)] += 1
            continue
        if "Ooze" in clip:
            skipped["Ooze (DLC2)"] += 1
            continue
        e = dict(c=clip, g=grp, x=x, y=y, z=z, b=a["blend"] if a["blend"] is not None else 1.0,
                 mn=float(raw.get("MinDistance", 1)), mx=float(raw.get("MaxDistance", 500)), ro=int(raw.get("rolloffMode", 0)))
        if fid in v2d:
            e["d"] = v2d[fid]
        elif fid in fader:
            e["f"] = fader[fid]
        else:
            e["v"] = float(raw.get("m_Volume", 1))
        emitters.append(e)
    emitters.sort(key=lambda e: (e["g"], e["c"], e["x"], e["z"]))

    # ---- IntermittentSFXPlayer (xác tàu, chai thư, máy bay, bẫy)
    inter = []
    for fid, lines in SC.get("IntermittentSFXPlayer", []):
        d = kv(lines)
        w = S.where(fid)
        if not w or not w["active"]:
            continue
        x, y, z = three(w["pos"])
        if abs(x) > WORLD or abs(z) > WORLD or w["path"][0] in SKIP_ROOTS:
            continue
        clips = [clip_of(g) for g in re.findall(r"m_AssetGUID: (\w+)", "\n".join(lines))]
        inter.append(dict(x=x, y=y, z=z, c=[c for c in clips if c], a=float(d["minDelaySec"]), b=float(d["maxDelaySec"]),
                          v=float(d["volumeScale"]), mn=float(d["minDistance"]), mx=float(d["maxDistance"]), ro=int(d.get("audioRolloffMode", 1)),
                          g=gname(d.get("audioMixerGroup"))))
    inter.sort(key=lambda e: (e["c"], e["x"], e["z"]))

    # ---- nhạc chớp: scalar (YAML) + từ điển vùng -> danh sách clip (Odin)
    fid, lines = SC["StingerAudio"][0]
    sd = kv(lines)
    raw_hex = None
    for l in lines:
        if "SerializedBytes:" in l and "SerializedBytesString" not in l:
            raw_hex = l.split(":", 1)[1].strip()
    od = odin.decode(bytes.fromhex(raw_hex))
    stingers = dict(zones={}, tir={})
    for key, out in (("stingerAssetReferences", stingers["zones"]), ("tirStingerAssetReferences", stingers["tir"])):
        for e in od[key]["$items"]:
            out[ZONES.get(e["$k"], str(e["$k"]))] = [clip_of(a["m_AssetGUID"]) for a in e["$v"]["$items"]]
    stingers["params"] = dict(delayMin=float(sd["delayBetweenStingersMinSec"]), delayMax=float(sd["delayBetweenStingersMaxSec"]),
                              duration=float(sd["assumedStingerDuration"]), timeMin=float(sd["gameTimeMin"]), timeMax=float(sd["gameTimeMax"]),
                              check=float(sd["timeBetweenChecksSec"]), afterUndock=float(sd["minTimeAfterUndockingToPlay"]),
                              tirWeight=float(sd["weightingTowardsTIRStingers"]))

    # ---- sấm sét
    fid, lines = SC["Lightning"][0]
    ld = kv(lines)
    txt = "\n".join(lines)
    lightning = dict(strike=[clip_of(g) for g in re.findall(r"m_AssetGUID: (\w+)", txt.split("thunderSFXRefs:")[0])],
                     thunder=[clip_of(g) for g in re.findall(r"m_AssetGUID: (\w+)", txt.split("thunderSFXRefs:")[1])],
                     minRange=float(ld["minRange"]), maxRange=float(ld["maxRange"]), thunderDelay=float(ld["thunderDelay"]),
                     group=gname(ld.get("audioMixerGroup")), mn=50.0, mx=250.0)  # AudioPlayer.PlaySFX(..., Linear, 50, 250) trong Lightning.Emit

    # ---- hoảng loạn: 4 lớp lặp
    fid, lines = SC["InsanityAmbience"][0]
    idd = kv(lines)
    layer_ids = re.findall(r"- \{fileID: (-?\d+)\}", "\n".join(lines).split("audioSource:")[1].split("insanityMixerCoefficient")[0])
    insanity = dict(layers=[meta_clip(AS[i]["raw"]["m_audioClip"]) for i in layer_ids],
                    coef=float(idd["insanityMixerCoefficient"]), maxDrain=float(idd["maxInsanityDrainVal"]), speed=float(idd["volumeChangeSpeed"]),
                    ranges=[[0, 0.25], [0, 0.5], [0.25, 0.75], [0.5, 1]])  # InsanityAmbience.cs:58-64

    # ---- tiền
    fid, lines = SC["FundsChangeAudio"][0]
    txt = "\n".join(lines)
    funds = dict(up=[meta_clip(m) for m in re.findall(r"- (\{fileID: 8300000[^}]*\})", txt.split("increaseClips:")[1].split("decreaseClips:")[0])],
                 down=[meta_clip(m) for m in re.findall(r"- (\{fileID: 8300000[^}]*\})", txt.split("decreaseClips:")[1])])

    # ---- cân bằng ngày / đêm
    fid, lines = SC["TimeOfDayAudioBlender"][0]
    bd = kv(lines)
    blend = dict(day=curve(lines, "dayVolumeModifier"), night=curve(lines, "nightVolumeModifier"),
                 dayBase=float(bd["dayVolumeBase"]), nightBase=float(bd["nightVolumeBase"]))

    # ---- AudioPlayer / DockAudio / DestinationAudio
    # AudioPlayer nằm trong Prefabs/Audio/ManagerAudio.prefab (không phải Game.unity)
    ap = kv(io.open(os.path.join(ASSETS, "Prefabs", "Audio", "ManagerAudio.prefab"), encoding="utf-8").read().splitlines())
    music = dict(max=float(ap["maxMusicVolume"]), fadeDown=float(ap["musicFadeDownTimeSec"]),
                 dialogueLoopVolume=float(ap["loopingDialogueVolume"]), dialogueLoopFade=float(ap["loopingDialogueFadeDuration"]))
    dk = kv(SC["DockAudio"][0][1])
    dock = dict(fadeIn=float(dk["fadeInDuration"]), fadeOut=float(dk["fadeOutDuration"]),
                destination=float(kv(SC["DestinationAudio"][0][1])["transitionDuration"]))

    # ---- tiếng thời tiết: WeatherData.parameters.sfx (tham chiếu AudioClip trực tiếp)
    weather = {}
    wdir = os.path.join(ASSETS, "Data")
    wguid = [g for g, n in sg.items() if n == "WeatherData"][0]
    for d, _, fs in os.walk(wdir):
        for f in sorted(fs):
            if f.endswith(".asset"):
                t = io.open(os.path.join(d, f), encoding="utf-8", errors="replace").read()
                if "guid: " + wguid in t[:800]:
                    m = re.search(r"^    sfx: (\{.*\})", t, re.M)
                    weather[f[:-6]] = meta_clip(m.group(1)) if m else None

    # ---- tiếng vào / tiếng nền của điểm đến và nhân vật (tools/sfx_dest.py đọc bundle scene, vì AssetRipper bỏ hết trường)
    dests, speakers = {}, {}
    cache = os.path.join(REF, "cache", "sfx_dest.json")
    if os.path.exists(cache):
        dj = json.load(open(cache, encoding="utf-8"))
        for k, v in dj["destinations"].items():
            if (v["visit"] or v["loop"]) and not k.startswith("destination.tir-"):   # tir-* là DLC2
                dests[k] = [v["visit"], v["loop"], 1 if v["indoors"] else 0]
        for k, v in dj["speakers"].items():
            if v["visit"] or v["loop"]:
                speakers[k] = [v["visit"], v["loop"], 1 if v["indoors"] else 0]
    else:
        print("CẢNH BÁO: chưa có %s: chạy tools/sfx_dest.py để có tiếng vào điểm đến" % cache)

    return dict(mixer=dict(master=-9.0, groups=mix), blend=blend, weather=dict(sorted(weather.items())), lightning=lightning,
                stingers=stingers, insanity=insanity, funds=funds, music=music, dock=dock, destinations=dests, speakers=speakers,
                emitters=emitters, intermittent=inter), skipped


def main():
    data, skipped = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("// generated by tools/sfx_scene.py - do not edit\nwindow.DR_SFX = {\n")
        keys = list(data.keys())
        for i, k in enumerate(keys):
            v = data[k]
            if isinstance(v, list):
                fh.write("  %s: [\n%s\n  ]%s\n" % (json.dumps(k), ",\n".join("    " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in v), "," if i < len(keys) - 1 else ""))
            else:
                fh.write("  %s: %s%s\n" % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(",", ":"), sort_keys=True), "," if i < len(keys) - 1 else ""))
        fh.write("};\n")
    e = data["emitters"]
    print("emitters", len(e), dict(collections.Counter(x["g"] for x in e)), "| intermittent", len(data["intermittent"]),
          "| stinger zones", {k: len(v) for k, v in data["stingers"]["zones"].items()}, "| weather", len([1 for v in data["weather"].values() if v]),
          "| bytes", os.path.getsize(OUT))
    print("bỏ qua:", dict(skipped))
    miss = sorted({x["c"] for x in e} | {c for x in data["intermittent"] for c in x["c"]})
    print("clip cần cho nguồn đặt cố định:", len(miss))


main()
