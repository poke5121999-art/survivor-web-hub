"""Bóc sprite màn hình khoang thuyền (inventory) của DREDGE cho Biển Mù.

Nguồn: AssetRipper export D:\\dredge-ref\\ripped\\ExportedProject\\Assets (đã có sẵn, chỉ đọc).
  Sprite/<tên>.asset  -> m_Rect, m_Border, m_PixelsToUnits, m_RD.texture (guid)
  Texture2D/<tên>.png -> ảnh gốc (gốc toạ độ Unity ở góc DƯỚI trái)

Ghi ra:
  games/dredge/art/ui/cargo/<tên>.webp
  games/dredge/art/ui/cargo/sprites.json   {tên: {w,h,border:[trái,dưới,phải,trên],ppu}}
  games/dredge/art/ui/cargo/cargo_fx.js    window.DR_CARGO_FX: hệ hạt cá nhiễm bệnh (GameObject/InfectedObjectCell.prefab,
                                           ParticleSystem của InfectedUIParticles: mọi số liệu đọc thẳng từ YAML)

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
    "TrophyIcon": "TooltipSectionFishDetails: <sprite name=TrophyIcon> tô #FFD104 trước kích thước cá cúp",
    "InfectionBubble": "InfectedObjectCell.prefab: hạt bong bóng trên ô cá nhiễm bệnh (118x127)",
    "TitleBackground": "QuestGridSlidePanel/NameBackplate (tấm tên lưới nộp đồ, rộng -240, cao 60)",
    "Button_White": "UpgradeGridSlidePanel/LightButton (nút 350x50 'Purchase Upgrade')",
    "FishmongerInventoryBackground": "QuestGrid/UpgradeGrid/BackgroundImage (nền lưới nộp đồ)",
}

PREFAB = os.path.join(ASSETS, "GameObject", "InfectedObjectCell.prefab")


def fnum(txt, key, default=0.0):
    m = re.search(r"^\s*" + re.escape(key) + r": (-?[\d.e+-]+)\s*$", txt, re.M)
    return float(m.group(1)) if m else default


def minmax(block, key):
    """Trường MinMaxCurve của ParticleSystem: {minMaxState, scalar, minScalar}. State 3 = ngẫu nhiên giữa hai hằng."""
    i = block.find(key + ":")
    seg = block[i:i + 400]
    st = int(fnum(seg, "minMaxState"))
    sc, mn = fnum(seg, "scalar"), fnum(seg, "minScalar")
    return [mn, sc] if st == 3 else [sc, sc]


def infection_fx():
    """Đọc ParticleSystem (!u!198) của InfectedObjectCell.prefab. Bản gốc có đúng một hệ (InfectedUIParticles);
    AmbientParticles chỉ có UIParticle, không có ParticleSystem."""
    with io.open(PREFAB, encoding="utf8", errors="ignore") as f:
        txt = f.read()
    blocks = re.split(r"^--- !u!", txt, flags=re.M)
    ps = [b for b in blocks if b.startswith("198 ")]
    if len(ps) != 1:
        print("InfectedObjectCell.prefab: cần đúng 1 ParticleSystem, thấy", len(ps), file=sys.stderr)
        sys.exit(1)
    ps = ps[0]
    init = ps[ps.find("InitialModule:"):]
    shape = ps[ps.find("ShapeModule:"):]
    noise = ps[ps.find("NoiseModule:"):]
    size = ps[ps.find("SizeModule:"):ps.find("RotationBySpeedModule:")]
    emis = ps[ps.find("EmissionModule:"):ps.find("SizeModule:")]
    burst = emis[emis.find("m_Bursts:"):]
    col = re.search(r"minColor: \{r: ([\d.]+), g: ([\d.]+), b: ([\d.]+), a: ([\d.]+)\}\s+maxColor: \{r: ([\d.]+), g: ([\d.]+), b: ([\d.]+), a: ([\d.]+)\}", init)
    curve = [[float(a), float(b)] for a, b in re.findall(r"time: ([\d.e-]+)\s+value: ([\d.e-]+)", size.split("minCurve")[0])]
    rect = re.search(r"m_SizeDelta: \{x: ([\d.]+), y: ([\d.]+)\}", txt)  # RectTransform đầu tiên = InfectedObjectCell (35x35)
    return {
        "src": "GameObject/InfectedObjectCell.prefab (ParticleSystem InfectedUIParticles)",
        "cell": [float(rect.group(1)), float(rect.group(2))],
        "lengthSec": fnum(ps, "lengthInSec", 1.0),
        "lifetime": minmax(init, "startLifetime"),
        "size": minmax(init, "startSize"),
        "rotation": minmax(init, "startRotation"),
        "color": [[float(col.group(i)) for i in (1, 2, 3, 4)], [float(col.group(i)) for i in (5, 6, 7, 8)]],
        "maxParticles": int(fnum(ps, "maxNumParticles", 3)),
        "burst": minmax(burst, "countCurve"),
        # ShapeModule v6: radius là khối con {value, mode, spread, speed}; type 10 = Circle; m_Scale nhân bán kính
        "shape": {"type": int(fnum(shape, "type")), "radius": float(re.search(r"radius:\s+value: ([\d.]+)", shape).group(1)),
                  "scale": float(re.search(r"m_Scale: \{x: ([\d.]+)", shape).group(1))},
        "noise": {"strength": fnum(noise, "scalar", 0.1), "strengthY": minmax(noise, "strengthY")[1], "frequency": fnum(noise, "frequency", 1.0), "sizeAmount": minmax(noise, "sizeAmount")[1]},
        "sizeCurve": curve,
        "sprite": "InfectionBubble",
        "material": "UIParticle_Mat (Unlit_UI_UIParticles)",
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
    fx = infection_fx()
    with io.open(os.path.join(OUT, "cargo_fx.js"), "w", encoding="utf8", newline="\n") as f:
        f.write("// generated by tools/cargo_ui.py - do not edit\n")
        f.write("window.DR_CARGO_FX=" + json.dumps({"infection": fx}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("hệ hạt nhiễm bệnh: lifetime %s s, size %s, burst %s, max %d" % (fx["lifetime"], fx["size"], fx["burst"], fx["maxParticles"]))
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print("xong: %d sprite, %.1f KB ở %s" % (len(manifest), total / 1024.0, OUT))


if __name__ == "__main__":
    main()
