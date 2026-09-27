# Rút sprite 2D, âm thanh, dữ liệu (R4)

Ba công cụ Python bóc thẳng từ bundle UnityFS trong bản cài PokéOne (`p1setup.exe`) và từ
các TextAsset JSON đã dump sẵn. Chạy lại bao nhiêu lần cũng ra cùng kết quả (ghi đè, không
cộng dồn). Không đụng tới `art/pdata`, `art/mdata` (model 3D, thuộc workstream khác), `art/ui/`
ngoài `logo.png` (atlas NGUI thuộc agent khác).

## Chạy

```
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_2d.py            # sprite: nguoi choi, NPC, Pokemon, item, nen tran, fx, logo
python games/pokeone/tools/rip_audio.py         # nhac, tieng keu, sfx
python games/pokeone/tools/rip_data.py          # data/gamedata.js (PHAI chay SAU rip_2d.py vi can biet icon nao co that)
python games/pokeone/tools/check_paths.py       # kiem tra moi duong dan trong data/*.js co ton tai
```

Mỗi tool nhận tham số con để chạy từng phần (`rip_2d.py player|npc|poke|item|battle`,
`rip_audio.py music|cry|sfx`). Biến môi trường: `POKEONE_DATA` (thư mục `PokeOne_Data`,
mặc định `D:\pokeone-ref\extract\app\files\PokeOne_Data`), `POKEONE_REF_DATA` (thư mục
`D:\pokeone-ref\data` chứa các .txt), `FFMPEG`.

**[BẪY ĐÃ SẬP]** Chạy một phần (vd chỉ `npc`) rồi ghi `data/sprites.js`/`data/audio.js` ngay
trong lần chạy đó sẽ xoá mất các nhóm khác (script chỉ biết nhóm mình vừa làm). Đã sửa: khi
không chạy đủ `all`, script tự đọc lại tên tệp đã có sẵn trên đĩa (`scan_existing_parts`,
`scan_existing`) để không mất dữ liệu của lần chạy trước.

## Bố cục lưới sprite [ĐO TRONG REPO]

Mọi sprite người chơi/NPC/Pokémon-follow đều là tấm PNG 256×256 = lưới 4×4 ô 64px.

- **Người chơi & NPC**: chỉ dùng 3 cột (cột 4 luôn trong suốt) × 4 hàng.
  Hàng 0 = quay lưng (lên), hàng 1 = trái, hàng 2 = mặt (xuống), hàng 3 = phải; 3 cột là
  khung bước chân đứng yên / bước trái / bước phải (đã xác nhận bằng mắt trên
  `body_male/00_00_1.png`: hàng 2 có 2 mắt+miệng nhìn thẳng, hàng 0 chỉ thấy đỉnh đầu).
- **Pokémon follow/follows**: dùng đủ cả 4 cột × 4 hàng (không có cột trống). Thứ tự hàng
  KHÁC với người chơi: hàng 0 = mặt trước (nhìn thẳng, thấy mắt), hàng 1/2 = nghiêng
  trái/phải, hàng 3 = quay lưng (thấy đỉnh đầu/mai) — ngược thứ tự với người chơi (người
  chơi hàng 0 = lưng, ở đây hàng 0 = mặt). Xác nhận bằng mắt trên `follow/001.png`
  (Bulbasaur): hàng 0 thấy 2 mắt đỏ, hàng 3 chỉ thấy lá/mai xanh phía sau đầu.

## Tên tệp nghĩa là gì [ĐO TRONG REPO]

- `body_male/00_00_1.png`, `body_female/...`: `<mã màu da 00-04>_<mã dáng người 00-19>_<pose>`.
  80 tệp/nhóm = 20 dáng (`00`..`19`) × ~4 màu da lồng trong mã đầu, thật ra quan sát cho thấy
  chỉ có mã đầu `00`-`04` (5 giá trị) × mã sau `00`-`15` (16 giá trị) = 80, tools không suy
  luận thêm ý nghĩa hai mã này ngoài "biến thể ngoại hình thân" vì không có bảng tra tên.
- `clothe_male/00_1.png`, `hair_male/00_1.png`, `hats/00_1.png`: `<mã trang phục/tóc/mũ>_<pose>`,
  không có mã màu da (lớp trên không phụ thuộc màu da).
- `mounts/01.png`, `mounts/02_1.png`: thú cưỡi/xe — bố cục KHÁC hẳn (xem mục riêng bên dưới).
- Hậu tố pose `_1/_2/_4/_5` (không có `_3`, đã kiểm bằng cách liệt kê toàn bộ hậu tố xuất
  hiện trong bundle `sdata` cho `body_male`): so bằng mắt 4 tấm `body_male/00_00_<pose>.png`
  cùng mã dáng:
  - `_1`: đứng thẳng, tay/chân dang ra bình thường — tư thế đi bộ.
  - `_2`: chân hơi co, ngả người về trước một chút — tư thế chạy/đạp xe.
  - `_4` và `_5`: gần giống hệt nhau, ngồi thu người, hai tay khoanh trước ngực — tư thế
    ngồi (lướt ván / câu cá / cưỡi thú), KHÔNG phân biệt được `_4` với `_5` chỉ bằng mắt
    trên thân trần (không có đạo cụ ván/cần câu vẽ kèm ở lớp thân). Đây là suy đoán có
    căn cứ hình ảnh, không phải xác nhận từ mã nguồn — ghi rõ để người sau kiểm lại nếu cần.
  - Bằng chứng thêm: `mounts/01.png` (không hậu tố) vẽ y hệt tư thế `_1`/`_2` của xe đạp
    (nhìn nghiêng, đang lăn bánh) → cột nghiêng của `mounts` tương ứng tư thế "đang di chuyển"
    chứ không phải "đứng yên", củng cố cho _1/_2 = đi/chạy.

### `mounts/` — bố cục riêng

`mounts/<n>.png` và `mounts/<n>_1.png` (122 tệp, không phải mọi n đều có cả 2). Nhìn
`mounts/01.png` (xe đạp đỏ) thì đây KHÔNG phải lưới nhân vật: hàng 0/2 vẽ tay lái nhìn từ
trước/sau (nhỏ, co lại giữa ô), hàng 1/3 vẽ cả chiếc xe nhìn nghiêng (tràn rộng hơn 64px,
đè sang ô bên cạnh về mặt hình ảnh dù dữ liệu vẫn là lưới 4×4 64px chuẩn). Tools xuất
nguyên tấm 256×256 không cắt, để mã game tự quyết cách ghép người cưỡi lên trên.

## Lớp chồng người chơi [ĐO TRONG REPO]

Thứ tự vẽ: **thân (body) → trang phục (clothe) → tóc (hair) → mũ (hats)**, đúng khớp pixel
(đã kiểm bằng `alpha_composite` 4 lớp trên cùng tọa độ ô — xem `1_player_outfits.png` trong
thư mục kiểm chứng: viền tóc/mũ không lệch với đầu thân, tay áo khoác không đè lệch tay thân).
Lưu ý: `body_male`/`body_female` không chỉ có màu da người — một vài mã dáng là sinh vật khác
màu xanh lá (có thể là trang phục hoá trang), đây là tài sản gốc thật, không phải lỗi ghép lớp.

## Ngân sách kích thước

| Nhóm | Số tệp | Dung lượng | Ngân sách |
|---|---|---|---|
| `art/sprite/player/*` (đủ, không cắt bớt clothe/hats) | 2027 | 14 MB | ~12 MB (vượt nhẹ, xem lý do dưới) |
| `art/sprite/npc/` (51 vai đã chọn tay) | 51 | 644 KB | — |
| `art/sprite/poke/{big,small64,small64shiny,follow,follows}` | 831 | 2.8 MB | — |
| `art/item/*.png` | 959 | 2.3 MB | — |
| `art/battle/*.png` | 57 | 5.8 MB | — |
| `art/fx/*.png` | 27 | 584 KB | — |
| `art/ui/logo.png` | 1 | 204 KB | — |
| `audio/music/*.ogg` (37 bài, xem danh sách dưới) | 37 | 22 MB | |
| `audio/sfx/*.ogg` (42 clip) | 42 | 1.1 MB | |
| `audio/cry/*.ogg` (251) | 251 | 3.3 MB | |
| **Audio tổng** | | **~26 MB** | ≲45 MB (đạt, còn dư nhiều) |
| `data/gamedata.js` | | 400 KB | <600 KB (đạt) |

**Vì sao clothe/hats không cắt bớt**: đã đo full-export trước khi quyết định — 2027 tệp hết
14 MB, chỉ vượt ngân sách ước lượng ~12 MB có 2 MB (17%). Giữ nguyên toàn bộ 468 trang phục +
689 mũ để bộ tạo nhân vật đầy đủ lựa chọn thay vì đoán mò cắt bớt cái nào, đổi lấy hụt ngân
sách nhỏ có thể chấp nhận được.

### Nhạc: đã đổi từ "xuất hết 142 bài" sang danh sách chọn tay 37 bài [ĐO TRONG REPO 2026-09-27]

Bản đầu xuất toàn bộ `adata`+`adata2`+`adata3` (142 bài, gồm cả 55 bài Unova B/W trong
`adata2` và nhạc lễ hội Xmas/Spooky trong `adata3`) theo đúng chữ của đề bài gốc — nặng
119 MB ở 96kbps, phải hạ xuống 32kbps mono mới vừa ngân sách 45 MB, nghe đục hơn cần thiết.
Điều phối viên sửa lại đặc tả: chỉ cần 37 bài phục vụ bối cảnh Kanto sớm (thị trấn/route đầu,
Pokémon Center, cửa hàng, phòng Oak, các trận gym/hoang dã/huấn luyện viên, và các "jingle
phát hiện" theo lớp NPC). Danh sách này là hằng số `KANTO_MUSIC` ở đầu `rip_audio.py`, xuất
ở **96 kbps stereo** (đúng mức đề gợi ý ban đầu, không cần hạ bitrate nữa vì danh sách đã đủ
nhỏ). Chạy `rip_audio.py music` sẽ **xoá mọi tệp `.ogg` trong `audio/music/` không nằm trong
`KANTO_MUSIC`** để thư mục luôn khớp đúng danh sách, không cộng dồn rác từ lần chạy "xuất hết"
trước đó. Kết quả: 37/37 bài tìm thấy đủ trong bundle gốc, 22 MB (từ 119 MB xuống còn ~18%).

**`title` và `default_0..3` nghe như gì** (suy từ tên + thời lượng, không nghe thử):
`title` dài nhất trong bộ (105s, ~1'45") — khớp bài nhạc màn hình tiêu đề/đăng nhập
(`level1` trong ARCH.md, đảo có Pokémon Center theo mô tả) vì đây là kiểu nhạc lặp dài cho
màn chờ; `default_0..3` là 4 bản ngắn hơn và giảm dần đều (51s/49s/47s/41s) — mẫu số + độ dài
sát nhau kiểu này thường là một bài nhạc nền "khu vực chung" chia theo biến thể (khả năng cao
nhất: 4 mốc thời gian trong ngày sáng/trưa/chiều/tối cho vùng chưa có nhạc riêng), không phải
4 bài độc lập.

## Vai trò NPC đã chọn tay [ĐO TRONG REPO]

Xem toàn bộ 520 sprite qua 6 tấm liên hệ `D:\pokeone-ref\catalog\npc\contact_sheet_*.png`
(sinh tự động bởi `rip_2d.py npc`, khung mặt = hàng 2 cột 1) rồi phóng to ~27 ứng viên để
chọn. PokéOne là game gốc riêng (không phải remake game-boy Kanto), nên KHÔNG có sprite nào
đúng là "Gary"/"Oak" nguyên bản — các vai dưới đây là NPC có **trang phục đúng mô-típ vai đó**
(áo khoác phòng thí nghiệm cho scientist/oak, mũ phượt cho hiker...), không phải nhận diện
nhân vật thật. Không tìm thấy NPC nào rõ ràng là y tá (đầm trắng chữ thập đỏ) hay cảnh sát
(đồng phục xanh dương) trong cả 520 tấm — cố tình để trống `nurse`/`officer_jenny` thay vì
đoán bừa, đúng luật "chỉ đặt tên vai khi hình rõ ràng đúng vai đó".

| Vai | sprite | Lý do |
|---|---|---|
| `oak` | sprite350 | Ông già tóc bạc, áo khoác xám kiểu giáo sư |
| `scientist` | sprite344 | Hói đầu, áo khoác trắng phòng thí nghiệm |
| `hiker` | sprite173 | Mũ phớt nâu, áo khoác leo núi |
| `old_man` | sprite8 | Ông già kính, áo len xanh |
| `granny` | sprite9 | Bà già tóc hồng bạc, đầm xanh |
| `youngster` | sprite27 | Trai tóc gai cam, quần short |
| `lass` | sprite236 | Gái tóc đuôi ngựa đen, đầm xanh |
| `generic_1..44` | xem `NPC_ROLES` trong `rip_2d.py` | Khách qua đường Kanto bình thường, đã loại bỏ hết trang phục hoá trang lễ hội (xác ướp/ma cà rồng/phù thuỷ) và vật thể không phải người (đá, tường, biển hiệu render chung trong `sdata/npc/`) |

Hai lượt sửa sau khi xem tấm kiểm chứng: `sprite71` (một mảng tường/đá render lẫn vào dải
NPC) và `sprite101` (khung trong suốt, NPC rỗng không dùng trong bundle) bị loại khỏi
`generic_21`/`generic_27`, thay bằng `sprite40`/`sprite110`.

## Tiếng kêu — bằng chứng số thứ tự = dex quốc gia [ĐO TRONG REPO]

`cdata` có 805 tệp `crys/<n>.wav`, đánh số 3 chữ số từ `001` đến `807` (2 số bị thiếu trong
khoảng, không ảnh hưởng 1-251). Kiểm `crys/001..251.wav` **đủ cả 251, không thiếu số nào**.
Đối chiếu độc lập với `pokemon.txt`: trường `ID` của mỗi dòng `Form==""` (dạng gốc, không phải
mega/form khác) chạy đúng 1-251 không lệch, không trùng — nghĩa là cả hai nguồn (tệp .wav và
bảng loài) đều đánh số liên tục 1-251 theo đúng dex quốc gia, không có khoảng trống hay số bị
xáo trộn ở vùng 1-251. Không nghe thử tệp nào (đúng yêu cầu "listening-free evidence").

## Icon vật phẩm — bằng chứng ánh xạ ItemImage → tệp idata [ĐO TRONG REPO]

`items.txt` có trường `ID` (số thứ tự vật phẩm) và `ItemImage` (số tệp icon) — HAI SỐ NÀY
KHÁC NHAU. Đo được: `ItemImage - ID == 1` cho 935/994 vật phẩm (mọi Poké Ball soi bằng mắt đều
khớp: Master Ball ID1→ItemImage2, Ultra Ball ID2→ItemImage3, Great Ball ID3→ItemImage4,
Poké Ball ID4→ItemImage5, Safari Ball ID5→ItemImage6, Net Ball ID6→ItemImage7 — xem
`strip_items.png` trong thư mục kiểm chứng, đối chiếu màu sắc từng quả bóng đúng thứ tự).
59 vật phẩm còn lại (mọi TM/HM, xe đạp, thú cưỡi, trang phục) **dùng chung 1 ItemImage đại
diện** khác hẳn công thức `ID+1` (vd tất cả TM01-99 đều trỏ icon ~340, không phải theo ID
riêng) — nghĩa là **`ItemImage` luôn là nguồn đúng**, không được suy `img` từ `ID`.

**Công thức cuối**: `idata_file_number = ItemImage - 1` (vì `idata` bắt đầu từ `1.png`, không
có `0.png`, nên `ItemImage=1` — Null Item — không có icon thật, `rip_data.py` trả `img=null`
cho trường hợp này). Có đúng 1 khoảng trống khác trong bundle gốc: "Oak's Parcel" trỏ
`ItemImage=1350` → `idata/1349.png`, tệp này **không tồn tại trong bundle gốc** (đã kiểm:
`idata` chỉ có 961/1404 số trong khoảng 1-1404, có nhiều lỗ hổng) — `rip_data.py` kiểm tồn
tại trên đĩa trước khi gán `img`, trả `null` cho trường hợp thiếu thay vì ghi đường dẫn hỏng.

## Loài (`P1.SPECIES`) — RatioM và dex [ĐO TRONG REPO]

- `pokemon.txt` có nhiều dòng cho mỗi loài (form/giới tính/mega khác nhau), nhưng trường
  `ID` **đúng bằng dex quốc gia 1-251 không lệch** (không như `Index.txt`, vốn chèn thêm số
  thứ tự cho từng form khiến lệch dần). Mỗi dex 1-251 có đúng 1 dòng `Form==""` (dạng gốc) —
  dùng dòng đó làm nguồn cho `P1.SPECIES[dex]`.
- `male` (RatioM) có 2 giá trị đặc biệt dễ nhầm: **`0.0` = KHÔNG GIỚI TÍNH** (Magnemite,
  Voltorb, Ditto, Porygon, Unown, mọi huyền thoại Mewtwo/Mew/3 chim/3 thú/Lugia/Ho-Oh/Celebi —
  đối chiếu đúng danh sách loài không giới tính thật của Pokémon), còn **`0.01` = gần như
  luôn là CÁI** (Nidoran-F, Chansey, Kangaskhan, Jynx, Smoochum, Miltank — đúng danh sách loài
  100% cái thật). Không có giá trị nào nghĩa là "0% đực nhưng có giới tính" vì `0.0` đã dành
  riêng cho không giới tính.

## Bảng khắc hệ (`P1.TYPECHART`)

`typechart.txt` có 18 dòng `Type: 0..17`, xác nhận đây là thứ tự numeric-id kinh điển của
Pokémon Showdown (Normal,Fighting,Flying,Poison,Ground,Rock,Bug,Ghost,Steel,Fire,Water,Grass,
Electric,Psychic,Ice,Dragon,Dark,Fairy) bằng cách so hàng `Type:0`: kháng Đá (cột 5 = 0.5),
miễn nhiễm Ma (cột 7 = 0.0), kháng Thép (cột 8 = 0.5) — đúng 3 đặc điểm khắc hệ của Normal.
Xuất dạng `{order: [...], chart: {TenLoai: {TenLoaiDoi: heso, ...chi ghi khac 1.0}}}`.

## Mã hoá tệp .txt nguồn [BẪY ĐÃ SẬP]

Các tệp `D:\pokeone-ref\data\*.txt` là JSON có **dấu phẩy thừa** trước `}`/`]` (không hợp lệ
JSON chuẩn — phải regex bỏ trước khi `json.loads`) và xen **vài byte hỏng không phải UTF-8**
(vd `0x9d`) giữa các đoạn text hợp lệ UTF-8 (chữ có dấu như "Pokémon" mã hoá đúng UTF-8 2 byte
`0xC3 0xA9`). Đọc bằng `latin-1` (map đủ 256 byte, không bao giờ throw) làm mojibake TOÀN BỘ
văn bản có dấu ("Pokémon" → "PokÃ©mon") dù không lỗi khi chạy. Cách đúng: đọc `utf-8` với
`errors='replace'` — giữ đúng dấu, chỉ mất đúng byte hỏng (thay `U+FFFD`). `moves.txt` còn có
ký tự điều khiển thô trong description → phải gọi `json.loads(s, strict=False)`.

## Kiểm chứng đã làm

- Contact sheet NPC: `D:\pokeone-ref\catalog\npc\contact_sheet_0001-0100.png` .. `0501-0520.png`.
- Tấm kiểm chứng theo yêu cầu R4 (xem bằng Read tool trước khi giao việc):
  `%TEMP%\pokeone-2d-shots\1_player_outfits.png` (3 outfit × 4 hướng, ghép đủ 4 lớp),
  `2_npc_roles.png` (51 vai có nhãn), `3_pokemon_2d.png` (small64/big/follow, 9 dex mẫu),
  `4_items_first100.png`, `5_battle_bg.png`, `6_fx.png` (thêm, không bắt buộc).
- `tools/check_paths.py`: 0 đường dẫn thiếu sau khi vá 2 lỗ hổng icon vật phẩm (xem mục icon).
- `ffprobe` mẫu: nhạc 61-103s ở ~27-35 kbps thực tế (mono 32k mục tiêu), sfx 0.1-8.5s, cry
  0.7-1.6s — số liệu hợp lý, không có tệp 0 byte hay quá thời lượng gốc.
