import path from "node:path";
import { randomUUID } from "node:crypto";

import { queryOne } from "../db/index.js";
import { ApiError } from "../lib/http.js";
import { getStorage } from "./storage.js";

/** WhatsApp's own caps, so nothing is accepted here that Meta would reject. */
export const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

const IMAGE = ["image/jpeg", "image/png", "image/webp"];
const VIDEO = ["video/mp4", "video/3gpp"];
const AUDIO = [
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/webm",
];

/**
 * Classifies an upload by MIME type. Anything not on WhatsApp's image, video,
 * or audio lists is treated as a document, which is what Meta does too.
 */
export function classify(mimeType: string): MediaKind {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  if (IMAGE.includes(base)) return "image";
  if (VIDEO.includes(base)) return "video";
  if (AUDIO.includes(base)) return "audio";
  return "document";
}

/** Strips any directory component a client may have put in the filename. */
function safeName(name: string): string {
  return path.basename(name).replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
}

export interface StoredMedia {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: MediaKind;
}

export async function storeMedia(params: {
  companyId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<StoredMedia> {
  const kind = classify(params.mimeType);
  const limit = MEDIA_LIMITS[kind];

  if (params.buffer.byteLength > limit) {
    throw ApiError.badRequest(
      `${kind} files must be ${Math.floor(limit / 1024 / 1024)} MB or smaller`,
    );
  }

  const fileName = safeName(params.fileName) || `${kind}-${Date.now()}`;
  // Keyed per company, so one tenant's listing can never expose another's
  // uploads. The stored name is random — the original is kept in the database.
  const relative = path.posix.join(
    params.companyId,
    `${randomUUID()}${path.extname(fileName).toLowerCase()}`,
  );

  const storage = await getStorage();
  await storage.put(relative, params.buffer, params.mimeType);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO media (company_id, file_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      params.companyId,
      fileName,
      params.mimeType,
      params.buffer.byteLength,
      relative,
    ],
  );

  return {
    id: row!.id,
    fileName,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.byteLength,
    kind,
  };
}

interface MediaRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string | number;
  storage_path: string;
}

export async function findMedia(companyId: string, mediaId: string) {
  const row = await queryOne<MediaRow>(
    `SELECT id, file_name, mime_type, size_bytes, storage_path
       FROM media WHERE id = $1 AND company_id = $2`,
    [mediaId, companyId],
  );
  if (!row) throw ApiError.notFound("File not found");
  return row;
}

/** Opens a stored file for streaming. */
export async function openMedia(row: MediaRow) {
  const storage = await getStorage();
  return storage.get(row.storage_path);
}

export async function deleteMediaFile(row: MediaRow) {
  const storage = await getStorage();
  await storage.remove(row.storage_path).catch(() => undefined);
}
