# Thế Giới Slime: kiến trúc lát cắt đầu (rev 20261021b)

Bản web của World of Slime Demo (TEAM42). Lát cắt này gồm: bản đồ thử, người chơi đi/chạy/lướt, một slime
đi theo, camera của game, điều khiển PC và mobile theo bảng phím gốc, tiếng bước chân, HUD dựng từ prefab gốc, màn tải
theo byte. Chưa có đánh nhau thật, bắt slime, các bảng (túi, bách khoa, kho, nhiệm vụ...).
Nghiên cứu gốc: `D:\wos-ref\notes\` (MAPBUILD, PIPELINE, EXPORT_*, CODE §8-9). Kế hoạch: `brain/plans/world-of-slime.md`.

## Mô-đun

| Tệp | Việc |
|---|---|
| `index.html`, `mobile.html` | hai trang (PC / mobile ngang), cùng `js/`, import map trỏ `vendor/` |
| `vendor/` | three.js r160 (npm three@0.160.0: `three.module.min.js`, GLTFLoader, SkeletonUtils, BufferGeometryUtils, LICENSE) |
| `js/config.js` | `REV`, `ASSETS` (+ `?assets=`), hằng số di chuyển và camera (số `[ĐỀ XUẤT]` ghi rõ) |
| `js/assets.js` | tải GLB/JSON/ảnh có đệm; `bytes`/`expectBytes`/`loadProgress` cho màn tải |
| `js/world/map.js` | **khuôn dữ liệu bản đồ (đầu tệp)**, đặt mảnh bằng InstancedMesh, `getHeight`, `canStand`, `landTypeAt`, cầu thang |
| `js/world/envmat.js` | toon cho mảnh bản đồ (MixMaster/Enviroment Base, Tile Blend, Water) |
| `js/actors/toon.js` | toon cho slime/người (Unit Matcap wip), chép từ `D:\wos-ref\proof\slime\sheet.html` |
| `js/actors/actors.js` | `Player.create(gender)` ghép avatar từ `player/index.json` defaults; `Slime.create(id)` |
| `js/input/intent.js` | ý định chung `{move, attack, mouse, pressed:Set<tên hành động SMActions>}` + lượng tử 32 hướng |
| `js/input/pc.js` | `KEYMAP` = SMActions/Gameplay gốc (xem dưới) |
| `js/input/mobile.js` | cần ảo (`MainJoystick` của HUD) + chụm zoom; nút là của HUD (`data-act`) |
| `js/state.js` | kho trạng thái HUD (người chơi, đội 6 ô, ô vật phẩm, nhiệm vụ, CombatMode, battle, minimap); `set()` báo HUD vẽ lại |
| `js/ui/hud.js` | HUD HTML/CSS theo RectTransform prefab; `uiScale()` = SMUniformCanvasScaler; chân dung chụp avatar thật; bản đồ nhỏ; thẻ tên trên đầu |
| `js/ui/sprites.js` | URL sprite `ui/`, bảng viền 9-slice `BORDER`, `tinted()` nhân Image.color trên canvas, `paint()` |
| `js/ui/loading.js` | màn tải: `img/login_bg.mp4`, `Login_Logo_Title_En`, `LoadingIcon/UI_Loading_0..29`, thanh `Login_Loading_Gauge` theo byte |
| `data/loc_vi.js` | chuỗi giao diện chép từ `D:\wos-ref\data\loc\vi.json` (+ en dự phòng), `t(key, args)` |
| `js/camera.js` | FollowCamera: cúi 40 độ, vùng chết, kẹp `cameraMoveRect`, zoom |
| `js/audio.js` | một AudioContext, sự kiện Wwise -> ogg, switch `LandType` theo `landType[]` |
| `js/game.js` | vòng chơi; `window.WOS` để test đọc trạng thái |
| `tools/devmap.py` | vẽ bản đồ thử 48x40 bằng luật autotile của editor -> `data/maps/dev.json` |
| `tools/serve_cors.py` | http.server có CORS để test với asset cục bộ |

## Khuôn dữ liệu

- Bản đồ `data/maps/<id>.json` = `{ client: ClientMapData, tile: TileMapData, _dev?, web? }`, tên trường đúng như game
  (xem đầu `js/world/map.js`). Khi có `map_type_{id}_client.dat` + `_tile.dat` (MessagePack) chỉ cần đổi sang JSON, không sửa bộ dựng.
- Toạ độ logic là Unity: ô (x, z), x = `index % width`, z = `index / width`, +z lên trên màn hình. Chỉ lúc đặt Object3D mới
  đổi sang three `(-x, y, z)`. Mảnh đặt ở `(x + 0.5, floor, z + 0.5)`, đỉnh đi được = floor + 1.
- `web.blocked` (ngoài khuôn game): ô có cây/bụi/đá chặn đi, vì va chạm thật là dữ liệu server chưa có.

## Chạy

```
py -3.12 -m http.server 8841 --bind 127.0.0.1                                        # gốc repo
py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets   # asset cục bộ (tuỳ chọn)
http://127.0.0.1:8841/games/world-of-slime/index.html?assets=http://127.0.0.1:8842/
WOS_ASSETS=http://127.0.0.1:8842/ node test/world-of-slime-slice.js                   # đi PC + mobile, chụp vào D:\wos-ref\proof\slice
node test/world-of-slime-hud.js                                                      # HUD + phím + màn tải, chụp vào D:\wos-ref\proof\hud
py -3.12 -I games/world-of-slime/tools/devmap.py                                     # dựng lại bản đồ thử
```
Tham số trang: `?assets=`, `?map=dev`, `?gender=woman`, `?slime=SL_Bat_WindDark`, `?at=x,z`, `?zoom=<m>`, `?quest` (nhiệm vụ mẫu),
`?warn` (cảnh báo thể lực), `?lang=en`.

## Bảng phím (đúng `D:\wos-ref\code\input_bindings.txt`, map Gameplay)

WASD đi (mũi tên không đi: chỉ thuộc map UI), Space = KeyboardInteractAttack (không có NPC thì đánh; đang đánh thì nút lớn là
Return = huýt sáo gọi slime về), chuột trái đánh theo hướng chuột, LShift = Dash + Slot1, Q/E/R = Slot2-4 (ô vật phẩm),
1-6 = EquipMonster1-6, C Switch, Tab Minimap, M WorldMap, I Inventory, B SlimeIndex, N SlimeInventory, J Quest, P Party,
K Perk, O Community, Enter Chat, LCtrl DialogueSkip, Esc, H CombatMode (tự đánh: nút Enabled/Disabled). Lăn chuột zoom.
**Không có phím chạy**: game gửi `speedStep = round(|cần|*10)`; WASD luôn |v| = 1 nên PC đi tốc độ tối đa, mobile đẩy nhẹ
thì chậm. Shift-chạy và T-huýt sáo của rev a là bịa, đã bỏ. Các bảng chưa dựng thì hiện toast tên bảng.

## HUD (js/ui/hud.js)

- Nguồn: `ui/prefab/ui_play__PlaySceneUIController.json` (+ SlimeQuickSlot, QuestBookmarkLayout, ObjectiveLayout,
  ui_objects__UserHud / MyMonsterHud). Tham số layout group / LayoutElement / PlaySceneButtonBatch không có trong JSON:
  đọc thẳng typetree bằng UnityPy (xem bẫy 11).
- Hệ toạ độ: `#hud` rộng `màn/s`, `scale(s)`; `R()` đổi RectTransform sang CSS (`left = aMin.x*100% + pos.x - pivot.x*size.x`,
  tương tự `bottom`, kéo giãn = `(aMax-aMin)*100% + sizeDelta`). Vì vậy mọi số trong mã là số prefab, không phải px.
- `s` = SMUniformCanvasScaler.Apply: r = cao màn (px thiết bị)/1080; dampen 0.7 (r >= 1), smoothstep tới 1.15 ở 720,
  dưới 720: 1.15 + 0.35*log2(720/h), trần 1.6; s = r^dampen, PC nhân StandaloneScale 0.8. 1080p -> 0.8, 720p -> 0.502.
- PC và mobile chung HUD; khác nhau: vị trí/cỡ nút (`PlaySceneButtonBatch.buttonInfos` standalone vs default, bảng `BTN`),
  PC có phím trên nút (`resources/Common/key_*`, ButtonKeymapOverlay), mobile có MainJoystick (120,130) 450, không có phím.
- Image.color: `tinted()` nhân màu trên canvas (cần CORS); alpha đặt trên lớp `.spr` riêng để không làm mờ con.
  Sliced = `border-image` với viền từ `BORDER`; filled dọc (vòng EXP) = `clip-path: inset()`; SlicedFilledImage = rộng theo %.
- Ảnh do runtime (RawImage) thay bằng: chân dung = chụp avatar thật vào render target rồi cắt theo `UI_PlayerInfo_BG_Mask`;
  ô slime = `img/sl/<id>.webp`; bản đồ nhỏ = vẽ từ `floors`/`landType` (gốc là ảnh bake, chưa có) `[ĐỀ XUẤT]`.
- Phông: TMP SDF CJK của game không dùng được; dùng **Nunito** 600-800 (Google Fonts, có dấu tiếng Việt, nét tròn gần nhất).
- So bố cục: ảnh chụp demo thật `D:\wos-ref\pilot\inn1.png` (1920x1080 thu về 1280x720) là chuẩn, ưu tiên hơn khung YouTube.

## Bẫy đã gặp

1. `map/index.json` có `Infinity` trần (Python json.dump), `JSON.parse` chết. `assets.js` thay bằng `null` khi parse hỏng.
2. `material.extras.tex` ghi uri tương đối với GLB (`tex/<hash>.webp`), còn `index.json` ghi `map/tex/...`: phải ghép thư mục GLB.
3. `py -m http.server` trần không gửi CORS: trang ở cổng 8841 không tải được asset ở 8842. Dùng `tools/serve_cors.py`.
4. Tile Blend trộn theo **alpha** vertex colour (A=1 cỏ `_BlendTex` toạ độ thế giới, A=0 vách `_MainTex`), không phải R:
   dùng R thì mặt trên của mảnh mép vách và bờ ao ra màu atlas xám.
5. Camera game ở xa (~126 m) với FOV hẹp: FOV 25-30 độ làm cây 6 m ở mép gần phình to che người chơi. Đo frame Larus:
   nhà 9.35 m rộng ~240/1024 px, nên màn ngang ~40 m.
6. Màn mobile 19.5:9 rộng hơn bản đồ: `effDist()` kéo camera lại gần để không lộ khoảng trống ngoài `cameraMoveRect`.
7. Cầu thang: BoxCollider ngắn hơn mesh (ter01_stair_001 z -2.7..0.7 so với -3.5..1.5), hai đầu rơi vào ô cùng tầng
   nên không biết đầu nào cao. Dùng bounds mesh, đầu cao/thấp lấy theo `floors[]` ngay ngoài hai đầu.
8. Nước: `Water_*` có bờ riêng (vách tới y -7, đỉnh y 1 = mặt cỏ). Ô ao vẫn tính là "có chiếm" khi dò viền vách, nên vách
   không đục lỗ quanh ao; cạnh và góc lồi của nước xoay +180 so với vách, góc lõm giữ nguyên (đã chụp thử cả hai).
9. Mô hình glTF nhìn +Z = xa camera; lúc vào game cho quay `yaw = PI` để nhìn về camera.
10. Path_t01-A là dải cỏ sáng, không phải đất; đường đất xám-be của Larus là Path_t01-B (lấy màu atlas tại UV mảnh để chọn).
11. `ui/prefab/*.json` chỉ giữ chuỗi ngắn của MonoBehaviour tự viết: spacing của HorizontalLayoutGroup, LayoutElement, và
    `PlaySceneButtonBatch.buttonInfos` (vị trí nút PC) không có. Đọc bằng typetree: `X.load_main('ui_play.bundle')`, lọc
    `MonoBehaviour` theo lớp (cách làm: `export_2d.py` `prefab_worker`). Vị trí nút trong prefab là bản mobile; PC bị đổi lúc chạy.
12. CanvasScaler không nằm trong prefab mà là `SMUniformCanvasScaler` (số trong `.ctor`: dampen 0.7, lowResolutionDampen 1.15,
    lowResolutionHeight 720, growth 0.35, maxDampen 1.6, referenceHeight 1080; `StandaloneScale` = 0.8). Đọc bằng
    `il2cpp_method.py "SMUniformCanvasScaler..ctor"`, `.Apply`, `.GetDampen`.
13. CSS `gap` không nhận số âm: spacing -22 của thanh slime làm bằng `margin-left` âm.
14. Ảnh khung `LoadingIcon` tải bằng `new Image()` có `crossOrigin` thì không cùng mục đệm với `background-image` CSS
    (CORS vs no-cors): CSS tải lại và bị huỷ (ERR_ABORTED) khi màn tải biến mất. Bỏ crossOrigin + giữ tham chiếu ảnh.
15. Thanh tải: lúc đầu chỉ biết byte vài tệp nhân vật nên % vọt 99. Chỉ tính % sau khi `map.build` đã `expectBytes` mọi GLB
    bản đồ (`loading.arm()`), và % không bao giờ lùi.
16. ChannelText prefab ghi fontSize 36 nhưng trong game thấy ~20 (TMP auto size vừa ô 110x40): dùng 20.

## Còn thiếu / chưa đúng

- Bố cục bản đồ thật (server). Bản đồ thử ghi `_dev` và trang hiện nhãn "bản đồ thử".
- Shader gốc chưa dịch ngược: không có gradient độ cao, matcap overlay, gió, sương dọc, hậu kỳ màu (game sáng và nhạt hơn).
- Tốc độ đi/chạy, số camera (vùng chết, tốc độ bám), lướt: `[ĐỀ XUẤT]`. Không có bóng đổ dưới chân nhân vật.
- Bộ nước kiểu Larus không có trong demo; ao dùng Water_01-A (bờ cỏ rừng xanh xám).
- HUD so với `pilot/inn1.png`: nút lướt (Dash) bản web luôn hiện, game thật ẩn tới khi có perk; độ mờ nút đánh Disabled
  (0.6) và màu ô bản đồ nhỏ là `[ĐỀ XUẤT]`; thẻ trạng thái trên đầu (biểu tượng + "Roasted"), bong bóng thoại NPC,
  ChatLog, buff chưa có. Vị trí màn tải là `[ĐỀ XUẤT]` (scene đăng nhập chưa bóc).
