// Feature "guide" (sim part): the new-player tutorial, the welcome-cat and forest-expansion popups.
// Rules: D:/catsoup-ref/rules/guide.md. Pure JS: the view (js/view/features/guide.js) asks `info(game)` what to show and
// draws it. Contract: js/sim/registry.js.
//
// The original has no linear list: UI_Stage.InitTutorial registers tutorial ids, each with its own gate
// (UI_Stage.CheckTutorial_Inner, switch at UI_Stage.c:836) plus the newbie nudge (CheckNewbieCondition, UI_Stage.c:104).
// This port keeps the ones that fit the facilities of the port, in the order a new player meets them.
import * as B from '../big.js';

export const SAVE = 'guide';
export const HINT_SECONDS = 6;   // how long the "hold the button" hint stays after the first upgrade (inferred)

// id: step; tuto: original tutorial id the step comes from; msg: lang keys, one bubble line each.
export const STEPS = [
  { id: 'sell', tuto: 0, msg: ['guide_tuto00_1'] },                       // UI_Stage.c:836 case 0 (SellFood value 0)
  { id: 'build', tuto: 4, nudge: true },                                  // CheckNewbieCondition: work 4 not built, size < 1
  { id: 'upgrade', tuto: -1, msg: ['guide_levelUp'] },                    // string guide_levelUp (inferred gate)
  { id: 'recipe', tuto: 5, msg: ['guide_tuto05_1', 'guide_tuto05_2'] },   // strings guide_tuto05_* (inferred gate)
  { id: 'expand', tuto: -1, nudge: true },                                // ShowNewbieGuide: guide_expandNow
];

const S = g => g.state.guide;

// Has the player already done what this step asks? State based, so a player who skips ahead is not asked again.
const DONE = {
  sell: g => !!S(g).sold,
  build: g => g.state.stats.built >= 1 || g.state.works.length >= 2,
  upgrade: g => g.state.stats.upgraded >= 1,
  recipe: g => Object.keys(g.state.recipes).length > 1 || Object.values(g.state.recipes).some(l => l > 1),
  expand: g => g.state.mapSize >= 1 || g.state.stats.expanded >= 1,
};

// The facility the build nudge points at: the first work of the CRAFT list never built (what the panel's frontier is).
export function nextBuild(g) {
  const o = g.buildList().find(x => x.n === 0);
  return o || null;
}

// Cheapest recipe row the player could learn or level with the energy in hand (recipe tutorial gate, inferred).
export function recipeReady(g) {
  for (const line of [0, 1, 2]) {
    if (!g.cookBuilt(line)) continue;
    for (const r of g.recipeList(line)) if (r.open && B.gte(g.state.energy, g.recipeCost(r.f))) return true;
  }
  return false;
}

function settle(g) {
  const gd = S(g);
  if (gd.done) return;
  while (gd.step < STEPS.length && DONE[STEPS[gd.step].id](g)) {
    const was = STEPS[gd.step].id;
    gd.step += 1;
    if (was === 'upgrade') gd.hint = HINT_SECONDS;
    g.emit('guideStep', { step: was, next: gd.step < STEPS.length ? STEPS[gd.step].id : null });
  }
  if (gd.step >= STEPS.length) { gd.done = true; g.emit('guideDone'); }
}

// What the view shows now, or null. Fields: step, msg (lang keys), nudge {kind save|build|expand, price, target, gold, work},
// target (what the hand points at: dish, build, buy, work, up, recipe, recipeBuy, expand), hint (longPress key).
export function info(g) {
  const gd = S(g);
  if (!gd) return null;
  const hint = gd.hint > 0 ? 'guide_longPress' : null;
  if (gd.done) return hint ? { step: null, msg: [hint], target: 'up', hint: true } : null;
  const st = STEPS[gd.step];
  if (!st) return null;
  const out = { step: st.id, tuto: st.tuto, msg: st.msg || [], target: null };
  if (hint) { out.msg = [hint]; out.hint = true; out.target = 'up'; return out; }
  if (st.id === 'sell') out.target = 'dish';
  else if (st.id === 'build') {
    const nb = nextBuild(g);
    if (!nb) return null;
    const afford = g.canBuild(nb.w.index);
    out.nudge = { kind: afford ? 'build' : 'save', price: nb.price, gold: g.state.gold, a: nb.w.index };
    out.target = afford ? 'build' : null;
  } else if (st.id === 'upgrade') out.target = 'work';
  else if (st.id === 'recipe') {
    if (!recipeReady(g)) return null;
    out.target = 'recipe';
  } else if (st.id === 'expand') {
    if (!g.canExpand()) return null;
    out.nudge = { kind: 'expand' };
    out.target = 'expand';
  }
  return out;
}

export default {
  id: SAVE,
  data: [],
  STEPS,
  info,

  // A fresh game starts the tutorial; a save made before this feature existed counts as finished (rules/guide.md 1).
  // A fresh state is the untouched start: one pot, nothing sold, built or upgraded, clock at 0.
  init(g) {
    if (!g.guideQ) g.guideQ = [];
    const s = g.state;
    if (s.guide) return;
    const untouched = s.clock === 0 && s.works.length === 1 && s.stats.sold === 0 && s.stats.built === 0 && s.stats.upgraded === 0;
    s.guide = untouched ? { step: 0, done: false, sold: false, hint: 0 } : { step: STEPS.length, done: true, sold: true, hint: 0 };
  },

  tick(g, dt) {
    const gd = g.state.guide;
    if (!gd) return;
    if (gd.hint > 0) gd.hint = Math.max(0, gd.hint - dt);
    settle(g);
  },

  onEvent(g, e) {
    const gd = g.state && g.state.guide;
    if (!gd) return;   // events of fresh() come before init
    if (e.type === 'sell' && !e.auto && !gd.sold) gd.sold = true;
    if (e.type === 'cat') g.guideQ.push({ kind: 'welcome', cat: e.cat, rare: isRare(g, e.cat) });
    if (e.type === 'expandReward') g.guideQ.push({ kind: 'expand', gold: e.gold, coin: e.coin, size: g.state.mapSize });
    if (['sell', 'build', 'upgrade', 'recipe', 'expand'].includes(e.type)) settle(g);
  },

  // Popups waiting to be shown (welcome cat, forest expansion); the view calls this every frame.
  takePopups(g) { const q = g.guideQ || []; g.guideQ = []; return q; },

  // Ends the tutorial at once (tests, demo states, a "skip" button).
  skip(g) {
    const gd = g.state.guide;
    gd.step = STEPS.length;
    gd.done = true;
    gd.sold = true;
    gd.hint = 0;
  },
};

// UI_WelcomeCat.Set(.., isRare) is called with rare cats only (UI_WelcomeCat.c:337); a CatType with a glow or rim
// factor is the rare look (inferred; no cat of the plain pool has one).
function isRare(g, cat) {
  const row = g.t.CatType.find(c => c.index === cat.type);
  return !!row && (row.glowFactor > 0 || row.rimFactor > 0);
}
