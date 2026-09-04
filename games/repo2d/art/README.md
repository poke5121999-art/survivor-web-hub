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
