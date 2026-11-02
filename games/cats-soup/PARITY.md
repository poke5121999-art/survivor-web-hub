# Mèo & Súp: so bản web với game gốc (rev 20261102g, 2026-11-02)

Đây là bản kiểm chỉ đọc, không sửa code. Ảnh web chụp trên Pages (`https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html`, rev 20261102g) bằng Chrome swiftshader ở khung 540x960. Khung gốc lấy bằng ffmpeg từ hai clip:

- `8las9YPqbvk`: bản gốc năm 2021, cuối game, khung dọc 666x1440. Kênh YouTube in chữ "DAY 4" màu hồng đè lên góc dưới trái của kệ.
- `LdkzNl0Bv3A`: bản gốc năm 2022, đầu game, khung 576x1280. Đã cắt dải đen 63 px phía trên.

Cả hai clip đều cũ hơn asset 5.3.0 đang dùng. Chỗ nào khác vì bản cập nhật thì nhãn là `version`, không tính là lỗi.

Thư mục `D:\survivor-web-hub\shots\cats-soup-parity\`:

- `ref/<key>/`: khung gốc.
- `web/<key>.png`: ảnh web.
- `regions.json`: các vùng đo.
- `verdicts.tsv`: 30 dòng nhận xét.
- `compare/<key>.png`: ảnh ghép, web bên trái, gốc bên phải.
- `compare/report.json`: số đo màu theo vùng.

Cổng `parity.py check` thoát 0 với nhãn: web-bug 20, ok 7, not-built 2, version 1.

Muốn dựng lại thì chạy `node shots/cats-soup-parity/tour.js shots/cats-soup-parity/web [key...]` (tour chụp, chưa đưa vào `test/`) rồi chạy:

```sh
python -I .claude/skills/parity-compare/parity.py build --ref shots/cats-soup-parity/ref --web shots/cats-soup-parity/web --out shots/cats-soup-parity/compare --regions shots/cats-soup-parity/regions.json --height 720
```

## Vòng sửa HUD và bảng (2026-11-02)

Ảnh sau sửa chụp bản local (`python -m http.server`, cùng tour, khung 540x960) vì chưa deploy; cặp web sau sửa | khung gốc nằm ở `shots/cats-soup-parity/compare-after/<key>.png`, ảnh web gốc ở `shots/cats-soup-parity/after/`. Đo màu: `compare-after-rep/report.json`. Cần chụp lại trên Pages sau khi deploy.

| Mục | Kết quả | Ảnh |
|---|---|---|
| 2. Hộp sự kiện | Đã sửa: khởi đầu gập lại, nút Event bật/tắt (`season.js`) | `compare-after/hud.png` |
| 3. Bảng nâng cấp trạm | Đã sửa: cửa sổ giữa màn dựng từ `ui/facility/set_upgrade` (`hud.js` `buildCard`), nền xám xanh (dimmed 73,84,91 vs gốc 63,74,82), HUD ẩn trừ thanh tiền, dòng "đã lên cấp a ➔ b", giữ `holdUpgrade`. Còn lệch: chưa có con mèo ngồi trên mép thẻ, chưa có đom đóm | `compare-after/levelup.png` |
| 4. CRAFT | Đã sửa: tab Đặc biệt, bỏ dòng Quản Lý Rừng (đã có ở menu rừng của nút `bt_more`), dòng khoá hai dòng chữ, nền side (70,82,91) vs gốc (69,81,90), bảng thấp lại. Còn lệch: tiêu đề cỡ lớn kèm phụ đề và con mèo trên tab | `compare-after/craft.png` |
| 4. RECIPE | Đã sửa: ô Gợi ý (công thức rẻ nhất của dòng), chip `+% `, `Lv.N+1` trên nút năng lượng, bát trên tấm gỗ ở đầu bảng, ô khoá nét đứt, tab khoá thứ ba | `compare-after/recipe.png` |
| 4. FACILITY | Sửa một phần: bảng da/đèn của trạm có ảnh trạm, nút ◀ ▶ đổi trạm, tab Mức độ (nâng cấp x1/x10/Max, giữ để lặp). Còn lệch: ảnh là icon `build<n>` (gốc là ảnh cảnh 3D `PlaceTex`), thiếu phụ đề | `compare-after/facility.png` |
| 6. Kệ món | Đã sửa: bát `dish0/1/2` dưới mỗi món, canvas 118 px, giá dưới bát | `compare-after/hud.png` |
| 6. Nút x2 | Đã sửa: dưới phải trên thanh gỗ, chữ vừa nút | `compare-after/hud.png` |
| 6. Hũ may mắn | Đã sửa: về chỗ gốc `set_jar t=[60,230]`; nút quảng cáo của bong bóng lên trên để khỏi nằm dưới dãy món | `after/jar.png` |

Bẫy ghi lại:

- Atlas NGUI cắt sprite theo khung đã bỏ lề (padding trong `atlases.json`); vẽ hai sprite chồng nhau (món trên bát) phải dùng `hud.full()` để giữ lề, nếu không món lệch khỏi bát.
- `ui/stage/set_food` là bảng RECIPE, `ui/facility/set_build` là CRAFT; layout kệ trong `hud.json` (`set_bottom/set_food`) không có con, món trên kệ do code gốc sinh lúc chạy.
- Khi bảng hay cửa sổ nâng cấp mở, HUD thật bị `visibility: hidden` (class `cover`), nên mọi test phải đóng cửa sổ (chạm nền) rồi mới bấm nút HUD.
- Nút "up" của cửa sổ nâng cấp là sprite `bg` của `bt_upgrade`; nhãn giá phải `pointer-events: none` kẻo Playwright báo bị chặn.

## Các cặp đã so

| Key | Web (URL + bước dựng) | Khung gốc |
|---|---|---|
| early1 | `?demo=1`, camera vào nồi súp | https://youtu.be/LdkzNl0Bv3A?t=9, https://youtu.be/LdkzNl0Bv3A?t=3 |
| early3 | `?demo=3&zoom=3.8` | https://youtu.be/LdkzNl0Bv3A?t=78, https://youtu.be/LdkzNl0Bv3A?t=70 |
| closeup | `?demo=3`, half-height 1,7 vào nồi súp | https://youtu.be/LdkzNl0Bv3A?t=298, https://youtu.be/LdkzNl0Bv3A?t=290 |
| mid15 | `?demo=15&zoom=4` | https://youtu.be/8las9YPqbvk?t=164, https://youtu.be/8las9YPqbvk?t=196 |
| zoomout | `?demo=15&zoom=6` (xa nhất) | https://youtu.be/8las9YPqbvk?t=164, https://youtu.be/8las9YPqbvk?t=536 |
| large | `?size=4&demo=30&zoom=4.5` | https://youtu.be/8las9YPqbvk?t=536, https://youtu.be/8las9YPqbvk?t=766 (clip không có rừng cỡ 4+) |
| hud | `?demo=15&zoom=4&speed=6`, chờ 9 s cho kệ có món | https://youtu.be/8las9YPqbvk?t=536, https://youtu.be/LdkzNl0Bv3A?t=298 |
| craft | `?demo=15`, `__hud.openBuild()` | https://youtu.be/8las9YPqbvk?t=242, https://youtu.be/LdkzNl0Bv3A?t=12 |
| recipe | `?demo=15`, `__hud.openRecipe()` | https://youtu.be/8las9YPqbvk?t=192, https://youtu.be/8las9YPqbvk?t=424 |
| levelup | `?demo=15&speed=6`, `__hud.select(works[0])` | https://youtu.be/8las9YPqbvk?t=384, https://youtu.be/8las9YPqbvk?t=632 |
| facility | `?demo=3`, `__theme.openSkins(<Bóng Mát>)` | https://youtu.be/LdkzNl0Bv3A?t=222 |
| night | `?size=4&demo=30&zoom=4.5`, `timeCount = 7` | https://youtu.be/8las9YPqbvk?t=396, https://youtu.be/LdkzNl0Bv3A?t=366 |

## Chỗ lệch, xếp theo độ dễ thấy với người chơi

### 1. Rừng quanh bãi là bụi tròn, gốc là cây thông

- **ĐÃ SỬA (đo trong repo, ảnh sau sửa `shots/cats-soup-parity/after/pair-zoomout.png`, `pair-early1.png`):** rừng thông khớp gốc về dáng, cỡ và màu (pine web (130,159,95) vs gốc (134,169,99)). Nguồn đúng là `Resources/tree/tree_theme<k>` (332x440, pivot đáy giữa, ppu 100; theme 17 ppu 94,3), không phải `picnic_tree06_theme<k>`. `tools/export_ground.py` và `tools/export_theme.py ground` xuất `farTree`, `farSize`, `farPivot`, `farPpu` cho cả 19 theme. `js/view/forest.js` `setFarTree()/paintFarTree()` dựng lại quad float theo rect/pivot (geometry xuất ra là số nguyên lượng tử, scale nằm trong `mesh.matrix`, nên bỏ matrix đó). `js/view/features/theme.js` `paintTrees()` gọi `forest.setFarTree(rec)` khi đổi theme (`test/cats-soup-theme-play.js` 36/36).

- **Ảnh:** `compare/zoomout.png`, `compare/early1.png`, `compare/mid15.png`. Sprite đặt cạnh nhau: `compare/tree_theme0-original.png` và `compare/picnic_tree06_theme0-web.png`.
- **Thấy gì:** Ở mọi khung gốc (`8las` t=164, 536; `Ldk` t=3, 9, 78), rừng quanh bãi là thông tam giác xanh đậm. Bản web là những tán bụi tròn xám lục xếp thành lớp. Đây là khác biệt lớn nhất trên mọi màn rừng.
- **Số đo:**
  - lowtrees early1: web (153,170,124), gốc (119,156,86), web sáng gấp 1,17 lần.
  - toptrees zoomout: web (150,167,122), gốc (132,158,103).
- **Nguyên nhân (đo trong repo):** `data/theme.json` → `ground.<k>.farTree` = `picnic_tree06_theme<k>`. Đó là sprite mặc định có sẵn trong prefab `tree_far1`. Lúc chạy, game gốc gọi `SetFarTreeSprite(theme)`, nạp `Resources/tree/tree_theme<k>`. Tài nguyên `tree/tree_theme0` có trong `D:\catsoup-ref\resources.json` (file `da23c682…`) và chính là cây thông, rộng 330, cao 432. `D:\catsoup-ref\rules\map.md` §2e có ghi tên `tree_theme_{theme}` nhưng lại khớp nhầm sang picnic.
- **Sửa:**
  - `tools/export_theme.py` xuất `tree/tree_theme<k>` (cả 19 theme) ra `art/tex`, ghi vào `farTree` và `farSize`.
  - `js/view/forest.js` `buildTrees()` dựng quad theo rect và pivot của sprite mới. Cây thông là sprite dọc, picnic là sprite ngang 311x201, nên không thể chỉ đổi texture.
  - `js/view/features/theme.js` `paintTrees()` đã đổi texture theo theme, giữ nguyên.

### 2. Hộp sự kiện mở sẵn, nổi giữa màn

- **Ảnh:** `compare/mid15.png`, `compare/early1.png` (khối 6 nút: túi cầu vồng, lịch, P).
- **Thấy gì:** Ở mọi màn web, khối nút này nằm giữa-phải, che lên các trạm. Gốc chỉ có nút "Event" trong cột phải. Hộp chỉ bung ra khi người chơi bấm.
- **Sửa:** `js/view/features/season.js` `mount()` đang đặt `this.shown = true`. Đổi thành `false`, để nút `bt_eventOpen` bật và tắt hộp.

### 3. Bảng nâng cấp trạm: gốc là thẻ giữa màn, web là thẻ nhỏ góc trái

- **Ảnh:** `compare/levelup.png`.
- **Thấy gì:**
  - Gốc (`8las` t=384, 632) có thẻ giữa màn gồm: tên trạm, ảnh, "Level 13", dòng hiệu ứng "Soup cooking price increase + 7217a", dải "Next Level + 8521a", nút xanh to có giá vàng. Một con mèo ngồi trên mép thẻ. Rừng phía sau tối xám xanh. HUD ẩn hết, chỉ còn thanh tiền. Mỗi lần lên cấp có dòng "<tên> leveled up 12 → 13" bay lên.
  - Web chỉ có thẻ giấy nhỏ góc dưới trái (Lv, icon, tên, ▲ giá, nút x, "Làn da").
- **Số đo:** vùng nền dưới thẻ: web sáng gấp 2,4-3,3 lần gốc.
- **Sửa:**
  - `js/view/hud.js` `select()` / `drawCard()` và `css/game.css` `.card`: dựng lại theo prefab bảng nâng cấp của gốc. Xuất bằng `tools/export_ui.py --prefab ui/...`; tên prefab chưa tra, tìm theo chuỗi `nextLv`.
  - Thêm dòng chữ "leveled up" khi `game.upgrade` vượt mốc.
  - Có thể giữ thẻ nhỏ làm nút tắt. Gốc cũng có ô nhỏ "Lv.91" + mũi tên xanh ở góc dưới trái (`8las` t=164).

### 4. Ba bảng CRAFT / RECIPE / FACILITY khác gốc về khung, nền và nội dung

- **Ảnh:** `compare/craft.png`, `compare/recipe.png`, `compare/facility.png`.
- **Chung cho cả ba bảng:**
  - Khi mở bảng, gốc ẩn HUD (cột phải, kệ, nút x2), chỉ để thanh tiền.
  - Nền gốc phủ xám xanh: vùng side gốc (69,81,90), web (77,76,51) ngả nâu.
  - Gốc có tiêu đề ngắn cỡ lớn kèm phụ đề nhỏ ("CRAFT / Create Facilitys") và một con mèo ngồi trên dãy tab. Web dùng tiêu đề dài ("Tạo cơ sở vật chất"), không phụ đề, không mèo.
  - Bảng gốc chiếm y 0,26-0,80 màn. Bảng web chiếm 0,13-0,84.
  - **Sửa:** `css/game.css` `.panel`: đổi `box-shadow` sang màu xám xanh, thêm class trên `.hud` để ẩn HUD khi mở bảng. Tiêu đề và phụ đề lấy theo layout prefab gốc (`js/view/hud.js` `open()`).
- **CRAFT:**
  - Thiếu tab thứ tư "Special" (gốc có 4 tab: Cooking/Rest/Function/Special).
  - Web có thêm dòng "Quản lý Rừng" ở đầu danh sách, gốc không có.
  - Dòng khoá đúng kiểu (nét đứt, ổ khoá), nhưng gốc ghi 2 dòng "<Rest> Select the tab / <Wild Flower> Please build first".
  - **Sửa:** `js/view/hud.js`: `TABS` thêm tab Special; chuyển nút dời trạm ra chỗ khác (gốc vào từ menu rừng).
- **RECIPE:**
  - Thiếu ô "Recommend" dưới bảng.
  - Thiếu chip "+77 %" nền xanh lơ cạnh giá.
  - Nút năng lượng không ghi "Lv.7" phía trên.
  - Đầu bảng giá thiếu hình bát súp trên tấm gỗ.
  - Công thức chưa mở: gốc là ô trống nét đứt có ổ khoá. Web hiện tên + giá + 🔒 emoji.
  - Thiếu tab khoá thứ ba (gốc: Soup / Juice / 🔒).
  - **Sửa:** `js/view/hud.js` `openRecipe()`.
- **FACILITY** (gốc `Ldk` t=222):
  - Gốc có tiêu đề "FACILITY / Manage Facility", ảnh lớn của trạm, nút ◀ ▶ để đổi trạm, tab Skin/Lamp, và tab đáy Level / Decorate Facility.
  - Web là danh sách chữ ("Da cơ sở / Dấu hiệu cấp độ / Đèn"), không có ảnh trạm và không có ◀ ▶.
  - **Sửa:** `js/view/features/theme.js` `openSkins()`. Ghép với mục 3: đó là tab "Level" của cùng bảng này.

### 5. Trạm nấu súp: nồi bị quầng sáng trắng, mất đèn lồng, biển cấp trống

- **ĐÃ SỬA (ảnh `after/pair-closeup.png`, `after/pair-early1.png`):**
  - Quầng trắng: `pt_firebase` (quad ngang 1,5 đơn vị, cộng sáng, `pt_glow_dot`) bị vẽ không thử độ sâu nên phủ lên nồi. Nay `depthTest` bật cho hệ mode 2, nồi che quầng. Vòng lửa cam nhỏ dưới đáy nồi của gốc **vẫn thiếu** (ngọn lửa `pt_fire` là mesh, chưa dựng).
  - Đèn lồng: `handLight` scale 0,3 nhân thêm scale 0,3 của prefab đèn nên đèn chỉ cao 0,03 (một chấm). Nay nút `p` bù scale của cha một lần, đèn cao cỡ ghế đẩu như gốc, màu xanh. Quầng đèn (`lamp0/pt_firebase`) vẽ sau thân đèn và chỉ sáng ban đêm (`HandLightOn`, theme.md §5).
  - Biển cấp: mặt phẳng chữ nằm ở chân tấm biển và chìm sau tấm gỗ; nay nâng lên mặt biển (số "1" hiện trên tấm biển, khớp gốc).

- **Ảnh:** `compare/pot-detail.png`, `compare/closeup.png`.
- **Thấy gì:**
  - Gốc: nồi xám xanh đậm, đáy có vòng lửa cam nhỏ, cạnh trạm có đèn lồng thuỷ tinh xanh trên ghế đẩu, biển gỗ ghi số cấp "1".
  - Web: một quầng sáng vàng-trắng to phủ lên nồi nên nồi thành xám trắng. Đèn lồng chỉ còn đốm sáng vàng. Biển cấp trống.
- **Số đo:** vùng nồi (early1): web (192,191,141), gốc (172,184,131).
- **Sửa:**
  - `js/view/features/particles.js`: hệ "glow" đang to và cộng sáng đè lên nồi. Giảm cỡ theo `startSize` gốc và vẽ sau / dưới nồi. Ghi chú ở dòng 199-200 nói ngọn lửa `pt_fire` đã bị bỏ; nên dựng lại ngọn lửa nhỏ thay cho quầng.
  - `js/view/game.js` dòng 70-74: đèn `lamp/lamp0` có thể bị quầng che. So sprite với đèn xanh trong clip.
  - Biển cấp: kiểm `text_lv` ở trạm mới dựng (README có ghi bẫy scale 0,03).

### 6. Kệ món, nút x2 và hũ may mắn lệch chỗ, lệch cỡ

- **Ảnh:** `compare/shelf-detail.png` (web trên, Ldk t=290 giữa, 8las t=536 dưới), `compare/hud.png`, `compare/mid15.png`.
- **Món trên kệ:**
  - Web chỉ vẽ mặt súp vàng, thiếu cái bát xám; mỗi món to khoảng 1,4 lần gốc.
  - Gốc vẽ bát xám có súp và giá nhỏ phía dưới.
  - **Sửa:** `js/view/hud.js` `drawShelf()`: thêm sprite bát dưới sprite món (tra trong `atlas_food_atlas` hoặc prefab món trên kệ); `css/game.css` `.dish`: thu `width` 112 → khoảng 80 px, `.bowl` 104x80 → khoảng 75x55.
- **Nút "Tốc độ nấu X2 / Hiển thị Quảng cáo":**
  - Web: giữa-trái, đè mép trên của kệ.
  - Gốc: nằm trên kệ, góc dưới phải.
  - **Sửa:** `js/view/features/shop.js` (node `set_bottomRight/set_dbSpeedBt`): kiểm anchor của node này trong `js/view/ngui.js`, hoặc đặt lại `left/top` sau khi dựng.
- **Hũ may mắn trên HUD:**
  - Web nhấc lên 200 px, nổi giữa rừng.
  - Gốc ngồi ngay trên mép kệ, giữa màn, có con mèo đứng cạnh.
  - **Sửa:** `js/view/features/specials.js` dòng 156: bỏ `-200`. Thay vào đó lùi dãy món sang trái để không đè hũ.
- **Màu gỗ kệ:** web (204,159,124) đỏ cam hơn gốc Ldk (187,172,127). Kệ là texture gốc nên nghi lệch do tint hoặc hệ màu. Ưu tiên thấp.

### 7. Trên Pages, vật trong rừng hiện chậm 10-25 s

- **ĐÃ SỬA, còn chờ đo trên Pages sau deploy (số đo mạng giả lập dưới):**
  - Nguyên nhân (đo trên Pages hiện tại, `?demo=15&zoom=4`): 367-410 request, 5,4-8,7 MB; thư viện trạm dựng cả 300 texture của 12 trạm (da, mùa, halloween...) và xin tất cả (lq + đủ) cùng lúc ở giây ~10,8, chen hàng với texture cần thấy; atlas HUD (3,3 MB) tranh băng thông với trạm. Texture đầy đủ cuối cùng về lúc 27,7 s, trung vị 14,9 s, 22/45 texture của cảnh chưa về sau 36 s.
  - Sửa: `shaders.js` có hai hàng đợi: "hi" (12 request một lúc) cho texture được xin hoặc thuộc thứ sắp hiện (`PrefabLib.instantiate/want`: chỉ nút đang bật), "lo" (2 một lúc, bắt đầu sau khi hi rảnh 1,2 s) cho biến thể ẩn; lq chỉ xin cho texture hi (lq: 92 request -> 43). `main.js` xin thư viện + texture của các trạm ngay khi biết danh sách trạm, chờ cảnh xong (tối đa 6 s) mới dựng HUD (6 MB atlas), và `__ready` chờ cảnh + atlas HUD (tối đa 25 s) thay vì 3 s cố định.
  - Số đo (`?demo=15&zoom=4`, Chromium swiftshader, máy này đang bận; mạng giả lập h2 nén gzip, 600 KB/s dùng chung, trễ 80 ms; "xong" = 45 texture cảnh về hết, bản trước = JS của `origin/main`):
    - Trước: 2 lần không xong sau 36 s (20-24 texture chưa về), 2 lần trang chưa xin tới texture trạm sau 36 s.
    - Sau: 3 lần xong lúc 9,4 / 9,9 / 9,5 s (trung vị 7,4-8,0 s), 295-326 request thay vì 371-372 (texture: 108-137 thay vì 188-190).
    - Local không giới hạn (`http://localhost`): `__ready` 3,6-5,4 s, cảnh xong trong 3,3 s.
    - Pages hiện tại (trước sửa): `__ready` 10,9-13,3 s, cảnh xong 27,8 s (trung vị 14,9 s). Số "sau" trên Pages ghi thêm khi đã deploy.
  - Mạng Pages của máy này chập chờn (có lần 503, có lần JSON không về), nên số đo Pages chỉ để so thứ tự, đo lại trên điện thoại.

- **Ảnh:** `compare/load-timeline.png` (3 s, 11 s, 26 s sau `__ready`, cùng URL `?demo=15&zoom=4`).
- **Thấy gì:**
  - 3 s: chưa có cây, trạm chỉ là bóng xanh đậm, HUD chưa có icon.
  - 11 s: cây cọ của Bóng Mát và cả Bảng Ghi Chú vẫn chưa hiện, chỉ có nền đất.
  - 26 s: đủ.
- **Đã kiểm:** tắt `frustumCulled` không đổi gì, nên đây là texture tải chậm, không phải lỗi culling.
- **Sửa:** `js/view/shaders.js` `texture()`: đã có bản `.lq.webp`, nhưng bóng xanh đậm cho thấy chưa dùng bản lq trước. Nạp lq trước, ẩn mesh tới khi có texture, rồi tăng `__ready` (`js/main.js`) để chờ texture của trạm và cây.
- **Lưu ý:** đo trên swiftshader và mạng của máy văn phòng; cần thử lại trên điện thoại.

### 8. Đêm: thiếu đom đóm, màu ngả xanh lá

- **ĐÃ SỬA (ảnh `after/pair-night.png`):**
  - Đom đóm là `Spawn.pt_fireFly`, ParticleSystem của cảnh `level2` (path id 1589), gắn dưới `Main Camera`: không gian thế giới, hộp 10x10 nằm ngang cách mặt đất 0,5 theo tâm màn, 50 hạt/s, sống 1-3 s, cỡ 0,02-0,1, cam (1, 0,62, 0), cộng sáng, có nhiễu nhẹ. `tools/export_particles.py --scene` xuất vào `data/particles.json["scene/pt_fireFly"]`; `particles.js` `mountFireflies()` phát ban đêm, đứng yên theo tâm camera (khoảng 90 hạt sống). `PSystem` có thêm module nhiễu.
  - Màu đêm: cỏ ngoài bãi web (93,108,87) vs `Ldk` t=366 (91,107,88); trước sửa (88,109,80). `NIGHT.amb` đổi thành [0,32, 0,315, 0,5]. Clip `8las` t=396 sáng hơn (105,124,92), clip hai năm khác nhau nên lấy `Ldk` làm chuẩn.

- **Ảnh:** `compare/night.png`, đối chiếu thêm `ref/levelup/a_8las_t384.jpg` (đêm, có đom đóm).
- **Màu:** clearing web (106,118,94) khớp `Ldk` t=366 (109,120,98) nhưng xanh lá hơn `8las` t=396 (126,124,118). Gốc 2021 ngả xám xanh dương.
- **Thiếu:** gốc có đốm sáng vàng nhỏ (đom đóm) bay khắp rừng; web không thấy.
- **Sửa:** `js/main.js` `NIGHT.amb` [0.3,0.32,0.46] đã đúng hướng. Đom đóm thuộc `js/view/features/particles.js`, cần tìm ParticleSystem đêm của gốc.

### Các chỗ đã kiểm và khớp, hoặc không tính là lỗi

- **Zoom mở đầu khớp:** vòng đá nồi súp chiếm 0,46 bề ngang ở web (half-height 2,5) và 0,50 ở gốc (t=9), quy ra half-height khoảng 2,7. Zoom xa nhất (6) cho tầm nhìn gần bằng `8las` t=164 (`compare/zoomout.png`).
- **Màu cỏ khớp:** early1 grass dc 5. Thân bảng CRAFT/RECIPE cũng khớp màu (dc 8-16).
- **Khung 9:16:** web khoá tỉ lệ 9:16, điện thoại trong clip là 9:19,5 nên gốc thấy thêm rừng trên dưới. Trên máy tính không đáng kể.
- **`version`:** góc trên trái (khung chân dung mèo của 5.3.0, clip là icon mèo + số + sao) và các nút thêm ở cột phải là layout `hud.json` của 5.3.0. Không sửa theo clip.
- **`not-built` / chưa so:**
  - Rừng cỡ 4+: clip không có rừng lớn như vậy.
  - Thanh nhiệm vụ hướng dẫn dưới thanh tiền: `?demo` bỏ qua guide, nên phải so riêng ở game mới (`?fresh`).
