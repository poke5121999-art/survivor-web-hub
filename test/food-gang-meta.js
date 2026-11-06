/*
 * Food Gang meta (games/food-gang/js/meta): differential test of the JS port against the C# library FG.Meta.
 *
 *   node test/food-gang-meta.js                 # uses the dump in D:\foodgang-ref\metatest\dump (regenerated if missing)
 *   node test/food-gang-meta.js --regen         # rerun `dotnet run --project D:\foodgang-ref\metatest -- dump <dir>` first
 *   node test/food-gang-meta.js --dump <dir>    # another dump directory
 *   node test/food-gang-meta.js --no-dump       # only the ported metatest asserts and careers
 *
 * 1. Replays every recorded C# operation (scripted list, seeded 300-match career, career to 10 100 trophies) in JS
 *    with the recorded RNG state, and requires the same result/events JSON, the same RNG state after, and
 *    byte-identical profile JSON at every step. Prints the first divergence of each stream (step, path, both values).
 * 2. Checks the C# float "R" formatter port on recorded float32 vectors.
 * 3. Runs the literal-value asserts of metatest/Program.cs and both careers in JS; career final JSON must equal C#'s.
 * Exit code 0 only when everything matches.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const HUB = path.resolve(__dirname, '..');
const META_DIR = path.join(HUB, 'games', 'food-gang', 'js', 'meta');
const DATA = path.join(HUB, 'games', 'food-gang', 'data', 'metadata.json');
const REF = 'D:\\foodgang-ref';
const METATEST = path.join(REF, 'metatest');
const REF_DATA = path.join(REF, 'fg-unity', 'Assets', 'FG', 'Resources', 'fg-metadata.json');

const argv = process.argv.slice(2);
const argVal = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const DUMP = argVal('--dump') || path.join(METATEST, 'dump');
const REGEN = argv.includes('--regen');
const NO_DUMP = argv.includes('--no-dump');

let asserts = 0, failed = 0;
function check(ok, what) {
  asserts++;
  if (ok) return;
  failed++;
  console.log('FAIL ' + what);
}
const eq = (actual, expected, what) => check(Object.is(actual, expected) || actual === expected,
  `${what}: expected ${expected}, got ${actual}`);

(async () => {
  const M = await import(pathToFileURL(path.join(META_DIR, 'index.js')).href);
  const J = await import(pathToFileURL(path.join(META_DIR, 'json.js')).href);
  const {
    MetaDb, MetaService, MetaRng, MetaTime, ProfileJson, MemoryProfileStore, Profile, RewardType, Rarity, PriceType,
    GoalType, TeamConfig, FridgeOpenMethod, AdPlacement, DailyGiftSlot, ShopGroup, RoadStepState, MetaErrors,
    MatchRequest, MatchSlot, MatchOutcome, MatchResult, MatchRequestResult, CustomMatchOptions, reward, newSkinProgress,
    BoxOpened, SkinUnlocked, PowerUnlocked, LeagueUp, LeagueOfferUnlocked, MissionsUnlocked, DailyOffersRefreshed,
    missionRewardAvailable, FormatError, LocalStorageProfileStore,
  } = M;
  const { writeJson, formatFloat } = J;
  // a JS float field holding a non-float32 double prints like the float but drifts later: count them as divergences
  let nonFloat = 0;
  const f32 = v => { if (Math.fround(v) !== v) nonFloat++; return J.f32(v); };

  const dataText = fs.readFileSync(DATA, 'utf8');
  const db = MetaDb.load(dataText);
  const meta = new MetaService(db);
  const T0 = new Date(Date.UTC(2026, 9, 26, 9, 0, 0)); // a Monday
  const addMin = (d, m) => new Date(d.getTime() + m * 60000);
  const addH = (d, h) => addMin(d, h * 60);
  const addD = (d, n) => addH(d, n * 24);
  const addS = (d, s) => new Date(d.getTime() + s * 1000);

  if (fs.existsSync(REF_DATA)) check(fs.readFileSync(REF_DATA, 'utf8') === dataText, 'data/metadata.json is a byte copy of fg-metadata.json');

  // ================================================================ serializers (mirror metatest/Dump.cs)

  const rw = r => (r === null || r === undefined ? null : { type: r.type, count: r.count, skinId: r.skinId, powerId: r.powerId, id: r.id });

  function ev(e) {
    switch (e.type) {
      case 'RewardGranted': return { e: e.type, reward: rw(e.reward), source: e.source };
      case 'CurrencyChanged': return { e: e.type, currency: e.currency, delta: e.delta, balance: e.balance };
      case 'SkinUnlocked': return { e: e.type, skinId: e.skinId };
      case 'TokensAdded': return { e: e.type, skinId: e.skinId, count: e.count };
      case 'SkinLevelUp': return { e: e.type, skinId: e.skinId, level: e.level };
      case 'PowerUnlocked': return { e: e.type, skinId: e.skinId, powerId: e.powerId };
      case 'TrophiesChanged': return { e: e.type, before: e.before, after: e.after };
      case 'LeagueUp': return { e: e.type, rowId: e.row.id, rowIndex: e.row.index };
      case 'LeagueOfferUnlocked': return { e: e.type, packId: e.pack.id };
      case 'StarsChanged': return { e: e.type, stars: e.stars, stock: e.stock };
      case 'FridgeEarned': return { e: e.type, box: e.box };
      case 'FridgeStockRefilled': return { e: e.type, stock: e.stock };
      case 'BoxOpened': return { e: e.type, box: e.box, contents: e.contents.map(rw) };
      case 'MissionsUnlocked': return { e: e.type };
      case 'MissionsRefreshed': return { e: e.type, week: e.week };
      case 'MissionCompleted': return { e: e.type, index: e.index };
      case 'DailyOffersRefreshed': return { e: e.type, day: e.day };
      case 'VipChanged': return { e: e.type, vipUntil: e.vipUntil };
      case 'AchievementUnlocked': return { e: e.type, id: e.achievement.id };
      case 'DifficultyChanged': return { e: e.type, before: f32(e.before), after: f32(e.after) };
      default: throw new Error('unknown event ' + e.type);
    }
  }

  const slotSer = s => (s === null ? null : {
    slot: s.slot, team: s.team, skinId: s.skinId, level: s.level, isBot: s.isBot, isAlly: s.isAlly,
    botNameIndex: s.botNameIndex, name: s.name, botAggro: s.botAggro,
  });

  const reqSer = q => (q === null ? null : {
    goal: q.goal, team: q.team, modeText: q.modeText, modeIndex: q.modeIndex, mapIndex: q.mapIndex, stageId: q.stageId,
    seed: q.seed, bossOnLeft: q.bossOnLeft, localSlot: q.localSlot, missionIndex: q.missionIndex,
    isFriendRoom: q.isFriendRoom, isTutorial: q.isTutorial, hostLevel: q.hostLevel, hostDifficulty: f32(q.hostDifficulty),
    botDifficultyInt: q.botDifficultyInt, slots: q.slots.map(slotSer),
  });

  function resSer(r) {
    const o = { ok: r.ok, error: r.error, events: r.events.map(ev), rewards: r.rewards.map(rw) };
    if (r instanceof MatchResult) {
      Object.assign(o, {
        rank: r.rank, victory: r.victory, trophiesGained: r.trophiesGained, starsGained: r.starsGained,
        starStart: r.starStart, starEnd: r.starEnd, rewardPanel: r.rewardPanel, fridgeBox: r.fridgeBox,
        canOpenFree: r.canOpenFree, canOpenAdOrGems: r.canOpenAdOrGems, fridgeGemPrice: r.fridgeGemPrice,
        missionCompleted: r.missionCompleted, difficultyBefore: f32(r.difficultyBefore), difficultyAfter: f32(r.difficultyAfter),
      });
    }
    if (r instanceof MatchRequestResult) o.request = reqSer(r.request);
    return o;
  }

  function reqFrom(o) {
    const { slots, ...rest } = o;
    const q = new MatchRequest({ ...rest, hostDifficulty: Math.fround(o.hostDifficulty) });
    q.slots = slots.map(s => (s === null ? null : new MatchSlot(s)));
    return q;
  }

  const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
  const packId = k => (k === null ? null : k.id);

  // ================================================================ queries (mirror Dump.cs Q/QAll/QTime)

  function query(name, p, now, rng, args) {
    switch (name) {
      case 'Balance': return [meta.balance(p, 0), meta.balance(p, 1)];
      case 'Flags': return {
        isVip: Profile.isVip(p, now), adsDisabled: meta.adsDisabled(p, now), boxAvailable: meta.boxAvailable(p),
        anyToken: meta.anyTokenAvailable(p), alertUpgrade: meta.alertUpgrade(p), alertCollection: meta.alertCollection(p),
        missionAlert: meta.missionAlert(p), canOpenFree: meta.canOpenFridgeFree(p, now), canOpenAdOrGems: meta.canOpenFridgeAdOrGems(p, now),
        refillIn: meta.fridgeRefillSecondsLeft(p, now), packTimeLeft: meta.leaguePackTimeLeft(p, now),
        saturday: packId(meta.saturdayLeagueOffer(p, now)), paidBought: meta.dailyPaidOfferBought(p, now),
        roadToCollect: meta.roadRewardToCollect(p)?.id ?? null, maxSkinLevel: Profile.maxSkinLevel(p),
      };
      case 'CollectionOrder': return meta.collectionOrder(p).map(s => s.id);
      case 'Skins': return p.skins.map(s => ({
        id: s.id, tokenAvailable: meta.tokenAvailable(s), canUpgrade: meta.canUpgrade(p, s),
        canUpgradeTokens: meta.canUpgradeTokens(s), level: Profile.level(p, s.id),
      }));
      case 'Road': return db.leagues.map(row => ({
        id: row.id, avail: meta.isRoadStepAvailable(p, row), step: meta.roadStep(p, row), progress: f32(meta.roadProgress(p, row)),
      }));
      case 'ActiveLeaguePack': {
        const a = meta.activeLeaguePack(p, now);
        return a === null ? null : { packId: a.pack.id, secondsLeft: a.secondsLeft, saturdaySpecial: a.saturdaySpecial };
      }
      case 'Missions': return p.missions.slots.map(s => ({
        unlocked: meta.isMissionUnlocked(s, now), unlocksIn: meta.missionUnlocksIn(s, now), rewardAvailable: missionRewardAvailable(s),
      }));
      case 'DailyGifts': return meta.dailyGifts(p, now).map(v => ({
        slot: v.slot, reward: rw(v.reward), priceType: v.priceType, claimed: v.claimed, adsWatched: v.adsWatched, adsNeeded: v.adsNeeded,
      }));
      case 'SpecialOfferPrice': return meta.specialOfferPrice(p.daily.specialOffer);
      case 'Achievements': return db.achievements.map(a => meta.achievementProgress(p, a));
      case 'Time': {
        const paid = meta.dailyPaidOffer(now);
        return {
          weekEndsIn: meta.missionWeekEndsIn(now), dailyResetIn: meta.dailyResetIn(now),
          weekly0: meta.weeklySkinId(now, 0), weekly1: meta.weeklySkinId(now, 1),
          paidOffer: paid === null ? null : { id: paid.id, group: paid.group, price: paid.price },
        };
      }
      case 'DefaultName': return meta.defaultName(rng);
      case 'Names': return args.names.map(n => ({ name: n, allowed: meta.isNameAllowed(n), norm: MetaService.normalizeName(n) }));
      case 'Leagues': return range(0, 1030).map(i => i * 10 - 7).concat(db.leagues.map(l => l.threshold)).map(tr => ({
        t: tr, league: db.leagueAt(tr).id, sub: db.subLeagueAt(tr).id, next: db.stepNext(tr)?.id ?? null,
        max: db.maxOf(db.leagueAt(tr)), pack: db.leaguePackAt(tr)?.id ?? null,
      }));
      case 'Statics': return {
        starForRank: range(-1, 7).map(r => MetaService.starForRank(r)),
        trophyForResult: range(0, 4).flatMap(team => range(-1, 7).map(r => meta.trophyForResult(team, r))),
        slotRemap: range(-60, 121).concat([-2147483648, 2147483647, -2147483647, 1 << 30, 123456789]).map(s => MetaService.slotRemap(s)),
        teamForSlot: range(0, 4).flatMap(team => range(0, 4).flatMap(slot => [false, true].map(b => MetaService.teamForSlot(slot, team, b)))),
        levelCoef: range(0, 22).map(l => f32(MetaService.levelCoef(l))),
        powersUnlocked: range(0, 22).map(l => meta.powersUnlocked(l)),
        iap: meta.iapProducts.map(x => ({ id: x.id, kind: x.kind, vipDays: x.vipDays })),
        shopPrices: db.shop.map(s => [meta.price(s, false), meta.price(s, true)]),
        offerPrices: [0, 1, 7, 15, 40, 80, 125, 250, 333, 999].flatMap(pr =>
          [RewardType.Box1, RewardType.Box2, RewardType.Box3, RewardType.Freemium].flatMap(rt =>
            [PriceType.Freemium, PriceType.Premium, PriceType.InApp, PriceType.Free].map(pt => meta.price(pt, pr, reward(rt), true)))),
        promoPrices: range(0, 18).map(id => meta.promoSkinPrice(id)),
        specialOfferPrices: range(0, 18).map(id => meta.specialOfferPrice(reward(RewardType.Skin, 1, id))),
      };
      default: throw new Error('unknown query ' + name);
    }
  }

  // ================================================================ replay

  function exec(rec, P, store, now, rng) {
    const a = rec.args;
    const p = rec.pid !== undefined ? P.get(rec.pid) : null;
    switch (rec.op) {
      case 'NewProfile': P.set(rec.pid, meta.newProfile(now, rng)); return null;
      case 'Load': P.set(rec.pid, ProfileJson.fromJson(a.json)); return null;
      case 'Save': ProfileJson.save(store, p); return store.json;
      case 'LoadStore': P.set(rec.pid, ProfileJson.load(store)); return null;
      case 'FromJson':
        try { return { ok: true, json: ProfileJson.toJson(ProfileJson.fromJson(a.json)) }; } catch (e) {
          if (e instanceof FormatError) return { ok: false };
          throw e;
        }
      case 'CompleteTutorial': return resSer(meta.completeTutorial(p, now));
      case 'SetName': return resSer(meta.setName(p, a.name));
      case 'Tick': return resSer(meta.tick(p, now, rng));
      case 'RefreshDailyOffers': return resSer(meta.refreshDailyOffers(p, now, rng));
      case 'BuildMatchRequest':
        return resSer(meta.buildMatchRequest(p, now, rng, a.missionIndex, a.custom === null ? null : new CustomMatchOptions(a.custom)));
      case 'BuildTutorialRequest': return reqSer(meta.buildTutorialRequest(p));
      case 'ApplyMatchResult': return resSer(meta.applyMatchResult(p, reqFrom(a.request), new MatchOutcome(a.outcome), now, rng));
      case 'OpenFridge': return resSer(meta.openFridge(p, a.method, now, rng));
      case 'UpgradeSkin': return resSer(meta.upgradeSkin(p, a.skinId, now, rng));
      case 'SelectSkin': return resSer(meta.selectSkin(p, a.skinId));
      case 'MarkSkinSeen': meta.markSkinSeen(p, a.skinId); return null;
      case 'ClaimRoadStep': return resSer(meta.claimRoadStep(p, a.rowId, now, rng));
      case 'ClaimMission': return resSer(meta.claimMission(p, a.index, now, rng));
      case 'BuyShopItem': return resSer(meta.buyShopItem(p, a.itemId, now, rng));
      case 'ClaimDailyGift': return resSer(meta.claimDailyGift(p, a.slot, now, rng));
      case 'BuyDailyPaidOffer': return resSer(meta.buyDailyPaidOffer(p, now, rng));
      case 'BuySpecialOffer': return resSer(meta.buySpecialOffer(p, now, rng));
      case 'BuyPromoSkin': return resSer(meta.buyPromoSkin(p, now, rng));
      case 'ClaimIap': return resSer(meta.claimIap(p, a.productId, now, rng));
      case 'ClaimAdReward': return resSer(meta.claimAdReward(p, a.placement, now, rng));
      case 'GrantReward': return resSer(meta.grantReward(p, a.reward, a.source, now, rng));
      case 'Q': return query(a.name, p, now, rng, a);
      default: throw new Error('unknown op ' + rec.op);
    }
  }

  /** First differing path between two JSON texts, with both values. */
  function firstDiff(jsText, csText) {
    let x, y;
    try { x = JSON.parse(jsText); y = JSON.parse(csText); } catch { x = jsText; y = csText; }
    const walk = (u, v, at) => {
      if (u !== null && v !== null && typeof u === 'object' && typeof v === 'object' && Array.isArray(u) === Array.isArray(v)) {
        const keys = Array.isArray(u) ? range(0, Math.max(u.length, v.length)) : [...new Set([...Object.keys(u), ...Object.keys(v)])];
        if (!Array.isArray(u)) {
          const ku = Object.keys(u).join(','), kv = Object.keys(v).join(',');
          if (ku !== kv && ku.split(',').sort().join() === kv.split(',').sort().join()) return { at: at + ' (key order)', js: ku, cs: kv };
        }
        for (const k of keys) {
          const d = walk(u[k], v[k], at + (Array.isArray(u) ? `[${k}]` : '.' + k));
          if (d) return d;
        }
        return null;
      }
      return Object.is(u, v) || JSON.stringify(u) === JSON.stringify(v) ? null : { at, js: JSON.stringify(u), cs: JSON.stringify(v) };
    };
    const d = walk(x, y, '$');
    if (d) return d;
    let i = 0;
    while (i < jsText.length && jsText[i] === csText[i]) i++;
    return { at: `char ${i} (same value, different text)`, js: jsText.slice(Math.max(0, i - 30), i + 40), cs: csText.slice(Math.max(0, i - 30), i + 40) };
  }

  function replay(name, text) {
    const P = new Map();
    const store = new MemoryProfileStore();
    let steps = 0;
    const lines = text.split('\n');
    for (const line of lines) {
      if (line === '') continue;
      const rec = JSON.parse(line);
      const where = `${name} step ${rec.i} ${rec.op}${rec.op === 'Q' ? ' ' + rec.args.name : ''}${rec.pid ? ' [' + rec.pid + ']' : ''}${rec.t !== undefined ? ' t=' + new Date(rec.t * 1000).toISOString() : ''}`;
      const diverge = (part, js, cs) => {
        const d = typeof js === 'string' && typeof cs === 'string' ? firstDiff(js, cs) : { at: '$', js, cs };
        console.log(`FAIL first divergence: ${where}: ${part} at ${d.at}\n     js: ${d.js}\n     cs: ${d.cs}`);
        failed++;
        asserts++;
      };
      const now = rec.t !== undefined ? new Date(rec.t * 1000) : null;
      let rng = null;
      if (rec.rng !== null) {
        if (rec.seed !== undefined) {
          rng = new MetaRng(rec.seed);
          if (rng.state.toString() !== rec.rng) { diverge('rng from seed ' + rec.seed, rng.state.toString(), rec.rng); return steps; }
        } else {
          rng = new MetaRng(0);
          rng.state = BigInt(rec.rng);
        }
      }
      let out;
      try {
        out = writeJson(exec(rec, P, store, now, rng));
      } catch (e) {
        diverge('exception', String(e && e.stack || e), rec.res);
        return steps;
      }
      if (out !== rec.res) { diverge('result', out, rec.res); return steps; }
      if (nonFloat) { diverge('result float not float32', nonFloat + ' non-float32 values', 'float32 values'); return steps; }
      const after = rng === null ? null : rng.state.toString();
      if (after !== rec.rngAfter) { diverge('rng state after', after, rec.rngAfter); return steps; }
      if (rec.profile !== undefined) {
        const pp = P.get(rec.pid);
        if (pp && (Math.fround(pp.skinPity) !== pp.skinPity || Math.fround(pp.difficulty) !== pp.difficulty)) {
          diverge('profile float not float32 (skinPity / difficulty)', String(pp.skinPity) + ' / ' + String(pp.difficulty), 'float32 values');
          return steps;
        }
        const pj = ProfileJson.toJson(pp);
        if (pj !== rec.profile) { diverge('profile', pj, rec.profile); return steps; }
      }
      asserts += 3;
      steps++;
    }
    return steps;
  }

  // ================================================================ dump

  const dumpReady = () => ['script.jsonl', 'career300.jsonl', 'career10100.jsonl.gz', 'floats.json', 'career300-final.json', 'career10100-final.json']
    .every(f => fs.existsSync(path.join(DUMP, f)));
  if (!NO_DUMP && (REGEN || !dumpReady())) {
    console.log(`dump: dotnet run --project ${METATEST} -- dump ${DUMP}`);
    const r = spawnSync('dotnet', ['run', '--project', METATEST, '--', 'dump', DUMP], { encoding: 'utf8', timeout: 600000 });
    process.stdout.write(r.stdout || '');
    if (r.status !== 0) {
      console.log('FAIL dump: dotnet exited ' + r.status + (r.error ? ' (' + r.error.message + ')' : '') + '\n' + (r.stderr || ''));
      process.exit(1);
    }
  }

  const finals = {};
  if (!NO_DUMP) {
    // float formatter vectors
    const vec = JSON.parse(fs.readFileSync(path.join(DUMP, 'floats.json'), 'utf8'));
    const dv = new DataView(new ArrayBuffer(4));
    let floatBad = 0;
    for (const [bits, text] of vec) {
      dv.setInt32(0, bits);
      const s = formatFloat(dv.getFloat32(0));
      if (s !== text) { if (floatBad++ < 5) console.log(`FAIL float bits ${bits}: js ${s}, cs ${text}`); }
    }
    asserts += vec.length;
    failed += floatBad;
    console.log(`[${floatBad ? 'FAIL' : 'ok'}] float "R" format: ${vec.length} vectors, ${floatBad} differ`);

    const streams = [
      ['script', fs.readFileSync(path.join(DUMP, 'script.jsonl'), 'utf8')],
      ['career300', fs.readFileSync(path.join(DUMP, 'career300.jsonl'), 'utf8')],
      ['career10100', zlib.gunzipSync(fs.readFileSync(path.join(DUMP, 'career10100.jsonl.gz'))).toString('utf8')],
    ];
    for (const [name, text] of streams) {
      const total = text.split('\n').filter(l => l !== '').length;
      const f0 = failed;
      const t0 = Date.now();
      const steps = replay(name, text);
      console.log(`[${failed === f0 ? 'ok' : 'FAIL'}] replay ${name}: ${steps}/${total} steps identical (result, events, rng, profile JSON) in ${Date.now() - t0} ms`);
    }
    finals.c300 = fs.readFileSync(path.join(DUMP, 'career300-final.json'), 'utf8');
    finals.c10100 = fs.readFileSync(path.join(DUMP, 'career10100-final.json'), 'utf8');
  }

  // ================================================================ metatest asserts, ported

  function run(name, fn) {
    const a0 = asserts, f0 = failed;
    try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}: ${e && e.stack || e}`); }
    console.log(`[${failed === f0 ? 'ok' : 'FAIL'}] ${name}: ${asserts - a0} asserts`);
  }

  function newPlayer(seed = 1, tutorialDone = true) {
    const p = meta.newProfile(T0, new MetaRng(seed));
    if (tutorialDone) meta.completeTutorial(p, T0);
    return p;
  }

  function request(p, seed, mission = -1) {
    const r = meta.buildMatchRequest(p, T0, new MetaRng(seed), mission);
    check(r.ok, 'BuildMatchRequest ok: ' + r.error);
    return r.request;
  }

  function fakeRequest(team, localSlot = 0) {
    const req = new MatchRequest({ team, goal: GoalType.DeathMatch, localSlot });
    for (let s = 0; s < 4; s++) req.slots[s] = new MatchSlot({ slot: s, team: MetaService.teamForSlot(s, team, false), isBot: s !== localSlot });
    return req;
  }

  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const FFA = TeamConfig.FreeForAll;
  const outcome = o => new MatchOutcome(o);

  run('data', () => {
    eq(db.skins.length, 16, 'skins');
    eq(db.leagues.length, 122, 'league rows');
    eq(db.leagues[121].threshold, 10100, 'last league threshold');
    eq(db.leagues.filter(l => l.isSubLeague).length, 37, 'named sub-leagues');
    eq(db.skinLevels.length, 19, 'level rows');
    eq(sum(db.skinLevels, l => l.token), 4940, 'total tokens 1->20');
    eq(sum(db.skinLevels, l => l.coins), 11025, 'total coins 1->20');
    eq(db.randomModes.length, 7, 'random modes');
    eq(db.missions.length, 15, 'missions');
    eq(db.botNames.length, 1783, 'bot names');
    eq(db.trophiesPerRank.join(','), '5,3,2,1', 'trophiesPerRank');
    eq(db.gameOverBoxPremiumPrice, 15, 'fridge gem price');
    eq(db.leaguePacks.length, 7, 'league packs');
    eq(db.shop.filter(s => s.group === ShopGroup.DailyPaid).length, 13, 'daily paid offers');
    eq(sum(db.leagues, l => (l.reward.type === RewardType.Freemium ? l.reward.count : 0)), 8800, 'road coins');
    eq(sum(db.leagues, l => (l.reward.type === RewardType.Premium ? l.reward.count : 0)), 850, 'road gems');
    eq(sum(db.leagues, l => (l.reward.type === RewardType.Token ? l.reward.count : 0)), 2000, 'road tokens');
  });

  run('stars and trophies', () => {
    const stars = [3, 2, 1, 1], trophies = [5, 3, 2, 1];
    for (let rank = 1; rank <= 4; rank++) {
      eq(MetaService.starForRank(rank), stars[rank - 1], 'stars rank ' + rank);
      const p = newPlayer();
      const r = meta.applyMatchResult(p, fakeRequest(FFA), outcome({ rank }), T0, new MetaRng(rank));
      eq(r.trophiesGained, trophies[rank - 1], 'FFA trophies rank ' + rank);
      eq(p.trophies, trophies[rank - 1], 'FFA trophy balance rank ' + rank);
      eq(r.starsGained, stars[rank - 1], 'FFA stars rank ' + rank);
    }
    eq(MetaService.starForRank(0), 1, 'stars rank 0 (draw)');
    for (const [winner, expect, rank] of [[1, 5, 1], [0, 2, 0], [2, 1, 4]]) {
      const p = newPlayer();
      const r = meta.applyMatchResult(p, fakeRequest(TeamConfig.TwoVersusTwo), outcome({ winnerTeam: winner }), T0, new MetaRng(9));
      eq(r.trophiesGained, expect, 'team trophies winner ' + winner);
      eq(r.rank, rank, 'team rank winner ' + winner);
      check(p.trophies >= 0, 'trophies never negative');
    }
    const q = newPlayer();
    const quit = meta.applyMatchResult(q, fakeRequest(TeamConfig.TwoVersusTwo), outcome({ winnerTeam: 1, quitEarly: true }), T0, new MetaRng(3));
    eq(quit.trophiesGained, 2, 'team quit early = draw trophies');
    eq(quit.victory, 2, 'team quit early victory');
    const d = newPlayer();
    meta.applyMatchResult(d, fakeRequest(FFA), outcome({ rank: 1 }), T0, new MetaRng(1));
    check(Math.abs(d.difficulty - Math.fround(0.2)) < 1e-6, 'difficulty +0.2 after rank 1');
    meta.applyMatchResult(d, fakeRequest(FFA), outcome({ rank: 4 }), T0, new MetaRng(1));
    eq(d.difficulty, 0, 'difficulty clamps at 0');
    const fresh = newPlayer(1, false);
    eq(meta.applyMatchResult(fresh, fakeRequest(FFA), outcome({ rank: 1 }), T0, new MetaRng(1)).trophiesGained, 0, 'gameCount 0 gives no trophies');
    const custom = newPlayer();
    const creq = fakeRequest(FFA); creq.isFriendRoom = true;
    const cr = meta.applyMatchResult(custom, creq, outcome({ rank: 1 }), T0, new MetaRng(1));
    eq(cr.trophiesGained, 0, 'custom room no trophies');
    eq(custom.fridge.stars, 0, 'custom room no stars');
  });

  run('fridge stock', () => {
    const p = newPlayer();
    eq(p.fridge.stock, 6, 'new stock');
    const r = meta.applyMatchResult(p, fakeRequest(FFA), outcome({ rank: 1 }), T0, new MetaRng(1));
    eq(p.fridge.unlocked, 1, '3 stars unlock 1 fridge');
    eq(p.fridge.stock, 5, 'fridge uses one stock');
    eq(p.fridge.stars, 0, 'stars reset after a fridge');
    check(r.hasFridge && r.rewardPanel, 'result screen offers the fridge');
    eq(r.fridgeBox, RewardType.Box1, 'first fridge is Box1');
    const q = newPlayer();
    meta.applyMatchResult(q, fakeRequest(FFA), outcome({ rank: 2 }), T0, new MetaRng(1));
    eq(q.fridge.stars, 2, '2 stars after rank 2');
    const r2 = meta.applyMatchResult(q, fakeRequest(FFA), outcome({ rank: 2 }), T0, new MetaRng(1));
    eq(q.fridge.stars, 0, 'extra star dropped on fridge');
    check(r2.hasFridge, 'fridge on 4th star');
    const s = newPlayer();
    s.vipUntil = MetaTime.seconds(T0) + 600;
    for (let i = 0; i < 8; i++) {
      meta.applyMatchResult(s, fakeRequest(FFA), outcome({ rank: 1 }), addMin(T0, i), new MetaRng(i));
      if (s.fridge.pendingBox !== 0) check(meta.openFridge(s, FridgeOpenMethod.Free, addMin(T0, i), new MetaRng(i)).ok, 'drain open ' + i);
    }
    eq(s.fridge.stock, 0, 'stock drained');
    const empty = meta.applyMatchResult(s, fakeRequest(FFA), outcome({ rank: 1 }), addMin(T0, 9), new MetaRng(9));
    eq(s.fridge.stars, 0, 'no stars with stock 0');
    check(!empty.hasFridge, 'no fridge with stock 0');
    const hourStart = new Date(Date.UTC(2026, 9, 26, 9, 0, 0));
    meta.tick(s, addMin(hourStart, 59), new MetaRng(1));
    eq(s.fridge.stock, 0, 'no refill before the hour');
    check(meta.fridgeRefillSecondsLeft(s, addMin(hourStart, 59)) === 60, 'refill timer 60 s');
    meta.tick(s, addH(hourStart, 1), new MetaRng(1));
    eq(s.fridge.stock, 1, '+1 at next hour');
    meta.tick(s, addMin(addH(hourStart, 3), 30), new MetaRng(1));
    eq(s.fridge.stock, 3, '+2 after two more hours');
    meta.tick(s, addH(hourStart, 20), new MetaRng(1));
    eq(s.fridge.stock, 6, 'stock caps at 6');
  });

  run('fridge opening', () => {
    const p = newPlayer();
    let t = T0;
    for (let i = 0; i < 5; i++) {
      t = addH(t, 2);
      const r = meta.applyMatchResult(p, fakeRequest(FFA), outcome({ rank: 1 }), t, new MetaRng(i));
      check(r.hasFridge, 'fridge ' + i);
      if (i < 3) {
        check(r.canOpenFree && !r.canOpenAdOrGems, 'open ' + i + ' is free');
        const o = meta.openFridge(p, FridgeOpenMethod.Free, t, new MetaRng(i));
        check(o.ok, 'free open ' + i);
        check(o.find(BoxOpened) !== null, 'box opened ' + i);
      } else if (i === 3) {
        check(!r.canOpenFree && r.canOpenAdOrGems, '4th open needs ad or gems');
        check(!meta.openFridge(p, FridgeOpenMethod.Free, t, new MetaRng(1)).ok, '4th free open refused');
        eq(meta.openFridge(p, FridgeOpenMethod.Gems, t, new MetaRng(1)).error, MetaErrors.NotEnoughGems, 'gems open without gems');
        p.gems = 20;
        check(meta.openFridge(p, FridgeOpenMethod.Gems, t, new MetaRng(1)).ok, 'gems open');
        eq(p.gems, 5, 'gems open costs 15');
      } else {
        const ad = meta.claimAdReward(p, AdPlacement.FridgeOpen, t, new MetaRng(1));
        check(ad.ok && ad.find(BoxOpened) !== null, 'ad open grants the fridge at once');
      }
    }
    eq(p.fridge.openCount, 5, 'lifetime open counter');
    eq(p.stats.boxesOpened, 5, 'boxes opened stat');
    check(!meta.openFridge(p, FridgeOpenMethod.Ad, t, new MetaRng(1)).ok, 'nothing left to open');
    const v = newPlayer();
    v.fridge.openCount = 10;
    v.vipUntil = MetaTime.seconds(T0) + 3600;
    const vr = meta.applyMatchResult(v, fakeRequest(FFA), outcome({ rank: 1 }), T0, new MetaRng(1));
    check(vr.canOpenFree && !vr.canOpenAdOrGems, 'VIP opens free');
    check(meta.openFridge(v, FridgeOpenMethod.Free, T0, new MetaRng(1)).ok, 'VIP free open');
    const b = newPlayer();
    const kinds = [];
    let bt = T0;
    for (let i = 0; i < 400; i++) {
      bt = addH(bt, 1);
      kinds.push(meta.applyMatchResult(b, fakeRequest(FFA), outcome({ rank: 1 }), bt, new MetaRng(i)).fridgeBox);
    }
    eq(kinds.indexOf(RewardType.Box2), 5, 'first Box2 is the 6th fridge');
    const box2Plus = kinds.filter(k => k !== RewardType.Box1).length, box3 = kinds.filter(k => k === RewardType.Box3).length;
    check(box2Plus >= 400 / 8 && box2Plus <= Math.trunc(400 / 6) + 1, `Box2+ about 1 in 7 (${box2Plus}/400)`);
    check(box3 >= 1 && box3 <= Math.trunc(box2Plus / 6) + 1, `Box3 about 1 in 7 of those (${box3})`);
  });

  run('box contents', () => {
    for (const [box, slots, kMax] of [[RewardType.Box1, 1, 2], [RewardType.Box2, 3, 3], [RewardType.Box3, 10, 5]]) {
      let skins = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const p = newPlayer(i);
        for (const id of [14, 9, 13, 2, 3]) if (!Profile.hasSkin(p, id)) p.skins.push(newSkinProgress(id));
        p.skinPity = 0;
        const res = meta.grantReward(p, reward(box), 'test', T0, new MetaRng(1000 + i));
        const c = res.find(BoxOpened).contents;
        if (c.some(x => x.type === RewardType.Skin)) { skins++; eq(p.skinPity, 0, 'pity resets on skin'); continue; }
        check(Math.abs(p.skinPity - 0.05 * slots) < 1e-4, `${RewardType.name(box)} pity +0.05 per miss`);
        const coins = sum(c.filter(x => x.type === RewardType.Freemium), x => x.count);
        const tokens = sum(c.filter(x => x.type === RewardType.Token), x => x.count);
        const value = coins + 2 * tokens;
        check(value >= 90 * slots - 1 && value <= 119 * slots, `${RewardType.name(box)} value ${value} in ${90 * slots - 1}..${119 * slots}`);
        check(coins >= Math.trunc(Math.fround(Math.fround(0.35) * 90 * slots)), `${RewardType.name(box)} coin share ${coins}`);
        check(c.filter(x => x.type === RewardType.Token).length <= kMax, `${RewardType.name(box)} token targets <= ${kMax}`);
        check(c[0].type === RewardType.Freemium, `${RewardType.name(box)} coins first`);
      }
      let miss = 1;
      for (let k = 0; k < slots; k++) miss *= 1 - (0.5 + 0.05 * k) / 100;
      const rate = skins / n, expect = 1 - miss;
      check(Math.abs(rate - expect) < 0.012, `${RewardType.name(box)} new skin rate ${(rate * 100).toFixed(2)}% ~ ${(expect * 100).toFixed(2)}%`);
    }
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const p = newPlayer(i);
      if (meta.grantReward(p, reward(RewardType.Box1), 'test', T0, new MetaRng(7000 + i)).find(SkinUnlocked) !== null) hits++;
    }
    check(Math.abs(hits / 4000 - 0.105) < 0.02, `first fridge skin rate ${(hits / 40).toFixed(1)}% ~ 10.5%`);
    const maxed = newPlayer();
    maxed.skins[0].level = 20;
    const tok = meta.grantReward(maxed, reward(RewardType.Token, 50), 'test', T0, new MetaRng(1));
    eq(maxed.coins, 100, '50 tokens with no target = 100 coins');
    check(tok.rewards[0].type === RewardType.Freemium, 'token reward routed to coins');
    const two = newPlayer();
    two.skins.push(newSkinProgress(14, 15));
    meta.grantReward(two, reward(RewardType.Token, 50), 'test', T0, new MetaRng(1));
    eq(Profile.skin(two, 1).tokens, 50, 'tokens to the lowest skin');
  });

  run('skin levels', () => {
    const p = newPlayer();
    p.coins = 11025;
    Profile.skin(p, 1).tokens = 4940;
    const powers = [];
    for (let i = 0; i < 19; i++) {
      const r = meta.upgradeSkin(p, 1, T0, new MetaRng(i));
      check(r.ok, 'upgrade ' + (i + 1));
      for (const _ of r.all(PowerUnlocked)) powers.push(Profile.skin(p, 1).level);
    }
    eq(Profile.skin(p, 1).level, 20, 'level cap 20');
    eq(p.coins, 0, '11025 coins spent');
    eq(Profile.skin(p, 1).tokens, 0, '4940 tokens spent');
    eq(powers.join(','), '5,10,15,20', 'power unlock levels');
    eq(meta.upgradeSkin(p, 1, T0, new MetaRng(1)).error, MetaErrors.SkinMaxLevel, 'no level 21');
    eq(meta.powersUnlocked(14).join(','), '1,2', 'powers at level 14');
    check(p.achievements.includes('FIRST_POWER') && p.achievements.includes('HERO_MAXED'), 'power achievements');
    eq(p.difficulty, 0, 'upgrade lowers difficulty (clamped)');
    const q = newPlayer();
    Profile.skin(q, 1).tokens = 10;
    eq(meta.upgradeSkin(q, 1, T0, new MetaRng(1)).error, MetaErrors.NotEnoughCoins, 'coins checked first');
    q.coins = 10; Profile.skin(q, 1).tokens = 9;
    eq(meta.upgradeSkin(q, 1, T0, new MetaRng(1)).error, MetaErrors.NotEnoughTokens, 'then tokens');
    eq(meta.upgradeSkin(q, 5, T0, new MetaRng(1)).error, MetaErrors.SkinNotOwned, 'unowned skin');
    check(Math.abs(MetaService.levelCoef(20) - Math.fround(1.95)) < 1e-6, 'level coef 20 = 1.95');
  });

  run('league', () => {
    eq(db.leagueAt(23).id, 4, '23 trophies -> row 4');
    eq(db.subLeagueAt(65).id, 7, '65 trophies -> sub-league row 7');
    eq(db.leagueAt(65).id, 8, '65 trophies -> row 8');
    eq(db.stepNext(65).id, 9, '65 trophies -> next step row 9');
    check(db.stepNext(10100) === null, 'no step after the end');
    eq(db.leaguePackAt(99)?.id ?? null, null, 'no league pack below 100');
    eq(db.leaguePackAt(2500).id, 'leagueoffer4', 'league pack at 2500');
    const p = newPlayer();
    p.trophies = 20;
    const skin = meta.claimRoadStep(p, 4, T0, new MetaRng(1));
    check(skin.ok && Profile.hasSkin(p, 14), 'row 4 gives TOM');
    eq(meta.claimRoadStep(p, 4, T0, new MetaRng(1)).error, MetaErrors.AlreadyClaimed, 'claimed once');
    eq(meta.claimRoadStep(p, 5, T0, new MetaRng(1)).error, MetaErrors.NotAvailable, 'row 5 locked at 20');
    check(meta.claimRoadStep(p, 2, T0, new MetaRng(1)).ok, 'older rows stay claimable');
    eq(meta.roadStep(p, db.leagues[0]), RoadStepState.Empty, 'row 1 has no reward');
    const q = newPlayer();
    q.trophies = 98;
    const r = meta.applyMatchResult(q, fakeRequest(FFA), outcome({ rank: 2 }), T0, new MetaRng(1));
    eq(q.trophies, 101, '98 + 3');
    check(r.find(LeagueUp)?.row.id === 11, 'league up to row 11 (I @100)');
    eq(r.find(LeagueOfferUnlocked)?.pack.id, 'leagueoffer1', 'league pack popup at 100');
    const offer = meta.activeLeaguePack(q, T0);
    check(offer !== null && offer.secondsLeft === 86400, 'league pack window 24 h');
    check(meta.activeLeaguePack(q, addH(T0, 25)) === null, 'window closed after 24 h (weekday)');
    const buy = meta.claimIap(q, 'leagueoffer1', T0, new MetaRng(1));
    check(buy.ok && q.leaguePacksBought.includes('leagueoffer1') && q.gems === 200, 'league pack 1 = Box3 + 200 gems');
    check(!meta.claimIap(q, 'leagueoffer1', T0, new MetaRng(1)).ok, 'league pack bought once');
    const sat = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
    const s = newPlayer();
    s.trophies = 600; s.lastLeagueChange = MetaTime.seconds(T0);
    const special = meta.activeLeaguePack(s, sat);
    check(special !== null && special.saturdaySpecial, 'Saturday league special');
    check(meta.activeLeaguePack(s, addD(sat, 1)) === null, 'no special on Sunday');
  });

  run('missions', () => {
    const p = newPlayer();
    p.trophies = 50;
    const r = meta.claimRoadStep(p, 7, T0, new MetaRng(1));
    check(r.find(MissionsUnlocked) !== null && p.missions.unlocked, 'row 7 (50 trophies) unlocks missions');
    eq(p.missions.slots.length, 7, '7 missions per week');
    eq(p.missions.slots[3].reward.type, RewardType.Box2, 'mission 4 gives Box2');
    eq(p.missions.slots[6].reward.type, RewardType.Box3, 'mission 7 gives Box3');
    for (let i = 1; i < 7; i++) {
      const a = db.findMission(p.missions.slots[i - 1].missionId).mode;
      const b = db.findMission(p.missions.slots[i].missionId).mode;
      check(a.goal !== b.goal || a.team !== b.team, 'neighbour missions differ in mode ' + i);
    }
    const other = newPlayer(99);
    other.trophies = 50;
    meta.claimRoadStep(other, 7, addD(T0, 2), new MetaRng(5));
    eq(other.missions.slots.map(s => s.missionId).join(','), p.missions.slots.map(s => s.missionId).join(','), 'same week, same missions');
    check(meta.isMissionUnlocked(p.missions.slots[0], T0) && !meta.isMissionUnlocked(p.missions.slots[1], T0), 'one mission open on Monday');
    eq(meta.buildMatchRequest(p, T0, new MetaRng(1), 1).error, MetaErrors.MissionLocked, 'mission 2 locked on Monday');
    const req = meta.buildMatchRequest(p, T0, new MetaRng(1), 0).request;
    const def = db.findMission(p.missions.slots[0].missionId);
    eq(req.team, def.mode.team, 'mission team');
    eq(req.goal, def.mode.goal, 'mission goal');
    const winTeam = req.player.team;
    const lose = meta.applyMatchResult(p, req, outcome({ rank: 2, winnerTeam: winTeam === 1 ? 2 : 1 }), T0, new MetaRng(1));
    check(!lose.missionCompleted && lose.trophiesGained === 0 && p.fridge.stars === 0, 'lost mission: no progress, trophies, stars');
    const win = meta.applyMatchResult(p, req, outcome({ rank: 1, winnerTeam: winTeam }), T0, new MetaRng(1));
    check(win.missionCompleted && !win.rewardPanel, 'won mission completes, no fridge panel');
    const claim = meta.claimMission(p, 0, T0, new MetaRng(1));
    check(claim.ok && claim.rewards.length > 0, 'mission reward claimed');
    eq(meta.claimMission(p, 0, T0, new MetaRng(1)).error, MetaErrors.AlreadyClaimed, 'mission reward once');
    meta.tick(p, addD(T0, 7), new MetaRng(1));
    check(p.missions.slots.every(s => !s.completed) && p.missions.week === MetaTime.currentWeek(MetaTime.seconds(addD(T0, 7))), 'weekly reset');
    eq(p.missions.missionSkin, meta.weeklySkinId(addD(T0, 7), 0), 'mission skin = skin of the week');
  });

  run('matchmaking', () => {
    const p = newPlayer();
    const first = request(p, 1);
    eq(first.goal, GoalType.DeathMatch, 'first real match DeathMatch');
    eq(first.team, TeamConfig.TwoVersusTwo, 'first real match 2v2');
    eq(first.mapIndex, 0, 'first real match Kitchen');
    eq(first.slots.filter(s => s.isBot).length, 3, '3 bots');
    eq(first.slots.filter(s => s.isBot && s.isAlly).length, 1, 'one bot ally in 2v2');
    check(first.slots.filter(s => s.isBot).every(s => s.skinId !== p.skinSelected && s.skinId >= 1 && s.skinId <= 16), "bot skins 1..16, not the player's");
    eq(new Set(first.slots.filter(s => s.isBot).map(s => s.botNameIndex)).size, 3, 'bot names unique');
    meta.applyMatchResult(p, first, outcome({ winnerTeam: first.player.team }), T0, new MetaRng(1));
    eq(p.gameCount, 2, 'game count after the first real match');
    const orders = [];
    for (const seed of [11, 12]) {
      const q = newPlayer(seed);
      q.gameCount = 5;
      const drawn = [];
      for (let i = 0; i < 14; i++) drawn.push(request(q, seed * 100 + i).modeIndex);
      for (let m = 0; m < 7; m++) eq(drawn.filter(x => x === m).length, 2, `mode ${m} twice per deck (seed ${seed})`);
      eq(q.modeDeck.length, 0, 'deck empty after 14 draws');
      request(q, 999);
      eq(q.modeDeck.length, 13, 'deck refilled and shuffled');
      orders.push(drawn.join(','));
    }
    check(orders[0] !== orders[1] && orders[0] !== '0,0,1,1,2,2,3,3,4,4,5,5,6,6', 'deck order is shuffled');
    const maps = [0, 0, 0];
    const mp = newPlayer(); mp.gameCount = 5;
    for (let i = 0; i < 300; i++) maps[request(mp, i).mapIndex]++;
    check(maps.every(x => x > 60), 'all three maps drawn');
    for (let seed = -50; seed < 50; seed++) eq([...MetaService.slotRemap(seed)].sort().join(','), '0,1,2,3', 'slot remap permutation ' + seed);
    eq(MetaService.teamForSlot(1, TeamConfig.TwoVersusTwo, false), 1, '2v2 slot 1 team 1');
    eq(MetaService.teamForSlot(2, TeamConfig.TwoVersusTwo, false), 2, '2v2 slot 2 team 2');
    eq(MetaService.teamForSlot(0, TeamConfig.OneVersusThree, true), 1, '1v3 boss left');
    eq(MetaService.teamForSlot(3, TeamConfig.OneVersusThree, false), 2, '1v3 boss right');
    eq(MetaService.teamForSlot(3, FFA, false), 4, 'FFA slot+1');
    const cr = meta.buildMatchRequest(mp, T0, new MetaRng(3), -1, new CustomMatchOptions({ modeIndex: 6, mapIndex: 2, difficultyInt: 100 })).request;
    check(cr.isFriendRoom && cr.goal === GoalType.KillBoss && cr.team === TeamConfig.OneVersusThree && cr.mapIndex === 2 && cr.botDifficultyInt === 100, 'custom room options');
    const tuto = meta.buildTutorialRequest(newPlayer(1, false));
    check(tuto.isTutorial && tuto.mapIndex === 0 && tuto.team === FFA, 'tutorial request');
  });

  run('bot levels', () => {
    for (const [d, eMin, eMax, aMin, aMax] of [[0, 5, 9, 11, 15], [0.5, 8, 12, 8, 12], [1, 11, 15, 5, 9]]) {
      const p = newPlayer();
      p.gameCount = 5;
      Profile.skin(p, 1).level = 10;
      p.difficulty = d;
      const enemy = [], ally = [];
      for (let i = 0; i < 400; i++) {
        const req = request(p, i);
        eq(req.hostLevel, 10, 'host level');
        eq(req.botDifficultyInt, Math.round(d * 100), 'bot difficulty int');
        for (const s of req.slots.filter(x => x.isBot)) {
          (s.isAlly ? ally : enemy).push(s.level);
          check(s.botAggro >= 0 && s.botAggro <= 100, 'aggro 0..100');
        }
      }
      check(Math.min(...enemy) === eMin && Math.max(...enemy) === eMax, `d=${d} enemy levels ${Math.min(...enemy)}..${Math.max(...enemy)} expect ${eMin}..${eMax}`);
      check(ally.length > 0 && Math.min(...ally) === aMin && Math.max(...ally) === aMax, `d=${d} ally levels ${Math.min(...ally)}..${Math.max(...ally)} expect ${aMin}..${aMax}`);
    }
    const low = newPlayer(); low.gameCount = 5; low.difficulty = 0;
    check(range(0, 200).flatMap(i => request(low, i).slots.filter(s => s.isBot)).every(s => s.level >= 1), 'bot level clamps at 1');
    const top = newPlayer(); top.gameCount = 5; top.difficulty = 1; Profile.skin(top, 1).level = 20;
    check(range(0, 200).flatMap(i => request(top, i).slots.filter(s => s.isBot)).every(s => s.level <= 20), 'bot level clamps at 20');
  });

  run('daily offers', () => {
    const p = newPlayer();
    const late = new Date(Date.UTC(2026, 9, 27, 23, 59, 59)); // Tuesday
    meta.tick(p, late, new MetaRng(1));
    eq(p.daily.gifts.length, 4, '4 gift cells');
    const tue = db.dailyGifts[0][1];
    check(p.daily.gifts[0].type === tue.type && p.daily.gifts[0].count === tue.count, 'Tuesday free gift from the weekday pool');
    check(meta.claimDailyGift(p, DailyGiftSlot.Free, late, new MetaRng(1)).ok, 'free gift');
    eq(meta.claimDailyGift(p, DailyGiftSlot.Free, late, new MetaRng(1)).error, MetaErrors.AlreadyClaimed, 'free gift once a day');
    check(meta.claimAdReward(p, AdPlacement.DailyGiftAd, late, new MetaRng(1)).ok, 'ad gift: click = ad');
    eq(meta.dailyResetIn(late), 1, 'reset in 1 s');
    const midnight = addS(late, 1);
    const tick = meta.tick(p, midnight, new MetaRng(1));
    check(tick.find(DailyOffersRefreshed) !== null, 'reset at 00:00 UTC');
    eq(p.daily.claimed.length, 0, 'claims cleared at 00:00 UTC');
    const wed = db.dailyGifts[0][2];
    check(p.daily.gifts[0].type === wed.type && p.daily.gifts[0].count === wed.count, 'Wednesday free gift');
    check(meta.claimDailyGift(p, DailyGiftSlot.Free, midnight, new MetaRng(1)).ok, 'free gift next day');
    eq(p.stats.dailyOffersClaimed, 3, 'daily offer counter');
    check(meta.claimAdReward(p, AdPlacement.DailyGiftVip1, midnight, new MetaRng(1)).rewards.length === 0, 'VIP1 after 1 ad: nothing yet');
    check(meta.claimAdReward(p, AdPlacement.DailyGiftVip1, midnight, new MetaRng(1)).rewards.length > 0, 'VIP1 after 2 ads');
    meta.claimAdReward(p, AdPlacement.DailyGiftVip2, midnight, new MetaRng(1));
    check(meta.claimAdReward(p, AdPlacement.DailyGiftVip2, midnight, new MetaRng(1)).rewards.length === 0, 'VIP2 after 2 ads: nothing yet');
    check(meta.claimAdReward(p, AdPlacement.DailyGiftVip2, midnight, new MetaRng(1)).rewards.length > 0, 'VIP2 after 3 ads');
    const a = newPlayer(5), b = newPlayer(6);
    meta.tick(a, midnight, new MetaRng(1)); meta.tick(b, midnight, new MetaRng(2));
    eq(a.daily.specialOffer?.skinId, b.daily.specialOffer?.skinId, 'special offer seeded by day');
    check(a.daily.specialOffer.skinId !== meta.weeklySkinId(midnight, 0) && a.daily.specialOffer.skinId !== meta.weeklySkinId(midnight, 1), 'special offer avoids weekly skins');
    const rarity = db.findSkin(a.daily.specialOffer.skinId).rarity;
    check(rarity === Rarity.Rare || rarity === Rarity.Epic, 'special offer is Rare/Epic');
    const cycleStartDay = (Math.trunc(Math.trunc(MetaTime.seconds(T0) / 86400) / 13) + 1) * 13;
    const seen = new Set();
    for (let i = 0; i < 13; i++) {
      const o = meta.dailyPaidOffer(MetaTime.fromSeconds((cycleStartDay + i) * 86400 + 3600));
      seen.add(o.group + ':' + o.id + ':' + o.price);
    }
    eq(seen.size, 13, '13 different paid offers per cycle');
    const buyer = newPlayer(); buyer.gems = 1000;
    const day = MetaTime.fromSeconds(cycleStartDay * 86400 + 3600);
    check(meta.buyDailyPaidOffer(buyer, day, new MetaRng(1)).ok, "buy today's paid offer");
    eq(meta.buyDailyPaidOffer(buyer, day, new MetaRng(1)).error, MetaErrors.AlreadyClaimed, 'paid offer once a day');
    check(meta.buyDailyPaidOffer(buyer, addD(day, 1), new MetaRng(1)).ok || buyer.gems < 700, 'paid offer next day');
    const maxed = newPlayer();
    maxed.skins[0].level = 20;
    meta.tick(maxed, late, new MetaRng(1));
    eq(maxed.daily.gifts[0].type, RewardType.Freemium, 'token gift becomes coins when no skin needs tokens');
  });

  run('shop and vip', () => {
    const p = newPlayer();
    const box2 = db.findShopItem(ShopGroup.Box, 'box2');
    const box3 = db.findShopItem(ShopGroup.Box, 'box3');
    eq(meta.price(box2, false), 80, 'Box2 80 gems');
    eq(meta.price(box3, false), 250, 'Box3 250 gems');
    eq(meta.price(box2, true), 65, 'VIP Box2 65');
    eq(meta.price(box3, true), 200, 'VIP Box3 200');
    eq(meta.price(PriceType.Premium, 15, reward(RewardType.Box1), true), 10, 'VIP Box1 offer 10');
    eq(meta.price(PriceType.Premium, 40, reward(RewardType.Box2), true), 30, 'VIP Box2 offer 30');
    eq(meta.price(PriceType.Premium, 125, reward(RewardType.Box3), true), 100, 'VIP Box3 offer 100');
    eq(meta.price(db.findShopItem(ShopGroup.Freemium, 'goldpack1'), true), 50, 'VIP no discount on coins');
    eq(meta.buyShopItem(p, 'box2', T0, new MetaRng(1)).error, MetaErrors.NotEnoughGems, 'box2 without gems');
    const gems = meta.claimIap(p, 'pack1', T0, new MetaRng(1));
    check(gems.ok && p.gems === 75 && p.hasMadePurchase, 'pack1 = 75 gems, counts as purchase');
    check(meta.adsDisabled(p, T0), 'any purchase disables forced ads');
    p.gems = 1000;
    check(meta.buyShopItem(p, 'goldpack2', T0, new MetaRng(1)).ok && p.coins === 800 && p.gems === 875, 'goldpack2: 125 gems -> 800 coins');
    check(meta.buyShopItem(p, 'box3', T0, new MetaRng(1)).ok && p.gems === 625, 'box3 for 250 gems');
    eq(meta.claimIap(p, 'nope', T0, new MetaRng(1)).error, MetaErrors.UnknownItem, 'unknown product');
    eq(meta.iapProducts.length, 21, '21 IAP products');
    const v = newPlayer();
    check(!Profile.isVip(v, T0), 'not VIP by default');
    const pass = meta.claimIap(v, 'pass', T0, new MetaRng(1));
    check(pass.ok && Profile.isVip(v, T0) && Profile.hasSkin(v, 4), 'weekly pass: VIP + KING');
    check(!Profile.isVip(v, addD(T0, 7)), 'weekly pass lasts 7 days');
    meta.claimIap(v, 'passmonthly', T0, new MetaRng(1));
    check(Profile.isVip(v, addD(T0, 36)) && !Profile.isVip(v, addD(T0, 37)), 'monthly pass stacks +30 days');
    meta.tick(v, T0, new MetaRng(1));
    check(meta.dailyGifts(v, T0).every(x => x.priceType === PriceType.Free), 'VIP: all daily gifts free');
    check(meta.claimDailyGift(v, DailyGiftSlot.Vip2, T0, new MetaRng(1)).rewards.length > 0, 'VIP gift claimed without ads');
    v.gems = 80;
    check(meta.buyShopItem(v, 'box2', T0, new MetaRng(1)).ok && v.gems === 15, 'VIP pays 65 for Box2');
    const promo = newPlayer();
    promo.missions.missionSkin = 6;
    promo.gems = 600;
    check(meta.buyPromoSkin(promo, T0, new MetaRng(1)).ok && Profile.hasSkin(promo, 6) && promo.gems === 0, 'Epic promo skin 600');
    promo.missions.missionSkin = 9;
    eq(meta.buyPromoSkin(promo, T0, new MetaRng(1)).error, MetaErrors.NotForSale, 'Common skins not sold');
    promo.missions.missionSkin = 4; promo.gems = 300;
    eq(meta.buyPromoSkin(promo, T0, new MetaRng(1)).error, MetaErrors.NotAvailable, 'KING promo needs VIP');
    eq(meta.promoSkinPrice(2), 300, 'Rare promo 300');
  });

  run('names', () => {
    const p = newPlayer(42);
    const n = Number(p.name.substring(7));
    check(p.name.startsWith('Player_') && n >= 123 && n < 32464, 'default name Player_123..32463');
    check(!meta.isNameAllowed('FuCk3r'), 'banned word');
    check(!meta.isNameAllowed('h1tl3r'), 'leet banned word');
    check(meta.isNameAllowed('Therapist'), 'allowed word');
    check(meta.isNameAllowed('Tam'), 'plain name');
    check(!meta.isNameAllowed(''), 'empty name');
    check(meta.setName(p, '  ChefSuperLongName123  ').ok && p.name === 'ChefSuperLongNa', 'trimmed and cut to 15');
    eq(meta.setName(p, 'nazi').error, MetaErrors.NameNotAllowed, 'rejected name');
    eq(MetaService.normalizeName('Zzzéé!!'), 'zei', 'normalize folds and merges repeats');
  });

  run('save', () => {
    const p = newPlayer(3);
    meta.tick(p, T0, new MetaRng(1));
    p.trophies = 50;
    meta.claimRoadStep(p, 7, T0, new MetaRng(1));
    p.difficulty = Math.fround(0.3); p.skinPity = Math.fround(10.35); p.daily.specialOffer = reward(RewardType.Skin, 1, 6, 0, 5);
    p.settings.language = 'Vi "quoted"\n';
    const json = ProfileJson.toJson(p);
    const back = ProfileJson.fromJson(json);
    eq(ProfileJson.toJson(back), json, 'profile JSON round-trip identical');
    eq(back.difficulty, Math.fround(0.3), 'float round-trip');
    const store = new MemoryProfileStore();
    ProfileJson.save(store, p);
    eq(ProfileJson.load(store).saveCounter, 1, 'store save bumps the counter');
    const old = ProfileJson.fromJson('{"version":0,"coins":12,"leaguePacksBought":["leagueoffer1"]}');
    check(old.coins === 12 && old.fridge.stock === 6 && old.skins.length === 1 && old.hasMadePurchase && old.version === Profile.CurrentVersion, 'old save migrates with defaults');
    let threw = false;
    try { ProfileJson.fromJson('{"version":999}'); } catch (e) { threw = e instanceof FormatError; }
    check(threw, 'newer save version refused');
    // browser store: key food-gang-profile, swappable object with load/save/delete
    const mem = new Map();
    const fake = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
    const ls = new LocalStorageProfileStore(undefined, fake);
    eq(ProfileJson.load(ls), null, 'empty localStorage = no save');
    ProfileJson.save(ls, p);
    check(mem.has('food-gang-profile') && ProfileJson.toJson(ProfileJson.load(ls)) === ProfileJson.toJson(p), 'localStorage store round-trip under food-gang-profile');
    ls.delete();
    eq(ProfileJson.load(ls), null, 'localStorage delete');
  });

  // ---------------------------------------------------------------- careers (PlayCareer port)

  function playCareer(seed, matches, untilRoadEnd) {
    const rng = new MetaRng(seed);
    const c = { p: meta.newProfile(T0, rng), matches: 0, fridges: 0, missions: 0, roadClaims: 0, upgrades: 0, adClicks: 0, rowsSeen: new Set() };
    const p = c.p;
    let t = T0;
    meta.completeTutorial(p, t);
    let lastTrophies = 0;
    c.rowsSeen.add(db.leagueAt(0).id);
    while (untilRoadEnd ? p.trophies < 10100 : c.matches < matches) {
      t = addMin(t, 17 + rng.range(0, 30));
      meta.tick(p, t, rng);
      let mission = -1;
      for (let i = 0; i < p.missions.slots.length; i++) {
        if (!p.missions.slots[i].completed && meta.isMissionUnlocked(p.missions.slots[i], t) && rng.range(0, 4) === 0) { mission = i; break; }
      }
      const rr = meta.buildMatchRequest(p, t, rng, mission);
      check(rr.ok, 'career request: ' + rr.error);
      const o = new MatchOutcome({
        rank: rng.range(1, 5), winnerTeam: rng.range(0, 3), kills: rng.range(0, 12), deaths: rng.range(0, 6),
        jumps: rng.range(0, 60), specialKill: rng.range(0, 20) === 0, quitEarly: rng.range(0, 30) === 0,
      });
      const res = meta.applyMatchResult(p, rr.request, o, t, rng);
      c.matches++;
      if (res.missionCompleted) c.missions++;
      check(p.trophies >= lastTrophies, 'trophies monotonic');
      lastTrophies = p.trophies;
      c.rowsSeen.add(db.leagueAt(p.trophies).id);
      if (res.hasFridge) {
        const method = res.canOpenFree ? FridgeOpenMethod.Free : p.gems >= 15 && rng.range(0, 2) === 0 ? FridgeOpenMethod.Gems : FridgeOpenMethod.Ad;
        if (method === FridgeOpenMethod.Ad) c.adClicks++;
        check(meta.openFridge(p, method, t, rng).ok, 'career fridge open');
        c.fridges++;
      }
      for (const row of db.leagues) if (meta.isRoadStepAvailable(p, row)) { check(meta.claimRoadStep(p, row.id, t, rng).ok, 'career road claim'); c.roadClaims++; }
      for (let i = 0; i < p.missions.slots.length; i++) if (missionRewardAvailable(p.missions.slots[i])) check(meta.claimMission(p, i, t, rng).ok, 'career mission claim');
      for (const gift of meta.dailyGifts(p, t)) if (!gift.claimed) meta.claimDailyGift(p, gift.slot, t, rng);
      for (const s of p.skins.slice()) while (meta.canUpgrade(p, s) && meta.upgradeSkin(p, s.id, t, rng).ok) c.upgrades++;
      if (p.gems >= 250 && rng.range(0, 10) === 0) check(meta.buyShopItem(p, 'box3', t, rng).ok, 'career box3');
      check(p.coins >= 0 && p.gems >= 0, 'no negative currency');
      check(p.skins.every(s => s.tokens >= 0 && s.level >= 1 && s.level <= 20), 'skin tokens/levels valid');
      check(p.fridge.stock >= 0 && p.fridge.stock <= 6 && p.fridge.stars >= 0 && p.fridge.stars < 3, 'fridge state valid');
      check(p.difficulty >= 0 && p.difficulty <= 1, 'difficulty 0..1');
      if (c.matches % 25 === 0) {
        const json = ProfileJson.toJson(p);
        check(ProfileJson.toJson(ProfileJson.fromJson(json)) === json, 'career round-trip at match ' + c.matches);
      }
    }
    c.finalJson = ProfileJson.toJson(p);
    return c;
  }

  run('career', () => {
    const a = playCareer(2026, 300, false);
    const b = playCareer(2026, 300, false);
    eq(a.finalJson, b.finalJson, 'career deterministic for a seed');
    eq(ProfileJson.toJson(ProfileJson.fromJson(a.finalJson)), a.finalJson, 'career final round-trip');
    if (finals.c300 !== undefined) {
      const same = a.finalJson === finals.c300;
      check(same, 'JS career 300 final profile = C# career 300 final profile' + (same ? '' : ' at ' + JSON.stringify(firstDiff(a.finalJson, finals.c300))));
    }
    const p = a.p;
    check(p.missions.unlocked, 'missions unlocked during the career');
    check(a.fridges > 0 && a.roadClaims > 0, 'fridges and road rewards collected');
    const sub = db.subLeagueAt(p.trophies);
    console.log(`  career 300: trophies ${p.trophies} (league ${sub.name} @${sub.threshold}), coins ${p.coins} (earned ${p.stats.goldCollected}), gems ${p.gems}, ` +
      `skins ${p.skins.length}, max level ${Profile.maxSkinLevel(p)}, fridges ${a.fridges} (ads ${a.adClicks}), boxes ${p.stats.boxesOpened}, ` +
      `road ${a.roadClaims}, missions ${p.stats.missionsCompleted}, upgrades ${a.upgrades}, wins ${p.stats.wins}/${p.stats.battles}, ` +
      `achievements ${p.achievements.length}, difficulty ${p.difficulty.toFixed(2)}`);
    const g = playCareer(7, 0, true);
    if (finals.c10100 !== undefined) {
      const same = g.finalJson === finals.c10100;
      check(same, 'JS career 10100 final profile = C# career 10100 final profile' + (same ? '' : ' at ' + JSON.stringify(firstDiff(g.finalJson, finals.c10100))));
    }
    eq(g.rowsSeen.size, 122, 'every trophy-road row reached');
    check(db.leagues.filter(l => l.isSubLeague).every(l => g.rowsSeen.has(l.id)), 'every league reached');
    eq(db.leagues.filter(l => l.hasReward && !g.p.roadClaimed.includes(l.id)).length, 0, 'every road reward claimed');
    check(Profile.hasSkin(g.p, 14) && Profile.hasSkin(g.p, 9) && Profile.hasSkin(g.p, 13), 'road skins TOM, BILLY, HORN');
    console.log(`  road to 10100: ${g.matches} matches, skins ${g.p.skins.length}, coins earned ${g.p.stats.goldCollected}, ` +
      `boxes ${g.p.stats.boxesOpened}, achievements ${g.p.achievements.length}/${db.achievements.length}`);
  });

  console.log(`${asserts} asserts, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
