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

> **Sáu nút này KHÔNG bày cùng lúc với năm sân.** Bấm `Training` thì cả sáu biến mất, thay
> bằng một hàng năm sân kèm nút `Back`, và cái nhãn ở góc trên trái đổi từ `Career` sang
> `Training` (`[ẢNH]` `uma/key/w_285.jpg` so với `w_435.jpg`). Ghế Nóng bản trước dàn cả
> mười nút cùng lúc — nhìn thì tưởng đầy đủ, nhưng nó xoá mất nhịp "chọn việc → chọn sân"
> và chiếm hết chỗ của khung cảnh. Mục 1.2 và 1.12 đã viết đúng từ vòng nghiên cứu đầu;
> cái sai nằm ở chỗ **dựng game không theo tài liệu của chính mình**.

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

### 1.12 Màn Home — đếm đúng từng nút

`[ẢNH]` `uma/steam/shot04.jpg` và `uma/sheets_career/sheet001.jpg` (ô 0,0):
trên cùng `LEAP RANK B2 144402`, `TP 76/100` (vé chơi), `RP 5/5`, tiền `5.380`, cà rốt `752`.

Trong khung game, từ dưới lên — **đây là toàn bộ số nút của màn ngoài, không có gì khác**:

| nhóm | số nút | tên |
|---|---:|---|
| thanh dưới | **5** | Enhance · Story · **Home** · Race · Scout |
| nút tròn nhỏ nổi phía trên thanh ấy | **3** | Club · Concert Theater · Shop |
| nút lớn đứng riêng | **1** | **CAREER** |

Nút giữa (Home) to hơn bốn nút kia và tô xanh. **CAREER không nằm trong thanh dưới** — nó là một
khối riêng, to, viền vàng, có ba nhân vật đứng trên. Đó là cách Uma nói "đây là việc chính, năm
nút kia là việc phụ" mà không cần một dòng chữ nào.

Bản PC còn một cột rail dọc ở rìa phải (Jukebox · Sparks · Log · Career Profile · Agenda ·
Item Request · Menu) và một PANEL giữa khung game với rail — panel ấy đổi nội dung theo ngữ
cảnh: Menu ở màn Home, **Sparks** khi đang chọn kế thừa, **Log** khi đang trong ca.

### 1.13 MỘT RUN LÀ MỘT CHẾ ĐỘ RIÊNG — và bốn bước để vào

`[ẢNH]` `uma/sheets_guide/sheet001.jpg`, `sheet003.jpg`

Đây là chỗ đọc thiếu ở vòng nghiên cứu đầu, và nó là **cấu trúc lớn nhất của Uma**:

> Ở màn ngoài, bạn là NGƯỜI QUẢN LÝ TÀI KHOẢN: kho thẻ, gacha, gia phả, danh vọng.
> Bấm CAREER là bước vào MỘT RUN. Trong run, màn ngoài **biến mất hoàn toàn** — không còn
> thanh năm nút, không còn kho, không còn gacha. Hết run thì run ấy **đóng lại vĩnh viễn**,
> để lại một hồ sơ vào kho, và bạn về màn ngoài.

Bốn bước để vào, mỗi bước một màn con, **thanh năm nút vẫn nằm đó** và luôn có `[Back]`:

| bước | màn | nội dung |
|---|---|---|
| 1 | **Scenario Select** | chọn kịch bản (URA Finale…), có mô tả dài → `[Next]` |
| 2 | **Trainee Select** | người đang chọn hiện TO ở trên (sao, tên, 5 chỉ số /1200, bảng năng khiếu Track/Distance/Style), dưới là lưới thẻ đã có + bộ lọc → `[Next]` |
| 3 | **Legacy Select** | hai ô `1st Legacy` / `2nd Legacy`, lưới hồ sơ cũ có hạng và điểm, tab `Veteran Umamusume` / `Guests`, góc phải hiện **Affinity** → `[Confirm]` |
| 4 | **Support Formation** | `Deck 1` với **6 ô thẻ hỗ trợ** (mỗi ô ghi bậc SSR/SR và `Lvl 30`), dưới là bảng đếm theo loại (`×3 tốc, ×1 bền…`), `[Reset]` `[Auto-Select]` → `[Back]` **`[Start Career!]`** `[Perks]` |

Ở bước 3 và 4, **panel bên phải là `Sparks`**: liệt kê từng spark sẽ thừa hưởng, mỗi dòng một
dải màu và số sao — xanh = chỉ số, hồng = năng khiếu, xám = kỹ năng, xanh lá = kịch bản.

Trong run, panel phải là **Log**, và rail có thêm **Career Profile** — một tờ tóm tắt run: chỉ số
hiện tại, **cây kế thừa** (2 cha mẹ, mỗi người lại có 2 ông bà), 6 thẻ hỗ trợ, Perks, và
`Event Bonus Total`. Tức là mọi thứ mình đã chọn ở bốn bước trên, xem lại được bất cứ lúc nào.

`[ĐO TRONG REPO]` Ghế Nóng bản trước sai cả hai tầng: màn ngoài có TÁM nút bằng nhau trong đó
"Ca huấn luyện" chỉ là một tab, và bảng xếp hạng của mùa — thứ chỉ tồn tại trong một run — lại
sống ở màn ngoài (`G.mua()` tự dựng một mùa mới bất cứ lúc nào có ai hỏi tới). Mở game lên chưa
vào ca nào đã thấy "Hạng 11/12 · 0 trận". Sửa: mùa **mở ở `batDauCa()`, khép ở `G.ketCa()`**,
và `G.mua()` chỉ còn đọc chứ không dựng. Đo lại: ngoài ca trả `null`; ca 1 ra mùa 1; kết ca thì
mùa biến mất; ca 2 ra mùa 2 với **lịch bốc khác hẳn**.

---

### 1.14 NÂNG CẤP THẺ — `Lv強化` và `上限解放`

`[ẢNH]` `uma/yt/gacha.mp4` giây **438 → 462** (cắt bằng
`ffmpeg -ss <t> -i yt/gacha.mp4 -frames:v 1 -vf "crop=396:720:438:0"` — khung quay điện thoại
nằm ở dải giữa của video 1280×720, cắt đúng dải ấy ra mới đọc được chữ).

#### Cửa vào: `強化編成` (Enhance) — nút số 1 của thanh dưới

Bấm vào là ra một màn có **ba lối**, không hơn:

| lối | là gì | Ghế Nóng |
|---|---|---|
| `育成ウマ娘` | người sẽ được nuôi trong run | Huấn luyện viên |
| `サポートカード` | thẻ hỗ trợ đi kèm | Tuyển thủ |
| `殿堂入りウマ娘` | những người đã tốt nghiệp, để làm kế thừa | Gia phả |

Bấm `サポートカード` thì nó **xoè ra năm nút con**: `Lv強化` · `上限解放` · `編成` (xếp đội) ·
`保管室` (kho chứa) · `一覧` (xem hết). Tức là Uma tách **hai việc nuôi** ra thành hai cửa
riêng, và cũng dành hẳn một cửa cho **kho chứa bản trùng**.

#### Màn `Lv強化` / `上限解放` — hai tab, chung một nửa trên

Hai cửa ấy dẫn về **cùng một màn**, đổi nhau bằng hai tab ở đỉnh. Nửa trên **không đổi theo tab**:

- trái: cái thẻ đang nuôi (bậc SSR, trái tim yêu thích, tên `[不沈艦の進撃] ゴールドシップ`, nút `詳細`);
- phải: **danh sách bốn bậc trần** — `レベル上限解放 (Lv35)` · `(Lv40)` · `(Lv45)` · `(Lv50)`,
  mỗi dòng có **dãy kim cương ◆** đếm bậc (1·2·3·4 viên) và bậc nào lấy rồi thì đóng dấu
  `獲得済み`.

Nửa dưới đổi theo tab:

- **`Lv強化`** → lưới thẻ của mình để **cho ăn** (mỗi ô ghi `Lv50 / Lv30 / Lv1`), kèm bộ lọc
  `絞り込み:OFF` `レアリティ` `降順`, nút `選択`.
- **`上限解放`** → thanh `上限解放段階を選択` với **‹ ›** và dãy bốn viên kim cương, rồi
  **một ô vật liệu duy nhất**: đúng **một bản trùng của chính thẻ ấy**, đếm `0/1`. Thiếu thì
  hiện `枚数が足りません` (không đủ số lượng) và nút `上限解放` xám đi.

Tức là: **trần cấp `30 → 35 → 40 → 45 → 50`, bốn bậc, mỗi bậc ăn ĐÚNG MỘT bản trùng.**

#### Bản trùng KHÔNG tự dùng

Màn kết quả quay ghi rõ ở chân:
`すでに所持しているサポートカードは保管室に送られます` — *thẻ đã có thì được gửi vào kho chứa*.
Bản trùng nằm đó chờ, người chơi phải tự mang tới màn `上限解放` mà tiêu.

Chi tiết này nhỏ mà đổi hẳn cảm giác chơi: quay ra một bản trùng **vẫn là một phần thưởng
nhìn thấy được**, và việc tiêu nó là một quyết định (dồn cho thẻ nào trước). Nếu hệ thống tự
cộng ngay lúc quay thì người chơi chẳng bao giờ gặp cái quyết định ấy, và cũng không học được
"◆" nghĩa là gì.

`[ĐO TRONG REPO]` Ghế Nóng bản trước tự cộng `uncap` ngay trong `G.nhanTT` / `G.nhanHLV`, và
toàn bộ hệ thống hiện ra bằng đúng một mẩu chữ `✦2` trên góc thẻ. Đã sửa theo Uma:

- `G.nhanTT/nhanHLV` cộng `manh` (mảnh trùng) thay vì cộng thẳng `uncap`;
- `G.coMoTran(ban)` · `G.moTran(ban)` · `G.doiManh(ban, loai)` trong `js/save.js`;
- màn **Nuôi thẻ** thành cửa Enhance có **ba tab** đúng ba kho của Uma, và ba tab ấy chính là
  ba trang đã có (`nuoi` · `hlv` · `giapha`) chứ không đẻ thêm trạng thái — nếu thêm một biến
  `tabNuoi` nữa thì có hai nguồn sự thật cho cùng một câu hỏi, kiểu gì cũng có lúc lệch;
- hộp nuôi thẻ có **hai tab** (`Lên cấp` · `Mở trần`) và **bảng bốn bậc trần luôn hiện ở cả
  hai tab** — đây là chi tiết quan trọng nhất chép được: đang bấm lên cấp vẫn thấy trần tiếp
  theo nằm ở đâu;
- chấm đỏ trên nút Enhance ở thanh dưới đếm số thẻ **đang mở trần được** — Uma gắn đúng cái
  chấm ấy lên `メニュー`, và nó là lý do người chơi mở màn nuôi ra xem.

Đo lại bằng máy (`scratchpad/kiem_enh.js`):
`{"b1_manh":1,"b1_uncapVanLa0":true,"b2_moTran":1,"b2_tranNoi":5,"b2_khongDuThiKhongMo":0,`
`"c1_tenTab":["Tuyển thủ","Huấn luyện viên","Gia phả"],"c2_soBac":4,"c2_soTabHop":2,`
`"e1_huyHieu":"1","e2_nav":5,"e2_tron":3,"e2_career":1}` — số nút ngoài vẫn đúng **5 + 3 + 1**.

**Chỗ không khớp, và xử ra sao.** Uma lên cấp thẻ bằng cách **cho thẻ khác ăn**; Ghế Nóng lên
cấp bằng **xu** và bằng **kinh nghiệm chạy hết một mùa**. Giữ nguyên đường xu/kinh nghiệm, vì
kho thẻ ở đây nhỏ hơn Uma rất nhiều — bắt ăn thẻ khác thì người chơi sẽ không còn thẻ để xếp
đội. Cái chép 100% là **phần mở trần**: bốn bậc, một mảnh một bậc, bảng bậc luôn nhìn thấy.

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

### 2.15 Bảng xếp hạng và bản tin — đọc từ ảnh `tfm2/sheets/sheet007` và `sheet008` `[ẢNH]`

**Rankings** có ba tab: `League · International · Career`, kèm hai ô chọn `Korea` và `2026`.
Tiêu đề bảng: *2026 KR Div 1 Spring*. Trên bảng là một dải năm ô dẫn đầu: `MVP · Kills ·
Assists · Solo Kills · Avg Rating`. Bảng chính đúng sáu cột:

```
Rankings | Team | Matches | Wins | Losses | Set Diff
```

Mười đội, mỗi đội có logo nhỏ bên trái tên. `Set Diff` là hiệu số **ván** (không phải mạng),
hiện dạng `+0`.

**News** (ảnh `sheet008`): danh sách bên trái nhóm **theo ngày** (`Wednesday, 1, 1, 2026 (3)`
— con số trong ngoặc là số tin của ngày đó), mỗi dòng có nhãn loại ở trên (`Transfer Market
News`, `Scouting Report`, `Weekly Solo Rank Analysis Report`, `Transfer Offer for …`,
`Practice Match Request from …`) và giờ ở bên phải (`09:00`). Chọn một tin thì **khung bên
phải** hiện tiêu đề, thân tin, và thẻ nhân vật liên quan kèm hợp đồng.

**Schedule** (ảnh `sheet007`) là lịch tuần: mỗi ô là một trận `2026 KR Div 1 Spring Round 1 /
HANJIN BRION vs DN SOOPers`.

Cột trái của TFM2 có 15 mục: `News · Roster · Coaching Staff · Training · Schedule · Rankings
· Recruitment · Solo Rank · Facilities · Finance · Team Info · Game Info · Statistics ·
Records · Gaming House`.

> `[ĐỀ XUẤT]` Ghế Nóng lấy sáu cột của Rankings và thêm **cột phong độ 5 trận** (`TTHTT`) —
> thứ hạng cho biết họ ở đâu, phong độ cho biết họ đang đi lên hay đi xuống, và đó mới là
> thông tin dùng được lúc chuẩn bị gặp họ. Bỏ ô chọn khu vực/năm vì chỉ có một giải quốc nội
> và một bảng thế giới.

### 2.16 Buff theo vị trí — đọc nguyên văn từ `Game Info → Game Rules` `[ẢNH]`

```
Top      Restore 1% of max HP every second
Jungle   +20% movement speed when out of combat in the jungle.
         Execute epic monsters on hit when their HP is at or below 700
Mid      +20% experience gained
Bottom   +20% gold gained
Support  -30% experience and -10% gold gained. On last hit, the nearest ally receives the gold
```

`[ĐO TRONG REPO]` Ghế Nóng có **đủ cả sáu**, cài ở `js/sim.js`:

| buff | chỗ cài |
|---|---|
| Top hồi 1.5% máu/giây ngoài giao tranh | vòng `tran.nguoi.forEach`, mốc `tran.t - n.lanCuoi > 6` |
| Jungle +20% tốc chạy ngoài giao tranh | cùng vòng đó, `n.vt === 'rung'` |
| Jungle **hành quyết** quái lớn khi máu ≤ 700 | sau đòn đánh thường, chỉ áp cho thứ có `hienRa` (tức Rồng / Chúa Hang), không áp cho tướng hay trụ |
| Mid +20% kinh nghiệm | `chiaExp()` |
| Bottom +20% vàng | `xuLyChet()` nhánh lính |
| Support −30% kinh nghiệm, −15% vàng, **chuyển vàng last-hit** | `chiaExp()` và `xuLyChet()`: hỗ trợ ăn lính thì tiền sang tay đồng đội gần nhất trong 520 đơn vị |

Cái hành quyết là thứ đổi hẳn cách tranh mục tiêu: bên nào có người đi rừng đứng gần là
Rồng của bên kia mất, không cần đếm sát thương nữa.

---

## 3. Những chỗ hai game **không** đưa được cho mình

1. **Uma không có ban/pick**, TFM2 **không có gacha/kế thừa**. Chỗ nối hai hệ là phần phải tự thiết
   kế: HLV (vai Uma) huấn luyện, tuyển thủ (vai support card) vừa nuôi vừa ra trận. Xem `DESIGN.md`.
2. **TFM2 chạy trên PC** với bản đồ MOBA đầy đủ 5 lane + rừng, 60fps. Trên web/di động ngang phải rút
   gọn — xem mục "mô phỏng nhẹ" trong `DESIGN.md`.
3. Uma là **dọc** (điện thoại), TFM2 là **ngang** (PC). Game này **ngang toàn bộ** → mọi màn kiểu Uma
   phải bố trí lại thành **3 cột**.

---

---

## 4. Đo cân bằng bằng máy — cái đoán sai và cái đo ra

Phần này không lấy từ hai game nguồn. Đây là **số đo trên chính game này**, và quan trọng hơn: là
danh sách những chỗ tưởng đã làm mà thật ra chưa chạy. Ghi lại để lần sau đừng tin mắt.

### 4.1 Bộ đo

Bốn tệp trong `_tools/`, chạy được từ `file://` lẫn từ bản trên Pages:

| tệp | đo cái gì | lệnh |
|---|---|---|
| `lai.js` | lái Chrome headless bằng CDP, in mọi lỗi trang, chụp ảnh | `node _tools/lai.js <url> ra.png 6 [--dofile=x.js]` |
| `tuchoi.js` | **tự chơi hết một mùa** qua giao diện thật, báo cáo đường đi và mọi lỗi | `--dofile=_tools/tuchoi.js` |
| `duongcong.js` | đường cong chỉ số theo ba lối chơi (dồn/tham/đều) so với sức đội máy | `--dofile=_tools/duongcong.js` |
| `tileThang.js` | **tỉ lệ thắng từng giải** trong mùa, đúng thể thức Bo1/Bo3/Bo5 | `--dofile=_tools/tileThang.js` |
| `canbang.js` | tỉ lệ thắng từng tướng (bảng Champ Stats của TFM2) | `node _tools/canbang.js 500` |

`tileThang.js` cần `G._thu` — cửa sau chỉ-đọc ở cuối `giai.js` để dựng đội máy và cấu hình trận y
như lúc chơi thật. Không có nó thì phải dựng lại một bản "gần giống" rồi đo nhầm.

### 4.2 Năm chỗ hỏng mà chỉ số đo mới lộ ra

Trước khi đo, game **thua 0/40 ở cả tám giải**. Không phải một lỗi, là năm lỗi cộng lại:

1. **Bản đồ không đối xứng.** Kèo hoàn toàn cân (cùng tướng, cùng chỉ số, cùng thông thạo) mà bên
   xanh chỉ thắng **8/30**, phá 3.5 trụ so với 6.4. Ba đường trong `sim.js` được vẽ tay nên lệch
   nhau vài chục điểm ảnh, và tám bãi quái đặt theo **đối xứng tâm** trong khi ba đường lại gần
   **đối xứng qua đường chéo y = x**. Hai kiểu đối xứng đánh nhau, không kiểu nào đúng.
   → Chốt: **mọi thứ đối xứng qua y = x**. Điểm thứ *i* của một đường, lật `(x,y)→(y,x)`, phải
   trùng điểm thứ *(n−1−i)* của chính đường đó. Bãi quái đỏ = ảnh lật của bãi xanh, không đặt tay.
   Sau khi sửa: **10–11/20, mạng 52–52**.
   *Bài học*: sai số hình học vài phần trăm không tự triệt tiêu qua 20 phút đánh nhau — nó cộng dồn.
   Kiểm đối xứng bằng **vòng lặp so toạ độ**, đừng kiểm bằng cách nhìn ảnh.

2. **LỰC và BỀN không được bộ mô phỏng đọc.** `grep "cs\." sim.js` chỉ ra `co`, `li`, `nao` —
   hai trong năm giáo án là **tập không công**, trái hẳn §2.1 của `DESIGN.md`. Cả một mùa nuôi quân
   gần như không đổi được kết quả trận: chỉ số lệch hết cỡ (1200 so với 100) mà chỉ thắng 16/20.
   → Đưa vào `chiSoNguoi()` một chỗ duy nhất: LỰC ±14% sát thương và tốc farm, BỀN +14% máu kèm
   chống tụt sức sau phút 18, CƠ +12% tốc đánh. Sau khi sửa: 1200 so với 100 → **20/20**.

3. **Bùa Chúa Hang không bao giờ hết hạn.** `tran.buff[doi].linh = tran.t + 60` ghi mốc hết hạn,
   nhưng chỗ đọc lại là `tran.buff[doi].linh ? 1 : 0` — tức là **đội ăn Chúa Hang đầu tiên có lính
   mạnh 1.4× tới hết trận**. Đây là lý do biểu đồ vàng luôn gãy ở phút 7–8, đúng lúc Chúa Hang hiện
   ra lần đầu.

4. **Đội máy nào cũng có bốn người thông thạo UR.** `taoDoiMay()` phát UR/SSR cho mọi đội, kể cả
   Mèo Đá ở giải đầu tiên, trong khi **năm thẻ khởi đầu của người chơi cao nhất chỉ SR**. Người chơi
   vào giải nào cũng lép vế một bậc thông thạo.
   → Bảng thông thạo theo **bậc giải**: bậc 1 `R/R/N/N` … bậc 5 `UR/SSR/SSR/SR`.

5. **Thang thông thạo ăn trùm cả mùa huấn luyện.** Thang cũ `0.82 … 1.22` nhân thẳng vào mọi chỉ số
   chiến đấu: UR gặp N thắng 20/20, còn chỉ số huấn luyện lệch hết cỡ chỉ thắng 16/20 — nghĩa là
   một dòng bảng thông thạo đáng hơn cả 24 lượt tập.
   → Thu về `0.90 … 1.12`. Vẫn đáng để **cấm theo người**, nhưng không còn quyết định thay người chơi.

### 4.3 Số chốt sau khi cân (đo trên bản đã sửa)

**Sức đội máy** (`data-giai.js`, thang 0–1200 quy đổi): vòng bảng 58–74 · play-off và chung kết
quốc nội 150–186 · CKTG 258–288 · chung kết 330–352.

**Đường cong chỉ số** — 24 ca, chọn giáo án theo tổng chỉ số ăn được × (1 − tỉ lệ hỏng):

| lối chơi | trung bình 5 chỉ số ở lượt 24 | chỉ số cao nhất | thứ hai |
|---|---|---|---|
| dồn (bám 2 giáo án) | 371 | **1137 (A+)** | 334 (E) |
| tham (lượt nào ăn nhiều nhất) | 370 | 1111 (A+) | 330 (E) |
| đều (xoay vòng cả 5) | 278 | 381 (E+) | 322 (E) |

Đúng ý "phải chọn": dồn thì có một chỉ số hạng A+, dàn đều thì cả năm hạng E.

**Tỉ lệ thắng từng giải** — 40 lần mỗi giải, **chỉ với năm thẻ khởi đầu, không gacha, không mua kỹ
năng, không kế thừa**. Người chơi thật sẽ cao hơn:

| giải | thể thức | thắng |
|---|---|---|
| Vòng bảng lượt 1 | Bo1 | 75% |
| Vòng bảng lượt 2 | Bo1 | 85% |
| Play-off quốc nội | Bo3 | 73% |
| Chung kết quốc nội | Bo3 | 85% |
| CKTG tứ kết | Bo3 | 63% |
| CKTG bán kết | Bo5 | 65% |
| CKTG tranh vé | Bo5 | 45% |
| **CHUNG KẾT THẾ GIỚI** | Bo5 | **28%** |

Vô địch cả mùa ngay lần đầu ≈ **2.4%** (chưa tính vé cứu). Đúng mức "hiếm nhưng có thật" của một ca
Uma đầu tiên.

**Tướng** (`node _tools/canbang.js 500`): cả 20 con nằm trong 41.2% – 58.1%, không con nào lệch quá
12% so với 50%. Một trận trung bình 19.6 phút, 92 mạng, 62k vàng hai đội — khớp với số đọc được từ
ảnh chụp TFM2 ở §2.12.

### 4.4 Bẫy công cụ trong đợt đo này

- **Không có `puppeteer` trên máy.** Node 22 đã có `WebSocket` trong lõi nên lái Chrome bằng CDP
  chỉ mất ~120 dòng (`_tools/lai.js`, chép từ `games/deepcore/_tools/drive.js`). Đừng cài gói vào
  một repo HTML tĩnh.
- **Hộp thoại sự kiện đặt nút trong `.hop-than`, không phải `.hop-chan`.** Kịch bản tự chơi bản đầu
  chỉ quét `.hop-chan button` nên bấm 2176 lần mà hộp không đóng, tập được 4 lượt trong 4 phút.
  Quét cả `#lop-phu button` và **bỏ qua nút `.do`** (bỏ ca / xoá bản lưu).
- **`Math.min`/`sort` với `undefined` không báo lỗi**, chỉ trả `NaN` rồi để nguyên thứ tự — bảng
  thông thạo sai mà không văng ra. Luôn `|| 0` trong hàm so sánh.
- **Ảnh chụp màn trận bị hộp dạy chơi che.** Truyền `--do="(function(){var b=window.$('#lop-phu button');if(b)b.click();return 1;})()"`.
- **`#tran:<số tick>`** chạy sẵn n tick rồi mới mở màn — cách duy nhất chụp được trận đang giữa chừng.
- **Sông vẽ trùng đường giữa.** Sông cũ chạy từ (30,970) tới (970,30) — đúng hướng đường giữa nên
  đè mất nó. Sông phải chạy theo **đường chéo còn lại**, qua đúng chỗ hai con quái lớn.

---

## 5. Kho art Soul Knight — dò được gì, cắm vào đâu `[ĐO TRONG REPO]`

Kho ở `~/Downloads/sk-ref` (ngoài git, **không commit** — xem
`games/repo2d/art/room/SOULKNIGHT-TILEMAP.md`). Ba thư mục dùng được:

| thư mục | có gì | dùng cho |
|---|---|---|
| `sprites/` | 10.894 hình phẳng của bundle `common` + `weapon` | trang bị, đạn, hiệu ứng |
| `all/<bundle>/` | 94.070 hình, chia theo AssetBundle | `defence` (trụ), `boss` (Rồng, Chúa Hang) |
| `tilemap/sprites/level__1__a/` | tầng **RỪNG** | lính, quái rừng |

### 5.1 Cách dò: bảng liên hoàn có đánh số

Tên tệp trong kho **không nói gì** (`weapons5_45.png`, `____3_1.png`, `enemy27_0.png`) nên
không thể chọn bằng cách grep. Viết `_tools/bang.py` dán một dãy sprite thành ảnh lưới
10 cột **có in số thứ tự lên từng ô**, xem ảnh rồi tra số về tên tệp:

    python _tools/bang.py ~/Downloads/sk-ref/sprites "weapons5_*.png" ra.png 120 96 > ra.txt

120 ô một bảng, ô 96px — đủ to để đọc số. Nhiều hơn thì số bé không đọc nổi, ít hơn thì
phải xem quá nhiều bảng.

### 5.2 Chốt lại đã lấy gì

- **Trụ** — bundle `all/defence` (chế độ thủ thành). Tên tệp gốc là tiếng Trung, bị lọc
  còn toàn dấu gạch dưới; ghi lại đây để lần sau khỏi dò 510 hình nữa:
  `____1__2.png` tháp pha lê nhỏ · `_____2__4.png` tháp lớn có đèn · `______1.png` khối pha lê.
- **Hai bên KHÔNG lấy hai hình khác nhau.** Bên đỏ là bản **nhuộm** của chính hình bên
  xanh (`nhuom_do()`: xoay hue 180°, bỏ qua pixel bão hoà < 0.18 để giữ chất kim loại xám).
  Cùng bóng dáng thì người xem đọc ra "trụ đối xứng"; khác dáng thì đọc ra "hai công trình".
- **Lính / quái rừng** — `level__1__a`: `enemy22` orc khiên (lính cận), `enemy23` orc cung
  (lính xa), `enemy20` nấm, `enemy27` lợn rừng, `enemy29` rùa, `enemy_fire_sacrifice` yêu tinh.
  Chỉ lấy **4 khung đầu**: khung cuối mỗi bộ là khung nằm chết, lồng vào vòng đứng yên thì
  con vật gục xuống một nhịp.
- **Rồng** `boss/boss12` (dơi bay có sừng) · **Chúa Hang** `boss/boss05` (thú sừng tím).
- **Đạn** — `bullet2_69` tia cam (đòn thường), `bullet403` mũi tên, `bullet_laser_light2`
  cầu tím (phép), `bullet2_5` mảnh băng, `bullet2_68` tia độc, `bullet_laser_light_1` cầu xanh (trụ).
- **Hiệu ứng** — `effect_axe_0..5` lưỡi trăng lam (vệt chém), `bullet_eye_0..4` vết cào,
  `effect_2_*` tia lửa trúng đòn, `effect_0_*` chớp sao, `bullet_druid_s8_0_*` lốc xoáy.

### 5.3 Ba cái bẫy đã sập

1. **`dat()` chỉ THU, không PHÓNG.** Sprite Soul Knight chỉ 18–22px; dán nguyên cỡ vào ô
   atlas 64px thì trong trận con lính bé như hạt gạo, nhìn tưởng thiếu art. Phải có
   `he_phong()` phóng cho gần đầy ô — và **một hệ số chung cho cả bộ khung**, tính từ khung
   to nhất, chứ mỗi khung tự co giãn thì con vật phình ra thu vào theo nhịp hoạt ảnh.
2. **`int(k)` khi k = 1.9 là đứng nguyên cỡ.** Phóng bội số nguyên cho nét pixel, nhưng chỉ
   khi bội số ≥ 2; dưới đó phải chịu phóng lẻ. Không thì con orc khiên (k=3) đứng cạnh con
   orc cung (k=1.9→1) to nhỏ khác hẳn nhau.
3. **`fx.png` xếp NGƯỢC với các atlas khác.** Bản cũ: cột = khung, hàng = khoá — trong khi
   `tuong.png`/`quai.png` là cột = khoá, hàng = khung, nên `veFX` phải tra chéo. Đã thống
   nhất một luật cho cả bảy tệp: **cột = khoá, hàng = khung**.

Thêm một cái nữa, ở phía DOM: **sprite canh ĐÁY-GIỮA thì không dán nguyên ô vào thẻ HTML
được.** Nhân vật chỉ chiếm nửa dưới ô 64px, dán cả ô vào thẻ 42px thì người bé tí nằm dưới
đáy. `G.anhTuong(id, cao, tren)` cắt lấy dải từ `tren`% trở xuống (mặc định 24%) rồi phóng
cho đầy — đó là lý do màn cấm chọn trước đó nhìn như thiếu art.

Món dài mà mảnh (kiếm, trượng) dán ngang chỉ chiếm một dải giữa ô, trông như cọng tăm; bảng
`DO` có cột **góc xoay**, xoay 45° cho lưỡi kiếm chạy hết đường chéo. Xoay thì phải **phóng
4× trước rồi mới xoay**, xoay ảnh 10px bằng NEAREST thì răng cưa ăn mất nửa lưỡi.

---

## 6. Đợt soi lại cả game — cái đã khai mà chưa ai chạy `[ĐO TRONG REPO]`

Lỗi hay gặp nhất của repo này không phải lỗi chạy sai, mà là **hệ thống được khai đầy đủ
trong bảng dữ liệu nhưng bộ mô phỏng không hề đọc**: không lỗi, không cảnh báo, chỉ là bảng
mô tả hứa với người chơi một thứ không tồn tại. Đợt trước đã bắt được LỰC/BỀN, bốn nhóm
chiến thuật, atlas `fx.png` và cấp thẻ. Đợt này viết một bộ soi (`_tools/`-ngoài-repo, xem
mã trong lịch sử) rà tự động:

1. Mọi khoá `G.<tên> = …` rồi đếm số lần được ĐỌC ở nơi khác.
2. Mọi khoá trong `noi.h` của `data-tuong.js` đối chiếu với `sim.js`.
3. Mọi thẻ `dac` của `data-trangbi.js` đối chiếu với `sim.js`.

### 6.1 Ba trang bị chỉ là cục chỉ số

`cs.dac` mang bảy thẻ, `sim.js` đọc **một** (`domino`). Bốn thẻ khác thực ra có chạy nhưng
dò bằng **id món** (`n.do.indexOf('luoi4')`), còn ba thẻ này thì không ai đọc:

| món | thẻ | bảng mô tả hứa | thực tế trước khi sửa |
|---|---|---|---|
| Quạ Hoàng Hôn | `chan_phep` | chặn một kỹ năng, 60 giây/lần | `satThuong()` đọc `bi.hieu.chanPhep` nhưng **không ai gán** nó |
| Màn Huỷ Diệt | `giam_hoi` | địch quanh mình giảm 40% hồi máu | không có dòng nào |
| Tiên Tri Vực Thẳm | `no_dien` | kỹ năng +12% sát thương | không có dòng nào |

Đã đưa **cả bảy** về một cửa duy nhất — hàm `coDac(n, thẻ)` đọc `G.TB_THEO_ID[id].dac`.
Dò bằng id món thì đổi id hay thêm món mới là sót ngay, mà sót kiểu này không ai thấy.

Cái chặn kỹ năng phải đặt **trước** khi tính sát thương, trong `dungChieu()`, để chặn luôn
cả choáng/làm chậm đi kèm — chặn sau thì người chơi bị khống chế xong mới thấy "chặn được".

### 6.2 Hai cái chặn trong `nghiDo()` không bao giờ đúng

```js
['thep','lua'].forEach(n => { if (soMon[n] >= 2) uu[n] *= 0.25; });   // chết
['luoi','gio','ngoc'].forEach(n => { if (soMon[n] >= 3) uu[n] *= 0.3; });  // chết
```

Mỗi nhánh là một **đường ghép**: mua tầng sau thì `n.do.splice()` bỏ tầng trước. Nên
`soMon[nhánh]` không bao giờ vượt **1** và hai dòng trên không bao giờ chạy. Hệ quả kéo dài:

- Một người chỉ giữ tối đa **5 món** (một món mỗi nhánh), mà thẻ tuyển thủ trong trận vẽ
  **6 ô** → ô thứ sáu vĩnh viễn trống, nhìn như đang thiếu đồ. Đã sửa còn 5 ô.
- Không có gì thưởng cho việc ĐI HẾT một đường, nên ai cũng rải mỗi nhánh một món tầng 1–2.
  Đo 30 trận: Màn Huỷ Diệt ra **0** lần, Thành Trì Bất Khả ra **2** lần — tức là bốn món
  tầng 4 gần như không tồn tại trong game.

Thay bằng: cộng `0.45 × tầng đang có` vào điểm ưu tiên của nhánh ấy, và giảm 60% cả hai
nhánh thủ nếu đã mở cả hai. Đo lại 40 trận: cả 20 món đều xuất hiện, tầng 4 ra
`luoi4 103 · gio4 12 · ngoc4 14 · lua4 3 · thep4 1`.

Hệ số này là một cái dao hai lưỡi: để **0.9** thì đội nào giàu hơn ăn món tầng 4 trước và
cuốn luôn trận — tỉ lệ vô địch thế giới tụt từ 25% xuống 13%. 0.45 vừa đủ.

### 6.3 Buff `atk`/`ap` là số CỘNG THẲNG, các buff khác là PHẦN TRĂM

`chiSoNguoi()` trước đây:

```js
atk: ((cs.atk + d.atk) * he + b.atk) * kL,          // cộng thẳng
giap: (cs.giap + d.giap) * he * (1 + (b.giap||0)),  // phần trăm
```

Nên một chiêu khai `buff: { atk: 0.30 }` chỉ cộng **0.3 điểm công** — chiêu vô dụng mà
không có dấu hiệu gì. Đã thống nhất: **mọi khoá buff là phần trăm**.

### 6.4 Cân lại 20 tướng sau khi ba trang bị kia sống lại

`_tools/canbang.js 400`, mỗi tướng ~200 trận. Trước khi cân, bốn con lệch quá 9%:

| tướng | trước | sửa | sau |
|---|---|---|---|
| Pháp Sét | 37.3% | choáng mỗi 3 đòn thay vì 4; Tia Chớp 0.70→0.92 hệ số; Bão Sét 3→4 nhịp | 46–50% |
| Thánh Kiếm | 39.7% | nội tại 0.55→0.75 giáp; atk 88→92; Thánh Vực 3.5→4.5%/giây | 47–51% |
| Phá Cổ | 59.9% | Búa Nặng 4%→3% máu tối đa mỗi đòn | 53–56% |
| Kỵ Nhân | 59.4% | Xung Thương 1.20→1.05 hệ số | 51–53% |

Vòng hai kéo bốn con nữa về giữa: Nhạc Sĩ 43.2→50.0, Cuồng Chiến 42.9→50.0 (phải sửa lỗi
6.3 trước, không thì buff không có tác dụng), Hiệp Sĩ 57.5→54.3, Bom Xích 56.8→54.3.

**Cân tướng làm mùa giải KHÓ HƠN, không phải dễ hơn.** Đo `_tools/tileThang.js`: chung kết
thế giới từ 30% xuống 8%. Vì bộ đo cho người chơi pick trước, đội máy lấy phần còn lại —
nên mấy con vốn quá mạnh chính là mấy con người chơi hay lấy, và 30% cũ được kê bằng sự
mất cân ấy. Chỗ chữa đúng là **độ sâu bảng thông thạo của đội máy**, không phải chỉ số tướng:
bậc 5 cũ `['UR','SSR','SSR','SR']` cho cả bốn tướng của một vị trí từ SR trở lên, tức cấm gì
họ cũng còn một con thạo. Đổi thành `['UR','SSR','SR','R']`: ngôi sao của họ vẫn bất khả xâm
phạm, nhưng cấm đúng con đó là kéo họ về mặt đất — đúng thứ màn cấm chọn đang mời người chơi làm.

### 6.6 Đường cong chốt lại sau đợt soi

| giải | thể thức | nhóm đội | thắng |
|---|---|---|---|
| Vòng bảng — Lượt 1 | Bo1 | ai_low | 75% |
| Vòng bảng — Lượt 2 | Bo1 | ai_low | 85% |
| Play-off quốc nội | Bo3 | ai_mid | 57% |
| Chung kết quốc nội | Bo3 | ai_mid | 75% |
| CKTG — Tứ kết | Bo3 | ai_hi | 43% |
| CKTG — Bán kết | Bo5 | ai_hi | 53% |
| CKTG — Tranh vé chung kết | Bo5 | ai_top | 25% |
| CHUNG KẾT THẾ GIỚI | Bo5 | ai_top | 20% |

`_tools/tileThang.js`, 40 giải mỗi dòng, lối chơi `tham`, thẻ tuyển thủ **bậc R chưa nuôi**.
Đó là mùa ĐẦU TIÊN: 20% vô địch thế giới ngay mùa một là đúng ý — thẻ lên cấp, huấn luyện
viên uncap và bảng thông thạo dày lên qua từng mùa mới là đường đi tới cúp.

Bộ đo dùng hạt giống cố định nên hai lần chạy ra y hệt. **Số không nhảy không có nghĩa là nó
chính xác** — 40 giải Bo5 vẫn là mẫu nhỏ, lệch 5% thì đừng vội sửa.

### 6.5 Bẫy công cụ: `lai.js` dùng cổng gỡ lỗi CỐ ĐỊNH

`const PORT = 9333`. Chạy hai bản đo song song thì bản thứ hai không bind được cổng, rồi nó
**attach vào browser của bản thứ nhất** — chụp ra ảnh của trang khác và kịch bản treo, không
báo lỗi gì. Đã sập một lần khi vừa đo cân bằng vừa chụp ảnh màn CLB: ảnh chụp ra là màn CLB
bản CŨ, làm tưởng CSS bị cache. Sửa: `PORT = 9200 + (process.pid % 700)`.

Bẫy thứ hai, cùng loại: `_tools/tuchoi.js` dò thẻ bấm được bằng `style*="cursor:pointer"`.
Đổi màn CLB sang lớp CSS là bộ dò ấy **chết lặng** — kịch bản đứng ở màn CLB tới hết giờ mà
báo `loi: []`, tức "không có lỗi". Bộ tự chơi phải dò bằng LỚP (`.uc-the.bam`), và khi nó
báo `luotDaTap: 0` thì đó là lỗi của bộ đo, không phải game đứng.

---

## 7. Khâu XEM TRẬN — đợt làm lại theo Teamfight Manager 2 `[ĐO TRONG REPO]`

Chủ dự án: *"phần simulate chưa tốt, quá nhanh, chưa đầy đủ anim. các kỹ năng riêng phải có
fx riêng, chưa dàn giống teamfight manager 2"*, và *"phải thể hiện rõ là tướng đang làm gì,
skill gì, có anim rõ ràng. lính đánh thường thì thêm cây spear vào cầm trên tay thọc thọc
nhau. bắn xa thì cầm súng, thấy rõ đạn. quái rừng cũng vậy, đều phải đầy đủ anim + fx chứ
không phải chỉ idle cho có lệ."*

### 7.1 "Quá nhanh" — đo ra con số

| | Ghế Nóng (cũ) | TFM2 ×1 | Ghế Nóng (mới) |
|---|---:|---:|---:|
| tick/giây thật ở ×1 | 40 | — | **12** |
| nhanh gấp mấy lần thật | **×10** | ~×1,4 | **×3** |
| một trận trung bình | 2 phút | ~11 phút | **6,5 phút** |

`[ĐO TRONG REPO]` Một trận dài trung bình **1166 giây trong trận** (10 trận, 915–1560).
Ở 40 tick/giây thì một tick (0,25 giây trong trận) trôi qua trong 25 ms — nhanh hơn một
khung hình. Nghĩa là **không có chỗ nào cho một cú vung tay dài 0,2 giây tồn tại**: mọi
động tác đều bị nuốt giữa hai khung. Chậm lại là điều kiện CẦN để có hoạt ảnh.

Nút tốc độ giờ là `0.5 · ×1 · ×2 · ×3 · ×6`. `0.5` cho ra ~1,5 lần thật, tức đúng nhịp ×1
của TFM2; `×6` cho lại đúng nhịp của bản cũ cho ai muốn xem vèo.

### 7.2 Nội suy — thứ phải có, không thì chậm lại chỉ càng lộ

Bộ mô phỏng chạy 12 lần/giây, màn hình vẽ ~56 khung/giây. Vẽ thẳng `x/y` thì người không
đi mà **nhảy** từng quãng 0,25 giây. Sửa: `tickTran()` chụp `px/py` ở đầu mỗi tick, phần
vẽ nội suy theo tỉ lệ đã đi của tick hiện tại.

`[ĐO TRONG REPO]` lấy một con lính (thứ đi liên tục), đo 90 khung liền:
`{"soBuocKhac0":89,"buocTB":0.5,"buocMax":2.85}` — **89/89 khung đều dịch chuyển**. Không
nội suy thì con số ấy phải là ~22/89 (chỉ nhảy ở mép tick).

Đổi lại là trễ đúng một tick = 0,25 giây trong trận. Không ai thấy.

### 7.3 Hoạt ảnh khi sprite gốc chỉ có bốn khung ĐỨNG YÊN

Sprite tướng lấy của HoloCure (`spr_<tên>_idle`) — bốn khung, đều là đứng. Không có khung
vung tay, và không thể vẽ tay 20 tướng × 5 trạng thái. Cách giải: **phép biến hình + một
lớp vũ khí rời**.

| trạng thái | bộ mô phỏng ghi gì | phần vẽ làm gì |
|---|---|---|
| đi | `px/py` khác `x/y` | nhún chân theo nhịp, khung chạy 7/giây thay vì 3 |
| ra đòn | `danhLuc`, `danhGoc` | chồm tới theo hướng đánh + vũ khí vung/thọc/giật |
| niệm chiêu | `niemLuc`, `niemTen`, `niemCuoi` | phình người, bọc sáng theo màu chiêu, **hiện tên chiêu trên đầu** |
| ăn đòn | `dinhLuc` | chớp trắng một nhịp (vẽ chồng ở `globalCompositeOperation='lighter'`) |
| chết | `chet > 0` | bia mộ + đếm giây hồi sinh tại chỗ ngã |
| hồi sinh | `hoiLuc` | luồng sáng dựng từ đất lên |

**Vũ khí cầm tay** (`art/vukhi.png`, 20 khoá) là mấu chốt. Ba nhóm ba động tác khác hẳn:

- **ĐÂM** (giáo, thương, dao) → thọc tới rồi rút về. Chủ dự án gọi đúng tên: *"thọc thọc nhau"*.
- **VUNG** (kiếm, rìu, búa) → quét một cung từ sau ra trước.
- **BẮN** (cung, nỏ, súng, bom, phi tiêu) → giật lùi một nhịp, khói đầu nòng, viên đạn bay ra.

Lính cận chiến cầm `thuong`, lính bắn xa cầm `sung_ngan`. Tướng tra `G.VUKHI_TUONG` theo id,
thiếu thì rơi về `G.VUKHI_LOP` theo lớp — **không bao giờ để tay không**.

### 7.4 Bốn mươi chiêu, bốn mươi bộ mặt

Bản trước cả 40 chiêu dùng chung hai hình: một vòng loang nếu `dien`, một tia nếu không.
Không thể vẽ 40 bộ sprite, nên `art/fx.png` giữ **26 DÁNG** gốc và `js/fx-chieu.js` ghép
*dáng + màu + kiểu bày* cho từng chiêu (khoá `'<id tướng>:chieu' | ':cuoi'`).

Mười một **kiểu bày**, mỗi kiểu một hàm vẽ riêng:

```
vong  vòng loang dưới chân      no    nổ tại mục tiêu
tia   chùm sáng tới mục tiêu    lao   lao/thọc tới mục tiêu
ban   một phát bắn có khói nòng roi   rơi từ trời, có vòng ngắm trước
mua   n phát rơi rải trong vùng xich  nảy gãy khúc qua nhiều mục tiêu
khoi  đám mây đọng lại          aura  hào quang quanh người / cả đội
chan  bong bóng khiên           hoi   lấp lánh hồi máu bay lên
```

Nhờ thế mà *Thiên Thạch* (rơi, cam, rung màn) và *Bão Sét* (mưa 6 phát, vàng) và *Tia Chớp*
(xích 3 nhịp) là ba thứ khác nhau hẳn, dù đều là chiêu phép diện rộng.

Kèm theo: **tên chiêu hiện ngay trên đầu người dùng** 1,25 giây, màu theo chiêu, chiêu cuối
có thêm dấu `★`. Đây là câu trả lời trực tiếp cho *"phải thể hiện rõ tướng đang làm gì,
skill gì"* — không cần đọc bảng số bên phải.

### 7.5 Kỹ năng riêng của huấn luyện viên — trước đây vô hình

Mười kỹ năng ở `G.KN_RIENG` vào tới bộ mô phỏng dưới dạng **một con số** trong `heso.ds`.
Người chơi chọn huấn luyện viên phần lớn VÌ kỹ năng ấy, mà cả trận không thấy nó xuất hiện
lần nào. Sửa:

- `hesoTu()` (giai.js) gắn kèm `heso.rieng = {id, ten, pha, dk}`;
- `knRieng()` (sim.js) canh đúng **mép bật lên** của điều kiện — vào giai đoạn của nó, hoặc
  đội bắt đầu bị dí về vàng — rồi bắn một hiệu ứng phủ cả đội;
- phần vẽ kéo một tia từ tâm đội tới từng người còn sống, kèm tên kỹ năng, và một dòng băng
  giữa màn `KỸ NĂNG HLV: <tên>`.

Chỉ là phần trình bày: không đụng con số nào, nên không đổi kết quả trận.

### 7.6 Quái rừng: `atk: 40` nằm trong dữ liệu từ đầu mà không chỗ nào đọc

Tám bãi quái đứng im cho người ta đập, không vung một cái — trong khi bản ghi của chúng đã
có sẵn `atk: 40`. Đúng cái lỗi lặp đi lặp lại của kho này (§6). Giờ chúng **đánh trả thật**,
có chồm tới, có vuốt, có thanh máu, và thở theo nhịp khi đứng yên.

Bốn bãi mỗi bên đối xứng nên thêm đòn đánh **không lệch cán cân hai đội**; nó chỉ làm người
đi rừng phải trả giá máu khi ăn bãi.

Quét mục tiêu mỗi tick cho 8 bãi × 10 người = 80 phép đo khoảng cách. Chốt lại: quét **hai
tick một lần** và trừ `q.danh` gấp đôi — bãi quái đánh 1,4 giây một đòn nên kết quả không
đổi, chỉ đỡ tốn máy. (Đo ra: chỗ này chỉ tốn ~9 µs/tick, tức 3%. Không phải nguyên nhân
chính của đợt chậm — xem §7.8.)

`[ĐO TRONG REPO]` Tỉ lệ thắng cả mùa sau khi quái rừng đánh trả (n=12 mỗi giải, mẫu nhỏ):

| giải | thắng | đích |
|---|---:|---:|
| Vòng bảng L1 / L2 | 83% / 83% | 75–85% ✓ |
| Play-off quốc nội | 67% | ~60% ✓ |
| Chung kết quốc nội | 75% | ~75% ✓ |
| CKTG Tứ kết | 58% | 43–53% (nhẹ hơn đích 5%) |
| CKTG Bán kết | 50% | 43–53% ✓ |
| Tranh vé chung kết | 25% | ~25% ✓ |
| **CHUNG KẾT THẾ GIỚI** | **17%** | ~20% ✓ |

Đường cong còn nguyên. Bốn bãi mỗi bên đối xứng nên đòn đánh của quái rừng không lệch cán
cân hai đội, đúng như suy đoán ban đầu — nhưng vẫn phải đo mới dám nói.

### 7.7 Bày lại màn trận cho khớp TFM2

Hai thứ TFM2 có mà bản trước thiếu:

- **Hàng mười ảnh tuyển thủ ở góc trái đáy màn** — bấm một cái là camera nhảy tới người đó
  (bản PC còn gán `F1`–`F10`). Thiếu nó thì người xem chỉ còn cách kéo chuột đi tìm, mà
  trận đang chạy, tìm xong thì giao tranh đã tan.
- **Thanh thứ hai trên thẻ tuyển thủ.** TFM2 để một thanh mana dưới thanh máu. Ở đây không
  có mana, nhưng thứ người xem thật sự cần biết là *ai sắp bung chiêu cuối*: thanh mỏng 4px,
  đầy thì viền thẻ sáng vàng và tên có dấu `★`.

`[BẪY ĐÃ SẬP]` Bản đầu của thanh ấy dày 12px và có chữ (tên chiêu / đếm giây). Cột chỉ vừa
đúng **năm** thẻ mỗi bên, nên thẻ thứ năm rơi khỏi khung — và thẻ thứ năm là người hỗ trợ,
đúng cái vị trí hay bị bỏ quên nhất. Phải rút thanh còn 4px, bỏ chữ, và bóp thêm ô đồ
(16 → 11px) + bản đồ nhỏ (150 → 132px) mới đủ chỗ.

---

### 7.8 `[BẪY ĐÃ SẬP]` Gắn thêm thuộc tính giữa trận làm bộ mô phỏng chậm 2,4 lần

Đợt này thêm vào `nguoi`/`linh`/`quai`/`tru` một loạt trường cho hoạt ảnh: `px/py` để nội
suy, và các mốc `danhLuc · danhGoc · niemLuc · niemTen · niemCuoi · dinhLuc · hoiLuc · huong`.
Tất cả đều được **gắn thêm giữa trận**, kiểu `n.danhLuc = tran.t` ở chỗ ra đòn.

`[ĐO TRONG REPO]` 20 trận chạy bằng `chayHet()`, đo thời gian mỗi tick:

| bản | µs/tick | ms/trận |
|---|---:|---:|
| trước đợt này | **139** | 675 |
| sau đợt này, trường gắn thêm giữa trận | **333** | 1.677 |
| sau khi KHAI SẴN đủ trường lúc tạo đối tượng | **~200** | ~1.020 |

Nguyên nhân: V8 gán cho mỗi đối tượng một *hidden class* theo đúng thứ tự thuộc tính được
thêm. Gắn một thuộc tính mới vào đối tượng đã dùng rồi là **đổi hidden class**; và khi một
mảng chứa các thực thể mang hình dáng khác nhau (người đã ra đòn thì có `danhLuc`, người
chưa thì không) thì mọi phép đọc thuộc tính trong vòng lặp nóng rơi từ đường *monomorphic*
xuống đường tra từ điển. Cả `tickTran` chậm đi, không riêng chỗ vừa thêm.

Sửa: **khai đủ mọi trường ngay trong object literal lúc tạo**, kể cả những trường vốn đã
gắn thêm từ trước (`demDon`, `congDon`, `mucCu`, `chuoi`, `cdChanPhep`, `chanKhiThap`,
`mucGiamNhan`, `mucHutMau`, `mucDanhTru`). Lấy lại được 1,8 lần tốc độ.

Hai bài học ghi lại để lần sau đỡ dò:

1. **Bất cứ vòng lặp nào thêm vào `tickTran` đều bị nhân với ~7,5 triệu tick** của bộ đo
   tỉ lệ thắng. Nghĩ tới con số ấy trước khi viết.
2. **Thêm trường cho một đối tượng trong luồng nóng thì phải khai ở chỗ tạo nó**, không
   được gắn dọc đường. Đây là cái bẫy đắt nhất của đợt này, và nó không hề hiện ra ở
   chỗ nào trong mã — chỉ có đồng hồ mới nói.

Dây cuối cùng: hiệu ứng và số bay lên giờ chỉ dựng khi **`tran.veHinh`** bật (màn xem trận
mở ra). Dữ liệu trình bày không đọc lại trong luồng tính toán, nên bỏ hẳn ở chế độ chạy
ngầm KHÔNG đổi một con số nào của kết quả trận — mà `tran.bay` thì trước đó còn phình vô
hạn suốt cả trận chạy ngầm, chẳng ai dọn.

## 8. Nguồn

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
