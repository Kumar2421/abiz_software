-- Cloud API phone registration.
--
-- Embedded Signup hands over a number Meta still treats as unregistered:
-- POST /{phone-number-id}/register must succeed before any message can be
-- sent. The PIN is two-factor for the number itself; storing it means a later
-- re-register (Meta occasionally requires one) does not depend on the customer
-- remembering it.
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS registration_pin  TEXT,
  ADD COLUMN IF NOT EXISTS registered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_note TEXT;
