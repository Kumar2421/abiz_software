import { Router } from "express";

import { query, queryOne } from "../db/index.js";
import { decryptSecret } from "../lib/crypto.js";
import { asyncHandler } from "../lib/http.js";
import { getWhatsAppProvider } from "../providers/whatsapp.js";
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

interface MediaPart {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

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
          image?: MediaPart;
          video?: MediaPart;
          audio?: MediaPart;
          document?: MediaPart;
          sticker?: MediaPart;
          location?: { latitude?: number; longitude?: number; name?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
          referral?: Record<string, unknown>;
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

type InboundMessage = NonNullable<
  NonNullable<
    NonNullable<CloudPayload["entry"]>[number]["changes"]
  >[number]["value"]
>["messages"];

type Inbound = NonNullable<InboundMessage>[number];

/** The attachment on a message, whichever media field carries it. */
function mediaPart(message: Inbound): MediaPart | undefined {
  return (
    message.image ??
    message.video ??
    message.audio ??
    message.document ??
    message.sticker
  );
}

/**
 * Readable text for any inbound type. Media captions come through as the body;
 * locations and button taps become a short description so the thread still
 * reads sensibly instead of showing an empty bubble.
 */
function bodyOf(message: Inbound): string {
  if (message.text?.body) return message.text.body;

  const part = mediaPart(message);
  if (part?.caption) return part.caption;

  if (message.location) {
    const { latitude, longitude, name } = message.location;
    return name ?? `Location: ${latitude}, ${longitude}`;
  }

  if (message.button?.text) return message.button.text;

  const interactive =
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;
  if (interactive) return interactive;

  // Unsupported type (contacts, reaction, order, …): keep a placeholder so the
  // conversation shows that something arrived.
  return part ? "" : `[${message.type ?? "unsupported"} message]`;
}

async function downloadInbound(companyId: string, part: MediaPart) {
  const account = await queryOne<{ access_token: string | null }>(
    `SELECT access_token FROM whatsapp_accounts WHERE company_id = $1`,
    [companyId],
  );
  const accessToken = decryptSecret(account?.access_token ?? null);
  if (!accessToken) throw new Error("No access token stored for this company");

  const { buffer, mimeType } = await getWhatsAppProvider().fetchMedia({
    mediaId: part.id!,
    accessToken,
  });

  const extension = (mimeType.split("/")[1] ?? "bin").split(";")[0]!;
  return {
    buffer,
    mimeType: part.mime_type ?? mimeType,
    fileName: part.filename ?? `${part.voice ? "voice-note" : "attachment"}.${extension}`,
  };
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
            if (!message.from) continue;

            const profileName = value?.contacts?.find(
              (contact) => contact.wa_id === message.from,
            )?.profile?.name;

            const part = mediaPart(message);
            let media:
              | { buffer: Buffer; fileName: string; mimeType: string }
              | undefined;

            if (part?.id) {
              try {
                media = await downloadInbound(account.company_id, part);
              } catch (error) {
                // Record the message even if the download fails — losing the
                // text of "here is my prescription" is worse than losing the
                // file, and the failure is visible in the logs.
                await log(
                  account.company_id,
                  "media.download_failed",
                  { messageId: message.id, mediaId: part.id },
                  error instanceof Error ? error.message : String(error),
                );
              }
            }

            await receiveMessage({
              companyId: account.company_id,
              fromPhone: message.from,
              body: bodyOf(message),
              profileName,
              waMessageId: message.id,
              media,
              referral: message.referral ?? null,
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
