// City map menu (MartMenuController) and prestige (PrestigeMenuController), rules/census-prestige.md and census-citymap.md.
// Every mart in RC_MartOrder, how far it is (finished mats / total, PlayerHumanController.GetCompletionRate), its stars
// and the idle income it holds, collectable once per requiredTimeForCollection = 10800 s (MartMenuController.c:32).
export const IDLE_EVERY = 10800;
export const STAR_MAX = 4;                              // the Prestige button hides at currentMartStar 4 (MartMenuController.c:3708)
export const PRESTIGE_MIN = 80;                         // ableToPrestige = 0x4f < completionRate (MartMenuController.c:1357)
export const INCOME_MULT = [1.0, 1.5, 2.0, 2.5, 3.0];   // level1.json martIncomeMultiplier
export const PRESTIGE_CASH = 1.5;                       // level1.json prestigeCashMultiplier, the same for stars 0..3
export const PRESTIGE_GOLD = [20, 30, 40, 50];          // level1.json goldBarPrestige, by the star before the prestige

// GetMaxIdleIncome(scene, star) = trunc(martMaxIdleIncomeList[i] * martIncomeMultiplier[clamp(star, 0, 4)]).
export const maxIdleAt = (base, star) => Math.trunc(base * INCOME_MULT[Math.max(0, Math.min(STAR_MAX, star))]);

// marts: data/marts.json; global: { mart, visited[], idleAt{id: ms}, stars{id: n} }; doneOf(id): finished mats.
export function martRows(marts, global, doneOf, now) {
  const stars = global.stars || {};
  return marts.map((m, i) => {
    const visited = global.visited.includes(m.id);
    const star = stars[m.id] || 0;
    const rate = visited ? Math.min(1, doneOf(m.id) / m.mats) : 0;
    const pct = Math.trunc(rate * 100);
    // maxIdleIncome = trunc(rate * base) + basePrestigeIdleIncome, the second term GetMaxIdleIncome(scene, star - 1)
    // from the first star on (MartMenuController.c:3619-3660): the base term does not use the star multiplier.
    const max = Math.trunc(rate * m.idle) + (star >= 1 ? maxIdleAt(m.idle, star - 1) : 0);
    const at = global.idleAt[m.id];
    const elapsed = at == null ? 0 : Math.max(0, (now - at) / 1000);
    const left = Math.max(0, IDLE_EVERY - elapsed);
    // UpdateCollectButton: nothing for the first 5 s, then the share of the 3 hours gone, up to the max.
    const income = elapsed < 5 ? 0 : Math.min(max, Math.trunc(elapsed / IDLE_EVERY * max));
    return {
      id: m.id, index: i, name: m.name, icon: m.icon, visited, here: m.id === global.mart, rate, pct, star, max, income, left,
      ready: visited && max > 0 && left <= 0, prestige: visited && star < STAR_MAX, canPrestige: visited && star < STAR_MAX && pct >= PRESTIGE_MIN,
      // SetPrestigeMenu: cash trunc(1.5 x maxIdleIncome), gold by the current star, max income now and after.
      offer: { cash: Math.trunc(PRESTIGE_CASH * max), gold: PRESTIGE_GOLD[Math.min(star, PRESTIGE_GOLD.length - 1)],
        now: maxIdleAt(m.idle, star), next: maxIdleAt(m.idle, star + 1) },
    };
  });
}
