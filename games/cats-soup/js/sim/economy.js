// Economy formulas (D:/catsoup-ref/rules/economy.md, citations there). Pure functions over table rows and BigNumbers.
import * as B from './big.js';

export const COOKS = [0, 7, 17];               // soup, juice, fry lines (Work index); Food.type 0/1/2
export const SHELF = 8;                        // food icons on the shelf (UI_Stage.c:10059)
export const SALE_FACTOR = 0.5;                // auto-sale of the 9th dish and offline surplus (Init 22)
export const CRITICAL_FACTOR = 3;              // blessed dish (Init 15)
export const NIGHT_ENERGY = 1.5;               // Init 19
export const REST_TICK = 60;                   // seconds per rest charge (Work.completeTime of type 3)
export const OFFLINE_MINUTES = 180;            // Init 0
export const RECIPE_MAX = 1100;
export const LEVEL_MAX = 24000;

export const workCost = w => B.big(w.cost, w.costDigit);

// DataManager.GradeValue (DataManager.c:2970): the level curve of a facility, with the +400 (+level under 10^4)
// correction. The correction is real: in video LdkzNl0Bv3A the first thin soup sells for 446 gold = (5.5 + 400 + 1)
// x 1.1, where the uncorrected curve gives 5; and the x10 upgrade factor matches video 8las9YPqbvk (shade tree Lv.91
// upgrade "18b").
export function gradeValue(w, level, abilityMul = 1) {
  const v = gradeRaw(w, level, abilityMul);
  const c = B.add(v, B.fromNumber(400));
  return B.lt(c, B.fromNumber(1e4)) ? B.add(c, B.fromNumber(level)) : c;
}

export function gradeRaw(w, level, abilityMul = 1) {
  let slope, icpt;
  if (w.costDigit < 5) { slope = 0.0413927; icpt = -1.30103; }
  else if (level <= 10) { slope = 0.12965; icpt = -2.7269; }
  else if (level <= 100) { slope = 0.05425; icpt = -1.9729; }
  else if (level <= 1000) { slope = 0.04251; icpt = -0.7989; }
  else { slope = 0.041465; icpt = 0.2461; }
  // One pow10 of the summed exponent: the game scales small values up before multiplying so the integer mode does not
  // truncate the intermediate (economy.md section 5); only the result is truncated.
  return B.mul(B.pow10(Math.log10(w.cost) + w.costDigit + icpt + level * slope), abilityMul);
}

// GetWorkUpgradeCost (DataManager.c:3338): gold for level -> level + 1.
export function upgradeCost(w, level, discount = 0) {
  const g = gradeValue(w, level);
  const t = B.log10(g) + 2.5;
  return B.mul(g, 10 * t * (1 - discount));
}

// GetWorkBuildCost (DataManager.c:63909): copies of a prep work for the 2nd and 3rd cooking line cost more.
export function buildCost(w, copies, juice, fry) {
  if (copies === 1) return B.big(Math.trunc(w.cost + juice.cost), w.costDigit + juice.costDigit - 2);
  if (copies === 2) return B.big(Math.trunc(w.cost + fry.cost), w.costDigit + fry.costDigit - 1);
  return workCost(w);
}

// GetFoodPrice (DataManager.c:1450): stars of the line x recipe percent x line bonus.
export function foodPrice(food, recipeLevel, stars, lineBonus = 1, abilityMul = 1) {
  const pct = Math.trunc(abilityMul * (food.price + 10 * (recipeLevel - 1)));
  return B.mul(stars, (1 + pct / 100) * lineBonus);
}

export const recipePercent = (food, level) => food.price + 10 * (level - 1);

// GetRecipeNeedEnergy: learning costs C(0), level L -> L+1 costs C(L) = cost * 10^(digit + L).
export const recipeCost = (food, level) => B.big(food.cost, food.costDigit + level);

// GetEnergyAmount (DataManager.c:1131): energy for one rest charge.
export function energyAmount(w, level, night = false, mult = 1) {
  return B.mul(gradeValue(w, level), (night ? NIGHT_ENERGY : 1) * mult);
}

// UnitHeart.materialUp by heart level (0-based), percent.
export const HEART_MATERIAL = [0, 10, 30, 60, 100, 160, 250, 400, 600, 1000];
