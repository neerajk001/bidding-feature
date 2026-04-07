-- Optimize place-bid validation hot path.
-- 1) Fast current highest lookup per auction+size ordered by amount/created_at
-- 2) Fast first-bid size lock lookup per auction+bidder ordered by created_at

begin;

create index if not exists idx_bids_auction_size_amount_created_desc
  on public.bids using btree (auction_id, size, amount desc, created_at desc) tablespace pg_default;

create index if not exists idx_bids_auction_bidder_created_asc
  on public.bids using btree (auction_id, bidder_id, created_at asc) tablespace pg_default;

commit;

