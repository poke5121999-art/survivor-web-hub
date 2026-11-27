// Late-game systems end to end: camp tabs, shop, refine, quests, trials and endless, each driven through the
// game's own entry points (the ones its UI buttons call) plus real runs played through emulated input.
// Setup is a late save: stage 20 open, funded, every reachable skill bought. Endless is unlocked through the
// save field the game sets after the stage-20 boss (test/node/stages.mjs earns it for real).
import { loadGame } from "./load.mjs";
import { driver } from "./play.mjs";

const g = loadGame();
const d = driver(g);
const { E } = d;
E("Unity.headlessMouse = true; Host.boot()");
let failed = 0;
const check = (name, ok, info = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " " + info : ""}`); };
const errors = () => E("Host.errors.filter((e) => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock')).length");
const errs0 = errors();

E(`(() => { const S = G$s.SAVE; S.stageMax = 20; S.stage = 20; S.gold = 1e15; G$TREE.Recalc();
	for (let p = 0; p < 30; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } } })()`);
E("G$GAME.OpenTree()");

// Camp tabs: every tab the build shows opens and draws for a second without errors. The cards tab draws through
// the WebGL card layer, which node lacks; test/browser/cards-panel.mjs covers it.
const tabs = E("JSON.stringify(G$UI$cc().TREE_TABS.map((t) => t.id).filter((id) => G$UI.TabOpen(id) && id !== 'cards'))");
for (const id of JSON.parse(tabs)) {
	const e0 = errors();
	E(`G$UI.SetTreeTab(${JSON.stringify(id)})`);
	for (let i = 0; i < 60; i++) d.frame();
	check(`camp tab "${id}" opens and draws`, E("G$UI$cc().treeTab.cur") === id && errors() === e0);
}

// Shop: earn cores, restock, buy what the shop allows, reroll, lock a slot; the next run uses the purchases.
E(`G$UI.SetTreeTab("shop")`);
E(`G$SHOP.Earn(60, "test")`);
const cores0 = E("G$SHOP.Sh().cores");
check("shop earned cores", cores0 >= 60, `(${cores0})`);
E("G$SHOP.Restock(true)");
const slots = E("G$SHOP.Slots()");
let bought = 0;
for (let i = 0; i < slots; i++) if (E(`G$SHOP.Refusal(${i})`) == null && E(`G$SHOP.Buy(${i})`)) bought++;
const cores1 = E("G$SHOP.Sh().cores");
check("shop buys spend cores", bought > 0 && cores1 < cores0, `(${bought} bought of ${slots} slots, cores ${cores0} -> ${cores1})`);
const rerolled = E("G$SHOP.Sh().cores >= G$SHOP.RerollCost() ? G$SHOP.Reroll() : 'poor'");
check("shop reroll", rerolled === true || rerolled === "poor", `(${rerolled})`);
// The FULL build prunes the "shopLock" tree node, so the shelf lock is refused like in the Steam game.
check("shop lock refused (node pruned in FULL)", E("(G$FULL$s ?? G$FULL$cc()).PRUNED.has('shopLock')") === true && E("G$SHOP.ToggleLock(0)") === false && E("G$SHOP.Sh().locked") === -1);

// Refine: gain ore, refine the first archer gear slot until it levels up.
E(`G$UI.SetTreeTab("warband")`);
E(`G$REFINE.Gain(400, "test")`);
const key = E(`G$LOOT.SlotKey("normal", 0)`);
const lv0 = E(`G$REFINE.Level(${JSON.stringify(key)})`), ore0 = E("G$s.SAVE.oridecon");
let tries = 0;
while (tries < 40 && E(`G$REFINE.Level(${JSON.stringify(key)})`) === lv0 && E(`G$REFINE.Refusal(${JSON.stringify(key)})`) == null) { E(`G$REFINE.Try(${JSON.stringify(key)})`); tries++; }
const lv1 = E(`G$REFINE.Level(${JSON.stringify(key)})`), ore1 = E("G$s.SAVE.oridecon");
check("refine raises a gear slot", lv1 > lv0 && ore1 < ore0, `(${key} level ${lv0} -> ${lv1} in ${tries} tries, ore ${ore0} -> ${ore1}, refusal now ${E(`G$REFINE.Refusal(${JSON.stringify(key)})`)})`);

// Quests: the FULL board hands out one task at a time ("kill N slimes"...); runs count it and the run after it is
// done brings the party home with rewards (questSave.back counts returns).
E(`G$UI.SetTreeTab("quests")`);
const offers = E("G$QUESTS.Offers().length");
// Offers are seeded by the board's roll count; re-roll (what a finished quest does) until a slime-kill task shows.
const pickKills = "(() => { const o = G$QUESTS.Offers(); for (let i = 0; i < o.length; i++) if (o[i].task === 'kills') return i; return -1; })()";
for (let r = 0; r < 40 && E(pickKills) < 0; r++) E("G$QUESTS.RollOffers(false)");
const pick = Math.max(0, E(pickKills));
const took = E(`G$QUESTS.Refusal(${pick}) == null && G$QUESTS.Take(${pick})`);
const task = E("(() => { const t = G$QUESTS.Taken(); return t ? [t.task, t.goal] : null; })()");
check("quest board offers and accepts a quest", offers > 0 && took === true && task != null, `(${offers} offers, task ${task})`);
const back0 = E("G$QUESTS.Save().back"), cores2 = E("G$SHOP.Sh().cores"), items2 = E("(G$s.SAVE.loot?.items?.length ?? 0)");
let questRuns = 0, seen = 0;
// Quest runs on stage 1: the late save has no gear, and on stage 20 its heroes kill nothing.
E("G$s.SAVE.stage = 1");
while (questRuns < 3 && E("G$QUESTS.Save().back") === back0) {
	E("G$GAME.StartRun()");
	d.playRun({ boss: false, maxSec: 900 });
	const t = E("(() => { const t = G$QUESTS.Taken(); return t ? t.done : -1; })()");
	if (t > seen) seen = t;
	d.toCamp();
	questRuns++;
}
check("quest counted, completed and returned", E("G$QUESTS.Save().back") === back0 + 1 && E("G$QUESTS.Taken()") == null,
	`(task ${task}, counted ${seen}, back after ${questRuns} runs, cores ${cores2} -> ${E("G$SHOP.Sh().cores")}, items ${items2} -> ${E("(G$s.SAVE.loot?.items?.length ?? 0)")})`);

// Trials: accept the offered trial, play a run, the trial counter moves.
const trial = E("(() => { const t = G$TRIALS.Offered(); return t ? t.node : null; })()");
if (trial) {
	check(`trial "${trial}" accepted`, E(`G$TRIALS.Accept(${JSON.stringify(trial)})`) === true);
	E("G$s.SAVE.stage = 20");
	E("G$GAME.StartRun()");
	d.playRun({ boss: false, maxSec: 900 });
	const now = E(`(() => { const t = G$TRIALS.ByNode(${JSON.stringify(trial)}); return [G$TRIALS.Now(t), G$TRIALS.Best(t), G$TRIALS.Goal(t), G$TRIALS.Done(t)]; })()`);
	check("trial progress counted in a run", now[0] > 0 || now[1] > 0 || now[3], `(now ${now[0]}, best ${now[1]}, goal ${now[2]}, done ${now[3]})`);
	check("back in camp after the trial run", d.toCamp());
} else check("a trial is offered in the late save", false);

// Endless: open it, start with the archer, survive five minutes (the travelling cart first comes at minute 4, ENDLESS.CART_FIRST) of play; the clock, kills and the cart move.
E("G$s.SAVE.endless = G$s.SAVE.endless || new EndlessSave(); G$s.SAVE.endless.open = true");
check("endless open", E("G$ENDLESS.Open") === true);
E(`G$ENDLESS.Start("normal")`);
for (let i = 0; i < 120; i++) d.frame();
check("endless run active", E("G$ENDLESS$cc().active") === true && E("G$GAME.state") === "run");
const k0 = E("G$GAME.run ? G$GAME.run.kills : 0");
let cartSeen = false;
for (let m = 0; m < 60; m++) {
	d.playRun({ boss: false, endless: true, maxSec: 5 });
	if (E("G$ENDLESS$cc().cartOn")) cartSeen = true;
	if (E("G$GAME.state") !== "run") break;
}
const k1 = E("G$GAME.run ? G$GAME.run.kills : 0");
check("endless kills climb over five minutes", k1 > k0, `(kills ${k0} -> ${k1}, state ${E("G$GAME.state")})`);
check("endless travelling cart shows up", cartSeen);

check("no runtime errors across the systems", errors() === errs0, `(${errors() - errs0} new)`);
if (errors() !== errs0) for (const e of E("Host.errors.filter((e) => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock'))").slice(errs0, errs0 + 4)) console.log("   ", e.split("\n").slice(0, 3).join(" | ").slice(0, 300));
console.log(failed ? `FAIL systems (${failed})` : "PASS systems");
process.exitCode = failed ? 1 : 0;
