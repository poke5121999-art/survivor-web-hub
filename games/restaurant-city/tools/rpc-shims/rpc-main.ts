// Bundle entry: maps a verified hub user to the original server's
// ActiveAccount and runs the ORIGINAL buildResponse (server/src/rpc/index.ts),
// the same way handleRpc in server/src/http-server.ts does.
// `@rc/...` resolves to the original server's src/ (see build-rpc.mjs).
import { randomBytes } from 'node:crypto';
import { buildResponse } from '@rc/rpc/index';
import { parseRequest } from '@rc/rpc/codec';
import { accountFromUsername, cleanUsername, hashSessionToken, type ActiveAccount } from '@rc/session';
import { ensureLoginAccount } from '@rc/db/profile-store';
import { recordLoginActivity, drainScheduledPlayerScans } from '@rc/moderation/service';
import { recordRpcActivity, rpcActivityBuffer } from '@rc/activity-buffer';
import { dueUtcDate, runDailyIngredientRotation } from '@rc/daily-ingredients/scheduler';
import { latestStoredImage } from '@rc/db/rpc-store';
import { encodeArgbPng } from 'rc-png:encoder';
import { prisma, queryStats } from './db-client';
import { ensureLiveEventTables, flushLiveEvents, prepareLiveEvents } from './live-events';

interface HubUser {
  readonly id: string;
  readonly email?: string;
  readonly user_metadata?: Record<string, unknown>;
}

interface ResultJson { readonly status: number; readonly body: unknown }

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_CACHE_MS = 60_000;
const MSG_POLL_EVENTS = 247;
const VIRTUAL_SERVER_ROOT = '/rc/server';

class AccountUnavailable extends Error {}

// ---- per-isolate lazy startup work -------------------------------------------

let startup: Promise<void> | null = null;
let rotatedFor = '';
let rotation: Promise<void> | null = null;

function ensureStartup(): Promise<void> {
  startup ??= ensureLiveEventTables().catch((error) => {
    startup = null;
    throw error;
  });
  return startup;
}

/**
 * The original runs the daily ingredient rotation from a noon-UTC timer
 * (startDailyIngredientScheduler). Here the first request per isolate per UTC
 * day after noon runs the same idempotent rotation (it reconciles an existing
 * day instead of rerolling). ensureEconomyCatalog already runs lazily inside
 * rpc-store's economyCatalog().
 */
async function ensureDailyRotation(): Promise<void> {
  const due = dueUtcDate(new Date());
  if (!due || due === rotatedFor) return;
  rotation ??= runDailyIngredientRotation(VIRTUAL_SERVER_ROOT, undefined)
    .then(() => { rotatedFor = due; })
    .catch((error) => console.error('Daily ingredient rotation failed:', error))
    .finally(() => { rotation = null; });
  await rotation;
}

// ---- hub user -> rc."Account" + rc."Session" ----------------------------------

const accountCache = new Map<string, { account: ActiveAccount; until: number }>();

function displayNameOf(user: HubUser): string {
  const meta = user.user_metadata ?? {};
  for (const key of ['display_name', 'full_name', 'name', 'user_name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return (user.email ?? '').split('@')[0] ?? '';
}

/** Fold a hub display name into the original's username alphabet ([A-Za-z0-9_.-], 3-24). */
function usernameBase(raw: string): string {
  let name = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  name = name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '').replace(/_+/g, '_');
  name = name.replace(/^[_.-]+|[_.-]+$/g, '').slice(0, 24);
  if (name.length < 3) name = `${name}${name ? '_' : ''}Chef`.slice(0, 24);
  return name;
}

function* usernameCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; n <= 99; n += 1) {
    const suffix = `_${n}`;
    yield `${base.slice(0, 24 - suffix.length)}${suffix}`;
  }
  for (let i = 0; i < 20; i += 1) {
    const suffix = `_${randomBytes(3).toString('hex')}`;
    yield `${base.slice(0, 24 - suffix.length)}${suffix}`;
  }
}

function personName(raw: string, fallback: string): { firstName: string; lastName: string } {
  const clean = raw.replace(/[^\p{L}\p{M}' -]/gu, ' ').trim().replace(/\s+/g, ' ').slice(0, 50);
  const parts = (clean || fallback).split(' ');
  const firstName = (parts.shift() || fallback).slice(0, 50);
  const lastName = (parts.join(' ') || firstName).slice(0, 50);
  return { firstName, lastName };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}

function toActiveAccount(account: { id: string; username: string; firstName: string; lastName: string; networkUid: string; playfishUid: number; role: string; pinEnabled: boolean }, csrfToken: string, sessionId: string): ActiveAccount {
  return { id: account.id, username: account.username, firstName: account.firstName, lastName: account.lastName, networkUid: account.networkUid, playfishUid: account.playfishUid, role: account.role, pinEnabled: account.pinEnabled, csrfToken, sessionId };
}

async function createAccount(user: HubUser) {
  const display = displayNameOf(user);
  const base = cleanUsername(usernameBase(display));
  const { firstName, lastName } = personName(display, base);
  for (const candidate of usernameCandidates(base)) {
    const username = cleanUsername(candidate);
    const usernameKey = username.toLocaleLowerCase('en-US');
    // The original derives the PlayFish identity from the username (FNV-1a).
    const identity = accountFromUsername(username);
    const [taken, profile] = await Promise.all([
      prisma.account.findFirst({
        where: { OR: [{ usernameKey }, { networkUid: identity.networkUid }, { playfishUid: identity.playfishUid }] },
        select: { id: true },
      }),
      prisma.userProfile.findUnique({ where: { networkUid: identity.networkUid }, select: { id: true } }),
    ]);
    if (taken || profile) continue;
    try {
      return await prisma.account.create({
        data: {
          id: user.id, username, usernameKey, firstName, lastName,
          // Hub accounts sign in through Supabase; the PIN path stays closed
          // (same as the original's Discord-only accounts).
          pinHash: randomBytes(32).toString('hex'), pinSalt: randomBytes(16).toString('hex'), pinEnabled: false,
          networkUid: identity.networkUid, playfishUid: identity.playfishUid, lastLoginAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.account.findUnique({ where: { id: user.id } });
      if (raced) return raced;
    }
  }
  throw new Error('no free username for this hub account');
}

async function resolveAccount(user: HubUser, sessionId: string, req: Request): Promise<{ account: ActiveAccount; created: boolean }> {
  const key = `${user.id}|${sessionId}`;
  const cached = accountCache.get(key);
  if (cached && cached.until > Date.now()) return { account: cached.account, created: false };

  let created = false;
  let row = await prisma.account.findUnique({ where: { id: user.id } });
  if (!row) {
    row = await createAccount(user);
    created = true;
  }
  if (row.disabled) throw new AccountUnavailable('account disabled');

  const now = Date.now();
  let session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (session && session.accountId !== row.id) throw new AccountUnavailable('session belongs to another account');
  if (!session) {
    try {
      session = await prisma.session.create({
        data: {
          id: sessionId,
          tokenHash: hashSessionToken(sessionId),
          csrfToken: randomBytes(24).toString('base64url'),
          accountId: row.id,
          expiresAt: new Date(now + SESSION_MS),
          ipAddress: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 100),
          userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
        },
      });
      await prisma.account.update({ where: { id: row.id }, data: { lastLoginAt: new Date() } });
      await recordLoginActivity({ id: row.id, networkUid: row.networkUid });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    }
  } else if (now - session.lastSeenAt.getTime() > 5 * 60 * 1000 || session.expiresAt.getTime() - now < SESSION_MS / 2) {
    // A valid hub token keeps the row alive (the original refreshes lastSeenAt every 5 min).
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(now + SESSION_MS) } }).catch(() => undefined);
  }

  const account = toActiveAccount(row, session.csrfToken, session.id);
  if (accountCache.size > 5000) accountCache.clear();
  accountCache.set(key, { account, until: now + ACCOUNT_CACHE_MS });
  return { account, created };
}

function requestPolls(body: Buffer): boolean {
  try {
    const req = parseRequest(body);
    if (req.msgType === MSG_POLL_EVENTS) return true;
    return Boolean(req.subs?.some((sub) => sub.msgType === MSG_POLL_EVENTS));
  } catch {
    return false;
  }
}

function backgroundWork(): Promise<unknown> {
  return Promise.allSettled([
    rpcActivityBuffer.flushDue(),
    drainScheduledPlayerScans(25_000),
  ]);
}

// ---- handlers used by index.ts -------------------------------------------------

export async function handleMe(user: HubUser, sessionId: string, req: Request): Promise<ResultJson> {
  try {
    await ensureStartup();
    const { account } = await resolveAccount(user, sessionId, req);
    // Same call the original makes after login/signup: ensures the profile exists.
    await ensureLoginAccount(account);
    return { status: 200, body: { ok: true, username: account.username, networkUid: account.networkUid, playfishUid: account.playfishUid } };
  } catch (error) {
    if (error instanceof AccountUnavailable) return { status: 403, body: { ok: false, error: error.message } };
    throw error;
  }
}

export async function handleRpc(user: HubUser, sessionId: string, bytes: Uint8Array, req: Request): Promise<
  { status: 200; response: Uint8Array; error?: string; timing: string; background: Promise<unknown> } | (ResultJson & { background?: undefined })
> {
  const t0 = performance.now();
  const q0 = queryStats.count;
  const marks: string[] = [];
  let last = t0;
  const mark = (name: string) => { const now = performance.now(); marks.push(`${name};dur=${Math.round(now - last)}`); last = now; };
  await ensureStartup();
  let account: ActiveAccount;
  let created: boolean;
  try {
    ({ account, created } = await resolveAccount(user, sessionId, req));
  } catch (error) {
    if (error instanceof AccountUnavailable) return { status: 403, body: { ok: false, error: error.message } };
    throw error;
  }
  if (created) await ensureLoginAccount(account);
  await ensureDailyRotation();
  recordRpcActivity(account);
  mark('account');

  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (requestPolls(body)) await prepareLiveEvents(account);
  mark('prepare');

  let response: Buffer;
  let error: string | undefined;
  try {
    const result = await buildResponse(body, account);
    response = result.response;
    if (result.summary.error) error = result.summary.error;
  } catch (caught) {
    // Same fallback as handleRpc in the original http-server.ts.
    response = Buffer.from([0, 0, 0]);
    error = caught instanceof Error ? caught.message : String(caught);
  }
  mark('build');
  // Mail notifications must be durable before the sender sees its reply.
  try {
    await flushLiveEvents();
  } catch (caught) {
    console.error('Live event flush failed:', caught);
    error ??= `live events: ${caught instanceof Error ? caught.message : String(caught)}`;
  }
  mark('flush');
  marks.push(`queries;desc="${queryStats.count - q0}"`);
  return { status: 200, response: new Uint8Array(response.buffer, response.byteOffset, response.byteLength), error, timing: marks.join(', '), background: backgroundWork() };
}

/**
 * GET .../rc-rpc/profile-image/<uid>/<type>.png, no auth (Ruffle loads it as a
 * plain image). Same lookup + PNG as handleProfileImage in the original
 * http-server.ts (/__api/profile-image/<uid>/<type>.png).
 */
export async function handleProfileImage(rest: string): Promise<
  { status: 200; png: Uint8Array } | { status: 400 | 404; text: string }
> {
  const parts = rest.split('/').filter(Boolean);
  let networkUid = '';
  try { networkUid = decodeURIComponent(parts[0] || ''); } catch { networkUid = ''; }
  const imageType = Number.parseInt((parts[1] || '').replace(/\.png$/i, ''), 10);
  if (!networkUid || !Number.isInteger(imageType)) return { status: 400, text: 'invalid image path' };
  const image = await latestStoredImage(networkUid, imageType);
  if (!image) return { status: 404, text: 'not found' };
  const png = encodeArgbPng(image.data, image.width, image.height);
  return { status: 200, png: new Uint8Array(png.buffer, png.byteOffset, png.byteLength) };
}
