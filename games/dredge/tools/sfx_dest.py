# -*- coding: utf-8 -*-
"""Bóc tiếng vào/ở điểm đến của DREDGE: BaseDestination.visitSFX / loopSFX / isIndoors và SpeakerData tương ứng.

Chạy:  python -I games/dredge/tools/sfx_dest.py     (sau index_bundles.py; ~2 phút vì phải nạp mọi bundle để giải PPtr)
Ghi:   D:\\dredge-ref\\cache\\sfx_dest.json   (tools/sfx_scene.py đọc tệp này đưa vào data/sfx.js: DR_SFX.destinations)

[BẪY ĐÃ SẬP] AssetRipper bỏ HẾT trường của Dock/BaseDestination (SerializedMonoBehaviour của Odin): khối YAML chỉ còn m_Script.
Typetree trong bundle scene thì đủ, nên đọc bằng UnityPy như tools/yarn.py. Clip của tiếng vào nằm ở bundle audio,
mà World.load_all() của data.py bỏ qua bundle audio: phải nạp riêng 'gameaudio'/'commonaudio'/'gamescene' mới tra ra tên clip.
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data as Dt  # noqa: E402  (dùng lại World/containers của tools/data.py)

W = Dt.W
SCENE_BUNDLE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
OUT = os.path.join(os.environ.get("DREDGE_REF", r"D:\dredge-ref"), "cache", "sfx_dest.json")


def clip_name(sf, ptr):
    """visitSFX là AssetReference ({m_AssetGUID}: guid của catalog Addressables); loopSFX là PPtr AudioClip trực tiếp."""
    if not ptr:
        return None
    if ptr.get("m_AssetGUID"):
        p = Dt.GUIDS.get(ptr["m_AssetGUID"])
        return os.path.splitext(os.path.basename(p))[0] if p else None
    if not ptr.get("m_PathID"):
        return None
    o = W.obj(sf, ptr["m_FileID"], ptr["m_PathID"])
    if o is None:
        return None
    return o.read().m_Name if o.type.name == "AudioClip" else None


def main():
    W.load_all()
    for b in sorted(Dt.index["bundles"]):          # bundle audio: chỉ cần tên clip, không giải mã âm thanh
        if any(x in b for x in ("gameaudio", "commonaudio", "gamescene", "titleaudio", "player")):
            W.load(b)
    sf = W.load(SCENE_BUNDLE)[0]
    dests, speakers = {}, {}
    for cab in W.load(SCENE_BUNDLE):
        for o in cab.objects.values():
            if o.type.name != "MonoBehaviour":
                continue
            cn = W.cls(o)
            if not cn.endswith("Destination"):
                continue
            d = o.read_typetree()
            if not d.get("id"):
                continue
            dests[d["id"]] = dict(cls=cn, visit=clip_name(cab, d.get("visitSFX")), loop=clip_name(cab, d.get("loopSFX")),
                                  indoors=bool(d.get("isIndoors")))
    for b in sorted(Dt.index["bundles"]):
        if "audio" in b or "localization" in b:
            continue
        for cab in W.load(b):
            for o in cab.objects.values():
                if o.type.name == "MonoBehaviour" and W.cls(o) == "SpeakerData":
                    d = o.read_typetree()
                    speakers[d.get("m_Name")] = dict(visit=clip_name(cab, d.get("visitSFX")), loop=clip_name(cab, d.get("loopSFX")),
                                                     indoors=bool(d.get("isIndoors")))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(dict(destinations=dict(sorted(dests.items())), speakers=dict(sorted(speakers.items()))), fh, ensure_ascii=False, indent=1, sort_keys=True)
    print("destinations", len(dests), "| with visit", sum(1 for v in dests.values() if v["visit"]), "| with loop", sum(1 for v in dests.values() if v["loop"]),
          "| speakers", len(speakers), "| with visit", sum(1 for v in speakers.values() if v["visit"]), "| with loop", sum(1 for v in speakers.values() if v["loop"]))


main()
