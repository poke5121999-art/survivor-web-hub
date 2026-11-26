import { loadGame } from "./load.mjs";
const g = loadGame();
const t0 = Date.now();
g.eval("Host.boot()");
console.log("boot ms", Date.now() - t0);
const errs = g.eval("Host.errors");
console.log("boot errors", errs.length);
for (const e of errs.slice(0, 8)) console.log(" -", e.split("\n").slice(0, 6).join("\n   "));
let frameErr = null;
for (let i = 0; i < 120; i++) {
	try { g.eval("Host.frame(1/60)"); } catch (e) { frameErr = e; break; }
}
console.log("frame error", frameErr ? frameErr.stack.split("\n").slice(0, 8).join("\n") : "none");
console.log("state", g.eval("G$GAME.state"), "quads", g.eval("Gfx.quadsLastFrame"), "errors", g.eval("Host.errors.length"));
