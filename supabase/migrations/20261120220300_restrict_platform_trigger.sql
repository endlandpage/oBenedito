-- This platform-created event trigger does not need browser-role execution.
-- Keep the trigger itself and its automatic RLS behavior intact.
do $$
begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
