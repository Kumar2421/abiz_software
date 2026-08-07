import { getDb, queryOne } from "./index.js";
import { runMigrations } from "./migrate.js";
import { env } from "../env.js";
import { hashPassword } from "../lib/auth.js";

/**
 * Creates the local admin account from SEED_ADMIN_LOGIN / SEED_ADMIN_PASSWORD.
 *
 * The defaults are deliberately weak so local development is easy. That is
 * only acceptable because this script refuses to run in production — never
 * seed a deployed database with them.
 */
const ADMIN_LOGIN = env.SEED_ADMIN_LOGIN;
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD;
const COMPANY_NAME = env.SEED_COMPANY_NAME;

const DEFAULT_WELCOME = `Hi 👋

Thank you for contacting {{company_name}}. Contact {{phone}} if you need more details.

We have received your message and will reply as soon as possible.`;

export async function seedAdmin() {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed the default admin account in production. " +
        "Register a real account instead.",
    );
  }

  await runMigrations();

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [ADMIN_LOGIN],
  );

  if (existing) {
    // Reset the password so the documented credentials always work locally.
    await queryOne(
      `UPDATE users SET password_hash = $2, role = 'admin', status = 'active' WHERE id = $1`,
      [existing.id, await hashPassword(ADMIN_PASSWORD)],
    );
    return { created: false, login: ADMIN_LOGIN, password: ADMIN_PASSWORD };
  }

  const db = await getDb();
  await db.transaction(async (tx) => {
    const [company] = await tx.query<{ id: string }>(
      `INSERT INTO companies (name, address)
       VALUES ($1, $2) RETURNING id`,
      [COMPANY_NAME, "12 MG Road, Bengaluru"],
    );

    await tx.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [
        company!.id,
        "Abiz Admin",
        ADMIN_LOGIN,
        await hashPassword(ADMIN_PASSWORD),
      ],
    );

    await tx.query(`INSERT INTO whatsapp_accounts (company_id) VALUES ($1)`, [
      company!.id,
    ]);
    await tx.query(
      `INSERT INTO welcome_messages (company_id, body) VALUES ($1, $2)`,
      [company!.id, DEFAULT_WELCOME],
    );
  });

  return { created: true, login: ADMIN_LOGIN, password: ADMIN_PASSWORD };
}

// Standalone `npm run seed`. Stop the dev server first when using PGlite —
// two instances must not share one data directory.
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  const result = await seedAdmin();
  console.log(
    `${result.created ? "Created" : "Updated"} admin account: ` +
      `${result.login} / ${result.password}`,
  );
  const db = await getDb();
  await db.close();
}
