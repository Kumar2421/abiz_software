import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { getDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { clientOrigins, env } from "./env.js";
import { errorHandler } from "./lib/http.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";
import { contactsRouter } from "./routes/contacts.js";
import { conversationsRouter } from "./routes/conversations.js";
import { devRouter } from "./routes/dev.js";
import { mediaRouter } from "./routes/media.js";
import { settingsRouter } from "./routes/settings.js";
import { webhookRouter } from "./routes/webhook.js";

export const app = express();

app.use(cors({ origin: clientOrigins, credentials: true }));

app.use(
  express.json({
    limit: "1mb",
    // Razorpay signs the exact bytes it sent, so the webhook needs them before
    // parsing replaces the body with an object.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  const db = await getDb();
  res.json({ ok: true, driver: db.driver, whatsapp: env.WHATSAPP_DRIVER });
});

app.use("/api/auth", authRouter);
app.use("/api/billing", billingRouter);
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

/**
 * Migrations run once per process. In a serverless function that means once
 * per cold start; the runner skips everything already applied, so warm
 * invocations pay nothing and concurrent cold starts stay safe (each statement
 * is `IF NOT EXISTS` and the applied set is tracked in `schema_migrations`).
 */
let readyPromise: Promise<void> | null = null;

export function ready(): Promise<void> {
  readyPromise ??= (async () => {
    const ran = await runMigrations();
    if (ran.length) console.log(`Migrations applied: ${ran.join(", ")}`);
  })();
  return readyPromise;
}
