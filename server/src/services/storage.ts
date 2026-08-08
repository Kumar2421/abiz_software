import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

import { env } from "../env.js";

/**
 * Where chat attachments live.
 *
 * Both drivers store the same relative key, so switching between them changes
 * only where the bytes are — never the database.
 */
export interface StorageDriver {
  readonly name: "local" | "supabase";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

export const LOCAL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.data/uploads",
);

/** Rejects any key that would escape the uploads root. */
function resolveLocal(key: string): string {
  const absolute = path.resolve(LOCAL_ROOT, key);
  if (!absolute.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return absolute;
}

const localDriver: StorageDriver = {
  name: "local",
  async put(key, body) {
    const absolute = resolveLocal(key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, body);
  },
  async get(key) {
    return createReadStream(resolveLocal(key));
  },
  async remove(key) {
    await unlink(resolveLocal(key)).catch(() => undefined);
  },
};

async function createSupabaseDriver(): Promise<StorageDriver> {
  const { createClient } = await import("@supabase/supabase-js");

  // Service role key: server-side only. The bucket stays private and files are
  // streamed through GET /api/media/:id, which checks the session first.
  const client = createClient(
    env.SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const bucket = client.storage.from(env.SUPABASE_STORAGE_BUCKET);

  return {
    name: "supabase",
    async put(key, body, contentType) {
      const { error } = await bucket.upload(key, body, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(`Upload failed: ${error.message}`);
    },
    async get(key) {
      const { data, error } = await bucket.download(key);
      if (error || !data) {
        throw new Error(`Download failed: ${error?.message ?? "missing file"}`);
      }
      return Readable.fromWeb(
        data.stream() as Parameters<typeof Readable.fromWeb>[0],
      );
    },
    async remove(key) {
      await bucket.remove([key]);
    },
  };
}

let driver: Promise<StorageDriver> | null = null;

export function getStorage(): Promise<StorageDriver> {
  driver ??=
    env.STORAGE_DRIVER === "supabase"
      ? createSupabaseDriver()
      : Promise.resolve(localDriver);
  return driver;
}
