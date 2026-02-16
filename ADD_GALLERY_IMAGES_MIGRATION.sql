-- Add gallery_images column to auctions table
ALTER TABLE public.auctions 
ADD COLUMN IF NOT EXISTS gallery_images text[] DEFAULT '{}';

-- Ensure reel_url is present (from previous schema understanding it is, but just in case)
-- ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS reel_url text; 
-- (It is already in table.sql, so skipping)
