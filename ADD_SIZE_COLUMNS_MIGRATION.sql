-- Add available_sizes column to auctions table
ALTER TABLE public.auctions 
ADD COLUMN IF NOT EXISTS available_sizes text[] DEFAULT '{}';

-- Add size column to bids table
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS size text;
  