# Ghế Nóng — sổ nghiên cứu hai game nguồn

> Game đang dựng: quản lý đội tuyển esport. Vòng huấn luyện lấy theo **Uma Musume: Pretty Derby**
> (Cygames 2021; bản Steam 2025-06-24, appid 3224770). Khâu thi đấu lấy theo **Teamfight Manager 2**
> (Early Access **2026-05-25**, appid 3009300) và bản đầu **Teamfight Manager** (2021-03-01, appid 1372810).
>
> Tài liệu này ghi **cái đã nhìn thấy tận mắt** trong ảnh/video tải về, kèm nguồn. Nhãn:
> - `[ẢNH]` — đọc trực tiếp trên ảnh trong `~/Downloads/esport-ref/`, có ghi tên tệp.
> - `[NGUỒN]` — lấy từ trang web, có link ở mục 4.
> - `[ĐỀ XUẤT]` — tôi suy ra / tự quyết cho game này, KHÔNG phải của game gốc.
>
> Kho ảnh: `C:\Users\tamph\Downloads\esport-ref\` (ngoài git, không commit).

---

## 0. Vì sao phải chụp ảnh chứ không đọc wiki

Mấy trang wiki tiếng Anh về TFM2 (`teamfightmanager2.com`, `teamfightmanager.wiki`,
`teamfightmanager2.wiki`) là trang SEO dựng tự động, nội dung mâu thuẫn nhau và **403 khi tải**.
Cái duy nhất kiểm chứng được là **ảnh trong game**. Nên tài liệu này dựng từ:

| nguồn ảnh | số ảnh | nội dung |
|---|---|---|
| Steam screenshots TFM2 (`tfm2/steam/shot01..07.jpg`) | 7 | trận đấu, deathmatch, hồ sơ tuyển thủ, BXH, pick phase, tactics |
| Steam screenshots TFM1 (`tfm1/steam/`) | 7 | bản 2021 để so sánh |
| Steam screenshots Uma (`uma/steam/`) | 4 | màn Home, story, đua |
| Trailer Steam (3 video → `*/frames/`) | 210 khung | anim, vfx |
| YouTube "Let's Play TFM2 Ep1" (2069s → 18 bảng ảnh) | 207 khung | **toàn bộ luồng quản lý**: tạo save, training, schedule, recruitment, game info, ban/pick, swap, tactics, trận đấu, bảng kết quả |
| YouTube "ULTIMATE Uma Guide" + "F2P URA Career Guide" (955s + 3188s) | ~310 khung | màn huấn luyện, sự kiện, kế thừa, sparks, đội hình thẻ |
| YouTube gacha 10-pull (471s) | 60 khung | banner, nút quay, bảng tỉ lệ, màn kết quả |

Cách dựng: `yt-dlp` tải video → `ffmpeg -vf "fps=1/10,scale=640:-2,tile=4x3"` ghép **bảng ảnh liên
hoàn** 12 khung/tấm. Xem 18 tấm là duyệt hết 35 phút gameplay. **Mẹo này nên dùng lại cho game sau.**

**Bẫy đã sập** (ghi để khỏi sập lại):

- `store.steampowered.com` **chặn curl trong Bash tool** (`curl: (35) Recv failure`), nhưng
  `Invoke-WebRequest` trong PowerShell thì qua. `steamcommunity.com` thì Bash gọi được.
- `Invoke-WebRequest` thiếu `-UseBasicParsing` sẽ chết với lỗi *"PowerShell is in NonInteractive
  mode"* (nó đòi khởi tạo engine IE). **Luôn thêm `-UseBasicParsing`.**
- Trailer Steam trong `appdetails` giờ **không còn `mp4`**, chỉ có `dash_av1` / `dash_h264` /
  `hls_h264`. Tải bằng `ffmpeg -i <m3u8> -c copy out.mp4`.
- `img.game8.co` trả **403** cho mọi header (kể cả Referer + UA thật) → không lấy ảnh từ game8 được.
- `yt-dlp` bản mới cần Python ≥ 3.9. Máy này `python` mặc định là **pyenv 3.8.10** nên pip chỉ cài
  được bản 2024.10 (hỏng với YouTube). Dùng
  `C:\Users\tamph\AppData\Local\Programs\Python\Python312\python.exe -m yt_dlp`.
- Gọi `--print "%(id)s"` qua shim `.bat` của pyenv thì `%(...)` bị cmd nuốt → dùng `--dump-json`.
- Heredoc `<<'EOF'` của Bash tool **vỡ với văn bản dài có dấu nháy đơn tiếng Việt**; ghi tài liệu dài
  thì dùng công cụ Write.

---

## 1. UMA MUSUME — vòng huấn luyện

### 1.1 Khung một "ca" (career)

`[NGUỒN]` gametora: một ca ~**70 lượt**, mỗi lượt một hành động. Chuỗi Junior → Classic → Senior →
chung kết URA. Hỏng một mục tiêu là **đứt ca ngay tại đó**.

`[ẢNH]` `uma/key/w_435.jpg` — thanh trên cùng màn huấn luyện đọc được:

```
[Training]                                            (i)
        Junior Year Pre-Debut
   ┌───────────┐   ⟳ Goal | Run in Junior Make Debut | (Details)
   │    11     │   Energy [████████████░░░░]  → NORMAL
   │turn(s)left│
   └───────────┘
```

Mỗi màn luôn có **4 thứ**: lượt còn lại · mục tiêu · thanh thể lực · tâm trạng.

### 1.2 Sáu hành động mỗi lượt

`[ẢNH]` `uma/key/ug_285.jpg` + `uma/sheets_guide/sheet003.jpg`: 6 nút —
**Rest · Training · Skills · Infirmary · Recreation · Races**.

| hành động | tác dụng | nguồn |
|---|---|---|
| Rest | hồi **30–70** thể lực (hay gặp nhất 50) | `[NGUỒN]` gametora |
| Training | chọn 1 trong 5 sân, tốn thể lực, ăn chỉ số | `[NGUỒN]` gametora |
| Recreation | kéo tâm trạng lên; karaoke **+2 bậc** | `[NGUỒN]` gametora |
| Infirmary | chữa trạng thái xấu | `[NGUỒN]` game8 |
| Skills | tiêu điểm kỹ năng mua skill | `[NGUỒN]` gametora |
| Races | chạy giải ngoài lịch, ăn fan + điểm kỹ năng | `[NGUỒN]` gametora |

### 1.3 Năm sân tập

`[ẢNH]` `uma/key/w_435.jpg`: 5 nút tròn dưới đáy — **Speed · Stamina · Power · Guts · Wit**, mỗi nút
ghi `Lvl 1`. Sân đang chọn nhô lên, có mũi tên vàng `≫≫` chỉ vào.

`[NGUỒN]` game8: **tập 4 lần thì sân lên 1 cấp, tối đa cấp 5**; cấp cao ăn nhiều hơn. Tập một chỉ số
cũng nhả chỉ số phụ. `[NGUỒN]` gametora: **Wit không tốn thể lực mà còn hoàn lại một ít**.

`[ẢNH]` cùng ảnh — hàng chỉ số hiện **hạng chữ** trước số:
`Speed F+ 187/1200 · Stamina F 142/1200 · Power G+ 70/1200 · Guts F 107/1200 · Wit F 115/1200 ·
Skill Pts 120`. Trần chỉ số **1200**. Khi chọn sân, mức ăn được **hiện nổi ngay trên đầu cột chỉ
số**: `+11` Speed, `+5` Power, `+2` Skill Pts — thấy trước khi bấm.

### 1.4 Thể lực và tỉ lệ hỏng

`[ẢNH]` `uma/key/w_435.jpg`: nhãn xanh `Failure 0%` ngay dưới hàng chỉ số, **luôn hiện**.
`[NGUỒN]` game8: tỉ lệ hỏng **bắt đầu tăng khi thể lực dưới 50%**; nên giữ dưới 15–25%.

### 1.5 Tâm trạng (mood) — 5 bậc

`[ẢNH]` `uma/sheets_guide/sheet003.jpg`, hộp "Mood Effect" đọc được:

| bậc | tác dụng |
|---|---|
| GREAT | kết quả tập **+20%**, tăng chỉ số khi thi đấu |
| GOOD | **+10%** |
| NORMAL | không đổi |
| BAD | **−10%** |
| AWFUL | **−20%** |

### 1.6 Thẻ hỗ trợ (support card) → sẽ thành "tuyển thủ"

`[ẢNH]` `uma/sheets_guide/sheet002.jpg`: màn **Support Formation** — lưới **6 ô**: 5 thẻ của mình
(`Lvl 30/25/40`) + **1 ô "Friends"** mượn của bạn. Dưới mỗi thẻ có dãy sao (mức uncap).

`[NGUỒN]` gametora + game8:

- Mỗi lượt, thẻ **rải ngẫu nhiên vào 5 sân**; thẻ đúng loại có **xác suất ra sân đó cao hơn**.
- Tập chung sân → **thanh thân thiết** của thẻ đó lên.
- Đạt **~80% (thanh chuyển cam)** → mở **Friendship Bonus**: tập ở **đúng sân sở trường của thẻ** sẽ
  nổ **rainbow** — sân sáng cầu vồng, ăn chỉ số **rất lớn**.
- Chấm than đỏ `!` = **hint**: mở một skill mua **giá rẻ**.

`[ẢNH]` `uma/key/w_435.jpg` xác nhận: icon thẻ đứng trên nút Speed có badge `!` đỏ; cột phải xếp
avatar thẻ đang có mặt kèm **thanh thân thiết** riêng.

`[NGUỒN]` danh mục hiệu ứng thẻ (uma.guide / umamusume.run) — **24 loại**, dùng làm khung chế "chỉ số
tuyển thủ":

```
Friendship Bonus · Mood Effect · Speed/Stamina/Power/Guts/Wit Bonus · Training Effectiveness
Initial Speed/Stamina/Power/Guts/Wit · Initial Friendship Gauge · Race Bonus · Fan Bonus
Hint Levels · Hint Frequency · Specialty Priority · Failure Protection · Energy Cost Reduction
Skill Point Bonus · Wit Friendship Recovery · Event Effectiveness · Event Recovery
```

### 1.7 Sự kiện ngẫu nhiên

`[NGUỒN]` gametora: gần như **sau mỗi hành động** đều có thể nổ sự kiện visual-novel; rơi vào 3 nhóm:
**cộng chỉ số**, **cho điểm kỹ năng**, **dính trạng thái xấu**. Một số có **lựa chọn** đổi kết quả.

`[ẢNH]` `uma/sheets_guide/sheet003.jpg`: sự kiện **"FRIENDSHIP TRAINING!"** và bảng Log ghi từng
dòng: `Energy went down by 10. / Speed went up by 5. / Guts went up by 5. / Wit went up by 5. /
Gained 1 hint level(s) for Updraft. / Friendship with Grass Wonder is maxed out.`

→ **Bảng Log luôn hiện bên phải**, kể lại mọi con số vừa đổi. Đây là thứ làm người chơi tin hệ thống.

### 1.8 Cảm hứng / kế thừa

`[ẢNH]` `uma/sheets_guide/sheet001.jpg`: màn **Legacy Select** — 2 ô `1st Legacy` / `2nd Legacy`, mỗi
ô chọn một **Veteran** đã tốt nghiệp, kèm nhãn affinity `△ / ○ / ◎`; có mục "Guests" mượn của người
khác (**3 slot/ngày** `[NGUỒN]` gametora).

`[ẢNH]` giữa ca nổ **"INSPIRATION!"** → **"INSPIRATION COMPLETE! — Their legacies live on!"**, rồi Log
liệt kê: `Speed +3 / Stamina +3 / Power +3 / Guts +43 / Skill Pts +63 / Friendship with Director
Akikawa +4`.

`[NGUỒN]` uma.guide — bốn màu **spark**:

| màu | nội dung | chi tiết |
|---|---|---|
| xanh dương | chỉ số | random 1 trong 5 chỉ số; số sao theo ngưỡng **600** và **1100** |
| hồng | năng khiếu | random trong các aptitude hạng **A/S** của cha mẹ; nâng tối đa **4 bậc** |
| xanh lá | kỹ năng riêng | mở từ **Star Unlock Lv3+**; của cha mẹ có sẵn đầu ca, của ông bà phải chờ Inspiration |
| trắng | skill + hint | cộng chỉ số lẻ, cấp hint |

Mỗi Legacy kéo theo **2 ông bà** → **6 nhân vật** ảnh hưởng một ca.

### 1.9 Năng khiếu (aptitude) → sẽ thành "phong cách chơi"

`[NGUỒN]` gametora: 3 nhóm, hạng **G → S**:

- **Mặt sân**: Turf / Dirt
- **Cự ly**: Sprint / Mile / Medium / Long
- **Lối chạy**: Front Runner / Pace Chaser / Late Surger / End Closer

`[ẢNH]` `uma/sheets_guide/sheet001.jpg`: bảng năng khiếu là 3 hàng chữ nhỏ ngay dưới chỉ số, mỗi ô
một chữ cái hạng.

`[ẢNH]` `uma/sheets_guide/sheet004.jpg` — bảng "RACE DISTANCE: STATS TO FOCUS":

```
SHORT (Sprinter): Speed (nhất), Power, chút Guts
MILE:             Speed, Power, chút Stamina
MEDIUM:           cân bằng Speed, Stamina, Power
LONG:             Stamina (nhất), Speed, Power hoặc Guts
```

### 1.10 Đua — bốn chặng

`[NGUỒN]` uma.guide: đua chia **4 chặng** — Opening (1/6 đầu) → Middle (3/6) → Last Leg (1/6) →
**Last Spurt** (1/6 cuối). Stamina quy đổi thành **HP** lúc xuất phát; HP tiêu dần, hai chặng cuối
tiêu **nhân hệ số Guts**. "Position Keep" chi phối hành vi từ khúc 1→10.

→ `[ĐỀ XUẤT]` Cấu trúc 4 chặng ánh xạ thẳng sang trận MOBA: Opening = đi lane, Middle = giành mục
tiêu, Last Leg = đẩy trụ, Last Spurt = teamfight quyết định.

### 1.11 Gacha

`[ẢNH]` `uma/sheets_gacha/g001.jpg`: banner ảnh lớn, hai nút **`1回引く / 150`** và
**`10回引く / 1500`** → **150 carat/lần, 1500/10 lần**. Bảng tỉ lệ mở ra: `★★★ 3.000%` ·
`★★ 18.000%` · `★ 79.000%`; rate-up từng cái `0.750%`.

`[NGUỒN]` umareference / destructoid / game8:

- 3% SSR (thẻ) hoặc 3★ (nhân vật); 18% SR/2★; 79% R/1★.
- Cái **được rate-up chỉ 0.75%** — banner đơn hay đôi cũng 0.75% mỗi cái.
- **10 lần quay bảo đảm ít nhất 1 cái ≥ SR/2★**.
- **Pity = 200 lượt** (~30.000 carat) → đổi thẳng lấy cái rate-up ("spark"). **Không cộng dồn qua
  banner khác.**
- Trùng → **uncap** 0LB → MLB (4 lần trùng). Trung bình phải **spark 2 lần** mới MLB một SSR.

`[ẢNH]` `uma/sheets_gacha/g003.jpg`: màn kết quả 10 lần là **lưới 2×5**, mỗi ô một thẻ kèm số sao và
badge `+1 / ×3 / ×10` (mảnh dư quy đổi).

### 1.12 Màn Home

`[ẢNH]` `uma/steam/shot04.jpg`: trên cùng `TEAM RANK B 101900`, `TP 100/100` (vé chơi), `RP 5/5`,
tiền `306,470`, cà rốt `280`. Đáy 5 tab: **Enhance · Story · Home · Race · Scout**. Cạnh phải xếp
dọc: Jukebox · Sparks · Log · Career Profile · Agenda · Item Request · Menu.

---

## 2. TEAMFIGHT MANAGER 2 — khâu thi đấu

### 2.1 Bố cục chung (quan trọng nhất cho UI ngang)

`[ẢNH]` `tfm2/steam/shot04.jpg` — **mọi màn quản lý** đều là: **cột trái = menu dọc**, **giữa = nội
dung**, **đáy = thanh ngày + nút Proceed**. Menu 16 mục:

```
News · Roster · Coaching Staff · Training · Schedule · Rankings · Recruitment · Solo Rank
Facilities · Finance · Team Info · Game Info · Statistics · Records · Gaming House · Home
```

Đáy: `◀ ▶` | `2/4/2026 00:00` | ⏻ | **`Proceed ➜`** (nút xanh, luôn góc phải dưới).

### 2.2 Hồ sơ tuyển thủ

`[ẢNH]` `tfm2/steam/shot04.jpg` — **SilverCastle, 25 tuổi**, 12 chỉ số:

| chỉ số | giá trị | nghĩa |
|---|---|---|
| Monster Kills | 68 | tooltip: *"càng cao càng giỏi giết lính, quái rừng, quái lớn"* |
| Skill Dodge | 99 | né chiêu |
| Skill Hit | 100 | trúng chiêu |
| Control Speed | 56 | tốc độ thao tác |
| Positioning | 97 | đứng vị trí |
| Judgment | 67 | phán đoán |
| Mental | 74 | tâm lý |
| Focus | 95 | tập trung |
| Calls | 94 | gọi (macro) |
| Roaming | 40 | di chuyển gank |
| Aggression | 21 | máu chiến |
| Ego | 74 | cái tôi |

Bên phải: **Stamina 100**, **Condition: Normal**, ô trait (`None` + ô `?` = trait còn ẩn),
**Squad Status: Key Player**.

**Position** — **5 sao** cho từng vị trí: `Top ★★★★☆(4.5)`, `Bottom ★☆☆☆☆`.
→ **Đây chính là "độ thông thạo"**; game mình đổi thành **thông thạo từng tướng** thang N→R→SR→SSR→UR.

**Communication Level**: `Korea League ★★★★★`.

Bảng mùa: `GP · Kills · Deaths · Assists · Avg KDA · Avg Dmg Dealt · Avg Dmg Taken · Avg Healing ·
Avg Level · Avg Rating · Wins · Losses · Win Rate · MVP Times`.

Hợp đồng: `Contract Period 12 31 2026 · Salary ₩433 M · Transfer Fee ₩7.36 B`. Solo Rank:
`Korea Server 86th, 1,101 points`. `Scout Recommendation ★★★★☆`.

Nút: `Solo Rank Record · Compare with Roster · Add to Release List · Block Transfer ·
Re-sign Negotiation · Change Status · Set Nickname · Release Player`.

`[NGUỒN]` mô tả Steam TFM2: *"chỉ số tuyển thủ **không** cộng thẳng vào sát thương, mà đổi **cách AI
ra quyết định và thao tác**"*. Đây là ý cốt lõi phải bê nguyên: chỉ số điều khiển **hành vi**.

`[NGUỒN]` hướng dẫn Steam:

- Luyện được: **Control, Judgement, Mental**. Không đổi được: **Roaming** + vài chỉ số phụ.
- **15–25 tuổi** lên nhanh; **26+** chỉ số cao sẵn nhưng **tụt dần**.
- **Calls** là chỉ số macro quan trọng nhất, tối thiểu **50–60**.
- Có **stat ẩn "loyalty"** khiến sao số không chịu chuyển nhượng dù trả cao.

### 2.3 Tạo save / luật giải

`[ẢNH]` `tfm2/sheets/sheet002.jpg` — **Game Settings** đọc được đủ:

```
Patch Intensity      : Light | Moderate | Heavy
Patch Frequency      : Rare | Moderate | Frequent
Champion Types       : Classic | Random | Even Rand. | Custom
No. of New Champions : 0 | 1 | 2 | 3
Draft Time Limit     : None | 10s | 20s | 30s | 60s
Ban/Pick Style       : Classic | Fearless | Fearless (Hard)
League Rules         : Double Elimination | Tournament
Intl. Tourney Rules  : League Group | Swiss
Group Stage Rules    : League Group | Swiss
Simulation Intensity : Simple | Moderate | Detailed
Manager Training     : Proceed | Skip
Player Attribute Visibility : Hide | Show
Difficulty           : Easy | Normal | Hard
```

Giải thích hiện dưới khi rê, ví dụ **Fearless (Hard)**: *"In each set, a team cannot select champions
used by either team in previous sets."*; **Simple**: *"...Lowest computational load, recommended for
low-end devices. On this device, one in-game day takes up to about 1.0 seconds."*

→ `[ĐỀ XUẤT]` Bài học cho web: **cho người chơi chọn độ nặng mô phỏng**; điện thoại phải có mức nhẹ.

### 2.4 Huấn luyện đội (khác Uma, đáng lấy)

`[ẢNH]` `tfm2/sheets/sheet004.jpg` — 3 tab `Team Training Plan | Personal Training Plan | Streaming`:

```
Weekly Schedule:  Training ──●──── 45%   Streaming ─●───── 20%   Rest ──●──── 35%
Training Program: Control Training  35%  Efficiency ??/100
                  Judgment Training 35%  Efficiency ??/100
                  Mental Training   30%  Efficiency ??/100
Coach Opinion: "The Control Training showed great results this week. Zeus's Monster Kills has grown
                significantly. The Judgment Training hasn't been producing results. Consider adding
                videos or hiring a coach."
Training Results: biểu đồ tuần
```

`[NGUỒN]` hướng dẫn Steam: dồn **một** chỉ số thay vì chia đều; chỉnh % sao cho **Efficiency ~100%**;
HLV giỏi (spec 100) cho phép 35–55% mà vẫn 100%; phần còn lại đổ vào Rest để hạ **stress**.

### 2.5 Tuyển quân

`[ẢNH]` `tfm2/sheets/sheet004.jpg` — tab `Contract Status | All Negotiations | Scout Dispatch |
Scouting List | Interested | Released | All`. **Scout Dispatch**: chọn `Dispatch Region · Min/Max Age
· Position · Max Salary · Max Transfer Fee · Player Type` + **9 điều kiện chỉ số** rồi **Dispatch**.
Bên phải: `Weekly Dispatch Cost $4.17K/week`, `Transfer Budget`, `Salary Budget`, `Status: Waiting`.

`[ẢNH]` `tfm2/sheets/sheet008.jpg` — **Contract Offer**: `Salary ▾` (bậc lương), `Contract Period ▾`,
`Transfer Fee`, `Squad Status`, **Optional Clauses**: `+ POG Award Bonus · + League Rank Bonus ·
+ Match Appearance Bonus · + Match Win Bonus`. Dòng *"Patoy expects a minimum salary of $154 K"* và
`Remaining Salary Budget: $1.32 M`. Hai nút: `Delegate to Scout` | `Make Offer`.

### 2.6 Trước trận

`[ẢNH]` `tfm2/sheets/sheet008.jpg`:

1. **Next Match Opponent Info** — bảng đội bạn (Main Pos, GP, Avg K/D/A, KDA, Avg Level, Avg Rating,
   Solo Kills, Solo Killed), **Most Picked Champions**, **Most Banned Champions**, **Head to Head**,
   và **Coach Analysis** dạng chữ: *"Key player is Aiming. KT Rolster tends to focus on the top/mid
   side during the lane phase. KT Rolster's jungler tends to prioritize farming and lane cover."*
   → chính là **báo cáo analyst**; `[NGUỒN]` hướng dẫn Steam gọi analyst là *"tài sản giá trị nhất"*.
2. **Player Selection** — chọn đội hình theo 5 vị trí, bảng hiện `Stamina` và `Condition` từng người
   → `Submit Starting Lineup`.
3. **Sân khấu** — cảnh pixel art có khán giả, hai đội ngồi hai bên, chỉ để tạo không khí.

### 2.7 Ban / Pick

`[ẢNH]` `tfm2/steam/shot06.jpg` + `tfm2/sheets/sheet008.jpg`:

- Băng đỏ trên: `Delegate ban/pick to Head Coach` | **`Pick Phase (11/14)`** hoặc **`Ban Phase
  (2/16)`** | `Select a champion to ban ➜`. Lượt đối thủ: *"Blue team is selecting champions to ban"*.
- **Cột trái**: 5 tuyển thủ mình (icon vị trí + sprite tướng đã pick). **Cột phải**: 5 người đối thủ.
- **Giữa trên**: lưới tướng (`All ▾` lọc), tên dưới mỗi ô; ô bị ban có **⊘**, ô mờ = không chọn được,
  **badge số đỏ** (1/2/3) = đã dùng ván trước (luật Fearless).
- Tooltip: `Main Position: Support / Bottom`.
- **Giữa dưới**: bảng chỉ số tướng. Đọc nguyên **Cavalry — Melee**:

| chỉ số | Lv.1 | mỗi cấp | Lv.12 |
|---|---|---|---|
| Attack | 90 | 20 | 310 |
| Ability Power | 0 | 0 | 0 |
| Attack Speed | 1.20 | 0 | 1.20 |
| HP | 900 | 90 | 1890 |
| Armor | 25 | 7 | 102 |
| Magic Resist | 15 | 3 | 48 |
| Range | 27 | 0 | 27 |
| Movement Speed | 72 | 0.9 | 81.9 |

  **3 kỹ năng mở theo cấp** (Lv.1 / Lv.3 / Lv.5) kèm hồi chiêu `6.0s / 8.0s / 60.0s`:
  - Lv1: *"Charge in a straight line to impale the first hit enemy, **rooting for 1.00s** and dealing
    **30 + 120% of attack damage** as physical damage. Charge speed scales with move speed."*
  - Lv3: *"Increase move speed by 20% for 4.00s and enhance weapon to a flame lance, adding burn
    damage for 1.00s on attacks."*
  - Lv5 (ult): *"Increase move speed by 50% for 4.00s, and create a zone leading to your location.
    Allies on the zone gain 50% move speed when moving toward the cavalry."*

  Chữ trong mô tả **tô màu theo loại**: số damage cam, "physical damage" vàng, thời gian khống chế đỏ.
- **Đáy**: tên hai đội, `Bo3`, `2026 KR Div 1 Spring Match 1`, các ô ban đã dùng.

**Champion Swap Phase** `[ẢNH]` `tfm2/sheets/sheet010.jpg`: pick xong còn bước **"Assign champions to
players"** — giao tướng cho đúng người rồi `Confirm Swap`. Tức **pick tướng và giao người là hai việc
tách rời** → mở ra chiêu giấu bài.

### 2.8 Chiến thuật

`[ẢNH]` `tfm2/steam/shot07.jpg` — tab `Tactics ◀ Team ▶` (đổi sang **Personal**). 12 nhóm:

| nhóm | các lựa chọn |
|---|---|
| Core Lane Focus | Focus on Top/Mid · Focus on Mid/Bottom · All Lanes |
| Early Jungle Style | Farming/Cover · Ganking · Counter-Jungling |
| Early Serpen Attempt | Always Attempt · Flexible · Concede |
| Top Laner Join for Early Serpen | Always Join · Flexible · Do Not Join |
| Minion Wave Management | Wave Priority · Join Priority |
| Objective Setup | Split Push · Flexible · Group Up |
| Objective Combat Strategy | Poke / Maintain Distance · Hard Engage |
| Objective Finish | Kill Priority · Fight Priority |
| Morgard Buff Usage | Group as 5 · 1-4 Split · 1-3-1 Split (+ chọn 2 người đi lẻ) |
| Tower Siege | Poke / Maintain Distance · Dive |
| Defensive Tactics | Defend Pressured Lane · Force Fight |
| Closing Out | Stable · Flexible · Aggressive |

Phải là **Matchup**: 5 cặp đối đầu. Đáy: `Delegate Tactics to Head Coach` | **`Start Match`**.
Mỗi lựa chọn có **một dòng giải thích** ở đáy, ví dụ *"Concedes Serpen to focus on safe growth in each
lane."*, *"Prioritizes managing minion waves before joining the team."*

**Personal tab** `[ẢNH]` `tfm2/sheets/sheet012.jpg`: mỗi người một dòng chọn **hướng lên đồ**; ghi rõ
*"1st item purchase decision is left to the player."*

### 2.9 Trận đấu — cái phải làm thật kỹ

`[ẢNH]` `tfm2/steam/shot01.jpg` (1920×1080):

```
┌ HÀNG TRÊN ─────────────────────────────────────────────────────────────────────────┐
│ [logo] Grid Strikers ▢▢  0🐉 0🦏 1🏛 12.15K💰   0 ⚔ 3   12.97K💰 ...  Binary Tigers │
├──────────────────────────────┬─────────────────────────────────────────────────────┤
│ |◀ ◀◀ ⏸ ▶▶ ▶| 🔍+ 🔍−       │ BẢNG ĐỐI ĐẦU (5 hàng, mỗi hàng 1 lane):             │
│                              │ [pos][tướng][3 ô đồ] 0/1/0 25CS [avatar]            │
│        BẢN ĐỒ CHÍNH          │        ◀ 62 (chênh vàng) ▶ [avatar] 24CS 0/0/1      │
│   sprite + thanh máu +       ├─────────────────────────────────────────────────────┤
│   "Lv.6 SilverCastle"        │ 10 THẺ TUYỂN THỦ (2 cột × 5):                       │
│   + số damage bay lên        │ [avatar] Lv.5 Kevin (F6) [thanh máu][thanh mana]    │
│                              ├──────────────────┬──────────────────────────────────┤
│  ┌ LỜI THOẠI ──────────────┐ │   MINIMAP        │ ▶ Auto Camera(r)                 │
│  │ Yutapon: Fighting,      │ │   + khung camera │ ─ Match Info ─                   │
│  │   target Lancer!        │ │   + hẹn giờ hồi  │   Details(tab)                   │
│  │ Cody Sun: Ganking top   │ │     sinh (0:56)  │   Check Tactics                  │
│  │ Toasty: Not in shape,   │ │                  │ [View Match Result Immediately]  │
│  │   pulling back          │ │                  │ [Pause]                          │
├──┴─────────────────────────┴─┴──────────────────┴──────────────────────────────────┤
│ [10 avatar nhảy camera] [A][B][R]     [0.5][x1][x2][x3][⚡][⛶]                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Đồng hồ trận** `03:02` nổi giữa đỉnh màn.
- Mỗi tuyển thủ có **phím tắt** `(F1)`…`(F10)` để nhảy camera.
- Nút `Show Info UI / Hide Info UI` — **ẩn hết bảng số để xem trận cho đã**.
- Tốc độ **0.5 / 1 / 1.5 / 2 / 3 / ⚡tức thì**.
- **Lời thoại tuyển thủ** hiện liên tục, tô màu theo người. Câu đọc được:
  `"Ganking top"` · `"Not in shape, pulling back"` · `"Burn Gambler down!"` · `"Fighting, target
  Lancer!"` · `"Help me out!"` · `"Engaging! Focus Lancer"` · `"Let's go!"` · `"Looking for an angle,
  hitting Fighter!"` · `"They're stacked here, give Morgard"` · `"Support here, quick!"` ·
  `"Can't sustain, backing off"` · `"Push top hard"` · `"Serpen's almost here"` · `"Let's prep for
  Morgard"` · `"Defend base now!"` · `"Need backup here!"` · `"Taking tower shots, pulling out"`
  → **Đây là thứ biến bảng số thành trận đấu có hồn. Bắt buộc phải có.**
- **Banner giữa màn** khi có mạng: `Zeus has slain PerfecT!` · `Blue Team has slain the Morgard!`
  kèm 2 avatar hai bên.
- **Buff timer** trên thanh đỉnh: `Morgard Buff 0:27`.
- Sát thương bay lên bằng **số màu** (cam = vật lý, tím = phép), vàng `+138` = tiền.

### 2.10 Bản đồ và mục tiêu

`[ẢNH]` `tfm2/sheets/sheet006.jpg` — **Game Info → Object Info**:

- **Structures / Minions**: `Nexus · Tower · Melee Minion · Ranged Minion`
- **Epic Monsters**: `Morgard` (tê giác đỏ) · `Serpen` (rắn tím)
- **Neutral Monsters**: `Mushroom · Wisp · Bee · Stump`

Bảng **Morgard**: `HP 10000 (+1000/Respawn)`, `Attack 100 (+30/Respawn)`, `Armor/MR 60`,
`Movement Speed 90`, `Attack Range 80`, `Attack Cooldown 0.8s`; **Rewards** `EXP 80`,
`Gold 2000 (+100/Respawn)`; **Respawn** `First Spawn 240.0s`, `Interval 120.0s`;
**Morgard Minion Buff** cho lính gần đó: `Duration 60s`, `Range 140`, `HP +200`, `Attack +40`,
`Armor/MR +20`, `Atk Speed +20%` (mỗi lần hồi sinh cộng thêm).

**Game Rules → Position Buffs** — buff theo vị trí, rất gọn và rất hay:

| vị trí | buff |
|---|---|
| Top | hồi **1.5% máu tối đa mỗi giây** |
| Jungle | **+20% tốc chạy** ngoài giao tranh trong rừng; **hành quyết** quái lớn khi máu ≤ 700 |
| Mid | **+20% kinh nghiệm** |
| Bottom | **+20% vàng** |
| Support | **−30% kinh nghiệm, −15% vàng**; khi last-hit thì **đồng đội gần nhất nhận vàng** |

### 2.11 Đồ đạc

`[ẢNH]` `tfm2/sheets/sheet006.jpg` — **Item Info**: **5 tầng**, mỗi món có `Builds From` /
`Builds Into`. Đọc nguyên: `Iron Sword — Tier 1 — 500g — Attack Damage +15 → Soldier's Longsword`;
`Ruinous Blade — Tier 3 — 500 — AD +30, Lifesteal +5%`; `Conqueror's Greatsword — Tier 4 — 900 —
AD +15, Lifesteal +10% — Builds From: Ruinous Blade — Builds Into: Warlord's Final Judgment`.
Tên tầng 5: `Warlord's Final Judgment · Storm Sovereign · Unbreakable Fortress · Veil of Annihilation
· Prophet of the Abyss · Grave's Warm Shard`.

### 2.12 Sau trận

`[ẢNH]` `tfm2/sheets/sheet017.jpg` — **Match Result**:

```
KT Rolster   1  Win        Match Time 11:28        Loss 0   Hanwha Life
──────────────────────────────────────────────────────────────────────
PerfecT [thanh damage xanh]            [thanh damage đỏ] Zeus
  Rating 7.70 (5/1/3)                  Rating 6.50 (1/5/6)
Aiming 👑 Rating 8.20 (MVP)            ...
──────────────────────────────────────────────────────────────────────
   Detailed Stats:  KDA 18/8/19 vs 8/18/8 · Gold 61,239 vs 48,004
                    Turrets 8 vs 2 · Serpen 4 vs 0 · Morgard 3 vs 0
   ┌ Gold Difference ─ biểu đồ đường theo phút ─┐
                    [ Proceed ]
```

→ **Biểu đồ chênh lệch vàng** chính là "chart" chủ dự án nhắc. Có `Rating` từng người + vương miện MVP.

### 2.13 Bảng xếp hạng & thống kê

`[ẢNH]` `tfm2/steam/shot05.jpg` — tab khu vực `Challengers Eastern · Challengers Western · Masters ·
Champions · Korea · China · Europe · NA · SA · Japan`, mùa `D1 Spring Regular`. Cột: `Rankings · Team
· Matches · Wins · Losses · Set Diff · Kills · Deaths · Assists · Notes`, Notes ghi `Playoff Winners
/ Playoff Losers / Playoff Eliminated`.

`[ẢNH]` `tfm2/sheets/sheet006.jpg` — **Statistics → Champ Stats**: `Champ Name · Wins · Losses · Win
Rate · Pick Count · Ban Count · Ban/Pick Rate · Dmg Dealt · Dmg Taken · Healing`.

→ `[NGUỒN]` Steam: win-rate mỗi mùa dùng để **tự động buff/nerf tướng** trong save của bạn → **meta
trôi theo thời gian**, thứ làm game sống lâu.

### 2.14 Danh sách tướng đọc được từ ảnh

```
Android · Archer · Bard · Barrier Mage · Berserker · Bomber · Boomerang Hunter · Cavalry · Chef
Circus Blade · Clown · Dancer · Dark Mage · Demon · Dokkaebi · Druid · Dual Blader · Enchanter
Executioner · Fighter · Gambler · Ghost · Guardian Spirit · Hammerer · Hitman · Ice Mage · Inquisitor
Knight · Lancer · Lightning Mage · Mage Knight · Monk · Necromancer · Ninja · Ogre · Poison Dart
Hunter · Pole Warrior · Priest · Prisoner · Pyromancer · Shadowmancer · Siege Breaker · Sniper
Swordsman · Taoist · Vampire · Voodoo Shaman · Werewolf · White Mage · Wind Mage
```

Lớp: **Melee · Ranged · Mage · Support · Assassin**.

---

## 3. Những chỗ hai game **không** đưa được cho mình

1. **Uma không có ban/pick**, TFM2 **không có gacha/kế thừa**. Chỗ nối hai hệ là phần phải tự thiết
   kế: HLV (vai Uma) huấn luyện, tuyển thủ (vai support card) vừa nuôi vừa ra trận. Xem `DESIGN.md`.
2. **TFM2 chạy trên PC** với bản đồ MOBA đầy đủ 5 lane + rừng, 60fps. Trên web/di động ngang phải rút
   gọn — xem mục "mô phỏng nhẹ" trong `DESIGN.md`.
3. Uma là **dọc** (điện thoại), TFM2 là **ngang** (PC). Game này **ngang toàn bộ** → mọi màn kiểu Uma
   phải bố trí lại thành **3 cột**.

---

## 4. Nguồn

- Steam — Teamfight Manager 2: https://store.steampowered.com/app/3009300/
- Steam — Teamfight Manager: https://store.steampowered.com/app/1372810/
- Steam — Umamusume: Pretty Derby: https://store.steampowered.com/app/3224770/
- Hướng dẫn TFM2 (Steam Discussions): https://steamcommunity.com/app/3009300/discussions/0/571539955565745197/
- GameTora — Uma beginners guide: https://gametora.com/umamusume/beginners-guide
- Game8 — Training Guide: https://game8.co/games/Umamusume-Pretty-Derby/archives/536168
- Game8 — Stats Guide: https://game8.co/games/Umamusume-Pretty-Derby/archives/535820
- Game8 — Legacy and Sparks: https://game8.co/games/Umamusume-Pretty-Derby/archives/536822
- uma.guide — Race Phases: https://uma.guide/guides/race-phases
- umareference — Gacha: https://www.umareference.com/guide/gacha
- Destructoid — Pity System: https://www.destructoid.com/umamusume-pretty-derby-pity-system-explained/
