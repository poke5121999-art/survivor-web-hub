# tools/ui: UI gốc của Soul Knight từ prefab uGUI

Bản web vẽ UI bằng chính prefab uGUI của bản 8.6.0 (`D:\sk86-ref`), không vẽ tay. Công cụ đọc prefab ra dữ liệu,
`js/ugui.js` dựng lại trên canvas, còn mã game (ví dụ `js/hud.js`) chỉ đổi giá trị của từng nút.

Nhãn: **[ĐO]** là điều đã kiểm trên dữ liệu hay mã gốc, **[SUY]** là suy luận chưa kiểm.

## Chạy

```sh
cd games/soulknight
PYTHONIOENCODING=utf-8 python tools/ui/build_ui.py      # ~20 s -> data/sk-ui.js, art/ui/ui0.png, art/ui/fonts/*.ttf
```

Xem một prefab riêng: mở `tools/ui/viewer.html?p=hud` qua `python -m http.server 8811` ở gốc repo.
Tham số `hide=đường/dẫn,...` tắt bớt nút.

Muốn thêm prefab thì ghi vào `PREFABS` trong `build_ui.py` theo dạng `khoá: (bundle, đuôi đường dẫn trong m_Container,
[clip áp sẵn])`. Tìm tên prefab bằng cách duyệt `AssetBundle.m_Container` của bundle. Các prefab UI chính:

| prefab | bundle | nội dung |
|---|---|---|
| `other/scene_object/canvas.prefab` | `ui` | HUD trong ải: thanh trạng thái, nút, băng rôn vào ải, bảng tạm dừng, bảng chọn nhân vật |
| `rgprefab/ui/window_pause.prefab` | `common` | bảng tạm dừng dạng cửa sổ |
| `other/scene_object/minimap/*.prefab` | `levelcommon` | bản đồ nhỏ, ô phòng, hành lang |
| `rgprefab/ui/hall/uiherolist/window_hero_list.prefab` | `ui` | danh sách nhân vật |
| `rgprefab/other/scene_object/choosehero/ui_choose_hero.prefab` | `common` | màn chọn nhân vật (`js/lobby.js`) |

Prefab con không có trong `m_Container` mà chỉ được một MonoBehaviour trỏ tới (ví dụ ô `skin_cell` của thanh trượt nhân
vật, trỏ từ `SkinScrollView.cellPrefab`) thì ghi vào `REF_PREFABS`: `khoá: (prefab chứa, đường dẫn nút, lớp, trường)`.

## Dạng dữ liệu (`window.SK_UI`)

```
{ ref: [1280, 720], match: 1,            // CanvasScaler gốc: ScaleWithScreenSize, co theo chiều cao
  sheet: 'art/ui/ui0.png',
  frames: { tên: [x, y, w, h, viền trái, dưới, phải, trên, ppu] },
  fonts: { tên: 'art/ui/fonts/x.ttf' | null },
  fontLH: { tên: m_LineSpacing / m_FontSize },   // chiều cao dòng của font gốc, Text dùng × lineSpacing
  terms: { term: 'chữ vi' },                      // EXTRA_TERMS: chữ mã gốc ghép lúc chạy
  prefabs: { khoá: nút } }
nút = { n, off?, a: [minX, minY, maxX, maxY], pv, p (anchoredPosition), sz (sizeDelta), sc?, rz?,
        img?: { sp, c: [r,g,b,a], t (0 thường, 1 chín mảnh, 3 tô đầy), fm, fo, fa, cw, pa, pm, off? },
        txt?: { s, c, fs, al (TextAnchor 0..8), f, st, bf: [min, max], ls, off? },
        fx?: [{ t: 's' | 'o', c, d }], lay?, fit?, le?, mask?, cg?, loc?: [term, en, vi],
        an?: { clip: { len, tracks: [{ path, type, prop, keys: [[t, v], ...] }] } },
        mbd?: { lớp: dữ liệu MonoBehaviour trong MB_KEEP }, cls?: [lớp MonoBehaviour riêng của game], k?: [nút con] }
```

Lúc chạy: `const H = SK.ugui.inst('hud')`, rồi `H.q('state_bar/hp_bar/img').sz[0] = ...`,
`H.play('message_bar', 'show_message')`, `H.tick(dt)`, `H.draw(ctx, rộngPx, caoPx)`, `H.rectOf(đường, rộngPx, caoPx)`.
Muốn vẽ ảnh từ atlas game (icon súng, icon kỹ năng) vào một nút thì gán `nút.draw = (ctx, R) => ...`.
Thêm: `nút.gray = true` (material xám `ui_gray.mat`), `SK.ugui.clone(nút)` + `SK.ugui.pose(nút, clip, t)` (đặt nút rời về
khung t của clip, như FancyScrollView xếp ô), `SK.ugui.drawFrame(ctx, tên khung, R)`, `SK.ugui.textSize(txt, rộng)`,
`inst.reindex()` sau khi chuyển nút sang cha khác.

Text: xuống dòng ở khoảng trắng khi quá bề ngang (trừ khi `ho`), hiểu `<color=#rrggbb>`, ContentSizeFitter
(`fit` = 2) trên nút chữ tính theo cỡ chữ thật.

## Điều đã đo

- [ĐO] Prefab HUD được lưu ở trạng thái đang ẩn. Clip `show_ui` của Animator trên Canvas đặt `state_bar.y = -60`
  và `info_bar.y = -30`. Build áp sẵn clip này.
- [ĐO] Nút điều khiển do `KeyboardSetup.RefreshBtnPos` đặt lúc chạy, không dùng vị trí trong prefab. Bố cục mặc định
  của chế độ thường (`CustomKeyboardLayoutMode.Level = 0`) là các field tĩnh `SettingData.*Position2` gán trong
  `SettingData..cctor`: cần điều khiển (260,140), bắn (-185,140), kỹ năng (-300,110), vũ khí (-120,300),
  đặc biệt (-325,260), biểu cảm (-450,290), câu cá (-480,85). Số nằm ở `RUNTIME_POS` trong build.
- [ĐO] `UICanvas.UpdateHpBarValid` và `UpdateEnergyBarValid` co thanh bằng `img.sizeDelta.x`, và ghi chữ `hiện tại/tối đa`.
- [ĐO] Băng rôn vào ải là `message_bar`: clip `show_message` bật nền (Image không sprite, alpha 0,247), khung
  `stageTitle` và chữ số màn; clip `hide_message` tắt chúng.
- [ĐO] Bản đồ nhỏ (`levelcommon` › `minimap.prefab`, lớp `MiniMapUIView`):
  - khung 200×200, neo góc trên phải, `visiblePosition (-20, -220)`; build gắn nó vào `map_info_root` (bảng `COMPOSE`);
  - phòng cách nhau `config.fixedRoomIntervals` = 38, phòng hiện tại nằm giữa khung, có khung `select`;
  - màu phòng: chưa khám 0,275, đang ở 0,78, đã qua 0,69; logo lấy từ `config.*RoomLogo`;
  - hành lang (`CreateCorridors`): trung điểm hai phòng, `sizeDelta = (7, khoảng cách)`, xoay theo hướng nối.
- [ĐO] Bảng tạm dừng là `window_pause` trong HUD: `show_window` đặt y = 0, `hide_window` đặt y = 1500. Tiêu đề không có
  Localize; mã gốc gán chữ term `Pause` ("Dừng"), build ghi qua bảng `RUNTIME_TERMS`.
- [SUY] Ô mô tả buff (`buff_info`) nằm đè lên hàng nút ở đáy khung, nên chỉ hiện khi đang chọn một buff.
- [SUY] Lớp hồi chiêu của nút kỹ năng dùng material xám (`MaterialListMono`). Bản web nhân màu xám đậm thay cho material.

- [ĐO] Màn chọn nhân vật (`ChooseHeroView`, đọc bằng `config86/arm_method.py`; số trong `js/lobby.js`):
  - `..cctor`: `NodeNames` = mask_up, mask_down, ui_left, ui_right; `HideEndValues` = (0,180), (0,−300), (−550,0),
    (550,0) (đúng chỗ lưu trong prefab); `ShowEndValues` = 0; `ShowOrHideView` gọi `DOTween.To` 0,25 s. Build đặt sẵn
    vị trí hiện (`RUNTIME_POS`), lobby.js trượt vào từ vị trí ẩn.
  - `AttributesMaxNum` = {12, 10, 320, 10}; `RefreshHeroAttributes`: rộng thanh = min(giá trị / max × 248, 248), cao 28.
  - `SkillsPosition[ô đang dùng]` = y của skill_1..3: {245,−95,−190}, {200,150,−190}, {200,105,55}; `skill_detail` thay chỗ ô
    đang dùng. Mảng tĩnh khởi tạo bằng `InitializeArray` nằm ở `fieldDefaultValues` của metadata: Field#n của
    arm_method là chỉ số bảng fieldRefs → (Il2CppType của `<PrivateImplementationDetails>`, chỉ số field).
  - `RefreshSkills`: màu tên/chữ phụ ô khoá (147,148,150)/(136,137,139), ô mở (206,206,207)/(187,188,189), icon khoá
    `GrayColor` (0,7); `RefreshSkillDetail`: "In Use" màu (60,143,245); `<FixedSkillDescriptionSize>d__244`: vùng mô tả
    (310, 190) ở y −18.
  - `FoldPanel`/`UnfoldPanel`: bấm Nội tại/Vũ khí → `detail_arrow` + `detail_bg` bật, nút "Cách tăng cấp" y −200 → −275,
    `panel/bg` sizeDelta.y 0 → 80.
  - Thanh trượt: `SkinScrollView` cellInterval 0,2, scrollOffset 0,5, loop; `Scroller` scrollSensitivity 5, snap 0,3 s
    InOutCubic; ô `skin_cell` có clip `skin_item_scroll` (anchor x −0,5..1,5 bậc ba, scale 0,7..1, alpha 0,5..1).
  - `Awake` gán term `tips/hp`, `tips/armor`, `tips/energy`, `tips/critical`, `tips/passive_skill`, `tips/init_weapon`,
    `tips/upgrade_details`, `tips/skill_demo`, `tips/start` cho nhãn (bảng `RUNTIME_TERMS`).
- [SUY] Ảnh chụp 8.6 của chủ dự án có bảng trái lệch phải ~90 đơn vị: `LimitCanvas` né tai thỏ của máy đó, bản web
  không bắt chước.

## Bẫy

- Clip UI có track `m_Enabled`: nó bật/tắt component Image hoặc Text, không phải GameObject.
- Image không có sprite vẫn được Unity vẽ thành ô màu đặc. Bỏ qua loại này thì băng rôn mất nền.
- Nút anchor theo mép phải mà có `p.x` dương (ví dụ `btn_weapon` = 136) sẽ nằm ngoài màn. Gặp trường hợp này thì mã
  gốc có đặt lại vị trí, phải tra trong `dump.cs` (`D:\sk86-ref\runtime\dump`) trước khi sửa tay.
- `zpix.ttf` (font CJK, 4,7 MB) không được xuất ra web.
- Nút đang tắt vẫn có rect. `rectOf` phải trả null cho nút (hoặc cha) đang tắt, không thì nút ẩn chồng chỗ bắt mất cú
  bấm: nút cài đặt của hàng nút thường từng nuốt cú bấm "có" của hộp xác nhận về sảnh.
- Mask có `m_ShowMaskGraphic = 0` thì Unity không vẽ ảnh của chính nút đó. Build đánh dấu ảnh ấy `off`.
- Ô tiền tệ của `ui_choose_hero` nằm trong `btn_group`, vẽ trước dải đen `mask_up` nên bị che; bản gốc để nó trên canvas
  khác. lobby.js chuyển nó sang làm con cuối của `mask_up`.
- `arm_method.py` chỉ gỡ XOR 0x34 khi lệnh đầu là `push`; hàm bị XOR mà mở đầu bằng `sub sp, sp, #n` như
  `ChooseHeroView.RefreshSkills` thì ra rác. Gỡ tay: thử XOR 0x34 và so với `E24DD0xx`. Tên coroutine có `<`, `>` phải
  gọi qua địa chỉ (`--find` rồi `disasm(địa chỉ)`), vì shell Windows hiểu `<` là chuyển hướng.
- Unity đo chiều cao dòng theo font (pixel_bold 0,897 × cỡ chữ, LockClock 1,5), không phải 1,15 cố định: sai hệ số này
  là mô tả kỹ năng thưa dòng hơn ảnh chụp.
