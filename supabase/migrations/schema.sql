-- # auction schema
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
  banner_image text null,
  reel_url text null,
  base_price numeric null,
  gallery_images text[] null default '{}'::text[],
  available_sizes text[] null default '{}'::text[],
  constraint auctions_pkey primary key (id),
  constraint check_auctions_base_price_positive check (
    (
      (base_price is null)
      or (base_price > (0)::numeric)
    )
  ),
  constraint check_auctions_min_increment_positive check ((min_increment > (0)::numeric)),
  constraint check_auctions_status_valid check (
    (
      status = any (array['draft'::text, 'live'::text, 'ended'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_auctions_product_id on public.auctions using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_auctions_status on public.auctions using btree (status) TABLESPACE pg_default;

create index IF not exists idx_auctions_bidding_end_time on public.auctions using btree (bidding_end_time) TABLESPACE pg_default;

-- bidders table
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
  size text null,
  constraint bids_pkey primary key (id),
  constraint fk_bids_auction foreign KEY (auction_id) references auctions (id) on delete CASCADE,
  constraint fk_bids_bidder foreign KEY (bidder_id) references bidders (id) on delete CASCADE,
  constraint check_bids_amount_positive check ((amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_bids_auction_id on public.bids using btree (auction_id) TABLESPACE pg_default;

create index IF not exists idx_bids_bidder_id on public.bids using btree (bidder_id) TABLESPACE pg_default;

create index IF not exists idx_bids_amount on public.bids using btree (amount desc) TABLESPACE pg_default;

create index IF not exists idx_bids_created_at on public.bids using btree (created_at desc) TABLESPACE pg_default;

-- email_otp
create table public.email_otps (
  id uuid not null default gen_random_uuid (),
  email text not null,
  otp_code text not null,
  expires_at timestamp with time zone not null,
  attempts integer null default 0,
  verified boolean null default false,
  created_at timestamp with time zone null default now(),
  ip_address text null,
  user_agent text null,
  constraint email_otps_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_email_otps_email on public.email_otps using btree (email) TABLESPACE pg_default;

create index IF not exists idx_email_otps_expires on public.email_otps using btree (expires_at) TABLESPACE pg_default;

-- users table
create table public.users (
  id uuid not null default gen_random_uuid (),
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
) TABLESPACE pg_default;

create index IF not exists users_email_idx on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists users_phone_idx on public.users using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_users_email on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists idx_users_phone on public.users using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_users_phone_verified on public.users using btree (phone_verified) TABLESPACE pg_default;

-- winners table
create table public.winners (
  created_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  auction_id uuid null default gen_random_uuid (),
  bidder_id uuid null default gen_random_uuid (),
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
  constraint winners_pkey primary key (id),
  constraint winners_auction_id_size_key unique (auction_id, size),
  constraint fk_winners_auction foreign KEY (auction_id) references auctions (id) on delete CASCADE,
  constraint fk_winners_bidder foreign KEY (bidder_id) references bidders (id) on delete CASCADE,
  constraint check_winners_amount_positive check ((winning_amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_winners_auction_id on public.winners using btree (auction_id) TABLESPACE pg_default;

create index IF not exists idx_winners_bidder_id on public.winners using btree (bidder_id) TABLESPACE pg_default;

create unique INDEX IF not exists winners_claim_token_key on public.winners using btree (claim_token) TABLESPACE pg_default
where
  (claim_token is not null);

create unique INDEX IF not exists winners_razorpay_order_id_key on public.winners using btree (razorpay_order_id) TABLESPACE pg_default
where
  (razorpay_order_id is not null);

create unique INDEX IF not exists winners_delhivery_order_id_key on public.winners using btree (delhivery_order_id) TABLESPACE pg_default
where
  (delhivery_order_id is not null);
