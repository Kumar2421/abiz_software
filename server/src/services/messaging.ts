import { env } from "../env.js";
import { query, queryOne } from "../db/index.js";
import { decryptSecret } from "../lib/crypto.js";
import { ApiError } from "../lib/http.js";
import { normalizePhone } from "../lib/phone.js";
import { getWhatsAppProvider } from "../providers/whatsapp.js";
import {
  CONVERSATION_SELECT,
  MESSAGE_FROM,
  MESSAGE_SELECT,
  toConversation,
  toMessage,
  type ContactRow,
  type ConversationRow,
  type MessageRow,
} from "./shape.js";
import { classify, storeMedia } from "./media.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Contacts + conversations                                            */
/* ------------------------------------------------------------------ */

export async function upsertContact(
  companyId: string,
  phoneInput: string,
  fallbackName?: string,
): Promise<ContactRow> {
  const phone = normalizePhone(phoneInput);

  const existing = await queryOne<ContactRow>(
    `SELECT * FROM contacts WHERE company_id = $1 AND phone = $2`,
    [companyId, phone],
  );
  if (existing) return existing;

  const created = await queryOne<ContactRow>(
    `INSERT INTO contacts (company_id, name, phone)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [companyId, fallbackName?.trim() || `+${phone}`, phone],
  );
  return created!;
}

export async function getOrCreateConversation(
  companyId: string,
  contactId: string,
): Promise<ConversationRow> {
  const existing = await findConversation(companyId, { contactId });
  if (existing) return existing;

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO conversations (company_id, contact_id) VALUES ($1, $2) RETURNING id`,
    [companyId, contactId],
  );

  const row = await findConversation(companyId, { id: inserted!.id });
  return row!;
}

async function findConversation(
  companyId: string,
  by: { id?: string; contactId?: string },
): Promise<ConversationRow | null> {
  const clause = by.id ? "c.id = $2" : "c.contact_id = $2";
  return queryOne<ConversationRow>(
    `SELECT ${CONVERSATION_SELECT}
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.company_id = $1 AND ${clause}`,
    [companyId, by.id ?? by.contactId],
  );
}

export async function requireConversation(
  companyId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const row = await findConversation(companyId, { id: conversationId });
  if (!row) throw ApiError.notFound("Conversation not found");
  return row;
}

export async function listConversations(
  companyId: string,
  options: { folder?: "all" | "unread" | "archived"; search?: string } = {},
) {
  const folder = options.folder ?? "all";
  const search = options.search?.trim();

  const conditions = ["c.company_id = $1"];
  const params: unknown[] = [companyId];

  conditions.push(folder === "archived" ? "c.archived" : "NOT c.archived");
  if (folder === "unread") conditions.push("c.unread_count > 0");

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    conditions.push(
      `(lower(ct.name) LIKE $${i} OR ct.phone LIKE $${i} OR lower(coalesce(c.last_message, '')) LIKE $${i})`,
    );
  }

  const rows = await query<ConversationRow>(
    `SELECT ${CONVERSATION_SELECT}
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
    params,
  );

  return rows.map(toConversation);
}

export async function listMessages(companyId: string, conversationId: string) {
  await requireConversation(companyId, conversationId);
  const rows = await query<MessageRow>(
    `SELECT ${MESSAGE_SELECT} ${MESSAGE_FROM}
      WHERE m.company_id = $1 AND m.conversation_id = $2
      ORDER BY m.created_at ASC`,
    [companyId, conversationId],
  );
  return rows.map(toMessage);
}

export async function markConversationRead(
  companyId: string,
  conversationId: string,
) {
  await query(
    `UPDATE conversations SET unread_count = 0 WHERE company_id = $1 AND id = $2`,
    [companyId, conversationId],
  );
  const row = await requireConversation(companyId, conversationId);
  const conversation = toConversation(row);
  return conversation;
}

export async function setArchived(
  companyId: string,
  conversationId: string,
  archived: boolean,
) {
  await query(
    `UPDATE conversations SET archived = $3 WHERE company_id = $1 AND id = $2`,
    [companyId, conversationId, archived],
  );
  const conversation = toConversation(
    await requireConversation(companyId, conversationId),
  );
  return conversation;
}

/* ------------------------------------------------------------------ */
/* 24-hour customer service window                                     */
/* ------------------------------------------------------------------ */

export function sendWindow(row: ConversationRow) {
  const lastInbound = row.last_inbound_at
    ? new Date(row.last_inbound_at).getTime()
    : null;

  // The mock driver keeps messages inside Abiz, where Meta's window does not
  // apply — otherwise a brand-new conversation could never be started in dev.
  if (env.WHATSAPP_DRIVER === "mock") {
    return { open: true, msLeft: WINDOW_MS };
  }

  if (lastInbound === null) return { open: false, msLeft: 0 };
  const msLeft = lastInbound + WINDOW_MS - Date.now();
  return { open: msLeft > 0, msLeft: Math.max(0, msLeft) };
}

/* ------------------------------------------------------------------ */
/* Sending + receiving                                                 */
/* ------------------------------------------------------------------ */

interface WhatsAppAccountRow {
  phone_number_id: string | null;
  access_token: string | null;
}

/** Returns credentials with the access token decrypted, ready to send with. */
async function accountFor(companyId: string) {
  const row = await queryOne<WhatsAppAccountRow>(
    `SELECT phone_number_id, access_token FROM whatsapp_accounts WHERE company_id = $1`,
    [companyId],
  );
  if (!row) return null;
  return {
    phone_number_id: row.phone_number_id,
    access_token: decryptSecret(row.access_token),
  };
}

async function insertMessage(
  companyId: string,
  conversationId: string,
  values: {
    direction: "in" | "out";
    body: string;
    status: MessageRow["status"];
    waMessageId?: string | null;
    error?: string | null;
    messageType?: MessageRow["message_type"];
    mediaId?: string | null;
  },
) {
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO messages
       (company_id, conversation_id, direction, body, status, wa_message_id,
        error, message_type, media_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      companyId,
      conversationId,
      values.direction,
      values.body,
      values.status,
      values.waMessageId ?? null,
      values.error ?? null,
      values.messageType ?? "text",
      values.mediaId ?? null,
    ],
  );
  return loadMessage(inserted!.id);
}

async function loadMessage(id: string): Promise<MessageRow> {
  const row = await queryOne<MessageRow>(
    `SELECT ${MESSAGE_SELECT} ${MESSAGE_FROM} WHERE m.id = $1`,
    [id],
  );
  return row!;
}

async function touchConversation(
  companyId: string,
  conversationId: string,
  patch: {
    lastMessage: string;
    direction: "in" | "out";
    at: string;
    bumpUnread?: boolean;
    markInbound?: boolean;
  },
) {
  await query(
    `UPDATE conversations
        SET last_message = $3,
            last_message_direction = $4,
            last_message_at = $5,
            last_inbound_at = CASE WHEN $6 THEN $5 ELSE last_inbound_at END,
            unread_count = CASE WHEN $7 THEN unread_count + 1 ELSE unread_count END,
            archived = false
      WHERE company_id = $1 AND id = $2`,
    [
      companyId,
      conversationId,
      patch.lastMessage,
      patch.direction,
      patch.at,
      patch.markInbound ?? false,
      patch.bumpUnread ?? false,
    ],
  );
}

/** Sends an outbound message and broadcasts every state change it goes through. */
export async function sendMessage(
  companyId: string,
  conversationId: string,
  body: string,
) {
  const conversation = await requireConversation(companyId, conversationId);

  if (!sendWindow(conversation).open) {
    throw new ApiError(
      422,
      "The 24-hour customer service window is closed. The customer must message you first before you can send free-form text.",
      "window_closed",
    );
  }

  const pending = await insertMessage(companyId, conversationId, {
    direction: "out",
    body,
    status: "pending",
  });

  const account = await accountFor(companyId);
  const result = await getWhatsAppProvider().send({
    to: conversation.contact_phone,
    body,
    phoneNumberId: account?.phone_number_id,
    accessToken: account?.access_token,
  });

  await query(
    `UPDATE messages
        SET status = $2, wa_message_id = NULLIF($3, ''), error = $4
      WHERE id = $1`,
    [pending.id, result.status, result.waMessageId, result.error ?? null],
  );
  const updated = await loadMessage(pending.id);

  if (result.status === "sent") {
    await touchConversation(companyId, conversationId, {
      lastMessage: body,
      direction: "out",
      at: new Date(updated.created_at).toISOString(),
    });

    // The business has now greeted this contact itself. Suppress the automatic
    // welcome so a later customer reply does not trigger a redundant greeting.
    await query(
      `UPDATE conversations SET welcome_sent = true
        WHERE id = $1 AND welcome_sent = false`,
      [conversationId],
    );
  }

  const message = toMessage(updated);

  return message;
}

/** Stores an attachment, then sends it the same way a text message is sent. */
export async function sendMediaMessage(params: {
  companyId: string;
  conversationId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  caption?: string;
}) {
  const conversation = await requireConversation(
    params.companyId,
    params.conversationId,
  );

  if (!sendWindow(conversation).open) {
    throw new ApiError(
      422,
      "The 24-hour customer service window is closed. The customer must message you first before you can send an attachment.",
      "window_closed",
    );
  }

  const kind = classify(params.mimeType);
  const stored = await storeMedia({
    companyId: params.companyId,
    buffer: params.buffer,
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  const caption = params.caption?.trim() ?? "";
  const pending = await insertMessage(params.companyId, params.conversationId, {
    direction: "out",
    body: caption,
    status: "pending",
    messageType: kind,
    mediaId: stored.id,
  });

  const account = await accountFor(params.companyId);
  const result = await getWhatsAppProvider().sendMedia({
    to: conversation.contact_phone,
    kind,
    buffer: params.buffer,
    fileName: stored.fileName,
    mimeType: params.mimeType,
    caption: caption || undefined,
    phoneNumberId: account?.phone_number_id,
    accessToken: account?.access_token,
  });

  await query(
    `UPDATE messages
        SET status = $2, wa_message_id = NULLIF($3, ''), error = $4
      WHERE id = $1`,
    [pending.id, result.status, result.waMessageId, result.error ?? null],
  );
  const updated = await loadMessage(pending.id);

  if (result.status === "sent") {
    const summary = caption || `📎 ${stored.fileName}`;
    await touchConversation(params.companyId, params.conversationId, {
      lastMessage: summary,
      direction: "out",
      at: new Date(updated.created_at).toISOString(),
    });
    await query(
      `UPDATE conversations SET welcome_sent = true
        WHERE id = $1 AND welcome_sent = false`,
      [params.conversationId],
    );
  }

  const message = toMessage(updated);

  return message;
}

/**
 * Records an inbound customer message: upserts the contact and conversation,
 * bumps unread, reopens the 24h window, then fires the welcome message the
 * very first time that conversation receives anything.
 */
export async function receiveMessage(params: {
  companyId: string;
  fromPhone: string;
  body: string;
  profileName?: string;
  waMessageId?: string;
}) {
  const contact = await upsertContact(
    params.companyId,
    params.fromPhone,
    params.profileName,
  );
  const conversation = await getOrCreateConversation(
    params.companyId,
    contact.id,
  );

  const inbound = await insertMessage(params.companyId, conversation.id, {
    direction: "in",
    body: params.body,
    status: "delivered",
    waMessageId: params.waMessageId ?? null,
  });

  await touchConversation(params.companyId, conversation.id, {
    lastMessage: params.body,
    direction: "in",
    at: new Date(inbound.created_at).toISOString(),
    bumpUnread: true,
    markInbound: true,
  });


  await maybeSendWelcome(params.companyId, conversation.id);

  return toMessage(inbound);
}

async function maybeSendWelcome(companyId: string, conversationId: string) {
  const conversation = await requireConversation(companyId, conversationId);
  if (conversation.welcome_sent) return;

  const welcome = await queryOne<{ enabled: boolean; body: string }>(
    `SELECT enabled, body FROM welcome_messages WHERE company_id = $1`,
    [companyId],
  );
  if (!welcome?.enabled || !welcome.body.trim()) return;

  const company = await queryOne<{ name: string; address: string | null }>(
    `SELECT name, address FROM companies WHERE id = $1`,
    [companyId],
  );
  const account = await accountFor(companyId);
  const display = await queryOne<{ display_number: string | null }>(
    `SELECT display_number FROM whatsapp_accounts WHERE company_id = $1`,
    [companyId],
  );

  const body = welcome.body
    .replaceAll("{{company_name}}", company?.name ?? "")
    .replaceAll("{{phone}}", display?.display_number ?? "")
    .replaceAll("{{address}}", company?.address ?? "");

  // Mark first so a delivery failure cannot cause a welcome loop.
  await query(
    `UPDATE conversations SET welcome_sent = true WHERE id = $1`,
    [conversationId],
  );

  void account; // credentials are re-read inside sendMessage
  await sendMessage(companyId, conversationId, body);
}

/** Applies a Meta delivery receipt (sent/delivered/read/failed) to a message. */
export async function applyStatusUpdate(
  companyId: string,
  waMessageId: string,
  status: MessageRow["status"],
  error?: string,
) {
  const updated = await queryOne<{ id: string }>(
    `UPDATE messages
        SET status = $3, error = COALESCE($4, error)
      WHERE company_id = $1 AND wa_message_id = $2
      RETURNING id`,
    [companyId, waMessageId, status, error ?? null],
  );
  if (!updated) return null;

  const message = toMessage(await loadMessage(updated.id));
  return message;
}

export async function companyStats(companyId: string) {
  const row = await queryOne<{
    contacts: string;
    conversations: string;
    sent: string;
    received: string;
  }>(
    `SELECT
       (SELECT count(*) FROM contacts WHERE company_id = $1) AS contacts,
       (SELECT count(*) FROM conversations WHERE company_id = $1) AS conversations,
       (SELECT count(*) FROM messages WHERE company_id = $1 AND direction = 'out') AS sent,
       (SELECT count(*) FROM messages WHERE company_id = $1 AND direction = 'in') AS received`,
    [companyId],
  );

  return {
    contacts: Number(row?.contacts ?? 0),
    conversations: Number(row?.conversations ?? 0),
    messagesSent: Number(row?.sent ?? 0),
    messagesReceived: Number(row?.received ?? 0),
  };
}
