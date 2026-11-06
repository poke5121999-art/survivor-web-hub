# Bộ hình của Ca Trực Đêm (và Biệt Đội — hai game dùng chung bộ này)

Bản hiện tại do code sinh ra (`web-hub/games/repo-squad/tools/gen_sprites.py` trong meta-repo). Đây là **bản kê chỗ**:
vẽ tay đè lên đúng khuôn dưới đây là game nhận ngay, không phải sửa một dòng nào.

## Khuôn một file

Một file = một nhân vật (hoặc một giống quái), kích thước **288 × 576**, chia thành
**3 cột × 4 hàng**, mỗi ô **96 × 144**. Nền trong suốt (PNG có kênh alpha).

```
        cột 0        cột 1        cột 2
      chân trái      đứng      chân phải
hàng 0  [nhìn xuống — quay mặt về phía người chơi]
hàng 1  [nhìn sang TRÁI]
hàng 2  [nhìn sang PHẢI]
hàng 3  [nhìn lên — quay lưng lại]
```

Đây là thứ tự chuẩn của RPG Maker / Wolf RPG, giữ nguyên để bộ hình nào cũng cắm vào được.

**Game chạy 4 nhịp theo vòng `0 → 1 → 2 → 1`**, nên cột 1 là tư thế đứng và hai cột
kia là hai bước chân trái phải. Đứng im thì game khoá ở cột 1.

## Mấy con số phải theo

| Việc | Số |
|---|---|
| Chân chạm đất | dòng **y = 138** trong ô (chừa vài dòng trống dưới cùng) |
| Cả người cao | khoảng **108–120 px**, đừng chạm mép trên |
| Cả người rộng | khoảng **72–84 px**, chừa mép hai bên cho viền |
| Bảng màu | tuỳ ý; viền tối bao ngoài để hình không tan vào sàn tối |

Ô lưu **gấp ba** cỡ thật trên màn (người cao ~22 px, quái ~38 px). Lưu đúng cỡ thật
thì hình bị phóng to lúc vẽ và nhoè — engine vẽ thế giới với hệ số dpr × zoom ≈ 3.
Nên **quái phải vẽ đầy khung hơn người** thì trên màn mới ra to gấp rưỡi.

**Đừng vẽ viền đỏ cho quái** — game tự nướng viền đỏ quanh hình lúc nạp, vẽ sẵn là
thành hai lớp viền. Bản đóng băng (chiêu của Vân) cũng do game tự phủ xanh.

## Tên file phải khớp

Đặt sai tên thì game lặng lẽ quay về vẽ hình khối cũ, không báo lỗi.

`crew/<mã>.png` — 4 mã dùng cho Ca Trực Đêm, 14 mã còn lại là các xác của Biệt Đội:

| Mã | Ai |
|---|---|
| `lead` | Người chơi trong Ca Trực Đêm (khi chưa gắn xác nào) |
| `mate0` `mate1` `mate2` | **Chỉ còn là lưới đỡ.** Ba đồng đội (Tổ 2/3/4) nay mượn `bao` / `hue` / `tam`; ba file này chỉ được dùng khi thiếu file vẽ tay. Đổi ai mượn ai: sửa `MATE_LOOK` trong `sprites.js` |


| `bao` | Bảo | Đèn Pin | 3★ |
| `hue` | Huệ | Y Tá Ca Ba | 3★ |
| `tam` | Tâm | Cửu Vạn | 3★ |
| `ky` | Kỳ | Thợ Khoá | 3★ |
| `linh` | Linh | Bóng | 4★ |
| `dung` | Dũng | Xà Beng | 4★ |
| `mai` | Mai | Mồi | 4★ |
| `phuc` | Phúc | Cứu Hộ | 4★ |
| `son` | Sơn | Kẽm Gai | 4★ |
| `nga` | Nga | Chớp | 5★ |
| `khoi` | Khôi | Mắt Thần | 5★ |
| `van` | Vân | Băng | 5★ |
| `hai` | Hải | Từ Trường | 5★ |
| `tuyet` | Tuyết | Bất Tử | 5★ |

`foe/<mã>.png` — **sáu tấm**, dùng chung cho cả hai game. Mô tả là luật thật trong game,
vẽ theo cho khớp:

| Mã | Tên | Lấy từ tấm nào | Nó là gì |
|---|---|---|---|
| `gunner` | Kẻ bắn | `patrol.png` cũ | Tay súng đội mũ cao bồi, cầm khẩu lục chĩa ra. Đánh TỪ XA, không bao giờ đánh tay. |
| `rook` | Kẻ húc | `rook.png` | Con thú to. Không đuổi — nó ngắm một đường thẳng rồi lao, báo trước ba giây. |
| `angel` | Tượng | `angel.png` | Pho tượng cầm kiếm. Không bắn được, không có máu; rọi đèn đủ lâu thì nó đi. |
| `banger` | Bom con | `bomber.png` cũ | Củ cà rốt có chân. Nhỏ, tức cười, chạy tới rồi tự nổ. |
| `gnome` | Gnome | `stalk.png` cũ | Búp bê nhỏ **cầm một cái lưỡi** — nó không giết ai, nó bổ vào món hàng bạn đang ôm. |
| `mirror` | Cái bóng ra khỏi gương | `bongden.png` cũ | Bóng ma đen tuyền chỉ còn hai con mắt. Bắn không chết — phải đập tấm kính. |

Ba tấm cuối được chọn theo **luật của con quái** chứ không theo cái tên cũ của tệp, và ba tấm ấy
đều đã vẽ sẵn từ lâu — không tấm nào vẽ mới. Chủ dự án, 2026-09-04: *"có sẵn hình mấy con quái
cũ ấy lấy nó mà gắn vào bomb, gnom, mirror"*.

Cặp **Gương** (hai tấm kính) vẫn vẽ bằng code: nó là đồ vật, không phải con vật. `mirror.png`
là hình của CÁI BÓNG bước ra khỏi nó. Bản vẽ tay cũ của cái bóng vẫn còn trong `drawMirrors`
làm đường lui nếu ảnh tải hỏng.

### Bảy tấm đã xoá, 2026-09-04

`patrol.png` đổi tên thành `gunner.png` — không vẽ lại một điểm ảnh nào. Tấm ấy vốn là một tay
súng đội mũ cao bồi **cầm khẩu lục chĩa ra ở cả mười hai khung**, mà mã thì cho nó vung tay
như mấy con cận chiến khác. Cái sai nằm ở mã, nên cái được sửa là mã.

Xóa hẳn: `listen.png`, `stalk.png`, `bomber.png`, `heavy.png` (bốn con không có chiêu — chúng
chạy chung một vòng AI và chỉ khác nhau ở máu/đòn/chạy/mắt/tai), cùng `crawler.png`,
`quanca.png`, `bongden.png` (ba tấm chỉ dùng cho bảng quái riêng của Biệt Đội — bảng mà không
chỗ nào trong bộ máy đọc tới, nên bảy con trong đó chưa từng sinh ra trong một ván nào).

**KHÔNG CÒN `SQUAD_FOE_ART`.** Bảng gắn lại ấy tồn tại vì hai game có hai bảng quái khác nhau
mà trùng mã (`rook` bên này là Kẻ húc, bên kia là Con Ngồi). Nay hai game dùng chung đúng
một bảng quái, nên một mã trỏ vào đúng một con và chỗ gắn lại không còn việc.

Thêm mã mới thì nhớ thêm cả vào `FOE_IDS` trong `sprites.js`, không thì game không nạp và lặng
lẽ vẽ lại hình khối — và mỗi tên trong `FOE_IDS` không có tệp tương ứng là một request 404 thật.

## Bẫy và rương — `item/bay.png`, `foe/mimic.png`

Hai tấm này **không vẽ tay**: chúng do `art/tools/lam-bay.py` cắt ra từ kho Soul Knight đã bóc ở
`~/Downloads/sk-ref` (ngoài git). Chạy lại kịch bản ấy là sinh lại đúng hai tấm này.

`item/bay.png` là một **dải ngang 21 ô 96×96**, và thứ tự ô là hợp đồng ba bên — `lam-bay.py`,
`BAY_O` trong `game.js`, và hàm `bay()` trong `sprites.js`. Đổi ở một chỗ mà quên hai chỗ kia
thì bẫy gai vẽ ra cái rương và **không ai báo lỗi**:

| Ô | Là gì | Khung gốc |
|---|---|---|
| 0..7 | tấm gai, **tám khung**: đóng kín → hé nắp → gai nhả dần | `Thorn_0..7` |
| 8 | hộp laser lúc im | `ElectricBox_0` |
| 9..14 | hộp laser lúc bật, **sáu khung** tia điện nhảy | `ElectricBox_4..9` |
| 15 · 16 | rương đóng · rương mở | `chest_anim_4` |
| 17..20 | thanh tia, **bốn khung** — căng đầy ô, vì lúc vẽ nó bị kéo thành hộp (dài tia × bề dày tia) | `mythic_12_laser_beam_0..3` |

**Thứ tự tám khung gai không phải 0,1,2,…** — phải đọc tấm hình mới biết: `Thorn_6` là tấm sắt
đóng kín, `Thorn_7` là lúc nắp vừa hé thành một cái hốc đen, rồi `Thorn_5..0` mới là gai nhú dần.
`lam-bay.py` xếp lại theo chiều "càng về sau càng nhả"; bảng `GAI_KHUNG` trong `game.js` ghi đúng
chiều chạy.

**Thanh tia đổi màu lúc dựng.** Soul Knight có bốn khung anim thật nhưng chỉ màu tím
(`mythic_12`); bộ `rgb_laser` có đỏ nhưng bảy tấm ấy là bảy **màu**, không phải bảy **khung**.
Nhuộm lúc dựng là cách duy nhất được cả hai. Và mỗi khung chỉ lấy **một cột sáng nhất** rồi trải
ra cả ô: trong một khung, độ sáng dọc theo tia không đều, nên kéo cả đoạn ra sáu ô thì mấy chỗ
tối thành mấy khúc tia bị đứt — mà tia này đốt người trên *cả* chiều dài.

`foe/mimic.png` theo đúng khuôn charset 288×576 như mọi tấm quái khác. Cái rương thì không có
lưng, nên bốn hàng dùng chung ba khung nhảy, chỉ hàng "nhìn sang trái" lật ngang.

## Hiệu ứng — `vfx/<mã>.png`

Chủ dự án gửi cả một thư mục VFX, 2026-09-04: *"có mấy cái fx ở đây nè có gì thấy cái nào xài đc
thì bỏ vào game để cho nó đẹp + sinh động hơn"*.

**HAI BỘ, HAI GIẤY PHÉP** — và phải ghi rõ cái nào là cái nào:

| Bộ | Số tấm | Giấy phép | Ghi công |
|---|---|---|---|
| **PVFX Foundry Thirteen** | 22 | CC0 1.0 (`vfx/LICENSE.txt`) | không bắt buộc |
| **Super Pixel Effects Gigapack (Free)** | 5 | `vfx/LICENSE-untiedgames.txt` | **BẮT BUỘC** |

Dòng ghi công nằm ở **chân Sổ tay** (`wikiHtml`, lớp `.wk-nguon`) — trò này không có màn
credits, mà Sổ tay là trang dài nhất người chơi thật sự mở ra đọc. **Đừng xoá dòng đó.** Nó
ghi cả bộ CC0 nữa dù bộ ấy không bắt: một danh sách chỉ liệt kê những thứ *bắt phải* liệt kê
thì lần sau không ai biết mấy tấm còn lại ở đâu ra.

Luật chọn: **mỗi tấm phải gắn vào một sự kiện ĐÃ CÓ SẮN**, không rắc thêm cho lấp lánh.

### CĂN NHÀ — mười một tấm, nạp ở **cả hai** game

| Mã | Khung | Nổ ra khi nào | Lớp |
|---|---|---|---|
| `warm-explosion` | 15 | mọi vụ nổ — Bom con, lựu đạn | sáng |
| `earth-rupture` | 20 | Kẻ húc lao trúng tường (cửa sổ bắn nó miễn phí) | tối |
| `landing-dust` | 14 | ba nhịp giậm chân lúc Kẻ húc gồng | tối |
| `crescent-slash` | 10 | cú vụt đèn pin | sáng |
| `magical-projectile` | 12 | viên đạn của Kẻ bắn đang bay | sáng |
| `electric-impact` | 14 | và lúc nó trúng người | sáng |
| `rift-portal` | 16 | hai tấm kính của cặp Gương (lặp, mờ dần theo máu kính) | sáng |
| `spectral-bloom` | 16 | Tượng bay đi sau khi bị rọi đèn đủ lâu | sáng |
| `beam-cutoff-burst` | 14 | đầu tia laser — chỗ nó DỪNG, không phải ở nòng | sáng |
| `ember-jet` | 14 | lửa đầu nòng súng hoa cải, xoay theo hướng bắn | sáng |
| `acid-splash` | 14 | phi tiêu thuốc mê cắm vào con quái | sáng |

Năm tấm từ bộ **Gigapack**, bù đúng năm khoảnh khắc đắt nhất của trò này mà cho tới hôm nay
**không có gì trên sàn để nhìn**:

| Mã | Khung | Nổ ra khi nào | Lớp |
|---|---|---|---|
| `blood-hit` | 8 | đánh trúng quái — bắn theo ĐÚNG HƯỚNG đòn đi | tối |
| `blood-kill` | 10 | và lúc nó chết | tối |
| `muzzle-flash` | 6 | chớp nòng khẩu lục | sáng |
| `wall-impact` | 7 | viên đạn cắm vào tường — bắn trượt cũng phải thấy | sáng |
| `alert-mark` | 14 | dấu **"!"** trên đầu con quái vừa THẤY bạn | sáng |

Máu để ở **lớp tối**: máu không tự phát sáng. Bắn một con quái trong phòng tối thì bạn *nghe*
thấy chứ không *nhìn* thấy — đúng cho một trò dựng trên chuyện không nhìn thấy gì.

Dấu `"!"` là tấm đáng giá nhất trong năm: trước đây khoảnh khắc bị phát hiện chỉ có tiếng sting
và một cú rung màn — hai thứ nói *"có chuyện"* mà không nói *"con nào"*. Trong một căn nhà có ba
thứ đi lại và một cái đèn pin soi được đúng một hướng, câu hỏi đắt nhất không phải *"có bị
thấy không"* mà là **"CON NÀO vừa thấy mình"**.

### CHIÊU CỦA BIỆT ĐỘI — mười một tấm, **chỉ** nạp ở trang Biệt Đội

| Mã | Chiêu |
|---|---|
| `solar-shrapnel` | Chói Loà |
| `radiant-heal` | Vòng Hồi |
| `focus-charge` | Gồng |
| `arcane-parry` | Mở Toang |
| `void-implosion` | Tàng Hình, và đầu đi của Chớp |
| `smoke-puff` | Mồi Nhử rơi xuống (lớp tối) |
| `venom-ward` | Lồng Sắt |
| `lattice-beam` | Thấu Thị |
| `frost-nova` | Đóng Băng |
| `leaf-gust` | Kéo Đồ, Kéo Về |
| `splash-crown` | Thiên Thần |

Ca Trực Đêm không có chiêu nào nên **không tải** mười một tấm dưới — hơn trăm KB. Phân bảng ở
`VFX_SHEETS` / `VFX_SKILL` trong `sprites.js`, chọn bằng đường dẫn trang (`LA_SQUAD`) chứ không
bằng `window.SQ`: tệp này nạp trước content.js nên lúc ấy SQ chưa tồn tại.

**Không còn một khuôn chung.** Bộ pvfx là khung 96×96 xếp 5 cột; bộ Gigapack là 32/40/48px và
phần lớn xếp một **dải ngang**. Nên mỗi tấm tự khai `f` (cạnh khung) và `cols` (số cột) trong
`VFX_SHEETS`, và hàm vẽ đọc của **chính tấm đang vẽ** chứ không đọc hằng số chung nữa — một
tấm 32px mà bị cắt bằng thước 96px thì nó vắt qua ba khung liền nhau, sai mà không ném lỗi.

`scale` vẫn quy về **khung 96px của bộ pvfx** cho cả hai bộ. Nếu không quy về một mối thì
`scale: 0.5` nghĩa là 48px ở tấm này và 16px ở tấm kia, và mọi con số cỡ đã căn từ đầu sai hết.

Cả hai bộ đều chạy 20 khung/giây. Chỉ khác hai thứ — số
khung, và cái **chân** (`py` trong `VFX_SHEETS` ở `sprites.js`, lấy thẳng từ manifest của bộ gốc).
`py` quan trọng hơn vẻ ngoài của nó: vụ nổ neo ở tâm (58) còn đám bụi neo ở đáy (70), nên vẽ cả
hai từ giữa khung thì đám bụi lơ lửng trên không cách sàn nửa ô.

**BA lớp vẽ**, và cả ba đều sinh ra từ một lỗi đo được bằng ảnh chụp:

- **tối** (`sang: false`) — vẽ cùng lớp với người và quái, chịu ánh sáng. Bụi, đất, khói. Chỗ tối
  thì không thấy bụi, và đó mới đúng — rắc nó vào lớp cộng sáng thì đám bụi của Kẻ húc thành
  một quầng vàng lơ lửng trong bóng tối: đọc ra là phép thuật, không đọc ra là bụi.
- **sáng** (`sang: true`) — cộng sáng sau khi đã nhân đèn. Lửa, điện, cổng gương, viên đạn. Chúng
  VỐN là nguồn sáng, và nét vẽ của chúng tối, nên cộng lên không cháy.
- **giữ màu** (`giuMau: true`) — một lượt vẽ THƯỌNG sau khi nhân đèn, cộng thêm một lượt sáng
  mờ 30% để vẫn có quyệng. **Mọi chiêu của Biệt Đội dùng lớp này.** Lý do: cộng sáng là CỘNG,
  mà mấy tấm phép thuật vốn đã trắng sẵn — cộng lên nền đã được đèn rọi thì chạm trần 255 và
  bạc ra trắng. Đo ảnh chụp lần đầu: Chói Loà, Mở Toang và Đóng Băng ra ba cái đĩa trắng
  giống hệt nhau.

**CỠ KHÔNG ĐO THEO BÁN KÍNH.** Bản đầu của mấy chiêu viết `scale: d.radius * TILE / 40` cho ô
hình trùm đúng vùng chiêu ăn tới. Nghe thì đúng, nhìn thì hỏng: Đóng Băng tầm 8 ô ra scale 4,8,
tức là tấm 96px kéo lên 460px — mất hết nét pixel. Phân vai đúng là: **lớp vector nói bán kính,
bộ hình nói cú bấm** — nên bộ hình giữ cỡ gần như cố định, cỡ 1–2 ô.

**Hiệu ứng KHÔNG được nói dối về luật chơi.** Vụ nổ giữ nguyên cái vòng xung kích vẽ tay — nó
nói "tới đây là còn ăn đòn", một thông tin mà bộ hình không mang — và ngọn lửa co theo đúng
bán kính sát thương thật (`scale: b.r / 48`). Vạch ngắm của Kẻ bắn không đụng tới.

Thêm một hiệu ứng mới thì thêm một dòng vào `VFX_SHEETS` (`sprites.js`) và gọi `spawnVfx(...)` ở
chỗ sự kiện xảy ra. Nhớ thêm cả vào `VFX_MA` trong `test/repo-suite.js` — bộ test ở đó canh
đúng hai việc: hiệu ứng NỔ RA đúng lúc sự kiện xảy ra, và nó TẮT. Hiệu ứng là loại mã hỏng mà
không ai thấy: gõ nhầm một mã thì game vẫn chạy, vẫn không lỗi console, chỉ là từ hôm đó vụ nổ
không còn ngọn lửa nào.

## Đồ trên tay — `item/gear.png`

MỘT tấm cho cả mười một món, và nó là một **lưới**: mỗi **cột** một món, mỗi **hàng** một
khung hình. Ô **96 × 96**, nền trong suốt, hình canh giữa ô.

Thứ tự cột cố định, khớp `GEAR_ORDER` trong `sprites.js`:

| cột | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mã | `fist` | `gun` | `shotgun` | `laser` | `tranq` | `bomb` | `heal` | `tracker` | `float` | `shield` | `pry` |

Mấy luật phải theo:

- **Hàng 0 là hình đứng im của mọi món.** Một tấm chỉ có đúng một hàng vẫn chạy bình thường —
  thêm hàng là thêm cử động, không phải đổi khuôn và không phải vẽ lại tấm cũ.
- Món nào cử động thì phải khai số khung ở `GEAR_FRAMES` trong `sprites.js` (hiện là
  `{ bomb: 4 }`). Không có tên trong bảng = một khung. Tốc độ chung ở `GEAR_FPS`, đang để
  10 khung/giây. Khai bằng bảng chứ không dò ô trống trên chính tấm hình, vì dò thì phải
  đọc pixel qua `getImageData`, mà mở bằng `file://` là Chrome ném `SecurityError`.
- **Vũ khí phải chĩa sang PHẢI.** Món có cờ `aim` trong `GEAR` được xoay theo hướng ngắm,
  và góc 0 là bên phải.
- Món cử động thì các khung canh **ĐÁY-GIỮA** với nhau, đừng canh tâm: thân quả bom phải
  đứng yên, chỉ tia lửa chạy lên. Canh tâm là quả bom nảy lên nảy xuống.
- Thiếu tấm — hoặc tấm mới vẽ được vài cột — thì mấy món còn lại tự rơi về hình vector
  trong `gearIcon()` của `game.js`. Nên không có ngày nào cái nút bấm nhiều nhất trò chơi
  bị trống trơn.

### Tấm đang cắm vào là hình KÊ CHỖ, lấy từ Soul Knight

Ghép từ sprite của **Soul Knight 8.5.1 (ChillyRoom)** theo yêu cầu của chủ dự án, để xem bố
cục chạy có đã tay không trước khi bỏ công vẽ bộ riêng.

**Art này không phải của dự án.** Vẽ hoặc gen một bộ đè lên đúng khuôn ghi ở trên là thay
được ngay, không phải sửa một dòng mã nào.

## Viên đạn — `item/dan.png`

Một **dải ngang**, mỗi ô một loại đạn, ô **96 × 96**, nền trong suốt, hình canh giữa ô.
Thứ tự cột khớp `DAN_ORDER` trong `sprites.js`:

| cột | 0 | 1 | 2 |
|---|---|---|---|
| mã | `gun` | `shot` | `tranq` |
| là gì | đầu đạn đồng của khẩu lục | hạt chì của hoa cải | mũi tiêm xanh của súng gây mê |

- **Đạn phải chĩa sang PHẢI**, cùng luật với vũ khí trong `gear.png`: `veDan()` xoay ngữ cảnh
  theo `atan2(vy, vx)` trước khi vẽ, và góc 0 là bên phải.
- Thiếu tấm thì `dan()` trả về `false` và `veDan()` tự vẽ hình vector của nó. Hình vector ấy
  phải giữ cho đúng — nó là thứ chạy trên máy nào tấm hình chưa về kịp.
- **Cái VỆT kéo sau viên đạn vẫn vẽ bằng mã**, và đừng gom nó vào tấm hình. Viên đạn bay 620
  điểm ảnh mỗi giây, tức nhảy hơn mười đơn vị mỗi khung hình; không có vệt thì mắt chỉ bắt
  được một chuỗi chấm rời nhau, mà một sprite tĩnh không sửa được chuyện đó — cái sửa được nó
  là một vệt NỐI hai khung liền nhau. Ba con số của vệt nằm ở `DAN_VE` trong `game.js`.

## Ba chiếc xe — `item/xe.png`

Một **lưới**: mỗi **cột** một chiếc (khớp `XE_ORDER` trong `sprites.js`), mỗi **hàng** một
HƯỚNG. Ô **96 × 96**. Hiện là 3 cột × 8 hàng.

| cột | 0 | 1 | 2 |
|---|---|---|---|
| mã | `scout` | `haul` | `day` |
| là gì | Xe trinh sát | Xe chở đồ | Xe đẩy |

**Tấm này KHÔNG xoay bằng `c.rotate`, và đó là cả lý do nó có tám hàng.** Xe là hình nghiêng
ba-phần-tư nhìn từ trên xuống; xoay thứ đó bằng ma trận thì xe quay đầu là ngửa cả mặt đáy
lên trời. Soul Knight vẽ sẵn tám hướng cho mỗi chiếc xe goòng của thợ mỏ, nên ở đây dùng đúng
tám hướng ấy — `huongKhung()` trong `game.js` đổi góc ra số hàng.

Hàng 0 quay **LÊN**, rồi đi **theo chiều kim đồng hồ**:

| hàng | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| hướng | bắc | đông-bắc | đông | đông-nam | nam | tây-nam | tây | tây-bắc |

Cách kiểm thứ tự ấy mà không cần tin ai: chiếc `haul` có **đèn pha**. Khung 0 đèn hắt lên,
khung 2 đèn hắt sang phải, khung 4 đèn hắt xuống. Sai một nhịp là thấy ngay.

Mấy luật còn lại:

- **Cả tám khung của một chiếc phải cùng MỘT hệ số phóng**, tính từ khung to nhất, và canh
  **giữa-giữa** ô. Để mỗi khung tự phóng theo cỡ riêng thì chiếc xe phình ra thu vào mỗi lần
  quay đầu.
- Thiếu tấm thì `xe()` trả về `false` và `drawBikes()`/`drawCart()` rơi về hình vector cũ —
  hai cái khung chữ nhật có bánh. Giữ nguyên nhánh ấy.
- Tấm hình vẽ **thùng rỗng**, nên "chở được mấy món" phải tự vẽ đè: mấy ô vuông vàng ở giữa
  thùng. Cũng vậy với vòng dưới gầm (đang có người ngồi / đang có người đẩy) và **thanh nắm**
  của xe đẩy — thanh nắm là một luật chơi (nắm đúng mặt thì đẩy khoẻ), không phải trang trí,
  nên nó vẫn vẽ bằng mã đè lên tấm hình.

### Hai tấm này cũng là hình KÊ CHỖ, cùng nguồn với `gear.png`

Chủ dự án: *"lấy trong soul knight mà nhét vào cho hợp"*, rồi *"dùng 2 miner cart trong soul
knight để làm 2 xe của repo"*, rồi *"lấy cart to nhất để làm cart đẩy"*.

Ghép từ sprite **Soul Knight 8.5.1 (ChillyRoom)** bằng `sk-ref/build_dan.py` và
`sk-ref/build_xe.py` — cùng đường ống với `build_gear.py`. Nguồn từng ô:

| ô | tệp nguồn Soul Knight |
|---|---|
| `dan` / `gun`   | `bullet403` — đầu đạn đồng 22×7 |
| `dan` / `shot`  | `bullet2_88` — hạt chì 10×5 |
| `dan` / `tranq` | `bullet2_68` — mũi tiêm 5×11, **xoay −90°** cho chĩa sang phải |
| `xe` / `scout`  | `skin/character/miner/skin_3` — phao bơi hồng hình hạc, 8 hướng |
| `xe` / `haul`   | `common/miner_car_*` — xe goòng gỗ có đèn pha và có thùng, 8 hướng |
| `xe` / `day`    | `skin/character/miner/skin_5` — xe goòng thép có gai, 8 hướng |

Vì sao chia như thế: `haul` cần **cái thùng** nên phải là chiếc xe goòng gỗ; `day` là *"cart
to nhất"* nên phải là chiếc thép (57×71, khung lớn nhất trong cả bộ xe goòng); `scout` còn
lại phải chọn trong đám skin vui mắt, và phao hạc thắng vì ba lẽ **đo được**: nó có cái đầu
nên nhìn là biết đang quay hướng nào (xe trinh sát thì hướng là thứ quan trọng nhất), nó
**không** trùng màu cam với chiếc `haul` đỗ ngay cạnh, và nó nhỏ nhất trong ba chiếc — đọc ra
là "nhanh". Đổi ý chiếc nào thì sửa đúng một dòng trong `PICKS` của `build_xe.py` rồi chạy lại.

**Art này không phải của dự án.** Vẽ đè lên đúng khuôn ghi ở trên là thay được ngay.

## Bộ hiện tại từ đâu ra

Chủ dự án gửi 18 ảnh JPEG (mỗi ảnh một lưới 3×4, có nền). `../tools/import_art.py` bóc
nền, cắt lưới và chuẩn hoá về khuôn trên. Gửi ảnh mới cùng kiểu thì chạy lại:

```
python web-hub/games/repo2d/tools/import_art.py <thư-mục-ảnh>
```

Mã nào chưa có ảnh thật thì vẫn giữ bản kê chỗ do code sinh, nên không nhân vật nào bị
trống mặt: hiện còn `son`, `nga`, `van`, `hai`, `tuyet` và ba đồng đội `mate0/1/2`.

## Còn thiếu hình (tính tới 2026-08-29)

Cả hai game đều nạp thư mục này. Những mã dưới đây vẫn là **bản kê chỗ do code sinh
ra** (file 4–5 KB), hoặc chưa có file nào:

**Xác của Biệt Đội — 5 mã còn kê chỗ**, cả 5 đều là xác hiếm nên người chơi nhìn nhiều nhất:

| Mã | Tên | Sao |
|---|---|---|
| `son` | Sơn — Kẽm Gai | 4★ |
| `nga` | Nga — Chớp | 5★ |
| `van` | Vân — Băng | 5★ |
| `hai` | Hải — Từ Trường | 5★ |
| `tuyet` | Tuyết — Bất Tử | 5★ |

**Quái — không thiếu tấm nào.** Sáu mã, sáu tấm, không con nào còn rơi về hình khối — xem
bảng ở phần trên. Riêng hai tấm kính của cặp Gương vẽ bằng code, cố ý.

Hai tấm mới dựng bằng `tools/import_foe_packs.py` từ gói hình rời trong
`CharREPO/MostersFREE`. Thêm mã mới thì nhớ thêm cả vào `FOE_IDS`, không thì game
không nạp và lặng lẽ vẽ lại hình khối.

Còn thừa chưa dùng trong gói đó: con dơi, cái đầu hề, quả bí nhớt, vệ binh băng,
golem đá, và hai giống cây nữa (Plant1, Plant3).

## Vẽ ra màn thế nào (đừng đổi lại nếu chưa đo)

Bộ hình này là **tranh pixel**, không phải tranh vẽ mềm. Hai chỗ trong `sprites.js` đi
cùng nhau, đổi một cái là hỏng cái kia:

- `CREW_SCALE` **0,80** và `FOE_SCALE` **1,05** (trước là 0,55 / 0,80). Ô nguồn cao 144 px;
  ở mức cũ nó bị thu còn 77 px, tức hơn một nửa số pixel rơi mất trước khi tới mắt người chơi.
- Khử răng cưa **TẮT**. Đo bằng phương sai sai phân bậc hai trên đúng ô hình đang vẽ:
  tắt 417, bật 336, bật ở mức `high` chỉ 250 — bật lên là trình duyệt trộn nhoè các ô vuông.

Và trong `game.js`, vũng sáng dưới chân người chơi sáng gần hết ở tâm rồi mới tụt.
Lý do: lớp tối được **nhân** lên cả khung hình, kể cả lên chính nhân vật — ở mức cũ
sàn màu 93 rơi xuống còn 57, và bộ hình vẽ tay ra một cục xám. Nhà vẫn tối như cũ;
thứ đổi là bạn nhìn rõ mình và người đứng cạnh mình.

Bài kiểm giữ ba luật này: `docs/tests/browser/test_repo2d_sprites.py` (mục [3b], [4b], [4c]).

## Bẫy: `toDataURL()` và tấm hình mở bằng `file://`

[ĐO TRONG REPO] 2026-09-09. Tủ đồ và cửa hàng ngoài menu vẽ biểu tượng món đồ ra `<img>` bằng
`gearIconURL()` → `canvas.toDataURL()`. Cái canvas ấy vừa vẽ `art/item/gear.png` lên.

Mở trang bằng **`file://`** (nhấp đúp vào `index.html`) thì Chrome coi mọi ảnh `file://` là
**khác nguồn**: canvas bị "vấy bẩn" và `toDataURL()` ném `SecurityError`. Triệu chứng: cả tủ đồ
lẫn cửa hàng **không còn một cái hình nào**, mà console thì im lặng vì lỗi đã bị `catch`.

Trên GitHub Pages thì không sao — cùng nguồn. Nên lỗi này chỉ hiện ra **đúng ở chỗ hay mở thử
nhất**, và không bao giờ hiện ra ở chỗ người chơi thật đang chơi.

Cách thoát đang dùng: `gearIconURL()` thử **hai lần** — lần đầu có tấm PNG, hỏng thì vẽ lại
bằng hình vector (`gearIcon(..., veTay = true)`), thứ không đụng vào một tệp nào nên không có
gì để vấy bẩn. Cùng một cái bẫy sẽ đợi sẵn bất kỳ đường nào khác định xuất một canvas có vẽ
tấm hình lên — `getImageData()` cũng ném đúng lỗi ấy (xem chú thích `GEAR_FRAMES` trong
`sprites.js`).
