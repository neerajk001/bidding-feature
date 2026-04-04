-- Full schema bootstrap for fresh Supabase projects.
-- Includes all structure from incremental migrations as of 2026-04-04.

begin;

create extension if not exists pgcrypto;

-- auctions table
create table if not exists public.auctions (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid(),
  product_id text null,
  title text null,
  bidding_start_time timestamp with time zone null,
  bidding_end_time timestamp with time zone null,
  registration_end_time timestamp with time zone null,
  status text not null default 'draft'::text,
  min_increment numeric not null default 50::numeric,
  banner_image text null,
  reel_url text null,
  base_price numeric null,
  gallery_images text[] null default '{}'::text[],
  available_sizes text[] null default '{}'::text[],
  constraint auctions_pkey primary key (id),
  constraint check_auctions_base_price_positive check ((base_price is null) or (base_price > 0::numeric)),
  constraint check_auctions_min_increment_positive check (min_increment > 0::numeric),
  constraint check_auctions_status_valid check (status = any (array['draft'::text, 'live'::text, 'ended'::text]))
) tablespace pg_default;

create index if not exists idx_auctions_product_id on public.auctions using btree (product_id) tablespace pg_default;
create index if not exists idx_auctions_status on public.auctions using btree (status) tablespace pg_default;
create index if not exists idx_auctions_bidding_end_time on public.auctions using btree (bidding_end_time) tablespace pg_default;

-- users table
create table if not exists public.users (
  id uuid not null default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamp with time zone null default now(),
  phone_verified boolean null default false,
  otp_verified_at timestamp with time zone null,
  email_verified boolean null default false,
  email_verified_at timestamp with time zone null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_phone_key unique (phone)
) tablespace pg_default;

create index if not exists users_email_idx on public.users using btree (email) tablespace pg_default;
create index if not exists users_phone_idx on public.users using btree (phone) tablespace pg_default;
create index if not exists idx_users_email on public.users using btree (email) tablespace pg_default;
create index if not exists idx_users_phone on public.users using btree (phone) tablespace pg_default;
create index if not exists idx_users_phone_verified on public.users using btree (phone_verified) tablespace pg_default;

-- bidders table
create table if not exists public.bidders (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid(),
  auction_id uuid null,
  name text null,
  phone text null,
  email text null,
  user_id uuid null,
  constraint bidders_pkey primary key (id),
  constraint fk_bidders_auction foreign key (auction_id) references public.auctions (id) on delete cascade,
  constraint fk_bidders_user foreign key (user_id) references public.users (id) on delete set null
) tablespace pg_default;

create index if not exists idx_bidders_auction_id on public.bidders using btree (auction_id) tablespace pg_default;
create index if not exists idx_bidders_user_id on public.bidders using btree (user_id) tablespace pg_default;
create index if not exists idx_bidders_email on public.bidders using btree (email) tablespace pg_default;
create index if not exists idx_bidders_phone on public.bidders using btree (phone) tablespace pg_default;
create unique index if not exists idx_bidders_unique_per_auction on public.bidders using btree (auction_id, email) tablespace pg_default;

-- bids table
create table if not exists public.bids (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid(),
  auction_id uuid null,
  bidder_id uuid null,
  amount numeric null,
  size text null,
  constraint bids_pkey primary key (id),
  constraint fk_bids_auction foreign key (auction_id) references public.auctions (id) on delete cascade,
  constraint fk_bids_bidder foreign key (bidder_id) references public.bidders (id) on delete cascade,
  constraint check_bids_amount_positive check (amount > 0::numeric)
) tablespace pg_default;

create index if not exists idx_bids_auction_id on public.bids using btree (auction_id) tablespace pg_default;
create index if not exists idx_bids_bidder_id on public.bids using btree (bidder_id) tablespace pg_default;
create index if not exists idx_bids_amount on public.bids using btree (amount desc) tablespace pg_default;
create index if not exists idx_bids_created_at on public.bids using btree (created_at desc) tablespace pg_default;

-- email_otps table
create table if not exists public.email_otps (
  id uuid not null default gen_random_uuid(),
  email text not null,
  otp_code text not null,
  expires_at timestamp with time zone not null,
  attempts integer null default 0,
  verified boolean null default false,
  created_at timestamp with time zone null default now(),
  ip_address text null,
  user_agent text null,
  constraint email_otps_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_email_otps_email on public.email_otps using btree (email) tablespace pg_default;
create index if not exists idx_email_otps_expires on public.email_otps using btree (expires_at) tablespace pg_default;

-- winners table
create table if not exists public.winners (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid(),
  auction_id uuid null,
  bidder_id uuid null,
  winning_amount numeric null,
  declared_at timestamp with time zone not null default now(),
  size text null,
  payment_due_at timestamp with time zone null,
  payment_status text null default 'pending'::text,
  payment_completed_at timestamp with time zone null,
  payment_proof_note text null,
  payment_proof_url text null,
  payment_verified_by_admin boolean null default false,
  instagram_handle text null,
  shipping_address jsonb null,
  shipping_address_submitted_at timestamp with time zone null,
  dispatched_at timestamp with time zone null,
  delhivery_awb text null,
  delhivery_order_id text null,
  delhivery_tracking_url text null,
  delhivery_status text null default 'pending'::text,
  delhivery_raw_response jsonb null,
  delhivery_error text null,
  delhivery_last_tracking_update timestamp with time zone null,
  shipment_triggered_at timestamp with time zone null,
  escalation_done boolean null default false,
  claim_token text null,
  winner_email_sent_at timestamp with time zone null,
  razorpay_order_id text null,
  razorpay_payment_id text null,
  forfeited_bidder_ids uuid[] not null default '{}'::uuid[],
  constraint winners_pkey primary key (id),
  constraint winners_auction_id_size_key unique (auction_id, size),
  constraint fk_winners_auction foreign key (auction_id) references public.auctions (id) on delete cascade,
  constraint fk_winners_bidder foreign key (bidder_id) references public.bidders (id) on delete cascade,
  constraint check_winners_amount_positive check (winning_amount > 0::numeric)
) tablespace pg_default;

create index if not exists idx_winners_auction_id on public.winners using btree (auction_id) tablespace pg_default;
create index if not exists idx_winners_bidder_id on public.winners using btree (bidder_id) tablespace pg_default;
drop index if exists public.idx_winners_unique_auction;
create unique index if not exists winners_claim_token_key on public.winners using btree (claim_token) tablespace pg_default where claim_token is not null;
create unique index if not exists winners_razorpay_order_id_key on public.winners using btree (razorpay_order_id) tablespace pg_default where razorpay_order_id is not null;
create unique index if not exists winners_delhivery_order_id_key on public.winners using btree (delhivery_order_id) tablespace pg_default where delhivery_order_id is not null;

-- admin_settings table
create table if not exists public.admin_settings (
  id uuid not null default gen_random_uuid(),
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null default now(),
  updated_by text null,
  constraint admin_settings_pkey primary key (id),
  constraint admin_settings_key_unique unique (key)
) tablespace pg_default;

create index if not exists idx_admin_settings_key on public.admin_settings using btree (key) tablespace pg_default;

insert into public.admin_settings (key, value, updated_by)
values ('admin_emails', '[]'::jsonb, 'system')
on conflict (key) do nothing;

comment on table public.admin_settings is 'Stores system-wide admin settings including admin email addresses';
comment on column public.winners.forfeited_bidder_ids is 'Array of bidder UUIDs that have already forfeited payment for this auction/size winner slot. Used to prevent re-escalating to previously forfeited bidders.';
comment on column public.winners.shipping_address is 'Shipping address captured from winner at Pay and Claim step before payment.';
comment on column public.winners.shipping_address_submitted_at is 'Timestamp when winner shipping address was last submitted/updated.';
comment on column public.winners.delhivery_tracking_url is 'Delhivery tracking URL generated from AWB';
comment on column public.winners.delhivery_status is 'Delhivery shipment status: pending, created, failed';
comment on column public.winners.delhivery_raw_response is 'Raw Delhivery API response payload for audit/debug';
comment on column public.winners.delhivery_error is 'Last Delhivery shipment creation error for retry handling';
comment on column public.winners.delhivery_awb is 'Delhivery AWB (Air Waybill) number for tracking the shipment';
comment on column public.winners.shipment_triggered_at is 'Timestamp when Delhivery shipment creation was triggered after payment confirmation';
comment on column public.winners.delhivery_order_id is 'Stable unique shipment order reference used for Delhivery idempotency';
comment on column public.winners.delhivery_last_tracking_update is 'Timestamp of last Delhivery status/response update';

-- Realtime publication + row visibility policies
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'bids'
    ) then
      alter publication supabase_realtime add table public.bids;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'auctions'
    ) then
      alter publication supabase_realtime add table public.auctions;
    end if;
  end if;
end $$;

alter table public.bids enable row level security;
alter table public.auctions enable row level security;

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

-- Lightweight live snapshot function used by backend /auction/:id/live-state
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

commit;
