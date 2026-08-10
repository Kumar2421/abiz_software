import path from "node:path";

import { getDb } from "./index.js";
import { migrations } from "./migrations.generated.js";

/**
 * Applies any migration not yet recorded in `schema_migrations`.
 *
 * The SQL is embedded at build time rather than read from disk, so this
 * behaves the same under tsx, from dist/, and inside a bundled serverless
 * function — none of which reliably ship the .sql directory.
 */
export async function runMigrations(): Promise<string[]> {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (
      await db.query<{ name: string }>("SELECT name FROM schema_migrations")
    ).map((row) => row.name),
  );

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await db.exec(migration.sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      migration.name,
    ]);
    ran.push(migration.name);
  }

  return ran;
}

// Allow `npm run migrate` as a standalone command.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const ran = await runMigrations();
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date.");
  const db = await getDb();
  await db.close();
}
