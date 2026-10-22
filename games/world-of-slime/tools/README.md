# tools/: bóc asset World of Slime Demo

Đọc bản demo Steam cài trên máy (`D:\Steam\steamapps\common\World of Slime Demo`, Unity IL2CPP, Addressables không
mã hoá) rồi ghi asset web vào bản clone của repo `poke5121999-art/world-of-slime-assets` (`D:\world-of-slime-assets`).
Không ghi gì vào thư mục Steam. Đường dẫn gom ở `wos.py`, đổi bằng biến môi trường `WOS_GAME`, `WOS_REF`
(cache và ghi chú ngoài git, mặc định `D:\wos-ref`), `WOS_ASSETS`.

Python 3.12 có UnityPy 1.25: `py -3.12 -I <tool>.py`. Cờ `-I` bỏ qua `PYTHONIOENCODING`, nên tool nào cũng tự gọi
`sys.stdout.reconfigure(encoding="utf-8")`.

## Thứ tự chạy

```
py -3.12 -I cabmap.py            # WOS_REF/cache/cabmap.json: tên CAB -> tệp bundle (đọc header, ~2 phút)
py -3.12 -I index_bundles.py     # WOS_REF/cache/bundle_index.json (~5 phút, 4 tiến trình)
py -3.12 -I export_slime.py      # slime/: 218 biến thể + 119 GLB anim theo loài (~1 phút)
py -3.12 -I export_npc.py        # npc/: 110 NPC, clip Humanoid đã quy ra xoay xương (~1,5 phút)
py -3.12 -I export_player.py     # player/: 2 rig, 98 bộ phận, anim nam/nữ (~40 giây)
py -3.12 -I export_map.py        # map/: 49 thư viện mảnh, texture gộp ở map/tex (~2,5 phút)
py -3.12 -I export_prop.py       # prop/: 197 GLB (~12 phút) + prop/tex/OBJ_DadBag_{2,3}_Albedo.webp (`--extra-only`: chỉ hai ảnh này)
py -3.12 -I export_fx.py         # fx/: 26 prefab FX đạn/trúng (lớp hạt -> index.json) + 25 texture gốc (~1 phút)
py -3.12 -I export_2d.py all     # img/ và ui/ (chạy `ui` trước `prefab`)
py -3.12 -I export_audio.py all  # audio/: 1126 ogg + index sự kiện Wwise
```

Tool nào cũng chạy lại được và cho ra tệp giống hệt. Mỗi tool chỉ xoá thư mục của chính nó. Xong thì commit trong
`D:\world-of-slime-assets` rồi push; Pages của repo đó xây lại vài phút.

`il2cpp_method.py <Kiểu.Method>` dịch ngược một hàm trong `GameAssembly.dll` (metadata v39). Dùng nó trước khi đoán
một luật hay một con số.

## Ghi chú và bẫy

Ghi chú nghiên cứu (tiếng Anh, đo trên bản demo ngày 2026-10-21) nằm ở `../docs/research/`:
`GAMEPLAY.md` lối chơi theo clip, `CODE.md` hệ thống trong mã, `MAPBUILD.md` cách game xếp ô bản đồ,
`PIPELINE.md` shader và đường ống GLB, `EXPORT_*.md` lệnh chạy và bẫy của từng tool.

Các bẫy đã sập, đọc trước khi sửa tool:

- Anim lưu góc quay euler theo thứ tự trong `GenericBinding.customType` (ở đây là XYZ). Đọc theo ZXY mặc định thì
  slime nằm úp mặt (`PIPELINE.md`, bẫy 1).
- Tên tệp bundle không khớp nội dung: `map_ter05_cave.bundle` chứa thị trấn `t01_Larus`. GLB đặt tên theo thư mục
  Addressables, bundle gốc ghi trong `map/index.json`.
- Clip của NPC và người chơi là Humanoid (đường cong cơ). Không quy đổi qua Avatar thì nhân vật đứng chữ T.

Số liệu game (chỉ số, skill, item, quest, tên slime) và lưới ô bản đồ do server gửi, bản cài không có
(`CODE.md` mục 1, `MAPBUILD.md` mục 0).

F5a (2026-10-22), thêm vào `export_map.py` (dùng chung cho `export_prop.py`):

- MeshRenderer có nhiều vật liệu hơn submesh: Unity vẽ vật liệu thừa lên submesh cuối (mặt nước đài phun Larus là một lượt như vậy).
  Trước đây chỉ lấy `mats[si]` nên mất; giờ mỗi vật liệu thừa là một primitive nữa trên cùng chỉ số.
- ParticleSystemRenderer chế độ Mesh với một hạt đứng yên (tốc độ 0, không shape/velocity/size/rotation module): xuất thành node con
  `<tên>_particleMesh` (cỡ = startSize, `extras.particleMesh`), đếm ở `pieces[].particleMeshes` (12 mảnh). Hệ hạt chuyển động vẫn bỏ
  (`particleMeshSkipped`).
- `export_fx.py`: FX của game là ParticleSystem billboard, không có mesh. Tool ghi giá trị đầu của từng lớp (cỡ, màu, rate, burst,
  sprite sheet, vật liệu + màu kênh `_RColor/_GColor/_BColor`) và texture gốc; đường cong theo thời gian sống chưa đọc.
