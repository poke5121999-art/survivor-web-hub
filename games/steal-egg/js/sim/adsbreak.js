// Ads break (AdsBraker on "Add Braker", Rewardpanel on "ads panel", GetHealth on "ads panel (1)"), rules/ads-iap.md 2.
// state.adsBreak (session only: AdsBraker and Rewardpanel.CurrentReward start fresh with the scene / the app):
//   left              AdsBraker.currentTime, seconds shown on the "Add in" chip ("{0:00}:{1:00}")
//   acc               scaled seconds inside the current WaitForSeconds(1.0)
//   interstitialNext  showInterstitialNext (true at start): false + player hurt -> health panel, else coin panel
//   reward            Rewardpanel.CurrentReward (static): 0..4, wraps to 0 at effects.length on the coin panel's OnEnable
//   panel             null | 'coin' (interstitialPanel "ads panel") | 'health' (rewardPanel "ads panel (1)")
//   loading, loadAcc  ShowAdsOnPanel: currentloading 3, one less every 0.5 s ("Ad loading: n", then "Ad loaded ")
// Every countdown second is scaled time: the sim does not step while paused or dead (Time.timeScale = 0).
// The forced interstitial at "Ad loaded " is OUT; the panel stays up as a bonus offer until its Ads button is tapped.
import { COMBAT } from './combat.js';

export function newAdsBreak(D) {
  return { left: D.code.adsBrakeTime, acc: 0, interstitialNext: true, reward: 0, panel: null, loading: 0, loadAcc: 0 };
}

// AdsBraker.ShowPanel + Rewardpanel.OnEnable.
function showPanel(sim) {
  const b = sim.state.adsBreak, p = sim.state.actors[0], D = sim.D;
  const want = !b.interstitialNext && D.player.hp > p.hp ? 'health' : 'coin';
  if (want === 'coin' && b.panel !== 'coin') {
    const n = D.adsBreak.rewardEffects.length;
    if (b.reward === n) b.reward = 0;
    b.reward += 1;                          // effects[CurrentReward] enabled, then CurrentReward + 1
  }
  b.panel = want;
  b.loading = D.code.adsLoadingCount;
  b.loadAcc = 0;
  b.interstitialNext = !b.interstitialNext;
  sim.emit('adsBreak', { panel: want, reward: b.reward });
}

// CountdownRoutine: while currentTime < 1 { ShowPanel; currentTime = countdownTime } ; wait 1 s ; currentTime -= 1.
export function stepAdsBreak(sim, dt) {
  const b = sim.state.adsBreak, D = sim.D;
  if (b.panel && b.loading > 0) {
    b.loadAcc += dt;
    while (b.loading > 0 && b.loadAcc + 1e-9 >= D.code.adsLoadingStep) { b.loadAcc -= D.code.adsLoadingStep; b.loading -= 1; }
  }
  b.acc += dt;
  while (b.acc + 1e-9 >= 1) {
    b.acc -= 1;
    b.left -= 1;
    while (b.left < 1) { showPanel(sim); b.left = D.code.adsBrakeTime; }
  }
}

// "Ads" on the coin panel: AdsBraker.ShowInterstitialAd (hide both panels) then Rewardpanel.claimReward:
// Addcoin(CurrentReward * 25) -> 25, 50, 75, 100, 25, ...
export function claimAdsBreakCoins(sim) {
  const b = sim.state.adsBreak;
  if (b.panel !== 'coin') return false;
  b.panel = null;
  sim.addCoins(b.reward * sim.D.code.adsBreakRewardUnit, 'adsBreak');
  return true;
}

// "Ads" on the health panel: ShowInterstitialAd then GetHealth.GetPlayerHealth -> PlayerManager.FullHealth.
export function claimAdsBreakHealth(sim) {
  const b = sim.state.adsBreak, p = sim.state.actors[0];
  if (b.panel !== 'health') return false;
  b.panel = null;
  if (p.combat.state !== COMBAT.DEAD) {
    p.hp = sim.D.player.hp;
    sim.emit('health', { hp: p.hp });
  }
  return true;
}
