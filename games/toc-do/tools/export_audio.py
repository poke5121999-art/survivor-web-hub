#!/usr/bin/env python3
"""Xuất tiếng Zing Speed (Wwise .bnk) -> games/toc-do/audio/*.mp3 + data/audio.js.
Chạy: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_audio.py [--inventory-only]
Bước: 1) đọc HIRC mọi bank, event -> wem  2) giải mã wem bằng vgmstream-cli
      3) chọn event cho cuộc đua (EXACT / SUBST) 4) mp3 + chuẩn hoá LUFS  5) data/audio.js
"""
import json, os, re, struct, subprocess, sys, collections, shutil

REF = os.environ.get('ZS_REF', os.path.expanduser('~/zingspeed-ref'))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # games/toc-do
BANKS = REF + '/raw/assets/IFS/SoundBanks'
WORK = REF + '/work/audio'
VGM = REF + '/bin/vgmstream-cli'
OUT_AUDIO = ROOT + '/audio'
OUT_JS = ROOT + '/data/audio.js'

# ---------------------------------------------------------------- HIRC
def parse_bank(path):
    b = open(path, 'rb').read(); p = 0; secs = {}
    while p + 8 <= len(b):
        t = b[p:p+4].decode('latin1'); s = struct.unpack('<I', b[p+4:p+8])[0]
        secs[t] = (p + 8, s); p += 8 + s
    didx = {}
    if 'DIDX' in secs:
        o, s = secs['DIDX']
        for i in range(s // 12):
            wid, off, sz = struct.unpack('<III', b[o+i*12:o+i*12+12]); didx[wid] = (off, sz)
    data = secs['DATA'][0] if 'DATA' in secs else 0
    objs = {}
    if 'HIRC' in secs:
        o, s = secs['HIRC']; n = struct.unpack('<I', b[o:o+4])[0]; q = o + 4
        for _ in range(n):
            t = b[q]; sz = struct.unpack('<I', b[q+1:q+5])[0]; body = b[q+5:q+5+sz]; q += 5 + sz
            objs[struct.unpack('<I', body[:4])[0]] = (t, body)
    return {'raw': b, 'didx': didx, 'data': data, 'objs': objs}

def fnv1(name):
    h = 2166136261
    for c in name.lower().encode():
        h = ((h * 16777619) & 0xFFFFFFFF) ^ c
    return h

HIER = {2, 5, 6, 7, 9, 10, 11, 12, 13}   # Sound, RanSeq, Switch, ActorMixer, Layer, MusicSeg/Track/Switch/RanSeq

class World:
    def __init__(self):
        self.banks = {}
        for f in sorted(os.listdir(BANKS)):
            if f.endswith('.bnk'): self.banks[f[:-4]] = parse_bank(BANKS + '/' + f)
        self.gobj = {}                                # id -> [bank,...] for hierarchy objects
        for bn, bk in self.banks.items():
            for i, (t, _) in bk['objs'].items():
                if t in HIER: self.gobj.setdefault(i, []).append(bn)
        self.children = {}                            # bank -> {parent: [child]}
        for bn, bk in self.banks.items():
            ch = self.children[bn] = {}
            for i, (t, body) in bk['objs'].items():
                if t not in HIER or t == 11: continue
                p = 18 if t == 2 else 4              # NodeBaseParams: fx(2+7n), attach(1), bus(4), parent(4)
                p += 2 + (1 + 7 * body[p + 1] if body[p + 1] else 0)
                ch.setdefault(struct.unpack('<I', body[p+5:p+9])[0], []).append(i)
        self.wem_bank = {}
        for bn, bk in self.banks.items():
            for w in bk['didx']: self.wem_bank.setdefault(w, bn)

    def sources(self, bank, oid):
        """Mọi (wemId, embedded) dưới object oid (Sound -> nguồn; container -> con theo DirectParentID)."""
        bn = bank if oid in self.banks[bank]['objs'] else (self.gobj.get(oid) or [None])[0]
        if bn is None: return []
        t, body = self.banks[bn]['objs'][oid]
        if t == 2:
            return [(struct.unpack('<I', body[9:13])[0], body[8] == 0)]
        out = []
        for c in self.children[bn].get(oid, ()):
            for s in self.sources(bn, c):
                if s not in out: out.append(s)
        return out

    def events(self):
        """(bank, eventId, [wem...]) cho mọi Event; wem = (id, embedded)."""
        res = []
        for bn, bk in self.banks.items():
            objs = bk['objs']
            for eid, (t, body) in objs.items():
                if t != 4: continue
                p = 4; n = body[p]; p += 1
                if n & 0x80: n = ((n & 0x7f) << 7) | body[p]; p += 1   # varint (v>=134)
                ws = []
                for k in range(n):
                    aid = struct.unpack('<I', body[p+4*k:p+4*k+4])[0]
                    a = objs.get(aid)
                    if not a or a[0] != 3: continue
                    atype = struct.unpack('<H', a[1][4:6])[0]
                    if atype >> 8 != 4: continue                       # chỉ Play
                    tgt = struct.unpack('<I', a[1][6:10])[0]
                    for s in self.sources(bn, tgt):
                        if s not in ws: ws.append(s)
                res.append((bn, eid, ws))
        return res

# ---------------------------------------------------------------- names
def load_names():
    info = json.load(open(REF + '/dump/wwise/AndroidEventsInfoVN'))['Infos']
    byid = {e['Id']: e for e in info}
    cand = set()
    d = REF + '/dump/wwise'
    for f in os.listdir(d):
        p = d + '/' + f
        if os.path.isfile(p) and os.path.getsize(p) < 30e6:
            try: txt = open(p, encoding='utf-8', errors='ignore').read()
            except Exception: continue
            cand.update(re.findall(r'\b(?:Play|Stop|Pause|Resume)_[A-Za-z0-9_]+', txt))
    for n in cand:
        h = fnv1(n)
        if h not in byid: byid[h] = {'Id': h, 'Name': n, 'WwiseObjectPath': '(config)', 'DurationType': '', 'DurationMin': 0, 'DurationMax': 0, 'Banks': []}
    return byid

# ---------------------------------------------------------------- wem -> wav
def wem_path(w, wid): return '%s/wem/%d.wem' % (WORK, wid)
def wav_path(wid): return '%s/wav/%d.wav' % (WORK, wid)

def extract_wem(w, wid):
    bn = w.wem_bank.get(wid)
    if bn is None: return None
    bk = w.banks[bn]; off, sz = bk['didx'][wid]
    p = wem_path(w, wid)
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'wb').write(bk['raw'][bk['data'] + off: bk['data'] + off + sz])
    return p

def decode_wem(w, wid):
    p = extract_wem(w, wid)
    if p is None: return None
    o = wav_path(wid)
    if not os.path.exists(o):
        os.makedirs(os.path.dirname(o), exist_ok=True)
        r = subprocess.run([VGM, '-o', o, p], capture_output=True)
        if r.returncode != 0 or not os.path.exists(o): return None
    return o

def wav_duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0

# ---------------------------------------------------------------- inventory
def build_inventory(w, names):
    rows = []
    for bn, eid, ws in w.events():
        e = names.get(eid)
        rows.append({'bank': bn, 'id': eid, 'name': e['Name'] if e else '#%d' % eid,
                     'path': e['WwiseObjectPath'] if e else '', 'wems': ws})
    return rows

# ---------------------------------------------------------------- loudness
TARGET = {'sfx': -16.0, 'voice': -14.0, 'music': -20.0, 'engine': -16.0, 'amb': -22.0}

def measure(path):
    """(LUFS tích hợp, đỉnh dBFS, cách đo). Clip < 0.4 s: ebur128 không đo được -> dùng mean_volume."""
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS', r.stderr)
    pk = re.search(r'Peak:\s*(-?[\d.]+|-inf) dBFS', r.stderr)
    peak = float(pk.group(1)) if pk and pk.group(1) != '-inf' else -90.0
    if m and float(m.group(1)) > -69:
        return float(m.group(1)), peak, 'ebur128'
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    mv = re.search(r'mean_volume:\s*(-?[\d.]+) dB', r.stderr)
    return (float(mv.group(1)) - 0.7 if mv else -70.0), peak, 'mean_volume'

def encode(src_wav, dst, bus, trim=None):
    music = bus == 'music'
    cmd = ['ffmpeg', '-y', '-v', 'error']
    if trim: cmd += ['-ss', str(trim[0]), '-t', str(trim[1])]
    cmd += ['-i', src_wav]
    if trim: cmd += ['-af', 'afade=t=out:st=%.3f:d=0.08' % max(0, trim[1] - 0.08)]
    cmd += ['-ac', '2' if music else '1', '-c:a', 'libmp3lame', '-b:a', '128k' if music else '96k', dst]
    subprocess.run(cmd, check=True)

# ---------------------------------------------------------------- bảng chọn tiếng cho cuộc đua
# (khoá TD, event nguồn, bus, loop, trim(start,dur)|None, chọn wem, ghi chú)
# Khoá trùng tên event gốc (CarConfig/BGMConfig) khi nguồn cùng tên -> exact; khác tên -> subst.
Q = 'longest'
CURATED = [
 # đếm lùi / còi
 ('Play_BGM_CountDown',        'Play_UI_ATM_countdown',                 'sfx',   False, None,        None, 'bíp đếm 3-2-1 (0.47 s), dùng 3 lần'),
 ('Play_BGM_CountDown_Final',  'Play_XH_Ready',                         'sfx',   False, (0, 0.6),    None, 'nhịp "1" cao hơn (chuông 1160 Hz thay cho 1000 Hz), như Play_taotai_countdown_final của InGameBase; main.js cần phát khi e.n === 1'),
 ('Play_BGM_Go',               'Play_XH_Go',                            'sfx',   False, (0, 2.0),    None, 'còi xuất phát: cắt 2 s đầu của jingle XH_Go'),
 # vạch đích, vòng
 ('Play_Race_Lap',             'Play_Mode_Dajiangsai_UI_Change_Prompt', 'sfx',   False, None,        None, 'báo qua vòng (không có giọng)'),
 ('Play_Race_FinalLap',        'Play_Mode_Spray_UI_Prompt',             'sfx',   False, None,        None, 'báo vòng cuối (không có giọng)'),
 ('Play_Race_Finish',          'Play_Super_end_appear',                 'sfx',   False, None,        None, 'về đích'),
 # tăng tốc
 ('Play_miniboost',            'Play_XH_ingame_flyinghorse_nitro_1',    'sfx',   False, None,        None, 'miniboost sau drift'),
 ('Play_supperboost',          'Play_Mode_RongLuTaoTai_SFX_Nitro',      'sfx',   False, (0, 3.5),    None, 'nitro/superboost: 3.5 s đầu của nitro chế độ Lò Luyện'),
 ('Play_jiasu',                'Play_Mode_RongLuTaoTai_SFX_BoostSurge', 'sfx',   False, (0, 2.5),    None, 'ô tăng tốc / start boost'),
 # va chạm, bay, hạ cánh, hồi sinh
 ('Play_Collision',            'Play_Super_Bigcar_crash',               'sfx',   False, (0, 1.4),    None, 'đâm tường'),
 ('Play_CollisionCar',         'Play_Super_Bigcar_ya',                  'sfx',   False, None,        None, 'xe chạm xe'),
 ('Play_Car_fly',              'Play_FYSZ_Ingame_MetalJump',            'sfx',   False, None,        None, 'bật nhảy / bay'),
 ('Play_Car_Land',             'Play_wzxg_dragon_land',                 'sfx',   False, None,        None, 'hạ cánh'),
 ('Play_Respawn',              'Play_Super_Shan',                       'sfx',   False, None,        None, 'hồi sinh / chớp'),
 # giao diện
 ('Play_UI_Click',             'Play_XT_UI_Click',                      'sfx',   False, None,        None, 'bấm'),
 ('Play_UI_Confirm',           'Play_Mode_PaiWeiSai_UI_Car_Confirm',    'sfx',   False, None,        None, 'xác nhận'),
 ('Play_UI_Back',              'Play_XT_UI_Switch_Tab',                 'sfx',   False, None,        None, 'quay lại / chuyển tab'),
 ('Play_UI_Select',            'Play_Mode_PaiWeiSai_UI_Car_Select',     'sfx',   False, None,        None, 'chọn xe / đường'),
 ('Play_UI_Win',               'Play_UI_ATM_victory',                   'sfx',   False, None,        None, 'kết quả thắng'),
 ('Play_UI_Lose',              'Play_Mode_RongLuTaoTai_SFX_Lose',       'sfx',   False, None,        None, 'kết quả thua'),
 ('Play_BGM_end',              'Play_Mode_Dajiangsai_UI_Champion',      'music', False, (0, 9.0),    Q,    'nhạc kết quả (9 s đầu bản Champion)'),
 # không khí đường đua
 ('Play_TroyCity_Amb_Cheer',   None,                                    'amb',   True,  None,        None, 'khán giả Troy City'),
 ('Play_TroyCity_Amb_CarPassby', None,                                  'amb',   False, None,        None, 'xe chạy ngang Troy City (4 biến thể)'),
 ('Play_TroyCity_Amb_TrainPassby', None,                                'amb',   False, None,        None, 'tàu chạy ngang Troy City'),
 ('Play_Amb_Crowd',            'Play_Rome_AMB_Cheers',                  'amb',   True,  None,        None, 'khán giả chung cho 11City/ChinaTown (bank của hai đường này không có trong APK)'),
 # nhạc
 ('Play_Music_Lobby',          'Play_Music_DaJiangSai_Relax',           'music', True,  None,        None, 'nhạc sảnh 62.6 s'),
 ('Play_QQfeiche_BGM',         'Play_Music_DaJiangSai_Glory',           'music', True,  None,        None, 'nhạc đua 58.8 s'),
 ('Play_Music_Race2',          'Play_Music_RongLuTaoTai_Theme',         'music', True,  None,        None, 'nhạc đua phụ 31 s (chế độ đua Lò Luyện)'),
 ('Play_Music_Menu2',          'Play_Music_BaiBianXiaoYing_General',    'music', True,  None,        Q,    'nhạc sảnh phụ 63.5 s'),
 ('Play_Login',                None,                                    'music', True,  None,        Q,    'nhạc đăng nhập 54.9 s'),
 ('Play_Music_TuJian_Bgm',     None,                                    'music', True,  None,        None, 'nhạc phòng trưng bày 33.9 s'),
]

# Cần cho cuộc đua nhưng không có ở bất kỳ bank nào trong APK; không tạo mục thay thế.
MISSING = [
 ('Play_CarStart', 'tiếng nổ máy'), ('Play_CarStop', 'tắt máy'),
 ('Play_Engine_loop', 'tiếng động cơ theo RPM (RTPC trong Default_Vehicle.bnk): tổng hợp bằng WebAudio'),
 ('Play_Tire_friction', 'tiếng lốp rít khi drift: không có thay thế'), ('Play_Car_dahua', 'drift start'),
 ('Play_DriftOrOverSteerEnd', 'hết drift'), ('Play_Engine_brake_light', 'phanh'), ('Play_Engine_brake_heavy', 'phanh gấp'),
 ('Play_Engine_reverse', 'lùi'), ('Play_BoostEnd', 'hết tăng tốc'), ('Play_Collision_lianxu', 'va chạm liên tiếp'),
 ('Play_VO_Countdown_3_2_1_Go', 'giọng đếm lùi: không bank nào trong APK có (đã dò 110 bank, 1.266 event, 8.383 tên trong AndroidEventsInfoVN; các event giọng 321/readygo/countdown/NewRecord nằm ở InGameBase, Lobby, XXQ, GlobalStructure đều không có trong APK). Bank có mặt chỉ có chuông/jingle: UI_ATM_countdown, Spray_UI_Countdown, XH_Ready, XH_Go'),
 ('Play_VO_Lap_FinalLap_Finish', 'giọng báo vòng / về đích'), ('Play_VO_Position', 'giọng báo thứ hạng'),
 ('Play_TireOn*', 'tiếng lốp theo mặt đường'),
 ('Play_ElevenCity_*', 'bank SaiDao_ElevenCity.bnk (11City) không có trong APK'),
]

def find_event(rows, name):
    for r in rows:
        if r['name'] == name and r['wems']: return r
    return None

def fmt(v): return ('%g' % round(v, 3))

def run_export(w, rows, names):
    for d in (OUT_AUDIO, os.path.dirname(OUT_JS), WORK + '/tmp'): os.makedirs(d, exist_ok=True)
    for f in os.listdir(OUT_AUDIO):
        if f.endswith('.mp3'): os.remove(OUT_AUDIO + '/' + f)
    entries = []; report = []
    for key, src, bus, loop, trim, pick, note in CURATED:
        ev = find_event(rows, src or key)
        if not ev: print('THIẾU', key, src); continue
        wems = [i for i, e in ev['wems'] if e]
        if pick == 'longest' and len(wems) > 1:
            wems = [max(wems, key=lambda i: wav_duration(decode_wem(w, i)))]
        files = []; lufs_list = []; vols = []; durs = []
        for n, wid in enumerate(wems):
            wav = decode_wem(w, wid)
            name = '%s%s.mp3' % (key, '' if len(wems) == 1 else '_%d' % n)
            encode(wav, OUT_AUDIO + '/' + name, bus, trim)
            lu, pk, how = measure(OUT_AUDIO + '/' + name)
            tgt = TARGET[bus]
            vol = min(10 ** ((tgt - lu) / 20), 10 ** ((-1.0 - pk) / 20), 10.0)
            files.append('audio/' + name); lufs_list.append(lu); vols.append(vol); durs.append(round(wav_duration(OUT_AUDIO + '/' + name), 2))
        # một vol cho cả nhóm biến thể: trung bình theo dB để biến thể cùng mức nghe
        vdb = sum(20 * __import__('math').log10(v) for v in vols) / len(vols)
        vol = 10 ** (vdb / 20)
        entries.append({'key': key, 'files': files, 'loop': loop, 'vol': round(vol, 3), 'bus': bus,
                        'subst': src if src and src != key else None, 'dur': durs, 'lufs': [round(x, 1) for x in lufs_list],
                        'after': round(sum(lufs_list) / len(lufs_list) + vdb, 1), 'src_bank': ev['bank'], 'note': note, 'wems': wems})
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// Sinh bởi tools/export_audio.py. vol = hệ số nhân để đạt LUFS mục tiêu của bus (sfx -16, voice -14, music -20, amb -22).\n')
        f.write('TD.AUDIO = TD.AUDIO || {};\n')
        for e in entries:
            o = '{ files: %s, loop: %s, vol: %s, bus: %s%s, dur: %s }' % (
                json.dumps(e['files']), 'true' if e['loop'] else 'false', fmt(e['vol']), json.dumps(e['bus']),
                (', subst: ' + json.dumps(e['subst'])) if e['subst'] else '', json.dumps(e['dur']))
            f.write('TD.AUDIO[%s] = %s;\n' % (json.dumps(e['key']), o))
        f.write('// Không có ở bất kỳ bank nào trong APK (xem README / inventory.tsv).\n')
        f.write('TD.AUDIO_MISSING = %s;\n' % json.dumps([{'event': a, 'note': b} for a, b in MISSING], ensure_ascii=False))
    return entries

def write_inventory(w, rows, entries=()):
    os.makedirs(WORK, exist_ok=True)
    wids = sorted({i for r in rows for i, e in r['wems'] if e})
    from concurrent.futures import ThreadPoolExecutor
    def one(i):
        p = decode_wem(w, i)
        if not p: return i, (-1, -90, '', 0)
        lu, pk, how = measure(p); return i, (round(wav_duration(p), 2), round(lu, 1), how, round(pk, 1))
    with ThreadPoolExecutor(8) as ex: info = dict(ex.map(one, wids))
    used = {}
    for e in entries:
        for wid in e['wems']: used.setdefault(wid, []).append(e['key'])
    with open(WORK + '/inventory.tsv', 'w', encoding='utf-8') as f:
        f.write('bank\tevent\twwise_path\twem_ids\tdurations_s\tlufs_per_wem\tpeak_dbfs\tused_as\n')
        for r in sorted(rows, key=lambda r: (r['bank'], r['name'])):
            emb = [i for i, e in r['wems'] if e]
            ua = sorted({k for i in emb for k in used.get(i, [])})
            f.write('\t'.join([r['bank'], r['name'], r['path'], ','.join(map(str, emb)),
                               ','.join(str(info[i][0]) for i in emb), ','.join(str(info[i][1]) for i in emb),
                               ','.join(str(info[i][3]) for i in emb), ','.join(ua)]) + '\n')
    return info

def check():
    """Mọi tệp trong data/audio.js phải tồn tại và ffprobe đọc được thời lượng > 0."""
    txt = open(OUT_JS, encoding='utf-8').read(); bad = 0
    files = sorted(set(re.findall(r'"(audio/[^"]+)"', txt)))
    for f in files:
        p = ROOT + '/' + f
        d = wav_duration(p) if os.path.exists(p) else 0
        if d <= 0: print('LỖI', f, 'thiếu hoặc không giải mã được'); bad += 1
    print('%d tệp, %d lỗi' % (len(files), bad)); return bad

if __name__ == '__main__':
    if '--check' in sys.argv: sys.exit(1 if check() else 0)
    w = World(); names = load_names(); rows = build_inventory(w, names)
    print('events', len(rows), 'with sources', sum(1 for r in rows if r['wems']))
    entries = [] if '--inventory-only' in sys.argv else run_export(w, rows, names)
    write_inventory(w, rows, entries)
    tot = sum(os.path.getsize(OUT_AUDIO + '/' + f) for f in os.listdir(OUT_AUDIO) if f.endswith('.mp3')) if os.path.isdir(OUT_AUDIO) else 0
    print('mp3 total %.2f MB' % (tot / 1e6))
    for e in entries:
        print('%-30s %-6s vol=%-6s lufs=%s->%s %s%s' % (e['key'], e['bus'], e['vol'], e['lufs'], e['after'], e['dur'], ' subst=' + e['subst'] if e['subst'] else ''))
