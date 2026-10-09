"""
Bóc clip hoạt hình (AnimationClip) và máy trạng thái (AnimatorController) của DREDGE ra games/dredge/data/animlib.js.

Nguồn (YAML của AssetRipper, đã giải nén m_MuscleClip; chỉ đọc, không sửa):
  D:\\dredge-ref\\ripped\\ExportedProject\\Assets\\{AnimationClip, AnimatorController, AnimatorOverrideController, GameObject, Sprite}
  (đổi gốc bằng biến môi trường DREDGE_RIP)
  games/dredge/art/portraits/<prefab>/*.webp   (danh sách prefab chân dung = thư mục con do tools/yarn.py bóc)
  games/dredge/data/yarn.js                    (chỉ để đối chiếu bố cục lớp chân dung; không có thì bỏ qua bước đó)

Đầu ra (window.DR_ANIM, tệp JS sinh ra, đầu tệp ghi "do not edit"):
  clips[tên]        { len, loop, curves:[{path, prop, [cls], keys:[[t, giá trị, tiếp tuyến vào, tiếp tuyến ra]]}],
                      sprites:[{path, prop, keys:[[t, tên sprite]]}], events:[{t, fn, [data], [f], [i]}] }
  controllers[tên]  { params:[[tên, kiểu, mặc định]], default, states:{tên:{clip, speed, ...}},
                      transitions:[{from, to, cond:[[param, phép, ngưỡng]], dur, exitTime, ...}], layers:[...] }
  rigs[prefab]      { ctrl, nodes:[{n, p, ap, sd, an, pv, sc, rz, [on], [cg], [col], [img]}] }   (cây RectTransform của chân dung)
Tên clip = tên tệp .anim (không đuôi), vì `m_Name` trùng nhiều (Idle, Idle_0, Idle_1...). Chi tiết lược đồ ở tools/README.md.

Tệp xuất có danh sách tường minh (PORTRAIT_DIRS tự dò, UI_CONTROLLERS, GEAR_CONTROLLERS, OVERRIDES), không bóc cả 419 clip
(130 clip xương khớp cần khung xương mà web chưa có). Tiếp tuyến Hermite giữ nguyên từ YAML (cả Infinity = bậc thang).

Chạy:  python -I games/dredge/tools/anim.py                (~10 giây, cần PyYAML có libyaml)
       python -I games/dredge/tools/anim.py --out <tệp>    (ghi chỗ khác, để so hai lần chạy)
Chạy lại bao nhiêu lần cũng ra đúng từng byte (khoá sắp xếp, số in theo repr, không ghi giờ).
"""
import argparse
import glob
import io
import json
import math
import os
import re
import sys
import zlib

sys.stdout.reconfigure(encoding="utf-8")
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, ".."))
RIP = os.environ.get("DREDGE_RIP", r"D:\dredge-ref\ripped\ExportedProject\Assets")
OUT = os.path.join(GAME, "data", "animlib.js")
PORTRAITS = os.path.join(GAME, "art", "portraits")
YARN = os.path.join(GAME, "data", "yarn.js")

# ---- danh sách tường minh (xem đầu tệp) ------------------------------------------------------------
# U3: chuyển động HUD. Tên = tệp .controller.
UI_CONTROLLERS = ["BannerAnimator", "LoadingScreenAnimator", "SpyglassUIAnimator", "ResearchNotchAnimator",
                  "SpeakerButtonAttentionCallout", "UnseenCabinItemAnimator", "UnseenCabinItemAnimator_0", "HasteBarAnimator"]
# D1/D2: lưới kéo, lưới trục vớt, phao rập cua, phao mồi.
GEAR_CONTROLLERS = ["TrawlNet_Animator", "SalvageNet_Animator", "CrabPotBuoy_Animator", "Bait_Animator"]
OVERRIDES = ["FlotsamPotBuoy_Animator"]           # AnimatorOverrideController: bản sao controller gốc với clip thay thế
NOT_PORTRAIT_DIRS = {"font", "intro", "vox"}      # thư mục con của art/portraits không phải prefab chân dung
# Lớp component không có nghĩa trên web: khớp vật lý của lưới (CharacterJoint 153, ConfigurableJoint 153) và Rigidbody (54).
DROP_CLASSES = {153, 54}

# GUID script Unity UI (đo trong prefab chân dung)
SCRIPT_IMAGE = (-765806418, "d3e719b59ab71ba3f6b398058c866280")   # UnityEngine.UI.Image (cùng guid với mọi thành phần UI, khác fileID)
SCRIPT_SPRITE_LOADER = (11500000, "6c856e7df31c3b808dca7edd3370f827")  # AddressableSpriteLoader (MonoBehaviour của Assembly-CSharp)

# Tên thuộc tính để giải băm CRC32 (script_0xHASH_... trong m_PPtrCurves / m_FloatCurves)
ATTR_VOCAB = ["m_Sprite", "m_Material", "m_Color.r", "m_Color.g", "m_Color.b", "m_Color.a", "m_Enabled", "m_IsActive", "m_Alpha",
              "m_Interactable", "m_BlocksRaycasts", "m_AnchoredPosition.x", "m_AnchoredPosition.y", "m_SizeDelta.x", "m_SizeDelta.y",
              "m_Pivot.x", "m_Pivot.y", "m_AnchorMin.x", "m_AnchorMin.y", "m_AnchorMax.x", "m_AnchorMax.y", "m_FillAmount",
              "m_LocalScale.x", "m_LocalScale.y", "m_LocalScale.z", "m_LocalPosition.x", "m_LocalPosition.y", "m_LocalPosition.z"]
# Từ thường gặp làm hậu tố tên lớp chân dung (<Tên>_<Từ>); dùng để đoán đường dẫn chỉ còn lại băm.
LAYER_WORDS = ["Foreground", "Midground", "Background", "Front", "Back", "Overlay", "Shadow", "Glow", "Light", "Detail", "Details"]

INF = float("inf")
WARN = []


def warn(msg):
    WARN.append(msg)
    print("  ! " + msg)


# ---- YAML ------------------------------------------------------------------------------------------
class Raw(yaml.CSafeLoader if yaml.__with_libyaml__ else yaml.SafeLoader):
    """Mọi scalar thường giữ nguyên chuỗi: tên GameObject kiểu `1`, `On`, `1.5` không bị PyYAML đổi thành số/bool,
    giá trị rỗng (`path:`) ra chuỗi rỗng. Số thì ép tay bằng F()/I()."""


Raw.yaml_implicit_resolvers = {}

BLOCK_RE = re.compile(r"^--- !u!(\d+) &(-?\d+)(?: stripped)?[ \t]*$", re.M)


def read_text(path):
    with io.open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def blocks(text):
    """Tách tệp YAML Unity theo `--- !u!<loại> &<id>` → [(loại, id, nội dung)]."""
    ms = list(BLOCK_RE.finditer(text))
    out = []
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        out.append((int(m.group(1)), int(m.group(2)), text[m.end():end]))
    return out


def parse(body):
    return yaml.load(body, Raw)


def one_doc(path):
    bl = blocks(read_text(path))
    if len(bl) != 1:
        raise ValueError("expected 1 YAML document in %s, found %d" % (path, len(bl)))
    return parse(bl[0][2])


def F(x):
    """scalar YAML → float (Unity ghi Infinity/-Infinity cho tiếp tuyến bậc thang)."""
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s in ("Infinity", "+Infinity", ".inf", "inf"):
        return INF
    if s in ("-Infinity", "-.inf", "-inf"):
        return -INF
    if s == "NaN":
        raise ValueError("NaN in animation data")
    return float(s)


def I(x):
    # fileID dài 18 chữ số: qua float là mất chữ số cuối, nên số nguyên phải đọc thẳng từ chuỗi
    s = str(x).strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else int(float(s))


def ref(x):
    """{fileID: N, guid: G} → (N, G)"""
    if not isinstance(x, dict):
        return 0, None
    return I(x.get("fileID", 0)), x.get("guid")


def crc(s):
    return zlib.crc32(s.encode("utf-8")) & 0xFFFFFFFF


# ---- số ra JS ---------------------------------------------------------------------------------------
def num(x):
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        return str(x)
    if x == INF:
        return "Infinity"
    if x == -INF:
        return "-Infinity"
    if x == int(x) and abs(x) < 1e15:
        return str(int(x))    # cũng gộp -0.0 thành 0
    r = repr(float(x))
    return r.replace("e-0", "e-").replace("e+0", "e+").replace("e+", "e") if "e" in r else r


def dumps(o):
    if o is None:
        return "null"
    if isinstance(o, (bool, int, float)):
        return num(o)
    if isinstance(o, str):
        return json.dumps(o, ensure_ascii=False)
    if isinstance(o, (list, tuple)):
        return "[" + ",".join(dumps(v) for v in o) + "]"
    if isinstance(o, dict):
        return "{" + ",".join(json.dumps(str(k), ensure_ascii=False) + ":" + dumps(v) for k, v in o.items()) + "}"
    raise TypeError("cannot serialise " + type(o).__name__)


# ---- GUID → tên tài nguyên -----------------------------------------------------------------------------
def guid_map(folder, suffix):
    """{guid: tên tệp không đuôi} cho mọi <tên><suffix>.meta trong folder."""
    out = {}
    for f in sorted(glob.glob(os.path.join(RIP, folder, "*" + suffix + ".meta"))):
        m = re.search(r"^guid: (\w+)", read_text(f), re.M)
        if m:
            out[m.group(1)] = os.path.basename(f)[:-len(suffix + ".meta")]
    return out


# ---- clip -----------------------------------------------------------------------------------------------
def key_list(curve, axis=None):
    out = []
    for k in curve["m_Curve"]:
        if k.get("weightedMode", "0") not in ("0", 0):
            raise ValueError("weighted tangents are not supported (weightedMode %s)" % k["weightedMode"])
        if axis is None:
            out.append([F(k["time"]), F(k["value"]), F(k["inSlope"]), F(k["outSlope"])])
        else:
            out.append([F(k["time"]), F(k["value"][axis]), F(k["inSlope"][axis]), F(k["outSlope"][axis])])
    for w in ("m_PreInfinity", "m_PostInfinity"):
        if curve.get(w, "2") != "2":
            warn("curve %s = %s (only 2 = clamp is evaluated)" % (w, curve.get(w)))
    return out


VEC_CURVES = [("m_PositionCurves", "m_LocalPosition", "xyz"), ("m_EulerCurves", "localEulerAnglesRaw", "xyz"),
              ("m_ScaleCurves", "m_LocalScale", "xyz"), ("m_RotationCurves", "m_LocalRotation", "xyzw")]


def read_clip(path, sprites_by_guid):
    d = one_doc(path)["AnimationClip"]
    st = d["m_AnimationClipSettings"]
    if F(st["m_StartTime"]) != 0:
        warn("%s: m_StartTime %s (only 0 is supported)" % (os.path.basename(path), st["m_StartTime"]))
    if d.get("m_Legacy", "0") != "0" or d.get("m_WrapMode", "0") != "0":
        warn("%s: legacy clip or WrapMode %s (not used by the animator path)" % (os.path.basename(path), d.get("m_WrapMode")))
    if d.get("m_CompressedRotationCurves"):
        warn("%s: m_CompressedRotationCurves not empty" % os.path.basename(path))
    clip = {"len": F(st["m_StopTime"]), "loop": I(st["m_LoopTime"]), "curves": [], "sprites": [], "events": []}
    for field, prop, axes in VEC_CURVES:
        for it in d.get(field) or []:
            for ax in axes:
                clip["curves"].append({"path": it["path"], "prop": prop + "." + ax, "keys": key_list(it["curve"], ax)})
    for it in d.get("m_FloatCurves") or []:
        clip["curves"].append({"path": it["path"], "prop": it["attribute"], "cls": I(it["classID"]), "keys": key_list(it["curve"])})
    for it in d.get("m_PPtrCurves") or []:
        keys = []
        for k in it["curve"]:
            fid, g = ref(k["value"])
            keys.append([F(k["time"]), sprites_by_guid.get(g, g)])
        clip["sprites"].append({"path": it["path"], "prop": it["attribute"], "cls": I(it["classID"]), "keys": keys})
    for e in d.get("m_Events") or []:
        ev = {"t": F(e["time"]), "fn": e["functionName"]}
        if e.get("data"):
            ev["data"] = e["data"]
        if F(e.get("floatParameter", 0)) != 0:
            ev["f"] = F(e["floatParameter"])
        if I(e.get("intParameter", 0)) != 0:
            ev["i"] = I(e["intParameter"])
        clip["events"].append(ev)
    clip["events"].sort(key=lambda e: e["t"])
    return clip


def resolve_hashes(clip, candidates, owner):
    """`path_0xHASH_xxxx` (AssetRipper không tra ngược được) → đường dẫn thật bằng CRC32 của ứng viên;
    `script_0xHASH_xxxx` → tên thuộc tính bằng CRC32 của từ vựng. Trả về số curve còn băm."""
    by_hash = {}
    plain = set()
    for c in clip["curves"] + clip["sprites"]:
        if not c["path"].startswith("path_0x"):
            parts = c["path"].split("/")
            for i in range(1, len(parts) + 1):
                plain.add("/".join(parts[:i]))
    for cand in sorted(set(candidates) | plain):
        by_hash.setdefault(crc(cand), cand)
    attrs = {crc(a): a for a in ATTR_VOCAB}
    left = 0
    for c in clip["curves"] + clip["sprites"]:
        m = re.match(r"^path_0x([0-9A-Fa-f]{8})_", c["path"])
        if m:
            h = int(m.group(1), 16)
            if h in by_hash:
                c["path"] = by_hash[h]
                c["hashed"] = 1
            else:
                left += 1
        m = re.match(r"^(?:script|attribute)_0x([0-9A-Fa-f]{8})_", c["prop"])
        if m:
            h = int(m.group(1), 16)
            if h in attrs:
                c["prop"] = attrs[h]
            else:
                left += 1
                warn("%s: attribute hash 0x%08X not in vocabulary" % (owner, h))
    return left


# ---- controller ----------------------------------------------------------------------------------------
PARAM_TYPES = {"1": "float", "3": "int", "4": "bool", "9": "trigger"}
COND_OPS = {"1": "if", "2": "ifnot", "3": "gt", "4": "lt", "6": "eq", "7": "ne"}


def read_controller(path, clip_name, owner):
    """Một tệp .controller → {params, layers:[{name, weight, blend, default, states, transitions}]}.
    clip_name(guid) → tên clip (đã áp override)."""
    docs = {}
    for cls, fid, body in blocks(read_text(path)):
        if cls in (91, 1107, 1102, 1101):
            docs[fid] = (cls, parse(body))
    ctrl = [v for k, v in docs.items() if v[0] == 91][0][1]["AnimatorController"]
    params = []
    for p in ctrl["m_AnimatorParameters"]:
        t = PARAM_TYPES[p["m_Type"]]
        dv = F(p["m_DefaultFloat"]) if t == "float" else (I(p["m_DefaultInt"]) if t == "int" else I(p["m_DefaultBool"]))
        params.append([p["m_Name"], t, dv])
    layers = []
    for li, ly in enumerate(ctrl["m_AnimatorLayers"]):
        sm = docs[ref(ly["m_StateMachine"])[0]][1]["AnimatorStateMachine"]
        if sm.get("m_ChildStateMachines"):
            warn("%s: sub-state machines are not supported" % owner)
        if ref(ly.get("m_Mask"))[0] != 0:
            warn("%s: layer %s has an avatar mask (ignored)" % (owner, ly["m_Name"]))
        if I(ly.get("m_BlendingMode", 0)) != 0:
            warn("%s: layer %s is additive (treated as override)" % (owner, ly["m_Name"]))
        names = {}
        for cs in sm["m_ChildStates"]:
            fid = ref(cs["m_State"])[0]
            names[fid] = docs[fid][1]["AnimatorState"]["m_Name"]
        states = {}
        order = []
        trans = []
        any_t = []

        def read_transition(fid, src):
            t = docs[fid][1]["AnimatorStateTransition"]
            if I(t.get("m_Mute", 0)):
                return None
            if I(t.get("m_Solo", 0)):
                warn("%s: solo transition (treated as normal)" % owner)
            if I(t.get("m_IsExit", 0)) or ref(t.get("m_DstStateMachine"))[0] != 0:
                warn("%s: transition to exit / sub-state machine (dropped)" % owner)
                return None
            dst = ref(t["m_DstState"])[0]
            cond = []
            for c in t.get("m_Conditions") or []:
                op = COND_OPS[c["m_ConditionMode"]]
                cond.append([c["m_ConditionEvent"], op] + ([F(c["m_EventTreshold"])] if op in ("gt", "lt", "eq", "ne") else []))
            out = {"from": src, "to": names[dst], "cond": cond, "dur": F(t["m_TransitionDuration"]),
                   "exitTime": F(t["m_ExitTime"]) if I(t["m_HasExitTime"]) else None}
            if F(t.get("m_TransitionOffset", 0)) != 0:
                out["offset"] = F(t["m_TransitionOffset"])
            if not I(t.get("m_HasFixedDuration", 1)):
                out["fixed"] = 0
            if not I(t.get("m_CanTransitionToSelf", 1)):
                out["self"] = 0
            if I(t.get("m_InterruptionSource", 0)) != 0:
                warn("%s: transition interruption source %s (not interruptible here)" % (owner, t["m_InterruptionSource"]))
            return out

        for fid in [ref(x)[0] for x in sm.get("m_AnyStateTransitions") or []]:
            t = read_transition(fid, "*")
            if t:
                any_t.append(t)
        for cs in sm["m_ChildStates"]:
            fid = ref(cs["m_State"])[0]
            s = docs[fid][1]["AnimatorState"]
            mf, mg = ref(s["m_Motion"])
            if mf == 0:
                clipn = None
            elif mg:
                clipn = clip_name(mg)
            else:
                clipn = None
                warn("%s: state %s uses an embedded blend tree (not exported)" % (owner, s["m_Name"]))
            st = {"clip": clipn, "speed": F(s["m_Speed"])}
            if I(s.get("m_SpeedParameterActive", 0)):
                st["speedParam"] = s["m_SpeedParameter"]
            if F(s.get("m_CycleOffset", 0)) != 0:
                st["cycleOffset"] = F(s["m_CycleOffset"])
            if I(s.get("m_Mirror", 0)) or I(s.get("m_TimeParameterActive", 0)):
                warn("%s: state %s uses mirror/time parameter (ignored)" % (owner, s["m_Name"]))
            if not I(s.get("m_WriteDefaultValues", 1)):
                st["wd"] = 0
            states[s["m_Name"]] = st
            order.append(s["m_Name"])
            for tf in [ref(x)[0] for x in s.get("m_Transitions") or []]:
                t = read_transition(tf, s["m_Name"])
                if t:
                    trans.append(t)
        layer = {"name": ly["m_Name"], "weight": 1.0 if li == 0 else F(ly["m_DefaultWeight"]),
                 "default": names[ref(sm["m_DefaultState"])[0]], "states": states, "transitions": any_t + trans}
        layers.append(layer)
    return {"params": params, "layers": layers}


def flatten_controller(c):
    """Layer 0 ở gốc (params/default/states/transitions), các layer sau vào `layers` (lược đồ ở đầu tệp)."""
    base = c["layers"][0]
    out = {"params": c["params"], "default": base["default"], "states": base["states"], "transitions": base["transitions"]}
    if len(c["layers"]) > 1:
        out["layers"] = [{"name": ly["name"], "weight": ly["weight"], "default": ly["default"], "states": ly["states"],
                          "transitions": ly["transitions"]} for ly in c["layers"][1:]]
    return out


def controller_clips(c):
    names = set()
    for ly in c["layers"]:
        for s in ly["states"].values():
            if s["clip"]:
                names.add(s["clip"])
    return names


# ---- rig chân dung --------------------------------------------------------------------------------------
def rz_deg(q):
    """Góc quanh trục z (độ) từ quaternion; `m_LocalEulerAnglesHint` của AssetRipper đảo dấu nên không dùng."""
    return round(math.degrees(2 * math.atan2(F(q["z"]), F(q["w"]))), 5)


def sanitize(name):
    return re.sub(r"[^A-Za-z0-9_-]", "_", name)   # cùng quy tắc đặt tên tệp lớp của tools/yarn.py


def vec2(d, default=(0.0, 0.0)):
    if not isinstance(d, dict):
        return list(default)
    return [F(d["x"]), F(d["y"])]


def build_rig(prefab, ctrl_by_guid, warn_missing=True):
    path = os.path.join(RIP, "GameObject", prefab + ".prefab")
    docs = {}
    for cls, fid, body in blocks(read_text(path)):
        if cls in (1, 4, 224, 95, 114, 225):
            docs[fid] = (cls, parse(body))
    rts = {fid: v[1]["RectTransform"] for fid, v in docs.items() if v[0] == 224}
    root = [fid for fid, rt in rts.items() if ref(rt["m_Father"])[0] == 0]
    if len(root) != 1:
        raise ValueError("%s: expected 1 root RectTransform, found %d" % (prefab, len(root)))
    ctrl_guid = None
    nodes = []
    extra = []          # đường dẫn của các Transform thường (hệ hạt): có thật trong prefab nhưng không vào rig
    skipped = []        # nút có sprite nhưng tắt lúc nghỉ → chưa có ảnh trên đĩa

    def comps(go):
        out = []
        for c in go["m_Component"]:
            f = ref(c["component"])[0]
            if f in docs:
                out.append(docs[f])
        return out

    def walk(fid, parent, ppath):
        nonlocal ctrl_guid
        rt = rts[fid]
        go = docs[ref(rt["m_GameObject"])[0]][1]["GameObject"]
        name = go["m_Name"]
        p = "" if parent < 0 else (name if ppath == "" else ppath + "/" + name)
        node = {"n": name, "p": parent, "ap": vec2(rt["m_AnchoredPosition"]), "sd": vec2(rt["m_SizeDelta"]),
                "an": vec2(rt["m_AnchorMin"]) + vec2(rt["m_AnchorMax"]), "pv": vec2(rt["m_Pivot"]),
                "sc": [F(rt["m_LocalScale"]["x"]), F(rt["m_LocalScale"]["y"])], "rz": rz_deg(rt["m_LocalRotation"])}
        if not I(go["m_IsActive"]):
            node["on"] = 0
        loader = image = None
        for cls, d in comps(go):
            if cls == 225:
                node["cg"] = F(d["CanvasGroup"]["m_Alpha"])
            elif cls == 95:
                g = ref(d["Animator"]["m_Controller"])[1]
                if parent < 0:
                    ctrl_guid = g
            elif cls == 114:
                mb = d["MonoBehaviour"]
                sg = ref(mb["m_Script"])
                if sg == SCRIPT_SPRITE_LOADER and mb.get("assetReference", {}).get("m_AssetGUID"):
                    loader = mb
                elif sg == SCRIPT_IMAGE:
                    image = mb
        # lớp ảnh: quy tắc của tools/yarn.py prefab_layers (AddressableSpriteLoader, hoặc Image bật có sprite)
        has_sprite = loader is not None or (image is not None and I(image["m_Enabled"]) and ref(image["m_Sprite"])[0] != 0)
        if has_sprite:
            rel = "art/portraits/%s/%s.webp" % (prefab, sanitize(name))
            if os.path.exists(os.path.join(GAME, rel)):
                node["img"] = rel
            elif not I(go["m_IsActive"]):
                skipped.append(rel)     # tools/yarn.py bỏ cả nhánh GameObject tắt lúc nghỉ nên không có ảnh
            elif warn_missing:
                warn("%s: layer image missing on disk: %s" % (prefab, rel))
        if image is not None:
            col = image["m_Color"]
            rgba = [F(col["r"]), F(col["g"]), F(col["b"]), F(col["a"])]
            if rgba != [1.0, 1.0, 1.0, 1.0]:
                node["col"] = rgba
            # Image.preserveAspect: sprite vẽ vừa khít trong hình chữ nhật theo tỉ lệ của chính nó, lệch theo pivot
            # (Image.PreserveSpriteAspectRatio). Hình chữ nhật của prefab thường rộng hơn sprite (124/131 lớp, tới 4,7 lần).
            if has_sprite and I(image.get("m_PreserveAspect", 0)):
                node["pa"] = 1
        idx = len(nodes)
        node["path"] = p
        nodes.append(node)
        for ch in rt.get("m_Children") or []:
            cf = ref(ch)[0]
            if cf in rts:       # Transform thường (hệ hạt) bỏ qua; UIParticle vẫn là RectTransform
                walk(cf, idx, p)
            elif cf in docs and docs[cf][0] == 4:
                walk_plain(cf, p)
        return idx

    def walk_plain(fid, ppath):
        tr = docs[fid][1]["Transform"]
        go = docs[ref(tr["m_GameObject"])[0]][1]["GameObject"]
        p = go["m_Name"] if ppath == "" else ppath + "/" + go["m_Name"]
        extra.append(p)
        for ch in tr.get("m_Children") or []:
            cf = ref(ch)[0]
            if cf in docs and docs[cf][0] == 4:
                walk_plain(cf, p)

    walk(root[0], -1, None)
    seen = {}
    for n in nodes:
        if n["path"] in seen:
            warn("%s: duplicate sibling path %r (Unity binds the first match)" % (prefab, n["path"]))
        seen.setdefault(n["path"], True)
    return nodes, ctrl_guid, extra, skipped


# --- bố cục RectTransform ở trạng thái nghỉ, cùng công thức với DRAnim.layout trong js/anim.js
def amul(A, B):
    a1, b1, c1, d1, e1, f1 = A
    a2, b2, c2, d2, e2, f2 = B
    return (a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1)


def rest_layout(nodes):
    """Trả về [(ma trận thế giới (a,b,c,d,e,f), (rộng, cao), kích hoạt)] cho từng nút, hệ y hướng lên, gốc ở tâm khung chứa."""
    out = []
    for n in nodes:
        if n["p"] < 0:
            pm, ps, ppv, pon = (1, 0, 0, 1, 0, 0), (0.0, 0.0), (0.0, 0.0), True
        else:
            pm, ps, ppv, pon = out[n["p"]][0], out[n["p"]][1], nodes[n["p"]]["pv"], out[n["p"]][2]
        amin, amax = n["an"][:2], n["an"][2:]
        size = ((amax[0] - amin[0]) * ps[0] + n["sd"][0], (amax[1] - amin[1]) * ps[1] + n["sd"][1])
        pivot = [(-ppv[0] * ps[0] + amin[0] * ps[0] + n["pv"][0] * (amax[0] - amin[0]) * ps[0] + n["ap"][0]),
                 (-ppv[1] * ps[1] + amin[1] * ps[1] + n["pv"][1] * (amax[1] - amin[1]) * ps[1] + n["ap"][1])]
        th = math.radians(n["rz"])
        c, s = math.cos(th), math.sin(th)
        local = (c * n["sc"][0], s * n["sc"][0], -s * n["sc"][1], c * n["sc"][1], pivot[0], pivot[1])
        out.append((amul(pm, local), size, pon and n.get("on", 1) == 1))
    return out


def check_against_yarn(rigs):
    """Đối chiếu bố cục nghỉ của rig với `portraits` trong data/yarn.js (x, y = vị trí trục, w, h = kích thước hiển thị)."""
    if not os.path.exists(YARN):
        print("  (data/yarn.js không có: bỏ qua đối chiếu lớp chân dung)")
        return
    t = read_text(YARN)
    j = json.loads(t[t.index("DR_YARN=") + 8:].strip().rstrip(";"))
    worst = 0.0
    bad = 0
    missing = 0
    for pf, layers in j["portraits"].items():
        if pf not in rigs:
            warn("%s: no rig for a portrait prefab in data/yarn.js" % pf)
            continue
        nodes = rigs[pf]["nodes"]
        lay = rest_layout(nodes)
        have = [i for i, n in enumerate(nodes) if "img" in n and lay[i][2]]
        free = list(have)
        for L in layers:
            # ứng viên cùng ảnh; nhiều nút trùng ảnh thì lấy nút có vị trí khớp nhất
            cand = [i for i in free if nodes[i]["img"] == L["src"]]
            if not cand:
                missing += 1
                warn("%s: layer %s of data/yarn.js has no rig node" % (pf, L["src"]))
                continue

            def dist(i, L=L):
                m_, s_, _ = lay[i]
                return abs(m_[4] - L["x"]) + abs(m_[5] - L["y"])
            i = min(cand, key=dist)
            free.remove(i)
            m, size, _ = lay[i]
            kx, ky = math.hypot(m[0], m[1]), math.hypot(m[2], m[3])
            d = max(abs(m[4] - L["x"]), abs(m[5] - L["y"]), abs(size[0] * kx - L["w"]), abs(size[1] * ky - L["h"]))
            worst = max(worst, d)
            if d > 0.01:
                bad += 1
                warn("%s: %s differs from data/yarn.js by %.3f (pivot/anchors not centred?)" % (pf, L["src"], d))
        if len(have) != len(layers):
            warn("%s: rig has %d active image nodes, data/yarn.js has %d layers" % (pf, len(have), len(layers)))
    print("  đối chiếu data/yarn.js: %d prefab, lệch lớn nhất %.5f, %d lớp lệch > 0,01, %d lớp thiếu" % (len(j["portraits"]), worst, bad, missing))


# ---- chính ----------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    if not yaml.__with_libyaml__:
        warn("PyYAML không có libyaml: chạy chậm hơn nhiều")

    clip_guid = guid_map("AnimationClip", ".anim")
    ctrl_guid = guid_map("AnimatorController", ".controller")
    ovr_guid = guid_map("AnimatorOverrideController", ".overrideController")
    sprite_guid = guid_map("Sprite", ".asset")
    ctrl_name_guid = {v: k for k, v in ctrl_guid.items()}
    print("GUID: %d clip, %d controller, %d override, %d sprite" % (len(clip_guid), len(ctrl_guid), len(ovr_guid), len(sprite_guid)))

    # 1. chân dung: prefab → controller
    prefabs = sorted(d for d in os.listdir(PORTRAITS) if os.path.isdir(os.path.join(PORTRAITS, d)) and d not in NOT_PORTRAIT_DIRS)
    rigs = {}
    exist = {}           # prefab → mọi đường dẫn GameObject có thật (rig + Transform thường của hệ hạt)
    no_art = 0
    owners = {}          # tên controller → các prefab dùng nó
    for pf in prefabs:
        nodes, g, extra, skipped = build_rig(pf, ctrl_guid)
        no_art += len(skipped)
        if g not in ctrl_guid:
            raise ValueError("%s: Animator controller guid %s not found among AnimatorController assets" % (pf, g))
        cn = ctrl_guid[g]
        rigs[pf] = {"ctrl": cn, "nodes": nodes}
        exist[pf] = set(n["path"] for n in nodes) | set(extra)
        owners.setdefault(cn, []).append(pf)
    print("chân dung: %d prefab, %d controller, %d nút RectTransform, %d nút có sprite nhưng tắt lúc nghỉ (chưa có ảnh)" % (
        len(rigs), len(owners), sum(len(r["nodes"]) for r in rigs.values()), no_art))

    # 2. controller: chân dung + UI + gear (+ override)
    wanted = sorted(set(owners) | set(UI_CONTROLLERS) | set(GEAR_CONTROLLERS))
    controllers = {}
    raw = {}
    for cn in wanted:
        if cn not in ctrl_name_guid:
            raise ValueError("controller not found: " + cn)
        raw[cn] = read_controller(os.path.join(RIP, "AnimatorController", cn + ".controller"), lambda g: clip_guid[g], cn)
    for on in OVERRIDES:
        d = one_doc(os.path.join(RIP, "AnimatorOverrideController", on + ".overrideController"))["AnimatorOverrideController"]
        base = ctrl_guid[ref(d["m_Controller"])[1]]
        sub = {}
        for c in d["m_Clips"]:
            og, ng = ref(c["m_OriginalClip"])[1], ref(c["m_OverrideClip"])[1]
            if ng:
                sub[og] = ng
        raw[on] = read_controller(os.path.join(RIP, "AnimatorController", base + ".controller"),
                                  lambda g, sub=sub: clip_guid[sub.get(g, g)], on)
        print("override %s: gốc %s, thay %d clip" % (on, base, len(sub)))
    for cn in sorted(raw):
        controllers[cn] = flatten_controller(raw[cn])

    # 3. clip
    clip_names = sorted(set().union(*[controller_clips(raw[c]) for c in raw]))
    clips = {}
    dropped = {}
    dead = 0
    cand_by_clip = {}    # đường dẫn có thật ở các prefab dùng clip (chỉ clip chân dung mới biết)
    guess_by_clip = {}   # + tên đoán <Prefab>_<Từ> để giải băm
    for cn in raw:
        for cl in controller_clips(raw[cn]):
            for pf in owners.get(cn, []):
                cand_by_clip.setdefault(cl, set()).update(exist[pf])
                guess_by_clip.setdefault(cl, set()).update(pf + "_" + w for w in LAYER_WORDS)
    for name in clip_names:
        c = read_clip(os.path.join(RIP, "AnimationClip", name + ".anim"), sprite_guid)
        left = resolve_hashes(c, cand_by_clip.get(name, set()) | guess_by_clip.get(name, set()), name)
        if left:
            warn("%s: %d curve(s) still hashed" % (name, left))
        # bỏ curve vật lý (khớp, Rigidbody) và curve trỏ vào nút không có ở prefab nào dùng clip (chỉ khi biết rig)
        keep = []
        paths = cand_by_clip.get(name)
        for cv in c["curves"]:
            if cv.get("cls") in DROP_CLASSES:
                dropped[cv["prop"]] = dropped.get(cv["prop"], 0) + 1
                continue
            if paths is not None and cv["path"] not in paths:
                dead += 1
                continue
            keep.append(cv)
        c["curves"] = keep
        for cv in c["curves"]:
            cv.pop("hashed", None)
        for sp in c["sprites"]:
            sp.pop("hashed", None)
        if not c["sprites"]:
            del c["sprites"]
        clips[name] = c
    print("clip: %d, curve: %d, bỏ curve vật lý %d (%s), bỏ curve trỏ nút không tồn tại %d" % (
        len(clips), sum(len(c["curves"]) for c in clips.values()), sum(dropped.values()),
        ", ".join("%s×%d" % kv for kv in sorted(dropped.items())), dead))

    # 4. rig: bỏ trường phụ (path) trước khi ghi
    for pf in rigs:
        for n in rigs[pf]["nodes"]:
            pass
    check_against_yarn(rigs)
    for pf in rigs:
        for n in rigs[pf]["nodes"]:
            del n["path"]

    lib = {"v": 1, "clips": {k: clips[k] for k in sorted(clips)}, "controllers": {k: controllers[k] for k in sorted(controllers)},
           "rigs": {k: rigs[k] for k in sorted(rigs)}}
    head = ("/* generated by games/dredge/tools/anim.py from AssetRipper AnimationClip / AnimatorController / GameObject "
            "(DREDGE 1.5.3) — do not edit */\n")
    text = head + "window.DR_ANIM=" + dumps(lib) + ";\n"
    with io.open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("ghi %s: %d byte, %d cảnh báo" % (os.path.abspath(args.out), len(text.encode("utf-8")), len(WARN)))


if __name__ == "__main__":
    main()
