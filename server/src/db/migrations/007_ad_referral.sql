-- Click-to-WhatsApp attribution.
--
-- When a customer taps the WhatsApp button on a Meta/Instagram ad, the Cloud
-- API includes a `referral` object on their first message: the ad id, the
-- headline they saw, and `ctwa_clid` which ties the conversation back to the
-- campaign. Storing it is the only way to answer "which ad produced this
-- customer" — Meta does not send it again on later messages.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ad_referral JSONB;

CREATE INDEX IF NOT EXISTS conversations_ad_referral_idx
  ON conversations ((ad_referral ->> 'source_id'))
  WHERE ad_referral IS NOT NULL;
