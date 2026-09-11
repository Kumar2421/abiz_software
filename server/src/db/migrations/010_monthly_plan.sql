-- Adds a second purchasable plan alongside the lifetime one.
--
-- 199900 paise = INR 1,999, valid for 30 days. There is no Razorpay mandate
-- behind it: the term simply ends, `getSubscription` settles the row to
-- EXPIRED, and the customer pays again. Nothing is auto-charged, so no UI
-- text may promise automatic renewal.
--
-- ON CONFLICT keeps this idempotent if the row was created by hand first.
INSERT INTO plans (code, name, amount_paise, currency, period_days, active)
VALUES ('monthly', 'Abiz Monthly', 199900, 'INR', 30, true)
ON CONFLICT (code) DO UPDATE
   SET name         = EXCLUDED.name,
       amount_paise = EXCLUDED.amount_paise,
       currency     = EXCLUDED.currency,
       period_days  = EXCLUDED.period_days,
       active       = true;
