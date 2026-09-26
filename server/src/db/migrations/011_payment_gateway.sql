-- Prepares billing to run on a gateway other than Razorpay.
--
-- The columns were named after Razorpay when it was the only option. Renaming
-- them now — rather than adding a parallel set — keeps one row per payment and
-- one code path, so existing payment history stays readable after the switch.
--
-- Each rename is guarded: RENAME COLUMN is not idempotent, and a migration
-- that half-applied once would otherwise fail forever on every later boot.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'payments' AND column_name = 'razorpay_order_id'
  ) THEN
    ALTER TABLE payments RENAME COLUMN razorpay_order_id TO gateway_order_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'payments' AND column_name = 'razorpay_payment_id'
  ) THEN
    ALTER TABLE payments RENAME COLUMN razorpay_payment_id TO gateway_payment_id;
  END IF;
END $$;

-- Defaults to 'razorpay' because every row written before this migration came
-- from Razorpay. New rows record whichever gateway actually took the money, so
-- a refund or dispute can be traced to the right dashboard.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'razorpay';

-- Cashfree requires a customer phone on every order and sends the payment
-- confirmation to it. Abiz never collected one: companies had only a name and
-- address. Nullable, because every existing company predates it and must not
-- be locked out.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;
