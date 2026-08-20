-- Adds Embedded Signup (Facebook Login for Business) support alongside the
-- existing manual Phone Number ID + access token entry. Both paths write to
-- the same whatsapp_accounts row; onboarding_method records which one was
-- used, for support/debugging.
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS waba_id           TEXT,
  ADD COLUMN IF NOT EXISTS business_id       TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_method TEXT NOT NULL DEFAULT 'manual',
  -- Which Facebook user connected this account. Abiz's own Meta-Setup-Guide.md
  -- flags this as an ownership risk: if that person leaves, access leaves with
  -- them. Recorded so support can see who to chase.
  ADD COLUMN IF NOT EXISTS fb_user_id        TEXT;

-- One-time CSRF state tokens for the OAuth redirect round-trip. Short-lived;
-- a row is deleted the moment it is consumed (or expires unused).
CREATE TABLE IF NOT EXISTS meta_oauth_states (
  state       TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS meta_oauth_states_expires_idx
  ON meta_oauth_states (expires_at);
