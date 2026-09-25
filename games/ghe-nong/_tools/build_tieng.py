"""build_tieng.py — dựng tiếng và nhạc nền cho Ghế Nóng từ Teamfight Manager 2 và Uma Musume.

Nguồn:
  TFM2  bundle.game_data (đọc thẳng, như build_tfm.py). Tiếng trong trận đi qua tệp
        `<tên>.sound_info` = JSON {plays: [{delay, clip, volume}]}, clip là `sound/sfx/<clip>.mp3`.
  Uma   D:/uma-ref (bóc bằng rip_uma_audio.py, xem RESEARCH §12): tệp .wav đã giải từ CRI ACB/AWB.

Mỗi clip được chuẩn hoá đỉnh về −1 dBFS rồi mã lại mp3 mono (tiếng) hoặc stereo (nhạc), nên
âm lượng trong bảng là âm lượng THẬT so với nhau, không phụ thuộc bản gốc to hay nhỏ.

Ra: am/*.mp3 + am/bang.js (window.AM_BANG = {tieng: {tên: [[tệp, trễ, âm]]}, nhac: {tên: tệp}}).
Chạy: python _tools/build_tieng.py
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RA = os.path.join(GOC, 'am')
TFM = os.environ.get('TFM2', r"D:/Teamfight.Manager.2.v0.6.0_LinkNeverDie.Com/bundle.game_data")
UMA = os.environ.get('UMAREF', r"D:/uma-ref")
SFX = 'asset/base/sound/sfx/'
BGM = 'asset/base/sound/bgm/'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tfm import doc_bundle  # noqa: E402
from build_tfm_tuong import doc_danh_sach_id  # noqa: E402 — đọc thẳng 68 id từ js/data-tfm.js

# tướng của game → tướng TFM2 (giống build_tfm.TUONG) và tên sound_info cho chiêu / chiêu cuối
TUONG_TIENG = {
    'kiemsi': ('swordman', 'skill', 'ult'),
    'cuongchien': ('berserker', 'skill1', 'ult_attack'),
    'phaco': ('hammerer', 'skill', 'ult'),
    'thanhkiem': ('magic_knight', 'skill1', 'ult'),
    'kynhan': ('cavalry_knight', 'skill1', 'ult'),
    'gaosu': ('werewolf', 'skill1', 'skill2'),
    'bongma': ('ghost', 'skill1', 'skill1_kill'),
    'thoisan': ('hunter', 'bush_skill1', 'ult'),
    'phaposu': ('pyromancer', 'skill', 'ult'),
    'phapset': ('lightning_mage', 'skill1', 'ult_loop'),
    'bongdem': ('shadowmancer', 'skill1', 'ult'),
    'tuchien': ('dual_blader', 'skill', 'ult'),
    'xathu': ('archer', 'skill', 'ult_pre'),
    'sungtruong': ('gunner', 'skill', 'ult'),
    'nodoc': ('poison_dart_hunter', 'skill1', 'ult'),
    'bomxich': ('bomber', 'skill1', 'ult'),
    'hiepsi': ('shield_bearer', 'skill', 'ult'),
    'thaythuoc': ('priest', 'skill', 'ult'),
    'khienhon': ('barrier_magician', 'skill1', 'ult'),
    'nhacsi': ('bard', 'skill1', 'ult'),
}

# tiếng trong trận / cấm chọn không gắn với tướng: tên → (clip TFM2, âm)
TFM_LE = {
    'tran.tru': ('tower_destroy_resource', 0.9),
    'tran.loi': ('nexus_destroy_resource', 1.0),
    'tran.quaiLon': ('morgard_death_resource', 0.8),
    'tran.lenCap': ('level up_resource', 0.35),
    'tran.hoiSinh': ('recall_spawn_resource', 0.4),
    'tran.ha2': ('dual_takedown', 0.8),
    'tran.ha3': ('triple_takedown', 0.8),
    'tran.ha4': ('devastation', 0.8),
    'tran.ha5': ('annihilation', 0.9),
    'tran.hoReo': ('Crowd Cheer SFX', 0.45),
    'tran.voTay': ('Applause', 0.5),
    'draft.cam': ('ban_sfx', 0.7),
    'draft.chon': ('pick_sfx', 0.7),
    'draft.dem': ('countdown_normal', 0.5),
    'draft.demGap': ('countdown_highlight', 0.6),
}

# nhạc nền TFM2: tên → tệp trong sound/bgm
TFM_NHAC = {
    'draft': 'banpick.wav',
    'tran': 'match.wav',
    'tran2': 'match3.wav',
    'thang': 'match_result_win.wav',
    'thua': 'match_result_lose.wav',
}

# Uma: tên → (đường dẫn dưới D:/uma-ref, âm). Chọn theo TÊN CUE trong bank; chưa nghe bằng tai.
C = 'sfx/snd_sfx_common/snd_sfx_common_%s.wav'
T = 'sfx/snd_sfx_training_001/snd_sfx_training_001_%s.wav'
H = 'sfx/snd_sfx_gacha_000/snd_sfx_gacha_000_%s.wav'
UMA_LE = {
    'cham': (C % '06_snd_sfx_UI_window_s_001', 0.5),
    'chon': (C % '05_snd_sfx_UI_window_03', 0.55),
    'huy': (C % '07_snd_sfx_UI_window_whoosh_01', 0.45),
    'tin': (C % '01_snd_sfx_mes_receive', 0.5),
    'tangHang': (C % '08_snd_sfx_sys_teamrank_appear', 0.6),
    'mangTa': (C % '09_snd_sfx_sys_teampoint_rankup_02', 0.55),
    'mang': (T % '09_snd_sfx_training_lognega_01', 0.5),
    'tap': (T % '11_snd_sfx_training_logposi_01', 0.6),
    'tapTot': (T % '04_snd_sfx_training_logposi_04', 0.7),
    'hong': (T % '07_snd_sfx_training_failure_01', 0.7),
    'theLuc': (T % '08_snd_sfx_tra_log_physidown', 0.6),
    'camhung': (T % '05_snd_sfx_tra_log_succession_start', 0.7),
    'cauvong': (H % '28_snd_sfx_gacha_bookmark_rainbow', 0.7),
    'quay': (H % '20_snd_sfx_gacha_start', 0.7),
    'quaySSR': (H % '17_snd_sfx_gacha_run_rainbow', 0.8),
    'lat': (H % '16_snd_sfx_gacha_pop01', 0.6),
    'latVang': (H % '27_snd_sfx_gacha_bookmark_gold', 0.7),
    'lenCap': ('sfx/snd_bgm_jingle_ui/snd_bgm_jingle_ui_01_snd_bgm_jingle_UI_awake_levelup.wav', 0.6),
    'batdau': ('sfx/snd_bgm_jingle_ui/snd_bgm_jingle_ui_02_snd_bgm_jingle_UI_jgkh_01.wav', 0.6),
    'mucTieu': ('sfx/snd_bgm_jingle_training/snd_bgm_jingle_training_01_snd_bgm_jingle_tra_target_clear.wav', 0.7),
    'thang': ('sfx/snd_sfx_race_result_1007/snd_sfx_race_result_1007_01_snd_sfx_race_result_1007.wav', 0.75),
    'thua': (T % '01_snd_sfx_training_lognega_02', 0.6),
}
UMA_NHAC = {
    'clb': 'bgm/snd_bgm_gm001_01_snd_bgm_GM001.wav',
    'ca': 'bgm/snd_bgm_gm002.wav',
    'gacha': 'bgm/snd_bgm_gm020a_01_snd_bgm_GM020A.wav',
}


def ffmpeg(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + list(a), check=True)


def dinh_db(duong):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', duong, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    m = re.search(r'max_volume: (-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else 0.0


def ma_lai(vao, ra, nhac=False):
    tang = -1.0 - dinh_db(vao)
    if nhac:
        ffmpeg('-i', vao, '-af', 'volume=%.2fdB' % tang, '-ac', '2', '-ar', '44100', '-b:a', '80k', ra)
    else:
        # cắt khoảng lặng hai đầu: tiếng đánh thường lặp cả chục lần một giây, đuôi lặng dài
        # thì chiếm chỗ trong giới hạn số tiếng cùng kêu mà không ai nghe thấy gì
        cat = ('silenceremove=start_periods=1:start_threshold=-60dB,areverse,'
               'silenceremove=start_periods=1:start_threshold=-60dB,areverse,')
        ffmpeg('-i', vao, '-af', cat + 'volume=%.2fdB' % tang, '-ac', '1', '-ar', '44100', '-b:a', '64k', ra)


def main():
    muc = doc_bundle(TFM)

    def byte(ten):
        o, c = muc[ten]
        with open(TFM, 'rb') as f:
            f.seek(o)
            return f.read(c)

    tam = tempfile.mkdtemp()
    os.makedirs(RA, exist_ok=True)
    for x in os.listdir(RA):
        os.remove(os.path.join(RA, x))
    da_ma = {}

    def clip_tfm(clip):
        """mã một clip TFM2 ra am/t_<clip>.mp3, trả về đường dẫn tương đối"""
        if clip in da_ma:
            return da_ma[clip]
        for duoi in ('mp3', 'wav'):
            if SFX + clip + '.' + duoi in muc:
                vao = os.path.join(tam, 'x.' + duoi)
                open(vao, 'wb').write(byte(SFX + clip + '.' + duoi))
                break
        else:
            raise SystemExit('thiếu clip TFM2: ' + clip)
        ten = 't_' + re.sub(r'[^a-z0-9]+', '_', clip.lower()).strip('_') + '.mp3'
        ma_lai(vao, os.path.join(RA, ten))
        da_ma[clip] = 'am/' + ten
        return da_ma[clip]

    def theo_info(ten_info, am):
        k = SFX + ten_info + '.sound_info'
        if k not in muc:
            return None
        plays = json.loads(byte(k))['plays']
        if not plays:
            return None
        to_nhat = max(p['volume'] for p in plays) or 1
        return [[clip_tfm(p['clip']), round(p['delay'], 3), round(am * p['volume'] / to_nhat, 2)] for p in plays]

    tieng = {}
    for id_, (tfm, chieu, cuoi) in TUONG_TIENG.items():
        for loai, info, am in (('danh', 'attack', 0.35), ('chieu', chieu, 0.7), ('cuoi', cuoi, 0.9)):
            ds = theo_info('%s_%s' % (tfm, info), am)
            if ds is None:
                raise SystemExit('thiếu %s_%s.sound_info' % (tfm, info))
            tieng['tran.%s.%s' % (id_, loai)] = ds

    # 68 tướng TFM2 (RESEARCH.md §15): KHÔNG tự đặt tên hành động như TUONG_TIENG ở trên —
    # dò TẤT CẢ tệp `<id>_*.sound_info` của mỗi id, giữ nguyên tên hành động TFM2 đặt
    # (attack, skill, skill2, ult, ...), tên tiếng: tran.<idTfm>.<hành động>.
    si_all = sorted(k[len(SFX):-len('.sound_info')] for k in muc
                     if k.startswith(SFX) and k.endswith('.sound_info'))
    thieu_tieng = []
    for id_ in doc_danh_sach_id():
        hanh_dong = sorted(a for a in si_all if a == id_ or a.startswith(id_ + '_'))
        if not hanh_dong:
            thieu_tieng.append(id_)   # tướng mod chưa có tiếng trong bản TFM2 này (báo, không dừng)
            continue
        for a in hanh_dong:
            hd = a[len(id_) + 1:] if a != id_ else 'attack'
            am = 0.9 if 'ult' in hd else (0.35 if hd == 'attack' else 0.7)
            ds = theo_info(a, am)
            if ds is not None:
                tieng['tran.%s.%s' % (id_, hd)] = ds
    if thieu_tieng:
        print('[BÁO] tướng thiếu tiếng trong bundle TFM2:', ', '.join(thieu_tieng))

    for ten, (clip, am) in TFM_LE.items():
        tieng[ten] = [[clip_tfm(clip), 0, am]]

    nhac = {}
    for ten, tep in TFM_NHAC.items():
        vao = os.path.join(tam, 'n.' + tep.rsplit('.', 1)[1])
        open(vao, 'wb').write(byte(BGM + tep))
        ra = 'n_' + ten + '.mp3'
        ma_lai(vao, os.path.join(RA, ra), nhac=True)
        nhac[ten] = 'am/' + ra

    for ten, (duong, am) in UMA_LE.items():
        ra = 'u_' + re.sub(r'[^a-z0-9]+', '_', ten.lower()) + '.mp3'
        ma_lai(os.path.join(UMA, duong), os.path.join(RA, ra))
        tieng[ten] = [['am/' + ra, 0, am]]
    for ten, duong in UMA_NHAC.items():
        ra = 'n_' + ten + '.mp3'
        ma_lai(os.path.join(UMA, duong), os.path.join(RA, ra), nhac=True)
        nhac[ten] = 'am/' + ra

    js = ('/* sinh tự động bởi _tools/build_tieng.py — đừng sửa tay. Nguồn: Teamfight Manager 2, Uma Musume. */\n'
          'window.AM_BANG = ' + json.dumps({'tieng': tieng, 'nhac': nhac}, ensure_ascii=False, indent=0) + ';\n')
    with io.open(os.path.join(RA, 'bang.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    tong = sum(os.path.getsize(os.path.join(RA, x)) for x in os.listdir(RA))
    print('tiếng', len(tieng), 'nhạc', len(nhac), 'tệp', len(os.listdir(RA)), 'tổng', tong // 1024, 'KB')


if __name__ == '__main__':
    main()
