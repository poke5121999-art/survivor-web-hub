# Art của Lõi Sâu — lấy từ đâu, giải mã thế nào

> Mọi hình trong game là **sprite thật của Core Keeper** (Pugstorm), bóc từ bản
> đang cài trên máy: `D:\Steam\steamapps\common\Core Keeper\CoreKeeper_Data\data.unity3d`.
> Đây là art có bản quyền của Pugstorm/Fireshine. Bản dựng này để chơi riêng và
> để thử nghiệm thiết kế; muốn phát hành thật thì phải thay bằng art tự vẽ —
> và đường ống dưới đây được dựng đúng để việc thay đó **chỉ là đổi file**.

## Đường ống — hai bước, chạy lại được

```
python games/deepcore/_tools/rip_corekeeper.py    # bóc ra D:/CoreKeeperAssets/ (một lần)
python games/deepcore/_tools/build_atlas.py       # đóng gói vào assets/ (chạy lại tuỳ ý)
```

**Luật của đường ống, chép từ dragonproj:** trong toàn bộ code game **không có
một tên tệp ảnh nào**, chỉ có khoá kiểu `mob.caveling.move`, `pc.helm.iron`,
`tile.dirt.wall`. Đổi art = sửa danh mục trong `build_atlas.py` rồi chạy lại,
**không đụng code**. Thiếu khoá thì `Atlas.draw` vẽ một ô hồng báo lỗi chứ không
ném ngoại lệ làm chết vòng lặp.

Kết quả: **478 khoá, 3 trang atlas, 2,45 MB PNG + 141 KB dữ liệu**.
Bảng dữ liệu ghi ra `assets/atlas-data.js` (một tệp `.js` đặt `window.DC_ATLAS`)
**chứ không phải `.json`** — mở trang bằng `file://` thì gốc là `"null"` và trình
duyệt chặn sạch mọi lần đọc tệp cục bộ qua `fetch`/XHR; thẻ `<img>` thì không bị
chặn, nên chỉ có bảng dữ liệu là phải đi đường thẻ `<script>`. Đây đúng là lý do
`data/games.js` của hub cũng là `.js` chứ không phải `.json`.

## Ba thứ phải giải mã mới dùng được bộ art

### 1. Nhân vật là paperdoll, và đó là món quà lớn nhất

`Miner_skin`, `Miner_eyes`, `Miner_shirt`, `Miner_pants`, 23 kiểu tóc (mỗi kiểu
có bản thường và bản `_helm` bẹp dưới mũ) và **293 lớp trang bị** đều dùng chung
**một khuôn 234×156** = lưới 9×6 khung 26×26, dùng thật 39 khung.

Bảng khung đã dò từ rect của các đối tượng `Sprite` (`Miner_skin_0..38`):

| khung | việc |
|---|---|
| 0–2 | đứng yên, nhìn XUỐNG |
| 3–8 | đi XUỐNG |
| 9–14 | đi SANG PHẢI (lật ngang thành trái) |
| 15–20 | đi LÊN |
| 21–38 | các tư thế cầm đồ, không dùng |

Thứ tự vẽ lớp — **đổi thứ tự là hỏng hình**: da → quần → áo → mắt → tóc → mũ.
Có mũ thì tóc phải dùng bản `hairhelm`, nếu không tóc đâm xuyên mũ.

Nhờ khuôn dùng chung này, "đội mũ vào thì thấy cái mũ" **không phải hiệu ứng** —
nó chỉ là vẽ thêm một lớp nữa. Cùng một hàm `layers()` chạy cả trong ván lẫn ở
màn hình trang bị, nên hình xem trước không bao giờ lệch với hình lúc chơi.

### 2. Bảng dải màu — không có nó thì cả đàn là khối đen

Core Keeper tô màu nhiều sinh vật bằng **gradient map**: ảnh sprite gốc chỉ là
**mặt nạ độ sáng** (xám hoàn toàn, kênh đỏ chạy 1→~240), còn màu thật nằm trong
một texture **256×1** tên `gm_<tên>`. Trong kho có **415 bảng** như vậy (kể cả
các biến thể màu hiếm: `gm_dog_arctic`, `gm_cat_citrus`, `gm_rolyPoly_legendary`…).

Phép ánh xạ: lấy **kênh đỏ** của điểm ảnh làm chỉ số 0..255, tra vào bảng, **giữ
nguyên alpha**.

Triệu chứng khi quên: con chó, con mèo, con rùa, bọ cuộn, bọ nổ, slime, gấu nước
đều vẽ ra thành những khối đen không rõ hình. Đúng cái đã gặp khi nhìn bảng đối
chiếu lần đầu.

Hiện có **11 loài** được tô màu: `bat`, `bigLarva`, `bigLarvaVampire`,
`bombScarab`, `cat`, `dog`, `petslime`, `petslimePrince`, `rolyPoly`,
`tardigrade`, `turtle`.

### 3. Số khung phải DÒ, vì không có chỗ nào ghi

Core Keeper là game DOTS/ECS: phần lớn hoạt ảnh **không** dùng `AnimationClip`
hay `Sprite` của Unity, mà là một **dải ngang N khung đều nhau**, còn N nằm trong
dữ liệu ECS mà UnityPy không đọc được. `frames.json` chỉ phủ được ~737 texture
(chủ yếu là boss, nhân vật, và các bảng vật phẩm).

Với phần còn lại, `build_atlas.py` **đo bằng ảnh**, gộp ba dấu hiệu:

| dấu hiệu | ý |
|---|---|
| khe cắt | cột nằm đúng đường cắt giữa hai khung thường ít alpha |
| lệch tâm | mỗi khung có tâm khối alpha gần giữa khung |
| tỉ lệ | một khung cao hơn rộng (nhân vật nhìn từ trên xuống, đích ≈ 0,8·cao) |

rồi lấy **n lớn nhất** còn nằm trong ngưỡng 1,4 lần điểm tốt nhất — vì n đúng hay
bị n/2 lấn át: cắt đôi một dải 8 khung thành 4 thì đường cắt cũ vẫn còn trống.

Đo được ~92% đúng. Chỗ sai thì **ghi đè tay** trong `FRAME_OVERRIDE`, số khung
đếm bằng mắt trên ảnh phóng to (`_tools/contact_sheet.py`). Hiện có 9 mục ghi đè
(`bombScarab`, `snootFly`, `cat`) — mỗi mục là một dải mà các khung dính sát
nhau không chừa khe.

## Toạ độ cắt trong một tileset

Mọi tileset của Core Keeper đều khổ **336×416**, cùng một bố cục. Bốn vùng dùng
tới, đo bằng mắt trên ảnh phóng to có lưới:

| vùng | toạ độ | ô |
|---|---|---|
| `floor` sàn | (0, 80) – (80, 144) | 5×4 = 20 biến thể |
| `wall` mặt đá | (0, 224) – (80, 288) | 5×4 = 20 biến thể |
| `decor` vật vặt trên sàn | (0, 304) – (80, 320) | 5 |
| `ore` vỉa quặng (vẽ ĐÈ lên ô tường) | (176, 128) – (208, 176) | 2×3 = 6 |
| `crack` vết nứt khi đang đục | (144, 176) – (176, 208) | 2×2 = 4 |

Chín quần thể dùng: `dirt`, `clay`, `nature`, `lava`, `crystal`, `sea`, `desert`,
`mold_dungeon`, `larva_hive`.

Phần **autotile** của bản gốc (các mảng hình chữ thập trong tileset) **không**
được giải mã — quá rủi ro và không cần. Thay vào đó `world.js` tự vẽ viền tối ở
mép đá và bóng đổ xuống ô sàn phía dưới; đó là thứ làm khối đá trông có bề dày
thay vì như một miếng dán phẳng.

## Vật phẩm

`lootsprites` là một bảng **1056×256 = 66×16 = 1.056 ô 16×16**, đóng nguyên tấm
vào atlas dưới khoá `items`, tra theo **chỉ số**. Các chỉ số đang dùng đã soi
bằng mắt (`_tools` dựng ảnh có đánh số):

| dùng làm | chỉ số |
|---|---|
| vàng · ngọc | 153 · 152 |
| Nitra · Morkite · Đường Đỏ | 47 · 534 · 733 |
| thỏi đồng/thiếc/sắt | 266 · 267 · 268 |
| cuốc | 577 · 643 |
| đèn (đuốc → đèn lõi) | 1000 · 548 · 547 · 979 · 981 |
| mũ · áo · quần | 454 · 455 · 458 |
| nhẫn · dây chuyền | 581 · 580 |
| rương gacha | 452 · 453 |

## Bộ hình dùng làm gì

| nhóm | nguồn | dùng vào |
|---|---|---|
| người chơi + 27 bộ giáp | `Miner_*`, `<bộ>Helm/Chest/Pants` | paperdoll trong ván + màn trang bị |
| 23 quái | `caveling*`, `larva*`, `bombScarab`, `rolyPoly`, `ancientGolem`… | bể quái theo quần thể |
| 10 linh thú | `dog`, `cat`, `turtle`, `tardigrade`, `bat`, `petslime`, `petslimePrince`, `orbitalTurret`, `summonSkeleton`, `summonFireMite` | mười "vũ khí" |
| 4 boss + 1 mini | `boss_slime`, `king_slime`, `boss_hiveMother_*`, `Scarab_boss`, `shroomanBrute` | trùm cuối từng quần thể |
| 19 hiệu ứng | `SlimeExplosion`, `BloodExplosion`, `AcidSplat`… | nổ, toé, vệt |

## Muốn thay art tự vẽ

1. Vẽ theo đúng ba khuôn ở trên (nhân vật 26×26 lưới 9×6; quái là dải ngang N
   khung đều nhau; ô gạch 16×16).
2. Bỏ vào `D:/CoreKeeperAssets/tex/` với đúng tên mà `build_atlas.py` đang gọi,
   **hoặc** sửa danh mục trong `build_atlas.py` cho trỏ sang tên mới.
3. Chạy lại `build_atlas.py`.

Không phải sửa một dòng code game nào. Đó là toàn bộ mục đích của việc trong code
chỉ có khoá chứ không có tên tệp.
