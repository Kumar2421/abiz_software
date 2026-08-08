import { env } from "../env.js";

/**
 * One tiny query surface over two Postgres backends:
 *
 *  - PGlite  — embedded Postgres, used when DATABASE_URL is unset. Local dev
 *              needs no install and no container.
 *  - node-pg — real Postgres (Supabase / Neon / RDS) when DATABASE_URL is set.
 *
 * Both speak the same SQL and the same $1 placeholders, so nothing above this
 * file knows which one is running.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
}

export interface Database extends Queryable {
  /** Runs a multi-statement SQL script (migrations). No parameters. */
  exec(sql: string): Promise<void>;
  /** Runs `fn` inside BEGIN/COMMIT, rolling back on any thrown error. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: "pglite" | "postgres";
}

let instance: Database | null = null;

async function createPglite(): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");

  const dataDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.data/pgdata",
  );
  // PGlite only creates the leaf directory, not its parents.
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dataDir, { recursive: true });

  const client = await PGlite.create(dataDir);

  const run = async <T>(sql: string, params: unknown[] = []) => {
    const result = await client.query<T>(sql, params as unknown[]);
    return result.rows;
  };

  return {
    driver: "pglite",
    query: run,
    async exec(sql: string) {
      await client.exec(sql);
    },
    // PGlite runs on a single connection, so plain BEGIN/COMMIT is safe here.
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      await client.exec("BEGIN");
      try {
        const result = await fn({ query: run });
        await client.exec("COMMIT");
        return result;
      } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      await client.close();
    },
  };
}

/**
 * Network hiccups that say nothing about the query itself — a DNS blip or a
 * dropped socket. Retrying these keeps a transient failure from surfacing as a
 * 500 on someone's login.
 */
const TRANSIENT = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

/**
 * Some pg failures arrive as a plain Error with no `code` — a pooled socket
 * that the server had already closed, or a connect that timed out. They are
 * just as transient, so they are matched on message instead.
 */
const TRANSIENT_MESSAGES = [
  "connection terminated",
  "connection timeout",
  "server closed the connection",
  "terminating connection",
  "connection ended unexpectedly",
  "socket hang up",
];

function isTransient(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && TRANSIENT.has(code)) return true;

  const message = (error as { message?: string })?.message?.toLowerCase() ?? "";
  return TRANSIENT_MESSAGES.some((needle) => message.includes(needle));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isTransient(error)) throw error;
      lastError = error;
      // 200ms, 600ms, 1.8s — enough for a dropped socket to be replaced and a
      // fresh TLS handshake to complete across regions.
      await sleep(200 * 3 ** attempt);
    }
  }
  throw lastError;
}

async function createPostgres(connectionString: string): Promise<Database> {
  const pg = await import("pg");
  const dns = await import("node:dns");

  // Supabase's pooler hostname resolves on both families; preferring IPv4
  // avoids AAAA lookups that fail on IPv4-only networks.
  dns.setDefaultResultOrder("ipv4first");

  const pool = new pg.default.Pool({
    connectionString,
    // Managed Postgres (Supabase/Neon) terminates TLS with its own CA.
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
    // Each serverless invocation gets its own sandbox, so a large pool per
    // instance multiplies into hundreds of Postgres connections. Keep it tiny
    // there and use the provider's pooled connection string.
    max: process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 10,
    // Shorter than the pooler's own idle cutoff, so we drop sockets before it
    // does. Holding them longer meant pg handing out connections the server
    // had already closed.
    idleTimeoutMillis: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    // The Supabase project is in ap-southeast-2; a first connect from India
    // needs more headroom than the 10s default allowed.
    connectionTimeoutMillis: 20_000,
  });

  // A dead idle socket must not take the process down.
  pool.on("error", (error) => {
    console.error("Idle Postgres client error:", (error as Error).message);
  });

  return {
    driver: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await withRetry(() => pool.query(sql, params as unknown[]));
      return result.rows as T[];
    },
    async exec(sql: string) {
      await withRetry(() => pool.query(sql));
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await client.query(sql, params as unknown[]);
            return res.rows as R[];
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

export async function getDb(): Promise<Database> {
  if (instance) return instance;

  if (!env.DATABASE_URL) {
    // PGlite writes to a local directory. Serverless sandboxes have no durable
    // disk, so every cold start would come up with an empty database and
    // concurrent invocations would each see their own copy. Fail loudly rather
    // than silently losing data.
    if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      throw new Error(
        "DATABASE_URL is required in a serverless environment. " +
          "PGlite needs a persistent disk; point this at Neon, Supabase, or another hosted Postgres.",
      );
    }
    instance = await createPglite();
    return instance;
  }

  instance = await createPostgres(env.DATABASE_URL);
  return instance;
}

/** Convenience: run a query and return the first row (or null). */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const db = await getDb();
  const rows = await db.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.query<T>(sql, params);
}
