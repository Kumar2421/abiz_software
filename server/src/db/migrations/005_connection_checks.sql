-- Records the outcome of the last credential check, so the UI can show why a
-- connection is not live instead of optimistically claiming "connected".
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS verified_name    TEXT,
  ADD COLUMN IF NOT EXISTS quality_rating   TEXT,
  ADD COLUMN IF NOT EXISTS last_error       TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at  TIMESTAMPTZ;

-- Any row previously marked connected was marked so purely because two fields
-- were non-empty, never because Meta confirmed it. Reset them for re-checking.
UPDATE whatsapp_accounts SET status = 'pending' WHERE status = 'connected';
