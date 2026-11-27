// Dungeon end to end: with a Dungeon Key in hand, click ENTER on the quest board (the button a player uses),
// play the dungeon run through emulated input until its boss falls, and check the key is spent, the run was a
// dungeon at the save's top stage, the win is recorded, the loot reaches the warband and the camp comes back.
// Before the first key ever the board hides ENTER. The save is funded and geared like campaign.mjs does; keys are granted with
// LOOT.AddKeys, the call a quest return makes when it rolls a key.
import { loadGame } from "./load.mjs";
import { driver } from "./play.mjs";

const STAGE = Number(process.argv[2] || 20);
const g = loadGame();
const d = driver(g);
const { E, frame, click } = d;
E("Unity.headlessMouse = true; Host.boot()");
let failed = 0;
const check = (name, ok, info = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " " + info : ""}`); };
const realErrors = () => E("Host.errors.filter((e) => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock')).length");

E(`(() => { const s = ${STAGE}, S = G$s.SAVE; S.stageMax = s; S.stage = s; S.gold = 1e15; G$TREE.Recalc();
	for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
	for (let i = 0; i < 12; i++) G$LOOT.Give(G$LOOT.RollBag(s, G$LOOT.BestOpen(s), null), "test");
	G$LOOT.AutoEquipAll(); G$LOOT.GrantOre(1e7, "test");
	for (const line of G$LOOT$cc().GEAR) for (let i = 0; i < 3; i++) { const key = G$LOOT.SlotKey(line, i); for (let n = 0; n < 200 && G$REFINE.Refusal(key) == null; n++) G$REFINE.Try(key); }
	G$TUTORIAL.SkipAll(); })()`);
E("G$GAME.OpenTree()");
for (let i = 0; i < 60; i++) frame();
E(`G$UI.SetTreeTab("quests")`);
for (let i = 0; i < 60; i++) frame();

// Clicks ENTER until the dungeon is armed (the board ignores clicks while camp popups are up).
const enter = () => {
	const r = JSON.parse(E("JSON.stringify(G$UI$cc().QB_ENTER)"));
	for (let t = 0; t < 10 && !E("G$GAME$cc().dungeonArmed") && E("G$GAME.state") === "tree"; t++) {
		if (E("G$TUTORIAL.ActiveModal != null")) d.tap("Enter");
		click(r.x + r.w / 2, r.y + r.h / 2);
		for (let i = 0; i < 30; i++) frame();
	}
	for (let i = 0; i < 60; i++) frame();
};

check("quest board open", E("G$QUESTS.BoardOpen()") === true && E("G$UI$cc().treeTab.cur") === "quests");
// Before the first key ever, the board hides ENTER (UI.QbDungeonShown).
const keys0 = E("G$LOOT.Keys");
check("no key yet: ENTER hidden", keys0 === 0 && E("G$UI.QbDungeonShown()") === false);

E("G$LOOT.AddKeys(1)");
const keys1 = E("G$LOOT.Keys");
check("a Dungeon Key in hand", keys1 === keys0 + 1, `(${keys1})`);
check("ENTER is shown on the quest board", E("G$UI.QbDungeonShown()") === true);
enter();
for (let i = 0; i < 600 && E("G$GAME.state") !== "run"; i++) frame();
check("ENTER starts a dungeon run", E("G$GAME.state") === "run" && E("G$GAME.DungeonOn") === true, `(state ${E("G$GAME.state")}, stage ${E("G$GAME$cc().stage")})`);
check("the key is spent", E("G$LOOT.Keys") === keys1 - 1);
check("the dungeon is the save's top stage", E("G$GAME$cc().stage") === STAGE);

const bags0 = E("(G$s.SAVE.loot?.items?.length ?? 0)");
// A lost dungeon fight costs the key; a player tries again with the next one (up to 5 here).
let won = false, tries = 0;
const TRIES = 5;
const results = [];
for (;;) {
	tries++;
	d.playRun({ boss: true, maxSec: 900 });
	won = E("G$GAME.run ? G$GAME.run.dungeonWon === true : false");
	results.push(won ? "won" : "lost");
	d.toCamp();
	if (won || tries >= TRIES) break;
	E("G$LOOT.AddKeys(1)");
	for (let i = 0; i < 120; i++) frame();
	E(`G$UI.SetTreeTab("tree")`);
	E(`G$UI.SetTreeTab("quests")`);
	for (let i = 0; i < 60; i++) frame();
	enter();
	for (let i = 0; i < 600 && E("G$GAME.state") !== "run"; i++) frame();
	if (!E("G$GAME.DungeonOn")) break;
}
check("the dungeon boss falls", won, `(${results.join(", ")})`);
check("back to camp after the results", E("G$GAME.state") === "tree");
check("dungeon loot reaches the warband", E("(G$s.SAVE.loot?.items?.length ?? 0)") > bags0, `(items ${bags0} -> ${E("(G$s.SAVE.loot?.items?.length ?? 0)")})`);
check("no runtime errors", realErrors() === 0, `(${realErrors()})`);
console.log(failed ? `FAIL dungeon (${failed})` : "PASS dungeon");
process.exitCode = failed ? 1 : 0;
