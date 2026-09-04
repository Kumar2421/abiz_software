import { Router } from "express";
import { z } from "zod";

import { query } from "../db/index.js";
import { requireAuth } from "../lib/auth.js";
import { encryptSecret } from "../lib/crypto.js";
import { ApiError, asyncHandler, parseBody } from "../lib/http.js";
import { normalizePhone } from "../lib/phone.js";
import { checkConnection } from "../services/connection.js";
import {
  consumeOAuthState,
  createOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchOnboardingData,
  generateRegistrationPin,
  registerPhoneNumber,
  subscribeToWebhook,
} from "../services/metaOAuth.js";

export const metaAuthRouter = Router();

/**
 * Starts the Embedded Signup flow. The frontend calls this first to get a
 * state token bound to the logged-in company, then hands that state to the
 * Meta SDK's FB.login() call alongside the config id.
 */
metaAuthRouter.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await createOAuthState(req.user!.companyId);
    res.json({ state });
  }),
);

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  // Handed back by the Embedded Signup SDK's message event alongside the
  // OAuth code — see Meta's Embedded Signup docs, "Getting the WABA ID and
  // Phone Number ID". Not something the OAuth code itself encodes.
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  businessId: z.string().optional(),
});

/**
 * Completes Embedded Signup: exchanges the code, confirms the connected
 * number, subscribes to webhooks, and stores everything the same way the
 * manual Settings form does — so `providers/whatsapp.ts` and
 * `services/connection.ts` don't need to know or care which path was used.
 */
metaAuthRouter.post(
  "/callback",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(callbackSchema, req.body);

    const companyId = await consumeOAuthState(input.state);
    if (!companyId || companyId !== req.user!.companyId) {
      throw ApiError.badRequest(
        "This connection attempt expired or does not match your account. Try again.",
      );
    }

    const shortLivedToken = await exchangeCodeForToken(input.code);
    const { accessToken } = await exchangeForLongLivedToken(shortLivedToken);

    const onboarding = await fetchOnboardingData({
      accessToken,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
    });

    // Best-effort: a failed subscribe should not lose the connection itself —
    // `checkConnection` below will still show it as connected, and the
    // webhook can be retried from Settings without redoing the whole OAuth
    // dance. Surface it as a warning, not a thrown error.
    let webhookWarning: string | null = null;
    try {
      await subscribeToWebhook({ accessToken, wabaId: input.wabaId });
    } catch (error) {
      webhookWarning =
        error instanceof Error ? error.message : "Could not subscribe to webhook events";
    }

    // Register the number for Cloud API. Without this the connection looks
    // healthy and every send fails, so a genuine failure here is reported
    // rather than swallowed — but "already registered" is fine to continue on.
    const pin = generateRegistrationPin();
    const registration = await registerPhoneNumber({
      accessToken,
      phoneNumberId: onboarding.phoneNumberId,
      pin,
    });

    const registrationWarning = registration.ok
      ? null
      : registration.alreadyRegistered
        ? null
        : registration.reason;

    await query(
      `UPDATE whatsapp_accounts
          SET phone_number_id   = $2,
              access_token      = $3,
              waba_id           = $4,
              business_id       = $5,
              fb_user_id        = $6,
              onboarding_method = 'embedded_signup',
              display_number    = COALESCE($7, display_number),
              verified_name     = COALESCE($8, verified_name),
              registration_pin  = COALESCE($9, registration_pin),
              registered_at     = CASE WHEN $10 THEN now() ELSE registered_at END,
              registration_note = $11,
              updated_at        = now()
        WHERE company_id = $1`,
      [
        companyId,
        onboarding.phoneNumberId,
        encryptSecret(accessToken),
        onboarding.wabaId,
        input.businessId ?? null,
        req.user!.id,
        onboarding.displayNumber ? normalizePhone(onboarding.displayNumber) : null,
        onboarding.verifiedName,
        // Only overwrite the stored PIN when this registration actually used it.
        registration.ok ? encryptSecret(pin) : null,
        registration.ok || (!registration.ok && registration.alreadyRegistered),
        registration.ok ? null : registration.reason,
      ],
    );

    const connection = await checkConnection(companyId);
    res.json({ ok: true, connection, webhookWarning, registrationWarning });
  }),
);
