-- Abiz subscription + payment records.
--
-- The product is sold as a single lifetime purchase, so `subscriptions` holds
-- at most one row per company and `expires_at` stays NULL once paid. The
-- status column still carries the full set of states from the spec so a
-- recurring plan can be added later without a rewrite.

CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  -- Paise, to avoid floating point money. 1499900 = INR 14,999.
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  -- NULL = one-time purchase, never expires.
  period_days   INTEGER,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (code, name, amount_paise, currency, period_days)
VALUES ('lifetime', 'Abiz Lifetime', 1499900, 'INR', NULL)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id        UUID REFERENCES plans(id),
  status         TEXT NOT NULL DEFAULT 'TRIAL'
                 CHECK (status IN ('TRIAL', 'ACTIVE', 'PAYMENT_PENDING',
                                   'PAST_DUE', 'EXPIRED', 'CANCELLED',
                                   'SUSPENDED')),
  trial_ends_at  TIMESTAMPTZ,
  activated_at   TIMESTAMPTZ,
  -- NULL means it never expires (lifetime purchase).
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON subscriptions (status, trial_ends_at);

CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id              UUID REFERENCES plans(id),
  -- Razorpay identifiers. The order is created first, the payment id arrives
  -- once the customer completes checkout.
  razorpay_order_id    TEXT NOT NULL UNIQUE,
  razorpay_payment_id  TEXT UNIQUE,
  amount_paise         INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'INR',
  status               TEXT NOT NULL DEFAULT 'created'
                       CHECK (status IN ('created', 'authorized', 'captured',
                                         'failed', 'refunded')),
  method               TEXT,
  error                TEXT,
  -- Raw gateway payload, kept for reconciliation and dispute handling.
  raw                  JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_company_idx
  ON payments (company_id, created_at DESC);

-- Every existing company predates billing; give them the same trial a new
-- signup gets so nobody is locked out by this migration.
INSERT INTO subscriptions (company_id, status, trial_ends_at)
SELECT c.id, 'TRIAL', now() + interval '1 day'
  FROM companies c
 WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.company_id = c.id);
