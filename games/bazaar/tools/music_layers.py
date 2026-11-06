# -*- coding: utf-8 -*-
"""Chợ Phiên W-21 (FX-06): nhạc chiến đấu thích ứng. 4 lớp cường độ của event `Music_<Hero>_Battle`.

    python -I music_layers.py render [hero,...]   # FMOD thời gian thực (event stream hỏng ở NRT): D:\\bazaar-ref\\audio\\render\\layers_<hero>_i<k>.wav
    python -I music_layers.py encode              # cắt chung điểm đầu, vòng lặp, ogg -> audio/music/battle.<hero>.i1..i4.ogg
    python -I music_layers.py patch               # vá data/audio.js (khoá music.battle.<hero>.i1..i4); audio.py export cũng gọi
    python -I music_layers.py all

Đo 2026-10-20 (Vanessa, BoardVanessa.bank): tham số `Music_Battle_Transition` 0..4 của event. 0..3 là bốn lớp liên tục (RMS 0,08 / 0,10 /
0,10 / 0,12, cùng nhịp, cùng điểm vào); 4 là đoạn kết (tắt dần về im lặng trong ~8 s) nên KHÔNG làm lớp. i1..i4 = Transition 0..3.
Cả bốn lớp được cắt chung một điểm đầu và chung độ dài để chéo mờ giữa lớp luôn khớp pha. Mức âm: dùng chung hệ số nhóm `music`
đã đóng băng trong export_stats.json (không chuẩn riêng từng lớp, để lớp mạnh còn to hơn lớp nhẹ như bản gốc).
Tệp .ogg mới chỉ có tên mới, không đụng tệp nào đã phát hành (bẫy audio.py export đổi byte).
"""
import sys, os, re, json, time, wave, subprocess
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audio as A

LAYERS = 4
# hero -> (bank, board prefab, dài giây giống music.battle.<hero> đã phát hành, bitrate)
HEROES = {"vanessa": ("BoardVanessa", "board_van", 82), "pygmalien": ("BoardPygmalien", "board_pyg", 82),
          "dooley": ("BoardDooley", "board_doo", 82), "mak": ("BoardMak", "board_mak", 70), "stelle": ("BoardStelle", "board_ste", 70),
          "jules": ("BoardJules", "board_jul", 70), "karnok": ("BoardKarnok", "board_kar", 70), "dragons": ("BoardDragons", "board_dra", 70)}
BR = "72k"
LOOP_X = 3.0


def wav_of(hero, k):
    return A.RENDER + "/layers_%s_i%d.wav" % (hero, k + 1)


def render(hero):
    import numpy as np
    bank, board, secs = HEROES[hero]
    chain = json.load(open(A.META + r"\chain.json", encoding="utf-8"))
    bkey = [b for b, h in A.BOARD_HERO.items() if h == hero][0]
    path = chain["boards"][bkey]["pvpCombatMusic"]
    tmp = A.RENDER + "/layers_%s_all.wav" % hero
    S = A.Studio("wav:" + tmp)
    for n in ("Master", "Master.strings", "Common", bank):
        S.load(n + ".bank")
        if os.path.exists(A.BANKS + "\\" + n + ".assets.bank"):
            S.load(n + ".assets.bank")
    S.update()
    C = S.C
    d = S.get_event(path)
    S.D.FMOD_Studio_EventDescription_LoadSampleData(d)
    for i in range(600):
        S.update(); time.sleep(0.005)
        ls = C.c_int(); S.D.FMOD_Studio_EventDescription_GetSampleLoadingState(d, C.byref(ls))
        if ls.value in (3, 4):
            break
    spans = []
    for k in range(LAYERS):
        inst = C.c_void_p()
        S.D.FMOD_Studio_EventDescription_CreateInstance(d, C.byref(inst))
        r = S.D.FMOD_Studio_EventInstance_SetParameterByName(inst, b"Music_Battle_Transition", C.c_float(k), 0)
        assert r == 0, "tham số lỗi %d" % r
        S.D.FMOD_Studio_EventInstance_Start(inst)
        c0 = S.clock()
        while S.clock() - c0 < (secs + 2) * 48000:           # bẫy: phải có hạn giờ, không chờ event tự dừng
            S.update(); time.sleep(0.012)
        S.D.FMOD_Studio_EventInstance_Stop(inst, 1)
        for i in range(40):
            S.update(); time.sleep(0.012)
        S.D.FMOD_Studio_EventInstance_Release(inst)
        for i in range(30):
            S.update(); time.sleep(0.012)
        spans.append((c0, S.clock()))
    S.release()
    w = wave.open(tmp)
    assert w.getframerate() == 48000 and w.getnchannels() == 2
    for k, (c0, c1) in enumerate(spans):
        w.setpos(c0)
        fr = w.readframes(int((secs + 2) * 48000))
        o = wave.open(wav_of(hero, k), "wb")
        o.setnchannels(2); o.setsampwidth(2); o.setframerate(48000)
        o.writeframes(fr); o.close()
    w.close()
    os.remove(tmp)
    print("render", hero, "xong", flush=True)


def encode(hero, gain):
    import numpy as np
    bank, board, secs = HEROES[hero]
    arrs = []
    for k in range(LAYERS):
        a, sr = A.read_wav(wav_of(hero, k))
        arrs.append(a if a.shape[1] == 2 else np.repeat(a, 2, axis=1))
    # điểm đầu chung: lớp đầu tiên vượt ngưỡng im lặng
    st = min(int(np.nonzero(np.abs(a).max(axis=1) > 0.002)[0][0]) for a in arrs)
    n = min(len(a) for a in arrs) - st
    n = min(n, int(secs * sr))
    out = {}
    for k, a in enumerate(arrs):
        a = a[st:st + n].copy()
        a = A.make_loop(a, sr, n / sr - LOOP_X - 0.01, LOOP_X)
        a = a * gain
        pk = float(np.abs(a).max())
        if pk > 0.97:
            a = a * (0.97 / pk)
        out[k] = a
    m = min(len(a) for a in out.values())
    res = []
    for k in range(LAYERS):
        fn = os.path.join(A.OUT_AUDIO, "music", "battle.%s.i%d.ogg" % (hero, k + 1))
        size = A.encode(out[k][:m], sr, fn, music=True, br=BR)
        res.append((fn, size, m / float(sr)))
    return res


def patch_js():
    """Thêm khoá music.battle.<hero>.i1..i4 vào data/audio.js (lặp lại được; gọi sau khi audio.py ghi lại tệp)."""
    txt = open(A.OUT_JS, encoding="utf-8").read()
    txt = re.sub(r'^  "music\.battle\.[a-z]+\.i[1-4]": .*\n', "", txt, flags=re.M)
    add = {}
    for hero, (bank, board, secs) in HEROES.items():
        for k in range(LAYERS):
            fn = os.path.join(A.OUT_AUDIO, "music", "battle.%s.i%d.ogg" % (hero, k + 1))
            if not os.path.exists(fn):
                continue
            base = re.search(r'^  "music\.battle\.%s": (\{.*\}),?$' % hero, txt, re.M)
            if not base:
                continue
            d = json.loads(base.group(1))
            d["src"] = ["audio/music/battle.%s.i%d.ogg" % (hero, k + 1)]
            d["layer"] = k + 1
            d["dur"] = round(os.path.getsize(fn) and _dur(fn), 2)
            add.setdefault(hero, []).append('  "music.battle.%s.i%d": %s,\n' % (hero, k + 1, json.dumps(d, ensure_ascii=False, separators=(",", ":"))))
    for hero, lines in add.items():
        m = re.search(r'^  "music\.battle\.%s": .*\n' % hero, txt, re.M)
        txt = txt[:m.end()] + "".join(lines) + txt[m.end():]
    with open(A.OUT_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)
    print("patch audio.js:", sum(len(v) for v in add.values()), "khoá lớp")


def _dur(fn):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fn], capture_output=True)
    return float(r.stdout.decode().strip())


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    heroes = sys.argv[2].split(",") if len(sys.argv) > 2 else list(HEROES)
    if cmd in ("render", "all"):
        for h in heroes:
            render(h)
    if cmd in ("encode", "all"):
        gain = json.load(open(A.META + r"\export_stats.json"))["gains"]["music"]
        tot = 0
        for h in heroes:
            for fn, size, dur in encode(h, gain):
                tot += size
            print("encode", h, round(dur, 1), "s", flush=True)
        print("tổng", round(tot / 1048576, 2), "MB")
    if cmd in ("patch", "encode", "all"):
        patch_js()
