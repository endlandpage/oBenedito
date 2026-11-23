-- Non-destructive gallery framing; NULL means the centered presentation.
begin;
alter table public.bene_gallery_photos add column crop jsonb;
alter table public.bene_gallery_photos add constraint bene_gallery_crop_valid check (
 case
  when crop is null then true
  when jsonb_typeof(crop) is distinct from 'object' then false
  when not (crop ?& array['x','y','zoom']) or (crop - array['x','y','zoom']) <> '{}'::jsonb then false
  when jsonb_typeof(crop->'x') is distinct from 'number' or jsonb_typeof(crop->'y') is distinct from 'number' or jsonb_typeof(crop->'zoom') is distinct from 'number' then false
  else (crop->>'x')::numeric between 0 and 100 and (crop->>'y')::numeric between 0 and 100 and (crop->>'zoom')::numeric between 1 and 3
 end
);
grant select(crop) on public.bene_gallery_photos to anon,authenticated;
create or replace view public.bene_gallery_public with(security_invoker=true) as
select id,case when seed_src is not null then seed_src else
 'https://hzjfcsedzqjwwkvutwvm.supabase.co/storage/v1/object/public/bene-gallery-public/'||public_path end as src,
 title,caption,alt,category,visible,position,crop from public.bene_gallery_photos where visible;

create or replace function public.bene_admin_save(p_actor uuid,p_session uuid,p_revision bigint,p_photos jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; item jsonb; idx integer:=0; item_id text;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 select revision into current_revision from public.bene_gallery_state where singleton for update;
 if current_revision<>p_revision then raise exception using errcode='P0001',message='revision_conflict';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'invalid photos';end if;
 if jsonb_array_length(p_photos)>100 then raise exception 'invalid photos';end if;
 if exists(select 1 from jsonb_array_elements(p_photos) p group by p->>'id' having count(*)>1) then raise exception 'duplicate photos';end if;
 for item in select value from jsonb_array_elements(p_photos) loop
  item_id:=item->>'id';
  if not exists(select 1 from public.bene_gallery_photos where id=item_id) then raise exception 'unknown photo';end if;
  if jsonb_typeof(item->'visible') is distinct from 'boolean' then raise exception 'invalid visible';end if;
  update public.bene_gallery_photos set title=item->>'title',caption=item->>'caption',alt=item->>'alt',
  category=item->>'category',visible=(item->>'visible')::boolean,position=idx,
  crop=case when item ? 'crop' then nullif(item->'crop','null'::jsonb) else crop end,
  public_path=case when seed_src is null and (item->>'visible')::boolean then item->>'public_path' else null end where id=item_id;
  idx:=idx+1;
 end loop;
 delete from public.bene_gallery_photos where id not in(select value->>'id' from jsonb_array_elements(p_photos));
 update public.bene_gallery_state set revision=revision+1 where singleton;
 return public.bene_admin_snapshot(p_actor,p_session);
end $$;
revoke all on function public.bene_admin_save(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bene_admin_save(uuid,uuid,bigint,jsonb) to service_role;
commit;
