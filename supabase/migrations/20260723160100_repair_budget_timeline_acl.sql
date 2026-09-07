-- Restore the authenticated execution path used by the SECURITY INVOKER
-- wrappers after replacing their private SECURITY DEFINER implementations.

revoke all on function private.get_my_customer_repair(uuid)
  from public, anon;
grant execute on function private.get_my_customer_repair(uuid)
  to authenticated;

revoke all on function private.get_my_customer_repairs_summary()
  from public, anon;
grant execute on function private.get_my_customer_repairs_summary()
  to authenticated;
