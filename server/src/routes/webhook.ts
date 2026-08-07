import { Router } from "express";

import { query, queryOne } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";
import { markWebhookVerified } from "../services/connection.js";
import { applyStatusUpdate, receiveMessage } from "../services/messaging.js";

export const webhookRouter = Router();

async function log(
  companyId: string | null,
  eventType: string,
  payload: unknown,
  error?: string,
) {
  await query(
    `INSERT INTO webhook_logs (company_id, event_type, payload, error)
     VALUES ($1, $2, $3, $4)`,
    [companyId, eventType, JSON.stringify(payload ?? null), error ?? null],
  );
}

/** Meta's subscription handshake. */
webhookRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode !== "subscribe" || typeof token !== "string") {
      await log(null, "verify.rejected", req.query, "Bad mode or token");
      res.sendStatus(403);
      return;
    }

    const account = await queryOne<{ company_id: string }>(
      `SELECT company_id FROM whatsapp_accounts WHERE verify_token = $1`,
      [token],
    );

    if (!account) {
      await log(null, "verify.rejected", req.query, "Unknown verify token");
      res.sendStatus(403);
      return;
    }

    // Meta reached us with the right token, so the webhook side is live.
    await markWebhookVerified(account.company_id);
    await log(account.company_id, "verify.ok", req.query);

    res.type("text/plain").send(String(challenge ?? ""));
  }),
);

interface CloudPayload {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }[];
        statuses?: {
          id?: string;
          status?: string;
          errors?: { title?: string }[];
        }[];
      };
    }[];
  }[];
}

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

/**
 * Always answers 200 — Meta retries aggressively on any non-200, so failures
 * are recorded in `webhook_logs` instead of being surfaced as HTTP errors.
 */
webhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.sendStatus(200);

    const payload = req.body as CloudPayload;

    try {
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const phoneNumberId = value?.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          const account = await queryOne<{ company_id: string }>(
            `SELECT company_id FROM whatsapp_accounts WHERE phone_number_id = $1`,
            [phoneNumberId],
          );
          if (!account) {
            await log(null, "message.unrouted", value, "Unknown phone_number_id");
            continue;
          }

          for (const message of value?.messages ?? []) {
            if (message.type !== "text" || !message.from) continue;

            const profileName = value?.contacts?.find(
              (contact) => contact.wa_id === message.from,
            )?.profile?.name;

            await receiveMessage({
              companyId: account.company_id,
              fromPhone: message.from,
              body: message.text?.body ?? "",
              profileName,
              waMessageId: message.id,
            });
          }

          for (const status of value?.statuses ?? []) {
            const mapped = STATUS_MAP[status.status ?? ""];
            if (!mapped || !status.id) continue;
            await applyStatusUpdate(
              account.company_id,
              status.id,
              mapped,
              status.errors?.[0]?.title,
            );
          }

          await log(account.company_id, "message.received", value);
        }
      }
    } catch (error) {
      await log(
        null,
        "webhook.error",
        payload,
        error instanceof Error ? error.message : String(error),
      );
    }
  }),
);
