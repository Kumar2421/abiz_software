import { query, queryOne } from "../db/index.js";
import { decryptSecret } from "../lib/crypto.js";
import { normalizePhone } from "../lib/phone.js";
import { getWhatsAppProvider } from "../providers/whatsapp.js";

export interface ConnectionState {
  status: "connected" | "pending" | "disconnected";
  verifiedName: string | null;
  qualityRating: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  displayNumber: string;
}

interface AccountRow {
  phone_number_id: string | null;
  access_token: string | null;
  display_number: string | null;
}

/**
 * Checks the stored credentials against Meta and writes the outcome.
 *
 * `connected` is only ever set by a successful Graph API response — it is
 * never inferred from the fields being filled in. Under the mock driver there
 * is nothing to ask, so the status stays `pending`.
 */
export async function checkConnection(
  companyId: string,
): Promise<ConnectionState> {
  const account = await queryOne<AccountRow>(
    `SELECT phone_number_id, access_token, display_number
       FROM whatsapp_accounts WHERE company_id = $1`,
    [companyId],
  );

  const accessToken = decryptSecret(account?.access_token ?? null);
  const missing = !account?.phone_number_id || !accessToken;

  if (missing) {
    return persist(companyId, {
      status: "disconnected",
      error: "Add a Phone Number ID and access token to connect.",
      displayNumber: account?.display_number ?? "",
    });
  }

  const result = await getWhatsAppProvider().verify({
    phoneNumberId: account.phone_number_id!,
    accessToken,
  });

  if (!result.ok) {
    return persist(companyId, {
      status: "disconnected",
      error: result.error ?? "Verification failed",
      displayNumber: account.display_number ?? "",
    });
  }

  return persist(companyId, {
    status: "connected",
    error: null,
    // Prefer Meta's copy of the number over whatever was typed in.
    displayNumber: result.displayNumber
      ? normalizePhone(result.displayNumber)
      : (account.display_number ?? ""),
    verifiedName: result.verifiedName ?? null,
    qualityRating: result.qualityRating ?? null,
  });
}

async function persist(
  companyId: string,
  values: {
    status: ConnectionState["status"];
    error: string | null;
    displayNumber: string;
    verifiedName?: string | null;
    qualityRating?: string | null;
  },
): Promise<ConnectionState> {
  // The demo driver cannot prove anything either way, so a failed check there
  // means "not verified yet" rather than "these credentials are wrong".
  const status =
    getWhatsAppProvider().name === "mock" && values.status === "disconnected"
      ? "pending"
      : values.status;

  const row = await queryOne<{ last_checked_at: string }>(
    `UPDATE whatsapp_accounts
        SET status = $2,
            last_error = $3,
            display_number = NULLIF($4, ''),
            verified_name = $5,
            quality_rating = $6,
            last_checked_at = now(),
            updated_at = now()
      WHERE company_id = $1
      RETURNING last_checked_at`,
    [
      companyId,
      status,
      values.error,
      values.displayNumber,
      values.verifiedName ?? null,
      values.qualityRating ?? null,
    ],
  );

  return {
    status,
    verifiedName: values.verifiedName ?? null,
    qualityRating: values.qualityRating ?? null,
    lastError: values.error,
    lastCheckedAt: row ? new Date(row.last_checked_at).toISOString() : null,
    displayNumber: values.displayNumber,
  };
}

/** Marks the connection live after Meta successfully calls the webhook back. */
export async function markWebhookVerified(companyId: string) {
  await query(
    `UPDATE whatsapp_accounts
        SET status = 'connected', last_error = NULL, last_checked_at = now(),
            updated_at = now()
      WHERE company_id = $1`,
    [companyId],
  );
}
