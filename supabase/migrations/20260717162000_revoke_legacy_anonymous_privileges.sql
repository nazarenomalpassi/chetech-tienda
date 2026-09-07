-- Stage 2: apply only after the storefront deployment uses the safe RPCs from
-- 20260717160500_add_safe_storefront_read_contract.sql.

revoke all on public.storefront_products, public.storefront_product_images, public.storefront_settings from anon;
revoke all on public.balance_transfers, public.repair_outsourcings from anon;

revoke execute on function public.generate_repair_access_number() from public, anon;
revoke execute on function public.resumen_caja_diario(date) from public, anon;
revoke execute on function public.set_tv_boards_updated_at() from public, anon;
revoke execute on function public.set_visits_updated_at() from public, anon;
revoke execute on function public.void_balance_transfer(uuid,text) from public, anon;
revoke execute on function private.enforce_technician_repair_update() from public, anon;
revoke execute on function private.enforce_technician_visit_update() from public, anon;
revoke execute on function private.handle_new_user_profile() from public, anon;

-- Public browsing is now limited to the two explicit RPC contracts.
grant execute on function public.get_storefront_products(uuid[],text[]) to anon;
grant execute on function public.get_storefront_catalog(text,text,text,text,integer,integer) to anon;
