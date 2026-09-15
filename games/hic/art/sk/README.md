# Bộ hình Soul Knight của Hắn Đang Tới

Ba tệp trong thư mục này là toàn bộ hình pixel của game:

| Tệp | Là gì |
|---|---|
| `picks.json` | Danh sách vai trò → sprite gốc. Đây là tệp duy nhất sửa tay. |
| `atlas.png` | 533 khung (Soul Knight + HoloCure) ghép thành một tấm, 1024×1323. Sinh tự động. |
| `atlas.js` | Toạ độ từng khung và nhóm hoạt ảnh (`window.HIC_SK`). Sinh tự động. |

## Giấy phép — đọc trước khi làm gì khác

Art này của **ChillyRoom** (Soul Knight 8.5.1). Chủ dự án yêu cầu dùng nó cho game này
vào ngày 2026-09-15. Quyết định đó ngược với luật cũ ghi ở `~/Downloads/sk-ref/README.md`
và `games/repo2d/art/room/SOULKNIGHT-TILEMAP.md` §8: "không đưa vào repo, không lên Pages".

Nếu có yêu cầu gỡ: **xoá cả thư mục `art/sk/`**. Game tự lùi về hình vector trong
`js/art.js`, vì `index.html` nạp `art/sk/atlas.js` ở chế độ "thiếu cũng được". Không
phải sửa dòng mã nào.

**HoloCure** (Kay Yu, fan game Hololive): 15 vai trò có tiền tố bundle `hc:` lấy từ
`D:\HoloCureAssets\GameSprites\` — chữ số sát thương `ui_digit_white/yellow`, nổ `spr_Explosion`,
`spr_GlowExplosion` (vỡ giáp), `spr_ZetaStealthHit` (trúng giáp), `vfx_smoke`, `spr_AxeFX` (vệt vung),
`spr_spawnFX` (trùm xuất hiện), `spr_holoCoin`, `spr_deathHeart`, `spr_StatUpEffect` / `spr_statusEffects`
(icon tăng/giảm chỉ số), `spr_debuffFX`, `hudfx_sparkle`. Cùng luật gỡ: xoá `art/sk/`.

Không có asset nào của He Is Coming. **Âm thanh không lấy từ game nào**: `js/sfx.js` tổng hợp bằng
WebAudio. Soul Knight: kho bóc đã lọc `sound_effect.ab`. HoloCure: `GameFiles/data.win` có 380 mục
SOND nhưng chunk AUDO RỖNG — tiếng nằm trong `audiogroup*.dat`, không có trên máy `[ĐO 2026-09-15]`.

## Dựng lại atlas

    python games/hic/art/tools/build_sk_atlas.py

- Script đọc sprite từ kho bóc `~/Downloads/sk-ref/all/`, nằm ngoài git.
- Thiếu một khung thì script in tên khung và dừng, không ghi atlas dở dang.
- Sau khi dựng, tăng `STAMP` trong `index.html`. Nếu không, máy người chơi vẫn giữ atlas cũ trong bộ đệm.

Muốn thêm hay đổi một vai trò thì sửa `picks.json`. Có hai dạng mục:

```json
"mob.wolf":   {"bundle": "skin/pet/wolf_1/skin_0", "face": "right",
               "anims": {"idle": ["wolf_0", "..."], "move": ["..."]}}
"event.fire": {"bundle": "monster_rise", "frames": ["brazier0_0", "..."], "kind": "anim", "fps": 10}
```

- `kind` nhận một trong ba giá trị:
  - `variants`: chọn một khung theo toạ độ ô.
  - `anim`: phát lần lượt từng khung.
  - `single`: chỉ lấy khung đầu.
- `face` nhận `right`, `left` hoặc `front`.
  - `front`: không bao giờ lật sprite.
  - Hai giá trị kia: game tự lật để con quái quay mặt về phía người chơi.
- Tên vai trò mà mã đang gọi:
  - `hero`
  - `mob.<wolf|bat|bear|hedgehog|spider|raven|werewolf|honeybear>`
  - `boss.<tên gốc viết thường, nối bằng _>`
  - `terrain.<grass|dirt|water|tree|rock|flower>`
  - `event.<icon trong world.js>`
  - `icon.*`, `vfx.<slash|hit|crit|armor|stun|death>`
  - `ui.<heart|shield|attack|speed|gold|skull>`
- Vai trò nào không có trong atlas thì chỗ đó lùi về hình vector hoặc emoji. Game không báo lỗi.

## Bẫy đã sập `[ĐO TRONG REPO, 2026-09-15]`

- **Hai lưới pixel.**
  - Tile cảnh (bundle `escape`) vẽ ở lưới **32**, còn nhân vật và quái ở lưới **16**.
  - Vẽ cả hai cùng hệ số thì cây to gấp đôi nhân vật.
  - `ui.js` vì thế ép hệ số `K` luôn **chẵn**: tile dùng `K/2`, nhân vật dùng `K`, cả hai đều là số nguyên.
  - Hệ số lẻ làm pixel nhoè và nhấp nháy khi camera trượt.
- **Khung không cắt viền.**
  - Khung trong cùng một hoạt ảnh có cỡ khác nhau: phép "casting" của druid cao 67 px, khung đứng yên thấp hơn.
  - Cắt viền trong suốt thì mỗi khung lệch tâm một kiểu.
  - Mọi khung được neo ở **giữa đáy**.
- **"Sapphire Crown" từng ra hình lọ thuốc.**
  - Luật đoán icon theo tên dò chuỗi con, mà "sap" (Tree Sap) nằm trong "**sap**phire".
  - Sửa: xét tên đá quý, vương miện và khuyên tai trước, và dò bằng cả cụm `tree sap`.
  - Vũ khí có bảng luật riêng: "Heart Drinker" là vũ khí, không phải bùa.
- **Rương có hai khung** (đóng/mở).
  - Đặt `anim` thì nó mở ra đóng vào liên tục trên bản đồ.
  - Rương mở ra là biến mất, nên chỉ giữ khung đóng.
- **VFX HoloCure: khung đầu nhỏ, khung sau to.** `spr_GlowExplosion` khung 0 rộng 24px nhưng khung
  vòng sóng rộng 93px. Nhân theo hệ số pixel chung thì quầng vỡ giáp phủ nửa màn. `fight.js` giờ
  tính hệ số VFX theo khung LỚN NHẤT và cỡ muốn thấy (`Fight.vs(role, px)`).
- **Chữ số HoloCure có viền đen trong sprite.** Tô bằng `source-in` thì cả số thành khối màu đặc;
  phải nhân màu (`SPR.tintedMul`: multiply rồi destination-in).
- **`vfx.heal` bị bỏ.** Sprite ấy chỉ có một khung, phát ở 6 hình/giây thì loé 160 ms rồi mất. Hạt xanh nhìn rõ hơn.
- **Không tìm được sprite:**
  - `vfx.blood`, `ui.moon`: đang vẽ bằng hạt hoặc bằng mã.
  - `icon.helmet`, `icon.crown`, `icon.earring`: đang tạm dùng `escape/Item_68`, `Item_103`, `Item_72`, là ba món chỉ na ná.

## Nguồn

- Kho bóc: `~/Downloads/sk-ref/all/` (94.070 sprite). Tra bằng `browse.html` hoặc `manifest.tsv`.
- Hai bảng kiểm dùng lúc chọn nằm trong scratchpad của phiên 2026-09-15, không lưu lại. Muốn xem lại thì dựng atlas rồi mở `atlas.png`.
- Bố cục màn ngang theo He Is Coming bản Steam: đồng hồ ngày/đêm có đầu lâu ở trên, cột trang bị bên trái, trận đánh ở màn riêng.
  - [Superealm — guide](https://www.superealm.com/he-is-coming-guide-tips-to-get-started/)
  - [Turn Based Lovers — review](https://turnbasedlovers.com/review/he-is-coming-review-impressions/)
- Công tắc tắt rung màn hình có vì người chơi bản Steam phàn nàn là không tắt được rung: [Steam discussions](https://steamcommunity.com/app/2824490/discussions/0/4764334012739838690/).
