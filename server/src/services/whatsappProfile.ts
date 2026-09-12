import { env } from "../env.js";
import { ApiError } from "../lib/http.js";

/**
 * The WhatsApp business profile — the card a customer sees when they tap the
 * business name in a chat: display picture, about line, address, description,
 * email, website, and category.
 *
 * Meta keeps this on the phone number, not on the WABA, so every call here is
 * addressed to a phone number id. It is separate from `verified_name`, which
 * only Meta can change.
 */

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

/** Meta rejects anything else, and the error it returns says only "invalid". */
export const PROFILE_PICTURE_TYPES = ["image/jpeg", "image/png"] as const;

/** Meta's documented ceiling for a profile picture. */
export const PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024;

export interface BusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  websites: string[];
  /** Read-only: set by uploading a new picture, never written directly. */
  profilePictureUrl: string | null;
}

interface GraphError {
  error?: { message?: string; error_user_msg?: string; code?: number };
}

/**
 * Meta reports failures as 200-with-an-error-body about as often as a real
 * HTTP error, so every response goes through here rather than trusting `ok`.
 */
function graphMessage(payload: GraphError, fallback: string): string {
  return (
    payload.error?.error_user_msg ?? payload.error?.message ?? fallback
  );
}

export async function getBusinessProfile(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<BusinessProfile> {
  const fields =
    "about,address,description,email,profile_picture_url,websites,vertical";

  const response = await fetch(
    `${GRAPH}/${params.phoneNumberId}/whatsapp_business_profile?fields=${fields}`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } },
  );

  const payload = (await response.json()) as GraphError & {
    data?: Array<{
      about?: string;
      address?: string;
      description?: string;
      email?: string;
      profile_picture_url?: string;
      websites?: string[];
      vertical?: string;
    }>;
  };

  if (!response.ok) {
    throw new ApiError(
      502,
      graphMessage(payload, "Meta would not return the WhatsApp profile"),
      "meta_error",
    );
  }

  // Meta answers with a single-element array, and an empty one for a number
  // whose profile has never been filled in.
  const row = payload.data?.[0] ?? {};

  return {
    about: row.about ?? "",
    address: row.address ?? "",
    description: row.description ?? "",
    email: row.email ?? "",
    vertical: row.vertical ?? "",
    websites: row.websites ?? [],
    profilePictureUrl: row.profile_picture_url ?? null,
  };
}

export interface BusinessProfilePatch {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  /** From `uploadProfilePicture`. Replaces the display picture. */
  profilePictureHandle?: string;
}

export async function updateBusinessProfile(params: {
  phoneNumberId: string;
  accessToken: string;
  patch: BusinessProfilePatch;
}): Promise<void> {
  const { patch } = params;

  // Only send what the caller actually set. Posting an empty string clears the
  // field at Meta, so an absent key and a blank one mean different things.
  const body: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (patch.about !== undefined) body.about = patch.about;
  if (patch.address !== undefined) body.address = patch.address;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.vertical !== undefined) body.vertical = patch.vertical;
  if (patch.websites !== undefined) body.websites = patch.websites;
  if (patch.profilePictureHandle !== undefined) {
    body.profile_picture_handle = patch.profilePictureHandle;
  }

  const response = await fetch(
    `${GRAPH}/${params.phoneNumberId}/whatsapp_business_profile`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const payload = (await response.json()) as GraphError & { success?: boolean };

  if (!response.ok || payload.error) {
    throw new ApiError(
      502,
      graphMessage(payload, "Meta rejected the WhatsApp profile update"),
      "meta_error",
    );
  }
}

/**
 * Uploads a display picture and returns the handle that identifies it.
 *
 * Meta will not take image bytes on the profile endpoint. They go through the
 * resumable upload API in two steps — open a session against the *app*, then
 * PUT the bytes into it — and only the returned handle may be set on the
 * profile. Note the second call authenticates with `OAuth <token>`, not
 * `Bearer`; using Bearer there fails with an unhelpful error.
 */
export async function uploadProfilePicture(params: {
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  if (!env.META_APP_ID) {
    throw new ApiError(
      503,
      "META_APP_ID is not configured, so a profile picture cannot be uploaded.",
      "meta_unconfigured",
    );
  }

  const session = await fetch(
    `${GRAPH}/${env.META_APP_ID}/uploads` +
      `?file_length=${params.buffer.byteLength}` +
      `&file_type=${encodeURIComponent(params.mimeType)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
    },
  );

  const opened = (await session.json()) as GraphError & { id?: string };
  if (!session.ok || !opened.id) {
    throw new ApiError(
      502,
      graphMessage(opened, "Meta would not start the image upload"),
      "meta_error",
    );
  }

  const upload = await fetch(`${GRAPH}/${opened.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${params.accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(params.buffer),
  });

  const finished = (await upload.json()) as GraphError & { h?: string };
  if (!upload.ok || !finished.h) {
    throw new ApiError(
      502,
      graphMessage(finished, "Meta would not accept the image"),
      "meta_error",
    );
  }

  return finished.h;
}
