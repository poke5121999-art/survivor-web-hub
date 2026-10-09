# Bóc art The Bazaar Demo cho Chợ Phiên

Công cụ đọc 931 bundle Addressables của bản demo trên máy (`D:\Steam\steamapps\common\The Bazaar Demo`) rồi xuất ảnh. Không ghi gì vào thư mục Steam. Số liệu và chuỗi ArtKey chi tiết nằm ở `D:\bazaar-ref\notes\ASSETS.md`.

## Thứ tự chạy

Python 3.8 với UnityPy 1.25 + Pillow + texture2ddecoder. Luôn chạy bằng `python -I` (cờ `-I` bỏ qua `PYTHONIOENCODING`, các script đã tự `reconfigure` UTF-8).

| Bước | Lệnh | Ra | Thời gian đo được |
|---|---|---|---|
| 1 | `python -I index_bundles.py` | `D:\bazaar-ref\cache\bundle_index.json` | 20 đến 80 s (4 tiến trình, lạnh đĩa thì chậm) |
| 2 | `python -I art.py` | PNG đủ độ phân giải ở `D:\bazaar-ref\art\<nhóm>\`, `cache\art_manifest.json`, `cache\art_problems.json`, `cache\artkey_map.json` | lần đầu khoảng 15 phút (thẻ 7 phút, phần còn lại 6 phút); chạy lại 10 đến 30 s vì bỏ qua file đã có |
| 3 | `python -I art.py --web` | `games/bazaar/art/**.webp` và `games/bazaar/data/art.js` | 5 đến 13 phút (đọc 1,6 GB PNG thẻ) |

`art.py --only cards,skills,steps,encounters,frames,ui,heroes,board,fonts` chỉ chạy vài nhóm (nhóm `icons` đi kèm `fonts`). Bước 3 xoá `games/bazaar/art` rồi dựng lại từ đầu để kết quả luôn như nhau.

## Nhóm đầu ra

`cards` (art thẻ vật phẩm, tên `<Hero>_<Thẻ>.png`), `skills`, `steps` (icon phần thưởng), `encounters` (`_char` và `_bg` của quái, thương nhân, sự kiện; thêm toàn bộ sprite thô theo tên `ENC_*`), `frames` (khung thẻ theo bậc, khung xem trước, huy hiệu), `ui`, `heroes` (chân dung, atlas Spine, `.skel` và `.atlas` của skin mặc định), `board` (một bàn và một thảm mặc định), `fonts` (atlas SDF và JSON glyph của TextMeshPro), `icons` (icon chữ như Burn, Poison, Haste, cắt từ atlas `Text_Icon_Atlas_w_Shadows`).

## Cái bẫy đã sập

- **Bundle bị xoá chuỗi phiên bản** (ghi `5.x.x` và `0.0.0`): UnityPy báo `UnityVersionFallbackError`. Phải đặt `UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"` (đo từ `globalgamemanagers`). Đã làm trong `art.py`.
- **ArtKey không phải đường dẫn.** Phần lớn là chuỗi hex 32 ký tự, chỉ giải được qua `catalog.bin` (định dạng nhị phân, `art.py` tự đảo ngược, xem `decode_catalog`). Số ArtKey còn lại là tên trần không đuôi (`Icon_Skill_X`), phải tra theo tên file.
- **Alpha của art thẻ là mặt nạ hiệu ứng** của shader, không phải độ trong suốt. Bản web bỏ alpha (RGB). Bản PNG đủ độ phân giải giữ nguyên.
- **Texture thẻ luôn vuông 1024**, bất kể thẻ Small, Medium hay Large (đo trên 1095 file: 1024x1024 chiếm đa số). Cách khung 3D cắt hay kéo giãn tấm vuông này vào ô thẻ chưa được đo [ĐỀ XUẤT: xem `ItemVisualsController.cs`].
- **Sprite nằm trong SpriteAtlas ở bundle khác**: `sprite.image` báo `File cab-… not found`. `art.py` nạp thêm `ui_sprite_atlas_assets_all` rồi thử lại.
- **PPtr ngoài bundle** (`m_FileID != 0`): giải bằng tên `CAB-…` trong `externals`, tra ngược qua `bundle_index.json` (trường `cab`). Vì vậy `index_bundles.py` phải chạy trước.
- **Đừng gọi `o.read()` lên `Texture2D` của font động** (`Font Texture`, dữ liệu stream rỗng): UnityPy cố mở một thư mục và ném `PermissionError`. Dùng `o.peek_name()` để lọc trước.
- **Không có TTF/OTF** trong game, chỉ atlas SDF. Atlas Latin chỉ phủ 21 trên 68 chữ có dấu tiếng Việt, nên web phải dùng font ngoài (Noto Sans) cho chữ.
- **Windows dùng `spawn`**: mọi hàm chạy trong `Pool` phải ở mức module, và `art.py` phải import được không có tác dụng phụ.
- **`python -c` qua shim của máy này bị hỏng**: viết script ra file rồi chạy.
- **Hạn mức web**: `games/bazaar/art` tối đa 60 MB (`WEB_BUDGET`). Thứ tự ưu tiên khi vượt: icon, thẻ Vanessa/Pygmalien/Dooley/Common/Neutral/Adventure, kỹ năng, khung, chân dung quái, thẻ hero còn lại, UI nhỏ trước UI lớn. Phần bị loại được ghi trong `window.BZ_ART.excluded`.

## Khung thẻ 2D (`frames.py`)

Chạy: `python -I frames.py` (Python 3.8, Pillow + numpy, không cần UnityPy), SAU `art.py --only frames`. `[BẪY ĐÃ SẬP]` Bản đầu của `art.py --web` xoá cả cây `games/bazaar/art`, nuốt luôn `frames2d/` và `vfx/`; giờ nó chỉ xoá các thư mục con chính nó ghi. Ra `art/frames2d/` (khoảng 0,7 MB) và `data/frames.js` (`window.BZ_FRAMES`).

- Không dựng từ mesh 3D `cardframes`: game có sẵn sprite phẳng `Card_PreviewFrame_<Tier>_<Small|Medium|Large|Skill>_TUI` và `EncounterFrame_<Tier>_TUI`; script dùng chúng, đặt lên canvas cao 512 (tỉ lệ 1:1, ô art cân giữa theo chiều dọc).
- `window` = vùng trong suốt nối với tâm ảnh `[ĐO TRONG REPO]`; `r` là độ vát góc đo ở hàng trên cùng của ô, xấp xỉ (góc thật là vát chéo).
- Khung encounter có ruột đặc: phải đục ô theo sprite `EncounterFrame_Interior_TUI` (mặt nạ vòm) vào toạ độ `ENC_WIN` đo bằng mắt `[ĐỀ XUẤT]`; Diamond/Legendary kém chắc nhất.
- Gem `CardGem_*_TD` là ô UV chữ nhật 256x128: cắt bát giác tay (`gem_sprite`). Tag `CardFrame_Tag_01_D` có nền đặc: tách bằng flood fill từ góc.
- `anchors` (gemTop, tag, ammo, multicast, cooldown) `[ĐỀ XUẤT]`, đo từ ảnh wiki `card-badges-crop-1.png` và `cooldown-uzi-1.jpg`. Game không vẽ mặt đồng hồ trên thẻ (chỉ vạch quét, xem VISUAL.md mục 4), nên `cooldown` chỉ là hình chữ nhật ô art.
- Bẫy: `ImageDraw.floodfill` trên ảnh mode L của Pillow ở máy này trả về rỗng, script dùng hàm `fill()` riêng.
