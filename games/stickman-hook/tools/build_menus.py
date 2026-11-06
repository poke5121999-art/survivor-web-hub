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
# sprites_cards: page_sprites.py over the cards / boosters / ui_market_* bundles; sprites_cards/boosters: booster_sprites.py
# sprites_ads: market offer / widget art (export_named.py over the market_offer_* / market_reward_* bundles); sprites_ui: build_ui.py's
DIRS = [SRC, os.path.join(REF, 'sprites_cards'), os.path.join(REF, 'sprites_cards', 'boosters'), os.path.join(REF, 'sprites'),
        os.path.join(REF, 'sprites_ads'), os.path.join(REF, 'sprites_ui'),
        # sprites_shop: export_named.py over ui_pages_customization (pager arrows / frame, locked-item buttons), rev 20261028o
        os.path.join(REF, 'sprites_shop'), os.path.join(REF, 'sprites_tournament')]
# dump/ftue (tools/ftue_export_art.py: HomePage tutorial hand, SettingsPopup) is searched first for these sheets only, so
# its 'checkmark' / 'Glow' never replace the ones other sheets use
FTUE_DIR = {'ftue': os.path.join(REF, 'dump', 'ftue'), 'settings': os.path.join(REF, 'dump', 'ftue'),
            # sprites_popups (export_named.py over the ui_popups_* / ui_market_*offerpopup* bundles): rev 20261028o popups;
            # first for this sheet only, so its 'Icon' / 'ShinySun' never replace other sheets' sprites of the same name
            **{k: os.path.join(REF, 'sprites_popups') for k in ('pmode', 'pseason', 'pskin', 'ovip', 'ooffer')}}
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CARD_SPRITES = ['GlobalCollectionXPBoost', 'GlobalSkinXPBoost', 'GlobalRopeXPBoost', 'GlobalTrailXPBoost', 'SecondChance',
                'DailyCoinsBoost', 'TournamentDailyTrophyBoost', 'PachinkoExtraStickman', 'Pachinkox10Mutliplier',
                'PachinkoBumperResistance', 'PachinkoLuckyDropLimit', 'GlobalExtraLuckyWheel', 'GlobalRankCoinsBoost',
                'GlobalDoubleCards', 'GlobalExtraDraw', 'FinishLineXpBoost', 'GlobalSkipLevel', 'GlobalShopFreeCoinsBoost',
                'AdventureWeeklyStartingTokens', 'AdventureDailyLoginTokens', 'AdventureDailyTokensBoost', 'AdventureSkillUpgradeBoost',
                'AdventureRopeLengthLimitBoost', 'AdventureHookDifficultyLimitBoost', 'AdventureBounceDifficultyLimitBoost',
                'AdventureTeleporterSpawnLimitBoost', 'AdventureWindDifficultyLimitBoost', 'AdventureFirewallLimitBoost']

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
             'Icon_GameMode': 120, 'Icon_CardsLocked': 120, 'Icon_Cards': 120, 'Notifs_Dot': 40, 'HolderCollectionNumber': 120, 'Icon_Lock': 60,
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
             'ValidateIcon_01': 64, 'Icon_Lock': 60, 'Xp': 64, 'SkinCoins': 64, 'OutlinedButtonGold': 330, 'Icon_Home': 90,
             # reward prefabs of XpRoadSettings (xproadconfig bundle): BigReward / SmallReward / ModeReward and contents;
             # RoadMode_*: TrophyRoadRewardModeUI's mode sprites (export_modereward.py); bar: ElementReward.Bar
             'rounded_square_128px': 128, 'SkinCoinsPile': 150, 'EpicPrizesHolder': 200, 'Stars_EpicReward': 200, 'IconValidate': 64,
             'Ticket': 120, 'Octogone_HolderTrophyRoad': 80, 'Octogone_HolderTrophyRoadOutline': 80, 'CursorTrophyRoad': 60,
             'RoadMode_challengeMode': 320, 'RoadMode_grappleMode': 320, 'RoadMode_fortuneWheel': 320,
             'RoadMode_tournamentMode': 320, 'RoadMode_pachinkoMode': 320, 'RoadMode_adventure': 320,
             'commoncard_nooutline': 140, 'epiccard_nooutline': 140, 'legendarycard_nooutline': 140, 'common_nooutline': 200,
             'epic_nooutline': 200, 'legendary_nooutline': 200},
    # CustomizationPage: preview, ROPES / SKINS / TRAILS tabs, pages, collection holders, item cards
    'shop': {'Button_ShopSelection': 300, 'Button_ShopUnselected': 300, 'ShopTrailRopeHolder': 180, 'ContainerPage_Selected': 64,
             'ContainerPage_Unselected': 64, 'Container_PageCollection': 260, 'HolderCollection_01': 348, 'HolderGameMode_01': 348,
             'HolderLocked_01': 348, 'Container_CollectionNumber': 120, 'Container_CollectionNumberCompleted': 120,
             'IconArrow_Collection': 38, 'PaginationHolder': 438, 'Button_UnlockRandomSkin': 226, 'ShopHolder_common': 180, 'ShopHolder_epic': 180, 'ShopHolder_legendary': 180, 'ShopHolder_ultimate': 180,
             'ShopLocked_common': 180, 'ShopLocked_epic': 180, 'ShopLocked_legendary': 180, 'ShopLocked_ultimate': 180,
             'ValidateIcon_01': 56, 'Icon_Lock': 60, 'SkinCoins': 64, 'Icon_Home': 90, 'background2': 64, 'ShinySun': 256},
    # TournamentPage
    'tour': {'Pen': 40, 'SkipTickets': 72, 'AddButton': 56, 'Pattern_Trophy_Invers': 256, 'TrophyTournament_01': 220, 'HolderReward': 170, 'HolderTime_01': 200,
             'FramePlayer_01': 694, 'HolderYourPlayer': 694, 'HolderPortrait_01': 90, 'HolderPortrait_02': 90,
             'CounterPlayer_01': 160, 'CounterYouPlayer_01': 160, 'CupIcon_01': 64, 'SkinCoins': 56, 'OutlinedButtonGold': 320,
             'OutlinedButtonGreen': 320, 'SkipTickets': 72, 'Icon_Home': 90, 'ConnectionIcon_On': 40},
    # CardsPage (HolderCardItemUI, CardsUI), BoosterOpeningPopup (BoosterCardItemUI), black market / booster offer cards:
    # 27 card sprites, 7 category patterns, rarity holders, booster packs
    'cards': dict({n: 150 for n in CARD_SPRITES}, **{c: 150 for c in ('Global', 'Normal', 'Tournament', 'Adventure', 'Challenge',
             'Grapple', 'Pachinko')}, **{'CardHolder_common': 200, 'CardHolder_epic': 200, 'CardyHolder_legendary': 200,
             'CardLocked_common': 200, 'Pattern_CardMenu': 256, 'Icon_Perks': 240, 'Banner': 90, 'LevelBackground': 100,
             'HolderProgressBar': 200, 'ProgressBar': 200, 'ArrowIcon': 40, 'Icon_Lock': 80, 'ShinySun': 200,
             'GradientHorizontalInOut': 128, 'SquareInsideShadow': 64, 'rounded_square_flat_bottom': 128,
             'rounded_square_128px': 128, 'Icon_Home': 90, 'SkinCoins': 64, 'IconValidate': 60, 'InfoButton': 50}),
    # BoosterOpeningPopup and the market's booster / black market offer cards (drawn over the cards sheet)
    'boost': {'Img_New': 100, 'Light_Booster': 200, 'SquareBlur_02': 160, 'MarketOfferSkinCoins_3': 160,
              'common_nooutline': 300, 'epic_nooutline': 300, 'legendary_nooutline': 300, 'commoncard_nooutline': 110,
              'epiccard_nooutline': 110, 'legendarycard_nooutline': 110, 'common_market': 180, 'epic_market': 180,
              'legendary_market': 180, 'legendary_multiplemarket': 200, 'MarketTitleBanner': 600, 'Icon_Timer': 28,
              'ButtonWhite': 120, 'Glow': 160, 'DiscountBadge': 70, 'rounded_square_shadow_top': 85,
              'OutlinedButtonGreen': 320, 'OutlinedButtonGold': 320, 'Xp': 80, 'SkipTickets': 72, 'AdIcon': 84},
    # the market (MarketSpecialOfferCard, MarketOfferSingleItem, MarketSpecialOfferRewardHolder, purchase buttons), market only
    'market': {'MarketOfferVipBackground': 420, 'MarketOfferNoAdsBackground': 420, 'MarketOfferWelcomeBackground': 420,
              'MarketOfferBoostersPackBackground': 420, 'MarketOfferAdventureBackground': 420, 'MarketOfferVipIllustration': 220,
              'MarketOfferNoAdsIllustration': 200, 'MarketOfferBoostersPackIllustration': 200, 'MarketOfferAdventureIllustration': 200,
              'MarketRewardNoAds': 120, 'MarketRewardExclusiveSkins': 120, 'MarketRewardPremiumCollectibles': 120,
              'MarketRewardLegendaryBoostersPile': 120, 'SkinCoinsPile': 120, 'Icon_Compass': 110, 'SkipTicketsPile': 120,
              'XpPile': 120, 'MarketRewardPremiumCollectiblesWithSkins': 120,
              'MarketOfferSkinCoins_1': 160, 'MarketOfferSkinCoins_2': 160, 'MarketOfferSkinCoins_4': 160, 'MarketOfferSkinCoins_5': 160,
              'MarketOfferSkinCoins_6': 160, 'MarketOfferSkipTickets_1': 160, 'MarketOfferSkipTickets_2': 160, 'MarketOfferSkipTickets_3': 160,
              'SpecialOffersPriceHolder': 190, 'ButtonGreen': 60, 'ButtonOrange': 60, 'DiscountRedBAr': 51, 'AdIcon': 84,
              'ShinySun': 200, 'HolderCategory': 160, 'InfoButton': 50, 'rounded_square_128px': 128},
    # rewarded-ad and VIP buttons used across pages (RewardedButton, NoAdsIconChanger, ActionButton NoAdsButton, VipOfferWidget,
    # TournamentPage Rewarded/PremiumButton, BoosterOpeningPopup) and the home page's market offer widgets (MarketOfferWidget)
    'ads': {'AdIcon': 84, 'SkipTickets': 100, 'Ticket': 90, 'VIPButtonSmall_01': 200, 'VIPCrownIcon_01': 84,
            'Light_ButtonRewarded': 170, 'UnlockSkin_Star': 40, 'OutlinedButtonGold': 320, 'OutlinedButtonGreen': 320,
            'MarketOfferVipWidget': 200, 'MarketOfferWelcomeWidget': 190, 'MarketRewardNoAds': 170},
    # HomePage first run (FTUE): PlayButton/TutorialHand (150 units) and its CircleLight (100 units), only while no Normal
    # level is cleared. Trimmed PNGs: home.js places them by the trim offsets of dump/ftue/sprites.json.
    'ftue': {'Hand_tutorial': 220, 'CircleLight': 180},
    # SettingsPopup (ui_popups_settingspopup); popup_settings_icon is the Unity sprite 'settings' (renamed on export)
    'settings': {'popup_settings_icon': 320, 'Glow': 200, 'globe': 72, 'gdpr': 72, 'chat': 72, 'copy_button': 120,
                 'close_circle': 160, 'checkmark': 64, 'notification': 64,
                 # Delete Account confirmations [ĐỀ XUẤT]: the game's green outlined button (red through a hue turn)
                 'OutlinedButtonGreen': 320},
    # rev 20261028o popups (js/popups.js), from REF/sprites_popups, one sheet per group so each popup loads only its art:
    # pmode: ModeUnlockedPopUp (+ the gamemodes_*_icon sprites, renamed ModeIcon_<mode>), CustomizationItemUnlockedPopUp,
    # CollectionCompletedPopUp and their collection progress bar
    'pmode': {'ShinySun': 300, 'Pattern_MainMenu': 256, 'OutlinedButtonGreen': 320, 'EquipButton': 290, 'ModeIcon_adventure': 260,
              'ModeIcon_challenge': 260, 'ModeIcon_grapple': 260, 'ModeIcon_pachinko': 128, 'ModeIcon_tournament': 300,
              'rounded_square_128px': 128, 'rounded_square_shadow_bottom': 77, 'IconValidate': 59, 'IconValidateSlot': 59,
              'Icon_Validate': 59, 'CollectionCompletionLink': 14},
    # pseason: NewTournamentPopup, NewAdventurePopup
    'pseason': {'ShinySun': 300, 'Pattern_Trophy_Invers': 256, 'UnlockSkin_Star': 40, 'OutlinedButtonGreen': 320,
                'Holder tournament': 386, 'HolderRules': 110, 'CompetitorsIcon_01': 100, 'CupIcon_01': 90, 'HolderTime_01': 167,
                'Icon_Trophy': 180, 'SkinCoins': 90, 'Holder_Adventure': 256, 'Holder_Counter': 128, 'Button_Adventure': 300,
                'Icon': 200, 'Icon_Timer': 28, 'Icon_CoinsMultiplier': 160, 'Icon_Compass': 120, 'Icon_Competitor': 110,
                'Icon_Gameplay': 120, 'CompassBG': 240, 'BG_Pattern01': 420, 'BG_Pattern03': 420, 'MarketOfferBoostersPackIllustration': 180},
    # pskin: IncentiveRewardedSkinUnlockPopup (end-game customization_item_unlock_incentive)
    'pskin': {'ShinySun': 300, 'Pattern_Trophy_Invers': 256, 'HolderPopupCollection': 520, 'TopHolder': 600, 'Pattern_gift_01': 142,
              'OutlinedButtonGold': 320, 'AdIcon': 84, 'Xp': 110, 'rounded_square_128px': 128, 'rounded_square_shadow_bottom': 77,
              'IconValidate': 59, 'IconValidateSlot': 59, 'Icon_Validate': 59, 'CollectionCompletionLink': 14},
    # ovip: MarketVipPopup and its MarketVipPopupRewardHolder rows; ooffer: MarketOfferPopup (adventure_1/2, boosters_pack)
    'ovip': {'VipPopupIcon': 420, 'VipDiscountPopupIcon': 420, 'VipPopupBackground': 96, 'VipPopupShadowBackground': 342,
             'MarketRewardNoAds': 110, 'MarketRewardPremiumCollectiblesWithXp': 110, 'SkipTicketsPile': 110, 'SkinCoinsPile': 110,
             'MarketRewardLegendaryBoostersPile': 110, 'rounded_square_shadow_top': 85, 'rounded_square_128px': 128,
             'OutlinedButtonGold': 300, 'DiscountRedBAr': 51},
    'ooffer': {'OfferBg_adventure': 272, 'OfferIllu_adventure': 420, 'OfferBg_boosterspack': 272, 'OfferIllu_boosterspack': 420,
               'ShinySun': 300, 'MarketOfferBoostersPackIllustration': 200, 'MarketOfferAdventureIllustration': 200, 'Icon': 110, 'SkinCoinsPile': 110, 'common_market': 110,
               'epic_market': 110, 'legendary_market': 110, 'rounded_square_shadow_top': 85, 'rounded_square_128px': 128,
               'rounded_square_flat_top': 128, 'OutlinedButtonGold': 300, 'DiscountRedBAr': 51, 'Icon_Timer': 28},
}


# Which sprites the original never stretches (rev 20261028o). REF/dump/ui_images.json (REF/tools/image_census.py) lists every
# UI Image in the UI prefab bundles: [m_Type, m_PreserveAspect, fixed rect w, h (None when the anchors stretch it),
# AspectRatioFitter mode, bundle, GameObject]. A sprite is kept at its aspect (data/m-*.json _keep, uikit.js spr() fits it)
# when most of its Simple (m_Type 0) uses have m_PreserveAspect 1, an AspectRatioFitter, or a fixed rect within 4 % of the
# sprite's aspect. Sliced / Tiled / Filled uses and Simple uses stretched by their anchors stay stretched. A sprite no prefab
# names (set from code: menu bar tab icons, cards) is kept when it has no 9-slice border [ĐỀ XUẤT].
CENSUS = os.path.join(REF, 'dump', 'ui_images.json')
_census = json.load(open(CENSUS)) if os.path.exists(CENSUS) else {}


def keeps_aspect(name, w, h, border):
    uses = _census.get(name)
    if uses is None and '_' in name:
        uses = _census.get(name.rsplit('_', 1)[0])  # <Name>_<rarity>
    if not uses:
        return not any(border)
    simple = [u for u in uses if u[0] == 0]
    if not simple:
        return False
    keep = sum(1 for u in simple if u[1] or u[4] is not None
               or (u[2] and u[3] and abs((u[2] / u[3]) / (w / h) - 1) <= 0.04))
    return keep * 2 >= len(simple)


def annotate(rects):
    rects['_keep'] = sorted(n for n, r in rects.items() if not n.startswith('_') and keeps_aspect(n, r[2], r[3], r[4:8]))
    return rects


def build(screen, sprites):
    meta = {}
    for d in DIRS[::-1] + ([FTUE_DIR[screen]] if screen in FTUE_DIR else []):
        mp = os.path.join(d, 'meta.json')
        if os.path.exists(mp):
            meta.update(json.load(open(mp)))
    ims = []
    for name, side in sprites.items():
        # first folder that has it; level / skin sprites (the home screen's default stickman) from export_sprites.py
        dirs = ([FTUE_DIR[screen]] if screen in FTUE_DIR else []) + DIRS
        p = next((q for q in (os.path.join(d, name + '.png') for d in dirs) if os.path.exists(q)), '')
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
    annotate(rects)
    open(os.path.join(GAME, 'data', 'm-' + screen + '.json'), 'w').write(json.dumps(rects, separators=(',', ':')))
    print(screen, W, 'x', H, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[2] == 'aspect':  # only re-mark _keep in the existing data/m-*.json (no art rebuild)
        for s in SHEETS:
            p = os.path.join(GAME, 'data', 'm-' + s + '.json')
            if os.path.exists(p):
                r = annotate(json.load(open(p)))
                open(p, 'w').write(json.dumps(r, separators=(',', ':')))
                print(s, len(r['_keep']), 'kept /', len(r) - 2)
        sys.exit(0)
    only = sys.argv[2:]  # optional screen names: rebuild just those sheets
    for s, sp in SHEETS.items():
        if not only or s in only:
            build(s, sp)
