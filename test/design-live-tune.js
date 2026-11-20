// Đẩy LIVE trong proxy gs-design, fetch GIẢ: không chạm mạng, không chạm GameSpark DEV hay LIVE.
//   node test/design-live-tune.js
const path = require("node:path");
const crypto = require("node:crypto");

let failed = 0, total = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? " — " + detail : ""}`);
}

const LIVE = { base: "https://live.test", project: "demo-01", key: "sk_live", secret: "secret-test" };
const DEV = { base: "https://dev.test", project: "dev-01", key: "k", secret: "s" };

// Fake GameSpark: DEV admin /data/query for md_ tables, LIVE /rpc/<project> for the two server events.
function makeWorld({ liveItems, devDocs }) {
  const w = { rpcCalls: [], adminCalls: [], items: liveItems, devDocs };
  w.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.startsWith(LIVE.base)) {
      w.rpcCalls.push({ url, headers: init.headers, body, raw: init.body });
      if (body["@t"] === "LIVE_TUNE_GET") return resp({ ok: true, itemsJson: JSON.stringify(w.items) });
      if (body["@t"] === "LIVE_TUNE_SET") {
        if (w.setError) return resp({ ok: false, error: { code: w.setError, message: "máy chủ từ chối" } });
        const sent = JSON.parse(body.itemsJson);
        for (const s of sent) {
          const it = w.items.find((i) => i.table === s.table && i.id === s.id && i.path === s.path);
          if (s.value === null) Object.assign(it, { value: null, base: null, by: null, at: null, active: false, effective: it.md });
          else Object.assign(it, { value: s.value, base: it.md, by: body.by, at: "2026-11-20T10:00:00Z", active: true, effective: s.value });
        }
        return resp({ ok: true, itemsJson: JSON.stringify(sent), changed: sent.length });
      }
    }
    w.adminCalls.push({ url, body });
    const m = /^md_(.+)$/.exec(body.collection || "");
    return resp({ ok: true, docs: m ? w.devDocs[m[1]] || [] : [], hasMore: false });
  };
  return w;
}
const resp = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });

const item = (o) => Object.assign({ md: 1, value: null, base: null, by: null, at: null, active: false }, o,
  { key: `${o.table}/${o.id}/${o.path}`, effective: o.effective !== undefined ? o.effective : o.md });

(async () => {
  const core = await import("file:///" + path.resolve(__dirname, "../supabase/functions/gs-design/core.js").replace(/\\/g, "/"));
  const { handleAction, signRpc } = core;

  // 1) signing vector from the server contract
  const body = '{"@t":"PING"}';
  check("sha256 của body mẫu", crypto.createHash("sha256").update(body).digest("hex") === "878b0e9d31481153a8b338087774d3e3837dbee40f2196f1a4f71eb7add400d5");
  const sig = await signRpc("secret-test", "/rpc/demo-01", "1757548800", "nonce1", body);
  check("chữ ký khớp vector", sig === "KPkQfA7VuzBfmGPTh7LoIwKO1wscPK2KJ8S2Hh5JoJM=", sig);

  const baseItems = () => [
    item({ table: "shop_rules", id: "default", path: "goldCap.normal", md: 100 }),
    item({ table: "shop_rules", id: "default", path: "gemCap", md: 5, value: 9, base: 5, by: "a@x.com", at: "2026-11-19T01:00:00Z", active: true, effective: 9 }),
    item({ table: "crew", id: "son", path: "hp", md: 40 }),
    item({ table: "shop_rules", id: "default", path: "missing", md: 3 }),
  ];
  const devDocs = {
    shop_rules: [{ _id: "default", goldCap: { normal: 150 }, gemCap: 9 }],
    characters: [{ _id: "son", hp: 40 }],
  };

  // 2) live merge DEV + LIVE
  let w = makeWorld({ liveItems: baseItems(), devDocs });
  let r = await handleAction({ action: "live" }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  const row = (k) => r.json.rows.find((x) => x.key === k);
  check("live: 200 và 4 dòng", r.status === 200 && r.json.ok && r.json.rows.length === 4);
  check("live: DEV 150 khác LIVE 100", row("shop_rules/default/goldCap.normal").dev === 150 && row("shop_rules/default/goldCap.normal").live === 100 && row("shop_rules/default/goldCap.normal").differs === true);
  check("live: override giữ by/active, DEV = LIVE thì differs false", row("shop_rules/default/gemCap").override.by === "a@x.com" && row("shop_rules/default/gemCap").override.active === true && row("shop_rules/default/gemCap").differs === false);
  check("live: crew đọc từ md_characters", row("crew/son/hp").dev === 40 && w.adminCalls.some((c) => c.body.collection === "md_characters"));
  check("live: thiếu ở DEV thì dev null", row("shop_rules/default/missing").dev === null && row("shop_rules/default/missing").override === null);
  check("live: mỗi bảng DEV đọc một lần", w.adminCalls.filter((c) => c.body.collection === "md_shop_rules").length === 1);
  const g = w.rpcCalls[0];
  check("rpc: đúng URL, header khoá và chữ ký ký trên body gửi đi", g.url === "https://live.test/rpc/demo-01" && g.headers["X-GS-Key"] === "sk_live" &&
    g.headers["X-GS-Sign"] === await signRpc("secret-test", "/rpc/demo-01", g.headers["X-GS-Ts"], g.headers["X-GS-Nonce"], g.raw) &&
    g.headers["X-GS-Nonce"].length >= 8 && g.body["@t"] === "LIVE_TUNE_GET");

  // 3) push sends DEV values and by = email, ignoring browser values
  w = makeWorld({ liveItems: baseItems(), devDocs });
  r = await handleAction({ action: "live_push", keys: ["shop_rules/default/goldCap.normal"], values: { x: 1 }, items: [{ value: 999 }] }, { ...DEV, live: LIVE, email: "designer@x.com" }, w.fetch);
  const set = w.rpcCalls.find((c) => c.body["@t"] === "LIVE_TUNE_SET");
  const sent = JSON.parse(set.body.itemsJson);
  check("push: gửi số DEV (150), không phải số từ trình duyệt", sent.length === 1 && sent[0].value === 150 && sent[0].table === "shop_rules" && sent[0].id === "default" && sent[0].path === "goldCap.normal", JSON.stringify(sent));
  check("push: by = email designer", set.body.by === "designer@x.com");
  check("push: trả dòng mới, changed, LIVE đã = DEV", r.status === 200 && r.json.changed === 1 && row("shop_rules/default/goldCap.normal").live === 150 && row("shop_rules/default/goldCap.normal").differs === false);
  check("push: gọi lại GET sau SET", w.rpcCalls.map((c) => c.body["@t"]).join() === "LIVE_TUNE_GET,LIVE_TUNE_SET,LIVE_TUNE_GET");

  // 4) clear sends null
  w = makeWorld({ liveItems: baseItems(), devDocs });
  r = await handleAction({ action: "live_clear", keys: ["shop_rules/default/gemCap"] }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  const cs = JSON.parse(w.rpcCalls.find((c) => c.body["@t"] === "LIVE_TUNE_SET").body.itemsJson);
  check("clear: value null và dòng mất override", cs.length === 1 && cs[0].value === null && r.json.rows.find((x) => x.key === "shop_rules/default/gemCap").override === null);

  // 5) bad keys
  w = makeWorld({ liveItems: baseItems(), devDocs });
  r = await handleAction({ action: "live_push", keys: ["shop_rules/default/nope"] }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  check("khoá lạ: 400 INVALID, không gọi SET", r.status === 400 && r.json.error.code === "INVALID" && !w.rpcCalls.some((c) => c.body["@t"] === "LIVE_TUNE_SET"));
  r = await handleAction({ action: "live_push", keys: ["shop_rules/default/missing"] }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  check("dev null: 400 INVALID, không gọi SET", r.status === 400 && r.json.error.code === "INVALID" && !w.rpcCalls.some((c) => c.body["@t"] === "LIVE_TUNE_SET"));
  r = await handleAction({ action: "live_push", keys: [] }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  check("keys rỗng: 400", r.status === 400);

  // 6) upstream error mapping
  w = makeWorld({ liveItems: baseItems(), devDocs }); w.setError = "TUNE_NOT_HOT";
  r = await handleAction({ action: "live_push", keys: ["shop_rules/default/goldCap.normal"] }, { ...DEV, live: LIVE, email: "d@x.com" }, w.fetch);
  check("lỗi server event: 502 GAMESPARK kèm mã TUNE_NOT_HOT", r.status === 502 && r.json.error.code === "GAMESPARK" && /TUNE_NOT_HOT/.test(r.json.error.message), r.json.error && r.json.error.message);

  // 7) missing live env
  w = makeWorld({ liveItems: baseItems(), devDocs });
  for (const env of [{ ...DEV }, { ...DEV, live: { base: "", project: "", key: "", secret: "" } }]) {
    r = await handleAction({ action: "live" }, env, w.fetch);
    check("thiếu khoá LIVE: 503 LIVE_NOT_CONFIGURED", r.status === 503 && r.json.error.code === "LIVE_NOT_CONFIGURED" && /LIVE/.test(r.json.error.message));
  }
  check("thiếu khoá LIVE: không gọi mạng", w.rpcCalls.length === 0 && w.adminCalls.length === 0);
  r = await handleAction({ action: "guard" }, { ...DEV }, w.fetch);
  check("action khác vẫn chạy khi thiếu khoá LIVE", r.status === 200);

  console.log(failed ? `FAIL (${failed}/${total})` : `PASS ${total}/${total}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("✘ exception — " + e.stack); console.log("FAIL"); process.exit(1); });
