-- Add Delhivery dispatch integration fields to winners table
-- Stores shipment lifecycle state and full API debug data for retries.

alter table public.winners
add column if not exists delhivery_tracking_url text null,
add column if not exists delhivery_status text null default 'pending',
add column if not exists delhivery_raw_response jsonb null,
add column if not exists delhivery_error text null;

comment on column public.winners.delhivery_tracking_url is 'Delhivery tracking URL generated from AWB';
comment on column public.winners.delhivery_status is 'Delhivery shipment status: pending, created, failed';
comment on column public.winners.delhivery_raw_response is 'Raw Delhivery API response payload for audit/debug';
comment on column public.winners.delhivery_error is 'Last Delhivery shipment creation error for retry handling';
