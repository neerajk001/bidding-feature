-- Lightweight live snapshot for auction pages.
-- Reduces repeated heavy reads during realtime bidding.

create or replace function public.get_auction_live_snapshot(p_auction_id uuid)
returns table (
  current_highest_bid numeric,
  total_bids bigint,
  highest_bidder_name text,
  highest_bids_by_size jsonb
)
language sql
stable
as $$
  with auction_row as (
    select a.id, a.available_sizes
    from public.auctions a
    where a.id = p_auction_id
    limit 1
  ),
  highest as (
    select
      b.amount,
      br.name as bidder_name
    from public.bids b
    left join public.bidders br on br.id = b.bidder_id
    where b.auction_id = p_auction_id
    order by b.amount desc, b.created_at desc
    limit 1
  ),
  sizes as (
    select unnest(coalesce((select available_sizes from auction_row), array[]::text[])) as size
  ),
  size_stats as (
    select
      b.size,
      max(b.amount)::numeric as amount,
      count(*)::bigint as bid_count
    from public.bids b
    where b.auction_id = p_auction_id
      and b.size is not null
      and b.size <> ''
    group by b.size
  ),
  size_top_bidder as (
    select distinct on (b.size)
      b.size,
      br.name as bidder_name
    from public.bids b
    left join public.bidders br on br.id = b.bidder_id
    where b.auction_id = p_auction_id
      and b.size is not null
      and b.size <> ''
    order by b.size, b.amount desc, b.created_at desc
  ),
  by_size as (
    select
      s.size,
      coalesce(ss.amount, 0)::numeric as amount,
      coalesce(ss.bid_count, 0)::bigint as bid_count,
      stb.bidder_name
    from sizes s
    left join size_stats ss on ss.size = s.size
    left join size_top_bidder stb on stb.size = s.size
  )
  select
    (select h.amount from highest h) as current_highest_bid,
    (
      select count(*)::bigint
      from public.bids b
      where b.auction_id = p_auction_id
    ) as total_bids,
    (select h.bidder_name from highest h) as highest_bidder_name,
    (
      case
        when exists (select 1 from sizes) then
          (
            select jsonb_agg(
              jsonb_build_object(
                'size', bs.size,
                'amount', bs.amount,
                'bid_count', bs.bid_count,
                'bidder_name', bs.bidder_name
              )
              order by bs.size
            )
            from by_size bs
          )
        else null
      end
    ) as highest_bids_by_size
$$;

