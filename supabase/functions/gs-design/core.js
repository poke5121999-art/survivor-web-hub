// Proxy logic shared by the Supabase Edge shell (Deno) and the local dev server (Node).
// Web-standard APIs only. No auth here: callers authenticate before handleAction.

export const KNOWN = [
  "wallet_start", "crew", "tactics", "upgrade", "passives", "gacha_banners", "gacha_rules",
  "shop_packs", "shop_rules", "shop_exchange", "loadout", "quests", "maps", "run_reward",
  "stage_houses", "stage_rules", "extract_quota", "loot_cap", "loot_sizes", "loot_materials",
  "loot_items", "safes_chests", "station_upgrades", "station_gear", "station_healthpacks",
  "station_vehicles", "station_rules", "gacha_wheel", "foes", "run_timers",
  "endless_rules", "rank_rewards", "endless_seasons",
  "coop_rules", "modes",
];

const MAX_BODY_BYTES = 400 * 1024;
const QUERY_LIMIT = 50;
const MAX_DOCS = 2000;
const enc = new TextEncoder();

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

// Mongo Extended JSON numbers to plain JSON numbers.
export function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (!isPlain(v)) return v;
  const keys = Object.keys(v);
  if (keys.length === 1) {
    const k = keys[0];
    if (k === "$numberInt" || k === "$numberDouble" || k === "$numberLong" || k === "$numberDecimal") {
      return Number(v[k]);
    }
  }
  const out = {};
  for (const k of keys) out[k] = normalize(v[k]);
  return out;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isPlain(v)) return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
  return out;
}

export async function hashDocs(docs) {
  const sorted = [...docs].sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  return sha256hex(JSON.stringify(sorted.map(sortKeys)));
}

const fail = (status, code, message, extra = {}) => ({
  status,
  json: { ok: false, error: { code, message }, ...extra },
});

class UpstreamError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeClient(env, fetchImpl) {
  const prefix = `/admin/api/projects/${env.project}`;
  return async function call(sub, bodyObj) {
    const path = prefix + sub;
    const body = JSON.stringify(bodyObj);
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = hex(crypto.getRandomValues(new Uint8Array(12)));
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(env.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const msg = `${path}\n${ts}\n${nonce}\n${await sha256hex(body)}`;
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    let res;
    try {
      res = await fetchImpl(env.base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GS-Key": env.key, "X-GS-Ts": ts, "X-GS-Nonce": nonce, "X-GS-Sign": b64,
        },
        body,
      });
    } catch (e) {
      throw new UpstreamError(0, "UNREACHABLE", `không gọi được GameSpark: ${e.message}`);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON upstream body */ }
    if (!res.ok || !json || json.ok === false) {
      const e = json && json.error;
      throw new UpstreamError(res.status, (e && e.code) || "HTTP_" + res.status,
        (e && e.message) || text.slice(0, 300));
    }
    return json;
  };
}

// A missing table queries as an empty list, so "exists" means "has docs".
async function readTable(call, table) {
  // The server caps limit at 50 whatever we ask, so page with skip until hasMore is false.
  const raw = [];
  for (;;) {
    const r = await call("/data/query", { collection: "md_" + table, limit: QUERY_LIMIT, skip: raw.length });
    raw.push(...(r.docs || []));
    if (!r.hasMore || !(r.docs || []).length) break;
    if (raw.length >= MAX_DOCS) throw new UpstreamError(200, "TOO_MANY_DOCS", `bảng ${table} có hơn ${MAX_DOCS} dòng`);
  }
  // Server-stamped bookkeeping fields are not designer data and would break hash round trips.
  const docs = normalize(raw).map(({ _createdAt, _updatedAt, ...rest }) => rest);
  return { exists: docs.length > 0, docs, hash: await hashDocs(docs) };
}

function validateDocs(docs) {
  if (!Array.isArray(docs)) return "docs không phải mảng";
  const seen = new Set();
  const badKey = (v) => {
    if (Array.isArray(v)) return v.some(badKey);
    if (!isPlain(v)) return false;
    return Object.keys(v).some((k) => k.startsWith("$") || badKey(v[k]));
  };
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!isPlain(d)) return `dòng ${i} không phải object`;
    if (typeof d._id !== "string" || d._id === "") return `dòng ${i} thiếu _id kiểu chuỗi`;
    if (seen.has(d._id)) return `_id "${d._id}" bị trùng`;
    seen.add(d._id);
    if (badKey(d)) return `dòng "${d._id}" có khóa bắt đầu bằng $`;
  }
  if (enc.encode(JSON.stringify(docs)).length > MAX_BODY_BYTES) return "docs vượt 400 KB";
  return null;
}

const NET_BACKENDS = ["ngo", "rtd", "steam"];

const MODE_IDS = ["coop", "pvp", "endless_solo", "endless_coop"];

const TABLE_RULES = {
  coop_rules: (d) => (NET_BACKENDS.includes(d.netBackend) ? null
    : `Mạng co-op "${d.netBackend}" không hợp lệ, chỉ nhận ngo, rtd hoặc steam.`),
  modes: (d) => (!MODE_IDS.includes(d._id) ? `Chế độ "${d._id}" không hợp lệ, chỉ nhận ${MODE_IDS.join(", ")}.`
    : typeof d.open !== "boolean" ? `Giá trị open của "${d._id}" là ${JSON.stringify(d.open)}, phải là true hoặc false.` : null),
};

function checkTable(table, docs) {
  const rule = TABLE_RULES[table];
  if (!rule) return null;
  for (const d of docs) {
    const bad = rule(d);
    if (bad) return bad;
  }
  return null;
}

function localInserts(docs) {
  return {
    changes: docs.map((d) => ({ op: "insert", _id: d._id })),
    counts: { insert: docs.length, update: 0, delete: 0, unchanged: 0 },
  };
}

async function doSave(call, body) {
  const { table, docs, baseHash } = body;
  const bad = validateDocs(docs);
  if (bad) return fail(400, "INVALID", bad);
  const badRule = checkTable(table, docs);
  if (badRule) return fail(400, "INVALID", badRule);
  if (typeof baseHash !== "string") return fail(400, "INVALID", "thiếu baseHash");
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    return fail(400, "INVALID", "dryRun không phải boolean");
  }
  const dryRun = body.dryRun !== false; // omitted means the safe mode

  const current = await readTable(call, table);
  if (current.hash !== baseHash) {
    return fail(409, "CONFLICT", "Bảng vừa được sửa ở nơi khác.", { current });
  }
  if (dryRun && !current.exists) {
    return { status: 200, json: { ok: true, applied: false, dryRun: true, ...localInserts(docs), hash: current.hash } };
  }
  if (!dryRun && !current.exists) {
    try {
      await call("/data/collections", { name: table, kind: "metadata" });
    } catch (e) {
      // 409 is fine when the name is an empty metadata table; when a runtime (cd_) collection owns the
      // logical name, sync could never succeed, so surface the platform's own explanation.
      if (!(e instanceof UpstreamError) || e.status !== 409) throw e;
      if (!/loại metadata/.test(e.message)) return fail(409, "NAME_TAKEN", e.message);
    }
  }
  const r = await call("/data/sync", { collection: "md_" + table, docs, dryRun });
  return {
    status: 200,
    json: {
      ok: true, applied: !dryRun && r.applied !== false, dryRun,
      changes: r.changes || [], counts: r.counts || {},
      hash: dryRun ? current.hash : await hashDocs(docs),
    },
  };
}

export async function handleAction(body, env, fetchImpl = fetch) {
  if (!isPlain(body)) return fail(400, "INVALID", "body không phải object JSON");
  if (!["list", "get", "save"].includes(body.action)) {
    return fail(400, "INVALID", `action "${body.action}" không hợp lệ`);
  }
  if (body.action !== "list" && !KNOWN.includes(body.table)) {
    return fail(400, "INVALID", `bảng "${body.table}" không nằm trong danh sách`);
  }
  const call = makeClient(env, fetchImpl);
  try {
    if (body.action === "list") {
      const rows = await Promise.all(KNOWN.map((t) => readTable(call, t)));
      const tables = {};
      KNOWN.forEach((t, i) => {
        tables[t] = rows[i];
      });
      return { status: 200, json: { ok: true, project: env.project, env: "dev", tables } };
    }
    if (body.action === "get") {
      const t = await readTable(call, body.table);
      return { status: 200, json: { ok: true, table: body.table, ...t } };
    }
    return await doSave(call, body);
  } catch (e) {
    if (e instanceof UpstreamError) {
      return fail(502, "GAMESPARK", `GameSpark lỗi ${e.code}: ${e.message}`,
        { upstream: { status: e.status, code: e.code, message: e.message } });
    }
    throw e;
  }
}
