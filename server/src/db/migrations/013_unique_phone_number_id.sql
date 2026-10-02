-- Two companies can end up with a whatsapp_accounts row claiming the same
-- phone_number_id — e.g. a throwaway signup used during testing, then the
-- real paying customer connects the same number separately. Nothing stopped
-- it, and webhook routing picks whichever row Postgres happens to return
-- first for `WHERE phone_number_id = $1` — unstable, no ORDER BY, no
-- guarantee it stays the same company from one message to the next. A real
-- customer's inbound message can land in the wrong tenant's inbox with no
-- error anywhere: the webhook succeeds, the message is stored, just under an
-- account nobody is looking at.
--
-- For every phone_number_id claimed by more than one connected account, keep
-- exactly one — preferring an ACTIVE subscription over a lapsed or pending
-- one, then the most recently updated — and disconnect the rest. This is
-- real conversation history, not garbage, so it is left in place and simply
-- stops claiming the number; nothing is deleted.
WITH ranked AS (
  SELECT wa.id,
         row_number() OVER (
           PARTITION BY wa.phone_number_id
           ORDER BY (s.status = 'ACTIVE') DESC, wa.updated_at DESC
         ) AS rnk
    FROM whatsapp_accounts wa
    LEFT JOIN subscriptions s ON s.company_id = wa.company_id
   WHERE wa.phone_number_id IS NOT NULL
     AND wa.status = 'connected'
)
UPDATE whatsapp_accounts wa
   SET phone_number_id = NULL,
       display_number  = NULL,
       access_token    = NULL,
       verify_token    = NULL,
       verified_name   = NULL,
       quality_rating  = NULL,
       last_error      = 'Disconnected automatically: this number was also connected to another account. Reconnect from Settings if this was a mistake.',
       status          = 'disconnected',
       updated_at      = now()
  FROM ranked
 WHERE wa.id = ranked.id AND ranked.rnk > 1;

-- Makes the bug structurally impossible rather than relying on the cleanup
-- above staying effective. Partial: many rows legitimately have
-- phone_number_id NULL (never connected, or just disconnected above), and
-- those must not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_phone_number_id_key
  ON whatsapp_accounts (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
