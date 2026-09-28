-- Buffers a webhook delivery/read status that arrives before Abiz has
-- recorded the WhatsApp message id it belongs to.
--
-- sendMessage/sendMediaMessage cannot know a message's wa_message_id until
-- Meta's Send API responds, so there is a real gap between the row being
-- inserted and it becoming matchable by wa_message_id. A fast delivery
-- receipt can land inside that gap; without somewhere to hold it, the event
-- was silently dropped and the tick got stuck at "sent" even though the
-- message really was delivered.
CREATE TABLE IF NOT EXISTS pending_message_statuses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  wa_message_id  TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error          TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Looked up by (company_id, wa_message_id) the moment a message row learns
-- its wa_message_id, so this is the access pattern that needs to be fast.
CREATE INDEX IF NOT EXISTS pending_message_statuses_lookup_idx
  ON pending_message_statuses (company_id, wa_message_id);
