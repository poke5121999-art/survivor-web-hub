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
| `mate0` `mate1` `mate2` | Ba đồng đội trong Ca Trực Đêm, theo màu áo xanh / tím / lục |


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
