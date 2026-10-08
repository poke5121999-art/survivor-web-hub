# -*- coding: utf-8 -*-
"""Bóc banner thông báo của DREDGE (BannersUI / BannerUI trong Scenes/Game.unity) cho Biển Mù.

Chạy (sau harvest_ui.py vì dùng chung bộ đọc cảnh, chỉ mục guid, catalog addressables và hàm cắt sprite của nó):
    python -I games/dredge/tools/banner_ui.py
Đọc    D:/dredge-ref/ripped/ExportedProject/Assets (Scenes/Game.unity, AnimatorController/BannerAnimator.controller, AnimationClip/*.anim,
       Sprite/*.asset + Texture2D/*.png), catalog.json của bản build (guid AssetReference -> tên clip tiếng).
Ghi    games/dredge/art/ui/banner/banner_ui.js   window.DR_BANNER_UI = {canvas, pos, tree, clips, sfx, strings, sprites}
       games/dredge/art/ui/banner/sprites/*.webp  (SoftGlow, TitleBackground, BannerBG, TrophyIcon)
Chạy lại bao nhiêu lần cũng ra cùng kết quả.

Bẫy đã sập:
- BannersUI.topYPos / bottomYPos (250 / −250) đặt anchoredPosition.y của BannerUIContainer (nơi gắn BannerUI + Animator), KHÔNG phải của
  nút "BannerUI" con (600x100, tắt sẵn, clip Enter bật nó lên).
- holdTimeSec = 5 là hằng trong mã (BannersUI.cs:9, lớp BannerListing), không có trong cảnh.
- Clip Exit gọi sự kiện OnHideCompleteEventFired ở 0,25 s: banner kế tiếp chỉ hiện sau mốc đó (BannersUI.ProcessListing).
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import yaml
import harvest_ui as H          # Scene, walk, clip, catalog, export_sprite, GUID, r3 (harvest_ui đã đặt stdout UTF-8)

OUT = os.path.normpath(os.path.join(HERE, "..", "art", "ui", "banner"))


def anim_events(name):
    t = open(H.ASSETS + "AnimationClip/%s.anim" % name, encoding="utf-8").read().split("\n", 3)[3]
    d = yaml.safe_load(t)["AnimationClip"]
    return [{"t": H.r3(float(e["time"])), "fn": e["functionName"]} for e in d.get("m_Events") or []]


def controller(path):
    """AnimatorController -> {state: {clip, speed, to: [(cond, param, state)]}, default}."""
    txt = open(H.ASSETS + path, encoding="utf-8").read()
    blocks = {int(m.group(2)): (int(m.group(1)), m.group(3)) for m in re.finditer(r"^--- !u!(\d+) &(-?\d+)\n(.*?)(?=^--- |\Z)", txt, re.M | re.S)}
    Y = {k: next(iter(yaml.safe_load(b).values())) for k, (t, b) in blocks.items()}
    states = {}
    for k, (t, b) in blocks.items():
        if t == 1102:                                            # AnimatorState
            d = Y[k]
            clip = os.path.basename(H.GUID.get(d["m_Motion"].get("guid", ""), "")).rsplit(".", 1)[0]
            states[k] = {"name": d["m_Name"], "clip": clip, "speed": d["m_Speed"], "tr": [x["fileID"] for x in d.get("m_Transitions") or []]}
    out = {}
    for k, s in states.items():
        tr = []
        for tid in s["tr"]:
            d = Y[tid]
            conds = [{"mode": c["m_ConditionMode"], "param": c["m_ConditionEvent"]} for c in d.get("m_Conditions") or []]
            tr.append({"to": states[d["m_DstState"]["fileID"]]["name"], "if": conds, "duration": d["m_TransitionDuration"], "exitTime": d.get("m_HasExitTime")})
        out[s["name"]] = {"clip": s["clip"], "speed": s["speed"], "to": tr}
    sm = next(Y[k] for k, (t, b) in blocks.items() if t == 1107)
    return out, states[sm["m_DefaultState"]["fileID"]]["name"]


def main():
    S = H.Scene(H.SCENE)
    bs_mb = S.owner_of_guid(H.script_guid("BannersUI"))[0]
    bs = S.y(bs_mb)[1]
    banners_go = bs["m_GameObject"]["fileID"]
    bu_mb = bs["bannerUI"]["fileID"]
    bu = S.y(bu_mb)[1]
    container_go = bu["m_GameObject"]["fileID"]
    path_of = {}
    tree = H.walk(S, banners_go, "", path_of)
    # ---- canvas cha (CanvasScaler) để quy đổi đơn vị
    canvas = None
    t = H.tf_of(S, banners_go)
    while t:
        d = S.y(t)[1]
        go = d["m_GameObject"]["fileID"]
        for c in H.comps_of(S, go):
            k, cd = S.y(c)
            if k == "MonoBehaviour" and "m_ReferenceResolution" in cd:
                canvas = {"node": S.y(go)[1]["m_Name"], "mode": cd["m_UiScaleMode"], "ref": [cd["m_ReferenceResolution"]["x"], cd["m_ReferenceResolution"]["y"]],
                          "match": cd["m_MatchWidthOrHeight"], "screenMatch": cd["m_ScreenMatchMode"]}
            if k == "Canvas":
                canvas = dict(canvas or {}, sortingOrder=cd.get("m_SortingOrder"))
        t = d["m_Father"]["fileID"]
    # ---- tiếng: AssetReference -> catalog -> tên clip gốc (tên DRAudio.play nhận được qua trường orig)
    cat = H.catalog()
    sfx = {}
    for k in ("regularSFX", "bookCompleteSFX", "fishSFX", "aberrationSFX", "researchSFX"):
        g = bu[k]["m_AssetGUID"]
        sfx[k] = os.path.basename(cat.get(g, "?")).rsplit(".", 1)[0]
    # ---- Animator: BannerAnimator (tham số "showing"), clip Enter / Exit / Idle
    anim = next((S.y(c)[1] for c in H.comps_of(S, container_go) if S.y(c)[0] == "Animator"), None)
    ctrl_path = H.GUID[anim["m_Controller"]["guid"]]
    states, default = controller(ctrl_path)
    clips = {}
    for st in states.values():
        c = H.clip(st["clip"])
        c["events"] = anim_events(st["clip"])
        clips[st["clip"]] = c
    # ---- sprite của cây + TrophyIcon (thẻ sprite trong chữ phụ của banner cúp)
    H.OUT = OUT
    H.SPRITES.clear()
    H.walk(S, banners_go, "", {})                                # walk() ghi sprite_ref vào H.SPRITES
    H.SPRITES.pop("mackerel", None)                              # ảnh cá mẫu của cảnh, lúc chạy thay bằng sprite của món
    for extra in ("TrophyIcon",):
        for base in ("Sprite/%s.asset" % extra, "Sprite/%s_0.asset" % extra):
            if os.path.exists(H.ASSETS + base):
                H.SPRITES[extra] = base
                break
    meta = {name: H.export_sprite(name, rel) for name, rel in sorted(H.SPRITES.items())}
    from PIL import Image
    for name in ("BannerBG", "SoftGlow_0"):                      # vầng tối / vầng sáng mịn: webp có mất mát nhỏ hơn nhiều, nhìn không khác
        f = OUT + "/sprites/%s.webp" % name
        if os.path.exists(f):
            Image.open(f).convert("RGBA").save(f, "WEBP", quality=85, method=6)
    # ---- chuỗi gốc (tiếng Anh, bảng chuỗi do tools/data.py xuất) để đối chiếu bản dịch trong js/banner.js
    sj = open(os.path.join(HERE, "..", "data", "strings.js"), encoding="utf-8").read()
    STR = json.loads(sj[sj.index("=") + 1:sj.rstrip().rindex(";")])
    strings = {k: STR.get(k) for k in ("notification.fish-discovered.subtitle", "notification.trophy-fish.title",
                                       "notification.relic-discovered.title", "notification.relic-discovered.subtitle")}
    data = {"canvas": canvas, "pos": {"top": bs["topYPos"], "bottom": bs["bottomYPos"], "src": "Game.unity BannersUI &%d" % bs_mb},
            "hold": 5, "tree": tree, "states": states, "default": default, "clips": clips, "sfx": sfx, "strings": strings, "sprites": meta,
            "colors": {"NEUTRAL": "#ffffff", "CRITICAL": "#871d58", "EMPHASIS": "#3b9795", "TROPHY": "#ffd104"}}
    os.makedirs(OUT, exist_ok=True)
    js = "/* generated by tools/banner_ui.py - do not edit */\nwindow.DR_BANNER_UI=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(OUT + "/banner_ui.js", "w", encoding="utf-8").write(js)
    print("banner_ui.js", len(js), "B;", len(meta), "sprites;", sfx)


if __name__ == "__main__":
    main()
