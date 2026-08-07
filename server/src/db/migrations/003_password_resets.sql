-- Guest sessions were removed: every user signs up and owns their own data.
ALTER TABLE users DROP COLUMN IF EXISTS is_guest;
DROP INDEX IF EXISTS users_guest_idx;

-- Password reset tokens. Only the SHA-256 hash is stored, so a leaked table
-- cannot be used to reset anybody's password.
CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx
  ON password_resets (user_id, created_at DESC);
