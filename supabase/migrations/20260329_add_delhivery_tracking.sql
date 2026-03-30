-- Add Delhivery tracking columns to winners table
-- These columns store AWB and shipment creation timestamp for reference
-- The delhivery_awb is populated when shipment is successfully created via Delhivery API

alter table public.winners
add column if not exists delhivery_awb text null,
add column if not exists shipment_triggered_at timestamp with time zone null;

-- Optional: Add comment documenting these columns
comment on column public.winners.delhivery_awb is 'Delhivery AWB (Air Waybill) number for tracking the shipment';
comment on column public.winners.shipment_triggered_at is 'Timestamp when Delhivery shipment creation was triggered after payment confirmation';
