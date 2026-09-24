# Xuôi Dòng

Game lái nhà thuyền kiểu thư giãn. Chiếc thuyền đỏ đứng ở một phần ba bên trái màn hình, còn thế giới trôi từ phải sang trái: hẻm đá đỏ, rừng thông, đầm lầy, hang đá, cửa sông, rồi ra biển, xong lại vòng về. Ngày nối đêm (7 phút một vòng), trời có lúc mưa, hiếm khi có giông. Vớt cá bằng tấm lưới ở mũi thuyền, vớt thùng hòm trôi, hú còi cho chim bay. Không có thua, không có màn "hết lượt".

Chủ dự án yêu cầu ngày 2026-09-24: "dựa trên asset Farming Camp Demo trên steam hãy làm 1 game lái thuyền chill chill trên sông, biển có ngày đêm, vfx, anim, sound chỉnh chu", rồi thêm "không phải minigame chèo thuyền mà có cái thuyền to lun á", kèm đoạn trailer chiếc nhà thuyền đỏ chạy trên sông.

## Điều khiển

| Việc | Bàn phím | Cảm ứng |
|---|---|---|
| Lái lên / xuống | W S hoặc ↑ ↓ | kéo ngón tay lên xuống ở đâu cũng được, thuyền trôi dần theo ngón |
| Chậm lại / nhanh lên | A D hoặc ← → | (tự thả trôi) |
| Hú còi (chim bay, ếch nhảy) | Space hoặc H | nút **Còi** |
| Tạm dừng | P hoặc Esc | nút ‖ |
| Tắt / bật tiếng | M | nút loa |
| Sổ cá | J | trong màn đầu và bảng tạm dừng |

Lưới nằm ở mũi thuyền, bên phải thân. Cá là những cái bóng tối bơi dưới nước, thỉnh thoảng vọt lên khỏi mặt nước. Lái lưới qua bóng cá là bắt được. Thùng gỗ và hòm gỗ chạm vào là vớt (+3 điểm). Mũi tên xanh cho thuyền lướt nhanh ba giây. Đá, khúc gỗ và cá sấu làm thuyền rung, mất 3 điểm và 1–2 con cá nhảy khỏi lưới. Thuyền trượt dần ra khỏi hòn đá chứ không va lần hai.

Màn dọc (390×844) vẫn chơi được. Cảnh thu vào một dải phía trên, phần dưới để trống làm chỗ kéo ngón tay, và có dòng nhắc xoay ngang để nhìn xa hơn. Đã cân nhắc chuyện ép xoay bằng CSS như Chuyến Tàu Cuối nhưng bỏ: game này chỉ cần một ngón kéo dọc, nên cầm máy dọc vẫn lái thoải mái.

## Tệp

| Tệp | Làm gì |
|---|---|
| `index.html` | Khung trang, CSS, giao diện DOM (màn đầu, HUD, tạm dừng, sổ cá). Mọi `<script>` gắn `?v=<rev>` |
| `js/data.js` | Mọi bảng: `TUNE`, `BIOMES`, `ROUTE`, `FISH`, `KINDS`, `BIRDS`, `BOATS`, `BOAT_PTS`, `DAY`, `WEATHER`, `MIX`. Code không rẽ nhánh theo tên khúc sông hay tên giờ |
| `js/game.js` | Mô phỏng: lộ trình, trộn khúc, sinh vật thể, chạm, cá, thời tiết, nhập liệu, móc gỡ lỗi |
| `js/render.js` | Vẽ ở độ phân giải ảo vào một canvas đệm rồi phóng một lần với hệ số nguyên. Ánh sáng là một bộ đệm nhân (multiply) cộng quầng sáng (lighter) |
| `js/audio.js` | Bộ trộn WebAudio: master → music / amb / sfx. Mọi vòng lặp phát chồng đuôi 3,5 giây |
| `js/ui.js` | Nối DOM với trạng thái game |
| `art/atlas.png`, `art/atlas.js` | 265 khung sprite, sinh bởi `tools/rip.py` |
| `art/floor.png` | Đáy sông (tilemap `WaterTilemap` của level9, 72×15 ô) |
| `art/bank_<khúc>_top.png`, `_bot.png` | Bờ trên / bờ dưới của 4 khúc sông, nướng từ scene level9 |
| `audio/*.mp3`, `audio/audio.js` | 45 tệp tiếng và bảng thời lượng |
| `tools/rip.py` | Rút toàn bộ art và tiếng ở trên, chạy lại được |

Kiểm: `node test/xuoi-dong-suite.js` (thêm `--thumb` để chụp lại `assets/thumbnails/xuoi-dong.png`).

Móc gỡ lỗi qua URL: `?t=0.85&biome=sea&weather=rain&seed=3&boat=pink&play=1&freeze=1`. `t` là giờ (0 = nửa đêm, 0.5 = trưa), `biome` nhảy tới chặng đầu tiên có khúc đó, `x=` nhảy tới toạ độ thế giới, `freeze=1` đứng đồng hồ, `play=1` bỏ qua màn đầu, `shot=1` giấu giao diện.

## Chạy lại tools/rip.py

Cần Python 3.8 có `UnityPy` và `Pillow`, `ffmpeg`/`ffprobe` trên PATH, và `vgmstream-cli` (bản Windows ở github.com/vgmstream/vgmstream/releases).

```
set PYTHONIOENCODING=utf-8
set VGMSTREAM=C:\đường\dẫn\vgmstream-cli.exe
python games/xuoi-dong/tools/rip.py          # art + audio
python games/xuoi-dong/tools/rip.py art      # chỉ art (~1 phút)
```

`FC_DATA` đổi được nếu Steam cài chỗ khác (mặc định `D:\Steam\steamapps\common\Farming Camp Demo\Farming Camp_Data`). Muốn đổi sprite nào thì sửa bảng `SPRITES`; đổi tiếng thì sửa `AUDIO`. Mỗi dòng tiếng ghi cả tên subsong, và rip dừng lại nếu tên trong bank không khớp. Tệp mp3 không còn trong bảng sẽ bị xoá, nên chạy lại luôn ra cùng một bộ tệp.

## Nguồn và bản quyền

Toàn bộ hình và tiếng lấy từ **Farming Camp Demo** (Innerfire Studios, phát hành SOEDESCO), rút từ bản cài Steam trên máy chủ dự án, dùng theo yêu cầu của chủ dự án ngày 2026-09-24. Đây không phải tài sản của repo này. Muốn gỡ thì xoá `games/xuoi-dong/art` và `games/xuoi-dong/audio`. Tên cá lấy từ bảng chữ tiếng Anh của demo (`localization-string-tables-english(en)`) khi có: Salmon, Trout, Tiger Barb, Bass, Grouper, Golden Trout. Ba tên còn lại (Cá chép, Cá hồng, Cá thu) là tự đặt.

## Các con số

- [ĐO TRONG REPO] Dung lượng: art 1,9 MB, audio 9,1 MB, tổng thư mục khoảng 11 MB.
- [ĐO TRONG REPO] Bề ngang lòng sông trong level9: hẻm đá 242 px, rừng 245 px, hang 242 px, đầm 328 px. Game không giữ số gốc: bờ trên và bờ dưới là hai ảnh riêng, nên mỗi bờ được đặt đúng vào mép ±110 px quanh tâm sông. Nhờ vậy chuyển khúc chỉ cần trộn, không phải nhảy.
- [ĐO TRONG REPO] Âm lượng trung bình của các nền môi trường gốc lệch nhau tới 22 dB (FC_NightBG −53,5 dB, FC_waterclose −31 dB). `rip.py` kéo mọi nền về −30 dB lúc mã hoá, nên bảng `MIX.beds` chỉ còn là tỉ lệ.
- [ĐO TRONG REPO] Thời gian một khung (Chromium headless, trung vị): trước khi vẽ ở độ phân giải ảo thì 33,3 ms ở 1920×1080 và 50 ms ở 844×390 dpr 3. Sau đó là 16,7 ms ở cả ba cỡ 1280×720, 1920×1080 và 844×390 dpr 3.
- [ĐỀ XUẤT] Tốc độ thả trôi 72 px/s. Lộ trình dài 40.400 px, tức khoảng 9 phút rưỡi một vòng. Một ngày dài 420 giây.

## Bẫy đã gặp

- [BẪY ĐÃ SẬP] `light_v2` trong resources.assets **không phải** quầng sáng tròn mềm. Nó là hình bóng đèn có tia, nên đèn cabin ban đêm hiện thành một cái bóng đèn to đùng. Quầng sáng giờ vẽ bằng `createRadialGradient`.
- [BẪY ĐÃ SẬP] `WaterTexture` cũng không phải hoa văn vảy của trailer. Nó chỉ là nền cyan có vạch sóng, dùng làm đầu vào shader. Hoa văn sỏi lục giác nằm ở các ô `WaterFloor_A/B/C` của tilemap `WaterTilemap`. `rip.py` dựng lại đúng tilemap đó thành `floor.png`, còn vạch sóng được tách ra thành khung `WaterLines` để phủ mờ.
- [BẪY ĐÃ SẬP] Bốn khúc sông `P_*RiverGen_A` trong level9 đều là GameObject **đang tắt**, vì game bật chúng lúc chạy. Lọc "chỉ lấy vật đang bật" theo cả cây cha thì ảnh nướng ra trống trơn. Giờ chỉ xét cờ bật của chính renderer.
- [BẪY ĐÃ SẬP] `Boat_*`/`BoatB_*` có pivot (0.5, 0.2), còn `BoatJP_*`/`BoatJefferson_*` là (0.5, 0.0), dù khung vẽ y hệt nhau. Để nguyên thì đổi bạn đồng hành là thuyền nhảy 30 px. Đã ép pivot trong `PIVOT_OVERRIDE`.
- [BẪY ĐÃ SẬP] `XD.MIX` từng có hai khoá `sfx`: một số âm lượng bus và một bảng tiếng. Khoá sau đè khoá trước, `gain.value = {…}` ném "non-finite", và cả bộ âm thanh chết lặng. Bộ kiểm bắt được lỗi này. Âm lượng bus giờ nằm trong `MIX.bus`.
- [BẪY ĐÃ SẬP] Va đá có hồi 2 giây nhưng thuyền vẫn nằm đè lên đá, nên hết hồi là va lần hai và mất sạch cá. Giờ còn cọ vào đá thì thân thuyền trượt dần ra.
- [BẪY ĐÃ SẬP] Các lượt phủ toàn màn (nhân ánh sáng, tông màu, viền tối) vẽ ở pixel thật thì tốn theo diện tích màn hình. Xem số đo ở trên.
- [BẪY ĐÃ SẬP] Ảnh màn đầu `MainMenu_*` vẽ một con đường núi, không phải dòng sông. Lớp `…B` của nó cần shader ánh sáng của Unity, ghép thô thì ban đêm hiện những mảng xanh chanh. Màn đầu giờ dùng chính cảnh sông đang chạy (thuyền tự lái), còn logo pixel Farming Camp nằm ở dòng ghi nguồn.
- [BẪY ĐÃ SẬP] Máy này `python` là shim của cmd. Gõ `python -` trong Bash tool thì nó đứng chờ stdin tới hết giờ. Ghi script ra tệp rồi chạy.
- Tên sprite lặp lại giữa nhiều tệp `sharedassets*`. `rip.py` lấy bản gặp đầu tiên.
- Sprite ở chế độ vẽ lát (`drawMode ≠ 0`, như `WaterTexture` phóng 40 lần, thác nước) bị bỏ qua lúc nướng bờ. Khe vòm đá của hẻm núi vốn lộ thác nước, nên được lót bằng đáy sông.
