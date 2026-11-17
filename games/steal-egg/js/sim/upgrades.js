// Speed plans, weapons and the cosmetic shop, rules/upgrades-shop.md. Every ad button grants its reward at once and
// never also charges coins (owner rule, PROGRESS.md 18:15).
// state.upgrades = { speedPlans: {planId: true}, savedSpeed (PlayerPrefs player_current_speed),
//   weapons: { unlocked: {unlockItemK: 1}, ads: {AdsWatchedCountK: n}, equipped: WeponType, changed: bool },
//   cosmetics: { unlocked: {itemK: 1}, picked: {itemK: true} } }
// The original keeps equip choices only for the session (static playerWeapon, active objects); the remake saves them
// (owner rule for Drop 2: equipped items survive a reload). changed = ChangeWapon ran at least once (its pedestal hides).

export function newUpgrades() {
  return { speedPlans: {}, savedSpeed: 0, weapons: { unlocked: {}, ads: {}, equipped: 0, changed: false }, cosmetics: { unlocked: {}, picked: {} } };
}

const planDef = (sim, plan) => sim.D.speedPlans.find(p => p.plan === plan);

// PlayerManager.UpdateSpeed(speed, coin), oddities kept: paying exactly your balance, or buying a slower plan after a
// faster one, charges nothing and changes nothing now ("already speeed upgraded"), yet the plan is marked bought and its
// speed is saved, so it applies at the next session start (PlayerSpeedSaveLoader).
function updateSpeed(sim, speed, coin) {
  const p = sim.state.actors[0], coins = sim.state.coins;
  if (speed <= p.moveSpeed || coins <= coin) {
    if (coins < coin) sim.toast('not evnough coins');
    else if (coin === 0) setSpeed(sim, speed);
    else sim.toast('already speeed upgraded');
    return;
  }
  sim.addCoins(-coin, 'speedPlan');
  setSpeed(sim, speed);
  sim.toast('Speed upgraded successfuly');
}

function setSpeed(sim, speed) {
  sim.state.actors[0].moveSpeed = speed;
  sim.emit('speed', { speed });
}

function completePlan(sim, plan, applied) {
  const u = sim.state.upgrades;
  u.speedPlans[plan] = true;
  u.savedSpeed = Math.max(u.savedSpeed, applied);
  sim.emit('speedPlan', { plan, savedSpeed: u.savedSpeed });
}

// ThirdPersonUpgrade.UpgradePlayer (coins) / upgradeWithAds (free).
export function buySpeedPlan(sim, plan, ad = false) {
  const d = planDef(sim, plan), u = sim.state.upgrades;
  if (!d || u.speedPlans[plan] || sim.state.ui.shop !== 'shoes') return false;
  const coins = sim.state.coins;
  if (!ad && coins >= 0 && coins < d.cost) { sim.toast('Not enough coins'); return false; }
  const speed = Math.max(u.savedSpeed, d.speed);
  updateSpeed(sim, speed, ad ? 0 : d.cost);
  completePlan(sim, plan, speed);
  return true;
}

// PlayerSpeedSaveLoader.ApplySavedSpeed at session start.
export function applySavedSpeed(sim) {
  const v = sim.state.upgrades.savedSpeed;
  if (v > 0) updateSpeed(sim, v, 0);
}

// --- weapons --------------------------------------------------------------------------------------------------------

const pedestal = sim => sim.state.ui.pedestal != null ? sim.D.weapons.pedestals[sim.state.ui.pedestal] : null;

function equip(sim, type) {
  sim.state.upgrades.weapons.equipped = type;
  sim.state.upgrades.weapons.changed = true;
  sim.emit('weapon', { type });
}

// UnlockManager.BuyWithCoins (500).
export function pedestalBuy(sim) {
  const d = pedestal(sim), w = sim.state.upgrades.weapons;
  if (!d || w.unlocked[d.key]) return false;
  if (sim.state.coins < d.price) { sim.toast('Not enough coins!'); return false; }
  sim.addCoins(-d.price, 'weapon');
  w.unlocked[d.key] = 1;
  sim.emit('weaponUnlock', { key: d.key, weapon: d.weapon });
  return true;
}

// UnlockManager.UnlockWithAd: two ads (totalAdsRequired) unlock it; progress persists.
export function pedestalAd(sim) {
  const d = pedestal(sim), w = sim.state.upgrades.weapons;
  if (!d || w.unlocked[d.key]) return false;
  w.ads[d.adsKey] = (w.ads[d.adsKey] || 0) + 1;
  if (w.ads[d.adsKey] >= d.ads) { w.unlocked[d.key] = 1; sim.emit('weaponUnlock', { key: d.key, weapon: d.weapon }); }
  return true;
}

// UnlockManager.PickObject
export function pedestalPick(sim) {
  const d = pedestal(sim);
  if (!d || !sim.state.upgrades.weapons.unlocked[d.key]) return false;
  equip(sim, d.weapon);
  return true;
}

// batButton.UpgradePlayer: charges every click (no "bought" memory) and equips. Watchads: equip, free here.
export function batShopBuy(sim, i, ad = false) {
  const d = sim.D.weapons.batShop[i];
  if (!d || sim.state.ui.shop !== 'bat') return false;
  if (!ad) {
    if (sim.state.coins < d.cost) { sim.toast('Not enough coins'); return false; }
    sim.addCoins(-d.cost, 'weapon');
  }
  equip(sim, d.weapon);
  return true;
}

// UnlockItems (shop grid): one ad unlocks; Pick equips a weapon or wears a cosmetic.
export function shopUnlock(sim, key) {
  const d = sim.D.weapons.shopItems.find(x => x.key === key);
  if (!d) return false;
  const bag = d.weapon ? sim.state.upgrades.weapons.unlocked : sim.state.upgrades.cosmetics.unlocked;
  bag[key] = 1;
  sim.emit('shopUnlock', { key });
  return true;
}

export function shopPick(sim, key) {
  const d = sim.D.weapons.shopItems.find(x => x.key === key);
  if (!d) return false;
  if (d.weapon) {
    if (!sim.state.upgrades.weapons.unlocked[key]) return false;
    equip(sim, d.type);
  } else {
    const c = sim.state.upgrades.cosmetics;
    if (!c.unlocked[key]) return false;
    // PickObject: InActiveObjects off, ActiveObjects on. A picked item whose objects this one hides is no longer worn.
    const off = new Set(d.inactive || []);
    for (const k of Object.keys(c.picked)) {
      const o = sim.D.weapons.shopItems.find(x => x.key === k && !x.weapon);
      if (o && k !== key && (o.active || []).some(p => off.has(p))) delete c.picked[k];
    }
    c.picked[key] = true;
    sim.emit('cosmetic', { key });
  }
  return true;
}
