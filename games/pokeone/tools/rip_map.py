# -*- coding: utf-8 -*-
"""Rút prop bản đồ PokéOne (prefab 3D trong mdata..mdata7) + ảnh nền + cảnh màn đăng nhập.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_map.py              # tất cả: props, ground, title
    python games/pokeone/tools/rip_map.py props        # chỉ prop (có thể thêm tên prop: props tree_2 rock_1)
    python games/pokeone/tools/rip_map.py ground title

Ra:
  art/map/<id>.glb        prop đã chọn (CURATED), ảnh dùng chung ở art/map/tex/ (uri 'tex/..')
  art/map/tex/ground_*.png ảnh nền (atlas ô, cỏ, cát, nước...)
  art/title/island.glb    đảo màn đăng nhập, art/title/sky_*.png trời
  data/props.js           P1.PROPS, P1.GROUND, P1.TITLE_SCENE

Toạ độ: khung three.js/glTF (x của Unity bị đảo, xem rip_map_core.py), đơn vị Unity. Prefab "nhóm cũ" (dựng theo HGSS, một ô =
16,6 đơn vị) đã nhân 1/16,6 cho khớp nhóm mới (một ô = 1 đơn vị); prop đó có legacyScale trong props.js.
Chi tiết, bẫy và bảng prop: tools/README-map.md.
"""
import io, json, os, re, sys, time

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rip_map_core as core

GAME = os.path.dirname(HERE)
ART_MAP = os.path.join(GAME, 'art', 'map')
TEX = os.path.join(ART_MAP, 'tex')
DATA_JS = os.path.join(GAME, 'data', 'props.js')
LEGACY_TILE = 16.6        # jetty_3x3 = 49,8 = 3 x 16,6; pokemongrass_4x4 = 66,4 = 4 x 16,6
LEGACY_MIN = 12.0         # cạnh AABB gốc lớn hơn thế là prefab nhóm cũ (nhóm mới lớn nhất trong bộ chọn: 9,2)
CATALOG_TILES = r'D:\pokeone-ref\catalog\tiles'
# Nhóm cũ nhưng nhỏ hơn LEGACY_MIN: flowers_2 rộng 7,8 nằm lệch gốc 4..12 đơn vị (= 0,25..0,72 ô nếu chia 16,6).
LEGACY_FORCE = {'flowers_2'}

# ---------------------------------------------------------------------------------------------------
# Bộ prop đã chọn: nhóm -> [(tên prefab gốc, thẻ thêm, gợi ý dùng)]. id trong P1.PROPS = tên đã làm sạch.
# Nhóm là thẻ đầu tiên. Chọn bằng mắt trên tờ ảnh D:\pokeone-ref\catalog\props (rip_map_catalog.py).
CURATED = [
    ('house', [
        ('ext_house_pallettown_1', ['pallet', 'kanto'], 'Nhà dân Pallet mái đỏ (nhà người chơi); mặt tiền +z có lỗ cửa, lắp door_ext_* vào; mặt sau bỏ trống'),
        ('ext_house_pallettown_2', ['pallet', 'kanto'], 'Nhà dân Pallet mái đỏ có cửa sổ mái (nhà Blue)'),
        ('ext_veridian_house_1', ['viridian', 'kanto'], 'Nhà dân Viridian mái đỏ thấp'),
        ('ext_house_kanto5 (1)', ['kanto'], 'Nhà Kanto mái xanh rêu, dùng rải cho Viridian'),
        ('ext_house_kanto5 (2)', ['kanto'], 'Nhà Kanto mái nâu đỏ'),
        ('ext_house_kanto5 (3)', ['kanto'], 'Nhà Kanto mái nâu đỏ (bản 2)'),
        ('ext_house_kanto5 (4)', ['kanto'], 'Nhà Kanto mái xanh lam'),
        ('ext_house_kanto5 (5)', ['kanto'], 'Nhà Kanto mái xanh lam (bản 2)'),
        ('ext_house_kanto5 (6)', ['kanto'], 'Nhà Kanto mái xanh lam (bản 3)'),
        ('house_a_1', [], 'Nhà nhỏ mái hồng (nhóm cũ HGSS)'),
        ('house_a_3', [], 'Nhà nhỏ mái xanh (nhóm cũ HGSS)'),
    ]),
    ('lab', [
        ('ext_house_oak', ['pallet', 'kanto'], 'Phòng thí nghiệm GS Oak kiểu HGSS: tường kem, mái bằng'),
        ('ext_house_profesor', ['pallet'], 'Nhà lớn mái cam - phương án khác cho lab Oak'),
        ('ext_building_lab', [], 'Lab mái kính tròn (kiểu lab Elm)'),
    ]),
    ('pokecenter-ext', [
        ('ext_building_pockiecenter', ['viridian'], 'Trung tâm Pokémon mái đỏ, cửa kính phía nam'),
        ('pokiecentre_new', [], 'Trung tâm Pokémon mái đỏ nhỏ (nhóm cũ, kiểu HGSS)'),
        ('pokiecentre_doors', ['door'], 'Cửa kính trượt Trung tâm Pokémon'),
    ]),
    ('mart-ext', [
        ('ext_building_shop', ['viridian'], 'Poké Mart mái phẳng, biển xanh'),
        ('ext_shop', [], 'Poké Mart (bản 2)'),
        ('pokieshop', [], 'Poké Mart mái xanh nhỏ (nhóm cũ, kiểu HGSS)'),
        ('shopdoors', ['door'], 'Cửa kính xanh Poké Mart'),
    ]),
    ('gym-ext', [
        ('ext_gym', ['viridian'], 'Nhà thi đấu (Viridian Gym)'),
        ('gym_sign', ['sign'], 'Bảng tên nhà thi đấu'),
    ]),
    ('door', [
        ('door_ext_brownhouse', [], 'Cửa gỗ nâu cho nhà dân'),
        ('door_ext_bluehouse', [], 'Cửa xanh than'),
        ('door_ext_greenhouse', [], 'Cửa xanh lá đậm'),
        ('door_ext_greyhouse', [], 'Cửa trắng xám'),
        ('door_ext_blue', [], 'Cửa xanh da trời'),
        ('door_ext_green', [], 'Cửa xanh lá nhạt'),
        ('door_ext_old', [], 'Cửa xanh két có ô kính'),
        ('door_ext_office', [], 'Cửa gỗ vân'),
        ('door_ext_yellow', [], 'Cửa vàng nâu'),
        ('door_ext_pink', [], 'Cửa hồng'),
        ('door_green_oak', ['lab'], 'Cửa xanh lá của lab Oak'),
        ('doorframe', [], 'Khung cửa trong nhà (lối sang phòng khác)'),
    ]),
    ('doormat', [
        ('int_mat_2_x_1_doormat_red', ['interior'], 'Thảm chùi chân 2x1 đỏ, đặt ở ô cửa ra'),
        ('int_mat_2_x_1_doormat_blue', ['interior'], 'Thảm chùi chân 2x1 xanh'),
        ('int_mat_2_x_1_doormat_yellow', ['interior'], 'Thảm chùi chân 2x1 vàng'),
        ('int_mat_yellow_2_x_1_door', ['interior'], 'Thảm cửa vàng caro'),
        ('int_mat_1_x_2_door_blue', ['interior'], 'Thảm cửa xanh 1x2'),
        ('mat_01', ['interior'], 'Thảm đỏ dài (nhóm cũ)'),
    ]),
    ('tree', [
        ('tree_2', ['kanto', 'border'], 'Cây tròn xanh đậm 2x2 ô - viền đường/viền map kiểu HGSS'),
        ('tree_2_light', ['border'], 'Cây thông xanh non 2,5 ô'),
        ('tree_2_dark', ['border'], 'Cây thông xanh đậm 2,5 ô'),
        ('tree_2_original', [], 'Cây thông mảnh (tầng lá)'),
        ('tree_original', [], 'Cây thông mảnh (nhóm cũ)'),
        ('tree_basic', [], 'Cây cành xoè lá mỏng'),
        ('tree_large', [], 'Cây cổ thụ tán rộng 8 ô'),
        ('tree_main', ['border', 'group'], 'Cụm 3 hàng thông xanh non (khối viền rừng 8x10 ô)'),
        ('ext_towntree', ['town'], 'Cây nhỏ trong thị trấn'),
        ('ext_tree_small', ['town'], 'Cây thông nhỏ 1 ô'),
        ('ext_tree_smallest_1', ['town'], 'Cây thông tí hon'),
        ('ext_tree_smallest_2', ['town'], 'Cây thông tí hon (bản 2)'),
        ('acorntree', ['town'], 'Bụi cây tròn trên đế cỏ'),
        ('treecut', ['hm'], 'Bụi chặt được (Cut)'),
        ('stump_1', [], 'Gốc cây'),
    ]),
    ('hedge', [
        ('hedge_1', [], 'Khối bụi rào 1x1 có hoa hồng'),
        ('hedge_1_light', [], 'Khối bụi rào 1x1 sáng'),
        ('hedge_1x6', [], 'Hàng rào bụi 1x6'),
        ('hedge_2', [], 'Khối bụi rào vuông đế đất'),
        ('hedge_tile_corner', [], 'Bụi rào dạng ô - góc'),
        ('hedge_tile_end', [], 'Bụi rào dạng ô - đầu mút'),
        ('hedge_tile_left_right', [], 'Bụi rào dạng ô - đoạn ngang'),
        ('hedge_tile_up_down', [], 'Bụi rào dạng ô - đoạn dọc'),
        ('ext_hedge_small', [], 'Bụi thấp 1 ô'),
        ('ext_hedge_smallx4', [], 'Bụi thấp 2x2 ô'),
        ('hedge_shape_1', [], 'Bụi tỉa hình trên nền hoa (trang trí)'),
    ]),
    ('fence', [
        ('fence_small', [], 'Rào gỗ trắng đầu tròn 1 ô (Pallet)'),
        ('fence_small_side', [], 'Rào trắng đầu tròn, đoạn dọc'),
        ('fenceend', [], 'Cọc cuối rào trắng'),
        ('fencesidepole', [], 'Thanh rào trắng nằm ngang'),
        ('fence_roundtop_1', [], 'Rào trắng đầu tròn, dọc'),
        ('fence_roundtop_2', [], 'Rào trắng đầu tròn, ngang'),
        ('fence_02', [], 'Tấm rào mắt cáo gỗ'),
        ('ext_log_fence_pole', [], 'Cọc rào gỗ tròn'),
        ('ext_log_fence_rail', [], 'Thanh rào gỗ 1 ô'),
        ('ext_logpole', [], 'Cọc gỗ to'),
        ('bikefencewhite', [], 'Rào vòm trắng'),
    ]),
    ('ledge', [
        ('jump_left', [], 'Gờ nhảy xuống (một chiều) - đầu trái'),
        ('jump_middle', [], 'Gờ nhảy xuống - đoạn giữa, 1 ô'),
        ('jump_right', [], 'Gờ nhảy xuống - đầu phải'),
    ]),
    ('sign', [
        ('sign_1', [], 'Bảng tin trắng chân kim loại'),
        ('sign_4', [], 'Bảng gỗ nâu 2 chân'),
        ('signsmall1', [], 'Biển nhỏ gỗ một chân (biển tên đường/thị trấn)'),
        ('ext_sign_log', [], 'Biển gỗ khắc chữ 2 cọc'),
        ('ext_logsign_small', [], 'Biển gỗ nhỏ'),
    ]),
    ('mailbox', [
        ('letterbox_1', [], 'Hộp thư trước nhà (nhóm cũ, kiểu HGSS)'),
        ('ext_letterbox_red', [], 'Hộp thư đỏ'),
    ]),
    ('flower', [
        ('flowers', [], 'Ô hoa trắng mọc sát đất 1 ô (Pallet)'),
        ('flowers_2', [], 'Ô hoa trắng thưa'),
        ('flowers_group_1', [], 'Khóm hoa nhiều màu'),
        ('flowers_group_2', [], 'Khóm hoa tím'),
        ('flowers_group_3', [], 'Khóm hoa vàng'),
        ('flowers_group_4', [], 'Khóm hoa xanh lam'),
        ('flowers_group_5', [], 'Khóm hoa hồng'),
        ('animatedflowers', [], 'Khóm hoa đỏ cam (bản có anim ở game gốc, ở đây tĩnh)'),
        ('animatedflowerspink', [], 'Khóm hoa hồng tím'),
        ('animatedflowerswhite', [], 'Khóm hoa trắng'),
        ('plant_flowers_small', [], 'Bụi hoa đỏ nhỏ'),
    ]),
    ('rock', [
        ('rock_1', [], 'Tảng đá xám'),
        ('rock_2', [], 'Cụm đá xám'),
        ('rock_3', [], 'Đá xám cao'),
        ('rock_5', [], 'Đá xám dựng'),
        ('rock_6', [], 'Cụm đá to'),
        ('rock_8', [], 'Đá dẹt'),
        ('rocksmall', [], 'Đá nhỏ nâu'),
        ('rocklarge', [], 'Đá to nâu'),
        ('pebbles', [], 'Sỏi rải mặt đất'),
    ]),
    ('tallgrass', [
        ('pokemongrass_1x1', ['encounter'], 'Cỏ cao 1 ô - ô gặp Pokémon hoang dã (kiểu HGSS)'),
        ('pokemongrass_1x1_2', ['encounter'], 'Cỏ cao 1 ô (màu 2)'),
        ('pokemongrass_1x1_light', ['encounter'], 'Cỏ cao 1 ô, vàng nhạt'),
        ('pokemongrass_4x4', ['encounter'], 'Cỏ cao 4x4 ô'),
        ('pokemongrass_4x4_light', ['encounter'], 'Cỏ cao 4x4 ô, vàng nhạt'),
        ('tallgrass', ['encounter'], 'Cỏ cao dạng lá xoè 1 ô'),
        ('tallgrass_4x4', ['encounter'], 'Cỏ cao dạng lá xoè 4x4'),
    ]),
    ('grass-deco', [
        ('ext_grassfern', [], 'Bụi dương xỉ thấp 1 ô (trang trí, không gặp Pokémon)'),
        ('ext_grassfern light', [], 'Bụi dương xỉ vàng'),
        ('ext_grassfern_4x4', [], 'Thảm dương xỉ 4x4'),
        ('grass_weed', [], 'Nhúm cỏ dại'),
        ('grass_weededge', [], 'Cỏ dại mép'),
        ('garden_grass', [], 'Bụi cỏ xanh'),
        ('smallplant_ground_1', [], 'Cây non trồng đất'),
    ]),
    ('water', [
        ('waves', ['anim-uv'], 'Sóng lăn tăn trên mặt nước 3x3'),
        ('wavescorner', ['anim-uv'], 'Sóng - góc ngoài'),
        ('wavescornerinner', ['anim-uv'], 'Sóng - góc trong'),
        ('wavesend', ['anim-uv'], 'Sóng - đầu mút'),
        ('wavesstart', ['anim-uv'], 'Sóng - đầu vào'),
    ]),
    ('shore', [
        ('beach_center', ['beach'], 'Bãi cát 3x3 - giữa'),
        ('beach_fl', ['beach'], 'Bờ cát/nước - góc trước trái'),
        ('beach_fm', ['beach'], 'Bờ cát/nước - cạnh trước'),
        ('beach_fr', ['beach'], 'Bờ cát/nước - góc trước phải'),
        ('beach_l', ['beach'], 'Bờ cát/nước - cạnh trái'),
        ('beach_r', ['beach'], 'Bờ cát/nước - cạnh phải'),
        ('beach_bl', ['beach'], 'Bờ cát/nước - góc sau trái'),
        ('beach_bm', ['beach'], 'Bờ cát/nước - cạnh sau'),
        ('beach_br', ['beach'], 'Bờ cát/nước - góc sau phải'),
        ('beach_in', ['beach'], 'Bờ cát - góc lõm'),
        ('beach_out', ['beach'], 'Bờ cát - góc lồi'),
        ('beach_invertfl', ['beach'], 'Bờ cát ngược - trước trái'),
        ('beach_invertfr', ['beach'], 'Bờ cát ngược - trước phải'),
        ('beach_invertbl', ['beach'], 'Bờ cát ngược - sau trái'),
        ('beach_invertbr', ['beach'], 'Bờ cát ngược - sau phải'),
        ('ground_grass_to_water_edge_fm', ['grass-water'], 'Bờ cỏ xuống nước 1 ô - cạnh trước'),
        ('ground_grass_to_water_edge_fl', ['grass-water'], 'Bờ cỏ/nước - góc trước trái'),
        ('ground_grass_to_water_edge_fr', ['grass-water'], 'Bờ cỏ/nước - góc trước phải'),
        ('ground_grass_to_water_edge_lm', ['grass-water'], 'Bờ cỏ/nước - cạnh trái'),
        ('ground_grass_to_water_edge_mr', ['grass-water'], 'Bờ cỏ/nước - cạnh phải'),
        ('ground_grass_to_water_edge_rl', ['grass-water'], 'Bờ cỏ/nước - góc sau trái'),
        ('ground_grass_to_water_edge_rm', ['grass-water'], 'Bờ cỏ/nước - cạnh sau'),
        ('ground_grass_to_water_edge_rr', ['grass-water'], 'Bờ cỏ/nước - góc sau phải'),
        ('ground_grass_to_water_inner_large_fl', ['grass-water'], 'Bờ cỏ/nước góc trong lớn 2x2 - trước trái'),
        ('ground_grass_to_water_inner_large_fr', ['grass-water'], 'Bờ cỏ/nước góc trong lớn - trước phải'),
        ('ground_grass_to_water_inner_large_lr', ['grass-water'], 'Bờ cỏ/nước góc trong lớn - sau trái'),
        ('ground_grass_to_water_inner_large_rr', ['grass-water'], 'Bờ cỏ/nước góc trong lớn - sau phải'),
        ('ground_grass_to_water_isfl', ['grass-water'], 'Bờ cỏ/nước góc trong nhỏ - trước trái'),
        ('ground_grass_to_water_isfr', ['grass-water'], 'Bờ cỏ/nước góc trong nhỏ - trước phải'),
        ('ground_grass_to_water_isrl', ['grass-water'], 'Bờ cỏ/nước góc trong nhỏ - sau trái'),
        ('ground_grass_to_water_isrr', ['grass-water'], 'Bờ cỏ/nước góc trong nhỏ - sau phải'),
        ('ground_grass_to_water_hole', ['grass-water'], 'Vũng nước 1 ô giữa cỏ'),
        ('wateredgefrontleft', ['cliff-water'], 'Mép vách đất xuống nước - trước trái'),
        ('wateredgefrontright', ['cliff-water'], 'Mép vách đất xuống nước - trước phải'),
        ('wateredgetopleft', ['cliff-water'], 'Mép vách đất xuống nước - sau trái'),
        ('wateredgetopright', ['cliff-water'], 'Mép vách đất xuống nước - sau phải'),
    ]),
    ('stairs', [
        ('ext_stairs_x1', [], 'Bậc thềm ngoài trời rộng 1 ô, cao 1'),
        ('ext_stairs_x2', [], 'Bậc thềm ngoài trời rộng 2 ô'),
        ('ext_stairs_x3', [], 'Bậc thềm ngoài trời rộng 3 ô'),
        ('int_stairs_main', ['interior'], 'Cầu thang trong nhà - đoạn giữa'),
        ('int_stairs_left', ['interior'], 'Cầu thang trong nhà - mép trái'),
        ('int_stairs_right', ['interior'], 'Cầu thang trong nhà - mép phải'),
        ('int_stairs_top', ['interior'], 'Chiếu nghỉ đầu cầu thang'),
        ('stairs_up_left_1', ['interior'], 'Cầu thang gỗ lên tầng (quay trái) - nhà người chơi'),
        ('stairs_up_right_1', ['interior'], 'Cầu thang gỗ lên tầng (quay phải)'),
        ('stairsdown_1', ['interior'], 'Lỗ cầu thang xuống ở tầng trên'),
    ]),
    ('outdoor-deco', [
        ('ext_bench_wood', [], 'Ghế băng gỗ'),
        ('ext_bin', [], 'Thùng rác lưới'),
        ('ext_lamp_01', [], 'Cột đèn đường'),
        ('shadow_1x1', ['shadow'], 'Bóng đổ vuông 1 ô (đặt dưới vật)'),
        ('shadow_round', ['shadow'], 'Bóng đổ tròn'),
    ]),
    ('interior-shell', [
        ('int_house_1', ['house-int', 'interior-wall'], 'Tường bao tầng trệt nhà người chơi; KHÔNG có sàn (sàn lát bằng ô atlas P1.GROUND)'),
        ('int_house_1_upstairs', ['house-int', 'interior-wall'], 'Tường bao tầng lầu (phòng ngủ) nhà người chơi; không có sàn'),
        ('int_house_1_wall_1', ['interior-wall'], 'Mảng tường trong nhà 2 ô'),
        ('int_house_1_wall_2', ['interior-wall'], 'Mảng tường trong nhà 2 ô (bản 2)'),
        ('int_house_1_wall_3', ['interior-wall'], 'Mảng tường trong nhà 2,5 ô'),
        ('interior_blank_room_1', ['interior-floor', 'interior-wall'], 'Phòng trống sàn gỗ (dùng làm Poké Mart/nhà dân)'),
        ('interior_blank_room_2', ['interior-floor', 'interior-wall'], 'Phòng trống sàn gạch'),
        ('interior_blank_room_3', ['interior-floor', 'interior-wall'], 'Phòng trống lớn sàn gỗ'),
        ('interior_blank_room_4', ['interior-floor', 'interior-wall'], 'Phòng trống hai gian'),
        ('interior_lab_3', ['lab-int', 'interior-floor', 'interior-wall'], 'Vỏ phòng thí nghiệm (lab Oak)'),
        ('pokiecentre', ['pokecenter-int', 'interior-floor', 'interior-wall'], 'Vỏ Trung tâm Pokémon (sàn, tường, quầy)'),
    ]),
    ('pokecenter-int', [
        ('int_pokiecentre_maincounter', [], 'Quầy chính Trung tâm Pokémon (chữ U, 5 ô)'),
        ('int_pokiecentre_maincounter_pcs', [], 'Mảnh quầy có máy tính'),
        ('int_pokiecentre_maincounter_pokieballs', [], 'Bóng Poké trên quầy'),
        ('int_pokiecentre_pokemonheal_machine', ['heal'], 'Máy hồi phục Pokémon'),
        ('int_pokiecentre_pokemonheal_machine_centrre', ['heal'], 'Máy hồi phục (đặt giữa quầy)'),
        ('int_pokiecentre_main_monitor', [], 'Màn hình lớn sau quầy'),
        ('int_pokiecentre_loung_x1', ['furniture'], 'Ghế sofa xanh 1 chỗ'),
        ('int_pokiecentre_loung_x2', ['furniture'], 'Ghế sofa xanh 2 ô'),
        ('int_pokiecentre_loung_x3', ['furniture'], 'Ghế sofa xanh 3 ô'),
        ('int_pokiecentre_l_lounge1', ['furniture'], 'Sofa góc chữ L'),
        ('int_pokiecentre_table', ['furniture'], 'Bàn kính'),
        ('int_pokiecentre_plant', ['plant'], 'Chậu cây'),
        ('int_pokiecentre_bookshelf', ['furniture'], 'Kệ sách trắng'),
        ('int_pokiecentre_kantomap', ['wall'], 'Bản đồ Kanto treo tường'),
        ('int_pokiecentre_pcs_corner', ['pc'], 'Góc máy tính'),
        ('int_pokiecentre_chair_cushion_red', ['furniture'], 'Ghế đôn đỏ'),
        ('pokiecentre_computer_1', ['pc'], 'Máy PC lưu trữ Pokémon'),
        ('int_pokepc', ['pc'], 'Máy PC lưu trữ (bản mới)'),
    ]),
    ('mart-int', [
        ('int_counter_shop_main', [], 'Quầy thu ngân Poké Mart (chữ L)'),
        ('int_counter_shop_blue', [], 'Quầy thu ngân xanh chữ U'),
        ('int_counter_shop_shelf_1', ['shelf'], 'Kệ hàng giữa phòng'),
        ('int_counter_shop_shelf_2', ['shelf'], 'Kệ hàng giữa phòng (bản 2)'),
        ('int_counter_shop_shelves wall', ['shelf'], 'Kệ hàng dựa tường'),
        ('int_counter_shop_fridge', ['shelf'], 'Tủ lạnh đồ uống đôi'),
        ('int_shop_counter_l', [], 'Quầy chữ L'),
        ('int_shop_u_counter', [], 'Quầy chữ U'),
        ('int_shop_corner_1', [], 'Quầy góc'),
        ('int_shop_cupboard_potions_left _potions', ['shelf'], 'Tủ thuốc (trái)'),
        ('int_shop_cupboard_potions_right_potions', ['shelf'], 'Tủ thuốc (phải)'),
        ('int_shop_counter_displaycase', ['shelf'], 'Tủ kính trưng bày'),
        ('int_shop_counter_highshelf', ['shelf'], 'Kệ cao'),
        ('int_shop_fridge_1x', ['shelf'], 'Tủ lạnh đơn'),
        ('shelf_shop', ['shelf'], 'Kệ hàng thấp'),
        ('cashier', [], 'Máy tính tiền'),
        ('int_sign_shop_logo', ['wall'], 'Logo Poké Mart treo tường'),
    ]),
    ('lab-int', [
        ('lab_machine_2', [], 'Máy trong lab (trụ xanh)'),
        ('lab_machine_2_computer', [], 'Dãy máy tính lab'),
        ('lab_system', [], 'Máy lồng kính'),
        ('lab_system2', [], 'Máy lồng kính (bản 2)'),
        ('int_computer_profoak_1', ['pc'], 'Máy tính tròn của GS Oak'),
        ('int_computer_profoak_2', ['pc'], 'Bàn máy của GS Oak'),
        ('int_computer_profoak_3', ['pc'], 'Tủ máy của GS Oak'),
        ('int_computer_profoak_4', ['pc'], 'Quầy máy cong'),
        ('int_pokemontable', [], 'Bàn đặt 3 bóng khởi đầu'),
        ('int_pokemontableitems', [], 'Đồ trên bàn lab'),
        ('pokemonbookcase1', ['bookshelf'], 'Kệ sách lab đôi'),
        ('pokemonbookcase2', ['bookshelf'], 'Kệ sách lab đơn'),
        ('pokemonbookcase3', ['bookshelf'], 'Kệ sách lab đôi (bản 2)'),
        ('int_labcoats', ['wall'], 'Áo blouse treo tường'),
        ('int_lab_machine_elm', [], 'Máy trụ đèn đỏ'),
        ('lab_seed_experiment', [], 'Bàn thí nghiệm hạt giống'),
        ('int_office_whiteboard', ['wall'], 'Bảng trắng'),
    ]),
    ('furniture', [
        ('int_bed_1_red', ['bed'], 'Giường đơn chăn đỏ'),
        ('int_bed_1_blue', ['bed'], 'Giường đơn chăn xanh'),
        ('int_bed_double', ['bed'], 'Giường đôi'),
        ('bed_1', ['bed'], 'Giường gỗ chăn tím'),
        ('int_tv', ['tv'], 'TV trên kệ'),
        ('int_tv_1', ['tv'], 'TV màn phẳng'),
        ('int_cabinet_tv_red', ['tv'], 'Kệ TV đỏ'),
        ('snes', ['console'], 'Máy SNES (phòng người chơi)'),
        ('n64', ['console'], 'Máy N64'),
        ('gamecube', ['console'], 'Máy GameCube'),
        ('bookshelf_1', ['bookshelf'], 'Kệ sách trắng thấp'),
        ('bookshelf_2', ['bookshelf'], 'Kệ sách trắng (bản 2)'),
        ('int_bookshelf_medium_lightwood', ['bookshelf'], 'Tủ gỗ sáng'),
        ('int_shelf_with_books_small_2', ['bookshelf'], 'Kệ sách gỗ hẹp'),
        ('int_table_1_red', ['table'], 'Bàn tròn khăn đỏ'),
        ('int_table_2', ['table'], 'Bàn gỗ mặt vàng'),
        ('table_house', ['table'], 'Bàn khăn caro (bếp nhà người chơi)'),
        ('table_dinner', ['table'], 'Bàn tròn'),
        ('int_chair_1', ['chair'], 'Ghế trắng'),
        ('int_chair_2_red', ['chair'], 'Ghế đỏ'),
        ('chair_wood', ['chair'], 'Ghế gỗ'),
        ('int_sofa_1_red', ['chair'], 'Sofa đỏ'),
        ('int_cupboard_kitchen_1', ['kitchen'], 'Tủ bếp'),
        ('int_kitchen_sink_1', ['kitchen'], 'Bồn rửa + bếp'),
        ('int_fridge_1', ['kitchen'], 'Tủ lạnh'),
        ('int_kitchencabinet_lightwood', ['kitchen'], 'Tủ gỗ bếp'),
        ('int_plant_indoor_1', ['plant'], 'Chậu cây cao'),
        ('int_plant_indoor_2', ['plant'], 'Chậu cây lá to'),
        ('plant_in_pot_1', ['plant'], 'Chậu bonsai'),
        ('int_window_indoor_1', ['window', 'wall'], 'Cửa sổ trong nhà'),
        ('int_windowdouble_curtian', ['window', 'wall'], 'Cửa sổ đôi có rèm'),
        ('int_clock_wall_1', ['wall'], 'Đồng hồ treo tường'),
        ('int_desk_01', ['table'], 'Bàn làm việc gỗ'),
        ('int_draws_1', ['furniture'], 'Tủ ngăn kéo thấp'),
        ('int_bedroom_desk', ['table'], 'Bàn học có kệ'),
        ('int_bin_red', ['deco'], 'Thùng rác đỏ'),
    ]),
    ('rug', [
        ('int_mat_2_x_2_red_2', ['interior'], 'Thảm 2x2 đỏ'),
        ('int_mat_3_x_3_red_2', ['interior'], 'Thảm 3x3 đỏ'),
        ('int_mat_4_x_4_red', ['interior'], 'Thảm 4x4 đỏ viền vàng'),
        ('int_mat_4_x_4_yellow_pb', ['interior'], 'Thảm vàng hình Poké Ball'),
        ('int_mat_round_1', ['interior'], 'Thảm tròn hồng'),
        ('int_carpet_transparentpokeball', ['interior', 'pokecenter-int'], 'Hình Poké Ball dán sàn'),
    ]),
]

# Tên không duy nhất: chọn bundle cụ thể (mặc định: bundle số nhỏ nhất).
PREFER = {'beach_': 'mapassets/', 'shadow_1x1': 'mapassets/', 'shadow_round': 'mapassets/'}


def prop_id(name):
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', name.lower())).strip('_')


def pick(idx, name):
    lst = idx.get(name)
    if not lst:
        raise SystemExit('prefab not found in mdata*: %s' % name)
    for pre, sub in PREFER.items():
        if name.startswith(pre):
            for path, ptr in lst:
                if sub in path:
                    return path, ptr
    return lst[0]


# ---------------------------------------------------------------------------------------------------
def export_props(only=None):
    os.makedirs(TEX, exist_ok=True)
    env = core.load_map_env()
    idx = core.prefab_index(env)
    tc = core.TexCache(TEX, max_size=1024)
    props, report = {}, []
    for group, items in CURATED:
        for name, tags, use in items:
            pid = prop_id(name)
            if only and pid not in only and name not in only:
                continue
            path, ptr = pick(idx, name)
            parts, st = core.collect(ptr.read())
            if not parts:
                raise SystemExit('prefab has no visible mesh: %s' % name)
            lo, hi = core.aabb(parts)
            legacy = float((hi - lo).max()) > LEGACY_MIN or name in LEGACY_FORCE
            if legacy:
                for p in parts:
                    p.pos = p.pos / LEGACY_TILE
                lo, hi = lo / LEGACY_TILE, hi / LEGACY_TILE
            out = os.path.join(ART_MAP, pid + '.glb')
            g = core.export_parts(parts, out, tc, pid)
            tags_all = [group] + tags + (['legacy'] if legacy else [])
            e = {'glb': 'art/map/%s.glb' % pid, 'min': [round(float(x), 3) for x in lo],
                 'max': [round(float(x), 3) for x in hi], 'tags': tags_all, 'use': use, 'src': path}
            if legacy:
                e['legacyScale'] = round(1 / LEGACY_TILE, 6)
            prim = [core.material_desc(p.mat)['extras'].get('atlasCell') for p in parts]
            prim = [c for c in prim if c]
            if prim:
                # Custom/Primitive: ô atlas do MapManager.PaintPrimitiveTile gán lúc chạy theo ô nền của map;
                # glb mang ô mặc định của material.
                e['atlasCell'] = prim[0]
                e['tags'].append('atlas-cell')
            props[pid] = e
            report.append((pid, os.path.getsize(out), len(parts), len(g.materials), legacy))
    used = set(tc.files.values())
    return props, report, used


def export_ground():
    """Ảnh nền: atlas ô của MapManager (TileMaterial '1','2', shader Custom/Tiles), ảnh cỏ/cát/đường của
    đảo màn đăng nhập (PaintTerrain), nước (MapManager.WaterMaterial), cỏ gặp Pokémon."""
    import ttg
    env = ttg.load_core()
    F = ttg.files(env)
    os.makedirs(TEX, exist_ok=True)
    s2, s1, res = F['sharedassets2.assets'], F['sharedassets1.assets'], F['resources.assets']

    def tex_by_name(sf, name, size=None):
        cands = [o for o in sf.objects.values() if o.type.name == 'Texture2D' and o.peek_name() == name]
        best = max(cands, key=lambda o: o.read().m_Width)
        return best.read()
    files = {}

    def save(key, t, alpha=True):
        im = t.image.convert('RGBA' if alpha else 'RGB')
        fn = 'ground_%s.png' % key
        im.save(os.path.join(TEX, fn), optimize=True)
        files[key] = 'art/map/tex/' + fn
        return im
    atlas = save('tiles1', tex_by_name(s2, '1'))
    save('tiles2', tex_by_name(s2, '2'))
    for key, sf, name in [('grass', s1, 'Grass'), ('grass_path', s1, 'GrassgrassPath'), ('dirt_path', s1, 'GrassDirtPath'),
                          ('sand', s1, 'Sand'), ('ground', s1, 'ground'), ('sand_to_water', s1, 'SandToWater'),
                          ('cliff1', s1, 'Cliff1'), ('cliff2', s1, 'Cliff2'),
                          ('dirt_path_solid', s2, 'GrassDirtPathSolid'), ('enc_grass', s2, 'enc_grass'),
                          ('water', res, '0e989bc5eae0aa4382e6ab07300b7b04'), ('water_normal', s2, 'water-normal')]:
        save(key, tex_by_name(sf, name), alpha=key in ('grass_path', 'dirt_path', 'enc_grass'))
    # Tên ô atlas lấy từ material Custom/Primitive* trong mdata (mỗi cái chỉ vào đúng một ô bằng _TileX/_TileY).
    menv = core.load_map_env()
    cells = {}
    for o in menv.objects:
        if o.type.name != 'Material':
            continue
        m = o.read()
        if core._shader_name(m).startswith('Custom/Primitive'):
            F_ = {n: float(v) for n, v in m.m_SavedProperties.m_Floats}
            cells[m.m_Name] = [int(round(F_.get('_TileX', 0) * 64)), int(round(F_.get('_TileY', 0) * 64))]
    # Bỏ tên không tin được: ô (1,62) bị 4 material cũ cùng trỏ (giá trị mặc định, ảnh là ô cát nâu),
    # ô đen tuyền (atlas đã đổi sau khi material được làm).
    share = {}
    for n, c in cells.items():
        share.setdefault(tuple(c), []).append(n)

    def cell_ok(c):
        im = np.asarray(atlas.crop((c[0] * 32, (63 - c[1]) * 32, c[0] * 32 + 32, (64 - c[1]) * 32)).convert('RGB'))
        return im.mean() > 8
    cells = {n: c for n, c in cells.items() if len(share[tuple(c)]) < 3 and cell_ok(c)}
    tile_grid(atlas, cells)
    # Nước của MapManager.
    mm = next(o for o in F['level2'].objects.values() if o.type.name == 'MonoBehaviour'
              and (ttg.script_of(env, o) or ('', ''))[1] == 'MapManager')
    raw = mm.get_raw_data()
    import struct
    fid, pid = struct.unpack_from('<iq', raw, len(raw) - 24)
    wm = F[os.path.basename(mm.assets_file.externals[fid - 1].path)].objects[pid].read()
    C = {n: c for n, c in wm.m_SavedProperties.m_Colors}
    Fw = {n: float(v) for n, v in wm.m_SavedProperties.m_Floats}
    rgb = lambda c: [round(float(c.r), 4), round(float(c.g), 4), round(float(c.b), 4)]
    return {
        'tileSize': 1,
        'atlas': {'img': files['tiles1'], 'img2': files['tiles2'], 'cells': 64, 'cellPx': 32,
                  'uv': 'ô (c, r): u = (c + fu) / 64, v = (r + fv) / 64, r tính từ ĐÁY ảnh (UV Unity); '
                        'three.js TextureLoader mặc định flipY nên dùng thẳng công thức này',
                  'shader': 'Custom/Tiles: ảnh x _Color x màu đỉnh, cắt alpha 0.5, có chiếu sáng',
                  'named': dict(sorted(cells.items())),
                  'note': 'MapDump.Settings.Tileset chọn atlas 1 hay 2; MapManager dựng lưới ô 1x1 đơn vị, '
                          'mỗi ô một quad UV vào một ô atlas (GetTileUV), tường khi chênh độ cao (SideType Left/Front/Right).'},
        'textures': {k: v for k, v in files.items() if not k.startswith('tiles')},
        'island': {'grassTiling': 0.5, 'note': 'Đảo màn đăng nhập: material Grass (Custom/Tiles) lặp ảnh Grass x0.5/đơn vị UV, '
                                               'màu đỉnh từ MapVertex (xám 0.47..1.27) làm sáng/tối vùng'},
        'water': {'shader': 'PSX/Water2', 'color': rgb(C['_Color']), 'horizon': rgb(C['_HorizonColor']),
                  'transparency': round(Fw.get('_Transparency', 0.85), 3), 'tex': files['water'],
                  'normal': files['water_normal'], 'waveScale': round(Fw.get('_WaveScale', 0.05), 4),
                  'note': 'MapManager.WaterMaterial; WaterColourNormal/Cave/Spooky đổi _Color theo map'},
    }


def tile_grid(atlas, cells):
    """Ảnh tra ô atlas (ngoài repo): mỗi ô phóng to, ghi (c,r) và tên material Primitive nếu có."""
    from PIL import ImageDraw, ImageFont
    os.makedirs(CATALOG_TILES, exist_ok=True)
    try:
        f = ImageFont.truetype('arial.ttf', 10)
    except Exception:
        f = ImageFont.load_default()
    names = {}
    for n, (c, r) in cells.items():
        names.setdefault((c, r), []).append(n)
    Z = 72
    for q in range(4):  # 4 tờ, mỗi tờ 16 hàng
        rows = range(63 - q * 16, 63 - q * 16 - 16, -1)
        sheet = Image.new('RGB', (64 * Z // 2, 16 * Z // 2 * 2), (20, 20, 24))
        d = ImageDraw.Draw(sheet)
        for j, r in enumerate(rows):
            for c in range(64):
                y0 = (63 - r) * 32
                cell = atlas.crop((c * 32, y0, c * 32 + 32, y0 + 32)).convert('RGB').resize((Z // 2, Z // 2), Image.NEAREST)
                sheet.paste(cell, (c * Z // 2, j * Z))
                d.text((c * Z // 2 + 1, j * Z + Z // 2 + 1), '%d,%d' % (c, r), fill=(220, 220, 220), font=f)
                if (c, r) in names:
                    d.text((c * Z // 2 + 1, j * Z + Z // 2 + 12), names[(c, r)][0][:7], fill=(255, 210, 90), font=f)
        sheet.save(os.path.join(CATALOG_TILES, 'tiles1_rows_%02d-%02d.png' % (rows[-1], rows[0])), optimize=True)


# ---------------------------------------------------------------------------------------------------
def read_js():
    out = {}
    if os.path.exists(DATA_JS):
        for ln in open(DATA_JS, encoding='utf-8'):
            m = re.match(r'P1\.(\w+) = (.*);\s*$', ln)
            if m:
                out[m.group(1)] = json.loads(m.group(2))
    return out


def write_js(d):
    lines = ['// Sinh bởi tools/rip_map.py - không sửa tay. Hợp đồng: ARCH.md, chi tiết: tools/README-map.md.',
             '// Toạ độ khung three.js (x Unity đã đảo; máy ảnh game ở +z nhìn về -z), đơn vị Unity: 1 đơn vị = 1 ô bản đồ.',
             'window.P1 = window.P1 || {};']
    for k in ('PROPS', 'GROUND', 'TITLE_SCENE'):
        if k in d:
            lines.append('P1.%s = %s;' % (k, json.dumps(d[k], ensure_ascii=False, separators=(',', ':'))))
    with open(DATA_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines) + '\n')


def update_readme(props):
    """Bảng prop trong README-map.md (giữa hai dấu mốc) sinh lại từ CURATED + cỡ đã đo."""
    p = os.path.join(HERE, 'README-map.md')
    if not os.path.exists(p):
        return
    rows = []
    for group, items in CURATED:
        rows.append('\n**%s**\n\n| id | cỡ x×y×z (ô) | gợi ý |\n|---|---|---|' % group)
        for name, _, use in items:
            e = props.get(prop_id(name))
            if e:
                size = '×'.join('%.1f' % (b - a) for a, b in zip(e['min'], e['max']))
                rows.append('| `%s`%s | %s | %s |' % (prop_id(name), ' (L)' if 'legacyScale' in e else '', size, use))
    src = open(p, encoding='utf-8').read()
    a, b = '<!-- BẢNG PROP: rip_map.py tự ghi -->', '<!-- HẾT BẢNG PROP -->'
    if a in src and b in src:
        src = src[:src.index(a) + len(a)] + '\n' + '\n'.join(rows) + '\n\n' + src[src.index(b):]
        with open(p, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(src)


def mb(path):
    tot = 0
    for root, _, fs in os.walk(path):
        tot += sum(os.path.getsize(os.path.join(root, f)) for f in fs)
    return tot / 1e6


def main():
    args = sys.argv[1:]
    parts = [a for a in args if a in ('props', 'ground', 'title')] or ['props', 'ground', 'title']
    only = {a for a in args if a not in ('props', 'ground', 'title')}
    d = read_js()
    t0 = time.time()
    if 'props' in parts:
        props, report, used = export_props(only or None)
        if only:
            d.setdefault('PROPS', {}).update(props)
        else:
            d['PROPS'] = props
            keep = {os.path.basename(p['glb']) for p in props.values()}
            for f in os.listdir(ART_MAP):
                if f.endswith('.glb') and f not in keep:
                    os.remove(os.path.join(ART_MAP, f))
            for f in os.listdir(TEX):
                if not f.startswith('ground_') and f not in used:
                    os.remove(os.path.join(TEX, f))
            update_readme(props)
        print('props: %d glb, %d legacy, %.1f MB glb' % (len(report), sum(r[4] for r in report), sum(r[1] for r in report) / 1e6))
    if 'ground' in parts:
        d['GROUND'] = export_ground()
        print('ground: %d ảnh, %d ô atlas có tên' % (len(d['GROUND']['textures']) + 2, len(d['GROUND']['atlas']['named'])))
    if 'title' in parts:
        import rip_map_title
        info, rep = rip_map_title.build_title(GAME)
        d['TITLE_SCENE'] = info
        print('title:', rep)
    write_js(d)
    print('art/map %.1f MB, art/title %.1f MB, %.0fs' % (mb(ART_MAP), mb(os.path.join(GAME, 'art', 'title')), time.time() - t0))


if __name__ == '__main__':
    main()
