-- winners 

create table public.winners (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  auction_id uuid null default gen_random_uuid (),
  bidder_id uuid null default gen_random_uuid (),
  winning_amount numeric null,
  declared_at timestamp with time zone not null default now(),
  constraint winners_pkey primary key (id),
  constraint fk_winners_auction foreign KEY (auction_id) references auctions (id) on delete CASCADE,
  constraint fk_winners_bidder foreign KEY (bidder_id) references bidders (id) on delete CASCADE,
  constraint check_winners_amount_positive check ((winning_amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_winners_auction_id on public.winners using btree (auction_id) TABLESPACE pg_default;

create index IF not exists idx_winners_bidder_id on public.winners using btree (bidder_id) TABLESPACE pg_default;

create unique INDEX IF not exists idx_winners_unique_auction on public.winners using btree (auction_id) TABLESPACE pg_default;

-- auction table
create table public.auctions (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  product_id text null,
  title text null,
  bidding_start_time timestamp with time zone null,
  bidding_end_time timestamp with time zone null,
  registration_end_time timestamp with time zone null,
  status text not null default '''upcoming'''::text,
  min_increment numeric not null default '50'::numeric,
  base_price numeric null,
  banner_image text null,
  reel_url text null,
  constraint auctions_pkey primary key (id),
  constraint check_auctions_min_increment_positive check ((min_increment > (0)::numeric)),
  constraint check_auctions_base_price_positive check ((base_price IS NULL OR base_price > (0)::numeric)),
  constraint check_auctions_status_valid check (
    (
      status = any (array['draft'::text, 'live'::text, 'ended'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_auctions_product_id on public.auctions using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_auctions_status on public.auctions using btree (status) TABLESPACE pg_default;

create index IF not exists idx_auctions_bidding_end_time on public.auctions using btree (bidding_end_time) TABLESPACE pg_default;

-- bidderss table
create table public.bidders (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  auction_id uuid null default gen_random_uuid (),
  name text null,
  phone text null,
  email text null,
  user_id uuid null,
  constraint bidders_pkey primary key (id),
  constraint bidders_user_id_fkey foreign KEY (user_id) references users (id),
  constraint fk_bidders_auction foreign KEY (auction_id) references auctions (id) on delete CASCADE,
  constraint fk_bidders_user foreign KEY (user_id) references users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_bidders_auction_id on public.bidders using btree (auction_id) TABLESPACE pg_default;

create index IF not exists idx_bidders_user_id on public.bidders using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_bidders_email on public.bidders using btree (email) TABLESPACE pg_default;

create index IF not exists idx_bidders_phone on public.bidders using btree (phone) TABLESPACE pg_default;

create unique INDEX IF not exists idx_bidders_unique_per_auction on public.bidders using btree (auction_id, email) TABLESPACE pg_default;


-- bids table
create table public.bids (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  auction_id uuid null default gen_random_uuid (),
  bidder_id uuid null default gen_random_uuid (),
  amount numeric null,
  constraint bids_pkey primary key (id),
  constraint fk_bids_auction foreign KEY (auction_id) references auctions (id) on delete CASCADE,
  constraint fk_bids_bidder foreign KEY (bidder_id) references bidders (id) on delete CASCADE,
  constraint check_bids_amount_positive check ((amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_bids_auction_id on public.bids using btree (auction_id) TABLESPACE pg_default;

create index IF not exists idx_bids_bidder_id on public.bids using btree (bidder_id) TABLESPACE pg_default;

create index IF not exists idx_bids_amount on public.bids using btree (amount desc) TABLESPACE pg_default;

create index IF not exists idx_bids_created_at on public.bids using btree (created_at desc) TABLESPACE pg_default;

-- users table (optional, if you want to link bidders to users)
create table public.users (
  id uuid not null default gen_random_uuid (),
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamp with time zone null default now(),
  phone_verified boolean null default false,
  otp_verified_at timestamp with time zone null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_phone_key unique (phone)
) TABLESPACE pg_default;

create index IF not exists users_email_idx on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists users_phone_idx on public.users using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_users_email on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists idx_users_phone on public.users using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_users_phone_verified on public.users using btree (phone_verified) TABLESPACE pg_default;