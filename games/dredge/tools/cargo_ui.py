"""Bóc sprite màn hình khoang thuyền (inventory) của DREDGE cho Biển Mù.

Nguồn: AssetRipper export D:\\dredge-ref\\ripped\\ExportedProject\\Assets (đã có sẵn, chỉ đọc).
  Sprite/<tên>.asset  -> m_Rect, m_Border, m_PixelsToUnits, m_RD.texture (guid)
  Texture2D/<tên>.png -> ảnh gốc (gốc toạ độ Unity ở góc DƯỚI trái)

Ghi ra:
  games/dredge/art/ui/cargo/<tên>.webp
  games/dredge/art/ui/cargo/sprites.json   {tên: {w,h,border:[trái,dưới,phải,trên],ppu}}

Vì sao không dùng data.py: nhiều sprite trùng m_Name (SidePanel, square, Tab_Selected, PopupBackground, TypeTag...).
data.py đặt tên "SidePanel#SidePanel_20d" cho bản trùng nên không biết bản nào dùng ở GridCell/Tooltip.
Ở đây gọi thẳng theo tên tệp AssetRipper (có đuôi _0), đúng sprite mà prefab trỏ tới
(GridCell.prefab: backplate = CargoGrid_Default, occupation = square_0, fill = HighlightBorder; Game.unity: PlayerSlidePanel/Backplate = SidePanel_0...).

Chạy:  python -I games/dredge/tools/cargo_ui.py        (~3 giây, chạy lại ra cùng kết quả)
Bẫy:   CargoGrid_Damaged (ô hỏng) không có trong Sprite/ của AssetRipper; dùng bản data.py đã bóc ở art/ui/sprites/CargoGrid_Damaged.webp.
       Border của Unity là (trái, dưới, phải, trên). SidePanel_0 có phải = 0: viền phải không có, bảng trượt ra ngoài màn hình.
       Sprite dạng Sliced co theo ppu/100 (CanvasScaler ppu tham chiếu 100): viền 72 px ảnh ở ppu 200 = 36 đơn vị canvas.
"""
import io
import json
import os
import re
import sys

from PIL import Image

ASSETS = os.environ.get("DREDGE_ASSETS", r"D:\dredge-ref\ripped\ExportedProject\Assets")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "art", "ui", "cargo"))

# tên tệp .asset (không đuôi) -> lý do dùng
SPRITES = {
    "SidePanel_0": "PlayerSlidePanel/Backplate (nền bảng khoang bên phải)",
    "PlayerInventoryBackground": "InventoryGrid/BackgroundImage (nền lưới hull)",
    "SettingsPanelBackground_0": "StatsBackplate (dải thông tin phía trên lưới)",
    "HealthBarPanel": "HealthPanel (thanh hư hại)",
    "DamageBox_Full": "DamageNotchUI.filledImage",
    "DamageBox_Empty": "DamageNotchUI.emptyImage",
    "CargoGrid_Default": "GridCell.backplateImage + regularSprite",
    "square_0": "GridCell.occupationImage (nền màu của ô có đồ)",
    "HighlightBorder": "GridCell.fillImage (viền xanh/đỏ/cam khi đặt)",
    "TrawlEquipmentIcon": "GridCell.trawlSprite (ô nhận lưới kéo)",
    "FishingEquipmentIcon": "GridCell.tackleSprite (ô nhận cần câu)",
    "EngineEquipmentIcon": "GridCell.engineSprite (ô nhận động cơ)",
    "LightEquipmentIcon": "GridCell.lightSprite (ô nhận đèn)",
    "PopupBackground_0": "Tooltip Container nền",
    "TypeTag_0": "FishableTypeTag (nhãn loại thu hoạch)",
    "Tab_Selected_0": "TabUI.selectedSprite",
    "Tab_Unselected_0": "TabUI.unselectedSprite",
    "Tab_Disabled_0": "TabUI.lockedSprite",
    "TabDivider_0": "TopBar/Line",
    "Selector_0": "CursorProxy.CursorSquare (khung con trỏ)",
    "control-icon-outline-circle_2": "HoldActionBack (vòng giữ phím vứt)",
    "ShipIcon": "SlidePanelTab/Icon",
    "ProgressBarCap_0": "TooltipSectionDurabilityDetails/EndL",
}


def guid_of(meta_path):
    with io.open(meta_path, encoding="utf8", errors="ignore") as f:
        m = re.search(r"guid: (\w+)", f.read(400))
    return m.group(1) if m else None


def texture_index():
    idx = {}
    d = os.path.join(ASSETS, "Texture2D")
    for n in os.listdir(d):
        if n.endswith(".png.meta"):
            g = guid_of(os.path.join(d, n))
            if g:
                idx[g] = os.path.join(d, n[:-5])
    return idx


def num(txt, key):
    m = re.search(r"^\s*" + key + r": (-?[\d.]+)", txt, re.M)
    return float(m.group(1)) if m else 0.0


def main():
    # python -I bỏ PYTHONIOENCODING, nên ép UTF-8 ở đây để in được tiếng Việt
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf8", errors="replace")
    tex = texture_index()
    os.makedirs(OUT, exist_ok=True)
    cache = {}
    manifest = {}
    for name in sorted(SPRITES):
        p = os.path.join(ASSETS, "Sprite", name + ".asset")
        if not os.path.exists(p):
            print("THIẾU sprite", name, "(" + SPRITES[name] + ")", file=sys.stderr)
            sys.exit(1)
        with io.open(p, encoding="utf8") as f:
            txt = f.read()
        rect = re.search(r"m_Rect:.*?x: ([\d.]+)\s+y: ([\d.]+)\s+width: ([\d.]+)\s+height: ([\d.]+)", txt, re.S)
        x, y, w, h = [float(v) for v in rect.groups()]
        bd = re.search(r"m_Border: \{x: ([\d.]+), y: ([\d.]+), z: ([\d.]+), w: ([\d.]+)\}", txt)
        border = [int(float(v)) for v in bd.groups()]
        ppu = num(txt, "m_PixelsToUnits")
        g = re.search(r"texture: \{fileID: \d+, guid: (\w+)", txt).group(1)
        if g not in tex:
            print("THIẾU texture cho", name, g, file=sys.stderr)
            sys.exit(1)
        if g not in cache:
            cache[g] = Image.open(tex[g]).convert("RGBA")
        im = cache[g]
        top = im.height - int(y) - int(h)  # Unity tính y từ đáy
        crop = im.crop((int(x), top, int(x) + int(w), top + int(h)))
        crop.save(os.path.join(OUT, name + ".webp"), "WEBP", lossless=True, quality=100, method=6)
        manifest[name] = {"w": int(w), "h": int(h), "border": border, "ppu": ppu, "use": SPRITES[name]}
        print("%-32s %4dx%-4d border=%s ppu=%g" % (name, w, h, border, ppu))
    with io.open(os.path.join(OUT, "sprites.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print("xong: %d sprite, %.1f KB ở %s" % (len(manifest), total / 1024.0, OUT))


if __name__ == "__main__":
    main()
