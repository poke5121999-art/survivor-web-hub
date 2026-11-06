# Xuôi Dòng

Game lái nhà thuyền kiểu thư giãn. Chiếc thuyền đỏ đứng ở một phần ba bên trái màn hình, còn thế giới trôi từ phải sang trái: hẻm đá đỏ, rừng thông, đầm lầy, hang đá, cửa sông, rồi ra biển, xong lại vòng về. Ngày nối đêm (140 giây một vòng), trời có lúc mưa, hiếm khi có giông. Vớt cá bằng tấm lưới ở mũi thuyền, vớt thùng hòm trôi, hú còi cho chim bay. Không có thua, không có màn "hết lượt".

Chủ dự án yêu cầu ngày 2026-09-24: "dựa trên asset Farming Camp Demo trên steam hãy làm 1 game lái thuyền chill chill trên sông, biển có ngày đêm, vfx, anim, sound chỉnh chu", rồi thêm "không phải minigame chèo thuyền mà có cái thuyền to lun á", kèm đoạn trailer chiếc nhà thuyền đỏ chạy trên sông.

Vòng hai (rev `20260924b`), sau khi chơi bản đầu trên Pages: "bỏ bớt đá đi, lâu lâu mới có thôi", "giảm số lượng vật cản xuống", "cho thuyền chạy nhanh lên", "tui nhớ game có fx trail sau thuyền á", "cho thời gian ngày đêm chạy nhanh lên x3", "anim của thuyền cũng chưa mượt lắm".

## Điều khiển

| Việc | Bàn phím | Cảm ứng |
|---|---|---|
| Lái lên / xuống | W S hoặc ↑ ↓ | kéo ngón tay lên xuống ở đâu cũng được, thuyền trôi dần theo ngón |
| Chậm lại / nhanh lên | A D hoặc ← → | (tự thả trôi) |
| Hú còi (chim bay, ếch nhảy) | Space hoặc H | nút **Còi** |
| Tạm dừng | P hoặc Esc | nút ‖ |
| Tắt / bật tiếng | M | nút loa |
| Sổ cá | J | trong màn đầu và bảng tạm dừng |

Lưới nằm ở mũi thuyền, bên phải thân. Cá là những cái bóng tối bơi dưới nước, thỉnh thoảng vọt lên khỏi mặt nước. Lái lưới qua bóng cá là bắt được. Thùng gỗ và hòm gỗ chạm vào là vớt (+3 điểm). Mũi tên xanh cho thuyền lướt nhanh ba giây. Đá, khúc gỗ và cá sấu làm thuyền rung, mất 3 điểm và 1–2 con cá nhảy khỏi lưới. Thuyền trượt dần ra khỏi hòn đá chứ không va lần hai. Vật cản đi theo lịch riêng: 12–15 giây mới gặp một cái, không bao giờ hai cái cùng lúc trên màn, và đoạn ngay sau mỗi cái để trống.

Màn dọc (390×844) vẫn chơi được. Cảnh thu vào một dải phía trên, phần dưới để trống làm chỗ kéo ngón tay, và có dòng nhắc xoay ngang để nhìn xa hơn. Đã cân nhắc chuyện ép xoay bằng CSS như Chuyến Tàu Cuối nhưng bỏ: game này chỉ cần một ngón kéo dọc, nên cầm máy dọc vẫn lái thoải mái.

## Tệp

| Tệp | Làm gì |
|---|---|
| `index.html` | Khung trang, CSS, giao diện DOM (màn đầu, HUD, tạm dừng, sổ cá). Mọi `<script>` gắn `?v=<rev>` |
| `js/data.js` | Mọi bảng: `TUNE`, `BIOMES`, `ROUTE`, `FISH`, `KINDS`, `BIRDS`, `BOATS`, `BOAT_PTS`, `FOAM`, `DAY`, `WEATHER`, `MIX`. Code không rẽ nhánh theo tên khúc sông hay tên giờ |
| `js/game.js` | Mô phỏng: lộ trình, trộn khúc, sinh vật thể, chạm, cá, thời tiết, nhập liệu, móc gỡ lỗi |
| `js/render.js` | Cảnh vẽ ở độ phân giải ảo vào một canvas đệm rồi phóng một lần với hệ số nguyên. Riêng thuyền dán lên sau, ở pixel thật (xem bẫy "thuyền giật" bên dưới). Ánh sáng là một bộ đệm nhân (multiply) cộng quầng sáng (lighter) |
| `js/audio.js` | Bộ trộn WebAudio: master → music / amb / sfx. Mọi vòng lặp phát chồng đuôi 3,5 giây |
| `js/ui.js` | Nối DOM với trạng thái game |
| `art/atlas.png`, `art/atlas.js` | 265 khung sprite, sinh bởi `tools/rip.py` |
| `art/floor.png` | Đáy sông (tilemap `WaterTilemap` của level9, 72×15 ô) |
| `art/bank_<khúc>_top.png`, `_bot.png` | Bờ trên / bờ dưới của 4 khúc sông, nướng từ scene level9 |
| `audio/*.mp3`, `audio/audio.js` | 45 tệp tiếng và bảng thời lượng |
| `tools/rip.py` | Rút toàn bộ art và tiếng ở trên, chạy lại được |

Kiểm: `node test/xuoi-dong-suite.js` (thêm `--thumb` để chụp lại `assets/thumbnails/xuoi-dong.png`, `--only=rate,motion` để chạy riêng vài phần). Phần mật độ vật cản đọc bản cũ thẳng từ git (`/__old/` → `git show 4249ade:`) để đo trước và sau bằng đúng một cách.

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

## Vệt bọt sau thuyền

Chép từ hai ParticleSystem `FoamParticles` và `FoamParticles (1)` gắn dưới `_System/Boat/BoatSprite` trong level9 (bảng `XD.FOAM`). Mỗi dải phát 100 hạt/giây, sống 0,59 giây, bay ngang −16 u/s (−512 px/s) trong không gian thế giới, nhiễu vị trí 0,15 u (~5 px). Hạt đi qua 4 khung `WaterSplash_1..4` trong một đời, xoay 180° và mờ dần từ 1 về 0. Hộp phát 1×0,5 u. Dải xa đặt ở (2,04; 1,34) u với vận tốc dọc +0,5 u/s, dải gần ở (−1,04; −0,18) + (2,04; −0,24) u với vận tốc dọc −0,2 u/s. Cả hai tính từ mốc neo thuyền, y của Unity hướng lên. Thứ tự vẽ 99, ngay dưới thân thuyền (100), nên bọt chui dưới thân và lộ ra thành hai vệt sau đuôi. Số hạt nhân theo tốc độ (0,3–1,8 lần), đời hạt dài thêm tới 16% khi tăng tốc. Vệt pixel tự chế của bản đầu đã bỏ, để khỏi chồng hai lớp. Bọt mũi (`SplashAnim`) chỉ còn hiện lúc tăng tốc.

## Nguồn và bản quyền

Toàn bộ hình và tiếng lấy từ **Farming Camp Demo** (Innerfire Studios, phát hành SOEDESCO), rút từ bản cài Steam trên máy chủ dự án, dùng theo yêu cầu của chủ dự án ngày 2026-09-24. Đây không phải tài sản của repo này. Muốn gỡ thì xoá `games/xuoi-dong/art` và `games/xuoi-dong/audio`. Tên cá lấy từ bảng chữ tiếng Anh của demo (`localization-string-tables-english(en)`) khi có: Salmon, Trout, Tiger Barb, Bass, Grouper, Golden Trout. Ba tên còn lại (Cá chép, Cá hồng, Cá thu) là tự đặt.

## Các con số

- [ĐO TRONG REPO] Dung lượng: art 1,9 MB, audio 9,1 MB, tổng thư mục khoảng 11 MB.
- [ĐO TRONG REPO] Bề ngang lòng sông trong level9: hẻm đá 242 px, rừng 245 px, hang 242 px, đầm 328 px. Game không giữ số gốc: bờ trên và bờ dưới là hai ảnh riêng, nên mỗi bờ được đặt đúng vào mép ±110 px quanh tâm sông. Nhờ vậy chuyển khúc chỉ cần trộn, không phải nhảy.
- [ĐO TRONG REPO] Âm lượng trung bình của các nền môi trường gốc lệch nhau tới 22 dB (FC_NightBG −53,5 dB, FC_waterclose −31 dB). `rip.py` kéo mọi nền về −30 dB lúc mã hoá, nên bảng `MIX.beds` chỉ còn là tỉ lệ.
- [ĐO TRONG REPO] Thời gian một khung (Chromium headless, trung vị): trước khi vẽ ở độ phân giải ảo thì 33,3 ms ở 1920×1080 và 50 ms ở 844×390 dpr 3. Sau đó là 16,7 ms ở cả ba cỡ 1280×720, 1920×1080 và 844×390 dpr 3. Vòng hai thêm lớp thuyền ở pixel thật: vẫn 16,7 ms trung vị ở cả ba cỡ, p95 16,8 ms.
- [ĐO TRONG REPO] Mật độ vật cản, tua nhanh 5 phút đường đi, seed 5: bản `4249ade` 10,6–12,2 cái/phút (bản cũ rút số chung với hiệu ứng nên mỗi lần chạy lệch một chút), tối đa 5–6 cái cùng lúc trên màn, hai cái gần nhất cách 74–80 px. Bản này 4,8 cái/phút (một cái mỗi 12,5 giây), tối đa 1 cái trên màn, gần nhất cách 1.412 px. Thùng + hòm: 9,0 → 4,4 cái/phút.
- [ĐO TRONG REPO] Vị trí thật của thuyền trên canvas từng khung: bản cũ đứng yên mà vẫn nhảy từng 2 px (S=2) hoặc 3 px (S=3) một lúc, xen giữa các khung đứng im. Bản này đứng yên nhích tối đa 1 px thật, lái thì mỗi khung dịch 4–6 px (S=2) hoặc 6–9 px (S=3), không khung nào đứng im.
- [ĐỀ XUẤT] Tốc độ thả trôi 115 px/s (72 × 1,6), chậm 54, nhanh 205, tăng tốc 300. Lộ trình dài 40.400 px, tức gần 6 phút một vòng. Một ngày dài 140 giây: ngày ~74 giây, đêm ~66 giây.
- [ĐỀ XUẤT] Nhạc: ngày chỉ dài ~74 giây nên KHÔNG đổi bài theo từng pha nữa. Có hai bộ: ngày ("Sail On", "Sail On 2", "Sail On 3", mỗi ngày mới lấy bài kế tiếp) và đêm ("Main Menu - Noite", đúng 66 giây, vừa một đêm). Đổi bộ ở bình minh và chạng vạng, mờ dần ~10 giây. Nền môi trường và màu trời vẫn theo từng pha nhỏ.

## Bẫy đã gặp

- [BẪY ĐÃ SẬP] `light_v2` trong resources.assets **không phải** quầng sáng tròn mềm. Nó là hình bóng đèn có tia, nên đèn cabin ban đêm hiện thành một cái bóng đèn to đùng. Quầng sáng giờ vẽ bằng `createRadialGradient`.
- [BẪY ĐÃ SẬP] `WaterTexture` cũng không phải hoa văn vảy của trailer. Nó chỉ là nền cyan có vạch sóng, dùng làm đầu vào shader. Hoa văn sỏi lục giác nằm ở các ô `WaterFloor_A/B/C` của tilemap `WaterTilemap`. `rip.py` dựng lại đúng tilemap đó thành `floor.png`, còn vạch sóng được tách ra thành khung `WaterLines` để phủ mờ.
- [BẪY ĐÃ SẬP] Bốn khúc sông `P_*RiverGen_A` trong level9 đều là GameObject **đang tắt**, vì game bật chúng lúc chạy. Lọc "chỉ lấy vật đang bật" theo cả cây cha thì ảnh nướng ra trống trơn. Giờ chỉ xét cờ bật của chính renderer.
- [BẪY ĐÃ SẬP] `Boat_*`/`BoatB_*` có pivot (0.5, 0.2), còn `BoatJP_*`/`BoatJefferson_*` là (0.5, 0.0), dù khung vẽ y hệt nhau. Để nguyên thì đổi bạn đồng hành là thuyền nhảy 30 px. Đã ép pivot trong `PIVOT_OVERRIDE`.
- [BẪY ĐÃ SẬP] `XD.MIX` từng có hai khoá `sfx`: một số âm lượng bus và một bảng tiếng. Khoá sau đè khoá trước, `gain.value = {…}` ném "non-finite", và cả bộ âm thanh chết lặng. Bộ kiểm bắt được lỗi này. Âm lượng bus giờ nằm trong `MIX.bus`.
- [BẪY ĐÃ SẬP] Va đá có hồi 2 giây nhưng thuyền vẫn nằm đè lên đá, nên hết hồi là va lần hai và mất sạch cá. Giờ còn cọ vào đá thì thân thuyền trượt dần ra.
- [BẪY ĐÃ SẬP] Các lượt phủ toàn màn (nhân ánh sáng, tông màu, viền tối) vẽ ở pixel thật thì tốn theo diện tích màn hình. Xem số đo ở trên.
- [BẪY ĐÃ SẬP] Ảnh màn đầu `MainMenu_*` vẽ một con đường núi, không phải dòng sông. Lớp `…B` của nó cần shader ánh sáng của Unity, ghép thô thì ban đêm hiện những mảng xanh chanh. Màn đầu giờ dùng chính cảnh sông đang chạy (thuyền tự lái), còn logo pixel Farming Camp nằm ở dòng ghi nguồn.
- [BẪY ĐÃ SẬP] **Thuyền giật (vòng hai).** Gốc rễ là chính cái làm game nhanh: cả cảnh vẽ ở pixel ảo rồi phóng S lần, nên thuyền chỉ đứng được ở bội số của S pixel thật. Nhấp nhô ±1 px ảo thành cú nhảy 2–3 px thật xen khung đứng im, còn đoạn lái chậm dần thành bậc thang. Thêm nữa, khung thuyền chạy đều 6 khung/giây kiểu tới-lui (0,1,2,1), trong khi clip gốc `ANI_Boat` chạy 0→1→2 ở mẫu 0/4/8 của đồng hồ 30 Hz (vòng 0,433 s) và kéo theo một đường trôi nhỏ của gốc thuyền (~2 px). Sửa: thuyền dựng và chiếu sáng ở pixel ảo trong một canvas nhỏ, rồi dán lên canvas hiển thị SAU khi phóng, vị trí làm tròn theo pixel thật. Nhịp khung và đường trôi chép từ clip gốc. Thứ gì đứng trước thuyền (vật thể thấp hơn, bờ dưới, chim, mưa) được vẽ lại trong khung bao thuyền rồi đè lên. Mây và tia nắng thì không vẽ lại, nên chúng không phủ lên thân thuyền nữa.
- [BẪY ĐÃ SẬP] Lượt vẽ lại "lớp trước" lúc đầu bật gần như mọi khung, vì phép thử "bờ dưới có chạm thuyền không" lấy lề quá rộng. Kết quả là 50 khung/giây ở 844×390 dpr 3 (bản cũ 60). Thử lại theo đúng mép ảnh bờ (mép nước − 48 px) và dán thuyền một lượt khi không chúi mũi thì về lại 60.
- [BẪY ĐÃ SẬP] Vật thể và hiệu ứng lặt vặt từng rút số chung một bộ sinh ngẫu nhiên. Số lần rút của hiệu ứng lại tuỳ nhịp khung hình, nên cùng một seed mà mỗi lần chạy ra một dòng sông khác. Giờ việc rải vật thể dùng `G.srand` riêng.
- [BẪY ĐÃ SẬP] Hai lần liền trong Bash tool: `cat > tệp` không kèm heredoc và `python -` đều đứng chờ stdin tới hết giờ. Luôn thêm `< /dev/null`, hoặc ghi script bằng công cụ Write.
- Tên sprite lặp lại giữa nhiều tệp `sharedassets*`. `rip.py` lấy bản gặp đầu tiên.
- Sprite ở chế độ vẽ lát (`drawMode ≠ 0`, như `WaterTexture` phóng 40 lần, thác nước) bị bỏ qua lúc nướng bờ. Khe vòm đá của hẻm núi vốn lộ thác nước, nên được lót bằng đáy sông.
