# SlimeClash

Ghép ô theo lượt trên **một lưới 6×6**, đánh **một con quái to**. Lấy cơ chế gộp, tiến trình
và kinh tế của **Slime Legion** (Perfeggs, 2023), thay pha thủ thành auto-battle bằng chiến
đấu theo lượt lấy cảm hứng từ **Might & Magic: Clash of Heroes** (Capybara/Ubisoft, 2009).

Chạy được từ `file://`, không engine, không phụ thuộc mạng.

## Chơi thế nào

- **3 bước mỗi lượt.** **Kéo** một quân sang ô khác — ô trống thì dời, ô có quân thì đổi chỗ.
  Đúng kiểu game merge. Vùng bắt cố ý rộng: ô đích suy từ toạ độ trong bàn chứ không đòi thả
  trúng ô, vì trên màn cảm ứng bắt thả từng ô là quá khắt khe.
- **Xếp ≥3 quân CÙNG LOẠI CÙNG CẤP thành hàng ngang hoặc dọc** → gộp thành **một quân cấp
  cao hơn**, và nó **đổi hình** (sprite trong APK có đúng 6 khung cấp). Gộp xong nếu lại
  thành hàng thì gộp tiếp — gộp dây chuyền.
- Gộp **3 ô** → 50% sinh thêm một quân. Gộp **4 ô trở lên** → 50% được **thêm 1 cấp**.
  ([APK] `HeroThreeMergeOneMoreProbability` / `HeroFourMergeExtraGradeProbability`)
- **Hết bước thì mọi quân trên sân bắn vào quái**, sát thương = tổng lực trên sân.
- **Rồi quái đánh trả vào một cột đã báo trước.** Quân trong cột đó chịu đòn; dư bao nhiêu
  mới trừ vào máu bạn. Đòn của quái đếm theo **BƯỚC**, không theo lượt — càng thao tác nhiều
  thì đòn càng tới nhanh ([APK] `boss_forecast_step`).
- Gộp cho **hộp kỹ năng**, giữ tối đa 8 ([APK] `RetainSkillLimitCount`).
- **Thua khi hết ngân sách lượt mà chưa hạ được quái**, hoặc khi máu bạn về 0.

**Không có bộ đếm lượt nạp trên đầu từng quân**, và **không có sân địch**. Bản đầu tôi dựng
theo Clash of Heroes — hai sân đối đầu, mỗi quân một bộ đếm nạp — và đó là một bản PvP, sai
hẳn với thứ cần làm. Đã bỏ.

## Bố cục

HUD trận và màn hình nhà dàn theo **bố cục thật của Slime Legion**, đọc từ cây UI trong
`ui/gameplay.bytes` và `ui/home.bytes` chứ không phải tự nghĩ:

| Bản gốc | Ở đây |
|---|---|
| `Top`: ButtonAccelerate · ButtonPause · ImageSwapBg(Step) · ImageDayBg(Day) | thanh trên: AUTO · ⏸ · 👣 bước · 📅 ngày |
| `TopDay` — Scroll View chứa DayItem | ray ngày, ngày boss có dấu ☠ |
| `BossLayer` / `MonsterInfo` | bảng quái: hình + tên + sát thương + thanh máu + ý đồ |
| `SelfHpNode` — LordSkillBtnL · EnergyBar · LordSkillBtnR | thanh máu mình kẹp giữa 2 nút kỹ năng |
| `RetainSkillsLayer` / `GamePauseLayer` | kỹ năng và nhật ký nằm ở hộp thoại riêng, không chiếm HUD |
| `HomeLayer` > `NavigatorBar` (7 mục) | thanh điều hướng đáy 4 mục |
| `TopViewMain` — Player(Avatar+Level+BattlePower) · Gold · Gem | avatar + cấp + lực chiến, rồi tài nguyên |

Bề rộng bàn ràng theo **chiều cao màn hình** (`44vh`) chứ không theo chiều rộng — ô vuông
nên bề rộng bàn chính là chiều cao bàn, ràng theo chiều rộng là tràn màn và người chơi phải
cuộn **giữa trận**. Có test đo đúng chuyện này (`_test/browser.js`).

## Vì sao các con số là thế

Toàn bộ số cân bằng nằm trong `js/config.js`, mỗi dòng có nhãn nguồn:

| Nhãn | Nghĩa |
|---|---|
| `[APK]` | Đo trực tiếp từ file cấu hình Slime Legion 4.5.0 |
| `[CoH]` | Từ Clash of Heroes |
| `[MOB]` | Chuẩn thiết kế mobile |
| `[TUNE]` | Tự chọn, có ghi suy dẫn ngay tại chỗ |

Những số `[APK]` đáng chú ý — **đây là số của một game đã cân bằng xong, đừng sửa**:

- **Lưới 6×6** — `BoardInitColumnCount` / `BoardInitRowCount`.
- **Xác suất thưởng khi gộp** 3 ô và 4 ô, đều 0,5.
- **Máu quái ×1,15/ngày**, còn **sát thương quái không tăng theo ngày** (`attack_ratio` = 1).
  Vì thế độ khó là bài toán *đủ sát thương trong ngần ấy bước*, không phải bài toán né đòn.
- **Boss báo trước đúng 10 bước** — `boss_forecast_step`, có ở 721/1.744 dòng cấu hình ải.
- **Trần vàng và mảnh theo chương** — `coin_max` 220 → 1.800, `hero_card_max` 25/35/45.
- **Bảng trọng số rơi hộp kỹ năng** — ghép càng nhiều ô, bảng càng tốt.
- **96 hero kèm id và slug thật**, 94 con có chân dung, mỗi con có 6 khung sprite theo cấp.

Cách lấy được và toàn bộ dẫn chứng: `_research/slime-legion-apk-datamine.md`.

### Bốn chỗ mô phỏng bắt được tôi làm sai, ghi lại để khỏi lặp

Bốn lỗi này đều **không thấy được bằng cách đọc code** — chỉ lộ ra khi cho bot chơi vài nghìn
ván. Suy dẫn đầy đủ nằm ngay tại chỗ trong `js/config.js`:

1. **`gradePowerMul` phải lớn hơn `minRun`.** Để 2,2 với minRun 3 thì gộp 3 quân (lực 3P) ra
   2,2P là lỗ thẳng, mà ô lại tự đầy nhờ spawn → nước đi tối ưu thành "không bao giờ gộp",
   lực đứng yên ở 36×P và mọi ngày từ ngày 5 trở đi đều 0% thắng. Giờ là **3,6**.
2. **Hệ số sức mạnh theo ngày phải bám hình của `hpRatio`, không phải một số cố định.**
   `hpRatio` dốc đứng ở đầu chương rồi thoải ở cuối; một hệ số x1,25/ngày không khớp được cả
   hai đoạn.
3. **Sát thương quái và máu người chơi cũng phải nhân hệ số ngày đó.** Chỉ nhân cho quân thì
   ngày cuối chương hoá ra *dễ nhất*; để máu người chơi tuyến tính thì từ chương 10 trở đi
   ngày 1 lại là ngày khó nhất.
4. **Đừng cộng độ khó hai lần lên ngày boss.** `hpRatioByDay` [APK] đã là máu của đúng ngày
   đó rồi; nhân thêm 1,35 làm ngày 5 khó hơn ngày 8, tức độ khó răng cưa.

## Art

`assets/units/<id>.png` là **dải 6 khung theo cấp** của từng hero, `assets/heads/<id>.png` là
chân dung cho menu, `assets/enemies/<slug>.png` là hình quái. Tất cả là **ảnh TẠM rip từ APK
Slime Legion** — chỗ để vẽ đè. Đổi art = thay PNG + sửa `assets/asset-map.js`, **không đụng
code**. Chi tiết và lý do ô cờ phải trộn màu: `ASSETS.md`.

## Chỗ KHÔNG phải số thật

`js/roster.js` có **96 hero** (id 101–196) với **tên, slug và bậc icon thật**, nhưng
**chỉ số thì không**. Bảng chỉ số gốc nằm trong `config/table.bytes` bị mã hoá XXTEA và chưa
giải được. Bốn agent research đã xác nhận HP/sát thương/tốc đánh của các hero này **không tồn
tại ở bất kỳ nguồn công khai nào** — wiki fandom chỉ có 8 trang hero, đều nằm ngoài roster này.

Nên chỉ số được dựng theo thang 38 unit của Clash of Heroes (thang này đã cross-check hai
nguồn độc lập). Header của `data.js` ghi rõ điều đó. **Đừng ai đọc nhầm thành số của Slime Legion.**

37/96 hero chỉ có tên **suy từ slug** trong APK (ví dụ `firedragon` → "Firedragon") chứ chưa
xác nhận tên hiển thị thật; những con đó bị đánh dấu `named:false` và hiện dấu `*` trong game.

**Tên 48 con quái là tôi đặt** (`js/foes.js`) — bản gốc chỉ có id chuỗi chưa giải mã được.
`slug` mới là thứ thật, và nó là khoá tra ảnh.

Bậc hiếm có **hai tín hiệu từ APK và chúng không trùng nhau**:
- nhóm icon `Headicon_<bậc>_<id>` — chỉ có hai giá trị, 1 và 4 (33 hero thuộc nhóm 4);
- cấu hình gói nạp — 11 hero được xếp riêng (chuỗi 3 gói, cooldown 720 phút).

Chọn: 11 hero kia làm **champion**, nhóm icon 4 còn lại làm **elite**, phần còn lại **core**.
Đây là quyết định thiết kế trên hai nguồn đo lệch nhau, không phải số đo — và cả hai đều đo
**độ hiếm thương mại**, không phải sức mạnh gameplay. Tier list cộng đồng không xác nhận hai
thứ đó trùng nhau.

## IAP mua-free

Giữ nguyên bộ máy gói nạp kích-theo-hành-vi của bản gốc (gói tân thủ, gói sau **3 lần thua**,
gói khi **thiếu vàng**), nhưng mua đều **miễn phí**. Giá USD vẫn hiện, gạch ngang, để người
chơi so được độ lớn giữa các gói.

Vấn đề khi bỏ giá: trong bản gốc mỗi gói bị chặn bởi **giá** *và* **cooldown**. Bỏ giá thì chỉ
còn cooldown, mà cooldown gốc cho phép **~276 lượt mở gói/ngày** — trong khi đường cong độ khó
chỉ ×1,15/ngày. Không chặn thì 300 chương sụp trong một buổi chiều.

Ba lớp chặn thay thế:

1. **Thưởng đi qua đúng trần chương của bản gốc.** Hết trần thì gói vẫn mở nhưng phần vàng/mảnh
   cắt về 0 và báo rõ. Không có đường vòng.
2. **Phiếu Ưu Đãi 8/ngày** — ngân sách mở gói chung, thay chỗ của tiền.
3. **Trần kim cương 180/ngày** — kim cương là thứ duy nhất bản gốc không chặn theo chương,
   vì nó là món để bán.

Hai chỗ cố ý làm khác bản gốc: **bỏ hẳn gói hồi sinh** (bản gốc bán đúng lúc người chơi cay)
và **mở vĩnh viễn nút tua nhanh**. Gói "thua 3 lần" thì giữ và cho miễn phí hẳn — nó vốn là
cơ chế chống ức chế tốt. Lý lẽ đầy đủ: `_research/economy-design.md`.

## Kiểm

```
node games/slimeclash/_test/sim.js        # engine + cân bằng, không cần trình duyệt
node games/slimeclash/_test/browser.js    # Chrome headless: kéo thả, bố cục, ảnh chụp
```

`sim.js` kiểm luật gộp (khác cấp / khác loại thì không gộp, gộp dây chuyền, đổi chỗ), kiểm
bất biến bàn cờ, rồi cho bot chơi và đo tỉ lệ thắng theo chương/ngày. Cấp Hero và cấp quân
trong mô phỏng **suy từ trần vàng [APK]**, không bịa — đó là chỗ kinh tế khoá vào độ khó.
Muốn dò số thì đặt biến môi trường (`SC_HPBASE`, `SC_CHMUL`, `SC_GRADE`, …) chứ đừng sửa
config rồi quên trả lại.

Kết quả hiện tại: trận **7–9 lượt**, bot thắng ~100% tới chương 12, 97% ở chương 14, và
**tắc ở khoảng chương 15–16** — đúng chỗ trần vàng thôi không đuổi kịp hệ số theo chương nữa.
Bot chỉ nhìn **một nước**, nên con số đó là **chặn dưới**, không phải kỳ vọng của người thật.
Cân bằng cho người thật thì **chưa playtest**.

`browser.js` chạy Chrome headless qua DevTools Protocol (không cần cài gì từ npm): kiểm màn
hình nhà render được, không lỗi console, kéo thả thật sự đổi bàn cờ và tốn bước, bấm "Đánh"
thì quái mất máu, và **màn trận không tràn quá một màn hình**. Ảnh chụp để lại ở `_test/shot-*.png`.

## Còn thiếu

- Chỉ số gốc từng hero, giá nâng cấp, tỉ lệ gacha, stamina — nằm trong file mã hoá XXTEA.
  Đã vét literal C#, metadata IL2CPP, mọi section của `libil2cpp.so`, 12 thư viện `.so` khác
  và 9 file DEX; chưa ra khoá. Danh sách đã tìm ở đâu: `_research/slime-legion-apk-datamine.md`
  mục 8.2 — để lần sau khỏi mò lại.
- Chưa có hệ Talent, trang bị, Lord, PvP (bản gốc có 140 ải PvP).
- Chưa playtest với người thật.
- Sau chương ~15 là **hết nội dung thật sự**: gold cap chặn cấp Hero ở khoảng cấp 8, còn máu
  quái vẫn ×1,24 mỗi chương mãi mãi. Bản gốc giải chỗ này bằng hero mới và sao hero — chưa làm.

## Cấu trúc

```
index.html            vỏ + thứ tự nạp script
css/style.css         bố cục dọc: bảng quái trên, bàn của mình dưới
assets/units/*.png    96 dải sprite 6 khung theo CẤP (art TẠM, rip từ APK)
assets/heads/*.png    94 chân dung cho menu
assets/enemies/*.png  48 hình quái
assets/asset-map.js   khoá art -> đường dẫn; sửa ở đây khi vẽ đè
js/atlas.js           tra art theo khoá + cắt khung theo cấp; thiếu thì rơi về ô màu trơn
js/config.js          TOÀN BỘ số cân bằng, mỗi dòng có nhãn nguồn
js/roster.js          96 hero, SINH TỰ ĐỘNG từ APK — đừng sửa tay
js/data.js            chỉ số dựng trên roster + bảng kỹ năng
js/foes.js            48 quái: slug thật + tên tiếng Việt tôi đặt
js/engine.js          bàn cờ, luật gộp, một con quái, vòng lượt
js/economy.js         tiền tệ, trần chương, gói mua-free
js/save.js            localStorage + cầu HubSave của hub
js/ui.js              render + kéo thả
js/main.js            nối vòng lặp nhà → trận → thưởng
_test/sim.js          test engine + cân bằng, headless
_test/browser.js      test Chrome headless: kéo thả, bố cục, ảnh chụp
_research/            12 tài liệu nguồn
ASSETS.md             art: nguồn, luật đổi, vì sao ô cờ trộn màu
```
