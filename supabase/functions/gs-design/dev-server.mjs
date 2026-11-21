// Local only: no auth, CORS *, bound to 127.0.0.1. Never expose this.
import http from "node:http";
import { readFileSync } from "node:fs";
import { handleAction } from "./core.js";

const creds = JSON.parse(readFileSync(process.env.USERPROFILE + "/.hlo-gs/credentials", "utf8"));
const env = creds.credentials.find((c) => c.project === "repo-2d-topdown");
if (!env) { console.error("không thấy project repo-2d-topdown trong credentials"); process.exit(1); }

// Optional LIVE server key for the "Đẩy LIVE" actions; without it they answer 503 LIVE_NOT_CONFIGURED.
env.email = process.env.DESIGNER_EMAIL || "dev-server@local";
env.live = { base: process.env.GS_LIVE_BASE || "", project: process.env.GS_LIVE_PROJECT || "",
  key: process.env.GS_LIVE_SERVER_KEY || "", secret: process.env.GS_LIVE_SERVER_SECRET || "" };

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
