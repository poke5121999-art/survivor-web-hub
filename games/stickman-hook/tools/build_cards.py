"""Cards, boosters and black market data, from the default remote settings bundled in the APK.

    py -3 -I build_cards.py [REF=D:/stickman-hook-ref]

Writes data/cards.json (loaded with js/cards.js, never on the first level):
  cards:  [[id, category, rarity, name, description, valueFormat, maxLevel, cardsPerLevel, sprite, minEffect, maxEffect, step]]
  cats:   [[id, displayName, gameModeId | null, pattern sprite]]   (CardsCategoryDto, in config order)
  rarity: {id: [color, darkColor, bgPatternColor, lvlTextColor]}
  boosters: {id: [name, description, rarity, nbCards, nbRewarded, nbBonus, minStack, maxStack, [[rarity, weight]], guaranteed[],
             packSprite, marketSprite]}
  boosterRarity: {rarity: [noveltyChance %, compensation coins]}
  market: {resourceId: [subSection, coins]}  (black_market.unitPrices)
  boost:  [[cardId, resource, source, dailyCap | 0]]  (resource_boosting)
  perk:   [[value, [[res, qty]]]], perkFallback  (progression road progression.cards_perk_level)
  offers: [[offerId, [[res, qty]], coins]]  booster offers of the market; coins = the coin price used here ([ĐỀ XUẤT], see
          OFFER_COINS) because the original sells them for real money
"""
import sys, os, io, json

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rs = json.load(io.open(os.path.join(REF, 'dump/full/remote_settings_default.json'), encoding='utf-8'))

# Cards/Items/<Folder>/Sprite -> the sprite's own name (tools/build_menus.py CARD_SPRITES)
cards = []
for c in rs['cards']['cards']:
    sprite = c['spriteAddress'].split('/')[2]
    cards.append([c['id'], c['categoryId'], c['rarityId'], c['displayName'], c['description'], c['cardMultiplier'],
                  c['cardMaxLevel'], c['requiredCardsPerLevel'], sprite, c['minEffect'], c['maxEffect'], c['effectGraduation']])
cats = [[k['id'], k['displayName'], k.get('gameModeId'), k['backgroundSpriteAddress'].split('/')[2]] for k in rs['cards']['categories']]
rarity = {r['id']: [r['colorCode'], r['darkColorCode'], r['bgPatternColorCode'], r['lvlTextColorCode']]
          for r in rs['rarity']['rarities'] if 'cardHolderSpriteAddress' in r}

SPRITE = {'Boosters/%s/%s' % (a, b): ('%s_%s' % (a, b)).lower() for a in ('Common', 'Epic', 'Legendary', 'CommonCard', 'EpicCard',
          'LegendaryCard') for b in ('NoOutline', 'Market', 'MultipleMarket')}
boosters = {}
for b in rs['booster']['boosters']:
    boosters[b['id']] = [b['displayName'], b['description'], b['rarityId'], b['nbCards'], b['nbRewarded'], b['nbBonus'],
                         b['minStackPerCard'], b['maxStackPerCard'], [[w['rarityId'], w['weight']] for w in b['cardsWeight']],
                         b.get('guaranteedCards', []), SPRITE[b['noOutlineSpriteAddress']], SPRITE[b['marketSpriteAddress']]]
booster_rarity = {r['rarityId']: [r['noveltyChance'], r['compensation']['quantity']] for r in rs['booster']['boosterRarities']}

market = {u['resourceId']: [u['subSectionId'].split('.')[1], u['price']['quantity']] for u in rs['black_market']['unitPrices']}
boost = [[b['cardId'], b['boostedResourceId'], b['boostedSource'], b.get('maxDailyBoostedQuantity', 0)]
         for b in rs['resource_boosting']['resourceBoosters']]

perk = [[t['value'], [[r['item']['resourceId'], r['item']['quantity']] for r in t['rewards']]]
        for t in rs['progression_road']['thresholds'] if t['progressionRoadResourceId'] == 'progression.cards_perk_level']
perk.sort()
perk_fallback = next([[r['resourceId'], r['quantity']] for r in p['fallbackRewards']]
                     for p in rs['progression_road']['progressions'] if p['resourceId'] == 'progression.cards_perk_level')

# Market booster offers (offerGroup "booster"): IAP in the original, and no table in the APK ties a product to a price
# tier (IAPPriceConversion holds tier -> local prices only). [ĐỀ XUẤT] coin price = the booster's expected cards at the
# config's own coin price of a card (black_market.unitPrices by rarity): sum over its draws of the mean stack
# (min + max) / 2 x the unit price of the draw's rarity (guaranteed rarity, else the cardsWeight mean), rounded to 100.
unit = {}
for c in rs['cards']['cards']:
    unit[c['rarityId']] = market[c['id']][1]


def booster_coins(bid):
    b = boosters[bid]
    n, lo, hi, weights, guaranteed = b[3], b[6], b[7], b[8], b[9]
    tot = sum(w for _, w in weights)
    mean_w = sum(unit[r] * w for r, w in weights) / tot
    v = 0
    for i in range(n):
        g = guaranteed[i] if i < len(guaranteed) else None
        price = unit[g.split('.')[1]] if g and g.startswith('booster_card.') else mean_w
        v += (lo + hi) / 2 * price
    return v


OFFER_COINS = {}
for o in rs['market']['offers']:
    if o['offerGroupId'] == 'booster':
        got = [c['reward'] for c in rs['market']['offerContent'] if c['sourceId'] == o['id']]
        OFFER_COINS[o['id']] = int(round(sum(booster_coins(r['resourceId']) * r['quantity'] for r in got) / 100.0) * 100)
print('booster offers (coins):', OFFER_COINS)
offers = []
content = rs['market']['offerContent']
for o in rs['market']['offers']:
    if o['offerGroupId'] != 'booster':
        continue
    got = [[c['reward']['resourceId'], c['reward']['quantity']] for c in content if c['sourceId'] == o['id']]
    offers.append([o['id'], got, OFFER_COINS.get(o['id'], 0)])

# Black market exclusions (PickBlackMarketCustomizationItems b__0 [asm 0x126cc18]): the tournament's prize pool and the
# Lucky Drop main prize (the first pachinko.mainRewardOptions item not owned, GenerateMainReward).

def find_pool(x, pid):
    if isinstance(x, dict):
        if x.get('id') == pid:
            return x
        for v in x.values():
            r = find_pool(v, pid)
            if r:
                return r
    elif isinstance(x, list):
        for v in x:
            r = find_pool(v, pid)
            if r:
                return r
    return None


import re
tour_pool = re.findall(r'skin\.[a-z0-9_]+', json.dumps(find_pool(rs, 'reward_pool.tournament_skin')))
pachinko_main = [o['reward']['resourceId'] for o in rs['pachinko']['mainRewardOptions']]

out = {'v': 1, 'exclude': {'tournament': tour_pool, 'pachinkoMain': pachinko_main}, 'cards': cards, 'cats': cats, 'rarity': rarity, 'boosters': boosters, 'boosterRarity': booster_rarity,
       'market': market, 'boost': boost, 'perk': perk, 'perkFallback': perk_fallback, 'offers': offers}
txt = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
io.open(os.path.join(GAME, 'data/cards.json'), 'w', encoding='utf-8').write(txt)
print('cards.json', len(txt.encode('utf-8')), 'bytes,', len(cards), 'cards,', len(market), 'market prices,', len(offers), 'offers')
