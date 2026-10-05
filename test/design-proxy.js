// Real GameSpark DEV test of the gs-design proxy core. Saves are dryRun only: nothing is written.
const fs = require("node:fs");
const path = require("node:path");

const cred = JSON.parse(fs.readFileSync(process.env.USERPROFILE + "/.hlo-gs/credentials", "utf8"))
  .credentials.find((c) => c.project === "repo-2d-topdown");
const env = { base: cred.base, project: cred.project, key: cred.key, secret: cred.secret };

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${name} — ${detail}`);
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function shuffleKeys(v) {
  if (Array.isArray(v)) return v.map(shuffleKeys);
  if (v && typeof v === "object") return Object.fromEntries(shuffle(Object.keys(v)).map((k) => [k, shuffleKeys(v[k])]));
  return v;
}

(async () => {
  const core = await import("file:///" + path.resolve(__dirname, "../supabase/functions/gs-design/core.js").replace(/\\/g, "/"));
  const { KNOWN, hashDocs, handleAction } = core;
  const act = (b) => handleAction(b, env);

  const list = await act({ action: "list" });
  const names = Object.keys(list.json.tables || {});
  check("list names", list.status === 200 && names.length === 30 && names.every((n, i) => n === KNOWN[i]) && KNOWN.length === 30,
    `status ${list.status}, ${names.length} tables`);
  check("list quests.exists", list.json.tables.quests.exists === true, `exists=${list.json.tables.quests.exists}`);

  const got = await act({ action: "get", table: "quests" });
  const daily = got.json.docs.find((d) => d._id === "daily");
  check("quests daily.pick is number", !!daily && typeof daily.pick === "number", `pick=${JSON.stringify(daily && daily.pick)}`);
  check("get hash equals list hash", got.json.hash === list.json.tables.quests.hash, got.json.hash.slice(0, 12));

  const shuffled = shuffle(got.json.docs).map(shuffleKeys);
  check("hash order-independent", (await hashDocs(shuffled)) === got.json.hash, "shuffled docs and keys");

  const edited = JSON.parse(JSON.stringify(got.json.docs));
  edited.find((d) => d._id === "daily").pick += 1;
  const dry = await act({ action: "save", table: "quests", docs: edited, baseHash: got.json.hash, dryRun: true });
  const j = dry.json;
  check("dryRun quests", dry.status === 200 && j.applied === false && j.counts && j.counts.update === 1 &&
    j.changes.length === 1 && j.changes[0].fields.join() === "pick",
    `status ${dry.status}, applied=${j.applied}, counts=${JSON.stringify(j.counts)}, changes=${JSON.stringify(j.changes)}`);

  const wrong = await act({ action: "save", table: "quests", docs: got.json.docs, baseHash: "0".repeat(64), dryRun: true });
  check("wrong baseHash conflict", wrong.status === 409 && wrong.json.error.code === "CONFLICT" && wrong.json.current.hash === got.json.hash,
    `status ${wrong.status}, ${wrong.json.error && wrong.json.error.code}`);

  const h = got.json.hash;
  const invalid = [
    ["unknown table", { table: "nope", docs: [] }],
    ["duplicate _id", { table: "quests", docs: [{ _id: "a" }, { _id: "a" }] }],
    ["$ key", { table: "quests", docs: [{ _id: "a", $bad: 1 }] }],
    ["non-array docs", { table: "quests", docs: { _id: "a" } }],
  ];
  for (const [n, b] of invalid) {
    const r = await act({ action: "save", baseHash: h, dryRun: true, ...b });
    check("INVALID " + n, r.status === 400 && r.json.error.code === "INVALID", `status ${r.status}, ${r.json.error && r.json.error.message}`);
  }

  const foes = JSON.parse(fs.readFileSync("D:/REPO_Meta/gamespark-config/foes.json", "utf8"));
  const gf = await act({ action: "get", table: "foes" });
  const dm = await act({ action: "save", table: "foes", docs: foes, baseHash: gf.json.hash, dryRun: true });
  check("dryRun missing table foes", gf.json.exists === false && dm.status === 200 && dm.json.counts.insert === foes.length,
    `exists=${gf.json.exists}, status ${dm.status}, insert=${dm.json.counts && dm.json.counts.insert}, expected ${foes.length}`);


  console.log(failed ? `FAIL (${failed} check(s) failed)` : "PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("✘ exception — " + e.message); console.log("FAIL"); process.exit(1); });
