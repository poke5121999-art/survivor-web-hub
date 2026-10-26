// Replaces server/src/db/client.ts in the edge bundle: the same `prisma`
// singleton, but built from the Deno-generated client (generated/client.ts)
// against the hub Postgres, schema "rc". No pool monitor, no SQLite path.
//
// Do NOT pass a pg.Pool instance: the adapter would get a different copy of
// `pg` than the one it was built with and every query fails ECONNREFUSED.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

const DB_URL = Deno.env.get('SUPABASE_DB_URL');
if (!DB_URL) throw new Error('SUPABASE_DB_URL is not set');

export const databaseProvider = 'PostgreSQL';

const STATEMENT_TIMEOUT_MS = 30_000;
// One isolate serves several concurrent requests; a saveProfile holds one
// connection for its interactive transaction while other calls keep reading.
const POOL_MAX = 4;

const adapter = new PrismaPg({
  connectionString: DB_URL,
  max: POOL_MAX,
  options: '-c search_path=rc',
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: STATEMENT_TIMEOUT_MS + 5_000,
  application_name: 'rc-rpc-edge',
}, { schema: 'rc' });

// Same transaction bounds as the original client.ts.
export const prisma = new PrismaClient({
  adapter,
  transactionOptions: { maxWait: 15_000, timeout: 30_000 },
  log: [{ emit: 'event', level: 'query' }],
});

/** Isolate-wide query counter, read by rpc-main for the Server-Timing header. */
export const queryStats = { count: 0, ms: 0 };
(prisma as unknown as { $on(event: 'query', cb: (e: { duration: number }) => void): void })
  .$on('query', (e) => { queryStats.count += 1; queryStats.ms += Number(e.duration) || 0; });

export function databasePoolSnapshot() {
  return {
    provider: 'PostgreSQL' as const,
    max: POOL_MAX, total: 0, idle: 0, waiting: 0, errors: 0, lastError: '',
    waitingHighWater: 0, saturatedSamples: 0, lastSaturatedAt: '', consecutiveSaturatedSamples: 0,
  };
}
