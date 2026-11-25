// Local only: no auth, CORS *, bound to 127.0.0.1. Never expose this.
import http from "node:http";
import { readFileSync } from "node:fs";
import { handleAction } from "./core.js";

const creds = JSON.parse(readFileSync(process.env.USERPROFILE + "/.hlo-gs/credentials", "utf8"));
const env = creds.credentials.find((c) => c.project === "repo-2d-topdown");
if (!env) { console.error("không thấy project repo-2d-topdown trong credentials"); process.exit(1); }
// Client keys for the page's player path (LIVE_CONFIG_*): DEV from the game's GameSparkSettings.asset, LIVE from
// ~/.keys/gamespark-live.txt (key=, secret=). EVENT_LIVE_TARGET=dev points the page's "LIVE" at DEV, to test that path on DEV.
function devClient() {
  try {
    const a = readFileSync(process.env.GS_ASSET || "D:/REPO_Meta/repo-client/Assets/Resources/GameSparkSettings.asset", "utf8");
    const f = (n) => a.split(/\r?\n/).find((l) => l.trim().startsWith(n + ":")).split(":").slice(1).join(":").trim().replace(/^'|'$/g, "");
    return { base: "https://gamespark-dev.hlo.vn", project: "repo-2d-topdown", apiKey: f("apiKey"), apiSecret: f("apiSecret") };
  } catch { return null; }
}
function liveClient() {
  try {
    const t = readFileSync(process.env.USERPROFILE + "/.keys/gamespark-live.txt", "utf8");
    const g = (k) => (t.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1].trim();
    return { base: "https://gamespark.hlo.vn", project: "repo-2d-topdown", apiKey: g("key"), apiSecret: g("secret") };
  } catch { return null; }
}
const dev = devClient();
env.eventTargets = {};
if (dev) env.eventTargets.dev = dev;
const live = process.env.EVENT_LIVE_TARGET === "dev" ? dev && { ...dev, testOnDev: true } : liveClient();
if (live) env.eventTargets.live = live;
env.actorLabel = process.env.ACTOR_LABEL || "dev-server";
env.envName = "dev";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const send = (res, status, json) => {
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify(json));
};
const invalid = (message) => ({ ok: false, error: { code: "INVALID", message } });

const port = Number(process.env.PORT) || 8787;
http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method !== "POST") return send(res, 405, invalid("chỉ nhận POST"));
  let raw = "";
  for await (const c of req) raw += c;
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, invalid("body không phải JSON")); }
  try {
    const { status, json } = await handleAction(body, env);
    send(res, status, json);
  } catch (e) {
    send(res, 500, { ok: false, error: { code: "INTERNAL", message: e.message } });
  }
}).listen(port, "127.0.0.1", () => console.log("gs-design dev server http://127.0.0.1:" + port));
