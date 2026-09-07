drop policy if exists "Deny client access to description backups"
  on private.storefront_description_backups;

create policy "Deny client access to description backups"
  on private.storefront_description_backups
  for all
  to anon, authenticated
  using (false)
  with check (false);
