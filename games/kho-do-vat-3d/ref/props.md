# Ô tham chiếu (cắt từ sheet của chủ dự án)

Sinh bằng `python tools/crop.py`. Cột `prop` là id hàm build trong `props/` (xem `props/index.js`).

| ô | sheet | prop | mô tả | khung (x0,y0,x1,y1) |
|---|---|---|---|---|
| 01 | owner-props-sheet.webp | `container_open` | Container 20ft đỏ, cửa mở | 47,91,348,333 |
| 02 | owner-props-sheet.webp | `scrap_pile_a` | Đống phế liệu: máy, lốp, thùng, ván, rào | 366,102,520,196 |
| 03 | owner-props-sheet.webp | `scrap_pile_b` | Đống phế liệu: máy, 2 lốp, thùng cam, gạch | 557,105,683,176 |
| 04 | owner-props-sheet.webp | `lockers_triple` | Tủ locker thép 3 ngăn | 704,99,778,193 |
| 05 | owner-props-sheet.webp | `barrier_crowd_red` | Rào chắn đám đông sọc đỏ trắng | 801,102,889,163 |
| 06 | owner-props-sheet.webp | `barrier_steel_broken` | Rào thép đám đông gãy cong | 995,114,1089,171 |
| 07 | owner-props-sheet.webp | `caravan` | Toa caravan xanh lá, cửa mở, thang, lan can | 1041,100,1408,367 |
| 08 | owner-props-sheet.webp | `barrier_steel` | Rào thép đám đông | 899,126,983,189 |
| 09 | owner-props-sheet.webp | `tool_chest_red` | Tủ đồ nghề đỏ, ngăn kéo mở | 444,229,532,302 |
| 10 | owner-props-sheet.webp | `fridge_yellow` | Tủ lạnh vàng, cửa hé | 558,206,620,299 |
| 11 | owner-props-sheet.webp | `cabinet_yellow` | Tủ vàng nhỏ mở cửa | 654,207,705,286 |
| 12 | owner-props-sheet.webp | `tarp_crate_green` | Thùng gỗ phủ bạt xanh lá, dây đai | 741,201,886,293 |
| 13 | owner-props-sheet.webp | `tarp_crate_blue` | Thùng gỗ phủ bạt xanh dương, dây đai | 914,195,1022,296 |
| 14 | owner-props-sheet.webp | `safe_small` | Tủ sắt nhỏ mở cửa | 369,241,425,310 |
| 15 | owner-props-sheet.webp | `jersey_striped` | Dải phân cách bê tông sọc đỏ trắng | 53,310,194,407 |
| 16 | owner-props-sheet.webp | `jersey_stained` | Dải phân cách bê tông loang ố | 243,330,373,439 |
| 17 | owner-props-sheet.webp | `jersey_broken_mid` | Dải phân cách vỡ giữa, lòi thép | 399,336,530,433 |
| 18 | owner-props-sheet.webp | `mattress` | Nệm cũ | 538,334,670,430 |
| 19 | owner-props-sheet.webp | `sleep_mat_flat` | Tấm trải ngủ trải phẳng | 654,303,775,365 |
| 20 | owner-props-sheet.webp | `car_bench_seat` | Ghế băng sau ô tô | 783,318,890,404 |
| 21 | owner-props-sheet.webp | `drum_blue` | Thùng phuy nhựa xanh | 905,310,946,377 |
| 22 | owner-props-sheet.webp | `drums_blue_strapped` | Cặp phuy xanh buộc dây | 993,313,1064,390 |
| 23 | owner-props-sheet.webp | `jersey_broken_end` | Dải phân cách gãy đầu, lòi thép | 1300,329,1432,441 |
| 24 | owner-props-sheet.webp | `bedroll_open` | Cuộn chăn ngủ mở dở | 690,387,789,451 |
| 25 | owner-props-sheet.webp | `drums_on_pallet` | Phuy trên pallet buộc dây | 903,377,1034,482 |
| 26 | owner-props-sheet.webp | `concrete_block_tarp` | Khối bê tông phủ bạt xanh + gạch block | 1096,380,1266,473 |
| 27 | owner-props-sheet.webp | `jersey_plain` | Dải phân cách bê tông trơn thấp | 68,428,240,504 |
| 28 | owner-props-sheet.webp | `pallet_table` | Bàn pallet kê gạch, phủ bạt | 279,449,412,538 |
| 29 | owner-props-sheet.webp | `pallet` | Pallet gỗ | 434,455,554,528 |
| 30 | owner-props-sheet.webp | `workbench` | Bàn thợ có ê-tô, đèn | 568,436,710,584 |
| 31 | owner-props-sheet.webp | `sleep_roll_orange` | Cuộn đệm cam | 738,474,821,509 |
| 32 | owner-props-sheet.webp | `bedroll_tied` | Cuộn chăn buộc dây | 809,427,874,464 |
| 33 | owner-props-sheet.webp | `drum_red_rusty` | Phuy đỏ gỉ | 1045,455,1090,531 |
| 34 | owner-props-sheet.webp | `generator` | Máy phát điện xách tay | 1280,440,1369,517 |
| 35 | owner-props-sheet.webp | `water_barrier_white` | Rào nhựa trắng loang | 39,500,169,608 |
| 36 | owner-props-sheet.webp | `water_barrier_red` | Rào nhựa đỏ | 184,530,314,626 |
| 37 | owner-props-sheet.webp | `drum_red_dented` | Phuy đỏ móp | 744,529,797,606 |
| 38 | owner-props-sheet.webp | `chair_plastic` | Ghế nhựa | 823,492,882,580 |
| 39 | owner-props-sheet.webp | `chair_wood` | Ghế gỗ | 905,492,968,582 |
| 40 | owner-props-sheet.webp | `burn_barrel` | Phuy đốt lửa có lỗ, củi | 994,523,1042,596 |
| 41 | owner-props-sheet.webp | `jersey_broken_long` | Dải phân cách dài gãy, lòi thép | 1111,491,1264,557 |
| 42 | owner-props-sheet.webp | `jersey_striped_long` | Dải phân cách dài sọc đỏ trắng | 1263,524,1437,625 |
| 43 | owner-props-sheet.webp | `car_seat_sport` | Ghế ô tô thể thao | 363,556,441,660 |
| 44 | owner-props-sheet.webp | `car_seat` | Ghế ô tô nâu | 470,548,545,652 |
| 45 | owner-props-sheet.webp | `barrel_table` | Phuy kê ván phủ bạt | 562,589,654,689 |
| 46 | owner-props-sheet.webp | `trash_can` | Thùng rác kim loại | 678,589,743,672 |
| 47 | owner-props-sheet.webp | `burn_bucket` | Thùng cắt thấp chứa củi | 1061,552,1108,607 |
| 48 | owner-props-sheet.webp | `drum_orange_white` | Phuy cam trắng | 1195,595,1248,682 |
| 49 | owner-props-sheet.webp | `flood_light` | Đèn pha chân ba | 41,605,126,787 |
| 50 | owner-props-sheet.webp | `sawhorse` | Rào chắn kiểu ngựa gỗ | 128,641,226,746 |
| 51 | owner-props-sheet.webp | `traffic_drum` | Cột giao thông sọc | 253,637,292,697 |
| 52 | owner-props-sheet.webp | `traffic_barrel` | Thùng giao thông cam trắng | 315,624,365,698 |
| 53 | owner-props-sheet.webp | `stool` | Ghế đẩu gỗ | 743,643,800,703 |
| 54 | owner-props-sheet.webp | `drum_blue_b` | Phuy nhựa xanh có vòi | 823,601,879,688 |
| 55 | owner-props-sheet.webp | `drum_rusty` | Phuy gỉ | 899,601,945,674 |
| 56 | owner-props-sheet.webp | `tyre` | Lốp xe nằm | 967,624,1035,674 |
| 57 | owner-props-sheet.webp | `gas_cylinder_tall` | Bình gas cao | 1060,616,1101,708 |
| 58 | owner-props-sheet.webp | `drum_red_white` | Phuy đỏ trắng dấu lửa | 1125,609,1177,697 |
| 59 | owner-props-sheet.webp | `drum_blue_plastic` | Can nhựa xanh lớn | 1285,635,1342,727 |
| 60 | owner-props-sheet.webp | `fire_extinguisher` | Bình chữa cháy | 1370,605,1415,696 |
| 61 | owner-props-sheet.webp | `cone` | Cọc nón giao thông | 228,703,269,763 |
| 62 | owner-props-sheet.webp | `gas_cylinder_small` | Bình gas mini đỏ | 375,694,413,750 |
| 63 | owner-props-sheet.webp | `tyre_flat` | Săm/lốp mỏng nằm | 428,668,497,710 |
| 64 | owner-props-sheet.webp | `tyre_big` | Lốp to nằm | 496,699,569,754 |
| 65 | owner-props-sheet.webp | `log_stump` | Khúc gỗ đứng | 600,700,630,762 |
| 66 | owner-props-sheet.webp | `log_thin` | Khúc gỗ mảnh | 663,692,685,750 |
| 67 | owner-props-sheet.webp | `plank_standing` | Ván dựng | 718,708,742,774 |
| 68 | owner-props-sheet.webp | `camp_chair` | Ghế xếp dã ngoại | 822,705,880,769 |
| 69 | owner-props-sheet.webp | `bucket` | Xô | 900,716,937,759 |
| 70 | owner-props-sheet.webp | `bucket_handle` | Xô có quai | 956,691,992,746 |
| 71 | owner-props-sheet.webp | `toolbox` | Hộp đồ nghề thép mở nắp | 1010,708,1063,766 |
| 72 | owner-props-sheet.webp | `jerry_can_red` | Can xăng đỏ | 1178,708,1218,763 |
| 73 | owner-props-sheet.webp | `jerry_can_red_small` | Can xăng đỏ nhỏ | 1253,712,1297,762 |
| 74 | owner-props-sheet.webp | `jerry_can_yellow` | Can xăng vàng | 1352,712,1393,762 |
| 75 | owner-props-sheet.webp | `cinder_block` | Gạch block | 297,721,341,756 |
| 76 | owner-props-sheet.webp | `plank_broken` | Ván gãy | 751,723,806,770 |
| 77 | owner-props-sheet.webp | `case_red` | Hộp đỏ mở nắp | 1100,733,1139,763 |
| 78 | owner-vehicles-sheet.webp | `pickup` | Xe bán tải xanh nhạt — trước 3/4 | 25,118,355,332 |
| 79 | owner-vehicles-sheet.webp | `pickup` | Xe bán tải — sau 3/4 | 365,118,752,330 |
| 80 | owner-vehicles-sheet.webp | `van` | Xe van xám — trước 3/4 | 0,455,345,742 |
| 81 | owner-vehicles-sheet.webp | `van` | Xe van — sau 3/4, cửa mở | 345,455,775,728 |
| 82 | owner-vehicles-sheet.webp | `hatchback` | Hatchback xanh lá, súng máy — trước 3/4 | 893,60,1305,378 |
| 83 | owner-vehicles-sheet.webp | `hatchback` | Hatchback — sau 3/4 | 865,445,1368,752 |
| 84 | owner-workshop-scene.webp | `gunsmith_bench` | Bàn thợ súng: ngăn kéo mở, ốp góc kim loại, tấm hậu | 425,240,1012,748 |
| 85 | owner-workshop-scene.webp | `reloading_press` | Máy nạp đạn đỏ | 482,292,602,468 |
| 86 | owner-workshop-scene.webp | `cutting_mat` | Tấm lót cắt xanh | 608,328,872,442 |
| 87 | owner-workshop-scene.webp | `bench_vise` | Ê-tô kẹp bàn xanh lime | 883,332,1002,498 |
| 88 | owner-workshop-scene.webp | `desk_lamp` | Đèn bàn khớp gập, đầu sáng | 762,95,998,342 |
| 89 | owner-workshop-scene.webp | `walkie_talkie` | Bộ đàm | 772,298,814,397 |
| 90 | owner-workshop-scene.webp | `ashtray` | Gạt tàn có tàn thuốc | 598,418,667,452 |
| 91 | owner-workshop-scene.webp | `bottles_oil` | Chai keo / dầu | 750,232,824,337 |
| 92 | owner-workshop-scene.webp | `mug` | Cốc | 637,318,674,360 |
| 93 | owner-workshop-scene.webp | `dynamite_bundle` | Bó thuốc nổ | 568,395,620,424 |
| 94 | owner-workshop-scene.webp | `detonator_box` | Hộp kích nổ đỏ có nút | 832,508,922,572 |
| 95 | owner-workshop-scene.webp | `steel_cabinet_open` | Tủ thép xám mở cửa, có can xăng | 122,362,458,792 |
| 96 | owner-workshop-scene.webp | `gas_cylinder_tall` | Bình gas cao (cảnh xưởng) | 172,260,299,422 |
| 97 | owner-workshop-scene.webp | `gas_bottle_red` | Bình gas đỏ | 70,478,147,667 |
| 98 | owner-workshop-scene.webp | `tool_chest_rolling` | Tủ đồ nghề đỏ, ngăn kéo đầy đồ | 1028,298,1397,652 |
| 99 | owner-workshop-scene.webp | `kettle_stove` | Ấm trên bếp ga du lịch, tem cảnh báo | 1240,220,1362,390 |
| 100 | owner-workshop-scene.webp | `chair_wood` | Ghế gỗ (cảnh xưởng) | 918,512,1167,812 |
| 101 | owner-workshop-scene.webp | `lug_wrench` | Tay vặn ốc bánh xe | 1172,672,1238,740 |
| 102 | owner-workshop-scene.webp | `shell_casings` | Vỏ đạn đồng + đầu lọc vương sàn | 712,722,808,752 |
| 103 | owner-workshop-scene.webp | `fire_extinguisher` | Bình chữa cháy (cảnh xưởng) | 782,497,822,597 |
| 104 | owner-campfire-scene.webp | `burn_barrel` | Phuy đốt đang cháy | 652,358,812,692 |
| 105 | owner-campfire-scene.webp | `firewood_pile` | Đống củi | 183,628,382,722 |
| 106 | owner-campfire-scene.webp | `firewood_split` | Thanh củi chẻ | 398,643,492,722 |
| 107 | owner-campfire-scene.webp | `hatchet` | Rìu tay | 556,656,662,722 |
| 108 | owner-campfire-scene.webp | `backpack_red` | Ba lô đỏ đai đạn | 98,472,238,614 |
| 109 | owner-campfire-scene.webp | `backpack_yellow` | Ba lô vàng buộc túi ngủ | 1112,512,1347,642 |
| 110 | owner-campfire-scene.webp | `chair_plastic` | Ghế nhựa đổ (cảnh lửa trại) | 68,388,362,588 |
| 111 | owner-campfire-scene.webp | `fence_broken` | Hàng rào ván gãy | 1098,138,1362,447 |
| 112 | owner-campfire-scene.webp | `mattress` | Nệm trải (cảnh lửa trại) | 882,462,1392,707 |
| 113 | owner-campfire-scene.webp | `concrete_block_tarp` | Khối bê tông phủ bạt (cảnh lửa trại) | 88,202,567,422 |
| 114 | owner-campfire-scene.webp | `soda_can` | Lon nước | 645,360,678,412 |
| 115 | owner-campfire-scene.webp | `drums_blue_strapped` | Phuy xanh/gỉ buộc dây (cảnh lửa trại) | 715,182,812,388 |
| 116 | owner-campfire-scene.webp | `scrap_cart` | Xe đẩy phế liệu hàn, bánh to, thép gai | 722,108,1100,420 |
