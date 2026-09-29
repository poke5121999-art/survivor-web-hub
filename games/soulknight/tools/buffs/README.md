# Buff, tượng, giếng ước, lái buôn, đồ rơi: số thật từ 8.6.0

`build_buffs86.py` gộp dữ liệu giải mã (`D:\sk86-ref\decoded`, xem `tools/config86/README.md`) thành `data/sk-buffs86.js`
(`window.SK_BUFFS86`), rồi `js/rooms.js` chạy luật. Chạy lại:

```sh
PYTHONIOENCODING=utf-8 python games/soulknight/tools/buffs/build_buffs86.py     # vài giây
```

`index.html` phải nạp `data/sk-buffs86.js` TRƯỚC `js/rooms.js` (không có thì rooms.js cảnh báo và dùng số dự phòng rỗng).
Icon buff (`ui_buff_*`) và prefab tượng/lái buôn/xu đi qua `tools/extra/rooms.json` (lever `build_sk.py`).

## `SK_BUFFS86`

| Khoá | Nội dung |
|---|---|
| `buffs[BuffId]` | `{key, id, name{en,vi}, info{en,vi}, upg, icon, pool}`; tên/mô tả từ `localization_en_vi.json` (`Buff_name_<BuffId-1>` với BuffId < 1000, còn lại giữ nguyên số) |
| `groups` | 5 nhóm `TG_level1/2/3/3_volcano/3_alien` = `[[BuffId, trọng số]]` từ `luban/pseudorandom_tbtalentgroups` |
| `levels` | `levels[cấp 1..15][nhánh A|B|C|G]` = tên nhóm, từ `pseudorandom_tbnooblevels` (cấp = `stageIdx + 1`) |
| `values` | số đọc bằng regex từ mã Lua: Hút Sinh Lực 15, chém xoáy (cd 4, 8 sát thương, cỡ 5,25, đẩy 3), động năng, bloodrage 0,3/70... |
| `statues` | tên và mẫu mô tả 10 tượng (cd, số viên đọc ở prefab `buff_statue_N` lúc chạy) |
| `shop`, `randomObjects` | bể `random_objects`: cửa hàng (`sell2-1` 16, `sell2-2` 16, `sell1-2` 16, `sell1-3` 1, `sell1-1-2` 2, ...), bình (thường 5 : lớn 1), tượng (10 tượng, cùng trọng số) |
| `weaponValue` | `weapon_NNN` → `item_value` gốc (giá vũ khí ở cửa hàng) |
| `price` | `{from: 4, per: 0.12, cap: 198, sale: 0.5}`, công thức ở dưới |
| `drops` | xu `coin_0/1/2` = 5/3/1 vàng, cầu năng lượng 8 |
| `well` | tối đa 50 lượt, chuỗi thưởng từ lượt 28..35 |

## Điều đã đo (và cái bẫy)

- **BuffId = thứ tự trong enum `emBuff`** (`il2cpp/types.txt`; `MasterThough` = 1). Biểu tượng `ui_buff_<BuffId>`. Tên tiếng Việt
  ở `Buff_name_<BuffId - 1>` (lệch 1 vì `None` = 0). Đọc nhầm là lệch tên/biểu tượng một ô.
- **Bể buff giữa ải**: mã chọn nằm trong IL2CPP, không đọc trọn. Dữ liệu duy nhất theo cấp là `pseudorandom_tbtalentgroups` (+
  `tbnooblevels` gán cấp → nhóm). Tầng 1 (cấp 1..5) = `TG_level1` (40 buff, không có Mở Rộng Túi/Tượng Nhân Đôi/Giáp Đi Nhanh);
  cấp 6..10 = `TG_level2`; cấp 11..15 = `TG_level3` (nhánh núi lửa nhân Khiên Lửa ×10, nhánh alien nhân Khiên Chống Độc ×10).
  Số thẻ (3), 7 ô và các ải có buff lấy từ wiki [WIKI]; dữ liệu giải mã không có.
- **Giá cửa hàng** = `RGContainer.CalculateItemValue` @0x31410bc: `gốc + int(gốc × f)`, `f = (cấp − 2) × 0,12` khi `cấp ≥ 4` và
  `gốc ≤ 198` (cấp = `GetRelativeLevelIndex`, 1-1 = 1); Giảm Nửa Giá trừ 0,5 vào `f`. **Phải tính bằng float32**:
  `0,12f = 0,11999999732`, nên 25 × 5 × 0,12 ra 14,9999991 → 14 và giá 2-2 là 39 như bảng wiki, không phải 40. Kiểm
  bằng `test/soulknight-rooms.js` (14 ô bình máu/năng lượng khớp bảng wiki). Giá tượng là công thức khác (hệ số 0,1, trần 30) khớp 13/13 ô wiki.
- **Đồ rơi của quái** = `RGEController.GetReward` @0x7205ba4: hai lần `RGRandom.Range(0,100)` độc lập so với `reward_rate`.
  Lần 1 → `reward_value[3]` cầu năng lượng (8 năng lượng); lần 2 → `reward_value[i]` xu prefab `coin_i` (i = 0,1,2 ↔ 5, 3, 1 vàng,
  `RGCoin.value`). Lõi cũ tung một lần cho cả hai và coi mọi xu là 1 vàng. `config/enemies.Drops` chỉ là vật liệu/hạt giống ngoài ván.
- **Giếng ước** (`ItemWishingWell..cctor`: mảng tĩnh `{5, 50}`; `Start`: `Range(28, 36)`): 50 lượt, chuỗi thưởng bắt đầu ở lượt ngẫu nhiên
  28..35, `item_value` 1 đi qua công thức giá (thành 2 từ 3-1). Xác suất trước chuỗi cuối và cơ cấu đồ là [ƯỚC LƯỢNG].
- **Phòng**: `map_level_base` — rương: `r_chest` 2 : `r_sell` 2 (từ chỉ số 2, tức 1-3) : `r_chest_battery` 1 (từ 3);
  `r_buff_merchant_guarentee` 999 từ chỉ số 9 (2-5). Đặc biệt: `r_statue` 100 : `r_weapon_provider` 150, trong đó giếng ước
  `wishing_well` 1/~11 trọng số hợp lệ.
- **Lái buôn Thiện Lương**: `ball_buff_honest.defaultBuffPool` = BuffId 8, 9, 23, 40 giá 1 (giáp; `currencyType 100`). Lái buôn Gian Xảo
  (BuffId 45, 46, 2127...) không có tên trong loc nên chưa làm.
- Dựa lại số máy: `tools/config86/arm_method.py` dừng ở lệnh `pop pc` đầu tiên; hàm có khối ngoài dòng (như `GetReward`) cần bản
  không dừng (`D:\sk86-ref\work\buffs\arm_full.py`, chỉ bỏ điều kiện dừng).

## Buff chưa dùng được (có trong bể thật, không đưa lên bảng chọn)

Thợ Mỏ Đá Quý (đá quý), Bạn Tốt Nhất và Thời Gian Party (thú cưng/tùy tùng), Khiên Băng Giá (đóng băng), Luân Chuyển Nguyên Tố và
Bảo Hộ Linh Hồn (trạng thái nguyên tố), Liên Kích Mưa (vũ khí liên kích), Âm Dương Lưu Chuyển (riêng một nhân vật),
Nhà Mỹ Thực (nguyên liệu). Lý do nằm ở `OFF` trong `js/rooms.js`; bỏ khỏi `OFF` và viết luật là được đưa lên bảng.
