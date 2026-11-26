// Loads the game scripts into a node vm context with null graphics/audio, for sim tests and bots.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Runs in this realm (vm contexts route global lookups through interceptors and are ~100x slower).
// One game per process.
export function loadGame({ storage } = {}) {
	const store = storage || new Map();
	globalThis.localStorage = {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
	};
	const run = (rel) => vm.runInThisContext(fs.readFileSync(path.join(root, rel), "utf8"), { filename: rel });
	run("js/rt.js");
	run("js/host/j.js");
	run("js/host/unity.js");
	run("test/node/null-host.js");
	run("js/gen/game.js");
	run("js/host/boot.js");
	const man = JSON.parse(fs.readFileSync(path.join(root, "assets/manifest.json"), "utf8"));
	const res = vm.runInThisContext("Unity.resources");
	for (const [k, v] of Object.entries(man.res)) res.set(k, new Uint8Array(fs.readFileSync(path.join(root, "assets", v.file))));
	return { store, eval: (code) => vm.runInThisContext(code) };
}
