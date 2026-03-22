-- Store winner shipping address from Pay and Claim flow

ALTER TABLE public.winners
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_address_submitted_at timestamp with time zone;

COMMENT ON COLUMN public.winners.shipping_address IS
  'Shipping address captured from winner at Pay and Claim step before payment.';

COMMENT ON COLUMN public.winners.shipping_address_submitted_at IS
  'Timestamp when winner shipping address was last submitted/updated.';

