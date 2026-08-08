import { app, ready } from "./app.js";
import { getDb } from "./db/index.js";
import { env } from "./env.js";

// Local / self-hosted entry point. On Netlify the same `app` is wrapped by
// netlify/functions/api.mts instead.

await ready();

// Seed in-process during development. Running `npm run seed` separately would
// open a second PGlite instance against the same data directory, which is not
// safe while the server holds it.
if (env.NODE_ENV === "development") {
  const { seedAdmin } = await import("./db/seed.js");
  const seeded = await seedAdmin();
  console.log(
    `Admin login: ${seeded.login} / ${seeded.password} (development only)`,
  );
}

const db = await getDb();
const server = app.listen(env.PORT, () => {
  console.log(
    `Abiz API on http://localhost:${env.PORT}  (db: ${db.driver}, whatsapp: ${env.WHATSAPP_DRIVER})`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
}
