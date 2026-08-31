# Làm lại phần NHÌN — Art, VFX, Skill, Cơ động

> Tài liệu này nối tiếp `RESEARCH.md`. `RESEARCH.md` mục 14 đã dựng lại phần **cơ chế** đánh nhau
> (hitstop, poise, launch, bộ đòn từng vũ khí). Tài liệu này lo phần **trình diễn** — thứ người chơi
> thật sự nhìn thấy — vì đó mới là chỗ đang hỏng.
>
> Quy ước: câu trong `"..."` là trích nguyên văn kèm nguồn. Dòng đánh `[SUY LUẬN]` là suy diễn, không
> có nguồn trực tiếp. Chỗ không tìm được thì ghi "không tìm thấy", không bịa số.

---

## 0. Chẩn đoán — cơ chế không nhàm, phần NHÌN mới nhàm

Soi lại code trước khi nghe ai khuyên gì. Ba chỗ hỏng, không chỗ nào nằm ở thiết kế gameplay:

**a) 40+ Magi chỉ là 3 đoạn code.** `js/game.js:604-638`. Mọi Magi hình `star` — 24 cái, từ
`smash` rank B tới `king_solomons_gate` rank SS — chạy đúng một nhánh: `aoeDamage()` rồi
`fx.push({k:'magi'})`. Trên màn hình, "Meteora — Gọi thiên thạch" và "Ice Spike — Cột băng dựng lên"
là **cùng một vòng ellipse nở ra**, chỉ khác màu tint theo hệ. Hình `heart` ra một ellipse xanh,
hình `diamond` ra một ellipse lam. Hết.

Vấn đề không phải là ít skill. Là **40 skill dùng chung 3 hiệu ứng**. Đọc mô tả thì mỗi cái một
kiểu, bấm vào thì y hệt nhau — đó chính xác là định nghĩa của nhàm.

**b) Cả game có đúng 9 loại VFX, đều là nét mảnh.** `js/game.js:2571-2632`:

| Loại | Vẽ bằng gì | Vấn đề |
|---|---|---|
| `slash` | `ctx.arc` stroke 5px (10px nếu `big`) | Nét đều từ đầu tới cuối — trông như sợi dây cung, không phải lưỡi kiếm |
| `puff` | 6 chấm tròn bay ra đều nhau | Đối xứng hoàn hảo, đọc ra ngay là code |
| `spark` | 1 tròn + 5 tia | Loại duy nhất tạm được |
| `ring`/`magi` | ellipse nở | Dùng cho mọi thứ |
| `tell`/`bang`/`dust`/`lunge`/`heal` | tròn hoặc rect phẳng | |

Không có: glow, additive blending, afterimage, impact frame, mảnh vụn, khói, vệt trail, dissolve.

**c) Quái là ellipse màu phẳng không viền.** `js/game.js:2290`: `ctx.fillStyle = m.flash > 0 ?
'#ffffff' : base` — một màu duy nhất lấy từ `G.ELEMENTS[m.el].color`, không viền, không gradient,
không highlight. Nền là ô ca-rô 2 màu (`js/game.js:1845-1855`). Ngược đời là **boss thì có viền**
(`js/game.js:2350`: `ctx.strokeStyle = 'rgba(0,0,0,.55)'` + `shade(col, -0.34)` cho vùng tối) — code
boss đã biết cách vẽ tử tế rồi, quái thường thì chưa được nâng lên theo.

**d) Rung màn hình là random thuần.** `js/game.js:1803`:
`ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake)`. Không hướng, không mượt. Cú
chém từ trái sang và quả nổ dưới chân rung y hệt nhau, và vì random từng khung nên nó **giật** chứ
không **rung**.

**Kết luận**: `data/gamedata.js:84` (bảng FEEL) và bộ đòn 5 vũ khí đã đủ tốt. Cái thiếu là lớp vẽ.
Không cần làm lại gameplay — cần làm lại renderer.

---

## 1. Luật art lấy từ Sephiria

Sephiria (TEAM HORAY, top-down action roguelike, Steam appid 2436940, EA 03/04/2025, bản 1.0
31/07/2026) là thứ người dùng chỉ đích danh. Đây là những gì đào được — và một cảnh báo về nguồn.

### 1.1 Luật quan trọng nhất: **vật rắn thì cứng cạnh, ánh sáng thì mượt**

Một câu mô tả art direction lặp lại giống hệt nhau trên nhiều review khác nhau (dấu hiệu của một
đoạn press-kit chính thức được trích lại):

> "Sephiria employs an earthy 8-bit style, but with the deliberate use of **non-pixelized elements
> for things like lighting, shadows, effects**, and more."
> — [Gaming Furever](https://gamingfurever.com/reviews/sephiria-review-raving-for-this-rabbit-roguelite)

> "This makes for a crispy, beautifully defined style that prioritizes function over flair, but
> doesn't lose sight of making things appear very alive and lived-in." — cùng nguồn

Nghĩa là: sprite nhân vật/quái/tile giữ pixel thô (bản sắc retro), nhưng ánh sáng, bóng đổ và toàn
bộ lớp VFX được vẽ **mượt, không rasterize theo lưới pixel**. Tại sao nó ăn:

1. Mắt đọc "vật thể rắn" qua **cạnh sắc** — pixel hoá ở đây cho cảm giác chắc, có khối.
2. Mắt đọc "ánh sáng/năng lượng" qua **gradient mượt** — ánh sáng thật không có cạnh răng cưa. Pixel
   hoá ánh sáng thì nó trông như một vật rắn phát sáng, phá ảo giác chiều sâu.
3. Sự **tương phản giữa hai cách vẽ** trong cùng một cảnh chính là thứ tạo chiều sâu điện ảnh.

**Áp vào canvas hình học — đây là tin tốt.** Canvas 2D vốn đã mượt, nên không phải "cố làm mượt lớp
sáng". Việc cần làm là dựng lại đúng **sự phân tầng** đó theo chiều ngược:

- **Vật rắn** (thân quái, tường, vật cản): path có **viền cứng** `lineWidth` 2–3px, fill gradient 2
  tông. Cứng, có khối.
- **Ánh sáng/VFX** (glow, telegraph, particle, vệt chém): gradient tròn mềm, **không viền**, alpha
  giảm dần ra biên, `globalCompositeOperation = 'lighter'`. Phi vật chất, phát sáng.

Hiện tại game vi phạm cả hai: quái không viền (nên trông mềm oặt), VFX là nét stroke cứng (nên trông
như vật thể chứ không như ánh sáng). **Đảo đúng hai thứ này là đã đổi hẳn cảm giác.**

### 1.2 Màu: nền pastel im lặng, hiệu ứng bão hoà la hét

> "The color palette and prioritization of **where you need to add strong colors and where you keep
> the usual pastel-y palette** is phenomenal."
> — Steam user review (36.4 giờ), [Steam Community](https://steamcommunity.com/app/2436940/reviews/?filter=all)

> "You've got cute little bunny villagers contrasted against **dark mines** and increasingly
> threatening environments." — [LadiesGamers](https://ladiesgamers.com/sephiria-review/)

Nền tối/trầm/earthy làm phông; màu bão hoà cao để dành riêng cho VFX, telegraph, item rơi. Nền tối
cũng là phông lý tưởng cho additive glow.

### 1.3 Telegraph: đường đỏ, 4 hình dạng, có điểm hội tụ

Đây là phần Sephiria có tài liệu rõ nhất:

> "Nearly every enemy in Sephiria flashes a **red laser line** right before it attacks, and that line
> is your timing cue. **When the red lines converge, the hit lands**, so you can hold your dash until
> the last moment and slip out of range."

> "When an enemy winds up, a red beam often draws the threatened line or arc, with **thin fast lines
> indicating snap dodges perpendicular to the beam**. **Wide cones or circles** require creating
> distance or parrying if your weapon supports it."

> "Red laser telegraphs and RMB dodge/parry create **a language players can learn, not guess**."
> — [ssephiria.wiki/review](https://ssephiria.wiki/review/)

Bốn hình dạng — **line, arc, cone, circle** — mỗi cái đòi một cách né khác nhau. Game hiện tại có
`tel:'cone'` trong data quái (`data/gamedata.js:751+`) và `fx k:'tell'` vẽ vòng tròn, tức đã đi đúng
hướng nhưng mới có 1–2 dạng và ngôn ngữ chưa nhất quán.

### 1.4 Bài học ngược — chỗ Sephiria bị chê, đừng lặp lại

Đây là phần có trích dẫn phong phú nhất, và đáng giá hơn cả phần khen:

> "Later encounters, which can feature greater numbers of enemies who wield a larger variety of
> flashy and colorful abilities, **can create a lot of visual noise**. Add in some projectiles and an
> allied follower or two, and you might end up with **a playing space that's difficult to read**."
> — [GameLand.gg](https://gameland.gg/sephiria-review-rabbits-roguelike/)

> "The indicators for that attack are just **completely undecipherable**. It's just **indicator spam
> with a lot of them overlapping** making it nearly impossible to tell what's a damage zone and what
> isn't."
> — [Steam Discussion](https://steamcommunity.com/app/2436940/discussions/0/651440877420428968)

> "Visible red effects **do not always match the real hit judgment**" — tức vùng đỏ hiển thị không
> khớp hitbox thật. (nguồn boss guide, sephiria-game.org)

Và cách dev xử lý — đáng chú ý là họ **giảm số lượng**, không sửa cách vẽ:

> Patch 1.0.21: "changed the Final Boss full-screen attack so **players can keep controlling the
> character during the white-screen effect**"; "The bullet attack pattern was improved so that
> consecutive casts **no longer generate an excessive number of projectiles**".
> Patch 1.0.22: "reduced the Final Boss Phase 1 radial bullet spread slightly."

**Ba luật rút ra, phải tuân từ ngày đầu:**
1. Vùng đỏ telegraph phải **khớp chính xác hitbox thật**. Lệch là lỗi UX nặng nhất của thể loại.
2. Có **trần số lượng** VFX/telegraph hiện cùng lúc. Chồng lấn thì gộp hoặc bỏ bớt cái xa nhất.
3. Hiệu ứng che màn hình **không được khoá điều khiển**.

### 1.5 Cảnh báo về nguồn Sephiria

Khi tìm "Sephiria wiki" ra một cụm hơn 10 tên miền gần trùng (`sephiria.net`, `.world`, `.pro`,
`.org`, `.xyz`, `.page`, `.tools`, `.lat`, `sephiriagame.online`, `ssephiria.wiki`...) — gần như chắc
chắn là trang SEO/AI-generated. Chúng tự mâu thuẫn nhau và có lúc bịa cả tên vũ khí không tồn tại
("Rapier" như một vũ khí gốc). **Nguồn thật dùng được**: NamuWiki tiếng Hàn và đặc biệt là
**DCInside "세피리아 마이너 갤러리"** (`gall.dcinside.com/mgallery/board/view/?id=sephiria`) — forum
người chơi Hàn thật, đây là nơi lấy được toàn bộ dữ liệu weapon-tree ở mục 3.

**Không tìm thấy** (đã tìm kỹ, không bịa): số frame animation, thời gian hitstop, độ phân giải pixel
base, số hướng nhân vật, hình dạng chính xác vệt chém, VFX lúc quái chết. TEAM HORAY không công bố
tài liệu kỹ thuật. Phần hình học VFX cụ thể chỉ có thể lấy bằng cách xem trực tiếp video gameplay.

---

## 2. Bảng màu, silhouette, thiết kế quái

### 2.1 Ba luật màu

**Luật 1 — khoá riêng một dải đỏ cho NGUY HIỂM, không dùng nó cho gì khác.** Đây là kỹ thuật rẻ
nhất và hiệu quả nhất, và nhiều game chứng minh:

- **20 Minutes Till Dawn**: thế giới gần như đen-trắng-xám, đỏ dành riêng 100% cho đạn địch.
- **Enter the Gungeon**: "The bright **white and red** colour scheme was chosen **very intentionally**
  in order to ensure that bullets stand out against the environment."
  ([wiki.gg](https://enterthegungeon.wiki.gg/wiki/Projectiles))
- **Hades**: mỗi vị thần một màu cố định — Zeus vàng sét, Poseidon xanh dương, Ares đỏ, Aphrodite
  hồng, Artemis xanh lá, Dionysus tím, Demeter trắng
  ([Inverse](https://www.inverse.com/gaming/hades-symbol-meaning-guide-hera-dionysus-apollo-ares-aphrodite)).

Đây là chỗ game hiện tại đang **vi phạm trực tiếp**: `#e33b30` dùng cho telegraph (`fx k:'tell'`),
nhưng `#ff7a3c` (Hỏa) là màu thân quái hệ lửa, `#ff5a5a` là màu số sát thương người chơi ăn phải, và
`#ff6a5a` là màu impact của boss. Bốn sắc đỏ-cam làm bốn việc khác nhau. Trên sân đông, người chơi
không tách được "vùng sắp nổ" khỏi "con quái lửa".

**Luật 2 — tách bằng độ sáng (value) trước, màu (hue) sau.** Test: chuyển cả cảnh sang grayscale.
Nếu quái và nền cùng độ sáng thì dù khác màu vẫn khó đọc lúc hỗn loạn.

**Luật 3 — đừng ngại phóng to.** Enter the Gungeon: "Basic enemy bullets were **doubled in size at
least twice** over the course of development in order to keep the projectiles visible and fair."

### 2.2 Palette đề xuất (`[SUY LUẬN]`, dựng theo quy tắc hue-shift/value-curve của Slynyrd)

**Nền — trầm, lạnh, bão hoà thấp:**

| Vai trò | Hex |
|---|---|
| Sàn tối nhất (rìa map) | `#15121e` |
| Sàn chính | `#251f33` |
| Biến thể tile sáng | `#332b46` |
| Tường/vật cản | `#453a5c` |
| Rêu/nứt (doodad) | `#31513f` |
| Sỏi đá (doodad) | `#4a4258` |
| **Viền toàn cục** | `#1b1626` (tím-đen, KHÔNG dùng `#000` đen tuyền) |

**Dải ĐỎ NGUY HIỂM — khoá riêng, cấm dùng cho gì khác:**

| Vai trò | Hex |
|---|---|
| Telegraph (vùng sắp nổ) | `#ff2e4d` (đỏ-hồng sáng, dễ đọc hơn đỏ tối với người mù màu đỏ-xanh) |
| Nhấp nháy cảnh báo | pulse `#ff6b6b` ↔ `#ffe74c` (2 màu, không chỉ đỏ, để bù color-blind) |
| Fill vùng nguy hiểm | `rgba(255,46,77,0.30)` |

**Hệ quả bắt buộc**: quái **không được** lấy đỏ làm màu thân. Hệ Hỏa hiện là `#ff7a3c` — phải dời
sang cam-vàng `#ff9f2e` hoặc dùng hue khác, để trả sạch dải đỏ cho telegraph.

**Quái theo vai trò — mỗi nhóm một hue để phân biệt tức thì:**

| Nhóm | Thân | Viền/mắt |
|---|---|---|
| Lao vào / rusher | `#ff8f3f` | `#7a3d12` |
| Tank / nặng | `#5c6b8a` | `#2e3550` |
| Bắn xa | `#8fbf6f` | mắt sáng `#e8ff6f` |
| Bay / nhỏ | `#bde0fe` | `#5a7fa6` |
| Elite | `#a15fd6` (tím — chỉ dành riêng elite) | `#3d1f52` + rim đỏ nhẹ |

**Hiệu ứng/pickup — bão hoà + sáng cực đại:** XP `#2fe6ff` · vàng `#ffe74c` · hồi máu `#4dff88` ·
buff hiếm `#ff2fd0`.

### 2.3 Hình khối nói cho biết nó làm gì

Nguyên tắc gốc: tam giác/gai = nguy hiểm, tốc độ · vuông/khối = nặng, phòng thủ · tròn = vô hại
([pixune](https://pixune.com/blog/shape-language-technique/)). Enter the Gungeon minh hoạ luật "chi
tiết = chức năng": lính có mắt nhưng không miệng; Mimic có mắt + một nòng súng thò ra từ miệng, báo
trước cơ chế tấn công.

Áp vào 6 tộc quái hiện có (`RESEARCH.md` mục 14.4):

| Tộc | Lối đánh | Hình khối nên có | Hiện tại |
|---|---|---|---|
| Vacca | charger | **Thoi/mũi tên nhọn**, xoay theo hướng lao bằng `ctx.rotate` | `shape:'bull'` — ellipse + 2 tam giác sừng, không xoay |
| Fungo | tank | **Chữ nhật/ngũ giác nặng**, cạnh vuông, size class lớn hơn hẳn | ellipse như mọi con khác |
| Galena | ranged | Thân tròn + **1 "mắt" lớn phát sáng lệch một phía**, đổi màu trước khi bắn | `shape` mặc định |
| Bat | flyer | Nhỏ, cánh tam giác, **bóng nhỏ hơn và lệch xa thân** (não đọc ra "đang trên không") | có cánh, bóng vẫn như quái đất |
| Geguri | hopper | Có `z` khi nhảy — cần bóng co lại + scale nhẹ | có `z` nhưng bóng chỉ co khi bị launch |
| Purun | swarm | Tròn, mềm, nhỏ nhất — để mắt bỏ qua và chém cho đã | đúng rồi |

Quy định **3–4 size class cố định** (nhỏ 24 / thường 36 / lớn 56 / boss 120+), không dùng size trung
gian mơ hồ — não phân loại theo cụm size trước khi nhìn chi tiết.

### 2.4 Có nên chuyển sang pixel art sprite không? — **KHÔNG**

Ước tính khối lượng nếu chuyển (`[SUY LUẬN]`, theo chuẩn 4–6 frame/animation của Slynyrd):
~57 frame/loại quái × 15 loại ≈ **850 frame**, + 150–250 frame cho một boss, + 60–100 frame vũ khí
= **~1000–1300 frame** phải vẽ, giữ nhất quán phong cách, cho một người không phải artist. Cộng thêm
việc phải dựng mới toàn bộ pipeline ảnh (loader, atlas, animation state machine) mà project hiện
**hoàn toàn chưa có** — grep `drawImage`/`new Image(` trên cả `js/` cho 0 kết quả.

Trong khi đó mọi kỹ thuật ở mục 2 và 4 đều làm được **bằng code**, áp dần từng phần, không
all-or-nothing. Và hình học có lợi thế mà sprite không có: **xoay 360° mượt tuyệt đối miễn phí** —
không có "góc chết" như sprite 4/8 hướng.

### 2.5 Hướng nhìn — thân lật trái/phải, vũ khí xoay tự do

Vấn đề của flip-only trong game có chém theo hướng: vũ khí gắn cứng vào thân thì lật gương sai tay.
Cách Enter the Gungeon / Nuclear Throne / Soul Knight giải: **tách lớp** — thân chỉ lật trái/phải,
**vũ khí là object riêng xoay tự do 360° quanh điểm neo ở tay**, hướng theo góc ngắm thật.

Với canvas hình học việc này còn dễ hơn cả pixel art: vũ khí chỉ là một path `ctx.rotate(góc)`. Game
đã có `p.facing` — chỉ cần tách phần vẽ vũ khí ra khỏi phần vẽ thân trong `drawChar`.

---

## 3. Skill — 10 kiểu biến đổi của Sephiria

Đây là phần trả lời trực tiếp cho "skill nhàm chán". Sephiria có "**more than 50 unique upgrades**"
mỗi vũ khí, "radically transform how it plays". Câu hỏi là: **biến đổi bằng cách nào?**

Dữ liệu dưới đây lấy từ DCInside (người chơi Hàn thật, không phải trang SEO). Đọc hết mấy chục nhánh
nâng cấp thì thấy chúng xoay quanh đúng **10 kiểu biến đổi**, lặp có hệ thống cho cả 6 vũ khí:

| # | Kiểu biến đổi | Ví dụ thật từ Sephiria |
|---|---|---|
| 1 | Đổi **số đòn/hình dạng combo cơ bản** | 당근 검 (Carrot Sword) đổi hẳn combo 5 đòn · 모이는 그림자 (Gathering Shadows) thêm **+2 đòn vào cuối combo** Đại kiếm |
| 2 | Đổi **hệ nguyên tố** của cả vũ khí | 전격 대검 "E2G" (Đại kiếm điện) · 한기가 서린 대검 (Đại kiếm băng) · 유이의 소단검 có 3 biến thể lửa/băng/sét |
| 3 | Đổi **cận chiến ↔ tầm xa** | 매직 완드 biến Kiếm&Khiên thành gậy bắn **đạn tự dò mục tiêu** · 솜다리 biến Dao găm thành vũ khí tầm xa |
| 4 | Đổi **cơ chế của chính đòn đặc biệt** | 뼈 장치검 biến Whirlwind từ **đòn sát thương thành skill buff** · một nhánh Fury **đảo ngược hướng**: "lùi một bước về sau trong khi ném một shuriken khổng lồ về phía trước" |
| 5 | Thêm **kích hoạt chéo giữa các hệ thống** | 서릿빛 조각 **tự tung đòn búa trong lúc dash** · Perfect Guard **tích lực tức thì** cho Whirlwind · 드리파: "**After dodging**, the sickle spins and follows the player's crosshair" |
| 6 | Thêm **input kỹ thuật mới** | 비류 (Biryuu): "Hold left-click, tap right-click **for draw-cuts only**" — chen một nhát rút kiếm vào giữa combo mà không phá combo |
| 7 | Đổi **công thức sát thương** theo hướng lạ | 아다마흐의 서약: sát thương **scale theo hiệu số MP tối đa trừ MP hiện tại** — càng xài cạn mana càng mạnh |
| 8 | **Đánh đổi tài nguyên** | 폭발 장치: băng đạn **giảm còn 2 viên** để đổi lấy sát thương nổ |
| 9 | **Vô hiệu hoá hẳn một cơ chế cũ** để mở cơ chế mới | Có nhánh Dao găm **bỏ hẳn Parry** để đổi lấy hoả lực khác · 레이피어 biến đòn thường thành phán định dash-attack nhưng **mất khả năng proc "crown"** |
| 10 | **Yêu cầu kết hợp với 1 artifact cụ thể mới biến hình** | 드리파 chỉ biến thành "Blizzard Sickle" **nếu đang mang artifact "Blizzard Hammer"** |

Vài nhánh nữa đáng ghi riêng vì tính "biến hình" rõ:
- **공방일체** (Offense-Defense Unity): "Guard generates at **90 degrees** when attacking forward" —
  đánh thường tự sinh vùng đỡ.
- **불편한 기쁨** (Awkward Joy): biến Đại kiếm thành "**laser greatsword**" — tầm vươn xa hơn hẳn.
- **흑철 할버드** (Black Iron Halberd, bản 1.0): "When **holding** the special attack key, **a range
  appears**. Hitting within that range deals additional damage plus **0.7% lifesteal**", kèm lực đẩy
  người chơi lao về trước.
- **솔리스 임베르** (Solaris Ember, bản 1.0): "Successfully **parrying** causes the weapon to **glow**;
  during the glow duration, special attacks trigger **enhanced** attacks."
- **불꽃 단검** (Flame Dagger): đòn đặc biệt biến thành **ném 5 dao găm hình quạt** — phải đứng sát
  mới dồn hết 5 phát.

Và: "각 무기는 최대 2회 강화할 수 있으며, 2단계 강화는 1단계 강화에 **누적**되어 적용되는 방식" —
mỗi vũ khí nâng cấp tối đa **2 lần**, cấp 2 **cộng dồn** lên cấp 1 chứ không thay thế.

### 3.1 Quyết định: **2 skill mỗi vũ khí, mỗi cái là một màn diễn**

HUD chỉ có **2 nút** (`index.html:443-444` — `hMagi0`, `hMagi1`); ô Magi thứ ba nằm trên giáp và là
passive. Cộng với hướng "charge lâu, cooldown lâu" thì kết luận là: đừng nhét 4 tiện ích lặt vặt vào
mỗi cây. **Hai skill, mỗi cái nặng, có telegraph, có rủi ro, và bán được một fantasy.**

Luật chung, áp cho cả 10 skill:

| | |
|---|---|
| Charge | 0,9–2,2s. Trong lúc charge **đứng yên hoặc đi chậm** — đây là cái giá |
| Cooldown | 14–24s. Không skill nào spam được |
| Telegraph | Bắt buộc, và **cho cả quái lẫn người chơi thấy** — vòng lớn dần / vệt sáng / đất nứt |
| Input | `punicon.js` đã có: giữ rồi **trượt về hướng nút** → `onSkillSlide(id)`. Sửa để nó vào **thế charge** thay vì phát ngay; giữ tiếp để nạp, thả để xả |
| Huỷ | Vẩy né trong lúc charge = huỷ, **hoàn lại 60% cooldown** (không phạt việc đọc tình huống đúng) |

### 3.2 Mười skill

**SONG KIẾM — sát thủ.** Lén lút, mượt, một nhát định đoạt.

- **Ảnh Độn** · charge 0,9s · CD 14s
  Charge: nhân vật **chìm dần vào bóng** — alpha giảm về 0,35, viền tím lan ra, quái **mất dấu**
  (aggro tạm rơi). Một vòng ngắm khoá lên con gần nhất.
  Thả: **biến mất 1 khung** → hiện **sau lưng** mục tiêu sau 0,15s → **một nhát duy nhất**.
  Trúng sau lưng ×2,5; mục tiêu đã kịp quay lại thì chỉ ×1,0.
  VFX: khói tím tan ở điểm đi · vệt mảnh nối hai điểm · 5 afterimage dọc đường · **vệt chém nở ra
  TRỄ 0,12s sau khi đã hiện** — chỗ này là toàn bộ cảm giác "mượt", đừng vẽ cùng lúc.

- **Tàn Ảnh** · charge 1,1s · CD 20s
  Để lại một **ảo ảnh đứng yên hút aggro**; bản thân vào trạng thái mờ 3s, trong 3s đó **mọi đòn
  tính là backstab**. Hết giờ thì ảo ảnh nổ.

**ĐẠI KIẾM — đao phủ.** Chậm, nặng, cả sân thấy nó tới.

- **Trảm Thiên** · charge 2,0s · CD 16s
  Giơ kiếm lên trời, đất nứt dưới chân, vòng đỏ lớn dần. Charge **giảm 50% damage nhận**
  (dùng lại `cleaveDR`). Thả: **sóng nứt lan thẳng 300px xuyên tất cả** + hất tung + quake.

- **Nghiền** · charge 1,4s · CD 22s
  Cắm kiếm, **hút toàn bộ quái bán kính 180 vào tâm**, rồi một cú đập **poise ×4** → vỡ thế hàng
  loạt. Đây là công cụ "hút quái" mà game hiện không có.

**KIẾM & KHIÊN — bức tường.** Phòng thủ là tấn công.

- **Thành Trì** · charge 1,0s · CD 18s
  Cắm khiên tạo **tường cung đứng yên 5s** chặn mọi đạn. Đứng sau tường thì đòn đánh **+40%**.

- **Thiên Chuỳ** · charge 1,6s · CD 15s
  Lao xuyên **có giáp** — không bị ngắt, không bị văng — dồn mọi con chạm phải tới cuối đường lao
  rồi đập hất tung cả đám.

**THƯƠNG — long kỵ.** Tầm với và trên không.

- **Yến Phi Trảm** · charge 1,3s · CD 15s
  Cắm thương bật người lên cao (z ảo, bóng co nhỏ, camera lùi nhẹ), **vòng đỏ điểm rơi đi theo ngón
  tay**. Thả: đâm xuống, AOE + hất tung. Đây là "bay nhảy" — dùng đúng hạ tầng `z` đã có.

- **Xuyên Vân** · charge 1,8s · CD 20s
  Một cú đâm xuyên thẳng 500px; mỗi con xuyên qua **+20% cho con sau** — thưởng cho việc canh cho
  quái xếp hàng.

**CUNG — thợ săn.** Kiểm soát không gian.

- **Vũ Tiễn** · charge 1,6s · CD 18s
  Kéo ngón chọn vùng (telegraph vàng). Thả: bắn lên trời, 0,8s sau **mưa 14 mũi**, mỗi mũi có bóng
  nhỏ báo trước điểm rơi.

- **Nhất Tiễn Xuyên Tâm** · charge 2,2s (lâu nhất game) · CD 24s
  Vạch ngắm mảnh kéo dài dần theo charge. Thả: xuyên **toàn bộ hàng** + DoT; trúng WEAK thì hitstop
  190ms + zoom punch.

### 3.3 Lớp NGUYÊN TỐ — chỗ lấy biến hoá mà không phải viết 60 skill

Hiện `G.ELEMENTS` chỉ là **hệ số damage + một mã màu tint**. Nó chưa hề biểu diễn ra ngoài màn hình:
lôi kiếm và hoả kiếm chém giống hệt nhau, chỉ khác màu.

Cho mỗi skill hai móc — `trail` (vệt để lại dọc đường) và `burst` (thứ bung ra tại điểm chạm) — rồi
để **bảng nguyên tố** quyết định hai móc đó trông ra sao và làm gì thêm. Một bảng, mười skill hưởng.

| Hệ | Vệt để lại (`trail`) | Bung ra khi chạm (`burst`) | Cơ chế phụ |
|---|---|---|---|
| **Lôi** `#ffd23f` | Đường **điện gãy khúc** dọc đường lướt, nhánh con toả hai bên, tồn tại 0,4s | **Tia điện nảy sang 2 con gần nhất** trong 120px | Tê liệt ngắn |
| **Hỏa** `#ff9f2e` | **Vệt lửa cháy trên đất** 3s, DoT ai đứng vào | Quầng lửa bung + tàn lửa bay lên | Bỏng (DoT) |
| **Thủy** `#4fb6ff` | Vệt băng, mặt đất **trơn** (quái trượt quá đà) | Mảnh băng vỡ toả ra | Chậm, đóng băng |
| **Thổ** `#8fd14f` | Vết nứt chạy dọc đường | **Gai đá trồi lên** tại điểm chạm | Knockback lớn, quake |
| **Quang** `#fff6d8` | Vệt sáng trắng, mờ dần chậm | Loé sáng | **Mù ngắn** — quái mất mục tiêu |
| **Ám** `#a06fe0` | Vệt khói đen, tụ lại thành vũng | Vũng ám tại điểm chạm | **Hút máu** theo % damage |

Ví dụ đúng như bạn nói: **Song Kiếm hệ Lôi** dùng **Ảnh Độn** → lúc chớp tới để lại một **đường điện
gãy khúc** nối hai điểm, và nhát chém sau lưng thì **điện nảy sang 2 con bên cạnh**. Cùng skill đó
mà cầm **hệ Hoả** thì đường đi để lại **vệt lửa cháy 3s**, và nhát chém bung một quầng lửa.

`[SUY LUẬN]` Đây chính là kiểu biến đổi số 2 và số 5 trong bảng Sephiria ở mục 3 — đổi hệ nguyên tố
của cả vũ khí, và thêm kích hoạt chéo giữa các hệ thống. Chi phí: một bảng 6 dòng + hai móc trong
trình phát skill. Lợi: mọi skill tự có 6 biến thể hình ảnh và 6 cơ chế phụ.

### 3.4 Cái gì thay thế gacha rune

Rune bị xoá thì mất luôn nguồn "cảm giác tiến trình". Thay bằng:
1. **Skill 2 mở theo cấp vũ khí** (skill 1 từ đầu, skill 2 ở Lv.8).
2. **Mỗi skill có 2 nhánh nâng cấp**, dựng theo 10 kiểu biến đổi ở mục 3 — ví dụ Ảnh Độn nhánh A
   "chớp tới **3 mục tiêu** liên tiếp", nhánh B "trúng sau lưng thì **hoàn 60% cooldown**".
3. **Nguyên tố của vũ khí** trở thành lựa chọn build thật sự (mục 3.3), không còn chỉ là con số.

## 4. Thư viện VFX cần dựng (Canvas 2D, không thư viện, không ảnh)

Toàn bộ mục này là code chạy được ngay. Nguyên tắc xuyên suốt, rút từ Vlambeer "The Art of
Screenshake" và Jonasson & Purho "Juice It or Lose It": **juice là cộng dồn nhiều lớp nhỏ lên cùng
một sự kiện**, không phải một hiệu ứng to duy nhất. Một cú chém "đã" = vệt thon + glow + hitstop +
shake có hướng + flash + particle + số pop — mỗi thứ rẻ, cộng lại thì đắt giá.

### 4.1 Vệt chém thon (thay `ctx.arc` stroke nét đều)

Vấn đề của stroke: bề rộng không đổi từ đầu tới cuối. Cách sửa: đi dọc cung, tại mỗi điểm lấy 2 điểm
offset **theo phương bán kính** với độ lệch `width(t)/2`, nối thành path kín rồi `fill`.

```js
function buildSlashPath(ctx, cx, cy, radius, a0, a1, maxW, progress) {
  var end = a0 + (a1 - a0) * progress, N = 20, outer = [], inner = [];
  for (var i = 0; i <= N; i++) {
    var t = i / N;                                  // 0 = đuôi, 1 = mũi kiếm
    var a = a0 + (end - a0) * t;
    // taper: mảnh ở đuôi, phình ~60-70%, vót nhọn ở mũi
    var w = maxW * Math.sin(Math.PI * Math.pow(t, 0.6)) * (0.35 + 0.65 * t);
    var nx = Math.cos(a), ny = Math.sin(a);
    var px = cx + nx * radius, py = cy + ny * radius;
    outer.push([px + nx * w * 0.5, py + ny * w * 0.5]);
    inner.push([px - nx * w * 0.5, py - ny * w * 0.5]);
  }
  ctx.beginPath();
  ctx.moveTo(outer[0][0], outer[0][1]);
  for (var j = 1; j < outer.length; j++) ctx.lineTo(outer[j][0], outer[j][1]);
  for (var k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k][0], inner[k][1]);
  ctx.closePath();
}

function drawSlash(ctx, cx, cy, r, a0, a1, maxW, prog, edgeCol) {
  buildSlashPath(ctx, cx, cy, r, a0, a1, maxW, prog);
  ctx.fillStyle = edgeCol; ctx.fill();                    // viền màu
  buildSlashPath(ctx, cx, cy, r, a0, a1, maxW * 0.38, prog);
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();    // lõi trắng -> sắc
}
```

Thời gian quét: Song Kiếm 6–8 khung (~100–130ms) · Kiếm 8–12 khung (~130–200ms) · Đại Kiếm 14–20
khung (~230–330ms). Quét nhanh hơn thời gian đòn thật ~15–20%, rồi **giữ lại vệt mờ dần thêm 3–5
khung** thay vì cắt cụt.

Việc này khớp thẳng vào `mv.ms` và `mv.arc` sẵn có trong bộ đòn ở `data/gamedata.js:142+`.

### 4.2 Additive glow (thứ đang thiếu hoàn toàn)

Canvas 2D không có bloom thật, nhưng `globalCompositeOperation = 'lighter'` cộng thẳng RGB — chồng
nhiều lớp thì tự "cháy" ra trắng ở tâm, đúng cảm giác bloom.

**Mẹo quan trọng nhất: KHÔNG tạo `createRadialGradient` mỗi frame.** Tạo sprite glow một lần lúc
khởi động, sau đó chỉ `drawImage` scale.

```js
function makeGlowSprite(size, stops) {
  var c = document.createElement('canvas'); c.width = c.height = size;
  var g = c.getContext('2d');
  var grad = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return c;
}
var GLOW_FIRE = makeGlowSprite(128, [
  [0,   'rgba(255,255,255,1)'],
  [0.35,'rgba(255,200,80,.85)'],
  [1,   'rgba(255,120,0,0)']
]);
```

Dựng **một `fxCanvas` riêng**, set `'lighter'` **một lần cho cả layer** rồi `drawImage` gộp vào canvas
chính — đổi `globalCompositeOperation` xen kẽ hàng trăm lần/frame tốn hơn tưởng nhiều.

### 4.3 Afterimage / trail (cho dash và lướt chém)

Ring buffer vài tư thế gần nhất, vẽ lại với alpha tăng dần. Mẹo rẻ: **không vẽ lại toàn bộ hình học
nhân vật cho từng bóng mờ** — dựng một silhouette offscreen một lần, mỗi bóng chỉ là 1 `drawImage`.

```js
function makeSilhouette(srcCanvas, tint) {
  var c = document.createElement('canvas');
  c.width = srcCanvas.width; c.height = srcCanvas.height;
  var g = c.getContext('2d');
  g.drawImage(srcCanvas, 0, 0);
  g.globalCompositeOperation = 'source-atop';   // chỉ tô lên vùng đã có alpha
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  return c;
}
```

Chụp mỗi 2 frame (`sampleEvery = 2`) cho ra trail "nhấp nháy" đặc trưng của dash, đồng thời giảm
draw call. Alpha fade bậc 2 (`0.28 * t * t`) mượt hơn tuyến tính.

### 4.4 Impact frame — flash **silhouette**, không flash cả màn

Loé trắng toàn màn dễ chói và có rủi ro thật (xem mục 5.2). Cách "đã" mà không chói: flash đúng
silhouette con quái bằng `'source-atop'`.

| Loại đòn | Khung loé | Alpha đỉnh | Vùng |
|---|---|---|---|
| Đòn thường | 1–2 khung (16–33ms) | 0.4–0.5 | chỉ silhouette quái |
| Nặng/crit | 3–4 khung (50–66ms) | 0.7–0.85 | silhouette + viền glow màu |
| Kết liễu | 4–6 khung (66–100ms) | **0.15–0.25 full-screen** + 0.9 silhouette | + hitstop |

Full-screen flash luôn giữ alpha ≤ 0.25. Cái "đã" đến từ hitstop + shake + âm thanh, không phải độ
chói.

### 4.5 Squash & stretch bảo toàn diện tích

```js
var stretch = 1 + k * maxStretch;       // giãn theo hướng đi
var squash  = 1 / Math.sqrt(stretch);   // co trục vuông góc -> diện tích ~ không đổi
ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx)); ctx.scale(stretch, squash);
```

Lúc chạm đất dùng lò xo tắt dần có overshoot (`Math.exp(-6*t)` × `Math.cos(t*PI*2.5)`), và luôn
scale **quanh điểm chân chạm đất**, không phải tâm — nếu không chân sẽ trôi khỏi mặt đất.

Game đã có `m.squash` (`js/game.js:739`) nhưng dùng scale tuyến tính quanh tâm — sửa hai chỗ đó là
thấy khác ngay.

### 4.6 Particle system — bảng thông số

Bắt buộc **object pool**, không `new` mỗi lần spawn.

| Loại | Số hạt | Tốc độ (px/s) | Drag | Gravity | Lifetime | Vẽ bằng | Blend |
|---|---|---|---|---|---|---|---|
| **Spark** | 8–16 | 400–900 | 0.90–0.95 | 200–400 | 150–300ms | **`lineTo` theo hướng vận tốc**, dài ∝ tốc độ — KHÔNG phải chấm tròn | `lighter` |
| **Debris** | 6–12 | 150–400 | 0.3–0.6 | 800–1500 | 500–1200ms | đa giác 3–5 cạnh bất quy tắc, tự xoay | `source-over` |
| **Smoke** | 4–8 | 20–60 | 0.4 | −50 | 800–1500ms | gradient tròn, **nở theo tuổi** 4px → 30–50px | `source-over` |
| **Ember** | 4–10 | −80..−150 | 0.3 | −30 | 600–1000ms | chấm sáng, alpha nhấp nháy | `lighter` |
| **Máu** | 6–14 | 150–500 | 0.85 | 1500–2000 | 400–800ms | ellipse dài theo hướng bay, chạm đất → **decal tĩnh** | `source-over` |

Khác biệt lớn nhất so với `puff` hiện tại: **spark là tia dài theo hướng, không phải chấm tròn**. Đó
là thứ tạo cảm giác "sắc bén".

### 4.7 Screen shake có hướng, dùng noise

Random thuần giật cục vì camera dịch không liên tục giữa các khung. Eiserloh (GDC 2016) khuyến nghị
noise theo thời gian, điều khiển bằng **trauma** với độ rung tỉ lệ **trauma²**. Vlambeer bổ sung:
rung nên **có hướng** — giật ngược hướng đòn, kiểu camera kick.

```js
function hash(n){ var s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }
function noise1D(seed, x){
  var i = Math.floor(x), f = x - i;
  var a = hash(seed*13.13 + i), b = hash(seed*13.13 + i + 1);
  var u = f*f*(3 - 2*f);                    // smoothstep
  return a + (b - a) * u;
}
// mỗi frame:
var s = trauma * trauma;                    // trauma^2
var nx = noise1D(1, t*25)*2 - 1, ny = noise1D(2, t*25)*2 - 1;
var bias = 0.55;                            // % thành phần có hướng
ctx.translate(maxOff * s * (dirX*bias + nx*(1-bias)),
              maxOff * s * (dirY*bias + ny*(1-bias)));
ctx.rotate(0.035 * s * (noise1D(3, t*25)*2 - 1));
```

Chốt cứng: `maxOffset` 8–20px, góc xoay < 0.05 rad (~3°). Cộng dồn bằng `Math.max`, không `+=` — game
hiện tại đã làm đúng chỗ này (`this.shake = Math.max(...)`), chỉ thiếu hướng và noise.

### 4.8 Telegraph — ngôn ngữ màu nhất quán

Vàng = mới bắt đầu, còn kịp phản ứng → cam = sắp tới → đỏ = sắp nổ.

```js
var col = progress < 0.5 ? '255,210,60' : progress < 0.8 ? '255,140,30' : '255,40,20';
ctx.globalAlpha = 0.15 + 0.3 * progress;                 // đầy dần theo thời gian
ctx.setLineDash([10, 6]);
ctx.lineDashOffset = -now/1000 * (40 + 260 * progress);  // viền quay nhanh dần -> khẩn cấp dần
if (progress > 0.8) { /* nhấp nháy gấp ở giai đoạn cuối */ }
```

- **Vòng đầy dần** đọc là "sắp kích hoạt tại chỗ này"; **vòng thu lại** (`r*(1-t)`) đọc là "thoát ra
  trước khi khép". Hai nghĩa khác nhau, đừng dùng lẫn.
- **Mũi tên hướng lao**: chuỗi tam giác dọc path, `lineDashOffset` chạy liên tục tạo cảm giác dòng
  chảy về đích.
- **Mấu chốt**: tại khung "nổ", vùng sáng bừng phải **khớp chính xác hitbox thật**. Đây là lỗi UX
  nghiêm trọng nhất của thể loại và chính Sephiria bị chê vì nó (mục 1.4).

### 4.9 Quái chết

Hiện chỉ có biến mất. Bốn cách, mỗi cách một cảm giác:
- **Dissolve** — khoét dần bằng `destination-out`, viền mỗi lỗ tô sáng bằng `lighter` để trông như
  đang cháy chứ không phải bị "ăn Pac-Man". Tan từ dưới lên.
- **Vỡ mảnh** — cắt theo lưới bằng source-rect của `drawImage`, mỗi ô bay ra theo hướng từ tâm.
- **Bốc hơi** — scale 1 → 1.3 trong khi alpha về 0, dịch lên, spawn ember dọc viền.
- **Văng xác** — giữ vector lực của đòn kết liễu làm vận tốc, rơi parabol, chạm đất thì squash mạnh
  + debris, rồi **vẽ một lần lên layer decal tĩnh** (thôi update mỗi frame).

### 4.10 Hiệu năng — giữ 60fps với hàng trăm hạt

1. Object pool, không cấp phát trong loop.
2. **Batch theo màu**: gộp nhiều hạt cùng màu vào **1 lệnh `fill()`** — `moveTo` + `arc` cho từng hạt
   rồi `fill()` một lần.
3. **Tránh `shadowBlur`** — một trong những thuộc tính chậm nhất của Canvas 2D (MDN). Thay bằng
   sprite gradient cache sẵn.
4. Không tạo gradient mỗi frame. Cache thành offscreen canvas.
5. Tách layer theo composite mode, set một lần cho cả layer.
6. Làm tròn toạ độ (`x|0`) khi vẽ hạt nhỏ — toạ độ lẻ buộc tính anti-alias subpixel.
7. Trần cứng 300–500 hạt sống. Đầy pool thì **từ chối spawn mới**, ưu tiên spark/impact hơn tro trang trí.
8. Cap `dt` (`Math.min(dt, 32)`) — quay lại tab sau khi ẩn gây `dt` khổng lồ làm hạt nhảy cóc.
9. Kiểm thử ở **trường hợp xấu nhất cộng dồn**: boss chết + shatter + máu + số combo + zoom punch
   cùng lúc. Đây luôn là khung nặng nhất game, không phải combat thường.

---

## 5. Cạm bẫy — bài học từ những game làm quá tay

Đây là phần **quan trọng ngang phần khen**, vì mọi game trong nhóm này đều vấp cùng một chỗ.

### 5.1 Ai cũng vấp "particle vomit" ở late-game

- **HoloCure**: "the moment it affects gameplay a fix should be in order. I had multiple attacks
  (most of all collabs) that **make it impossible to see anything**."
  ([Steam](https://steamcommunity.com/app/2420510/discussions/0/3810661765912683193/))
- **Deep Rock Galactic: Survivor**: "**Most non-projectile weapons cover the screen in unreadable
  particle vomit** if you upgrade them enough." · "I have died multiple time because i can't see
  anything in the middle of the screen."
  ([Steam](https://steamcommunity.com/app/2321470/discussions/0/4342103279859098015/))
- **Vampire Survivors**: "Late game Vampire Survivors often turns into a black screen and/or **screen
  of rainbows filled with damage numbers**"; "the big number at the bottom of the screen constantly
  gets bigger, and **the higher it gets, the less a player can see**".
- **Death Must Die**: được khen "gorgeous", so sánh với Hades, nhưng cộng đồng vẫn phàn nàn hiệu ứng
  phép che khuất quái/đạn/vật phẩm. Đẹp ≠ đọc được.

**Kết luận thẳng**: nếu làm đúng mục 4 thì **chắc chắn** sẽ gặp vấn đề này. Phải chuẩn bị từ đầu:
slider giảm VFX trong settings, trần số lượng particle, và số sát thương phải gộp khi chồng.

### 5.2 Rủi ro thật, không phải chuyện thẩm mỹ

> "I have **Photophobia** and this is the only attack that triggers it, leaving me with **a headache
> after just 10 minutes** of playing." (vẫn còn dù đã set opacity về 0)
> — HoloCure, [Steam](https://steamcommunity.com/app/2420510/discussions/0/3824172831342741158/)

Chớp trắng toàn màn hình lặp lại là rủi ro sức khoẻ thật. Giữ full-screen flash ở alpha thấp và
không lặp nhanh.

### 5.3 Bài học ngược từ Vampire Survivors

VS bị chê thẳng — "In screenshots, it looks ugly, sure. **In motion, well, it doesn't look so great
either**" — mà vẫn gây nghiện khủng khiếp. Và sự lộn xộn đó vốn là **tai nạn**: Galante dùng Phaser,
phát hiện "the sprites were not getting rendered at the right size", rồi mê luôn: "They were all
very chaotic [and] messy."
([GameDeveloper](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream))

Cái **bắt buộc** phải có: nhịp phần thưởng nhanh (VS gần như mỗi ~23 giây có gì đó mới), cảm giác
quét sạch đàn quái, số liệu hiển thị được sức mạnh. Cái chỉ là **trang trí**: độ chi tiết sprite, số
frame animation.

Với game này thì ngược lại — cơ chế đã tốt, nhịp đã có, cái thiếu đúng là lớp trình diễn. Nên phần
VFX ở đây **không phải trang trí**, mà là thứ đang chặn cảm giác.

### 5.4 Skill nên kiêm chức năng dọn màn hình

Soul Knight có nhiều ultimate kiêm "phá đạn địch trong bán kính" — vừa là phần thưởng sát thương,
vừa **tự giải quyết vấn đề rối mắt do chính game tạo ra**. Đáng học: cho một vài Magi SS có thêm
thuộc tính xoá đạn/telegraph trong vùng.

---

## 6. Cơ động — lướt chém, bay nhảy

### 6.1 Số liệu i-frame thật (dùng để hiệu chỉnh, không chép nguyên)

| Game | Số liệu | Nguồn |
|---|---|---|
| Enter the Gungeon | roll **~0.7s tổng**, i-frame **nửa đầu (~0.35s)**; nửa sau vẫn di chuyển nhưng ăn đạn | [wiki.gg](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)) |
| Dark Souls 3 | roll nhanh/vừa **13 i-frame / 24 khung tổng**; roll nặng **12 / 28** | [Fextralife](https://fextralife.com/forums/t55240/fourth-poise-test-with-rolls-frame-counts-iframes-wr) |
| Dead Cells | roll **0.4s** + **cooldown 0.37s** riêng | [wiki.gg](https://deadcells.wiki.gg/wiki/Mechanics) |
| Genshin | dash **20 khung**, nhảy **30 khung** (60fps) | [KeqingMains](https://library.keqingmains.com/combat-mechanics/frames) |
| Hyper Light Drifter | **~3 dash liên tiếp** rồi trượt/mất kiểm soát | nhiều nguồn độc lập khớp nhau |
| Diablo III Leap | tầm **45 yard**, AOE điểm rơi **10 yard**, slow 60% trong 3s | [Blizzard](https://eu.diablo3.blizzard.com/en-us/class/barbarian/active/leap) |

Bộ tham số tối thiểu cho một "leap attack": **tầm nhảy tối đa · bán kính AOE điểm rơi · hiệu ứng phụ
ngoài sát thương**.

### 6.2 Làm sao dash-attack không thành đòn bá

Ba cách, đều có bằng chứng:
1. **Đánh đổi i-frame** — Hades: "**You don't get iframes when you dash strike**" với đa số vũ khí;
   "the invincibility is lost immediately if you take any other action."
2. **Đánh đổi hướng đi** — Genshin plunge: phải cam kết trước vào một điểm đến, không đổi ý giữa chừng.
3. **Đánh đổi quyền hành động** — Yasuo teleport-slash: animation khoá cứng, đoán sai thì ăn trọn đòn.

Game hiện có `dash` move cho cả 5 vũ khí (`data/gamedata.js:148,169,191,214,232`) — cần thêm một
trong ba cái giá này, hiện chưa có cái nào.

### 6.3 "Bay nhảy" trong top-down là ảo giác thị giác

Kỹ thuật chuẩn: **hai hệ toạ độ song song** — `real position` cho va chạm/logic, `display position`
để vẽ, với `display = (real.x, real.y - z)`; z-sort vẫn theo `real.y` gốc để giữ đúng lớp trước/sau.
Kết luận của thread Unity: "**jumping in top-down 2D is an illusion**".

Game **đã có** `m.z` và bóng co lại (`js/game.js:2281`: `shK = 1 - Math.min(0.55, z/40)`). Cái thiếu
là: (a) chỉ quái bị launch mới có z, người chơi không có; (b) chưa scale nhân vật theo độ cao;
(c) chưa có telegraph vùng đổ bộ.

Thứ tự ưu tiên để độ cao **đọc được**:
1. Bóng co giãn dưới chân (rẻ nhất, hiệu quả nhất) — đã có.
2. Dịch sprite lên theo z ảo — đã có.
3. Scale nhẹ nhân vật theo độ cao — chưa có.
4. **Vòng cảnh báo vùng đổ bộ** trước khi rơi — chưa có, và đây là thứ biến "Bổ Trời" từ một cú nhảy
   thành một đòn có thể né/đọc được.
5. Camera shake + bụi nứt đất khi tiếp đất.

### 6.4 Combo & cancel — con số để chỉnh

- **Input buffer**: Super Smash Bros Brawl "a window of **10 frames**"; Ultimate "**9 frames**".
  `[SUY LUẬN]` Với cảm ứng (latency cao hơn tay cầm), **6–10 khung (~100–166ms)** ở cuối mỗi đòn là
  điểm khởi đầu hợp lý. Game hiện có `comboWindowMs: 520` — đó là cửa sổ nối combo, không phải buffer;
  hai thứ khác nhau, nên bổ sung buffer riêng.
- **Ngưỡng phản ứng người**: "Your standard attack needs to be faster than average human reaction
  time, which is about **250 milliseconds, or 18 frames** in a 60fps game" · "the fastest attacks
  should probably be only as slow as **10-12 frames of startup**" — [CritPoints](https://critpoints.net/2026/02/28/melee-attacks-in-pvp-must-be-fast/).
  Đòn thường của Song Kiếm hiện là 125–130ms — đúng chuẩn. Đại Kiếm 540–700ms — cố ý chậm, cũng đúng.
- **Bố cục vũ khí theo tốc độ**: "Fast, short range, plus frame moves. Then you scale outwards to
  slower, longer range, minus frame moves."

### 6.5 Một ngón — trần 5 cử chỉ

> "The most successful games use **3-5 core gestures** that feel different enough to avoid confusion."
> — [mygamedesign.com](https://www.mygamedesign.com/how-do-you-design-mobile-games-for-one-thumb-play/)

> "This means you **cannot push the player EVER to use two control mechanics at once**."
> — [mobilefreetoplay.com](https://mobilefreetoplay.com/control-mechanics/)

Bộ 5 cử chỉ đề xuất (3 cái đầu đã có):
1. **Kéo** — di chuyển.
2. **Chạm** — đánh thường, tap liên tiếp ra combo.
3. **Vẩy ngắn theo hướng** — né/dash.
4. **Giữ rồi thả** — đòn charge (vòng tích lực lớn dần quanh nhân vật).
5. **Vẩy dài rồi giữ ở cuối** — skill đặc biệt. Dùng thay cho "giữ trên nhân vật mở menu" của Punicon
   gốc, để không phải nhấc ngón ra khỏi vùng di chuyển.

*Đính chính cho `RESEARCH.md` mục 1*: Punicon là công nghệ của **Colopl** (xuất hiện đầu ở Colopl Rune
Story, nổi nhất ở White Cat Project), không phải của Dragon Project. Nintendo từng kiện Colopl năm
2017 về patent "joystick ảo trên màn hình cảm ứng", Colopl trả khoảng 30–41 triệu USD
([Kotaku](https://kotaku.com/nintendo-s-lawsuit-forces-japanese-dev-to-cough-up-30-1847420631)).

---

## 7. Công cụ generate VFX — khảo sát và kết luận

Đã khảo 7 nhóm. Kết luận ngắn: **với project này, tự viết là đúng nhất**, và lý do rất cụ thể.

**Ràng buộc quyết định tất cả**: grep `drawImage` và `new Image(` trên toàn bộ `js/` cho **0 kết
quả**. Project chưa có bất kỳ pipeline ảnh nào. Nghĩa là mọi công cụ xuất PNG/GIF đều cần **xây mới
từ đầu** một lớp image loader + frame-drawImage + animation clock — chi phí cố định phải cộng vào mọi
phương án dùng ảnh.

| Hạng | Chọn gì | Vì sao | Công sức |
|---|---|---|---|
| **1** | **Tự viết particle system** mở rộng trên `this.fx` sẵn có | Khớp 100% kiến trúc hiện tại (vanilla, 0 dependency, 0 ảnh). Giải quyết đúng vấn đề "VFX nghèo" bằng cách nâng cấp chính kỹ thuật hình học đó. 0 KB thêm, 0 rủi ro license. | 0.5–2 ngày |
| **2** | **[Kenney Particle Pack](https://kenney.nl/assets/particle-pack)** (CC0) làm texture hạt | CC0 tuyệt đối an toàn, 80+ sprite khói/tia lửa/glow game-ready. Bổ trợ cho hạng 1: hạt dùng texture thay vì chỉ hình khối. | +1 ngày (dựng loader + atlas + base64 embed, tái dùng về sau) |
| **3** | **[Pixel FX Designer](https://codemanu.itch.io/particle-fx-designer)** (~$15–20) hoặc **[Pixel Composer](https://pixel-composer.com/)** ($5) để bake VFX "đinh" | Cho vài đòn quan trọng (finisher, Magi SS, skill boss) một chất lượng mà particle hình học không đạt. Xuất PNG tĩnh, nhúng base64 được, chạy offline. | vài giờ học tool + thời gian thiết kế |

**Không dùng làm trụ cột:**
- **Effekseer** — miễn phí và mạnh, nhưng runtime web **chỉ WebGL**, không có canvas-2d. Chỉ dùng
  gián tiếp qua chức năng Record bake ra PNG sheet — mất hết lợi thế real-time.
- **AI generator** (PixelLab, Retro Diffusion) — dùng được để phác thảo, chưa đủ tin cậy làm nguồn
  chính. Tình trạng bản quyền output vẫn là vùng xám; ToS của bên bán không phải phán quyết pháp lý.
- **Unity Asset Store VFX** — phần lớn là particle system + shader Unity, muốn dùng phải tự bake bằng
  Unity Recorder rồi cắt sheet. Không phải "cắm vào là chạy".
- **tsParticles / Proton** — MIT, có canvas 2D renderer, nhưng dư thừa khi chỉ cần vài chục hạt bay
  ra lúc đánh trúng, và thêm dependency vào một project đang 0 dependency.

**Về giấy phép asset** (đọc kỹ trước khi phát hành): [Kenney](https://kenney.nl/) và
[OpenGameArt](https://opengameart.org/) là **CC0**, an toàn nhất và luôn ghi rõ license trên trang.
Các trang itch.io cá nhân (Frostwindz, Ansimuz, JasonTomLee, sanctumpixel, kiddolink) chất lượng cao
hơn nhưng **license không chuẩn hoá** — bắt buộc đọc từng trang và lưu bằng chứng. CraftPix và
GameDevMarket có license riêng rõ ràng: dùng thương mại thoải mái, **cấm bán lại asset gốc**.

**Không xác minh được**: giá hiện tại của Pixel FX Designer / TimelineFX Pro; license text đầy đủ của
vài trang itch.io; trạng thái tồn tại của Particle Designer (71squared); kích thước bundle chính xác
của proton-engine/tsParticles.

---

## 8. Thứ tự làm

Xếp theo **tác động / công sức**, làm được từng bước độc lập, không all-or-nothing:

**Đợt 1 — rẻ nhất, đổi cảm giác nhiều nhất (nửa ngày mỗi việc)**
1. **Viền đậm nhất quán cho mọi thực thể** — `stroke` 2–3px màu `#1b1626` trước khi `fill`. Boss đã
   có, chỉ cần nâng quái thường lên theo. Một thay đổi nhỏ, tác động lớn nhất tới cảm giác "được
   thiết kế".
2. **Vệt chém thon** (mục 4.1) thay `ctx.arc` stroke — dùng lại `mv.arc`/`mv.ms` sẵn có.
3. **Screen shake có hướng + noise** (mục 4.7) — sửa đúng `js/game.js:1803` và bổ sung hướng vào
   `impact()`.
4. **Khoá dải đỏ cho telegraph** (mục 2.2) — dời màu hệ Hoả, dời màu số sát thương ăn phải.

**Đợt 2 — lớp ánh sáng (1–2 ngày)**
5. **Layer `fxCanvas` + additive glow** (mục 4.2) — hạ tầng cho mọi thứ sau đó.
6. **Particle system tự viết** (mục 4.6) — spark tia dài, debris, khói, ember, máu + decal.
7. **Impact frame silhouette** (mục 4.4) thay flash trắng phẳng.
8. **Nền mới** — bỏ ô ca-rô, dùng palette mục 2.2 + 3–4 biến thể tile + doodad rải ngẫu nhiên + random
   flip/rotate mỗi ô để phá lưới.

**Đợt 3 — bản sắc (2–3 ngày)**
9. **Redesign silhouette 6 tộc quái** theo mục 2.3 — chỉ đổi path hình học, không cần vẽ.
10. **Tách vũ khí thành object xoay riêng** (mục 2.5) — giải quyết cùng lúc vấn đề hướng và art.
11. **Gradient 2 tông + highlight lệch + rim light** cho quái.
12. **VFX chết của quái** (mục 4.9).

**Đợt 4 — skill (phần lớn nhất)**
13. **Đổi schema Magi sang `shape` + `steps`** (mục 3.1) + viết trình phát. Đây là việc lớn nhất và
    cũng là việc trả lời trực tiếp nhất cho "skill nhàm chán".
14. Thêm nhóm skill cơ động + khống chế (mục 3.2).
15. Cho `dash` move một cái giá (mục 6.2).
16. Áp 10 kiểu biến đổi của Sephiria (mục 3) làm khung cho hệ nâng cấp vũ khí.

**Đợt 5 — kỷ luật**
17. Slider giảm VFX trong settings. Trần particle. Gộp số sát thương khi chồng. (mục 5.1)
18. Kiểm thử trường hợp xấu nhất cộng dồn (mục 4.10 điểm 9).

---

## Nguồn

**Sephiria** — [Steam 2436940](https://store.steampowered.com/app/2436940/Sephiria/) ·
[Steam Community](https://steamcommunity.com/app/2436940) ·
[teamhoray.com](https://teamhoray.com/games/sephiria) ·
[itch.io](https://team-horay.itch.io/sephiria) ·
[DCInside 세피리아 갤러리](https://gall.dcinside.com/mgallery/board/view/?id=sephiria) (nguồn thật, weapon tree) ·
[NamuWiki 세피리아](https://namu.wiki/w/세피리아) ·
[Gaming Furever](https://gamingfurever.com/reviews/sephiria-review-raving-for-this-rabbit-roguelite) ·
[InsertCoins](https://insertcoins.press/en/articles/sephiria-test) ·
[LadiesGamers](https://ladiesgamers.com/sephiria-review/) ·
[GameLand](https://gameland.gg/sephiria-review-rabbits-roguelike/) ·
[Game Atlas](https://game-atlas.de/en/reviews/sephiria/) ·
[Duuro](https://duuro.net/blog/sephiria-review-pc-rog-xbox-ally-x)

**Game feel / juice** — Vlambeer "The Art of Screenshake" ([video](https://www.youtube.com/watch?v=AJdEqssNZ-U), [archive](https://archive.org/details/the-art-of-screenshake)) ·
Jonasson & Purho "Juice It or Lose It" ([GDC Vault](https://www.gdcvault.com/play/1016487/Juice-It-or-Lose), [recap](https://devblog.heisarzola.com/gdcr-juice-it-or-lose-it/)) ·
Eiserloh "Juicing Your Cameras With Math" ([slide PDF](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf)) ·
[CritPoints](https://critpoints.net/) (frame data, parry, melee speed, airdash) ·
[Swink — Game Feel](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient)

**Kỹ thuật Canvas** — [MDN globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) ·
[MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) ·
[Kirupa — Motion Trails](https://www.kirupa.com/canvas/creating_motion_trails.htm) ·
[Matt Greer — 2D Lighting](https://www.mattgreer.dev/blog/dynamic-lighting-and-shadows/) ·
[Inigo Quilez — Texture Repetition](https://iquilezles.org/articles/texturerepetition/)

**Art direction** — [Slynyrd Pixelblog 1 (palette)](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes) ·
[Pixelblog 22 (top-down sprites)](https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites) ·
[Pixelblog 55 (animation)](https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation) ·
[saint11](https://saint11.art/blog/pixel-art-tutorials/) ·
[pixune — Shape Language](https://pixune.com/blog/shape-language-technique/) ·
[Readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs) ·
[Enemy Attack Telegraphs](https://bugnet.io/blog/how-to-design-enemy-attack-telegraphs)

**Game khác** — [Enter the Gungeon wiki](https://enterthegungeon.wiki.gg/) + [Q&A gamedeveloper](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-) ·
[Dead Cells wiki](https://deadcells.wiki.gg/wiki/Mechanics) ·
[KeqingMains combat frames](https://library.keqingmains.com/combat-mechanics/frames) ·
[Diablo III Leap](https://eu.diablo3.blizzard.com/en-us/class/barbarian/active/leap) ·
[HoloCure wiki](https://holocure.wiki.gg/) + [Rice Digital](https://ricedigital.co.uk/holocure-save-the-fans-review/) ·
[VS dev interview](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream) ·
[Hades boon colors](https://www.inverse.com/gaming/hades-symbol-meaning-guide-hera-dionysus-apollo-ares-aphrodite) ·
[azhdarchid — MH combat landscape](https://azhdarchid.com/monster-hunter-combat-landscape/)

**Điều khiển một ngón** — [White Cat Project](https://en.wikipedia.org/wiki/White_Cat_Project) ·
[mygamedesign — one-thumb](https://www.mygamedesign.com/how-do-you-design-mobile-games-for-one-thumb-play/) ·
[mobilefreetoplay — touch control](https://mobilefreetoplay.com/control-mechanics/) ·
[Kotaku — Nintendo vs Colopl](https://kotaku.com/nintendo-s-lawsuit-forces-japanese-dev-to-cough-up-30-1847420631)

**Công cụ** — [Kenney Particle Pack (CC0)](https://kenney.nl/assets/particle-pack) ·
[OpenGameArt](https://opengameart.org/) ·
[Pixel FX Designer](https://codemanu.itch.io/particle-fx-designer) ·
[Pixel Composer](https://pixel-composer.com/) ·
[JuiceFX](https://codemanu.itch.io/juice-fx) ·
[Effect Texture Maker (CC0, chạy web)](https://mebiusbox.github.io/en/docs/lab/effect_texture_maker) ·
[Effekseer](https://effekseer.github.io/en/) ·
[pixi particle-emitter (định dạng JSON)](https://github.com/pixijs-userland/particle-emitter)
