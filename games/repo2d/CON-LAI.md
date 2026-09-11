# Còn lại — bàn giao 2026-09-10

Bản vừa push: **bộ chuột-phím cho máy tính, và ba cái lỗi** (mục 00). Trước đó: xe lao qua
tường vào nhà, cả tổ chạy lên xe lúc thoát (mục 0). Trước đó: ném đồ · đường chỉ lối trên sàn ·
loot vẽ lại · cửa hàng ngoài menu (mục 2).
Dấu build lên `?v=20260910d` — ba chỗ phải bằng nhau: `repo2d/index.html`, `repo-squad/index.html`,
và hằng `BUILD` trong `game.js`.

Hai hồ sơ nghiên cứu nằm cạnh tệp này: **`RESEARCH.md`** (Robbery Bob — trộm, nấp, tiếng ồn) và
**`RESEARCH-DARKWOOD.md`** (Darkwood — nỗi sợ). Cái thứ hai viết 2026-09-11, và kết luận của nó
ngắn gọn là: căn nhà này đã đứng trên năm trong bảy cột của Darkwood rồi; thứ đáng làm tiếp và
rẻ nhất là **cho âm thanh một cái hướng** — cả hệ tiếng hiện chạy mono, không một chữ `pan` nào.

---

## 00. BẢN 20260910c–d — CHUỘT-PHÍM, VÀ BA CÁI LỖI

### 00.1. Chế độ máy tính

Chủ dự án, 2026-09-10: *"khi chơi trên web pc, UI, minimap cần to ra, ẩn các nút không cần bấm
đi, vẫn show countdown skill, bấm E cast skill, Q để interact tủ - xe - cart, roll chuột để đổi
weapon/item."*

`pcMode()` bật khi trình duyệt nói có chuột thật (`hover: hover` + `pointer: fine`) và **tắt
vĩnh viễn ngay khi thấy ngón tay đầu tiên** — laptop có màn cảm ứng vì thế mở ra ở bộ chuột-phím
rồi tự chuyển sang bộ ngón tay đúng lúc người ta chạm vào. Không có công tắc nào phải đi tìm.

| | điện thoại | máy tính |
|---|---|---|
| đi | cần gạt trái | `W A S D` |
| nhìn | cần gạt phải | con trỏ chuột |
| dùng / đánh / ném | nút Dùng (kéo ra để ngắm) | **chuột trái** (giữ = sạc, nhả = bắn) |
| bắn thử ở trạm dịch vụ | nút Bắn thử | **chuột trái**, bấm chỗ nào trong sảnh cũng được |
| đổi ô đồ | nút Swap | **lăn chuột**, hoặc `1 2 3` |
| nhặt · lên xe máy · đẩy xe đẩy · mở tủ | nút Nhặt + nút Tủ | **`E`** (hoặc `Q`) — một phím, tự đổi việc theo cái đang đứng cạnh |
| kỹ năng | nút kỹ năng | **`R`** |
| chạy | nút Chạy | `Shift` (giữ) / `Space` (bật tắt) |
| bỏ ván, chơi lại | — | nút **Ca mới** dưới chân trang (không còn phím) |

Ẩn đi: hai cần gạt, nút Dùng, nút Swap, nút Nhặt, nút Chạy, nút Tủ, nút kỹ năng, trái tim ở chỗ
cũ. Giữ lại và **phóng to theo `uiK()`**: thanh máu/thể lực, dải đồng đội, thanh bệ, bản đồ nhỏ,
mọi dòng chữ. `uiK()` = cạnh ngắn / 620, chặn ở 2,2.

Thay cho cụm nút là **một thanh dưới màn hình để ĐỌC, không để bấm** (`drawPcHud`): nhịp tim,
nắm đấm + ba ô đồ (ô đang cầm viền vàng, số phím ở góc, số lần dùng ở góc kia, vành sạc chạy
quanh ô), đồng hồ hồi chiêu với chữ `E`, và **một dòng nhắc cho phím `Q`** chỉ hiện khi Q thật
sự làm được gì.

**Khung nhìn cũng lùi ra một nấc** (`VIEW_W_WORLD_PC` = 13 ô). Con số 9,5 ô của bố cục ngang đo
cho điện thoại cầm ngang; cũng con số ấy trên màn 900px cho ô 95px, tức phóng to gấp bốn, và
khung nhìn tụt xuống 15x9,5 ô trong khi người cầm điện thoại **dọc** thấy 14x24,9. Người ngồi
máy tính hoá ra nhìn được ÍT HƠN, mà cả trò này là trò nghe ngóng.

### 00.1.b. Vòng sửa thứ hai (bản `d`)

Chủ dự án đọc bảng phím trên rồi trả về hai câu:

*"bắn thử là chuột trái lun á"* — cái nút tròn "Bắn thử" ở trạm là chỗ **duy nhất** trong game
còn bắt người ngồi máy tính rê chuột đi tìm một cái nút, trong khi ngay bên kia cánh cửa, cùng
khẩu súng ấy, bấm chuột là bắn. Hai luật cho một hành động, chia nhau bởi một cánh cửa. Nay
trong sảnh bấm chỗ nào cũng là bóp cò; nút tròn chỉ còn vẽ cho ngón tay. Thay nó là một viên
thuốc chữ giữa đáy màn hình, cùng kiểu với dòng nhắc phím `E`: `chuột trái — Bắn thử — Hoa cải`,
xám đi khi trên tay không có gì bắn được.

*"phím nhặt là E vậy mấy cái trùng E move qua R đi"* — vòng trước tôi đặt `E` làm chiêu và `Q`
làm tương tác. Sai ở chỗ **`E` đã là phím nhặt của bản cũ**: trí nhớ ngón tay không đọc bảng
phím mới. Nên `E` trả về đúng việc cũ của nó, `Q` giữ lại làm lối thứ hai, và chiêu dọn sang `R`.

`R` cũ là *"bỏ ván, chơi lại từ màn 1"* — vòng trước tôi bọc nó bằng một cái chốt bấm-hai-lần,
nhưng việc ấy vốn không thuộc về bàn phím: nó xoá sạch công của cả ca trực, mà nút **Ca mới**
thì nằm sẵn dưới chân trang, lúc nào cũng thấy. Nên bỏ phím, giữ nút.
**Không** gán nó vào `Shift+R`: `Shift` là phím CHẠY, người chơi giữ nó gần như suốt ván, nên
`Shift+R` chính là "đang chạy thì lỡ tay bấm R" — đúng cái tai nạn vừa đi tránh.

### 00.2. Ba cái lỗi

**a) Bot không biết đạp nút giao hàng khi người chơi nằm → ván treo vĩnh viễn.**
*"bot chưa biết cách extract sau khi player chết r -> stuck"*. `stepExtraction` đã mở sẵn quyền
đạp thay từ lâu, nhưng bảng việc của bot (truck, push, cart, deliver, head, loot, roam, idle)
**không có việc nào dẫn chân họ tới cái nút**. Nên: chỉ tiêu đầy, `du` bật, không ai đứng lên
nút, bệ không chốt, `S.levelDone` không bật, không ai về xe — mà người chơi thì đang nằm nên
cũng không tự gỡ được. Ngõ cụt kín. Thêm việc `dap` (xem `mateNenDap`), ba luật: chỉ khi người
chơi không còn đứng, chỉ khi đã đủ chỉ tiêu, và chỉ MỘT người đi. Đứng sau việc vác đầu về, để
bệ chốt xong thì người ấy đứng dậy luôn.

**b) Với xuyên tường.** `nearestLoot` miễn phép tia nhìn trong tầm tay (≤ 1,1 ô) với lý lẽ
"bên kia bức tường thì phải cách ít nhất 38px". Phép đo ấy tính món đồ nằm GIỮA ô, còn món đồ
**tựa vào tường** thì tâm nó chỉ cách mặt tường đúng bán kính của nó — đo lại được 42px, lọt
vào trong tầm với 45,6px. Nay ngoại lệ tầm-tay hỏi thêm đúng một câu: `tuongGiua()` — giữa hai
bên có ô tường nào không. Cùng câu hỏi cho xe đẩy và xe máy.

**c) Cửa kẹt: nhìn không ra, và bắn không thủng.** Thêm `drawDoorGlow` (viền hổ phách bám sát
mép cửa, vẽ ở lớp cộng sáng nên đọc được trong phòng tối; dày và nhấp nháy khi đã vào tầm
phang) và `banVaoCua` (một viên đạn ăn bằng ba nhát phang; ba-bốn phát súng lục là bung, một
phát hoa cải bảy viên hoặc một tia laser thì bung ngay). Đạn của QUÁI thì không phá được —
một tay súng bắn hụt mà tiện tay mở hộ cả căn nhà là căn nhà tự dọn lấy mình.

---

## 0. BẢN 20260910a — XE LAO QUA TƯỜNG

Chủ dự án, 2026-09-10: *"lúc đầu tất cả player + bot đang bồng bềnh trên đường sau đó lao vào bức
tường của map, gạch bể văng ra, sau đó cửa xe mở ra."*

Đoạn phim vào nhà (`startCut('arrive', ...)`) dài 3,25 giây, bỏ qua được bằng một cú chạm bất kỳ
như cũ. Bốn nhịp:

| giây | nhịp |
|---|---|
| 0 → 1,00 | Xe chạy trên con đường phía trên bản đồ, mũi chúi xuống, nhún theo giảm xóc. Người chơi và cả ba bot ngồi trên thùng, mỗi người nhún lệch pha. Đèn pha rọi tới bức tường. Bảng tên màn hiện rồi tắt trong quãng này. |
| 1,00 | **Húc.** Rung màn, chớp nhẹ, `SFX.crash()`, 34 mảnh gạch văng ra (phần lớn theo đà xe vào trong nhà, một phần năm bật ngược ra đường), 11 cụm bụi. Đèn pha lúc này mới tràn được vào phòng — trước đó bị chính bức tường chặn. |
| 1,00 → 2,00 | Xe trượt tiếp, đuôi quăng ngang từ thế chúi xuống về thế nằm, lố một nhịp rồi về đúng chỗ đậu. |
| 2,05 → 3,20 | Cửa sau mở, rồi từng người bước xuống: ghế → miệng cửa sau → chỗ đứng thật. |

Để lại: **`S.gach`** (tối đa 22 mảnh nằm trên sàn tới hết ca) và **`S.tuongVo`** (vết sẹo trên
tường). Cả hai xoá ở `buildLevel` và `buildShop`.

### 0.0. Khúc thoát (2,65 giây)

Chủ dự án, 2026-09-10: *"khúc thoát thì cho bot chạy lên xe cùng player chạy đi mất."* Bản
trước hút cả tổ vào thùng xe trong 0,28 giây bằng một cú nội suy thẳng — không ai chạy cả, mấy
cái bóng trôi ngang qua sàn rồi tắt.

| giây | nhịp |
|---|---|
| 0 → 1,05 | Từng người **chạy** tới cửa sau rồi leo lên thùng, lệch nhau 0,10 giây. Đèn thùng ở miệng cửa sáng lên; đèn pin của mỗi người đi theo họ. |
| 1,10 → 1,50 | Cửa sau đóng, người trong thùng mờ dần rồi khuất hẳn. Đèn của người chơi tụt xuống còn 12% — **căn nhà tối lại sau lưng**. |
| 1,55 → 2,60 | Đèn pha bật, xe quay mũi lên và **vọt ra bằng chính cái lỗ nó húc vào lúc tới**, tăng tốc (quãng đi theo bình phương thời gian) rồi khuất khỏi mép trên khung. |

Ở **trạm dịch vụ** thì vẫn lùi ngang ra như bản cũ — ở đó không có lỗ nào (`xeDiemHuc()` trả
`tuong: false` khi `S.shopMode`).

Ba thứ phải sửa kèm, và cả ba đều thuộc loại "chỗ vẽ khác chỗ đứng":

- **Chân không đảo.** `colFor()` bên `sprites.js` chọn khung chân theo quãng đường của chính
  vật được truyền vào, mà toạ độ thật của cả tổ đứng yên suốt đoạn phim. Chữa bằng `voVe()`:
  một cái vỏ mang toạ độ VẼ, giữ trên `a._ve` để nó là cùng một vật qua các khung. Ngưỡng 1,5
  điểm ảnh/khung tách "đang chạy" khỏi "ngồi nhún trên thùng" mà không cần cờ.
- **Đèn pin và viền người đứng lại giữa sàn.** `mateLights()` và `drawHeadGlow()` vẽ ở toạ độ
  thật, nên có mấy cái viền người xanh lơ đứng chôn chân quanh chỗ đậu trong khi chính mấy
  người ấy đang chạy về xe. Cả hai nay hỏi `mateDrawPos()` khi có đoạn phim.
- **Xếp chỗ ngồi phải đổi theo THẾ CỦA XE.** Hình người vẽ đứng thẳng, cao 38 đơn vị, rộng 19.
  Hai người cách nhau 23 đơn vị theo chiều DỌC màn hình thì người sau chỉ hở cái đầu — đo ở
  khúc thoát bản đầu: bốn người leo lên thùng, ảnh chụp đếm ra HAI. Nay xe dựng thì xếp hai cột
  ba hàng, xe nằm thì xếp một hàng dàn dọc thân, và hai cách ấy được TRỘN theo `|sin(góc xe)|`
  để lúc xe quay không ai bị nhảy chỗ.

**Trạm dịch vụ không có cú húc.** Sảnh trạm là hành lang dọc, hàng bày trên sàn từ hàng 9 tới
hàng 21, xe đậu ở hàng 27 — lao từ trên xuống là cán qua cả gian hàng. Ở đó xe giữ đúng cú
trượt ngang của bản cũ (`xeDiemHuc()` trả `tuong: false`).

### 0.1. Ba thứ ĐO MỚI BIẾT, dùng lại được cho mọi đoạn phim sau

**a) Trong đoạn phim, `step()` KHÔNG chạy — nên camera và cú rung màn đều đứng hình.**
`frame()` chặn hẳn: `if (S.running && !S.dead && !S.cut)`. Hệ quả có hai vế, và cả hai đều
từng âm thầm sai:

- *Camera*: `cam.x/cam.y` chỉ được kéo trong `step()`, nên suốt đoạn phim nó nằm nguyên ở chỗ
  ván TRƯỚC bỏ lại. Bản cũ không lộ vì cái xe trượt vào đúng giữa khung sẵn. Đoạn phim nào có
  thứ để nhìn thì phải TỰ LÁI camera — xem `camTheoXe()` — và `camSnap()` khi bị cắt ngang.
- *Rung màn*: `fxShake()` ghi `FX.shakeT = S.time`, còn `draw()` lấy pha bằng `S.time -
  FX.shakeT`. `S.time` đứng thì pha đóng băng và biên không tụt: cả khung hình lệch đi một
  quãng CỐ ĐỊNH cho tới hết đoạn phim, chứ không rung.
- *Cú loé* còn tệ hơn, và chỗ này chỉ lòi ra nhờ bộ đo: `FX.flash` đuổi theo `FX.flashTo`
  bằng chính dòng bị chặn ấy, nên trong đoạn phim nó **không bao giờ sáng lên** — cú loé của
  cú húc tường lẽ ra không thấy một điểm ảnh nào. Tệ hơn nữa, `FX.flashNghi` (quãng nghỉ
  chống nháy) đứng nguyên 0,55 tới hết phim, nên cú loé THẬT đầu tiên sau đó chỉ còn một
  phần tư sức: bộ `dịu mắt` đo được đỉnh tụt **0,09 → 0,072** và đỏ lên.

Chữa cả hai ở `fxTheoGioThat()`: lùi `shakeT` theo dt thật, rồi hạ cả cụm bằng `haFX()` —
đúng cái hàm `step()` vẫn dùng, tách ra để hai bên không trôi khỏi nhau.

**b) Từ chỗ đậu xe, chỉ có tường TRÊN và DƯỚI là nằm trong khung.** Khung nhìn rộng 14 ô
(`VIEW_W_WORLD`), khung máy 9:16 nên cao 24,9 ô: nửa khung ngang 7 ô, nửa khung dọc 12,4 ô. Xe
luôn đậu giữa phòng 0 (`carRoom = 0`), cách mép trên 7,5 ô và cách hai mép trái/phải 10,5 ô.
Nên xe lao **từ trên xuống**; lao từ trái sang thì bức tường bị húc nằm ngoài khung.

**c) Ngoài mép bản đồ là chỗ vẽ được.** `worldCv` chỉ vẽ đúng khổ bản đồ, nền khung là màu đen,
nên mọi thứ vẽ ở `y < 0` không đè lên một điểm ảnh nào của căn nhà — con đường nằm ở đó. Nhưng
**lớp tối vẫn nhân xuống cả vùng ấy**, nên phải có nguồn sáng đi kèm (`denXeVao()` trong
`buildLight`), không thì cả cú lao diễn ra trong bóng tối tuyệt đối.

**d) `const` ở đầu tệp mà đọc hằng khai báo dưới cuối tệp thì cả `game.js` chết.** Vùng chết
của `const`: `const XE_THUNG_GIUA = -TRUCK_L*0.15;` đặt ở khối đoạn phim (dòng ~7600) đọc
`TRUCK_L` khai báo ở phần vẽ (dòng ~11400) — ném `ReferenceError` ngay lúc nạp tệp, và triệu
chứng duy nhất nhìn thấy được là `REPO is not defined`, tức là trông y như tệp không tải. Trong
HÀM thì không sao, vì hàm chỉ chạy sau khi cả tệp đã nạp. Mọi con số đo theo `TRUCK_L`/`TILE`
ở nửa trên tệp phải nằm trong hàm.

Còn một luật nữa, thuộc về luật chơi chứ không phải phần vẽ: **ô lưới của mép bản đồ KHÔNG bị
đục**. Mép bản đồ mà thủng thì quái đi ra ngoài trời, đồ rơi ra ngoài trời, `flood()` coi cả
vùng hư không là đi được. Nên `S.tuongVo` vẽ cái lỗ ở dạng **đã bị gạch vụn lấp**, chứ không vẽ
thông thống — vẽ thông thống là mời người chơi đi xuyên tường rồi đâm phải một bức tường vô hình.

---

## 1. VIỆC CHƯA XONG — làm trước

**Chơi thử trên Pages.** Bốn thứ trong bản này đều là thứ CHỈ ĐỌC ĐƯỢC BẰNG MẮT, và bảng test
xanh không thay được chỗ này.

- poke5121999-art.github.io/survivor-web-hub/games/repo2d/ (Ca Trực Đêm)
- poke5121999-art.github.io/survivor-web-hub/games/repo-squad/ (Biệt Đội)
- Pages xây xong khoảng 70 giây sau khi push. Vẫn thấy bản cũ thì kiểm `?v=` trên thẻ script.

| Nhìn cái gì | Làm sao thấy | Câu hỏi |
|---|---|---|
| **Xe lao qua tường** | Vào ca, đừng chạm màn hình 3 giây rưỡi đầu | Cú húc có ĐÃ không? Gạch văng ra có đọc ra là gạch không? Bốn người ngồi trên thùng có nhún ra dáng "đang đi đường" không, hay chỉ là bốn hình dán? Xe trượt xong đứng vào chỗ có mượt không? |
| **Khúc thoát** | Đủ chỉ tiêu, đứng vào thùng xe chờ hết giờ | Có ĐẾM ĐƯỢC đủ người leo lên xe không? Có ra dáng CHẠY không, hay vẫn trượt? Nhà có tối lại sau lưng không? Xe đi có đọc ra là "đi mất" không? |
| **Bộ chuột-phím** | Mở trên máy tính, không chạm vào màn hình | Thanh máu/bản đồ đã đủ to chưa hay quá to? Thanh ô đồ dưới đáy có đọc ra ngay không? `Q` có luôn làm đúng cái mình đang định làm không? Khung nhìn 13 ô có rộng quá không? |
| **Cửa kẹt** | Vào màn 2 trở lên, đi tìm một cửa bị chèn | Cái viền có đủ để nhận ra "phá được" không, hay chỉ là thêm một vệt sáng nữa? |
| Mũi chỉ lối trên sàn | Vào ca, nhìn xuống chân | Hàng mũi nhọn có ĐỌC RA LÀ ĐƯỜNG ĐI không, hay nó chỉ là rác trên sàn? Dày quá hay thưa quá? |
| Vòng highlight quanh loot | Đứng cạnh một món to | Cái vòng còn cắt ngang người món đồ nữa không? Nằm dưới chân đọc có rõ hơn không? |
| Vết nứt | Đâm một cái bình vào tường hai lần | Đã "tinh tế" chưa, hay nay mờ quá đến mức không thấy đồ đang hỏng? |
| Ném | Ôm một món, bấm **Q** (hoặc nút Ném) vào mặt con quái | Cú ném có ĐÃ không? Số sát thương có xứng với món vừa mất? |
| Cửa hàng | Màn tiêu đề → **Cửa hàng** | Năm món có nhìn ra ngay là gì không? Giá có hợp lý không? |

---

## 2. BỐN THỨ VỪA LÀM

### 2.1. Mũi chỉ lối xuống sàn
`drawFloorRoute()` trong `game.js`. Cùng một `visibleRoute()` với bản đồ nhỏ — tức vẫn bị cắt ở
ô đầu tiên chưa khám phá, không vẽ hộ ai lối vào phòng chưa mở. Chỉnh ở bốn hằng ngay trên hàm:
`ROUTE_STEP` (thưa/dày), `ROUTE_SKIP` (chừa chân), `ROUTE_FAR` (nhìn xa bao nhiêu),
`ROUTE_FLOW` (trôi nhanh chậm).

### 2.2. Loot vẽ lại
- **Vòng highlight nằm xuống sàn** (`glowDisc`) thay vì vành tròn quanh người món đồ.
  Lý do và số đo ở chú thích `lootArt()`: sprite vẽ ĐỨNG THẲNG trong thế giới nhìn chếch, nên
  mọi vòng tròn quanh nó đều hoặc cắt ngang bụng, hoặc lơ lửng ngang đầu.
- **Vòng màu vật liệu** cũng xuống sàn thành **chân đế** (`lootPlinth`), và vẽ TRƯỚC món đồ nên
  sprite che mất nửa sau — nó đọc ra là cái bệ món đồ đang đứng trên.
- **Vết nứt** (`drawCracks`): mảnh hơn, mờ hơn, gãy hai đoạn, thêm nét sáng ở mép, và vẽ quanh
  TÂM NHÌN THẤY chứ không quanh tâm va chạm (trước đây ba vết nứt của một cái tủ nằm dưới chân nó).
- **Hàng trong trạm dịch vụ** giờ vẽ bằng `gearIcon()` — trước bản này khẩu hoa cải 26.000 và
  cuộn băng dính 4.500 là hai hình tròn giống hệt nhau.

### 2.3. Ném đồ
Bảng số, nguồn của bản gốc và lý lẽ: **RESEARCH.md mục 7**. Tóm tắt: sát thương = động lượng,
và cú va ăn ngược vào chính món đồ (ném bình gốm vào quái thì gần như chắc chắn mất phần lớn
tiền của nó; món gốm nhỏ vỡ hẳn; và ngay cả cục kim loại — thứ không vỡ bao giờ — cũng sứt 8%
mỗi cú, nhờ một cái SÀN ở `throwLand()`). Vào bằng `handUse()` khi tay không cầm đồ nghề — ô đồ
vẫn bắn được như cũ trong lúc vác, không lấy đi thứ gì.

Cái sàn ấy vá một lỗ hổng **đo được trên bản 20260909a đã lên Pages**: món to bằng kim loại ném
rất chậm nên cú va rơi dưới ngưỡng 260 của nó — ăn 200 sát thương, mất ĐÚNG 0 đồng, nhặt lên ném
lại vô hạn. `nem-shop-suite` có một phép riêng giữ chỗ này.

### 2.4. Cửa hàng ngoài menu + két sắt
`localStorage['repo2d.kho.v1']`. Tiền vào két là **12% số đã giao lên bệ** mỗi khi hết ván. Bán
đúng năm món bắn/ném được, mang tối đa MỘT món vào ca, **mang vào là mất**. Két lần đầu có sẵn
$3.200 = đúng một khẩu súng lục, để cửa hàng không mở ra là năm ô xám ngoét.

Nút "Làm lại từ màn 1" ở hai bảng kết ca đã đổi thành **"Về menu"** (`veMenu()`): nút cũ đi vòng
qua cửa hàng đúng lúc người chơi vừa được trả lương.

**Không có ở bản Biệt Đội** — `khoOn()` đọc `HOOKS.menuMode`, cờ mà bản ấy vốn đã dựng.

---

## 3. TEST

`node test/repo-suite.js` → **293–295 đạt / 15–13 hỏng, đổi theo từng lượt chạy.** Bản trước
đó: 296/12, cũng không cố định.

**Ba ca chênh lệch là CHẬP CHỜN, không phải hỏng mới.** Đã dựng `git worktree` ở HEAD cũ để đối
chứng và chạy riêng ba ca ấy bốn lượt mỗi bên: bản CŨ hỏng 2/4 lượt với đúng chữ ký ấy
(`vung 4-5 · xa 1.1 ô · fightT 4.02`), bản MỚI đạt 4/4. Ba ca đó là:

- `gặp Kẻ bắn ở chỗ thoáng thì KHÔNG đánh`
- `nó chạy, và chạy được thật`
- `và cú đánh ấy ăn máu thật`

Nguyên nhân chập chờn: cả ba đặt con bot ở **`player.x + 3 ô`** trên một căn nhà **sinh ngẫu
nhiên** (`Math.random()`, không có hạt giống). Rơi vào góc tường thì `bestScore < 0` → `fightT`
nhảy thẳng lên `MATE_FIGHT_AFTER` → bot đứng lại đánh thay vì chạy, và cả ba phép đo sập cùng
lúc. **Muốn sửa cho hết chập chờn thì phải ghim hạt giống trong ba ca ấy**, không phải sửa AI.

Mười hai ca hỏng còn lại là hỏng từ trước (đã đối chứng, y hệt danh sách cũ).

`node test/nem-shop-suite.js` → **23 đạt / 0 hỏng**. Bộ mới, chỉ đo hai cơ chế của bản này
(mở cửa hàng → mua → vào ca → ném vào quái → ném vào đồng đội → ném cái đầu → thang sát thương).
Tách khỏi `repo-suite` vì bộ kia đã dài mười mấy phút, mà hai thứ này còn đang sửa tới sửa lui.

---

## 4. HAI CÁI BẪY VỪA SẬP

**`toDataURL()` trên trang mở bằng `file://`.** Ghi đầy đủ ở `art/README.md`. Tóm: canvas nào
vẽ `gear.png` lên rồi gọi `toDataURL()` sẽ ném `SecurityError` dưới `file://`, và vì lỗi bị
`catch` nên triệu chứng là **tủ đồ và cửa hàng không còn cái hình nào, console im lặng**. Trên
Pages thì không sao — nên lỗi chỉ hiện ra ở chỗ hay mở thử nhất. Đã sửa: `gearIconURL()` thử
hai lần, lần hai vẽ bằng vector.

**Đừng `open(f,'wb')` trước khi tính xong.** Một script vá `game.js` mở tệp ở chế độ ghi rồi
mới ném lỗi ở đúng lời gọi ấy — tệp bị cắt về **0 byte**, và script chạy sau đó đọc 0 byte rồi
ghi lại 0 byte. Cứu được vì mọi thay đổi đều nằm trong script vá, `git checkout -- game.js` rồi
chạy lại là xong. Luật: tính xong toàn bộ chuỗi mới mở tệp để ghi.

---

## 5. BẪY CŨ KHI SỬA `game.js` BẰNG SCRIPT — vẫn còn nguyên

Tệp `game.js` nằm trong repo với đầu dòng **CRLF**, trong khi `core.autocrlf=true`. Sửa nó bằng
Python/script rồi `git add` bình thường là git đổi cả tệp sang LF — diff phình lên 25.000 dòng
và nuốt mất phần thay đổi thật. Nhiều agent chạy song song trên cùng cây thư mục này, nên một
diff cả tệp là một cú xung đột chắc chắn.

Cách thoát: `git -c core.autocrlf=false add games/repo2d/game.js`. Nếu git đã ghi nhầm rồi thì
phải `git rm --cached` tệp ấy trước, không thì git thấy nội dung y hệt nên không băm lại.
(`sprites.js` cũng CRLF. `index.html` thì LF — đừng đổi.)

**Thêm một cửa của chính cái bẫy ấy, sập ngày 2026-09-10: `sed -i` NUỐT CRLF.** Đổi đúng một
chữ trong `game.js` bằng `sed -i` là cả tệp về LF — `git diff --stat` nhảy lên *15.787 thêm /
15.373 bớt* dù chỉ sửa một dòng. Python mở bằng `io.open(..., newline='')` cả lúc đọc lẫn lúc
ghi thì giữ nguyên; `sed -i` thì không có cách nào giữ. Luật: **`game.js` và `sprites.js` chỉ
sửa bằng script Python có `newline=''`, đừng đụng `sed -i` vào chúng.** Lỡ rồi thì đổi ngược
lại trước khi `add`:

```python
b = io.open(f,'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
io.open(f,'wb').write(b)
```

---

## 6. VIỆC CŨ CÒN TREO (không thuộc bản này)

- **Chuyến Tàu Cuối vẫn im tiếng.** `G.onSfx` được gọi ở 14 chỗ nhưng chưa ai gán hàm vào.
- **`bot-suite` vốn đã hỏng 10 phép từ trước.** Đã đối chứng ở HEAD cũ, kết quả y hệt. Đừng mất
  buổi tối đi sửa tưởng là mình vừa làm hỏng.
- **Ba ca chập chờn ở mục 3** — ghim hạt giống là xong.

---

## 7. BẢN SAU (2026-09-09, cùng ngày) — ánh sáng trên đồ đạc, và cái menu

### 7.1. Ánh sáng cắt ngang bàn / ghế / cây dừa
Chủ dự án: *"phần ánh sáng lúc nhìn lên bàn, ghế, cây dừa chưa hợp lý"*. Số đo, cái bẫy và ba
cái chốt của bản vá: **`art/room/README.md`**, mục "Miếng đồ CAO HƠN ô của nó". Tóm tắt: lưới
đánh dấu một ô, hình chiếm hai tới ba ô; đèn đi theo lưới nên cắt ngang thân món đồ, chênh
215/255 qua một vạch rộng 1–2 đơn vị. Nay `S.propUp` ghi lại phần tràn và `themONhoDo()` nới
đường clip lên đúng chỗ ấy — chênh trung bình còn 20/255 trên 65 món.

**Không đụng `slabExit` / `marchSolid` / `WALL_DEEP`.** Ba thứ đó là đường chung của tường, và
hai phép thử độ sáng mặt tường trong `repo-suite` đo thẳng vào chúng.

### 7.2. Màn tiêu đề dựng lại thành một cái MENU
Chủ dự án: *"chưa thấy chỗ mua/xài weapon ngoài menu"* và *"bên ngoài menu thì cũng thể hiện
char rõ ràng đi đừng dùng icon nữa"*.

Nút "Cửa hàng" chưa từng bị ẩn — đo trên bốn khổ màn hình thì lần nào nó cũng nằm trong khung
nhìn. Chụp ảnh ra mới thấy vì sao không ai thấy nó: màn tiêu đề là **mười lăm dòng chữ hướng
dẫn** chảy từ trên xuống, và ba cái nút TRÔI GIỮA đống chữ ấy. *"Nằm trong khung nhìn"* và
*"nhìn thấy được"* là hai chuyện khác nhau — đáng nhớ cho lần sau.

Nay nó là một bảng (`showVeil` có `extraHtml` → lớp `.veil.panel` → hàng nút thành chân trang
dính đáy, cùng bản vá đã cứu tủ đồ), phần hướng dẫn gập lại, và **ô bên trái là chính nhân vật**
— `veCharMenu()` vẽ bộ hình người vào một `<canvas>` thật mỗi khung: đứng yên, quay mặt ra, cầm
ngọn đèn, và **cầm luôn món vừa mua ở cửa hàng**. Khối "Đang mang theo" trong cửa hàng cũng vẽ
bằng người cầm nó chứ không bằng một biểu tượng nằm trong ô.

`moManDau()` được gọi ngay trong `__boot` — thiếu dòng ấy thì menu mới chỉ hiện khi QUAY LẠI từ
cửa hàng, còn lần đầu mở game vẫn là tấm màn tĩnh trong index.html.

### 7.3. Một bẫy nữa cho lần sau
`gearIconURL()` từng trả chuỗi rỗng dưới `file://` (canvas vấy bẩn). Cùng cái bẫy ấy chặn luôn
**mọi phép đo bằng `getImageData`**: muốn đo điểm ảnh thì chạy qua một máy chủ tĩnh
(`python -m http.server`) hoặc mở Chromium với `--allow-file-access-from-files`.

---

## 8. BẢN THỨ BA CÙNG NGÀY — cửa vào cửa hàng, và đạn theo từng khẩu

### 8.1. "Chưa thấy chỗ mua weapon" — tôi đã đi tìm lỗi sai chỗ
Lần đầu tôi đo **cái nút có nhìn thấy được không**, bốn khổ màn hình kể cả 375×553 đã trừ thanh
địa chỉ — lần nào nó cũng nằm trong khung nhìn. Đo đúng, kết luận sai.

Lỗi là cái nút ấy **chỉ sống trên màn tiêu đề**, một màn hình người chơi nhìn vài giây rồi bấm
"Vào ca" là mất. Sau đó đường duy nhất quay lại là CHẾT hoặc tải lại trang. Một cửa hàng chỉ mở
được trước khi vào ca thì với người đang chơi, nó không tồn tại.

Nay có cửa thứ hai ở **thanh trên, cạnh nút Sổ tay**, luôn ở đó. Cùng bộ máy với Sổ tay: dừng
thế giới, mở bảng, đóng thì chạy tiếp — vì cùng một lý do, bảng này bấm được giữa ca. Mua giữa
ca thì bảng nói thẳng: món ấy nằm sẵn trên tay ở **ca sau**, vì luật "tối đa một món mỗi ca"
nằm ở `mangDoVaoCa()`, chạy đúng lúc một ván bắt đầu.

`khiDongCuaHang` giữ đường VỀ — hai cửa vào có hai đường về khác nhau.

### 8.2. Đạn phải ra hình khẩu súng bắn nó
Cả ba thứ người chơi bắn ra chỉ có **hai mặt**: một chấm vàng nhạt r=2,6 dùng chung cho **súng
lục VÀ súng gây mê**, một chấm cam nhỏ hơn cho hoa cải. Khẩu mê có mũi tiêm xanh trên biểu
tượng, trên nút dùng, trong tủ, trên cửa hàng — rồi bắn ra một chấm vàng y hệt khẩu lục. Nó có
ba viên cho cả ca, nên bắn nhầm khẩu là mất một phần ba số đạn ấy.

Nay `veDan()`: đầu đạn đồng có vệt sáng dài (lục) · hạt chì ngắn ngủn (hoa cải) · mũi tiêm xanh
có cánh đuôi (mê), cả ba xoay theo hướng bay. Quả **lựu đạn** đang bay vẽ bằng chính
`gearIcon('bomb')` và lăn theo đường ném — trước đây nó là một hình tròn r=5 nhấp nháy cam. Đồng
hồ ngòi lên lớp cộng sáng ở `drawHighlights`, cùng chỗ với ngòi của Bom con.

### 8.3. Đo màu của đạn thì đừng đo trên khung hình thật
Thử hai lần đều sai: điểm sáng nhất quanh viên đạn trả về `rgb(255,255,255)` vì chỗ ấy nằm
trong lõi nón đèn pin, vốn đã cháy trắng; chụp hai lần rồi trừ nhau cũng hỏng vì lớp hiệu ứng
và HUD nhúc nhích giữa hai lần chụp và át mất phần lệch của viên đạn. Cách chạy được:
`veDan()` là hàm thuần, gọi thẳng nó lên một canvas trống 60×40. `REPO.veDan` xuất ra để làm
đúng việc ấy.

## 9. BẢN THỨ TƯ CÙNG NGÀY — art Soul Knight cho viên đạn và cho ba chiếc xe

Chủ dự án, ba câu liền nhau: *"lấy trong soul knight mà nhét vào cho hợp"* · *"dùng 2 miner
cart trong soul knight để làm 2 xe của repo"* · *"lấy cart to nhất để làm cart đẩy"*.

Hai tấm mới, cùng đường ống với `gear.png` — ghép ở `~/Downloads/sk-ref` (ngoài git, **không
commit**), chỉ tấm ghép ra mới vào repo. Khuôn và luật đầy đủ ở `art/README.md`.

- `art/item/dan.png` — dải ngang 3 ô, `DAN_ORDER = ['gun','shot','tranq']`.
- `art/item/xe.png` — lưới 3 cột × 8 hàng, `XE_ORDER = ['scout','haul','day']`.

### 9.1. Xe KHÔNG xoay bằng `c.rotate` — nó có tám hàng
Đây là chỗ khác hẳn `gear.png` và `dan.png`, và là cả lý do tấm `xe.png` có hình dạng ấy.
Vũ khí với viên đạn là hình nhìn ngang, xoay bằng ma trận thì vẫn đúng. Chiếc xe là hình
nghiêng ba-phần-tư nhìn từ trên xuống: xoay nó 180° là ngửa cả mặt đáy lên trời.

Soul Knight vẽ sẵn tám hướng cho mỗi chiếc xe goòng của thợ mỏ (`miner_car_0..7`), nên ở đây
dùng đúng tám hướng ấy. `huongKhung(a)` trong `game.js` đổi góc canvas ra số hàng:

```js
function huongKhung(a){ return Math.round((a + Math.PI/2) / (Math.PI/4)) & 7; }
```

Hàng 0 quay lên, rồi theo chiều kim đồng hồ. Cách kiểm mà không cần tin ai: chiếc `haul` có
**đèn pha** — khung 0 đèn hắt lên, khung 2 hắt sang phải, khung 4 hắt xuống.

### 9.2. Tấm hình vẽ được HÌNH, không vẽ được TRẠNG THÁI
Hình vector cũ nói ba thứ cùng lúc mà tấm hình không nói được cái nào: chiếc này còn xăng
không, có ai đang ngồi không, thùng sau có gì. Nên nhánh dùng sprite phải vẽ đè lại đủ ba:
`globalAlpha 0.62` khi cạn bình · vòng ê-líp màu vành xe dưới gầm khi có người · mấy ô vuông
vàng giữa thùng khi có hàng. Với xe đẩy còn một thứ nữa, và thứ này là **luật chơi** chứ không
phải trang trí: **thanh nắm** đánh dấu mặt trước — nắm đúng mặt ấy thì đẩy khoẻ, nắm hông thì
yếu (`cartGrabMode`), nên người chơi phải nhìn ra được mặt nào là mặt đó.

Luật chung: thiếu tấm thì `dan()` / `xe()` trả `false` và cả hai chỗ rơi về hình vector cũ.
Đừng xoá nhánh vector — nó là thứ chạy trên máy nào tấm hình chưa về kịp.

### 9.3. Bẫy: đo màu bằng "điểm sáng nhất" thì sprite thật sẽ làm sập bài test
Bài test màu đạn ở `test/nem-shop-suite.js` đang lấy **điểm sáng nhất** trên canvas. Nó đúng
với hình vẽ tay, vì chỗ sáng nhất của hình vector chính là cái lõi màu. Đổi sang sprite Soul
Knight là hỏng ngay: viên đạn thật có một **chấm bắt sáng trắng tinh** ở mũi, nên phép đo trả
về `rgb(255,255,255)` — "viên đạn màu trắng". Nó đo cái chấm, không đo viên đạn.

Sửa ở phía bài test, không phải phía hình: lấy **màu trung bình của phần có mực**. Một hai
điểm trắng không lật được cả nắm điểm vàng. Đây là lần thứ ba cùng một bài học trong tệp ấy:
*đo cái đang cần khẳng định, đừng đo cái dễ lấy nhất.*

### 9.4. Chọn chiếc nào cho xe nào — và vì sao
Trong bộ `miner_car` của Soul Knight chỉ có **hai** chiếc trông ra một chiếc xe thật (goòng
gỗ ở `common`, goòng thép có gai ở `skin_5`); tám bản còn lại là skin vui mắt (cà rốt, phao
hạc, bánh kem, bong bóng, bướm, mõm quái). Mà repo cần **ba**. Nên phải có một chiếc lấy skin
vui mắt, không tránh được — chuyện là chọn chiếc nào và đưa cho ai.

- `day` ← **goòng thép** `skin_5`: chủ dự án nói thẳng *"cart to nhất"*, và 57×71 đúng là
  khung lớn nhất trong cả bộ (goòng gỗ 57×62).
- `haul` ← **goòng gỗ** `common`: nó là chiếc duy nhất còn lại **có thùng**, mà xe chở đồ thì
  cái thùng không phải trang trí.
- `scout` ← **phao hạc** `skin_3`, chọn theo ba lẽ đo được: có cái đầu nên nhìn là biết đang
  quay hướng nào (với xe trinh sát thì hướng là thứ quan trọng nhất, và bong bóng `skin_4`
  trượt đúng chỗ này — tám khung gần như một); màu hồng nên không lẫn với chiếc `haul` màu
  cam đỗ ngay cạnh; và nó nhỏ nhất trong ba chiếc, đọc ra là "nhanh".

Đổi ý chiếc nào thì sửa đúng một dòng trong `PICKS` của `sk-ref/build_xe.py` rồi chạy lại —
mã không cần đụng tới.

### 9.5. Test
`test/nem-shop-suite.js` thêm mục `xeSuite` (17 bài): tám hướng của mỗi chiếc phải là **tám
hình khác nhau** (dấu vân lưới 12×12) — bắt được cái lỗi im lặng "ghép một khung nhân tám";
ba chiếc phải ra ba màu; xe đẩy phải phủ nhiều điểm ảnh nhất trong ba chiếc (kiểm đúng câu
*"cart to nhất"*); và `huongKhung()` phải khớp bốn hướng chính cộng hai góc quá một vòng.

Cả bộ: `nem-shop-suite` 57/57 · `bike-suite` 36/36.

## 10. BẢN THỨ NĂM CÙNG NGÀY — BIỆT ĐỘI: mặt xác thật, và cửa hàng đồ nghề

Chủ dự án mở trang Biệt Đội rồi hỏi ba câu liền: *"ủa repo squad chưa update nữa hả?"* ·
*"tui thấy char vẫn đang là mấy cái icon"* · *"repo squad cũng chưa có shop weapon"*.

Câu đầu thì đúng là đã update — `?v=` của Biệt Đội lên `20260909f` cùng lúc với Ca Trực Đêm,
vì hai trang dùng chung `game.js`/`sprites.js`. Nhưng hai câu sau mới là cái thật: **hai việc
đã làm cho Ca Trực Đêm chưa từng được làm cho Biệt Đội**, mà hai bản dùng chung bộ máy nên rất
dễ tưởng là làm một lần là xong. Không phải: mọi thứ nằm ở LỚP MENU thì mỗi bản một cái.

### 10.1. Mặt xác: emoji → charset thật
`faceOf()` trong `js/ui.js` trả về một emoji cho từng xác (`bao: '🔦'`, `hue: '💉'`, ...), dùng
ở tám chỗ. Trong khi mười bốn xác **đều đã có charset thật** ở `../repo2d/art/crew/<id>.png`,
`sprites.js` đã nạp sẵn cả mười bốn, và `REPO_SKIN.crew()` chọn theo `a.charId` — mà `charId`
chính là `SQ.CHARS[].id`. Nên đây không phải việc vẽ mới, chỉ là việc gọi ra.

Nay `matHTML(id, lop)` đẻ ra một `<canvas class="mat mat-*" data-char="...">`, `veMat()` vẽ
vào đó, `chayMat()` vẽ lại cho tới khi tấm hình về **rồi tự tắt** — không có vòng rAF nào chạy
suốt phiên chỉ để canh một tấm ảnh.

Ba điều đáng nhớ:

- **Khổ vẽ lấy từ CSS.** Canvas đọc `clientWidth/clientHeight` làm khổ vẽ, nên mấy lớp
  `.mat-*` trong `index.html` là nguồn duy nhất. Đặt cỡ trong JS là có hai chỗ nói hai kiểu.
- **Ô nhỏ thì cắt lấy ĐẦU.** Chip góc trên chỉ 24px; cả người thu vào đó chỉ còn một vệt. Lớp
  `.mat-dau` xén trong ô rồi phóng to phần đầu — một cái mặt 24px đọc được, một cái người
  24px thì không.
- **Emoji chưa chết.** Chỗ nào nó nằm GIỮA MỘT DÒNG CHỮ (huy hiệu "ai đang đeo món này", danh
  sách trong Sổ tay, nút kỹ năng trong ca) thì giữ nguyên: chen một canvas vào giữa dòng chỉ
  làm chữ xô lệch. Đổi đúng chỗ nào là MỘT Ô CHÂN DUNG.

Bẫy để lại cho lần sau: bài test dễ viết nhất là "có vẽ ra cái gì không", mà cái sai dễ xảy ra
nhất lại là **vẽ được nhưng ai cũng như ai** — `charId` không tới nơi và cả lưới rơi về một xác
mặc định. Bài test lấy dấu vân từng ô rồi đếm số hình KHÁC NHAU, phải đủ 14/14.

### 10.2. Cửa hàng đồ nghề: cùng luật, ví riêng
Ca Trực Đêm có cái này từ bản trước, chạy trên một **két riêng** trong localStorage
(`repo2d.kho.v1`) với đồng tiền lương 12% của nó. Cắm nguyên cái két ấy sang Biệt Đội là hai
hệ tiền tệ cãi nhau trên cùng một màn hình — đúng lý do `khoOn()` bên kia tắt nó đi khi có
menu Biệt Đội.

Nên bên này: **cùng mặt hàng và cùng giá** (`REPO.KHO_HANG` — một bảng giá duy nhất cho cả hai
bản, chép ra là hai bảng và hai bảng thì một cái luôn cũ), nhưng trả bằng **vàng** của Biệt Đội
và cất trong chính bản lưu của nó (`M.mang`). Giá giữ nguyên vì hai bên kiếm được xấp xỉ nhau
mỗi ván: bên kia 12% số giao được (~1.000/ván), bên này 900–3.000 vàng một lần qua map cộng
nhiệm vụ ngày.

Phần lắp món lên tay tách khỏi `mangDoVaoCa()` thành `lapDoLenTay(kind, uses)` và xuất ra, để
Biệt Đội gọi thẳng trong `SD.enter()` — **sau** `REPO.startLevel()`, vì trước đó chưa có
`S.player` để mà lắp vào.

**Hai cửa vào chỗ bán, và đó là bài học của lần trước.** Lần trước tôi đo "cái nút có nhìn thấy
được không" trên bốn khổ màn hình và kết luận là ổn — trong khi lỗi thật là cái nút chỉ sống
trên một màn hình người chơi ghé vài giây. Nên ở đây: khối bán nằm **trên cùng** màn Cửa Hàng,
**và** chính chỗ bán ấy được bưng ra **ngay trên nút ĐI CA** ở màn chính.

Chỗ này tôi sửa **hai lượt mới đúng**, và cả hai lượt sai đều đáng ghi lại.

**Lượt 1 — một dải rộng hết màn.** Chủ dự án bác ngay: *"để cái shop weapon đó kế bên nút đi ca
đi, tự nhiên phóng to cái nút đó ra chi vậy?"*. Cái dải sai hai đường:

- **Cỡ nói sai việc.** Một dải rộng bằng nút chính đọc ra là "hai việc ngang nhau", trong khi
  mua đồ nghề chỉ là thứ đi kèm cú bấm ĐI CA.
- **Nó phá lưới khung ngang.** `body.landscape .stage.is-home` là một `grid` **bốn hàng** với
  từng đứa con được chỉ định chỗ (`>.lineup`, `>.chapter`, `>.b.cta`, `>.foot-note`). Thêm một
  đứa con thứ năm là nó tự đẻ hàng mới ngoài thiết kế.

**Lượt 2 — một nút tắt nhỏ cạnh ĐI CA.** Cũng sai, và chủ dự án nói thẳng ra chỗ tôi đọc hụt:
*"ôi trời tui kêu bạn bưng luôn cái shop ra chứ có phải là thêm 1 nút tắt đâu"*. Tôi đã nghe
"kế bên nút đi ca" thành một câu về **CHỖ ĐẶT** một cái nút, trong khi nó là một câu về **CÁI
GÌ** đặt ở đó: chỗ bán, không phải cửa dẫn tới chỗ bán. Một nút tắt vẫn bắt người chơi rời màn
hình rồi quay lại — đúng thứ mà cả hai lượt sửa trước đó đang cố bỏ đi.

**Bản đang chạy:** năm món bày sẵn thành một dải ô ngay trên nút ĐI CA. Bấm một cái là mua,
bấm lại vào món đang mang là bỏ ra và hoàn đủ tiền. Không rời màn hình một bước nào.

Hai thứ phải giữ khi sửa khối ấy:

1. **`.gorow` bọc CẢ dải bán lẫn nút ĐI CA**, nên `.stage.is-home` vẫn đúng số con — luật lưới
   khung ngang chỉ cần đổi tên đứa con, không phải viết lại. Luật chung để lại: **thêm gì vào
   màn chính của Biệt Đội thì đếm lại số con trực tiếp của `.stage.is-home`.** Khung dọc là
   flex nên thêm bao nhiêu cũng "trông vẫn ổn"; khung ngang là grid có chỉ định chỗ, và nó
   **hỏng im lặng**. Bài test có một câu canh đúng con số ấy.
2. Dải trên màn chính **không thay** khối trong màn Cửa Hàng: khối kia có phần chữ nói rõ luật
   "một món, mang vào là mất", dải này chỉ đủ chỗ cho hình với giá.

### 10.3. Một trang đừng ghi trạng thái nó không sở hữu
Bài test "hai cái ví tách hẳn" bắt được một thứ tôi không ngờ: mở trang **Biệt Đội** thôi cũng
đủ gieo một cái két $3.200 vào `localStorage['repo2d.kho.v1']`. Vì trang ấy cũng nạp `game.js`,
`__boot` vẫn gọi `moManDau()`, và `khoDoc()` khi không thấy két thì **ghi** một cái mới.

Không vỡ gì — trang ấy không bao giờ bày cái két ra. Nhưng nó là một trang ghi trạng thái nó
không sở hữu, và đúng loại thứ khó lần ra khi nó thành nguyên nhân thật. Nay `khoDoc()` vẫn
TRẢ VỀ két mặc định cho mọi người gọi, nhưng chỉ GHI xuống ở trang có két.

### 10.4. Test
`test/nem-shop-suite.js` thêm `matSuite` (6 bài) và `khoSquadSuite` (15 bài — đo đúng lời chỉnh: màn
chính phải bày SẴN cả năm món chứ không phải một nút dẫn đi đâu đó, dải ấy phải nằm ngay trên
nút ĐI CA, bấm thẳng vào ô là mua được, và số con trực tiếp của `.stage.is-home` không đổi).
Cả bộ: `nem-shop-suite` 78/78 · `bike-suite` 36/36 · `guns-suite` 46/52 (6 bài sạc laser hỏng
sẵn từ trước, đo lại trên bản HEAD ra đúng sáu bài ấy).

## 11. PHO TƯỢNG VIẾT LẠI, VÀ ĐỒNG MINH TÀNG HÌNH

Chủ dự án, hai câu: *"làm cho con thiên thần lúc xuất hiện mà bị thấy là countdown liền, xuất
hiện chuẩn xác hơn để force phải nhìn, kể cả bot. làm cách xuất hiện, anim vfx nhìn horror
hơn."* và *"làm cho đồng minh lúc không rọi đèn pin vào thì sẽ không thấy để tăng độ sợ"*.

### 11.1. Đồng hồ chạy từ lúc BỊ THẤY, không phải từ lúc bị rọi đèn
Bản 2026-08-22 khoá đồng hồ lại cho tới khi người chơi chủ động rọi đèn vào nó, vì lúc ấy nó
hay hiện ra sau lưng rồi cào người ta vì một chuyện họ chưa từng được thấy.

Cú sửa hôm nay tấn công **cùng vấn đề đó từ đầu kia**, và mạnh hơn: nó không hiện sau lưng nữa.
`ANGEL_ARC` bắt nó đứng chính giữa tầm mắt — đo 40 lần liên tiếp: lệch trung bình **0,031 rad**
(1,8°), 40/40 lần nằm trong 0,3 rad, cách 3,2–4,8 ô. Bản cũ bắn đều trong ±0,45 rad rồi lấy chỗ
ĐẦU TIÊN đứng được. Nên "bị thấy" giờ là chuyện chắc chắn xảy ra, và một khi đã thấy thì đồng
hồ chạy ngay.

`ANGEL_SETTLE = 3` (ba giây ân huệ) biến mất hẳn; chỗ nó là `ANGEL_ARRIVE = 1,15s`, thuần tuý
một đoạn anim.

### 11.2. Đồng hồ phải NHÌN THẤY ĐƯỢC
Một cái đồng hồ chạy mà không hiện ra thì với người chơi nó không tồn tại — họ chỉ thấy mình bị
cào vì một chuyện không ai báo. `veDongHoTuong()` vẽ một vòng trên đầu nó, hai trạng thái nói
hai câu khác nhau:

- **trắng-xanh, đứng yên** — đang có người nhìn. Đồng hồ bị giữ, chưa mất gì. Nếu người giữ là
  bot thì có thêm chữ `BOT GIỮ`, vì đó là một tin có hạn dùng.
- **đỏ, vơi dần + số giây** — không ai nhìn nữa. Ba giây cuối kêu thành tiếng (`SFX.dread`).

Vòng nạp (vàng, ở lớp thế giới) là chuyện khác và vẫn ở chỗ cũ: nó là đường THOÁT.

### 11.3. "Kể cả bot" — và cái bẫy khoá cứng ván
Bot trong 9 ô mà có đường nhìn thì **đứng khựng lại, quay mặt về phía nó**, và cái nhìn ấy GIỮ
đồng hồ. Đây là thứ duy nhất khiến một con bot bỏ giữa chừng việc nó đang làm mà không phải vì
có gì đang cắn nó.

Cái bẫy sập ngay ở bài test đầu tiên: **một con bot chớp mắt thì con kế bên vẫn đang nhìn.** Với
ba con bot đứng cùng phòng, đồng hồ không bao giờ chạy hết — pho tượng đứng đó vĩnh viễn và sự
kiện đáng sợ nhất căn nhà thành đồ trang trí. Chớp mắt lệch pha nhau không cứu được, chỉ làm nó
khó thấy hơn.

Nên có **hai** đồng hồ chứ không phải một:
- `ANGEL_BOT_HOLD` — mỗi con bot chịu được 2,8–4,6 giây rồi chớp mắt (`ANGEL_BOT_BLINK`).
- `ANGEL_BOT_TOTAL` — **cả tổ chung một quỹ 6 giây** cho mỗi lần nó ghé. Hết quỹ là cả tổ rời
  mắt hẳn và từ đó chỉ còn người chơi giữ được.

Cái thứ hai mới là thứ bảo đảm ván chơi kết thúc được. Bài test canh đúng nó.

Luật để lại: **một cơ chế "giữ được bằng cách nhìn" mà có nhiều người nhìn thì phải có TRẦN
CHUNG, không chỉ trần từng người.** Trần từng người chỉ đổi bài toán thành "xác suất tất cả cùng
chớp mắt", mà với ba người thì xác suất ấy gần bằng không.

### 11.4. Cú cào phải nhắm đúng người ĐÃ THẤY nó
Hệ quả kéo theo, và nó là một lỗi thật chứ không phải chuyện đẹp xấu: pho tượng mọc quanh CẢ TỔ
(`spawnAnchor` bốc ngẫu nhiên trong tổ), nên nó có thể hiện ra trước mặt Tổ 2 ở phòng bên, đồng
hồ chạy vì con bot ấy nhìn thấy, con bot chớp mắt — rồi **người chơi ăn ba mươi máu cho một
chuyện họ chưa từng thấy.** Đúng cái sai mà bản 2026-08-22 đã sửa một lần, chỉ là đi vào từ cửa
khác.

Nay `a.banDaThay` nhớ người chơi đã từng nhìn thấy nó chưa. Chưa thấy lần nào thì nó cào con bot
đang trợn mắt, và người chơi nghe tiếng hét ở phòng bên — đáng sợ hơn hẳn, và công bằng.

### 11.5. Cú hiện hình
Ba nhịp, và không nhịp nào là một vụ nổ — vụ nổ là thứ vui mắt:

| giây | lớp thế giới | lớp cộng sáng | tiếng |
|---|---|---|---|
| 0,00–0,40 | sàn **thủng**: vũng đen loang ra + vết nứt | quầng tím nở | tầng ù thấp dâng lên |
| 0,15–0,80 | **bóng đen** mọc lên từ vũng, RUNG vài điểm ảnh mỗi khung | | tiếng trượt xuống đáy |
| 0,55–1,15 | bóng tan ra thành tượng đá | **hai con mắt** sáng lên | cú đóng dưới ngưỡng nghe |

Hai con mắt ở lại sau đó: âm ỉ khi đang bị nhìn, đỏ rực và nhấp nhanh dần theo đồng hồ khi không
ai nhìn. Chúng nằm ở **lớp cộng sáng** vì lớp thế giới bị nhân với ánh sáng — trong phòng tối
thì mọi thứ vẽ ở đó đều đen thui, kể cả thứ đáng lẽ phải phát sáng.

`SFX.appear()` xếp ba lớp **lệch pha** nhau: cùng lúc thì tai đọc ra một tiếng động, lệch pha
thì nó đọc ra một thứ đang tới gần.

### 11.6. Đồng minh tàng hình khi không có đèn
Trước bản này lớp tối chỉ làm họ MỜ đi, mà mờ thì mắt vẫn bám được — nên đi cả ca vẫn luôn biết
ba cái bóng kia ở đâu. Nay `mateSang()`: chỉ hiện khi nằm trong nón đèn của bạn, hoặc đứng trong
vùng sáng pho tượng để lại, hoặc ở sát bên (2,3 ô). Mờ vào/hiện ra trong 0,22 giây — bật tắt
phựt thì đọc ra là lỗi vẽ.

Hai chỗ luật này **dừng lại**, và cả hai đều phải có bài test canh:
- **người GỤC thì luôn thấy.** Không thấy thì không đỡ dậy được, và cả cơ chế cứu đồng đội chết
  theo. Đây là chỗ "đáng sợ" đổi thành "hỏng".
- **sát bên thì vẫn thấy.** Mất dấu người đang đứng cạnh khuỷu tay mình là bực, không phải sợ.

Đồng hồ mờ/hiện chạy trong `stepMates` chứ không trong vòng vẽ: vòng vẽ không có `dt`, và một
hiệu ứng đo bằng khung hình thì máy nhanh máy chậm ra hai tốc độ.

### 11.7. Test
`test/nem-shop-suite.js` thêm `tuongSuite` (12 bài) và `boTaiSuite` (7 bài). Cả bộ **98/98**.
`bike-suite` 36/36 · `repo-suite` 296/308 · `guns-suite` 46/52 · `bot-suite` 17/28 — ba bộ sau
đo lại trên bản HEAD ra **đúng cùng số bài hỏng**, tức không bộ nào hỏng thêm vì bản này.

