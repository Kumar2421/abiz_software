/** Row shapes as they come back from Postgres, plus mappers to the API shape
 *  the Next.js client already speaks (see web/src/lib/types.ts). */

export interface ContactRow {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  notes: string | null;
  created_at: Date | string;
}

export interface ConversationRow {
  id: string;
  company_id: string;
  contact_id: string;
  last_message: string | null;
  last_message_at: Date | string | null;
  last_message_direction: "in" | "out" | null;
  last_inbound_at: Date | string | null;
  unread_count: number;
  archived: boolean;
  welcome_sent: boolean;
  contact_name: string;
  contact_phone: string;
  contact_notes: string | null;
  contact_created_at: Date | string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  created_at: Date | string;
  message_type: "text" | "image" | "video" | "audio" | "document";
  media_id: string | null;
  media_file_name: string | null;
  media_mime_type: string | null;
  media_size_bytes: string | number | null;
}

/** Columns needed by `toMessage`, reused by every message query. */
export const MESSAGE_SELECT = `
  m.id, m.conversation_id, m.direction, m.body, m.status, m.error, m.created_at,
  m.message_type, m.media_id,
  md.file_name AS media_file_name,
  md.mime_type AS media_mime_type,
  md.size_bytes AS media_size_bytes
`;

export const MESSAGE_FROM = `
  FROM messages m
  LEFT JOIN media md ON md.id = m.media_id
`;

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const epoch = (value: Date | string | null): number =>
  value === null ? 0 : new Date(value).getTime();

export function toContact(row: ContactRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes ?? undefined,
    firstInteractionAt: iso(row.created_at)!,
  };
}

export function toConversation(row: ConversationRow) {
  return {
    id: row.id,
    contact: {
      id: row.contact_id,
      name: row.contact_name,
      phone: row.contact_phone,
      notes: row.contact_notes ?? undefined,
      firstInteractionAt: iso(row.contact_created_at)!,
    },
    lastMessage: row.last_message ?? "",
    lastMessageAt: iso(row.last_message_at) ?? iso(row.contact_created_at)!,
    lastMessageDirection: row.last_message_direction ?? "in",
    unreadCount: Number(row.unread_count),
    archived: row.archived,
    lastInboundAt: epoch(row.last_inbound_at),
  };
}

export function toMessage(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    body: row.body,
    status: row.status,
    error: row.error ?? undefined,
    createdAt: iso(row.created_at)!,
    type: row.message_type,
    media: row.media_id
      ? {
          id: row.media_id,
          fileName: row.media_file_name ?? "file",
          mimeType: row.media_mime_type ?? "application/octet-stream",
          sizeBytes: Number(row.media_size_bytes ?? 0),
          // Served by the API behind the session cookie, never a public path.
          url: `/api/media/${row.media_id}`,
        }
      : undefined,
  };
}

/** Columns needed by `toConversation`, reused by every conversation query. */
export const CONVERSATION_SELECT = `
  c.id, c.company_id, c.contact_id, c.last_message, c.last_message_at,
  c.last_message_direction, c.last_inbound_at, c.unread_count, c.archived,
  c.welcome_sent,
  ct.name AS contact_name, ct.phone AS contact_phone,
  ct.notes AS contact_notes, ct.created_at AS contact_created_at
`;
