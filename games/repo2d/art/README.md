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

`foe/<mã>.png` — 6 giống quái. Mô tả là luật thật trong game, vẽ theo cho khớp:

| Mã | Tên | Nó là gì |
|---|---|---|
| `patrol` | Kẻ đi tuần | Nhìn thấy là đuổi. Không nghe được gì. |
| `listen` | Kẻ nghe | Mù hoàn toàn, chỉ nghe. Đứng im thì nó đi qua. |
| `stalk` | Kẻ bám | Thấy bạn là bám riết, dai hơn Kẻ đi tuần. |
| `bomber` | Kẻ nổ | Máu ít, ôm thùng, tới sát là nổ. |
| `heavy` | Kẻ nặng | 620 máu, đi chậm, một đòn gần chết. |
| `rook` | Kẻ húc | Không đuổi. Nó ngắm một đường thẳng rồi lao, báo trước ba giây. |
| `angel` | Tượng thiên thần | Sự kiện riêng: đứng yên khi bị nhìn, quay lưng đi là nó tới. |

Còn `foe/crawler.png` nằm sẵn trong thư mục nhưng **chưa có chỗ trong luật** — để dành
cho giống quái tiếp theo, game không nạp nó.

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

**Quái của Biệt Đội — xong hết từ 2026-08-29.** Bảy giống, bảy tấm hình, và mỗi tấm
được chọn theo **luật của con quái** chứ không theo cái tên trùng:

| Mã | Tên | Lấy hình từ đâu | Vì sao |
|---|---|---|---|
| `rook` | Con Ngồi | `crawler.png` (qua bảng đổi) | Mù, ngồi thu lu — đúng thứ đang ngồi bệt dưới đất |
| `patrol` | Kẻ Tuần | `patrol.png` | Gã đội mũ cầm súng, đi theo tuyến |
| `angel` | Tượng | `angel.png` | Pho tượng cầm kiếm |
| `hunter` | Thợ Săn | `rook.png` (qua bảng đổi) | Con sói mắt đỏ — đánh hơi và không quên |
| `nhen` | Nhện Trần | `listen.png` (qua bảng đổi) | Con nhện đã vẽ sẵn từ lâu, chỉ là treo nhầm chỗ |
| `quanca` | Quản Ca | `quanca.png` mới | Bông hoa hình cái kèn — thấy bạn là cả nhà biết |
| `bongden` | Bóng Đen | `bongden.png` mới | Con ma đảo sáng thành bóng, chỉ còn hai con mắt |

**Bảng đổi nằm ở `SQUAD_FOE_ART` trong `sprites.js` và CHỈ áp cho trang Biệt Đội.**
Lý do phải có nó: `rook` bên Ca Trực Đêm là Kẻ húc (con thú lao thẳng), bên Biệt Đội là
Con Ngồi (mù, ngồi im). Một cái tên, hai luật, không thể chung một tấm hình.

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
