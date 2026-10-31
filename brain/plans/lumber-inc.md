# Lumber Inc lên web (kiểu My Mini Mart)

Chủ dự án giao 2026-10-31: tải XAPK `com.seikami.lumber.inc` (Lumber Inc 0.6.5, Seikami, 149 MB) rồi "đưa game này lên web như my mini market" = dựng lại bằng three.js + JS thuần từ asset gốc, không Unity WebGL (xem [[my-mini-mart-web]]).

## Nguồn

- `D:\lumber-ref`: `dl/lumber.xapk`, `apk/base` (base apk), `apk/v7a` (libil2cpp.so ARMv7), `il2cpp-dump/` (Il2CppDumper, metadata v31, Unity 2022.3.62f2), `udk-out/` (Ghidra decompile, đang dựng).
- Bảng luật chơi là TSV đọc thẳng: `apk/base/assets/config/*.txt` (61 bảng: UpgradeConf, ProdSpdConf, ProdIncomeConf, BackpackConf, EmployeeConf, guide_step...). Chữ tiếng Anh ở `language_en.txt`.
- Asset là Addressables (250 bundle ở `assets/aa/Android`, catalog giải bằng `tools/catalog.py`).
- Clip tham khảo: GAyA4bh8iS0 (2023, bản gần nhất với 0.6.5), Sa5icGnWgO4 (2025, HUD mới hơn). Ảnh ở scratchpad phiên 651ce703.

## Cấu trúc game (đo trong asset)

Map 1 = prefab `DemoWorld` (bundle world-1) + 7 phần `WorldAsyncLoadCtrller` nạp lúc chạy (world-1-parts): rừng `Pre_Forest1_1` (795 cây `TreeCtrller`), 2 dây chuyền `Pre_Factory1_1/1_2` (3 máy bóc vỏ + 3 máy cắt vuông mỗi dây), kho `Pre_WareHouses1`, trạm xe tải `Pre_Vehicle1`, nhà nhân viên `Pre_Employee`, thị trấn `Pre_HomeTown` (23 lô nhà + công trường).
Mọi công trình kế thừa `BuildingCtrller`: id, lockRoot/activeRoot, ô trả tiền (LockSize/Offset), UnlockNeeds, cấp người chơi, PreBuildings.

## Các bước

1. [x] Tải, bóc, dump IL2CPP, giải catalog.
2. [x] `tools/export_world.py world1` (sửa từ export_store của casual-farm, thêm splat): 4573 node, geo.glb 2,7 MB.
3. [x] `tools/export_data.py`: data/config.json (61 bảng), data/lang-en.json.
4. [x] Nhân vật + hoạt ảnh (Animancer, RoleAnimSO) -> art/chars, art/props, art/anim.
5. [x] UI sprite + layout panel, font, tiếng -> art/ui, art/sfx.
6. [x] Decompile Ghidra phần GameWish.* -> luật chơi có dẫn nguồn (D:/lumber-ref/rules).
7. [x] Sim thuần JS: công trình, cây, chặt, ba lô, máy, xe tải, tiền, thợ, nâng người chơi, nhiệm vụ, cấp, sao nghiên cứu, lưu.
8. [x] View: thế giới, nhân vật, chồng gỗ, ô trả tiền, HUD, bảng thuê thợ / nâng người chơi / chọn máy; khung dọc 750:1334.
9. [x] Thẻ hub, deploy (108b9de2, rev 20261031a), test Pages 14/14. Rev 20261031b thêm bảng thuê, bảng nâng, sao nghiên cứu.
10. [ ] Sau mốc đầu: đổi model máy theo sao (NewPrefab), mở lại bảng chọn máy ở trigger show của nhà máy, tiền bay, mũi tên hướng dẫn, thợ xây và thị trấn, map 2-3, cửa hàng.
