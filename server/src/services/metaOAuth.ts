import { randomBytes } from "node:crypto";

import { query, queryOne } from "../db/index.js";
import { env } from "../env.js";

/**
 * Facebook Login for Business / Embedded Signup token exchange.
 *
 * This is deliberately separate from `providers/whatsapp.ts` (which sends
 * messages once credentials exist) and from `services/connection.ts` (which
 * checks whatever credentials are already stored). This file's only job is
 * turning an OAuth `code` into the long-lived credentials that the other two
 * then use — same as if they had been typed into Settings by hand.
 */

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

export class MetaOAuthNotConfigured extends Error {
  constructor() {
    super(
      "Facebook Login is not configured yet. Set META_APP_ID, META_APP_SECRET " +
        "and META_OAUTH_REDIRECT_URI once the Meta Developer App exists.",
    );
  }
}

function requireConfig() {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_OAUTH_REDIRECT_URI) {
    throw new MetaOAuthNotConfigured();
  }
  return {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_OAUTH_REDIRECT_URI,
  };
}

/** CSRF guard for the OAuth round-trip. Expires quickly — the whole flow is one browser session. */
const STATE_TTL_MINUTES = 15;

export async function createOAuthState(companyId: string): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  await query(
    `INSERT INTO meta_oauth_states (state, company_id, expires_at)
     VALUES ($1, $2, now() + interval '${STATE_TTL_MINUTES} minutes')`,
    [state, companyId],
  );
  return state;
}

/** Consumes the state token; a state can only ever be used once. */
export async function consumeOAuthState(state: string): Promise<string | null> {
  const row = await queryOne<{ company_id: string }>(
    `DELETE FROM meta_oauth_states
      WHERE state = $1 AND expires_at > now()
      RETURNING company_id`,
    [state],
  );
  return row?.company_id ?? null;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
}

/** Step 1: short-lived user token from the OAuth `code`. Valid ~1-2 hours. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const { appId, appSecret, redirectUri } = requireConfig();

  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error?.message ?? `Meta rejected the OAuth code (HTTP ${response.status})`,
    );
  }
  return payload.access_token;
}

/**
 * Step 2: trade the short-lived token for a long-lived one (~60 days).
 *
 * A 60-day token still expires — fine for launch, but the honest long-term
 * answer is a System User token (does not expire) created once manually in
 * Business Settings. Flagged here rather than silently left as a gap:
 * revisit before this has been live 60 days unattended.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
  const { appId, appSecret } = requireConfig();

  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url);
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error?.message ??
        `Meta rejected the token exchange (HTTP ${response.status})`,
    );
  }
  return {
    accessToken: payload.access_token,
    expiresInSeconds: payload.expires_in ?? null,
  };
}

interface OnboardingData {
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  displayNumber: string | null;
  verifiedName: string | null;
}

/**
 * Embedded Signup's client-side callback hands back a `waba_id` and
 * `phone_number_id` directly (via the SDK's message event) — the route layer
 * passes those straight through here rather than this function guessing at
 * them from the Graph API, since Meta already gave the authoritative values.
 * This function's job is just confirming they're real and pulling the
 * display fields, using the same call `connection.ts` already trusts.
 */
export async function fetchOnboardingData(params: {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}): Promise<OnboardingData> {
  const url =
    `${GRAPH}/${params.phoneNumberId}` +
    `?fields=display_phone_number,verified_name`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  const payload = (await response.json()) as {
    display_phone_number?: string;
    verified_name?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Could not confirm the connected number (HTTP ${response.status})`,
    );
  }

  // The business portfolio id isn't always returned by the phone-number
  // lookup; leave it null rather than making a second speculative call the
  // signup flow doesn't otherwise need.
  return {
    wabaId: params.wabaId,
    phoneNumberId: params.phoneNumberId,
    businessId: null,
    displayNumber: payload.display_phone_number ?? null,
    verifiedName: payload.verified_name ?? null,
  };
}

/**
 * Subscribes Abiz's app to the WABA's message events, replacing the manual
 * "Configuration → Edit → Verify and save → Manage → subscribe" steps in
 * Meta-Setup-Guide.md Part 4. One authenticated POST does what those five
 * manual clicks did.
 */
export async function subscribeToWebhook(params: {
  accessToken: string;
  wabaId: string;
}): Promise<void> {
  const response = await fetch(
    `${GRAPH}/${params.wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
    },
  );
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(
      payload.error?.message ??
        `Could not subscribe to WhatsApp events (HTTP ${response.status})`,
    );
  }
}
