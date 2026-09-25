# -*- coding: utf-8 -*-
"""Bóc sprite gốc của túi đồ / bảng lục rương (MenuPopup → InventoryManagementPage) ra art/ui/inventory/.

    set PYTHONIOENCODING=utf-8
    python ui_inventory_rip.py            # sprite + tiếng
    python ui_inventory_rip.py sprite     # chỉ sprite
    python ui_inventory_rip.py audio      # chỉ tiếng

Đầu ra:
    art/ui/inventory/<tên>.webp       (lossless, đúng tên Sprite gốc)
    art/ui/inventory/sprites.json     {tên: {w, h, border:[trái, dưới, phải, trên], ppu}} — border dùng cho
                                      CSS border-image (Image.Type Sliced trong prefab)
    audio/sfx/<tên>.mp3               tiếng mở túi, lục rương (vòng lặp + 4 mức hé lộ), thả đồ
Tên sprite lấy từ ui_inventory_dump.py (cây prefab gốc); không vẽ gì thêm.
"""
import json, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vd_common as vd

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'art', 'ui', 'inventory')
AUDIO = os.path.join(ROOT, 'audio', 'sfx')

# Sprite mà các prefab InventoryGoodsSlot / LootingInventory / MyInventory / SafeInventoryPanel / GoodsTooltip /
# InventoryKeyGuide / MenuPopup dùng (đọc từ ui_inventory_dump.py).
SPRITES = [
    # Ui_Common
    'rectangle', 'rectangle_line_1px', 'rectangle_line_2px', 'rectangle_line_glow', 'deco_slotlevel',
    'ImgItemSlotEmpty', 'triangle_16', 'deco_frame_artifact_01', 'deco_frame_artifact_02', 'deco_frame_artifact_03',
    'gradient_horizontal_down', 'gradient_square', 'arrow_side_001', 'img_mouseLclick', 'img_mouseRclick',
    # dấu trạng thái ô, mắt hé lộ, loại ô trang bị, ô nhiễm
    'Eye1', 'Eye2', 'Eye3', 'Weapon', 'Accessory', 'Artifact', 'Safety', 'Caution', 'Alert', 'Serious',
    # phím trong KeyGuide
    'F_Key', 'R_Key', 'N_Key', 'T_Key', 'X_Key', 'Escape_Key', 'Ctrl_Key', 'LeftShift_Key', 'Tab_Key',
    'Q_Key', 'E_Key', 'V_Key', '1_Key', '2_Key', '3_Key', '4_Key', '5_Key',
]
SPRITE_BUNDLES = ['dependencies_assets_spriteatlas', 'dependencies_assets_sprite', 'dependencies_assets_thirdparty',
                  'shared_dependencies_assets_all', 'dependencies_assets_texture']

# Tên clip trong remote_sound_assets_sfx. Chỗ dùng đo trong GameAssembly (xem docs/DIVE.md §10):
# InventoryPopupOpen = OpenSfx của MenuPopup; Looting_Loop = ô đang hé lộ; Looting_low/middle/high/veryhigh =
# GetRevealSfx(bậc); ItemDrop = DropInventoryGoods; ItemRelease = đăng ký ô nhanh; LootingCompleted = giữ F xong.
SOUNDS = ['InventoryPopupOpen', 'Looting_Loop', 'Looting_low', 'Looting_middle', 'Looting_high', 'Looting_veryhigh',
          'LootingCompleted', 'ItemDrop', 'ItemRelease', 'ButtonClick', 'PopUpOpen']


def rip_sprites():
    os.makedirs(OUT, exist_ok=True)
    want = set(SPRITES)
    meta = {}

    def go(env):
        for o in env.objects:
            if o.type.name != 'Sprite':
                continue
            try:
                sp = o.read()
            except Exception:
                continue
            n = sp.m_Name
            if n not in want or n in meta:
                continue
            try:
                img = sp.image.convert('RGBA')
            except FileNotFoundError:
                raise
            except Exception as e:
                print('  lỗi ảnh', n, e)
                continue
            img.save(os.path.join(OUT, n + '.webp'), lossless=True, quality=100, method=6)
            b = sp.m_Border
            meta[n] = {'w': img.width, 'h': img.height,
                       'border': [round(b.x), round(b.y), round(b.z), round(b.w)],
                       'ppu': round(sp.m_PixelsToUnits, 2)}
        return meta

    deps = [vd.bfile(b) for b in SPRITE_BUNDLES[1:]]
    vd.with_deps(vd.bfile(SPRITE_BUNDLES[0]), go, deps=deps)
    miss = sorted(want - set(meta))
    json.dump(meta, open(os.path.join(OUT, 'sprites.json'), 'w', encoding='utf-8'), indent=1, sort_keys=True)
    print('sprite', len(meta), '->', OUT)
    if miss:
        print('KHÔNG THẤY', miss)


def rip_audio():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('không thấy ffmpeg trong PATH')
    env = vd.env_of([vd.bfile('remote_sound_assets_sfx')])
    byname = {}
    for o in env.objects:
        if o.type.name == 'AudioClip':
            d = o.read()
            byname[d.m_Name] = d
    os.makedirs(AUDIO, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='vd_inv_au_')
    try:
        for n in SOUNDS:
            clip = byname.get(n)
            if clip is None:
                print('  KHÔNG THẤY', n)
                continue
            items = list(clip.samples.items())
            if not items:
                print('  KHÔNG GIẢI ĐƯỢC', n)
                continue
            wav = os.path.join(tmp, n + '.wav')
            open(wav, 'wb').write(items[0][1])
            dst = os.path.join(AUDIO, n + '.mp3')
            # Cùng thông số với rip.py cmd_audio: SFX 96 kbps mono.
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '96k',
                            '-ac', '1', dst], check=True)
            print('  sfx %-22s %.1f KB' % (n, os.path.getsize(dst) / 1024))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'sprite'):
        rip_sprites()
    if what in ('all', 'audio'):
        rip_audio()
