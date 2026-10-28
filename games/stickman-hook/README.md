# Stickman Hook (web)

Bản web của Stickman Hook (Madbox, Android 9.9.60), dựng lại bằng Canvas 2D, không engine.
Chế độ chơi chính đầy đủ: 64 màn dựng tay của bản gốc, từ màn 65 trở đi ghép ngẫu nhiên đúng như bản gốc, không giới hạn số màn.
Nạp khoảng 215 KB (bản gốc 848 MB).

- Hình, font, tiếng: bóc từ APK, không tự vẽ.
- Màn chơi: bóc từ prefab pattern của `NormalGamePlayConfig`.
- Luật chơi: đọc từ mã IL2CPP đã dịch ngược. Xem `docs/GAMEPLAY.md`, mỗi luật có địa chỉ lệnh ARM đi kèm.

Không làm: skin (336 bundle, khoảng 600 MB), các chế độ Adventure/Challenge/Pachinko/Tournament, quảng cáo, thẻ "second chance".

## Cách chơi

- Giữ chuột, chạm màn hình, hoặc giữ Space: móc vào điểm móc gần nhất.
- Thả ra: bay đi.
- Qua vạch caro là xong màn.
- Rơi khỏi mép dưới hoặc mép trái camera khi không móc: chơi lại từ đầu màn.
- `?level=N` mở thẳng màn N. Phím `R` chơi lại. Tiến độ lưu trong `localStorage` (`stickman-hook`).

## Tệp

| Tệp | Vai trò |
|---|---|
| `js/level.js` | Ghép màn từ pattern. Có bản port `System.Random` của .NET |
| `js/physics.js` | Thân tròn treo trên lò xo, va chạm capsule/polygon, trạng thái hoạt hình |
| `js/render.js` | Camera orthographic, vẽ sprite từ atlas, bóng, font bitmap |
| `js/main.js` | Vòng lặp, các pha `spawn → play → finish`, camera, HUD, chọn màn |
| `data/levels.json` | 123 pattern (toạ độ thế giới) cùng danh sách màn |
| `data/font.json` | Bảng glyph của font Junegull |
| `art/atlas.webp` | Atlas sprite |
| `art/font.webp` | Font Junegull |
| `tools/build_data.py` | Tạo `levels.json` và atlas |
| `tools/build_font.py` | Nướng font TMP SDF thành bitmap |
| `tools/thumb.js` | Chụp ảnh thẻ hub |
| `tools/extract/` | Bóc dữ liệu từ APK, dịch ngược ARM |

## Dựng lại từ APK

Nguồn nằm ngoài git ở `D:\stickman-hook-ref`, gồm xapk, APK đã giải nén, `il2cpp/` (đầu ra Il2CppDumper), `dump/`, `sprites/`.

```sh
cd D:/stickman-hook-ref
py -3 -I tools/cabmap.py && py -3 -I tools/scripts_map.py
py -3 -I tools/extract_raw.py defaultlocalgroup_assets_stickmanhook_gamemodes_normalgameplayconfig_33940f3efbece7e4ff10381e9cdb258e.bundle dump/normal_raw.json
py -3 -I tools/export_sprites.py D:/stickman-hook-ref/sprites <normal bundle> <generalservices gameplayconfig bundle> <skins_basic_animationcontroller bundle> -- --all-prefix AN_Grap1_Bumper A_ C_Wall D_Wall AAA_GE CHAR_Classic in_game GradientVertical UI
cd D:/survivor-web-hub/games/stickman-hook/tools && py -3 -I build_data.py && py -3 -I build_font.py
```

Ghi chú:

- Các script trong `tools/extract/` đọc từ `D:/stickman-hook-ref/tools/`, nên chép chúng về đó trước khi chạy.
- Dịch ngược một method: `py -3 -I tools/arm_method.py 'PlayerHookController\$\$Grab'`.
- `libil2cpp.so` là ARMv7, metadata v31. Il2CppDumper đọc được với `ForceDump`.

## Luật gốc đã dùng

Đo trong prefab và cấu hình:

- Người chơi: thân tròn bán kính 0.1125 (0.375 × scale 0.3), khối lượng 2, trọng lực −9.81 × 1.1, không ma sát.
- Bước vật lý 0.02 s. `physics.js` chia mỗi bước thành 5 bước con.
- Dây: `SpringJoint2D` 3 Hz, giảm chấn 0.5. Độ dài nghỉ = khoảng cách lúc móc − 0.5808.
  - 0.5808 là độ dài anchor chưa nhân scale. Vì thế lúc móc có cú giật nhẹ, đúng như bản gốc.
- Bumper: `BumperMaterial` nảy 1.4, kết hợp kiểu Maximum. Tường không nảy.
- Camera: ortho size 5 (cao 10 đơn vị), y khoá ở 0, x giới hạn giữa `StartCamera` và `EndCamera`.
- Game gốc chơi màn dọc (`screenOrientation = 1`).

Đọc từ mã IL2CPP:

- Chọn điểm móc gần nhất, không giới hạn tầm.
- Nhả dây được đẩy lên 0.15 m/s, tối đa một lần mỗi 0.5 s, và xoay `|v| × 200` độ/s.
- Chạm tường xoay theo tốc độ tiếp tuyến × 200.
- Về đích: thân thành kinematic, thời gian chậm về 5% trong 0.6 s, camera zoom về 2 trong 0.5 s.
- Ghép màn ngẫu nhiên (`PatternSpawner`): mỗi ô Start/Middle/Finish lọc pattern có `entryPositions & lối ra trước != 0`, rồi chọn bằng `new System.Random(chỉ số màn).Next(số ứng viên)`.
  - Mỗi ô tạo một `Random` mới với cùng seed.

Tự đặt, có nhãn `[ĐỀ XUẤT]` vì không có trong code (scene ProCamera2D không có typetree):

- Độ dẫn trước của camera: `vx × 0.2`, kẹp trong ±1.2.
- Vùng chết: ra khỏi mép khung 0.3 đơn vị.
- Hiệu ứng xuất hiện: vòng tròn mờ 0.75 s.

## Bẫy đã sập

- **Gốc prefab lệch.** 30 pattern Finish có gốc ở x=37. `Instantiate` rồi gán `transform.position` sẽ bỏ vị trí gốc.
  - Lần đầu mình cộng vị trí gốc vào mọi thứ, nên cả đoạn cuối màn bị đẩy xa 37 đơn vị: bot thấy một khoảng trống không thể qua.
  - `build_data.py` giờ bỏ vị trí gốc, giữ xoay và scale.
- **`End_Solo12` bị tắt** nhưng vẫn được đọc vị trí. Nếu bỏ qua object tắt thì màn 6 mất điểm nối.
- **Ảnh `GradientVertical` mờ dần ở hai mép.** Kéo giãn cả ảnh sẽ ra sọc ở mép phải màn hình, nên chỉ lấy cột giữa.
- **`data.unity3d` không có typetree.**
  - `CameraConfig` đọc thô: byte 44 trở đi là `0.01, 5, 15`.
  - `Physics2DSettings` đọc thô: gravity ở byte 4.
- **Màn khó không phải lỗi vật lý.** Màn 12 phải móc từ xa khoảng 9 đơn vị ngay khi rời máng. Màn 41 phải lăn quanh vòng tường bao điểm móc.
  - Bot ban đầu không làm được hai việc này. Đừng sửa vật lý để bot qua màn.

## Kiểm

```sh
node test/stickman-hook-sim.js
```

Bot chạy trên chính `physics.js`, có quay lui theo từng cú móc. Nó phải qua cả 64 màn cố định và 30 màn ngẫu nhiên (65, 72, …, 268), với camera dọc 9:16. Mất khoảng 4 phút.

```sh
SH_URL=<Pages> node test/stickman-hook-play.js
```

Bài kiểm này chạy trên trình duyệt thật: mở game, móc, về đích, chuyển màn.

## Tăng số bản

Đổi mọi `?v=` trong `index.html` và `js/main.js` (hằng `V`), rồi đổi `rev` trong `data/games.js` cho trùng.
