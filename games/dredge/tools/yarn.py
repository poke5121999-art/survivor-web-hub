"""
Bóc chương trình Yarn Spinner đã biên dịch của DREDGE ra games/dredge/data/yarn.js.

Nguồn:
  - D:\\dredge-ref\\ripped\\ExportedProject\\Assets\\MonoBehaviour\\Dredge.asset (YarnProject, AssetRipper):
      compiledYarnProgram = protobuf Yarn.Program dạng hex (Yarn Spinner 2.2.0, xem Plugins/YarnSpinner.dll),
      lineMetadata = khoá "line:xxxx" → thẻ (#chuckle, #sigh, #system-alert...) dùng cho tiếng cảm thán.
  - games/dredge/data/strings-dialogue.js (bảng chuỗi Yarn_en do tools/data.py bóc từ bundle; bảng Yarn_en trong
    project AssetRipper bị rỗng nên không đọc được ở đó).

Lược đồ protobuf (yarn_spinner.proto bản 2.2):
  Program  { 1 name: string; 2 nodes: map<string, Node>; 3 initial_values: map<string, Operand> }
  Node     { 1 name; 2 instructions: repeated Instruction; 3 labels: map<string, int32>; 4 tags: repeated string;
             5 sourceTextStringID; 6 headers (2.3+, không có ở đây nhưng đọc được nếu có) }
  Instruction { 1 opcode: enum; 2 operands: repeated Operand }
  Operand  { oneof: 1 string_value; 2 bool_value; 3 float_value (fixed32) }

Đầu ra (window.DR_YARN):
  { version, ops: [tên opcode theo số], nodes: { tên: { i: [[op, a, b, ...]], l: {nhãn: chỉ số}, t: [tags] } },
    init: { biến: giá trị }, lines: { "line:xxx": "chữ tiếng Anh" }, meta: { "line:xxx": ["chuckle"] } }
  Operand string/bool/float giữ nguyên kiểu JSON (string / true|false / số).

Chạy:  python -I games/dredge/tools/yarn.py     (sau tools/data.py vì cần data/strings-dialogue.js)
Chạy lại bao nhiêu lần cũng ra cùng tệp (khoá sắp xếp, float làm tròn theo float32).
"""
import json
import os
import re
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

ASSET = os.environ.get("DREDGE_YARN_ASSET",
                       r"D:\dredge-ref\ripped\ExportedProject\Assets\MonoBehaviour\Dredge.asset")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "yarn.js")

# OpCode của Yarn Spinner 2.2 (yarn_spinner.proto) — đã đối chiếu tên trong YarnSpinner.dll 2.2.0.0.
OPS = ["JumpTo", "Jump", "RunLine", "RunCommand", "AddOption", "ShowOptions", "PushString", "PushFloat",
       "PushBool", "PushNull", "JumpIfFalse", "Pop", "CallFunc", "PushVariable", "StoreVariable", "Stop", "RunNode"]


# ---------------------------------------------------------------- protobuf tối giản
def varint(b, i):
    v = s = 0
    while True:
        c = b[i]
        i += 1
        v |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return v, i


def fields(b):
    """Duyệt (số trường, kiểu dây, giá trị) của một message. Giá trị: int (varint/fixed) hoặc bytes (length-delimited)."""
    i, n = 0, len(b)
    while i < n:
        key, i = varint(b, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = varint(b, i)
        elif wt == 1:
            v = b[i:i + 8]
            i += 8
        elif wt == 2:
            ln, i = varint(b, i)
            v = b[i:i + ln]
            i += ln
        elif wt == 5:
            v = b[i:i + 4]
            i += 4
        else:
            raise ValueError("protobuf wire type %d not supported at byte %d" % (wt, i))
        yield f, wt, v


def f32(raw):
    x = struct.unpack("<f", raw)[0]
    # in gọn: số nguyên thì ra int, còn lại làm tròn theo độ chính xác float32
    if x == int(x) and abs(x) < 1e15:
        return int(x)
    return float("%.7g" % x)


def operand(b):
    for f, wt, v in fields(b):
        if f == 1:
            return v.decode("utf-8")
        if f == 2:
            return bool(v)
        if f == 3:
            return f32(v)
    return None  # Operand rỗng


def instruction(b):
    op, args = 0, []
    for f, wt, v in fields(b):
        if f == 1:
            op = v
        elif f == 2:
            args.append(operand(v))
    if op >= len(OPS):
        raise ValueError("unknown Yarn opcode %d" % op)
    return [op] + args


def map_entry(b, val, default=None):
    # proto3 bỏ trường mang giá trị mặc định (nhãn ở chỉ số 0 không có trường 2) → trả default
    k, v = "", default
    for f, wt, x in fields(b):
        if f == 1:
            k = x.decode("utf-8")
        elif f == 2:
            v = val(x, wt)
    return k, v


def node(b):
    out = {"i": [], "l": {}, "t": []}
    for f, wt, v in fields(b):
        if f == 1:
            out["name"] = v.decode("utf-8")
        elif f == 2:
            out["i"].append(instruction(v))
        elif f == 3:
            k, x = map_entry(v, lambda x, wt: x, 0)
            out["l"][k] = x
        elif f == 4:
            out["t"].append(v.decode("utf-8"))
        elif f == 6:
            out.setdefault("h", []).append(v.hex())
    return out


def program(b):
    nodes, init, name = {}, {}, ""
    for f, wt, v in fields(b):
        if f == 1:
            name = v.decode("utf-8")
        elif f == 2:
            k, nd = map_entry(v, lambda x, wt: node(x))
            nodes[k] = nd
        elif f == 3:
            k, x = map_entry(v, lambda x, wt: operand(x))
            init[k] = x
    return name, nodes, init


# ---------------------------------------------------------------- YAML của YarnProject
def read_asset(path):
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    m = re.search(r"^  compiledYarnProgram: ([0-9a-f]+)$", text, re.M)
    if not m:
        raise ValueError("compiledYarnProgram not found in " + path)
    prog = bytes.fromhex(m.group(1))
    # lineMetadata: _lineMetadata.keys[] rồi _lineMetadata.values[] cùng thứ tự; giá trị là thẻ cách nhau bằng dấu cách
    meta = {}
    mk = re.search(r"^      keys:\n((?:      - .*\n)+)", text, re.M)
    mv = re.search(r"^      values:\n((?:      - .*\n)+)", text, re.M)
    if mk and mv:
        ks = [ln[8:].strip() for ln in mk.group(1).splitlines()]
        vs = [ln[8:].strip() for ln in mv.group(1).splitlines()]
        if len(ks) != len(vs):
            raise ValueError("lineMetadata keys/values differ: %d vs %d" % (len(ks), len(vs)))
        for k, v in zip(ks, vs):
            meta[k] = [t for t in v.split(" ") if t]
    return prog, meta


def read_lines():
    p = os.path.join(DATA, "strings-dialogue.js")
    with open(p, "r", encoding="utf-8") as fh:
        t = fh.read()
    t = t[t.index("=") + 1:].strip().rstrip(";")
    return json.loads(t)


# ---------------------------------------------------------------- bến, chân dung, tiếng cảm thán (UnityPy)
SCENE_BUNDLE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
ART = os.path.join(HERE, "..", "art", "portraits")
UI_SPRITES = os.path.join(HERE, "..", "art", "ui", "sprites")
PORTRAIT_MAX = 760    # [ĐỀ XUẤT] cạnh dài tối đa (px) của một lớp chân dung; lớp gốc hiển thị ~575–745 px ở canvas 1080p
VOX_KBPS = 40         # [ĐỀ XUẤT] mp3 mono 40 kb/s cho tiếng cảm thán (clip < 2 s)
DEST_CLASSES = {"MarketDestination", "ShipyardDestination", "StorageDestination", "OverflowStorageDestination",
                "RestDestination", "ResearchDestination", "UpgradeDestination", "CharacterDestination",
                "ConstructableDestination", "UndockDestination", "BoatActionsDestination"}
PARA = ["AAH", "CHUCKLE", "GASP", "GRUNT", "GURGLE", "HMM", "MUTTER", "SIGH", "WHIMPER", "MM", "ANNOYED",
        "THANKFUL", "LISTLESS", "EXASPERATED", "DISGUSTED", "IMPATIENT"]  # ParalinguisticType.cs


def r4(x):
    return round(float(x), 4)


def quat_mat(q):
    import numpy as np
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    n = (x * x + y * y + z * z + w * w) ** 0.5 or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


class SceneFile:
    """Đọc Transform/GameObject trong CAB của scene Game (PPtr fileID 0)."""

    def __init__(self, W, sfs):
        self.W = W
        self.sf = max(sfs, key=lambda s: len(s.objects))
        self.tt = {}
        self.mat = {}

    def get(self, pid):
        if pid not in self.tt:
            self.tt[pid] = self.sf.objects[pid].read_typetree()
        return self.tt[pid]

    def go_transform(self, go_pid):
        for c in self.get(go_pid)["m_Component"]:
            pid = c["component"]["m_PathID"]
            if self.sf.objects[pid].type.name in ("Transform", "RectTransform"):
                return pid
        return None

    def world(self, tr_pid):
        import numpy as np
        if tr_pid in self.mat:
            return self.mat[tr_pid]
        t = self.get(tr_pid)
        p, s = t["m_LocalPosition"], t["m_LocalScale"]
        m = np.eye(4)
        m[:3, :3] = quat_mat(t["m_LocalRotation"]) * np.array([s["x"], s["y"], s["z"]])
        m[:3, 3] = [p["x"], p["y"], p["z"]]
        f = t["m_Father"]["m_PathID"]
        if f:
            m = self.world(f) @ m
        self.mat[tr_pid] = m
        return m

    def comp_world(self, comp_pid):
        go = self.get(comp_pid)["m_GameObject"]["m_PathID"]
        return self.world(self.go_transform(go))

    @staticmethod
    def three(v):  # Unity (tay trái) → three.js (tay phải): đổi dấu z
        return [r4(v[0]), r4(v[1]), r4(-v[2])]

    def vcam(self, ptr):
        """Pose CinemachineVirtualCamera: vị trí, hướng nhìn (trục +z của transform), điểm LookAt nếu có, FOV."""
        import numpy as np
        if not ptr or not ptr["m_PathID"] or ptr["m_FileID"] != 0:
            return None
        pid = ptr["m_PathID"]
        d = self.get(pid)
        m = self.comp_world(pid)
        fwd = m[:3, :3] @ np.array([0.0, 0.0, 1.0])
        fwd = fwd / (np.linalg.norm(fwd) or 1.0)
        out = {"p": self.three(m[:3, 3]), "f": self.three(fwd), "fov": r4(d.get("m_Lens", {}).get("FieldOfView", 40))}
        la = d.get("m_LookAt") or {}
        if la.get("m_PathID") and la.get("m_FileID") == 0:
            out["look"] = self.three(self.world(la["m_PathID"])[:3, 3])
            # CinemachineComposer nằm ở GameObject con "cm": điểm LookAt đặt tại (ScreenX, ScreenY) trên màn (0,5 = giữa, Y tính từ trên)
            tr = self.go_transform(d["m_GameObject"]["m_PathID"])
            for ch in self.get(tr).get("m_Children") or []:
                cgo = self.get(ch["m_PathID"])["m_GameObject"]["m_PathID"]
                for c in self.get(cgo)["m_Component"]:
                    pid = c["component"]["m_PathID"]
                    if self.sf.objects[pid].type.name != "MonoBehaviour":
                        continue
                    t = self.get(pid)
                    if "m_ScreenY" in t:
                        out["sx"], out["sy"] = r4(t["m_ScreenX"]), r4(t["m_ScreenY"])
                        off = t.get("m_TrackedObjectOffset") or {}
                        if any(off.get(a) for a in "xyz"):
                            out["lookOff"] = [r4(off["x"]), r4(off["y"]), r4(-off["z"])]
        return out


def story(world_data):
    """Đọc bundle gốc: điểm đến của từng bến (alwaysShow, speaker, vCam...), lớp chân dung, tiếng cảm thán."""
    import subprocess
    sys.path.insert(0, HERE)
    import data as Dt   # dùng lại World/GUIDS/containers của tools/data.py
    from PIL import Image
    W = Dt.W
    W.load_all()
    S = SceneFile(W, W.load(SCENE_BUNDLE))

    def name_of(sf, ptr):
        if not ptr or not ptr.get("m_PathID"):
            return None
        o = W.obj(sf, ptr["m_FileID"], ptr["m_PathID"])
        if o is None:
            return None
        return o.read_typetree().get("m_Name") if o.type.name in ("MonoBehaviour", "GameObject", "Sprite") else None

    # ---- bến
    docks = {}
    for o in S.sf.objects.values():
        if o.type.name != "MonoBehaviour":
            continue
        cn = W.cls(o)
        if not (cn == "Dock" or cn.endswith("Dock")):
            continue
        d = o.read_typetree()
        dd = W.obj(S.sf, d["dockData"]["m_FileID"], d["dockData"]["m_PathID"]) if d.get("dockData", {}).get("m_PathID") else None
        if dd is None:
            continue
        did = dd.read_typetree()["id"]
        entry = {"cls": cn, "vcam": S.vcam(d.get("dockVCam")), "dests": []}
        for p in d.get("destinations") or []:
            if not p["m_PathID"]:
                continue
            dest = S.get(p["m_PathID"])
            dcls = W.cls(S.sf.objects[p["m_PathID"]])
            e = {"id": dest.get("id"), "cls": dcls, "p": S.three(S.comp_world(p["m_PathID"])[:3, 3])}
            if dest.get("alwaysShow"):
                e["always"] = True
            sp = name_of(S.sf, dest.get("speakerData"))
            if sp:
                e["speaker"] = sp
            if dest.get("speakerRootNodeOverride"):
                e["root"] = dest["speakerRootNodeOverride"]
            if dest.get("isIndoors"):
                e["indoors"] = True
            ic = name_of(S.sf, dest.get("icon"))
            if ic:
                e["icon"] = ic
            vc = S.vcam(dest.get("vCam"))
            if vc:
                e["vcam"] = vc
            hl = []
            for h in dest.get("highlightConditions") or []:
                hl.append({"always": bool(h.get("alwaysHighlight")),
                           "stepsActive": [name_of(S.sf, x) for x in h.get("ifTheseStepsActive") or []],
                           "unvisited": list(h.get("highlightIfNodesUnvisited") or []),
                           "visited": list(h.get("andTheseNodesVisited") or []),
                           "stepsNotDone": [name_of(S.sf, x) for x in h.get("andTheseStepsNotCompleted") or []]})
            if hl:
                e["hl"] = hl
            if dest.get("useFixedScreenPosition"):
                e["fixed"] = [r4(dest["screenPosition"]["x"]), r4(dest["screenPosition"]["y"])]
            tabs = dest.get("playerInventoryTabIndexesToShow")
            if tabs:
                e["tabs"] = list(tabs)
            entry["dests"].append(e)
        ba = d.get("boatActionsDestination") or {}
        if ba.get("m_PathID"):
            entry["boat"] = {"p": S.three(S.comp_world(ba["m_PathID"])[:3, 3])}
        la = d.get("lookAtTarget") or {}
        if la.get("m_PathID"):
            entry["lookAt"] = S.three(S.world(la["m_PathID"])[:3, 3])
        docks.setdefault(did, entry)

    # ---- cảnh máy quay mở đầu trong Game (IntroCinematicLogic → PlayableDirector + IntroCinematic.playable):
    #      vCam "IntroCinematicVcam_LighthouseClose" và "LookAtTarget" chạy theo hai clip ghi sẵn (Recorded, Recorded (1)),
    #      lệch theo AnimationPlayableAsset.m_Position/m_EulerAngles, trong toạ độ của cha "IntroCinematic".
    cine = None
    for o in S.sf.objects.values():
        if o.type.name != "MonoBehaviour" or W.cls(o) != "IntroCinematicLogic":
            continue
        d = o.read_typetree()
        vc_pid = d["virtualCamera"]["m_PathID"]
        vcd = S.get(vc_pid)
        vgo = vcd["m_GameObject"]["m_PathID"]
        par = S.get(S.go_transform(vgo))["m_Father"]["m_PathID"]
        dirt = S.get(d["director"]["m_PathID"])
        tracks = []
        for b in dirt.get("m_SceneBindings") or []:
            key, val = b["key"], b["value"]
            tro = W.obj(S.sf, key["m_FileID"], key["m_PathID"]) if key.get("m_PathID") else None
            if tro is None or not val.get("m_PathID"):
                continue
            tt = tro.read_typetree()
            for c in tt.get("m_Clips") or []:
                ao = W.obj(tro.assets_file, c["m_Asset"]["m_FileID"], c["m_Asset"]["m_PathID"])
                if ao is None:
                    continue
                at = ao.read_typetree()
                if "m_Clip" not in at:
                    continue
                co = W.obj(ao.assets_file, at["m_Clip"]["m_FileID"], at["m_Clip"]["m_PathID"])
                if co is None:
                    continue
                ct = co.read_typetree()
                keys = []
                for pc in ct.get("m_PositionCurves") or []:
                    for k in pc["curve"]["m_Curve"]:
                        keys.append([round(k["time"], 5)] + [round(k["value"][a], 5) for a in "xyz"] +
                                    [round(k["inSlope"][a], 5) for a in "xyz"] + [round(k["outSlope"][a], 5) for a in "xyz"])
                # đối tượng gắn: Animator trên GameObject nào
                bound = S.get(val["m_PathID"])
                bgo = bound.get("m_GameObject", {}).get("m_PathID") if "m_GameObject" in bound else val["m_PathID"]
                tracks.append({"name": tt["m_Name"], "target": S.get(bgo)["m_Name"], "start": round(c["m_Start"], 5),
                               "dur": round(c["m_Duration"], 5), "keys": keys,
                               "offP": [r4(at["m_Position"][a]) for a in "xyz"], "offE": [r4(at["m_EulerAngles"][a]) for a in "xyz"]})
        sigs = []
        po = W.obj(S.sf, dirt["m_PlayableAsset"]["m_FileID"], dirt["m_PlayableAsset"]["m_PathID"])
        if po is not None:
            pt = po.read_typetree()
            mk = pt.get("m_MarkerTrack") or {}
            for tr in (pt.get("m_Tracks") or []) + ([mk] if mk.get("m_PathID") else []):
                to = W.obj(po.assets_file, tr["m_FileID"], tr["m_PathID"])
                if to is None:
                    continue
                for m in (to.read_typetree().get("m_Markers") or {}).get("m_Objects") or []:
                    mo = W.obj(po.assets_file, m["m_FileID"], m["m_PathID"])
                    if mo is not None and "m_Time" in mo.read_typetree():
                        sigs.append(r4(mo.read_typetree()["m_Time"]))
        # bản build giữ đường cong trong m_MuscleClip (nén); AssetRipper đã giải ra YAML → lấy khoá ở đó theo tên track
        if any(not t["keys"] for t in tracks):
            rip = ripped_timeline_keys(os.path.join(RIP, "MonoBehaviour", "IntroCinematic.playable"))
            for t in tracks:
                if not t["keys"] and t["name"] in rip:
                    t["keys"] = rip[t["name"]]
        vcx = S.vcam(d["virtualCamera"]) or {}
        cine = {"parent": [r4(v) for v in S.world(par).T.flatten()], "fov": r4(vcd["m_Lens"]["FieldOfView"]),
                "sx": vcx.get("sx", 0.5), "sy": vcx.get("sy", 0.5),
                "tracks": tracks, "signals": sorted(set(sigs))}
        break

    # ---- chân dung: SpeakerData.portraitPrefab (+ portraitOverrideConditions) → các lớp AddressableSpriteLoader
    os.makedirs(ART, exist_ok=True)
    portraits, speakers = {}, {}
    sprite_cache = {}

    def sprite_by_container(path):
        c = Dt.containers.get(path)
        if not c:
            return None
        for sf in W.load(c["bundle"]):
            o = sf.objects.get(c["path_id"])
            if o is not None:
                return o
        return None

    def export_layer(sprite_obj, rel, w, h):
        if rel in sprite_cache:
            return sprite_cache[rel]
        img = sprite_obj.read().image
        k = min(1.0, PORTRAIT_MAX / max(w, h, 1)) * max(w, h) / max(img.width, img.height)
        if k < 1:
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        path = os.path.join(ART, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, "WEBP", quality=80, method=6)
        sprite_cache[rel] = "art/portraits/" + rel
        return sprite_cache[rel]

    def prefab_layers(go_obj, prefab):
        import numpy as np
        sf = go_obj.assets_file
        layers = []

        def walk(go, ox, oy, sc):
            g = go.read_typetree()
            if not g.get("m_IsActive", 1):
                return
            tr = rt = None
            mbs = []
            for c in g["m_Component"]:
                co = sf.objects.get(c["component"]["m_PathID"])
                if co is None:
                    continue
                if co.type.name in ("RectTransform", "Transform"):
                    tr, rt = co, co.read_typetree()
                elif co.type.name == "MonoBehaviour":
                    mbs.append(co)
            if rt is None:
                return
            ap = rt.get("m_AnchoredPosition", {"x": 0, "y": 0})
            sd = rt.get("m_SizeDelta", {"x": 0, "y": 0})
            ls = rt["m_LocalScale"]
            x, y = ox + ap["x"] * sc, oy + ap["y"] * sc
            s2 = sc * ls["x"]
            for mb in mbs:
                cn = W.cls(mb)
                spr = None
                if cn == "AddressableSpriteLoader":
                    guid = mb.read_typetree()["assetReference"]["m_AssetGUID"]
                    path = Dt.GUIDS.get(guid)
                    spr = sprite_by_container(path) if path else None
                elif cn == "Image":
                    t = mb.read_typetree()
                    if t.get("m_Enabled") and t["m_Sprite"]["m_PathID"]:
                        spr = W.obj(sf, t["m_Sprite"]["m_FileID"], t["m_Sprite"]["m_PathID"])
                if spr is not None:
                    w, h = sd["x"] * s2, sd["y"] * s2
                    nm = re.sub(r"[^A-Za-z0-9_-]", "_", g["m_Name"])
                    src = export_layer(spr, "%s/%s.webp" % (prefab, nm), w, h)
                    layers.append({"src": src, "x": r4(x), "y": r4(y), "w": r4(w), "h": r4(h)})
                    break
            for ch in rt.get("m_Children") or []:
                cto = sf.objects.get(ch["m_PathID"])
                if cto is None:
                    continue
                walk(sf.objects[cto.read_typetree()["m_GameObject"]["m_PathID"]], x, y, s2)
        walk(go_obj, 0.0, 0.0, 1.0)
        return layers

    for sfs in W.bundle_cabs.values():
        for sf in sfs:
            for o in sf.objects.values():
                if o.type.name != "MonoBehaviour" or W.cls(o) != "SpeakerData":
                    continue
                t = o.read_typetree()
                nm = t["m_Name"]
                if nm in speakers:
                    continue
                pf = [t.get("portraitPrefab")] + [po.get("portraitPrefab") for po in t.get("portraitOverrideConditions") or []]
                info = {}
                for i, ptr in enumerate(pf):
                    if not ptr or not ptr.get("m_PathID"):
                        continue
                    go = W.obj(sf, ptr["m_FileID"], ptr["m_PathID"])
                    if go is None:
                        continue
                    pn = go.read_typetree()["m_Name"]
                    if pn not in portraits:
                        portraits[pn] = prefab_layers(go, pn)
                    info["portrait" if i == 0 else "override%d" % (i - 1)] = pn
                speakers[nm] = info

    # ---- tiếng cảm thán: SpeakerData.paralinguistics (Odin, đã có trong DR_WORLD) → GUID → Assets/Audio/Vocals/*.wav
    vox_dir = os.path.join(ART, "vox")
    os.makedirs(vox_dir, exist_ok=True)
    ref_vox = r"D:\dredge-ref\audio\vocals"
    vox = {}
    for nm, sd in (world_data.get("SpeakerData") or {}).items():
        for k, refs in (sd.get("paralinguistics") or {}).items():
            typ = PARA[int(k)].lower()
            for r in refs:
                path = Dt.GUIDS.get(r.get("m_AssetGUID"))
                if not path:
                    continue
                base = os.path.splitext(os.path.basename(path))[0].replace(" ", "_")
                srcf = os.path.join(ref_vox, base + ".ogg")
                if not os.path.exists(srcf):
                    print("vocal clip not found:", srcf)
                    continue
                dst = os.path.join(vox_dir, base + ".mp3")
                if not os.path.exists(dst):
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", srcf, "-ac", "1", "-b:a", "%dk" % VOX_KBPS,
                                    "-map_metadata", "-1", dst], check=True)
                vox.setdefault(nm, {}).setdefault(typ, []).append("art/portraits/vox/" + base + ".mp3")
    # ---- font hội thoại: DialogueView/DialogueText dùng "Front Page Neue SDF" (Game.unity); chữ thoại là tiếng Anh gốc
    from fontTools import subset as ft_subset
    from fontTools.ttLib import TTFont
    ttf = r"D:\dredge-ref\ripped\ExportedProject\Assets\Font\Front Page Neue.ttf"
    font_out = os.path.join(ART, "font", "FrontPageNeue.woff2")
    if os.path.exists(ttf):
        os.makedirs(os.path.dirname(font_out), exist_ok=True)
        f = TTFont(ttf)
        o = ft_subset.Options()
        o.flavor = "woff2"
        sub = ft_subset.Subsetter(o)
        sub.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2013, 0x2014])
        sub.subset(f)
        f.flavor = "woff2"
        f.save(font_out)
    else:
        print("font not found:", ttf)
    return {"cinematic": cine, "docks": {k: docks[k] for k in sorted(docks)},
            "speakers": {k: speakers[k] for k in sorted(speakers)},
            "portraits": {k: portraits[k] for k in sorted(portraits)},
            "vox": {k: vox[k] for k in sorted(vox)}}


# ---------------------------------------------------------------- màn mở đầu (Scenes/IntroCutscene.unity, AssetRipper YAML)
RIP = r"D:\dredge-ref\ripped\ExportedProject\Assets"
INTRO_SCENE = os.path.join(RIP, "Scenes", "IntroCutscene.unity")
INTRO_ANIM = os.path.join(RIP, "AnimationClip", "IntroCutscene.anim")
INTRO_AUDIO = os.path.join(RIP, "AudioClip", "opening-ambience.ogg")
INTRO_MAX = 1024      # [ĐỀ XUẤT] cạnh dài tối đa (px) mỗi sprite của màn mở đầu
INTRO_KBPS = 96       # [ĐỀ XUẤT] mp3 stereo cho tiếng nền mở đầu (31,8 s)


def yaml_blocks(path):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        t = fh.read()
    parts = re.split(r"^--- !u!(\d+) &(-?\d+)(?: stripped)?\n", t, flags=re.M)
    return {parts[i + 1]: (parts[i], parts[i + 2]) for i in range(1, len(parts), 3)}


def yv(body, key):
    m = re.search(r"^  " + key + r": (.*)$", body, re.M)
    return m.group(1).strip() if m else None


def yvec(s):
    """'{x: 1, y: 2, z: 3}' → [1.0, 2.0, 3.0] (theo thứ tự xuất hiện)."""
    return [float(v) for v in re.findall(r"[xyzwrgba]: (-?[\d.]+(?:e-?\d+)?|-?Infinity)", s or "")]


def guid_index(dirs):
    out = {}
    for d in dirs:
        for fn in os.listdir(os.path.join(RIP, d)):
            if not fn.endswith(".meta"):
                continue
            with open(os.path.join(RIP, d, fn), "r", encoding="utf-8", errors="replace") as fh:
                for ln in fh:
                    if ln.startswith("guid:"):
                        out[ln.split()[1]] = os.path.join(RIP, d, fn[:-5])
                        break
    return out


def parse_anim(path):
    """Đường cong của AnimationClip (YAML): [{path, kind, attr, keys: [[t, v..., in..., out...]]}].
    kind: pos | euler | scale | float. Infinity giữ dạng chuỗi 'Inf' để JS làm bước nhảy (tiếp tuyến hằng)."""
    with open(path, "r", encoding="utf-8") as fh:
        t = fh.read()
    out = []
    kinds = {"m_PositionCurves": "pos", "m_EulerCurves": "euler", "m_ScaleCurves": "scale", "m_FloatCurves": "float"}
    secs = re.split(r"^  (m_\w+Curves):", t, flags=re.M)

    def num(s):
        s = s.strip()
        if "Infinity" in s:
            return "Inf" if not s.startswith("-") else "-Inf"
        return round(float(s), 5)
    for i in range(1, len(secs), 2):
        kind = kinds.get(secs[i])
        if not kind:
            continue
        for ent in re.split(r"^  - curve:\n", secs[i + 1], flags=re.M)[1:]:
            pm = re.search(r"^    path:(.*)$", ent, re.M)
            am = re.search(r"^    attribute: (.*)$", ent, re.M)
            keys = []
            for km in re.finditer(r"^        time: (\S+)\n        value: (.*)\n        inSlope: (.*)\n        outSlope: (.*)$", ent, re.M):
                if kind == "float":
                    v, a, b = [num(km.group(2))], [num(km.group(3))], [num(km.group(4))]
                else:
                    f = lambda s: [num(x) for x in re.findall(r"[xyz]: ([^,}]+)", s)]
                    v, a, b = f(km.group(2)), f(km.group(3)), f(km.group(4))
                keys.append([round(float(km.group(1)), 5)] + v + a + b)
            if pm and keys:
                out.append({"path": pm.group(1).strip(), "kind": kind, "attr": am.group(1).strip() if am else "", "keys": keys})
    m = re.search(r"m_StopTime: (\S+)", t)
    ev = [{"t": round(float(a), 4), "fn": b} for a, b in re.findall(r"- time: (\S+)\n    functionName: (\w+)", t)]
    return out, float(m.group(1)) if m else 0.0, ev


def ripped_timeline_keys(playable):
    """{tên track: khoá vị trí [[t, x,y,z, in xyz, out xyz]]} từ TimelineAsset YAML + AnimationClip YAML của AssetRipper."""
    out = {}
    if not os.path.exists(playable):
        return out
    B = yaml_blocks(playable)
    gidx = guid_index(["AnimationClip"])
    for k, (ty, b) in B.items():
        name = yv(b, "m_Name")
        clips = re.findall(r"m_Asset: \{fileID: (-?\d+)\}", b)
        if not name or not clips or "m_Clips:" not in b:
            continue
        for c in clips:
            ab = B.get(c, (None, ""))[1]
            g = re.search(r"m_Clip: \{fileID: \d+, guid: ([0-9a-f]+)", ab)
            if not g or g.group(1) not in gidx:
                continue
            curves, _, _ = parse_anim(gidx[g.group(1)])
            pos = [cv for cv in curves if cv["kind"] == "pos" and cv["path"] == ""]
            if pos:
                out[name] = pos[0]["keys"]
    return out


def intro_data():
    """Màn mở đầu có minh hoạ (IntroIllustratedCutscene): cây GameObject + SpriteRenderer + camera + Canvas, đường cong hoạt hình."""
    import subprocess
    from PIL import Image
    if not os.path.exists(INTRO_SCENE):
        print("intro scene not found:", INTRO_SCENE)
        return None
    B = yaml_blocks(INTRO_SCENE)
    gidx = guid_index(["Sprite", "Texture2D", "AudioClip"])
    go_tr = {}
    for k, (ty, b) in B.items():
        if ty in ("4", "224"):
            m = re.search(r"m_GameObject: \{fileID: (-?\d+)", b)
            go_tr[m.group(1)] = k

    def comps(go):
        return re.findall(r"component: \{fileID: (-?\d+)\}", B[go][1])

    def kids(tr):
        m = re.search(r"m_Children:\n((?:  - \{fileID: -?\d+\}\n)*)", B[tr][1])
        return re.findall(r"fileID: (-?\d+)", m.group(1)) if m else []
    root_go = next(g for g, (ty, b) in B.items() if ty == "1" and yv(b, "m_Name") == "IntroCutscene")
    out_dir = os.path.join(ART, "intro")
    os.makedirs(out_dir, exist_ok=True)
    sprites = {}

    def sprite(guid):
        if guid in sprites:
            return sprites[guid]
        p = gidx.get(guid)
        if not p or not p.endswith(".asset"):
            sprites[guid] = None
            return None
        with open(p, "r", encoding="utf-8", errors="replace") as fh:
            s = fh.read()
        name = yv(s, "m_Name")
        rect = [float(x) for x in re.findall(r"^    (?:x|y|width|height): (\S+)$", s.split("m_Offset")[0], re.M)]
        tr = re.search(r"textureRect:\n\s+serializedVersion: 2\n\s+x: (\S+)\n\s+y: (\S+)\n\s+width: (\S+)\n\s+height: (\S+)", s)
        trc = [float(v) for v in tr.groups()] if tr else rect
        pivot = yvec(yv(s, "m_Pivot"))
        ppu = float(yv(s, "m_PixelsToUnits") or 100)
        tg = re.search(r"texture: \{fileID: \d+, guid: ([0-9a-f]+)", s)
        tex = gidx.get(tg.group(1)) if tg else None
        if not tex or not os.path.exists(tex):
            print("intro sprite texture not found:", name)
            sprites[guid] = None
            return None
        img = Image.open(tex).convert("RGBA")
        x, y, w, h = trc
        crop = img.crop((round(x), round(img.height - y - h), round(x + w), round(img.height - y)))
        k = min(1.0, INTRO_MAX / max(crop.size))
        if k < 1:
            crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
        rel = "intro/" + re.sub(r"[^A-Za-z0-9_-]", "_", name) + ".webp"
        crop.save(os.path.join(ART, rel), "WEBP", quality=80, method=6)
        sprites[guid] = {"src": "art/portraits/" + rel, "w": round(rect[2] / ppu, 5), "h": round(rect[3] / ppu, 5),
                         "px": round(pivot[0], 5), "py": round(pivot[1], 5)}
        return sprites[guid]

    nodes = []

    def walk(go, parent, prefix):
        b = B[go][1]
        name = yv(b, "m_Name")
        path = (prefix + "/" + name) if prefix is not None else ""
        tr = B[go_tr[go]][1]
        n = {"path": path, "parent": parent, "active": yv(b, "m_IsActive") == "1",
             "p": yvec(yv(tr, "m_LocalPosition")), "r": yvec(yv(tr, "m_LocalRotation")), "s": yvec(yv(tr, "m_LocalScale"))}
        if B[go_tr[go]][0] == "224":
            n["rt"] = {"amin": yvec(yv(tr, "m_AnchorMin")), "amax": yvec(yv(tr, "m_AnchorMax")), "ap": yvec(yv(tr, "m_AnchoredPosition")),
                       "sd": yvec(yv(tr, "m_SizeDelta")), "piv": yvec(yv(tr, "m_Pivot"))}
        for c in comps(go):
            ty, cb = B[c]
            if ty == "212" and yv(cb, "m_Enabled") == "1":
                g = re.search(r"m_Sprite: \{fileID: -?\d+, guid: ([0-9a-f]+)", cb)
                sp = sprite(g.group(1)) if g else None
                if sp:
                    n["sprite"] = dict(sp, order=int(yv(cb, "m_SortingOrder") or 0), color=yvec(yv(cb, "m_Color")),
                                       flipX=yv(cb, "m_FlipX") == "1", flipY=yv(cb, "m_FlipY") == "1")
            if ty == "82":
                ac = re.search(r"m_audioClip: \{fileID: \d+, guid: ([0-9a-f]+)", cb)
                if ac:
                    n["audio"] = os.path.basename(gidx.get(ac.group(1), ""))
            if ty == "114" and "m_text:" in cb:
                n["text"] = {"text": yv(cb, "m_text").strip("'\""), "size": float(yv(cb, "m_fontSize") or 36)}
            if ty == "114" and "m_Sprite:" in cb and "m_Color:" in cb and "m_RaycastTarget" in cb:
                n["image"] = {"color": yvec(yv(cb, "m_Color"))}
        idx = len(nodes)
        nodes.append(n)
        for ch in kids(go_tr[go]):
            cgo = re.search(r"m_GameObject: \{fileID: (-?\d+)", B[ch][1]).group(1)
            walk(cgo, idx, path if prefix is not None else "")
    walk(root_go, -1, None)
    for n in nodes:
        n["path"] = n["path"].lstrip("/")
    curves, dur, events = parse_anim(INTRO_ANIM)
    lens = re.search(r"FieldOfView: (\S+)", open(INTRO_SCENE, encoding="utf-8", errors="replace").read())
    audio = None
    if os.path.exists(INTRO_AUDIO):
        dst = os.path.join(out_dir, "opening-ambience.mp3")
        if not os.path.exists(dst):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", INTRO_AUDIO, "-b:a", "%dk" % INTRO_KBPS, "-map_metadata", "-1", dst], check=True)
        audio = "art/portraits/intro/opening-ambience.mp3"
    print("intro: %d nodes, %d sprites, %d curves, %.2f s" % (len(nodes), sum(1 for v in sprites.values() if v), len(curves), dur))
    return {"dur": round(dur, 4), "fov": float(lens.group(1)) if lens else 60.0, "events": events, "nodes": nodes,
            "curves": curves, "audio": audio}


def read_js(name):
    p = os.path.join(DATA, name)
    with open(p, "r", encoding="utf-8") as fh:
        t = fh.read()
    return json.loads(t[t.index("=") + 1:].strip().rstrip(";"))


def main():
    prog, meta = read_asset(ASSET)
    name, nodes, init = program(prog)
    lines = read_lines()
    used, missing = set(), set()
    n_ins = 0
    for nd in nodes.values():
        nd.pop("name", None)
        n_ins += len(nd["i"])
        for ins in nd["i"]:
            if ins[0] in (2, 4):  # RunLine, AddOption
                used.add(ins[1])
                if ins[1] not in lines:
                    missing.add(ins[1])
    out = {
        "version": "2.2.0",
        "name": name,
        "ops": OPS,
        "nodes": {k: nodes[k] for k in sorted(nodes)},
        "init": {k: init[k] for k in sorted(init)},
        "lines": {k: lines[k] for k in sorted(used) if k in lines},
        "meta": {k: meta[k] for k in sorted(meta) if k in used},
    }
    if "--no-art" not in sys.argv:
        st = story(read_js("world_data.js"))
        out.update(st)
        out["intro"] = intro_data()
        n_layers = sum(len(v) for v in st["portraits"].values())
        n_vox = sum(len(x) for v in st["vox"].values() for x in v.values())
        print("docks %d (%d destinations), portraits %d (%d layers), speakers %d, vocal clips %d"
              % (len(st["docks"]), sum(len(d["dests"]) for d in st["docks"].values()), len(st["portraits"]),
                 n_layers, len(st["speakers"]), n_vox))
    else:
        old = read_js("yarn.js") if os.path.exists(OUT) else {}
        for k in ("docks", "speakers", "portraits", "vox", "intro", "cinematic"):
            if k in old:
                out[k] = old[k]
    head = ("/* generated by games/dredge/tools/yarn.py from Dredge.asset (YarnProject, Yarn Spinner 2.2) "
            "+ data/strings-dialogue.js — do not edit */\n")
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(head + "window.DR_YARN=" + body + ";\n")
    ops = {}
    for nd in nodes.values():
        for ins in nd["i"]:
            ops[OPS[ins[0]]] = ops.get(OPS[ins[0]], 0) + 1
    cmds = {}
    for nd in nodes.values():
        for ins in nd["i"]:
            if ins[0] == 3:
                c = ins[1].split(" ")[0]
                cmds[c] = cmds.get(c, 0) + 1
            if ins[0] == 12:
                cmds["fn:" + ins[1]] = cmds.get("fn:" + ins[1], 0) + 1
    print("program %r: %d nodes, %d instructions, %d init vars, %d lines used (%d missing text), %d metadata"
          % (name, len(nodes), n_ins, len(init), len(used), len(missing), len(out["meta"])))
    print("opcodes:", json.dumps(ops, sort_keys=True))
    print("commands/functions:", json.dumps(dict(sorted(cmds.items())), ensure_ascii=False))
    if missing:
        print("missing line text (first 10):", sorted(missing)[:10])
    print("wrote", os.path.normpath(OUT), os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
