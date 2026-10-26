// rc-rpc entry (Deno, Supabase Edge). Copied verbatim into
// supabase/functions/rc-rpc/index.ts by tools/build-rpc.mjs.
//
// Auth and CORS live here so OPTIONS / 401 never pay for the Prisma cold start.
// The bundled original server code (rpc.bundle.js) is imported lazily.
import nodeProcess from "node:process";

// Prisma's runtime reads process.pid; Supabase Edge leaves it undefined.
// Must run BEFORE the Prisma runtime is imported (rpc.bundle.js imports it).
if (typeof (nodeProcess as { pid?: unknown }).pid !== "number") {
  try { Object.defineProperty(nodeProcess, "pid", { value: 1, configurable: true }); } catch { /* frozen */ }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const TOKEN_CACHE_MS = 60_000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-rc-error, server-timing",
};

interface HubUser {
  readonly id: string;
  readonly email?: string;
  readonly user_metadata?: Record<string, unknown>;
}

interface VerifiedToken {
  readonly user: HubUser;
  readonly sessionId: string;
  readonly until: number;
}

const tokenCache = new Map<string, VerifiedToken>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function verifyToken(token: string): Promise<VerifiedToken | null> {
  const key = await sha256Hex(token);
  const now = Date.now();
  const cached = tokenCache.get(key);
  if (cached && cached.until > now) return cached;
  if (cached) tokenCache.delete(key);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  const user = await res.json() as HubUser;
  // Decoded only after /auth/v1/user accepted the token, so the claims are trusted.
  const claims = jwtPayload(token);
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
  if (!user?.id || !sessionId) return null;
  const exp = typeof claims?.exp === "number" ? claims.exp * 1000 : now + TOKEN_CACHE_MS;
  const verified = { user, sessionId, until: Math.min(now + TOKEN_CACHE_MS, exp) };
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(key, verified);
  return verified;
}

// deno-lint-ignore no-explicit-any
let rpcModule: Promise<any> | null = null;
function loadRpc() {
  rpcModule ??= import("./rpc.bundle.js").catch((error) => {
    rpcModule = null;
    throw error;
  });
  return rpcModule;
}

function background(promise: Promise<unknown> | undefined): void {
  if (!promise) return;
  const guarded = promise.catch((error) => console.error("rc-rpc background work failed:", error));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
}

function terse(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[\r\n\t]+/g, " ").slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  // Player portraits: public, no auth (Ruffle loads them as plain images).
  const image = /\/profile-image\/(.+)$/.exec(path);
  if (image) {
    if (req.method !== "GET") return json({ ok: false, error: "not found" }, 404);
    try {
      const rpc = await loadRpc();
      const result = await rpc.handleProfileImage(image[1]);
      if (result.status === 200) {
        return new Response(result.png, {
          status: 200,
          headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=60" },
        });
      }
      if (result.status === 400) return json({ ok: false, error: result.text }, 400);
      return new Response(result.text, {
        status: 404,
        headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60" },
      });
    } catch (error) {
      console.error("rc-rpc profile image failed:", error);
      return json({ ok: false, error: "server error", detail: terse(error) }, 500);
    }
  }

  const social = /\/social-links(?:\/(.*))?$/.exec(path);
  const isMe = /\/me$/.test(path);
  if (social ? !(req.method === "POST" || (req.method === "GET" && social[1]))
    : !(req.method === "GET" && isMe) && !(req.method === "POST" && !isMe)) {
    return json({ ok: false, error: "not found" }, 404);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? "";
  let verified: VerifiedToken | null = null;
  try {
    verified = token ? await verifyToken(token) : null;
  } catch (error) {
    console.error("rc-rpc auth check failed:", error);
    return json({ ok: false, error: "auth service unavailable" }, 503);
  }

  // A social link page is public; only acting on it needs an account.
  if (social && (verified || req.method === "GET")) {
    try {
      const input = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const rpc = await loadRpc();
      const result = await rpc.handleSocial(verified?.user ?? null, verified?.sessionId ?? "", req.method, social[1] ?? "",
        input && typeof input === "object" ? input : {}, req);
      return json(result.body, result.status);
    } catch (error) {
      console.error("rc-rpc social link failed:", error);
      return json({ ok: false, error: "server error", detail: terse(error) }, 500);
    }
  }
  if (!verified) return json({ ok: false, error: "session expired" }, 401);

  try {
    const rpc = await loadRpc();
    if (isMe) {
      const me = await rpc.handleMe(verified.user, verified.sessionId, req);
      return json(me.body, me.status);
    }
    const body = new Uint8Array(await req.arrayBuffer());
    const result = await rpc.handleRpc(verified.user, verified.sessionId, body, req);
    background(result.background);
    if (result.status !== 200) return json(result.body, result.status);
    const headers: Record<string, string> = {
      ...CORS,
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    };
    if (result.error) headers["x-rc-error"] = terse(result.error);
    if (result.timing) headers["Server-Timing"] = result.timing;
    return new Response(result.response, { status: 200, headers });
  } catch (error) {
    console.error("rc-rpc request failed:", error);
    return json({ ok: false, error: "server error", detail: terse(error) }, 500);
  }
});
