-- Remove legacy base64 data-URI media from auctions.
-- Media should be stored as public URLs (Supabase Storage/S3/etc), not inline blobs.

begin;

update public.auctions
set banner_image = null
where banner_image is not null
  and banner_image ~* '^data:[^;]+;base64,';

update public.auctions
set reel_url = null
where reel_url is not null
  and reel_url ~* '^data:[^;]+;base64,';

update public.auctions
set gallery_images = coalesce(
  (
    select array_agg(img)
    from unnest(coalesce(public.auctions.gallery_images, '{}'::text[])) as img
    where img !~* '^data:[^;]+;base64,'
  ),
  '{}'::text[]
)
where exists (
  select 1
  from unnest(coalesce(public.auctions.gallery_images, '{}'::text[])) as img
  where img ~* '^data:[^;]+;base64,'
);

commit;
