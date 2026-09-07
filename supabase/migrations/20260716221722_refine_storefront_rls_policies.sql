-- Keep anonymous catalog reads and authenticated administration in separate
-- policies so Postgres evaluates a single permissive SELECT path per role.

drop policy if exists storefront_products_public_read on public.storefront_products;
drop policy if exists storefront_products_admin_select on public.storefront_products;
create policy storefront_products_public_read on public.storefront_products
  for select to anon
  using (is_published and public_price > 0);
create policy storefront_products_admin_select on public.storefront_products
  for select to authenticated
  using ((select private.is_admin()));

drop policy if exists storefront_images_public_read on public.storefront_product_images;
create policy storefront_images_public_read on public.storefront_product_images
  for select to anon
  using (exists (
    select 1 from public.storefront_products p
    where p.id = storefront_product_id and p.is_published and p.public_price > 0
  ));

drop policy if exists storefront_settings_public_read on public.storefront_settings;
create policy storefront_settings_public_read on public.storefront_settings
  for select to anon
  using (is_public);
