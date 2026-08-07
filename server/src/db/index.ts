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

async function createPostgres(connectionString: string): Promise<Database> {
  const pg = await import("pg");
  const pool = new pg.default.Pool({
    connectionString,
    // Managed Postgres (Supabase/Neon) terminates TLS with its own CA.
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
    max: 10,
  });

  return {
    driver: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
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
  instance = env.DATABASE_URL
    ? await createPostgres(env.DATABASE_URL)
    : await createPglite();
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
