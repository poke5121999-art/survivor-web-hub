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
  const modesSeed = JSON.parse(fs.readFileSync("D:/REPO_Meta/gamespark-config/modes.json", "utf8"));
  const pvpFake = modesSeed.find((d) => d._id === "pvp").fake;
  const invalid = [
    ["unknown table", { table: "nope", docs: [] }],
    ["duplicate _id", { table: "quests", docs: [{ _id: "a" }, { _id: "a" }] }],
    ["$ key", { table: "quests", docs: [{ _id: "a", $bad: 1 }] }],
    ["non-array docs", { table: "quests", docs: { _id: "a" } }],
    ["modes _id lạ", { table: "modes", docs: [{ _id: "arena", open: true }] }],
    ["modes open không phải boolean", { table: "modes", docs: [{ _id: "coop", open: "yes" }] }],
    ["modes localOpen không phải boolean", { table: "modes", docs: [{ _id: "coop", open: true, localOpen: "yes" }] }],
    ["modes localOpen ngoài coop", { table: "modes", docs: [{ _id: "pvp", open: true, localOpen: true }] }],
    ["modes fakeOnline ngoài pvp", { table: "modes", docs: [{ _id: "coop", open: true, fakeOnline: true }] }],
    ["modes fakeOnline không phải boolean", { table: "modes", docs: [{ _id: "pvp", open: true, fakeOnline: "yes" }] }],
    ["modes fake ngoài pvp", { table: "modes", docs: [{ _id: "endless_coop", open: false, fake: { ...pvpFake } }] }],
    ["modes fake không phải object", { table: "modes", docs: [{ _id: "pvp", open: true, fake: 5 }] }],
    ["modes fake queueMin > queueMax", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, queueMin: 20, queueMax: 12 } }] }],
    ["modes fake pingMin > pingMax", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, pingMin: 200, pingMax: 144 } }] }],
    ["modes fake countdown 0", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, countdown: 0 } }] }],
    ["modes fake countdown 11", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, countdown: 11 } }] }],
    ["modes fake countdown lẻ", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, countdown: 2.5 } }] }],
    ["modes fake ping lẻ", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, pingMin: 14.5 } }] }],
    ["modes fake số âm", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, fullHold: -1 } }] }],
    ["modes fake số quá lớn", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, queueMax: 1000 } }] }],
    ["modes fake số là chuỗi", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, estimate: "8" } }] }],
    ["modes fake names không phải chuỗi", { table: "modes", docs: [{ _id: "pvp", open: true, fake: { ...pvpFake, names: ["An", "Bình"] } }] }],
    ["coop_rules netBackend lạ", { table: "coop_rules", docs: [{ _id: "default", netBackend: "udp" }] }],
    ["decor_lights màu sai", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, color: "orange" }] }],
    ["decor_lights kiểu nhấp nháy lạ", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, curve: "strobe" }] }],
    ["decor_lights pattern thiếu chuỗi", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, curve: "pattern" }] }],
    ["decor_lights decors rỗng", { table: "decor_lights", docs: [{ ...{ _id: "candle", color: "#ffa040", curve: "noise", pattern: "", decors: ["candlestick_triple"] }, decors: [] }] }],
  ];
  const okDecor = await act({ action: "save", baseHash: (await act({ action: "get", table: "decor_lights" })).json.hash, dryRun: true, table: "decor_lights",
    docs: JSON.parse(fs.readFileSync("D:/REPO_Meta/gamespark-config/decor_lights.json", "utf8")) });
  check("decor_lights seed qua được luật kiểm", okDecor.status === 200, `status ${okDecor.status}, ${okDecor.json.error && okDecor.json.error.message}`);
  const okModes = await act({ action: "save", baseHash: (await act({ action: "get", table: "modes" })).json.hash, dryRun: true, table: "modes", docs: modesSeed });
  check("modes seed (pvp giả online) qua được luật kiểm", okModes.status === 200 && okModes.json.applied === false,
    `status ${okModes.status}, ${okModes.json.error ? okModes.json.error.message : JSON.stringify(okModes.json.counts)}`);
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
  badGuard.push(["maxBytesPerMin 0", { ...relay, maxBytesPerMin: 0 }], ["maxBytesPerMin là chuỗi", { ...relay, maxBytesPerMin: "1048576" }],
    ["mixEvery số lẻ", { ...relay, mixEvery: 1.5 }], ["vivox mang maxBytesPerMin", { _id: "vivox", capUsd: 0, forceClosed: false, reserve: 250, freePcu: 5000, stepPcu: 5000, perStep: 2000, maxBytesPerMin: 1 }]);
  // The seed carries relay.maxBytesPerMin; the Online switch saves the row it read back, so the seed must pass as is.
  const seed = JSON.parse(fs.readFileSync("D:/REPO_Meta/gamespark-config/runtime/cost_guard.json", "utf8"));
  const seedBad = seed.map((d) => core.checkGuardDoc(d)).filter(Boolean);
  check("guard: hạt giống cost_guard.json (có maxBytesPerMin) qua được luật kiểm", seedBad.length === 0 && seed[0].maxBytesPerMin > 0,
    seedBad.join(" | ") || `maxBytesPerMin=${seed[0].maxBytesPerMin}`);
  check("guard: relay có mixEvery 3 qua được luật kiểm", core.checkGuardDoc({ ...relay, mixEvery: 3 }) === null, "");
  for (const [n, doc] of badGuard) {
    const r = await act({ action: "guard_save", doc });
    check("guard_save INVALID " + n, r.status === 400 && r.json.error.code === "INVALID", `status ${r.status}, ${r.json.error && r.json.error.message}`);
  }

  // Client gate: read is live and read-only; every gate_save below is refused before any write.
  const gate = await act({ action: "gate" });
  const off = JSON.stringify(core.GATE_OFF);
  check("gate đọc được, đủ hình doc", gate.status === 200 && typeof gate.json.exists === "boolean" &&
    Object.keys(gate.json.doc).join() === "_id,maintenance,minBuild,storeUrls" && core.checkGateDoc(gate.json.doc) === null &&
    (gate.json.exists || JSON.stringify(gate.json.doc) === off),
    `status ${gate.status}, exists=${gate.json.exists}, doc=${JSON.stringify(gate.json.doc)}`);
  check("gate: doc tắt cổng qua được luật kiểm", core.checkGateDoc(JSON.parse(off)) === null, off);
  const gOk = { _id: "default", maintenance: { on: true, message: "x".repeat(300), until: "2026-10-20T01:30:00Z" },
    minBuild: { webgl: 1234, android: 120, ios: 1e9 }, storeUrls: { android: "https://play.google.com/store/apps/details?id=a", ios: "" } };
  check("gate: doc đầy đủ hợp lệ qua được luật kiểm", core.checkGateDoc(gOk) === null, core.checkGateDoc(gOk) || "");
  const seedFile = "D:/REPO_Meta/gamespark-config/runtime/client_gate.json";
  if (!fs.existsSync(seedFile)) console.log("ℹ gate: chưa có hạt giống runtime/client_gate.json — bỏ qua so khớp");
  else {
    const raw = JSON.parse(fs.readFileSync(seedFile, "utf8"));
    const docs = Array.isArray(raw) ? raw : [raw];
    check("gate: hạt giống client_gate.json qua được luật kiểm", docs.length === 1 && core.checkGateDoc(docs[0]) === null,
      docs.map((d) => core.checkGateDoc(d)).filter(Boolean).join(" | ") || JSON.stringify(docs[0]));
  }
  const gm = (patch) => ({ ...gOk, ...patch });
  const badGate = [
    ["_id lạ", gm({ _id: "live" })],
    ["trường lạ", gm({ note: "x" })],
    ["thiếu storeUrls", (({ storeUrls, ...rest }) => rest)(gOk)],
    ["maintenance.on là chuỗi", gm({ maintenance: { ...gOk.maintenance, on: "true" } })],
    ["maintenance thiếu until", gm({ maintenance: { on: false, message: "" } })],
    ["maintenance có trường lạ", gm({ maintenance: { ...gOk.maintenance, by: "a" } })],
    ["lời nhắn 301 ký tự", gm({ maintenance: { ...gOk.maintenance, message: "x".repeat(301) } })],
    ["lời nhắn là số", gm({ maintenance: { ...gOk.maintenance, message: 5 } })],
    ["until không có Z", gm({ maintenance: { ...gOk.maintenance, until: "2026-10-20T08:30:00" } })],
    ["until +07:00", gm({ maintenance: { ...gOk.maintenance, until: "2026-10-20T08:30:00+07:00" } })],
    ["until ngày 30/2", gm({ maintenance: { ...gOk.maintenance, until: "2026-02-30T00:00:00Z" } })],
    ["until là số", gm({ maintenance: { ...gOk.maintenance, until: 1792458000000 } })],
    ["minBuild số lẻ", gm({ minBuild: { ...gOk.minBuild, android: 1.5 } })],
    ["minBuild âm", gm({ minBuild: { ...gOk.minBuild, ios: -1 } })],
    ["minBuild quá 10^9", gm({ minBuild: { ...gOk.minBuild, webgl: 1e9 + 1 } })],
    ["minBuild là chuỗi", gm({ minBuild: { ...gOk.minBuild, webgl: "5" } })],
    ["minBuild thiếu ios", gm({ minBuild: { webgl: 0, android: 0 } })],
    ["minBuild có editor", gm({ minBuild: { ...gOk.minBuild, editor: 0 } })],
    ["storeUrls http", gm({ storeUrls: { ...gOk.storeUrls, ios: "http://apps.apple.com/app/id1" } })],
    ["storeUrls không phải link", gm({ storeUrls: { ...gOk.storeUrls, android: "play store" } })],
    ["storeUrls javascript:", gm({ storeUrls: { ...gOk.storeUrls, android: "javascript:alert(1)" } })],
    ["storeUrls có trường lạ", gm({ storeUrls: { ...gOk.storeUrls, webgl: "" } })],
    ["doc không phải object", []],
  ];
  for (const [n, doc] of badGate) {
    const r = await act({ action: "gate_save", doc });
    check("gate_save INVALID " + n, r.status === 400 && r.json.error.code === "INVALID", `status ${r.status}, ${r.json.error && r.json.error.message}`);
  }

  console.log(failed ? `FAIL (${failed} check(s) failed)` : "PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("✘ exception — " + e.message); console.log("FAIL"); process.exit(1); });
