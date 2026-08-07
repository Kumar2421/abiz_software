import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { queryOne } from "../db/index.js";
import { ApiError } from "../lib/http.js";

export const UPLOAD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.data/uploads",
);

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
  // Files are stored per company, so one tenant's directory listing can never
  // expose another's uploads.
  const relative = path.posix.join(
    params.companyId,
    `${randomUUID()}${path.extname(fileName).toLowerCase()}`,
  );
  const absolute = path.join(UPLOAD_ROOT, relative);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, params.buffer);

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

/** Opens a stored file for streaming. Rejects any path that escapes the root. */
export function openMedia(row: MediaRow) {
  const absolute = path.resolve(UPLOAD_ROOT, row.storage_path);
  if (!absolute.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) {
    throw ApiError.forbidden("Invalid file path");
  }
  return createReadStream(absolute);
}

export async function deleteMediaFile(row: MediaRow) {
  const absolute = path.resolve(UPLOAD_ROOT, row.storage_path);
  if (!absolute.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return;
  await unlink(absolute).catch(() => undefined);
}
