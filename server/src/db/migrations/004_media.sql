-- Attachments: images, video, audio (voice notes), and documents.
CREATE TABLE IF NOT EXISTS media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  -- Path relative to the uploads root, never an absolute path: the storage
  -- location has to stay swappable (local disk now, object storage later).
  storage_path  TEXT NOT NULL,
  -- Meta's media id once uploaded, so re-sends do not re-upload.
  wa_media_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_company_idx ON media (company_id, created_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document')),
  ADD COLUMN IF NOT EXISTS media_id UUID REFERENCES media(id) ON DELETE SET NULL;

-- A media message carries its text in `body` as the caption, so `body` stays
-- the single place to read a message's text.
