# tools/pro/rip_pro.py

Rút tài sản từ bản cài PRO (`D:\pro-ref\PROClient`, giải nén từ `D:\PROClient_64.zip`) để dựng
bản 2D kiểu PRO cho PokéOne. Xem `brain/plans/pokeone-2d-pro.md` phần "Hợp đồng tài sản" và
"Hợp đồng giữa các luồng" trước khi đụng vào script này.

## Chạy

```
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/pro/rip_pro.py            # tất cả
python games/pokeone/tools/pro/rip_pro.py poke        # chỉ sprite Pokémon (dex 1..251)
python games/pokeone/tools/pro/rip_pro.py player      # chỉ lớp nhân vật (thân/áo/tóc/nón)
python games/pokeone/tools/pro/rip_pro.py bg          # chỉ nền trận (battlebgnew)
python games/pokeone/tools/pro/rip_pro.py audio       # chỉ SFX (cần ffmpeg trong PATH)
```

Chạy lại bao nhiêu lần cũng ra cùng kết quả: mỗi nhóm tự xoá sạch thư mục của mình
(`art/pro/poke/*`, `art/pro/player/*/*`, `art/pro/bg`, `audio/pro/*`) rồi ghi lại từ đầu, nên
không cộng dồn rác từ lần chạy trước với danh sách ngắn hơn. Chạy một nhóm lẻ (vd chỉ `poke`)
vẫn ra `data/pro.js` đầy đủ vì script đọc lại tệp đã có trên đĩa cho các nhóm không chạy
(`scan_existing_player`, `scan_existing_bg`, `scan_existing_sfx`).

**Bẫy đã sập:** `python -c "..."` nhiều dòng hỏng trong Git Bash ở máy này (shim pyenv) — dùng
`python - <<'EOF' ... EOF`. Muốn chạy một script rời (không phải `rip_pro.py` nằm sẵn cạnh
`pro_env.py`) phải `export PYTHONPATH=.../tools/pro` trước, vì `sys.path[0]` là thư mục của
script đang chạy chứ không phải thư mục làm việc (`cd` không đủ).

## Sự thật đã đo [ĐO TRONG REPO, 2026-09-28]

**Dex 1..251**: đủ cả 8 loại (`pbig/back/follow/smallpokemon` + tiền tố `s` cho shiny), không
thiếu con nào — `shinyMissing` trong `data/pro.js` luôn rỗng ở bản PRO hiện tại.

**Kích thước sprite Pokémon** (không phải lưới, ảnh tĩnh, giữ nguyên pixel không resample):
`pbig`/`back` = 128×128, `smallpokemon` (icon) = 32×32. `follow` LÀ lưới 4×4 nhưng kích thước ô
thay đổi theo từng con (Pikachu/Bulbasaur 256² → ô 64px, Charizard 512² → ô 128px) — bên dùng
ảnh follow phải tính ô = `kích_thước_ảnh / 4`, không được giả định 64px cố định.

**Thứ tự hàng của tấm `follow` (Pokémon đi theo)** — đo bằng cách coi ảnh Pikachu (dex 25) và
Bulbasaur (dex 1): hàng 0 = mặt/xuống, hàng 1 = trái, hàng 2 = phải, hàng 3 = lưng/lên.
Ghi ở `P1.PRO.followRows = {down:0, left:1, right:2, up:3}`, `followCols:4`.

**Khác với hàng của tấm `player`/`npc`** [ĐO TRONG REPO 2026-09-28 trên `npc/sprite1`, xếp 4 hàng cạnh
nhau rồi nhìn hướng mặt; bản đầu của README ghi nhầm trái/phải]: hàng 0 = lưng/lên, hàng 1 = PHẢI,
hàng 2 = mặt/xuống, hàng 3 = TRÁI; 4 cột nhưng chỉ 3 cột đầu có khung bước (cột cuối trống). **Hai quy ước hàng NGƯỢC THỨ TỰ
mặt-lưng với nhau** — đừng lấy nhầm hằng số của bên này gán cho bên kia.

**Tư thế (hậu tố `_1`.._5` trong tên tệp lớp nhân vật)** — đo bằng cách xem tấm thân trần
`0_0_1`..`0_0_5` phóng to: `1` = đi (dáng đứng, 3 khung bước nhẹ), `2` = chạy (chân nhấc cao
hơn, người nghiêng tới trước rõ hơn pose 1). `3`/`4`/`5` là dáng khác (nghiêng người kiểu xe
đạp / ngồi thu người kiểu lướt sóng hay câu cá — không phân biệt rõ bằng mắt, không rip vì đề
bài chỉ cần đi+chạy). Ghi `P1.PRO.pose = {walk:'1', run:'2'}`.

Áo/tóc/nón hầu hết chỉ có tư thế `{1,2,4,5}` (thiếu 3 — dáng xe đạp cần vẽ riêng, đa số món đồ
không có); một số ít (10 áo, 13-16 tóc, 38 nón) có đủ cả 5. Đi+chạy (`1`,`2`) luôn có mặt ở mọi
món đã chọn nên không cần lọc riêng khi rip.

**Thứ tự vẽ lớp nhân vật** — đo bằng ghép thử thân+áo+tóc+nón (mũ đông màu xanh + tóc bạc) theo
2 thứ tự: vẽ tóc sau cùng (đè lên nón) cho kết quả tóc lộ ra quanh viền nón, sai; vẽ **nón sau
cùng** (đè lên tóc) cho viền sạch, đúng. Ghi `P1.PRO.layerOrder = ['body','cloth','hair','hat']`
(script vẽ tuần tự theo mảng này, phần tử cuối vẽ trên cùng).

**Nón (`4_headgear`) không tách theo giới** như thân/áo/tóc (`_m`/`_f`) — một bộ ảnh dùng chung.
Script chép cùng một ảnh vào cả `art/pro/player/m/hat/` và `art/pro/player/f/hat/` để giữ API
đường dẫn nhất quán theo giới như phần "Ngoại hình người chơi" của hợp đồng tài sản.

Hai bộ `4190`/`4869` có thêm biến thể hậu tố chữ (`4190_1f`...) song song với `4190_1` số
thường — script chỉ lấy hậu tố số, bỏ qua biến thể `f` (không rõ mục đích, không cần cho đi+chạy).

**Áo được chọn (30 kiểu đầu, sắp theo số hiệu, có cả 2 giới và có đủ đi+chạy ở cả 2 giới)**:
trong số 303 kiểu nam / 299 kiểu nữ, giao nhau 285 kiểu đạt điều kiện; danh sách cụ thể nằm
trong `player.m.cloth` / `player.f.cloth` của `data/pro.js` sau khi chạy.

**Nền trận (`battlebgnew`)**: 31 ảnh. Đa số đặt tên `<họ>_day|_afternoon|_night`, NHƯNG họ
`winter` và `winter_forest` dùng hậu tố `_evening` thay vì `_afternoon` — hợp đồng gốc giả định
chung `_day|_afternoon|_night` cho mọi họ là SAI cho 2 họ này. Script tự tách họ bằng cách cắt
hậu tố khớp (không hard-code bảng họ), nên `P1.PRO.bg` luôn phản ánh đúng hậu tố thật có trong
game thay vì đoán. 10 ảnh không tách ngày/đêm (`indoor`, `pvp_arena`, `underwater`,
`crystalcave`, `icecave`, `icecave_water`, `cave_water`, `cave_1` — dấu cách trong tên gốc
`'cave 1'` đổi thành `_`, `shadow_foe`, `shadow_party`) tự thành họ một-phần-tử.

**Cries**: 251/251 đã có sẵn ở `audio/cry/<dex>.ogg` từ PokéOne gốc (rip trước, không phải từ
PRO) — script KHÔNG rip cry từ PRO, giữ nguyên bộ cũ theo đúng yêu cầu.

**SFX PRO** (`audio files/battle sfx` 19 tệp, `gui sfx` 11 tệp, `world sfx` 17 tệp — 1 mục
trong `gui sfx` (`open`) thực ra là `Texture2D` (icon đi kèm) chứ không phải âm thanh, bỏ qua).

**[BẪY ĐÃ SẬP, 2026-09-28]** Bản đầu của rip đọc byte tiếng bằng `get_resource_data()` của UnityPy. Hàm này
tìm `resources.resource` BÊN TRONG gói `data.unity3d` trước và trả về byte của tệp khác cùng tên (4 byte đầu
kiểu `13 13 13 00`, tức điểm ảnh RGBA). Ghép header WAV lên đó ra **tạp âm mà không báo lỗi**; 21 tệp như vậy
đã từng được xuất. Dữ liệu tiếng thật nằm ở `PROClient_Data/resources.resource` TRÊN ĐĨA, mọi clip đều là
khối **FSB5** (cả `m_CompressionFormat` 0 lẫn 2) [ĐO TRONG REPO: `seek(m_Offset)` ra `FSB5`].
`AudioClip.samples` (pyfmodex) thì báo `FmodError('FORMAT')`.

Cách đang dùng: đọc thẳng tệp trên đĩa theo `m_Offset/m_Size`, giải FSB5 bằng `vgmstream-cli` (biến
`VGMSTREAM`, mặc định `~/Downloads/vgmstream/vgmstream-cli.exe`), rồi ffmpeg ra ogg. **46/46 clip** giải được.
Kiểm là tiếng thật chứ không phải tạp âm: đuôi đoạn tắt về khoảng −91 dB (`ffmpeg -sseof -0.05 … volumedetect`),
thời lượng hợp lý (`levelup` 4,1 s, `bump` 0,42 s). Tạp âm thì đuôi vẫn to như đầu.

Các clip giải được chuyển sang `.ogg` mono 64k bằng `ffmpeg` — cùng quy ước sfx của
`tools/rip_audio.py` (không dùng 96k stereo như nhạc, vì đây là hiệu ứng ngắn). Khoá trong
`P1.PRO.sfx` là `"<nhóm>.<tên_slug>"`, vd `battle.pokeballthrow`, `gui.notification`,
`world.grasswalking`.

## data/pro.js

`window.P1.PRO = { dexMax, shinyMissing, followRows, followCols, pose, layerOrder, player:
{ m:{body,cloth,hair,hat}, f:{...} }, bg:{ '<họ>': ['<họ>_day', ...] }, sfx:{ 'nhóm.tên': 'đường
dẫn.ogg' } }`. Tên trong danh sách `player.*` KHÔNG có hậu tố tư thế (khớp
`P1.state.player.look` trong hợp đồng: giá trị là tên tệp không hậu tố).
