import { createServer } from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { getDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { clientOrigins, env } from "./env.js";
import { errorHandler } from "./lib/http.js";
import { initRealtime } from "./realtime.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { contactsRouter } from "./routes/contacts.js";
import { conversationsRouter } from "./routes/conversations.js";
import { devRouter } from "./routes/dev.js";
import { mediaRouter } from "./routes/media.js";
import { settingsRouter } from "./routes/settings.js";
import { webhookRouter } from "./routes/webhook.js";

const app = express();

app.use(cors({ origin: clientOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  const db = await getDb();
  res.json({ ok: true, driver: db.driver, whatsapp: env.WHATSAPP_DRIVER });
});

app.use("/api/auth", authRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/admin", adminRouter);
app.use("/api/dev", devRouter);
app.use("/api/whatsapp/webhook", webhookRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "Route not found" });
});

app.use(errorHandler);

const server = createServer(app);
initRealtime(server);

const ran = await runMigrations();
if (ran.length) console.log(`Migrations applied: ${ran.join(", ")}`);

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
server.listen(env.PORT, () => {
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
