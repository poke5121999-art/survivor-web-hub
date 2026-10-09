# -*- coding: utf-8 -*-
"""Chợ Phiên (The Bazaar) — bóc âm thanh FMOD từ bản demo Steam.

Chạy lại được, ra cùng kết quả. Python 3.8 + UnityPy + numpy; ffmpeg + vgmstream trên máy.
    python -I audio.py banks    # 1. TextAsset .bank trong bundle -> D:\\bazaar-ref\\audio\\banks
    python -I audio.py events   # 2. FMOD Studio (fmodstudio.dll của game): liệt kê event, GUID -> đường dẫn
    python -I audio.py clips    # 3. FSB5 -> wav bằng vgmstream, ra D:\\bazaar-ref\\audio\\clips\\<bank>
    python -I audio.py chain    # 4. chuỗi gọi: soundtrack SO, CardAudio SO, projectile prefab, scene -> event
    python -I audio.py render   # 5. chạy event qua FMOD (NRT) lấy tiếng thật, ra render\\*.wav
    python -I audio.py export   # 6. cắt khoảng lặng, mã hoá ogg, ghi games/bazaar/audio + data/audio.js
    python -I audio.py all

Mọi thứ trung gian nằm ngoài repo (D:\\bazaar-ref\\audio). Chỉ có audio/*.ogg và data/audio.js vào repo.
Bẫy đã gặp xem D:\\bazaar-ref\\notes\\AUDIO.md.
"""
import sys, os, re, glob, json, struct, subprocess, time, wave, shutil
sys.stdout.reconfigure(encoding="utf-8")

GAME = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data"
AA = GAME + r"\StreamingAssets\aa\StandaloneWindows64"
FMODDLL = GAME + r"\Plugins\x86_64\fmodstudio.dll"
VGM = r"C:\Users\tamph\Downloads\vgmstream\vgmstream-cli.exe"
ROOT = r"D:\bazaar-ref\audio"
BANKS = ROOT + r"\banks"
CLIPS = ROOT + r"\clips"
RENDER = ROOT + r"\render"
META = ROOT + r"\meta"
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, ".."))          # games/bazaar
OUT_AUDIO = os.path.join(REPO, "audio")
OUT_JS = os.path.join(REPO, "data", "audio.js")
UNITY_VER = "6000.3.11f1"       # bundle giấu phiên bản ("5.x.x"), phải ép; đọc từ UnityPlayer.dll
FMOD_HEADER = 0x00020200        # FMOD Studio 2.02 (fmodstudio.dll của game nhận 2.02.x)

for d in (BANKS, CLIPS, RENDER, META):
    os.makedirs(d, exist_ok=True)


def unity():
    import UnityPy, warnings
    warnings.filterwarnings("ignore")
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VER
    return UnityPy


# ---------------------------------------------------------------- 1. banks
def stage_banks():
    U = unity()
    n = 0
    for p in sorted(glob.glob(AA + r"\fmod*_assets_all.bundle")):
        env = U.load(p)
        for o in env.objects:
            if o.type.name == "TextAsset":
                d = o.read()
                b = d.m_Script
                if isinstance(b, str):
                    b = b.encode("utf-8", "surrogateescape")
                nm = d.m_Name if d.m_Name.endswith(".bank") else d.m_Name + ".bank"
                open(os.path.join(BANKS, nm), "wb").write(bytes(b))
                n += 1
    print("banks:", n)


# ---------------------------------------------------------------- FMOD Studio qua ctypes
class Studio:
    """Bọc tối thiểu FMOD Studio API (dll của chính game). output: 'nosound' | 'nrt:<file.wav>'."""
    def __init__(self, output="nosound"):
        import ctypes as C
        self.C = C
        self.D = C.CDLL(FMODDLL)
        vp = C.c_void_p
        self.s = vp()
        assert self.D.FMOD_Studio_System_Create(C.byref(self.s), FMOD_HEADER) == 0
        self.core = vp()
        self.D.FMOD_Studio_System_GetCoreSystem(self.s, C.byref(self.core))
        extra = None
        if output == "nosound":
            self.D.FMOD_System_SetOutput(self.core, 2)
        else:
            self.D.FMOD_System_SetSoftwareFormat(self.core, 48000, 3, 0)    # 48 kHz stereo
            # nrt: WAVWRITER_NRT (nhanh hơn thời gian thực, hỏng với event stream); wav: WAVWRITER (thời gian thực)
            self.D.FMOD_System_SetOutput(self.core, 5 if output.startswith("nrt:") else 3)
            fn = output.split(":", 1)[1].replace("\\", "/")                 # dấu \ làm OUTPUT_INIT lỗi 51
            if os.path.exists(fn):
                os.remove(fn)                                               # FMOD không cắt ngắn tệp cũ
            extra = fn.encode()
        r = self.D.FMOD_Studio_System_Initialize(self.s, 256, 4, 0, extra)  # 4 = SYNCHRONOUS_UPDATE
        assert r == 0, "Studio init %d" % r
        self.mcg = vp()
        self.D.FMOD_System_GetMasterChannelGroup(self.core, C.byref(self.mcg))
        self.banks = {}

    def load(self, name):
        C = self.C
        b = open(os.path.join(BANKS, name), "rb").read()
        bk = C.c_void_p()
        r = self.D.FMOD_Studio_System_LoadBankMemory(self.s, b, len(b), 0, 0, C.byref(bk))
        if r:
            print("  load fail", name, r)
        self.banks[name] = bk
        return bk

    def update(self):
        self.D.FMOD_Studio_System_Update(self.s)

    def clock(self):
        C = self.C
        a = C.c_ulonglong(); b = C.c_ulonglong()
        self.D.FMOD_ChannelGroup_GetDSPClock(self.mcg, C.byref(a), C.byref(b))
        return a.value

    def events_of(self, bk):
        C = self.C
        cnt = C.c_int()
        self.D.FMOD_Studio_Bank_GetEventCount(bk, C.byref(cnt))
        n = cnt.value
        if not n:
            return []
        arr = (C.c_void_p * n)()
        self.D.FMOD_Studio_Bank_GetEventList(bk, arr, n, C.byref(cnt))
        return [arr[i] for i in range(n)]

    def ev_info(self, ev):
        C = self.C
        pb = C.create_string_buffer(512); rl = C.c_int()
        self.D.FMOD_Studio_EventDescription_GetPath(ev, pb, 512, C.byref(rl))
        ln = C.c_int(); self.D.FMOD_Studio_EventDescription_GetLength(ev, C.byref(ln))
        one = C.c_int(); self.D.FMOD_Studio_EventDescription_IsOneshot(ev, C.byref(one))
        st = C.c_int(); self.D.FMOD_Studio_EventDescription_IsStream(ev, C.byref(st))
        pc = C.c_int(); self.D.FMOD_Studio_EventDescription_GetParameterDescriptionCount(ev, C.byref(pc))
        gid = C.create_string_buffer(16); self.D.FMOD_Studio_EventDescription_GetID(ev, gid)
        return dict(guid=gid.raw.hex(), path=pb.value.decode(), len=ln.value, oneshot=one.value,
                    stream=st.value, nparams=pc.value)

    def params_of(self, ev):
        """[(tên, min, max, mặc định, [nhãn...])]"""
        C = self.C

        class PD(C.Structure):
            _fields_ = [("name", C.c_char_p), ("id1", C.c_uint), ("id2", C.c_uint), ("mn", C.c_float),
                        ("mx", C.c_float), ("df", C.c_float), ("type", C.c_int), ("flags", C.c_uint),
                        ("guid", C.c_ubyte * 16)]
        pc = C.c_int(); self.D.FMOD_Studio_EventDescription_GetParameterDescriptionCount(ev, C.byref(pc))
        out = []
        for i in range(pc.value):
            pd = PD()
            self.D.FMOD_Studio_EventDescription_GetParameterDescriptionByIndex(ev, i, C.byref(pd))
            labels = []
            for li in range(int(pd.mx) + 1 if pd.flags & 8 else 0):      # 8 = LABELED
                buf = C.create_string_buffer(128); rl = C.c_int()
                if self.D.FMOD_Studio_EventDescription_GetParameterLabelByIndex(ev, i, li, buf, 128, C.byref(rl)) == 0:
                    labels.append(buf.value.decode())
            out.append((pd.name.decode(), pd.mn, pd.mx, pd.df, labels))
        return out

    def get_event(self, path):
        C = self.C
        d = C.c_void_p()
        r = self.D.FMOD_Studio_System_GetEvent(self.s, path.encode(), C.byref(d))
        return d if r == 0 else None

    def release(self):
        self.D.FMOD_Studio_System_Release(self.s)


def all_meta_banks():
    out = ["Master.bank", "Master.strings.bank"]
    for p in sorted(glob.glob(BANKS + r"\*.bank")):
        n = os.path.basename(p)
        if n.endswith(".assets.bank") or n in out:
            continue
        out.append(n)
    return out


# ---------------------------------------------------------------- 2. events
def stage_events():
    S = Studio("nosound")
    res = []
    for n in all_meta_banks():
        bk = S.load(n)
    S.update()
    C = S.C
    for n, bk in S.banks.items():
        for ev in S.events_of(bk):
            d = S.ev_info(ev)
            bn = C.create_string_buffer(256); rl = C.c_int()
            S.D.FMOD_Studio_Bank_GetPath(bk, bn, 256, C.byref(rl))
            d["bank"] = bn.value.decode()
            res.append(d)
    S.release()
    json.dump(res, open(META + r"\events.json", "w"), indent=0)
    print("events:", len(res))


def load_events():
    return json.load(open(META + r"\events.json"))


# ---------------------------------------------------------------- 3. clips (FSB5 -> wav)
CLIP_BANKS_DEFAULT = ["Common", "MainMenu", "VO_Tutorial"] + \
    [os.path.basename(p)[:-12] for p in sorted(glob.glob(BANKS + r"\Board*.assets.bank"))] + \
    [os.path.basename(p)[:-12] for p in sorted(glob.glob(BANKS + r"\VO_Heroes_*.assets.bank"))]


def fsb_inventory():
    """Đọc tên mẫu trong FSB5 của mọi *.assets.bank (không cần vgmstream) -> meta/fsb_inventory.json"""
    res = {}
    for p in sorted(glob.glob(BANKS + r"\*.assets.bank")):
        d = open(p, "rb").read()
        i = d.find(b"FSB5")
        if i < 0:
            continue
        ver, ns, shs, nts, ds, mode = struct.unpack_from("<6I", d, i + 4)
        hdr = 60 if ver == 1 else 56
        nt = i + hdr + shs
        names = []
        for k in range(ns):
            o = struct.unpack_from("<I", d, nt + 4 * k)[0]
            e = d.index(b"\0", nt + o)
            names.append(d[nt + o:e].decode("utf8", "replace"))
        res[os.path.basename(p)[:-12]] = dict(n=ns, bytes=len(d), names=names)
    json.dump(res, open(META + r"\fsb_inventory.json", "w"))
    return res


def stage_clips(banks=None):
    if banks is None:
        fsb_inventory()
    for b in (banks or CLIP_BANKS_DEFAULT):
        out = os.path.join(CLIPS, b)
        os.makedirs(out, exist_ok=True)
        if len(os.listdir(out)) > 0:
            continue
        # -i bỏ lặp, -S 0 mọi subsong, ?n tên mẫu thật trong FSB
        subprocess.run([VGM, "-i", "-S", "0", "-o", out + r"\?n.wav", BANKS + "\\" + b + ".assets.bank"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("clips", b, len(os.listdir(out)))




# ---------------------------------------------------------------- 3b. event -> mẫu (theo tên) để ghi tài liệu
def _toks(name):
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    t = [x for x in re.split(r"[^A-Za-z0-9]+", name.lower()) if x]
    return [x for x in t if x not in ("sfx",) and not re.fullmatch(r"v\d+|\d+", x)]


def stage_map():
    """Ghép event -> nhóm mẫu trong FSB cùng bank bằng độ giống tên. Ghi meta/event_samples.json + thống kê độ tin cậy.
    Mức tin cậy: high = mọi token của tên event nằm trong tên nhóm mẫu; med = phủ >= 75%; none = không có."""
    inv = json.load(open(META + r"\fsb_inventory.json"))
    evs = load_events()
    res = {}
    stat = {"high": 0, "med": 0, "none": 0}
    for e in evs:
        p = e["path"]
        if not p.startswith("event:/") or p.startswith("event:/VO/") or p.startswith("event:/Music/"):
            continue
        bank = e["bank"].split("/")[-1]
        if bank not in inv:
            continue
        et = set(_toks(p.rsplit("/", 1)[1]))
        if not et:
            continue
        groups = {}
        for nm in inv[bank]["names"]:
            g = re.sub(r"(_V\d+)?_?\d+$", "", nm)
            groups.setdefault(g, []).append(nm)
        best = None
        for g, lst in groups.items():
            gt = set(_toks(g))
            cov = len(et & gt) / float(len(et))
            score = (cov, -len(gt - et))
            if best is None or score > best[0]:
                best = (score, g, lst)
        cov = best[0][0] if best else 0
        conf = "high" if cov >= 0.999 else "med" if cov >= 0.75 else "none"
        stat[conf] += 1
        res[p] = dict(conf=conf, group=best[1] if conf != "none" else None,
                      samples=best[2] if conf != "none" else [], bank=bank)
    json.dump(res, open(META + r"\event_samples.json", "w"), indent=0)
    print("map:", stat, "trên", len(res), "event SFX/UI/Board/...")
    return stat


# ---------------------------------------------------------------- 4. chuỗi gọi (Unity -> FMOD)
def guid_hex(d):
    """EventReference.Guid của FMODUnity = 4 int32 = 16 byte của FMOD_GUID, ghép lại đúng thứ tự bộ nhớ."""
    return struct.pack("<4i", d["Data1"], d["Data2"], d["Data3"], d["Data4"]).hex()


def walk_refs(t, pref, out, ev):
    if isinstance(t, dict):
        if isinstance(t.get("Guid"), dict) and "Data1" in t["Guid"]:
            out.append((pref, ev.get(guid_hex(t["Guid"]))))
            return
        for k, v in t.items():
            walk_refs(v, pref + "." + k, out, ev)
    elif isinstance(t, list):
        for i, v in enumerate(t):
            walk_refs(v, pref + "[%d]" % i, out, ev)


def prefab_owner_map(env):
    """path_id của GameObject (ở mọi độ sâu) -> đường dẫn prefab gốc theo AssetBundle.m_Container."""
    objs = {o.path_id: o for o in env.objects}
    cont = None
    for o in env.objects:
        if o.type.name == "AssetBundle":
            cont = o.read_typetree()["m_Container"]
    own = {}
    if not cont:
        return own
    cache = {}

    def tt(pid):
        if pid not in cache:
            cache[pid] = objs[pid].read_typetree()
        return cache[pid]

    for path, info in cont:
        pid = info["asset"]["m_PathID"]
        if pid not in objs or objs[pid].type.name != "GameObject":
            continue
        stack = [pid]
        while stack:
            g = stack.pop()
            if g in own:
                continue
            own[g] = path
            try:
                for c in tt(g)["m_Component"]:
                    cp = c["component"]["m_PathID"]
                    if cp in objs and objs[cp].type.name in ("Transform", "RectTransform"):
                        for ch in tt(cp)["m_Children"]:
                            chp = ch["m_PathID"]
                            if chp in objs:
                                stack.append(tt(chp)["m_GameObject"]["m_PathID"])
            except Exception:
                pass
    return own


SCAN_SKIP = ("fmod", "skin_", "carpet_", "cardback_", "cardframes", "fonts", "shaders", "urpshaders", "textures",
             "album_", "88bae", "catalog", "qualitysettings", "seasondata", "models_fx", "materials_fx")


def scan_event_refs():
    """Quét MonoBehaviour của mọi bundle (trừ fmod/skin/...), gom mọi EventReference đã giải ra đường dẫn event.
    Mỗi dòng: bundle, tên GameObject, prefab gốc, tên MB, [(trường, event)]."""
    U = unity()
    ev = {e["guid"]: e["path"] for e in load_events()}
    res = []
    for p in sorted(glob.glob(AA + r"\*.bundle")):
        b = os.path.basename(p)
        if b.startswith(SCAN_SKIP):
            continue
        try:
            env = U.load(p)
        except Exception:
            continue
        objs = {o.path_id: o for o in env.objects}
        owner = None
        for o in env.objects:
            if o.type.name != "MonoBehaviour":
                continue
            try:
                t = o.read_typetree()
            except Exception:
                continue
            out = []
            walk_refs(t, "", out, ev)
            out = [x for x in out if x[1]]
            if not out:
                continue
            if owner is None:
                owner = prefab_owner_map(env)
            go = None
            gp = t.get("m_GameObject", {}).get("m_PathID", 0)
            if gp and gp in objs:
                try:
                    go = objs[gp].read_typetree()["m_Name"]
                except Exception:
                    pass
            res.append(dict(bundle=b, go=go, prefab=owner.get(gp), name=t.get("m_Name"), refs=out))
    json.dump(res, open(META + r"\refs.json", "w", encoding="utf-8"), ensure_ascii=False)
    return res


HOOK_NAMES = ["OnEnter", "OnExit", "OnBuy", "OnIdle", "OnMultiClick", "OnLastLife", "OnNoBuyGold", "OnNoBuySpace",
              "OnPvEVictoryDefeat", "OnPvPIntro", "OnPvPVictoryDefeat", "OnRunVictoryDefeat", "OnLevelUp",
              "OnUpgrade", "OnSellItemBySize", "OnSellItemByTag", "OnChoiceSelect", "OnRevive", "OnCritDamage",
              "OnReroll"]       # CardAudio.AudioHookType (CardAudio.cs:23)


def stage_chain():
    U = unity()
    ev = {e["guid"]: e["path"] for e in load_events()}
    refs = scan_event_refs()
    chain = {}
    # soundtrack SO -> playlist theo hero
    st = {}
    env = U.load(AA + r"\soundtrackso_assets_all.bundle")
    for o in env.objects:
        if o.type.name == "MonoBehaviour":
            t = o.read_typetree()
            st[t["m_Name"]] = dict(
                pve=ev.get(guid_hex(t["PVEMusicTrack"]["EventReference"]["Guid"])),
                tracks=[dict(name=k["TrackName"], event=ev.get(guid_hex(k["EventReference"]["Guid"])),
                             bank=k["BankName"]) for k in t["MusicTracks"]])
    chain["soundtracks"] = st
    # CardAudio SO (VO) theo AudioKey
    ca = {}
    for g in ("events", "heroes", "merchants", "monsters"):
        env = U.load(AA + r"\cardaudio_%s_assets_all.bundle" % g)
        for o in env.objects:
            if o.type.name != "MonoBehaviour":
                continue
            t = o.read_typetree()
            if "Hooks" not in t:
                continue
            ca[t["m_Name"]] = dict(group=g, bank=t["CharacterBank"], nonverbal=t["NonVerbal"],
                                   hooks=[dict(type=HOOK_NAMES[h["AudioHookType"]], name=h["AudioHookName"],
                                               event=ev.get(guid_hex(h["EventRef"]["Guid"])),
                                               chance=h["PlayChancePercentage"]) for h in t["Hooks"]])
    chain["cardaudio"] = ca
    # projectile prefab -> buildup/shot/impact
    pj = {}
    for r in refs:
        d = {a[1:]: b for a, b in r["refs"] if a.startswith(".AudioProjectile")}
        if not d:
            continue
        k = r["prefab"] or "(" + r["bundle"] + ":" + str(r["go"]) + ")"
        pj.setdefault(k, {}).update({a.replace("AudioProjectile", "").lower(): b for a, b in d.items()})
    chain["projectiles"] = pj
    # board: nền môi trường + nhạc combat
    bd = {}
    for r in refs:
        for a, b in r["refs"]:
            if a in (".boardEnvAudio", ".pvpCombatMusic"):
                bd.setdefault(r["bundle"].split("_assets")[0], {})[a[1:]] = b
    chain["boards"] = bd
    # trường đơn lẻ có tên (SoundEventListener, SoundCardHandler, ...)
    named = {}
    for r in refs:
        for a, b in r["refs"]:
            m = re.match(r"^\.([A-Za-z]+)$", a)
            if m and m.group(1) not in ("EventReference", "AudioProjectileShot", "AudioProjectileImpact",
                                         "AudioProjectileBuildup"):
                named.setdefault(m.group(1), set()).add(b)
    chain["named"] = {k: sorted(v) for k, v in sorted(named.items())}
    # thẻ -> projectile override (VFXOverrideKey); 117 khoá khác nhau trong cards.json
    cards = json.load(open(r"D:\bazaar-ref\db\json\cards.json", encoding="utf-8"))
    cm = {}

    def walk(o, rec):
        if isinstance(o, dict):
            k = o.get("VFXOverrideKey")
            if k:
                rec.add(k)
            for v in o.values():
                walk(v, rec)
        elif isinstance(o, list):
            for v in o:
                walk(v, rec)
    for c in cards:
        rec = set()
        walk(c, rec)
        if rec or c.get("AudioKey"):
            cm[c["Id"]] = dict(name=c.get("InternalName"), type=c.get("Type"), fx=sorted(rec),
                               audioKey=c.get("AudioKey") or None)
    chain["cards"] = cm
    json.dump(chain, open(META + r"\chain.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("chain: soundtracks", len(st), "cardaudio", len(ca), "projectile prefabs", len(pj), "boards", len(bd),
          "named", len(named), "cards with fx/audio", len(cm))



# ---------------------------------------------------------------- 5. render: chạy event qua FMOD (NRT) lấy tiếng thật
def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def build_jobs():
    """Danh sách việc render: dict(key, path, group, takes, maxsec, params?, tier).
    tier 1 = bắt buộc, 2 = nên có, 3 = thừa thì bỏ khi vượt ngân sách."""
    ev = {e["path"]: e for e in load_events()}
    chain = json.load(open(META + r"\chain.json", encoding="utf-8"))
    J = []

    def add(key, path, group, takes=1, maxsec=6.0, tier=2, params=None):
        if not path:
            return                                                   # hook chưa gán event (GUID không giải được)
        if path not in ev:
            print("  thiếu event", path)
            return
        J.append(dict(key=key, path=path, group=group, takes=takes, maxsec=maxsec, tier=tier, params=params or {},
                      rt=bool(ev[path]["stream"])))       # event stream: NRT bị đói dữ liệu -> phải chạy thời gian thực

    B = "event:/SFX/"
    # ---- UI (UI_Button_*: SoundUIEmitter -> UIClickEvent / _selectEvent trong prefab nút)
    for k, p, t in [("hover", "UI/Buttons/UI_Button_Hover", 1), ("click", "UI/Buttons/UI_Button_Click", 1),
                    ("back", "UI/Buttons/UI_Button_Back", 1), ("equip", "UI/Buttons/UI_Button_Equip", 1),
                    ("menuHover", "UI/Buttons/UI_MenuNav_Hover", 1), ("menuOpen", "UI/Buttons/UI_MenuNav_Open", 2),
                    ("play", "UI/Buttons/UI_Button_Play", 2), ("purchase", "UI/Buttons/UI_Button_Purchase", 2),
                    ("plus", "UI/Buttons/UI_Button_Plus", 3), ("minus", "UI/Buttons/UI_Button_Minus", 3),
                    ("replayRecap", "UI/Buttons/UI_Button_Replay_Recap", 3),
                    ("tournamentPreview", "UI/Buttons/UI_Tournament_PreviewParticipant", 3),
                    ("panelOpenClose", "UI/Buttons/UI_Button_Panel_OpenClose", 2)]:
        add("ui." + k, B + p, "ui", 1, 4, t, params="*" if k == "panelOpenClose" else None)
    # ---- bảng điều khiển / chỉ số (SoundEventListener.cs, field -> event lấy từ prefab 'Sound Listener')
    for k, p, t in [("reroll", "Board/BoardButtons/BoardButton_Reroll", 1), ("exit", "Board/BoardButtons/BoardButton_Exit", 1),
                    ("levelUp", "Board/LevelUp", 1), ("coinInsufficient", "Board/Money/Coin_Insufficient", 1),
                    ("dayTick", "Board/Panel/Panel_DayTick", 1), ("trophyGain", "Board/BoardProjectiles/Trophy/TrophyGain", 2),
                    ("trophyTick", "Board/Panel/Panel_Trophy_Tick", 3), ("losePrestige", "Board/Panel/Panel_LosePrestige", 3),
                    ("attrGold", "Board/StatChange/Attribute_Gold", 1), ("attrMaxHp", "Board/StatChange/Attribute_Max_HP", 2),
                    ("attrExp", "Board/StatChange/Attribute_Exp", 2), ("priceTagChange", "Board/Cards/CardBehavior/Card_PriceTagChange", 2),
                    ("gemFlash", "Board/Cards/CardBehavior/Card_GemFlash", 3), ("stashFlip", "Board/Stash/Stash_Flip", 2),
                    ("replayFlip", "Board/Stash/Replay_Flip", 3), ("hoverChest", "Board/HoverAnimation/Hover_Chest", 3),
                    ("hoverClock", "Board/HoverAnimation/Hover_Clock", 3), ("hoverTent", "Board/HoverAnimation/Hover_Tent", 3),
                    ("carpetRoll", "Board/Carpet/Carpet_Roll", 3), ("carpetRollEncounter", "Board/Carpet/Carpet_Roll_Encounter", 3),
                    ("encounterClick", "Board/Encounters/EncounterClickPresentation", 2),
                    ("pickerAppear", "Board/Encounters/EncounterPicker/EncounterPicker_Appear", 2),
                    ("pickerEnd", "Board/Encounters/EncounterPicker/EncounterPicker_End", 2),
                    ("portraitAppear", "Board/Encounters/Portraits/Portrait_Appear", 2),
                    ("portraitDisappear", "Board/Encounters/Portraits/Portrait_Disappear", 3),
                    ("portraitHover", "Board/Encounters/Portraits/Portrait_Mouse_Over", 2),
                    ("portraitUnhover", "Board/Encounters/Portraits/Portrait_Mouse_Away", 3),
                    ("invulnerability", "Board/LifeBar/Invulnerability", 3),
                    ("tickBurn", "Board/LifeBar/Burn_Tick", 1), ("tickPoison", "Board/LifeBar/Poison_Tick", 1),
                    ("tickRegen", "Board/LifeBar/Regenerate_Tick", 1), ("crit", "Board/LifeBar/Crit", 1),
                    ("sandstormEnter", "Board/Sandstorm/Sandstorm_LineEnter_Impact", 3),
                    ("sandstormBuildup", "Board/Sandstorm/Sandstorm_LineEnter_Buildup", 3),
                    ("sandstorm", "Board/Sandstorm/Sandstorm", 3), ("slowMotion", "Board/SlowMotion", 3)]:
        add("board." + k, B + p, "board", 1, 6, t)
    add("board.spaceInsufficient", B + "Board/Money/Space_Insufficient", "board", 1, 2, 1)
    add("board.itemUnsellable", B + "Board/Money/Item_Unsellable", "board", 1, 2, 1)
    # ---- thẻ (SoundCardHandler.cs + SoundEventListener.cs, tham số FMOD gán bằng nhãn)
    for k, p, t in [("appear", "Cards/CardBehavior/Card_Appear", 2), ("destroy", "Cards/CardBehavior/Card_Destroy", 1),
                    ("drop", "Cards/CardBehavior/Card_Drop", 1), ("pickup", "Cards/CardMovement/Card_Pickup", 1),
                    ("raise", "Cards/CardMovement/Card_Raise", 1), ("lower", "Cards/CardMovement/Card_Lower", 1),
                    ("slide", "Cards/CardMovement/Card_Slide", 1), ("pinata", "Cards/CardBehavior/Card_Pinata", 3),
                    ("statBuff", "Cards/CardBehavior/Card_Stat_Buff", 2), ("spinBoard", "Cards/CardBehavior/Card_Spin_Board", 3),
                    ("spinChest", "Cards/CardBehavior/Card_Spin_Chest", 3),
                    ("fuseSpinUp", "Cards/CardBehavior/Card_Fuse_Spin_Up", 3), ("fuseSpinDown", "Cards/CardBehavior/Card_Fuse_Spin_Down", 3),
                    ("revealDiscoveredFlip", "Cards/CardReveal/Card_Reveal_Discovered_Flip", 3),
                    ("revealDiscoveredLand", "Cards/CardReveal/Card_Reveal_Discovered_Land", 3),
                    ("revealFlipBronze", "Cards/CardReveal/Card_Reveal_Flip_Bronze", 2),
                    ("revealFlipSilver", "Cards/CardReveal/Card_Reveal_Flip_Silver", 2),
                    ("revealFlipGold", "Cards/CardReveal/Card_Reveal_Flip_Gold", 2),
                    ("revealLiftStandard", "Cards/CardReveal/Card_Reveal_Lift_Standard", 3),
                    ("spawnImpact", "Cards/CardReveal/Card_Spawn_Impact", 2), ("socket", "Sockets/Socket_MusicalSlots", 3)]:
        add("card." + k, B + "Board/" + p, "card", 1, 4, t)
    for p, key, tier in [("Cards/CardMovement/Card_Land", "card.land", 1), ("Cards/CardBehavior/Card_Fuse_Main", "card.fuse", 1),
                         ("Cards/CardBehavior/Card_Upgrade", "card.upgrade", 1)]:
        add(key, B + "Board/" + p, "card", 1, 4, tier, params="*")         # '*' = mỗi nhãn một việc
    add("card.enchant", B + "Board/Cards/CardBehavior/Card_Enchantment", "card", 1, 4, 2, params="*")
    add("card.enchantCombat", B + "Board/Cards/CardBehavior/Card_Enchantment_Combat", "card", 1, 4, 3, params="*")
    for n in ("Skill_Destroy", "Skill_Hover", "Skill_Interact_Drop", "Skill_Interact_PickUp", "Skill_Interact_Reset",
              "Skill_Panel_Flip", "Skill_Panel_Merge", "Skill_Reveal_Fall", "Skill_Reveal_Flip", "Skill_Reveal_Initial",
              "Skill_Reveal_Land", "Skill_Update_AllSizes"):
        add("skill." + slug(n[6:]), B + "Board/Skills/" + n, "skill", 1, 5, 2 if n.startswith(("Skill_Interact", "Skill_Hover")) else 3)
    for n in ("Spell_Appear", "Spell_Disappear", "Spell_Select"):
        add("spell." + slug(n[6:]), B + "Board/Spells/" + n, "board", 1, 4, 3)
    for n in ("Pedestal_Drop", "Pedestal_Item_Enchant_Start", "Pedestal_Item_Enchant_End", "Pedestal_Item_Zoom",
              "Pedestal_Item_Explode", "Pedestal_PowerDown", "Pedestal_LightPulse"):
        add("pedestal." + slug(n[9:]), B + "Board/Pedestal/" + n, "board", 1, 5, 3)
    for n in ("Fates_Appear_Build", "Fates_Appear_Impact", "Fates_Exit", "Fates_Hint", "Fates_Projectile_Shot", "Fates_Projectile_Impact"):
        add("fates." + slug(n[6:]), B + "Board/Encounters/Fates/" + n, "board", 1, 8, 3)
    for n in ("HaddyWheel_Fanfare", "HaddyWheel_In", "HaddyWheel_Lever", "HaddyWheel_Lock", "HaddyWheel_Out", "HaddyWheel_Spoke"):
        add("haddy." + slug(n[12:]), B + "Board/Encounters/HaddyWheel/" + n, "board", 1, 5, 3)
    for n in ("MagicMirror_Drag_In", "MagicMirror_Drag_Out", "MagicMirror_In", "MagicMirror_Out", "MagicMirror_Stash"):
        add("mirror." + slug(n[12:]), B + "Board/Encounters/MagicMirror/" + n, "board", 1, 5, 3)
    # ---- chuyển cảnh / banner
    for k, p, t, m in [("combat", "Sequences/Transitions/Transition_Combat", 1, 18), ("pvp", "Sequences/Transitions/Transition_PvP", 2, 4),
                       ("pvpEnd", "Sequences/Transitions/Transition_PvP_End", 3, 4), ("pvpSwords", "Sequences/Transitions/Transition_PvP_Swords", 2, 6),
                       ("newDay", "Sequences/Transitions/Transition_NewDay", 1, 6), ("newDayClock", "Sequences/Transitions/Transition_NewDay_ClockTurn", 3, 4),
                       ("boardIn", "Sequences/Transitions/Transition_Board_Default_In", 2, 8), ("boardOut", "Sequences/Transitions/Transition_Board_Default_Out", 2, 4),
                       ("victoryIn", "Sequences/Transitions/Transition_VictoryDefeatBanner_Victory_In", 1, 3),
                       ("victoryOut", "Sequences/Transitions/Transition_VictoryDefeatBanner_Victory_Out", 3, 2),
                       ("defeatIn", "Sequences/Transitions/Transition_VictoryDefeatBanner_Defeat_In", 1, 3),
                       ("defeatOut", "Sequences/Transitions/Transition_VictoryDefeatBanner_Defeat_Out", 3, 2)]:
        add("trans." + k, B + p, "trans", 1, m, t)
    # ---- chiến đấu: mọi event SFX/Combat (projectile Shot/Impact/Buildup; chuỗi: Projectile prefab -> SoundProjectile)
    for p, e in sorted(ev.items()):
        if p.startswith("event:/SFX/Combat/") and e["len"] > 0:
            base = p.rsplit("/", 1)[1]
            add("combat." + slug(base), p, "combat", 2 if e["len"] < 1600 else 1, 5, 1 if re.search(
                r"/(Common|Heal|Shield|Poison|Burn|Freeze|Haste|Slow|Cooldown|CritGain|Gunshot|Slash|Blunt|Arrow|Cannonball|Fireball|Electric|Coin|Bite|Pierce|Punch|Dam)/", p) else 2)
    add("combat.hitStun", "event:/SFX/Combat/HitStun", "combat", 1, 3, 2)
    # sự kiện của SoundProjectile (prefab ActionType mặc định) mà vòng trên bỏ sót: len=0 (Heal_Impact, Joy_Impact: có thể câm thật)
    # hoặc nằm ngoài SFX/Combat (SFX/Board/BoardProjectiles/*). Xem VFXMAP.md "event thiếu trong BZ_AUDIO".
    for p, m in [("Combat/Heal/Heal_Impact", 3), ("Combat/Joy/Joy_Impact", 3),
                 ("Board/BoardProjectiles/Expereince/Experience_Shot", 6), ("Board/BoardProjectiles/Expereince/Experience_Impact", 6),
                 ("Board/BoardProjectiles/Destroy/Destroy_Impact", 6), ("Board/BoardProjectiles/PortraitSwap/PortraitSwap_Shot", 6)]:
        add("combat." + slug(p.rsplit("/", 1)[1].replace("Expereince", "Experience")), B + p, "combat", 1, m, 1)
    # ---- nhạc ngắn
    add("music.endrun.win", "event:/Music/Music_EndRun_Win", "music", 1, 16, 1)
    add("music.endrun.lose", "event:/Music/Music_EndRun_Lose", "music", 1, 14, 1)
    # ---- VO: event VO/* đều là stream=1 và NRT làm lặp mẫu ngắn => lấy thẳng clip trong FSB, ghép bằng tên mẫu.
    # Hero: hook (CardAudio SO) -> thân tên clip; nhãn tham số (Victory/Defeat/Left/Right) chọn thân khác.
    for so, hero, t in [("VanessaAudioSO", "vanessa", 1), ("PygAudioSO", "pygmalien", 1), ("DooleyAudioSO", "dooley", 1),
                        ("JulesAudioSO", "jules", 3), ("KarnokAudioSO", "karnok", 3), ("MakAudioSO", "mak", 3),
                        ("StelleAudioSO", "stelle", 3), ("TheDragonsAudioSO", "dragons", 3)]:
        c = chain["cardaudio"].get(so)
        if not c:
            print("  thiếu CardAudio", so)
            continue
        for h in c["hooks"]:
            suffix = h["event"].rsplit("_", 1)[1] if h["event"] else None
            if not suffix:
                continue
            evn = h["event"].split("/")[-1]                    # VO_Vanessa_Run_VictoryDefeat
            stem = re.sub(r"^vo_[a-z0-9]+_", "", evn.lower()).replace("_", "")
            if "victorydefeat" in stem:
                for lab in ("victory", "defeat", "perfect"):
                    if lab == "perfect" and not stem.startswith("run"):
                        continue
                    if stem.startswith("pvpv") or stem.startswith("pvev") or stem.startswith("runv"):
                        J.append(dict(kind="clip", key="vo.%s.%s%s" % (hero, stem.replace("victorydefeat", ""), lab),
                                      bank=c["bank"], stem=stem.replace("victorydefeat", lab), group="vo", tier=t, max=3))
            else:
                J.append(dict(kind="clip", key="vo.%s.%s" % (hero, slug(h["type"][2:])), bank=c["bank"],
                              stem=stem, group="vo", tier=t, max=3 if t == 1 else 2))
    for so, c in sorted(chain["cardaudio"].items()):
        nm = slug(so.replace("AudioSO", ""))
        if c["group"] == "merchants":
            t = 2 if nm in ("vanessamerchant", "pygmerchant", "dooleymerchant") else 3
            for h in c["hooks"]:
                if h["type"] in ("OnEnter", "OnBuy", "OnIdle"):
                    st = {"OnEnter": "enter", "OnBuy": "exit", "OnIdle": "idle"}[h["type"]]
                    J.append(dict(kind="clip", key="vo.merchant.%s.%s" % (nm, slug(h["type"][2:])), bank=c["bank"],
                                  stem=st, group="vo", tier=t, max=2))
        elif c["group"] == "monsters":
            nvb = c["nonverbal"]
            hooks = [h for h in c["hooks"] if h["type"] == "OnEnter"] or [None]
            J.append(dict(kind="clip", key="vo.monster.%s" % nm, bank=c["bank"], stem="" if nvb else "enter",
                          group="vo", tier=3, max=2))
    # ---- môi trường theo board (boardEnvAudio là nền lặp; pvpCombatMusic là nhạc combat) — chỉ Vanessa/Pyg/Dooley
    bmap = {"board_van": "vanessa", "board_pyg": "pygmalien", "board_doo": "dooley"}
    for b, hero in bmap.items():
        d = chain["boards"].get(b)
        if d:
            add("ambience." + hero, d["boardEnvAudio"], "ambience", 1, 30, 1)
            add("music.battle." + hero, d["pvpCombatMusic"], "music", 1, 82, 1)
    for hero, folder in (("vanessa", "Vanessa"), ("pygmalien", "Pyg"), ("dooley", "Dooley")):
        for p, e in sorted(ev.items()):
            if p.startswith("event:/SFX/Environment/%s/" % folder) and 0 < e["len"] < 6000:
                add("env.%s.%s" % (hero, slug(p.rsplit("/", 1)[1].replace("Env_", ""))), p, "env", 1, 6, 3)
    for n in ("Click_Coin", "Click_Crystal", "Click_Dirt", "Click_Fabric", "Click_Grass", "Click_Metal_Solid", "Click_Mushroom",
              "Click_Plant", "Click_Rock", "Click_Rug", "Click_Splinter", "Click_Water", "Click_Wood"):
        add("board.material." + slug(n[6:]), B + "Board/MaterialClicks/" + n, "board", 2, 4, 2)
    add("music.pve", "event:/Music/Music_PvE", "music", 1, 82, 2)
    add("music.mainMenu", "event:/Music/Music_MainMenu", "music", 1, 82, 2)
    return J


def render_chunk(S_jobs, ci, need, rt=False):
    """Một lần khởi tạo FMOD cho một nhóm việc (tránh tệp wav > 2 GB). Trả về plan."""
    wavp = RENDER + "/nrt_chunk.wav"
    S = Studio(("wav:" if rt else "nrt:") + wavp)
    upd = S.update
    for n in need:
        S.load(n + ".bank")
        if os.path.exists(BANKS + "\\" + n + ".assets.bank"):
            S.load(n + ".assets.bank")
    S.update()
    C = S.C
    plan = []
    BLK = 1024
    for _ in range(8):
        S.update()
    for j in S_jobs:
        d = S.get_event(j["path"])
        if d is None:
            print("  event không nạp được", j["path"])
            continue
        S.D.FMOD_Studio_EventDescription_LoadSampleData(d)           # bẫy: không nạp trước thì mẫu đến trễ ~0,5 s hoặc câm
        for i in range(600):
            upd()
            if rt:
                time.sleep(0.005)
            ls = C.c_int()
            S.D.FMOD_Studio_EventDescription_GetSampleLoadingState(d, C.byref(ls))
            if ls.value in (3, 4):                                  # 3 = LOADED
                break
        combos = [(None, None)]
        if j["params"] == "*":
            ps = [p for p in S.params_of(d) if p[4]]
            if ps:
                combos = [(ps[0][0], lab) for lab in ps[0][4]]
        for pname, lab in combos:
            spans = []
            for tk in range(j["takes"]):
                inst = C.c_void_p()
                S.D.FMOD_Studio_EventDescription_CreateInstance(d, C.byref(inst))
                if pname:
                    r = S.D.FMOD_Studio_EventInstance_SetParameterByNameWithLabel(inst, pname.encode(), lab.encode(), 0)
                    if r:
                        print("  tham số lỗi", j["key"], pname, lab, r)
                S.D.FMOD_Studio_EventInstance_Start(inst)
                c0 = S.clock()
                maxb = int(j["maxsec"] * 48000 / BLK) + 1
                stopped = False

                def step():
                    S.update()
                    if rt:
                        time.sleep(0.012)

                def state():
                    st = C.c_int()
                    S.D.FMOD_Studio_EventInstance_GetPlaybackState(inst, C.byref(st))
                    return st.value
                i = 0
                while True:
                    step()
                    i += 1
                    if state() == 2:
                        stopped = True
                        break
                    if (S.clock() - c0 if rt else i * BLK) >= j["maxsec"] * 48000:
                        break
                if not stopped:
                    S.D.FMOD_Studio_EventInstance_Stop(inst, 0)          # 0 = cho phép fade-out
                    for i in range(120 if rt else 48):
                        step()
                        if state() == 2:
                            break
                c1 = S.clock()
                S.D.FMOD_Studio_EventInstance_Release(inst)
                for i in range(30 if rt else 6):
                    step()
                spans.append((c0, c1, stopped))
            plan.append(dict(key=j["key"], group=j["group"], path=j["path"], tier=j["tier"], label=lab, spans=spans))
    S.release()
    # cắt wav thành từng lần chạy
    w = wave.open(wavp)
    assert w.getframerate() == 48000 and w.getnchannels() == 2 and w.getsampwidth() == 2
    for p in plan:
        stem = slug(p["key"] + ("_" + p["label"] if p["label"] else ""))
        p["files"] = []
        for k, (c0, c1, stopped) in enumerate(p["spans"]):
            w.setpos(c0)
            fr = w.readframes(c1 - c0)
            fn = RENDER + "/%s__t%d.wav" % (stem, k)
            o = wave.open(fn, "wb")
            o.setnchannels(2); o.setsampwidth(2); o.setframerate(48000)
            o.writeframes(fr)
            o.close()
            p["files"].append(os.path.basename(fn))
    w.close()
    os.remove(wavp)
    return plan


def stage_render(only=None, chunk=120):
    jobs = [j for j in build_jobs() if j.get("kind") != "clip"]
    if only:
        jobs = [j for j in jobs if re.search(only, j["key"])]
    need = ["Master", "Master.strings", "Common", "MainMenu"] + [os.path.basename(p)[:-5] for p in sorted(glob.glob(BANKS + r"\Board*.bank")) if not p.endswith(".assets.bank")] + [os.path.basename(p)[:-5] for p in sorted(glob.glob(BANKS + r"\VO_*.bank")) if not p.endswith(".assets.bank")]
    allplan = []
    t0 = time.time()
    for rt in (False, True):
        sub = [j for j in jobs if j["rt"] == rt]
        for ci in range(0, len(sub), chunk if not rt else 40):
            ch = chunk if not rt else 40
            allplan += render_chunk(sub[ci:ci + ch], ci // ch, need, rt)
            print("  render", "rt" if rt else "nrt", min(ci + ch, len(sub)), "/", len(sub), round(time.time() - t0), "s", flush=True)
    pf = META + "/render_plan.json"
    old = []
    if only and os.path.exists(pf):
        keep = set(p["key"] for p in allplan)
        old = [p for p in json.load(open(pf)) if p["key"] not in keep]
    json.dump(old + allplan, open(pf, "w"), indent=0)
    print("render xong:", len(allplan), "mục")



# ---------------------------------------------------------------- 6. export: cắt lặng, chuẩn mức, mã hoá ogg, ghi audio.js
BUDGET_MB = 32.0
GROUP_VOL = {"music": 0.55, "ambience": 0.5, "env": 0.8, "vo": 1.0}      # âm lượng gợi ý (đã chuẩn hoá từng nhóm)


def read_wav(fn):
    import numpy as np
    w = wave.open(fn)
    n = w.getnframes()
    ch = w.getnchannels()
    sw = w.getsampwidth()
    raw = w.readframes(n)
    w.close()
    if sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 4:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise ValueError("wav %d byte/mẫu" % sw)
    return a.reshape(-1, ch), w.getframerate()


def to_mono(a):
    return a.mean(axis=1, keepdims=True) if a.shape[1] > 1 else a


def trim(a, sr, tail_ms=40, thr_rel=0.004, floor=0.0008):
    import numpy as np
    m = np.abs(a).max(axis=1)
    pk = float(m.max()) if len(m) else 0.0
    if pk < 1e-4:
        return None
    thr = max(pk * thr_rel, floor)
    nz = np.nonzero(m > thr)[0]
    s = max(0, int(nz[0]) - int(0.004 * sr))
    e = min(len(a), int(nz[-1]) + int(tail_ms / 1000.0 * sr))
    a = a[s:e].copy()
    f = min(len(a), int(0.015 * sr))
    if f > 1:
        a[-f:] *= np.linspace(1, 0, f, dtype=np.float32)[:, None]
    fi = min(len(a), int(0.002 * sr))
    if fi > 1:
        a[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    return a


def make_loop(a, sr, T, X):
    """Vòng lặp liền mạch: giữ a[0:T], trộn X giây đầu với a[T:T+X] (phần đuôi) để mối nối khớp."""
    import numpy as np
    if len(a) < int((T + X) * sr):
        return a
    T = int(T * sr); X = int(X * sr)
    out = a[:T].copy()
    fi = np.linspace(0, 1, X, dtype=np.float32)[:, None]
    out[:X] = a[:X] * fi + a[T:T + X] * (1 - fi)
    return out


def write_wav16(fn, a, sr):
    import numpy as np
    w = wave.open(fn, "wb")
    w.setnchannels(a.shape[1]); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())
    w.close()


def encode(a, sr, out, music=False):
    tmp = RENDER + "/_enc.wav"
    write_wav16(tmp, a, sr)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    br = "96k" if music else "64k"
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-ac", str(a.shape[1]), "-c:a", "libvorbis",
                        "-b:a", br, out], capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors="replace"))
    return os.path.getsize(out)


def norm_stem(name, hero_words=()):
    n = name.lower()
    n = re.sub(r"v\d+$", "", n)                       # hậu tố _V2
    n = re.sub(r"[^a-z]", "", n)                      # bỏ số, gạch dưới
    return n


def clip_files(bank, stem):
    """Clip FSB của bank khớp thân tên (đã bỏ số/gạch/tên nhân vật). stem='' lấy hết."""
    d = CLIPS + "\\" + bank
    if not os.path.isdir(d) or not os.listdir(d):
        stage_clips([bank])
    out = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".wav"):
            continue
        nm = norm_stem(fn[:-4])
        if stem == "":
            out.append(d + "\\" + fn)
        elif re.search(CLIP_MATCH.get(stem, stem + "$"), nm):
            out.append(d + "\\" + fn)
    return out


CLIP_MATCH = {"idle": "idl?e$", "enter": "enter", "exit": "exit"}      # AilaIde (gõ sai trong dữ liệu gốc), PlayerEnterXShop


def pick(files, k):
    if len(files) <= k:
        return files
    step = len(files) / float(k)
    return [files[int(i * step)] for i in range(k)]


MUSIC_PICK = {          # soundtrack SO -> các bài chọn (chỉ số trong playlist)
    "vanessa": [0, 1, 2, 3, 4, 5], "pyg": [0, 1, 2, 3], "dooley": [0, 1, 2, 3],
}
HERO_MUSIC_KEY = {"vanessa": "vanessa", "pyg": "pygmalien", "dooley": "dooley"}


def stage_export():
    import numpy as np
    plan = json.load(open(META + r"\render_plan.json"))
    chain = json.load(open(META + r"\chain.json", encoding="utf-8"))
    jobs = build_jobs()
    items = []      # dict(key, group, tier, srcs=[(arr float32 [n,ch], sr)], loop, music, event)
    # --- sự kiện đã render
    for p in plan:
        key = p["key"] + (("." + slug(p["label"])) if p["label"] else "")
        srcs = []
        for f in p["files"]:
            a, sr = read_wav(RENDER + "/" + f)
            srcs.append((a, sr))
        items.append(dict(key=key, group=p["group"], tier=p["tier"], srcs=srcs, event=p["path"],
                          loop=p["group"] == "ambience" or p["key"].startswith("music.battle") or p["key"] in ("music.pve", "music.mainMenu"),
                          music=p["group"] == "music", span=[(s[1] - s[0]) / 48000.0 for s in p["spans"]]))
    # --- clip VO
    for j in jobs:
        if j.get("kind") != "clip":
            continue
        fl = pick(clip_files(j["bank"], j["stem"]), j["max"])
        if not fl:
            continue
        srcs = [read_wav(f) for f in fl]
        items.append(dict(key=j["key"], group="vo", tier=j["tier"], srcs=srcs, event=None, loop=False, music=False,
                          clips=[os.path.basename(f)[:-4] for f in fl]))
    # --- nhạc playlist theo hero (clip nguyên bài trong FSB của bank Music_*)
    for so, tracks in chain["soundtracks"].items():
        hero = so.replace("Music_Soundtrack_", "").replace("_SO", "").lower()
        if hero not in HERO_MUSIC_KEY:
            continue
        for ti in MUSIC_PICK[hero]:
            t = tracks["tracks"][ti]
            fl = clip_files(t["bank"], "")
            if not fl:
                print("  thiếu clip nhạc", t["bank"])
                continue
            a, sr = read_wav(fl[0])
            items.append(dict(key="music.%s.%d" % (HERO_MUSIC_KEY[hero], ti + 1), group="music",
                              tier=1 if ti < (3 if hero == "vanessa" else 2) else 3, srcs=[(a, sr)],
                              event=t["event"], loop=False, music=True, track=t["name"], playlist=True))
    # --- xử lý: mono/trim/loop
    out = []
    for it in items:
        srcs = []
        for a, sr in it["srcs"]:
            if it["music"]:
                if it["loop"] or it.get("playlist"):
                    pass
                a = a if a.shape[1] == 2 else np.repeat(a, 2, axis=1)
                # bỏ lặng đầu/cuối nhưng không fade-out ngắn: nhạc fade dài
                m = np.abs(a).max(axis=1)
                nz = np.nonzero(m > 0.002)[0]
                if len(nz) == 0:
                    continue
                a = a[nz[0]:nz[-1] + 1].copy()
                if len(a) > 90 * sr:
                    a = make_loop(a, sr, 86, 4)                 # <= 90 s, mối nối trộn 4 s
                    it["loop"] = True
                elif it["loop"] and len(a) > 20 * sr:
                    X = min(3, len(a) / sr / 4.0)
                    a = make_loop(a, sr, len(a) / sr - X - 0.01, X)
                else:
                    f = min(len(a), int(1.5 * sr))
                    a[-f:] *= np.linspace(1, 0, f, dtype=np.float32)[:, None]
            elif it["loop"]:                                    # nền môi trường: bỏ 1 s đầu (lúc FMOD đang tăng dần), vòng lặp
                a = to_mono(a)[int(0.5 * sr):]
                T = (len(a) / sr) - 3.0
                a = make_loop(a, sr, T, 2.5) if T > 8 else a
            else:
                a = trim(to_mono(a), sr)
                if a is None:
                    continue
            srcs.append((a, sr))
        if srcs:
            it["proc"] = srcs
            out.append(it)
    items = out
    # --- chuẩn mức từng nhóm: p90 của đỉnh các khoá (SFX) / RMS (nhạc, nền)
    gains = {}
    for g in sorted(set(i["group"] for i in items)):
        its = [i for i in items if i["group"] == g]
        if g in ("music", "ambience"):
            rms = [float(np.sqrt((a.astype(np.float64) ** 2).mean())) for i in its for a, sr in i["proc"]]
            ref = float(np.percentile(rms, 50))
            gains[g] = min(0.12 / max(ref, 1e-4), 12.0)
        else:
            pk = [float(np.abs(a).max()) for i in its for a, sr in i["proc"]]
            ref = float(np.percentile(pk, 90))
            gains[g] = min(0.55 / max(ref, 1e-4), 24.0)
    for it in items:
        g = gains[it["group"]]
        for k, (a, sr) in enumerate(it["proc"]):
            a = a * g
            pk = float(np.abs(a).max())
            if pk > 0.97:
                a = a * (0.97 / pk)
            it["proc"][k] = (a, sr)
    # --- ngân sách: tier 3 rồi giảm biến thể
    def est(it):
        return sum(len(a) / float(sr) * (12000.0 if it["music"] else 8000.0) + 4500 for a, sr in it["proc"])
    # tier 1+2 luôn lấy; tier 3 thêm dần theo ưu tiên (board/thẻ -> nền môi trường -> nhạc phụ -> VO phụ) tới hết ngân sách
    PRIO = {"env": 1, "vo": 2, "music": 3}
    keep = [i for i in items if i["tier"] < 3]
    used = sum(est(i) for i in keep)
    cap = BUDGET_MB * 1048576 * 0.97
    for it in sorted([i for i in items if i["tier"] >= 3], key=lambda i: (PRIO.get(i["key"].split(".")[0], 0), est(i))):
        if used + est(it) <= cap:
            keep.append(it)
            used += est(it)
    items = keep
    print("export: %d khoá, ước tính %.1f MB" % (len(items), sum(est(i) for i in items) / 1048576.0))
    # --- ghi tệp
    if os.path.isdir(OUT_AUDIO):
        shutil.rmtree(OUT_AUDIO)
    os.makedirs(OUT_AUDIO)
    table = {}
    total = 0
    for it in sorted(items, key=lambda x: x["key"]):
        grp, rest = it["key"].split(".", 1)
        files = []
        durs = []
        for k, (a, sr) in enumerate(it["proc"]):
            nm = rest if len(it["proc"]) == 1 else "%s_%d" % (rest, k + 1)
            rel = "audio/%s/%s.ogg" % (grp, nm)
            sz = encode(a, sr, os.path.join(REPO, rel), it["music"])
            total += sz
            files.append(rel)
            durs.append(round(len(a) / float(sr), 2))
        e = dict(src=files, loop=bool(it["loop"]), vol=GROUP_VOL.get(it["group"], 0.9), dur=durs[0] if len(durs) == 1 else durs,
                 group=it["group"])
        if it.get("event"):
            e["event"] = it["event"]
        if it.get("track"):
            e["track"] = it["track"]
        if it.get("clips"):
            e["clips"] = it["clips"]
        table[it["key"]] = e
    print("export: %d tệp ogg, %.2f MB" % (sum(len(v["src"]) for v in table.values()), total / 1048576.0))
    write_audio_js(table, chain)
    json.dump(dict(total_bytes=total, keys=len(table), gains=gains), open(META + r"\export_stats.json", "w"))


def write_audio_js(table, chain):
    # projectile prefab -> khoá buildup/shot/impact (chỉ khi cả event đó có trong bảng)
    by_event = {}
    for k, v in table.items():
        if v.get("event"):
            by_event.setdefault(v["event"], k)
    fx = {}
    for prefab, d in sorted(chain["projectiles"].items()):
        nm = os.path.basename(prefab).replace(".prefab", "")
        if nm.startswith("("):
            continue
        row = {}
        for slot in ("buildup", "shot", "impact"):
            ek = by_event.get(d.get(slot))
            if ek:
                row[slot] = ek
        if row:
            fx.setdefault(nm, row)
    # khoá ngữ nghĩa cho hành động chiến đấu = prefab MẶC ĐỊNH của ActionType (VFXMAP.md §3: BazaarVFXManagerSO._projectilesByActionMap /
    # _projectilesByCardAttributeMap) -> SoundProjectile của prefab đó (buildup/shot/impact, chain.json). Không còn đoán theo tên thư mục.
    ACTION_PREFAB = {"damage": "Projectile_Damage_Base_PV", "heal": "Projectile_Heal_PV", "regen": "Projectile_HealReg_PV",
                     "maxHp": "Projectile_MaxHP_PV", "shield": "Projectile_Shield_PV", "burn": "Projectile_Burn_PV",
                     "poison": "Projectile_Poison_PV", "joy": "Projectile_Joy_PV", "freeze": "Projectile_Freeze_PV",
                     "haste": "Projectile_Haste_PV", "slow": "Projectile_Slow_PV", "charge": "Projectile_Charged_S_PV",
                     "reload": "Projectile_S_Reload_01_PV", "repair": "Projectile_Repair_S_PV", "destroy": "Projectile_S_AntimatterChamber_PV",
                     "disable": "Projectile_Destroy_S_PV", "transform": "Projectile_Transform_PV", "goldSteal": "Projectile_CoinBurst_PV",
                     "experience": "FX_Projectile_Experience_PV", "portraitSwap": "Projectile_PortraitSwap_PV",
                     "questComplete": "Projectile_QuestComplete_S_PV", "flyStart": "Projectile_FlyStart_PV", "flyStop": "Projectile_FlyStop_PV"}
    alias = {}
    for act, nm in ACTION_PREFAB.items():
        alias["combat." + act] = fx.get(nm, {})          # {} = prefab có thật nhưng không có SoundProjectile (câm trong game)
    # [ĐỀ XUẤT] không có prefab mặc định theo ActionType trong game cho 3 việc này; giữ khoá cũ để mã gọi không vỡ
    alias["combat.cooldownUp"] = {"buildup": "combat.cooldown_increase_buildup"}
    alias["combat.cooldownDown"] = {"buildup": "combat.cooldown_decrease_buildup"}
    alias["combat.crit"] = {"shot": "combat.critgain_shot", "impact": "combat.critgain_impact"}
    # thẻ -> projectile override + khoá VO (CardAudio)
    cards = {}
    for cid, c in chain["cards"].items():
        nm = [os.path.basename(x).replace(".prefab", "") for x in c["fx"]]
        nm = [x for x in nm if x in fx]
        vk = None
        if c["audioKey"]:
            vk = re.sub(r"^.*/", "", c["audioKey"]).replace(".assets", "").replace(".asset", "")
        if nm or (vk and vk != "Invalid"):
            cards[cid] = dict(n=c["name"], fx=nm)
            if vk and vk != "Invalid":
                cards[cid]["voice"] = vk
    # tên ngữ nghĩa -> khoá thật (chỉ giữ cái có trong bảng). [ĐỀ XUẤT] đánh dấu: game gốc không có SFX riêng cho việc đó
    AL = {"ui.reroll": "board.reroll", "ui.hover": "ui.hover", "ui.click": "ui.click",
          "ui.drag": "card.pickup",                      # SoundCardHandler.SoundCardPickup
          "ui.drop": "card.land.player",                 # SoundCardHandler.SoundCardLand (Card_Land_Parameter=Player)
          "ui.buy": "card.drop",                         # [ĐỀ XUẤT] game gốc chỉ phát VO OnBuy; Card_Drop là tiếng thẻ rơi vào ô
          "ui.sell": "board.attrGold",                   # [ĐỀ XUẤT] gốc chỉ phát VO OnSellItem*; Attribute_Gold là tiếng vàng đổi
          "ui.noGold": "board.coinInsufficient", "ui.noSpace": "board.spaceInsufficient", "ui.levelUp": "board.levelUp",
          "combat.crit": "board.crit", "combat.burnTick": "board.tickBurn", "combat.poisonTick": "board.tickPoison",
          "combat.regenTick": "board.tickRegen",
          "music.board.vanessa": "music.vanessa.1", "music.board.pygmalien": "music.pygmalien.1",
          "music.board.dooley": "music.dooley.1", "music.vanessa": "music.vanessa.1", "music.pygmalien": "music.pygmalien.1",
          "music.dooley": "music.dooley.1"}
    AL = {k: v for k, v in AL.items() if v in table and k != v}
    # AudioKey -> CardAudio SO -> khoá âm đã xuất (thương nhân: enter/buy/idle; quái: một khoá chung)
    voice = {}
    for so, c in chain["cardaudio"].items():
        nm = slug(so.replace("AudioSO", ""))
        row = {}
        for k in table:
            if k.startswith("vo.merchant.%s." % nm):
                row[k.rsplit(".", 1)[1]] = k
            elif k == "vo.monster.%s" % nm:
                row["enter"] = k
        if row:
            voice[so] = row
    hdr = "// sinh bởi tools/audio.py - đừng sửa tay. Nguồn: FMOD banks trong Addressables của bản demo Steam (xem D:\\bazaar-ref\\notes\\AUDIO.md).\n"
    js = hdr
    js += "window.BZ_AUDIO = {\n" + ",\n".join(
        "  %s: %s" % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(",", ":"))) for k, v in sorted(table.items())) + "\n};\n"
    js += "// tên ngữ nghĩa -> khoá thật\nwindow.BZ_AUDIO_ALIAS = " + json.dumps(AL, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "// CardAudio SO (AudioKey của thẻ gặp gỡ) -> khoá VO đã xuất. Chỉ có thương nhân/quái; VO sự kiện (VO_Events) chưa xuất\n"
    js += "window.BZ_AUDIO_VOICE = " + json.dumps(voice, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "// prefab projectile (VFXOverrideKey của thẻ, bỏ .prefab và thư mục) -> khoá âm buildup/shot/impact\n"
    js += "window.BZ_AUDIO_FX = " + json.dumps(fx, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "// khoá ngữ nghĩa cho hành động chiến đấu mặc định (prefab mặc định của ActionType, đo từ BazaarVFXManagerSO; cooldownUp/Down/crit là [ĐỀ XUẤT])\n"
    js += "window.BZ_AUDIO_ACTION = " + json.dumps(alias, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "// thẻ (Id trong cards.json) -> {n: tên, fx: [prefab], voice: AudioKey đã chuẩn hoá}\n"
    js += "window.BZ_AUDIO_CARDS = " + json.dumps(cards, ensure_ascii=False, separators=(",", ":")) + ";\n"
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    open(OUT_JS, "w", encoding="utf-8").write(js)
    print("audio.js: %d khoá, %d fx, %d thẻ, %.0f KB" % (len(table), len(fx), len(cards), len(js) / 1024.0))


if __name__ == "__main__":
    st = sys.argv[1:] or ["all"]
    for s in st:
        if s in ("banks", "all"): stage_banks()
        if s in ("events", "all"): stage_events()
        if s in ("clips", "all"): stage_clips()
        if s in ("chain", "all"): stage_chain()
        if s == "map": stage_map()
        if s in ("render", "all"): stage_render(os.environ.get("ONLY"))
        if s in ("export", "all"): stage_export()
