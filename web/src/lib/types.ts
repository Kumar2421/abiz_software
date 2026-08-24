export type ConnectionStatus = "connected" | "pending" | "disconnected";

export type MessageDirection = "in" | "out";

/** Mirrors Meta Cloud API statuses; `pending` is local-only (optimistic send). */
export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  firstInteractionAt: string;
}

export type MessageType = "text" | "image" | "video" | "audio" | "document";

export interface MessageMedia {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** API path; prefix with API_URL and fetch with credentials. */
  url: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  /** Caption for media messages, text for the rest. */
  body: string;
  createdAt: string;
  status?: MessageStatus;
  type?: MessageType;
  media?: MessageMedia;
}

/** Click-to-WhatsApp attribution, present only on ad-originated chats. */
export interface AdReferral {
  sourceId: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  /** Click id; needed to report conversions back to Meta later. */
  ctwaClid: string | null;
}

export interface Conversation {
  id: string;
  contact: Contact;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageDirection: MessageDirection;
  unreadCount: number;
  archived: boolean;
  /** Epoch ms of last inbound message — drives the Cloud API 24h send window. */
  lastInboundAt: number;
  adReferral?: AdReferral;
}

export interface WhatsAppAccount {
  displayNumber: string;
  phoneNumberId: string;
  status: ConnectionStatus;
}

export interface DashboardStats {
  contacts: number;
  conversations: number;
  messagesSent: number;
  messagesReceived: number;
}

export type InboxFolder = "all" | "unread" | "archived";
