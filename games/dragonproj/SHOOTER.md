# SĂN RỒNG — CHUYỂN SANG VŨ KHÍ SHOOTER

Tài liệu này ghi lại việc thay năm lớp vũ khí cận chiến bằng sáu lớp bắn, và
việc hạ thang sát thương. Mọi con số đều có nguồn, hoặc được ghi rõ là TÁI DỰNG.

Đọc kèm: `RESEARCH.md` (bản gốc Dragon Project) và `REMAKE.md` (bản dựng lại đầu).
Tài liệu này KHÔNG thay hai file đó — nó ghi cái đổi, và vì sao đổi.

---

## 0. Vì sao phải làm

Hai vấn đề, cả hai đều đo được chứ không phải cảm tính.

### 0.1 Quái chết trong chưa tới một phát

Chạy trên chính bảng số của game (`node test/dragonproj-ttk.js`), lấy hệ số đòn
NHẸ NHẤT trong chuỗi (mul 1.0 — đòn nặng còn nhân 2–3 lần nữa):

| Cấp | Công nhân vật | Vũ khí | 1 phát trúng | Máu quái thường | **Số phát để chết** |
|-----|--------------|--------|--------------|-----------------|---------------------|
| 1   | 36  | B  L1  | 77   | 46  | **0,60** |
| 10  | 74  | A  L10 | 171  | 172 | **1,01** |
| 25  | 137 | S  L25 | 580  | 382 | **0,66** |
| 40  | 200 | SS L40 | 1162 | 592 | **0,51** |
| 60  | 284 | SS L40 | 1246 | 872 | **0,70** |

Nguyên nhân gốc: sát thương cộng dồn từ BA nguồn đều lớn — công nhân vật
(`32 + 4,2/cấp`), công vật lý vũ khí (tới 306), công hệ (tới 656) — trong khi máu
quái chỉ là `32 + 14/cấp`. Hai đường cong lệch nhau, và chúng lệch ngay từ cấp 1.

### 0.2 Game tự nhận là "hành động một ngón" nhưng vũ khí thì toàn cận chiến

Năm lớp cũ: `sword` `great` `spear` `dual` `bow` — bốn cận chiến, một cung. Trên
màn dọc điện thoại, cận chiến buộc người chơi phải ĐỨNG VÀO tầm quái để ra đòn,
tức là phải giữ chính xác một khoảng cách bằng ngón cái, trên màn hình mà ngón
cái đang che mất 20% phía dưới.

---

## 1. Quyết định

**Thay hẳn 5 lớp cận chiến bằng 6 lớp bắn.** Không giữ lớp lai.

Lý do bỏ phương án lai (giữ 2 cận chiến + thêm 4 bắn): trong Soul Knight cận
chiến sống được nhờ HAI thứ mà Săn Rồng không có — **64% vũ khí cận chiến tốn 0
năng lượng** trong một game mà năng lượng KHÔNG tự hồi (nên cận chiến là sàn
"luôn dùng được"), và **nhát chém xoá đạn địch theo mặc định**
([Category:Melee Weapons](https://soul-knight.fandom.com/wiki/Category:Melee_Weapons),
[Reflexive Edge](https://soul-knight.fandom.com/wiki/Reflexive_Edge)).
Không có hệ năng lượng thì cận chiến chỉ còn là "cây vũ khí phải đứng gần hơn".

---

## 2. Thang sát thương mới

### 2.1 Phương pháp: ngân sách DPS, không phải chỉnh số mò

Cách làm chuẩn là chọn MỘT đường cong "DPS người chơi kỳ vọng ở mốc N" rồi suy ra
mọi con số khác từ đó, thay vì viết máu quái và sát thương vũ khí như hai bảng số
tự do ([Hitpoint Balancing with Many Variables — Edwin Fan, Game
Developer](https://www.gamedeveloper.com/design/hitpoint-balancing-with-many-variables);
[A Course About Game Balance — Ian Schreiber, GDC
2016](https://gdcvault.com/play/1023032)).

```
HP_quái(bậc, N) = TTK_mục_tiêu(bậc) × DPS(N) × A × U
```
- `A` = hệ số trúng. Game này tự ngắm khi đứng yên nên A cao: **0,90**.
- `U` = tỉ lệ thời gian thực sự đang bắn (còn lại là né, đổi chỗ): **0,80**.
- Tích `A × U = 0,72`.

### 2.2 Mục tiêu TTK

Tổng hợp từ Enter the Gungeon và Soul Knight (hai game khớp khổ màn hình nhất):

| Bậc | TTK | Số phát để chết | Máu so với quái thường |
|-----|-----|-----------------|------------------------|
| Quái lẻ | 0,3–0,8 s | 1–2 | 0,3–0,6× |
| **Quái thường** | **1,0–2,5 s** | **4–6** | **1× (gốc)** |
| Quái lì / có giáp | 2,5–4 s | 6–8 | 2–3× |
| Elite | 6–12 s | 10–20 | 8–15× |
| Boss | 45–90 s (2–3 pha) | 60–200 | **~40×** |

Tỉ lệ boss/quái thường ≈ 40× nhất quán một cách bất ngờ:
[Gungeon](https://enterthegungeon.wiki.gg/wiki/Bullet_Kin) 700/15 = 47×,
[Soul Knight](https://soul-knight.fandom.com/wiki/Bosses) 480/8 = 60×,
Hades tầng 1 4400/30 = 147× (ngoại lệ vì boss Hades là trận đơn rất dài).

### 2.3 Chốt số

Soul Knight là bằng chứng trực tiếp cho thang số nhỏ trên màn dọc: sát thương vũ
khí là **số nguyên 1–2 chữ số** (AK-47 = 3, Crossbow = 8, Broadsword = 12,
Soul Calibre = 25), quái tầng 1 có **8–15 máu**, boss tầng 1 có 480
([Weapons](https://soul-knight.fandom.com/wiki/Weapons),
[Bosses](https://soul-knight.fandom.com/wiki/Bosses)).

```
CŨ:  máu quái = 32 + 14·lv      (lv1 = 46,  lv60 = 872)
MỚI: máu quái = 18 + 3,4·lv     (lv1 = 21,  lv60 = 222)
```

Sát thương người chơi mỗi viên đạn:
```
dmg = W.dmg × (ATK / 10)
ATK = công nhân vật + công vũ khí + công theo lớp
```
với công nhân vật `10 + 0,9·lv` (lv1 = 10,9 · lv60 = 64) và bảng công vũ khí đã
chia nhỏ (SS 46 / S 34 / A 24 / B 15 ở cấp đồ tối đa).

Kết quả: **số phát để giết quái thường giữ nguyên ~5 suốt cả game**, thay vì trôi
từ 0,5 tới 1,0 rồi về 0,5.

### 2.4 Vì sao KHÔNG chỉ chia sát thương xuống

Ba phương án và cái vỡ ở mỗi phương án:

- **Chỉ chia sát thương ÷5.** Số nổi tụt về 1–2, mất hết độ phân giải ở đầu thang.
  Mọi con số PHẲNG trong game lệch pha: sát thương theo thời gian, phản đòn,
  cộng-thẳng-khi-trúng. Một buff "+10 sát thương" đang là +12% bỗng thành +600%.
  Và giáp trừ thẳng thành thảm hoạ.
- **Chỉ nhân máu quái ×5.** Lạm phát số. Mọi thứ khoá theo máu quái lệch: ngưỡng
  xử tử, sát thương theo % máu, hút máu, EXP tính theo máu.
- **Cả hai, và suy ra từ ngân sách.** Đây là cái đang làm.

Nhưng điểm mấu chốt là **thứ ba**: đổi cận chiến sang bắn thì TỐC ĐỘ BẮN gánh gần
hết việc rescale. Chuỗi combo cũ ra ~2 nhát/giây; rifle bắn 5 phát/giây. Chỉ riêng
việc đó đã cho phép cắt sát thương mỗi phát 2,5 lần **ở DPS không đổi** — tức
phần lớn việc rescale làm xong mà không phá tỉ lệ nào.

### 2.5 CÁI BẪY: quái sống lâu gấp 5 thì nó cũng bắn lâu gấp 5

Ngân sách sát thương NHẬN VÀO tự nhân lên theo, và không ai để ý cho tới lúc
người chơi chết oan. Risk of Rain 2 mã hoá đúng bất đối xứng này: máu boss tăng
theo `coeff/2,5` còn sát thương boss theo `coeff/30` — **chậm hơn 12 lần**
([Difficulty, RoR2 Wiki](https://riskofrain2.wiki.gg/wiki/Difficulty)).

Nên đi kèm với rescale, BẮT BUỘC:
- Hạ sát thương quái (`7 + 2,1·lv` → `4 + 0,85·lv`).
- **Cắt số quái mỗi đợt**: `maxMobs 16 → 9`, `wave 11 → 6`. Đợt 20 giây mà nhân 5
  lần TTK thì thành 100 giây — chết trên điện thoại.
- Thêm **hệ thẻ đánh** (mục 5.2).

---

## 3. Sáu lớp vũ khí

### 3.1 Luật phân biệt

DPS bền của mọi archetype trong Gungeon gần như BẰNG NHAU (AK 42,3 · shotgun 29,1
· sniper 22,6 — chênh ~2 lần), nhưng **sát thương mỗi lần bấm chênh 10 lần**
(SMG 3,2 · shotgun 24 · sniper 26 · Railgun 50 · Prototype Railgun 150)
([Guns, ETG Wiki](https://enterthegungeon.wiki.gg/wiki/Guns)).

Trong game né đạn, cái quyết định không phải DPS mà là **sát thương trong một cửa
sổ an toàn 0,4 giây**. Nên luật là: **mỗi lớp giỏi nhất ĐÚNG MỘT trục và tệ nhất
HAI trục.**

| Lớp | DPS bền | Burst/bấm | Tầm | Giá phát trượt | Giỏi nhất |
|-----|---------|-----------|-----|----------------|-----------|
| `rifle` Súng Trường | ★★★ | ★ | ★★★ | thấp | DPS bền |
| `shotgun` Súng Săn | ★★ | ★★★ | ★ ngắn nhất | cao | Burst gần |
| `sniper` Bắn Tỉa | ★ | ★★★ | ★★★ | rất cao | Tầm + burst |
| `bow` Cung | ★★ | ★★ | ★★ dải chí mạng | trung bình | Vị trí |
| `staff` Gậy Phép | ★★★ | ★ | ★★ | thấp | Diện rộng |
| `launcher` Súng Phóng | ★★ | ★★★ | ★★ | cao (đạn chậm) | Dọn đám |

### 3.2 Bộ trường mô tả một cây (lấy từ Realm of the Mad God)

RotMG phân biệt cả một lớp vũ khí bằng đúng sáu trường, và **tầm bắn là hệ quả**:

```
range = proj_speed × proj_lifetime
```

Kiểm chứng: Staff of the Cosmic Whole `18 × 0,475 = 8,55` ✓ ·
Wand of Recompense `18 × 0,5 = 9` ✓
([realmeye](https://www.realmeye.com/wiki/wand-of-recompense)).

Lấy nguyên vì nó bỏ được con số chỉnh tay thứ ba có thể mâu thuẫn với hai con số kia.

Trường của một cây trong `G.WEAPONS`:
`dmg` · `shots` · `arcGap` (độ) · `spread` (jitter độ) · `rpm` · `spd` (px/khung)
· `life` (ms) · `pierce` · `bounce` · `homing` · `explode` · `crit`

### 3.3 Tốc độ đạn

Nuclear Throne (đọc từ mã nguồn giải mã): người chơi 4 px/khung, đạn người chơi
16 px/khung = **4×**, đạn quái ~4 px/khung = **1×**
([scrWeapons.gml](https://github.com/toarch7/nt-recreated-public/blob/master/scripts/scrWeapons/scrWeapons.gml)).

Bất đối xứng đó là con số quan trọng nhất trong cả hệ: **đạn người chơi 4× tốc
chạy, đạn quái 1× tốc chạy** — tức đạn quái luôn đi bộ tránh được.

Săn Rồng: người chơi `2,35` px/khung.
- Đạn người chơi chuẩn = **9,4** (rifle). Bắn tỉa 10× = 23. Súng phóng 2× = 4,7.
- Đạn quái = **2,4** (đang là 5,4 — **nhanh gấp đôi mức công bằng**, phải sửa).

### 3.4 Cung — dải chí mạng và nạp lực

Bảng Critical Distance thật của Monster Hunter thế hệ 4 (MH4U/MHGen/MHGU), nơi cơ
chế này rõ ràng nhất ([Laxaria, MHGen Bow
Mechanics](http://laxgg.blogspot.com/p/mhgen-bow-mechanics.html)):

| Loại bắn | Quá gần | **CHÍ MẠNG** | Xa 1 | Xa 2 | Tối đa |
|----------|---------|--------------|------|------|--------|
| Spread | 1–3 → 1,0× | **3–4 → 1,5×** | 4–5 → 1,0× | 5–9 → 0,8× | 9–12 → 0,5× |
| Rapid  | 1–3 → 1,0× | **3–5 → 1,5×** | 5–6 → 1,0× | 6–12 → 0,8× | 12–15 → 0,5× |
| Pierce | 1–3 → 1,0× | **3–6 → 1,5×** | 6–8 → 1,0× | 8–9 → 0,8× | 9–13 → 0,5× |
| Heavy  | 1–3 → 1,0× | **3–15 → 1,5×** | — | — | — |

Ba tính chất phải giữ:
1. **Phạt bất đối xứng.** Quá gần chỉ MẤT thưởng (về 1,0×), không bao giờ tụt dưới
   gốc. Quá xa mới bị phạt (0,8× rồi 0,5×). Nó đẩy người chơi TIẾN VÀO.
2. **Không có vách đứng** — bốn bậc 1,5 → 1,0 → 0,8 → 0,5.
3. **Bề rộng dải là núm chỉnh độ khó của từng cây.**

Đường cong nạp — chuẩn ngành là **3,5–4×** từ tối thiểu tới tối đa, trong
**0,5–1,5 giây**. Hình dáng lấy của Monster Hunter, cố ý phạt nặng ở đáy:

| Nấc nạp | Vật lý | Hệ | Trạng thái |
|---------|--------|-----|-----------|
| 1 | **0,40×** | 0,70× | 0,50× |
| 2 | **1,00×** | 0,85× | 1,00× |
| 3 | **1,50×** | 1,00× | 1,50× |
| 4 | **1,70×** | 1,125× | 1,50× (không tăng) |

Nấc 1 là 0,40× — chưa tới một nửa nấc 2. Nấc 4 chỉ hơn nấc 3 có 13%, nên MH khoá
nó sau một kỹ năng: một nấc thứ tư mạnh sẽ làm ba nấc đầu thành thừa
([Laxaria MHGen](http://laxgg.blogspot.com/p/mhgen-damage-calculation-motion-values.html)).

Nạp cũng tăng SỐ MŨI TÊN (1 → 2 → 3), không chỉ tăng một con số — nhìn thấy được,
và tự cân bằng với mục tiêu nhỏ. Soul Knight còn cho **crit nạp theo** (Bow Plus
0% → 75%, Frost Bow 20% → 80%) ([Bow](https://soul-knight.fandom.com/wiki/Bow)).

**Không game nào phạt việc nạp quá lâu.** Giữ mãi cũng được; cái mất là bỏ lỡ cửa
sổ thưởng, không phải bị trừ.

Ba luật cảm giác, lấy nguyên từ [Kiranico MHW
Bow](https://mhworld.kiranico.com/en/guide/bow):
- **"Nạp cung không làm chậm di chuyển. Chỉ khi NGẮM mới chậm."** Tách nạp khỏi
  ngắm là quyết định cảm giác hay nhất trong toàn bộ nghiên cứu.
- **Né huỷ nạp là MIỄN PHÍ** — không bắn ra, không tốn gì. Nếu huỷ mà mất tài
  nguyên thì người chơi thôi nạp lúc nguy hiểm, và cả vòng lặp sụp.
- **Nạp mang sang**: phát sau khi né bắt đầu ở nấc cao hơn một bậc.

### 3.5 Gậy Phép — không phải "súng bắn đạn tím"

Súng là: bấm là bắn ngay · một cò = một viên · sát thương xảy ra ngay · sát thương
ở đúng tâm ngắm. Mọi cơ chế phép phải bẻ ít nhất một trong bốn.

Gậy lấy DPS từ **SỐ ĐẠN**, không phải sát thương mỗi viên: Staff of Thunder =
4 sát thương × **13 tia** = 85,8 DPS
([Soul Knight](https://soul-knight.fandom.com/wiki/Staff_of_Thunder)).

Và **cast delay NGẮT ĐƯỢC**: *"Niệm gậy mất một khoảng thời gian để hiệu ứng phát
tác. Nếu động tác niệm bị ngắt, không có gì xảy ra."*
([Category:Staffs](https://soul-knight.fandom.com/wiki/Category:Staffs)) Đó là bản
sắc của lớp, và là cái giá của việc bắn ra 5 tia một lúc.

Đường cong giá của Noita là thứ đáng chép: **chỉ số thô thì rẻ, ĐỘNG TỪ MỚI thì
đắt** — Damage Plus 5 mana, Speed Up 3, Double Spell 0; nhưng Homing 70 và
Piercing Shot **140** ([Spell Information
Table](https://noita.wiki.gg/wiki/Spell_Information_Table)).

### 3.6 Hệ nguyên tố — luật kỷ luật

**Không hai hệ nào được dùng chung một ĐỘNG TỪ.** Nếu băng và sét đều "gây sát
thương và làm chậm một chút" thì lại thành đạn tím.

| Hệ | Động từ | Số | Chồng nấc | Mạnh lên theo |
|----|---------|-----|-----------|---------------|
| Lửa | Cháy — sát thương trả sau | 50% của phát đó, 2 nhịp/giây, 4 s | 1 (làm mới) | sát thương mỗi phát |
| Băng | Chậm dần | −5%/nấc, 4 s | tối đa 8 (→ −40%) | số phát trúng |
| Sét | Nảy sang con khác | 40% sát thương, 3 lần nảy, ×0,7 mỗi lần | — | mật độ quái |
| Độc | DoT chồng vô hạn | 10% mỗi phát, 2 nhịp/giây, 3 s | **không giới hạn** | tốc độ bắn |
| Quang | Xuyên khiên, chặn hồi máu | +50% với mục tiêu có khiên | 1 | loại quái |
| Ám | Nổ trễ | nổ sau 1,1 s | 1 | canh nhịp |

Nguồn số: [PoE Ailment](https://pathofexile.fandom.com/wiki/Ailment) (cháy 50%/4 s,
độc 20%/2 s chồng vô hạn) · [Hades Status
effects](https://hades.fandom.com/wiki/Status_effects) (Chill 4%/nấc × 10 nấc,
Doom nổ sau 1,1 s) · [Hades Lightning
Strike](https://hades.fandom.com/wiki/Lightning_Strike) (4 lần nảy).

Cháy và Độc chỉ khác nhau ở **luật chồng nấc** — thế là đủ để thành hai hệ khác
nhau. Cháy = hệ burst (cao, dài, không chồng). Độc = hệ tốc-bắn (thấp, ngắn, chồng
vô hạn). Một cây gậy bắn 12 tia/giây gắn độc thì kinh khủng; gắn cháy thì tầm
thường. Ngược lại với khẩu bắn tỉa.

### 3.7 Luật falloff cho đạn nối tiếp

Archero: **mũi tên bắn về HƯỚNG MỚI thì miễn phí (100% sát thương); mũi tên bắn
CÙNG HƯỚNG thì bị thuế.** Side/Diagonal/Rear Arrow đều 100%; Front Arrow −25%,
Multishot −10% và −15% tốc bắn
([Diagonal Arrows](https://wiki-archero.luhcaran.fr/en/wiki/skill/Diagonal_Arrows/),
[Front Arrow](https://wiki-archero.luhcaran.fr/en/wiki/skill/Front_Arrow/)).
Đúng một nguyên tắc đó giữ cho build bắn 360° không mặc nhiên mạnh hơn build tập trung.

Và mọi falloff hội tụ về "phát cuối ≈ ⅓ phát đầu":

| Hành vi | Falloff | Trần | Phát cuối còn |
|---------|---------|------|---------------|
| Xuyên | −33%/con | không | 0,67³ = **30,1%** |
| Nảy sang quái | −30%/lần | 3 | 0,70³ = **34,3%** |
| Nảy tường | −50%/lần | 2 | **25%** |

**Xuyên và nảy giải quyết theo THỨ TỰ ƯU TIÊN, không đồng thời**: nảy nếu có mục
tiêu gần để nảy, không thì xuyên ([Archero
Abilities](https://archero.fandom.com/wiki/Multishot)). Tránh bùng nổ tổ hợp.

---

## 4. Kỹ năng — chỗ sai lớn nhất của bản cũ

Công thức đúng cho "kỹ năng nên mạnh hơn đòn thường bao nhiêu":

```
Sát thương kỹ năng ≈ D × R × T × K
D = sát thương đòn thường · R = phát/giây · T = hồi chiêu (giây)
K ≈ 0,5 với hồi chiêu ngắn 3–5 s
K ≈ 0,8–1,2 với hồi chiêu 10 s+
```

Kiểm chứng ngược: Hades Cast 50 vs đòn thường Stygian Blade 20 = **2,5×** trên hồi
chiêu ~3 s ([Cast](https://hades.fandom.com/wiki/Cast),
[Stygian Blade](https://hades.wiki.fextralife.com/Stygian_Blade)). Wizard of
Legend Shock Assault 5×5+16 = 41 vs spam đòn thường 16 trong cùng 5 giây = **2,5×**
([Shock Assault](https://wizardoflegend.fandom.com/wiki/Shock_Assault)).

Ví dụ áp vào Săn Rồng: đòn thường 10 sát thương, 5 phát/giây, kỹ năng hồi 18 giây
→ nên gây `10 × 5 × 18 × 0,8` = **720**, tức **~72 lần một viên đạn**.

Kỹ năng hiện tại đang để hệ số **1,8–3,4** — thấp hơn chuẩn thể loại cả chục lần.
Đó chính là lý do không ai buồn bấm kỹ năng.

Với kỹ năng có "quà kèm" (bất tử, đóng băng cả màn, triệu hồi), **K tụt về 0,3–0,5**
vì tiện ích chính là phần thưởng.

---

## 5. Màn dọc điện thoại — cái mà kiến thức desktop nói sai

### 5.1 Ngân sách độ phủ

Nghiên cứu IEEE GEM 2014 (McMaster) đo thực nghiệm: *"hiệu năng tăng tuyến tính
mạnh theo đường chéo màn hình"*, và giữ nguyên kích thước phần tử khi màn hình nhỏ
lại cho ra game *"khó hơn nhiều"* — mà người chơi **nhận ra và bực**
([Scale Effects in "Bullet Hell"
Games](https://www.csit.carleton.ca/~rteather/pdfs/GEM2014_poster1.pdf)).

Điện thoại chính là điều kiện "màn nhỏ" đó. Nên:

```
Độ phủ C = N × π·r_đạn² / (W × H)
```

Sân Săn Rồng 820×1080 = 885.600 px². Ở `r_đạn = 16` (≈2% bề ngang), diện tích một
viên = 804 px². Giữ độ phủ 9%:
```
N = 0,09 × 885.600 / 804 ≈ 99 viên
```

| Cường độ | Đạn trên màn | Độ phủ |
|----------|--------------|--------|
| Đánh quái thường | 15–30 | 2–3% |
| Boss pha 1–2 | 40–60 | 4–6% |
| Boss cao trào | 80–110 | 8–11% |
| **Trần cứng** | **130** | 13% |

**~90 viên trên điện thoại tương đương ~300 viên trên màn hình desktop.**

### 5.2 Công thức hành lang — cái thật sự giết người chơi

Độ phủ là ngân sách THẨM MỸ. Ngân sách CÔNG BẰNG là khe hở giữa hai viên kề nhau.
Với một vòng `n` viên, xét ở khoảng cách `d` từ tâm:

```
n_max = 2π·d / (2·r_đạn + 2·r_người + M)
```

`M` là biên độ sai số vận động — trên bàn phím gần bằng 0, trên cảm ứng thì không.
Đặt `M ≥ 2 × (tốc chạy mỗi khung) + 34 px`.

Thay số Săn Rồng (`d = 300`, `r_đạn = 16`, `r_người = 13`, `M ≈ 38`):
```
n_max = 1885 / (32 + 26 + 38) ≈ 20 viên
```
**Khoá trần 20 viên một vòng ở tầm đó**, thay vì đoán.

### 5.3 Hệ thẻ đánh

Chuẩn ngành: chỉ AI nào giữ **thẻ đánh** mới được ra đòn; số còn lại *làm bộ hung
hăng* — tiến lại gần, đi loanh quanh, gầm gừ — nhưng không đánh được
([Ask a Game Dev](https://askagamedev.tumblr.com/post/620010728353595392/when-designing-non-boss-enemy-ai-ie-ai-for)).
Nhịp đánh trung bình mỗi con: **2–3 giây**
([Enemy design and enemy AI](https://www.gamedeveloper.com/design/enemy-design-and-enemy-ai-for-melee-combat-systems)).

| Cường độ | Quái sống | Số thẻ |
|----------|-----------|--------|
| Nhẹ | 3–5 | **1** |
| Thường | 5–8 | **2** |
| Cao trào | 8–12 | **3** |
| **Không bao giờ** | — | **>3** |

Săn Rồng đang cho cả 16 con đánh tự do. Ghép với TTK dài gấp 4–5 lần, đây là chỗ
game sẽ vỡ.

### 5.4 Ngón cái chiếm 20% dưới màn hình

**~75% thao tác trên điện thoại là bằng ngón cái**, và **49% người dùng cầm máy một
tay** ([Parachute Design](https://parachutedesign.ca/blog/thumb-zone-ux/)). Cộng đồng
shmup nói thẳng: *"vấn đề lớn nhất của shmup cảm ứng là điểm mù nơi bạn đặt ngón
tay"* ([shmups.system11](https://shmups.system11.org/viewtopic.php?t=70925)).

- 20% dưới sân là vùng **không đáng tin về thị giác** — HUD ở đó, không phải gameplay.
- **Không sinh đạn sống vào vùng đó** nếu telegraph chưa hiện ở phía trên trước.
- Boss ở TRÊN, mối đe doạ đi xuống.
- Số nổi lệch lên trên.

### 5.5 Đạn phải hiện dần, chưa có hitbox

Danmakufu sinh đạn kèm **delay tính bằng khung**, trong đó vẽ một "đám mây trễ" —
đạn chưa có hitbox ([Sparen ph3
L33](https://sparen.github.io/ph3tutorials/ph3u3l33.html)). Với laser thì *"một tia
không có hitbox được sinh ra ở bề rộng nhỏ hơn để cho thấy tia thật sẽ hiện ở
đâu"* ([L10](https://sparen.github.io/ph3tutorials/ph3u1l10.html)).

Đây không phải trang trí mà là **bảo đảm công bằng chống chết-do-đạn-sinh-ra-trên-đầu**.
Cài: 6–12 khung (100–200 ms) hồn ma mờ dần, hitbox tắt suốt thời gian đó.

### 5.6 Ngẫu nhiên chỉ dùng cho HẠT GIỐNG, không bao giờ cho CẤU TRÚC

*"Làm tới cực đoan (cộng thêm tốc độ ngẫu nhiên) thì được một bầy đạn trông như
chẳng ai bỏ công thiết kế"* ([Sparen
A2](https://sparen.github.io/ph3tutorials/ddsga2.html)). Dùng đúng là random góc
gốc `θ₀` mỗi lần lặp để không để lại điểm mù. Luật: `s ≤ 0,3 × (360/n)`.

### 5.7 Luật chẵn-lẻ

Quạt **LẺ** viên đặt một viên đúng vào người chơi → buộc phải né.
Quạt **CHẴN** chừa khe ngay giữa → dồn ép vị trí mà không giết.
([Sparen A3](https://sparen.github.io/ph3tutorials/ddsga3.html))
Đừng bao giờ dùng lẻ cho pattern không thấy trước.

---

## 6. Game feel — bù lại cho sát thương thấp

Đây là mục quyết định "4–6 phát mới chết" thành ĐÃ TAY hay thành BỊ TRÂU.

### 6.1 Hitstop phải ngắn đi RẤT NHIỀU

Nuclear Throne dùng `sleep()` thật, tính bằng mili-giây
([sleep.gml](https://github.com/toarch7/nt-recreated-public/blob/master/scripts/sleep/sleep.gml)):

| Sự kiện | ms |
|---------|-----|
| Đạn nảy tường | **1** |
| Đĩa / plasma trúng đích | **10** |
| Quái nổ | **20** |
| Boss Scrapyard chết | **50** |
| Pháo sáng nổ / plasma lớn | **100** |

Thang **1 / 10 / 20 / 50 / 100** — mỗi bậc gấp ~2–2,5 lần.

Săn Rồng đang để nhát nhẹ nhất **50 ms** — bằng cả cú boss chết của NT — và nặng
nhất **210 ms**.

Luật: **hitstop ≤ 20% khoảng cách giữa hai phát.** Bắn 5 phát/giây (200 ms) → trần
40 ms. Và hitstop leo thang theo **SỰ KIỆN, không theo sát thương**:
trúng thường 2 khung · chí mạng 4 · giết 6 · giết elite 8 · boss đổi pha 12+.

### 6.2 Bốn kênh riêng trên mỗi phát bắn

Nuclear Throne tách rõ, không gộp
([scr_screenshake.gml](https://github.com/toarch7/nt-recreated-public/blob/master/scripts/scr_screenshake/scr_screenshake.gml)):
**đá camera** (CÓ HƯỚNG, về phía bắn) · **rung ngẫu nhiên** · **giật sprite súng**
· **đẩy lùi người chơi thật**.

| Vũ khí NT | đá camera | rung | giật súng | đẩy lùi |
|-----------|-----------|------|-----------|---------|
| Nỏ | 12 | **0** | 4 | 0 |
| Súng máy | 6 | 3 | 4 | 0 |
| Minigun | 7 | 4 | 4 | 0,6 |
| Shotgun đôi | 15 | 8 | 8 | 2 |
| Bazooka | **30** | 4 | 10 | 0 |
| Nuke | **40** | 8 | 10 | 0 |

Nỏ được **rung = 0** vì nó là khẩu chính xác — rung sẽ phá đúng cái cảm giác đó.
Bazooka được đá camera 30 nhưng rung chỉ 4: **nặng, không hỗn loạn**.

### 6.3 Mẹo giảm dần

```
viewx2 = round(viewx2 - viewx2 * 0.4)             // đá camera: −40%/khung
if (shake > 10) shake *= power(0.8, timescale)    // rung mạnh: giảm mũ
else            shake -= timescale                 // rung nhẹ: TUYẾN TÍNH −1/khung
```

Vì giảm tuyến tính 1 đơn vị mỗi khung, **con số biên độ ĐỒNG THỜI là thời lượng
tính bằng khung**. Chỉnh một số cho mỗi khẩu thay vì hai.

Trên điện thoại: **giảm một nửa mọi biên độ rung** (1–2 px nhẹ / 4–5 px nặng) và
phải có thanh chỉnh độ rung — đó là yêu cầu tiếp cận, không phải tuỳ chọn xa xỉ.

### 6.4 Số nổi

- Tối đa 4 chữ số; quá thì viết tắt (`1,2K`).
- **Không bao giờ hiện số thập phân.** Lưu float, hiện số nguyên.
- **Sàn là 1.** Món nào ra 0,4 phải hiện và gây ít nhất 1, không thì người chơi
  tưởng hỏng.
- Chí mạng phải là **một LOẠI sự kiện khác**, không phải một con số to hơn — đổi
  màu, cỡ, độ đậm, và có tiếng riêng.
- Bắn trên 6 phát/giây thì **gộp số** (một số mỗi 200–300 ms mỗi con), không thì
  lớp số thành bức tường đục.

---

## 7. Giáp — bắt buộc dùng công thức phần trăm

```
sát thương nhận = dmg × K / (K + armor)
máu hiệu dụng   = HP × (1 + armor / K)
```

**Tuyệt đối không trừ thẳng.** Với `max(1, dmg − armor)`, giáp 3 điểm làm khẩu SMG
4 sát thương mất **75%** sức mạnh còn khẩu bắn tỉa 26 sát thương chỉ mất **12%** —
xoá sổ nguyên một dòng vũ khí một cách vô tình.

Công thức phần trăm bất biến theo thang: nó đối xử với viên đạn 4 và viên đạn 26
hoàn toàn tương xứng ([Armor, League of Legends
Wiki](https://wiki.leagueoflegends.com/en-us/Armor)). Và vì là phép nhân, nó gộp
sạch vào ngân sách DPS ở mục 2.1: quái có giáp `A` đơn giản là có máu hiệu dụng
`HP × (1 + A/K)`.

`K = 50` cho thang số nhỏ.

## 8. Chí mạng

```
E[dmg] = dmg × (1 + p_crit × (mult − 1))
```

Với số nhỏ: **hệ số thấp, tỉ lệ vừa**. Chí mạng ×2 biến 5 thành 10 — nguyên một
phát bắn, tức một cú nhảy rất cục. Nên:
- Hệ số **1,75×**, không phải 3×.
- Tỉ lệ gốc **15%** — nhiều lần nhỏ giữ phương sai số-phát-để-chết thấp.
- Phương sai sát thương hẹp **±10%**. Đừng chồng ±15% lên trên chí mạng ×3 lên
  trên số nhỏ.
- **Gộp kỳ vọng chí mạng vào ngân sách DPS**, không thì mọi build thiên chí mạng
  âm thầm phá ngân sách.
- Soul Knight: chí mạng cộng THUẦN TUÝ (10 nhân vật + 80 vũ khí + 5 = 95%), và
  **Explosive không bao giờ chí mạng được**
  ([Stats](https://soul-knight.fandom.com/wiki/Stats)). Giữ luật đó cho `launcher`.

Ống sát thương cuối:
```
raw   = W.dmg × (ATK/10) × (1 + U(−0,10, +0,10))
crit  = raw × 1,75  với xác suất p_crit
final = max(1, round( crit × 50/(50 + armor) × elemMul × critDist ))
```

---

## 9. Độ hiếm ≈ tỉ lệ rơi, KHÔNG phải sức mạnh

Wiki Soul Knight nói thẳng: *"Màu tên vũ khí thể hiện độ hiếm, hay nói đúng hơn là
XÁC SUẤT GẶP. Nên màu tên không nhất thiết thể hiện độ hữu dụng."*
([Weapons](https://soul-knight.fandom.com/wiki/Weapons))

Tính trên cả 500 vũ khí: toàn bộ Trắng → Magenta chỉ chênh **2,4× DPS trung vị**
(14,4 → 35), và đường cong **không đơn điệu** — Cam (35) mạnh hơn Đỏ (26,6). Bậc
cao mua **cơ chế mới**, không mua số to hơn.

Săn Rồng đang làm ngược: B → SS là `306/85` = **3,6×** công vật lý, cộng công hệ
`656/180` = 3,6× nữa. Bảng mới nén lại còn **~3×** tổng, và bậc cao chuyển sang
mua động từ (xuyên, nảy, đuổi, nổ) thay vì mua số.

---

## 10. Ánh xạ lớp cũ → lớp mới

43 nhân vật đang gắn cứng vào 5 lớp cũ. Ánh xạ giữ đúng hình tượng nhân vật:

| Lớp cũ | → Lớp mới | Vì sao |
|--------|-----------|--------|
| `sword` Kiếm & Khiên | `rifle` Súng Trường | Cân bằng nhất ở cả hai bên; vai trò "cây gì cũng làm được" giữ nguyên |
| `great` Đại Kiếm | `launcher` Súng Phóng | Chậm, nặng, cả sân thấy nó tới, đập diện rộng — cùng một câu |
| `spear` Thương | `sniper` Bắn Tỉa | Tầm với dài nhất, đâm xuyên một hàng → xuyên và tầm xa |
| `dual` Song Kiếm | `shotgun` Súng Săn | Phải áp sát, ra nhiều nhát một lúc, cam kết thấp |
| `bow` Cung | `bow` Cung | Giữ nguyên, nhưng thêm dải chí mạng và nạp bốn nấc |
| — | `staff` Gậy Phép | Lớp MỚI. Lấy các nhân vật thiên phép/hỗ trợ từ mọi lớp cũ |

Save cũ được di trú tự động: `wclass` cũ đổi theo bảng trên, đồ đang lắp giữ
nguyên chủ, đội hình ba người giữ nguyên thứ tự.

---

## 11. Bảng thay đổi số — trước và sau

| Hằng số | Cũ | Mới | Nguồn/lý do |
|---------|-----|-----|-------------|
| `baseAtk` / `atkPerLv` | 32 / 4,2 | **10 / 0,9** | thang số nhỏ (§2.3) |
| Máu quái | `32 + 14·lv` | **`18 + 3,4·lv`** | ngân sách DPS (§2.1) |
| Công quái | `7 + 2,1·lv` | **`4 + 0,85·lv`** | cái bẫy TTK (§2.5) |
| `RANK_W` SS | p306 / e656 | **p46 / e30** | nén thang hiếm (§9) |
| `maxMobs` | 16 | **9** | thẻ đánh + độ dài đợt (§5.3) |
| `wave` | 11 | **6** | đợt 20 s không được thành 100 s |
| Đạn quái `r` | 6 (0,73% sân) | **16 (2,0%)** | đọc được trên màn dọc (§5.1) |
| Đạn quái tốc | 5,4 (2,3× người) | **2,4 (1,0×)** | luật NT (§3.3) |
| Hitstop nhẹ | 50 ms | **10 ms** | thang NT (§6.1) |
| Hitstop nặng nhất | 210 ms | **100 ms** | trần cho boss chết / nổ lớn |
| Rung nhẹ / nặng | 3 / 20 | **2 / 10** | giảm nửa cho điện thoại (§6.3) |
| Hệ số kỹ năng | 1,8–3,4 | **theo `D×R×T×K`** | §4 |
| Giáp | (chưa có) | **`dmg × 50/(50+armor)`** | §7 |
| Chí mạng | (chưa có) | **15% @ ×1,75** | §8 |

---

## 12. Cái CỐ Ý không làm

- **Không cài hệ năng lượng/mana.** Soul Knight cân bằng bằng nó, nhưng nó cần cả
  một vòng lặp nhặt orb năng lượng trong màn mà Săn Rồng không có. Thay bằng
  nhịp bắn + hồi chiêu kỹ năng.
- **Không cài hệ ghép spell kiểu Noita.** Đẹp, nhưng nó là cả một game riêng.
  Cái lấy được là ĐƯỜNG CONG GIÁ (chỉ số rẻ, động từ đắt) chứ không phải bộ máy.
- **Không cài co-op.** Giữ nguyên quyết định cũ: vào ải một mình.
- **Không cài hệ nảy tường cho đạn người chơi ở bản này.** Sân không có tường
  trong; nảy chỉ có nghĩa khi có hình học để nảy.
