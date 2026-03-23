-- Remove stale single-winner-per-auction index so multi-size auctions can keep one winner per size.
DROP INDEX IF EXISTS public.idx_winners_unique_auction;
