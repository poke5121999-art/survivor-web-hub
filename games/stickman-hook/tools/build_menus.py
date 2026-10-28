"""Menu art, one sheet per screen, loaded when that screen first opens:
art/m-<screen>.webp + data/m-<screen>.json {_size: [W, H], name: [x, y, w, h, l, b, r, t]} (l..t: 9-slice border in sheet px).

    py -3 -I build_menus.py [REF=D:/stickman-hook-ref]

Sprites come from REF/sprites_menus, exported with tools/extract/page_sprites.py (every Sprite reachable from the page
bundles: ui_pages_home, ui_hud_menubar, ui_widgets_maincurrencies, ui_xproad_hud, ui_xproad_popup, ui_pages_gamemodes,
gamemodes_*_menuitem, ui_pages_tournament, ui_pages_customization) and tools/extract/rarity_sprites.py (rarity holders,
saved as <Name>_<rarity>). Each sprite is scaled to at most its `side` px: 1 reference unit is ~1.3 device px on a
390 x 844 phone at DPR 2, so the side is about 1.3 x the size the prefab draws it at.
"""
import sys, os, json
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
SRC = os.path.join(REF, 'sprites_menus')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# screen -> {sprite: longest side in px}
SHEETS = {
    # HomePage + MenuBar + XpRoadHomeBar + MainCurrenciesWidget
    'home': {'Settings': 90, 'SkinCoins': 64, 'SkipTickets': 72, 'AddButton': 56, 'Pattern_MainMenu': 256,
             'BronzeMedals_01': 96, 'SilverMedals_01': 96, 'GoldMedal_01': 96, 'OtherMedals_01': 96, 'Diamond_Small': 110,
             'Master_Small': 110, 'TrophyRoadBarXp_Holder': 20, 'BarFill': 40, 'GiftIcon': 100, 'glow': 128,
             'Icon_Pachinko': 110, 'Icon_LuckyWheel': 110, 'HolderLuckyWheelCoin': 120, 'Icon_Shop': 120,
             'Button_Tournament': 160, 'Button_TournamentLocked': 160, 'Icon_Trophy': 120, 'Icon_TrophyLocked': 120,
             'Button_Adventure': 160, 'Button_AdventureLocked': 160, 'Icon_Compass': 120, 'Icon_CompassLocked': 120,
             'ButtonPlay_Holder_02': 360, 'HolderMenu': 230, 'Icon_Customization': 120, 'Icon_Home': 120,
             'Icon_GameMode': 120, 'Icon_CardsLocked': 120, 'Notifs_Dot': 40, 'HolderCollectionNumber': 120, 'Icon_Lock': 60,
             'CHAR_Classic0010': 280},
    # GameModesPage + GameModes MenuItem (adventure, grapple, challenge, pachinko)
    'modes': {'Pattern_Game mode': 256, 'GameModes_Icon': 90, 'Frame_Mode_01': 184, 'rounded_square_flat_top': 128,
              'IllustrationAdventure': 640, 'IllustrationChallenge': 640, 'IllustrationGrapple': 640, 'IllustrationPachinko': 640,
              'Counter_01': 120, 'BottomFrameLocked': 200, 'BottomFrameCompleted': 200, 'Icon_Lock': 100, 'Icon': 90,
              'Grapple_Icon': 90, 'IconChallenge completed': 90, 'IconChallengeLocked': 90, 'Icon_Pachinko': 90, 'Star_Completed': 90,
              'Icon_Trophy': 90, 'Icon_LuckyWheel': 90, 'Icon_Home': 90, 'SkinCoins': 64},
    # XpRoadPopup: purple column, rank markers, reward cards
    'road': {'Pattern_Trophy': 256, 'BarRankTrophyRoad': 32, 'LoadingbarUnder': 120, 'Loadingbar': 120,
             'BronzeMedals_01': 90, 'SilverMedals_01': 90, 'GoldMedal_01': 90, 'OtherMedals_01': 90, 'Diamond_Small': 100,
             'Master_Small': 100, 'XpRoadHolder_common': 350, 'XpRoadHolder_epic': 350, 'XpRoadHolder_legendary': 350,
             'ValidateIcon_01': 64, 'Icon_Lock': 60, 'Xp': 64, 'SkinCoins': 64, 'OutlinedButtonGold': 330, 'Icon_Home': 90},
    # CustomizationPage: preview, ROPES / SKINS / TRAILS tabs, pages, collection holders, item cards
    'shop': {'Button_ShopSelection': 300, 'Button_ShopUnselected': 300, 'ShopTrailRopeHolder': 180, 'ContainerPage_Selected': 64,
             'ContainerPage_Unselected': 64, 'Container_PageCollection': 260, 'HolderCollection_01': 348, 'HolderGameMode_01': 348,
             'HolderLocked_01': 348, 'Container_CollectionNumber': 120, 'Container_CollectionNumberCompleted': 120,
             'ShopHolder_common': 180, 'ShopHolder_epic': 180, 'ShopHolder_legendary': 180, 'ShopHolder_ultimate': 180,
             'ShopLocked_common': 180, 'ShopLocked_epic': 180, 'ShopLocked_legendary': 180, 'ShopLocked_ultimate': 180,
             'ValidateIcon_01': 56, 'Icon_Lock': 60, 'SkinCoins': 64, 'Icon_Home': 90, 'background2': 64, 'ShinySun': 256},
    # TournamentPage
    'tour': {'Pattern_Trophy_Invers': 256, 'TrophyTournament_01': 220, 'HolderReward': 170, 'HolderTime_01': 200,
             'FramePlayer_01': 694, 'HolderYourPlayer': 694, 'HolderPortrait_01': 90, 'HolderPortrait_02': 90,
             'CounterPlayer_01': 160, 'CounterYouPlayer_01': 160, 'CupIcon_01': 64, 'SkinCoins': 56, 'OutlinedButtonGold': 320,
             'OutlinedButtonGreen': 320, 'SkipTickets': 72, 'Icon_Home': 90, 'ConnectionIcon_On': 40},
}


def build(screen, sprites):
    meta = json.load(open(os.path.join(SRC, 'meta.json')))
    ims = []
    for name, side in sprites.items():
        p = os.path.join(SRC, name + '.png')
        if not os.path.exists(p):  # level / skin sprites (the home screen's default stickman) from export_sprites.py
            p = os.path.join(REF, 'sprites', name + '.png')
        if not os.path.exists(p):
            print('  missing', name); continue
        im = Image.open(p).convert('RGBA')
        if name.startswith('CHAR_'):  # a skin frame: trimmed to its pixels
            im = im.crop(im.getbbox())
        k = min(1.0, side / max(im.width, im.height))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        bd = meta.get(name, {}).get('border', [0, 0, 0, 0])
        ims.append((name, im, [round(v * k) for v in bd]))
    ims.sort(key=lambda t: -t[1].height)
    W, PAD = 1024, 2
    x = y = shelf = 0
    rects = {}
    for name, im, bd in ims:
        if x + im.width > W:
            x = 0; y += shelf + PAD; shelf = 0
        rects[name] = [x, y, im.width, im.height] + bd
        x += im.width + PAD; shelf = max(shelf, im.height)
    H = y + shelf
    sheet = Image.new('RGBA', (W, H))
    for name, im, _ in ims:
        sheet.paste(im, tuple(rects[name][:2]))
    out = os.path.join(GAME, 'art', 'm-' + screen + '.webp')
    sheet.save(out, quality=82, method=6)
    rects['_size'] = [W, H]
    open(os.path.join(GAME, 'data', 'm-' + screen + '.json'), 'w').write(json.dumps(rects, separators=(',', ':')))
    print(screen, W, 'x', H, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    for s, sp in SHEETS.items():
        build(s, sp)
