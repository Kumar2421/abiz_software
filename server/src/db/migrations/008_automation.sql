-- Custom automated messages triggered by the business's own website or backend
-- (spec section 4), plus the scheduled reminders from section 14.

-- Per-tenant API keys. Only a SHA-256 hash is stored, so a database leak
-- cannot be replayed against the API; the plaintext is shown once at creation.
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  -- First characters of the key, to tell keys apart in the UI.
  key_prefix   TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_company_idx ON api_keys (company_id);

-- Reusable message bodies with {{placeholders}}, edited by the owner.
CREATE TABLE IF NOT EXISTS automations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 'appointment_reminder' | 'payment_reminder' | 'custom'
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS automations_company_name_key
  ON automations (company_id, lower(name));

-- Queue of messages to send later. A cron tick drains everything due.
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  automation_id    UUID REFERENCES automations(id) ON DELETE SET NULL,
  body             TEXT NOT NULL,
  send_at          TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  error            TEXT,
  message_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cron query filters on exactly this pair, so it stays an index scan even
-- once the table holds a large backlog.
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
  ON scheduled_messages (send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scheduled_messages_company_idx
  ON scheduled_messages (company_id, send_at DESC);

-- Seed the two reminder types the spec names, disabled until the owner edits
-- them so nothing unexpected goes out.
INSERT INTO automations (company_id, kind, name, body, enabled)
SELECT c.id, 'appointment_reminder', 'Appointment reminder',
       'Hi {{customer_name}}, this is a reminder about your appointment with {{company_name}} on {{date}} at {{time}}. Reply here if you need to reschedule.',
       false
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM automations a
    WHERE a.company_id = c.id AND a.kind = 'appointment_reminder'
 );

INSERT INTO automations (company_id, kind, name, body, enabled)
SELECT c.id, 'payment_reminder', 'Payment reminder',
       'Hi {{customer_name}}, a friendly reminder that your payment of {{amount}} to {{company_name}} is due on {{date}}. Thank you!',
       false
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM automations a
    WHERE a.company_id = c.id AND a.kind = 'payment_reminder'
 );
