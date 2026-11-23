import { handleAction } from "./core.js";

const ALLOWED_ORIGIN = "https://poke5121999-art.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin !== null && (origin === ALLOWED_ORIGIN || LOCAL_ORIGIN.test(origin));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(status: number, json: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, err("INVALID", "chỉ nhận POST"), cors);

  const need = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "GS_BASE", "GS_PROJECT", "GS_KEY", "GS_SECRET", "DESIGNER_EMAILS"];
  for (const n of need) {
    if (!Deno.env.get(n)) return reply(500, err("CONFIG", `thiếu biến môi trường ${n}`), cors);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, err("UNAUTHENTICATED", "thiếu token đăng nhập"), cors);
  let email = "";
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    if (!r.ok) return reply(401, err("UNAUTHENTICATED", "token đăng nhập không hợp lệ"), cors);
    email = String((await r.json()).email ?? "").toLowerCase();
  } catch (e) {
    return reply(401, err("UNAUTHENTICATED", `không xác thực được token: ${(e as Error).message}`), cors);
  }
  const designers = Deno.env.get("DESIGNER_EMAILS")!.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !designers.includes(email)) {
    return reply(403, err("NOT_DESIGNER", "tài khoản này không có quyền sửa số liệu"), cors);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return reply(400, err("INVALID", "body không phải JSON"), cors); }

  try {
    const { status, json } = await handleAction(body, {
      base: Deno.env.get("GS_BASE")!, project: Deno.env.get("GS_PROJECT")!,
      key: Deno.env.get("GS_KEY")!, secret: Deno.env.get("GS_SECRET")!,
    });
    return reply(status, json, cors);
  } catch (e) {
    return reply(500, err("INTERNAL", (e as Error).message), cors);
  }
});
