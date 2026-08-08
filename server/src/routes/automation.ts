import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../lib/auth.js";
import { ApiError, asyncHandler, parseBody } from "../lib/http.js";
import { isValidPhone } from "../lib/phone.js";
import {
  cancelScheduled,
  companyForApiKey,
  createApiKey,
  deleteAutomation,
  listApiKeys,
  listAutomations,
  listScheduled,
  revokeApiKey,
  runDueMessages,
  trigger,
  upsertAutomation,
} from "../services/automation.js";
import { env } from "../env.js";

export const automationRouter = Router();

/* ------------------------------------------------------------------ */
/* Public API for the business's own website/backend (spec section 4)  */
/* ------------------------------------------------------------------ */

const triggerSchema = z.object({
  phone: z.string().trim().min(6).max(25),
  name: z.string().trim().max(120).optional(),
  body: z.string().trim().max(4096).optional(),
  automation: z.string().trim().max(120).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  sendAt: z.string().datetime().optional(),
});

/**
 * Authenticated by `Authorization: Bearer abz_…` rather than a session cookie,
 * because the caller is a server, not a browser. Mounted outside the session
 * routes for that reason.
 */
automationRouter.post(
  "/v1/messages",
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization ?? "";
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!key) throw ApiError.unauthorized("Provide an API key");

    const companyId = await companyForApiKey(key);
    const input = parseBody(triggerSchema, req.body);

    if (!isValidPhone(input.phone)) {
      throw ApiError.badRequest("Enter a valid phone number with country code");
    }

    res.status(202).json(await trigger(companyId, input));
  }),
);

/* ------------------------------------------------------------------ */
/* Cron: drain the scheduled queue                                     */
/* ------------------------------------------------------------------ */

/**
 * Called by a scheduler (Netlify Scheduled Function, cron, uptime pinger).
 * Guarded by a shared secret so it cannot be triggered by the public.
 */
automationRouter.post(
  "/cron/run-scheduled",
  asyncHandler(async (req, res) => {
    if (!env.CRON_SECRET) {
      throw ApiError.forbidden("CRON_SECRET is not configured");
    }
    const provided =
      req.header("x-cron-secret") ??
      (req.headers.authorization ?? "").replace(/^Bearer /, "");

    if (provided !== env.CRON_SECRET) {
      throw ApiError.unauthorized("Bad cron secret");
    }

    res.json(await runDueMessages());
  }),
);

/* ------------------------------------------------------------------ */
/* Dashboard routes                                                    */
/* ------------------------------------------------------------------ */

automationRouter.use(requireAuth);

automationRouter.get(
  "/automations",
  asyncHandler(async (req, res) => {
    res.json({ automations: await listAutomations(req.user!.companyId) });
  }),
);

automationRouter.put(
  "/automations",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        id: z.uuid().optional(),
        kind: z
          .enum(["appointment_reminder", "payment_reminder", "custom"])
          .default("custom"),
        name: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(4096),
        enabled: z.boolean().default(true),
      }),
      req.body,
    );
    res.json({ automation: await upsertAutomation(req.user!.companyId, input) });
  }),
);

automationRouter.delete(
  "/automations/:id",
  asyncHandler(async (req, res) => {
    await deleteAutomation(req.user!.companyId, String(req.params.id));
    res.json({ ok: true });
  }),
);

/** Schedule a reminder from the dashboard. */
automationRouter.post(
  "/scheduled",
  asyncHandler(async (req, res) => {
    const input = parseBody(triggerSchema, req.body);
    if (!isValidPhone(input.phone)) {
      throw ApiError.badRequest("Enter a valid phone number with country code");
    }
    res.status(201).json(
      await trigger(req.user!.companyId, input, {
        skipBillingCheck: req.user!.role === "admin",
      }),
    );
  }),
);

automationRouter.get(
  "/scheduled",
  asyncHandler(async (req, res) => {
    res.json({ scheduled: await listScheduled(req.user!.companyId) });
  }),
);

automationRouter.delete(
  "/scheduled/:id",
  asyncHandler(async (req, res) => {
    await cancelScheduled(req.user!.companyId, String(req.params.id));
    res.json({ ok: true });
  }),
);

/* ---------------- API keys ---------------- */

automationRouter.get(
  "/api-keys",
  asyncHandler(async (req, res) => {
    res.json({ keys: await listApiKeys(req.user!.companyId) });
  }),
);

automationRouter.post(
  "/api-keys",
  asyncHandler(async (req, res) => {
    const { name } = parseBody(
      z.object({ name: z.string().trim().min(1).max(80) }),
      req.body,
    );
    // The plaintext key is returned exactly once; only its hash is stored.
    const key = await createApiKey(req.user!.companyId, name);
    res.status(201).json({ key });
  }),
);

automationRouter.delete(
  "/api-keys/:id",
  asyncHandler(async (req, res) => {
    await revokeApiKey(req.user!.companyId, String(req.params.id));
    res.json({ ok: true });
  }),
);
