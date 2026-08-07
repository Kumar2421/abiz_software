import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "../env.js";

/**
 * Envelope encryption for secrets held in the database (WhatsApp access
 * tokens today).
 *
 * AES-256-GCM, random 12-byte IV per value, auth tag appended. Stored as
 * `v1.<iv>.<tag>.<ciphertext>`, all base64url. GCM means a tampered ciphertext
 * fails to decrypt rather than returning garbage.
 *
 * Rotating ENCRYPTION_KEY makes existing values undecryptable — re-enter the
 * affected tokens after a rotation.
 */

const PREFIX = "v1.";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = env.ENCRYPTION_KEY;
  // Accept a 32-byte hex/base64 key directly; anything else is stretched so a
  // short dev value still yields a valid AES-256 key.
  const decoded =
    /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : null;

  cachedKey =
    decoded?.byteLength === 32
      ? decoded
      : createHash("sha256").update(raw, "utf8").digest();

  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX + iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Reverses `encryptSecret`. Values written before encryption existed are
 * returned unchanged, so old rows keep working until they are next saved.
 */
export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext

  const [head, tag, ciphertext] = stored.split(".").slice(0, 4).slice(-3);
  if (!head || !tag || !ciphertext) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(head, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or the value was tampered with.
    return null;
  }
}

export function isEncrypted(stored: string | null): boolean {
  return Boolean(stored?.startsWith(PREFIX));
}

/** Last 4 characters of the plaintext, for the UI hint. */
export function secretHint(stored: string | null): string | null {
  const plain = decryptSecret(stored);
  if (!plain) return null;
  return plain.length <= 4 ? "••••" : `••••${plain.slice(-4)}`;
}
