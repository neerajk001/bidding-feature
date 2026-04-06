-- Speed up per-auction chronological reads used in realtime/fallback bid flows.

begin;

create index if not exists idx_bids_auction_created_at_desc
  on public.bids using btree (auction_id, created_at desc) tablespace pg_default;

commit;
