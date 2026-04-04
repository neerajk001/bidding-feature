-- Tighten realtime row visibility to reduce unnecessary public reads / egress.
-- Keeps bidder realtime working for live auctions while limiting broad table access.

drop policy if exists bids_public_read_for_realtime on public.bids;

create policy bids_public_read_for_realtime
  on public.bids
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.auctions a
      where a.id = bids.auction_id
        and a.bidding_start_time is not null
        and a.bidding_end_time is not null
        and now() >= a.bidding_start_time
        and now() <= a.bidding_end_time
    )
  );

drop policy if exists auctions_public_read_for_realtime on public.auctions;

create policy auctions_public_read_for_realtime
  on public.auctions
  for select
  to anon, authenticated
  using (
    status <> 'draft'
    and bidding_start_time is not null
    and bidding_end_time is not null
    and now() >= (bidding_start_time - interval '30 minutes')
    and now() <= (bidding_end_time + interval '30 minutes')
  );

