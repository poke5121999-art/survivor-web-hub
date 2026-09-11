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

| chỉ số | tên đầy đủ | ảnh hưởng trong trận | chỗ cài trong `sim.js` |
|---|---|---|---|
| **CƠ** | Cơ bản / thao tác | né chiêu, thoát khống chế, hồi chiêu nhanh, **+0…12% tốc đánh** | `heCo()`, và ba ngưỡng né/gỡ |
| **BỀN** | Thể lực | **+0…14% máu**, và **chống tụt sức**: từ phút 18, BỀN thấp mất tới 25% sức đánh | `heBen()`, `heCuoiTran()` |
| **LỰC** | Sức đánh | **±14% sát thương** gây ra và **±8% tốc farm** (vàng từ lính) | `heLuc()`, nhánh lính trong `xuLyChet()` |
| **LÌ** | Bản lĩnh | ngưỡng về nhà, dám ở lại 1v1, không co rúm khi thua đậm | ba ngưỡng trong `chonHanhDong()` |
| **NÃO** | Tư duy | đếm quân đúng, biết trước quái lớn, nghe lệnh, đọc trận để mua đồ | `ngheLenh()`, `thayDung`, `biet`, `G.nghiDo` |

> **Biên của chỉ số phải hẹp.** Cả năm cộng lại chỉ đổi được ±14% "số", còn lại là đổi **quyết
> định** — đúng nguyên tắc của Teamfight Manager. Nhưng hẹp **không có nghĩa là bỏ**: bản đầu tiên
> quên cài LỰC và BỀN, và đo ra thì cả một mùa nuôi quân gần như không đổi được kết quả trận
> (chỉ số lệch hết cỡ vẫn chỉ thắng 16/20). Xem `RESEARCH.md` §4.2.

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
| **N** | ×0.90 | chưa từng tập, hay lỗi thao tác |
| **R** | ×0.95 | biết chơi |
| **SR** | ×1.00 | chuẩn |
| **SSR** | ×1.06 | tủ |
| **UR** | ×1.12 | **tướng ruột**, có thêm hiệu ứng riêng của tuyển thủ |

> Thang này **thu lại** từ `0.82 … 1.22` sau khi đo: với thang cũ, một dòng bảng thông thạo
> đáng hơn cả 24 lượt huấn luyện (UR gặp N thắng 20/20, chỉ số lệch hết cỡ chỉ thắng 16/20).
> Đội máy cũng chỉ thạo theo **bậc giải** — giải đầu tiên không được phép ai cũng có tướng UR.
> `RESEARCH.md` §4.2.

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

### 7.3 Mảnh trùng và mở trần (Uma: `上限解放`)

Quay trúng người đã có thì **không tự dùng**: bản trùng thành **một mảnh ◆** nằm trong kho
(Uma gọi kho ấy là `保管室`, và màn kết quả quay ghi hẳn dòng *"thẻ đã có sẽ được gửi vào kho
chứa"*). Người chơi tự mang mảnh sang màn **Nuôi thẻ** mà tiêu.

**Bốn bậc, mỗi bậc ăn đúng một mảnh** — bằng số bậc và bằng giá của Uma:

- Tuyển thủ: trần cấp **+5** mỗi bậc (R 30→50 · SR 35→55 · SSR 40→60), và bậc 4 mở thêm
  **hiệu ứng ẩn +8% thân thiết · +6% hiệu quả tập**.
- HLV: trần cả năm giáo án **+50** mỗi bậc, và **kỹ năng riêng mạnh lên** ở bậc 2 (**+15%**)
  và bậc 4 (**+20%** nữa) — `G.heKNRieng`. Ở Uma, nâng sao cho ngựa vừa cộng chỉ số nền vừa
  làm kỹ năng riêng mạnh lên, nên bậc trần ở đây phải chạm được vào cả hai. Dòng "nâng cấp
  kỹ năng riêng ở bậc 2 và 4" nằm trong tài liệu này từ đầu mà **không chỗ nào đọc** cho tới
  đợt này — đúng cái lỗi lặp đi lặp lại của kho (`RESEARCH.md` §6).
- Mở hết bốn bậc rồi thì mảnh thừa **đổi lấy xu** (200 tuyển thủ · 300 HLV).

Vì sao không tự cộng như bản đầu: tự cộng thì người chơi không bao giờ gặp cái quyết định
"dồn mảnh cho ai trước", và cả hệ thống hiện ra bằng đúng một mẩu chữ `✦2` ở góc thẻ mà không
ai đoán nổi nghĩa. Xem `RESEARCH.md` §1.14 cho ảnh gốc và số đo.

### 7.4 Trình bày

- Banner ảnh lớn, hai nút `Quay 1 · 150` và `Quay 10 · 1500`.
- Nút **"Xem tỉ lệ"** mở bảng đầy đủ — luật minh bạch, và cũng là chi tiết có trong ảnh Uma.
- Đoạn phim rút thẻ ngắn (bỏ qua được), rồi **lưới 2×5** kết quả với hiệu ứng sao.
- Cầu vồng = bậc cao nhất, vàng = bậc 2, bạc = bậc 3.

---

## 8. UI ngang — bố cục từng màn

Khung chung: **16:9**, thiết kế ở **1280×720 CSS**, co giãn theo `min(vw/16, vh/9)`. Vùng chạm tối
thiểu **44px**. Không có thao tác nào cần hai tay cùng lúc.

### 8.1 Màn ngoài run — đúng bộ nút của màn Home Uma

Màn ngoài **không phải** một app quản trị có menu dọc. Uma Home có đúng chừng này nút, và
Ghế Nóng có đúng chừng ấy — không thêm một nút nào (`RESEARCH.md` §1.12):

```
┌────────────────────────────────────────────────────────┬───────────────┐
│ [F 0] [GN] CLB Ghế Nóng  Mùa 3        💰12,400 🎟5/5 ❤️84k │  PANEL       │
├────────────────────────────────────────────────────────┤  đổi theo     │
│                                                        │  ngữ cảnh:    │
│          nội dung trang đang mở                        │  Hướng dẫn ·  │
│          (Nhà = người đứng giữa sân, không bảng biểu)  │  Spark ·      │
│                                                        │  Đội hình     │
├────────────────────────────────────────────────────────┤               │
│  ◯Huấn.viên ◯Sổ tay ◯Cài đặt          ┌──────────────┐ │               │
│  ── ba nút tròn ──                    │   VÀO CA     │ │               │
│                                       │ một mùa 24 lượt│               │
├───────┬───────┬─────────┬───────┬─────┴──────────────┴─┤               │
│ Nuôi  │ Gia   │  NHÀ    │ Giải  │ Tuyển mộ             │               │
│ thẻ ③ │ phả   │ (to,xanh)│ đấu  │                      │               │
└───────┴───────┴─────────┴───────┴──────────────────────┴───────────────┘
      ── thanh dưới: ĐÚNG NĂM nút, nút giữa to hơn ──
```

- **5** nút thanh dưới · **3** nút tròn · **1** nút CAREER đứng riêng. `VÀO CA` **không**
  nằm trong thanh năm nút — đó là cách Uma nói "đây là việc chính" mà không cần chữ.
- Chấm đỏ trên **Nuôi thẻ** đếm số thẻ đang mở trần được (Uma gắn chấm ấy lên `メニュー`).
- Bấm VÀO CA thì vào **luồng bốn bước** (thể thức → HLV → cựu HLV → đội hình), thanh năm nút
  vẫn nằm đó, ba nút tròn biến mất, và chỗ nút CAREER thành chân bước
  `[‹ Quay lại] … [Tiếp / Xác nhận / BẮT ĐẦU CA!]`.
- Trong ca thì màn ngoài **biến mất hẳn**. Bảng xếp hạng mùa chỉ sống bên trong một ca
  (`RESEARCH.md` §1.13).

**Trang `Nuôi thẻ` = cửa `強化編成` của Uma**: một hàng **ba tab** — Tuyển thủ · Huấn luyện
viên · Gia phả — đúng ba lối của Uma (`サポートカード` · `育成ウマ娘` · `殿堂入りウマ娘`).
Ba tab ấy chính là ba trang đã có của thanh dưới/nút tròn, nên bấm tab cũng là đổi trang và
nút dưới sáng theo; không có biến "tab đang mở" thứ hai để mà lệch.

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
│ 5 TUYỂN THỦ  │ [Nghỉ] [🏋️ TẬP 🌈] [Kỹ năng]        │                     │
│ (avatar +    │ [Y tế] [Xả hơi] [Giao hữu]          │                     │
│  thanh thân) │        ── SÁU nút ──                │                     │
└──────────────┴─────────────────────────────────────┴─────────────────────┘
```

**Hai lớp nút, không bày cùng lúc.** Mặc định là **sáu** nút việc (Uma: Rest · Training ·
Skills / Infirmary · Recreation · Races), nút `Tập` nằm giữa hàng trên và có vòng vàng vì đó
là việc làm nhiều nhất. Bấm `Tập` thì cả sáu **biến mất**, thay bằng **năm sân** trên một hàng
kèm nút `↩ Quay lại`, và nhãn góc trên trái đổi `Ca huấn luyện` → `Tập luyện`
(`RESEARCH.md` §1.2, ảnh `uma/key/w_285.jpg` so với `w_435.jpg`).

Bản trước dàn cả mười nút cùng lúc — nhìn thì tưởng đầy đủ, nhưng nó xoá mất nhịp *"chọn việc
→ chọn sân"* và chiếm hết chỗ của khung cảnh. Để không biến nút `Tập` thành một cái cửa mù,
nó mang **chấm 🌈** khi có sân nào đang nổ cầu vồng.

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
| 1 | Khung game: dữ liệu tướng/HLV/tuyển thủ, lưu, khung màn ngang | **xong** |
| 2 | Vòng huấn luyện đủ: 5 giáo án, thể lực, tâm trạng, hỏng, cầu vồng, sự kiện, nhật ký | **xong** |
| 3 | Cấm chọn + chiến thuật | **xong** (chưa có bước giao tướng riêng — vị trí khoá cứng nên chọn tướng đã là giao người) |
| 4 | Mô phỏng trận + trình bày (bản đồ, lời thoại, VFX, biểu đồ) | **xong** |
| 5 | Gacha 2 banner + uncap + kho | **xong** |
| 6 | Kế thừa, spark, gia phả | **xong** |
| 7 | Mùa giải, BXH 24 đội AI, meta trôi, tin tức | bảng xếp hạng + tin tức **xong** (§12); meta trôi để sau |
| 8 | Dạy chơi, âm thanh, đánh bóng, tối ưu di động | dạy chơi và âm thanh **xong**; còn đánh bóng |

### Việc còn lại, xếp theo mức đáng làm

1. ~~Bảng xếp hạng và tin tức~~ — **xong**, xem §12.
2. ~~Nuôi thẻ tuyển thủ~~ — **xong**, xem §13.
3. ~~Nền bản đồ trận~~ — **xong**, xem §14.
4. **Meta trôi**: mỗi mùa tự buff/nerf 3–5 tướng theo tỉ lệ thắng mùa trước, kèm bản tin cập
   nhật. Chủ dự án chốt: **để sau**, và sệ dùng để buộc người chơi đổi huấn luyện viên +
   tuyển thủ giữa các mùa. `_tools/canbang.js` đã có sẵn cách đo.
5. ~~Ba buff vị trí còn thiếu~~ — **xong**, đủ cả sáu buff của TFM2; bảng chỗ cài ở
   `RESEARCH.md` §2.16.
6. ~~Hiệu ứng chiêu~~ — **xong**, xem §15.
7. **Vé chơi (`ve`)** khai báo trong bản lưu nhưng chưa dùng để giới hạn gì.
8. **Đồng bộ đám mây** qua `window.HubSave` — mã đã sẵn, chưa gắn.
9. **Ô đồ thứ sáu**: một người chỉ giữ được năm món (mỗi nhánh một món, mua tầng sau thay
   tầng trước). Muốn có ô thứ sáu thì phải cho giữ hai món cùng nhánh — đổi luật ghép, không
   chỉ đổi con số.

Mỗi giai đoạn **chơi được** ở cuối giai đoạn đó, và đẩy lên Pages để chủ dự án bấm thử.

---

## 12. Mùa giải: 24 đội, bảng xếp hạng, bản tin

### 12.1 Vì sao phải có

Chủ dự án: *"cần thể hiện rõ để tạo tính cạnh tranh"*. Đúng vấn đề: 24 đội máy bản đầu chỉ là
một con số `suc` trong `data-giai.js`, gặp xong rồi biến mất. Người chơi không biết mình đứng
thứ mấy, không biết Hổ Xám đang thắng mấy trận liền, nên thắng một giải cũng chẳng có cảm giác
gì. **Thứ tạo ra cạnh tranh không phải trận đấu, mà là cái bảng người ta soi trước và sau mỗi
trận.**

### 12.2 Hai khu, 24 đội

| khu | số đội | vai trò |
|---|---|---|
| `vn` quốc nội | 11 đội + CLB người chơi = **12** | đá vòng tròn suốt mùa, 4 suất đi chung kết thế giới |
| `qt` quốc tế | **13** | chỉ gặp ở CKTG, nhưng có bảng riêng chạy song song |

Mỗi đội có `sao` (tên ngôi sao) và `tieu` (một câu nhận diện) — hai trường này là thứ biến một
cái tên thành một đối thủ. `tieu` dùng ở cả bản tin và báo cáo trước trận.

### 12.3 Lịch: vòng tròn, ba lượt một vòng

Lịch dựng bằng **phương pháp vòng xoay** (circle method): n đội → n−1 vòng, mỗi vòng mỗi đội đá
đúng một trận, số đội lẻ thì mỗi vòng có một đội nghỉ. Một vòng chạy **cứ ba lượt tập một lần**
→ 24 lượt ra 8 vòng, **đúng bằng 8 giải của người chơi**, nên điểm trên bảng so được với nhau.

> Bản đầu ghép cặp ngẫu nhiên mỗi vòng và bảng thành vô nghĩa: hết mùa có đội đá 7 trận, đội khác
> đá 18 trận, và Mèo Đá yếu nhất giải lại đứng hạng 5 chỉ vì được ra sân nhiều. Một cái bảng
> không công bằng thì không ai soi.

Trận của máy với nhau **không dựng trận thật** — tính bằng thang Elo (`150` điểm sức = gấp mười
lần cửa) rồi chạy Bo3 bằng số. Rẻ tới mức chạy mỗi lượt cũng không thấy. Thang 220 làm bảng quốc
tế phẳng dính (đội mạnh nhất và yếu nhất cùng 3 thắng), nên chốt 150.

### 12.4 Bản tin sinh từ chuyện đang xảy ra

Không có tin viết sẵn. Bốn nguồn:

1. **Gây sốc** — đội yếu hơn 60 điểm sức mà thắng.
2. **Phong độ** — chuỗi bốn thắng hoặc bốn thua (mỗi đội mỗi mùa chỉ kể một lần).
3. **Chuyển nhượng** — từ vòng 3 trở đi, 34% mỗi vòng: một đội ký ngôi sao của đội khác cùng khu.
   Việc này **đổi `suc` thật**: đội mua +10…26, đội bán −80% con số đó. Nên bảng xếp hạng trôi
   thật chứ không chỉ đọc cho vui. Đây cũng là chỗ sau này gắn meta trôi vào.
4. **CLB của ta** — mỗi giải người chơi đá xong, kèm hạng mới sau trận đó.

### 12.5 Chỗ nhìn thấy

- Màn CLB, tab **Bảng xếp hạng**: bảng ở giữa, khung đọc tin ở cột phải (đúng bố cục Rankings +
  News của TFM2, `RESEARCH.md` §2.15). Bốn tab: Quốc nội · Quốc tế · Bản tin · Lịch của ta.
- **Trong phòng tập**: hai nút trên thanh mục tiêu — hạng hiện tại (`Hạng 9/12`) và `Bản tin` có
  đếm tin chưa đọc. Để tận màn CLB thì người chơi chỉ xem mỗi mùa một lần và 24 đội kia lại thành
  vô hình như cũ.
- **Báo cáo trước trận**: đối thủ đang hạng mấy, phong độ 5 trận, và câu `tieu` của họ.
- **Kết mùa**: ta hạng mấy, ai vô địch quốc nội, ai đứng đầu thế giới.

---

## 13. Nuôi thẻ tuyển thủ

`hesoCap` nội suy hiệu ứng thẻ từ **40% ở cấp 1 tới 100% ở cấp trần**, mà bản đầu không có chỗ
nào lên cấp — nghĩa là mọi thẻ trong game đều chạy ở 40% sức. Hai đường lên cấp, và cả hai đều
phải có vì chúng trả lời hai câu khác nhau:

| đường | trả lời câu | tính chất |
|---|---|---|
| **Xu** — thuê chuyên gia kèm | *"tôi có 2000 xu, tiêu vào đâu?"* | chủ động, tức thì, giá hiện rõ |
| **Kinh nghiệm** — chạy hết một mùa | *"chạy mùa nữa để được gì?"* | không mua được, thắng nhiều giải thì ăn dày |

Giá một cấp: `(30 + cấp × 7) × hệ bậc` (R ×1, SR ×1.15, SSR ×1.35). Thẻ R từ cấp 1 lên trần 30
tốn ≈ 3.900 xu — một mùa thắng đủ giải được ≈ 9.350 xu, tức **hai thẻ mỗi mùa**, đủ chậm để phải
chọn nuôi ai. Kinh nghiệm hết mùa: `120 + 55 × số giải thắng + 60 nếu không đứt mùa`, chia cho cả
năm người trong đội hình.

Hộp thoại nuôi thẻ **luôn hiện bảng "trước → sau"** của từng dòng hiệu ứng. Không để người chơi
tiêu 3.900 xu rồi tự đoán mình được gì.

Trần cấp do bậc thẻ và số bậc mở trần quyết định (`tranCap`: R 30 · SR 35 · SSR 40, cộng 5 mỗi
bậc), nên tới trần rồi thì đường duy nhất là quay trúng thẻ đó lần nữa lấy mảnh.

**Hộp nuôi thẻ có hai tab** — `Lên cấp` và `Mở trần` — dựng theo màn `Lv強化` / `上限解放` của
Uma, và **bảng bốn bậc trần luôn hiện ở cả hai tab**. Đây là chi tiết đáng chép nhất của màn
ấy: đang bấm tiêu xu lên cấp thì vẫn nhìn thấy trần tiếp theo nằm ở cấp mấy và còn cách bao xa,
nên không bao giờ dồn xu vào một thẻ đã sát trần mà không biết.

Chỗ **không khớp** với Uma: Uma lên cấp thẻ bằng cách cho thẻ khác ăn; ở đây là xu và kinh
nghiệm. Giữ nguyên, vì kho thẻ của Ghế Nóng nhỏ hơn Uma rất nhiều — bắt ăn thẻ khác thì hết
thẻ xếp đội. Phần chép 100% là **mở trần**: bốn bậc, một mảnh một bậc, bảng bậc luôn thấy.

---

## 14. Bản đồ trận: vẽ thành hình thoi

Chủ dự án: *"Nền bản đồ trận phải làm kỹ cho rõ là map 3 lane, rừng"*.

Bộ mô phỏng dùng toạ độ vuông 0..1000 với hai nhà ở hai góc đối nhau. Vẽ thẳng ra thì được một
hình vuông 566×566 nằm giữa khung 830×566 — hai bên đen thui, và ba đường chồng chéo nhau nhìn
không ra đường nào.

**Xoay 45°**: lấy `u = (x−y)/1000` làm trục ngang, `v = (x+y)/2000` làm trục dọc. Mọi thứ vào
đúng chỗ:

- hai nhà nằm ở **đỉnh trái và đỉnh phải** → dùng hết chiều ngang của màn ngang
- **đường giữa** thành một đường ngang chạy giữa màn
- **đường trên** vòng lên trên, **đường dưới** vòng xuống dưới → thấy ngay là ba đường
- **sông** chạy dọc giữa, cắt ngang đường giữa; hai con quái lớn nằm đúng trên sông
- **bốn vạt rừng** rơi vào bốn góc của hình thoi

Đây cũng là cách mọi bản đồ MOBA được vẽ trên minimap, nên không ai phải học lại cách đọc.
`toaDoMini` dùng đúng phép xoay ấy — hai hình khác hướng nhau thì minimap thành vô dụng.

Nền là **tĩnh**, nên vẽ một lần vào canvas riêng rồi dán lại mỗi khung; chỉ dựng lại khi đổi cỡ.
Vẽ lại cả trăm cái cây mỗi khung thì tụt xuống 20 khung/giây.

Chín lớp, theo thứ tự: sàn sân khấu tối ngoài hình thoi → mặt đất có vệt cỏ → bốn vạt rừng tối →
sông và gợn nước → hố hai con quái lớn → ba đường (vai tối rồi lòng đường sáng) → bụi rậm → sân
nền hai nhà → cây → viền và chữ chỉ đường (`ĐƯỜNG TRÊN/GIỮA/DƯỚI`, `RỪNG` ×4, `CHÚA HANG`,
`RỒNG`, `NHÀ TA`, `NHÀ ĐỊCH`).

> Cây phải đứng **trong** bốn vạt rừng và cách đường ít nhất 132 đơn vị. Bản đầu rải 150 cây khắp
> bản đồ với khoảng cách 78, chụp ảnh ra thì cây phủ lên cả ba đường và che mất người — **nền đẹp
> mà không đọc được trận thì vô dụng**.

---

## 15. Art: lấy ở đâu, ghép thế nào

Toàn bộ art là **sprite thật**, không có hình học vẽ tay nào còn sót trong đường vẽ chính.
Hai kho nguồn, cả hai **ngoài git**:

| kho | dùng cho |
|---|---|
| `D:\HoloCureAssets\GameSprites` | 20 tướng, chân dung huấn luyện viên và tuyển thủ |
| `~/Downloads/sk-ref` (Soul Knight 8.5.1) | trụ, lính, quái rừng, đạn, hiệu ứng, 20 trang bị, nền phòng tập |

Bảy atlas, sinh bằng `python _tools/build_art.py`:

| tệp | nội dung | ô |
|---|---|---|
| `tuong.png` | 20 tướng × 4 khung | 64, canh đáy-giữa |
| `nguoi.png` | 15 HLV + 24 tuyển thủ | 64, canh đáy-giữa |
| `quai.png` | 2 loại lính, 4 loại bãi quái, Rồng, Chúa Hang | 64, canh đáy-giữa |
| `tru.png` | trụ · nhà · lõi, mỗi thứ hai màu | 64, canh đáy-giữa |
| `dan.png` | 6 loại đạn, đầu chĩa sang phải | 64, canh tâm |
| `fx.png` | 10 hiệu ứng | 64, canh tâm |
| `do.png` | 20 trang bị | 64, canh tâm |
| `nen-ca.png` | nền phòng tập cho màn huấn luyện | 1280 rộng |

**Luật không đổi**: trong code không có tên tệp ảnh nào, chỉ có khoá kiểu `tuong.kiemsi`.
Bảng tra ở `art/asset-map.js`. Thiếu ảnh thì mọi hàm vẽ trả `false` và chỗ gọi tự rơi về
hình học cũ — game không bao giờ vỡ vì thiếu art.

Ba chi tiết phải nhớ khi thêm art mới (chi tiết và cách sập ở `RESEARCH.md` §5.3):

1. Sprite gốc chỉ 18–22px, phải **phóng cho gần đầy ô**, và một hệ số chung cho cả bộ khung.
2. Atlas nào cũng xếp **cột = khoá, hàng = khung** — kể cả `fx.png`.
3. Ảnh dán vào thẻ HTML phải **cắt bỏ mép trên** (build_art đo sẵn và ghi vào asset-map) rồi
   **kéo ngang vào giữa**, không thì nhân vật nằm dưới đáy và lệch ra ngoài khung.

---

## 16. Hai thế giới màu

Game có hai nửa lấy từ hai nguồn khác nhau, và mỗi nửa giữ nguyên bảng màu của nguồn:

| nửa | màn | bảng màu |
|---|---|---|
| **nuôi quân** — Uma Musume | CLB, tuyển mộ, huấn luyện, bảng xếp hạng | SÁNG: nền `#dfe8f5`, thẻ trắng bo 14px có gờ dưới, tiêu đề dải xanh `#4962a2`, nút chính xanh lá `#6ec409`, nhấn hồng `#e5548c` |
| **thi đấu** — Teamfight Manager 2 | cấm chọn, chiến thuật, trận đấu | TỐI: nền `#0b0f14`, viền `#26303f`, chữ `#c8d3e0` |

Mọi màu ở nửa sáng **đo trực tiếp** trên ảnh Steam của Uma
(`~/Downloads/esport-ref/uma/steam/shot05.jpg`, `sheets_guide/sheet001.jpg`) — không tự chọn.

Hộp thoại phải theo màu của màn đang mở: `G.hop({ sang: true })` cho nửa sáng. Mở hộp trắng
trên màn trận thì trông như cửa sổ của một game khác. Bảng xếp hạng xuất hiện ở cả hai nửa
nên `.bx-*` có **hai bản**: bản tối là gốc, bản sáng ghi đè dưới `#man-clb` và `.hop.sang`.

Điều hướng cũng khác nhau theo nguồn: nửa Uma dùng **hàng nút lớn ở đáy** (Uma không có menu
dọc), nửa TFM2 dùng thanh trên + cột phải như bản gốc.
