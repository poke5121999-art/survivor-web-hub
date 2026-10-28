# Lucky Drop (Pachinko)

Chế độ phụ `mode.pachinko` của bản web. Mã ở `js/pachinko.js`, dữ liệu ở `data/pachinko.json`, hình ở `art/pachinko.webp` và `art/pachinko-bg.webp`.
Cả bốn tệp chỉ nạp khi mở chế độ (`modes.js` → `launch` → `import('./pachinko.js?v=…')`).

Nguồn: `libil2cpp.so` ARMv7 của bản 9.9.60, đọc bằng `D:/stickman-hook-ref/tools/arm_full.py`.
Bản dịch ngược nằm ở `D:/stickman-hook-ref/dump/asm/pachinko/*.s`.
Mỗi luật có `[asm 0x…]` là lệnh nó dựa vào. Chỗ nào tự đặt thì có nhãn `[ĐỀ XUẤT]`.

## Cách chơi

- Người que rơi từ đỉnh xuống một bumper và nảy lên xuống trên đó (vật liệu `BumperSameBounce` 1.0) cho tới khi người chơi chạm.
- Chạm thì móc vào điểm móc duy nhất ở đỉnh. Dây giống chế độ Normal: dùng `Player` của `physics.js`.
- Thả tay thì bay xuống bàn chốt. Rơi vào ô nào thì nhận thưởng ô đó, cộng với số xu kiếm được từ chốt.
- Mở chế độ ở 350 XP (`meta.d.modes`, không đổi). Bấm ✕ để thoát mà không nhận gì.

## Luật đọc từ mã

**Loại bàn và thưởng** (`PachinkoService`, `PachinkoState`)

- **Loại bàn** `GetNextLevel` [asm 0x116f190]:
  - `w = progression.pachinko_main_wins`. Khi `w < 7` thì loại bàn là `w`, nên 7 loại đi lần lượt theo thứ tự.
  - Từ `w ≥ 7` thì lấy `Random.Range(0, 7)`. LOOP (7) không bao giờ ra.
- **Giữ nguyên trạng thái** (loại bàn và 5 phần thưởng) cho tới khi trúng giải chính.
  - Trúng giải chính thì `main_wins + 1` rồi `ResetPachinkoState` [asm 0x116fb4c..0x116fb54].
  - Bản web lưu trạng thái ở `save.modes['mode.pachinko'].state` và số lần thắng ở `save.inv['progression.pachinko_main_wins']`.
- **Giải chính** `GenerateMainReward` [asm 0x116ee44, 0x116fc88]: món **đầu tiên chưa có** trong `mainRewardOptions`, theo thứ tự danh sách.
  - Trọng số 10 không được dùng.
  - Có hết rồi thì không có giải chính, và ô giữa lấy phần thưởng xu lớn hơn [asm 0x116ed24].
- **Thưởng xu** `ResetPachinkoState` [asm 0x116ebb4], `GenerateSecondaryRewards` [asm 0x116ef24]:
  - `floor((có giải chính ? 4 : 5) / 2) = 2` lần bốc theo trọng số, có hoàn lại: 150 (w12), 300 (w5), 500 (w2), 1000 (w1).
  - Kết quả xếp tăng dần.
- **Thứ tự ô** `get_OrderedRewards` [asm 0x116e078]: `[xu0, xu1, CHÍNH, xu1, xu0]`. Đối xứng, xu tăng dần từ mép vào giữa.

**Người chơi và vật lý**

- **Trọng lực** `Physics2D.gravity = −9.81 × 1.25` [asm 0x12a7240]. Nhân với `gravityScale 1.1` của prefab thì ra −13.49.
- **Camera đứng yên** ở (0, 0), size 7.5 [asm 0x12a6f58].
- **Không có chết, không có hết giờ** (`KillPlayer` rỗng [asm 0x121801c]). Ván chỉ xong khi người que vào ô.
- **Lớn lên** trong 0.25 s (`growthDuration` của `PlayerControllerPachinko`), xuất hiện sau 0.75 s.
- **Điểm móc**
  - Nhả dây thì `PachinkoTarget.UnHook` tắt điểm móc và thu nhỏ trong 0.2 s [asm 0x11a1a10, 0x11a1b48].
  - Vì vậy mỗi ván chỉ đu được một lần.
- **Bumper đầu** `PachinkoBumper.OnGrab`: lần móc đầu tiên thì thu nhỏ trong 0.2 s (OutSine) rồi tắt [asm 0x1218918, 0x1219098].
  - Chạm vào bumper chỉ làm méo mesh trong 0.1 s [asm 0x1218ad8].
- **Tường hai bên**: vật liệu nảy 1.0 (`BumperSameBounce`). `Bounce 0.6` của cấu hình không được đọc ở đâu cả.
  - Lúc chạm: xung lực ngang `dấu × clamp(25 − |vx|, 0, 2.5)` [asm 0x1219df0]. `dấu` là −1 khi điểm chạm ở bên trái tường.
  - Khi còn chạm: lực `dấu × 20` mỗi bước vật lý [asm 0x121a1d8].
- **Độ nảy vật liệu** (gộp kiểu Maximum, ma sát 0):

| Vật liệu | Độ nảy | Dùng cho |
|---|---|---|
| PachinkoPegBallBounciness | 0.8 | chốt tròn, capsule 0.5 × 0.5 |
| PachinkoPegRectBounciness | 0.6 | chốt chữ nhật, hộp 0.75 × 0.5 |
| PachinkoPegTriBounciness | 1.0 | chốt tam giác (scale 1.25) |
| PachinkoWallBounciness | 0.5 | vách ngăn ô |
| BumperSameBounce | 1.0 | tường bên, bumper đầu |
| NoFriction / không có | 0 | góc ô, sàn |

**Chốt** (`PachinkoPeg`)

- Lúc đầu hiện sprite `Neutral` (PegIdle*) [asm 0x121afcc].
- **Mỗi lần va chạm mới đều trả xu**, không chỉ lần đầu [asm 0x121b128].
  - `CollectCoins(_coinCount)`: 1 xu, chốt thưởng ×10 thì 10 xu.
  - Đẩy người que ra khỏi chốt một xung `_minBumpForce` (tròn 1.0, chữ nhật 0, tam giác 0.2), chia khối lượng 2 [asm 0x121b2a4..0x121b32c].
  - Luôn chạy `MiniBounce(0.1)` [asm 0x121b868]: sprite sáng (PegTouched*), phóng `1 + 0.2 × OutSine` rồi về.
- **Biến mất**: lần chạm đầu gọi `Disappear(0.5)` [asm 0x121b3a8..0x121b4d0], chốt thưởng gọi `Disappear(0)`.
  - Sau đó `ShrinkToNothing(0.15)` (OutSine) rồi tắt hẳn, kể cả collider [asm 0x121b724, 0x121bc50].
  - Trong 0.65 s đó chốt vẫn va chạm và vẫn trả xu.
- **Chốt ×10 và chốt người que thứ hai chỉ có khi có thẻ**: `card.pachinko_x10_multiplier` và `card.pachinko_extra_stickman` [asm 0x1212510..0x1212718].
  - Bản web chưa có thẻ, nên hai loại chốt này không xuất hiện.
  - Tham số thử `?pbonus=N` đặt N chốt thưởng theo đúng cách chọn của thẻ: danh sách xếp theo `Math.Round(b.y − a.y)`, bốc `Range(0, count − 1)`.
- `minBonusPercentage` / `maxBonusPercentage` (0.04 / 0.06) chỉ được ghi trong constructor, không có chỗ nào đọc.

**Ô thưởng và trả thưởng**

- Trigger của ô: hộp 2 × 3, lệch (0, −1.2), dưới `(tâm ô, đáy + 1)`.
  - Vào trigger thì `CollectReward` [asm 0x12a75a0]: ô xu cộng thẳng vào `NbCollectedCoins`.
  - Ván xong khi mọi người que đã vào ô.
- `WinRewards` [asm 0x116f6a0]: cấp vật phẩm, rồi cộng `NbCollectedCoins` vào xu.
  - Không có hệ số nhân, không có XP.
  - Bản web cấp qua `meta.grantReward` và lưu bằng `writeSave`. Vật phẩm mới thì cộng XP mở khoá của nó như mọi nơi khác trong game.

**Không làm**

- **Giới hạn lượt mỗi ngày** (1 miễn phí + 2 xem quảng cáo) và mốc thời gian reset: offline nên bỏ, chơi bao nhiêu lần cũng được.
- **Thẻ**: extra stickman, x10, bumper resistance, lucky drop limit.

## Tự đặt `[ĐỀ XUẤT]`

- Bàn không rộng quá tỉ lệ 750:1335 trên màn hình máy tính (xem mục "Bàn chơi").
- Ô giữa ghi chữ `SKIN` / `ROPE` / `TRAIL` và tên món.
  - Bản gốc vẽ hình skin (`PachinkoSkinRewardPeg`). Muốn vẽ hình thì phải nạp `custom.json` (102 KB) và `custom-ui.webp` (325 KB), quá nặng cho một biểu tượng.
- Biểu tượng xu trong ô lấy từ `menu.webp`, đã có sẵn trong bộ nhớ đệm từ trang chính. Bản gốc dùng sprite `SkinCoins`.
- Mesh tường và bumper (`DeformableMesh2D`): tường vẽ thành dải gradient bo tròn, không méo khi chạm. Bumper méo bằng cách ép cả hình theo chiều dọc.
- Mặt trước của ô dùng material `SpriteScreenGradient`. Bản web vẽ sprite nguyên màu.
- Bảng kết quả hiện sau 1 s kể từ khi vào ô.
- Nếu không có giải chính (đã có hết 8 món) thì ô giữa vẫn tính là trúng giải chính khi rơi vào.
  - Bản gốc so sánh phần thưởng với `MainReward`, và lúc đó `MainReward` chính là phần thưởng xu lớn.
- `AddAttempt` không có chỗ nào gọi trong mã Pachinko, nên bản web không đếm số lượt.

## Bàn chơi

`PachinkoLevelSpawner.Initialize` [asm 0x12120c8] lấy bàn chơi bằng đúng khung camera:

- `BL = ViewportToWorldPoint(0, 0)`, `TR = ViewportToWorldPoint(1, 1)` [asm 0x12122c8, 0x1212308].
- Camera orthographic size 7.5 (`CameraSize`), nên bàn cao 15 đơn vị, rộng `15 × tỉ lệ màn hình`.
- Ở tỉ lệ tham chiếu 750 × 1335 thì bàn rộng 8.427.

`[ĐỀ XUẤT]` Màn hình rộng hơn 750:1335 (máy tính) thì bàn vẫn rộng 8.427, hai bên để trống. Màn hẹp hơn (điện thoại dài) thì bàn hẹp lại như bản gốc.

Khung cố định của mọi loại bàn:

| Vật | Vị trí | Địa chỉ |
|---|---|---|
| 5 ô thưởng | rộng `W/5`, vách ngăn ở `x = BL.x + W/5·i` (i = 1..4), đáy `BL.y` | 0x1212788..0x12128a8 |
| Ánh sáng ô | sprite `BucketGlowSprites[|i − 2| % 3]`: giữa vàng, cạnh giữa xanh lá, mép tím; scale x `W/5 × 10` | 0x12129ec..0x1212b04 |
| Chốt thưởng | `(tâm ô, BL.y + 1)`, trigger hộp lệch (0, −1.2) cỡ 2 × 3 | 0x1212b4c..0x1212b84 |
| Góc ô | trái ở `BL`, phải ở `(TR.x, BL.y)` lật x | 0x1212c74..0x1212d8c |
| Tường hai bên | `PachinkoWall.Init(0.16, H − 1.75)` ở `x = BL.x + 0.08` và `TR.x − 0.08`, tâm y `cy + 0.875` | 0x1212db8..0x1212f5c |
| Sàn | `(cx, BL.y)`, scale x `W × 10` | 0x1212f90..0x1213060 |
| Chỗ xuất hiện | `(cx − s + r, TR.y − 0.5)`, `s = Random.value < 0.5 ? −2 : 2`, `r = Random.Range(−1, 1)` | 0x1213148..0x12131e8 |
| Bumper đầu | `(cx − s + r, TR.y − 2.5)`: ngay dưới chỗ xuất hiện | 0x12131b8 |
| Điểm móc | `(cx + r, TR.y − 1.5)`: chỉ có một điểm móc | 0x12131fc..0x1213220 |

## Tám loại bàn

`BuildLevel(type, BL, TR)` [asm 0x121335c] dùng chung hai đại lượng [asm 0x12133f4..0x12134b0]:

- `R = min(W/2 − 0.5, H/2 − 3.75)`. Ở bàn 8.427 × 15 thì `R = 3.713`.
- `C = tâm khung + down × 0.5`.

Bảng nhảy ở 0x12134b8 có 7 ô (0..6). Loại 7 rơi vào nhánh mặc định.

`FillRectangleWithPegs` luôn được gọi với `randomness = 0`, nên `TargetRandomness` không làm lệch chốt nào.

| Loại | Cách dựng | Địa chỉ |
|---|---|---|
| 0 FULL_PEGS | `Fill((L, B+3), (R, T−3.5))` | 0x12134d4..0x1213570 |
| 1 HEXAGON | Lưới lục giác `GetHexGridInRect((L, B+6), (R, T−2.5), 4, không kéo giãn)`. Mỗi điểm: vòng chốt chữ nhật `CircleOfRectPegs(p, 1.5, 0.65, 0, 1.25)` và hoa 7 chốt tròn `GetHexGrid(p, 2, 0.5)`. Rồi `Fill((L, B+3), (R, B+6.5))` | 0x1213a08..0x1213ab8, 0x12141a4..0x121436c, 0x12147c8..0x1214854 |
| 2 BIG_CIRCLE | `a = Random.Range(−60, 60)`: vòng ngoài `CircleOfRectPegs(C+up, R−0.25, 0.7, a, R/2)`. `b = Random.Range(−45, 45)`: vòng trong `CircleOfRectPegs(C+up, R−1.25, 0.7, a+b, R/2·(R−1)/R)`. Rồi `Fill((L, B+3), (R, B+4.5))` | 0x121360c..0x12137c0 |
| 3 PEGS_AND_CUPS | `Fill((L, B+8.25), (R, T−3.5))`. Hàng chén ở `GetMaxPointsOnLine((L, B+7.75), (R, B+7.75), 3, kéo giãn)`, mỗi chén `CircleOfRectPegs(p, 1, 0.65, 0, 2)`. Rồi `Fill((L, B+3), (R, B+6.25))` | 0x12137c8..0x1213934, 0x1213fd4..0x1213ff0, 0x1214704..0x1214788 |
| 4 CONCENTRIC_PEG_CIRCLES | `n = max(3, (int)R)`. Với i = 1..n: `CircleOfPegs(C, R/n·i, 0.75, 0, 0)`. Thêm một chốt ở `C` | 0x1213574..0x1213608 |
| 5 PEGS_AND_SLOPES | `Fill((L, B+8.25), (R, T−3.5))`. Hai kệ `FillWithSlopesSameHeight((L, B+6.75), (R, B+6.75), 0.4)`. Rồi `Fill((L, B+3), (R, B+5.25))` | 0x1213b1c..0x1213d04 |
| 6 CUPS | Lưới `GetHexGridInRect((L+0.25, B+4.5), (R−0.25, T−2), 3, không kéo giãn)`, mỗi điểm một chén `CircleOfRectPegs(p, 1, 0.65, 0, 2)`. Rồi `Fill((L, B+3), (R, B+4.5))` | 0x1213d08..0x1213e30, 0x121462c..0x121464c, 0x12148dc..0x1214980 |
| 7 LOOP | Không có nhánh. Ghi lỗi `Invalid level type {0}` rồi dựng `BuildLevel(Random.Range(0, 7))` | 0x1213994..0x1213a00 |

Số chốt ở bàn 8.427 × 15 (bài kiểm `test/stickman-hook-pachinko.js` khẳng định đúng các số này):

| Loại | Chốt tròn | Chốt chữ nhật |
|---|---|---|
| FULL_PEGS | 68 | 0 |
| HEXAGON | 44 | 20 |
| BIG_CIRCLE | 8 | 43 |
| PEGS_AND_CUPS | 46 | 8 |
| CONCENTRIC_PEG_CIRCLES | 62 | 0 |
| PEGS_AND_SLOPES | 38 | 8 |
| CUPS | 8 | 24 |

### Các hàm dựng

- **`GetHexGridInRect(p0, p1, spacing, stretch)`** [asm 0x1216410]
  - `rows = (int)(H / spacing / 0.866)`, `cols = (int)(W / (spacing/2))`.
  - Kéo giãn: `dy = H/rows`, `dx = W/cols`. Không kéo giãn: `dx = spacing/2`, `dy = spacing·0.866`, lưới được căn giữa.
  - Hàng đầu ở `p0.y + dy/2`, lặp khi `y < p1.y`.
  - Mỗi hàng bắt đầu từ `p0.x + dx (+ dx ở hàng lẻ)`, bước `2dx`, dừng khi `x > p1.x − 0.95dx`.
- **`FillRectangleWithPegs(p0, p1, randomness)`** [asm 0x1214d6c]
  - Lưới trên với `spacing = TargetDistance = 1`, có kéo giãn.
  - Mỗi chốt lệch `insideUnitCircle × TargetRandomness × TargetDistance × randomness`.
- **`CircleOfPegs(pos, rad, arc, start, gap)`** [asm 0x1215148]
  - `count = (int)((2π·rad − gap) / arc)`.
  - `gap = 0` thì chia đều cả vòng. Không thì mỗi cung dài `arc` và phần dư để trống.
  - Phần trống căn giữa ở góc `start + 90°`. Chốt nằm ở giữa mỗi cung.
- **`CircleOfRectPegs`** [asm 0x121544c]
  - Như trên nhưng đếm trên bán kính `rad − 0.25`, đặt chốt ở bán kính `rad`.
  - Xoay chốt cho trục up hướng vào tâm: `SignedAngle(up, tâm − p)`.
- **`SpawnLine(a, b)`** [asm 0x1215b60]
  - Số chốt `n = Math.Round(|b − a| / 0.75)`, làm tròn về số chẵn như .NET.
  - Chốt chữ nhật quay theo hướng `a → b`, scale x `|b − a| / (n · 0.75)`, đặt ở `t = (i + 0.5)/n`.
- **`FillWithSlopesSameHeight(p0, p1, len)`** [asm 0x12158a4]
  - Hai đoạn `SpawnLine`, mỗi đoạn dài `(p1.x − p0.x) × len`, cách mép 0.125.
  - Bản 9.9.60 truyền hai đầu cùng độ cao, nên thành hai kệ nằm ngang. `SlopeAngle 7` và `SlopeSpacing 2` không được dùng.
- **`GetMaxPointsOnLine(p0, p1, spacing, stretch)`** [asm 0x12167f8]
  - `n = (int)(dài / spacing)`. Kéo giãn thì `spacing = dài / n`. Điểm ở `(i + 0.5)·spacing`.
- **`GetHexGrid(p, side, d)`** [asm 0x121611c]
  - Hàng `j = 1−side .. side−1`, mỗi hàng `2·side − 1 − |j|` điểm cách nhau `d`, hàng cao `d·0.866`.

## Bẫy đã sập

- **`arm_method.py` dừng ở literal pool đầu tiên và tối đa 600 lệnh.** `BuildLevel` dài 1523 lệnh nhưng chỉ in ra 496 dòng.
  - Đã viết `tools/arm_full.py`: đi hết khoảng của method, in literal pool thành `.word`, ghép cặp `movw/movt` thành số thực.
- **Bảng nhảy `switch` hiện ra thành lệnh rác** (`andeq r0, r0, r0, asr r5`).
  - Phải đọc chúng như số: `0x550` cộng gốc bảng `0x12134b8` ra `0x1213a08`.
  - Lần đầu mình tính sai một ô và tưởng HEXAGON nhảy vào giữa nhánh mặc định.
- **`Vector2` và `Vector3` để `up` ở offset khác nhau.** Vector3: up 0x18, down 0x24, left 0x30, right 0x3c. Vector2: up 0x10, down 0x18.
  - Đọc nhầm sẽ ra đáy vùng chốt ở trên đỉnh màn.
- **Trong máy trạng thái của iterator, `p1` nằm trước `p0`** (p1 ở 0x1c, p0 ở 0x2c). Constructor ghi `<>3__p0` vào 0x34 và `<>3__p1` vào 0x24.
- **LOOP không có nhánh trong `BuildLevel`.** Nó luôn dựng lại một trong 7 loại kia.
- **"Slopes" thực ra nằm ngang.** `FillWithSlopesSameHeight` nhận hai đầu cùng độ cao.
- **Atlas lossless nặng 140 KB.** Chốt có gradient bóng loáng. Giảm chốt về 40 % và lưu lossy q85 có alpha thì còn 37 KB, nhìn không khác.
- **Màn hình máy tính:** phủ BG2 lên cả khung thì vòng sáng giữa bị phóng to quá cỡ. Giờ BG2 chỉ phủ bàn chơi, ngoài bàn tô màu viền của BG2.
