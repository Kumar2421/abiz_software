import { randomUUID } from "node:crypto";

import { env } from "../env.js";

export interface SendParams {
  /** Bare E.164 digits, e.g. "919876543210". */
  to: string;
  body: string;
  /** Cloud API credentials for the sending company. */
  phoneNumberId?: string | null;
  accessToken?: string | null;
}

export interface SendResult {
  waMessageId: string;
  status: "sent" | "failed";
  error?: string;
}

export interface SendMediaParams extends Omit<SendParams, "body"> {
  kind: "image" | "video" | "audio" | "document";
  /** Raw bytes; uploaded to Meta's media endpoint before the message is sent. */
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  caption?: string;
}

export interface VerifyResult {
  ok: boolean;
  /** Meta's own copy of the number, authoritative over what was typed in. */
  displayNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: string;
}

export interface WhatsAppProvider {
  readonly name: "mock" | "cloud";
  send(params: SendParams): Promise<SendResult>;
  sendMedia(params: SendMediaParams): Promise<SendResult>;
  /** Asks Meta whether these credentials actually work. */
  verify(params: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<VerifyResult>;
  /** Downloads an inbound attachment the customer sent. */
  fetchMedia(params: {
    mediaId: string;
    accessToken: string;
  }): Promise<{ buffer: Buffer; mimeType: string }>;
}

/**
 * Keeps messages inside Abiz. Direct messaging works end to end without any
 * Meta credentials; `POST /api/dev/inbound` plays the customer's side.
 */
const mockProvider: WhatsAppProvider = {
  name: "mock",
  async send() {
    return { waMessageId: `mock.${randomUUID()}`, status: "sent" };
  },
  async sendMedia() {
    return { waMessageId: `mock.${randomUUID()}`, status: "sent" };
  },
  async verify() {
    // Nothing to check against. Saying "ok" here would be the same lie the UI
    // used to tell, so the demo driver reports unverified on purpose.
    return {
      ok: false,
      error:
        "Demo mode cannot verify credentials with Meta. Set WHATSAPP_DRIVER=cloud to check them for real.",
    };
  },
  async fetchMedia() {
    throw new Error("Demo mode has no Meta media to download");
  },
};

const cloudProvider: WhatsAppProvider = {
  name: "cloud",
  async send({ to, body, phoneNumberId, accessToken }) {
    if (!phoneNumberId || !accessToken) {
      return {
        waMessageId: "",
        status: "failed",
        error: "WhatsApp account is not connected",
      };
    }

    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body },
        }),
      });

      const payload = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };

      if (!response.ok) {
        return {
          waMessageId: "",
          status: "failed",
          error: payload.error?.message ?? `Meta responded ${response.status}`,
        };
      }

      return {
        waMessageId: payload.messages?.[0]?.id ?? "",
        status: "sent",
      };
    } catch (error) {
      return {
        waMessageId: "",
        status: "failed",
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  },

  async fetchMedia({ mediaId, accessToken }) {
    // Two steps: the id resolves to a short-lived signed URL, which then has
    // to be fetched with the same bearer token.
    const lookup = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const meta = (await lookup.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
      error?: { message?: string };
    };

    if (!lookup.ok || !meta.url) {
      throw new Error(meta.error?.message ?? "Could not resolve media id");
    }

    const download = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!download.ok) {
      throw new Error(`Media download failed (HTTP ${download.status})`);
    }

    return {
      buffer: Buffer.from(await download.arrayBuffer()),
      mimeType: meta.mime_type ?? "application/octet-stream",
    };
  },

  async verify({ phoneNumberId, accessToken }) {
    const url =
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${phoneNumberId}` +
      `?fields=display_phone_number,verified_name,quality_rating`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const payload = (await response.json()) as {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        error?: { message?: string; type?: string; code?: number };
      };

      if (!response.ok) {
        return {
          ok: false,
          error:
            payload.error?.message ??
            `Meta rejected these credentials (HTTP ${response.status})`,
        };
      }

      return {
        ok: true,
        displayNumber: payload.display_phone_number,
        verifiedName: payload.verified_name,
        qualityRating: payload.quality_rating,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Could not reach Meta: ${error.message}`
            : "Could not reach Meta",
      };
    }
  },

  async sendMedia({
    to,
    kind,
    buffer,
    fileName,
    mimeType,
    caption,
    phoneNumberId,
    accessToken,
  }) {
    if (!phoneNumberId || !accessToken) {
      return {
        waMessageId: "",
        status: "failed",
        error: "WhatsApp account is not connected",
      };
    }

    const base = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

    try {
      // Two calls: upload the bytes, then reference the returned media id.
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", mimeType);
      form.append(
        "file",
        new Blob([new Uint8Array(buffer)], { type: mimeType }),
        fileName,
      );

      const upload = await fetch(`${base}/${phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const uploaded = (await upload.json()) as {
        id?: string;
        error?: { message?: string };
      };

      if (!upload.ok || !uploaded.id) {
        return {
          waMessageId: "",
          status: "failed",
          error: uploaded.error?.message ?? `Media upload failed (${upload.status})`,
        };
      }

      // Audio messages carry no caption in the Cloud API; documents keep the
      // original filename so the recipient sees something meaningful.
      const media: Record<string, unknown> = { id: uploaded.id };
      if (caption && kind !== "audio") media.caption = caption;
      if (kind === "document") media.filename = fileName;

      const response = await fetch(`${base}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: kind,
          [kind]: media,
        }),
      });

      const payload = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };

      if (!response.ok) {
        return {
          waMessageId: "",
          status: "failed",
          error: payload.error?.message ?? `Meta responded ${response.status}`,
        };
      }

      return { waMessageId: payload.messages?.[0]?.id ?? "", status: "sent" };
    } catch (error) {
      return {
        waMessageId: "",
        status: "failed",
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  },
};

export function getWhatsAppProvider(): WhatsAppProvider {
  return env.WHATSAPP_DRIVER === "cloud" ? cloudProvider : mockProvider;
}
