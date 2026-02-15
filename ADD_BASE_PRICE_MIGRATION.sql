-- Migration: Add optional base_price to auctions table
-- Date: 2026-02-15
-- Description: Adds an optional base_price column. If set, the first bid must be >= base_price.
--              If not set, auction starts from 0 (any positive bid is allowed).

-- Add base_price column (nullable, defaults to NULL)
ALTER TABLE public.auctions
ADD COLUMN IF NOT EXISTS base_price numeric NULL;

-- Add check constraint to ensure base_price is positive when set
ALTER TABLE public.auctions
ADD CONSTRAINT check_auctions_base_price_positive 
CHECK (base_price IS NULL OR base_price > 0);

-- Add comment
COMMENT ON COLUMN public.auctions.base_price IS 'Optional starting price for the auction. If set, first bid must be >= base_price. If NULL, auction starts from 0.';
