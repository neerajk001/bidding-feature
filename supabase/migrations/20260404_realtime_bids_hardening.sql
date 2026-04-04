-- Realtime hardening for bidder-facing auction updates.
-- Makes websocket behavior reproducible across environments (not dashboard-only).

-- Ensure realtime publication includes the tables we subscribe to.
do $$
begin
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
end $$;

-- Realtime uses row visibility. Keep read access explicit and stable.
alter table public.bids enable row level security;
alter table public.auctions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bids'
      and policyname = 'bids_public_read_for_realtime'
  ) then
    create policy bids_public_read_for_realtime
      on public.bids
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auctions'
      and policyname = 'auctions_public_read_for_realtime'
  ) then
    create policy auctions_public_read_for_realtime
      on public.auctions
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

