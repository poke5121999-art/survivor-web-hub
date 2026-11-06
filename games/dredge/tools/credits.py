# -*- coding: utf-8 -*-
"""Bóc màn Credits (CreditsController + prefab Credits + PlayCredits.anim) và mặc định Settings cho Biển Mù (đơn vị W7).

Chạy:  python -I games/dredge/tools/credits.py        (~20 giây, chạy lại ra đúng từng byte)
Cần:   thư mục bóc D:\\dredge-ref\\ripped\\ExportedProject (AssetRipper), PyYAML.
Ra:    data/credits.js   window.DR_CREDITS
         credits   { speedPxPerSecond, ref, timeline, short[], long[] }   cảnh cuộn chữ
         settings  { defaults, typewriterSpeeds, holdTimes, gameModes, worldEventRollFrequency }

Nguồn (chỉ đọc):
  GameObject/Credits.prefab          cây RectTransform/TextMeshProUGUI: Page_BSG + Page_Music (trang ngắn) và Page_Long (cuộn).
                                     CreditsController.speedPxPerSecond = 100 (canvas tham chiếu 1920x1080, CanvasScaler)
  AnimationClip/PlayCredits.anim     alpha Scrim / Page_BSG / Page_Music / Names theo giây, sự kiện CanShowSkipAction (7 s)
                                     và OnMainCreditsComplete (11,5 s) = hết trang ngắn, hiện trang dài và cuộn
  MonoBehaviour/SettingsSaveDataTemplate.asset   mặc định các trường cài đặt (SettingsSaveData.cs)
  Scenes/Game.unity                  DredgeDialogueView.typewriterSpeeds [0,5; 1; 2], NotificationsUI.holdTimes [3; 5; 8]
  data/config.js (đã có)             worldEventRollFrequency NORMAL/PASSIVE/NIGHTMARE

Bẫy đã sập:
  1. Credits_0.prefab là bản sao của Credits.prefab (AssetRipper xuất hai lần); dùng Credits.prefab.
  2. Danh sách tên có hai nơi: component CreditsTeamContainer.people là dữ liệu editor, nhưng thứ HIỆN RA là các con
     "CreditName(Clone)" trong PersonContainer (đã sinh sẵn lúc lưu prefab); lưới CreditNameHelper cũng sinh con "CreditName".
     Tool đọc con thật, có thể khác people.
  3. Con có m_IsActive 0 (TeamName "Head of Studio Development" dưới Head of Studios, logo Page_Music, tiêu đề lặp
     "Epiphany Games", "Team17 Digital") KHÔNG hiện; bỏ cả nhánh.
  4. Chuỗi trong prefab có \\r cuối (CRLF của danh sách dán vào); cắt bỏ.
  5. Logo (BSGLogo, Team17 Logo, Logo của Page_Music) là Image không nằm trong bộ sprite đã bóc: bản web thay bằng chữ
     [ĐỀ XUẤT]. Tiêu đề phòng ban dịch sang tiếng Việt (VI), tên người giữ nguyên.
"""
import io
import json
import os
import re
import sys

import yaml

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, ".."))
SRC = r"D:\dredge-ref\ripped\ExportedProject\Assets"
OUT = os.path.join(GAME, "data", "credits.js")

# Tiêu đề (phòng ban, đội, vai) -> tiếng Việt. Không có trong bảng thì giữ nguyên chuỗi gốc.
VI = {
    "Producer": "Sản xuất", "Programmer / Author": "Lập trình / Tác giả", "Art Lead": "Trưởng mỹ thuật",
    "3D Art / Animation": "Mỹ thuật 3D / Hoạt họa", "Composer / Audio Lead": "Soạn nhạc / Trưởng âm thanh",
    "Additional Audio": "Âm thanh bổ sung", "Black Salt Games": "Black Salt Games",
    "Additional Quality Assurance": "Kiểm thử chất lượng bổ sung", "Additional Community Management": "Quản lý cộng đồng bổ sung",
    "Voice Actors": "Diễn viên lồng tiếng", "Session Musicians": "Nhạc công thu âm", "Black Salt Pets": "Thú cưng của Black Salt",
    "Playtesters": "Người chơi thử", "Special Thanks": "Đặc biệt cảm ơn", "CEO": "Giám đốc điều hành", "Lead Developer": "Trưởng lập trình",
    "QA Manager": "Quản lý kiểm thử", "Head of Studios": "Trưởng các studio", "Head of Studio Development": "Trưởng phát triển studio",
    "Production": "Sản xuất", "X-Dev Manager": "Quản lý X-Dev", "Lead Producer": "Trưởng sản xuất", "Art": "Mỹ thuật",
    "Head of Art": "Trưởng mỹ thuật", "Art Manager": "Quản lý mỹ thuật", "Art Director": "Giám đốc mỹ thuật", "Additional Art": "Mỹ thuật bổ sung",
    "Design": "Thiết kế", "Head of Design": "Trưởng thiết kế", "Design Manager": "Quản lý thiết kế", "Game Designer": "Thiết kế game",
    "Programming": "Lập trình", "Head of Technology": "Trưởng công nghệ", "QA": "Kiểm thử", "Studio QA Director": "Giám đốc kiểm thử studio",
    "Associate QA Managers": "Phó quản lý kiểm thử", "Project Lead": "Trưởng dự án", "Test Lead": "Trưởng nhóm thử", "Additional QA": "Kiểm thử bổ sung",
    "Test Engineering Specialist": "Chuyên viên kỹ thuật kiểm thử", "Release Management": "Quản lý phát hành",
    "Head of Release Management": "Trưởng quản lý phát hành", "Release Manager": "Quản lý phát hành", "Associate Release Manager": "Phó quản lý phát hành",
    "Release Co-ordinator": "Điều phối phát hành", "Compliance QA": "Kiểm thử tuân thủ", "Lead Compliance Analyst": "Trưởng phân tích tuân thủ",
    "Compliance Consultant": "Tư vấn tuân thủ", "Senior Compliance Analysts": "Phân tích tuân thủ cấp cao", "Compliance Analysts": "Phân tích tuân thủ",
    "Usability": "Khả dụng", "Usability Manager": "Quản lý khả dụng", "User Researchers": "Nghiên cứu người dùng",
    "Junior User Researchers": "Nghiên cứu người dùng mới vào nghề",
    "New Zealand bird songs and calls": "Tiếng chim hót và kêu của New Zealand",
    "New Zealand Game Development Sector Rebate": "Hỗ trợ ngành phát triển game New Zealand",
    "New Zealand Centre of Digital Excellence": "Trung tâm Xuất sắc Kỹ thuật số New Zealand",
    "Regional Economic Development & Investment Unit": "Đơn vị Phát triển Kinh tế và Đầu tư Vùng",
}


def vi(s):
    return VI.get(s, s)


def load_docs(path):
    t = io.open(path, encoding="utf-8").read()
    docs = {}
    for m in re.finditer(r"--- !u!(\d+) &(\d+)\n(.*?)(?=\n--- !u!|\Z)", t, re.S):
        docs[int(m.group(2))] = (int(m.group(1)), yaml.load(m.group(3), Loader=yaml.CSafeLoader))
    return docs


def main():
    docs = load_docs(os.path.join(SRC, "GameObject", "Credits.prefab"))
    gos = {k: v[1]["GameObject"] for k, v in docs.items() if v[0] == 1}
    tr = {}
    for k, (c, d) in docs.items():
        if c in (4, 224):
            b = list(d.values())[0]
            tr[b["m_GameObject"]["fileID"]] = b

    def comps(g):
        out = []
        for c in gos[g]["m_Component"]:
            cid = c["component"]["fileID"]
            if cid in docs:
                out.append(list(docs[cid][1].values())[0])
        return out

    def text_of(g):
        for b in comps(g):
            if "m_text" in b:
                return str(b["m_text"]).replace("\r", "").strip()
        return None

    def helper(g):
        for b in comps(g):
            if "names" in b and "columns" in b:
                return b
        return None

    def kids(g):
        for ch in tr[g]["m_Children"]:
            yield list(docs[ch["fileID"]][1].values())[0]["m_GameObject"]["fileID"]

    def find(g, name):
        if gos[g]["m_Name"] == name:
            return g
        for c in kids(g):
            r = find(c, name)
            if r:
                return r
        return None

    root = next(k for k, v in gos.items() if v["m_Name"] == "Credits")

    # ---- trang ngắn: Names/<người>/Name + Role
    def short_page(pname, title):
        pg = find(root, pname)
        rows = []
        for person in kids(find(pg, "Names")):
            if not gos[person]["m_IsActive"]:
                continue
            nm = rl = None
            for c in kids(person):
                if gos[c]["m_Name"] == "Name":
                    nm = text_of(c)
                elif gos[c]["m_Name"] == "Role":
                    rl = text_of(c)
            rows.append({"name": nm, "role": vi(rl), "en": rl})
        return {"id": pname, "title": title, "rows": rows}

    short = [short_page("Page_BSG", "Black Salt Games"), short_page("Page_Music", "Mikatte Music")]

    # ---- trang dài: khối theo thứ tự hiển thị
    def cls(name):
        if name in ("DepartmentName", "Title"):
            return "dept"
        if name == "TeamName" or (name.endswith("Name") and name not in ("CreditName(Clone)", "Name")):
            return "team"
        return None

    blocks = []

    def walk(g, parent=''):
        go = gos[g]
        if not go["m_IsActive"]:
            return
        h = helper(g)
        if h:
            title = None
            for c in kids(g):
                if gos[c]["m_Name"] == "Title" and gos[c]["m_IsActive"]:
                    title = text_of(c)
            grid = next((c for c in kids(g) if gos[c]["m_Name"] == "Grid"), None)
            names = [text_of(c) for c in kids(grid) if gos[c]["m_IsActive"]] if grid else []
            names = [n for n in names if n]
            if h.get("sortAlphabetically"):
                names = sorted(names, key=lambda s: s.lower())
            blocks.append({"k": "grid", "t": vi(title), "en": title, "cols": int(h["columns"]), "h": int(h["nameHeight"]), "names": names})
            return
        txt = text_of(g)
        if txt:
            c = cls(go["m_Name"])
            if c:
                blocks.append({"k": c, "t": vi(txt), "en": txt})
            elif go["m_Name"].endswith("Role"):
                blocks.append({"k": "role", "t": vi(txt), "en": txt})
            elif parent == "PersonContainer":
                blocks.append({"k": "name", "t": txt})
            else:   # chữ đứng riêng ngoài danh sách người (vd "Strategy & Business Intelligence", "Epiphany Games"): tiêu đề
                blocks.append({"k": "dept", "t": vi(txt), "en": txt})
        for c in kids(g):
            walk(c, go["m_Name"])

    for sec in kids(find(root, "Page_Long")):
        before = len(blocks)
        walk(sec)
        if len(blocks) > before:
            blocks[before]["gap"] = 1   # đầu mỗi phần: cách một khoảng lớn

    # ---- speed + timeline
    ctrl = next(b for b in (list(v[1].values())[0] for v in docs.values() if v[0] == 114) if "speedPxPerSecond" in b)
    anim = io.open(os.path.join(SRC, "AnimationClip", "PlayCredits.anim"), encoding="utf-8").read()
    tl = {}
    for cv in re.findall(r"m_Curve:\n(.*?)\n\s+m_PreInfinity.*?attribute: m_Alpha\n\s+path: (\S+)", anim, re.S):
        keys = re.findall(r"time: ([0-9.]+)\n\s+value: ([0-9.]+)", cv[0])
        tl[cv[1]] = [[float(a), float(b)] for a, b in keys]
    ev = [[float(a), b] for a, b in re.findall(r"- time: ([0-9.]+)\n\s+functionName: (\w+)", anim)]
    stop = float(re.search(r"m_StopTime: ([0-9.]+)", anim).group(1))

    # ---- mặc định settings
    tpl = io.open(os.path.join(SRC, "MonoBehaviour", "SettingsSaveDataTemplate.asset"), encoding="utf-8").read()
    defaults = {}
    for k, v in re.findall(r"^  ([A-Za-z0-9]+): (-?[0-9.]+)$", tpl, re.M):
        defaults[k] = float(v) if "." in v else int(v)

    # ---- typewriterSpeeds / holdTimes trong Game.unity (6,6 triệu dòng: đọc từng dòng)
    want = {"typewriterSpeeds:": None, "holdTimes:": None}
    with io.open(os.path.join(SRC, "Scenes", "Game.unity"), encoding="utf-8") as f:
        pend = None
        for line in f:
            s = line.strip()
            if pend:
                if s.startswith("- "):
                    want[pend].append(float(s[2:]))
                    continue
                pend = None
            if s in want and want[s] is None:
                want[s] = []
                pend = s
            if all(v is not None for v in want.values()) and not pend:
                break

    cfg = io.open(os.path.join(GAME, "data", "config.js"), encoding="utf-8").read()
    freq = json.loads(re.search(r'"worldEventRollFrequency":(\{[^}]*\})', cfg).group(1))

    out = {
        "credits": {
            "source": "Credits.prefab + PlayCredits.anim + CreditsController.cs",
            "speedPxPerSecond": ctrl["speedPxPerSecond"], "ref": [1920, 1080], "stopTime": stop,
            "timeline": tl, "events": ev, "scrimAlpha": {"menu": 0.8, "game": 0.5},   # CreditsController.SetCreditsMode
            "longFadeSec": 0.35, "skipHoldSec": 1.0,
            "short": short, "long": blocks,
        },
        "settings": {
            "source": "SettingsSaveDataTemplate.asset + SettingsSaveData.cs", "defaults": defaults,
            "typewriterSpeeds": want["typewriterSpeeds:"], "holdTimes": want["holdTimes:"],
            "gameModes": ["NORMAL", "PASSIVE", "NIGHTMARE"], "worldEventRollFrequency": freq,
        },
    }
    js = "// Sinh bởi tools/credits.py (đơn vị W7). Không sửa tay.\nwindow.DR_CREDITS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print("blocks", len(blocks), "short rows", [len(s["rows"]) for s in short], "speed", ctrl["speedPxPerSecond"], "timeline", list(tl), "events", ev)
    print("defaults", len(defaults), "typewriter", want["typewriterSpeeds:"], "hold", want["holdTimes:"], "freq", freq)


main()
