# DANH MỤC ASSET — dragonproj

Nguồn: **`D:\HoloCureAssets\GameSprites\`** (sprite rip từ HoloCure).
Manifest gốc: `sprites.csv` — `name,width,height,origin_x,origin_y,frames,type`.

Bảng ánh xạ máy đọc: **`assets/asset-map.json`**.

## Quy ước đọc file

Mỗi mục trong `asset-map.json` có dạng:

```json
{ "spr": "spr_Noel_idle", "frames": 4, "w": 64, "h": 64, "ox": 32, "oy": 62 }
```

* `spr` = **tên thư mục** trong `GameSprites/`, phân biệt hoa thường.
* File frame: `GameSprites/<spr>/<spr>_<i>.png`, `i` chạy `0 .. frames-1`.
* `w`,`h` = kích thước canvas của MỌI frame (đã đồng nhất, không cần đo lại).
* `ox`,`oy` = **điểm neo** lấy nguyên từ `sprites.csv`. Vẽ bằng
  `ctx.drawImage(img, x - ox, y - oy)` với `(x,y)` là toạ độ thực thể trong game.
  Phần lớn sprite quái/nhân vật có `oy ≈ h-2`, tức neo ở **dưới chân** — đúng thứ
  ta cần cho game nhìn từ trên xuống chếch (bóng đổ và thứ tự vẽ theo `y`).
  Ngược lại các VFX nổ/vòng thì neo ở **tâm** (`ox ≈ w/2`, `oy ≈ h/2`).
  Có một trường hợp `ox` **âm** — xem `fx.slash_thrust` bên dưới.
* Lật trái/phải bằng `ctx.scale(-1,1)`; **không** có sprite 4–8 hướng, và cũng
  không cần, đúng như yêu cầu.
* `file` = tên file thật trong `assets/spr/`, do `_tools/pack.py` ghi vào.
  Chỉ khác `spr + ".png"` khi mục đó có cắt/đổi màu (xem dưới).

### Khoá tuỳ chọn — chỉ `_tools/pack.py` đọc, game không đọc

| Khoá | Nghĩa |
|---|---|
| `crop: [x,y,w,h]` | cắt một mảnh khỏi ảnh gốc trước khi đóng gói |
| `resize: [w,h]` | co giãn (NEAREST, giữ nét pixel) |
| `ramp: ["#tối","#sáng"]` | đổi bảng màu theo độ sáng — vân giữ nguyên |
| `seamless: true` | vá cho ô lát nối liền mạch bốn phía |
| `anchor` | `"foot"` (đáy-giữa) · `"center"` · `"tl"` (góc trên-trái, cho ô lát) · `"csv"` (tin nguyên origin trong sprites.csv) |
| `scale` | hệ số phóng lúc VẼ (game đọc khoá này), cho mấy viên đá bé xíu |

Một sprite gốc có thể đẻ ra nhiều mục khác nhau nhờ `crop`/`ramp`; tên file đích
tự kèm chữ ký của biến thể nên chúng không ghi đè lên nhau. Chạy lại `pack.py`
cũng tự **dọn file mồ côi** trong `spr/`.

---

## 1. Nhân vật người chơi

| Mục | Sprite | Kích thước | Frame |
|---|---|---|---|
| `player.idle` | `spr_Noel_idle` | 64×64, neo (32,62) | 4 |
| `player.run`  | `spr_Noel_run`  | 64×64, neo (32,62) | 6 |
| `player.dodge`| **null** | — | — |

**Vì sao Noel.** Cả kho chỉ có đúng một dòng nhân vật người chơi: các bộ
`spr_<Tên>_idle` / `spr_<Tên>_run` 64×64, 4 frame đứng + 6 frame chạy, chibi
nhìn chếch từ trên xuống — đúng loại 3/4 top-down mà game cần. Trong khoảng 50
bộ đó, Noel là bộ **cầm sẵn kiếm**, bảng màu trắng-xám-vàng nhạt nên silhouette
gọn và mọi VFX màu (lửa cam, sét vàng, ám tím) chồng lên vẫn đọc được. Đây cũng
là nhân vật hợp vai "Kiếm & Khiên" — cây vũ khí mặc định trong `gamedata.js`.

**Lưu ý phải nói thẳng:** đây là chibi anime nữ, có mặt vẽ rõ. Yêu cầu nói tránh
"mặt người rõ nét", nhưng kho này **không có** một humanoid nào khác — toàn bộ
sprite người chơi đều cùng một phong cách. Ở 64×64 và ở kích thước nội dung thật
(cao khoảng 31px, đo bbox) thì khuôn mặt chỉ còn vài pixel, chấp nhận được.
Nếu muốn đổi: `spr_Ayame_idle`/`spr_Ayame_run` (samurai cầm katana, ăn khớp với
`spr_AyameSlash`) hoặc `spr_Zeta_idle`/`spr_Zeta_run` (tông xám lạnh) là hai lựa
chọn thay trực tiếp, cùng đúng kích thước và số frame.

**Không tìm được đòn né/lăn — và không cần.** Kho không có bất kỳ `*_dodge` /
`*_roll` / `*_dash` nào cho nhân vật người chơi (chỉ có `spr_Moontato_dash` là
của một con quái). Cách xử lý: mượn `player.run` rồi **quay nguyên người đúng
MỘT vòng** trong quãng lăn, kèm ép-ngang-giãn-dọc và nhấc nhẹ khỏi mặt đất ở
giữa vòng. Đây là cách hầu hết game 2D nhìn từ trên xuống vẫn làm, mắt đọc ra
ngay là đang lăn, và tốn **0 asset mới**. Vũ khí nằm trong cùng phép quay nên
nó lăn theo người chứ không đứng lơ lửng. Code ở `drawPlayer` trong `js/game.js`;
nếu sau này có sprite lăn thật thì chỉ cần điền `player.dodge` vào manifest —
`drawPlayer` tự lấy, phép quay vẫn chồng lên trên được hoặc bỏ đi tuỳ ý.

---

## 2. Sáu tộc quái

| Tộc | Yêu cầu | Sprite | Kích thước | Frame |
|---|---|---|---|---|
| `purun`  | bầy đàn, nhỏ, tròn mềm | `spr_takodachi` | 64×64, neo (33,61) | 3 |
| `vacca`  | húc thẳng, nặng, có sừng | `spr_Poyoyo` | 64×64, neo (32,62) | 3 |
| `geguri` | nhảy vòng cung, kiểu ếch | `spr_Upao` | 64×64, neo (32,62) | 4 |
| `bat`    | bay lượn rồi bổ nhào | `spr_MelBat` | 52×29, neo (27,19) | 3 |
| `galena` | đứng xa bắn đạn | `spr_Merakyat` | 64×64, neo (32,62) | 3 |
| `fungo`  | tank, chậm, lì đòn | `spr_SaplingKing` | 64×64, neo (33,62) | 3 |

**Lý do từng con** (đã mở ảnh ra xem, không đoán theo tên):

* **purun** — `spr_takodachi` là khối tròn tím nhỏ (bbox thật chỉ 18×21px trong
  canvas 64), mềm, không tay không chân. Đúng nghĩa "slime/jelly" và nhỏ nhất
  trong đám, hợp làm quái bầy đàn 16 con cùng lúc.
* **vacca** — `spr_Poyoyo` là con thú trắng bè, **có sừng** và có dây thừng vắt
  ngang mõm, dáng bốn chân nặng nề. Đây là thứ giống bò/trâu nhất trong kho.
  (Con thứ hai từng cân nhắc là `spr_Nemu` — dê xanh có gạc — nhưng dáng mảnh,
  hợp quái nhanh hơn là charger.)
* **geguri** — kho **không có ếch**. `spr_Upao` là kỳ giông (axolotl) xanh, thân
  bè sát đất, bốn chân — cùng nhóm lưỡng cư, và dáng bè này nhìn nhảy vòng cung
  rất hợp. Đây là thứ thay thế gần nhất, không phải chọn bừa.
* **bat** — `spr_MelBat` là con dơi thật, hai cánh dang rộng 52×29. Neo ở
  **giữa thân** (27,19) chứ không phải chân, đúng thứ ta muốn cho quái bay:
  cứ vẽ tại toạ độ cộng độ cao, không phải bù trừ.
* **galena** — `spr_Merakyat` là chim xanh có đuôi công, đứng bằng hai chân.
  Dáng đứng (không phải bay) khớp với AI `ranged` giữ khoảng cách rồi nhả 3 viên.
* **fungo** — kho **không có nấm**. `spr_SaplingKing` là khối thực vật xanh có
  tán lá to trùm đầu — về silhouette thì đúng cái "mũ nấm" mà `fungo_cap` và
  `dofungos_sporecap` cần, và nặng nề đủ để đọc ra tank. Bản nhẹ hơn nếu muốn
  quái thường bớt nổi: `spr_SaplingA` / `spr_SaplingB` / `spr_SaplingC`
  (cùng 64×64, 3 frame, cùng neo).

**Một hạn chế chung phải biết trước:** các sprite quái này chỉ có MỘT chuỗi
animation (3–4 frame lặp), không tách idle/move. `asset-map.json` vì thế điền
cùng một sprite cho cả `idle` và `move`. Cách bù trong code: khi đứng yên thì
chạy khoảng 6 fps, khi di chuyển thì khoảng 12 fps kèm nhún nhẹ theo `sin` —
mắt đọc ra khác nhau ngay mà không tốn thêm asset.

---

## 3. Boss

Chọn 5 con, hình dáng khác hẳn nhau (khối tròn / thú lông / vượn / người cơ bắp
/ mecha), id khớp đúng `G.BEHEMOTHS` trong `gamedata.js`:

| id boss | `body` trong gamedata | Sprite | Kích thước | Frame |
|---|---|---|---|---|
| `grouton` | blob | `spr_Cilus` | 128×128, neo (63,122) | 4 |
| `mumu` | fluff | `spr_fubuzilla` | 82×57, neo (54,56) | 12 |
| `dodonki` | ape | `spr_Goriela_idle` (+ `spr_Goriela_throw`, 3f) | 128×128, neo (64,123) | 4 |
| `boldon` | golem | `spr_Shubangelion_walk` (+ `spr_Shubangelion_attack_punch`, 8f) | 128×136, neo (63,126) | 8 |
| `sentry` | golem | `spr_Pekodam` | 150×150, neo (76,146) | 4 |

* `grouton` là "blob" hệ Hoả — `spr_Cilus` là khối tròn trắng có vành đai quanh
  thân, to gấp đôi quái thường, đọc ngay ra "nhân + vỏ" (đúng `parts` trong
  gamedata: `['Nhân','Vỏ']`, điểm yếu là `Nhân`).
* `mumu` là "fluff" — `spr_fubuzilla` là con cáo lông trắng khổng lồ, **12
  frame**, mượt nhất trong đám boss. Đúng nghĩa fluff.
* `dodonki` là "ape" — `spr_Goriela` là con vượn, có sẵn cả `_idle`, `_throw`
  và `_special`, đủ để làm bài `slam` và `charge`.
* `boldon` là "golem" — `spr_Shubangelion_walk` là thân người cơ bắp trắng cao
  136px, có `_attack_punch` 8 frame cho bài `slam`.
* `sentry` là "Sentry Guardian", golem hệ Lôi có bài `beam` — `spr_Pekodam` là
  mecha có súng, kèm `spr_Pekodam_gun` (25×59, 5f) và `spr_PekodamMissile`
  (23×90, 2f) nếu cần đạn.

**Chưa có, và không ép:** không tìm được boss dạng **rồng/drake**, **rắn**,
**rùa**, **samurai** hay **thực vật khổng lồ**. Nghĩa là `landaronba`, `kolun`,
`archelon`, `musashi`, `carniva`, `azdaja`... chưa có mặt. Ứng viên gần nhất mà
tôi **cố ý không chọn** vì lộ mặt người quá rõ: `spr_Lunazilla` (150×150, 10f —
người mặc đồ khủng long), `spr_Risusaurus` (128×128, 6f), `spr_Gurasaur`
(128×128, 6f), `spr_EldrichHaachama_walk` (158×128, 8f — quái nhiều chân, có
đầu người). Nếu chấp nhận đánh đổi thì đây là bốn con dùng được ngay, mỗi con
một dáng khác nhau, và sẽ nâng số boss lên 9.

---

## 4. VFX (phần quan trọng nhất)

### 4.1 Vệt chém

| Mục | Sprite | Kích thước | Frame | Vì sao |
|---|---|---|---|---|
| `fx.slash_wide` | `spr_CalliSlash1` | 200×200, neo (79,98) | 10 | Cung trắng **rất rộng**, gần trọn nửa vòng. Đây là thứ duy nhất đủ độ mở cho `arc: 2.3–2.7` của Đại Kiếm và cú `Quét vòng` 360° của Thương. |
| `fx.slash_narrow` | `spr_AyameSlash` | 150×143, neo (14,75) | 9 | Lưỡi liềm trắng **mảnh**, sạch, 9 frame. Dùng cho Kiếm (`arc 1.75`) và Song Kiếm (`arc 1.35`). |
| `fx.slash_thrust` | `spr_KroniiStab` | 102×23, neo (**-22**,11) | 15 | Mũi nhọn **nằm ngang**, dài 102px, thon dần — đúng hình một cú đâm. 15 frame, mượt nhất nhóm. Dùng cho `Đâm tới`, `Xuyên Thiên`, `Lao Đâm`. **`ox` âm là cố ý**: điểm neo nằm ngoài canvas 22px về bên trái, tức là người đâm đứng lùi lại sau mũi giáo — cứ vẽ ở toạ độ người chơi là mũi tự phóng ra đúng chỗ. |

Ứng viên dự bị nếu muốn đổi tay: `spr_CalliSlash2` (200×200, 10f — cung rộng có
hoa hồng đỏ, hợp đòn tới hạn), `spr_MarineSlash1` (100×100, 4f — cung nhỏ
trắng-đỏ, nhẹ hơn), `spr_OwlDaggerSlash` (96×96, 4f — cung vàng nâu nhỏ),
`spr_GuraTridentThrust` (200×200, 11f — đâm ba mũi).

### 4.2 VFX chung

| Mục | Sprite | Kích thước | Frame | Ghi chú |
|---|---|---|---|---|
| `fx.explosion` | `spr_bombExplode` | 128×128, neo (65,118) | 15 | Cụm khói-lửa nở ra rồi tan. **Neo ở đáy** (`oy=118`) — vẽ tại điểm chạm đất, không phải tâm. |
| `fx.impact` | `spr_ZetaStealthHit` | 64×64, neo (32,32) | 4 | Ngôi sao tia xanh trắng bung ra trong 4 frame — ngắn đúng bằng một nhịp hitstop 50–85ms. Neo tâm. |
| `fx.smoke` | `vfx_smoke` | 76×44, neo (72,42) | 6 | Cuộn khói xám. **Neo lệch hẳn sang phải** (72/76) vì gốc nó là khói phụt ra từ một phía — nhớ lật theo hướng. |
| `fx.dust` | `spr_smokeeffect1` | 167×44, neo (84,40) | 6 | Hai cụm bụi bắn sang hai bên, neo giữa-đáy. Dùng cho tiếp đất, dash, né. |
| `fx.vortex` | `spr_whirlpool` | 105×108, neo (53,67) | 4 | Xoáy nước xanh. Dùng cho `maelstrom` (Nghiền — hút quái vào tâm). |
| `fx.shockwave` | `spr_Explosion` | 128×128, neo (64,64) | 9 | Tên là "Explosion" nhưng **thực tế là một VÒNG trắng nở ra** — đúng sóng xung kích. Dùng cho `quake`, `ring`, `Đập đất`. |
| `fx.chain` | `spr_ShionBeam` | 26×197, neo (13,188) | 8 | Cột tia mảnh cao 197px, neo sát đáy. Xoay theo góc + kéo giãn giữa hai mục tiêu là ra tia sét nảy (`chainN:2, chainR:120`). |
| `fx.spike` | `spr_FaunaGuardianTree` | 42×68, neo (11,68) | 14 | Vật **mọc trồi lên từ mặt đất** qua 14 frame, neo đúng chân. Dùng cho gai đá hệ Thổ và cho phiên bản lớn của `earth.burst`. |
| `fx.wall` | `spr_KroniiTimeBubbleStart` | 128×128, neo (64,116) | 7 | Vòm chắn xanh nở ra trong 7 frame, neo sát đáy. Dùng cho kỹ năng `bulwark` (Thành Trì) và cho khiên đỡ của Kiếm. |
| `fx.vanish` | `spr_ShionPortal` | 42×23, neo (21,11) | 4 | Cổng bầu dục tím dẹt — nhìn đúng như một vũng cổng nằm trên mặt đất. Dùng cho `shadowstep` (Ảnh Độn) lúc biến mất và lúc hiện ra. |
| `fx.arrow` | `spr_Arrow` | 64×64, neo (23,32) | 3 | Đầu mũi tên (bbox thật chỉ 7×12px). Dùng cho Cung và cho `arrowrain` (Vũ Tiễn, 14 mũi). |
| `fx.shadow` | `spr_Shadow` | 128×128, neo (65,125) | 1 | *Thêm ngoài yêu cầu.* Bóng ellipse dưới chân — thứ bắt buộc phải có khi quái bị `launch` bay lên: bóng co lại thì mắt mới đọc ra độ cao. Bản nhỏ hơn: `spr_bigShadow` (84×5). |
| `fx.ghost` | **null** | — | — | Xem mục "Không tìm được" bên dưới. |

### 4.3 Sáu hệ nguyên tố

Khớp với `G.ELEM_FX` trong `gamedata.js` (mỗi hệ một `trail` chạy dọc đường đi
và một `burst` bung ra ở điểm chạm).

| Hệ | `trail` | `burst` | Vì sao |
|---|---|---|---|
| **Lôi** (thunder) | `spr_LightningWeiner` 62×18, 6f | `spr_spawnFX` 67×114, 5f | Trail: vệt trắng nằm ngang có tia điện xanh chạy dọc — kéo dài theo đường lướt là ra vệt sét. Burst: **cột sét dọc 114px kèm tia bắn ra hai bên**, đúng hình một cú sét giáng xuống. |
| **Hoả** (fire) | `spr_KiaraEmbers` 38×38, 4f | `spr_KiaraExplosion` 118×188, 14f | Trail: đốm lửa nhỏ 38px, rải dọc đường là thành vệt cháy (`burnMs:3000`). Burst: cột lửa cao 188px, 14 frame — số frame cao nhất nhóm burst, nhìn "đã" nhất. |
| **Thuỷ** (water) | `spr_watersplash` 50×50, 6f | `spr_WamyWaterSplash` 128×128, 7f | Trail: mảnh băng/nước văng ra, nhìn giống vụn băng hơn là nước — hợp `frost` + `slickMs:2600`. Burst: chùm gai nước xanh bung tứ phía. |
| **Thổ** (earth) | `spr_ShubangelionRocks_Small` 64×64, 5f | `spr_ShubangelionRocks_Big` 64×64, 4f | Đá vụn rơi (nhỏ) và tảng đá vỡ (lớn), cùng một bộ nên tông màu khớp nhau. **Đây là mục yếu nhất của bảng** — xem ghi chú ở mục 6. |
| **Quang** (light) | `spr_portraitspark` 50×50, 3f | `spr_IrysExplosionA` 93×91, 7f | Trail: ngôi sao bốn cánh trắng. Burst: chùm tia vàng-trắng nở đều mọi hướng, 7 frame — đúng "loé sáng". |
| **Ám** (dark) | `spr_EldritchSmoke` 64×64, 3f | `spr_EldrichHorrorPool` 105×108, 4f | Trail: cuộn khói đen. Burst: **vũng xoáy tím đen** — khớp đúng `burst:'pool'` + `poolMs:2400` mà gamedata mô tả cho hệ Ám. |

Ứng viên dự bị cho hệ:
`spr_OllieKaton` (128×128, **29 frame** — quả cầu lửa rất đẹp nhưng vượt trần 20 frame),
`spr_LavaPoolStart`/`Loop`/`End` (127×127, 9/14/6f — vũng dung nham cho DoT hệ Hoả),
`spr_MiCometSplash` (128×128, 11f — tia cam bắn ra, dùng thay `impact` cũng được),
`spr_Irysblast_light` / `spr_Irysblast_dark` (64×64, chỉ 2f — quá ngắn),
`spr_PoisonPool_Start`/`Loop`/`End` (128×128, 5/6/4f — vũng độc xanh cho `poisoner` của Fungo),
`spr_IdolPower` (30×29, 8f — sao xanh lấp lánh, thay `light.trail` nếu muốn nhiều frame hơn).

---

## 5. Vật phẩm rơi

| Mục | Sprite | Kích thước | Frame | Vì sao |
|---|---|---|---|---|
| `pickups.gold` | `spr_holoCoin` | 15×15, neo (7,7) | 8 | Đồng xu vàng **xoay tròn 8 frame**, canvas 15px khít sát nội dung — không phí một pixel nào. Asset gọn nhất cả bảng. |
| `pickups.exp` | `spr_EXP` | 128×128, neo (64,111) | 12 | Viên exp xanh, 12 frame nhấp nháy. Có 7 biến thể `spr_EXP` → `spr_EXP6` và `spr_EXP_rainbow` (cùng kích thước, cùng 12 frame) — **dùng để phân bậc exp theo hạng nguyên liệu D/C/B/A/S/SS**, khỏi phải tự tô màu. |
| `pickups.chest` | `BG_ItemCrate` | 29×36, neo (14,34) | 1 | Thùng gỗ có exp lòi ra, 1 frame tĩnh. Kèm `BG_ItemCratePieces` (22×15, **5 frame**) cho lúc đập vỡ. Không chọn `spr_holozonBox` vì trên hộp có **chữ "HOLOZON"**. |

**Cảnh báo về `spr_EXP`:** canvas 128×128 nhưng nội dung thật chỉ 12×13px (đã đo
bbox). 12 frame × 128×128 là 768 KB RAM texture cho một viên ngọc bé xíu. Nếu
chạy nhiều viên cùng lúc thì nên **crop lại** khi build: cắt về khoảng 16×16 là
tiết kiệm được 98% bộ nhớ. Tương tự `spr_Arrow` (canvas 64×64, nội dung 7×12) và
`spr_FaunaGuardianTree` (canvas 42×68 nhưng frame 0 chỉ 6×7 vì nó đang mọc lên).

---

## 6. Những mục để `null` và những chỗ còn phân vân

### Để `null`

1. **`player.dodge`** — kho không có animation né/lăn cho nhân vật người chơi.
   Thay thế: tái dùng `player.run` + hạ alpha + `fx.dust`.
2. **`fx.ghost`** (ảo ảnh mờ / afterimage) — tìm hết
   `ghost|shadow|clone|decoy|afterimage|fade|invis|stealth` chỉ ra `spr_Shadow`
   (bóng đổ, đã dùng cho việc khác), `spr_ZetaInvisible` (25×25 — icon UI, loại)
   và `spr_ZetaStealthHit` (đã dùng làm `impact`). Không có sprite ảo ảnh thật.
   **Thay thế đúng cách:** afterimage vốn không phải asset mà là kỹ thuật — cứ
   vẽ lại chính `player.run` frame cũ ở vị trí cũ với `globalAlpha` giảm dần
   0.5 → 0 và `globalCompositeOperation = 'lighter'`. Kỹ năng `afterimage`
   (Tàn Ảnh) và `shadowstep` (`ghosts: 5`) trong gamedata dùng đúng cách này là
   chuẩn nhất, vì hình nhân ảo phải giống hệt người chơi mới có nghĩa.

### Phân vân, đã cân nhắc rồi mới quyết

* **Nhân vật người chơi có mặt vẽ rõ.** Vi phạm nhẹ quy tắc "không mặt người rõ
  nét", nhưng kho không có humanoid nào khác. Đã chọn bộ có tông màu nhạt nhất
  và ít chi tiết nhất (Noel).
* **Boss `dodonki` và `boldon`.** `spr_Goriela` là *người mặc đồ vượn* — nhìn kỹ
  vẫn thấy khuôn mặt trong mũ trùm. `spr_Shubangelion` thì phần thân là khối cơ
  bắp trắng, phần đầu nhỏ. Cả hai vẫn đọc ra được là quái ở kích thước hiển thị
  thật, nhưng soi kỹ thì sẽ thấy. Đã loại hẳn nhóm `Lunazilla` / `Risusaurus` /
  `Gurasaur` vì mặt chiếm tỉ trọng lớn hơn hẳn.
* **`geguri` không phải ếch, `fungo` không phải nấm.** Kho **không có** một
  sprite ếch hay nấm nào (đã grep `frog|toad` và `mush|shroom|fungi|spore` → 0
  kết quả). Kỳ giông xanh và cây con có tán là hai thứ gần nhất về silhouette và
  về vai trò. Nếu không chấp nhận thì hai mục này phải để `null`, nhưng như vậy
  mất luôn 2/6 tộc quái — tôi cho rằng thay thế gần đúng có ích hơn.
* **Hệ Thổ là mắt xích yếu nhất.** `spr_ShubangelionRocks_Big/Small` chỉ là đá
  rơi, không phải "nứt đất" hay "gai đá trồi lên" mà `G.ELEM_FX.earth`
  (`trail:'crack'`, `burst:'spike'`) mô tả. Đã bù bằng `fx.spike`
  (`spr_FaunaGuardianTree` — thứ duy nhất trong kho thật sự *mọc lên từ đất*, 14
  frame). Còn vết nứt trên nền thì **nên vẽ bằng code** (vài đường `lineTo` màu
  tối, alpha giảm dần) — rẻ hơn và khớp màu nền hơn bất cứ sprite nào ở đây.
* **`fx.chain` dùng một cột tia dọc.** `spr_ShionBeam` không phải tia sét nảy
  sẵn; phải xoay theo góc giữa hai mục tiêu và scale theo khoảng cách. Frame 0
  của nó **rỗng hoàn toàn** (bbox trả về `None`) — code phải bắt đầu từ frame 1,
  hoặc chấp nhận một frame trống ở đầu.
* **`fx.wall` là vòm bong bóng, không phải bức tường phẳng.** `bulwark` trong
  gamedata mô tả một tường cung (`wallArc: 2.2`, `wallW: 8`). Vòm bong bóng xanh
  gần đúng nhưng không khớp 100%. Ứng viên khác đều tệ hơn: `spr_HaatonWall`
  (64×64, 3f) hoá ra là **một con quái đang giơ khiên** chứ không phải bức
  tường; `spr_supportShield` (64×64) chỉ 1 frame; `spr_FlareWall` là ảnh nền
  phòng, loại thẳng.
* **Quái chỉ có một chuỗi animation.** Không tách được idle/move — đã nói ở mục 2.

---

## 7. Bảng tổng dung lượng

Đã đo thật (không ước lượng): 45 sprite, tổng **264 KB** file PNG trên đĩa.

| Nhóm | Số sprite | Tổng frame | PNG trên đĩa | RAM texture (RGBA thô) |
|---|---:|---:|---:|---:|
| Nhân vật | 2 | 10 | 10,4 KB | 160 KB |
| Quái thường (6 tộc) | 6 | 19 | 12,0 KB | 274 KB |
| Boss (5 con + 2 đòn đánh) | 7 | 43 | 75,4 KB | 2 362 KB |
| VFX chung + vệt chém | 16 | 111 | 92,9 KB | 5 373 KB |
| Nguyên tố (6 hệ × 2) | 12 | 78 | 79,9 KB | 2 548 KB |
| Vật phẩm rơi | 3 | 21 | 5,3 KB | 779 KB |
| **TỔNG** | **45** | **282** | **≈ 264 KB** | **≈ 11,2 MB** |

**Đọc bảng này thế nào.** Cột PNG là thứ người chơi phải tải về: 264 KB, tức là
nhẹ hơn một tấm ảnh chụp màn hình. Không có gì phải lo về thời gian tải.

Cột RAM là thứ đáng nhìn: khoảng 11,2 MB sau khi decode ra `ImageBitmap`. Con số
này vẫn thoải mái với Canvas 2D trên máy tính, nhưng nó **dồn vào vài chỗ**, và
mấy chỗ nặng nhất đều nặng vì canvas thừa chứ không phải vì nội dung:

| Sprite | RAM | Nội dung thật (bbox frame 0) | Phí |
|---|---:|---|---|
| `spr_CalliSlash1` | 1 563 KB | 173×91 trong canvas 200×200 | ~60% |
| `spr_KiaraExplosion` | 1 213 KB | 49×45 trong canvas 118×188 | ~90% |
| `spr_bombExplode` | 960 KB | 25×11 ở frame 0 (nở dần về sau) | — |
| `spr_EXP` | 768 KB | **12×13** trong canvas 128×128 | **~99%** |
| `spr_AyameSlash` | 754 KB | 46×84 trong canvas 150×143 | ~82% |

**Khuyến nghị nếu thấy nặng:** viết một bước build cắt viền trong suốt
(auto-trim) rồi ghi lại `ox,oy` bù theo phần đã cắt. Riêng bốn sprite trên đã
tiết kiệm được khoảng **4 MB trên tổng 11,2 MB**, tức hơn một phần ba, mà không
mất một pixel hình nào. Nếu không muốn thêm bước build thì cứ để nguyên — 11 MB
không phải vấn đề trên trình duyệt hiện đại, chỉ cần **đừng decode lại mỗi
frame**: nạp một lần vào `ImageBitmap` lúc khởi động và giữ trong một `Map` theo
tên sprite.


---

## 8. Nền và vật trang trí

Cả kho HoloCure chỉ có hai tấm texture nền dùng được cho game nhìn từ trên
xuống: `BG_newgrass` (1280×1280, thảm cỏ) và `bg_dungeonfloor1` (128×128, sàn đá
hầm). Ba biome còn lại **mượn vân của thảm cỏ rồi đổi bảng màu** bằng `ramp`:
từng ngọn cỏ, từng mảng đất trọc vẫn nguyên vị trí, chỉ hai đầu tối/sáng là
khác. Rẻ hơn nhiều so với đi tìm cho đủ năm tấm rời, và năm biome ăn khớp nhau
về mật độ vân.

| Biome | Gốc | Đổi màu | Ô lát |
|---|---|---|---|
| `ground.grass`  | `BG_newgrass` | — | 256×256 |
| `ground.jungle` | `BG_newgrass` | `#0e2e17 → #3d7d45` | 256×256 |
| `ground.desert` | `BG_newgrass` | `#6f5330 → #d3b47e` | 256×256 |
| `ground.snow`   | `BG_newgrass` | `#74899d → #eaf3fb` | 256×256 |
| `ground.ruins`  | `bg_dungeonfloor1` | — | 128×128 |

**Vì sao phải vá `seamless`.** Sân đấu là 820×1080, ô lát 256 thì chỉ lặp 4×5
lần — mắt bắt được cái lưới ngay lập tức. Lật ô cho khác đi *không* cứu được:
lật xong thì mép nối thành ảnh soi gương, còn lộ hơn. Nên `pack.py` vá ô lát
bằng thủ thuật cũ của dân làm texture: dời ảnh nửa vòng cho bốn mép ngoài thành
ruột của ảnh cũ, rồi đắp ảnh gốc lên vết nối hình chữ thập ở giữa với mặt nạ
vuốt mờ. Với vân dày và vụn như cỏ thì chỗ vuốt mờ không ai thấy. Đo lại sau khi
vá: chênh lệch hai mép đối diện đã tụt xuống ngang chênh lệch của hai cột bất
kỳ trong ảnh — tức là không còn đường nối.

**Vật trang trí.** `doodads.<biome>.<tên>`, mỗi biome một bộ riêng. Ở đây
**không** dùng `ramp`: bụi cỏ nhuộm màu cát trông ra bụi cỏ nhuộm màu cát, chứ
không ra cây xương rồng.

| Biome | Món |
|---|---|
| `grass` | 4 bụi cỏ ngắn, 2 khóm hoa, 2 bụi, 1 cỏ cao |
| `jungle` | cỏ ngắn, 2 bụi to, 3 khóm cỏ cao |
| `desert` | 3 viên đá, xương rồng, cây trụi lá |
| `snow` | 3 viên đá, hàng rào, cây trụi lá |
| `ruins` | 2 viên đá, 2 cột (nguyên + gãy), 3 mảng tường đá |

**Thứ tự trong manifest có nghĩa: nhỏ trước, to sau.** `drawDecor` chọn món bằng
`p*p` (p là số ngẫu nhiên 0..1), tức thiên hẳn về đầu danh sách — nên sân đầy cỏ
vụn với dăm ba cái cây, chứ không phải rừng cây chắn hết tầm nhìn. Muốn nhiều
cây hơn thì **đổi thứ tự trong `asset-map.json`**, không phải sửa code.

`BG_floorstoneA/B/C` sau khi cắt viền trong suốt chỉ còn 7×5 tới 11×9 pixel —
gần như vô hình — nên chúng mang thêm `scale` 2.6–3.0.


---

## 9. Biểu tượng vũ khí

Nguồn: **`https://sephiria.page/icons/weapons/`** — wiki cộng đồng của Sephiria.
Ảnh gốc để trong repo tại `_assets_src/weapons/` (35 file, ~90 KB) chứ không tải
về lúc build: máy nào không có mạng vẫn chạy được `pack.py`.

Tra theo **LỚP × HỆ**, khoá `weapons.<lớp>.<hệ>` — 5 × 7 = 35 ô, không ô nào để
trống. Trước đây vũ khí trên tay là hình học tô màu theo hệ; giờ mỗi hệ có ảnh
riêng, nên nhìn thanh kiếm là biết đang cầm hệ gì mà không cần đọc chữ.

| Lớp | Vô | Lôi | Hoả | Thuỷ | Thổ | Quang | Ám |
|---|---|---|---|---|---|---|---|
| **Kiếm & Khiên** | `katana_Tier1` | `katana_Lightning_DarkCloud` | `katana_Fire_FlameSword` | `katana_Ice_Eco` | `katana_Basic_Speed` | `katana_Basic_Tier2` | `katana_Magic_MagicBlade` |
| **Đại Kiếm** | `Icon_GreatSword_Tier1` | `GreatSword_Fire_Minor` | `Icon_GreatSword_Red` | `Icon_GreatSword_Ice` | `Icon_GreatClub` | `Icon_GreatSword_Tier3_A` | `GreatSword_Laser` |
| **Thương** | `Staff_Spear` | `Staff_Lightning` | `Staff_Fire` | `Staff_Ice` | `Icon_BlackHalberd` | `Staff_Extend_Tier3_Crit` | `Staff_Rolling_Tier3Bolt` |
| **Song Kiếm** | `Icon_Dagger_Tier1` | `Icon_Dagger_Lightning1` | `Icon_Dagger_FireBurn` | `Dagger_IceScythe` | `Icon_Dagger_Tier3_F` | `Dagger_EvadeT3_Fury` | `Icon_Dagger_Tier3_C` |
| **Cung** | `Crossbow_Tier2` | `Crossbow_Auto` | `Crossbow_Minigun` | `Crossbow_IceMinor` | `Crossbow_MineMinor` | `Crossbow_Pierce_Cooldown` | `Crossbow_Mine` |

**Tên file không phải lúc nào cũng khớp hệ, và đó là cố ý.** Người chơi đọc
MÀU chứ không đọc tên file: `GreatSword_Fire_Minor` là một lưỡi vàng chói nên nó
làm Đại Kiếm hệ Lôi, còn hệ Hoả lấy `Icon_GreatSword_Red`. Khoá trong manifest
mới là thứ game dùng; `spr` chỉ là chỗ lấy ảnh.

**Vì sao lớp "Kiếm & Khiên" lại mượn bộ katana.** Bộ `ShieldSword_*` của Sephiria
vẽ CẶP kiếm-khiên nằm cạnh nhau. Cầm trên tay thì vũ khí phải xoay theo hướng
ngắm, mà xoay một cặp hai vật thì nó thành một cục không đọc ra hình gì. Katana
là một lưỡi, một trục dài — xoay đẹp. Hình học cũ của lớp này vốn cũng chỉ vẽ
mỗi thanh kiếm, không có khiên, nên không mất gì.

**Vì sao nỏ đổi sang mấy bản sáng màu.** `Crossbow_Tier1`/`_Mine`/`_SGMinor`
toàn thân xám đen; đặt lên nền cỏ tối thì thành một vệt đen. Đổi sang
`Crossbow_Tier2`/`_Auto`/`_Minigun`… có mảng sáng nên tách được khỏi nền.
Cũng vì lý do đó mà loại hết mấy biểu tượng hình ngôi sao / quả cầu
(`Crossbow_PoisonJelly`, `Crossbow_Lightning`): không có trục dài thì xoay xong
không ra khẩu nỏ.

### Ba con số căn ảnh: `rot`, `len`, `grip`

Chúng nằm trong `asset-map.json` chứ không nằm trong code, vì chúng là thuộc
tính của TẤM ẢNH:

| | rot | len | grip | ghi chú |
|---|---:|---:|---:|---|
| Kiếm & Khiên | 90 | 28 | 0.88 | katana vẽ đứng, mũi lên |
| Đại Kiếm | 90 | 38 | 0.90 | |
| Thương | 90 | 48 | 0.82 | dài hơn thân người, đúng chất polearm |
| Song Kiếm | 90 | 22 | 0.88 | vẽ hai lần, mỗi tay một lưỡi |
| Cung | 0 | 28 | 0.45 | nỏ vẽ NẰM, mũi sẵn sang phải nên khỏi xoay |

* `rot` — xoay bao nhiêu độ để mũi chỉ về phía trước. Ảnh vẽ đứng → 90.
* `len` — chiều dài khi cầm, tính bằng pixel thế giới (nhân vật cao ~34).
* `grip` — chỗ bàn tay nắm, đo dọc trục dài, `0` = mũi, `1` = chuôi.

Thay một biểu tượng khác hướng thì sửa ba số này, **không sửa code**. Có test
khoá lại: đủ 35 ô, ô nào cũng nạp được ảnh và có `len`.

### Bản quyền

Đây là ảnh rip từ **Sephiria** (game thương mại trên Steam), lấy qua wiki cộng
đồng. Repo này công khai. Chúng nằm đây theo yêu cầu của chủ dự án, với dự định
vẽ đè lên sau — thay ảnh là sửa `_assets_src/weapons/` rồi chạy lại `pack.py`,
không phải sửa code.


---

## 10. Boss

Ảnh tra theo **DÁNG THÂN**, không theo từng con: 56 Behemoth chỉ có **21 dáng**
(`b.def.body`), nên một tấm ảnh phục vụ cả họ. Tên, thanh máu, bộ phận điểm yếu
và **quầng sáng theo hệ dưới chân** lo phần phân biệt — ảnh boss là art có sẵn,
nhuộm nguyên con theo hệ là phá nát bảng màu của nó.

| Dáng | | Đứng | Ra đòn |
|---|---|---|---|
| `blob` | khối tròn | `spr_Cilus` | — |
| `bull` | bò mộng | `spr_Risusaurus` | — |
| `frog` | ếch | `spr_Upao` | — |
| `shroom` | nấm | `spr_Moontato` | `spr_Moontato_dash` |
| `bird` | chim | `spr_Merakyat` | — |
| `ape` | vượn | `spr_Goriela_idle` | `spr_Goriela_special` |
| `fluff` | lông xù | `spr_fubuzilla` | — |
| `bat` | dơi | `spr_MelBat` | — |
| `drake` | rồng | `spr_CocoDragon` | — |
| `beast` | thú | `spr_Gurasaur` | — |
| `golem` | golem | `spr_Pekodam` | `spr_Pekodam` |
| `serpent` | rắn/biển | `spr_CaughtShark` | — |
| `samurai` | kiếm sĩ | `spr_Ayame_idle` | — |
| `turtle` | rùa | `spr_CaughtTurtle` | — |
| `lich` | tử linh | `spr_EldrichHaachama_walk` | `spr_EldrichHaachama_scream` |
| `plant` | thực vật | `spr_FaunaTree` | — |
| `knight` | hiệp sĩ | `spr_luknightB` | `spr_luknightA` |
| `anubis` | anubis | `spr_YagooHeadB` | — |
| `phoenix` | phượng | `spr_FubuBird` | — |
| `demon` | quỷ | `spr_Lunazilla` | — |
| `angel` | thiên thần | `spr_AngelFairy` | — |

Boss **không xoay theo hướng**, chỉ lật trái/phải như quái thường — ảnh vẽ nhìn
chếch từ trên xuống, xoay nó là nằm ngang. Lúc gục thì nghiêng 0.42 rad và bẹp
xuống, cùng ngôn ngữ với quái thường. Dáng nào thiếu ảnh thì rơi về hình học cũ
trong `drawBossBody` — có test khoá lại là không dáng nào thiếu.

Khớp cỡ: `sc = r * 2.45 / max(h, w * 0.66)`. Lấy cạnh dài hơn làm chuẩn, nếu
không con cá mập dài 123px sẽ tràn ra gấp đôi vùng ăn đòn của chính nó.

**Tắt làm mượt ảnh.** `Atlas.draw` đặt `imageSmoothingEnabled = false`. Đây là
pixel art: con thiên thần 28px thổi lên 110px mà để trình duyệt nội suy thì ra
một vũng màu nhoè; tắt đi thì nó lên thành khối pixel to và sắc, ăn khớp với
phần art còn lại.


---

## 11. Nhân vật (NPC)

Game đổi trục: gacha quay ra **NGƯỜI**, không quay ra đồ. Mỗi nhân vật là một bộ
`spr_<Tên>_idle` / `_run` trong kho HoloCure — đều 64×64, 4 khung đứng và 6 khung
chạy (riêng Calli 102×102). Khoá: `heroes.<id>.idle` / `.run`, tổng **43 người**.

Đây là chỗ mà cái kho HoloCure trả về nhiều nhất: hơn bốn mươi bộ nhân vật chơi
được, cùng cỡ, cùng số khung, cùng góc nhìn — đúng thứ một dàn gacha cần và là
thứ tự vẽ tay thì không đời nào làm nổi.

Bảng nhân vật nằm ở `data/heroes.js`, không nằm trong asset-map: mỗi người còn
mang lớp vũ khí, hệ và hạng, tức là **dữ liệu chơi** chứ không phải dữ liệu ảnh.
asset-map chỉ trỏ id → ảnh. Thêm một người = thêm một dòng ở `heroes.js` và một
mục ở asset-map, không đụng code.

Ảnh nhân vật trong trận tra theo `heroes.<id>.*`; thiếu thì rơi về `player.*`
như trước, nên đổi trục sang NPC không làm vỡ đường vẽ cũ.


## Biểu tượng vũ khí sau khi đổi sang sáu lớp bắn (2026-09-01)

Bảng `weapons.*` trong `asset-map.json` đổi khoá theo sáu lớp mới. Hai lớp giữ
được ĐÚNG art, bốn lớp là ART TẠM và cần thay:

| Lớp | Bộ sprite đang dùng | Đúng hay tạm |
|-----|---------------------|--------------|
| `bow` Cung | `Crossbow_*` | **đúng** |
| `staff` Gậy Phép | `Staff_*` | **đúng** |
| `sniper` Bắn Tỉa | `Crossbow_*` kéo dài 1,45× | tạm — đọc được là cây dài, nhưng vẫn là nỏ |
| `rifle` Súng Trường | `katana_*` | **TẠM — đang là thanh katana** |
| `shotgun` Súng Săn | `Dagger_*` | **TẠM — đang là con dao** |
| `launcher` Súng Phóng | `GreatSword_*` | **TẠM — đang là thanh đại kiếm** |

Kho Sephiria không có sprite súng nào, nên bốn dòng in đậm ở trên là chỗ PHẢI
thay trước khi đưa cho người chơi thật. Đường ống giữ nguyên luật cũ: **đổi art
= thay file PNG + sửa `assets/asset-map.json`, KHÔNG đụng code** — trong code
không có lấy một tên sprite nào, chỉ có khoá kiểu `weapons.rifle.fire`.

Ba số `rot` / `len` / `grip` căn ảnh vào bàn tay nằm trong manifest, không nằm
trong code, nên thay sprite dài ngắn khác nhau chỉ cần chỉnh ba số đó.
