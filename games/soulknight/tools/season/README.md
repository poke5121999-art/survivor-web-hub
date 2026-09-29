# Season Mode (Thoát khỏi Monkia) — dữ liệu thật Soul Knight 8.6.0

Mọi con số ở đây có nhãn: **[ĐO bảng/trường]** đọc thẳng từ dữ liệu game 8.6.0, **[SUY]** suy từ mã/dữ liệu nhưng
chưa thấy trọn công thức, **[ĐOÁN]** tự đặt vì không có nguồn.

## Lever (chạy theo thứ tự, từ gốc repo, đặt `PYTHONIOENCODING=utf-8`)

| Lệnh | Ra | Thời gian |
|---|---|---|
| `python games/soulknight/tools/season/extract_terrain.py --nopreview` | `D:/sk86-ref/work/season/terrain/*_tilemaps.json, *_objects.json, *_points.json` (đổi chỗ bằng `SK_SEASON_TERRAIN`) | ~25 s |
| `python games/soulknight/tools/season/build_season.py` | `data/season-data.js` (`SK_SEASON.world`) + `art/season/world/world0.png` (144 khung) | ~40 s |
| `python games/soulknight/tools/season/build_items.py` | `data/season-items.js` (`SK_SEASON_ITEMS`) + `art/season/ui/season-ui.png` (262 khung) + `map_base.png`, `map_scene1.png` | ~30 s |
| `python games/soulknight/tools/build_sk.py` | hoạt ảnh khỉ/NPC vào `data/sk-data.js` nhờ `tools/extra/season-86.json` | vài phút |

`build_season.py` tự gọi `extract_terrain.py` nếu thiếu JSON địa hình. Nguồn: bundle `escape.ab`,
`escape_terrain_init.ab`, `escape_terrain_scene1.ab`, `escape_map.ab`, `sprite_atlas`, `escape_config` (bóc bằng
`tools/skrip.py`), bảng Luban đã giải ở `D:/sk86-ref/decoded` (`escape_tbescape*`, `task_tbescapetaskconfig`,
`game_tbaiattribute`, `game_tbskill`, `game_tbweaponaffix`), `mb/escape_config.json`, `localization_en_vi.json`
(khoá `esc_*` = chữ tiếng Việt chính thức).

Mã chạy: `js/season/inventory.js` (kho đồ, luật), `world.js` (bản đồ, khỉ, rương, cổng), `quests.js` (38 nhiệm vụ),
`ui.js` (HUD + bảng), `season.js` (máy trạng thái). Kiểm: `node test/soulknight-season-world.js`,
`node test/soulknight-season-ui.js` (cần `python -m http.server 8811` ở gốc repo).

## Địa hình: dựng lại từ tilemap thật (bỏ bản phân loại màu của pha 1)

- Scene1 (Vành Đai Căn Cứ) = (0,0)..(350,350) đơn vị [ĐO EscapeMapSize]; căn cứ Init = (-45,-24)..(70,41) [ĐO].
  Pha 1 đoán 346 ô từ ảnh tổng quan — gần đúng nhưng lệch 1%.
- 1 đơn vị = 16 px [ĐO m_PixelsToUnits]; ô tilemap = 2x2 đơn vị (cell 1 x scale 2) [ĐO].
- Đất / nước nông / nước sâu là DualGridTilemap: dữ liệu chỉ đánh dấu ô, lúc chạy chọn 1 trong 16 sprite theo 4 góc.
  Bảng góc → chỉ số ở `dualTable` (kiểm bằng mắt). Biến thể ngẫu nhiên của ô đầy 25% [ĐOÁN].
- Nền cỏ: bể 7 sprite `grass_6`, `grass_rand_0..5` không trọng số [ĐO EscapeBottomGroundTileFillArea] → chọn đều
  [SUY]. Bản trước để 85% cỏ trơn nên thưa bụi hơn ảnh e_0929_101229; đã sửa.
- Cây: TreeMap rải Tree_0 x1, Tree_1 x2, Tree_2 x3, ô trong rừng 80%, ô ven luôn có [ĐO EscapeTilemapRandomTileScatter];
  vị trí trong ô lấy băm [ĐOÁN]. Bụi cỏ `grass` trên GrassTilemap: Init 0.2, Scene1 0.5 [ĐO nonEdgeCellSpriteProbability].
- ColMap (tường vô hình) lấp khe sông; khe không có dữ liệu nước thì tô theo màu ảnh tổng quan (sâu 207, nông 82 ô) [SUY].
- Điểm Scene1 [ĐO points]: 49 điểm quái, 27 rương, 26 lô cốt gỗ (200 máu), 7 cổng, 1 điểm cứu Nhà Khảo Cổ (271,145),
  2 cầu xây được (Bridge1 `unlockDirectly`=1).
- Căn cứ: Shop, Warehouse, Tent, Researcher, DesignTable, Workshop, Kitchen, Medical, BeaconTeleporter [ĐO];
  Tent/Workshop/Kitchen/Medical/BeaconTeleporter bắt đầu cấp 0 (ẩn tới khi xây) [ĐO designtable].
- So với ảnh chủ dự án e/f/g/h: đường, quầy tím, Thầy Huấn Luyện góc trên phải, kho góc dưới phải, cổng xoáy phía bắc
  khớp; bản cũ (phân loại màu) lệch đường và phải nới đường 2 ô. Giữ bản tilemap.
- Bản đồ căn cứ gốc (ảnh g) chỉ có cổng + "Bạn", không ghi tên nhà → bỏ nhãn nhà/NPC.

## Luật (inventory.js, RULES từ `tables.rules`)

| Luật | Giá trị | Nguồn |
|---|---|---|
| Độ no tối đa | 100 | [ĐO EscapePlayerCombatConfig.BaseMaxHunger] |
| Tụt no | 0.14/giây x (2 − min(hệ số tốc, 1)) | [ĐO EscapeInventoryRuntime.TickHunger + GetHungerConsumeWeightFactor] |
| Hết no | −0.5 máu/giây, bỏ qua giáp | [ĐO HungerDamagePerSecond]; bỏ qua giáp [ĐOÁN] |
| Cấp tải | tỉ lệ ≥0.25/0.75/1.0/1.2 → cấp 1/2/3/4 | [ĐO GetCarryWeightLevel] |
| Hệ số tốc theo cấp | 1.1 / 1 / 0.7 / 0.5 / 0 (kẹp 0..1.2) | [ĐO] |
| Tốc chạy | 6.8 trong căn cứ, 5.5 ngoài | [ĐO] |
| Balô gốc | 15 ô, 40 kg; Rương An Toàn 1 ô; Bùa 1 ô | [ĐO const] |
| Máu tối đa | max_hp + 2 x giáp gốc + nâng cấp; giáp chỉ từ áo | [ĐO OnCharacterAttrSetup] |
| Lướt | hồi 5 s, bất tử 0.2 s, lực 50 | [ĐO EscapePlayerCombatConfig]; quãng 44 px [ĐOÁN] |
| Độ bền giáp | mỗi điểm giáp hồi −1 bền | [WIKI Supply crate] |
| Độ bền vũ khí | phiên bắn bắt đầu ở phát đầu; 0.35 s đầu miễn phí; giữ nút tính tới hiện tại, nhả thì tính tới tối đa bắt đầu+1.65 s; đủ 2 s tính phí → −1 bền; 0 bền thì không bắn | [ĐO EscapeWeaponDurabilityTracker.BillUntil/GetBillingEndTime/AddBillableTime] |
| Giá mua | Giá trị x 2 | [ĐO shop] |
| Giá bán | Giá trị x số x (bền/tối đa); 0 bền = 0 | hằng [ĐO sellPriceZeroDurabilityMultiplier 0], nội suy [SUY] |
| Sửa | tối đa −0.3 x phần sửa; giá 0.8 x giá trị x phần hỏng | hằng [ĐO], công thức [SUY] |
| Kho | 64, 96 … 320 ô theo cấp | [ĐO warehousecapacity] |
| Lục rương | 0.5/0.8/1.2/1.8/2.2/2.5 s mỗi món theo độ hiếm | [ĐO] |
| Chết | balô + trang bị vào Rương Tử Vong tại chỗ chết, còn 1 lượt để lấy; Rương An Toàn + Kho giữ | [ĐO esc_tips_4, RecordDeathBox] |
| Rút lui | đứng trong GateEvacuation 4 s; cổng về căn cứ 2 s | [ĐO interactDuration] |
| Đồ tiêu hao | Params = [giá trị, thời gian dùng, giá trị 2 / thời lượng]; không dùng trong căn cứ | [ĐO item db] |
| Bộ khởi đầu | Chim Ưng Sa Mạc (bền 103) + Bình Máu Nhỏ + Bình Năng Lượng Nhỏ + 1 đồ ăn | [ĐO chest start_supply] |

## Khỉ (world.js)

- Máu/tốc [ĐO game_tbaiattribute] x HpMultiplier của điểm sinh [ĐO enemyspawnconfig]: khỉ 1-4 40 máu tốc 4,
  vượn 1 50 máu tốc 6.5 (cận chiến 6004), vượn 2/3 40, tinh anh 100, trùm 500/1500.
- **8 điểm ở Scene1 dùng cấu hình `scene2_*` (x1.6)**: vượn 1 80 máu, vượn 2 64 máu. Đó là dữ liệu thật, không phải lỗi.
- Kỹ năng [ĐO game_tbskill]: 6001 bắn (gcd 5), 6002 bắn + chạy thả diều (gcd 3), 6003 bắn + áp sát (gcd 1),
  khởi động 0.75 s; 6005 né hồi 3 s (khỉ 1, tinh anh); 6006 đổi vũ khí mỗi 4 s (tinh anh, trùm).
- Đạn 1 sát thương [SUY PhysicalAttack 1]. Tầm nhìn 15, báo động 25 đơn vị [ĐO điểm sinh]; quét mỗi 0.3 s [ĐO scanInterval].
- Rớt Rương Quái Vật (`deathDropChestId`) [ĐO]; kèm vũ khí khỉ cầm, bền 50-75% [ĐOÁN].
- Hoạt ảnh: clip `escape.ab` qua `tools/extra/season-86.json` (idle/run/dodge); khung chết `e_escape_<loại>_16`.

## Vật phẩm, rương, nhiệm vụ (build_items.py)

- 792 món (trong 1239 dòng): vật liệu 43, quý 20, bản đồ kho báu 2, giáp 8, balô 6, thuốc 15, đồ ăn 12, vũ khí 422,
  phụ tố 263, Xu Sắt 1 [ĐO escape_tbescapeitemdatabase]. Tên/mô tả = `esc_*` tiếng Việt chính thức.
- Vũ khí ghép với vũ khí của engine theo slug tên tiếng Anh: 822 dòng vũ khí, 422 ghép được, **400 không có trong
  engine** (`weaponMissing`) → bỏ khỏi bảng; bể rơi và bể vũ khí khỉ tự bỏ qua các món đó.
- Rương: 51 loại, 59 bể rơi có trọng số và dòng `__NO_DROP__`; mỗi bể rút DrawCountMin..Max lần [ĐO lootentryconfig, chestconfig].
- Cửa hàng 9 món [ĐO shop]; 59 công thức chế tạo [ĐO craftblueprint]; nâng cấp nhà [ĐO designtable upgrade]; huấn luyện [ĐO upgradeblueprint].
- 38 nhiệm vụ [ĐO task_tbescapetaskconfig]: 16 chạy được ở Căn Cứ + Vành Đai; 22 hiện "Chưa có ở bản web" kèm lý do
  (trùm, đèn hiệu, khu chưa mở, cứu NPC ngoài Scene1, hoặc nhiệm vụ trước bị khoá). Nhận tự động khi mở khoá
  (bảng gốc ảnh h chỉ có "Đã nhận") [SUY].

## Bẫy đã sập

- **Heredoc bash dài hỏng** ("unexpected EOF" với `cat > x <<'EOF'` chứa backtick/`${}`): viết tệp bằng công cụ Write
  rồi ghép bằng Python.
- **`python -c` bắt đầu bằng dòng trống** hỏng trong Git Bash của máy này (IndentationError với `||  goto :error`):
  dùng heredoc `python - <<'EOF'`.
- **`arm_method.py` dừng ở `pop pc` đầu tiên** → mất nửa sau method có nhánh sớm (ILFix patch). Dùng bản
  `D:/sk86-ref/work/season/arm_full.py`, chỉ dừng theo `-n`.
- **Đọc hằng float trong ARM**: `vldr s2, [pc, #x]` lấy ở `((địa chỉ + 8) & ~3) + x`; capstone in hằng thành lệnh
  rác (`svclo #0xd33333` = 0x3fd33333 = 1.65).
- **Đường dẫn Windows trong Python heredoc**: `'D:\sk86-ref\work\'` → SyntaxError; `sed` thay đường dẫn có `\t` thành
  ký tự tab. Luôn dùng `/`.
- **Trigger nhà nằm gần hết trong ô rắn** (Kho, Cơ sở huấn luyện): điểm đứng gần nhất cách mép trigger 4-15 px nên
  E không mở. Unity chạm collider chứ không phải tâm → nới trigger 16 px (`TRIG_PAD`).
- **`buildings[].sprite` là mảng `[x, y, frame, flip]`**, không phải tên khung.
- **Clip chết của khỉ không có khoá sprite** → thêm png_anims `season_dead_<loại>` 1 khung.
- **Điểm sinh không chỉ trỏ `scene1_*`** — xem mục Khỉ.
- **Kiểm thử đọc `weapons[0]` ngay khi vào mode** có thể thấy súng mặc định của sảnh; tick đầu mới chép từ ô trang bị.
- **`debug.god()` không có tác dụng** vì engine không có cờ bất tử; season.js giữ `invulT` khi `p.god`.
- **Mỗi bundle có bản sao prefab con ở gốc** (số đếm gấp đôi): chỉ lấy `canonical` (xem README trong thư mục terrain).

## Còn đoán / chưa có

- Chết mà không còn vũ khí thì lượt sau cầm súng mặc định của nhân vật [ĐOÁN, nhân nhượng].
- VFX của escape.ab (vòng rút lui, ánh rương, cổng) chưa có trong `sk-vfx.js`; đang vẽ vòng tròn đơn giản.
- Cầu, đèn hiệu, kho báu, điều tra khu vực có mã nhưng phần thưởng/sự kiện đào chỉ theo trọng số bảng [ĐO], hình ảnh tối giản.
