# Tile map của Soul Knight — bóc ra để vẽ theo

Chủ dự án, khi làm bảng `TUONG` trong `phong.js`: *"phần wall bạn phải dựng kiểu soul knight
như vậy nè"*. Rồi: *"trích xuất tile map của soul knight ra để tui biết cách vẽ theo"*.
Bài này là kết quả của lần bóc đó, ngày 2026-09-08.

Nguồn: **Soul Knight 8.5.1 (ChillyRoom)**, tệp `~/Downloads/Soul+Knight_8.5.1_APKPure.xapk`.
Bóc bằng UnityPy 1.25 từ `UnityDataAssetPack.apk` → `assets/AssetBundles/`.

> **ART TRONG BÀI NÀY KHÔNG PHẢI CỦA DỰ ÁN** và không nằm trong repo. Kho ảnh đã bóc để ở
> `~/Downloads/sk-ref/tilemap/` (ngoài cây git, cùng chỗ với `sk-ref` đã có từ đợt `gear.png`).
> Trong repo chỉ có bài này: **số đo và luật**, không có một điểm ảnh nào của ChillyRoom.

Quy ước đánh dấu, giống `RESEARCH.md`:
- `[ĐO]` — đếm/đo trực tiếp trên bản trích, ngày 2026-09-08. Chạy lại được, xem mục 7.
- `[ĐO TRONG REPO]` — đo trên mã của `repo2d`.
- `[ĐỀ XUẤT]` — bài này nghĩ ra, **không** có trong game gốc.

---

## 1. Kho đã bóc nằm đâu

```
~/Downloads/sk-ref/tilemap/
  SK-TILESET.png        ⭐ MỘT TẤM TO — cả bộ tile xếp gọn thành 8 khối có tiêu đề,
                          phóng ×3 nên 1 ô = 48px, đúng bằng lưới nguồn của repo2d.
                          Kẻ sẵn lưới 16 gốc + khung biên miếng thật. Vẽ đè lên được luôn.
  index.html            mở bằng trình duyệt — xem cả 282 mẫu phòng, lọc theo tên/cỡ/đối xứng
  patterns.js           dữ liệu cho trang trên (272 KB)
  pattern/*.json        282 mẫu phòng, nguyên văn từ game
  patterns-ascii.txt    282 mẫu vẽ bằng ký tự — đọc thẳng trong terminal, không cần trình duyệt
  atlas-theme/          80 ATLAS NGUYÊN TẤM, đã đổi tên theo theme:
                          forest · ice · ruins · castle · graveyard · halloween · ice_cave ·
                          swamp · relic · machinery_city · alien · volcano · island · seabed ·
                          ancient_battlefield · monolithic_mountains_ruins · cellar · level_object
                          và bốn tấm *RoomBase (tường + sàn của phòng theo chương)
  atlas/                1.772 texture thô, tên nguyên gốc của Unity
  sheet-tiles16.png     151 tile 16×16 phóng 4×, có nhãn
  sheet-hr-32.png       bộ tường/sàn lưới 32 (chương 4, khu "HR"), phóng 4×, kẻ lưới 16
  sheet-rb-64.png       bộ tường lưới 64 (chương 4, khu "RB"), đủ góc + đầu mút, phóng 3×
  sheet-wall.png        13 miếng tường nguyên thuỷ 16px, kẻ lưới 16
  sprites/<bundle>/     ~4.500 sprite bóc từ 23 bundle level/room
  tools/*.py            toàn bộ kịch bản đã dùng — chạy lại được, xem mục 7
```

**Atlas nguyên tấm KHÔNG phải tileset xếp lưới.** Đây là chỗ dễ hụt: Unity đóng gói sprite
bằng thuật toán nhồi hộp, nên tấm `forest.png` hay `MonolithicMountainsRuinsRoomBase.png` là
một mớ miếng to nhỏ nhồi lẫn nhau, có miếng bị xoay — nhìn được nhưng **không đo và không vẽ
theo được**. Muốn một tấm ngăn nắp thì phải cắt sprite ra rồi xếp lại: đó chính là
`SK-TILESET.png`. Soul Knight không có tệp nào kiểu `interiors.png` của LimeZu, vì nó không
cần — engine gọi từng sprite theo tên, không cắt theo toạ độ trên tấm.

---

## 1b. Kho ấy đã được lấy những gì, tính tới 2026-09-11

Bài này ra đời để **vẽ theo** tường và sàn. Nhưng cùng cái kho ấy về sau còn cho ra bốn thứ nữa,
và chúng KHÔNG phải tile — chúng là sprite cắt thẳng, dựng bằng `art/tools/lam-bay.py`:

| Vào game thành | Sprite gốc | Ghi chú tra cứu |
|---|---|---|
| bẫy gai | `sting_MMR_0` / `_1` | **Đừng tìm chữ "spike"** — `spikes01.png` trong kho là vệt loé sáng, không phải gai. Tên thật là `sting`, tra ra từ bảng ký tự của 282 mẫu phòng (`patterns-ascii.txt`, ký tự `^`). |
| hộp bẫy laser | `ElectricBox_0` / `_8` | khung gốc rộng 53px chứa HAI tủ; cắt lấy tủ trái, `0..19` |
| thanh tia | `rgb_laser_0` | bảy màu `_0.._6`, mỗi tấm 23×12 |
| rương | `chest_anim_4` | bảy khung nâu `_0.._6` là bảy nhịp le lói của khoá — **không có khung mở** |
| con Rương răng | `chest_monster1_0.._16` | 17 khung, ~28×30, cùng thân rương với `chest_anim` |

Chỗ tra nhanh: `sprites/levelobjects/` giữ gần hết đồ đạc dùng chung; `sprites/level__2__g/` là
khu máy móc (`ElectricBox`, `Pipe`, cửa `RB_Door_*`); `sprites/level__4__a/` là khu núi đá
(`sting_MMR`). Tên trong kho là tên Unity gốc, nên tìm bằng tiếng Anh thường trượt — tra bảng ký
tự của mẫu phòng trước, nó cho đúng cái tên engine dùng.

---

## 2. Ba tầng của một tile map Soul Knight

Đây là chỗ khác căn bản so với cách `repo2d` đang dựng, và là câu trả lời cho "vẽ theo kiểu gì".

| Tầng | Là gì | Ai quyết |
|---|---|---|
| **Ô lưới** | 16×16 điểm ảnh. Mọi thứ khác là bội của nó. | cố định |
| **Vỏ phòng** | tường + sàn + cửa. Vẽ bằng tileset của CHƯƠNG. | engine dựng theo hình phòng |
| **Ruột phòng** | thùng, gai, tường lửng, bệ tăng tốc, điểm sinh quái. | **mẫu phòng** — 282 tệp JSON |

Vỏ và ruột **tách hẳn nhau**. Một mẫu phòng vẽ tay chạy được ở mọi chương: cùng một mẫu,
chương 1 ra tường rêu, chương 4 ra thành đá. Giống hệt luật `do` trong `phong.js` — chữ `T`
ở bếp ra cái quầy, ở lớp học ra cái bàn — nhưng Soul Knight áp nó cho **cả bức tường**, không
chỉ đồ đạc.

---

## 3. Tường — đo bằng điểm ảnh

### 3.1 Bộ nguyên thuỷ, lưới 16 `[ĐO]`

| Miếng | Cỡ | Là gì |
|---|---|---|
| `wall_u` | 16×16 | **mặt trên** tường (nhìn từ trên xuống) |
| `wall_m` | 16×16 | **mặt trước** tường, một ô |
| `wall_L` / `wall_mid` / `wall_r` | 16×**46** | nguyên một bức: đỉnh + thân + chân, ba biến thể trái/giữa/phải |
| `wall_d` | 16×**80** | bức cao 5 ô |
| `wall_research1..3` | 16×80 | bức cao 5 ô, ba nước sơn |
| `tiles_Baseboard` | 16×16 | **chân tường** — dải sáng ở đáy |
| `common_hideRoom_roomBase_wall_0/1` | 16×**24** | mặt trước tường phòng ẩn |
| `common_hideRoom_roomBase_wallTop_0/1` | 16×16 | mặt trên tường phòng ẩn |
| `obstacle_wall_MMR_0..3` | 16×**24** | tường lửng trong phòng |

**Con số phải nhớ: mặt trước tường cao 24, không phải 16.** Một ô rưỡi. Hai chỗ độc lập nhau
trong game đều dùng đúng 24 (`hideRoom` và `obstacle_wall`), nên đó là luật chứ không phải
tình cờ. Cộng mặt trên 16 nữa thì một bức tường chiếm **40 điểm ảnh dọc = 2,5 ô**, trong khi
chỉ **ăn 1 ô đường đi**.

Bức `wall_L/mid/r` 16×46 là cùng một ý ở mức cao hơn: 16 đỉnh + 24 thân + 6 chân.

### 3.2 Bộ chương 4, lưới 32 và 64 `[ĐO]`

Về sau ChillyRoom **không vẽ từng ô nữa** — họ vẽ miếng gộp nhiều ô, và thêm một bộ ghép đầy đủ.

Khu "HR" (lưới 32 = 2 ô):

| Miếng | Cỡ | Nghĩa |
|---|---|---|
| `HR_Wall_1..4` | 32×**48** | mặt trước tường, cao 3 ô: mép trên · thân có hoa văn · chân sáng + cỏ |
| `HR_FontWall_Side_1/2` | 32×48 | bức đứng ở mép trái/phải |
| `HR_WallTop_1/3/7/9` | 32×32 | mặt trên — **tên là số bàn phím**: 1 = góc dưới-trái, 3 = dưới-phải, 7 = trên-trái, 9 = trên-phải |
| `HR_WallTop_H_1..4` | 32×16 | dải mặt trên nằm ngang |
| `HR_WallTop_V_1..4` | 16×32 | dải mặt trên dựng đứng |
| `HR_Floor_1..5` | 32×32 | sàn |
| `HR_Door` | 41×40 | cửa |

Khu "RB" (lưới 64 = 4 ô), và đây là bộ **đầy đủ nhất** — chép luật này là chép được cách
Soul Knight ghép tường:

```
Low_RB_Wall_H_0..3       64×64   thân ngang, 4 biến thể
Low_RB_Wall_V_0..3       64×64   thân dọc, 4 biến thể
Low_RB_Wall_LU/RU/LD/RD  ~64×64  bốn GÓC
Low_RB_Wall_H_Odd        32×64   nửa miếng, để vá khi chiều dài LẺ ô
Low_RB_Wall_V_Odd        63×32   nửa miếng, chiều dọc lẻ
Low_RB_Wall_End_VU/VD    64×64   ĐẦU MÚT — chỗ bức tường cụt, không nối tiếp
High_RB_*                như trên, tường CAO (thành đá có lỗ châu mai)
High_RB_Wall_End_Odd_HL/HR/VU/VD   đầu mút + lẻ ô, bốn hướng
HighC_RB_*               tường cao có mái
RB_Door_H / RB_Door_V    62×22 / 26×124
```

Ba tầng cao — `Low_` / `High_` / `HighC_` — là ba mức che khuất khác nhau, không phải ba nước
sơn. Tường thấp: nhìn qua được, bụi đá và cây. Tường cao: chắn hẳn tầm nhìn.

### 3.3 Rút ra bốn luật để vẽ theo

1. **Tường là một KHỐI CÓ BỀ DÀY, không phải một đường kẻ.** Luôn có ba phần theo chiều dọc:
   mặt trên (tối hơn) · mặt trước (sáng, có hoa văn) · chân tường (sáng nhất, một dải mỏng).
2. **Mặt trước cao 1,5 ô nhưng chỉ ăn 1 ô đường đi.** Phần thừa tràn LÊN TRÊN, đè lên ô đã vẽ.
   `phong.js` đã làm đúng điều này cho đồ đạc rồi (`veMieng`, phần cao hơn ô tràn lên) — tường
   chưa được hưởng luật đó.
3. **Bộ ghép tối thiểu là 11 miếng**: thân ngang, thân dọc, 4 góc, 2 đầu mút, 2 miếng lẻ ô,
   1 mặt trên. Thiếu miếng "lẻ ô" thì chỉ bức tường dài chẵn ô mới ghép khít — đó là lý do phải
   có `_Odd`.
4. **Mỗi thân tường có 3–4 biến thể** bốc theo toạ độ ô, để một bức dài 14 ô không lặp thành sọc.

---

## 4. Sàn `[ĐO]`

151 tile sàn 16×16 trong bản trích. Mỗi theme là một bộ nhỏ, và bộ nào cũng theo đúng khuôn này:

| Vai | Số miếng mỗi theme | Ví dụ |
|---|---|---|
| Nền trơn | 1–2 | `sand_1`, `relic_floor_2_*` |
| Nền "bẩn" — vết nứt, vết cỏ, viên gạch lệch | 4–8 | `sand_2..9`, `floor_forest_01_*` |
| Rìa — chỗ sàn gặp thứ khác (cỏ, tuyết, nước) | 8–9 (bộ góc đủ hướng) | `sand_c1..c9` |

Hậu tố `_c1..c9` cũng là **số bàn phím**: `c4` là rìa bên trái, `c6` bên phải, `c8` phía trên,
`c2` phía dưới, `c7/c9/c1/c3` là bốn góc, `c5` là giữa. Cùng quy ước với `HR_WallTop_1/3/7/9`.

Nền trơn chiếm phần lớn diện tích; tile "bẩn" rắc thưa. Đây là chỗ `repo2d` đã làm đúng —
`san` bốc 1 trong 6 biến thể theo toạ độ ô `[ĐO TRONG REPO]`.

---

## 5. Ruột phòng — 282 mẫu, và chúng nói gì

`patternroom.ab` chứa **282 TextAsset**, mỗi tệp là một JSON:

```json
{"patternSize":{"x":15,"y":15},
 "canGenerateSpecialObject":true,
 "enemyGenerateConfig":{"enemyIDInfos":[{"enemyID":"e_skeleton04","weight":40}],
                        "fixedTotalPoints":16,"fixedTotalGenerateTimes":2},
 "itemInfos":[{"Id":"wall","Position":{"x":5,"y":7}}],
 "enemyPoints":[]}
```

Xem bằng mắt: mở `~/Downloads/sk-ref/tilemap/index.html`, hoặc đọc `patterns-ascii.txt`:

```
### group0_level1_7_1   21x15   items=61  enemyPoints=8
.....................
.....................
.....................
.....................
.........e1e.........
.....OOOOO1OOOOO.....
....eOOx.O1Ox.OOe....
....1111111111111....
....eOOx.O1Ox.OOe....
.....OOOOO1OOOOO.....
.........e1e.........
.....................
.....................
.....................
.....................
```

### 5.1 Cỡ phòng `[ĐO]`

| Cỡ (ô) | Số mẫu |
|---|---|
| 15×15 | 92 |
| 15×21 | 74 |
| 21×15 | 71 |
| 21×21 | 40 |
| 32×32 / 120×16 / 10×10 | 5 (phòng đặc biệt) |

**Chỉ hai con số: 15 và 21.** Cả hai LẺ — phòng luôn có đúng một ô tâm, nên mọi mẫu đối xứng
được quanh tâm mà không lệch nửa ô. Tỉ lệ 21/15 = 1,4 ≈ khung hình ngang.

### 5.2 Cả bảng chỉ có 12 ký hiệu `[ĐO]`

| Id | Số lần đặt | Có mặt ở | Là gì |
|---|---|---|---|
| `box` | 3.937 | 48% số mẫu | thùng gỗ phá được |
| `wall` | 2.639 | **60%** | tường lửng trong phòng (`obstacle_wall`, 16×24) |
| `speed1` | 1.943 | 37% | bệ tăng tốc (`SpeedPlate`) |
| `sting` | 1.912 | 21% | gai (`Thorn`) |
| `box_color` | 1.149 | 2% | thùng sơn màu — màu ghi trong `ExtraParamDict.color` |
| `speed2` | 621 | 14% | bệ tăng tốc mạnh |
| `cask1` / `cask3` / `cask2` | 316 / 224 / 57 | 22% / 16% / 4% | thùng phuy ba kiểu |
| `brazier` | 167 | 16% | lư lửa |
| `obstacle1` / `obstacle2` | 118 / 149 | 11% / 11% | vật cản không phá được |

Mười hai. Không hơn. Cả một trò chơi bốn chương dựng bằng mười hai ký hiệu — vì cái quyết định
mặt mũi căn phòng là **tileset của chương**, không phải danh sách đồ.

Và mỗi mẫu chỉ dùng vài loại: **74% số mẫu dùng đúng 2 hoặc 3 loại** (129 mẫu dùng 2, 79 mẫu
dùng 3). Nhiều nhất là 7 loại, đúng một mẫu.

### 5.3 Năm luật bố cục, đo trên cả 282 mẫu `[ĐO]`

**a. Mẫu neo GIỮA, chừa lề đều bốn phía.** Lề trái luôn bằng lề phải, lề trên luôn bằng lề dưới
— gần như không có ngoại lệ. Lề hay gặp: 3 ô (96 mẫu), 4 ô (47 mẫu), 2 ô (39 mẫu). 84 mẫu lề 0
(chạm sát mép). Vành đai trống ấy là chỗ cho cửa và cho người chơi vòng ra sau.

**b. Đối xứng là mặc định.**

| Kiểu | Số mẫu | % |
|---|---|---|
| xoay 180° | 198 | **70%** |
| gương trái–phải | 167 | 59% |
| gương trên–dưới | 147 | 52% |
| cả hai trục | 144 | 51% |

Phòng Soul Knight vào được từ bốn phía, nên bố cục phải công bằng với mọi hướng vào.

**c. Phòng RẤT thoáng: trung bình chỉ 14,7% số ô có đồ**, mẫu chật nhất cũng chỉ 62,7%.
Một phòng 15×15 = 225 ô thì trung bình chỉ **33 ô** có thứ gì đó. Chủ dự án từng nói về
`repo2d`: *"các phòng đang nhiều quá, cần thoáng hơn"* — 14,7% là con số để nhắm vào.

**d. Vệt tường ngắn.** Trong 1.434 vệt tường ngang: **992 vệt chỉ dài 1 ô**, 202 vệt dài 2 ô.
Tường trong phòng là **chấm và cột**, không phải hàng rào. Vệt dài 9–14 ô chỉ 37 vệt, gần như
toàn nằm ở mấy mẫu vách ngăn đôi phòng.

**e. Điểm sinh quái không bao giờ trùng ô có đồ.** 1.127 điểm trên 161 mẫu, **0 điểm** rơi vào
ô đã có vật thể. Luật cứng, không phải xác suất — quái không bao giờ đẻ trong thùng.

Và điểm sinh quái là **tuỳ chọn**: 121/282 mẫu không khai điểm nào, để engine tự rải.

---

## 6. Đối chiếu với `repo2d` — vẽ theo thì đổi gì

`[ĐO TRONG REPO]` hiện tại: ô thế giới `TILE = 24`, ô nguồn `O = 48` (`phong.js`), vẽ nền ở
`SS = 2`, nên **1 điểm ảnh nguồn = nửa đơn vị thế giới**. Bộ LimeZu là lưới 16 gốc phóng 3×
thành 48.

Quy đổi: **1 ô Soul Knight (16px) = 1 ô repo2d (48px nguồn)**. Nhân ba là ra.

| Soul Knight | Nhân 3 → nguồn repo2d |
|---|---|
| mặt trước tường 16×24 | 48×72 |
| mặt trên tường 16×16 | 48×48 |
| cả bức 16×46 | 48×138 |
| miếng gộp HR 32×48 | 96×144 — **đúng bằng ô nhân vật của `art/crew`** |

Ba việc đáng làm, xếp theo tỉ lệ ăn thua:

1. **Cho tường cao 1,5 ô.** `veTuong()` hiện nhồi cả tường vào MỘT ô 24: nửa trên là mặt trên,
   nửa dưới là mặt trước (`phong.js`, khối `TƯỜNG`). Soul Knight cho mặt trước cao **24/16 = 1,5
   ô** và để nó tràn lên trên. Đây là thứ khiến tường "có bề dày" thay vì trông như vạch kẻ, và
   là thứ chủ dự án nhắc từ đầu. Đổi được mà không phải sửa dữ liệu phòng: chỉ đổi cách vẽ.
2. **Thêm miếng góc và đầu mút.** Hiện mọi ô tường vẽ như nhau nên bốn góc phòng bị vuông tịt.
   Bộ tối thiểu 11 miếng ở mục 3.3.
3. **Kiểm mật độ đồ.** Đếm tỉ lệ ô có đồ trong các mẫu phòng của `repo2d` rồi so với 14,7%.

`[ĐỀ XUẤT]` Không đề xuất bê 282 mẫu phòng sang: chúng vẽ cho phòng 15/21 ô lẻ và cho lối chơi
bắn súng bốn hướng, còn `repo2d` là căn nhà có hành lang. Cái đáng mượn là **luật**, không phải
dữ liệu.

---

## 7. Chạy lại — và mấy cái bẫy đã sập

```python
# 1. lấy bundle ra khỏi xapk (xapk là zip lồng zip)
z  = zipfile.ZipFile("Soul+Knight_8.5.1_APKPure.xapk")
zz = zipfile.ZipFile(io.BytesIO(z.read("UnityDataAssetPack.apk")))
# cần: assets/AssetBundles/{patternroom,common,sprite_atlas,levelcommon}.ab và level/1..4/*.ab

# 2. mẫu phòng = TextAsset trong patternroom.ab
env = UnityPy.load("patternroom.ab")
for o in env.objects:
    if o.type.name == "TextAsset":
        json.loads(o.read().m_Script.encode("utf-8", "surrogateescape"))

# 3. tile = Sprite. PHẢI nạp KÈM sprite_atlas.ab
env = UnityPy.load("common.ab", "sprite_atlas.ab")
```

**Bẫy 1 — nạp một bundle thì mất một nửa số tile.** Nạp `common.ab` một mình: 167 sprite ra
được, **187 hỏng**. Sprite nằm trong SpriteAtlas thì điểm ảnh của nó ở bundle atlas, không ở
bundle khai sprite. Nạp `UnityPy.load("common.ab", "sprite_atlas.ab")` thì 280 miếng nữa hiện
ra. Cùng lỗi ấy làm `levelobjects.ab` hỏng 842/1.011.

**Bẫy 2 — trục y của Unity ngược với trục y màn hình.** `Position.y` trong mẫu phòng đếm từ
DƯỚI lên. In thẳng ra là mọi mẫu lộn ngược. Phải `reversed()` trước khi vẽ.

**Bẫy 3 — `python -c "..."` trong Bash tool ở máy này hỏng.** Nó nuốt lệnh thành một tệp .bat
và ném `IndentationError: unexpected indent` ở dòng `|| goto :error`. Ghi kịch bản ra tệp rồi
`python tệp.py`. Đi kèm bẫy cũ: đặt `PYTHONIOENCODING=utf-8` trước khi in tiếng Việt, và đọc
tệp bằng `io.open(..., encoding="utf-8")`.

**Bẫy 4 — bundle `level/1..3/*.ab` gần như không có tile.** Chúng chứa QUÁI (`enemy20`,
`enemy45`...). Tile map thật nằm ở `common.ab` + `sprite_atlas.ab`, còn bộ tường ghép đầy đủ
thì ở `level/4/{a,b,c}.ab`. Mất một lượt tìm mới ra.

---

## 7b. Bóc TOÀN BỘ, không riêng tile — ngày 2026-09-09

Mục 7 ở trên chỉ bóc mấy bundle liên quan tới tile. Ngày 2026-09-09 bóc nốt cả gói: **94.070
sprite, 2.102 bundle, 465 MB, 46 phút**. Vẫn để ngoài git, ở `~/Downloads/sk-ref/all/`, kèm
`README.md` riêng, `browse.html` (tra cứu bằng `file://`, không cần server), `INDEX.md`
(bảng số liệu), `manifest.tsv` (một dòng một hình) và hai kịch bản `dump_all.py`,
`sheet_find.py`.

Số đo đáng nhớ `[ĐO]`:

| nhóm bundle | số sprite | có gì |
|---|---:|---|
| `skin/` | 41.958 | trang phục nhân vật — **cánh, áo choàng nằm ở đây** |
| `sprite_atlas` | 10.437 | atlas dùng chung |
| `common` | 9.587 | tile, đồ, hiệu ứng nền — bundle to nhất (47 MB) |
| `bin_datapack` | 5.033 | `assets/bin/Data/datapack.unity3d`, **không** phải AssetBundle |
| `ui` + `ui_peek` + `mall` | 4.529 | giao diện, icon, cửa hàng |
| `level/` + `levelcommon` + `levelobjects` | 4.211 | bộ tường/sàn/đồ theo chương |
| `character_drawing/` | 2.155 | tranh chân dung độ phân giải cao, **không phải pixel** |
| `boss/` + `monster_rise/` + `troop2/` | 3.580 | quái và boss |
| `pet/` + `mount/` | 1.099 | thú cưng và thú cưỡi |

Bẫy mới, ngoài bốn cái ở mục 7:

**Bẫy 5 — `grep -i wing` trên bảng kê trả 2.194 dòng rác.** Vì `character_d`**`rawing`** có
sẵn chuỗi "wing" bên trong. Lọc theo đúng cột tên: `awk -F'	' '$2 ~ /wing/'`, đừng grep cả dòng.

**Bẫy 6 — log in ra sau khi xong nguyên một bundle.** `common.ab` ngốn ~10 phút một mình,
nhìn log đứng im tưởng treo. Muốn biết còn sống thì đếm tệp thật:
`find ~/Downloads/sk-ref/all -name '*.png' | wc -l`.

**Bẫy 7 — máy này có nhiều agent chạy song song.** `ps` thấy vài `python.exe` lạ
(`http.server`, `tools/dump_objects.py`) là của agent khác, không phải của mình. Muốn biết
tiến trình nào là của mình thì xem dòng lệnh:
`Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select ProcessId,CommandLine`.

**Cánh (wings) `[ĐO]`** — chỉ có **ba** bộ pixel dùng được trong màn:
`skin/character/vampire/skin_8` (18 khung, ~53×28, cánh dơi tím),
`skin/character/werewolf/skin_10` (17 khung, 32×13, xanh xám mờ),
`skin/character/viking/skin_30` (4 khung, 39×21, cánh lửa). Còn 13 tấm cánh ở
`character_drawing/{druid/skin_12, warlock/skin_2, ranger/skin_15}` là tranh chân dung
độ phân giải cao, dán vào màn chơi sẽ lạc kiểu.

---

## 7c. Bóc nguyên CẢNH, không chỉ ảnh — ngày 2026-09-09

Mục 7 và 7b mới lấy `Sprite`. Nhưng trong `.ab` còn cả cây cảnh, đọc được hết bằng
`obj.read_typetree()`: `GameObject`, `Transform`, `SpriteRenderer`, `Tilemap`,
`BoxCollider2D`. Nghĩa là **không phải đoán chỗ kê đồ nữa** — toạ độ thật nằm sẵn trong đó.

Kịch bản ở `~/Downloads/sk-ref/all/`: `scene_dump.py` (bóc), `scene_render.py` (ghép thử ra ảnh),
`build_room.py` (dựng lưới đi lại + điểm tương tác), `build_room_page.py` (ra trang chơi được).

### Số đo `[ĐO]`

- **`m_PixelsToUnits` = 16** — một đơn vị Unity = 16 điểm ảnh.
- **Vị trí thế giới** = cộng dồn `m_LocalPosition` qua chuỗi `m_Father`, nhân `m_LocalScale`
  từng tầng.
- **Neo sprite** theo `m_Pivot` (0–1) trên `m_Rect`; đa số `(0.5, 0)` = đáy giữa — giống hệt
  luật neo đáy-giữa mà `repo2d` đang dùng ở mục 3.
- **Trục y Unity hướng lên**, ảnh hướng xuống: `py_ảnh = H - (y_game - Y0) - h`.
- **Thứ tự vẽ** = `m_SortingLayer` → `m_SortingOrder` → `-y`. Không phải chỉ y như `repo2d`
  đang làm; game gốc có lớp riêng cho sàn / đồ / tường.
- **Sàn là Tilemap**: `m_Tiles` là danh sách `(ô, dữ liệu)`, `m_TileSpriteIndex` trỏ vào
  `m_TileSpriteArray`, ô 1×1 đơn vị, `m_TileAnchor` = (0.5, 0.5).
- **Sảnh của game gốc rộng 2032×843 điểm ảnh**, gồm **năm khu trong cùng một hệ toạ độ**:
  vườn (x −1117…−384), sảnh chính (−352…200), xưởng (256…785), khu phép (y −464…−183),
  sảnh trên (y 334…608). 22.913 ô lát, 2.672 ô đi được.
- **Collider giữ tên gốc** — `door_enter`, `npc_shaman`, `forge`, `roomdecorateslot_*`.
  Đây là cách duy nhất biết NPC đứng đâu, vì **prefab không chứa NPC**: game sinh lúc chạy.

### Bẫy mới `[ĐO]`

**Bẫy 8 — đừng đặt tên tệp kịch bản là `inspect.py`.** Nó đè module chuẩn, `import UnityPy` chết
với `partially initialized module 'UnityPy' has no attribute 'load' (circular import)`. Cùng họ:
`json.py`, `types.py`, `code.py`.

**Bẫy 9 — `asset2_*` và `texture_c*` là ô màu trơn dùng kèm shader**, phóng 48× làm lớp phủ.
Vẽ thẳng thì thành mảng đen bệt che nửa bản đồ. Phải lọc bỏ theo tên.

**Bẫy 10 — một bundle chứa nhiều biến thể theo mùa cùng lúc**: `hall_0_normal`,
`hall_0_christmas`, `hall_0_halloween`, `hall_0_easter`. Gộp hết thì bí ngô Halloween nằm lẫn
trong sảnh thường. Phải lọc theo tên gốc cảnh.

**Bẫy 11 — `m_TileColorArray` có phần tử rác** (`m_RefCount: 0`, alpha kiểu `1.4e-35`).
Kẹp về 1.0 nếu ngoài khoảng 0–1.

**Bẫy 12 — `m_DrawMode != 0` (Sliced/Tiled)**: kích thước lấy từ `m_Size`, KHÔNG phải
sprite nhân scale. Bỏ qua thì ra tấm 4913×4000.

**Bẫy 13 — Artifact bọc trang bằng reset CSS có `img{max-width:100%}`.** Tấm nền 2032px bị co
còn bằng bề ngang khung, camera trỏ vào chỗ trống → cả sảnh đen thui. Mở bằng `file://` ở máy
KHÔNG lộ ra vì không có luật đó. Chặn bằng `max-width:none` trên ảnh trong khung camera, và
kiểm trước khi đẩy lên bằng cách tự bọc lại đúng cái vỏ ấy rồi chụp màn hình.

---

## 7d. Hai cái con trỏ — và nửa kho hiện ra

Mục 7c dựng được sảnh nhưng thiếu cái lầu. Đào tiếp thì lòi ra hai chỗ đọc sai, sửa xong thì
số món vẽ được nhảy từ **2.756 lên 13.293**. Ghi lại vì đây là loại lỗi im lặng: không báo gì,
chỉ mất đồ.

**Con trỏ Unity là CẶP `(m_FileID, m_PathID)`, không phải chỉ PathID** `[ĐO]`.
`m_FileID = 0` là cùng tệp. Khác 0 thì tra `assets_file.externals[fileID-1]` ra tên CAB của tệp
phụ thuộc. Nếu gom hết vào một rổ rồi tra bằng PathID trần thì mất sạch mọi thứ trỏ sang tệp
khác — nguyên cái sàn của lầu nằm ở đó. Phải đánh khoá bằng `(tên_tệp, path_id)`.

Muốn biết một bundle cần nạp kèm gì: đọc tệp `.manifest` đi kèm nó trong APK, có sẵn mục
`Dependencies:`. Sảnh cần `hero_room/common`, `common`, `sprite_atlas`, `bullet`,
`levelcommon`, `levelobjects`, `ui`, `weapon`.

**Sprite đóng gói trong SpriteAtlas thì `m_RD.texture` RỖNG** `[ĐO]`. UnityPy ném
`PPtr can't deref with m_PathID == 0`. Hình thật nằm ở `SpriteAtlas.m_RenderDataMap`, tra bằng
chính `m_RenderDataKey` của sprite, cắt theo `textureRect` (y đếm từ **dưới** lên) rồi xoay theo
`(settingsRaw >> 1) & 7`. Riêng cảnh sảnh có **2.239 món** phải cứu kiểu này. Đây cũng là lý do
lần trước `common/garlic` và `common/hot_pepper` bóc ra ảnh trắng.

**Lầu bị lưu ở trạng thái TẮT** `[ĐO]` — game chỉ bật khi người chơi lên gác, nên bộ lọc
`m_IsActive` ăn mất. Và lầu **không dùng tilemap**: sàn vẽ thẳng trong một tấm nền 608×416, nên
vùng đi lại phải lấy từ điểm ảnh của nền (sáng hơn ngưỡng = sàn, đen thui = tường).

**Bẫy 14 — mấy tấm phủ phải bỏ**: `asset2_*`, `texture_c*`, `UISprite`, `light_01`,
`portal_center`. Chúng là ô màu trơn hoặc quầng sáng dùng blend cộng; vẽ chồng kiểu thường thì
ra mảng trắng hoặc đen bệt che nửa bản đồ.

**Sảnh đủ hai tầng: 2032×1360 điểm ảnh, 5 khu.** Tầng trên nằm ở y 334…608, rời hẳn tầng dưới —
trong game là một lần chuyển cảnh chứ không đi bộ nối liền.

---

## 8. Giấy phép

Art của **ChillyRoom**, không được đưa vào repo và không được lên GitHub Pages — cùng luật đã
ghi trong `~/Downloads/sk-ref/README.md` cho đợt `gear.png`. Bài này (chữ, số đo, luật) thì
thuộc repo bình thường: đo được thì ai cũng đo lại được, và luật bố cục không phải là art.
