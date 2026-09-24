# Hố Xanh: một ngày trọn vòng (2026-09-24)

Chủ dự án muốn: lái cano ra biển, nâng cấp bản thân, chọn súng, mang cá về làm sushi bán cho khách, nâng cấp quán. Anim và VFX phải đủ, lấy từ bản gốc Dave the Diver.

## Vòng một ngày (máy trạng thái pha trong `js/main.js`)

```
title → prep → boat(out) → loading → dive → result → boat(home) → kitchen → bar → ledger → prep …
```

- `prep`: ba thẻ. Trang bị (O₂, túi cá, đồ lặn, dao, súng xiên, động cơ cano), Súng (mua / chọn một khẩu phụ), Quán (ghế, đầu bếp, trang trí, trà).
- `boat`: khúc lái cano chơi được, ~25 giây ra, ~12 giây về (bỏ qua được khi về).
- `dive` / `result`: có sẵn. Cá giữ được vào `save.fridge`.
- `kitchen`: chọn món từ tủ cá, Bancho làm sushi (anim + VFX), ra số suất.
- `bar`: phục vụ khách ~120 giây. Khách vào, ngồi, gọi món, Dave bưng món và rót trà, khách ăn, trả tiền + tip.
- `ledger`: tổng kết tiền, sang ngày mới, về `prep`.

Mỗi pha là một mục trong bảng `PHASES` với `enter(args) / exit() / update(dt) / render()` và `surface: '3d' | '2d' | 'dom'`. `body[data-phase]` quyết định lớp nào hiện.

## Dữ liệu

- `js/save.js`: một sổ lưu `hx.save.v1` trong localStorage (bọc try/catch). Có `stage` để tải lại trang vẫn về đúng chỗ.
- `data/meta.js`: bảng `GEAR`, `GUNS`, `BAR`, cách tính giá món. Hàm thuần `stat / nextCost / buy`. Số `[DtD]` lấy từ `data/gear_sheet.js` và `data/bar_assets.js` nếu bóc được, không thì `[ĐỀ XUẤT]`.

## Chủ sở hữu tệp (không ai sửa tệp của người khác)

| Luồng | Tệp |
|---|---|
| Bóc asset quán | `tools/rip_bar.py`, `art/bar/**`, `audio/bar_*`, `data/bar_assets.js` |
| Bóc asset cano + súng + trang bị | `tools/rip_boat.py`, `art/boat/**`, `art/gear/**`, `audio/boat_*`, `audio/gun_*`, `audio/ui_*`, `data/boat_assets.js`, `data/gear_sheet.js` |
| Khung (chặn trước) | `js/save.js`, `data/meta.js`, `js/main.js`, `index.html`, `js/hud.js`, stub `js/prep.js` `js/boat.js` `js/bar.js`, `css/*.css` |
| Pha 2 | `js/boat.js` + `css/boat.css`; `js/bar.js` + `css/bar.css`; `js/prep.js` + `css/prep.css`; súng trong lặn: `js/gun.js` + sửa `dave.js`/`harpoon.js`/`main.js` phần nhập liệu |

Agent không commit. Lead review rồi commit, liệt kê tệp.
