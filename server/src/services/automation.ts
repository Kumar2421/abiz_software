import { createHash, randomBytes } from "node:crypto";

import { query, queryOne } from "../db/index.js";
import { ApiError } from "../lib/http.js";
import {
  getOrCreateConversation,
  sendMessage,
  upsertContact,
} from "./messaging.js";
import { canSend, getSubscription } from "./billing.js";

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

const hashKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

export async function createApiKey(companyId: string, name: string) {
  // "abz_" prefix makes the key recognisable in logs and secret scanners.
  const key = `abz_${randomBytes(24).toString("base64url")}`;

  await query(
    `INSERT INTO api_keys (company_id, name, key_hash, key_prefix)
     VALUES ($1, $2, $3, $4)`,
    [companyId, name, hashKey(key), key.slice(0, 12)],
  );

  // Returned once and never recoverable — only the hash is stored.
  return key;
}

export async function listApiKeys(companyId: string) {
  return query(
    `SELECT id, name, key_prefix AS "keyPrefix", last_used_at AS "lastUsedAt",
            revoked_at AS "revokedAt", created_at AS "createdAt"
       FROM api_keys
      WHERE company_id = $1
      ORDER BY created_at DESC`,
    [companyId],
  );
}

export async function revokeApiKey(companyId: string, id: string) {
  const row = await queryOne<{ id: string }>(
    `UPDATE api_keys SET revoked_at = now()
      WHERE company_id = $1 AND id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [companyId, id],
  );
  if (!row) throw ApiError.notFound("API key not found");
}

/** Resolves a raw key to its company, or throws 401. */
export async function companyForApiKey(key: string): Promise<string> {
  const row = await queryOne<{ id: string; company_id: string }>(
    `SELECT id, company_id FROM api_keys
      WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashKey(key)],
  );
  if (!row) throw ApiError.unauthorized("Invalid API key");

  await query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [
    row.id,
  ]);
  return row.company_id;
}

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

export interface AutomationRow {
  id: string;
  kind: string;
  name: string;
  body: string;
  enabled: boolean;
}

export async function listAutomations(companyId: string) {
  return query<AutomationRow>(
    `SELECT id, kind, name, body, enabled FROM automations
      WHERE company_id = $1 ORDER BY kind, name`,
    [companyId],
  );
}

export async function upsertAutomation(
  companyId: string,
  input: { id?: string; kind: string; name: string; body: string; enabled: boolean },
) {
  if (input.id) {
    const row = await queryOne<AutomationRow>(
      `UPDATE automations
          SET name = $3, body = $4, enabled = $5, updated_at = now()
        WHERE company_id = $1 AND id = $2
        RETURNING id, kind, name, body, enabled`,
      [companyId, input.id, input.name, input.body, input.enabled],
    );
    if (!row) throw ApiError.notFound("Automation not found");
    return row;
  }

  const row = await queryOne<AutomationRow>(
    `INSERT INTO automations (company_id, kind, name, body, enabled)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, kind, name, body, enabled`,
    [companyId, input.kind, input.name, input.body, input.enabled],
  );
  return row!;
}

export async function deleteAutomation(companyId: string, id: string) {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM automations WHERE company_id = $1 AND id = $2 RETURNING id`,
    [companyId, id],
  );
  if (!row) throw ApiError.notFound("Automation not found");
}

/** Substitutes {{placeholders}}; anything unmatched is left visible. */
export function fillTemplate(
  body: string,
  values: Record<string, string | undefined>,
) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    values[key] ?? whole,
  );
}

/* ------------------------------------------------------------------ */
/* Triggering                                                          */
/* ------------------------------------------------------------------ */

export interface TriggerInput {
  phone: string;
  name?: string;
  /** Either a ready-made body, or an automation to fill in. */
  body?: string;
  automation?: string;
  variables?: Record<string, string>;
  /** ISO timestamp. Omit to send immediately. */
  sendAt?: string;
}

/**
 * The single entry point behind both the public API and the reminder UI:
 * resolve the contact, build the text, then either send now or queue it.
 */
export async function trigger(
  companyId: string,
  input: TriggerInput,
  options: { skipBillingCheck?: boolean } = {},
) {
  const subscription = await getSubscription(companyId);
  if (!options.skipBillingCheck && !canSend(subscription.status)) {
    throw new ApiError(
      402,
      "Subscription is not active, so automated messages are paused.",
      "subscription_required",
    );
  }

  const contact = await upsertContact(companyId, input.phone, input.name);
  const conversation = await getOrCreateConversation(companyId, contact.id);

  let body = input.body?.trim();

  if (!body && input.automation) {
    const automation = await queryOne<AutomationRow>(
      `SELECT id, kind, name, body, enabled FROM automations
        WHERE company_id = $1 AND (id::text = $2 OR kind = $2 OR lower(name) = lower($2))
        LIMIT 1`,
      [companyId, input.automation],
    );
    if (!automation) throw ApiError.notFound("Unknown automation");
    if (!automation.enabled) {
      throw ApiError.badRequest(`Automation "${automation.name}" is disabled`);
    }

    const company = await queryOne<{ name: string }>(
      `SELECT name FROM companies WHERE id = $1`,
      [companyId],
    );

    body = fillTemplate(automation.body, {
      customer_name: contact.name,
      company_name: company?.name,
      ...input.variables,
    });
  }

  if (!body) {
    throw ApiError.badRequest("Provide either `body` or `automation`");
  }

  if (input.sendAt) {
    const when = new Date(input.sendAt);
    if (Number.isNaN(when.getTime())) {
      throw ApiError.badRequest("sendAt must be an ISO timestamp");
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO scheduled_messages (company_id, conversation_id, body, send_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, conversation.id, body, when.toISOString()],
    );

    return {
      scheduled: true as const,
      id: row!.id,
      sendAt: when.toISOString(),
      conversationId: conversation.id,
    };
  }

  const message = await sendMessage(companyId, conversation.id, body);
  return { scheduled: false as const, message, conversationId: conversation.id };
}

/* ------------------------------------------------------------------ */
/* Scheduled queue                                                     */
/* ------------------------------------------------------------------ */

export async function listScheduled(companyId: string) {
  return query(
    `SELECT s.id, s.body, s.send_at AS "sendAt", s.status, s.error,
            s.conversation_id AS "conversationId",
            ct.name AS "contactName", ct.phone AS "contactPhone"
       FROM scheduled_messages s
       JOIN conversations c ON c.id = s.conversation_id
       JOIN contacts ct ON ct.id = c.contact_id
      WHERE s.company_id = $1
      ORDER BY s.send_at DESC
      LIMIT 200`,
    [companyId],
  );
}

export async function cancelScheduled(companyId: string, id: string) {
  const row = await queryOne<{ id: string }>(
    `UPDATE scheduled_messages SET status = 'cancelled', updated_at = now()
      WHERE company_id = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [companyId, id],
  );
  if (!row) throw ApiError.notFound("No pending message with that id");
}

interface DueRow {
  id: string;
  company_id: string;
  conversation_id: string;
  body: string;
}

/**
 * Sends everything that has come due. Safe to run concurrently: each row is
 * claimed with an atomic UPDATE ... RETURNING before any send happens, so two
 * overlapping cron ticks cannot deliver the same reminder twice.
 */
export async function runDueMessages(limit = 50) {
  const claimed = await query<DueRow>(
    `UPDATE scheduled_messages
        SET status = 'sent', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM scheduled_messages
         WHERE status = 'pending' AND send_at <= now()
         ORDER BY send_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, company_id, conversation_id, body`,
    [limit],
  );

  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    try {
      const subscription = await getSubscription(row.company_id);
      if (!canSend(subscription.status)) {
        throw new Error("Subscription inactive");
      }

      const message = await sendMessage(
        row.company_id,
        row.conversation_id,
        row.body,
      );
      await query(
        `UPDATE scheduled_messages SET message_id = $2, updated_at = now()
          WHERE id = $1`,
        [row.id, message.id],
      );
      sent++;
    } catch (error) {
      // Put it back only while retries remain, so a permanently broken row
      // does not loop forever.
      await query(
        `UPDATE scheduled_messages
            SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
                error = $2, updated_at = now()
          WHERE id = $1`,
        [row.id, error instanceof Error ? error.message : String(error)],
      );
      failed++;
    }
  }

  return { claimed: claimed.length, sent, failed };
}
