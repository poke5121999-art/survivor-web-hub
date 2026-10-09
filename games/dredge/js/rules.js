/*
 * Luật số của DREDGE, chép công thức từ mã gốc (D:\dredge-ref\notes\CODE.md có dòng nguồn từng mục).
 * Không đụng DOM, không đụng three.js: chạy được trong node (test/dredge-rules.js).
 * Số liệu đọc từ DR_CONFIG (GameConfigData gốc); tên trường giữ đúng tên field Unity.
 */
(function (root) {
  'use strict';
  const G = root.DRGrid;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => a === b ? 0 : clamp01((v - a) / (b - a));
  const num = v => typeof v === 'number' ? v : parseFloat(v) || 0;

  // ---- Chỉ số thuyền suy ra từ khoang (PlayerStats.cs) ----
  // Đồ nằm trên ô hỏng bị tắt khỏi mọi phép cộng.
  function stats(cfg, inv, items, research) {
    research = research || (root.DRBooks && root.DRBooks.benefits()) || {};   // sách đã đọc xong (js/books.js, PlayerStats.CalculateResearchedBenefits)
    const live = sub => inv.items.filter(i => {
      const d = items[i.id];
      return d && (G.subOf(d) & sub) && (G.typeOf(d) & G.TYPE.EQUIPMENT) && !G.onDamaged(inv, i);
    }).map(i => items[i.id]);
    const all = sub => inv.items.map(i => items[i.id]).filter(d => d && (G.subOf(d) & sub) && (G.typeOf(d) & G.TYPE.EQUIPMENT));

    const engines = live(G.SUB.ENGINE), rods = live(G.SUB.ROD), lights = live(G.SUB.LIGHT);
    const dredges = live(G.SUB.DREDGE), gadgets = live(G.SUB.GADGET);
    const speedEquip = num(cfg.basePlayerSpeed) + engines.reduce((s, e) => s + num(e.speedBonus), 0);
    const moveMod = speedEquip * (1 + (research.MOVEMENT_SPEED || 0));
    const gadget = eff => 1 + gadgets.filter(g => g.effectType === eff).reduce((s, g) => s + num(g.effectMagnitude), 0);
    const fishEquip = num(cfg.baseFishingSpeedModifier) + rods.reduce((s, r) => s + num(r.fishingSpeedModifier), 0);
    const fishMod = fishEquip * (1 + (research.FISHING_SPEED || 0)) + (gadget('FISHING_SPEED') - 1);
    const lumens = lights.reduce((s, l) => s + num(l.lumens), 0);
    const types = new Set(), adv = new Set();
    for (const h of rods.concat(dredges)) for (const t of h.harvestableTypes || []) {
      types.add(t); if (h.isAdvancedEquipment) adv.add(t);
    }
    const aberrationBonus = all(G.SUB.ROD | G.SUB.NET).reduce((s, h) => s + num(h.aberrationBonus), 0) + (research.ABERRATION_CATCH_BONUS || 0);
    return {
      speed: Math.max(moveMod, num(cfg.basePlayerSpeed)) * num(cfg.baseMovementSpeedModifier || 1),
      turn: num(cfg.baseTurnSpeed) * gadget('TURN_SPEED'),
      reverse: num(cfg.baseReverseSpeedModifier) * Math.min(gadget('REVERSE_SPEED'), 1 / (num(cfg.baseReverseSpeedModifier) || 1)),
      // fishing = MinigameFishingSpeedModifier (minigame); fishingDisplay = FishingSpeedModifier thô, PlayerStatsUI hiện ×100 %
      // (PlayerStats.cs:24-36, PlayerStatsUI.cs:167: 1,1 ⇒ "Fishing Speed: 110%")
      fishing: fishMod <= 1 ? fishMod : Math.pow(fishMod, 0.45), fishingDisplay: fishMod,
      dredging: gadget('DREDGE_SPEED'),
      lumens, lightRange: lights.reduce((m, l) => Math.max(m, num(l.range)), 0),
      lightSanity: lerp(0, num(cfg.maxLightSanityModifier), invLerp(0, num(cfg.lumensForMaxLightSanityModifier), lumens)),
      harvestTypes: types, advancedTypes: adv, hasRod: rods.length > 0, hasDredge: dredges.length > 0,
      aberrationBonus, heatSink: gadget('HEAT_SINK'), trawlRate: gadget('TRAWL_CATCH_RATE')
    };
  }

  function damageThreshold(cfg, hullTier) {
    return Math.min(num(cfg.basePlayerHealth) + hullTier * num(cfg.playerHealthPerHullTier), num(cfg.maxPlayerHealth));
  }

  // ---- Thời gian (TimeController.cs). Một ngày = 1.0; phần lẻ 0 = nửa đêm. ----
  // mode: 'forced' | 'fishing' | 'manual' | 'move' | 'idle'; input = độ lớn cần điều khiển 0..1.
  function timeModifier(cfg, mode, input) {
    if (mode === 'forced') return num(cfg.forcedTimePassageSpeedModifier);
    if (mode === 'fishing') return num(cfg.fishingTimePassageSpeedModifier);
    if (mode === 'manual') return 1;
    if (mode === 'move') return clamp01(input);
    return 0;
  }
  const dayLengthSec = cfg => num(cfg.hourDurationInSeconds) * 24;
  function advance(cfg, t, dt, mode, input) {
    return t + dt / dayLengthSec(cfg) * timeModifier(cfg, mode, input);
  }
  const timeOfDay = t => t - Math.floor(t);
  const dayOf = t => Math.floor(t);
  const isDay = (t, dawn, dusk) => { const f = timeOfDay(t); return f > dawn && f < dusk; };
  // RestDestinationUI: ngủ tới 06:00 kế tiếp.
  function hoursToMorning(t) {
    const f = timeOfDay(t);
    return (f >= 0.25 ? 0.25 + (1 - f) : 0.25 - f) * 24;
  }

  // ---- Hoảng loạn (PlayerSanity.cs). sanity 1 = tỉnh táo, 0 = hoảng tột độ. ----
  // local = tổng SanityModifier đang chồng lên thuyền (bến, đèn, đền...).
  function sanityRate(cfg, day, local, ability, sleeping, resilience) {
    let r = sleeping ? num(cfg.sleepingSanityModifier)
      : (day ? num(cfg.daySanityModifier) : num(cfg.nightSanityModifier)) + local + (ability || 0);
    r *= num(cfg.globalSanityModifier || 1);
    if (r < 0) r *= 1 - (resilience || 0);
    return r;
  }
  function stepSanity(s, rate, dt, timeMod) { return clamp01(s + rate * dt * timeMod); }

  // SanityModifier.cs: giá trị theo khoảng cách tới tâm khối.
  function sanityVolume(m, dist, day) {
    const full = day ? num(m.fullValueDay) : num(m.fullValueNight);
    const pmin = day ? num(m.partialValueMinDay) : num(m.partialValueMinNight);
    if (dist <= num(m.fullValueRadius)) return full;
    if (dist <= num(m.partialValueRadius)) return lerp(pmin, full, 1 - invLerp(num(m.fullValueRadius), num(m.partialValueRadius), dist));
    return 0;
  }
  // Mắt hoảng loạn trên HUD, 5 bậc (wiki /wiki/Panic): 0 nhắm .. 4 đỏ.
  // [ĐỀ XUẤT] chia đều: bản gốc đặt ngưỡng trong Animator của SanityUI (tham số "Sanity"), mã không có số.
  const panicStage = s => s > 0.8 ? 0 : s > 0.6 ? 1 : s > 0.4 ? 2 : s > 0.2 ? 3 : 4;

  // ---- Điểm câu (POIDataModel.cs, HarvestPOIDataModel.cs) ----
  function regenStock(cfg, spot, now) {
    if (spot.doesRestock === false) { spot.lastUpdate = now; return spot.stock; }
    const dt = now - (spot.lastUpdate == null ? now : spot.lastUpdate);
    const ratio = Math.max(spot.stock / spot.maxStock, num(cfg.minStockReplenish));
    spot.stock = Math.min(spot.maxStock, spot.stock + num(cfg.stockReplenishCoefficient) * dt * ratio * spot.maxStock);
    spot.lastUpdate = now;
    return spot.stock;
  }
  function spotList(spot, day) {
    if (spot.usesTimeSpecificStock) return day ? spot.items : spot.nightItems;
    return spot.items;
  }
  // 'ok' | 'wrong_time' | 'no_stock' | 'no_equipment' | 'need_advanced' | 'need_rod'
  function spotStatus(spot, day, st, items) {
    const list = spotList(spot, day) || [];
    if (!list.length) return 'wrong_time';
    if (spot.stock < 1) return 'no_stock';
    const first = items[list[0]];
    if (!first) return 'wrong_time';
    const ht = first.harvestableType;
    if (ht !== 'DREDGE' && !st.hasRod) return 'need_rod';
    if (!st.harvestTypes.has(ht)) return 'no_equipment';
    if (first.requiresAdvancedEquipment && !st.advancedTypes.has(ht)) return 'need_advanced';
    return 'ok';
  }
  function pickWeighted(ids, items, rnd) {
    rnd = rnd || Math.random;
    const w = ids.map(id => Math.max(0, num((items[id] || {}).harvestItemWeight) || 1));
    let r = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }

  // ---- Cá bắt được (ItemManager.CreateFishItem) ----
  function gaussSize(rnd) {
    rnd = rnd || Math.random;
    const u = 1 - rnd(), v = rnd();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return clamp01(0.5 + z / 6);
  }
  function rollSize(cfg, trophyHit, rnd) {
    rnd = rnd || Math.random;
    const tmax = num(cfg.trophyMaxSize);
    if (trophyHit) return lerp(tmax, 1, rnd());
    return Math.min(gaussSize(rnd), tmax - 0.01);
  }
  // st.aberrationSpawnModifier tích luỹ qua mỗi con thường (SaveData "aberration-spawn-modifier").
  function aberrationChance(cfg, day, spawnMod, catchMod, special, caughtAtSpecial) {
    const base = day ? num(cfg.baseAberrationSpawnChance) : num(cfg.nightAberrationSpawnChance);
    let p = Math.min(num(cfg.maxAberrationSpawnChance), base + spawnMod + catchMod);
    if (special) p += caughtAtSpecial ? num(cfg.specialSpotAberrationSpawnBonus) : 1;
    return p;
  }

  // ---- Giá (ItemManager.cs:114-148, FishItemInstance.cs) ----
  function freshnessFactor(cfg, fresh) {
    const m = cfg.freshnessSaleModifiers || [1, 1, 1];
    const max = num(cfg.maxFreshness);
    if (fresh > max - 1) return num(m[2]);
    if (fresh < 1) return num(m[0]);
    return num(m[1]);
  }
  function sellPrice(cfg, def, inst, shopMod, barter) {
    shopMod = Math.max(1, shopMod || 1); barter = barter || 1;
    let v;
    if (G.subOf(def) & G.SUB.FISH) {
      const sz = lerp(num(cfg.minSizeSaleModifier), num(cfg.maxSizeSaleModifier), inst.size == null ? 0.5 : inst.size);
      v = num(def.value) * shopMod * sz * freshnessFactor(cfg, inst.fresh == null ? num(cfg.maxFreshness) : inst.fresh);
      if (inst.infected) v *= 0.3;
    } else {
      v = (def.hasSellOverride ? num(def.sellOverrideValue) : num(def.value)) * shopMod;
      if (def.maxDurabilityDays && inst.dur != null) v *= Math.min(1, Math.max(0.1, inst.dur / def.maxDurabilityDays));
    }
    return Math.round(v * barter * 100) / 100;
  }
  const buyPrice = (def, barter) => Math.round(num(def.value) * (2 - (barter || 1)) * 100) / 100;

  // ---- Độ tươi (FreshnessCoroutine.cs) ----
  function decayFish(cfg, inst, def, dDays) {
    if (inst.infected) return inst.fresh;
    inst.fresh = Math.max(0, inst.fresh - dDays * num(cfg.freshnessLossPerDay) * num(def.rotCoefficient == null ? 1 : def.rotCoefficient));
    return inst.fresh;
  }
  // Fresh / Stale / Rotting theo cùng ngưỡng với hệ số giá.
  const freshLabel = (cfg, f) => f > num(cfg.maxFreshness) - 1 ? 'fresh' : f < 1 ? 'rotting' : 'stale';

  root.DRRules = {
    clamp01, lerp, invLerp, stats, damageThreshold, timeModifier, dayLengthSec, advance, timeOfDay, dayOf, isDay,
    hoursToMorning, sanityRate, stepSanity, sanityVolume, panicStage, regenStock, spotList, spotStatus, pickWeighted,
    gaussSize, rollSize, aberrationChance, freshnessFactor, sellPrice, buyPrice, decayFish, freshLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
