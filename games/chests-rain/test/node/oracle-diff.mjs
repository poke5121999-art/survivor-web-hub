// Diffs the JS port against the headless .NET oracle (tools/oracle) for fingerprint, econ and stagefp.
// Uses saved oracle output in $ORACLE_OUT (default ~/chestrain-ref/build/oracle/out/<mode>.txt) unless ORACLE_RUN=1,
// which reruns the oracle binary. Usage: node oracle-diff.mjs [mode...]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadGame } from "./load.mjs";
import { fileURLToPath } from "node:url";

const home = process.env.HOME;
const outDir = process.env.ORACLE_RUN === "1" ? path.join(process.env.HOME, "chestrain-ref/build/oracle/out") : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../oracle");
const dll = path.join(home, "chestrain-ref/build/oracle/bin/Release/net8.0/oracle.dll");
const dotnet = path.join(home, "tools/dotnet/dotnet");
const SEED = 20261005;
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ["fingerprint", "econ", "stagefp"];

const g = loadGame();
g.eval("G$E$Store.disabled = true; Host.moduleLoads(); G$E.Mount(); G.LoadGame(); G$LOC.Init(); G$SPR.Init(); G$WORLD.Init(" + SEED + ");" +
	"G$FX.Init(); G$HEROES.Init(); G$CARDART.Init(); G$CARDS.Init(); G$ITEMS.Init(); G$EVENTS.Init(); G$GAME.Init();");

const js = {
	fingerprint: () => [g.eval("G$WORLD.DebugFingerprint()")],
	econ: () => {
		const out = [];
		for (let s = 1; s <= 20; s++) {
			let kg;
			try { kg = String(g.eval(`G$ECON.KillGold(${s})`)); } catch (e) { kg = "ERR:" + e.message; }
			out.push(`stage=${s} RunGold=${g.eval(`G$ECON.RunGold(${s})`)} HpMult=${g.eval(`G$ECON.HpMult(${s})`)} GoldMult=${g.eval(`G$ECON.GoldMult(${s})`)} KillGold=${kg}`);
		}
		return out;
	},
	stagefp: () => {
		const out = [];
		for (let s = 1; s <= 20; s++) {
			try {
				out.push(`stage=${s} ` + g.eval(`G$GAME.stage = ${s}; G$WORLD.SetBiome(G$WORLD.LookOf(G$GAME.MapDef().key)); G$WORLD.SetSize(G$GAME.StageDef().size); G$WORLD.InitStageMap(${SEED}, ${s}); G$WORLD.DebugFingerprint()`));
			} catch (e) { out.push(`stage=${s} ERR:${e.message}`); }
		}
		return out;
	},
};

// "R" prints 1E+20, JS prints 100000000000000000000: compare numbers by value.
const norm = (l) => l.replace(/-?\d+(\.\d+)?([eE][+-]?\d+)?/g, (t) => String(Number(t)));

// The Steam build computes pow/exp with its own C# emulation of V8 (J.CR); the browser runs V8's own Math,
// which is what the original HTML game used. Economy numbers may differ in the last bit only.
function sameWithin(a, b, rel) {
	const na = a.match(/-?[\d.]+(e[+-]?\d+)?/gi) || [], nb = b.match(/-?[\d.]+(e[+-]?\d+)?/gi) || [];
	if (na.length !== nb.length || a.replace(/-?[\d.]+(e[+-]?\d+)?/gi, "#") !== b.replace(/-?[\d.]+(e[+-]?\d+)?/gi, "#")) return false;
	return na.every((x, i) => { const p = Number(x), q = Number(nb[i]); return p === q || Math.abs(p - q) <= rel * Math.max(Math.abs(p), Math.abs(q)); });
}

let bad = 0;
for (const mode of modes) {
	const f = path.join(outDir, mode + ".txt");
	if (process.env.ORACLE_RUN === "1" || !fs.existsSync(f)) {
		fs.mkdirSync(outDir, { recursive: true });
		const o = execFileSync(dotnet, [dll, mode, String(SEED)], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
		fs.writeFileSync(f, o);
	}
	const want = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.length);
	const got = js[mode]();
	let first = -1, ulp = 0;
	for (let i = 0; i < Math.max(want.length, got.length); i++) {
		const a = norm(want[i] ?? "<missing>"), b = norm(String(got[i] ?? "<missing>"));
		if (a === b) continue;
		if (mode === "econ" && sameWithin(a, b, 1e-15)) { ulp++; continue; }
		first = i; break;
	}
	if (first < 0) console.log(`PASS ${mode} (${want.length} lines${ulp ? `, ${ulp} lines differ only in the last ulp of Math.pow` : ""})`);
	else {
		bad++;
		console.log(`FAIL ${mode} at line ${first + 1}\n  oracle: ${want[first]}\n  js:     ${got[first]}`);
	}
}
process.exit(bad ? 1 : 0);
