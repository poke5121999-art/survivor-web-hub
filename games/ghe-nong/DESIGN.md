# Ghế Nóng — bản thiết kế

> Game quản lý đội tuyển esport. **Nuôi quân kiểu Uma Musume, thi đấu kiểu Teamfight Manager 2.**
> Chạy trong trình duyệt, không engine, mở được từ `file://` lẫn GitHub Pages.
> **Toàn bộ UI nằm ngang** (landscape), ngón cái cầm hai bên máy.
>
> Số liệu gốc của hai game nguồn nằm ở `RESEARCH.md`. File này là **quyết định thiết kế** — cái gì
> lấy nguyên, cái gì đổi, và **vì sao**.

---

## 0. Ba câu tóm tắt

1. Người chơi là **giám đốc**. Mỗi mùa chọn **1 huấn luyện viên + 5 tuyển thủ + 2 cựu HLV**, rồi
   chơi một **ca huấn luyện**.
2. Ca huấn luyện là vòng lặp **5 ngày tập → 1 giải**. Cuối mùa là **4 giải chung kết thế giới**, ở đó
   nhịp đổi thành **1 ngày tập → 1 trận** đan xen.
3. Giải đấu là **ban/pick + chọn lối chơi**, rồi **xem trận tự đánh** — có bản đồ, đi lane, tiền, mua
   đồ, quái lớn, đẩy trụ, giao tranh, biểu đồ vàng, MVP.

---

## 1. Ánh xạ khái niệm (Uma → Ghế Nóng)

| Uma Musume | Ghế Nóng | ghi chú |
|---|---|---|
| Umamusume (nhân vật được nuôi) | **Huấn luyện viên (HLV)** | thứ gacha ra, có sao, uncap, kỹ năng riêng, năng khiếu |
| Support card (thẻ hỗ trợ) | **Tuyển thủ** | gacha riêng, có thân thiết, rainbow, kỹ năng riêng, và **thông thạo tướng** |
| Legacy / cha mẹ | **Cựu HLV** (2 người) | HLV đã tốt nghiệp ca trước, để lại spark |
| 5 sân tập (Speed…Wit) | **5 giáo án** | Cơ · Bền · Lực · Lì · Não |
| Đua ngựa | **Trận đấu MOBA 5v5** | ban/pick + mô phỏng |
| Fan | **Danh tiếng** | mở khoá giải lớn |
| Carat | **Xu** | tiền gacha |
| TP (vé chơi) | **Thể lực CLB** | giới hạn số ca chạy song song, chống cày vô hạn |

> **Vì sao HLV là thứ được nuôi chứ không phải tuyển thủ?** Vì chủ dự án chốt vậy, và nó hợp lý: một
> HLV giỏi mang **triết lý** (năng khiếu lối chơi) và **giáo án** (kỹ năng riêng) — đó chính là cái
> quyết định đội đá kiểu gì. Tuyển thủ thì thay đổi theo mùa, đúng đời thật.

---

## 2. Chỉ số

### 2.1 Năm chỉ số của HLV — nuôi trong ca

| chỉ số | tên đầy đủ | ảnh hưởng trong trận |
|---|---|---|
| **CƠ** | Cơ bản / thao tác | tỉ lệ trúng chiêu, né chiêu, last-hit, tốc độ ra chiêu |
| **BỀN** | Thể lực | giữ phong độ về cuối trận; chống tụt chỉ số ở phút 20+ |
| **LỰC** | Sức đánh | sát thương gây ra, tốc độ farm, khả năng solo kill |
| **LÌ** | Bản lĩnh | chịu áp lực khi thua, tỉ lệ lật kèo, không hoảng khi bị gank |
| **NÃO** | Tư duy | quyết định macro: timing quái lớn, cắm mắt, đổi lane, gọi giao tranh |

Trần chỉ số **1200** (lấy nguyên của Uma), hiển thị kèm **hạng chữ** `G → F → E → D → C → B → A → S`
theo ngưỡng: `<150 G · 150 F · 300 E · 450 D · 600 C · 800 B · 1000 A · 1150 S`. `[ĐỀ XUẤT]`

Mỗi hạng còn có `+` khi vượt nửa quãng (ví dụ `F+`), y như Uma.

### 2.2 Điểm kỹ năng

Tích trong ca, tiêu ở màn **Giáo án** để mua kỹ năng cho HLV. Kỹ năng chia:

- **Kỹ năng riêng (unique)**: mỗi HLV có 1, mở sẵn, nâng cấp theo sao.
- **Kỹ năng phụ**: mua bằng điểm, có **gợi ý (hint)** từ tuyển thủ thì rẻ hơn 30%. `[ĐỀ XUẤT]`
- **Kỹ năng vàng**: bản nâng của kỹ năng phụ, chỉ mở khi đã có bản thường + đủ chỉ số.

### 2.3 Năng khiếu (lối chơi) — 3 nhóm, hạng G→S

Lấy nguyên cấu trúc `turf/dirt` + `cự ly` + `lối chạy` của Uma:

| nhóm Uma | nhóm Ghế Nóng | các mức |
|---|---|---|
| Mặt sân (Turf/Dirt) | **Sân đấu** | **LAN** (sân khấu, khán giả, áp lực) · **ONLINE** (giải mạng) |
| Cự ly (Sprint→Long) | **Nhịp trận** | **Chớp** (<20 phút) · **Ngắn** (20–28) · **Dài** (28–36) · **Siêu dài** (36+) |
| Lối chạy (Front→End) | **Thế trận** | **Bạo Đầu** · **Bám Nhịp** · **Nuôi Muộn** · **Bùng Cuối** |

Bốn thế trận, đúng tinh thần bốn lối chạy Uma:

- **Bạo Đầu** — dồn hết vào 10 phút đầu: invade, gank sớm, lấy Serpen đầu. Mạnh nếu trận kết thúc
  sớm, đuối nếu kéo dài.
- **Bám Nhịp** — giữ thế cân bằng, ăn từng mục tiêu nhỏ. Ổn định nhất, ít đỉnh cao.
- **Nuôi Muộn** — chịu trận sớm, đổi tài nguyên lấy farm, bung từ phút 25.
- **Bùng Cuối** — nhường hẳn nửa đầu, dồn vào giao tranh tổng cuối. Ăn to hoặc thua đậm.

**Luật khớp năng khiếu** `[ĐỀ XUẤT]`: mỗi giải khai báo `sân đấu`, `nhịp trận dự kiến`. Hạng năng
khiếu của HLV cho **hệ số**:

```
S: ×1.10   A: ×1.05   B: ×1.00   C: ×0.95   D: ×0.88   E: ×0.80   F: ×0.70   G: ×0.55
```

Hệ số nhân vào **chỉ số hiệu dụng** của cả đội trong trận đó. Thế trận không hợp = đội yếu hẳn — đây
là chỗ ban/pick phải chữa.

---

## 3. Tuyển thủ (vai support card)

### 3.1 Thẻ tuyển thủ

Mỗi tuyển thủ có:

| trường | mô tả |
|---|---|
| **Loại** | Cơ / Bền / Lực / Lì / Não / **Bạn Thân** (loại thứ 6, kiểu thẻ Friend của Uma) |
| **Bậc** | R · SR · SSR (gacha) — quyết định độ mạnh hiệu ứng |
| **Uncap** | 0→4 (trùng thẻ), mở trần cấp và mở khoá hiệu ứng ẩn |
| **Cấp** | 1→50, nuôi bằng vật phẩm |
| **Vị trí** | **KHOÁ CỨNG** một trong: Đường Trên · Rừng · Đường Giữa · Xạ Thủ · Hỗ Trợ. Kèm 0–5 sao = giỏi tới đâu ở chính chỗ đó |
| **Chất chơi** | **KHOÁ CỨNG** 2 nét (đẩy lẻ · hay đi kèo · cắm mặt farm · máu giao tranh · đánh rỉa · lao trước · chơi chắc · bám mục tiêu · thích solo · người gọi kèo) |
| **Cái tôi** | 0–100 — càng cao càng hay bỏ lệnh để chơi theo chất của mình |
| **Thông thạo tướng** | bảng từng tướng: **N < R < SR < SSR < UR** |
| **Hiệu ứng** | 6–10 dòng, xem 3.2 |
| **Kỹ năng gợi ý** | 2–4 kỹ năng mà thẻ này dạy cho HLV |
| **Sự kiện riêng** | 3 cảnh, mỗi cảnh có lựa chọn |

### 3.2 Bộ hiệu ứng (rút gọn từ 24 dòng của Uma còn 14)

```
Thân thiết (Friendship Bonus)      %  — hệ số khi nổ cầu vồng
Tinh thần (Mood Effect)            %  — khuếch đại tác dụng tâm trạng
Cộng giáo án <loại>                %  — tăng kết quả sân đúng loại
Hiệu quả tập (Training Effect)     %  — tăng mọi sân
Chỉ số khởi điểm <5 loại>          số — cộng thẳng đầu ca
Thân thiết khởi điểm               %  — thanh thân thiết bắt đầu sẵn
Thưởng thi đấu (Race Bonus)        %  — chỉ số/điểm nhận sau mỗi giải
Thưởng danh tiếng (Fan Bonus)      %
Cấp gợi ý / Tần suất gợi ý         số/% 
Ưu tiên đúng sân (Specialty)       %  — tăng xác suất đứng đúng sân
Chống hỏng (Failure Protection)    %
Giảm hao thể lực                   %
Cộng điểm kỹ năng                  %
Hồi thể lực khi tập Não            số — bản của "Wit Friendship Recovery"
```

### 3.3 Thân thiết và cầu vồng

- Tập cùng sân với tuyển thủ nào thì **thanh thân thiết** người đó lên `+7` (`+10` nếu nổ sự kiện).
- Thanh **80/100 → chuyển cam**: mở **Cầu Vồng**.
- Khi tuyển thủ đã cam **đứng đúng sân sở trường của mình**, sân đó **sáng cầu vồng**: hệ số ăn chỉ
  số nhân **×1.6 → ×2.2** tuỳ bậc thẻ và uncap. `[ĐỀ XUẤT]` (Uma không công bố số chính xác.)
- Nhiều tuyển thủ cầu vồng cùng một sân thì **cộng dồn** — đây là khoảnh khắc "ăn dày" mà người chơi
  săn cả ca.

### 3.4 Thông thạo tướng — thứ chủ dự án yêu cầu

Mỗi tuyển thủ có bảng thông thạo riêng. Trong trận:

| bậc | hệ số chỉ số tướng | ghi chú |
|---|---|---|
| **N** | ×0.82 | chưa từng tập, hay lỗi thao tác |
| **R** | ×0.90 | biết chơi |
| **SR** | ×1.00 | chuẩn |
| **SSR** | ×1.10 | tủ |
| **UR** | ×1.22 | **tướng ruột**, có thêm hiệu ứng riêng của tuyển thủ |

Thông thạo **lên được** khi tuyển thủ dùng tướng đó trong trận (+1 điểm/trận thắng, +0.5 thua), và
khi tập ở giáo án có sự kiện "ôn tướng". `[ĐỀ XUẤT]`

→ Hệ quả thiết kế: **ban/pick không chỉ là counter tướng, mà là counter người**. Ban đúng tướng UR
của đối thủ mới là ban đúng — hệt lời khuyên trong hướng dẫn TFM2 (*"Draft around the player, not
only the champion"*).

### 3.5 Vị trí và chất chơi là **khoá cứng** — HLV không sửa được

Đây là luật quan trọng nhất của phần đội hình:

- Một tuyển thủ **chỉ biết đá đúng một vị trí**. Không có chuyện kéo xạ thủ lên đường trên.
- Mỗi người có **2 nét chất chơi cố định** (thích đẩy lẻ, hay đi kèo, cắm mặt farm, máu giao tranh,
  đánh rỉa, lao trước, chơi chắc, bám mục tiêu, thích solo, người gọi kèo).
- **Chiến thuật của HLV chỉ là lời khuyên.** Mỗi tick mô phỏng, xác suất một người làm theo lệnh là:

```
nghe_lệnh = 0.55 + 0.40 × (NÃO_hlv / 1200) − 0.35 × (cái_tôi / 100)
```

  Cái tôi 80 mà HLV NÃO thấp thì gần như người ta tự chơi. Ngược lại HLV NÃO cao kéo cả đội vào
  khuôn.

**Hệ quả về lối chơi:** đội hình không phải bài toán "xếp người mạnh nhất", mà là **ghép chất**:

- Không có ai `lead` (người gọi kèo) → đội tan tác khi giao tranh tổng.
- Ba người `lao` cùng lúc → thắng to hoặc thua sạch, không có ở giữa.
- Có `le` (đẩy lẻ) thì chiến thuật *1-3-1* mới chạy; không có ai đẩy lẻ mà chọn 1-3-1 là tự thua.

Và vì gacha ra ai thì được người đó, **người chơi phải xếp đủ 5 vị trí trước khi lo mạnh yếu** —
một ràng buộc thật, giống hệt việc một CLB đời thật thiếu người đi rừng.

---

## 4. Ca huấn luyện

### 4.1 Nhịp một mùa

Chủ dự án chốt: **5 ngày tập → 1 giải**, lặp; **4 giải chung kết thế giới** thì **1 ngày tập → 1
trận** đan xen.

Cụ thể một mùa `[ĐỀ XUẤT]` (dựa trên con số đó):

```
Vòng bảng quốc nội   :  5 tập → Giải 1   (Bo1)
                        5 tập → Giải 2   (Bo1)
                        5 tập → Giải 3   (Bo3)
                        5 tập → Giải 4   (Bo3, tranh vé)
Chung kết thế giới   :  1 tập → Tứ kết   (Bo3)
                        1 tập → Bán kết  (Bo5)
                        1 tập → Chung kết nhánh (Bo5)
                        1 tập → CHUNG KẾT (Bo5)
```

Tổng **24 lượt** (20 tập + 4 tập xen kẽ) + **8 giải**. Một mùa gọn trong **15–25 phút** nếu bỏ qua
xem trận, **45–60 phút** nếu xem đủ. Đây là **cỡ phiên hợp cho web/di động** — Uma một ca 70 lượt là
quá dài cho trình duyệt.

**Luật đứt ca** (lấy của Uma): mỗi giải có **mục tiêu tối thiểu** (ví dụ "vào top 2"). Không đạt →
**mùa kết thúc sớm**, vẫn được kết toán và vẫn để lại spark, nhưng hạng thấp.

### 4.2 Một ngày tập

Mỗi ngày chọn **1 trong 6 việc** (khung của Uma, đổi tên):

| việc | tác dụng |
|---|---|
| **Tập** | chọn 1 trong 5 giáo án |
| **Nghỉ** | hồi 30–70 thể lực |
| **Xả hơi** | kéo tâm trạng lên 1–2 bậc, hồi ít thể lực |
| **Phòng y tế** | gỡ trạng thái xấu |
| **Giáo án** | mua kỹ năng bằng điểm |
| **Kèo giao hữu** | đánh trận phụ: ăn danh tiếng + điểm kỹ năng + kinh nghiệm tướng, tốn thể lực |

### 4.3 Công thức tập `[ĐỀ XUẤT]`

```
base        = bảng[giáo án][cấp sân]        (cấp 1..5)
hệ_số_tt    = 1 + Σ(cộng_giáo_án) + Σ(hiệu_quả_tập)
hệ_số_bạn   = Π(cầu_vồng của từng tuyển thủ đứng đúng sân)     (mặc định 1.0)
hệ_số_tâm   = { GREAT 1.20, GOOD 1.10, THƯỜNG 1.00, TỆ 0.90, RẤT TỆ 0.80 }
hệ_số_đông  = 1 + 0.05 × (số tuyển thủ đứng ở sân)             (tối đa 5 người)

ăn = floor( base × hệ_số_tt × hệ_số_bạn × hệ_số_tâm × hệ_số_đông )
```

Bảng `base` (chỉ số chính / phụ / điểm kỹ năng) — `[ĐỀ XUẤT]`, cân theo trần 1200 và 24 lượt:

| giáo án | cấp 1 | cấp 5 | chỉ số phụ | thể lực | điểm KN |
|---|---|---|---|---|---|
| Cơ | 10 | 22 | Lực +5 | −21 | +2 |
| Bền | 9 | 20 | Lì +4 | −19 | +2 |
| Lực | 8 | 19 | Cơ +5, Bền +3 | −20 | +2 |
| Lì | 8 | 19 | Bền +4, Cơ +3 | −22 | +2 |
| Não | 9 | 20 | Cơ +2 | **+5** | +4 |

Sân **lên 1 cấp sau mỗi 4 lần tập**, tối đa cấp 5 (luật của Uma).

### 4.4 Thể lực và hỏng

```
thể lực     : 0..100, đầy đầu ca
tỉ lệ hỏng  = clamp( (50 − thể_lực_còn) × 1.6 , 0, 90 ) %   khi thể lực < 50
              0% khi thể lực ≥ 50
              × (1 − chống_hỏng của tuyển thủ)
```

Hỏng nhẹ (dưới 30%): mất lượt, tụt tâm trạng 1 bậc.
Hỏng nặng (từ 30%): mất lượt + **tụt chỉ số** 5–15 điểm + có thể dính **chấn thương** (trạng thái xấu).

**Luôn hiện `Hỏng: xx%` ngay cạnh nút tập**, đúng như Uma. Không giấu số.

### 4.5 Trạng thái xấu `[ĐỀ XUẤT]`

| trạng thái | tác dụng | gỡ |
|---|---|---|
| Mỏi tay | −20% kết quả sân Cơ | Phòng y tế / tự hết sau 3 lượt |
| Mất ngủ | mỗi lượt −5 thể lực | Phòng y tế |
| Tâm lý lung lay | tâm trạng không lên quá THƯỜNG | Xả hơi ×2 |
| Drama truyền thông | −30% danh tiếng nhận được | tự hết sau 5 lượt |
| Cãi nhau nội bộ | thân thiết 1 tuyển thủ ngẫu nhiên đóng băng | sự kiện |

### 4.6 Sự kiện

Sau mỗi việc có **35%** nổ một sự kiện `[ĐỀ XUẤT]`. Ba nguồn:

1. **Sự kiện tuyển thủ** (3 cảnh mỗi người, mở theo mốc thân thiết 20/50/80).
2. **Sự kiện HLV** (theo tiểu sử riêng).
3. **Sự kiện chung** (~40 cảnh, dùng lại cho mọi ca).

Mỗi sự kiện có 0–3 lựa chọn; **kết quả ghi thẳng vào bảng Nhật ký** bên phải màn hình theo đúng kiểu
Uma: từng dòng `Cơ +5 / Điểm KN +10 / Thân thiết với Kiên +7`.

---

## 5. Kế thừa — 2 cựu HLV

Trước khi bắt đầu mùa, chọn **2 cựu HLV** đã tốt nghiệp. Mỗi người kéo theo **2 ông bà** của họ →
tổng **6 hồ sơ** ảnh hưởng.

### 5.1 Bốn loại spark (lấy nguyên Uma, đổi tên)

| màu | tên | tác dụng |
|---|---|---|
| xanh dương | **Tố chất** | cộng thẳng 1 trong 5 chỉ số lúc đầu mùa; sao theo ngưỡng chỉ số cuối ca **600 / 1100** |
| hồng | **Triết lý** | nâng năng khiếu (sân đấu / nhịp / thế trận), tối đa **4 bậc** |
| xanh lá | **Giáo án gia truyền** | truyền **kỹ năng riêng** của cựu HLV |
| trắng | **Bài học** | cộng chỉ số lẻ + cấp gợi ý kỹ năng |

### 5.2 Hợp cạ (affinity)

Điểm hợp cạ ẩn giữa HLV mới và từng cựu HLV, hiện ra bằng `△ / ○ / ◎`, tính từ: cùng khu vực, từng
đối đầu, cùng thế trận, cùng giải đã vô địch. `[ĐỀ XUẤT]`

```
tỉ lệ nổ spark = 0.30 + 0.10×sao_spark + { △: 0, ○: 0.12, ◎: 0.25 }
```

### 5.3 Cảm hứng giữa mùa

Đến **lượt 12** và **lượt 20** nổ **"CẢM HỨNG!"** — bảng vàng chạy ngang màn, rồi Nhật ký liệt kê
từng dòng nhận được. Đây là khoảnh khắc "sướng" cần hiệu ứng mạnh (chớp sáng + hoa vàng + rung nhẹ).

---

## 6. Thi đấu

### 6.1 Chuỗi màn

```
Lịch → [Báo cáo phân tích] → [Chọn đội hình] → BAN/PICK → GIAO TƯỚNG → CHIẾN THUẬT → TRẬN → KẾT QUẢ
```

### 6.2 Báo cáo phân tích (analyst)

Trước mỗi trận, hiện:

- 5 tuyển thủ đối thủ, chỉ số **hiện một phần** (càng nhiều analyst càng lộ nhiều — mặc định lộ 3/5).
- **Tướng hay pick** / **tướng hay ban** của họ.
- **Tướng UR** của từng người (chỉ lộ nếu analyst đủ cấp) → đây là thông tin quyết định ban.
- Một đoạn nhận xét chữ, kiểu TFM2: *"Chìa khoá của họ là đi rừng. Đội này thích dồn đường dưới.
  Xạ thủ của họ yếu khi bị ép sớm."*

### 6.3 Ban / Pick

Luật chuẩn `[ĐỀ XUẤT]` (theo TFM2, rút cho vừa màn ngang):

```
Ban lượt 1 : xanh–đỏ–xanh–đỏ            (4 ban)
Pick lượt 1: xanh · đỏ đỏ · xanh xanh · đỏ   (6 pick)
Ban lượt 2 : đỏ–xanh–đỏ–xanh            (4 ban)
Pick lượt 2: đỏ · xanh xanh · đỏ        (4 pick)
```

Tổng 8 ban + 10 pick = **18 lượt**. Có nút **"Giao cho trợ lý"** để bỏ qua (như TFM2), và **đồng hồ
tuỳ chọn** (tắt / 10s / 20s / 30s).

Luật **Không Lặp (Fearless)**: bật được ở phần cài đặt mùa — tướng đã dùng ở ván trước trong cùng
series thì không pick lại. Hiện **badge số đỏ** trên ô tướng, đúng như ảnh TFM2.

**Giao tướng** là bước riêng sau pick: kéo 5 tướng đã pick cho 5 tuyển thủ. Ở đây bảng **thông thạo**
hiện to (N/R/SR/SSR/UR) để người chơi thấy ngay giao sai là chết.

### 6.4 Chiến thuật

Rút từ 12 nhóm của TFM2 xuống **7 nhóm** cho vừa màn ngang, mỗi nhóm 3 lựa chọn `[ĐỀ XUẤT]`:

| nhóm | lựa chọn |
|---|---|
| Trọng tâm đường | Trên/Giữa · Giữa/Dưới · Cả ba |
| Kiểu đi rừng | Farm/Giữ · Gank · Cướp rừng |
| Rồng sớm | Luôn tranh · Tuỳ · Nhường |
| Quản lý lính | Ưu tiên lính · Ưu tiên tụ |
| Vào mục tiêu | Poke giữ khoảng · Lao thẳng |
| Đẩy trụ | Poke · Dive |
| Kết trận | Chắc chân · Linh hoạt · Liều |

Cộng **Chiến thuật cá nhân**: mỗi tuyển thủ chọn **hướng lên đồ** (Sát thương / Chống chịu / Hỗn hợp
/ Tự quyết) — như tab Personal của TFM2.

Mỗi lựa chọn có **một dòng giải thích** ở đáy. Không giải thích = người chơi bấm bừa.

### 6.5 Mô phỏng trận — phần phải làm kỹ nhất

#### 6.5.1 Bản đồ

Một bản đồ MOBA rút gọn nhưng **đủ chất**: 3 đường (Trên, Giữa, Dưới) + 2 nửa rừng, đối xứng chéo.

```
mỗi đường: 2 trụ + 1 trụ lõi
nhà chính (Lõi) ở hai góc chéo
rừng: 4 bãi quái mỗi bên + 2 hố quái lớn ở sông
```

- **Rồng (Serpen)**: hồi sinh 120s, hồi đầu tiên phút 3. Ăn được cộng buff cộng dồn.
- **Chúa Hang (Morgard)**: hồi sinh 240s đầu, sau đó 150s. Ăn được → lính nhà mình **được buff 60s**
  (đúng cơ chế TFM2, có gắn hiệu ứng lên lính chứ không chỉ cộng số cho tướng).

#### 6.5.2 Buff theo vị trí (lấy nguyên TFM2 — quá hay để bỏ)

| vị trí | buff |
|---|---|
| Đường Trên | hồi **1.5% máu tối đa mỗi giây** khi ngoài giao tranh |
| Rừng | **+20% tốc chạy** trong rừng khi ngoài giao tranh; **hành quyết** quái lớn khi máu ≤ 700 |
| Đường Giữa | **+20% kinh nghiệm** |
| Xạ Thủ | **+20% vàng** |
| Hỗ Trợ | **−30% kinh nghiệm, −15% vàng**; khi last-hit thì **đồng đội gần nhất nhận vàng** |

#### 6.5.3 Vòng lặp mô phỏng

Bước mô phỏng **10 lần/giây** (tick 100ms), vẽ ở 60fps bằng nội suy. Một trận 25 phút game = **90
giây thật ở tốc độ ×1**, tức tỉ lệ nén thời gian **1:16**. `[ĐỀ XUẤT]`

Mỗi tick, mỗi tuyển thủ chạy **cây quyết định** dựa trên chỉ số HLV + chỉ số tuyển thủ + chiến thuật:

```
1. Còn sống? → không: đếm giờ hồi sinh
2. Máu thấp + nguy hiểm gần?  → rút (ngưỡng theo LÌ và Mental)
3. Mục tiêu lớn sắp hồi sinh (theo NÃO: biết trước 0–20s)?  → tụ
4. Có kèo ăn được? (theo phán đoán)  → vào
5. Lính đông / đường trống?  → farm hoặc đẩy
6. Mặc định  → về vị trí theo chiến thuật
```

**Chỉ số đổi hành vi, không đổi số damage** — nguyên tắc bê thẳng từ TFM2. Ví dụ:

- **NÃO thấp** → tính sai thời điểm rồng, đi vào lúc đồng đội chưa hồi.
- **CƠ thấp** → tỉ lệ né chiêu thấp, hay ăn chiêu định hướng.
- **LÌ thấp** → khi đội thua 3 mạng liên tiếp, ngưỡng "rút" tăng vọt → chơi rúm.
- **BỀN thấp** → sau phút 20, mọi ngưỡng phản ứng chậm đi 15%.

#### 6.5.4 Tiền và đồ

- Lính thường **20 vàng**, lính pháo **50**, mạng **300 + thưởng chuỗi**, trụ **250 chia đội**.
- Mỗi tuyển thủ tự về nhà mua đồ khi đủ tiền cho món kế tiếp trong **hướng lên đồ** đã chọn.
- **5 tầng đồ** với `ghép từ / ghép thành` (theo TFM2). Ô đồ hiện ngay trên **bảng đối đầu**.
- **Bảng đối đầu** (góc phải trên) hiện: vị trí · tướng · 3 ô đồ · KDA · lính · **chênh vàng** giữa
  hai người cùng đường (mũi tên chỉ ai dẫn).

#### 6.5.5 Trình bày — cái làm người xem dính

Bắt buộc có, theo đúng ảnh TFM2:

1. **Lời thoại tuyển thủ** nổi góc dưới trái, tô màu theo người:
   *"Gank đường trên nhé"*, *"Không trụ nổi, lùi"*, *"Vào! Tập trung Xạ Thủ"*, *"Rồng sắp hồi"*,
   *"Thủ nhà!"*, *"Cần người!"*, *"Ăn trụ rồi rút"*. Câu chọn theo tình huống + tính cách tuyển thủ.
2. **Băng thông báo giữa màn** khi có mạng / ăn quái lớn: `Kiên hạ gục Long!` với 2 avatar.
3. **Số sát thương bay lên**: cam = vật lý, tím = phép, xanh = hồi máu, vàng = vàng nhận.
4. **VFX**: mỗi kỹ năng có hiệu ứng riêng (lấy từ kho HoloCure + Soul Knight, xem mục 9).
5. **Thanh trên cùng**: logo hai đội, tỉ số ván, tỉ số mạng, tổng vàng, số rồng/chúa hang/trụ, hẹn
   giờ buff.
6. **Điều khiển**: `0.5 / ×1 / ×2 / ×3 / ⚡bỏ qua`, `Ẩn bảng số`, `Tạm dừng`, `Xem kết quả luôn`.
7. **Minimap** góc phải dưới có khung camera.
8. **Nhảy camera** bằng cách chạm avatar tuyển thủ.

#### 6.5.6 Sau trận

Bảng kết quả kiểu TFM2:

- Tỉ số ván, thời lượng trận.
- 10 dòng tuyển thủ: avatar · **thanh sát thương** · `Điểm x.xx (K/D/A)` · vương miện **MVP**.
- Khối số: KDA tổng · vàng · trụ · rồng · chúa hang.
- **Biểu đồ chênh lệch vàng theo phút** (đường, có mốc sự kiện lớn).
- Nút `Tiếp ➜`.

---

## 7. Gacha

### 7.1 Hai banner riêng

| banner | ra gì | tỉ lệ |
|---|---|---|
| **Banner HLV** | HLV 3★ / 2★ / 1★ | 3% / 18% / 79%, rate-up **0.75%** |
| **Banner Tuyển Thủ** | thẻ SSR / SR / R | 3% / 18% / 79%, rate-up **0.75%** |

Lấy đúng số của Uma. **Quay 10 bảo đảm ≥ 1 cái bậc 2 trở lên.**

**Giá** `[ĐỀ XUẤT]` giữ đúng tỉ lệ Uma: **150 xu/lần, 1500 xu/10 lần**.

### 7.2 Pity — "đổi vé"

Mỗi lần quay được **1 vé**; **200 vé** đổi thẳng lấy cái đang rate-up. **Vé không cộng dồn sang
banner khác** (đúng luật Uma). Hiện **thanh vé `137/200`** ngay dưới nút quay — không giấu.

### 7.3 Uncap

Trùng → **uncap +1** (tối đa 4). Uncap mở:

- HLV: trần chỉ số +50 mỗi bậc, và **nâng cấp kỹ năng riêng** ở bậc 2 và 4.
- Tuyển thủ: trần cấp +5 mỗi bậc, và **mở hiệu ứng ẩn** ở bậc 4.

Trùng khi đã max → đổi thành **mảnh vạn năng**.

### 7.4 Trình bày

- Banner ảnh lớn, hai nút `Quay 1 · 150` và `Quay 10 · 1500`.
- Nút **"Xem tỉ lệ"** mở bảng đầy đủ — luật minh bạch, và cũng là chi tiết có trong ảnh Uma.
- Đoạn phim rút thẻ ngắn (bỏ qua được), rồi **lưới 2×5** kết quả với hiệu ứng sao.
- Cầu vồng = bậc cao nhất, vàng = bậc 2, bạc = bậc 3.

---

## 8. UI ngang — bố cục từng màn

Khung chung: **16:9**, thiết kế ở **1280×720 CSS**, co giãn theo `min(vw/16, vh/9)`. Vùng chạm tối
thiểu **44px**. Không có thao tác nào cần hai tay cùng lúc.

### 8.1 Màn chính (CLB)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [logo CLB]  Mùa 3 · Tuần 7      💰 12,400   🎟 5/5   Danh tiếng 84,200  │
├────────┬────────────────────────────────────────────────┬───────────────┤
│ MENU   │                                                │  THẺ HLV      │
│ dọc    │        Ảnh HLV đang nuôi + 5 tuyển thủ         │  đang chạy    │
│        │        (đứng thành hàng, có hiệu ứng thở)      │  + tiến độ ca │
│ Ca đấu │                                                │               │
│ Gacha  │                                                │  Việc hôm nay │
│ Đội    ├────────────────────────────────────────────────┤  ▸ [Vào ca]   │
│ Kho    │  Tin tức: "Đội X vừa mua tuyển thủ Y…"         │               │
│ Lịch   │                                                │               │
└────────┴────────────────────────────────────────────────┴───────────────┘
```

### 8.2 Màn huấn luyện (quan trọng nhất — bố trí lại Uma cho ngang)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Lượt 7/24 · Vòng bảng   Mục tiêu: Top 2 giải Xuân   [Chi tiết]           │
│ Thể lực ▓▓▓▓▓▓▓░░░ 68/100      Tâm trạng: TỐT ↑                          │
├──────────────┬─────────────────────────────────────┬─────────────────────┤
│ CHỈ SỐ       │   5 GIÁO ÁN (hàng ngang, ô lớn)     │  NHẬT KÝ            │
│ Cơ   B  812  │  ┌────┐┌────┐┌────┐┌────┐┌────┐     │  Cơ +18             │
│ Bền  C  640  │  │ CƠ ││BỀN ││LỰC ││ LÌ ││NÃO │     │  Lực +7             │
│ Lực  C  590  │  │Lv3 ││Lv2 ││Lv1 ││Lv2 ││Lv4 │     │  Điểm KN +2         │
│ Lì   D  455  │  │🌈👤││ 👤 ││    ││👤👤││ 👤!│     │  Thân thiết Kiên +7 │
│ Não  B  830  │  └────┘└────┘└────┘└────┘└────┘     │  ─────────────      │
│ Điểm KN 240  │   +18 +7        Hỏng: 0%            │  (cuộn lên xem cũ)  │
├──────────────┼─────────────────────────────────────┤                     │
│ 5 TUYỂN THỦ  │ [Tập] [Nghỉ] [Xả hơi] [Y tế]        │                     │
│ (avatar +    │ [Giáo án] [Giao hữu]                │                     │
│  thanh thân) │                                     │                     │
└──────────────┴─────────────────────────────────────┴─────────────────────┘
```

Chạm một giáo án = **xem trước** (hiện `+18 +7`, `Hỏng: 0%`, ai đứng ở đó, ai đang cầu vồng).
Chạm lần hai = **chốt**. Không có hộp xác nhận — chạm hai lần đã là xác nhận.

### 8.3 Màn ban/pick

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Giao trợ lý]      LƯỢT CẤM 3/8        Chọn một tướng để cấm  ➜  ⏱ 20s   │
├────────┬────────────────────────────────────────────────────────┬────────┤
│ ĐỘI TA │   Lưới tướng (5 hàng × 10 cột, cuộn dọc)  [Lọc: Tất cả]│ĐỘI BẠN │
│ 5 ô    │   ô có ⊘ = bị cấm, mờ = đã lấy, badge số = luật Không  │ 5 ô    │
│ (avatar├────────────────────────────────────────────────────────┤        │
│  + ô   │  CHI TIẾT TƯỚNG: chỉ số Lv1/mỗi cấp/Lv12 · 3 kỹ năng   │        │
│  tướng)│  + THÔNG THẠO của 5 người mình với tướng này (N…UR)    │        │
├────────┴────────────────────────────────────────────────────────┴────────┤
│ Đội Ta  ⊘⊘⊘  ·  Bo5 · Chung kết thế giới 2027 ·  ⊘⊘⊘  Đội Bạn            │
└──────────────────────────────────────────────────────────────────────────┘
```

Điểm khác TFM2 (và là điểm mạnh): **bảng thông thạo của cả 5 người hiện ngay dưới tướng đang xem**.
Trên điện thoại không có chỗ cho tooltip rê chuột, nên thông tin phải nằm sẵn.

### 8.4 Màn trận đấu

Giống sơ đồ ở mục 6.5.5. Trên màn hẹp (< 900px CSS), **bảng số thu thành tab** và mặc định ẩn — bản
đồ chiếm hết, đúng tinh thần nút `Hide Info UI` của TFM2.

### 8.5 Quy ước UI chung `[ĐỀ XUẤT]`

- **Không dùng rê chuột (hover) cho thông tin bắt buộc.** Mọi thứ quan trọng phải thấy hoặc chạm ra.
- **Một màn một việc.** Không nhồi hai quyết định lớn vào cùng màn.
- **Số phải có nhãn tiếng Việt**, không viết tắt tiếng Anh trừ tên tướng/vị trí đã quen.
- **Nút chính luôn ở góc phải dưới** (theo TFM2: `Proceed`).
- **Màu**: xanh lá = tốt/tiếp tục, đỏ = cấm/nguy, vàng = tiền/thưởng, cầu vồng = khoảnh khắc lớn.
- **Rung nhẹ** (`navigator.vibrate`) cho: nổ cầu vồng, ăn mạng, thắng trận. Tắt được.

---

## 9. Art, hiệu ứng, âm thanh

Nguồn (đã có sẵn trên máy, dùng như các game khác trong hub):

| dùng cho | kho | ghi chú |
|---|---|---|
| Chân dung HLV, tuyển thủ | `D:\HoloCureAssets\Sprites_by_Character` (22 nhân vật) | ảnh đứng + biểu cảm |
| Sprite trong trận | HoloCure `GameSprites` (3.363 tệp) + Soul Knight (10.894 tệp) | tướng, quái, lính |
| Hiệu ứng chiêu | HoloCure `Effects_VFX` + Soul Knight `_ab` | nổ, chém, băng, sét |
| Đồ đạc | Soul Knight vũ khí/vật phẩm | biểu tượng ô đồ |
| Nền bản đồ | Soul Knight `tilemap` (đã có luật đọc ở `games/repo2d/art/room/SOULKNIGHT-TILEMAP.md`) | ghép nền MOBA |
| Âm thanh | `~/Downloads/SFX` | click, thắng, mạng, cầu vồng |

**Luật đường ống** (theo `games/dragonproj`): trong code **không có tên tệp ảnh nào**, chỉ có khoá
kiểu `tuong.knight.idle`. Bảng ánh xạ nằm ở `art/asset-map.json`. Thiếu ảnh thì **tự rơi về hình
hình học** chứ không vỡ. Đổi art = thay PNG + sửa map, **không đụng code**.

---

## 10. Những chỗ chủ dự án chưa nêu — tôi bổ sung

Đây là phần "tự phân tích tìm thêm chỗ thiếu" mà chủ dự án yêu cầu.

### 10.1 Dạy chơi (tutorial)

Game này có **4 hệ thống chồng nhau** (gacha, nuôi, draft, sim). Ném hết một lúc là bỏ game. Kế
hoạch: **dạy rải ra 3 mùa đầu**.

- **Mùa 1** — chỉ có: tập, nghỉ, 1 giải Bo1. Không ban/pick (trợ lý làm hộ), không kế thừa. Mục tiêu
  duy nhất: hiểu "tập → chỉ số lên → thắng".
- **Mùa 2** — mở **ban/pick** (chỉ 2 ban) + **thông thạo tướng**. Mở **cầu vồng**.
- **Mùa 3** — mở **kế thừa**, **chiến thuật**, **giải thế giới**.
- Mỗi thứ mới có **một hộp thoại 2 câu** + **một mũi tên chỉ**, không có video, không khoá thao tác
  quá 1 bước.

### 10.2 Vì sao chơi tiếp (retention)

- **Nhiệm vụ ngày** (3 cái, xoay vòng): chạy 1 ca, quay 1 lần, thắng 1 trận.
- **Bảng thành tích mùa**: mỗi mùa để lại **hồ sơ cựu HLV** — người chơi thấy "gia phả" lớn dần.
- **Bảng xếp hạng ảo**: 24 đội AI có tên, có hồ sơ, có phong độ trôi theo mùa.
- **Meta trôi**: mỗi mùa game **tự buff/nerf 3–5 tướng** theo tỉ lệ thắng mùa trước (ý của TFM2).
  Có **bản tin cập nhật** đọc được → người chơi thấy thế giới sống.

### 10.3 Cân bằng và chống nhàm

- **Sức mạnh tối đa của một ca có trần**: chỉ số 1200 + kỹ năng. Đội AI ở giải thế giới cũng gần
  trần → thắng phải nhờ **draft và chiến thuật**, không phải nhờ cày.
- **Ngẫu nhiên có kiểm soát**: mọi tỉ lệ đều hiện số. Không có "may rủi giấu mặt".
- **Không pay-to-win tuyệt đối**: thẻ SSR mạnh hơn nhưng thông thạo tướng thì **cày mới có**.

### 10.4 Lưu và đồng bộ

- Lưu vào `localStorage` với khoá `ghenong.save.v1`, có **số phiên bản save**.
- Nối vào `window.HubSave` của hub (xem `games/BRIDGE.md`) để đồng bộ đám mây khi có tài khoản; không
  có thì chạy offline y nguyên.
- **Tự lưu sau mỗi lượt** và sau mỗi trận. Không có nút "Lưu".

### 10.5 Hiệu năng trên điện thoại

- Mô phỏng chạy trong **vòng lặp cố định 10Hz**, tách khỏi vẽ.
- Ba mức mô phỏng như TFM2: **Nhẹ** (bỏ hoạt ảnh, chỉ log + biểu đồ) · **Vừa** · **Đầy đủ**.
- Máy yếu tự hạ xuống Nhẹ nếu khung hình < 30fps trong 3 giây.
- Tổng tài nguyên ảnh nén **dưới 6 MB** cho lần tải đầu; sprite trận nạp trễ.

### 10.6 Âm thanh

Thiếu tiếng là game chết một nửa (xem bài học `chuyen-tau` trong repo: gọi `onSfx` 14 chỗ nhưng chưa
ai gán → im lặng suốt). Ở đây: **định nghĩa bảng tiếng trước, gắn sau, nhưng gắn ngay trong giai
đoạn 3** chứ không để cuối.

### 10.7 Chống mất mùa oan

Uma cho "đứt ca" là hết. Ở đây `[ĐỀ XUẤT]` thêm **1 "vé cứu"** mỗi mùa: thua mục tiêu một lần thì
được đá lại trận đó. Lý do: trên di động, thua vì bấm nhầm là bỏ game.

---

## 11. Lộ trình dựng

| giai đoạn | nội dung | trạng thái |
|---|---|---|
| 0 | Nghiên cứu + ảnh + tài liệu (`RESEARCH.md`, `DESIGN.md`) | **xong** |
| 1 | Khung game: dữ liệu tướng/HLV/tuyển thủ, lưu, khung màn ngang | |
| 2 | Vòng huấn luyện đủ: 5 giáo án, thể lực, tâm trạng, hỏng, cầu vồng, sự kiện, nhật ký | |
| 3 | Ban/pick + giao tướng + chiến thuật | |
| 4 | Mô phỏng trận + trình bày (bản đồ, lời thoại, VFX, biểu đồ) | |
| 5 | Gacha 2 banner + uncap + kho | |
| 6 | Kế thừa, spark, gia phả | |
| 7 | Mùa giải, BXH 24 đội AI, meta trôi, tin tức | |
| 8 | Dạy chơi, âm thanh, đánh bóng, tối ưu di động | |

Mỗi giai đoạn **chơi được** ở cuối giai đoạn đó, và đẩy lên Pages để chủ dự án bấm thử.
