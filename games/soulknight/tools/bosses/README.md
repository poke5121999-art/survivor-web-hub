# bosses: trùm chế độ thường (1-5, 2-5, 3-5) dựng từ Soul Knight 8.6

`build_bosses86.py` đọc bundle trùm của bản 8.6.0 (`D:\sk86-ref`, ngoài git) qua `skrip.Rip` rồi sinh hai tệp:

- `data/sk-bosses86.js` (`window.SK_BOSSES86`, ~420 KB): danh sách trùm theo theme, rig + Animator của từng prefab
  trùm, MonoBehaviour của trùm và của mọi đạn/vật nó tham chiếu (đệ quy), khung giới thiệu `*_info`, bảng khung trùng.
- `tools/extra/bosses.json`: danh sách bundle và regex sprite cho lever (`tools/build_sk.py`) cắt vào atlas.

`js/bosses.js` chỉ đọc hai thứ này. Nó không vẽ tay trùm hay đạn.

Nhãn dùng trong chú thích mã: **[ĐO]** đọc từ dữ liệu thật (có trường), **[WIKI]** theo wiki, **[ƯỚC LƯỢNG]** tự đặt.

## Chạy lại

```sh
cd games/soulknight/tools/bosses
export PYTHONIOENCODING=utf-8
C:/Users/tamph/.pyenv/pyenv-win/versions/3.8.10/python.exe build_bosses86.py   # ~2 phút, log ở D:\sk86-ref\work\bosses\build.log
cd ../../../.. && python games/soulknight/tools/build_sk.py                      # ~4 phút, cắt lại atlas
node games/soulknight/tools/check_keys.js                                      # phải ra "OK"
```

Cần đã chạy `tools/config86` (dùng `decoded/config/enemies.json`, `decoded/bosses.json`, `decoded/localization_en_vi.json`).

## Danh sách trùm [ĐO config/enemies.json]

Trùm có `IsBoss`, `LevelKey` theo theme, `Path` bắt đầu bằng `Level/`, bỏ biến thể và prefab con:

| theme | trùm |
|---|---|
| forest (1-5) | boss07 Hoa Ma, boss08 Thầy Tế Goblin, boss14 Người Cây Giáng Sinh, boss19 Thỏ Trứng Màu, boss25 Thầy Tế (ma ám) |
| castle (2-5) | boss01 Kỵ Sĩ Lớn (+ biến thể boss01_2), boss02 Phù Thủy Lớn, boss20 Slime Lớn |
| volcano (3-5) | boss11 Sâu Cát Núi Lửa, boss12_parent (boss12_1 + boss12_2, cặp rồng), boss18 Anubis |

- [ĐO] Biến thể (`SubspeciesBoss`) ra với tỉ lệ 30%: `BossCreator.GetSubspeciesBossPrefab` so `RGRandom.Range(0,100) < 0x1e`.
- [ƯỚC LƯỢNG] Chọn đều trong danh sách; trọng số thật chưa tìm thấy.
- [ĐO] Máu = `enemies.Hp × 1.2` (khớp wiki 480/600/720/960).

## Dữ liệu sinh ra

- `bosses[pid].rig`: `nodes` (tên, cha, T/R/S, sprite, sortingOrder, collider, `mbs` của nút) và `anims`
  (mỗi Animator: layer → `states[tên] = {clip, len, loop, next, spd, ev, cv}`). Đường cong `cv` giữ nguyên đoạn
  đa thức của Unity: `[t, c0, c1, c2, c3]` tính `((c0·d + c1)·d + c2)·d + c3`, `[t, v]` là hằng.
- `bullets[tên]`: rig + `mbs` (Bullet01/02/04/06, RGSBullet01, RGBTDivision, RGBTEnergy, DelayExplode...).
- `info[pid]`: khung giới thiệu (neo, kích thước, pivot theo canvas 1280×720 [ĐO CanvasScaler]).
- `alias`: lever gộp các sprite trùng điểm ảnh + điểm neo làm một khung. Mã chạy tra tên còn lại qua bảng này.

## Bẫy đã gặp

- **Sprite trỏ từ MonoBehaviour.** `BossAI07.angry_body` là sprite không nằm trên nút nào của rig. Nếu chỉ gom
  sprite của rig thì atlas thiếu `boss07_13` và `check_keys.js` báo MISSING. Hiện tại, khi đọc MB của prefab trùm,
  mọi con trỏ `Sprite` đều được đưa vào atlas (cờ `MB_SPRITES`).
- **Clip lặp vẫn có exit time.** `boss25_atk*` và `boss14_atk6` có `loop: 1` và `next`. Unity vẫn chuyển state
  sau một vòng, nên `rigTick` không được chặn chuyển state khi clip lặp. Nếu chặn, Thầy Tế (ma ám) đứng hình ở đòn đầu.
- **Clip không có End\* và không có exit time.** Ví dụ `boss14 stand_up`. `brain` coi hết clip là hết đòn.
- **Vòng lửa `Fire` trong `sk-vfx.js` thiếu blend cộng.** Sprite `warlock_0_skill_0_effect_3` có nền đen nên vẽ
  thường thì hiện thành ô đen. `bosses.js` chỉ sửa cờ trên bản của mình (hàm `additive`). Cách sửa gốc thuộc về
  bộ sinh VFX.
- **Controller dùng chung.** Anubis (boss18) chạy clip `boss02_*`. Người Cây chỉ có một controller cho hai pha
  (`root` đứng yên → `stand_up` → `ide/run`).
- **Quái trứng của Thỏ** (`e_egg01`, `e_egg02`) chưa có trong web. Tạm dùng heo rừng / yêu tinh súng của Rừng,
  vì hai con này cùng kiểu AI (EnemyAI09 / EnemyAI01).

## Kiểm

- `node test/soulknight-bosses.js`: đánh thật 12 trận, đối chiếu máu và số viên mỗi loạt với số chép tay từ dữ liệu gốc,
  đi hết cổng 3-5 thì tới chiến thắng. Nếu `index.html` chưa có thẻ `data/sk-bosses86.js` thì kiểm thử tự chèn.
- Bộ xem nhanh từng đòn (ép đòn bằng `SK.bossDebug.next`, giữ AI bằng `SK.bossDebug.hold`) nằm ở scratchpad, không
  đưa vào repo. Trong console trình duyệt:
  `SK.bossDebug.force = 'boss14'; SK_GAME.debug.stage('1-5')`, rồi `SK.bossDebug.hold = true; SK.bossDebug.next = 'atk5'`.
