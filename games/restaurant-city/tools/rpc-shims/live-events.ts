// Replaces server/src/live-events.ts. The original keeps online users and their
// event queues in process memory; edge isolates come and go and do not share
// memory, so the queue lives in Postgres (rc.rc_live_online, rc.rc_live_event).
//
// The exported functions keep their original synchronous signatures, so the
// original rpc-store / system-mail code calls them unchanged:
//   - before a request that contains pollEvents, rpc-main awaits
//     prepareLiveEvents(account): the caller's queue is loaded into memory;
//   - pollLiveEvents / touchOnline / enqueue* then work on memory and record
//     what changed;
//   - after buildResponse, rpc-main awaits flushLiveEvents(), which writes the
//     recorded changes (acks, queued->inflight, new mail events) to Postgres
//     before the reply leaves, so a recipient's next pollEvents sees the mail.
import { prisma } from './db-client';
import type { ActiveAccount } from '@rc/session';

export const LIVE_EVENT_ALERT = 1;
export const LIVE_EVENT_MAIL = 2;

export interface LiveEvent {
  readonly id: number;
  readonly type: number;
  readonly body: Buffer;
}

export interface OnlineUser {
  readonly username: string;
  readonly networkUid: string;
  readonly playfishUid: number;
  readonly lastSeenUnix: number;
  readonly pendingEvents: number;
  readonly inflightEvents: number;
}

interface UserEvents {
  readonly account: ActiveAccount;
  lastSeenMs: number;
  readonly queued: LiveEvent[];
  readonly inflight: Map<number, LiveEvent>;
}

// Original: 45 s with a 5 s poll. The edge tells clients to poll every 60 s
// (rpc-store patch in build-rpc.mjs), so "online" must outlive one interval.
const ONLINE_TTL_SECONDS = 150;
const MAX_EVENTS_PER_POLL = 10;
const EVENT_RETENTION = '1 day';
const RETENTION_SWEEP_MS = 10 * 60_000;
let lastRetentionSweep = 0;

type Op =
  | { kind: 'touch'; account: ActiveAccount }
  | { kind: 'ack'; networkUid: string; ids: number[] }
  | { kind: 'inflight'; networkUid: string; ids: number[] }
  | { kind: 'event'; networkUid: string; type: number; body: Buffer }
  | { kind: 'mail'; networkUid: string; mailType: number }
  | { kind: 'global'; type: number; body: Buffer }
  | { kind: 'disconnect'; networkUid: string };

const users = new Map<string, UserEvents>();
let pending: Op[] = [];
let tablesReady: Promise<void> | null = null;

export function ensureLiveEventTables(): Promise<void> {
  tablesReady ??= (async () => {
    await prisma.$executeRawUnsafe(`create table if not exists rc.rc_live_online (
      network_uid text primary key,
      username text not null default '',
      playfish_uid bigint not null default 0,
      last_seen timestamptz not null default now())`);
    await prisma.$executeRawUnsafe(`create table if not exists rc.rc_live_event (
      id bigserial primary key,
      network_uid text not null,
      type integer not null,
      body_hex text not null default '',
      inflight boolean not null default false,
      created_at timestamptz not null default now())`);
    await prisma.$executeRawUnsafe('create index if not exists rc_live_event_uid_idx on rc.rc_live_event (network_uid, id)');
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

/** Load the caller's queue so the synchronous pollLiveEvents can serve it. */
export async function prepareLiveEvents(account: ActiveAccount): Promise<void> {
  await ensureLiveEventTables();
  const uid = account.networkUid;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint | number; type: number; body_hex: string; inflight: boolean; fresh: boolean }>>(
    `select e.id, e.type, e.body_hex, e.inflight,
       coalesce((select o.last_seen > now() - make_interval(secs => ${ONLINE_TTL_SECONDS})
                 from rc.rc_live_online o where o.network_uid = $1), false) as fresh
     from rc.rc_live_event e where e.network_uid = $1 order by e.id`, uid);
  const entry: UserEvents = { account, lastSeenMs: Date.now(), queued: [], inflight: new Map() };
  users.set(uid, entry);
  if (rows.length > 0 && !rows[0].fresh) {
    // Original drops an offline user's whole entry (queue included).
    await prisma.$executeRawUnsafe('delete from rc.rc_live_event where network_uid = $1', uid);
    return;
  }
  for (const row of rows) {
    const event = { id: Number(row.id), type: Number(row.type), body: Buffer.from(row.body_hex, 'hex') };
    if (row.inflight) entry.inflight.set(event.id, event);
    else entry.queued.push(event);
  }
}

/** Persist what the request changed. Await before replying. */
export async function flushLiveEvents(): Promise<void> {
  if (pending.length === 0) return;
  await ensureLiveEventTables();
  const ops = pending;
  pending = [];
  const touched = new Set<string>();
  for (const op of ops) {
    switch (op.kind) {
      case 'touch':
        if (touched.has(op.account.networkUid)) break;
        touched.add(op.account.networkUid);
        await prisma.$executeRawUnsafe(
          `insert into rc.rc_live_online (network_uid, username, playfish_uid, last_seen) values ($1, $2, $3, now())
           on conflict (network_uid) do update set username = excluded.username, playfish_uid = excluded.playfish_uid, last_seen = now()`,
          op.account.networkUid, op.account.username, op.account.playfishUid);
        users.delete(op.account.networkUid);
        break;
      case 'ack':
        if (op.ids.length) {
          await prisma.$executeRawUnsafe(
            'delete from rc.rc_live_event where network_uid = $1 and id = any($2::bigint[])', op.networkUid, op.ids);
        }
        break;
      case 'inflight':
        if (op.ids.length) {
          await prisma.$executeRawUnsafe(
            'update rc.rc_live_event set inflight = true where network_uid = $1 and id = any($2::bigint[])', op.networkUid, op.ids);
        }
        break;
      case 'event':
        await prisma.$executeRawUnsafe(
          `insert into rc.rc_live_event (network_uid, type, body_hex)
           select $1, $2, $3 where exists (select 1 from rc.rc_live_online
             where network_uid = $1 and last_seen > now() - make_interval(secs => ${ONLINE_TTL_SECONDS}))`,
          op.networkUid, op.type, op.body.toString('hex'));
        break;
      case 'global':
        await prisma.$executeRawUnsafe(
          `insert into rc.rc_live_event (network_uid, type, body_hex)
           select network_uid, $1, $2 from rc.rc_live_online where last_seen > now() - make_interval(secs => ${ONLINE_TTL_SECONDS})`,
          op.type, op.body.toString('hex'));
        break;
      case 'mail':
        await persistLiveMail(op.networkUid, op.mailType);
        break;
      case 'disconnect':
        await prisma.$executeRawUnsafe('delete from rc.rc_live_event where network_uid = $1', op.networkUid);
        await prisma.$executeRawUnsafe('delete from rc.rc_live_online where network_uid = $1', op.networkUid);
        break;
    }
  }
  if (Date.now() - lastRetentionSweep > RETENTION_SWEEP_MS) {
    lastRetentionSweep = Date.now();
    await prisma.$executeRawUnsafe(`delete from rc.rc_live_event where created_at < now() - interval '${EVENT_RETENTION}'`);
  }
}

async function persistLiveMail(networkUid: string, mailType: number): Promise<void> {
  const online = await prisma.$queryRawUnsafe<Array<{ ok: number }>>(
    `select 1 as ok from rc.rc_live_online where network_uid = $1 and last_seen > now() - make_interval(secs => ${ONLINE_TTL_SECONDS})`, networkUid);
  if (!online[0]) return;
  const type = mailType & 0xff;
  // Same collapse rule as the original enqueueLiveMail: one queued MAIL event
  // per user; keep a popup-producing type when any queued mail needs it.
  const queued = await prisma.$queryRawUnsafe<Array<{ id: bigint | number; body_hex: string }>>(
    'select id, body_hex from rc.rc_live_event where network_uid = $1 and type = $2 and not inflight order by id limit 1',
    networkUid, LIVE_EVENT_MAIL);
  const existing = queued[0];
  if (existing) {
    const queuedType = Buffer.from(existing.body_hex, 'hex')[0] ?? 0;
    if (mailNeedsStartupPopup(type) || !mailNeedsStartupPopup(queuedType)) {
      await prisma.$executeRawUnsafe('update rc.rc_live_event set body_hex = $2 where id = $1',
        Number(existing.id), Buffer.from([type]).toString('hex'));
    }
    return;
  }
  await prisma.$executeRawUnsafe('insert into rc.rc_live_event (network_uid, type, body_hex) values ($1, $2, $3)',
    networkUid, LIVE_EVENT_MAIL, Buffer.from([type]).toString('hex'));
}

export function touchOnline(account: ActiveAccount): void {
  pending.push({ kind: 'touch', account });
  const existing = users.get(account.networkUid);
  if (existing) {
    existing.lastSeenMs = Date.now();
    return;
  }
  users.set(account.networkUid, { account, lastSeenMs: Date.now(), queued: [], inflight: new Map() });
}

/** Best effort: users this isolate has seen recently (admin-only in the original). */
export function listOnlineUsers(): OnlineUser[] {
  const cutoff = Date.now() - ONLINE_TTL_SECONDS * 1000;
  return [...users.values()]
    .filter((entry) => entry.lastSeenMs >= cutoff)
    .sort((a, b) => a.account.username.localeCompare(b.account.username))
    .map((entry) => ({
      ...entry.account,
      lastSeenUnix: Math.floor(entry.lastSeenMs / 1000),
      pendingEvents: entry.queued.length,
      inflightEvents: entry.inflight.size,
    }));
}

export function pollLiveEvents(account: ActiveAccount, ackEventIds: readonly number[]): LiveEvent[] {
  touchOnline(account);
  const entry = users.get(account.networkUid);
  if (!entry) return [];

  const acked: number[] = [];
  for (const id of ackEventIds) {
    if (entry.inflight.delete(id)) acked.push(id);
  }
  const moved: number[] = [];
  while (entry.queued.length > 0 && entry.inflight.size < MAX_EVENTS_PER_POLL) {
    const event = entry.queued.shift();
    if (event) {
      entry.inflight.set(event.id, event);
      moved.push(event.id);
    }
  }
  pending.push({ kind: 'ack', networkUid: account.networkUid, ids: acked });
  pending.push({ kind: 'inflight', networkUid: account.networkUid, ids: moved });
  return [...entry.inflight.values()].slice(0, MAX_EVENTS_PER_POLL);
}

export function enqueueLiveEvent(networkUid: string, type: number, body: Buffer): boolean {
  pending.push({ kind: 'event', networkUid, type, body: Buffer.from(body) });
  return true;
}

export function enqueueGlobalLiveEvent(type: number, body: Buffer): number {
  pending.push({ kind: 'global', type, body: Buffer.from(body) });
  return listOnlineUsers().length;
}

/** Remove the online/event state after a moderation kick or ban. */
export function disconnectOnlineUser(networkUid: string): boolean {
  pending.push({ kind: 'disconnect', networkUid });
  return users.delete(networkUid);
}

/** Notify an online client that its authoritative mailbox changed. */
export function enqueueLiveMail(networkUid: string, mailType: number): boolean {
  pending.push({ kind: 'mail', networkUid, mailType });
  return true;
}

function mailNeedsStartupPopup(mailType: number): boolean {
  return mailType === 5 || mailType === 10 || mailType === 11 || mailType === 13;
}
