-- The public site never authenticates visitors. Keep the intake RPC available
-- only to the anonymous API role and reduce the exposed execution surface.

revoke execute on function public.submit_consumer_request(
  text,text,text,text,text,text,text,text,text,text,text
) from authenticated;

grant execute on function public.submit_consumer_request(
  text,text,text,text,text,text,text,text,text,text,text
) to anon;
