# Âm thanh Soul Knight 8.6 (tiếng + nhạc thật)

Mọi tiếng của bản web là mẫu thật bóc từ gói AssetBundle 8.6.0 (`D:\sk86-ref`, ngoài git). Không còn tiếng tổng hợp.

## Dựng lại

```
PYTHONIOENCODING=utf-8 python games/soulknight/tools/audio/build_audio.py all   # = export + scan + encode (~3 phút)
PYTHONIOENCODING=utf-8 python games/soulknight/tools/audio/build_map.py         # sinh data/sk-audio.js
```

- `export`: UnityPy đọc mọi `AudioClip` của các gói cần dùng (`sound_effect.ab` 472, `weapon.ab` 153, `hero.ab` 36,
  `escape_audio.ab` 11, `common/bullet/levelcommon/levelobjects/ui/...`, thư mục `bgm/`, `boss/`, `level/`, `pet/`,
  `mount/`), FSB5 -> WAV, gộp trùng theo (tên, hash). Khác nội dung cùng tên thì thêm hậu tố `@<gói>`.
  Tổng 1042 clip duy nhất. Bỏ `skin/` (1362 clip skin hero), `aram/`, `pvp/`, `tutorial*`.
- `scan`: `scan_refs.py` duyệt mọi `MonoBehaviour`/`AudioSource` trong các gói đó, lấy mọi PPtr trỏ tới AudioClip
  (kể cả sang gói khác, ví dụ `Gun001.audio_clip` của `weapon.ab` trỏ sang `sound_effect.ab`, giải qua bảng CAB)
  và tên prefab gốc (đi ngược `Transform.m_Father`). Ra `refs.json` (~1500 tham chiếu).
- `encode`: ffmpeg -> **.m4a (AAC-LC)**. Chrome, Edge, Firefox, Safari (kể cả iOS) đều phát; Ogg Vorbis thì Safari không
  chắc nên không dùng. Tiếng: mono 40 kbps 32 kHz. Nhạc: stereo 56 kbps 44,1 kHz. Bỏ tiếng dài hơn 6 giây
  (long_idle, giọng, nhạc chủ đề hero) và mọi nhạc ngoài `KEEP_MUSIC` (11 bài). Kết quả: 939 file, 14,2 MB
  (nhạc 6,5 MB, tiếng 7,6 MB) trong `art/audio/`. Muốn thêm nhạc thì sửa `KEEP_MUSIC` rồi chạy lại `encode` + `build_map`.
- Trung gian ở `D:\sk86-ref\work\audio\` (wav, refs.json, chỉ mục). Cần ffmpeg (tự tìm trong PATH hoặc WinGet).

## Dạng dữ liệu `window.SK_AUDIO` (data/sk-audio.js, sinh tự động)

```
clips:      { <tên clip>: { file: "x.m4a", dur: giây, music?: 1 } }   // file nằm ở art/audio/, nhớ encodeURIComponent
byPrefab:   { <prefab gốc>: { fire?, fireAll?, hit?, dead?, skill?, explode?, portal?, open?, ui?, anim?, <trường thô>... } }
            // giá trị là tên clip hoặc mảng tên clip. Khoá: weapon_005, e_orc01, ex_orc01, boss07, c00 (hero), bullet_*...
byWeapon:   { <slug wiki, vd ak_47>: { prefab: "weapon_NNN", fire, ... } }   // 203/268 vũ khí wiki
byKind:     { gun|staff|melee|bow|launcher|laser: clip }                      // dự phòng theo loại vũ khí
byHero:     { <thư mục skin hero: knight, ranger...>: { prefab: "cNN", hit, skill, guess?: 1 } }   // 14/42 hero
events:     { coin, pickup, roomLock, roomClear, portal, uiClick, uiStart, playerHurt, enemyHit, ... : clip }
confidence: { <sự kiện>: "do" | "guess" }
music:      { lobby, boss: {"1","2","3"}, theme: {forest,castle,volcano}, season: {base, expedition...}, byBossPrefab }
```

Tra tiếng của một prefab mới (bullet, boss, hero): `SK_AUDIO.byPrefab['<tên prefab gốc>']`. Nếu trống, prefab đó không
có AudioClip trong gói đã quét (tiếng gọi bằng mã, hoặc clip ở gói `skin/` chưa bóc).

## Cách ghép (đo, không đoán)

Nhãn: [ĐO] = đọc thẳng từ prefab/config 8.6; [ƯỚC LƯỢNG] = đoán theo tên clip hoặc ngữ nghĩa.

| Sự kiện game | Clip | Nhãn |
|---|---|---|
| Tiếng bắn vũ khí | `MonoBehaviour.audio_clip` (Gun001..., GunInit*, ...) của prefab `weapon_NNN`; cầu nối wiki -> prefab qua tên tiếng Anh trong `localization_en_vi.json` (`weapon/weapon_176` = "Agitated Trunk") | [ĐO] cho 203/268 vũ khí |
| Vũ khí còn lại (65: tên khác giữa wiki và game, hoặc búa/gậy dùng `ExplodeHammer`) | `byKind[loại]` = clip phổ biến nhất của loại đó trong 203 vũ khí đã đo | [ƯỚC LƯỢNG] |
| Quái chết | `EnemyAI*.clip_dead` của prefab `e_*`/`ex_*` (288/296 quái của web) | [ĐO] |
| Quái bắn | `EGun*.audio_clip` (228/296) | [ĐO] |
| Quái bắn/chết khi thiếu | `fx_shoot_e1` (clip phổ biến nhất của `EGun001`), `fx_dead` | [ĐO tần suất] |
| Hero trúng đòn | `C0xController.clip_hit` (fx_hit_p1, fx_hit_p5...) | [ĐO] cho 14 hero khớp được theo (máu, năng lượng, crit) giữa wiki và `characters.csv`; Knight = c00 là [ƯỚC LƯỢNG] (trùng thông số với c19) |
| Kỹ năng hero | `clip_skill` của controller hero (vd Knight `fx_skill_c1`) | [ĐO] trường, [ƯỚC LƯỢNG] hero nào ứng cNN |
| Cổng qua ải | `RGTransferGate.audioClip` = `fx_transform` | [ĐO] |
| Vàng / nhặt / khoá phòng / nút bấm / hồi chiêu / lỗi | `RGMusicManager.effect_list`: `fx_coin, fx_door, fx_show_up, fx_btn1, fx_pickup, fx_message2, fx_cd_ready, fx_error, fx_transform` | [ĐO] danh sách; thứ tự -> nghĩa là [ƯỚC LƯỢNG] |
| Dọn phòng (`fx_show_up`), bình máu (`fx_healthpot`), năng lượng (`fx_energy`), đập vật cản (`fx_box_destroy`), trúng đòn quái (`fx_hit`, chí mạng `fx_metal_hit01`), thắng/thua (`fx_applause`/`fx_fail`) | chọn theo tên clip | [ƯỚC LƯỢNG] |
| Rương pin | `ItemChestBattery.activate_clip` = `fx_chestbattery_open` | [ĐO] |
| Trùm (`byPrefab.boss*`) | `boss_clip[]`, `angry_clip`, `clip_dead`... | [ĐO] (chưa gắn vào sự kiện web: việc của agent trùm) |
| Nhạc ải thường | `map_levels.BgmClip`: map_A_Forest `bgm_1Low`, map_A_Castle `bgm_4Low`, map_B_Volcano `bgm_6Low`; các theme khác có trong `music.theme` khi bài đó nằm trong `KEEP_MUSIC` | [ĐO] |
| Nhạc phòng trùm | `enemies.BossBgm`: chương 1 `bgm_1High`, 2 `bgm_2High`, 3 `bgm_3High` (`music.byBossPrefab` có từng trùm) | [ĐO] |
| Nhạc sảnh | `bgm_room` (clip trong common.ab, không có tham chiếu nào trỏ tới) | [ƯỚC LƯỢNG] |
| Nhạc mùa giải | căn cứ `EscapeModeConfig.baseBgm` = `bgm_multi_room_skin_0`; thám hiểm `bgm_esc_Scene1/4/5` | [ĐO] căn cứ, [ƯỚC LƯỢNG] cảnh nào ứng bài nào |

Ghi chú: tiếng trúng đòn chung của game gốc không nằm trong prefab nào quét được (gọi bằng mã hoặc trong
`libil2cpp`); chỉ đạn đặc biệt có `hit_clip` riêng (byPrefab của bullet). Có ~830 PPtr ngoài gói chưa nạp (chủ yếu
không phải AudioClip); nếu một hero/vũ khí trông thiếu tiếng, kiểm tra clip đó có ở gói `skin/` không.

## Phát trong game (`js/sfx.js`)

- Web Audio, mẫu giải mã sẵn, nạp lười (fetch + decodeAudioData). Sau cử chỉ đầu tiên nạp trước clip của `events`
  và `byKind`; clip vũ khí đang cầm/quái đang có/hero được nạp trước theo nhịp 4 lần/giây. Lần đầu chưa nạp xong thì
  bỏ qua tiếng đó (không chặn game).
- Giới hạn đa âm: mỗi clip 1-3 nguồn cùng lúc, khoảng cách tối thiểu 30-300 ms, toàn cục 28 nguồn; tiếng bắn/trúng
  đổi tốc độ phát ngẫu nhiên vài % để súng nhanh không bị chồng pha.
- Nhạc: thăm dò trạng thái game 4 lần/giây (sảnh / ải theo theme / phòng trùm đang khoá / mùa giải: căn cứ hay thám
  hiểm), chuyển bài mờ dần 0,9 giây, lặp cả bài, bộ đệm nhạc cũ được bỏ.
- Phím M và nút `#sk-mute` bật/tắt, nhớ ở `localStorage['sk-muted']`; tắt là dừng mọi nguồn + nhạc ngay.
- Mở từ `file://` (fetch bị chặn) hoặc thiếu `SK_AUDIO`: im lặng, không lỗi (`SK.sfx.mode` = `file` / `no-data`).
- Cần trong `index.html` (trước `js/sfx.js`): `<script src="data/sk-audio.js?v=..."></script>`.
- Kiểm thử: `node test/soulknight-sfx.js` (đếm nguồn đã start theo tên clip cho từng sự kiện, đổi nhạc khi vào phòng trùm,
  giới hạn đa âm, tắt tiếng, file://). Chạy với Chrome thật; Chromium của Playwright cũng giải mã được AAC.
