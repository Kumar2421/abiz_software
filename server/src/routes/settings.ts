import { Router } from "express";
import { z } from "zod";

import { query, queryOne } from "../db/index.js";
import { env } from "../env.js";
import { requireAuth } from "../lib/auth.js";
import { encryptSecret, secretHint } from "../lib/crypto.js";
import { asyncHandler, parseBody } from "../lib/http.js";
import { isValidPhone, normalizePhone } from "../lib/phone.js";
import { checkConnection } from "../services/connection.js";
import { companyStats } from "../services/messaging.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// Tokens are encrypted at rest; the browser only ever sees a "••••1234" hint.

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;

    const company = await queryOne<{ name: string; address: string | null }>(
      `SELECT name, address FROM companies WHERE id = $1`,
      [companyId],
    );
    const account = await queryOne<{
      display_number: string | null;
      phone_number_id: string | null;
      access_token: string | null;
      verify_token: string | null;
      status: "connected" | "pending" | "disconnected";
      verified_name: string | null;
      quality_rating: string | null;
      last_error: string | null;
      last_checked_at: string | null;
    }>(
      `SELECT display_number, phone_number_id, access_token, verify_token,
              status, verified_name, quality_rating, last_error, last_checked_at
         FROM whatsapp_accounts WHERE company_id = $1`,
      [companyId],
    );
    const welcome = await queryOne<{ enabled: boolean; body: string }>(
      `SELECT enabled, body FROM welcome_messages WHERE company_id = $1`,
      [companyId],
    );

    res.json({
      company: { name: company?.name ?? "", address: company?.address ?? "" },
      whatsapp: {
        displayNumber: account?.display_number ?? "",
        phoneNumberId: account?.phone_number_id ?? "",
        accessTokenHint: secretHint(account?.access_token ?? null),
        verifyToken: account?.verify_token ?? "",
        status: account?.status ?? "disconnected",
        verifiedName: account?.verified_name ?? null,
        qualityRating: account?.quality_rating ?? null,
        lastError: account?.last_error ?? null,
        lastCheckedAt: account?.last_checked_at
          ? new Date(account.last_checked_at).toISOString()
          : null,
      },
      welcome: { enabled: welcome?.enabled ?? false, body: welcome?.body ?? "" },
      profile: { name: req.user!.name, email: req.user!.email },
      // Tells the UI whether messages actually reach WhatsApp.
      driver: env.WHATSAPP_DRIVER,
    });
  }),
);

settingsRouter.put(
  "/company",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(120),
        address: z.string().trim().max(300).optional(),
      }),
      req.body,
    );

    await query(`UPDATE companies SET name = $2, address = $3 WHERE id = $1`, [
      req.user!.companyId,
      input.name,
      input.address ?? null,
    ]);
    res.json({ ok: true });
  }),
);

const whatsappSchema = z.object({
  displayNumber: z
    .string()
    .trim()
    .max(25)
    .optional()
    .refine((value) => !value || isValidPhone(value), {
      message: "Enter a valid WhatsApp number including its country code",
    }),
  // Meta Phone Number IDs are numeric strings, typically 15-16 digits.
  phoneNumberId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .refine((value) => !value || /^\d{5,32}$/.test(value), {
      message: "Phone Number ID must be the numeric ID from Meta, digits only",
    }),
  // Omit to keep the stored token; the client only ever sees the hint.
  accessToken: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .refine((value) => !value || value.length >= 20, {
      message: "That does not look like a Meta access token (too short)",
    }),
  verifyToken: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((value) => !value || /^[\w-]{8,}$/.test(value), {
      message:
        "Verify token must be at least 8 characters, letters, digits, _ or - only",
    }),
});

settingsRouter.put(
  "/whatsapp",
  asyncHandler(async (req, res) => {
    const input = parseBody(whatsappSchema, req.body);

    await query(
      `UPDATE whatsapp_accounts
          SET display_number = COALESCE($2, display_number),
              phone_number_id = COALESCE($3, phone_number_id),
              access_token = COALESCE($4, access_token),
              verify_token = COALESCE($5, verify_token),
              updated_at = now()
        WHERE company_id = $1`,
      [
        req.user!.companyId,
        input.displayNumber ? normalizePhone(input.displayNumber) : null,
        input.phoneNumberId ?? null,
        // Encrypted before it ever touches the database.
        input.accessToken ? encryptSecret(input.accessToken) : null,
        input.verifyToken ?? null,
      ],
    );

    // Status comes from an actual check, never from "the fields are filled in".
    const connection = await checkConnection(req.user!.companyId);
    res.json({ ok: true, connection });
  }),
);

/** Re-runs the credential check on demand ("Test connection"). */
settingsRouter.post(
  "/whatsapp/test",
  asyncHandler(async (req, res) => {
    res.json({ connection: await checkConnection(req.user!.companyId) });
  }),
);

settingsRouter.put(
  "/welcome",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        enabled: z.boolean(),
        body: z.string().trim().max(4096),
      }),
      req.body,
    );

    await query(
      `INSERT INTO welcome_messages (company_id, enabled, body)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id)
       DO UPDATE SET enabled = $2, body = $3, updated_at = now()`,
      [req.user!.companyId, input.enabled, input.body],
    );
    res.json({ ok: true });
  }),
);

settingsRouter.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({ name: z.string().trim().min(2).max(120) }),
      req.body,
    );
    await query(`UPDATE users SET name = $2 WHERE id = $1`, [
      req.user!.id,
      input.name,
    ]);
    res.json({ ok: true });
  }),
);

settingsRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await companyStats(req.user!.companyId);
    const account = await queryOne<{
      display_number: string | null;
      phone_number_id: string | null;
      status: "connected" | "pending" | "disconnected";
    }>(
      `SELECT display_number, phone_number_id, status
         FROM whatsapp_accounts WHERE company_id = $1`,
      [req.user!.companyId],
    );

    res.json({
      stats,
      whatsapp: {
        displayNumber: account?.display_number ?? "",
        phoneNumberId: account?.phone_number_id ?? "",
        status: account?.status ?? "disconnected",
      },
      driver: env.WHATSAPP_DRIVER,
    });
  }),
);
