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

Tám tấm, lấy từ bộ **pvfx-foundry-thirteen**, giấy phép **CC0 1.0** (`vfx/LICENSE.txt`). Chủ dự án
gửi cả một thư mục VFX, 2026-09-04: *"có mấy cái fx ở đây nè có gì thấy cái nào xài đc thì bỏ vào
game để cho nó đẹp + sinh động hơn"*.

Luật chọn: **mỗi tấm phải gắn vào một sự kiện ĐÃ CÓ SẮN**, không rắc thêm cho lấp lánh.

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

**Một khuôn cho cả tám:** khung 96×96, xếp 5 cột, chạy 20 khung/giây. Chỉ khác hai thứ — số
khung, và cái **chân** (`py` trong `VFX_SHEETS` ở `sprites.js`, lấy thẳng từ manifest của bộ gốc).
`py` quan trọng hơn vẻ ngoài của nó: vụ nổ neo ở tâm (58) còn đám bụi neo ở đáy (70), nên vẽ cả
hai từ giữa khung thì đám bụi lơ lửng trên không cách sàn nửa ô.

**Hai lớp, và phải hai lớp.** *Sáng* = vẽ sau khi đã nhân ánh sáng vào, cho thứ TỰ PHÁT SÁNG (lửa,
điện, cổng gương). *Tối* = vẽ cùng lớp với người và quái, cho bụi và đất — chỗ tối thì không thấy
bụi, và đó mới đúng. Rắc tất cả vào lớp cộng sáng thì đám bụi thành một quầng vàng lơ lửng trong
bóng tối: nó đọc ra là phép thuật, không đọc ra là bụi.

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
