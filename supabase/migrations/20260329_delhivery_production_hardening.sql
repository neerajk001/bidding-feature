-- Delhivery production hardening: idempotency and tracking metadata

alter table public.winners
add column if not exists delhivery_order_id text null,
add column if not exists delhivery_last_tracking_update timestamp with time zone null;

create unique index if not exists winners_delhivery_order_id_key
on public.winners (delhivery_order_id)
where delhivery_order_id is not null;

comment on column public.winners.delhivery_order_id is 'Stable unique shipment order reference used for Delhivery idempotency';
comment on column public.winners.delhivery_last_tracking_update is 'Timestamp of last Delhivery status/response update';
