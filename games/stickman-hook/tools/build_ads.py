"""Rewarded ads and in-app purchases: ../data/ads.json (+ ../art/skip-ad.webp).

    py -3 -I build_ads.py [REF=D:/stickman-hook-ref]

From the default remote settings in the APK (dump/full/remote_settings_default.json):
  ads.placements rewarded.default   skipPrice (1 skip ticket) and freeSkipRequirementId (has_old_no_ads)
  market                            sections, offer groups, offers, offerContent, offerPrices (IAP / FREE / REWARDED)
  view_templates                    titles, sprites and colours of the market cards, widgets and sections
  requirements                      the display / purchase requirements the offers use (and the groups they nest)
  periodic_resources                daily.* / weekly.* periods
The store prices are not in the APK (the store sends them at run time), see USD below.
art/skip-ad.webp: SkipButtonView.skipRewardedSprite (SkipButton0001), the in-game skip button while no ticket pays it.
js/bonus.js loads data/ads.json with data/bonus.json; js/ads.js holds the rules.
"""
import sys, os, json

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rs = json.load(open(os.path.join(REF, 'dump/full/remote_settings_default.json'), encoding='utf-8'))

# [ĐỀ XUẤT] store prices in USD, shown in the prefab's "0.99$" format (MarketOfferCard IapText placeholder). The price
# string comes from Google Play at run time (MarketIapPriceDisplayer); the APK holds no product -> price table.
USD = {
    'offer_vip': '19.99$', 'offer_vip_discount': '14.99$', 'offer_welcome_offer': '4.99$', 'offer_no_ads': '3.99$',
    'offer_booster': '9.99$', 'offer_adventure_1': '2.99$', 'offer_adventure_2': '4.99$', 'NoAds': '3.99$',
    'offer_coins_1': '0.99$', 'offer_coins_2': '2.99$', 'offer_coins_3': '9.99$', 'offer_coins_4': '19.99$',
    'offer_skip_tickets_1': '1.99$', 'offer_skip_tickets_2': '4.99$', 'offer_skip_tickets_3': '9.99$',
    'offer_boosters_1': '1.99$', 'offer_boosters_2': '4.99$', 'offer_boosters_3': '19.99$',
}

mk = rs['market']
views = {v['id']: v for v in rs['view_templates']['views']}
placement = next(p for p in rs['ads']['placements'] if p['placementId'] == 'rewarded.default')

# requirements: every id reachable from the offers, prices and contents
R = {r['requirementId']: r for r in rs['requirements']['requirements']}
G = {g['groupId']: g for g in rs['requirements']['requirementGroups']}
reqs = {}


def need(rid):
    if not rid or rid in reqs:
        return
    if rid in G:
        g = G[rid]
        reqs[rid] = {'g': g['groupType'], 'of': g['subItems']}
        for x in g['subItems']:
            need(x)
        return
    r = R[rid]
    o = {'t': r['requirementType']}
    for k, kk in (('key', 'k'), ('comparator', 'c'), ('value', 'v')):
        if k in r:
            o[kk] = r[k]
    if 'cycle' in r:
        o['cycle'] = [r['cycle']['quantity'], r['cycle']['unit']]
        o['dur'] = [r['duration']['quantity'], r['duration']['unit']]
    reqs[rid] = o


def rich(t):
    return t if isinstance(t, str) else str(t)


offers = []
for o in mk['offers']:
    oid = o['id']
    content = [[c['reward']['resourceId'], c['reward']['quantity']] + ([c['requirementId']] if c.get('requirementId') else [])
               for c in mk['offerContent'] if c['sourceId'] == oid]
    prices = []
    for p in mk['offerPrices']:
        if p['offerId'] != oid:
            continue
        pr = {'id': p['priceId'], 'pay': p['paymentType']}
        if p.get('iapProductId'):
            pr['product'] = p['iapProductId']
            pr['usd'] = USD[p['iapProductId']]
        for k in ('displayRequirementId', 'purchaseRequirementId', 'discount'):
            if p.get(k):
                pr[{'displayRequirementId': 'display', 'purchaseRequirementId': 'purchase', 'discount': 'discount'}[k]] = p[k]
        need(pr.get('display')); need(pr.get('purchase'))
        prices.append(pr)
    for c in content:
        if len(c) > 2:
            need(c[2])
    out = {'id': oid, 'group': o['offerGroupId'], 'content': content, 'prices': prices}
    if o.get('displayRequirementId'):
        out['display'] = o['displayRequirementId']
        need(o['displayRequirementId'])
    if o.get('source'):
        out['source'] = o['source']
    card = views.get(o.get('viewPurchaseCardId') or '')
    if card:
        v = {'prefab': card['prefabAddress'].split('/')[-2], 'title': rich(card.get('title', ''))}
        for k in ('subTitle', 'mainSpriteAddress', 'quantityTextTemplate'):
            if card.get(k) is not None:
                v[k] = card[k]
        bg = card.get('background') or {}
        for k in ('spriteAddress', 'color', 'shadowColor', 'shinySunColor', 'glowColor'):
            if bg.get(k):
                v['bg_' + k] = bg[k]
        if card.get('subViews'):
            v['rewards'] = [[s['title'], s['mainSpriteAddress']] + ([s['requirementId']] if s.get('requirementId') else [])
                            for s in card['subViews']]
            for s in card['subViews']:
                need(s.get('requirementId'))
        out['card'] = v
    w = views.get(o.get('viewWidgetId') or '')
    if w:
        out['widget'] = {'title': w.get('title', ''), 'sprite': w['mainSpriteAddress']}
    offers.append(out)

groups = {}
for g in mk['offerGroups']:
    v = views.get(g['viewId'], {})
    groups[g['id']] = {'section': g['sectionId'], 'title': v.get('title', '')}
    if g.get('purchaseRequirementId'):
        groups[g['id']]['purchase'] = g['purchaseRequirementId']
        need(g['purchaseRequirementId'])
sections = []
for s in mk['sections']:
    v = views[s['viewId']]
    sections.append({'id': s['id'], 'title': v['title'], 'color': v['backgroundColor'], 'shadow': v['backgroundShadowColor']})

periodic = {r['resourceId']: [r['frequency']['quantity'], r['frequency']['unit'], r['isUtc']]
            for r in rs['periodic_resources']['resources']}
data = {
    'v': 1,
    'skipPrice': [placement['skipPrice']['resourceId'], placement['skipPrice']['quantity']],
    'freeSkip': placement['freeSkipRequirementId'],
    'sections': sections, 'groups': groups, 'offers': offers, 'reqs': reqs, 'periodic': periodic,
    'timer': views['market_offer_price.generic']['timerTemplate'],
}
need(data['freeSkip'])
txt = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
open(os.path.join(GAME, 'data/ads.json'), 'w', encoding='utf-8').write(txt)
print('ads.json', len(txt.encode('utf-8')), 'bytes,', len(offers), 'offers,', len(reqs), 'requirements')

# the in-game skip button's rewarded-ad sprite (the ticket one is art/skip.webp, tools/build_meta.py)
try:
    sys.path.insert(0, os.path.join(REF, 'tools'))
    from shenv import load_with_deps, AND
    b = next(f for f in os.listdir(AND) if f.startswith('defaultlocalgroup_assets_ui_pages_ingame_default'))
    env = load_with_deps(b)
    sp = next(o.read() for o in env.objects if o.type.name == 'Sprite' and o.peek_name() == 'SkipButton0001')
    im = sp.image
    im = im.resize((round(im.width * 0.5), round(im.height * 0.5)))
    im.save(os.path.join(GAME, 'art/skip-ad.webp'), quality=82, method=6)
    print('skip-ad.webp', im.size, os.path.getsize(os.path.join(GAME, 'art/skip-ad.webp')), 'bytes')
except ImportError as e:
    print('UnityPy missing, art/skip-ad.webp not rebuilt:', e)
