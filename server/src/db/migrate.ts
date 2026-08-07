import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "./index.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

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

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    ran.push(file);
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
