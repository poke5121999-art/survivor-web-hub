import { loadGame } from "./load.mjs";
const g = loadGame();
g.eval("Host.moduleLoads(); G$E.Mount(); G.LoadGame(); G$LOC.Init(); G$SPR.Init();");
const t0 = Date.now();
g.eval("G$WORLD.Init(Host.seed)");
console.log("WORLD.Init ms", Date.now() - t0);
