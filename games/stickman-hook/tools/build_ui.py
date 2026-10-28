"""End game and pause art: ../art/ui.webp + ../data/ui.json {_size: [W, H], name: [x, y, w, h]}.

    py -3 -I build_ui.py [REF=D:/stickman-hook-ref]

Reads REF/sprites_ui/<name>.png, exported from the APK bundles with export_named.py (in REF/tools):
  ui_pages_endgame_normal  (NormalEndGame page): BackgroundEndRace, LightEndRace_01, NewAN_Grap1_FinishPlatform0001,
                            PlayButton_03
  ui_popups_piggybank      (PiggyBankPopup): Pattern_MainMenu, OutlinedButtonGold, OutlinedButtonGreen, AdIcon, SkipTickets
  ui_pages_ingame_default  (PauseUI): Icon_Home
Loaded by js/endgame.js at the first finish (or the first pause), never with the first level.
"""
import sys, os, json
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# name -> longest side in the sheet (px); the pages draw them at most ~2x their CSS size at DPR 2
SPRITES = {'BackgroundEndRace': 560, 'LightEndRace_01': 320, 'NewAN_Grap1_FinishPlatform0001': 446, 'PlayButton_03': 200,
           'Pattern_MainMenu': 256, 'OutlinedButtonGold': 315, 'OutlinedButtonGreen': 318, 'AdIcon': 84,
           'SkipTickets': 120, 'Icon_Home': 112}


def main():
    ims = []
    for name, side in SPRITES.items():
        im = Image.open(os.path.join(REF, 'sprites_ui', name + '.png')).convert('RGBA')
        k = min(1.0, side / max(im.width, im.height))
        if k < 1:
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        ims.append((name, im))
    ims.sort(key=lambda t: -t[1].height)
    W, PAD = 1024, 2
    x = y = shelf = 0
    rects = {}
    for name, im in ims:
        if x + im.width > W:
            x = 0; y += shelf + PAD; shelf = 0
        rects[name] = [x, y, im.width, im.height]
        x += im.width + PAD; shelf = max(shelf, im.height)
    H = y + shelf
    sheet = Image.new('RGBA', (W, H))
    for name, im in ims:
        sheet.paste(im, tuple(rects[name][:2]))
    sheet.save(os.path.join(GAME, 'art/ui.webp'), quality=85, method=6)
    rects['_size'] = [W, H]
    open(os.path.join(GAME, 'data/ui.json'), 'w').write(json.dumps(rects, separators=(',', ':')))
    print('ui.webp', W, 'x', H, os.path.getsize(os.path.join(GAME, 'art/ui.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
