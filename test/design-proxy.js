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
  check("list names", list.status === 200 && names.length === 36 && names.every((n, i) => n === KNOWN[i]) && KNOWN.length === 36,
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
    ["modes _id lạ", { table: "modes", docs: [{ _id: "arena", open: true }] }],
    ["modes open không phải boolean", { table: "modes", docs: [{ _id: "coop", open: "yes" }] }],
    ["coop_rules netBackend lạ", { table: "coop_rules", docs: [{ _id: "default", netBackend: "udp" }] }],
    ["decor_lights màu sai", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, color: "orange" }] }],
    ["decor_lights kiểu nhấp nháy lạ", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, curve: "strobe" }] }],
    ["decor_lights pattern thiếu chuỗi", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, curve: "pattern" }] }],
    ["decor_lights decors rỗng", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, decors: [] }] }],
  ];
  const okDecor = await act({ action: "save", baseHash: (await act({ action: "get", table: "decor_lights" })).json.hash, dryRun: true, table: "decor_lights",
    docs: JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../REPO_Meta/gamespark-config/decor_lights.json"), "utf8")) });
  check("decor_lights seed qua được luật kiểm", okDecor.status === 200, `status ${okDecor.status}, ${okDecor.json.error && okDecor.json.error.message}`);
  for (const [n, b] of invalid) {
    const r = await act({ action: "save", baseHash: h, dryRun: true, ...b });
    check("INVALID " + n, r.status === 400 && r.json.error.code === "INVALID", `status ${r.status}, ${r.json.error && r.json.error.message}`);
  }

  const listed = await act({ action: "list" });
  const gone = KNOWN.find((t) => !listed.json.tables[t].exists);
  if (!gone) console.log("ℹ dryRun missing table — bỏ qua: cả 36 bảng đều đã có trên DEV");
  else {
    const want = JSON.parse(fs.readFileSync(`D:/REPO_Meta/gamespark-config/${gone}.json`, "utf8"));
    const dm = await act({ action: "save", table: gone, docs: want, baseHash: listed.json.tables[gone].hash, dryRun: true });
    check(`dryRun missing table ${gone}`, dm.status === 200 && dm.json.counts.insert === want.length,
      `status ${dm.status}, insert=${dm.json.counts && dm.json.counts.insert}, expected ${want.length}`);
  }


  const li = await act({ action: "get", table: "loot_items" });
  const liFile = JSON.parse(fs.readFileSync("D:/REPO_Meta/gamespark-config/loot_items.json", "utf8"));
  check("loot_items đọc đủ qua nhiều trang (server cắt 50 dòng mỗi lần)", li.status === 200 && li.json.docs.length === liFile.length && li.json.hash === await hashDocs(liFile),
    `status ${li.status}, ${li.json.docs && li.json.docs.length} dòng, khớp file=${li.json.hash === await hashDocs(liFile)}`);

  // Cost guard: read is live and read-only; every guard_save below is refused before any write.
  const g = await act({ action: "guard" });
  const mNow = new Date().toISOString().slice(0, 7);
  check("guard đọc được", g.status === 200 && Array.isArray(g.json.rows) && g.json.rows.every((r) => r._id === "relay" || r._id === "vivox") &&
    g.json.month === mNow && mNow in g.json.meters && g.json.prevMonth in g.json.meters,
    `status ${g.status}, rows=${g.json.rows && g.json.rows.length}, months=${Object.keys(g.json.meters || {})}`);
  const relay = { _id: "relay", capUsd: 50, forceClosed: false, perGiB: 0.16, freeGiBPerCcu: 3, freeGiBCap: 150, perCcu: 0.16, freeCcu: 50, overheadBytes: 40, bytesFactor: 1 };
  const badGuard = [
    ["_id lạ", { ...relay, _id: "unity" }],
    ["số âm", { ...relay, capUsd: -1 }],
    ["số là chuỗi", { ...relay, capUsd: "20" }],
    ["relay mang reserve (chỉ vivox có)", { ...relay, reserve: 20 }],
    ["forceClosed không phải boolean", { ...relay, forceClosed: 1 }],
    ["trường lạ", { ...relay, freePcu: 5000 }],
    ["thiếu trường", (({ perCcu, ...rest }) => rest)(relay)],
    ["vivox mang trường của relay", { _id: "vivox", capUsd: 0, forceClosed: false, reserve: 250, freePcu: 5000, stepPcu: 5000, perStep: 2000, perGiB: 1 }],
  ];
  for (const [n, doc] of badGuard) {
    const r = await act({ action: "guard_save", doc });
    check("guard_save INVALID " + n, r.status === 400 && r.json.error.code === "INVALID", `status ${r.status}, ${r.json.error && r.json.error.message}`);
  }

  console.log(failed ? `FAIL (${failed} check(s) failed)` : "PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("✘ exception — " + e.message); console.log("FAIL"); process.exit(1); });
